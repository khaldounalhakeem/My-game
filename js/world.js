'use strict';
/* Voxel world: chunk storage, terrain generation, meshing, raycasting and collision. */

const CS = 16, WH = 96, SEA = 32;
const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, SNOWY: 5, MOUNTAIN: 6, BIRCH: 7, TAIGA: 8, JUNGLE: 9, DARK_FOREST: 10, SAVANNA: 11, MANGROVE: 12, CHERRY: 13, BAMBOO: 14 };
const GEN_VER = 5; // which newer biomes exist (see genVerAt)
const BIOME_NAMES = ['Ocean', 'Beach', 'Plains', 'Forest', 'Desert', 'Snowy Tundra', 'Mountains', 'Birch Forest', 'Taiga', 'Jungle', 'Dark Forest', 'Savanna', 'Mangrove Swamp', 'Cherry Grove', 'Bamboo Jungle'];

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
    return clamp(Math.floor(h), 4, WH - 14);
  }

  climate(x, z) {
    const S = this.style;
    x += S.ox; z += S.oz;
    return [this.noiseB.fbm2(x / 420 + 500, z / 420, 2) + S.temp, this.noiseC.fbm2(x / 380, z / 380 + 700, 2) + S.moist];
  }

  biomeAt(x, z, h) {
    const [temp, moist] = this.climate(x, z);
    if (h < SEA) return BIOME.OCEAN;
    if (h >= SEA + 26) return BIOME.MOUNTAIN;
    if (temp < -0.12) return moist > 0.0 ? BIOME.TAIGA : BIOME.SNOWY;
    if (temp > 0.1 && moist < 0.04) return BIOME.DESERT;
    // hot, very wet and low: a mangrove swamp (fresh ground only)
    if (temp > 0.1 && moist > 0.14 && h <= SEA + 4 && !this.legacy && !(this.oldGen && this.oldGen.has(this.key(Math.floor(x) >> 4, Math.floor(z) >> 4))) && this.genVerAt(x, z) >= 2) return BIOME.MANGROVE;
    if (h <= SEA + 1) return BIOME.BEACH;
    // hot and wet: jungle (only on fresh ground, so places you built in keep their forest)
    if (moist > 0.1 && temp > 0.12 && !this.legacy && !(this.oldGen && this.oldGen.has(this.key(Math.floor(x) >> 4, Math.floor(z) >> 4)))) return this.noiseB.fbm2(x / 160 - 900, z / 160 + 400, 2) > 0.18 && this.genVerAt(x, z) >= 3 ? BIOME.BAMBOO : BIOME.JUNGLE;
    // very wet but not hot: a dark forest of big dark oaks (fresh ground only, like the jungle)
    if (moist > 0.17 && temp > -0.02 && temp <= 0.12 && !this.legacy && !(this.oldGen && this.oldGen.has(this.key(Math.floor(x) >> 4, Math.floor(z) >> 4)))) return BIOME.DARK_FOREST;
    // hot and dry-ish: a savanna with flat-topped acacia trees (fresh ground only)
    if (temp > 0.08 && moist <= 0.1 && !this.legacy && !(this.oldGen && this.oldGen.has(this.key(Math.floor(x) >> 4, Math.floor(z) >> 4))) && this.genVerAt(x, z) >= 1) return BIOME.SAVANNA;
    if (moist > 0.04) return temp > -0.02 ? BIOME.FOREST : BIOME.BIRCH;
    // mild, dryish hills: a pink cherry grove (fresh ground only)
    if (temp > -0.08 && temp <= 0.08 && h >= SEA + 7 && !this.legacy && !(this.oldGen && this.oldGen.has(this.key(Math.floor(x) >> 4, Math.floor(z) >> 4))) && this.genVerAt(x, z) >= 2) return BIOME.CHERRY;
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
      if (id !== ID.sand && id !== ID.gravel) break;
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

  surfaceY(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    if (!this.isLoaded(x, z)) return Math.max(this.heightAt(x, z), SEA);
    for (let y = WH - 1; y > 0; y--) {
      const id = this.getBlock(x, y, z);
      if (id && (DEFS[id].solid || DEFS[id].liquid)) return y;
    }
    return 0;
  }

  skyExposed(x, y, z) {
    x = Math.floor(x); z = Math.floor(z);
    for (let yy = Math.floor(y) + 1; yy < WH; yy++) {
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

    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = cx * 16 + x, wz = cz * 16 + z;
      const h = this.heightAt(wx, wz), b = this.biomeAt(wx, wz, h);
      heights[x + z * 16] = h; biomes[x + z * 16] = b;
      let top = ID.grass, fill = ID.dirt, deep = ID.stone;
      if (b === BIOME.DESERT) { top = ID.sand; fill = ID.sand; deep = ID.sandstone; }
      else if (b === BIOME.BEACH) { top = ID.sand; fill = ID.sand; }
      else if (b === BIOME.SNOWY || b === BIOME.TAIGA) { top = b === BIOME.SNOWY ? ID.snow_grass : ID.grass; }
      else if (b === BIOME.MOUNTAIN) { top = h > SEA + 38 ? ID.snow : ID.stone; fill = ID.stone; }
      else if (b === BIOME.OCEAN) {
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
        else if (y < h - 3) id = (deep === ID.sandstone && y < h - 7) ? ID.stone : deep;
        else if (y < h) id = fill;
        else if (y === h) id = top;
        else id = (y === SEA && (b === BIOME.SNOWY || b === BIOME.TAIGA)) ? ID.ice : ID.water;
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
    const treeCount = { [BIOME.DARK_FOREST]: 6, [BIOME.BAMBOO]: 3, [BIOME.MANGROVE]: 5, [BIOME.CHERRY]: 3, [BIOME.SAVANNA]: rng() < 0.7 ? 1 + (rng() < 0.4 ? 1 : 0) : 0, [BIOME.JUNGLE]: 9, [BIOME.FOREST]: 7, [BIOME.BIRCH]: 6, [BIOME.TAIGA]: 6, [BIOME.PLAINS]: rng() < 0.4 ? 1 : 0, [BIOME.SNOWY]: rng() < 0.4 ? 1 : 0, [BIOME.MOUNTAIN]: rng() < 0.3 ? 1 : 0 }[center] || 0;
    const trees = Math.floor(treeCount * this.style.trees + rng());
    for (let t = 0; t < trees; t++) {
      const x = 2 + (rng() * 12 | 0), z = 2 + (rng() * 12 | 0), h = heights[x + z * 16];
      const ground = get(x, h, z);
      if (ground !== ID.grass && ground !== ID.snow_grass) continue;
      if (h + 10 >= WH || get(x, h + 1, z) !== 0) continue;
      const b = biomes[x + z * 16];
      if (b === BIOME.DARK_FOREST) { if (rng() < 0.8) this.darkOakTree(set, get, x, h + 1, z, rng); else this.oakTree(set, get, x, h + 1, z, rng, ID.oak_log, ID.oak_leaves, 4); }
      else if (b === BIOME.SAVANNA) this.acaciaTree(set, get, x, h + 1, z, rng);
      else if (b === BIOME.MANGROVE) this.mangroveTree(set, get, x, h + 1, z, rng);
      else if (b === BIOME.CHERRY) this.cherryTree(set, get, x, h + 1, z, rng);
      else if (b === BIOME.BAMBOO) { if (rng() < 0.5) this.jungleTree(set, get, x, h + 1, z, rng); else this.jungleBush(set, get, x, h + 1, z, rng); }
      else if (b === BIOME.JUNGLE) { if (rng() < 0.6) this.jungleTree(set, get, x, h + 1, z, rng); else this.jungleBush(set, get, x, h + 1, z, rng); }
      else if (b === BIOME.TAIGA || b === BIOME.SNOWY || (b === BIOME.MOUNTAIN && rng() < 0.7)) this.spruceTree(set, get, x, h + 1, z, rng);
      else if (b === BIOME.BIRCH || (b === BIOME.FOREST && rng() < 0.25)) this.oakTree(set, get, x, h + 1, z, rng, ID.birch_log, ID.birch_leaves, 5);
      else this.oakTree(set, get, x, h + 1, z, rng, ID.oak_log, ID.oak_leaves, 4);
      set(x, h, z, ID.dirt);
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
    if (center === BIOME.BAMBOO) { // thick bamboo everywhere
      plant(20, [ID.tall_grass], ID.grass);
      for (let i = 0; i < 60; i++) {
        const x = rng() * 16 | 0, z = rng() * 16 | 0, h = heights[x + z * 16];
        if (get(x, h, z) !== ID.grass || get(x, h + 1, z) !== 0 || h + 16 >= WH) continue;
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
    if (this.buildStructures) this.buildStructures(c, set, get, heights, biomes, rng);

    // apply player edits
    const m = this.edits.get(this.key(cx, cz));
    if (m) for (const [i, id] of m) d[i] = id;

    c.heights = heights;
    this.chunks.set(this.key(cx, cz), c);
    return c;
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
  endTop(wx, wz) {
    const d = Math.hypot(wx, wz), edge = 72 + this.noise.fbm2(wx / 40, wz / 40, 2) * 14;
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
      const dist = Math.hypot(wx, wz), depth = 6 + Math.floor((1 - Math.min(1, dist / 80)) * 24);
      for (let y = top - depth; y <= top; y++) set(x, y, z, ID.end_stone);
      for (const p of this.endPillars()) {
        if (Math.hypot(wx - p.x, wz - p.z) <= p.r + 0.3) {
          for (let y = top + 1; y <= p.top; y++) set(x, y, z, ID.obsidian);
          heights[x + z * 16] = p.top;
        }
      }
    }
    c.heights = heights;
    // apply player edits
    const m = this.edits.get(this.key(cx, cz));
    if (m) for (const [i, id] of m) d[i] = id;
    this.chunks.set(this.key(cx, cz), c);
    return c;
  }

  generateNether(cx, cz) {
    const c = new Chunk(cx, cz);
    const d = c.data;
    const rng = mulberry32(hash3(cx, cz, this.seed));
    const heights = new Int16Array(256), roofs = new Int16Array(256);
    const set = (x, y, z, id) => { if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < WH - 1) d[x + (z << 4) + (y << 8)] = id; };
    const get = (x, y, z) => (x >= 0 && x < 16 && z >= 0 && z < 16 && y >= 0 && y < WH) ? d[x + (z << 4) + (y << 8)] : -1;
    const LAVA_Y = 31;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = cx * 16 + x, wz = cz * 16 + z;
      const floor = Math.floor(31 + this.noise.fbm2(wx / 55, wz / 55, 3) * 30);
      const roof = Math.floor(80 + this.noiseB.fbm2(wx / 38, wz / 38, 3) * 16);
      heights[x + z * 16] = floor; roofs[x + z * 16] = roof;
      const soul = this.noiseC.noise2(wx / 18, wz / 18) > 0.22;
      for (let y = 0; y < WH; y++) {
        let id = 0;
        if (y === 0 || y === WH - 1) id = ID.bedrock;
        else if ((y <= 3 || y >= WH - 4) && rng() < 0.45) id = ID.bedrock;
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
  darkOakTree(set, get, x, y, z, rng) {
    const h = 6 + (rng() * 3 | 0);
    for (let dy = h - 2; dy <= h + 1; dy++) {
      const r = dy === h + 1 ? 2 : 3;
      for (let dx = -r; dx <= r + 1; dx++) for (let dz = -r; dz <= r + 1; dz++) {
        const ex = dx < 0 ? -dx : dx - 1, ez = dz < 0 ? -dz : dz - 1;
        if (ex * ex + ez * ez > r * r + 1) continue;
        if (get(x + dx, y + dy, z + dz) === 0) set(x + dx, y + dy, z + dz, ID.dark_oak_leaves);
      }
    }
    for (let dy = 0; dy <= h; dy++) for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + ox, y + dy, z + oz, ID.dark_oak_log);
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
    if (base <= SEA || base + 8 >= WH) return;
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
    for (let y = 0; y < WH; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const id = data[x + (z << 4) + (y << 8)];
      if (!id) continue;
      const def = DEFS[id];
      if (def.cross) { this.addCross(O, x, y, z, def); continue; }
      if (def.box) { this.addBox(O, x, y, z, def); continue; }
      if (def.boxes || def.fence || def.pane) { for (const bx of this.shapeBoxes(def, (a, b, c) => get(a, b, c), x, y, z, true)) this.addBox(def.translucent ? T : O, x, y, z, { box: bx, faces: def.faces }); continue; }
      const out = def.translucent ? T : O;
      const topH = def.height ? def.height : def.liquid && get(x, y + 1, z) !== id ? 0.875 : 1;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const nid = get(x + F.n[0], y + F.n[1], z + F.n[2]);
        if (nid) {
          const nd = DEFS[nid];
          if (nd.opaque) continue;
          if (nid === id && !def.leaves) continue;
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
    return id && DEFS[id].liquid ? id : 0;
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
