import { store } from '../storage.js';
import { applySettings } from '../app.js';
import { Board, pieceUrl } from '../board.js';
import { $, esc, toggle, confirmDialog, toast } from '../ui.js';

export const BOARD_THEMES = [
  ['green', 'Green', '#ebecd0', '#739552'], ['brown', 'Brown', '#f0d9b5', '#b58863'], ['blue', 'Blue', '#dee3e6', '#8ca2ad'],
  ['icy', 'Icy Sea', '#d9e4e8', '#7b9fb3'], ['purple', 'Purple', '#efefef', '#8877b7'], ['coral', 'Coral', '#b1e4b9', '#70a2a3'],
  ['tournament', 'Tournament', '#ebece8', '#316549'], ['dash', 'Dash', '#bdc3c7', '#5f6b73'], ['walnut', 'Walnut', '#e8cfa7', '#a0714f'],
  ['wood', 'Wood', '#e3c193', '#9c6a3c'], ['marble', 'Marble', '#e9e6e1', '#8f8a85'], ['pink', 'Bubblegum', '#f5e1e8', '#e3a1b9'],
  ['sand', 'Sand', '#f3e5c0', '#c4a363'], ['night', 'Night', '#9ea7b1', '#3f4b57'],
];
export const PIECE_SETS = [
  ['staunty', 'Staunty'], ['cburnett', 'Classic'], ['maestro', 'Maestro'], ['merida', 'Merida'], ['alpha', 'Alpha'], ['california', 'California'],
  ['cardinal', 'Cardinal'], ['tatiana', 'Tatiana'], ['fresca', 'Fresca'], ['chessnut', 'Chessnut'], ['fantasy', 'Fantasy'], ['pixel', 'Pixel'],
];

export function render(main) {
  const s = store.settings;
  main.innerHTML = `<div class="page" style="max-width:1100px"><h1>⚙️ Settings</h1>
    <div class="settings-grid">
      <div>
        <div class="settings-section"><h3>Profile</h3>
          <div class="opt-group"><label class="lbl">Display name</label><input type="text" id="name" maxlength="24" value="${esc(s.playerName)}"></div></div>
        <div class="settings-section"><h3>Board</h3><div class="theme-grid">${BOARD_THEMES.map(([id, label, l, d]) => `
          <div class="theme-opt ${s.boardTheme === id ? 'active' : ''}" data-theme="${id}"><div class="theme-sw"><div style="background:${l}"></div><div style="background:${d}"></div><div style="background:${d}"></div><div style="background:${l}"></div></div>${label}</div>`).join('')}</div></div>
        <div class="settings-section"><h3>Pieces</h3><div class="theme-grid" style="grid-template-columns:repeat(auto-fill,minmax(96px,1fr))">${PIECE_SETS.map(([id, label]) => `
          <div class="piece-opt ${s.pieceSet === id ? 'active' : ''}" data-set="${id}"><div class="pp"><div style="background-image:url(${pieceUrl('wN', id)})"></div><div style="background-image:url(${pieceUrl('bQ', id)})"></div></div>${label}</div>`).join('')}</div></div>
        <div class="settings-section"><h3>Gameplay</h3>
          ${toggle('showLegal', 'Show legal moves', s.showLegal)}
          ${toggle('highlightLast', 'Highlight last move', s.highlightLast)}
          ${toggle('premoves', 'Allow premoves', s.premoves)}
          ${toggle('autoQueen', 'Always promote to queen', s.autoQueen)}
          ${toggle('confirmResign', 'Confirm before resigning', s.confirmResign)}
          ${toggle('rightClickArrows', 'Right-click arrows & highlights', s.rightClickArrows)}
          ${toggle('figurine', 'Figurine notation (♘f3)', s.figurine)}
          <div class="toggle-row"><span>Coordinates</span><select id="coordinates" style="width:auto">${['inside', 'none'].map(v => `<option value="${v}" ${s.coordinates === v ? 'selected' : ''}>${v === 'inside' ? 'Inside board' : 'Hidden'}</option>`).join('')}</select></div>
          <div class="toggle-row"><span>Piece animation</span><select id="animation" style="width:auto">${[[0, 'None'], [120, 'Fast'], [200, 'Normal'], [320, 'Slow']].map(([v, l]) => `<option value="${v}" ${s.animation == v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="toggle-row"><span>Game Review depth</span><select id="reviewDepth" style="width:auto">${[[10, 'Fast (10)'], [12, 'Quick (12)'], [14, 'Standard (14)'], [16, 'Deep (16)'], [18, 'Deeper (18)']].map(([v, l]) => `<option value="${v}" ${s.reviewDepth == v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <div class="settings-section"><h3>Sound</h3>
          ${toggle('sound', 'Sound effects', s.sound)}
          <div class="toggle-row"><span>Volume</span><input type="range" id="volume" min="0" max="1" step="0.05" value="${s.volume}" style="width:160px"></div></div>
        <div class="settings-section"><h3>Data</h3>
          <p class="muted" style="margin-top:0;font-size:13px">Everything is stored in this browser only.</p>
          <div class="row" style="flex-wrap:wrap"><button class="btn small" id="export">⬇ Export all games (PGN)</button><button class="btn small danger" id="reset">Reset everything</button></div></div>
      </div>
      <div><div style="position:sticky;top:20px"><div id="preview"></div>
        <p class="muted" style="font-size:12px;text-align:center">Preview · try dragging pieces · right-click to draw arrows</p>
        <div class="settings-section" style="font-size:13px"><h3>Keyboard shortcuts</h3>
          <div class="toggle-row"><span>Previous / next move</span><span><span class="kbd">←</span> <span class="kbd">→</span></span></div>
          <div class="toggle-row"><span>First / last move</span><span><span class="kbd">↑</span> <span class="kbd">↓</span></span></div>
          <div class="toggle-row"><span>Flip board</span><span class="kbd">F</span></div>
          <div class="toggle-row"><span>Arrow colours</span><span><span class="kbd">Shift</span> <span class="kbd">Alt</span> <span class="kbd">Ctrl</span> + right-drag</span></div>
        </div></div></div>
    </div></div>`;

  const board = new Board($('#preview', main), {});
  board.setPosition('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', { lastMove: ['g8', 'f6'] });
  board.setMovable('both');
  import('../../vendor/chess.js').then(({ Chess }) => {
    const c = new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
    board.setLegalMoves(c.moves({ verbose: true }));
    board.opts.onMove = m => { const mv = c.move(m); board.setPosition(c.fen(), { move: mv }); board.setLegalMoves(c.moves({ verbose: true })); };
  });
  const refresh = () => { applySettings(); board.refreshPieceSet(); board.renderCoords(); board.renderMarks(); };

  $('#name', main).onchange = e => { store.setSetting('playerName', e.target.value.trim() || 'You'); applySettings(); };
  main.querySelectorAll('[data-theme]').forEach(el => el.onclick = () => { store.setSetting('boardTheme', el.dataset.theme); main.querySelectorAll('[data-theme]').forEach(x => x.classList.toggle('active', x === el)); refresh(); });
  main.querySelectorAll('[data-set]').forEach(el => el.onclick = () => { store.setSetting('pieceSet', el.dataset.set); main.querySelectorAll('[data-set]').forEach(x => x.classList.toggle('active', x === el)); refresh(); });
  for (const k of ['showLegal', 'highlightLast', 'premoves', 'autoQueen', 'confirmResign', 'rightClickArrows', 'figurine', 'sound']) {
    $('#' + k, main).onchange = e => { store.setSetting(k, e.target.checked); refresh(); };
  }
  for (const k of ['coordinates', 'animation', 'reviewDepth']) {
    $('#' + k, main).onchange = e => { const v = e.target.value; store.setSetting(k, isNaN(+v) ? v : +v); refresh(); };
  }
  $('#volume', main).oninput = e => store.setSetting('volume', +e.target.value);
  $('#export', main).onclick = () => {
    if (!store.games.length) { toast('No games yet'); return; }
    const blob = new Blob([store.games.map(g => g.pgn).join('\n\n')], { type: 'application/x-chess-pgn' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'chess-arena-games.pgn'; a.click();
  };
  $('#reset', main).onclick = async () => { if (await confirmDialog('Reset everything?', 'Ratings, games and settings will be erased.', 'Reset')) store.reset(); };
}
