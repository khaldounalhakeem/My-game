'use strict';
/* 50 player skins, all original outfits. Each one is a few colors plus extras:
   n name, s skin, h hair, hs hair style (short, long, bald, spiky, bun), e eyes, t shirt, t2 shirt detail,
   tp shirt pattern (plain, stripe, belt, vest, tie, coat, robe, overalls, plaid, zip), p pants, b shoes,
   hat [kind, color] (cap, helmet, hood, beanie, crown, band, tophat, chef, cowboy, viking, wizard, visor, bandana, hardhat, headphones),
   mask (ninja cloth), g glasses color, beard color, cape color */
const SKINS = [
  { n: 'Explorer', s: 0xd8a882, h: 0x7a3a1a, hs: 'spiky', e: 0x2a8a4a, t: 0x3a8a5a, t2: 0xf0c830, tp: 'zip', p: 0x7a6a44, b: 0x3a2a1a, hat: ['cap', 0xe07a20] },
  { n: 'Adventurer', s: 0xe0b48e, h: 0x8a4a1a, hs: 'long', e: 0x2a8a3a, t: 0xc8463a, p: 0x3b3f6f, b: 0x5a3a20 },
  { n: 'Knight', s: 0xd8a882, h: 0x3a2a1a, e: 0x3a5ad0, t: 0xb8b8c0, t2: 0xb02a2a, tp: 'stripe', p: 0x8a8a92, b: 0x5a5a62, hat: ['helmet', 0xc8c8d0] },
  { n: 'Astronaut', s: 0xc89878, h: 0x2a1a10, e: 0x3a5ad0, t: 0xf0f0f0, t2: 0x2a6ad0, tp: 'zip', p: 0xe8e8e8, b: 0x9a9a9a, hat: ['visor', 0xf4f4f4] },
  { n: 'Ninja', s: 0xc89878, h: 0x111111, e: 0x6a3a1a, t: 0x1a1a1e, t2: 0x8a1a1a, tp: 'belt', p: 0x1a1a1e, b: 0x111111, mask: 0x1a1a1e },
  { n: 'Pirate', s: 0xc08a64, h: 0x2a1a10, e: 0x4a3020, t: 0xf0e8d8, t2: 0x6a2a1a, tp: 'vest', p: 0x3a2a20, b: 0x1a1210, hat: ['bandana', 0xc02020], beard: 0x2a1a10 },
  { n: 'Chef', s: 0xe8c0a0, h: 0x6a4a2a, e: 0x3a5ad0, t: 0xffffff, t2: 0xd0d0d0, tp: 'coat', p: 0x2a2a2a, b: 0x1a1a1a, hat: ['chef', 0xffffff] },
  { n: 'Doctor', s: 0x8a5a3a, h: 0x1a1210, e: 0x3a2a1a, t: 0xf4f4f4, t2: 0x3ab0a0, tp: 'coat', p: 0x3ab0a0, b: 0xe8e8e8 },
  { n: 'Farmer', s: 0xd8a080, h: 0xb0702a, e: 0x3a6a2a, t: 0xc84a3a, t2: 0x3a5aa0, tp: 'overalls', p: 0x3a5aa0, b: 0x5a3a20, hat: ['cowboy', 0xe0c070] },
  { n: 'Wizard', s: 0xe0b896, h: 0xe8e8e8, e: 0x5a3ab0, t: 0x4a2a8a, t2: 0xf0c830, tp: 'robe', p: 0x3a2070, b: 0x2a1a50, hat: ['wizard', 0x4a2a8a], beard: 0xf0f0f0 },
  { n: 'Firefighter', s: 0xc89878, h: 0x3a2a1a, e: 0x3a5ad0, t: 0xb08a40, t2: 0xf0e040, tp: 'stripe', p: 0xa07a34, b: 0x1a1a1a, hat: ['hardhat', 0xe02a1a] },
  { n: 'Diver', s: 0xd8a882, h: 0x2a1a10, e: 0x3a5ad0, t: 0xf08020, t2: 0x1a1a1a, tp: 'zip', p: 0x1a1a1a, b: 0xf0d020, hat: ['visor', 0xf08020] },
  { n: 'Lumberjack', s: 0xd89878, h: 0x7a3a1a, e: 0x3a5a2a, t: 0xc02a2a, t2: 0x1a1a1a, tp: 'plaid', p: 0x3a4a6a, b: 0x5a3a20, hat: ['beanie', 0x3a6a3a], beard: 0x7a3a1a },
  { n: 'Miner', s: 0xb88a6a, h: 0x2a1a10, e: 0x4a3020, t: 0x6a6a6a, t2: 0x3a3a3a, tp: 'overalls', p: 0x4a4a5a, b: 0x2a2a2a, hat: ['hardhat', 0xf0c020] },
  { n: 'Snowboarder', s: 0xf0c8a8, h: 0xe8c860, e: 0x3a8ad0, t: 0x2a7ad0, t2: 0xf0f0f0, tp: 'zip', p: 0x2a2a3a, b: 0xf0f0f0, hat: ['beanie', 0xf04a8a], g: 0xf0a020 },
  { n: 'Racer', s: 0xc89878, h: 0x1a1210, e: 0x3a5ad0, t: 0xe02020, t2: 0xffffff, tp: 'stripe', p: 0xe02020, b: 0x1a1a1a, hat: ['helmet', 0xffffff] },
  { n: 'Soccer Player', s: 0x7a4a2a, h: 0x1a1210, hs: 'spiky', e: 0x3a2a1a, t: 0x2a9a3a, t2: 0xffffff, tp: 'stripe', p: 0xf4f4f4, b: 0x1a1a1a },
  { n: 'Basketball Player', s: 0x5a3a24, h: 0x1a1210, e: 0x3a2a1a, t: 0xf07a20, t2: 0x1a1a1a, tp: 'stripe', p: 0xf07a20, b: 0xf4f4f4, hat: ['band', 0xf4f4f4] },
  { n: 'Taekwondo Black Belt', s: 0xd8a882, h: 0x1a1210, e: 0x3a2a1a, t: 0xf8f8f8, t2: 0x111111, tp: 'belt', p: 0xf8f8f8, b: 0xd8a882 },
  { n: 'Taekwondo Blue Belt', s: 0xc89878, h: 0x4a2f1a, hs: 'spiky', e: 0x3a5ad0, t: 0xf8f8f8, t2: 0x2a5ad0, tp: 'belt', p: 0xf8f8f8, b: 0xc89878 },
  { n: 'Cowboy', s: 0xd09870, h: 0x6a4a2a, e: 0x3a5ad0, t: 0x4a7ab0, t2: 0x8a5a2a, tp: 'vest', p: 0x3a4a7a, b: 0x6a3a1a, hat: ['cowboy', 0x8a5a2a] },
  { n: 'Viking', s: 0xe8c0a0, h: 0xd8a040, hs: 'long', e: 0x3a8ad0, t: 0x7a5a3a, t2: 0x5a5a5a, tp: 'belt', p: 0x5a4a3a, b: 0x3a2a1a, hat: ['viking', 0x9a9aa0], beard: 0xd8a040 },
  { n: 'Samurai', s: 0xe0b896, h: 0x111111, hs: 'bun', e: 0x3a2a1a, t: 0xa02020, t2: 0x1a1a1a, tp: 'vest', p: 0x2a2a2a, b: 0x3a2a1a },
  { n: 'Robot', s: 0x9aa0a8, h: 0x6a7078, hs: 'bald', e: 0x30e0f0, t: 0x8a9098, t2: 0x30e0f0, tp: 'zip', p: 0x6a7078, b: 0x4a5058, hat: ['band', 0x30e0f0] },
  { n: 'Monster Hunter', s: 0xc89878, h: 0x3a2a1a, e: 0x2a8a3a, t: 0x4a6a2a, t2: 0x2a2a1a, tp: 'vest', p: 0x3a3a2a, b: 0x2a2a1a, hat: ['hood', 0x3a5a2a] },
  { n: 'Scientist', s: 0xf0c8a8, h: 0xa0a0a0, hs: 'spiky', e: 0x3a5ad0, t: 0xf4f4f4, t2: 0x5a8ad0, tp: 'coat', p: 0x3a3a4a, b: 0x2a2a2a, g: 0x2a2a2a },
  { n: 'Police Officer', s: 0x8a5a3a, h: 0x1a1210, e: 0x3a2a1a, t: 0x1a2a5a, t2: 0xf0c830, tp: 'tie', p: 0x1a2040, b: 0x111111, hat: ['cap', 0x1a2a5a] },
  { n: 'Mail Carrier', s: 0xd8a882, h: 0x5a3a1a, e: 0x3a5ad0, t: 0x5a8ad0, t2: 0x1a2a5a, tp: 'stripe', p: 0x1a2a5a, b: 0x2a2a2a, hat: ['cap', 0x1a2a5a] },
  { n: 'Builder', s: 0xc89878, h: 0x3a2a1a, e: 0x3a5ad0, t: 0x6a6a6a, t2: 0xf07a20, tp: 'vest', p: 0x3a4a6a, b: 0x5a3a20, hat: ['hardhat', 0xf0d020] },
  { n: 'Skater', s: 0xe0b48e, h: 0x2a1a10, e: 0x6a3a1a, t: 0x3a3a3a, t2: 0xe02a5a, tp: 'zip', p: 0x4a6a9a, b: 0xf4f4f4, hat: ['beanie', 0xe02a5a] },
  { n: 'Gamer', s: 0xc89878, h: 0x5a3a1a, hs: 'spiky', e: 0x3a5ad0, t: 0x1a1a1e, t2: 0x30e050, tp: 'zip', p: 0x2a2a3a, b: 0x30e050, hat: ['headphones', 0x2a2a2a] },
  { n: 'King', s: 0xe0b896, h: 0x8a5a2a, e: 0x3a5ad0, t: 0xb01a2a, t2: 0xf0c830, tp: 'robe', p: 0x7a101a, b: 0x3a2a1a, hat: ['crown', 0xf0c830], beard: 0x8a5a2a, cape: 0xb01a2a },
  { n: 'Queen', s: 0xf0c8a8, h: 0x3a2a1a, hs: 'long', e: 0x2a8a3a, t: 0x6a2a9a, t2: 0xf0c830, tp: 'robe', p: 0x5a1a8a, b: 0x3a1a5a, hat: ['crown', 0xf0c830], cape: 0x6a2a9a },
  { n: 'Princess', s: 0xf0c8a8, h: 0xf0d070, hs: 'long', e: 0x3a8ad0, t: 0xf07ab0, t2: 0xffffff, tp: 'robe', p: 0xe05a9a, b: 0xf07ab0, hat: ['crown', 0xf0c830] },
  { n: 'Prince', s: 0xd8a882, h: 0x2a1a10, e: 0x3a5ad0, t: 0x2a5ad0, t2: 0xf0c830, tp: 'belt', p: 0xf4f4f4, b: 0x2a2a2a, hat: ['crown', 0xf0c830], cape: 0x1a2a7a },
  { n: 'Archer', s: 0xd8a882, h: 0xb0702a, e: 0x2a8a3a, t: 0x3a7a2a, t2: 0x6a4a2a, tp: 'belt', p: 0x5a4a2a, b: 0x3a2a1a, hat: ['hood', 0x2a6a2a] },
  { n: 'Mage', s: 0xc89878, h: 0x2a1a10, e: 0x2a6ad0, t: 0x2a4ab0, t2: 0x80d0ff, tp: 'robe', p: 0x1a2a8a, b: 0x1a1a4a, hat: ['hood', 0x2a4ab0] },
  { n: 'Desert Nomad', s: 0xa0704a, h: 0x1a1210, e: 0x3a2a1a, t: 0xe0c890, t2: 0xa0703a, tp: 'robe', p: 0xc8a870, b: 0x6a4a2a, hat: ['bandana', 0xe0c890] },
  { n: 'Arctic Explorer', s: 0xf0c8a8, h: 0x6a4a2a, e: 0x3a8ad0, t: 0xe8e8f0, t2: 0x9ab0c8, tp: 'zip', p: 0x3a4a6a, b: 0x2a2a3a, hat: ['hood', 0xf4f4f8], g: 0x2a2a2a },
  { n: 'Jungle Ranger', s: 0x7a4a2a, h: 0x1a1210, e: 0x3a2a1a, t: 0xb0a070, t2: 0x5a4a2a, tp: 'belt', p: 0x7a6a40, b: 0x4a3a20, hat: ['cowboy', 0xa09060] },
  { n: 'Sailor', s: 0xe0b48e, h: 0xd8a040, e: 0x3a8ad0, t: 0xf4f4f4, t2: 0x1a3a8a, tp: 'stripe', p: 0x1a3a8a, b: 0x111111, hat: ['cap', 0xf4f4f4] },
  { n: 'Masked Hero', s: 0xc89878, h: 0x1a1210, e: 0xf0f0f0, t: 0x6a2ab0, t2: 0xf0c830, tp: 'belt', p: 0x4a1a8a, b: 0xf0c830, mask: 0x6a2ab0, cape: 0xf0c830 },
  { n: 'Night Watch', s: 0xc89878, h: 0x1a1210, e: 0x6ad0f0, t: 0x1a2040, t2: 0x6ad0f0, tp: 'robe', p: 0x10142a, b: 0x0a0a14, hat: ['hood', 0x1a2040] },
  { n: 'Lava Walker', s: 0xc08060, h: 0xf04a10, hs: 'spiky', e: 0xf0a020, t: 0x2a1a1a, t2: 0xf06a10, tp: 'stripe', p: 0x3a1a10, b: 0xf04a10 },
  { n: 'Ice Mage', s: 0xf0d8c8, h: 0xd8f0ff, hs: 'long', e: 0x40b0f0, t: 0x80c8f0, t2: 0xffffff, tp: 'robe', p: 0x5aa0d8, b: 0xd8f0ff, hat: ['crown', 0xa0e0ff] },
  { n: 'Void Walker', s: 0x3a2a4a, h: 0x1a1020, e: 0xd060ff, t: 0x2a1a3a, t2: 0xd060ff, tp: 'zip', p: 0x1a1024, b: 0x0a0610, hat: ['hood', 0x2a1a3a] },
  { n: 'Gold Digger', s: 0xd8a882, h: 0x6a4a2a, e: 0x3a5ad0, t: 0xf0c830, t2: 0x8a5a2a, tp: 'overalls', p: 0x8a5a2a, b: 0x3a2a1a, hat: ['cowboy', 0x6a4a2a] },
  { n: 'Diamond Champion', s: 0xc89878, h: 0x2a1a10, e: 0x30d0e0, t: 0x40d8e8, t2: 0xffffff, tp: 'stripe', p: 0x2a9aa8, b: 0xffffff, cape: 0x2a9aa8 },
  { n: 'Emerald Trader', s: 0xb88a6a, h: 0x3a2a1a, e: 0x2a8a3a, t: 0x2a8a4a, t2: 0xf0c830, tp: 'robe', p: 0x1a6a3a, b: 0x3a2a1a, hat: ['tophat', 0x1a4a2a] },
  { n: 'Redstone Engineer', s: 0xe0b48e, h: 0x7a3a1a, hs: 'spiky', e: 0x3a5ad0, t: 0xc02020, t2: 0x5a5a5a, tp: 'overalls', p: 0x4a4a4a, b: 0x2a2a2a, g: 0xf0a020 },
];
const DEFAULT_SKIN = 0;
const skinOf = i => SKINS[Number.isInteger(i) && i >= 0 && i < SKINS.length ? i : DEFAULT_SKIN];

/* the 8 by 8 face of a skin */
function drawSkinFace(px, sk) {
  const hex = c => '#' + c.toString(16).padStart(6, '0');
  const S = hex(sk.s), H = hex(sk.h), hs = sk.hs || 'short';
  px(0, 0, S, 8, 8);
  if (hs !== 'bald') {
    px(0, 0, H, 8, 2);
    if (hs === 'spiky') { px(1, 0, H, 1, 1); px(0, 2, H, 1, 1); px(7, 2, H, 1, 1); px(3, 2, H, 2, 1); }
    else if (hs === 'long') { px(0, 2, H, 1, 6); px(7, 2, H, 1, 6); }
    else { px(0, 2, H, 1, 1); px(7, 2, H, 1, 1); }
  }
  // round eyes with a sparkle, rosy cheeks and a small smile
  px(1, 3, hex(sk.e), 2, 2); px(5, 3, hex(sk.e), 2, 2); px(1, 3, '#ffffff', 1, 1); px(5, 3, '#ffffff', 1, 1);
  px(0, 5, '#e89a8a', 1, 1); px(7, 5, '#e89a8a', 1, 1);
  if (sk.g !== undefined) { px(0, 2, hex(sk.g), 8, 1); px(0, 3, hex(sk.g), 1, 2); px(3, 3, hex(sk.g), 2, 1); px(7, 3, hex(sk.g), 1, 2); px(1, 5, hex(sk.g), 2, 1); px(5, 5, hex(sk.g), 2, 1); }
  px(2, 6, '#9a4a3a', 1, 1); px(5, 6, '#9a4a3a', 1, 1); px(3, 7, '#9a4a3a', 2, 1);
  if (sk.beard !== undefined) { px(0, 5, hex(sk.beard), 1, 3); px(7, 5, hex(sk.beard), 1, 3); px(1, 6, hex(sk.beard), 1, 2); px(6, 6, hex(sk.beard), 1, 2); px(1, 7, hex(sk.beard), 2, 1); px(5, 7, hex(sk.beard), 2, 1); }
  if (sk.mask !== undefined) { px(0, 0, hex(sk.mask), 8, 3); px(0, 5, hex(sk.mask), 8, 3); px(0, 3, hex(sk.mask), 1, 2); px(3, 3, hex(sk.mask), 2, 2); px(7, 3, hex(sk.mask), 1, 2); }
}

/* a flat front picture of a whole skin, for the skin chooser: 16 pixels wide, 32 tall */
function drawSkinFront(ctx, sk, scale) {
  const hex = c => '#' + c.toString(16).padStart(6, '0');
  const px = (x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x * scale, y * scale, w * scale, h * scale); };
  ctx.clearRect(0, 0, 16 * scale, 32 * scale);
  if (sk.cape !== undefined) px(3, 8, hex(sk.cape), 10, 15);
  // head
  drawSkinFace((x, y, c, w = 1, h = 1) => px(4 + x, 0 + y, c, w, h), sk);
  // body, arms and legs
  px(4, 8, hex(sk.t), 8, 12);
  px(0, 8, hex(sk.t), 4, 4); px(12, 8, hex(sk.t), 4, 4);
  px(0, 12, hex(sk.s), 4, 8); px(12, 12, hex(sk.s), 4, 8);
  const tp = sk.tp || 'plain', T2 = hex(sk.t2 !== undefined ? sk.t2 : sk.t);
  if (tp === 'stripe') px(4, 12, T2, 8, 2);
  if (tp === 'belt') px(4, 17, T2, 8, 1);
  if (tp === 'vest') { px(4, 8, T2, 2, 12); px(10, 8, T2, 2, 12); }
  if (tp === 'tie') px(7, 8, T2, 2, 7);
  if (tp === 'coat') { px(4, 8, T2, 1, 12); px(11, 8, T2, 1, 12); px(7, 8, T2, 2, 2); }
  if (tp === 'robe') { px(7, 8, T2, 2, 12); px(4, 19, T2, 8, 1); }
  if (tp === 'overalls') { px(5, 12, T2, 6, 8); px(5, 8, T2, 1, 4); px(10, 8, T2, 1, 4); }
  if (tp === 'plaid') { for (let y = 8; y < 20; y += 3) px(4, y, T2, 8, 1); for (let x = 5; x < 12; x += 3) px(x, 8, T2, 1, 12); }
  if (tp === 'zip') px(7, 8, T2, 1, 12);
  px(4, 20, hex(sk.p), 8, 9); px(7, 22, '#00000022', 1, 7);
  px(4, 29, hex(sk.b), 4, 3); px(8, 29, hex(sk.b), 4, 3);
  // hats
  if (sk.hat) {
    const [k, c] = sk.hat, C = hex(c);
    if (k === 'cap') { px(4, 0, C, 8, 2); px(3, 2, C, 6, 1); }
    else if (k === 'helmet' || k === 'hardhat') { px(3, 0, C, 10, 3); if (k === 'helmet') { px(3, 3, C, 1, 4); px(12, 3, C, 1, 4); } else px(2, 2, C, 12, 1); }
    else if (k === 'hood') { px(3, 0, C, 10, 2); px(3, 2, C, 1, 6); px(12, 2, C, 1, 6); }
    else if (k === 'beanie') { px(4, 0, C, 8, 2); px(7, 0, '#ffffff', 2, 1); }
    else if (k === 'crown') { px(4, 0, C, 8, 1); px(4, 0, C, 1, 1); px(5, -1, C, 1, 1); px(7, -1, C, 2, 1); px(10, -1, C, 1, 1); }
    else if (k === 'band' || k === 'bandana') { px(4, 1, C, 8, 1); if (k === 'bandana') px(4, 0, C, 8, 1); }
    else if (k === 'tophat') { px(5, -1, C, 6, 2); px(3, 1, C, 10, 1); }
    else if (k === 'chef') { px(4, -1, C, 8, 3); }
    else if (k === 'cowboy') { px(5, 0, C, 6, 1); px(2, 1, C, 12, 1); }
    else if (k === 'viking') { px(4, 0, C, 8, 2); px(2, 0, '#f0f0e0', 2, 1); px(12, 0, '#f0f0e0', 2, 1); }
    else if (k === 'wizard') { px(5, -1, C, 6, 2); px(3, 1, C, 10, 1); }
    else if (k === 'visor') { px(3, 0, C, 10, 1); px(3, 1, C, 1, 7); px(12, 1, C, 1, 7); px(5, 3, '#3a6ad0aa', 6, 3); }
    else if (k === 'headphones') { px(3, 3, C, 1, 3); px(12, 3, C, 1, 3); px(4, 0, C, 8, 1); }
  }
}
