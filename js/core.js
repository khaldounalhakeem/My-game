/* NeuroSpark core: utilities, storage, sound, categories, game registry. */
(function () {
  'use strict';

  const NS = (window.NS = window.NS || {});

  /* ---------- utilities ---------- */
  const U = (NS.util = {
    $(sel, root) { return (root || document).querySelector(sel); },
    $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },
    el(tag, attrs, children) {
      const e = document.createElement(tag);
      if (attrs) {
        for (const k in attrs) {
          const v = attrs[k];
          if (v == null || v === false) continue;
          if (k === 'class') e.className = v;
          else if (k === 'html') e.innerHTML = v;
          else if (k === 'text') e.textContent = v;
          else if (k === 'style' && typeof v === 'object') {
            for (const p in v) { if (p.startsWith('--')) e.style.setProperty(p, v[p]); else e.style[p] = v[p]; }
          }
          else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
          else e.setAttribute(k, v === true ? '' : v);
        }
      }
      if (children != null) {
        (Array.isArray(children) ? children : [children]).forEach((c) => {
          if (c == null || c === false) return;
          e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
        });
      }
      return e;
    },
    clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
    rand(n) { return Math.floor(Math.random() * n); },
    randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    sample(arr, n) { return U.shuffle(arr).slice(0, n); },
    chance(p) { return Math.random() < p; },
    /* deterministic PRNG for daily workouts */
    seeded(seed) {
      let s = seed >>> 0;
      return function () {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    hash(str) {
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    },
    dayKey(d) {
      d = d || new Date();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return d.getFullYear() + '-' + m + '-' + day;
    },
    addDays(key, n) {
      const [y, m, d] = key.split('-').map(Number);
      const dt = new Date(y, m - 1, d + n);
      return U.dayKey(dt);
    },
    fmt(n) { return Math.round(n).toLocaleString(); },
    now() { return performance.now(); },
    vibrate(p) { if (NS.store && NS.store.settings().haptics && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { /* ignore */ } } },
  });

  /* ---------- categories ---------- */
  NS.categories = {
    memory: { name: 'Memory', color: '#8b5cf6', blurb: 'Hold and recall information' },
    speed: { name: 'Speed', color: '#eab308', blurb: 'Process information quickly' },
    attention: { name: 'Attention', color: '#06b6d4', blurb: 'Focus and filter distractions' },
    flexibility: { name: 'Flexibility', color: '#10b981', blurb: 'Switch between tasks and rules' },
    problem: { name: 'Problem Solving', color: '#f43f5e', blurb: 'Reason through logic and space' },
    language: { name: 'Language', color: '#3b82f6', blurb: 'Work with words and vocabulary' },
    math: { name: 'Math', color: '#f97316', blurb: 'Calculate and estimate numbers' },
  };

  /* ---------- game registry ---------- */
  NS.games = [];
  NS.gameById = {};
  NS.registerGame = function (def) {
    def.maxLevel = def.maxLevel || 20;
    NS.games.push(def);
    NS.gameById[def.id] = def;
  };

  /* ---------- storage ---------- */
  const KEY = 'neurospark.v1';
  function blank() {
    return {
      version: 1,
      created: Date.now(),
      name: '',
      settings: { sound: true, haptics: true, theme: 'auto', workoutSize: 5 },
      games: {},
      days: {},
      workouts: {},
    };
  }
  let data;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? Object.assign(blank(), JSON.parse(raw)) : blank();
      data.settings = Object.assign(blank().settings, data.settings || {});
    } catch (e) {
      data = blank();
    }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage may be unavailable */ }
  }
  load();

  const store = (NS.store = {
    get data() { return data; },
    save,
    settings() { return data.settings; },
    setSetting(k, v) { data.settings[k] = v; save(); },
    game(id) {
      if (!data.games[id]) data.games[id] = { level: 1, best: 0, plays: 0, history: [] };
      return data.games[id];
    },
    recordPlay(id, result) {
      const g = store.game(id);
      const def = NS.gameById[id];
      g.plays++;
      const isBest = result.score > g.best;
      if (isBest) g.best = result.score;
      g.history.push({ t: Date.now(), d: U.dayKey(), s: Math.round(result.score), a: Math.round(result.accuracy * 100), l: g.level });
      if (g.history.length > 100) g.history.splice(0, g.history.length - 100);
      // adaptive difficulty between sessions
      const oldLevel = g.level;
      if (result.accuracy >= 0.85 && result.score >= def.par * 0.6) g.level = Math.min(def.maxLevel, g.level + 1);
      else if (result.accuracy < 0.6) g.level = Math.max(1, g.level - 1);
      const day = U.dayKey();
      const dd = data.days[day] || (data.days[day] = { plays: 0, ms: 0 });
      dd.plays++;
      dd.ms += result.ms || 0;
      save();
      return { isBest, oldLevel, newLevel: g.level };
    },
    reset() { data = blank(); save(); },
    exportJSON() { return JSON.stringify(data, null, 2); },
    importJSON(str) {
      const obj = JSON.parse(str);
      if (!obj || typeof obj !== 'object' || !obj.games) throw new Error('Not a NeuroSpark backup');
      data = Object.assign(blank(), obj);
      save();
    },
  });

  /* ---------- scoring / performance index ---------- */
  NS.perf = {
    /* game index: recent performance relative to the game's par score (par ~ 1000) */
    gameIndex(id) {
      const g = data.games[id];
      const def = NS.gameById[id];
      if (!g || !g.history.length || !def) return null;
      const recent = g.history.slice(-5).map((h) => h.s).sort((a, b) => b - a);
      const top = recent.slice(0, 3);
      const avg = top.reduce((a, b) => a + b, 0) / top.length;
      return Math.round(U.clamp((avg / def.par) * 1000, 0, 3000));
    },
    categoryIndex(cat) {
      const vals = NS.games.filter((g) => g.category === cat).map((g) => NS.perf.gameIndex(g.id)).filter((v) => v != null);
      if (!vals.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    },
    overall() {
      const vals = Object.keys(NS.categories).map((c) => NS.perf.categoryIndex(c)).filter((v) => v != null);
      if (!vals.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    },
    /* rough index computed from a specific score (for "what this score means") */
    scoreIndex(id, score) {
      const def = NS.gameById[id];
      return Math.round(U.clamp((score / def.par) * 1000, 0, 3000));
    },
  };

  /* ---------- daily workout ---------- */
  NS.workout = {
    plan(day) {
      day = day || U.dayKey();
      if (data.workouts[day]) {
        // keep only games that still exist
        data.workouts[day].games = data.workouts[day].games.filter((id) => NS.gameById[id]);
        if (data.workouts[day].games.length) return data.workouts[day];
      }
      const size = data.settings.workoutSize || 5;
      const rng = U.seeded(U.hash(day + ':' + (data.created || 0)));
      const cats = Object.keys(NS.categories);
      // shuffle categories deterministically
      for (let i = cats.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [cats[i], cats[j]] = [cats[j], cats[i]];
      }
      const picks = [];
      for (const c of cats) {
        if (picks.length >= size) break;
        const pool = NS.games.filter((g) => g.category === c);
        if (pool.length) picks.push(pool[Math.floor(rng() * pool.length)].id);
      }
      const w = { games: picks, done: [] };
      data.workouts[day] = w;
      save();
      return w;
    },
    swap(day, id) {
      const w = NS.workout.plan(day);
      const idx = w.games.indexOf(id);
      if (idx < 0 || w.done.includes(id)) return;
      const def = NS.gameById[id];
      const pool = NS.games.filter((g) => g.category === def.category && !w.games.includes(g.id));
      const pool2 = pool.length ? pool : NS.games.filter((g) => !w.games.includes(g.id));
      if (!pool2.length) return;
      w.games[idx] = U.pick(pool2).id;
      save();
    },
    markDone(id, day) {
      day = day || U.dayKey();
      const w = NS.workout.plan(day);
      if (w.games.includes(id) && !w.done.includes(id)) {
        w.done.push(id);
        if (w.done.length === w.games.length) w.completedAt = Date.now();
        save();
      }
      return w;
    },
    isComplete(day) {
      const w = data.workouts[day];
      return !!(w && w.games.length && w.done.length >= w.games.length);
    },
    streak() {
      let day = U.dayKey();
      let n = 0;
      if (!NS.workout.isComplete(day)) day = U.addDays(day, -1); // today not done yet: count from yesterday
      while (NS.workout.isComplete(day)) { n++; day = U.addDays(day, -1); }
      return n;
    },
    bestStreak() {
      const days = Object.keys(data.workouts).filter((d) => NS.workout.isComplete(d)).sort();
      let best = 0, cur = 0, prev = null;
      for (const d of days) {
        cur = prev && U.addDays(prev, 1) === d ? cur + 1 : 1;
        best = Math.max(best, cur);
        prev = d;
      }
      return best;
    },
  };

  /* ---------- sound (WebAudio synthesized, no assets) ---------- */
  let actx = null;
  function ac() {
    if (!actx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      actx = new C();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur, type, vol, delay) {
    if (!data.settings.sound) return;
    const a = ac();
    if (!a) return;
    const t0 = a.currentTime + (delay || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  NS.sound = {
    unlock() { try { ac(); } catch (e) { /* ignore */ } },
    good(combo) { const f = 660 * Math.pow(1.06, Math.min(combo || 0, 12)); tone(f, 0.12, 'sine', 0.12); tone(f * 1.5, 0.1, 'sine', 0.06, 0.04); },
    bad() { tone(180, 0.22, 'square', 0.06); },
    tick() { tone(880, 0.05, 'triangle', 0.06); },
    go() { tone(990, 0.2, 'sine', 0.12); },
    level() { [523, 659, 784].forEach((f, i) => tone(f, 0.14, 'sine', 0.1, i * 0.08)); },
    end() { [784, 659, 523, 784, 1046].forEach((f, i) => tone(f, 0.16, 'sine', 0.1, i * 0.1)); },
    note(i) { const scale = [262, 294, 330, 392, 440, 523, 587, 659, 784]; tone(scale[i % scale.length], 0.3, 'sine', 0.14); },
    pop() { tone(520, 0.06, 'triangle', 0.08); },
  };
})();
