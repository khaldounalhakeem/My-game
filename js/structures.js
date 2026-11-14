'use strict';
/* Structures: villages, dungeons, mineshafts, igloos, ruined portals, shipwrecks and stronghold
   libraries. Every piece is built chunk by chunk, so a structure that spans several chunks
   (villages, mineshafts) is laid out on a grid of chunks around a centre picked per region. */

/* Spacing like Minecraft: the world is cut into big squares of chunks, and each square gets at
   most one structure of a kind, somewhere inside it, leaving a gap to the next square. */
const VILLAGE_CELL = 22, VILLAGE_GAP = 6, MINESHAFT_CELL = 14;
const SPACING = {
  pyramid: [32, 8, 303], igloo: [32, 8, 304], shipwreck: [24, 4, 305], ruinedPortal: [40, 15, 306], library: [40, 12, 307],
};

/* is this chunk the one picked for this kind of structure in its square? */
World.prototype.regionPick = function (cx, cz, kind) {
  const [cell, gap, salt] = SPACING[kind];
  const gx = Math.floor(cx / cell), gz = Math.floor(cz / cell);
  const r = mulberry32(hash3(gx, gz, this.seed + salt));
  return cx === gx * cell + (r() * (cell - gap) | 0) && cz === gz * cell + (r() * (cell - gap) | 0);
};

/* which village (if any) owns this chunk: {cx, cz, style, radius} */
World.prototype.villageAt = function (cx, cz) {
  const gx = Math.floor(cx / VILLAGE_CELL), gz = Math.floor(cz / VILLAGE_CELL);
  const key = gx + ',' + gz;
  this.villageCache = this.villageCache || new Map();
  if (!this.villageCache.has(key)) {
    const r = mulberry32(hash3(gx, gz, this.seed + 101));
    let v = null;
    // try a few spots in this square until one is on land a village can be built on
    for (let tries = 0; tries < 6 && !v; tries++) {
      const ccx = gx * VILLAGE_CELL + 2 + (r() * (VILLAGE_CELL - VILLAGE_GAP) | 0), ccz = gz * VILLAGE_CELL + 2 + (r() * (VILLAGE_CELL - VILLAGE_GAP) | 0);
      const wx = ccx * 16 + 8, wz = ccz * 16 + 8, h = this.heightAt(wx, wz), b = this.biomeAt(wx, wz, h);
      const style = { [BIOME.PLAINS]: 'oak', [BIOME.FOREST]: 'oak', [BIOME.BIRCH]: 'oak', [BIOME.DESERT]: 'sand', [BIOME.SNOWY]: 'spruce', [BIOME.TAIGA]: 'spruce' }[b];
      const big = r() < 0.5;
      if (style && h > SEA + 1) v = { cx: ccx, cz: ccz, style, radius: 1 + (big ? 1 : 0), x: wx, z: wz };
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
  if (r() > 0.75) return null;
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
  if (this.regionPick(cx, cz, 'library')) this.buildLibrary(S);

  const v = this.villageAt(cx, cz);
  if (v) { this.buildVillageChunk(S, v); return; }

  if (center === BIOME.SNOWY && this.regionPick(cx, cz, 'igloo')) this.buildIgloo(S);
  else if (center === BIOME.OCEAN && this.regionPick(cx, cz, 'shipwreck')) this.buildShipwreck(S);
  else if (center !== BIOME.OCEAN && center !== BIOME.BEACH && this.regionPick(cx, cz, 'ruinedPortal')) this.buildRuinedPortal(S);
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
    const kind = pickWeighted(rng, VILLAGE_BUILDINGS);
    if (kind === 'farm') this.buildFarm(S, M, qx, qz);
    else if (kind === 'house') this.buildHouse(S, M, qx, qz);
    else if (kind !== 'empty') this.buildShop(S, M, qx, qz, kind);
  });
  // lamp post at the crossing
  const lh = H(9, 9);
  if (lh > SEA && !isCentre) { for (let y = 1; y <= 3; y++) set(9, lh + y, 9, M.post); set(9, lh + 4, 9, ID.glowstone); }
};

/* what each plot in a village becomes */
const VILLAGE_BUILDINGS = [['house', 22], ['bighouse', 12], ['farm', 24], ['blacksmith', 8], ['toolsmith', 6], ['butcher', 6], ['temple', 5], ['library', 5], ['empty', 4]];
function pickWeighted(rng, list) {
  let r = rng() * list.reduce((a, l) => a + l[1], 0);
  for (const [k, w] of list) { r -= w; if (r <= 0) return k; }
  return list[0][0];
}

/* the other village buildings: a big house, the blacksmith, toolsmith, butcher, temple and library */
World.prototype.buildShop = function (S, M, qx, qz, kind) {
  const { set, get, H, rng } = S;
  const x0 = qx + 1, z0 = qz + 1, W = 5;
  const floor = H(x0 + 2, z0 + 2);
  if (floor <= SEA + 1) return;
  const tall = { bighouse: 7, temple: 8 }[kind] || 4;
  const wall = { blacksmith: ID.cobblestone, temple: ID.stone_bricks, toolsmith: M.wall, butcher: M.wall, library: M.wall, bighouse: M.wall }[kind];
  const floorB = { blacksmith: ID.cobblestone, temple: ID.stone_bricks }[kind] || (M.base === ID.sandstone ? ID.sandstone : ID.oak_planks);
  for (let x = x0 - 1; x <= x0 + W; x++) for (let z = z0 - 1; z <= z0 + W; z++) for (let y = floor + 1; y <= floor + tall + 5; y++) set(x, y, z, 0);
  const roadX = qx === 0 ? x0 + W - 1 : x0; // the side that faces the street
  for (let x = x0; x < x0 + W; x++) for (let z = z0; z < z0 + W; z++) {
    for (let y = floor; y > floor - 6 && y > 0; y--) { const id = get(x, y, z); if (y < floor && id && DEFS[id].solid) break; set(x, y, z, M.base); }
    set(x, floor, z, floorB);
    const edgeX = x === x0 || x === x0 + W - 1, edgeZ = z === z0 || z === z0 + W - 1;
    if (!edgeX && !edgeZ) continue;
    for (let y = floor + 1; y <= floor + tall - 1; y++) {
      let id = edgeX && edgeZ ? (kind === 'temple' || kind === 'blacksmith' ? wall : M.post) : wall;
      // the blacksmith's forge is open to the street
      if (kind === 'blacksmith' && x === roadX && !(edgeX && edgeZ) && y <= floor + 2) id = 0;
      set(x, y, z, id);
    }
    if (!(edgeX && edgeZ) && kind !== 'blacksmith') {
      if (kind === 'temple') { if (x === x0 + 2 || z === z0 + 2) { set(x, floor + 5, z, ID.glass); set(x, floor + 6, z, ID.glass); } }
      else if (x === x0 + 2 || z === z0 + 2) { set(x, floor + 2, z, ID.glass); if (kind === 'bighouse') set(x, floor + 5, z, ID.glass); }
    }
  }
  // door to the street
  if (kind !== 'blacksmith') { set(roadX, floor + 1, z0 + 2, 0); set(roadX, floor + 2, z0 + 2, 0); }
  const sx = roadX + (qx === 0 ? 1 : -1);
  set(sx, floor, z0 + 2, M.base); set(sx, floor + 1, z0 + 2, 0); set(sx, floor + 2, z0 + 2, 0);
  const back = qx === 0 ? x0 + 1 : x0 + 3, mid = x0 + 2; // inside, away from the door
  // roofs: flat for the forge and temple, a tall pointed one for the big house, stepped for the rest
  if (kind === 'blacksmith' || kind === 'temple') {
    for (let x = x0 - 1; x <= x0 + W; x++) for (let z = z0 - 1; z <= z0 + W; z++) set(x, floor + tall, z, kind === 'temple' ? ID.stone_bricks : ID.cobblestone);
    if (kind === 'temple') for (const [x, z] of [[x0, z0], [x0 + 4, z0], [x0, z0 + 4], [x0 + 4, z0 + 4]]) set(x, floor + tall + 1, z, ID.stone_bricks);
  } else {
    const steps = kind === 'bighouse' ? 4 : 3;
    for (let k = 0; k < steps; k++) for (let x = x0 - 1 + k; x <= x0 + W - k; x++) for (let z = z0 - 1 + k; z <= z0 + W - k; z++) set(x, floor + tall + k, z, M.roof);
    if (kind === 'bighouse') set(mid, floor + tall + 4, z0 + 2, M.post);
  }
  set(mid, floor + tall - 1, z0 + 2, ID.glowstone);
  switch (kind) {
    case 'bighouse': {
      // an upstairs floor with steps up to it, the bed upstairs
      for (let x = x0 + 1; x < x0 + W - 1; x++) for (let z = z0 + 1; z < z0 + W - 1; z++) set(x, floor + 3, z, ID.oak_planks);
      set(back, floor + 1, z0 + 3, ID.oak_planks); set(back, floor + 2, z0 + 2, ID.oak_planks);
      for (const z of [z0 + 1, z0 + 2]) set(back, floor + 3, z, 0);
      set(back, floor + 3, z0 + 2, 0);
      const up = qx === 0 ? x0 + 3 : x0 + 1;
      set(up, floor + 4, z0 + 1, ID.bed); set(up, floor + 4, z0 + 2, ID.bed_head);
      set(mid, floor + 1, z0 + 1, ID.crafting_table);
      if (rng() < 0.5) set(up, floor + 4, z0 + 3, ID.chest_loot);
      set(mid, floor + 6, z0 + 2, ID.glowstone);
      break;
    }
    case 'blacksmith':
      // a lava pit and furnaces: the forge
      set(back, floor, z0 + 1, ID.lava); set(back, floor, z0 + 2, ID.lava);
      set(back, floor + 1, z0 + 3, ID.furnace); set(mid, floor + 1, z0 + 3, ID.furnace);
      set(mid, floor + 1, z0 + 1, ID.chest_loot);
      break;
    case 'toolsmith':
      set(back, floor + 1, z0 + 1, ID.crafting_table); set(back, floor + 1, z0 + 3, ID.furnace); set(mid, floor + 1, z0 + 3, ID.iron_block);
      set(back, floor + 1, z0 + 2, ID.chest_loot);
      break;
    case 'butcher':
      set(back, floor + 1, z0 + 1, ID.hay_bale); set(back, floor + 2, z0 + 1, ID.hay_bale); set(mid, floor + 1, z0 + 1, ID.hay_bale);
      set(back, floor + 1, z0 + 3, ID.furnace);
      set(back, floor + 1, z0 + 2, ID.chest_loot);
      break;
    case 'temple':
      for (let y = floor + 1; y <= floor + 2; y++) set(mid, y, qx === 0 ? z0 + 1 : z0 + 3, ID.stone_bricks);
      set(mid, floor + 3, qx === 0 ? z0 + 1 : z0 + 3, ID.glowstone);
      set(back, floor + 1, z0 + 3, ID.chest_loot);
      break;
    case 'library':
      for (let z = z0 + 1; z <= z0 + 3; z++) for (let y = floor + 1; y <= floor + 2; y++) set(back, y, z, ID.bookshelf);
      set(mid, floor + 1, z0 + 1, ID.bookshelf); set(mid, floor + 1, z0 + 3, ID.crafting_table);
      break;
  }
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
  set(inX, floor + 1, z0 + 1, ID.bed); set(inX, floor + 1, z0 + 2, ID.bed_head);
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
  const crops = [ID.wheat_crop, ID.wheat_crop, ID.carrot_crop, ID.carrot_crop, ID.pumpkin, ID.melon];
  const crop = crops[rng() * crops.length | 0];
  for (let x = x0 - 1; x <= x0 + 5; x++) for (let z = z0 - 1; z <= z0 + 5; z++) {
    for (let y = h + 1; y <= h + 4; y++) set(x, y, z, 0);
    const edge = x === x0 - 1 || x === x0 + 5 || z === z0 - 1 || z === z0 + 5;
    if (edge) { set(x, h, z, M.post); continue; }
    set(x, h, z, x === x0 + 2 ? ID.water : ID.dirt);
    if (x !== x0 + 2 && rng() < 0.9) set(x, h + 1, z, crop === ID.wheat_crop || crop === ID.carrot_crop ? crop : rng() < 0.6 ? ID.tall_grass : crop);
  }
  // a few hay bales next to the farm
  for (let k = 0; k < 3; k++) {
    const hx = x0 - 2, hz = z0 + k;
    if (H(hx, hz) === h && rng() < 0.7) set(hx, h + 1, hz, ID.hay_bale);
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
  // only dig where the tunnel is safely underground: never through the sea floor, lakes or lava
  const safe = (x, z) => {
    if (y + 5 >= S.H(x, z)) return false;
    for (let dy = -1; dy <= 3; dy++) { const id = get(x, y + dy, z); if (id > 0 && DEFS[id].liquid) return false; }
    return true;
  };
  const carve = (x, z) => {
    if (!safe(x, z)) return;
    for (let dy = 0; dy <= 2; dy++) { const id = get(x, y + dy, z); if (id !== ID.bedrock) set(x, y + dy, z, 0); }
    const below = get(x, y - 1, z);
    if (!below) set(x, y - 1, z, ID.oak_planks);
  };
  // tunnels along both axes of the chunk, joining neighbours into a network
  for (let a = 0; a < 16; a++) for (let w = 7; w <= 9; w++) { carve(a, w); carve(w, a); }
  // wooden supports every 4 blocks
  for (let a = 1; a < 16; a += 4) {
    if (a >= 6 && a <= 10) continue;
    for (const [x, z, bx, bz] of [[a, 7, a, 9], [7, a, 9, a]]) {
      if (!safe(x, z) || !safe(bx, bz)) continue;
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
    if (top <= SEA + 1) return; // no staircase up into the sea
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

/* centre (world x, z) and floor height of the stronghold in this square of chunks, if any */
World.prototype.strongholdIn = function (gx, gz) {
  const [cell, gap, salt] = SPACING.library;
  const r = mulberry32(hash3(gx, gz, this.seed + salt));
  const cx = gx * cell + (r() * (cell - gap) | 0), cz = gz * cell + (r() * (cell - gap) | 0);
  return { cx, cz, x: cx * 16 + 8, z: cz * 16 + 8 };
};
World.prototype.nearestStronghold = function (x, z) {
  const cell = SPACING.library[0] * 16, gx = Math.floor(x / cell), gz = Math.floor(z / cell);
  let best = null, bd = Infinity;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const s = this.strongholdIn(gx + dx, gz + dz), d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
};

/* a stronghold: a library hall with the End portal in the middle */
World.prototype.buildLibrary = function (S) {
  const { set, rng } = S;
  const y0 = 18 + (rng() * 12 | 0);
  for (let x = 1; x <= 14; x++) for (let z = 1; z <= 14; z++) for (let y = y0; y <= y0 + 7; y++) {
    const wall = x === 1 || x === 14 || z === 1 || z === 14 || y === y0 || y === y0 + 7;
    let id = wall ? (rng() < 0.15 ? ID.mossy_cobblestone : ID.stone_bricks) : 0;
    if (!wall && (x === 2 || x === 13 || z === 2 || z === 13) && y <= y0 + 4) id = ID.bookshelf;
    set(x, y, z, id);
  }
  for (const [x, z] of [[2, 7], [13, 8]]) for (let y = y0 + 1; y <= y0 + 2; y++) set(x, y, z, 0);
  for (const [x, z] of [[4, 4], [11, 11], [4, 11], [11, 4]]) set(x, y0 + 6, z, ID.glowstone);
  // the End portal frame: 12 frame blocks around a 3 by 3 hole, a few already holding an eye
  for (let i = 6; i <= 8; i++) for (const [x, z] of [[i, 5], [i, 9], [5, i], [9, i]]) set(x, y0 + 1, z, rng() < 0.1 ? ID.end_portal_frame_eye : ID.end_portal_frame);
  for (let x = 6; x <= 8; x++) for (let z = 6; z <= 8; z++) { set(x, y0, z, ID.lava); set(x, y0 - 1, z, ID.stone_bricks); }
  for (const [x, z] of [[4, 6], [4, 8], [10, 6], [10, 8]]) set(x, y0 + 1, z, ID.stone_bricks);
  set(3, y0 + 1, 3, ID.chest_loot); set(12, y0 + 1, 12, ID.chest_loot);
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
  set(6, h + 1, 9, ID.bed); set(6, h + 1, 10, ID.bed_head); set(10, h + 1, 9, ID.furnace); set(10, h + 1, 7, ID.crafting_table); set(6, h + 1, 7, ID.chest_loot);
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
/* what each kind of structure keeps in its chests: [item, min, max, weight], and how many stacks */
const LOOT_TABLES = {
  // villages, like Minecraft: ordinary houses have simple things, the blacksmith has the good stuff
  v_house: [3, 7, [['bread', 1, 4, 10], ['carrot', 1, 4, 8], ['apple', 1, 5, 10], ['wheat', 1, 7, 10], ['dandelion', 1, 1, 3], ['rose', 1, 1, 3], ['feather', 1, 2, 3], ['stick', 1, 3, 4], ['emerald', 1, 1, 1]]],
  v_blacksmith: [3, 8, [['diamond', 1, 3, 3], ['iron_ingot', 1, 5, 10], ['gold_ingot', 1, 3, 5], ['bread', 1, 3, 15], ['apple', 1, 3, 15], ['iron_pickaxe', 1, 1, 5], ['iron_sword', 1, 1, 5],
    ['iron_chestplate', 1, 1, 5], ['iron_helmet', 1, 1, 5], ['iron_leggings', 1, 1, 5], ['iron_boots', 1, 1, 5], ['obsidian', 3, 7, 5], ['oak_log', 3, 7, 5]]],
  v_toolsmith: [3, 8, [['diamond', 1, 3, 1], ['iron_ingot', 1, 5, 5], ['gold_ingot', 1, 3, 1], ['bread', 1, 3, 15], ['iron_pickaxe', 1, 1, 1], ['coal', 1, 3, 1], ['stick', 1, 3, 20], ['iron_shovel', 1, 1, 5]]],
  v_butcher: [1, 5, [['emerald', 1, 1, 1], ['porkchop', 1, 3, 6], ['wheat', 1, 3, 6], ['beef', 1, 3, 6], ['coal', 1, 3, 3]]],
  v_temple: [3, 8, [['redstone', 1, 4, 2], ['bread', 1, 4, 7], ['rotten_flesh', 1, 4, 7], ['lapis', 1, 4, 1], ['gold_ingot', 1, 4, 1], ['emerald', 1, 4, 1]]],
  desert: [5, 8, [['bone', 4, 6, 25], ['rotten_flesh', 3, 7, 16], ['gunpowder', 1, 8, 10], ['sand', 1, 8, 10], ['string', 1, 8, 10], ['gold_ingot', 2, 7, 15],
    ['iron_ingot', 1, 5, 15], ['emerald', 1, 3, 15], ['diamond', 1, 3, 5], ['golden_apple', 1, 1, 6], ['ender_pearl', 1, 1, 3], ['tnt', 1, 2, 3]]],
  dungeon: [4, 8, [['bread', 1, 1, 15], ['wheat', 1, 4, 15], ['bone', 1, 8, 10], ['rotten_flesh', 1, 8, 10], ['gunpowder', 1, 8, 10], ['string', 1, 8, 10],
    ['coal', 1, 4, 10], ['iron_ingot', 1, 4, 10], ['gold_ingot', 1, 4, 5], ['redstone', 1, 4, 5], ['golden_apple', 1, 1, 3], ['saddle', 1, 1, 5], ['diamond', 1, 2, 1]]],
  mineshaft: [4, 8, [['bread', 1, 3, 15], ['coal', 3, 8, 10], ['iron_ingot', 1, 5, 10], ['gold_ingot', 1, 3, 5], ['redstone', 4, 9, 5], ['lapis', 4, 9, 5],
    ['diamond', 1, 2, 3], ['iron_pickaxe', 1, 1, 1], ['golden_apple', 1, 1, 2], ['oak_planks', 4, 12, 8], ['string', 1, 4, 5]]],
  igloo: [3, 6, [['apple', 1, 3, 15], ['coal', 1, 4, 15], ['gold_ingot', 1, 3, 10], ['stone_axe', 1, 1, 2], ['rotten_flesh', 1, 1, 10], ['emerald', 1, 1, 1],
    ['wheat', 2, 3, 10], ['golden_apple', 1, 1, 1]]],
  shipwreck: [4, 8, [['iron_ingot', 1, 5, 90], ['gold_ingot', 1, 5, 10], ['emerald', 1, 5, 40], ['diamond', 1, 1, 5], ['coal', 2, 8, 20], ['wheat', 8, 21, 20],
    ['rotten_flesh', 5, 24, 20], ['leather_helmet', 1, 1, 5], ['leather_chestplate', 1, 1, 5], ['leather_boots', 1, 1, 5], ['lapis', 1, 10, 20], ['gunpowder', 1, 5, 10]]],
  ruined_portal: [4, 8, [['obsidian', 1, 2, 40], ['flint', 1, 4, 40], ['iron_ingot', 3, 9, 20], ['flint_and_steel', 1, 1, 40], ['gold_ingot', 2, 8, 15],
    ['golden_apple', 1, 1, 15], ['golden_sword', 1, 1, 15], ['golden_pickaxe', 1, 1, 15], ['golden_helmet', 1, 1, 15], ['golden_chestplate', 1, 1, 15],
    ['golden_boots', 1, 1, 15], ['gold_block', 1, 2, 1]]],
  library: [2, 6, [['ender_pearl', 1, 1, 10], ['diamond', 1, 3, 3], ['iron_ingot', 1, 5, 10], ['gold_ingot', 1, 3, 5], ['redstone', 4, 9, 5], ['bread', 1, 3, 15],
    ['apple', 1, 3, 15], ['iron_pickaxe', 1, 1, 5], ['iron_sword', 1, 1, 5], ['iron_chestplate', 1, 1, 5], ['iron_helmet', 1, 1, 5], ['golden_apple', 1, 1, 1],
    ['bookshelf', 1, 3, 10], ['emerald', 1, 3, 5]]],
};
function rollLoot(rng, kind) {
  const [lo, hi, table0] = LOOT_TABLES[kind] || LOOT_TABLES.dungeon;
  const table = table0.filter(l => ID[l[0]] !== undefined);
  const total = table.reduce((a, l) => a + l[3], 0);
  const out = [];
  const n = lo + (rng() * (hi - lo + 1) | 0);
  for (let i = 0; i < n; i++) {
    let r = rng() * total;
    for (const [k, a, b, w] of table) { r -= w; if (r <= 0) { out.push([ID[k], Math.min(DEFS[ID[k]].stack, a + (rng() * (b - a + 1) | 0))]); break; } }
  }
  return out;
}
