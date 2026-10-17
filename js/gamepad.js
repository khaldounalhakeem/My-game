'use strict';
/* Game controller support (PS4 / PS5 / Xbox through the browser Gamepad API), laid out like
   Minecraft on PlayStation. In menus the left stick moves a pointer and Cross clicks. */

const PADB = { X: 0, O: 1, SQ: 2, TRI: 3, L1: 4, R1: 5, L2: 6, R2: 7, SHARE: 8, OPTIONS: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

const Pad = {
  active: false, prev: [], cx: 0, cy: 0, lastJump: 0, sprintOn: false, sneakOn: false, repeatT: 0,

  poll(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) {
      if (this.active) { this.active = false; document.body.classList.remove('pad'); G.ui.message('Controller disconnected.'); }
      Input.pad = null; Input.padLeft = Input.padRight = false;
      return;
    }
    const now = gp.buttons.map(b => !!(b && (b.pressed || b.value > 0.5)));
    const down = i => now[i] && !this.prev[i];
    const ax = i => { const v = gp.axes[i] || 0; return Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85; };
    if (!this.active) {
      if (!now.some(Boolean) && ![0, 1, 2, 3].some(i => ax(i))) { this.prev = now; return; }
      this.active = true;
      document.body.classList.add('pad');
      this.cx = window.innerWidth / 2; this.cy = window.innerHeight / 2;
      G.ui.message('Controller connected! R2 mine, L2 place, X jump, Triangle inventory. Press OPTIONS to see all buttons.', 'gold');
      if (G.state === 'play') G.unlock();
      this.prev = now;
      return;
    }

    if (G.state === 'play') this.playControls(dt, now, down, ax);
    else this.menuControls(dt, now, down, ax);
    this.prev = now;
  },

  playControls(dt, now, down, ax) {
    const P = G.player;
    const mx = ax(0), mz = -ax(1);
    if (down(PADB.L3)) this.sprintOn = !this.sprintOn;
    if (mz < 0.3) this.sprintOn = false;
    if (down(PADB.R3)) this.sneakOn = !this.sneakOn;
    Input.pad = { mx, mz, jump: now[PADB.X], sneak: this.sneakOn || (P.flying && now[PADB.R3]), sprint: this.sprintOn };
    const rx = ax(2), ry = ax(3);
    Input.lookDX += Math.sign(rx) * rx * rx * dt * 1250;
    Input.lookDY += Math.sign(ry) * ry * ry * dt * 900;
    Input.padLeft = now[PADB.R2];
    Input.padRight = now[PADB.L2];
    if (down(PADB.R2)) Input.leftPressed = true;
    if (down(PADB.L2)) Input.rightPressed = true;
    if (down(PADB.X)) {
      const t = performance.now();
      if (t - this.lastJump < 300 && P.mode === 'creative') Input.flyToggle = true;
      this.lastJump = t;
    }
    if (down(PADB.L1) || down(PADB.LEFT)) P.sel = (P.sel + 8) % 9;
    if (down(PADB.R1) || down(PADB.RIGHT)) P.sel = (P.sel + 1) % 9;
    if (down(PADB.TRI) || down(PADB.SQ)) { Input.pad = null; Input.padLeft = Input.padRight = false; G.ui.openInventory(null); }
    else if (down(PADB.O)) P.dropHeld(false);
    else if (down(PADB.UP)) G.camMode = (G.camMode + 1) % 3;
    else if (down(PADB.DOWN)) this.sneakOn = !this.sneakOn;
    else if (down(PADB.OPTIONS)) { Input.pad = null; Input.padLeft = Input.padRight = false; G.pause(); }
  },

  menuControls(dt, now, down, ax) {
    Input.pad = null; Input.padLeft = Input.padRight = false;
    const sp = 950 * dt;
    let dx = ax(0) * sp, dy = ax(1) * sp;
    // d-pad nudges the pointer one step at a time
    this.repeatT -= dt;
    const dp = [PADB.UP, PADB.DOWN, PADB.LEFT, PADB.RIGHT].find(i => now[i]);
    if (dp !== undefined && (down(dp) || this.repeatT <= 0)) {
      this.repeatT = down(dp) ? 0.35 : 0.08;
      const step = 46;
      if (dp === PADB.UP) dy -= step; if (dp === PADB.DOWN) dy += step;
      if (dp === PADB.LEFT) dx -= step; if (dp === PADB.RIGHT) dx += step;
    }
    this.cx = clamp(this.cx + dx, 0, window.innerWidth - 2);
    this.cy = clamp(this.cy + dy, 0, window.innerHeight - 2);
    const cur = $('padcursor');
    cur.style.transform = `translate(${this.cx}px, ${this.cy}px)`;
    G.ui.mouseX = this.cx; G.ui.mouseY = this.cy;
    G.ui.moveCursor();
    const el = document.elementFromPoint(this.cx, this.cy);
    const slot = el && el.closest('.slot');
    if (slot !== this.hover) { this.hover = slot; G.ui.tip(slot ? slot.dataset.name : ''); }
    const ry = ax(3);
    if (ry && el) {
      const sc = el.closest('#recipes, #catalog, .panel.inv, .screen');
      if (sc) sc.scrollTop += ry * dt * 900;
    }
    if (down(PADB.X)) this.click(el, 0, false);
    else if (down(PADB.SQ)) this.click(el, 0, true);
    else if (down(PADB.TRI)) {
      if (G.state === 'inventory') G.ui.closeInventory(); else this.click(el, 2, false);
    } else if (down(PADB.L2)) this.click(el, 2, false);
    else if (down(PADB.O) || down(PADB.OPTIONS)) {
      if (G.state === 'inventory') G.ui.closeInventory();
      else if (G.state === 'pause') G.resume();
    }
  },

  click(el, button, shift) {
    if (!el) return;
    if (el.matches('input[type=range]')) {
      const r = el.getBoundingClientRect(), min = +el.min, max = +el.max, step = +el.step || 1;
      const v = min + clamp((this.cx - r.left) / r.width, 0, 1) * (max - min);
      el.value = Math.round(v / step) * step;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (el.matches('input')) { el.focus(); return; }
    const o = { bubbles: true, cancelable: true, clientX: this.cx, clientY: this.cy, button, shiftKey: shift, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
    if (button === 0) el.dispatchEvent(new MouseEvent('click', o));
  },
};
