/* Flexibility games */
(function () {
  'use strict';
  const NS = window.NS;
  const U = NS.util;
  const el = U.el;
  const G = NS.gk;
  const C = NS.categories.flexibility.color;
  const POINT = '#3b82f6';
  const MOVE = '#f97316';

  /* ---------------- Drift ---------------- */
  NS.registerGame({
    id: 'drift',
    name: 'Drift',
    category: 'flexibility',
    tagline: 'Point or motion? The color tells you which rule to follow.',
    howTo: [
      'Arrows drift across the screen.',
      'If they’re <b style="color:' + POINT + '">blue</b>, answer the direction they <b>point</b>.',
      'If they’re <b style="color:' + MOVE + '">orange</b>, answer the direction they <b>move</b>.',
      'Use the buttons, swipe, or the arrow keys.',
    ],
    keys: 'Arrow keys',
    duration: 45,
    par: 9500,
    icon: G.icon('<g transform="translate(36 50) rotate(270)"><path d="M-14 -6 H2 V-14 L16 0 L2 14 V6 H-14 Z" fill="#fff"/></g><path d="M58 50 H82 M74 42 L82 50 L74 58" stroke="#fdba74" stroke-width="5" fill="none" stroke-linecap="round"/>', C),
    start(ctx) {
      const lvl = ctx.level;
      const dirs = ['left', 'up', 'down', 'right'];
      const field = el('div', { class: 'drift-field' });
      const legend = el('div', { class: 'banner small' }, [
        el('span', { html: '<b style="color:' + POINT + '">Blue</b> → where it points' }),
        el('span', { html: '<b style="color:' + MOVE + '">Orange</b> → where it moves' }),
      ]);
      const pad = G.dirPad(dirs, (d, e) => answer(d, e));
      ctx.stage.append(legend, field, pad.el);
      G.swipe(field, (d, e) => answer(d, e));
      let want, shownAt = 0, timeout = null;
      const vec = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

      function next() {
        const move = U.pick(dirs);
        const point = U.chance(0.75) ? U.pick(dirs.filter((d) => d !== move)) : move;
        const rule = U.chance(0.5) ? 'point' : 'move';
        want = rule === 'point' ? point : move;
        const color = rule === 'point' ? POINT : MOVE;
        const count = lvl < 5 ? 1 : lvl < 10 ? 3 : 5;
        const dur = Math.max(1.6, 4 - lvl * 0.12);
        field.innerHTML = '';
        const flock = el('div', { class: 'drift-flock', style: { '--dx': vec[move][0] * 30 + 'vmin', '--dy': vec[move][1] * 22 + 'vmin', animationDuration: dur + 's' } });
        const offsets = count === 1 ? [[0, 0]] : count === 3 ? [[0, 0], [-1, 1], [1, 1]] : [[0, 0], [-1, 1], [1, 1], [-1, -1], [1, -1]];
        offsets.forEach(([x, y]) => {
          flock.appendChild(el('div', { class: 'drift-arrow', html: G.ARROW_SVG, style: { color, left: 'calc(50% + ' + x * 2.2 + 'em)', top: 'calc(50% + ' + y * 1.6 + 'em)', transform: 'translate(-50%,-50%) rotate(' + G.DIR_ANGLE[point] + 'deg)' } }));
        });
        field.appendChild(flock);
        shownAt = U.now();
        timeout = ctx.later(() => { ctx.miss({ text: 'Too slow' }); field.innerHTML = ''; ctx.later(next, 160); }, dur * 1000);
      }
      function answer(d, e) {
        if (!field.firstChild) return;
        ctx.cancel(timeout);
        pad.press(d);
        if (d === want) ctx.hit(100, { rt: U.now() - shownAt }); else ctx.miss();
        field.innerHTML = '';
        ctx.later(next, 160);
      }
      next();
      return { onKey: (e) => pad.onKey(e) };
    },
  });

  /* ---------------- Rule Shift (task switching) ---------------- */
  NS.registerGame({
    id: 'rule-shift',
    name: 'Rule Shift',
    category: 'flexibility',
    tagline: 'The card’s position decides the question. Switch rules on the fly.',
    howTo: [
      'A card with a letter and a number appears in the top or bottom box.',
      '<b>Top box:</b> is the <b>number even</b>?',
      '<b>Bottom box:</b> is the <b>letter a vowel</b>?',
      'Answer Yes or No. The higher the level, the more often it switches.',
    ],
    keys: '← No   → Yes',
    duration: 45,
    par: 8500,
    icon: G.icon('<rect x="20" y="16" width="60" height="30" rx="6" fill="#fff" opacity=".45"/><rect x="20" y="54" width="60" height="30" rx="6" fill="#fff"/><text x="50" y="76" text-anchor="middle" font-size="20" font-weight="900" fill="' + C + '">A7</text>', C),
    start(ctx) {
      const lvl = ctx.level;
      const switchP = Math.min(0.75, 0.3 + lvl * 0.03);
      const VOW = 'AEIOU', CON = 'BCDFGHJKLMNPRSTVWZ';
      const top = el('div', { class: 'rs-box' }, el('div', { class: 'rs-label' }, 'Is the NUMBER even?'));
      const bot = el('div', { class: 'rs-box' }, el('div', { class: 'rs-label' }, 'Is the LETTER a vowel?'));
      const bar = G.choiceBar(G.YES_NO, answer);
      ctx.stage.append(el('div', { class: 'rs-wrap' }, [top, bot]), bar.el);
      if (lvl >= 10) ctx.stage.classList.add('rs-faint');
      let where = U.pick(['top', 'bot']), letter, num, shownAt = 0;

      function next() {
        if (U.chance(switchP)) where = where === 'top' ? 'bot' : 'top';
        letter = U.chance(0.5) ? U.pick(VOW) : U.pick(CON);
        num = U.randInt(1, 9);
        U.$$('.rs-card', ctx.stage).forEach((c) => c.remove());
        const card = el('div', { class: 'rs-card' }, letter + num);
        (where === 'top' ? top : bot).appendChild(card);
        shownAt = U.now();
      }
      function answer(v) {
        bar.press(v);
        const truth = where === 'top' ? num % 2 === 0 : VOW.includes(letter);
        if (v === truth) ctx.hit(100, { rt: U.now() - shownAt }); else ctx.miss();
        next();
      }
      next();
      return { onKey: (e) => bar.onKey(e) };
    },
  });

  /* ---------------- Sort Rule (card sorting) ---------------- */
  NS.registerGame({
    id: 'sort-rule',
    name: 'Sort Rule',
    category: 'flexibility',
    tagline: 'Figure out the hidden sorting rule — then notice when it changes.',
    howTo: [
      'Match each new card to one of the four piles.',
      'The rule might be <b>color</b>, <b>shape</b>, or <b>count</b> — nobody tells you which.',
      'Use the ✓ / ✗ feedback to work it out.',
      'Once you’ve got it, the rule secretly changes. Adapt!',
    ],
    keys: 'Keys 1–4',
    duration: 60,
    par: 6500,
    icon: G.icon('<rect x="14" y="18" width="20" height="28" rx="4" fill="#fff"/><rect x="40" y="18" width="20" height="28" rx="4" fill="#fff" opacity=".7"/><rect x="66" y="18" width="20" height="28" rx="4" fill="#fff" opacity=".5"/><rect x="38" y="56" width="24" height="32" rx="4" fill="#fff"/><text x="50" y="79" text-anchor="middle" font-size="18" font-weight="900" fill="' + C + '">?</text>', C),
    start(ctx) {
      const lvl = ctx.level;
      const need = Math.max(3, 6 - Math.floor(lvl / 4));
      const shapes = ['triangle', 'star', 'cross', 'circle'];
      const colors = ['#ef4444', '#22c55e', '#eab308', '#3b82f6'];
      const refs = [0, 1, 2, 3].map((i) => ({ shape: i, color: i, count: i }));
      const rules = ['color', 'shape', 'count'];
      let rule = U.pick(rules), streak = 0, card;
      const piles = el('div', { class: 'sr-piles' });
      const pileEls = refs.map((r, i) => {
        const p = el('button', { class: 'sr-card ref' }, [cardFace(r), el('small', {}, String(i + 1))]);
        p.addEventListener('pointerdown', (e) => { e.preventDefault(); choose(i, e); });
        piles.appendChild(p);
        return p;
      });
      const cur = el('div', { class: 'sr-current' });
      const fb = el('div', { class: 'sr-feedback' });
      ctx.stage.append(piles, fb, cur);

      function cardFace(c) {
        const f = el('div', { class: 'sr-face' });
        for (let k = 0; k <= c.count; k++) f.appendChild(el('span', { html: G.shapeSVG(shapes[c.shape], colors[c.color], 30) }));
        return f;
      }
      function next() {
        do {
          card = { shape: U.rand(4), color: U.rand(4), count: U.rand(4) };
        } while (card.shape === card.color && card.color === card.count); // avoid identical-to-a-pile cards
        cur.innerHTML = '';
        const c = el('div', { class: 'sr-card big' }, cardFace(card));
        cur.appendChild(c);
      }
      function choose(i, e) {
        const ok = card[rule] === refs[i][rule];
        pileEls[i].classList.remove('ok', 'bad'); void pileEls[i].offsetWidth;
        pileEls[i].classList.add(ok ? 'ok' : 'bad');
        fb.textContent = ok ? '✓ Correct' : '✗ Wrong';
        fb.className = 'sr-feedback ' + (ok ? 'good' : 'bad');
        if (ok) {
          ctx.hit(100, { quiet: true });
          streak++;
          if (streak >= need + U.rand(2)) {
            rule = U.pick(rules.filter((r) => r !== rule));
            streak = 0;
          }
        } else { ctx.miss({ quiet: true }); streak = 0; }
        next();
      }
      next();
      return {
        onKey(e) { const k = parseInt(e.key, 10); if (k >= 1 && k <= 4 && !e.repeat) { e.preventDefault(); choose(k - 1); } },
      };
    },
  });
})();
