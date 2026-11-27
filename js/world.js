'use strict';
/* Voxel world: chunk storage, terrain generation, meshing, raycasting and collision. */

// WH: how high you can build. GEN_H: the height the land was made for (kept at 96, so raising the
// build limit never changes the land, trees or the Nether's ceiling in worlds made before)
const CS = 16, WH = 320, GEN_H = 96, SEA = 32; // you can build up to y 319, like Minecraft
const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, SNOWY: 5, MOUNTAIN: 6, BIRCH: 7, TAIGA: 8, JUNGLE: 9, DARK_FOREST: 10, SAVANNA: 11, MANGROVE: 12, CHERRY: 13, BAMBOO: 14, SWAMP: 15, MUSHROOM: 16, BADLANDS: 17, ICE_SPIKES: 18, FLOWER_FOREST: 19, MEADOW: 20, FROZEN_OCEAN: 21, WARM_OCEAN: 22, SUNFLOWER_PLAINS: 23, LUSH_CAVES: 24, DRIPSTONE_CAVES: 25, DEEP_DARK: 26, PALE_GARDEN: 27 };
const GEN_VER = 10;
const BASE_BIOME = { 15: -1, 16: -1, 17: 4, 18: 5, 19: 3, 20: 6, 21: 0, 22: 0, 23: 2 }; // swamp & mushroom: no villages // which newer biomes exist (see genVerAt)
const BIOME_NAMES = ['Ocean', 'Beach', 'Plains', 'Forest', 'Desert', 'Snowy Tundra', 'Mountains', 'Birch Forest', 'Taiga', 'Jungle', 'Dark Forest', 'Savanna', 'Mangrove Swamp', 'Cherry Grove', 'Bamboo Jungle', 'Swamp', 'Mushroom Fields', 'Badlands', 'Ice Spikes', 'Flower Forest', 'Meadow', 'Frozen Ocean', 'Warm Ocean', 'Sunflower Plains', 'Lush Caves', 'Dripstone Caves', 'Deep Dark', 'Pale Garden'];

const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.8 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.8 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.68 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.68 },
];
const FACE_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_CURVE = [0.48, 0.66, 0.83, 1.0];
for (const F of FACES) {
  const axes = [0, 1, 2].filter(a => F.n[a] === 0);
  F.ao = F.c.map(c => {
    const o1 = F.n.slice(), o2 = F.n.slice(), o3 = F.n.slice();
    const a = axes[0], b = axes[1], da = c[a] ? 1 : -1, db = c[b] ? 1 : -1;
    o1[a] += da; o2[b] += db; o3[a] += da; o3[b] += db;
    return [o1, o2, o3];
  });
}
const TILE_UV = [];
for (let t = 0; t < ATLAS_N * ATLAS_N; t++) {
  const s = 1 / ATLAS_N, e = 0.0006;
  const u0 = (t % ATLAS_N) * s, v1 = 1 - Math.floor(t / ATLAS_N) * s;
  TILE_UV.push([u0 + e, v1 - s + e, u0 + s - e, v1 - e]);
}

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.data = new Uint16Array(CS * CS * WH); // block numbers go above 255 (items use 128-511)
    this.meshes = [];
    this.dirty = true;
  }
}

/* the deepslate version of each ore (used deep down) */
const DEEP_ORE = {};
for (const k of ['coal', 'iron', 'gold', 'diamond', 'redstone', 'emerald', 'lapis']) DEEP_ORE[ID[k + '_ore']] = ID['deepslate_' + k + '_ore'];

class World {
  constructor(seed, materials, dim, legacy) {
    this.dim = dim || 'overworld';
    if (this.dim === 'nether') seed = (seed ^ 0x2f6e2b1) + 7;
    if (this.dim === 'end') seed = (seed ^ 0x51e3d0c9) + 13;
    this.seed = seed >>> 0;
    this.noise = new Noise(this.seed);
    this.noiseB = new Noise((this.seed ^ 0x5bd1e995) >>> 0);
    this.noiseC = new Noise((this.seed + 977) >>> 0);
    this.chunks = new Map();
    this.edits = new Map();
    this.urgent = new Set();
    this.group = new THREE.Group();
    this.mats = materials;
    // every seed gets its own personality: where you start, how high and wild the land is,
    // how many mountains, how hot or cold and how many trees (legacy keeps old saved worlds unchanged)
    this.legacy = !!legacy;
    const sr = mulberry32((this.seed ^ 0x9e3779b9) >>> 0);
    this.style = this.legacy ? { amp: 1, hills: 1, mnt: 1, cont: 260, temp: 0, moist: 0, trees: 1, ox: 0, oz: 0 } : {
      amp: 0.6 + sr() * 0.9, hills: 0.5 + sr() * 1.1, mnt: 0.4 + sr() * 1.6, cont: 160 + sr() * 260,
      temp: (sr() - 0.5) * 0.36, moist: (sr() - 0.5) * 0.36, trees: 0.5 + sr() * 1.3,
      ox: Math.round((sr() - 0.5) * 20000), oz: Math.round((sr() - 0.5) * 20000),
    };
    this.renderDist = 5;
    this.lastCx = null; this.lastCz = null;
    this.queue = [];
  }

  key(cx, cz) { return cx + ',' + cz; }

  /* ---------- terrain shape ---------- */
  heightAt(x, z) {
    const n = this.noise, S = this.style;
    x += S.ox; z += S.oz;
    const cont = n.fbm2(x / S.cont, z / S.cont, 4);
    const hills = this.noiseB.fbm2(x / 70, z / 70, 4);
    const mnt = this.noiseC.fbm2(x / 200 + 31.7, z / 200 - 12.3, 3);
    let h = SEA + 4 + cont * 70 * S.amp + hills * 20 * S.hills;
    const m = Math.max(0, mnt - 0.02);
    h += m * m * 600 * S.mnt;
    return clamp(Math.floor(h), 4, GEN_H - 14);
  }

  climate(x, z) {
    const S = this.style;
    x += S.ox; z += S.oz;
    return [this.noiseB.fbm2(x / 420 + 500, z / 420, 2) + S.temp, this.noiseC.fbm2(x / 380, z / 380 + 700, 2) + S.moist];
  }

  /* villages, temples, igloos and shipwrecks treat the newest biomes like the ones they grew from,
     so a village you already saw is never wiped away by a new biome */
  baseBiomeAt(x, z, h) { this.noNew = true; const b = this.biomeAt(x, z, h); this.noNew = false; return b; }
  /* the newest biomes (swamp, mushroom fields, badlands...) only grow on land nobody had built on before them */
  fresh7(x, z) { return !this.noNew && !this.legacy && !(this.oldGen && this.oldGen.has(this.key(Math.floor(x) >> 4, Math.floor(z) >> 4))) && this.genVerAt(x, z) >= 7; }
  biomeAt(x, z, h) {
    const [temp, moist] = this.climate(x, z);
    const S = this.style, sx = x + S.ox, sz = z + S.oz;
    if (h < SEA) {
      if (this.fresh7(x, z)) { if (temp < -0.15) return BIOME.FROZEN_OCEAN; if (temp > 0.15) return BIOME.WARM_OCEAN; }
      return BIOME.OCEAN;
    }
    // rare mushroom islands by the sea
    if (h <= SEA + 9 && this.noiseC.fbm2(sx / 260 + 1500, sz / 260 - 800, 2) > 0.36 && this.fresh7(x, z)) return BIOME.MUSHROOM;
    if (h >= SEA + 26) return h < SEA + 31 && temp > -0.05 && this.fresh7(x, z) ? BIOME.MEADOW : BIOME.MOUNTAIN;
    if (temp < -0.12) {
      if (temp < -0.22 && moist <= 0 && this.noiseB.fbm2(sx / 140 + 77, sz / 140, 2) > 0.05 && this.fresh7(x, z)) return BIOME.ICE_SPIKES;
      return moist > 0.0 ? BIOME.TAIGA : BIOME.SNOWY;
    }
    if (temp > 0.1 && moist < 0.04) return this.noiseC.fbm2(sx / 300 - 600, sz / 300 + 222, 2) > 0.12 && this.fresh7(x, z) ? BIOME.BADLANDS : BIOME.DESERT;
    // wet, mild lowland: a swamp
    if (moist > 0.1 && temp > -0.06 && temp <= 0.1 && h <= SEA + 4 && this.fresh7(x, z)) return BIOME.SWAMP;
    // hot, very wet and low: a mangrove swamp (fresh ground only)
    if (temp > 0.1 && moist > 0.14 && h <= SEA + 4 && !this.legacy && !(this.oldGen && this.oldGen.has(this.key(Math.floor(x) >> 4, Math.floor(z) >> 4))) && this.genVerAt(x, z) >= 2) return BIOME.MANGROVE;
    if (h <= SEA + 1) return BIOME.BEACH;
    // hot and wet: jungle (only on fresh ground, so places you built in keep their forest)
    if (moist > 0.1 && temp > 0.12 && !this.legacy && !(this.oldGen && this.oldGen.has(this.key(Math.floor(x) >> 4, Math.floor(z) >> 4)))) return this.noiseB.fbm2(x / 160 - 900, z / 160 + 400, 2) > 0.18 && this.genVerAt(x, z) >= 3 ? BIOME.BAMBOO : BIOME.JUNGLE;
    // very wet but not hot: a dark forest of big dark oaks (fresh ground only, like the jungle)
    if (moist > 0.17 && temp > -0.02 && temp <= 0.12 && !this.legacy && !(this.oldGen && this.oldGen.has(this.key(Math.floor(x) >> 4, Math.floor(z) >> 4)))) return this.noiseB.fbm2(sx / 160 + 2700, sz / 160 - 2700, 2) > 0.2 && this.fresh7(x, z) && this.genVerAt(x, z) >= 8 ? BIOME.PALE_GARDEN : BIOME.DARK_FOREST;
    // hot and dry-ish: a savanna with flat-topped acacia trees (fresh ground only)
    if (temp > 0.08 && moist <= 0.1 && !this.legacy && !(this.oldGen && this.oldGen.has(this.key(Math.floor(x) >> 4, Math.floor(z) >> 4))) && this.genVerAt(x, z) >= 1) return BIOME.SAVANNA;
    if (moist > 0.04) return temp > -0.02 ? (this.noiseB.fbm2(sx / 180 - 300, sz / 180 - 300, 2) > 0.2 && this.fresh7(x, z) ? BIOME.FLOWER_FOREST : BIOME.FOREST) : BIOME.BIRCH;
    // mild, dryish hills: a pink cherry grove (fresh ground only)
    if (temp > -0.08 && temp <= 0.08 && h >= SEA + 7 && !this.legacy && !(this.oldGen && this.oldGen.has(this.key(Math.floor(x) >> 4, Math.floor(z) >> 4))) && this.genVerAt(x, z) >= 2) return BIOME.CHERRY;
    if (this.noiseC.fbm2(sx / 200 + 444, sz / 200 + 444, 2) > 0.25 && this.fresh7(x, z)) return BIOME.SUNFLOWER_PLAINS;
    return BIOME.PLAINS;
  }

  /* ---------- block access ---------- */
  getBlock(x, y, z) {
    if (y < 0) return ID.bedrock;
    if (y >= WH) return 0;
    const c = this.chunks.get(this.key(x >> 4, z >> 4));
    if (!c) return 0;
    return c.data[(x & 15) + ((z & 15) << 4) + (y << 8)];
  }

  /* Newer biomes (savanna = 1, mangrove and cherry = 2, bamboo = 3) only grow where nobody had built yet.
     The first time a place is built in, it (and the land around it) remembers which biomes existed then,
     so a new kind of tree can never pop up inside a house later. */
  genVerAt(x, z) { const v = this.genVer && this.genVer.get(this.key(Math.floor(x) >> 4, Math.floor(z) >> 4)); return v === undefined ? GEN_VER : v; }
  stampGen(cx, cz, ver) {
    if (!this.genVer) this.genVer = new Map();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const k = this.key(cx + dx, cz + dz); if (!this.genVer.has(k)) this.genVer.set(k, ver); }
  }
  /* a save from before this was kept: every place already built in keeps the biomes from before savannas */
  stampOldEdits() { for (const [k, m] of this.edits) if (m.size) { const [cx, cz] = k.split(',').map(Number); this.stampGen(cx, cz, 0); } }

  isLoaded(x, z) { return this.chunks.has(this.key(Math.floor(x) >> 4, Math.floor(z) >> 4)); }

  setBlock(x, y, z, id, record = true) {
    if (y < 0 || y >= WH) return;
    const cx = x >> 4, cz = z >> 4, k = this.key(cx, cz);
    const c = this.chunks.get(k);
    if (!c) return;
    const lx = x & 15, lz = z & 15, i = lx + (lz << 4) + (y << 8);
    const old = c.data[i];
    c.data[i] = id;
    if (id && c.top !== undefined && y > c.top) c.top = y;
    // a torch or lantern came or went: the light it gives reaches into the chunks around
    if ((DEFS[old] && DEFS[old].emit) || (DEFS[id] && DEFS[id].emit)) {
      c.emit = null;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) this.markUrgent((x >> 4) + dx, (z >> 4) + dz);
    }
    if (record) {
      let m = this.edits.get(k);
      if (!m) { m = new Map(); this.edits.set(k, m); }
      m.set(i, id);
      if (this.dim === 'overworld' && !(this.genVer && this.genVer.has(k))) this.stampGen(cx, cz, GEN_VER);
      if (this.onEdit && !this.applyingRemote) this.onEdit(x, y, z, id);
      if (!this.applyingRemote && typeof G !== 'undefined' && G.rsMark && this === G.world) G.rsMark(x, y, z); // redstone looks again around here
    }
    this.urgent.add(c);
    const ex = lx === 0 ? -1 : lx === 15 ? 1 : 0, ez = lz === 0 ? -1 : lz === 15 ? 1 : 0;
    if (ex) this.markUrgent(cx + ex, cz);
    if (ez) this.markUrgent(cx, cz + ez);
    if (ex && ez) this.markUrgent(cx + ex, cz + ez);
  }

  settle(x, y, z) {
    while (y < WH) {
      const id = this.getBlock(x, y, z);
      if (id !== ID.sand && id !== ID.gravel && !DEFS[id].falls) break;
      let ny = y;
      while (ny > 0) {
        const b = this.getBlock(x, ny - 1, z);
        if (b === 0 || DEFS[b].liquid || DEFS[b].replaceable) ny--; else break;
      }
      if (ny === y) break;
      this.setBlock(x, y, z, 0);
      this.setBlock(x, ny, z, id);
      y++;
    }
  }

  /* an edit made by another player: apply it now, or remember it for when the chunk loads */
  applyRemote(x, y, z, id) {
    if (y < 0 || y >= WH || !DEFS[id]) return;
    if (id === ID.fire && G.fires && this === G.world) G.fires[x + ',' + y + ',' + z] = G.fires[x + ',' + y + ',' + z] || 0;
    const k = this.key(x >> 4, z >> 4), i = (x & 15) + ((z & 15) << 4) + (y << 8);
    if (this.chunks.has(k)) {
      if (this.getBlock(x, y, z) === id) return;
      this.applyingRemote = true;
      this.setBlock(x, y, z, id);
      this.applyingRemote = false;
    } else {
      let m = this.edits.get(k);
      if (!m) { m = new Map(); this.edits.set(k, m); }
      m.set(i, id);
    }
  }

  /* ground height for mobs and dragons (the Nether has a roof, so skip it) */
  groundY(x, z) {
    if (this.dim !== 'nether') return this.surfaceY(x, z);
    x = Math.floor(x); z = Math.floor(z);
    if (!this.isLoaded(x, z)) return 40;
    for (let y = 70; y > 0; y--) {
      const id = this.getBlock(x, y, z);
      if (id && (DEFS[id].solid || DEFS[id].liquid)) return y;
    }
    return 31;
  }

  /* remove every portal block connected to (x,y,z) */
  breakPortal(x, y, z) {
    const stack = [[x, y, z]], seen = new Set();
    while (stack.length && seen.size < 600) {
      const [a, b, c] = stack.pop();
      const k = a + ',' + b + ',' + c;
      if (seen.has(k)) continue;
      seen.add(k);
      if (this.getBlock(a, b, c) !== ID.nether_portal) continue;
      this.setBlock(a, b, c, 0);
      stack.push([a + 1, b, c], [a - 1, b, c], [a, b + 1, c], [a, b - 1, c], [a, b, c + 1], [a, b, c - 1]);
    }
  }

  findPortal(x, z, r) {
    let best = null, bd = Infinity;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (!this.isLoaded(x + dx, z + dz)) continue;
      for (let y = 1; y < WH - 1; y++) {
        if (this.getBlock(x + dx, y, z + dz) === ID.nether_portal && this.getBlock(x + dx, y - 1, z + dz) !== ID.nether_portal) {
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = [x + dx, y, z + dz]; }
        }
      }
    }
    return best;
  }

  /* build an obsidian frame (2 wide, 3 tall inside) along x with its bottom-left inside corner at (x,y,z) */
  buildPortal(x, y, z, lit) {
    for (let dx = -1; dx <= 2; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (this.dim === 'nether' || !this.isSolid(x + dx, y - 1, z + dz)) this.setBlock(x + dx, y - 1, z + dz, ID.obsidian);
      for (let dy = 0; dy <= 4; dy++) if (dz !== 0 || dy === 4) this.setBlock(x + dx, y + dy, z + dz, 0);
    }
    for (let dy = -1; dy <= 3; dy++) { this.setBlock(x - 1, y + dy, z, ID.obsidian); this.setBlock(x + 2, y + dy, z, ID.obsidian); }
    for (let dx = 0; dx <= 1; dx++) {
      this.setBlock(x + dx, y - 1, z, ID.obsidian); this.setBlock(x + dx, y + 3, z, ID.obsidian);
      for (let dy = 0; dy < 3; dy++) this.setBlock(x + dx, y + dy, z, lit ? ID.nether_portal : 0);
    }
  }

  /* fill an empty obsidian frame around (x,y,z) with portal blocks; false if there is no valid frame */
  lightPortal(x, y, z) {
    const g = (a, b, c) => this.getBlock(a, b, c), OB = ID.obsidian;
    if (g(x, y, z) !== 0) return false;
    let by = y;
    while (by > 1 && g(x, by - 1, z) === 0 && y - by < 21) by--;
    if (g(x, by - 1, z) !== OB) return false;
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      let x0 = x, z0 = z, k = 0;
      while (g(x0 - ax, by, z0 - az) === 0 && k < 21) { x0 -= ax; z0 -= az; k++; }
      if (g(x0 - ax, by, z0 - az) !== OB) continue;
      let w = 0;
      while (g(x0 + ax * w, by, z0 + az * w) === 0 && w < 22) w++;
      if (g(x0 + ax * w, by, z0 + az * w) !== OB || w < 2 || w > 21) continue;
      let h = 0;
      while (g(x0, by + h, z0) === 0 && h < 22) h++;
      if (h < 3 || h > 21) continue;
      let ok = true;
      for (let i = 0; i < w && ok; i++) {
        for (let j = 0; j < h && ok; j++) if (g(x0 + ax * i, by + j, z0 + az * i) !== 0) ok = false;
        if (g(x0 + ax * i, by - 1, z0 + az * i) !== OB || g(x0 + ax * i, by + h, z0 + az * i) !== OB) ok = false;
      }
      for (let j = 0; j < h && ok; j++) if (g(x0 - ax, by + j, z0 - az) !== OB || g(x0 + ax * w, by + j, z0 + az * w) !== OB) ok = false;
      if (!ok) continue;
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) this.setBlock(x0 + ax * i, by + j, z0 + az * i, ID.nether_portal);
      return true;
    }
    return false;
  }

  markUrgent(cx, cz) { const c = this.chunks.get(this.key(cx, cz)); if (c && c.meshes.length) this.urgent.add(c); }

  /* the highest y with anything in this chunk (remembered, so looking for the ground doesn't start at the sky) */
  chunkTop(c) {
    if (c.top === undefined) {
      const d = c.data;
      let top = WH - 1;
      while (top > 0) { const b = top << 8; let any = false; for (let i = 0; i < 256; i++) if (d[b + i]) { any = true; break; } if (any) break; top--; }
      c.top = top;
    }
    return c.top;
  }

  surfaceY(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    if (!this.isLoaded(x, z)) return Math.max(this.heightAt(x, z), SEA);
    const c = this.chunks.get(this.key(x >> 4, z >> 4)), lx = x & 15, lz = z & 15, d = c.data;
    for (let y = this.chunkTop(c); y > 0; y--) {
      const id = d[lx + (lz << 4) + (y << 8)];
      if (id && (DEFS[id].solid || DEFS[id].liquid)) return y;
    }
    return 0;
  }

  surfaceYSlow(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    for (let y = WH - 1; y > 0; y--) {
      const id = this.getBlock(x, y, z);
      if (id && (DEFS[id].solid || DEFS[id].liquid)) return y;
    }
    return 0;
  }

  skyExposed(x, y, z) {
    x = Math.floor(x); z = Math.floor(z);
    const sc = this.chunks.get(this.key(x >> 4, z >> 4)), stop = sc ? this.chunkTop(sc) + 1 : WH;
    for (let yy = Math.floor(y) + 1; yy < stop; yy++) {
      const id = this.getBlock(x, yy, z);
      if (id && DEFS[id].opaque) return false;
    }
    return true;
  }

  /* ---------- generation ---------- */
  generate(cx, cz) {
    if (this.dim === 'nether') return this.generateNether(cx, cz);
    if (this.dim === 'end') return this.generateEnd(cx, cz);
    const c = new Chunk(cx, cz);
    const d = c.data;
    const rng = mulberry32(hash3(cx, cz, this.seed));
    const heights = new Int16Array(256), biomes = new Uint8Array(256);
    // newer underground (deepslate, more caves, ravines, big caverns) — but never where someone has
    // built or dug nearby, so the ground under and around your builds stays exactly as it was
    const fresh = !this.legacy && !(this.oldGen && this.oldGen.has(this.key(cx, cz)));
    const set = (x, y, z, id) => { if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < WH) d[x + (z << 4) + (y << 8)] = id; };
    const get = (x, y, z) => (x >= 0 && x < 16 && z >= 0 && z < 16 && y >= 0 && y < WH) ? d[x + (z << 4) + (y << 8)] : -1;

    const BAND = this.BAND || (this.BAND = [ID.terracotta, ID.terracotta_orange, ID.terracotta, ID.terracotta_yellow, ID.terracotta_brown, ID.terracotta, ID.terracotta_red, ID.terracotta_white, ID.terracotta_light_gray, ID.terracotta_orange, ID.terracotta]);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = cx * 16 + x, wz = cz * 16 + z;
      const h = this.heightAt(wx, wz), b = this.biomeAt(wx, wz, h);
      heights[x + z * 16] = h; biomes[x + z * 16] = b;
      let top = ID.grass, fill = ID.dirt, deep = ID.stone;
      if (b === BIOME.DESERT) { top = ID.sand; fill = ID.sand; deep = ID.sandstone; }
      else if (b === BIOME.BEACH) { top = ID.sand; fill = ID.sand; }
      else if (b === BIOME.SNOWY || b === BIOME.TAIGA) { top = b === BIOME.SNOWY ? ID.snow_grass : ID.grass; }
      else if (b === BIOME.MOUNTAIN) { top = h > SEA + 38 ? ID.snow : ID.stone; fill = ID.stone; }
      else if (b === BIOME.MUSHROOM) top = ID.mycelium;
      else if (b === BIOME.ICE_SPIKES) top = ID.snow;
      else if (b === BIOME.MEADOW) { top = ID.grass; fill = ID.dirt; }
      else if (b === BIOME.BADLANDS) { top = ID.red_sand; fill = -1; }
      else if (b === BIOME.WARM_OCEAN) { top = ID.sand; fill = ID.sand; }
      else if (b === BIOME.OCEAN || b === BIOME.FROZEN_OCEAN) {
        const g = this.noiseB.noise2(wx / 20, wz / 20);
        top = g > 0.25 ? ID.gravel : g < -0.3 ? ID.clay : ID.sand; fill = top === ID.clay ? ID.clay : ID.sand;
      }
      // gravel patches on dry land, so flint is easy to find
      if (h > SEA + 1 && (b === BIOME.PLAINS || b === BIOME.FOREST || b === BIOME.BIRCH || b === BIOME.TAIGA || b === BIOME.MOUNTAIN || b === BIOME.SNOWY)
        && this.noiseC.noise2(wx / 7 + 90, wz / 7 - 40) > 0.3) { top = ID.gravel; fill = ID.gravel; }
      const maxY = Math.max(h, SEA);
      for (let y = 0; y <= maxY; y++) {
        let id;
        if (y === 0) id = ID.bedrock;
        else if (y <= 3 && rng() < (4 - y) * 0.22) id = ID.bedrock;
        else if (fill === -1 && y < h && y >= h - 14) id = BAND[(y + (this.noiseC.noise2(wx / 40, wz / 40) * 3 | 0) + 64) % BAND.length]; // badlands: stripes of terracotta
        else if (y < h - 3) id = (deep === ID.sandstone && y < h - 7) ? ID.stone : deep;
        else if (y < h) id = fill;
        else if (y === h) id = top;
        else id = (y === SEA && (b === BIOME.SNOWY || b === BIOME.TAIGA || b === BIOME.FROZEN_OCEAN || b === BIOME.ICE_SPIKES)) ? ID.ice : ID.water;
        // deepslate near the bottom (fresh ground)
        if (fresh && id === ID.stone && y <= 13 + ((this.noiseC.noise2(wx / 9, wz / 9) + 1) * 2 | 0)) id = ID.deepslate;
        d[x + (z << 4) + (y << 8)] = id;
      }
    }

    // caves
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = cx * 16 + x, wz = cz * 16 + z, h = heights[x + z * 16];
      const top = h <= SEA + 2 ? h - 4 : h;
      for (let y = 1; y <= top; y++) {
        const i = x + (z << 4) + (y << 8);
        const id = d[i];
        if (id === ID.bedrock || id === ID.water) continue;
        const n1 = this.noiseB.noise3(wx / 22, y / 14, wz / 22);
        const n2 = this.noiseC.noise3(wx / 22, y / 14 + 40, wz / 22);
        // fresh ground: tunnels wide and tall enough to walk through (about 4 or 5 blocks), like Minecraft
        let cave = n1 * n1 + n2 * n2 < (fresh ? 0.024 : 0.0045);
        if (!cave && y < h - 10) cave = this.noise.noise3(wx / 34, y / 18, wz / 34 + 200) > (fresh ? 0.36 : 0.42);
        if (fresh && !cave) {
          // a second set of winding tunnels, many of them opening onto the surface
          const n3 = this.noiseB.noise3(wx / 26 + 300, y / 11, wz / 26 - 300), n4 = this.noiseC.noise3(wx / 26 - 120, y / 11 + 70, wz / 26 + 90);
          cave = n3 * n3 + n4 * n4 < 0.018;
          // big caverns deep down (lava lakes at the very bottom)
          if (!cave && y >= 4 && y <= 24) cave = this.noise.noise3(wx / 48 + 700, y / 10, wz / 48 - 700) > 0.3 - (24 - y) * 0.006;
          // ravines: long cracks from the surface deep into the ground
          if (!cave && y > 7 && h > SEA + 1) {
            const rv = Math.abs(this.noiseB.noise2(wx / 160 + 55, wz / 160 - 77)), wide = 0.006 + (y / h) * 0.012;
            if (rv < wide && this.noiseC.noise2(wx / 90 + 13, wz / 90) > 0.05) cave = true;
          }
        }
        if (cave) {
          if (y + 1 < WH && d[i + 256] === ID.water) continue;
          d[i] = y <= (fresh ? 6 : 8) ? ID.lava : 0;
        }
      }
    }

    // ores & pockets
    const ORE = fresh ? [
      // fresh ground: diamonds and redstone only deep down, and no lumps of dirt or gravel down there
      [ID.coal_ore, 22, 5, 90, 10], [ID.iron_ore, 26, 4, 80, 9], [ID.gold_ore, 6, 4, 34, 7],
      [ID.diamond_ore, 3, 2, 11, 5], [ID.redstone_ore, 6, 2, 13, 6], [ID.lapis_ore, 3, 4, 32, 5],
      [ID.gravel, 4, 26, 70, 12], [ID.dirt, 4, 30, 70, 12], [ID.obsidian, 1, 2, 10, 5],
    ] : [
      [ID.coal_ore, 22, 5, 90, 10], [ID.iron_ore, 26, 4, 80, 9], [ID.gold_ore, 6, 4, 34, 7],
      [ID.diamond_ore, 3, 2, 16, 5], [ID.redstone_ore, 6, 2, 18, 6], [ID.lapis_ore, 3, 4, 32, 5],
      [ID.gravel, 5, 5, 70, 14], [ID.dirt, 6, 5, 70, 14], [ID.obsidian, 1, 2, 10, 5],
    ];
    if (fresh) ORE.push([ID.diamond_ore, 2, 2, 11, 4], [ID.emerald_ore, 2, 4, 70, 2], [ID.gold_ore, 3, 2, 18, 7], [ID.redstone_ore, 4, 2, 14, 7]);
    const mountainChunk = biomes[136] === BIOME.MOUNTAIN;
    if (mountainChunk) ORE.push([ID.emerald_ore, 4, 4, 80, 2], [ID.gold_ore, 4, 30, 80, 6], [ID.iron_ore, 8, 30, 90, 9]);
    if (biomes[136] === BIOME.DESERT) ORE.push([ID.gold_ore, 4, 20, 50, 6]);
    // diamonds were far too easy to find: on new land (nobody built there before) a chunk gets one vein
    // (sometimes two), like Minecraft, and a diamond touching a cave is usually left as stone
    const fewDiamonds = this.genVerAt(cx * 16, cz * 16) >= 5;
    const dr = mulberry32(hash3(cx, cz, this.seed + 4711));
    const twoVeins = dr() < 0.5;
    let dVein = 0;
    for (const [ore, count, y0, y1, size] of ORE) {
      for (let v = 0; v < count; v++) {
        let x = rng() * 16, y = y0 + rng() * (y1 - y0), z = rng() * 16;
        const skip = fewDiamonds && ore === ID.diamond_ore && (dVein++ > (twoVeins ? 1 : 0));
        for (let s = 0; s < size; s++) {
          const xi = x | 0, yi = y | 0, zi = z | 0;
          const here = get(xi, yi, zi);
          if (skip || (fewDiamonds && ore === ID.diamond_ore && dr() < 0.5 && [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => { const n = get(xi + a, yi + b, zi + c); return n === 0 || n === ID.water || n === ID.lava; }))) { /* no diamond here */ }
          else if (here === ID.stone) set(xi, yi, zi, ore);
          else if (here === ID.deepslate && DEEP_ORE[ore]) set(xi, yi, zi, DEEP_ORE[ore]);
          x += rng() * 2 - 1; y += rng() * 2 - 1; z += rng() * 2 - 1;
        }
      }
    }

    // decorations
    const center = biomes[136];
    const treeCount = { [BIOME.PALE_GARDEN]: 5, [BIOME.SWAMP]: 3, [BIOME.FLOWER_FOREST]: 4, [BIOME.MEADOW]: rng() < 0.15 ? 1 : 0, [BIOME.SUNFLOWER_PLAINS]: rng() < 0.3 ? 1 : 0, [BIOME.DARK_FOREST]: 6, [BIOME.BAMBOO]: 3, [BIOME.MANGROVE]: 5, [BIOME.CHERRY]: 3, [BIOME.SAVANNA]: rng() < 0.7 ? 1 + (rng() < 0.4 ? 1 : 0) : 0, [BIOME.JUNGLE]: 9, [BIOME.FOREST]: 7, [BIOME.BIRCH]: 6, [BIOME.TAIGA]: 6, [BIOME.PLAINS]: rng() < 0.4 ? 1 : 0, [BIOME.SNOWY]: rng() < 0.4 ? 1 : 0, [BIOME.MOUNTAIN]: rng() < 0.3 ? 1 : 0 }[center] || 0;
    const trees = Math.floor(treeCount * this.style.trees + rng());
    const beeLand = fresh && this.genVerAt(cx * 16, cz * 16) >= 8, br = mulberry32(hash3(cx, cz, this.seed + 3131));
    for (let t = 0; t < trees; t++) {
      const x = 2 + (rng() * 12 | 0), z = 2 + (rng() * 12 | 0), h = heights[x + z * 16];
      const ground = get(x, h, z);
      if (ground !== ID.grass && ground !== ID.snow_grass) continue;
      if (h + 10 >= GEN_H || get(x, h + 1, z) !== 0) continue;
      const b = biomes[x + z * 16];
      if (b === BIOME.PALE_GARDEN) { this.darkOakTree(set, get, x, h + 1, z, rng, ID.pale_oak_log, ID.pale_oak_leaves); if (br() < 0.2) { set(x, h + 3, z, ID.creaking_heart); (this.newHearts || (this.newHearts = [])).push([cx * 16 + x, h + 3, cz * 16 + z]); } }
      else if (b === BIOME.DARK_FOREST) { if (rng() < 0.8) this.darkOakTree(set, get, x, h + 1, z, rng); else this.oakTree(set, get, x, h + 1, z, rng, ID.oak_log, ID.oak_leaves, 4); }
      else if (b === BIOME.SAVANNA) this.acaciaTree(set, get, x, h + 1, z, rng);
      else if (b === BIOME.MANGROVE) this.mangroveTree(set, get, x, h + 1, z, rng);
      else if (b === BIOME.CHERRY) this.cherryTree(set, get, x, h + 1, z, rng);
      else if (b === BIOME.BAMBOO) { if (rng() < 0.5) this.jungleTree(set, get, x, h + 1, z, rng); else this.jungleBush(set, get, x, h + 1, z, rng); }
      else if (b === BIOME.JUNGLE) { if (rng() < 0.6) this.jungleTree(set, get, x, h + 1, z, rng); else this.jungleBush(set, get, x, h + 1, z, rng); }
      else if (b === BIOME.TAIGA || b === BIOME.SNOWY || (b === BIOME.MOUNTAIN && rng() < 0.7)) this.spruceTree(set, get, x, h + 1, z, rng);
      else if (b === BIOME.SWAMP) { this.oakTree(set, get, x, h + 1, z, rng, ID.oak_log, ID.oak_leaves, 4); for (let k = 0; k < 6; k++) { const vx = x - 2 + (rng() * 5 | 0), vz = z - 2 + (rng() * 5 | 0); for (let vy = h + 7; vy > h + 2; vy--) if (get(vx, vy, vz) === ID.oak_leaves) { for (let d = 1; d <= 2 && get(vx, vy - d, vz) === 0; d++) set(vx, vy - d, vz, ID.oak_leaves); break; } } }
      else if (b === BIOME.BIRCH || b === BIOME.MEADOW || ((b === BIOME.FOREST || b === BIOME.FLOWER_FOREST) && rng() < 0.25)) this.oakTree(set, get, x, h + 1, z, rng, ID.birch_log, ID.birch_leaves, 5);
      else this.oakTree(set, get, x, h + 1, z, rng, ID.oak_log, ID.oak_leaves, 4);
      set(x, h, z, ID.dirt);
      // a bee nest hanging under the leaves (new land only), like Minecraft
      if (beeLand && (b === BIOME.PLAINS || b === BIOME.SUNFLOWER_PLAINS || b === BIOME.FLOWER_FOREST || b === BIOME.MEADOW || b === BIOME.FOREST || b === BIOME.BIRCH || b === BIOME.CHERRY) && br() < (b === BIOME.FOREST || b === BIOME.BIRCH ? 0.05 : 0.3)) {
        const [dx, dz, f] = [[0, 1, ''], [0, -1, '_n'], [1, 0, '_e'], [-1, 0, '_w']][br() * 4 | 0];
        for (let y = h + 2; y < h + 7; y++) if ((get(x, y, z) === ID.oak_log || get(x, y, z) === ID.birch_log || get(x, y, z) === ID.cherry_log) && get(x + dx, y, z + dz) === 0 && get(x + dx, y - 1, z + dz) === 0 && get(x + dx, y + 1, z + dz) !== 0) { set(x + dx, y, z + dz, ID['bee_nest' + f]); break; }
      }
    }
    const plant = (n, ids, onTop) => {
      for (let i = 0; i < n; i++) {
        const x = rng() * 16 | 0, z = rng() * 16 | 0, h = heights[x + z * 16];
        if (get(x, h, z) === onTop && get(x, h + 1, z) === 0) set(x, h + 1, z, ids[rng() * ids.length | 0]);
      }
    };
    if (center === BIOME.PLAINS) { plant(28, [ID.tall_grass], ID.grass); plant(5, [ID.rose, ID.dandelion], ID.grass); }
    if (center === BIOME.DARK_FOREST) { plant(10, [ID.tall_grass], ID.grass); plant(4, [ID.red_mushroom, ID.brown_mushroom], ID.grass); }
    if (center === BIOME.SAVANNA) plant(40, [ID.tall_grass], ID.grass);
    // sugar cane on the shore, right next to water (only on land nobody had built on before it existed)
    if (fresh && this.genVerAt(cx * 16, cz * 16) >= 3 && center !== BIOME.DESERT) for (let i = 0; i < 40; i++) {
      const x = 1 + (rng() * 14 | 0), z = 1 + (rng() * 14 | 0), h = heights[x + z * 16], g = get(x, h, z);
      if (h > SEA + 2 || (g !== ID.grass && g !== ID.sand) || get(x, h + 1, z) !== 0) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => get(x + a, h, z + b) === ID.water)) continue;
      const tall = 1 + (rng() * 3 | 0);
      for (let k = 1; k <= tall; k++) set(x, h + k, z, ID.sugar_cane);
    }
    // powder snow: soft white patches on snowy land and mountains that you sink into (new land only)
    if (fresh && this.genVerAt(cx * 16, cz * 16) >= 6 && (center === BIOME.SNOWY || center === BIOME.MOUNTAIN)) {
      const pr = mulberry32(hash3(cx, cz, this.seed + 8383));
      if (pr() < 0.35) {
        const px = 4 + (pr() * 8 | 0), pz = 4 + (pr() * 8 | 0), r = 1.5 + pr() * 1.5;
        for (let x = px - 3; x <= px + 3; x++) for (let z = pz - 3; z <= pz + 3; z++) {
          if ((x - px) * (x - px) + (z - pz) * (z - pz) > r * r) continue;
          const h = heights[x + z * 16], top = get(x, h, z);
          if (h <= SEA + 2 || ![ID.snow_grass, ID.snow, ID.grass, ID.stone, ID.dirt].includes(top) || get(x, h + 1, z) !== 0) continue;
          set(x, h, z, ID.powder_snow); if (pr() < 0.7) set(x, h - 1, z, ID.powder_snow);
        }
      }
    }
    if (center === BIOME.BAMBOO) { // thick bamboo everywhere
      plant(20, [ID.tall_grass], ID.grass);
      for (let i = 0; i < 60; i++) {
        const x = rng() * 16 | 0, z = rng() * 16 | 0, h = heights[x + z * 16];
        if (get(x, h, z) !== ID.grass || get(x, h + 1, z) !== 0 || h + 16 >= GEN_H) continue;
        const tall = 4 + (rng() * 9 | 0);
        for (let k = 1; k <= tall; k++) { if (get(x, h + k, z) !== 0) break; set(x, h + k, z, ID.bamboo); }
      }
    }
    if (center === BIOME.CHERRY) { plant(20, [ID.tall_grass], ID.grass); plant(4, [ID.rose, ID.dandelion], ID.grass); }
    if (center === BIOME.MANGROVE) { // shallow puddles between the trees
      plant(12, [ID.tall_grass], ID.grass);
      for (let i = 0; i < 14; i++) {
        const x = 1 + (rng() * 14 | 0), z = 1 + (rng() * 14 | 0), h = heights[x + z * 16];
        if (h > SEA + 3 || get(x, h, z) !== ID.grass || get(x, h + 1, z) !== 0) continue;
        let ok = true;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = get(x + a, h, z + b); if (n === 0 || (DEFS[n] && !DEFS[n].solid && n !== ID.water)) ok = false; }
        if (ok) { set(x, h, z, ID.water); set(x, h - 1, z, ID.dirt); }
      }
    }
    if (center === BIOME.JUNGLE) { plant(30, [ID.tall_grass], ID.grass); if (rng() < 0.5) plant(3, [ID.melon], ID.grass); }
    if (center === BIOME.FOREST || center === BIOME.BIRCH) { plant(14, [ID.tall_grass], ID.grass); plant(3, [ID.rose, ID.dandelion, ID.red_mushroom, ID.brown_mushroom], ID.grass); }
    if (center === BIOME.TAIGA) { plant(8, [ID.tall_grass], ID.grass); plant(2, [ID.brown_mushroom, ID.red_mushroom], ID.grass); }
    if (center === BIOME.DESERT) {
      plant(3, [ID.dead_bush], ID.sand);
      for (let i = 0; i < 3; i++) {
        const x = 1 + (rng() * 14 | 0), z = 1 + (rng() * 14 | 0), h = heights[x + z * 16];
        if (get(x, h, z) !== ID.sand) continue;
        const ch = 1 + (rng() * 3 | 0);
        for (let k = 1; k <= ch; k++) set(x, h + k, z, ID.cactus);
      }
      rng(); // keeps the rest of the chunk the same as before
      if (this.pyramidChunk && this.pyramidChunk(cx, cz) && !(this.villageAt && this.villageAt(cx, cz))) this.pyramid(set, get, heights, rng, this.genVerAt(cx * 16, cz * 16) >= 4 && fresh);
    }
    if ((center === BIOME.PLAINS || center === BIOME.FOREST) && rng() < 0.08) plant(3, [ID.pumpkin, ID.melon], ID.grass);
    if (fresh && this.genVerAt(cx * 16, cz * 16) >= 7) this.newBiomeDecor(cx, cz, center, heights, biomes, set, get);
    if (this.newHearts) { c.hearts = this.newHearts; this.newHearts = null; }
    if (fresh && this.genVerAt(cx * 16, cz * 16) >= 10) this.bigStructures(cx, cz, c, set, get, heights, biomes);
    if (this.buildStructures) this.buildStructures(c, set, get, heights, biomes, rng);

    // apply player edits
    const m = this.edits.get(this.key(cx, cz));
    if (m) for (const [i, id] of m) d[i] = id;

    c.heights = heights;
    this.chunks.set(this.key(cx, cz), c);
    return c;
  }

  /* what grows in the newest biomes, and the three cave biomes underground (new land only) */
  newBiomeDecor(cx, cz, center, heights, biomes, set, get) {
    if (this.genVerAt(cx * 16, cz * 16) >= 9) this.decor9(cx, cz, center, heights, biomes, set, get);
    const B = BIOME, r = mulberry32(hash3(cx, cz, this.seed + 7777));
    const H = (x, z) => heights[x + z * 16];
    const plant = (n, ids, onTop) => {
      for (let i = 0; i < n; i++) {
        const x = r() * 16 | 0, z = r() * 16 | 0, h = H(x, z);
        if ((onTop === undefined ? get(x, h, z) === ID.grass : get(x, h, z) === onTop) && get(x, h + 1, z) === 0) set(x, h + 1, z, ids[r() * ids.length | 0]);
      }
    };
    const FLOWERS = [ID.rose, ID.dandelion, ID.allium, ID.tulip_red, ID.tulip_orange, ID.tulip_pink, ID.tulip_white, ID.oxeye_daisy, ID.cornflower, ID.lily_of_the_valley, ID.blue_orchid];
    if (center === B.SWAMP) {
      // shallow water everywhere, lily pads on it, blue orchids and mushrooms on land
      for (let z = 1; z < 15; z++) for (let x = 1; x < 15; x++) {
        const h = H(x, z);
        if (h <= SEA + 3 && get(x, h, z) === ID.grass && get(x, h + 1, z) === 0 && this.noiseB.noise2((cx * 16 + x) / 9, (cz * 16 + z) / 9) > -0.1) {
          let ok = true;
          for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = get(x + a, h, z + b); if (n === 0 || (DEFS[n] && !DEFS[n].solid && n !== ID.water)) ok = false; }
          if (ok) { set(x, h, z, ID.water); set(x, h - 1, z, ID.dirt); if (r() < 0.12) set(x, h + 1, z, ID.lily_pad); }
        }
      }
      for (let i = 0; i < 6; i++) { const x = r() * 16 | 0, z = r() * 16 | 0, h = Math.max(H(x, z), SEA); if (get(x, h, z) === ID.water && get(x, h + 1, z) === 0) set(x, h + 1, z, ID.lily_pad); }
      plant(10, [ID.tall_grass]); plant(3, [ID.blue_orchid]); plant(2, [ID.red_mushroom, ID.brown_mushroom]);
    }
    if (center === B.MUSHROOM) {
      plant(5, [ID.red_mushroom, ID.brown_mushroom], ID.mycelium);
      const n = r() < 0.6 ? 1 : 0;
      for (let t = 0; t < n; t++) {
        const x = 4 + (r() * 8 | 0), z = 4 + (r() * 8 | 0), h = H(x, z);
        if (get(x, h, z) !== ID.mycelium || h + 9 >= GEN_H) continue;
        const tall = 4 + (r() * 3 | 0), red = r() < 0.5;
        for (let k = 1; k <= tall; k++) set(x, h + k, z, ID.mushroom_stem);
        if (red) { // a dome of red caps
          for (let dy = tall - 2; dy <= tall + 1; dy++) for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
            const edge = Math.abs(a) === 2 || Math.abs(b) === 2;
            if (dy <= tall && !edge) continue; if (dy === tall + 1 && edge) continue; if (Math.abs(a) === 2 && Math.abs(b) === 2) continue;
            if (get(x + a, h + dy, z + b) === 0) set(x + a, h + dy, z + b, ID.red_mushroom_block);
          }
        } else { // a flat brown cap
          for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) if (!(Math.abs(a) === 3 && Math.abs(b) === 3) && get(x + a, h + tall + 1, z + b) === 0) set(x + a, h + tall + 1, z + b, ID.brown_mushroom_block);
        }
      }
    }
    if (center === B.BADLANDS) {
      plant(3, [ID.dead_bush], ID.red_sand);
      for (let i = 0; i < 2; i++) { const x = 1 + (r() * 14 | 0), z = 1 + (r() * 14 | 0), h = H(x, z); if (get(x, h, z) !== ID.red_sand) continue; for (let k = 1; k <= 1 + (r() * 3 | 0); k++) set(x, h + k, z, ID.cactus); }
      if (r() < 0.25) { // a tall stripy rock pillar
        const x = 3 + (r() * 10 | 0), z = 3 + (r() * 10 | 0), h = H(x, z), tall = 4 + (r() * 8 | 0);
        if (get(x, h, z) === ID.red_sand) for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) for (let k = 1; k <= tall - (a + b); k++) set(x + a, h + k, z + b, this.BAND[(h + k) % this.BAND.length]);
      }
      // gold lies near the surface in the badlands, like Minecraft
      for (let v = 0; v < 4; v++) { const x = r() * 16 | 0, z = r() * 16 | 0, y = 20 + (r() * 30 | 0); if (get(x, y, z) === ID.stone) set(x, y, z, ID.gold_ore); }
    }
    if (center === B.ICE_SPIKES && r() < 0.7) {
      const x = 3 + (r() * 10 | 0), z = 3 + (r() * 10 | 0), h = H(x, z), tall = r() < 0.15 ? 18 + (r() * 10 | 0) : 6 + (r() * 8 | 0), wide = tall > 15 ? 2 : 1;
      if (h + tall < GEN_H - 2) for (let k = 1; k <= tall; k++) {
        const w = Math.max(0, Math.round(wide * (1 - k / tall)));
        for (let a = -w; a <= w; a++) for (let b = -w; b <= w; b++) if (Math.abs(a) + Math.abs(b) <= w + 0.5) set(x + a, h + k, z + b, ID.packed_ice);
      }
    }
    if (center === B.FROZEN_OCEAN && r() < 0.15) { // an iceberg
      const x = 4 + (r() * 8 | 0), z = 4 + (r() * 8 | 0), rad = 2 + (r() * 2 | 0), tall = 3 + (r() * 6 | 0);
      for (let k = -3; k <= tall; k++) { const w = k < 0 ? rad : Math.round(rad * (1 - k / (tall + 1))); for (let a = -w; a <= w; a++) for (let b = -w; b <= w; b++) if (a * a + b * b <= w * w + 1) set(x + a, SEA + k, z + b, r() < 0.15 ? ID.blue_ice : ID.packed_ice); }
    }
    if (center === B.WARM_OCEAN) { // coral reefs on the sea floor
      const CORAL = [ID.coral_block_tube, ID.coral_block_brain, ID.coral_block_bubble, ID.coral_block_fire, ID.coral_block_horn];
      for (let i = 0; i < 14; i++) {
        const x = r() * 16 | 0, z = r() * 16 | 0, h = H(x, z);
        if (h >= SEA - 2 || get(x, h + 1, z) !== ID.water) continue;
        const c = CORAL[r() * 5 | 0], tall = 1 + (r() * 3 | 0);
        for (let k = 1; k <= tall && h + k < SEA - 1; k++) set(x, h + k, z, c);
        if (r() < 0.5 && get(x + 1, h + 1, z) === ID.water) set(x + 1, h + 1, z, CORAL[r() * 5 | 0]);
      }
    }
    if (center === B.FLOWER_FOREST) { plant(10, [ID.tall_grass]); plant(40, FLOWERS); }
    if (center === B.PALE_GARDEN) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) { const h = H(x, z); if (get(x, h, z) === ID.grass && this.noiseC.noise2((cx * 16 + x) / 6, (cz * 16 + z) / 6) > -0.2) set(x, h, z, ID.pale_moss_block); }
    if (center === B.MEADOW) { plant(30, [ID.tall_grass]); plant(14, [ID.allium, ID.cornflower, ID.oxeye_daisy, ID.dandelion, ID.rose]); }
    if (center === B.SUNFLOWER_PLAINS) { plant(24, [ID.tall_grass]); plant(14, [ID.sunflower]); plant(3, [ID.oxeye_daisy, ID.tulip_red, ID.dandelion]); }
    if (center === B.PLAINS || center === B.FOREST) plant(2, [ID.tulip_red, ID.tulip_orange, ID.oxeye_daisy, ID.cornflower, ID.allium, ID.lily_of_the_valley]);

    // underground: lush caves, dripstone caves and the deep dark
    const cave = this.caveKind(cx * 16 + 8, cz * 16 + 8);
    const stoneLike = id => id === ID.stone || id === ID.deepslate || id === ID.dirt || id === ID.gravel;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const top = H(x, z) - 6;
      for (let y = 7; y < top; y++) {
        if (get(x, y, z) !== 0) continue;
        const below = get(x, y - 1, z), above = get(x, y + 1, z);
        const kind = y <= 16 && this.deepDark(cx * 16 + x, cz * 16 + z) ? B.DEEP_DARK : cave;
        if (kind === B.DEEP_DARK) {
          if (stoneLike(below) && r() < 0.8) { set(x, y - 1, z, ID.sculk); if (r() < 0.025 && get(x, y + 1, z) === 0) set(x, y, z, ID.sculk_sensor); }
          if (stoneLike(above) && r() < 0.5) set(x, y + 1, z, ID.sculk);
        } else if (kind === B.LUSH_CAVES) {
          if (stoneLike(below)) { set(x, y - 1, z, ID.moss_block); const q = r(); if (q < 0.06) set(x, y, z, ID.azalea); else if (q < 0.09) set(x, y, z, ID.flowering_azalea); else if (q < 0.25) set(x, y, z, ID.tall_grass); else if (q < 0.27) { set(x, y - 1, z, ID.clay); } }
          else if (stoneLike(above)) { if (r() < 0.5) set(x, y + 1, z, ID.moss_block); if (r() < 0.12) for (let k = 0; k < 1 + (r() * 4 | 0) && get(x, y - k, z) === 0; k++) set(x, y - k, z, ID.cave_vines); }
        } else if (kind === B.DRIPSTONE_CAVES) {
          if (stoneLike(below)) { if (r() < 0.45) set(x, y - 1, z, ID.dripstone_block); if (r() < 0.1) set(x, y, z, ID.pointed_dripstone); }
          else if (stoneLike(above)) { if (r() < 0.45) set(x, y + 1, z, ID.dripstone_block); if (r() < 0.12) set(x, y, z, ID.pointed_dripstone); }
        }
      }
    }
  }
  /* new land only (10): trial chambers underground, ocean monuments, buried suspicious sand */
  bigStructures(cx, cz, c, set, get, heights, biomes) {
    const put = (x, y, z, id) => set(x - cx * 16, y, z - cz * 16, id);
    for (let gx = Math.floor(cx / 24) - 1; gx <= Math.floor(cx / 24) + 1; gx++) for (let gz = Math.floor(cz / 24) - 1; gz <= Math.floor(cz / 24) + 1; gz++) {
      const t = this.trialAt(gx, gz);
      if (t && Math.abs(t.x - (cx * 16 + 8)) < 40 && Math.abs(t.z - (cz * 16 + 8)) < 40) this.buildTrial(t, put, c, cx, cz);
      const m = this.monumentAt(gx, gz);
      if (m && Math.abs(m.x - (cx * 16 + 8)) < 40 && Math.abs(m.z - (cz * 16 + 8)) < 40) this.buildMonument(m, put, c, cx, cz);
      const a = this.ancientCityAt(gx, gz);
      if (a && Math.abs(a.x - (cx * 16 + 8)) < 48 && Math.abs(a.z - (cz * 16 + 8)) < 48) this.buildAncientCity(a, put, c, cx, cz);
      const w = this.mansionAt(gx, gz);
      if (w && Math.abs(w.x - (cx * 16 + 8)) < 40 && Math.abs(w.z - (cz * 16 + 8)) < 40) this.buildMansion(w, put, c, cx, cz);
    }
    // a little buried archaeology: suspicious sand in deserts and warm seas, suspicious gravel in old ruins
    const r = mulberry32(hash3(cx, cz, this.seed + 1212)), center = biomes[136];
    if ((center === BIOME.DESERT || center === BIOME.WARM_OCEAN || center === BIOME.BEACH) && r() < 0.08) {
      for (let i = 0; i < 5; i++) { const x = 3 + (r() * 10 | 0), z = 3 + (r() * 10 | 0), h = heights[x + z * 16]; if (get(x, h, z) === ID.sand && get(x, h - 1, z) === ID.sand) set(x, h - 1, z, ID.suspicious_sand); }
    }
    if ((center === BIOME.TAIGA || center === BIOME.JUNGLE || center === BIOME.BIRCH) && r() < 0.03) {
      // trail ruins: an old terracotta floor just under the ground
      const h = heights[8 + 8 * 16];
      for (let a = 3; a < 13; a++) for (let b = 3; b < 13; b++) { const q = r(); if (q < 0.5) set(a, h - 2, b, [ID.terracotta, ID.terracotta_brown, ID.terracotta_orange, ID.mud_bricks][q * 8 | 0]); else if (q < 0.58) set(a, h - 1, b, ID.suspicious_gravel); }
    }
  }
  trialAt(gx, gz) {
    this.trialCache = this.trialCache || new Map();
    const key = 't' + gx + ',' + gz;
    if (!this.trialCache.has(key)) {
      const r = mulberry32(hash3(gx, gz, this.seed + 717)), x = (gx * 24 + 3 + (r() * 18 | 0)) * 16 + 8, z = (gz * 24 + 3 + (r() * 18 | 0)) * 16 + 8, h = this.heightAt(x, z);
      this.trialCache.set(key, r() < 0.7 && h > SEA + 6 && this.genVerAt(x, z) >= 10 && this.fresh7(x, z) ? { x, z, y: 14 + (r() * 6 | 0), top: h } : null);
    }
    return this.trialCache.get(key);
  }
  monumentAt(gx, gz) {
    this.monCache = this.monCache || new Map();
    const key = 'm' + gx + ',' + gz;
    if (!this.monCache.has(key)) {
      const r = mulberry32(hash3(gx, gz, this.seed + 818));
      let m = null;
      for (let t = 0; t < 12 && !m; t++) {
        const x = (gx * 24 + 3 + (r() * 18 | 0)) * 16 + 8, z = (gz * 24 + 3 + (r() * 18 | 0)) * 16 + 8;
        if ([[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20]].every(([a, b]) => this.heightAt(x + a, z + b) < SEA - 10) && this.genVerAt(x, z) >= 10 && this.fresh7(x, z)) m = { x, z, y: Math.min(...[[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20]].map(([a, b]) => this.heightAt(x + a, z + b))) };
      }
      this.monCache.set(key, m);
    }
    return this.monCache.get(key);
  }
  ancientCityAt(gx, gz) {
    this.acCache = this.acCache || new Map();
    const key = 'a' + gx + ',' + gz;
    if (!this.acCache.has(key)) {
      const r = mulberry32(hash3(gx, gz, this.seed + 919));
      let a = null;
      for (let t = 0; t < 16 && !a; t++) {
        const x = (gx * 24 + 4 + (r() * 16 | 0)) * 16 + 8, z = (gz * 24 + 4 + (r() * 16 | 0)) * 16 + 8;
        if (this.deepDark(x, z) && this.deepDark(x + 30, z) && this.deepDark(x - 30, z) && this.heightAt(x, z) > SEA + 4 && this.genVerAt(x, z) >= 10 && this.fresh7(x, z)) a = { x, z, y: 6 };
      }
      this.acCache.set(key, a);
    }
    return this.acCache.get(key);
  }
  mansionAt(gx, gz) {
    this.wmCache = this.wmCache || new Map();
    const key = 'w' + gx + ',' + gz;
    if (!this.wmCache.has(key)) {
      const r = mulberry32(hash3(gx, gz, this.seed + 1020));
      let w = null;
      for (let t = 0; t < 20 && !w; t++) {
        const x = (gx * 24 + 3 + (r() * 18 | 0)) * 16 + 8, z = (gz * 24 + 3 + (r() * 18 | 0)) * 16 + 8, h = this.heightAt(x, z);
        if (r() < 0.6 && this.biomeAt(x, z, h) === BIOME.DARK_FOREST && this.biomeAt(x + 14, z + 14, this.heightAt(x + 14, z + 14)) === BIOME.DARK_FOREST && h > SEA + 2 && this.genVerAt(x, z) >= 10 && this.fresh7(x, z)) w = { x, z, y: h + 1 };
      }
      this.wmCache.set(key, w);
    }
    return this.wmCache.get(key);
  }
  /* an ancient city deep in the dark: a huge cave with a strange stone gateway, little houses with treasure, and shriekers that call the warden */
  buildAncientCity(a, put, c, cx, cz) {
    const { x: ox, y: oy, z: oz } = a, r = mulberry32(hash3(ox, oz, this.seed + 3));
    const mine = (x, z) => Math.floor(x / 16) === cx && Math.floor(z / 16) === cz;
    for (let dx = -40; dx <= 40; dx++) for (let dz = -30; dz <= 30; dz++) {
      const e = (dx / 41) ** 2 + (dz / 31) ** 2; if (e > 1) continue;
      const roof = oy + 6 + Math.floor((1 - e) * 16);
      for (let y = oy - 1; y <= roof; y++) put(ox + dx, y, oz + dz, y === oy - 1 ? ID.deepslate : y === oy ? ((dx + dz) % 7 === 0 ? ID.sculk : ID.deepslate_tiles) : y === roof ? ID.sculk : 0);
    }
    // the gateway in the middle: a big frame of reinforced deepslate
    for (let dx = -10; dx <= 10; dx++) for (let k = 1; k <= 13; k++) {
      const side = Math.abs(dx) >= 8, top = k >= 11;
      if (side || top) for (let dz = -1; dz <= 1; dz++) put(ox + dx, oy + k, oz + dz, Math.abs(dx) === 10 || k === 13 ? ID.reinforced_deepslate : ID.deepslate_bricks);
    }
    for (let dx = -12; dx <= 12; dx++) for (let dz = -3; dz <= 3; dz++) put(ox + dx, oy, oz + dz, ID.polished_deepslate);
    // houses around it
    c.shriekers = c.shriekers || [];
    for (let i = 0; i < 10; i++) {
      const hx = ox + (r() < 0.5 ? -1 : 1) * (14 + (r() * 18 | 0)), hz = oz + (r() * 40 | 0) - 20;
      for (let a2 = -3; a2 <= 3; a2++) for (let b = -3; b <= 3; b++) for (let k = 1; k <= 5; k++) {
        const edge = Math.abs(a2) === 3 || Math.abs(b) === 3;
        put(hx + a2, oy + k, hz + b, k === 5 ? ID.deepslate_tiles : edge ? (k === 1 && a2 === 0 && b === -3 ? 0 : k === 2 && a2 === 0 && b === -3 ? 0 : ID.deepslate_bricks) : 0);
      }
      put(hx + 2, oy + 1, hz + 2, ID.chest_loot); put(hx - 2, oy + 1, hz + 2, r() < 0.5 ? ID.candle_lit : ID.soul_lantern);
      const sx = hx + (r() < 0.5 ? 5 : -5), sz = hz;
      put(sx, oy + 1, sz, ID.sculk_shrieker);
      if (mine(sx, sz)) c.shriekers.push([sx, oy + 1, sz]);
      put(hx, oy + 1, hz + 5, ID.sculk_sensor);
    }
    for (let i = 0; i < 12; i++) put(ox + (r() * 70 | 0) - 35, oy + 1, oz + (r() * 50 | 0) - 25, ID.soul_lantern);
  }
  /* a woodland mansion: a big dark oak house in the dark forest, with vindicators, evokers and allays inside */
  buildMansion(w, put, c, cx, cz) {
    const { x: ox, y: oy, z: oz } = w, DP = ID.dark_oak_planks, DL = ID.dark_oak_log, CB = ID.cobblestone, BI = ID.birch_planks, r = mulberry32(hash3(ox, oz, this.seed + 5));
    const W2 = 15, D2 = 12, FLOORS = 3, FH = 5;
    for (let a = -W2 - 1; a <= W2 + 1; a++) for (let b = -D2 - 1; b <= D2 + 1; b++) for (let y = oy - 4; y < oy; y++) put(ox + a, y, oz + b, CB);
    for (let f = 0; f < FLOORS; f++) {
      const y0 = oy + f * FH;
      for (let a = -W2; a <= W2; a++) for (let b = -D2; b <= D2; b++) for (let k = 0; k < FH; k++) {
        const edgeA = Math.abs(a) === W2, edgeB = Math.abs(b) === D2, corner = edgeA && edgeB;
        let id = 0;
        if (k === 0) id = f === 0 ? CB : BI;
        else if (corner || (edgeA && b % 6 === 0) || (edgeB && a % 6 === 0)) id = DL;
        else if (edgeA || edgeB) id = k === 2 && (a + b) % 3 !== 0 ? ID.glass : DP;
        else if ((a === 0 || b === 0) && k < FH - 1 && !(Math.abs(a) < 2 && Math.abs(b) < 2) && !((a === 0 && Math.abs(b) % 6 === 3) || (b === 0 && Math.abs(a) % 6 === 3))) id = DP;
        put(ox + a, y0 + k, oz + b, id);
      }
      // a few things in each room
      for (const [qa, qb] of [[-8, -6], [8, -6], [-8, 6], [8, 6]]) {
        const q = r();
        put(ox + qa, y0 + 1, oz + qb, q < 0.35 ? ID.chest_loot : q < 0.6 ? ID.bookshelf : q < 0.8 ? ID.crafting_table : ID.carpet_red);
        put(ox + qa + 1, y0 + 1, oz + qb, ID.carpet_red);
      }
    }
    // a roof
    for (let k = 0; k <= 6; k++) for (let a = -W2 - 1 + k; a <= W2 + 1 - k; a++) for (let b = -D2 - 1 + k; b <= D2 + 1 - k; b++) put(ox + a, oy + FLOORS * FH + k, oz + b, k === 6 || Math.abs(a) === W2 + 1 - k || Math.abs(b) === D2 + 1 - k ? DP : 0);
    // the front door and stairs up (ladders in the middle)
    for (let k = 1; k <= 3; k++) { put(ox, oy + k, oz - D2, 0); put(ox + 1, oy + k, oz - D2, 0); }
    for (let y = oy + 1; y < oy + FLOORS * FH; y++) { put(ox + 1, y, oz + 1, DL); put(ox + 1, y, oz, ID.ladder_s); }
    for (let f = 1; f < FLOORS; f++) put(ox + 1, oy + f * FH, oz, ID.ladder_s);
    // the secret room on the top floor: a diamond block
    put(ox - 12, oy + (FLOORS - 1) * FH + 1, oz + 9, ID.diamond_block);
    if (Math.floor(ox / 16) === cx && Math.floor(oz / 16) === cz) c.mansion = { x: ox, y: oy + 1, z: oz };
  }
  /* bastion remnants in the Nether: big blackstone ruins full of gold, guarded by piglins (only where nobody has built) */
  netherStructures(cx, cz, c, set) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const m = this.edits.get(this.key(cx + dx, cz + dz)); if (m && m.size) return; }
    const put = (x, y, z, id) => set(x - cx * 16, y, z - cz * 16, id);
    for (let gx = Math.floor(cx / 16) - 1; gx <= Math.floor(cx / 16) + 1; gx++) for (let gz = Math.floor(cz / 16) - 1; gz <= Math.floor(cz / 16) + 1; gz++) {
      const r = mulberry32(hash3(gx, gz, this.seed + 1121));
      if (r() > 0.5) continue;
      const ox = (gx * 16 + 3 + (r() * 10 | 0)) * 16 + 8, oz = (gz * 16 + 3 + (r() * 10 | 0)) * 16 + 8, oy = 34;
      if (Math.abs(ox - (cx * 16 + 8)) > 36 || Math.abs(oz - (cz * 16 + 8)) > 36) continue;
      const PB = ID.polished_blackstone_bricks, BS = ID.blackstone, GB = ID.gilded_blackstone;
      for (let a = -14; a <= 14; a++) for (let b = -14; b <= 14; b++) for (let k = -2; k <= 22; k++) {
        const ring = Math.max(Math.abs(a), Math.abs(b)), y = oy + k;
        let id = 0;
        if (k <= 0) id = k === -2 ? BS : PB;
        else if (ring === 14) id = k % 7 === 0 ? BS : ((a * 7 + b * 3 + k) % 11 === 0 ? 0 : PB);
        else if (k % 7 === 0 && ring > 4) id = (a + b) % 9 === 0 ? 0 : PB;
        else if (ring === 4 && k < 7) id = PB;
        else id = 0;
        if (id === PB && r() < 0.06) id = GB;
        put(ox + a, y, oz + b, id);
      }
      // the treasure: gold blocks in the middle, with lava around and chests
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) put(ox + a, oy + 1, oz + b, (a + b) % 2 ? ID.gold_block : GB);
      put(ox + 3, oy + 1, oz, ID.chest_loot); put(ox - 3, oy + 1, oz, ID.chest_loot); put(ox, oy + 8, oz + 8, ID.chest_loot);
      for (let a = -1; a <= 1; a++) { put(ox + a, oy + 1, oz - 4, 0); put(ox + a, oy + 2, oz - 4, 0); put(ox + a, oy + 1, oz - 14, 0); put(ox + a, oy + 2, oz - 14, 0); put(ox + a, oy + 3, oz - 14, 0); }
      for (let y = oy + 1; y < oy + 21; y++) put(ox - 10, y, oz - 10, ID.ladder_n);
      if (Math.floor(ox / 16) === cx && Math.floor(oz / 16) === cz) c.bastion = { x: ox, y: oy + 1, z: oz };
    }
  }
  /* a trial chamber: a big tuff and copper hall with rooms around it, trial spawners and vaults, and stairs down from a little hut */
  buildTrial(t, put, c, cx, cz) {
    const { x: ox, y: oy, z: oz } = t, TB = ID.tuff_bricks, PT = ID.polished_tuff, CC = ID.cut_copper, WC = ID.oxidized_cut_copper;
    const mine = (x, z) => Math.floor(x / 16) === cx && Math.floor(z / 16) === cz;
    const box = (x0, y0, z0, w, d, h, wall, floor) => {
      for (let a = -w; a <= w; a++) for (let b = -d; b <= d; b++) for (let k = 0; k <= h; k++) {
        const edge = Math.abs(a) === w || Math.abs(b) === d;
        put(x0 + a, y0 + k, z0 + b, k === 0 ? ((a + b) % 4 === 0 ? CC : floor) : k === h ? (a % 3 === 0 && b % 3 === 0 ? ID.copper_block : wall) : edge ? (k === 3 && (a === 0 || b === 0) ? WC : wall) : 0);
      }
    };
    box(ox, oy, oz, 10, 10, 8, TB, PT);
    for (const [dx, dz] of [[18, 0], [-18, 0], [0, 18], [0, -18]]) {
      box(ox + dx, oy, oz + dz, 5, 5, 6, TB, PT);
      // a corridor to the hall
      const sx = Math.sign(dx), sz = Math.sign(dz);
      for (let s = 10; s <= 13; s++) for (let w = -1; w <= 1; w++) for (let k = 1; k <= 3; k++) put(ox + sx * s + (sz ? w : 0), oy + k, oz + sz * s + (sx ? w : 0), 0);
      for (let s = 10; s <= 13; s++) for (let w = -2; w <= 2; w++) { put(ox + sx * s + (sz ? w : 0), oy, oz + sz * s + (sx ? w : 0), PT); put(ox + sx * s + (sz ? w : 0), oy + 4, oz + sz * s + (sx ? w : 0), TB); if (Math.abs(w) === 2) for (let k = 1; k <= 3; k++) put(ox + sx * s + (sz ? w : 0), oy + k, oz + sz * s + (sx ? w : 0), TB); }
      put(ox + dx, oy + 1, oz + dz, ID.trial_spawner);
      put(ox + dx + 3, oy + 1, oz + dz + 3, ID.vault);
      if (mine(ox + dx, oz + dz)) (c.trials = c.trials || []).push([ox + dx, oy + 1, oz + dz]);
      put(ox + dx - 3, oy + 1, oz + dz - 3, ID.chest_loot); put(ox + dx - 3, oy + 1, oz + dz + 3, ID.decorated_pot);
    }
    put(ox - 4, oy + 1, oz, ID.trial_spawner); put(ox + 4, oy + 1, oz, ID.trial_spawner); put(ox, oy + 1, oz + 6, ID.vault); put(ox, oy + 1, oz - 6, ID.vault);
    for (const [a, b] of [[-4, 0], [4, 0]]) if (mine(ox + a, oz + b)) (c.trials = c.trials || []).push([ox + a, oy + 1, oz + b]);
    for (const [a, b] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) for (let k = 1; k < 8; k++) put(ox + a, oy + k, oz + b, ID.copper_block);
    // stairs: a shaft with a ladder from a little tuff hut at the surface down into the hall
    const hx = ox + 7, hz = oz - 7;
    for (let y = oy + 1; y <= t.top + 4; y++) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      if (y > t.top) { if (y === t.top + 4) put(hx + a, y, hz + b, TB); else put(hx + a, y, hz + b, (Math.abs(a) === 1 || Math.abs(b) === 1) && !(a === 0 && b === -1 && y <= t.top + 2) ? TB : 0); }
      else if (y > oy + 8) put(hx + a, y, hz + b, (Math.abs(a) === 1 || Math.abs(b) === 1) ? TB : 0);
      else if (a === 0 && b === 0) put(hx, y, hz, 0);
    }
    for (let y = oy + 1; y <= t.top + 1; y++) put(hx, y, hz, ID.ladder_n);
  }
  /* an ocean monument: a huge prismarine building full of water, with gold blocks in its heart and sponges in its rooms */
  buildMonument(m, put, c, cx, cz) {
    const { x: ox, z: oz } = m, y0 = m.y + 1, top = SEA - 3, PR = ID.prismarine_bricks, DP = ID.dark_prismarine, PM = ID.prismarine, SL = ID.sea_lantern, W = ID.water;
    for (let a = -20; a <= 20; a++) for (let b = -20; b <= 20; b++) {
      const ring = Math.max(Math.abs(a), Math.abs(b));
      for (let y = y0; y <= top; y++) {
        const k = y - y0, roofH = ring > 14 ? top - 8 : top;
        if (y > roofH) continue;
        let id = W;
        if (k === 0) id = PR;
        else if (ring === 20 && y < roofH) id = (a + b + k) % 6 === 0 ? SL : PR;
        else if (y === roofH) id = ring % 5 === 0 ? DP : PR;
        else if (ring === 14 && (k % 6 < 5) && !(Math.abs(a) < 3 || Math.abs(b) < 3)) id = PM;
        else if (ring === 6 && k < 7) id = DP;
        else if (ring < 6 && k === 7) id = DP;
        else if (Math.abs(a) % 10 === 0 && Math.abs(b) % 10 === 0 && ring > 6) id = PM;
        put(ox + a, y, oz + b, id);
      }
    }
    for (const [a, b] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) for (let k = 1; k <= 2; k++) put(ox + a, y0 + k, oz + b, ID.gold_block);
    for (const [a, b] of [[-17, -17], [17, 17], [-17, 17]]) for (let k = 1; k <= 2; k++) put(ox + a, y0 + k, oz + b, ID.wet_sponge);
    for (let k = 1; k < 4; k++) { put(ox - 6, y0 + k, oz, W); put(ox + 6, y0 + k, oz, W); for (let w = -1; w <= 1; w++) { put(ox + w, y0 + k, oz - 20, W); put(ox + w, y0 + k, oz + 20, W); put(ox - 20, y0 + k, oz + w, W); put(ox + 20, y0 + k, oz + w, W); } }
    if (Math.floor(ox / 16) === cx && Math.floor(oz / 16) === cz) c.monument = { x: ox, y: y0 + 2, z: oz };
  }
  /* new land only: copper and other stones underground, amethyst geodes, plants in the sea, berry bushes, vines, cobwebs */
  decor9(cx, cz, center, heights, biomes, set, get) {
    const B = BIOME, r = mulberry32(hash3(cx, cz, this.seed + 9999)), H = (x, z) => heights[x + z * 16];
    const blob = (ore, deepOre, count, y0, y1, size, onlyIn) => {
      for (let v = 0; v < count; v++) {
        let x = r() * 16, y = y0 + r() * (y1 - y0), z = r() * 16;
        for (let s = 0; s < size; s++) {
          const xi = x | 0, yi = y | 0, zi = z | 0, here = get(xi, yi, zi);
          if (here === ID.stone && (!onlyIn || onlyIn === ID.stone)) set(xi, yi, zi, ore);
          else if (here === ID.deepslate && deepOre) set(xi, yi, zi, deepOre);
          x += r() * 2 - 1; y += r() * 2 - 1; z += r() * 2 - 1;
        }
      }
    };
    blob(ID.copper_ore, ID.deepslate_copper_ore, 6, 10, 70, 9);
    blob(ID.granite, 0, 1, 8, 70, 40); blob(ID.diorite, 0, 1, 8, 70, 40); blob(ID.andesite, 0, 1, 8, 70, 40);
    blob(ID.tuff, ID.tuff, 1, 2, 16, 40);
    // an amethyst geode now and then
    if (r() < 0.035) {
      const gx = 6 + (r() * 4 | 0), gz = 6 + (r() * 4 | 0), gy = 8 + (r() * 24 | 0);
      if (gy + 6 < H(gx, gz) - 4) for (let a = -5; a <= 5; a++) for (let b = -5; b <= 5; b++) for (let c = -5; c <= 5; c++) {
        const d = Math.sqrt(a * a + b * b + c * c), x = gx + a, y = gy + b, z = gz + c;
        if (d > 4.6 || get(x, y, z) === -1 || get(x, y, z) === ID.water || get(x, y, z) === ID.bedrock) continue;
        set(x, y, z, d > 4 ? ID.smooth_basalt : d > 3.4 ? ID.calcite : d > 2.7 ? (r() < 0.1 ? ID.budding_amethyst : ID.amethyst_block) : 0);
      }
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (let c = -3; c <= 3; c++) {
        const x = gx + a, y = gy + b, z = gz + c;
        if (get(x, y, z) === 0 && get(x, y - 1, z) === ID.budding_amethyst) set(x, y, z, ID.amethyst_cluster);
      }
    }
    // the sea: seagrass and kelp (and sea pickles and corals in warm water)
    const sea = center === B.OCEAN || center === B.WARM_OCEAN || center === B.FROZEN_OCEAN || center === B.SWAMP || center === B.MANGROVE;
    if (sea) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = H(x, z), fl = get(x, h, z);
      if (get(x, h + 1, z) !== ID.water || ![ID.sand, ID.gravel, ID.clay, ID.dirt, ID.grass].includes(fl)) continue;
      if ((center === B.SWAMP || center === B.MANGROVE) && (fl === ID.dirt || fl === ID.grass)) set(x, h, z, ID.mud);
      const q = r();
      if (center !== B.WARM_OCEAN && q < 0.06 && h < SEA - 3) { const top = SEA - 2 - (r() * 4 | 0); for (let y = h + 1; y <= top; y++) if (get(x, y, z) === ID.water) set(x, y, z, ID.kelp); }
      else if (q < 0.2 && get(x, h + 2, z) === ID.water) set(x, h + 1, z, ID.seagrass);
      else if (center === B.WARM_OCEAN && q < 0.34) set(x, h + 1, z, ID.sea_pickle);
      else if (center === B.WARM_OCEAN && q < 0.45) set(x, h + 1, z, [ID.coral_tube, ID.coral_brain, ID.coral_bubble, ID.coral_fire, ID.coral_horn, ID.coral_fan_tube, ID.coral_fan_brain, ID.coral_fan_fire][r() * 8 | 0]);
    }
    // berry bushes in the taiga
    if (center === B.TAIGA) for (let i = 0; i < 4; i++) { const x = r() * 16 | 0, z = r() * 16 | 0, h = H(x, z); if (get(x, h, z) === ID.grass && get(x, h + 1, z) === 0) set(x, h + 1, z, ID.sweet_berry_bush_ripe); }
    // vines hanging from jungle and swamp leaves
    if (center === B.JUNGLE || center === B.BAMBOO || center === B.SWAMP || center === B.MANGROVE) {
      const LEAF = id => id > 0 && DEFS[id] && DEFS[id].leaves;
      for (let i = 0; i < 70; i++) {
        const x = 1 + (r() * 14 | 0), z = 1 + (r() * 14 | 0), y = H(x, z) + 3 + (r() * 10 | 0);
        if (get(x, y, z) !== 0) continue;
        const sides = [[-1, 0, 'w'], [1, 0, 'e'], [0, -1, 'n'], [0, 1, 's']].filter(([a, c]) => LEAF(get(x + a, y, z + c)) || get(x + a, y, z + c) === ID.jungle_log);
        if (!sides.length) continue;
        const v = ID['vine_' + sides[0][2]];
        for (let k = 0; k < 2 + (r() * 5 | 0) && get(x, y - k, z) === 0; k++) set(x, y - k, z, v);
      }
    }
    // cobwebs in dark caves
    for (let i = 0; i < 6; i++) { const x = r() * 16 | 0, z = r() * 16 | 0, y = 8 + (r() * 40 | 0); if (y < H(x, z) - 8 && get(x, y, z) === 0 && get(x, y + 1, z) === ID.stone && r() < 0.5) set(x, y, z, ID.cobweb); }
  }
  caveKind(x, z) {
    const S = this.style, sx = x + S.ox, sz = z + S.oz;
    if (this.noiseB.fbm2(sx / 150 + 2200, sz / 150 - 1700, 2) > 0.22) return BIOME.LUSH_CAVES;
    if (this.noiseC.fbm2(sx / 150 - 2900, sz / 150 + 3100, 2) > 0.24) return BIOME.DRIPSTONE_CAVES;
    return -1;
  }
  deepDark(x, z) { const S = this.style; return this.noise.fbm2((x + S.ox) / 120 + 5100, (z + S.oz) / 120 - 5100, 2) > 0.2; }
  /* which cave biome is here, deep underground (for the F3 screen and the mobs) */
  caveBiomeAt(x, y, z) {
    if (this.dim !== 'overworld' || !this.fresh7(x, z) || y > this.heightAt(Math.floor(x), Math.floor(z)) - 8) return -1;
    if (y <= 16 && this.deepDark(Math.floor(x), Math.floor(z))) return BIOME.DEEP_DARK;
    return this.caveKind((Math.floor(x) >> 4) * 16 + 8, (Math.floor(z) >> 4) * 16 + 8);
  }

  /* the End: one big island of end stone floating over the void, ringed by obsidian pillars */
  endPillars() {
    if (this.pillars) return this.pillars;
    const r = mulberry32(this.seed + 5);
    this.pillars = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      this.pillars.push({ x: Math.round(Math.cos(a) * 40), z: Math.round(Math.sin(a) * 40), r: 2 + (r() * 3 | 0), top: 66 + (r() * 22 | 0) });
    }
    return this.pillars;
  }
  /* far out (past 600 blocks) the End has more islands, with chorus plants and end cities */
  outerIsland(wx, wz) { const n = this.noise.fbm2(wx / 110 + 300, wz / 110 - 300, 3); return n > 0.12 ? n - 0.12 : -1; }
  endTop(wx, wz) {
    const d = Math.hypot(wx, wz);
    if (d > 600) { const n = this.outerIsland(wx, wz); return n < 0 ? -1 : Math.floor(52 + n * 26 + this.noiseB.fbm2(wx / 25, wz / 25, 2) * 2); }
    const edge = 72 + this.noise.fbm2(wx / 40, wz / 40, 2) * 14;
    if (d > edge) return -1;
    return Math.floor(50 + (1 - (d / edge) ** 2) * 5 + this.noiseB.fbm2(wx / 25, wz / 25, 2) * 2);
  }
  generateEnd(cx, cz) {
    const c = new Chunk(cx, cz);
    const d = c.data;
    const heights = new Int16Array(256);
    const set = (x, y, z, id) => { if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < WH) d[x + (z << 4) + (y << 8)] = id; };
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = cx * 16 + x, wz = cz * 16 + z, top = this.endTop(wx, wz);
      heights[x + z * 16] = Math.max(top, 0);
      if (top < 0) continue;
      const dist = Math.hypot(wx, wz), depth = dist > 600 ? 3 + Math.floor(this.outerIsland(wx, wz) * 45) : 6 + Math.floor((1 - Math.min(1, dist / 80)) * 24);
      for (let y = top - depth; y <= top; y++) set(x, y, z, ID.end_stone);
      for (const p of this.endPillars()) {
        if (Math.hypot(wx - p.x, wz - p.z) <= p.r + 0.3) {
          for (let y = top + 1; y <= p.top; y++) set(x, y, z, ID.obsidian);
          heights[x + z * 16] = p.top;
        }
      }
    }
    if (Math.hypot(cx * 16, cz * 16) > 560) this.outerEnd(cx, cz, c, set, heights);
    c.heights = heights;
    // apply player edits
    const m = this.edits.get(this.key(cx, cz));
    if (m) for (const [i, id] of m) d[i] = id;
    this.chunks.set(this.key(cx, cz), c);
    return c;
  }

  /* chorus plants, and any end city (with its ship) that reaches into this chunk */
  outerEnd(cx, cz, c, set, heights) {
    const r = mulberry32(hash3(cx, cz, this.seed + 515));
    for (let i = 0; i < 3; i++) {
      const x = 2 + (r() * 12 | 0), z = 2 + (r() * 12 | 0), wx = cx * 16 + x, wz = cz * 16 + z, top = this.endTop(wx, wz);
      if (top < 0 || r() < 0.4) continue;
      const tall = 2 + (r() * 5 | 0);
      for (let k = 1; k <= tall; k++) set(x, top + k, z, ID.chorus_plant);
      set(x, top + tall + 1, z, ID.chorus_flower);
      if (tall > 3) { const sx = x + (r() < 0.5 ? 1 : -1); set(sx, top + tall - 1, z, ID.chorus_plant); set(sx, top + tall, z, ID.chorus_flower); }
    }
    for (let gx = Math.floor(cx / 20) - 1; gx <= Math.floor(cx / 20) + 1; gx++) for (let gz = Math.floor(cz / 20) - 1; gz <= Math.floor(cz / 20) + 1; gz++) {
      const city = this.endCityAt(gx, gz);
      if (city && Math.abs(city.x - (cx * 16 + 8)) < 48 && Math.abs(city.z - (cz * 16 + 8)) < 48) this.buildEndCity(city, cx, cz, set, c);
    }
  }
  endCityAt(gx, gz) {
    this.cityCache = this.cityCache || new Map();
    const key = gx + ',' + gz;
    if (!this.cityCache.has(key)) {
      const r = mulberry32(hash3(gx, gz, this.seed + 616));
      let city = null;
      for (let t = 0; t < 10 && !city; t++) {
        const x = (gx * 20 + 2 + (r() * 16 | 0)) * 16 + 8, z = (gz * 20 + 2 + (r() * 16 | 0)) * 16 + 8;
        if (Math.hypot(x, z) < 700) continue;
        const top = this.endTop(x, z);
        if (top > 0 && this.endTop(x + 6, z) > 0 && this.endTop(x - 6, z) > 0 && this.endTop(x, z + 6) > 0 && this.endTop(x, z - 6) > 0) city = { x, z, y: top + 1, ship: r() < 0.75 };
      }
      this.cityCache.set(key, city);
    }
    return this.cityCache.get(key);
  }
  buildEndCity(city, cx, cz, set, c) {
    const put = (x, y, z, id) => set(x - cx * 16, y, z - cz * 16, id);
    const { x: ox, y: oy, z: oz } = city, PB = ID.purpur_block, PP = ID.purpur_pillar;
    const room = (x0, y0, z0, w, h, chests) => {
      for (let a = -w; a <= w; a++) for (let b = -w; b <= w; b++) for (let k = 0; k <= h; k++) {
        const edge = Math.abs(a) === w || Math.abs(b) === w, corner = Math.abs(a) === w && Math.abs(b) === w;
        put(x0 + a, y0 + k, z0 + b, k === 0 || k === h ? PB : corner ? PP : edge ? (k === 2 && (a === 0 || b === 0) ? ID.end_rod : PB) : 0);
      }
    };
    // the tower: three rooms up a purpur stalk, with a ladder up the middle
    room(ox, oy, oz, 4, 5);
    for (let k = 1; k <= 3; k++) { put(ox, oy + k, oz - 4, 0); } // a doorway
    for (let y = oy + 5; y < oy + 16; y++) for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) put(ox + a, y, oz + b, Math.abs(a) === 2 || Math.abs(b) === 2 ? (Math.abs(a) === 2 && Math.abs(b) === 2 ? PP : PB) : 0);
    room(ox, oy + 16, oz, 5, 6);
    room(ox, oy + 22, oz, 3, 5);
    for (let y = oy + 1; y < oy + 27; y++) { put(ox, y, oz + 2, PP); put(ox, y, oz + 1, ID['ladder_s']); }
    put(ox, oy + 16, oz + 1, ID['ladder_s']); put(ox, oy + 22, oz + 1, ID['ladder_s']); put(ox, oy + 5, oz + 1, ID['ladder_s']);
    put(ox - 3, oy + 17, oz - 3, ID.chest_loot); put(ox + 3, oy + 17, oz + 3, ID.chest_loot); put(ox - 2, oy + 23, oz - 2, ID.chest_loot);
    c.endCity = c.endCity || [];
    for (const [sx, sy, sz] of [[ox + 4, oy + 18, oz], [ox - 4, oy + 18, oz], [ox, oy + 24, oz + 2], [ox + 3, oy + 2, oz + 3]]) if (Math.floor(sx / 16) === cx && Math.floor(sz / 16) === cz) c.endCity.push([sx, sy, sz]);
    // the end ship floats beside the tower: inside its cabin, an elytra in an item frame
    if (!city.ship) return;
    const sx0 = ox + 14, sy = oy + 18, sz0 = oz;
    for (let a = 0; a <= 20; a++) {
      const w = a < 3 || a > 17 ? 1 : 2;
      for (let b = -w; b <= w; b++) { put(sx0 + a, sy, sz0 + b, PB); if (Math.abs(b) === w) put(sx0 + a, sy + 1, sz0 + b, PB); }
      if (a === 0 || a === 20) for (let b = -w; b <= w; b++) put(sx0 + a, sy + 1, sz0 + b, PB);
    }
    for (let k = 1; k <= 8; k++) put(sx0 + 9, sy + k, sz0, ID.obsidian);
    for (let a = 13; a <= 17; a++) for (let b = -2; b <= 2; b++) for (let k = 1; k <= 4; k++) put(sx0 + a, sy + k, sz0 + b, k === 4 || Math.abs(b) === 2 || a === 13 || a === 17 ? PB : 0);
    put(sx0 + 13, sy + 1, sz0, 0); put(sx0 + 13, sy + 2, sz0, 0);
    put(sx0 + 16, sy + 1, sz0 - 1, ID.chest_loot); put(sx0 + 16, sy + 1, sz0 + 1, ID.chest_loot);
    const fx = sx0 + 16, fy = sy + 2, fz = sz0;
    put(fx + 1, fy, fz, PB); put(fx, fy, fz, ID.item_frame_e);
    if (Math.floor(fx / 16) === cx && Math.floor(fz / 16) === cz) (c.frameItems = c.frameItems || []).push([fx, fy, fz, 'elytra']);
    if (Math.floor((sx0 + 10) / 16) === cx && Math.floor(sz0 / 16) === cz) c.endCity = (c.endCity || []).concat([[sx0 + 10, sy + 1, sz0 + 1]]);
  }

  generateNether(cx, cz) {
    const c = new Chunk(cx, cz);
    const d = c.data;
    const rng = mulberry32(hash3(cx, cz, this.seed));
    const heights = new Int16Array(256), roofs = new Int16Array(256);
    const set = (x, y, z, id) => { if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < GEN_H - 1) d[x + (z << 4) + (y << 8)] = id; };
    const get = (x, y, z) => (x >= 0 && x < 16 && z >= 0 && z < 16 && y >= 0 && y < WH) ? d[x + (z << 4) + (y << 8)] : -1;
    const LAVA_Y = 31;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = cx * 16 + x, wz = cz * 16 + z;
      const floor = Math.floor(31 + this.noise.fbm2(wx / 55, wz / 55, 3) * 30);
      const roof = Math.floor(80 + this.noiseB.fbm2(wx / 38, wz / 38, 3) * 16);
      heights[x + z * 16] = floor; roofs[x + z * 16] = roof;
      const soul = this.noiseC.noise2(wx / 18, wz / 18) > 0.22;
      for (let y = 0; y < GEN_H; y++) {
        let id = 0;
        if (y === 0 || y === GEN_H - 1) id = ID.bedrock;
        else if ((y <= 3 || y >= GEN_H - 4) && rng() < 0.45) id = ID.bedrock;
        else if (y <= floor) id = (soul && y >= floor - 2 && floor > LAVA_Y) ? ID.soul_sand : ID.netherrack;
        else if (y >= roof) id = ID.netherrack;
        else {
          if (y > floor + 3 && y < roof - 3 && this.noiseC.noise3(wx / 26, y / 16, wz / 26) > 0.36) id = ID.netherrack;
          if (!id && y <= LAVA_Y) id = ID.lava;
        }
        d[x + (z << 4) + (y << 8)] = id;
      }
      if (floor >= LAVA_Y - 1 && floor <= LAVA_Y + 1 && this.noiseB.noise2(wx / 12, wz / 12) > 0.2) d[x + (z << 4) + (floor << 8)] = ID.gravel;
    }
    const ORE = [[ID.nether_quartz_ore, 16, 8, 88, 8], [ID.nether_gold_ore, 10, 8, 88, 6], [ID.magma, 4, 26, 34, 8]];
    for (const [ore, count, y0, y1, size] of ORE) {
      for (let v = 0; v < count; v++) {
        let x = rng() * 16, y = y0 + rng() * (y1 - y0), z = rng() * 16;
        for (let s = 0; s < size; s++) {
          const xi = x | 0, yi = y | 0, zi = z | 0;
          if (get(xi, yi, zi) === ID.netherrack) set(xi, yi, zi, ore);
          x += rng() * 2 - 1; y += rng() * 2 - 1; z += rng() * 2 - 1;
        }
      }
    }
    // glowstone hanging from the roof
    for (let g = 0; g < 2; g++) {
      if (rng() < 0.35) continue;
      const x0 = 2 + (rng() * 12 | 0), z0 = 2 + (rng() * 12 | 0);
      let x = x0, y = roofs[x0 + z0 * 16] - 1, z = z0;
      for (let s = 0; s < 40; s++) {
        if (get(x, y, z) === 0) set(x, y, z, ID.glowstone);
        x = clamp(x + (rng() * 3 | 0) - 1, 0, 15); z = clamp(z + (rng() * 3 | 0) - 1, 0, 15);
        y -= rng() < 0.4 ? 1 : 0;
        if (rng() < 0.15) { x = x0; z = z0; y = roofs[x0 + z0 * 16] - 1; }
      }
    }
    // ---- newer Nether things (their own random numbers, so the older parts of the Nether stay the same) ----
    const r2 = mulberry32(hash3(cx, cz, this.seed + 4441));
    // ancient debris: rare, deep down, hidden inside netherrack
    for (let v = 0; v < 2; v++) {
      if (r2() < 0.45) continue;
      const x = r2() * 16 | 0, y = 8 + (r2() * 15 | 0), z = r2() * 16 | 0, n = 1 + (r2() * 2 | 0);
      for (let s = 0; s < n; s++) if (get(x + s, y, z) === ID.netherrack) set(x + s, y, z, ID.ancient_debris);
    }
    // more of it (it was too hard to find): its own random numbers, so nothing else in the Nether moves
    { const r4 = mulberry32(hash3(cx, cz, this.seed + 6113));
      const put = (x, y, z) => { if (get(x, y, z) === ID.netherrack) set(x, y, z, ID.ancient_debris); };
      for (let v = 0; v < 3; v++) {
        if (r4() < 0.3) continue;
        const x = 1 + (r4() * 14 | 0), y = 8 + (r4() * 15 | 0), z = 1 + (r4() * 14 | 0);
        put(x, y, z); if (r4() < 0.5) put(x + (r4() < 0.5 ? 1 : 0), y + (r4() < 0.3 ? 1 : 0), z + (r4() < 0.5 ? 1 : 0));
      }
      if (r4() < 0.5) put(r4() * 16 | 0, 23 + (r4() * 70 | 0), r4() * 16 | 0); // now and then higher up too
    }
    // blobs of blackstone
    for (let v = 0; v < 2; v++) {
      let x = r2() * 16, y = 10 + r2() * 60, z = r2() * 16;
      for (let s = 0; s < 18; s++) { const xi = x | 0, yi = y | 0, zi = z | 0; if (get(xi, yi, zi) === ID.netherrack) set(xi, yi, zi, ID.blackstone); x += r2() * 2 - 1; y += r2() * 2 - 1; z += r2() * 2 - 1; }
    }
    // areas: crimson forests (red), warped forests (blue-green) and basalt deltas (grey), on land above the lava
    const areaOf = (wx, wz) => { const v = this.noiseB.noise2(wx / 140 + 31.7, wz / 140 - 12.3); return v > 0.28 ? 'crimson' : v < -0.28 ? 'warped' : Math.abs(this.noiseC.noise2(wx / 70 + 5.1, wz / 70 + 9.4)) < 0.07 ? 'basalt' : null; };
    const trees = [];
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = cx * 16 + x, wz = cz * 16 + z, area = areaOf(wx, wz), fl = heights[x + z * 16];
      if (!area || fl <= LAVA_Y || get(x, fl, z) !== ID.netherrack || get(x, fl + 1, z) !== 0) continue;
      if (area === 'basalt') {
        set(x, fl, z, r2() < 0.3 ? ID.blackstone : ID.basalt);
        if (r2() < 0.05) { const h = 2 + (r2() * 5 | 0); for (let y = fl + 1; y <= fl + h && get(x, y, z) === 0; y++) set(x, y, z, ID.basalt); }
        continue;
      }
      const crimson = area === 'crimson';
      set(x, fl, z, crimson ? ID.crimson_nylium : ID.warped_nylium);
      const r = r2();
      if (r < 0.14) set(x, fl + 1, z, crimson ? ID.crimson_roots : ID.warped_roots);
      else if (r < 0.165 && x >= 2 && x <= 13 && z >= 2 && z <= 13) trees.push([x, fl, z, crimson]);
    }
    // huge fungus trees: a tall stem with a big cap and glowing shroomlights
    for (const [x, fl, z, crimson] of trees) {
      const h = 5 + (r2() * 5 | 0), top = fl + h;
      if (top + 2 >= roofs[x + z * 16]) continue;
      const stem = crimson ? ID.crimson_stem : ID.warped_stem, wart = crimson ? ID.nether_wart_block : ID.warped_wart_block;
      for (let y = fl + 1; y <= top; y++) set(x, y, z, stem);
      for (let dy = -2; dy <= 1; dy++) {
        const rad = dy === 1 ? 1 : 2;
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          if (dy < 0 && Math.abs(dx) < 2 && Math.abs(dz) < 2) continue; // hollow underneath
          const X = x + dx, Y = top + dy, Z = z + dz;
          if (get(X, Y, Z) !== 0) continue;
          set(X, Y, Z, r2() < 0.08 ? ID.shroomlight : wart);
        }
      }
      set(x, top + 1, z, wart);
    }

    // nether fortress bridges running east-west and north-south
    const BY = 52;
    const bridgeZ = ((cz % 6) + 6) % 6 === 0, bridgeX = ((cx % 6) + 6) % 6 === 0;
    const bridge = (alongX) => {
      for (let a = 0; a < 16; a++) {
        for (let w = 6; w <= 9; w++) {
          const x = alongX ? a : w, z = alongX ? w : a;
          set(x, BY, z, ID.nether_bricks);
          for (let y = BY + 1; y <= BY + 4; y++) set(x, y, z, (w === 6 || w === 9) && y === BY + 1 ? ID.nether_bricks : 0);
        }
        if (a % 8 === 3) for (let y = BY - 1; y > 1; y--) {
          for (let w = 7; w <= 8; w++) {
            const x = alongX ? a : w, z = alongX ? w : a;
            const cur = get(x, y, z);
            if (cur === ID.netherrack || cur === ID.soul_sand) { y = 0; break; }
            set(x, y, z, ID.nether_bricks);
          }
        }
      }
    };
    if (bridgeZ) bridge(true);
    if (bridgeX) bridge(false);
    if (bridgeZ && bridgeX) for (let x = 5; x <= 10; x++) for (let z = 5; z <= 10; z++) { set(x, BY, z, ID.nether_bricks); for (let y = BY + 1; y <= BY + 4; y++) set(x, y, z, 0); }
    if (!this.legacy) this.netherStructures(cx, cz, c, set);

    const m = this.edits.get(this.key(cx, cz));
    if (m) for (const [i, id] of m) d[i] = id;
    c.heights = heights;
    this.chunks.set(this.key(cx, cz), c);
    return c;
  }

  oakTree(set, get, x, y, z, rng, log, leaves, minH) {
    const h = minH + (rng() * 3 | 0);
    for (let dy = h - 3; dy <= h; dy++) {
      const r = dy >= h - 1 ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && (dy === h || rng() < 0.5)) continue;
        if (get(x + dx, y + dy, z + dz) === 0) set(x + dx, y + dy, z + dz, leaves);
      }
    }
    if (get(x, y + h + 1, z) === 0) set(x, y + h + 1, z, leaves);
    for (let dy = 0; dy <= h; dy++) set(x, y + dy, z, log);
  }

  /* a tall jungle tree with a wide, flat crown */
  jungleTree(set, get, x, y, z, rng) {
    const h = 8 + (rng() * 6 | 0);
    for (let dy = h - 2; dy <= h + 1; dy++) {
      const r = dy >= h ? 2 : 3;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r + 1) continue;
        if (get(x + dx, y + dy, z + dz) === 0) set(x + dx, y + dy, z + dz, ID.jungle_leaves);
      }
    }
    for (let dy = 0; dy <= h; dy++) set(x, y + dy, z, ID.jungle_log);
  }
  /* a dark oak: a thick trunk (2 x 2) and a wide, low, dark crown that keeps the forest floor shady */
  darkOakTree(set, get, x, y, z, rng, log = ID.dark_oak_log, leaves = ID.dark_oak_leaves) {
    const h = 6 + (rng() * 3 | 0);
    for (let dy = h - 2; dy <= h + 1; dy++) {
      const r = dy === h + 1 ? 2 : 3;
      for (let dx = -r; dx <= r + 1; dx++) for (let dz = -r; dz <= r + 1; dz++) {
        const ex = dx < 0 ? -dx : dx - 1, ez = dz < 0 ? -dz : dz - 1;
        if (ex * ex + ez * ez > r * r + 1) continue;
        if (get(x + dx, y + dy, z + dz) === 0) set(x + dx, y + dy, z + dz, leaves);
      }
    }
    for (let dy = 0; dy <= h; dy++) for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + ox, y + dy, z + oz, log);
    for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (get(x + ox, y - 1, z + oz) === ID.grass) set(x + ox, y - 1, z + oz, ID.dirt);
  }

  /* an acacia: the trunk leans to one side, then opens into a wide, flat crown (sometimes a second, smaller one) */
  acaciaTree(set, get, x, y, z, rng) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]], [ddx, ddz] = dirs[rng() * 4 | 0];
    const h = 5 + (rng() * 3 | 0), bend = h - 1 - (rng() * 2 | 0);
    let tx = x, tz = z, ty = y;
    for (let dy = 0; dy < h; dy++) {
      if (dy >= bend) { tx += ddx; tz += ddz; }
      ty = y + dy; set(tx, ty, tz, ID.acacia_log);
    }
    const crown = (cx, cy, cz, r) => {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
        if (get(cx + dx, cy, cz + dz) === 0) set(cx + dx, cy, cz + dz, ID.acacia_leaves);
      }
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (get(cx + dx, cy + 1, cz + dz) === 0) set(cx + dx, cy + 1, cz + dz, ID.acacia_leaves);
    };
    crown(tx, ty + 1, tz, 3);
    if (rng() < 0.5) { // a second branch the other way
      const bx = x - ddx, bz = z - ddz, by = y + bend - 1;
      set(bx, by, bz, ID.acacia_log); set(bx - ddx, by + 1, bz - ddz, ID.acacia_log);
      crown(bx - ddx, by + 2, bz - ddz, 2);
    }
  }

  /* a mangrove: the trunk stands up on arching roots, with a round crown of leaves on top */
  mangroveTree(set, get, x, y, z, rng) {
    const free = (a, b, c) => { const id = get(a, b, c); return id === 0 || id === ID.water || id === ID.tall_grass; };
    const lift = 2 + (rng() * 2 | 0), h = 5 + (rng() * 3 | 0);
    for (let dy = 0; dy < lift; dy++) if (free(x, y + dy, z)) set(x, y + dy, z, ID.mangrove_roots);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      if (rng() < 0.25) continue;
      const far = Math.abs(dx) + Math.abs(dz) > 1 ? 1 : 2;
      for (let s = 1; s <= far; s++) {
        const ry = y + lift - 1 - s;
        for (let yy = ry; yy >= y - 1; yy--) { if (!free(x + dx * s, yy, z + dz * s)) break; set(x + dx * s, yy, z + dz * s, ID.mangrove_roots); }
      }
      if (free(x + dx, y + lift - 1, z + dz)) set(x + dx, y + lift - 1, z + dz, ID.mangrove_roots);
    }
    const top = y + lift + h;
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy >= 0 ? 2 : 3;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r + 1) continue;
        if (get(x + dx, top + dy, z + dz) === 0) set(x + dx, top + dy, z + dz, ID.mangrove_leaves);
      }
    }
    for (let i = 0; i < 6; i++) { // a few leaves hanging down
      const dx = (rng() * 7 | 0) - 3, dz = (rng() * 7 | 0) - 3, n = 1 + (rng() * 2 | 0);
      for (let k = 1; k <= n; k++) if (get(x + dx, top - 2 - k, z + dz) === 0) set(x + dx, top - 2 - k, z + dz, ID.mangrove_leaves);
    }
    for (let dy = lift; dy <= lift + h; dy++) set(x, y + dy, z, ID.mangrove_log);
  }

  /* a cherry tree: a short trunk that splits into branches, each with a puffy pink crown */
  cherryTree(set, get, x, y, z, rng) {
    const h = 3 + (rng() * 2 | 0);
    for (let dy = 0; dy < h; dy++) set(x, y + dy, z, ID.cherry_log);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const a = rng() * 4 | 0, ends = [[x, y + h + 1, z]];
    for (const [dx, dz] of [dirs[a], dirs[a ^ 1]]) {
      let bx = x, by = y + h - 1, bz = z;
      const len = 2 + (rng() * 2 | 0);
      for (let s = 0; s < len; s++) { bx += dx; bz += dz; if (s > 0) by++; set(bx, by, bz, ID.cherry_log); }
      set(bx, by + 1, bz, ID.cherry_log);
      ends.push([bx, by + 2, bz]);
    }
    set(x, y + h, z, ID.cherry_log);
    for (const [cx, cy, cz] of ends) {
      for (let dy = -1; dy <= 1; dy++) {
        const r = dy === 1 ? 2 : 3;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r - (dy === -1 ? 2 : 0)) continue;
          if (get(cx + dx, cy + dy, cz + dz) === 0) set(cx + dx, cy + dy, cz + dz, ID.cherry_leaves);
        }
      }
    }
  }

  /* a low jungle bush: one log with leaves around it */
  jungleBush(set, get, x, y, z, rng) {
    for (let dy = 0; dy <= 1; dy++) for (let dx = -2 + dy; dx <= 2 - dy; dx++) for (let dz = -2 + dy; dz <= 2 - dy; dz++) if (get(x + dx, y + dy, z + dz) === 0 && rng() < 0.85) set(x + dx, y + dy, z + dz, ID.jungle_leaves);
    set(x, y, z, ID.jungle_log);
  }

  spruceTree(set, get, x, y, z, rng) {
    const h = 6 + (rng() * 3 | 0);
    let r = 0;
    for (let dy = h + 1; dy >= 2; dy--) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (r > 0 && Math.abs(dx) === r && Math.abs(dz) === r) continue;
        if (get(x + dx, y + dy, z + dz) === 0) set(x + dx, y + dy, z + dz, ID.spruce_leaves);
      }
      r = r >= 2 ? 1 : r + 1;
      if (dy === h + 1) r = 1;
    }
    for (let dy = 0; dy <= h; dy++) set(x, y + dy, z, ID.spruce_log);
  }

  pyramid(set, get, heights, rng, hidden) {
    let base = 999;
    for (let z = 3; z <= 13; z++) for (let x = 3; x <= 13; x++) base = Math.min(base, heights[x + z * 16]);
    if (base <= SEA || base + 8 >= GEN_H) return;
    for (let z = 2; z <= 14; z++) for (let x = 2; x <= 14; x++) {
      for (let y = base - 3; y <= base; y++) set(x, y, z, ID.sandstone);
      for (let y = base + 1; y < base + 9; y++) if (x > 2 && x < 14 && z > 2 && z < 14) set(x, y, z, 0);
    }
    for (let k = 0; k < 6; k++) {
      const a = 2 + k, b = 14 - k, y = base + 1 + k;
      for (let z = a; z <= b; z++) for (let x = a; x <= b; x++) {
        const edge = x === a || x === b || z === a || z === b;
        set(x, y, z, edge || k === 5 ? (k === 5 ? ID.gold_block : (k === 2 && (x + z) % 3 === 0 ? ID.terracotta : ID.sandstone)) : 0);
      }
    }
    for (let y = base + 1; y <= base + 2; y++) { set(8, y, 2, 0); set(8, y, 3, 0); }
    for (let z = 6; z <= 10; z++) for (let x = 6; x <= 10; x++) set(x, base, z, (x + z) % 2 ? ID.gold_block : ID.wool_orange);
    if (hidden) return this.pyramidVault(set, base);
    set(8, base, 8, ID.diamond_block);
    set(4, base + 1, 8, ID.chest_loot); set(12, base + 1, 8, ID.chest_loot);
    set(7, base + 1, 7, ID.gold_block); set(9, base + 1, 9, ID.gold_block);
    for (const [x, z] of [[7, 8], [9, 8], [8, 7], [8, 9]]) set(x, base - 2, z, ID.tnt);
  }

  /* like Minecraft: under the blue block in the middle of the floor, a shaft drops into a hidden room.
     A chest waits in each wall, and a stone pressure plate sits in the middle with 9 TNT hidden under the
     floor. Step on the plate and it all blows up. Dig down carefully, or break the plate first! */
  pyramidVault(set, base) {
    const fy = Math.max(6, base - 12); // the hidden room's floor
    for (let z = 5; z <= 11; z++) for (let x = 5; x <= 11; x++) for (let y = fy - 3; y <= fy + 4; y++) set(x, y, z, ID.sandstone);
    for (let z = 6; z <= 10; z++) for (let x = 6; x <= 10; x++) for (let y = fy + 1; y <= fy + 3; y++) set(x, y, z, 0);
    for (let z = 6; z <= 10; z++) for (let x = 6; x <= 10; x++) set(x, fy, z, (x === 8 || z === 8) ? ID.terracotta : ID.sandstone);
    for (let y = fy + 4; y < base; y++) set(8, y, 8, 0); // the shaft down
    set(8, base, 8, ID.wool_blue); // the blue block over the shaft
    for (const [x, z] of [[8, 5], [8, 11], [5, 8], [11, 8]]) { set(x, fy + 1, z, ID.chest_loot); set(x, fy + 2, z, 0); }
    set(8, fy + 1, 8, ID.stone_plate_0);
    for (let z = 7; z <= 9; z++) for (let x = 7; x <= 9; x++) set(x, fy - 1, z, ID.tnt);
  }

  /* ---------- streaming ---------- */
  update(px, pz, budgetMs) {
    for (const c of this.urgent) this.buildMesh(c);
    this.urgent.clear();
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4, R = this.renderDist;
    if (pcx !== this.lastCx || pcz !== this.lastCz || this.queue.length === 0) {
      this.lastCx = pcx; this.lastCz = pcz;
      this.queue = [];
      const G = R + 1;
      for (let dz = -G; dz <= G; dz++) for (let dx = -G; dx <= G; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 <= (G + 0.5) * (G + 0.5)) this.queue.push([pcx + dx, pcz + dz, d2]);
      }
      this.queue.sort((a, b) => a[2] - b[2]);
      const maxD = (R + 3) * (R + 3);
      for (const [k, c] of this.chunks) {
        const dx = c.cx - pcx, dz = c.cz - pcz;
        if (dx * dx + dz * dz > maxD) {
          for (const m of c.meshes) { this.group.remove(m); m.geometry.dispose(); }
          this.chunks.delete(k);
        }
      }
    }
    const t0 = performance.now();
    const meshR2 = (R + 0.5) * (R + 0.5);
    for (const [cx, cz, d2] of this.queue) {
      if (performance.now() - t0 > budgetMs) break;
      let c = this.chunks.get(this.key(cx, cz));
      if (!c) { this.generate(cx, cz); continue; }
      if (c.dirty && d2 <= meshR2 && this.neighborsReady(cx, cz)) this.buildMesh(c);
    }
  }

  neighborsReady(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
      if (!this.chunks.has(this.key(cx + dx, cz + dz))) return false;
    return true;
  }

  pendingNear(px, pz, r) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const c = this.chunks.get(this.key(pcx + dx, pcz + dz));
      if (!c || c.dirty) return true;
    }
    return false;
  }

  /* ---------- meshing ---------- */
  buildMesh(c) {
    c.dirty = false;
    const cx = c.cx, cz = c.cz;
    const nb = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.chunks.get(this.key(cx + dx, cz + dz));
      nb.push(n ? n.data : null);
    }
    const get = (x, y, z) => {
      if (y < 0) return ID.bedrock;
      if (y >= WH) return 0;
      let ix = 1, iz = 1;
      if (x < 0) { ix = 0; x += 16; } else if (x > 15) { ix = 2; x -= 16; }
      if (z < 0) { iz = 0; z += 16; } else if (z > 15) { iz = 2; z -= 16; }
      const dd = nb[iz * 3 + ix];
      return dd ? dd[x + (z << 4) + (y << 8)] : 0;
    };
    const opq = (x, y, z) => { const id = get(x, y, z); return id && DEFS[id].opaque ? 1 : 0; };
    const O = { pos: [], uv: [], col: [], idx: [] }, T = { pos: [], uv: [], col: [], idx: [] };
    // lights nearby (this chunk and the ones around it), in this chunk's coordinates
    const lights = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.chunks.get(this.key(cx + dx, cz + dz));
      if (!n) continue;
      for (const L of this.emitters(n)) lights.push([L[0] + dx * 16 + 0.5, L[1] + 0.5, L[2] + dz * 16 + 0.5, L[3]]);
    }
    const data = c.data;
    // only look as high as something is built (most chunks are empty above the land)
    const top = this.chunkTop(c);
    for (let y = 0; y <= top; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const id = data[x + (z << 4) + (y << 8)];
      if (!id) continue;
      const def = DEFS[id];
      if (def.cross) { this.addCross(O, x, y, z, def); continue; }
      if (def.box) { this.addBox(O, x, y, z, def); continue; }
      if (def.boxes || def.fence || def.pane) { for (const bx of this.shapeBoxes(def, (a, b, c) => get(a, b, c), x, y, z, true)) this.addBox(def.translucent ? T : O, x, y, z, { box: bx, faces: def.faces }); continue; }
      const out = def.translucent ? T : O;
      const above = def.liquid ? get(x, y + 1, z) : 0;
      const topH = def.height ? def.height : def.liquid && above !== id && !(id === ID.water && above && DEFS[above].wlog) ? 0.875 : 1;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const nid = get(x + F.n[0], y + F.n[1], z + F.n[2]);
        if (nid) {
          const nd = DEFS[nid];
          if (nd.opaque) continue;
          if (nid === id && !def.leaves) continue;
          if (def.liquid && id === ID.water && nd.wlog) continue; // water next to kelp or seagrass: still one body of water
          if (def.liquid && nd.solid && !nd.cutout && f !== 2) continue;
        }
        const uv = TILE_UV[def.faces[f]];
        const base = out.pos.length / 3;
        const ao = [0, 0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const cc = F.c[k];
          out.pos.push(x + cc[0], y + (cc[1] ? topH : 0), z + cc[2]);
          const fu = FACE_UV[k];
          // on short blocks the sides show only the bottom part of the picture, so it is not squashed
          const vTop = topH < 1 && f !== 2 && f !== 3 ? uv[1] + (uv[3] - uv[1]) * topH : uv[3];
          out.uv.push(fu[0] ? uv[2] : uv[0], fu[1] ? vTop : uv[1]);
          let a = 3;
          if (!def.light) {
            const [o1, o2, o3] = F.ao[k];
            const s1 = opq(x + o1[0], y + o1[1], z + o1[2]), s2 = opq(x + o2[0], y + o2[1], z + o2[2]);
            const s3 = opq(x + o3[0], y + o3[1], z + o3[2]);
            a = s1 && s2 ? 0 : 3 - (s1 + s2 + s3);
          }
          ao[k] = a;
          const br = def.light ? 1.25 : F.shade * AO_CURVE[a];
          out.col.push(br, br, br);
        }
        if (ao[0] + ao[2] < ao[1] + ao[3]) out.idx.push(base + 1, base + 2, base + 3, base + 3, base, base + 1);
        else out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    for (const m of c.meshes) { this.group.remove(m); m.geometry.dispose(); }
    c.meshes = [];
    if (O.idx.length) c.meshes.push(this.makeMesh(O, this.mats.opaque, cx, cz, lights));
    if (T.idx.length) { const m = this.makeMesh(T, this.mats.trans, cx, cz, lights); m.renderOrder = 1; c.meshes.push(m); }
    for (const m of c.meshes) this.group.add(m);
  }

  /* the boxes that make up a stair or fence block (fences join up with fences and solid blocks beside them) */
  shapeBoxes(def, get, x, y, z, forDrawing) {
    if (def.boxes) return !forDrawing && def.cboxes ? def.cboxes : def.boxes;
    if (def.pane) {
      // a glass pane: a thin middle post, with arms reaching out to panes, glass and walls beside it
      const link = (dx, dz) => { const n = get(x + dx, y, z + dz); return n && (DEFS[n].pane || DEFS[n].glassy || (DEFS[n].opaque && DEFS[n].solid)); };
      const a = 0.4375, b = 0.5625, out = [[a, 0, a, b, 1, b]];
      if (link(1, 0)) out.push([b, 0, a, 1, 1, b]);
      if (link(-1, 0)) out.push([0, 0, a, a, 1, b]);
      if (link(0, 1)) out.push([a, 0, b, b, 1, 1]);
      if (link(0, -1)) out.push([a, 0, 0, b, 1, a]);
      return out;
    }
    const joins = (dx, dz) => { const n = get(x + dx, y, z + dz); return n && (DEFS[n].fence || DEFS[n].gate || (DEFS[n].opaque && DEFS[n].solid)); };
    if (def.wall) {
      const wt = forDrawing ? 1 : 1.5, wo = [[0.25, 0, 0.25, 0.75, wt, 0.75]], h = forDrawing ? 0.8125 : 1.5;
      if (joins(1, 0)) wo.push([0.75, 0, 0.3125, 1, h, 0.6875]);
      if (joins(-1, 0)) wo.push([0, 0, 0.3125, 0.25, h, 0.6875]);
      if (joins(0, 1)) wo.push([0.3125, 0, 0.75, 0.6875, h, 1]);
      if (joins(0, -1)) wo.push([0.3125, 0, 0, 0.6875, h, 0.25]);
      return wo;
    }
    const top = forDrawing ? 1 : 1.5, out = [[0.375, 0, 0.375, 0.625, top, 0.625]];
    const rails = forDrawing ? [[0.375, 0.5625], [0.75, 0.9375]] : [[0, top]];
    for (const [y0, y1] of rails) {
      if (joins(1, 0)) out.push([0.625, y0, 0.4375, 1, y1, 0.5625]);
      if (joins(-1, 0)) out.push([0, y0, 0.4375, 0.375, y1, 0.5625]);
      if (joins(0, 1)) out.push([0.4375, y0, 0.625, 0.5625, y1, 1]);
      if (joins(0, -1)) out.push([0.4375, y0, 0, 0.5625, y1, 0.375]);
    }
    return out;
  }

  /* a thin block like a door or trapdoor: one box inside the block, picture cropped to fit */
  addBox(out, x, y, z, def) {
    const [x0, y0, z0, x1, y1, z1] = def.box, lo = [x0, y0, z0], hi = [x1, y1, z1];
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], uv = TILE_UV[def.faces[f]], base = out.pos.length / 3;
      const axes = [0, 1, 2].filter(a => F.n[a] === 0), [ua, va] = f === 2 || f === 3 ? [0, 2] : [axes[0] === 1 ? axes[1] : axes[0], 1];
      for (let k = 0; k < 4; k++) {
        const cc = F.c[k], p = [0, 1, 2].map(a => (cc[a] ? hi[a] : lo[a]));
        out.pos.push(x + p[0], y + p[1], z + p[2]);
        const fu = FACE_UV[k];
        const su = fu[0] ? (cc[ua] ? hi[ua] : lo[ua]) : (cc[ua] ? hi[ua] : lo[ua]);
        const u = uv[0] + (uv[2] - uv[0]) * clamp(su, 0, 1), v = uv[1] + (uv[3] - uv[1]) * clamp(p[va], 0, 1);
        out.uv.push(u, v);
        const br = F.shade;
        out.col.push(br, br, br);
      }
      out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  addCross(out, x, y, z, def) {
    const uv = TILE_UV[def.faces[0]];
    const quads = [
      [[0.15, 0.15], [0.85, 0.85]],
      [[0.15, 0.85], [0.85, 0.15]],
    ];
    for (const [[ax, az], [bx, bz]] of quads) {
      const base = out.pos.length / 3;
      out.pos.push(x + ax, y, z + az, x + bx, y, z + bz, x + bx, y + 1, z + bz, x + ax, y + 1, z + az);
      out.uv.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
      for (let k = 0; k < 4; k++) out.col.push(0.92, 0.92, 0.92);
      out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }

  /* the torches, lanterns and glowstone in a chunk: [x, y, z, reach] (worked out once, again when one changes) */
  emitters(c) {
    if (c.emit) return c.emit;
    const out = [], d = c.data;
    for (let i = 0; i < d.length; i++) { const id = d[i]; if (id && DEFS[id].emit) out.push([i & 15, i >> 8, (i >> 4) & 15, DEFS[id].emit]); if (out.length > 200) break; }
    c.emit = out;
    return out;
  }

  makeMesh(A, mat, cx, cz, lights) {
    const g = new THREE.BufferGeometry();
    // how much light from nearby torches each corner gets (0 = none, 1 = right next to one)
    const n = A.pos.length / 3, glow = new Float32Array(n);
    if (lights && lights.length) for (let v = 0; v < n; v++) {
      const px = A.pos[v * 3], py = A.pos[v * 3 + 1], pz = A.pos[v * 3 + 2];
      let best = 0;
      for (const L of lights) {
        const dx = px - L[0], dy = py - L[1], dz = pz - L[2];
        if (Math.abs(dx) > L[3] || Math.abs(dy) > L[3] || Math.abs(dz) > L[3]) continue;
        const k = 1 - (Math.abs(dx) + Math.abs(dy) + Math.abs(dz)) / L[3]; // fades block by block, like real torch light
        if (k > best) best = k;
      }
      glow[v] = best > 0 ? Math.min(1, best * best * 1.25) : 0; // bright close by, fading quickly further away
    }
    g.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
    g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(A.col, 3));
    g.setIndex(A.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.position.set(cx * 16, 0, cz * 16);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    return m;
  }

  /* ---------- queries ---------- */
  raycast(ox, oy, oz, dx, dy, dz, maxD, hitLiquid) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx > 0 ? (x + 1 - ox) * tdx : (ox - x) * tdx;
    let tmy = dy > 0 ? (y + 1 - oy) * tdy : (oy - y) * tdy;
    let tmz = dz > 0 ? (z + 1 - oz) * tdz : (oz - z) * tdz;
    if (dx === 0) tmx = Infinity; if (dy === 0) tmy = Infinity; if (dz === 0) tmz = Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 256 && t <= maxD; i++) {
      const id = this.getBlock(x, y, z);
      if (id && (hitLiquid || !DEFS[id].liquid)) return { x, y, z, nx, ny, nz, id, dist: t };
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }

  isSolid(x, y, z) { const id = this.getBlock(x, y, z); return id !== 0 && DEFS[id].solid === true; }

  collides(px, py, pz, w, h) {
    const r = w / 2, e = 1e-4;
    const x0 = Math.floor(px - r + e), x1 = Math.floor(px + r - e);
    const y0 = Math.floor(py + e), y1 = Math.floor(py + h - e);
    const z0 = Math.floor(pz - r + e), z1 = Math.floor(pz + r - e);
    // for animals and monsters, fences and gates count as a block taller, so they can't hop over
    // them even from a block that sticks up inside the pen
    const mob = this.mobMode;
    for (let y = y0 - (mob ? 2 : 1); y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!this.isSolid(x, y, z)) continue;
      const def = DEFS[this.getBlock(x, y, z)];
      if (def.boxes || def.fence || def.pane) {
        const raise = mob && (def.fence || def.gate) ? 1 : 0;
        if (y < y0 - 1 && !raise) continue;
        for (const b of this.shapeBoxes(def, (a, b2, c) => this.getBlock(a, b2, c), x, y, z, false)) {
          if (px + r - e > x + b[0] && px - r + e < x + b[3] && py + h - e > y + b[1] && py + e < y + b[4] + raise && pz + r - e > z + b[2] && pz - r + e < z + b[5]) return true;
        }
        continue;
      }
      if (y < y0) continue;
      const hgt = def.height;
      if (hgt && py + e >= y + hgt) continue; // standing on top of a short block like a bed
      return true;
    }
    return false;
  }

  /* the height to stand at when landing: the top of the tallest block under the body */
  floorTop(px, py, pz, w) {
    const r = w / 2, e = 1e-4, y = Math.floor(py + e);
    let top = -1;
    for (let z = Math.floor(pz - r + e); z <= Math.floor(pz + r - e); z++) for (let x = Math.floor(px - r + e); x <= Math.floor(px + r - e); x++) {
      for (const yy of [y, y - 1]) {
        if (!this.isSolid(x, yy, z)) continue;
        const def = DEFS[this.getBlock(x, yy, z)];
        if (def.boxes || def.fence || def.pane) {
          for (const b of this.shapeBoxes(def, (a, b2, c) => this.getBlock(a, b2, c), x, yy, z, false))
            if (px + r - e > x + b[0] && px - r + e < x + b[3] && pz + r - e > z + b[2] && pz - r + e < z + b[5] && yy + b[4] <= py + 0.36) top = Math.max(top, yy - y + b[4]); // only things you are landing on, never lift onto a fence
        } else if (yy === y) top = Math.max(top, def.height || 1);
      }
    }
    return top < 0 ? y + 1 : y + top;
  }

  touching(b, id, pad) {
    const r = b.w / 2 + pad;
    for (let y = Math.floor(b.pos.y); y <= Math.floor(b.pos.y + b.h); y++)
      for (let z = Math.floor(b.pos.z - r); z <= Math.floor(b.pos.z + r); z++)
        for (let x = Math.floor(b.pos.x - r); x <= Math.floor(b.pos.x + r); x++)
          if (this.getBlock(x, y, z) === id) return true;
    return false;
  }

  liquidAt(x, y, z) {
    const id = this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return id && DEFS[id].liquid ? id : id && DEFS[id].wlog ? ID.water : 0; // kelp, seagrass and coral sit in water
  }

  moveBody(b, dt) {
    let dx = b.vel.x * dt, dy = b.vel.y * dt, dz = b.vel.z * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.35));
    dx /= steps; dy /= steps; dz /= steps;
    const wasGround = b.onGround;
    // checked before moving, so a wall we are about to bump into doesn't count as ground
    const nearGround = wasGround || ((b.airT || 0) < 0.25 && b.vel.y <= 0.5 && this.collides(b.pos.x, b.pos.y - 0.15, b.pos.z, b.w, 0.15));
    b.onGround = false; b.hitH = false;
    const hw = b.w / 2;
    // like Minecraft: walk up anything up to about half a block high without jumping
    const stepUp = () => {
      // only from the ground (or standing just above it on a step), never in the middle of a jump
      if (!nearGround || b.vel.y > 0.5 || b.noStep || this.collides(b.pos.x, b.pos.y + 0.6, b.pos.z, b.w, b.h)) return false;
      b.pos.y += 0.6; return true;
    };
    for (let s = 0; s < steps; s++) {
      if (dy) {
        b.pos.y += dy;
        if (this.collides(b.pos.x, b.pos.y, b.pos.z, b.w, b.h)) {
          if (dy < 0) { b.pos.y = this.floorTop(b.pos.x, b.pos.y, b.pos.z, b.w); b.onGround = true; }
          else b.pos.y = Math.floor(b.pos.y + b.h) - b.h - 0.001;
          b.vel.y = 0; dy = 0;
        }
      }
      if (dx) {
        b.pos.x += dx;
        if (this.collides(b.pos.x, b.pos.y, b.pos.z, b.w, b.h) && !stepUp()) {
          const sx = dx > 0 ? Math.floor(b.pos.x + hw) - hw - 0.001 : Math.floor(b.pos.x - hw) + 1 + hw + 0.001;
          // flush against a full block; against a half-block shape just undo this small move
          b.pos.x = this.collides(sx, b.pos.y, b.pos.z, b.w, b.h) || Math.abs(sx - b.pos.x) > Math.abs(dx) + 0.01 ? b.pos.x - dx : sx;
          b.vel.x = 0; dx = 0; b.hitH = true;
        }
      }
      if (dz) {
        b.pos.z += dz;
        if (this.collides(b.pos.x, b.pos.y, b.pos.z, b.w, b.h) && !stepUp()) {
          const sz = dz > 0 ? Math.floor(b.pos.z + hw) - hw - 0.001 : Math.floor(b.pos.z - hw) + 1 + hw + 0.001;
          b.pos.z = this.collides(b.pos.x, b.pos.y, sz, b.w, b.h) || Math.abs(sz - b.pos.z) > Math.abs(dz) + 0.01 ? b.pos.z - dz : sz;
          b.vel.z = 0; dz = 0; b.hitH = true;
        }
      }
    }
    if (!b.onGround && b.vel.y <= 0 && this.collides(b.pos.x, b.pos.y - 0.02, b.pos.z, b.w, 0.02)) b.onGround = true;
    b.airT = b.onGround ? 0 : (b.airT || 0) + dt;
  }

  /* ---------- save ---------- */
  serializeEdits() {
    const out = {};
    for (const [k, m] of this.edits) if (m.size) out[k] = Array.from(m.entries()).flat();
    return out;
  }
  /* the places that keep the older underground: everywhere someone had built or dug (and around it)
     the first time this version of the game opened the world. Decided once and saved, so it never changes. */
  computeOldGen() {
    this.oldGen = new Set();
    for (const [k, m] of this.edits) {
      if (!m.size) continue;
      const [cx, cz] = k.split(',').map(Number);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.oldGen.add(this.key(cx + dx, cz + dz));
    }
  }
  loadEdits(obj) {
    this.edits = new Map();
    for (const k in obj) {
      const arr = obj[k], m = new Map();
      for (let i = 0; i < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
      this.edits.set(k, m);
    }
  }
}
