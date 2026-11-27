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
      // every other mob's own voice
      case 'mob_bee': this.tone(220, 0.9, 'sawtooth', 0.05 * v, 235); this.tone(440, 0.9, 'square', 0.015 * v, 470); break;
      case 'mob_wolf': this.tone(600, 0.12, 'square', 0.06 * v, 400); this.tone(560, 0.14, 'square', 0.06 * v, 380, 0.2); break;
      case 'mob_cat': this.tone(700, 0.45, 'triangle', 0.07 * v, 1000); break;
      case 'mob_ocelot': this.tone(800, 0.3, 'triangle', 0.05 * v, 1100); break;
      case 'mob_horse': case 'mob_donkey': for (let i = 0; i < 5; i++) this.tone(500 - i * 50, 0.08, 'sawtooth', 0.06 * v, 650 - i * 60, i * 0.07); break;
      case 'mob_panda': this.tone(300, 0.3, 'triangle', 0.06 * v, 260); break;
      case 'mob_fox': this.tone(900, 0.15, 'sawtooth', 0.05 * v, 600); this.tone(950, 0.12, 'sawtooth', 0.04 * v, 700, 0.2); break;
      case 'mob_rabbit': this.noise(0.08, 0.15 * v, 3000, 'bandpass'); break;
      case 'mob_goat': this.tone(480, 0.6, 'sawtooth', 0.06 * v, 430); break;
      case 'mob_frog': this.tone(150, 0.12, 'square', 0.09 * v, 110); this.tone(180, 0.12, 'square', 0.08 * v, 120, 0.18); break;
      case 'mob_turtle': this.noise(0.3, 0.1 * v, 400, 'lowpass'); break;
      case 'mob_llama': this.tone(380, 0.35, 'sawtooth', 0.05 * v, 520); break;
      case 'mob_camel': this.tone(160, 0.6, 'sawtooth', 0.07 * v, 120); this.noise(0.4, 0.1 * v, 600, 'lowpass', 0.1); break;
      case 'mob_polar_bear': this.tone(110, 0.7, 'sawtooth', 0.1 * v, 80); this.noise(0.6, 0.15 * v, 300, 'lowpass'); break;
      case 'mob_mooshroom': this.tone(170, 0.9, 'sawtooth', 0.08 * v, 120); break;
      case 'mob_sniffer': for (let i = 0; i < 3; i++) this.noise(0.12, 0.25 * v, 500, 'bandpass', i * 0.16); break;
      case 'mob_armadillo': this.noise(0.15, 0.15 * v, 1800, 'bandpass'); break;
      case 'mob_parrot': this.tone(1800, 0.08, 'square', 0.04 * v, 2400); this.tone(2000, 0.08, 'square', 0.04 * v, 1500, 0.12); break;
      case 'mob_squid': case 'mob_glow_squid': this.noise(0.5, 0.12 * v, 500, 'lowpass', 0, 200); break;
      case 'mob_dolphin': for (let i = 0; i < 6; i++) this.tone(2500 + i * 150, 0.04, 'sine', 0.05 * v, 3200, i * 0.06); break;
      case 'mob_axolotl': this.tone(1300, 0.15, 'sine', 0.05 * v, 1700); break;
      case 'mob_cod': case 'mob_salmon': case 'mob_tropical_fish': for (let i = 0; i < 3; i++) this.tone(600 + i * 200, 0.05, 'sine', 0.03 * v, 1200, i * 0.08); break;
      case 'mob_slime': case 'mob_magma_cube': this.noise(0.2, 0.3 * v, 500, 'lowpass', 0, 150); this.tone(140, 0.15, 'sine', 0.08 * v, 90); break;
      case 'mob_phantom': this.tone(1600, 0.8, 'sawtooth', 0.05 * v, 700); this.tone(1700, 0.8, 'square', 0.02 * v, 750); break;
      case 'mob_hoglin': this.tone(120, 0.4, 'sawtooth', 0.1 * v, 90); this.noise(0.3, 0.15 * v, 400, 'lowpass'); break;
      case 'mob_piglin': case 'mob_zombified_piglin': this.tone(260, 0.15, 'sawtooth', 0.07 * v, 180); this.tone(240, 0.2, 'sawtooth', 0.06 * v, 150, 0.18); break;
      case 'mob_warden': this.tone(55, 0.18, 'sine', 0.3 * v, 45); this.tone(55, 0.18, 'sine', 0.25 * v, 45, 0.3); break;
      case 'wardenRoar': this.tone(70, 1.5, 'sawtooth', 0.3 * v, 40); this.noise(1.5, 0.35 * v, 300, 'lowpass', 0, 80); break;
      case 'mob_husk': case 'mob_drowned': this.tone(100, 0.8, 'sawtooth', 0.09 * v, 70); if (name === 'mob_drowned') this.noise(0.5, 0.1 * v, 500, 'lowpass'); break;
      case 'mob_stray': case 'mob_wither_skeleton': for (let i = 0; i < 4; i++) this.noise(0.04, 0.2 * v, name === 'mob_stray' ? 2000 : 1500, 'bandpass', i * 0.08); break;
      case 'mob_witch': for (let i = 0; i < 4; i++) this.tone(700 - i * 30, 0.07, 'square', 0.04 * v, 900, i * 0.09); break;
      case 'mob_pillager': this.tone(200, 0.3, 'square', 0.05 * v, 150); break;
      case 'mob_blaze': this.noise(0.8, 0.2 * v, 900, 'bandpass', 0, 300); break;
      case 'mob_ghast': this.tone(600, 1.2, 'sine', 0.1 * v, 350); this.tone(640, 1.2, 'triangle', 0.05 * v, 380); break;
      case 'mob_wither': this.tone(90, 1.0, 'sawtooth', 0.15 * v, 60); break;
      case 'llamaSpit': this.noise(0.15, 0.4 * v, 2000, 'bandpass', 0, 600); break;
      case 'honey': this.noise(0.25, 0.25 * v, 800, 'lowpass'); break;
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
  if (P.fx && P.fx('darkness')) { const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 600); near = 1; far = Math.min(far, 5 + 9 * pulse); fogCol.setRGB(0, 0, 0); G.scene.fog.color.copy(fogCol); }
  G.scene.fog.near = near; G.scene.fog.far = far;
  let bright = (0.22 + 0.78 * dl) * (1 - ug * 0.55);
  if (P.fx && P.fx('night_vision')) bright = Math.max(bright, 0.95);
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
  G.clouds.position.set(cam.x, GEN_H + 46, cam.z);
  G.clouds.material.map.offset.set((cam.x / 1600 * 3 + performance.now() / 600000) % 1, (-cam.z / 1600 * 3) % 1);
  G.clouds.material.color.setScalar(0.35 + 0.65 * dl);
}

/* ---------- world helpers exposed to entities ---------- */
G.spawnDrop = (id, count, x, y, z, vel, opts) => {
  const d = new ItemDrop(id, count, x, y, z, vel, opts && opts.did ? opts.did : Net.newId(), opts && cleanEnch(opts.e), opts && cleanName(opts.n), opts && Array.isArray(opts.c) ? opts.c.map(s => (s && DEFS[s.id] ? (Array.isArray(s) ? slotFromArr(s, 64, true) : s) : Array.isArray(s) ? slotFromArr(s, 64, true) : null)) : undefined);
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
      if (id === ID.chest || id === ID.chest_loot) { G.breakChest(X, Y, Z, id === ID.chest_loot); continue; } // what was inside spills out
      if (def.shulker) { G.shulkerId = id; G.breakShulker(X, Y, Z); continue; }
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


/* a chest's lid swings open while you look inside (and an ender chest's, and a shulker box's shell lifts) */
G.lids = new Map();
G.chestLid = (x, y, z, open) => {
  const k = x + ',' + y + ',' + z, id = G.world.getBlock(x, y, z), d = DEFS[id];
  if (!d || !(id === ID.chest || id === ID.chest_loot || id === ID.ender_chest || d.shulker)) return;
  let L = G.lids.get(k);
  if (!L) {
    const shell = !!d.shulker, h = shell ? 0.5 : 0.3;
    const geo = new THREE.BoxGeometry(1.004, h, 1.004), uv = geo.attributes.uv, T = TILE_UV[d.faces[2]], S = TILE_UV[d.faces[0]];
    // faces: +x, -x, +y, -y, +z, -z (4 corners each); sides use the top part of the side picture
    for (let f = 0; f < 6; f++) for (let c = 0; c < 4; c++) {
      const i = f * 4 + c, u = uv.getX(i), v = uv.getY(i), tt = f === 2 || f === 3 ? T : S;
      uv.setXY(i, tt[0] + u * (tt[2] - tt[0]), f === 2 || f === 3 ? tt[1] + v * (tt[3] - tt[1]) : tt[3] - (1 - v) * h * (tt[3] - tt[1]));
    }
    const lid = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: G.atlasTex, alphaTest: 0.5 }));
    const P = G.player, away = Math.abs(P.pos.x - x - 0.5) > Math.abs(P.pos.z - z - 0.5) ? (P.pos.x > x + 0.5 ? [-1, 0] : [1, 0]) : (P.pos.z > z + 0.5 ? [0, -1] : [0, 1]);
    const hinge = new THREE.Group();
    hinge.position.set(x + 0.5 + away[0] * 0.5, y + 1 - h, z + 0.5 + away[1] * 0.5);
    lid.position.set(-away[0] * 0.5, h / 2, -away[1] * 0.5);
    hinge.add(lid);
    // the dark inside, seen when the lid is up
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), new THREE.MeshBasicMaterial({ color: shell ? 0x3a1a4a : 0x2a1a0a }));
    inside.rotation.x = -Math.PI / 2; inside.position.set(x + 0.5, y + 1.003, z + 0.5);
    G.scene.add(hinge); G.scene.add(inside);
    L = { hinge, inside, away, a: 0, shell, h };
    G.lids.set(k, L);
  }
  L.open = open;
  if (open) Sound.play('click', new THREE.Vector3(x, y, z));
};
G.tickLids = (dt) => {
  for (const [k, L] of G.lids) {
    const [x, y, z] = k.split(',').map(Number), d = DEFS[G.world.getBlock(x, y, z)];
    const gone = !d || !(d.key === 'chest' || d.key === 'chest_loot' || d.key === 'ender_chest' || d.shulker);
    L.a += ((L.open && !gone ? 1 : 0) - L.a) * Math.min(1, dt * 9);
    if (L.shell) L.hinge.position.y = y + 1 - L.h + L.a * 0.45, L.hinge.rotation.y = L.a * 1.5;
    else { const ang = L.a * 1.25; if (L.away[0]) L.hinge.rotation.z = -L.away[0] * ang; else L.hinge.rotation.x = L.away[1] * ang; }
    L.inside.visible = L.a > 0.05;
    if ((!L.open || gone) && L.a < 0.02) { G.scene.remove(L.hinge); G.scene.remove(L.inside); G.lids.delete(k); }
  }
};

/* ---------- animations, like Minecraft ----------
   moving pictures (water, lava, fire, portals...), smoke and flames from torches, campfires and furnaces,
   lava pops, drips under water and lava, portal sparkles, the floating book over an enchanting table,
   and a glowing front on a furnace while it cooks */
G.tickAnim = (dt) => {
  const now = performance.now();
  // the whole picture sheet goes to the graphics chip each time, so at most 8 times a second (easy on phones)
  if (now - (G.animAt || 0) < 120) return;
  G.animAt = now;
  let changed = false;
  for (const a of ANIM_TILES) {
    const f = Math.floor(now / a.ms) % a.frames.length;
    if (f === a.f) continue;
    a.f = f; changed = true;
    actx.putImageData(a.frames[f], (a.i % ATLAS_N) * TILE, Math.floor(a.i / ATLAS_N) * TILE);
  }
  if (changed && G.atlasTex) G.atlasTex.needsUpdate = true;
};
G.amb = { list: [], scanT: 0, books: new Map(), glows: new Map() };
const isTorch = d => d && !d.rsTorch && /(^|_)torch/.test(d.key) && d.emit;
G.tickAmbient = (dt) => {
  const A = G.amb, P = G.player, W = G.world, PT = G.particles;
  A.scanT -= dt;
  if (A.scanT <= 0) {
    // look around for things that move or smoke (a few times a second)
    A.scanT = 0.6; A.list = [];
    const px = Math.floor(P.pos.x), py = Math.floor(P.pos.y), pz = Math.floor(P.pos.z);
    for (let dy = -6; dy <= 8; dy++) for (let dz = -11; dz <= 11; dz++) for (let dx = -11; dx <= 11; dx++) {
      const x = px + dx, y = py + dy, z = pz + dz, id = W.getBlock(x, y, z);
      if (!id) continue;
      const d = DEFS[id];
      let kind = null;
      if (isTorch(d)) kind = 'torch';
      else if (d.rsTorch && d.rsTorch.on) kind = 'rstorch';
      else if (id === ID.campfire) kind = 'campfire';
      else if (id === ID.fire) kind = 'fire';
      else if (id === ID.nether_portal) kind = 'portal';
      else if (id === ID.enchanting_table) kind = 'ench';
      else if (d.base === 'furnace' || d.base === 'smoker' || d.base === 'blast_furnace') kind = 'furnace';
      else if (id === ID.lava && !W.getBlock(x, y + 1, z)) kind = 'lavatop';
      else if (d.solid && !W.getBlock(x, y - 1, z)) { const up = W.getBlock(x, y + 1, z); if (up === ID.water || up === ID.lava) kind = up === ID.water ? 'dripw' : 'dripl'; }
      else if (id === ID.sculk_sensor) kind = 'sculk';
      else if (d.powder && [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => W.getBlock(x + a, y + b, z + c) === ID.water)) { W.setBlock(x, y, z, ID[d.powder]); continue; }
      else if (d.copper !== undefined && d.copper < 3 && Math.random() < 0.0004) { W.setBlock(x, y, z, ID[['', 'exposed_', 'weathered_', 'oxidized_'][d.copper + 1] + d.copperKind]); continue; }
      else if (id === ID.end_rod) kind = 'endrod';
      else if (id === ID.end_gateway) kind = 'portal';
      else if (id === ID.sculk_shrieker) kind = 'shrieker';
      else if (d.hopper) kind = 'hopper';
      else if (d.jukebox) kind = 'juke';
      else if (d.frame) kind = 'frame';
      else if (d.daylight) { const want = G.dim === 'overworld' && G.daylight() > 0.45 && W.skyExposed(x, y + 1, z); if (want !== d.daylight.on) W.setBlock(x, y, z, ID['daylight_detector_' + (want ? 1 : 0)]); }
      else if (d.comparator && d.comparator.on === false && Math.random() < 0.3) G.rsMark(x, y, z);
      if (kind) { A.list.push([kind, x, y, z, d]); if (A.list.length > 300) break; }
    }
  }
  const r = Math.random;
  const books = new Set(), glows = new Set(), frames = new Set();
  A.hopT = (A.hopT || 0) - dt; const hopNow = A.hopT <= 0; if (hopNow) A.hopT = 0.5;
  for (const [kind, x, y, z, d] of A.list) {
    switch (kind) {
      case 'torch': {
        const by = d.box ? d.box[4] : 0.625, cx = d.box ? (d.box[0] + d.box[3]) / 2 : 0.5, cz = d.box ? (d.box[2] + d.box[5]) / 2 : 0.5;
        if (r() < dt * 1.2) PT.spawn(x + cx, y + by + 0.08, z + cz, 0x555555, (r() - 0.5) * 0.1, 0.6, (r() - 0.5) * 0.1, 0.05, 0.9, -0.2);
        if (r() < dt * 0.6) PT.spawn(x + cx, y + by + 0.02, z + cz, 0xffb030, 0, 0.15, 0, 0.05, 0.35, 0);
        break;
      }
      case 'rstorch': if (r() < dt * 1.5) PT.spawn(x + 0.5 + (r() - 0.5) * 0.15, y + 0.7, z + 0.5 + (r() - 0.5) * 0.15, 0xff2a1a, 0, 0.3, 0, 0.05, 0.5, 0); break;
      case 'campfire': if (r() < dt * 6) PT.spawn(x + 0.3 + r() * 0.4, y + 0.6, z + 0.3 + r() * 0.4, r() < 0.5 ? 0x8a8a8a : 0xb0b0b0, (r() - 0.5) * 0.2, 1.6 + r() * 0.8, (r() - 0.5) * 0.2, 0.12 + r() * 0.08, 3 + r() * 2, -0.1); break;
      case 'fire': if (r() < dt * 2) PT.spawn(x + r(), y + 0.8, z + r(), 0x4a4a4a, 0, 1.2, 0, 0.14, 1.2, -0.1); break;
      case 'portal': if (r() < dt * 4) PT.spawn(x + r(), y + r(), z + r(), r() < 0.5 ? 0xb05aff : 0x7a1ad8, (r() - 0.5) * 1.2, (r() - 0.5) * 1.2, (r() - 0.5) * 1.2, 0.06, 1, 0); break;
      case 'lavatop': if (r() < dt * 0.15) { PT.burst(x + 0.5, y + 1, z + 0.5, [0xff8a1a, 0xffd04a, 0x333333], 4, 1.5, 0.08); if (P.pos.distanceTo(new THREE.Vector3(x, y, z)) < 10 && r() < 0.3) Sound.play('dig', new THREE.Vector3(x, y, z), ID.lava); } break;
      case 'dripw': case 'dripl': if (r() < dt * 0.25) PT.spawn(x + 0.2 + r() * 0.6, y - 0.05, z + 0.2 + r() * 0.6, kind === 'dripw' ? 0x3a6ad8 : 0xff7a1a, 0, 0, 0, 0.06, 1.2, 9); break;
      case 'hopper': if (hopNow) G.tickHopper(x, y, z, d); break;
      case 'shrieker': {
        // a shrieker hears you walking nearby: it screams, it goes dark, and after a few warnings the warden comes
        const moving = !P.sneaking && Math.hypot(P.vel.x, P.vel.z) > 0.6, near = Math.hypot(P.pos.x - x - 0.5, P.pos.y - y, P.pos.z - z - 0.5) < 8;
        if (near && moving && P.mode === 'survival' && performance.now() > (G.shriekAt || 0)) {
          G.shriekAt = performance.now() + 10000; G.warnings = (G.warnings || 0) + 1;
          Sound.play('mob_phantom', new THREE.Vector3(x, y, z)); P.addEffect('darkness', 1, 12);
          G.particles.burst(x + 0.5, y + 1, z + 0.5, [0x2ad8e8, 0x0e3a4a], 14, 1.5, 0.12, -1);
          if (G.warnings >= 4 && !G.mobs.some(m => m.type === 'warden' && !m.dead)) { G.warnings = 0; for (let t = 0; t < 10; t++) { const wx = x + (Math.random() * 10 | 0) - 5, wz = z + (Math.random() * 10 | 0) - 5; if (!W.getBlock(wx, y, wz) && !W.getBlock(wx, y + 1, wz) && !W.getBlock(wx, y + 2, wz)) { const w = spawnMob('warden', wx + 0.5, y, wz + 0.5); w.anger = 80; G.ui.message('The Warden is coming out of the ground!', 'purple'); break; } } }
          else G.ui.message(['The shrieker screamed...', 'Something heard that...', 'It is getting closer...'][Math.min(2, G.warnings - 1)], 'purple');
        }
        break;
      }
      case 'juke': G.tickJuke(x, y, z); break;
      case 'frame': G.tickFrame(x, y, z, d, frames); break;
      case 'endrod': if (r() < dt * 0.8) PT.spawn(x + 0.5, y + 0.5 + r() * 0.5, z + 0.5, 0xffffff, (r() - 0.5) * 0.6, (r() - 0.5) * 0.4, (r() - 0.5) * 0.6, 0.05, 1.5, 0); break;
      case 'sculk': if (r() < dt * 0.4) PT.spawn(x + 0.5, y + 0.6, z + 0.5, 0x2ad8e8, 0, 0.5, 0, 0.06, 0.8, 0); break;
      case 'ench': {
        books.add(x + ',' + y + ',' + z);
        // letters fly from nearby bookshelves into the table
        if (r() < dt * 3) for (let k = 0; k < 6; k++) {
          const ox = (r() * 5 | 0) - 2, oz = (r() * 5 | 0) - 2;
          if ((Math.abs(ox) === 2 || Math.abs(oz) === 2) && (W.getBlock(x + ox, y, z + oz) === ID.bookshelf || W.getBlock(x + ox, y + 1, z + oz) === ID.bookshelf)) {
            PT.spawn(x + ox + 0.5, y + 1.6, z + oz + 0.5, r() < 0.5 ? 0xe8e0ff : 0x9a8ad8, -ox * 0.9, -0.6, -oz * 0.9, 0.05, 1.1, 0); break;
          }
        }
        break;
      }
      case 'furnace': {
        const f = G.furnaces && G.furnaces[chestKey(x, y, z)];
        if (f && f.burn > 0) {
          glows.add(x + ',' + y + ',' + z);
          const [fx, fz] = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[d.facing || 's'];
          if (r() < dt * 2) PT.spawn(x + 0.5 + fx * 0.55 + (r() - 0.5) * 0.4 * (1 - Math.abs(fx)), y + 0.25, z + 0.5 + fz * 0.55 + (r() - 0.5) * 0.4 * (1 - Math.abs(fz)), r() < 0.5 ? 0xffa020 : 0x555555, 0, 0.4, 0, 0.06, 0.6, 0);
          if (r() < dt * 0.8) PT.spawn(x + 0.5, y + 1.05, z + 0.5, 0x6a6a6a, 0, 0.8, 0, 0.12, 1.5, -0.1);
        }
        break;
      }
    }
  }
  // the enchanting table's book: floats, turns to look at you, and flips open when you come close
  for (const k of books) if (!A.books.has(k)) {
    const g = new THREE.Group();
    const cover = new THREE.MeshLambertMaterial({ color: 0x7a3a1a }), page = new THREE.MeshBasicMaterial({ color: 0xf0e8d0 });
    const L = new THREE.Group(), R = new THREE.Group();
    const lc = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.38), cover); lc.position.x = -0.15; L.add(lc);
    const lp = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.04, 0.34), page); lp.position.set(-0.14, 0.03, 0); L.add(lp);
    const rc = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.38), cover); rc.position.x = 0.15; R.add(rc);
    const rp = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.04, 0.34), page); rp.position.set(0.14, 0.03, 0); R.add(rp);
    g.add(L, R); g.userData = { L, R, open: 0 };
    const [x, y, z] = k.split(',').map(Number); g.position.set(x + 0.5, y + 1.1, z + 0.5);
    G.scene.add(g); A.books.set(k, g);
  }
  for (const [k, g] of A.books) {
    if (!books.has(k)) { G.scene.remove(g); A.books.delete(k); continue; }
    const [x, y, z] = k.split(',').map(Number), t = performance.now() / 1000;
    const near = Math.hypot(P.pos.x - x - 0.5, P.pos.z - z - 0.5) < 3.5;
    g.userData.open += ((near ? 1 : 0) - g.userData.open) * Math.min(1, dt * 3);
    const o = g.userData.open;
    g.position.y = y + 1.1 + Math.sin(t * 1.6) * 0.06;
    g.rotation.y = near ? Math.atan2(P.pos.x - x - 0.5, P.pos.z - z - 0.5) + Math.PI / 2 : t * 0.4;
    g.rotation.z = 0.15;
    g.userData.L.rotation.z = -(1 - o) * 1.45 + Math.sin(t * 5) * 0.06 * o;
    g.userData.R.rotation.z = (1 - o) * 1.45 - Math.sin(t * 5 + 1) * 0.06 * o;
  }
  for (const [k, F] of G.frameMeshes) if (!frames.has(k) && (A.scanT > 0.5)) { const [fx, fy, fz] = k.split(',').map(Number); if (!DEFS[W.getBlock(fx, fy, fz)].frame || Math.hypot(fx - P.pos.x, fz - P.pos.z) > 14) { G.scene.remove(F.mesh); G.frameMeshes.delete(k); } }
  // a cooking furnace: its door glows and flickers
  for (const k of glows) if (!A.glows.has(k)) {
    const [x, y, z] = k.split(','), d = DEFS[W.getBlock(+x, +y, +z)], [fx, fz] = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[d.facing || 's'];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.85 }));
    m.position.set(+x + 0.5 + fx * 0.502, +y + 0.3, +z + 0.5 + fz * 0.502); m.rotation.y = Math.atan2(fx, fz);
    G.scene.add(m); A.glows.set(k, m);
  }
  for (const [k, m] of A.glows) {
    if (!glows.has(k)) { G.scene.remove(m); A.glows.delete(k); continue; }
    m.material.opacity = 0.65 + Math.random() * 0.3; m.material.color.setHex(Math.random() < 0.5 ? 0xff9a2a : 0xffc04a);
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
/* ---------- beacons ----------
   A beacon on a pyramid (1 to 4 layers) of iron, gold, diamond, emerald or netherite blocks, with only sky
   (or glass) above it, shines a beam and gives its power to every player nearby, like Minecraft. */
const BEACON_BASE = new Set(['iron_block', 'gold_block', 'diamond_block', 'emerald_block', 'netherite_block']);
const BEACON_FX = { speed: ['Speed', 1], haste: ['Haste', 1], resistance: ['Resistance', 2], jump_boost: ['Jump Boost', 2], strength: ['Strength', 3], regeneration: ['Regeneration', 4] };
G.beaconLevel = (x, y, z) => {
  const W = G.world;
  let L = 0;
  for (let k = 1; k <= 4; k++) {
    for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx++) { const d = DEFS[W.getBlock(x + dx, y - k, z + dz)]; if (!d || !BEACON_BASE.has(d.key)) return L; }
    L = k;
  }
  return L;
};
G.beams = new Map();
G.tickBeacons = () => {
  const W = G.world, P = G.player, pcx = Math.floor(P.pos.x) >> 4, pcz = Math.floor(P.pos.z) >> 4, seen = new Set(), now = performance.now();
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
    const c = W.chunks.get(W.key(pcx + dx, pcz + dz));
    if (!c) continue;
    for (const L of W.emitters(c)) {
      const x = (pcx + dx) * 16 + L[0], y = L[1], z = (pcz + dz) * 16 + L[2], d = DEFS[W.getBlock(x, y, z)];
      if (!d || !d.beacon) continue;
      const lvl = G.beaconLevel(x, y, z), on = lvl > 0 && W.skyExposed(x, y, z), key = G.dim + ':' + x + ',' + y + ',' + z;
      if (!on) continue;
      seen.add(key);
      if (!G.beams.has(key)) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 300, 0.3), new THREE.MeshBasicMaterial({ color: 0x9afff8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        m.position.set(x + 0.5, y + 1 + 150, z + 0.5);
        G.scene.add(m); G.beams.set(key, m);
      }
      const fx = d.beacon.effect;
      if (fx && !P.dead && P.pos.distanceTo(new THREE.Vector3(x + 0.5, P.pos.y, z + 0.5)) <= 10 + lvl * 10 && Math.abs(P.pos.y - y) <= 60) {
        P.effects = P.effects || {};
        P.effects[fx] = { lvl: lvl >= 4 && fx !== 'regeneration' ? 2 : 1, until: now + 12000 };
      }
    }
  }
  for (const [k, m] of G.beams) if (!seen.has(k)) { G.scene.remove(m); m.geometry.dispose(); G.beams.delete(k); }
};
/* three wither skeleton skulls on top of a T of four soul sand: the Wither appears */
G.tryBuildWither = (x, y, z) => {
  const W = G.world, S = ID.soul_sand, K = ID.wither_skull;
  for (const [ax, az] of [[1, 0], [0, 1]]) for (const o of [-1, 0, 1]) {
    const cx = x - ax * o, cz = z - az * o; // the middle skull
    const ok = [-1, 0, 1].every(i => W.getBlock(cx + ax * i, y, cz + az * i) === K && W.getBlock(cx + ax * i, y - 1, cz + az * i) === S) && W.getBlock(cx, y - 2, cz) === S;
    if (!ok) continue;
    for (const i of [-1, 0, 1]) { W.setBlock(cx + ax * i, y, cz + az * i, 0); W.setBlock(cx + ax * i, y - 1, cz + az * i, 0); }
    W.setBlock(cx, y - 2, cz, 0);
    const m = spawnMob('wither', cx + 0.5, y - 1.5, cz + 0.5);
    m.shootCd = 3;
    G.explode(cx + 0.5, y, cz + 0.5, 3, true, false, null, 'The Wither came out with a blast.');
    G.ui.message('The Wither has awoken! Defeat it to get a Nether Star.', 'purple');
    return true;
  }
  return false;
};
G.tryBuildGolem = (x, y, z) => {
  const W = G.world;
  // a pumpkin on two snow blocks: a Snow Golem
  if (W.getBlock(x, y - 1, z) === ID.snow && W.getBlock(x, y - 2, z) === ID.snow) {
    for (const [bx, by, bz] of [[x, y, z], [x, y - 1, z], [x, y - 2, z]]) { W.setBlock(bx, by, bz, 0); G.particles.blockBreak(bx, by, bz, ID.snow); }
    spawnMob('snow_golem', x + 0.5, y - 2, z + 0.5);
    G.ui.message('You built a Snow Golem! It throws snowballs at monsters.', 'gold');
    return true;
  }
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

/* ---------- redstone: levers, buttons, pressure plates, redstone dust and redstone torches ----------
   Like Minecraft (a little simpler). Every 0.1 s the places around anything that changed are looked at again:
   - A switch that is on powers the blocks right next to it, and the block it is stuck to. That block then
     powers the things around it. A redstone torch powers the block above it; a Block of Redstone is always on.
   - Redstone dust carries power from those along the floor, up and down one step, getting weaker by one each
     block: up to 15 blocks away. Lit dust powers what is next to it and the block under it.
   - A redstone torch is on unless the block it is stuck to has power (that turns it off: a "NOT" gate).
   - Powered doors, trapdoors and fence gates open (and close when the power goes); powered TNT lights. */
const SUPPORT = { d: [0, -1, 0], n: [0, 0, -1], s: [0, 0, 1], w: [-1, 0, 0], e: [1, 0, 0] };
const NB6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const H4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const rsB = (x, y, z) => G.world.getBlock(x, y, z);
const rsD = (x, y, z) => DEFS[rsB(x, y, z)];
const switchOn = d => !!(d && ((d.lever && d.lever.on) || (d.button && d.button.on) || (d.plate && d.plate.on)));
const supportDir = d => (d.lever ? d.lever.d : d.button ? d.button.d : d.rsTorch ? d.rsTorch.d : 'd');
const supportOf = (x, y, z, d) => { const v = SUPPORT[supportDir(d)]; return [x + v[0], y + v[1], z + v[2]]; };
const fullBlock = d => !!(d && d.solid && d.opaque && !d.boxes && !d.box);
const torchOn = d => !!(d && d.rsTorch && d.rsTorch.on);
const wireOn = d => !!(d && d.wire && d.wire.on);
const isDevice = d => !!(d && (d.door || d.trapdoor || d.gate || d.key === 'tnt' || d.lamp || d.machine || (d.rail && d.rail.kind === 'powered')));
const REP_DIR = { n: [0, 0, -1], s: [0, 0, 1], w: [-1, 0, 0], e: [1, 0, 0] };
/* is there a lit repeater at (rx, ry, rz) pointing its front at (x, y, z)? */
const repInto = (rx, ry, rz, x, y, z) => { const d = rsD(rx, ry, rz); const r = d && (d.repeater || d.comparator); if (!r || !r.on) return false; const v = REP_DIR[r.dir]; return rx + v[0] === x && ry === y && rz + v[2] === z; };
/* a block with a switch stuck to it, or a lit redstone torch under it: strong power (it feeds dust too) */
function strongPowered(x, y, z) {
  for (const [a, b, c] of NB6) {
    const nx = x + a, ny = y + b, nz = z + c, d = rsD(nx, ny, nz);
    if (switchOn(d)) { const s = supportOf(nx, ny, nz, d); if (s[0] === x && s[1] === y && s[2] === z) return true; }
    if (b === -1 && torchOn(d)) return true; // a redstone torch powers the block above it
    if (repInto(nx, ny, nz, x, y, z)) return true; // a repeater pointing into it
  }
  return false;
}
/* how many dust neighbours a piece of dust joins up with (a dot or the end of a line points at things) */
function wireLinks(x, y, z) {
  const out = [];
  for (const [a, c] of H4) {
    if (rsD(x + a, y, z + c) && rsD(x + a, y, z + c).wire) out.push([x + a, y, z + c]);
    else if (!fullBlock(rsD(x, y + 1, z)) && rsD(x + a, y + 1, z + c) && rsD(x + a, y + 1, z + c).wire) out.push([x + a, y + 1, z + c]);
    else if (!fullBlock(rsD(x + a, y, z + c)) && rsD(x + a, y - 1, z + c) && rsD(x + a, y - 1, z + c).wire) out.push([x + a, y - 1, z + c]);
  }
  return out;
}
/* any power at all in this block (strong, or from dust on top of it or pointing into it) */
function weakPowered(x, y, z) {
  if (rsB(x, y, z) === ID.redstone_block || srcOn(rsD(x, y, z))) return true;
  if (strongPowered(x, y, z)) return true;
  if (wireOn(rsD(x, y + 1, z))) return true;
  for (const [a, c] of H4) if (wireOn(rsD(x + a, y, z + c)) && wireLinks(x + a, y, z + c).length <= 1) return true;
  return false;
}
/* is a door, trapdoor, gate or TNT here getting power? (doors skip pressure plates: a plate works them like a button you step on) */
function devicePowered(x, y, z, forDoor) {
  for (const [a, b, c] of NB6) {
    const nx = x + a, ny = y + b, nz = z + c, d = rsD(nx, ny, nz);
    if (!d) continue;
    if (forDoor && d.plate) continue;
    if (switchOn(d) || wireOn(d) || d.key === 'redstone_block' || srcOn(d)) return true;
    if (repInto(nx, ny, nz, x, y, z)) return true;
    if (torchOn(d)) { const s = supportOf(nx, ny, nz, d); if (!(s[0] === x && s[1] === y && s[2] === z)) return true; }
    if (fullBlock(d) && !d.lamp && weakPowered(nx, ny, nz)) return true;
  }
  return false;
}
/* where dust gets its power from (15) */
function wireSource(x, y, z) {
  for (const [a, b, c] of NB6) {
    const nx = x + a, ny = y + b, nz = z + c, d = rsD(nx, ny, nz);
    if (!d) continue;
    if (switchOn(d) || torchOn(d) || d.key === 'redstone_block' || srcOn(d)) return true;
    if (repInto(nx, ny, nz, x, y, z)) return true;
    if (fullBlock(d) && strongPowered(nx, ny, nz)) return true;
  }
  return false;
}
/* work out one whole line of dust: which pieces are lit */
function updateWireNet(x, y, z, done) {
  const key = (a, b, c) => a + ',' + b + ',' + c, nodes = new Map(), stack = [[x, y, z]];
  while (stack.length && nodes.size < 800) {
    const [a, b, c] = stack.pop(), k = key(a, b, c);
    if (nodes.has(k) || !(rsD(a, b, c) && rsD(a, b, c).wire)) continue;
    nodes.set(k, { p: [a, b, c], lvl: 0, links: wireLinks(a, b, c) });
    done.add(k);
    for (const n of nodes.get(k).links) stack.push(n);
  }
  const queue = [];
  for (const [k, n] of nodes) if (wireSource(...n.p)) { n.lvl = 15; queue.push(k); }
  for (let qi = 0; qi < queue.length; qi++) {
    const n = nodes.get(queue[qi]);
    if (n.lvl <= 1) continue;
    for (const p of n.links) { const m = nodes.get(key(...p)); if (m && m.lvl < n.lvl - 1) { m.lvl = n.lvl - 1; queue.push(key(...p)); } }
  }
  for (const n of nodes.values()) {
    const want = ID['redstone_wire_' + (n.lvl > 0 ? 1 : 0)];
    if (rsB(...n.p) !== want) G.world.setBlock(n.p[0], n.p[1], n.p[2], want);
  }
}
G.rsDirty = new Set();
G.devPow = new Map();
G.rsMark = (x, y, z) => { if (G.rsDirty.size < 4000) G.rsDirty.add(x + ',' + y + ',' + z); G.observerSaw(x, y, z); };
/* a repeater: what comes in at its back */
function repeaterInput(x, y, z, d) {
  const v = REP_DIR[(d.repeater || d.comparator).dir], bx = x - v[0], by = y, bz = z - v[2], b = rsD(bx, by, bz);
  if (!b) return false;
  if (wireOn(b) || switchOn(b) || torchOn(b) || b.key === 'redstone_block' || srcOn(b) || repInto(bx, by, bz, x, y, z)) return true;
  return fullBlock(b) && weakPowered(bx, by, bz);
}
G.rsPending = new Map(); // repeaters waiting to switch: key -> [time, wanted]
G.tickRedstone = () => {
  if (G.rsPending.size) {
    const now = performance.now();
    for (const [k, [at, want]] of G.rsPending) {
      if (now < at) continue;
      G.rsPending.delete(k);
      const [dim, xyz] = k.split(':'); if (dim !== G.dim) continue;
      const [x, y, z] = xyz.split(',').map(Number), d = rsD(x, y, z);
      if (d && d.repeater && d.repeater.on !== want) G.world.setBlock(x, y, z, ID['repeater_' + d.repeater.dir + '_' + d.repeater.delay + '_' + (want ? 1 : 0)]);
    }
  }
  if (!G.rsDirty.size) return;
  const list = [...G.rsDirty].slice(0, 300);
  for (const k of list) G.rsDirty.delete(k);
  const seen = new Set(), wires = [], things = [];
  for (const k of list) {
    const [x, y, z] = k.split(',').map(Number);
    for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const px = x + dx, py = y + dy, pz = z + dz, pk = px + ',' + py + ',' + pz;
      if (seen.has(pk)) continue;
      seen.add(pk);
      const d = rsD(px, py, pz);
      if (!d) continue;
      if (d.wire) wires.push([px, py, pz]); else if (d.rsTorch || d.repeater || d.comparator || isDevice(d)) things.push([px, py, pz]);
    }
  }
  const done = new Set();
  for (const w of wires) if (!done.has(w.join(','))) updateWireNet(w[0], w[1], w[2], done);
  const W = G.world;
  for (const [x, y, z] of things) {
    const d = rsD(x, y, z);
    if (!d) continue;
    if (d.rsTorch) {
      const s = supportOf(x, y, z, d), want = !weakPowered(s[0], s[1], s[2]);
      if (want !== d.rsTorch.on) W.setBlock(x, y, z, ID['redstone_torch_' + d.rsTorch.d + '_' + (want ? 1 : 0)]);
      continue;
    }
    if (d.comparator) {
      // a comparator: on when something behind it is on, or a box behind it has anything in it
      const v = REP_DIR[d.comparator.dir], h = holder(x - v[0], y, z - v[2], false);
      const want = repeaterInput(x, y, z, d) || !!(h && h.slots.some(Boolean)) || !!(rsD(x - v[0], y, z - v[2]) && rsD(x - v[0], y, z - v[2]).cauldron === 'water') || !!(rsD(x - v[0], y, z - v[2]) && rsD(x - v[0], y, z - v[2]).jukebox && G.chestSlots(x - v[0], y, z - v[2], false) && G.chestSlots(x - v[0], y, z - v[2], false)[0]);
      if (want !== d.comparator.on) W.setBlock(x, y, z, ID['comparator_' + d.comparator.dir + '_' + (want ? 1 : 0)]);
      continue;
    }
    if (d.rail) { const p = devicePowered(x, y, z) || weakPowered(x, y - 1, z); if (p !== d.rail.on) W.setBlock(x, y, z, ID['prail_' + d.rail.shape + '_' + (p ? 1 : 0)]); continue; }
    if (d.machine) {
      const p = devicePowered(x, y, z), k = G.dim + ':' + x + ',' + y + ',' + z, before = !!G.devPow.get(k);
      G.devPow.set(k, p);
      if (p !== before || (d.piston && p !== d.piston.ext)) G.machine(x, y, z, d, p);
      continue;
    }
    if (d.key === 'tnt') { if (devicePowered(x, y, z)) { W.setBlock(x, y, z, 0); G.primeTNT(x, y, z, 4); } continue; }
    if (d.lamp) { const p = devicePowered(x, y, z); if (p !== d.lamp.on) W.setBlock(x, y, z, ID['redstone_lamp_' + (p ? 1 : 0)]); continue; }
    if (d.repeater) {
      const want = repeaterInput(x, y, z, d), k = G.dim + ':' + x + ',' + y + ',' + z, pend = G.rsPending.get(k);
      if (want !== d.repeater.on && !(pend && pend[1] === want)) G.rsPending.set(k, [performance.now() + d.repeater.delay * 100 - 20, want]);
      else if (want === d.repeater.on && pend) G.rsPending.delete(k);
      continue;
    }
    if (d.door && d.door.half === 'upper') continue; // a door is looked at from its lower half
    let p = devicePowered(x, y, z, !!d.door);
    if (d.door && !p) p = devicePowered(x, y + 1, z, true);
    // a double door: power on either door opens both (otherwise the two would fight, opening and closing forever)
    if (d.door && !p) {
      const sd = d.door.hinge ? -1 : 1, px = d.door.ax === 'x' ? x + sd : x, pz = d.door.ax === 'z' ? z + sd : z, pd = rsD(px, y, pz);
      if (pd && pd.door && pd.door.ax === d.door.ax && !!pd.door.hinge !== !!d.door.hinge) p = devicePowered(px, y, pz, true) || devicePowered(px, y + 1, pz, true);
    }
    const k = G.dim + ':' + x + ',' + y + ',' + z, before = G.devPow.get(k), open = !!(d.door || d.trapdoor || d.gate).open;
    G.devPow.set(k, p);
    if (p && !before && !open) G.toggleDoor(x, y, z);
    else if (!p && before && open) G.toggleDoor(x, y, z);
  }
};

/* ================= machines: pistons, dispensers, droppers, hoppers, observers, note blocks, jukeboxes ================= */
const srcOn = d => !!(d && ((d.observer && d.observer.on) || (d.daylight && d.daylight.on) || (d.target && d.target.on) || (d.rail && d.rail.kind === 'detector' && d.rail.on)));
const NOT_PUSHABLE = d => !d || d.container || d.jukebox || d.noPush || d.hopper || d.base === 'furnace' || d.base === 'smoker' || d.base === 'blast_furnace' || d.key === 'chest' || d.key === 'chest_loot' || d.key === 'ender_chest' || d.shulker || d.key === 'bedrock' || d.key === 'obsidian' || d.key === 'crying_obsidian' || d.key === 'spawner' || d.beacon || d.key === 'enchanting_table' || d.key === 'end_portal_frame' || d.key === 'end_portal_frame_eye' || d.portal || d.bedPart || d.key === 'bed' || d.key === 'bed_head' || d.door || d.sign || d.frame || (d.piston && d.piston.ext) || d.respawn;
const breaksWhenPushed = d => d.liquid || d.replaceable || (d.cross && !d.solid) || d.key === 'torch' || d.wire || d.rsTorch || d.lever || d.button || d.plate || d.ladder || d.candle;
/* things inside other things: a stack goes into a list of slots (returns what didn't fit) */
function addToSlots(slots, it, from, to) {
  const def = DEFS[it.id], max = def.stack || 64;
  let left = it.count;
  for (let i = from || 0; i < (to || slots.length) && left > 0; i++) { const s = slots[i]; if (s && s.id === it.id && !s.e && !s.n && !s.c && !it.e && !it.n && !it.c && s.count < max) { const k = Math.min(max - s.count, left); s.count += k; left -= k; } }
  for (let i = from || 0; i < (to || slots.length) && left > 0; i++) if (!slots[i]) { slots[i] = Object.assign({}, it, { count: Math.min(max, left) }); left -= Math.min(max, left); }
  return left;
}
/* what's at a place that holds items: [slots, which slots to take from, which to put into, on change] */
function holder(x, y, z, fromAbove) {
  const d = rsD(x, y, z);
  if (!d) return null;
  if (d.container || d.key === 'chest' || d.key === 'chest_loot') { const k = chestKey(x, y, z); return { slots: G.chestSlots(x, y, z, true), take: [0, 27], put: [0, 27], done: () => G.chestChanged(k) }; }
  if (d.base === 'furnace' || d.base === 'smoker' || d.base === 'blast_furnace') { const f = G.furnaceAt(x, y, z, true), k = chestKey(x, y, z); return { slots: f.slots, take: [2, 3], put: fromAbove ? [0, 1] : [1, 2], done: () => G.furnaceChanged && G.furnaceChanged(k) }; }
  return null;
}
function takeOne(h) {
  for (let i = h.take[0]; i < h.take[1]; i++) { const s = h.slots[i]; if (s) { const it = Object.assign({}, s, { count: 1 }); if (--s.count <= 0) h.slots[i] = null; return it; } }
  return null;
}
G.machine = (x, y, z, d, powered) => {
  if (d.machine === 'note') { if (powered) G.playNote(x, y, z, false); return; }
  if (d.machine === 'piston') { if (powered && !d.piston.ext) G.pistonPush(x, y, z, d); else if (!powered && d.piston.ext) G.pistonPull(x, y, z, d); return; }
  if ((d.machine === 'dispenser' || d.machine === 'dropper') && powered) G.dispense(x, y, z, d);
};
G.pistonPush = (x, y, z, d) => {
  const W = G.world, p = d.piston, v = DIR6[p.d], kind = p.sticky ? 'sticky_piston' : 'piston', cells = [];
  let cx = x + v[0], cy = y + v[1], cz = z + v[2];
  for (let i = 0; ; i++) {
    if (cy < 1 || cy >= WH) return false;
    const id = W.getBlock(cx, cy, cz), dd = DEFS[id];
    if (!id || breaksWhenPushed(dd)) { if (id && !dd.liquid) G.spawnDrop(ID[dd.drop || dd.key] || id, 1, cx + 0.5, cy + 0.5, cz + 0.5); break; }
    if (i >= 12 || NOT_PUSHABLE(dd)) return false;
    cells.push([cx, cy, cz, id]); cx += v[0]; cy += v[1]; cz += v[2];
  }
  for (let i = cells.length - 1; i >= 0; i--) { const [a, b, c, id] = cells[i]; W.setBlock(a + v[0], b + v[1], c + v[2], id); }
  W.setBlock(x + v[0], y + v[1], z + v[2], ID[kind + '_head_' + p.d]);
  W.setBlock(x, y, z, ID[kind + '_' + p.d + '_x']);
  // anything standing in the way gets pushed along
  const P = G.player, moved = [[x + v[0], y + v[1], z + v[2]], ...cells.map(([a, b, c]) => [a + v[0], b + v[1], c + v[2]])];
  for (const e of [P, ...G.mobs]) {
    if (e.dead || (e.remoteCtl)) continue;
    const ex = Math.floor(e.pos.x), ez = Math.floor(e.pos.z), ey = Math.floor(e.pos.y + 0.1);
    if (moved.some(([a, b, c]) => a === ex && c === ez && (b === ey || b === ey + 1 || (v[1] === 1 && b === ey - 1)))) { e.pos.x += v[0]; e.pos.y += v[1] * 1.05; e.pos.z += v[2]; if (v[1] > 0 && e.vel) e.vel.y = Math.max(e.vel.y, 2); }
  }
  G.sound.play('dig', new THREE.Vector3(x, y, z), ID.stone);
  return true;
};
G.pistonPull = (x, y, z, d) => {
  const W = G.world, p = d.piston, v = DIR6[p.d], kind = p.sticky ? 'sticky_piston' : 'piston';
  const hx = x + v[0], hy = y + v[1], hz = z + v[2], hd = DEFS[W.getBlock(hx, hy, hz)];
  if (hd && hd.pistonHead) W.setBlock(hx, hy, hz, 0);
  W.setBlock(x, y, z, ID[kind + '_' + p.d]);
  if (p.sticky) {
    const fx = hx + v[0], fy = hy + v[1], fz = hz + v[2], id = W.getBlock(fx, fy, fz), fd = DEFS[id];
    if (id && !NOT_PUSHABLE(fd) && !breaksWhenPushed(fd) && !W.getBlock(hx, hy, hz)) { W.setBlock(fx, fy, fz, 0); W.setBlock(hx, hy, hz, id); }
  }
  G.sound.play('dig', new THREE.Vector3(x, y, z), ID.stone);
};
G.dispense = (x, y, z, d) => {
  const W = G.world, slots = G.chestSlots(x, y, z, true), full = slots.map((s, i) => (s ? i : -1)).filter(i => i >= 0);
  if (!full.length) { G.sound.play('click', new THREE.Vector3(x, y, z)); return; }
  const i = full[Math.random() * full.length | 0], s = slots[i], k = DEFS[s.id].key, v = DIR6[d.facing6];
  const fx = x + v[0], fy = y + v[1], fz = z + v[2], front = W.getBlock(fx, fy, fz);
  const take = () => { if (--s.count <= 0) slots[i] = null; };
  const from = new THREE.Vector3(x + 0.5 + v[0] * 0.7, y + 0.5 + v[1] * 0.7, z + 0.5 + v[2] * 0.7), dir = new THREE.Vector3(v[0], v[1] + 0.1, v[2]).normalize();
  let done = false;
  if (d.machine === 'dropper') {
    const h = holder(fx, fy, fz, v[1] < 0);
    if (h) { if (addToSlots(h.slots, Object.assign({}, s, { count: 1 }), h.put[0], h.put[1]) === 0) { take(); h.done(); } done = true; }
  } else if (k === 'arrow' || k === 'snowball' || k === 'wind_charge') { G.spawnProjectile(k, from, dir.multiplyScalar(k === 'arrow' ? 26 : 20), null); take(); done = true; }
  else if (DEFS[s.id].splash) { const pr = G.spawnProjectile('potion', from, dir.multiplyScalar(14), null); take(); done = true; G.projectiles[G.projectiles.length - 1].potion = DEFS[s.id].splash; }
  else if ((k === 'water_bucket' || k === 'lava_bucket') && (!front || DEFS[front].replaceable)) { W.setBlock(fx, fy, fz, k === 'water_bucket' ? ID.water : ID.lava); slots[i] = { id: ID.bucket, count: 1 }; done = true; }
  else if (k === 'bucket' && (front === ID.water || front === ID.lava)) { W.setBlock(fx, fy, fz, 0); if (s.count === 1) slots[i] = { id: front === ID.water ? ID.water_bucket : ID.lava_bucket, count: 1 }; else { take(); addToSlots(slots, { id: front === ID.water ? ID.water_bucket : ID.lava_bucket, count: 1 }); } done = true; }
  else if (k === 'bone_meal' && front) { if (G.boneMeal(fx, fy, fz)) take(); done = true; }
  else if (k === 'flint_and_steel' && !front) { W.setBlock(fx, fy, fz, ID.fire); done = true; }
  else if (k === 'tnt' && !front) { G.primeTNT(fx, fy, fz, 4); take(); done = true; }
  if (!done) { G.spawnDrop(s.id, 1, from.x, from.y - 0.2, from.z, new THREE.Vector3(v[0] * 4, v[1] * 4 + 1.5, v[2] * 4), slotExtras(s)); take(); }
  G.chestChanged(chestKey(x, y, z));
  G.sound.play('click', new THREE.Vector3(x, y, z));
  G.particles.burst(from.x, from.y, from.z, [0x8a8a8a, 0xcccccc], 5, 1, 0.08);
};
/* hoppers move one item every half second: out of what's above them (or picked up off the floor) into what they point at */
G.tickHopper = (x, y, z, d) => {
  const W = G.world, v = d.hopper === 'd' ? [0, -1, 0] : DIR6[d.hopper];
  let tx = x + v[0], ty = y + v[1], tz = z + v[2];
  // a chain of hoppers: pass straight on (a few at most)
  for (let n = 0; n < 4; n++) { const td = rsD(tx, ty, tz); if (!td || !td.hopper) break; const w = td.hopper === 'd' ? [0, -1, 0] : DIR6[td.hopper]; tx += w[0]; ty += w[1]; tz += w[2]; }
  const dst = holder(tx, ty, tz, ty < y);
  if (!dst) return;
  let it = null;
  const src = holder(x, y + 1, z, false);
  if (src) { it = takeOne(src); if (it) src.done(); }
  if (!it) {
    // items lying on top of the hopper fall in
    const drop = G.drops.find(dr => !dr.done && !dr.owner && dr.pos.x >= x && dr.pos.x < x + 1 && dr.pos.z >= z && dr.pos.z < z + 1 && dr.pos.y >= y + 0.5 && dr.pos.y < y + 2);
    if (drop) { const left = addToSlots(dst.slots, { id: drop.id, count: drop.count, e: drop.e, n: drop.n, c: drop.c }, dst.put[0], dst.put[1]); if (left < drop.count) { if (left === 0) { Net.dropPicked(drop.did); drop.finish(); } else drop.count = left; dst.done(); } return; }
    return;
  }
  if (addToSlots(dst.slots, it, dst.put[0], dst.put[1]) > 0) { addToSlots(src.slots, it); src.done(); } else dst.done();
};
/* observers: when the block in front of one changes, it sends out a short pulse */
G.observerSaw = (x, y, z) => {
  for (const [a, b, c] of NB6) {
    const ox = x - a, oy = y - b, oz = z - c, d = rsD(ox, oy, oz);
    if (!d || !d.observer || d.observer.on) continue;
    const v = DIR6[d.observer.d];
    if (v[0] !== a || v[1] !== b || v[2] !== c) continue;
    const dim = G.dim, k = ox + ',' + oy + ',' + oz;
    G.obsBusy = G.obsBusy || new Set();
    if (G.obsBusy.has(k)) continue;
    G.obsBusy.add(k);
    setTimeout(() => {
      if (G.dim !== dim) { G.obsBusy.delete(k); return; }
      const cur = rsD(ox, oy, oz);
      if (cur && cur.observer) G.world.setBlock(ox, oy, oz, ID['observer_' + cur.observer.d + '_1']);
      setTimeout(() => { G.obsBusy.delete(k); if (G.dim !== dim) return; const c2 = rsD(ox, oy, oz); if (c2 && c2.observer) G.world.setBlock(ox, oy, oz, ID['observer_' + c2.observer.d + '_0']); }, 200);
    }, 100);
  }
};
G.hitTarget = (x, y, z) => {
  const d = rsD(x, y, z); if (!d || !d.target) return;
  G.world.setBlock(x, y, z, ID.target_1); const dim = G.dim;
  setTimeout(() => { if (G.dim === dim && G.world.getBlock(x, y, z) === ID.target_1) G.world.setBlock(x, y, z, ID.target_0); }, 1000);
};
/* note blocks: each tap goes up a note; the block underneath picks the instrument */
G.notes = {};
G.playNote = (x, y, z, step) => {
  const k = chestKey(x, y, z);
  if (step) G.notes[k] = ((G.notes[k] || 0) + 1) % 25;
  const n = G.notes[k] || 0, f = 185 * Math.pow(2, n / 12), under = DEFS[G.world.getBlock(x, y - 1, z)] || {}, pos = new THREE.Vector3(x, y, z);
  const S = Sound; if (!S.ctx || S.ctx.state !== 'running') return;
  const v = clamp(1 - pos.distanceTo(G.player.pos) / 40, 0, 1) * 0.12;
  if (under.tool === 'pick' && /stone|cobble|brick|deepslate|ore/.test(under.key || '')) S.noise(0.12, v * 3, 120 + n * 6, 'lowpass');
  else if (under.key === 'sand' || under.key === 'gravel') S.noise(0.08, v * 2, 2000 + n * 60, 'bandpass');
  else if (under.glassy) S.noise(0.03, v * 2, 5000, 'highpass');
  else if (under.tool === 'axe') S.tone(f / 2, 0.4, 'sawtooth', v * 0.8, f / 2);
  else if (under.key === 'gold_block') S.tone(f * 2, 0.8, 'sine', v);
  else S.tone(f, 0.5, 'triangle', v);
  G.particles.spawn(x + 0.5, y + 1.2, z + 0.5, [0x5ad84a, 0xd8d84a, 0xd84a4a, 0x4a8ad8, 0xd84ad8][n % 5], 0, 0.8, 0, 0.12, 0.6, 0);
};
/* jukeboxes: a music disc plays its own little tune (every disc has a different one) */
G.juke = {};
const DISC_SONGS = {};
function discSong(k) {
  if (DISC_SONGS[k]) return DISC_SONGS[k];
  const r = mulberry32(hashStr('disc' + k)), scale = [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 3, 7, 8], [0, 2, 4, 5, 7, 9, 11]][r() * 4 | 0];
  const root = 196 * Math.pow(2, (r() * 7 | 0) / 12), beat = 0.18 + r() * 0.16, wave = ['triangle', 'sine', 'square', 'sawtooth'][r() * 4 | 0];
  const motif = Array.from({ length: 8 }, () => [scale[r() * scale.length | 0] + 12 * (r() * 2 | 0), 1 + (r() < 0.3 ? 1 : 0)]);
  const notes = [];
  for (let bar = 0; bar < 8; bar++) for (const [p, len] of motif) notes.push([p + (bar % 4 === 3 ? scale[1] : bar % 2 ? -12 : 0), len]);
  return (DISC_SONGS[k] = { notes, root, beat, wave });
}
G.tickJuke = (x, y, z) => {
  const k = chestKey(x, y, z), slots = G.chestSlots(x, y, z, false), disc = slots && slots[0] && DEFS[slots[0].id].disc;
  const now = performance.now() / 1000;
  if (!disc) { delete G.juke[k]; return; }
  let J = G.juke[k];
  if (!J || J.disc !== disc) J = G.juke[k] = { disc, i: 0, at: now };
  const song = discSong(disc), pos = new THREE.Vector3(x, y, z), v = clamp(1 - pos.distanceTo(G.player.pos) / 48, 0, 1);
  while (J.at < now + 0.3) {
    const [p, len] = song.notes[J.i % song.notes.length];
    const S = Sound, when = Math.max(0, J.at - now);
    if (v > 0.02 && S.ctx && S.ctx.state === 'running') { S.tone(song.root * Math.pow(2, p / 12), song.beat * len * 0.9, song.wave, 0.06 * v, null, when); if (J.i % 4 === 0) S.tone(song.root / 2 * Math.pow(2, (song.notes[J.i % song.notes.length][0] % 12) / 12), song.beat * 3.5, 'sine', 0.05 * v, null, when); }
    J.at += song.beat * len; J.i++;
  }
  if (Math.random() < 0.05) G.particles.spawn(x + 0.5, y + 1.2, z + 0.5, [0x5ad84a, 0xd84ad8, 0x4a8ad8][J.i % 3], (Math.random() - 0.5) * 0.4, 0.8, 0, 0.1, 1, 0);
};
/* item frames show what's in them */
G.frameMeshes = new Map();
G.tickFrame = (x, y, z, d, seen) => {
  const k = x + ',' + y + ',' + z, slots = G.chestSlots(x, y, z, false), it = slots && slots[0];
  seen.add(k);
  let F = G.frameMeshes.get(k);
  if (F && (!it || F.id !== it.id)) { G.scene.remove(F.mesh); G.frameMeshes.delete(k); F = null; }
  if (!it || F) return;
  const mesh = new THREE.Mesh(itemGeometry(it.id), G.mats.item);
  const o = { w: [0.1, 0, 0, Math.PI / 2], e: [0.9, 0, 0, -Math.PI / 2], n: [0, 0, 0.1, 0], s: [0, 0, 0.9, Math.PI] }[d.frame];
  mesh.position.set(x + (d.frame === 'w' || d.frame === 'e' ? o[0] : 0.5), y + 0.5, z + (d.frame === 'n' || d.frame === 's' ? o[2] : 0.5));
  mesh.rotation.y = o[3]; mesh.scale.setScalar(DEFS[it.id].isBlock && !DEFS[it.id].cross ? 0.4 : 0.55);
  G.scene.add(mesh); G.frameMeshes.set(k, { mesh, id: it.id });
};
/* potions: what each one does to you */
const POTION_FX = { speed: [180, 1], jump_boost: [180, 1], strength: [180, 1], regeneration: [45, 1], fire_resistance: [180, 1], night_vision: [180, 1], invisibility: [180, 1], poison: [45, 1], weakness: [90, 1], slow_falling: [90, 1], water_breathing: [180, 1] };
const FX_NAMES = { mining_fatigue: 'Mining Fatigue', darkness: 'Darkness', levitation: 'Levitation', speed: 'Speed', jump_boost: 'Jump Boost', strength: 'Strength', regeneration: 'Regeneration', fire_resistance: 'Fire Resistance', night_vision: 'Night Vision', invisibility: 'Invisibility', poison: 'Poison', weakness: 'Weakness', slow_falling: 'Slow Falling', water_breathing: 'Water Breathing', haste: 'Haste', resistance: 'Resistance', absorption: 'Absorption' };
G.applyPotion = (who, k, mult) => {
  mult = mult || 1;
  if (who === G.player) {
    const P = G.player;
    if (k === 'healing') { P.health = Math.min(20, P.health + 4 * mult); return; }
    if (k === 'harming') { P.hurt(6 * mult, null, 0, true, 'A potion of harming hurt you.'); return; }
    const fx = POTION_FX[k]; if (fx) P.addEffect(k, fx[1], fx[0] * mult);
    if (k !== 'awkward') G.ui.message('You feel the ' + (FX_NAMES[k] || k) + ' potion working!', 'gold');
    return;
  }
  if (who instanceof Mob) {
    const undead = /zombie|skeleton|wither|drowned|husk|stray|phantom|bogged|zoglin/.test(who.type);
    if (k === 'healing') { if (undead) who.hurt(6 * mult, null, 0, false); else who.hp = Math.min(who.T.hp, who.hp + 4 * mult); }
    else if (k === 'harming') { if (undead) who.hp = Math.min(who.T.hp, who.hp + 4 * mult); else who.hurt(6 * mult, null, 0, false); }
    else if (k === 'poison' && !undead) who.hurt(4 * mult, null, 0, false);
  }
};
G.splashAt = (pos, k) => {
  G.particles.burst(pos.x, pos.y, pos.z, [0xffffff, 0xd8ecf8, 0xc84a8a], 24, 3, 0.12);
  G.sound.play('break', pos, ID.glass);
  const P = G.player, d = P.pos.distanceTo(pos);
  if (d < 4.5) G.applyPotion(P, k, d < 2 ? 1 : 0.6);
  for (const m of G.mobs) if (!m.dead && m.pos.distanceTo(pos) < 4.5) G.applyPotion(m, k, 1);
};

/* what a held compass, clock or map shows */
G.tickHeldHud = (k, dt) => {
  let box = $('held-hud');
  if (!box) { box = document.createElement('div'); box.id = 'held-hud'; box.style.cssText = 'position:fixed;right:12px;top:64px;z-index:5;pointer-events:none;color:#fff;font:bold 14px monospace;text-shadow:1px 1px 0 #000;text-align:center'; document.body.appendChild(box); }
  const P = G.player, show = G.state === 'play' && (k === 'compass' || k === 'recovery_compass' || k === 'clock' || k === 'map' || (k === 'spyglass' && G.zoom));
  if (!show) { if (!box.hidden) box.hidden = true; return; }
  box.hidden = false;
  if (box.dataset.k !== k) { box.dataset.k = k; box.innerHTML = k === 'map' ? '<canvas width="128" height="128" style="width:176px;height:176px;image-rendering:pixelated;border:4px solid #c8a870;background:#e8dcb8"></canvas>' : k === 'spyglass' ? '' : '<div class="hh-dial" style="width:72px;height:72px;border-radius:50%;border:4px solid #8a8a8a;background:#2a2a2a;position:relative;margin:auto"><div class="hh-needle" style="position:absolute;left:34px;top:6px;width:4px;height:30px;background:#e83030;transform-origin:2px 30px"></div></div><div class="hh-text" style="margin-top:4px"></div>'; G.mapAt = 0; }
  if (k === 'spyglass') { box.style.inset = '0'; box.style.background = 'radial-gradient(circle, transparent 38%, #000 40%)'; box.style.right = '0'; box.style.top = '0'; return; }
  box.style.inset = ''; box.style.background = ''; box.style.right = '12px'; box.style.top = '64px';
  if (k === 'compass' || k === 'recovery_compass') {
    // a compass points to where you first came into the world; a recovery compass to where you last died
    const ld = G.lastDeath, sp = k === 'recovery_compass' ? (ld && ld.dim === G.dim ? ld : P.pos) : P.spawn, a = Math.atan2(sp.x - P.pos.x, sp.z - P.pos.z), rel = a - (P.yaw + Math.PI);
    box.querySelector('.hh-needle').style.transform = 'rotate(' + (-rel) + 'rad)';
    box.querySelector('.hh-text').textContent = k === 'recovery_compass' ? (ld && ld.dim === G.dim ? Math.round(Math.hypot(sp.x - P.pos.x, sp.z - P.pos.z)) + ' blocks to where you died' : 'You haven\'t died here') : G.dim === 'overworld' ? Math.round(Math.hypot(sp.x - P.pos.x, sp.z - P.pos.z)) + ' blocks to spawn' : 'The needle spins here!';
    if (G.dim !== 'overworld' && k === 'compass') box.querySelector('.hh-needle').style.transform = 'rotate(' + (performance.now() / 150) + 'rad)';
  } else if (k === 'clock') {
    const t = (G.time + 0.25) % 1;
    box.querySelector('.hh-needle').style.transform = 'rotate(' + (t * Math.PI * 2 + Math.PI) + 'rad)';
    box.querySelector('.hh-dial').style.background = G.isNight() ? '#1a2a4a' : '#3a7ad8';
    box.querySelector('.hh-text').textContent = String(Math.floor(t * 24)).padStart(2, '0') + ':' + String(Math.floor((t * 24 % 1) * 60)).padStart(2, '0') + (G.isNight() ? ' night' : ' day');
  } else if (k === 'map' && performance.now() - (G.mapAt || 0) > 1200) {
    G.mapAt = performance.now();
    const c = box.querySelector('canvas'), ctx = c.getContext('2d'), img = ctx.createImageData(128, 128), W = G.world, px = Math.floor(P.pos.x), pz = Math.floor(P.pos.z);
    for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
      const x = px - 64 + i, z = pz - 64 + j, o = (j * 128 + i) * 4;
      if (!W.isLoaded(x, z)) { img.data[o] = 232; img.data[o + 1] = 220; img.data[o + 2] = 184; img.data[o + 3] = 255; continue; }
      const y = G.dim === 'nether' ? Math.min(W.surfaceY(x, z), 90) : W.surfaceY(x, z), id = W.getBlock(x, y, z), col = (DEFS[id] && DEFS[id].color) || [0, 0, 0];
      const shade = 0.75 + Math.max(-0.2, Math.min(0.25, (y - W.surfaceY(x, z - 1)) * 0.1));
      img.data[o] = col[0] * shade; img.data[o + 1] = col[1] * shade; img.data[o + 2] = col[2] * shade; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.save(); ctx.translate(64, 64); ctx.rotate(-P.yaw + Math.PI); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(4, 4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
};
/* tap a lever to flip it; tap a button to press it for a moment */
G.useSwitch = (x, y, z) => {
  const W = G.world, def = DEFS[W.getBlock(x, y, z)];
  if (def.repeater) {
    const r = def.repeater, nd = r.delay % 4 + 1;
    W.setBlock(x, y, z, ID['repeater_' + r.dir + '_' + nd + '_' + (r.on ? 1 : 0)]);
    Sound.play('click', new THREE.Vector3(x, y, z));
    G.ui.message('Repeater wait: ' + nd + (nd > 1 ? ' steps' : ' step') + ' (' + (nd / 10) + ' seconds).');
    return;
  }
  if (def.lever) {
    const on = !def.lever.on;
    W.setBlock(x, y, z, ID['lever_' + def.lever.d + '_' + (on ? 1 : 0)]);
    Sound.play('click', new THREE.Vector3(x, y, z));
  } else if (def.button && !def.button.on) {
    const b = def.button;
    W.setBlock(x, y, z, ID[b.kind + '_button_' + b.d + '_1']);
    Sound.play('click', new THREE.Vector3(x, y, z));
    const dim = G.dim;
    setTimeout(() => {
      if (G.dim !== dim) return;
      const cur = DEFS[G.world.getBlock(x, y, z)];
      if (cur && cur.button && cur.button.on) { G.world.setBlock(x, y, z, ID[b.kind + '_button_' + b.d + '_0']); Sound.play('click', new THREE.Vector3(x, y, z)); }
    }, b.kind === 'oak' ? 1500 : 1000);
  }
};
/* a switch was broken while on: its power stops */
G.switchGone = (x, y, z, def) => {
  if (def.plate) delete G.downPlates[G.dim + ':' + x + ',' + y + ',' + z];
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
      // a door next to the plate: step on to open it, step on again to close it (stepping off does nothing)
      const doneDoors = new Set();
      for (const [a, b, c] of NB6) for (const dy of [0, -1]) {
        const dx = x + a, ddy = y + b + dy, dz = z + c, dd = DEFS[W.getBlock(dx, ddy, dz)];
        if (!dd || !dd.door || dd.door.half !== 'lower' || doneDoors.has(dx + ',' + ddy + ',' + dz)) continue;
        doneDoors.add(dx + ',' + ddy + ',' + dz);
        G.toggleDoor(dx, ddy, dz);
      }
    }
  }
  for (const k in G.downPlates) {
    if (!k.startsWith(G.dim + ':') || now - G.downPlates[k] < 600) continue;
    delete G.downPlates[k];
    const [x, y, z] = k.slice(k.indexOf(':') + 1).split(',').map(Number), def = DEFS[W.getBlock(x, y, z)];
    if (def && def.plate && def.plate.on) { W.setBlock(x, y, z, ID[def.plate.kind + '_plate_0']); Sound.play('click', new THREE.Vector3(x, y, z)); }
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
const RIPE = () => ({ [ID.sweet_berry_bush]: ID.sweet_berry_bush_ripe, [ID.wheat_sprout]: ID.wheat_crop, [ID.carrot_sprout]: ID.carrot_crop, [ID.potato_sprout]: ID.potato_crop, [ID.pumpkin_stem]: ID.pumpkin });
/* bone meal: crops and berry bushes ripen, saplings grow into trees, grass sprouts flowers */
G.boneMeal = (x, y, z) => {
  const W = G.world, id = W.getBlock(x, y, z), d = DEFS[id];
  G.particles.burst(x + 0.5, y + 0.6, z + 0.5, [0x4ad84a, 0x9aff9a], 10, 1.2, 0.08, -1);
  if (d.sapling) { G.growTree(x, y, z, d.sapling); return true; }
  const ripe = RIPE()[id];
  if (ripe) { if (id === ID.pumpkin_stem) { G.crops[chestKey(x, y, z)] = 1; } else { W.setBlock(x, y, z, ripe); delete G.crops[chestKey(x, y, z)]; } return true; }
  if (id === ID.grass) {
    for (let i = 0; i < 14; i++) { const dx = (Math.random() * 7 | 0) - 3, dz = (Math.random() * 7 | 0) - 3; if (W.getBlock(x + dx, y, z + dz) === ID.grass && !W.getBlock(x + dx, y + 1, z + dz)) W.setBlock(x + dx, y + 1, z + dz, Math.random() < 0.7 ? ID.tall_grass : [ID.rose, ID.dandelion, ID.tulip_red, ID.oxeye_daisy, ID.cornflower, ID.allium][Math.random() * 6 | 0]); }
    return true;
  }
  if (id === ID.budding_amethyst) { for (const [a, b, c] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) if (!W.getBlock(x + a, y + b, z + c)) { W.setBlock(x + a, y + b, z + c, ID.amethyst_cluster); break; } return true; }
  return false;
};
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
    if (here === ID.sniffer_egg) {
      let t = typeof G.crops[k] === 'number' ? G.crops[k] : 300;
      if (--t > 0) { G.crops[k] = t; continue; }
      delete G.crops[k]; G.world.setBlock(x, y, z, 0); G.particles.blockBreak(x, y, z, ID.sniffer_egg);
      spawnMob('sniffer', x + 0.5, y, z + 0.5).makeBaby(1200); G.ui.message('A baby sniffer hatched!', 'gold');
      continue;
    }
    if (here === ID.turtle_egg) {
      let t = typeof G.crops[k] === 'number' ? G.crops[k] : 180;
      if (--t > 0) { G.crops[k] = t; continue; }
      delete G.crops[k]; G.world.setBlock(x, y, z, 0);
      G.particles.blockBreak(x, y, z, ID.turtle_egg);
      for (let i = 0; i < 1 + (Math.random() * 3 | 0); i++) { const b = spawnMob('turtle', x + 0.5 + (Math.random() - 0.5) * 0.5, y, z + 0.5 + (Math.random() - 0.5) * 0.5); b.makeBaby(600); }
      continue;
    }
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
  if (G.dim === 'overworld' && y <= 12 && W.deepDark && W.deepDark(x, z)) return 'ancient_city';
  if (G.dim === 'nether') { for (let dy = -3; dy <= 3; dy++) for (let d = -3; d <= 3; d++) if (W.getBlock(x + d, y + dy, z) === ID.gilded_blackstone || W.getBlock(x, y + dy, z + d) === ID.polished_blackstone_bricks) return 'bastion'; }
  if (G.dim === 'overworld') { let dk = 0; for (let d = -3; d <= 3; d++) { if (W.getBlock(x + d, y, z) === ID.dark_oak_log || W.getBlock(x + d, y - 1, z) === ID.birch_planks) dk++; } if (dk >= 3 && W.getBlock(x, y - 1, z) === ID.birch_planks || W.getBlock(x, y - 1, z) === ID.cobblestone && dk >= 2) return 'mansion'; }
  // a village building: what is in the room says whose chest it is
  if (G.dim === 'overworld' && y > SEA - 3 && W.villageAt && W.villageAt(cx, cz)) {
    const n = {};
    for (let dy = -1; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { let b = W.getBlock(x + dx, y + dy, z + dz); if (DEFS[b] && DEFS[b].base) b = ID[DEFS[b].base]; n[b] = (n[b] || 0) + 1; }
    if (n[ID.lava]) return 'v_blacksmith';
    if (n[ID.hay_bale] >= 2 && n[ID.furnace]) return 'v_butcher';
    if (n[ID.furnace] && (n[ID.crafting_table] || n[ID.iron_block])) return 'v_toolsmith';
    if (n[ID.stone_bricks] >= 12) return 'v_temple';
    return 'v_house';
  }
  if (shelves >= 4) return 'library';
  if (G.dim === 'nether') return 'ruined_portal';
  if (G.dim === 'end') return Math.hypot(x, z) > 500 ? 'end_city' : 'library';
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
/* an ender chest: the same private chest everywhere (for this player, in this world) */
G.openEnderChest = (x, y, z) => {
  if (!Array.isArray(G.enderChest) || G.enderChest.length !== 27) G.enderChest = new Array(27).fill(null);
  G.sound.play('click');
  G.ui.openInventory('chest', { slots: G.enderChest, ender: true, x, y, z });
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
    if (DEFS[G.world.getBlock(x, y, z)].base !== 'furnace') { delete G.furnaces[k]; continue; }
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
/* shulker boxes: what's inside goes with the box */
G.placeShulker = (x, y, z, held) => {
  const k = chestKey(x, y, z);
  G.chests = G.chests || {};
  G.chests[k] = held && held.c ? held.c.map(s => (s ? copySlot(s, s.count) : null)) : new Array(27).fill(null);
  G.chestChanged(k);
};
/* is there an open way (air, open doors, no walls or closed doors) from one place to another?
   A short search that heads straight for the goal; used so a wolf never jumps through a closed door */
G.airConnected = (ax, ay, az, bx, by, bz, max = 700) => {
  const W = G.world, k = (x, y, z) => x + ',' + y + ',' + z;
  const open = (x, y, z) => { const id = W.getBlock(x, y, z); return !id || !DEFS[id].solid; };
  ax = Math.floor(ax); ay = Math.floor(ay + 0.3); az = Math.floor(az); bx = Math.floor(bx); by = Math.floor(by + 0.3); bz = Math.floor(bz);
  if (!open(ax, ay, az)) ay++;
  const seen = new Set([k(ax, ay, az)]), heap = [[Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(az - bz), ax, ay, az]];
  for (let n = 0; heap.length && n < max; n++) {
    let bi = 0; for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i;
    const [, x, y, z] = heap.splice(bi, 1)[0];
    if (Math.abs(x - bx) + Math.abs(y - by) + Math.abs(z - bz) <= 1) return true;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const nx = x + dx, ny = y + dy, nz = z + dz, nk = k(nx, ny, nz);
      if (seen.has(nk) || ny < 0 || ny >= WH || !open(nx, ny, nz)) continue;
      seen.add(nk); heap.push([Math.abs(nx - bx) + Math.abs(ny - by) + Math.abs(nz - bz), nx, ny, nz]);
    }
  }
  return false;
};
/* ---------- fishing ----------
   Tap water with a fishing rod to cast. After a while the bobber splashes and dips: tap again quickly to
   reel in a fish (sometimes junk, now and then a treasure). Tapping too early just reels the line in. */
G.bobber = null;
G.removeBobber = () => {
  const b = G.bobber;
  if (!b) return;
  G.scene.remove(b.mesh); G.scene.remove(b.line); b.line.geometry.dispose();
  G.bobber = null;
};
G.fishRod = () => {
  const P = G.player, W = G.world;
  if (G.bobber) {
    const b = G.bobber;
    G.removeBobber();
    if (!b.biting) return;
    const r = Math.random();
    let k, n = 1, e;
    if (r < 0.6) k = 'cod';
    else if (r < 0.85) k = 'salmon';
    else if (r < 0.95) k = ['stick', 'string', 'leather', 'bone', 'rotten_flesh', 'bowl'][Math.random() * 6 | 0];
    else { k = ['name_tag', 'saddle', 'enchanted_book', 'bow'][Math.random() * 4 | 0]; if (k === 'enchanted_book') { const ks = Object.keys(ENCHANTS), ek = ks[Math.random() * ks.length | 0]; e = { [ek]: 1 + (Math.random() * ENCHANTS[ek].max | 0) }; } }
    if (ID[k] === undefined) k = 'cod';
    const left = P.inv.add(ID[k], n, e);
    if (left) G.spawnDrop(ID[k], left, P.pos.x, P.pos.y + 1, P.pos.z, undefined, e ? { e } : undefined);
    P.inv.changed(); P.addXp(1 + (Math.random() * 3 | 0));
    G.sound.play('pickup');
    G.ui.message('You caught ' + (k === 'cod' || k === 'salmon' ? 'a ' : '') + DEFS[ID[k]].name + (e ? ' (' + enchText(e) + ')' : '') + '!', 'gold');
    return;
  }
  const o = P.eyePos(), d = P.lookDir();
  const hit = W.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 24, true);
  if (!hit || hit.id !== ID.water) { G.ui.message('Throw the line into water.'); return; }
  let y = hit.y; while (W.getBlock(hit.x, y + 1, hit.z) === ID.water && y < hit.y + 10) y++;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.18), new THREE.MeshLambertMaterial({ color: 0xd83a3a }));
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.18), new THREE.MeshLambertMaterial({ color: 0xffffff })); top.position.y = 0.15; mesh.add(top);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x222222 }));
  G.scene.add(mesh); G.scene.add(line);
  const now = performance.now();
  G.bobber = { mesh, line, x: hit.x + 0.5, y: y + 0.95, z: hit.z + 0.5, biteAt: now + 4000 + Math.random() * 9000, biting: false, t: 0 };
  G.sound.play('click');
};
G.tickBobber = (dt) => {
  const b = G.bobber;
  if (!b) return;
  const P = G.player, held = P.heldDef(), now = performance.now();
  if (P.dead || !held || held.key !== 'fishing_rod' || Math.hypot(P.pos.x - b.x, P.pos.z - b.z) > 32 || G.world.getBlock(Math.floor(b.x), Math.floor(b.y - 0.95), Math.floor(b.z)) !== ID.water) { G.removeBobber(); return; }
  b.t += dt;
  if (!b.biting && now >= b.biteAt) {
    b.biting = true; b.biteEnd = now + 1400;
    G.particles.burst(b.x, b.y, b.z, [0xbfe0f0, 0xffffff, 0x6aa0e0], 14, 2, 0.08, -1);
    G.sound.play('pickup');
  } else if (b.biting && now > b.biteEnd) { b.biting = false; b.biteAt = now + 3000 + Math.random() * 7000; }
  b.mesh.position.set(b.x, b.y + (b.biting ? -0.25 : Math.sin(b.t * 2.5) * 0.04), b.z);
  // the line from your hand to the bobber
  const o = P.eyePos(), d = P.lookDir(), pts = b.line.geometry.attributes.position;
  pts.setXYZ(0, o.x + d.x * 0.6 + Math.cos(P.yaw) * 0.25, o.y - 0.2, o.z + d.z * 0.6 - Math.sin(P.yaw) * 0.25); pts.setXYZ(1, b.x, b.y + 0.15, b.z); pts.needsUpdate = true;
};
/* the nearest dog bed to where you sleep (or nothing) */
/* ---------- bees ----------
   A bee finds a nest or hive nearby, flies to flowers in the day, and brings the nectar home. After a few
   trips honey drips out of the front. At night and in the rain the bees stay around their home. */
G.hiveId = (id, full) => { const d = DEFS[id], base = d.base.replace('_full', ''); return ID[base + (full ? '_full' : '') + (d.facing === 's' ? '' : '_' + d.facing)]; };
G.honey = {};
const isFlower = id => { const d = DEFS[id]; return d && d.cross && /rose|dandelion|tulip|allium|orchid|daisy|cornflower|lily_of|sunflower|azalea/.test(d.key); };
G.findNear = (p, r, ry, test) => {
  const W = G.world, x0 = Math.floor(p.x), y0 = Math.floor(p.y), z0 = Math.floor(p.z);
  let best = null, bd = Infinity;
  for (let dy = -ry; dy <= ry; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const d = dx * dx + dy * dy + dz * dz; if (d >= bd) continue;
    if (test(W.getBlock(x0 + dx, y0 + dy, z0 + dz))) { bd = d; best = { x: x0 + dx, y: y0 + dy, z: z0 + dz }; }
  }
  return best;
};
G.beeGoal = (b, dt) => {
  const W = G.world, now = performance.now();
  if (now > (b.hiveCheck || 0)) {
    b.hiveCheck = now + 6000 + Math.random() * 2000;
    if (b.hive && !(DEFS[W.getBlock(b.hive.x, b.hive.y, b.hive.z)] || {}).hive) b.hive = null;
    if (!b.hive) b.hive = G.findNear(b.pos, 14, 6, id => DEFS[id] && DEFS[id].hive);
  }
  const atHome = G.isNight();
  if (b.hive && (atHome || b.nectar)) {
    const h = b.hive, dx = h.x + 0.5 - b.pos.x, dz = h.z + 0.5 - b.pos.z, dy = h.y + 0.3 - b.pos.y;
    if (b.nectar && dx * dx + dz * dz + dy * dy < 3.2) {
      b.nectar = false;
      const k = h.x + ',' + h.y + ',' + h.z, id = W.getBlock(h.x, h.y, h.z);
      G.honey[k] = (G.honey[k] || 0) + 1;
      if (G.honey[k] >= 3 && DEFS[id].hive === 'empty') { W.setBlock(h.x, h.y, h.z, G.hiveId(id, true)); G.honey[k] = 0; G.sound.play('honey', new THREE.Vector3(h.x, h.y, h.z)); }
    }
    const ph = b.phase || (b.phase = Math.random() * 6.28);
    return { x: h.x + 0.5 + Math.sin(now / 900 + ph) * (atHome ? 1.2 : 0), y: h.y + 0.2, z: h.z + 0.5 + Math.cos(now / 900 + ph) * (atHome ? 1.2 : 0) };
  }
  if (!b.nectar) {
    if (now > (b.flowerCheck || 0)) { b.flowerCheck = now + 4000 + Math.random() * 3000; if (!b.flower || !isFlower(W.getBlock(b.flower.x, b.flower.y, b.flower.z))) b.flower = G.findNear(b.pos, 8, 4, isFlower); }
    const f = b.flower;
    if (f) {
      const dx = f.x + 0.5 - b.pos.x, dz = f.z + 0.5 - b.pos.z;
      if (dx * dx + dz * dz < 1.2) {
        b.pollT = (b.pollT || 0) + dt;
        if (Math.random() < dt * 3) G.particles.burst(b.pos.x, b.pos.y, b.pos.z, [0xf8d040], 1, 0.3, 0.06);
        if (b.pollT > 2.5) { b.pollT = 0; b.nectar = true; b.flower = null; b.flowerCheck = now + 15000; }
      }
      return { x: f.x + 0.5, y: f.y + 0.7, z: f.z + 0.5 };
    }
  }
  return null;
};
/* shears or a glass bottle on a dripping nest; the bees get angry if you take their honey (or break their home) */
G.angerBees = (x, y, z, who) => { for (const m of G.mobs) if (m.type === 'bee' && !m.dead && !m.remoteCtl && Math.hypot(m.pos.x - x, m.pos.y - y, m.pos.z - z) < 14) { m.angry = true; m.angryAt = who; } };
G.harvestHive = (x, y, z, tool, P) => {
  const W = G.world, id = W.getBlock(x, y, z);
  W.setBlock(x, y, z, G.hiveId(id, false));
  if (tool === 'shears') G.spawnDrop(ID.honeycomb, 3, x + 0.5, y + 1, z + 0.5);
  else if (P.mode === 'survival') P.swapHeld(ID.honey_bottle); else P.inv.add(ID.honey_bottle, 1);
  G.sound.play('honey', new THREE.Vector3(x, y, z));
  // a campfire under the nest keeps them calm, like Minecraft
  let smoke = false; for (let d = 1; d <= 5; d++) if (W.getBlock(x, y - d, z) === ID.campfire) smoke = true;
  if (!smoke) { G.angerBees(x, y, z, P); G.ui.message('The bees are angry! Put a campfire under the nest to keep them calm.'); }
};
G.findDogBed = (x, y, z) => {
  const W = G.world;
  let best = null, bd = Infinity;
  for (let dy = -3; dy <= 3; dy++) for (let dz = -12; dz <= 12; dz++) for (let dx = -12; dx <= 12; dx++) {
    if (W.getBlock(x + dx, y + dy, z + dz) !== ID.dog_bed) continue;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) { bd = d; best = { x: x + dx, y: y + dy, z: z + dz }; }
  }
  return best;
};
G.openShulker = (x, y, z) => {
  const slots = G.chestSlots(x, y, z, true);
  G.sound.play('click');
  G.ui.openInventory('chest', { slots, x, y, z, shulker: true });
};
G.breakShulker = (x, y, z) => {
  G.shulkerId = G.shulkerId || (DEFS[G.world.getBlock(x, y, z)].shulker ? G.world.getBlock(x, y, z) : null); // same colour back
  const k = chestKey(x, y, z), slots = (G.chests && G.chests[k]) || null;
  const c = slots && slots.some(Boolean) ? slots.map(s => (s && !s.c ? copySlot(s, s.count) : null)) : undefined;
  // a box can't hold another full box: those come out on their own
  if (slots) for (const s of slots) if (s && s.c) G.spawnDrop(s.id, s.count, x + 0.5, y + 0.6, z + 0.5, undefined, slotExtras(s));
  G.spawnDrop(G.shulkerId || ID.shulker_box, 1, x + 0.5, y + 0.5, z + 0.5, undefined, c ? { c } : undefined);
  G.shulkerId = null;
  if (G.chests && G.chests[k]) { delete G.chests[k]; G.chestChanged(k); }
};
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
    if (m.tame || m.rider || m.penned || m.T.boat || m.leash || m.customName || m.T.boss) continue;
    if (d > (m.T.passive ? 160 : 64) || !W.isLoaded(m.pos.x, m.pos.z)) { m.remove(); continue; }
    if (m.T.passive) passive++; else hostile++;
  }
  if (G.dim === 'nether') { netherSpawn(hostile); return; }
  if (G.dim === 'end') { endSpawn(hostile); return; }
  structureSpawns();
  traderSpawn();
  // farm animals, horses and wolves: plenty of them around (monsters are counted separately)
  if (passive < 30 && Math.random() < 0.5) {
    const a = Math.random() * Math.PI * 2, r = 22 + Math.random() * 34;
    const x = Math.floor(P.pos.x + Math.cos(a) * r) + 0.5, z = Math.floor(P.pos.z + Math.sin(a) * r) + 0.5;
    if (W.isLoaded(x, z)) {
      const y = W.surfaceY(x, z), ground = W.getBlock(Math.floor(x), y, Math.floor(z));
      const b = W.biomeAt(x, z, W.heightAt(x, z)), R = Math.random();
      let type = null, n = 1 + (Math.random() * 3 | 0);
      if (ground === ID.water) {
        // the sea: squid, fish and dolphins (glow squid come out in the dark)
        const deep = W.getBlock(Math.floor(x), y - 3, Math.floor(z)) === ID.water;
        if (deep) {
          type = R < 0.25 ? 'squid' : R < 0.5 ? 'cod' : R < 0.65 ? 'salmon' : R < 0.75 ? 'dolphin' : R < 0.9 ? 'tropical_fish' : G.isNight() ? 'glow_squid' : 'squid';
          if (type === 'dolphin') n = 2;
          if (b === BIOME.MANGROVE && R < 0.3) type = 'axolotl';
          if (b === BIOME.WARM_OCEAN && R < 0.6) { type = 'tropical_fish'; n = 3; }
          if (b === BIOME.FROZEN_OCEAN && R < 0.5) type = 'salmon';
          for (let i = 0; i < n; i++) spawnMob(type, x + (Math.random() - 0.5) * 2, y - 1.5, z + (Math.random() - 0.5) * 2);
        }
        type = null;
      } else if (ground === ID.grass) {
        type = pick(PASSIVE_POOL);
        if (b === BIOME.BAMBOO && R < 0.6) { type = 'panda'; n = 1 + (Math.random() * 2 | 0); }
        else if ((b === BIOME.PLAINS || b === BIOME.SAVANNA) && R < 0.35) { type = Math.random() < 0.3 ? 'donkey' : 'horse'; n = 2 + (Math.random() * 2 | 0); }
        if ((b === BIOME.FOREST || b === BIOME.TAIGA || b === BIOME.BIRCH || b === BIOME.SNOWY) && Math.random() < 0.3) { type = 'wolf'; n = 2 + (Math.random() * 2 | 0); }
        else if ((b === BIOME.PLAINS || b === BIOME.FOREST || b === BIOME.SAVANNA) && Math.random() < 0.1) { type = 'cat'; n = 1 + (Math.random() < 0.3 ? 1 : 0); }
      }
      // each biome's own animals, like Minecraft
      if (ground && ground !== ID.water && Math.random() < 0.45) {
        const B = BIOME, r2 = Math.random();
        const extra = {
          [B.PLAINS]: r2 < 0.5 ? 'rabbit' : 'bee', [B.FOREST]: r2 < 0.5 ? 'bee' : 'fox', [B.BIRCH]: r2 < 0.6 ? 'bee' : 'fox',
          [B.TAIGA]: r2 < 0.6 ? 'fox' : 'rabbit', [B.SNOWY]: r2 < 0.4 ? 'polar_bear' : r2 < 0.7 ? 'fox' : 'rabbit',
          [B.MOUNTAIN]: r2 < 0.6 ? 'goat' : 'llama', [B.DESERT]: r2 < 0.6 ? 'rabbit' : 'camel',
          [B.JUNGLE]: r2 < 0.5 ? 'parrot' : r2 < 0.85 ? 'ocelot' : 'sniffer', [B.BAMBOO]: r2 < 0.6 ? 'parrot' : 'ocelot',
          [B.SAVANNA]: r2 < 0.45 ? 'armadillo' : r2 < 0.75 ? 'llama' : 'camel', [B.MANGROVE]: 'frog',
          [B.DARK_FOREST]: r2 < 0.35 ? 'mooshroom' : 'fox', [B.CHERRY]: r2 < 0.5 ? 'bee' : 'rabbit', [B.BEACH]: 'turtle',
          [B.SWAMP]: r2 < 0.6 ? 'frog' : 'chicken', [B.MUSHROOM]: 'mooshroom', [B.BADLANDS]: r2 < 0.6 ? 'armadillo' : 'rabbit', [B.ICE_SPIKES]: r2 < 0.5 ? 'polar_bear' : 'rabbit',
          [B.FLOWER_FOREST]: r2 < 0.6 ? 'bee' : 'rabbit', [B.MEADOW]: r2 < 0.5 ? 'bee' : r2 < 0.75 ? 'rabbit' : 'donkey', [B.SUNFLOWER_PLAINS]: r2 < 0.5 ? 'bee' : 'horse',
        }[b];
        if (b === BIOME.MUSHROOM && extra !== 'mooshroom') type = null; // only mooshrooms on mushroom islands
        if (extra) { type = extra; n = { bee: 2 + (Math.random() * 2 | 0), polar_bear: 1, sniffer: 1, camel: 1, turtle: 2, goat: 2, llama: 3 }[extra] || 1 + (Math.random() * 2 | 0); }
      }
      if (type && ground !== ID.water) for (let i = 0; i < n; i++) {
        const m = spawnMob(type, x + (Math.random() - 0.5) * 2, y + 1, z + (Math.random() - 0.5) * 2);
        // some animals come with babies (a polar bear mother with her cub)
        if (i > 0 && Math.random() < 0.2 && m.makeBaby && !m.T.horsey) m.makeBaby();
        if (type === 'polar_bear' && Math.random() < 0.6) spawnMob('polar_bear', m.pos.x + 1, m.pos.y, m.pos.z).makeBaby();
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
      const hb = W.biomeAt(x, z, W.heightAt(x, z)), outside = y > top;
      if (type === 'zombie' && hb === BIOME.DESERT && outside) type = 'husk';
      if (type === 'zombie' && Math.random() < 0.06) type = 'zombie_villager';
      if (type === 'skeleton' && (hb === BIOME.SWAMP || hb === BIOME.MANGROVE) && outside) type = 'bogged';
      // deep in the caves: cave spiders, bats and (rarely) a breeze
      if (!outside && y < 40) { const q = Math.random(); if (q < 0.12) type = 'cave_spider'; else if (q < 0.25) type = 'bat'; else if (q < 0.28) type = 'breeze'; }
      if (type === 'skeleton' && (hb === BIOME.SNOWY || hb === BIOME.TAIGA) && outside) type = 'stray';
      if (Math.random() < (hb === BIOME.SWAMP ? 0.2 : 0.06)) type = 'witch';
      if (outside && Math.random() < (hb === BIOME.MANGROVE || hb === BIOME.SWAMP ? 0.35 : 0.06)) type = 'slime';
      if (hb === BIOME.MUSHROOM) continue; // no monsters ever on mushroom islands, like Minecraft
      const cb = W.caveBiomeAt(x, y, z);
      if (cb === BIOME.DEEP_DARK) { if (Math.random() < 0.15 && !W.getBlock(x, y + 2, z) && !G.mobs.some(m => m.type === 'warden' && !m.dead)) type = 'warden'; }
      else if (cb === BIOME.LUSH_CAVES && W.liquidAt(x, y - 0.5, z) === ID.water) type = 'axolotl';
      if (type === 'enderman' && (W.getBlock(x, y + 2, z))) type = 'zombie';
      if (type === 'spider' && (W.getBlock(x + 1, y, z) || W.getBlock(x - 1, y, z))) type = 'skeleton';
      spawnMob(type, x + 0.5, y, z + 0.5);
      break;
    }
    // drowned climb out of the sea at night, and phantoms swoop down from the sky
    const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 20;
    const x = Math.floor(P.pos.x + Math.cos(a) * r), z = Math.floor(P.pos.z + Math.sin(a) * r);
    if (W.isLoaded(x, z)) {
      const top = W.surfaceY(x, z);
      const sb = W.biomeAt(x, z, W.heightAt(x, z));
      if (W.getBlock(x, top, z) === ID.water && W.getBlock(x, top - 6, z) === ID.water && (sb === BIOME.OCEAN || sb === BIOME.WARM_OCEAN || sb === BIOME.FROZEN_OCEAN) && Math.random() < 0.12) spawnMob('guardian', x + 0.5, top - 4, z + 0.5);
      else if (W.getBlock(x, top, z) === ID.water && Math.random() < 0.25) spawnMob('drowned', x + 0.5, top - 1, z + 0.5);
      else if (night && P.pos.y > 50 && Math.random() < 0.08 && !G.mobs.some(m => m.type === 'phantom' && !m.dead)) spawnMob('phantom', x + 0.5, Math.max(top, P.pos.y) + 18, z + 0.5);
    }
  }
}

/* now and then a wandering trader comes by in the day, with two llamas */
LOOT_TABLES.end_city = [3, 8, [['diamond', 2, 7, 5], ['iron_ingot', 4, 8, 10], ['gold_ingot', 2, 7, 15], ['emerald', 2, 6, 2], ['beetroot_seeds', 1, 10, 5], ['saddle', 1, 1, 3], ['iron_horse_armor', 1, 1, 1], ['golden_horse_armor', 1, 1, 1], ['diamond_horse_armor', 1, 1, 1], ['diamond_sword', 1, 1, 3], ['diamond_pickaxe', 1, 1, 3], ['diamond_chestplate', 1, 1, 3], ['iron_sword', 1, 1, 3], ['iron_chestplate', 1, 1, 3], ['enchanted_book', 1, 1, 4], ['firework_rocket', 2, 8, 6], ['elytra', 1, 1, 1]]];
// music discs turn up in dungeons and mineshafts
for (const [t, w] of [['dungeon', 3], ['mineshaft', 2], ['desert', 1], ['jungle', 1]]) for (const k of ['13', 'cat', 'blocks', 'chirp', 'far', 'mall', 'stal', 'pigstep']) if (LOOT_TABLES[t]) LOOT_TABLES[t][2].push(['disc_' + k, 1, 1, w]);
DEFS[ID.nether_wart_block].drop = (r) => [['nether_wart', 1 + (r() * 3 | 0)]];
function traderSpawn() {
  const P = G.player, W = G.world, now = performance.now();
  if (G.nextTrader === undefined) G.nextTrader = now + (4 + Math.random() * 6) * 60000;
  if (now < G.nextTrader || G.isNight() || P.dead) return;
  G.nextTrader = now + (12 + Math.random() * 12) * 60000;
  if (G.mobs.some(m => m.type === 'wandering_trader' && !m.dead)) return;
  for (let t = 0; t < 8; t++) {
    const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 10;
    const x = Math.floor(P.pos.x + Math.cos(a) * r) + 0.5, z = Math.floor(P.pos.z + Math.sin(a) * r) + 0.5;
    if (!W.isLoaded(x, z)) continue;
    const y = W.surfaceY(x, z), g = W.getBlock(Math.floor(x), y, Math.floor(z));
    if (!g || !DEFS[g].solid || DEFS[g].leaves || W.getBlock(Math.floor(x), y + 1, Math.floor(z)) || W.getBlock(Math.floor(x), y + 2, Math.floor(z))) continue;
    const tr = spawnMob('wandering_trader', x, y + 1, z);
    for (let i = 0; i < 2; i++) { const l = spawnMob('trader_llama', x + (i ? 1.5 : -1.5), y + 1, z + 1); l.trader = tr; }
    G.ui.message('A Wandering Trader has come by with his llamas!', 'gold');
    return;
  }
}
const NETHER_POOL = [['zombified_piglin', 34], ['piglin', 16], ['piglin_brute', 2], ['hoglin', 10], ['magma_cube', 10], ['strider', 12], ['wither_skeleton', 14], ['blaze', 16], ['ghast', 7]];
/* the End: endermen wander the island, and the dragon guards it until it is beaten */
function endSpawn(hostile) {
  const P = G.player, W = G.world;
  if (!G.endDragonDead && !G.dragons.some(d => !d.dead && d.kind === 'ender')) {
    const d = new Dragon('ender', new THREE.Vector3(0, 54, 0));
    G.dragons.push(d);
    G.ui.message('The Ender Dragon guards the End. Beat it to win!', 'purple');
    G.sound.play('dragonRoar', d.pos);
  }
  const pcx = Math.floor(P.pos.x) >> 4, pcz = Math.floor(P.pos.z) >> 4;
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    const c = W.chunks.get(W.key(pcx + dx, pcz + dz));
    if (!c) continue;
    if (c.frameItems && !c.frameDone) { c.frameDone = true; G.chests = G.chests || {}; for (const [x, y, z, k] of c.frameItems) { const key = 'end:' + x + ',' + y + ',' + z; if (!G.chests[key]) { G.chests[key] = new Array(27).fill(null); G.chests[key][0] = { id: ID[k], count: 1 }; } } }
    if (c.endCity && G.diff().mobs > 0) for (const [x, y, z] of c.endCity) {
      if (Math.hypot(P.pos.x - x, P.pos.z - z) > 40 || Math.random() > 0.05) continue;
      if (G.mobs.some(m => m.type === 'shulker' && !m.dead && Math.hypot(m.pos.x - x - 0.5, m.pos.y - y, m.pos.z - z - 0.5) < 1.5)) continue;
      const k = 'sh:' + x + ',' + y + ',' + z; G.deadShulkers = G.deadShulkers || {}; if (G.deadShulkers[k] >= 2) continue;
      if (!W.getBlock(x, y, z)) { const m = spawnMob('shulker', x + 0.5, y, z + 0.5); m.spotKey = k; }
    }
  }
  if (G.endDragonDead) G.placeGateway();
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
    if (type === 'strider') {
      // striders walk on the lava seas
      for (let yy = 20; yy < 60 && y < 0; yy++) if (W.getBlock(x, yy, z) === ID.lava && !W.getBlock(x, yy + 1, z) && !W.getBlock(x, yy + 2, z)) y = yy + 1;
      if (y < 0) continue;
    } else if (T.fly) {
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
    // piglins and piglin brutes guard bastions
    const bc = W.chunks.get(W.key(x >> 4, z >> 4));
    if (bc && bc.bastion && Math.random() < 0.5) { spawnMob(Math.random() < 0.3 ? 'piglin_brute' : 'piglin', bc.bastion.x + (Math.random() * 16 | 0) - 8, bc.bastion.y, bc.bastion.z + (Math.random() * 16 | 0) - 8); break; }
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
    // trial spawners: waves of monsters while you're near; beat them all for a trial key
    if (c.trials) for (const [sx, sy, sz] of c.trials) G.tickTrial(sx, sy, sz);
    // elder guardians guard the ocean monument, and guardians swim around it
    if (c.monument && G.diff().mobs > 0 && Math.hypot(P.pos.x - c.monument.x, P.pos.z - c.monument.z) < 48) {
      const M = c.monument, k = 'mon:' + M.x + ',' + M.z; G.deadShulkers = G.deadShulkers || {};
      if ((G.deadShulkers[k] || 0) < 3 && Math.random() < 0.1 && !G.mobs.some(m => m.type === 'elder_guardian' && !m.dead && Math.hypot(m.pos.x - M.x, m.pos.z - M.z) < 30)) { const m = spawnMob('elder_guardian', M.x + 0.5, M.y, M.z + 3.5); m.spotKey = k; }
      if (Math.random() < 0.15 && G.mobs.filter(m => m.type === 'guardian' && !m.dead && Math.hypot(m.pos.x - M.x, m.pos.z - M.z) < 30).length < 5) spawnMob('guardian', M.x + (Math.random() - 0.5) * 30, M.y + 3, M.z + (Math.random() - 0.5) * 30);
    }
    // the woodland mansion's residents
    if (c.mansion && G.diff().mobs > 0 && Math.hypot(P.pos.x - c.mansion.x, P.pos.z - c.mansion.z) < 48 && Math.random() < 0.15 && G.mobs.filter(m => (m.type === 'vindicator' || m.type === 'evoker' || m.type === 'allay') && !m.dead && Math.hypot(m.pos.x - c.mansion.x, m.pos.z - c.mansion.z) < 24).length < 6) {
      const M = c.mansion, f = Math.random() * 3 | 0, q = Math.random();
      spawnMob(q < 0.6 ? 'vindicator' : q < 0.85 ? 'evoker' : 'allay', M.x + 5 + (Math.random() * 6 | 0), M.y + f * 5, M.z + 4 + (Math.random() * 4 | 0));
    }
    // a witch lives in the swamp hut
    if (c.witchHut && G.diff().mobs > 0 && Math.random() < 0.2 && Math.hypot(P.pos.x - c.witchHut.x, P.pos.z - c.witchHut.z) < 48 && Math.hypot(P.pos.x - c.witchHut.x, P.pos.z - c.witchHut.z) > 6 && !G.mobs.some(m => m.type === 'witch' && !m.dead && Math.hypot(m.pos.x - c.witchHut.x, m.pos.z - c.witchHut.z) < 12)) spawnMob('witch', c.witchHut.x, c.witchHut.y, c.witchHut.z);
    // a creaking comes out of each creaking heart at night
    if (c.hearts && G.isNight() && G.diff().mobs > 0) for (const h of c.hearts) {
      if (!DEFS[W.getBlock(h[0], h[1], h[2])].creakingHeart || Math.hypot(P.pos.x - h[0], P.pos.z - h[2]) > 40 || Math.random() > 0.1) continue;
      if (G.mobs.some(m => m.type === 'creaking' && !m.dead && m.heart && m.heart[0] === h[0] && m.heart[2] === h[2])) continue;
      const x = h[0] + 0.5 + (Math.random() - 0.5) * 6, z = h[2] + 0.5 + (Math.random() - 0.5) * 6, y = W.surfaceY(x, z);
      if (!W.getBlock(Math.floor(x), y + 1, Math.floor(z)) && !W.getBlock(Math.floor(x), y + 2, Math.floor(z)) && !W.getBlock(Math.floor(x), y + 3, Math.floor(z))) { const m = spawnMob('creaking', x, y + 1, z); m.heart = h; }
    }
    // pillagers guard their outposts
    if (c.outpost && G.diff().mobs > 0) {
      const o = c.outpost, near = G.mobs.filter(m => !m.dead && m.type === 'pillager' && Math.hypot(m.pos.x - o.x, m.pos.z - o.z) < 40).length;
      if (near < 4 && Math.random() < 0.3 && Math.hypot(P.pos.x - o.x, P.pos.z - o.z) > 10) {
        const a = Math.random() * Math.PI * 2, x = o.x + Math.cos(a) * (6 + Math.random() * 6), z = o.z + Math.sin(a) * (6 + Math.random() * 6);
        if (W.isLoaded(x, z)) { const y = W.surfaceY(x, z); if (y > SEA && !W.getBlock(Math.floor(x), y + 1, Math.floor(z)) && !W.getBlock(Math.floor(x), y + 2, Math.floor(z))) { const q = Math.random(); spawnMob(q < 0.6 ? 'pillager' : q < 0.85 ? 'vindicator' : q < 0.93 ? 'evoker' : 'ravager', x, y + 1, z); } }
        // an allay or two hangs around the outpost
        if (Math.random() < 0.15 && !G.mobs.some(m => m.type === 'allay' && !m.dead && Math.hypot(m.pos.x - o.x, m.pos.z - o.z) < 40)) { const y = W.surfaceY(o.x, o.z); spawnMob('allay', o.x + 2, y + 2, o.z + 2); }
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
  return G.drops.filter(d => !d.done && d.count > 0).map(d => [d.id, d.count, +d.pos.x.toFixed(2), +d.pos.y.toFixed(2), +d.pos.z.toFixed(2), Math.round(d.age), d.did, d.e || 0, d.n || 0, d.c ? d.c.map(slotToArr) : 0]);
}
function restoreDrops(dim) {
  const list = (G.dimDrops && G.dimDrops[dim]) || [];
  for (const e of list) {
    if (!Array.isArray(e) || !DEFS[e[0]] || !(e[1] > 0) || !e.slice(2, 5).every(Number.isFinite)) continue;
    const d = G.spawnDrop(e[0], e[1], e[2], e[3], e[4], new THREE.Vector3(0, 0, 0), { did: e[6], remote: true, e: e[7], n: e[8], c: Array.isArray(e[9]) ? e[9] : undefined });
    d.age = +e[5] || 0; d.pickDelay = 0;
  }
  if (G.dimDrops) G.dimDrops[dim] = [];
}

function clearEntities() {
  if (G.removeBobber) G.removeBobber();
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
/* trial spawners: when you come close they send monsters, a few at a time; once all are beaten they give a trial key
   (and rest for half an hour before they wake again) */
G.trials = {};
const TRIAL_MOBS = ['zombie', 'skeleton', 'spider', 'husk', 'stray', 'bogged', 'slime', 'breeze', 'cave_spider', 'zombie'];
G.tickTrial = (x, y, z) => {
  const W = G.world, P = G.player, k = chestKey(x, y, z), id = W.getBlock(x, y, z);
  let T = G.trials[k] || (G.trials[k] = { spawned: 0, killed: 0, doneAt: 0 });
  if (id === ID.trial_spawner_done) { if (Date.now() - T.doneAt > 30 * 60000) { W.setBlock(x, y, z, ID.trial_spawner); G.trials[k] = { spawned: 0, killed: 0, doneAt: 0 }; } return; }
  if (id !== ID.trial_spawner || P.mode !== 'survival' || G.diff().mobs === 0) return;
  const near = Math.hypot(P.pos.x - x, P.pos.y - y, P.pos.z - z) < 14;
  if (!near) return;
  const alive = G.mobs.filter(m => m.trialKey === k && !m.dead).length, total = 6;
  if (T.killed >= total) {
    W.setBlock(x, y, z, ID.trial_spawner_done); T.doneAt = Date.now();
    G.spawnDrop(ID.trial_key, 1, x + 0.5, y + 1.2, z + 0.5);
    for (const [it, n] of [['bread', 2], ['arrow', 8], ['emerald', 2], ['golden_carrot', 2]]) if (Math.random() < 0.5) G.spawnDrop(ID[it], n, x + 0.5, y + 1.2, z + 0.5);
    G.particles.burst(x + 0.5, y + 1, z + 0.5, [0xffc040, 0xffffff], 20, 2.5, 0.12); Sound.play('levelup');
    G.ui.message('You beat the trial! Take the Trial Key to a Vault.', 'gold');
    return;
  }
  if (alive < 2 && T.spawned < total && Math.random() < 0.3) {
    const type = TRIAL_MOBS[Math.random() * TRIAL_MOBS.length | 0];
    for (let t = 0; t < 8; t++) {
      const mx = x + (Math.random() * 7 | 0) - 3, mz = z + (Math.random() * 7 | 0) - 3;
      if (!W.getBlock(mx, y, mz) && !W.getBlock(mx, y + 1, mz) && W.getBlock(mx, y - 1, mz)) {
        const m = spawnMob(type, mx + 0.5, y, mz + 0.5); m.trialKey = k; T.spawned++;
        G.particles.burst(mx + 0.5, y + 1, mz + 0.5, [0xff9a2a, 0x555555], 12, 1.5); break;
      }
    }
  }
  // monsters that ran off or vanished still count, so the trial can always be finished
  if (T.spawned > T.killed + alive) T.killed = T.spawned - alive;
};
LOOT_TABLES.ancient_city = [5, 10, [['echo_shard', 1, 3, 20], ['enchanted_golden_apple', 1, 1, 2], ['enchanted_book', 1, 1, 12], ['diamond_leggings', 1, 1, 4], ['diamond_hoe', 1, 1, 6], ['lead', 1, 1, 8], ['name_tag', 1, 1, 8], ['golden_apple', 1, 2, 10], ['bone', 1, 15, 15], ['soul_torch', 1, 15, 10], ['candle', 1, 4, 10], ['amethyst_shard', 1, 15, 8], ['disc_13', 1, 1, 4], ['disc_cat', 1, 1, 4], ['sculk', 4, 10, 10], ['iron_leggings', 1, 1, 6]]];
LOOT_TABLES.bastion = [4, 8, [['netherite_scrap', 1, 1, 6], ['ancient_debris', 1, 2, 5], ['gold_block', 1, 2, 8], ['gold_ingot', 3, 9, 20], ['diamond', 1, 3, 6], ['diamond_sword', 1, 1, 4], ['diamond_chestplate', 1, 1, 3], ['crying_obsidian', 2, 6, 10], ['magma_cream', 2, 6, 10], ['obsidian', 4, 6, 10], ['disc_pigstep', 1, 1, 2], ['golden_carrot', 4, 12, 10], ['enchanted_golden_apple', 1, 1, 1]]];
LOOT_TABLES.mansion = [3, 7, [['diamond_chestplate', 1, 1, 3], ['enchanted_book', 1, 1, 10], ['golden_apple', 1, 1, 15], ['enchanted_golden_apple', 1, 1, 2], ['lead', 1, 1, 15], ['name_tag', 1, 1, 15], ['disc_13', 1, 1, 10], ['disc_cat', 1, 1, 10], ['iron_hoe', 1, 1, 10], ['bread', 1, 1, 20], ['wheat', 1, 4, 20], ['redstone', 1, 4, 15], ['emerald', 1, 4, 10], ['totem_of_undying', 1, 1, 2]]];
LOOT_TABLES.vault = [2, 4, [['emerald', 2, 5, 20], ['diamond', 1, 2, 8], ['golden_apple', 1, 1, 8], ['enchanted_golden_apple', 1, 1, 1], ['heavy_core', 1, 1, 3], ['wind_charge', 4, 12, 15], ['enchanted_book', 1, 1, 10], ['iron_chestplate', 1, 1, 6], ['diamond_axe', 1, 1, 3], ['arrow', 8, 16, 10], ['golden_carrot', 2, 6, 10], ['disc_pigstep', 1, 1, 2], ['disc_far', 1, 1, 2]]];
G.openVault = (x, y, z) => {
  const W = G.world;
  W.setBlock(x, y, z, ID.vault_open);
  const loot = rollLoot(mulberry32((Math.random() * 1e9) | 0), 'vault');
  if (Math.random() < 0.15) loot.push([ID.heavy_core, 1]);
  for (const [it, n] of loot) G.spawnDrop(it, n, x + 0.5, y + 1.2, z + 0.5, new THREE.Vector3((Math.random() - 0.5) * 2, 4, (Math.random() - 0.5) * 2));
  G.particles.burst(x + 0.5, y + 1, z + 0.5, [0x5ad8f8, 0xffffff], 20, 2.5, 0.12); Sound.play('levelup');
};
/* rails join up with the rails beside them: straight, round a corner, or up a slope */
const RDV = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const RAIL_ENDS = { ns: ['n', 's'], ew: ['e', 'w'], ne: ['n', 'e'], nw: ['n', 'w'], se: ['s', 'e'], sw: ['s', 'w'], an: ['n', 's'], as: ['s', 'n'], ae: ['e', 'w'], aw: ['w', 'e'] };
const railD = (x, y, z) => { const d = DEFS[G.world.getBlock(x, y, z)]; return d && d.rail ? d : null; };
const railId = (kind, sh, on) => (kind === 'rail' ? ID['rail_' + sh] : kind === 'powered' ? ID['prail_' + sh + '_' + (on ? 1 : 0)] : ID['drail_' + sh + '_' + (on ? 1 : 0)]);
function railShapeFor(x, y, z, kind, look) {
  const ups = [], links = [];
  for (const k of ['n', 's', 'e', 'w']) { const [a, b] = RDV[k]; if (railD(x + a, y + 1, z + b)) ups.push(k); else if (railD(x + a, y, z + b) || railD(x + a, y - 1, z + b)) links.push(k); }
  if (ups.length && kind !== 'detector') return 'a' + ups[0];
  const ax = k => (k === 'n' || k === 's' ? 'ns' : 'ew');
  if (links.length >= 2 && kind === 'rail') {
    for (const [p, q] of [['n', 's'], ['e', 'w']]) if (links.includes(p) && links.includes(q)) return p + q;
    const v = links.find(k => k === 'n' || k === 's'), h = links.find(k => k === 'e' || k === 'w');
    if (v && h) return v + h;
  }
  if (links.length) return ax(links[0]);
  return look && Math.abs(look.x) > Math.abs(look.z) ? 'ew' : 'ns';
}
G.placeRail = (x, y, z, kind, look) => {
  const W = G.world;
  W.setBlock(x, y, z, railId(kind, railShapeFor(x, y, z, kind, look), false));
  // rails beside it that were only joined at one end turn to join this one
  for (const k of ['n', 's', 'e', 'w']) for (const dy of [0, -1, 1]) {
    const [a, b] = RDV[k], nx = x + a, ny = y + dy, nz = z + b, d = railD(nx, ny, nz);
    if (!d) continue;
    const joined = RAIL_ENDS[d.rail.shape].filter(e => { const [p, q] = RDV[e]; return railD(nx + p, ny, nz + q) || railD(nx + p, ny - 1, nz + q) || (d.rail.shape === 'a' + e && railD(nx + p, ny + 1, nz + q)); }).length;
    if (joined >= 2) continue;
    const sh = railShapeFor(nx, ny, nz, d.rail.kind);
    if (sh !== d.rail.shape) W.setBlock(nx, ny, nz, railId(d.rail.kind, sh, d.rail.on));
  }
};
/* the end gateway: a floating portal beside the main island that leads out to the outer islands (and back) */
G.placeGateway = () => {
  const W = G.worlds.end, gx = 90, gz = 0, gy = 70;
  if (!W.isLoaded(gx, gz) || W.getBlock(gx, gy, gz) === ID.end_gateway) return;
  for (const [a, b, c] of [[0, -1, 0], [0, 1, 0]]) W.setBlock(gx + a, gy + b, gz + c, ID.bedrock);
  W.setBlock(gx, gy, gz, ID.end_gateway);
};
G.useGateway = () => {
  const P = G.player, W = G.world, out = Math.hypot(P.pos.x, P.pos.z) < 400;
  let tx = 90, tz = 3, ty = 70;
  if (out) {
    // find the first outer island along this direction
    tx = 0;
    for (let d = 720; d < 1600 && !tx; d += 8) { const t = W.endTop(d, 0); if (t > 0 && W.endTop(d + 8, 0) > 0 && W.endTop(d + 16, 0) > 0) { tx = d + 8; ty = t + 1; } }
    if (!tx) { tx = 800; ty = 60; }
    tz = 0;
  }
  P.pos.set(tx + 0.5, ty + 0.2, tz + 0.5); P.vel.set(0, 0, 0); P.fallStart = null; P.gateCd = 2;
  loadAround(tx, tz, 2);
  if (out) {
    // an exit gateway on the new island to get back
    const ex = tx + 3, ey = Math.max(ty, W.endTop(ex, tz) + 1) + 3;
    W.setBlock(ex, ey - 1, tz, ID.bedrock); W.setBlock(ex, ey, tz, ID.end_gateway); W.setBlock(ex, ey + 1, tz, ID.bedrock);
    if (W.collides(P.pos.x, P.pos.y, P.pos.z, P.w, P.h)) P.pos.y = W.groundY(P.pos.x, P.pos.z) + 1;
    G.ui.message('The outer End islands! Look for End Cities: tall purple towers. Their ships hold an Elytra.', 'purple');
  } else { if (W.collides(P.pos.x, P.pos.y, P.pos.z, P.w, P.h)) P.pos.y += 3; G.ui.message('Back by the main island.', 'purple'); }
  Sound.play('teleport');
};
/* chorus fruit: you pop to a random safe place nearby */
G.chorusTeleport = () => {
  const P = G.player, W = G.world;
  for (let t = 0; t < 16; t++) {
    const x = Math.floor(P.pos.x + (Math.random() - 0.5) * 16), z = Math.floor(P.pos.z + (Math.random() - 0.5) * 16);
    for (let y = Math.floor(P.pos.y) + 8; y > Math.floor(P.pos.y) - 8; y--) {
      const g = W.getBlock(x, y - 1, z);
      if (g && DEFS[g].solid && !W.getBlock(x, y, z) && !W.getBlock(x, y + 1, z)) { G.particles.burst(P.pos.x, P.pos.y + 1, P.pos.z, [0xcc00fa, 0x8a5a8a], 12, 2); P.pos.set(x + 0.5, y, z + 0.5); P.vel.set(0, 0, 0); P.fallStart = null; Sound.play('teleport'); return; }
    }
  }
};
/* a firework: up it goes, then a burst of colour */
G.launchFirework = (x, y, z) => {
  const cols = [[0xff3a3a, 0xffd040], [0x3a8aff, 0xffffff], [0x5aff5a, 0xffff5a], [0xff5aff, 0x5affff]][Math.random() * 4 | 0];
  let h = 0; const dim = G.dim;
  const iv = setInterval(() => { h += 0.6; if (G.dim !== dim) { clearInterval(iv); return; } G.particles.spawn(x, y + h, z, 0xffd040, 0, 0, 0, 0.08, 0.4, 0); if (h > 14) { clearInterval(iv); for (let i = 0; i < 50; i++) { const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2; G.particles.spawn(x, y + h, z, cols[i % 2], Math.cos(a) * Math.cos(b) * 7, Math.sin(b) * 7, Math.sin(a) * Math.cos(b) * 7, 0.12, 1.4, 2); } Sound.play('explode', new THREE.Vector3(x, y + h, z)); } }, 40);
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
  // a charged respawn anchor in the Nether brings you back there
  const A = G.anchor;
  if (A && G.worlds && G.worlds.nether) {
    useDim('nether'); G.player.respawn(); G.player.pos.set(A.x + 0.5, A.y + 1, A.z + 0.5);
    loadAround(A.x, A.z, 1);
    const W = G.world, d = DEFS[W.getBlock(A.x, A.y, A.z)];
    if (d && d.anchor > 0) { W.setBlock(A.x, A.y, A.z, ID['respawn_anchor_' + (d.anchor - 1)]); return; }
    if (W.isLoaded(A.x, A.z)) { G.anchor = null; G.ui.message('Your respawn anchor had no charge left.', 'purple'); } else return;
  }
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
  P.inv = new Inventory(); P.reset(); P.mode = mode; P.sel = 0; G.enderChest = null;
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
  G.enderChest = Array.isArray(s.enderChest) ? new Array(27).fill(null).map((_, i) => slotFromArr(s.enderChest[i])) : null;
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
  G.anchor = s.anchor || null;
  G.trials = s.trials || {}; G.lastDeath = s.lastDeath || null;
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
    dim: G.dim, netherVisited: !!G.netherVisited, chests: G.chests || {}, enderChest: G.enderChest ? slotsJSON(G.enderChest) : null, signs: G.signs || {}, crops: G.crops || {}, oldGen: G.worlds.overworld.oldGen ? [...G.worlds.overworld.oldGen] : [], genVer: G.worlds.overworld.genVer ? Object.fromEntries(G.worlds.overworld.genVer) : {}, keepInventory: !!G.keepInventory, noFireSpread: !!G.noFireSpread, myFlag: G.myFlag || null, difficulty: G.difficulty, chestVer: G.chestVer || {}, furnaces: G.furnaces || {}, anchor: G.anchor || null, trials: G.trials || {}, lastDeath: G.lastDeath || null, drops: Object.assign({}, G.dimDrops || {}, { [G.dim]: serializeDrops() }), gen: G.worlds.overworld.legacy ? undefined : 2,
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
    } else if (!P.dead && G.dim === 'end' && G.world.touching(P, ID.end_gateway, 0.3)) {
      if (!(P.gateCd > 0)) G.useGateway();
    } else if (!P.dead && G.world.touching(P, ID.end_portal, 0)) {
      if (!P.portalCd) { if (G.dim === 'end') G.leaveEnd(); else G.enterEnd(); }
    } else { P.portalT = 0; P.portalCd = false; }
    if (P.gateCd > 0) P.gateCd -= dt;
    $('fx-portal').style.opacity = clamp((P.portalT || 0) / 2, 0, 0.85);
    { const fr = P.headInSnow ? 1 : clamp((P.freezeT || 0) / 7, 0, 0.9); const fe = $('fx-frost'); if (fe.style.opacity !== String(fr)) fe.style.opacity = fr; }

    if (G.pendingPets && G.pendingPets.length && G.world.isLoaded(P.pos.x, P.pos.z)) {
      const ready = G.pendingPets.filter(p => G.world.isLoaded(p[1], p[3]));
      G.pendingPets = G.pendingPets.filter(p => !G.world.isLoaded(p[1], p[3]));
      restorePets(ready);
    }
    G.tickBobber(dt);
    G.plateT = (G.plateT || 0) - dt;
    if (G.plateT <= 0) { G.plateT = 0.1; G.tickPlates(); G.tickRedstone(); }
    G.spawnT -= dt;
    if (G.spawnT <= 0) { G.spawnT = 1; spawnTick(); G.tickCrops(); G.tickGrass(); G.tickSigns(); G.tickFires(); G.beaconT = (G.beaconT || 0) + 1; if (G.beaconT % 2 === 0) G.tickBeacons(); }
    // no dragons outside the End
    if (G.dim !== 'end') for (const d of G.dragons) if (!d.done && !d.remoteCtl) d.remove();
    if (Date.now() - (G.fixAt || 0) > 3000) { G.fixAt = Date.now(); G.applyFixes(); }
    G.saveT += dt;
    if (G.saveT > 30) { G.saveT = 0; G.save(); }
  }
  G.ui.updateFriendArrow();
  G.ui.updateFlagArrow();
  // powers from a beacon
  {
    const box = $('effects'), now = performance.now(), list = [];
    for (const k in (P.effects || {})) { const e = P.effects[k]; if (e.until > now && (BEACON_FX[k] || FX_NAMES[k])) list.push((FX_NAMES[k] || BEACON_FX[k][0]) + (e.lvl > 1 ? ' II' : '')); }
    const t = list.join('  \u00b7  ');
    if (box.textContent !== t) box.textContent = t;
    if (box.hidden === !!t) box.hidden = !t;
  }
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
  G.tickAnim(dt);
  G.tickLids(dt);
  if (running) G.tickAmbient(dt);
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
  const heldK = P.heldDef && P.heldDef() ? P.heldDef().key : '';
  if (G.zoom && heldK !== 'spyglass') G.zoom = false;
  const fov = G.zoom ? 16 : 75 + (P.sprinting ? 8 : 0) + (P.flying && hs > 8 ? 6 : 0);
  G.tickHeldHud(heldK, dt);
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
  dressModel(G.playerModel, worn, [36, 37, 38, 39].reduce((m, i, k) => m | (P.inv.slots[i] && P.inv.slots[i].e ? 1 << k : 0), 0));
  { const k = 0.35 + 0.35 * Math.sin(performance.now() / 300); for (const M of GLINT_MATS) M.emissiveIntensity = k; }
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
    $('debug').textContent = `${G.fps} fps\nXYZ ${P.pos.x.toFixed(1)} ${P.pos.y.toFixed(1)} ${P.pos.z.toFixed(1)}\nBiome ${BIOME_NAMES[G.world.caveBiomeAt(P.pos.x, P.pos.y, P.pos.z) > 0 ? G.world.caveBiomeAt(P.pos.x, P.pos.y, P.pos.z) : G.world.biomeAt(bx, bz, h)]}\nChunks ${G.world.chunks.size}  Mobs ${G.mobs.length}\nTime ${Math.floor(((G.time + 0.25) % 1) * 24)}:00  Seed ${G.seed}`;
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
