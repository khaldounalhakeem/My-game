// Shared UI helpers.
import { store } from './storage.js';
import { pieceUrl } from './board.js';
import { avatarSvg } from './avatars.js';
import { classIcon, winPct, CLASSES } from './review.js';
import { formatScore, scoreToCp, MATE } from './engine.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function avatar(spec, size = 40) {
  return `<span class="avatar" style="width:${size}px;height:${size}px">${avatarSvg(spec, size)}</span>`;
}

export function playerAvatarSpec() {
  return { bg: '#3d6b9e', skin: '#e0ac69', hair: '#2b1d14', hairStyle: 'short', shirt: '#81b64c' };
}

let toastTimer;
export function toast(msg, ms = 2200) {
  let el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function modal({ title = '', reason = '', body = '', cls = '', onClose, closable = true } = {}) {
  const back = h(`<div class="modal-back"><div class="modal">
    <div class="modal-head ${cls}">${closable ? '<button class="icon-btn modal-close" aria-label="Close">✕</button>' : ''}<h2>${title}</h2>${reason ? `<div class="reason">${reason}</div>` : ''}</div>
    <div class="modal-body"></div></div></div>`);
  const bodyEl = $('.modal-body', back);
  if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
  const close = () => { back.remove(); onClose?.(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape' && closable) close(); };
  document.addEventListener('keydown', onKey);
  if (closable) {
    $('.modal-close', back).onclick = close;
    back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  }
  $('#modal-root').appendChild(back);
  return { el: back, body: bodyEl, close };
}

export function confirmDialog(title, text, okLabel = 'Yes') {
  return new Promise(resolve => {
    const m = modal({ title, body: `<p class="muted" style="text-align:center;margin:0 0 6px">${text}</p><div class="btn-row"><button class="btn" data-a="no">Cancel</button><button class="btn primary" data-a="yes">${okLabel}</button></div>`, onClose: () => resolve(false) });
    $('[data-a=no]', m.el).onclick = () => { m.close(); };
    $('[data-a=yes]', m.el).onclick = () => { resolve(true); m.el.remove(); };
  });
}

// ---- Notation ----
const FIG = { w: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' }, b: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' } };
export function fmtSan(san, color) {
  if (!store.settings.figurine) return esc(san);
  const m = san.match(/^([KQRBN])(.*)$/);
  if (m) return `<span class="fig">${FIG.w[m[1]]}</span>${esc(m[2])}`;
  const p = san.match(/^(.*=)([QRBN])(.*)$/);
  if (p) return `${esc(p[1])}<span class="fig">${FIG.w[p[2]]}</span>${esc(p[3])}`;
  return esc(san);
}

/**
 * Render a move list. moves: [{san, color, cls?}], current: index of selected ply (-1 = start).
 */
export function renderMoveList(el, moves, current, onPick, { startPly = 0 } = {}) {
  let html = '<div class="moves">';
  const offset = startPly % 2; // when the game starts with black to move
  const rows = Math.ceil((moves.length + offset) / 2);
  for (let r = 0; r < rows; r++) {
    const num = Math.floor(startPly / 2) + r + 1;
    html += `<div class="move-row"><span class="num">${num}.</span>`;
    for (let c = 0; c < 2; c++) {
      const i = r * 2 + c - offset;
      const m = moves[i];
      if (i < 0 || !m) { html += '<span></span>'; continue; }
      html += `<span class="mv ${i === current ? 'current' : ''}" data-i="${i}">${m.cls ? classIcon(m.cls, 16) : ''}${fmtSan(m.san, m.color)}</span>`;
    }
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
  el.querySelectorAll('.mv').forEach(x => x.onclick = () => onPick(+x.dataset.i));
  const cur = el.querySelector('.mv.current');
  if (cur) {
    const box = el.closest('.panel-body') || el;
    const top = cur.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 40) box.scrollTop = top - box.clientHeight / 2;
  } else if (current === moves.length - 1 || current == null) {
    const box = el.closest('.panel-body');
    if (box) box.scrollTop = box.scrollHeight;
  }
}

// ---- Captured pieces / material ----
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
function countPieces(fen) {
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const ch of fen.split(' ')[0]) {
    const t = ch.toLowerCase();
    if (t in count.w) count[ch === t ? 'b' : 'w'][t]++;
  }
  return count;
}

export function capturedHtml(chess, color, startFen) {
  // pieces of the opponent that `color` has captured (relative to the starting position)
  const opp0 = color === 'w' ? 'b' : 'w';
  const start = startFen ? countPieces(startFen)[opp0] : { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'k') count[p.color][p.type]++;
  const opp = color === 'w' ? 'b' : 'w';
  let html = '';
  let first = true;
  for (const t of ['p', 'n', 'b', 'r', 'q']) {
    const missing = Math.max(0, start[t] - count[opp][t]);
    for (let i = 0; i < missing; i++) {
      html += `<span class="cap ${i === 0 && !first ? 'gap' : ''}" style="background-image:url(${pieceUrl(opp + t.toUpperCase())})"></span>`;
    }
    if (missing) first = false;
  }
  const mat = c => Object.entries(count[c]).reduce((a, [t, n]) => a + VAL[t] * n, 0);
  const diff = mat(color) - mat(opp);
  if (diff > 0) html += `<span class="diff">+${diff}</span>`;
  return html;
}

export function fmtClock(ms) {
  if (ms == null) return '';
  ms = Math.max(0, ms);
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60), s = Math.floor(totalSec % 60);
  if (totalSec < 20) return `${m}:${String(s).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---- Eval bar ----
export function updateEvalBar(el, line, flipped) {
  if (!el) return;
  el.classList.toggle('flipped', !!flipped);
  const fill = el.querySelector('.fill');
  const top = el.querySelector('.num.top'), bottom = el.querySelector('.num.bottom');
  let pct = 50, txt = '0.0';
  if (line) {
    const cp = typeof line === 'number' ? line : scoreToCp(line);
    pct = line.mate === 0 ? (cp > 0 ? 100 : 0) : Math.max(4, Math.min(96, winPct(cp)));
    if (Math.abs(cp) >= MATE - 1000) pct = cp > 0 ? 100 : 0;
    txt = typeof line === 'number' ? (cp / 100).toFixed(1) : formatScore(line).replace('+', '');
  }
  fill.style.height = pct + '%';
  const whiteBetter = pct >= 50;
  top.textContent = whiteBetter ? '' : txt.replace('-', '');
  bottom.textContent = whiteBetter ? txt.replace('-', '') : '';
}

export const evalBarHtml = () => '<div class="evalbar"><div class="fill" style="height:50%"></div><span class="num top"></span><span class="num bottom">0.0</span></div>';

// ---- Eval graph (SVG) ----
export function renderGraph(svg, scores, current, classes, onPick) {
  const W = 600, H = 100;
  const n = scores.length;
  if (!n) { svg.innerHTML = ''; return; }
  const pts = scores.map((s, i) => [n === 1 ? 0 : i / (n - 1) * W, H - winPct(s) / 100 * H]);
  const area = `M0,${H} ` + pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${W},${H} Z`;
  let dots = '';
  (classes || []).forEach((c, i) => {
    if (!['blunder', 'mistake', 'miss', 'brilliant', 'great', 'inaccuracy'].includes(c)) return;
    const p = pts[i + 1];
    if (p) dots += `<circle cx="${p[0]}" cy="${p[1]}" r="${c === 'inaccuracy' ? 3 : 4.5}" fill="${CLASSES[c].color}" stroke="#222" stroke-width="1"/>`;
  });
  const cx = current != null && pts[current + 1] ? pts[current + 1][0] : null;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = `<path d="${area}" fill="#fff"/><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#888" stroke-width="1" stroke-dasharray="3 3"/>${cx != null ? `<line x1="${cx}" y1="0" x2="${cx}" y2="${H}" stroke="#81b64c" stroke-width="2"/>` : ''}${dots}`;
  svg.onclick = e => {
    const r = svg.getBoundingClientRect();
    const i = Math.round((e.clientX - r.left) / r.width * (n - 1)) - 1;
    onPick?.(Math.max(-1, Math.min(n - 2, i)));
  };
}

export function toggle(id, label, checked) {
  return `<div class="toggle-row"><span>${label}</span><label class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span></span></label></div>`;
}

export function confetti() {
  const c = document.createElement('canvas');
  c.className = 'fx-confetti';
  c.width = innerWidth; c.height = innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const colors = ['#81b64c', '#f6c343', '#26c2a3', '#fa412d', '#749bbf', '#fff'];
  const parts = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, r: 4 + Math.random() * 5, a: Math.random() * 6, col: colors[Math.floor(Math.random() * colors.length)] }));
  let t = 0;
  const step = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.a += 0.1; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.col; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }
    if (++t < 200) requestAnimationFrame(step); else c.remove();
  };
  step();
}
