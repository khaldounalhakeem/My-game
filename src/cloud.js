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

  async init() {
    const api = window.claude;
    if (!api || !api.use) { this.status = 'local'; return; }
    this.status = 'connecting';
    try {
      const [user, db] = await Promise.all([api.use('user'), api.use('db')]);
      const id = user ? await user.id() : null;
      if (!db || !id) { this.status = 'local'; return; }
      const doc = db.doc('data/users/' + id + '/save');
      const snap = await doc.get();
      if (snap.exists) this.merge(snap.data());
      // only start writing once the account copy has been read, so a fresh device can never overwrite it
      this.doc = doc;
      this.status = 'cloud';
      // first save (or local progress made before the cloud answered)
      this.dirty = true; this.flush();
    } catch (e) {
      this.status = 'error';
    }
    if (typeof UI !== 'undefined' && UI.screen === 'main') UI.show('main');
  },

  // cloud copy wins when it is newer than what this device has
  merge(data) {
    if (!data || !data.profile) return;
    // keep whichever copy has more progress; on a tie, the newer one
    const games = (p) => (p.wins || 0) + (p.losses || 0) + (p.level || 1) * 0.001 + (p.xp || 0) * 1e-9;
    const localG = games(Profile), cloudG = games(data.profile);
    const localAt = Profile.savedAt || 0, cloudAt = data.savedAt || 0;
    if (localG > cloudG + 1e-12 || (Math.abs(localG - cloudG) < 1e-12 && cloudAt < localAt)) return;
    const p = data.profile;
    for (const k of Object.keys(Profile)) delete Profile[k];
    Object.assign(Profile, JSON.parse(JSON.stringify(DEFAULT_PROFILE)), p);
    Profile.car = Object.assign({}, DEFAULT_PROFILE.car, p.car || {});
    Profile.unlocked = Object.assign({}, DEFAULT_PROFILE.unlocked, p.unlocked || {});
    for (const k of ['octane', 'dominus', 'fennec']) if (!Profile.unlocked.body.includes(k)) Profile.unlocked.body.unshift(k);
    if (data.settings) Object.assign(Settings, data.settings);
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
    if (this.status === 'cloud') return '☁ Progress saved to your Claude account';
    if (this.status === 'connecting') return '☁ Connecting to your account…';
    if (!Store.works()) return '⚠ Not saving here: sign in to Claude (or use a save code in Profile)';
    if (this.status === 'error') return '⚠ Saved on this device only (account save unavailable)';
    return '⚠ Saved on this device only: sign in to Claude to save to your account';
  },
};

// save hooks: stamp the time, keep a local copy, and sync to the cloud
function saveProfile() { Profile.savedAt = Date.now(); Store.set('profile', Profile); Cloud.schedule(); }
function saveSettings() { Profile.savedAt = Date.now(); Store.set('settings', Settings); Store.set('profile', Profile); Cloud.schedule(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) Cloud.flush(); });
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
