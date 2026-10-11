'use strict';
// ============================================================================
// Car physics — ground driving, jumps, dodges, air control, wall driving
// Local frame: +X forward, +Y up, +Z right
// ============================================================================

const BODIES = {
  striker: { name: 'Striker', type: 'Octane', l: 118.01, w: 84.2, h: 36.16, ox: 13.88, oy: 20.75, wf: 51, wb: -34, rf: 12.5, rb: 15 },
  phantom: { name: 'Phantom', type: 'Dominus', l: 127.93, w: 83.28, h: 31.3, ox: 9.0, oy: 15.75, wf: 51, wb: -33, rf: 12, rb: 13.5 },
  blade: { name: 'Blade', type: 'Breakout', l: 131.49, w: 80.52, h: 30.3, ox: 12.5, oy: 11.75, wf: 51, wb: -35, rf: 13.5, rb: 15 },
  wedge: { name: 'Wedge', type: 'Plank', l: 128.82, w: 84.67, h: 29.39, ox: 9.01, oy: 12.09, wf: 50, wb: -35, rf: 12.5, rb: 14 },
  hybrid: { name: 'Hybrid X', type: 'Hybrid', l: 127.02, w: 82.19, h: 34.16, ox: 13.88, oy: 20.75, wf: 54, wb: -36, rf: 13, rb: 15 },
  tank: { name: 'Bulwark', type: 'Merc', l: 120.72, w: 76.71, h: 41.66, ox: 13.88, oy: 20.75, wf: 49, wb: -35, rf: 14, rb: 15.5 },
};

function newControls() {
  return { throttle: 0, steer: 0, pitch: 0, jump: false, boost: false, handbrake: false, rollL: false, rollR: false, useItem: false };
}

const _qa = new Q4(), _qb = new Q4(), _va = new V3(), _vb = new V3(), _vc = new V3(), _vd = new V3(), _ve = new V3(), _vn = new V3();

class Car {
  constructor(id, team, name, isBot, bodyKey, loadout) {
    this.id = id; this.team = team; this.name = name; this.isBot = isBot;
    this.loadout = loadout || {};
    this.setBody(bodyKey || 'striker');
    this.pos = new V3(); this.vel = new V3(); this.angVel = new V3(); this.quat = new Q4();
    this.ctrl = newControls(); this.prevJump = false; this.prevUse = false;
    this.stats = { score: 0, goals: 0, assists: 0, saves: 0, shots: 0, demos: 0, touches: 0, epicSaves: 0, aerials: 0 };
    this.item = null; this.itemTimer = 0;
    this.effects = {}; // rumble effects: spikes, magnet, powerhitter, disrupt etc.
    this.resetState();
  }
  setBody(key) {
    this.bodyKey = key; this.body = BODIES[key] || BODIES.striker;
    const b = this.body;
    this.half = new V3(b.l / 2, b.h / 2, b.w / 2);
    this.hbOff = new V3(b.ox, b.oy, 0); // hitbox centre relative to centre of mass (COM rests 17uu above ground)
    const hx = this.half.x, hy = this.half.y, hz = this.half.z, o = this.hbOff;
    this.samples = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) this.samples.push(new V3(o.x + sx * hx, o.y + sy * hy, sz * hz));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) this.samples.push(new V3(o.x + sx * hx, o.y + sy * hy, 0));
    this.samples.push(new V3(o.x, o.y + hy, 0), new V3(o.x, o.y - hy, 0), new V3(o.x, o.y, hz), new V3(o.x, o.y, -hz));
    this.samples.push(new V3(o.x + hx * 0.3, o.y + hy, hz), new V3(o.x + hx * 0.3, o.y + hy, -hz), new V3(o.x - hx * 0.4, o.y + hy, hz), new V3(o.x - hx * 0.4, o.y + hy, -hz));
    this.boundR = Math.hypot(hx + Math.abs(o.x), hy + o.y, hz) + 4;
  }
  resetState() {
    this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0);
    this.boost = PHYS.BOOST_START; this.onGround = false; this.groundN = new V3(0, 1, 0);
    this.jumped = false; this.jumpHeld = false; this.jumpTime = 0; this.timeSinceJump = 0;
    this.flipAvail = true; this.flipReset = false; this.dodging = false; this.dodgeT = 0; this.dodgeDir = [0, 0]; this.dodgeCancel = false;
    this.groundGrace = 0; this.supersonic = false; this.demolished = false; this.respawnT = 0;
    this.boosting = false; this.lastGroundTime = 0; this.airTime = 0; this.contactRoof = 0;
    this.restT = 0; this.recoverT = 0; this.recoverN = new V3(0, 1, 0); this.postFlipT = 0; this.dodgeAngle = 0; this.wedgeT = 0;
    this.wheelSpin = 0; this.steerVis = 0; this.landedT = 0; this.wasOnGround = false; this.slideAmt = 0;
    this.lastBallHit = -10; this.ballContact = false; this.wallTime = 0;
  }
  spawn(x, z, faceX, faceZ) {
    this.resetState();
    this.pos.set(x, PHYS.REST_HEIGHT, z);
    const a = Math.atan2(-(faceZ - z), faceX - x);
    this.quat.setFromAxisAngle(UP, a);
    this.onGround = true; this.groundN.set(0, 1, 0);
    this.spawnSeq = (this.spawnSeq || 0) + 1; // online: tells a player's own device it was moved (kickoff, respawn)
  }
  fwd(out) { return out.set(1, 0, 0).applyQuaternion(this.quat); }
  up(out) { return out.set(0, 1, 0).applyQuaternion(this.quat); }
  right(out) { return out.set(0, 0, 1).applyQuaternion(this.quat); }
  speed() { return this.vel.length(); }
  hitboxCenter(out) { return out.copy(this.hbOff).applyQuaternion(this.quat).add(this.pos); }
  localToWorld(v, out) { return out.copy(v).applyQuaternion(this.quat).add(this.pos); }

  // -------------------------------------------------------------------------
  step(dt, game) {
    if (this.demolished) return;
    const c = this.ctrl;
    const fwd = this.fwd(_va), up = this.up(_vb);
    const jumpEdge = c.jump && !this.prevJump;
    this.prevJump = c.jump;
    const mut = game.mutators;
    const grav = PHYS.GRAVITY * mut.gravity;

    // unlimited boost / regen modes
    if (mut.boost === 'unlimited') this.boost = 100;
    else if (mut.boost === 'recharge') this.boost = Math.min(100, this.boost + 10 * dt);

    let disrupt = this.effects.disrupt > 0 ? 1 : 0;
    let steer = c.steer, pitch = c.pitch, throttle = c.throttle;
    if (disrupt) { steer = clamp(steer + Math.sin(game.time * 9 + this.id) * 0.8, -1, 1); throttle = clamp(throttle + Math.sin(game.time * 5) * 0.6, -1, 1); }

    // boosting
    const canBoost = mut.boost !== 'none' && this.boost > 0;
    this.boosting = c.boost && canBoost;
    if (this.boosting && mut.boost !== 'unlimited') this.boost = Math.max(0, this.boost - PHYS.BOOST_USE * dt);

    this.timeSinceJump += dt;
    if (this.groundGrace > 0) this.groundGrace -= dt;

    if (this.onGround) {
      this.airTime = 0;
      this.groundStep(dt, c, fwd, up, steer, throttle, grav);
      if (jumpEdge) this.doJump(up, game);
    } else {
      this.airTime += dt;
      this.airStep(dt, c, fwd, up, steer, pitch, throttle, grav, jumpEdge, game);
    }

    // speed caps
    const sp = this.vel.length();
    const vmax = PHYS.CAR_MAX_SPEED * (1 + (this.perf || 0) * 0.4); // top bots' cars are a bit quicker
    if (sp > vmax) this.vel.multiplyScalar(vmax / sp);
    if (sp >= PHYS.SUPERSONIC_START) this.supersonic = true; else if (sp < PHYS.SUPERSONIC_KEEP) this.supersonic = false;

    // integrate
    this.pos.addScaledVector(this.vel, dt);
    const w = this.angVel.length();
    if (w > 1e-6) {
      _qa.setFromAxisAngle(_vc.copy(this.angVel).multiplyScalar(1 / w), w * dt);
      this.quat.premultiply(_qa).normalize();
    }
    this.collideArena(dt, game);
    this.wheelSpin += this.vel.dot(this.fwd(_vd)) * dt / 14;
    this.steerVis = lerp(this.steerVis, this.onGround ? steer : 0, damp(12, dt));
  }

  groundStep(dt, c, fwd, up, steer, throttle, grav) {
    const n = this.groundN;
    const f = _vc.copy(fwd).addScaledVector(n, -fwd.dot(n)).normalize();
    const r = _vd.crossVectors(f, n).normalize();
    let vf = this.vel.dot(f), vl = this.vel.dot(r), vn = this.vel.dot(n);

    // steering
    let curv = curveLookup(STEER_CURVE, Math.abs(vf));
    if (c.handbrake) curv *= 1.4;
    const yawRate = -steer * curv * vf;
    _qa.setFromAxisAngle(n, yawRate * dt);
    f.applyQuaternion(_qa); r.applyQuaternion(_qa);
    this.angVel.copy(n).multiplyScalar(yawRate); // integrated in step()
    // the body turned but momentum didn't: re-split the velocity in the new heading
    vf = this.vel.dot(f); vl = this.vel.dot(r);

    // throttle / brake
    if (this.boosting) throttle = 1;
    let acc = 0;
    if (Math.abs(throttle) > 0.02 && throttle * vf < 0 && Math.abs(vf) > 30) {
      acc = sign(throttle) * PHYS.BRAKE_ACCEL;
      if (Math.abs(acc * dt) > Math.abs(vf)) acc = -vf / dt;
    } else if (Math.abs(throttle) > 0.02) {
      acc = throttle * curveLookup(THROTTLE_CURVE, Math.abs(vf)) * (1 + (this.perf || 0));
    } else {
      acc = -sign(vf) * Math.min(PHYS.COAST_DECEL, Math.abs(vf) / dt);
    }
    if (this.boosting) acc += PHYS.BOOST_ACCEL * (1 + (this.perf || 0));
    vf += acc * dt;

    // tyre grip (powerslide = loose)
    // tyre grip: normally the tyres bend sideways momentum back into forward speed;
    // a powerslide lets the car slide sideways and keeps most of its speed
    const grip = c.handbrake ? 3 : 22;
    const vl2 = vl * Math.exp(-grip * dt);
    const keep = c.handbrake ? 0.75 : 1;
    vf = sign(vf || 1) * Math.sqrt(Math.max(0, vf * vf + (vl * vl - vl2 * vl2) * keep));
    vl = vl2;
    this.slideAmt = lerp(this.slideAmt, Math.abs(vl) > 180 ? 1 : 0, damp(8, dt));

    this.vel.copy(f).multiplyScalar(vf).addScaledVector(r, vl).addScaledVector(n, vn);
    // gravity + sticky force
    this.vel.y -= grav * dt;
    this.vel.addScaledVector(n, -PHYS.STICKY_FORCE * dt);
    if (n.y < 0.7) this.wallTime += dt; else this.wallTime = 0;
    // wedged on a wall (e.g. in a goal corner) and not moving: let go of the wall and drop
    if (n.y < 0.7 && Math.abs(throttle) > 0.1 && Math.abs(vf) < 60) this.wedgeT += dt; else this.wedgeT = 0;
    if (this.wedgeT > 0.6) { this.wedgeT = 0; this.vel.addScaledVector(n, 250); this.onGround = false; this.groundGrace = 0.35; }
  }

  doJump(up, game) {
    this.vel.addScaledVector(up, PHYS.JUMP_IMPULSE);
    this.jumped = true; this.jumpHeld = true; this.jumpTime = 0; this.timeSinceJump = 0;
    this.onGround = false; this.groundGrace = 0.06; this.flipAvail = true; this.flipReset = false;
    this.jumpUp = up.clone();
    game.events.push({ type: 'jump', car: this });
  }

  airStep(dt, c, fwd, up, steer, pitch, throttle, grav, jumpEdge, game) {
    // jump hold
    if (this.jumpHeld) {
      if (c.jump && this.jumpTime < PHYS.JUMP_HOLD_TIME) {
        this.vel.addScaledVector(up, PHYS.JUMP_HOLD_ACCEL * dt);
      } else if (this.jumpTime >= PHYS.JUMP_MIN_TIME) this.jumpHeld = false;
      this.jumpTime += dt;
    }

    // recovery when resting on the side or roof: jump flips you back onto your wheels,
    // and a car left lying on its side rights itself after a moment
    if (this.contactRoof > 0 && this.vel.length() < 600) this.restT += dt; else this.restT = 0;
    const lyingDot = up.dot(this.groundN);
    if (this.recoverT <= 0 && this.contactRoof > 0 && this.groundN.y > 0.45 && (jumpEdge || this.restT > 0.12)) {
      this.recoverT = 0.45;
      this.recoverN.copy(this.groundN);
      this.vel.addScaledVector(this.recoverN, jumpEdge ? 300 : 150);
      this.groundGrace = 0.12; this.restT = 0; this.contactRoof = 0;
      if (jumpEdge) { game.events.push({ type: 'jump', car: this }); jumpEdge = false; }
    }
    if (this.recoverT > 0) {
      this.recoverT -= dt;
      const d = up.dot(this.recoverN);
      if (d < -0.95) _qa.setFromAxisAngle(this.fwd(_vn), Math.PI); else _qa.setFromUnitVectors(up, this.recoverN);
      _qb.identity().slerp(_qa, damp(15, dt));
      this.quat.premultiply(_qb).normalize();
      this.angVel.set(0, 0, 0);
      this.vel.y -= grav * dt;
      if (this.recoverT <= 0 || d > 0.97) { this.recoverT = 0; this.postFlipT = 0.4; }
      return;
    }

    // second jump: double jump or dodge
    if (jumpEdge && this.flipAvail && !this.jumpHeld && (this.flipReset || !this.jumped || this.timeSinceJump < PHYS.DOUBLE_JUMP_WINDOW)) {
      const sx = pitch, sy = steer + (c.rollR ? 0 : 0);
      const mag = Math.abs(sx) + Math.abs(sy);
      if (mag > 0.5) this.startDodge(sx, sy, fwd, game);
      else {
        this.vel.addScaledVector(up, PHYS.JUMP_IMPULSE);
        game.events.push({ type: 'doublejump', car: this });
      }
      this.flipAvail = false; this.flipReset = false;
    }

    // air control (local angular velocity)
    _qa.copy(this.quat).invert();
    const wl = _vc.copy(this.angVel).applyQuaternion(_qa);
    let yawIn = steer, rollIn = 0;
    if (c.handbrake) { rollIn = steer; yawIn = 0; }
    rollIn = clamp(rollIn + (c.rollR ? 1 : 0) - (c.rollL ? 1 : 0) + (c.roll || 0), -1, 1);
    let pitchIn = pitch;

    if (this.dodging) {
      // scripted flip: one clean 360° rotation, then the car is level again
      this.dodgeT += dt;
      const [dx, dy] = this.dodgeDir;
      const len = Math.hypot(dx, dy) || 1;
      if (dx !== 0 && pitchIn * dx < -0.4 && this.dodgeT > 0.06) {
        // flip cancel (half-flip): stop the pitch rotation and hand control back
        this.dodgeCancel = true; this.dodging = false; wl.z *= 0.15;
      } else {
        const full = Math.PI * 2;
        const step = Math.min(full / PHYS.FLIP_SPIN_TIME * dt, full - this.dodgeAngle);
        const w = step / dt;
        wl.z = -dx / len * w;
        wl.x = dy / len * w + rollIn * 2;
        wl.y = 0;
        this.dodgeAngle += step;
        pitchIn = 0; yawIn = 0;
        this.vel.y += grav * 0.35 * dt; // flips float a little
        if (this.dodgeAngle >= full - 1e-4) { this.dodging = false; this.postFlipT = 0.5; wl.set(rollIn * 2, 0, 0); }
      }
    }
    if (this.postFlipT > 0) { this.postFlipT -= dt; pitchIn = 0; yawIn = 0; }
    if (!this.dodging) {
      wl.x += (36.08 * rollIn - 4.47 * wl.x) * dt;
      wl.z += (12.15 * -pitchIn - 2.80 * wl.z * (1 - Math.abs(pitchIn))) * dt;
      wl.y += (8.92 * -yawIn - 1.89 * wl.y * (1 - Math.abs(yawIn))) * dt;
    }
    const wm = wl.length();
    if (!this.dodging && wm > PHYS.MAX_ANG_VEL) wl.multiplyScalar(PHYS.MAX_ANG_VEL / wm);
    this.angVel.copy(wl).applyQuaternion(this.quat);

    // landing assist: when dropping close to a surface, ease the car towards wheels-down
    if (!this.dodging && this.airTime > 0.25 && this.vel.y < -50) {
      const dd = arenaDist(this.pos.x, this.pos.y, this.pos.z, false);
      if (dd < 170) {
        const n = arenaNormal(this.pos.x, this.pos.y, this.pos.z, false, _vn);
        if (up.dot(n) < 0.97) {
          if (up.dot(n) < -0.95) _qa.setFromAxisAngle(this.fwd(_ve), Math.PI); else _qa.setFromUnitVectors(up, n);
          _qb.identity().slerp(_qa, damp(7 * (1 - dd / 200), dt));
          this.quat.premultiply(_qb).normalize();
          this.angVel.multiplyScalar(1 - damp(6, dt));
        }
      }
    }

    // forces
    if (this.boosting) this.vel.addScaledVector(fwd, PHYS.BOOST_ACCEL * (1 + (this.perf || 0)) * dt);
    else if (Math.abs(throttle) > 0.02) this.vel.addScaledVector(fwd, PHYS.AIR_THROTTLE_ACCEL * throttle * dt);
    this.vel.y -= grav * dt;
    if (this.contactRoof > 0) this.contactRoof -= dt;
  }

  startDodge(sx, sy, fwd, game) {
    let dx = sx, dy = sy;
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx /= m; dy /= m;
    if (Math.abs(dx) < 0.1) dx = 0; if (Math.abs(dy) < 0.1) dy = 0;
    const fh = _vd.set(fwd.x, 0, fwd.z);
    if (fh.lengthSq() < 1e-4) fh.copy(this.vel).setY(0);
    if (fh.lengthSq() < 1e-4) fh.set(1, 0, 0);
    fh.normalize();
    const rh = _ve.crossVectors(fh, UP);
    const vf = this.vel.dot(fh);
    const fImp = dx * PHYS.DODGE_IMPULSE * (dx < 0 ? 1.06 : 1);
    const sImp = dy * PHYS.DODGE_IMPULSE * (1 + 0.9 * Math.min(1, Math.abs(vf) / PHYS.CAR_MAX_SPEED));
    const len = Math.hypot(dx, dy);
    this.vel.addScaledVector(fh, fImp / Math.max(1, len)).addScaledVector(rh, sImp / Math.max(1, len));
    this.vel.y = Math.max(0, this.vel.y);
    this.dodging = true; this.dodgeT = 0; this.dodgeDir = [dx, dy]; this.dodgeCancel = false; this.dodgeAngle = 0;
    game.events.push({ type: 'dodge', car: this, dir: [dx, dy] });
  }

  // -------------------------------------------------------------------------
  collideArena(dt, game) {
    const d0 = arenaDist(this.pos.x, this.pos.y, this.pos.z, false);
    const n = _vn;
    const wasGround = this.onGround;
    this.wasOnGround = wasGround;
    this.onGround = false;

    // wheel contact
    if (d0 < 70) {
      arenaNormal(this.pos.x, this.pos.y, this.pos.z, false, n);
      const up = this.up(_vc);
      const upDot = up.dot(n);
      const vn = this.vel.dot(n);
      const reach = wasGround ? PHYS.REST_HEIGHT + 8 : PHYS.REST_HEIGHT + 2;
      if (d0 < reach && upDot > (wasGround ? 0.55 : 0.3) && vn < 250 && (this.groundGrace <= 0 || vn < -1)) {
        this.onGround = true;
        this.groundN.copy(n);
        if (d0 < PHYS.REST_HEIGHT) this.pos.addScaledVector(n, PHYS.REST_HEIGHT - d0);
        else this.pos.addScaledVector(n, (PHYS.REST_HEIGHT - d0) * Math.min(1, dt * 40));
        if (vn < 0) {
          const sp = this.vel.length();
          this.vel.addScaledVector(n, -vn);
          // following a curve: keep speed
          if (wasGround && -vn < sp * 0.35) { const s2 = this.vel.length(); if (s2 > 1) this.vel.multiplyScalar(sp / s2); }
        }
        // align body to the surface
        if (upDot < 0.99999) {
          _qa.setFromUnitVectors(up, n);
          if (wasGround) this.quat.premultiply(_qa).normalize();
          else { _qb.identity().slerp(_qa, damp(14, dt)); this.quat.premultiply(_qb).normalize(); }
        }
        if (!wasGround) this.land(game, n);
      }
    }

    // hitbox collisions (body hitting the world)
    if (d0 < this.boundR + 10) {
      let rest = 0.15;
      for (let iter = 0; iter < 2; iter++) {
        let worst = 0, wi = -1;
        const p = _vd;
        for (let i = 0; i < this.samples.length; i++) {
          if (this.onGround && this.samples[i].y < this.hbOff.y) continue; // wheels handle the ground
          this.localToWorld(this.samples[i], p);
          const d = arenaDist(p.x, p.y, p.z, false);
          if (d < worst) { worst = d; wi = i; }
        }
        if (wi < 0) break;
        this.localToWorld(this.samples[wi], p);
        arenaNormal(p.x, p.y, p.z, false, n);
        this.pos.addScaledVector(n, -worst);
        const rr = _ve.copy(p).sub(this.pos);
        // point velocity
        const pv = _vc.crossVectors(this.angVel, rr).add(this.vel);
        const vn = pv.dot(n);
        if (vn < 0) {
          const I = PHYS.CAR_MASS * 2200; // scalar inertia approximation
          const rxn = _va.crossVectors(rr, n);
          const j = -(1 + rest) * vn / (1 / PHYS.CAR_MASS + rxn.lengthSq() / I);
          this.vel.addScaledVector(n, j / PHYS.CAR_MASS);
          this.angVel.addScaledVector(rxn, j / I);
          // friction
          // Coulomb friction: limited by how hard the car hit, so scraping keeps most speed
          const vt = pv.addScaledVector(n, -vn);
          const vtl = vt.length();
          if (vtl > 1e-3) this.vel.addScaledVector(vt, -Math.min(0.15, 0.25 * (j / PHYS.CAR_MASS) / vtl));
          if (this.onGround) this.angVel.multiplyScalar(0.5);
        }
        const upN = this.up(_va).dot(n);
        if (upN < 0.55) {
          this.contactRoof = 0.25; this.groundN.copy(n);
          if (!this.onGround) { this.flipAvail = true; this.jumped = false; }
          this.angVel.multiplyScalar(0.92);
        }
      }
    }
    if (!this.onGround && wasGround) {
      this.lastGroundTime = game.time;
      if (!this.jumped) { this.flipAvail = true; this.timeSinceJump = 0; }
    }
  }

  land(game, n) {
    this.jumped = false; this.jumpHeld = false; this.flipAvail = true; this.flipReset = false;
    this.dodging = false; this.angVel.set(0, 0, 0); this.landedT = game.time;
    game.events.push({ type: 'land', car: this, impact: this.vel.dot(n) });
  }
}
