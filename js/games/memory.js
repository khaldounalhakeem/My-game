/* Memory games */
(function () {
  'use strict';
  const NS = window.NS;
  const U = NS.util;
  const el = U.el;
  const G = NS.gk;
  const C = NS.categories.memory.color;

  /* ---------------- Grid Recall ---------------- */
  NS.registerGame({
    id: 'grid-recall',
    name: 'Grid Recall',
    category: 'memory',
    tagline: 'Remember which tiles lit up, then tap them all.',
    howTo: [
      'Some tiles light up for a moment.',
      'When they go dark, tap every tile that was lit.',
      'Get them all and the next pattern gets bigger. Miss one and it gets smaller.',
      'At higher levels the board rotates before you answer!',
    ],
    par: 9000,
    maxLevel: 20,
    icon: G.icon(
      [0, 1, 2].map((r) => [0, 1, 2].map((c) => '<rect x="' + (18 + c * 22) + '" y="' + (18 + r * 22) + '" width="18" height="18" rx="4" fill="#fff" opacity="' + ((r * 3 + c) % 4 === 0 ? 1 : 0.35) + '"/>').join('')).join(''),
      C
    ),
    start(ctx) {
      const lvl = ctx.level;
      let tiles = Math.min(12, 3 + Math.floor((lvl - 1) / 2));
      const rounds = 12;
      const rotate = lvl >= 10;
      let round = 0, targets, found, accepting = false, cells = [];
      const board = el('div', { class: 'grid-board' });
      const wrap = el('div', { class: 'grid-wrap' }, board);
      ctx.stage.append(wrap);
      const sizeFor = (t) => (t <= 3 ? 3 : t <= 5 ? 4 : t <= 8 ? 5 : 6);

      function play() {
        round++;
        if (round > rounds) { ctx.finish(); return; }
        ctx.setProgress('Round ' + round + '/' + rounds + ' · ' + tiles + ' tiles');
        const n = sizeFor(tiles);
        board.style.setProperty('--n', n);
        board.style.transition = 'none';
        board.style.transform = 'rotate(0deg)';
        board.innerHTML = '';
        cells = [];
        for (let i = 0; i < n * n; i++) {
          const c = el('button', { class: 'gcell' });
          c.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(i, e); });
          cells.push(c);
          board.appendChild(c);
        }
        targets = new Set(U.sample([...Array(n * n).keys()], tiles));
        found = 0;
        accepting = false;
        ctx.later(() => {
          targets.forEach((i) => cells[i].classList.add('lit'));
          ctx.later(() => {
            targets.forEach((i) => cells[i].classList.remove('lit'));
            if (rotate) {
              ctx.later(() => {
                board.style.transition = 'transform .6s ease';
                board.style.transform = 'rotate(' + U.pick([90, -90, 180]) + 'deg)';
                ctx.later(() => (accepting = true), 650);
              }, 150);
            } else accepting = true;
          }, 900 + tiles * 130);
        }, 500);
      }
      function tap(i, e) {
        if (!accepting) return;
        const c = cells[i];
        if (c.classList.contains('ok')) return;
        if (targets.has(i)) {
          c.classList.add('ok');
          found++;
          ctx.hit(40, { quiet: true });
          if (found === tiles) {
            accepting = false;
            const bonus = tiles * 60;
            ctx.addScore(bonus);
            ctx.floatText('Perfect! +' + bonus, true);
            tiles = Math.min(16, tiles + 1);
            ctx.later(play, 800);
          }
        } else {
          accepting = false;
          c.classList.add('bad');
          ctx.miss(G.pt(e));
          targets.forEach((t) => { if (!cells[t].classList.contains('ok')) cells[t].classList.add('missed'); });
          tiles = Math.max(2, tiles - 1);
          ctx.later(play, 1400);
        }
      }
      play();
      return {};
    },
  });

  /* ---------------- Echo Sequence ---------------- */
  NS.registerGame({
    id: 'echo-sequence',
    name: 'Echo Sequence',
    category: 'memory',
    tagline: 'Watch the pads light up, then repeat the sequence.',
    howTo: [
      'Pads light up one after another, each with its own tone.',
      'When it’s your turn, tap the pads in the same order.',
      'Each success adds one more step. You have <b>3 lives</b>.',
      'At high levels some rounds must be repeated in <b>reverse</b>.',
    ],
    par: 6000,
    icon: G.icon('<rect x="18" y="18" width="30" height="30" rx="8" fill="#fff"/><rect x="52" y="18" width="30" height="30" rx="8" fill="#fff" opacity=".4"/><rect x="18" y="52" width="30" height="30" rx="8" fill="#fff" opacity=".4"/><rect x="52" y="52" width="30" height="30" rx="8" fill="#fff" opacity=".75"/>', C),
    start(ctx) {
      const lvl = ctx.level;
      const padCount = lvl < 4 ? 4 : lvl < 8 ? 6 : 9;
      const cols = padCount === 4 ? 2 : 3;
      let len = 3 + Math.floor(lvl / 4);
      let lives = 3, round = 0, seq = [], pos = 0, accepting = false, reverse = false;
      const maxRounds = 12;
      const speed = Math.max(300, 560 - lvl * 14);
      const banner = el('div', { class: 'banner' }, 'Watch…');
      const board = el('div', { class: 'echo-board', style: { '--cols': cols } });
      const pads = [];
      for (let i = 0; i < padCount; i++) {
        const p = el('button', { class: 'echo-pad', style: { '--pc': G.PALETTE[i % G.PALETTE.length] } });
        p.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(i, e); });
        pads.push(p);
        board.appendChild(p);
      }
      ctx.stage.append(banner, board);

      function flash(i, ms) {
        pads[i].classList.add('on');
        NS.sound.note(i);
        ctx.later(() => pads[i].classList.remove('on'), ms);
      }
      function progress() { ctx.setProgress('Round ' + Math.min(round, maxRounds) + '/' + maxRounds + ' · ' + '❤'.repeat(lives) + '♡'.repeat(3 - lives)); }
      function next(newSeq) {
        round++;
        if (round > maxRounds || lives <= 0) { ctx.finish(); return; }
        progress();
        if (newSeq) {
          seq = [];
          for (let i = 0; i < len; i++) {
            let p;
            do { p = U.rand(padCount); } while (lvl < 6 && p === seq[i - 1]);
            seq.push(p);
          }
        }
        reverse = lvl >= 12 && round % 2 === 0;
        accepting = false;
        pos = 0;
        banner.textContent = 'Watch…';
        board.classList.add('watching');
        seq.forEach((p, k) => ctx.later(() => flash(p, speed), 600 + k * (speed + 160)));
        ctx.later(() => {
          board.classList.remove('watching');
          banner.innerHTML = reverse ? 'Your turn — <b>in reverse!</b>' : 'Your turn';
          accepting = true;
        }, 600 + seq.length * (speed + 160));
      }
      function tap(i, e) {
        if (!accepting) return;
        const expected = reverse ? seq[seq.length - 1 - pos] : seq[pos];
        flash(i, 180);
        if (i === expected) {
          pos++;
          ctx.hit(25, { quiet: true });
          if (pos === seq.length) {
            accepting = false;
            ctx.addScore(len * 40);
            ctx.floatText('+' + len * 40 + ' sequence!', true);
            len++;
            ctx.later(() => next(true), 700);
          }
        } else {
          accepting = false;
          lives--;
          ctx.miss(G.pt(e));
          pads[expected].classList.add('hint');
          ctx.later(() => pads[expected].classList.remove('hint'), 700);
          len = Math.max(3, len - 1);
          ctx.later(() => next(true), 1100);
        }
      }
      next(true);
      return {};
    },
  });

  /* ---------------- Memory Pairs ---------------- */
  NS.registerGame({
    id: 'memory-pairs',
    name: 'Memory Pairs',
    category: 'memory',
    tagline: 'Flip cards two at a time and find all the matching pairs.',
    howTo: [
      'Tap a card to flip it, then tap another.',
      'If they match, they stay face up. If not, they flip back.',
      'Remember where you saw each symbol — re-flipping cards you’ve already seen wrongly costs accuracy.',
      'Clear boards quickly for a time bonus.',
    ],
    duration: 75,
    par: 3500,
    icon: G.icon('<rect x="16" y="22" width="30" height="42" rx="6" fill="#fff"/><rect x="54" y="36" width="30" height="42" rx="6" fill="#fff" opacity=".5"/><path d="M31 33 l4 8 h9 l-7 5 l3 9 l-9 -6 l-9 6 l3 -9 l-7 -5 h9 z" fill="' + C + '"/>', C),
    start(ctx) {
      const lvl = ctx.level;
      let pairs = Math.min(12, 3 + Math.ceil(lvl / 2));
      const board = el('div', { class: 'pairs-board' });
      ctx.stage.append(board);
      let first = null, busy = false, cards = [], matched = 0, boardNo = 0, boardStart = 0;

      function newBoard() {
        boardNo++;
        board.innerHTML = '';
        matched = 0; first = null; busy = false;
        const total = pairs * 2;
        const cols = total <= 8 ? 4 : total <= 12 ? 4 : total <= 20 ? 5 : 6;
        board.style.setProperty('--cols', cols);
        const symbols = [];
        const names = U.shuffle(G.SHAPE_NAMES);
        for (let i = 0; i < pairs; i++) symbols.push({ shape: names[i % names.length], color: G.PALETTE[(i + Math.floor(i / names.length) * 3) % G.PALETTE.length] });
        const deck = U.shuffle(symbols.flatMap((s, i) => [{ ...s, id: i }, { ...s, id: i }]));
        cards = deck.map((d, idx) => {
          const card = el('button', { class: 'pcard' }, [
            el('div', { class: 'pcard-inner' }, [
              el('div', { class: 'pcard-back' }),
              el('div', { class: 'pcard-front', html: G.shapeSVG(d.shape, d.color, 56) }),
            ]),
          ]);
          const obj = { el: card, id: d.id, seen: false, done: false, idx };
          card.addEventListener('pointerdown', (e) => { e.preventDefault(); flip(obj, e); });
          board.appendChild(card);
          return obj;
        });
        boardStart = ctx.elapsed();
        ctx.setProgress('Board ' + boardNo + ' · ' + pairs + ' pairs');
      }
      function flip(c, e) {
        if (busy || c.done || c === first) return;
        c.el.classList.add('up');
        NS.sound.pop();
        if (!first) { first = c; return; }
        const a = first, b = c;
        first = null;
        if (a.id === b.id) {
          a.done = b.done = true;
          a.el.classList.add('matched'); b.el.classList.add('matched');
          ctx.hit(100, G.pt(e));
          matched++;
          if (matched === pairs) {
            const secs = (ctx.elapsed() - boardStart) / 1000;
            const bonus = Math.max(50, Math.round(pairs * 120 - secs * 15));
            ctx.addScore(bonus);
            ctx.floatText('Board clear! +' + bonus, true);
            pairs = Math.min(12, pairs + 1);
            ctx.later(newBoard, 800);
          }
        } else {
          const partnerSeen = cards.some((x) => x !== a && x.id === a.id && x.seen);
          if (partnerSeen || b.seen) ctx.miss(G.pt(e));
          busy = true;
          ctx.later(() => {
            a.el.classList.remove('up'); b.el.classList.remove('up');
            busy = false;
          }, 750);
        }
        a.seen = b.seen = true;
      }
      newBoard();
      return {};
    },
  });

  /* ---------------- Back Track (n-back) ---------------- */
  NS.registerGame({
    id: 'back-track',
    name: 'Back Track',
    category: 'memory',
    tagline: 'Spot when a square lands where it was N steps ago.',
    howTo: [
      'A square lights up in a 3×3 grid, one position at a time.',
      'Press <b>Match</b> when its position is the same as <b>N steps back</b> (shown on screen).',
      'Don’t press when it isn’t a match.',
      'Level 1–3 use 1-back, then 2-back, then 3-back.',
    ],
    keys: 'Space = Match',
    par: 3800,
    icon: G.icon(
      [0, 1, 2].map((r) => [0, 1, 2].map((c) => '<rect x="' + (18 + c * 22) + '" y="' + (18 + r * 22) + '" width="18" height="18" rx="3" fill="none" stroke="#fff" stroke-width="3" opacity=".7"/>').join('')).join('') +
        '<rect x="40" y="18" width="18" height="18" rx="3" fill="#fff"/><text x="70" y="88" fill="#fff" font-size="16" font-weight="800">N</text>',
      C
    ),
    start(ctx) {
      const lvl = ctx.level;
      const n = lvl <= 3 ? 1 : lvl <= 9 ? 2 : 3;
      const trials = 20 + n;
      const interval = Math.max(1500, 2600 - lvl * 50);
      const banner = el('div', { class: 'banner' }, el('span', { html: 'Match <b>' + n + '</b> step' + (n > 1 ? 's' : '') + ' back' }));
      const grid = el('div', { class: 'nback-grid' });
      const cells = [];
      for (let i = 0; i < 9; i++) { const c = el('div', { class: 'ncell' }); cells.push(c); grid.appendChild(c); }
      const bar = G.choiceBar([{ label: 'Match', hint: 'space', keys: [' ', 'Enter', 'm', 'M'], value: true, cls: 'yes wide' }], () => press());
      ctx.stage.append(banner, grid, bar.el);
      const seq = [];
      let t = -1, responded = false;

      function nextPos() {
        if (seq.length >= n && U.chance(0.33)) return seq[seq.length - n];
        let p;
        do { p = U.rand(9); } while (seq.length >= n && p === seq[seq.length - n]);
        return p;
      }
      function step() {
        // evaluate previous trial
        if (t >= n && !responded) {
          if (seq[t] === seq[t - n]) ctx.miss({ text: 'Missed match' });
          else ctx.hit(20, { quiet: true, noMult: true });
        }
        t++;
        if (t >= trials) { ctx.finish(); return; }
        responded = false;
        const p = nextPos();
        seq.push(p);
        ctx.setProgress('Trial ' + (t + 1) + '/' + trials);
        cells[p].classList.add('on');
        ctx.later(() => cells[p].classList.remove('on'), 550);
        bar.enable(t >= n);
        ctx.later(step, interval);
      }
      function press() {
        if (t < n || responded) return;
        responded = true;
        bar.press(true);
        if (seq[t] === seq[t - n]) ctx.hit(100);
        else ctx.miss({ text: 'Not a match' });
      }
      ctx.later(step, 600);
      return { onKey: (e) => bar.onKey(e) };
    },
  });
})();
