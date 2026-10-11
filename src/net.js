'use strict';
// ============================================================================
// Online parties. Uses the artifact "room" capability: everyone in a party
// joins a named room ("bl-<code>") and shares state through presence.
//   - The party leader (host) runs the match: ball, score, clock and bots.
//   - Each player's own device drives their own car, so controls feel instant.
//   - The host sends a snapshot of the whole match ~30 times a second; guests
//     send their car's state back.
// ============================================================================

const NET_RELAY_SKIP = new Set(['hit', 'bounce', 'jump', 'doublejump', 'land', 'dodge', 'pad', 'padback', 'chat', 'replayStart', 'respawn', 'tiles', 'itemget', 'itemuse', 'charge', 'aerialhit', 'flipreset']);
const _netEnc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
function netBytes(o) { const j = JSON.stringify(o); return _netEnc ? _netEnc.encode(j).length : j.length * 2; }
const NET_MODES = ['soccar', 'hoops', 'snowday', 'heatseeker', 'dropshot'];
const r0 = Math.round, r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;

const Net = {
  room: null, party: null, code: null, isHost: false, myPeer: null,
  status: 'idle', // idle | connecting | party
  error: '', myTeam: 0,
  settings: { mode: 'soccar', size: 2, level: 'allstar', map: 'auto' },
  match: null, startedId: null, hostPeer: null, hostMissingT: 0,
  remote: new Map(), // host: peer -> { u, at }
  ack: 0, chatSeq: 0, evSeq: 0, relay: [], lastS: null, lastEv: 0, lastChat: 0, sigLobby: '',

  // the room namespace (null when this view can't go online, e.g. the plain HTML file)
  init() {
    if (this._init) return this._init;
    this._init = (async () => {
      try { if (window.claude && window.claude.use) this.room = await window.claude.use('room'); } catch (e) { this.room = null; }
      if (UI.screen === 'party') UI.show('party');
      return this.room;
    })();
    return this._init;
  },
  available() { return !!this.room; },
  inParty() { return !!this.party; },

  genCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = ''; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  },
  myInfo() {
    return { v: 1, name: String(Profile.name || 'Player').slice(0, 16), lo: Object.assign({}, Profile.car), team: this.myTeam };
  },

  async create() {
    await this.init();
    if (!this.room) { this.error = 'Online play needs the game opened on claude.ai while signed in.'; UI.show('party'); return; }
    this.status = 'connecting'; this.error = ''; UI.show('party');
    try {
      const code = this.genCode();
      await this.enter(code, true);
      this.pushParty();
    } catch (e) { this.fail(e); }
  },

  async join(code) {
    await this.init();
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) { this.error = 'Type the party code your friend sees.'; UI.show('party'); return; }
    if (!this.room) { this.error = 'Online play needs the game opened on claude.ai while signed in.'; UI.show('party'); return; }
    this.status = 'connecting'; this.error = ''; UI.show('party');
    try {
      await this.enter(code, false);
      // wait for the host to show up
      const t0 = Date.now();
      while (Date.now() - t0 < 7000 && !this.hostPeerObj()) await new Promise(r => setTimeout(r, 250));
      if (!this.hostPeerObj()) { await this.leave(true); this.error = `No party found with code ${code}.`; UI.show('party'); return; }
      UI.show('party');
    } catch (e) { this.fail(e); }
  },

  async enter(code, host) {
    if (this.party) await this.leave(true);
    const party = await this.room.join('bl-' + code.toLowerCase());
    this.party = party; this.code = code; this.isHost = host; this.status = 'party';
    this.myTeam = 0; this.match = null; this.startedId = null; this.hostMissingT = 0;
    this.unsubs = [
      party.onPeers((ch) => this.onPeers(ch), (e) => this.onRoomError(e)),
    ];
    await party.presence(Object.assign(this.myInfo(), { host: host || null }));
  },

  fail(e) {
    this.status = 'idle'; this.party = null;
    const c = e && e.code;
    this.error = c === 'not_permitted' || c === 'not_granted' ? 'Online play isn\'t available for you on this page. The game must be shared with you (not by public link) and you must be signed in.'
      : c === 'limit_reached' ? 'Too many rooms open right now. Try again in a moment.'
      : 'Couldn\'t connect. Check your internet and try again.';
    UI.show('party');
  },
  onRoomError(e) {
    if (!this.party) return;
    this.party = null; this.status = 'idle'; this.error = 'Lost connection to the party.';
    if (CUR.game && CUR.game.online) { quitToMenu('party'); } else if (UI.screen === 'party') UI.show('party');
  },

  async leave(silent) {
    const p = this.party;
    this.party = null; this.status = 'idle'; this.code = null; this.isHost = false; this.match = null; this.remote.clear();
    if (this.unsubs) this.unsubs.forEach(u => { try { u(); } catch (e) { /* ignore */ } });
    this.unsubs = null;
    if (p) try { await p.leave(); } catch (e) { /* ignore */ }
    if (!silent && UI.screen === 'party') UI.show('party');
  },

  members() {
    if (!this.party) return [];
    const list = this.party.peers().filter(p => p.presence && p.presence.v === 1);
    for (const p of list) if (p.isMe && p.sameTab) this.myPeer = p.peer;
    return list.sort((a, b) => (b.presence.host ? 1 : 0) - (a.presence.host ? 1 : 0) || (a.peer < b.peer ? -1 : 1));
  },
  hostPeerObj() {
    if (!this.party) return null;
    return this.party.peers().find(p => p.presence && p.presence.v === 1 && p.presence.host && !p.isMe) || null;
  },

  setTeam(t) {
    this.myTeam = t;
    if (this.party) this.party.presence({ team: t }).catch(() => {});
    UI.show('party');
  },
  setSetting(k, v) {
    this.settings[k] = v;
    Store.set('netcfg', this.settings);
    this.pushParty();
  },
  pushParty() {
    if (!this.party || !this.isHost) return;
    const S = this.settings;
    const party = { code: this.code, mode: S.mode, size: S.size, level: S.level, map: S.map, phase: this.match ? 'match' : 'lobby', match: this.match };
    this.baseBytes = netBytes(Object.assign(this.myInfo(), { host: true, party }));
    this.party.presence({ party }).catch(() => {});
  },

  // lobby changes → refresh the party screen (only when something it shows changed)
  onPeers() {
    const ms = this.members();
    if (!this.isHost) {
      const host = this.hostPeerObj();
      const pp = host && host.presence.party;
      // the host started a match with us in it
      if (pp && pp.phase === 'match' && pp.match && pp.match.id !== this.startedId) {
        const me = pp.match.slots.findIndex(s => s.peer && s.peer === this.myPeer);
        if (me >= 0) { this.startedId = pp.match.id; this.startOnline(pp.match, false); return; }
      }
      // the host went back to the lobby (or quit the match)
      if (pp && pp.phase === 'lobby' && CUR.game && CUR.game.online && CUR.game.state !== 'ended') {
        UI.toast('The host ended the match');
        quitToMenu('party');
        return;
      }
    }
    const host = this.isHost ? null : this.hostPeerObj();
    const pp = host ? host.presence.party : null;
    const sig = JSON.stringify([ms.map(m => [m.peer, m.presence.name, m.presence.team, !!m.presence.host]), pp && [pp.mode, pp.size, pp.level, pp.map, pp.phase]]);
    if (sig !== this.sigLobby) { this.sigLobby = sig; if (UI.screen === 'party') UI.show('party'); }
  },

  // ---------------------------------------------------------------------------
  // host: start a match for everyone in the party
  start() {
    if (!this.isHost || !this.party) return;
    const S = this.settings;
    const ms = this.members();
    const size = S.size;
    if (ms.length > size * 2) { UI.toast(`Too many players for ${size}v${size}. Pick a bigger team size.`); return; }
    // put players on the team they picked, moving extras to the other side
    const teams = [[], []];
    for (const m of ms) teams[m.presence.team === 1 ? 1 : 0].push(m);
    for (let t = 0; t < 2; t++) while (teams[t].length > size) teams[1 - t].push(teams[t].pop());
    const used = new Set(ms.map(m => m.presence.name));
    const botName = () => { let n, k = 0; do { n = pick(BOT_NAMES); k++; } while (used.has(n) && k < 50); used.add(n); return n; };
    const slots = [];
    for (let t = 0; t < 2; t++) {
      for (const m of teams[t]) slots.push({ peer: m.peer, name: String(m.presence.name || 'Player').slice(0, 16), team: t, lo: m.presence.lo || null });
      for (let k = teams[t].length; k < size; k++) slots.push({ peer: null, name: botName(), team: t, bot: 1, lo: randomLoadout() });
    }
    const md = MODES[S.mode];
    const map = S.map === 'auto' ? (md.mapOverride || pick(Object.keys(MAPS))) : S.map;
    const cfg = { kind: 'match', mode: S.mode, teamSize: size, level: S.level, map, mutators: {}, replays: false };
    this.match = { id: Math.random().toString(36).slice(2, 10), cfg, slots };
    this.startedId = this.match.id;
    this.pushParty();
    this.startOnline(this.match, true);
  },

  startOnline(match, host) {
    const me = match.slots.findIndex(s => s.peer === this.myPeer);
    if (me < 0) return;
    const cfg = JSON.parse(JSON.stringify(match.cfg));
    cfg.online = { host, me, slots: match.slots, id: match.id };
    this.matchId = match.id;
    this.ack = 0; this.lastS = null; this.lastEv = 0; this.lastChat = 0; this.relay = []; this.evSeq = 0; this.remote.clear();
    this.chatSeq = 0; this._chat = null; this.hostMissingT = 0;
    UI.toast(host ? 'Match started' : 'Joining the host\'s match…');
    startMatch(cfg);
  },

  // called when the local player leaves an online match
  leaveMatch(g) {
    if (!this.party) return;
    if (g.netHost) { this.match = null; this.party.presence({ s: null }).catch(() => {}); this.pushParty(); }
    else this.party.presence({ u: null }).catch(() => {});
  },

  sendChat(msg, team) {
    this.chatSeq++;
    this._chat = [this.chatSeq, String(msg).slice(0, 60), team ? 1 : 0];
  },

  // ---------------------------------------------------------------------------
  // per frame, after the simulation steps
  tick(g, dt) {
    if (!g.online || !this.party) return;
    if (g.netHost) this.hostTick(g, dt); else this.clientTick(g, dt);
  },

  hostTick(g, dt) {
    const now = performance.now();
    // guests' car states
    const seen = new Set();
    for (const p of this.party.peers()) {
      const u = p.presence && p.presence.u;
      if (!u || u.id !== this.matchId) continue;
      seen.add(p.peer);
      const prev = this.remote.get(p.peer);
      if (!prev || prev.u !== u) this.remote.set(p.peer, { u, at: now });
    }
    for (const c of g.cars) {
      if (!c.remote) continue;
      const rs = this.remote.get(c.netPeer);
      // their chat
      if (rs && rs.u.ch && rs.u.ch[0] > (c.netChat || 0)) {
        c.netChat = rs.u.ch[0];
        g.chat(c, String(rs.u.ch[1]).slice(0, 60), !!rs.u.ch[2]);
      }
      // a player who left (or never arrived) is replaced by a bot
      const gone = !this.party.peers().some(p => p.peer === c.netPeer);
      const stale = !rs ? g.time > 12 : now - rs.at > 6000;
      if (gone || stale) {
        c.remote = false; c.isBot = true; c.name = c.name + ' (bot)';
        c.bot = new Bot(c, BOT_LEVELS[g.cfg.level] ? g.cfg.level : 'allstar'); g.bots.push(c.bot);
        g.events.push({ type: 'chat', car: c, msg: 'left the match — a bot took over', team: false, t: g.time, seq: ++g.chatSeq });
      }
    }
    // collect events worth showing on guests' screens
    for (const ev of g.events) {
      if (NET_RELAY_SKIP.has(ev.type)) continue;
      if (ev.type === 'award' && ev.car && !ev.car.remote) continue; // only guests need their own awards
      const o = { q: ++this.evSeq, at: g.time };
      for (const k in ev) {
        const v = ev[k];
        if (v instanceof Car) o[k] = { $c: v.id };
        else if (v && v.isVector3) o[k] = [r0(v.x), r0(v.y), r0(v.z)];
        else if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') o[k] = typeof v === 'number' ? r2(v) : v;
      }
      this.relay.push(o);
    }
    this.relay = this.relay.filter(e => g.time - e.at < 2.5).slice(-8);
    // snapshot (the platform sends presence ~30 times a second)
    this.party.presence({ s: this.snapshot(g, 4040 - (this.baseBytes || 1500)) }).catch(() => {});
  },

  snapshot(g, budget) {
    const b = g.ball;
    const s = {
      id: this.matchId, st: g.state, sT: r2(g.stateT), cl: r2(g.clock), sc: g.score.slice(), ot: g.overtime ? 1 : 0, oT: r2(g.otTime || 0),
      bh: g.ballHidden ? 1 : 0, ht: g.heat.target, hs: r0(g.heat.speed),
      c: g.cars.map(c => [r0(c.pos.x), r0(c.pos.y), r0(c.pos.z), r3(c.quat.x), r3(c.quat.y), r3(c.quat.z), r3(c.quat.w),
        r0(c.vel.x), r0(c.vel.y), r0(c.vel.z), r2(c.angVel.x), r2(c.angVel.y), r2(c.angVel.z), r0(c.boost),
        (c.demolished ? 1 : 0) | (c.boosting ? 2 : 0) | (c.onGround ? 4 : 0) | (c.supersonic ? 8 : 0), c.spawnSeq || 0]),
      b: [r0(b.pos.x), r0(b.pos.y), r0(b.pos.z), r0(b.vel.x), r0(b.vel.y), r0(b.vel.z), r2(b.angVel.x), r2(b.angVel.y), r2(b.angVel.z)],
      p: g.pads.map(p => p.active ? 1 : 0).join(''),
      k: g.cars.map(c => [c.stats.score, c.stats.goals, c.stats.assists, c.stats.saves, c.stats.shots, c.stats.demos]),
      e: this.relay,
      ch: g.chatLog.filter(e => e.seq).slice(-5).map(e => [e.seq, e.car.id, e.msg, e.team ? 1 : 0]),
    };
    if (ARENA.dropshot) { s.d = Tiles.list.map(t => t.state).join(''); s.ds = [b.dsTeam === undefined ? -1 : b.dsTeam, b.chargeLevel || 0]; }
    if (g.state === 'ended') { s.w = g.winner; s.mvp = g.mvp ? g.mvp.id : -1; }
    // keep under the presence size limit
    budget = budget || 2400;
    while (netBytes(s) > budget && (s.e.length || s.ch.length || s.k)) { if (s.ch.length) s.ch.shift(); else if (s.e.length) s.e.shift(); else delete s.k; }
    return s;
  },

  clientTick(g, dt) {
    const c = g.player;
    const host = this.hostPeerObj();
    // host vanished → leave
    if (!host) {
      this.hostMissingT += dt;
      if (this.hostMissingT > 5 && g.state !== 'ended') { UI.toast('The host left the party'); this.leave(true); quitToMenu('party'); }
      return;
    }
    this.hostMissingT = 0;
    const u = {
      id: this.matchId, a: this.ack,
      c: [r0(c.pos.x), r0(c.pos.y), r0(c.pos.z), r3(c.quat.x), r3(c.quat.y), r3(c.quat.z), r3(c.quat.w),
        r0(c.vel.x), r0(c.vel.y), r0(c.vel.z), r2(c.angVel.x), r2(c.angVel.y), r2(c.angVel.z)],
      b: r0(c.boost), f: (c.boosting ? 2 : 0) | (c.onGround ? 4 : 0) | (c.supersonic ? 8 : 0),
    };
    if (this._chat) u.ch = this._chat;
    this.party.presence({ u }).catch(() => {});
  },
};

// ============================================================================
// Simulation hooks used by Game when it is online
// ============================================================================
const NetSync = {
  // host: put a guest's car where their device says it is
  applyRemote(g, c) {
    const rs = Net.remote.get(c.netPeer);
    if (!rs || c.demolished) return;
    const u = rs.u;
    // after a kickoff or respawn, wait until their device has moved the car there too
    if ((u.a || 0) < (c.spawnSeq || 0)) { c.vel.set(0, 0, 0); c.angVel.set(0, 0, 0); return; }
    const a = u.c;
    const age = Math.min(0.15, (performance.now() - rs.at) / 1000);
    c.vel.set(a[7], a[8], a[9]); c.angVel.set(a[10], a[11], a[12]);
    c.pos.set(a[0] + a[7] * age, a[1] + a[8] * age, a[2] + a[9] * age);
    c.quat.set(a[3], a[4], a[5], a[6]).normalize();
    c.boost = u.b; c.boosting = !!(u.f & 2); c.onGround = !!(u.f & 4); c.supersonic = !!(u.f & 8);
    if (!c.onGround) c.airTime = (c.airTime || 0) + PHYS.TICK; else c.airTime = 0;
  },

  // guest: run the local preview and follow the host's snapshots
  clientUpdate(g, dt) {
    g.time += dt;
    const host = Net.hostPeerObj();
    const s = host && host.presence.s;
    if (s && s !== Net.lastS && s.id === Net.matchId) { Net.lastS = s; this.applySnapshot(g, s); }
    const me = g.player;
    const frozen = g.state === 'countdown';
    // own car
    if (!me.demolished && !frozen && g.state !== 'ended') me.step(dt, g);
    else if (frozen) { me.vel.set(0, 0, 0); me.angVel.set(0, 0, 0); }
    else if (g.state === 'ended' && !me.demolished) me.step(dt, g);
    // other cars: keep moving them between snapshots
    for (const c of g.cars) {
      if (!c.puppet || c.demolished) continue;
      c.pos.addScaledVector(c.vel, dt);
      const w = c.angVel.length();
      if (w > 1e-3) { _nq.setFromAxisAngle(_nv.copy(c.angVel).multiplyScalar(1 / w), w * dt); c.quat.premultiply(_nq).normalize(); }
      if (c.visOff) c.visOff.multiplyScalar(Math.exp(-dt * 10));
    }
    // ball preview
    const ball = g.ball;
    if (!g.ballHidden && !frozen) {
      if (g.mode === 'heatseeker') heatHome(ball, g.heat, g.mutators.gravity, dt);
      ball.step(dt, g.mutators, (b, n, j) => g.events.push({ type: 'bounce', strength: j, pos: b.pos.clone(), n: n.clone() }));
      if (!me.demolished) carBallCollide(me, ball, g);
    }
    if (ball.visOff) ball.visOff.multiplyScalar(Math.exp(-dt * 10));
    if (!me.demolished) for (const c of g.cars) if (c !== me && !c.demolished) carCarCollide(me, c, g);
    g.updatePads(dt);
  },

  applySnapshot(g, s) {
    const prevState = g.state;
    g.state = s.st; g.stateT = s.sT; g.clock = s.cl; g.score = s.sc.slice(); g.overtime = !!s.ot; g.otTime = s.oT;
    g.ballHidden = !!s.bh; g.heat.target = s.ht; g.heat.speed = s.hs;
    g.clockRunning = true; g.kickoffPending = false;
    if (s.st === 'ended') { g.winner = s.w; g.mvp = g.cars[s.mvp] || null; }
    // cars
    s.c.forEach((a, i) => {
      const c = g.cars[i]; if (!c) return;
      const demo = !!(a[14] & 1);
      if (c === g.player) {
        // the host moved my car (kickoff / respawn) → follow it
        if ((a[15] || 0) > Net.ack || s.st === 'countdown') {
          if ((a[15] || 0) > Net.ack) { c.resetState(); Net.ack = a[15] || 0; c.boost = a[13]; }
          c.pos.set(a[0], a[1], a[2]); c.quat.set(a[3], a[4], a[5], a[6]).normalize();
          c.vel.set(0, 0, 0); c.angVel.set(0, 0, 0); c.onGround = !!(a[14] & 4);
          if (c.onGround) c.groundN.set(0, 1, 0);
        }
        c.demolished = demo;
      } else {
        if (!c.visOff) c.visOff = new V3();
        const jump = c.demolished !== demo || c.pos.distanceTo(_nv.set(a[0], a[1], a[2])) > 600;
        if (!jump) c.visOff.add(_nv2.copy(c.pos).sub(_nv));
        else c.visOff.set(0, 0, 0);
        c.pos.set(a[0], a[1], a[2]); c.quat.set(a[3], a[4], a[5], a[6]).normalize();
        c.vel.set(a[7], a[8], a[9]); c.angVel.set(a[10], a[11], a[12]);
        c.boost = a[13]; c.demolished = demo; c.boosting = !!(a[14] & 2); c.onGround = !!(a[14] & 4); c.supersonic = !!(a[14] & 8);
      }
    });
    // ball (right after my own touch, trust my preview for a moment)
    const b = g.ball, sb = s.b;
    _nv.set(sb[0], sb[1], sb[2]);
    const recentTouch = g.localTouchT !== undefined && g.time - g.localTouchT < 0.3;
    const far = b.pos.distanceTo(_nv) > 700;
    if (!recentTouch || far || g.state !== 'play') {
      if (!b.visOff) b.visOff = new V3();
      if (!far && prevState === g.state) b.visOff.add(_nv2.copy(b.pos).sub(_nv)); else b.visOff.set(0, 0, 0);
      b.pos.copy(_nv); b.vel.set(sb[3], sb[4], sb[5]); b.angVel.set(sb[6], sb[7], sb[8]);
    }
    // pads, tiles, stats
    if (s.p) for (let i = 0; i < g.pads.length && i < s.p.length; i++) g.pads[i].active = s.p[i] === '1';
    if (s.d && ARENA.dropshot) for (let i = 0; i < Tiles.list.length && i < s.d.length; i++) Tiles.list[i].state = +s.d[i];
    if (s.ds) { b.dsTeam = s.ds[0]; b.chargeLevel = s.ds[1]; }
    if (s.k) s.k.forEach((k, i) => { const c = g.cars[i]; if (c) Object.assign(c.stats, { score: k[0], goals: k[1], assists: k[2], saves: k[3], shots: k[4], demos: k[5] }); });
    // events from the host
    for (const e of s.e || []) {
      if (e.q <= Net.lastEv) continue;
      Net.lastEv = e.q;
      const ev = {};
      for (const k in e) {
        if (k === 'q' || k === 'at') continue;
        const v = e[k];
        if (v && typeof v === 'object' && v.$c !== undefined) ev[k] = g.cars[v.$c] || null;
        else if (Array.isArray(v) && v.length === 3) ev[k] = new V3(v[0], v[1], v[2]);
        else ev[k] = v;
      }
      if (ev.type === 'goal' && ev.pos) g.explodeGoal(ev.pos, ev.team);
      g.events.push(ev);
    }
    // chat from everyone else
    for (const ch of s.ch || []) {
      if (ch[0] <= Net.lastChat) continue;
      Net.lastChat = ch[0];
      const car = g.cars[ch[1]];
      if (!car || car === g.player) continue;
      if (ch[3] && car.team !== g.player.team) continue;
      const e = { type: 'chat', car, msg: String(ch[2]).slice(0, 60), team: !!ch[3], t: g.time };
      g.chatLog.push(e); if (g.chatLog.length > 30) g.chatLog.shift();
      g.events.push(e);
    }
  },
};
const _nq = new Q4(), _nv = new V3(), _nv2 = new V3();
