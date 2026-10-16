/* Problem solving games */
(function () {
  'use strict';
  const NS = window.NS;
  const U = NS.util;
  const el = U.el;
  const G = NS.gk;
  const C = NS.categories.problem.color;

  /* ---------------- Mirror Shapes (mental rotation) ---------------- */
  function normalize(cells) {
    const minX = Math.min(...cells.map((c) => c[0])), minY = Math.min(...cells.map((c) => c[1]));
    return cells.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((c) => c.join(',')).join(';');
  }
  const rot = (cells) => cells.map(([x, y]) => [y, -x]);
  const mir = (cells) => cells.map(([x, y]) => [-x, y]);
  function isChiral(cells) {
    const m = normalize(mir(cells));
    let r = cells;
    for (let i = 0; i < 4; i++) { if (normalize(r) === m) return false; r = rot(r); }
    return true;
  }
  function polyomino(k) {
    for (;;) {
      const cells = [[0, 0]];
      const has = (x, y) => cells.some((c) => c[0] === x && c[1] === y);
      while (cells.length < k) {
        const [x, y] = U.pick(cells);
        const [dx, dy] = U.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        if (!has(x + dx, y + dy)) cells.push([x + dx, y + dy]);
      }
      if (isChiral(cells)) return cells;
    }
  }
  function polySVG(cells, color, angle) {
    const minX = Math.min(...cells.map((c) => c[0])), minY = Math.min(...cells.map((c) => c[1]));
    const maxX = Math.max(...cells.map((c) => c[0])), maxY = Math.max(...cells.map((c) => c[1]));
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const size = Math.max(w, h);
    const ox = (size - w) / 2 - minX, oy = (size - h) / 2 - minY;
    const rects = cells.map(([x, y]) => '<rect x="' + (x + ox) * 10 + '" y="' + (y + oy) * 10 + '" width="10" height="10" rx="1.2" fill="' + color + '" stroke="var(--surface)" stroke-width="0.8"/>').join('');
    const mark = cells[0];
    const dot = '<circle cx="' + ((mark[0] + ox) * 10 + 5) + '" cy="' + ((mark[1] + oy) * 10 + 5) + '" r="2.4" fill="#fff"/>';
    const c = size * 5;
    return '<svg viewBox="' + -size * 2 + ' ' + -size * 2 + ' ' + size * 14 + ' ' + size * 14 + '"><g transform="rotate(' + angle + ' ' + c + ' ' + c + ')">' + rects + dot + '</g></svg>';
  }
  NS.registerGame({
    id: 'mirror-shapes',
    name: 'Mirror Shapes',
    category: 'problem',
    tagline: 'Rotate shapes in your mind: is it the same shape, or its mirror image?',
    howTo: [
      'Two shapes appear side by side. The right one has been rotated.',
      'Decide whether it’s the <b>same</b> shape or a <b>mirror image</b>.',
      'The white dot marks the same block on both shapes.',
      'Shapes get bigger and rotations less tidy as you level up.',
    ],
    keys: '← Mirror   → Same',
    duration: 45,
    par: 5500,
    icon: G.icon('<path d="M18 30h12v12h12v12H18z" fill="#fff"/><path d="M82 30H70v12H58v12h24z" fill="#fff" opacity=".6"/><path d="M50 18v64" stroke="#fff" stroke-width="2" stroke-dasharray="4 4"/>', C),
    start(ctx) {
      const lvl = ctx.level;
      const k = Math.min(9, 4 + Math.floor(lvl / 3));
      const freeAngle = lvl >= 7;
      const pair = el('div', { class: 'ms-pair' });
      const bar = G.choiceBar([
        { label: 'Mirror', hint: '←', keys: ['ArrowLeft', 'm'], value: false, cls: 'no' },
        { label: 'Same', hint: '→', keys: ['ArrowRight', 's'], value: true, cls: 'yes' },
      ], answer);
      ctx.stage.append(el('div', { class: 'banner' }, 'Same shape, or mirror image?'), pair, bar.el);
      let same, shownAt = 0;
      function next() {
        const cells = polyomino(k);
        same = U.chance(0.5);
        let other = same ? cells : mir(cells);
        const angle = freeAngle ? U.randInt(20, 340) : U.pick([90, 180, 270]);
        const color = 'hsl(' + U.rand(360) + ',65%,55%)';
        pair.innerHTML = '';
        pair.append(
          el('div', { class: 'ms-box', html: polySVG(cells, color, 0) }),
          el('div', { class: 'ms-box', html: polySVG(other, color, angle) })
        );
        shownAt = U.now();
      }
      function answer(v) {
        bar.press(v);
        if (v === same) ctx.hit(100, { rt: U.now() - shownAt }); else ctx.miss({ text: same ? 'It was the same' : 'It was a mirror' });
        next();
      }
      next();
      return { onKey: (e) => bar.onKey(e) };
    },
  });

  /* ---------------- Pattern Logic (number series) ---------------- */
  function series(d) {
    const r = U.randInt;
    const gens = [
      () => { const a = r(1, 20), s = r(2, 9); return (i) => a + s * i; },
      () => { const a = r(30, 90), s = r(2, 9); return (i) => a - s * i; },
    ];
    if (d >= 2) gens.push(() => { const a = r(1, 5), m = r(2, 3); return (i) => a * Math.pow(m, i); });
    if (d >= 3) gens.push(() => { const a = r(1, 10); return (i) => a + (i * (i + 1)) / 2; }); // +1,+2,+3...
    if (d >= 4) gens.push(() => { const a = r(1, 10), x = r(2, 6), y = r(1, 9); return (i) => a + Math.ceil(i / 2) * x + Math.floor(i / 2) * y; }); // alternating steps
    if (d >= 5) gens.push(() => { const o = r(1, 5); return (i) => (i + o) * (i + o); });
    if (d >= 6) gens.push(() => { const a = r(1, 5), b = r(1, 6); const f = [a, b]; for (let i = 2; i < 8; i++) f.push(f[i - 1] + f[i - 2]); return (i) => f[i]; });
    if (d >= 7) gens.push(() => { const a = r(1, 4); return (i) => { let v = a; for (let k = 0; k < i; k++) v = v * 2 + 1; return v; }; });
    if (d >= 8) gens.push(() => { const a = r(1, 9), b = r(20, 40), s = r(2, 5), t = r(2, 6); return (i) => (i % 2 === 0 ? a + s * (i / 2) : b - t * ((i - 1) / 2)); }); // interleaved
    if (d >= 10) gens.push(() => { const a = r(2, 6), x = r(2, 3), y = r(1, 4); return (i) => { let v = a; for (let k = 0; k < i; k++) v = k % 2 === 0 ? v * x : v - y; return v; }; });
    return U.pick(gens)();
  }
  NS.registerGame({
    id: 'pattern-logic',
    name: 'Pattern Logic',
    category: 'problem',
    tagline: 'Crack the rule behind the number sequence and pick what comes next.',
    howTo: [
      'A sequence of numbers follows a hidden rule.',
      'Work out the rule and choose the number that comes next.',
      'Rules range from simple steps to alternating and growing patterns.',
    ],
    keys: 'Keys 1–4',
    duration: 60,
    par: 4500,
    icon: G.icon('<text x="50" y="58" text-anchor="middle" font-size="17" font-weight="900" fill="#fff">2 4 8 ?</text>', C),
    start(ctx) {
      const lvl = ctx.level;
      let streak = 0, ans, shownAt = 0, bar;
      const seqEl = el('div', { class: 'pl-seq' });
      const barWrap = el('div', { class: 'bar-wrap' });
      ctx.stage.append(el('div', { class: 'banner' }, 'What comes next?'), seqEl, barWrap);
      function next() {
        const d = lvl + Math.floor(streak / 3);
        let f, terms;
        for (let tries = 0; tries < 50; tries++) {
          f = series(d);
          terms = [0, 1, 2, 3, 4, 5].map(f);
          if (terms.every((t) => Number.isFinite(t) && Math.abs(t) < 5000)) break;
        }
        const shown = terms.slice(0, 5);
        ans = terms[5];
        seqEl.innerHTML = '';
        shown.forEach((t) => seqEl.appendChild(el('span', { class: 'pl-term' }, String(t))));
        seqEl.appendChild(el('span', { class: 'pl-term q' }, '?'));
        const diff = ans - terms[4];
        const opts = new Set([ans]);
        [ans + 1, ans - 1, terms[4] + diff + 2, ans + Math.abs(diff) || ans + 2, terms[4] * 2, ans - 2, ans + 5]
          .forEach((x) => { if (opts.size < 4 && x !== ans && x >= 0) opts.add(x); });
        while (opts.size < 4) opts.add(ans + U.randInt(3, 12));
        const list = U.shuffle([...opts]);
        bar = G.choiceBar(list.map((o, i) => ({ label: String(o), hint: String(i + 1), keys: [String(i + 1)], value: o })), answer, 'grid4');
        barWrap.innerHTML = '';
        barWrap.appendChild(bar.el);
        shownAt = U.now();
      }
      function answer(v) {
        if (v === ans) { streak++; ctx.hit(150, { rt: U.now() - shownAt }); }
        else { streak = Math.max(0, streak - 2); ctx.miss({ text: 'Answer: ' + ans }); }
        next();
      }
      next();
      return { onKey: (e) => bar.onKey(e) };
    },
  });

  /* ---------------- Block Count (spatial reasoning) ---------------- */
  function isoSVG(h, n) {
    const W = 10, H = 10; // half-width, cube height
    const cubes = [];
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < h[x][y]; z++) cubes.push([x, y, z]);
    cubes.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[2] - b[2]);
    const P = (x, y, z) => [(x - y) * W, (x + y) * W * 0.5 - z * H];
    const poly = (pts, fill) => '<polygon points="' + pts.map((p) => p.join(',')).join(' ') + '" fill="' + fill + '" stroke="rgba(0,0,0,.35)" stroke-width=".6" stroke-linejoin="round"/>';
    let out = '';
    cubes.forEach(([x, y, z]) => {
      const top = [P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)];
      const left = [P(x, y + 1, z + 1), P(x + 1, y + 1, z + 1), P(x + 1, y + 1, z), P(x, y + 1, z)];
      const right = [P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x + 1, y + 1, z), P(x + 1, y, z)];
      out += poly(top, '#fda4af') + poly(left, '#e11d48') + poly(right, '#f43f5e');
    });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let x = 0; x <= n; x++) for (let y = 0; y <= n; y++) for (const z of [0, 8]) {
      const [a, b] = P(x, y, z);
      minX = Math.min(minX, a); maxX = Math.max(maxX, a); minY = Math.min(minY, b); maxY = Math.max(maxY, b);
    }
    return '<svg viewBox="' + (minX - 4) + ' ' + (minY - 4) + ' ' + (maxX - minX + 8) + ' ' + (maxY - minY + 8) + '">' + out + '</svg>';
  }
  NS.registerGame({
    id: 'block-count',
    name: 'Block Count',
    category: 'problem',
    tagline: 'How many cubes are in the stack? Count the hidden ones too.',
    howTo: [
      'A stack of cubes appears.',
      'Count <b>every</b> cube — including the ones hidden underneath that hold others up.',
      'There are no floating cubes and no gaps under a cube.',
      'Pick the right total from four choices.',
    ],
    keys: 'Keys 1–4',
    duration: 60,
    par: 3500,
    icon: G.icon('<path d="M50 20 L74 32 L50 44 L26 32 Z" fill="#fff"/><path d="M26 32 L50 44 V72 L26 60 Z" fill="#fff" opacity=".6"/><path d="M74 32 L50 44 V72 L74 60 Z" fill="#fff" opacity=".8"/>', C),
    start(ctx) {
      const lvl = ctx.level;
      let solved = 0, ans, bar, shownAt = 0;
      const view = el('div', { class: 'bc-view' });
      const barWrap = el('div', { class: 'bar-wrap' });
      ctx.stage.append(el('div', { class: 'banner' }, 'How many cubes?'), view, barWrap);
      function next() {
        const d = lvl + Math.floor(solved / 4);
        const n = d < 4 ? 2 : d < 9 ? 3 : 4;
        const maxH = Math.min(5, 2 + Math.floor(d / 3));
        // plane partition: heights non-increasing toward the viewer, so tops are always visible
        const h = [];
        for (let x = 0; x < n; x++) {
          h.push([]);
          for (let y = 0; y < n; y++) {
            const limit = Math.min(x > 0 ? h[x - 1][y] : maxH, y > 0 ? h[x][y - 1] : maxH);
            h[x].push(U.randInt(x + y === 0 ? 1 : 0, limit));
          }
        }
        ans = h.flat().reduce((a, b) => a + b, 0);
        view.innerHTML = isoSVG(h, n);
        const opts = U.shuffle([ans, ...distractors(ans)]);
        bar = G.choiceBar(opts.map((o, i) => ({ label: String(o), hint: String(i + 1), keys: [String(i + 1)], value: o })), answer, 'grid4');
        barWrap.innerHTML = '';
        barWrap.appendChild(bar.el);
        shownAt = U.now();
      }
      function distractors(a) {
        const s = new Set([a]);
        for (const x of U.shuffle([a - 1, a + 1, a - 2, a + 2, a + 3, a - 3])) if (x > 0 && s.size < 4) s.add(x);
        s.delete(a);
        return [...s];
      }
      function answer(v) {
        if (v === ans) { solved++; ctx.hit(150, { rt: U.now() - shownAt }); }
        else { solved = Math.max(0, solved - 2); ctx.miss({ text: 'It was ' + ans }); }
        next();
      }
      next();
      return { onKey: (e) => bar.onKey(e) };
    },
  });
})();
