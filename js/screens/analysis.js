// Analysis board: free play for both sides, Stockfish lines, PGN/FEN import & export.
import { Chess, validateFen } from '../../vendor/chess.js';
import { go } from '../app.js';
import { Board } from '../board.js';
import { getEngine, formatScore, scoreToCp } from '../engine.js';
import { openingFor, pvToSan } from '../review.js';
import { sound } from '../sound.js';
import { $, esc, renderMoveList, toast, evalBarHtml, updateEvalBar, toggle, modal } from '../ui.js';

export function render(main, { payload }) {
  const a = new Analysis(main, payload || {});
  return () => a.destroy();
}

class Analysis {
  constructor(main, payload) {
    this.main = main;
    this.engine = getEngine('analysis');
    this.engineOn = true;
    this.multipv = 3;
    this.load(payload.startFen, payload.moves || []);
    this.build();
    this.view = this.moves.length - 1;
    this.show();
    this.keyHandler = e => this.onKey(e);
    document.addEventListener('keydown', this.keyHandler);
    if (payload.reviewPrompt) this.importDialog(true);
  }

  load(startFen, moves) {
    const c = new Chess(startFen || undefined);
    this.startFen = c.fen();
    this.moves = [];
    for (const m of moves) { let mv; try { mv = c.move(m); } catch { break; } this.moves.push(mv); }
  }

  build() {
    this.main.innerHTML = `<div class="play-layout">
      <div class="board-col">
        <div class="board-row" style="margin-top:6px">${evalBarHtml()}<div class="board-holder"><div id="board"></div></div></div>
      </div>
      <div class="side-panel">
        <div class="panel-head"><div class="title">🔍 Analysis</div>
          <label class="switch" title="Engine on/off"><input type="checkbox" id="eng" checked><span></span></label></div>
        <div class="engine-lines" id="lines" style="padding:6px 10px;border-bottom:1px solid var(--line);min-height:40px"></div>
        <div class="opening-name" id="opening"></div>
        <div class="panel-body"><div id="moves"></div></div>
        <div class="nav-controls">
          <button class="icon-btn" data-nav="first">⏮</button><button class="icon-btn" data-nav="prev">◀</button>
          <button class="icon-btn" data-nav="next">▶</button><button class="icon-btn" data-nav="last">⏭</button>
        </div>
        <div class="panel-foot">
          <button class="btn small" data-a="import">📥 Import</button>
          <button class="btn small" data-a="export">📤 Export</button>
          <button class="btn small" data-a="flip">⇅ Flip</button>
          <button class="btn small" data-a="undo">↩️ Undo</button>
          <button class="btn small" data-a="reset">🆕 Reset</button>
          <button class="btn small" data-a="review" style="background:var(--green)">⭐ Review</button>
        </div>
      </div></div>`;
    this.$ = s => $(s, this.main);
    this.board = new Board(this.$('#board'), { onMove: m => this.userMove(m), onIllegal: () => sound.play('illegal') });
    this.board.setMovable('both');
    this.$('#eng').onchange = e => { this.engineOn = e.target.checked; this.show(); };
    this.main.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => this.nav(b.dataset.nav));
    this.main.querySelectorAll('[data-a]').forEach(b => b.onclick = () => this.action(b.dataset.a));
  }

  fenAt(i) { return i < 0 ? this.startFen : this.moves[i].after; }

  userMove(m) {
    const c = new Chess(this.fenAt(this.view));
    let mv;
    try { mv = c.move(m); } catch { return; }
    // Making a move from an earlier position truncates the line
    this.moves = this.moves.slice(0, this.view + 1);
    this.moves.push(mv);
    this.view++;
    sound.forMove(mv, c);
    this.show(mv);
  }

  show(animMove) {
    const fen = this.fenAt(this.view);
    const c = new Chess(fen);
    const last = this.view >= 0 ? this.moves[this.view] : null;
    const check = c.inCheck() ? c.board().flat().find(p => p && p.type === 'k' && p.color === c.turn())?.square : null;
    this.board.setPosition(fen, { move: animMove, lastMove: last ? [last.from, last.to] : null, check, animate: !!animMove });
    this.board.setLegalMoves(c.moves({ verbose: true }));
    renderMoveList(this.$('#moves'), this.moves.map(m => ({ san: m.san, color: m.color })), this.view, i => { this.view = i; this.show(); }, { startPly: this.startPly() });
    let op = null;
    for (let i = this.view; i >= -1 && !op; i--) op = openingFor(this.fenAt(i));
    this.$('#opening').innerHTML = op ? `📖 <b>${esc(op[0])}</b>&nbsp;${esc(op[1])}` : '';
    this.runEngine(fen, c);
  }

  startPly() { const p = this.startFen.split(' '); return (+p[5] - 1) * 2 + (p[1] === 'b' ? 1 : 0); }

  runEngine(fen, c) {
    const box = this.$('#lines');
    this.board.setArrows([]);
    this.$('.evalbar').classList.toggle('hidden', !this.engineOn);
    if (!this.engineOn) { box.innerHTML = '<span class="muted">Engine off</span>'; this.engine.stopAll(); return; }
    if (c.isGameOver()) {
      box.innerHTML = `<b>${c.isCheckmate() ? 'Checkmate' : 'Draw'}</b>`;
      updateEvalBar(this.$('.evalbar'), c.isCheckmate() ? (c.turn() === 'w' ? -100000 : 100000) : 0, this.board.flipped);
      this.engine.stopAll();
      return;
    }
    box.innerHTML = '<span class="muted">Stockfish 19 thinking…</span>';
    const token = this.token = Symbol();
    const paint = res => {
      if (this.token !== token || this.destroyed || !res || !res.lines.length) return;
      box.innerHTML = `<div class="muted" style="font-size:11px;padding:2px 4px">Stockfish 19 · depth ${res.depth}</div>` + res.lines.map((l, k) => {
        const san = pvToSan(fen, l.pv, 10);
        const neg = scoreToCp(l) < 0;
        return `<div class="engine-line" data-k="${k}"><span class="score ${neg ? 'neg' : ''}">${formatScore(l)}</span><span class="pv">${esc(san.join(' '))}</span></div>`;
      }).join('');
      box.querySelectorAll('.engine-line').forEach(el => el.onclick = () => {
        const u = res.lines[+el.dataset.k].pv[0];
        this.userMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      });
      updateEvalBar(this.$('.evalbar'), res.lines[0], this.board.flipped);
      this.board.setArrows(res.lines.slice(0, 2).map((l, k) => ({ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), color: 'engine', opacity: k === 0 ? 0.75 : 0.35, width: k === 0 ? 15 : 11 })));
    };
    this.engine.analyse(fen, { depth: 22, multipv: this.multipv, exclusive: true, onInfo: paint }).then(paint);
  }

  nav(where) {
    const last = this.moves.length - 1;
    let v = this.view;
    if (where === 'first') v = -1;
    if (where === 'prev') v = Math.max(-1, v - 1);
    if (where === 'next') v = Math.min(last, v + 1);
    if (where === 'last') v = last;
    const anim = where === 'next' && v !== this.view ? this.moves[v] : null;
    this.view = v;
    if (anim) sound.forMove(anim, new Chess(anim.after));
    this.show(anim);
  }

  action(a) {
    if (a === 'flip') { this.board.flip(); this.show(); }
    if (a === 'undo' && this.moves.length) { this.moves = this.moves.slice(0, this.view); this.view = this.moves.length - 1; this.show(); }
    if (a === 'reset') { this.load(undefined, []); this.view = -1; this.show(); }
    if (a === 'import') this.importDialog(false);
    if (a === 'export') this.exportDialog();
    if (a === 'review') {
      if (!this.moves.length) { toast('Play or import some moves first.'); return; }
      const c = new Chess(this.startFen);
      for (const m of this.moves) c.move(m.san);
      go('review', { startFen: this.startFen, moves: this.moves.map(m => m.san), white: 'White', black: 'Black', playerColor: 'w', mode: 'analysis', pgn: c.pgn() });
    }
  }

  importDialog(reviewAfter) {
    const m = modal({ title: reviewAfter ? '⭐ Game Review' : 'Import', body: `
      <label class="acc-label">Paste a PGN (or a FEN position)</label>
      <textarea id="imp" rows="9" placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ..."></textarea>
      <div class="btn-row"><button class="btn" data-x="load">Load</button>${reviewAfter ? '<button class="btn primary" data-x="review">⭐ Review</button>' : ''}</div>` });
    const ta = $('#imp', m.el);
    setTimeout(() => ta.focus(), 50);
    const doLoad = () => {
      const txt = ta.value.trim();
      if (!txt) return false;
      if (validateFen(txt).ok) { this.load(txt, []); this.view = -1; this.show(); m.close(); return true; }
      try {
        const c = new Chess();
        c.loadPgn(txt);
        const hdr = c.getHeaders();
        const start = hdr.FEN || undefined;
        this.load(start, c.history());
        this.headers = hdr;
        this.view = this.moves.length - 1;
        this.show();
        m.close();
        return true;
      } catch (e) { toast('Could not read that PGN/FEN.'); return false; }
    };
    $('[data-x=load]', m.el).onclick = doLoad;
    const rv = $('[data-x=review]', m.el);
    if (rv) rv.onclick = () => {
      if (!doLoad()) return;
      const h = this.headers || {};
      go('review', { startFen: this.startFen, moves: this.moves.map(x => x.san), white: h.White || 'White', black: h.Black || 'Black', playerColor: 'w', mode: 'import', pgn: ta.value.trim() });
    };
  }

  exportDialog() {
    const c = new Chess(this.startFen);
    for (const mv of this.moves.slice(0, this.view + 1)) c.move(mv.san);
    const full = new Chess(this.startFen);
    for (const mv of this.moves) full.move(mv.san);
    const m = modal({ title: 'Export', body: `
      <label class="acc-label">FEN (current position)</label><input type="text" readonly value="${esc(c.fen())}" id="fen-out">
      <label class="acc-label">PGN</label><textarea rows="7" readonly id="pgn-out">${esc(full.pgn())}</textarea>
      <div class="btn-row"><button class="btn" data-x="fen">Copy FEN</button><button class="btn" data-x="pgn">Copy PGN</button><button class="btn" data-x="dl">Download</button></div>` });
    $('[data-x=fen]', m.el).onclick = () => navigator.clipboard?.writeText(c.fen()).then(() => toast('FEN copied'));
    $('[data-x=pgn]', m.el).onclick = () => navigator.clipboard?.writeText(full.pgn()).then(() => toast('PGN copied'));
    $('[data-x=dl]', m.el).onclick = () => {
      const blob = new Blob([full.pgn()], { type: 'application/x-chess-pgn' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'analysis.pgn'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
  }

  onKey(e) {
    if (e.target.matches('input, textarea, select')) return;
    const map = { ArrowLeft: 'prev', ArrowRight: 'next', ArrowUp: 'first', ArrowDown: 'last' };
    if (map[e.key]) { e.preventDefault(); this.nav(map[e.key]); }
    if (e.key === 'f') this.action('flip');
  }

  destroy() {
    this.destroyed = true;
    document.removeEventListener('keydown', this.keyHandler);
    this.engine.stopAll();
  }
}
