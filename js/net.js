'use strict';
/* Multiplayer: everyone who has this page open with the same world seed shares one world.
   Uses the claude.ai artifact "room" capability: each player's position and their latest
   block changes travel in their presence object. Without it the game is single-player. */

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
  room: null, wroom: null, roomName: null, peers: new Map(), seq: 0, ring: [], sendT: 0, unsub: null,
  nick: '', color: SHIRT_COLORS[0],

  async init() {
    let saved = '';
    try { saved = localStorage.getItem('blockrealm-nick') || ''; } catch (e) { /* no storage */ }
    this.nick = this.clean(saved) || 'Player' + (100 + Math.floor(Math.random() * 900));
    this.color = SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
    $('nick').value = this.nick;
    this.setStatus('connecting');
    let room = null;
    try { room = window.claude && window.claude.use ? await window.claude.use('room') : null; } catch (e) { room = null; }
    this.room = room;
    this.setStatus(room ? 'ready' : 'offline');
    if (room && G.state !== 'title' && G.seed !== undefined) this.joinWorld(G.seed);
  },

  clean(s) { return String(s || '').replace(/[^\w .-]/g, '').trim().slice(0, 16); },

  setNick(v) {
    const n = this.clean(v);
    if (!n) { $('nick').value = this.nick; return; }
    this.nick = n; $('nick').value = n;
    try { localStorage.setItem('blockrealm-nick', n); } catch (e) { /* no storage */ }
  },

  setStatus(s) {
    this.status = s;
    const el = $('net-status');
    el.textContent = {
      connecting: 'Checking for multiplayer...',
      offline: 'Multiplayer works when this game is opened from its claude.ai link.',
      ready: 'Multiplayer is on: friends who open this page and use the same seed join your world.',
      joined: 'Multiplayer is on.',
    }[s] || '';
    el.classList.toggle('on', s === 'ready' || s === 'joined');
  },

  roomFor(seed) { return 'world-' + (seed < 0 ? 'n' + (-seed) : String(seed)); },

  async joinWorld(seed) {
    if (!this.room) return;
    const name = this.roomFor(seed);
    if (this.roomName === name && this.wroom) return;
    await this.leave();
    this.roomName = name; this.seq = 0; this.ring = [];
    try {
      const r = await this.room.join(name);
      if (this.roomName !== name) { r.leave().catch(() => {}); return; }
      this.wroom = r;
      this.unsub = r.onPeers(ch => this.onPeers(ch), () => { this.wroom = null; this.clearPeers(); });
      this.setStatus('joined');
    } catch (e) {
      this.wroom = null;
    }
  },

  async leave() {
    const r = this.wroom;
    this.wroom = null; this.roomName = null;
    if (this.unsub) { this.unsub(); this.unsub = null; }
    this.clearPeers();
    if (r) { try { await r.leave(); } catch (e) { /* already gone */ } }
    if (this.room) this.setStatus('ready');
  },

  clearPeers() {
    for (const rp of this.peers.values()) this.removeModel(rp);
    this.peers.clear();
    this.updateHud();
  },

  edit(dim, x, y, z, id) {
    if (!this.wroom) return;
    this.seq++;
    this.ring.push([this.seq, dim === 'nether' ? 1 : 0, x, y, z, id]);
    if (this.ring.length > 64) this.ring.shift();
    this.sendT = Math.min(this.sendT, 0.03);
  },

  names() { return [...this.peers.values()].filter(p => p.name).map(p => p.name); },

  tick(dt) {
    if (!this.wroom) return;
    const P = G.player;
    this.sendT -= dt;
    if (this.sendT <= 0 && G.state !== 'title') {
      this.sendT = 0.1;
      const held = P.heldSlot();
      this.wroom.presence({
        v: 1, n: this.nick, c: this.color, d: G.dim === 'nether' ? 1 : 0,
        p: [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z)], r: [r3(P.yaw), r3(P.pitch)],
        s: r2(P.swing), h: held ? held.id : 0, x: P.dead ? 1 : 0, e: this.ring,
      }).catch(() => {});
    }
    for (const rp of this.peers.values()) {
      if (!rp.model || !rp.target) continue;
      const show = rp.dim === G.dim && !rp.dead && G.state !== 'title';
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
    for (const p of ch.peers) if (!p.sameTab) this.handle(p);
    for (const p of ch.left) {
      const rp = this.peers.get(p.peer);
      if (!rp) continue;
      if (rp.name) G.ui.message(rp.name + ' left the world');
      this.removeModel(rp);
      this.peers.delete(p.peer);
    }
    this.updateHud();
  },

  handle(peer) {
    const pr = peer.presence;
    if (!pr || pr.v !== 1) return;
    let rp = this.peers.get(peer.peer);
    if (!rp) { rp = { peer: peer.peer, last: 0, model: null, name: '' }; this.peers.set(peer.peer, rp); }
    if (rp.pres === pr) return;
    rp.pres = pr;
    const name = this.clean(pr.n) || 'Player';
    if (!rp.name) G.ui.message(name + ' joined your world!', 'gold');
    if (name !== rp.name && rp.model) { this.removeModel(rp); }
    rp.name = name;
    const pos = Array.isArray(pr.p) && pr.p.length === 3 && pr.p.every(Number.isFinite) ? pr.p : null;
    const rot = Array.isArray(pr.r) && pr.r.length === 2 && pr.r.every(Number.isFinite) ? pr.r : [0, 0];
    rp.dim = pr.d === 1 ? 'nether' : 'overworld';
    rp.dead = pr.x === 1;
    rp.yaw = rot[0]; rp.pitch = clamp(rot[1], -1.6, 1.6);
    rp.swing = Number.isFinite(pr.s) ? clamp(pr.s, 0, 1) : 0;
    if (pos) {
      const first = !rp.target;
      rp.target = pos;
      if (!rp.model) this.makeModel(rp, SHIRT_COLORS.includes(pr.c) ? pr.c : SHIRT_COLORS[0]);
      if (first) rp.model.group.position.set(pos[0], pos[1], pos[2]);
    }
    if (Array.isArray(pr.e) && G.worlds) {
      let top = rp.last;
      for (const e of pr.e) {
        if (!Array.isArray(e) || e.length !== 6 || !e.every(isInt)) continue;
        const [sq, d, x, y, z, id] = e;
        if (sq <= rp.last || id < 0 || id >= 128 || !DEFS[id] || DEFS[id].liquid && id !== ID.water) continue;
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

  removeModel(rp) {
    if (rp.model) { G.scene.remove(rp.model.group); rp.model = null; }
  },

  updateHud() {
    const n = this.names().length;
    const el = $('online');
    el.hidden = !n;
    el.textContent = n === 1 ? '1 friend online' : n + ' friends online';
  },
};
