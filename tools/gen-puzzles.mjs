// Generates tactical puzzles by letting noisy Stockfish play itself and
// harvesting positions where a blunder leaves a unique winning line.
// Usage: node tools/gen-puzzles.mjs <outfile.jsonl> <count> [seed]
import { createRequire } from 'module';
import { appendFileSync, readFileSync } from 'fs';
import { Chess } from '../vendor/chess.js';
const require = createRequire(import.meta.url);
const SF_PATH = process.env.SF_PKG || 'stockfish';

const [, , outFile, countArg] = process.argv;
const target = +countArg || 50;

let resolver = null, lines = [];
const sf = require(SF_PATH)('lite-single', line => {
  lines.push(line);
  if (line.startsWith('bestmove') && resolver) { const r = resolver; resolver = null; r(lines); lines = []; }
});
const cmd = c => sf.processCommand(c);
cmd('uci'); cmd('setoption name Hash value 32');

async function analyse(fen, depth, multipv) {
  cmd('setoption name MultiPV value ' + multipv);
  cmd('position fen ' + fen);
  const out = await new Promise(r => { resolver = r; lines = []; cmd('go depth ' + depth); });
  const pvs = [];
  for (const l of out) {
    const m = l.match(/ depth (\d+) .*multipv (\d+) score (cp|mate) (-?\d+).* pv (.+)/);
    if (!m || +m[1] !== depth) continue;
    const score = m[3] === 'mate' ? (+m[4] > 0 ? 100000 - +m[4] : -100000 - +m[4]) : +m[4];
    pvs[+m[2] - 1] = { score, mate: m[3] === 'mate' ? +m[4] : null, pv: m[5].trim().split(' ') };
  }
  return pvs.filter(Boolean);
}

const uci = m => ({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Random but sound openings from the opening book
const bookLines = [];
for (const f of 'abcde') {
  const t = readFileSync(new URL(`./openings/open_${f}.tsv`, import.meta.url), 'utf8').trim().split('\n').slice(1);
  for (const l of t) bookLines.push(l.split('\t')[2].split(/\s+/).filter(x => !/^\d+\./.test(x)));
}

async function buildSolution(fen) {
  // Returns array of uci moves starting with the solver's move, or null.
  const c = new Chess(fen);
  const sol = [];
  for (let step = 0; step < 5; step++) {
    const a = await analyse(c.fen(), 14, 2);
    if (!a.length) break;
    const best = a[0], second = a[1];
    const winning = best.score >= 250;
    const unique = !second || (best.score >= 99000 ? second.score < 99000 : (best.score - second.score >= 220 && second.score < 300));
    if (step === 0 && !(winning && unique)) return null;
    if (step > 0 && !unique) break; // stop before an ambiguous move
    sol.push(best.pv[0]);
    c.move(uci(best.pv[0]));
    if (c.isGameOver()) return { sol, mate: c.isCheckmate() };
    // Stop when the material has been won and the position is quiet.
    if (best.score < 99000 && step >= 1) break;
    const reply = await analyse(c.fen(), 12, 1);
    if (!reply.length) break;
    sol.push(reply[0].pv[0]);
    c.move(uci(reply[0].pv[0]));
  }
  // must end with a solver move
  if (sol.length % 2 === 0) sol.pop();
  return sol.length ? { sol, mate: false } : null;
}

let found = 0;
while (found < target) {
  const g = new Chess();
  const book = bookLines[Math.floor(Math.random() * bookLines.length)];
  for (const m of book.slice(0, 4 + Math.floor(Math.random() * 8))) g.move(m);
  let prevEvalForMover = 0;
  while (!g.isGameOver() && g.history().length < 120 && found < target) {
    const fenBefore = g.fen();
    const a = await analyse(fenBefore, 8, 5);
    if (!a.length) break;
    // Noisy pick: mostly good moves, sometimes a plausible blunder
    let pick = a[0];
    const r = Math.random();
    if (r < 0.35 && a.length > 1) pick = a[1 + Math.floor(Math.random() * (a.length - 1))];
    else if (r < 0.45) { const ms = g.moves({ verbose: true }); const m = ms[Math.floor(Math.random() * ms.length)]; pick = { pv: [m.from + m.to + (m.promotion || '')], score: -1e9 }; }
    const evalBefore = a[0].score;
    g.move(uci(pick.pv[0]));
    if (g.isGameOver()) break;
    // Only consider blunders from a not-yet-lost position.
    // MODE=mate: only positions where a quick search already sees a forced mate.
    let consider = Math.abs(evalBefore) < 400;
    if (process.env.MODE === 'mate') {
      const q = await analyse(g.fen(), 10, 1);
      consider = !!(q[0] && q[0].mate && q[0].mate > 0 && q[0].mate <= 4) && Math.abs(evalBefore) < 1500;
    }
    if (consider) {
      const res = await buildSolution(g.fen());
      if (res && res.sol.length >= 1) {
        const c = new Chess(g.fen());
        const first = c.move(uci(res.sol[0]));
        // skip trivial recaptures of an equal trade
        const hard = process.env.MODE === 'hard';
        const trivial = (!res.mate && res.sol.length === 1 && first.captured && VAL[first.captured] <= 1) ||
          (hard && !res.mate && res.sol.length === 1) || (process.env.MODE === 'mate' && !res.mate);
        if (!trivial) {
          const moves = [pick.pv[0], ...res.sol];
          const solverMoves = Math.ceil(res.sol.length / 2);
          const quiet = !first.captured && !first.san.includes('+');
          let rating = 700 + solverMoves * 220 + (quiet ? 350 : 0) + (res.mate ? 0 : 100) + Math.floor(Math.random() * 120);
          if (res.mate && solverMoves === 1) rating = 500 + Math.floor(Math.random() * 300) + (quiet ? 250 : 0);
          const themes = [];
          if (res.mate) themes.push('mate', 'mateIn' + solverMoves); else themes.push(solverMoves > 1 ? 'advantage' : 'winMaterial');
          if (quiet) themes.push('quietMove');
          if (first.san.includes('+')) themes.push('check');
          if (first.captured) themes.push('capture');
          const rec = { fen: fenBefore, moves, rating, themes };
          appendFileSync(outFile, JSON.stringify(rec) + '\n');
          found++;
          console.log(found, rec.rating, rec.themes.join(','), moves.join(' '));
          break; // one puzzle per game keeps variety high
        }
      }
    }
  }
}
sf.terminate();
process.exit(0);
