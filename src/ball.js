'use strict';
// ============================================================================
// Ball / puck physics, car↔ball and car↔car interactions, ball prediction
// ============================================================================

const BALL_TYPES = {
  ball: { name: 'Default', r: 92.75, rest: 0.6, grav: 1, drag: PHYS.BALL_DRAG, fric: 0.35, mass: 1 },
  cube: { name: 'Cube', r: 92.75, rest: 0.45, grav: 1, drag: PHYS.BALL_DRAG, fric: 0.5, mass: 1 },
  puck: { name: 'Puck', r: 114.25, h: 31, rest: 0.25, grav: 1.6, drag: 0.02, fric: 0.04, mass: 1, puck: true },
  beach: { name: 'Beach Ball', r: 150, rest: 0.75, grav: 0.55, drag: 0.2, fric: 0.35, mass: 0.6 },
  basketball: { name: 'Basketball', r: 92.75, rest: 0.68, grav: 1, drag: PHYS.BALL_DRAG, fric: 0.35, mass: 1 },
  dropshot: { name: 'Core', r: 102, rest: 0.6, grav: 1, drag: PHYS.BALL_DRAG, fric: 0.35, mass: 1 },
};

const _b1 = new V3(), _b2 = new V3(), _b3 = new V3(), _b4 = new V3(), _b5 = new V3(), _bq = new Q4();

class Ball {
  constructor() {
    this.pos = new V3(); this.vel = new V3(); this.angVel = new V3(); this.quat = new Q4();
    this.setType('ball', 1, 1);
    this.lastTouch = null; this.touches = []; this.frozen = 0; this.charge = 0; this.chargeLevel = 0; this.hseekSpeed = 0;
  }
  setType(kind, sizeMul, weightMul) {
    const t = BALL_TYPES[kind] || BALL_TYPES.ball;
    this.kind = kind; this.t = t;
    this.radius = t.r * (sizeMul || 1);
    this.h = t.h || this.radius;
    this.puck = !!t.puck;
    this.rest = t.rest; this.gravMul = t.grav * (weightMul || 1); this.drag = t.drag; this.fric = t.fric;
    this.massMul = t.mass * (weightMul || 1);
    _ballRadiusCur = this.radius;
  }
  reset(x, y, z) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0); this.quat.identity();
    this.lastTouch = null; this.touches = []; this.frozen = 0; this.hseekSpeed = 0; this.charge = 0; this.chargeLevel = 0;
  }
  support(n) {
    if (!this.puck) return this.radius;
    return this.h * Math.abs(n.y) + this.radius * Math.sqrt(Math.max(0, 1 - n.y * n.y));
  }
  step(dt, mut, onBounce) {
    if (this.frozen > 0) { this.frozen -= dt; return; }
    this.vel.y -= PHYS.GRAVITY * mut.gravity * this.gravMul * dt;
    this.vel.multiplyScalar(1 - this.drag * dt);
    // a spinning ball bends a little in the air (and much more when it bounces, see collide)
    if (!this.puck && this.angVel.lengthSq() > 0.01) this.vel.addScaledVector(_b1.crossVectors(this.angVel, this.vel), PHYS.BALL_CURVE * dt);
    const maxS = PHYS.BALL_MAX_SPEED * (mut.ballSpeed || 1);
    const s = this.vel.length();
    if (s > maxS) this.vel.multiplyScalar(maxS / s);
    this.pos.addScaledVector(this.vel, dt);
    this.collide(onBounce);
    const w = this.angVel.length();
    if (w > PHYS.BALL_MAX_SPIN) this.angVel.multiplyScalar(PHYS.BALL_MAX_SPIN / w);
    if (this.puck) { this.angVel.x = 0; this.angVel.z = 0; }
    const w2 = this.angVel.length();
    if (w2 > 1e-5) { _bq.setFromAxisAngle(_b1.copy(this.angVel).multiplyScalar(1 / w2), w2 * dt); this.quat.premultiply(_bq).normalize(); }
  }
  collide(onBounce) {
    for (let it = 0; it < 3; it++) {
      const d = arenaDist(this.pos.x, this.pos.y, this.pos.z, true);
      if (d > this.radius + 1) return;
      const n = arenaNormal(this.pos.x, this.pos.y, this.pos.z, true, _b2);
      const sup = this.support(n);
      if (d >= sup) return;
      this.pos.addScaledVector(n, sup - d);
      const vn = this.vel.dot(n);
      if (vn < 0) {
        const e = -vn < 60 ? 0 : this.rest;
        const jn = -(1 + e) * vn;
        this.vel.addScaledVector(n, jn);
        if (this.puck) {
          // puck slides with low friction
          const vt = _b3.copy(this.vel).addScaledVector(n, -this.vel.dot(n));
          this.vel.addScaledVector(vt, -Math.min(1, this.fric * jn / Math.max(1, vt.length())));
        } else {
          // tangential friction at the contact point → spin
          const rc = _b3.copy(n).multiplyScalar(-this.radius);
          const vc = _b4.crossVectors(this.angVel, rc).add(this.vel);
          vc.addScaledVector(n, -vc.dot(n));
          const vcl = vc.length();
          if (vcl > 1e-3) {
            const k = Math.min(2 / 7, this.fric * jn / vcl);
            const P = vc.multiplyScalar(-k);
            this.vel.add(P);
            this.angVel.addScaledVector(_b5.crossVectors(rc, P), 5 / (2 * this.radius * this.radius));
          }
        }
        if (onBounce && jn > 120) onBounce(this, n, jn);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Car ↔ ball
// ---------------------------------------------------------------------------
const _c1 = new V3(), _c2 = new V3(), _c3 = new V3(), _c4 = new V3(), _c5 = new V3(), _cq = new Q4();

function carBallCollide(car, ball, game) {
  if (car.demolished) return false;
  // ball centre in the car's hitbox frame
  _cq.copy(car.quat).invert();
  const local = _c1.copy(ball.pos).sub(car.pos).applyQuaternion(_cq).sub(car.hbOff);
  const h = car.half;
  const cl = _c2.set(clamp(local.x, -h.x, h.x), clamp(local.y, -h.y, h.y), clamp(local.z, -h.z, h.z));
  const diff = _c3.copy(local).sub(cl);
  let dist = diff.length();
  let nLocal;
  const inside = dist < 1e-4;
  if (inside) {
    // centre inside the box: push out along the least-penetrated axis
    const px = h.x - Math.abs(local.x), py = h.y - Math.abs(local.y), pz = h.z - Math.abs(local.z);
    if (px < py && px < pz) nLocal = _c3.set(sign(local.x), 0, 0); else if (py < pz) nLocal = _c3.set(0, sign(local.y), 0); else nLocal = _c3.set(0, 0, sign(local.z));
    dist = -Math.min(px, py, pz);
  } else nLocal = diff.multiplyScalar(1 / dist);
  const thr = ball.puck ? ball.support(_c4.copy(nLocal).applyQuaternion(car.quat)) : ball.radius;
  if (dist >= thr) { car.ballContact = false; return false; }

  const n = _c4.copy(nLocal).applyQuaternion(car.quat); // world normal from car to ball
  const cpWorld = _c5.copy(cl).add(car.hbOff).applyQuaternion(car.quat).add(car.pos);
  const pen = thr - dist;
  const mb = PHYS.BALL_MASS * ball.massMul, mc = PHYS.CAR_MASS;
  ball.pos.addScaledVector(n, pen * mc / (mb + mc));
  car.pos.addScaledVector(n, -pen * mb / (mb + mc));

  // relative speed at the moment of impact (Rocket League's extra hit impulse is based on this)
  const relPre = Math.min(_c1.copy(ball.vel).sub(car.vel).length(), 4600);
  // physical impulse (inelastic)
  const r = _c2.copy(cpWorld).sub(car.pos);
  const vCarPt = new V3().crossVectors(car.angVel, r).add(car.vel);
  const vRel = new V3().copy(ball.vel).sub(vCarPt);
  const vn = vRel.dot(n);
  const frozenBall = ball.frozen > 0;
  if (frozenBall) ball.frozen = 0;
  let hitStrength = 0;
  const approach = vn < 0 ? -vn : 0;
  if (vn < 0) {
    const j = -vn / (1 / mb + 1 / mc);
    ball.vel.addScaledVector(n, j / mb);
    car.vel.addScaledVector(n, -j / mc);
    hitStrength = -vn;
    // grip between car and ball (Rocket League uses a high friction here): off-centre hits make the ball spin
    if (!ball.puck) {
      const rb = new V3().copy(n).multiplyScalar(-ball.radius);           // ball centre → contact point
      const vc = new V3().crossVectors(ball.angVel, rb).add(ball.vel).sub(vCarPt);
      vc.addScaledVector(n, -vc.dot(n));                                    // sliding velocity at the contact
      const vcl = vc.length();
      if (vcl > 1) {
        const jt = Math.min(PHYS.CAR_BALL_FRICTION * j, vcl / (3.5 / mb + 1 / mc));
        const J = vc.multiplyScalar(-jt / vcl);
        ball.vel.addScaledVector(J, 1 / mb);
        ball.angVel.addScaledVector(new V3().crossVectors(rb, J), 2.5 / (mb * ball.radius * ball.radius));
      }
    }
  }

  // extra "psyonix" impulse — once per touch
  const firstContact = !car.ballContact || game.time - car.lastBallHit > 0.12;
  car.ballContact = true;
  if (firstContact) {
    const fwd = car.fwd(new V3());
    const dir = new V3().copy(ball.pos).sub(car.pos).applyQuaternion(_cq);
    dir.y *= 0.35;
    dir.applyQuaternion(car.quat);
    dir.addScaledVector(fwd, -0.35 * dir.dot(fwd)).normalize();
    const dv = relPre;
    let scale = curveLookup(HIT_SCALE_CURVE, dv);
    let power = 1;
    if (car.effects.powerhitter > 0) power = 1.6;
    ball.vel.addScaledVector(dir, dv * scale * power / ball.massMul);
    hitStrength = Math.max(hitStrength, dv);
    car.lastBallHit = game.time;
    // flip reset: ball touching all four wheels (contact under the car)
    if (!car.onGround && nLocal.y < -0.8 && car.airTime > 0.15) {
      car.flipAvail = true; car.flipReset = true; car.jumped = false;
      game.events.push({ type: 'flipreset', car });
    }
    const bs = ball.vel.length(), bmax = PHYS.BALL_MAX_SPEED * (game.mutators.ballSpeed || 1);
    if (bs > bmax) ball.vel.multiplyScalar(bmax / bs);
    // pinch: ball squeezed between the car and the floor / a wall shoots out at huge speed
    const bd = arenaDist(ball.pos.x, ball.pos.y, ball.pos.z, true);
    const pinchV = Math.max(dv, approach);
    if (bd < ball.radius + 45 && pinchV > 650) {
      const sn = arenaNormal(ball.pos.x, ball.pos.y, ball.pos.z, true, new V3());
      // the car must be driving into the surface the ball is resting on, with the ball in between
      const cvl = Math.max(1, car.vel.length());
      const intoV = car.vel.dot(sn);
      if (intoV < -300 && n.dot(sn) < 0.4) {
        const cv = car.vel.clone();
        const vt = cv.addScaledVector(sn, -cv.dot(sn));
        if (vt.lengthSq() < 1) vt.copy(n).addScaledVector(sn, -n.dot(sn));
        vt.normalize();
        const out = vt.multiplyScalar(0.82).addScaledVector(sn, 0.58).normalize();
        const k = clamp(-intoV / cvl, 0, 1);
        const sp = Math.min(PHYS.BALL_MAX_SPEED * (game.mutators.ballSpeed || 1), (2.1 * pinchV + 1300) * (0.55 + 0.45 * k));
        if (sp > ball.vel.length()) {
          ball.vel.copy(out).multiplyScalar(sp);
          ball.pos.addScaledVector(sn, Math.max(0, ball.radius + 2 - bd));
          game.events.push({ type: 'pinch', car, pos: ball.pos.clone(), speed: sp });
          hitStrength = Math.max(hitStrength, sp);
        }
      }
    }
    game.onTouch(car, hitStrength, cpWorld.clone());
  }
  return true;
}

// ---------------------------------------------------------------------------
// Car ↔ car (capsule approximation), bumps & demolitions
// ---------------------------------------------------------------------------
function carCapsule(car, a, b) {
  const f = car.fwd(_c1);
  const c = car.hitboxCenter(_c2);
  const hl = car.half.x - 26;
  a.copy(c).addScaledVector(f, hl);
  b.copy(c).addScaledVector(f, -hl);
}
function closestSegSeg(p1, q1, p2, q2, c1, c2) {
  const d1 = new V3().subVectors(q1, p1), d2 = new V3().subVectors(q2, p2), r = new V3().subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  const c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  s = den > 1e-6 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  c1.copy(p1).addScaledVector(d1, s); c2.copy(p2).addScaledVector(d2, t);
}
const _a1 = new V3(), _a2 = new V3(), _a3 = new V3(), _a4 = new V3(), _p1 = new V3(), _p2 = new V3();
function carCarCollide(A, B, game) {
  if (A.demolished || B.demolished) return;
  if (A.pos.distanceToSquared(B.pos) > 250 * 250) return;
  carCapsule(A, _a1, _a2); const a1 = _a1.clone(), a2 = _a2.clone();
  carCapsule(B, _a3, _a4);
  closestSegSeg(a1, a2, _a3, _a4, _p1, _p2);
  const R = 30;
  const d = _p1.distanceTo(_p2);
  if (d >= R * 2) return;
  const n = new V3().subVectors(_p2, _p1); // A → B
  if (d < 1e-3) n.set(1, 0, 0); else n.multiplyScalar(1 / d);
  const pen = 2 * R - d;
  A.pos.addScaledVector(n, -pen / 2); B.pos.addScaledVector(n, pen / 2);
  const vrel = new V3().subVectors(B.vel, A.vel).dot(n);
  const key = Math.min(A.id, B.id) + ':' + Math.max(A.id, B.id);
  const last = game.bumpCooldown.get(key) || -1;
  if (vrel < 0) {
    // basic separation
    A.vel.addScaledVector(n, vrel * 0.5); B.vel.addScaledVector(n, -vrel * 0.5);
  }
  if (game.time - last < 0.25) return;
  // who is the attacker? the one driving into the other with its nose
  const fa = A.fwd(new V3()), fb = B.fwd(new V3());
  const aAtt = A.vel.dot(n) - B.vel.dot(n) > 0 && fa.dot(n) > 0.5;
  const bAtt = B.vel.dot(n.clone().negate()) - A.vel.dot(n.clone().negate()) > 0 && fb.dot(n) < -0.5;
  let att = null, vic = null, dir = null;
  if (aAtt && (!bAtt || A.vel.length() >= B.vel.length())) { att = A; vic = B; dir = n.clone(); }
  else if (bAtt) { att = B; vic = A; dir = n.clone().negate(); }
  if (!att) return;
  game.bumpCooldown.set(key, game.time);
  const demoMode = game.mutators.demolish;
  const enemy = att.team !== vic.team;
  const canDemo = demoMode !== 'disabled' && (enemy || demoMode === 'friendly');
  if (canDemo && (att.supersonic || demoMode === 'contact' || att.effects.powerhitter > 0)) {
    game.demolish(att, vic);
    return;
  }
  const sp = att.vel.length();
  const vicGround = vic.onGround;
  const mul = vicGround ? 1 : 1.3;
  vic.vel.addScaledVector(dir, sp * 0.65 * mul).add(new V3(0, 1, 0).multiplyScalar(sp * (vicGround ? 0.28 : 0.15)));
  vic.onGround = false; vic.groundGrace = 0.1;
  game.events.push({ type: 'bump', car: att, victim: vic, strength: sp });
}

// ---------------------------------------------------------------------------
// Ball prediction (no cars) — used by bots, shot/save detection, UI
// ---------------------------------------------------------------------------
const Predict = {
  slices: [], ball: null,
  run(src, mut, seconds, hz, heat) {
    if (!this.ball) this.ball = new Ball();
    const b = this.ball;
    b.kind = src.kind; b.t = src.t; b.radius = src.radius; b.h = src.h; b.puck = src.puck; b.rest = src.rest; b.gravMul = src.gravMul;
    b.drag = src.drag; b.fric = src.fric; b.massMul = src.massMul; b.frozen = src.frozen;
    b.pos.copy(src.pos); b.vel.copy(src.vel); b.angVel.copy(src.angVel);
    const dt = 1 / hz, n = Math.floor(seconds * hz);
    while (this.slices.length < n) this.slices.push({ t: 0, pos: new V3(), vel: new V3() });
    this.count = n;
    const h = heat && heat.target >= 0 && typeof heatHome === 'function' ? { target: heat.target, speed: heat.speed, ax: heat.ax, ay: heat.ay } : null;
    for (let i = 0; i < n; i++) {
      if (h) heatHome(b, h, mut.gravity, dt);
      b.step(dt, mut, null);
      const s = this.slices[i];
      s.t = (i + 1) * dt; s.pos.copy(b.pos); s.vel.copy(b.vel);
    }
    return this.slices;
  },
};
// will a ball at this state enter a goal? returns team whose goal (0 blue / 1 orange) or -1
function predictGoal(ball, mut, seconds, heat) {
  const sl = Predict.run(ball, mut, seconds, 30, heat);
  for (let i = 0; i < Predict.count; i++) {
    const g = goalCheck(sl[i].pos, ball.radius);
    if (g >= 0) return { team: g, t: sl[i].t };
  }
  return null;
}
// returns team whose goal the ball is in (-1 = none)
function goalCheck(p, r) {
  const A = ARENA;
  if (A.goal) {
    if (Math.abs(p.z) > A.L + r * 0.98 && Math.abs(p.x) < A.goal.w && p.y < A.goal.h) return p.z < 0 ? 0 : 1;
  } else if (A.hoop) {
    const h = A.hoop;
    const dz = Math.abs(p.z) - h.z;
    if (Math.hypot(p.x, dz) < h.r - 10 && p.y < h.y - r * 0.6) return p.z < 0 ? 0 : 1;
  } else if (A.dropshot) {
    if (p.y < -r * 1.3) return p.z < 0 ? 0 : 1;
  }
  return -1;
}
