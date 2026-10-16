/* Attention games */
(function () {
  'use strict';
  const NS = window.NS;
  const U = NS.util;
  const el = U.el;
  const G = NS.gk;
  const C = NS.categories.attention.color;

  const COLORS = [
    { name: 'RED', hex: '#ef4444' },
    { name: 'BLUE', hex: '#3b82f6' },
    { name: 'GREEN', hex: '#22c55e' },
    { name: 'YELLOW', hex: '#eab308' },
    { name: 'PURPLE', hex: '#a855f7' },
    { name: 'ORANGE', hex: '#f97316' },
  ];

  /* ---------------- Color Clash (Stroop) ---------------- */
  NS.registerGame({
    id: 'color-clash',
    name: 'Color Clash',
    category: 'attention',
    tagline: 'Name the ink color — not the word.',
    howTo: [
      'A color word appears, printed in some ink color.',
      'Tap the button for the <b>ink color</b>, ignoring what the word says.',
      'Example: <b style="color:#3b82f6">RED</b> → answer <b>Blue</b>.',
      'At higher levels the buttons shuffle, and sometimes you’re asked for the <b>word</b> instead.',
    ],
    keys: 'Number keys 1–6',
    duration: 45,
    par: 11000,
    icon: G.icon('<text x="50" y="62" text-anchor="middle" font-size="30" font-weight="900" fill="#fff">RED</text><rect x="22" y="70" width="56" height="8" rx="4" fill="#3b82f6"/>', C),
    start(ctx) {
      const lvl = ctx.level;
      const n = Math.min(6, 3 + Math.floor(lvl / 3));
      const pal = COLORS.slice(0, n);
      const shuffleButtons = lvl >= 8;
      const switchRule = lvl >= 14;
      let word, ink, rule = 'ink', shownAt = 0, bar;
      const ruleEl = el('div', { class: 'banner' });
      const wordEl = el('div', { class: 'stroop-word' });
      const barWrap = el('div', { class: 'bar-wrap' });
      ctx.stage.append(ruleEl, wordEl, barWrap);

      function makeBar() {
        const order = shuffleButtons ? U.shuffle(pal) : pal;
        bar = G.choiceBar(order.map((c, i) => ({ label: c.name[0] + c.name.slice(1).toLowerCase(), hint: String(i + 1), keys: [String(i + 1)], value: c.name, cls: 'color', style: { background: c.hex } })), answer, 'colors');
        barWrap.innerHTML = '';
        barWrap.appendChild(bar.el);
      }
      function next() {
        word = U.pick(pal);
        const congruent = U.chance(Math.max(0.15, 0.3 - lvl * 0.01));
        ink = congruent ? word : U.pick(pal.filter((c) => c !== word));
        rule = switchRule && U.chance(0.3) ? 'word' : 'ink';
        ruleEl.innerHTML = rule === 'ink' ? 'Tap the <b>INK</b> color' : 'Tap what the <b>WORD</b> says';
        ruleEl.classList.toggle('alt', rule === 'word');
        wordEl.textContent = word.name;
        wordEl.style.color = ink.hex;
        wordEl.classList.remove('pop'); void wordEl.offsetWidth; wordEl.classList.add('pop');
        if (shuffleButtons || !bar) makeBar();
        shownAt = U.now();
      }
      function answer(v, e) {
        const want = rule === 'ink' ? ink.name : word.name;
        if (v === want) ctx.hit(100, { rt: U.now() - shownAt }); else ctx.miss();
        next();
      }
      next();
      return { onKey: (e) => bar.onKey(e) };
    },
  });

  /* ---------------- Arrow Flock (flanker) ---------------- */
  NS.registerGame({
    id: 'arrow-flock',
    name: 'Arrow Flock',
    category: 'attention',
    tagline: 'Which way is the middle arrow pointing? Ignore the rest of the flock.',
    howTo: [
      'A flock of arrows appears.',
      'Respond with the direction the <b>center</b> arrow points.',
      'The surrounding arrows often point another way — don’t let them fool you.',
      'Use the buttons, swipe, or the arrow keys.',
    ],
    keys: 'Arrow keys',
    duration: 45,
    par: 12000,
    icon: G.icon(
      [18, 34, 50, 66, 82].map((x) => '<g transform="translate(' + x + ' 50)"><path d="M-7 -3 H1 V-8 L8 0 L1 8 V3 H-7 Z" fill="' + (x === 50 ? '#fde047' : '#fff') + '"' + (x === 50 ? ' transform="rotate(180)"' : '') + '/></g>').join(''),
      C
    ),
    start(ctx) {
      const lvl = ctx.level;
      const four = lvl >= 4;
      const dirs = four ? ['left', 'up', 'down', 'right'] : ['left', 'right'];
      const incongruentP = Math.min(0.75, 0.45 + lvl * 0.02);
      const field = el('div', { class: 'flock-field' });
      const pad = G.dirPad(dirs, (d, e) => answer(d, e));
      ctx.stage.append(field, pad.el);
      G.swipe(field, (d, e) => { if (dirs.includes(d)) answer(d, e); });
      let target, shownAt = 0;

      const layouts = {
        line: [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0]],
        plus: [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]],
        cross: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
        diamond: [[0, -2], [-1, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [1, 1], [0, 2]],
        vee: [[-2, -1], [-1, 0], [0, 0], [1, 0], [2, -1], [0, 1]],
      };
      function next() {
        const options = lvl < 4 ? ['line'] : lvl < 8 ? ['line', 'plus', 'cross'] : ['line', 'plus', 'cross', 'diamond', 'vee'];
        const lay = layouts[U.pick(options)];
        target = U.pick(dirs);
        const flank = U.chance(incongruentP) ? U.pick(dirs.filter((d) => d !== target)) : target;
        const mixed = lvl >= 12 && U.chance(0.4);
        field.innerHTML = '';
        const ox = lvl >= 10 ? U.randInt(-18, 18) : 0;
        const oy = lvl >= 10 ? U.randInt(-14, 14) : 0;
        const group = el('div', { class: 'flock', style: { transform: 'translate(' + ox + '%,' + oy + '%)' } });
        lay.forEach(([x, y]) => {
          const isT = x === 0 && y === 0;
          const d = isT ? target : mixed ? U.pick(dirs) : flank;
          const a = el('div', { class: 'flock-arrow', html: G.ARROW_SVG, style: { left: 'calc(50% + ' + x * 1.15 + 'em)', top: 'calc(50% + ' + y * 1.15 + 'em)', transform: 'translate(-50%,-50%) rotate(' + G.DIR_ANGLE[d] + 'deg)' } });
          group.appendChild(a);
        });
        field.appendChild(group);
        shownAt = U.now();
      }
      function answer(d, e) {
        if (!field.firstChild) return;
        pad.press(d);
        if (d === target) ctx.hit(100, { rt: U.now() - shownAt }); else ctx.miss();
        field.innerHTML = '';
        ctx.later(next, 140);
      }
      next();
      return { onKey: (e) => pad.onKey(e) };
    },
  });

  /* ---------------- Odd One Out (visual search) ---------------- */
  NS.registerGame({
    id: 'odd-one-out',
    name: 'Odd One Out',
    category: 'attention',
    tagline: 'Find the one item that’s different — fast.',
    howTo: [
      'A grid of nearly identical items appears.',
      'Exactly one of them is different: color, shape, or rotation.',
      'Tap it as quickly as you can.',
      'Grids get larger and differences get subtler as you level up.',
    ],
    duration: 45,
    par: 6000,
    icon: G.icon(
      [0, 1, 2].map((r) => [0, 1, 2].map((c) => '<circle cx="' + (28 + c * 22) + '" cy="' + (28 + r * 22) + '" r="8" fill="' + (r === 1 && c === 2 ? '#fde047' : '#fff') + '"/>').join('')).join(''),
      C
    ),
    start(ctx) {
      const lvl = ctx.level;
      const board = el('div', { class: 'odd-board' });
      ctx.stage.append(board);
      let round = 0, shownAt = 0;
      const lookalike = { circle: 'hexagon', square: 'diamond', triangle: 'arrow', star: 'pentagon', hexagon: 'circle', heart: 'drop', pentagon: 'hexagon', moon: 'drop' };

      function next() {
        round++;
        const step = Math.floor(round / 4) + Math.floor(lvl / 2);
        const n = Math.min(8, 3 + Math.floor(step / 2));
        const base = U.pick(Object.keys(lookalike));
        const hue = U.rand(360);
        const mode = U.pick(lvl < 3 ? ['color', 'shape'] : ['color', 'shape', 'rotate']);
        const delta = Math.max(14, 70 - lvl * 3 - round);
        const rot = U.rand(4) * 90;
        const odd = U.rand(n * n);
        board.style.setProperty('--n', n);
        board.innerHTML = '';
        for (let i = 0; i < n * n; i++) {
          const isOdd = i === odd;
          let shape = base, color = 'hsl(' + hue + ',70%,55%)', r = rot;
          if (isOdd) {
            if (mode === 'color') color = 'hsl(' + (hue + delta) + ',70%,55%)';
            else if (mode === 'shape') shape = lookalike[base];
            else r = rot + (base === 'circle' ? 0 : U.pick([90, 180]));
            if (mode === 'rotate' && (base === 'circle' || base === 'hexagon')) shape = lookalike[base];
          }
          const b = el('button', { class: 'odd-item', html: G.shapeSVG(shape, color, 100), style: { transform: 'rotate(' + r + 'deg)' } });
          b.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (isOdd) { ctx.hit(100, { rt: U.now() - shownAt, x: e.clientX, y: e.clientY }); next(); }
            else { ctx.miss(G.pt(e)); b.classList.add('shake'); }
          });
          board.appendChild(b);
        }
        shownAt = U.now();
      }
      next();
      return {};
    },
  });

  /* ---------------- Wide View (useful field of view) ---------------- */
  NS.registerGame({
    id: 'wide-view',
    name: 'Wide View',
    category: 'attention',
    tagline: 'Catch the center symbol and the star at the edge — in a single glance.',
    howTo: [
      'Keep your eyes on the center. A symbol flashes there while a <b>star</b> flashes somewhere around the edge.',
      'First, choose which symbol was in the center.',
      'Then tap the spot where the star appeared.',
      'Flashes get shorter and distractors appear as you improve.',
    ],
    duration: 60,
    par: 7000,
    icon: G.icon('<circle cx="50" cy="50" r="30" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="5 6"/><rect x="42" y="42" width="16" height="16" rx="3" fill="#fff"/><path d="M80 18 l3 7 h7 l-6 4 l2 7 l-6 -4 l-6 4 l2 -7 l-6 -4 h7 z" fill="#fde047"/>', C),
    start(ctx) {
      const lvl = ctx.level;
      const flashMs = Math.max(90, 650 - lvl * 30);
      const slotsN = lvl < 5 ? 8 : 12;
      const distract = lvl >= 4;
      const pairs = [['circle', 'square'], ['triangle', 'diamond'], ['heart', 'drop'], ['star', 'cross'], ['hexagon', 'pentagon']];
      const field = el('div', { class: 'wv-field' });
      const center = el('div', { class: 'wv-center' });
      const prompt = el('div', { class: 'banner' }, 'Focus on the center');
      const barWrap = el('div', { class: 'bar-wrap' });
      field.appendChild(center);
      const slots = [];
      for (let i = 0; i < slotsN; i++) {
        const ang = (i / slotsN) * Math.PI * 2 - Math.PI / 2;
        const ring = i % 2 === 0 || slotsN === 8 ? 40 : 30;
        const s = el('button', { class: 'wv-slot', style: { left: 50 + Math.cos(ang) * ring + '%', top: 50 + Math.sin(ang) * ring + '%' } });
        s.addEventListener('pointerdown', (e) => { e.preventDefault(); pickSlot(i, e); });
        slots.push(s);
        field.appendChild(s);
      }
      ctx.stage.append(prompt, field, barWrap);
      let pair, symbol, starAt, phase = 'idle';

      function trial() {
        phase = 'show';
        barWrap.innerHTML = '';
        prompt.textContent = 'Focus on the center';
        slots.forEach((s) => { s.innerHTML = ''; s.className = 'wv-slot'; });
        center.innerHTML = '+';
        ctx.later(() => {
          pair = U.pick(pairs);
          symbol = U.pick(pair);
          starAt = U.rand(slotsN);
          center.innerHTML = G.shapeSVG(symbol, 'var(--ink)', 54);
          slots.forEach((s, i) => {
            if (i === starAt) s.innerHTML = G.shapeSVG('star', '#facc15', 34);
            else if (distract) s.innerHTML = G.shapeSVG('square', 'var(--muted)', 26);
          });
          ctx.later(mask, flashMs);
        }, 700);
      }
      function mask() {
        center.innerHTML = '<div class="wv-mask"></div>';
        slots.forEach((s) => { s.innerHTML = ''; s.classList.add('masked'); });
        ctx.later(askCenter, 250);
      }
      function askCenter() {
        phase = 'center';
        center.innerHTML = '?';
        prompt.textContent = 'Which symbol was in the center?';
        const bar = G.choiceBar(U.shuffle(pair).map((p, i) => ({ label: G.shapeSVG(p, 'currentColor', 40), hint: String(i + 1), keys: [String(i + 1)], value: p })), (v, e) => {
          if (phase !== 'center') return;
          if (v === symbol) ctx.hit(50, { quiet: true }); else ctx.miss({ quiet: true });
          center.innerHTML = G.shapeSVG(symbol, v === symbol ? '#22c55e' : '#ef4444', 54);
          phase = 'slot';
          barWrap.innerHTML = '';
          prompt.textContent = 'Where was the star?';
          slots.forEach((s) => s.classList.add('pickable'));
        });
        S.bar = bar;
        barWrap.appendChild(bar.el);
      }
      function pickSlot(i, e) {
        if (phase !== 'slot') return;
        phase = 'idle';
        slots.forEach((s) => s.classList.remove('pickable'));
        slots[starAt].innerHTML = G.shapeSVG('star', '#facc15', 34);
        if (i === starAt) ctx.hit(100, G.pt(e));
        else { ctx.miss(G.pt(e)); slots[i].classList.add('wrong'); }
        ctx.later(trial, 700);
      }
      const S = {};
      trial();
      return { onKey: (e) => { if (phase === 'center' && S.bar) S.bar.onKey(e); } };
    },
  });
})();
