// Live game vs a bot (with optional live coach) or a friend on the same device.
import { Chess } from '../../vendor/chess.js';
import { store } from '../storage.js';
import { go } from '../app.js';
import { Board } from '../board.js';
import { getEngine, scoreToCp } from '../engine.js';
import { botById, chooseBotMove, pick } from '../bots.js';
import { coachById, say } from '../coaches.js';
import { sound } from '../sound.js';
import { classifyGame, classIcon, CLASSES, openingFor } from '../review.js';
import { findThreat, explainReviewedMove, PIECE_NAMES } from '../explain.js';
import { $, esc, avatar, playerAvatarSpec, renderMoveList, capturedHtml, fmtClock, modal, confirmDialog, toast, evalBarHtml, updateEvalBar, confetti } from '../ui.js';

const SAVE_KEY = 'chesshub.current';

export function render(main, { payload }) {
  let cfg = payload, resume = null;
  if (!cfg) {
    try { resume = JSON.parse(sessionStorage.getItem(SAVE_KEY)); } catch { resume = null; }
    if (!resume) { go('bots'); return; }
    cfg = resume.cfg;
  }
  return new Game(main, cfg, resume).cleanup;
}

class Game {
  constructor(main, cfg, resume) {
    this.main = main;
    this.cfg = cfg;
    this.mode = cfg.mode;
    this.assist = cfg.assist || {};
    this.bot = this.mode === 'bot' ? botById(cfg.botId) : null;
    this.playerColor = cfg.playerColor || 'w';
    this.coach = coachById(store.settings.coachId);
    this.chess = new Chess(cfg.startFen || undefined);
    this.startFen = this.chess.fen();
    this.moves = [];
    this.view = -1;
    this.result = null;
    this.botToken = 0;
    this.evalCache = {};
    this.liveCls = {};
    this.hintStage = 0;
    this.chat = [];
    this.opening = null;
    this.timers = [];
    this.botEngine = getEngine('bot');
    this.anaEngine = getEngine('analysis');
    this.botEngine.newGame();
    if (cfg.time) this.clock = { w: cfg.time.base, b: cfg.time.base, inc: cfg.time.inc, last: null, lowWarned: { w: false, b: false } };
    this.cleanup = () => this.destroy();
    this.build();
    if (resume) {
      for (const san of resume.moves) { const m = this.chess.move(san); this.moves.push(m); }
      if (this.clock && resume.clock) { this.clock.w = resume.clock.w; this.clock.b = resume.clock.b; }
      this.view = this.moves.length - 1;
      this.addChat('sys', 'Game resumed.');
    } else {
      sound.play('start');
      if (this.bot) this.addChat('bot', pick(this.bot.chat.greet));
    }
    this.refresh();
    if (this.assist.coach) this.coachSay(`<div class="headline">${esc(this.coach.name)}</div>${esc(say(this.coach, 'intro').replace('this game', 'this game as we play'))} I'll comment on your moves and warn you about threats. ${esc(say(this.coach, 'tip'))}`);
    this.analyseCurrent();
    this.maybeBotMove();
    this.tickHandle = setInterval(() => this.tick(), 100);
    this.keyHandler = e => this.onKey(e);
    document.addEventListener('keydown', this.keyHandler);
  }

  // ---------- Layout ----------
  build() {
    const showBar = this.assist.evalbar;
    this.main.innerHTML = `<div class="play-layout">
      <div class="board-col">
        <div class="player-bar" id="bar-top"></div>
        <div class="board-row">${evalBarHtml()}<div class="board-holder"><div id="board"></div></div></div>
        <div class="player-bar" id="bar-bottom"></div>
      </div>
      <div class="side-panel">
        <div class="panel-head"><div class="title">${this.mode === 'bot' ? `🤖 Play vs ${esc(this.bot.name)}` : '👥 Play a Friend'}</div>${this.cfg.time ? `<span class="muted">⏱ ${esc(this.cfg.time.label)}</span>` : ''}</div>
        <div id="coach-box" class="coach-box ${this.assist.coach ? '' : 'hidden'}">${avatar(this.coach.avatar, 52)}<div class="bubble" id="coach-bubble"></div></div>
        <div class="tabs"><button class="active" data-tab="moves">Moves</button><button data-tab="chat">Chat</button></div>
        <div class="opening-name" id="opening">Starting position</div>
        <div class="panel-body" id="tab-moves"><div id="moves"></div></div>
        <div class="panel-body hidden" id="tab-chat"><div class="chat-log" id="chat"></div></div>
        <div class="nav-controls">
          <button class="icon-btn" data-nav="first" title="First (↑)">⏮</button>
          <button class="icon-btn" data-nav="prev" title="Previous (←)">◀</button>
          <button class="icon-btn" data-nav="next" title="Next (→)">▶</button>
          <button class="icon-btn" data-nav="last" title="Last (↓)">⏭</button>
        </div>
        <div class="panel-foot" id="actions"></div>
      </div>
    </div>`;
    this.$ = sel => $(sel, this.main);
    this.$('.evalbar').classList.toggle('hidden', !showBar);
    this.board = new Board(this.$('#board'), {
      orientation: this.playerColor,
      allowPremoves: this.mode === 'bot',
      onMove: (m, info) => this.userMove(m, info),
      onPremove: pm => { this.premove = pm; if (pm) sound.play('premove'); },
      onIllegal: () => sound.play('illegal'),
    });
    this.main.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
      this.main.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
      this.$('#tab-moves').classList.toggle('hidden', b.dataset.tab !== 'moves');
      this.$('#tab-chat').classList.toggle('hidden', b.dataset.tab !== 'chat');
    });
    this.main.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => this.nav(b.dataset.nav));
    this.renderActions();
  }

  renderActions() {
    const a = this.$('#actions');
    const over = !!this.result;
    if (over) {
      a.innerHTML = `
        <button class="btn primary" data-a="review" style="font-size:15px;padding:10px 16px">⭐ Game Review</button>
        <button class="btn" data-a="rematch">🔁 Rematch</button>
        <button class="btn" data-a="new">➕ New</button>
        <button class="btn" data-a="analyse">🔍 Analyse</button>
        <button class="btn" data-a="flip" title="Flip board (F)">⇅</button>`;
    } else {
      const isBot = this.mode === 'bot';
      a.innerHTML = `
        ${isBot && this.assist.hints ? '<button class="btn" data-a="hint" title="Hint">💡 Hint</button>' : ''}
        ${isBot && this.assist.takebacks ? '<button class="btn" data-a="takeback" title="Takeback">↩️ Undo</button>' : ''}
        ${!isBot ? '<button class="btn" data-a="takeback" title="Takeback">↩️ Undo</button>' : ''}
        <button class="btn" data-a="flip" title="Flip board (F)">⇅</button>
        <button class="btn" data-a="draw" title="Offer draw">½ Draw</button>
        <button class="btn danger" data-a="resign" title="Resign">🏳️ ${this.moves.length < 2 ? 'Abort' : 'Resign'}</button>`;
    }
    a.querySelectorAll('[data-a]').forEach(b => b.onclick = () => this.action(b.dataset.a));
  }

  renderBars() {
    const flipped = this.board.flipped;
    const bottomColor = flipped ? 'b' : 'w';
    const topColor = flipped ? 'w' : 'b';
    for (const [id, color] of [['#bar-top', topColor], ['#bar-bottom', bottomColor]]) {
      const el = this.$(id);
      let name, rating, flag = '', av;
      if (this.mode === 'bot' && color !== this.playerColor) { name = this.bot.name; rating = this.bot.rating; flag = this.bot.flag; av = this.bot.avatar; }
      else if (this.mode === 'bot') { name = store.settings.playerName; rating = store.stats.rating; av = playerAvatarSpec(); }
      else { name = color === 'w' ? (this.cfg.whiteName || 'White') : (this.cfg.blackName || 'Black'); av = color === 'w' ? { bg: '#ddd', skin: '#f1c27d', hair: '#4a2f1b', shirt: '#fff' } : { bg: '#333', skin: '#c68642', hair: '#111', shirt: '#222', hairStyle: 'curly' }; }
      const thinking = this.botThinking && this.mode === 'bot' && color !== this.playerColor;
      const clockMs = this.clock ? this.clock[color] : null;
      const active = !this.result && this.chess.turn() === color && this.moves.length > 0;
      const low = clockMs != null && clockMs < Math.min(20000, this.cfg.time.base * 0.1 + 1000);
      el.innerHTML = `${avatar(av, 40)}<div class="player-info"><div class="player-name">${esc(name)} ${rating ? `<span class="rating">(${rating})</span>` : ''}<span class="flag">${flag}</span></div>
        <div class="captured">${capturedHtml(this.chess, color, this.startFen)}${thinking ? '<span class="thinking" style="margin-left:8px"><i></i><i></i><i></i></span>' : ''}</div></div>
        <div class="clock ${clockMs == null ? 'none' : ''} ${active ? 'active' : ''} ${low ? 'low' : ''}" data-clock="${color}">${fmtClock(clockMs)}</div>`;
    }
  }

  // ---------- State rendering ----------
  liveIndex() { return this.moves.length - 1; }
  isLive() { return this.view === this.liveIndex(); }

  fenAt(i) {
    if (i < 0) return this.startFen;
    return this.moves[i].after;
  }

  refresh(animMove) {
    const live = this.isLive();
    const fen = this.fenAt(this.view);
    const c = new Chess(fen);
    const lastMove = this.view >= 0 ? this.moves[this.view] : null;
    let checkSq = null;
    if (c.inCheck()) checkSq = this.findKing(c, c.turn());
    this.board.setPosition(fen, { move: animMove, lastMove: lastMove ? [lastMove.from, lastMove.to] : null, check: checkSq, animate: !!animMove });
    // Interaction
    if (live && !this.result) {
      if (this.mode === 'friend') { this.board.setMovable('both'); this.board.setLegalMoves(this.chess.moves({ verbose: true })); }
      else {
        this.board.setMovable(this.playerColor);
        this.board.setLegalMoves(this.chess.turn() === this.playerColor ? this.chess.moves({ verbose: true }) : []);
      }
    } else {
      this.board.setMovable(null);
      this.board.setLegalMoves([]);
    }
    // Badge for coach/live classification
    const cls = lastMove && this.liveCls[this.view];
    const showBadge = cls && (this.result || (this.assist.coach && lastMove.color === this.playerColor));
    this.board.setBadge(showBadge ? lastMove.to : null, showBadge ? classIcon(cls, 30) : '');
    this.renderBars();
    renderMoveList(this.$('#moves'), this.moves.map((m, i) => ({ san: m.san, color: m.color, cls: (this.result || (this.assist.coach && m.color === this.playerColor)) ? this.liveCls[i] : null })), this.view, i => { this.view = i; this.refresh(); }, { startPly: this.startPly() });
    // Opening
    const op = openingFor(fen);
    if (op) this.opening = op;
    this.$('#opening').innerHTML = this.opening ? `📖 <b>${esc(this.opening[0])}</b>&nbsp;${esc(this.opening[1])}` : (this.moves.length ? '' : 'Starting position');
    // Eval bar
    const ev = this.evalCache[fen];
    if (ev) updateEvalBar(this.$('.evalbar'), ev.lines[0] || ev.score, this.board.flipped);
  }

  startPly() {
    const parts = this.startFen.split(' ');
    return (+parts[5] - 1) * 2 + (parts[1] === 'b' ? 1 : 0);
  }

  findKing(c, color) {
    for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
    return null;
  }

  // ---------- Moves ----------
  userMove(m, info) {
    if (this.result || !this.isLive()) return;
    if (this.mode === 'bot' && this.chess.turn() !== this.playerColor) return;
    this.applyMove(m, info?.dropped);
    if (this.mode === 'friend' && store.settings.autoFlipFriend && !this.result) {
      setTimeout(() => { if (!this.result) { this.board.setOrientation(this.chess.turn()); this.refresh(); } }, 350);
    }
    this.maybeBotMove();
  }

  applyMove(m, dropped) {
    let mv;
    try { mv = this.chess.move(m); } catch { mv = null; }
    if (!mv) { sound.play('illegal'); this.refresh(); return null; }
    // Clock
    if (this.clock) {
      const now = performance.now();
      if (this.clock.last != null && this.moves.length >= 1) this.clock[mv.color] -= now - this.clock.last;
      if (this.moves.length >= 1) this.clock[mv.color] += this.clock.inc;
      this.clock.last = now;
    }
    this.moves.push(mv);
    this.view = this.liveIndex();
    this.hintStage = 0;
    this.board.setArrows([]);
    this.board.clearUserDrawings();
    sound.forMove(mv, this.chess);
    this.refresh(dropped ? null : mv);
    this.save();
    this.checkEnd();
    this.renderActions();
    this.analyseCurrent();
    return mv;
  }

  maybeBotMove() {
    if (this.mode !== 'bot' || this.result || this.chess.turn() === this.playerColor) return;
    const token = ++this.botToken;
    this.botThinking = true;
    this.renderBars();
    const started = performance.now();
    const fenAtStart = this.chess.fen();
    chooseBotMove(this.botEngine, new Chess(fenAtStart), this.bot).then(choice => {
      if (token !== this.botToken || this.result || this.chess.fen() !== fenAtStart) return;
      let think = choice?.think ?? 500;
      if (this.clock) think = Math.min(think, this.clock[this.chess.turn()] / 40);
      if (this.chess.history().length < 2) think = Math.min(think, 700);
      const wait = Math.max(0, think - (performance.now() - started));
      this.later(() => {
        if (token !== this.botToken || this.result || this.chess.fen() !== fenAtStart) return;
        this.botThinking = false;
        if (!choice || !choice.move) return;
        const mv = this.applyMove(choice.move);
        if (mv) this.afterBotMove(mv);
      }, wait);
    }).catch(err => { console.error(err); this.botThinking = false; toast('Engine failed to load. Serve the folder over http(s).'); });
  }

  afterBotMove() {
    // Threat warnings
    if (this.assist.threats && !this.result) {
      const th = findThreat(this.chess.fen());
      if (th) {
        this.board.setArrows([{ from: th.from, to: th.to, color: 'threat', opacity: 0.6 }]);
        if (this.assist.coach) this.coachSay(`<div class="headline">⚠️ Threat</div>${esc(say(this.coach, 'threat', { threat: th.text }))}`);
      }
    }
    // Premove
    if (this.premove && !this.result) {
      const pm = this.premove;
      this.premove = null;
      this.board.setPremove(null);
      const legal = this.chess.moves({ verbose: true }).filter(x => x.from === pm.from && x.to === pm.to);
      if (legal.length) {
        const mv = legal.find(x => !x.promotion || x.promotion === 'q') || legal[0];
        this.later(() => { if (!this.result && this.chess.turn() === this.playerColor) { this.applyMove({ from: mv.from, to: mv.to, promotion: mv.promotion }); this.maybeBotMove(); } }, 120);
      }
    }
  }

  later(fn, ms) { const t = setTimeout(fn, ms); this.timers.push(t); return t; }

  // ---------- Analysis (eval bar, coach, chat) ----------
  analyseCurrent() {
    const needed = this.assist.evalbar || this.assist.coach || this.mode === 'bot' || this.result;
    if (!needed) return;
    const fen = this.chess.fen();
    const c = new Chess(fen);
    if (c.isGameOver()) {
      const score = c.isCheckmate() ? (c.turn() === 'w' ? -100000 : 100000) : 0;
      this.evalCache[fen] = { score, lines: [], terminal: true, mate: c.isCheckmate() ? 0 : null };
      this.onEval(fen);
      return;
    }
    if (this.evalCache[fen]) { this.onEval(fen); return; }
    this.anaEngine.analyse(fen, { depth: this.assist.coach ? 13 : 11, multipv: 2 }).then(res => {
      if (!res || !res.lines.length) return;
      this.evalCache[fen] = { score: scoreToCp(res.lines[0]), lines: res.lines, best: res.bestmove };
      this.onEval(fen);
    });
  }

  onEval(fen) {
    if (this.destroyed) return;
    if (this.fenAt(this.view) === fen) updateEvalBar(this.$('.evalbar'), this.evalCache[fen].lines[0] || this.evalCache[fen].score, this.board.flipped);
    // classify the move that led to this fen
    const i = this.moves.findIndex(m => m.after === fen);
    if (i < 0) return;
    const before = this.fenAt(i - 1);
    if (!this.evalCache[before]) { this.pendingClassify = i; return; }
    this.classifyMove(i);
    // a previous move may have been waiting for this eval
    if (this.pendingClassify != null && this.pendingClassify !== i && this.evalCache[this.fenAt(this.pendingClassify)]) { const p = this.pendingClassify; this.pendingClassify = null; this.classifyMove(p); }
  }

  classifyMove(i) {
    if (this.liveCls[i]) return;
    const mv = this.moves[i];
    const fb = this.fenAt(i - 1), fa = mv.after;
    const res = classifyGame(fb, [fb, fa], [mv], [this.evalCache[fb], this.evalCache[fa]]);
    const rm = res.moves[0];
    if (i >= 16 && rm.cls === 'book') rm.cls = 'best';
    this.liveCls[i] = rm.cls;
    if (this.result) return;
    const mine = mv.color === this.playerColor;
    if (this.mode === 'bot') {
      if (mine && (rm.cls === 'brilliant' || rm.cls === 'great') && Math.random() < 0.7) this.addChat('bot', pick(this.bot.chat.good));
      if (!mine && rm.cls === 'blunder' && Math.random() < 0.6) this.addChat('bot', pick(this.bot.chat.blunder));
    }
    if (this.assist.coach && mine) {
      this.coachComment(rm, i);
      if (this.view === i) this.refresh();
    }
  }

  coachComment(rm, i) {
    const cls = rm.cls;
    const C = CLASSES[cls];
    const key = { brilliant: 'liveBest', great: 'liveBest', best: 'liveBest', excellent: 'liveGood', good: 'liveGood', book: 'liveGood', forced: 'liveGood', inaccuracy: 'liveBad', mistake: 'liveBad', miss: 'liveBad', blunder: 'liveBlunder' }[cls];
    const exp = explainReviewedMove(rm);
    const phrase = { best: 'the best move', forced: 'forced', book: 'a book move', miss: 'a missed chance' }[cls] || `${/^[aeiou]/i.test(C.label) ? 'an' : 'a'} ${C.label.toLowerCase()}${['brilliant', 'great', 'excellent', 'good'].includes(cls) ? ' move' : ''}`;
    let html = `<div class="headline">${classIcon(cls, 20)} ${esc(rm.san)} is ${phrase}</div>`;
    html += `<div>${esc(say(this.coach, key))} ${esc(exp.what || '')}</div>`;
    if (['inaccuracy', 'mistake', 'miss', 'blunder'].includes(cls)) {
      if (exp.why) html += `<div class="sub">${esc(exp.why)}</div>`;
      const canRetry = this.assist.takebacks !== false;
      html += `<div class="actions">${canRetry ? '<button class="btn go" data-c="retry">↩️ Retry</button>' : ''}<button class="btn" data-c="best">💡 Show best</button></div>`;
    } else if (exp.why && cls !== 'book') html += `<div class="sub">${esc(exp.why)}</div>`;
    this.coachSay(html, {
      retry: () => this.takeback(true),
      best: () => {
        this.board.setArrows([{ from: rm.bestUci.slice(0, 2), to: rm.bestUci.slice(2, 4), color: 'best' }]);
        this.coachSay(`<div class="headline">💡 Best was ${esc(rm.bestSan)}</div>${esc(exp.better || '')}${exp.line ? `<div class="line">${esc(exp.line)}</div>` : ''}<div class="actions">${this.assist.takebacks !== false ? '<button class="btn go" data-c="retry">↩️ Retry</button>' : ''}</div>`, { retry: () => this.takeback(true) });
      },
    });
  }

  coachSay(html, handlers = {}) {
    const b = this.$('#coach-bubble');
    if (!b) return;
    b.innerHTML = html;
    b.querySelectorAll('[data-c]').forEach(x => x.onclick = () => handlers[x.dataset.c]?.());
  }

  addChat(who, text) {
    if (!text) return;
    this.chat.push({ who, text });
    const el = this.$('#chat');
    if (!el) return;
    const av = who === 'bot' ? avatar(this.bot.avatar, 28) : '';
    el.insertAdjacentHTML('beforeend', `<div class="chat-msg ${who === 'sys' ? 'sys' : ''}">${av}<div class="txt">${esc(text)}</div></div>`);
    el.parentElement.scrollTop = el.parentElement.scrollHeight;
    if (who === 'bot') {
      // brief speech bubble over the bot's bar
      const bar = this.board.flipped === (this.playerColor === 'w') ? this.$('#bar-bottom') : this.$('#bar-top');
      bar?.querySelector('.speech')?.remove();
      const sp = document.createElement('span');
      sp.className = 'speech';
      sp.style.cssText = 'position:absolute;margin-left:54px;margin-top:-44px;z-index:30;max-width:280px;font-size:13px;box-shadow:0 3px 10px rgba(0,0,0,.4)';
      sp.textContent = text;
      bar?.prepend(sp);
      this.later(() => sp.remove(), 3500);
    }
  }

  // ---------- Clock ----------
  tick() {
    if (!this.clock || this.result || this.moves.length < 1) return;
    const now = performance.now();
    if (this.clock.last == null) this.clock.last = now;
    const turn = this.chess.turn();
    const remaining = this.clock[turn] - (now - this.clock.last);
    const el = this.$(`[data-clock="${turn}"]`);
    if (el) {
      el.textContent = fmtClock(remaining);
      const low = remaining < Math.min(20000, this.cfg.time.base * 0.1 + 1000);
      el.classList.toggle('low', low);
      if (low && !this.clock.lowWarned[turn] && (this.mode === 'friend' || turn === this.playerColor)) { this.clock.lowWarned[turn] = true; sound.play('lowtime'); }
    }
    if (remaining <= 0) {
      this.clock[turn] = 0;
      const opp = turn === 'w' ? 'b' : 'w';
      const insufficient = !this.hasMatingMaterial(opp);
      this.endGame(insufficient ? null : opp, insufficient ? 'Timeout vs insufficient material' : 'on time');
    }
  }

  hasMatingMaterial(color) {
    const ps = this.chess.board().flat().filter(p => p && p.color === color && p.type !== 'k');
    if (ps.some(p => ['p', 'r', 'q'].includes(p.type))) return true;
    return ps.length >= 2;
  }

  // ---------- End of game ----------
  checkEnd() {
    const c = this.chess;
    if (c.isCheckmate()) return this.endGame(c.turn() === 'w' ? 'b' : 'w', 'by checkmate');
    if (c.isStalemate()) return this.endGame(null, 'by stalemate');
    if (c.isInsufficientMaterial()) return this.endGame(null, 'by insufficient material');
    if (c.isThreefoldRepetition()) return this.endGame(null, 'by repetition');
    if (c.isDrawByFiftyMoves()) return this.endGame(null, 'by 50-move rule');
  }

  endGame(winner, reason, opts = {}) {
    if (this.result) return;
    this.botToken++;
    this.botThinking = false;
    this.result = { winner, reason };
    this.premove = null;
    this.board.setPremove(null);
    try { sessionStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    const resultStr = winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2';
    let outcome = winner == null ? 'draw' : (this.mode === 'friend' ? (winner === 'w' ? 'win' : 'loss') : (winner === this.playerColor ? 'win' : 'loss'));
    if (opts.aborted) outcome = 'draw';
    // Rating
    let delta = 0;
    if (this.mode === 'bot' && !opts.aborted) {
      const R = store.stats.rating, Rb = this.bot.rating;
      const exp = 1 / (1 + Math.pow(10, (Rb - R) / 400));
      const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
      const n = store.stats.wins + store.stats.losses + store.stats.draws;
      const K = n < 20 ? 40 : 24;
      delta = Math.round(K * (score - exp));
      store.updateStats(s => {
        s.rating = Math.max(100, s.rating + delta);
        if (outcome === 'win') { s.wins++; s.botWins[this.bot.id] = (s.botWins[this.bot.id] || 0) + 1; }
        else if (outcome === 'loss') s.losses++; else s.draws++;
      });
    }
    // Sounds + chat
    if (this.mode === 'bot') {
      sound.play(outcome === 'win' ? 'win' : outcome === 'loss' ? 'lose' : 'end');
      this.addChat('bot', pick(outcome === 'win' ? this.bot.chat.lose : outcome === 'loss' ? this.bot.chat.win : (this.bot.chat.draw || ['A fair result.'])));
      if (outcome === 'win') confetti();
    } else sound.play('end');
    // Save to archive
    this.gameId = null;
    if (!opts.aborted && this.moves.length > 0) {
      const id = 'g' + Date.now().toString(36);
      const white = this.mode === 'bot' ? (this.playerColor === 'w' ? store.settings.playerName : this.bot.name) : (this.cfg.whiteName || 'White');
      const black = this.mode === 'bot' ? (this.playerColor === 'b' ? store.settings.playerName : this.bot.name) : (this.cfg.blackName || 'Black');
      const pgnChess = new Chess(this.startFen);
      pgnChess.setHeader('Event', this.mode === 'bot' ? 'Chess Arena vs Bot' : 'Chess Arena casual');
      pgnChess.setHeader('Site', 'Chess Arena');
      pgnChess.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
      pgnChess.setHeader('White', white);
      pgnChess.setHeader('Black', black);
      if (this.mode === 'bot') {
        pgnChess.setHeader(this.playerColor === 'w' ? 'BlackElo' : 'WhiteElo', String(this.bot.rating));
        pgnChess.setHeader(this.playerColor === 'w' ? 'WhiteElo' : 'BlackElo', String(store.stats.rating - delta));
      }
      if (this.cfg.time) pgnChess.setHeader('TimeControl', `${this.cfg.time.base / 1000}+${this.cfg.time.inc / 1000}`);
      pgnChess.setHeader('Termination', `${winner ? (winner === 'w' ? 'White' : 'Black') + ' won' : 'Draw'} ${reason}`);
      for (const m of this.moves) pgnChess.move(m.san);
      pgnChess.setHeader('Result', resultStr);
      const g = {
        id, date: Date.now(), mode: this.mode, startFen: this.startFen, moves: this.moves.map(m => m.san), result: resultStr, outcome, reason,
        playerColor: this.mode === 'bot' ? this.playerColor : 'w', white, black,
        opponent: this.mode === 'bot' ? this.bot.name : (this.cfg.blackName || 'Black'), opponentRating: this.bot?.rating, opponentAvatar: this.bot?.avatar, botId: this.bot?.id,
        time: this.cfg.time?.label || null, pgn: pgnChess.pgn().replace(/\s*$/, '') + (pgnChess.pgn().endsWith(resultStr) ? '' : ' ' + resultStr),
        delta,
      };
      store.addGame(g);
      this.gameId = id;
    }
    this.view = this.liveIndex();
    this.refresh();
    this.renderActions();
    this.$('.evalbar').classList.remove('hidden');
    // classify everything we already have
    this.analyseCurrent();
    this.later(() => this.showResultModal(winner, reason, outcome, delta, opts), 600);
  }

  showResultModal(winner, reason, outcome, delta, opts) {
    if (this.destroyed) return;
    const title = opts.aborted ? 'Game Aborted' : this.mode === 'friend' ? (winner ? `${winner === 'w' ? 'White' : 'Black'} Won` : 'Draw') : outcome === 'win' ? 'You Won!' : outcome === 'loss' ? `${esc(this.bot.name)} Won` : 'Draw';
    const me = { name: store.settings.playerName, av: playerAvatarSpec() };
    const opp = this.bot ? { name: this.bot.name, av: this.bot.avatar } : null;
    const coachLine = this.assist.coach ? `<div class="coach-box" style="border:0;padding:0">${avatar(this.coach.avatar, 44)}<div class="bubble">${esc(say(this.coach, outcome === 'win' ? 'win' : outcome === 'loss' ? 'lose' : 'draw'))}</div></div>` : '';
    const body = `
      ${this.mode === 'bot' ? `<div class="result-players">
        <div class="p ${outcome === 'win' ? 'winner' : ''}">${avatar(me.av, 72)}<div>${esc(me.name)}</div></div>
        <div class="vs">${winner == null ? '½-½' : outcome === 'win' ? '1-0' : '0-1'}</div>
        <div class="p ${outcome === 'loss' ? 'winner' : ''}">${avatar(opp.av, 72)}<div>${esc(opp.name)}</div></div></div>
        ${opts.aborted ? '' : `<div class="rating-change">Bot rating: <b>${store.stats.rating}</b> <b class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${delta}</b></div>`}` : ''}
      ${coachLine}
      ${this.gameId ? '<button class="btn primary big" data-m="review">⭐ Game Review</button>' : ''}
      <div class="btn-row"><button class="btn" data-m="rematch">🔁 Rematch</button><button class="btn" data-m="new">➕ New ${this.mode === 'bot' ? 'Bot' : 'Game'}</button></div>`;
    const m = modal({ title, reason: opts.aborted ? '' : (winner ? `${winner === 'w' ? 'White' : 'Black'} won ${reason}` : `Draw ${reason}`), body, cls: outcome === 'win' && this.mode === 'bot' ? 'win' : '' });
    m.el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { m.close(); this.action(b.dataset.m); });
  }

  // ---------- Actions ----------
  async action(a) {
    switch (a) {
      case 'flip': this.board.flip(); this.refresh(); break;
      case 'hint': return this.hint();
      case 'takeback': return this.takeback();
      case 'draw': return this.offerDraw();
      case 'resign': {
        if (this.moves.length < 2) return this.endGame(null, 'aborted', { aborted: true });
        if (store.settings.confirmResign && !(await confirmDialog('Resign?', 'Are you sure you want to resign this game?', 'Resign'))) return;
        if (this.mode === 'friend') return this.endGame(this.chess.turn() === 'w' ? 'b' : 'w', 'by resignation');
        return this.endGame(this.playerColor === 'w' ? 'b' : 'w', 'by resignation');
      }
      case 'review': if (this.gameId) go('review/' + this.gameId); else toast('Nothing to review yet.'); break;
      case 'analyse': go('analysis', { startFen: this.startFen, moves: this.moves.map(m => m.san) }); break;
      case 'rematch': {
        const cfg = { ...this.cfg };
        if (this.mode === 'bot') cfg.playerColor = this.playerColor === 'w' ? 'b' : 'w';
        go('play', cfg);
        break;
      }
      case 'new': go(this.mode === 'bot' ? 'bots' : 'friend'); break;
    }
  }

  async hint() {
    if (this.result || this.chess.turn() !== this.playerColor) { toast('Wait for your turn.'); return; }
    const fen = this.chess.fen();
    let best = this.evalCache[fen]?.best;
    if (!best) {
      toast('Thinking…', 1000);
      const res = await this.anaEngine.analyse(fen, { depth: 14 });
      best = res?.bestmove;
    }
    if (!best || this.chess.fen() !== fen) return;
    this.hintStage++;
    const from = best.slice(0, 2), to = best.slice(2, 4);
    const piece = this.chess.get(from);
    if (this.hintStage === 1) {
      this.board.marks = { [from]: 'green' };
      this.board.renderMarks();
      const t = say(this.coach, 'hint', { piece: PIECE_NAMES[piece.type] });
      if (this.assist.coach) this.coachSay(`<div class="headline">💡 Hint</div>${esc(t)} <div class="actions"><button class="btn" data-c="more">Show move</button></div>`, { more: () => this.hint() });
      else toast(`💡 ${t}`);
    } else {
      this.board.setArrows([{ from, to, color: 'hint' }]);
    }
  }

  takeback(fromCoach = false) {
    if (this.result) return;
    if (this.mode === 'friend') {
      if (!this.moves.length) return;
      this.undoPlies(1);
      return;
    }
    this.botToken++;
    this.botThinking = false;
    const lastIsBot = this.moves.length && this.moves[this.moves.length - 1].color !== this.playerColor;
    let n = lastIsBot ? 2 : 1;
    // never undo a bot's opening move when the bot plays white
    if (this.moves.length - n < (this.playerColor === 'b' ? 1 : 0)) n = this.moves.length - (this.playerColor === 'b' ? 1 : 0);
    if (n <= 0) { this.refresh(); return; }
    this.undoPlies(n);
    if (fromCoach) this.coachSay(`<div class="headline">↩️ Try again</div>Take your time and look for a better move.`);
    this.maybeBotMove();
  }

  undoPlies(n) {
    for (let k = 0; k < n; k++) { this.chess.undo(); const m = this.moves.pop(); delete this.liveCls[this.moves.length]; void m; }
    this.view = this.liveIndex();
    this.board.setArrows([]);
    this.board.clearUserDrawings();
    if (this.clock) this.clock.last = performance.now();
    sound.play('move');
    this.refresh();
    this.renderActions();
    this.save();
  }

  async offerDraw() {
    if (this.result) return;
    if (this.mode === 'friend') {
      if (await confirmDialog('Draw?', `${this.chess.turn() === 'w' ? 'White' : 'Black'} offers a draw. Accept?`, 'Accept')) this.endGame(null, 'by agreement');
      return;
    }
    const fen = this.chess.fen();
    let ev = this.evalCache[fen];
    if (!ev) { const r = await this.anaEngine.analyse(fen, { depth: 12 }); ev = r && { score: scoreToCp(r.lines[0]) }; }
    const botScore = (this.playerColor === 'w' ? -1 : 1) * (ev?.score ?? 0);
    const accept = botScore < -150 || (Math.abs(botScore) <= 40 && this.moves.length >= 50) || (this.bot.rating < 600 && Math.random() < 0.3);
    if (accept) { this.addChat('bot', 'I accept the draw.'); this.endGame(null, 'by agreement'); }
    else { this.addChat('bot', pick(['No thanks, let\'s play on!', 'I\'ll keep playing.', 'Draw? Not yet!'])); toast(`${this.bot.name} declined the draw.`); }
  }

  nav(where) {
    const last = this.liveIndex();
    if (where === 'first') this.view = -1;
    if (where === 'prev') this.view = Math.max(-1, this.view - 1);
    if (where === 'next') this.view = Math.min(last, this.view + 1);
    if (where === 'last') this.view = last;
    const animMove = where === 'next' && this.view >= 0 ? this.moves[this.view] : null;
    if (animMove) sound.forMove(animMove, new Chess(animMove.after));
    this.refresh(animMove);
  }

  onKey(e) {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === 'ArrowLeft') { this.nav('prev'); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { this.nav('next'); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { this.nav('first'); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { this.nav('last'); e.preventDefault(); }
    else if (e.key === 'f' || e.key === 'F') this.action('flip');
  }

  save() {
    if (this.result) return;
    try { sessionStorage.setItem(SAVE_KEY, JSON.stringify({ cfg: this.cfg, moves: this.moves.map(m => m.san), clock: this.clock ? { w: this.clock.w, b: this.clock.b } : null })); } catch { /* ignore */ }
  }

  destroy() {
    this.destroyed = true;
    this.botToken++;
    clearInterval(this.tickHandle);
    this.timers.forEach(clearTimeout);
    document.removeEventListener('keydown', this.keyHandler);
    this.anaEngine.stopAll();
    this.botEngine.stopAll();
  }
}
