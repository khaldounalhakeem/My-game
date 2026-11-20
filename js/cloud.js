'use strict';
/* Online saves. When the game runs from its claude.ai link, every world is also saved to your own
   private corner of the game's database. Some devices (iPads especially) wipe what a game keeps on
   the device after a while, so the online copy is the one that counts:

   - Brothers and sisters often share one account, so online saves belong to a PLAYER (the name you
     play under), not to the account: each player has their own copy of each world.
   - On a device that has forgotten who you are, the game asks "Who's playing?" and lists the
     players saved online. Pick your name and your worlds come back.
   - Opening a world uses your own online copy if this device has none, or if yours online is newer.
     Another player's copy is never used unless you pick it yourself.
   On the plain website there is no account, so worlds are only kept on the device. */

const CLOUD_CHUNK = 80000; // characters per database document (each document holds at most 256 KB)
const slugOf = n => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'player';
const randomName = n => /^Player\d{3}$/.test(n || '');

const Cloud = {
  ready: false, col: null, dev: '', index: [], players: [], timers: {}, pushing: {}, lastPush: {}, status: '',

  async init() {
    let knowsMe = false;
    try { knowsMe = !!localStorage.getItem('blockrealm-nick'); } catch (e) { knowsMe = false; }
    const use = n => (window.claude && window.claude.use ? window.claude.use(n).catch(() => null) : Promise.resolve(null));
    const [db, user] = await Promise.all([use('db'), use('user')]);
    if (!db || !user || typeof user.id !== 'function') return;
    let uid = null;
    try { uid = await user.id(); } catch (e) { uid = null; }
    if (!uid) return;
    this.col = db.collection('data/users/' + uid);
    this.dev = deviceId();
    this.ready = true;
    await this.readPlayers();
    // this device forgot who's playing: ask, so the right player's worlds come back
    if (!knowsMe && this.players.length && G.state === 'title') {
      const name = await G.ui.whoIsPlaying(this.players);
      if (name) Net.setNick(name);
    }
    await this.pullList();
  },

  async readPlayers() {
    try {
      const snap = await this.col.doc('players').get();
      const list = snap.exists && Array.isArray(snap.data().list) ? snap.data().list : [];
      this.players = list.filter(p => p && typeof p.name === 'string' && p.name && !randomName(p.name)).sort((a, b) => (b.last || 0) - (a.last || 0));
    } catch (e) { this.players = []; }
    return this.players;
  },

  /* every online copy: [{id, p (player) or dev (device, older backups), nick, name, seed, mode, last}] */
  async readIndex() {
    const out = [];
    try {
      const snap = await this.col.doc('backups').get();
      const list = snap.exists && Array.isArray(snap.data().list) ? snap.data().list : [];
      for (const b of list) if (b && typeof b.id === 'string' && (typeof b.p === 'string' || typeof b.dev === 'string')) out.push(b);
      const old = await this.col.doc('worlds').get();
      const ol = old.exists && Array.isArray(old.data().list) ? old.data().list : [];
      for (const w of ol) if (w && typeof w.id === 'string') out.push({ id: w.id, dev: 'old', nick: '', name: w.name, seed: w.seed, mode: w.mode, last: +w.last || 0 });
    } catch (e) { /* offline */ }
    this.index = out;
    return out;
  },

  me() { return slugOf(typeof Net !== 'undefined' ? Net.nick : ''); },
  mine(id) { return this.index.find(b => b.id === id && b.p === this.me()) || null; },

  /* worlds saved online that this device doesn't have join the list (they're only fetched when opened).
     Your own worlds come first; worlds only other players have are listed too, so you can join them. */
  async pullList() {
    if (!this.ready) return;
    const idx = await this.readIndex(), me = this.me();
    const local = G.worldList();
    let changed = false;
    const ordered = idx.slice().sort((a, b) => (a.p === me ? 0 : 1) - (b.p === me ? 0 : 1) || (b.last || 0) - (a.last || 0));
    for (const b of ordered) {
      if (local.find(x => x.id === b.id)) continue;
      local.push({ id: b.id, name: String(b.name || 'My World').slice(0, 32), seed: b.seed, mode: b.mode === 'creative' ? 'creative' : 'survival', last: +b.last || 0, cloud: true });
      changed = true;
    }
    if (changed) { local.sort((a, b) => (b.last || 0) - (a.last || 0)); G.writeWorldList(local); }
    this.status = 'Your worlds are saved online too.';
    G.ui.renderWorldList();
  },

  copiesOf(id) {
    return this.index.filter(b => b.id === id).sort((a, b) => (b.last || 0) - (a.last || 0));
  },

  prefix(c) { return c.p ? 'p_' + c.p + '_' + c.id : c.dev === 'old' ? 'w_' + c.id : 'b_' + c.dev + '_' + c.id; },

  /* fetch one online copy of a world; returns the saved text, or null */
  async pull(c) {
    if (!this.ready || !c) return null;
    try {
      const pre = this.prefix(c);
      const meta = await this.col.doc(pre).get();
      if (!meta.exists) return null;
      const parts = +meta.data().parts || 0;
      let text = '';
      for (let i = 0; i < parts; i++) {
        const p = await this.col.doc(pre + '_' + i).get();
        if (!p.exists || typeof p.data().d !== 'string') return null;
        text += p.data().d;
      }
      JSON.parse(text); // only hand back a complete, readable save
      return text;
    } catch (e) { return null; }
  },

  /* a saved world put back for a player (by whoever looks after the game), used once */
  async restoreFor(id) {
    if (!this.ready) return null;
    // 'gift_' copies are only picked up by games that understand saves listing their block numbers
    for (const kind of ['gift_', 'restore_']) {
      const r = await this.restoreFrom(kind + this.me() + '_' + id);
      if (r) return r;
    }
    return null;
  },
  async restoreFrom(pre) {
    try {
      const meta = await this.col.doc(pre).get();
      if (!meta.exists || meta.data().done) return null;
      const m = meta.data(), parts = +m.parts || 0;
      let text = '';
      for (let i = 0; i < parts; i++) {
        const p = await this.col.doc(pre + '_' + i).get();
        if (!p.exists || typeof p.data().d !== 'string') return null;
        text += p.data().d;
      }
      JSON.parse(text);
      await this.col.doc(pre).set(Object.assign({}, m, { done: true, usedAt: Date.now() }));
      return { text, from: typeof m.from === 'string' ? m.from.slice(0, 40) : '' };
    } catch (e) { return null; }
  },

  /* upload soon (at most every 60 seconds per world), or right away when asked */
  queue(id, now) {
    if (!this.ready || !id) return;
    clearTimeout(this.timers[id]);
    const wait = now ? 0 : Math.max(0, 60000 - (Date.now() - (this.lastPush[id] || 0)));
    this.timers[id] = setTimeout(() => this.push(id), wait);
  },

  async push(id) {
    if (!this.ready || this.pushing[id]) return;
    let text = null;
    try { text = localStorage.getItem('blockrealm-world-' + id); } catch (e) { text = null; }
    if (!text && G.worldId === id && G.lastSaveText) text = G.lastSaveText; // storage refused it: still save online
    if (!text) return;
    this.pushing[id] = true;
    try {
      const nick = (typeof Net !== 'undefined' && Net.nick) || 'Player', p = slugOf(nick);
      const entry = G.findWorld(id) || {}, last = entry.last || Date.now();
      const c = { id, p }, pre = this.prefix(c), parts = Math.ceil(text.length / CLOUD_CHUNK);
      for (let i = 0; i < parts; i++) await this.col.doc(pre + '_' + i).set({ d: text.slice(i * CLOUD_CHUNK, (i + 1) * CLOUD_CHUNK) });
      await this.col.doc(pre).set({ parts, last, nick });
      const snap = await this.col.doc('backups').get();
      let list = snap.exists && Array.isArray(snap.data().list) ? snap.data().list : [];
      list = list.filter(b => b && !(b.id === id && b.p === p));
      const row = { id, p, nick, name: entry.name || 'My World', seed: entry.seed, mode: entry.mode, last };
      list.unshift(row);
      await this.col.doc('backups').set({ list: list.slice(0, 150) });
      this.index = this.index.filter(b => !(b.id === id && b.p === p)); this.index.unshift(row);
      // remember this player, so a device that forgot can ask "Who's playing?"
      if (!randomName(nick)) {
        const ps = await this.col.doc('players').get();
        let pl = ps.exists && Array.isArray(ps.data().list) ? ps.data().list : [];
        const was = pl.find(x => x && slugOf(x.name) === p);
        if (!was || Date.now() - (was.last || 0) > 3600000 || was.name !== nick) {
          pl = pl.filter(x => x && slugOf(x.name) !== p);
          pl.unshift({ name: nick, last: Date.now() });
          await this.col.doc('players').set({ list: pl.slice(0, 20) });
        }
      }
      this.lastPush[id] = Date.now();
    } catch (e) { /* try again next time */ }
    this.pushing[id] = false;
  },

  /* deleting a world removes this player's online copy only */
  async remove(id) {
    if (!this.ready) return;
    const p = this.me();
    try {
      const snap = await this.col.doc('backups').get();
      const list = snap.exists && Array.isArray(snap.data().list) ? snap.data().list : [];
      await this.col.doc('backups').set({ list: list.filter(b => b && !(b.id === id && (b.p === p || b.dev === this.dev))) });
      await this.col.doc(this.prefix({ id, p })).delete();
      this.index = this.index.filter(b => !(b.id === id && (b.p === p || b.dev === this.dev)));
    } catch (e) { /* best effort */ }
  },
};
