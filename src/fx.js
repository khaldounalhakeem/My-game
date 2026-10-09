'use strict';
// ============================================================================
// Particle effects: boost trails, supersonic, hits, goal explosions, demos,
// pads, weather, tornados
// ============================================================================

class Particles {
  constructor(n, additive) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.grow = new Float32Array(n); this.drag = new Float32Array(n); this.grav = new Float32Array(n); this.a0 = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 800 } },
      vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; uniform float scale; varying vec3 vC; varying float vA;
        void main(){ vC = pcolor; vec4 mv = modelViewMatrix*vec4(position,1.0); vA = palpha*smoothstep(60.0, 260.0, -mv.z); gl_PointSize = palpha>0.0 ? min(400.0, psize*scale/max(1.0,-mv.z)) : 0.0; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; float a = smoothstep(0.5,0.1,d)*vA; gl_FragColor = vec4(vC, a); }`,
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, opt) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    this.life[i] = life; this.max[i] = life; this.size[i] = size;
    this.grow[i] = opt && opt.grow || 0; this.drag[i] = opt && opt.drag || 0; this.grav[i] = opt && opt.grav || 0;
    this.a0[i] = opt && opt.alpha !== undefined ? opt.alpha : 1; this.alpha[i] = this.a0[i];
  }
  update(dt) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3, d = 1 - this.drag[i] * dt;
      this.vel[k] *= d; this.vel[k + 1] = this.vel[k + 1] * d - this.grav[i] * dt; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.max[i];
      this.alpha[i] = this.life[i] > 0 ? this.a0[i] * Math.min(1, t * 2.5) : 0;
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = true; a.pcolor.needsUpdate = true; a.psize.needsUpdate = true; a.palpha.needsUpdate = true;
  }
}

const _fc = new THREE.Color();
const FX = {
  add: null, norm: null, weather: null, temp: [], world: null,
  init(world, map) {
    this.world = world;
    const q = qualityLevel();
    this.mul = !Settings.particles ? 0.25 : q === 0 ? 0.4 : q === 1 ? 0.7 : 1;
    this.add = new Particles(q === 0 ? 2500 : 5000, true);
    this.norm = new Particles(q === 0 ? 1800 : 3500, false);
    world.add(this.add.points); world.add(this.norm.points);
    this.temp = [];
    this.weather = null;
    if (map.weather) this.initWeather(map.weather);
    this.trailAcc = new Map();
  },
  initWeather(kind) {
    const n = kind === 'rain' ? 2500 : 1500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = rand(-5000, 5000); pos[i * 3 + 1] = rand(0, 4000); pos[i * 3 + 2] = rand(-5000, 5000); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const col = kind === 'rain' ? 0x9fb4cc : kind === 'snow' ? 0xffffff : 0xbff4ff;
    const mat = new THREE.PointsMaterial({ color: col, size: kind === 'rain' ? 9 : kind === 'snow' ? 16 : 22, transparent: true, opacity: kind === 'rain' ? 0.55 : 0.85, depthWrite: false, map: blobTex() });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
    this.world.add(pts);
    this.weather = { kind, pts, pos, n };
  },
  scale() {
    const h = R.renderer.getSize(new THREE.Vector2()).y * R.renderer.getPixelRatio();
    return h / (2 * Math.tan(THREE.MathUtils.degToRad(R.camera.fov) / 2));
  },
  update(dt, game) {
    if (!this.add) return;
    const s = this.scale();
    this.add.mat.uniforms.scale.value = s; this.norm.mat.uniforms.scale.value = s;
    if (game && game.state !== 'replay') this.emitters(dt, game);
    this.add.update(dt); this.norm.update(dt);
    // temp meshes
    for (const t of this.temp) { t.life -= dt; t.update(t, dt); }
    this.temp = this.temp.filter(t => { if (t.life <= 0) { this.world.remove(t.obj); disposeTree(t.obj); return false; } return true; });
    if (this.weather) {
      const w = this.weather, p = w.pos, cp = R.camera.position;
      const fall = w.kind === 'rain' ? 2600 : w.kind === 'snow' ? 260 : -220;
      for (let i = 0; i < w.n; i++) {
        const k = i * 3;
        p[k + 1] -= fall * dt;
        if (w.kind === 'snow') p[k] += Math.sin(R.time + i) * 40 * dt;
        if (p[k + 1] < 0) p[k + 1] += 4000; if (p[k + 1] > 4000) p[k + 1] -= 4000;
        if (p[k] - cp.x > 5000) p[k] -= 10000; if (p[k] - cp.x < -5000) p[k] += 10000;
        if (p[k + 2] - cp.z > 5000) p[k + 2] -= 10000; if (p[k + 2] - cp.z < -5000) p[k + 2] += 10000;
      }
      w.pts.geometry.attributes.position.needsUpdate = true;
    }
  },
  emitters(dt, game) {
    const A = this.add, N = this.norm, m = this.mul;
    for (const car of game.cars) {
      if (car.demolished) continue;
      const v = R.carViews.get(car);
      if (!v) continue;
      const style = (car.loadout && car.loadout.boost) || 'standard';
      const ex = car.localToWorld(v.exhaust, tmpV());
      const back = car.fwd(tmpV()).multiplyScalar(-1);
      if (car.boosting) {
        const cnt = Math.ceil(3 * m);
        for (let i = 0; i < cnt; i++) {
          const sp = rand(250, 500);
          const vx = back.x * sp + car.vel.x * 0.6 + rand(-40, 40), vy = back.y * sp + car.vel.y * 0.6 + rand(-40, 40), vz = back.z * sp + car.vel.z * 0.6 + rand(-40, 40);
          const jx = ex.x + rand(-4, 4) - car.vel.x * dt * Math.random(), jy = ex.y + rand(-4, 4) - car.vel.y * dt * Math.random(), jz = ex.z + rand(-4, 4) - car.vel.z * dt * Math.random();
          switch (style) {
            case 'neon': { _fc.set(TEAM_COLORS[car.team].light); A.emit(jx, jy, jz, vx, vy, vz, 0.35, 26, _fc.r, _fc.g, _fc.b, { grow: -40 }); break; }
            case 'rainbow': { _fc.setHSL((R.time * 0.6 + i * 0.05) % 1, 1, 0.6); A.emit(jx, jy, jz, vx, vy, vz, 0.5, 28, _fc.r, _fc.g, _fc.b, { grow: -30 }); break; }
            case 'bubbles': N.emit(jx, jy, jz, vx * 0.5, vy * 0.5 + 60, vz * 0.5, 0.9, rand(8, 22), 0.8, 0.95, 1, { alpha: 0.55, drag: 2 }); break;
            case 'ion': A.emit(jx, jy, jz, vx + rand(-200, 200), vy + rand(-100, 300), vz + rand(-200, 200), 0.5, 7, 0.6, 0.9, 1, { grav: 900, drag: 1 }); break;
            case 'smoke': N.emit(jx, jy, jz, vx * 0.4, vy * 0.4 + 40, vz * 0.4, 1.2, 20, 0.15, 0.15, 0.17, { grow: 60, alpha: 0.7, drag: 1.5 }); break;
            case 'hearts': A.emit(jx, jy, jz, vx, vy + 40, vz, 0.6, 22, 1, 0.3, 0.55, { grow: -10 }); break;
            case 'flames': A.emit(jx, jy, jz, vx, vy, vz, 0.32, 34, 1, rand(0.3, 0.7), 0.1, { grow: -50 }); break;
            default: A.emit(jx, jy, jz, vx, vy, vz, 0.25, 26, 1, rand(0.5, 0.8), 0.2, { grow: -60 });
          }
        }
        if (style === 'standard' || style === 'flames') N.emit(ex.x, ex.y, ex.z, back.x * 200 + car.vel.x * 0.3, back.y * 200 + 30, back.z * 200 + car.vel.z * 0.3, 0.7, 14, 0.55, 0.55, 0.6, { grow: 50, alpha: 0.35, drag: 1.5 });
      }
      // supersonic streaks
      if (car.supersonic && Math.random() < 0.9 * m) {
        const r = car.right(tmpV()).multiplyScalar(car.half.z * (Math.random() < 0.5 ? -1 : 1));
        const p = tmpV().copy(ex).add(r);
        A.emit(p.x, p.y + 10, p.z, car.vel.x * 0.85, car.vel.y * 0.85, car.vel.z * 0.85, 0.3, 9, 0.9, 0.95, 1, { alpha: 0.7 });
      }
      // powerslide tyre smoke
      if (car.onGround && car.slideAmt > 0.5 && Math.random() < 0.5 * m) {
        N.emit(car.pos.x + rand(-30, 30), car.pos.y - 12, car.pos.z + rand(-30, 30), rand(-30, 30), 40, rand(-30, 30), 0.8, 20, 0.85, 0.85, 0.85, { grow: 60, alpha: 0.3 });
      }
      // rumble effects visuals
      if (car.effects.powerhitter > 0 && Math.random() < 0.6) A.emit(car.pos.x + rand(-50, 50), car.pos.y + rand(0, 40), car.pos.z + rand(-50, 50), 0, 80, 0, 0.4, 16, 1, 0.9, 0.2);
      if (car.effects.spikes > 0 && Math.random() < 0.3) A.emit(car.pos.x + rand(-50, 50), car.pos.y + 40, car.pos.z + rand(-50, 50), 0, 30, 0, 0.3, 10, 1, 0.3, 0.3);
      if (car.effects.magnet > 0 && Math.random() < 0.5) A.emit(car.pos.x, car.pos.y + 30, car.pos.z, rand(-200, 200), rand(-50, 200), rand(-200, 200), 0.4, 12, 0.6, 0.4, 1);
      if (car.effects.disrupt > 0 && Math.random() < 0.5) A.emit(car.pos.x, car.pos.y + 50, car.pos.z, rand(-100, 100), 100, rand(-100, 100), 0.5, 14, 0.3, 1, 0.3);
    }
    // ball trails
    const b = game.ball;
    if (!game.ballHidden) {
      const sp = b.vel.length();
      if (sp > 2600 && Math.random() < m) A.emit(b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, 0.35, b.radius * 1.4, 1, 0.75, 0.4, { grow: -200, alpha: 0.35 });
      if (game.mode === 'heatseeker' && game.heat.target >= 0) { _fc.set(TEAM_COLORS[1 - game.heat.target].main); A.emit(b.pos.x, b.pos.y, b.pos.z, rand(-50, 50), rand(-50, 50), rand(-50, 50), 0.5, b.radius * 1.2, _fc.r, _fc.g, _fc.b, { grow: -150, alpha: 0.5 }); }
      if (b.chargeLevel > 0 && b.dsTeam >= 0) { _fc.set(TEAM_COLORS[b.dsTeam].light); A.emit(b.pos.x + rand(-60, 60), b.pos.y + rand(-60, 60), b.pos.z + rand(-60, 60), 0, 0, 0, 0.4, 30 * b.chargeLevel, _fc.r, _fc.g, _fc.b, { grow: -40 }); }
      if (b.frozen > 0 && Math.random() < 0.5) N.emit(b.pos.x + rand(-90, 90), b.pos.y + rand(-90, 90), b.pos.z + rand(-90, 90), 0, -40, 0, 0.8, 10, 0.8, 0.95, 1, { alpha: 0.8 });
    }
    for (const t of game.tornados) {
      for (let i = 0; i < 6 * m; i++) {
        const a = rand(0, 6.28), h = rand(0, 1400), r = 100 + h * 0.35;
        N.emit(t.x + Math.cos(a) * r, h, t.z + Math.sin(a) * r, -Math.sin(a) * 900, 200, Math.cos(a) * 900, 0.4, 40, 0.75, 0.78, 0.8, { alpha: 0.35, drag: 0.5 });
      }
    }
  },
  burst(sys, p, n, speed, life, size, col, opt) {
    n = Math.ceil(n * this.mul);
    for (let i = 0; i < n; i++) {
      const th = rand(0, Math.PI * 2), ph = Math.acos(rand(-1, 1)), s = speed * rand(0.3, 1);
      const c = typeof col === 'function' ? col(i) : col;
      sys.emit(p.x, p.y, p.z, Math.sin(ph) * Math.cos(th) * s, Math.cos(ph) * s, Math.sin(ph) * Math.sin(th) * s, life * rand(0.6, 1), size * rand(0.6, 1.3), c[0], c[1], c[2], opt);
    }
  },
  ring(p, color, maxR, life, y) {
    const geo = new THREE.RingGeometry(0.85, 1, 48);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.set(p.x, y !== undefined ? y : p.y, p.z);
    this.world.add(m);
    this.temp.push({ obj: m, life, max: life, update: (t) => { const k = 1 - t.life / t.max; m.scale.setScalar(10 + maxR * k); mat.opacity = 1 - k; } });
  },
  flash(p, color, maxR, life) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.copy(p); this.world.add(m);
    this.temp.push({ obj: m, life, max: life, update: (t) => { const k = 1 - t.life / t.max; m.scale.setScalar(20 + maxR * Math.sqrt(k)); m.material.opacity = (1 - k) * 0.9; } });
  },
  bolt(p) {
    const pts = []; let x = p.x + rand(-300, 300), z = p.z + rand(-300, 300);
    for (let y = 3500; y > p.y; y -= 150) { pts.push(new V3(x, y, z)); x += rand(-120, 120); z += rand(-120, 120); }
    pts.push(p.clone());
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xcfe8ff, transparent: true }));
    this.world.add(l);
    this.temp.push({ obj: l, life: 0.4, max: 0.4, update: (t) => { l.material.opacity = Math.random(); } });
  },

  handle(ev, game) {
    const A = this.add, N = this.norm;
    if (!A) return;
    switch (ev.type) {
      case 'hit': {
        const s = clamp(ev.strength / 2500, 0.1, 1.5);
        this.burst(A, ev.pos, 10 + s * 30, 600 + s * 900, 0.35, 14, [1, 0.85, 0.5], { drag: 3 });
        if (s > 0.7) this.flash(ev.pos, 0xfff0c0, 120, 0.15);
        if (ev.car === game.player) R.cam.shake = Math.max(R.cam.shake, s * 0.5);
        break;
      }
      case 'bounce': if (ev.strength > 900) this.burst(N, ev.pos.clone().addScaledVector(ev.n, -game.ball.radius * 0.9), 8, 300, 0.6, 30, [0.8, 0.8, 0.8], { alpha: 0.3, grow: 40 }); break;
      case 'land': if (ev.impact < -500) this.burst(N, tmpV().copy(ev.car.pos).setY(ev.car.pos.y - 15), 10, 250, 0.7, 26, [0.8, 0.78, 0.7], { alpha: 0.3, grow: 50 }); break;
      case 'dodge': case 'doublejump': this.burst(A, ev.car.pos, 8, 200, 0.25, 10, [0.8, 0.9, 1], {}); break;
      case 'pad': {
        const p = tmpV(ev.pad.x, 40, ev.pad.z);
        this.burst(A, p, ev.pad.big ? 40 : 12, ev.pad.big ? 500 : 250, 0.5, ev.pad.big ? 22 : 12, [1, 0.75, 0.2], { grav: -300, drag: 2 });
        break;
      }
      case 'demo': {
        const p = ev.pos;
        this.flash(p, 0xffa040, 300, 0.35);
        this.burst(A, p, 80, 900, 0.7, 50, [1, 0.5, 0.1], { drag: 3, grow: -30 });
        this.burst(N, p, 40, 400, 1.6, 60, [0.15, 0.15, 0.15], { drag: 1.5, grow: 80, alpha: 0.7, grav: -60 });
        this.burst(N, p, 25, 900, 1.5, 12, [0.1, 0.1, 0.12], { grav: 900 });
        if (ev.victim === game.player || ev.car === game.player) R.cam.shake = 1;
        break;
      }
      case 'goal': this.goalExplosion(ev, game); break;
      case 'tiles': for (const t of ev.tiles) this.burst(A, tmpV(t.x, 10, t.z), 20, 500, 0.6, 20, t.state === 2 ? [1, 0.5, 0.2] : [0.9, 0.95, 1], { grav: 800 }); break;
      case 'itemuse': {
        const p = ev.car.pos;
        _fc.set(TEAM_COLORS[ev.car.team].light);
        this.burst(A, p, 30, 600, 0.5, 16, [_fc.r, _fc.g, _fc.b], { drag: 2 });
        if (ev.item === 'haymaker' || ev.item === 'freeze' || ev.item === 'plunger') this.beam(ev.car.pos, game.ball.pos, ev.item === 'freeze' ? 0x80e0ff : 0xffd040);
        break;
      }
      case 'pinch':
        this.flash(ev.pos, 0xffffff, 260, 0.25);
        this.burst(A, ev.pos, 90, 2200, 0.5, 18, [1, 0.9, 0.6], { drag: 3 });
        this.ring(ev.pos, 0xffe0a0, 600, 0.4, ev.pos.y);
        R.cam.shake = Math.max(R.cam.shake, 0.9);
        break;
      case 'flipreset': this.burst(A, ev.car.pos, 25, 300, 0.5, 14, [0.4, 1, 0.6], {}); break;
    }
  },
  beam(a, b, color) {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]), new THREE.LineBasicMaterial({ color, transparent: true }));
    this.world.add(l);
    this.temp.push({ obj: l, life: 0.5, max: 0.5, update: (t) => { l.material.opacity = t.life / t.max; } });
  },
  goalExplosion(ev, game) {
    const A = this.add, N = this.norm;
    const p = ev.pos;
    const scorer = ev.scorer;
    const style = scorer && scorer.loadout ? scorer.loadout.explosion || 'classic' : 'classic';
    const tc = TEAM_COLORS[ev.team];
    _fc.set(tc.main); const c1 = [_fc.r, _fc.g, _fc.b];
    _fc.set(tc.light); const c2 = [_fc.r, _fc.g, _fc.b];
    R.cam.shake = 1.2;
    switch (style) {
      case 'fireworks':
        for (let k = 0; k < 6; k++) {
          const q = tmpV(p.x + rand(-700, 700), p.y + rand(200, 1200), p.z - sign(p.z) * rand(0, 600)).clone();
          const col = [Math.random(), Math.random(), Math.random()];
          setTimeout(() => { this.burst(A, q, 90, 1300, 1.3, 18, col, { grav: 500, drag: 1.2 }); this.flash(q, 0xffffff, 120, 0.15); }, k * 160);
        }
        break;
      case 'confetti':
        this.burst(N, p, 600, 1800, 3.5, 14, () => { _fc.setHSL(Math.random(), 1, 0.55); return [_fc.r, _fc.g, _fc.b]; }, { grav: 350, drag: 2.5 });
        this.flash(p, tc.light, 500, 0.3);
        break;
      case 'lightning':
        for (let k = 0; k < 7; k++) setTimeout(() => this.bolt(tmpV(p.x + rand(-500, 500), 0, p.z + rand(-300, 300)).clone()), k * 70);
        this.flash(p, 0xcfe8ff, 900, 0.45);
        this.burst(A, p, 250, 2200, 0.8, 22, [0.75, 0.9, 1], { drag: 3 });
        break;
      case 'shockwave':
        for (let k = 0; k < 3; k++) setTimeout(() => this.ring(p, tc.light, 3500, 1.0, 20), k * 150);
        this.burst(A, p, 250, 2600, 0.9, 25, c2, { drag: 2.5 });
        break;
      case 'supernova':
        this.flash(p, 0xffffff, 1600, 0.8);
        this.flash(p, 0xffd060, 2400, 1.2);
        this.burst(A, p, 400, 3200, 1.4, 30, [1, 0.85, 0.4], { drag: 2 });
        break;
      default:
        this.flash(p, tc.light, 1100, 0.5);
        this.burst(A, p, 350, 2400, 1.1, 40, (i) => (i % 2 ? c1 : c2), { drag: 2.4, grow: -10 });
        this.burst(A, p, 120, 1200, 0.8, 70, [1, 0.6, 0.2], { drag: 3 });
        this.burst(N, p, 80, 700, 2.2, 90, [0.25, 0.25, 0.28], { drag: 1.5, grow: 90, alpha: 0.55, grav: -80 });
        this.ring(p, tc.light, 2500, 0.8, Math.max(20, p.y));
    }
  },
};
