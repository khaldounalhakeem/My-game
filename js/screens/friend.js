import { store } from '../storage.js';
import { go } from '../app.js';
import { TIME_CONTROLS } from './bots.js';
import { $, toggle, esc, toast } from '../ui.js';

export function render(main) {
  let tc = 'none';
  main.innerHTML = `<div class="page" style="max-width:520px">
    <h1>👥 Play a Friend</h1>
    <div class="settings-section">
      <div class="opt-group"><label class="lbl">White player</label><input type="text" id="wn" value="${esc(store.settings.playerName)}" maxlength="24"></div>
      <div class="opt-group" style="margin-top:10px"><label class="lbl">Black player</label><input type="text" id="bn" value="Friend" maxlength="24"></div>
      <div class="opt-group" style="margin-top:14px"><label class="lbl">Time control</label><div class="seg" id="tc">${TIME_CONTROLS.map(t => `<button data-v="${t.id}">${t.label}</button>`).join('')}</div></div>
      <div style="margin-top:10px">${toggle('autoflip', 'Flip board after each move', store.settings.autoFlipFriend)}</div>
      <div class="opt-group" style="margin-top:10px"><label class="lbl">Start from FEN (optional)</label><input type="text" id="fen" placeholder="Leave empty for the standard starting position"></div>
    </div>
    <button class="btn primary big" id="start">Start Game</button>
  </div>`;
  const seg = $('#tc', main);
  const paint = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === tc));
  seg.querySelectorAll('button').forEach(b => b.onclick = () => { tc = b.dataset.v; paint(); });
  paint();
  $('#autoflip', main).onchange = e => store.setSetting('autoFlipFriend', e.target.checked);
  $('#start', main).onclick = async () => {
    const t = TIME_CONTROLS.find(x => x.id === tc);
    const fen = $('#fen', main).value.trim();
    if (fen) {
      const { validateFen } = await import('../../vendor/chess.js');
      const v = validateFen(fen);
      if (!v.ok) { toast('Invalid FEN: ' + v.error); return; }
    }
    go('play', {
      mode: 'friend', playerColor: 'w', startFen: fen || undefined,
      whiteName: $('#wn', main).value.trim() || 'White', blackName: $('#bn', main).value.trim() || 'Black',
      time: t.base ? { base: t.base * 1000, inc: t.inc * 1000, label: t.label } : null, assist: {},
    });
  };
}
