'use strict';
/* Game setup, sky and day/night cycle, sounds, spawning, explosions, saving and the main loop. */

const SAVE_KEY = 'blockrealm-save-v1';
const DAY_LENGTH = 600; // seconds for a full day

const G = {
  state: 'title', mobs: [], dragons: [], projectiles: [], drops: [], tnts: [],
  time: 0.05, shake: 0, spawnT: 0, dragonTimer: 30, saveT: 0, fps: 0, underground: 0, dim: 'overworld',
};

/* ---------- sound ---------- */
const Sound = {
  ctx: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.32; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  tone(f, dur, type, v, f2, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, v, freq, type = 'lowpass', delay = 0, f2) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(freq, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },
  play(name, pos, id) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    let v = 1;
    if (pos && G.player) v = clamp(1 - pos.distanceTo(G.player.pos) / 40, 0, 1);
    if (v < 0.03) return;
    const mat = id ? DEFS[id] : null;
    const pitch = mat ? (mat.tool === 'pick' ? 1400 : /log|planks|table|bookshelf|chest/.test(mat.key) ? 700 : mat.key === 'glass' ? 3000 : 450) : 600;
    switch (name) {
      case 'break': this.noise(0.18, 0.5 * v, pitch, 'lowpass'); if (mat && mat.key === 'glass') this.tone(2200, 0.15, 'triangle', 0.1, 900); break;
      case 'dig': this.noise(0.06, 0.25 * v, pitch); break;
      case 'place': this.noise(0.08, 0.4 * v, pitch * 0.8); break;
      case 'step': this.noise(0.05, 0.06, 500); break;
      case 'land': this.noise(0.1, 0.25, 300); break;
      case 'hurt': this.tone(240, 0.2, 'square', 0.12, 130); break;
      case 'hurtMob': this.tone(320, 0.15, 'square', 0.08 * v, 180); break;
      case 'deathMob': this.tone(260, 0.4, 'sawtooth', 0.08 * v, 70); break;
      case 'pickup': this.tone(1100, 0.06, 'triangle', 0.08, 1700); break;
      case 'click': this.tone(900, 0.03, 'square', 0.04); break;
      case 'craft': this.noise(0.08, 0.3, 900); this.tone(700, 0.08, 'triangle', 0.06, 1000, 0.05); break;
      case 'smelt': this.noise(0.4, 0.25, 600, 'bandpass'); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(0.07, 0.3, 1200, 'bandpass', i * 0.12); break;
      case 'bow': this.noise(0.15, 0.3 * v, 2000, 'bandpass', 0, 600); break;
      case 'fuse': this.noise(0.9, 0.18 * v, 4000, 'highpass'); break;
      case 'explode': this.noise(1.3, 0.9 * v, 900, 'lowpass', 0, 60); this.tone(70, 0.6, 'sine', 0.4 * v, 30); break;
      case 'teleport': this.tone(200, 0.35, 'sine', 0.12 * v, 1200); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.07, null, i * 0.08)); break;
      case 'fireball': this.noise(0.6, 0.4 * v, 300, 'lowpass', 0, 1500); break;
      case 'dragonRoar': this.tone(90, 1.6, 'sawtooth', 0.25 * v, 40); this.noise(1.4, 0.3 * v, 400, 'bandpass', 0, 150); break;
      case 'dragonHurt': this.tone(160, 0.5, 'sawtooth', 0.2 * v, 70); break;
      case 'dragonDeath': this.tone(120, 3.5, 'sawtooth', 0.3, 30); this.noise(3.5, 0.3, 800, 'lowpass', 0, 50); break;
      case 'mob_zombie': this.tone(115, 0.7, 'sawtooth', 0.09 * v, 80); break;
      case 'mob_skeleton': for (let i = 0; i < 4; i++) this.noise(0.04, 0.2 * v, 2500, 'bandpass', i * 0.07); break;
      case 'mob_creeper': break;
      case 'mob_spider': this.noise(0.4, 0.12 * v, 3000, 'highpass'); break;
      case 'mob_enderman': this.tone(330, 0.5, 'sine', 0.08 * v, 180); this.tone(240, 0.5, 'sine', 0.06 * v, 420, 0.2); break;
      case 'mob_pig': this.tone(330, 0.12, 'square', 0.06 * v, 220); this.tone(300, 0.12, 'square', 0.06 * v, 200, 0.16); break;
      case 'mob_cow': this.tone(170, 0.9, 'sawtooth', 0.08 * v, 120); break;
      case 'mob_sheep': this.tone(420, 0.5, 'square', 0.05 * v, 380); break;
      case 'mob_chicken': this.tone(1000, 0.06, 'triangle', 0.06 * v, 1300); this.tone(1100, 0.06, 'triangle', 0.06 * v, 1400, 0.1); break;
      default: break;
    }
  },
};

/* ---------- three.js setup ---------- */
function setupRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.id = 'game';
  document.body.prepend(renderer.domElement);
  G.renderer = renderer;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1200);
  G.camera.rotation.order = 'YXZ';
  G.scene.add(G.camera);
  G.scene.fog = new THREE.Fog(0x8ec3ff, 40, 80);
  G.ambient = new THREE.AmbientLight(0xffffff, 0.6); G.scene.add(G.ambient);
  G.sunLight = new THREE.DirectionalLight(0xffffff, 0.5); G.sunLight.position.set(0.4, 1, 0.3); G.scene.add(G.sunLight);

  const tex = new THREE.CanvasTexture(atlasCanvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  G.atlasTex = tex;
  G.mats = {
    opaque: new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.5 }),
    trans: new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide }),
    item: new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    held: new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
  };

  // selection outline & crack overlay
  const sel = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
  sel.visible = false; G.scene.add(sel); G.selBox = sel;
  G.crackGeos = [];
  for (let s = 0; s < 8; s++) {
    const g = new THREE.BoxGeometry(1.006, 1.006, 1.006);
    const U = TILE_UV[TILES['destroy_' + s]], uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? U[2] : U[0], uv.getY(i) ? U[3] : U[1]);
    G.crackGeos.push(g);
  }
  G.crack = new THREE.Mesh(G.crackGeos[0], new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  G.crack.visible = false; G.scene.add(G.crack);

  // held item
  G.hand = new THREE.Group();
  G.hand.position.set(0.6, -0.55, -0.95);
  G.camera.add(G.hand);
  G.handArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.75), new THREE.MeshBasicMaterial({ color: 0xc89878, depthTest: false, depthWrite: false }));
  G.handArm.rotation.set(0.1, -0.15, 0); G.handArm.position.set(0.05, -0.05, 0.1); G.handArm.renderOrder = 10;
  G.hand.add(G.handArm);
  G.handItem = new THREE.Mesh(itemGeometry(ID.stone), G.mats.held);
  G.handItem.renderOrder = 11; G.hand.add(G.handItem);
  G.handId = -2;
  const pm = buildMobModel('player');
  G.playerModel = pm; pm.group.visible = false; G.scene.add(pm.group);
  G.camMode = 0;

  buildSky();
  window.addEventListener('resize', () => {
    G.camera.aspect = window.innerWidth / window.innerHeight; G.camera.updateProjectionMatrix();
    G.renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function buildSky() {
  const sky = new THREE.Group();
  const sunC = document.createElement('canvas'); sunC.width = sunC.height = 16;
  const sx = sunC.getContext('2d'); sx.fillStyle = '#fff3b0'; sx.fillRect(0, 0, 16, 16); sx.fillStyle = '#ffffff'; sx.fillRect(3, 3, 10, 10);
  const moonC = document.createElement('canvas'); moonC.width = moonC.height = 16;
  const mx = moonC.getContext('2d'); mx.fillStyle = '#dfe6f5'; mx.fillRect(0, 0, 16, 16); mx.fillStyle = '#aab3c8'; mx.fillRect(3, 4, 4, 3); mx.fillRect(9, 9, 3, 3); mx.fillRect(10, 3, 2, 2);
  const mkTex = c => { const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; return t; };
  G.sun = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ map: mkTex(sunC), fog: false }));
  G.moon = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: mkTex(moonC), fog: false, transparent: true }));
  sky.add(G.sun, G.moon);
  const starPos = [];
  const r = mulberry32(42);
  for (let i = 0; i < 900; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    starPos.push(Math.cos(a) * s * 600, Math.abs(u) * 600, Math.sin(a) * s * 600);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  G.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
  sky.add(G.stars);
  G.sky = sky; G.scene.add(sky);

  // clouds
  const cc = document.createElement('canvas'); cc.width = cc.height = 64;
  const cx = cc.getContext('2d');
  const n = new Noise(7);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const v = n.noise2(x / 6, y / 6) + n.noise2(x / 3, y / 3) * 0.4;
    if (v > 0.12) { cx.fillStyle = '#ffffff'; cx.fillRect(x, y, 1, 1); }
  }
  const ct = mkTex(cc); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(3, 3);
  G.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  G.clouds.rotation.x = -Math.PI / 2;
  G.scene.add(G.clouds);
}

/* ---------- time of day ---------- */
G.sunHeight = () => Math.sin(G.time * Math.PI * 2);
G.daylight = () => clamp(G.sunHeight() * 2.2 + 0.5, 0.15, 1);
G.isNight = () => G.sunHeight() < -0.1;

const C_DAY = new THREE.Color(0x8ec3ff), C_NIGHT = new THREE.Color(0x0a0f24), C_DUSK = new THREE.Color(0xf08a50);
const C_WATER = new THREE.Color(0x1c3f8a), C_CAVE = new THREE.Color(0x0b0b10), C_LAVA = new THREE.Color(0xc04010);
const skyCol = new THREE.Color();

G.applyFog = () => {
  const far = G.world ? G.world.renderDist * 16 : 80;
  G.fogFar = far; G.fogNear = far * 0.55;
};

const C_NETHER = new THREE.Color(0x3a0c0c);
function updateSky(dt) {
  const netherView = G.dim === 'nether' && G.state !== 'title';
  G.sky.visible = !netherView; G.clouds.visible = !netherView;
  if (netherView) {
    const P = G.player;
    G.scene.background = C_NETHER;
    G.scene.fog.color.copy(P.inLava ? C_LAVA : C_NETHER);
    G.scene.fog.near = P.inLava ? 0.2 : G.fogNear * 0.35; G.scene.fog.far = P.inLava ? 3 : G.fogFar * 0.85;
    for (const k of ['opaque', 'trans', 'item', 'held']) G.mats[k].color.setScalar(0.88);
    G.ambient.intensity = 0.75; G.sunLight.intensity = 0.15;
    return;
  }
  const sh = G.sunHeight(), dl = G.daylight();
  skyCol.copy(C_NIGHT).lerp(C_DAY, clamp((sh + 0.15) * 2.5, 0, 1));
  const dusk = clamp(1 - Math.abs(sh) * 5, 0, 1) * 0.55;
  skyCol.lerp(C_DUSK, dusk);
  const P = G.player, cam = G.camera.position;
  // darker when deep underground
  let under = 0;
  if (G.state !== 'title' && G.world.isLoaded(P.pos.x, P.pos.z)) {
    const top = G.world.surfaceY(P.pos.x, P.pos.z);
    under = clamp((top - (P.pos.y + 1.6) - 3) / 8, 0, 1);
  }
  G.underground += (under - G.underground) * Math.min(1, dt * 2);
  const ug = G.underground;
  skyCol.lerp(C_CAVE, ug * 0.9);
  let near = G.fogNear, far = G.fogFar;
  const fogCol = skyCol.clone();
  if (P.headInWater) { fogCol.copy(C_WATER).multiplyScalar(0.4 + dl * 0.6); near = 1; far = 18; }
  else if (P.inLava && G.state !== 'title') { fogCol.copy(C_LAVA); near = 0.2; far = 3; }
  G.scene.background = skyCol;
  G.scene.fog.color.copy(fogCol);
  G.scene.fog.near = near; G.scene.fog.far = far;
  const bright = (0.22 + 0.78 * dl) * (1 - ug * 0.55);
  for (const k of ['opaque', 'trans', 'item', 'held']) G.mats[k].color.setScalar(bright);
  G.ambient.intensity = 0.25 + 0.5 * dl * (1 - ug * 0.5);
  G.sunLight.intensity = 0.55 * dl * (1 - ug);
  const a = G.time * Math.PI * 2;
  G.sky.position.copy(cam);
  G.sun.position.set(Math.cos(a) * 500, Math.sin(a) * 500, 120);
  G.moon.position.set(-Math.cos(a) * 500, -Math.sin(a) * 500, -120);
  G.sun.lookAt(cam); G.moon.lookAt(cam);
  G.sun.visible = sh > -0.2; G.moon.visible = sh < 0.2;
  G.stars.material.opacity = clamp(-sh * 3, 0, 1) * (1 - ug);
  G.stars.rotation.y = a * 0.2;
  G.clouds.position.set(cam.x, WH + 14, cam.z);
  G.clouds.material.map.offset.set((cam.x / 1600 * 3 + performance.now() / 600000) % 1, (-cam.z / 1600 * 3) % 1);
  G.clouds.material.color.setScalar(0.35 + 0.65 * dl);
}

/* ---------- world helpers exposed to entities ---------- */
G.spawnDrop = (id, count, x, y, z, vel) => {
  const d = new ItemDrop(id, count, x, y, z, vel);
  G.drops.push(d);
  return d;
};
G.spawnProjectile = (kind, pos, vel, owner) => { G.projectiles.push(new Projectile(kind, pos, vel, owner)); };
G.primeTNT = (x, y, z, fuse) => { G.tnts.push(new PrimedTNT(x + 0.5, y, z + 0.5, fuse)); };

G.explode = (x, y, z, power, breakBlocks, harmless, colors) => {
  const W = G.world, c = new THREE.Vector3(x, y, z);
  Sound.play('explode', c);
  G.particles.burst(x, y, z, colors || [0x6a6a6a, 0x8a8a8a, 0xd8d8d8, 0xff9a20], 45, power * 2.2, 0.45, 2);
  if (breakBlocks) {
    const r = Math.ceil(power);
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy, dz);
      if (d > power * (0.7 + Math.random() * 0.35)) continue;
      const X = bx + dx, Y = by + dy, Z = bz + dz;
      const id = W.getBlock(X, Y, Z);
      if (!id) continue;
      const def = DEFS[id];
      if (def.hardness === Infinity || id === ID.obsidian || def.liquid) continue;
      W.setBlock(X, Y, Z, 0);
      if (id === ID.tnt) { G.primeTNT(X, Y, Z, 0.4 + Math.random() * 0.8); continue; }
      if (Math.random() < 0.12) for (const [did, n] of getDrops(def, Math.random)) G.spawnDrop(did, n, X + 0.5, Y + 0.5, Z + 0.5);
    }
  }
  if (harmless) return;
  const R = power * 2;
  const P = G.player;
  const dp = Math.hypot(P.pos.x - x, P.pos.y + 0.9 - y, P.pos.z - z);
  if (dp < R) { const f = 1 - dp / R; P.hurt(Math.max(1, Math.round(f * power * 5)), c, f * 16, true); P.vel.y += f * 6; }
  if (dp < R * 3) G.shake = Math.max(G.shake, 1 - dp / (R * 3));
  for (const m of G.mobs) {
    if (m.dead) continue;
    const d = Math.hypot(m.pos.x - x, m.pos.y + m.h / 2 - y, m.pos.z - z);
    if (d < R) { const f = 1 - d / R; m.hurt(Math.max(1, Math.round(f * power * 5)), c, f * 14, false); }
  }
  for (const it of G.drops) {
    const d = it.pos.distanceTo(c);
    if (d < R) { const f = 1 - d / R; it.vel.add(it.pos.clone().sub(c).normalize().multiplyScalar(f * 10)); }
  }
};

/* right-click a bed: set your respawn point there and, at night, sleep until morning */
G.sleep = (b) => {
  const P = G.player;
  if (G.dim === 'nether') {
    G.world.setBlock(b.x, b.y, b.z, 0);
    G.ui.message('Beds explode in the Nether!', 'purple');
    G.explode(b.x + 0.5, b.y + 0.5, b.z + 0.5, 4, true);
    return;
  }
  P.spawn.set(b.x + 0.5, b.y + 1, b.z + 0.5);
  if (!G.isNight()) { G.ui.message('Respawn point set. You can only sleep at night.'); return; }
  const near = G.mobs.some(m => !m.dead && m.T.hostile && m.pos.distanceTo(P.pos) < 10);
  if (near) { G.ui.message('Respawn point set, but you can\'t sleep now: there are monsters nearby.'); return; }
  const fx = $('fx-sleep');
  fx.classList.add('on');
  setTimeout(() => {
    G.time = 0.02;
    fx.classList.remove('on');
    G.ui.message('You slept through the night. Good morning!', 'gold');
    G.save();
  }, 1600);
};

G.summonDragon = (kind) => {
  if (G.dim !== 'nether') { G.ui.message('Dragons can only be summoned in the Nether. Build an obsidian portal and light it with Flint and Steel.', 'purple'); return false; }
  if (G.dragons.some(d => !d.done)) { G.ui.message('A dragon is already flying around!', 'purple'); return false; }
  kind = kind || ['ender', 'fire', 'ice'][(Math.random() * 3) | 0];
  const P = G.player;
  const center = new THREE.Vector3(P.pos.x, G.world.groundY(P.pos.x, P.pos.z), P.pos.z);
  const d = new Dragon(kind, center);
  G.dragons.push(d);
  G.ui.message('The ' + d.name + ' has appeared!', 'purple');
  Sound.play('dragonRoar');
  return true;
};

/* ---------- mob spawning ---------- */
const HOSTILE_POOL = [['zombie', 30], ['skeleton', 24], ['creeper', 24], ['spider', 16], ['enderman', 6]];
const PASSIVE_POOL = [['pig', 1], ['cow', 1], ['sheep', 1], ['chicken', 1]];
function pick(pool) {
  let t = pool.reduce((a, p) => a + p[1], 0), r = Math.random() * t;
  for (const [k, w] of pool) { r -= w; if (r <= 0) return k; }
  return pool[0][0];
}
function spawnMob(type, x, y, z) {
  const m = new Mob(type, x, y, z);
  G.mobs.push(m);
  return m;
}
function spawnTick() {
  const P = G.player, W = G.world;
  let hostile = 0, passive = 0;
  for (const m of G.mobs) {
    if (m.dead) continue;
    const d = Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z);
    if (d > (m.T.passive ? 96 : 64) || !W.isLoaded(m.pos.x, m.pos.z)) { m.remove(); continue; }
    if (m.T.passive) passive++; else hostile++;
  }
  if (G.dim === 'nether') { if (hostile < 12) netherSpawn(); return; }
  if (passive < 12 && Math.random() < 0.4) {
    const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 25;
    const x = Math.floor(P.pos.x + Math.cos(a) * r) + 0.5, z = Math.floor(P.pos.z + Math.sin(a) * r) + 0.5;
    if (W.isLoaded(x, z)) {
      const y = W.surfaceY(x, z);
      if (W.getBlock(Math.floor(x), y, Math.floor(z)) === ID.grass) {
        const type = pick(PASSIVE_POOL), n = 1 + (Math.random() * 3 | 0);
        for (let i = 0; i < n; i++) spawnMob(type, x + (Math.random() - 0.5) * 2, y + 1, z + (Math.random() - 0.5) * 2);
      }
    }
  }
  const night = G.isNight();
  if (hostile < (night ? 14 : 6)) {
    for (let tries = 0; tries < 4; tries++) {
      const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 26;
      const x = Math.floor(P.pos.x + Math.cos(a) * r), z = Math.floor(P.pos.z + Math.sin(a) * r);
      if (!W.isLoaded(x, z)) continue;
      const top = W.surfaceY(x, z);
      let y;
      if (night && Math.random() < 0.65) y = top + 1;
      else y = 4 + Math.floor(Math.random() * Math.max(1, top - 10));
      const below = W.getBlock(x, y - 1, z);
      if (!below || !DEFS[below].solid || DEFS[below].leaves) continue;
      if (W.getBlock(x, y, z) || W.getBlock(x, y + 1, z)) continue;
      if (y > top && !night) continue;
      if (y <= top && W.skyExposed(x, y, z)) continue;
      let type = pick(HOSTILE_POOL);
      if (type === 'enderman' && (W.getBlock(x, y + 2, z))) type = 'zombie';
      if (type === 'spider' && (W.getBlock(x + 1, y, z) || W.getBlock(x - 1, y, z))) type = 'skeleton';
      spawnMob(type, x + 0.5, y, z + 0.5);
      break;
    }
  }
}

const NETHER_POOL = [['zombified_piglin', 40], ['wither_skeleton', 14], ['blaze', 16], ['ghast', 7]];
function netherSpawn() {
  const P = G.player, W = G.world;
  for (let tries = 0; tries < 4; tries++) {
    const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 22;
    const x = Math.floor(P.pos.x + Math.cos(a) * r), z = Math.floor(P.pos.z + Math.sin(a) * r);
    if (!W.isLoaded(x, z)) continue;
    const type = pick(NETHER_POOL), T = MOB_TYPES[type];
    let y = -1;
    if (T.fly) {
      const need = type === 'ghast' ? 6 : 3;
      for (let yy = 34; yy < 70 && y < 0; yy++) {
        let ok = true;
        for (let k = 0; k < need && ok; k++) if (W.getBlock(x, yy + k, z)) ok = false;
        if (ok) y = yy + (type === 'ghast' ? 1 : 0);
      }
    } else {
      for (let yy = 30 + Math.floor(Math.random() * 40); yy > 20; yy--) {
        const below = W.getBlock(x, yy - 1, z);
        if (!W.getBlock(x, yy, z) && !W.getBlock(x, yy + 1, z) && below && DEFS[below].solid) { y = yy; break; }
      }
    }
    if (y < 0) continue;
    spawnMob(type, x + 0.5, y, z + 0.5);
    break;
  }
}

/* ---------- world lifecycle ---------- */
function clearEntities() {
  for (const list of [G.mobs, G.projectiles, G.drops, G.tnts]) { for (const e of list) { if (e.mesh) G.scene.remove(e.mesh); } list.length = 0; }
  for (const d of G.dragons) G.scene.remove(d.mesh);
  G.dragons.length = 0;
}

function makeWorld(seed) {
  if (G.worlds) {
    G.scene.remove(G.world.group);
    for (const w of Object.values(G.worlds)) for (const c of w.chunks.values()) for (const m of c.meshes) m.geometry.dispose();
  }
  clearEntities();
  const rd = G.world ? G.world.renderDist : (Input.touch ? 4 : 5);
  G.worlds = {};
  for (const dim of ['overworld', 'nether']) {
    const w = new World(seed, G.mats, dim);
    w.renderDist = rd;
    w.onEdit = (x, y, z, id) => Net.edit(dim, x, y, z, id);
    G.worlds[dim] = w;
  }
  G.dim = 'overworld';
  G.world = G.worlds.overworld;
  G.scene.add(G.world.group);
  G.seed = seed;
  G.applyFog();
}

function useDim(to) {
  if (G.dim === to) return;
  if (to === 'overworld' && G.dragons.some(d => !d.dead)) G.dragonTimer = 20;
  clearEntities();
  G.scene.remove(G.world.group);
  G.dim = to;
  G.world = G.worlds[to];
  G.world.queue = [];
  G.scene.add(G.world.group);
  G.applyFog();
}

G.switchDimension = (to) => {
  const P = G.player;
  const scale = to === 'nether' ? 1 / 8 : 8;
  const tx = Math.floor(P.pos.x * scale), tz = Math.floor(P.pos.z * scale);
  useDim(to);
  loadAround(tx, tz, 2);
  let p = G.world.findPortal(tx, tz, 20);
  if (!p) {
    const y = to === 'nether' ? clamp(G.world.groundY(tx, tz) + 1, 33, 64) : Math.max(G.world.surfaceY(tx, tz), SEA) + 1;
    G.world.buildPortal(tx, y, tz, true);
    p = [tx, y, tz];
  }
  P.pos.set(p[0] + 0.5, p[1], p[2] + 0.5);
  // step out in front of the portal onto solid ground
  const W = G.world, alongX = W.getBlock(p[0] + 1, p[1], p[2]) === ID.nether_portal || W.getBlock(p[0] - 1, p[1], p[2]) === ID.nether_portal;
  for (const s of [1, -1]) {
    const ox = alongX ? 0 : s, oz = alongX ? s : 0;
    const bx = p[0] + ox, bz = p[2] + oz;
    if (!W.isSolid(bx, p[1], bz) && !W.isSolid(bx, p[1] + 1, bz) && W.isSolid(bx, p[1] - 1, bz)) {
      P.pos.set(bx + 0.5, p[1], bz + 0.5);
      P.yaw = Math.atan2(-ox, -oz);
      break;
    }
  }
  P.vel.set(0, 0, 0); P.fallStart = null; P.portalT = 0; P.portalCd = true;
  Sound.play('teleport');
  if (to === 'nether') {
    G.ui.message('Welcome to the Nether! Watch out for lava, ghasts and blazes.', 'purple');
    if (!G.netherVisited) { G.ui.message('You hear a dragon roaring somewhere in the darkness...', 'purple'); G.dragonTimer = Math.min(G.dragonTimer, 25); }
    G.netherVisited = true;
  } else G.ui.message('Back in the Overworld.', 'gold');
  G.save();
};

G.respawnPlayer = () => {
  useDim('overworld');
  G.player.respawn();
  loadAround(G.player.pos.x, G.player.pos.z, 1);
};

function seedFromText(t) {
  if (!t) return (Math.random() * 2 ** 31) | 0;
  if (/^-?\d+$/.test(t)) return (+t) | 0;
  return hashStr(t) | 0;
}

function findSpawn(world) {
  for (let r = 0; r < 600; r += 8) {
    for (let a = 0; a < 12; a++) {
      const x = Math.round(Math.cos(a / 12 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 12 * Math.PI * 2) * r);
      const h = world.heightAt(x, z), b = world.biomeAt(x, z, h);
      if (h > SEA + 1 && b !== BIOME.MOUNTAIN && b !== BIOME.OCEAN && b !== BIOME.BEACH) return [x + 0.5, z + 0.5];
    }
  }
  return [0.5, 0.5];
}

function loadAround(x, z, r) {
  G.world.queue = [];
  for (let i = 0; i < 400 && G.world.pendingNear(x, z, r); i++) G.world.update(x, z, 50);
}

G.previewWorld = (seedText) => {
  const seed = seedFromText(seedText);
  makeWorld(seed);
  const [sx, sz] = findSpawn(G.world);
  G.player.spawn.set(sx, 0, sz);
  G.player.pos.set(sx, 60, sz);
  $('seed').value = seed;
  G.titleAngle = 0;
};

G.startNew = (mode) => {
  Sound.init();
  const P = G.player;
  const txt = $('seed').value.trim();
  makeWorld(txt ? seedFromText(txt) : G.seed);
  P.inv = new Inventory(); P.reset(); P.mode = mode; P.sel = 0;
  const [sx, sz] = findSpawn(G.world);
  loadAround(sx, sz, 2);
  const sy = G.world.surfaceY(sx, sz) + 1;
  P.spawn.set(sx, sy, sz); P.pos.copy(P.spawn); P.vel.set(0, 0, 0);
  P.yaw = 0; P.pitch = -0.1;
  G.time = 0.03; G.dragonTimer = 30; G.netherVisited = false;
  const fx = Math.floor(sx) + 4, fz = Math.floor(sz) + 4;
  const fy = G.world.surfaceY(fx, fz);
  if (G.world.getBlock(fx, fy, fz) !== ID.water) G.world.buildPortal(fx, fy + 1, fz, false);
  if (mode === 'creative') {
    ['grass', 'stone', 'oak_planks', 'glass', 'bricks', 'gold_block', 'diamond_block', 'tnt', 'flint_and_steel'].forEach((k, i) => { P.inv.slots[i] = { id: ID[k], count: DEFS[ID[k]].stack }; });
    P.inv.changed();
  }
  for (let i = 0; i < 6; i++) {
    const x = sx + (Math.random() - 0.5) * 30, z = sz + (Math.random() - 0.5) * 30;
    const y = G.world.surfaceY(x, z);
    if (G.world.getBlock(Math.floor(x), y, Math.floor(z)) === ID.grass) spawnMob(pick(PASSIVE_POOL), x, y + 1, z);
  }
  $('menu-start').hidden = true;
  G.ui.message(mode === 'creative' ? 'Creative mode: unlimited blocks, double-tap jump to fly.' : 'Survival mode: punch trees, craft tools, survive the night!', 'gold');
  G.ui.message((Input.touch ? 'Tap Items' : 'Press E') + ' for inventory and crafting.');
  G.ui.message('There is an obsidian portal frame near you. Light it with Flint and Steel to enter the Nether, where the dragons live.', 'purple');
  G.resume();
  G.save();
  Net.joinWorld(G.seed);
};

G.continueSaved = () => {
  Sound.init();
  let s;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
  if (!s) { G.ui.message('No saved world found.'); return; }
  makeWorld(s.seed);
  G.worlds.overworld.loadEdits(s.edits || {});
  G.worlds.nether.loadEdits(s.netherEdits || {});
  G.netherVisited = !!s.netherVisited;
  if (s.dim === 'nether') useDim('nether');
  const P = G.player;
  P.reset(); P.mode = s.mode || 'survival';
  P.inv = new Inventory(); P.inv.load(s.inv || []);
  P.health = s.health ?? 20; P.hunger = s.hunger ?? 20; P.xp = s.xp || 0; P.level = s.level || 0;
  P.spawn.fromArray(s.spawn); P.pos.fromArray(s.pos); P.yaw = s.yaw || 0; P.pitch = s.pitch || 0;
  G.time = s.time || 0.1; G.dragonTimer = s.dragonTimer ?? 30;
  loadAround(P.pos.x, P.pos.z, 2);
  if (G.world.collides(P.pos.x, P.pos.y, P.pos.z, P.w, P.h)) P.pos.y = G.world.groundY(P.pos.x, P.pos.z) + 1;
  P.portalCd = true;
  $('seed').value = s.seed;
  $('menu-start').hidden = true;
  G.ui.message('Welcome back!', 'gold');
  G.resume();
  Net.joinWorld(G.seed);
};

G.save = () => {
  if (G.state === 'title' || !G.world) return;
  const P = G.player;
  const data = {
    v: 1, seed: G.seed, mode: P.mode, time: G.time, dragonTimer: G.dragonTimer,
    pos: P.pos.toArray(), spawn: P.spawn.toArray(), yaw: P.yaw, pitch: P.pitch,
    health: P.dead ? 20 : P.health, hunger: P.hunger, xp: P.xp, level: P.level,
    inv: P.inv.toJSON(), edits: G.worlds.overworld.serializeEdits(), netherEdits: G.worlds.nether.serializeEdits(),
    dim: G.dim, netherVisited: !!G.netherVisited,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
};

function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function refreshContinue() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
  $('btn-continue').hidden = !s;
  if (s) $('btn-continue').textContent = 'Continue saved world (seed ' + s.seed + (s.mode === 'creative' ? ', Creative' : ', Survival') + ')';
}

G.toTitle = () => {
  G.setState('title');
  for (const id of ['menu-pause', 'menu-inv', 'menu-dead']) $(id).hidden = true;
  $('menu-start').hidden = false;
  refreshContinue();
  G.unlock();
  Net.leave();
  G.previewWorld(String(G.seed));
};

G.setState = (s) => {
  G.state = s;
  document.body.dataset.state = s;
};
G.lock = () => {
  if (Input.touch || Input.fallback || Pad.active) return;
  try {
    const p = G.renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => G.lockFailed());
  } catch (e) { G.lockFailed(); }
};
G.lockFails = 0;
G.lockFailed = () => {
  if (Input.fallback || Input.locked) return;
  G.lockFails++;
  if (G.lockFails >= 2) {
    Input.fallback = true;
    G.ui.message('Mouse capture is not available here. Drag to look, click to place, hold the mouse to dig, right-click to use.');
  } else G.ui.message('Click the game to capture the mouse.');
};
G.unlock = () => { if (document.pointerLockElement) document.exitPointerLock(); };
G.pause = () => {
  if (G.state !== 'play') return;
  G.setState('pause');
  G.ui.syncPause();
  $('menu-pause').hidden = false;
  G.unlock();
  G.save();
};
G.resume = () => {
  Sound.init();
  $('menu-pause').hidden = true;
  G.setState('play');
  G.lock();
};

/* ---------- main loop ---------- */
let last = performance.now(), fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.1) dt = 0.1;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  const P = G.player;
  Pad.poll(dt);

  if (G.state === 'title') {
    G.titleAngle = (G.titleAngle || 0) + dt * 0.05;
    const cx = P.spawn.x, cz = P.spawn.z;
    const camY = Math.max(G.world.heightAt(cx, cz), SEA) + 22;
    G.camera.position.set(cx + Math.cos(G.titleAngle) * 30, camY, cz + Math.sin(G.titleAngle) * 30);
    G.camera.rotation.set(-0.35, Math.PI / 2 - G.titleAngle, 0);
    G.time = 0.12;
    G.world.update(G.camera.position.x, G.camera.position.z, 10);
    G.hand.visible = false;
    updateSky(dt);
    G.renderer.render(G.scene, G.camera);
    return;
  }

  const active = G.state === 'play';
  if (active) {
    G.time = (G.time + dt / DAY_LENGTH) % 1;
    // look
    const sens = 0.0024 * Input.sens;
    P.yaw -= Input.lookDX * sens; P.pitch -= Input.lookDY * sens;
    P.pitch = clamp(P.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    G.ui.readMovement();
    const ready = G.world.isLoaded(P.pos.x, P.pos.z) && !G.world.chunks.get(G.world.key(Math.floor(P.pos.x) >> 4, Math.floor(P.pos.z) >> 4)).dirty;
    if (ready) P.update(dt, Input);

    // interaction
    const tgt = P.dead ? { block: null, mob: null } : P.target();
    if (Input.left || Input.padLeft || Input.leftPressed) P.primary(dt, Input.leftPressed, tgt); else P.breaking = null;
    if (Input.rightPressed || ((Input.right || Input.padRight) && P.useCd <= 0)) P.use(tgt);
    if (Input.middlePressed) P.pickBlock(tgt);
    Input.leftPressed = Input.rightPressed = Input.middlePressed = false;
    if (tgt.block) {
      G.selBox.visible = true;
      G.selBox.position.set(tgt.block.x + 0.5, tgt.block.y + 0.5, tgt.block.z + 0.5);
      const def = DEFS[tgt.block.id];
      if (def.cross) { G.selBox.scale.set(0.7, 1, 0.7); } else G.selBox.scale.set(1, 1, 1);
    } else G.selBox.visible = false;
    if (P.breaking && P.breaking.p > 0) {
      G.crack.visible = true;
      G.crack.position.set(P.breaking.x + 0.5, P.breaking.y + 0.5, P.breaking.z + 0.5);
      G.crack.geometry = G.crackGeos[Math.min(7, Math.floor(P.breaking.p * 8))];
    } else G.crack.visible = false;

    // entities
    for (const m of G.mobs) m.update(dt);
    G.mobs = G.mobs.filter(m => !m.removed);
    for (const d of G.dragons) d.update(dt);
    G.dragons = G.dragons.filter(d => !d.done || (G.dragonTimer = 240, false));
    for (const p of G.projectiles) p.update(dt);
    G.projectiles = G.projectiles.filter(p => !p.done);
    for (const d of G.drops) d.update(dt);
    G.drops = G.drops.filter(d => !d.done);
    for (const t of G.tnts) t.update(dt);
    G.tnts = G.tnts.filter(t => !t.done);

    // nether portal travel
    if (!P.dead && G.world.touching(P, ID.nether_portal, 0)) {
      if (!P.portalCd) {
        P.portalT = (P.portalT || 0) + dt;
        if (P.portalT > (P.mode === 'creative' ? 0.8 : 2.2)) G.switchDimension(G.dim === 'nether' ? 'overworld' : 'nether');
      }
    } else { P.portalT = 0; P.portalCd = false; }
    $('fx-portal').style.opacity = clamp((P.portalT || 0) / 2, 0, 0.85);

    G.spawnT -= dt;
    if (G.spawnT <= 0) { G.spawnT = 1; spawnTick(); }
    if (!G.dragons.length && G.dim === 'nether') {
      G.dragonTimer -= dt;
      if (G.dragonTimer <= 0) { G.dragonTimer = 240; G.summonDragon(G.firstDragonDone ? null : 'ender'); G.firstDragonDone = true; }
    }
    G.saveT += dt;
    if (G.saveT > 30) { G.saveT = 0; G.save(); }
  }
  Input.lookDX = Input.lookDY = 0;
  G.particles.update(active ? dt : 0);
  G.world.update(P.pos.x, P.pos.z, active ? 6 : 12);
  Net.tick(dt);

  // camera
  const eye = P.eyePos();
  const hs = Math.hypot(P.vel.x, P.vel.z);
  G.bob = (G.bob || 0) + (P.onGround ? hs * dt * 1.6 : 0);
  const bobAmt = P.onGround && !P.flying ? Math.min(1, hs / 4.3) * 0.05 : 0;
  G.shake = Math.max(0, G.shake - dt * 1.5);
  const sh = G.shake * 0.35;
  G.camera.position.set(eye.x + (Math.random() - 0.5) * sh, eye.y + Math.abs(Math.sin(G.bob * 2)) * bobAmt + (Math.random() - 0.5) * sh, eye.z + (Math.random() - 0.5) * sh);
  G.camera.rotation.set(P.pitch, P.yaw, 0);
  const third = G.camMode > 0 && !P.dead;
  G.playerModel.group.visible = third;
  if (third) {
    const d = P.lookDir(), back = G.camMode === 1 ? -1 : 1;
    const hit = G.world.raycast(eye.x, eye.y, eye.z, d.x * back, d.y * back, d.z * back, 4.5, false);
    const dist = hit && DEFS[hit.id].solid ? Math.max(0.3, hit.dist - 0.3) : 4;
    G.camera.position.set(eye.x + d.x * back * dist, eye.y + d.y * back * dist, eye.z + d.z * back * dist);
    G.camera.lookAt(eye);
    const pmg = G.playerModel.group, parts = G.playerModel.parts;
    pmg.position.set(P.pos.x, P.pos.y, P.pos.z);
    pmg.rotation.y = P.yaw + Math.PI;
    parts.head.rotation.x = -P.pitch * 0.8;
    const sw2 = Math.sin(G.bob * 2) * Math.min(1, hs / 4) * 0.8;
    parts.legs[0].rotation.x = sw2; parts.legs[1].rotation.x = -sw2;
    parts.arms[0].rotation.x = -sw2; parts.arms[1].rotation.x = sw2 - Math.sin(P.swing * Math.PI) * 1.4;
  }
  const fov = 75 + (P.sprinting ? 8 : 0) + (P.flying && hs > 8 ? 6 : 0);
  if (Math.abs(G.camera.fov - fov) > 0.1) { G.camera.fov += (fov - G.camera.fov) * Math.min(1, dt * 8); G.camera.updateProjectionMatrix(); }

  // held item
  const held = P.heldSlot();
  const hid = held ? held.id : -1;
  if (hid !== G.handId) {
    G.handId = hid;
    G.handItem.visible = hid !== -1; G.handArm.visible = hid === -1;
    if (hid !== -1) {
      G.handItem.geometry = itemGeometry(hid);
      const flat = G.handItem.geometry.userData.flat;
      G.handItem.scale.setScalar(flat ? 0.42 : 0.26);
      G.handItem.rotation.set(flat ? 0 : 0.2, flat ? -1.2 : 0.75, flat ? 0.15 : 0);
      G.handItem.position.set(flat ? 0.02 : 0, flat ? 0.05 : -0.02, 0);
    }
  }
  G.hand.visible = !P.dead && G.camMode === 0;
  const sw = Math.sin(P.swing * Math.PI);
  G.hand.rotation.set(-sw * 0.9, sw * 0.3, 0);
  G.hand.position.set(0.6 - sw * 0.15, -0.55 + Math.sin(G.bob * 2) * bobAmt * 0.6 - sw * 0.1, -0.95 - sw * 0.1);

  updateSky(dt);
  G.ui.update();
  if (!$('debug').hidden) {
    const bx = Math.floor(P.pos.x), bz = Math.floor(P.pos.z);
    const h = G.world.heightAt(bx, bz);
    $('debug').textContent = `${G.fps} fps\nXYZ ${P.pos.x.toFixed(1)} ${P.pos.y.toFixed(1)} ${P.pos.z.toFixed(1)}\nBiome ${BIOME_NAMES[G.world.biomeAt(bx, bz, h)]}\nChunks ${G.world.chunks.size}  Mobs ${G.mobs.length}\nTime ${Math.floor(((G.time + 0.25) % 1) * 24)}:00  Seed ${G.seed}`;
  }
  G.renderer.render(G.scene, G.camera);
}

/* ---------- boot ---------- */
function boot() {
  setupRenderer();
  G.sound = Sound;
  G.particles = new Particles(G.scene);
  G.player = new Player();
  G.ui = UI;
  UI.init();
  Net.init();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { saved = null; }
  refreshContinue();
  G.setState('title');
  G.previewWorld(saved ? String(saved.seed) : null);
  window.addEventListener('beforeunload', () => G.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) { G.save(); if (G.state === 'play') G.pause(); } });
  requestAnimationFrame(t => { last = t; frame(t); });
}
boot();
