// Headless simulation test: runs bot matches with the real game logic (no rendering).
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const THREE = require(process.argv[2] || '/tmp/three.cjs');
const ctx = { THREE, console, Math, performance: { now: () => Date.now() }, setTimeout, localStorage: undefined };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['core', 'arena', 'car', 'ball', 'data', 'ranks', 'ai', 'game']) vm.runInContext(fs.readFileSync(path.join(root, 'src', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const run = (cfg, seconds) => vm.runInContext(`(() => {
  const cfg = ${JSON.stringify(cfg)};
  const g = new Game(cfg);
  const stats = { goals: 0, touches: 0, demos: 0, maxOut: 0, nan: false, events: {}, minY: 1e9, maxSpeed: 0 };
  const T = ${seconds};
  for (let t = 0; t < T; t += PHYS.TICK) {
    g.update(PHYS.TICK);
    if (g.state === 'replay') g.finishReplay();
    for (const e of g.events) stats.events[e.type] = (stats.events[e.type] || 0) + 1;
    g.events = [];
    for (const c of g.cars) {
      if (!isFinite(c.pos.x + c.pos.y + c.pos.z)) stats.nan = true;
      if (c.demolished) continue;
      const d = arenaDist(c.pos.x, c.pos.y, c.pos.z, false);
      if (d < -20) stats.maxOut = Math.max(stats.maxOut, -d);
      stats.minY = Math.min(stats.minY, c.pos.y);
    }
    if (!isFinite(g.ball.pos.x)) stats.nan = true;
    stats.maxSpeed = Math.max(stats.maxSpeed, g.ball.vel.length());
    if (g.state === 'ended') break;
  }
  stats.score = g.score; stats.state = g.state; stats.clock = g.clock;
  stats.touches = g.cars.reduce((a, c) => a + c.stats.touches, 0);
  stats.carStats = g.cars.map(c => c.name + ':' + JSON.stringify(c.stats));
  return stats;
})()`, ctx);
const which = process.argv[3] || 'all';
const modes = which === 'all' ? ['soccar', 'hoops', 'snowday', 'rumble', 'heatseeker', 'dropshot'] : [which];
for (const m of modes) {
  const t0 = Date.now();
  const s = run({ kind: 'match', mode: m, teamSize: +(process.env.TS||3), level: 'allstar', map: 'stadium', attract: true, mutators: { matchLength: 120 } }, 140);
  console.log(m, 'score', s.score, 'state', s.state, 'touches', s.touches, 'nan', s.nan, 'maxOut', s.maxOut.toFixed(1), 'minY', s.minY.toFixed(1), 'ballMax', s.maxSpeed.toFixed(0), 'ms', Date.now() - t0);
  console.log('  events', JSON.stringify(s.events));
}
