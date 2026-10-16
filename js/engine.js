/* NeuroSpark game engine: intro -> countdown -> play (HUD, timer, scoring, pause) -> results. */
(function () {
  'use strict';
  const NS = window.NS;
  const U = NS.util;
  const el = U.el;

  const icons = {
    pause: '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  NS.icons = Object.assign(NS.icons || {}, icons);

  let current = null; // active session

  function stopCurrent() {
    if (current) { current.destroy(); current = null; }
  }

  /* A play session for one game */
  function Session(def, root, opts) {
    const store = NS.store;
    const gstate = store.game(def.id);
    const cat = NS.categories[def.category];
    const S = this;
    let tasks = new Set();
    let paused = false;
    let running = false;
    let finished = false;
    let game = null;
    let activeMs = 0;
    let activeFrom = 0;
    let raf = 0;
    let score = 0, hits = 0, misses = 0, combo = 0, bestCombo = 0;
    const rts = [];
    let keyHandler = null;
    let visHandler = null;
    let hudScore, hudMult, hudTimer, hudTimerFill, hudProgress, stage, pauseOverlay, playWrap;

    root.innerHTML = '';
    root.style.setProperty('--cat', cat.color);

    /* ---------- scheduler that respects pause ---------- */
    function later(fn, ms) {
      const t = { fn, remaining: Math.max(0, ms), id: 0, due: 0, done: false };
      tasks.add(t);
      if (!paused) arm(t);
      return t;
    }
    function arm(t) {
      t.due = U.now() + t.remaining;
      t.id = setTimeout(() => {
        if (t.done) return;
        t.done = true;
        tasks.delete(t);
        if (!finished) t.fn();
      }, t.remaining);
    }
    function cancel(t) {
      if (!t) return;
      t.done = true;
      clearTimeout(t.id);
      tasks.delete(t);
    }
    function every(fn, ms) {
      const h = { stopped: false, t: null };
      const step = () => { if (h.stopped) return; fn(); if (!h.stopped) h.t = later(step, ms); };
      h.t = later(step, ms);
      h.stop = () => { h.stopped = true; cancel(h.t); };
      return h;
    }
    function clearTasks() { tasks.forEach((t) => { t.done = true; clearTimeout(t.id); }); tasks.clear(); }

    function elapsed() { return activeMs + (running && !paused ? U.now() - activeFrom : 0); }

    /* ---------- intro screen ---------- */
    function intro() {
      const wrap = el('div', { class: 'game-intro' });
      const header = el('div', { class: 'gi-head' }, [
        el('button', { class: 'icon-btn', 'aria-label': 'Back', html: icons.back, onclick: () => opts.onExit && opts.onExit() }),
        el('span', { class: 'chip', style: { background: cat.color } }, cat.name),
      ]);
      const art = el('div', { class: 'gi-art', html: def.icon });
      const title = el('h1', { class: 'gi-title' }, def.name);
      const tag = el('p', { class: 'gi-tag' }, def.tagline);
      const how = el('ol', { class: 'gi-how' }, def.howTo.map((h) => el('li', { html: h })));
      const meta = el('div', { class: 'gi-meta' }, [
        el('div', {}, [el('b', {}, 'Level ' + gstate.level), el('span', {}, 'difficulty')]),
        el('div', {}, [el('b', {}, gstate.best ? U.fmt(gstate.best) : '—'), el('span', {}, 'best score')]),
        el('div', {}, [el('b', {}, def.duration ? def.duration + 's' : 'Rounds'), el('span', {}, 'length')]),
      ]);
      const keys = def.keys ? el('p', { class: 'gi-keys' }, [el('span', {}, '⌨ '), def.keys]) : null;
      const start = el('button', { class: 'btn primary big', onclick: () => { NS.sound.unlock(); countdown(); } }, 'Play');
      wrap.append(header, art, title, tag, how, meta, keys || '', start);
      root.appendChild(wrap);
      setTimeout(() => start.focus(), 50);
      keyHandler = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); NS.sound.unlock(); countdown(); } };
      document.addEventListener('keydown', keyHandler);
    }

    /* ---------- countdown ---------- */
    function countdown() {
      document.removeEventListener('keydown', keyHandler);
      root.innerHTML = '';
      const cd = el('div', { class: 'countdown' });
      root.appendChild(cd);
      let n = 3;
      const step = () => {
        if (S.destroyed) return;
        if (n === 0) { NS.sound.go(); begin(); return; }
        cd.innerHTML = '';
        cd.appendChild(el('div', { class: 'cd-num' }, String(n)));
        NS.sound.tick();
        n--;
        setTimeout(step, 650);
      };
      step();
    }

    /* ---------- playing ---------- */
    function begin() {
      root.innerHTML = '';
      playWrap = el('div', { class: 'play' });
      const pauseBtn = el('button', { class: 'icon-btn', 'aria-label': 'Pause', html: icons.pause, onclick: () => pause() });
      hudScore = el('div', { class: 'hud-score' }, '0');
      hudMult = el('div', { class: 'hud-mult' }, '×1');
      hudProgress = el('div', { class: 'hud-progress' });
      hudTimerFill = el('div', { class: 'hud-timer-fill' });
      hudTimer = el('div', { class: 'hud-timer' + (def.duration ? '' : ' hidden') }, hudTimerFill);
      const hud = el('div', { class: 'hud' }, [
        pauseBtn,
        el('div', { class: 'hud-mid' }, [el('div', { class: 'hud-name' }, def.name), hudTimer, hudProgress]),
        el('div', { class: 'hud-right' }, [hudScore, hudMult]),
      ]);
      stage = el('div', { class: 'stage', tabindex: '-1' });
      playWrap.append(hud, stage);
      root.appendChild(playWrap);

      running = true;
      activeFrom = U.now();
      const ctx = {
        stage, level: gstate.level, def,
        later, cancel, every, elapsed,
        hit, miss, addScore, finish: () => end(),
        setProgress: (t) => { hudProgress.textContent = t || ''; },
        get paused() { return paused; },
        get running() { return running && !finished; },
        get combo() { return combo; },
        timeLeft: () => (def.duration ? Math.max(0, def.duration * 1000 - elapsed()) : Infinity),
        floatText,
      };
      S.ctx = ctx;
      game = def.start(ctx) || {};
      if (def.duration) later(() => { if (game.onTimeUp) game.onTimeUp(); end(); }, def.duration * 1000);
      keyHandler = (e) => {
        if (e.key === 'Escape' || e.key === 'p') { e.preventDefault(); paused ? resume() : pause(); return; }
        if (paused || finished) return;
        if (game.onKey) game.onKey(e);
      };
      document.addEventListener('keydown', keyHandler);
      visHandler = () => { if (document.hidden && running && !finished) pause(); };
      document.addEventListener('visibilitychange', visHandler);
      loop();
    }

    function loop() {
      if (finished || S.destroyed) return;
      if (def.duration && hudTimerFill) {
        const frac = U.clamp(1 - elapsed() / (def.duration * 1000), 0, 1);
        hudTimerFill.style.transform = 'scaleX(' + frac + ')';
        hudTimer.classList.toggle('low', frac < 0.15);
      }
      raf = requestAnimationFrame(loop);
    }

    function multiplier() { return Math.min(def.maxMult || 5, 1 + Math.floor(combo / (def.comboStep || 4))); }
    function updateHud(bump) {
      hudScore.textContent = U.fmt(score);
      const m = multiplier();
      hudMult.textContent = '×' + m;
      hudMult.dataset.m = m;
      if (bump) { hudScore.classList.remove('bump'); void hudScore.offsetWidth; hudScore.classList.add('bump'); }
    }
    function floatText(text, good, x, y) {
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      const f = el('div', { class: 'float ' + (good ? 'good' : 'bad') }, text);
      f.style.left = (x != null ? x - r.left : r.width / 2) + 'px';
      f.style.top = (y != null ? y - r.top : r.height * 0.12) + 'px';
      stage.appendChild(f);
      setTimeout(() => f.remove(), 900);
    }
    function flashStage(good) {
      stage.classList.remove('flash-good', 'flash-bad');
      void stage.offsetWidth;
      stage.classList.add(good ? 'flash-good' : 'flash-bad');
    }
    function hit(points, o) {
      if (finished) return 0;
      o = o || {};
      const before = multiplier();
      hits++;
      combo++;
      bestCombo = Math.max(bestCombo, combo);
      if (o.rt) rts.push(o.rt);
      const pts = Math.round((points == null ? 100 : points) * (o.noMult ? 1 : multiplier()));
      score += pts;
      const after = multiplier();
      if (after > before) NS.sound.level(); else NS.sound.good(combo);
      U.vibrate(8);
      if (!o.quiet) { flashStage(true); floatText('+' + pts, true, o.x, o.y); }
      updateHud(true);
      return pts;
    }
    function miss(o) {
      if (finished) return;
      o = o || {};
      misses++;
      const m = multiplier();
      combo = Math.max(0, (m - 2) * (def.comboStep || 4));
      NS.sound.bad();
      U.vibrate([20, 30, 20]);
      if (!o.quiet) { flashStage(false); floatText(o.text || '✗', false, o.x, o.y); }
      updateHud(false);
    }
    function addScore(n) { score = Math.max(0, score + n); updateHud(n > 0); }

    /* ---------- pause ---------- */
    function pause() {
      if (paused || finished || !running) return;
      paused = true;
      activeMs += U.now() - activeFrom;
      tasks.forEach((t) => { clearTimeout(t.id); t.remaining = Math.max(0, t.due - U.now()); });
      stage.classList.add('paused');
      if (game.onPause) game.onPause();
      pauseOverlay = el('div', { class: 'overlay' }, el('div', { class: 'overlay-card' }, [
        el('h2', {}, 'Paused'),
        el('button', { class: 'btn primary', onclick: resume }, 'Resume'),
        el('button', { class: 'btn', onclick: () => { S.destroy(); opts.onRestart && opts.onRestart(); } }, 'Restart'),
        el('button', { class: 'btn ghost', onclick: () => { S.destroy(); opts.onExit && opts.onExit(); } }, 'Quit game'),
      ]));
      playWrap.appendChild(pauseOverlay);
    }
    function resume() {
      if (!paused) return;
      paused = false;
      activeFrom = U.now();
      tasks.forEach((t) => arm(t));
      stage.classList.remove('paused');
      if (pauseOverlay) pauseOverlay.remove();
      if (game.onResume) game.onResume();
    }

    /* ---------- results ---------- */
    function end() {
      if (finished) return;
      finished = true;
      if (!paused) activeMs += U.now() - activeFrom;
      running = false;
      clearTasks();
      cancelAnimationFrame(raf);
      if (game.destroy) try { game.destroy(); } catch (e) { console.error(e); }
      if (keyHandler) document.removeEventListener('keydown', keyHandler);
      const total = hits + misses;
      const accuracy = total ? hits / total : 0;
      const levelBefore = gstate.level;
      const res = NS.store.recordPlay(def.id, { score, accuracy, ms: activeMs });
      if (opts.workout) NS.workout.markDone(def.id);
      NS.sound.end();
      setTimeout(() => results({ score, accuracy, hits, misses, bestCombo, res, levelBefore }), 450);
    }

    function results(r) {
      if (S.destroyed) return;
      root.innerHTML = '';
      const idx = NS.perf.scoreIndex(def.id, r.score);
      const avgRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;
      const scoreEl = el('div', { class: 'res-score' }, '0');
      const g = NS.store.game(def.id);
      const hist = g.history.slice(-10).map((h) => h.s);
      const wrap = el('div', { class: 'results' }, [
        el('div', { class: 'res-art', html: def.icon }),
        el('h2', {}, def.name),
        r.res.isBest && g.plays > 1 ? el('div', { class: 'badge-best' }, '★ New personal best!') : null,
        scoreEl,
        el('div', { class: 'res-label' }, 'points'),
        el('div', { class: 'res-stats' }, [
          stat(Math.round(r.accuracy * 100) + '%', 'accuracy'),
          stat(String(r.bestCombo), 'best streak'),
          stat(avgRt ? avgRt + 'ms' : '—', 'avg response'),
          stat(String(idx), 'game index'),
        ]),
        levelMsg(r),
        hist.length > 1 ? NS.ui.sparkline(hist, { color: cat.color, label: 'Your last ' + hist.length + ' scores' }) : null,
        el('div', { class: 'res-actions' }, [
          opts.workout && opts.nextGame
            ? el('button', { class: 'btn primary big', onclick: () => opts.onNext() }, 'Next game →')
            : null,
          el('button', { class: 'btn' + (opts.workout && opts.nextGame ? '' : ' primary big'), onclick: () => opts.onRestart && opts.onRestart() }, 'Play again'),
          el('button', { class: 'btn ghost', onclick: () => opts.onExit && opts.onExit() }, opts.workout ? 'Back to workout' : 'Done'),
        ]),
      ]);
      root.appendChild(wrap);
      // count-up animation
      const t0 = U.now();
      const dur = 900;
      const tick = () => {
        if (S.destroyed) return;
        const p = Math.min(1, (U.now() - t0) / dur);
        scoreEl.textContent = U.fmt(r.score * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      tick();
      keyHandler = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); if (opts.workout && opts.nextGame) opts.onNext(); else opts.onRestart && opts.onRestart(); }
      };
      document.addEventListener('keydown', keyHandler);
    }
    function stat(v, l) { return el('div', { class: 'res-stat' }, [el('b', {}, v), el('span', {}, l)]); }
    function levelMsg(r) {
      const { oldLevel, newLevel } = r.res;
      if (newLevel > oldLevel) return el('p', { class: 'res-level up' }, '▲ Level up! Next time you’ll play level ' + newLevel + '.');
      if (newLevel < oldLevel) return el('p', { class: 'res-level down' }, 'Difficulty eased to level ' + newLevel + ' — keep practicing.');
      return el('p', { class: 'res-level' }, 'Level ' + newLevel + ' · reach 85% accuracy to level up');
    }

    this.destroy = function () {
      if (S.destroyed) return;
      S.destroyed = true;
      if (!finished) {
        finished = true;
        clearTasks();
        cancelAnimationFrame(raf);
        if (game && game.destroy) try { game.destroy(); } catch (e) { console.error(e); }
      }
      if (keyHandler) document.removeEventListener('keydown', keyHandler);
      if (visHandler) document.removeEventListener('visibilitychange', visHandler);
    };
    this.end = end;
    this.pause = pause;

    intro();
  }

  NS.engine = {
    launch(id, root, opts) {
      stopCurrent();
      const def = NS.gameById[id];
      if (!def) return null;
      current = new Session(def, root, opts || {});
      return current;
    },
    stop: stopCurrent,
    get current() { return current; },
  };
})();
