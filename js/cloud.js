'use strict';
/* Online backup of your worlds. When the game runs from its claude.ai link, every world is also saved
   to your own private corner of the game's database, so it comes back even if this device forgets it.
   Brothers and sisters often share one account, so every device keeps its OWN copy of each world
   (with the player's name on it). An online copy is only ever used when this device has no save of
   that world at all, and if there is more than one copy you choose which one. Nothing online ever
   replaces a save this device already has. On the plain website there is no account, so worlds are
   only kept on the device. */

const CLOUD_CHUNK = 80000; // characters per database document (each document holds at most 256 KB)

const Cloud = {
  ready: false, col: null, dev: '', index: [], timers: {}, pushing: {}, lastPush: {}, status: '',

  async init() {
    const use = n => (window.claude && window.claude.use ? window.claude.use(n).catch(() => null) : Promise.resolve(null));
    const [db, user] = await Promise.all([use('db'), use('user')]);
    if (!db || !user || typeof user.id !== 'function') return;
    let uid = null;
    try { uid = await user.id(); } catch (e) { uid = null; }
    if (!uid) return;
    this.col = db.collection('data/users/' + uid);
    this.dev = deviceId();
    this.ready = true;
    await this.pullList();
  },

  /* every online copy: [{id, dev, nick, name, seed, mode, last}] */
  async readIndex() {
    const out = [];
    try {
      const snap = await this.col.doc('backups').get();
      const list = snap.exists && Array.isArray(snap.data().list) ? snap.data().list : [];
      for (const b of list) if (b && typeof b.id === 'string' && typeof b.dev === 'string') out.push(b);
      // copies made by the first version of the backup (one shared copy per world)
      const old = await this.col.doc('worlds').get();
      const ol = old.exists && Array.isArray(old.data().list) ? old.data().list : [];
      for (const w of ol) if (w && typeof w.id === 'string') out.push({ id: w.id, dev: 'old', nick: '', name: w.name, seed: w.seed, mode: w.mode, last: +w.last || 0 });
    } catch (e) { /* offline */ }
    this.index = out;
    return out;
  },

  /* worlds saved online that this device doesn't have join the list (they're only fetched when opened) */
  async pullList() {
    if (!this.ready) return;
    const idx = await this.readIndex();
    const local = G.worldList();
    let changed = false;
    for (const b of idx) {
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

  prefix(id, dev) { return dev === 'old' ? 'w_' + id : 'b_' + dev + '_' + id; },

  /* fetch one online copy of a world; returns the saved text, or null */
  async pull(id, dev) {
    if (!this.ready) return null;
    try {
      const pre = this.prefix(id, dev);
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

  /* upload soon (at most every 90 seconds per world), or right away when asked */
  queue(id, now) {
    if (!this.ready || !id) return;
    clearTimeout(this.timers[id]);
    const wait = now ? 0 : Math.max(0, 90000 - (Date.now() - (this.lastPush[id] || 0)));
    this.timers[id] = setTimeout(() => this.push(id), wait);
  },

  async push(id) {
    if (!this.ready || this.pushing[id]) return;
    let text = null;
    try { text = localStorage.getItem('blockrealm-world-' + id); } catch (e) { text = null; }
    if (!text) return;
    this.pushing[id] = true;
    try {
      const pre = this.prefix(id, this.dev), parts = Math.ceil(text.length / CLOUD_CHUNK);
      for (let i = 0; i < parts; i++) await this.col.doc(pre + '_' + i).set({ d: text.slice(i * CLOUD_CHUNK, (i + 1) * CLOUD_CHUNK) });
      const entry = G.findWorld(id) || {}, last = entry.last || Date.now(), nick = (typeof Net !== 'undefined' && Net.nick) || '';
      await this.col.doc(pre).set({ parts, last, nick });
      const snap = await this.col.doc('backups').get();
      let list = snap.exists && Array.isArray(snap.data().list) ? snap.data().list : [];
      list = list.filter(b => b && !(b.id === id && b.dev === this.dev));
      list.unshift({ id, dev: this.dev, nick, name: entry.name || 'My World', seed: entry.seed, mode: entry.mode, last });
      await this.col.doc('backups').set({ list: list.slice(0, 120) });
      this.lastPush[id] = Date.now();
    } catch (e) { /* try again next time */ }
    this.pushing[id] = false;
  },

  /* deleting a world on this device removes this device's online copy only */
  async remove(id) {
    if (!this.ready) return;
    try {
      const snap = await this.col.doc('backups').get();
      const list = snap.exists && Array.isArray(snap.data().list) ? snap.data().list : [];
      await this.col.doc('backups').set({ list: list.filter(b => b && !(b.id === id && b.dev === this.dev)) });
      await this.col.doc(this.prefix(id, this.dev)).delete();
      this.index = this.index.filter(b => !(b.id === id && b.dev === this.dev));
    } catch (e) { /* best effort */ }
  },
};
