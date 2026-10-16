/* Speed games */
(function () {
  'use strict';
  const NS = window.NS;
  const U = NS.util;
  const el = U.el;
  const G = NS.gk;
  const C = NS.categories.speed.color;

  /* ---------------- Symbol Match ---------------- */
  NS.registerGame({
    id: 'symbol-match',
    name: 'Symbol Match',
    category: 'speed',
    tagline: 'Does the new symbol match the one before it?',
    howTo: [
      'A symbol appears — remember it.',
      'It slides away and a new symbol appears.',
      'Answer <b>Yes</b> if the new symbol matches the previous one, <b>No</b> if it doesn’t.',
      'At higher levels you compare with the symbol <b>two</b> cards back.',
    ],
    keys: '← No   → Yes',
    duration: 45,
    par: 14000,
    icon: G.icon('<rect x="18" y="26" width="36" height="48" rx="6" fill="#fff" opacity=".55"/><rect x="40" y="22" width="40" height="54" rx="7" fill="#fff"/><circle cx="60" cy="49" r="13" fill="' + C + '"/>', C),
    start(ctx) {
      const lvl = ctx.level;
      const back = lvl >= 12 ? 2 : 1;
      const setSize = Math.min(G.SHAPE_NAMES.length, 3 + Math.ceil(lvl / 2));
      const shapes = U.sample(G.SHAPE_NAMES, setSize);
      const mono = lvl >= 6;
      const colors = {};
      shapes.forEach((s, i) => (colors[s] = mono ? 'var(--ink)' : G.PALETTE[i % G.PALETTE.length]));
      const seq = [];
      let shownAt = 0;
      let accepting = false;

      const banner = el('div', { class: 'banner' }, back === 1 ? 'Same as the previous symbol?' : 'Same as the symbol 2 cards back?');
      const slot = el('div', { class: 'card-slot' });
      const bar = G.choiceBar(G.YES_NO, answer);
      ctx.stage.append(banner, slot, bar.el);
      bar.enable(false);

      function pickNext() {
        if (seq.length < back) return U.pick(shapes);
        const target = seq[seq.length - back];
        if (U.chance(0.5)) return target;
        return U.pick(shapes.filter((s) => s !== target));
      }
      function show() {
        const s = pickNext();
        seq.push(s);
        const old = slot.querySelector('.sym-card:not(.out)');
        if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 260); }
        const card = el('div', { class: 'sym-card in', html: G.shapeSVG(s, colors[s], 120) });
        slot.appendChild(card);
        shownAt = U.now();
        if (seq.length > back) { accepting = true; bar.enable(true); }
        else ctx.later(show, 1000);
      }
      function answer(v, e) {
        if (!accepting) return;
        bar.press(v);
        const i = seq.length - 1;
        const isMatch = seq[i] === seq[i - back];
        const rt = U.now() - shownAt;
        if (v === isMatch) ctx.hit(100, { rt }); else ctx.miss();
        accepting = false;
        ctx.later(show, 120);
      }
      show();
      return { onKey: (e) => bar.onKey(e) };
    },
  });

  /* ---------------- Number Trail ---------------- */
  NS.registerGame({
    id: 'number-trail',
    name: 'Number Trail',
    category: 'speed',
    tagline: 'Connect the scattered circles in order as fast as you can.',
    howTo: [
      'Circles with numbers are scattered across the board.',
      'Tap them in order: <b>1, 2, 3…</b>',
      'At higher levels, alternate numbers and letters: <b>1, A, 2, B, 3, C…</b>',
      'Finish a board to get a fresh one and a bonus.',
    ],
    duration: 60,
    par: 9000,
    icon: G.icon('<path d="M26 70 L50 34 L74 64" stroke="#fff" stroke-width="5" fill="none" stroke-dasharray="4 6"/><circle cx="26" cy="70" r="12" fill="#fff"/><circle cx="50" cy="34" r="12" fill="#fff"/><circle cx="74" cy="64" r="12" fill="#fff"/><text x="26" y="75" font-size="14" font-weight="800" text-anchor="middle" fill="' + C + '">1</text><text x="50" y="39" font-size="14" font-weight="800" text-anchor="middle" fill="' + C + '">2</text><text x="74" y="69" font-size="14" font-weight="800" text-anchor="middle" fill="' + C + '">3</text>', C),
    start(ctx) {
      const lvl = ctx.level;
      const alternate = lvl >= 8;
      const count = Math.min(24, 7 + Math.ceil(lvl * 0.9));
      const board = el('div', { class: 'trail-board' });
      ctx.stage.append(board);
      let labels = [], nextIdx = 0, boardNo = 0, lastAt = 0;
      const svgNS = 'http://www.w3.org/2000/svg';
      let lines;

      function seqLabels(n) {
        const out = [];
        if (!alternate) { for (let i = 1; i <= n; i++) out.push(String(i)); return out; }
        for (let i = 0; out.length < n; i++) {
          out.push(String(i + 1));
          if (out.length < n) out.push(String.fromCharCode(65 + i));
        }
        return out;
      }
      function newBoard() {
        boardNo++;
        board.innerHTML = '';
        lines = document.createElementNS(svgNS, 'svg');
        lines.setAttribute('class', 'trail-lines');
        lines.setAttribute('viewBox', '0 0 100 100');
        lines.setAttribute('preserveAspectRatio', 'none');
        board.appendChild(lines);
        labels = seqLabels(count);
        nextIdx = 0;
        const cols = Math.ceil(Math.sqrt(count * 1.4));
        const rows = Math.ceil((count * 1.4) / cols);
        const cells = U.sample([...Array(cols * rows).keys()], count);
        labels.forEach((lab, i) => {
          const c = cells[i];
          const cx = ((c % cols) + 0.5 + (Math.random() - 0.5) * 0.45) / cols * 100;
          const cy = (Math.floor(c / cols) + 0.5 + (Math.random() - 0.5) * 0.45) / rows * 100;
          const b = el('button', { class: 'trail-dot', style: { left: cx + '%', top: cy + '%' } }, lab);
          b.dataset.i = i;
          b._x = cx; b._y = cy;
          b.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(b, e); });
          board.appendChild(b);
        });
        lastAt = U.now();
        ctx.setProgress('Board ' + boardNo + ' · next: ' + labels[0]);
      }
      function tap(b, e) {
        const i = +b.dataset.i;
        if (i < nextIdx) return;
        if (i === nextIdx) {
          const rt = U.now() - lastAt;
          lastAt = U.now();
          b.classList.add('done');
          if (i > 0) {
            const prev = board.querySelector('.trail-dot[data-i="' + (i - 1) + '"]');
            const ln = document.createElementNS(svgNS, 'line');
            ln.setAttribute('x1', prev._x); ln.setAttribute('y1', prev._y);
            ln.setAttribute('x2', b._x); ln.setAttribute('y2', b._y);
            lines.appendChild(ln);
          }
          ctx.hit(30, { rt, quiet: true });
          nextIdx++;
          if (nextIdx >= labels.length) {
            ctx.addScore(300 + count * 10);
            ctx.floatText('Board clear! +' + (300 + count * 10), true);
            ctx.later(newBoard, 400);
          } else ctx.setProgress('Board ' + boardNo + ' · next: ' + labels[nextIdx]);
        } else {
          b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong');
          ctx.miss({ quiet: true });
          ctx.floatText('Next is ' + labels[nextIdx], false);
        }
      }
      newBoard();
      return {};
    },
  });

  /* ---------------- Go Signal ---------------- */
  NS.registerGame({
    id: 'go-signal',
    name: 'Go Signal',
    category: 'speed',
    tagline: 'React instantly to the go signal — but hold back on the stop signal.',
    howTo: [
      'Wait for a signal to appear in the center.',
      'If it’s a <b style="color:#22c55e">green circle</b>, tap as fast as you can.',
      'If it’s <b style="color:#ef4444">red</b> — or at higher levels any other shape — don’t tap!',
      'Tapping too early costs you points.',
    ],
    keys: 'Space = tap',
    duration: 45,
    par: 5500,
    icon: G.icon('<circle cx="50" cy="50" r="30" fill="#fff"/><circle cx="50" cy="50" r="20" fill="#22c55e"/>', C),
    start(ctx) {
      const lvl = ctx.level;
      const window_ = Math.max(380, 900 - lvl * 25);
      const nogoP = Math.min(0.45, 0.25 + lvl * 0.01);
      const lures = lvl >= 6;
      const pad = el('div', { class: 'go-pad' }, el('div', { class: 'go-msg' }, 'Wait…'));
      ctx.stage.append(pad);
      let state = 'wait'; // wait | go | nogo
      let shownAt = 0, timer = null;

      function schedule() {
        state = 'wait';
        pad.innerHTML = '';
        pad.appendChild(el('div', { class: 'go-msg' }, 'Wait…'));
        timer = ctx.later(show, U.randInt(700, 1900));
      }
      function show() {
        const go = !U.chance(nogoP);
        let html;
        if (go) html = G.shapeSVG('circle', '#22c55e', 170);
        else if (lures && U.chance(0.5)) html = G.shapeSVG(U.pick(['square', 'diamond', 'hexagon']), '#22c55e', 170);
        else html = G.shapeSVG(U.pick(lures ? ['circle', 'square', 'star'] : ['circle']), '#ef4444', 170);
        pad.innerHTML = '';
        pad.appendChild(el('div', { class: 'go-sig', html }));
        state = go ? 'go' : 'nogo';
        shownAt = U.now();
        timer = ctx.later(() => {
          if (state === 'go') ctx.miss({ text: 'Too slow' });
          else if (state === 'nogo') ctx.hit(60, { quiet: true });
          schedule();
        }, window_);
      }
      function tap(e) {
        if (state === 'busy') return;
        if (state === 'wait') { ctx.cancel(timer); ctx.miss({ text: 'Too soon!' }); ctx.addScore(-50); schedule(); return; }
        ctx.cancel(timer);
        if (state === 'go') {
          const rt = U.now() - shownAt;
          ctx.hit(Math.max(40, Math.round(260 - rt / 2.5)), { rt, x: e && e.clientX, y: e && e.clientY });
          ctx.floatText(Math.round(rt) + ' ms', true);
        } else ctx.miss({ text: 'Don’t tap!' });
        state = 'busy';
        ctx.later(schedule, 250);
      }
      pad.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(e); });
      schedule();
      return {
        onKey(e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) tap(null); } },
      };
    },
  });
})();
