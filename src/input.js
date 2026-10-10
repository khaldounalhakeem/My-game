'use strict';
// ============================================================================
// Input: iPad touch controls (floating stick + slide-able buttons),
// game controllers (Gamepad API) and keyboard
// ============================================================================

const Input = {
  stick: { x: 0, y: 0, id: null, ox: 0, oy: 0, cx: 0, cy: 0 },
  buttons: {}, // name -> {el, down:Set(pointerIds)}
  keys: new Set(),
  pad: null, padPrev: [],
  state: { throttle: 0, steer: 0, pitch: 0, jump: false, boost: false, handbrake: false, rollL: false, rollR: false, useItem: false },
  edges: {}, prevFlags: {},
  touchActive: false,
  layer: null,

  init() {
    this.layer = document.getElementById('touch');
    const L = this.layer;
    // floating joystick visuals
    this.stickBase = document.createElement('div'); this.stickBase.className = 'stick-base';
    this.stickKnob = document.createElement('div'); this.stickKnob.className = 'stick-knob';
    this.stickBase.appendChild(this.stickKnob); L.appendChild(this.stickBase);
    this.stickHint = document.createElement('div'); this.stickHint.className = 'stick-hint'; this.stickHint.textContent = 'DRAG TO STEER'; L.appendChild(this.stickHint);
    const defs = [
      ['jump', 'JUMP', 'btn-jump'], ['boost', 'BOOST', 'btn-boost'], ['handbrake', 'DRIFT', 'btn-drift'],
      ['rollL', '⟲', 'btn-rolll'], ['rollR', '⟳', 'btn-rollr'], ['brake', 'BRAKE', 'btn-brake'],
      ['ballcam', 'BALL<br>CAM', 'btn-ballcam'], ['useItem', 'ITEM', 'btn-item'],
    ];
    for (const [name, label, cls] of defs) {
      const el = document.createElement('div'); el.className = 'tbtn ' + cls; el.innerHTML = `<span>${label}</span>`;
      el.dataset.btn = name; L.appendChild(el);
      this.buttons[name] = { el, down: new Set() };
    }
    this.applyLayout();
    this.initGamepad();
    const opts = { passive: false };
    L.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    L.addEventListener('pointermove', (e) => this.onMove(e), opts);
    L.addEventListener('pointerup', (e) => this.onUp(e), opts);
    L.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    L.addEventListener('lostpointercapture', (e) => this.onUp(e), opts);
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.releaseAll(); });
    // stop iOS gestures
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (e.target.closest && !e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
  },
  applyLayout() {
    const s = Settings.buttonSize;
    document.documentElement.style.setProperty('--btn', s.toFixed(2));
    document.documentElement.style.setProperty('--stk', Settings.stickSize.toFixed(2));
    document.body.classList.toggle('lefty', !!Settings.leftHanded);
  },
  show(on, opts) {
    this.layer.hidden = !on;
    if (!on) this.releaseAll();
    if (opts) { this.buttons.useItem.el.hidden = !opts.item; }
  },
  releaseAll() {
    for (const k in this.buttons) { this.buttons[k].down.clear(); this.buttons[k].el.classList.remove('on'); }
    this.stick.id = null; this.stick.x = this.stick.y = 0; this.stickBase.classList.remove('on');
  },
  stickSide(x) {
    const left = x < window.innerWidth * 0.45;
    return Settings.leftHanded ? !left : left;
  },
  buttonAt(x, y) {
    let best = null, bd = 1e9;
    for (const k in this.buttons) {
      const b = this.buttons[k];
      if (b.el.hidden) continue;
      const r = b.el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2 + 8;
      const d = Math.hypot(x - cx, y - cy);
      if (d < rad && d < bd) { bd = d; best = k; }
    }
    return best;
  },
  onDown(e) {
    e.preventDefault();
    this.touchActive = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (this.touchActive && this.usingPad) { this.usingPad = false; document.body.classList.remove('pad'); }
    try { this.layer.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    Sound.init();
    const btn = this.buttonAt(e.clientX, e.clientY);
    if (btn) { this.press(btn, e.pointerId); return; }
    if (this.stickSide(e.clientX) && this.stick.id === null) {
      const S = this.stick; S.id = e.pointerId; S.ox = e.clientX; S.oy = e.clientY; S.x = S.y = 0;
      this.stickBase.style.left = S.ox + 'px'; this.stickBase.style.top = S.oy + 'px';
      this.stickBase.classList.add('on'); this.stickKnob.style.transform = 'translate(-50%,-50%)';
      this.stickHint.hidden = true;
      return;
    }
    // right side empty space → jump is the most useful fallback? No: slide-assign to nearest button
    this.ptrFree = this.ptrFree || new Set(); this.ptrFree.add(e.pointerId);
  },
  onMove(e) {
    const S = this.stick;
    if (e.pointerId === S.id) {
      e.preventDefault();
      const R0 = 70 * Settings.stickSize;
      let dx = e.clientX - S.ox, dy = e.clientY - S.oy;
      const d = Math.hypot(dx, dy);
      // drag the base along when pulling past the edge (floating stick)
      if (d > R0 * 1.35) { const k = (d - R0 * 1.35) / d; S.ox += dx * k; S.oy += dy * k; dx = e.clientX - S.ox; dy = e.clientY - S.oy; this.stickBase.style.left = S.ox + 'px'; this.stickBase.style.top = S.oy + 'px'; }
      const m = Math.min(1, Math.hypot(dx, dy) / R0);
      const a = Math.atan2(dy, dx);
      S.x = Math.cos(a) * m; S.y = Math.sin(a) * m;
      const kx = clamp(dx, -R0, R0), ky = clamp(dy, -R0, R0);
      this.stickKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
      return;
    }
    // sliding between buttons
    let cur = null;
    for (const k in this.buttons) if (this.buttons[k].down.has(e.pointerId)) cur = k;
    const isFree = this.ptrFree && this.ptrFree.has(e.pointerId);
    if (!cur && !isFree) return;
    const btn = this.buttonAt(e.clientX, e.clientY);
    if (btn !== cur && btn !== 'ballcam' && cur !== 'ballcam') {
      if (cur) this.release(cur, e.pointerId);
      if (btn) { this.press(btn, e.pointerId); if (isFree) this.ptrFree.delete(e.pointerId); }
    }
  },
  onUp(e) {
    if (e.pointerId === this.stick.id) {
      this.stick.id = null; this.stick.x = this.stick.y = 0; this.stickBase.classList.remove('on');
    }
    for (const k in this.buttons) if (this.buttons[k].down.has(e.pointerId)) this.release(k, e.pointerId);
    if (this.ptrFree) this.ptrFree.delete(e.pointerId);
  },
  press(name, id) {
    const b = this.buttons[name];
    b.down.add(id); b.el.classList.add('on');
    if (name === 'ballcam') { R.cam.ballCam = !R.cam.ballCam; b.el.classList.toggle('active', R.cam.ballCam); Sound.play('click'); }
  },
  release(name, id) {
    const b = this.buttons[name];
    b.down.delete(id);
    if (!b.down.size) b.el.classList.remove('on');
  },
  held(name) { return this.buttons[name] && this.buttons[name].down.size > 0; },

  onKey(e, down) {
    const k = e.code;
    if (down && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k) && !(e.target && e.target.tagName === 'INPUT')) e.preventDefault();
    if (e.target && e.target.tagName === 'INPUT') return;
    if (down) {
      if (!this.keys.has(k)) this.keyPress(k);
      this.keys.add(k);
    } else this.keys.delete(k);
    this.touchActive = false;
  },
  keyPress(k) {
    Sound.init();
    if (k === 'KeyB' || k === 'KeyC') { R.cam.ballCam = !R.cam.ballCam; this.buttons.ballcam.el.classList.toggle('active', R.cam.ballCam); }
    if (typeof UI !== 'undefined') UI.onKey(k);
  },

  // -------------------------------------------------------------------------
  // Game controller (PS4 / PS5 / Xbox via Bluetooth). Standard mapping:
  // 0 Cross/A  1 Circle/B  2 Square/X  3 Triangle/Y  4 L1  5 R1  6 L2  7 R2
  // 8 Share  9 Options  10 L3  11 R3  12-15 D-pad up/down/left/right  16 PS  17 Touchpad
  // -------------------------------------------------------------------------
  padStatus: 'none', padName: '', usingPad: false, navT: 0, navDir: null,
  initGamepad() {
    window.addEventListener('gamepadconnected', (e) => {
      this.padName = e.gamepad.id || 'Controller';
      if (typeof UI !== 'undefined') UI.toast('🎮 ' + prettyPadName(this.padName) + ' connected');
      Sound.init();
    });
    window.addEventListener('gamepaddisconnected', () => {
      if (typeof UI !== 'undefined') UI.toast('Controller disconnected');
      if (CUR.game && !CUR.attract && !UI.screen) pauseGame();
    });
  },
  pollGamepad(dt) {
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; this.padBlocked = false; }
    catch (e) { this.padBlocked = true; pads = []; }
    let gp = null;
    for (const p of pads || []) if (p && p.connected) { gp = p; break; }
    this.pad = gp;
    if (!gp) { this.padStatus = this.padBlocked ? 'blocked' : 'none'; return; }
    this.padStatus = 'ok'; this.padName = gp.id;
    const bt = gp.buttons.map(b => b.pressed || b.value > 0.5);
    const prevBt = this.padPrev;
    const edge = (i) => bt[i] && !prevBt[i];
    const any = bt.some(Boolean) || gp.axes.some(a => Math.abs(a) > 0.4);
    if (any && !this.usingPad) { this.usingPad = true; this.touchActive = false; document.body.classList.add('pad'); Sound.init(); }
    this.padPrev = bt;
    if (typeof UI === 'undefined') return;
    const inMatch = CUR.game && !CUR.attract && !UI.screen;
    if (inMatch) {
      if (CUR.game.kind === 'freeplay') {
        const G = CUR.game;
        if (edge(12)) G.freeplayLaunch();      // D-pad up: shoot the ball at me
        if (edge(13)) G.freeplayResetBall();   // D-pad down: ball to center
        if (edge(14)) G.freeplayAerial();      // D-pad left: aerial ball
        if (edge(15)) G.freeplayWall();        // D-pad right: wall / pinch ball
        if (edge(4)) G.freeplayRewind();       // L1: rewind 3 seconds
        if (edge(5)) G.freeplayFreeze();       // R1: freeze / unfreeze the ball
        if (edge(10)) G.freeplayResetCar();    // L3: reset car
        if (edge(9)) UI.onKey('Escape');
        if (edge(3)) { R.cam.ballCam = !R.cam.ballCam; this.buttons.ballcam.el.classList.toggle('active', R.cam.ballCam); }
        return;
      }
      if (edge(3)) { R.cam.ballCam = !R.cam.ballCam; this.buttons.ballcam.el.classList.toggle('active', R.cam.ballCam); Sound.play('click'); }
      if (edge(9)) UI.onKey('Escape');
      // D-pad quick chat, laid out like Rocket League (up/left/right/down)
      if (edge(12)) UI.onKey('Digit1'); if (edge(14)) UI.onKey('Digit2'); if (edge(15)) UI.onKey('Digit3'); if (edge(13)) UI.onKey('Digit4');
      const boardBtn = !!bt[17];
      if (boardBtn !== this.padBoard) { this.padBoard = boardBtn; UI.showBoard(boardBtn); }
      if ((edge(0) || edge(1)) && CUR.game.state === 'replay') skipReplay();
      return;
    }
    // ---- menus ----
    if (UI.screen === 'title') { if (bt.some((v, i) => v && !prevBt[i])) UI.padActivate(); return; }
    if (edge(0)) UI.padActivate();
    if (edge(1)) UI.onPadB();
    if (edge(9)) UI.onKey('Escape');
    if (edge(4)) UI.padTab(-1); if (edge(5)) UI.padTab(1);
    let dx = 0, dy = 0;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (bt[14] || ax < -0.55) dx = -1; else if (bt[15] || ax > 0.55) dx = 1;
    if (bt[12] || ay < -0.55) dy = -1; else if (bt[13] || ay > 0.55) dy = 1;
    const dir = dx || dy ? dx + ',' + dy : null;
    if (dir !== this.navDir) { this.navDir = dir; this.navT = 0.38; if (dir) UI.padMove(dx, dy); }
    else if (dir) { this.navT -= dt || 0.016; if (this.navT <= 0) { this.navT = 0.11; UI.padMove(dx, dy); } }
    // right stick spins the car in the garage
    if (UI.screen === 'garage' && Math.abs(gp.axes[2] || 0) > 0.2) Garage.rot += (gp.axes[2]) * 0.06;
  },

  // compose final control state for the player's car
  read() {
    const s = this.state;
    const dz = Settings.deadzone, sens = Settings.sensitivity;
    const curve = (v) => { const a = Math.abs(v); if (a < dz) return 0; return sign(v) * clamp(((a - dz) / (1 - dz)) * sens, 0, 1); };
    let steer = curve(this.stick.x), pitch = curve(-this.stick.y);
    let throttle = 0;
    // touch throttle
    if (this.stick.id !== null || this.touchActive) {
      if (Settings.autoGas) throttle = pitch < -0.5 ? -1 : 1;
      else throttle = pitch;
    }
    if (this.held('brake')) throttle = -1;
    let jump = this.held('jump'), boost = this.held('boost'), hb = this.held('handbrake');
    let rollL = this.held('rollL'), rollR = this.held('rollR'), useItem = this.held('useItem');
    // keyboard
    const K = (c) => this.keys.has(c);
    if (this.keys.size) {
      const kx = (K('KeyD') || K('ArrowRight') ? 1 : 0) - (K('KeyA') || K('ArrowLeft') ? 1 : 0);
      const ky = (K('KeyW') || K('ArrowUp') ? 1 : 0) - (K('KeyS') || K('ArrowDown') ? 1 : 0);
      if (kx) steer = kx;
      if (ky) { pitch = ky; throttle = ky; }
      if (K('Space') || K('KeyJ')) jump = true;
      if (K('ShiftLeft') || K('ShiftRight') || K('KeyK')) boost = true;
      if (K('KeyX') || K('ControlLeft') || K('KeyL')) hb = true;
      if (K('KeyQ')) rollL = true; if (K('KeyE')) rollR = true;
      if (K('KeyF')) useItem = true;
    }
    // gamepad — Rocket League PS4 default layout
    const gp = this.pad;
    this.camYaw = 0;
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.abs(ax) > dz) steer = curve(ax);
      if (Math.abs(ay) > dz) pitch = curve(-ay);
      const val = (i) => gp.buttons[i] ? Math.max(gp.buttons[i].value, gp.buttons[i].pressed ? 1 : 0) : 0;
      const rt = val(7), lt = val(6);
      if (this.usingPad || rt > 0.05 || lt > 0.05) throttle = rt > 0.05 || lt > 0.05 ? rt - lt : (this.keys.size ? throttle : 0);
      const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      if (b(0)) jump = true;            // Cross: jump
      if (b(1)) boost = true;           // Circle: boost
      if (b(2) || b(8)) hb = true;      // Square (or SHARE): powerslide / air roll
      const fp = CUR.game && CUR.game.kind === 'freeplay';
      if (b(4) && !fp) rollL = true;    // L1: air roll left (rewind in free play)
      if (CUR.game && CUR.game.mode === 'rumble') { if (b(5)) useItem = true; } // R1: use item
      else if (b(5) && !fp) rollR = true; // R1: air roll right (freeze ball in free play)
      // right stick swivels the camera, R3 looks behind
      const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
      if (Math.hypot(rx, ry) > 0.3) this.camYaw = Math.atan2(rx, -ry);
      if (b(11)) this.camYaw = Math.PI;
    }
    if (Settings.invertPitch) pitch = -pitch;
    s.steer = steer; s.pitch = pitch; s.throttle = throttle; s.jump = jump; s.boost = boost; s.handbrake = hb; s.rollL = rollL; s.rollR = rollR; s.useItem = useItem;
    return s;
  },
};

function prettyPadName(id) {
  const s = (id || '').toLowerCase();
  if (/dualsense/.test(s)) return 'DualSense controller';
  if (/dualshock|wireless controller|054c/.test(s)) return 'DUALSHOCK 4 controller';
  if (/xbox|045e/.test(s)) return 'Xbox controller';
  return 'Controller';
}
