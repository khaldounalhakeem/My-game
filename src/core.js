'use strict';
// ============================================================================
// BOOST LEAGUE — core constants, math helpers, persistence
// World units are "uu" (unreal units, ~1cm). Axes: x = width, y = up, z = length.
// Blue team defends the -z goal, Orange defends +z.
// ============================================================================

const PHYS = {
  TICK: 1 / 120,
  GRAVITY: 650,
  BALL_RADIUS: 92.75,
  BALL_MASS: 30,
  BALL_MAX_SPEED: 6000,
  BALL_MAX_SPIN: 6,
  BALL_DRAG: 0.0305,
  BALL_RESTITUTION: 0.6,
  BALL_FRICTION: 0.35,
  CAR_MASS: 180,
  CAR_MAX_SPEED: 2300,
  SUPERSONIC_START: 2200,
  SUPERSONIC_KEEP: 2100,
  BOOST_ACCEL: 991.667,
  BOOST_USE: 33.3,
  BOOST_START: 33.3,
  BRAKE_ACCEL: 3500,
  COAST_DECEL: 525,
  AIR_THROTTLE_ACCEL: 66.667,
  JUMP_IMPULSE: 291.667,
  JUMP_HOLD_ACCEL: 1458.333,
  JUMP_HOLD_TIME: 0.2,
  JUMP_MIN_TIME: 0.025,
  DOUBLE_JUMP_WINDOW: 1.25,
  DODGE_TIME: 0.65,
  FLIP_SPIN_TIME: 0.62,
  DODGE_IMPULSE: 500,
  STICKY_FORCE: 325,
  REST_HEIGHT: 17,
  MAX_ANG_VEL: 5.5,
  DEMO_RESPAWN: 3,
  PAD_BIG_TIME: 10,
  PAD_SMALL_TIME: 4,
};

// Steering curvature vs forward speed (1/turn radius)
const STEER_CURVE = [[0, 0.00690], [500, 0.00398], [1000, 0.00235], [1500, 0.001375], [1750, 0.0011], [2300, 0.00088]];
// Throttle acceleration vs forward speed
const THROTTLE_CURVE = [[0, 1600], [1400, 160], [1410, 0], [2300, 0]];
// Extra "psyonix" hit impulse scale vs relative speed
const HIT_SCALE_CURVE = [[0, 0.65], [500, 0.65], [2300, 0.55], [4600, 0.30]];

function curveLookup(curve, x) {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (x <= curve[i][0]) {
      const a = curve[i - 1], b = curve[i];
      return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
    }
  }
  return curve[curve.length - 1][1];
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sign = (v) => (v < 0 ? -1 : 1);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
function angleWrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

const V3 = THREE.Vector3;
const Q4 = THREE.Quaternion;
const UP = new V3(0, 1, 0);
const _tv = [];
for (let i = 0; i < 32; i++) _tv.push(new V3());
let _tvi = 0;
// rotating pool of scratch vectors (never hold on to these across calls)
function tmpV(x = 0, y = 0, z = 0) { const v = _tv[_tvi]; _tvi = (_tvi + 1) & 31; return v.set(x, y, z); }

const TEAM_COLORS = [
  { main: 0x2f7bff, light: 0x8fbcff, dark: 0x0b2a66, css: '#3d86ff', name: 'BLUE' },
  { main: 0xff7a1a, light: 0xffc08a, dark: 0x6b2600, css: '#ff8a2b', name: 'ORANGE' },
];

// ---------------------------------------------------------------------------
// Persistence (localStorage can be unavailable — every access is guarded)
// ---------------------------------------------------------------------------
const Store = {
  works() {
    if (this._works !== undefined) return this._works;
    try { localStorage.setItem('boostleague.t', '1'); this._works = localStorage.getItem('boostleague.t') === '1'; } catch (e) { this._works = false; }
    return this._works;
  },
  get(key, fallback) {
    try { const v = localStorage.getItem('boostleague.' + key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem('boostleague.' + key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  },
};

const DEFAULT_SETTINGS = {
  fov: 100, camDist: 270, camHeight: 105, camAngle: -4, camStiffness: 0.45, camShake: true, ballCamDefault: true,
  autoGas: true, stickSize: 1, buttonSize: 1, leftHanded: false, deadzone: 0.12, sensitivity: 1.15, haptics: true,
  quality: 'auto', particles: true, showFps: false, nameplates: true, ballIndicator: true,
  master: 0.8, sfx: 0.9, music: 0.5, crowd: 0.7,
};
const Settings = Object.assign({}, DEFAULT_SETTINGS, Store.get('settings', {}));

const DEFAULT_PROFILE = {
  name: 'Player', title: 'ROOKIE', xp: 0, level: 1, mmr: 600, wins: 0, losses: 0, goals: 0, saves: 0, assists: 0, mvps: 0, demos: 0,
  car: { body: 'striker', paint: 0, accent: 0xeeeeee, decal: 'stripes', wheels: 'classic', boost: 'standard', explosion: 'classic', topper: 'none', antenna: 'none' },
  unlocked: { body: ['octane', 'dominus', 'fennec', 'striker', 'phantom', 'blade'], decal: ['none', 'stripes'], wheels: ['classic'], boost: ['standard'], explosion: ['classic'], topper: ['none'], antenna: ['none'] },
  newItems: [],
};
const Profile = Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_PROFILE)), Store.get('profile', {}));
Profile.car = Object.assign({}, DEFAULT_PROFILE.car, Profile.car || {});
Profile.unlocked = Object.assign({}, DEFAULT_PROFILE.unlocked, Profile.unlocked || {});
// the Octane, Dominus and Fennec are always available
for (const k of ['octane', 'dominus', 'fennec']) if (!Profile.unlocked.body.includes(k)) Profile.unlocked.body.unshift(k);

function xpForLevel(l) { return 600 + l * 150; }
