import { store } from '../storage.js';
import { go } from '../app.js';
import { avatar, esc, confirmDialog, toast } from '../ui.js';

export function render(main) {
  let filter = 'all';
  const paint = () => {
    const games = store.games.filter(g => filter === 'all' || g.outcome === filter);
    const st = store.stats;
    main.innerHTML = `<div class="page"><h1>📜 My Games</h1>
      <div class="stat-row">
        <div class="stat"><b>${st.rating}</b><span>Bot rating</span></div>
        <div class="stat"><b>${store.games.length}</b><span>Games</span></div>
        <div class="stat"><b style="color:var(--green-h)">${st.wins}</b><span>Wins</span></div>
        <div class="stat"><b>${st.draws}</b><span>Draws</span></div>
        <div class="stat"><b style="color:#ff7769">${st.losses}</b><span>Losses</span></div>
      </div>
      <div class="theme-chips" style="margin-bottom:12px">${[['all', 'All'], ['win', 'Wins'], ['loss', 'Losses'], ['draw', 'Draws']].map(([k, l]) => `<button class="chip ${filter === k ? 'active' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      ${games.length ? `<div class="list">${games.map(g => `
        <div class="list-item">
          <span class="res-badge ${g.outcome}">${g.outcome === 'win' ? '+' : g.outcome === 'loss' ? '−' : '='}</span>
          ${g.opponentAvatar ? avatar(g.opponentAvatar, 40) : '<span class="avatar" style="width:40px;height:40px;background:#555;display:grid;place-items:center">👥</span>'}
          <div class="meta"><b>${esc(g.white)} vs ${esc(g.black)} <span class="muted" style="font-weight:400">${g.result}</span></b>
            <span>${esc(g.reason || '')} · ${Math.ceil(g.moves.length / 2)} moves · ${g.time ? esc(g.time) + ' · ' : ''}${new Date(g.date).toLocaleString()}${g.accuracy ? ` · 🎯 ${g.accuracy}%` : ''}${g.delta ? ` · ${g.delta > 0 ? '+' : ''}${g.delta}` : ''}</span></div>
          <button class="btn small" data-r="${g.id}">⭐ Review</button>
          <button class="btn small" data-a="${g.id}" title="Analyse">🔍</button>
          <button class="btn small" data-d="${g.id}" title="Download PGN">⬇</button>
          <button class="btn small danger" data-x="${g.id}" title="Delete">🗑</button>
        </div>`).join('')}</div>` : '<p class="muted">No games yet. Go play a bot!</p><button class="btn primary" id="playnow">🤖 Play Bots</button>'}
    </div>`;
    main.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; paint(); });
    main.querySelectorAll('[data-r]').forEach(b => b.onclick = () => go('review/' + b.dataset.r));
    main.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { const g = store.games.find(x => x.id === b.dataset.a); go('analysis', { startFen: g.startFen, moves: g.moves }); });
    main.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
      const g = store.games.find(x => x.id === b.dataset.d);
      const blob = new Blob([g.pgn], { type: 'application/x-chess-pgn' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${g.white}-vs-${g.black}.pgn`.replace(/\s+/g, '_'); a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    main.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => {
      if (await confirmDialog('Delete game?', 'This cannot be undone.', 'Delete')) { store.deleteGame(b.dataset.x); try { localStorage.removeItem('chesshub.review.' + b.dataset.x); } catch { /* ignore */ } toast('Deleted'); paint(); }
    });
    main.querySelector('#playnow')?.addEventListener('click', () => go('bots'));
  };
  paint();
}
