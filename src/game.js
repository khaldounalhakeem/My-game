'use strict';
// ============================================================================
// Match flow: kickoffs, clock, goals, overtime, stats, replays, modes,
// rumble power-ups, heatseeker, dropshot tiles, free play & training
// ============================================================================

const DEFAULT_MUTATORS = {
  matchLength: 300, maxScore: 0, gravity: 1, ballSpeed: 1, ballSize: 1, ballWeight: 1, bounciness: 1,
  boost: 'default', demolish: 'default', respawn: 3, gameSpeed: 1,
};

const RUMBLE_ITEMS = {
  spikes: { name: 'Spikes', icon: '✸', desc: 'Ball sticks to your car' },
  freeze: { name: 'Freezer', icon: '❄', desc: 'Freezes the ball in place' },
  magnet: { name: 'Magnetizer', icon: '⊂', desc: 'Pulls the ball towards you' },
  plunger: { name: 'Plunger', icon: '⊸', desc: 'Yanks the ball towards you' },
  grapple: { name: 'Grappling Hook', icon: '⚓', desc: 'Pulls you to the ball' },
  boot: { name: 'Boot', icon: '👢', desc: 'Kicks an opponent away' },
  haymaker: { name: 'Haymaker', icon: '✊', desc: 'Punches the ball away from you' },
  powerhitter: { name: 'Power Hitter', icon: '⚡', desc: 'Super hits + demo on contact' },
  swapper: { name: 'Swapper', icon: '⇄', desc: 'Swap places with an opponent' },
  tornado: { name: 'Tornado', icon: '🌀', desc: 'A twister that flings everything' },
  disruptor: { name: 'Disruptor', icon: '〰', desc: 'Scrambles an opponent\'s controls' },
  haunted: { name: 'Haunted', icon: '👻', desc: 'Ball drifts toward the enemy goal' },
};

class Game {
  constructor(cfg) {
    this.cfg = cfg;
    this.kind = cfg.kind || 'match'; // match | freeplay | training
    this.mode = cfg.mode || 'soccar';
    const md = MODES[this.mode];
    setArena(md.arena);
    this.mapKey = md.mapOverride && cfg.map === 'auto' ? md.mapOverride : (cfg.map && cfg.map !== 'auto' ? cfg.map : pick(Object.keys(MAPS)));
    if (this.mode === 'snowday' && !cfg.map) this.mapKey = 'coliseum';
    this.mutators = Object.assign({}, DEFAULT_MUTATORS, cfg.mutators || {});
    if (this.kind === 'freeplay') { this.mutators.boost = cfg.freeBoost === false ? 'default' : 'unlimited'; this.mutators.matchLength = 0; }
    if (this.mode === 'dropshot' && this.mutators.boost === 'default') this.mutators.boost = 'recharge';
    if (this.mode === 'heatseeker' && this.kind === 'match' && !(cfg.mutators && cfg.mutators.maxScore)) this.mutators.maxScore = 7;
    this.time = 0; this.events = []; this.bumpCooldown = new Map(); this.chatLog = [];
    this.score = [0, 0]; this.clock = this.mutators.matchLength; this.overtime = false; this.otTime = 0;
    this.state = 'countdown'; this.stateT = 0; this.kickoffPending = true; this.clockRunning = false;
    this.ball = new Ball();
    this.ball.setType(this.mutators.ballType && this.mutators.ballType !== 'default' ? this.mutators.ballType : md.ball, this.mutators.ballSize, this.mutators.ballWeight);
    this.ball.rest *= this.mutators.bounciness;
    this.cars = []; this.bots = [];
    this.replay = { frames: [], playing: false, t: 0 };
    this.tornados = []; this.rumbleT = 0;
    this.trainingIdx = 0; this.trainingResults = [];
    this.ballThreat = null; this.threatT = 0;
    this.prediction = { slices: [], count: 0 }; this.predT = 0;
    this.goalInfo = null; this.zeroSecond = false;
    this.heat = { target: -1, speed: 0 };

    // pads
    this.pads = padLayout(ARENA.pads).map((p, i) => ({ ...p, i, active: true, t: 0 }));
    if (this.kind === 'training') this.pads = [];

    // players
    const prof = Profile;
    const size = this.kind === 'match' ? (cfg.teamSize || 3) : 1;
    const used = new Set();
    const botName = () => { let n; do { n = pick(BOT_NAMES); } while (used.has(n)); used.add(n); return n; };
    let id = 0;
    this.player = new Car(id++, cfg.playerTeam || 0, prof.name || 'Player', false, prof.car.body, prof.car);
    this.cars.push(this.player);
    if (this.kind === 'match') {
      for (let t = 0; t < 2; t++) {
        const have = this.cars.filter(c => c.team === t).length;
        for (let k = have; k < size; k++) {
          const lo = randomLoadout();
          const car = new Car(id++, t, botName(), true, lo.body, lo);
          car.bot = new Bot(car, cfg.botRating != null ? levelForMMR(Math.max(0, cfg.botRating + rand(-60, 60))) : (BOT_LEVELS[cfg.level] ? cfg.level : 'pro'));
          this.cars.push(car); this.bots.push(car.bot);
        }
      }
    }
    if (cfg.attract) {
      const lo = randomLoadout();
      this.player.isBot = true; this.player.name = botName(); this.player.loadout = lo; this.player.setBody(lo.body);
      this.player.bot = new Bot(this.player, 'allstar'); this.bots.unshift(this.player.bot);
    }
    this.setupKickoff(true);
    if (this.kind === 'training') this.setupTrainingShot();
    if (this.kind === 'freeplay') { this.state = 'play'; this.kickoffPending = false; this.freeplayLaunch(); }
  }

  get playing() { return this.state === 'play'; }

  // ---------------------------------------------------------------------------
  setupKickoff(first) {
    const b = this.ball;
    b.reset(0, ARENA.dropshot ? b.radius + 200 : b.radius + (b.puck ? b.h - b.radius : 0), 0);
    if (this.mode === 'hoops') b.reset(0, 1200, 0);
    if (ARENA.dropshot) b.reset(0, 700, 0);
    const spots = kickoffSpots(ARENA.kind);
    for (let t = 0; t < 2; t++) {
      const cars = this.cars.filter(c => c.team === t);
      // pick random spots, mirrored for orange
      const order = shuffle([0, 1, 2, 3, 4]).slice(0, cars.length);
      // if 1 car, prefer any spot; in 3v3 always use a full spread
      cars.forEach((c, i) => {
        const s = spots[this.kickoffOrder ? this.kickoffOrder[i] : order[i]];
        const m = t === 0 ? 1 : -1;
        c.spawn(s[0] * m, s[1] * m, 0, 0);
        c.item = null; c.effects = {};
      });
      if (t === 0) this.kickoffOrder = order;
    }
    this.kickoffOrder = null;
    this.state = 'countdown'; this.stateT = 3; this.kickoffPending = true; this.clockRunning = false; this.lastGoalPos = null;
    this.heat = { target: -1, speed: 0 };
    for (const p of this.pads) { p.active = true; p.t = 0; }
    this.tornados = [];
    this.rumbleT = 3;
    this.events.push({ type: 'kickoff' });
  }

  respawnCar(car) {
    const spots = respawnSpots(ARENA.kind);
    const s = pick(spots);
    const m = car.team === 0 ? 1 : -1;
    car.spawn(s[0] * m, s[1] * m, s[0] * m, s[1] * m + m * 1000);
    car.boost = PHYS.BOOST_START;
    this.events.push({ type: 'respawn', car });
  }

  // ---------------------------------------------------------------------------
  update(dt) {
    dt *= this.mutators.gameSpeed;
    this.time += dt;
    this.stateT -= dt;
    this.updateChat();
    if (this.state === 'play' && this.clockRunning) {
      this.ffClock = (this.ffClock || 0) + dt;
      if (this.ffClock > 2) { this.ffClock = 0; this.checkForfeit(); if (this.state === 'ended') return; }
    }
    const st = this.state;

    if (st === 'countdown') {
      const prev = Math.ceil(this.stateT + dt);
      const now = Math.ceil(this.stateT);
      if (now !== prev && now > 0) this.events.push({ type: 'count', n: now });
      // cars can't move but physics settles
      for (const c of this.cars) { c.vel.set(0, 0, 0); c.angVel.set(0, 0, 0); c.ctrl.jump && (c.prevJump = true); }
      if (this.stateT <= 0) {
        this.state = 'play'; this.events.push({ type: 'go' }); this.goTime = this.time;
        if (this.mode === 'heatseeker' && this.kind === 'match') {
          // heatseeker kickoff: the ball fires off towards a random goal
          const tgt = Math.random() < 0.5 ? 0 : 1;
          this.heat = { target: tgt, speed: 1500 };
          const side = Math.random() < 0.5 ? -1 : 1;
          this.ball.vel.set(side * 500, 650, (tgt === 1 ? 1 : -1) * 900);
          this.kickoffPending = false; this.clockRunning = true;
          this.events.push({ type: 'heatlaunch', team: tgt });
        }
      }
      this.updateBots(dt);
      return;
    }
    if (st === 'replay') { this.replay.t += dt; return; }
    if (st === 'ended') { this.simulate(dt, false); return; }
    if (st === 'goal') {
      this.simulate(dt, false);
      if (this.stateT <= 0) this.afterGoal();
      return;
    }
    if (st === 'play') {
      if (this.clockRunning && this.mutators.matchLength > 0) {
        if (this.overtime) this.otTime += dt;
        else if (this.clock > 0) {
          this.clock = Math.max(0, this.clock - dt);
          if (this.clock === 0) this.zeroSecond = true;
        }
      }
      // ball must touch the ground at 0:00
      if (this.zeroSecond && !this.overtime) {
        if (this.ball.pos.y < this.ball.radius + 25 || this.ball.vel.length() < 5 || this.mode === 'heatseeker' || this.ball.frozen > 0) {
          this.zeroSecond = false;
          if (this.score[0] !== this.score[1]) this.endMatch();
          else { this.overtime = true; this.events.push({ type: 'overtime' }); this.setupKickoff(false); }
          return;
        }
      }
      this.simulate(dt, true);
    }
  }

  updateBots(dt) {
    // prediction for bots / threat detection (30 Hz)
    this.predT -= dt;
    if (this.predT <= 0) {
      this.predT = 1 / 30;
      const sl = Predict.run(this.ball, this.mutators, 4, 30, this.mode === 'heatseeker' ? this.heat : null);
      this.prediction.slices = sl; this.prediction.count = Predict.count;
      let threat = null;
      for (let i = 0; i < Predict.count; i++) { const g = goalCheck(sl[i].pos, this.ball.radius); if (g >= 0) { threat = { team: g, t: sl[i].t }; break; } }
      this.ballThreat = threat;
    }
    for (const b of this.bots) b.update(this, dt);
  }

  simulate(dt, scoring) {
    this.updateBots(dt);
    const ball = this.ball;
    for (const c of this.cars) {
      if (c.demolished) {
        c.respawnT -= dt;
        if (c.respawnT <= 0) this.respawnCar(c);
        continue;
      }
      // rumble
      if (c.ctrl.useItem && !c.prevUse && c.item) this.useItem(c);
      c.prevUse = c.ctrl.useItem;
      for (const k in c.effects) if (c.effects[k] > 0) c.effects[k] -= dt;
      c.step(dt, this);
    }
    if (this.state !== 'goal' || this.goalInfo === null) {
      this.modeForces(dt);
      if (!this.ballHidden) ball.step(dt, this.mutators, (b, n, j) => this.onBounce(b, n, j));
    }
    // collisions
    if (!this.ballHidden) for (const c of this.cars) carBallCollide(c, ball, this);
    for (let i = 0; i < this.cars.length; i++) for (let j = i + 1; j < this.cars.length; j++) carCarCollide(this.cars[i], this.cars[j], this);
    this.updatePads(dt);
    this.updateRumble(dt);
    // goals
    if (scoring && !this.ballHidden) {
      const g = goalCheck(ball.pos, ball.radius);
      if (g >= 0) this.scoreGoal(g);
    }
    if (this.kind === 'training') this.updateTraining(dt);
    if (this.kind === 'freeplay') {
      if (ball.pos.y < -400 || !isFinite(ball.pos.x)) this.freeplayLaunch();
      this.fpAcc = (this.fpAcc || 0) + dt;
      if (this.fpAcc >= 0.1) { this.fpAcc = 0; this.fpSnapshot(); }
    }
    this.recordReplay();
  }

  // ---------------------------------------------------------------------------
  modeForces(dt) {
    const ball = this.ball;
    // heatseeker homing
    if (this.mode === 'heatseeker') heatHome(ball, this.heat, this.mutators.gravity, dt);
    // spikes: ball stuck to a car
    for (const c of this.cars) {
      if (c.effects.spikes > 0 && c.spiked && !c.demolished) {
        const p = c.localToWorld(tmpV(c.hbOff.x + c.half.x + ball.radius * 0.6, c.half.y * 2 + ball.radius * 0.5, 0), tmpV());
        ball.pos.copy(p); ball.vel.copy(c.vel);
        if (c.dodging && c.dodgeT < 0.05) { c.spiked = false; c.effects.spikes = 0; ball.vel.addScaledVector(c.fwd(tmpV()), 900); }
      } else if (c.spiked) c.spiked = false;
      if (c.effects.magnet > 0 && !c.demolished) {
        const to = tmpV().copy(c.pos).sub(ball.pos);
        const d = to.length();
        if (d < 2800 && d > 150) ball.vel.addScaledVector(to.normalize(), 2200 * dt);
      }
      if (c.effects.grapple > 0 && !c.demolished) {
        const to = tmpV().copy(ball.pos).sub(c.pos);
        if (to.length() < 200) c.effects.grapple = 0;
        else { c.vel.addScaledVector(to.normalize(), 4200 * dt); c.onGround = false; c.groundGrace = 0.1; }
      }
      if (c.effects.plunger > 0 && !c.demolished) {
        const to = tmpV().copy(c.pos).sub(ball.pos);
        if (to.length() < 300) c.effects.plunger = 0; else ball.vel.lerp(to.normalize().multiplyScalar(2400), damp(4, dt));
      }
    }
    if (this.hauntT > 0) {
      this.hauntT -= dt;
      const gz = this.hauntTeam === 1 ? ARENA.L : -ARENA.L;
      ball.vel.addScaledVector(tmpV(0, 200, gz).sub(ball.pos).normalize(), 1100 * dt);
    }
    for (const tn of this.tornados) {
      tn.t -= dt;
      for (const o of [ball, ...this.cars.filter(c => !c.demolished)]) {
        const dx = o.pos.x - tn.x, dz = o.pos.z - tn.z, d = Math.hypot(dx, dz);
        if (d < 700 && o.pos.y < 1400) {
          const k = 1 - d / 700;
          o.vel.x += (-dz / (d + 1) * 2600 - dx * 2) * k * dt; o.vel.z += (dx / (d + 1) * 2600 - dz * 2) * k * dt;
          o.vel.y += 1500 * k * dt;
          if (o.onGround !== undefined) { o.onGround = false; o.groundGrace = 0.1; }
        }
      }
    }
    this.tornados = this.tornados.filter(t => t.t > 0);
  }

  onBounce(ball, n, j) {
    this.events.push({ type: 'bounce', strength: j, pos: ball.pos.clone(), n: n.clone() });
    // heatseeker: a miss that hits the back wall of the goal it was heading for turns it around towards the other
    // goal (and changes its colour); hitting the goal frame itself only speeds it up
    if (this.mode === 'heatseeker' && this.heat.target >= 0 && Math.abs(n.z) > 0.7 && Math.abs(ball.pos.z) > ARENA.L - 300) {
      this.heat.speed = Math.min(4600, this.heat.speed + 60);
      const side = ball.pos.z > 0 ? 1 : 0;
      const g = ARENA.goal, m = ball.radius + 40;
      const onFrame = g && Math.abs(ball.pos.x) < g.w + m && ball.pos.y < g.h + m;
      if (side === this.heat.target && !onFrame) {
        this.heat.target = 1 - side;
        const away = side === 1 ? -1 : 1;
        if (ball.vel.z * away < 500) ball.vel.z = away * Math.max(500, Math.abs(ball.vel.z));
        this.events.push({ type: 'heatwall', team: this.heat.target });
      }
    }
    if (ARENA.dropshot && n.y > 0.8 && ball.pos.y < ball.radius + 20 && ball.dsTeam !== undefined && ball.dsTeam >= 0) {
      const t = tileAt(ball.pos.x, ball.pos.z);
      if (t && t.team !== ball.dsTeam) this.dropshotDamage(t, ball);
    }
  }

  dropshotDamage(center, ball) {
    const lvl = ball.chargeLevel;
    const radius = lvl >= 2 ? 2 : lvl >= 1 ? 1 : 0;
    const hit = [];
    for (const t of Tiles.list) {
      if (t.team !== center.team) continue;
      const dq = t.q - center.q, dr = t.r - center.r;
      const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
      if (dist <= radius) hit.push(t);
    }
    for (const t of hit) { if (t.state < 2) { t.state++; t.flash = 1; } }
    ball.dsTeam = -1; ball.charge = 0; ball.chargeLevel = 0;
    this.events.push({ type: 'tiles', tiles: hit });
  }

  // ---------------------------------------------------------------------------
  onTouch(car, strength, point) {
    const ball = this.ball;
    if (this.state === 'countdown') return;
    car.stats.touches++;
    const now = this.time;
    const prevThreat = this.ballThreat;
    ball.touches.push({ car, t: now });
    if (ball.touches.length > 12) ball.touches.shift();
    const prevTouch = ball.lastTouch;
    ball.lastTouch = { car, t: now };
    if (this.kickoffPending) { this.kickoffPending = false; this.clockRunning = true; }
    if (car.bot && car.bot.lv.assist) this.botAim(car, ball);
    this.events.push({ type: 'hit', car, strength, pos: point });
    if (!car.isBot && car.onGround === false && car.airTime > 0.4 && ball.pos.y > 500) this.events.push({ type: 'aerialhit', car });

    // spikes attach
    if (car.effects.spikes > 0) car.spiked = true;
    if (ball.frozen > 0) ball.frozen = 0;

    // heatseeker
    if (this.mode === 'heatseeker') {
      // a touch sends the ball back out: it can't keep flying into the toucher's own net
      const ownDir = car.team === 0 ? -1 : 1;
      if (ball.vel.z * ownDir > 0) ball.vel.z = -ball.vel.z * 0.9;
      if (ball.vel.z * ownDir > -500) ball.vel.z = -ownDir * Math.max(500, Math.abs(ball.vel.z));
      this.heat.target = car.team === 0 ? 1 : 0;
      this.heat.speed = this.heat.speed ? Math.min(4600, this.heat.speed + 200) : 1900;
    }
    // dropshot charge
    if (ARENA.dropshot) {
      if (ball.dsTeam !== car.team) { ball.charge = 0; ball.chargeLevel = 0; }
      ball.dsTeam = car.team;
      ball.charge += strength;
      const lvl = ball.charge > 8000 ? 2 : ball.charge > 2600 ? 1 : 0;
      if (lvl > ball.chargeLevel) this.events.push({ type: 'charge', level: lvl });
      ball.chargeLevel = lvl;
    }

    if (this.kind !== 'match') return;
    // shot / save / clear detection
    const after = predictGoal(ball, this.mutators, 3.5, this.mode === 'heatseeker' ? this.heat : null);
    if (prevThreat && prevThreat.team === car.team && (!after || after.team !== car.team)) {
      const epic = prevThreat.t < 0.35 && Math.abs(ball.pos.z) > ARENA.L - 600;
      car.stats.saves++;
      if (epic) car.stats.epicSaves++;
      this.award(car, epic ? 'Epic Save' : 'Save', epic ? 75 : 50);
      this.events.push({ type: 'save', car, epic });
      this.setHero(car);
      this.ballThreat = after;
    }
    if (after && after.team !== car.team && (!this.lastShot || this.lastShot.car !== car || now - this.lastShot.t > 1.5)) {
      car.stats.shots++;
      this.lastShot = { car, t: now };
      this.award(car, 'Shot on Goal', 20);
    }
    if (!after && prevTouch && prevTouch.car.team !== car.team) {
      const ownHalf = (car.team === 0 ? ball.pos.z < -ARENA.L * 0.45 : ball.pos.z > ARENA.L * 0.45);
      if (ownHalf && strength > 900) this.award(car, 'Clear', 20);
    }
    if (prevTouch && prevTouch.car !== car && prevTouch.car.team === car.team && now - prevTouch.t < 2.5) {
      if ((car.team === 0 ? ball.pos.z > ARENA.L * 0.4 : ball.pos.z < -ARENA.L * 0.4)) this.award(prevTouch.car, 'Center Ball', 10);
    }
    if (!car.onGround && ball.pos.y > 400 && car.airTime > 0.3) this.award(car, 'Aerial Hit', 10, true);
    car.stats.score += 2;
  }

  // bots get a small aiming correction (scaled by difficulty) so their shots find the net
  botAim(car, ball) {
    const dir = car.team === 0 ? 1 : -1;
    const tgt = ARENA.hoop ? tmpV(0, 0, dir * ARENA.hoop.z) : tmpV(0, 0, dir * ARENA.L);
    const v = ball.vel, sp = Math.hypot(v.x, v.z);
    if (ARENA.hoop) {
      // lob towards the rim: blend toward a ballistic arc that drops into the hoop
      const h = ARENA.hoop, hz = dir * h.z;
      const dx = 0 - ball.pos.x, dz = hz - ball.pos.z, d = Math.hypot(dx, dz);
      if (d > 3200 || (ball.vel.z * dir) < -200) return;
      const T = clamp(d / 1400, 0.7, 1.7);
      const g = PHYS.GRAVITY * this.mutators.gravity * ball.gravMul;
      const want = tmpV(dx / T, (h.y + 250 - ball.pos.y + 0.5 * g * T * T) / T, dz / T);
      v.lerp(want, clamp(car.bot.lv.assist * 1.6, 0, 0.6));
      return;
    }
    if (sp < 300) return;
    const cur = Math.atan2(v.x, v.z), want = Math.atan2(tgt.x - ball.pos.x, tgt.z - ball.pos.z);
    const diff = angleWrap(want - cur);
    if (Math.abs(diff) > 1.4) return; // not heading anywhere near the goal
    const a = cur + clamp(diff, -car.bot.lv.assist, car.bot.lv.assist);
    v.x = Math.sin(a) * sp; v.z = Math.cos(a) * sp;
  }

  award(car, label, pts, quiet) {
    car.stats.score += pts;
    this.events.push({ type: 'award', car, label, pts, quiet });
  }

  demolish(att, vic) {
    vic.demolished = true; vic.respawnT = this.mutators.respawn; vic.spiked = false;
    att.stats.demos++;
    this.award(att, 'Demolition', 25);
    this.events.push({ type: 'demo', car: att, victim: vic, pos: vic.pos.clone() });
    this.setHero(att);
    for (const b of this.bots) b.react(this, { type: 'demo', car: att, victim: vic });
  }

  // ---------------------------------------------------------------------------
  scoreGoal(goalTeam) {
    const ball = this.ball;
    const scoringTeam = 1 - goalTeam;
    if (this.kind === 'freeplay') {
      this.events.push({ type: 'goal', team: scoringTeam, scorer: this.player, pos: ball.pos.clone(), speed: ball.vel.length(), freeplay: true });
      this.explodeGoal(ball.pos, scoringTeam);
      this.state = 'goal'; this.stateT = 2.2; this.ballHidden = true; this.goalInfo = { team: scoringTeam };
      return;
    }
    if (this.kind === 'training') {
      if (this.trainingDoneFlag) return;
      this.ballHidden = true;
      this.events.push({ type: 'goal', team: scoringTeam, scorer: this.player, pos: ball.pos.clone(), speed: ball.vel.length(), training: true });
      this.explodeGoal(ball.pos, scoringTeam);
      this.trainingDone(this.trainingPack === 'goalie' ? false : scoringTeam === 0);
      return;
    }
    this.score[scoringTeam]++;
    const touches = ball.touches.slice().reverse();
    let scorer = null, assist = null;
    for (const t of touches) {
      if (t.car.team === scoringTeam) {
        if (!scorer) scorer = t.car;
        else if (t.car !== scorer && this.time - t.t < 6) { assist = t.car; break; }
      }
    }
    const ownGoal = ball.lastTouch && ball.lastTouch.car.team !== scoringTeam;
    if (scorer) {
      this.setHero(scorer);
      scorer.stats.goals++;
      this.award(scorer, 'Goal', 100);
      if (!scorer.onGround && ball.pos.y > 300) this.award(scorer, 'Aerial Goal', 20);
      if (scorer.lastBallHit && this.time - scorer.lastBallHit > 3 && ownGoal) { /* nothing */ }
    }
    if (assist) { assist.stats.assists++; this.award(assist, 'Assist', 50); this.assistHero = assist; }
    this.goalInfo = { team: scoringTeam, scorer, assist, ownGoal: ownGoal && !scorer, speed: ball.vel.length() * 0.036, time: this.clock };
    this.events.push({ type: 'goal', team: scoringTeam, scorer, assist, pos: ball.pos.clone(), speed: ball.vel.length(), ownGoal: this.goalInfo.ownGoal });
    for (const b of this.bots) b.react(this, { type: 'goal', team: scoringTeam, scorer });
    this.explodeGoal(ball.pos, scoringTeam);
    this.ballHidden = true;
    this.state = 'goal'; this.stateT = 2.6;
    this.replay.goalFrame = this.replay.frames.length;
    if (this.overtime) this.otWinner = true;
    if (this.mutators.maxScore > 0 && this.score[scoringTeam] >= this.mutators.maxScore) this.otWinner = true;
    if (this.zeroSecond) this.otWinner = true;
  }

  explodeGoal(pos, team) {
    this.lastGoalPos = pos.clone();
    for (const c of this.cars) {
      if (c.demolished) continue;
      const d = c.pos.distanceTo(pos);
      if (d < 1800) {
        const dir = tmpV().copy(c.pos).sub(pos).normalize();
        c.vel.addScaledVector(dir, 2000 * (1 - d / 1800));
        c.vel.y += 500 * (1 - d / 1800);
        c.onGround = false; c.groundGrace = 0.1;
      }
    }
  }

  afterGoal() {
    this.ballHidden = false; this.lastGoalPos = null;
    if (this.kind === 'freeplay') { this.state = 'play'; this.goalInfo = null; this.freeplayLaunch(); return; }
    if (this.kind === 'training') return;
    // the match-winning goal goes straight to the end, no replay to wait through
    if (this.otWinner) { this.finishReplay(); return; }
    if (this.cfg.replays !== false && this.replay.frames.length > 40 && !this.skipReplay) {
      this.state = 'replay'; this.replay.t = 0; this.replay.playing = true;
      this.replay.snap = this.replay.frames.slice(Math.max(0, this.replay.goalFrame - 150), this.replay.goalFrame + 20);
      this.replay.len = this.replay.snap.length / 30;
      this.events.push({ type: 'replayStart' });
    } else this.finishReplay();
  }

  finishReplay() {
    this.replay.playing = false;
    this.goalInfo = null;
    if (this.otWinner) { this.endMatch(); return; }
    this.setupKickoff(false);
  }

  endMatch() {
    this.state = 'ended'; this.stateT = 0;
    const winner = this.score[0] > this.score[1] ? 0 : 1;
    this.winner = winner;
    // MVP
    let mvp = null;
    for (const c of this.cars) if (c.team === winner && (!mvp || c.stats.score > mvp.stats.score)) mvp = c;
    this.mvp = mvp;
    this.events.push({ type: 'end', winner, mvp });
    for (const b of this.bots) b.react(this, { type: 'end' });
  }

  // ---------------------------------------------------------------------------
  updatePads(dt) {
    for (const p of this.pads) {
      if (!p.active) { p.t -= dt; if (p.t <= 0) { p.active = true; this.events.push({ type: 'padback', pad: p }); } continue; }
      const R = p.big ? 208 : 144;
      for (const c of this.cars) {
        if (c.demolished || c.boost >= 100) continue;
        const dx = c.pos.x - p.x, dz = c.pos.z - p.z;
        if (dx * dx + dz * dz < R * R && c.pos.y < (p.big ? 168 : 165)) {
          c.boost = p.big ? 100 : Math.min(100, c.boost + 12);
          p.active = false; p.t = p.big ? PHYS.PAD_BIG_TIME : PHYS.PAD_SMALL_TIME;
          this.events.push({ type: 'pad', pad: p, car: c });
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  updateRumble(dt) {
    if (this.mode !== 'rumble' || this.kind !== 'match') return;
    if (this.kickoffPending) return;
    this.rumbleT -= dt;
    if (this.rumbleT <= 0) {
      this.rumbleT = 10;
      const keys = Object.keys(RUMBLE_ITEMS);
      for (const c of this.cars) if (!c.item && !c.demolished) { c.item = pick(keys); this.events.push({ type: 'itemget', car: c, item: c.item }); }
    }
  }
  nearestOpponent(car, maxD, frontOnly) {
    let best = null, bd = maxD;
    const f = car.fwd(tmpV());
    for (const o of this.cars) {
      if (o.team === car.team || o.demolished) continue;
      const to = tmpV().copy(o.pos).sub(car.pos); const d = to.length();
      if (frontOnly && to.normalize().dot(f) < 0.2) continue;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  useItem(car) {
    const it = car.item, ball = this.ball;
    let ok = true;
    const dBall = car.pos.distanceTo(ball.pos);
    switch (it) {
      case 'spikes': car.effects.spikes = 12; break;
      case 'freeze': if (dBall < 3500) ball.frozen = 4; else ok = false; break;
      case 'magnet': car.effects.magnet = 6; break;
      case 'plunger': if (dBall < 3000) car.effects.plunger = 1.6; else ok = false; break;
      case 'grapple': if (dBall < 3500) car.effects.grapple = 2.2; else ok = false; break;
      case 'haymaker': {
        if (dBall > 2500) { ok = false; break; }
        const dir = tmpV().copy(ball.pos).sub(car.pos).normalize(); dir.y = Math.max(dir.y, 0.25);
        ball.vel.addScaledVector(dir.normalize(), 2600); ball.frozen = 0; break;
      }
      case 'powerhitter': car.effects.powerhitter = 10; break;
      case 'boot': {
        const o = this.nearestOpponent(car, 3500, true); if (!o) { ok = false; break; }
        const dir = tmpV().copy(o.pos).sub(car.pos).normalize();
        o.vel.addScaledVector(dir, 1600).add(tmpV(0, 900, 0)); o.onGround = false; o.groundGrace = 0.15;
        o.angVel.set(rand(-6, 6), rand(-6, 6), rand(-6, 6)); this.events.push({ type: 'bump', car, victim: o, strength: 2000 }); break;
      }
      case 'swapper': {
        const o = this.nearestOpponent(car, 6000, false); if (!o) { ok = false; break; }
        const p = car.pos.clone(), v = car.vel.clone(), q = car.quat.clone();
        car.pos.copy(o.pos); car.vel.copy(o.vel); car.quat.copy(o.quat);
        o.pos.copy(p); o.vel.copy(v); o.quat.copy(q); break;
      }
      case 'tornado': this.tornados.push({ x: car.pos.x, z: car.pos.z, t: 6 }); break;
      case 'disruptor': { const o = this.nearestOpponent(car, 4000, true); if (!o) { ok = false; break; } o.effects.disrupt = 4; break; }
      case 'haunted': this.hauntT = 3.5; this.hauntTeam = car.team === 0 ? 1 : 0; break;
    }
    if (ok) { this.events.push({ type: 'itemuse', car, item: it }); car.item = null; }
  }

  // ---------------------------------------------------------------------------
  chat(car, msg, teamOnly) {
    const e = { type: 'chat', car, msg, team: !!teamOnly, t: this.time };
    this.chatLog.push(e); if (this.chatLog.length > 30) this.chatLog.shift();
    this.events.push(e);
    // bots answer: always when you talk to them, sometimes when they talk to each other
    if (!car.isBot || Math.random() < 0.3) this.queueReplies(car, msg, teamOnly);
  }

  // who the last big moment belonged to (for "Nice shot!" → "Thanks!")
  setHero(car) { this.hero = { car, t: this.time }; }
  queueReplies(from, msg, teamOnly) {
    this.pendingChat = this.pendingChat || [];
    const bots = this.cars.filter(c => c.isBot && c !== from);
    if (!bots.length) return;
    const delay = () => rand(0.7, 1.9);
    const say = (car, text, team) => this.pendingChat.push({ t: this.time + delay(), car, msg: text, team });
    if (QUICKCHAT.PostGame.includes(msg)) {
      for (const b of bots) if (Math.random() < 0.75) say(b, pick(POSTGAME_REPLIES), false);
      return;
    }
    const rule = CHAT_REPLIES[msg];
    if (!rule || rule.who === 'none') return;
    if (rule.chance && Math.random() > rule.chance) return;
    const mates = bots.filter(c => c.team === from.team), opps = bots.filter(c => c.team !== from.team);
    if (rule.who === 'hero') {
      let hero = this.hero && this.time - this.hero.t < 12 ? this.hero.car : (this.ball.lastTouch ? this.ball.lastTouch.car : null);
      if (msg === 'Great pass!' && this.assistHero && this.assistHero !== from) hero = this.assistHero;
      if (!hero || hero === from || !hero.isBot) hero = mates[0] || null;
      if (hero) say(hero, pick(rule.r), hero.team === from.team);
      // a teammate sometimes piles on
      const other = mates.find(c => c !== hero);
      if (other && Math.random() < 0.3) say(other, pick(['What a play!', 'Nice one!', 'Wow!']), true);
      return;
    }
    if (rule.who === 'team' && !teamOnly && rule.opp && opps.length && Math.random() < 0.4) say(pick(opps), pick(rule.opp), false);
    let pool = rule.who === 'team' ? mates : rule.who === 'opp' ? (teamOnly ? [] : opps) : (teamOnly ? mates : bots);
    if (!pool.length) return;
    say(pick(pool), pick(rule.r), rule.who !== 'opp' && (teamOnly || rule.who === 'team'));
  }
  updateChat() {
    if (!this.pendingChat || !this.pendingChat.length) return;
    const due = this.pendingChat.filter(c => c.t <= this.time);
    if (!due.length) return;
    this.pendingChat = this.pendingChat.filter(c => c.t > this.time);
    for (const d of due) if (!d.car.demolished || this.state === 'ended') this.chat(d.car, d.msg, d.team);
  }

  // bots that are losing badly give up and forfeit
  checkForfeit() {
    if (this.kind !== 'match' || this.overtime || this.mutators.matchLength === 0 || this.cfg.attract) return;
    this.ffT = (this.ffT || 0) + 1;
    const me = this.player.team, opp = 1 - me;
    const diff = this.score[me] - this.score[opp];
    const hopeless = diff >= 6 || (diff >= 4 && this.clock < 90) || (diff >= 3 && this.clock < 35);
    if (!hopeless || Math.random() > 0.3) return;
    const loser = this.cars.find(c => c.team === opp);
    if (loser) this.chat(loser, pick(['gg', 'ff', 'gg', 'Well played.']), false);
    this.forfeitTeam = opp;
    this.events.push({ type: 'forfeit', team: opp });
    this.endMatch();
  }

  // ---------------------------------------------------------------------------
  // Replays (30 Hz ring buffer of the last ~7 seconds)
  recordReplay() {
    this.recAcc = (this.recAcc || 0) + 1;
    if (this.recAcc < 4) return; // 120Hz → 30Hz
    this.recAcc = 0;
    const f = {
      b: [this.ball.pos.x, this.ball.pos.y, this.ball.pos.z, this.ball.quat.x, this.ball.quat.y, this.ball.quat.z, this.ball.quat.w, this.ballHidden ? 1 : 0],
      c: this.cars.map(c => [c.pos.x, c.pos.y, c.pos.z, c.quat.x, c.quat.y, c.quat.z, c.quat.w, c.boosting ? 1 : 0, c.demolished ? 1 : 0, c.supersonic ? 1 : 0, c.wheelSpin, c.steerVis]),
    };
    this.replay.frames.push(f);
    if (this.replay.frames.length > 300) { this.replay.frames.shift(); if (this.replay.goalFrame) this.replay.goalFrame--; }
  }

  // ---------------------------------------------------------------------------
  // Free play
  freeplayLaunch() {
    const b = this.ball, car = this.player;
    const f = car.fwd(tmpV()); f.y = 0; f.normalize();
    const p = tmpV().copy(car.pos).addScaledVector(f, 2200);
    p.x = clamp(p.x, -ARENA.W + 600, ARENA.W - 600); p.z = clamp(p.z, -ARENA.L + 900, ARENA.L - 900);
    b.reset(p.x, 400, p.z);
    const to = tmpV().copy(car.pos).sub(b.pos); to.y = 0; to.normalize();
    b.vel.set(to.x * rand(400, 900), rand(500, 1100), to.z * rand(400, 900));
  }
  freeplayResetBall() { this.ball.reset(0, this.ball.radius + 200, 0); this.events.push({ type: 'fptool', label: 'Ball to center' }); }
  freeplayAerial() {
    const car = this.player, b = this.ball;
    const f = car.fwd(tmpV()); f.y = 0; if (f.lengthSq() < 0.01) f.set(0, 0, 1); f.normalize();
    const p = tmpV().copy(car.pos).addScaledVector(f, 1700);
    p.x = clamp(p.x, -ARENA.W + 500, ARENA.W - 500); p.z = clamp(p.z, -ARENA.L + 700, ARENA.L - 700);
    b.reset(p.x, 950, p.z); b.vel.set(0, 350, 0); b.frozen = 0;
    this.events.push({ type: 'fptool', label: 'Aerial ball' });
  }
  freeplayWall() {
    // ball rolling along the nearest side wall: practice wall shots and pinches
    const car = this.player, b = this.ball;
    const side = car.pos.x >= 0 ? 1 : -1;
    const z = clamp(car.pos.z + 1500, -ARENA.L + 1500, ARENA.L - 1500);
    b.reset(side * (ARENA.W - 140), b.radius + 40, z - 1200); b.vel.set(side * 150, 0, 900); b.frozen = 0;
    this.events.push({ type: 'fptool', label: 'Wall ball' });
  }
  freeplayFreeze() {
    const b = this.ball;
    if (b.frozen > 0) { b.frozen = 0; this.events.push({ type: 'fptool', label: 'Ball unfrozen' }); }
    else { b.frozen = 1e9; b.vel.set(0, 0, 0); b.angVel.set(0, 0, 0); this.events.push({ type: 'fptool', label: 'Ball frozen' }); }
  }
  // free play rewind: snapshots every 0.1 s, rewind 3 s
  fpSnapshot() {
    const c = this.player, b = this.ball;
    this.fpHist = this.fpHist || [];
    this.fpHist.push({
      c: { pos: c.pos.clone(), vel: c.vel.clone(), angVel: c.angVel.clone(), quat: c.quat.clone(), onGround: c.onGround, groundN: c.groundN.clone(), jumped: c.jumped, flipAvail: c.flipAvail, boost: c.boost },
      b: { pos: b.pos.clone(), vel: b.vel.clone(), angVel: b.angVel.clone(), quat: b.quat.clone(), frozen: b.frozen },
    });
    if (this.fpHist.length > 120) this.fpHist.shift();
  }
  freeplayRewind() {
    const H = this.fpHist || [];
    if (H.length < 2) return;
    const i = Math.max(0, H.length - 30);
    const s = H[i]; H.length = i + 1;
    const c = this.player, b = this.ball;
    c.resetState();
    c.pos.copy(s.c.pos); c.vel.copy(s.c.vel); c.angVel.copy(s.c.angVel); c.quat.copy(s.c.quat); c.onGround = s.c.onGround; c.groundN.copy(s.c.groundN);
    c.jumped = s.c.jumped; c.flipAvail = s.c.flipAvail; c.boost = s.c.boost; c.prevJump = true;
    b.pos.copy(s.b.pos); b.vel.copy(s.b.vel); b.angVel.copy(s.b.angVel); b.quat.copy(s.b.quat); b.frozen = s.b.frozen;
    this.ballHidden = false;
    this.events.push({ type: 'fptool', label: '⏪ Rewind 3s' });
  }
  freeplayResetCar() { const s = kickoffSpots(ARENA.kind)[4]; this.player.spawn(s[0], s[1], 0, 0); this.player.boost = 100; this.events.push({ type: 'fptool', label: 'Car reset' }); }

  // ---------------------------------------------------------------------------
  // Training packs
  setupTrainingShot() {
    const pack = this.cfg.pack || 'striker';
    this.trainingPack = pack;
    const i = this.trainingIdx;
    const seed = i * 9301 + 49297;
    const r = (k) => { const x = Math.sin(seed + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const car = this.player, ball = this.ball;
    ball.reset(0, ball.radius, 0);
    this.ballHidden = false;
    if (pack === 'striker') {
      car.spawn((r(1) - 0.5) * 3000, 0, (r(2) - 0.5) * 1000, 3000);
      ball.reset((r(3) - 0.5) * 2600, ball.radius + r(4) * 500, 1500 + r(5) * 1500);
      ball.vel.set((r(6) - 0.5) * 900, r(7) * 600, (r(8) - 0.6) * 800);
      car.boost = 60;
    } else if (pack === 'goalie') {
      car.spawn((r(1) - 0.5) * 600, -ARENA.L + 350, 0, 0);
      ball.reset((r(3) - 0.5) * 4000, 200 + r(4) * 800, -500 + r(5) * 1500);
      const tgt = tmpV((r(6) - 0.5) * 1500, 120 + r(7) * 450, -ARENA.L - 50);
      const T = 1.5 + r(8) * 0.8;
      const v = tmpV().copy(tgt).sub(ball.pos).multiplyScalar(1 / T); v.y += 0.5 * PHYS.GRAVITY * T;
      ball.vel.copy(v);
      car.boost = 100;
    } else {
      car.spawn((r(1) - 0.5) * 2000, 0, 0, 3000);
      ball.reset((r(3) - 0.5) * 2400, 900 + r(4) * 700, 2800 + r(5) * 1200);
      ball.vel.set((r(6) - 0.5) * 400, 250 + r(7) * 300, (r(8) - 0.5) * 300);
      car.boost = 100;
    }
    this.state = 'countdown'; this.stateT = 1.5; this.kickoffPending = false; this.clockRunning = false;
    this.trainingTimer = pack === 'goalie' ? 6 : 10;
    this.trainingDoneFlag = false;
    this.ballFrozenForCountdown = true;
    this.events.push({ type: 'trainingShot', idx: i, count: TRAINING_PACKS[pack].count });
  }
  updateTraining(dt) {
    if (this.trainingDoneFlag) {
      this.trainingWait -= dt;
      if (this.trainingWait <= 0) {
        this.trainingIdx++;
        this.ballHidden = false;
        if (this.trainingIdx >= TRAINING_PACKS[this.trainingPack].count) { this.state = 'ended'; this.events.push({ type: 'trainingEnd', results: this.trainingResults }); }
        else this.setupTrainingShot();
      }
      return;
    }
    this.trainingTimer -= dt;
    if (this.trainingPack === 'goalie') {
      if (this.trainingTimer <= 0 || (this.ball.lastTouch && this.ball.pos.z > -ARENA.L * 0.3)) this.trainingDone(true);
    } else if (this.trainingTimer <= 0) this.trainingDone(false);
  }
  trainingDone(success) {
    if (this.trainingDoneFlag) return;
    this.trainingDoneFlag = true; this.trainingWait = 2.2;
    this.trainingResults.push(success);
    if (!success && this.trainingPack !== 'goalie') this.ballHidden = false;
    if (this.trainingPack === 'goalie' && !success) this.ballHidden = true;
    if (success && this.trainingPack !== 'goalie') this.ballHidden = true;
    this.events.push({ type: 'trainingResult', success });
  }
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function randomLoadout() {
  const k = (o) => pick(Object.keys(o));
  return {
    body: k(ITEMS.body), paint: Math.random() < 0.5 ? 0 : randInt(1, PAINTS.length - 1), accent: pick(ACCENTS),
    decal: k(ITEMS.decal), wheels: k(ITEMS.wheels), boost: k(ITEMS.boost), explosion: k(ITEMS.explosion),
    topper: Math.random() < 0.6 ? 'none' : k(ITEMS.topper), antenna: Math.random() < 0.5 ? 'none' : k(ITEMS.antenna),
  };
}

// Heatseeker: steer the ball towards the target goal and bring it up to the heat speed
function heatHome(ball, heat, gravity, dt) {
  if (!heat || heat.target < 0) return;
  const gz = heat.target === 1 ? ARENA.L : -ARENA.L;
  const to = tmpV(0, 320, gz).sub(ball.pos);
  if (to.length() <= 300) return;
  to.normalize();
  const sp0 = ball.vel.length();
  const cur = tmpV().copy(ball.vel);
  if (sp0 > 1) cur.multiplyScalar(1 / sp0); else cur.copy(to);
  cur.lerp(to, damp(2.2, dt)).normalize();
  ball.vel.copy(cur).multiplyScalar(lerp(sp0, heat.speed, damp(1.5, dt)));
  ball.vel.y += PHYS.GRAVITY * gravity * dt * 0.85; // mostly ignores gravity
}
