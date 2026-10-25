// Turns engine output + board facts into human sentences for coaches.
import { Chess } from '../vendor/chess.js';
import { hangingPieces, lowestAttacker, pvToSan, uciToSan } from './review.js';

export const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const article = w => (/^[aeiou]/.test(w) ? 'an ' : 'a ') + w;

function tryMove(c, uci) {
  try { return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { return null; }
}

/** Squares attacked by the piece on `sq` that hold valuable enemy pieces (fork detection). */
export function forkTargets(chess, sq) {
  const p = chess.get(sq);
  if (!p) return [];
  const opp = p.color === 'w' ? 'b' : 'w';
  const targets = [];
  for (const row of chess.board()) for (const q of row) {
    if (!q || q.color !== opp) continue;
    if (!chess.attackers(q.square, p.color).includes(sq)) continue;
    const defended = chess.attackers(q.square, opp).length > 0;
    if (q.type === 'k' || VAL[q.type] > VAL[p.type] || !defended) targets.push(q);
  }
  return targets.filter(t => t.type !== 'p' || targets.length > 2);
}

/** Describe what a single move does, from the mover's perspective ("you"). */
export function describeMove(fen, uci) {
  const c = new Chess(fen);
  const mv = tryMove(c, uci);
  if (!mv) return { text: '', facts: {} };
  const facts = { san: mv.san, piece: PIECE_NAMES[mv.piece] };
  const parts = [];
  if (c.isCheckmate()) { facts.mate = true; return { text: 'It\'s checkmate!', facts }; }
  if (mv.flags.includes('k') || mv.flags.includes('q')) { parts.push('Castling tucks the king away and brings the rook toward the center.'); facts.castle = true; }
  if (mv.promotion) { parts.push(`The pawn promotes to ${article(PIECE_NAMES[mv.promotion])}.`); facts.promotion = true; }
  if (mv.captured) { parts.push(`The ${PIECE_NAMES[mv.piece]} captures ${article(PIECE_NAMES[mv.captured])} on ${mv.to}.`); facts.capture = mv.captured; }
  const forks = forkTargets(c, mv.to);
  if (forks.length >= 2) {
    const names = forks.slice(0, 2).map(t => PIECE_NAMES[t.type]);
    parts.push(`It forks the ${names[0]} and the ${names[1]}.`);
    facts.fork = true;
  }
  if (c.isCheck() && !facts.fork) { parts.push('It gives check.'); facts.check = true; }
  const ply = (+fen.split(' ')[5] - 1) * 2;
  if (!parts.length && ply < 20) {
    if (mv.piece === 'p' && ['e4', 'd4', 'e5', 'd5', 'c4', 'c5'].includes(mv.to)) parts.push('It stakes a claim in the center.');
    else if ((mv.piece === 'n' || mv.piece === 'b') && (mv.from[1] === '1' || mv.from[1] === '8')) parts.push(`It develops the ${PIECE_NAMES[mv.piece]} toward the center.`);
  }
  return { text: parts.join(' '), facts };
}

/** What the opponent threatens after `fen` (side to move = us) if we passed. */
export function findThreat(fen) {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  let c;
  try { c = new Chess(parts.join(' ')); } catch { return null; }
  if (c.inCheck()) return null;
  let best = null;
  for (const m of c.moves({ verbose: true })) {
    const t = new Chess(c.fen());
    t.move(m);
    if (t.isCheckmate()) return { san: m.san, from: m.from, to: m.to, text: `threatens checkmate with ${m.san}` };
    if (m.captured) {
      const def = t.attackers(m.to, t.turn()).length > 0;
      const gain = VAL[m.captured] - (def ? VAL[m.piece] : 0);
      if (gain >= 2 && (!best || gain > best.gain)) best = { san: m.san, from: m.from, to: m.to, gain, text: `threatens to win your ${PIECE_NAMES[m.captured]} with ${m.san}` };
    }
  }
  return best;
}

/**
 * Build a structured explanation for a reviewed move.
 * Returns { headline facts..., why: string, better: string, threat: string }
 */
export function explainReviewedMove(m) {
  const res = { what: '', why: '', better: '', line: '' };
  const d = describeMove(m.fenBefore, m.uci);
  res.what = d.text;
  const after = new Chess(m.fenAfter);
  // Problems introduced by the move
  if (['inaccuracy', 'mistake', 'blunder', 'miss'].includes(m.cls)) {
    const reply = m.pvAfter[0];
    if (m.cls === 'miss') {
      res.why = m.mateBefore != null && Math.sign(m.mateBefore) === (m.color === 'w' ? 1 : -1)
        ? 'There was a forced checkmate on the board!'
        : 'The previous move left an opportunity that went unpunished.';
    } else if (m.mateAfter != null && Math.sign(m.mateAfter) !== (m.color === 'w' ? 1 : -1) && m.mateAfter !== 0) {
      res.why = `This allows a forced checkmate in ${Math.abs(m.mateAfter)}.`;
    } else if (reply) {
      const t = new Chess(m.fenAfter);
      const r = tryMove(t, reply);
      if (r && r.captured && VAL[r.captured] >= 3) res.why = `It allows ${r.san}, winning ${article(PIECE_NAMES[r.captured])}.`;
      else if (r && forkTargets(t, r.to).length >= 2) res.why = `It runs into the fork ${r.san}.`;
      else {
        const hang = hangingPieces(after, m.color).filter(p => VAL[p.type] >= 3);
        if (hang.length) res.why = `The ${PIECE_NAMES[hang[0].type]} on ${hang[0].square} is left undefended.`;
        else if (m.winAfter < 35) res.why = r ? `After ${r.san} the opponent takes over.` : 'The opponent takes over.';
        else if (m.winAfter < 50) res.why = 'The advantage passes to the opponent.';
        else res.why = 'This lets some of the advantage slip.';
      }
    }
    if (m.bestSan) {
      const c = new Chess(m.fenBefore);
      const bm = tryMove(c, m.bestUci);
      let reason = '';
      if (m.mateBefore != null && Math.sign(m.mateBefore) === (m.color === 'w' ? 1 : -1)) reason = `leading to mate in ${Math.abs(m.mateBefore)}`;
      else if (bm && bm.captured) reason = `winning ${article(PIECE_NAMES[bm.captured])}`;
      else if (bm && forkTargets(c, bm.to).length >= 2) reason = 'with a powerful fork';
      else if (bm && c.isCheck()) reason = 'with a strong check';
      else {
        const pv = m.pvBefore;
        const tc = new Chess(m.fenBefore);
        let gained = 0;
        for (let k = 0; k < Math.min(pv.length, 5); k++) {
          const x = tryMove(tc, pv[k]);
          if (!x) break;
          if (x.captured) gained += (x.color === m.color ? 1 : -1) * VAL[x.captured];
        }
        if (gained >= 2) reason = 'which wins material';
      }
      res.better = `${m.bestSan} was best${reason ? ', ' + reason : ''}.`;
      res.line = pvToSan(m.fenBefore, m.pvBefore, 6).join(' ');
    }
  } else if (m.cls === 'brilliant') {
    res.why = 'A clever sacrifice! The material you give up comes back with interest.';
  } else if (m.cls === 'great') {
    res.why = 'This was the only move that keeps the advantage. Well found!';
  } else if (m.cls === 'book') {
    res.why = m.opening ? `This is a known opening move (${m.opening}).` : 'This is a well-known opening move.';
  } else if (m.cls === 'forced') {
    res.why = 'It was the only legal move.';
  }
  return res;
}

export { uciToSan, pvToSan, lowestAttacker };
