'use strict';
/* Multiplayer: everyone who has this page open shares one claude.ai "room". Each player's
   presence says which world (seed) they are in, where they stand, and their latest block
   changes; players in the same world see each other. Without the room the game is single-player. */

const SHIRT_COLORS = [0x2fb5c8, 0xd8452b, 0x46a83a, 0xe8b320, 0x8a4ad0, 0xe86aa8, 0xf08a24, 0x3a6ad8];
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const DIMS = ['overworld', 'nether', 'end'], dimCode = d => Math.max(0, DIMS.indexOf(d));
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

/* Internet multiplayer for the stand-alone website: talks to free public MQTT servers and
   offers the same calls as the claude.ai room (presence, onPeers, onConnection, peers).
   Players are grouped by world seed, so only people who type the same seed meet. */
const INTERNET_BROKERS = window.BLOCKREALM_BROKERS || ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const TOPIC_PREFIX = 'blockrealm/v2/';
function makeInternetRoom(brokers) {
  const me = 'p' + Math.random().toString(36).slice(2, 10);
  const peers = new Map(), lastSeen = new Map(), peerL = [], connL = [];
  const clients = [];
  let topic = null, mine = Object.freeze({}), connected = false, lastPub = 0, pubTimer = null, fireT = null;
  const stats = { got: 0 };
  const snapshot = () => [...peers.values(), Object.freeze({ peer: me, sameTab: true, isMe: true, kind: 'viewer', presence: mine })];
  const fire = () => {
    if (fireT) return;
    fireT = setTimeout(() => { fireT = null; const all = snapshot(); for (const f of peerL) f({ peers: all, joined: [], left: [], updated: all }); }, 50);
  };
  const updateConn = () => {
    const c = clients.some(x => x.connected);
    if (c !== connected) { connected = c; for (const f of connL) f(c); }
  };
  const sendNow = () => {
    pubTimer = null;
    if (!topic) return;
    lastPub = Date.now();
    const body = JSON.stringify(mine);
    for (const c of clients) if (c.connected) c.publish(TOPIC_PREFIX + topic + '/' + me, body, { qos: 0 });
  };
  const schedule = () => {
    if (pubTimer) return;
    pubTimer = setTimeout(sendNow, Math.max(0, 200 - (Date.now() - lastPub)));
  };
  const onMessage = (t, buf) => {
    if (!topic || !t.startsWith(TOPIC_PREFIX + topic + '/')) return;
    const pid = t.slice(t.lastIndexOf('/') + 1);
    if (pid === me || !/^p[a-z0-9]{1,12}$/.test(pid)) return;
    if (!buf || !buf.length) { if (peers.delete(pid)) fire(); lastSeen.delete(pid); return; }
    if (buf.length > 65536) return;
    const raw = buf.toString();
    lastSeen.set(pid, Date.now());
    stats.got++;
    const prev = peers.get(pid);
    if (prev && prev.raw === raw) return; // the same message arriving through the second server
    let obj;
    try { obj = JSON.parse(raw); } catch (e) { return; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    peers.set(pid, Object.freeze({ peer: pid, sameTab: false, isMe: false, kind: 'viewer', raw, presence: Object.freeze(obj) }));
    fire();
  };
  for (const url of brokers) {
    try {
      const c = mqtt.connect(url, { clientId: 'br_' + me + '_' + clients.length, keepalive: 20, reconnectPeriod: 3000, connectTimeout: 10000, clean: true });
      c.on('connect', () => { updateConn(); if (topic) { c.subscribe(TOPIC_PREFIX + topic + '/+'); schedule(); } });
      c.on('close', updateConn); c.on('offline', updateConn); c.on('error', () => {});
      c.on('message', onMessage);
      c.label = url.includes('emqx') ? 'emqx' : url.includes('hivemq') ? 'hivemq' : url.includes('mosquitto') ? 'mosq' : 'srv' + clients.length;
      clients.push(c);
    } catch (e) { /* this server could not start; the other one may still work */ }
  }
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [pid, t] of lastSeen) if (now - t > 7000) { lastSeen.delete(pid); peers.delete(pid); changed = true; }
    if (changed) fire();
    if (topic && now - lastPub > 1500) schedule();
    updateConn();
  }, 1000);
  window.addEventListener('pagehide', () => { if (topic) for (const c of clients) if (c.connected) c.publish(TOPIC_PREFIX + topic + '/' + me, '', { qos: 0 }); });
  return {
    internet: true,
    servers() { return clients.map(c => c.label + (c.connected ? ' ok' : ' no')).join(' ') + ' · got ' + stats.got; },
    presence(patch) {
      const next = Object.assign({}, mine);
      for (const k in patch) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
      mine = Object.freeze(next);
      schedule();
      return Promise.resolve();
    },
    onPeers(f) { peerL.push(f); fire(); return () => {}; },
    onConnection(f) { connL.push(f); setTimeout(() => f(connected), 0); return () => {}; },
    peers: snapshot,
    connected: () => connected,
    setTopic(key) {
      if (key === topic) return;
      for (const c of clients) if (c.connected && topic) { c.publish(TOPIC_PREFIX + topic + '/' + me, '', { qos: 0 }); c.unsubscribe(TOPIC_PREFIX + topic + '/+'); }
      topic = key;
      peers.clear(); lastSeen.clear();
      for (const c of clients) if (c.connected && topic) c.subscribe(TOPIC_PREFIX + topic + '/+');
      fire();
      if (topic) schedule();
    },
  };
}

/* Backup multiplayer through the artifact's claude.ai database: each device keeps one document
   per world with its latest presence (about two writes a second while moving) and watches the
   others. It works wherever the viewer may write the database, e.g. the owner on all their devices. */
function deviceId() {
  let id = '';
  try { id = localStorage.getItem('blockrealm-device') || ''; } catch (e) { /* no storage */ }
  if (!/^d[a-z0-9]{6,16}$/.test(id)) {
    id = 'd' + Math.random().toString(36).slice(2, 12);
    try { localStorage.setItem('blockrealm-device', id); } catch (e) { /* no storage */ }
  }
  return id;
}
function makeDbRoom(db, me) {
  const dev = deviceId();
  const peers = new Map(), peerL = [], connL = [];
  let topic = null, unsub = null, mine = {}, writing = false, lastBody = '', lastWrite = 0, connected = false, fireT = null;
  const status = { ok: 0, err: '', others: 0, readErr: '' };
  const setConn = c => { if (c !== connected) { connected = c; for (const f of connL) f(c); } };
  const snapshot = () => [...peers.values(), { peer: me, sameTab: true, isMe: true, kind: 'viewer', presence: mine }];
  const fire = () => { if (fireT) return; fireT = setTimeout(() => { fireT = null; const all = snapshot(); for (const f of peerL) f({ peers: all, joined: [], left: [], updated: all }); }, 30); };
  const players = t => db.collection('mp/' + t + '/players');
  async function flush() {
    if (writing || !topic) return;
    const now = Date.now(), body = JSON.stringify(mine);
    if (now - lastWrite < 300 || (body === lastBody && now - lastWrite < 5000)) return;
    writing = true; lastBody = body; lastWrite = now;
    const t = topic;
    try { await players(t).doc(dev).set(Object.assign({}, mine, { t: now })); status.ok++; status.err = ''; setConn(true); }
    catch (e) { status.err = (e && e.code) || 'error'; }
    writing = false;
  }
  setInterval(flush, 150);
  function subscribe() {
    if (unsub) { unsub(); unsub = null; }
    peers.clear(); fire();
    if (!topic) return;
    const subTopic = topic;
    unsub = players(topic).onSnapshot(snap => {
      if (subTopic !== topic) return; // a late answer for a world we already left
      setConn(true); status.readErr = '';
      peers.clear();
      const now = Date.now();
      for (const d of snap.docs) {
        if (d.id === dev) continue;
        const b = d.data();
        if (!b || now - (+b.t || 0) > 60000) continue; // gone for a minute: treat as left
        const id = typeof b.u === 'string' ? b.u : d.id;
        peers.set(id, { peer: id, sameTab: false, isMe: false, kind: 'viewer', presence: b });
      }
      status.others = peers.size;
      fire();
    }, e => { status.readErr = (e && e.code) || 'error'; setConn(false); });
  }
  window.addEventListener('pagehide', () => { if (topic) players(topic).doc(dev).delete().catch(() => {}); });
  return {
    status, dev,
    presence(patch) {
      const next = Object.assign({}, mine);
      for (const k in patch) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
      mine = next;
      return Promise.resolve();
    },
    onPeers(f) { peerL.push(f); fire(); return () => {}; },
    onConnection(f) { connL.push(f); setTimeout(() => f(connected), 0); return () => {}; },
    peers: snapshot,
    connected: () => connected,
    setTopic(key) {
      if (key === topic) return;
      if (topic) players(topic).doc(dev).delete().catch(() => {});
      topic = key; lastBody = ''; lastWrite = 0;
      subscribe();
    },
  };
}

/* several connections at once (the claude.ai room and the database): what one sends goes out on all,
   and players are matched up by the id inside their presence, so nobody shows up twice */
function makeMultiRoom(rooms, me) {
  const lists = rooms.map(() => []), peerL = [];
  let fireT = null;
  const merged = () => {
    const out = new Map();
    lists.forEach(list => {
      for (const p of list) {
        if (p.sameTab) continue;
        const pr = p.presence || {};
        const id = typeof pr.u === 'string' ? pr.u : p.peer;
        if (id === me) continue;
        if (!out.has(id) || (pr.p && !(out.get(id).presence || {}).p)) out.set(id, { peer: id, sameTab: false, isMe: false, kind: 'viewer', presence: pr });
      }
    });
    return [...out.values(), { peer: me, sameTab: true, isMe: true, kind: 'viewer', presence: {} }];
  };
  const fire = () => { if (fireT) return; fireT = setTimeout(() => { fireT = null; const all = merged(); for (const f of peerL) f({ peers: all, joined: [], left: [], updated: all }); }, 30); };
  rooms.forEach((r, i) => r.onPeers(ch => { lists[i] = ch.peers || []; fire(); }, () => { lists[i] = []; fire(); }));
  return {
    rooms,
    presence(patch) {
      // fine as long as at least one connection took it
      return Promise.allSettled(rooms.map(r => r.presence(patch))).then(res => {
        if (res.every(x => x.status === 'rejected')) throw res[0].reason;
      });
    },
    onPeers(f) { peerL.push(f); fire(); return () => {}; },
    onConnection(f, err) { let state = rooms.map(() => false); rooms.forEach((r, i) => r.onConnection(c => { state[i] = c; f(state.some(Boolean)); }, err)); return () => {}; },
    peers: merged,
    connected: () => rooms.some(r => r.connected()),
    setTopic(key) { for (const r of rooms) if (r.setTopic) r.setTopic(key); },
  };
}

const Net = {
  room: null, perms: null, status: 'connecting', error: '', connected: false,
  world: null, peers: new Map(), others: [], seq: 0, ring: [], sendT: 0, hits: [], hitSeq: 0, blasts: [], blastSeq: 0,
  ringMax: 40, sendOk: 0, idSeq: 0, mobHits: [], mhSeq: 0, dropRing: [], drSeq: 0, pickRing: [], pkSeq: 0, askRing: [], askSeq: 0, giveRing: [], giveSeq: 0, gotDrops: new Set(), seenDrops: new Set(), pickedDrops: new Set(), sendErr: '', heardAt: 0, rawPeers: 0,
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
    let [room, perms] = await Promise.all([use('room'), use('permissions')]);
    if (!room && window.mqtt && location.protocol !== 'file:') {
      // stand-alone website: use the public internet servers instead of claude.ai
      try { room = makeInternetRoom(INTERNET_BROKERS); perms = null; this.internet = true; } catch (e) { room = null; }
    }
    this.uid = 'u' + Math.random().toString(36).slice(2, 12);
    if (!this.internet) {
      // add the database as a second way to reach your other devices and invited friends
      const db = await use('db');
      if (db) {
        this.dbRoom = makeDbRoom(db, this.uid);
        this.lobby = room;
        room = room ? makeMultiRoom([room, this.dbRoom], this.uid) : this.dbRoom;
        perms = room === this.dbRoom ? null : perms;
        this.startDeviceReport(db);
      }
    }
    this.room = room; this.perms = perms;
    $('web-link').hidden = !!this.internet;
    if (!room) { this.status = 'unavailable'; this.render(); return; }
    room.onPeers(ch => this.onPeers(ch), e => this.fail(e));
    room.onConnection(c => { this.connected = c; this.render(); }, e => this.fail(e));
    const st = perms ? await perms.state('room').catch(() => 'granted') : 'granted';
    if (st === 'denied') { this.status = 'denied'; this.render(); return; }
    // try to connect right away; claude.ai asks for permission itself if it needs to
    this.status = 'on';
    this.announce();
    this.render();
  },

  fail(e) {
    const code = e && e.code;
    if (code === 'not_granted' || code === 'revoked' || code === 'capability_disabled' || code === 'capability_removed') this.status = 'unavailable';
    if (code === 'denied' || code === 'permission_denied') this.status = 'denied';
    this.error = code || 'error';
    this.render();
  },

  /* the title-screen button: ask permission, or open the permissions panel */
  async onButton() {
    if (!this.perms) return;
    if (this.status === 'denied') {
      try { await this.perms.manage(); } catch (e) { G.ui.message('Open the Permissions menu at the top of this page and switch multiplayer on.'); }
    }
    this.status = 'prompt';
    await this.askPermission();
  },

  async askPermission() {
    if (!this.room || this.status === 'on' || this.status === 'unavailable' || !this.perms) return;
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
    this.joinedAt = Date.now();
    if (this.room && this.room.setTopic) this.room.setTopic(key);
    this.askPermission();
    this.announce();
    this.recheck();
  },

  leave() {
    this.world = null; this.ring = [];
    if (this.room && this.room.setTopic) this.room.setTopic(null);
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
    const base = { v: 2, u: this.uid, n: this.nick, c: this.color, w: this.world, sk: G.skin || 0 };
    if (this.world && G.player) {
      const P = G.player, held = P.heldSlot(), now = Date.now();
      this.trail = this.trail || [];
      const lastS = this.trail[this.trail.length - 1];
      if (!lastS || now - lastS[0] >= 90) {
        this.trail.push([now, r2(P.pos.x), r2(P.pos.y), r2(P.pos.z), r3(P.yaw)]);
        if (this.trail.length > 8) this.trail.shift();
      }
      base.ts = now;
      // shared time of day: what time it is here, when we joined, and when someone last changed it
      base.tm = Math.round(G.time * 100000) / 100000; base.tj = this.joinedAt || now; base.te = G.timeEventAt || 0;
      base.tr = this.trail.map(s => [s[0] - now, s[1], s[2], s[3], s[4]]);
      Object.assign(base, {
        m: P.mode === 'creative' ? 1 : 0, d: dimCode(G.dim), p: [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z)], r: [r3(P.yaw), r3(P.pitch)],
        s: r2(P.swing), h: held ? held.id : 0, x: P.dead ? 1 : 0, e: this.ring, a: this.hits,
        sl: P.sleeping ? 1 : 0,
        ar: [36, 37, 38, 39].map(i => (P.inv.slots[i] ? P.inv.slots[i].id : 0)), ex: this.blasts,
        mb: this.slim ? null : this.ownedMobs(), mh: this.mobHits, dr: this.slim ? null : this.dropRing, pk: this.slim ? null : this.pickRing,
        rq: this.slim ? null : this.askRing, gv: this.slim ? null : this.giveRing,
      });
    } else Object.assign(base, { ar: null, ex: null, m: null, d: null, p: null, r: null, s: null, h: null, x: null, e: null, a: null, mb: null, mh: null, dr: null, pk: null, rq: null, gv: null });
    this.room.presence(base).then(() => {
      this.sendOk++;
      if (this.sendErr || this.error) { this.sendErr = ''; this.error = ''; this.render(); }
    }, e => {
      const code = (e && e.code) || 'error';
      if (code === 'invalid_argument') this.slim = true; // too big for this connection: leave out the shared world
      if (code === 'invalid_argument' && this.ringMax > 4) {
        // too big for the platform: share fewer recent block changes
        this.ringMax = Math.max(4, this.ringMax >> 1);
        this.ring = this.ring.slice(-this.ringMax);
      }
      if (this.sendErr !== code) { this.sendErr = code; this.render(); }
      this.fail(e);
    });
  },

  edit(dim, x, y, z, id) {
    if (!this.world) return;
    this.seq++;
    this.ring.push([this.seq, dimCode(dim), x, y, z, id]);
    while (this.ring.length > this.ringMax) this.ring.shift();
    this.sendT = Math.min(this.sendT, 0.03);
  },

  myPeer() {
    if (!this.room) return null;
    const me = this.room.peers().find(p => p.sameTab);
    return me ? me.peer : null;
  },

  /* punch another player: they read it from our presence and take the damage themselves */
  hit(rp, dmg, kb, cause) {
    this.hitSeq++;
    const h = [String(rp.peer), this.hitSeq, dmg, kb];
    if (cause) h.push(String(cause).slice(0, 80));
    this.hits.push(h);
    if (this.hits.length > 12) this.hits.shift();
    this.sendT = 0;
    if (cause) return; // a mob or explosion hit: no red flash or punch sound from us
    rp.flashT = 0.3;
    G.sound.play('hurtMob', rp.model ? rp.model.group.position : null);
    if (rp.model) { const q = rp.model.group.position; G.particles.burst(q.x, q.y + 1.2, q.z, [0xff4040, 0xffffff], 6, 2, 0.1); }
  },

  /* one short line for screenshots: what this device can see of the room */
  /* a small 'devices' list in the database saying what each device can see, for troubleshooting */
  startDeviceReport(db) {
    const ua = navigator.userAgent;
    const kind = /iPad/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'other';
    let last = '', lastT = 0;
    const report = async () => {
      const d = this.dbRoom;
      const body = { kind, name: this.nick, world: this.world || 'title', room: this.lobby ? (this.lobby.connected() ? 'up' : 'down') : 'none', roomOthers: this.lobby ? this.lobby.peers().filter(p => !p.sameTab).length : -1, dbWrites: d.status.ok, dbErr: d.status.err || d.status.readErr || '', dbOthers: d.status.others, seen: this.names() };
      const s = JSON.stringify(body), now = Date.now();
      if (s === last && now - lastT < 60000) return;
      last = s; lastT = now;
      try { await db.collection('devices').doc(d.dev).set(Object.assign(body, { t: now })); } catch (e) { /* reporting is best effort */ }
    };
    setInterval(report, 5000);
  },

  diag() {
    const ago = this.heardAt ? Math.round((Date.now() - this.heardAt) / 1000) + 's' : 'never';
    if (this.internet) return 'v10 web · ' + this.room.servers() + ' · topic ' + (this.world || 'none') + ' · players ' + this.rawPeers + ' · ' + this.status;
    const lobbyOthers = this.lobby ? this.lobby.peers().filter(p => !p.sameTab).length : 0;
    const dbs = this.dbRoom ? this.dbRoom.status : null;
    return 'v11 claude · room ' + (this.lobby ? (this.lobby.connected() ? 'up ' + lobbyOthers : 'down') : 'none') +
      ' · database ' + (dbs ? (dbs.err || dbs.readErr ? 'error ' + (dbs.err || dbs.readErr) : 'ok ' + dbs.others) : 'none') +
      ' · players ' + this.rawPeers + ' · heard ' + ago + ' ago · ' + this.status;
  },

  otherSummary() {
    const all = [...this.peers.values()];
    const elsewhere = all.filter(p => p.name && !p.inWorld);
    const parts = elsewhere.map(p => p.name + (p.world ? ' is on seed ' + p.world.slice(1) : ' is on the title screen'));
    const old = all.filter(p => p.kind === 'old').length;
    if (old) parts.push(old + ' on an old version');
    return parts.join(', ') || 'others are loading';
  },

  names() { return [...this.peers.values()].filter(p => p.name && p.inWorld).map(p => p.name); },

  tick(dt) {
    if (!this.room || this.status !== 'on' || !this.world) return;
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = 0.1; this.announce(); }
    this.diagT = (this.diagT || 0) - dt;
    if (this.diagT <= 0) { this.diagT = 1; this.render(); }
    for (const rp of this.peers.values()) {
      if (!rp.model || !rp.target) continue;
      const show = rp.inWorld && rp.dim === G.dim && !rp.dead && G.state !== 'title';
      rp.model.group.visible = show;
      if (!show) continue;
      const g = rp.model.group;
      const ox = g.position.x, oz = g.position.z;
      const s = this.playback(rp);
      if (s) {
        g.position.set(s[0], s[1], s[2]);
        let d = s[3] + Math.PI - g.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        g.rotation.y += d * Math.min(1, dt * 15);
      }
      const speed = Math.hypot(g.position.x - ox, g.position.z - oz) / Math.max(dt, 0.001);
      rp.walk = (rp.walk || 0) + speed * dt * 3.2;
      const sw = Math.sin(rp.walk) * Math.min(1, speed / 4) * 0.8;
      const parts = rp.model.parts;
      parts.legs[0].rotation.x = sw; parts.legs[1].rotation.x = -sw;
      parts.arms[0].rotation.x = -sw; parts.arms[1].rotation.x = sw - Math.sin((rp.swing || 0) * Math.PI) * 1.4;
      parts.head.rotation.x = -rp.pitch * 0.8;
      rp.flashT = (rp.flashT || 0) - dt;
      const red = rp.flashT > 0 ? 0.6 : 0;
      if (rp.red !== red) { rp.red = red; for (const m of rp.mats) m.emissive.setRGB(red, 0, 0); }
    }
  },

  /* everyone in a world shares one time of day. The newest bed or "make it day/night" wins;
     otherwise whoever has been in the world longest keeps the clock and newcomers follow them. */
  syncTime(pr) {
    if (!Number.isFinite(pr.tm) || !Number.isFinite(pr.ts) || G.state === 'title') return;
    const mine = G.timeEventAt || 0, theirs = Number.isFinite(pr.te) ? pr.te : 0;
    const follow = theirs > mine || (theirs === mine && Number.isFinite(pr.tj) && pr.tj < (this.joinedAt || Date.now()));
    if (!follow) return;
    if (theirs > mine) G.timeEventAt = theirs;
    const age = clamp((Date.now() - pr.ts) / 1000, 0, 5);
    const t = (((pr.tm + age / DAY_LENGTH) % 1) + 1) % 1;
    let diff = Math.abs(t - G.time); diff = Math.min(diff, 1 - diff);
    if (diff > 0.002) G.time = t; // more than about a second apart: jump to the shared time
  },

  /* smooth movement for other players: keep a short history of where they were (with their own
     timestamps) and replay it a little behind real time, sliding between the recorded points */
  /* ---------- one shared world: mobs, dragons and dropped items ---------- */
  newId() { return (this.uid || 'u0').slice(1, 6) + (++this.idSeq).toString(36); },

  inShared() { return !!(this.world && this.status === 'on' && this.room); },

  /* the host runs the mobs: whoever has been in this world (and dimension) the longest */
  isHost() {
    if (!this.inShared()) return true;
    let best = { tj: this.joinedAt || 0, u: this.uid };
    for (const rp of this.peers.values()) {
      if (!rp.inWorld || rp.dim !== G.dim || rp.dead === undefined) continue;
      const c = { tj: rp.tj || 0, u: rp.peer };
      if (c.tj < best.tj || (c.tj === best.tj && c.u < best.u)) best = c;
    }
    return best.u === this.uid;
  },

  /* stand-ins for the other players, so mobs can chase and hit them */
  proxies() {
    const out = [];
    if (!this.inShared()) return out;
    for (const rp of this.peers.values()) {
      if (!rp.inWorld || rp.dim !== G.dim || rp.dead || !rp.model) continue;
      if (!rp.proxy) {
        const r = rp;
        rp.proxy = { remote: r, w: 0.6, h: 1.8, vel: new THREE.Vector3(), fire: 0, get pos() { return r.model ? r.model.group.position : new THREE.Vector3(); }, get dead() { return !!r.dead; }, get mode() { return r.mode || 'survival'; }, hurt: (dmg, from, kb, force, cause) => Net.hit(r, Math.round(dmg), kb || 6, cause || 'You were hit.') };
      }
      out.push(rp.proxy);
    }
    return out;
  },

  /* what this device simulates: wild mobs if it is the host, plus its own pets, plus its dragons */
  ownedMobs() {
    const out = [], P = G.player, players = [P.pos, ...this.proxies().map(p => p.pos)];
    const near = pos => players.some(q => Math.abs(q.x - pos.x) < 96 && Math.abs(q.z - pos.z) < 96);
    for (const m of G.mobs) {
      if (m.remoteCtl || m.removed || !near(m.pos) || out.length >= 45) continue;
      const flags = (m.dead ? 1 : 0) | (m.tame ? 2 : 0) | (m.sitting ? 4 : 0) | (m.fuse > 0 ? 8 : 0) | (m.angry ? 16 : 0);
      out.push([m.nid, m.type, r2(m.pos.x), r2(m.pos.y), r2(m.pos.z), r2(m.yaw), Math.round(m.hp), flags]);
    }
    for (const d of G.dragons) {
      if (d.remoteCtl || d.done) continue;
      out.push([d.nid, 'dragon:' + d.kind, r2(d.pos.x), r2(d.pos.y), r2(d.pos.z), r2(d.mesh.rotation.y), Math.round(d.hp), d.dead ? 1 : 0]);
    }
    return out;
  },

  /* an explosion here: the others play it too and work out their own damage */
  blast(x, y, z, power, cause) {
    if (!this.inShared()) return;
    this.blastSeq++;
    this.blasts.push([this.blastSeq, r2(x), r2(y), r2(z), power, dimCode(G.dim), cause || '']);
    if (this.blasts.length > 6) this.blasts.shift();
    this.sendT = 0;
  },

  /* a hit on a mob that another device runs: send it to them */
  mobHit(m, dmg, kb) {
    this.mhSeq++;
    const P = G.player;
    this.mobHits.push([this.mhSeq, m.remoteCtl, m.nid, Math.round(dmg), r2(P.pos.x), r2(P.pos.z), Math.round(kb || 6)]);
    if (this.mobHits.length > 16) this.mobHits.shift();
    this.sendT = 0;
  },

  dropAdded(d) {
    if (!this.inShared()) return;
    this.drSeq++;
    this.seenDrops.add(d.did);
    this.dropRing.push([this.drSeq, d.did, d.id, d.count, r2(d.pos.x), r2(d.pos.y), r2(d.pos.z), dimCode(G.dim)]);
    if (this.dropRing.length > 45) this.dropRing.shift();
    this.sendT = 0;
  },

  dropPicked(did) {
    if (!this.inShared() || !did) return;
    this.pkSeq++;
    this.pickedDrops.add(did);
    this.pickRing.push([this.pkSeq, did]);
    if (this.pickRing.length > 45) this.pickRing.shift();
    this.sendT = 0;
  },

  /* names of the players in this world who still need to get into bed */
  notSleeping() {
    if (!this.inShared()) return [];
    return [...this.peers.values()].filter(rp => rp.inWorld && rp.dim === 'overworld' && !rp.dead && !rp.sleeping).map(rp => rp.name || 'your friend');
  },

  /* is the player whose game dropped this item still here to hand it out? */
  ownerHere(owner) { const rp = this.peers.get(owner); return !!(rp && rp.inWorld); },

  askForDrop(d) {
    this.askSeq++;
    this.askRing.push([this.askSeq, d.did, d.owner]);
    if (this.askRing.length > 20) this.askRing.shift();
    this.sendT = 0;
  },

  dropPuppets(owner) {
    for (const m of G.mobs) if (m.remoteCtl === owner) m.removeSilently();
    for (const d of G.dragons) if (d.remoteCtl === owner) d.remove();
  },

  syncShared(rp, pr) {
    const sameDim = rp.dim === G.dim;
    // their mobs and dragons, shown as puppets that follow their snapshots
    if (Array.isArray(pr.mb) && Number.isFinite(pr.ts)) {
      const live = new Set();
      if (sameDim) for (const e of pr.mb) {
        if (!Array.isArray(e) || e.length < 8 || typeof e[0] !== 'string' || typeof e[1] !== 'string' || !e.slice(2, 8).every(Number.isFinite)) continue;
        const [nid, type, x, y, z, yaw, hp, flags] = e;
        live.add(nid);
        if (type.startsWith('dragon:')) {
          const kind = type.slice(7);
          if (!DRAGON_KINDS[kind]) continue;
          let d = G.dragons.find(o => o.remoteCtl === rp.peer && o.nid === nid);
          if (!d) { d = new Dragon(kind, new THREE.Vector3(x, y, z), { x, y, z, remote: rp.peer, nid }); G.dragons.push(d); }
          d.hp = hp; d.netSeen = Date.now();
          if (flags & 1) d.netDead = true;
          this.noteArrival(d, pr.ts); this.addPoint(d, pr.ts, x, y, z, yaw);
          continue;
        }
        if (!MOB_TYPES[type]) continue;
        let m = G.mobs.find(o => o.remoteCtl === rp.peer && o.nid === nid);
        if (!m) {
          if (flags & 1) continue; // already dying when we first heard of it
          m = new Mob(type, x, y, z); m.remoteCtl = rp.peer; m.nid = nid; G.mobs.push(m);
        }
        m.hp = hp; m.netFlags = flags;
        if (flags & 1) m.netDead = true;
        this.noteArrival(m, pr.ts); this.addPoint(m, pr.ts, x, y, z, yaw);
      }
      for (const m of G.mobs) if (m.remoteCtl === rp.peer && !live.has(m.nid) && !m.dead) m.removeSilently();
      for (const d of G.dragons) if (d.remoteCtl === rp.peer && !live.has(d.nid) && !d.dead) d.remove();
    }
    // hits they made on mobs this device runs
    if (Array.isArray(pr.mh)) {
      let top = rp.lastMh || 0;
      for (const h of pr.mh) {
        if (!Array.isArray(h) || h.length < 7 || !Number.isInteger(h[0])) continue;
        if (rp.mhReady && h[0] > (rp.lastMh || 0) && h[1] === this.uid) {
          const target = G.mobs.find(m => !m.remoteCtl && m.nid === h[2]) || G.dragons.find(d => !d.remoteCtl && d.nid === h[2]);
          if (target && !target.dead) {
            if (target instanceof Dragon) target.hurt(clamp(+h[3] || 1, 1, 20));
            else target.hurt(clamp(+h[3] || 1, 1, 20), { x: +h[4], z: +h[5] }, clamp(+h[6] || 6, 0, 16), true);
          }
        }
        if (h[0] > top) top = h[0];
      }
      rp.lastMh = top;
    }
    rp.mhReady = true;
    // items they dropped, and items they picked up
    if (Array.isArray(pr.dr)) for (const e of pr.dr) {
      if (!Array.isArray(e) || e.length < 8 || typeof e[1] !== 'string') continue;
      const [, did, id, count, x, y, z, dim] = e;
      if (this.seenDrops.has(did) || this.pickedDrops.has(did)) continue;
      this.seenDrops.add(did);
      if (DIMS[dim] !== G.dim || !DEFS[id] || !Number.isFinite(x + y + z) || !(count > 0)) continue;
      const nd = G.spawnDrop(id, Math.min(64, count | 0), x, y, z, new THREE.Vector3(0, 0, 0), { did, remote: true });
      nd.owner = rp.peer;
    }
    // they asked for an item our game dropped: give it to the first one to ask, if it is still there
    if (Array.isArray(pr.rq)) {
      let top = rp.lastRq || 0;
      for (const e of pr.rq) {
        if (!Array.isArray(e) || !Number.isInteger(e[0]) || typeof e[1] !== 'string') continue;
        if (e[0] > (rp.lastRq || 0) && e[2] === this.uid) {
          const d = G.drops.find(o => o.did === e[1] && !o.done && !o.owner);
          if (d) {
            this.giveSeq++;
            this.giveRing.push([this.giveSeq, d.did, rp.peer, d.id, d.count]);
            if (this.giveRing.length > 20) this.giveRing.shift();
            this.dropPicked(d.did);
            d.finish();
          }
        }
        if (e[0] > top) top = e[0];
      }
      rp.lastRq = top;
    }
    // items they handed to us
    if (Array.isArray(pr.gv)) for (const e of pr.gv) {
      if (!Array.isArray(e) || e.length < 5 || e[2] !== this.uid || typeof e[1] !== 'string' || this.gotDrops.has(e[1])) continue;
      this.gotDrops.add(e[1]);
      for (const d of G.drops) if (d.did === e[1]) d.finish();
      if (!DEFS[e[3]] || !(e[4] > 0)) continue;
      const P = G.player, left = P.inv.add(e[3], Math.min(64, e[4] | 0));
      G.sound.play('pickup');
      if (left) G.spawnDrop(e[3], left, P.pos.x, P.pos.y + 1, P.pos.z, new THREE.Vector3(0, 0, 0));
    }
    if (Array.isArray(pr.pk)) for (const e of pr.pk) {
      if (!Array.isArray(e) || typeof e[1] !== 'string' || this.pickedDrops.has(e[1])) continue;
      this.pickedDrops.add(e[1]);
      for (const d of G.drops) if (d.did === e[1]) d.finish();
    }
  },

  noteArrival(o, ts) {
    const now = Date.now(), off = now - ts;
    o.offset = o.offset === undefined ? off : Math.min(off, o.offset + 5);
    if (o.lastArrive && o.lastTs !== ts) {
      const gap = now - o.lastArrive;
      if (gap > 20) o.gap = o.gap === undefined ? gap : o.gap * 0.8 + gap * 0.2;
    }
    if (o.lastTs !== ts) o.lastArrive = now;
    o.lastTs = ts;
  },

  addPoint(o, ts, x, y, z, yaw) {
    const buf = o.buf || (o.buf = []);
    if (buf.length && ts <= buf[buf.length - 1][0]) return;
    buf.push([ts, x, y, z, yaw]);
    if (buf.length > 60) buf.shift();
  },

  bufferMove(rp, pr, pos, yaw) {
    const now = Date.now();
    const buf = rp.buf || (rp.buf = []);
    const add = (ts, x, y, z, ry) => {
      if (buf.length && ts <= buf[buf.length - 1][0]) return;
      buf.push([ts, x, y, z, ry]);
      if (buf.length > 60) buf.shift();
    };
    if (Number.isFinite(pr.ts)) {
      // clock difference between their device and ours (the smallest delay seen, slowly forgotten)
      const off = now - pr.ts;
      rp.offset = rp.offset === undefined ? off : Math.min(off, rp.offset + 5);
      if (rp.lastArrive) {
        const gap = now - rp.lastArrive;
        if (gap > 20) rp.gap = rp.gap === undefined ? gap : rp.gap * 0.8 + gap * 0.2;
      }
      rp.lastArrive = now;
      if (Array.isArray(pr.tr)) for (const t of pr.tr) {
        if (Array.isArray(t) && t.length === 5 && t.every(Number.isFinite)) add(pr.ts + t[0], t[1], t[2], t[3], t[4]);
      }
      add(pr.ts, pos[0], pos[1], pos[2], yaw);
    } else {
      // an older copy of the game without timestamps: use arrival time
      rp.offset = 0; add(now, pos[0], pos[1], pos[2], yaw);
    }
  },

  playback(rp) {
    const buf = rp.buf;
    if (!buf || !buf.length) return rp.target ? [rp.target[0], rp.target[1], rp.target[2], rp.yaw] : null;
    // stay only a little behind and guess ahead between updates, so friends don't lag a second behind
    const delay = clamp((rp.gap || 150) * 0.9 + 40, 100, 900);
    const now = Date.now(), want = now - (rp.offset || 0) - delay;
    // a playback clock that runs at normal speed and only drifts gently (up to 15% faster or
    // slower) toward where it should be, so changes in network timing never make a jump
    if (rp.clock === undefined || Math.abs(want - rp.clock) > 2000) rp.clock = want;
    else {
      const real = now - (rp.clockAt || now);
      rp.clock += real * (1 + clamp((want - rp.clock) / 1000, -0.15, 0.15));
    }
    rp.clockAt = now;
    const t = rp.clock;
    const last = buf[buf.length - 1];
    if (t >= last[0]) {
      // ran past the newest point: keep going the same way for a moment instead of freezing
      const prev = buf.length > 1 ? buf[buf.length - 2] : null;
      if (prev && last[0] > prev[0]) {
        const k = Math.min(t - last[0], 300) / (last[0] - prev[0]);
        return [last[1] + (last[1] - prev[1]) * k, last[2], last[3] + (last[3] - prev[3]) * k, last[4]];
      }
      return [last[1], last[2], last[3], last[4]];
    }
    while (buf.length > 2 && buf[1][0] <= t) buf.shift();
    const a = buf[0], b = buf[1];
    if (!b || t <= a[0]) return [a[1], a[2], a[3], a[4]];
    const f = clamp((t - a[0]) / Math.max(1, b[0] - a[0]), 0, 1);
    let dy = b[4] - a[4];
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f, a[4] + dy * f];
  },

  onPeers(ch) {
    this.rawPeers = ch.peers.filter(p => !p.sameTab).length;
    this.heardAt = Date.now();
    const seen = new Set();
    for (const p of ch.peers) {
      if (p.sameTab) continue;
      seen.add(p.peer);
      this.handle(p);
    }
    for (const [id, rp] of this.peers) {
      if (seen.has(id)) continue;
      if (rp.inWorld && rp.name) G.ui.message(rp.name + ' left the world');
      this.dropPuppets(rp.peer);
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
    if (!pr || pr.v !== 2) {
      rp.name = ''; rp.world = null; rp.inWorld = false; this.removeModel(rp);
      rp.kind = pr && pr.v === 1 ? 'old' : 'loading';
      return;
    }
    rp.kind = 'ok';
    const name = this.clean(pr.n) || 'Player';
    if (name !== rp.name) this.removeModel(rp);
    rp.name = name;
    rp.world = typeof pr.w === 'string' ? pr.w.slice(0, 24) : null;
    rp.mode = pr.m === 1 ? 'creative' : 'survival';
    const wasIn = rp.inWorld;
    rp.inWorld = !!this.world && rp.world === this.world && G.state !== 'title';
    if (!rp.inWorld) { this.removeModel(rp); this.dropPuppets(rp.peer); if (wasIn) G.ui.message(name + ' left the world'); return; }
    if (!wasIn) G.ui.message(name + ' joined your world!', 'gold');
    this.syncTime(pr);
    const pos = Array.isArray(pr.p) && pr.p.length === 3 && pr.p.every(Number.isFinite) ? pr.p : null;
    const rot = Array.isArray(pr.r) && pr.r.length === 2 && pr.r.every(Number.isFinite) ? pr.r : [0, 0];
    rp.dim = DIMS[pr.d] || 'overworld';
    rp.dead = pr.x === 1;
    rp.sleeping = pr.sl === 1;
    rp.yaw = rot[0]; rp.pitch = clamp(rot[1], -1.6, 1.6);
    rp.swing = Number.isFinite(pr.s) ? clamp(pr.s, 0, 1) : 0;
    if (pos) {
      const first = !rp.model;
      rp.target = pos;
      this.bufferMove(rp, pr, pos, rot[0]);
      const skin = Number.isInteger(pr.sk) && pr.sk >= 0 && pr.sk < SKINS.length ? pr.sk : DEFAULT_SKIN;
      if (rp.model && rp.skin !== skin) { const at = rp.model.group.position.clone(); G.scene.remove(rp.model.group); rp.model = null; this.makeModel(rp, skin); rp.model.group.position.copy(at); }
      if (!rp.model) this.makeModel(rp, skin);
      if (first) rp.model.group.position.set(pos[0], pos[1], pos[2]);
    }
    if (rp.model) dressModel(rp.model, Array.isArray(pr.ar) && pr.ar.length === 4 ? pr.ar.map(v => (isInt(v) ? v : 0)) : [0, 0, 0, 0]);
    // explosions on their screen: everyone works out their own damage from where they really are
    if (Array.isArray(pr.ex)) {
      let top = rp.lastEx || 0;
      for (const b of pr.ex) {
        if (!Array.isArray(b) || b.length < 6 || !Number.isInteger(b[0]) || !b.slice(1, 6).every(Number.isFinite)) continue;
        if (rp.exReady && b[0] > (rp.lastEx || 0) && DIMS[b[5]] === G.dim) {
          const cause = typeof b[6] === 'string' ? b[6].replace(/[^\w .,'!-]/g, '').slice(0, 80) : '';
          G.explode(b[1], b[2], b[3], clamp(b[4], 0.5, 6), false, false, null, cause || undefined, { remote: true });
        }
        if (b[0] > top) top = b[0];
      }
      rp.lastEx = top;
    }
    rp.exReady = true;
    if (Array.isArray(pr.a)) {
      const me = this.myPeer(), P = G.player;
      let top = rp.lastHit || 0;
      for (const h of pr.a) {
        if (!Array.isArray(h) || h.length < 4 || !Number.isInteger(h[1])) continue;
        if (rp.hitReady && h[1] > (rp.lastHit || 0) && h[0] === me && rp.dim === G.dim && P.mode === 'survival' && !P.dead) {
          const from = { x: rp.target ? rp.target[0] : P.pos.x, z: rp.target ? rp.target[2] : P.pos.z };
          const cause = typeof h[4] === 'string' ? h[4].replace(/[^\w .,'!-]/g, '').slice(0, 80) : name + ' hit you.';
          P.hurt(clamp(+h[2] || 1, 1, 20), from, clamp(+h[3] || 6, 0, 16), true, cause);
          if (P.dead) G.ui.message(name + ' knocked you out!', 'purple');
        }
        if (h[1] > top) top = h[1];
      }
      rp.lastHit = top;
    }
    rp.hitReady = true;
    rp.tj = Number.isFinite(pr.tj) ? pr.tj : Date.now();
    rp.mode = pr.m === 1 ? 'creative' : 'survival';
    this.syncShared(rp, pr);
    if (Array.isArray(pr.e) && G.worlds) {
      let top = rp.last;
      for (const e of pr.e) {
        if (!Array.isArray(e) || e.length !== 6 || !e.every(isInt)) continue;
        const [sq, d, x, y, z, id] = e;
        if (sq <= rp.last || id < 0 || id >= 128 || !DEFS[id] || (DEFS[id].liquid && id !== ID.water)) continue;
        if (G.worlds[DIMS[d]]) G.worlds[DIMS[d]].applyRemote(x, y, z, id);
        if (sq > top) top = sq;
      }
      rp.last = top;
    }
  },

  makeModel(rp, skin) {
    const m = buildPlayerModel(skin);
    rp.skin = skin;
    rp.mats = [];
    m.group.traverse(o => { if (o.isMesh) for (const mat of [].concat(o.material)) if (mat.emissive) rp.mats.push(mat); });
    rp.red = 0;
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
    const all = [...this.peers.values()];
    const list = all.filter(p => p.name);
    const old = all.filter(p => p.kind === 'old').length, loading = all.filter(p => p.kind === 'loading').length;
    let t = list.length ? 'Online now: ' + list.map(p => p.name + (p.world ? ' (seed ' + p.world.slice(1) + ')' : ' (on the title screen)')).join(', ') + '.' : 'Nobody else is connected right now.';
    if (old) t += ' ' + old + ' player' + (old > 1 ? 's are' : ' is') + ' using an old copy of the game: close the game completely and open the link again.';
    if (loading) t += ' ' + loading + ' player' + (loading > 1 ? 's are' : ' is') + ' still loading.';
    return t;
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
    if (!this.internet) text += ' For playing with friends who are not signed in, everyone must use the website instead (gold button above). The website and this claude.ai page can\'t see each other.';
    if (this.status === 'on' && this.internet) {
      text = this.connected ? 'Online multiplayer is on. Anyone who opens this website and types the same world seed plays with you, no account needed.' : 'Connecting to the multiplayer servers...';
    } else if (this.status === 'on') {
      text = (this.connected ? 'Multiplayer is on. ' : 'Multiplayer is reconnecting... ') + this.describeOthers();
      text += ' To play together, press Join next to your friend, or both type the same seed and press Play this seed.';
    }
    if (this.error && this.status !== 'unavailable') text += ' (connection problem: ' + this.error + ')';
    if (this.room) text += ' [' + this.diag() + ']';
    el.textContent = text;
    el.classList.toggle('on', this.status === 'on' && this.connected);
    btn.hidden = !(this.status === 'prompt' || (this.status === 'denied' && this.perms));
    btn.textContent = this.status === 'denied' ? 'Open permissions' : 'Turn on multiplayer';
    // a Join button for every friend who is already playing
    const box = $('net-friends');
    const joinable = this.status === 'on' ? [...this.peers.values()].filter(rp => rp.name && rp.world && /^w-?\d+$/.test(rp.world)) : [];
    const sig = joinable.map(rp => rp.peer + rp.name + rp.world + rp.mode).join('|');
    if (sig !== this.friendSig) {
      this.friendSig = sig;
      box.innerHTML = '';
      for (const rp of joinable) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn gold';
        b.textContent = 'Join ' + rp.name + ' (seed ' + rp.world.slice(1) + ')';
        b.addEventListener('click', () => { $('seed').value = rp.world.slice(1); G.startNew(rp.mode); });
        box.appendChild(b);
      }
    }
    const n = this.names().length;
    const on = $('online');
    on.hidden = G.state === 'title';
    const live = this.status === 'on' && this.connected;
    on.classList.toggle('off', !live);
    on.textContent = !live ? 'Playing alone: multiplayer not connected (see title screen)'
      : n ? (n === 1 ? '1 friend in your world' : n + ' friends in your world')
      : 'Multiplayer on: waiting for friends on seed ' + G.seed + (this.peers.size ? ' · ' + this.otherSummary() : ' · nobody else connected');
    $('online-diag').textContent = this.room ? this.diag() : 'no room';
  },
};
