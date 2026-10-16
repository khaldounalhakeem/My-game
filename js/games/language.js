/* Language games */
(function () {
  'use strict';
  const NS = window.NS;
  const U = NS.util;
  const el = U.el;
  const G = NS.gk;
  const C = NS.categories.language.color;

  /* lazy word sets */
  let W = null;
  function words() {
    if (W) return W;
    const src = window.WORDS || { common: '', dict: '', rare: '' };
    const common = src.common.split(' ').filter(Boolean);
    const dict = src.dict.split(' ').filter(Boolean);
    const rare = src.rare.split(' ').filter(Boolean);
    W = {
      common,
      dict,
      dictSet: new Set(dict),
      anySet: new Set(dict.concat(rare, common)),
      byLen: {},
    };
    common.forEach((w) => (W.byLen[w.length] = W.byLen[w.length] || []).push(w));
    return W;
  }
  NS.words = words;

  function letterCounts(s) {
    const m = {};
    for (const ch of s) m[ch] = (m[ch] || 0) + 1;
    return m;
  }
  function canMake(word, counts) {
    const m = {};
    for (const ch of word) { m[ch] = (m[ch] || 0) + 1; if (!counts[ch] || m[ch] > counts[ch]) return false; }
    return true;
  }

  /* Letter-tile input: tap tiles or type to build a word */
  function tileInput(letters, opts) {
    const wrap = el('div', { class: 'tiles-wrap' });
    const display = el('div', { class: 'word-display' });
    const tilesEl = el('div', { class: 'tiles' });
    const actions = el('div', { class: 'tile-actions' });
    let chosen = [];
    let tiles = [];
    function build() {
      tilesEl.innerHTML = '';
      tiles = letters.map((ch, i) => {
        const t = el('button', { class: 'tile' }, ch.toUpperCase());
        t.addEventListener('pointerdown', (e) => { e.preventDefault(); add(i); });
        tilesEl.appendChild(t);
        return t;
      });
      refresh();
    }
    function refresh() {
      display.innerHTML = '';
      chosen.forEach((i) => display.appendChild(el('span', { class: 'dl' }, letters[i].toUpperCase())));
      if (!chosen.length) display.appendChild(el('span', { class: 'placeholder' }, opts.placeholder || 'Tap letters'));
      tiles.forEach((t, i) => t.classList.toggle('used', chosen.includes(i)));
    }
    function add(i) {
      if (chosen.includes(i)) return;
      chosen.push(i);
      NS.sound.pop();
      refresh();
      if (opts.onChange) opts.onChange(word());
    }
    function back() { chosen.pop(); refresh(); }
    function clear() { chosen = []; refresh(); }
    function word() { return chosen.map((i) => letters[i]).join(''); }
    function shuffle() { chosen = []; letters = U.shuffle(letters); build(); }
    const delBtn = el('button', { class: 'btn small', onpointerdown: (e) => { e.preventDefault(); back(); } }, '⌫');
    const shufBtn = el('button', { class: 'btn small', onpointerdown: (e) => { e.preventDefault(); shuffle(); } }, '⟳ Shuffle');
    actions.append(delBtn, shufBtn);
    if (opts.extra) opts.extra.forEach((b) => actions.appendChild(b));
    if (opts.onSubmit) actions.appendChild(el('button', { class: 'btn small primary', onpointerdown: (e) => { e.preventDefault(); opts.onSubmit(word()); } }, 'Enter ⏎'));
    wrap.append(display, tilesEl, actions);
    build();
    return {
      el: wrap,
      word, clear, back, shuffle,
      setLetters(l) { letters = l; chosen = []; build(); },
      shake() { display.classList.remove('shake'); void display.offsetWidth; display.classList.add('shake'); },
      onKey(e) {
        if (e.key === 'Backspace') { e.preventDefault(); back(); return; }
        if (e.key === 'Enter' && opts.onSubmit) { e.preventDefault(); opts.onSubmit(word()); return; }
        if (e.key === ' ') { e.preventDefault(); shuffle(); return; }
        if (/^[a-zA-Z]$/.test(e.key)) {
          const ch = e.key.toLowerCase();
          const i = letters.findIndex((l, k) => l === ch && !chosen.includes(k));
          if (i >= 0) add(i);
        }
      },
    };
  }

  /* ---------------- Word Hunt ---------------- */
  NS.registerGame({
    id: 'word-hunt',
    name: 'Word Hunt',
    category: 'language',
    tagline: 'Make as many words as you can from a handful of letters.',
    howTo: [
      'You get a set of letters.',
      'Tap (or type) letters to build words of <b>3+ letters</b>, then press Enter.',
      'Longer words are worth much more. Each letter can be used once per word.',
      'Stuck? Shuffle the letters for a fresh look.',
    ],
    keys: 'Type letters · Enter · Backspace · Space = shuffle',
    duration: 90,
    par: 5000,
    icon: G.icon('<rect x="14" y="36" width="20" height="24" rx="4" fill="#fff"/><rect x="40" y="36" width="20" height="24" rx="4" fill="#fff"/><rect x="66" y="36" width="20" height="24" rx="4" fill="#fff"/><text x="24" y="54" text-anchor="middle" font-size="15" font-weight="900" fill="' + C + '">W</text><text x="50" y="54" text-anchor="middle" font-size="15" font-weight="900" fill="' + C + '">O</text><text x="76" y="54" text-anchor="middle" font-size="15" font-weight="900" fill="' + C + '">R</text>', C),
    start(ctx) {
      const w = words();
      const lvl = ctx.level;
      const len = lvl < 6 ? 6 : 7;
      let seed, possible = [];
      for (let tries = 0; tries < 60; tries++) {
        seed = U.pick(w.byLen[len] || w.common);
        const counts = letterCounts(seed);
        possible = w.dict.filter((x) => x.length >= 3 && x.length <= seed.length && canMake(x, counts));
        if (possible.length >= 12) break;
      }
      const possibleSet = new Set(possible);
      const counts = letterCounts(seed);
      const found = new Set();
      const PTS = { 3: 100, 4: 200, 5: 400, 6: 700, 7: 1100, 8: 1500 };
      const foundList = el('div', { class: 'found-list' });
      const input = tileInput(U.shuffle(seed.split('')), { onSubmit: submit, placeholder: 'Tap letters to make a word' });
      ctx.stage.append(foundList, input.el);
      progress();

      function progress() { ctx.setProgress(found.size + ' / ' + possible.length + ' words'); }
      function submit(word) {
        if (!word) return;
        if (word.length < 3) { input.shake(); ctx.floatText('3+ letters', false); input.clear(); return; }
        if (found.has(word)) { input.shake(); ctx.floatText('Already found', false); input.clear(); return; }
        if ((possibleSet.has(word) || w.anySet.has(word)) && canMake(word, counts)) {
          found.add(word);
          const pts = PTS[word.length] || 1500;
          ctx.hit(pts, { noMult: true });
          if (word.length === seed.length) ctx.floatText('Full word!', true);
          const chip = el('span', { class: 'found-word new' }, word);
          foundList.prepend(chip);
          progress();
        } else {
          input.shake();
          ctx.miss({ text: 'Not a word' });
        }
        input.clear();
      }
      return {
        onKey: (e) => input.onKey(e),
        onTimeUp() {
          const missed = possible.filter((x) => !found.has(x)).sort((a, b) => b.length - a.length).slice(0, 8);
          if (missed.length) ctx.floatText('e.g. ' + missed.slice(0, 3).join(', '), true);
        },
      };
    },
  });

  /* ---------------- Real or Not (lexical decision) ---------------- */
  NS.registerGame({
    id: 'real-or-not',
    name: 'Real or Not',
    category: 'language',
    tagline: 'Is it a real English word or a convincing fake?',
    howTo: [
      'A string of letters appears.',
      'Decide quickly: is it a <b>real</b> English word?',
      'Fakes are made by changing a letter of a real word, so read carefully!',
      'Rarer words show up as you level up.',
    ],
    keys: '← Fake   → Real',
    duration: 45,
    par: 9000,
    icon: G.icon('<text x="50" y="50" text-anchor="middle" font-size="20" font-weight="900" fill="#fff">blime</text><text x="34" y="78" text-anchor="middle" font-size="22" font-weight="900" fill="#fff">✓</text><text x="66" y="78" text-anchor="middle" font-size="22" font-weight="900" fill="#fff" opacity=".6">✗</text>', C),
    start(ctx) {
      const w = words();
      const lvl = ctx.level;
      const VOW = 'aeiou', CON = 'bcdfghjklmnprstvwy';
      const pool = (lvl < 8 ? w.common : w.dict).filter((x) => x.length >= 4 && x.length <= Math.min(9, 5 + Math.floor(lvl / 3)));
      const wordEl = el('div', { class: 'lex-word' });
      const bar = G.choiceBar([
        { label: 'Fake', hint: '←', keys: ['ArrowLeft', 'f'], value: false, cls: 'no' },
        { label: 'Real', hint: '→', keys: ['ArrowRight', 'r'], value: true, cls: 'yes' },
      ], answer);
      ctx.stage.append(el('div', { class: 'banner' }, 'Is this a real word?'), wordEl, bar.el);
      let real, shownAt = 0, current;
      function fake() {
        for (let tries = 0; tries < 100; tries++) {
          const base = U.pick(pool).split('');
          const i = U.rand(base.length);
          const isV = VOW.includes(base[i]);
          base[i] = U.pick((isV ? VOW : CON).replace(base[i], '').split(''));
          if (lvl < 4 && tries < 50) { const j = U.rand(base.length); base[j] = U.pick((VOW.includes(base[j]) ? VOW : CON).split('')); }
          const s = base.join('');
          if (!w.anySet.has(s)) return s;
        }
        return 'blorf';
      }
      function next() {
        real = U.chance(0.5);
        current = real ? U.pick(pool) : fake();
        wordEl.textContent = current;
        wordEl.classList.remove('pop'); void wordEl.offsetWidth; wordEl.classList.add('pop');
        shownAt = U.now();
      }
      function answer(v) {
        bar.press(v);
        if (v === real) ctx.hit(100, { rt: U.now() - shownAt });
        else ctx.miss({ text: real ? '“' + current + '” is real' : 'Fake!' });
        next();
      }
      next();
      return { onKey: (e) => bar.onKey(e) };
    },
  });

  /* ---------------- Unscramble ---------------- */
  NS.registerGame({
    id: 'unscramble',
    name: 'Unscramble',
    category: 'language',
    tagline: 'Rearrange the jumbled letters into a real word.',
    howTo: [
      'The letters of a word have been scrambled.',
      'Tap (or type) the letters in the right order.',
      'Any valid word using all the letters counts.',
      'Can’t see it? Skip — but it breaks your streak.',
    ],
    keys: 'Type letters · Backspace · Enter = skip',
    duration: 60,
    par: 3200,
    icon: G.icon('<text x="50" y="44" text-anchor="middle" font-size="20" font-weight="900" fill="#fff" opacity=".7">T A C</text><path d="M50 50 v12 M44 56 l6 6 l6 -6" stroke="#fff" stroke-width="3" fill="none"/><text x="50" y="84" text-anchor="middle" font-size="20" font-weight="900" fill="#fff">C A T</text>', C),
    start(ctx) {
      const w = words();
      const lvl = ctx.level;
      let solved = 0, target, shownAt = 0, locked = false;
      const hint = el('div', { class: 'banner' });
      const skip = el('button', { class: 'btn small ghost', onpointerdown: (e) => { e.preventDefault(); doSkip(); } }, 'Skip');
      const input = tileInput(['a'], { onChange: check, extra: [skip], placeholder: 'Tap letters in order' });
      ctx.stage.append(hint, input.el);

      function next() {
        const len = Math.min(8, 4 + Math.floor((lvl - 1) / 3) + Math.floor(solved / 5));
        const list = (w.byLen[len] || w.common).filter((x) => x.length === len);
        target = U.pick(list);
        let letters;
        do { letters = U.shuffle(target.split('')); } while (letters.join('') === target && new Set(target).size > 1);
        input.setLetters(letters);
        locked = false;
        hint.innerHTML = lvl <= 3 ? 'Starts with <b>' + target[0].toUpperCase() + '</b> · ' + len + ' letters' : len + ' letters';
        shownAt = U.now();
      }
      function check(word) {
        if (locked || word.length < target.length) return;
        locked = true;
        if (word === target || w.anySet.has(word)) {
          solved++;
          ctx.hit(50 * target.length, { rt: U.now() - shownAt });
          ctx.later(next, 250);
        } else {
          input.shake();
          ctx.miss({ text: 'Not a word', quiet: false });
          ctx.later(() => { input.clear(); locked = false; }, 250);
        }
      }
      function doSkip() {
        if (locked) return;
        ctx.miss({ text: 'It was “' + target + '”' });
        solved = Math.max(0, solved - 2);
        next();
      }
      next();
      return {
        onKey(e) { if (e.key === 'Enter') { e.preventDefault(); doSkip(); return; } input.onKey(e); },
      };
    },
  });
})();
