// Puzzles: rated training, Puzzle Rush (3 minutes, 3 strikes) and themed sets.
import { Chess } from '../../vendor/chess.js';
import { PUZZLES } from '../../data/puzzles.js';
import { store } from '../storage.js';
import { go } from '../app.js';
import { Board } from '../board.js';
import { sound } from '../sound.js';
import { coachById, say } from '../coaches.js';
import { classIcon } from '../review.js';
import { $, esc, avatar, toast, fmtClock, confetti } from '../ui.js';

const THEMES = [
  ['all', 'All'], ['mateIn1', 'Mate in 1'], ['mateIn2', 'Mate in 2'], ['mateIn3', 'Mate in 3+'], ['mate', 'Any mate'],
  ['winMaterial', 'Win material'], ['advantage', 'Long tactic'], ['quietMove', 'Quiet move'], ['check', 'Starts with check'], ['capture', 'Starts with capture'],
];

const P = PUZZLES.map(([id, fen, moves, rating, themes]) => ({ id, fen, moves: moves.split(' '), rating, themes: themes.split(' ') }));

export function dailyPuzzle() {
  const day = Math.floor(Date.now() / 86400000);
  const pool = P.filter(p => p.rating >= 900 && p.rating <= 1700);
  return pool[(day * 7919) % pool.length];
}

export function render(main, { payload }) {
  const pz = new PuzzleScreen(main, payload?.mode || 'rated', payload?.daily ? dailyPuzzle() : null);
  return () => pz.destroy();
}

class PuzzleScreen {
  constructor(main, mode, first) {
    this.main = main;
    this.mode = mode;
    this.theme = 'all';
    this.coach = coachById(store.settings.coachId);
    this.timers = [];
    this.build();
    this.setMode(mode, first);
  }

  build() {
    this.main.innerHTML = `<div class="play-layout">
      <div class="board-col"><div class="player-bar" id="pz-top"></div><div class="board-holder"><div id="board"></div></div><div class="player-bar" id="pz-bottom"></div></div>
      <div class="side-panel">
        <div class="tabs"><button data-m="rated">🧩 Rated</button><button data-m="rush">⚡ Puzzle Rush</button><button data-m="themes">🎯 Themes</button></div>
        <div class="panel-body" id="pbody"></div>
        <div class="panel-foot" id="pfoot"></div>
      </div></div>`;
    this.$ = s => $(s, this.main);
    this.board = new Board(this.$('#board'), { onMove: m => this.onMove(m), onIllegal: () => sound.play('illegal') });
    this.board.setMovable(null);
    this.main.querySelectorAll('.tabs button').forEach(b => b.onclick = () => this.setMode(b.dataset.m));
  }

  setMode(mode, first) {
    this.mode = mode;
    this.clearTimers();
    this.main.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.m === mode));
    this.$('#pz-top').innerHTML = '';
    this.$('#pz-bottom').innerHTML = '';
    if (mode === 'rush') return this.rushIntro();
    this.next(first);
  }

  pickPuzzle() {
    const solved = new Set(store.stats.solved);
    let pool = P;
    if (this.mode === 'themes' && this.theme !== 'all') pool = P.filter(p => p.themes.includes(this.theme) || (this.theme === 'mateIn3' && p.themes.some(t => /^mateIn[3-9]/.test(t))));
    if (!pool.length) pool = P;
    let cand = pool.filter(p => !solved.has(p.id));
    if (!cand.length) cand = pool;
    if (this.mode === 'rated') {
      const r = store.stats.puzzleRating;
      const near = cand.filter(p => Math.abs(p.rating - r) < 250);
      if (near.length >= 3) cand = near;
      else cand = cand.slice().sort((a, b) => Math.abs(a.rating - r) - Math.abs(b.rating - r)).slice(0, 10);
    }
    return cand[Math.floor(Math.random() * cand.length)];
  }

  next(puzzle) {
    this.load(puzzle || this.pickPuzzle());
  }

  load(p) {
    this.p = p;
    this.step = 0;
    this.failed = false;
    this.hinted = false;
    this.done = false;
    this.chess = new Chess(p.fen);
    this.solver = this.chess.turn() === 'w' ? 'b' : 'w';
    this.board.setOrientation(this.solver);
    this.board.setPosition(p.fen, { lastMove: null });
    this.board.setArrows([]);
    this.board.setBadge(null);
    this.board.clearUserDrawings();
    this.board.setMovable(null);
    this.renderPanel('turn');
    this.later(() => this.playOpponent(), 700);
  }

  playOpponent() {
    const u = this.p.moves[this.step];
    const mv = this.chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    this.board.setPosition(this.chess.fen(), { move: mv, check: this.checkSq() });
    sound.forMove(mv, this.chess);
    this.step++;
    this.board.setMovable(this.solver);
    this.board.setLegalMoves(this.chess.moves({ verbose: true }));
  }

  checkSq() {
    if (!this.chess.inCheck()) return null;
    return this.chess.board().flat().find(x => x && x.type === 'k' && x.color === this.chess.turn())?.square;
  }

  onMove(m) {
    if (this.done) return;
    const expected = this.p.moves[this.step];
    const c = new Chess(this.chess.fen());
    let mv;
    try { mv = c.move(m); } catch { return; }
    const uci = mv.from + mv.to + (mv.promotion || '');
    const correct = uci === expected || (c.isCheckmate());
    if (correct) {
      this.chess = c;
      this.board.setPosition(c.fen(), { move: mv, check: this.checkSq() });
      sound.forMove(mv, c);
      this.step++;
      this.board.setArrows([]);
      this.board.clearUserDrawings();
      if (this.step >= this.p.moves.length || c.isCheckmate()) return this.solved(mv);
      this.board.setBadge(mv.to, classIcon('best', 30));
      this.board.setMovable(null);
      this.renderPanel('good-step');
      this.later(() => { this.board.setBadge(null); this.playOpponent(); this.renderPanel('turn'); }, 500);
    } else {
      sound.play('wrong');
      this.board.setPosition(c.fen(), { move: mv });
      this.board.setBadge(mv.to, classIcon('blunder', 30));
      this.board.setMovable(null);
      this.failMove();
    }
  }

  failMove() {
    if (this.mode === 'rush') {
      this.rush.results.push(false);
      this.rush.strikes++;
      this.renderRush();
      if (this.rush.strikes >= 3) return this.endRush();
      this.later(() => this.nextRush(), 700);
      return;
    }
    if (!this.failed) {
      this.failed = true;
      if (this.mode === 'rated') this.applyRating(false);
    }
    this.renderPanel('bad');
  }

  solved() {
    this.done = true;
    this.board.setMovable(null);
    sound.play('correct');
    if (this.mode === 'rush') {
      this.rush.results.push(true);
      this.rush.score++;
      this.renderRush();
      this.later(() => this.nextRush(), 400);
      return;
    }
    const last = this.p.moves[this.p.moves.length - 1];
    this.board.setBadge(last.slice(2, 4), classIcon('best', 30));
    if (!this.failed) {
      if (this.mode === 'rated') this.applyRating(true);
      store.updateStats(s => { if (!s.solved.includes(this.p.id)) s.solved.push(this.p.id); s.puzzleStreak = (s.puzzleStreak || 0) + 1; });
    }
    this.renderPanel('solved');
  }

  applyRating(win) {
    const R = store.stats.puzzleRating, Rp = this.p.rating;
    const exp = 1 / (1 + Math.pow(10, (Rp - R) / 400));
    const d = Math.round(28 * ((win ? 1 : 0) - exp));
    this.lastDelta = d;
    store.updateStats(s => { s.puzzleRating = Math.max(100, s.puzzleRating + d); if (!win) s.puzzleStreak = 0; });
  }

  renderPanel(state) {
    if (this.mode === 'rush') return this.renderRush();
    const p = this.p;
    const color = this.solver === 'w' ? 'White' : 'Black';
    const st = store.stats;
    let status = '';
    if (state === 'turn') status = `<div class="puzzle-status turn"><h3><span class="turn-dot ${this.solver}"></span> Your turn</h3><div class="muted">Find the best move for ${color}.</div></div>`;
    if (state === 'good-step') status = `<div class="puzzle-status good"><h3>${classIcon('best', 24)} Best move!</h3><div>Keep going…</div></div>`;
    if (state === 'bad') status = `<div class="puzzle-status bad"><h3>${classIcon('blunder', 24)} Incorrect</h3><div>${this.mode === 'rated' && this.lastDelta != null ? `Rating ${this.lastDelta}` : 'Try again!'}</div></div>`;
    if (state === 'solved') status = `<div class="puzzle-status good"><h3>${classIcon('brilliant', 24)} ${this.failed ? 'Solved (with help)' : 'Solved!'}</h3><div>${this.mode === 'rated' && !this.failed ? `Rating +${this.lastDelta}` : esc(say(this.coach, 'liveBest'))}</div></div>`;
    const themeLabel = p.themes.map(t => (THEMES.find(x => x[0] === t) || [t, t])[1]).join(' · ');
    this.$('#pbody').innerHTML = `${status}
      <div class="coach-box" style="border:0;padding:0 0 12px">${avatar(this.coach.avatar, 44)}<div class="bubble">${esc(state === 'turn' ? (p.themes.includes('mate') ? 'There\'s a checkmate here. Can you find it?' : say(this.coach, 'tip')) : state === 'bad' ? 'Not quite. Look at checks, captures and threats.' : state === 'solved' ? 'Excellent work!' : 'Good!')}</div></div>
      ${this.mode === 'themes' ? `<div class="theme-chips" style="margin-bottom:12px">${THEMES.map(([k, l]) => `<button class="chip ${this.theme === k ? 'active' : ''}" data-t="${k}">${l}</button>`).join('')}</div>` : ''}
      <div class="stat-row" style="margin:0">
        <div class="stat"><b>${st.puzzleRating}</b><span>Your rating</span></div>
        <div class="stat"><b>${state === 'solved' || state === 'bad' ? p.rating : '?'}</b><span>Puzzle rating</span></div>
        <div class="stat"><b>${st.puzzleStreak || 0}🔥</b><span>Streak</span></div>
      </div>
      <p class="muted" style="font-size:13px">${[state === 'solved' || state === 'bad' ? esc(themeLabel) : '', `Puzzle ${p.id}`, `${st.solved.length} solved`].filter(Boolean).join(' · ')}</p>`;
    this.$('#pbody').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { this.theme = b.dataset.t; this.next(); });
    const foot = this.$('#pfoot');
    if (state === 'bad') foot.innerHTML = `<button class="btn" data-f="retry">↩️ Retry</button><button class="btn" data-f="solution">👁 Solution</button><button class="btn primary" style="font-size:15px;padding:10px 18px" data-f="next">Next ▶</button>`;
    else if (state === 'solved') foot.innerHTML = `<button class="btn" data-f="analyse">🔍 Analyse</button><button class="btn primary" style="font-size:15px;padding:10px 18px" data-f="next">Next Puzzle ▶</button>`;
    else foot.innerHTML = `<button class="btn" data-f="hint">💡 Hint</button><button class="btn" data-f="solution">👁 Solution</button><button class="btn" data-f="skip">Skip ⏭</button>`;
    foot.querySelectorAll('[data-f]').forEach(b => b.onclick = () => this.footAction(b.dataset.f));
  }

  footAction(a) {
    if (a === 'next' || a === 'skip') {
      if (a === 'skip' && this.mode === 'rated' && !this.failed && this.step > 0) { this.applyRating(false); }
      return this.next();
    }
    if (a === 'retry') {
      // rewind to the position before the wrong move
      this.board.setPosition(this.chess.fen(), { lastMove: null, check: this.checkSq() });
      this.board.setBadge(null);
      this.board.setMovable(this.solver);
      this.board.setLegalMoves(this.chess.moves({ verbose: true }));
      this.renderPanel('turn');
      return;
    }
    if (a === 'hint') {
      const u = this.p.moves[this.step];
      if (!u) return;
      if (!this.hinted) { this.hinted = true; this.board.marks = { [u.slice(0, 2)]: 'green' }; this.board.renderMarks(); }
      else this.board.setArrows([{ from: u.slice(0, 2), to: u.slice(2, 4), color: 'hint' }]);
      if (!this.failed && this.mode === 'rated') { this.failed = true; this.applyRating(false); }
      return;
    }
    if (a === 'solution') return this.showSolution();
    if (a === 'analyse') {
      const c = new Chess(this.p.fen);
      const sans = this.p.moves.map(u => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
      go('analysis', { startFen: this.p.fen, moves: sans });
    }
  }

  async showSolution() {
    if (!this.failed && this.mode === 'rated') { this.failed = true; this.applyRating(false); }
    this.board.setMovable(null);
    this.done = true;
    // replay from current step
    this.board.setPosition(this.chess.fen(), { lastMove: null });
    this.board.setBadge(null);
    for (let i = this.step; i < this.p.moves.length; i++) {
      await new Promise(r => this.later(r, 650));
      const u = this.p.moves[i];
      const mv = this.chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      this.board.setPosition(this.chess.fen(), { move: mv, check: this.checkSq() });
      sound.forMove(mv, this.chess);
    }
    this.step = this.p.moves.length;
    this.renderPanel('solved');
  }

  // ---------- Puzzle Rush ----------
  rushIntro() {
    this.board.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { lastMove: null });
    this.board.setMovable(null);
    this.$('#pbody').innerHTML = `<div style="text-align:center;padding:20px 0">
      <div style="font-size:64px">⚡</div><h2 style="margin:6px 0">Puzzle Rush</h2>
      <p class="muted">Solve as many puzzles as you can in <b>3 minutes</b>. Puzzles get harder as you go. Three mistakes and you're out!</p>
      <div class="stat-row" style="justify-content:center"><div class="stat"><b>${store.stats.rushBest}</b><span>Personal best</span></div></div>
      <button class="btn primary big" id="rush-go">Start Rush</button></div>`;
    this.$('#pfoot').innerHTML = '';
    this.$('#rush-go').onclick = () => this.startRush();
  }

  startRush() {
    const sorted = P.slice().sort((a, b) => a.rating - b.rating);
    this.rush = { score: 0, strikes: 0, results: [], end: performance.now() + 180000, list: sorted, idx: 0 };
    this.rushTimer = setInterval(() => {
      const left = this.rush.end - performance.now();
      const el = this.$('#rush-clock');
      if (el) el.textContent = fmtClock(left);
      if (left <= 0) this.endRush();
    }, 200);
    sound.play('start');
    this.nextRush();
  }

  nextRush() {
    if (!this.rush || this.rush.over) return;
    const r = this.rush;
    // progress through difficulty: pick from a window that moves up with the score
    const n = r.list.length;
    const center = Math.min(n - 1, Math.floor((r.score / 30) * n));
    const lo = Math.max(0, center - 8), hi = Math.min(n, center + 8);
    const p = r.list[lo + Math.floor(Math.random() * (hi - lo))];
    this.load(p);
  }

  renderRush() {
    const r = this.rush;
    if (!r) return;
    this.$('#pbody').innerHTML = `
      <div class="row" style="justify-content:space-between;margin-bottom:10px"><div class="clock active" id="rush-clock" style="opacity:1">${fmtClock(r.end - performance.now())}</div>
      <div class="rush-strikes">${[0, 1, 2].map(i => i < r.strikes ? '❌' : '⚪').join('')}</div></div>
      <div class="rush-score">${r.score}</div><div class="muted" style="text-align:center;margin-bottom:12px">solved</div>
      <div class="puzzle-status turn"><h3><span class="turn-dot ${this.solver}"></span> ${this.solver === 'w' ? 'White' : 'Black'} to move</h3></div>
      <div class="rush-list">${r.results.map((ok, i) => `<span class="${ok ? 'ok' : 'no'}">${i + 1}</span>`).join('')}</div>`;
    this.$('#pfoot').innerHTML = `<button class="btn danger" id="rush-stop">⏹ End run</button>`;
    this.$('#rush-stop').onclick = () => this.endRush();
  }

  endRush() {
    const r = this.rush;
    if (!r || r.over) return;
    r.over = true;
    clearInterval(this.rushTimer);
    this.board.setMovable(null);
    const best = r.score > store.stats.rushBest;
    if (best) { store.updateStats(s => { s.rushBest = r.score; }); confetti(); }
    sound.play('end');
    this.$('#pbody').innerHTML = `<div style="text-align:center;padding:10px 0"><h2 style="margin:0">Run over!</h2>
      <div class="rush-score" style="margin:12px 0">${r.score}</div>
      <p>${best ? '🏆 New personal best!' : `Personal best: ${store.stats.rushBest}`}</p>
      <div class="rush-list">${r.results.map((ok, i) => `<span class="${ok ? 'ok' : 'no'}">${i + 1}</span>`).join('')}</div></div>`;
    this.$('#pfoot').innerHTML = `<button class="btn primary" id="again" style="font-size:16px">⚡ Play again</button>`;
    this.$('#again').onclick = () => this.startRush();
  }

  later(fn, ms) { const t = setTimeout(fn, ms); this.timers.push(t); return t; }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; clearInterval(this.rushTimer); if (this.rush) this.rush.over = true; this.rush = null; }
  destroy() { this.clearTimers(); }
}
