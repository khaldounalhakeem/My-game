/* Helpers shared by the games. */
(function () {
  'use strict';
  const NS = window.NS;
  const U = NS.util;
  const el = U.el;

  /* Shape library: SVG path data in a 100x100 box */
  const SHAPES = {
    circle: '<circle cx="50" cy="50" r="38"/>',
    square: '<rect x="14" y="14" width="72" height="72" rx="6"/>',
    triangle: '<path d="M50 10 L90 86 L10 86 Z"/>',
    diamond: '<path d="M50 6 L92 50 L50 94 L8 50 Z"/>',
    star: '<path d="M50 6 L61 38 L95 38 L67 58 L78 92 L50 71 L22 92 L33 58 L5 38 L39 38 Z"/>',
    hexagon: '<path d="M27 10 L73 10 L95 50 L73 90 L27 90 L5 50 Z"/>',
    cross: '<path d="M36 8 H64 V36 H92 V64 H64 V92 H36 V64 H8 V36 H36 Z"/>',
    heart: '<path d="M50 88 C10 60 4 38 14 24 C24 10 44 12 50 28 C56 12 76 10 86 24 C96 38 90 60 50 88 Z"/>',
    moon: '<path d="M64 8 A42 42 0 1 0 92 66 A34 34 0 1 1 64 8 Z"/>',
    pentagon: '<path d="M50 6 L94 38 L77 90 L23 90 L6 38 Z"/>',
    arrow: '<path d="M50 6 L90 48 H66 V94 H34 V48 H10 Z"/>',
    drop: '<path d="M50 6 C66 34 82 50 82 64 A32 32 0 0 1 18 64 C18 50 34 34 50 6 Z"/>',
  };
  const SHAPE_NAMES = Object.keys(SHAPES);
  const PALETTE = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];

  function shapeSVG(name, color, size) {
    return '<svg viewBox="0 0 100 100" width="' + (size || 80) + '" height="' + (size || 80) + '" fill="' + (color || 'currentColor') + '">' + SHAPES[name] + '</svg>';
  }

  /*
   * Answer bar: a row of big buttons, each mapped to keys.
   * choices: [{label, keys:['ArrowLeft'], value, cls}]
   */
  function choiceBar(choices, onChoose, extraClass) {
    let enabled = true;
    const bar = el('div', { class: 'choice-bar ' + (extraClass || '') });
    const btns = choices.map((c) =>
      el('button', {
        class: 'choice ' + (c.cls || ''),
        html: c.label + (c.hint ? '<small>' + c.hint + '</small>' : ''),
        style: c.style || null,
        onpointerdown: (e) => { e.preventDefault(); if (enabled) onChoose(c.value, e, c); },
      })
    );
    btns.forEach((b) => bar.appendChild(b));
    return {
      el: bar,
      buttons: btns,
      onKey(e) {
        for (const c of choices) {
          if (c.keys && c.keys.includes(e.key)) {
            e.preventDefault();
            if (enabled && !e.repeat) onChoose(c.value, null, c);
            return true;
          }
        }
        return false;
      },
      enable(v) { enabled = v; bar.classList.toggle('disabled', !v); },
      press(value) {
        const i = choices.findIndex((c) => c.value === value);
        if (i >= 0) { btns[i].classList.remove('pressed'); void btns[i].offsetWidth; btns[i].classList.add('pressed'); }
      },
    };
  }

  const YES_NO = [
    { label: 'No', hint: '←', keys: ['ArrowLeft', 'n', 'N'], value: false, cls: 'no' },
    { label: 'Yes', hint: '→', keys: ['ArrowRight', 'y', 'Y'], value: true, cls: 'yes' },
  ];

  /* simple icon builder for game cards */
  function icon(inner, bg) {
    return '<svg viewBox="0 0 100 100" class="game-icon"><rect width="100" height="100" rx="24" fill="' + bg + '"/>' + inner + '</svg>';
  }

  /* Point under event for float text */
  function pt(e) {
    if (!e) return {};
    return { x: e.clientX, y: e.clientY };
  }

  /* Swipe detection: calls cb('left'|'right'|'up'|'down', event) */
  function swipe(target, cb) {
    let sx = 0, sy = 0, active = false;
    target.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; active = true; sx = e.clientX; sy = e.clientY; });
    target.addEventListener('pointerup', (e) => {
      if (!active) return;
      active = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
      if (Math.abs(dx) > Math.abs(dy)) cb(dx > 0 ? 'right' : 'left', e);
      else cb(dy > 0 ? 'down' : 'up', e);
    });
    target.addEventListener('pointercancel', () => (active = false));
  }

  const ARROW_KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
  const DIR_ANGLE = { right: 0, down: 90, left: 180, up: 270 };
  const ARROW_SVG = '<svg viewBox="0 0 100 100"><path d="M10 40 H58 V18 L92 50 L58 82 V60 H10 Z" fill="currentColor"/></svg>';

  /* Direction pad (2 or 4 buttons) */
  function dirPad(dirs, onChoose) {
    const labels = { left: '←', right: '→', up: '↑', down: '↓' };
    const keys = { left: ['ArrowLeft', 'a'], right: ['ArrowRight', 'd'], up: ['ArrowUp', 'w'], down: ['ArrowDown', 's'] };
    const bar = choiceBar(dirs.map((d) => ({ label: labels[d], keys: keys[d], value: d, cls: 'dir dir-' + d })), onChoose, dirs.length === 4 ? 'dpad' : '');
    return bar;
  }

  NS.gk = { SHAPES, SHAPE_NAMES, PALETTE, shapeSVG, choiceBar, YES_NO, icon, pt, swipe, ARROW_KEYS, DIR_ANGLE, ARROW_SVG, dirPad };
})();
