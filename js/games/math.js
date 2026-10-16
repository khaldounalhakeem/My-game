/* Math games */
(function () {
  'use strict';
  const NS = window.NS;
  const U = NS.util;
  const el = U.el;
  const G = NS.gk;
  const C = NS.categories.math.color;

  function distractors(ans, count) {
    const set = new Set([ans]);
    const cands = [ans + 1, ans - 1, ans + 2, ans - 2, ans + 10, ans - 10, ans + 3, ans - 3, ans * 2, Math.round(ans / 2)];
    const out = [];
    for (const c of U.shuffle(cands)) {
      if (out.length >= count) break;
      if (c < 0 || set.has(c)) continue;
      set.add(c);
      out.push(c);
    }
    while (out.length < count) { const c = ans + U.randInt(4, 15); if (!set.has(c)) { set.add(c); out.push(c); } }
    return out;
  }

  /* ---------------- Quick Sums ---------------- */
  NS.registerGame({
    id: 'quick-sums',
    name: 'Quick Sums',
    category: 'math',
    tagline: 'Solve as many arithmetic problems as you can before time runs out.',
    howTo: [
      'An arithmetic problem appears.',
      'Tap the correct answer out of four choices.',
      'Problems get harder the more you get right in a row.',
    ],
    keys: 'Keys 1–4',
    duration: 60,
    par: 10000,
    icon: G.icon('<text x="50" y="48" text-anchor="middle" font-size="24" font-weight="900" fill="#fff">7+5</text><text x="50" y="78" text-anchor="middle" font-size="24" font-weight="900" fill="#fff" opacity=".8">=12</text>', C),
    start(ctx) {
      const lvl = ctx.level;
      let correct = 0, ans, shownAt = 0, bar;
      const prob = el('div', { class: 'math-problem' });
      const barWrap = el('div', { class: 'bar-wrap' });
      ctx.stage.append(prob, barWrap);

      function gen(d) {
        const r = U.randInt;
        const t = U.rand(100);
        if (d <= 3) {
          if (t < 55) { const a = r(1, 9 + d * 3), b = r(1, 9 + d * 2); return [a + ' + ' + b, a + b]; }
          const a = r(5, 15 + d * 3), b = r(1, a); return [a + ' − ' + b, a - b];
        }
        if (d <= 6) {
          if (t < 35) { const a = r(10, 60), b = r(5, 40); return [a + ' + ' + b, a + b]; }
          if (t < 65) { const a = r(20, 90), b = r(5, a); return [a + ' − ' + b, a - b]; }
          const a = r(2, 9), b = r(2, 9); return [a + ' × ' + b, a * b];
        }
        if (d <= 10) {
          if (t < 30) { const a = r(3, 12), b = r(3, 12); return [a + ' × ' + b, a * b]; }
          if (t < 55) { const b = r(2, 12), q = r(2, 12); return [b * q + ' ÷ ' + b, q]; }
          if (t < 80) { const a = r(40, 150), b = r(15, 99); return [a + ' + ' + b, a + b]; }
          const a = r(60, 200), b = r(15, a - 10); return [a + ' − ' + b, a - b];
        }
        if (t < 25) { const a = r(3, 12), b = r(3, 15), c = a * b; return [a + ' × ? = ' + c, b]; }
        if (t < 45) { const a = r(2, 20), b = r(2, 9), c = r(2, 9); return [a + ' + ' + b + ' × ' + c, a + b * c]; }
        if (t < 65) { const a = r(11, 25), b = r(3, 9); return [a + ' × ' + b, a * b]; }
        if (t < 85) { const b = r(3, 15), q = r(5, 20); return [b * q + ' ÷ ' + b, q]; }
        const a = r(100, 500), b = r(50, 300); return [a + ' + ' + b, a + b];
      }
      function next() {
        const d = lvl + Math.floor(correct / 5);
        const [text, a] = gen(d);
        ans = a;
        prob.innerHTML = '';
        prob.appendChild(el('span', {}, text.includes('?') ? text : text + ' = ?'));
        prob.classList.remove('pop'); void prob.offsetWidth; prob.classList.add('pop');
        const opts = U.shuffle([a, ...distractors(a, 3)]);
        bar = G.choiceBar(opts.map((o, i) => ({ label: String(o), hint: String(i + 1), keys: [String(i + 1)], value: o })), answer, 'grid4');
        barWrap.innerHTML = '';
        barWrap.appendChild(bar.el);
        shownAt = U.now();
      }
      function answer(v) {
        if (v === ans) { correct++; ctx.hit(100 + Math.min(100, (lvl + Math.floor(correct / 5)) * 5), { rt: U.now() - shownAt }); }
        else { ctx.miss({ text: '= ' + ans }); correct = Math.max(0, correct - 3); }
        next();
      }
      next();
      return { onKey: (e) => bar.onKey(e) };
    },
  });

  /* ---------------- Operator ---------------- */
  const OPS = ['+', '−', '×', '÷'];
  function evalExpr(nums, ops) {
    // standard precedence; returns null when a division isn't exact
    const n = nums.slice(), o = ops.slice();
    for (let i = 0; i < o.length; ) {
      if (o[i] === '×' || o[i] === '÷') {
        let v;
        if (o[i] === '×') v = n[i] * n[i + 1];
        else { if (n[i + 1] === 0 || n[i] % n[i + 1] !== 0) return null; v = n[i] / n[i + 1]; }
        n.splice(i, 2, v); o.splice(i, 1);
      } else i++;
    }
    let v = n[0];
    for (let i = 0; i < o.length; i++) v = o[i] === '+' ? v + n[i + 1] : v - n[i + 1];
    return v;
  }
  NS.registerGame({
    id: 'operator',
    name: 'Operator',
    category: 'math',
    tagline: 'Find the missing operator that makes the equation true.',
    howTo: [
      'An equation appears with a blank operator: <b>8 ? 4 = 32</b>.',
      'Choose <b>+ − × ÷</b> to make it true.',
      'At higher levels there are two blanks — fill them left to right (× and ÷ come before + and −).',
    ],
    keys: '+ - * / or 1–4',
    duration: 45,
    par: 6500,
    icon: G.icon('<text x="50" y="62" text-anchor="middle" font-size="26" font-weight="900" fill="#fff">8 ? 4</text><rect x="40" y="70" width="20" height="5" rx="2.5" fill="#fff"/>', C),
    start(ctx) {
      const lvl = ctx.level;
      let nums, ops, picked = [], target, shownAt = 0;
      const eq = el('div', { class: 'math-problem eq' });
      const bar = G.choiceBar(OPS.map((o, i) => ({ label: o, hint: String(i + 1), keys: [String(i + 1), ['+', '-', '*', '/'][i], ['+', '_', 'x', '÷'][i]], value: o })), pick, 'ops');
      ctx.stage.append(eq, bar.el);

      function count(nums, t) {
        let c = 0;
        const k = nums.length - 1;
        const combos = k === 1 ? OPS.map((a) => [a]) : OPS.flatMap((a) => OPS.map((b) => [a, b]));
        for (const cmb of combos) if (evalExpr(nums, cmb) === t) c++;
        return c;
      }
      function next() {
        const two = lvl >= 8 && U.chance(Math.min(0.8, 0.3 + (lvl - 8) * 0.06));
        const max = Math.min(20, 9 + lvl);
        for (let tries = 0; tries < 200; tries++) {
          nums = two ? [U.randInt(1, max), U.randInt(1, max), U.randInt(1, 9)] : [U.randInt(1, max), U.randInt(1, max)];
          ops = nums.slice(1).map(() => U.pick(OPS));
          if (ops[0] === '÷' && !two) nums[0] = nums[1] * U.randInt(1, 9);
          target = evalExpr(nums, ops);
          if (target == null || target < 0) continue;
          if (count(nums, target) === 1) break;
        }
        picked = [];
        render();
        shownAt = U.now();
      }
      function render() {
        eq.innerHTML = '';
        nums.forEach((n, i) => {
          eq.appendChild(el('span', { class: 'num' }, String(n)));
          if (i < ops.length) eq.appendChild(el('span', { class: 'op-slot' + (i === picked.length ? ' active' : '') + (picked[i] ? ' filled' : '') }, picked[i] || '?'));
        });
        eq.appendChild(el('span', { class: 'num' }, '= ' + target));
      }
      function pick(o) {
        bar.press(o);
        picked.push(o);
        render();
        if (picked.length < ops.length) return;
        const ok = evalExpr(nums, picked) === target;
        if (ok) ctx.hit(ops.length === 2 ? 180 : 100, { rt: U.now() - shownAt }); else ctx.miss({ text: ops.join(' ') });
        bar.enable(false);
        ctx.later(() => { bar.enable(true); next(); }, ok ? 150 : 600);
      }
      next();
      return { onKey: (e) => bar.onKey(e) };
    },
  });

  /* ---------------- More or Less (approximate number) ---------------- */
  NS.registerGame({
    id: 'more-or-less',
    name: 'More or Less',
    category: 'math',
    tagline: 'Two groups of dots flash by. Which side had more?',
    howTo: [
      'Two boxes of dots flash for a moment.',
      'There’s no time to count — estimate!',
      'Pick the side that had <b>more</b> dots.',
      'The difference gets smaller as you improve.',
    ],
    keys: '← Left   → Right',
    duration: 45,
    par: 6500,
    icon: G.icon('<rect x="12" y="26" width="34" height="48" rx="6" fill="#fff" opacity=".9"/><rect x="54" y="26" width="34" height="48" rx="6" fill="#fff" opacity=".9"/>' + [[22, 40], [34, 52], [24, 62]].map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="4" fill="' + C + '"/>').join('') + [[62, 36], [76, 42], [66, 56], [80, 62], [70, 66]].map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="4" fill="' + C + '"/>').join(''), C),
    start(ctx) {
      const lvl = ctx.level;
      const flash = Math.max(300, 1300 - lvl * 50);
      const ratio = 1 + Math.max(0.1, 0.6 - lvl * 0.03);
      const boxes = el('div', { class: 'mol-boxes' });
      const L = el('div', { class: 'mol-box' }), R = el('div', { class: 'mol-box' });
      boxes.append(L, R);
      const bar = G.choiceBar([
        { label: '← Left', keys: ['ArrowLeft', 'a'], value: 'L' },
        { label: 'Right →', keys: ['ArrowRight', 'd'], value: 'R' },
      ], answer);
      ctx.stage.append(boxes, bar.el);
      let more, accepting = false, shownAt = 0;

      function fill(box, n, big) {
        box.innerHTML = '';
        const placed = [];
        for (let i = 0; i < n; i++) {
          let x, y, s, tries = 0;
          do {
            s = big ? U.randInt(5, 9) : U.randInt(7, 13); // size cue counterbalanced
            x = U.randInt(8, 92); y = U.randInt(8, 92); tries++;
          } while (tries < 40 && placed.some((p) => Math.hypot(p[0] - x, p[1] - y) < (p[2] + s) * 0.7));
          placed.push([x, y, s]);
          box.appendChild(el('i', { class: 'dot', style: { left: x + '%', top: y + '%', width: s + '%', height: s + '%' } }));
        }
      }
      function next() {
        const small = U.randInt(6, 14 + lvl);
        const large = Math.max(small + 1, Math.round(small * ratio));
        more = U.chance(0.5) ? 'L' : 'R';
        fill(L, more === 'L' ? large : small, more === 'L');
        fill(R, more === 'R' ? large : small, more === 'R');
        boxes.classList.remove('hide');
        accepting = true;
        shownAt = U.now();
        ctx.later(() => boxes.classList.add('hide'), flash);
      }
      function answer(v) {
        if (!accepting) return;
        accepting = false;
        bar.press(v);
        if (v === more) ctx.hit(100, { rt: U.now() - shownAt }); else ctx.miss();
        boxes.classList.add('hide');
        ctx.later(next, 350);
      }
      next();
      return { onKey: (e) => bar.onKey(e) };
    },
  });
})();
