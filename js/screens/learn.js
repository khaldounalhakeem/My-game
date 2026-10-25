// Lessons list and interactive lesson runner.
import { Chess } from '../../vendor/chess.js';
import { LESSONS } from '../lessons.js';
import { store } from '../storage.js';
import { go } from '../app.js';
import { Board } from '../board.js';
import { getEngine } from '../engine.js';
import { coachById } from '../coaches.js';
import { classIcon } from '../review.js';
import { sound } from '../sound.js';
import { $, esc, avatar, confetti } from '../ui.js';

export function render(main, { params, route }) {
  if (route === 'lesson' && params[0]) return lesson(main, params[0]);
  const done = store.stats.lessonsDone || [];
  main.innerHTML = `<div class="page"><h1>🎓 Lessons</h1>
    <p class="muted">Short interactive lessons taught by our coaches. Make the moves on the board to complete each step.</p>
    <div class="list">${LESSONS.map(l => {
      const c = coachById(l.coach);
      return `<div class="lesson-card" data-l="${l.id}"><div class="ico">${l.icon}</div><div class="grow"><b style="font-size:17px">${esc(l.title)}</b> ${done.includes(l.id) ? '<span class="done">✓ Completed</span>' : ''}
        <div class="muted" style="font-size:13px;margin:3px 0">${esc(l.desc)}</div>
        <div class="row" style="font-size:12px;color:var(--dim)">${avatar(c.avatar, 20)} ${esc(c.name)} · ${l.level} · ${l.steps.length} steps</div></div>
        <button class="btn">${done.includes(l.id) ? 'Replay' : 'Start'}</button></div>`;
    }).join('')}</div>
    <h2 class="section">Keep practising</h2>
    <div class="cards">
      <div class="card" data-go2="puzzles"><div class="big-ico">🧩</div><div><h3>Puzzles</h3><p>Apply the patterns you learned.</p></div></div>
      <div class="card" data-go2="bots"><div class="big-ico">🤖</div><div><h3>Play with Coach</h3><p>Get live feedback while you play.</p></div></div>
    </div></div>`;
  main.querySelectorAll('[data-l]').forEach(el => el.onclick = () => go('lesson/' + el.dataset.l));
  main.querySelectorAll('[data-go2]').forEach(el => el.onclick = () => go(el.dataset.go2, el.dataset.go2 === 'bots' ? { coach: true } : undefined));
}

function lesson(main, id) {
  const L = LESSONS.find(l => l.id === id);
  if (!L) { go('learn'); return; }
  const coach = coachById(L.coach);
  let stepIdx = 0, chess = null, timers = [], busy = false;
  main.innerHTML = `<div class="play-layout">
    <div class="board-col"><div class="board-holder" style="margin-top:6px"><div id="board"></div></div></div>
    <div class="side-panel">
      <div class="panel-head"><div class="title">${L.icon} ${esc(L.title)}</div><button class="btn small ghost" id="back">✕</button></div>
      <div class="progress-dots" id="dots"></div>
      <div class="coach-box" style="border:0">${avatar(coach.avatar, 64)}<div class="bubble" id="bubble"></div></div>
      <div class="panel-body"></div>
      <div class="panel-foot" id="foot"></div>
    </div></div>`;
  const board = new Board($('#board', main), { onMove: m => onMove(m), onIllegal: () => sound.play('illegal') });
  $('#back', main).onclick = () => go('learn');

  function dots() {
    $('#dots', main).innerHTML = L.steps.map((_, i) => `<i class="${i < stepIdx ? 'done' : i === stepIdx ? 'cur' : ''}"></i>`).join('');
  }

  function showStep() {
    const st = L.steps[stepIdx];
    if (st.fen) chess = new Chess(st.fen);
    board.setOrientation(chess.turn());
    board.setPosition(chess.fen(), { lastMove: null });
    board.setArrows([]);
    board.setBadge(null);
    board.setMovable(chess.turn());
    board.setLegalMoves(chess.moves({ verbose: true }));
    busy = false;
    dots();
    $('#bubble', main).innerHTML = `<div class="headline">Step ${stepIdx + 1} of ${L.steps.length}</div>${esc(st.text)}`;
    $('#foot', main).innerHTML = `<button class="btn" id="hint">💡 Hint</button><button class="btn" id="skip">Skip ⏭</button>`;
    $('#hint', main).onclick = () => { const u = st.accept[0]; board.setArrows([{ from: u.slice(0, 2), to: u.slice(2, 4), color: 'hint' }]); };
    $('#skip', main).onclick = () => skip();
  }

  async function onMove(m) {
    if (busy) return;
    const st = L.steps[stepIdx];
    const c = new Chess(chess.fen());
    let mv;
    try { mv = c.move(m); } catch { return; }
    const uci = mv.from + mv.to + (mv.promotion || '');
    const ok = st.accept.includes(uci) || (st.mate && c.isCheckmate());
    board.setPosition(c.fen(), { move: mv });
    sound.forMove(mv, c);
    if (!ok) {
      sound.play('wrong');
      board.setBadge(mv.to, classIcon('mistake', 30));
      board.setMovable(null);
      $('#bubble', main).innerHTML = `<div class="headline">${classIcon('mistake', 20)} Not quite</div>${esc(st.text)}`;
      timers.push(setTimeout(() => showStep(), 1100));
      return;
    }
    busy = true;
    chess = c;
    board.setMovable(null);
    board.setArrows([]);
    board.setBadge(mv.to, classIcon('best', 30));
    sound.play('correct');
    $('#bubble', main).innerHTML = `<div class="headline">${classIcon('best', 20)} Correct!</div>${esc(st.ok || 'Well done!')}`;
    // Opponent reply for continuing lessons
    if (st.reply) {
      let r = st.reply === 'auto' ? null : st.reply[uci];
      if (st.reply === 'auto') {
        const res = await getEngine('analysis').analyse(chess.fen(), { depth: 10 });
        r = res?.bestmove;
      }
      if (r) {
        await new Promise(res => timers.push(setTimeout(res, 700)));
        const rm = chess.move({ from: r.slice(0, 2), to: r.slice(2, 4), promotion: r[4] });
        board.setPosition(chess.fen(), { move: rm });
        sound.forMove(rm, chess);
      }
    }
    $('#foot', main).innerHTML = `<button class="btn primary" style="font-size:16px" id="next">${stepIdx === L.steps.length - 1 ? 'Finish 🎉' : 'Next ▶'}</button>`;
    $('#next', main).onclick = () => advance();
  }

  function advance() {
    stepIdx++;
    if (stepIdx >= L.steps.length) return finish();
    showStep();
  }

  async function skip() {
    if (busy) return;
    busy = true;
    const st = L.steps[stepIdx], nextSt = L.steps[stepIdx + 1];
    // Continuing lessons (no fen on the next step) need the line played out
    if (nextSt && !nextSt.fen) {
      const legal = new Set(chess.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || '')));
      const u = st.accept.find(x => legal.has(x));
      if (u) {
        chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
        let r = st.reply && st.reply !== 'auto' ? st.reply[u] : null;
        if (st.reply === 'auto') r = (await getEngine('analysis').analyse(chess.fen(), { depth: 10 }))?.bestmove;
        if (r) chess.move({ from: r.slice(0, 2), to: r.slice(2, 4), promotion: r[4] });
      }
    }
    advance();
  }

  function finish() {
    store.updateStats(s => { s.lessonsDone = [...new Set([...(s.lessonsDone || []), L.id])]; });
    confetti();
    sound.play('win');
    stepIdx = L.steps.length;
    dots();
    board.setMovable(null);
    const next = LESSONS[LESSONS.indexOf(L) + 1];
    $('#bubble', main).innerHTML = `<div class="headline">🎉 Lesson complete!</div>You finished "${esc(L.title)}". ${next ? `Up next: ${esc(next.title)}.` : 'You completed every lesson!'}`;
    $('#foot', main).innerHTML = `<button class="btn" id="list">📚 All lessons</button>${next ? '<button class="btn primary" style="font-size:16px" id="nextl">Next lesson ▶</button>' : ''}`;
    $('#list', main).onclick = () => go('learn');
    if (next) $('#nextl', main).onclick = () => go('lesson/' + next.id);
  }

  showStep();
  return () => timers.forEach(clearTimeout);
}
