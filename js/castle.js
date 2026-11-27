'use strict';
/* Nabil and Omar's castle: a big stone castle built into their shared world (seed 1310457622) on a flat plain.
   It is part of the land itself, like a village, so it shows up for both of them without filling their saves.
   Outer walls with four corner towers and a gate, a courtyard with a pool, garden, farm and animal pen,
   and a three-floor keep with a room for everything and a beacon on the roof. Every room has a sign. */
const CASTLE = { seed: 1310457622, x: -304, y: 39, z: 108, R: 42, H: 64, DEPTH: 12 };
let CASTLE_DATA = null;

function castleData() {
  if (CASTLE_DATA) return CASTLE_DATA;
  const { R, H, DEPTH } = CASTLE, S = 2 * R + 1, NY = H + DEPTH + 1, KEEP = 0xFFFF;
  const d = new Uint16Array(S * S * NY).fill(KEEP);
  const signs = [], chests = [];
  const rng = mulberry32(20261127);
  const B = k => { const id = ID[k]; if (id === undefined) throw new Error('castle: no block ' + k); return id; };
  const inb = (x, y, z) => x >= -R && x <= R && z >= -R && z <= R && y >= -DEPTH && y <= H;
  const at = (x, y, z) => ((y + DEPTH) * S + (z + R)) * S + (x + R);
  const put = (x, y, z, k) => { if (inb(x, y, z)) d[at(x, y, z)] = typeof k === 'number' ? k : B(k); };
  const box = (x0, y0, z0, x1, y1, z1, k) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) put(x, y, z, typeof k === 'function' ? k(x, y, z) : k); };
  const stone = () => { const q = rng(); return q < 0.72 ? B('stone_bricks') : q < 0.88 ? B('mossy_stone_bricks') : B('cracked_stone_bricks'); };
  const sign = (x, y, z, dir, lines) => { put(x, y, z, 'wall_sign_' + dir); signs.push([x, y, z, lines]); };
  const post = (x, y, z, dir, lines) => { put(x, y, z, 'sign_' + dir); signs.push([x, y, z, lines]); };
  const chest = (x, y, z, items) => { put(x, y, z, 'chest'); chests.push([x, y, z, items]); };
  const bed = (x, y, z) => { put(x, y, z, 'bed'); put(x, y, z + 1, 'bed_head'); };
  const lampPost = (x, z) => { put(x, 1, z, 'oak_fence'); put(x, 2, z, 'oak_fence'); put(x, 3, z, 'lantern'); };

  /* the ground: a flat grass field, cleared of trees and hills */
  for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) {
    const edge = Math.max(Math.abs(x), Math.abs(z));
    for (let y = 1; y <= H; y++) put(x, y, z, 0);
    put(x, 0, z, 'grass');
    const deep = edge > 39 ? 3 : DEPTH; // fill under the whole castle, blend at the very edge
    for (let y = -1; y >= -deep; y--) put(x, y, z, y > -4 ? 'dirt' : 'stone');
  }

  /* outer wall: 2 thick, 10 high, a walkway on top with battlements and lanterns */
  const WALL = 32;
  for (let z = -WALL; z <= WALL; z++) for (let x = -WALL; x <= WALL; x++) {
    const ax = Math.abs(x), az = Math.abs(z);
    if (Math.max(ax, az) < WALL - 1) continue;
    for (let y = 0; y <= 10; y++) put(x, y, z, stone());
    const outer = ax === WALL || az === WALL;
    if (outer && (x + z) % 2 === 0) put(x, 11, z, stone());
    if (!outer && (ax % 6 === 0 || az % 6 === 0)) put(x, 11, z, 'lantern');
  }
  // the gate in the south wall, with a sign outside
  box(-2, 1, WALL - 1, 2, 5, WALL, 0);
  box(-3, 6, WALL - 1, 3, 6, WALL, 'chiseled_stone_bricks');
  for (const gx of [-4, 4]) { box(gx, 1, WALL - 2, gx, 15, WALL + 1, stone); put(gx, 16, WALL + 1, 'lantern'); }
  sign(-3, 3, WALL + 1, 's', ['NABIL & OMAR', 'CASTLE', 'Welcome!', '']);
  sign(3, 3, WALL + 1, 's', ['Keep is ahead', 'Pool: right', 'Farm: left', 'Have fun!']);
  for (let z = WALL + 1; z <= R; z++) box(-2, 0, z, 2, 0, z, 'polished_andesite');

  /* corner towers: 9 x 9, 18 high, a ladder inside, a lookout on top */
  const TOWERS = [[-WALL, -WALL, 'Lookout Tower'], [WALL, -WALL, 'Lookout Tower'], [-WALL, WALL, 'Guest Tower'], [WALL, WALL, 'Guest Tower']];
  for (const [tx, tz, name] of TOWERS) {
    for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) {
      const wall = Math.abs(x) === 4 || Math.abs(z) === 4;
      for (let y = 1; y <= 18; y++) put(tx + x, y, tz + z, wall ? stone() : 0);
      put(tx + x, 0, tz + z, 'spruce_planks'); put(tx + x, 10, tz + z, 'spruce_planks'); put(tx + x, 18, tz + z, wall ? stone() : 'spruce_planks');
      if (wall && (x + z) % 2 === 0) put(tx + x, 19, tz + z, stone());
      if (wall && Math.abs(x) + Math.abs(z) < 7 && (Math.abs(x) === 0 || Math.abs(z) === 0)) { put(tx + x, 4, tz + z, 'glass'); put(tx + x, 14, tz + z, 'glass'); }
    }
    const sx = -Math.sign(tx), sz = -Math.sign(tz); // the side facing the courtyard
    // a door into the courtyard, and doors onto the wall walkway
    box(tx + sx * 4, 1, tz + sz * 2, tx + sx * 4, 3, tz + sz * 2, 0);
    box(tx + sx * 4, 11, tz, tx + sx * 4, 12, tz, 0); box(tx, 11, tz + sz * 4, tx, 12, tz + sz * 4, 0);
    // a ladder up the back corner, through holes in the floors
    const lx = tx - sx * 3, lz = tz;
    for (let y = 1; y <= 18; y++) put(lx, y, lz, 'ladder_' + (sx > 0 ? 'w' : 'e'));
    put(tx + sx * 3, 2, tz - sz * 3, 'lantern'); put(tx + sx * 3, 12, tz - sz * 3, 'lantern'); put(tx, 19, tz, 'lantern');
    sign(tx + sx * 5, 3, tz + sz * 3, sx > 0 ? 'e' : 'w', [name.split(' ')[0], name.split(' ')[1], '', '']);
    if (name === 'Guest Tower') {
      bed(tx - 2, 1, tz - 3); bed(tx + 2, 1, tz - 3); bed(tx - 2, 11, tz - 3); bed(tx + 2, 11, tz - 3);
      chest(tx, 1, tz - 3, [['bread', 16], ['torch', 32]]);
      put(tx - sx * 3, 11, tz + sz * 3, 'crafting_table');
    } else {
      chest(tx, 1, tz + sz * 3, [['arrow', 64], ['bow', 1], ['spyglass', 1], ['torch', 32]]);
      put(tx + sx * 2, 11, tz - sz * 2, 'crafting_table');
      put(tx - sx * 2, 11, tz - sz * 2, 'chest');
    }
  }

  /* the courtyard: a path from the gate to the keep, lamp posts, a pool, a garden, a farm and an animal pen */
  box(-2, 0, 3, 2, 0, WALL - 2, 'polished_andesite');
  box(-1, 0, 3, 1, 0, WALL - 2, 'stone_bricks');
  for (let z = 6; z <= 28; z += 6) { lampPost(-4, z); lampPost(4, z); }
  // the pool
  const PX0 = 7, PX1 = 23, PZ0 = 8, PZ1 = 24;
  box(PX0 - 1, 0, PZ0 - 1, PX1 + 1, 0, PZ1 + 1, 'smooth_quartz');
  box(PX0, -4, PZ0, PX1, -4, PZ1, (x, y, z) => ((x + z) % 4 === 0 ? B('sea_lantern') : B('prismarine_bricks')));
  for (let z = PZ0 - 1; z <= PZ1 + 1; z++) for (let x = PX0 - 1; x <= PX1 + 1; x++) if (x < PX0 || x > PX1 || z < PZ0 || z > PZ1) box(x, -4, z, x, -1, z, 'dark_prismarine');
  box(PX0, -3, PZ0, PX1, 0, PZ1, 'water');
  box(PX0, -1, PZ0, PX1, 0, PZ0 + 3, 'water'); // the shallow end is the same water, the deep end stays deep
  box(PX0, -3, PZ0, PX1, -2, PZ0 + 3, 'smooth_quartz'); // shallow end floor
  box(15, 1, PZ1 + 1, 15, 1, PZ1 + 1, 'x_birch_planks_slab_b'); put(15, 1, PZ1, 'x_birch_planks_slab_b'); // a diving board
  for (const lx of [8, 12, 18, 22]) { put(lx, 1, PZ1 + 3, 'x_smooth_quartz_slab_b'); put(lx, 1, PZ1 + 4, 'x_smooth_quartz_slab_b'); put(lx, 1, PZ1 + 5, 'oak_fence'); } // sun loungers
  for (const [lx, lz] of [[PX0 - 2, PZ0 - 2], [PX1 + 2, PZ0 - 2], [PX0 - 2, PZ1 + 2], [PX1 + 2, PZ1 + 2]]) lampPost(lx, lz);
  post(PX0 - 2, 1, 16, 'w', ['SWIMMING', 'POOL', 'Deep end', 'is this way']);
  chest(PX1 + 3, 1, 16, [['water_bucket', 1], ['bucket', 2], ['cooked_cod', 16]]);
  // the garden: flower beds and cherry trees
  const FL = ['rose', 'dandelion', 'allium', 'tulip_red', 'tulip_orange', 'tulip_pink', 'tulip_white', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'blue_orchid'];
  for (let z = 9; z <= 26; z++) for (let x = -24; x <= -8; x++) {
    if ((x + 24) % 4 === 0) { put(x, 0, z, 'stone_bricks'); continue; } // little paths
    if ((z * 7 + x * 3) % 5 === 0) put(x, 1, z, FL[(x * 5 + z * 3 + 99) % FL.length]); else if ((x + z) % 3 === 0) put(x, 1, z, 'tall_grass');
  }
  const cherry = (x, z) => { for (let y = 1; y <= 4; y++) put(x, y, z, 'cherry_log'); box(x - 2, 4, z - 2, x + 2, 5, z + 2, 'cherry_leaves'); box(x - 1, 6, z - 1, x + 1, 6, z + 1, 'cherry_leaves'); put(x, 4, z, 'cherry_log'); put(x, 5, z, 'cherry_log'); };
  cherry(-20, 13); cherry(-12, 22);
  // a fountain in the garden
  box(-17, 0, 17, -13, 1, 21, 'stone_bricks'); box(-16, 1, 18, -14, 1, 20, 'water'); box(-15, 1, 19, -15, 3, 19, 'stone_bricks'); put(-15, 4, 19, 'water');
  post(-6, 1, 8, 'e', ['GARDEN', '', 'Flowers and', 'a fountain']);
  // the farm (west of the keep)
  for (let z = -28; z <= 0; z++) for (let x = -29; x <= -23; x++) {
    if (x === -26) { put(x, 0, z, 'water'); continue; }
    put(x, 0, z, 'farmland');
    put(x, 1, z, z < -19 ? 'wheat_crop' : z < -10 ? 'carrot_crop' : 'potato_crop');
  }
  for (let z = -27; z <= -1; z += 8) { lampPost(-30, z); lampPost(-22, z); }
  put(-24, 1, 2, 'composter'); chest(-26, 1, 2, [['wheat_seeds', 32], ['carrot', 16], ['potato', 16], ['bone_meal', 32], ['iron_hoe', 1]]);
  post(-28, 1, 2, 's', ['FARM', 'Wheat, carrots', 'and potatoes', '']);
  // the animal pen (east of the keep), with a hay stable, a water trough, beehives and dog beds
  for (let z = -28; z <= 0; z++) for (let x = 22; x <= 29; x++) if (x === 22 || x === 29 || z === -28 || z === 0) put(x, 1, z, 'oak_fence');
  put(25, 1, 0, 'gate_xc'); put(26, 1, 0, 'gate_xc');
  box(23, 1, -27, 28, 1, -26, 'hay_bale'); box(23, 2, -27, 25, 2, -27, 'hay_bale');
  put(28, 1, -14, 'water_cauldron'); put(28, 1, -13, 'water_cauldron');
  for (const z of [-20, -10]) put(23, 1, z, 'beehive');
  put(27, 1, -4, 'dog_bed'); put(27, 1, -6, 'dog_bed');
  for (const z of [-24, -14, -4]) { put(29, 2, z, 'oak_fence'); put(29, 3, z, 'lantern'); }
  chest(23, 1, -2, [['wheat', 32], ['carrot', 16], ['wheat_seeds', 16], ['lead', 4], ['saddle', 2], ['bone', 16]]);
  put(24, 2, 0, 'lantern'); post(27, 1, 1, 's', ['ANIMAL PEN', 'Bring animals', 'here with', 'a lead!']);
  // flowers along the walls
  for (let x = -29; x <= 29; x += 3) if (Math.abs(x) > 6) put(x, 1, WALL - 2, FL[(x + 40) % FL.length]);

  /* the keep: three floors and a roof with a beacon */
  const KX = 20, KZ0 = -28, KZ1 = 2, FLOORS = [0, 7, 14], ROOF = 21;
  for (let z = KZ0; z <= KZ1; z++) for (let x = -KX; x <= KX; x++) {
    const shell = Math.abs(x) === KX || z === KZ0 || z === KZ1;
    const corner = Math.abs(x) === KX && (z === KZ0 || z === KZ1);
    for (let y = 1; y < ROOF; y++) {
      const fl = FLOORS.includes(y);
      if (shell) {
        const ry = y % 7; // windows: 2 high, in pairs along the walls
        const along = Math.abs(x) === KX ? z : x;
        const win = !corner && (ry === 2 || ry === 3) && ((along % 4) + 4) % 4 < 2 && Math.abs(along) > 1 && !(z === KZ1 && Math.abs(x) < 4);
        put(x, y, z, corner ? 'polished_andesite' : fl ? 'polished_andesite' : win ? 'glass' : stone());
      } else if (fl) put(x, y, z, 'dark_oak_planks');
      else put(x, y, z, 0);
    }
    put(x, 0, z, shell ? 'polished_andesite' : 'polished_andesite');
    put(x, ROOF, z, shell ? 'polished_andesite' : 'stone_bricks');
    if (shell && (x + z) % 2 === 0) put(x, ROOF + 1, z, stone());
  }
  // little towers on the keep's corners
  for (const cx of [-KX, KX]) for (const cz of [KZ0, KZ1]) {
    for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) {
      const wall = Math.abs(x) === 2 || Math.abs(z) === 2;
      for (let y = ROOF - 6; y <= ROOF + 5; y++) { const px = cx + x, pz = cz + z; if (y < ROOF && Math.abs(px) < KX && pz > KZ0 && pz < KZ1) continue; put(px, y, pz, wall ? stone() : y === ROOF ? B('stone_bricks') : 0); }
      if (wall && (x + z) % 2 === 0) put(cx + x, ROOF + 6, cz + z, stone());
    }
    put(cx, ROOF + 1, cz, 'lantern');
  }
  // the front door, a sign above it, and steps
  box(-1, 1, KZ1, 1, 3, KZ1, 0);
  box(-2, 4, KZ1, 2, 4, KZ1, 'chiseled_stone_bricks');
  sign(0, 5, KZ1 + 1, 's', ['THE KEEP', 'Kitchen, beds,', 'enchanting...', 'Stairs: back']);
  lampPost(-3, KZ1 + 2); lampPost(3, KZ1 + 2);

  // inside: a corridor down the middle, three rooms on each side of every floor
  const ROOMS = [[-8, 1], [-17, -10], [-27, -19]]; // front, middle, back (z ranges inside)
  const room = (f, side, ri) => { const [z1, z0b] = [ROOMS[ri][0], ROOMS[ri][1]]; return side < 0 ? { x0: -19, x1: -4, z0: Math.min(z1, z0b), z1: Math.max(z1, z0b), y: f + 1, door: -3 } : { x0: 4, x1: 19, z0: Math.min(z1, z0b), z1: Math.max(z1, z0b), y: f + 1, door: 3 }; };
  for (const f of FLOORS) {
    for (let z = KZ0 + 1; z < KZ1; z++) for (let y = f + 1; y <= f + 6; y++) { put(-3, y, z, stone()); put(3, y, z, stone()); }
    for (const zw of [-9, -18]) for (let y = f + 1; y <= f + 6; y++) { box(-19, y, zw, -4, y, zw, stone); box(4, y, zw, 19, y, zw, stone); }
    // a red carpet down the corridor and lights along it
    box(-1, f + 1, KZ0 + 1, 1, f + 1, KZ1 - 1, 'carpet_red');
    for (let z = KZ0 + 2; z < KZ1; z += 5) { put(-2, f + 1, z, 'lantern'); put(2, f + 1, z, 'lantern'); }
    // lights in the ceilings
    for (let z = KZ0 + 3; z < KZ1; z += 5) for (let x = -17; x <= 17; x += 5) put(x, f + 7 === ROOF ? ROOF : f + 7, z, 'glowstone');
  }
  // doors from the corridor into every room, with a sign by each one
  const label = (f, side, ri, lines) => {
    const r = room(f, side, ri), dz = Math.floor((r.z0 + r.z1) / 2);
    box(r.door, r.y, dz, r.door, r.y + 2, dz + 1, 0);
    sign(r.door - side, r.y + 2, dz - 1, side < 0 ? 'e' : 'w', lines);
    return r;
  };

  /* ---------- ground floor ---------- */
  let r = label(0, -1, 0, ['KITCHEN', '', 'Food and', 'cooking']);
  for (let x = -18; x <= -12; x += 2) put(x, 1, r.z0, 'smoker');
  put(-10, 1, r.z0, 'water_cauldron'); put(-9, 1, r.z0, 'barrel'); put(-8, 1, r.z0, 'barrel'); put(-6, 1, r.z0, 'crafting_table');
  for (let x = -16; x <= -8; x++) { put(x, 1, -3, 'oak_fence'); put(x, 2, -3, 'oak_plate_0'); } // a long table
  for (let x = -16; x <= -8; x += 2) { put(x, 1, -4, 'oak_stairs_n'); put(x, 1, -2, 'oak_stairs_s'); }
  chest(-19, 1, -1, [['bread', 32], ['steak', 32], ['cooked_porkchop', 32], ['apple', 32], ['golden_carrot', 16]]);
  chest(-19, 1, 1, [['potion_healing', 4], ['apple', 16], ['cookie', 32], ['mushroom_stew', 4], ['coal', 32]]);
  put(-5, 1, 1, 'lantern'); put(-18, 1, 1, 'campfire');
  r = label(0, -1, 1, ['SMELTING', '', 'Furnaces and', 'blast furnaces']);
  for (let x = -18; x <= -10; x += 2) put(x, 1, r.z0, 'furnace');
  for (let x = -18; x <= -12; x += 3) put(x, 1, r.z1, 'blast_furnace');
  chest(-7, 1, r.z0, [['coal', 64], ['coal', 64], ['coal', 32], ['iron_ore', 32], ['gold_ore', 16]]);
  chest(-5, 1, r.z0, [['coal_block', 16], ['oak_log', 64], ['sand', 64], ['cobblestone', 64]]);
  put(-8, 1, r.z1, 'lantern');
  r = label(0, -1, 2, ['STORAGE', 'ROOM', 'Blocks, ores', 'and tools']);
  const STORE = [
    [['stone', 64], ['cobblestone', 64], ['stone_bricks', 64], ['glass', 64], ['oak_planks', 64]],
    [['oak_log', 64], ['spruce_log', 64], ['birch_log', 64], ['dark_oak_log', 64], ['cherry_log', 64]],
    [['iron_ingot', 64], ['gold_ingot', 32], ['diamond', 16], ['emerald', 16], ['redstone', 64], ['lapis', 64]],
    [['torch', 64], ['torch', 64], ['ladder', 32], ['oak_sign', 16], ['bed', 4], ['chest', 16]],
    [['quartz_block', 64], ['smooth_stone', 64], ['bricks', 64], ['sandstone', 64], ['deepslate_bricks', 64]],
    [['wool_white', 64], ['wool_red', 32], ['wool_blue', 32], ['glowstone', 32], ['sea_lantern', 16]],
    [['iron_pickaxe', 1], ['iron_shovel', 1], ['iron_axe', 1], ['shears', 1], ['flint_and_steel', 1], ['fishing_rod', 1]],
    [['string', 32], ['bone', 32], ['gunpowder', 32], ['leather', 32], ['feather', 32], ['slime_ball', 16]],
    [['oak_sapling', 16], ['wheat_seeds', 32], ['sugar_cane', 32], ['bamboo', 32], ['cactus', 16]],
    [['rail', 64], ['powered_rail', 16], ['minecart', 2], ['redstone_torch', 16], ['lever', 8], ['repeater', 8]],
  ];
  STORE.forEach((items, i) => chest(-18 + (i % 5) * 3, 1 + (i >= 5 ? 0 : 0), i < 5 ? r.z0 : r.z1, items));
  for (let i = 0; i < 5; i++) put(-18 + i * 3, 2, r.z0, 'lantern');
  r = label(0, 1, 0, ['DINING HALL', '', 'Feasts for', 'the king!']);
  for (let x = 7; x <= 16; x++) { put(x, 1, -4, 'oak_fence'); put(x, 2, -4, 'oak_plate_0'); put(x, 1, -3, 'oak_fence'); put(x, 2, -3, 'oak_plate_0'); }
  for (let x = 7; x <= 16; x += 2) { put(x, 1, -5, 'oak_stairs_n'); put(x, 1, -2, 'oak_stairs_s'); }
  put(18, 1, -4, 'oak_stairs_e'); put(18, 1, -3, 'oak_stairs_e'); // the king's chairs at the end
  for (const x of [8, 12, 16]) put(x, 2, -4, 'lantern');
  box(5, 1, r.z0, 18, 1, r.z0, 'carpet_red'); put(19, 1, 1, 'jukebox'); chest(19, 1, -8, [['honey_bottle', 8], ['bread', 32], ['cookie', 64], ['melon_slice', 32]]);
  r = label(0, 1, 1, ['CRAFTING', '', 'Tables, anvil', 'and tools']);
  put(6, 1, r.z0, 'crafting_table'); put(8, 1, r.z0, 'crafting_table'); put(10, 1, r.z0, 'smithing_table'); put(12, 1, r.z0, 'stonecutter');
  put(14, 1, r.z0, 'fletching_table'); put(16, 1, r.z0, 'grindstone'); put(18, 1, r.z0, 'anvil'); put(6, 1, r.z1, 'lectern');
  chest(10, 1, r.z1, [['stick', 64], ['iron_ingot', 32], ['string', 32], ['flint', 16], ['feather', 16], ['diamond', 8]]);
  chest(14, 1, r.z1, [['oak_planks', 64], ['cobblestone', 64], ['iron_block', 4], ['diamond', 8]]);
  put(18, 1, r.z1, 'lantern');
  r = label(0, 1, 2, ['STAIRS', 'UP', '', '']);

  /* ---------- first floor ---------- */
  r = label(7, -1, 0, ['ENCHANTING', 'ROOM', '15 bookshelves', '= level 30!']);
  { const ex = -12, ez = -4, ey = 8;
    put(ex, ey, ez, 'enchanting_table');
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === 2 && !(dz === 2 && Math.abs(dx) <= 1)) { put(ex + dx, ey, ez + dz, 'bookshelf'); put(ex + dx, ey + 1, ez + dz, 'bookshelf'); }
    put(ex - 2, ey + 2, ez - 2, 'lantern'); put(ex + 2, ey + 2, ez - 2, 'lantern');
    put(-18, ey, r.z0, 'anvil'); put(-18, ey, r.z1, 'grindstone'); put(-6, ey, r.z0, 'lectern');
    chest(-6, ey, r.z1, [['lapis', 64], ['lapis', 64], ['book', 32], ['lapis_block', 8], ['enchanted_book', 4]]);
    chest(-18, ey, -4, [['diamond_sword', 1], ['diamond_pickaxe', 1], ['diamond_chestplate', 1], ['bow', 1]]);
  }
  r = label(7, -1, 1, ['BREWING', 'ROOM', 'Potions!', '']);
  for (const x of [-17, -13, -9]) put(x, 8, r.z0, 'brewing_stand');
  put(-15, 8, r.z0, 'water_cauldron'); put(-11, 8, r.z0, 'water_cauldron');
  chest(-6, 8, r.z0, [['nether_wart', 32], ['blaze_powder', 16], ['glass_bottle', 32], ['sugar', 16], ['glistering_melon', 8], ['magma_cream', 8]]);
  chest(-6, 8, r.z1, [['potion_night_vision', 2], ['potion_speed', 2], ['potion_regeneration', 2], ['spider_eye', 16], ['ghast_tear', 4], ['golden_carrot', 16], ['redstone', 32], ['glowstone', 32], ['gunpowder', 16]]);
  put(-18, 8, r.z1, 'lantern');
  r = label(7, -1, 2, ['LIBRARY', '', 'Books and', 'maps']);
  for (let x = r.x0; x <= r.x1; x++) for (const y of [8, 9, 10]) { put(x, y, r.z0, 'bookshelf'); }
  for (let z = r.z0; z <= r.z1; z++) for (const y of [8, 9, 10]) put(r.x0, y, z, 'bookshelf');
  put(-12, 8, -23, 'lectern'); box(-15, 8, -21, -9, 8, -21, 'carpet_red'); put(-6, 8, -20, 'lantern'); put(-16, 8, -20, 'lantern');
  chest(-6, 8, -26, [['book', 32], ['paper', 64], ['map', 4], ['compass', 2], ['clock', 1], ['feather', 16]]);
  r = label(7, 1, 0, ["NABIL'S ROOM", '', 'Keep out,', 'Omar! :)']);
  bed(17, 8, -7); bed(18, 8, -7); put(16, 8, -7, 'lantern'); put(19, 8, -7, 'lantern');
  box(10, 8, -6, 17, 8, -1, 'carpet_blue'); put(5, 8, -8, 'jukebox'); put(5, 8, 1, 'crafting_table');
  chest(19, 8, 1, [['netherite_sword', 1], ['golden_apple', 8], ['ender_pearl', 16], ['diamond', 16], ['steak', 32]]);
  chest(17, 8, 1, [['name_tag', 4], ['bone', 32], ['lead', 4], ['firework_rocket', 32]]);
  r = label(7, 1, 1, ["OMAR'S ROOM", '', 'Keep out,', 'Nabil! :)']);
  bed(17, 8, -16); bed(18, 8, -16); put(16, 8, -16, 'lantern'); put(19, 8, -16, 'lantern');
  box(10, 8, -15, 17, 8, -11, 'carpet_green'); put(5, 8, -17, 'jukebox'); put(5, 8, -10, 'crafting_table');
  chest(19, 8, -10, [['netherite_sword', 1], ['golden_apple', 8], ['ender_pearl', 16], ['diamond', 16], ['steak', 32]]);
  chest(17, 8, -10, [['name_tag', 4], ['bone', 32], ['lead', 4], ['firework_rocket', 32]]);
  r = label(7, 1, 2, ['STAIRS', 'UP AND DOWN', '', '']);

  /* ---------- second floor ---------- */
  r = label(14, -1, 0, ['THRONE ROOM', '', 'Long live the', 'kings!']);
  box(-18, 15, -6, -18, 15, -1, 'gold_block'); put(-18, 16, -4, 'gold_block'); put(-18, 16, -3, 'gold_block');
  put(-17, 15, -4, 'oak_stairs_e'); put(-17, 15, -3, 'oak_stairs_e');
  box(-16, 15, -4, -5, 15, -3, 'carpet_red');
  for (const x of [-14, -10, -6]) { box(x, 15, -7, x, 20, -7, 'quartz_pillar'); box(x, 15, 0, x, 20, 0, 'quartz_pillar'); put(x, 15, -6, 'lantern'); put(x, 15, -1, 'lantern'); }
  r = label(14, -1, 1, ['TREASURY', '', 'Gold, diamonds', 'and emeralds']);
  box(-18, 15, r.z0, -10, 15, r.z0, (x) => B(['gold_block', 'diamond_block', 'emerald_block'][(x + 30) % 3]));
  chest(-7, 15, r.z0, [['diamond', 64], ['emerald', 64], ['gold_ingot', 64], ['netherite_ingot', 4]]);
  chest(-5, 15, r.z0, [['golden_apple', 16], ['enchanted_golden_apple', 2], ['totem_of_undying', 2], ['nether_star', 1]]);
  put(-14, 15, r.z1, 'lantern'); put(-8, 15, r.z1, 'lantern');
  r = label(14, -1, 2, ['ARMORY', '', 'Armor and', 'weapons']);
  chest(-18, 15, r.z0, [['diamond_helmet', 1], ['diamond_chestplate', 1], ['diamond_leggings', 1], ['diamond_boots', 1], ['golden_apple', 2]]);
  chest(-15, 15, r.z0, [['iron_helmet', 1], ['iron_chestplate', 1], ['iron_leggings', 1], ['iron_boots', 1], ['golden_apple', 2]]);
  chest(-12, 15, r.z0, [['diamond_sword', 2], ['diamond_axe', 1], ['bow', 1], ['potion_strength', 2], ['mace', 1]]);
  chest(-9, 15, r.z0, [['bow', 2], ['arrow', 64], ['arrow', 64], ['golden_apple', 8]]);
  chest(-6, 15, r.z0, [['golden_helmet', 1], ['golden_chestplate', 1], ['golden_leggings', 1], ['golden_boots', 1]]); // for the Nether: piglins like gold
  for (let x = -18; x <= -6; x += 3) put(x, 15, r.z1, 'lantern');
  r = label(14, 1, 0, ['DOG ROOM', '', 'Beds for', 'your wolves']);
  for (let x = 6; x <= 18; x += 3) { put(x, 15, -7, 'dog_bed'); put(x, 15, -1, 'dog_bed'); }
  chest(19, 15, -4, [['bone', 64], ['steak', 32], ['lead', 4], ['name_tag', 4]]);
  box(6, 15, -5, 18, 15, -3, 'carpet_brown'); put(12, 15, -4, 'lantern');
  r = label(14, 1, 1, ['NETHER', 'PORTAL', 'Light it with', 'flint & steel']);
  box(9, 15, -14, 14, 19, -14, 'obsidian'); box(10, 16, -14, 13, 18, -14, 0); box(10, 15, -14, 13, 15, -14, 'obsidian');
  box(9, 15, -14, 14, 15, -14, 'obsidian'); box(9, 16, -14, 9, 19, -14, 'obsidian'); box(14, 16, -14, 14, 19, -14, 'obsidian'); box(10, 19, -14, 13, 19, -14, 'obsidian');
  chest(6, 15, -12, [['flint_and_steel', 1], ['golden_helmet', 1], ['golden_boots', 1], ['gold_ingot', 32], ['potion_fire_resistance', 2]]);
  put(18, 15, -16, 'lantern'); put(18, 15, -11, 'lantern'); put(6, 15, -16, 'crying_obsidian');
  r = label(14, 1, 2, ['STAIRS', 'ROOF: BEACON', '', '']);

  /* ---------- the stairwell (right back room on every floor): stone brick stairs zig-zagging up ---------- */
  const flight = (f, lane) => {
    for (let k = 0; k < 6; k++) { put(5 + k, f + 1 + k, lane, 'stone_brick_stairs_e'); put(5 + k, f + 1 + k, lane + 1, 'stone_brick_stairs_e'); for (let y = f + 1; y < f + 1 + k; y++) { put(5 + k, y, lane, 'stone_bricks'); put(5 + k, y, lane + 1, 'stone_bricks'); } }
    // the hole in the floor above, with a railing on the open side
    const top = f + 7;
    box(5, top, lane, 10, top, lane + 1, 0);
    for (let x = 4; x <= 11; x++) put(x, top + 1, lane === -26 ? lane + 2 : lane - 1, 'oak_fence');
    put(4, top + 1, lane, 'oak_fence'); put(4, top + 1, lane + 1, 'oak_fence');
  };
  flight(0, -26); flight(7, -22); flight(14, -26);
  for (const f of FLOORS) { put(18, f + 1, -26, 'lantern'); put(18, f + 1, -20, 'lantern'); }
  put(12, ROOF + 1, -24, 'oak_fence'); // the railing on the roof needs a corner post
  // guests sleep near the stairs on the top floor
  bed(15, 15, -27 + 0); bed(17, 15, -27 + 0);

  /* ---------- the roof: battlements, a beacon on an iron pyramid, and a view ---------- */
  box(-1, ROOF, -14, 1, ROOF, -12, 'iron_block');
  put(0, ROOF + 1, -13, 'beacon');
  for (const [x, z] of [[-10, -6], [10, -6], [-10, -20], [10, -20]]) put(x, ROOF + 1, z, 'lantern');
  post(0, ROOF + 1, -10, 's', ['BEACON', 'Tap it to pick', 'a power!', '']);

  /* light the courtyard and the wall walk so no monsters spawn inside */
  for (let x = -28; x <= 28; x += 7) for (const z of [-30, WALL - 3]) if (Math.abs(x) > 4) lampPost(x, z);
  for (const z of [-20, -10, 0]) { lampPost(-21, z); lampPost(21, z); }

  CASTLE_DATA = { d, S, KEEP, signs, chests };
  return CASTLE_DATA;
}

/* the part of the castle inside one chunk, laid over the land */
function castleChunk(world, cx, cz, d) {
  const C = CASTLE, x0 = cx * 16, z0 = cz * 16;
  if (world.dim !== 'overworld' || world.seed !== C.seed) return;
  if (x0 + 15 < C.x - C.R || x0 > C.x + C.R || z0 + 15 < C.z - C.R || z0 > C.z + C.R) return;
  const K = castleData(), S = K.S;
  for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
    const rx = x0 + lx - C.x, rz = z0 + lz - C.z;
    if (Math.abs(rx) > C.R || Math.abs(rz) > C.R) continue;
    for (let ry = -C.DEPTH; ry <= C.H; ry++) {
      const v = K.d[((ry + C.DEPTH) * S + (rz + C.R)) * S + (rx + C.R)];
      const y = C.y + ry;
      if (v !== K.KEEP && y > 0 && y < WH) d[lx + (lz << 4) + (y << 8)] = v;
    }
  }
}
