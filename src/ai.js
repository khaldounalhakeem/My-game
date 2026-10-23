'use strict';
// ============================================================================
// Bots: ball prediction intercepts, shooting, rotation, kickoffs, aerials,
// recovery, boost management, quick chat banter
// ============================================================================

const _ai1 = new V3(), _ai2 = new V3(), _ai3 = new V3(), _ai4 = new V3(), _aiq = new Q4();

class Bot {
  constructor(car, levelKey) {
    this.car = car; this.lv = typeof levelKey === 'object' ? levelKey : (BOT_LEVELS[levelKey] || BOT_LEVELS.pro);
    this.seq = []; this.seqT = 0; this.thinkT = Math.random() * 0.2; this.target = new V3(); this.targetT = 0;
    this.mode = 'idle'; this.aerial = null; this.flipCd = 0; this.chatCd = rand(5, 10); this.noise = new V3();
    this.role = 'attack'; this.itemT = rand(1, 3); this.kickoffMove = 0;
  }
  local(p, out) {
    _aiq.copy(this.car.quat).invert();
    return out.copy(p).sub(this.car.pos).applyQuaternion(_aiq);
  }
  attackDir() { return this.car.team === 0 ? 1 : -1; }
  ownGoal(out) { return out.set(0, 0, -this.attackDir() * ARENA.L); }
  oppGoal(out) {
    if (ARENA.hoop) return out.set(0, ARENA.hoop.y + 150, this.attackDir() * ARENA.hoop.z);
    if (ARENA.dropshot) return out.set(0, 0, this.attackDir() * ARENA.L * 0.55);
    return out.set(0, 200, this.attackDir() * (ARENA.L + 200));
  }

  eta(p) {
    const car = this.car;
    const l = this.local(p, _ai1);
    const dist = Math.hypot(l.x, l.z);
    const ang = Math.abs(Math.atan2(l.z, l.x));
    const v = Math.max(0, car.vel.dot(car.fwd(_ai2)));
    const top = (car.boost > 15 && this.lv.maxBoost > 0.5) ? 2150 : 1410;
    const avg = Math.max(700, (v + top) / 2);
    return dist / avg + ang * 0.42 + (car.onGround ? 0 : 0.25);
  }

  // ---------------------------------------------------------------------------
  update(game, dt) {
    const car = this.car, c = car.ctrl;
    if (car.demolished) return;
    c.throttle = 0; c.steer = 0; c.pitch = 0; c.jump = false; c.boost = false; c.handbrake = false; c.rollL = c.rollR = false; c.roll = 0; c.useItem = false;
    this.flipCd -= dt; this.chatCd -= dt;

    if (game.state === 'countdown') { this.kickoffMove = 0; return; }

    // running scripted sequence (jumps / flips)
    if (this.seq.length) {
      const s = this.seq[0];
      Object.assign(c, s.c);
      if (s.aim && this.aimPoint) this.airAim(this.aimPoint, c, true);
      this.seqT += dt;
      if (this.seqT >= s.d) { this.seq.shift(); this.seqT = 0; }
      return;
    }

    if (this.aerial) { this.doAerial(game, dt); return; }
    // wedged against something (a goal post, the back of the net): back out
    if (car.onGround && Math.abs(c.throttle) < 0.01) {
      const vfw = car.vel.length();
      this.stuckT = vfw < 120 && this.wantMove ? (this.stuckT || 0) + dt : 0;
      if (this.stuckT > 0.6) { this.stuckT = 0; this.seq = [{ d: 0.7, c: { throttle: -1, steer: Math.random() < 0.5 ? -1 : 1 } }]; this.seqT = 0; return; }
    }
    if (!car.onGround) {
      // still flying with boost: go for the next touch (air dribble, double touch off the wall/backboard)
      this.followCd = (this.followCd || 0) - dt;
      if (this.followCd <= 0 && this.airFollow(game)) { this.doAerial(game, dt); return; }
      this.recover(game, c); return;
    }

    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.think(game); this.thinkT = this.lv.react * rand(0.7, 1.3); }
    this.drive(game, dt);

    // rumble items
    if (car.item) {
      this.itemT -= dt;
      if (this.itemT < 0 && this.wantItem(game)) { c.useItem = true; this.itemT = rand(1, 3); }
    }
  }

  wantItem(game) {
    const d = this.car.pos.distanceTo(game.ball.pos);
    const it = this.car.item;
    if (['spikes', 'powerhitter', 'magnet', 'grapple', 'plunger', 'haymaker', 'freeze'].includes(it)) return d < 1800;
    return true;
  }

  think(game) {
    const car = this.car, ball = game.ball;
    this.arriveSlow = false;
    const pred = game.prediction;
    const dir = this.attackDir();
    // kickoff
    if (game.kickoffPending) {
      const mates = game.cars.filter(o => o.team === car.team && !o.demolished);
      let best = null, bd = 1e9;
      for (const m of mates) {
        // a human who isn't driving at the ball after GO doesn't count as taking the kickoff
        if (!m.bot && game.goTime !== undefined && game.time - game.goTime > 0.5 && !humanCommitted(m, ball)) continue;
        const d = m.pos.distanceTo(ball.pos) + m.pos.x * 0.001; if (d < bd) { bd = d; best = m; }
      }
      this.mode = best === car ? 'kickoff' : 'kickoffSupport';
      return;
    }
    // team roles
    const team = game.cars.filter(o => o.team === car.team && !o.demolished);
    const etas = team.map(o => {
      const onside = (ball.pos.z - o.pos.z) * dir > -200 ? 0 : 1.2;
      // only defer to a human teammate who is actually going for the ball
      return { car: o, e: o.bot ? o.bot.eta(ball.pos) + onside : estimateHumanEta(o, ball.pos) + onside + (humanCommitted(o, ball) ? 0 : 2.5) };
    }).sort((a, b) => a.e - b.e);
    const idx = etas.findIndex(x => x.car === car);
    this.role = idx === 0 ? 'attack' : idx === 1 ? 'support' : 'goalie';
    if (team.length === 1) this.role = 'attack';
    this.heatMode = game.mode === 'heatseeker';
    if (this.heatMode) {
      // the ball always homes in on a goal: one bot guards the net, the closest bot to it
      const incoming = game.heat.target === car.team;
      this.keeperSide = 0;
      // top bots in 1v1 never leave the net open: the ball always comes back to it
      if (team.length === 1) this.role = incoming || this.lv.aggro ? 'keeper' : 'attack';
      else {
        // teamwork: one player stays up front to finish after a save, everybody else guards the net.
        // A human teammate past the half line is the striker, so every bot stays home.
        const humanUp = team.some(o => !o.bot && o.pos.z * dir > -300);
        const bots = team.filter(o => o.bot);
        let striker = null;
        if (!humanUp && bots.length > 1) striker = bots.slice().sort((a, b) => b.pos.z * dir - a.pos.z * dir)[0];
        if (car === striker) this.role = 'striker';
        else {
          this.role = 'keeper';
          const keepers = bots.filter(o => o !== striker).sort((a, b) => a.pos.x - b.pos.x);
          if (keepers.length > 1) this.keeperSide = (keepers.indexOf(car) === 0 ? -1 : 1);
        }
      }
    }

    // passing play: the receiver goes for the ball, the passer moves up for a return pass or rebound
    const pass = game.pass && game.time - game.pass.t < 2.6 && game.pass.from.team === car.team ? game.pass : null;
    if (pass && !this.heatMode) {
      if (pass.to === car) this.role = 'attack';
      else if (pass.from === car) this.role = 'passer';
      else if (this.role === 'attack') this.role = 'support';
    }

    // threat: ball heading into our goal soon
    const threat = game.ballThreat && game.ballThreat.team === car.team && game.ballThreat.t < 3;
    if (threat && idx <= 1 && this.role !== 'keeper' && this.role !== 'striker') this.role = 'attack';

    // find intercept slice
    let chosen = null;
    const air = this.aerialSkill(game);
    const maxH = (air > 0 && car.boost > (this.heatMode ? 12 : 35)) ? 1200 * air + 250 : 260;
    const og = this.oppGoal(new V3());
    for (let i = 0; i < pred.count; i += 2) {
      const s = pred.slices[i];
      if (s.pos.y > maxH) continue;
      if (wallDist2D(s.pos.x, s.pos.z) < 140 && s.pos.y > 200) continue;
      const aim = this.shotPoint(s.pos, og, _ai4);
      const e = this.eta(aim) + (s.pos.y > 260 ? 0.35 : 0);
      if (e <= s.t) { chosen = { t: s.t, pos: s.pos.clone(), aim: aim.clone() }; break; }
    }
    if (!chosen && pred.count) {
      const s = pred.slices[Math.min(pred.count - 1, 90)];
      chosen = { t: s.t, pos: s.pos.clone(), aim: this.shotPoint(s.pos, og, _ai4).clone() };
    }
    this.intercept = chosen;

    // goalie/support positioning
    const own = this.ownGoal(_ai1);
    if (this.role === 'passer') {
      // after the pass: get into a spot in front of goal on the far side for the return ball or a rebound
      this.mode = 'position';
      const og = this.oppGoal(_ai2);
      this.target.set(-Math.sign(ball.pos.x || 1) * 700, 0, og.z - dir * 1700);
    } else if (this.role === 'keeper') {
      // stand on the goal line, step out to save when the ball is coming
      this.mode = 'keeper';
      this.target.set(clamp(ball.pos.x * 0.3, -600, 600), 0, own.z + dir * 220);
      // only leave the net to clear a slow ball sitting near our goal (with two keepers, the one on that side)
      const mySide = !this.keeperSide || Math.sign(ball.pos.x || 1) === this.keeperSide;
      if (mySide && ball.vel.length() < 700 && Math.abs(ball.pos.z - own.z) < 2200 && ball.pos.y < 250) { this.mode = 'attack'; this.role = 'attack'; }
    } else if (this.role === 'striker') {
      // ball coming at our net: wait just past the half line for the save, then finish it (in the air if needed)
      if (game.heat.target === car.team || (this.saving && game.ballThreat && game.ballThreat.team === car.team)) {
        this.mode = 'position';
        this.target.set(clamp(ball.pos.x * 0.4, -1500, 1500), 0, dir * 900);
      } else this.role = 'attack';
    } else if (this.role === 'goalie') {
      this.mode = 'position';
      this.target.set(clamp(ball.pos.x * 0.35, -700, 700), 0, own.z + dir * 350);
      if ((ball.pos.z - own.z) * dir < 2500) this.role = 'attack';
    } else if (this.role === 'support') {
      this.mode = 'position';
      const bz = ball.pos.z - dir * 1900;
      this.target.set(ball.pos.x * 0.45, 0, clamp(bz, -ARENA.L + 600, ARENA.L - 600));
      // our attacker has the ball up the field: skilled players get in front of goal for a pass
      // (in 3v3 the last player still stays back)
      const att = etas[0] && etas[0].car !== car ? etas[0] : null;
      const oppBest = Math.min(...game.cars.filter(o => o.team !== car.team && !o.demolished).map(o => o.bot ? o.bot.eta(ball.pos) : estimateHumanEta(o, ball.pos)), 9);
      if ((this.lv.pass || 0) > 0.45 && ARENA.goal && att && att.e < oppBest + 0.2 && ball.pos.z * dir > 600 && !this.heatMode) {
        const og = this.oppGoal(_ai2);
        this.target.set(-Math.sign(ball.pos.x || 1) * 600, 0, og.z - dir * 2000);
        this.mode = 'position';
      }
      // grab boost on the way if low
      if (car.boost < 40) {
        const pad = this.nearestPad(game, true);
        if (pad) { this.target.set(pad.x, 0, pad.z); this.mode = 'boost'; }
      }
    }
    if (this.role === 'attack') {
      this.mode = 'attack';
      // wrong side of the ball: rotate back post first
      const behind = (ball.pos.z - car.pos.z) * dir;
      const ballD = (ball.pos.z - own.z) * dir, carD = (car.pos.z - own.z) * dir;
      const skilled = (this.lv.skill || 0) > 0.8;
      // near our own net, never hit the ball from the wrong side (that's how own goals happen): get goal-side first,
      // unless the ball is already rolling into the net and we're the only hope
      this.arriveSlow = false;
      const wrongSide = carD > ballD - 60;
      const nearOwn = ballD < 2600;
      const lastChance = threat && game.ballThreat.t < 0.9;
      if (skilled && wrongSide && ((nearOwn && !lastChance) || (carD > ballD + 250 && car.pos.distanceTo(ball.pos) > 700 && (ballD < 4200 || threat))) && ballD > 450) {
        // ball between us and our own net: race back to the far post and face the play, don't chase it from behind
        this.mode = 'rotate';
        const side = -Math.sign(ball.pos.x || car.pos.x || 1);
        this.target.set(side * 650, 0, own.z + dir * 350);
        // a shot is on its way in: get to where it will cross the line instead, and stop there (no overshooting into the net)
        if (threat && ARENA.goal) {
          const cr = pred.slices.slice(0, pred.count).find(sl => (sl.pos.z - own.z) * dir < 250);
          if (cr) this.target.set(clamp(cr.pos.x, -ARENA.goal.w + 120, ARENA.goal.w - 120), 0, own.z + dir * 200);
          this.arriveSlow = true;
        }
      } else if (behind < -250 && !threat) {
        this.mode = 'rotate';
        const side = car.pos.x > 0 ? 1 : -1;
        this.target.set(side * 900, 0, own.z + dir * 900);
        if ((ball.pos.z - own.z) * dir > 4500) this.target.set(ball.pos.x * 0.3, 0, ball.pos.z - dir * 1600);
      }
      // a shot is coming and we're between the ball and our net: stand in the goal and make the save
      this.saving = false;
      // driving towards our own net next to the ball: any touch now would push it in, so block on the line instead
      const towardOwn = -car.vel.z * dir;
      if (skilled && ARENA.goal && !this.heatMode && ballD < 2200 && towardOwn > 300 && carD < ballD + 200 && carD > 150) { this.mode = 'keeper'; this.saving = true; }
      if (this.lv.saver && threat && game.ballThreat.t < 1.8 && carD < ballD - 200 && carD < 1400 && !this.heatMode && ARENA.goal) {
        // only if we can't simply reach the ball first
        if (!(chosen && chosen.t < game.ballThreat.t - 0.4)) { this.mode = 'keeper'; this.saving = true; }
      }
      // stuck inside our own net: drive straight out
      if (Math.abs(car.pos.z) > ARENA.L - 40 && Math.sign(car.pos.z) === Math.sign(own.z)) { this.mode = 'rotate'; this.target.set(car.pos.x * 0.5, 0, own.z + dir * 700); }
      const ballComing = ball.vel.z * dir < -300 && ballD < 6000;
      if (car.boost < 15 && this.mode === 'attack' && chosen && chosen.t > 2.2 && !(skilled && ballComing)) {
        const pad = this.nearestPad(game, false);
        if (pad && pad.dist < 1200) { this.target.set(pad.x, 0, pad.z); this.mode = 'boost'; }
      }
    }
    // aim noise by skill
    const nz = (1 - this.lv.aim) * 600;
    this.noise.set(rand(-nz, nz), 0, rand(-nz, nz) * 0.3);
  }

  shotPoint(ballPos, goal, out) {
    // point behind the ball along the shot direction; curve in from further back when badly aligned
    const g = _ai2.copy(goal);
    if (ARENA.goal) g.x = clamp(ballPos.x * 0.6, -ARENA.goal.w + 250, ARENA.goal.w - 250);
    const sd = g.sub(ballPos); sd.y = 0; sd.normalize();
    const carTo = _ai3.copy(ballPos).sub(this.car.pos); carTo.y = 0;
    const dist = carTo.length();
    carTo.normalize();
    const align = carTo.dot(sd);
    let back = PHYS.BALL_RADIUS * 0.6 + 30;
    if (dist > 600 && ballPos.y < 250) back += (1 - align) * 0.5 * Math.min(dist * 0.45, 900) * this.lv.skill;
    out.copy(ballPos).addScaledVector(sd, -back);
    out.y = ballPos.y;
    out.x = clamp(out.x, -ARENA.W + 150, ARENA.W - 150);
    out.z = clamp(out.z, -ARENA.L + 150, ARENA.L - 150);
    return out;
  }

  nearestPad(game, bigOnly) {
    let best = null, bd = 1e9;
    for (const p of game.pads) {
      if (!p.active || (bigOnly && !p.big)) continue;
      const d = Math.hypot(p.x - this.car.pos.x, p.z - this.car.pos.z) * (p.big ? 0.7 : 1.4);
      // prefer pads on our half
      const own = (p.z * this.attackDir() < 0) ? 0.8 : 1.2;
      if (d * own < bd) { bd = d * own; best = p; }
    }
    if (best) best.dist = bd;
    return best;
  }

  // ---------------------------------------------------------------------------
  drive(game, dt) {
    const car = this.car, c = car.ctrl, ball = game.ball;
    let tgt = this.target, wantSpeed = 2300, arriveT = 0;
    const T0 = this._t0 || (this._t0 = new V3());
    if (this.mode === 'kickoff') {
      tgt = T0.copy(ball.pos);
      tgt.x += car.pos.x > 50 ? -18 : car.pos.x < -50 ? 18 : 0;
      const d = car.pos.distanceTo(ball.pos);
      c.boost = true;
      if (d < 680 + car.vel.length() * 0.12 && this.flipCd <= 0 && this.lv.flip > 0.25) {
        this.aimPoint = ball.pos.clone();
        this.seq = [{ d: 0.06, c: { jump: true, throttle: 1, boost: true } }, { d: 0.04, c: { jump: false, throttle: 1, boost: true } }, { d: 0.6, c: { jump: true, pitch: 1, throttle: 1 } }];
        this.flipCd = 2; this.seqT = 0;
      }
    } else if (this.mode === 'kickoffSupport') {
      const own = this.ownGoal(_ai1);
      const pad = this.nearestPad(game, true);
      tgt = this.role === 'goalie' || !pad ? T0.set(0, 0, own.z + this.attackDir() * 400) : T0.set(pad.x, 0, pad.z);
      if (Math.abs(car.pos.x) < 400) tgt = T0.set(0, 0, own.z + this.attackDir() * 400);
    } else if (this.mode === 'keeper') {
      const dir = this.attackDir(), ownZ = -dir * ARENA.L;
      // where and when will the ball reach our goal line?
      let cross = null;
      if (game.heat.target === car.team) {
        const pred = game.prediction;
        const plane = Math.min((car.pos.z - ownZ) * dir + 40, 700);
        for (let i = 0; i < pred.count; i++) { const sl = pred.slices[i]; if ((sl.pos.z - ownZ) * dir < plane) { cross = sl; break; } }
      }
      const lineZ = ownZ + dir * 200;
      const tx = cross ? clamp(cross.pos.x, -ARENA.goal.w + 120, ARENA.goal.w - 120) : clamp(ball.pos.x * 0.3, -600, 600);
      // save: leave the ground in time to meet the ball at its height
      if (cross && car.onGround && Math.abs(car.pos.z - lineZ) < 400) {
        const H = cross.pos.y, T = cross.t;
        // jump early enough that the car is up at the ball's height as it arrives (hold longer for higher balls)
        const lead = H < 200 ? 0.25 : H < 260 ? 0.45 : 0.7;
        if (T < lead && Math.abs(car.pos.x - cross.pos.x) < (this.lv.aggro ? 300 : 200)) {
          this.aimPoint = cross.pos.clone();
          if (H < 260) this.seq = [{ d: clamp((H - 100) / 700, 0.05, 0.2), c: { jump: true } }, { d: 0.6, c: { jump: false } }];
          else this.seq = [{ d: 0.2, c: { jump: true } }, { d: 0.04, c: { jump: false } }, { d: 0.05, c: { jump: true } }, { d: 0.5, c: { boost: car.boost > 5 }, aim: true }];
          this.seqT = 0; return;
        }
      }
      // drive onto the middle of the goal line and stop there (any facing works for a block)
      // two keepers split the goal: one covers each half
      const px = this.keeperSide < 0 ? clamp(tx, -650, -110) : this.keeperSide > 0 ? clamp(tx, 110, 650) : clamp(tx, -220, 220);
      const d = Math.hypot(car.pos.x - px, car.pos.z - lineZ);
      if (d < 140 && car.onGround) {
        const vf = car.vel.dot(car.fwd(_ai4));
        c.throttle = Math.abs(vf) > 40 ? -sign(vf) * Math.min(1, Math.abs(vf) / 250) : 0;
        c.steer = 0; c.boost = false;
        return;
      }
      tgt = T0.set(px, 0, lineZ);
      wantSpeed = clamp(d * 1.8, 250, 2300);
      if (d > 1500) c.boost = car.boost > 0;
    } else if (this.mode === 'attack' && this.intercept) {
      const I = this.intercept;
      tgt = T0.copy(I.aim).add(this.noise);
      arriveT = I.t;
      // timing: slow down if early
      const e = this.eta(tgt);
      const lead = I.t - e;
      // timing: weaker players crawl to the ball; strong ones only ease off when they're very early, and hit it at speed
      const early = this.lv.commit ? 0.9 : 0.35;
      if (lead > early) wantSpeed = clamp(car.pos.distanceTo(tgt) / Math.max(0.3, I.t) * (this.lv.commit ? 1.5 : 1.15), this.lv.commit ? 900 : 350, 2300);
      // jump / aerial decision
      const localB = this.local(I.pos, _ai3);
      const flatD = Math.hypot(localB.x, localB.z);
      const h = I.pos.y;
      const aligned = Math.abs(Math.atan2(localB.z, localB.x)) < 0.35;
      const air = this.aerialSkill(game);
      if (h > 300 && air > 0 && car.boost > (this.heatMode ? 12 : 25) && aligned && I.t < 1.3 + air * 0.6 && I.t > 0.4 && car.groundN.y > 0.9) {
        this.startAerial(I);
        return;
      }
      const jumpT = h < 230 ? 0.16 : 0.22 + (h - 230) / 900;
      if (h > 175 && h < 330 && aligned && I.t < jumpT && flatD < 700) {
        const hold = clamp((h - 150) / 800, 0.03, 0.2);
        const side = clamp(localB.z / 150, -1, 1);
        this.seq = [{ d: hold, c: { jump: true, throttle: 1 } }, { d: 0.04, c: { jump: false, throttle: 1 } }];
        if (this.lv.flip > 0.5) this.seq.push({ d: 0.5, c: { jump: true, pitch: 1, steer: side * 0.6 } });
        this.seqT = 0; return;
      }
      // power flip into a ground ball
      const dToBall = car.pos.distanceTo(ball.pos);
      const ownGoalDanger = (this.lv.skill || 0) > 0.8 && (-car.vel.z * this.attackDir()) > 200 && Math.abs(ball.pos.z - this.ownGoal(_ai4).z) < 2400;
      if (!ownGoalDanger && dToBall < 380 && ball.pos.y < 175 && aligned && this.flipCd <= 0 && Math.random() < (this.lv.pflip || this.lv.flip * 0.25) && car.vel.length() > 600) {
        const side = clamp(localB.z / 120, -1, 1);
        this.seq = [{ d: 0.05, c: { jump: true, throttle: 1 } }, { d: 0.04, c: { jump: false, throttle: 1 } }, { d: 0.5, c: { jump: true, pitch: 1, steer: side } }];
        this.flipCd = 1.5; this.seqT = 0; return;
      }
    }
    // racing back to block a shot: brake into the spot instead of flying past it into our own net
    if (this.mode === 'rotate' && this.arriveSlow) wantSpeed = Math.min(wantSpeed, clamp(car.pos.distanceTo(tgt) * 2, 250, 2300));
    this.steerTo(tgt, wantSpeed, c, game);

    // speed flip when no boost and long distance
    const l = this.local(tgt, _ai3);
    const d = Math.hypot(l.x, l.z);
    const sp = car.vel.dot(car.fwd(_ai4));
    if (car.boost < 5 && d > 2600 && sp > 1000 && sp < 2050 && Math.abs(Math.atan2(l.z, l.x)) < 0.08 && this.flipCd <= 0 && Math.random() < this.lv.flip * 0.05 && car.groundN.y > 0.95) {
      this.seq = [{ d: 0.05, c: { jump: true, throttle: 1 } }, { d: 0.05, c: { jump: false, throttle: 1 } }, { d: 0.7, c: { jump: true, pitch: 1, throttle: 1 } }];
      this.flipCd = 2.5; this.seqT = 0;
    }
  }

  steerTo(tgt, wantSpeed, c, game) {
    const car = this.car;
    const l = this.local(tgt, _ai3);
    const ang = Math.atan2(l.z, l.x);
    const d = Math.hypot(l.x, l.z);
    const sp = car.vel.dot(car.fwd(_ai4));
    c.steer = clamp(ang * 3.2, -1, 1);
    // reverse if target is right behind and close
    if (Math.abs(ang) > 2.6 && d < 600 && sp < 200) { c.throttle = -1; c.steer = -c.steer; return; }
    c.throttle = 1;
    // limit speed so the turn radius fits the distance to the target
    const needK = 2 * Math.sin(Math.min(Math.abs(ang), Math.PI / 2)) / Math.max(1, d);
    if (needK > 0.00088) {
      let maxS = 2300;
      for (let s2 = 0; s2 <= 2300; s2 += 100) if (curveLookup(STEER_CURVE, s2) < needK) { maxS = Math.max(400, s2 - 100); break; }
      wantSpeed = Math.min(wantSpeed, maxS);
    }
    if (Math.abs(ang) > 1.7 && sp > 500) c.handbrake = true;
    // target inside our turning circle: powerslide around it
    const rad = 1 / curveLookup(STEER_CURVE, Math.max(0, sp));
    if (Math.abs(ang) > 0.9 && d < rad * 1.6 && sp > 350) c.handbrake = true;
    if (sp > wantSpeed + 100) c.throttle = sp > wantSpeed + 500 && Math.abs(ang) < 1.2 ? -1 : 0;
    const boostOk = this.lv.maxBoost > 0.3 || car.boost > 70;
    if (boostOk && Math.abs(ang) < 0.25 && sp < Math.min(wantSpeed, 2290) - 50 && d > 600 && car.groundN.y > 0.6) c.boost = true;
    if (this.mode === 'kickoff') c.boost = true;
    // on a wall: steer down if target is on the floor
    if (car.groundN.y < 0.6 && tgt.y < 300) { c.steer = clamp(ang * 2, -1, 1); }
    this.wantMove = c.throttle > 0.5 && d > 400 && wantSpeed > 300;
    // stuck on a wall (or the back of a goal) while the play is on the floor: jump off it
    if (car.groundN.y < 0.5 && car.wallTime > 0.5 && tgt.y < 300 && car.pos.y < 1100 && (this.lv.skill || 0) > 0.6 && this.flipCd <= 0) {
      this.seq = [{ d: 0.12, c: { jump: true } }, { d: 0.05, c: { jump: false } }]; this.seqT = 0; this.flipCd = 0.8;
    }
  }

  // ---------------------------------------------------------------------------
  aerialSkill(game) {
    // in Heatseeker even weaker bots will fly up to save
    return game && game.mode === 'heatseeker' ? Math.max(this.lv.aerial, 0.55) : this.lv.aerial;
  }
  // in the air already: is there a touch we can still reach with boost?
  airFollow(game) {
    const car = this.car, mech = this.lv.mech || 0;
    if (!mech || car.boost < 6 || car.contactRoof > 0) return false;
    if (Math.random() > mech) { this.followCd = 0.3; return false; } // weaker bots often just land
    this.followCd = 0.12;
    const pred = game.prediction, g = PHYS.GRAVITY * game.mutators.gravity;
    const og = this.oppGoal(_ai1);
    // only worth it going forwards: the ball must be on the way to (or near) their goal, not ours
    if ((game.ball.pos.z - og.z) * (og.z > 0 ? -1 : 1) > 6500) return false;
    for (let i = 2; i < pred.count; i += 2) {
      const s = pred.slices[i];
      if (s.t > 1.6) break;
      if (s.pos.y < 200) continue;
      const need = _ai2.copy(s.pos).sub(car.pos).addScaledVector(car.vel, -s.t);
      need.y += 0.5 * g * s.t * s.t;
      const a = need.length() / (0.5 * s.t * s.t);
      if (a < 850 && s.t * 33.3 < car.boost + 5) {
        this.aerial = { t: 0.35, target: s.pos.clone(), arrive: s.t + 0.35, dj: true, follow: true };
        return true;
      }
    }
    this.followCd = 0.25;
    return false;
  }
  startAerial(I) {
    this.aerial = { t: 0, target: I.pos.clone(), arrive: I.t, dj: false };
    this.car.ctrl.jump = true;
  }
  doAerial(game, dt) {
    const car = this.car, c = car.ctrl, A = this.aerial;
    A.t += dt;
    const T = A.arrive - A.t;
    if (T < -0.25 || (car.onGround && A.t > 0.3) || car.pos.distanceTo(game.ball.pos) < 60 + PHYS.BALL_RADIUS * 0.4) { this.aerial = null; return; }
    // refresh target from prediction
    const pred = game.prediction;
    for (let i = 0; i < pred.count; i++) if (pred.slices[i].t >= T) { A.target.copy(pred.slices[i].pos); break; }
    // aim slightly behind the ball relative to the goal
    const og = this.oppGoal(_ai1);
    const sd = _ai2.copy(og).sub(A.target).normalize();
    const tgt = _ai3.copy(A.target).addScaledVector(sd, -PHYS.BALL_RADIUS * 0.9);
    // required acceleration direction
    const Tc = Math.max(0.1, T);
    const need = _ai4.copy(tgt).sub(car.pos).addScaledVector(car.vel, -Tc);
    need.y += 0.5 * PHYS.GRAVITY * game.mutators.gravity * Tc * Tc;
    const needA = need.length() / (0.5 * Tc * Tc);
    need.normalize();
    const needV = this._need || (this._need = new V3());
    needV.copy(need);
    c.jump = A.t < 0.2;
    if (!A.dj && A.t > 0.22 && A.t < 0.3 && this.lv.aerial > 0.6) { c.jump = true; A.dj = true; }
    this.airAimDir(needV, c);
    const f = car.fwd(_ai1);
    c.boost = f.dot(needV) > 0.75 && needA > 120 && car.boost > 0;
    c.throttle = 1;
  }
  airAim(p, c, flip) {
    const dir = _ai1.copy(p).sub(this.car.pos).normalize();
    this.airAimDir(dir, c);
  }
  airAimDir(dir, c) {
    const car = this.car;
    _aiq.copy(car.quat).invert();
    const dl = _ai2.copy(dir).applyQuaternion(_aiq);
    const wl = _ai3.copy(car.angVel).applyQuaternion(_aiq);
    const pitchErr = Math.atan2(dl.y, dl.x);  // + → nose up needed
    const yawErr = Math.atan2(dl.z, dl.x);    // + → turn right
    c.pitch = clamp(-pitchErr * 3.2 + wl.z * 0.55, -1, 1);
    c.steer = clamp(yawErr * 3.2 + wl.y * 0.55, -1, 1);
    const r = car.right(_ai4);
    c.roll = clamp(r.y * 2.5 - wl.x * 0.3, -1, 1);
  }
  recover(game, c) {
    const car = this.car;
    const v = _ai1.copy(car.vel); v.y = 0;
    if (v.lengthSq() < 100) car.fwd(v).setY(0);
    v.normalize();
    // land facing velocity, wheels down
    const dir = v.multiplyScalar(1).addScaledVector(UP, car.vel.y < 0 ? -0.15 : 0.05).normalize();
    this.airAimDir(dir, c);
    c.throttle = 1;
    // turtle: jump to flip back
    if (car.contactRoof > 0) c.jump = Math.random() < 0.5;
  }

  // banter
  react(game, ev) {
    if (this.chatCd > 0 || Math.random() > 0.45) return;
    let msg = null;
    if (ev.type === 'goal') {
      if (ev.team === this.car.team) msg = ev.scorer === this.car ? pick(['Calculated.', 'Siiiick!', 'What a play!', 'Whew.']) : pick(['Nice shot!', 'Great pass!', 'What a play!', 'Wow!']);
      else msg = pick(['Noooo!', 'Close one!', '$#@%!', 'My bad...', 'Whoops...', 'OMG!']);
    } else if (ev.type === 'save' && ev.car.team === this.car.team && ev.car !== this.car) msg = pick(['What a save!', 'Nice block!', 'Thanks!']);
    else if (ev.type === 'save' && ev.car.team !== this.car.team) msg = pick(['Close one!', 'No way!', 'Wow!']);
    else if (ev.type === 'demo' && ev.victim === this.car) msg = pick(['$#@%!', 'Noooo!', 'Okay.']);
    else if (ev.type === 'end') msg = pick(QUICKCHAT.PostGame);
    if (msg) { game.chat(this.car, msg, Math.random() < 0.6 && ev.type !== 'end'); this.chatCd = rand(6, 14); }
  }
}

function estimateHumanEta(car, p) {
  const d = Math.hypot(p.x - car.pos.x, p.z - car.pos.z);
  const f = car.fwd(_ai1); f.y = 0; f.normalize();
  const to = _ai2.copy(p).sub(car.pos); to.y = 0; to.normalize();
  const ang = Math.acos(clamp(f.dot(to), -1, 1));
  return d / Math.max(900, car.vel.length()) + ang * 0.45;
}

// is a human player driving at the ball?
function humanCommitted(car, ball) {
  const sp = car.vel.length();
  if (sp < 400) return car.pos.distanceTo(ball.pos) < 350;
  const to = _ai2.copy(ball.pos).sub(car.pos).normalize();
  return car.vel.dot(to) / sp > 0.7;
}
