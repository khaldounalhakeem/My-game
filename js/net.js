'use strict';
/* Multiplayer: everyone who has this page open shares one claude.ai "room". Each player's
   presence says which world (seed) they are in, where they stand, and their latest block
   changes; players in the same world see each other. Without the room the game is single-player. */

const SHIRT_COLORS = [0x2fb5c8, 0xd8452b, 0x46a83a, 0xe8b320, 0x8a4ad0, 0xe86aa8, 0xf08a24, 0x3a6ad8];
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const isInt = v => Number.isInteger(v) && Math.abs(v) < 3e7;

function nameTag(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const x = c.getContext('2d');
  x.font = '28px VT323, monospace';
  const w = Math.min(250, x.measureText(text).width + 20);
  x.fillStyle = 'rgba(0,0,0,0.55)';
  x.fillRect((256 - w) / 2, 4, w, 40);
  x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 25);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(2.2, 0.41, 1);
  s.renderOrder = 5;
  return s;
}

const Net = {
  room: null, perms: null, status: 'connecting', error: '', connected: false,
  world: null, peers: new Map(), others: [], seq: 0, ring: [], sendT: 0,
  nick: '', color: SHIRT_COLORS[0],

  async init() {
    let saved = '';
    try { saved = localStorage.getItem('blockrealm-nick') || ''; } catch (e) { /* no storage */ }
    this.nick = this.clean(saved) || 'Player' + (100 + Math.floor(Math.random() * 900));
    this.color = SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
    $('nick').value = this.nick;
    $('net-btn').addEventListener('click', () => this.onButton());
    this.render();
    const use = name => (window.claude && window.claude.use ? window.claude.use(name).catch(() => null) : Promise.resolve(null));
    const [room, perms] = await Promise.all([use('room'), use('permissions')]);
    this.room = room; this.perms = perms;
    if (!room) { this.status = 'unavailable'; this.render(); return; }
    room.onPeers(ch => this.onPeers(ch), e => this.fail(e));
    room.onConnection(c => { this.connected = c; this.render(); }, e => this.fail(e));
    const st = perms ? await perms.state('room').catch(() => 'granted') : 'granted';
    if (st === 'denied') { this.status = 'denied'; this.render(); return; }
    if (st === 'unavailable') { this.status = 'unavailable'; this.render(); return; }
    this.status = st === 'prompt' ? 'prompt' : 'on';
    if (this.status === 'on') this.announce();
    this.render();
  },

  fail(e) {
    const code = e && e.code;
    if (code === 'not_granted' || code === 'revoked' || code === 'capability_disabled' || code === 'capability_removed') this.status = 'unavailable';
    this.error = code || 'error';
    this.render();
  },

  /* the title-screen button: ask permission, or open the permissions panel */
  async onButton() {
    if (!this.perms) return;
    if (this.status === 'denied') {
      try { await this.perms.manage(); } catch (e) { G.ui.message('Open the Permissions menu at the top of this page and switch multiplayer on.'); }
    }
    await this.askPermission();
  },

  async askPermission() {
    if (!this.room || this.status === 'on' || this.status === 'unavailable') return;
    let st = 'granted';
    if (this.perms) { try { st = (await this.perms.request(['room'])).room || 'granted'; } catch (e) { st = 'granted'; } }
    this.status = st === 'denied' ? 'denied' : st === 'unavailable' ? 'unavailable' : 'on';
    if (this.status === 'on') this.announce();
    this.render();
  },

  clean(s) { return String(s || '').replace(/[^\w .-]/g, '').trim().slice(0, 16); },

  setNick(v) {
    const n = this.clean(v);
    if (!n) { $('nick').value = this.nick; return; }
    this.nick = n; $('nick').value = n;
    try { localStorage.setItem('blockrealm-nick', n); } catch (e) { /* no storage */ }
    this.announce();
  },

  worldKey(seed) { return 'w' + String(seed); },

  joinWorld(seed) {
    const key = this.worldKey(seed);
    if (this.world !== key) { this.world = key; this.ring = []; this.clearModels(); }
    this.askPermission();
    this.announce();
    this.recheck();
  },

  leave() {
    this.world = null; this.ring = [];
    this.clearModels();
    this.announce();
    this.recheck();
  },

  /* our own world changed: look at everyone again */
  recheck() {
    if (!this.room) return;
    for (const p of this.room.peers()) {
      if (p.sameTab) continue;
      const rp = this.peers.get(p.peer);
      if (rp) rp.pres = undefined;
      this.handle(p);
    }
    this.render();
  },

  /* send who we are and where; in a world this is refreshed ten times a second by tick() */
  announce() {
    if (!this.room || this.status !== 'on') return;
    const base = { v: 2, n: this.nick, c: this.color, w: this.world };
    if (this.world && G.player) {
      const P = G.player, held = P.heldSlot();
      Object.assign(base, {
        d: G.dim === 'nether' ? 1 : 0, p: [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z)], r: [r3(P.yaw), r3(P.pitch)],
        s: r2(P.swing), h: held ? held.id : 0, x: P.dead ? 1 : 0, e: this.ring,
      });
    } else Object.assign(base, { d: null, p: null, r: null, s: null, h: null, x: null, e: null });
    this.room.presence(base).then(() => { if (this.error) { this.error = ''; this.render(); } }, e => this.fail(e));
  },

  edit(dim, x, y, z, id) {
    if (!this.world) return;
    this.seq++;
    this.ring.push([this.seq, dim === 'nether' ? 1 : 0, x, y, z, id]);
    if (this.ring.length > 60) this.ring.shift();
    this.sendT = Math.min(this.sendT, 0.03);
  },

  names() { return [...this.peers.values()].filter(p => p.name && p.inWorld).map(p => p.name); },

  tick(dt) {
    if (!this.room || this.status !== 'on' || !this.world) return;
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = 0.1; this.announce(); }
    for (const rp of this.peers.values()) {
      if (!rp.model || !rp.target) continue;
      const show = rp.inWorld && rp.dim === G.dim && !rp.dead && G.state !== 'title';
      rp.model.group.visible = show;
      if (!show) continue;
      const g = rp.model.group, k = Math.min(1, dt * 10);
      const ox = g.position.x, oz = g.position.z;
      g.position.x += (rp.target[0] - g.position.x) * k;
      g.position.y += (rp.target[1] - g.position.y) * k;
      g.position.z += (rp.target[2] - g.position.z) * k;
      let d = rp.yaw + Math.PI - g.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y += d * k;
      const speed = Math.hypot(g.position.x - ox, g.position.z - oz) / Math.max(dt, 0.001);
      rp.walk = (rp.walk || 0) + speed * dt * 3.2;
      const sw = Math.sin(rp.walk) * Math.min(1, speed / 4) * 0.8;
      const parts = rp.model.parts;
      parts.legs[0].rotation.x = sw; parts.legs[1].rotation.x = -sw;
      parts.arms[0].rotation.x = -sw; parts.arms[1].rotation.x = sw - Math.sin((rp.swing || 0) * Math.PI) * 1.4;
      parts.head.rotation.x = -rp.pitch * 0.8;
    }
  },

  onPeers(ch) {
    const seen = new Set();
    for (const p of ch.peers) {
      if (p.sameTab) continue;
      seen.add(p.peer);
      this.handle(p);
    }
    for (const [id, rp] of this.peers) {
      if (seen.has(id)) continue;
      if (rp.inWorld && rp.name) G.ui.message(rp.name + ' left the world');
      this.removeModel(rp);
      this.peers.delete(id);
    }
    this.render();
  },

  handle(peer) {
    const pr = peer.presence;
    let rp = this.peers.get(peer.peer);
    if (!rp) { rp = { peer: peer.peer, last: 0, model: null, name: '', inWorld: false }; this.peers.set(peer.peer, rp); }
    if (rp.pres === pr) return;
    rp.pres = pr;
    if (!pr || pr.v !== 2) { rp.name = ''; rp.world = null; rp.inWorld = false; this.removeModel(rp); return; }
    const name = this.clean(pr.n) || 'Player';
    if (name !== rp.name) this.removeModel(rp);
    rp.name = name;
    rp.world = typeof pr.w === 'string' ? pr.w.slice(0, 24) : null;
    const wasIn = rp.inWorld;
    rp.inWorld = !!this.world && rp.world === this.world && G.state !== 'title';
    if (!rp.inWorld) { this.removeModel(rp); if (wasIn) G.ui.message(name + ' left the world'); return; }
    if (!wasIn) G.ui.message(name + ' joined your world!', 'gold');
    const pos = Array.isArray(pr.p) && pr.p.length === 3 && pr.p.every(Number.isFinite) ? pr.p : null;
    const rot = Array.isArray(pr.r) && pr.r.length === 2 && pr.r.every(Number.isFinite) ? pr.r : [0, 0];
    rp.dim = pr.d === 1 ? 'nether' : 'overworld';
    rp.dead = pr.x === 1;
    rp.yaw = rot[0]; rp.pitch = clamp(rot[1], -1.6, 1.6);
    rp.swing = Number.isFinite(pr.s) ? clamp(pr.s, 0, 1) : 0;
    if (pos) {
      const first = !rp.model;
      rp.target = pos;
      if (!rp.model) this.makeModel(rp, SHIRT_COLORS.includes(pr.c) ? pr.c : SHIRT_COLORS[0]);
      if (first) rp.model.group.position.set(pos[0], pos[1], pos[2]);
    }
    if (Array.isArray(pr.e) && G.worlds) {
      let top = rp.last;
      for (const e of pr.e) {
        if (!Array.isArray(e) || e.length !== 6 || !e.every(isInt)) continue;
        const [sq, d, x, y, z, id] = e;
        if (sq <= rp.last || id < 0 || id >= 128 || !DEFS[id] || (DEFS[id].liquid && id !== ID.water)) continue;
        G.worlds[d === 1 ? 'nether' : 'overworld'].applyRemote(x, y, z, id);
        if (sq > top) top = sq;
      }
      rp.last = top;
    }
  },

  makeModel(rp, color) {
    const m = buildMobModel('player');
    m.group.traverse(o => { if (o.isMesh) for (const mat of [].concat(o.material)) if (mat.color && mat.color.getHex() === 0x2fb5c8) mat.color.setHex(color); });
    const tag = nameTag(rp.name);
    tag.position.set(0, 2.25, 0);
    m.group.add(tag);
    G.scene.add(m.group);
    rp.model = m;
  },

  removeModel(rp) { if (rp.model) { G.scene.remove(rp.model.group); rp.model = null; rp.last = 0; } },
  clearModels() { for (const rp of this.peers.values()) { this.removeModel(rp); rp.inWorld = false; } },

  /* everyone else on the page, for the title screen and pause menu */
  describeOthers() {
    const list = [...this.peers.values()].filter(p => p.name);
    if (!list.length) return 'Nobody else has the game open right now.';
    return 'Online now: ' + list.map(p => p.name + (p.world ? ' (seed ' + p.world.slice(1) + ')' : ' (on the title screen)')).join(', ') + '.';
  },

  render() {
    const el = $('net-status'), btn = $('net-btn');
    const msgs = {
      connecting: 'Connecting to multiplayer...',
      unavailable: 'Multiplayer can\'t connect here. Every player must be signed in to claude.ai, and the game must be shared with each friend by inviting them (Share, then add their email). People opening a public link play alone.',
      prompt: 'Multiplayer needs your OK before it can connect.',
      denied: 'Multiplayer is switched off for this game.',
    };
    let text = msgs[this.status] || '';
    if (this.status === 'on') {
      text = (this.connected ? 'Multiplayer is on. ' : 'Multiplayer is reconnecting... ') + this.describeOthers();
      text += ' To play together, everyone types the same world seed, then picks Survival or Creative.';
    }
    if (this.error && this.status !== 'unavailable') text += ' (connection problem: ' + this.error + ')';
    el.textContent = text;
    el.classList.toggle('on', this.status === 'on' && this.connected);
    btn.hidden = !(this.status === 'prompt' || (this.status === 'denied' && this.perms));
    btn.textContent = this.status === 'denied' ? 'Open permissions' : 'Turn on multiplayer';
    const n = this.names().length;
    const on = $('online');
    on.hidden = !n || G.state === 'title';
    on.textContent = n === 1 ? '1 friend in your world' : n + ' friends in your world';
  },
};
