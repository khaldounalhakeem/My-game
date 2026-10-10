// Fuzz-drives the player car with random human-like inputs and reports stuck/floating situations.
const fs = require('fs'), path = require('path'), vm = require('vm');
const THREE = require(process.argv[2] || '/tmp/three.cjs');
const ctx = { THREE, process, console, Math, setTimeout, localStorage: undefined }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['core', 'arena', 'car', 'ball', 'data', 'ranks', 'ai', 'game']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f + '.js'), 'utf8'), ctx);
vm.runInContext(`
let seed = ${+(process.argv[3] || 1)};
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const g = new Game({ kind: 'freeplay', mode: '${process.argv[4] || 'soccar'}', map: 'stadium' });
const c = g.player;
const hist = []; let plan = null, planT = 0, stuckT = 0, floatT = 0, reports = 0, lastLog = -10;
const V = () => new THREE.Vector3();
for (let t = 0; t < ${+(process.argv[5] || 300)}; t += PHYS.TICK) {
  if (planT <= 0) {
    const r = rnd();
    plan = { throttle: rnd() < 0.85 ? 1 : -1, steer: rnd() < 0.5 ? 0 : (rnd() * 2 - 1), boost: rnd() < 0.4, hb: rnd() < 0.1,
      jumpAt: rnd() < 0.5 ? rnd() * 0.8 : -1, jumpHold: rnd() * 0.25, flipAt: rnd() < 0.4 ? rnd() * 0.9 : -1, pitch: rnd() * 2 - 1, roll: rnd() < 0.2, t: 0 };
    planT = 0.6 + rnd() * 1.6;
  }
  plan.t += PHYS.TICK; planT -= PHYS.TICK;
  const ct = c.ctrl;
  ct.throttle = plan.throttle; ct.steer = plan.steer; ct.boost = plan.boost; ct.handbrake = plan.hb || (plan.roll && !c.onGround);
  ct.pitch = c.onGround ? 0 : plan.pitch * 0.5;
  ct.jump = (plan.jumpAt >= 0 && plan.t > plan.jumpAt && plan.t < plan.jumpAt + plan.jumpHold + 0.02) || (plan.flipAt >= 0 && plan.t > plan.jumpAt + plan.jumpHold + plan.flipAt && plan.t < plan.jumpAt + plan.jumpHold + plan.flipAt + 0.05);
  if (ct.jump && plan.flipAt >= 0 && plan.t > plan.jumpAt + plan.jumpHold + 0.03) ct.pitch = plan.pitch > 0 ? 1 : -1;
  g.update(PHYS.TICK); g.events = [];
  hist.push(t.toFixed(2) + ' p ' + c.pos.toArray().map(v => v.toFixed(0)).join(',') + ' up ' + c.up(V()).toArray().map(v => v.toFixed(2)).join(',') + ' f ' + c.fwd(V()).toArray().map(v => v.toFixed(2)).join(',') + ' v ' + c.vel.toArray().map(v => v.toFixed(0)).join(',') + ' g ' + (c.onGround ? 1 : 0) + ' n ' + c.groundN.toArray().map(v => v.toFixed(2)).join(',') + ' roof ' + c.contactRoof.toFixed(2) + ' ctl ' + ct.throttle + ',' + ct.steer.toFixed(2) + ',' + (ct.jump ? 'J' : '') + (ct.boost ? 'B' : '') + (ct.handbrake ? 'H' : ''));
  if (hist.length > 240) hist.shift();
  // reset if the car ends up somewhere silly (like a player would)
  const sp = c.vel.length();
  const up = c.up(V());
  if (c.onGround && sp < 40 && Math.abs(ct.throttle) > 0.5) stuckT += PHYS.TICK; else stuckT = 0;
  if (!c.onGround && sp < 60 && c.contactRoof <= 0) floatT += PHYS.TICK; else floatT = 0;
  const d = arenaDist(c.pos.x, c.pos.y, c.pos.z, false);
  const problem = stuckT > 1.0 ? 'STUCK-GROUND' : floatT > 1.0 ? 'FLOATING' : d < -5 ? 'INSIDE-WALL' : null;
  if (problem && t - lastLog > 2) {
    lastLog = t; reports++;
    if (process.env.HIST) for (let i = 0; i < hist.length; i += 8) console.log('   ', hist[i]);
    console.log(t.toFixed(2), problem, 'pos', c.pos.toArray().map(v => v.toFixed(0)).join(','), 'up', up.toArray().map(v => v.toFixed(2)).join(','),
      'n', c.groundN.toArray().map(v => v.toFixed(2)).join(','), 'd', d.toFixed(1), 'v', sp.toFixed(0), 'g', c.onGround, 'roof', c.contactRoof.toFixed(2), 'grace', c.groundGrace.toFixed(2), 'jumped', c.jumped);
  }
  if (problem && (stuckT > 4 || floatT > 4)) { c.spawn(0, -2000, 0, 0); stuckT = floatT = 0; }
}
console.log('reports', reports);
`, ctx);
