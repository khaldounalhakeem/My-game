'use strict';
/* Mobs, dragons, projectiles, dropped items, primed TNT, particles and explosions.
   Shared game state lives on the global G (set up in main.js). */

const V3 = THREE.Vector3;
const tmpV = new V3(), tmpV2 = new V3();

/* ---------- small model helpers ---------- */
function lam(color, extra) { return new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {})); }
const BOX_CACHE = new Map();
function boxGeo(w, h, d) {
  const k = w + ',' + h + ',' + d;
  if (!BOX_CACHE.has(k)) BOX_CACHE.set(k, new THREE.BoxGeometry(w, h, d));
  return BOX_CACHE.get(k);
}
function addBox(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function limb(parent, w, h, d, mat, px, py, pz, oy) {
  const g = new THREE.Group();
  g.position.set(px, py, pz);
  addBox(g, w, h, d, mat, 0, oy === undefined ? -h / 2 : oy, 0);
  parent.add(g);
  return g;
}
const FACE_TEX = new Map();
function faceTex(key, size, draw) {
  if (FACE_TEX.has(key)) return FACE_TEX.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const px = (a, b, col, w = 1, h = 1) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  draw(px, x);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  FACE_TEX.set(key, t);
  return t;
}
function noisyFill(px, size, cols, seed) {
  const r = mulberry32(seed);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) px(x, y, cols[(r() * cols.length) | 0]);
}

const FACES_DRAW = {
  zombie: px => { noisyFill(px, 8, ['#5c8a3e', '#55823a', '#64944a'], 1); px(0, 0, '#3f6a2a', 8, 2); px(1, 3, '#1f2f14', 2, 1); px(5, 3, '#1f2f14', 2, 1); px(3, 5, '#3f5a2c', 2, 1); },
  skeleton: px => { noisyFill(px, 8, ['#c9c9c9', '#bdbdbd', '#d4d4d4'], 2); px(1, 3, '#222', 2, 2); px(5, 3, '#222', 2, 2); px(3, 5, '#6a6a6a', 2, 1); px(1, 6, '#444', 6, 1); },
  creeper: px => { noisyFill(px, 8, ['#4caf50', '#3f9a44', '#5cc060', '#6fc86a'], 3); px(1, 2, '#111', 2, 2); px(5, 2, '#111', 2, 2); px(3, 4, '#111', 2, 3); px(2, 5, '#111', 1, 3); px(5, 5, '#111', 1, 3); },
  pig: px => { px(0, 0, '#f0a5a2', 8, 8); px(1, 2, '#fff', 1, 1); px(2, 2, '#222', 1, 1); px(5, 2, '#222', 1, 1); px(6, 2, '#fff', 1, 1); px(2, 4, '#e07f84', 4, 3); px(3, 5, '#8a3f44', 1, 1); px(4, 5, '#8a3f44', 1, 1); },
  cow: px => { px(0, 0, '#433626', 8, 8); px(0, 0, '#e8e8e8', 3, 3); px(1, 3, '#fff', 1, 1); px(2, 3, '#111', 1, 1); px(5, 3, '#111', 1, 1); px(6, 3, '#fff', 1, 1); px(2, 5, '#bfa48f', 4, 3); px(2, 6, '#5a4030', 1, 1); px(5, 6, '#5a4030', 1, 1); },
  sheep: px => { px(0, 0, '#d8c4a8', 8, 8); px(1, 3, '#fff', 1, 1); px(2, 3, '#111', 1, 1); px(5, 3, '#111', 1, 1); px(6, 3, '#fff', 1, 1); px(3, 5, '#e3a8a8', 2, 1); },
  chicken: px => { px(0, 0, '#f4f4f4', 8, 8); px(1, 2, '#111', 1, 1); px(6, 2, '#111', 1, 1); px(2, 3, '#f0a020', 4, 2); px(3, 5, '#d02020', 2, 2); },
  spider: px => { noisyFill(px, 8, ['#2a2523', '#332c29', '#241f1d'], 4); px(1, 3, '#d01010', 2, 1); px(5, 3, '#d01010', 2, 1); px(2, 2, '#ff3030', 1, 1); px(5, 2, '#ff3030', 1, 1); px(0, 4, '#a01010', 1, 1); px(7, 4, '#a01010', 1, 1); },
  player: px => { px(0, 0, '#c89878', 8, 8); px(0, 0, '#4a2f1a', 8, 2); px(0, 2, '#4a2f1a', 1, 1); px(7, 2, '#4a2f1a', 1, 1); px(1, 4, '#fff', 1, 1); px(2, 4, '#3a5ad0', 1, 1); px(5, 4, '#3a5ad0', 1, 1); px(6, 4, '#fff', 1, 1); px(3, 5, '#a86a50', 2, 1); px(2, 6, '#7a3f2a', 4, 1); },
  zombified_piglin: px => { noisyFill(px, 8, ['#e39a8f', '#d88a80', '#eaa89c'], 21); px(0, 0, '#5a8a3a', 3, 3); px(1, 3, '#111', 1, 1); px(1, 2, '#fff', 1, 1); px(5, 3, '#fff', 2, 1); px(6, 3, '#111', 1, 1); px(2, 5, '#c8706a', 4, 2); px(3, 5, '#7a3030', 1, 1); px(4, 5, '#7a3030', 1, 1); px(1, 6, '#f4f0e0', 1, 2); px(6, 6, '#f4f0e0', 1, 2); },
  wither_skeleton: px => { noisyFill(px, 8, ['#2a2a2a', '#242424', '#303030'], 22); px(1, 3, '#050505', 2, 2); px(5, 3, '#050505', 2, 2); px(3, 5, '#151515', 2, 1); px(1, 6, '#101010', 6, 1); },
  blaze: px => { noisyFill(px, 8, ['#f8c828', '#f0b020', '#ffd840'], 23); px(1, 3, '#3a2000', 2, 1); px(5, 3, '#3a2000', 2, 1); px(1, 2, '#ffe880', 2, 1); px(5, 2, '#ffe880', 2, 1); px(2, 6, '#c86010', 4, 1); },
  ghast: px => { px(0, 0, '#f0f0f0', 8, 8); px(1, 2, '#8a8a8a', 2, 1); px(5, 2, '#8a8a8a', 2, 1); px(2, 3, '#c8c8c8', 1, 1); px(5, 3, '#c8c8c8', 1, 1); px(3, 5, '#6a6a6a', 2, 2); },
  iron_golem: px => { noisyFill(px, 8, ['#d6cfc4', '#cbc3b6', '#ddd7cc'], 31); px(0, 0, '#b8b0a2', 8, 2); px(1, 3, '#7a1f1f', 2, 1); px(5, 3, '#7a1f1f', 2, 1); px(2, 6, '#9a9286', 4, 1); px(0, 5, '#4f7a2a', 1, 3); },
  wolf: px => { px(0, 0, '#d8d4cc', 8, 8); px(1, 2, '#222', 1, 1); px(6, 2, '#222', 1, 1); px(2, 4, '#c8c2b8', 4, 4); px(3, 5, '#222', 2, 1); },
  horse: px => { px(0, 0, '#8a5a32', 8, 8); px(1, 2, '#1a1a1a', 1, 1); px(6, 2, '#1a1a1a', 1, 1); px(2, 5, '#6a4224', 4, 3); px(3, 6, '#3a2412', 2, 1); },
  villager: px => { px(0, 0, '#c8a07a', 8, 8); px(0, 0, '#5a3a1e', 8, 2); px(1, 3, '#fff', 1, 1); px(2, 3, '#2a6a2a', 1, 1); px(5, 3, '#2a6a2a', 1, 1); px(6, 3, '#fff', 1, 1); px(1, 2, '#3a2512', 2, 1); px(5, 2, '#3a2512', 2, 1); px(3, 6, '#7a5040', 2, 1); },
  enderman: px => { noisyFill(px, 8, ['#161616', '#1c1c1c', '#121212'], 5); px(0, 4, '#e079fa', 3, 1); px(5, 4, '#e079fa', 3, 1); px(1, 4, '#cc00fa', 1, 1); px(6, 4, '#cc00fa', 1, 1); },
};
function headMats(type, baseColor) {
  const tex = faceTex('face_' + type, 8, FACES_DRAW[type]);
  const side = lam(baseColor), front = lam(0xffffff, { map: tex });
  if (type === 'player') { const hair = lam(0x4a2f1a); return [side, side, hair, side, front, hair]; }
  return [side, side, side, side, front, side];
}

/* ---------- a player wearing one of the skins ---------- */
function buildPlayerModel(skinIdx) {
  const sk = skinOf(skinIdx), g = new THREE.Group(), P = { legs: [], arms: [], head: null, wings: [] };
  const M = c => lam(c);
  const mSkin = M(sk.s), mShirt = M(sk.t), mPants = M(sk.p), mShoe = M(sk.b), mDetail = M(sk.t2 !== undefined ? sk.t2 : sk.t);
  const lw = 0.25, legL = 0.75, bodyH = 0.75, hip = legL, shoulder = hip + bodyH - 0.1, armL = 0.72;
  P.legs.push(limb(g, lw, legL, lw, mPants, -0.125, hip, 0), limb(g, lw, legL, lw, mPants, 0.125, hip, 0));
  for (const l of P.legs) addBox(l, lw + 0.01, 0.16, lw + 0.01, mShoe, 0, -legL + 0.08, 0);
  addBox(g, 0.5, bodyH, 0.25, mShirt, 0, hip + bodyH / 2, 0);
  P.arms.push(limb(g, lw, armL, lw, mSkin, -0.25 - lw / 2, shoulder, 0), limb(g, lw, armL, lw, mSkin, 0.25 + lw / 2, shoulder, 0));
  for (const a of P.arms) addBox(a, lw + 0.02, sk.tp === 'robe' || sk.tp === 'coat' ? 0.55 : 0.3, lw + 0.02, mShirt, 0, sk.tp === 'robe' || sk.tp === 'coat' ? -0.25 : -0.12, 0);
  const bodyY = hip + bodyH / 2, front = 0.13;
  // shirt details
  switch (sk.tp) {
    case 'stripe': addBox(g, 0.52, 0.12, 0.27, mDetail, 0, bodyY + 0.08, 0); break;
    case 'belt': addBox(g, 0.52, 0.07, 0.27, mDetail, 0, hip + 0.06, 0); break;
    case 'vest': for (const x of [-0.18, 0.18]) addBox(g, 0.14, bodyH, 0.02, mDetail, x, bodyY, front); break;
    case 'tie': addBox(g, 0.08, 0.42, 0.02, mDetail, 0, bodyY + 0.12, front); break;
    case 'coat': for (const x of [-0.22, 0.22]) addBox(g, 0.06, bodyH, 0.02, mDetail, x, bodyY, front); addBox(g, 0.52, bodyH * 0.6, 0.27, mShirt, 0, hip - 0.15, 0); break;
    case 'robe': addBox(g, 0.08, bodyH, 0.02, mDetail, 0, bodyY, front); addBox(g, 0.52, 0.55, 0.28, mShirt, 0, hip - 0.2, 0); addBox(g, 0.53, 0.05, 0.29, mDetail, 0, hip - 0.45, 0); break;
    case 'overalls': addBox(g, 0.32, 0.4, 0.02, mDetail, 0, hip + 0.2, front); for (const x of [-0.13, 0.13]) addBox(g, 0.05, 0.36, 0.02, mDetail, x, hip + 0.55, front); break;
    case 'plaid': for (const y of [-0.25, 0, 0.25]) addBox(g, 0.52, 0.04, 0.27, mDetail, 0, bodyY + y, 0); for (const x of [-0.13, 0.13]) addBox(g, 0.04, bodyH, 0.27, mDetail, x, bodyY, 0.002); break;
    case 'zip': addBox(g, 0.04, bodyH, 0.02, mDetail, 0, bodyY, front); break;
  }
  if (sk.cape !== undefined) addBox(g, 0.5, 1.05, 0.04, M(sk.cape), 0, shoulder + 0.05 - 0.52, -0.16);
  // head with the skin's face
  const tex = faceTex('skin_face_' + SKINS.indexOf(sk), 8, px => drawSkinFace(px, sk));
  const hairM = M(sk.hs === 'bald' ? sk.s : sk.h), sideM = sk.hs === 'long' ? hairM : mSkin;
  const head = new THREE.Mesh(boxGeo(0.5, 0.5, 0.5), [sideM, sideM, hairM, mSkin, lam(0xffffff, { map: tex }), hairM]);
  head.position.set(0, hip + bodyH + 0.25, 0); g.add(head); P.head = head;
  if (sk.hs === 'bun') addBox(head, 0.18, 0.18, 0.18, hairM, 0, 0.22, -0.24);
  if (sk.hs === 'spiky') for (const [x, z] of [[-0.15, 0], [0.05, 0.1], [0.15, -0.1], [-0.05, -0.15]]) addBox(head, 0.1, 0.1, 0.1, hairM, x, 0.28, z);
  if (sk.hat) {
    const [k, c] = sk.hat, H = M(c);
    const box = (w, h, d, x, y, z, m) => addBox(head, w, h, d, m || H, x, y, z);
    switch (k) {
      case 'cap': box(0.54, 0.12, 0.54, 0, 0.21, 0); box(0.44, 0.04, 0.22, 0, 0.15, 0.34); break;
      case 'helmet': box(0.6, 0.16, 0.6, 0, 0.22, 0); box(0.6, 0.42, 0.06, 0, 0.02, -0.27); box(0.06, 0.42, 0.6, -0.27, 0.02, 0); box(0.06, 0.42, 0.6, 0.27, 0.02, 0); break;
      case 'hardhat': box(0.56, 0.16, 0.56, 0, 0.24, 0); box(0.66, 0.04, 0.66, 0, 0.16, 0); break;
      case 'hood': box(0.6, 0.12, 0.6, 0, 0.25, 0); box(0.6, 0.6, 0.06, 0, -0.02, -0.28); box(0.06, 0.5, 0.6, -0.28, 0, 0); box(0.06, 0.5, 0.6, 0.28, 0, 0); break;
      case 'beanie': box(0.56, 0.18, 0.56, 0, 0.22, 0); box(0.1, 0.08, 0.1, 0, 0.34, 0, M(0xffffff)); break;
      case 'crown': for (const [w, d, x, z] of [[0.54, 0.04, 0, 0.25], [0.54, 0.04, 0, -0.25], [0.04, 0.54, 0.25, 0], [0.04, 0.54, -0.25, 0]]) box(w, 0.1, d, x, 0.3, z); for (const [x, z] of [[-0.2, 0.25], [0, 0.25], [0.2, 0.25], [-0.25, 0], [0.25, 0], [0, -0.25]]) box(0.06, 0.08, 0.06, x, 0.39, z); break;
      case 'band': box(0.54, 0.06, 0.54, 0, 0.12, 0); break;
      case 'bandana': box(0.56, 0.14, 0.56, 0, 0.2, 0); box(0.12, 0.12, 0.08, 0, 0.12, -0.3); break;
      case 'tophat': box(0.64, 0.04, 0.64, 0, 0.27, 0); box(0.4, 0.42, 0.4, 0, 0.5, 0); break;
      case 'chef': box(0.5, 0.36, 0.5, 0, 0.43, 0); box(0.58, 0.14, 0.58, 0, 0.66, 0); break;
      case 'cowboy': box(0.84, 0.04, 0.84, 0, 0.26, 0); box(0.44, 0.22, 0.44, 0, 0.38, 0); break;
      case 'viking': box(0.56, 0.2, 0.56, 0, 0.21, 0); for (const sx of [-1, 1]) { const horn = box(0.08, 0.26, 0.08, sx * 0.34, 0.33, 0, M(0xf0ecd8)); horn.rotation.z = -sx * 0.5; } break;
      case 'wizard': box(0.72, 0.04, 0.72, 0, 0.27, 0); box(0.42, 0.2, 0.42, 0, 0.38, 0); box(0.28, 0.2, 0.28, 0, 0.56, -0.03); box(0.14, 0.2, 0.14, 0, 0.74, -0.06); break;
      case 'visor': box(0.62, 0.08, 0.62, 0, 0.29, 0); box(0.62, 0.62, 0.06, 0, 0, -0.29); box(0.06, 0.62, 0.62, -0.29, 0, 0); box(0.06, 0.62, 0.62, 0.29, 0, 0); box(0.62, 0.08, 0.62, 0, -0.29, 0);
        box(0.5, 0.5, 0.02, 0, 0, 0.3, lam(0x3a6ad0, { transparent: true, opacity: 0.45 })); break;
      case 'headphones': box(0.58, 0.06, 0.12, 0, 0.28, 0); for (const sx of [-1, 1]) box(0.08, 0.18, 0.18, sx * 0.29, 0.02, 0); break;
    }
  }
  return { group: g, parts: P, skin: sk };
}

/* ---------- armor on a player model ---------- */
const ARMOR_COLORS = { leather: 0x8a4f2a, golden: 0xf5cc2e, iron: 0xdcdcdc, diamond: 0x5decf5 };
const armorMats = {};
function armorMat(id) {
  const def = DEFS[id], k = def ? def.key.split('_')[0] : 'iron';
  return armorMats[k] || (armorMats[k] = lam(ARMOR_COLORS[k] || 0xdcdcdc));
}
/* ids: [helmet, chestplate, leggings, boots], 0 or an item id each */
function dressModel(m, ids) {
  const sig = ids.join(',');
  if (m.armorSig === sig) return;
  m.armorSig = sig;
  for (const o of m.armorParts || []) if (o.parent) o.parent.remove(o);
  m.armorParts = [];
  const P = m.parts, g = m.group;
  const add = (parent, w, h, d, mt, x, y, z) => m.armorParts.push(addBox(parent, w, h, d, mt, x, y, z));
  const ok = (id, slot) => id && DEFS[id] && DEFS[id].armor && DEFS[id].armor.slot === slot;
  const [helmet, chest, legs, boots] = ids;
  if (ok(helmet, 0)) {
    const M = armorMat(helmet);
    add(P.head, 0.6, 0.18, 0.6, M, 0, 0.22, 0);            // top
    add(P.head, 0.6, 0.42, 0.07, M, 0, 0.02, -0.27);       // back
    add(P.head, 0.07, 0.42, 0.6, M, -0.27, 0.02, 0);       // sides
    add(P.head, 0.07, 0.42, 0.6, M, 0.27, 0.02, 0);
    add(P.head, 0.6, 0.09, 0.07, M, 0, 0.12, 0.27);        // brow above the face
  }
  if (ok(chest, 1)) {
    const M = armorMat(chest);
    add(g, 0.58, 0.64, 0.33, M, 0, 1.17, 0);
    for (const a of P.arms) add(a, 0.31, 0.34, 0.31, M, 0, -0.13, 0);
  }
  if (ok(legs, 2)) {
    const M = armorMat(legs);
    add(g, 0.56, 0.2, 0.31, M, 0, 0.86, 0);
    for (const l of P.legs) add(l, 0.3, 0.5, 0.3, M, 0, -0.25, 0);
  }
  if (ok(boots, 3)) {
    const M = armorMat(boots);
    for (const l of P.legs) add(l, 0.31, 0.22, 0.33, M, 0, -0.65, 0.01);
  }
}

/* what each farm animal loves: holding it makes them follow you, feeding two of them makes a baby */
const BREED_FOOD = { cow: ['wheat'], sheep: ['wheat'], pig: ['apple'], chicken: ['wheat_seeds'] };
const lovesFood = (type, id) => !!(id && DEFS[id] && BREED_FOOD[type] && BREED_FOOD[type].includes(DEFS[id].key));

/* ---------- mob definitions ---------- */
const MOB_TYPES = {
  zombie: { name: 'Zombie', hp: 20, w: 0.6, h: 1.95, speed: 2.3, hostile: true, dmg: 3, burns: true, xp: 5, drops: [['rotten_flesh', 0, 2]] },
  skeleton: { name: 'Skeleton', hp: 20, w: 0.6, h: 1.95, speed: 2.4, hostile: true, ranged: true, dmg: 3, burns: true, xp: 5, drops: [['bone', 0, 2], ['arrow', 0, 2]] },
  creeper: { name: 'Creeper', hp: 20, w: 0.6, h: 1.7, speed: 2.5, hostile: true, explode: true, xp: 5, drops: [['gunpowder', 0, 2]] },
  spider: { name: 'Spider', hp: 16, w: 1.3, h: 0.9, speed: 3.3, hostile: true, dmg: 2, xp: 5, nightOnly: true, drops: [['string', 0, 2]] },
  enderman: { name: 'Enderman', hp: 40, w: 0.6, h: 2.9, speed: 3.6, neutral: true, dmg: 6, xp: 5, drops: [['ender_pearl', 0, 1]] },
  zombified_piglin: { name: 'Zombified Piglin', hp: 20, w: 0.6, h: 1.95, speed: 2.7, neutral: true, dmg: 5, xp: 5, fireproof: true, drops: [['rotten_flesh', 0, 1], ['gold_ingot', 0, 1]] },
  wither_skeleton: { name: 'Wither Skeleton', hp: 20, w: 0.7, h: 2.35, speed: 2.7, hostile: true, dmg: 6, xp: 5, fireproof: true, drops: [['coal', 0, 1], ['bone', 0, 2]] },
  blaze: { name: 'Blaze', hp: 20, w: 0.6, h: 1.8, speed: 2.4, hostile: true, fly: 3, ranged: 'blaze', xp: 10, fireproof: true, drops: [['blaze_rod', 0, 1]] },
  ghast: { name: 'Ghast', hp: 10, w: 3.6, h: 4, speed: 1.8, hostile: true, fly: 8, ranged: 'ghast', xp: 5, fireproof: true, drops: [['ghast_tear', 0, 1], ['gunpowder', 0, 2]] },
  iron_golem: { name: 'Iron Golem', hp: 100, w: 1.4, h: 2.7, speed: 1.6, neutral: true, golem: true, dmg: 10, xp: 0, drops: [['iron_ingot', 3, 5], ['rose', 0, 2]] },
  wolf: { name: 'Wolf', hp: 8, w: 0.6, h: 0.85, speed: 3.2, neutral: true, dmg: 3, xp: 1, drops: [], tameWith: 'bone' },
  horse: { name: 'Horse', hp: 22, w: 1.3, h: 1.6, speed: 2.2, passive: true, rideable: true, xp: 1, drops: [['leather', 0, 2]] },
  villager: { name: 'Villager', hp: 20, w: 0.6, h: 1.95, speed: 1.2, passive: true, xp: 0, drops: [] },
  pig: { name: 'Pig', hp: 10, w: 0.9, h: 0.9, speed: 1.5, passive: true, xp: 2, drops: [['porkchop', 1, 3]] },
  cow: { name: 'Cow', hp: 10, w: 0.9, h: 1.4, speed: 1.4, passive: true, xp: 2, drops: [['beef', 1, 3], ['leather', 0, 2]] },
  sheep: { name: 'Sheep', hp: 8, w: 0.9, h: 1.3, speed: 1.4, passive: true, xp: 2, drops: [['wool_white', 1, 2]] },
  chicken: { name: 'Chicken', hp: 4, w: 0.45, h: 0.7, speed: 1.6, passive: true, xp: 1, drops: [['chicken', 1, 1], ['feather', 0, 2]] },
};

function buildMobModel(type) {
  const g = new THREE.Group();
  const P = { legs: [], arms: [], head: null, wings: [] };
  if (type === 'zombie' || type === 'skeleton' || type === 'enderman' || type === 'player' || type === 'zombified_piglin' || type === 'wither_skeleton' || type === 'villager') {
    const thin = type === 'skeleton' || type === 'enderman' || type === 'wither_skeleton', tall = type === 'enderman';
    const skin = { zombie: 0x5c8a3e, skeleton: 0xc9c9c9, enderman: 0x161616, player: 0xc89878, zombified_piglin: 0xe39a8f, wither_skeleton: 0x2a2a2a, villager: 0xc8a07a }[type];
    const shirt = { zombie: 0x2f8fa3, skeleton: 0xbdbdbd, enderman: 0x1a1a1a, player: 0x2fb5c8, zombified_piglin: 0x7a5a32, wither_skeleton: 0x262626, villager: 0x6b4a2e }[type];
    const pants = { zombie: 0x3b3f8f, skeleton: 0xa6a6a6, enderman: 0x161616, player: 0x3b3f9f, zombified_piglin: 0x5a3a20, wither_skeleton: 0x202020, villager: 0x5e3f24 }[type];
    const mSkin = lam(skin), mShirt = lam(shirt), mPants = lam(pants);
    const lw = thin ? 0.13 : 0.25, legL = tall ? 1.5 : 0.75, bodyH = 0.75, hip = legL;
    P.legs.push(limb(g, lw, legL, lw, mPants, -0.125, hip, 0), limb(g, lw, legL, lw, mPants, 0.125, hip, 0));
    addBox(g, 0.5, bodyH, thin ? 0.2 : 0.25, mShirt, 0, hip + bodyH / 2, 0);
    const shoulder = hip + bodyH - 0.1, armL = tall ? 1.5 : 0.72;
    const armMat = type === 'zombie' || type === 'player' ? mSkin : mShirt;
    P.arms.push(limb(g, lw, armL, lw, armMat, -0.25 - lw / 2, shoulder, 0), limb(g, lw, armL, lw, armMat, 0.25 + lw / 2, shoulder, 0));
    if (type === 'player') for (const a of P.arms) addBox(a, lw + 0.02, 0.3, lw + 0.02, mShirt, 0, -0.12, 0);
    const head = new THREE.Mesh(boxGeo(0.5, 0.5, 0.5), headMats(type, skin));
    head.position.set(0, hip + bodyH + 0.25, 0); g.add(head); P.head = head;
    if (type === 'zombie') for (const a of P.arms) a.rotation.x = -Math.PI / 2;
    if (type === 'villager') {
      addBox(head, 0.12, 0.22, 0.12, lam(0xb88a64), 0, -0.08, 0.3);
      addBox(g, 0.54, 0.5, 0.29, mShirt, 0, hip + 0.1, 0);
      for (const a of P.arms) a.rotation.x = -0.9;
    }
    if (type === 'zombified_piglin' || type === 'wither_skeleton') {
      P.arms[1].rotation.x = -0.6;
      const blade = addBox(P.arms[1], 0.08, 0.8, 0.08, lam(type === 'wither_skeleton' ? 0x707070 : 0xf5cc2e), 0, -0.9, 0.1);
      blade.rotation.x = Math.PI / 2 - 0.3;
      if (type === 'wither_skeleton') g.scale.setScalar(1.2);
    }
    if (type === 'skeleton') { P.arms[1].rotation.x = -Math.PI / 2; const bow = addBox(P.arms[1], 0.05, 0.7, 0.05, lam(0x7a5a32), 0, -0.7, 0.12); bow.rotation.x = Math.PI / 2; }
  } else if (type === 'creeper') {
    const tex = faceTex('creeper_body', 8, px => noisyFill(px, 8, ['#4caf50', '#3f9a44', '#5cc060', '#6fc86a', '#2f7a32'], 9));
    const body = lam(0xffffff, { map: tex });
    addBox(g, 0.5, 0.8, 0.28, body, 0, 0.375 + 0.4, 0);
    for (const [x, z] of [[-0.13, 0.17], [0.13, 0.17], [-0.13, -0.17], [0.13, -0.17]]) P.legs.push(limb(g, 0.25, 0.375, 0.2, body, x, 0.375, z));
    const head = new THREE.Mesh(boxGeo(0.5, 0.5, 0.5), headMats('creeper', 0x4caf50));
    head.position.set(0, 1.42, 0); g.add(head); P.head = head;
  } else if (type === 'spider') {
    const mb = lam(0x2a2523), mLeg = lam(0x1f1a18);
    addBox(g, 0.85, 0.6, 0.9, mb, 0, 0.5, -0.5);
    addBox(g, 0.4, 0.4, 0.3, mb, 0, 0.45, 0.0);
    const head = new THREE.Mesh(boxGeo(0.5, 0.5, 0.45), headMats('spider', 0x2a2523));
    head.position.set(0, 0.45, 0.35); g.add(head); P.head = head;
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1, k = i % 4;
      const L = new THREE.Group();
      L.position.set(side * 0.15, 0.45, 0.15 - k * 0.15);
      addBox(L, 0.95, 0.09, 0.09, mLeg, side * 0.47, 0, 0);
      L.rotation.z = side * -0.55;
      L.rotation.y = (k - 1.5) * 0.35 * side;
      L.userData.baseY = L.rotation.y;
      g.add(L); P.legs.push(L);
    }
  } else if (type === 'pig' || type === 'cow' || type === 'sheep') {
    const S = {
      pig: { body: [0.6, 0.5, 0.9], by: 0.6, leg: 0.36, head: [0.5, 0.5, 0.45], hy: 0.75, hz: 0.6, col: 0xf0a5a2 },
      cow: { body: [0.72, 0.65, 1.1], by: 0.95, leg: 0.62, head: [0.5, 0.5, 0.4], hy: 1.2, hz: 0.72, col: 0x433626 },
      sheep: { body: [0.7, 0.62, 1.0], by: 0.85, leg: 0.55, head: [0.38, 0.4, 0.45], hy: 1.1, hz: 0.62, col: 0xe8e8e8 },
    }[type];
    let bodyMat = lam(S.col);
    if (type === 'cow') bodyMat = lam(0xffffff, { map: faceTex('cow_body', 16, px => { px(0, 0, '#433626', 16, 16); const r = mulberry32(7); for (let i = 0; i < 6; i++) px(r() * 14 | 0, r() * 14 | 0, '#eeeeee', 2 + (r() * 4 | 0), 2 + (r() * 3 | 0)); }) });
    if (type === 'sheep') bodyMat = lam(0xffffff, { map: faceTex('sheep_body', 8, px => noisyFill(px, 8, ['#ececec', '#e0e0e0', '#f6f6f6'], 11)) });
    addBox(g, S.body[0], S.body[1], S.body[2], bodyMat, 0, S.by, 0);
    const legMat = type === 'sheep' ? lam(0xd8c4a8) : lam(type === 'pig' ? 0xe8999a : 0x3a2e20);
    const lx = S.body[0] / 2 - 0.13, lz = S.body[2] / 2 - 0.15;
    for (const [x, z] of [[-lx, lz], [lx, lz], [-lx, -lz], [lx, -lz]]) P.legs.push(limb(g, 0.22, S.leg, 0.22, legMat, x, S.leg, z));
    const head = new THREE.Mesh(boxGeo(...S.head), headMats(type, type === 'sheep' ? 0xd8c4a8 : S.col));
    head.position.set(0, S.hy, S.hz); g.add(head); P.head = head;
    if (type === 'cow') { addBox(head, 0.08, 0.15, 0.08, lam(0xd8d0c0), -0.28, 0.25, 0); addBox(head, 0.08, 0.15, 0.08, lam(0xd8d0c0), 0.28, 0.25, 0); }
  } else if (type === 'wolf') {
    const fur = lam(0xd8d4cc), dark = lam(0xb8b2a8);
    addBox(g, 0.42, 0.42, 0.85, fur, 0, 0.62, 0);
    addBox(g, 0.5, 0.5, 0.42, fur, 0, 0.68, 0.22);
    for (const [x, z] of [[-0.12, 0.28], [0.12, 0.28], [-0.12, -0.3], [0.12, -0.3]]) P.legs.push(limb(g, 0.14, 0.42, 0.14, dark, x, 0.42, z));
    const head = new THREE.Mesh(boxGeo(0.38, 0.36, 0.3), headMats('wolf', 0xd8d4cc));
    head.position.set(0, 0.85, 0.55); g.add(head); P.head = head;
    addBox(head, 0.2, 0.15, 0.2, dark, 0, -0.07, 0.22);
    addBox(head, 0.1, 0.12, 0.06, dark, -0.12, 0.23, -0.05); addBox(head, 0.1, 0.12, 0.06, dark, 0.12, 0.23, -0.05);
    const tail = addBox(g, 0.12, 0.12, 0.5, fur, 0, 0.72, -0.62); tail.rotation.x = 0.6; P.tail = tail;
    const collar = addBox(g, 0.44, 0.1, 0.44, lam(0xc8202a), 0, 0.84, 0.32); collar.visible = false; P.collar = collar;
  } else if (type === 'horse') {
    const coat = lam(0x8a5a32), mane = lam(0x3a2412);
    addBox(g, 0.7, 0.7, 1.5, coat, 0, 1.3, 0);
    for (const [x, z] of [[-0.24, 0.58], [0.24, 0.58], [-0.24, -0.58], [0.24, -0.58]]) P.legs.push(limb(g, 0.2, 0.98, 0.2, coat, x, 0.98, z));
    const neck = new THREE.Group(); neck.position.set(0, 1.45, 0.7); neck.rotation.x = -0.6; g.add(neck);
    addBox(neck, 0.32, 0.8, 0.42, coat, 0, 0.35, 0);
    addBox(neck, 0.12, 0.8, 0.12, mane, 0, 0.35, -0.24);
    const head = new THREE.Mesh(boxGeo(0.32, 0.32, 0.65), headMats('horse', 0x8a5a32));
    head.position.set(0, 0.75, 0.22); head.rotation.x = 0.6; neck.add(head); P.head = head;
    addBox(head, 0.08, 0.14, 0.06, coat, -0.1, 0.2, -0.22); addBox(head, 0.08, 0.14, 0.06, coat, 0.1, 0.2, -0.22);
    const tail = addBox(g, 0.14, 0.7, 0.14, mane, 0, 1.15, -0.8); tail.rotation.x = 0.3;
    const saddle = addBox(g, 0.74, 0.12, 0.6, lam(0x5a3a1a), 0, 1.68, -0.05); saddle.visible = false; P.saddle = saddle;
  } else if (type === 'iron_golem') {
    const tex = faceTex('golem_body', 8, px => { noisyFill(px, 8, ['#d6cfc4', '#cbc3b6', '#ddd7cc', '#c4bcae'], 33); px(1, 2, '#4f7a2a', 1, 4); px(6, 4, '#4f7a2a', 1, 3); px(5, 1, '#5e8a32', 2, 1); });
    const body = lam(0xffffff, { map: tex });
    addBox(g, 1.1, 1.0, 0.7, body, 0, 1.85, 0);
    addBox(g, 0.8, 0.45, 0.5, body, 0, 1.15, 0);
    for (const x of [-0.26, 0.26]) P.legs.push(limb(g, 0.42, 0.95, 0.42, body, x, 0.95, 0));
    for (const x of [-0.75, 0.75]) P.arms.push(limb(g, 0.36, 1.75, 0.4, body, x, 2.25, 0));
    const head = new THREE.Mesh(boxGeo(0.55, 0.62, 0.55), headMats('iron_golem', 0xd6cfc4));
    head.position.set(0, 2.6, 0.12); g.add(head); P.head = head;
    addBox(head, 0.14, 0.28, 0.14, lam(0xc4bcae), 0, -0.12, 0.33);
  } else if (type === 'blaze') {
    const head = new THREE.Mesh(boxGeo(0.5, 0.5, 0.5), headMats('blaze', 0xf8c828));
    head.position.set(0, 1.45, 0); g.add(head); P.head = head;
    const rodMat = lam(0xf0a020, { emissive: 0x804000 });
    const ring = new THREE.Group(); g.add(ring); P.ring = ring;
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2, r = i % 2 ? 0.45 : 0.3;
      addBox(ring, 0.12, 0.55, 0.12, rodMat, Math.cos(a) * r, i % 2 ? 0.75 : 0.35, Math.sin(a) * r);
    }
  } else if (type === 'ghast') {
    const body = new THREE.Mesh(boxGeo(3.6, 3.6, 3.6), headMats('ghast', 0xf0f0f0));
    body.position.set(0, 2.3, 0); g.add(body); P.head = body;
    const tm = lam(0xe6e6e6);
    for (let i = 0; i < 9; i++) {
      const L = limb(g, 0.28, 1.4 + (i % 3) * 0.5, 0.28, tm, ((i % 3) - 1) * 1.0, 0.5, (Math.floor(i / 3) - 1) * 1.0);
      P.legs.push(L);
    }
  } else if (type === 'chicken') {
    const white = lam(0xf4f4f4), orange = lam(0xf0a020);
    addBox(g, 0.36, 0.36, 0.5, white, 0, 0.42, 0);
    const head = new THREE.Mesh(boxGeo(0.25, 0.36, 0.2), headMats('chicken', 0xf4f4f4));
    head.position.set(0, 0.72, 0.25); g.add(head); P.head = head;
    addBox(head, 0.2, 0.08, 0.12, orange, 0, -0.02, 0.15);
    for (const x of [-0.08, 0.08]) P.legs.push(limb(g, 0.05, 0.25, 0.05, orange, x, 0.25, 0));
    for (const x of [-0.2, 0.2]) { const w = limb(g, 0.05, 0.25, 0.36, white, x, 0.55, 0, -0.1); P.wings.push(w); }
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return { group: g, parts: P };
}

/* the player a mob should go after: you, or (in multiplayer) whichever player is nearest */
function nearestPlayer(pos) {
  let best = G.player, bd = G.player.dead || G.player.mode !== 'survival' ? Infinity : G.player.pos.distanceTo(pos);
  for (const p of Net.proxies()) {
    if (p.dead || p.mode !== 'survival') continue;
    const d = p.pos.distanceTo(pos);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/* ---------- entity base ---------- */
class Mob {
  constructor(type, x, y, z) {
    const T = MOB_TYPES[type];
    this.type = type; this.T = T;
    this.pos = new V3(x, y, z); this.vel = new V3();
    this.w = T.w; this.h = T.h;
    this.hp = T.hp; this.yaw = Math.random() * Math.PI * 2;
    this.onGround = false; this.hitH = false;
    this.dead = false; this.deathT = 0; this.removed = false;
    this.hurtT = 0; this.attackCd = 0; this.wanderT = 0; this.wanderDir = null;
    this.fleeT = 0; this.angry = false; this.fuse = 0; this.shootCd = 1 + Math.random() * 2;
    this.burnT = 0; this.walk = 0; this.soundT = 3 + Math.random() * 8;
    this.nid = Net.newId(); this.remoteCtl = null;
    this.loveT = 0; this.breedCd = 0; this.baby = false; this.growT = 0;
    const m = buildMobModel(type);
    this.mesh = m.group; this.parts = m.parts;
    this.mats = [];
    this.mesh.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(x => x.clone()) : o.material.clone(); this.mats.push(...[].concat(o.material)); } });
    G.scene.add(this.mesh);
  }

  center() { return tmpV.set(this.pos.x, this.pos.y + this.h / 2, this.pos.z); }

  /* farm animals: find a partner when in love, or follow a player holding food they love; sets this.goal */
  breedTick(dt) {
    if (!BREED_FOOD[this.type]) return false;
    this.loveT -= dt; this.breedCd -= dt;
    if (this.baby) { this.growT -= dt; if (this.growT <= 0) this.growUp(); }
    if (this.loveT > 0) {
      if (Math.random() < dt * 2) G.particles.burst(this.pos.x, this.pos.y + this.h + 0.2, this.pos.z, [0xff3a5a, 0xff8aa0], 1, 0.6, 0.12, -1);
      let mate = null, md = 8;
      for (const m of G.mobs) {
        if (m === this || m.type !== this.type || m.dead || m.remoteCtl || m.baby || !(m.loveT > 0)) continue;
        const d = this.pos.distanceTo(m.pos);
        if (d < md) { md = d; mate = m; }
      }
      if (mate) {
        if (md < 1.3) {
          // a baby is born between them
          const baby = new Mob(this.type, (this.pos.x + mate.pos.x) / 2, Math.max(this.pos.y, mate.pos.y), (this.pos.z + mate.pos.z) / 2);
          baby.makeBaby(); G.mobs.push(baby);
          this.loveT = mate.loveT = 0; this.breedCd = mate.breedCd = 300;
          this.hearts(); mate.hearts();
          if (G.player.pos.distanceTo(this.pos) < 16) G.player.addXp(1 + (Math.random() * 7 | 0));
          return false;
        }
        this.goal = { x: mate.pos.x, z: mate.pos.z };
        return true;
      }
    }
    // follow the closest player holding food this animal loves
    let best = null, bd = 10;
    const P = G.player, held = P.heldSlot();
    if (!P.dead && held && lovesFood(this.type, held.id)) { bd = this.pos.distanceTo(P.pos); best = P.pos; if (bd >= 10) best = null; }
    for (const q of Net.proxies()) {
      if (!lovesFood(this.type, q.held)) continue;
      const d = this.pos.distanceTo(q.pos);
      if (d < bd) { bd = d; best = q.pos; }
    }
    if (!best) return false;
    this.goal = { x: best.x, z: best.z, slow: true, stop: bd < 2.2 };
    return true;
  }

  /* a baby: small, can't breed, grows up after a few minutes */
  makeBaby(grow) {
    this.baby = true; this.growT = grow === undefined ? 240 : grow;
    this.w = this.T.w * 0.6; this.h = this.T.h * 0.6;
    this.mesh.scale.setScalar(0.55);
  }
  growUp() { this.baby = false; this.w = this.T.w; this.h = this.T.h; this.mesh.scale.setScalar(1); }

  /* fed the food it loves: a baby grows faster, a grown-up is ready to make a baby */
  feed() {
    if (this.dead) return false;
    if (this.baby) { this.growT = Math.max(0, this.growT - 30); this.hearts(); return true; }
    if (this.breedCd > 0 || this.loveT > 0) return false;
    this.loveT = 30; this.hearts();
    return true;
  }

  hurt(dmg, from, kb = 7, byPlayer = false) {
    if (this.dead) return;
    if (this.remoteCtl) {
      // another player's device runs this mob: send them the hit, just show the flash here
      if (byPlayer) { Net.mobHit(this, dmg, kb); this.hitByMeAt = Date.now(); }
      this.hurtT = 0.35;
      G.sound.play('hurtMob', this.pos);
      return;
    }
    this.hp -= dmg; this.hurtT = 0.35;
    if (from) {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z, l = Math.hypot(dx, dz) || 1;
      this.vel.x = dx / l * kb; this.vel.z = dz / l * kb; this.vel.y = 5;
    }
    if (this.T.passive) this.fleeT = 4;
    if (byPlayer && (this.T.neutral || this.T.nightOnly)) this.angry = true;
    if (byPlayer && this.type === 'zombified_piglin') for (const m of G.mobs) if (m.type === this.type && m.pos.distanceTo(this.pos) < 20) m.angry = true;
    G.sound.play('hurtMob', this.pos);
    if (this.type === 'enderman' && Math.random() < 0.6 && this.hp > 0) this.teleport();
    if (this.hp <= 0) this.die(byPlayer);
  }

  /* right-click (or tap) on an animal: feed, tame, sit or ride. Returns true if something happened. */
  interact(P, hd) {
    if (this.dead) return false;
    if (this.remoteCtl && (this.type === 'wolf' || this.type === 'horse')) {
      G.ui.message('This animal belongs to the other player\'s game right now. The player who joined the world first can tame and ride animals.');
      return true;
    }
    if (hd && lovesFood(this.type, hd.id)) {
      if (this.remoteCtl) { Net.mobFeed(this); this.hearts(); }
      else if (!this.feed()) { G.ui.message(this.breedCd > 0 ? 'This animal needs a rest before it can have another baby.' : 'This animal is already in love.'); return true; }
      if (P.mode === 'survival') P.inv.takeFrom(P.sel, 1);
      G.sound.play('eat', this.pos);
      return true;
    }
    const meat = hd && ['porkchop', 'cooked_porkchop', 'beef', 'steak', 'chicken', 'cooked_chicken', 'rotten_flesh'].includes(hd.key);
    if (this.type === 'wolf') {
      if (!this.tame && hd && hd.key === 'bone') {
        if (P.mode === 'survival') P.inv.takeFrom(P.sel, 1);
        if (Math.random() < 0.35 || P.mode === 'creative') this.makeTame();
        else G.particles.burst(this.pos.x, this.pos.y + 1, this.pos.z, [0x555555, 0x888888], 8, 1.5, 0.12);
        return true;
      }
      if (this.tame && meat && this.hp < 20) {
        if (P.mode === 'survival') P.inv.takeFrom(P.sel, 1);
        this.hp = Math.min(20, this.hp + 6); this.hearts();
        return true;
      }
      if (this.tame) { this.sitting = !this.sitting; G.ui.message(this.sitting ? 'Your wolf sits and waits.' : 'Your wolf follows you again.'); return true; }
      return false;
    }
    if (this.type === 'horse') {
      if (hd && (hd.key === 'apple' || hd.key === 'golden_apple' || hd.key === 'hay_bale' || hd.key === 'melon_slice')) {
        if (P.mode === 'survival') P.inv.takeFrom(P.sel, 1);
        this.hp = Math.min(30, this.hp + 4);
        this.tameProgress = (this.tameProgress || 0) + 0.35;
        if (this.tameProgress >= 1 && !this.tame) this.makeTame(); else this.hearts();
        return true;
      }
      if (P.riding) return false;
      if (this.tame || P.mode === 'creative') { P.mount(this); return true; }
      // an untamed horse lets you try to ride it, then often throws you off
      this.tameProgress = (this.tameProgress || 0) + 0.25 + Math.random() * 0.2;
      if (this.tameProgress >= 1) { this.makeTame(); P.mount(this); return true; }
      P.vel.set((Math.random() - 0.5) * 6, 6, (Math.random() - 0.5) * 6);
      G.particles.burst(this.pos.x, this.pos.y + 1.6, this.pos.z, [0x555555, 0x888888], 8, 1.5, 0.12);
      G.ui.message('The horse threw you off! Keep trying, or feed it apples.');
      return true;
    }
    return false;
  }

  /* on touch screens a tap on this animal should feed/ride it instead of hitting it */
  wantsInteract(P) {
    const hd = P.heldDef();
    if (this.type === 'horse') return true;
    if (this.type === 'wolf') return this.tame || !!(hd && hd.key === 'bone');
    return false;
  }

  makeTame() {
    this.tame = true; this.angry = false;
    if (this.type === 'wolf') { this.hp = 20; if (this.parts.collar) this.parts.collar.visible = true; G.ui.message('You tamed a wolf! It follows you and fights monsters. Tap it to make it sit.', 'gold'); }
    if (this.type === 'horse') { if (this.parts.saddle) this.parts.saddle.visible = true; G.ui.message('You tamed the horse! Tap it to ride, and press sneak to get off.', 'gold'); }
    this.hearts();
    G.sound.play('levelup', this.pos);
  }

  hearts() { G.particles.burst(this.pos.x, this.pos.y + this.h + 0.2, this.pos.z, [0xff3a5a, 0xff8aa0], 10, 1.5, 0.14, -1); }

  teleport() {
    for (let i = 0; i < 10; i++) {
      const x = this.pos.x + (Math.random() - 0.5) * 24, z = this.pos.z + (Math.random() - 0.5) * 24;
      if (!G.world.isLoaded(x, z)) continue;
      const y = G.world.groundY(x, z) + 1;
      if (G.world.liquidAt(x, y - 1, z)) continue;
      G.particles.burst(this.pos.x, this.pos.y + 1.4, this.pos.z, [0xcc00fa, 0x6a1a8a], 20, 2);
      this.pos.set(x, y, z); this.vel.set(0, 0, 0);
      G.sound.play('teleport', this.pos);
      return;
    }
  }

  die(byPlayer) {
    this.dead = true; this.deathT = 0;
    G.sound.play('deathMob', this.pos);
    if (byPlayer) {
      if (!this.baby) for (const [k, a, b] of this.T.drops) {
        const n = a + Math.floor(Math.random() * (b - a + 1));
        if (n > 0) G.spawnDrop(ID[k], n, this.pos.x, this.pos.y + 0.5, this.pos.z);
      }
      G.player.addXp(this.T.xp);
    }
  }

  update(dt) {
    if (this.remoteCtl) return this.puppetUpdate(dt);
    const W = G.world, P = this.tame ? G.player : nearestPlayer(this.pos);
    if (this.dead) {
      this.deathT += dt;
      this.mesh.rotation.z = Math.min(Math.PI / 2, this.deathT * 5);
      for (const m of this.mats) m.emissive && m.emissive.setRGB(0.6, 0, 0);
      if (this.deathT > 0.7) {
        G.particles.burst(this.pos.x, this.pos.y + this.h / 2, this.pos.z, [0xdddddd, 0xbbbbbb], 12, 1.5);
        this.remove();
      }
      return;
    }
    this.hurtT -= dt; this.attackCd -= dt; this.fleeT -= dt;
    const T = this.T;
    const toP = tmpV2.set(P.pos.x - this.pos.x, P.pos.y - this.pos.y, P.pos.z - this.pos.z);
    const dist = toP.length();
    const night = G.isNight();
    const canTarget = !P.dead && P.mode === 'survival' && dist < (T.ranged === 'ghast' ? 44 : T.fly ? 26 : 18);
    let hostileNow = T.hostile && (!T.nightOnly || night || this.angry) || (T.neutral && this.angry);
    let moveX = 0, moveZ = 0, speed = T.speed;
    const inLiquid = W.liquidAt(this.pos.x, this.pos.y + 0.3, this.pos.z);

    // iron golems guard villages: they chase monsters, and the player too once you hit one
    let golemTarget = null, golemDist = 16;
    if (T.golem) {
      if (this.angry && canTarget) { golemTarget = P; golemDist = dist; }
      else for (const m of G.mobs) {
        if (m === this || m.dead || !m.T.hostile) continue;
        const d = m.pos.distanceTo(this.pos);
        if (d < golemDist) { golemDist = d; golemTarget = m; }
      }
    }
    if (this.rider) {
      // the player is steering this horse
      const dv = this.drive || { x: 0, z: 0 };
      moveX = dv.x; moveZ = dv.z; speed = 8;
      if (dv.yaw !== undefined) this.yaw = dv.yaw;
      if (dv.jump && this.onGround) this.vel.y = 10;
    } else if (this.tame && this.type === 'wolf') {
      // a tamed wolf follows you, teleports back if left behind, and fights whatever you fight
      const tgt = this.petTarget;
      if (tgt && (tgt.dead || tgt.pos.distanceTo(this.pos) > 20)) this.petTarget = null;
      if (this.petTarget && !this.sitting) {
        const t = this.petTarget, dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
        moveX = dx / l; moveZ = dz / l; speed = 4.5; this.yaw = Math.atan2(moveX, moveZ);
        if (l < 1.6 && this.attackCd <= 0) { this.attackCd = 0.8; t.hurt(4, this.pos, 5, false); }
      } else if (!this.sitting && !P.dead) {
        const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, l = Math.hypot(dx, dz);
        if (l > 24) { this.pos.set(P.pos.x + (Math.random() - 0.5) * 2, P.pos.y, P.pos.z + (Math.random() - 0.5) * 2); this.vel.set(0, 0, 0); }
        else if (l > 3) { moveX = dx / l; moveZ = dz / l; speed = l > 8 ? 5 : 3.5; this.yaw = Math.atan2(moveX, moveZ); }
      }
    } else if (golemTarget) {
      const dx = golemTarget.pos.x - this.pos.x, dz = golemTarget.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
      moveX = dx / l; moveZ = dz / l;
      this.yaw = Math.atan2(moveX, moveZ);
      if (golemDist < 2.6 && this.attackCd <= 0) {
        this.attackCd = 1.2; this.swingT = 0.5;
        if (golemTarget === P) { P.hurt(G.mobDmg(T.dmg), this.pos, 10, true, 'An Iron Golem smashed you. Golems only fight you if you hit one first.'); P.vel.y = 9; }
        else { golemTarget.hurt(15, this.pos, 10, false); golemTarget.vel.y = 9; }
        G.sound.play('golem', this.pos);
      }
    } else if (hostileNow && canTarget && !T.golem) {
      const l = Math.hypot(toP.x, toP.z) || 1;
      moveX = toP.x / l; moveZ = toP.z / l;
      this.yaw = Math.atan2(moveX, moveZ);
      if (T.ranged === 'blaze' || T.ranged === 'ghast') {
        const ghast = T.ranged === 'ghast';
        const near = ghast ? 12 : 5, far = ghast ? 26 : 10;
        if (dist < near) { moveX = -moveX; moveZ = -moveZ; } else if (dist < far) { moveX *= 0.15; moveZ *= 0.15; }
        this.shootCd -= dt;
        if (this.shootCd <= 0 && this.canSee(P)) {
          const from = new V3(this.pos.x, this.pos.y + (ghast ? 2.3 : 1.4), this.pos.z);
          const dir = new V3(P.pos.x, P.pos.y + 1.2, P.pos.z).sub(from).normalize();
          if (ghast) {
            this.shootCd = 3 + Math.random() * 2;
            G.spawnProjectile('fireball', from.addScaledVector(dir, 2.4), dir.multiplyScalar(14), this);
            G.sound.play('fireball', this.pos);
          } else {
            this.burst = (this.burst || 0) + 1;
            this.shootCd = this.burst % 3 ? 0.35 : 3;
            dir.x += (Math.random() - 0.5) * 0.08; dir.z += (Math.random() - 0.5) * 0.08;
            G.spawnProjectile('smallfire', from.addScaledVector(dir, 0.6), dir.normalize().multiplyScalar(18), this);
            G.sound.play('fireball', this.pos);
          }
        }
      } else if (T.ranged) {
        if (dist < 6) { moveX = -moveX; moveZ = -moveZ; }
        else if (dist < 12) { moveX = 0; moveZ = 0; }
        this.shootCd -= dt;
        if (this.shootCd <= 0 && dist < 16 && this.canSee(P)) {
          this.shootCd = 1.8 + Math.random();
          const from = new V3(this.pos.x, this.pos.y + 1.5, this.pos.z);
          const to = new V3(P.pos.x, P.pos.y + 1.3, P.pos.z);
          const dir = to.sub(from); const d = dir.length(); dir.normalize();
          dir.y += d * 0.012;
          G.spawnProjectile('arrow', from, dir.normalize().multiplyScalar(24), this);
          G.sound.play('bow', this.pos);
        }
      } else if (T.explode) {
        if (dist < 3) { this.fuse += dt; moveX *= 0.2; moveZ *= 0.2; if (this.fuse > 0 && this.fuse - dt <= 0) G.sound.play('fuse', this.pos); }
        else this.fuse = Math.max(0, this.fuse - dt);
        if (this.fuse > 1.5) { this.removeSilently(); G.explode(this.pos.x, this.pos.y + 0.8, this.pos.z, 3, true, false, null, 'A Creeper blew up next to you.'); return; }
      } else if (dist < 1.4 + this.w / 2 && Math.abs(toP.y) < 1.6 && this.attackCd <= 0) {
        this.attackCd = 1;
        G.lastAttacker = this;
        P.hurt(G.mobDmg(T.dmg), this.pos, 6, false, 'A ' + T.name + ' attacked you.');
      }
    } else {
      this.fuse = Math.max(0, this.fuse - dt);
      if (this.fleeT > 0) {
        const l = Math.hypot(toP.x, toP.z) || 1;
        moveX = -toP.x / l; moveZ = -toP.z / l; speed *= 2;
        if (Math.random() < dt) { const a = (Math.random() - 0.5); const c = Math.cos(a), s = Math.sin(a); const nx = moveX * c - moveZ * s; moveZ = moveX * s + moveZ * c; moveX = nx; }
        this.yaw = Math.atan2(moveX, moveZ);
      } else if (this.breedTick(dt)) {
        const g = this.goal, l = Math.hypot(g.x - this.pos.x, g.z - this.pos.z) || 1;
        moveX = (g.x - this.pos.x) / l; moveZ = (g.z - this.pos.z) / l; speed *= 1.1;
        if (g.stop) { moveX = 0; moveZ = 0; }
        this.yaw = Math.atan2(g.x - this.pos.x, g.z - this.pos.z);
      } else {
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 2 + Math.random() * 5;
          this.wanderDir = Math.random() < 0.55 ? Math.random() * Math.PI * 2 : null;
        }
        if (this.wanderDir !== null) { moveX = Math.sin(this.wanderDir); moveZ = Math.cos(this.wanderDir); speed *= 0.6; this.yaw = this.wanderDir; }
      }
    }

    // burning in daylight
    if (T.burns && G.daylight() > 0.65 && !inLiquid) {
      this.burnT -= dt;
      if (this.burnT <= 0) {
        this.burnT = 1;
        if (W.skyExposed(this.pos.x, this.pos.y + this.h, this.pos.z)) {
          this.hurt(2, null);
          G.particles.burst(this.pos.x, this.pos.y + this.h, this.pos.z, [0xff7a00, 0xffc000, 0x555555], 6, 1.5);
        }
      }
    }
    if (this.type === 'enderman' && inLiquid && Math.random() < dt * 2) this.teleport();

    const accel = this.onGround ? 10 : 2;
    this.vel.x += (moveX * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (moveZ * speed - this.vel.z) * Math.min(1, accel * dt);
    if (T.fly) {
      if (this.homeY === undefined) this.homeY = this.pos.y;
      const engaged = hostileNow && canTarget;
      const wantY = (engaged ? P.pos.y + T.fly : this.homeY) + Math.sin(performance.now() / 700 + this.pos.x) * 0.6;
      this.vel.y += (clamp((wantY - this.pos.y) * 1.2, -3, 3) - this.vel.y) * Math.min(1, dt * 3);
    } else {
      if (inLiquid) { this.vel.y += (inLiquid === ID.lava ? 6 : 14) * dt; this.vel.y *= 0.9; if (this.vel.y > 2.5) this.vel.y = 2.5; }
      this.vel.y -= 25 * dt;
      if (this.vel.y < -40) this.vel.y = -40;
    }
    const wantMove = moveX !== 0 || moveZ !== 0;
    W.moveBody(this, dt);
    if (!T.fly && this.hitH && wantMove && (this.onGround || inLiquid)) this.vel.y = 7.6;
    if (this.parts.ring) this.parts.ring.rotation.y += dt * 3;
    if (inLiquid === ID.lava && !T.fireproof && Math.random() < dt * 2) this.hurt(4, null);
    if (W.touching(this, ID.cactus, 0.05) && Math.random() < dt * 2) this.hurt(1, null);
    if (this.pos.y < -20) this.remove();

    // sounds
    this.soundT -= dt;
    if (this.soundT <= 0) {
      this.soundT = 6 + Math.random() * 10;
      if (dist < 20) G.sound.play('mob_' + this.type, this.pos);
    }

    // animate
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.walk += hs * dt * 4;
    const sw = Math.sin(this.walk) * Math.min(1, hs / 2) * 0.8;
    if (this.type === 'ghast') this.parts.legs.forEach((L, i) => { L.rotation.x = Math.sin(performance.now() / 400 + i * 1.7) * 0.35; L.rotation.z = Math.cos(performance.now() / 500 + i) * 0.2; });
    else if (this.type === 'spider') this.parts.legs.forEach((L, i) => { L.rotation.y = L.userData.baseY + Math.sin(this.walk * 1.5 + i) * 0.3 * Math.min(1, hs); });
    else this.parts.legs.forEach((L, i) => { L.rotation.x = (i % 2 === (i < 2 ? 0 : 1) ? sw : -sw); });
    if (this.type === 'wolf') {
      if (this.parts.tail) this.parts.tail.rotation.y = this.tame ? Math.sin(performance.now() / 120) * 0.5 : 0;
      if (this.sitting) this.parts.legs.forEach((L, i) => { L.rotation.x = i >= 2 ? -1.2 : 0; });
    }
    if (this.type === 'iron_golem') {
      this.swingT = Math.max(0, (this.swingT || 0) - dt);
      const lift = this.swingT > 0 ? -1.6 * Math.sin(this.swingT / 0.5 * Math.PI) : 0;
      this.parts.arms.forEach((a, i) => { a.rotation.x = (i ? sw : -sw) * 0.6 + lift; });
    }
    if (this.type === 'enderman') this.parts.arms.forEach((a, i) => { a.rotation.x = i ? sw : -sw; });
    if (this.type === 'chicken') this.parts.wings.forEach((w, i) => { w.rotation.z = (this.onGround ? 0 : Math.sin(performance.now() / 50) * 0.8) * (i ? 1 : -1); });
    let ry = this.mesh.rotation.y, d = this.yaw - ry;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.mesh.rotation.y = ry + d * Math.min(1, dt * 8);
    this.mesh.position.copy(this.pos);
    const s = (this.fuse > 0 ? 1 + this.fuse * 0.12 : 1) * (this.baby ? 0.55 : 1);
    this.mesh.scale.set(s, s, s);
    const flashFuse = this.fuse > 0 && Math.floor(this.fuse * 8) % 2 === 0;
    for (const m of this.mats) {
      if (!m.emissive) continue;
      if (this.hurtT > 0) m.emissive.setRGB(0.55, 0, 0);
      else if (flashFuse) m.emissive.setRGB(0.6, 0.6, 0.6);
      else if (this.type === 'enderman' && this.angry) m.emissive.setRGB(0.08, 0, 0.12);
      else m.emissive.setRGB(0, 0, 0);
    }
  }

  /* a mob run by another player's device: follow its snapshots smoothly and animate */
  puppetUpdate(dt) {
    if (this.netDead && !this.dead) {
      this.dead = true; this.deathT = 0;
      G.sound.play('deathMob', this.pos);
      if (this.hitByMeAt && Date.now() - this.hitByMeAt < 4000) G.player.addXp(this.T.xp);
    }
    if (this.dead) {
      this.deathT += dt;
      this.mesh.rotation.z = Math.min(Math.PI / 2, this.deathT * 5);
      for (const m of this.mats) m.emissive && m.emissive.setRGB(0.6, 0, 0);
      if (this.deathT > 0.7) { G.particles.burst(this.pos.x, this.pos.y + this.h / 2, this.pos.z, [0xdddddd, 0xbbbbbb], 12, 1.5); this.remove(); }
      return;
    }
    this.hurtT -= dt;
    const s = Net.playback(this);
    if (s) {
      const dx = s[0] - this.pos.x, dz = s[2] - this.pos.z;
      const hs = Math.hypot(dx, dz) / Math.max(dt, 0.001);
      this.pos.set(s[0], s[1], s[2]);
      this.yaw = s[3];
      this.walk += Math.min(hs, 8) * dt * 4;
      const sw = Math.sin(this.walk) * Math.min(1, hs / 2) * 0.8;
      if (this.type !== 'ghast' && this.type !== 'spider') this.parts.legs.forEach((L, i) => { L.rotation.x = (i % 2 === (i < 2 ? 0 : 1) ? sw : -sw); });
    }
    const f = this.netFlags || 0;
    this.tame = !!(f & 2); this.sitting = !!(f & 4);
    const small = !!(f & 32);
    if (small !== this.baby) { if (small) this.makeBaby(9999); else this.growUp(); }
    if (this.parts.collar) this.parts.collar.visible = this.tame;
    if (this.parts.saddle) this.parts.saddle.visible = this.tame && this.type === 'horse';
    if (this.parts.ring) this.parts.ring.rotation.y += dt * 3;
    this.mesh.position.copy(this.pos);
    let d = this.yaw - this.mesh.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.mesh.rotation.y += d * Math.min(1, dt * 10);
    const fuse = f & 8 ? 1 : 0;
    this.mesh.scale.setScalar((fuse ? 1.12 : 1) * (this.baby ? 0.55 : 1));
    const flash = fuse && Math.floor(performance.now() / 120) % 2 === 0;
    for (const m of this.mats) if (m.emissive) {
      if (this.hurtT > 0) m.emissive.setRGB(0.55, 0, 0);
      else if (flash) m.emissive.setRGB(0.6, 0.6, 0.6);
      else m.emissive.setRGB(0, 0, 0);
    }
  }

  canSee(P) {
    const from = new V3(this.pos.x, this.pos.y + this.h * 0.85, this.pos.z);
    const to = new V3(P.pos.x, P.pos.y + 1.5, P.pos.z);
    const dir = to.clone().sub(from); const d = dir.length(); dir.normalize();
    const hit = G.world.raycast(from.x, from.y, from.z, dir.x, dir.y, dir.z, d, false);
    return !hit || !DEFS[hit.id].solid || hit.dist >= d - 0.5;
  }

  removeSilently() { this.dead = true; this.remove(); }
  remove() {
    if (this.removed) return;
    this.removed = true; this.dead = true;
    G.scene.remove(this.mesh);
  }
}

/* ---------- dragons ---------- */
const DRAGON_KINDS = {
  ender: { name: 'Ender Dragon', body: 0x1d1a22, belly: 0x2c2633, wing: 0x2e2838, eye: 0xd36cff, fire: [0xb04aff, 0xe0a0ff, 0x5a1a8a], hp: 200, speed: 1 },
  fire: { name: 'Fire Dragon', body: 0x6e1a12, belly: 0xc8641e, wing: 0x8a2a14, eye: 0xffd040, fire: [0xff6a00, 0xffd000, 0xff2a00], hp: 160, speed: 1.15 },
  ice: { name: 'Ice Dragon', body: 0xbfe3f5, belly: 0x88b8d8, wing: 0xdff2ff, eye: 0x2a7aff, fire: [0x8fd8ff, 0xffffff, 0x3a9aff], hp: 180, speed: 1.05 },
};

class Dragon {
  constructor(kind, center, puppet) {
    const K = DRAGON_KINDS[kind];
    this.kind = kind; this.K = K; this.name = K.name;
    this.center = center.clone();
    this.maxHp = K.hp; this.hp = K.hp;
    this.angle = Math.random() * Math.PI * 2;
    this.pos = new V3(center.x + Math.cos(this.angle) * 50, center.y + 40, center.z + Math.sin(this.angle) * 50);
    this.vel = new V3();
    this.state = 'circle'; this.stateT = 0;
    this.nextAttack = 12; this.fireCd = 5; this.roarT = 2;
    this.dead = false; this.deathT = 0; this.done = false; this.hurtT = 0; this.t = 0;
    this.nid = Net.newId(); this.remoteCtl = null;
    if (puppet) { this.remoteCtl = puppet.remote; this.nid = puppet.nid; this.pos.set(puppet.x, puppet.y, puppet.z); }
    this.build();
    G.scene.add(this.mesh);
  }

  build() {
    const K = this.K;
    const body = lam(K.body), belly = lam(K.belly), wing = lam(K.wing, { side: THREE.DoubleSide }), eye = new THREE.MeshBasicMaterial({ color: K.eye });
    this.mats = [body, belly, wing];
    const g = new THREE.Group(); g.rotation.order = 'YXZ';
    addBox(g, 3, 2.4, 6, body, 0, 0, 0);
    addBox(g, 2.6, 0.4, 5.4, belly, 0, -1.25, 0);
    for (let z = -2.5; z <= 2.5; z += 1.25) addBox(g, 0.3, 0.7, 0.5, belly, 0, 1.5, z);
    let prev = g, nz = 3.6;
    this.neck = [];
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Group(); seg.position.set(0, i === 0 ? 0.4 : 0.25, i === 0 ? nz : 1.3);
      addBox(seg, 1.2, 1.2, 1.4, body, 0, 0, 0.6);
      addBox(seg, 0.25, 0.5, 0.4, belly, 0, 0.75, 0.6);
      prev.add(seg); prev = seg; this.neck.push(seg);
    }
    const head = new THREE.Group(); head.position.set(0, 0.3, 1.6); prev.add(head); this.head = head;
    addBox(head, 2, 1.4, 2.2, body, 0, 0, 1.0);
    addBox(head, 1.4, 0.8, 1.8, body, 0, -0.2, 2.8);
    this.jaw = new THREE.Group(); this.jaw.position.set(0, -0.6, 1.8); head.add(this.jaw);
    addBox(this.jaw, 1.3, 0.35, 1.9, belly, 0, -0.1, 0.9);
    addBox(head, 0.45, 0.3, 0.3, eye, -0.85, 0.3, 1.6);
    addBox(head, 0.45, 0.3, 0.3, eye, 0.85, 0.3, 1.6);
    for (const x of [-0.6, 0.6]) { const h = addBox(head, 0.25, 0.8, 0.25, belly, x, 0.9, 0.2); h.rotation.x = -0.5; }
    addBox(head, 0.2, 0.2, 0.2, belly, -0.4, 0.15, 3.65); addBox(head, 0.2, 0.2, 0.2, belly, 0.4, 0.15, 3.65);
    this.tail = [];
    prev = g;
    for (let i = 0; i < 9; i++) {
      const s = 1 - i * 0.08;
      const seg = new THREE.Group(); seg.position.set(0, 0, i === 0 ? -3 : -1.3);
      addBox(seg, 1.2 * s, 1.2 * s, 1.4, body, 0, 0, -0.65);
      addBox(seg, 0.22, 0.5 * s, 0.4, belly, 0, 0.75 * s, -0.65);
      prev.add(seg); prev = seg; this.tail.push(seg);
    }
    this.wings = [];
    for (const side of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(side * 1.4, 0.8, 1.2);
      addBox(w, 5, 0.35, 0.45, body, side * 2.5, 0, 0);
      addBox(w, 5, 0.08, 4.2, wing, side * 2.5, 0, -2.1);
      const tip = new THREE.Group(); tip.position.set(side * 5, 0, 0); w.add(tip);
      addBox(tip, 4.5, 0.28, 0.35, body, side * 2.25, 0, 0);
      addBox(tip, 4.5, 0.06, 3.6, wing, side * 2.25, 0, -1.8);
      g.add(w); this.wings.push({ w, tip, side });
    }
    for (const [x, z] of [[-1.2, 2], [1.2, 2], [-1.2, -2], [1.2, -2]]) { const l = addBox(g, 0.6, 1.4, 0.6, body, x, -1.6, z); l.rotation.x = 0.6; }
    this.mesh = g;
  }

  hitTest(o, d, maxD) {
    const fwd = { x: Math.sin(this.mesh.rotation.y), z: Math.cos(this.mesh.rotation.y) };
    const boxes = [
      [this.pos.x, this.pos.y, this.pos.z, 3, 2.2, 3.5],
      [this.pos.x + fwd.x * 8, this.pos.y + 1, this.pos.z + fwd.z * 8, 1.8, 1.6, 1.8],
      [this.pos.x + fwd.x * 4.5, this.pos.y + 0.6, this.pos.z + fwd.z * 4.5, 1.2, 1.2, 1.2],
    ];
    let best = null;
    for (const [cx, cy, cz, hx, hy, hz] of boxes) {
      const t = rayAABB(o, d, cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz);
      if (t !== null && t <= maxD && (best === null || t < best)) best = t;
    }
    return best;
  }

  hurt(dmg) {
    if (this.dead) return;
    if (this.remoteCtl) { Net.mobHit(this, dmg, 0); this.hurtT = 0.3; this.hitByMeAt = Date.now(); G.sound.play('dragonHurt', this.pos); return; }
    this.hp -= dmg; this.hurtT = 0.3;
    G.sound.play('dragonHurt', this.pos);
    if (this.state === 'circle' && Math.random() < 0.3) this.nextAttack = Math.min(this.nextAttack, 2);
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.deathT = 0;
      G.sound.play('dragonDeath', this.pos);
      G.ui.message('The ' + this.name + ' has been defeated!', 'gold');
    }
  }

  update(dt) {
    if (this.done) return;
    if (this.remoteCtl && !this.netDead) return this.puppetUpdate(dt);
    if (this.remoteCtl && !this.dead) { this.dead = true; this.deathT = 0; G.sound.play('dragonDeath', this.pos); if (this.hitByMeAt && Date.now() - this.hitByMeAt < 10000) G.player.addXp(60); }
    const P = nearestPlayer(this.pos), W = G.world;
    this.t += dt;
    if (this.dead) {
      this.deathT += dt;
      this.pos.y += dt * 3;
      this.mesh.rotation.y += dt * 2;
      if (Math.random() < 0.7) G.particles.burst(this.pos.x + (Math.random() - 0.5) * 6, this.pos.y + (Math.random() - 0.5) * 3, this.pos.z + (Math.random() - 0.5) * 6, this.K.fire, 6, 4, 0.5);
      for (const m of this.mats) m.emissive.setRGB(0.4 + Math.sin(this.t * 20) * 0.3, 0.3, 0.5);
      this.mesh.position.copy(this.pos);
      if (this.deathT > 4 && this.remoteCtl) { this.remove(); return; } // the host drops the loot for everyone
      if (this.deathT > 4) {
        G.scene.remove(this.mesh);
        this.done = true;
        const gx = P.pos.x, gz = P.pos.z;
        const gy = P.pos.y + 1;
        G.spawnDrop(ID.dragon_egg, 1, gx, gy + 1, gz);
        G.spawnDrop(ID.diamond, 8, gx, gy + 1, gz);
        G.spawnDrop(ID.gold_ingot, 24, gx, gy + 1, gz);
        G.spawnDrop(ID.gold_block, 4, gx, gy + 1, gz);
        G.spawnDrop(ID.emerald, 6, gx, gy + 1, gz);
        G.player.addXp(120);
        G.explode(this.pos.x, this.pos.y, this.pos.z, 4, false, true);
        G.ui.message('The dragon\'s treasure falls at your feet!', 'gold');
        if (G.world.dim === 'end') G.endDragonBeaten();
      }
      return;
    }
    this.hurtT -= dt;
    const pAlive = !P.dead;
    const nether = W.dim === 'nether';
    const groundY = W.dim === 'end' ? Math.max(W.groundY(this.pos.x, this.pos.z), 54) : Math.max(W.groundY(this.pos.x, this.pos.z), nether ? 31 : SEA);
    const ceil = nether ? 70 : WH + 40;
    let target, speed = 15 * this.K.speed;
    const toP = tmpV2.set(P.pos.x - this.pos.x, P.pos.y + 1 - this.pos.y, P.pos.z - this.pos.z);
    const dP = toP.length();
    if (W.dim === 'end') this.center.set(0, 54, 0); // the dragon guards the island
    else {
      if (Math.hypot(P.pos.x - this.center.x, P.pos.z - this.center.z) > 140) this.center.lerp(new V3(P.pos.x, 0, P.pos.z), 0.002);
      this.center.y = Math.max(W.groundY(this.center.x, this.center.z), nether ? 31 : SEA);
    }

    if (this.state === 'circle') {
      this.angle += dt * 0.28 * this.K.speed;
      const R = 42;
      target = new V3(this.center.x + Math.cos(this.angle) * R, Math.min(ceil - 4, Math.max(groundY + 18, this.center.y + 28)), this.center.z + Math.sin(this.angle) * R);
      this.nextAttack -= dt;
      this.fireCd -= dt;
      const huntable = pAlive && P.mode === 'survival' && dP < 110;
      if (this.nextAttack <= 0 && huntable) { this.state = 'dive'; this.stateT = 0; G.sound.play('dragonRoar', this.pos); }
      if (this.fireCd <= 0 && huntable && dP < 75) {
        this.fireCd = 3.5 + Math.random() * 3;
        const fwd = new V3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
        const from = this.pos.clone().addScaledVector(fwd, 9);
        const dir = new V3(P.pos.x, P.pos.y + 1, P.pos.z).sub(from).normalize();
        G.spawnProjectile('fireball', from, dir.multiplyScalar(17), this);
        G.sound.play('fireball', this.pos);
        this.jawOpen = 0.6;
      }
    } else if (this.state === 'dive') {
      this.stateT += dt;
      speed = 21 * this.K.speed;
      target = new V3(P.pos.x, P.pos.y + 1.5, P.pos.z);
      if (dP < 5 || this.stateT > 6 || !pAlive || P.mode !== 'survival') {
        if (dP < 6.5 && pAlive) P.hurt(G.mobDmg(5), this.pos, 14, false, 'The ' + this.name + ' swooped down on you.');
        this.state = 'climb'; this.stateT = 0; this.nextAttack = 10 + Math.random() * 8;
      }
    } else {
      this.stateT += dt;
      const fwd = this.vel.clone().setY(0);
      if (fwd.lengthSq() < 0.01) fwd.set(1, 0, 0);
      fwd.normalize();
      target = this.pos.clone().addScaledVector(fwd, 20); target.y = Math.min(ceil - 4, groundY + 30);
      if (this.stateT > 3) this.state = 'circle';
    }
    const desired = target.sub(this.pos).normalize().multiplyScalar(speed);
    this.vel.lerp(desired, Math.min(1, dt * 1.6));
    this.pos.addScaledVector(this.vel, dt);
    const minY = groundY + (this.state === 'dive' ? 2 : 6);
    if (this.pos.y < minY) { this.pos.y = minY; if (this.vel.y < 0) this.vel.y = 0; }
    if (this.pos.y > ceil) { this.pos.y = ceil; if (this.vel.y > 0) this.vel.y = 0; }

    // orientation & animation
    const yaw = Math.atan2(this.vel.x, this.vel.z);
    let d = yaw - this.mesh.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.mesh.rotation.y += d * Math.min(1, dt * 3);
    const hv = Math.hypot(this.vel.x, this.vel.z);
    this.mesh.rotation.x = -Math.atan2(this.vel.y, hv) * 0.6;
    this.mesh.rotation.z = -d * 0.8;
    const flap = Math.sin(this.t * (this.state === 'dive' ? 3 : 4.5));
    for (const { w, tip, side } of this.wings) { w.rotation.z = flap * 0.55 * side; tip.rotation.z = flap * 0.4 * side; }
    this.tail.forEach((s, i) => { s.rotation.y = Math.sin(this.t * 2 - i * 0.6) * 0.12; s.rotation.x = Math.sin(this.t * 1.5 - i * 0.5) * 0.05; });
    this.neck.forEach((s, i) => { s.rotation.x = Math.sin(this.t * 1.3 + i) * 0.06 - (i === 0 ? 0.1 : 0); });
    this.jawOpen = Math.max(0, (this.jawOpen || 0) - dt);
    this.jaw.rotation.x = 0.1 + (this.jawOpen > 0 ? 0.5 : 0) + (this.state === 'dive' ? 0.45 : 0);
    for (const m of this.mats) m.emissive.setRGB(this.hurtT > 0 ? 0.6 : 0, 0, 0);
    this.mesh.position.copy(this.pos);
    this.roarT -= dt;
    if (this.roarT <= 0) { this.roarT = 14 + Math.random() * 12; if (dP < 120) G.sound.play('dragonRoar', this.pos); }
  }

  remove() { G.scene.remove(this.mesh); this.done = true; }

  /* a dragon flown by another player's device: follow its snapshots and flap */
  puppetUpdate(dt) {
    this.t += dt; this.hurtT -= dt;
    const s = Net.playback(this);
    if (s) {
      const v = new V3(s[0] - this.pos.x, s[1] - this.pos.y, s[2] - this.pos.z);
      this.pos.set(s[0], s[1], s[2]);
      this.mesh.rotation.y = s[3];
      const hv = Math.hypot(v.x, v.z);
      if (hv > 0.001) this.mesh.rotation.x = -Math.atan2(v.y, hv) * 0.6;
    }
    const flap = Math.sin(this.t * 4.5);
    for (const { w, tip, side } of this.wings) { w.rotation.z = flap * 0.55 * side; tip.rotation.z = flap * 0.4 * side; }
    this.tail.forEach((sg, i) => { sg.rotation.y = Math.sin(this.t * 2 - i * 0.6) * 0.12; });
    for (const m of this.mats) m.emissive.setRGB(this.hurtT > 0 ? 0.6 : 0, 0, 0);
    this.mesh.position.copy(this.pos);
  }
}

function rayAABB(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity;
  const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z], A = [x0, y0, z0], B = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(D[i]) < 1e-9) { if (O[i] < A[i] || O[i] > B[i]) return null; continue; }
    let t1 = (A[i] - O[i]) / D[i], t2 = (B[i] - O[i]) / D[i];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return Math.max(0, tmin);
}

/* ---------- projectiles ---------- */
const PROJ_GEO = {
  arrow: new THREE.BoxGeometry(0.06, 0.06, 0.6),
  fireball: new THREE.BoxGeometry(0.8, 0.8, 0.8),
  ender_pearl: new THREE.BoxGeometry(0.25, 0.25, 0.25),
  smallfire: new THREE.BoxGeometry(0.3, 0.3, 0.3),
};
const MOB_FIRE = [0xff6a00, 0xffc000, 0x5a5a5a];
class Projectile {
  constructor(kind, pos, vel, owner) {
    this.kind = kind; this.pos = pos.clone(); this.vel = vel.clone(); this.owner = owner;
    this.life = kind === 'fireball' ? 8 : 12; this.stuck = false; this.done = false;
    let mat;
    if (kind === 'arrow') mat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
    else if (kind === 'fireball' || kind === 'smallfire') { this.colors = owner && owner.K ? owner.K.fire : MOB_FIRE; mat = new THREE.MeshBasicMaterial({ color: this.colors[0] }); }
    else mat = new THREE.MeshLambertMaterial({ color: 0x1d6b5c, emissive: 0x0a3a30 });
    this.mesh = new THREE.Mesh(PROJ_GEO[kind], mat);
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) return this.finish();
    if (this.stuck) return;
    const grav = this.kind === 'fireball' || this.kind === 'smallfire' ? 0 : this.kind === 'arrow' ? 12 : 16;
    this.vel.y -= grav * dt;
    const step = this.vel.length() * dt;
    const dir = tmpV.copy(this.vel).normalize();
    // entity hits
    const fromPlayer = this.owner === G.player;
    if (fromPlayer) {
      let best = null, bestT = step + 0.3;
      for (const m of G.mobs) {
        if (m.dead) continue;
        const t = rayAABB(this.pos, dir, m.pos.x - m.w / 2 - 0.1, m.pos.y, m.pos.z - m.w / 2 - 0.1, m.pos.x + m.w / 2 + 0.1, m.pos.y + m.h, m.pos.z + m.w / 2 + 0.1);
        if (t !== null && t < bestT) { best = m; bestT = t; }
      }
      for (const dr of G.dragons) {
        if (dr.dead) continue;
        const t = dr.hitTest(this.pos, dir, step + 0.5);
        if (t !== null && t < bestT) { best = dr; bestT = t; }
      }
      if (best && this.kind === 'arrow') {
        const dmg = Math.max(2, Math.round(this.vel.length() / 5));
        if (best instanceof Dragon) best.hurt(dmg); else best.hurt(dmg, this.pos, 4, true);
        return this.finish();
      }
    } else for (const P of [G.player, ...Net.proxies()]) {
      if (P.dead) continue;
      const t = rayAABB(this.pos, dir, P.pos.x - 0.4, P.pos.y, P.pos.z - 0.4, P.pos.x + 0.4, P.pos.y + 1.8, P.pos.z + 0.4);
      if (t !== null && t < step + 0.2) {
        if (this.kind === 'fireball') { this.pos.addScaledVector(dir, t); return this.explodeHere(); }
        P.hurt(G.mobDmg(this.kind === 'arrow' ? 3 : this.kind === 'smallfire' ? 4 : 2), this.pos, 4, false, this.kind === 'arrow' ? 'You were shot by an arrow.' : this.kind === 'smallfire' ? 'A Blaze fireball hit you.' : 'You were hit.');
        if (this.kind === 'smallfire' && P.mode === 'survival') P.fire = Math.max(P.fire, 3);
        return this.finish();
      }
    }
    const hit = G.world.raycast(this.pos.x, this.pos.y, this.pos.z, dir.x, dir.y, dir.z, step, this.kind === 'fireball');
    if (hit && (DEFS[hit.id].solid || DEFS[hit.id].liquid)) {
      this.pos.addScaledVector(dir, Math.max(0, hit.dist - 0.05));
      if (this.kind === 'fireball') return this.explodeHere();
      if (this.kind === 'smallfire') { G.particles.burst(this.pos.x, this.pos.y, this.pos.z, this.colors, 5, 1.5, 0.15); return this.finish(); }
      if (this.kind === 'ender_pearl') {
        const P = G.player;
        G.particles.burst(P.pos.x, P.pos.y + 1, P.pos.z, [0xcc00fa, 0x1d6b5c], 15, 2);
        P.pos.set(hit.x + 0.5 + hit.nx, hit.ny === 1 ? hit.y + 1 : hit.ny === -1 ? hit.y - 1.8 : hit.y, hit.z + 0.5 + hit.nz);
        P.vel.set(0, 0, 0);
        P.hurt(2, null, 0, true, 'The ender pearl teleport hurt you.');
        G.sound.play('teleport', P.pos);
        return this.finish();
      }
      this.stuck = true; this.life = Math.min(this.life, 4);
      this.mesh.position.copy(this.pos);
      return;
    }
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.lookAt(tmpV2.copy(this.pos).add(this.vel));
    if (this.kind === 'fireball' || this.kind === 'smallfire') {
      this.mesh.rotation.z += dt * 5;
      if (Math.random() < 0.8) G.particles.burst(this.pos.x, this.pos.y, this.pos.z, this.colors, 1, 0.5, 0.4, 0);
    }
  }

  explodeHere() {
    G.explode(this.pos.x, this.pos.y, this.pos.z, 1.6, false, false, this.colors, this.owner && this.owner.name ? 'A fireball from the ' + this.owner.name + ' hit you.' : 'A Ghast fireball hit you.');
    return this.finish();
  }

  finish() { this.done = true; G.scene.remove(this.mesh); }
}

/* ---------- dropped items ---------- */
const ITEM_GEO = new Map();
function itemGeometry(id) {
  if (ITEM_GEO.has(id)) return ITEM_GEO.get(id);
  const def = DEFS[id];
  const g = new THREE.BufferGeometry();
  const pos = [], uv = [], col = [], idx = [];
  // one box: corner (x0,y0,z0), size (sx,sy,sz); sides of short boxes show the bottom of their picture
  const box = (d, x0, y0, z0, sx, sy, sz) => {
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], U = TILE_UV[d.faces[f]], b = pos.length / 3;
      const vTop = sy < 1 && f !== 2 && f !== 3 ? U[1] + (U[3] - U[1]) * sy : U[3];
      for (let k = 0; k < 4; k++) {
        const c = F.c[k];
        pos.push(x0 + c[0] * sx, y0 + c[1] * sy, z0 + c[2] * sz);
        uv.push(FACE_UV[k][0] ? U[2] : U[0], FACE_UV[k][1] ? vTop : U[1]);
        const br = d.light ? 1.1 : F.shade;
        col.push(br, br, br);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  };
  if (def.key === 'bed' || def.key === 'bed_head') {
    // a real two-block bed: foot in front, head with the pillow behind
    const h = def.height;
    box(DEFS[ID.bed], -0.5, -h / 2, 0, 1, h, 1);
    box(DEFS[ID.bed_head], -0.5, -h / 2, -1, 1, h, 1);
  } else if (def.isBlock && !def.cross) {
    box(def, -0.5, -0.5, -0.5, 1, 1, 1);
  } else {
    const U = TILE_UV[tileOf(id)];
    pos.push(-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0);
    uv.push(U[0], U[1], U[2], U[1], U[2], U[3], U[0], U[3]);
    for (let k = 0; k < 4; k++) col.push(1, 1, 1);
    idx.push(0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.userData.flat = !(def.isBlock && !def.cross);
  ITEM_GEO.set(id, g);
  return g;
}

class ItemDrop {
  constructor(id, count, x, y, z, vel, did) {
    this.id = id; this.count = count; this.did = did;
    this.pos = new V3(x, y, z);
    this.vel = vel ? vel.clone() : new V3((Math.random() - 0.5) * 3, 4 + Math.random() * 2, (Math.random() - 0.5) * 3);
    this.w = 0.3; this.h = 0.3; this.age = 0; this.done = false; this.pickDelay = 0.6;
    const geo = itemGeometry(id);
    this.mesh = new THREE.Mesh(geo, G.mats.item);
    const s = geo.userData.flat ? 0.45 : 0.3;
    this.mesh.scale.set(s, s, s);
    G.scene.add(this.mesh);
  }
  update(dt) {
    // far away where the ground isn't loaded: wait there instead of falling out of the world
    if (!G.world.isLoaded(this.pos.x, this.pos.z)) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    this.age += dt;
    const liquid = G.world.liquidAt(this.pos.x, this.pos.y + 0.1, this.pos.z);
    if (liquid) { this.vel.y += 20 * dt; this.vel.multiplyScalar(0.9); }
    this.vel.y -= 18 * dt;
    if (this.onGround) { this.vel.x *= 0.85; this.vel.z *= 0.85; }
    G.world.moveBody(this, dt);
    if (G.world.collides(this.pos.x, this.pos.y, this.pos.z, this.w, this.h)) this.pos.y += 4 * dt;
    this.mesh.position.set(this.pos.x, this.pos.y + 0.25 + Math.sin(this.age * 3) * 0.06, this.pos.z);
    this.mesh.rotation.y = this.age * 1.6;
    const P = G.player;
    if (!P.dead && this.age > this.pickDelay) {
      const dx = P.pos.x - this.pos.x, dy = (P.pos.y + 0.8) - this.pos.y, dz = P.pos.z - this.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1.6) {
        // an item another player's game dropped: ask them for it, so two players can't both get it
        if (this.owner && Net.ownerHere(this.owner)) {
          if (!this.askedAt || performance.now() - this.askedAt > 2500) { this.askedAt = performance.now(); Net.askForDrop(this); }
        } else {
          const left = P.inv.add(this.id, this.count);
          if (left < this.count) G.sound.play('pickup');
          this.count = left;
          if (left === 0) { Net.dropPicked(this.did); return this.finish(); }
        }
      } else if (d < 3) {
        this.pos.x += dx / d * dt * 6; this.pos.z += dz / d * dt * 6;
      }
    }
    if (this.age > 300 || this.pos.y < -20) this.finish();
  }
  finish() { this.done = true; G.scene.remove(this.mesh); }
}

/* ---------- a thrown Eye of Ender: floats off toward the nearest stronghold ---------- */
class EyeOfEnder {
  constructor(from, target) {
    this.pos = from.clone(); this.done = false; this.t = 0;
    const dx = target.x - from.x, dz = target.z - from.z, d = Math.hypot(dx, dz) || 1;
    this.below = d < 14; // standing right above it: the eye sinks into the ground
    this.dir = new V3(dx / d, 0, dz / d);
    this.mesh = new THREE.Mesh(itemGeometry(ID.eye_of_ender), G.mats.item);
    this.mesh.scale.setScalar(0.35);
    G.scene.add(this.mesh);
    G.sound.play('bow', this.pos);
  }
  update(dt) {
    this.t += dt;
    if (this.below) { this.pos.y += (this.t < 0.6 ? 2 : -3) * dt; }
    else if (this.t < 2.2) { this.pos.addScaledVector(this.dir, 9 * dt); this.pos.y += 2.2 * dt; }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y += dt * 4;
    if (Math.random() < dt * 20) G.particles.burst(this.pos.x, this.pos.y, this.pos.z, [0x9a4ad8, 0x46c98a], 1, 0.3, 0.06);
    if (this.t > 3) {
      this.done = true; G.scene.remove(this.mesh);
      // like Minecraft, eyes sometimes break
      if (Math.random() < 0.2) { G.particles.burst(this.pos.x, this.pos.y, this.pos.z, [0x46c98a, 0x2a8a5a], 14, 2, 0.1); G.sound.play('break', this.pos); G.ui.message('The Eye of Ender broke.', 'purple'); }
      else G.spawnDrop(ID.eye_of_ender, 1, this.pos.x, this.pos.y, this.pos.z, new V3(0, 0, 0));
    }
  }
}

/* ---------- primed TNT ---------- */
class PrimedTNT {
  constructor(x, y, z, fuse) {
    this.pos = new V3(x, y, z); this.vel = new V3((Math.random() - 0.5) * 2, 4, (Math.random() - 0.5) * 2);
    this.w = 0.96; this.h = 0.96; this.fuse = fuse; this.done = false;
    this.mesh = new THREE.Mesh(itemGeometry(ID.tnt), G.mats.item);
    this.white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    G.scene.add(this.mesh);
    G.sound.play('fuse', this.pos);
  }
  update(dt) {
    this.fuse -= dt;
    this.vel.y -= 20 * dt;
    if (this.onGround) { this.vel.x *= 0.8; this.vel.z *= 0.8; }
    G.world.moveBody(this, dt);
    this.mesh.position.set(this.pos.x, this.pos.y + 0.48, this.pos.z);
    const flash = Math.floor(this.fuse * 6) % 2 === 0;
    this.mesh.material = flash ? this.white : G.mats.item;
    const s = 1 + Math.max(0, 0.6 - this.fuse) * 0.25;
    this.mesh.scale.set(s, s, s);
    if (Math.random() < 0.5) G.particles.burst(this.pos.x, this.pos.y + 1.1, this.pos.z, [0x777777, 0xaaaaaa], 1, 0.6, 0.3, -2);
    if (this.fuse <= 0) {
      this.done = true; G.scene.remove(this.mesh);
      G.explode(this.pos.x, this.pos.y + 0.5, this.pos.z, 4, true, false, null, 'TNT exploded next to you.');
    }
  }
}

/* ---------- particles ---------- */
class Particles {
  constructor(scene) {
    this.scene = scene; this.list = []; this.geo = new THREE.BoxGeometry(1, 1, 1); this.mats = new Map();
  }
  mat(color) {
    if (!this.mats.has(color)) this.mats.set(color, new THREE.MeshBasicMaterial({ color }));
    return this.mats.get(color);
  }
  spawn(x, y, z, color, vx, vy, vz, size, life, grav) {
    if (this.list.length > 500) return;
    const m = new THREE.Mesh(this.geo, this.mat(color));
    m.position.set(x, y, z);
    m.scale.setScalar(size);
    this.scene.add(m);
    this.list.push({ m, vx, vy, vz, life, max: life, grav, size });
  }
  burst(x, y, z, colors, n, speed = 3, size = 0.15, grav = 10) {
    for (let i = 0; i < n; i++) {
      const c = colors[(Math.random() * colors.length) | 0];
      this.spawn(x, y, z, c, (Math.random() - 0.5) * speed * 2, Math.random() * speed * 1.2, (Math.random() - 0.5) * speed * 2, size * (0.6 + Math.random() * 0.8), 0.5 + Math.random() * 0.6, grav);
    }
  }
  blockBreak(x, y, z, id) {
    const c = DEFS[id].color;
    const cols = [0.75, 0.9, 1.05].map(f => (clamp(c[0] * f | 0, 0, 255) << 16) | (clamp(c[1] * f | 0, 0, 255) << 8) | clamp(c[2] * f | 0, 0, 255));
    for (let i = 0; i < 14; i++) this.spawn(x + Math.random(), y + Math.random(), z + Math.random(), cols[i % 3], (Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4, 0.1 + Math.random() * 0.08, 0.5 + Math.random() * 0.4, 14);
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.m); this.list.splice(i, 1); continue; }
      p.vy -= p.grav * dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.scale.setScalar(p.size * Math.min(1, p.life / p.max * 1.5));
    }
  }
}
