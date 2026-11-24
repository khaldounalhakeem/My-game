'use strict';
/* Game setup, sky and day/night cycle, sounds, spawning, explosions, saving and the main loop. */

const SAVE_KEY = 'blockrealm-save-v1'; // the old single save, moved into the world list on first start
const WORLDS_KEY = 'blockrealm-worlds';
const worldKey = id => 'blockrealm-world-' + id;
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
      case 'golem': this.noise(0.25, 0.5 * v, 300, 'lowpass'); this.tone(90, 0.3, 'square', 0.15 * v, 50); break;
      case 'mob_iron_golem': this.tone(70, 0.4, 'triangle', 0.1 * v, 60); break;
      case 'mob_villager': this.tone(260, 0.12, 'square', 0.05 * v, 200); this.tone(220, 0.15, 'square', 0.05 * v, 300, 0.14); break;
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

  /* blocks near a torch stay bright at night and in caves: each corner carries a 'glow' (0..1) */
  const lit = mat => {
    mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( max( diffuse, vGlow * vec3( 1.0, 0.86, 0.66 ) ), opacity );');
    };
    return mat;
  };
  const tex = new THREE.CanvasTexture(atlasCanvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  G.atlasTex = tex;
  G.mats = {
    opaque: lit(new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.5 })),
    trans: lit(new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide })),
    item: new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    held: new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
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
  // the hand and held item live in their own little scene, drawn after the world on a cleared depth buffer:
  // they never poke into walls, and solid blocks in the hand still hide their own back faces
  G.handScene = new THREE.Scene();
  G.handCam = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);
  G.handScene.add(G.handCam);
  G.handCam.add(G.hand);
  G.handArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.75), new THREE.MeshBasicMaterial({ color: 0xc89878 }));
  G.handArm.rotation.set(0.1, -0.15, 0); G.handArm.position.set(0.05, -0.05, 0.1); G.handArm.renderOrder = 10;
  G.hand.add(G.handArm);
  // the sleeve of your chestplate, seen on your own arm
  G.handSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.27, 0.32), new THREE.MeshBasicMaterial({ color: 0xdcdcdc }));
  G.handSleeve.position.set(0, 0, 0.24); G.handSleeve.renderOrder = 11; G.handSleeve.visible = false;
  G.handArm.add(G.handSleeve);
  G.handItem = new THREE.Mesh(itemGeometry(ID.stone), G.mats.held);
  G.handItem.renderOrder = 11; G.hand.add(G.handItem);
  G.handId = -2;
  G.setSkin(G.loadSkin(), true);
  G.camMode = 0;

  buildSky();
  window.addEventListener('resize', () => {
    G.camera.aspect = window.innerWidth / window.innerHeight; G.camera.updateProjectionMatrix();
    G.handCam.aspect = G.camera.aspect; G.handCam.updateProjectionMatrix();
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

const C_NETHER = new THREE.Color(0x3a0c0c), C_END = new THREE.Color(0x120c1c);
function updateSky(dt) {
  if (G.dim === 'end' && G.state !== 'title') {
    G.sky.visible = false; G.clouds.visible = false;
    G.scene.background = C_END;
    G.scene.fog.color.copy(C_END);
    G.scene.fog.near = G.fogNear * 0.6; G.scene.fog.far = G.fogFar * 1.1;
    for (const k of ['opaque', 'trans', 'item', 'held']) G.mats[k].color.setScalar(0.85);
    G.ambient.intensity = 0.8; G.sunLight.intensity = 0.15;
    return;
  }
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
G.spawnDrop = (id, count, x, y, z, vel, opts) => {
  const d = new ItemDrop(id, count, x, y, z, vel, opts && opts.did ? opts.did : Net.newId(), opts && cleanEnch(opts.e), opts && cleanName(opts.n));
  G.drops.push(d);
  if (!(opts && opts.remote)) Net.dropAdded(d); // everyone in the world sees the same items on the ground
  return d;
};
G.spawnProjectile = (kind, pos, vel, owner) => { G.projectiles.push(new Projectile(kind, pos, vel, owner)); };
G.primeTNT = (x, y, z, fuse) => { G.tnts.push(new PrimedTNT(x + 0.5, y, z + 0.5, fuse)); };

/* how much of a body (feet, middle, head) the blast can see: 0 behind a wall, 1 in the open */
function blastExposure(x, y, z, px, py, pz) {
  let seen = 0;
  for (const h of [0.2, 0.9, 1.6]) {
    const dx = px - x, dy = py + h - y, dz = pz - z, d = Math.hypot(dx, dy, dz);
    if (d < 0.6) { seen++; continue; }
    const hit = G.world.raycast(x, y, z, dx / d, dy / d, dz / d, d, false);
    // the block the blast starts in doesn't count as a wall
    if (!hit || !DEFS[hit.id].solid || !DEFS[hit.id].opaque || hit.dist >= d - 0.4 || hit.dist < 0.75) seen++;
  }
  return seen / 3;
}

G.explode = (x, y, z, power, breakBlocks, harmless, colors, cause, opts) => {
  const remote = !!(opts && opts.remote);
  if (!remote && !harmless) Net.blast(x, y, z, power, cause);
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
  if (dp < R) {
    // like Minecraft: the closer you are the much harder it hits, and walls between you and the blast protect you
    const f = 1 - dp / R, seen = blastExposure(x, y, z, P.pos.x, P.pos.y, P.pos.z);
    const dmg = Math.round((f * f + f) / 2 * power * 5 * seen);
    if (dmg > 0) { P.hurt(dmg, c, f * 16 * seen, true, cause || 'You were caught in an explosion.'); P.vel.y += f * 6 * seen; }
  }
  if (dp < R * 3) G.shake = Math.max(G.shake, 1 - dp / (R * 3));
  if (remote) return; // whoever's screen it happened on looks after the mobs
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
  if (G.dim !== 'overworld') {
    G.world.setBlock(b.x, b.y, b.z, 0);
    G.ui.message('Beds explode outside the Overworld!', 'purple');
    G.explode(b.x + 0.5, b.y + 0.5, b.z + 0.5, 4, true, false, null, 'Your bed exploded. Beds blow up in the Nether.');
    return;
  }
  P.spawn.set(b.x + 0.5, b.y + 1, b.z + 0.5);
  if (!G.isNight()) { G.ui.message('Respawn point set. You can only sleep at night.'); return; }
  const near = G.mobs.some(m => !m.dead && m.T.hostile && m.pos.distanceTo(P.pos) < 10);
  if (near) { G.ui.message('Respawn point set, but you can\'t sleep now: there are monsters nearby.'); return; }
  // find both halves of the bed: the foot (where you sleep from) and the head
  const W = G.world;
  let foot = { x: b.x, y: b.y, z: b.z }, head = null;
  const bd = DEFS[W.getBlock(b.x, b.y, b.z)];
  if (bd.bedDir) {
    // a bed that knows its direction: no mixing up with a bed next to it
    const [dx, dz] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[bd.bedDir];
    if (bd.bedPart === 'head') foot = { x: b.x - dx, y: b.y, z: b.z - dz };
    head = { x: foot.x + dx, y: foot.y, z: foot.z + dz };
  } else {
    const other = W.getBlock(b.x, b.y, b.z) === ID.bed ? ID.bed_head : ID.bed;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (W.getBlock(b.x + dx, b.y, b.z + dz) === other) { head = { x: b.x + dx, y: b.y, z: b.z + dz }; break; }
    if (other === ID.bed && head) { const t = foot; foot = head; head = t; }
  }
  // one sleeper per bed
  const taken = Net.bedTaken(foot);
  if (taken) { G.ui.message(taken + ' is already sleeping in this bed.', 'purple'); return; }
  // lie down on the bed; the night only ends once everyone in the world is in bed
  P.sleeping = { x: foot.x, y: foot.y, z: foot.z, t: 0, from: P.pos.clone() };
  // lie along the bed: your head on the pillow, looking down the bed towards your feet
  const hx = head ? head.x * 0.8 + foot.x * 0.2 : foot.x, hz = head ? head.z * 0.8 + foot.z * 0.2 : foot.z;
  P.pos.set(hx + 0.5, foot.y + 0.5625, hz + 0.5);
  if (head) P.yaw = Math.atan2(-(head.x - foot.x), -(head.z - foot.z)) + Math.PI; // head on the pillow, looking toward the foot
  P.pitch = 0.35;
  P.vel.set(0, 0, 0);
  $('sleep-wait').hidden = false;
  G.unlock(); // free the mouse so 'Leave bed' can be clicked
  G.sleepTick(0);
};

const NO_INPUT = { moveX: 0, moveZ: 0 };
G.wake = (msg) => {
  const P = G.player;
  if (!P.sleeping) return;
  // stand up next to the bed
  const s = P.sleeping, W = G.world;
  P.sleeping = null;
  let spot = null;
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
    const x = s.x + dx, z = s.z + dz;
    if ((dx || dz) && !W.collides(x + 0.5, s.y, z + 0.5, P.w, P.h) && W.isSolid(x, s.y - 1, z)) { spot = [x + 0.5, s.y, z + 0.5]; break; }
  }
  if (spot) P.pos.set(spot[0], spot[1], spot[2]); else if (s.from) P.pos.copy(s.from);
  P.pitch = 0;
  $('sleep-wait').hidden = true;
  $('fx-sleep').classList.remove('on', 'half');
  if (msg) G.ui.message(msg, 'gold');
};
G.sleepTick = (dt) => {
  const P = G.player;
  if (!P.sleeping) return;
  const under = G.world.getBlock(P.sleeping.x, P.sleeping.y, P.sleeping.z);
  if (P.dead || G.dim !== 'overworld' || !(under === ID.bed || DEFS[under].bedPart === 'foot')) return G.wake(); // the bed is gone
  if (!G.isNight()) return G.wake('Good morning!');
  if (Input.jump) return G.wake();
  const waiting = Net.notSleeping();
  const fx = $('fx-sleep');
  if (waiting.length) {
    P.sleeping.t = 0;
    fx.classList.add('half'); fx.classList.remove('on');
    $('sleep-text').textContent = 'Sleeping... waiting for ' + waiting.join(' and ') + ' to get in bed.';
  } else {
    P.sleeping.t += dt;
    fx.classList.add('on'); fx.classList.remove('half');
    $('sleep-text').textContent = 'Sleeping...';
    if (P.sleeping.t > 1.6) {
      G.time = 0.02; G.timeEventAt = Date.now();
      G.wake('Everyone slept through the night. Good morning!');
      G.save();
    }
  }
};

/* a pumpkin placed on a T of four iron blocks comes alive as an iron golem */
G.tryBuildGolem = (x, y, z) => {
  const W = G.world;
  if (W.getBlock(x, y - 1, z) !== ID.iron_block || W.getBlock(x, y - 2, z) !== ID.iron_block) return false;
  for (const [ax, az] of [[1, 0], [0, 1]]) {
    if (W.getBlock(x + ax, y - 1, z + az) === ID.iron_block && W.getBlock(x - ax, y - 1, z - az) === ID.iron_block) {
      for (const [bx, by, bz] of [[x, y, z], [x, y - 1, z], [x, y - 2, z], [x + ax, y - 1, z + az], [x - ax, y - 1, z - az]]) {
        W.setBlock(bx, by, bz, 0);
        G.particles.blockBreak(bx, by, bz, ID.iron_block);
      }
      spawnMob('iron_golem', x + 0.5, y - 2, z + 0.5);
      G.ui.message('You built an Iron Golem! It will protect you from monsters.', 'gold');
      Sound.play('golem');
      return true;
    }
  }
  return false;
};

/* open or close a door (both halves) or a trapdoor */
G.toggleDoor = (x, y, z) => {
  const W = G.world, d = DEFS[W.getBlock(x, y, z)];
  const st = d.gate || d.trapdoor || d.door, p = st && st.wood ? st.wood + '_' : ''; // oak has no wood name
  if (d.gate) {
    W.setBlock(x, y, z, ID[p + 'gate_' + d.gate.ax + (d.gate.open ? 'c' : 'o')]);
  } else if (d.trapdoor) {
    W.setBlock(x, y, z, ID[p + 'trapdoor_' + d.trapdoor.ax + (d.trapdoor.open ? 'c' : 'o')]);
  } else if (d.door) {
    const op = d.door.open ? 'c' : 'o', ly = d.door.half === 'lower' ? y : y - 1, hg = d.door.hinge ? '_r' : '';
    W.setBlock(x, ly, z, ID[p + 'door_' + d.door.ax + op + hg + '_lower']);
    if (DEFS[W.getBlock(x, ly + 1, z)].door) W.setBlock(x, ly + 1, z, ID[p + 'door_' + d.door.ax + op + hg + '_upper']);
    // a double door: its partner beside it (hinged the other way) opens and closes with it
    if (!G.togglingPair) {
      const s = d.door.hinge ? -1 : 1, px = d.door.ax === 'x' ? x + s : x, pz = d.door.ax === 'z' ? z + s : z, pd = DEFS[W.getBlock(px, ly, pz)].door;
      if (pd && pd.ax === d.door.ax && !!pd.hinge !== !!d.door.hinge && pd.open === d.door.open) { G.togglingPair = true; G.toggleDoor(px, ly, pz); G.togglingPair = false; return; }
    }
  }
  Sound.play('click', new THREE.Vector3(x, y, z));
};

/* ---------- power: levers, buttons and pressure plates ----------
   A switch powers the blocks right next to it and right next to the block it sits on (like Minecraft
   without redstone dust). Powered doors, trapdoors and fence gates open (and close again when the power
   stops); powered TNT lights. */
const SUPPORT = { d: [0, -1, 0], n: [0, 0, -1], s: [0, 0, 1], w: [-1, 0, 0], e: [1, 0, 0] };
const NB6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
G.powered = new Map(); // switches that are on right now: key -> list of the places they power
function powerTargets(x, y, z, d) {
  const [sx, sy, sz] = SUPPORT[d] || SUPPORT.d, out = new Map();
  for (const [bx, by, bz] of [[x, y, z], [x + sx, y + sy, z + sz]]) for (const [a, b, c] of NB6) { const k = (bx + a) + ',' + (by + b) + ',' + (bz + c); out.set(k, [bx + a, by + b, bz + c]); }
  return [...out.values()];
}
const isOpener = def => def && (def.door || def.trapdoor || def.gate);
const isOpen = def => !!((def.door || def.trapdoor || def.gate).open);
G.setPower = (x, y, z, d, on) => {
  const W = G.world, key = G.dim + ':' + x + ',' + y + ',' + z, ts = powerTargets(x, y, z, d);
  if (on) G.powered.set(key, ts); else G.powered.delete(key);
  const stillPowered = (px, py, pz) => { for (const [k, list] of G.powered) if (k.startsWith(G.dim + ':') && list.some(t => t[0] === px && t[1] === py && t[2] === pz)) return true; return false; };
  for (const [px, py, pz] of ts) {
    const id = W.getBlock(px, py, pz), def = DEFS[id];
    if (on && id === ID.tnt) { W.setBlock(px, py, pz, 0); G.primeTNT(px, py, pz, 4); continue; }
    if (!isOpener(def)) continue;
    if (on && !isOpen(def)) G.toggleDoor(px, py, pz);
    else if (!on && isOpen(def) && !stillPowered(px, py, pz)) {
      // a door's other half may still be powered by something else
      const oy = def.door ? (def.door.half === 'lower' ? py + 1 : py - 1) : null;
      if (oy === null || !stillPowered(px, oy, pz)) G.toggleDoor(px, py, pz);
    }
  }
};
/* tap a lever to flip it; tap a button to press it for a moment */
G.useSwitch = (x, y, z) => {
  const W = G.world, def = DEFS[W.getBlock(x, y, z)];
  if (def.lever) {
    const on = !def.lever.on;
    W.setBlock(x, y, z, ID['lever_' + def.lever.d + '_' + (on ? 1 : 0)]);
    Sound.play('click', new THREE.Vector3(x, y, z));
    G.setPower(x, y, z, def.lever.d, on);
  } else if (def.button && !def.button.on) {
    const b = def.button;
    W.setBlock(x, y, z, ID[b.kind + '_button_' + b.d + '_1']);
    Sound.play('click', new THREE.Vector3(x, y, z));
    G.setPower(x, y, z, b.d, true);
    const dim = G.dim;
    setTimeout(() => {
      if (G.dim !== dim) return;
      const cur = DEFS[G.world.getBlock(x, y, z)];
      if (cur && cur.button && cur.button.on) { G.world.setBlock(x, y, z, ID[b.kind + '_button_' + b.d + '_0']); Sound.play('click', new THREE.Vector3(x, y, z)); }
      G.setPower(x, y, z, b.d, false);
    }, b.kind === 'oak' ? 1500 : 1000);
  }
};
/* a switch was broken while on: its power stops */
G.switchGone = (x, y, z, def) => {
  if ((def.lever && def.lever.on) || (def.button && def.button.on)) G.setPower(x, y, z, (def.lever || def.button).d, false);
  if (def.plate && def.plate.on) { G.setPower(x, y, z, 'd', false); delete G.downPlates[G.dim + ':' + x + ',' + y + ',' + z]; }
};
/* pressure plates: pushed down while a player or mob stands on them (wooden ones by dropped items too) */
G.downPlates = {};
G.tickPlates = () => {
  const W = G.world, now = performance.now(), bodies = [];
  if (!G.player.dead) bodies.push([G.player.pos, false]);
  for (const m of G.mobs) if (!m.dead && !(m.T && (m.T.fly || m.T.boat))) bodies.push([m.pos, false]);
  for (const d of G.drops) bodies.push([d.pos, true]);
  for (const [p, isItem] of bodies) {
    const x = Math.floor(p.x), y = Math.floor(p.y + 0.02), z = Math.floor(p.z), id = W.getBlock(x, y, z), def = DEFS[id];
    if (!def || !def.plate || (isItem && def.plate.kind !== 'oak')) continue;
    const k = G.dim + ':' + x + ',' + y + ',' + z;
    G.downPlates[k] = now;
    if (!def.plate.on) {
      W.setBlock(x, y, z, ID[def.plate.kind + '_plate_1']);
      Sound.play('click', new THREE.Vector3(x, y, z));
      G.setPower(x, y, z, 'd', true);
    }
  }
  for (const k in G.downPlates) {
    if (!k.startsWith(G.dim + ':') || now - G.downPlates[k] < 600) continue;
    delete G.downPlates[k];
    const [x, y, z] = k.slice(k.indexOf(':') + 1).split(',').map(Number), def = DEFS[W.getBlock(x, y, z)];
    if (def && def.plate && def.plate.on) { W.setBlock(x, y, z, ID[def.plate.kind + '_plate_0']); Sound.play('click', new THREE.Vector3(x, y, z)); }
    G.setPower(x, y, z, 'd', false);
  }
};

/* signs: up to 4 short lines of writing, drawn on a little picture in front of the board */
G.signs = {}; G.signMeshes = {};
const SIGN_FACE = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0] };
G.cleanSignText = lines => (Array.isArray(lines) ? lines : []).slice(0, 4).map(t => String(t || '').replace(/[\u0000-\u001f]/g, '').slice(0, 15));
G.setSign = (x, y, z, lines, fromNet) => {
  const k = chestKey(x, y, z);
  if (lines) G.signs[k] = G.cleanSignText(lines); else delete G.signs[k];
  G.drawSign(k);
  if (!fromNet) Net.signChanged(k);
};
G.drawSign = (k) => {
  const old = G.signMeshes[k];
  if (old) { G.scene.remove(old); old.material.map.dispose(); old.material.dispose(); delete G.signMeshes[k]; }
  const lines = G.signs[k];
  if (!lines || !k.startsWith(G.dim + ':') || !lines.some(t => t)) return;
  const [x, y, z] = k.slice(G.dim.length + 1).split(',').map(Number);
  const def = DEFS[G.world.getBlock(x, y, z)];
  if (!def || !def.sign) return; // the sign block hasn't arrived yet: draw it once it does
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1208'; g.font = 'bold 26px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((t, i) => g.fillText(t, 128, 20 + i * 29));
  const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.LinearFilter;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.42), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  const { d, wall } = def.sign, f = SIGN_FACE[d];
  const cy = wall ? y + 0.5 : y + 0.75;
  // in front of the board
  const off = wall ? 0.13 : 0.07;
  const cx = x + 0.5 + (wall ? -f[0] * 0.5 : 0) + f[0] * off, cz = z + 0.5 + (wall ? -f[2] * 0.5 : 0) + f[2] * off;
  m.position.set(cx, cy, cz);
  m.rotation.y = Math.atan2(f[0], f[2]);
  G.scene.add(m); G.signMeshes[k] = m;
};
/* writing whose sign block wasn't there yet (still loading, or a friend's edit on its way) */
G.tickSigns = () => { for (const k in G.signs) if (!G.signMeshes[k] && k.startsWith(G.dim + ':')) G.drawSign(k); };
G.redrawSigns = () => { for (const k of Object.keys(G.signMeshes)) G.drawSign(k); for (const k in G.signs) G.drawSign(k); };

/* grass slowly spreads onto dirt next to it that has open air above (about two minutes) */
/* ---------- fire ---------- */
/* flint and steel on a block lights a fire on top of it (it needs something solid underneath) */
G.lightFire = (b) => {
  const W = G.world;
  let x = b.x + b.nx, y = b.y + b.ny, z = b.z + b.nz;
  const free = (a, c, d) => { const id = W.getBlock(a, c, d); return !id || (DEFS[id].replaceable && !DEFS[id].liquid); };
  const solidBelow = (a, c, d) => { const id = W.getBlock(a, c - 1, d); return id && DEFS[id].solid; };
  // fire can sit on top of a block or cling to its side (the block you lit must be solid)
  const clicked = W.getBlock(b.x, b.y, b.z), onSolid = clicked && DEFS[clicked].solid;
  if (!(free(x, y, z) && (solidBelow(x, y, z) || onSolid))) { x = b.x; y = b.y + 1; z = b.z; }
  if (!(free(x, y, z) && (solidBelow(x, y, z) || onSolid))) return false;
  W.setBlock(x, y, z, ID.fire);
  G.sound.play('fuse', new THREE.Vector3(x, y, z));
  G.fires = G.fires || {};
  G.fires[x + ',' + y + ',' + z] = 0;
  return true;
};
/* the fires in this dimension's saved changes (after loading, or changing dimension) */
G.findFires = () => {
  G.fires = {};
  for (const [k, m] of G.world.edits) {
    const [cx, cz] = k.split(',').map(Number);
    for (const [i, id] of m) if (id === ID.fire) G.fires[(cx * 16 + (i & 15)) + ',' + (i >> 8) + ',' + (cz * 16 + ((i >> 4) & 15))] = 0;
  }
};
/* what burns: wood, leaves, wool, hay and dry plants (not Nether wood, chests, crafting tables or doors) */
const FLAMMABLE = new Set();
for (const d of DEFS) if (d && d.isBlock && (/^(oak|birch|spruce|jungle|dark_oak|acacia|mangrove|cherry)_(log|planks|leaves|stairs_.|slab_.|fence)$|^mangrove_roots$|^wool_|^bookshelf$|^hay_bale$|^tall_grass$|^dead_bush$/.test(d.key))) FLAMMABLE.add(d.id);
const NEAR6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
/* fires burn out after a while (on netherrack they burn forever). With Fire Spreads on, fire next to
   wood, leaves or wool jumps to the spaces around them and slowly burns those blocks away. */
G.tickFires = () => {
  const W = G.world;
  G.fires = G.fires || {};
  if (Net.inShared() && !Net.isHost()) return; // in a shared world the first player's game looks after fire (and tells everyone)
  const spread = !G.noFireSpread, newFires = [];
  let count = 0;
  for (const k in G.fires) {
    const [x, y, z] = k.split(',').map(Number);
    if (!W.isLoaded(x, z)) continue;
    if (W.getBlock(x, y, z) !== ID.fire) { delete G.fires[k]; continue; }
    count++;
    const below = W.getBlock(x, y - 1, z);
    const fuel = NEAR6.filter(([dx, dy, dz]) => FLAMMABLE.has(W.getBlock(x + dx, y + dy, z + dz)));
    // fire needs something to hold on to: a solid block under it or beside it (or something burning)
    if (!NEAR6.some(([dx, dy, dz]) => { const n = W.getBlock(x + dx, y + dy, z + dz); return n && DEFS[n].solid; }) && !fuel.length) { W.setBlock(x, y, z, 0); delete G.fires[k]; continue; }
    if (below === ID.netherrack) continue;
    if (spread && fuel.length) {
      // the fire eats into the wood next to it, and jumps to empty spaces beside burning things
      for (const [dx, dy, dz] of fuel) {
        const bx = x + dx, by = y + dy, bz = z + dz;
        // flames climb faster than they creep sideways or down
        for (const [ex, ey, ez] of NEAR6) if (Math.random() < (ey === 1 ? 0.25 : 0.1)) {
          const tx = bx + ex, ty = by + ey, tz = bz + ez;
          if (!W.getBlock(tx, ty, tz) && ty > 0 && ty < WH - 1) newFires.push([tx, ty, tz]);
        }
        if (Math.random() < 0.06) { W.setBlock(bx, by, bz, Math.random() < 0.7 ? ID.fire : 0); if (W.getBlock(bx, by, bz) === ID.fire) G.fires[bx + ',' + by + ',' + bz] = 0; }
      }
      G.fires[k] = Math.max(0, G.fires[k] - 0.5); // it keeps going while it has something to burn
    }
    G.fires[k]++;
    if (G.fires[k] > 25 + Math.random() * 20) { W.setBlock(x, y, z, 0); delete G.fires[k]; }
  }
  for (const [x, y, z] of newFires) {
    if (count > 250) break; // a big blaze stays a reasonable size
    if (W.getBlock(x, y, z)) continue;
    W.setBlock(x, y, z, ID.fire); G.fires[x + ',' + y + ',' + z] = 0; count++;
  }
  if (Math.random() < 0.3) for (const k in G.fires) { const [x, y, z] = k.split(',').map(Number); G.particles.burst(x + 0.5, y + 0.5, z + 0.5, [0x555555, 0x333333], 1, 0.6, 0.15, -1); }
};

/* ---------- your flag ---------- */
G.placedFlag = (x, y, z) => {
  const old = G.myFlag;
  if (old && !(old.dim === G.dim && old.x === x && old.y === y && old.z === z)) {
    // only one flag each: the old one comes down and goes back in your inventory
    const W = G.worlds[old.dim];
    if (W) {
      if (W === G.world && W.isLoaded(old.x, old.z)) { if (W.getBlock(old.x, old.y, old.z) === ID.flag) W.setBlock(old.x, old.y, old.z, 0); }
      else { const m = W.edits.get(W.key(old.x >> 4, old.z >> 4)), i = (old.x & 15) + ((old.z & 15) << 4) + (old.y << 8); if (m && m.get(i) === ID.flag) m.set(i, 0); }
    }
    G.player.inv.add(ID.flag, 1); G.player.inv.changed();
    G.ui.message('Your old flag came down and went back in your inventory: you can have one flag at a time.');
  }
  G.myFlag = { dim: G.dim, x, y, z };
  G.ui.message('Flag placed! Tap "Show flag" (top right) to find your way back to it.', 'gold');
  G.save();
};

G.tickGrass = () => {
  const P = G.player, W = G.world;
  if (G.dim !== 'overworld') return;
  G.grassT = G.grassT || {};
  const now = performance.now(), px = Math.floor(P.pos.x), pz = Math.floor(P.pos.z), seen = {};
  for (let dz = -20; dz <= 20; dz++) for (let dx = -20; dx <= 20; dx++) {
    const x = px + dx, z = pz + dz;
    if (!W.isLoaded(x, z)) continue;
    const y = W.surfaceY(x, z);
    if (W.getBlock(x, y, z) !== ID.dirt) continue;
    const above = W.getBlock(x, y + 1, z);
    if (above && DEFS[above].opaque) continue;
    let near = false;
    for (let oy = -1; oy <= 1 && !near; oy++) for (let oz = -1; oz <= 1 && !near; oz++) for (let ox = -1; ox <= 1 && !near; ox++) if ((ox || oz) && W.getBlock(x + ox, y + oy, z + oz) === ID.grass) near = true;
    if (!near) continue;
    const k = x + ',' + y + ',' + z;
    seen[k] = true;
    if (!G.grassT[k]) G.grassT[k] = now + 100000 + Math.random() * 40000;
    else if (now >= G.grassT[k]) { W.setBlock(x, y, z, ID.grass); delete G.grassT[k]; }
  }
  for (const k in G.grassT) if (!seen[k]) delete G.grassT[k];
};

/* a sapling grows into a tree, if there is room above it */
G.growTree = (x, y, z, kind) => {
  const W = G.world, need = kind === 'spruce' ? 9 : kind === 'jungle' ? 14 : kind === 'dark_oak' ? 9 : kind === 'acacia' ? 9 : kind === 'mangrove' ? 12 : kind === 'cherry' ? 9 : 7;
  for (let dy = 1; dy <= need; dy++) { const id = W.getBlock(x, y + dy, z); if (id && !DEFS[id].leaves) return false; }
  const set = (a, b, c, id) => W.setBlock(a, b, c, id), get = (a, b, c) => W.getBlock(a, b, c);
  if (kind === 'spruce') W.spruceTree(set, get, x, y, z, Math.random);
  else if (kind === 'birch') W.oakTree(set, get, x, y, z, Math.random, ID.birch_log, ID.birch_leaves, 5);
  else if (kind === 'jungle') W.jungleTree(set, get, x, y, z, Math.random);
  else if (kind === 'dark_oak') W.darkOakTree(set, get, x, y, z, Math.random);
  else if (kind === 'acacia') W.acaciaTree(set, get, x, y, z, Math.random);
  else if (kind === 'mangrove') W.mangroveTree(set, get, x, y, z, Math.random);
  else if (kind === 'cherry') W.cherryTree(set, get, x, y, z, Math.random);
  else W.oakTree(set, get, x, y, z, Math.random, ID.oak_log, ID.oak_leaves, 4);
  return true;
};

/* crops: planted seeds grow into ripe wheat after a few minutes (only while their area is loaded) */
const CROP_TIME = 300; // five minutes from planting to ripe
const SAPLING_TIME = 180; // saplings: three minutes at most
const RIPE = () => ({ [ID.wheat_sprout]: ID.wheat_crop, [ID.carrot_sprout]: ID.carrot_crop, [ID.potato_sprout]: ID.potato_crop, [ID.pumpkin_stem]: ID.pumpkin });
G.plantCrop = (x, y, z) => { G.crops = G.crops || {}; G.crops[chestKey(x, y, z)] = CROP_TIME; };
G.waterNear = (x, y, z) => {
  const W = G.world;
  for (let dy = 0; dy <= 1; dy++) for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) if (W.getBlock(x + dx, y + dy, z + dz) === ID.water) return true;
  return false;
};
G.tickCrops = () => {
  if (!G.crops) return;
  const pre = G.dim + ':';
  for (const k in G.crops) {
    if (!k.startsWith(pre)) continue;
    const [x, y, z] = k.slice(pre.length).split(',').map(Number);
    if (!G.world.isLoaded(x, z)) continue;
    const here = G.world.getBlock(x, y, z), sap = DEFS[here].sapling, ripe = RIPE()[here];
    // planted bamboo grows one block every minute or so, up to 12 tall; sugar cane up to 3
    if (here === ID.bamboo || here === ID.sugar_cane) {
      let t = typeof G.crops[k] === 'number' && G.crops[k] <= 90 ? G.crops[k] : 40 + Math.random() * 40;
      if (--t > 0) { G.crops[k] = t; continue; }
      delete G.crops[k];
      let base = y; while (G.world.getBlock(x, base - 1, z) === here) base--;
      if (y - base + 1 < (here === ID.bamboo ? 12 : 3) && y + 1 < WH && !G.world.getBlock(x, y + 1, z)) { G.world.setBlock(x, y + 1, z, here); G.crops[chestKey(x, y + 1, z)] = 40 + Math.random() * 40; }
      continue;
    }
    if (!ripe && !sap) { delete G.crops[k]; continue; }
    // saplings grow into a tree within 3 minutes (between 2 and 3); with no room above they try again every 10 seconds
    if (sap) {
      let t = typeof G.crops[k] === 'number' ? G.crops[k] : SAPLING_TIME;
      if (t > SAPLING_TIME) t = 120 + Math.random() * 60;
      t -= 1;
      if (t <= 0) { if (G.growTree(x, y, z, sap)) { delete G.crops[k]; continue; } t = 10; }
      G.crops[k] = t;
      continue;
    }
    // crops count down while their area is loaded (one tick a second)
    G.crops[k] = (typeof G.crops[k] === 'number' && G.crops[k] > 1 ? G.crops[k] : 1) - 1;
    if (G.crops[k] <= 0) {
      if (here === ID.pumpkin_stem) {
        // a pumpkin grows on an empty spot beside the stem; the stem stays and grows another later
        const W = G.world, spots = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => !W.getBlock(x + dx, y, z + dz) && [ID.grass, ID.dirt, ID.farmland].includes(W.getBlock(x + dx, y - 1, z + dz)));
        if (spots.length) { const [dx, dz] = spots[(Math.random() * spots.length) | 0]; W.setBlock(x + dx, y, z + dz, ID.pumpkin); }
        G.crops[k] = CROP_TIME;
      } else { G.world.setBlock(x, y, z, ripe); delete G.crops[k]; }
    }
  }
};

/* chests keep 27 slots each. A treasure chest from a structure gets its loot the first time it is
   opened (it is put inside, ready to take out), then it is an ordinary chest. */
const chestKey = (x, y, z) => G.dim + ':' + x + ',' + y + ',' + z;
/* which structure a treasure chest belongs to, so it gets that structure's kind of loot */
G.chestKind = (x, y, z) => {
  const W = G.world;
  let shelves = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
    const b = W.getBlock(x + dx, y + dy, z + dz);
    if (b === ID.spawner) return 'dungeon';
    if (b === ID.bookshelf) shelves++;
  }
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
  // a village building: what is in the room says whose chest it is
  if (G.dim === 'overworld' && y > SEA - 3 && W.villageAt && W.villageAt(cx, cz)) {
    const n = {};
    for (let dy = -1; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const b = W.getBlock(x + dx, y + dy, z + dz); n[b] = (n[b] || 0) + 1; }
    if (n[ID.lava]) return 'v_blacksmith';
    if (n[ID.hay_bale] >= 2 && n[ID.furnace]) return 'v_butcher';
    if (n[ID.furnace] && (n[ID.crafting_table] || n[ID.iron_block])) return 'v_toolsmith';
    if (n[ID.stone_bricks] >= 12) return 'v_temple';
    return 'v_house';
  }
  if (shelves >= 4) return 'library';
  if (G.dim === 'nether') return 'ruined_portal';
  if (G.dim === 'end') return 'library';
  if (W.regionPick) {
    if (W.pyramidChunk(cx, cz)) return 'desert';
    if (W.spotPick && W.spotPick(cx, cz, 'jungleTemple')) return 'jungle';
    if (W.spotPick && W.spotPick(cx, cz, 'ruins')) return 'ruins';
    if (W.spotPick && W.spotPick(cx, cz, 'outpost')) return 'outpost';
    if (W.regionPick(cx, cz, 'igloo')) return 'igloo';
    if (W.regionPick(cx, cz, 'shipwreck')) return 'shipwreck';
    if (W.regionPick(cx, cz, 'ruinedPortal')) return 'ruined_portal';
  }
  return W.mineshaftAt && W.mineshaftAt(cx, cz) ? 'mineshaft' : 'dungeon';
};
G.chestSlots = (x, y, z, create) => {
  G.chests = G.chests || {};
  const k = chestKey(x, y, z);
  if (!G.chests[k] && create) G.chests[k] = new Array(27).fill(null);
  return G.chests[k] || null;
};
/* chests are shared in multiplayer: every change bumps the chest's version and is sent to the others */
G.chestKey = chestKey;
G.chestChanged = (k) => {
  G.chestVer = G.chestVer || {};
  G.chestVer[k] = (G.chestVer[k] || 0) + 1;
  Net.chestChanged(k);
};
G.openChest = (x, y, z) => {
  const W = G.world, id = W.getBlock(x, y, z), key = chestKey(x, y, z);
  // one player at a time, so nobody can take the same item twice
  const busy = Net.chestUser(key);
  if (busy) { G.ui.message(busy + ' is using this chest. Wait until they close it.', 'purple'); return; }
  const slots = G.chestSlots(x, y, z, true);
  if (id === ID.chest_loot) {
    W.setBlock(x, y, z, ID.chest);
    const rng = mulberry32(hash3(x, y * 31 + z, G.seed + 77)); // same treasure for everyone in this world
    const free = [...Array(27).keys()];
    for (const [it, n] of rollLoot(rng, G.chestKind(x, y, z))) {
      const at = free.splice((rng() * free.length) | 0, 1)[0];
      if (at !== undefined) slots[at] = { id: it, count: n };
    }
    G.particles.burst(x + 0.5, y + 1, z + 0.5, [0xf5cc2e, 0xffffff, 0xfff3a0], 16, 2.5, 0.12);
    Sound.play('levelup');
    G.chestChanged(key);
  } else Sound.play('click');
  G.ui.openInventory('chest', { slots, x, y, z });
};
/* furnaces: [thing to smelt, fuel, result], burning and cooking timers, and XP waiting for whoever takes the result */
G.furnaceAt = (x, y, z, create) => {
  G.furnaces = G.furnaces || {};
  const k = chestKey(x, y, z);
  if (!G.furnaces[k] && create) G.furnaces[k] = { slots: [null, null, null], burn: 0, burnMax: 0, cook: 0, xp: 0 };
  return G.furnaces[k] || null;
};
G.openFurnace = (x, y, z) => {
  const f = G.furnaceAt(x, y, z, true);
  G.ui.openInventory('furnace', null, Object.assign(f, { x, y, z }));
};
G.breakFurnace = (x, y, z) => {
  const f = G.furnaceAt(x, y, z, false);
  if (f) for (const s of f.slots) if (s) G.spawnDrop(s.id, s.count, x + 0.5, y + 0.6, z + 0.5);
  if (G.furnaces) { delete G.furnaces[chestKey(x, y, z)]; G.furnaceChanged(chestKey(x, y, z), true); }
};
/* a furnace changed: tell the others in a shared world (the first player's game runs the furnaces;
   an edit made by someone else goes to that game, which shares the result with everyone) */
G.furnaceChanged = (k, byHand) => {
  G.furnVer = G.furnVer || {};
  if (!byHand || !Net.inShared() || Net.isHost()) G.furnVer[k] = (G.furnVer[k] || 0) + 1;
  Net.furnaceChanged(k, byHand);
};
function furnaceCanSmelt(f) {
  const [inp, , out] = f.slots, r = inp && SMELT[inp.id];
  return !!r && (!out || (out.id === r[0] && out.count + r[1] <= DEFS[out.id].stack));
}
/* furnaces keep working while you do other things, as long as they are in the loaded world */
G.tickFurnaces = (dt) => {
  if (!G.furnaces) return;
  // in a shared world only the first player's game runs furnaces; the others show what it shares
  if (Net.inShared() && !Net.isHost()) { if (G.ui.furnace) G.ui.renderFurnace(); return; }
  const pre = G.dim + ':';
  const shareNow = Date.now() - (G.furnShareAt || 0) > 1000;
  if (shareNow) G.furnShareAt = Date.now();
  for (const k in G.furnaces) {
    if (!k.startsWith(pre)) continue;
    const f = G.furnaces[k];
    const [x, y, z] = k.slice(pre.length).split(',').map(Number);
    if (!G.world.isLoaded(x, z)) continue;
    if (G.world.getBlock(x, y, z) !== ID.furnace) { delete G.furnaces[k]; continue; }
    const can = furnaceCanSmelt(f);
    if (f.burn <= 0 && can && f.slots[1] && FUEL[f.slots[1].id]) {
      G.furnaceChanged(k);
      f.burn = f.burnMax = FUEL[f.slots[1].id];
      if (f.slots[1].id === ID.lava_bucket) f.slots[1] = { id: ID.bucket, count: 1 };
      else if (--f.slots[1].count <= 0) f.slots[1] = null;
    }
    // the fire only burns while something is smelting: with nothing left to smelt it waits, so no fuel is wasted
    if (f.burn > 0 && can) {
      f.burn = Math.max(0, f.burn - dt);
      {
        f.cook += dt;
        if (f.cook >= SMELT_TIME) {
          f.cook = 0;
          const [outId, n, xp] = SMELT[f.slots[0].id];
          if (--f.slots[0].count <= 0) f.slots[0] = null;
          if (f.slots[2]) f.slots[2].count += n; else f.slots[2] = { id: outId, count: n };
          f.xp += xp;
          G.furnaceChanged(k);
          if (G.player.pos.distanceTo(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5)) < 16) Sound.play('smelt');
        }
      }
      if (shareNow && Net.inShared()) G.furnaceChanged(k); // the fire and the arrow move for everyone
      if (Math.random() < dt * 3) G.particles.burst(x + 0.5, y + 0.4, z + 0.5, [0xff9a20, 0xffd060, 0x707070], 2, 0.4, 0.08, 1);
    } else if (f.cook > 0) f.cook = Math.max(0, f.cook - dt * 2);
  }
  if (G.ui.furnace) G.ui.renderFurnace();
};

/* a chest that is broken spills what is inside */
G.breakChest = (x, y, z, wasLoot) => {
  let slots = G.chestSlots(x, y, z, false);
  if (!slots && wasLoot) slots = rollLoot(mulberry32(hash3(x, y * 31 + z, G.seed + 77)), G.chestKind(x, y, z)).map(([id, count]) => ({ id, count }));
  if (slots) for (const s of slots) if (s) G.spawnDrop(s.id, s.count, x + 0.5, y + 0.6, z + 0.5, undefined, slotExtras(s));
  if (G.chests && G.chests[chestKey(x, y, z)]) { delete G.chests[chestKey(x, y, z)]; G.chestChanged(chestKey(x, y, z)); }
};

/* dragons live only in the End: once the Ender Dragon is beaten, a dragon egg (or the button) calls another one */
G.summonDragon = (kind) => {
  if (G.dim !== 'end') { G.ui.message('Dragons only live in the End. Find a stronghold, fill the portal with Eyes of Ender and jump in.', 'purple'); return false; }
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
/* ropes: a sagging line from each animal on a rope to the player holding it or the fence it's tied to */
const ropeLines = [];
function drawRopes() {
  let n = 0;
  const P = G.player;
  for (const m of G.mobs) {
    if (!m.leash || m.dead || m.remoteCtl) continue;
    const t = m.leash === 'player' ? { x: P.pos.x, y: P.pos.y + 1.0, z: P.pos.z } : { x: m.leash.x + 0.5, y: m.leash.y + 0.75, z: m.leash.z + 0.5 };
    let line = ropeLines[n];
    if (!line) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
      line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x9a7a4a }));
      line.frustumCulled = false; G.scene.add(line); ropeLines[n] = line;
    }
    const a = line.geometry.attributes.position, sx = m.pos.x, sy = m.pos.y + m.h * 0.75, sz = m.pos.z;
    const len = Math.hypot(t.x - sx, t.y - sy, t.z - sz), sag = Math.max(0, 3.5 - len) * 0.25 + 0.15;
    for (let i = 0; i < 10; i++) {
      const k = i / 9;
      a.setXYZ(i, sx + (t.x - sx) * k, sy + (t.y - sy) * k - Math.sin(k * Math.PI) * sag, sz + (t.z - sz) * k);
    }
    a.needsUpdate = true; line.visible = true; n++;
  }
  for (let i = n; i < ropeLines.length; i++) ropeLines[i].visible = false;
}

/* is there light from a torch, lantern, glowstone, fire...? (monsters don't appear in it) */
G.lightNear = (x, y, z) => {
  const W = G.world, cx = x >> 4, cz = z >> 4;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = W.chunks.get(W.key(cx + dx, cz + dz));
    if (!c) continue;
    for (const L of W.emitters(c)) {
      const lx = (cx + dx) * 16 + L[0], lz = (cz + dz) * 16 + L[2];
      if (Math.abs(lx - x) + Math.abs(L[1] - y) + Math.abs(lz - z) < L[3]) return true;
    }
  }
  return false;
};

/* mobs take up space: two that overlap are pushed apart (only along the ground, and never into a wall) */
function separateMobs() {
  const W = G.world, grid = new Map(), live = [];
  for (const m of G.mobs) {
    if (m.dead || m.removed || m.rider) continue;
    live.push(m);
    const k = Math.floor(m.pos.x / 2) + ',' + Math.floor(m.pos.z / 2);
    let cell = grid.get(k);
    if (!cell) grid.set(k, cell = []);
    cell.push(m);
  }
  const push = (m, dx, dz) => {
    if (m.remoteCtl) return; // someone else's game moves it
    const nx = m.pos.x + dx, nz = m.pos.z + dz;
    W.mobMode = true;
    if (!W.collides(nx, m.pos.y, m.pos.z, m.w, m.h)) m.pos.x = nx;
    if (!W.collides(m.pos.x, m.pos.y, nz, m.w, m.h)) m.pos.z = nz;
    W.mobMode = false;
  };
  for (const a of live) {
    const gx = Math.floor(a.pos.x / 2), gz = Math.floor(a.pos.z / 2);
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const cell = grid.get((gx + ox) + ',' + (gz + oz));
      if (!cell) continue;
      for (const b of cell) {
        if (b === a || (a.remoteCtl && b.remoteCtl)) continue;
        if (a.nid > b.nid) continue; // each pair once
        const minD = (a.w + b.w) / 2;
        if (a.pos.y + a.h <= b.pos.y || b.pos.y + b.h <= a.pos.y) continue; // one is standing on the other
        let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        let d = Math.hypot(dx, dz);
        if (d >= minD) continue;
        if (d < 1e-4) { const ang = Math.random() * Math.PI * 2; dx = Math.cos(ang); dz = Math.sin(ang); d = 1; }
        const over = (minD - Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z)) * 0.3; // a gentle shove each frame
        const ux = dx / d, uz = dz / d;
        // a puppet can't be moved here, so the other one moves the whole way
        const fa = b.remoteCtl ? 2 : 1, fb = a.remoteCtl ? 2 : 1;
        push(a, -ux * over * fa, -uz * over * fa);
        push(b, ux * over * fb, uz * over * fb);
      }
    }
  }
}

function spawnMob(type, x, y, z) {
  const m = new Mob(type, x, y, z);
  G.mobs.push(m);
  return m;
}
function spawnTick() {
  const P = G.player, W = G.world;
  // in multiplayer only the host runs wild mobs; everyone else shows the host's
  if (!Net.isHost()) {
    for (const m of G.mobs) if (!m.remoteCtl && !m.tame && !m.rider && !m.dead && !m.claimed && !m.T.boat && !m.leash) {
      if (m.penned) (G.guestPens = G.guestPens || []).push(serializeMob(m)); // ours: kept in the save
      m.removeSilently();
    }
    return;
  }
  // back in charge of our own animals
  if (G.guestPens && G.guestPens.length) { G.pendingPets = (G.pendingPets || []).concat(G.guestPens); G.guestPens = []; }
  // check now and then which mobs are shut in a pen
  const now = Date.now();
  let checks = 0;
  for (const m of G.mobs) {
    if (checks >= 4) break;
    if (m.dead || m.remoteCtl || m.tame || m.T.boat || now < (m.penCheckAt || 0) || !W.isLoaded(m.pos.x, m.pos.z)) continue;
    m.penCheckAt = now + 7000 + Math.random() * 3000; checks++;
    const pen = G.isPenned(m);
    if (pen !== null) m.penned = pen;
  }
  const players = [P.pos, ...Net.proxies().map(p => p.pos)];
  let hostile = 0, passive = 0;
  for (const m of G.mobs) {
    if (m.dead || m.remoteCtl) continue;
    const d = Math.min(...players.map(q => Math.hypot(m.pos.x - q.x, m.pos.z - q.z)));
    // tamed and penned mobs never vanish: far away they wait in the save until you come back
    if ((m.tame || m.penned || m.T.boat || m.leash || m.customName) && !m.rider && !W.isLoaded(m.pos.x, m.pos.z)) { G.pendingPets.push(serializeMob(m)); m.removeSilently(); continue; }
    if (m.tame || m.rider || m.penned || m.T.boat || m.leash || m.customName) continue;
    if (d > (m.T.passive ? 160 : 64) || !W.isLoaded(m.pos.x, m.pos.z)) { m.remove(); continue; }
    if (m.T.passive) passive++; else hostile++;
  }
  if (G.dim === 'nether') { netherSpawn(hostile); return; }
  if (G.dim === 'end') { endSpawn(hostile); return; }
  structureSpawns();
  // farm animals, horses and wolves: plenty of them around (monsters are counted separately)
  if (passive < 22 && Math.random() < 0.5) {
    const a = Math.random() * Math.PI * 2, r = 22 + Math.random() * 34;
    const x = Math.floor(P.pos.x + Math.cos(a) * r) + 0.5, z = Math.floor(P.pos.z + Math.sin(a) * r) + 0.5;
    if (W.isLoaded(x, z)) {
      const y = W.surfaceY(x, z);
      if (W.getBlock(Math.floor(x), y, Math.floor(z)) === ID.grass) {
        const b = W.biomeAt(x, z, W.heightAt(x, z));
        let type = pick(PASSIVE_POOL), n = 1 + (Math.random() * 3 | 0);
        if (b === BIOME.BAMBOO && Math.random() < 0.6) { type = 'panda'; n = 1 + (Math.random() * 2 | 0); }
        else if ((b === BIOME.PLAINS || b === BIOME.SAVANNA) && Math.random() < 0.35) { type = Math.random() < 0.3 ? 'donkey' : 'horse'; n = 2 + (Math.random() * 2 | 0); }
        if ((b === BIOME.FOREST || b === BIOME.TAIGA || b === BIOME.BIRCH || b === BIOME.SNOWY) && Math.random() < 0.3) { type = 'wolf'; n = 2 + (Math.random() * 2 | 0); }
        for (let i = 0; i < n; i++) spawnMob(type, x + (Math.random() - 0.5) * 2, y + 1, z + (Math.random() - 0.5) * 2);
      }
    }
  }
  const night = G.isNight();
  const dm = G.diff().mobs;
  if (dm > 0 && hostile < Math.round((night ? 9 : 4) * dm) && Math.random() < 0.4 * Math.min(1.5, dm)) {
    for (let tries = 0; tries < 4; tries++) {
      const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 20;
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
      if (G.lightNear(x, y, z)) continue; // torches, lanterns and glowstone keep monsters away
      let type = pick(HOSTILE_POOL);
      if (type === 'enderman' && (W.getBlock(x, y + 2, z))) type = 'zombie';
      if (type === 'spider' && (W.getBlock(x + 1, y, z) || W.getBlock(x - 1, y, z))) type = 'skeleton';
      spawnMob(type, x + 0.5, y, z + 0.5);
      break;
    }
  }
}

const NETHER_POOL = [['zombified_piglin', 40], ['wither_skeleton', 14], ['blaze', 16], ['ghast', 7]];
/* the End: endermen wander the island, and the dragon guards it until it is beaten */
function endSpawn(hostile) {
  const P = G.player, W = G.world;
  if (!G.endDragonDead && !G.dragons.some(d => !d.dead && d.kind === 'ender')) {
    const d = new Dragon('ender', new THREE.Vector3(0, 54, 0));
    G.dragons.push(d);
    G.ui.message('The Ender Dragon guards the End. Beat it to win!', 'purple');
    G.sound.play('dragonRoar', d.pos);
  }
  if (G.diff().mobs === 0 || hostile >= 6 || Math.random() > 0.3) return;
  const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 20;
  const x = Math.floor(P.pos.x + Math.cos(a) * r), z = Math.floor(P.pos.z + Math.sin(a) * r);
  if (!W.isLoaded(x, z)) return;
  const top = W.endTop ? W.endTop(x, z) : -1;
  if (top < 0 || W.getBlock(x, top + 1, z) || W.getBlock(x, top + 2, z) || W.getBlock(x, top + 3, z)) return;
  spawnMob('enderman', x + 0.5, top + 1, z + 0.5);
}

function netherSpawn(hostile) {
  const P = G.player, W = G.world;
  // a moment to look around after coming through the portal
  if (performance.now() - (G.arrivedAt || 0) < 12000) return;
  const dm = G.diff().mobs;
  if (hostile >= Math.max(3, Math.round(7 * dm)) || Math.random() > 0.45) return;
  const ghasts = G.mobs.filter(m => m.type === 'ghast' && !m.dead).length;
  for (let tries = 0; tries < 4; tries++) {
    const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 20;
    const x = Math.floor(P.pos.x + Math.cos(a) * r), z = Math.floor(P.pos.z + Math.sin(a) * r);
    if (!W.isLoaded(x, z)) continue;
    let type = pick(NETHER_POOL);
    if (type === 'ghast' && (ghasts >= 2 || r < 30)) type = 'zombified_piglin';
    if (dm === 0 && MOB_TYPES[type].hostile) type = 'zombified_piglin'; // peaceful: only the piglins that leave you alone
    const T = MOB_TYPES[type];
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
    // like Minecraft: blazes and wither skeletons only live in nether fortresses
    if (type === 'blaze' || type === 'wither_skeleton') {
      let brick = false;
      for (let dy = -6; dy <= 1 && !brick; dy++) for (let d = -2; d <= 2 && !brick; d++) if (W.getBlock(x + d, y + dy, z) === ID.nether_bricks || W.getBlock(x, y + dy, z + d) === ID.nether_bricks) brick = true;
      if (!brick) continue;
    }
    spawnMob(type, x + 0.5, y, z + 0.5);
    break;
  }
}

/* villagers around villages, and monsters from dungeon spawners */
function structureSpawns() {
  const P = G.player, W = G.world;
  const pcx = Math.floor(P.pos.x) >> 4, pcz = Math.floor(P.pos.z) >> 4;
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
    const c = W.chunks.get(W.key(pcx + dx, pcz + dz));
    if (!c) continue;
    if (c.village) {
      const v = c.village;
      const villagers = G.mobs.filter(m => !m.dead && m.type === 'villager' && Math.hypot(m.pos.x - v.x, m.pos.z - v.z) < 48).length;
      const golems = G.mobs.filter(m => !m.dead && m.type === 'iron_golem' && Math.hypot(m.pos.x - v.x, m.pos.z - v.z) < 48).length;
      if (!golems && Math.random() < 0.15) {
        const y = W.surfaceY(v.x + 4, v.z + 4);
        if (y > SEA && !W.getBlock(Math.floor(v.x + 4), y + 1, Math.floor(v.z + 4)) && !W.getBlock(Math.floor(v.x + 4), y + 2, Math.floor(v.z + 4))) spawnMob('iron_golem', v.x + 4, y + 1, v.z + 4);
      }
      if (villagers < 6 && Math.random() < 0.5) {
        const x = v.x + (Math.random() - 0.5) * 30, z = v.z + (Math.random() - 0.5) * 30;
        if (W.isLoaded(x, z)) {
          const y = W.surfaceY(x, z);
          const top = W.getBlock(Math.floor(x), y, Math.floor(z));
          if (top && DEFS[top].solid && !DEFS[top].leaves && y > SEA) spawnMob('villager', x, y + 1, z);
        }
      }
    }
    // pillagers guard their outposts
    if (c.outpost && G.diff().mobs > 0) {
      const o = c.outpost, near = G.mobs.filter(m => !m.dead && m.type === 'pillager' && Math.hypot(m.pos.x - o.x, m.pos.z - o.z) < 40).length;
      if (near < 4 && Math.random() < 0.3 && Math.hypot(P.pos.x - o.x, P.pos.z - o.z) > 10) {
        const a = Math.random() * Math.PI * 2, x = o.x + Math.cos(a) * (6 + Math.random() * 6), z = o.z + Math.sin(a) * (6 + Math.random() * 6);
        if (W.isLoaded(x, z)) { const y = W.surfaceY(x, z); if (y > SEA && !W.getBlock(Math.floor(x), y + 1, Math.floor(z)) && !W.getBlock(Math.floor(x), y + 2, Math.floor(z))) spawnMob('pillager', x, y + 1, z); }
      }
    }
    for (const [sx, sy, sz] of c.spawners || []) {
      if (W.getBlock(sx, sy, sz) !== ID.spawner) continue;
      if (Math.hypot(P.pos.x - sx, P.pos.y - sy, P.pos.z - sz) > 16 || P.mode !== 'survival') continue;
      G.particles.burst(sx + 0.5, sy + 0.8, sz + 0.5, [0xff7a20, 0x553322], 3, 0.8, 0.1, -1);
      const near = G.mobs.filter(m => !m.dead && Math.hypot(m.pos.x - sx, m.pos.z - sz) < 8).length;
      if (near >= 4 || Math.random() > 0.3) continue;
      const x = sx + (Math.random() < 0.5 ? -2 : 2) + 0.5, z = sz + Math.round((Math.random() - 0.5) * 4) + 0.5;
      if (!W.getBlock(Math.floor(x), sy, Math.floor(z)) && !W.getBlock(Math.floor(x), sy + 1, Math.floor(z)))
        spawnMob(['zombie', 'skeleton', 'spider'][Math.random() * 3 | 0], x, sy, z);
    }
  }
}

/* ---------- world lifecycle ---------- */
/* items lying on the ground, kept while you are in the other dimension and saved with the world */
function serializeDrops() {
  return G.drops.filter(d => !d.done && d.count > 0).map(d => [d.id, d.count, +d.pos.x.toFixed(2), +d.pos.y.toFixed(2), +d.pos.z.toFixed(2), Math.round(d.age), d.did]);
}
function restoreDrops(dim) {
  const list = (G.dimDrops && G.dimDrops[dim]) || [];
  for (const e of list) {
    if (!Array.isArray(e) || !DEFS[e[0]] || !(e[1] > 0) || !e.slice(2, 5).every(Number.isFinite)) continue;
    const d = G.spawnDrop(e[0], e[1], e[2], e[3], e[4], new THREE.Vector3(0, 0, 0), { did: e[6], remote: true });
    d.age = +e[5] || 0; d.pickDelay = 0;
  }
  if (G.dimDrops) G.dimDrops[dim] = [];
}

function clearEntities() {
  for (const list of [G.mobs, G.projectiles, G.drops, G.tnts]) { for (const e of list) { if (e.mesh) G.scene.remove(e.mesh); } list.length = 0; }
  for (const d of G.dragons) G.scene.remove(d.mesh);
  G.dragons.length = 0;
}

function makeWorld(seed, legacy) {
  if (G.worlds) {
    G.scene.remove(G.world.group);
    for (const w of Object.values(G.worlds)) for (const c of w.chunks.values()) for (const m of c.meshes) m.geometry.dispose();
  }
  clearEntities();
  const rd = G.world ? G.world.renderDist : (Input.touch ? 4 : 5);
  G.worlds = {};
  for (const dim of ['overworld', 'nether', 'end']) {
    const w = new World(seed, G.mats, dim, legacy);
    w.renderDist = rd;
    w.onEdit = (x, y, z, id) => Net.edit(dim, x, y, z, id);
    G.worlds[dim] = w;
  }
  G.dim = 'overworld';
  G.pets = {}; G.pendingPets = []; G.guestPens = []; G.chests = {}; G.chestVer = {}; for (const k of Object.keys(G.signMeshes || {})) { G.scene.remove(G.signMeshes[k]); } G.signs = {}; G.signMeshes = {}; G.crops = {}; G.myFlag = null; G.showFlag = false; G.noFireSpread = false; G.keepInventory = false; G.dimDrops = {}; G.furnaces = {}; G.endDragonDead = false;
  G.world = G.worlds.overworld;
  G.scene.add(G.world.group);
  G.seed = seed;
  G.applyFog();
}

/* tamed animals, mobs shut in a pen or on a rope, and boats are kept in the save, one list per dimension:
   [type, x, y, z, sitting, flags (1 tame, 2 penned, 4 baby, 8 boat or rope), time left to grow up, health,
    horse armor, chest contents, rope ('p' = held by you, or the fence [x, y, z]), facing] */
const keepsForever = m => (m.tame || m.penned || m.T.boat || m.leash || m.customName) && !m.dead && !m.remoteCtl;
const slotsJSON = sl => sl.map(slotToArr);
function serializeMob(m) {
  return [m.type, +m.pos.x.toFixed(2), +m.pos.y.toFixed(2), +m.pos.z.toFixed(2), m.sitting ? 1 : 0,
    (m.tame ? 1 : 0) | (m.penned ? 2 : 0) | (m.baby ? 4 : 0) | (m.T.boat || m.leash ? 8 : 0), Math.round(m.growT || 0), Math.round(m.hp),
    m.armor || 0, m.chestSlots ? slotsJSON(m.chestSlots) : 0, m.leash === 'player' ? 'p' : m.leash ? [m.leash.x, m.leash.y, m.leash.z] : 0, +(m.yaw || 0).toFixed(2), m.customName || 0];
}
function serializePets() {
  return G.mobs.filter(keepsForever).map(serializeMob).concat(G.guestPens || []);
}
function restorePets(list) {
  for (const p of list || []) {
    if (!Array.isArray(p) || !MOB_TYPES[p[0]] || !p.slice(1, 4).every(Number.isFinite)) continue;
    const flags = Number.isInteger(p[5]) ? p[5] : 1;
    // in a friend's world the host looks after the animals; keep ours safe in the save meanwhile
    if (!(flags & 9) && !Net.isHost()) { (G.guestPens = G.guestPens || []).push(p); continue; }
    const m = spawnMob(p[0], p[1], p[2] + 0.05, p[3]);
    m.penned = !!(flags & 2); m.penCheckAt = Date.now() + 8000;
    if (flags & 4 && m.makeBaby) m.makeBaby(Number.isFinite(p[6]) ? p[6] : 240);
    if (Number.isFinite(p[7]) && p[7] > 0) m.hp = Math.min(p[7], m.T.hp * 2);
    if (flags & 1) {
      m.tame = true; m.sitting = !!p[4];
      if (m.parts.collar) m.parts.collar.visible = true;
      if (m.parts.saddle) m.parts.saddle.visible = true;
      if (m.type === 'wolf') m.hp = 20;
    }
    if (typeof p[8] === 'string' && HORSE_ARMOR[p[8]]) m.armor = p[8];
    if (Array.isArray(p[9])) { m.chestSlots = new Array(27).fill(null); p[9].slice(0, 27).forEach((a, i) => { m.chestSlots[i] = slotFromArr(a); }); }
    if (p[10] === 'p') m.leash = 'player';
    else if (Array.isArray(p[10]) && p[10].every(Number.isInteger)) m.leash = { x: p[10][0], y: p[10][1], z: p[10][2] };
    if (Number.isFinite(p[11])) { m.yaw = p[11]; m.mesh.rotation.y = p[11]; }
    if (typeof p[12] === 'string') m.setName(p[12]);
    if (m.dress) m.dress();
  }
}

/* is this mob shut in on every side (fences, walls, a closed gate...) so it can never walk out?
   Walks the floor the mob could reach, stepping up half blocks and single blocks the way mobs can.
   It only counts if a player built or dug some of it, so cave monsters don't pile up forever. */
const PEN_MAX = 1200, PEN_R = 28;
G.isPenned = (m) => {
  const W = G.world, ox = m.pos.x, oz = m.pos.z;
  const blocked = (x, y, z) => { W.mobMode = true; const c = W.collides(x + 0.5, y, z + 0.5, 0.4, 0.9); W.mobMode = false; return c; };
  const edited = (x, y, z) => { const e = W.edits.get(W.key(x >> 4, z >> 4)); return !!(e && e.has((x & 15) + ((z & 15) << 4) + (y << 8))); };
  const sx = Math.floor(ox), sz = Math.floor(oz);
  // where it stands (it may be in the middle of a jump), on the half-block grid
  let y0 = Math.floor(m.pos.y * 2) / 2;
  for (let i = 0; i < 8 && y0 > 1 && !blocked(sx, y0 - 0.5, sz); i++) y0 -= 0.5;
  for (let i = 0; i < 3 && blocked(sx, y0, sz); i++) y0 += 0.5;
  const seen = new Set(), queue = [[sx, y0, sz]];
  seen.add(sx + ',' + y0 + ',' + sz);
  let built = false;
  while (queue.length) {
    const [x, y, z] = queue.pop();
    if (seen.size > PEN_MAX || Math.abs(x - sx) > PEN_R || Math.abs(z - sz) > PEN_R) return false;
    const fy = Math.floor(y);
    if (!built && (edited(x, fy, z) || edited(x, fy - 1, z))) built = true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!W.isLoaded(nx, nz)) return null; // can't tell yet
      let ny = null;
      if (!blocked(nx, y, nz)) {
        ny = y;
        for (let f = 0; f < 4 && ny > 0 && !blocked(nx, ny - 0.5, nz); f++) ny -= 0.5; // walk or fall down
        if (ny < y - 1.5) ny = Math.floor(ny);
      } else {
        for (const up of [0.5, 1]) if (!blocked(nx, y + up, nz) && !blocked(x, y + up, z)) { ny = y + up; break; } // hop up
        if (ny === null && !built && (edited(nx, fy, nz) || edited(nx, fy + 1, nz))) built = true; // a wall someone placed
      }
      if (ny === null || ny < 1) continue;
      const k = nx + ',' + ny + ',' + nz;
      if (!seen.has(k)) { seen.add(k); queue.push([nx, ny, nz]); }
    }
  }
  return built;
};

function useDim(to) {
  if (G.dim === to) return;
  if (G.player.riding) G.player.dismount();
  G.pets = G.pets || {};
  G.pets[G.dim] = serializePets().concat(G.pendingPets || []); G.guestPens = [];
  if (to === 'overworld' && G.dragons.some(d => !d.dead)) G.dragonTimer = 20;
  G.dimDrops = G.dimDrops || {};
  G.dimDrops[G.dim] = (G.dimDrops[G.dim] || []).concat(serializeDrops());
  clearEntities();
  G.scene.remove(G.world.group);
  G.dim = to;
  G.world = G.worlds[to];
  G.world.queue = [];
  G.scene.add(G.world.group);
  G.applyFog();
  G.pendingPets = G.pets[to] || [];
  G.pets[to] = [];
  restoreDrops(to);
  G.redrawSigns();
  G.findFires();
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
  G.arrivedAt = performance.now();
  Sound.play('teleport');
  if (to === 'nether') {
    G.ui.message('Welcome to the Nether! Watch out for lava, ghasts and blazes.', 'purple');
    G.netherVisited = true;
  } else G.ui.message('Back in the Overworld.', 'gold');
  G.save();
};

/* jump into an End portal: off to the End (or home again from it) */
G.enterEnd = () => {
  const P = G.player;
  useDim('end');
  loadAround(60, 0, 2);
  const W = G.world, y = Math.max(W.endTop(60, 0), 50) + 1;
  for (let x = 58; x <= 62; x++) for (let z = -2; z <= 2; z++) for (let k = 0; k < 3; k++) W.setBlock(x, y + k, z, 0);
  P.pos.set(60.5, y, 0.5); P.yaw = Math.PI / 2;
  P.vel.set(0, 0, 0); P.fallStart = null; P.portalCd = true;
  G.arrivedAt = performance.now();
  Sound.play('teleport');
  G.ui.message('Welcome to the End! The Ender Dragon lives here. Hit it when it swoops, or shoot it with arrows.', 'purple');
  G.save();
};
G.leaveEnd = () => {
  const P = G.player;
  useDim('overworld');
  P.pos.copy(P.spawn);
  loadAround(P.pos.x, P.pos.z, 2);
  if (G.world.collides(P.pos.x, P.pos.y, P.pos.z, P.w, P.h)) P.pos.y = G.world.groundY(P.pos.x, P.pos.z) + 1;
  P.vel.set(0, 0, 0); P.fallStart = null; P.portalCd = true;
  Sound.play('teleport');
  G.ui.message('Back home in the Overworld.', 'gold');
  G.save();
};
/* the dragon is beaten: a portal home opens in the middle of the island */
G.endDragonBeaten = () => {
  G.endDragonDead = true;
  const W = G.worlds.end, y = Math.max(W.endTop(0, 0), 50) + 1;
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    if (Math.hypot(x, z) > 3.6) continue;
    W.setBlock(x, y - 1, z, ID.bedrock);
    for (let k = 0; k < 4; k++) W.setBlock(x, y + k, z, 0);
    if (Math.hypot(x, z) > 2.5) W.setBlock(x, y, z, ID.bedrock);
    else W.setBlock(x, y, z, ID.end_portal);
  }
  for (let k = 0; k < 4; k++) W.setBlock(0, y + k, 0, ID.bedrock);
  W.setBlock(0, y + 4, 0, ID.dragon_egg);
  G.ui.message('You beat the Ender Dragon! A portal home has opened in the middle of the island.', 'gold');
  G.save();
};

/* put an Eye of Ender in a frame; when all 12 frames around the 3 by 3 hole have one, the portal opens */
G.fillEndFrame = (x, y, z) => {
  const W = G.world;
  W.setBlock(x, y, z, ID.end_portal_frame_eye);
  G.particles.burst(x + 0.5, y + 1, z + 0.5, [0x46c98a, 0x9a4ad8], 10, 1.5, 0.08);
  for (let cx = x - 4; cx <= x + 4; cx++) for (let cz = z - 4; cz <= z + 4; cz++) {
    let ok = true;
    for (let i = -1; i <= 1 && ok; i++) for (const [fx, fz] of [[cx + i, cz - 2], [cx + i, cz + 2], [cx - 2, cz + i], [cx + 2, cz + i]]) if (W.getBlock(fx, y, fz) !== ID.end_portal_frame_eye) { ok = false; break; }
    if (!ok) continue;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) W.setBlock(cx + i, y, cz + j, ID.end_portal);
    Sound.play('dragonRoar', new THREE.Vector3(cx, y, cz));
    G.ui.message('The End portal is open! Jump in to go to the End.', 'purple');
    return;
  }
  G.ui.message('The eye fits into the frame.', 'purple');
};

/* throw an Eye of Ender: it flies toward the nearest stronghold */
G.throwEye = () => {
  const P = G.player;
  if (G.dim !== 'overworld') { G.ui.message('Eyes of Ender only find strongholds in the Overworld.', 'purple'); return false; }
  const s = G.world.nearestStronghold(P.pos.x, P.pos.z);
  const from = new THREE.Vector3(P.pos.x, P.pos.y + 1.5, P.pos.z);
  G.projectiles.push(new EyeOfEnder(from, s));
  const d = Math.round(Math.hypot(s.x - P.pos.x, s.z - P.pos.z));
  if (d < 14) G.ui.message('The eye sinks into the ground: the stronghold is right below you! Dig down.', 'purple');
  return true;
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

G.startNew = (mode, name) => {
  Sound.init();
  const P = G.player;
  const txt = $('seed').value.trim();
  const seedNow = txt ? seedFromText(txt) : G.seed;
  // a seed you played before takes you back to that world instead of starting over
  if (G.findWorld(seedNow)) { G.continueSaved(String(seedNow)); return; }
  G.worldId = String(seedNow);
  G.worldName = (name || '').trim() || 'New World';
  G.adoptName = G.ui.fromMultiplayer && !(Net.friendWorldName && Net.friendWorldName(seedNow));
  makeWorld(txt ? seedFromText(txt) : G.seed);
  P.inv = new Inventory(); P.reset(); P.mode = mode; P.sel = 0;
  G.setDifficulty(G.pickedDifficulty(), true);
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
  // a new world starts with herds of animals nearby
  for (let i = 0; i < 10; i++) {
    const x = sx + (Math.random() - 0.5) * 48, z = sz + (Math.random() - 0.5) * 48;
    const y = G.world.surfaceY(x, z);
    if (G.world.getBlock(Math.floor(x), y, Math.floor(z)) !== ID.grass) continue;
    const type = pick(PASSIVE_POOL);
    for (let n = 2 + (Math.random() * 2 | 0); n > 0; n--) spawnMob(type, x + (Math.random() - 0.5) * 3, y + 1, z + (Math.random() - 0.5) * 3);
  }
  $('menu-start').hidden = true;
  G.ui.message(mode === 'creative' ? 'Creative mode: unlimited blocks, double-tap jump to fly.' : 'Survival mode: punch trees, craft tools, survive the night!', 'gold');
  G.ui.message((Input.touch ? 'Tap Items' : 'Press E') + ' for inventory and crafting.');
  G.ui.message('There is an obsidian portal frame near you. Light it with Flint and Steel to enter the Nether. Dragons live in the End.', 'purple');
  G.resume();
  G.save();
  Net.joinWorld(G.seed);
};

G.continueSaved = async (id) => {
  Sound.init();
  // let the online saves finish starting up first (a few seconds at most), so nothing waiting online is missed
  if (G.cloudInit && !Cloud.ready) { G.ui.message('Getting your online saves...'); await Promise.race([G.cloudInit, new Promise(r => setTimeout(r, 6000))]); }
  const entry = id ? G.findWorld(id) : G.worldList()[0];
  // your own online copy is used when this device has none or an older one. Someone else's copy is
  // only used if you pick it yourself.
  let here = null;
  try { here = entry ? localStorage.getItem(worldKey(entry.id)) : null; } catch (e) { here = null; }
  if (entry && Cloud.ready) {
    await Cloud.readIndex();
    const mine = Cloud.mine(entry.id);
    let pick = null;
    // a lost world put back for you (once): it wins over whatever this device has
    const gift = await Cloud.restoreFor(entry.id);
    if (gift) {
      try { localStorage.setItem(worldKey(entry.id), gift.text); } catch (e) { G.cloudCopy = gift.text; }
      here = gift.text;
      G.ui.message('Your lost world is back' + (gift.from ? ' (saved ' + gift.from + ')' : '') + '!', 'gold');
    } else
    if (mine && (!here || (+mine.last || 0) > (entry.last || 0) + 2000)) pick = mine;
    else if (!here) {
      const copies = Cloud.copiesOf(entry.id);
      pick = copies.length > 1 ? await G.ui.chooseCopy(entry, copies) : copies[0];
      if (copies.length && !pick) return; // cancelled
    }
    if (pick) {
      G.ui.message('Loading your world from online...');
      let text = await Cloud.pull(pick);
      // a copy written by an older game (no list of block numbers) never replaces a newer-format save here
      if (text && here && pick === mine && !text.includes('"pal"') && here.includes('"pal"')) text = null;
      if (text) {
        try { localStorage.setItem(worldKey(entry.id), text); } catch (e) { G.cloudCopy = text; }
        const list = G.worldList(), w = list.find(x => x.id === entry.id);
        if (w) { delete w.cloud; delete w.cloudNewer; writeWorldList(list); }
      }
    }
  }
  let s = null;
  try { s = entry ? JSON.parse(localStorage.getItem(worldKey(entry.id)) || G.cloudCopy || 'null') : null; } catch (e) { s = null; }
  G.cloudCopy = null;
  if (!s) { G.ui.message('No saved world found.'); return; }
  translateSave(s);
  if (Cloud.ready) await Cloud.loadFixes(entry.id); else Cloud.fixList = [];
  G.worldId = entry.id; G.worldName = entry.name;
  makeWorld(s.seed, !s.gen); // saves from before seed personalities keep their old landscape
  G.worlds.overworld.loadEdits(s.edits || {});
  G.worlds.nether.loadEdits(s.netherEdits || {});
  G.worlds.end.loadEdits(s.endEdits || {});
  if (Array.isArray(s.oldGen)) G.worlds.overworld.oldGen = new Set(s.oldGen.filter(k => typeof k === 'string'));
  else G.worlds.overworld.computeOldGen(); // first time this world is opened with the new caves
  { const ow = G.worlds.overworld; ow.genVer = new Map();
    if (s.genVer && typeof s.genVer === 'object') { for (const k in s.genVer) if (/^-?\d+,-?\d+$/.test(k) && Number.isInteger(s.genVer[k])) ow.genVer.set(k, s.genVer[k]); }
    else ow.stampOldEdits(); }
  G.applyFixes();
  G.endDragonDead = !!s.endDragonDead;
  G.netherVisited = !!s.netherVisited;
  if (s.dim === 'nether' || s.dim === 'end') useDim(s.dim); else restoreDrops('overworld');
  G.chests = s.chests || {};
  G.findFires();
  G.signs = s.signs || {};
  G.crops = s.crops || {};
  G.keepInventory = !!s.keepInventory;
  G.noFireSpread = !!s.noFireSpread;
  G.myFlag = s.myFlag && ['overworld', 'nether', 'end'].includes(s.myFlag.dim) && [s.myFlag.x, s.myFlag.y, s.myFlag.z].every(Number.isInteger) ? s.myFlag : null;
  G.showFlag = false;
  G.difficulty = G.DIFFS[s.difficulty] ? s.difficulty : 'normal';
  G.chestVer = s.chestVer || {};
  G.furnaces = s.furnaces || {};
  G.dimDrops = s.drops && typeof s.drops === 'object' ? s.drops : {};
  G.pets = Object.assign({}, s.pets || {});
  G.pendingPets = G.pets[G.dim] || [];
  G.pets[G.dim] = [];
  const P = G.player;
  P.reset(); P.mode = s.mode || 'survival';
  P.inv = new Inventory(); P.inv.load(s.inv || []);
  P.health = s.health ?? 20; P.hunger = s.hunger ?? 20; P.saturation = s.saturation ?? 5; P.xp = s.xp || 0; P.level = s.level || 0;
  P.spawn.fromArray(s.spawn); P.pos.fromArray(s.pos); P.yaw = s.yaw || 0; P.pitch = s.pitch || 0;
  G.time = s.time || 0.1; G.dragonTimer = s.dragonTimer ?? 30;
  loadAround(P.pos.x, P.pos.z, 2);
  if (G.world.collides(P.pos.x, P.pos.y, P.pos.z, P.w, P.h)) P.pos.y = G.world.groundY(P.pos.x, P.pos.z) + 1;
  P.portalCd = true;
  $('seed').value = s.seed;
  $('menu-start').hidden = true;
  G.ui.message('Welcome back to ' + G.worldName + '!', 'gold');
  setTimeout(() => G.redrawSigns(), 1500);
  G.resume();
  Net.joinWorld(G.seed);
};

/* put back blocks that are known to be wrong (from Cloud.fixList), again whenever they come back
   (for example from a friend's game that still has them wrong) */
G.applyFixes = () => {
  const DIMN = ['overworld', 'nether', 'end'];
  for (const [d, x, y, z, wrong, right] of Cloud.fixList || []) {
    const W = G.worlds && G.worlds[DIMN[d]];
    if (!W) continue;
    const k = W.key(x >> 4, z >> 4), i = (x & 15) + ((z & 15) << 4) + (y << 8), m = W.edits.get(k);
    if (!m || m.get(i) !== wrong) continue;
    if (W.chunks.has(k) && W === G.world) W.setBlock(x, y, z, right); // shows at once, and tells friends
    else m.set(i, right);
  }
};

/* translate every block and item number in a save written with different numbers */
function translateSave(s) {
  const tr = idTranslator(s.pal);
  if (!tr) return s;
  const edits = o => { if (o) for (const k in o) { const a = o[k]; if (Array.isArray(a)) for (let i = 1; i < a.length; i += 2) a[i] = tr(a[i]); } };
  edits(s.edits); edits(s.netherEdits); edits(s.endEdits);
  const pair = a => { if (Array.isArray(a) && Number.isInteger(a[0])) a[0] = tr(a[0]); };
  if (Array.isArray(s.inv)) s.inv.forEach(pair);
  if (s.chests) for (const k in s.chests) if (Array.isArray(s.chests[k])) for (const it of s.chests[k]) if (it && Number.isInteger(it.id)) it.id = tr(it.id);
  if (s.furnaces) for (const k in s.furnaces) { const f = s.furnaces[k]; if (f && Array.isArray(f.slots)) for (const it of f.slots) if (it && Number.isInteger(it.id)) it.id = tr(it.id); }
  if (s.drops) for (const d in s.drops) if (Array.isArray(s.drops[d])) s.drops[d].forEach(pair);
  if (s.pets) for (const d in s.pets) if (Array.isArray(s.pets[d])) for (const p of s.pets[d]) if (Array.isArray(p) && Array.isArray(p[9])) p[9].forEach(pair);
  return s;
}
G.translateSave = translateSave;

G.save = (opts) => {
  if (G.state === 'title' || !G.world) return;
  const P = G.player;
  const data = {
    v: 1, pal: ID_PALETTE, name: G.worldName || 'My World', seed: G.seed, mode: P.mode, time: G.time, dragonTimer: G.dragonTimer,
    pos: P.pos.toArray(), spawn: P.spawn.toArray(), yaw: P.yaw, pitch: P.pitch,
    health: P.dead ? 20 : P.health, hunger: P.hunger, saturation: P.saturation || 0, xp: P.xp, level: P.level,
    inv: P.inv.toJSON(), edits: G.worlds.overworld.serializeEdits(), netherEdits: G.worlds.nether.serializeEdits(), endEdits: G.worlds.end.serializeEdits(), endDragonDead: !!G.endDragonDead,
    pets: Object.assign({}, G.pets || {}, { [G.dim]: serializePets().concat(G.pendingPets || []) }),
    dim: G.dim, netherVisited: !!G.netherVisited, chests: G.chests || {}, signs: G.signs || {}, crops: G.crops || {}, oldGen: G.worlds.overworld.oldGen ? [...G.worlds.overworld.oldGen] : [], genVer: G.worlds.overworld.genVer ? Object.fromEntries(G.worlds.overworld.genVer) : {}, keepInventory: !!G.keepInventory, noFireSpread: !!G.noFireSpread, myFlag: G.myFlag || null, difficulty: G.difficulty, chestVer: G.chestVer || {}, furnaces: G.furnaces || {}, drops: Object.assign({}, G.dimDrops || {}, { [G.dim]: serializeDrops() }), gen: G.worlds.overworld.legacy ? undefined : 2,
  };
  let ok = true;
  G.lastSaveText = JSON.stringify(data);
  try { localStorage.setItem(G.saveKey(), G.lastSaveText); } catch (e) { ok = false; }
  if (!ok && Date.now() - (G.saveWarnAt || 0) > 60000) {
    G.saveWarnAt = Date.now();
    G.ui.message(Cloud.ready ? 'This device could not save your world (its storage is full), but it is still saved online.' : 'Your world could not be saved on this device: its storage is full. Delete old worlds you don\'t need from the Singleplayer list.', 'purple');
  }
  const list = G.worldList().filter(w => w.id !== G.worldId);
  list.unshift({ id: G.worldId, name: G.worldName || 'My World', seed: G.seed, mode: P.mode, last: Date.now() });
  writeWorldList(list);
  Cloud.queue(G.worldId, opts && opts.now);
};

/* ---------- your worlds: every seed you played is kept, with the name you gave it ---------- */
G.worldList = () => {
  try { const l = JSON.parse(localStorage.getItem(WORLDS_KEY)); return Array.isArray(l) ? l.filter(w => w && w.id) : []; } catch (e) { return []; }
};
G.writeWorldList = list => writeWorldList(list);
function writeWorldList(list) { try { localStorage.setItem(WORLDS_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ } }
G.findWorld = seed => G.worldList().find(w => w.id === String(seed));
G.saveKey = () => worldKey(G.worldId);
G.deleteWorld = id => {
  writeWorldList(G.worldList().filter(w => w.id !== id));
  Cloud.remove(id);
  try { localStorage.removeItem(worldKey(id)); } catch (e) { /* storage unavailable */ }
};
G.renameWorld = (id, name) => {
  const list = G.worldList(), w = list.find(x => x.id === id);
  if (w) { w.name = name; writeWorldList(list); }
  if (G.worldId === id) G.worldName = name;
};
function migrateOldSave() {
  let old = null;
  try { old = localStorage.getItem(SAVE_KEY); } catch (e) { return; }
  if (!old) return;
  try {
    const s = JSON.parse(old), id = String(s.seed);
    if (!G.findWorld(id)) {
      localStorage.setItem(worldKey(id), old);
      writeWorldList([{ id, name: 'My World', seed: s.seed, mode: s.mode || 'survival', last: Date.now() }, ...G.worldList()]);
    }
    localStorage.removeItem(SAVE_KEY);
  } catch (e) { /* keep the old save where it is */ }
}
function recoverWorlds() {
  let keys = [];
  try { keys = Object.keys(localStorage).filter(k => k.startsWith('blockrealm-world-') && k !== WORLDS_KEY); } catch (e) { return; }
  const list = G.worldList();
  let changed = false;
  for (const k of keys) {
    const id = k.slice('blockrealm-world-'.length);
    if (!id || list.find(w => w.id === id)) continue;
    try {
      const s = JSON.parse(localStorage.getItem(k));
      if (!s || s.seed === undefined) continue;
      list.push({ id, name: s.name || 'Recovered World', seed: s.seed, mode: s.mode || 'survival', last: 0 });
      changed = true;
    } catch (e) { /* not a world save */ }
  }
  if (changed) writeWorldList(list);
}
function refreshContinue() { G.ui.renderWorldList(); }

G.toTitle = () => {
  G.setState('title');
  for (const id of ['menu-pause', 'menu-inv', 'menu-dead']) $(id).hidden = true;
  $('menu-start').hidden = false;
  G.ui.titlePage('main');
  refreshContinue();
  G.unlock();
  Net.leave();
  G.previewWorld(String(G.seed));
};

G.setState = (s) => {
  // opening or closing a menu: let go of every touch button and finger, so nothing keeps
  // walking, jumping or mining by itself afterwards (a hidden button never hears the finger lift)
  if (s !== G.state && Input.touch) {
    Input.joy.id = null; Input.joy.x = Input.joy.y = 0;
    const knob = document.getElementById('knob'); if (knob) knob.style.transform = '';
    Input.tJump = false; Input.tSneak = false; Input.left = false; Input.aim = null; Input.tap = null;
    Input.leftPressed = Input.rightPressed = false;
    if (G.ui && G.ui.dropLook) G.ui.dropLook();
  }
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
/* difficulty: how many monsters, how hard they hit, how fast you get hungry and heal */
G.DIFFS = {
  peaceful: { name: 'Peaceful', dmg: 0.5, mobs: 0, hunger: 0, regen: 1, starve: 20 },
  normal: { name: 'Normal', dmg: 1, mobs: 1, hunger: 1, regen: 2.5, starve: 2 },
  hard: { name: 'Hard', dmg: 1.5, mobs: 1.5, hunger: 1.3, regen: 3.5, starve: 1 },
  extreme: { name: 'Extreme', dmg: 2, mobs: 2, hunger: 1.6, regen: 5, starve: 0 },
};
G.difficulty = 'normal';
G.diff = () => G.DIFFS[G.difficulty] || G.DIFFS.normal;
G.mobDmg = n => Math.max(1, Math.round(n * G.diff().dmg));
G.pickedDifficulty = () => { try { const v = localStorage.getItem('blockrealm-diff'); return G.DIFFS[v] ? v : 'normal'; } catch (e) { return 'normal'; } };
G.setDifficulty = (d, quiet) => {
  if (!G.DIFFS[d]) return;
  G.difficulty = d;
  try { localStorage.setItem('blockrealm-diff', d); } catch (e) { /* storage unavailable */ }
  if (d === 'peaceful') for (const m of G.mobs) if (m.T.hostile && !m.remoteCtl) m.removeSilently();
  if (!quiet) G.ui.message('Difficulty: ' + G.DIFFS[d].name, 'gold');
};

/* your skin: remembered on this device, shown on your body, your arm and to other players */
G.loadSkin = () => { try { const v = parseInt(localStorage.getItem('blockrealm-skin'), 10); return v >= 0 && v < SKINS.length ? v : DEFAULT_SKIN; } catch (e) { return DEFAULT_SKIN; } };
G.setSkin = (i, quiet) => {
  G.skin = i >= 0 && i < SKINS.length ? i : DEFAULT_SKIN;
  try { localStorage.setItem('blockrealm-skin', String(G.skin)); } catch (e) { /* storage unavailable */ }
  const was = G.playerModel;
  if (was) G.scene.remove(was.group);
  const pm = buildPlayerModel(G.skin);
  pm.group.visible = was ? was.group.visible : false;
  G.playerModel = pm; G.scene.add(pm.group);
  if (G.handArm) G.handArm.material.color.setHex(SKINS[G.skin].s);
  if (!quiet && Net.announce) Net.announce();
};

G.unlock = () => { if (document.pointerLockElement) document.exitPointerLock(); };
G.pause = () => {
  if (G.state !== 'play') return;
  G.setState('pause');
  G.ui.pausePage('main');
  $('menu-pause').hidden = false;
  G.unlock();
  G.save({ now: true });
};
G.resume = () => {
  Sound.init();
  $('menu-pause').hidden = true;
  G.setState('play');
  G.lock();
};

/* direction from the camera through a point on the screen (where a finger touched) */
const rayV = new THREE.Vector3();
function screenRay(pt) {
  const r = G.renderer.domElement.getBoundingClientRect();
  rayV.set(((pt.x - r.left) / r.width) * 2 - 1, -((pt.y - r.top) / r.height) * 2 + 1, 0.5).unproject(G.camera);
  return rayV.sub(G.camera.position).normalize().clone();
}

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
  // with the inventory, a chest, a villager's trades, the enchanting table or a sign open the world keeps
  // going like in Minecraft (you still fall, burn and get hit); you just can't walk or mine. Only the pause menu stops it.
  const running = active || G.state === 'inventory' || G.state === 'trade' || G.state === 'sign';
  if (running) G.tickFurnaces(dt);
  if (running) {
    G.time = (G.time + dt / DAY_LENGTH) % 1;
    // look
    if (active) {
      const sens = 0.0024 * Input.sens;
      P.yaw -= Input.lookDX * sens; P.pitch -= Input.lookDY * sens;
      P.pitch = clamp(P.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
      G.ui.readMovement();
    }
    const ready = G.world.isLoaded(P.pos.x, P.pos.z) && !G.world.chunks.get(G.world.key(Math.floor(P.pos.x) >> 4, Math.floor(P.pos.z) >> 4)).dirty;
    if (ready) P.update(dt, P.sleeping || !active ? NO_INPUT : Input);
    if (P.sleeping) G.sleepTick(dt);

    // interaction
    if (active) {
    const aimPt = Input.tap || Input.aim;
    const tgt = P.dead ? { block: null, mob: null } : P.target(aimPt ? screenRay(aimPt) : null);
    if (Input.tap) {
      if (tgt.mob && !(tgt.mob.wantsInteract && tgt.mob.wantsInteract(P))) Input.leftPressed = true; else Input.rightPressed = true;
      Input.tap = null;
    }
    if (Input.left || Input.padLeft || Input.leftPressed) P.primary(dt, Input.leftPressed, tgt); else P.breaking = null;
    if (Input.rightPressed || ((Input.right || Input.padRight) && P.useCd <= 0)) P.use(tgt);
    if (Input.middlePressed) P.pickBlock(tgt);
    Input.leftPressed = Input.rightPressed = Input.middlePressed = false;
    if (tgt.block) {
      G.selBox.visible = true;
      G.selBox.position.set(tgt.block.x + 0.5, tgt.block.y + 0.5, tgt.block.z + 0.5);
      const def = DEFS[tgt.block.id];
      if (def.cross) { G.selBox.scale.set(0.7, 1, 0.7); }
      else if (def.height) { G.selBox.scale.set(1, def.height, 1); G.selBox.position.y = tgt.block.y + def.height / 2; }
      else G.selBox.scale.set(1, 1, 1);
    } else G.selBox.visible = false;
    if (P.breaking && P.breaking.p > 0) {
      G.crack.visible = true;
      G.crack.position.set(P.breaking.x + 0.5, P.breaking.y + 0.5, P.breaking.z + 0.5);
      G.crack.geometry = G.crackGeos[Math.min(7, Math.floor(P.breaking.p * 8))];
    } else G.crack.visible = false;
    } else { P.breaking = null; G.crack.visible = false; }

    // entities
    for (const m of G.mobs) m.update(dt);
    G.mobs = G.mobs.filter(m => !m.removed);
    separateMobs();
    drawRopes();
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
    } else if (!P.dead && G.world.touching(P, ID.end_portal, 0)) {
      if (!P.portalCd) { if (G.dim === 'end') G.leaveEnd(); else G.enterEnd(); }
    } else { P.portalT = 0; P.portalCd = false; }
    $('fx-portal').style.opacity = clamp((P.portalT || 0) / 2, 0, 0.85);

    if (G.pendingPets && G.pendingPets.length && G.world.isLoaded(P.pos.x, P.pos.z)) {
      const ready = G.pendingPets.filter(p => G.world.isLoaded(p[1], p[3]));
      G.pendingPets = G.pendingPets.filter(p => !G.world.isLoaded(p[1], p[3]));
      restorePets(ready);
    }
    G.plateT = (G.plateT || 0) - dt;
    if (G.plateT <= 0) { G.plateT = 0.1; G.tickPlates(); }
    G.spawnT -= dt;
    if (G.spawnT <= 0) { G.spawnT = 1; spawnTick(); G.tickCrops(); G.tickGrass(); G.tickSigns(); G.tickFires(); }
    // no dragons outside the End
    if (G.dim !== 'end') for (const d of G.dragons) if (!d.done && !d.remoteCtl) d.remove();
    if (Date.now() - (G.fixAt || 0) > 3000) { G.fixAt = Date.now(); G.applyFixes(); }
    G.saveT += dt;
    if (G.saveT > 30) { G.saveT = 0; G.save(); }
  }
  G.ui.updateFriendArrow();
  G.ui.updateFlagArrow();
  // coordinates (Settings > Show Coordinates): where you are, how high, and which way you face
  {
    const box = $('coords'), show = !!G.showCoords && (G.state === 'play' || G.state === 'inventory');
    if (box.hidden === show) box.hidden = !show;
    if (show) {
      const dx = -Math.sin(P.yaw), dz = -Math.cos(P.yaw);
      const face = Math.abs(dz) > Math.abs(dx) ? (dz < 0 ? 'North' : 'South') : (dx > 0 ? 'East' : 'West');
      const t = 'X ' + Math.floor(P.pos.x) + '   Y ' + Math.floor(P.pos.y) + '   Z ' + Math.floor(P.pos.z) + '   · ' + face;
      if (box.textContent !== t) box.textContent = t;
    }
  }
  Input.lookDX = Input.lookDY = 0;
  G.particles.update(running ? dt : 0);
  G.world.update(P.pos.x, P.pos.z, running ? 6 : 12);
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
    setHeldItem(G.playerModel, P.heldSlot() ? P.heldSlot().id : 0);
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
      G.handItem.scale.setScalar(flat ? 0.42 : DEFS[hid].key === 'bed' ? 0.17 : 0.26);
      G.handItem.rotation.set(flat ? 0 : 0.2, flat ? -1.2 : 0.75, flat ? 0.15 : 0);
      G.handItem.position.set(flat ? 0.02 : 0, flat ? 0.05 : -0.02, 0);
    }
  }
  G.hand.visible = !P.dead && G.camMode === 0;
  // armor you are wearing: on your body in the other camera views, and the chestplate sleeve on your arm
  const worn = [36, 37, 38, 39].map(i => (P.inv.slots[i] ? P.inv.slots[i].id : 0));
  dressModel(G.playerModel, worn);
  G.handSleeve.visible = !!worn[1];
  if (worn[1]) G.handSleeve.material.color.setHex(ARMOR_COLORS[DEFS[worn[1]].key.split('_')[0]] || 0xdcdcdc);
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
  if (G.hand.visible) {
    G.renderer.autoClear = false;
    G.renderer.clearDepth();
    G.renderer.render(G.handScene, G.handCam);
    G.renderer.autoClear = true;
  }
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
  migrateOldSave();
  recoverWorlds();
  G.cloudInit = Cloud.init();
  const recent = G.worldList()[0];
  refreshContinue();
  G.setState('title');
  G.previewWorld(recent ? String(recent.seed) : null);
  window.addEventListener('beforeunload', () => G.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) { G.save({ now: true }); if (G.state === 'play') G.pause(); } });
  requestAnimationFrame(t => { last = t; frame(t); });
}
boot();
