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
/* what a player holds: shown in the right hand of their character (other players see it too) */
function setHeldItem(model, id) {
  if (!model || model.heldId === id) return;
  model.heldId = id;
  const arm = model.parts.arms[1];
  if (model.heldMesh) { arm.remove(model.heldMesh); model.heldMesh = null; }
  if (!id || !DEFS[id]) return;
  const geo = itemGeometry(id), m = new THREE.Mesh(geo, G.mats.item), flat = geo.userData.flat;
  if (flat) { m.scale.setScalar(0.8); m.position.set(0.04, -0.66, 0.3); m.rotation.set(-0.5, -Math.PI / 2 + 0.6, 0); }
  else { m.scale.setScalar(0.3); m.position.set(0, -0.72, 0.1); }
  arm.add(m); model.heldMesh = m;
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
  panda: px => { px(0, 0, '#f2f2f2', 8, 8); px(0, 0, '#1a1a1a', 2, 1); px(6, 0, '#1a1a1a', 2, 1); px(1, 2, '#1a1a1a', 2, 3); px(5, 2, '#1a1a1a', 2, 3); px(2, 3, '#ffffff', 1, 1); px(5, 3, '#ffffff', 1, 1); px(3, 5, '#1a1a1a', 2, 1); px(3, 6, '#9a9a9a', 2, 1); },
  wither: px => { px(0, 0, '#1e1e1e', 8, 8); px(1, 2, '#e8e8e8', 2, 2); px(5, 2, '#e8e8e8', 2, 2); px(2, 3, '#101010', 1, 1); px(5, 3, '#101010', 1, 1); px(2, 6, '#3a3a3a', 4, 1); px(2, 5, '#0a0a0a', 4, 1); },
  cat: px => { px(0, 0, '#e0902a', 8, 8); px(0, 0, '#c8701a', 8, 2); px(1, 3, '#7ad83a', 2, 1); px(5, 3, '#7ad83a', 2, 1); px(2, 3, '#111', 1, 1); px(5, 3, '#111', 1, 1); px(3, 5, '#f0c8a0', 2, 2); px(3, 5, '#d86a8a', 2, 1); },
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
  pillager: px => { px(0, 0, '#9a9a9a', 8, 8); px(0, 0, '#3a3a3a', 8, 2); px(1, 2, '#1a1a1a', 2, 1); px(5, 2, '#1a1a1a', 2, 1); px(1, 3, '#e8e8e8', 1, 1); px(2, 3, '#4a6a8a', 1, 1); px(5, 3, '#4a6a8a', 1, 1); px(6, 3, '#e8e8e8', 1, 1); px(3, 4, '#7a7a7a', 2, 2); px(2, 6, '#5a5a5a', 4, 1); },
  donkey: px => { px(0, 0, '#7d7468', 8, 8); px(1, 2, '#1a1a1a', 1, 1); px(6, 2, '#1a1a1a', 1, 1); px(2, 5, '#a89e90', 4, 3); px(3, 6, '#3a342c', 2, 1); },
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
const ARMOR_COLORS = { turtle: 0x4a9a3a, leather: 0x8a4f2a, golden: 0xf5cc2e, iron: 0xdcdcdc, diamond: 0x5decf5, netherite: 0x4a4446 };
const armorMats = {};
/* enchanted armor shimmers purple (the glow pulses: see GLINT_MATS in the game loop) */
const GLINT_MATS = [];
function armorMat(id, shiny) {
  const def = DEFS[id], k = def ? def.key.split('_')[0] : 'iron', key = k + (shiny ? '_e' : '');
  if (!armorMats[key]) { armorMats[key] = lam(ARMOR_COLORS[k] || 0xdcdcdc, shiny ? { emissive: 0x7a3ad8 } : undefined); if (shiny) GLINT_MATS.push(armorMats[key]); }
  return armorMats[key];
}
/* ids: [helmet, chestplate, leggings, boots], 0 or an item id each; ench: which of them are enchanted (bits 1, 2, 4, 8) */
function dressModel(m, ids, ench) {
  ench = ench || 0;
  const sig = ids.join(',') + '|' + ench;
  if (m.armorSig === sig) return;
  m.armorSig = sig;
  for (const o of m.armorParts || []) if (o.parent) o.parent.remove(o);
  m.armorParts = [];
  const P = m.parts, g = m.group;
  const add = (parent, w, h, d, mt, x, y, z) => m.armorParts.push(addBox(parent, w, h, d, mt, x, y, z));
  const ok = (id, slot) => id && DEFS[id] && DEFS[id].armor && DEFS[id].armor.slot === slot;
  const [helmet, chest, legs, boots] = ids;
  if (ok(helmet, 0)) {
    const M = armorMat(helmet, ench & 1);
    add(P.head, 0.6, 0.18, 0.6, M, 0, 0.22, 0);            // top
    add(P.head, 0.6, 0.42, 0.07, M, 0, 0.02, -0.27);       // back
    add(P.head, 0.07, 0.42, 0.6, M, -0.27, 0.02, 0);       // sides
    add(P.head, 0.07, 0.42, 0.6, M, 0.27, 0.02, 0);
    add(P.head, 0.6, 0.09, 0.07, M, 0, 0.12, 0.27);        // brow above the face
  }
  if (ok(chest, 1)) {
    const M = armorMat(chest, ench & 2);
    add(g, 0.58, 0.64, 0.33, M, 0, 1.17, 0);
    for (const a of P.arms) add(a, 0.31, 0.34, 0.31, M, 0, -0.13, 0);
  }
  if (ok(legs, 2)) {
    const M = armorMat(legs, ench & 4);
    add(g, 0.56, 0.2, 0.31, M, 0, 0.86, 0);
    for (const l of P.legs) add(l, 0.3, 0.5, 0.3, M, 0, -0.25, 0);
  }
  if (ok(boots, 3)) {
    const M = armorMat(boots, ench & 8);
    for (const l of P.legs) add(l, 0.31, 0.22, 0.33, M, 0, -0.65, 0.01);
  }
}

/* what each farm animal loves: holding it makes them follow you, feeding two of them makes a baby */
const BREED_FOOD = { panda: ['bamboo'], cow: ['wheat'], sheep: ['wheat'], pig: ['carrot', 'potato', 'apple'], chicken: ['wheat_seeds'] };
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
  horse: { name: 'Horse', hp: 22, w: 1.3, h: 1.6, speed: 2.2, passive: true, rideable: true, horsey: true, xp: 1, drops: [['leather', 0, 2]] },
  donkey: { name: 'Donkey', hp: 20, w: 1.1, h: 1.4, speed: 1.9, passive: true, rideable: true, horsey: true, xp: 1, drops: [['leather', 0, 2]] },
  boat: { name: 'Boat', hp: 4, w: 1.3, h: 0.55, speed: 0, boat: true, xp: 0, drops: [['boat', 1, 1]] },
  pillager: { name: 'Pillager', hp: 24, w: 0.6, h: 1.95, speed: 2.6, hostile: true, ranged: true, dmg: 4, xp: 5, drops: [['arrow', 0, 2], ['emerald', 0, 1]] },
  villager: { name: 'Villager', hp: 20, w: 0.6, h: 1.95, speed: 1.2, passive: true, xp: 0, drops: [] },
  pig: { name: 'Pig', hp: 10, w: 0.9, h: 0.9, speed: 1.5, passive: true, xp: 2, drops: [['porkchop', 1, 3]] },
  cow: { name: 'Cow', hp: 10, w: 0.9, h: 1.4, speed: 1.4, passive: true, xp: 2, drops: [['beef', 1, 3], ['leather', 0, 2]] },
  sheep: { name: 'Sheep', hp: 8, w: 0.9, h: 1.3, speed: 1.4, passive: true, xp: 2, drops: [['wool_white', 1, 2]] },
  panda: { name: 'Panda', hp: 20, w: 1.2, h: 1.25, speed: 1.1, passive: true, xp: 2, drops: [['bamboo', 0, 2]] },
  wither: { name: 'Wither', hp: 300, w: 1.0, h: 3.0, speed: 2.6, hostile: true, fly: 7, ranged: 'wither', boss: true, xp: 50, fireproof: true, drops: [['nether_star', 1, 1]] },
  cat: { name: 'Cat', hp: 10, w: 0.5, h: 0.6, speed: 2.6, passive: true, xp: 1, drops: [], tameWith: 'cod' },
  chicken: { name: 'Chicken', hp: 4, w: 0.45, h: 0.7, speed: 1.6, passive: true, xp: 1, drops: [['chicken', 1, 1], ['feather', 0, 2]] },
};

/* ---------- more of Minecraft's mobs, made from a short recipe each ----------
   body [w, h, d] at height by; legs: how many and how long; a head with a face; extra boxes for ears, tails,
   wings, stripes... Bodies without legs swim or fly. */
const MORE_MOBS = {
  // land animals
  bee: { T: { name: 'Bee', hp: 10, w: 0.6, h: 0.5, speed: 2.6, neutral: true, dmg: 2, fly: 1, xp: 1, drops: [] },
    M: { body: [0.42, 0.4, 0.6], by: 0.3, col: 0xf0c020, legs: 0, head: [0.3, 0.3, 0.2], hy: 0.32, hz: 0.38, x: [[0.44, 0.1, 0.62, 0x2a2a1a, 0, 0.32, -0.05], [0.44, 0.1, 0.62, 0x2a2a1a, 0, 0.32, 0.12], [0.3, 0.02, 0.25, 0xd8f0ff, -0.18, 0.52, 0], [0.3, 0.02, 0.25, 0xd8f0ff, 0.18, 0.52, 0], [0.05, 0.05, 0.12, 0x2a2a1a, 0, 0.3, -0.36]], eye: '#222' } },
  fox: { T: { name: 'Fox', hp: 10, pet: true, w: 0.6, h: 0.7, speed: 3.2, passive: true, xp: 1, drops: [] },
    M: { body: [0.4, 0.38, 0.7], by: 0.45, col: 0xe07a2a, leg: [0.12, 0.3], legCol: 0x2a1a10, head: [0.42, 0.36, 0.34], hy: 0.62, hz: 0.48, x: [[0.1, 0.14, 0.06, 0xe07a2a, -0.14, 0.86, 0.45], [0.1, 0.14, 0.06, 0xe07a2a, 0.14, 0.86, 0.45], [0.2, 0.12, 0.14, 0xf4f0e8, 0, 0.55, 0.7], [0.22, 0.22, 0.55, 0xe07a2a, 0, 0.5, -0.55], [0.22, 0.22, 0.12, 0xf4f0e8, 0, 0.5, -0.86]], eye: '#222' } },
  rabbit: { T: { name: 'Rabbit', hp: 3, w: 0.4, h: 0.5, speed: 3.4, passive: true, xp: 1, drops: [['rabbit', 0, 1], ['leather', 0, 1]] },
    M: { body: [0.3, 0.28, 0.42], by: 0.24, col: 0x9a7a5a, leg: [0.08, 0.12], head: [0.26, 0.24, 0.24], hy: 0.42, hz: 0.24, x: [[0.06, 0.24, 0.04, 0x9a7a5a, -0.07, 0.64, 0.22], [0.06, 0.24, 0.04, 0x9a7a5a, 0.07, 0.64, 0.22], [0.12, 0.12, 0.1, 0xf4f0e8, 0, 0.28, -0.26]], eye: '#222' } },
  goat: { T: { name: 'Goat', hp: 10, w: 0.9, h: 1.3, speed: 2, passive: true, xp: 1, drops: [] },
    M: { body: [0.6, 0.6, 0.95], by: 0.85, col: 0xe8e4dc, leg: [0.2, 0.55], head: [0.36, 0.4, 0.5], hy: 1.15, hz: 0.6, x: [[0.06, 0.3, 0.06, 0x8a8070, -0.12, 1.5, 0.55], [0.06, 0.3, 0.06, 0x8a8070, 0.12, 1.5, 0.55], [0.12, 0.2, 0.06, 0xd8d4cc, 0, 0.88, 0.85]], eye: '#c8a020' } },
  frog: { T: { name: 'Frog', hp: 10, w: 0.5, h: 0.5, speed: 2, passive: true, xp: 1, drops: [] },
    M: { body: [0.45, 0.25, 0.5], by: 0.18, col: 0xc88a3a, leg: [0.1, 0.1], head: [0.46, 0.18, 0.32], hy: 0.36, hz: 0.12, x: [[0.12, 0.1, 0.12, 0x2a2a1a, -0.15, 0.48, 0.15], [0.12, 0.1, 0.12, 0x2a2a1a, 0.15, 0.48, 0.15]], eye: '#222' } },
  turtle: { T: { name: 'Turtle', hp: 30, w: 1.2, h: 0.4, speed: 1, passive: true, amphib: true, xp: 1, drops: [] },
    M: { body: [1.0, 0.3, 1.1], by: 0.25, col: 0x4a7a2a, leg: [0.2, 0.12], legCol: 0x7ab85a, head: [0.3, 0.24, 0.3], hy: 0.22, hz: 0.65, headCol: 0x7ab85a, x: [[0.8, 0.12, 0.9, 0x3a6a1a, 0, 0.44, 0]], eye: '#222' } },
  llama: { T: { name: 'Llama', hp: 22, w: 0.9, h: 1.87, speed: 1.7, neutral: true, ranged: true, shoot: 'spit', dmg: 1, rideable: true, horsey: true, seat: 1.15, xp: 1, drops: [['leather', 0, 2]] },
    M: { body: [0.62, 0.7, 1.0], by: 1.0, col: 0xe8dcc0, leg: [0.2, 0.75], head: [0.32, 0.36, 0.4], hy: 1.9, hz: 0.55, x: [[0.28, 0.75, 0.28, 0xe8dcc0, 0, 1.5, 0.45], [0.06, 0.16, 0.06, 0xe8dcc0, -0.1, 2.16, 0.5], [0.06, 0.16, 0.06, 0xe8dcc0, 0.1, 2.16, 0.5], [0.66, 0.2, 0.6, 0xc83a3a, 0, 1.32, 0]], eye: '#222' } },
  camel: { T: { name: 'Camel', hp: 32, w: 1.7, h: 2.4, speed: 1.5, passive: true, rideable: true, horsey: true, seat: 1.75, xp: 1, drops: [] },
    M: { body: [0.9, 0.8, 1.6], by: 1.6, col: 0xd8a860, leg: [0.25, 1.2], head: [0.35, 0.4, 0.7], hy: 2.3, hz: 1.1, x: [[0.6, 0.45, 0.7, 0xd8a860, 0, 2.15, -0.1], [0.3, 0.7, 0.3, 0xd8a860, 0, 2.0, 0.85]], eye: '#222' } },
  polar_bear: { T: { name: 'Polar Bear', hp: 30, w: 1.4, h: 1.4, speed: 2.5, neutral: true, dmg: 6, xp: 1, drops: [['cod', 0, 2]] },
    M: { body: [0.9, 0.85, 1.5], by: 0.95, col: 0xf4f4f0, leg: [0.32, 0.6], head: [0.6, 0.55, 0.5], hy: 1.15, hz: 0.95, x: [[0.14, 0.12, 0.08, 0xf4f4f0, -0.22, 1.48, 0.85], [0.14, 0.12, 0.08, 0xf4f4f0, 0.22, 1.48, 0.85], [0.28, 0.2, 0.18, 0x2a2a2a, 0, 1.06, 1.24]], eye: '#222' } },
  mooshroom: { T: { name: 'Mooshroom', hp: 10, w: 0.9, h: 1.4, speed: 1.4, passive: true, xp: 2, drops: [['beef', 1, 3], ['leather', 0, 2]] },
    M: { body: [0.72, 0.65, 1.1], by: 0.95, col: 0xb82a22, leg: [0.22, 0.62], legCol: 0xe8e0d8, head: [0.5, 0.5, 0.4], hy: 1.2, hz: 0.72, x: [[0.18, 0.18, 0.18, 0xd83a3a, -0.15, 1.38, 0.1], [0.18, 0.18, 0.18, 0xd83a3a, 0.2, 1.38, -0.3], [0.08, 0.15, 0.08, 0xd8d0c0, -0.28, 1.45, 0.72], [0.08, 0.15, 0.08, 0xd8d0c0, 0.28, 1.45, 0.72]], eye: '#111' } },
  sniffer: { T: { name: 'Sniffer', hp: 14, w: 1.9, h: 1.75, speed: 1, passive: true, xp: 1, drops: [] },
    M: { body: [1.5, 1.2, 2.0], by: 1.0, col: 0x9a3a2a, leg: [0.35, 0.45], legCol: 0x5a2a1a, head: [0.9, 0.8, 0.7], hy: 1.1, hz: 1.25, headCol: 0x8a3a2a, x: [[1.52, 0.3, 2.02, 0x3a8a4a, 0, 1.52, 0], [0.4, 0.3, 0.3, 0xc8a030, 0, 0.8, 1.65]], eye: '#222' } },
  armadillo: { T: { name: 'Armadillo', hp: 12, w: 0.7, h: 0.65, speed: 1.4, passive: true, xp: 1, drops: [['armadillo_scute', 0, 1]] },
    M: { body: [0.5, 0.42, 0.7], by: 0.4, col: 0xc88a7a, leg: [0.12, 0.2], legCol: 0xd8a898, head: [0.26, 0.26, 0.3], hy: 0.4, hz: 0.45, x: [[0.56, 0.3, 0.74, 0xa86a5a, 0, 0.55, 0], [0.08, 0.14, 0.04, 0xd8a898, -0.08, 0.6, 0.38], [0.08, 0.14, 0.04, 0xd8a898, 0.08, 0.6, 0.38]], eye: '#222' } },
  parrot: { T: { name: 'Parrot', hp: 6, pet: true, w: 0.5, h: 0.9, speed: 2, passive: true, fly: 1.5, xp: 1, drops: [['feather', 1, 2]] },
    M: { body: [0.3, 0.5, 0.3], by: 0.45, col: 0xd82a2a, legs: 0, head: [0.26, 0.26, 0.26], hy: 0.85, hz: 0.05, x: [[0.06, 0.3, 0.2, 0x2a6ad8, -0.18, 0.5, 0], [0.06, 0.3, 0.2, 0x2a6ad8, 0.18, 0.5, 0], [0.1, 0.1, 0.12, 0xf0c020, 0, 0.82, 0.22], [0.2, 0.3, 0.08, 0xf0c020, 0, 0.2, -0.15]], eye: '#222' } },
  ocelot: { T: { name: 'Ocelot', hp: 10, w: 0.6, h: 0.7, speed: 3.5, passive: true, xp: 1, drops: [] },
    M: { body: [0.3, 0.3, 0.7], by: 0.42, col: 0xe8c060, leg: [0.1, 0.28], head: [0.32, 0.28, 0.3], hy: 0.6, hz: 0.45, x: [[0.07, 0.07, 0.55, 0xe8c060, 0, 0.5, -0.6], [0.32, 0.05, 0.1, 0x6a4a2a, 0, 0.58, 0.1], [0.32, 0.05, 0.1, 0x6a4a2a, 0, 0.58, -0.15]], eye: '#3ad83a' } },
  // in the water
  squid: { T: { name: 'Squid', hp: 10, w: 0.8, h: 0.8, speed: 1.5, passive: true, swim: true, fish: true, xp: 1, drops: [['ink_sac', 1, 3]] },
    M: { body: [0.6, 0.75, 0.6], by: 0.6, col: 0x2a3a6a, legs: 0, head: null, x: [[0.08, 0.6, 0.08, 0x3a4a7a, -0.2, 0.0, -0.2], [0.08, 0.6, 0.08, 0x3a4a7a, 0.2, 0.0, -0.2], [0.08, 0.6, 0.08, 0x3a4a7a, -0.2, 0.0, 0.2], [0.08, 0.6, 0.08, 0x3a4a7a, 0.2, 0.0, 0.2], [0.1, 0.1, 0.02, 0xffffff, -0.15, 0.6, 0.31], [0.1, 0.1, 0.02, 0xffffff, 0.15, 0.6, 0.31]] } },
  glow_squid: { T: { name: 'Glow Squid', hp: 10, w: 0.8, h: 0.8, speed: 1.5, passive: true, swim: true, fish: true, glow: true, xp: 1, drops: [['glow_ink_sac', 1, 3]] },
    M: { body: [0.6, 0.75, 0.6], by: 0.6, col: 0x2ab8a8, legs: 0, head: null, glow: 0x1a6a60, x: [[0.08, 0.6, 0.08, 0x3ad8c8, -0.2, 0.0, -0.2], [0.08, 0.6, 0.08, 0x3ad8c8, 0.2, 0.0, -0.2], [0.08, 0.6, 0.08, 0x3ad8c8, -0.2, 0.0, 0.2], [0.08, 0.6, 0.08, 0x3ad8c8, 0.2, 0.0, 0.2], [0.1, 0.1, 0.02, 0xffffff, -0.15, 0.6, 0.31], [0.1, 0.1, 0.02, 0xffffff, 0.15, 0.6, 0.31]] } },
  dolphin: { T: { name: 'Dolphin', hp: 10, w: 0.9, h: 0.6, speed: 4, passive: true, swim: true, xp: 1, drops: [['cod', 0, 1]] },
    M: { body: [0.5, 0.45, 1.3], by: 0.3, col: 0x6a8aa8, legs: 0, head: [0.4, 0.35, 0.35], hy: 0.28, hz: 0.75, x: [[0.18, 0.12, 0.3, 0x5a7a98, 0, 0.3, 1.05], [0.06, 0.35, 0.3, 0x5a7a98, 0, 0.62, 0], [0.6, 0.06, 0.25, 0x5a7a98, 0, 0.3, -0.8]], eye: '#222' } },
  axolotl: { T: { name: 'Axolotl', hp: 14, w: 0.75, h: 0.42, speed: 2, passive: true, swim: true, amphib: true, xp: 1, drops: [] },
    M: { body: [0.35, 0.22, 0.7], by: 0.22, col: 0xf0a0c0, leg: [0.08, 0.12], head: [0.4, 0.26, 0.3], hy: 0.28, hz: 0.48, x: [[0.06, 0.18, 0.04, 0xd84a7a, -0.24, 0.38, 0.45], [0.06, 0.18, 0.04, 0xd84a7a, 0.24, 0.38, 0.45], [0.06, 0.18, 0.5, 0xf0a0c0, 0, 0.26, -0.55]], eye: '#222' } },
  cod: { T: { name: 'Cod', hp: 3, w: 0.5, h: 0.3, speed: 2, passive: true, swim: true, fish: true, xp: 1, drops: [['cod', 1, 1]] },
    M: { body: [0.18, 0.24, 0.55], by: 0.15, col: 0xb8a07a, legs: 0, head: null, x: [[0.06, 0.2, 0.15, 0x8a7a5a, 0, 0.15, -0.34], [0.04, 0.08, 0.15, 0x8a7a5a, 0, 0.3, 0], [0.05, 0.05, 0.02, 0x111111, -0.07, 0.2, 0.2], [0.05, 0.05, 0.02, 0x111111, 0.07, 0.2, 0.2]] } },
  salmon: { T: { name: 'Salmon', hp: 3, w: 0.5, h: 0.3, speed: 2.4, passive: true, swim: true, fish: true, xp: 1, drops: [['salmon', 1, 1]] },
    M: { body: [0.2, 0.26, 0.7], by: 0.15, col: 0xa83a2a, legs: 0, head: null, x: [[0.06, 0.22, 0.18, 0x6a2a1a, 0, 0.15, -0.42], [0.04, 0.1, 0.2, 0x6a2a1a, 0, 0.32, 0], [0.05, 0.05, 0.02, 0x111111, -0.08, 0.2, 0.3], [0.05, 0.05, 0.02, 0x111111, 0.08, 0.2, 0.3]] } },
  tropical_fish: { T: { name: 'Tropical Fish', hp: 3, w: 0.5, h: 0.4, speed: 2, passive: true, swim: true, fish: true, xp: 1, drops: [] },
    M: { body: [0.12, 0.3, 0.35], by: 0.2, col: 0xf07a2a, legs: 0, head: null, x: [[0.13, 0.3, 0.08, 0xffffff, 0, 0.2, 0.05], [0.05, 0.2, 0.12, 0x2a6ad8, 0, 0.2, -0.22], [0.05, 0.05, 0.02, 0x111111, -0.06, 0.24, 0.16], [0.05, 0.05, 0.02, 0x111111, 0.06, 0.24, 0.16]] } },
  // monsters
  slime: { T: { name: 'Slime', hp: 16, w: 1.0, h: 1.0, speed: 2, hostile: true, dmg: 2, xp: 4, drops: [['slime_ball', 0, 2]] },
    M: { body: [1.0, 1.0, 1.0], by: 0.5, col: 0x7ad84a, trans: true, legs: 0, head: null, x: [[0.6, 0.6, 0.6, 0x4a9a2a, 0, 0.5, 0], [0.15, 0.15, 0.02, 0x1a3a10, -0.2, 0.65, 0.5], [0.15, 0.15, 0.02, 0x1a3a10, 0.2, 0.65, 0.5], [0.25, 0.08, 0.02, 0x1a3a10, 0, 0.35, 0.5]] } },
  magma_cube: { T: { name: 'Magma Cube', hp: 16, w: 1.0, h: 1.0, speed: 2, hostile: true, dmg: 4, xp: 4, fireproof: true, drops: [['blaze_powder', 0, 1]] },
    M: { body: [1.0, 1.0, 1.0], by: 0.5, col: 0x3a1a10, legs: 0, head: null, glow: 0x401000, x: [[1.02, 0.12, 1.02, 0xe85a1a, 0, 0.3, 0], [1.02, 0.12, 1.02, 0xe85a1a, 0, 0.7, 0], [0.18, 0.12, 0.02, 0xffc030, -0.22, 0.6, 0.51], [0.18, 0.12, 0.02, 0xffc030, 0.22, 0.6, 0.51]] } },
  phantom: { T: { name: 'Phantom', hp: 20, w: 0.9, h: 0.5, speed: 4, hostile: true, nightOnly: true, burns: true, fly: 1, dmg: 3, xp: 5, drops: [['phantom_membrane', 0, 1]] },
    M: { body: [0.5, 0.25, 0.9], by: 0.25, col: 0x2a3a6a, legs: 0, head: [0.4, 0.22, 0.4], hy: 0.25, hz: 0.6, x: [[0.9, 0.04, 0.5, 0x3a4a7a, -0.68, 0.32, 0], [0.9, 0.04, 0.5, 0x3a4a7a, 0.68, 0.32, 0], [0.25, 0.04, 0.4, 0x3a4a7a, 0, 0.25, -0.6]], eye: '#7aff3a' } },
  trader_llama: { T: { name: 'Trader Llama', hp: 22, w: 0.9, h: 1.87, speed: 1.9, neutral: true, ranged: true, shoot: 'spit', dmg: 1, rideable: true, horsey: true, seat: 1.15, xp: 1, drops: [['leather', 0, 2]] },
    M: { body: [0.62, 0.7, 1.0], by: 1.0, col: 0xd8c8a8, leg: [0.2, 0.75], head: [0.32, 0.36, 0.4], hy: 1.9, hz: 0.55, x: [[0.28, 0.75, 0.28, 0xd8c8a8, 0, 1.5, 0.45], [0.06, 0.16, 0.06, 0xd8c8a8, -0.1, 2.16, 0.5], [0.06, 0.16, 0.06, 0xd8c8a8, 0.1, 2.16, 0.5], [0.66, 0.2, 0.6, 0x2a4ab8, 0, 1.32, 0], [0.68, 0.06, 0.62, 0xf0c020, 0, 1.24, 0], [0.3, 0.3, 0.12, 0x2a4ab8, 0, 1.55, 0.6]], eye: '#222' } },
  strider: { T: { name: 'Strider', hp: 20, w: 0.9, h: 1.7, speed: 1.6, passive: true, fireproof: true, lavaWalk: true, rideable: true, horsey: true, seat: 1.3, xp: 1, drops: [['string', 2, 5]] },
    M: { body: [0.9, 0.85, 0.9], by: 1.25, col: 0xa83a32, legs: 2, leg: [0.22, 0.85], legCol: 0x6a2a2a, head: null, x: [[0.08, 0.5, 0.08, 0x5a2a6a, -0.3, 1.9, 0], [0.08, 0.6, 0.08, 0x5a2a6a, 0, 1.95, 0.2], [0.08, 0.45, 0.08, 0x5a2a6a, 0.3, 1.85, -0.2], [0.14, 0.14, 0.02, 0x111111, -0.2, 1.4, 0.46], [0.14, 0.14, 0.02, 0x111111, 0.2, 1.4, 0.46], [0.4, 0.06, 0.02, 0x3a1a1a, 0, 1.15, 0.46]] } },
  bat: { T: { name: 'Bat', hp: 6, w: 0.5, h: 0.9, speed: 2.5, passive: true, fly: 0.5, bat: true, xp: 0, drops: [] },
    M: { body: [0.2, 0.3, 0.2], by: 0.5, col: 0x3a2a1a, legs: 0, head: [0.25, 0.22, 0.22], hy: 0.75, hz: 0, x: [[0.45, 0.25, 0.03, 0x2a1a10, -0.32, 0.55, 0], [0.45, 0.25, 0.03, 0x2a1a10, 0.32, 0.55, 0], [0.05, 0.1, 0.05, 0x3a2a1a, -0.08, 0.92, 0], [0.05, 0.1, 0.05, 0x3a2a1a, 0.08, 0.92, 0]], eye: '#111' } },
  snow_golem: { T: { name: 'Snow Golem', hp: 4, w: 0.7, h: 1.9, speed: 2, passive: true, snowGolem: true, xp: 0, drops: [['snowball', 0, 15]] },
    M: { body: [0.65, 0.6, 0.65], by: 0.3, col: 0xf4f8fc, legs: 0, head: [0.5, 0.5, 0.5], hy: 1.55, hz: 0, headCol: 0xe08a1a, x: [[0.5, 0.5, 0.5, 0xf4f8fc, 0, 0.9, 0], [0.7, 0.06, 0.06, 0x6a4a2a, -0.5, 1.05, 0], [0.7, 0.06, 0.06, 0x6a4a2a, 0.5, 1.05, 0]], eye: '#3a1a0a' } },
  allay: { T: { name: 'Allay', hp: 20, w: 0.4, h: 0.6, speed: 3, passive: true, fly: 1.2, allay: true, xp: 0, drops: [] },
    M: { body: [0.25, 0.3, 0.18], by: 0.2, col: 0x5ad8f8, legs: 0, head: [0.3, 0.3, 0.3], hy: 0.52, hz: 0, glow: 0x1a5a7a, x: [[0.04, 0.3, 0.25, 0xc8f0ff, -0.17, 0.25, -0.12], [0.04, 0.3, 0.25, 0xc8f0ff, 0.17, 0.25, -0.12]], eye: '#1a3a6a' } },
  silverfish: { T: { name: 'Silverfish', hp: 8, w: 0.4, h: 0.3, speed: 2.6, hostile: true, dmg: 1, xp: 5, drops: [] },
    M: { body: [0.25, 0.2, 0.25], by: 0.1, col: 0x8a8a8a, legs: 0, head: null, x: [[0.3, 0.24, 0.22, 0x9a9a9a, 0, 0.12, 0.2], [0.2, 0.16, 0.2, 0x7a7a7a, 0, 0.08, -0.2], [0.12, 0.12, 0.15, 0x6a6a6a, 0, 0.06, -0.37], [0.06, 0.06, 0.02, 0x111111, -0.08, 0.16, 0.32], [0.06, 0.06, 0.02, 0x111111, 0.08, 0.16, 0.32]] } },
  endermite: { T: { name: 'Endermite', hp: 8, w: 0.4, h: 0.3, speed: 2.6, hostile: true, dmg: 2, xp: 3, drops: [] },
    M: { body: [0.25, 0.2, 0.3], by: 0.1, col: 0x2a1a3a, legs: 0, head: null, x: [[0.2, 0.18, 0.2, 0x3a2a4a, 0, 0.1, 0.22], [0.15, 0.14, 0.18, 0x3a2a4a, 0, 0.08, -0.24], [0.06, 0.06, 0.02, 0xcc44ff, -0.06, 0.14, 0.33], [0.06, 0.06, 0.02, 0xcc44ff, 0.06, 0.14, 0.33]] } },
  guardian: { T: { name: 'Guardian', hp: 30, w: 0.9, h: 0.9, speed: 2, hostile: true, swim: true, ranged: true, shoot: 'laser', dmg: 5, xp: 10, drops: [['cod', 0, 1]] },
    M: { body: [0.85, 0.85, 0.85], by: 0.45, col: 0x5a9a8a, legs: 0, head: null, x: [[0.1, 0.3, 0.1, 0xe8c070, 0, 0.95, 0], [0.1, 0.3, 0.1, 0xe8c070, 0.5, 0.45, 0], [0.1, 0.3, 0.1, 0xe8c070, -0.5, 0.45, 0], [0.3, 0.3, 0.04, 0xf4f0e8, 0, 0.45, 0.43], [0.12, 0.12, 0.02, 0x8a3a1a, 0, 0.45, 0.46], [0.2, 0.2, 0.4, 0x4a8a7a, 0, 0.45, -0.6]] } },
  breeze: { T: { name: 'Breeze', hp: 30, w: 0.6, h: 1.8, speed: 2.4, hostile: true, ranged: true, shoot: 'wind', dmg: 1, hops: true, xp: 10, drops: [['breeze_rod', 1, 2]] },
    M: { body: [0.25, 0.6, 0.25], by: 0.6, col: 0x8ac8e8, legs: 0, head: [0.5, 0.5, 0.5], hy: 1.45, hz: 0, headCol: 0xb8d8f0, x: [[0.6, 0.12, 0.6, 0xc8e8f8, 0, 0.2, 0], [0.4, 0.12, 0.4, 0xc8e8f8, 0, 0.45, 0], [0.08, 0.5, 0.08, 0x5a98c8, -0.35, 1.1, 0.1], [0.08, 0.5, 0.08, 0x5a98c8, 0.35, 1.1, -0.1]], eye: '#3a6a9a' } },
  ravager: { T: { name: 'Ravager', hp: 100, w: 1.9, h: 2.2, speed: 2.6, hostile: true, dmg: 9, xp: 20, drops: [['leather', 1, 3]] },
    M: { body: [1.4, 1.3, 2.2], by: 1.5, col: 0x5a5a52, leg: [0.45, 0.9], legCol: 0x4a4a44, head: [0.9, 0.9, 0.9], hy: 1.55, hz: 1.4, headCol: 0x6a6a62, x: [[0.15, 0.5, 0.15, 0xd8d0b8, -0.5, 2.1, 1.4], [0.15, 0.5, 0.15, 0xd8d0b8, 0.5, 2.1, 1.4], [0.6, 0.3, 0.4, 0x3a3a34, 0, 1.15, 1.75]], eye: '#c8a020' } },
  vex: { T: { name: 'Vex', hp: 14, w: 0.4, h: 0.8, speed: 4, hostile: true, fly: 0.8, dmg: 4, xp: 3, drops: [] },
    M: { body: [0.25, 0.35, 0.18], by: 0.3, col: 0xa8c0d8, legs: 0, head: [0.3, 0.3, 0.3], hy: 0.66, hz: 0, glow: 0x3a4a6a, x: [[0.04, 0.3, 0.3, 0xe8f0ff, -0.17, 0.4, -0.15], [0.04, 0.3, 0.3, 0xe8f0ff, 0.17, 0.4, -0.15], [0.05, 0.4, 0.05, 0xc8c8d8, 0.2, 0.3, 0.15]], eye: '#ff3a3a' } },
  creaking: { T: { name: 'Creaking', hp: 1000, w: 0.9, h: 2.7, speed: 3.2, hostile: true, dmg: 3, xp: 0, drops: [] },
    M: { body: [0.55, 1.0, 0.35], by: 1.6, col: 0x5a4a3a, legs: 2, leg: [0.2, 1.1], legCol: 0x4a3a2a, head: [0.55, 0.65, 0.5], hy: 2.45, hz: 0, headCol: 0x4a3a2a, x: [[0.16, 1.3, 0.16, 0x4a3a2a, -0.4, 1.5, 0], [0.16, 1.3, 0.16, 0x4a3a2a, 0.4, 1.5, 0], [0.12, 0.12, 0.02, 0xff8a1a, -0.13, 2.5, 0.26], [0.12, 0.12, 0.02, 0xff8a1a, 0.13, 2.5, 0.26], [0.1, 0.3, 0.1, 0x9aa094, 0.25, 2.85, 0]], eye: '#ff8a1a' } },
  warden: { T: { name: 'Warden', hp: 500, w: 0.9, h: 2.9, speed: 2.2, hostile: true, dmg: 16, xp: 5, drops: [['sculk_sensor', 1, 1]] },
    M: { body: [1.2, 1.2, 0.7], by: 1.95, col: 0x0e3a4a, legs: 2, leg: [0.4, 1.35], legCol: 0x0a2a38, head: [0.95, 0.85, 0.75], hy: 2.95, hz: 0.05, headCol: 0x0e3a4a, x: [[0.35, 1.5, 0.35, 0x0a2a38, -0.8, 1.75, 0], [0.35, 1.5, 0.35, 0x0a2a38, 0.8, 1.75, 0], [0.12, 0.5, 0.12, 0x2ad8e8, -0.55, 3.45, 0], [0.12, 0.5, 0.12, 0x2ad8e8, 0.55, 3.45, 0], [0.5, 0.5, 0.05, 0x3ae8f8, 0, 2.1, 0.36]], eye: '#0e3a4a' } },
  hoglin: { T: { name: 'Hoglin', hp: 40, w: 1.4, h: 1.4, speed: 2.4, hostile: true, dmg: 6, xp: 5, drops: [['porkchop', 2, 4], ['leather', 0, 1]] },
    M: { body: [0.9, 0.85, 1.5], by: 1.0, col: 0xc87a5a, leg: [0.3, 0.6], legCol: 0x8a5a3a, head: [0.7, 0.6, 0.7], hy: 1.0, hz: 1.0, x: [[0.1, 0.35, 0.1, 0xf4f0e0, -0.3, 0.9, 1.4], [0.1, 0.35, 0.1, 0xf4f0e0, 0.3, 0.9, 1.4], [0.12, 0.6, 1.2, 0xe8c070, 0, 1.6, 0]], eye: '#222' } },
};
/* people-shaped ones reuse the zombie / skeleton bodies */
const MORE_PEOPLE = {
  husk: { T: { name: 'Husk', hp: 20, w: 0.6, h: 1.95, speed: 2.3, hostile: true, dmg: 3, xp: 5, drops: [['rotten_flesh', 0, 2]] }, skin: 0xb8a070, shirt: 0x7a6a4a, pants: 0x5a4a3a, like: 'zombie' },
  stray: { T: { name: 'Stray', hp: 20, w: 0.6, h: 1.95, speed: 2.4, hostile: true, ranged: true, dmg: 3, burns: true, xp: 5, drops: [['bone', 0, 2], ['arrow', 0, 2]] }, skin: 0x9ab0b0, shirt: 0x6a8a8a, pants: 0x5a6a6a, like: 'skeleton' },
  drowned: { T: { name: 'Drowned', hp: 20, w: 0.6, h: 1.95, speed: 2.3, hostile: true, dmg: 3, burns: true, amphib: true, xp: 5, drops: [['rotten_flesh', 0, 2]] }, skin: 0x5a9a8a, shirt: 0x3a7a8a, pants: 0x4a5a7a, like: 'zombie' },
  witch: { T: { name: 'Witch', hp: 26, w: 0.6, h: 1.95, speed: 2, hostile: true, ranged: true, dmg: 3, xp: 5, drops: [['redstone', 0, 2], ['glowstone', 0, 1], ['stick', 0, 2], ['sugar_cane', 0, 1]] }, skin: 0xc8a07a, shirt: 0x3a1a4a, pants: 0x2a1a3a, like: 'witch' },
  wandering_trader: { T: { name: 'Wandering Trader', hp: 20, w: 0.6, h: 1.95, speed: 2, passive: true, trader: true, xp: 0, drops: [] }, skin: 0xc8a07a, shirt: 0x2a4a9a, pants: 0x1a3a7a, like: 'trader', nose: true },
  vindicator: { T: { name: 'Vindicator', hp: 24, w: 0.6, h: 1.95, speed: 2.6, hostile: true, dmg: 7, xp: 5, drops: [['emerald', 0, 1]] }, skin: 0x8a9a9a, shirt: 0x3a3a3a, pants: 0x2a2a3a, like: 'illager', nose: true, axe: 0xd8d8d8 },
  evoker: { T: { name: 'Evoker', hp: 24, w: 0.6, h: 1.95, speed: 2.2, hostile: true, evoker: true, dmg: 2, xp: 10, drops: [['totem_of_undying', 1, 1], ['emerald', 0, 1]] }, skin: 0x8a9a9a, shirt: 0x1a1a1a, pants: 0x1a1a1a, like: 'illager', nose: true },
  zombie_villager: { T: { name: 'Zombie Villager', hp: 20, w: 0.6, h: 1.95, speed: 2.3, hostile: true, dmg: 3, burns: true, xp: 5, drops: [['rotten_flesh', 0, 2]] }, skin: 0x5a8a4a, shirt: 0x6a4a2a, pants: 0x4a3a2a, like: 'zombie', nose: true },
  piglin_brute: { T: { name: 'Piglin Brute', hp: 50, w: 0.6, h: 1.95, speed: 2.6, hostile: true, dmg: 9, xp: 20, fireproof: true, drops: [['gold_ingot', 1, 2]] }, skin: 0xe8a89a, shirt: 0x2a2a2a, pants: 0x5a3a20, like: 'piglin', axe: 0xf5cc2e },
  bogged: { T: { name: 'Bogged', hp: 16, w: 0.6, h: 1.95, speed: 2.4, hostile: true, ranged: true, dmg: 3, burns: true, xp: 5, drops: [['bone', 0, 2], ['arrow', 0, 2], ['red_mushroom', 0, 1]] }, skin: 0x8a9a6a, shirt: 0x5a7a3a, pants: 0x4a5a3a, like: 'skeleton' },
  piglin: { T: { name: 'Piglin', hp: 16, w: 0.6, h: 1.95, speed: 2.6, neutral: true, goldLover: true, dmg: 5, xp: 5, fireproof: true, drops: [['gold_ingot', 0, 1]] }, skin: 0xe8a89a, shirt: 0x7a5a32, pants: 0x5a3a20, like: 'piglin' },
};
Object.assign(MOB_TYPES, {
  mule: { name: 'Mule', hp: 22, w: 1.2, h: 1.5, speed: 2, passive: true, rideable: true, horsey: true, seat: 0.85, xp: 1, drops: [['leather', 0, 2]] },
  skeleton_horse: { name: 'Skeleton Horse', hp: 15, w: 1.3, h: 1.6, speed: 2.4, passive: true, rideable: true, horsey: true, swimsWell: true, xp: 1, drops: [['bone', 0, 2]] },
  cave_spider: { name: 'Cave Spider', hp: 12, w: 0.7, h: 0.5, speed: 3, hostile: true, dmg: 2, poison: true, xp: 5, drops: [['string', 0, 2]] },
});
FACES_DRAW.mule = FACES_DRAW.donkey; FACES_DRAW.skeleton_horse = FACES_DRAW.horse; FACES_DRAW.cave_spider = FACES_DRAW.spider;
for (const [k, v] of Object.entries(MORE_MOBS)) {
  MOB_TYPES[k] = v.T;
  if (v.M.head) { const c = '#' + (v.M.headCol || v.M.col).toString(16).padStart(6, '0'), e = v.M.eye || '#222'; FACES_DRAW[k] = px => { px(0, 0, c, 8, 8); px(1, 3, e, 2, 2); px(5, 3, e, 2, 2); }; }
}
for (const [k, v] of Object.entries(MORE_PEOPLE)) {
  MOB_TYPES[k] = v.T;
  const c = '#' + v.skin.toString(16).padStart(6, '0');
  FACES_DRAW[k] = px => { px(0, 0, c, 8, 8); px(1, 3, '#1a1a1a', 2, 1); px(5, 3, '#1a1a1a', 2, 1); px(3, 5, '#00000044', 2, 1); };
}
Object.assign(BREED_FOOD, { rabbit: ['carrot'], goat: ['wheat'], llama: ['hay_bale'], mooshroom: ['wheat'], frog: ['slime_ball'], fox: ['glow_berries'], sniffer: ['wheat_seeds'], armadillo: ['wheat_seeds'], camel: ['wheat'], turtle: ['wheat_seeds'], axolotl: ['cod'], ocelot: ['cod'], bee: ['rose', 'dandelion'] });
function shadeHex(c, f) { return (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f); }
function buildMoreModel(type, g, P) {
  const M = MORE_MOBS[type].M, mat = c => lam(c, M.glow ? { emissive: M.glow } : M.trans ? { transparent: true, opacity: 0.75 } : undefined);
  const [bw, bh, bd] = M.body;
  addBox(g, bw, bh, bd, mat(M.col), 0, M.by, 0);
  const legs = M.legs === 0 ? 0 : 4;
  if (M.legs === 2) {
    const [lw, ll] = M.leg, lm = mat(M.legCol || M.col);
    for (const x of [-bw / 4, bw / 4]) P.legs.push(limb(g, lw, ll, lw, lm, x, ll, 0));
  } else if (legs && M.leg) {
    const [lw, ll] = M.leg, lx = bw / 2 - lw / 2 - 0.02, lz = bd / 2 - lw / 2 - 0.04, lm = mat(M.legCol || M.col);
    for (const [x, z] of [[-lx, lz], [lx, lz], [-lx, -lz], [lx, -lz]]) P.legs.push(limb(g, lw, ll, lw, lm, x, ll, z));
  }
  if (M.head) {
    const head = new THREE.Mesh(boxGeo(...M.head), headMats(type, M.headCol || M.col));
    head.position.set(0, M.hy, M.hz); g.add(head); P.head = head;
  }
  for (const [w, h, d, c, x, y, z] of M.x || []) addBox(g, w, h, d, mat(c), x, y, z);
}
function buildMobModel(type) {
  const g = new THREE.Group();
  const P = { legs: [], arms: [], head: null, wings: [] };
  if (MORE_MOBS[type]) buildMoreModel(type, g, P);
  else if (type === 'zombie' || type === 'skeleton' || type === 'enderman' || type === 'player' || type === 'zombified_piglin' || type === 'wither_skeleton' || type === 'villager' || type === 'pillager' || MORE_PEOPLE[type]) {
    const MP = MORE_PEOPLE[type], like = MP ? MP.like : type;
    const thin = like === 'skeleton' || type === 'enderman' || type === 'wither_skeleton', tall = type === 'enderman';
    const skin = MP ? MP.skin : { zombie: 0x5c8a3e, skeleton: 0xc9c9c9, enderman: 0x161616, player: 0xc89878, zombified_piglin: 0xe39a8f, wither_skeleton: 0x2a2a2a, villager: 0xc8a07a, pillager: 0x9a9a9a }[type];
    const shirt = MP ? MP.shirt : { zombie: 0x2f8fa3, skeleton: 0xbdbdbd, enderman: 0x1a1a1a, player: 0x2fb5c8, zombified_piglin: 0x7a5a32, wither_skeleton: 0x262626, villager: 0x6b4a2e, pillager: 0x3a3a4a }[type];
    const pants = MP ? MP.pants : { zombie: 0x3b3f8f, skeleton: 0xa6a6a6, enderman: 0x161616, player: 0x3b3f9f, zombified_piglin: 0x5a3a20, wither_skeleton: 0x202020, villager: 0x5e3f24, pillager: 0x2a2a34 }[type];
    const mSkin = lam(skin), mShirt = lam(shirt), mPants = lam(pants);
    const lw = thin ? 0.13 : 0.25, legL = tall ? 1.5 : 0.75, bodyH = 0.75, hip = legL;
    P.legs.push(limb(g, lw, legL, lw, mPants, -0.125, hip, 0), limb(g, lw, legL, lw, mPants, 0.125, hip, 0));
    addBox(g, 0.5, bodyH, thin ? 0.2 : 0.25, mShirt, 0, hip + bodyH / 2, 0);
    const shoulder = hip + bodyH - 0.1, armL = tall ? 1.5 : 0.72;
    const armMat = like === 'zombie' || type === 'player' ? mSkin : mShirt;
    P.arms.push(limb(g, lw, armL, lw, armMat, -0.25 - lw / 2, shoulder, 0), limb(g, lw, armL, lw, armMat, 0.25 + lw / 2, shoulder, 0));
    if (type === 'player') for (const a of P.arms) addBox(a, lw + 0.02, 0.3, lw + 0.02, mShirt, 0, -0.12, 0);
    const head = new THREE.Mesh(boxGeo(0.5, 0.5, 0.5), headMats(type, skin));
    head.position.set(0, hip + bodyH + 0.25, 0); g.add(head); P.head = head;
    if (like === 'zombie') for (const a of P.arms) a.rotation.x = -Math.PI / 2;
    if (like === 'witch') { addBox(head, 0.6, 0.08, 0.6, lam(0x2a1a3a), 0, 0.29, 0); addBox(head, 0.36, 0.3, 0.36, lam(0x2a1a3a), 0, 0.46, 0); addBox(head, 0.18, 0.25, 0.18, lam(0x2a1a3a), 0, 0.68, -0.05); addBox(head, 0.12, 0.18, 0.1, lam(0xa8805a), 0, -0.05, 0.3); }
    if (like === 'piglin') { addBox(head, 0.26, 0.16, 0.1, lam(0xd8889a), 0, -0.08, 0.3); P.arms[1].rotation.x = -0.6; if (!MP.axe) { const blade = addBox(P.arms[1], 0.08, 0.8, 0.08, lam(0xf5cc2e), 0, -0.9, 0.1); blade.rotation.x = Math.PI / 2 - 0.3; } }
    if (MP && MP.nose) addBox(head, 0.12, 0.22, 0.1, lam(shadeHex(MP.skin, 0.85)), 0, -0.1, 0.3);
    if (MP && MP.axe) { P.arms[1].rotation.x = -0.6; const h2 = addBox(P.arms[1], 0.06, 0.8, 0.06, lam(0x6a4a2a), 0, -0.85, 0.1); h2.rotation.x = Math.PI / 2 - 0.3; addBox(h2, 0.08, 0.3, 0.3, lam(MP.axe), 0, 0.35, 0.12); }
    if (like === 'trader') { addBox(head, 0.54, 0.14, 0.54, lam(MP.shirt), 0, 0.28, 0); P.trade = true; }
    if (type === 'villager') {
      addBox(head, 0.12, 0.22, 0.12, lam(0xb88a64), 0, -0.08, 0.3);
      addBox(g, 0.54, 0.5, 0.29, mShirt, 0, hip + 0.1, 0);
      for (const a of P.arms) a.rotation.x = -0.9;
      // a work apron, coloured by the villager's job (hidden while it has none)
      P.robe = addBox(g, 0.56, 0.9, 0.31, lam(0xffffff), 0, hip + 0.25, 0); P.robe.visible = false;
    }
    if (type === 'pillager') { P.arms[1].rotation.x = -Math.PI / 2; const bow = addBox(P.arms[1], 0.5, 0.06, 0.06, lam(0x5a3c1c), 0, -0.7, 0.12); addBox(P.arms[1], 0.06, 0.06, 0.4, lam(0x3a3a3a), 0, -0.7, 0.12); }
    if (type === 'zombified_piglin' || type === 'wither_skeleton') {
      P.arms[1].rotation.x = -0.6;
      const blade = addBox(P.arms[1], 0.08, 0.8, 0.08, lam(type === 'wither_skeleton' ? 0x707070 : 0xf5cc2e), 0, -0.9, 0.1);
      blade.rotation.x = Math.PI / 2 - 0.3;
      if (type === 'wither_skeleton') g.scale.setScalar(1.2);
    }
    if (like === 'skeleton') { P.arms[1].rotation.x = -Math.PI / 2; const bow = addBox(P.arms[1], 0.05, 0.7, 0.05, lam(0x7a5a32), 0, -0.7, 0.12); bow.rotation.x = Math.PI / 2; }
  } else if (type === 'creeper') {
    const tex = faceTex('creeper_body', 8, px => noisyFill(px, 8, ['#4caf50', '#3f9a44', '#5cc060', '#6fc86a', '#2f7a32'], 9));
    const body = lam(0xffffff, { map: tex });
    addBox(g, 0.5, 0.8, 0.28, body, 0, 0.375 + 0.4, 0);
    for (const [x, z] of [[-0.13, 0.17], [0.13, 0.17], [-0.13, -0.17], [0.13, -0.17]]) P.legs.push(limb(g, 0.25, 0.375, 0.2, body, x, 0.375, z));
    const head = new THREE.Mesh(boxGeo(0.5, 0.5, 0.5), headMats('creeper', 0x4caf50));
    head.position.set(0, 1.42, 0); g.add(head); P.head = head;
  } else if (type === 'spider' || type === 'cave_spider') {
    const cs = type === 'cave_spider', mb = lam(cs ? 0x0e3a3a : 0x2a2523), mLeg = lam(cs ? 0x0a2a2a : 0x1f1a18);
    if (cs) g.scale.setScalar(0.7);
    addBox(g, 0.85, 0.6, 0.9, mb, 0, 0.5, -0.5);
    addBox(g, 0.4, 0.4, 0.3, mb, 0, 0.45, 0.0);
    const head = new THREE.Mesh(boxGeo(0.5, 0.5, 0.45), headMats(type, cs ? 0x0e3a3a : 0x2a2523));
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
  } else if (type === 'panda') {
    // white with black legs, a black band over the shoulders, black ears and eye patches
    const white = lam(0xf2f2f2), black = lam(0x1a1a1a);
    addBox(g, 0.9, 0.75, 1.3, white, 0, 0.82, 0);
    addBox(g, 0.94, 0.79, 0.4, black, 0, 0.82, 0.3);
    for (const [x, z] of [[-0.3, 0.42], [0.3, 0.42], [-0.3, -0.45], [0.3, -0.45]]) P.legs.push(limb(g, 0.3, 0.45, 0.3, black, x, 0.45, z));
    const head = new THREE.Mesh(boxGeo(0.62, 0.55, 0.5), headMats('panda', 0xf2f2f2));
    head.position.set(0, 1.0, 0.85); g.add(head); P.head = head;
    addBox(head, 0.16, 0.14, 0.08, black, -0.24, 0.32, -0.05); addBox(head, 0.16, 0.14, 0.08, black, 0.24, 0.32, -0.05);
    addBox(head, 0.22, 0.14, 0.1, white, 0, -0.14, 0.28); addBox(head, 0.08, 0.05, 0.02, black, 0, -0.1, 0.33);
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
    P.armorParts = [addBox(g, 0.5, 0.48, 0.9, lam(0xa86a5a), 0, 0.64, 0)]; P.armorParts[0].visible = false;
  } else if (type === 'cat') {
    // a small ginger tabby
    const fur = lam(0xe0902a), dark = lam(0xc8701a);
    addBox(g, 0.3, 0.3, 0.7, fur, 0, 0.42, 0);
    for (const z of [-0.2, 0, 0.2]) addBox(g, 0.32, 0.06, 0.08, dark, 0, 0.58, z);
    for (const [x, z] of [[-0.09, 0.24], [0.09, 0.24], [-0.09, -0.24], [0.09, -0.24]]) P.legs.push(limb(g, 0.1, 0.28, 0.1, fur, x, 0.28, z));
    const head = new THREE.Mesh(boxGeo(0.32, 0.28, 0.3), headMats('cat', 0xe0902a));
    head.position.set(0, 0.6, 0.45); g.add(head); P.head = head;
    addBox(head, 0.08, 0.1, 0.06, dark, -0.1, 0.18, -0.05); addBox(head, 0.08, 0.1, 0.06, dark, 0.1, 0.18, -0.05);
    const tail = addBox(g, 0.07, 0.07, 0.55, fur, 0, 0.5, -0.6); tail.rotation.x = 0.9; P.tail = tail;
    const collar = addBox(g, 0.34, 0.07, 0.34, lam(0x2a6ad8), 0, 0.6, 0.3); collar.visible = false; P.collar = collar;
  } else if (type === 'horse' || type === 'donkey' || type === 'mule' || type === 'skeleton_horse') {
    // a donkey is a smaller, grey horse with long ears; a mule is in between; a skeleton horse is all bones
    const dk = type === 'donkey' || type === 'mule', b = new THREE.Group(); g.add(b);
    if (dk) b.scale.setScalar(type === 'mule' ? 0.92 : 0.85);
    const COAT = { horse: [0x8a5a32, 0x3a2412], donkey: [0x7d7468, 0x3a342c], mule: [0x4a3020, 0x2a1a10], skeleton_horse: [0xd8d4c4, 0xb8b4a4] }[type];
    const coat = lam(COAT[0]), mane = lam(COAT[1]);
    addBox(b, 0.7, 0.7, 1.5, coat, 0, 1.3, 0);
    for (const [x, z] of [[-0.24, 0.58], [0.24, 0.58], [-0.24, -0.58], [0.24, -0.58]]) P.legs.push(limb(b, 0.2, 0.98, 0.2, coat, x, 0.98, z));
    const neck = new THREE.Group(); neck.position.set(0, 1.45, 0.7); neck.rotation.x = -0.6; b.add(neck);
    addBox(neck, 0.32, 0.8, 0.42, coat, 0, 0.35, 0);
    addBox(neck, 0.12, 0.8, 0.12, mane, 0, 0.35, -0.24);
    const head = new THREE.Mesh(boxGeo(0.32, 0.32, 0.65), headMats(type, COAT[0]));
    head.position.set(0, 0.75, 0.22); head.rotation.x = 0.6; neck.add(head); P.head = head;
    const ear = dk ? 0.34 : 0.14;
    addBox(head, 0.08, ear, 0.06, coat, -0.1, 0.13 + ear / 2, -0.22); addBox(head, 0.08, ear, 0.06, coat, 0.1, 0.13 + ear / 2, -0.22);
    const tail = addBox(b, 0.14, 0.7, 0.14, mane, 0, 1.15, -0.8); tail.rotation.x = 0.3;
    const saddle = addBox(b, 0.74, 0.12, 0.6, lam(0x5a3a1a), 0, 1.68, -0.05); saddle.visible = false; P.saddle = saddle;
    // horse armor (coloured by what it's made of) and chests on its sides
    P.armorParts = [addBox(b, 0.76, 0.4, 1.56, lam(0xd8d8d8), 0, 1.42, 0), addBox(neck, 0.36, 0.7, 0.46, lam(0xd8d8d8), 0, 0.4, 0.01)];
    for (const a of P.armorParts) a.visible = false;
    P.chests = [addBox(b, 0.16, 0.42, 0.5, lam(0x9a6a32), -0.43, 1.2, -0.3), addBox(b, 0.16, 0.42, 0.5, lam(0x9a6a32), 0.43, 1.2, -0.3)];
    for (const c of P.chests) c.visible = false;
  } else if (type === 'boat') {
    const wood = lam(0x9a6a32), dark = lam(0x6e4a22);
    addBox(g, 1.3, 0.12, 1.9, dark, 0, 0.06, 0);
    addBox(g, 0.1, 0.42, 1.9, wood, -0.6, 0.3, 0); addBox(g, 0.1, 0.42, 1.9, wood, 0.6, 0.3, 0);
    addBox(g, 1.3, 0.42, 0.1, wood, 0, 0.3, 0.9); addBox(g, 1.3, 0.42, 0.1, wood, 0, 0.3, -0.9);
    addBox(g, 1.1, 0.07, 0.28, wood, 0, 0.26, 0.25); addBox(g, 1.1, 0.07, 0.28, wood, 0, 0.26, -0.55);
    const oar = addBox(g, 0.06, 0.06, 1.1, dark, 0.72, 0.4, 0.2); oar.rotation.y = 0.5; const oar2 = addBox(g, 0.06, 0.06, 1.1, dark, -0.72, 0.4, 0.2); oar2.rotation.y = -0.5;
    P.oars = [oar, oar2];
    const head = new THREE.Group(); g.add(head); P.head = head;
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
  } else if (type === 'wither') {
    // three black skulls on a bony shoulder bar, a spine and ribs below
    const bone = lam(0x2a2a2a), dark = lam(0x1a1a1a);
    addBox(g, 2.2, 0.3, 0.3, bone, 0, 2.2, 0);
    addBox(g, 0.25, 1.5, 0.25, bone, 0, 1.4, 0);
    for (const y of [1.9, 1.6, 1.3]) addBox(g, 1.0, 0.12, 0.6, dark, 0, y, 0.05);
    const head = new THREE.Mesh(boxGeo(0.7, 0.7, 0.7), headMats('wither', 0x1e1e1e));
    head.position.set(0, 2.75, 0); g.add(head); P.head = head;
    for (const x of [-0.95, 0.95]) { const h = new THREE.Mesh(boxGeo(0.5, 0.5, 0.5), headMats('wither', 0x1e1e1e)); h.position.set(x, 2.55, 0); g.add(h); }
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
/* villager jobs (from the work block they stand by) and what each one trades: [what you give, what you get] */
const VILLAGER_JOBS = {
  farmer: { name: 'Farmer', color: 0xc8a040, block: 'composter', trades: [[[['wheat', 20]], ['emerald', 1]], [[['potato', 26]], ['emerald', 1]], [[['carrot', 22]], ['emerald', 1]], [[['pumpkin', 6]], ['emerald', 1]], [[['emerald', 1]], ['bread', 6]], [[['emerald', 1]], ['cookie', 12]], [[['emerald', 3]], ['golden_apple', 1]]] },
  librarian: { name: 'Librarian', color: 0xe8e8e8, block: 'lectern', trades: [[[['string', 24]], ['emerald', 1]], [[['emerald', 1]], ['glass', 4]], [[['emerald', 1]], ['lantern', 1]], [[['emerald', 6]], ['bookshelf', 1]], [[['emerald', 4]], ['lead', 2]], [[['emerald', 12]], ['ender_pearl', 1]], [[['emerald', 20]], ['name_tag', 1]]] },
  butcher: { name: 'Butcher', color: 0xd84a3a, block: 'smoker', trades: [[[['chicken', 14]], ['emerald', 1]], [[['porkchop', 7]], ['emerald', 1]], [[['beef', 10]], ['emerald', 1]], [[['coal', 15]], ['emerald', 1]], [[['emerald', 1]], ['cooked_porkchop', 5]], [[['emerald', 1]], ['steak', 5]]] },
  armorer: { name: 'Armorer', color: 0x3a3a3a, block: 'blast_furnace', trades: [[[['coal', 15]], ['emerald', 1]], [[['iron_ingot', 4]], ['emerald', 1]], [[['emerald', 5]], ['iron_helmet', 1]], [[['emerald', 9]], ['iron_chestplate', 1]], [[['emerald', 7]], ['iron_leggings', 1]], [[['emerald', 4]], ['iron_boots', 1]], [[['emerald', 18]], ['diamond_chestplate', 1]]] },
  weaponsmith: { name: 'Weaponsmith', color: 0x6a2a2a, block: 'grindstone', trades: [[[['coal', 15]], ['emerald', 1]], [[['iron_ingot', 4]], ['emerald', 1]], [[['emerald', 3]], ['iron_axe', 1]], [[['emerald', 2]], ['iron_sword', 1]], [[['emerald', 13]], ['diamond_sword', 1]], [[['emerald', 16]], ['diamond_axe', 1]]] },
  fletcher: { name: 'Fletcher', color: 0x5a8a3a, block: 'fletching_table', trades: [[[['stick', 32]], ['emerald', 1]], [[['flint', 26]], ['emerald', 1]], [[['string', 14]], ['emerald', 1]], [[['emerald', 1]], ['arrow', 16]], [[['emerald', 2]], ['bow', 1]], [[['emerald', 1]], ['flint', 10]]] },
  toolsmith: { name: 'Toolsmith', color: 0x2a2a3a, block: 'smithing_table', trades: [[[['coal', 15]], ['emerald', 1]], [[['iron_ingot', 4]], ['emerald', 1]], [[['emerald', 1]], ['stone_axe', 1]], [[['emerald', 1]], ['stone_pickaxe', 1]], [[['emerald', 4]], ['iron_pickaxe', 1]], [[['emerald', 12]], ['diamond_pickaxe', 1]]] },
};
const JOB_NAMES = [null, ...Object.keys(VILLAGER_JOBS)];
const T_isFly = m => !!m.T.fly;
const moveHint = m => Math.hypot(m.vel.x, m.vel.z) > 0.3;
/* what a piglin gives you for a gold ingot: [item, least, most] */
const BARTER = [['ender_pearl', 1, 2], ['obsidian', 1, 1], ['string', 3, 9], ['quartz', 5, 12], ['gravel', 8, 16], ['leather', 2, 4], ['soul_sand', 2, 8], ['nether_bricks', 2, 8], ['iron_ingot', 1, 3], ['blackstone', 8, 16], ['glowstone', 1, 2]];
const WANDERING_JOB = { name: 'Wandering Trader', trades: [[[['emerald', 1]], ['blue_orchid', 1]], [[['emerald', 1]], ['allium', 1]], [[['emerald', 1]], ['cornflower', 1]], [[['emerald', 1]], ['sunflower', 1]], [[['emerald', 1]], ['red_sand', 8]], [[['emerald', 3]], ['coral_block_brain', 1]], [[['emerald', 3]], ['coral_block_tube', 1]], [[['emerald', 1]], ['lily_pad', 2]], [[['emerald', 6]], ['blue_ice', 1]], [[['emerald', 2]], ['packed_ice', 1]], [[['emerald', 5]], ['bucket_of_tropical_fish', 1]], [[['emerald', 5]], ['bucket_of_axolotl', 1]], [[['emerald', 1]], ['glow_berries', 4]], [[['emerald', 2]], ['moss_block', 2]], [[['emerald', 1]], ['bamboo', 8]], [[['emerald', 1]], ['sugar_cane', 4]], [[['emerald', 3]], ['dripstone_block', 4]], [[['emerald', 5]], ['torchflower', 1]], [[['emerald', 5]], ['pitcher_plant', 1]]] };
const tradeJob = v => (v.type === 'wandering_trader' ? WANDERING_JOB : VILLAGER_JOBS[v.prof]);


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
          if (this.type === 'turtle') {
            // turtles lay eggs on the sand instead; they hatch a few minutes later
            const s = G.findNear(this.pos, 8, 3, id => id === ID.sand);
            if (s && !G.world.getBlock(s.x, s.y + 1, s.z)) { G.world.setBlock(s.x, s.y + 1, s.z, ID.turtle_egg); G.crops[chestKey(s.x, s.y + 1, s.z)] = 150 + Math.random() * 90; }
          } else {
            const baby = new Mob(this.type, (this.pos.x + mate.pos.x) / 2, Math.max(this.pos.y, mate.pos.y), (this.pos.z + mate.pos.z) / 2);
            baby.makeBaby(); G.mobs.push(baby);
          }
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
  makeSmall() { this.small = true; this.hp = 4; this.w = this.T.w * 0.5; this.h = this.T.h * 0.5; this.mesh.scale.setScalar(0.5); return this; }
  growUp() { if (this.type === 'turtle' && this.baby && !this.remoteCtl) G.spawnDrop(ID.turtle_scute, 1, this.pos.x, this.pos.y + 0.3, this.pos.z); this.baby = false; this.w = this.T.w; this.h = this.T.h; this.mesh.scale.setScalar(1); }

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
    if (this.T.boat && !this.remoteCtl) {
      // two hits break a boat
      this.hp -= dmg >= 1 ? 2 : 1; this.hurtT = 0.3;
      G.sound.play('dig', this.pos, ID.oak_planks);
      if (this.hp <= 0) this.die(true);
      return;
    }
    if (this.armor && HORSE_ARMOR[this.armor]) dmg = Math.max(0.5, dmg * (1 - HORSE_ARMOR[this.armor].pts * 0.04));
    if (this.rolledT > 0) dmg *= 0.3; // a rolled-up armadillo is hard to hurt
    if (this.remoteCtl) {
      // another player's device runs this mob: send them the hit, just show the flash here
      if (byPlayer) { Net.mobHit(this, dmg, kb); this.hitByMeAt = Date.now(); }
      this.hurtT = 0.35;
      G.sound.play('hurtMob', this.pos);
      return;
    }
    if (this.type === 'creaking') { this.hurtT = 0.35; G.particles.burst(this.pos.x, this.pos.y + 1.3, this.pos.z, [0xff8a1a, 0x5a4a3a], 8, 1.5, 0.1); if (byPlayer && !this.toldHeart) { this.toldHeart = true; G.ui.message('The Creaking can\'t be hurt! Break its Creaking Heart (the glowing log in a pale oak tree).', 'purple'); } return; }
    this.hp -= dmg; this.hurtT = 0.35;
    if (from) {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z, l = Math.hypot(dx, dz) || 1;
      this.vel.x = dx / l * kb; this.vel.z = dz / l * kb; this.vel.y = 5;
    }
    if (this.T.passive) this.fleeT = 4;
    if (byPlayer && (this.T.neutral || this.T.nightOnly)) this.angry = true;
    if (byPlayer && this.type === 'villager') for (const m of G.mobs) if (m.type === 'iron_golem' && !m.dead && m.pos.distanceTo(this.pos) < 32) m.angry = true; // hit a villager and the golems come for you
    if (byPlayer && this.type === 'zombified_piglin') for (const m of G.mobs) if (m.type === this.type && m.pos.distanceTo(this.pos) < 20) m.angry = true;
    if (byPlayer && this.type === 'wandering_trader') for (const m of G.mobs) if (m.trader === this) m.angry = true; // his llamas spit at you
    if (byPlayer && this.type === 'piglin') for (const m of G.mobs) if (m.type === 'piglin' && m.pos.distanceTo(this.pos) < 16) m.angry = true;
    if (this.type === 'squid' || this.type === 'glow_squid') G.particles.burst(this.pos.x, this.pos.y + 0.5, this.pos.z, this.type === 'squid' ? [0x111111, 0x222233] : [0x1a6a60, 0x3ad8c8], 24, 2.5, 0.2);
    if (this.type === 'armadillo') this.rolledT = 5;
    if (this.type === 'bee' && byPlayer) G.angerBees(this.pos.x, this.pos.y, this.pos.z, G.player);
    G.sound.play('hurtMob', this.pos);
    if (this.type === 'enderman' && Math.random() < 0.6 && this.hp > 0) this.teleport();
    if (this.hp <= 0) this.die(byPlayer);
  }

  /* the warden is blind: it finds you by the noise you make (walking, running, jumping). Sneak and it may not hear you. */
  wardenHears(P, dist, dt) {
    if (P.dead || P.mode !== 'survival') return false;
    const loud = P.sneaking ? 0 : Math.hypot(P.vel.x, P.vel.z) > 0.5 || P.vel.y > 2 ? 1 : 0;
    if (dist < 2.5 || (loud && dist < 14)) this.anger = Math.min(100, (this.anger || 0) + dt * (loud ? 40 : 15));
    else this.anger = Math.max(0, (this.anger || 0) - dt * 4);
    if (this.anger > 60 && !this.roared) { this.roared = true; G.sound.play('wardenRoar', this.pos); G.ui.message('The Warden heard you!', 'purple'); }
    if (this.anger < 20) this.roared = false;
    return this.anger > 60;
  }
  watched(P, dist) {
    if (P.dead || dist > 40) return false;
    const e = P.eyePos(), d = P.lookDir(), tx = this.pos.x - e.x, ty = this.pos.y + this.h * 0.6 - e.y, tz = this.pos.z - e.z, l = Math.hypot(tx, ty, tz) || 1;
    return (tx * d.x + ty * d.y + tz * d.z) / l > 0.6 && this.canSee(P);
  }
  /* a hunter's next bite: the closest of these animals, within range */
  huntPrey(types, range, water) {
    let best = null, bd = range;
    for (const m of G.mobs) {
      if (m === this || m.dead || m.remoteCtl || !types.includes(m.type)) continue;
      if (water && !G.world.liquidAt(m.pos.x, m.pos.y + 0.3, m.pos.z)) continue;
      const d = m.pos.distanceTo(this.pos);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  chase(t, speed, dmg, dt) {
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
    if (l < 1.2 + t.w / 2 && Math.abs(t.pos.y - this.pos.y) < 1.5 && this.attackCd <= 0) { this.attackCd = 1; t.hurt(dmg, this.pos, 4, false); }
    if (T_isFly(this)) this.homeY = t.pos.y + 0.3;
    return { x: dx / l, z: dz / l, speed };
  }
  /* returns where to go ({x, z, speed}), 'gone' if this mob just left the world, or nothing */
  extraAI(dt, P, dist, inLiquid, hostileNow, canTarget) {
    const T = this.T, now = performance.now(), W = G.world;
    switch (this.type) {
      case 'creaking':
        if (!G.isNight() || (this.heart && G.world.isLoaded(this.heart[0], this.heart[2]) && !DEFS[G.world.getBlock(...this.heart)].creakingHeart)) { G.particles.burst(this.pos.x, this.pos.y + 1.3, this.pos.z, [0x5a4a3a, 0x9aa094], 20, 2, 0.15); this.removeSilently(); return 'gone'; } // it crumbles at sunrise, or when its heart is broken
        if (this.frozen) { this.vel.x = this.vel.z = 0; return { x: 0, z: 0 }; }
        break;
      case 'polar_bear':
        if (!this.baby && !this.angry && canTarget && dist < 6 && G.mobs.some(m => m.type === 'polar_bear' && m.baby && !m.dead && m.pos.distanceTo(P.pos) < 5)) { this.angry = true; G.sound.play('mob_polar_bear', this.pos); }
        break;
      case 'trader_llama': {
        // trader llamas follow their trader, and spit at anyone who hurts him
        const t = this.trader;
        if (t && !t.dead && !t.removed && !hostileNow && !this.rider) { const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, l = Math.hypot(dx, dz); if (l > 4) return { x: dx / l, z: dz / l, speed: 3.2 }; }
        if (t && (t.dead || t.removed) && !this.tame) this.trader = null;
        break;
      }
      case 'wandering_trader':
        this.lifeT = (this.lifeT || 0) + dt;
        if (this.lifeT > 900 && dist > 24) { for (const m of G.mobs) if (m.trader === this && !m.tame) m.removeSilently(); this.removeSilently(); return 'gone'; } // after a while he wanders off
        break;
      case 'fox':
        if (!this.tame && !this.fleeT) { const prey = (this.preyCheck = (this.preyCheck || 0) - dt) <= 0 ? (this.preyCheck = 3, this.prey = this.huntPrey(['chicken', 'rabbit'], 10)) : this.prey; if (prey && !prey.dead && Math.random() < 0.9) return this.chase(prey, 4.2, 2, dt); }
        break;
      case 'axolotl':
        if (inLiquid === ID.water) { if ((this.preyCheck = (this.preyCheck || 0) - dt) <= 0) { this.preyCheck = 2; this.prey = this.huntPrey(['cod', 'salmon', 'tropical_fish', 'squid', 'glow_squid', 'drowned', 'guardian'], 8, true); } if (this.prey && !this.prey.dead) { const r = this.chase(this.prey, 3, 2, dt); this.swimY = this.prey.pos.y; return r; } }
        break;
      case 'sniffer':
        // now and then it sniffs and digs up an old seed: a torchflower or a pitcher plant
        this.digWait = (this.digWait === undefined ? 20 + Math.random() * 40 : this.digWait) - dt;
        if (this.digWait <= 0 && this.onGround) {
          const g = W.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.5), Math.floor(this.pos.z));
          if (g === ID.grass || g === ID.dirt || g === ID.moss_block || g === ID.mycelium) {
            this.digT = (this.digT || 0) + dt;
            if (this.parts.head) this.parts.head.rotation.x = 0.6;
            if (Math.random() < dt * 8) G.particles.blockBreak(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.5), Math.floor(this.pos.z), g);
            if (this.digT > 3) { this.digT = 0; this.digWait = 40 + Math.random() * 60; if (this.parts.head) this.parts.head.rotation.x = 0; G.spawnDrop(Math.random() < 0.5 ? ID.torchflower : ID.pitcher_plant, 1, this.pos.x, this.pos.y + 0.5, this.pos.z); }
            return { x: 0, z: 0 };
          }
          this.digWait = 5;
        }
        break;
      case 'frog': {
        // frogs eat small slimes (a slimeball) and small magma cubes (a froglight)
        if ((this.preyCheck = (this.preyCheck || 0) - dt) <= 0) {
          this.preyCheck = 1;
          const t = G.mobs.find(m => (m.type === 'slime' || m.type === 'magma_cube') && m.small && !m.dead && !m.remoteCtl && m.pos.distanceTo(this.pos) < 3);
          if (t) { G.particles.burst(t.pos.x, t.pos.y + 0.3, t.pos.z, [0xd84a7a, 0xffffff], 8, 1.5, 0.1); G.spawnDrop(t.type === 'slime' ? ID.slime_ball : ID.froglight, 1, t.pos.x, t.pos.y + 0.3, t.pos.z); t.removeSilently(); G.sound.play('eat', this.pos); }
        }
        if (this.onGround && Math.random() < dt * 0.3) this.vel.y = 6; // hop
        break;
      }
      case 'goat': {
        // a goat lowers its head and rams you now and then
        if (this.ramT > 0) {
          this.ramT -= dt;
          const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
          if (l < 1.4 && Math.abs(P.pos.y - this.pos.y) < 1.5) { this.ramT = 0; P.hurt(G.mobDmg(1), this.pos, 14, false, 'A goat rammed you!'); P.vel.y = 7; G.sound.play('golem', this.pos); }
          return { x: dx / l, z: dz / l, speed: 7 };
        }
        this.ramWait = (this.ramWait === undefined ? 30 + Math.random() * 60 : this.ramWait) - dt;
        if (this.ramWait <= 0) { this.ramWait = 30 + Math.random() * 60; if (canTarget && dist < 9 && !this.tame) { this.ramT = 2.5; G.sound.play('mob_goat', this.pos); } }
        break;
      }
      case 'armadillo':
        // it drops a scute now and then; it rolls up into a ball when you run at it (or after it gets hurt)
        this.scuteT = (this.scuteT === undefined ? 300 + Math.random() * 300 : this.scuteT) - dt;
        if (this.scuteT <= 0) { this.scuteT = 300 + Math.random() * 300; G.spawnDrop(ID.armadillo_scute, 1, this.pos.x, this.pos.y + 0.3, this.pos.z); }
        if (dist < 5 && P.sprinting) this.rolledT = 4;
        if (this.rolledT > 0) { this.rolledT -= dt; this.mesh.scale.y = 0.6; return { x: 0, z: 0 }; }
        this.mesh.scale.y = 1;
        break;
      case 'snow_golem': {
        // throws snowballs at monsters
        this.shootCd -= dt;
        if ((this.preyCheck = (this.preyCheck || 0) - dt) <= 0) { this.preyCheck = 1; this.prey = null; let bd = 12; for (const m of G.mobs) if (!m.dead && m.T.hostile && m.pos.distanceTo(this.pos) < bd) { bd = m.pos.distanceTo(this.pos); this.prey = m; } }
        const t = this.prey;
        if (t && !t.dead) {
          this.yaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
          if (this.shootCd <= 0) { this.shootCd = 1; const from = new V3(this.pos.x, this.pos.y + 1.3, this.pos.z), dir = new V3(t.pos.x, t.pos.y + t.h / 2 + 0.5, t.pos.z).sub(from).normalize(); G.spawnProjectile('snowball', from.addScaledVector(dir, 0.6), dir.multiplyScalar(20), this); }
          return { x: 0, z: 0 };
        }
        // it melts in hot places
        const b = W.biomeAt(this.pos.x, this.pos.z, W.heightAt(Math.floor(this.pos.x), Math.floor(this.pos.z)));
        if ((G.dim === 'nether' || b === BIOME.DESERT || b === BIOME.BADLANDS || b === BIOME.SAVANNA) && Math.random() < dt) this.hurt(1, null);
        break;
      }
      case 'allay': {
        // give it an item: it finds more of the same lying around and brings them to you
        if (this.carry === undefined) this.carry = 0;
        if (!this.holding) { this.homeY = P.pos.y + 1.5; const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, l = Math.hypot(dx, dz); return l > 4 && l < 64 ? { x: dx / l, z: dz / l, speed: 4 } : { x: 0, z: 0 }; }
        if (this.carry > 0 && (this.carry >= 16 || !this.target)) {
          const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, l = Math.hypot(dx, dz);
          this.homeY = P.pos.y + 1.4;
          if (l < 2.2) { G.spawnDrop(this.holding, this.carry, P.pos.x, P.pos.y + 1, P.pos.z); this.carry = 0; G.sound.play('pickup', this.pos); }
          return l > 0.5 ? { x: dx / l, z: dz / l, speed: 5 } : null;
        }
        if ((this.preyCheck = (this.preyCheck || 0) - dt) <= 0) { this.preyCheck = 1.5; this.target = null; let bd = 24; for (const d of G.drops) if (!d.done && d.id === this.holding && !d.owner && d.pos.distanceTo(this.pos) < bd) { bd = d.pos.distanceTo(this.pos); this.target = d; } }
        const d = this.target;
        if (d && !d.done) {
          const dx = d.pos.x - this.pos.x, dz = d.pos.z - this.pos.z, l = Math.hypot(dx, dz);
          this.homeY = d.pos.y + 0.3;
          if (l < 1.2 && Math.abs(d.pos.y - this.pos.y) < 2) { this.carry += d.count; Net.dropPicked(d.did); d.finish(); this.target = null; G.sound.play('pickup', this.pos); }
          return { x: dx / (l || 1), z: dz / (l || 1), speed: 5 };
        }
        this.target = null;
        const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, l = Math.hypot(dx, dz); this.homeY = P.pos.y + 1.5;
        return l > 4 ? { x: dx / l, z: dz / l, speed: 4 } : { x: 0, z: 0 };
      }
      case 'bat':
        if (Math.random() < dt * 0.8) this.homeY = this.pos.y + (Math.random() - 0.5) * 4;
        if (Math.random() < dt) this.wanderDir = Math.random() * Math.PI * 2;
        return { x: Math.sin(this.wanderDir || 0), z: Math.cos(this.wanderDir || 0), speed: 3 };
      case 'evoker':
        // calls up vexes and keeps its distance
        if (hostileNow && canTarget && dist < 16) {
          this.spellCd = (this.spellCd === undefined ? 2 : this.spellCd) - dt;
          if (this.spellCd <= 0 && G.mobs.filter(m => m.type === 'vex' && !m.dead).length < 6) {
            this.spellCd = 12;
            for (let i = 0; i < 3; i++) spawnMob('vex', this.pos.x + (Math.random() - 0.5) * 2, this.pos.y + 1.5, this.pos.z + (Math.random() - 0.5) * 2);
            G.particles.burst(this.pos.x, this.pos.y + 2, this.pos.z, [0xa8c0d8, 0xffffff], 14, 2, 0.12, -1); G.sound.play('teleport', this.pos);
          }
          if (dist < 6) { const l = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) || 1; return { x: -(P.pos.x - this.pos.x) / l, z: -(P.pos.z - this.pos.z) / l, speed: 3 }; }
        }
        break;
      case 'vex':
        this.lifeT = (this.lifeT || 0) + dt;
        if (this.lifeT > 30) { this.hurt(99, null); return 'gone'; }
        break;
      case 'zombie_villager':
        if (this.cureT > 0) { this.cureT -= dt; if (Math.random() < dt * 6) G.particles.burst(this.pos.x, this.pos.y + 1.6, this.pos.z, [0xffc040, 0xff6060], 2, 0.8, 0.08, -1); if (this.cureT <= 0) { spawnMob('villager', this.pos.x, this.pos.y, this.pos.z); G.particles.burst(this.pos.x, this.pos.y + 1, this.pos.z, [0x4ad84a], 16, 2); this.removeSilently(); G.ui.message('You cured the zombie villager! It is a villager again.', 'gold'); return 'gone'; } return { x: 0, z: 0 }; }
        break;
      case 'piglin':
        if (this.barterT > 0) { this.barterT -= dt; if (this.barterT <= 0) { const k = BARTER[Math.random() * BARTER.length | 0]; if (ID[k[0]]) G.spawnDrop(ID[k[0]], k[1] + (Math.random() * (k[2] - k[1] + 1) | 0), this.pos.x, this.pos.y + 1, this.pos.z); } return { x: 0, z: 0 }; }
        break;
      case 'slime': case 'magma_cube': case 'breeze':
        if (this.onGround && (moveHint(this) || T.hops) && Math.random() < dt * 1.5) this.vel.y = this.small ? 5 : 7.5; // they hop along
        break;
    }
    return null;
  }

  /* right-click (or tap) on an animal: feed, tame, sit or ride. Returns true if something happened. */
  interact(P, hd) {
    if (this.dead) return false;
    if (this.T.boat) return this.boatInteract(P);
    // a name tag (named at an anvil) gives this mob that name for good, and it never goes away
    if (hd && hd.key === 'name_tag') {
      const s = P.heldSlot(), n = s && s.n;
      if (!n) { G.ui.message('Name the name tag at an anvil first, then use it on a mob.'); return true; }
      if (n === this.customName) return true;
      if (this.remoteCtl) Net.mobName(this, n); else this.setName(n);
      if (P.mode === 'survival') P.inv.takeFrom(P.sel, 1);
      G.ui.message('This ' + this.T.name.toLowerCase() + ' is now called \u201c' + n + '\u201d.', 'gold');
      return true;
    }
    if ((this.type === 'villager' || this.type === 'wandering_trader') && !(hd && hd.key === 'lead')) { G.ui.openTrades(this); return true; }
    // piglins trade: give one a gold ingot and it throws you something back
    if (this.type === 'piglin' && hd && hd.key === 'gold_ingot' && !this.remoteCtl && !(this.barterT > 0)) { if (P.mode === 'survival') P.inv.takeFrom(P.sel, 1); this.barterT = 2.5; this.angry = false; G.sound.play('mob_piglin', this.pos); return true; }
    // a golden apple cures a zombie villager
    if (this.type === 'zombie_villager' && hd && hd.key === 'golden_apple' && !this.remoteCtl && !(this.cureT > 0)) { if (P.mode === 'survival') P.inv.takeFrom(P.sel, 1); this.cureT = 5; G.ui.message('The zombie villager is shaking... it is being cured!'); return true; }
    // an allay: give it an item to collect, tap it again with an empty hand to take it back
    if (this.type === 'allay' && !this.remoteCtl) {
      if (!this.holding && hd) { this.holding = hd.id; if (P.mode === 'survival') P.inv.takeFrom(P.sel, 1); G.ui.message('The allay will find more ' + hd.name.toLowerCase() + ' and bring it to you.', 'gold'); return true; }
      if (this.holding && !hd) { P.inv.add(this.holding, 1 + (this.carry || 0)); P.inv.changed(); this.holding = null; this.carry = 0; return true; }
      return false;
    }
    // foxes trust you after glow berries, parrots after seeds: then they follow you like a pet
    if ((this.type === 'fox' || this.type === 'parrot') && !this.remoteCtl) {
      const food = this.type === 'fox' ? 'glow_berries' : 'wheat_seeds';
      if (!this.tame && hd && hd.key === food) {
        if (P.mode === 'survival') P.inv.takeFrom(P.sel, 1);
        if (Math.random() < 0.34 || P.mode === 'creative') this.makeTame(); else G.particles.burst(this.pos.x, this.pos.y + 0.6, this.pos.z, [0x555555, 0x888888], 8, 1.5, 0.12);
        return true;
      }
      if (this.tame && !hd) { this.sitting = !this.sitting; this.perched = false; G.ui.message(this.sitting ? 'Your ' + this.T.name.toLowerCase() + ' waits here.' : 'Your ' + this.T.name.toLowerCase() + ' follows you again.'); return true; }
      if (!this.tame && hd && !lovesFood(this.type, hd.id)) { G.ui.message(this.type === 'fox' ? 'Foxes love glow berries. Hold some and tap the fox.' : 'Parrots love seeds. Hold wheat seeds and tap the parrot.'); return true; }
    }
    // wolf armor (made from armadillo scutes) protects your wolf
    if (this.type === 'wolf' && this.tame && hd && hd.key === 'wolf_armor' && !this.remoteCtl) { const old = this.armor; this.armor = 'wolf_armor'; P.inv.takeFrom(P.sel, 1); if (old) P.inv.add(ID[old], 1); P.inv.changed(); this.dress(); G.ui.message('Your wolf is wearing wolf armor!', 'gold'); return true; }
    // a rope: tie up an animal so it follows you, or untie it
    if (this.leash && (!hd || hd.key === 'lead') && !this.remoteCtl) { this.unleash(false); P.inv.add(ID.lead, 1); P.inv.changed(); G.ui.message('You untied the ' + this.T.name.toLowerCase() + '.'); return true; }
    if (hd && hd.key === 'lead' && !this.T.hostile && !this.leash) {
      if (this.remoteCtl) { if (this.tame) { G.ui.message('This ' + this.T.name.toLowerCase() + ' belongs to ' + Net.nameOf(this.remoteCtl) + '.'); return true; } Net.claimMob(this, hd.id); return true; }
      this.leash = 'player';
      if (P.mode === 'survival') P.inv.takeFrom(P.sel, 1);
      G.ui.message('The ' + this.T.name.toLowerCase() + ' is on a rope and follows you. Tap a fence to tie it there.', 'gold');
      return true;
    }
    if (this.remoteCtl && (this.type === 'wolf' || this.type === 'cat' || this.T.horsey)) {
      // a wolf or horse another player's game runs: if nobody tamed it yet, ask for it, then tame it here
      if (this.tame) { G.ui.message('This ' + this.T.name.toLowerCase() + ' is already tamed by ' + Net.nameOf(this.remoteCtl) + '.'); return true; }
      Net.claimMob(this, hd ? hd.id : 0);
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
    if (this.type === 'cat') {
      // a cat is tamed with raw fish (it may take a few), heals with fish, and sits or follows when you tap it
      const fish = hd && (hd.key === 'cod' || hd.key === 'salmon');
      if (!this.tame && fish) {
        if (P.mode === 'survival') P.inv.takeFrom(P.sel, 1);
        if (Math.random() < 0.34 || P.mode === 'creative') this.makeTame();
        else G.particles.burst(this.pos.x, this.pos.y + 0.8, this.pos.z, [0x555555, 0x888888], 8, 1.5, 0.12);
        return true;
      }
      if (!this.tame) { if (hd) G.ui.message('Cats love fish. Hold raw cod or salmon and tap the cat.'); return !!hd; }
      if (fish && this.hp < 10) { if (P.mode === 'survival') P.inv.takeFrom(P.sel, 1); this.hp = Math.min(10, this.hp + 4); this.hearts(); return true; }
      this.sitting = !this.sitting; G.ui.message(this.sitting ? 'Your cat sits and waits.' : 'Your cat follows you again.'); return true;
    }
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
    if (this.T.horsey) {
      // a tamed horse or donkey: put on armor, strap on a chest, or (sneaking) open its chest / take the armor off
      if (this.tame && hd && hd.horseArmor) {
        if (this.type !== 'horse') { G.ui.message('Only horses can wear horse armor.'); return true; }
        const old = this.armor;
        this.armor = hd.key;
        P.inv.takeFrom(P.sel, 1);
        if (old) P.inv.add(ID[old], 1);
        P.inv.changed(); this.dress();
        G.sound.play('craft', this.pos);
        G.ui.message('Your horse is wearing ' + hd.name.toLowerCase() + '.', 'gold');
        return true;
      }
      if (this.tame && hd && hd.key === 'chest' && !this.chestSlots) {
        this.chestSlots = new Array(27).fill(null);
        P.inv.takeFrom(P.sel, 1); P.inv.changed(); this.dress();
        G.sound.play('craft', this.pos);
        G.ui.message('Chest strapped on! Ride it and open Items to use the chest, or tap it while sneaking.', 'gold');
        return true;
      }
      if (this.tame && P.sneaking && !P.riding) {
        if (this.chestSlots) { G.ui.openInventory('chest', { slots: this.chestSlots, mob: this }); return true; }
        if (this.armor) { P.inv.add(ID[this.armor], 1); P.inv.changed(); this.armor = null; this.dress(); G.ui.message('You took the armor off.'); return true; }
      }
      if (hd && (hd.key === 'apple' || hd.key === 'golden_apple' || hd.key === 'hay_bale' || hd.key === 'melon_slice')) {
        if (P.mode === 'survival') P.inv.takeFrom(P.sel, 1);
        this.hp = Math.min(30, this.hp + 4);
        this.tameProgress = (this.tameProgress || 0) + 0.35;
        if (this.tameProgress >= 1 && !this.tame) this.makeTame(); else this.hearts();
        return true;
      }
      if (P.riding) return false;
      if (this.tame || P.mode === 'creative') { P.mount(this); return true; }
      // a wild horse has to be tamed with apples first
      G.ui.message('This ' + this.T.name.toLowerCase() + ' is wild. Hold apples and tap it to feed it: a few apples and it is yours.');
      return true;
    }
    return false;
  }

  /* on touch screens a tap on this animal should feed/ride it instead of hitting it */
  wantsInteract(P) {
    const hd = P.heldDef();
    // holding food it loves (or a bucket for a cow): a tap feeds it instead of hitting it
    if (hd && lovesFood(this.type, hd.id)) return true;
    if (hd && hd.key === 'name_tag') return true;
    if (hd && hd.key === 'bucket' && (this.type === 'cow' || this.type === 'goat')) return true;
    if (hd && hd.key === 'bowl' && this.type === 'mooshroom') return true;
    if (hd && hd.key === 'water_bucket' && ['cod', 'salmon', 'tropical_fish', 'axolotl'].includes(this.type)) return true;
    if (this.type === 'wandering_trader' || this.type === 'allay') return true;
    if (hd && ((this.type === 'piglin' && hd.key === 'gold_ingot') || (this.type === 'zombie_villager' && hd.key === 'golden_apple') || (this.type === 'fox' && hd.key === 'glow_berries') || (this.type === 'parrot' && hd.key === 'wheat_seeds') || (this.type === 'wolf' && hd.key === 'wolf_armor'))) return true;
    if ((this.type === 'fox' || this.type === 'parrot') && this.tame && !hd) return true;
    // holding a sword or an axe, a tap on a horse or donkey hits it
    if (this.T.horsey && hd && /_sword$|_axe$/.test(hd.key) && !P.riding) return false;
    if (this.T.horsey || this.T.boat || this.leash || this.type === 'villager') return true;
    if (hd && hd.key === 'lead' && !this.T.hostile) return true;
    if (this.type === 'wolf') return (this.tame && !(hd && /_sword$|_axe$/.test(hd.key))) || !!(hd && hd.key === 'bone');
    if (this.type === 'cat') return (this.tame && !(hd && /_sword$|_axe$/.test(hd.key))) || !!(hd && (hd.key === 'cod' || hd.key === 'salmon'));
    return false;
  }

  /* villagers: take the job of a free work block nearby (and lose it if the block goes) */
  jobTick(dt) {
    this.jobT = (this.jobT || Math.random() * 2) - dt;
    if (this.jobT > 0) return;
    this.jobT = 4;
    const W = G.world, j = this.job;
    if (j && DEFS[W.getBlock(j.x, j.y, j.z)].job !== this.prof) { this.job = null; this.prof = null; this.dressJob(); }
    if (this.job) return;
    const bx = Math.floor(this.pos.x), by = Math.floor(this.pos.y), bz = Math.floor(this.pos.z);
    for (let dy = -2; dy <= 2; dy++) for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
      const id = W.getBlock(bx + dx, by + dy, bz + dz), job = DEFS[id] && DEFS[id].job;
      if (!job) continue;
      const x = bx + dx, y = by + dy, z = bz + dz;
      if (G.mobs.some(m => m !== this && m.job && m.job.x === x && m.job.y === y && m.job.z === z)) continue;
      this.job = { x, y, z }; this.prof = job; this.dressJob();
      G.particles.burst(this.pos.x, this.pos.y + 2.1, this.pos.z, [0x4ad84a, 0x9aff9a], 8, 1.2, 0.12, -1);
      return;
    }
  }
  dressJob() {
    const r = this.parts.robe;
    if (!r) return;
    const c = VILLAGER_JOBS[this.prof];
    r.visible = !!c;
    if (c) r.material.color.setHex(c.color);
  }

  /* show horse armor and chests */
  dress() {
    const a = this.armor && HORSE_ARMOR[this.armor];
    if (this.parts.armorParts) for (const p of this.parts.armorParts) { p.visible = !!a; if (a) p.material.color.setHex(a.color); }
    if (this.parts.chests) for (const c of this.parts.chests) c.visible = !!(this.chestSlots || this.chestShown);
  }

  /* where the rope pulls to: the player holding it, or the fence it's tied to (null if the fence is gone) */
  leashTarget() {
    if (this.leash === 'player') return G.player.dead ? null : G.player.pos;
    const f = this.leash;
    if (!f || !DEFS[G.world.getBlock(f.x, f.y, f.z)].fence) return G.world.isLoaded(f.x, f.z) ? null : { x: f.x + 0.5, z: f.z + 0.5 };
    return { x: f.x + 0.5, z: f.z + 0.5 };
  }
  unleash(dropRope) {
    if (!this.leash) return;
    this.leash = null;
    if (dropRope) G.spawnDrop(ID.lead, 1, this.pos.x, this.pos.y + 0.6, this.pos.z);
  }

  /* ---------- boats: two seats, the front one steers ---------- */
  boatInteract(P) {
    if (P.riding) return false;
    const taken = Net.boatSeats(this);
    if (this.remoteCtl && !taken[0]) { Net.claimMob(this, 0); return true; } // ask for it, then get in the front seat
    for (const seat of [0, 1]) if (!taken[seat]) { P.mount(this, seat); return true; }
    G.ui.message('This boat is full: it fits two.');
    return true;
  }
  boatTick(dt) {
    const W = G.world;
    if (this.dead) { G.particles.burst(this.pos.x, this.pos.y + 0.3, this.pos.z, [0x9a6a32, 0x6e4a22], 14, 2); this.remove(); return; }
    this.hurtT -= dt;
    // float: find the water surface under or around the boat
    const bx = Math.floor(this.pos.x), bz = Math.floor(this.pos.z);
    let surf = null;
    for (let y = Math.floor(this.pos.y + 0.6); y >= Math.floor(this.pos.y - 0.3); y--) {
      if (W.getBlock(bx, y, bz) === ID.water) { let t = y; while (t < y + 4 && W.getBlock(bx, t + 1, bz) === ID.water) t++; surf = t + 0.875; break; }
    }
    if (surf !== null) {
      const want = surf - 0.32;
      this.vel.y += ((want - this.pos.y) * 8 - this.vel.y) * Math.min(1, dt * 6);
    } else this.vel.y = Math.max(this.vel.y - 25 * dt, -30);
    const onWater = surf !== null;
    const dv = this.drive;
    let mx = 0, mz = 0;
    if (dv && (dv.x || dv.z)) {
      mx = dv.x; mz = dv.z;
      let d = Math.atan2(mx, mz) - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += clamp(d, -3 * dt, 3 * dt);
    }
    const speed = onWater ? 7 : 1.2;
    const k = Math.min(1, (onWater ? 1.6 : 4) * dt);
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.z += (mz * speed - this.vel.z) * k;
    W.moveBody(this, dt);
    if (this.pos.y < -20) { this.remove(); return; }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.parts.oars) { this.oarT = (this.oarT || 0) + sp * dt * 2.5; for (const [i, o] of this.parts.oars.entries()) o.rotation.x = Math.sin(this.oarT + i * Math.PI) * 0.5 * Math.min(1, sp); }
    let d = this.yaw - this.mesh.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.mesh.rotation.y += d * Math.min(1, dt * 10);
    this.mesh.position.copy(this.pos);
    if (onWater) this.mesh.rotation.z = Math.sin(performance.now() / 600 + this.pos.x) * 0.03;
    for (const m of this.mats) if (m.emissive) m.emissive.setRGB(this.hurtT > 0 ? 0.5 : 0, 0, 0);
  }

  makeTame() {
    this.tame = true; this.angry = false;
    if (this.type === 'cat') { if (this.parts.collar) this.parts.collar.visible = true; G.ui.message('You tamed a cat! It follows you, and creepers stay away from it. Tap it to make it sit.', 'gold'); }
    if (this.type === 'wolf') { this.hp = 20; if (this.parts.collar) this.parts.collar.visible = true; G.ui.message('You tamed a wolf! It follows you and fights monsters. Tap it to make it sit.', 'gold'); }
    if (this.T.horsey) { if (this.parts.saddle) this.parts.saddle.visible = true; G.ui.message('You tamed the ' + this.T.name.toLowerCase() + '! Tap it to ride, and press sneak to get off.' + (this.type === 'donkey' || this.type === 'mule' || this.type === 'llama' ? ' Tap it holding a chest to give it a chest.' : this.type === 'horse' ? ' Tap it holding horse armor to protect it.' : ''), 'gold'); }
    if (this.type === 'fox') G.ui.message('The fox trusts you now! It follows you. Tap it with an empty hand to make it wait.', 'gold');
    if (this.type === 'parrot') G.ui.message('You tamed a parrot! It flies with you and sits on your shoulder. Jump to make it fly off.', 'gold');
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
    // a big slime or magma cube splits into little ones
    if ((this.type === 'slime' || this.type === 'magma_cube') && !this.small) for (let i = 0; i < 2 + (Math.random() * 2 | 0); i++) spawnMob(this.type, this.pos.x + (Math.random() - 0.5), this.pos.y + 0.3, this.pos.z + (Math.random() - 0.5)).makeSmall();
    G.sound.play(this.T.boat ? 'break' : 'deathMob', this.pos);
    // whatever it carried falls out
    const drop = (id, n) => { if (id && n > 0) G.spawnDrop(id, n, this.pos.x, this.pos.y + 0.6, this.pos.z); };
    if (this.chestSlots) { for (const s of this.chestSlots) if (s) G.spawnDrop(s.id, s.count, this.pos.x, this.pos.y + 0.6, this.pos.z, undefined, slotExtras(s)); drop(ID.chest, 1); this.chestSlots = null; }
    if (this.armor) { drop(ID[this.armor], 1); this.armor = null; }
    if (this.leash) this.unleash(true);
    if (this.T.boat && !byPlayer) drop(ID.boat, 1);
    // killed while burning (by you, or by the fire itself): the meat comes out cooked
    const cooked = this.onFire > 0 || Date.now() - (this.burnedAt || 0) < 2500;
    if (byPlayer || (cooked && !this.T.hostile)) {
      const COOK = { porkchop: 'cooked_porkchop', beef: 'steak', chicken: 'cooked_chicken' };
      if (!this.baby) for (const [k0, a, b] of this.T.drops) {
        const k = cooked && COOK[k0] ? COOK[k0] : k0;
        const n = a + Math.floor(Math.random() * (b - a + 1)) + (byPlayer && G.looting ? Math.floor(Math.random() * (G.looting + 1)) : 0); // Looting: a few extra
        if (n > 0) G.spawnDrop(ID[k], n, this.pos.x, this.pos.y + 0.5, this.pos.z);
      }
      if (this.type === 'wither_skeleton' && byPlayer && Math.random() < 0.1 + 0.05 * (G.looting || 0)) G.spawnDrop(ID.wither_skull, 1, this.pos.x, this.pos.y + 0.5, this.pos.z);
      if (this.type === 'wither') G.ui.message('You defeated the Wither! Pick up the Nether Star: it makes a beacon.', 'gold');
      if (byPlayer) G.player.addXp(this.T.xp);
    }
  }

  update(dt) {
    if (this.remoteCtl) return this.puppetUpdate(dt);
    if (!G.world.isLoaded(this.pos.x, this.pos.z)) return; // the ground here isn't loaded: wait
    if (this.T.boat) return this.boatTick(dt);
    if (this.type === 'villager') this.jobTick(dt);
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
    // piglins leave you alone only if you wear something gold, like Minecraft
    if (T.goldLover && !this.angry && canTarget && dist < 10 && !P.inv.slots.slice(36, 40).some(sl => sl && /^golden_/.test(DEFS[sl.id].key))) hostileNow = true;
    if (this.type === 'warden') hostileNow = this.wardenHears(P, dist, dt);
    // the creaking only moves while nobody is looking at it
    if (this.type === 'creaking') { this.frozen = this.watched(P, dist); if (this.frozen) hostileNow = false; }
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
    } else if (this.tame && (this.type === 'wolf' || this.type === 'cat' || T.pet)) {
      // a tamed wolf follows you, teleports back if left behind, and fights whatever you fight
      const tgt = this.petTarget;
      // gone, too far, or a player who left for another world (the Nether, the End) or the game
      if (tgt && (tgt.dead || tgt.removed || tgt.pos.distanceTo(this.pos) > 20 || (tgt.remote && (!tgt.remote.inWorld || tgt.remote.dim !== G.dim)))) this.petTarget = null;
      if (this.petTarget && !this.sitting) {
        const t = this.petTarget, dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
        moveX = dx / l; moveZ = dz / l; speed = 4.5; this.yaw = Math.atan2(moveX, moveZ);
        // only bites what it can reach: not someone on the floor above or below
        if (l < 1.6 && Math.abs(t.pos.y - this.pos.y) < 1.5 && this.attackCd <= 0) {
          this.attackCd = 0.8;
          if (t.remote) { G.lastAttacker = this; t.hurt(4, this.pos, 5, true, 'A wolf bit you.'); } // a player: they take the bite on their own device
          else t.hurt(4, this.pos, 5, !!t.remoteCtl); // a mob another device runs: send it the bite
        }
      } else if (P.sleeping && !P.dead) {
        // you went to bed: your wolf lies down on its dog bed (if there is one near), or sits beside you
        if (!this.bedSpot) this.bedSpot = G.findDogBed(P.sleeping.x, P.sleeping.y, P.sleeping.z) || { x: P.sleeping.x + 1.5, y: P.sleeping.y, z: P.sleeping.z + 0.5, none: true };
        const b = this.bedSpot;
        this.pos.set(b.none ? b.x : b.x + 0.5, b.none ? G.world.surfaceY(Math.floor(b.x), Math.floor(b.z)) + 1 : b.y + 0.25, b.none ? b.z : b.z + 0.5); this.vel.set(0, 0, 0);
        this.resting = true;
      } else if (!this.sitting && !P.dead) {
        this.resting = false; this.bedSpot = null;
        const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, l = Math.hypot(dx, dz), up = Math.abs(P.pos.y - this.pos.y);
        // walk and run with you (as fast as a horse when it has to); jump to you only when you're far away, or far above or below
        const wantJump = l > 32 || (up > 8 && l < 12 && P.onGround) || up > 20;
        // jump to you only along an open way: behind a closed door it waits outside (checked now and then)
        this.jumpCheckT = (this.jumpCheckT || 0) - dt;
        if (wantJump && this.jumpCheckT <= 0) {
          this.jumpCheckT = 2;
          if (G.airConnected(this.pos.x, this.pos.y, this.pos.z, P.pos.x, P.pos.y, P.pos.z)) { this.pos.set(P.pos.x + (Math.random() - 0.5) * 2, P.pos.y, P.pos.z + (Math.random() - 0.5) * 2); this.vel.set(0, 0, 0); }
        }
        if (l > 3 && Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) > 3) { moveX = dx / l; moveZ = dz / l; speed = l > 14 ? 8.5 : l > 7 ? 5.5 : 3.5; this.yaw = Math.atan2(moveX, moveZ); }
        if (T.fly) this.homeY = P.pos.y + 1.6; // a parrot flies along beside your head
        // a parrot lands on your shoulder when you're close (and hops off when you jump)
        if (this.type === 'parrot') {
          if (this.perched && (P.vel.y > 3 || P.riding || l > 4 || P.dead)) { this.perched = false; this.perchCd = 3; }
          this.perchCd = Math.max(0, (this.perchCd || 0) - dt);
          if (!this.perched && l < 1.8 && !this.perchCd && P.onGround) this.perched = true;
        }
      } else { this.resting = false; this.bedSpot = null; }
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
      if (T.ranged === 'blaze' || T.ranged === 'ghast' || T.ranged === 'wither') {
        const ghast = T.ranged === 'ghast' || T.ranged === 'wither';
        const near = ghast ? 12 : 5, far = ghast ? 26 : 10;
        if (dist < near) { moveX = -moveX; moveZ = -moveZ; } else if (dist < far) { moveX *= 0.15; moveZ *= 0.15; }
        this.shootCd -= dt;
        if (this.shootCd <= 0 && this.canSee(P)) {
          const from = new V3(this.pos.x, this.pos.y + (ghast ? 2.3 : 1.4), this.pos.z);
          const dir = new V3(P.pos.x, P.pos.y + 1.2, P.pos.z).sub(from).normalize();
          if (ghast) {
            this.shootCd = T.ranged === 'wither' ? 1.2 + Math.random() * 0.8 : 3 + Math.random() * 2;
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
          const kind = T.shoot || 'arrow';
          G.spawnProjectile(kind, from, dir.normalize().multiplyScalar(kind === 'laser' ? 30 : kind === 'spit' ? 18 : kind === 'wind' ? 16 : 24), this);
          G.sound.play(kind === 'spit' ? 'llamaSpit' : kind === 'arrow' ? 'bow' : 'fireball', this.pos);
          if (kind === 'spit' && (this.spits = (this.spits || 0) + 1) >= 2) { this.angry = false; this.spits = 0; } // a llama spits a couple of times, then calms down
        }
      } else if (T.explode && G.mobs.some(c => c.type === 'cat' && !c.dead && c.pos.distanceTo(this.pos) < 6)) {
        // like Minecraft: creepers are scared of cats and run away from them
        const c = G.mobs.find(c2 => c2.type === 'cat' && !c2.dead && c2.pos.distanceTo(this.pos) < 6), ax = this.pos.x - c.pos.x, az = this.pos.z - c.pos.z, al = Math.hypot(ax, az) || 1;
        moveX = ax / al; moveZ = az / al; this.yaw = Math.atan2(moveX, moveZ); this.fuse = 0;
      } else if (T.explode) {
        if (dist < 3) { this.fuse += dt; moveX *= 0.2; moveZ *= 0.2; if (this.fuse > 0 && this.fuse - dt <= 0) G.sound.play('fuse', this.pos); }
        else this.fuse = Math.max(0, this.fuse - dt);
        if (this.fuse > 1.5) { this.removeSilently(); G.explode(this.pos.x, this.pos.y + 0.8, this.pos.z, 3, true, false, null, 'A Creeper blew up next to you.'); return; }
      } else if (dist < 1.4 + this.w / 2 && Math.abs(toP.y) < 1.6 && this.attackCd <= 0) {
        this.attackCd = 1;
        G.lastAttacker = this;
        P.hurt(G.mobDmg(T.dmg * (this.small ? 0.5 : 1)), this.pos, 6, false, 'A ' + T.name + ' attacked you.');
        if (T.poison && P.mode === 'survival') P.addEffect && P.addEffect('poison', 1, 7);
        if (this.type === 'bee') { this.angry = false; this.stungAt = performance.now(); } // a bee loses its stinger, like Minecraft
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

    // everything special some animals and monsters do
    const ex = this.extraAI(dt, P, dist, inLiquid, hostileNow, canTarget);
    if (ex === 'gone') return;
    if (ex) { moveX = ex.x; moveZ = ex.z; if (ex.speed) speed = ex.speed; if (moveX || moveZ) this.yaw = Math.atan2(moveX, moveZ); }
    // bees: off to the flowers, then home with the nectar
    if (this.type === 'bee' && !hostileNow && !this.leash && G.beeGoal) {
      if (this.stungAt && performance.now() - this.stungAt > 9000) { this.hurt(99, null); return; }
      const g = G.beeGoal(this, dt);
      if (g) {
        const dx = g.x - this.pos.x, dz = g.z - this.pos.z, l = Math.hypot(dx, dz);
        if (l > 0.3) { moveX = dx / l; moveZ = dz / l; this.yaw = Math.atan2(moveX, moveZ); if (l < 2) speed *= 0.5; } else { moveX = moveZ = 0; }
        this.homeY = g.y;
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

    // on a rope: follow whoever holds it, or stay near the fence it's tied to
    if (this.leash && !this.rider) {
      const t = this.leashTarget();
      if (!t) this.unleash(true);
      else {
        const dx = t.x - this.pos.x, dz = t.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
        if (this.leash === 'player' && l > 16) { this.unleash(true); G.ui.message('The rope snapped!'); }
        else if (l > 3) {
          moveX = dx / l; moveZ = dz / l; speed = Math.max(T.speed, l > 6 ? 5.5 : 3.5); this.yaw = Math.atan2(moveX, moveZ);
          if (l > 7) { this.vel.x += moveX * 18 * dt; this.vel.z += moveZ * 18 * dt; } // pulled along
        } else if (this.leash === 'player' && l < 2) { moveX = 0; moveZ = 0; }
      }
    }

    // swimmers (fish, squid, dolphins, axolotls): stay in the water and swim up and down
    const swimming = T.swim && inLiquid === ID.water;
    if (swimming) {
      // never swim out onto land: turn around at the shore
      if (!T.amphib && (moveX || moveZ) && !W.liquidAt(this.pos.x + moveX * 0.9, this.pos.y + 0.3, this.pos.z + moveZ * 0.9)) {
        moveX = -moveX; moveZ = -moveZ; if (this.wanderDir != null) this.wanderDir += Math.PI; this.yaw = Math.atan2(moveX, moveZ);
      }
      this.swimT = (this.swimT || 0) - dt;
      if (this.swimT <= 0 || this.swimY === undefined) {
        this.swimT = 2 + Math.random() * 4;
        let top = Math.floor(this.pos.y), bot = top;
        while (top < WH - 1 && W.liquidAt(this.pos.x, top + 1.2, this.pos.z) === ID.water && top - this.pos.y < 12) top++;
        while (bot > 1 && W.liquidAt(this.pos.x, bot - 0.8, this.pos.z) === ID.water && this.pos.y - bot < 12) bot--;
        this.swimY = bot + 0.2 + Math.random() * Math.max(0, top - bot - 0.2);
      }
      if (this.wanderDir == null && this.fleeT <= 0 && !hostileNow) this.wanderDir = Math.random() * Math.PI * 2; // fish keep swimming
    }
    if (T.swim && !T.amphib && !swimming && !inLiquid) {
      // a fish on land flops about and slowly runs out of air
      this.dryT = (this.dryT || 0) + dt;
      if (this.onGround && Math.random() < dt * 2) { this.vel.y = 4; this.vel.x = (Math.random() - 0.5) * 3; this.vel.z = (Math.random() - 0.5) * 3; }
      if (this.dryT > 3) { this.dryT = 2; this.hurt(1, null); }
      moveX = moveZ = 0;
    } else this.dryT = 0;
    const accel = this.onGround || swimming ? 10 : 2;
    this.vel.x += (moveX * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (moveZ * speed - this.vel.z) * Math.min(1, accel * dt);
    if (T.fly) {
      if (this.homeY === undefined) this.homeY = this.pos.y;
      const engaged = hostileNow && canTarget;
      const wantY = (engaged ? P.pos.y + T.fly : this.homeY) + Math.sin(performance.now() / 700 + this.pos.x) * 0.6;
      this.vel.y += (clamp((wantY - this.pos.y) * 1.2, -3, 3) - this.vel.y) * Math.min(1, dt * 3);
    } else if (swimming) {
      this.vel.y += (clamp((this.swimY - this.pos.y) * 1.5, -2, 2) - this.vel.y) * Math.min(1, dt * 3);
    } else {
      if (inLiquid) { this.vel.y += (inLiquid === ID.lava ? (T.lavaWalk ? 40 : 6) : 14) * dt; this.vel.y *= 0.9; if (this.vel.y > 2.5) this.vel.y = 2.5; }
      this.vel.y -= 25 * dt;
      if (this.vel.y < -40) this.vel.y = -40;
    }
    const wantMove = moveX !== 0 || moveZ !== 0;
    W.mobMode = !this.rider; // a horse you ride can still jump fences
    W.moveBody(this, dt); W.mobMode = false;
    if (this.perched) { const a = P.yaw; this.pos.set(P.pos.x - Math.cos(a) * 0.45, P.pos.y + 1.45, P.pos.z + Math.sin(a) * 0.45); this.vel.set(0, 0, 0); this.yaw = a + Math.PI; }
    if (!T.fly && !swimming && this.hitH && wantMove && (this.onGround || inLiquid)) this.vel.y = 7.6;
    if (this.parts.ring) this.parts.ring.rotation.y += dt * 3;
    if (inLiquid === ID.lava && !T.fireproof && Math.random() < dt * 2) this.hurt(4, null);
    if (W.touching(this, ID.cactus, 0.05) && Math.random() < dt * 2) this.hurt(1, null);
    // fire: an animal or monster that walks into it burns for a while (water puts it out)
    if (!T.fireproof && W.touching(this, ID.fire, 0.02)) this.onFire = Math.max(this.onFire || 0, 6);
    if (inLiquid === ID.water) this.onFire = 0;
    if (this.onFire > 0) {
      this.onFire -= dt; this.fireDmgT = (this.fireDmgT || 0) - dt;
      if (this.fireDmgT <= 0) { this.fireDmgT = 1; this.burnedAt = Date.now(); this.hurt(1, null); }
      if (Math.random() < dt * 8) G.particles.burst(this.pos.x, this.pos.y + this.h * 0.6, this.pos.z, [0xff7a00, 0xffc000, 0xff3a00], 2, 1.2, 0.12, -1);
      if (T.passive && !this.rider) this.fleeT = Math.max(this.fleeT, 0.5);
    }
    if (this.pos.y < -20) this.remove();

    // sounds
    this.soundT -= dt;
    if (this.soundT <= 0) {
      this.soundT = this.type === 'bee' ? 1.2 + Math.random() * 1.5 : this.type === 'warden' ? 1.1 : 6 + Math.random() * 10; // bees keep buzzing; the warden's heart keeps beating
      if (dist < (this.type === 'bee' ? 10 : 20)) G.sound.play('mob_' + this.type, this.pos);
    }

    // animate
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.walk += hs * dt * 4;
    const sw = Math.sin(this.walk) * Math.min(1, hs / 2) * 0.8;
    if (this.type === 'ghast') this.parts.legs.forEach((L, i) => { L.rotation.x = Math.sin(performance.now() / 400 + i * 1.7) * 0.35; L.rotation.z = Math.cos(performance.now() / 500 + i) * 0.2; });
    else if (this.type === 'spider' || this.type === 'cave_spider') this.parts.legs.forEach((L, i) => { L.rotation.y = L.userData.baseY + Math.sin(this.walk * 1.5 + i) * 0.3 * Math.min(1, hs); });
    else this.parts.legs.forEach((L, i) => { L.rotation.x = (i % 2 === (i < 2 ? 0 : 1) ? sw : -sw); });
    if (this.type === 'wolf' || this.type === 'cat') {
      if (this.parts.tail) this.parts.tail.rotation.y = this.tame ? Math.sin(performance.now() / 120) * 0.5 : 0;
      if (this.sitting || this.resting) this.parts.legs.forEach((L, i) => { L.rotation.x = i >= 2 ? -1.2 : 0; });
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
      if (this.type !== 'ghast' && this.type !== 'spider' && this.type !== 'cave_spider') this.parts.legs.forEach((L, i) => { L.rotation.x = (i % 2 === (i < 2 ? 0 : 1) ? sw : -sw); });
    }
    const f = this.netFlags || 0;
    this.tame = !!(f & 2); this.sitting = !!(f & 4);
    if ((this.type === 'wolf' || this.type === 'cat') && this.sitting) this.parts.legs.forEach((L, i) => { L.rotation.x = i >= 2 ? -1.2 : 0; });
    const small = !!(f & 32);
    if (small !== this.baby) { if (small) this.makeBaby(9999); else this.growUp(); }
    if (this.parts.collar) this.parts.collar.visible = this.tame;
    if (this.parts.saddle) this.parts.saddle.visible = this.tame && this.T.horsey;
    if (this.type === 'villager') { const pj = JOB_NAMES[(f >> 10) & 7] || null; if (pj !== this.prof) { this.prof = pj; this.dressJob(); } }
    const ai = (f >> 6) & 7, ch = !!(f & 512);
    if (ai !== this.netArmor || ch !== this.netChest) { this.netArmor = ai; this.netChest = ch; this.armor = HORSE_ARMOR_KEYS[ai - 1] || null; this.chestShown = ch; this.dress(); }
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
  /* a name floating over its head (from a name tag) */
  setName(n) {
    n = cleanName(n);
    if (n === this.customName) return;
    this.customName = n;
    if (this.nameSprite) { this.mesh.remove(this.nameSprite); this.nameSprite.material.map.dispose(); this.nameSprite = null; }
    if (!n) return;
    const s = nameTag(n);
    s.position.set(0, this.h + 0.45, 0);
    s.scale.multiplyScalar(0.8);
    this.mesh.add(s); this.nameSprite = s;
  }
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
  spit: new THREE.BoxGeometry(0.15, 0.15, 0.15),
  snowball: new THREE.BoxGeometry(0.22, 0.22, 0.22),
  laser: new THREE.BoxGeometry(0.08, 0.08, 0.9),
  wind: new THREE.BoxGeometry(0.35, 0.35, 0.35),
  wind_charge: new THREE.BoxGeometry(0.3, 0.3, 0.3),
};
const PROJ_COLOR = { spit: 0xf0f0e0, snowball: 0xf4f8fc, laser: 0x5af8e8, wind: 0xc8e8f8, wind_charge: 0xc8e8f8 };
const MOB_FIRE = [0xff6a00, 0xffc000, 0x5a5a5a];
class Projectile {
  constructor(kind, pos, vel, owner) {
    this.kind = kind; this.pos = pos.clone(); this.vel = vel.clone(); this.owner = owner;
    this.life = kind === 'fireball' ? 8 : 12; this.stuck = false; this.done = false;
    let mat;
    if (kind === 'arrow') mat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
    else if (kind === 'fireball' || kind === 'smallfire') { this.colors = owner && owner.K ? owner.K.fire : MOB_FIRE; mat = new THREE.MeshBasicMaterial({ color: this.colors[0] }); }
    else if (PROJ_COLOR[kind]) mat = new THREE.MeshBasicMaterial({ color: PROJ_COLOR[kind], transparent: kind === 'wind' || kind === 'wind_charge', opacity: 0.8 });
    else mat = new THREE.MeshLambertMaterial({ color: 0x1d6b5c, emissive: 0x0a3a30 });
    this.mesh = new THREE.Mesh(PROJ_GEO[kind], mat);
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) return this.finish();
    if (this.stuck) return;
    const grav = this.kind === 'fireball' || this.kind === 'smallfire' || this.kind === 'laser' || this.kind === 'wind' || this.kind === 'wind_charge' ? 0 : this.kind === 'arrow' ? 12 : this.kind === 'spit' ? 6 : 16;
    this.vel.y -= grav * dt;
    const step = this.vel.length() * dt;
    const dir = tmpV.copy(this.vel).normalize();
    // entity hits
    const fromPlayer = this.owner === G.player, fromGolem = this.owner && this.owner.T && this.owner.T.snowGolem;
    if (fromPlayer || fromGolem) {
      let best = null, bestT = step + 0.3;
      for (const m of G.mobs) {
        if (m.dead || m === this.owner) continue;
        const t = rayAABB(this.pos, dir, m.pos.x - m.w / 2 - 0.1, m.pos.y, m.pos.z - m.w / 2 - 0.1, m.pos.x + m.w / 2 + 0.1, m.pos.y + m.h, m.pos.z + m.w / 2 + 0.1);
        if (t !== null && t < bestT) { best = m; bestT = t; }
      }
      for (const dr of G.dragons) {
        if (dr.dead) continue;
        const t = dr.hitTest(this.pos, dir, step + 0.5);
        if (t !== null && t < bestT) { best = dr; bestT = t; }
      }
      if (best && (this.kind === 'snowball' || this.kind === 'wind_charge')) {
        if (this.kind === 'wind_charge') { this.pos.copy(best.pos); return this.windBurst(); }
        if (best instanceof Mob) best.hurt(best.type === 'blaze' ? 3 : 0.01, this.pos, 3, fromPlayer);
        G.particles.burst(this.pos.x, this.pos.y, this.pos.z, [0xffffff, 0xe0e8f0], 6, 1.2, 0.1);
        return this.finish();
      }
      if (best && this.kind === 'arrow') {
        const dmg = Math.max(2, Math.round(this.vel.length() / 5 * (this.power ? 1 + 0.25 * (this.power + 1) : 1)));
        if (this.flame && best instanceof Mob && !best.T.fireproof) { best.onFire = Math.max(best.onFire || 0, 5); best.burnedAt = Date.now(); }
        if (best instanceof Dragon) best.hurt(dmg); else best.hurt(dmg, this.pos, 4, true);
        return this.finish();
      }
    } else for (const P of [G.player, ...Net.proxies()]) {
      if (P.dead) continue;
      const t = rayAABB(this.pos, dir, P.pos.x - 0.4, P.pos.y, P.pos.z - 0.4, P.pos.x + 0.4, P.pos.y + 1.8, P.pos.z + 0.4);
      if (t !== null && t < step + 0.2) {
        if (this.kind === 'fireball') { this.pos.addScaledVector(dir, t); return this.explodeHere(); }
        if (this.kind === 'wind') { this.pos.copy(P.pos); return this.windBurst(); }
        if (this.owner instanceof Mob) G.lastAttacker = this.owner;
        const MSG = { spit: ['A llama spat at you!', 1], laser: ['A guardian zapped you with its laser.', 5] }[this.kind];
        if (MSG) { P.hurt(G.mobDmg(MSG[1]), this.pos, 2, false, MSG[0]); G.particles.burst(this.pos.x, this.pos.y, this.pos.z, [PROJ_COLOR[this.kind]], 6, 1, 0.1); return this.finish(); }
        P.hurt(G.mobDmg(this.kind === 'arrow' ? 3 : this.kind === 'smallfire' ? 4 : 2), this.pos, 4, false, this.kind === 'arrow' ? 'You were shot by an arrow.' : this.kind === 'smallfire' ? 'A Blaze fireball hit you.' : 'You were hit.');
        if (this.kind === 'smallfire' && P.mode === 'survival') P.fire = Math.max(P.fire, 3);
        return this.finish();
      }
    }
    const hit = G.world.raycast(this.pos.x, this.pos.y, this.pos.z, dir.x, dir.y, dir.z, step, this.kind === 'fireball');
    if (hit && (DEFS[hit.id].solid || DEFS[hit.id].liquid)) {
      this.pos.addScaledVector(dir, Math.max(0, hit.dist - 0.05));
      if (this.kind === 'fireball') return this.explodeHere();
      if (this.kind === 'wind' || this.kind === 'wind_charge') return this.windBurst();
      if (this.kind === 'snowball' || this.kind === 'spit' || this.kind === 'laser') { G.particles.burst(this.pos.x, this.pos.y, this.pos.z, [PROJ_COLOR[this.kind]], 5, 1, 0.1); return this.finish(); }
      if (this.kind === 'ender_pearl' && Math.random() < 0.05) spawnMob('endermite', hit.x + 0.5 + hit.nx, hit.y + 1, hit.z + 0.5 + hit.nz); // sometimes an endermite comes out
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

  /* a wind charge bursts: everything nearby (you too!) is thrown up and away */
  windBurst() {
    const c = this.pos, R = 3.5;
    G.particles.burst(c.x, c.y, c.z, [0xffffff, 0xc8e8f8, 0x8ac8e8], 24, 4, 0.2);
    G.sound.play('fireball', c);
    for (const m of G.mobs) { if (m.dead || m.T.boat) continue; const d = m.pos.distanceTo(c); if (d < R) { const f = 1 - d / R, l = Math.hypot(m.pos.x - c.x, m.pos.z - c.z) || 1; m.vel.x += (m.pos.x - c.x) / l * f * 10; m.vel.z += (m.pos.z - c.z) / l * f * 10; m.vel.y = Math.max(m.vel.y, 6 + f * 8); if (this.kind === 'wind') continue; m.hurt(1, null, 0, this.owner === G.player); } }
    const P = G.player, d = P.pos.distanceTo(c);
    if (d < R && !P.riding) { const f = 1 - d / R, l = Math.hypot(P.pos.x - c.x, P.pos.z - c.z) || 1; P.vel.x += (P.pos.x - c.x) / l * f * 8; P.vel.z += (P.pos.z - c.z) / l * f * 8; P.vel.y = Math.max(P.vel.y, 8 + f * 8); P.onGround = false; if (this.kind === 'wind') P.hurt(G.mobDmg(1), null, 0, false, 'A breeze blew you away.'); }
    return this.finish();
  }
  explodeHere() {
    G.explode(this.pos.x, this.pos.y, this.pos.z, 1.6, false, false, this.colors, this.owner && this.owner.name ? 'A fireball from the ' + this.owner.name + ' hit you.' : 'A Ghast fireball hit you.');
    return this.finish();
  }

  finish() { this.done = true; G.scene.remove(this.mesh); }
}

/* ---------- dropped items ---------- */
const ITEM_GEO = new Map();
/* blocks that aren't whole cubes (torches, lanterns, fences, panes, anvils...) are held and dropped as their
   flat inventory picture, like Minecraft, instead of as a big cube */
const flatIcon = def => !!(def && def.isBlock && def.iconTile && TILES[def.iconTile] !== undefined);
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
  } else if (def.isBlock && !def.cross && !flatIcon(def)) {
    box(def, -0.5, -0.5, -0.5, 1, 1, 1);
  } else {
    const U = TILE_UV[flatIcon(def) ? TILES[def.iconTile] : tileOf(id)];
    pos.push(-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0);
    uv.push(U[0], U[1], U[2], U[1], U[2], U[3], U[0], U[3]);
    for (let k = 0; k < 4; k++) col.push(1, 1, 1);
    idx.push(0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.userData.flat = !(def.isBlock && !def.cross && !flatIcon(def));
  ITEM_GEO.set(id, g);
  return g;
}

class ItemDrop {
  constructor(id, count, x, y, z, vel, did, e, n, c) {
    this.id = id; this.count = count; this.did = did; this.e = e; this.n = n; this.c = c;
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
    // dropped in lava or fire: it burns up (netherite never burns, like Minecraft)
    if ((liquid === ID.lava || G.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.1), Math.floor(this.pos.z)) === ID.fire) && !/^netherite_|^ancient_debris$/.test(DEFS[this.id].key)) {
      G.particles.burst(this.pos.x, this.pos.y + 0.3, this.pos.z, [0xff7a1a, 0xffd04a, 0x555555], 8, 1.4, 0.12, -1);
      G.sound.play('fuse', this.pos);
      Net.dropPicked(this.did);
      return this.finish();
    }
    if (liquid) { this.vel.y += 20 * dt; this.vel.multiplyScalar(0.9); }
    this.vel.y -= 18 * dt;
    if (this.onGround) { this.vel.x *= 0.85; this.vel.z *= 0.85; }
    G.world.moveBody(this, dt);
    if (G.world.collides(this.pos.x, this.pos.y, this.pos.z, this.w, this.h)) this.pos.y += 4 * dt;
    this.mesh.position.set(this.pos.x, this.pos.y + 0.25 + Math.sin(this.age * 3) * 0.06, this.pos.z);
    this.mesh.rotation.y = this.age * 1.6;
    const P = G.player;
    // with a full inventory, items stay where they are instead of following you around
    if (!P.dead && this.age > this.pickDelay && P.inv.hasRoom(this.id, this.e || this.c, this.n)) {
      const dx = P.pos.x - this.pos.x, dy = (P.pos.y + 0.8) - this.pos.y, dz = P.pos.z - this.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1.6) {
        // an item another player's game dropped: ask them for it, so two players can't both get it
        if (this.owner && Net.ownerHere(this.owner)) {
          if (!this.askedAt || performance.now() - this.askedAt > 2500) { this.askedAt = performance.now(); Net.askForDrop(this); }
        } else {
          const left = P.inv.add(this.id, this.count, this.e, this.n, this.c);
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
