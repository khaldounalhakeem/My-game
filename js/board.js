// Interactive chessboard: click/drag moves, legal-move hints, premoves,
// right-click arrows and highlights, animations, promotion picker, badges.
import { store } from './storage.js';

const FILES = 'abcdefgh';
const sqToXY = (sq, flipped) => {
  const f = FILES.indexOf(sq[0]), r = +sq[1] - 1;
  return flipped ? [7 - f, r] : [f, 7 - r];
};
const xyToSq = (x, y, flipped) => flipped ? FILES[7 - x] + (y + 1) : FILES[x] + (8 - y);

export function pieceUrl(piece, set = store.settings.pieceSet) {
  // piece like 'wK'
  return `assets/pieces/${set}/${piece}.svg`;
}

function parseFen(fen) {
  const map = {};
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += +ch;
      else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        map[FILES[f] + (8 - i)] = color + ch.toUpperCase();
        f++;
      }
    }
  });
  return map;
}

export class Board {
  constructor(el, opts = {}) {
    this.el = el;
    this.opts = opts;
    this.flipped = opts.orientation === 'b';
    this.pieces = {};          // square -> element
    this.position = {};
    this.legal = new Map();    // from -> [{to, promotion}]
    this.selected = null;
    this.lastMove = null;
    this.checkSq = null;
    this.arrows = [];          // user arrows {from,to,color}
    this.autoArrows = [];      // program arrows
    this.marks = {};           // user square highlights sq -> color
    this.badges = {};          // sq -> {cls, html}
    this.premove = null;
    this.interactive = opts.interactive !== false;
    this.movableColor = opts.movableColor || 'w'; // 'w' | 'b' | 'both' | null
    this.turnColor = 'w';
    this.build();
  }

  build() {
    this.el.classList.add('board');
    this.el.innerHTML = `
      <div class="board-squares"></div>
      <div class="board-coords"></div>
      <div class="board-layer marks"></div>
      <div class="board-layer pieces"></div>
      <svg class="board-arrows" viewBox="0 0 800 800"><defs></defs></svg>
      <div class="board-layer badges"></div>
      <div class="promo-picker hidden"></div>`;
    this.$sq = this.el.querySelector('.board-squares');
    this.$coords = this.el.querySelector('.board-coords');
    this.$marks = this.el.querySelector('.marks');
    this.$pieces = this.el.querySelector('.pieces');
    this.$arrows = this.el.querySelector('.board-arrows');
    this.$badges = this.el.querySelector('.badges');
    this.$promo = this.el.querySelector('.promo-picker');
    for (let i = 0; i < 64; i++) {
      const d = document.createElement('div');
      d.className = 'sq ' + (((i % 8) + Math.floor(i / 8)) % 2 ? 'dark' : 'light');
      this.$sq.appendChild(d);
    }
    this.renderCoords();
    this.bindEvents();
  }

  renderCoords() {
    const mode = store.settings.coordinates;
    this.el.dataset.coords = mode;
    let html = '';
    if (mode !== 'none') {
      for (let i = 0; i < 8; i++) {
        const file = this.flipped ? FILES[7 - i] : FILES[i];
        const rank = this.flipped ? i + 1 : 8 - i;
        const fileColor = (i + 7) % 2 ? 'dark' : 'light';   // bottom row color for this column
        const rankColor = i % 2 ? 'dark' : 'light';
        html += `<span class="coord file ${fileColor === 'light' ? 'on-light' : 'on-dark'}" style="left:${i * 12.5}%">${file}</span>`;
        html += `<span class="coord rank ${rankColor === 'light' ? 'on-light' : 'on-dark'}" style="top:${i * 12.5}%">${rank}</span>`;
      }
    }
    this.$coords.innerHTML = html;
  }

  setOrientation(color) { if ((color === 'b') !== this.flipped) this.flip(); }
  flip() {
    this.flipped = !this.flipped;
    this.renderCoords();
    for (const sq in this.pieces) this.placeEl(this.pieces[sq], sq);
    this.renderMarks();
    this.renderArrows();
    this.renderBadges();
  }

  placeEl(el, sq) {
    const [x, y] = sqToXY(sq, this.flipped);
    el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
  }

  makePieceEl(piece, sq) {
    const el = document.createElement('div');
    el.className = 'piece';
    el.dataset.piece = piece;
    el.style.backgroundImage = `url(${pieceUrl(piece)})`;
    this.placeEl(el, sq);
    this.$pieces.appendChild(el);
    return el;
  }

  refreshPieceSet() {
    for (const sq in this.pieces) this.pieces[sq].style.backgroundImage = `url(${pieceUrl(this.pieces[sq].dataset.piece)})`;
  }

  /**
   * Show a position. opts.move (verbose chess.js move) animates the change.
   */
  setPosition(fen, opts = {}) {
    const next = parseFen(fen);
    this.turnColor = fen.split(' ')[1];
    const anim = opts.animate !== false && opts.move ? store.settings.animation : 0;
    const old = this.pieces;
    const nextEls = {};
    const used = new Set();

    const move = opts.move;
    if (move && anim && old[move.from]) {
      const moving = [[move.from, move.to]];
      if (move.flags && move.flags.includes('k')) moving.push([move.color === 'w' ? 'h1' : 'h8', move.color === 'w' ? 'f1' : 'f8']);
      if (move.flags && move.flags.includes('q')) moving.push([move.color === 'w' ? 'a1' : 'a8', move.color === 'w' ? 'd1' : 'd8']);
      for (const [from, to] of moving) {
        const el = old[from];
        if (!el || !next[to]) continue;
        el.style.transition = `transform ${anim}ms ease`;
        el.style.zIndex = 5;
        this.placeEl(el, to);
        if (el.dataset.piece !== next[to]) {
          el.dataset.piece = next[to];
          setTimeout(() => { el.style.backgroundImage = `url(${pieceUrl(next[to])})`; }, anim);
        }
        const clear = () => { el.style.transition = ''; el.style.zIndex = ''; };
        setTimeout(clear, anim + 20);
        nextEls[to] = el;
        used.add(el);
      }
    }
    // Keep elements that already sit on the right square
    for (const sq in next) {
      if (nextEls[sq]) continue;
      const el = old[sq];
      if (el && !used.has(el) && el.dataset.piece === next[sq]) { nextEls[sq] = el; used.add(el); }
    }
    // Remove the rest (captured pieces fade out)
    for (const sq in old) {
      const el = old[sq];
      if (!used.has(el)) {
        if (anim) { el.classList.add('fading'); setTimeout(() => el.remove(), anim); }
        else el.remove();
      }
    }
    // Create missing
    for (const sq in next) {
      if (!nextEls[sq]) nextEls[sq] = this.makePieceEl(next[sq], sq);
      else if (!anim || !(move && (sq === move.to))) this.placeEl(nextEls[sq], sq);
    }
    this.pieces = nextEls;
    this.position = next;
    this.lastMove = opts.lastMove !== undefined ? opts.lastMove : (move ? [move.from, move.to] : this.lastMove);
    this.checkSq = opts.check || null;
    this.selected = null;
    this.renderMarks();
  }

  setLegalMoves(moves) {
    // moves: verbose chess.js moves for the side that may move
    this.legal = new Map();
    for (const m of moves) {
      if (!this.legal.has(m.from)) this.legal.set(m.from, []);
      this.legal.get(m.from).push(m);
    }
    this.renderMarks();
  }

  setMovable(color) { this.movableColor = color; }

  setArrows(list) { this.autoArrows = list || []; this.renderArrows(); }
  clearUserDrawings() { this.arrows = []; this.marks = {}; this.renderArrows(); this.renderMarks(); }

  setBadge(sq, html) {
    this.badges = sq ? { [sq]: html } : {};
    this.renderBadges();
  }

  renderBadges() {
    this.$badges.innerHTML = '';
    for (const sq in this.badges) {
      const [x, y] = sqToXY(sq, this.flipped);
      const d = document.createElement('div');
      d.className = 'sq-badge';
      d.style.left = `${(x + 1) * 12.5}%`;
      d.style.top = `${y * 12.5}%`;
      d.innerHTML = this.badges[sq];
      this.$badges.appendChild(d);
    }
  }

  renderMarks() {
    const s = store.settings;
    let html = '';
    const cell = (sq, cls, style = '') => {
      const [x, y] = sqToXY(sq, this.flipped);
      return `<div class="mark ${cls}" style="left:${x * 12.5}%;top:${y * 12.5}%;${style}"></div>`;
    };
    if (this.lastMove && s.highlightLast) for (const sq of this.lastMove) html += cell(sq, 'last');
    if (this.premove) { html += cell(this.premove.from, 'premove'); html += cell(this.premove.to, 'premove'); }
    for (const sq in this.marks) html += cell(sq, 'user-' + this.marks[sq]);
    if (this.checkSq) html += cell(this.checkSq, 'check');
    if (this.selected) {
      html += cell(this.selected, 'selected');
      if (s.showLegal) {
        const targets = this.targetsFor(this.selected);
        for (const t of targets) html += cell(t.to, this.position[t.to] || t.flags?.includes('e') ? 'hint-capture' : 'hint-move');
      }
    }
    if (this.hoverSq) html += cell(this.hoverSq, 'hover');
    this.$marks.innerHTML = html;
  }

  targetsFor(from) {
    if (this.isMyTurn()) return this.legal.get(from) || [];
    // premove targets: pseudo-legal geometry for our piece
    return this.premoveTargets(from);
  }

  isMyTurn() {
    return this.movableColor === 'both' || this.movableColor === this.turnColor;
  }

  canPick(sq) {
    if (!this.interactive || !this.movableColor) return false;
    const p = this.position[sq];
    if (!p) return false;
    if (this.movableColor === 'both') return p[0] === this.turnColor;
    if (p[0] !== this.movableColor) return false;
    if (this.isMyTurn()) return true;
    return store.settings.premoves && this.opts.allowPremoves;
  }

  premoveTargets(from) {
    const p = this.position[from];
    if (!p) return [];
    const [color, type] = [p[0], p[1]];
    const f = FILES.indexOf(from[0]), r = +from[1] - 1;
    const out = [];
    const add = (df, dr) => { const nf = f + df, nr = r + dr; if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) out.push({ to: FILES[nf] + (nr + 1) }); };
    const ray = dirs => dirs.forEach(([df, dr]) => { for (let k = 1; k < 8; k++) add(df * k, dr * k); });
    if (type === 'N') [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(d => add(...d));
    if (type === 'B') ray([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    if (type === 'R') ray([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    if (type === 'Q') ray([[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]);
    if (type === 'K') { [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(d => add(...d)); if (from === (color === 'w' ? 'e1' : 'e8')) { add(2, 0); add(-2, 0); } }
    if (type === 'P') {
      const dir = color === 'w' ? 1 : -1;
      add(0, dir); add(1, dir); add(-1, dir);
      if ((color === 'w' && r === 1) || (color === 'b' && r === 6)) add(0, 2 * dir);
    }
    return out;
  }

  setPremove(pm) { this.premove = pm; this.renderMarks(); }

  // ---------- Input ----------
  squareFromEvent(e) {
    const rect = this.el.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / rect.width * 8);
    const y = Math.floor((e.clientY - rect.top) / rect.height * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return xyToSq(x, y, this.flipped);
  }

  bindEvents() {
    this.el.addEventListener('contextmenu', e => e.preventDefault());
    this.el.addEventListener('pointerdown', e => this.onDown(e));
    window.addEventListener('pointermove', e => this.onMoveEv(e));
    window.addEventListener('pointerup', e => this.onUp(e));
  }

  onDown(e) {
    if (!this.$promo.classList.contains('hidden')) return;
    const sq = this.squareFromEvent(e);
    if (!sq) return;
    if (e.button === 2) {
      if (!store.settings.rightClickArrows) return;
      this.rightStart = sq;
      return;
    }
    if (e.button !== 0) return;
    // left click clears drawings
    if (this.arrows.length || Object.keys(this.marks).length) { this.arrows = []; this.marks = {}; this.renderArrows(); }
    if (this.premove && !this.selected) { this.setPremove(null); this.opts.onPremove?.(null); }

    if (this.selected && this.selected !== sq) {
      const targets = this.targetsFor(this.selected);
      if (targets.some(t => t.to === sq)) { this.tryMove(this.selected, sq); return; }
    }
    if (this.canPick(sq)) {
      e.preventDefault();
      const wasSelected = this.selected === sq;
      this.selected = sq;
      this.renderMarks();
      const el = this.pieces[sq];
      const rect = this.el.getBoundingClientRect();
      this.drag = { from: sq, el, startX: e.clientX, startY: e.clientY, rect, moved: false, wasSelected };
      this.el.setPointerCapture?.(e.pointerId);
    } else {
      this.selected = null;
      this.renderMarks();
    }
  }

  onMoveEv(e) {
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    const size = d.rect.width / 8;
    const x = e.clientX - d.rect.left - size / 2, y = e.clientY - d.rect.top - size / 2;
    d.el.classList.add('dragging');
    d.el.style.transform = `translate(${x}px, ${y}px)`;
    const sq = this.squareFromEvent(e);
    if (sq !== this.hoverSq) { this.hoverSq = sq; this.renderMarks(); }
  }

  onUp(e) {
    if (this.rightStart && e.button === 2) {
      const sq = this.squareFromEvent(e);
      const color = e.shiftKey ? 'red' : e.altKey ? 'blue' : e.ctrlKey ? 'yellow' : 'green';
      if (sq && sq !== this.rightStart) {
        const i = this.arrows.findIndex(a => a.from === this.rightStart && a.to === sq);
        if (i >= 0) this.arrows.splice(i, 1); else this.arrows.push({ from: this.rightStart, to: sq, color });
        this.renderArrows();
      } else if (sq) {
        const c = e.shiftKey ? 'green' : e.altKey ? 'blue' : e.ctrlKey ? 'yellow' : 'red';
        if (this.marks[sq] === c) delete this.marks[sq]; else this.marks[sq] = c;
        this.renderMarks();
      }
      this.rightStart = null;
      return;
    }
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.hoverSq = null;
    d.el.classList.remove('dragging');
    if (!d.moved) {
      // click: toggle selection off if clicking the selected piece again
      if (d.wasSelected) { this.selected = null; }
      this.renderMarks();
      return;
    }
    const to = this.squareFromEvent(e);
    const targets = this.targetsFor(d.from);
    if (to && to !== d.from && targets.some(t => t.to === to)) {
      this.placeEl(d.el, d.from);
      this.tryMove(d.from, to, true);
    } else {
      this.placeEl(d.el, d.from);
      if (to && to !== d.from) this.opts.onIllegal?.();
      this.renderMarks();
    }
  }

  async tryMove(from, to, dropped = false) {
    this.selected = null;
    if (!this.isMyTurn()) {
      this.setPremove({ from, to });
      this.opts.onPremove?.({ from, to });
      return;
    }
    const cands = (this.legal.get(from) || []).filter(m => m.to === to);
    if (!cands.length) { this.renderMarks(); return; }
    let promotion;
    if (cands[0].promotion) {
      promotion = store.settings.autoQueen ? 'q' : await this.pickPromotion(to, this.position[from][0]);
      if (!promotion) { this.renderMarks(); return; }
    }
    // When dropped, show the piece on the target immediately (no slide animation)
    this.opts.onMove?.({ from, to, promotion }, { dropped });
  }

  pickPromotion(sq, color) {
    return new Promise(resolve => {
      const [x, y] = sqToXY(sq, this.flipped);
      const fromTop = y === 0;
      const pieces = ['q', 'n', 'r', 'b'];
      this.$promo.innerHTML = '';
      this.$promo.style.left = `${x * 12.5}%`;
      this.$promo.style.top = fromTop ? '0' : 'auto';
      this.$promo.style.bottom = fromTop ? 'auto' : '0';
      this.$promo.style.flexDirection = fromTop ? 'column' : 'column-reverse';
      for (const p of pieces) {
        const b = document.createElement('button');
        b.className = 'promo-choice';
        b.style.backgroundImage = `url(${pieceUrl(color + p.toUpperCase())})`;
        b.onclick = ev => { ev.stopPropagation(); close(p); };
        this.$promo.appendChild(b);
      }
      const x2 = document.createElement('button');
      x2.className = 'promo-cancel'; x2.textContent = '✕';
      x2.onclick = ev => { ev.stopPropagation(); close(null); };
      this.$promo.appendChild(x2);
      this.$promo.classList.remove('hidden');
      const close = v => { this.$promo.classList.add('hidden'); resolve(v); };
    });
  }

  // ---------- Arrows ----------
  renderArrows() {
    const all = [...this.autoArrows, ...this.arrows];
    const colors = { green: '#15781b', red: '#c33', blue: '#2a64c6', yellow: '#e6a700', best: '#4a9e3a', engine: '#2c7fb8', threat: '#d23c3c', hint: '#e2a03f' };
    let defs = '', body = '';
    const center = sq => { const [x, y] = sqToXY(sq, this.flipped); return [x * 100 + 50, y * 100 + 50]; };
    all.forEach((a, i) => {
      const col = colors[a.color] || a.color || colors.green;
      const op = a.opacity ?? 0.8;
      const [x1, y1] = center(a.from), [x2, y2] = center(a.to);
      const dx = x2 - x1, dy = y2 - y1;
      const isKnight = (Math.abs(dx) === 100 && Math.abs(dy) === 200) || (Math.abs(dx) === 200 && Math.abs(dy) === 100);
      const w = a.width || 17;
      const head = w * 2.4;
      const id = `ah${i}`;
      defs += `<marker id="${id}" markerWidth="4" markerHeight="4" refX="2.05" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L4,2 L0,4 z" fill="${col}"/></marker>`;
      let d;
      if (isKnight) {
        // L-shaped arrow: long leg first
        const [mx, my] = Math.abs(dx) > Math.abs(dy) ? [x2, y1] : [x1, y2];
        const len2 = Math.hypot(x2 - mx, y2 - my);
        const ex = x2 - (x2 - mx) / len2 * (head * 0.85), ey = y2 - (y2 - my) / len2 * (head * 0.85);
        const sx = x1 + (mx - x1) / Math.hypot(mx - x1, my - y1) * 20, sy = y1 + (my - y1) / Math.hypot(mx - x1, my - y1) * 20;
        d = `M${sx},${sy} L${mx},${my} L${ex},${ey}`;
      } else {
        const len = Math.hypot(dx, dy);
        const sx = x1 + dx / len * 20, sy = y1 + dy / len * 20;
        const ex = x2 - dx / len * (head * 0.85), ey = y2 - dy / len * (head * 0.85);
        d = `M${sx},${sy} L${ex},${ey}`;
      }
      body += `<path d="${d}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linejoin="round" marker-end="url(#${id})" opacity="${op}"/>`;
    });
    this.$arrows.innerHTML = `<defs>${defs}</defs>${body}`;
  }
}
