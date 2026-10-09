'use strict';
// ============================================================================
// Arena geometry: exact-ish signed distance field for collisions, layouts
// ============================================================================

const ARENA_DEFS = {
  soccar: {
    W: 4096, L: 5120, H: 2044, Rc: 1150, Rf: 300, Rt: 320,
    goal: { w: 893, h: 642.775, d: 880 },
    pads: 'soccar',
  },
  hoops: {
    W: 2966, L: 3581, H: 1820, Rc: 900, Rf: 280, Rt: 280,
    hoop: { z: 2990, r: 520, y: 395, tube: 28 },
    pads: 'hoops',
  },
  dropshot: {
    W: 4000, L: 4800, H: 2000, Rc: 1700, Rf: 300, Rt: 300,
    dropshot: { s: 443 },
    pads: 'none',
  },
};

let ARENA = ARENA_DEFS.soccar;
const Tiles = { list: [], map: new Map() };

function setArena(kind) {
  ARENA = ARENA_DEFS[kind];
  ARENA.kind = kind;
  if (ARENA.dropshot) buildDropshotTiles();
}

// ---------------------------------------------------------------------------
// Dropshot hex tiles (flat-topped hexes, axial coordinates)
// ---------------------------------------------------------------------------
const SQ3 = Math.sqrt(3);
function hexKey(q, r) { return q * 1000 + r; }
function hexRound(qf, rf) {
  let x = qf, z = rf, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return [rx, rz];
}
const HEX_ZOFF = 0; // grid offset so the centre line falls between rows
function pointToHex(x, z) {
  const s = ARENA.dropshot.s;
  const q = (2 / 3 * x) / s;
  const r = (-1 / 3 * x + SQ3 / 3 * (z - HEX_ZOFF)) / s;
  return hexRound(q, r);
}
function hexCenter(q, r) {
  const s = ARENA.dropshot.s;
  return [s * 1.5 * q, s * SQ3 * (r + q / 2) + HEX_ZOFF];
}
function buildDropshotTiles() {
  Tiles.list = []; Tiles.map.clear();
  const s = ARENA.dropshot.s;
  for (let q = -12; q <= 12; q++) for (let r = -16; r <= 16; r++) {
    const [x, z] = hexCenter(q, r);
    if (Math.abs(z) < s * 0.7) continue; // neutral centre strip
    if (wallDist2D(x, z) < s * 0.85) continue;
    const t = { q, r, x, z, team: z < 0 ? 0 : 1, state: 0, flash: 0 };
    Tiles.list.push(t); Tiles.map.set(hexKey(q, r), t);
  }
}
function tileAt(x, z) {
  const [q, r] = pointToHex(x, z);
  return Tiles.map.get(hexKey(q, r));
}

// 2D distance from (x,z) to the outline wall (positive inside)
function wallDist2D(x, z) {
  const A = ARENA, ax = Math.abs(x), az = Math.abs(z);
  if (ax > A.W - A.Rc && az > A.L - A.Rc) return A.Rc - Math.hypot(ax - (A.W - A.Rc), az - (A.L - A.Rc));
  return Math.min(A.W - ax, A.L - az);
}

// ---------------------------------------------------------------------------
// Signed distance from a point to the nearest solid (positive = free space)
// mode: 0 = car, 1 = ball
// ---------------------------------------------------------------------------
function filletD(w, h, R) {
  // w: distance to wall, h: distance to floor/ceiling. Returns distance to fillet solid or Infinity
  if (w < R && h < R) return R - Math.hypot(R - w, R - h);
  return Infinity;
}

function arenaDist(x, y, z, forBall) {
  const A = ARENA;
  const ax = Math.abs(x), az = Math.abs(z);
  const g = A.goal;

  // ---- inside a goal tunnel ----
  if (g && az > A.L) {
    if (ax < g.w && y < g.h) return Math.min(g.w - ax, g.h - y, A.L + g.d - az, y);
    return A.L - az; // inside the back wall: push back towards the field
  }

  let floorD = y;
  if (forBall && A.dropshot && y < 400) {
    const t = tileAt(x, z);
    if (t && t.state === 2) {
      // hole: distance to the hole rim (approx: hex inscribed circle)
      const rr = A.dropshot.s * 0.866;
      const ho = Math.hypot(x - t.x, z - t.z);
      const edge = rr - ho;
      floorD = y > 0 ? Math.hypot(Math.max(0, edge), y) : (edge > 0 ? 1e4 : -y);
      if (edge > BALL_R_CUR() * 0.98) floorD = 1e4;
    }
  }
  let d = Math.min(floorD, A.H - y);

  const W = A.W, L = A.L, Rc = A.Rc, Rf = A.Rf, Rt = A.Rt;
  const inCorner = ax > W - Rc && az > L - Rc;
  let wSide = Infinity, wBack = Infinity, wCorner = Infinity;
  if (inCorner) wCorner = Rc - Math.hypot(ax - (W - Rc), az - (L - Rc));
  else { wSide = W - ax; wBack = L - az; }
  d = Math.min(d, wSide, wCorner);

  const mouthX = g && !inCorner && ax < g.w;
  if (mouthX && y < g.h) d = Math.min(d, Math.hypot(wBack, Math.min(g.w - ax, g.h - y)));
  else d = Math.min(d, wBack);

  // floor fillets
  if (y < Rf) {
    d = Math.min(d, filletD(wSide, y, Rf), filletD(wCorner, y, Rf));
    if (!mouthX) d = Math.min(d, filletD(wBack, y, Rf));
    else if (wBack < Rf) {
      const t = Math.max(0, Rf - Math.hypot(Rf - wBack, Rf - y));
      d = Math.min(d, Math.hypot(g.w - ax, t));
    }
  }
  // ceiling fillets
  const yc = A.H - y;
  if (yc < Rt) d = Math.min(d, filletD(wSide, yc, Rt), filletD(wCorner, yc, Rt), filletD(wBack, yc, Rt));

  // hoops nets (hollow cylinders) + rims (tori)
  if (A.hoop) {
    const h = A.hoop;
    const dz = az - h.z;
    const rho = Math.hypot(x, dz);
    const tor = Math.hypot(rho - h.r, y - h.y) - h.tube;
    d = Math.min(d, tor);
    if (y < h.y) d = Math.min(d, Math.abs(rho - h.r) - h.tube);
  }
  return d;
}

// gradient of the field (surface normal pointing into free space)
function arenaNormal(x, y, z, forBall, out) {
  const e = 2;
  const nx = arenaDist(x + e, y, z, forBall) - arenaDist(x - e, y, z, forBall);
  const ny = arenaDist(x, y + e, z, forBall) - arenaDist(x, y - e, z, forBall);
  const nz = arenaDist(x, y, z + e, forBall) - arenaDist(x, y, z - e, forBall);
  out.set(nx, ny, nz);
  const l = out.length();
  if (l < 1e-6) out.set(0, 1, 0); else out.multiplyScalar(1 / l);
  return out;
}

let _ballRadiusCur = PHYS.BALL_RADIUS;
function BALL_R_CUR() { return _ballRadiusCur; }

// ---------------------------------------------------------------------------
// Boost pad layouts
// ---------------------------------------------------------------------------
function padLayout(kind) {
  if (kind === 'soccar') {
    const big = [[-3072, -4096], [3072, -4096], [-3584, 0], [3584, 0], [-3072, 4096], [3072, 4096]];
    const small = [[0, -4240], [-1792, -4184], [1792, -4184], [-940, -3308], [940, -3308], [0, -2816], [-3584, -2484], [3584, -2484],
      [-1788, -2300], [1788, -2300], [-2048, -1036], [0, -1024], [2048, -1036], [-1024, 0], [1024, 0], [-2048, 1036], [0, 1024],
      [2048, 1036], [-1788, 2300], [1788, 2300], [-3584, 2484], [3584, 2484], [0, 2816], [-940, 3310], [940, 3308], [-1792, 4184], [1792, 4184], [0, 4240]];
    return big.map(p => ({ x: p[0], z: p[1], big: true })).concat(small.map(p => ({ x: p[0], z: p[1], big: false })));
  }
  if (kind === 'hoops') {
    const big = [[-2176, 0], [2176, 0], [-1800, -2300], [1800, -2300], [-1800, 2300], [1800, 2300]];
    const small = [[0, -1300], [0, 1300], [-900, 0], [900, 0], [-1300, -1200], [1300, -1200], [-1300, 1200], [1300, 1200],
      [-2300, -1400], [2300, -1400], [-2300, 1400], [2300, 1400], [0, 0]];
    return big.map(p => ({ x: p[0], z: p[1], big: true })).concat(small.map(p => ({ x: p[0], z: p[1], big: false })));
  }
  return [];
}

// ---------------------------------------------------------------------------
// Kickoff spawns (blue side; orange is mirrored)
// ---------------------------------------------------------------------------
function kickoffSpots(kind) {
  if (kind === 'hoops') return [[-1600, -1900], [1600, -1900], [-500, -2150], [500, -2150], [0, -2300]];
  const s = kind === 'soccar' ? 1 : 0.85;
  return [
    [-2048 * s, -2560 * s], [2048 * s, -2560 * s], [-256 * s, -3840 * s], [256 * s, -3840 * s], [0, -4608 * s],
  ];
}
function respawnSpots(kind) {
  if (kind === 'hoops') return [[-1800, -3000], [1800, -3000], [-2200, -2750], [2200, -2750]];
  const s = kind === 'soccar' ? 1 : 0.85;
  return [[-2304 * s, -4608 * s], [-2688 * s, -4608 * s], [2304 * s, -4608 * s], [2688 * s, -4608 * s]];
}
