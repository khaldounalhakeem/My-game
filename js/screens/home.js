import { store } from '../storage.js';
import { go } from '../app.js';
import { Board } from '../board.js';
import { BOTS } from '../bots.js';
import { avatar, esc } from '../ui.js';
import { coachById } from '../coaches.js';

export function render(main) {
  const st = store.stats;
  const coach = coachById(store.settings.coachId);
  const recent = store.games.slice(0, 5);
  main.innerHTML = `<div class="home">
    <div class="home-hero">
      <div>
        <h1>Play chess. Review. Improve.</h1>
        <p>Challenge ${BOTS.length}+ bots from total beginner to near-perfect, get a full game review with brilliant moves, blunders and accuracy, learn with coaches, and train with puzzles — all powered by Stockfish 19 right in your browser.</p>
        <div class="row" style="gap:12px;flex-wrap:wrap">
          <button class="btn primary" data-act="bots">🤖 Play Bots</button>
          <button class="btn primary" style="background:#5d9bd5;box-shadow:0 4px 0 #3b6e9e" data-act="coach">🧑‍🏫 Play with Coach</button>
          <button class="btn" data-act="puzzles" style="padding:14px 22px;font-size:18px">🧩 Puzzles</button>
        </div>
      </div>
      <div class="hero-board" id="hero-board"></div>
    </div>
    <div class="stat-row">
      <div class="stat"><b>${st.rating}</b><span>Bot rating</span></div>
      <div class="stat"><b>${st.puzzleRating}</b><span>Puzzle rating</span></div>
      <div class="stat"><b>${st.wins}/${st.draws}/${st.losses}</b><span>Win / Draw / Loss</span></div>
      <div class="stat"><b>${st.rushBest}</b><span>Puzzle Rush best</span></div>
      <div class="stat"><b>${st.solved.length}</b><span>Puzzles solved</span></div>
    </div>
    <div class="cards">
      ${card('bots', '🤖', 'Play vs Bots', 'From Random Randy (100) to Nova (3000) and Stockfish levels 1–10.')}
      ${card('coach', '🧑‍🏫', 'Play with a Coach', `${esc(coach.name)} gives live feedback, warns about threats and lets you retry mistakes.`)}
      ${card('friend', '👥', 'Play a Friend', 'Pass-and-play on one device with chess clocks.')}
      ${card('puzzles', '🧩', 'Puzzles', 'Rated tactics, Puzzle Rush and themed training.')}
      ${card('learn', '🎓', 'Lessons', 'Interactive lessons: piece moves, mates, tactics, openings, endgames.')}
      ${card('analysis', '🔍', 'Analysis Board', 'Stockfish 19 with multiple lines. Import PGN or FEN.')}
      ${card('review', '⭐', 'Game Review', 'Paste any PGN and get brilliant/best/blunder classifications and accuracy.')}
      ${card('archive', '📜', 'My Games', `${store.games.length} saved game${store.games.length === 1 ? '' : 's'}. Review any of them.`)}
    </div>
    ${recent.length ? `<h2 class="section">Recent games</h2><div class="list">${recent.map(g => `
      <div class="list-item" style="cursor:pointer" data-review="${g.id}">
        <span class="res-badge ${g.outcome}">${g.outcome === 'win' ? '+' : g.outcome === 'loss' ? '−' : '='}</span>
        ${g.opponentAvatar ? avatar(g.opponentAvatar, 36) : ''}
        <div class="meta"><b>vs ${esc(g.opponent)} ${g.opponentRating ? `(${g.opponentRating})` : ''}</b><span>${esc(g.reason || '')} · ${g.moves.length} moves · ${new Date(g.date).toLocaleDateString()}</span></div>
        ${g.accuracy ? `<span class="muted">${g.accuracy}%</span>` : ''}
        <button class="btn small">⭐ Review</button>
      </div>`).join('')}</div>` : ''}
  </div>`;
  const b = new Board(main.querySelector('#hero-board'), { interactive: false });
  const demo = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4', 'cxd4', 'Bb4+', 'Nc3', 'Nxe4', 'O-O', 'Bxc3', 'd5', 'Bf6', 'Re1', 'Ne7', 'Rxe4', 'd6', 'Bg5', 'Bxg5', 'Nxg5', 'h6'];
  let i = 0;
  let timer;
  import('../../vendor/chess.js').then(({ Chess }) => {
    const c = new Chess();
    b.setPosition(c.fen());
    timer = setInterval(() => {
      if (i >= demo.length) { c.reset(); i = 0; b.setPosition(c.fen(), { lastMove: null }); return; }
      let m = null;
      try { m = c.move(demo[i++]); } catch { i = demo.length; return; }
      b.setPosition(c.fen(), { move: m });
    }, 1300);
  });
  main.querySelectorAll('[data-act]').forEach(el => el.onclick = () => {
    const a = el.dataset.act;
    if (a === 'coach') go('bots', { coach: true });
    else if (a === 'review') go('analysis', { reviewPrompt: true });
    else go(a);
  });
  main.querySelectorAll('[data-review]').forEach(el => el.onclick = () => go('review/' + el.dataset.review));
  return () => clearInterval(timer);
}

const card = (act, ico, title, text) => `<div class="card" data-act="${act}"><div class="big-ico">${ico}</div><div><h3>${title}</h3><p>${text}</p></div></div>`;
