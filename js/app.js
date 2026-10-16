/* NeuroSpark app shell: routing, home / workout, game library, stats, settings. */
(function () {
  'use strict';
  const NS = window.NS;
  const U = NS.util;
  const el = U.el;
  const store = NS.store;

  const main = U.$('#main');
  const playRoot = U.$('#play-root');
  const nav = U.$('#nav');

  /* ---------- small UI helpers ---------- */
  NS.ui = {
    sparkline(values, o) {
      o = o || {};
      const w = 280, h = 64, pad = 6;
      const max = Math.max(...values), min = Math.min(...values);
      const span = max - min || 1;
      const pts = values.map((v, i) => [pad + (i * (w - pad * 2)) / Math.max(1, values.length - 1), h - pad - ((v - min) / span) * (h - pad * 2)]);
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      const area = d + ' L' + pts[pts.length - 1][0] + ' ' + h + ' L' + pts[0][0] + ' ' + h + ' Z';
      const last = pts[pts.length - 1];
      const svg =
        '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" class="spark">' +
        '<path d="' + area + '" fill="' + (o.color || 'var(--accent)') + '" opacity=".15"/>' +
        '<path d="' + d + '" fill="none" stroke="' + (o.color || 'var(--accent)') + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
        '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="4" fill="' + (o.color || 'var(--accent)') + '"/></svg>';
      return el('figure', { class: 'spark-wrap' }, [el('div', { html: svg }), o.label ? el('figcaption', {}, o.label) : null]);
    },
    toast(msg) {
      const t = el('div', { class: 'toast' }, msg);
      document.body.appendChild(t);
      setTimeout(() => t.classList.add('show'), 10);
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
    },
  };

  function gameCard(def, o) {
    o = o || {};
    const g = store.data.games[def.id];
    const cat = NS.categories[def.category];
    return el('button', { class: 'game-card' + (o.done ? ' done' : ''), style: { '--cat': cat.color }, onclick: () => go('#/play/' + def.id + (o.workout ? '?w=1' : '')) }, [
      el('div', { class: 'gc-icon', html: def.icon }),
      el('div', { class: 'gc-body' }, [
        el('div', { class: 'gc-name' }, def.name),
        el('div', { class: 'gc-cat' }, cat.name),
        el('div', { class: 'gc-meta' }, g && g.plays ? 'Best ' + U.fmt(g.best) + ' · Lv ' + g.level : 'New'),
      ]),
      o.done ? el('div', { class: 'gc-check' }, '✓') : null,
    ]);
  }

  function greeting() {
    const h = new Date().getHours();
    const name = store.data.name ? ', ' + store.data.name : '';
    return (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + name;
  }

  /* ---------- Home ---------- */
  function renderHome() {
    const day = U.dayKey();
    const w = NS.workout.plan(day);
    const doneCount = w.done.length;
    const complete = doneCount >= w.games.length;
    const streak = NS.workout.streak();
    const overall = NS.perf.overall();
    const nextId = w.games.find((id) => !w.done.includes(id));

    const ring = progressRing(doneCount / w.games.length, doneCount + '/' + w.games.length);
    const hero = el('section', { class: 'hero' }, [
      el('div', { class: 'hero-text' }, [
        el('p', { class: 'eyebrow' }, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })),
        el('h1', {}, greeting()),
        el('p', {}, complete ? 'Workout complete! Come back tomorrow, or keep playing in Games.' : 'Your daily workout: ' + w.games.length + ' games picked to train different skills.'),
        el('div', { class: 'hero-actions' }, [
          complete
            ? el('button', { class: 'btn primary big', onclick: () => go('#/games') }, 'Free play')
            : el('button', { class: 'btn primary big', onclick: () => go('#/play/' + nextId + '?w=1') }, doneCount ? 'Continue workout' : 'Start workout'),
        ]),
      ]),
      ring,
    ]);

    const stats = el('section', { class: 'stat-row' }, [
      statTile('🔥', streak + (streak === 1 ? ' day' : ' days'), 'Workout streak'),
      statTile('🧠', overall != null ? String(overall) : '—', 'Brain index'),
      statTile('🎮', String(Object.values(store.data.games).reduce((a, g) => a + g.plays, 0)), 'Games played'),
    ]);

    const list = el('div', { class: 'workout-list' });
    w.games.forEach((id, i) => {
      const def = NS.gameById[id];
      const done = w.done.includes(id);
      const row = el('div', { class: 'workout-row' }, [
        el('span', { class: 'wr-num' + (done ? ' done' : '') }, done ? '✓' : String(i + 1)),
        gameCard(def, { done, workout: true }),
        !done ? el('button', { class: 'icon-btn swap', title: 'Swap for another game', 'aria-label': 'Swap game', onclick: () => { NS.workout.swap(day, id); render(); } }, '⇄') : null,
      ]);
      list.appendChild(row);
    });

    main.append(hero, stats, el('h2', { class: 'section-title' }, 'Today’s workout'), list, weekStrip());
  }

  function statTile(icon, value, label) {
    return el('div', { class: 'stat-tile' }, [el('span', { class: 'st-icon' }, icon), el('b', {}, value), el('span', {}, label)]);
  }

  function progressRing(frac, label) {
    const r = 52, c = 2 * Math.PI * r;
    return el('div', {
      class: 'ring',
      html:
        '<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="' + r + '" class="ring-bg"/><circle cx="60" cy="60" r="' + r + '" class="ring-fg" stroke-dasharray="' + c + '" stroke-dashoffset="' + c * (1 - frac) + '"/></svg><div class="ring-label"><b>' + label + '</b><span>done</span></div>',
    });
  }

  function weekStrip() {
    const today = U.dayKey();
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(U.addDays(today, -i));
    return el('section', { class: 'week' }, [
      el('h2', { class: 'section-title' }, 'This week'),
      el('div', { class: 'week-row' }, days.map((d) => {
        const [y, m, dd] = d.split('-').map(Number);
        const dt = new Date(y, m - 1, dd);
        const full = NS.workout.isComplete(d);
        const some = store.data.days[d] && store.data.days[d].plays > 0;
        return el('div', { class: 'week-day' + (full ? ' full' : some ? ' some' : '') + (d === today ? ' today' : '') }, [
          el('span', {}, dt.toLocaleDateString(undefined, { weekday: 'narrow' })),
          el('i', {}, full ? '✓' : String(dd)),
        ]);
      })),
    ]);
  }

  /* ---------- Games library ---------- */
  let gamesFilter = 'all';
  function renderGames() {
    main.appendChild(el('h1', { class: 'page-title' }, 'Games'));
    main.appendChild(el('p', { class: 'page-sub' }, NS.games.length + ' games across ' + Object.keys(NS.categories).length + ' skill areas. Every game adapts to your level.'));
    const chips = el('div', { class: 'filter-chips' });
    const opts = [['all', 'All', 'var(--accent)']].concat(Object.entries(NS.categories).map(([k, c]) => [k, c.name, c.color]));
    opts.forEach(([k, name, color]) => {
      chips.appendChild(el('button', { class: 'fchip' + (gamesFilter === k ? ' on' : ''), style: { '--c': color }, onclick: () => { gamesFilter = k; render(); } }, name));
    });
    main.appendChild(chips);
    const cats = gamesFilter === 'all' ? Object.keys(NS.categories) : [gamesFilter];
    cats.forEach((c) => {
      const defs = NS.games.filter((g) => g.category === c);
      if (!defs.length) return;
      const cat = NS.categories[c];
      main.appendChild(el('h2', { class: 'section-title cat-title', style: { '--cat': cat.color } }, [cat.name, el('small', {}, cat.blurb)]));
      main.appendChild(el('div', { class: 'game-grid' }, defs.map((d) => gameCard(d))));
    });
  }

  /* ---------- Stats ---------- */
  function renderStats() {
    main.appendChild(el('h1', { class: 'page-title' }, 'Your progress'));
    const overall = NS.perf.overall();
    const totalPlays = Object.values(store.data.games).reduce((a, g) => a + g.plays, 0);
    if (!totalPlays) {
      main.appendChild(el('div', { class: 'empty' }, [
        el('p', {}, 'Play a few games to see your Brain Index and progress charts here.'),
        el('button', { class: 'btn primary', onclick: () => go('#/home') }, 'Start today’s workout'),
      ]));
      return;
    }
    const totalMs = Object.values(store.data.days).reduce((a, d) => a + (d.ms || 0), 0);
    main.appendChild(el('section', { class: 'stat-row' }, [
      statTile('🧠', overall != null ? String(overall) : '—', 'Brain index'),
      statTile('🔥', String(NS.workout.bestStreak()), 'Best streak'),
      statTile('⏱', Math.round(totalMs / 60000) + ' min', 'Time trained'),
    ]));
    main.appendChild(el('p', { class: 'hint' }, 'Your Brain Index compares your recent top scores with each game’s reference score (1000). It’s a fun way to track yourself over time — not a medical or IQ measurement.'));

    // category bars
    const bars = el('div', { class: 'cat-bars' });
    const vals = Object.entries(NS.categories).map(([k, c]) => [k, c, NS.perf.categoryIndex(k)]);
    const max = Math.max(1500, ...vals.map((v) => v[2] || 0));
    vals.forEach(([k, c, v]) => {
      bars.appendChild(el('div', { class: 'cat-bar' }, [
        el('span', { class: 'cb-name' }, c.name),
        el('div', { class: 'cb-track' }, el('div', { class: 'cb-fill', style: { width: ((v || 0) / max) * 100 + '%', background: c.color } })),
        el('b', { class: 'cb-val' }, v != null ? String(v) : '—'),
      ]));
    });
    main.append(el('h2', { class: 'section-title' }, 'Skill breakdown'), bars, radar(vals));

    // activity heat map (last 12 weeks)
    main.append(el('h2', { class: 'section-title' }, 'Activity'), heatmap());

    // per game
    main.appendChild(el('h2', { class: 'section-title' }, 'Games'));
    const list = el('div', { class: 'game-stats' });
    NS.games.forEach((def) => {
      const g = store.data.games[def.id];
      if (!g || !g.plays) return;
      const cat = NS.categories[def.category];
      const hist = g.history.map((h) => h.s);
      list.appendChild(el('div', { class: 'gs-card', style: { '--cat': cat.color } }, [
        el('div', { class: 'gs-head' }, [
          el('div', { class: 'gc-icon small', html: def.icon }),
          el('div', {}, [el('b', {}, def.name), el('span', {}, cat.name + ' · Level ' + g.level + ' · ' + g.plays + ' plays')]),
          el('div', { class: 'gs-best' }, [el('b', {}, U.fmt(g.best)), el('span', {}, 'best')]),
        ]),
        hist.length > 1 ? NS.ui.sparkline(hist.slice(-20), { color: cat.color }) : el('p', { class: 'hint' }, 'Play again to see a trend.'),
        el('button', { class: 'btn small', onclick: () => go('#/play/' + def.id) }, 'Play'),
      ]));
    });
    main.appendChild(list);
  }

  function radar(vals) {
    const n = vals.length, cx = 150, cy = 140, R = 100;
    const max = Math.max(1500, ...vals.map((v) => v[2] || 0));
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    let grid = '';
    [0.25, 0.5, 0.75, 1].forEach((f) => {
      grid += '<polygon points="' + vals.map((_, i) => [cx + Math.cos(ang(i)) * R * f, cy + Math.sin(ang(i)) * R * f].join(',')).join(' ') + '" class="radar-grid"/>';
    });
    const pts = vals.map((v, i) => { const f = (v[2] || 0) / max; return [cx + Math.cos(ang(i)) * R * f, cy + Math.sin(ang(i)) * R * f]; });
    const labels = vals.map((v, i) => {
      const x = cx + Math.cos(ang(i)) * (R + 22), y = cy + Math.sin(ang(i)) * (R + 16);
      return '<text x="' + x + '" y="' + y + '" text-anchor="middle" dominant-baseline="middle" class="radar-label" fill="' + v[1].color + '">' + v[1].name.replace('Problem Solving', 'Problem') + '</text>';
    }).join('');
    const dots = pts.map((p, i) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="' + vals[i][1].color + '"/>').join('');
    return el('div', { class: 'radar', html: '<svg viewBox="0 0 300 280">' + grid + '<polygon points="' + pts.map((p) => p.join(',')).join(' ') + '" class="radar-shape"/>' + dots + labels + '</svg>' });
  }

  function heatmap() {
    const today = U.dayKey();
    const weeks = 12;
    const start = U.addDays(today, -(weeks * 7 - 1) - new Date().getDay());
    const cols = [];
    let d = start;
    for (let w = 0; w <= weeks; w++) {
      const col = el('div', { class: 'hm-col' });
      for (let i = 0; i < 7; i++) {
        const info = store.data.days[d];
        const plays = info ? info.plays : 0;
        const lvl = d > today ? -1 : plays === 0 ? 0 : plays < 3 ? 1 : plays < 6 ? 2 : 3;
        col.appendChild(el('i', { class: 'hm l' + lvl, title: d + ': ' + plays + ' games' + (NS.workout.isComplete(d) ? ' · workout ✓' : '') }));
        d = U.addDays(d, 1);
      }
      cols.push(col);
    }
    return el('div', { class: 'heatmap' }, cols);
  }

  /* ---------- Settings ---------- */
  function renderSettings() {
    const s = store.settings();
    main.appendChild(el('h1', { class: 'page-title' }, 'Settings'));
    const nameInput = el('input', { type: 'text', value: store.data.name || '', placeholder: 'Your name', maxlength: '24' });
    nameInput.addEventListener('change', () => { store.data.name = nameInput.value.trim(); store.save(); NS.ui.toast('Saved'); });
    const form = el('div', { class: 'settings' }, [
      row('Name', 'Shown in your greeting', nameInput),
      row('Sound effects', 'Tones for right and wrong answers', toggle(s.sound, (v) => store.setSetting('sound', v))),
      row('Vibration', 'Haptic feedback on supported phones', toggle(s.haptics, (v) => store.setSetting('haptics', v))),
      row('Theme', 'Light, dark, or match your device', select(['auto', 'light', 'dark'], s.theme, (v) => { store.setSetting('theme', v); applyTheme(); })),
      row('Workout size', 'Games in each daily workout (applies from tomorrow)', select(['3', '4', '5', '6', '7'], String(s.workoutSize), (v) => store.setSetting('workoutSize', +v))),
    ]);
    main.appendChild(form);

    main.appendChild(el('h2', { class: 'section-title' }, 'Your data'));
    main.appendChild(el('p', { class: 'hint' }, 'Everything is stored privately on this device — no account, no ads, no tracking. Export a backup to move your progress to another device.'));
    const file = el('input', { type: 'file', accept: 'application/json', style: { display: 'none' } });
    file.addEventListener('change', () => {
      const f = file.files[0];
      if (!f) return;
      f.text().then((txt) => { try { store.importJSON(txt); NS.ui.toast('Progress restored'); render(); } catch (e) { NS.ui.toast('That file isn’t a valid backup'); } });
    });
    main.appendChild(el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn', onclick: exportData }, 'Export backup'),
      el('button', { class: 'btn', onclick: () => file.click() }, 'Import backup'),
      el('button', { class: 'btn danger', onclick: () => { if (confirm('Erase all progress on this device? This cannot be undone.')) { store.reset(); NS.ui.toast('Progress erased'); render(); } } }, 'Reset progress'),
      file,
    ]));
    main.appendChild(el('h2', { class: 'section-title' }, 'About'));
    main.appendChild(el('p', { class: 'hint', html: 'NeuroSpark is a free, open brain-training app with ' + NS.games.length + ' games. Install it to your home screen from your browser’s menu to play offline.<br>Brain games are fun practice; they aren’t a medical tool.' }));
  }
  function exportData() {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'neurospark-backup-' + U.dayKey() + '.json' });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }
  function row(label, sub, control) {
    return el('label', { class: 'set-row' }, [el('div', {}, [el('b', {}, label), el('span', {}, sub)]), control]);
  }
  function toggle(on, cb) {
    const i = el('input', { type: 'checkbox', class: 'switch' });
    i.checked = !!on;
    i.addEventListener('change', () => cb(i.checked));
    return i;
  }
  function select(options, value, cb) {
    const s = el('select', {}, options.map((o) => el('option', { value: o, selected: o === value }, o[0].toUpperCase() + o.slice(1))));
    s.addEventListener('change', () => cb(s.value));
    return s;
  }

  /* ---------- Play ---------- */
  function renderPlay(id, isWorkout) {
    const def = NS.gameById[id];
    if (!def) { go('#/games'); return; }
    document.body.classList.add('playing');
    const nextGame = () => {
      const w = NS.workout.plan();
      return w.games.find((g) => !w.done.includes(g) && g !== id);
    };
    const launch = () =>
      NS.engine.launch(id, playRoot, {
        workout: isWorkout,
        get nextGame() { return isWorkout ? nextGame() : null; },
        onExit: () => go(isWorkout ? '#/home' : '#/games'),
        onRestart: () => launch(),
        onNext: () => {
          const n = nextGame();
          if (n) go('#/play/' + n + '?w=1');
          else go('#/home');
        },
      });
    launch();
  }

  /* ---------- routing ---------- */
  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }
  NS.go = go;

  function render() {
    const hash = location.hash || '#/home';
    const [path, query] = hash.slice(1).split('?');
    const parts = path.split('/').filter(Boolean);
    NS.engine.stop();
    main.innerHTML = '';
    playRoot.innerHTML = '';
    document.body.classList.remove('playing');
    const page = parts[0] || 'home';
    U.$$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
    if (page === 'play') { renderPlay(parts[1], /(^|&)w=1/.test(query || '')); return; }
    if (page === 'games') renderGames();
    else if (page === 'stats') renderStats();
    else if (page === 'settings') renderSettings();
    else renderHome();
    window.scrollTo(0, 0);
  }

  function applyTheme() {
    const t = store.settings().theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  applyTheme();
  window.addEventListener('hashchange', render);
  render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
