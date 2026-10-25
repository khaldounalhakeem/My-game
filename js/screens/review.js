// Game Review: analyse with Stockfish, then summary + step-by-step coach review.
import { Chess } from '../../vendor/chess.js';
import { store } from '../storage.js';
import { go } from '../app.js';
import { Board } from '../board.js';
import { getEngine, scoreToCp, formatScore } from '../engine.js';
import { analyseGame, classifyGame, CLASSES, CLASS_ORDER, classIcon, winPct, pvToSan, uciToSan } from '../review.js';
import { explainReviewedMove } from '../explain.js';
import { coachById, say } from '../coaches.js';
import { botById } from '../bots.js';
import { sound } from '../sound.js';
import { $, esc, avatar, playerAvatarSpec, renderMoveList, toast, evalBarHtml, updateEvalBar, renderGraph, capturedHtml } from '../ui.js';

const CACHE_PREFIX = 'chesshub.review.';

function loadCache(id) { try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + id)); } catch { return null; } }
function saveCache(id, data) {
  try { localStorage.setItem(CACHE_PREFIX + id, JSON.stringify(data)); }
  catch {
    // storage full: drop old review caches and retry once
    try { Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).slice(0, 10).forEach(k => localStorage.removeItem(k)); localStorage.setItem(CACHE_PREFIX + id, JSON.stringify(data)); } catch { /* give up */ }
  }
}

export function render(main, { params, payload }) {
  let game = null;
  if (params[0]) game = store.games.find(g => g.id === params[0]);
  if (!game && payload) game = payload;
  if (!game) { main.innerHTML = '<div class="page"><h1>Game not found</h1><p class="muted">Pick a game from My Games, or paste a PGN on the Analysis page.</p><button class="btn" data-go2="archive">My Games</button></div>'; main.querySelector('[data-go2]').onclick = () => go('archive'); return; }
  const r = new Review(main, game);
  return () => r.destroy();
}

class Review {
  constructor(main, game) {
    this.main = main;
    this.game = game;
    this.coach = coachById(store.settings.coachId);
    this.engine = getEngine('analysis');
    this.view = -1;
    this.mode = 'summary';
    this.build();
    this.start();
    this.keyHandler = e => this.onKey(e);
    document.addEventListener('keydown', this.keyHandler);
  }

  playerInfo(color) {
    const g = this.game;
    const name = color === 'w' ? g.white : g.black;
    const isMe = g.mode === 'bot' && g.playerColor === color;
    const bot = g.botId ? botById(g.botId) : null;
    if (isMe) return { name, av: playerAvatarSpec(), rating: null };
    if (bot && g.playerColor !== color) return { name, av: bot.avatar, rating: bot.rating };
    return { name: name || (color === 'w' ? 'White' : 'Black'), av: color === 'w' ? { bg: '#ddd', skin: '#f1c27d', hair: '#4a2f1b', shirt: '#fff' } : { bg: '#333', skin: '#c68642', hair: '#111', shirt: '#222', hairStyle: 'curly' } };
  }

  build() {
    this.main.innerHTML = `<div class="play-layout">
      <div class="board-col">
        <div class="player-bar" id="bar-top"></div>
        <div class="board-row">${evalBarHtml()}<div class="board-holder"><div id="board"></div></div></div>
        <div class="player-bar" id="bar-bottom"></div>
      </div>
      <div class="side-panel">
        <div class="panel-head"><div class="title">⭐ Game Review</div><button class="icon-btn" id="flip" title="Flip (F)">⇅</button></div>
        <div class="coach-box">${avatar(this.coach.avatar, 52)}<div class="bubble" id="bubble"></div></div>
        <div class="panel-body" id="body"></div>
        <div class="nav-controls hidden" id="navc">
          <button class="icon-btn" data-nav="first">⏮</button><button class="icon-btn" data-nav="prev">◀</button>
          <button class="icon-btn" data-nav="next">▶</button><button class="icon-btn" data-nav="last">⏭</button>
        </div>
        <div class="panel-foot" id="foot"></div>
      </div></div>`;
    this.$ = s => $(s, this.main);
    this.board = new Board(this.$('#board'), { orientation: this.game.playerColor || 'w', onMove: m => this.onBoardMove(m) });
    this.board.setMovable(null);
    this.$('#flip').onclick = () => { this.board.flip(); this.show(); };
    this.main.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => this.nav(b.dataset.nav));
  }

  async start() {
    const g = this.game;
    const c = new Chess(g.startFen || undefined);
    this.startFen = c.fen();
    this.board.setPosition(this.startFen);
    this.renderBars();
    const cached = g.id ? loadCache(g.id) : null;
    const depth = store.settings.reviewDepth;
    if (cached && cached.depth >= depth && cached.n === g.moves.length) {
      this.data = this.rebuild(cached);
    } else {
      this.$('#bubble').innerHTML = `<div class="headline">${esc(say(this.coach, 'intro'))}</div>Analyzing your game with Stockfish 19…`;
      this.$('#body').innerHTML = `<div class="review-progress"><div id="prog"></div></div><div class="muted" id="prog-txt" style="text-align:center">0%</div>`;
      try {
        this.data = await analyseGame(this.engine, this.startFen, g.moves, { depth, onProgress: p => { if (this.destroyed) return; const el = this.$('#prog'); if (el) { el.style.width = (p * 100).toFixed(0) + '%'; this.$('#prog-txt').textContent = (p * 100).toFixed(0) + '%'; } } });
      } catch (e) { if (!this.destroyed) { console.error(e); this.$('#body').innerHTML = '<p>Analysis failed. Make sure the page is served over http(s) so the engine can load.</p>'; } return; }
      if (this.destroyed) return;
      if (g.id) {
        const compact = { depth, n: g.moves.length, evals: this.data.evals.map(e => ({ s: e.score, t: e.terminal ? 1 : 0, m: e.mate, b: e.best, l: (e.lines || []).map(l => ({ cp: l.cp, mate: l.mate, pv: l.pv.slice(0, 10) })) })) };
        saveCache(g.id, compact);
        const me = g.playerColor || 'w';
        store.updateGame(g.id, { accuracy: this.data.summary[me].accuracy, reviewed: true });
      }
    }
    this.moves = this.data.moves;
    sound.play('notify');
    this.showSummary();
  }

  rebuild(cached) {
    const c = new Chess(this.startFen);
    const fens = [c.fen()], verbose = [];
    for (const m of this.game.moves) { const mv = c.move(m); verbose.push(mv); fens.push(c.fen()); }
    const evals = cached.evals.map(e => ({ score: e.s, terminal: !!e.t, mate: e.m, best: e.b, lines: e.l }));
    return classifyGame(this.startFen, fens, verbose, evals);
  }

  renderBars() {
    const flipped = this.board.flipped;
    const c = new Chess(this.fenAt(this.view));
    for (const [id, color] of [['#bar-top', flipped ? 'w' : 'b'], ['#bar-bottom', flipped ? 'b' : 'w']]) {
      const p = this.playerInfo(color);
      const acc = this.data?.summary?.[color]?.accuracy;
      this.$(id).innerHTML = `${avatar(p.av, 40)}<div class="player-info"><div class="player-name">${esc(p.name)} ${p.rating ? `<span class="rating">(${p.rating})</span>` : ''}</div><div class="captured">${capturedHtml(c, color, this.startFen)}</div></div>${acc != null ? `<span class="acc-box ${color === 'b' ? 'black' : ''}" style="font-size:16px;padding:4px 10px">${acc.toFixed(1)}</span>` : ''}`;
    }
  }

  fenAt(i) { return i < 0 ? this.startFen : (this.moves ? this.moves[i].fenAfter : this.startFen); }

  // ---------- Summary ----------
  showSummary() {
    this.mode = 'summary';
    this.view = -1;
    const s = this.data.summary;
    const g = this.game;
    const me = g.mode === 'bot' ? g.playerColor : null;
    const W = this.playerInfo('w'), B = this.playerInfo('b');
    const outcomeKey = me ? (g.outcome === 'win' ? 'win' : g.outcome === 'loss' ? 'lose' : 'draw') : 'intro';
    let speech = say(this.coach, outcomeKey);
    if (me) speech += ` You played with ${s[me].accuracy.toFixed(1)}% accuracy — about ${s[me].rating} level this game.`;
    else speech += ` White: ${s.w.accuracy.toFixed(1)}%, Black: ${s.b.accuracy.toFixed(1)}%.`;
    const best = this.moves.filter(m => m.color === (me || 'w') && (m.cls === 'brilliant' || m.cls === 'great'));
    if (best.length) speech += ` I loved ${best[0].san}${best.length > 1 ? ' and a few others' : ''}!`;
    this.$('#bubble').innerHTML = `<div class="headline">${esc(this.coach.name)}</div>${esc(speech)}`;
    const phaseIcon = v => v == null ? '<span class="muted">—</span>' : classIcon(v >= 90 ? 'best' : v >= 80 ? 'excellent' : v >= 70 ? 'good' : v >= 60 ? 'inaccuracy' : v >= 50 ? 'mistake' : 'blunder', 26);
    this.$('#body').innerHTML = `<div class="review-summary">
      <svg class="graph" id="graph"></svg>
      <div class="acc-row">
        <div>${avatar(W.av, 54)}<div style="font-weight:700;font-size:13px">${esc(W.name)}</div></div>
        <div class="acc-label">Players</div>
        <div>${avatar(B.av, 54)}<div style="font-weight:700;font-size:13px">${esc(B.name)}</div></div>
      </div>
      <div class="acc-row"><div><span class="acc-box">${s.w.accuracy.toFixed(1)}</span></div><div class="acc-label">Accuracy</div><div><span class="acc-box black">${s.b.accuracy.toFixed(1)}</span></div></div>
      <div class="cls-table">${CLASS_ORDER.map(k => `<span class="name">${CLASSES[k].label}</span><span class="c" style="color:${CLASSES[k].color}">${s.w.counts[k]}</span>${classIcon(k, 24)}<span class="c" style="color:${CLASSES[k].color}">${s.b.counts[k]}</span>`).join('')}</div>
      <div class="acc-row"><div><span class="acc-box" style="font-size:18px">${s.w.rating}</span></div><div class="acc-label">Game Rating</div><div><span class="acc-box black" style="font-size:18px">${s.b.rating}</span></div></div>
      ${['opening', 'middlegame', 'endgame'].map(ph => `<div class="phase-row"><div>${phaseIcon(s.w.phases[ph])}</div><div class="ph">${ph[0].toUpperCase() + ph.slice(1)}</div><div>${phaseIcon(s.b.phases[ph])}</div></div>`).join('')}
      <button class="btn primary big" id="start-review">Start Review</button>
    </div>`;
    renderGraph(this.$('#graph'), this.data.evals.map(e => e.score), null, this.moves.map(m => m.cls), i => { this.mode = 'step'; this.goto(i); });
    this.$('#start-review').onclick = () => { this.mode = 'step'; this.goto(0); };
    this.$('#navc').classList.add('hidden');
    this.$('#foot').innerHTML = `<button class="btn" id="b-moves">📋 Move list</button><button class="btn" id="b-analyse">🔍 Analyse</button><button class="btn" id="b-pgn">📄 PGN</button>`;
    this.$('#b-moves').onclick = () => { this.mode = 'step'; this.goto(this.moves.length - 1); };
    this.$('#b-analyse').onclick = () => go('analysis', { startFen: this.startFen, moves: this.game.moves });
    this.$('#b-pgn').onclick = () => { navigator.clipboard?.writeText(this.game.pgn || this.game.moves.join(' ')).then(() => toast('PGN copied')); };
    this.board.setPosition(this.startFen, { lastMove: null });
    this.board.setMovable(null);
    this.board.setArrows([]);
    this.board.setBadge(null);
    updateEvalBar(this.$('.evalbar'), this.data.evals[0].score, this.board.flipped);
    this.renderBars();
  }

  // ---------- Step mode ----------
  goto(i, animate = false) {
    this.retry = null;
    this.view = Math.max(-1, Math.min(this.moves.length - 1, i));
    this.show(animate);
  }

  show(animate = false) {
    if (this.mode === 'summary') { this.renderBars(); return; }
    const i = this.view;
    const m = i >= 0 ? this.moves[i] : null;
    const fen = this.fenAt(i);
    const c = new Chess(fen);
    const check = c.inCheck() ? c.board().flat().find(p => p && p.type === 'k' && p.color === c.turn())?.square : null;
    const verbose = m && animate ? new Chess(m.fenBefore).move(m.uci.length > 4 ? { from: m.from, to: m.to, promotion: m.uci[4] } : { from: m.from, to: m.to }) : null;
    this.board.setPosition(fen, { move: verbose, lastMove: m ? [m.from, m.to] : null, check, animate });
    // Free exploration from any reviewed position
    this.explore = null;
    this.board.setMovable('both');
    this.board.setLegalMoves(c.moves({ verbose: true }));
    this.board.setBadge(m ? m.to : null, m ? classIcon(m.cls, 30) : '');
    const arrows = [];
    if (m && m.bestUci && m.uci !== m.bestUci && !['book', 'best', 'forced'].includes(m.cls)) arrows.push({ from: m.bestUci.slice(0, 2), to: m.bestUci.slice(2, 4), color: 'best' });
    this.board.setArrows(arrows);
    updateEvalBar(this.$('.evalbar'), this.data.evals[i + 1].lines?.[0] || this.data.evals[i + 1].score, this.board.flipped);
    if (this.data.evals[i + 1].terminal) updateEvalBar(this.$('.evalbar'), this.data.evals[i + 1].score, this.board.flipped);
    this.renderBars();
    this.renderBubble(m);
    this.renderStepBody();
  }

  renderBubble(m) {
    const b = this.$('#bubble');
    if (!m) { b.innerHTML = `<div class="headline">Starting position</div>Press ▶ or use the → key to step through the game.`; return; }
    const C = CLASSES[m.cls];
    const exp = explainReviewedMove(m);
    const ev = this.data.evals[m.ply + 1];
    const evTxt = ev.terminal ? (ev.mate === 0 ? 'Checkmate' : 'Draw') : formatScore(ev.lines[0]);
    let html = `<div class="headline">${classIcon(m.cls, 22)}<span style="color:${C.color === '#81b64c' ? '#5c8a2c' : C.color}">${esc(say(this.coach, m.cls, { move: m.san }) || `${m.san} is ${C.label.toLowerCase()}`)}</span><span style="margin-left:auto;background:${ev.score >= 0 ? '#eee' : '#403d39'};color:${ev.score >= 0 ? '#222' : '#fff'};padding:1px 7px;border-radius:4px;font-size:13px">${evTxt}</span></div>`;
    const lines = [exp.what, exp.why].filter(Boolean).join(' ');
    if (lines) html += `<div>${esc(lines)}</div>`;
    if (exp.better) html += `<div class="sub" style="margin-top:4px">${esc(exp.better)}</div>`;
    const bad = ['inaccuracy', 'mistake', 'miss', 'blunder'].includes(m.cls);
    html += `<div class="actions">`;
    if (m.bestUci && m.uci !== m.bestUci && m.cls !== 'book') html += `<button class="btn" data-b="best">★ Best</button>`;
    if (bad) html += `<button class="btn go" data-b="retry">↩️ Retry</button>`;
    if (m.pvAfter?.length) html += `<button class="btn" data-b="follow">▶ Show follow-up</button>`;
    html += `</div>`;
    b.innerHTML = html;
    b.querySelectorAll('[data-b]').forEach(x => x.onclick = () => this.bubbleAction(x.dataset.b, m));
  }

  async bubbleAction(a, m) {
    this.board.setMovable(null);
    if (a === 'best') {
      const c = new Chess(m.fenBefore);
      const mv = c.move({ from: m.bestUci.slice(0, 2), to: m.bestUci.slice(2, 4), promotion: m.bestUci[4] });
      this.board.setPosition(m.fenBefore, { lastMove: null });
      setTimeout(() => { this.board.setPosition(c.fen(), { move: mv }); sound.forMove(mv, c); this.board.setBadge(mv.to, classIcon('best', 30)); this.board.setArrows([]); }, 250);
      const line = pvToSan(m.fenBefore, m.pvBefore, 8).join(' ');
      this.$('#bubble').innerHTML = `<div class="headline">${classIcon('best', 22)} ${esc(m.bestSan)} is best</div>${esc(explainReviewedMove(m).better || '')}${line ? `<div class="line">${esc(line)}</div>` : ''}<div class="actions"><button class="btn" data-b="back">⬅ Back to game</button></div>`;
      this.$('#bubble [data-b=back]').onclick = () => this.show();
    } else if (a === 'retry') {
      this.retry = m;
      this.board.setPosition(m.fenBefore, { lastMove: m.ply > 0 ? [this.moves[m.ply - 1].from, this.moves[m.ply - 1].to] : null });
      this.board.setArrows([]);
      this.board.setBadge(null);
      const c = new Chess(m.fenBefore);
      this.board.setMovable(m.color);
      this.board.setLegalMoves(c.moves({ verbose: true }));
      this.$('#bubble').innerHTML = `<div class="headline">↩️ Retry</div>Find a better move for ${m.color === 'w' ? 'White' : 'Black'}.<div class="actions"><button class="btn" data-b="sol">Show solution</button><button class="btn" data-b="back">Cancel</button></div>`;
      this.$('#bubble [data-b=sol]').onclick = () => this.bubbleAction('best', m);
      this.$('#bubble [data-b=back]').onclick = () => this.show();
    } else if (a === 'follow') {
      const pv = m.pvAfter.slice(0, 8);
      const c = new Chess(m.fenAfter);
      const token = this.followToken = Symbol();
      this.board.setArrows([]);
      for (const u of pv) {
        await new Promise(r => setTimeout(r, 700));
        if (this.followToken !== token || this.destroyed) return;
        let mv; try { mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; }
        this.board.setPosition(c.fen(), { move: mv });
        this.board.setBadge(null);
        sound.forMove(mv, c);
      }
      this.$('#bubble .actions').insertAdjacentHTML('beforeend', '<button class="btn" data-b="back2">⬅ Back</button>');
      this.$('#bubble [data-b=back2]').onclick = () => this.show();
    }
  }

  async exploreMove(mv) {
    if (!this.explore) this.explore = { chess: new Chess(this.fenAt(this.view)), sans: [] };
    const c = this.explore.chess;
    let played;
    try { played = c.move(mv); } catch { return; }
    this.explore.sans.push(played.san);
    this.board.setPosition(c.fen(), { move: played, check: c.inCheck() ? c.board().flat().find(p => p && p.type === 'k' && p.color === c.turn())?.square : null });
    this.board.setLegalMoves(c.moves({ verbose: true }));
    this.board.setArrows([]);
    this.board.setBadge(null);
    sound.forMove(played, c);
    const line = this.explore.sans.join(' ');
    const fen = c.fen();
    this.$('#bubble').innerHTML = `<div class="headline">🔍 Exploring</div><div class="line">${esc(line)}</div><div class="sub">Evaluating…</div><div class="actions"><button class="btn" data-b="back">⬅ Back to game</button></div>`;
    this.$('#bubble [data-b=back]').onclick = () => this.show();
    if (c.isGameOver()) { this.$('#bubble .sub').textContent = c.isCheckmate() ? 'Checkmate!' : 'Draw.'; return; }
    const res = await this.engine.analyse(fen, { depth: 13, exclusive: true });
    if (!this.explore || this.explore.chess.fen() !== fen || !res?.lines[0]) return;
    const best = uciToSan(fen, res.bestmove);
    this.$('#bubble .sub').innerHTML = `Evaluation <b>${formatScore(res.lines[0])}</b> · best reply ${esc(best || '')}`;
    updateEvalBar(this.$('.evalbar'), res.lines[0], this.board.flipped);
    if (res.bestmove) this.board.setArrows([{ from: res.bestmove.slice(0, 2), to: res.bestmove.slice(2, 4), color: 'engine', opacity: 0.6 }]);
  }

  async onBoardMove(mv) {
    const m = this.retry;
    if (!m) return this.exploreMove(mv);
    const c = new Chess(m.fenBefore);
    let played;
    try { played = c.move(mv); } catch { return; }
    this.board.setPosition(c.fen(), { move: played });
    sound.forMove(played, c);
    this.board.setMovable(null);
    const uci = played.from + played.to + (played.promotion || '');
    let good = uci === m.bestUci || c.isCheckmate();
    if (!good) {
      this.$('#bubble').innerHTML = `<div class="headline">Checking ${esc(played.san)}…</div>`;
      const res = await this.engine.analyse(c.fen(), { depth: 12 });
      const sc = res?.lines[0] ? scoreToCp(res.lines[0]) : 0;
      const sign = m.color === 'w' ? 1 : -1;
      const w = sign === 1 ? winPct(sc) : 100 - winPct(sc);
      good = m.winBefore - w < 4;
    }
    if (this.retry !== m) return;
    if (good) {
      sound.play('correct');
      this.board.setBadge(played.to, classIcon(uci === m.bestUci ? 'best' : 'excellent', 30));
      this.$('#bubble').innerHTML = `<div class="headline">${classIcon('best', 22)} ${esc(played.san)} — that's it!</div>${esc(say(this.coach, 'liveBest'))}<div class="actions"><button class="btn go" data-b="next">Next ▶</button></div>`;
      this.$('#bubble [data-b=next]').onclick = () => this.goto(m.ply + 1, true);
    } else {
      sound.play('wrong');
      this.board.setBadge(played.to, classIcon('mistake', 30));
      this.$('#bubble').innerHTML = `<div class="headline">${classIcon('mistake', 22)} ${esc(played.san)} isn't the best</div>Try again!<div class="actions"><button class="btn go" data-b="again">↩️ Try again</button><button class="btn" data-b="sol">Show solution</button></div>`;
      this.$('#bubble [data-b=again]').onclick = () => this.bubbleAction('retry', m);
      this.$('#bubble [data-b=sol]').onclick = () => this.bubbleAction('best', m);
    }
  }

  renderStepBody() {
    const km = this.data.summary.keyMoments;
    const me = this.game.mode === 'bot' ? this.game.playerColor : null;
    this.$('#body').innerHTML = `<svg class="graph" id="graph" style="height:70px;margin-bottom:10px"></svg>
      <div id="mlist"></div>
      ${km.length ? `<div style="margin-top:12px"><div class="acc-label" style="margin-bottom:6px">Key moments</div><div class="key-moments">${km.map(i => `<button class="chip" data-k="${i}">${classIcon(this.moves[i].cls, 14)} ${Math.floor(i / 2) + 1}${i % 2 ? '…' : '.'} ${esc(this.moves[i].san)}</button>`).join('')}</div></div>` : ''}`;
    renderGraph(this.$('#graph'), this.data.evals.map(e => e.score), this.view, this.moves.map(m => m.cls), i => this.goto(i));
    renderMoveList(this.$('#mlist'), this.moves.map(m => ({ san: m.san, color: m.color, cls: m.cls })), this.view, i => this.goto(i), { startPly: this.startPly() });
    this.$('#body').querySelectorAll('[data-k]').forEach(b => b.onclick = () => this.goto(+b.dataset.k));
    this.$('#navc').classList.remove('hidden');
    const nextBad = this.moves.findIndex((m, j) => j > this.view && (!me || m.color === me) && ['inaccuracy', 'mistake', 'miss', 'blunder'].includes(m.cls));
    this.$('#foot').innerHTML = `<button class="btn" id="b-sum">📊 Summary</button>${nextBad >= 0 ? '<button class="btn" id="b-nextbad">⏭ Next mistake</button>' : ''}<button class="btn primary" style="font-size:15px;padding:10px 18px" id="b-next">Next ▶</button>`;
    this.$('#b-sum').onclick = () => this.showSummary();
    if (nextBad >= 0) this.$('#b-nextbad').onclick = () => this.goto(nextBad);
    this.$('#b-next').onclick = () => this.nav('next');
  }

  startPly() { const p = this.startFen.split(' '); return (+p[5] - 1) * 2 + (p[1] === 'b' ? 1 : 0); }

  nav(where) {
    if (this.mode === 'summary') { this.mode = 'step'; }
    const last = this.moves.length - 1;
    let v = this.view;
    if (where === 'first') v = -1;
    if (where === 'prev') v = Math.max(-1, v - 1);
    if (where === 'next') v = Math.min(last, v + 1);
    if (where === 'last') v = last;
    const anim = where === 'next' && v !== this.view;
    this.goto(v, anim);
    if (anim && v >= 0) { const m = this.moves[v]; const c = new Chess(m.fenBefore); const mv = c.move(m.san); sound.forMove(mv, c); }
  }

  onKey(e) {
    if (e.target.matches('input, textarea, select')) return;
    if (!this.moves) return;
    const map = { ArrowLeft: 'prev', ArrowRight: 'next', ArrowUp: 'first', ArrowDown: 'last' };
    if (map[e.key]) { e.preventDefault(); this.nav(map[e.key]); }
    if (e.key === 'f') { this.board.flip(); this.show(); }
  }

  destroy() {
    this.destroyed = true;
    this.followToken = null;
    document.removeEventListener('keydown', this.keyHandler);
    this.engine.stopAll();
  }
}
