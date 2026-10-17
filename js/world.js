'use strict';
/* Voxel world: chunk storage, terrain generation, meshing, raycasting and collision. */

const CS = 16, WH = 96, SEA = 32;
const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, SNOWY: 5, MOUNTAIN: 6, BIRCH: 7, TAIGA: 8 };
const BIOME_NAMES = ['Ocean', 'Beach', 'Plains', 'Forest', 'Desert', 'Snowy Tundra', 'Mountains', 'Birch Forest', 'Taiga'];

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
    this.data = new Uint8Array(CS * CS * WH);
    this.meshes = [];
    this.dirty = true;
  }
}

class World {
  constructor(seed, materials, dim) {
    this.dim = dim || 'overworld';
    if (this.dim === 'nether') seed = (seed ^ 0x2f6e2b1) + 7;
    this.seed = seed >>> 0;
    this.noise = new Noise(this.seed);
    this.noiseB = new Noise((this.seed ^ 0x5bd1e995) >>> 0);
    this.noiseC = new Noise((this.seed + 977) >>> 0);
    this.chunks = new Map();
    this.edits = new Map();
    this.urgent = new Set();
    this.group = new THREE.Group();
    this.mats = materials;
    this.renderDist = 5;
    this.lastCx = null; this.lastCz = null;
    this.queue = [];
  }

  key(cx, cz) { return cx + ',' + cz; }

  /* ---------- terrain shape ---------- */
  heightAt(x, z) {
    const n = this.noise;
    const cont = n.fbm2(x / 260, z / 260, 4);
    const hills = this.noiseB.fbm2(x / 70, z / 70, 4);
    const mnt = this.noiseC.fbm2(x / 200 + 31.7, z / 200 - 12.3, 3);
    let h = SEA + 4 + cont * 70 + hills * 20;
    const m = Math.max(0, mnt - 0.02);
    h += m * m * 600;
    return clamp(Math.floor(h), 4, WH - 14);
  }

  climate(x, z) {
    return [this.noiseB.fbm2(x / 420 + 500, z / 420, 2), this.noiseC.fbm2(x / 380, z / 380 + 700, 2)];
  }

  biomeAt(x, z, h) {
    const [temp, moist] = this.climate(x, z);
    if (h < SEA) return BIOME.OCEAN;
    if (h >= SEA + 26) return BIOME.MOUNTAIN;
    if (temp < -0.12) return moist > 0.0 ? BIOME.TAIGA : BIOME.SNOWY;
    if (temp > 0.1 && moist < 0.04) return BIOME.DESERT;
    if (h <= SEA + 1) return BIOME.BEACH;
    if (moist > 0.04) return temp > -0.02 ? BIOME.FOREST : BIOME.BIRCH;
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

  isLoaded(x, z) { return this.chunks.has(this.key(Math.floor(x) >> 4, Math.floor(z) >> 4)); }

  setBlock(x, y, z, id, record = true) {
    if (y < 0 || y >= WH) return;
    const cx = x >> 4, cz = z >> 4, k = this.key(cx, cz);
    const c = this.chunks.get(k);
    if (!c) return;
    const lx = x & 15, lz = z & 15, i = lx + (lz << 4) + (y << 8);
    c.data[i] = id;
    if (record) {
      let m = this.edits.get(k);
      if (!m) { m = new Map(); this.edits.set(k, m); }
      m.set(i, id);
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
    const c = new Chunk(cx, cz);
    const d = c.data;
    const rng = mulberry32(hash3(cx, cz, this.seed));
    const heights = new Int16Array(256), biomes = new Uint8Array(256);
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
        let cave = n1 * n1 + n2 * n2 < 0.0045;
        if (!cave && y < h - 10) cave = this.noise.noise3(wx / 34, y / 18, wz / 34 + 200) > 0.42;
        if (cave) {
          if (y + 1 < WH && d[i + 256] === ID.water) continue;
          d[i] = y <= 8 ? ID.lava : 0;
        }
      }
    }

    // ores & pockets
    const ORE = [
      [ID.coal_ore, 22, 5, 90, 10], [ID.iron_ore, 26, 4, 80, 9], [ID.gold_ore, 6, 4, 34, 7],
      [ID.diamond_ore, 3, 2, 16, 5], [ID.redstone_ore, 6, 2, 18, 6], [ID.lapis_ore, 3, 4, 32, 5],
      [ID.gravel, 5, 5, 70, 14], [ID.dirt, 6, 5, 70, 14], [ID.obsidian, 1, 2, 10, 5],
    ];
    const mountainChunk = biomes[136] === BIOME.MOUNTAIN;
    if (mountainChunk) ORE.push([ID.emerald_ore, 4, 4, 80, 2], [ID.gold_ore, 4, 30, 80, 6], [ID.iron_ore, 8, 30, 90, 9]);
    if (biomes[136] === BIOME.DESERT) ORE.push([ID.gold_ore, 4, 20, 50, 6]);
    for (const [ore, count, y0, y1, size] of ORE) {
      for (let v = 0; v < count; v++) {
        let x = rng() * 16, y = y0 + rng() * (y1 - y0), z = rng() * 16;
        for (let s = 0; s < size; s++) {
          const xi = x | 0, yi = y | 0, zi = z | 0;
          if (get(xi, yi, zi) === ID.stone) set(xi, yi, zi, ore);
          x += rng() * 2 - 1; y += rng() * 2 - 1; z += rng() * 2 - 1;
        }
      }
    }

    // decorations
    const center = biomes[136];
    const treeCount = { [BIOME.FOREST]: 7, [BIOME.BIRCH]: 6, [BIOME.TAIGA]: 6, [BIOME.PLAINS]: rng() < 0.4 ? 1 : 0, [BIOME.SNOWY]: rng() < 0.4 ? 1 : 0, [BIOME.MOUNTAIN]: rng() < 0.3 ? 1 : 0 }[center] || 0;
    for (let t = 0; t < treeCount; t++) {
      const x = 2 + (rng() * 12 | 0), z = 2 + (rng() * 12 | 0), h = heights[x + z * 16];
      const ground = get(x, h, z);
      if (ground !== ID.grass && ground !== ID.snow_grass) continue;
      if (h + 10 >= WH || get(x, h + 1, z) !== 0) continue;
      const b = biomes[x + z * 16];
      if (b === BIOME.TAIGA || b === BIOME.SNOWY || (b === BIOME.MOUNTAIN && rng() < 0.7)) this.spruceTree(set, get, x, h + 1, z, rng);
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
      if (rng() < 0.07) this.pyramid(set, get, heights, rng);
    }
    if ((center === BIOME.PLAINS || center === BIOME.FOREST) && rng() < 0.08) plant(3, [ID.pumpkin, ID.melon], ID.grass);

    // apply player edits
    const m = this.edits.get(this.key(cx, cz));
    if (m) for (const [i, id] of m) d[i] = id;

    c.heights = heights;
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

  pyramid(set, get, heights, rng) {
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
    set(8, base, 8, ID.diamond_block);
    set(7, base + 1, 7, ID.gold_block); set(9, base + 1, 9, ID.gold_block);
    for (const [x, z] of [[7, 8], [9, 8], [8, 7], [8, 9]]) set(x, base - 2, z, ID.tnt);
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
    const data = c.data;
    for (let y = 0; y < WH; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const id = data[x + (z << 4) + (y << 8)];
      if (!id) continue;
      const def = DEFS[id];
      if (def.cross) { this.addCross(O, x, y, z, def); continue; }
      const out = def.translucent ? T : O;
      const topH = def.liquid && get(x, y + 1, z) !== id ? 0.875 : 1;
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
          out.uv.push(fu[0] ? uv[2] : uv[0], fu[1] ? uv[3] : uv[1]);
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
    if (O.idx.length) c.meshes.push(this.makeMesh(O, this.mats.opaque, cx, cz));
    if (T.idx.length) { const m = this.makeMesh(T, this.mats.trans, cx, cz); m.renderOrder = 1; c.meshes.push(m); }
    for (const m of c.meshes) this.group.add(m);
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

  makeMesh(A, mat, cx, cz) {
    const g = new THREE.BufferGeometry();
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
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++)
      if (this.isSolid(x, y, z)) return true;
    return false;
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
    b.onGround = false; b.hitH = false;
    const hw = b.w / 2;
    for (let s = 0; s < steps; s++) {
      if (dy) {
        b.pos.y += dy;
        if (this.collides(b.pos.x, b.pos.y, b.pos.z, b.w, b.h)) {
          if (dy < 0) { b.pos.y = Math.floor(b.pos.y) + 1; b.onGround = true; }
          else b.pos.y = Math.floor(b.pos.y + b.h) - b.h - 0.001;
          b.vel.y = 0; dy = 0;
        }
      }
      if (dx) {
        b.pos.x += dx;
        if (this.collides(b.pos.x, b.pos.y, b.pos.z, b.w, b.h)) {
          b.pos.x = dx > 0 ? Math.floor(b.pos.x + hw) - hw - 0.001 : Math.floor(b.pos.x - hw) + 1 + hw + 0.001;
          b.vel.x = 0; dx = 0; b.hitH = true;
        }
      }
      if (dz) {
        b.pos.z += dz;
        if (this.collides(b.pos.x, b.pos.y, b.pos.z, b.w, b.h)) {
          b.pos.z = dz > 0 ? Math.floor(b.pos.z + hw) - hw - 0.001 : Math.floor(b.pos.z - hw) + 1 + hw + 0.001;
          b.vel.z = 0; dz = 0; b.hitH = true;
        }
      }
    }
    if (!b.onGround && b.vel.y <= 0 && this.collides(b.pos.x, b.pos.y - 0.02, b.pos.z, b.w, 0.02)) b.onGround = true;
  }

  /* ---------- save ---------- */
  serializeEdits() {
    const out = {};
    for (const [k, m] of this.edits) if (m.size) out[k] = Array.from(m.entries()).flat();
    return out;
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
