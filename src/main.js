'use strict';
// ============================================================================
// Boot, main loop, match lifecycle, progression
// ============================================================================

const CUR = { game: null, attract: false, paused: false, menuCam: true, acc: 0, last: 0, endT: 0 };

function boot() {
  ensureRatings();
  Cloud.init();
  Object.assign(Net.settings, Store.get('netcfg', {}));
  Net.init();
  initRenderer(document.getElementById('gl'));
  const glc = document.getElementById('gl');
  glc.addEventListener('webglcontextlost', (e) => { e.preventDefault(); }, false); // let Safari restore the GPU context instead of freezing
  if (Profile.activeMatch) { delete Profile.activeMatch; saveProfile(); setTimeout(() => UI.toast('Your last match was interrupted, so it was not counted.'), 1500); }
  Input.init();
  UI.init();
  R.cam.ballCam = Settings.ballCamDefault;
  Input.buttons.ballcam.el.classList.toggle('active', R.cam.ballCam);
  startAttract();
  UI.show('title');
  window.addEventListener('resize', () => { resizeRenderer(); });
  window.addEventListener('orientationchange', () => setTimeout(resizeRenderer, 300));
  document.addEventListener('visibilitychange', () => { if (document.hidden && CUR.game && !CUR.attract && !CUR.paused && CUR.game.kind) pauseGame(); });
  // tap during replay = skip
  document.getElementById('gl').addEventListener('pointerdown', skipReplay);
  document.getElementById('touch').addEventListener('pointerdown', (e) => { if (CUR.game && CUR.game.state === 'replay') skipReplay(); });
  requestAnimationFrame(loop);
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ screen: UI.screen }));
}

function skipReplay() {
  const g = CUR.game;
  if (g && !CUR.attract && g.state === 'replay') { g.finishReplay(); UI.hudEls.banner.className = 'banner'; }
}

function startAttract() {
  CUR.attract = true; CUR.menuCam = true; CUR.paused = false;
  const g = new Game({ kind: 'match', mode: 'soccar', teamSize: 2, level: 'allstar', map: 'auto', attract: true, replays: false, mutators: { matchLength: 0 } });
  CUR.game = g;
  buildWorld(g);
  UI.showHud(false, g);
  Input.show(false);
  Sound.setCrowd(0.4);
}

function startMatch(cfg) {
  cfg = JSON.parse(JSON.stringify(cfg));
  if (cfg.kind === 'match' && cfg.competitive) cfg.mutators = {};
  if (cfg.kind === 'match') { const r = matchRating(cfg); cfg.botRating = r != null ? r : undefined; }
  Garage.close();
  const g = new Game(cfg);
  CUR.game = g; CUR.attract = false; CUR.menuCam = false; CUR.paused = false; CUR.acc = 0; CUR.endT = 0;
  buildWorld(g);
  R.cam.init = false;
  R.cam.ballCam = Settings.ballCamDefault;
  Input.buttons.ballcam.el.classList.toggle('active', R.cam.ballCam);
  // place the camera behind the player right away
  const f = g.player.fwd(new V3());
  R.cam.dir.copy(f); R.cam.pos.copy(g.player.pos).addScaledVector(f, -400).add(new V3(0, 150, 0)); R.cam.up.set(0, 1, 0);
  UI.show(null);
  UI.showHud(true, g);
  Input.show(true, { item: g.mode === 'rumble' });
  Sound.init(); Sound.stopMusic(); Sound.setCrowd(g.kind === 'match' ? 0.6 : 0.15);
  requestWakeLock();
  if (g.kind === 'match') { Profile.activeMatch = { mode: g.mode, size: g.cfg.teamSize, ranked: !!g.cfg.competitive, at: Date.now() }; saveProfile(); }
}

// keep the iPad screen awake during matches
let _wakeLock = null;
function requestWakeLock() {
  try {
    if (navigator.wakeLock && !_wakeLock) navigator.wakeLock.request('screen').then(l => { _wakeLock = l; l.addEventListener('release', () => { _wakeLock = null; }); }).catch(() => {});
  } catch (e) { /* unsupported */ }
}

function pauseGame() {
  if (!CUR.game || CUR.attract || CUR.game.state === 'ended') return;
  CUR.paused = true;
  Input.show(false);
  UI.show('pause');
}
function resumeGame() {
  CUR.paused = false;
  UI.show(null);
  Input.show(true, { item: CUR.game.mode === 'rumble' });
}
function quitToMenu(screen) {
  if (Profile.activeMatch) { delete Profile.activeMatch; saveProfile(); }
  // leaving a ranked match early counts as a loss
  const g = CUR.game;
  if (g && !CUR.attract && g.online) { Net.leaveMatch(g); if (!screen) screen = Net.inParty() ? 'party' : 'main'; }
  if (g && !CUR.attract && g.kind === 'match' && g.cfg.competitive && g.state !== 'ended') {
    const res = applyRatingResult(g.cfg, false, -3);
    g.player.stats && Profile.losses++;
    saveProfile();
    if (res) setTimeout(() => UI.toast(`Forfeit — counted as a loss (${res.delta} MMR)`), 300);
  }
  startAttract();
  Sound.startMusic();
  UI.show(screen || 'main');
}

function applySettings(rebuild) {
  Sound.applyVolumes();
  Input.applyLayout();
  setFov();
  if (rebuild) {
    const q = qualityLevel();
    R.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q >= 2 ? 1.6 : q === 1 ? 1.2 : 0.85));
    resizeRenderer();
  }
}

// ---------------------------------------------------------------------------
function loop(t) {
  requestAnimationFrame(loop);
  const now = t / 1000;
  let dt = CUR.last ? now - CUR.last : 1 / 60;
  CUR.last = now;
  dt = Math.min(dt, 0.1);
  const g = CUR.game;

  Input.pollGamepad(dt);
  if (UI.screen === 'garage' && Garage.active) { Garage.render(dt); return; }

  // online matches keep running behind the pause menu (the others are still playing)
  if (g && (!CUR.paused || g.online)) {
    const ctrlIn = (!CUR.attract && !UI.screen) ? Input.read() : null;
    if (!ctrlIn && g.online && !g.player.isBot) g.player.ctrl = newControls();
    CUR.acc += Math.min(dt, 0.05);
    let steps = 0;
    while (CUR.acc >= PHYS.TICK && steps < 8) {
      if (ctrlIn && !g.player.isBot) Object.assign(g.player.ctrl, ctrlIn);
      try { g.update(PHYS.TICK); } catch (e) { console.error(e); }
      CUR.acc -= PHYS.TICK; steps++;
    }
    if (steps >= 8) CUR.acc = 0;
    try { Net.tick(g, dt); } catch (e) { console.error(e); }
    // a glitch in effects or the HUD must never stop the match from finishing
    try { processEvents(g); } catch (e) { console.error(e); }
    if (!CUR.attract) {
      try { UI.hudUpdate(g, dt); } catch (e) { console.error(e); }
      if (g.state === 'ended' && g.kind === 'training' && !UI.screen) {
        CUR.endT += dt;
        if (CUR.endT > 1.5) { Input.show(false); UI.showHud(false, g); UI.show('trainingEnd', { results: g.trainingResults }); }
      }
    } else if (g.state === 'ended' || g.time > 600) startAttract();
    try { Sound.updateCar(g.player, !CUR.attract && !UI.screen && g.state !== 'replay'); } catch (e) { /* audio is optional */ }
  } else try { Sound.updateCar(null, false); } catch (e) { /* audio is optional */ }
  if (g && !CUR.attract && g.state === 'ended' && g.kind === 'match') endOfMatch(g, dt);

  let replayFrame = null;
  if (g && g.state === 'replay') {
    const snap = g.replay.snap;
    const i = Math.floor(g.replay.t * 30);
    if (i >= snap.length - 1) { g.finishReplay(); UI.hudEls.banner.className = 'banner'; }
    else replayFrame = lerpFrame(snap[i], snap[i + 1], g.replay.t * 30 - i);
  }
  if (g) {
    CUR.menuCam = CUR.attract;
    if (CUR.attract) attractCamera(dt, g); else updateCamera(dt, g, replayFrame);
    renderFrame(dt, g, replayFrame);
  }
}

function lerpFrame(a, b, t) {
  const L = (x, y) => x + (y - x) * t;
  const qa = new Q4(), qb = new Q4();
  const f = { b: a.b.slice(), c: [] };
  for (let k = 0; k < 3; k++) f.b[k] = L(a.b[k], b.b[k]);
  qa.set(a.b[3], a.b[4], a.b[5], a.b[6]); qb.set(b.b[3], b.b[4], b.b[5], b.b[6]); qa.slerp(qb, t); f.b[3] = qa.x; f.b[4] = qa.y; f.b[5] = qa.z; f.b[6] = qa.w;
  for (let i = 0; i < a.c.length; i++) {
    const ca = a.c[i], cb = b.c[i], c = ca.slice();
    for (let k = 0; k < 3; k++) c[k] = L(ca[k], cb[k]);
    qa.set(ca[3], ca[4], ca[5], ca[6]); qb.set(cb[3], cb[4], cb[5], cb[6]); qa.slerp(qb, t); c[3] = qa.x; c[4] = qa.y; c[5] = qa.z; c[6] = qa.w;
    c[10] = L(ca[10], cb[10]);
    f.c.push(c);
  }
  return f;
}

// cinematic camera for the menu attract mode
function attractCamera(dt, g) {
  const C = R.cam, cam = R.camera;
  const b = g.ball.pos;
  const a = R.time * 0.07;
  const want = tmpV(b.x * 0.4 + Math.cos(a) * 2600, 700 + Math.sin(a * 0.7) * 250, b.z * 0.6 + Math.sin(a) * 3200);
  keepInArena(want, 100);
  C.pos.lerp(want, damp(0.8, dt)); C.look.lerp(tmpV().copy(b).setY(Math.min(b.y, 600)), damp(2, dt));
  cam.position.copy(C.pos); cam.up.set(0, 1, 0); cam.lookAt(C.look);
}

// ---------------------------------------------------------------------------
function processEvents(g) {
  const evs = g.events; g.events = [];
  const me = g.player;
  const live = !CUR.attract;
  for (const ev of evs) {
    FX.handle(ev, g);
    if (live) UI.handleEvent(ev, g);
    const v = ev.car && ev.car !== me ? Sound.distVol(ev.car.pos) : 1;
    if (!live) { if (ev.type === 'goal') Sound.cheer(0.4, 2); continue; }
    switch (ev.type) {
      case 'hit': Sound.play('hit', { s: ev.strength / 2000, vol: Sound.distVol(ev.pos) * 0.7 + 0.3 }); if (ev.strength > 2500) Sound.cheer(0.25, 0.8); break;
      case 'bounce': Sound.play('bounce', { vol: clamp(ev.strength / 1500, 0, 1) * Sound.distVol(ev.pos) }); break;
      case 'jump': case 'doublejump': Sound.play('jump', { vol: v }); break;
      case 'dodge': Sound.play('dodge', { vol: v }); break;
      case 'land': if (ev.car === me && ev.impact < -300) Sound.play('land', { vol: clamp(-ev.impact / 1200, 0, 1) }); break;
      case 'pad': if (ev.car === me) Sound.play(ev.pad.big ? 'padBig' : 'padSmall'); break;
      case 'demo': Sound.play('demo', { vol: Math.max(v, Sound.distVol(ev.pos)) }); Sound.cheer(0.4, 1.2); break;
      case 'bump': Sound.play('bump', { vol: v }); break;
      case 'pinch': Sound.play('hit', { s: 1.5 }); Sound.play('whoosh'); Sound.cheer(0.6, 1.2); break;
      case 'fptool': Sound.play('click'); break;
      case 'goal': Sound.play('horn'); Sound.cheer(1, 4); break;
      case 'count': Sound.play('count'); break;
      case 'go': Sound.play('go'); break;
      case 'save': Sound.cheer(0.7, 1.5); break;
      case 'itemuse': Sound.play('itemuse', { vol: v }); break;
      case 'tiles': Sound.play('tile'); break;
      case 'end': Sound.play('horn'); Sound.cheer(0.8, 4); break;
      case 'trainingResult': Sound.play(ev.success ? 'levelup' : 'back'); break;
    }
  }
}

// match end → post-match screen (runs even while paused, and survives errors)
function endOfMatch(g, dt) {
  CUR.endT += dt;
  // save the result the moment the match ends, so nothing can lose it
  if (!g.result) {
    try { g.result = finishMatchProgress(g); } catch (e) { console.error(e); g.result = { game: g, xp: 0, xpFrom: 0, xpTo: 0, leveled: false, drops: [], rating: null }; }
    Input.show(false);
  }
  if (CUR.endT > 2.5 && UI.screen !== 'post') {
    CUR.paused = false;
    try { UI.showHud(false, g); } catch (e) { console.error(e); }
    try { UI.show('post', g.result); } catch (e) {
      console.error(e);
      // fall back to a bare post screen without the extras
      try { UI.show('post', { game: g, xp: g.result.xp || 0, xpFrom: 0, xpTo: 0, leveled: false, drops: [], rating: null }); } catch (e2) { console.error(e2); startAttract(); UI.show('main'); }
    }
    try { Sound.startMusic(); } catch (e) { /* audio is optional */ }
  }
}

// ---------------------------------------------------------------------------
// Progression: XP, levels, item drops, competitive rating, career stats
// ---------------------------------------------------------------------------
function finishMatchProgress(g) {
  const P = Profile, me = g.player;
  delete P.activeMatch;
  const won = g.winner === me.team;
  // the win/loss and rank change are recorded and saved first, before anything optional
  const goalDiff = g.score[me.team] - g.score[1 - me.team];
  let rating = null;
  try { rating = applyRatingResult(g.cfg, won, goalDiff); } catch (e) { console.error(e); }
  if (won) P.wins = (P.wins || 0) + 1; else P.losses = (P.losses || 0) + 1;
  P.goals = (P.goals || 0) + me.stats.goals; P.assists = (P.assists || 0) + me.stats.assists;
  P.saves = (P.saves || 0) + me.stats.saves; P.demos = (P.demos || 0) + me.stats.demos;
  if (g.mvp === me) P.mvps = (P.mvps || 0) + 1;
  // not connected to the account (yet): remember this result so it's added to the account copy when it loads
  const xpEarned = Math.round(150 + me.stats.score * 0.6 + (won ? 150 : 0) + (g.mvp === me ? 75 : 0));
  if (Cloud.status !== 'cloud') {
    P.offline = (P.offline || []).slice(-49);
    P.offline.push({ cfg: { mode: g.cfg.mode, teamSize: g.cfg.teamSize, competitive: !!g.cfg.competitive, level: g.cfg.level }, won, gd: goalDiff, xp: xpEarned,
      goals: me.stats.goals, assists: me.stats.assists, saves: me.stats.saves, demos: me.stats.demos, mvp: g.mvp === me, at: Date.now() });
  }
  saveProfile();
  // XP, levels and item drops
  if (!(P.level >= 1)) P.level = 1;
  if (!isFinite(P.xp)) P.xp = 0;
  const xpFrom = Math.min(100, P.xp / xpForLevel(P.level) * 100);
  const xp = Math.round(150 + me.stats.score * 0.6 + (won ? 150 : 0) + (g.mvp === me ? 75 : 0));
  let leveled = false;
  const drops = [];
  try {
    P.xp += xp;
    while (P.xp >= xpForLevel(P.level)) {
      P.xp -= xpForLevel(P.level); P.level++; leveled = true;
      const d = rollDrop(); if (d) drops.push(d);
    }
    if (won && Math.random() < 0.35) { const d = rollDrop(); if (d) drops.push(d); }
  } catch (e) { console.error(e); }
  saveProfile();
  if (leveled) try { Sound.play('levelup'); } catch (e) { /* audio is optional */ }
  const xpTo = Math.min(100, P.xp / xpForLevel(P.level) * 100);
  return { game: g, xp, xpFrom: leveled ? 0 : xpFrom, xpTo, leveled, drops, rating };
}

function rollDrop() {
  const P = Profile;
  const locked = [];
  for (const cat of Object.keys(ITEMS)) for (const k of Object.keys(ITEMS[cat])) if (!(P.unlocked[cat] || []).includes(k)) locked.push([cat, k]);
  if (!locked.length) return null;
  // rarer items are less likely
  const weighted = locked.map(([c, k]) => ({ c, k, w: 1 / (1 + itemRarity(c, k)) }));
  let r = Math.random() * weighted.reduce((a, b) => a + b.w, 0);
  let pickd = weighted[0];
  for (const it of weighted) { r -= it.w; if (r <= 0) { pickd = it; break; } }
  (P.unlocked[pickd.c] = P.unlocked[pickd.c] || []).push(pickd.k);
  (P.newItems = P.newItems || []).push(pickd.c + ':' + pickd.k);
  const catNames = { body: 'Car', decal: 'Decal', wheels: 'Wheels', boost: 'Boost', explosion: 'Goal Explosion', topper: 'Topper', antenna: 'Antenna' };
  return { name: ITEMS[pickd.c][pickd.k], rarity: itemRarity(pickd.c, pickd.k), catName: catNames[pickd.c] };
}

window.addEventListener('load', boot);
