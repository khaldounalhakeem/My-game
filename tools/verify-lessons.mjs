import { createRequire } from 'module';
import { Chess } from '../vendor/chess.js';
import { LESSONS } from '../js/lessons.js';
const require = createRequire(import.meta.url);
let resolver, lines = [];
const sf = require(process.env.SF_PKG || 'stockfish')('lite-single', l => { lines.push(l); if (l.startsWith('bestmove')) { const r = resolver; resolver = null; r(lines); lines = []; } });
sf.processCommand('uci');
const go = (fen, d = 16) => new Promise(r => { resolver = r; sf.processCommand('setoption name MultiPV value 3'); sf.processCommand('position fen ' + fen); sf.processCommand('go depth ' + d); });
for (const L of LESSONS) {
  let c = null;
  for (const [i, st] of L.steps.entries()) {
    if (st.fen) c = new Chess(st.fen);
    const fen = c.fen();
    for (const u of st.accept) {
      const t = new Chess(fen);
      let m; try { m = t.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { m = null; }
      if (!m) { if (!st.fen) continue; console.log('ILLEGAL', L.id, i, u); }
      else if (st.mate && !t.isCheckmate()) console.log('NOT MATE', L.id, i, u);
    }
    const out = await go(fen);
    const best = out.filter(l => / depth 16 .*multipv/.test(l)).map(l => l.match(/multipv (\d) score (\w+ -?\d+).* pv (\S+)/).slice(1).join(' '));
    console.log(L.id, i, st.accept.join(','), '|', best.join(' / '));
    // advance for continuing lessons
    const pickU = st.accept.find(u => { try { return new Chess(fen).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { return false; } });
    c.move({ from: pickU.slice(0, 2), to: pickU.slice(2, 4), promotion: pickU[4] });
    if (st.reply && st.reply !== 'auto') { const r = st.reply[pickU]; c.move({ from: r.slice(0, 2), to: r.slice(2, 4) }); }
    else if (st.reply === 'auto') { const o = await go(c.fen(), 10); const bm = o.find(l => l.startsWith('bestmove')).split(' ')[1]; c.move({ from: bm.slice(0, 2), to: bm.slice(2, 4), promotion: bm[4] }); }
  }
}
sf.terminate(); process.exit(0);
