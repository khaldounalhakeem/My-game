'use strict';
// ============================================================================
// UI: menus, HUD, scoreboard, quick chat, post-match, garage, settings
// ============================================================================

const $ = (s, r) => (r || document).querySelector(s);
const h = (tag, attrs, ...kids) => {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
    else if (k === 'html') el.innerHTML = attrs[k];
    else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) el.setAttribute(k, attrs[k]);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};
const fmtClock = (s) => { s = Math.ceil(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

const MUTATOR_DEFS = [
  ['matchLength', 'Match Length', [[300, '5 Minutes'], [180, '3 Minutes'], [600, '10 Minutes'], [0, 'Unlimited']]],
  ['maxScore', 'Max Score', [[0, 'Unlimited'], [1, '1 Goal'], [3, '3 Goals'], [5, '5 Goals'], [7, '7 Goals']]],
  ['gameSpeed', 'Game Speed', [[1, 'Default'], [0.5, 'Slo-mo'], [0.75, 'Time Warp']]],
  ['ballSpeed', 'Ball Max Speed', [[1, 'Default'], [0.6, 'Slow'], [1.5, 'Fast'], [2.2, 'Super Fast']]],
  ['ballType', 'Ball Type', [['default', 'Default'], ['cube', 'Cube'], ['puck', 'Puck'], ['beach', 'Beach Ball'], ['basketball', 'Basketball']]],
  ['ballWeight', 'Ball Physics', [[1, 'Default'], [0.6, 'Light'], [1.5, 'Heavy'], [0.35, 'Super Light']]],
  ['ballSize', 'Ball Size', [[1, 'Default'], [0.75, 'Small'], [1.5, 'Large'], [2.5, 'Gigantic']]],
  ['bounciness', 'Ball Bounciness', [[1, 'Default'], [0.6, 'Low'], [1.4, 'High'], [1.65, 'Super High']]],
  ['boost', 'Boost Amount', [['default', 'Default'], ['unlimited', 'Unlimited'], ['recharge', 'Recharge (Slow)'], ['none', 'No Boost']]],
  ['gravity', 'Gravity', [[1, 'Default'], [0.4, 'Low'], [1.6, 'High'], [2.5, 'Super High']]],
  ['demolish', 'Demolish', [['default', 'Default'], ['disabled', 'Disabled'], ['friendly', 'Friendly Fire'], ['contact', 'On Contact']]],
  ['respawn', 'Respawn Time', [[3, '3 Seconds'], [2, '2 Seconds'], [1, '1 Second']]],
];

const UI = {
  screen: null, playCfg: null, hudEls: {}, awards: [], quickOpen: false,
  init() {
    this.root = $('#ui');
    this.hud = $('#hud');
    this.playCfg = Object.assign({ mode: 'soccar', teamSize: 3, level: 'pro', map: 'auto', competitive: false, mutators: {} }, Store.get('playcfg', {}));
    this.buildHud();
    document.addEventListener('pointerdown', () => Sound.init(), { once: false, passive: true });
  },

  // -------------------------------------------------------------------------
  // Screens
  // -------------------------------------------------------------------------
  show(name, arg) {
    this.screen = name;
    this.root.innerHTML = '';
    this.root.hidden = !name;
    document.body.dataset.screen = name || 'game';
    if (!name) return;
    const fn = this['scr_' + name];
    if (fn) this.root.append(fn.call(this, arg));
    this._pf = null;
    if (Input.usingPad) setTimeout(() => this.padCurrent(), 30);
    Sound.play('select');
  },
  btn(label, on, cls, sub) {
    return h('button', { class: 'mbtn ' + (cls || ''), onclick: (e) => { Sound.init(); Sound.play('click'); on(e); } }, h('span', { class: 'mbtn-label' }, label), sub ? h('small', null, sub) : null);
  },
  back(to) { return h('button', { class: 'back', onclick: () => { Sound.play('back'); this.show(to); } }, '‹ Back'); },

  scr_title() {
    const el = h('div', { class: 'title-screen', onpointerdown: () => { Sound.init(); Sound.startMusic(); this.show('main'); } },
      h('div', { class: 'logo' }, h('span', { class: 'l1' }, 'BOOST'), h('span', { class: 'l2' }, 'LEAGUE')),
      h('div', { class: 'tagline' }, 'Supersonic acrobatic rocket-powered car soccer'),
      h('div', { class: 'press' }, 'TAP TO PLAY'),
      h('div', { class: 'title-hint' }, isStandalone() ? '' : 'Tip: in Safari tap Share → Add to Home Screen to play fullscreen'),
    );
    return el;
  },

  scr_main() {
    const P = Profile;
    const card = h('div', { class: 'pcard' },
      h('div', { class: 'pc-name' }, P.name), h('div', { class: 'pc-title' }, P.title),
      h('div', { class: 'pc-row' }, h('span', { class: 'pc-lvl' }, 'LVL ' + P.level), (() => { const b = bestRank(); return h('span', { class: 'pc-rank', style: b ? `color:${b.color}` : '' }, b ? b.name : 'Unranked'); })()),
      h('div', { class: 'pc-pad', id: 'cloudstatus' }, Cloud.label()),
      h('div', { class: 'xpbar' }, h('i', { style: `width:${Math.min(100, P.xp / xpForLevel(P.level) * 100)}%` })),
      h('div', { class: 'pc-pad', id: 'padstatus' }, padStatusText()),
      P.newItems.length ? h('div', { class: 'pc-new' }, `${P.newItems.length} new item${P.newItems.length > 1 ? 's' : ''} in the Garage`) : null,
    );
    return h('div', { class: 'menu main-menu' },
      h('div', { class: 'logo small' }, h('span', { class: 'l1' }, 'BOOST'), h('span', { class: 'l2' }, 'LEAGUE')),
      h('div', { class: 'mlist' },
        this.btn('PLAY', () => this.show('play'), 'big', 'Matches vs bots'),
        this.btn('ONLINE', () => this.show('party'), '', Net.inParty() ? `In party ${Net.code}` : 'Play with friends'),
        this.btn('TRAINING', () => this.show('training'), '', 'Packs & free play'),
        this.btn('GARAGE', () => this.show('garage'), '', 'Customize your car'),
        this.btn('PROFILE', () => this.show('profile'), '', 'Stats & rank'),
        this.btn('SETTINGS', () => this.show('settings'), '', 'Camera, controls, audio'),
        this.btn('HOW TO PLAY', () => this.show('howto'), '', 'Controls & mechanics'),
      ),
      card,
    );
  },

  scr_play() {
    const C = this.playCfg;
    if (C.level === undefined || C.level === 'pro' && !C._migrated) { C.level = 'adaptive'; C._migrated = true; }
    const save = () => Store.set('playcfg', C);
    const ranked = !!C.competitive;
    // re-render (keeps the controller focus on the same button)
    const rerender = (label) => { this.show('play'); if (Input.usingPad) setTimeout(() => { const el = this.padFocusables().find(b => b.textContent === label || b.textContent.startsWith(label)); if (el) this.padFocus(el); }, 40); };
    const seg = (label, key, opts, re) => h('div', { class: 'field' }, h('label', null, label), h('div', { class: 'seg' },
      opts.map(([v, t]) => h('button', { class: C[key] === v ? 'on' : '', onclick: (e) => {
        C[key] = v; save(); Sound.play('click');
        if (re) { rerender(t); return; }
        [...e.target.parentNode.children].forEach(b => b.classList.remove('on')); e.target.classList.add('on');
      } }, t))));
    const modes = h('div', { class: 'modes' }, Object.entries(MODES).map(([k, m]) => h('button', {
      class: 'mode ' + (C.mode === k ? 'on' : ''),
      onclick: (e) => { C.mode = k; save(); Sound.play('click'); if (ranked) { rerender(m.name + (m.desc ? '' : '')); return; } [...modes.children].forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); },
    }, h('b', null, m.name), h('small', null, ranked ? rankLabel(rankedKey({ mode: k, teamSize: C.teamSize })).text.split(' · ')[0] : m.desc))));
    const mapSel = h('select', { id: 'mapsel', onchange: (e) => { C.map = e.target.value; save(); } },
      h('option', { value: 'auto' }, 'Random arena'), Object.entries(MAPS).map(([k, m]) => h('option', { value: k }, `${m.name} (${m.sub})`)));
    mapSel.value = C.map;
    const mutBox = h('div', { class: 'mutators', hidden: true }, MUTATOR_DEFS.map(([key, label, opts]) => {
      const sel = h('select', { id: 'mut-' + key, onchange: (e) => { const o = opts[e.target.selectedIndex]; C.mutators[key] = o[0]; save(); } }, opts.map(([v, t]) => h('option', null, t)));
      const cur = C.mutators[key]; const idx = opts.findIndex(o => o[0] === cur); sel.selectedIndex = idx >= 0 ? idx : 0;
      return h('div', { class: 'mut' }, h('label', { for: 'mut-' + key }, label), sel);
    }));
    // rank / difficulty panel for the chosen team size
    let info;
    if (ranked) {
      const key = rankedKey(C), r = rankedState(key), ri = r.placed ? rankInfo(r.mmr) : null;
      info = h('div', { class: 'rankpanel' }, h('span', { html: rankBadge(ri, 64) }),
        h('div', null,
          h('div', { class: 'rp-name', style: ri ? `color:${ri.color}` : '' }, ri ? ri.name : `Placement match ${r.games + 1} of ${PLACEMENT_GAMES}`),
          h('div', { class: 'rp-sub' }, ri ? `${ri.divName ? ri.divName + ' · ' : ''}${PLAYLISTS[key]} · ${r.wins}W ${r.losses}L` : `${PLAYLISTS[key]} · ${r.pw || 0} won, ${r.games - (r.pw || 0)} lost so far`),
          h('div', { class: 'rp-sub dim' }, ri ? 'Bots play at your rank. Win to climb, lose and you drop (faster on a losing streak).' : 'Play 10 placement matches to get your rank. Win all 10 for Supersonic Legend; every loss places you lower. Bots get harder as you win.')));
    } else {
      const c = casualState(C.teamSize);
      info = h('div', { class: 'rankpanel' },
        h('div', null,
          h('div', { class: 'rp-name' }, C.level === 'adaptive' ? 'Adaptive bots' : `${BOT_LEVELS[C.level].name} bots`),
          h('div', { class: 'rp-sub' }, C.level === 'adaptive' ? `Bots get harder as you win (current skill: ${rankFor(c.mmr)}).` : 'Fixed difficulty. Pick Adaptive to have bots get harder as you win.')));
    }
    return h('div', { class: 'menu play-menu scroll' },
      h('div', { class: 'mhead' }, this.back('main'), h('h2', null, 'Play')),
      h('div', { class: 'opts' },
        seg('Playlist', 'competitive', [[false, 'Casual'], [true, 'Ranked']], true),
        seg('Team Size', 'teamSize', [[1, '1v1 Duel'], [2, '2v2 Doubles'], [3, '3v3 Standard']], true),
        ranked ? null : seg('Bots', 'level', [['adaptive', 'Adaptive'], ['rookie', 'Rookie'], ['pro', 'Pro'], ['allstar', 'All-Star']], true),
        h('div', { class: 'field' }, h('label', { for: 'mapsel' }, 'Arena'), mapSel),
      ),
      info,
      modes,
      ranked ? h('div', { class: 'rp-sub dim' }, 'Each mode has its own rank. Soccar has separate Duel, Doubles and Standard ranks.') : h('div', { class: 'row' },
        h('button', { class: 'ghost', onclick: () => { mutBox.hidden = !mutBox.hidden; Sound.play('click'); } }, 'Mutators ▾'),
        h('button', { class: 'ghost', onclick: () => { C.mutators = {}; save(); this.show('play'); } }, 'Reset mutators'),
      ),
      ranked ? null : mutBox,
      h('div', { class: 'go-row' }, this.btn(ranked ? 'FIND RANKED MATCH' : 'START MATCH', () => startMatch(ranked
        ? { kind: 'match', mode: C.mode, teamSize: C.teamSize, level: 'ranked', map: C.map, competitive: true, mutators: {} }
        : { kind: 'match', ...C, competitive: false }), 'go')),
    );
  },

  scr_training() {
    return h('div', { class: 'menu scroll' },
      h('div', { class: 'mhead' }, this.back('main'), h('h2', null, 'Training')),
      h('div', { class: 'modes' },
        Object.entries(TRAINING_PACKS).map(([k, p]) => h('button', { class: 'mode', onclick: () => startMatch({ kind: 'training', pack: k, mode: 'soccar', map: 'stadium' }) }, h('b', null, p.name + ' Training'), h('small', null, p.desc + ` ${p.count} shots.`))),
        h('button', { class: 'mode', onclick: () => startMatch({ kind: 'freeplay', mode: 'soccar', map: this.playCfg.map }) }, h('b', null, 'Free Play'), h('small', null, 'You, the ball and unlimited boost. Practice anything.')),
        h('button', { class: 'mode', onclick: () => startMatch({ kind: 'freeplay', mode: 'hoops', map: 'auto' }) }, h('b', null, 'Free Play: Hoops'), h('small', null, 'Practice dunks in the hoops arena.')),
        h('button', { class: 'mode', onclick: () => startMatch({ kind: 'freeplay', mode: 'soccar', map: 'auto', mutators: { gravity: 0.4 } }) }, h('b', null, 'Free Play: Low Gravity'), h('small', null, 'Float around and practice air control.')),
      ),
    );
  },

  scr_howto() {
    const rows = [
      ['Drive', 'Drag anywhere on the left of the screen. The car accelerates on its own; pull the stick down to brake and reverse. (Settings → Controls to turn off auto-gas.)'],
      ['Jump / Double jump', 'Tap JUMP. Hold it longer for a higher jump. Tap again in the air for a double jump.'],
      ['Flip (dodge)', 'In the air, tilt the stick and tap JUMP. Front flips hit hard and give speed; side and back flips too. Pull back mid-flip to flip-cancel.'],
      ['Boost', 'Hold BOOST. Collect it from pads: big orbs refill to 100, small pads give 12. You go supersonic above 2200 uu/s.'],
      ['Aerials', 'Jump, tilt the nose up, then boost to fly. Use the stick to pitch and yaw in the air.'],
      ['Air roll', 'Hold DRIFT in the air and steer to roll freely, or hold the ⟲ ⟳ buttons for directional air roll.'],
      ['Powerslide', 'Hold DRIFT on the ground to slide around tight turns.'],
      ['Walls & ceiling', 'Drive up the curved walls. Jump off walls and the ceiling. Land on all four wheels to get your flip back.'],
      ['Demolitions', 'Hit an opponent while supersonic to blow them up. They respawn after 3 seconds.'],
      ['Ball cam', 'BALL CAM keeps the ball on screen. Turn it off to look where your car is pointing.'],
      ['Flip reset', 'Touch the ball with all four wheels in the air to get your flip back.'],
      ['Pinch', 'Hit the ball hard while it is pressed against the floor or a wall. It shoots out much faster than a normal hit. Practice with Free Play → Wall / pinch ball (D-pad right).'],
      ['Free Play buttons', 'D-pad ↑ shoot ball at me · ↓ ball to center · ← aerial ball · → wall/pinch ball · L1 rewind 3 seconds · R1 freeze ball · L3 reset car. Air roll stays on □ in free play.'],
      ['Keyboard', 'W/S drive & pitch · A/D steer · Space jump · Shift boost · X drift/air roll · Q/E directional roll · B ball cam · F item · Esc pause · 1–4 quick chat · Tab scoreboard'],
      ['PS4 / PS5 controller', 'Same as Rocket League: R2 gas · L2 brake/reverse · Left stick steer & air control · ✕ jump · ○ boost · □ or SHARE powerslide (drift) / air roll · △ ball cam · L1 air roll left · R1 air roll right (use item in Rumble) · R3 look behind · right stick look around · D-pad quick chat · OPTIONS pause · touchpad scoreboard. In menus: stick or D-pad to move, ✕ select, ○ back.'],
      ['Xbox controller', 'RT gas · LT brake · A jump · B boost · X powerslide · Y ball cam · LB/RB air roll · same layout as above.'],
    ];
    return h('div', { class: 'menu scroll howto' },
      h('div', { class: 'mhead' }, this.back('main'), h('h2', null, 'How to play')),
      h('dl', null, rows.map(([a, b]) => [h('dt', null, a), h('dd', null, b)])),
    );
  },

  scr_profile() {
    const P = Profile;
    const nameIn = h('input', { id: 'pname', maxlength: 16, value: P.name, oninput: (e) => { P.name = e.target.value.trim() || 'Player'; saveProfile(); } });
    const titles = ['ROOKIE', 'SEMI-PRO', 'PRO', 'VETERAN', 'EXPERT', 'MASTER', 'LEGEND', 'ROCKETEER'];
    const titleSel = h('select', { id: 'ptitle', onchange: (e) => { P.title = e.target.value; saveProfile(); } }, titles.map((t, i) => h('option', { value: t, disabled: P.level < i * 5 + 1 ? true : null }, t + (P.level < i * 5 + 1 ? ` (Lvl ${i * 5 + 1})` : ''))));
    titleSel.value = P.title;
    const stat = (k, v) => h('div', { class: 'stat' }, h('b', null, String(v)), h('small', null, k));
    return h('div', { class: 'menu scroll' },
      h('div', { class: 'mhead' }, this.back('main'), h('h2', null, 'Profile')),
      h('div', { class: 'opts' },
        h('div', { class: 'field' }, h('label', { for: 'pname' }, 'Player name'), nameIn),
        h('div', { class: 'field' }, h('label', { for: 'ptitle' }, 'Title'), titleSel),
      ),
      h('div', { class: 'rk-lvl' }, `Level ${P.level} · ${P.xp} / ${xpForLevel(P.level)} XP · ${Cloud.label()}`),
      h('h3', null, 'Ranked'),
      h('div', { class: 'rankcards' }, RANKED_KEYS.map(k => {
        const r = rankedState(k), ri = r.placed ? rankInfo(r.mmr) : null;
        return h('div', { class: 'rankcard' }, h('span', { html: rankBadge(ri, 72) }),
          h('div', { class: 'rk-pl' }, PLAYLISTS[k]),
          h('div', { class: 'rk-name', style: ri ? `color:${ri.color}` : '' }, ri ? ri.name : 'Unranked'),
          h('div', { class: 'rk-mmr' }, ri ? `${ri.divName ? ri.divName + ' · ' : ''}${Math.round(r.mmr)} MMR` : `Placements ${r.games}/${PLACEMENT_GAMES}`),
          h('div', { class: 'rk-mmr' }, `${r.wins}W ${r.losses}L` + (r.peak ? ` · peak ${rankFor(r.peak)}` : '')));
      })),
      h('div', { class: 'stats' }, stat('Wins', P.wins), stat('Losses', P.losses), stat('Goals', P.goals), stat('Assists', P.assists), stat('Saves', P.saves), stat('MVPs', P.mvps), stat('Demos', P.demos)),
    );
  },

  scr_settings(from) {
    const back = from || 'main';
    const S = Settings;
    const slider = (key, label, min, max, step, fmt) => {
      const val = h('span', { class: 'sval' }, fmt ? fmt(S[key]) : String(S[key]));
      const inp = h('input', { type: 'range', id: 'set-' + key, min, max, step, value: S[key], oninput: (e) => { S[key] = parseFloat(e.target.value); val.textContent = fmt ? fmt(S[key]) : String(S[key]); saveSettings(); applySettings(); } });
      return h('div', { class: 'setrow' }, h('label', { for: 'set-' + key }, label), inp, val);
    };
    const toggle = (key, label) => h('div', { class: 'setrow' }, h('label', { for: 'set-' + key }, label),
      h('button', { id: 'set-' + key, class: 'tog ' + (S[key] ? 'on' : ''), onclick: (e) => { S[key] = !S[key]; e.currentTarget.classList.toggle('on', S[key]); e.currentTarget.textContent = S[key] ? 'On' : 'Off'; saveSettings(); applySettings(); Sound.play('click'); } }, S[key] ? 'On' : 'Off'));
    const select = (key, label, opts) => {
      const sel = h('select', { id: 'set-' + key, onchange: (e) => { S[key] = e.target.value; saveSettings(); applySettings(true); } }, opts.map(([v, t]) => h('option', { value: v }, t)));
      sel.value = S[key];
      return h('div', { class: 'setrow' }, h('label', { for: 'set-' + key }, label), sel);
    };
    const pct = (v) => Math.round(v * 100) + '%';
    return h('div', { class: 'menu scroll settings' },
      h('div', { class: 'mhead' }, h('button', { class: 'back', onclick: () => { Sound.play('back'); back === 'pause' ? this.show('pause') : this.show(back); } }, '‹ Back'), h('h2', null, 'Settings')),
      h('h3', null, 'Camera'),
      slider('fov', 'Field of view', 60, 110, 1, v => v + '°'), slider('camDist', 'Distance', 200, 350, 5), slider('camHeight', 'Height', 60, 160, 5),
      slider('camAngle', 'Angle', -14, 0, 1, v => v + '°'), slider('camStiffness', 'Stiffness', 0, 1, 0.05, v => v.toFixed(2)),
      toggle('camShake', 'Camera shake'), toggle('ballCamDefault', 'Ball cam on by default'),
      h('h3', null, 'Controls'),
      toggle('autoGas', 'Auto-accelerate (touch)'), toggle('invertPitch', 'Invert pitch'), toggle('leftHanded', 'Swap sides (buttons on the left)'),
      slider('stickSize', 'Stick size', 0.7, 1.5, 0.05, pct), slider('buttonSize', 'Button size', 0.7, 1.4, 0.05, pct),
      slider('deadzone', 'Deadzone', 0, 0.4, 0.01, pct), slider('sensitivity', 'Sensitivity', 0.8, 2, 0.05, v => v.toFixed(2)),
      h('h3', null, 'Video'),
      select('quality', 'Quality', [['auto', 'Auto'], ['low', 'Performance'], ['medium', 'Balanced'], ['high', 'Quality']]),
      toggle('particles', 'Full particle effects'), toggle('nameplates', 'Nameplates'), toggle('ballIndicator', 'Off-screen ball arrow'), toggle('showFps', 'Show FPS'),
      h('h3', null, 'Audio'),
      slider('master', 'Master', 0, 1, 0.05, pct), slider('sfx', 'Effects', 0, 1, 0.05, pct), slider('music', 'Music', 0, 1, 0.05, pct), slider('crowd', 'Crowd', 0, 1, 0.05, pct),
      h('div', { class: 'row' }, h('button', { class: 'ghost', onclick: () => { Object.assign(Settings, DEFAULT_SETTINGS); saveSettings(); applySettings(true); this.show('settings', from); } }, 'Restore defaults')),
    );
  },

  scr_pause() {
    const g = CUR.game;
    return h('div', { class: 'menu pause' },
      h('h2', null, 'Paused'),
      h('div', { class: 'mlist' },
        this.btn('RESUME', () => resumeGame(), 'big'),
        g && g.kind === 'match' && !g.cfg.competitive && !g.online ? this.btn('RESTART', () => startMatch(g.cfg)) : null,
        this.btn('SETTINGS', () => this.show('settings', 'pause')),
        this.btn('HOW TO PLAY', () => { this.show('howto'); this.root.querySelector('.back').onclick = () => this.show('pause'); }),
        this.btn(g && g.kind === 'match' ? (g.cfg.competitive ? 'FORFEIT' : 'LEAVE MATCH') : 'EXIT', () => quitToMenu()),
      ),
    );
  },

  // -------------------------------------------------------------------------
  // Garage
  // -------------------------------------------------------------------------
  scr_garage() {
    Garage.open();
    const P = Profile;
    const cats = [['body', 'Body'], ['paint', 'Paint'], ['decal', 'Decal'], ['wheels', 'Wheels'], ['boost', 'Boost'], ['explosion', 'Goal Explosion'], ['topper', 'Topper'], ['antenna', 'Antenna']];
    let cat = this.garageCat || 'body';
    const grid = h('div', { class: 'ggrid scroll' });
    const tabs = h('div', { class: 'gtabs' });
    const render = () => {
      tabs.innerHTML = ''; grid.innerHTML = '';
      for (const [k, t] of cats) tabs.append(h('button', { class: cat === k ? 'on' : '', onclick: () => { cat = k; this.garageCat = k; render(); Sound.play('click'); } }, t));
      if (cat === 'paint') {
        PAINTS.forEach((p, i) => grid.append(h('button', { class: 'gitem ' + (P.car.paint === i ? 'on' : ''), onclick: () => { P.car.paint = i; saveProfile(); Garage.refresh(); render(); } },
          h('i', { class: 'sw', style: `background:${p.hex === null ? 'linear-gradient(90deg,#3d86ff 50%,#ff8a2b 50%)' : hex2css(p.hex)}` }), h('span', null, p.name))));
        return;
      }
      for (const [k, name] of Object.entries(ITEMS[cat])) {
        const owned = P.unlocked[cat].includes(k);
        const rar = itemRarity(cat, k);
        const isNew = P.newItems.includes(cat + ':' + k);
        grid.append(h('button', { class: 'gitem ' + (P.car[cat] === k ? 'on ' : '') + (owned ? '' : 'locked'), style: `--rar:${RARITY_COLORS[rar]}`, onclick: () => {
          if (!owned) { Sound.play('back'); this.toast('Locked — level up to earn item drops'); return; }
          P.car[cat] = k; P.newItems = P.newItems.filter(x => x !== cat + ':' + k); saveProfile(); Garage.refresh(); render(); Sound.play('click');
        } }, h('span', null, name), h('small', null, owned ? RARITY[rar] : '🔒 ' + RARITY[rar]), isNew ? h('em', null, 'NEW') : null));
      }
    };
    render();
    return h('div', { class: 'garage' },
      h('div', { class: 'mhead' }, h('button', { class: 'back', onclick: () => { Garage.close(); this.show('main'); } }, '‹ Back'), h('h2', null, 'Garage')),
      h('div', { class: 'gpanel' }, tabs, grid),
      h('div', { class: 'ghint' }, 'Drag the car to spin it'),
    );
  },

  toast(msg) {
    const t = h('div', { class: 'toast' }, msg);
    document.body.append(t);
    setTimeout(() => t.classList.add('out'), 1800);
    setTimeout(() => t.remove(), 2400);
  },

  // -------------------------------------------------------------------------
  // Post match
  // -------------------------------------------------------------------------
  scr_post(res) {
    const g = res.game;
    const won = g.winner === g.player.team;
    const tbl = (team) => h('table', { class: 'sb t' + team },
      h('thead', null, h('tr', null, h('th', null, TEAM_COLORS[team].name + ' ' + g.score[team]), ...['Score', 'Goals', 'Assists', 'Saves', 'Shots'].map(x => h('th', null, x)))),
      h('tbody', null, g.cars.filter(c => c.team === team).sort((a, b) => b.stats.score - a.stats.score).map(c => h('tr', { class: c === g.player ? 'me' : '' },
        h('td', null, (c === g.mvp ? '★ ' : '') + c.name), ...['score', 'goals', 'assists', 'saves', 'shots'].map(k => h('td', null, String(c.stats[k])))))));
    const xpBar = h('div', { class: 'xpbar big' }, h('i', { style: `width:${res.xpFrom}%` }));
    setTimeout(() => { const i = xpBar.querySelector('i'); i.style.width = res.xpTo + '%'; }, 300);
    const el = h('div', { class: 'menu post scroll' },
      h('div', { class: 'result ' + (won ? 'win' : 'loss') }, won ? 'VICTORY' : 'DEFEAT'),
      g.forfeitTeam !== undefined ? h('div', { class: 'mvp' }, g.forfeitTeam === g.player.team ? 'Your team forfeited' : 'The other team forfeited') : null,
      g.mvp ? h('div', { class: 'mvp' }, `MVP: ${g.mvp.name}`) : null,
      h('div', { class: 'sbs' }, tbl(0), tbl(1)),
      h('div', { class: 'xpwrap' }, h('div', null, `+${res.xp} XP`, res.leveled ? h('b', { class: 'lvlup' }, ` LEVEL UP! Level ${Profile.level}`) : null), xpBar),
      res.rating ? this.ratingBlock(res.rating) : null,
      res.drops.length ? h('div', { class: 'drops' }, h('div', { class: 'drops-h' }, 'ITEM DROP'), res.drops.map(d => h('div', { class: 'drop', style: `--rar:${RARITY_COLORS[d.rarity]}` }, h('b', null, d.name), h('small', null, `${RARITY[d.rarity]} ${d.catName}`)))) : null,
      h('div', { class: 'postchat' },
        h('div', { class: 'row center' }, ['gg', 'Well played.', 'That was fun!', 'Rematch!', 'What a game!', 'Nice moves!'].map(m => h('button', { class: 'ghost', onclick: () => g.chat(g.player, m, false) }, m))),
        h('div', { class: 'postchatlog scroll', id: 'postchatlog' }, g.chatLog.filter(c => c.t > g.time - 8).map(c => h('div', { class: 'citem' }, h('b', { class: 't' + c.car.team }, c.car.name + ': '), c.msg)))),
      g.online ? h('div', { class: 'row center' },
        this.btn('BACK TO PARTY', () => quitToMenu('party'), 'go'),
        this.btn('LEAVE PARTY', () => { Net.leave(true); quitToMenu('main'); }),
      ) : h('div', { class: 'row center' },
        this.btn('PLAY AGAIN', () => startMatch(g.cfg), 'go'),
        this.btn('MAIN MENU', () => quitToMenu()),
      ),
    );
    return el;
  },

  // ---- online party: create / join / lobby ----
  scr_party() {
    const N = Net;
    const wrap = (...kids) => h('div', { class: 'menu party scroll' }, h('div', { class: 'mhead' }, this.back('main'), h('h2', null, 'Online')), ...kids);
    const err = N.error ? h('div', { class: 'perr' }, N.error) : null;
    if (N.status === 'connecting') return wrap(h('div', { class: 'pnote' }, 'Connecting…'));
    if (!N.inParty()) {
      const input = h('input', { class: 'pcode-in', maxlength: 5, placeholder: 'CODE', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false',
        oninput: (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); },
        onkeydown: (e) => { if (e.key === 'Enter') N.join(e.target.value); } });
      return wrap(
        err,
        h('div', { class: 'pcols' },
          h('div', { class: 'pbox' }, h('h3', null, 'Create a party'), h('p', null, 'You get a code. Send it to your friends.'),
            this.btn('CREATE PARTY', () => N.create(), 'go')),
          h('div', { class: 'pbox' }, h('h3', null, 'Join a party'), h('p', null, 'Type the code your friend sees.'),
            input, this.btn('JOIN PARTY', () => N.join(input.value))),
        ),
        N.available() ? null : h('div', { class: 'pnote' }, 'Online play works when the game is opened on claude.ai while signed in, and shared with your friends.'),
      );
    }
    const ms = N.members();
    const host = N.isHost ? null : N.hostPeerObj();
    const S = N.isHost ? N.settings : ((host && host.presence.party) ? { mode: host.presence.party.mode, size: host.presence.party.size, level: host.presence.party.level, map: host.presence.party.map } : N.settings);
    const list = h('div', { class: 'pmembers' }, ms.map(m => h('div', { class: 'pmem t' + (m.presence.team === 1 ? 1 : 0) },
      h('b', null, String(m.presence.name || 'Player').slice(0, 16)),
      h('small', null, (m.presence.host ? 'Party leader' : 'Player') + (m.isMe && m.sameTab ? ' · you' : '')))));
    const teamBtns = h('div', { class: 'field' }, h('label', null, 'Your team'), h('div', { class: 'seg' },
      [[0, 'Blue'], [1, 'Orange']].map(([t, n]) => h('button', { class: N.myTeam === t ? 'on' : '', onclick: () => { Sound.play('click'); N.setTeam(t); } }, n))));
    const seg = (label, key, opts) => h('div', { class: 'field' }, h('label', null, label), h('div', { class: 'seg' },
      opts.map(([v, t]) => h('button', { class: S[key] === v ? 'on' : '', disabled: !N.isHost, onclick: () => { Sound.play('click'); N.setSetting(key, v); this.show('party'); } }, t))));
    const mapSel = h('select', { disabled: !N.isHost, onchange: (e) => N.setSetting('map', e.target.value) },
      h('option', { value: 'auto' }, 'Random arena'), Object.entries(MAPS).map(([k, m]) => h('option', { value: k }, m.name)));
    mapSel.value = S.map || 'auto';
    return wrap(
      err,
      h('div', { class: 'pcodebig' }, h('small', null, 'PARTY CODE'), h('b', null, N.code)),
      h('div', { class: 'pnote' }, 'Friends: open this game, tap ONLINE → JOIN PARTY and type this code.'),
      list,
      teamBtns,
      seg('Mode', 'mode', NET_MODES.map(k => [k, MODES[k].name])),
      seg('Team size', 'size', [[1, '1v1'], [2, '2v2'], [3, '3v3']]),
      seg('Bots fill empty spots', 'level', [['rookie', 'Rookie'], ['pro', 'Pro'], ['allstar', 'All-Star']]),
      h('div', { class: 'field' }, h('label', null, 'Arena'), mapSel),
      h('div', { class: 'row center' },
        N.isHost ? this.btn('START MATCH', () => N.start(), 'go') : h('div', { class: 'pnote' }, 'Waiting for the party leader to start…'),
        this.btn('LEAVE PARTY', () => N.leave()),
      ),
    );
  },

  ratingBlock(r) {
    const d = (r.delta > 0 ? '+' : '') + r.delta;
    if (!r.ranked) return h('div', { class: 'mmr' }, `Adaptive bots: ${r.delta > 0 ? 'getting harder' : 'getting easier'} (${d}) · bot skill now ${rankFor(r.casualMmr)}`);
    if (!r.placed) return h('div', { class: 'rankresult' }, h('span', { html: rankBadge(null, 64) }),
      h('div', null, h('b', null, `Placement match ${r.games} / ${PLACEMENT_GAMES}`), h('small', null, `${r.playlist} · ${r.placeWins} won so far · ${PLACEMENT_GAMES - r.games} to go before your rank is revealed`)));
    const a = r.after;
    let head = `${a.name} · ${a.divName}`;
    if (r.justPlaced) head = `RANK REVEALED: ${a.name}`;
    else if (r.rankUp) head = `RANK UP! ${a.name}`;
    else if (r.rankDown) head = `Rank down: ${a.name}`;
    else if (r.divUp) head = `Division up! ${a.name} ${a.divName}`;
    else if (r.divDown) head = `Division down: ${a.name} ${a.divName}`;
    const big = r.justPlaced || r.rankUp;
    return h('div', { class: 'rankresult' + (big ? ' big' : ''), style: `--rc:${a.color}` }, h('span', { html: rankBadge(a, big ? 96 : 64) }),
      h('div', null, h('b', { style: `color:${a.color}` }, head), h('small', null, `${r.playlist} · ${d} MMR`)));
  },

  scr_trainingEnd(res) {
    const ok = res.results.filter(Boolean).length;
    return h('div', { class: 'menu post' },
      h('div', { class: 'result win' }, `${ok} / ${res.results.length}`),
      h('div', { class: 'mvp' }, ok === res.results.length ? 'Perfect run!' : ok >= res.results.length / 2 ? 'Nice work.' : 'Keep practicing.'),
      h('div', { class: 'tshots' }, res.results.map((r, i) => h('span', { class: r ? 'ok' : 'bad' }, String(i + 1)))),
      h('div', { class: 'row center' }, this.btn('RETRY', () => startMatch(CUR.game.cfg), 'go'), this.btn('TRAINING', () => quitToMenu('training'))),
    );
  },

  // -------------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------------
  buildHud() {
    const H = this.hudEls;
    const hud = this.hud;
    H.score = h('div', { class: 'scorebug' },
      h('div', { class: 'sb-team b' }, h('span', { class: 'sb-n' }, '0')),
      h('div', { class: 'sb-clock' }, h('span', { class: 'sb-time' }, '5:00'), h('small', { class: 'sb-sub' }, '')),
      h('div', { class: 'sb-team o' }, h('span', { class: 'sb-n' }, '0')));
    H.boost = h('div', { class: 'boostmeter' }, h('div', { class: 'bm-ring', html: '<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" class="bm-bg"/><circle cx="60" cy="60" r="50" class="bm-fg" pathLength="100"/></svg>' }), h('div', { class: 'bm-num' }, '33'), h('div', { class: 'bm-lbl' }, 'BOOST'));
    H.count = h('div', { class: 'countdown' });
    H.banner = h('div', { class: 'banner' });
    H.awards = h('div', { class: 'awards' });
    H.feed = h('div', { class: 'feed' });
    H.chat = h('div', { class: 'chatfeed' });
    H.arrow = h('div', { class: 'ballarrow' }, '▲');
    H.item = h('div', { class: 'itemslot' });
    H.fps = h('div', { class: 'fps' });
    H.info = h('div', { class: 'infobar' });
    H.top = h('div', { class: 'topbtns' },
      h('button', { class: 'hbtn', onclick: () => pauseGame(), 'aria-label': 'Pause' }, '❚❚'),
      h('button', { class: 'hbtn', onclick: () => this.toggleQuick(), 'aria-label': 'Quick chat' }, '💬'),
      h('button', { class: 'hbtn', onpointerdown: () => this.showBoard(true), onpointerup: () => this.showBoard(false), onpointerleave: () => this.showBoard(false), 'aria-label': 'Scoreboard' }, '☰'),
    );
    const fpb = (label, key, fn) => h('button', { class: 'hbtn wide', onclick: () => CUR.game && CUR.game[fn]() }, h('b', { class: 'padkey' }, key), ' ' + label);
    H.fp = h('div', { class: 'fpbtns' },
      fpb('Shoot ball at me', '↑', 'freeplayLaunch'),
      fpb('Ball to center', '↓', 'freeplayResetBall'),
      fpb('Aerial ball', '←', 'freeplayAerial'),
      fpb('Wall / pinch ball', '→', 'freeplayWall'),
      fpb('Rewind 3s', 'L1', 'freeplayRewind'),
      fpb('Freeze ball', 'R1', 'freeplayFreeze'),
      fpb('Reset car', 'L3', 'freeplayResetCar'),
    );
    H.quick = h('div', { class: 'quick', hidden: true });
    H.board = h('div', { class: 'board', hidden: true });
    H.flash = h('div', { class: 'flash' });
    hud.append(H.flash, H.score, H.boost, H.count, H.banner, H.awards, H.feed, H.chat, H.arrow, H.item, H.fps, H.info, H.top, H.fp, H.quick, H.board);
  },

  showHud(on, game) {
    this.hud.hidden = !on;
    if (on) {
      this.hudEls.fp.hidden = game.kind !== 'freeplay';
      this.hudEls.score.hidden = game.kind !== 'match';
      this.hudEls.item.hidden = game.mode !== 'rumble';
      this.hudEls.feed.innerHTML = ''; this.hudEls.chat.innerHTML = ''; this.hudEls.awards.innerHTML = '';
      this.hudEls.banner.className = 'banner';
    }
  },

  hudUpdate(game, dt) {
    const H = this.hudEls, car = game.player;
    // scorebug
    if (game.kind === 'match') {
      const n = H.score.querySelectorAll('.sb-n');
      n[0].textContent = game.score[0]; n[1].textContent = game.score[1];
      const t = H.score.querySelector('.sb-time');
      t.textContent = game.mutators.matchLength === 0 ? '∞' : game.overtime ? '+' + fmtClock(game.otTime) : fmtClock(game.clock);
      H.score.classList.toggle('ot', game.overtime);
      H.score.classList.toggle('low', !game.overtime && game.clock <= 30 && game.mutators.matchLength > 0);
      H.score.querySelector('.sb-sub').textContent = game.overtime ? 'OVERTIME' : (game.zeroSecond ? '0:00 — BALL MUST HIT GROUND' : MODES[game.mode].name.toUpperCase());
    }
    // boost
    const b = Math.floor(car.boost);
    if (b !== this._lastBoost) {
      this._lastBoost = b;
      H.boost.querySelector('.bm-num').textContent = game.mutators.boost === 'unlimited' ? '∞' : String(b);
      H.boost.querySelector('.bm-fg').style.strokeDasharray = `${b * 0.75} 100`;
      H.boost.classList.toggle('empty', b === 0);
      H.boost.classList.toggle('full', b === 100);
    }
    H.boost.classList.toggle('ss', car.supersonic);
    // countdown
    if (game.state === 'countdown' && game.kind === 'match') { H.count.textContent = Math.ceil(game.stateT); H.count.classList.add('on'); }
    else if (H.count.classList.contains('on') && game.state !== 'countdown') { H.count.textContent = 'GO!'; H.count.classList.add('go'); H.count.classList.remove('on'); setTimeout(() => { H.count.classList.remove('go'); H.count.textContent = ''; }, 700); }
    // ball arrow
    const ball = game.ball;
    if (Settings.ballIndicator && !game.ballHidden && game.state !== 'replay') {
      const p = tmpV().copy(ball.pos).project(R.camera);
      const off = p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1;
      H.arrow.hidden = !off;
      if (off) {
        let x = p.x, y = p.y; if (p.z > 1) { x = -x; y = -y; }
        const a = Math.atan2(y, x);
        const W = window.innerWidth, Hh = window.innerHeight;
        const r = Math.min(W, Hh) * 0.38;
        H.arrow.style.transform = `translate(${W / 2 + Math.cos(a) * r}px, ${Hh / 2 - Math.sin(a) * r}px) rotate(${Math.PI / 2 - a}rad)`;
      }
    } else H.arrow.hidden = true;
    // item
    if (game.mode === 'rumble') {
      const it = car.item ? RUMBLE_ITEMS[car.item] : null;
      H.item.innerHTML = it ? `<b>${it.icon}</b><span>${it.name}</span>` : '<span>Next item soon…</span>';
      H.item.classList.toggle('has', !!it);
      Input.buttons.useItem.el.classList.toggle('ready', !!it);
    }
    // training / info
    if (game.kind === 'training') H.info.textContent = `${TRAINING_PACKS[game.trainingPack].name} · Shot ${Math.min(game.trainingIdx + 1, TRAINING_PACKS[game.trainingPack].count)} / ${TRAINING_PACKS[game.trainingPack].count} · ${Math.max(0, game.trainingTimer || 0).toFixed(1)}s`;
    else if (game.kind === 'freeplay') H.info.textContent = `Free Play · ${Math.round(car.vel.length())} uu/s` + (car.supersonic ? ' · SUPERSONIC' : '');
    else H.info.textContent = '';
    H.info.hidden = !H.info.textContent;
    // fps
    H.fps.hidden = !Settings.showFps;
    if (Settings.showFps) { this._fpsAcc = (this._fpsAcc || 0) + dt; this._fpsN = (this._fpsN || 0) + 1; if (this._fpsAcc > 0.5) { H.fps.textContent = Math.round(this._fpsN / this._fpsAcc) + ' fps'; this._fpsAcc = 0; this._fpsN = 0; } }
    if (!H.board.hidden) this.renderBoard(game);
  },

  bannerShow(html, cls, dur) {
    const B = this.hudEls.banner;
    B.innerHTML = html; B.className = 'banner on ' + (cls || '');
    clearTimeout(this._bt);
    if (dur) this._bt = setTimeout(() => { B.className = 'banner'; }, dur);
  },

  award(label, pts) {
    const el = h('div', { class: 'award' }, h('b', null, label.toUpperCase()), pts ? h('span', null, '+' + pts) : null);
    this.hudEls.awards.prepend(el);
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2700);
    while (this.hudEls.awards.children.length > 4) this.hudEls.awards.lastChild.remove();
  },
  feedAdd(html) {
    const el = h('div', { class: 'fitem', html });
    this.hudEls.feed.prepend(el);
    setTimeout(() => el.remove(), 5000);
    while (this.hudEls.feed.children.length > 4) this.hudEls.feed.lastChild.remove();
  },
  chatAdd(car, msg, team) {
    const el = h('div', { class: 'citem' }, h('b', { class: 't' + car.team }, (team ? '[TEAM] ' : '') + car.name + ': '), msg);
    this.hudEls.chat.append(el);
    setTimeout(() => el.classList.add('out'), 5500);
    setTimeout(() => el.remove(), 6000);
    while (this.hudEls.chat.children.length > 5) this.hudEls.chat.firstChild.remove();
  },

  toggleQuick(cat) {
    const Q = this.hudEls.quick;
    if (cat === undefined && !Q.hidden && !this._qcat) { Q.hidden = true; return; }
    Q.hidden = false; Q.innerHTML = '';
    this._qcat = cat || null;
    const close = () => { Q.hidden = true; this._qcat = null; };
    if (!cat) {
      const cats = ['Information', 'Compliments', 'Reactions', 'Apologies'];
      Q.append(h('div', { class: 'qh' }, 'Quick Chat'), ...cats.map((c, i) => h('button', { onclick: () => this.toggleQuick(c) }, `${i + 1}. ${c}`)), h('button', { class: 'qx', onclick: close }, 'Close'));
    } else {
      const list = QUICKCHAT[cat];
      Q.append(h('div', { class: 'qh' }, cat), ...list.slice(0, 8).map((m, i) => h('button', { onclick: () => { CUR.game.chat(CUR.game.player, m, cat === 'Information'); close(); } }, m)), h('button', { class: 'qx', onclick: () => this.toggleQuick() }, '‹ Back'));
    }
  },
  showBoard(on) { this.hudEls.board.hidden = !on; if (on && CUR.game) this.renderBoard(CUR.game); },
  renderBoard(g) {
    const B = this.hudEls.board;
    const rows = (t) => g.cars.filter(c => c.team === t).sort((a, b) => b.stats.score - a.stats.score).map(c =>
      `<tr class="${c === g.player ? 'me' : ''}"><td>${c.name}${c.demolished ? ' 💥' : ''}</td><td>${c.stats.score}</td><td>${c.stats.goals}</td><td>${c.stats.assists}</td><td>${c.stats.saves}</td><td>${c.stats.shots}</td><td>${c.isBot ? 'BOT' : Math.round(18 + Math.random() * 3)}</td></tr>`).join('');
    const head = (t) => `<tr><th>${TEAM_COLORS[t].name} · ${g.score[t]}</th><th>Score</th><th>Goals</th><th>Assists</th><th>Saves</th><th>Shots</th><th>Ping</th></tr>`;
    B.innerHTML = `<table class="sb t0">${head(0)}${rows(0)}</table><table class="sb t1">${head(1)}${rows(1)}</table>`;
  },

  // -------------------------------------------------------------------------
  handleEvent(ev, game) {
    const me = game.player;
    switch (ev.type) {
      case 'award': if (ev.car === me && !ev.quiet) { this.award(ev.label, ev.pts); Sound.play('award'); } break;
      case 'goal': {
        if (ev.freeplay || ev.training) { this.bannerShow(`<div class="g-big">GOAL!</div><div class="g-sub">${Math.round(ev.speed * 0.036)} KPH</div>`, 'goal t' + ev.team, 2000); break; }
        const sc = ev.scorer ? ev.scorer.name : 'Own goal';
        this.bannerShow(`<div class="g-big">GOAL!</div><div class="g-sub">${ev.ownGoal ? 'OWN GOAL' : sc}${ev.assist ? ` <small>assisted by ${ev.assist.name}</small>` : ''}</div><div class="g-speed">${Math.round(ev.speed * 0.036)} KPH</div>`, 'goal t' + ev.team, 2600);
        this.hudEls.flash.className = 'flash on t' + ev.team; setTimeout(() => this.hudEls.flash.className = 'flash', 600);
        break;
      }
      case 'replayStart': this.bannerShow('<div class="replay-tag">REPLAY</div><div class="g-sub small">Tap to skip</div>', 'replay'); break;
      case 'kickoff': if (game.kind === 'match') this.hudEls.banner.className = 'banner'; break;
      case 'overtime': this.bannerShow('<div class="g-big">OVERTIME</div><div class="g-sub">Next goal wins</div>', 'ot', 2500); break;
      case 'demo': {
        const t0 = ev.car.team, t1 = ev.victim.team;
        this.feedAdd(`<b class="t${t0}">${ev.car.name}</b> 💥 <b class="t${t1}">${ev.victim.name}</b>`);
        if (ev.victim === me) this.bannerShow('<div class="g-mid">DEMOLISHED</div><div class="g-sub">by ' + ev.car.name + '</div>', 'demo', 2200);
        break;
      }
      case 'save': this.feedAdd(`<b class="t${ev.car.team}">${ev.car.name}</b> ${ev.epic ? 'EPIC SAVE!' : 'saved it!'}`); break;
      case 'chat': {
        this.chatAdd(ev.car, ev.msg, ev.team); Sound.play('chat');
        const log = document.getElementById('postchatlog');
        if (log) { log.append(h('div', { class: 'citem' }, h('b', { class: 't' + ev.car.team }, (ev.team ? '[TEAM] ' : '') + ev.car.name + ': '), ev.msg)); log.scrollTop = 1e6; }
        break;
      }
      case 'heatlaunch': this.bannerShow(`<div class="g-mid">BALL HEADING TO ${TEAM_COLORS[ev.team].name}</div><div class="g-sub">${ev.team === me.team ? 'Defend your goal!' : 'Chase it down!'}</div>`, 'ot', 1800); break;
      case 'forfeit': this.bannerShow(`<div class="g-mid">${TEAM_COLORS[ev.team].name} FORFEITS</div><div class="g-sub">They gave up</div>`, 'ot', 3000); break;
      case 'end': {
        const won = ev.winner === me.team;
        this.bannerShow(`<div class="g-big">${won ? 'VICTORY' : 'DEFEAT'}</div><div class="g-sub">${game.score[0]} – ${game.score[1]}</div>`, 'end t' + ev.winner);
        break;
      }
      case 'itemget': if (ev.car === me) { Sound.play('item'); } break;
      case 'fptool': this.award(ev.label, 0); break;
      case 'pinch': if (ev.car === me) { this.award('Pinch! ' + Math.round(ev.speed * 0.036) + ' kph', 0); } break;
      case 'flipreset': if (ev.car === me) { this.award('Flip Reset', 0); Sound.play('flipreset'); } break;
      case 'charge': this.feedAdd(ev.level >= 2 ? 'Ball is SUPER CHARGED!' : 'Ball is CHARGED!'); break;
      case 'trainingResult': this.bannerShow(`<div class="g-mid">${ev.success ? (game.trainingPack === 'goalie' ? 'SAVED!' : 'NICE SHOT!') : (game.trainingPack === 'goalie' ? 'GOAL AGAINST' : 'MISSED')}</div>`, ev.success ? 'goal t0' : 'demo', 1800); break;
      case 'trainingShot': this.bannerShow(`<div class="g-mid">SHOT ${ev.idx + 1}</div>`, 'shot', 1200); break;
    }
  },

  onKey(k) {
    if (k === 'Escape') {
      if (this.screen === 'pause') resumeGame();
      else if (!this.screen && CUR.game && !CUR.attract) pauseGame();
      else if (this.screen && this.screen !== 'main' && this.screen !== 'title' && !CUR.game) this.show('main');
      return;
    }
    if (!CUR.game || this.screen) return;
    if (k === 'Tab') { this.showBoard(this.hudEls.board.hidden); return; }
    const m = /^Digit([1-4])$/.exec(k);
    if (m) {
      const cats = ['Information', 'Compliments', 'Reactions', 'Apologies'];
      if (this._qcat) { const msg = QUICKCHAT[this._qcat][+m[1] - 1]; CUR.game.chat(CUR.game.player, msg, this._qcat === 'Information'); this.hudEls.quick.hidden = true; this._qcat = null; }
      else this.toggleQuick(cats[+m[1] - 1]);
    }
    if (k === 'KeyR' && CUR.game.kind === 'freeplay') CUR.game.freeplayLaunch();
  },
  // ---- controller menu navigation ----
  padFocusables() {
    const list = [...this.root.querySelectorAll('button, select, input, .hbtn')].filter(el => !el.disabled && el.offsetParent !== null && !el.closest('[hidden]'));
    return list;
  },
  padFocus(el) {
    if (this._pf) this._pf.classList.remove('padfocus');
    this._pf = el;
    if (!el) return;
    el.classList.add('padfocus');
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },
  padCurrent() {
    const list = this.padFocusables();
    if (this._pf && list.includes(this._pf)) return this._pf;
    const first = list.find(el => el.classList.contains('on') && el.classList.contains('mode')) || list.find(el => !el.classList.contains('back')) || list[0];
    this.padFocus(first || null);
    return null;
  },
  padMove(dx, dy) {
    if (this.screen === 'title') return;
    const cur = this.padCurrent();
    if (!cur) return;
    // sliders and dropdowns change value with left/right
    if (dx && cur.tagName === 'INPUT' && cur.type === 'range') {
      const st = parseFloat(cur.step) || 1;
      cur.value = clamp(parseFloat(cur.value) + dx * st, parseFloat(cur.min), parseFloat(cur.max));
      cur.dispatchEvent(new Event('input', { bubbles: true })); Sound.play('click'); return;
    }
    if (dx && cur.tagName === 'SELECT') {
      cur.selectedIndex = clamp(cur.selectedIndex + dx, 0, cur.options.length - 1);
      cur.dispatchEvent(new Event('change', { bubbles: true })); Sound.play('click'); return;
    }
    const r0 = cur.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bs = 1e9;
    for (const el of this.padFocusables()) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const ddx = x - cx, ddy = y - cy;
      const along = dx ? ddx * dx : ddy * dy;
      if (along <= 4) continue;
      const across = dx ? Math.abs(ddy) : Math.abs(ddx);
      const score = along + across * 2.5;
      if (score < bs) { bs = score; best = el; }
    }
    if (best) { this.padFocus(best); Sound.play('click'); }
  },
  padActivate() {
    if (this.screen === 'title') { Sound.init(); Sound.startMusic(); this.show('main'); return; }
    const cur = this.padCurrent();
    if (!cur) return;
    if (cur.tagName === 'SELECT') { cur.selectedIndex = (cur.selectedIndex + 1) % cur.options.length; cur.dispatchEvent(new Event('change', { bubbles: true })); return; }
    if (cur.tagName === 'INPUT') { cur.focus(); return; }
    cur.click();
  },
  padTab(d) {
    // L1 / R1 cycle garage tabs
    const tabs = [...this.root.querySelectorAll('.gtabs button')];
    if (!tabs.length) return;
    const i = tabs.findIndex(t => t.classList.contains('on'));
    tabs[(i + d + tabs.length) % tabs.length].click();
  },
  onPadA() { this.padActivate(); },
  onPadB() {
    if (this.screen === 'pause') { resumeGame(); return; }
    if (this.screen && this.screen !== 'main' && this.screen !== 'title') { const b = $('.back', this.root); if (b) b.click(); }
  },
};

function padStatusText() {
  if (Input.padStatus === 'ok') return '🎮 ' + prettyPadName(Input.padName) + ' connected';
  if (Input.padStatus === 'blocked') return '🎮 Controllers are blocked in this view';
  return '🎮 Controller: press any button on it to connect';
}
setInterval(() => { const el = document.getElementById('padstatus'); if (el) el.textContent = padStatusText(); const c = document.getElementById('cloudstatus'); if (c) c.textContent = Cloud.label(); }, 1000);

function isStandalone() { return window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches); }

function itemRarity(cat, k) {
  const keys = Object.keys(ITEMS[cat]);
  const i = keys.indexOf(k);
  return Math.min(RARITY.length - 1, Math.floor(i * 6 / Math.max(1, keys.length - 1) * 0.85));
}

// ---------------------------------------------------------------------------
// Garage 3D preview (separate scene, same renderer)
// ---------------------------------------------------------------------------
const Garage = {
  scene: null, cam: null, car: null, rot: 0.6, active: false,
  open() {
    this.active = true;
    if (!this.scene) {
      const s = this.scene = new THREE.Scene();
      s.background = new THREE.Color(0x0b1020);
      this.cam = new THREE.PerspectiveCamera(35, 1, 5, 5000);
      s.add(new THREE.HemisphereLight(0xcfe0ff, 0x202030, 0.55));
      const d = new THREE.DirectionalLight(0xffffff, 0.65); d.position.set(200, 300, 150); s.add(d);
      const rim = new THREE.DirectionalLight(0x6fa8ff, 0.8); rim.position.set(-300, 120, -200); s.add(rim);
      const floor = new THREE.Mesh(new THREE.CylinderGeometry(150, 160, 8, 48), new THREE.MeshStandardMaterial({ color: 0x1c2438, metalness: 0.6, roughness: 0.4 }));
      floor.position.y = -21; s.add(floor);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(155, 1.5, 6, 64), new THREE.MeshBasicMaterial({ color: 0x3d86ff })); ring.rotation.x = Math.PI / 2; ring.position.y = -17; s.add(ring);
      const grid = new THREE.GridHelper(2000, 40, 0x1d2a48, 0x141c30); grid.position.y = -25; s.add(grid);
      const el = R.renderer.domElement;
      let drag = null;
      el.addEventListener('pointerdown', (e) => { if (this.active) drag = e.clientX; });
      el.addEventListener('pointermove', (e) => { if (this.active && drag !== null) { this.rot += (e.clientX - drag) * 0.01; drag = e.clientX; } });
      window.addEventListener('pointerup', () => { drag = null; });
    }
    this.refresh();
  },
  refresh() {
    if (this.car) { this.scene.remove(this.car.group); disposeTree(this.car.group); this.scene.remove(this.car.shadow); }
    const fake = new Car(99, 0, Profile.name, false, Profile.car.body, Profile.car);
    const w = R.world; R.world = this.scene; // buildCar adds its shadow to R.world
    this.car = buildCar(fake);
    R.world = w;
    this.car.plate.visible = false;
    this.car.shadow.position.set(0, -16.5, 0);
    this.scene.add(this.car.group);
    this.fake = fake;
  },
  close() { this.active = false; },
  render(dt) {
    this.rot += dt * 0.35;
    const aspect = window.innerWidth / window.innerHeight;
    this.cam.aspect = aspect; this.cam.updateProjectionMatrix();
    const wide = aspect > 1.2;
    this.cam.position.set(Math.cos(this.rot) * 330, 110, Math.sin(this.rot) * 330);
    this.cam.lookAt(wide ? 0 : 0, wide ? 10 : -30, 0);
    if (wide) { this.cam.setViewOffset(window.innerWidth, window.innerHeight, window.innerWidth * 0.2, 0, window.innerWidth, window.innerHeight); }
    else this.cam.clearViewOffset();
    for (const wv of this.car.wheels) wv.spin.rotation.z -= dt * 2;
    R.renderer.render(this.scene, this.cam);
  },
};
