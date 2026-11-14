'use strict';
/* Online backup of your worlds. When the game runs from its claude.ai link, every world is also saved
   to your own private corner of the game's database, so it comes back even if this device forgets it,
   or when you open the game on another device signed in to the same account. On the plain website
   there is no account, so worlds are only kept on the device. */

const CLOUD_CHUNK = 80000; // characters per database document (each document holds at most 256 KB)

const Cloud = {
  ready: false, col: null, timers: {}, pushing: {}, lastPush: {}, status: '',

  async init() {
    const use = n => (window.claude && window.claude.use ? window.claude.use(n).catch(() => null) : Promise.resolve(null));
    const [db, user] = await Promise.all([use('db'), use('user')]);
    if (!db || !user || typeof user.id !== 'function') return;
    let uid = null;
    try { uid = await user.id(); } catch (e) { uid = null; }
    if (!uid) return;
    this.col = db.collection('data/users/' + uid);
    this.ready = true;
    await this.pullList();
  },

  /* worlds saved online that this device doesn't have yet (or has an older copy of) join the list */
  async pullList() {
    if (!this.ready) return;
    try {
      const snap = await this.col.doc('worlds').get();
      const list = snap.exists && Array.isArray(snap.data().list) ? snap.data().list : [];
      let changed = false;
      const local = G.worldList();
      for (const w of list) {
        if (!w || typeof w.id !== 'string') continue;
        const mine = local.find(x => x.id === w.id);
        if (!mine) { local.push({ id: w.id, name: String(w.name || 'My World').slice(0, 32), seed: w.seed, mode: w.mode === 'creative' ? 'creative' : 'survival', last: +w.last || 0, cloud: true }); changed = true; }
        else if ((+w.last || 0) > (mine.last || 0) + 1000) { mine.cloudNewer = true; changed = true; }
      }
      if (changed) { local.sort((a, b) => (b.last || 0) - (a.last || 0)); G.writeWorldList(local); }
      this.status = 'Your worlds are saved online too.';
      G.ui.renderWorldList();
    } catch (e) { this.status = ''; }
  },

  /* fetch a world's save from online; returns the saved text, or null */
  async pull(id) {
    if (!this.ready) return null;
    try {
      const meta = await this.col.doc('w_' + id).get();
      if (!meta.exists) return null;
      const parts = +meta.data().parts || 0;
      let text = '';
      for (let i = 0; i < parts; i++) {
        const p = await this.col.doc('w_' + id + '_' + i).get();
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
      const parts = Math.ceil(text.length / CLOUD_CHUNK);
      for (let i = 0; i < parts; i++) await this.col.doc('w_' + id + '_' + i).set({ d: text.slice(i * CLOUD_CHUNK, (i + 1) * CLOUD_CHUNK) });
      const entry = G.findWorld(id) || {};
      await this.col.doc('w_' + id).set({ parts, last: entry.last || Date.now() });
      // the list of worlds, without the per-device flags
      const list = G.worldList().filter(w => !w.cloud || w.id === id).map(w => ({ id: w.id, name: w.name, seed: w.seed, mode: w.mode, last: w.last || 0 }));
      const snap = await this.col.doc('worlds').get();
      const old = snap.exists && Array.isArray(snap.data().list) ? snap.data().list : [];
      for (const w of old) if (w && w.id && !list.find(x => x.id === w.id)) list.push(w);
      await this.col.doc('worlds').set({ list: list.slice(0, 60) });
      this.lastPush[id] = Date.now();
    } catch (e) { /* try again next time */ }
    this.pushing[id] = false;
  },

  async remove(id) {
    if (!this.ready) return;
    try {
      const snap = await this.col.doc('worlds').get();
      const list = snap.exists && Array.isArray(snap.data().list) ? snap.data().list : [];
      await this.col.doc('worlds').set({ list: list.filter(w => w && w.id !== id) });
      await this.col.doc('w_' + id).delete();
    } catch (e) { /* best effort */ }
  },
};
