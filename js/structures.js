'use strict';
/* Structures: villages, dungeons, mineshafts, igloos, ruined portals, shipwrecks and stronghold
   libraries. Every piece is built chunk by chunk, so a structure that spans several chunks
   (villages, mineshafts) is laid out on a grid of chunks around a centre picked per region. */

const VILLAGE_CELL = 7, MINESHAFT_CELL = 6;

/* which village (if any) owns this chunk: {cx, cz, style, radius} */
World.prototype.villageAt = function (cx, cz) {
  const gx = Math.floor(cx / VILLAGE_CELL), gz = Math.floor(cz / VILLAGE_CELL);
  const key = gx + ',' + gz;
  this.villageCache = this.villageCache || new Map();
  if (!this.villageCache.has(key)) {
    const r = mulberry32(hash3(gx, gz, this.seed + 101));
    const ccx = gx * VILLAGE_CELL + 2 + (r() * (VILLAGE_CELL - 4) | 0), ccz = gz * VILLAGE_CELL + 2 + (r() * (VILLAGE_CELL - 4) | 0);
    let v = null;
    if (r() < 0.6) {
      const wx = ccx * 16 + 8, wz = ccz * 16 + 8, h = this.heightAt(wx, wz), b = this.biomeAt(wx, wz, h);
      const style = { [BIOME.PLAINS]: 'oak', [BIOME.FOREST]: 'oak', [BIOME.BIRCH]: 'oak', [BIOME.DESERT]: 'sand', [BIOME.SNOWY]: 'spruce', [BIOME.TAIGA]: 'spruce' }[b];
      if (style && h > SEA + 1) v = { cx: ccx, cz: ccz, style, radius: 1 + (r() < 0.5 ? 1 : 0), x: wx, z: wz };
    }
    this.villageCache.set(key, v);
  }
  const v = this.villageCache.get(key);
  if (!v) return null;
  return Math.max(Math.abs(cx - v.cx), Math.abs(cz - v.cz)) <= v.radius ? v : null;
};

World.prototype.mineshaftAt = function (cx, cz) {
  const gx = Math.floor(cx / MINESHAFT_CELL), gz = Math.floor(cz / MINESHAFT_CELL);
  const r = mulberry32(hash3(gx, gz, this.seed + 202));
  if (r() > 0.45) return null;
  const ccx = gx * MINESHAFT_CELL + 1 + (r() * (MINESHAFT_CELL - 2) | 0), ccz = gz * MINESHAFT_CELL + 1 + (r() * (MINESHAFT_CELL - 2) | 0);
  const y = 14 + (r() * 18 | 0);
  if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) > 2) return null;
  return { cx: ccx, cz: ccz, y };
};

World.prototype.buildStructures = function (c, set, get, heights, biomes, rng) {
  const cx = c.cx, cz = c.cz;
  const H = (x, z) => heights[clamp(x, 0, 15) + clamp(z, 0, 15) * 16];
  const center = biomes[136];
  c.spawners = [];
  const S = { set, get, H, rng, c };

  const ms = this.mineshaftAt(cx, cz);
  if (ms) this.buildMineshaft(S, ms);

  if (rng() < 0.08) this.buildDungeon(S);
  if (rng() < 0.012) this.buildLibrary(S);

  const v = this.villageAt(cx, cz);
  if (v) { this.buildVillageChunk(S, v); return; }

  if (center === BIOME.SNOWY && rng() < 0.08) this.buildIgloo(S);
  else if (center === BIOME.OCEAN && rng() < 0.1) this.buildShipwreck(S);
  else if (center !== BIOME.OCEAN && center !== BIOME.BEACH && rng() < 0.035) this.buildRuinedPortal(S);
};

/* ---------- village ---------- */
const VILLAGE_MATS = {
  oak: { wall: 'oak_planks', post: 'oak_log', base: 'cobblestone', roof: 'spruce_planks', path: 'gravel' },
  spruce: { wall: 'spruce_planks', post: 'spruce_log', base: 'cobblestone', roof: 'oak_planks', path: 'gravel' },
  sand: { wall: 'sandstone', post: 'sandstone', base: 'sandstone', roof: 'sandstone', path: 'sandstone' },
};

World.prototype.buildVillageChunk = function (S, v) {
  const { set, get, H, rng, c } = S;
  const M = {}; for (const k in VILLAGE_MATS[v.style]) M[k] = ID[VILLAGE_MATS[v.style][k]];
  // roads: a cross through the middle of every village chunk joins up into a street grid
  for (let a = 0; a < 16; a++) for (const b of [7, 8]) {
    for (const [x, z] of [[a, b], [b, a]]) {
      const h = H(x, z);
      if (h <= SEA) { set(x, SEA, z, M.wall); continue; } // little bridge over water
      set(x, h, z, M.path);
      for (let y = h + 1; y < h + 5; y++) { const id = get(x, y, z); if (id > 0 && !DEFS[id].opaque) set(x, y, z, 0); }
    }
  }
  const isCentre = c.cx === v.cx && c.cz === v.cz;
  const quads = [[0, 0], [9, 0], [0, 9], [9, 9]];
  if (isCentre) {
    this.buildWell(S, M);
    c.village = { x: v.x, z: v.z };
  }
  quads.forEach(([qx, qz], i) => {
    if (isCentre && i === 0) return;
    const roll = rng();
    if (roll < 0.55) this.buildHouse(S, M, qx, qz);
    else if (roll < 0.8) this.buildFarm(S, M, qx, qz);
  });
  // lamp post at the crossing
  const lh = H(9, 9);
  if (lh > SEA && !isCentre) { for (let y = 1; y <= 3; y++) set(9, lh + y, 9, M.post); set(9, lh + 4, 9, ID.glowstone); }
};

World.prototype.buildWell = function (S, M) {
  const { set, H } = S;
  const h = H(3, 3);
  for (let x = 1; x <= 5; x++) for (let z = 1; z <= 5; z++) {
    for (let y = h - 3; y <= h + 5; y++) set(x, y, z, 0);
    const edge = x === 1 || x === 5 || z === 1 || z === 5;
    set(x, h, z, edge ? M.base : ID.water);
    set(x, h - 1, z, edge ? M.base : ID.water);
    set(x, h - 2, z, M.base);
    if (edge) set(x, h + 1, z, M.base);
  }
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]]) for (let y = h + 2; y <= h + 3; y++) set(x, y, z, M.post);
  for (let x = 1; x <= 5; x++) for (let z = 1; z <= 5; z++) set(x, h + 4, z, M.roof);
};

World.prototype.buildHouse = function (S, M, qx, qz) {
  const { set, get, H, rng } = S;
  const x0 = qx + 1, z0 = qz + 1, W = 5;
  const floor = H(x0 + 2, z0 + 2);
  if (floor <= SEA + 1) return;
  for (let x = x0 - 1; x <= x0 + W; x++) for (let z = z0 - 1; z <= z0 + W; z++)
    for (let y = floor + 1; y <= floor + 8; y++) set(x, y, z, 0);
  for (let x = x0; x < x0 + W; x++) for (let z = z0; z < z0 + W; z++) {
    for (let y = floor; y > floor - 6 && y > 0; y--) { const id = get(x, y, z); if (y < floor && id && DEFS[id].solid) break; set(x, y, z, M.base); }
    set(x, floor, z, M.base === ID.sandstone ? ID.sandstone : ID.oak_planks);
    const edgeX = x === x0 || x === x0 + W - 1, edgeZ = z === z0 || z === z0 + W - 1;
    if (!edgeX && !edgeZ) continue;
    for (let y = floor + 1; y <= floor + 3; y++) set(x, y, z, edgeX && edgeZ ? M.post : M.wall);
    if (!(edgeX && edgeZ) && (x === x0 + 2 || z === z0 + 2)) set(x, floor + 2, z, ID.glass);
  }
  // door facing the road
  const dx = qx === 0 ? x0 + W - 1 : x0, dz = z0 + 2;
  set(dx, floor + 1, dz, 0); set(dx, floor + 2, dz, 0);
  const sx = dx + (qx === 0 ? 1 : -1);
  set(sx, floor, dz, M.base); set(sx, floor + 1, dz, 0); set(sx, floor + 2, dz, 0);
  // stepped roof
  for (let k = 0; k < 3; k++) for (let x = x0 - 1 + k; x <= x0 + W - k; x++) for (let z = z0 - 1 + k; z <= z0 + W - k; z++) set(x, floor + 4 + k, z, M.roof);
  // furniture
  const inX = qx === 0 ? x0 + 1 : x0 + 3;
  set(inX, floor + 1, z0 + 1, ID.bed);
  if (rng() < 0.5) set(inX, floor + 1, z0 + 3, ID.crafting_table);
  if (rng() < 0.35) set(x0 + 2, floor + 1, z0 + 3, ID.chest_loot);
  else if (rng() < 0.4) set(x0 + 2, floor + 1, z0 + 3, ID.furnace);
  set(x0 + 2, floor + 3, z0 + 2, ID.glowstone);
};

World.prototype.buildFarm = function (S, M, qx, qz) {
  const { set, get, H, rng } = S;
  const x0 = qx + 1, z0 = qz + 1;
  const h = H(x0 + 2, z0 + 2);
  if (h <= SEA) return;
  const crops = [ID.hay_bale, ID.pumpkin, ID.melon];
  const crop = crops[rng() * crops.length | 0];
  for (let x = x0 - 1; x <= x0 + 5; x++) for (let z = z0 - 1; z <= z0 + 5; z++) {
    for (let y = h + 1; y <= h + 4; y++) set(x, y, z, 0);
    const edge = x === x0 - 1 || x === x0 + 5 || z === z0 - 1 || z === z0 + 5;
    if (edge) { set(x, h, z, M.post); continue; }
    set(x, h, z, x === x0 + 2 ? ID.water : ID.dirt);
    if (x !== x0 + 2 && rng() < 0.75) set(x, h + 1, z, rng() < 0.6 ? ID.tall_grass : crop);
  }
};

/* ---------- underground ---------- */
World.prototype.buildDungeon = function (S) {
  const { set, get, rng, c } = S;
  const y0 = 10 + (rng() * 22 | 0), x0 = 4, z0 = 4, X = 8, Z = 8, Y = 5;
  if (get(8, y0 + 2, 8) !== ID.stone) return;
  for (let x = x0; x <= x0 + X; x++) for (let z = z0; z <= z0 + Z; z++) for (let y = y0; y <= y0 + Y; y++) {
    const wall = x === x0 || x === x0 + X || z === z0 || z === z0 + Z || y === y0 || y === y0 + Y;
    set(x, y, z, wall ? (rng() < 0.4 ? ID.mossy_cobblestone : ID.cobblestone) : 0);
  }
  const sx = x0 + 4, sz = z0 + 4;
  set(sx, y0 + 1, sz, ID.spawner);
  c.spawners.push([c.cx * 16 + sx, y0 + 1, c.cz * 16 + sz]);
  set(x0 + 1, y0 + 1, z0 + 4, ID.chest_loot);
  if (rng() < 0.5) set(x0 + X - 1, y0 + 1, z0 + 4, ID.chest_loot);
};

World.prototype.buildMineshaft = function (S, ms) {
  const { set, get, rng, c } = S;
  const y = ms.y;
  const carve = (x, z) => {
    for (let dy = 0; dy <= 2; dy++) { const id = get(x, y + dy, z); if (id !== ID.bedrock) set(x, y + dy, z, 0); }
    const below = get(x, y - 1, z);
    if (!below || DEFS[below].liquid) set(x, y - 1, z, ID.oak_planks);
  };
  // tunnels along both axes of the chunk, joining neighbours into a network
  for (let a = 0; a < 16; a++) for (let w = 7; w <= 9; w++) { carve(a, w); carve(w, a); }
  // wooden supports every 4 blocks
  for (let a = 1; a < 16; a += 4) {
    if (a >= 6 && a <= 10) continue;
    for (const [x, z, bx, bz] of [[a, 7, a, 9], [7, a, 9, a]]) {
      set(x, y, z, ID.oak_log); set(x, y + 1, z, ID.oak_log);
      set(bx, y, bz, ID.oak_log); set(bx, y + 1, bz, ID.oak_log);
      const beam = x === bx ? [[x, 7], [x, 8], [x, 9]] : [[7, z], [8, z], [9, z]];
      for (const [px, pz] of beam) set(px, y + 2, pz, ID.oak_planks);
    }
  }
  set(8, y + 2, 8, ID.glowstone);
  if (rng() < 0.25) set(rng() < 0.5 ? 7 : 9, y, 2 + (rng() * 3 | 0), ID.chest_loot);
  if (c.cx === ms.cx && c.cz === ms.cz) {
    // a spiral staircase from the surface down to the tunnels, around a log pillar
    const top = S.H(12, 12);
    const ring = [[11, 11], [12, 11], [13, 11], [13, 12], [13, 13], [12, 13], [11, 13], [11, 12]];
    for (let yy = y; yy <= top + 2; yy++) {
      for (const [x, z] of ring) set(x, yy, z, 0);
      set(12, yy, 12, yy === top + 2 ? ID.glowstone : ID.oak_log);
      const k = yy - y;
      if (yy <= top) { const [sx, sz] = ring[k % 8]; set(sx, yy - 1, sz, ID.oak_planks); }
    }
    for (let x = 9; x <= 11; x++) for (let dy = 0; dy <= 2; dy++) set(x, y + dy, 12, 0);
  }
};

World.prototype.buildLibrary = function (S) {
  const { set, get, rng } = S;
  const y0 = 18 + (rng() * 12 | 0);
  if (get(8, y0 + 3, 8) !== ID.stone) return;
  for (let x = 1; x <= 14; x++) for (let z = 1; z <= 14; z++) for (let y = y0; y <= y0 + 7; y++) {
    const wall = x === 1 || x === 14 || z === 1 || z === 14 || y === y0 || y === y0 + 7;
    let id = wall ? (rng() < 0.15 ? ID.mossy_cobblestone : ID.stone_bricks) : 0;
    if (!wall && (x === 2 || x === 13 || z === 2 || z === 13) && y <= y0 + 4) id = ID.bookshelf;
    set(x, y, z, id);
  }
  for (const [x, z] of [[2, 7], [13, 8]]) for (let y = y0 + 1; y <= y0 + 2; y++) set(x, y, z, 0);
  for (const [x, z] of [[5, 5], [10, 10], [5, 10], [10, 5]]) set(x, y0 + 6, z, ID.glowstone);
  for (let x = 6; x <= 9; x++) for (const z of [6, 9]) set(x, y0 + 1, z, ID.bookshelf);
  set(7, y0 + 1, 7, ID.chest_loot); set(8, y0 + 1, 8, ID.chest_loot);
};

/* ---------- surface ---------- */
World.prototype.buildIgloo = function (S) {
  const { set, H } = S;
  const h = H(8, 8);
  if (h <= SEA) return;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy <= 4; dy++) {
    const d = Math.sqrt(dx * dx + (dy * 1.25) * (dy * 1.25) + dz * dz);
    if (d <= 4.2) set(8 + dx, h + 1 + dy, 8 + dz, d >= 3.2 ? ID.snow : 0);
  }
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (dx * dx + dz * dz <= 10) set(8 + dx, h, 8 + dz, ID.snow);
  for (let dz = -5; dz <= -3; dz++) { set(8, h + 1, 8 + dz, 0); set(8, h + 2, 8 + dz, 0); }
  set(6, h + 1, 9, ID.bed); set(10, h + 1, 9, ID.furnace); set(10, h + 1, 7, ID.crafting_table); set(6, h + 1, 7, ID.chest_loot);
  set(8, h + 4, 8, ID.glowstone);
};

World.prototype.buildRuinedPortal = function (S) {
  const { set, H, rng } = S;
  const x0 = 6, z0 = 8, h = H(7, 8);
  if (h <= SEA) return;
  for (let dx = -4; dx <= 5; dx++) for (let dz = -4; dz <= 4; dz++) {
    if (dx * dx + dz * dz > 20 || rng() < 0.3) continue;
    const gh = H(x0 + dx, z0 + dz);
    set(x0 + dx, gh, z0 + dz, rng() < 0.5 ? ID.netherrack : ID.mossy_cobblestone);
  }
  // a broken obsidian frame: some blocks missing or overgrown
  for (let fx = 0; fx <= 3; fx++) for (let y = h + 1; y <= h + 6; y++) set(x0 + fx, y, z0, 0);
  const frame = [];
  for (let dy = 0; dy <= 4; dy++) frame.push([0, dy], [3, dy]);
  frame.push([1, 0], [2, 0], [1, 4], [2, 4]);
  for (const [fx, fy] of frame) set(x0 + fx, h + 1 + fy, z0, rng() < 0.7 ? ID.obsidian : (rng() < 0.5 ? ID.mossy_cobblestone : 0));
  // loose obsidian and treasure nearby to finish the portal
  set(x0 - 2, H(x0 - 2, z0 + 2) + 1, z0 + 2, ID.obsidian);
  set(x0 + 5, H(x0 + 5, z0 - 2) + 1, z0 - 2, ID.obsidian);
  set(x0 + 4, H(x0 + 4, z0 + 2) + 1, z0 + 2, ID.gold_block);
  set(x0 - 2, H(x0 - 2, z0 - 2) + 1, z0 - 2, ID.chest_loot);
};

World.prototype.buildShipwreck = function (S) {
  const { set, H, rng } = S;
  const floor = H(8, 8);
  if (floor > SEA - 4) return;
  const y0 = floor + 1;
  for (let x = 2; x <= 13; x++) {
    const taper = x < 4 ? 4 - x : x > 11 ? x - 11 : 0;
    const zA = 6 + taper, zB = 10 - taper;
    for (let z = zA; z <= zB; z++) {
      if (rng() < 0.85) set(x, y0, z, ID.spruce_planks);
      for (let y = y0 + 1; y <= y0 + 3; y++) {
        const side = z === zA || z === zB;
        if (side && rng() < 0.8) set(x, y, z, ID.spruce_planks);
      }
    }
  }
  for (let y = y0 + 1; y <= y0 + 7; y++) set(8, y, 8, ID.spruce_log);
  set(10, y0 + 1, 8, ID.chest_loot);
  if (rng() < 0.6) set(5, y0 + 1, 8, ID.chest_loot);
};

/* ---------- treasure ---------- */
const LOOT = [
  ['iron_ingot', 1, 5, 10], ['gold_ingot', 1, 6, 9], ['coal', 2, 8, 8], ['apple', 1, 3, 7], ['arrow', 4, 12, 6],
  ['flint', 1, 3, 6], ['string', 1, 4, 5], ['bone', 1, 4, 5], ['obsidian', 1, 4, 5], ['emerald', 1, 3, 4],
  ['diamond', 1, 2, 3], ['ender_pearl', 1, 2, 2], ['golden_apple', 1, 1, 2], ['flint_and_steel', 1, 1, 2],
  ['iron_helmet', 1, 1, 2], ['iron_chestplate', 1, 1, 1], ['iron_sword', 1, 1, 2], ['diamond_sword', 1, 1, 1],
  ['iron_pickaxe', 1, 1, 2], ['bow', 1, 1, 2], ['tnt', 1, 3, 2], ['melon_slice', 2, 6, 4],
];
function rollLoot(rng) {
  const total = LOOT.reduce((a, l) => a + l[3], 0);
  const out = [];
  const n = 3 + (rng() * 4 | 0);
  for (let i = 0; i < n; i++) {
    let r = rng() * total;
    for (const [k, a, b, w] of LOOT) { r -= w; if (r <= 0) { out.push([ID[k], a + (rng() * (b - a + 1) | 0)]); break; } }
  }
  return out;
}
