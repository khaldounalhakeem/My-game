// Game review: engine analysis of every position, chess.com-style move
// classification, accuracy, estimated performance and key moments.
import { Chess } from '../vendor/chess.js';
import { OPENINGS } from '../data/openings.js';
import { scoreToCp, MATE } from './engine.js';

export const CLASSES = {
  brilliant:  { label: 'Brilliant',  symbol: '!!', color: '#26c2a3', order: 0 },
  great:      { label: 'Great',      symbol: '!',  color: '#749bbf', order: 1 },
  best:       { label: 'Best',       symbol: '★',  color: '#81b64c', order: 2 },
  excellent:  { label: 'Excellent',  symbol: '👍', color: '#81b64c', order: 3 },
  good:       { label: 'Good',       symbol: '✓',  color: '#95b776', order: 4 },
  book:       { label: 'Book',       symbol: '📖', color: '#d5a47d', order: 5 },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#f7c631', order: 6 },
  mistake:    { label: 'Mistake',    symbol: '?',  color: '#ffa459', order: 7 },
  miss:       { label: 'Miss',       symbol: '✕',  color: '#ff7769', order: 8 },
  blunder:    { label: 'Blunder',    symbol: '??', color: '#fa412d', order: 9 },
  forced:     { label: 'Forced',     symbol: '→',  color: '#97af8b', order: 10 },
};
export const CLASS_ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

export function classIcon(cls, size = 20) {
  const c = CLASSES[cls];
  if (!c) return '';
  const sym = cls === 'best' ? '<path d="M12 5.2l1.9 4 4.3.5-3.2 2.9.9 4.3-3.9-2.2-3.9 2.2.9-4.3-3.2-2.9 4.3-.5z" fill="#fff"/>'
    : cls === 'excellent' ? '<path d="M7.5 11h2v6h-2zM10.5 11l2.2-4.3c.9 0 1.5.7 1.3 1.6l-.4 1.7h2.7c.8 0 1.4.8 1.2 1.6l-1 4.1c-.2.7-.8 1.3-1.6 1.3h-4.4z" fill="#fff"/>'
    : cls === 'book' ? '<path d="M6.5 7.5c2-.6 4-.4 5.5.8 1.5-1.2 3.5-1.4 5.5-.8v9c-2-.6-4-.4-5.5.8-1.5-1.2-3.5-1.4-5.5-.8z" fill="#fff"/><path d="M12 8.3v9" stroke="' + c.color + '" stroke-width="1"/>'
    : cls === 'good' ? '<path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    : cls === 'miss' ? '<path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>'
    : cls === 'forced' ? '<path d="M7 12h9M13 8.5l3.5 3.5-3.5 3.5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    : `<text x="12" y="16.3" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="${c.symbol.length > 1 ? 10.5 : 13}" fill="#fff">${c.symbol}</text>`;
  return `<svg class="cls-icon" width="${size}" height="${size}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${c.color}" stroke="rgba(0,0,0,.25)" stroke-width="1"/>${sym}</svg>`;
}

export const epd = fen => fen.split(' ').slice(0, 4).join(' ');
export function openingFor(fen) { return OPENINGS[epd(fen)] || null; }

/** Win probability (0-100) for White from a centipawn-ish score. */
export function winPct(cp) {
  if (cp >= MATE - 1000) return 100;
  if (cp <= -MATE + 1000) return 0;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function moveAccuracy(winLoss) {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, winLoss)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export function material(chess) {
  let w = 0, b = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'k') { if (p.color === 'w') w += VAL[p.type]; else b += VAL[p.type]; }
  return { w, b };
}

/** Lowest-value attacker of `sq` belonging to `color` (or null). */
export function lowestAttacker(chess, sq, color) {
  let best = null;
  for (const a of chess.attackers(sq, color)) {
    const p = chess.get(a);
    if (p && (!best || VAL[p.type] < VAL[best.type])) best = { ...p, square: a };
  }
  return best;
}

/** Pieces of `color` that are hanging (attacked and under-defended, or attacked by cheaper piece). */
export function hangingPieces(chess, color) {
  const opp = color === 'w' ? 'b' : 'w';
  const out = [];
  for (const row of chess.board()) for (const p of row) {
    if (!p || p.color !== color || p.type === 'k') continue;
    const att = lowestAttacker(chess, p.square, opp);
    if (!att) continue;
    const defended = chess.attackers(p.square, color).length > 0;
    if (!defended || VAL[att.type] < VAL[p.type]) out.push(p);
  }
  return out;
}

/** True if the move gives up material that the opponent can grab (a sacrifice). */
export function isSacrifice(fenBefore, move) {
  const c = new Chess(fenBefore);
  const mv = c.move(move);
  if (!mv) return false;
  const moved = mv.promotion || mv.piece;
  const v = VAL[moved];
  const gained = mv.captured ? VAL[mv.captured] : 0;
  if (v < 3 || moved === 'k') {
    // Also count leaving a different piece en prise (e.g. ignoring a threat)
  }
  const opp = mv.color === 'w' ? 'b' : 'w';
  // The moved piece itself
  const att = lowestAttacker(c, mv.to, opp);
  if (att && v >= 3) {
    const defended = c.attackers(mv.to, mv.color).length > 0;
    if ((!defended && v - gained >= 2) || (VAL[att.type] < v && v - gained - VAL[att.type] >= 2)) return true;
  }
  // Another piece left hanging, worth at least a minor, that the opponent can take
  for (const h of hangingPieces(c, mv.color)) {
    if (h.square === mv.to) continue;
    if (VAL[h.type] >= 3) {
      // was it hanging before the move too? then it's not this move's sacrifice
      const before = new Chess(fenBefore);
      const wasHanging = hangingPieces(before, mv.color).some(x => x.square === h.square);
      if (!wasHanging && VAL[h.type] - gained >= 2) return true;
    }
  }
  return false;
}

function terminalScore(chess) {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? -MATE : MATE;
  if (chess.isDraw() || chess.isStalemate()) return 0;
  return null;
}

/**
 * Analyse a full game.
 * moves: array of SAN/uci strings from the start fen.
 * returns { positions, moves: [{san, uci, cls, ...}], summary }
 */
export async function analyseGame(engine, startFen, moveList, { depth = 14, onProgress } = {}) {
  const c = new Chess(startFen);
  const fens = [c.fen()];
  const verbose = [];
  for (const m of moveList) {
    const mv = c.move(m);
    if (!mv) break;
    verbose.push(mv);
    fens.push(c.fen());
  }
  const evals = [];
  for (let i = 0; i < fens.length; i++) {
    const ch = new Chess(fens[i]);
    const t = terminalScore(ch);
    if (t !== null) {
      evals.push({ score: t, lines: [], terminal: true, mate: ch.isCheckmate() ? 0 : null });
    } else {
      const res = await engine.analyse(fens[i], { depth, multipv: 2 });
      if (!res) throw new Error('cancelled');
      const lines = res.lines;
      evals.push({ score: scoreToCp(lines[0]), lines, best: res.bestmove });
    }
    onProgress?.((i + 1) / fens.length);
  }
  return classifyGame(startFen, fens, verbose, evals);
}

export function classifyGame(startFen, fens, verbose, evals) {
  const out = [];
  let inBook = true;
  for (let i = 0; i < verbose.length; i++) {
    const mv = verbose[i];
    const before = evals[i], after = evals[i + 1];
    const sign = mv.color === 'w' ? 1 : -1;
    const uci = mv.from + mv.to + (mv.promotion || '');
    const bestUci = before.best || before.lines[0]?.pv[0];
    const winBefore = sign === 1 ? winPct(before.score) : 100 - winPct(before.score);
    const winAfter = sign === 1 ? winPct(after.score) : 100 - winPct(after.score);
    const loss = Math.max(0, winBefore - winAfter);
    const secondLine = before.lines[1];
    const secondWin = secondLine ? (sign === 1 ? winPct(scoreToCp(secondLine)) : 100 - winPct(scoreToCp(secondLine))) : null;
    const isBest = uci === bestUci;
    const legalCount = new Chess(fens[i]).moves().length;

    let cls;
    const opening = openingFor(fens[i + 1]);
    if (inBook && opening && i < 30) cls = 'book';
    else {
      inBook = false;
      if (legalCount === 1) cls = 'forced';
      else if (isBest || loss < 0.3) cls = 'best';
      else if (loss < 2) cls = 'excellent';
      else if (loss < 5) cls = 'good';
      else if (loss < 10) cls = 'inaccuracy';
      else if (loss < 20) cls = 'mistake';
      else cls = 'blunder';

      // Mate-aware adjustments
      const mateBefore = before.lines[0]?.mate;
      const moverHadMate = mateBefore != null && Math.sign(mateBefore) === sign;
      const afterMate = after.terminal ? null : after.lines[0]?.mate;
      const stillMate = (after.terminal && after.mate === 0) || (afterMate != null && Math.sign(afterMate) === sign);
      if (moverHadMate && stillMate && cls !== 'best') cls = Math.abs(afterMate ?? 0) <= Math.abs(mateBefore) + 1 ? 'excellent' : 'good';

      // Already totally winning: don't punish slow-but-winning moves as hard
      if (winBefore > 97 && winAfter > 90 && ['mistake', 'blunder', 'inaccuracy'].includes(cls)) cls = 'good';

      // Miss: opponent just erred and we failed to punish
      const prev = out[i - 1];
      if (['mistake', 'blunder', 'inaccuracy'].includes(cls) && prev && ['mistake', 'blunder', 'miss'].includes(prev.cls) && winAfter >= 30 && loss < 30) cls = 'miss';
      if (cls === 'mistake' && winBefore >= 75 && winAfter >= 45 && secondWin !== null) cls = 'miss';

      // Great: the only good move in a critical position
      if (cls === 'best' && secondWin !== null && winBefore - secondWin >= 18 && winBefore < 95 && winAfter >= 40) cls = 'great';
      // Brilliant: a sound sacrifice (also when it is the way to force mate)
      const keepsMate = moverHadMate && stillMate && (isBest || cls === 'best');
      if ((cls === 'best' || cls === 'great' || cls === 'excellent' || keepsMate) && winAfter >= 50 && (winBefore < 97 || keepsMate) && isSacrifice(fens[i], mv)) cls = 'brilliant';
    }
    out.push({
      ply: i, san: mv.san, uci, color: mv.color, from: mv.from, to: mv.to, piece: mv.piece, captured: mv.captured,
      cls, loss, winBefore, winAfter, bestUci, bestSan: bestUci ? uciToSan(fens[i], bestUci) : null,
      evalAfter: after.score, evalBefore: before.score, pvBefore: before.lines[0]?.pv || [], pvAfter: after.lines?.[0]?.pv || [],
      mateAfter: after.terminal ? (after.mate === 0 ? 0 : null) : after.lines[0]?.mate, mateBefore: before.lines[0]?.mate,
      accuracy: cls === 'book' || cls === 'forced' ? 100 : moveAccuracy(loss), opening: opening?.[1] || null,
      fenBefore: fens[i], fenAfter: fens[i + 1],
    });
  }
  return { fens, evals, moves: out, summary: summarize(out, evals) };
}

export function uciToSan(fen, uci) {
  try {
    const c = new Chess(fen);
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return m ? m.san : null;
  } catch { return null; }
}

export function pvToSan(fen, pv, max = 8) {
  const c = new Chess(fen);
  const out = [];
  for (const u of pv.slice(0, max)) {
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      if (!m) break;
      out.push(m.san);
    } catch { break; }
  }
  return out;
}

const RATING_CURVE = [[0, 100], [40, 400], [50, 600], [60, 900], [70, 1250], [78, 1600], [84, 1900], [89, 2200], [93, 2500], [96, 2750], [98.5, 3000], [100, 3200]];
export function accuracyToRating(acc) {
  for (let i = 1; i < RATING_CURVE.length; i++) {
    const [a1, r1] = RATING_CURVE[i - 1], [a2, r2] = RATING_CURVE[i];
    if (acc <= a2) return Math.round((r1 + (acc - a1) / (a2 - a1) * (r2 - r1)) / 50) * 50;
  }
  return 3200;
}

function summarize(moves) {
  const res = {};
  for (const color of ['w', 'b']) {
    const mine = moves.filter(m => m.color === color);
    const counts = Object.fromEntries(Object.keys(CLASSES).map(k => [k, 0]));
    mine.forEach(m => counts[m.cls]++);
    const accs = mine.map(m => m.accuracy);
    let accuracy = 100;
    if (accs.length) {
      const mean = accs.reduce((a, b) => a + b, 0) / accs.length;
      const harm = accs.length / accs.reduce((a, b) => a + 1 / Math.max(b, 5), 0);
      accuracy = (mean + harm) / 2;
    }
    // Phase accuracies
    const phase = name => {
      const sel = mine.filter(m => phaseOf(m) === name);
      if (!sel.length) return null;
      return sel.reduce((a, m) => a + m.accuracy, 0) / sel.length;
    };
    res[color] = {
      accuracy: Math.round(accuracy * 10) / 10, counts,
      rating: accuracyToRating(accuracy),
      phases: { opening: phase('opening'), middlegame: phase('middlegame'), endgame: phase('endgame') },
    };
  }
  // Key moments: biggest swings
  res.keyMoments = moves.map((m, i) => ({ i, swing: m.loss, cls: m.cls }))
    .filter(x => ['blunder', 'mistake', 'miss', 'brilliant', 'great'].includes(x.cls))
    .sort((a, b) => b.swing - a.swing).slice(0, 8).map(x => x.i).sort((a, b) => a - b);
  return res;
}

export function phaseOf(m) {
  if (m.ply < 20 || m.cls === 'book') return 'opening';
  const c = new Chess(m.fenBefore);
  const mat = material(c);
  const majors = c.board().flat().filter(p => p && p.type !== 'k' && p.type !== 'p').length;
  if (majors <= 6 || mat.w + mat.b <= 26) return 'endgame';
  return 'middlegame';
}
