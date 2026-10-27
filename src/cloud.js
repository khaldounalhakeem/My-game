'use strict';
// ============================================================================
// Cloud save: progress (profile, ranks, garage, settings) is stored in the
// viewer's private space in the artifact database, so it survives closing the
// game, clearing Safari data or switching devices. Falls back to on-device
// storage when the database isn't available (e.g. the plain HTML file).
// ============================================================================

const Cloud = {
  status: 'local', // local | connecting | cloud | error
  doc: null, timer: null, writing: false, dirty: false, lastSaved: 0,

  // why we're not connected (shown on the menus): standalone | signedout | permission | error
  reason: '',
  async init() {
    if (this.status === 'cloud' || this._busy) return;
    this._busy = true;
    try { await this._connect(); } finally { this._busy = false; }
    if (this.mergedOffline && typeof UI !== 'undefined') { const n = this.mergedOffline; this.mergedOffline = 0; setTimeout(() => UI.toast(`${n} match${n > 1 ? 'es' : ''} played before connecting ${n > 1 ? 'were' : 'was'} added to your account`), 400); }
    if (typeof UI !== 'undefined' && (UI.screen === 'main' || UI.screen === 'profile')) UI.show(UI.screen);
  },
  async _connect() {
    const api = window.claude;
    if (!api || !api.use) { this.status = 'local'; this.reason = 'standalone'; return; }
    this.status = 'connecting';
    try {
      const [user, db, perms] = await Promise.all([api.use('user'), api.use('db'), api.use('permissions').catch(() => null)]);
      this.perms = perms;
      if (!user || !db) { this.status = 'local'; this.reason = 'signedout'; return; }
      if (perms) {
        let st = {};
        try { st = await perms.state(); } catch (e) { /* older platform */ }
        if (st.db === 'denied' || st.user === 'denied') { this.status = 'local'; this.reason = 'permission'; return; }
      }
      const id = await user.id();
      if (!id) { this.status = 'local'; this.reason = 'signedout'; return; }
      const doc = db.doc('data/users/' + id + '/save');
      const snap = await doc.get();
      if (snap.exists) this.merge(snap.data());
      // only start writing once the account copy has been read, so a fresh device can never overwrite it
      this.doc = doc;
      this.status = 'cloud'; this.reason = '';
      this.dirty = true; this.flush();
    } catch (e) {
      console.warn('cloud save:', e && (e.code || e.message || e));
      const c = e && e.code;
      this.status = 'local';
      this.reason = c === 'not_granted' || c === 'denied' ? 'permission' : c === 'unauthenticated' || c === 'signed_out' ? 'signedout' : 'error';
    }
  },
  // the "connect to my account" button: ask for permission, then try again
  async connect() {
    if (this.perms) {
      try {
        const st = await this.perms.request(['db', 'user']);
        if ((st.db === 'denied' || st.user === 'denied')) { try { await this.perms.manage(); } catch (e) { /* menu fallback */ } }
      } catch (e) { /* ignore */ }
    }
    this.status = 'local';
    await this.init();
    return this.status === 'cloud';
  },

  // cloud copy wins when it is newer than what this device has
  merge(data) {
    if (!data || !data.profile) return;
    // matches finished on this device before the account loaded
    const pending = (Profile.offline || []).slice();
    // keep whichever copy has more progress; on a tie, the newer one
    const games = (p) => (p.wins || 0) + (p.losses || 0) + (p.level || 1) * 0.001 + (p.xp || 0) * 1e-9;
    const localG = games(Profile), cloudG = games(data.profile);
    const localAt = Profile.savedAt || 0, cloudAt = data.savedAt || 0;
    if (localG > cloudG + 1e-12 || (Math.abs(localG - cloudG) < 1e-12 && cloudAt < localAt)) { Profile.offline = []; return; }
    const p = data.profile;
    for (const k of Object.keys(Profile)) delete Profile[k];
    Object.assign(Profile, JSON.parse(JSON.stringify(DEFAULT_PROFILE)), p);
    Profile.car = Object.assign({}, DEFAULT_PROFILE.car, p.car || {});
    Profile.unlocked = Object.assign({}, DEFAULT_PROFILE.unlocked, p.unlocked || {});
    for (const k of ['octane', 'dominus', 'fennec']) if (!Profile.unlocked.body.includes(k)) Profile.unlocked.body.unshift(k);
    if (data.settings) Object.assign(Settings, data.settings);
    // add the matches played here before the account loaded, so none are lost
    Profile.offline = [];
    for (const r of pending) {
      try {
        if (typeof applyRatingResult === 'function') applyRatingResult(r.cfg, r.won, r.gd);
        if (r.won) Profile.wins = (Profile.wins || 0) + 1; else Profile.losses = (Profile.losses || 0) + 1;
        Profile.goals = (Profile.goals || 0) + (r.goals || 0); Profile.assists = (Profile.assists || 0) + (r.assists || 0);
        Profile.saves = (Profile.saves || 0) + (r.saves || 0); Profile.demos = (Profile.demos || 0) + (r.demos || 0);
        if (r.mvp) Profile.mvps = (Profile.mvps || 0) + 1;
        Profile.xp = (Profile.xp || 0) + (r.xp || 0);
        while (Profile.xp >= xpForLevel(Profile.level || 1)) { Profile.xp -= xpForLevel(Profile.level || 1); Profile.level = (Profile.level || 1) + 1; }
      } catch (e) { console.error(e); }
    }
    if (pending.length) this.mergedOffline = pending.length;
    try { localStorage.setItem('boostleague.profile', JSON.stringify(Profile)); localStorage.setItem('boostleague.settings', JSON.stringify(Settings)); } catch (e) { /* ignore */ }
    if (typeof applySettings === 'function') applySettings(true);
  },

  // called after every local save; coalesces bursts into one write
  schedule() {
    this.dirty = true;
    if (!this.doc) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 1200);
  },
  async flush() {
    if (!this.doc || !this.dirty || this.writing) return;
    this.dirty = false; this.writing = true;
    try {
      await this.doc.set({ v: 1, savedAt: Profile.savedAt || Date.now(), profile: JSON.parse(JSON.stringify(Profile)), settings: JSON.parse(JSON.stringify(Settings)) });
      this.lastSaved = Date.now(); this.status = 'cloud';
    } catch (e) {
      if (e && e.code === 'unavailable') { this.dirty = true; setTimeout(() => this.flush(), 2500 + Math.random() * 2000); }
      else this.status = 'error';
    }
    this.writing = false;
    if (this.dirty) this.schedule();
  },
  label() {
    if (this.status === 'cloud') return '☁ Synced with your Claude account';
    if (this.status === 'connecting') return '☁ Connecting to your Claude account…';
    if (this.reason === 'permission') return '⚠ Not connected: allow access to your Claude account (button below)';
    if (this.reason === 'signedout') return '⚠ Not signed in to Claude in this browser, so progress here is NOT your account progress. Sign in at claude.ai and reopen the game.';
    if (!Store.works()) return '⚠ Not saving here: sign in to Claude (or use a save code in Profile)';
    if (this.reason === 'error') return '⚠ Couldn\'t reach your Claude account. Saved on this device for now.';
    return '⚠ Saved on this device only (the offline file can\'t reach your Claude account)';
  },
  canConnect() { return this.status !== 'cloud' && this.status !== 'connecting' && this.reason !== 'standalone'; },
};

// save hooks: stamp the time, keep a local copy, and sync to the cloud
function saveProfile() { Profile.savedAt = Date.now(); Store.set('profile', Profile); Cloud.schedule(); }
function saveSettings() { Profile.savedAt = Date.now(); Store.set('settings', Settings); Store.set('profile', Profile); Cloud.schedule(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) Cloud.flush(); else if (Cloud.status !== 'cloud') Cloud.init(); });
window.addEventListener('pagehide', () => Cloud.flush());

// save codes: copy your whole progress as text and load it anywhere
function exportSaveCode() {
  const json = JSON.stringify({ v: 1, profile: Profile, settings: Settings });
  return 'BL1-' + btoa(unescape(encodeURIComponent(json)));
}
function importSaveCode(code) {
  const m = String(code || '').trim().match(/^BL1-([A-Za-z0-9+/=\s]+)$/);
  if (!m) return false;
  let data;
  try { data = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/\s+/g, ''))))); } catch (e) { return false; }
  if (!data || !data.profile || typeof data.profile !== 'object') return false;
  const p = data.profile;
  for (const k of Object.keys(Profile)) delete Profile[k];
  Object.assign(Profile, JSON.parse(JSON.stringify(DEFAULT_PROFILE)), p);
  Profile.car = Object.assign({}, DEFAULT_PROFILE.car, p.car || {});
  Profile.unlocked = Object.assign({}, DEFAULT_PROFILE.unlocked, p.unlocked || {});
  for (const k of ['octane', 'dominus', 'fennec']) if (!Profile.unlocked.body.includes(k)) Profile.unlocked.body.unshift(k);
  if (data.settings) Object.assign(Settings, data.settings);
  ensureRatings();
  saveSettings();
  return true;
}
