'use strict';
/* Block and item registry, procedural pixel-art textures, and inventory icons. */

const TILE = 16, ATLAS_N = 40; // room for 1600 pictures
const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = atlasCanvas.height = TILE * ATLAS_N;
const actx = atlasCanvas.getContext('2d', { willReadFrequently: true });
const TILES = Object.create(null);
const TILE_AVG = [];
let tileCount = 0;

const rgb = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const C = h => (typeof h === 'number' ? rgb(h) : h);
const shadeC = (c, f) => C(c).map(v => clamp(Math.round(v * f), 0, 255));

function makeTile(name, paint) {
  const i = tileCount++;
  TILES[name] = i;
  const img = actx.createImageData(TILE, TILE), D = img.data;
  const rng = mulberry32(hashStr(name) + 1337);
  const P = painterFor(D, rng);
  paint(P);
  actx.putImageData(img, (i % ATLAS_N) * TILE, Math.floor(i / ATLAS_N) * TILE);
  let r = 0, g = 0, b = 0, n = 0;
  for (let k = 0; k < D.length; k += 4) if (D[k + 3] > 100) { r += D[k]; g += D[k + 1]; b += D[k + 2]; n++; }
  TILE_AVG[i] = n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [255, 255, 255];
  return i;
}
function painterFor(D, rng) {
  const P = {
    rng,
    put(x, y, c, a = 255) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x > 15 || y > 15) return;
      c = C(c);
      const k = (y * 16 + x) * 4;
      D[k] = c[0]; D[k + 1] = c[1]; D[k + 2] = c[2]; D[k + 3] = a;
    },
    get(x, y) { const k = (y * 16 + x) * 4; return [D[k], D[k + 1], D[k + 2], D[k + 3]]; },
    vary(c, a) { const d = (rng() * 2 - 1) * a; return C(c).map(v => clamp(Math.round(v + d), 0, 255)); },
    fill(h, a = 10) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P.put(x, y, P.vary(h, a)); },
    speck(h, p, a = 8) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (rng() < p) P.put(x, y, P.vary(h, a)); },
    rect(x, y, w, h, col, a = 0) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) P.put(i, j, a ? P.vary(col, a) : C(col)); },
    disc(cx, cy, r, col, a = 0) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) P.put(x, y, a ? P.vary(col, a) : C(col));
    },
    line(x0, y0, x1, y1, col, a = 0) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
      for (let i = 0; i <= n; i++) P.put(lerp(x0, x1, i / n), lerp(y0, y1, i / n), a ? P.vary(col, a) : C(col));
    },
    pts(list, col) { for (const [x, y] of list) P.put(x, y, col); },
    clear() { D.fill(0); },
    erase(x, y) { D[(y * 16 + x) * 4 + 3] = 0; },
  };
  return P;
}
/* ---------- moving pictures, like Minecraft: water, lava, fire, portals, lanterns... ----------
   Each one gets a few frames, drawn once here; the game swaps them into the picture sheet as time goes by. */
const ANIM_TILES = [];
function animTile(name, n, ms, paint) {
  const i = TILES[name];
  if (i === undefined) return;
  const frames = [];
  for (let f = 0; f < n; f++) {
    const img = actx.createImageData(TILE, TILE);
    paint(painterFor(img.data, mulberry32(hashStr(name) + 1337 + f * 7919)), f, n);
    frames.push(img);
  }
  ANIM_TILES.push({ i, frames, ms, f: 0 });
}

/* ---------- painters ---------- */
const pDirt = P => { P.fill(0x866043, 14); P.speck(0x6b4a32, 0.18, 6); P.speck(0x9a7653, 0.08, 6); };
const pStone = P => { P.fill(0x808080, 9); P.speck(0x6c6c6c, 0.22, 5); P.speck(0x969696, 0.08, 5); };
function pOre(col, hi) {
  return P => {
    pStone(P);
    const n = 5 + (P.rng() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const x = 1 + (P.rng() * 12 | 0), y = 1 + (P.rng() * 12 | 0);
      P.put(x, y, col); P.put(x + 1, y, col); P.put(x, y + 1, shadeC(col, 0.8));
      P.put(x + 1, y + 1, P.rng() < 0.6 ? hi : col);
    }
  };
}
function pCells(base, mortar, count, varAmt, extra) {
  return P => {
    const pts = [];
    for (let i = 0; i < count; i++) pts.push([P.rng() * 16, P.rng() * 16, 0.82 + P.rng() * 0.3]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let d1 = 99, d2 = 99, best = 0;
      for (let k = 0; k < pts.length; k++) {
        for (let ox = -16; ox <= 16; ox += 16) for (let oy = -16; oy <= 16; oy += 16) {
          const dx = x - pts[k][0] - ox, dy = y - pts[k][1] - oy, d = Math.sqrt(dx * dx + dy * dy);
          if (d < d1) { d2 = d1; d1 = d; best = k; } else if (d < d2) d2 = d;
        }
      }
      if (d2 - d1 < 1.1) P.put(x, y, P.vary(mortar, 6));
      else P.put(x, y, P.vary(shadeC(base, pts[best][2]), varAmt));
    }
    if (extra) extra(P);
  };
}
function pMetal(h) {
  return P => {
    const c = rgb(h), hi = shadeC(c, 1.22), lo = shadeC(c, 0.7);
    P.fill(c, 5);
    for (let i = 0; i < 16; i++) { P.put(i, 0, hi); P.put(0, i, hi); P.put(i, 15, lo); P.put(15, i, lo); }
    for (let i = 2; i < 14; i++) { P.put(i, 2, shadeC(c, 1.1)); P.put(2, i, shadeC(c, 1.1)); P.put(i, 13, shadeC(c, 0.85)); P.put(13, i, shadeC(c, 0.85)); }
    P.pts([[4, 4], [5, 4], [4, 5], [10, 9], [11, 10]], hi);
  };
}
function pWool(h) { return P => { P.fill(h, 7); P.speck(shadeC(h, 0.85), 0.25, 4); P.speck(shadeC(h, 1.08), 0.1, 4); }; }
function pLogSide(h, d) {
  return P => {
    for (let x = 0; x < 16; x++) {
      const dark = x % 4 === 0 || P.rng() < 0.15;
      for (let y = 0; y < 16; y++) P.put(x, y, P.vary(dark ? d : h, 8));
    }
  };
}
function pBirchSide(P) {
  P.fill(0xd9d5c9, 6);
  for (let i = 0; i < 7; i++) {
    const y = P.rng() * 15 | 0, x = P.rng() * 12 | 0, w = 2 + (P.rng() * 4 | 0);
    P.rect(x, y, w, 1, 0x2b2b2b, 6);
  }
}
function pLogTop(bark, inner, ring) {
  return P => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      let c = d > 6.6 ? bark : (Math.floor(d) % 2 === 0 ? ring : inner);
      P.put(x, y, P.vary(c, 7));
    }
  };
}
function pLeaves(h) {
  return P => {
    P.fill(h, 22);
    P.speck(shadeC(h, 0.7), 0.2, 8);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (P.rng() < 0.17) P.erase(x, y);
  };
}
function pPlanks(h) {
  return P => {
    const c = rgb(h), dk = shadeC(c, 0.68);
    for (let y = 0; y < 16; y++) {
      const row = y >> 2, seam = (row * 7 + 3) % 16;
      for (let x = 0; x < 16; x++) {
        let col = c;
        if (y % 4 === 3) col = dk; else if (x === seam) col = dk;
        P.put(x, y, P.vary(col, 9));
      }
    }
  };
}
function pBricks(brick, mortar, bw, bh) {
  return P => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / bh), off = (row & 1) ? bw / 2 : 0;
      const isM = y % bh === bh - 1 || (x + off) % bw === bw - 1;
      P.put(x, y, P.vary(isM ? mortar : brick, isM ? 4 : 10));
    }
  };
}
function pTopBand(base, top, depth) {
  return P => {
    base(P);
    for (let x = 0; x < 16; x++) {
      const d = depth + (P.rng() < 0.5 ? 1 : 0) + (P.rng() < 0.25 ? 1 : 0);
      for (let y = 0; y < d; y++) P.put(x, y, P.vary(top, 12));
    }
  };
}
function pPlant(paint) { return P => { P.clear(); paint(P); }; }
function pFlower(petal, center) {
  return pPlant(P => {
    P.line(8, 15, 8, 8, 0x3f8f2f);
    P.pts([[6, 12], [7, 12], [9, 11], [10, 10]], 0x4fa83a);
    P.disc(8, 6, 2.6, petal);
    P.put(8, 6, center);
    P.pts([[6, 4], [10, 4], [6, 8], [10, 8]], shadeC(petal, 0.8));
  });
}
function pMushroom(cap, spots) {
  return pPlant(P => {
    P.rect(7, 10, 2, 6, 0xe6dcc8);
    for (let y = 5; y <= 10; y++) for (let x = 3; x <= 12; x++) {
      const dx = (x - 7.5) / 5, dy = (y - 10) / 5;
      if (dx * dx + dy * dy <= 1 && y <= 10) P.put(x, y, P.vary(cap, 8));
    }
    if (spots) P.pts([[5, 8], [9, 6], [10, 9], [7, 8]], spots);
  });
}
function pCrack(stage) {
  return P => {
    P.clear();
    const n = 2 + stage * 2;
    for (let i = 0; i < n; i++) {
      let x = 6 + P.rng() * 4, y = 6 + P.rng() * 4;
      const len = 3 + stage;
      let ang = P.rng() * Math.PI * 2;
      for (let s = 0; s < len; s++) {
        P.put(x, y, [20, 20, 20], 210);
        ang += (P.rng() - 0.5) * 1.2;
        x += Math.cos(ang); y += Math.sin(ang);
      }
    }
  };
}

/* ---------- item painters ---------- */
function pIngot(h) {
  return pPlant(P => {
    const c = rgb(h), hi = shadeC(c, 1.25), lo = shadeC(c, 0.7);
    for (let x = 5; x <= 11; x++) P.put(x, 6, hi);
    for (let y = 7; y <= 9; y++) for (let x = 4; x <= 12; x++) P.put(x, y, c);
    for (let x = 3; x <= 13; x++) P.put(x, 10, lo);
    P.pts([[6, 7], [7, 7]], hi);
  });
}
function pGem(h) {
  return pPlant(P => {
    const c = rgb(h), hi = shadeC(c, 1.3), lo = shadeC(c, 0.65);
    for (let y = 3; y <= 13; y++) for (let x = 3; x <= 13; x++) {
      const d = Math.abs(x - 8) + Math.abs(y - 8);
      if (d <= 5) P.put(x, y, d === 5 ? lo : (x + y < 15 ? hi : c));
    }
    P.pts([[7, 6], [6, 7]], [255, 255, 255]);
  });
}
function pBlob(h, r, specks) {
  return pPlant(P => {
    P.disc(8, 8, r, h, 12);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = P.get(x, y);
      if (k[3] && (x - 8) + (y - 8) > r - 1.5) P.put(x, y, shadeC(k, 0.7));
    }
    if (specks) P.speck(specks, 0.12, 6), clipToDisc(P, r);
  });
}
function clipToDisc(P, r) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    if ((x - 8) * (x - 8) + (y - 8) * (y - 8) > r * r) P.erase(x, y);
}
function pTool(kind, mat) {
  return pPlant(P => {
    const c = rgb(mat), hi = shadeC(c, 1.25), lo = shadeC(c, 0.65);
    const stick = 0x7a5a32, stickD = 0x4e3a20;
    if (kind === 'pick') {
      for (let i = 0; i < 9; i++) { P.put(2 + i, 13 - i, stick); P.put(3 + i, 13 - i, stickD); }
      P.pts([[4, 2], [5, 2], [6, 2], [7, 2], [8, 3], [9, 3], [10, 4], [11, 5], [12, 6], [12, 7], [13, 8], [13, 9], [13, 10]], hi);
      P.pts([[3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 4], [9, 4], [10, 5], [11, 6], [11, 7], [12, 8], [12, 9], [12, 10], [12, 11]], c);
      P.pts([[3, 4], [11, 8], [11, 9], [12, 12]], lo);
    } else if (kind === 'shovel') {
      for (let i = 0; i < 8; i++) { P.put(2 + i, 13 - i, stick); P.put(3 + i, 13 - i, stickD); }
      for (let y = 1; y <= 8; y++) for (let x = 8; x <= 15; x++) {
        const d = Math.abs(x - 11.5) + Math.abs(y - 4.5);
        if (d <= 3.6) P.put(x, y, d > 2.8 ? (x + y < 16 ? hi : lo) : c);
      }
      P.pts([[10, 3], [11, 3]], hi);
    } else if (kind === 'hoe') {
      for (let i = 0; i < 10; i++) { P.put(2 + i, 13 - i, stick); P.put(3 + i, 13 - i, stickD); }
      for (let x = 7; x <= 13; x++) { P.put(x, 2, x === 7 ? hi : c); P.put(x, 3, x === 13 ? lo : c); }
      P.pts([[7, 4], [8, 4]], lo);
    } else if (kind === 'axe') {
      for (let i = 0; i < 10; i++) { P.put(2 + i, 13 - i, stick); P.put(3 + i, 13 - i, stickD); }
      const rows = [[1, 8, 11], [2, 6, 11], [3, 5, 10], [4, 5, 9], [5, 5, 8], [6, 6, 7]];
      for (const [y, a, b] of rows) for (let x = a; x <= b; x++) P.put(x, y, x === a ? hi : x === b ? lo : c);
    } else {
      for (let i = 0; i < 10; i++) { P.put(5 + i, 10 - i, hi); P.put(6 + i, 10 - i, c); P.put(6 + i, 11 - i, lo); }
      P.pts([[3, 8], [4, 9], [5, 10], [6, 11], [7, 12], [8, 13]], 0x3b3b3b);
      P.pts([[4, 11], [3, 12], [2, 13]], stick);
      P.pts([[5, 12], [4, 12], [3, 13]], stickD);
      P.put(1, 14, lo);
    }
  });
}

/* ---------- make all tiles ---------- */
makeTile('grass_top', P => { P.fill(0x5fa043, 16); P.speck(0x4b8a33, 0.25, 8); P.speck(0x74b852, 0.1, 6); });
makeTile('grass_side', pTopBand(pDirt, 0x5fa043, 3));
makeTile('dirt', pDirt);
makeTile('stone', pStone);
makeTile('cobblestone', pCells(0x7d7d7d, 0x4a4a4a, 9, 8));
makeTile('mossy_cobblestone', pCells(0x7d7d7d, 0x4a4a4a, 9, 8, P => { for (let i = 0; i < 5; i++) P.disc(P.rng() * 16, P.rng() * 16, 1.6, 0x4d7a32, 12); }));
makeTile('log_oak', pLogSide(0x6b5133, 0x4f3b23));
makeTile('log_oak_top', pLogTop(0x5a4228, 0xb8945f, 0x9c7a48));
makeTile('leaves_oak', pLeaves(0x3f8f2f));
makeTile('planks_oak', pPlanks(0xa8834f));
makeTile('log_birch', pBirchSide);
makeTile('log_birch_top', pLogTop(0xd9d5c9, 0xd8c48c, 0xbfae78));
makeTile('leaves_birch', pLeaves(0x6a9d3a));
makeTile('planks_birch', pPlanks(0xc8b77a));
makeTile('log_spruce', pLogSide(0x3d2a17, 0x2b1d0f));
makeTile('log_spruce_top', pLogTop(0x3d2a17, 0x7a5a32, 0x5e4426));
makeTile('leaves_spruce', pLeaves(0x2f5d3a));
makeTile('planks_spruce', pPlanks(0x6e5232));
makeTile('sand', P => { P.fill(0xdccf9e, 8); P.speck(0xc8b98a, 0.2, 5); });
makeTile('gravel', P => { const pal = [0x8a8580, 0x6e6a66, 0xa39e98, 0x5c5855]; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P.put(x, y, P.vary(pal[P.rng() * 4 | 0], 6)); });
makeTile('water', P => { P.fill(0x2f62d4, 10); P.speck(0x4d80ec, 0.12, 6); for (let i = 0; i < 4; i++) { const y = P.rng() * 16 | 0, x = P.rng() * 10 | 0; P.rect(x, y, 4, 1, 0x5a8cf0); } });
makeTile('lava', P => { P.fill(0xcf4f12, 10); for (let i = 0; i < 6; i++) P.disc(P.rng() * 16, P.rng() * 16, 1.5 + P.rng() * 1.5, 0xf7a21b, 14); P.speck(0xffd34a, 0.05, 6); });
makeTile('coal_ore', pOre(0x262626, 0x444444));
makeTile('iron_ore', pOre(0xd8af93, 0xeccbb5));
makeTile('gold_ore', pOre(0xfcd33c, 0xfff3a0));
makeTile('diamond_ore', pOre(0x5decf5, 0xd2fffc));
makeTile('redstone_ore', pOre(0xc4140c, 0xff5a4a));
makeTile('emerald_ore', pOre(0x17c544, 0x8affab));
makeTile('lapis_ore', pOre(0x1f45b5, 0x5a85ff));
makeTile('bedrock', P => { const pal = [0x2b2b2b, 0x575757, 0x7a7a7a, 0x1a1a1a]; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P.put(x, y, pal[P.rng() * 4 | 0]); });
makeTile('glass', P => {
  P.clear();
  for (let i = 0; i < 16; i++) { P.put(i, 0, 0xdbefff); P.put(0, i, 0xdbefff); P.put(i, 15, 0xa9c8e0); P.put(15, i, 0xa9c8e0); }
  P.pts([[3, 4], [4, 3], [4, 5], [5, 4], [11, 10], [10, 11]], 0xffffff);
});
makeTile('bricks', pBricks(0x96463a, 0xbdb0a3, 8, 4));
makeTile('stone_bricks', pBricks(0x7b7b7b, 0x585858, 8, 8));
makeTile('snow', P => { P.fill(0xf2f6fa, 4); P.speck(0xdfe7ef, 0.15, 3); });
makeTile('snow_side', pTopBand(pDirt, 0xf2f6fa, 4));
makeTile('ice', P => { P.fill(0x9ec4fa, 6); for (let i = 0; i < 3; i++) { const x = P.rng() * 12 | 0, y = P.rng() * 12 | 0; P.line(x, y, x + 3, y + 3, 0xdcecff); } });
makeTile('cactus_side', P => { P.fill(0x2f7d33, 8); for (let y = 0; y < 16; y++) { P.put(0, y, 0x1f5a22); P.put(15, y, 0x1f5a22); P.put(5, y, 0x3a9440); P.put(10, y, 0x3a9440); } for (let y = 1; y < 16; y += 4) { P.put(2, y, 0x111111); P.put(13, y + 2, 0x111111); P.put(7, y + 1, 0x111111); } });
makeTile('cactus_top', P => { P.fill(0x4f9d47, 8); for (let i = 0; i < 16; i++) { P.put(i, 0, 0x2f7d33); P.put(0, i, 0x2f7d33); P.put(i, 15, 0x2f7d33); P.put(15, i, 0x2f7d33); } P.rect(6, 6, 4, 4, 0x2f7d33, 6); });
makeTile('sandstone_top', P => { P.fill(0xddcf95, 5); P.speck(0xcfc085, 0.15, 4); });
makeTile('sandstone_side', P => { P.fill(0xd8c98f, 5); P.rect(0, 0, 16, 3, 0xe6d9a3, 4); P.rect(0, 12, 16, 4, 0xc4b57a, 4); for (let x = 0; x < 16; x++) P.put(x, 7, P.vary(0xccbd83, 5)); });
makeTile('obsidian', P => { P.fill(0x15101f, 5); P.speck(0x3a2860, 0.15, 6); P.speck(0x5b3f8c, 0.04, 6); });
makeTile('gold_block', pMetal(0xf5cc2e));
makeTile('iron_block', pMetal(0xdcdcdc));
makeTile('diamond_block', pMetal(0x5fe0d8));
makeTile('emerald_block', pMetal(0x2fcf6a));
makeTile('lapis_block', pMetal(0x2747a8));
makeTile('coal_block', pMetal(0x232323));
makeTile('redstone_block', pMetal(0xb3170f));
makeTile('quartz_block', P => { P.fill(0xece6dc, 3); for (let i = 0; i < 16; i++) { P.put(i, 15, 0xd5cec2); P.put(15, i, 0xd5cec2); } });
makeTile('tnt_side', P => {
  P.fill(0xc9301f, 8);
  P.rect(0, 5, 16, 6, 0xe8e2d0, 3);
  P.pts([[1, 6], [2, 6], [3, 6], [2, 7], [2, 8], [2, 9], [6, 6], [6, 7], [6, 8], [6, 9], [7, 7], [8, 8], [9, 6], [9, 7], [9, 8], [9, 9], [12, 6], [13, 6], [14, 6], [13, 7], [13, 8], [13, 9]], 0x1a1a1a);
});
makeTile('tnt_top', P => { P.fill(0xc9301f, 8); P.disc(7.5, 7.5, 3, 0xb5b5a0); P.disc(7.5, 7.5, 1.2, 0x222222); });
makeTile('tnt_bottom', P => { P.fill(0xc9301f, 8); P.disc(7.5, 7.5, 3, 0xb5b5a0); });
makeTile('bookshelf', P => {
  pPlanks(0xa8834f)(P);
  const cols = [0x8f2b20, 0x2b4f8f, 0x3a7a2a, 0xb08d2a, 0x6a2a7a, 0xdddddd];
  for (const y0 of [2, 9]) {
    let x = 1;
    while (x < 15) {
      const w = 1 + (P.rng() * 2 | 0), c = cols[P.rng() * cols.length | 0], h = 5 - (P.rng() < 0.3 ? 1 : 0);
      P.rect(x, y0 + (5 - h), w, h, c, 8); x += w + (P.rng() < 0.2 ? 1 : 0);
    }
  }
});
makeTile('ct_top', P => { pPlanks(0xb08a55)(P); for (let i = 0; i < 16; i++) { P.put(i, 0, 0x5a4228); P.put(0, i, 0x5a4228); P.put(i, 15, 0x5a4228); P.put(15, i, 0x5a4228); P.put(i, 7, 0x6b5133); P.put(7, i, 0x6b5133); } });
makeTile('ct_side', P => { pPlanks(0xa8834f)(P); P.rect(0, 0, 16, 3, 0x6b5133, 6); P.line(3, 5, 3, 12, 0x6b5133); P.rect(2, 4, 3, 2, 0x9a9a9a); P.line(10, 5, 13, 12, 0x6b5133); P.rect(9, 4, 4, 2, 0x9a9a9a); });
makeTile('ct_front', P => { pPlanks(0xa8834f)(P); P.rect(0, 0, 16, 3, 0x6b5133, 6); P.rect(4, 6, 8, 2, 0x8a8a8a); P.line(8, 8, 8, 13, 0x6b5133); });
const pSmooth = P => { P.fill(0x8c8c8c, 5); for (let i = 0; i < 16; i++) { P.put(i, 0, 0x6e6e6e); P.put(0, i, 0x6e6e6e); P.put(i, 15, 0x6e6e6e); P.put(15, i, 0x6e6e6e); } };
makeTile('furnace_side', pSmooth);
makeTile('furnace_top', P => { pSmooth(P); P.rect(3, 3, 10, 10, 0x7a7a7a, 4); });
makeTile('furnace_front', P => { pSmooth(P); P.rect(2, 2, 12, 2, 0x5e5e5e); P.rect(4, 8, 8, 5, 0x1a1a1a); P.rect(5, 11, 6, 2, 0xe0701a, 30); });
makeTile('pumpkin_side', P => { P.fill(0xd9861c, 8); for (let y = 0; y < 16; y++) for (const x of [0, 4, 8, 12]) P.put(x, y, P.vary(0xb06a12, 6)); });
makeTile('pumpkin_top', P => { P.fill(0xd9861c, 8); P.rect(6, 6, 4, 4, 0x5e7a20, 8); });
makeTile('pumpkin_face', P => { P.fill(0xd9861c, 8); for (let y = 0; y < 16; y++) for (const x of [0, 15]) P.put(x, y, 0xb06a12); P.rect(3, 4, 3, 3, 0x3a1a05); P.rect(10, 4, 3, 3, 0x3a1a05); P.rect(4, 10, 8, 2, 0x3a1a05); P.pts([[3, 9], [12, 9], [6, 12], [9, 12]], 0x3a1a05); });
makeTile('melon_side', P => { P.fill(0x6aa82e, 8); for (let y = 0; y < 16; y++) for (const x of [1, 5, 9, 13]) P.put(x + ((y >> 2) & 1), y, P.vary(0x3e6e1d, 6)); });
makeTile('melon_top', P => { P.fill(0x6aa82e, 8); P.disc(7.5, 7.5, 3, 0x4e8a22, 6); });
makeTile('hay_side', P => { P.fill(0xc8a53a, 10); for (let i = 0; i < 20; i++) { const x = P.rng() * 16 | 0; P.line(x, 0, x, 15, P.vary(0xa88a28, 8)); } P.rect(0, 6, 16, 3, 0x7a2a1e, 6); });
makeTile('hay_top', P => { P.fill(0xc8a53a, 10); P.speck(0xa88a28, 0.3, 6); P.rect(0, 6, 16, 3, 0x7a2a1e, 6); });
makeTile('netherrack', P => { P.fill(0x6e2b2b, 14); P.speck(0x8a3a3a, 0.2, 6); P.speck(0x4e1c1c, 0.15, 6); });
makeTile('glowstone', P => { P.fill(0xb58b3c, 15); P.speck(0xffe9a0, 0.35, 10); P.speck(0xffffff, 0.05, 4); });
makeTile('end_stone', P => { P.fill(0xdedca0, 8); P.speck(0xc5c38a, 0.2, 5); });
makeTile('clay', P => { P.fill(0xa1a7b5, 6); P.speck(0x939aa8, 0.12, 4); });
makeTile('terracotta', P => { P.fill(0x985e43, 6); });
makeTile('dragon_egg', P => { P.fill(0x0d0a12, 4); P.speck(0x4b1f72, 0.14, 8); P.speck(0x8a4ad0, 0.03, 8); });
makeTile('wool_white', pWool(0xe9ecec));
makeTile('wool_red', pWool(0xa12722));
makeTile('wool_blue', pWool(0x35399d));
makeTile('wool_green', pWool(0x546d1b));
makeTile('wool_yellow', pWool(0xf8c527));
makeTile('wool_black', pWool(0x1d1d21));
makeTile('wool_orange', pWool(0xf07613));
makeTile('wool_purple', pWool(0x7a2aac));
makeTile('rose', pFlower(0xd0201c, 0x7a1010));
makeTile('dandelion', pFlower(0xf4d521, 0xd08a10));
makeTile('fire', pPlant(P => {
  for (let x = 0; x < 16; x++) {
    const h = 6 + ((Math.sin(x * 1.7) + 1) * 4 + P.rng() * 3 | 0);
    for (let j = 0; j < h; j++) { const t = j / h; P.put(x, 15 - j, t < 0.35 ? 0xffe36a : t < 0.7 ? 0xff9a1a : 0xe0441a); }
  }
}));
makeTile('flag', P => { P.clear(); P.rect(7, 0, 2, 16, 0x8a6a3a); P.rect(9, 1, 7, 7, 0xd8302a); P.rect(9, 1, 7, 1, 0xf05a4a); P.rect(9, 7, 7, 1, 0xa01e1a); P.put(12, 4, 0xffd84a); P.put(13, 4, 0xffd84a); P.put(12, 3, 0xffd84a); });
makeTile('i_flag', pPlant(P => { P.rect(4, 1, 2, 15, 0x8a6a3a); P.rect(6, 2, 8, 6, 0xd8302a); P.rect(6, 2, 8, 1, 0xf05a4a); P.rect(6, 7, 8, 1, 0xa01e1a); P.put(9, 4, 0xffd84a); P.put(10, 4, 0xffd84a); }));
makeTile('tall_grass', pPlant(P => { for (let i = 0; i < 10; i++) { const x = 1 + P.rng() * 14 | 0, h = 5 + P.rng() * 10 | 0, lean = P.rng() < 0.5 ? -1 : 1; for (let j = 0; j < h; j++) P.put(x + (j > h * 0.6 ? lean : 0), 15 - j, P.vary(0x5fa043, 22)); } }));
makeTile('dead_bush', pPlant(P => { P.line(8, 15, 8, 9, 0x7a5a32); P.line(8, 11, 4, 6, 0x7a5a32); P.line(8, 10, 12, 5, 0x7a5a32); P.line(6, 8, 7, 4, 0x6b4a28); P.line(11, 7, 13, 9, 0x6b4a28); }));
makeTile('red_mushroom', pMushroom(0xc8221c, 0xf0f0f0));
makeTile('brown_mushroom', pMushroom(0x9a6a48, null));
for (let s = 0; s < 8; s++) makeTile('destroy_' + s, pCrack(s));
const pNetherrack = P => { P.fill(0x6e2b2b, 14); P.speck(0x8a3a3a, 0.2, 6); P.speck(0x4e1c1c, 0.15, 6); };
makeTile('soul_sand', P => { P.fill(0x5a4436, 10); P.speck(0x3e2e24, 0.25, 5); for (let i = 0; i < 4; i++) { const x = 2 + P.rng() * 11 | 0, y = 2 + P.rng() * 10 | 0; P.pts([[x, y], [x + 2, y], [x + 1, y + 2]], 0x2a1e18); } });
makeTile('nether_bricks', pBricks(0x3a1c22, 0x1e0e12, 8, 4));
makeTile('nether_quartz_ore', P => { pNetherrack(P); for (let i = 0; i < 6; i++) { const x = 1 + P.rng() * 13 | 0, y = 1 + P.rng() * 13 | 0; P.pts([[x, y], [x + 1, y], [x + 1, y + 1]], 0xeee8dc); P.put(x, y + 1, 0xc8c0b0); } });
makeTile('nether_gold_ore', P => { pNetherrack(P); for (let i = 0; i < 7; i++) { const x = 1 + P.rng() * 13 | 0, y = 1 + P.rng() * 13 | 0; P.pts([[x, y], [x + 1, y]], 0xfcd33c); P.put(x, y + 1, 0xfff3a0); } });
makeTile('magma', P => { P.fill(0x5a1a0a, 8); for (let i = 0; i < 7; i++) { const x = P.rng() * 14 | 0, y = P.rng() * 14 | 0; P.line(x, y, x + 2 + (P.rng() * 3 | 0), y + (P.rng() * 3 | 0), 0xff7a1a, 20); } });
makeTile('portal', P => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v = Math.sin(x * 0.9 + y * 0.5) + Math.sin(y * 1.3 - x * 0.4); P.put(x, y, v > 0.6 ? [190, 90, 255] : v > -0.4 ? [120, 30, 210] : [70, 10, 150], 210); } });
makeTile('i_quartz', pGem(0xece6dc));
makeTile('i_blaze_rod', pPlant(P => { for (let i = 0; i < 10; i++) { P.put(3 + i, 12 - i, 0xffc020); P.put(4 + i, 12 - i, 0xe08010); } P.pts([[3, 12], [13, 2]], 0xfff080); }));
// beds are half a block tall, so only the lower rows (7-15) of the side picture show
makeTile('bed_top', P => { P.fill(0xb02626, 8); P.speck(0x8a1a1a, 0.2, 5); for (let i = 0; i < 16; i++) { P.put(0, i, 0x7a5a32); P.put(15, i, 0x7a5a32); } });
makeTile('bed_head_top', P => { P.fill(0xb02626, 8); P.speck(0x8a1a1a, 0.2, 5); P.rect(2, 2, 12, 7, 0xeeeeee, 4); for (let i = 0; i < 16; i++) { P.put(0, i, 0x7a5a32); P.put(15, i, 0x7a5a32); } });
/* torches and lanterns */
makeTile('torch', P => { P.clear(); P.rect(7, 9, 2, 7, 0x8a6a3a); P.put(7, 9, 0x6a4a24); P.rect(7, 6, 2, 3, 0xffd34a); P.put(7, 6, 0xfff2b0); P.put(8, 8, 0xff9a2a); });
makeTile('torch_top', P => { P.fill(0xffd34a, 10); P.disc(7.5, 7.5, 2, 0xfff2b0); });
makeTile('i_torch', pPlant(P => { P.rect(7, 6, 2, 9, 0x8a6a3a); P.rect(6, 2, 4, 4, 0xffc23a); P.rect(7, 3, 2, 2, 0xfff2b0); P.put(7, 1, 0xff9a2a); }));
makeTile('lantern', P => { P.clear(); P.rect(5, 7, 6, 9, 0x2e2e34); P.rect(6, 9, 4, 5, 0xffc94a); P.rect(7, 10, 2, 3, 0xfff2b0); P.rect(5, 7, 6, 1, 0x4a4a52); P.rect(5, 15, 6, 1, 0x4a4a52); });
makeTile('lantern_top', P => { P.fill(0x2e2e34, 6); P.rect(6, 6, 4, 4, 0x4a4a52); P.rect(7, 7, 2, 2, 0x1a1a1e); });
makeTile('i_lantern', pPlant(P => { P.rect(7, 1, 2, 2, 0x4a4a52); P.rect(4, 3, 8, 12, 0x2e2e34); P.rect(5, 5, 6, 8, 0xffc94a); P.rect(6, 7, 4, 4, 0xfff2b0); P.rect(4, 3, 8, 1, 0x5a5a62); P.rect(4, 14, 8, 1, 0x5a5a62); }));

makeTile('i_bed', pPlant(P => {
  P.rect(1, 6, 14, 3, 0xb02626, 8);           // blanket
  P.rect(1, 5, 4, 4, 0xeeeeee, 4);            // pillow
  P.rect(1, 9, 14, 2, 0xa8834f, 6);           // wooden frame
  P.rect(1, 11, 2, 3, 0x5a4228); P.rect(13, 11, 2, 3, 0x5a4228); // legs
  P.rect(0, 3, 1, 11, 0x7a5a32);              // headboard
}));
makeTile('bed_side', P => { pPlanks(0xa8834f)(P); P.rect(0, 7, 16, 4, 0xb02626, 8); P.rect(0, 13, 3, 3, 0x4a3420); P.rect(13, 13, 3, 3, 0x4a3420); });
function pArmor(piece, mat) {
  return pPlant(P => {
    const c = rgb(mat), hi = shadeC(c, 1.3), lo = shadeC(c, 0.65);
    const put = (x, y) => P.put(x, y, x <= 4 ? hi : x >= 11 ? lo : c);
    if (piece === 'helmet') {
      for (let x = 5; x <= 10; x++) put(x, 4);
      for (let x = 4; x <= 11; x++) put(x, 5);
      for (let y = 6; y <= 10; y++) for (let x = 3; x <= 12; x++) if (y < 8 || x < 5 || x > 10) put(x, y);
    } else if (piece === 'chestplate') {
      for (let y = 3; y <= 5; y++) for (let x = 2; x <= 13; x++) if (y > 3 || x < 6 || x > 9) put(x, y);
      for (let y = 6; y <= 13; y++) for (let x = 4; x <= 11; x++) put(x, y);
      P.pts([[7, 6], [8, 6], [7, 7], [8, 7]], lo);
    } else if (piece === 'leggings') {
      for (let y = 3; y <= 5; y++) for (let x = 4; x <= 11; x++) put(x, y);
      for (let y = 6; y <= 13; y++) for (let x = 4; x <= 11; x++) if (x < 7 || x > 8) put(x, y);
    } else {
      for (let y = 8; y <= 13; y++) for (let x = 2; x <= 6; x++) if (y > 10 || x > 3) put(x, y);
      for (let y = 8; y <= 13; y++) for (let x = 9; x <= 13; x++) if (y > 10 || x < 12) put(x, y);
    }
  });
}
const ARMOR_MATS = [['leather', 'Leather', 0x8a4f2a, [1, 3, 2, 1]], ['golden', 'Golden', 0xf5cc2e, [2, 5, 3, 1]], ['iron', 'Iron', 0xdcdcdc, [2, 6, 5, 2]], ['diamond', 'Diamond', 0x5decf5, [3, 8, 6, 3]]];
const ARMOR_PIECES = [['helmet', 'Helmet', 5], ['chestplate', 'Chestplate', 8], ['leggings', 'Leggings', 7], ['boots', 'Boots', 4]];
for (const [k, , c] of ARMOR_MATS) for (const [piece] of ARMOR_PIECES) makeTile('i_' + k + '_' + piece, pArmor(piece, c));
makeTile('i_armor_icon', pArmor('chestplate', 0xdcdcdc));
const pChest = top => P => {
  pPlanks(0x9a6a32)(P);
  for (let i = 0; i < 16; i++) { P.put(i, 0, 0x4a2f12); P.put(0, i, 0x4a2f12); P.put(i, 15, 0x4a2f12); P.put(15, i, 0x4a2f12); }
  if (!top) { for (let x = 1; x < 15; x++) P.put(x, 5, 0x4a2f12); P.rect(7, 4, 2, 4, 0xd8c040); P.put(7, 6, 0x3a2a10); }
};
makeTile('chest_side', pChest(false));
makeTile('chest_top', pChest(true));
makeTile('spawner', P => { P.clear(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (x % 4 === 0 || y % 4 === 0 || x === 15 || y === 15) P.put(x, y, P.vary(0x2a3038, 10)); P.rect(6, 6, 4, 4, 0xff7a20, 30); });
makeTile('i_ghast_tear', pPlant(P => { for (let y = 3; y <= 13; y++) { const w = y < 8 ? (y - 3) / 2 : 3 - (y - 8) * 0.5; for (let x = Math.round(8 - w); x <= Math.round(8 + w); x++) P.put(x, y, x < 8 ? 0xffffff : 0xc8e0f0); } }));

makeTile('i_stick', pPlant(P => { for (let i = 0; i < 10; i++) { P.put(3 + i, 12 - i, 0x7a5a32); P.put(4 + i, 12 - i, 0x4e3a20); } }));
makeTile('i_coal', pBlob(0x2a2a2a, 5, 0x555555));
makeTile('i_iron_ingot', pIngot(0xd8d8d8));
makeTile('i_gold_ingot', pIngot(0xf5cc2e));
makeTile('i_diamond', pGem(0x5decf5));
makeTile('i_emerald', pPlant(P => { for (let y = 3; y <= 13; y++) { const w = y < 6 ? y - 2 : y > 10 ? 14 - y : 3; for (let x = 8 - w; x <= 7 + w; x++) P.put(x, y, x < 8 ? 0x5cf08a : 0x17a53a); } P.pts([[7, 5], [6, 6]], [220, 255, 230]); }));
makeTile('i_redstone', pPlant(P => { for (let i = 0; i < 24; i++) { const a = P.rng() * 6.28, r = P.rng() * 5; P.put(8 + Math.cos(a) * r, 9 + Math.sin(a) * r * 0.7, P.vary(0xd01c10, 30)); } }));
makeTile('i_lapis', pGem(0x2552c8));
makeTile('i_flint', pPlant(P => { P.disc(8, 9, 4.5, 0x3a3a3a, 10); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (y < 6 + (Math.abs(x - 8) > 2 ? 3 : 0)) P.erase(x, y); P.pts([[7, 7], [8, 6]], 0x707070); }));
makeTile('i_string', pPlant(P => { for (let x = 2; x < 14; x++) P.put(x, 8 + Math.round(Math.sin(x * 0.9) * 2), 0xeeeeee); }));
makeTile('i_feather', pPlant(P => { P.line(3, 13, 12, 3, 0x9a9a9a); for (let i = 0; i < 8; i++) { P.put(5 + i, 13 - i, 0xffffff); P.put(4 + i, 11 - i, 0xf0f0f0); P.put(6 + i, 12 - i, 0xe0e0e0); } }));
makeTile('i_gunpowder', pPlant(P => { for (let i = 0; i < 40; i++) { const x = 3 + P.rng() * 10, y = 8 + P.rng() * 6; if (y - 8 > Math.abs(x - 8) * 0.8 - 1) P.put(x, y, P.vary(0x5a5a5a, 25)); } }));
makeTile('i_bone', pPlant(P => { P.line(4, 12, 12, 4, 0xeeeadc); P.line(5, 12, 12, 5, 0xd8d2c0); P.pts([[3, 11], [4, 13], [3, 13], [11, 3], [13, 4], [13, 3]], 0xeeeadc); }));
makeTile('i_leather', pBlob(0x8a4f2a, 5.5));
makeTile('i_rotten_flesh', pBlob(0x7a6a3a, 5, 0xa04030));
makeTile('i_porkchop', pBlob(0xf09a96, 5, 0xffffff));
makeTile('i_cooked_porkchop', pBlob(0xb5763e, 5, 0xe0c090));
makeTile('i_beef', pBlob(0xc8302c, 5.2, 0xf0c0c0));
makeTile('i_steak', pBlob(0x7a4422, 5.2, 0xa06a3a));
makeTile('i_chicken', pBlob(0xf5c8b0, 4.6));
makeTile('i_cooked_chicken', pBlob(0xc8883e, 4.6));
makeTile('i_apple', pPlant(P => { P.disc(8, 9, 5, 0xd0201c, 10); P.pts([[6, 7], [6, 8], [7, 6]], 0xff6a5a); P.line(8, 4, 8, 2, 0x5a3a1a); P.pts([[9, 3], [10, 2], [10, 3]], 0x3f8f2f); }));
makeTile('i_golden_apple', pPlant(P => { P.disc(8, 9, 5, 0xf5cc2e, 10); P.pts([[6, 7], [6, 8], [7, 6]], 0xfff3a0); P.line(8, 4, 8, 2, 0x5a3a1a); P.pts([[9, 3], [10, 2], [10, 3]], 0x3f8f2f); }));
makeTile('i_wheat', pPlant(P => { for (const [x0, lean] of [[5, -1], [8, 0], [11, 1]]) { P.line(x0, 15, x0 + lean * 2, 5, 0xb89a3a); for (let j = 0; j < 4; j++) { P.put(x0 + lean * 2 - 1, 2 + j * 1.5, P.vary(0xdcb84a, 14)); P.put(x0 + lean * 2 + 1, 2.5 + j * 1.5, P.vary(0xc9a33a, 14)); P.put(x0 + lean * 2, 1 + j * 1.5, P.vary(0xe8c860, 14)); } } P.rect(4, 11, 9, 2, 0x7a5a20); }));
makeTile('i_bread', pPlant(P => { for (let y = 5; y <= 12; y++) for (let x = 1; x <= 14; x++) { const d = ((x - 7.5) / 7) ** 2 + ((y - 8.5) / 3.8) ** 2; if (d <= 1) P.put(x, y, d > 0.75 ? 0x7a4a1c : y < 8 ? P.vary(0xc8843a, 10) : P.vary(0xa86a2a, 10)); } for (const x of [4, 7, 10]) P.line(x, 6, x + 1, 8, 0xe8c070); }));
makeTile('wheat_crop', pPlant(P => { for (let i = 0; i < 9; i++) { const x = 1 + i * 1.7 | 0, h = 9 + P.rng() * 5 | 0; P.line(x, 15, x, 15 - h, P.vary(0x8a9a3a, 12)); for (let j = 0; j < 4; j++) P.put(x + (j % 2 ? 1 : -1), 15 - h + j, P.vary(0xd8b848, 16)); } }));
makeTile('end_stone', P => { P.fill(0xdedb9e, 10); P.speck(0xc8c483, 0.25, 8); P.speck(0xf0eebb, 0.12, 6); });
makeTile('end_frame_side', P => { P.fill(0xdedb9e, 8); P.speck(0xc8c483, 0.2, 6); P.rect(0, 0, 16, 4, 0x2f6b5c, 8); P.rect(0, 4, 16, 1, 0x1f4a40); });
makeTile('end_frame_top', P => { P.fill(0x2f6b5c, 10); P.speck(0x23544a, 0.3, 6); P.rect(4, 4, 8, 8, 0x14302a); P.rect(5, 5, 6, 6, 0x0b1c18); });
makeTile('end_frame_top_eye', P => { P.fill(0x2f6b5c, 10); P.speck(0x23544a, 0.3, 6); P.rect(4, 4, 8, 8, 0x14302a); P.disc(8, 8, 3, 0x3fae6a, 10); P.rect(7, 6, 2, 4, 0x0e2a18); });
makeTile('end_portal', P => { P.fill(0x070612, 4); for (let i = 0; i < 18; i++) P.put(P.rng() * 16 | 0, P.rng() * 16 | 0, [0x9fe8d8, 0x6fd0e8, 0xcfa0f0, 0xffffff][i % 4]); });
makeTile('i_blaze_powder', pPlant(P => { for (let i = 0; i < 26; i++) { const a = P.rng() * 6.28, r = P.rng() * 5; P.put(8 + Math.cos(a) * r, 9 + Math.sin(a) * r * 0.7, P.rng() < 0.5 ? 0xffb020 : 0xf07010); } P.pts([[7, 8], [9, 10], [8, 6]], 0xfff080); }));
makeTile('i_eye_of_ender', pPlant(P => { P.disc(8, 8, 6, 0x2a8a5a, 8); P.disc(8, 8, 4.5, 0x46c98a, 10); P.rect(7, 4, 2, 8, 0x0c2a1a); P.pts([[5, 5], [6, 5]], 0xc0ffd8); }));
const pBucket = fill => pPlant(P => {
  for (let y = 4; y <= 13; y++) { const w = 5 - Math.floor((y - 4) / 3); for (let x = 8 - w; x <= 7 + w; x++) P.put(x, y, x === 8 - w || x === 7 + w || y === 13 ? 0x8a8a8a : 0xc8c8c8); }
  for (let x = 3; x <= 12; x++) P.put(x, 3, 0x9a9a9a);
  P.pts([[2, 4], [2, 5], [13, 4], [13, 5]], 0x7a7a7a);
  if (fill) for (let x = 4; x <= 11; x++) { P.put(x, 4, fill); P.put(x, 5, fill); }
});
makeTile('i_bucket', pBucket(0));
makeTile('i_boat', pPlant(P => { P.rect(1, 8, 14, 2, 0x9a6a32); P.rect(2, 10, 12, 2, 0x8a5a2a); P.rect(4, 12, 8, 1, 0x6e4a22); P.rect(1, 6, 1, 3, 0x6e4a22); P.rect(14, 6, 1, 3, 0x6e4a22); P.rect(5, 7, 2, 1, 0x6e4a22); P.rect(9, 7, 2, 1, 0x6e4a22); P.line(3, 3, 9, 9, 0x5a3c1c); }));
makeTile('i_lead', pPlant(P => { for (let i = 0; i < 6; i++) { P.put(3 + i, 3 + i, 0xc8a46a); P.put(4 + i, 3 + i, 0x9a7a4a); } for (let a = 0; a < 6.3; a += 0.4) P.put(11 + Math.cos(a) * 3, 11 + Math.sin(a) * 3, 0x9a7a4a); P.put(2, 2, 0x8a6a3a); }));
const pHorseArmor = (c1, c2) => pPlant(P => { P.rect(2, 6, 10, 5, c1); P.rect(10, 3, 4, 5, c1); P.rect(12, 2, 2, 2, c2); P.rect(2, 6, 10, 1, c2); P.rect(3, 11, 2, 3, c2); P.rect(9, 11, 2, 3, c2); P.rect(4, 8, 6, 1, c2); });
makeTile('i_leather_horse_armor', pHorseArmor(0xa0663c, 0x6e4224));
makeTile('i_iron_horse_armor', pHorseArmor(0xd8d8d8, 0x9a9a9a));
makeTile('i_golden_horse_armor', pHorseArmor(0xf5cc2e, 0xb8901a));
makeTile('i_diamond_horse_armor', pHorseArmor(0x5fe0d8, 0x2a9a94));
makeTile('i_water_bucket', pBucket(0x3a6ad8));
makeTile('i_lava_bucket', pBucket(0xf06a10));
makeTile('i_milk_bucket', pBucket(0xf4f4f4));
makeTile('i_wheat_seeds', pPlant(P => { for (const [x, y] of [[5, 6], [8, 5], [10, 8], [6, 10], [9, 11], [12, 6], [4, 12], [11, 12]]) { P.put(x, y, 0x5a9a2a); P.put(x + 1, y, 0x3e7a1e); P.put(x, y + 1, 0x7aba3a); } }));
makeTile('farmland_top', P => { P.fill(0x5a3a1e, 8); for (let y = 1; y < 16; y += 3) for (let x = 0; x < 16; x++) P.put(x, y, P.vary(0x3e2810, 6)); });
makeTile('wheat_sprout', pPlant(P => { for (let i = 0; i < 6; i++) { const x = 2 + i * 2.4 | 0, h = 3 + P.rng() * 4 | 0; P.line(x, 15, x, 15 - h, P.vary(0x5aa02a, 14)); P.put(x + 1, 15 - h + 1, P.vary(0x7ac040, 14)); } }));
makeTile('door_lower', P => { pPlanks(0x9a6a32)(P); P.rect(2, 2, 12, 12, 0x7a5228, 6); P.rect(0, 0, 16, 1, 0x5a3c1c); P.rect(0, 0, 1, 16, 0x5a3c1c); P.rect(15, 0, 1, 16, 0x5a3c1c); P.rect(0, 15, 16, 1, 0x5a3c1c); P.rect(12, 1, 2, 2, 0x3a3a3a); });
makeTile('door_upper', P => { pPlanks(0x9a6a32)(P); P.rect(3, 3, 4, 5, 0xbfe0f0); P.rect(9, 3, 4, 5, 0xbfe0f0); P.rect(3, 10, 4, 4, 0xbfe0f0); P.rect(9, 10, 4, 4, 0xbfe0f0); P.rect(0, 0, 16, 1, 0x5a3c1c); P.rect(0, 0, 1, 16, 0x5a3c1c); P.rect(15, 0, 1, 16, 0x5a3c1c); });
makeTile('trapdoor', P => { pPlanks(0x9a6a32)(P); P.rect(0, 0, 16, 2, 0x5a3c1c); P.rect(0, 14, 16, 2, 0x5a3c1c); P.rect(0, 0, 2, 16, 0x5a3c1c); P.rect(14, 0, 2, 16, 0x5a3c1c); P.rect(4, 4, 3, 3, 0x2a1a0a); P.rect(9, 4, 3, 3, 0x2a1a0a); P.rect(4, 9, 3, 3, 0x2a1a0a); P.rect(9, 9, 3, 3, 0x2a1a0a); });
makeTile('i_oak_door', pPlant(P => { P.rect(4, 0, 8, 16, 0x9a6a32); P.rect(5, 2, 2, 4, 0xbfe0f0); P.rect(9, 2, 2, 4, 0xbfe0f0); P.rect(4, 0, 1, 16, 0x5a3c1c); P.rect(11, 0, 1, 16, 0x5a3c1c); P.rect(4, 8, 8, 1, 0x5a3c1c); P.put(10, 10, 0x3a3a3a); }));
makeTile('i_oak_trapdoor', pPlant(P => { P.rect(1, 3, 14, 10, 0x9a6a32); P.rect(1, 3, 14, 1, 0x5a3c1c); P.rect(1, 12, 14, 1, 0x5a3c1c); P.rect(4, 5, 3, 3, 0x2a1a0a); P.rect(9, 5, 3, 3, 0x2a1a0a); P.rect(4, 9, 3, 2, 0x2a1a0a); P.rect(9, 9, 3, 2, 0x2a1a0a); }));
const pStairIcon = (c, d) => pPlant(P => { for (let y = 2; y < 15; y++) for (let x = 1; x < 15; x++) { if (y < 8 && x < 8) continue; P.put(x, y, x === 1 || y === 14 || (y === 8 && x < 8) || (x === 8 && y < 8) || x === 14 || y === 2 ? d : P.vary(c, 10)); } });
makeTile('i_oak_stairs', pStairIcon(0xa8834f, 0x5a3c1c));
makeTile('i_cobblestone_stairs', pStairIcon(0x8a8a8a, 0x4a4a4a));
makeTile('i_stone_brick_stairs', pStairIcon(0x7a7a7a, 0x3e3e3e));
makeTile('i_oak_fence', pPlant(P => { for (const x of [2, 7, 12]) P.rect(x, 1, 2, 14, 0xa8834f); P.rect(2, 4, 12, 2, 0x8a6a3a); P.rect(2, 10, 12, 2, 0x8a6a3a); for (const x of [2, 7, 12]) { P.put(x, 1, 0xc8a46a); P.put(x + 1, 14, 0x5a3c1c); } }));
const pSapling = (leaf, trunk) => pPlant(P => { P.line(8, 15, 8, 8, trunk); P.put(7, 12, trunk); for (let i = 0; i < 26; i++) { const a = P.rng() * 6.28, r = P.rng() * 4.5; P.put(8 + Math.cos(a) * r, 6 + Math.sin(a) * r * 0.8, P.vary(leaf, 18)); } });
makeTile('oak_sapling', pSapling(0x4a8a2a, 0x6a4a24));
makeTile('birch_sapling', pSapling(0x7aa84a, 0xd8d8c8));
makeTile('spruce_sapling', pSapling(0x2e5a2e, 0x4a3420));
makeTile('i_ladder_icon', P => { P.clear(); for (const x of [3, 11]) P.rect(x, 0, 2, 16, 0x8a6a3a); for (const y of [2, 6, 10, 14]) P.rect(3, y, 10, 2, 0xa8834f); });
makeTile('ladder', P => { P.clear(); for (const x of [2, 12]) P.rect(x, 0, 2, 16, 0x8a6a3a); for (const y of [2, 6, 10, 14]) P.rect(2, y, 12, 2, 0xa8834f); P.rect(2, 0, 1, 16, 0x5a3c1c); P.rect(13, 0, 1, 16, 0x5a3c1c); });
makeTile('i_oak_fence_gate', pPlant(P => { P.rect(1, 2, 2, 12, 0xa8834f); P.rect(13, 2, 2, 12, 0xa8834f); P.rect(3, 4, 10, 2, 0x8a6a3a); P.rect(3, 10, 10, 2, 0x8a6a3a); P.rect(7, 4, 2, 8, 0x8a6a3a); P.put(1, 2, 0xc8a46a); P.put(13, 2, 0xc8a46a); }));
makeTile('i_oak_sign', pPlant(P => { P.rect(1, 2, 14, 8, 0xb8935a); P.rect(1, 2, 14, 1, 0x7a5a2a); P.rect(1, 9, 14, 1, 0x7a5a2a); P.rect(7, 10, 2, 5, 0x7a5a2a); for (const y of [4, 6]) P.rect(3, y, 10, 1, 0x4a3418); }));
makeTile('i_carrot', pPlant(P => { for (let i = 0; i < 9; i++) { const w = Math.max(1, 3 - (i >> 2)); P.rect(6 + i * 0.6 | 0, 5 + i, w, 1, P.vary(0xf0801a, 12)); } P.pts([[7, 7], [9, 10]], 0xc05a10); for (const [x, y] of [[5, 2], [6, 1], [7, 3], [8, 2], [9, 1]]) { P.put(x, y, 0x3e8a1d); P.put(x, y + 1, 0x5aa02a); } }));
makeTile('carrot_sprout', pPlant(P => { for (let i = 0; i < 5; i++) { const x = 3 + i * 2.5 | 0, h = 2 + P.rng() * 3 | 0; P.line(x, 15, x, 15 - h, P.vary(0x4a9a2a, 14)); P.put(x - 1, 15 - h, 0x6ab83a); } }));
makeTile('carrot_crop', pPlant(P => { for (let i = 0; i < 5; i++) { const x = 2 + i * 3 | 0, h = 5 + P.rng() * 4 | 0; P.line(x, 13, x, 13 - h, P.vary(0x3e8a1d, 14)); P.put(x + 1, 13 - h + 1, 0x5aa02a); P.put(x - 1, 13 - h + 2, 0x5aa02a); P.rect(x - 1, 13, 3, 3, P.vary(0xf0801a, 10)); } }));
makeTile('i_potato', pPlant(P => { for (let y = 4; y <= 12; y++) for (let x = 3; x <= 13; x++) { const d = ((x - 8) / 5.2) ** 2 + ((y - 8) / 4.2) ** 2; if (d <= 1) P.put(x, y, d > 0.7 ? 0x9a7038 : P.vary(0xc8a058, 10)); } P.pts([[6, 7], [10, 9], [8, 6]], 0x7a5428); }));
makeTile('i_baked_potato', pPlant(P => { for (let y = 4; y <= 12; y++) for (let x = 3; x <= 13; x++) { const d = ((x - 8) / 5.2) ** 2 + ((y - 8) / 4.2) ** 2; if (d <= 1) P.put(x, y, d > 0.7 ? 0x7a4a1c : P.vary(0xd8a040, 10)); } P.rect(6, 7, 4, 2, 0xf8e070); }));
makeTile('i_pumpkin_seeds', pPlant(P => { for (const [x, y] of [[5, 5], [9, 4], [11, 8], [6, 10], [9, 11], [4, 8]]) { P.put(x, y, 0xf0e0b0); P.put(x + 1, y, 0xd8c890); P.put(x, y + 1, 0xc8b480); } }));
makeTile('potato_sprout', pPlant(P => { for (let i = 0; i < 5; i++) { const x = 3 + i * 2.5 | 0, h = 2 + P.rng() * 3 | 0; P.line(x, 15, x, 15 - h, P.vary(0x4a9a2a, 14)); P.put(x + 1, 15 - h, 0x6ab83a); } }));
makeTile('potato_crop', pPlant(P => { for (let i = 0; i < 5; i++) { const x = 2 + i * 3 | 0, h = 6 + P.rng() * 4 | 0; P.line(x, 14, x, 14 - h, P.vary(0x3e8a1d, 14)); P.put(x + 1, 14 - h + 1, 0x5aa02a); P.put(x - 1, 14 - h + 2, 0x5aa02a); } for (const x of [3, 8, 12]) P.rect(x, 13, 3, 3, 0xc8a058); }));
makeTile('pumpkin_stem', pPlant(P => { P.line(8, 15, 8, 6, 0x6a9a2a); P.line(8, 9, 12, 7, 0x6a9a2a); P.line(8, 11, 4, 9, 0x5a8a24); for (const [x, y] of [[12, 6], [13, 7], [4, 8], [3, 9], [8, 5], [9, 5]]) P.put(x, y, 0x4a8a2a); }));
makeTile('i_melon_slice', pPlant(P => { for (let y = 4; y <= 12; y++) for (let x = 2; x <= 14; x++) { const d = Math.hypot(x - 8, y - 4); if (d <= 7) P.put(x, y, d > 6 ? 0x3e8a1d : d > 5.2 ? 0xe8f0a0 : 0xe0342c); } P.pts([[6, 6], [9, 7], [8, 9], [11, 6]], 0x1a1a1a); }));
makeTile('i_ender_pearl', pPlant(P => { P.disc(8, 8, 5, 0x1d6b5c, 8); P.disc(8, 8, 2.6, 0x3fb59a, 8); P.pts([[6, 6], [7, 6]], 0xb0fff0); }));
makeTile('i_bow', pPlant(P => { for (let a = 0; a <= 90; a += 4) { const r = a * Math.PI / 180; P.put(2 + Math.cos(r) * 11, 2 + Math.sin(r) * 11, 0x7a5a32); P.put(2 + Math.cos(r) * 10, 2 + Math.sin(r) * 10, 0x5a3e20); } P.line(13, 2, 2, 13, 0xdddddd); }));
makeTile('i_arrow', pPlant(P => { P.line(3, 12, 12, 3, 0x7a5a32); P.pts([[12, 2], [13, 3], [13, 2], [11, 2], [13, 4]], 0x9a9a9a); P.pts([[2, 11], [3, 13], [2, 13], [1, 12], [4, 14]], 0xeeeeee); }));
makeTile('i_flint_and_steel', pPlant(P => { P.disc(6, 6, 3.5, 0x9a9a9a); P.disc(6, 6, 2, [0, 0, 0]); for (let y = 2; y <= 10; y++) for (let x = 2; x <= 10; x++) if ((x - 6) ** 2 + (y - 6) ** 2 <= 4) P.erase(x, y); P.disc(11, 11, 3, 0x3a3a3a, 8); }));
for (const [k, c] of [['wooden', 0xa8834f], ['stone', 0x8a8a8a], ['iron', 0xdcdcdc], ['golden', 0xf5cc2e], ['diamond', 0x5decf5]]) {
  makeTile('i_' + k + '_pickaxe', pTool('pick', c));
  makeTile('i_' + k + '_sword', pTool('sword', c));
  makeTile('i_' + k + '_shovel', pTool('shovel', c));
  makeTile('i_' + k + '_axe', pTool('axe', c));
  makeTile('i_' + k + '_hoe', pTool('hoe', c));
}

/* ---------- registry ---------- */
const DEFS = [];
const ID = Object.create(null);
/* ---------- more of the Nether: netherite, crimson and warped forests, basalt ---------- */
makeTile('ancient_debris_side', P => { P.fill(0x5e4234, 12); for (let i = 0; i < 5; i++) { const y = 2 + i * 3; P.rect(1, y, 14, 1, 0x7a5644, 6); } P.speck(0x3a2a22, 0.15, 5); P.speck(0x9a7a64, 0.06, 6); });
makeTile('ancient_debris_top', P => { P.fill(0x4e3a2e, 10); for (let r = 2; r < 8; r += 2) for (let a = 0; a < 6.3; a += 0.3) P.put(7.5 + Math.cos(a) * r, 7.5 + Math.sin(a) * r, 0x6e5040); });
makeTile('netherite_block', P => { P.fill(0x3e3a3c, 6); P.speck(0x4e484a, 0.25, 4); P.rect(0, 0, 16, 1, 0x5a5456); P.rect(0, 15, 16, 1, 0x2a2628); P.rect(0, 0, 1, 16, 0x5a5456); P.rect(15, 0, 1, 16, 0x2a2628); });
makeTile('blackstone', P => { P.fill(0x2a2428, 10); P.speck(0x3c3438, 0.25, 6); P.speck(0x1a1618, 0.15, 4); });
makeTile('basalt_side', P => { P.fill(0x58585e, 8); for (let x = 1; x < 16; x += 3) P.rect(x, 0, 1, 16, 0x46464c, 4); P.speck(0x6c6c72, 0.1, 5); });
makeTile('basalt_top', P => { P.fill(0x505056, 8); for (let r = 2; r < 8; r += 3) for (let a = 0; a < 6.3; a += 0.25) P.put(7.5 + Math.cos(a) * r, 7.5 + Math.sin(a) * r, 0x68686e); });
makeTile('crimson_nylium', P => { P.fill(0xa8202a, 16); P.speck(0xd23a3a, 0.2, 8); P.speck(0x701418, 0.15, 6); });
makeTile('crimson_nylium_side', P => { pNetherrack(P); for (let x = 0; x < 16; x++) { const h = 3 + (P.rng() * 3 | 0); for (let y = 0; y < h; y++) P.put(x, y, P.vary(0xa8202a, 14)); } });
makeTile('warped_nylium', P => { P.fill(0x1f8a7a, 16); P.speck(0x3ab8a0, 0.2, 8); P.speck(0x135a52, 0.15, 6); });
makeTile('warped_nylium_side', P => { pNetherrack(P); for (let x = 0; x < 16; x++) { const h = 3 + (P.rng() * 3 | 0); for (let y = 0; y < h; y++) P.put(x, y, P.vary(0x1f8a7a, 14)); } });
makeTile('crimson_stem', pLogSide(0x6a2238, 0x4a1426));
makeTile('crimson_stem_top', pLogTop(0x4a1426, 0x9a3a4a, 0x7a2a3a));
makeTile('warped_stem', pLogSide(0x2a5a5e, 0x1a3c40));
makeTile('warped_stem_top', pLogTop(0x1a3c40, 0x3a8a80, 0x2a6a64));
makeTile('crimson_planks', pPlanks(0x7a3a52));
makeTile('warped_planks', pPlanks(0x2b6b62));
makeTile('nether_wart_block', P => { P.fill(0x8a1414, 18); P.speck(0xb02424, 0.25, 8); P.speck(0x5a0a0a, 0.2, 6); });
makeTile('warped_wart_block', P => { P.fill(0x147a6e, 18); P.speck(0x22a092, 0.25, 8); P.speck(0x0a4a44, 0.2, 6); });
makeTile('shroomlight', P => { P.fill(0xf0a040, 12); P.speck(0xffd27a, 0.3, 8); P.speck(0xd07020, 0.15, 6); });
makeTile('crimson_roots', pPlant(P => { for (let i = 0; i < 7; i++) { const x = 2 + P.rng() * 12 | 0, h = 4 + P.rng() * 8 | 0; for (let j = 0; j < h; j++) P.put(x + (j > h / 2 ? 1 : 0), 15 - j, P.vary(0xb0283a, 18)); } }));
makeTile('warped_roots', pPlant(P => { for (let i = 0; i < 7; i++) { const x = 2 + P.rng() * 12 | 0, h = 4 + P.rng() * 8 | 0; for (let j = 0; j < h; j++) P.put(x + (j > h / 2 ? -1 : 0), 15 - j, P.vary(0x22a092, 18)); } }));
makeTile('i_netherite_scrap', pPlant(P => { P.disc(8, 8, 5, 0x5e4234); P.disc(8, 8, 3, 0x7a5644); P.put(6, 6, 0x9a7a64); P.put(10, 9, 0x3a2a22); }));
makeTile('i_netherite_ingot', pPlant(P => { P.rect(2, 6, 12, 5, 0x3e3a3c); P.rect(3, 5, 10, 1, 0x5a5456); P.rect(2, 10, 12, 1, 0x26222a); P.rect(4, 7, 3, 1, 0x6a6466); }));
for (const kind of ['pick', 'sword', 'shovel', 'axe', 'hoe']) makeTile('i_netherite_' + { pick: 'pickaxe', sword: 'sword', shovel: 'shovel', axe: 'axe', hoe: 'hoe' }[kind], pTool(kind, 0x4a4448));
for (const [piece] of ARMOR_PIECES) makeTile('i_netherite_' + piece, pArmor(piece, 0x4a4448));

/* coloured (stained) glass: see-through and tinted */
const STAINS = [['white', 'White', 0xf2f2f2], ['red', 'Red', 0xc83232], ['blue', 'Blue', 0x3c50d0], ['green', 'Green', 0x4a9a32], ['yellow', 'Yellow', 0xf0d03a], ['black', 'Black', 0x2a2a2a], ['orange', 'Orange', 0xf0882a], ['purple', 'Purple', 0x8a3ac8]];
for (const [k, , c] of STAINS) makeTile('stained_glass_' + k, P => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P.put(x, y, c, 120);
  const hi = rgb(c).map(v => Math.min(255, v + 50)), lo = rgb(c).map(v => Math.round(v * 0.7));
  for (let i = 0; i < 16; i++) { P.put(i, 0, hi, 230); P.put(0, i, hi, 230); P.put(i, 15, lo, 230); P.put(15, i, lo, 230); }
  P.pts([[3, 4], [4, 3], [4, 5], [5, 4], [11, 10], [10, 11]], hi);
});
/* deepslate: the dark stone deep underground, and its ores */
const pDeepslate = P => { P.fill(0x4a4a50, 8); for (let y = 1; y < 16; y += 3) for (let x = 0; x < 16; x++) if (P.rng() < 0.55) P.put(x, y, P.vary(0x3a3a40, 4)); P.speck(0x5c5c62, 0.08, 4); };
makeTile('deepslate', pDeepslate);
makeTile('deepslate_top', P => { P.fill(0x46464c, 8); P.speck(0x38383e, 0.25, 4); P.speck(0x56565c, 0.1, 4); });
makeTile('cobbled_deepslate', P => { P.fill(0x3e3e44, 10); for (let i = 0; i < 9; i++) { const x = P.rng() * 13 | 0, y = P.rng() * 13 | 0; P.rect(x, y, 3 + (P.rng() * 2 | 0), 2 + (P.rng() * 2 | 0), 0x56565c, 6); } P.speck(0x2a2a2e, 0.15, 4); });
const pDeepOre = (col, hi) => P => {
  pDeepslate(P);
  for (let i = 0; i < 6; i++) { const x = 1 + (P.rng() * 12 | 0), y = 1 + (P.rng() * 12 | 0); P.put(x, y, col); P.put(x + 1, y, col); P.put(x, y + 1, shadeC(col, 0.8)); P.put(x + 1, y + 1, P.rng() < 0.6 ? hi : col); }
};
for (const [k, c, h] of [['coal', 0x1a1a1a, 0x3a3a3a], ['iron', 0xd8af93, 0xeccbb5], ['gold', 0xfcd33c, 0xfff3a0], ['diamond', 0x5decf5, 0xd2fffc], ['redstone', 0xc4140c, 0xff5a4a], ['emerald', 0x17c544, 0x8affab], ['lapis', 0x1f45b5, 0x5a85ff]]) makeTile('deepslate_' + k + '_ore', pDeepOre(c, h));
/* jungle wood */
makeTile('log_jungle', pLogSide(0x5e4a26, 0x423318));
makeTile('log_jungle_top', pLogTop(0x423318, 0xb08850, 0x8c6a3a));
makeTile('leaves_jungle', pLeaves(0x2f9a24));
makeTile('planks_jungle', pPlanks(0xa8744a));
makeTile('jungle_sapling', pSapling(0x2f9a24, 0x5e4a26));
/* dark oak */
makeTile('log_dark_oak', pLogSide(0x3e2c18, 0x2a1d0e));
makeTile('log_dark_oak_top', pLogTop(0x2a1d0e, 0x5e4228, 0x4a321c));
makeTile('leaves_dark_oak', pLeaves(0x2a6a1a));
makeTile('planks_dark_oak', pPlanks(0x4a3220));
makeTile('dark_oak_sapling', pSapling(0x2a6a1a, 0x3e2c18));
makeTile('i_dark_oak_stairs', pStairIcon(0x4a3220, 0x24180c));
/* every wood gets doors, trapdoors, fences, gates and stairs (oak had them already) */
const WOODS = [['birch', 'Birch', 0xc8b77a, 'planks_birch'], ['spruce', 'Spruce', 0x6e5232, 'planks_spruce'], ['jungle', 'Jungle', 0xa8744a, 'planks_jungle'],
  ['dark_oak', 'Dark Oak', 0x4a3220, 'planks_dark_oak'], ['crimson', 'Crimson', 0x7a3a52, 'crimson_planks'], ['warped', 'Warped', 0x2b6b62, 'warped_planks']];
function woodTiles(w, c) {
  const dk = shadeC(rgb(c), 0.62), dk2 = shadeC(rgb(c), 0.4), lt = shadeC(rgb(c), 1.2);
  makeTile(w + '_door_lower', P => { pPlanks(c)(P); P.rect(2, 2, 12, 12, shadeC(rgb(c), 0.85), 6); P.rect(0, 0, 16, 1, dk); P.rect(0, 0, 1, 16, dk); P.rect(15, 0, 1, 16, dk); P.rect(0, 15, 16, 1, dk); P.rect(12, 1, 2, 2, 0x3a3a3a); });
  makeTile(w + '_door_upper', P => { pPlanks(c)(P); P.rect(3, 3, 4, 5, 0xbfe0f0); P.rect(9, 3, 4, 5, 0xbfe0f0); P.rect(3, 10, 4, 4, 0xbfe0f0); P.rect(9, 10, 4, 4, 0xbfe0f0); P.rect(0, 0, 16, 1, dk); P.rect(0, 0, 1, 16, dk); P.rect(15, 0, 1, 16, dk); });
  makeTile(w + '_trapdoor', P => { pPlanks(c)(P); P.rect(0, 0, 16, 2, dk); P.rect(0, 14, 16, 2, dk); P.rect(0, 0, 2, 16, dk); P.rect(14, 0, 2, 16, dk); for (const [x, y] of [[4, 4], [9, 4], [4, 9], [9, 9]]) P.rect(x, y, 3, 3, dk2); });
  makeTile('i_' + w + '_door', pPlant(P => { P.rect(4, 0, 8, 16, c); P.rect(5, 2, 2, 4, 0xbfe0f0); P.rect(9, 2, 2, 4, 0xbfe0f0); P.rect(4, 0, 1, 16, dk); P.rect(11, 0, 1, 16, dk); P.rect(4, 8, 8, 1, dk); P.put(10, 10, 0x3a3a3a); }));
  makeTile('i_' + w + '_trapdoor', pPlant(P => { P.rect(1, 3, 14, 10, c); P.rect(1, 3, 14, 1, dk); P.rect(1, 12, 14, 1, dk); for (const [x, y] of [[4, 5], [9, 5], [4, 9], [9, 9]]) P.rect(x, y, 3, 2, dk2); }));
  makeTile('i_' + w + '_fence', pPlant(P => { for (const x of [2, 7, 12]) P.rect(x, 1, 2, 14, c); P.rect(2, 4, 12, 2, dk); P.rect(2, 10, 12, 2, dk); for (const x of [2, 7, 12]) P.put(x, 1, lt); }));
  makeTile('i_' + w + '_fence_gate', pPlant(P => { P.rect(1, 2, 2, 12, c); P.rect(13, 2, 2, 12, c); P.rect(3, 4, 10, 2, dk); P.rect(3, 10, 10, 2, dk); P.rect(7, 4, 2, 8, dk); }));
  if (w !== 'dark_oak') makeTile('i_' + w + '_stairs', pStairIcon(c, dk2));
}
for (const [w, , c] of WOODS) woodTiles(w, c);
/* acacia: grey bark, orange wood, from the savanna */
makeTile('log_acacia', pLogSide(0x6b6359, 0x4c463f));
makeTile('log_acacia_top', pLogTop(0x6b6359, 0xc06a3a, 0xa0522d));
makeTile('leaves_acacia', pLeaves(0x5a8f1e));
makeTile('planks_acacia', pPlanks(0xa85a32));
makeTile('acacia_sapling', pSapling(0x5a8f1e, 0x6b6359));
woodTiles('acacia', 0xa85a32);
/* mangrove (reddish wood from swamps) and cherry (pink wood from cherry groves) */
for (const [w, bark, inner, ring, leaf, plank] of [['mangrove', 0x54392d, 0x7a3a32, 0x6a3028, 0x4f8f2a, 0x7a3530], ['cherry', 0x3a2530, 0xe0b0a8, 0xc89890, 0xf2a6c8, 0xe3b4ac]]) {
  makeTile('log_' + w, pLogSide(bark, shadeC(rgb(bark), 0.72)));
  makeTile('log_' + w + '_top', pLogTop(bark, inner, ring));
  makeTile('leaves_' + w, pLeaves(leaf));
  makeTile('planks_' + w, pPlanks(plank));
  makeTile(w + '_sapling', pSapling(leaf, bark));
  woodTiles(w, plank);
  const c = rgb(plank);
  makeTile('i_' + w + '_slab', pPlant(P => { P.rect(1, 8, 14, 6, c); P.rect(1, 8, 14, 1, shadeC(c, 1.2)); P.rect(1, 13, 14, 1, shadeC(c, 0.6)); }));
}
makeTile('mangrove_roots', P => { for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { const on = (i + j) % 6 < 2 || (i - j + 32) % 7 < 2; if (on) P.put(i, j, P.vary(0x4a3226, 10)); else P.erase(i, j); } });
/* bamboo */
makeTile('bamboo_side', P => { P.clear(); P.rect(6, 0, 4, 16, 0x5d9e2a, 10); P.rect(6, 0, 1, 16, 0x4a8420); P.rect(9, 0, 1, 16, 0x76b83a); for (const y of [3, 11]) P.rect(6, y, 4, 1, 0x3e6e1a); P.put(10, 5, 0x5d9e2a); P.put(11, 4, 0x7ec04a); P.put(12, 4, 0x7ec04a); });
makeTile('bamboo_top', P => { P.clear(); P.rect(6, 6, 4, 4, 0x8ac84a); P.rect(7, 7, 2, 2, 0xc8d88a); });
makeTile('i_bamboo', pPlant(P => { P.line(4, 15, 11, 1, 0x5d9e2a); P.line(5, 15, 12, 1, 0x4a8420); for (const t of [5, 10]) P.put(4 + (7 * (15 - t) / 14 | 0), t, 0x3e6e1a); P.put(12, 3, 0x7ec04a); P.put(13, 2, 0x7ec04a); P.put(10, 4, 0x7ec04a); }));
makeTile('planks_bamboo', P => { P.fill(0xd8c25a, 6); for (let x = 0; x < 16; x += 4) P.rect(x, 0, 1, 16, 0xb09a3a); for (let y = 0; y < 16; y += 8) P.rect(0, y, 16, 1, 0xa08a32); });
makeTile('bamboo_block_side', P => { P.fill(0x6aa02e, 8); for (let x = 0; x < 16; x += 4) P.rect(x, 0, 1, 16, 0x4a7a1e); for (const y of [5, 12]) P.rect(0, y, 16, 1, 0x3e6e1a); });
makeTile('bamboo_block_top', P => { P.fill(0x4a7a1e, 6); for (const [x, y] of [[1, 1], [6, 1], [11, 1], [1, 6], [6, 6], [11, 6], [1, 11], [6, 11], [11, 11]]) { P.rect(x, y, 4, 4, 0x8ac84a); P.rect(x + 1, y + 1, 2, 2, 0xc8d88a); } });
/* sugar cane, paper, book and the enchanting table */
makeTile('sugar_cane', P => { P.clear(); for (const x of [3, 8, 12]) { P.rect(x, 0, 2, 16, 0x8ac85a, 8); P.put(x, 5, 0x5a9a3a); P.put(x + 1, 5, 0x5a9a3a); P.put(x, 12, 0x5a9a3a); P.put(x + 1, 12, 0x5a9a3a); } P.put(5, 3, 0x9ad86a); P.put(10, 8, 0x9ad86a); });
makeTile('i_sugar_cane', pPlant(P => { for (const x of [4, 8, 11]) { P.rect(x, 2, 2, 13, 0x8ac85a); P.rect(x, 6, 2, 1, 0x5a9a3a); P.rect(x, 11, 2, 1, 0x5a9a3a); } }));
makeTile('i_paper', pPlant(P => { P.rect(3, 2, 10, 12, 0xf4f0e2); P.rect(3, 2, 10, 1, 0xd8d2c0); P.rect(12, 2, 1, 12, 0xd8d2c0); for (let y = 5; y < 13; y += 2) P.rect(5, y, 6, 1, 0xc8c2b0); }));
makeTile('i_book', pPlant(P => { P.rect(3, 2, 10, 12, 0x7a3a1e); P.rect(4, 3, 8, 10, 0x8a4a2a); P.rect(11, 3, 2, 11, 0xf0ead8); P.rect(3, 13, 10, 1, 0x5a2a12); P.rect(6, 6, 4, 2, 0xd8b84a); }));
makeTile('i_enchanted_book', pPlant(P => { P.rect(3, 2, 10, 12, 0x6a2a8a); P.rect(4, 3, 8, 10, 0x8a3aaa); P.rect(11, 3, 2, 11, 0xf0ead8); P.rect(3, 13, 10, 1, 0x4a1a6a); P.rect(6, 6, 4, 2, 0xffd84a); P.put(5, 10, 0xe8b8ff); P.put(9, 4, 0xe8b8ff); }));
makeTile('ench_top', P => { P.fill(0x3a1018, 6); P.rect(0, 0, 16, 1, 0x2a0a10); P.rect(3, 4, 10, 8, 0x7a3a1e); P.rect(4, 5, 4, 6, 0xf0ead8); P.rect(8, 5, 4, 6, 0xe8e0cc); P.rect(8, 5, 1, 6, 0x9a8a6a); P.put(5, 7, 0x6a5aaa); P.put(10, 8, 0x6a5aaa); });
makeTile('ench_side', P => { P.fill(0x15101f, 5); P.speck(0x3a2860, 0.15, 6); P.rect(0, 0, 16, 4, 0x8a1a2a, 6); P.rect(0, 3, 16, 1, 0xd8b84a); for (const x of [2, 7, 12]) P.rect(x, 1, 2, 2, 0x5ae8e8); });
makeTile('ench_bottom', P => { P.fill(0x15101f, 5); P.speck(0x3a2860, 0.15, 6); });
/* levers, buttons and pressure plates */
makeTile('lever', P => { pCells(0x7d7d7d, 0x4a4a4a, 9, 8)(P); P.rect(6, 0, 4, 16, 0x8a6a3a, 6); P.rect(7, 0, 1, 16, 0x6a4a24); });
makeTile('i_lever', pPlant(P => { P.rect(3, 11, 10, 4, 0x7d7d7d, 8); P.rect(3, 11, 10, 1, 0x9a9a9a); P.line(8, 11, 11, 3, 0x8a6a3a); P.line(9, 11, 12, 3, 0x6a4a24); P.rect(11, 2, 2, 2, 0x5a3a1a); }));
makeTile('i_stone_button', pPlant(P => { P.rect(4, 6, 8, 5, 0x8a8a8a, 6); P.rect(4, 6, 8, 1, 0xaaaaaa); P.rect(4, 10, 8, 1, 0x5a5a5a); }));
makeTile('i_oak_button', pPlant(P => { P.rect(4, 6, 8, 5, 0xa8834f, 6); P.rect(4, 6, 8, 1, 0xc8a36f); P.rect(4, 10, 8, 1, 0x6a5030); }));
makeTile('i_stone_pressure_plate', pPlant(P => { P.rect(1, 10, 14, 3, 0x8a8a8a, 6); P.rect(1, 10, 14, 1, 0xaaaaaa); P.rect(1, 12, 14, 1, 0x5a5a5a); }));
makeTile('i_oak_pressure_plate', pPlant(P => { P.rect(1, 10, 14, 3, 0xa8834f, 6); P.rect(1, 10, 14, 1, 0xc8a36f); P.rect(1, 12, 14, 1, 0x6a5030); }));
/* anvil and name tag */
makeTile('anvil', P => { P.fill(0x484848, 6); P.speck(0x3a3a3a, 0.2, 4); P.speck(0x5a5a5a, 0.1, 4); P.rect(0, 0, 16, 1, 0x5e5e5e); });
makeTile('anvil_top', P => { P.fill(0x4a4a4a, 5); P.rect(2, 2, 12, 12, 0x3e3e3e, 4); P.rect(3, 3, 10, 10, 0x444444, 4); });
makeTile('i_anvil', pPlant(P => { P.rect(1, 3, 14, 4, 0x4a4a4a, 4); P.rect(1, 3, 14, 1, 0x6a6a6a); P.rect(0, 4, 2, 2, 0x4a4a4a); P.rect(5, 7, 6, 4, 0x3e3e3e); P.rect(3, 11, 10, 3, 0x4a4a4a, 4); P.rect(3, 13, 10, 1, 0x2e2e2e); }));
makeTile('i_name_tag', pPlant(P => { P.rect(4, 4, 10, 8, 0xd8c8a0); P.rect(4, 4, 10, 1, 0xf0e4c4); P.rect(4, 11, 10, 1, 0xa8986a); P.put(6, 7, 0x6a5a3a); P.put(6, 8, 0x6a5a3a); P.line(1, 2, 5, 7, 0xe8e8e8); P.rect(8, 7, 4, 1, 0x9a8a6a); }));
/* iron door */
makeTile('iron_door_lower', P => { P.fill(0xc8c8c8, 6); P.rect(0, 0, 16, 1, 0x8a8a8a); P.rect(0, 0, 1, 16, 0x8a8a8a); P.rect(15, 0, 1, 16, 0x8a8a8a); P.rect(0, 15, 16, 1, 0x8a8a8a); P.rect(3, 3, 10, 10, 0xb4b4b4, 4); for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11]]) P.put(x, y, 0x7a7a7a); P.rect(12, 6, 2, 3, 0x6a6a6a); });
makeTile('iron_door_upper', P => { P.fill(0xc8c8c8, 6); P.rect(0, 0, 16, 1, 0x8a8a8a); P.rect(0, 0, 1, 16, 0x8a8a8a); P.rect(15, 0, 1, 16, 0x8a8a8a); P.rect(3, 3, 4, 4, 0xbfe0f0); P.rect(9, 3, 4, 4, 0xbfe0f0); P.rect(3, 9, 4, 4, 0xbfe0f0); P.rect(9, 9, 4, 4, 0xbfe0f0); });
makeTile('i_iron_door', pPlant(P => { P.rect(4, 0, 8, 16, 0xc8c8c8); P.rect(5, 2, 2, 3, 0xbfe0f0); P.rect(9, 2, 2, 3, 0xbfe0f0); P.rect(4, 0, 1, 16, 0x8a8a8a); P.rect(11, 0, 1, 16, 0x8a8a8a); P.rect(4, 8, 8, 1, 0x8a8a8a); P.put(10, 10, 0x5a5a5a); }));
/* redstone dust, redstone torch, powder snow */
for (const [k, c, hi] of [['off', 0x5a0c0c, 0x7a1a14], ['on', 0xe81e10, 0xff8a6a]]) {
  makeTile('rs_dust_' + k, P => { P.clear(); P.rect(6, 0, 4, 16, c); P.rect(0, 6, 16, 4, c); P.rect(5, 5, 6, 6, c); P.rect(7, 0, 2, 16, hi); P.rect(0, 7, 16, 2, hi); for (const [x, y] of [[2, 2], [13, 3], [3, 12], [12, 13]]) P.put(x, y, c); });
  makeTile('rs_torch_' + k, P => { P.clear(); P.rect(7, 9, 2, 7, 0x8a6a3a); P.put(7, 9, 0x6a4a24); P.rect(7, 6, 2, 3, c); P.put(7, 6, hi); P.put(8, 8, hi); });
  makeTile('rs_torch_top_' + k, P => { P.fill(c, 10); P.disc(7.5, 7.5, 2, hi); });
}
for (const [k, c, hi, lo] of [['off', 0x4a0606, 0x6a1010, 0x3a0404], ['on', 0xd8160c, 0xff5a3a, 0xa80e08]]) for (let m = 0; m < 16; m++) makeTile('rsd_' + k + '_' + m, P => {
  P.clear();
  let mm = m; if (mm === 1 || mm === 4) mm = 5; if (mm === 2 || mm === 8) mm = 10; // one link: a straight line through
  const dot = (x, y) => P.put(x, y, P.rng() < 0.25 ? hi : P.rng() < 0.2 ? lo : c);
  if (mm === 0) mm = 15; // nothing next to it: a little cross, like Minecraft
  for (let y = 5; y <= 10; y++) for (let x = 5; x <= 10; x++) if (Math.abs(x - 7.5) + Math.abs(y - 7.5) < 5) dot(x, y);
  for (let i = 0; i < 8; i++) {
    if (mm & 1) for (let x = 6; x <= 9; x++) dot(x, i);
    if (mm & 4) for (let x = 6; x <= 9; x++) dot(x, 15 - i);
    if (mm & 2) for (let y = 6; y <= 9; y++) dot(15 - i, y);
    if (mm & 8) for (let y = 6; y <= 9; y++) dot(i, y);
  }
});
makeTile('lever_handle', P => { P.fill(0x8a6a3a, 8); P.rect(0, 0, 16, 3, 0x6a4a24); P.speck(0x6a4a24, 0.15, 6); });
makeTile('i_redstone_torch', pPlant(P => { P.rect(7, 6, 2, 9, 0x8a6a3a); P.rect(6, 2, 4, 4, 0xe81e10); P.rect(7, 3, 2, 2, 0xff8a6a); }));
makeTile('powder_snow', P => { P.fill(0xf6f9fc, 3); P.speck(0xe4ecf4, 0.2, 3); P.speck(0xffffff, 0.15, 2); });
makeTile('i_powder_snow_bucket', pPlant(P => { P.rect(3, 4, 10, 10, 0x9a9a9a); P.rect(4, 4, 8, 3, 0xf6f9fc); P.rect(3, 4, 10, 1, 0xbdbdbd); P.rect(4, 13, 8, 1, 0x6a6a6a); P.line(3, 4, 8, 1, 0x7a7a7a); P.line(12, 4, 8, 1, 0x7a7a7a); }));
/* redstone lamp and repeater */
makeTile('rs_lamp_off', P => { P.fill(0x5a3a22, 6); for (let i = 2; i < 14; i += 4) { P.rect(i, 1, 2, 14, 0x7a4e2e, 6); P.rect(1, i, 14, 2, 0x7a4e2e, 6); } P.rect(0, 0, 16, 1, 0x3a2414); P.rect(0, 15, 16, 1, 0x3a2414); P.rect(0, 0, 1, 16, 0x3a2414); P.rect(15, 0, 1, 16, 0x3a2414); });
makeTile('rs_lamp_on', P => { P.fill(0xf0c060, 8); for (let i = 2; i < 14; i += 4) { P.rect(i, 1, 2, 14, 0xfff0b0, 6); P.rect(1, i, 14, 2, 0xfff0b0, 6); } P.rect(0, 0, 16, 1, 0x9a6a30); P.rect(0, 15, 16, 1, 0x9a6a30); P.rect(0, 0, 1, 16, 0x9a6a30); P.rect(15, 0, 1, 16, 0x9a6a30); });
for (const [k, c, hi] of [['off', 0x5a0c0c, 0x7a1a14], ['on', 0xe81e10, 0xff8a6a]]) {
  makeTile('rep_side_' + k, P => { P.clear(); P.rect(0, 0, 16, 16, c); P.rect(0, 5, 16, 1, hi); P.rect(0, 10, 16, 1, hi); P.rect(0, 0, 16, 2, 0x8a8a8a); P.rect(0, 14, 16, 2, 0x8a8a8a); });
  // the top: a smooth stone slab with a line of redstone running the way it faces, like Minecraft
  for (const dir of ['n', 's', 'w', 'e']) makeTile('rep_top_' + dir + '_' + k, P => {
    P.fill(0xa8a8a8, 3); P.rect(0, 0, 16, 1, 0x8a8a8a); P.rect(0, 15, 16, 1, 0x8a8a8a); P.rect(0, 0, 1, 16, 0x8a8a8a); P.rect(15, 0, 1, 16, 0x8a8a8a);
    for (let i = 1; i < 15; i++) { const [u, v] = dir === 'n' || dir === 's' ? [7, i] : [i, 7]; P.put(u, v, P.rng() < 0.3 ? hi : c); P.put(u + (dir === 'n' || dir === 's' ? 1 : 0), v + (dir === 'n' || dir === 's' ? 0 : 1), c); }
  });
}
makeTile('i_redstone_lamp', P => { P.fill(0xf0c060, 8); for (let i = 2; i < 14; i += 4) { P.rect(i, 1, 2, 14, 0xfff0b0, 6); P.rect(1, i, 14, 2, 0xfff0b0, 6); } });
makeTile('i_repeater', pPlant(P => { P.rect(1, 9, 14, 4, 0x9a9a9a); P.rect(1, 9, 14, 1, 0xbdbdbd); P.rect(1, 12, 14, 1, 0x6a6a6a); P.rect(4, 5, 2, 4, 0xe81e10); P.rect(10, 5, 2, 4, 0xe81e10); P.put(4, 5, 0xff8a6a); P.put(10, 5, 0xff8a6a); P.rect(6, 10, 4, 1, 0xa81a10); }));
/* smithing table */
makeTile('smithing_top', P => { P.fill(0x3a2a2a, 6); P.rect(0, 0, 16, 2, 0x5a5a62); P.rect(0, 14, 16, 2, 0x5a5a62); P.rect(2, 4, 12, 8, 0x2a1e1e, 4); P.rect(5, 6, 6, 4, 0x6a6a74); });
makeTile('smithing_side', P => { pPlanks(0x4a3220)(P); P.rect(0, 0, 16, 4, 0x3a2a2a); P.rect(0, 3, 16, 1, 0x6a6a74); P.rect(3, 8, 3, 5, 0x5a5a62); P.rect(10, 8, 3, 5, 0x5a5a62); });
makeTile('smithing_front', P => { pPlanks(0x4a3220)(P); P.rect(0, 0, 16, 4, 0x3a2a2a); P.rect(0, 3, 16, 1, 0x6a6a74); P.rect(5, 7, 6, 6, 0x2a2a30); P.rect(6, 8, 4, 2, 0x8a8a94); });
/* wither skull, nether star, beacon */
makeTile('wither_skull', P => { P.fill(0x2a2a2a, 6); P.rect(3, 5, 3, 3, 0x0a0a0a); P.rect(10, 5, 3, 3, 0x0a0a0a); P.rect(6, 10, 4, 1, 0x0a0a0a); P.rect(5, 12, 6, 2, 0x1a1a1a); });
makeTile('i_wither_skull', pPlant(P => { P.rect(3, 3, 10, 10, 0x2a2a2a); P.rect(4, 6, 3, 3, 0x0a0a0a); P.rect(9, 6, 3, 3, 0x0a0a0a); P.rect(6, 10, 4, 1, 0x0a0a0a); P.rect(3, 3, 10, 1, 0x3e3e3e); }));
makeTile('i_nether_star', pPlant(P => { const c = [[7, 1], [8, 1], [6, 4], [9, 4], [1, 6], [14, 6], [3, 7], [12, 7], [5, 10], [10, 10], [3, 13], [12, 13]]; P.rect(5, 4, 6, 8, 0xf4f4e8); P.rect(2, 6, 12, 3, 0xf4f4e8); P.rect(7, 1, 2, 4, 0xf4f4e8); P.rect(3, 11, 3, 3, 0xe8e8d0); P.rect(10, 11, 3, 3, 0xe8e8d0); P.rect(7, 6, 2, 3, 0xffffa0); for (const [x, y] of c) P.put(x, y, 0xffffff); }));
makeTile('beacon', P => { P.fill(0xc8f0f0, 4); P.rect(0, 0, 16, 1, 0xe8ffff); P.rect(0, 0, 1, 16, 0xe8ffff); P.rect(15, 0, 1, 16, 0x9ad8d8); P.rect(0, 15, 16, 1, 0x9ad8d8); P.rect(4, 4, 8, 8, 0x3ae8e0); P.rect(5, 5, 6, 6, 0x9afff8); P.rect(7, 7, 2, 2, 0xffffff); });
/* ender chest */
makeTile('ender_chest_top', P => { P.fill(0x16302e, 6); P.speck(0x0e2220, 0.2, 4); for (let i = 0; i < 16; i++) { P.put(i, 0, 0x0a1414); P.put(0, i, 0x0a1414); P.put(i, 15, 0x0a1414); P.put(15, i, 0x0a1414); } });
makeTile('ender_chest_side', P => { P.fill(0x16302e, 6); P.speck(0x0e2220, 0.2, 4); for (let i = 0; i < 16; i++) { P.put(i, 0, 0x0a1414); P.put(0, i, 0x0a1414); P.put(i, 15, 0x0a1414); P.put(15, i, 0x0a1414); } for (let x = 1; x < 15; x++) P.put(x, 5, 0x0a1414); });
makeTile('ender_chest_front', P => { P.fill(0x16302e, 6); P.speck(0x0e2220, 0.2, 4); for (let i = 0; i < 16; i++) { P.put(i, 0, 0x0a1414); P.put(0, i, 0x0a1414); P.put(i, 15, 0x0a1414); P.put(15, i, 0x0a1414); } for (let x = 1; x < 15; x++) P.put(x, 5, 0x0a1414); P.rect(6, 3, 4, 5, 0x2a8a6a); P.rect(7, 4, 2, 3, 0x7affc8); P.put(7, 5, 0x0a3a2a); });
/* shulker box */
const SHULKER_COLORS = { white: 0xe8e8e8, red: 0xb83a3a, yellow: 0xe8c83a, blue: 0x3a5ab8, green: 0x4a8a2a, black: 0x2a2a2e, orange: 0xe07a2a };
for (const [k, c] of Object.entries(SHULKER_COLORS)) {
  const dk = shadeC(rgb(c), 0.65), lt = shadeC(rgb(c), 1.25);
  makeTile('shulker_top_' + k, P => { P.fill(c, 6); P.rect(0, 0, 16, 1, dk); P.rect(0, 0, 1, 16, dk); P.rect(15, 0, 1, 16, dk); P.rect(0, 15, 16, 1, dk); P.rect(5, 5, 6, 6, dk); });
  makeTile('shulker_side_' + k, P => { P.fill(c, 6); P.rect(0, 0, 16, 1, dk); P.rect(0, 15, 16, 1, dk); P.rect(0, 0, 1, 16, dk); P.rect(15, 0, 1, 16, dk); P.rect(0, 9, 16, 2, dk); P.rect(0, 8, 16, 1, lt); });
}
makeTile('shulker_top', P => { P.fill(0x8a5a9a, 6); P.speck(0x7a4a8a, 0.2, 4); P.rect(0, 0, 16, 1, 0x5a3a6a); P.rect(0, 0, 1, 16, 0x5a3a6a); P.rect(15, 0, 1, 16, 0x5a3a6a); P.rect(0, 15, 16, 1, 0x5a3a6a); P.rect(5, 5, 6, 6, 0x6a3a7a); });
makeTile('shulker_side', P => { P.fill(0x8a5a9a, 6); P.speck(0x7a4a8a, 0.2, 4); P.rect(0, 0, 16, 1, 0x5a3a6a); P.rect(0, 15, 16, 1, 0x5a3a6a); P.rect(0, 0, 1, 16, 0x5a3a6a); P.rect(15, 0, 1, 16, 0x5a3a6a); P.rect(0, 9, 16, 2, 0x5a3a6a); P.rect(0, 8, 16, 1, 0xa87ab8); });
/* dog bed */
makeTile('dog_bed_top', P => { P.fill(0xb83a3a, 6); P.rect(0, 0, 16, 2, 0x8a6a3a); P.rect(0, 14, 16, 2, 0x8a6a3a); P.rect(0, 0, 2, 16, 0x8a6a3a); P.rect(14, 0, 2, 16, 0x8a6a3a); P.rect(4, 4, 8, 8, 0xd85a5a, 4); });
makeTile('dog_bed_side', P => { pPlanks(0x8a6a3a)(P); P.rect(0, 10, 16, 3, 0xb83a3a); });
makeTile('i_dog_bed', pPlant(P => { P.rect(1, 9, 14, 5, 0x8a6a3a); P.rect(2, 8, 12, 3, 0xb83a3a); P.rect(4, 8, 8, 1, 0xd85a5a); P.rect(1, 13, 14, 1, 0x5a4020); }));
/* fish and the fishing rod */
const pFish = (body, belly, fin) => pPlant(P => { P.rect(3, 6, 8, 4, body); P.rect(4, 9, 6, 1, belly); P.rect(11, 5, 2, 2, fin); P.rect(11, 9, 2, 2, fin); P.rect(12, 7, 2, 2, fin); P.put(4, 7, 0x111111); P.rect(6, 5, 3, 1, fin); });
makeTile('i_cod', pFish(0xb8a07a, 0xe0d0b0, 0x8a7a5a));
makeTile('i_cooked_cod', pFish(0xd8b88a, 0xf0e0c0, 0xa88a5a));
makeTile('i_salmon', pFish(0xc84a3a, 0xe8a090, 0x7a3a2a));
makeTile('i_cooked_salmon', pFish(0xd8803a, 0xf0b890, 0x9a5a2a));
makeTile('i_fishing_rod', pPlant(P => { P.line(2, 14, 13, 2, 0x8a6a3a); P.line(3, 14, 14, 2, 0x6a4a24); P.line(13, 3, 13, 12, 0xdddddd); P.rect(12, 12, 3, 2, 0xc83a3a); }));
/* drops of the new mobs */
makeTile('i_ink_sac', pBlob(0x1a1a2a, 4.5, 0x3a3a5a));
makeTile('i_glow_ink_sac', pBlob(0x2ab8a8, 4.5, 0x8afff0));
makeTile('i_rabbit', pBlob(0xe0a0a0, 4.5, 0xffffff));
makeTile('i_cooked_rabbit', pBlob(0xb8703a, 4.5, 0xe0a070));
makeTile('i_slime_ball', pBlob(0x7ad84a, 4, 0xc8ffa0));
makeTile('i_phantom_membrane', pPlant(P => { P.rect(3, 4, 10, 8, 0xc8c0a8); P.rect(4, 5, 8, 6, 0xe0d8c0); P.line(3, 4, 12, 11, 0xa8a088); }));

/* ---------- the new biomes' blocks ---------- */
makeTile('mycelium_top', P => { P.fill(0x7a6a7e, 12); P.speck(0x9a8aa0, 0.2, 8); P.speck(0x5e4e62, 0.15, 6); });
makeTile('mycelium_side', pTopBand(pDirt, 0x7a6a7e, 3));
makeTile('mushroom_red', P => { P.fill(0xc0201c, 8); for (const [x, y, r] of [[4, 4, 2], [11, 3, 1.6], [9, 10, 2.2], [3, 12, 1.4], [14, 13, 1.2]]) P.disc(x, y, r, 0xf0ece0, 4); });
makeTile('mushroom_brown', P => { P.fill(0x95704e, 8); P.speck(0x82603f, 0.2, 6); });
makeTile('mushroom_stem', P => { P.fill(0xe6dccb, 6); P.speck(0xd2c8b4, 0.18, 4); });
makeTile('red_sand', P => { P.fill(0xbe6621, 8); P.speck(0xa85618, 0.2, 5); });
for (const [k, c] of [['white', 0xd1b2a1], ['orange', 0xa25426], ['yellow', 0xba8523], ['red', 0x8f3d2e], ['brown', 0x4d3324], ['light_gray', 0x876b62]]) makeTile('tc_' + k, P => { P.fill(c, 6); P.speck(shadeC(rgb(c), 0.9), 0.12, 4); });
makeTile('packed_ice', P => { P.fill(0x8db4f0, 5); for (let i = 0; i < 4; i++) { const x = P.rng() * 12 | 0, y = P.rng() * 12 | 0; P.line(x, y, x + 3, y + 2, 0xb8d4fa); } });
makeTile('blue_ice', P => { P.fill(0x74a8f6, 5); for (let i = 0; i < 4; i++) { const x = P.rng() * 12 | 0, y = P.rng() * 12 | 0; P.line(x, y, x + 2, y + 3, 0xa8ccff); } });
makeTile('blue_orchid', pFlower(0x2aa8e8, 0x1a78b8));
makeTile('allium', pFlower(0xb860e0, 0x8a3ab8));
makeTile('tulip_red', pFlower(0xe02a1a, 0x9a1a10));
makeTile('tulip_orange', pFlower(0xf07a1a, 0xb8501a));
makeTile('tulip_pink', pFlower(0xf0a0c8, 0xc87098));
makeTile('tulip_white', pFlower(0xf4f4f0, 0xc8c8c0));
makeTile('oxeye_daisy', pFlower(0xf4f4ec, 0xe8c020));
makeTile('cornflower', pFlower(0x4a6ae8, 0x2a3ab8));
makeTile('lily_of_the_valley', pFlower(0xffffff, 0xe0e0e0));
makeTile('sunflower', pPlant(P => { P.line(8, 15, 8, 7, 0x3f8f2f); P.pts([[6, 12], [7, 12], [9, 11], [10, 10]], 0x4fa83a); P.disc(8, 5, 4.4, 0xf8d020); P.disc(8, 5, 2, 0x6a4a1a); }));
makeTile('lily_pad', pPlant(P => { P.disc(8, 8, 7, 0x3a8a2a, 12); P.line(8, 8, 8, 1, 0x2a6a1a); for (let y = 0; y < 8; y++) P.erase(8, y), P.erase(9, y); P.line(8, 8, 3, 3, 0x2a6a1a); P.line(8, 8, 13, 12, 0x2a6a1a); }));
makeTile('i_lily_pad', pPlant(P => { P.disc(8, 8, 6.5, 0x3a8a2a, 12); for (let y = 2; y < 8; y++) P.erase(8, y); P.line(8, 8, 4, 12, 0x2a6a1a); }));
for (const [k, c] of [['tube', 0x3050d8], ['brain', 0xd05aa0], ['bubble', 0xa020a8], ['fire', 0xc82a30], ['horn', 0xd8c840]]) makeTile('coral_' + k, P => { P.fill(c, 14); P.speck(shadeC(rgb(c), 1.3), 0.2, 8); P.speck(shadeC(rgb(c), 0.7), 0.15, 6); });
makeTile('moss', P => { P.fill(0x5a7a2a, 12); P.speck(0x6e9432, 0.25, 8); P.speck(0x4a6a20, 0.15, 6); });
makeTile('azalea', pPlant(P => { P.line(8, 15, 8, 10, 0x6a4a2a); P.disc(8, 7, 6, 0x5e8a2a, 14); P.speck(0x4a7020, 0.1, 6); }));
makeTile('flowering_azalea', pPlant(P => { P.line(8, 15, 8, 10, 0x6a4a2a); P.disc(8, 7, 6, 0x5e8a2a, 14); for (let i = 0; i < 7; i++) P.put(3 + P.rng() * 10, 3 + P.rng() * 8, 0xd85ab8); }));
makeTile('cave_vines', pPlant(P => { for (const x of [5, 10]) { P.line(x, 0, x + 1, 15, 0x4a7a2a); P.disc(x + 1, 5 + (x & 3), 1.4, 0xf8a830); P.disc(x, 12, 1.3, 0xf8a830); } }));
makeTile('i_glow_berries', pBlob(0xf8a830, 3.5, 0xffe070));
makeTile('dripstone', P => { P.fill(0x86685a, 8); for (let x = 0; x < 16; x += 3) P.line(x, 0, x, 15, 0x745648); });
makeTile('pointed_dripstone', pPlant(P => { for (let y = 0; y < 16; y++) { const w = Math.max(0, 3 - (y / 5 | 0)); P.rect(8 - w, y, w * 2 + 1, 1, 0x86685a, 6); } }));
makeTile('sculk', P => { P.fill(0x0a2030, 6); P.speck(0x0e3a4a, 0.25, 6); for (let i = 0; i < 6; i++) P.put(P.rng() * 16, P.rng() * 16, 0x2ad8e8); });
makeTile('sculk_sensor_top', P => { P.fill(0x0a2a38, 6); for (const x of [3, 7, 11]) P.rect(x, 3, 2, 10, 0x2ad8e8, 20); });
makeTile('sculk_sensor_side', P => { P.fill(0x0a2030, 6); P.rect(0, 0, 16, 4, 0x1a5a6a, 8); P.speck(0x2ad8e8, 0.05, 4); });

/* ---------- bees' homes and honey ---------- */
makeTile('nest_top', P => { P.fill(0xd8b040, 8); for (let y = 2; y < 16; y += 4) P.rect(0, y, 16, 1, 0xa87a20); P.disc(8, 8, 3, 0xe8c860, 6); });
makeTile('nest_side', P => { P.fill(0xd8b040, 8); for (let y = 3; y < 16; y += 4) P.rect(0, y, 16, 1, 0xa87a20); });
makeTile('nest_front', P => { P.fill(0xd8b040, 8); for (let y = 3; y < 16; y += 4) P.rect(0, y, 16, 1, 0xa87a20); P.rect(5, 6, 6, 4, 0x3a2410); });
makeTile('nest_front_full', P => { P.fill(0xd8b040, 8); for (let y = 3; y < 16; y += 4) P.rect(0, y, 16, 1, 0xa87a20); P.rect(5, 6, 6, 4, 0x3a2410); P.rect(4, 10, 8, 2, 0xf8a820); P.rect(6, 12, 2, 3, 0xf8a820); P.rect(10, 12, 1, 2, 0xf8a820); });
makeTile('hive_top', P => { pPlanks(0xb88a4a)(P); P.rect(0, 0, 16, 2, 0x8a6030); P.rect(0, 14, 16, 2, 0x8a6030); });
makeTile('hive_side', P => { pPlanks(0xc89a5a)(P); P.rect(0, 0, 16, 2, 0x8a6030); P.rect(0, 14, 16, 2, 0x8a6030); });
makeTile('hive_front', P => { pPlanks(0xc89a5a)(P); P.rect(0, 0, 16, 2, 0x8a6030); P.rect(0, 14, 16, 2, 0x8a6030); P.rect(5, 7, 6, 3, 0x3a2410); });
makeTile('hive_front_full', P => { pPlanks(0xc89a5a)(P); P.rect(0, 0, 16, 2, 0x8a6030); P.rect(0, 14, 16, 2, 0x8a6030); P.rect(5, 7, 6, 3, 0x3a2410); P.rect(4, 10, 8, 2, 0xf8a820); P.rect(6, 12, 2, 2, 0xf8a820); });
makeTile('honey_block', P => { P.fill(0xf8b830, 6); P.rect(2, 2, 12, 12, 0xfccc50, 5); P.rect(4, 4, 8, 8, 0xf8b830, 4); });
makeTile('honeycomb_block', P => { P.fill(0xe8a020, 8); for (let y = 0; y < 16; y += 4) for (let x = (y & 4) ? 2 : 0; x < 16; x += 4) P.rect(x, y, 3, 3, 0xf8c040, 6); });
makeTile('i_honeycomb', pPlant(P => { for (const [x, y] of [[4, 5], [9, 5], [6, 9], [11, 9], [4, 13]]) { P.rect(x - 2, y - 2, 4, 4, 0xe8a020); P.rect(x - 1, y - 1, 2, 2, 0xf8c850); } }));
makeTile('i_experience_bottle', pPlant(P => { P.rect(7, 2, 2, 3, 0x9adf6a); P.rect(4, 5, 8, 9, 0x3ab83a); P.rect(5, 6, 6, 7, 0x7aff5a); P.rect(6, 8, 2, 2, 0xeaffc0); P.rect(9, 10, 1, 2, 0xeaffc0); P.rect(6, 1, 4, 1, 0x8a6030); }));
makeTile('i_glass_bottle', pPlant(P => { P.rect(7, 2, 2, 3, 0xc8e0f0); P.rect(4, 5, 8, 9, 0xd8ecf8); P.rect(5, 6, 6, 7, 0xeaf6ff); P.rect(6, 1, 4, 1, 0x8a6030); }));
makeTile('i_honey_bottle', pPlant(P => { P.rect(7, 2, 2, 3, 0xc8e0f0); P.rect(4, 5, 8, 9, 0xd8ecf8); P.rect(5, 7, 6, 6, 0xf8b030); P.rect(6, 1, 4, 1, 0x8a6030); }));
makeTile('i_shears', pPlant(P => { P.line(3, 3, 10, 10, 0xd8d8d8); P.line(4, 3, 11, 10, 0xb0b0b0); P.line(12, 3, 5, 10, 0xd8d8d8); P.line(12, 4, 6, 10, 0xb0b0b0); P.disc(4, 12, 2, 0x7a5a32); P.disc(12, 12, 2, 0x7a5a32); }));
makeTile('campfire_top', P => { P.clear(); P.rect(0, 3, 16, 3, 0x6b4a28); P.rect(0, 10, 16, 3, 0x6b4a28); P.rect(3, 0, 3, 16, 0x5a3e20); P.rect(10, 0, 3, 16, 0x5a3e20); P.disc(8, 8, 3, 0xffa020); P.disc(8, 8, 1.5, 0xfff060); });
makeTile('campfire_side', P => { P.clear(); P.rect(0, 12, 16, 4, 0x6b4a28); P.rect(0, 12, 16, 1, 0x8a6a3a); for (let x = 3; x < 13; x++) { const h = 3 + ((x * 7) % 5); P.rect(x, 12 - h, 1, h, x % 2 ? 0xffa020 : 0xffd040); } });
makeTile('i_campfire', pPlant(P => { P.rect(1, 12, 14, 3, 0x6b4a28); P.line(2, 14, 13, 10, 0x5a3e20); P.line(2, 10, 13, 14, 0x5a3e20); for (let x = 5; x < 11; x++) P.rect(x, 4 + ((x * 3) % 4), 1, 6, x % 2 ? 0xffa020 : 0xffd040); }));
/* ---------- the animals' things ---------- */
makeTile('i_bowl', pPlant(P => { for (let y = 8; y < 13; y++) { const w = 6 - (y - 8); P.rect(8 - w, y, w * 2, 1, 0x8a5a2a); } P.rect(2, 7, 12, 1, 0xa87038); }));
makeTile('i_mushroom_stew', pPlant(P => { for (let y = 8; y < 13; y++) { const w = 6 - (y - 8); P.rect(8 - w, y, w * 2, 1, 0x8a5a2a); } P.rect(3, 6, 10, 2, 0xc89a6a); P.pts([[5, 6], [9, 7], [11, 6]], 0xc8221c); }));
makeTile('i_bucket_of_cod', pBucket(0x3a6ad8)); makeTile('i_bucket_of_salmon', pBucket(0x3a6ad8)); makeTile('i_bucket_of_tropical_fish', pBucket(0x3a6ad8)); makeTile('i_bucket_of_axolotl', pBucket(0x3a6ad8));
makeTile('i_armadillo_scute', pPlant(P => { P.disc(8, 9, 5, 0xa86a5a, 6); P.rect(4, 8, 8, 1, 0xc88a7a); P.rect(5, 11, 6, 1, 0x8a5a4a); }));
makeTile('i_wolf_armor', pPlant(P => { P.rect(3, 5, 10, 6, 0xa86a5a); P.rect(4, 6, 8, 4, 0xc88a7a); P.rect(2, 11, 3, 3, 0x8a5a4a); P.rect(11, 11, 3, 3, 0x8a5a4a); }));
makeTile('i_totem_of_undying', pPlant(P => { P.rect(5, 2, 6, 5, 0xf0d040); P.rect(6, 3, 1, 1, 0x2a8a3a); P.rect(9, 3, 1, 1, 0x2a8a3a); P.rect(4, 7, 8, 5, 0xe8c030); P.rect(2, 8, 2, 3, 0xe8c030); P.rect(12, 8, 2, 3, 0xe8c030); P.rect(6, 12, 4, 3, 0xd8a820); P.rect(7, 9, 2, 1, 0x2a8a3a); }));
makeTile('i_snowball', pBlob(0xf4f8fc, 4, 0xd8e4f0));
makeTile('torchflower', pPlant(P => { P.line(8, 15, 8, 8, 0x4a8a2a); P.rect(6, 4, 5, 4, 0xf08a1a); P.rect(7, 2, 3, 2, 0xffc040); P.pts([[5, 5], [11, 5]], 0xd86a10); }));
makeTile('pitcher_plant', pPlant(P => { P.line(8, 15, 8, 6, 0x4a8a6a); P.rect(5, 2, 7, 7, 0x4a7ab8); P.rect(6, 1, 5, 2, 0x8ab0e8); P.pts([[4, 9], [12, 9], [5, 11], [11, 11]], 0x4a8a6a); }));
makeTile('froglight', P => { P.fill(0xf8e8a0, 6); P.rect(1, 1, 14, 14, 0xf8d878, 6); P.rect(3, 3, 10, 10, 0xfff0b8, 5); });
makeTile('i_breeze_rod', pPlant(P => { for (let i = 0; i < 11; i++) { P.put(3 + i, 13 - i, 0x8ac8e8); P.put(4 + i, 13 - i, 0x5a98c8); } P.pts([[5, 9], [9, 5], [12, 2]], 0xd8f0ff); }));
makeTile('i_wind_charge', pPlant(P => { P.disc(8, 8, 5, 0xc8e8f8, 8); P.disc(8, 8, 3, 0x8ac8e8); P.line(4, 8, 12, 8, 0xffffff); P.line(8, 4, 8, 12, 0xffffff); }));
/* the pale garden */
makeTile('log_pale_oak', pLogSide(0x6a625a, 0x524a44));
makeTile('log_pale_oak_top', pLogTop(0x524a44, 0xe8e0d8, 0xc8c0b8));
makeTile('leaves_pale_oak', pLeaves(0x9aa094));
makeTile('planks_pale_oak', pPlanks(0xe8e0d8));
makeTile('pale_moss', P => { P.fill(0x9aa094, 10); P.speck(0xb8bcb0, 0.2, 6); P.speck(0x7a8074, 0.15, 6); });
makeTile('creaking_heart', P => { pLogSide(0x6a625a, 0x524a44)(P); P.rect(4, 4, 8, 8, 0x3a2a1a); P.rect(5, 6, 2, 3, 0xff8a1a); P.rect(9, 6, 2, 3, 0xff8a1a); P.rect(6, 7, 1, 1, 0xffd060); P.rect(10, 7, 1, 1, 0xffd060); });
makeTile('turtle_egg', P => { P.fill(0xe8e4c8, 8); P.speck(0x8ab86a, 0.18, 6); });
makeTile('i_turtle_egg', pPlant(P => { P.disc(6, 10, 3, 0xe8e4c8); P.disc(11, 9, 2.6, 0xe8e4c8); P.pts([[5, 9], [7, 11], [11, 8], [10, 10]], 0x8ab86a); }));
makeTile('i_turtle_scute', pPlant(P => { P.disc(8, 8, 5, 0x4a9a3a, 8); P.line(4, 8, 12, 8, 0x3a7a2a); P.line(8, 4, 8, 12, 0x3a7a2a); }));
makeTile('i_turtle_helmet', pArmor('helmet', 0x4a9a3a));
makeTile('i_acacia_slab', pPlant(P => { P.rect(1, 8, 14, 6, 0xa85a32); P.rect(1, 8, 14, 1, 0xc87a52); P.rect(1, 13, 14, 1, 0x6a3a1e); }));
makeTile('i_jungle_slab', pPlant(P => { P.rect(1, 8, 14, 6, 0xa8744a); P.rect(1, 8, 14, 1, 0xc8946a); P.rect(1, 13, 14, 1, 0x6a4a2a); }));
/* villager work blocks */
makeTile('composter_side', P => { pPlanks(0x8a6a3a)(P); for (let x = 0; x < 16; x += 5) P.rect(x, 0, 1, 16, 0x5a3c1c); });
makeTile('composter_top', P => { P.fill(0x5a3c1c, 6); P.rect(2, 2, 12, 12, 0x6a5a2a, 10); P.speck(0x4a7a2a, 0.3, 8); });
makeTile('lectern_side', P => { pPlanks(0xa8834f)(P); P.rect(5, 0, 6, 16, 0x8a6a3a, 6); });
makeTile('lectern_top', P => { pPlanks(0xa8834f)(P); P.rect(3, 3, 10, 10, 0xe8e0c8); P.rect(7, 3, 2, 10, 0x7a5a32); for (let y = 5; y < 12; y += 2) { P.rect(4, y, 2, 1, 0x9a9a9a); P.rect(10, y, 2, 1, 0x9a9a9a); } });
makeTile('smoker_front', P => { P.fill(0x5a5a5a, 8); P.rect(0, 0, 16, 4, 0x6a4a2a, 6); P.rect(3, 8, 10, 6, 0x1a1a1a); P.rect(5, 10, 6, 3, 0xff8a2a); });
makeTile('smoker_side', P => { P.fill(0x5a5a5a, 8); P.rect(0, 0, 16, 4, 0x6a4a2a, 6); P.speck(0x4a4a4a, 0.2, 4); });
makeTile('blast_front', P => { P.fill(0x6a6a70, 6); P.rect(0, 0, 16, 2, 0x3a3a3e); P.rect(3, 7, 10, 7, 0x1a1a1a); P.rect(4, 9, 8, 1, 0x8a8a90); P.rect(4, 11, 8, 1, 0x8a8a90); });
makeTile('blast_side', P => { P.fill(0x6a6a70, 6); P.rect(0, 0, 16, 2, 0x3a3a3e); P.rect(0, 7, 16, 1, 0x4a4a50); });
makeTile('grindstone', P => { P.fill(0x8a8a8a, 8); P.disc(7.5, 7.5, 6, 0x9a9a9a, 6); P.disc(7.5, 7.5, 2, 0x5a3c1c); });
makeTile('fletching_side', P => { pPlanks(0xc8b48a)(P); P.rect(3, 4, 10, 8, 0xe8e0c8); P.line(4, 11, 11, 5, 0x7a5a32); P.rect(10, 4, 2, 2, 0xeeeeee); });
makeTile('fletching_top', P => { pPlanks(0xc8b48a)(P); P.rect(2, 2, 12, 12, 0xd8c8a0, 6); });
/* beds that know which way they face: the pillow sits at the head end, the rails run along the bed */
const BED_RED = 0xb02626, BED_RAIL = 0x7a5a32;
const pBedTop = (axis, pillowAt) => P => {
  P.fill(BED_RED, 8); P.speck(0x8a1a1a, 0.2, 5);
  for (let i = 0; i < 16; i++) { if (axis === 'z') { P.put(0, i, BED_RAIL); P.put(15, i, BED_RAIL); } else { P.put(i, 0, BED_RAIL); P.put(i, 15, BED_RAIL); } }
  if (pillowAt === 'top') P.rect(2, 1, 12, 7, 0xeeeeee, 4);
  if (pillowAt === 'bottom') P.rect(2, 8, 12, 7, 0xeeeeee, 4);
  if (pillowAt === 'left') P.rect(1, 2, 7, 12, 0xeeeeee, 4);
  if (pillowAt === 'right') P.rect(8, 2, 7, 12, 0xeeeeee, 4);
  if (!pillowAt) { if (axis === 'z') P.rect(1, 0, 14, 3, 0xd84a4a, 4); else P.rect(0, 1, 3, 14, 0xd84a4a, 4); }
};
makeTile('bed_foot_top_z', pBedTop('z')); makeTile('bed_foot_top_x', pBedTop('x'));
makeTile('bed_head_top_n', pBedTop('z', 'top')); makeTile('bed_head_top_s', pBedTop('z', 'bottom'));
makeTile('bed_head_top_w', pBedTop('x', 'left')); makeTile('bed_head_top_e', pBedTop('x', 'right'));
DEFS[0] = { id: 0, key: 'air', name: 'Air', isBlock: true, solid: false, opaque: false, hardness: 0, faces: [0, 0, 0, 0, 0, 0], color: [255, 255, 255] };
ID.air = 0;

/* ================= building blocks round: stones, colours, copper, amethyst, the sea... ================= */
const pNoise = (base, a, b) => P => { P.fill(base, 9); P.speck(a, 0.22, 6); if (b) P.speck(b, 0.12, 6); };
const pPolished = base => P => { const c = rgb(base); P.fill(base, 4); P.rect(0, 0, 16, 1, shadeC(c, 1.15)); P.rect(0, 0, 1, 16, shadeC(c, 1.15)); P.rect(0, 15, 16, 1, shadeC(c, 0.78)); P.rect(15, 0, 1, 16, shadeC(c, 0.78)); P.speck(shadeC(c, 0.92), 0.08, 3); };
const pPillarSide = base => P => { const c = rgb(base); P.fill(base, 4); for (let y = 0; y < 16; y++) { P.put(0, y, shadeC(c, 1.15)); P.put(15, y, shadeC(c, 0.8)); P.put(5, y, shadeC(c, 0.93)); P.put(10, y, shadeC(c, 0.93)); } };
const pChiseled = (base, mark) => P => { pPolished(base)(P); P.rect(3, 3, 10, 10, shadeC(rgb(base), 0.85)); P.rect(5, 5, 6, 6, mark); P.rect(7, 7, 2, 2, shadeC(rgb(base), 1.1)); };
const pCracked = (brick, mortar) => P => { pBricks(brick, mortar, 8, 4)(P); P.line(3, 1, 7, 9, shadeC(rgb(brick), 0.55)); P.line(7, 9, 12, 14, shadeC(rgb(brick), 0.55)); };
const pMossy = (brick, mortar) => P => { pBricks(brick, mortar, 8, 4)(P); for (let i = 0; i < 5; i++) P.disc(P.rng() * 16, P.rng() * 16, 1.5, 0x4d7a32, 12); };
const stoneTiles = [
  ['granite', pNoise(0x9a6a56, 0x7a4a3a, 0xc08a76)], ['polished_granite', pPolished(0x9a6a56)],
  ['diorite', pNoise(0xc0c0c0, 0x8a8a8a, 0xeaeaea)], ['polished_diorite', pPolished(0xc8c8c8)],
  ['andesite', pNoise(0x888888, 0x6a6a6a, 0xa0a0a0)], ['polished_andesite', pPolished(0x8a8c8c)],
  ['tuff', pNoise(0x6a6a5e, 0x545448, 0x84847a)], ['polished_tuff', pPolished(0x6a6c62)], ['tuff_bricks', pBricks(0x6a6c62, 0x4a4a42, 8, 4)],
  ['calcite', pNoise(0xdcdcd8, 0xc8c8c4, 0xf0f0ec)], ['smooth_stone', pPolished(0xa0a0a0)],
  ['chiseled_stone_bricks', pChiseled(0x7a7a7a, 0x5a5a5a)], ['cracked_stone_bricks', pCracked(0x7a7a7a, 0x5a5a5a)], ['mossy_stone_bricks', pMossy(0x7a7a7a, 0x5a5a5a)],
  ['polished_deepslate', pPolished(0x48484c)], ['deepslate_bricks', pBricks(0x48484c, 0x2a2a2e, 8, 4)], ['deepslate_tiles', pBricks(0x3a3a3e, 0x222226, 4, 4)], ['chiseled_deepslate', pChiseled(0x48484c, 0x2a2a2e)],
  ['polished_blackstone', pPolished(0x3a3640)], ['polished_blackstone_bricks', pBricks(0x3a3640, 0x221e26, 8, 4)], ['gilded_blackstone', P => { pNoise(0x2e2a32, 0x1e1a22)(P); P.speck(0xf5cc2e, 0.12, 20); }],
  ['smooth_basalt', pNoise(0x4a4a50, 0x3a3a40)], ['mud', pNoise(0x3e3a3c, 0x2e2a2c, 0x4e4a4c)], ['packed_mud', pNoise(0x8e6a50, 0x6e5040)], ['mud_bricks', pBricks(0x8e6a50, 0x6a4e3a, 8, 4)],
  ['red_sandstone', P => { P.fill(0xb85a1e, 5); P.rect(0, 0, 16, 3, 0xc86a2a, 4); P.rect(0, 12, 16, 4, 0xa04a18, 4); }], ['red_sandstone_top', pNoise(0xbc5c20, 0xa84a18)],
  ['smooth_sandstone', pPolished(0xddcf95)], ['cut_sandstone', P => { pPolished(0xd8c98f)(P); P.rect(0, 7, 16, 1, 0xc4b57a); }], ['chiseled_sandstone', pChiseled(0xd8c98f, 0xb8a870)],
  ['end_stone_bricks', pBricks(0xe0e2a8, 0xb8ba88, 8, 4)], ['purpur_block', pBricks(0xa87aa8, 0x8a5a8a, 4, 4)], ['purpur_pillar', pPillarSide(0xa87aa8)],
  ['prismarine', P => { P.fill(0x5aa89a, 14); P.speck(0x6ec8b0, 0.2, 8); P.speck(0x4a8a8a, 0.2, 8); }], ['prismarine_bricks', pBricks(0x6ab8a8, 0x4a8a80, 8, 4)], ['dark_prismarine', pBricks(0x335a4a, 0x22413a, 8, 8)],
  ['sea_lantern', P => { P.fill(0xd0e8e0, 6); P.rect(3, 3, 10, 10, 0xf0fff8); P.rect(0, 7, 16, 2, 0xa8d0c8); P.rect(7, 0, 2, 16, 0xa8d0c8); }],
  ['quartz_bricks', pBricks(0xebe5de, 0xc8c2bb, 8, 4)], ['chiseled_quartz', pChiseled(0xebe5de, 0xc8c2bb)], ['quartz_pillar', pPillarSide(0xebe5de)], ['smooth_quartz', pPolished(0xece6df)],
  ['red_nether_bricks', pBricks(0x5a0a0a, 0x3a0606, 8, 4)], ['cracked_nether_bricks', pCracked(0x3a1a1e, 0x220e12)], ['chiseled_nether_bricks', pChiseled(0x3a1a1e, 0x220e12)],
  ['crying_obsidian', P => { P.fill(0x1a0a2a, 6); P.speck(0x3a1a5a, 0.2, 6); for (let i = 0; i < 6; i++) P.put(P.rng() * 16, P.rng() * 16, 0x9a3aff); }],
  ['soul_soil', pNoise(0x4a3a2e, 0x3a2a22, 0x5a4a3a)], ['bone_block_side', P => { P.fill(0xe6e2ce, 4); for (let y = 2; y < 16; y += 4) P.rect(0, y, 16, 1, 0xc8c4b0); }], ['bone_block_top', P => { P.fill(0xe6e2ce, 4); P.disc(8, 8, 4, 0xd0ccb8); P.disc(8, 8, 2, 0xb8b4a0); }],
  ['dried_kelp_block', P => { P.fill(0x3a4a2a, 8); for (let x = 1; x < 16; x += 3) P.rect(x, 0, 1, 16, 0x2a3a1e); }],
  ['sponge', P => { P.fill(0xc8c040, 10); for (let i = 0; i < 14; i++) P.put(P.rng() * 16, P.rng() * 16, 0x8a8420); }], ['wet_sponge', P => { P.fill(0xa8a030, 10); for (let i = 0; i < 14; i++) P.put(P.rng() * 16, P.rng() * 16, 0x5a6a30); }],
  ['tinted_glass', P => { P.fill(0x2a2430, 4); P.rect(1, 1, 14, 14, 0x3a3440); P.line(3, 3, 6, 6, 0x5a5460); }],
  ['amethyst_block', P => { P.fill(0x8a5ac8, 12); P.speck(0xb48ae8, 0.2, 8); P.speck(0x6a3aa8, 0.2, 8); }], ['budding_amethyst', P => { P.fill(0x7a4ab8, 12); P.speck(0xc8a8f8, 0.15, 6); for (const [x, y] of [[4, 4], [11, 6], [6, 11]]) P.rect(x, y, 2, 2, 0x3a1a6a); }],
  ['amethyst_cluster', pPlant(P => { for (const [x, h] of [[4, 8], [7, 12], [10, 9], [12, 6]]) for (let j = 0; j < h; j++) P.put(x, 15 - j, j > h - 3 ? 0xf0d8ff : 0xa87ae8); })],
  ['copper_ore', P => { pStone(P); for (let i = 0; i < 6; i++) P.disc(P.rng() * 14 + 1, P.rng() * 14 + 1, 1.2, 0xe07a4a); P.speck(0x4aa58a, 0.04, 4); }],
  ['deepslate_copper_ore', P => { P.fill(0x48484c, 8); for (let i = 0; i < 6; i++) P.disc(P.rng() * 14 + 1, P.rng() * 14 + 1, 1.2, 0xe07a4a); }],
  ['iron_bars', P => { P.clear(); for (const x of [1, 5, 9, 13]) P.rect(x, 0, 2, 16, 0x8a8a8a); P.rect(0, 1, 16, 1, 0x6a6a6a); P.rect(0, 14, 16, 1, 0x6a6a6a); }],
  ['chain', P => { P.clear(); for (let y = 0; y < 16; y += 4) { P.rect(6, y, 4, 3, 0x3a3a44); P.rect(7, y + 1, 2, 1, 0x1a1a22); } }],
  ['cobweb', P => { P.clear(); P.line(0, 0, 15, 15, 0xe8e8e8); P.line(15, 0, 0, 15, 0xe8e8e8); P.line(8, 0, 8, 15, 0xd8d8d8); P.line(0, 8, 15, 8, 0xd8d8d8); for (const r of [3, 6]) { P.line(8 - r, 8, 8, 8 - r, 0xd8d8d8); P.line(8, 8 - r, 8 + r, 8, 0xd8d8d8); P.line(8 + r, 8, 8, 8 + r, 0xd8d8d8); P.line(8, 8 + r, 8 - r, 8, 0xd8d8d8); } }],
  ['vine', P => { P.clear(); for (let i = 0; i < 9; i++) { const x = P.rng() * 16 | 0; P.line(x, 0, x + (P.rng() * 4 - 2 | 0), 15, 0x3a7a1e); } P.speck(0x4a9a2a, 0.15, 10); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (P.rng() < 0.45) P.erase(x, y); }],
  ['kelp', pPlant(P => { for (let y = 0; y < 16; y++) { const x = 7 + Math.round(Math.sin(y * 0.7) * 2); P.rect(x, y, 2, 1, 0x4a8a2a); if (y % 4 === 1) P.rect(x + 2, y, 2, 1, 0x5a9a3a); } })],
  ['seagrass', pPlant(P => { for (let i = 0; i < 6; i++) { const x = 2 + i * 2.4 | 0, h = 8 + (P.rng() * 7 | 0); for (let j = 0; j < h; j++) P.put(x + (j > h / 2 ? 1 : 0), 15 - j, 0x3a8a3a); } })],
  ['sea_pickle', pPlant(P => { for (const x of [4, 9]) { P.rect(x, 7, 3, 9, 0x6a8a2a); P.rect(x + 1, 5, 1, 2, 0xc8ff8a); } })],
  ['sweet_berry_bush', pPlant(P => { P.disc(8, 9, 6, 0x2a5a2a, 10); P.speck(0x3a7a3a, 0.2, 6); })],
  ['sweet_berry_bush_ripe', pPlant(P => { P.disc(8, 9, 6, 0x2a5a2a, 10); for (const [x, y] of [[5, 7], [10, 6], [8, 11], [12, 10], [4, 12]]) P.rect(x, y, 2, 2, 0xc8202a); })],
  ['snow_layer', P => { P.fill(0xf2f6fa, 4); }],
  ['soul_torch', P => { P.clear(); P.rect(7, 6, 2, 10, 0x6a4a2a); P.rect(7, 4, 2, 2, 0x5ad8f8); P.rect(7, 3, 2, 1, 0xc8f8ff); }],
  ['soul_lantern', P => { P.clear(); P.rect(5, 7, 6, 9, 0x2e2e34); P.rect(6, 9, 4, 5, 0x5ad8f8); P.rect(7, 10, 2, 3, 0xc8f8ff); P.rect(5, 7, 6, 1, 0x4a4a52); P.rect(5, 15, 6, 1, 0x4a4a52); }],
  ['end_rod', P => { P.clear(); P.rect(7, 2, 2, 14, 0xf4f0ea); P.rect(6, 14, 4, 2, 0xc8b8a8); }],
];
for (const [k, p] of stoneTiles) makeTile(k, p);
for (const [k, c] of [['tube', 0x3050d8], ['brain', 0xd05aa0], ['bubble', 0xa020a8], ['fire', 0xc82a30], ['horn', 0xd8c840]]) {
  makeTile('coral_plant_' + k, pPlant(P => { for (const [x, h] of [[4, 10], [8, 14], [11, 9]]) { P.rect(x, 16 - h, 2, h, c); P.rect(x - 1, 16 - h, 4, 2, shadeC(rgb(c), 1.2)); } }));
  makeTile('coral_fan_' + k, pPlant(P => { for (let a = -3; a <= 3; a++) P.line(8, 15, 8 + a * 2, 6 + Math.abs(a), c); P.disc(8, 9, 4, shadeC(rgb(c), 1.1), 6); }));
}
// copper ages from orange to green
const COPPER = [['', 'Copper', 0xc06a4a], ['exposed_', 'Exposed Copper', 0xa8805e], ['weathered_', 'Weathered Copper', 0x6a9a7a], ['oxidized_', 'Oxidized Copper', 0x4aa58a]];
for (const [p, , c] of COPPER) { makeTile(p + 'copper_block', P => { P.fill(c, 8); P.speck(shadeC(rgb(c), 1.2), 0.15, 6); P.rect(0, 0, 16, 1, shadeC(rgb(c), 1.25)); }); makeTile(p + 'cut_copper', P => { P.fill(c, 6); for (const v of [0, 8]) { P.rect(0, v, 16, 1, shadeC(rgb(c), 0.75)); P.rect(v, 0, 1, 16, shadeC(rgb(c), 0.75)); } }); }
// sixteen colours, like Minecraft
const COLORS16 = [['white', 'White', 0xf9fffe, 0xcfd5d6, 0xd1b2a1], ['orange', 'Orange', 0xf9801d, 0xe06100, 0xa25426], ['magenta', 'Magenta', 0xc74ebd, 0xa9309f, 0x95586c], ['light_blue', 'Light Blue', 0x3ab3da, 0x2389c6, 0x706c8a],
  ['yellow', 'Yellow', 0xfed83d, 0xf0af15, 0xba8523], ['lime', 'Lime', 0x80c71f, 0x5ea818, 0x677535], ['pink', 'Pink', 0xf38baa, 0xd5658e, 0xa14e4e], ['gray', 'Gray', 0x474f52, 0x36393d, 0x392a23],
  ['light_gray', 'Light Gray', 0x9d9d97, 0x7d7d73, 0x876b62], ['cyan', 'Cyan', 0x169c9c, 0x157788, 0x565b5b], ['purple', 'Purple', 0x8932b8, 0x64209c, 0x764656], ['blue', 'Blue', 0x3c44aa, 0x2c2e8f, 0x4a3c5b],
  ['brown', 'Brown', 0x835432, 0x603b1f, 0x4d3324], ['green', 'Green', 0x5e7c16, 0x495b24, 0x4c532a], ['red', 'Red', 0xb02e26, 0x8e2020, 0x8f3d2e], ['black', 'Black', 0x1d1d21, 0x080a0f, 0x251610]];
const OLD_WOOL = ['white', 'red', 'blue', 'green', 'yellow', 'black', 'orange', 'purple'], OLD_TC = ['white', 'orange', 'yellow', 'red', 'brown', 'light_gray'];
for (const [k, , w, cc, tc] of COLORS16) {
  if (!OLD_WOOL.includes(k)) { makeTile('wool_' + k, pWool(w)); makeTile('stained_glass_' + k, P => { P.fill(w, 3); P.rect(1, 1, 14, 14, shadeC(rgb(w), 1.08)); P.line(3, 3, 6, 6, 0xffffff); }); }
  if (!OLD_TC.includes(k)) makeTile('tc_' + k, P => { P.fill(tc, 6); P.speck(shadeC(rgb(tc), 0.9), 0.12, 4); });
  makeTile('concrete_' + k, P => P.fill(cc, 3));
  makeTile('concrete_powder_' + k, P => { P.fill(cc, 14); P.speck(shadeC(rgb(cc), 1.25), 0.3, 8); P.speck(shadeC(rgb(cc), 0.8), 0.2, 6); });
  makeTile('glazed_' + k, P => { P.fill(tc, 4); const hi = shadeC(rgb(w), 1.1), lo = shadeC(rgb(tc), 0.7); P.line(0, 0, 15, 15, hi); P.line(0, 8, 8, 15, lo); P.line(8, 0, 15, 8, lo); P.rect(2, 10, 3, 3, hi); P.rect(11, 2, 3, 3, hi); P.disc(4, 4, 1.5, w); P.disc(12, 12, 1.5, w); });
}
/* icons */
makeTile('i_wall', pPlant(P => { P.rect(1, 4, 5, 11, 0x8a8a8a); P.rect(10, 4, 5, 11, 0x8a8a8a); P.rect(5, 6, 6, 8, 0x7a7a7a); P.rect(1, 4, 5, 1, 0xa8a8a8); P.rect(10, 4, 5, 1, 0xa8a8a8); }));
makeTile('i_chain', P => { P.clear(); for (let i = 0; i < 4; i++) { P.rect(3 + i * 3, 12 - i * 3, 3, 3, 0x3a3a44); P.put(4 + i * 3, 13 - i * 3, 0x1a1a22); } });
makeTile('i_kelp', pPlant(P => { for (let y = 2; y < 16; y++) { const x = 7 + Math.round(Math.sin(y * 0.7) * 2); P.rect(x, y, 2, 1, 0x4a8a2a); } }));
makeTile('i_dried_kelp', pPlant(P => { for (let y = 3; y < 14; y++) P.rect(5, y, 6, 1, y % 2 ? 0x3a4a2a : 0x2a3a1e); }));
makeTile('i_sweet_berries', pPlant(P => { for (const [x, y] of [[5, 8], [9, 6], [8, 10], [11, 10]]) P.disc(x, y, 2, 0xc8202a); P.line(9, 2, 9, 5, 0x3a6a2a); }));
makeTile('i_bone_meal', pBlob(0xf0eee0, 4, 0xd8d4c4));
makeTile('i_water_bottle', pPlant(P => { P.rect(7, 2, 2, 3, 0xc8e0f0); P.rect(4, 5, 8, 9, 0xd8ecf8); P.rect(5, 7, 6, 6, 0x3a6ad8); P.rect(6, 1, 4, 1, 0x8a6030); }));
makeTile('i_raw_copper', pBlob(0xc06a4a, 4.5, 0xe08a5a));
makeTile('i_copper_ingot', pIngot(0xd8784a));
makeTile('i_amethyst_shard', pPlant(P => { P.line(4, 13, 11, 3, 0xb48ae8); P.line(5, 13, 12, 3, 0x8a5ac8); P.line(6, 13, 12, 5, 0x6a3aa8); }));
makeTile('i_prismarine_shard', pPlant(P => { P.line(4, 12, 12, 4, 0x5aa89a); P.line(5, 12, 12, 5, 0x6ec8b0); P.line(4, 11, 11, 4, 0x4a8a8a); }));
makeTile('i_prismarine_crystals', pBlob(0xd0f0e8, 4, 0x8ad8c8));
makeTile('i_soul_torch', P => { P.clear(); P.rect(7, 6, 2, 9, 0x6a4a2a); P.rect(7, 3, 2, 3, 0x5ad8f8); P.rect(7, 2, 2, 1, 0xc8f8ff); });
makeTile('i_soul_lantern', P => { P.clear(); P.rect(5, 5, 6, 9, 0x2e2e34); P.rect(6, 7, 4, 5, 0x5ad8f8); P.rect(7, 2, 2, 3, 0x4a4a52); });
makeTile('i_snow_layer', pPlant(P => { P.rect(1, 12, 14, 3, 0xf2f6fa); P.rect(1, 12, 14, 1, 0xffffff); }));
makeTile('i_sea_pickle', pPlant(P => { P.rect(6, 6, 4, 9, 0x6a8a2a); P.rect(7, 4, 2, 2, 0xc8ff8a); }));
makeTile('i_vine', P => { P.clear(); for (let i = 0; i < 5; i++) { const x = 2 + i * 3; P.line(x, 1, x + 1, 14, 0x3a7a1e); } P.speck(0x4a9a2a, 0.12, 10); });

/* ---------- machines and working blocks ---------- */
makeTile('barrel_side', P => { pPlanks(0x8a6438)(P); P.rect(0, 2, 16, 1, 0x4a4a4a); P.rect(0, 13, 16, 1, 0x4a4a4a); });
makeTile('barrel_top', P => { P.fill(0x8a6438, 8); P.rect(0, 0, 16, 1, 0x4a4a4a); P.rect(0, 15, 16, 1, 0x4a4a4a); P.rect(0, 0, 1, 16, 0x4a4a4a); P.rect(15, 0, 1, 16, 0x4a4a4a); P.rect(6, 6, 4, 4, 0x3a2410); });
makeTile('stonecutter_top', P => { pSmooth(P); P.rect(1, 7, 14, 2, 0x5a5a5a); P.disc(8, 8, 3, 0xd8d8d8); P.disc(8, 8, 1, 0x8a8a8a); });
makeTile('stonecutter_side', P => { pSmooth(P); P.rect(0, 0, 16, 7, 0, 0); P.clear(); P.rect(0, 7, 16, 9, 0x8c8c8c, 5); P.rect(3, 2, 10, 5, 0xd8d8d8); P.rect(4, 3, 8, 3, 0xb0b0b0); });
makeTile('cauldron_side', P => { P.fill(0x3a3a3e, 6); P.rect(0, 0, 16, 2, 0x4a4a50); P.rect(3, 13, 3, 3, 0x2a2a2e); P.rect(10, 13, 3, 3, 0x2a2a2e); });
for (const [k, c] of [['empty', 0x1a1a1e], ['water', 0x2f62d4], ['lava', 0xcf4f12]]) makeTile('cauldron_top_' + k, P => { P.fill(0x3a3a3e, 6); P.rect(2, 2, 12, 12, c, k === 'empty' ? 2 : 12); });
makeTile('brewing_stand', pPlant(P => { P.rect(7, 2, 2, 12, 0xd8c070); P.rect(2, 13, 12, 3, 0x6a6a6a); for (const x of [2, 12]) { P.rect(x, 7, 2, 5, 0xd8ecf8); P.rect(x, 9, 2, 3, 0xc84a8a); } P.rect(6, 1, 4, 2, 0xb8a050); }));
makeTile('jukebox_side', P => { pPlanks(0x7a4a2a)(P); P.rect(0, 0, 16, 2, 0x5a3418); P.rect(0, 14, 16, 2, 0x5a3418); });
makeTile('jukebox_top', P => { P.fill(0x7a4a2a, 6); P.rect(2, 7, 12, 2, 0x1a1a1a); });
makeTile('note_block', P => { pPlanks(0x7a4a2a)(P); P.rect(4, 4, 8, 8, 0x5a3418); P.rect(6, 5, 2, 6, 0x1a1a1a); P.rect(7, 5, 3, 2, 0x1a1a1a); P.disc(6, 11, 1.5, 0x1a1a1a); });
makeTile('hopper_side', P => { P.fill(0x4a4a50, 6); P.rect(0, 0, 16, 3, 0x5a5a60); P.rect(3, 3, 10, 6, 0x3a3a40); P.rect(6, 9, 4, 7, 0x3a3a40); });
makeTile('hopper_top', P => { P.fill(0x4a4a50, 6); P.rect(2, 2, 12, 12, 0x1a1a1e); P.rect(6, 6, 4, 4, 0x3a3a40); });
makeTile('dispenser_front', P => { pSmooth(P); P.disc(8, 8, 3.5, 0x1a1a1a); P.disc(8, 8, 1.6, 0x4a4a4a); });
makeTile('dropper_front', P => { pSmooth(P); P.rect(5, 5, 6, 6, 0x1a1a1a); P.rect(7, 7, 2, 2, 0x3a3a3a); });
makeTile('piston_top', P => { pPlanks(0xa8834f)(P); P.rect(0, 0, 16, 2, 0x8a8a8a); P.rect(0, 14, 16, 2, 0x8a8a8a); P.rect(0, 0, 2, 16, 0x8a8a8a); P.rect(14, 0, 2, 16, 0x8a8a8a); });
makeTile('piston_top_sticky', P => { pPlanks(0xa8834f)(P); P.rect(0, 0, 16, 2, 0x8a8a8a); P.rect(0, 14, 16, 2, 0x8a8a8a); P.rect(0, 0, 2, 16, 0x8a8a8a); P.rect(14, 0, 2, 16, 0x8a8a8a); P.rect(3, 3, 10, 10, 0x6ac84a, 10); });
makeTile('piston_side', P => { P.fill(0x7a7a7a, 8); P.rect(0, 0, 16, 4, 0xa8834f, 6); P.rect(0, 4, 16, 1, 0x5a5a5a); P.rect(6, 5, 4, 11, 0x6a6a6a); });
makeTile('piston_bottom', P => { P.fill(0x7a7a7a, 8); P.rect(2, 2, 12, 12, 0x6a6a6a); });
makeTile('piston_inner', P => { P.fill(0x7a7a7a, 8); P.rect(5, 5, 6, 6, 0xc8a070); });
makeTile('observer_face', P => { P.fill(0x5a5a5a, 6); P.rect(1, 4, 14, 3, 0x2a2a2a); P.rect(3, 9, 4, 3, 0x2a2a2a); P.rect(9, 9, 4, 3, 0x2a2a2a); });
makeTile('observer_back', P => { P.fill(0x5a5a5a, 6); P.rect(6, 6, 4, 4, 0x3a1a1a); });
makeTile('observer_back_on', P => { P.fill(0x5a5a5a, 6); P.rect(6, 6, 4, 4, 0xff2a1a); });
makeTile('observer_side', P => { P.fill(0x5a5a5a, 6); P.rect(0, 7, 16, 2, 0x3a3a3a); P.rect(7, 0, 2, 16, 0x3a3a3a); });
makeTile('daylight_top', P => { P.fill(0xc8c0a0, 6); for (let x = 0; x < 16; x += 4) for (let y = 0; y < 16; y += 4) P.rect(x + 1, y + 1, 2, 2, 0x5a6a8a); });
makeTile('target_side', P => { P.fill(0xe8dcc8, 6); P.disc(8, 8, 7, 0xc82a2a); P.disc(8, 8, 5, 0xe8dcc8); P.disc(8, 8, 3, 0xc82a2a); P.disc(8, 8, 1.2, 0xe8dcc8); });
makeTile('target_top', P => { P.fill(0xd8ccb0, 8); P.speck(0xa8a080, 0.2, 6); });
makeTile('scaffolding_top', P => { P.clear(); P.rect(0, 0, 16, 2, 0xd8b870); P.rect(0, 14, 16, 2, 0xd8b870); P.rect(0, 0, 2, 16, 0xd8b870); P.rect(14, 0, 2, 16, 0xd8b870); P.line(1, 1, 14, 14, 0xc8a860); });
makeTile('scaffolding_side', P => { P.clear(); P.rect(0, 0, 2, 16, 0xd8b870); P.rect(14, 0, 2, 16, 0xd8b870); P.rect(0, 0, 16, 2, 0xd8b870); P.line(2, 14, 13, 2, 0xc8a860); });
makeTile('item_frame', P => { P.clear(); P.rect(0, 0, 16, 16, 0x8a5a2a); P.rect(2, 2, 12, 12, 0xc8a878); });
makeTile('candle', P => { P.clear(); P.rect(6, 6, 4, 10, 0xe8e0c8); P.rect(7, 4, 2, 2, 0x3a3a3a); });
makeTile('candle_lit', P => { P.clear(); P.rect(6, 6, 4, 10, 0xe8e0c8); P.rect(7, 4, 2, 2, 0x3a3a3a); P.rect(7, 1, 2, 3, 0xffc040); });
makeTile('comparator_top', P => { P.fill(0xa8a8a8, 4); P.rect(3, 2, 2, 3, 0x5a0c0c); P.rect(11, 2, 2, 3, 0x5a0c0c); P.rect(7, 11, 2, 3, 0x5a0c0c); P.rect(2, 7, 12, 1, 0x7a1a14); });
makeTile('comparator_top_on', P => { P.fill(0xa8a8a8, 4); P.rect(3, 2, 2, 3, 0xe81e10); P.rect(11, 2, 2, 3, 0xe81e10); P.rect(7, 11, 2, 3, 0xe81e10); P.rect(2, 7, 12, 1, 0xff4a2a); });
makeTile('anchor_side', P => { P.fill(0x1a0a2a, 6); P.speck(0x3a1a5a, 0.2, 6); P.rect(0, 0, 16, 3, 0x2a2a30); });
makeTile('anchor_top', P => { P.fill(0x2a2a30, 6); P.rect(3, 3, 10, 10, 0x1a0a2a); });
makeTile('anchor_top_on', P => { P.fill(0x2a2a30, 6); P.rect(3, 3, 10, 10, 0xff9a2a); P.rect(5, 5, 6, 6, 0xffe060); });
/* item pictures */
makeTile('i_hopper', pPlant(P => { P.rect(1, 2, 14, 5, 0x4a4a50); P.rect(4, 7, 8, 4, 0x3a3a40); P.rect(6, 11, 4, 4, 0x3a3a40); P.rect(2, 3, 12, 2, 0x1a1a1e); }));
makeTile('i_item_frame', P => { P.clear(); P.rect(1, 1, 14, 14, 0x8a5a2a); P.rect(3, 3, 10, 10, 0xc8a878); });
makeTile('i_candle', P => { P.clear(); P.rect(6, 6, 4, 10, 0xe8e0c8); P.rect(7, 3, 2, 3, 0x3a3a3a); });
makeTile('i_brewing_stand', pPlant(P => { P.rect(7, 2, 2, 12, 0xd8c070); P.rect(2, 13, 12, 3, 0x6a6a6a); P.rect(2, 8, 2, 4, 0xc84a8a); P.rect(12, 8, 2, 4, 0x4a8ac8); }));
makeTile('i_saddle', pPlant(P => { P.rect(3, 5, 10, 5, 0x7a4a24); P.rect(4, 4, 8, 2, 0x9a6232); P.rect(2, 9, 12, 2, 0x5a3418); P.rect(4, 11, 1, 3, 0x3a2410); P.rect(11, 11, 1, 3, 0x3a2410); P.rect(3, 13, 3, 2, 0xb0b0b0); P.rect(10, 13, 3, 2, 0xb0b0b0); }));
makeTile('i_comparator', pPlant(P => { P.rect(1, 9, 14, 6, 0xa8a8a8); P.rect(3, 6, 2, 3, 0xe81e10); P.rect(11, 6, 2, 3, 0xe81e10); P.rect(7, 7, 2, 2, 0xe81e10); }));
makeTile('i_scaffolding', pPlant(P => { P.rect(2, 2, 12, 2, 0xd8b870); P.rect(2, 2, 2, 12, 0xd8b870); P.rect(12, 2, 2, 12, 0xd8b870); P.line(4, 13, 12, 4, 0xc8a860); }));
for (const [k, c] of [['nether_wart', 0x9a1a2a], ['sugar', 0xf4f4f4], ['spider_eye', 0x8a1a2a], ['fermented_spider_eye', 0x6a3a4a], ['magma_cream', 0xe8902a], ['rabbit_foot', 0xc8a070]]) makeTile('i_' + k, pBlob(c, 4, shadeC(rgb(c), 1.3)));
makeTile('i_glistering_melon', pPlant(P => { P.rect(3, 5, 10, 8, 0xd83a3a); P.rect(3, 12, 10, 2, 0x5aa83a); P.speck(0xf5cc2e, 0.25, 0); clipToDisc(P, 7); }));
makeTile('i_golden_carrot', pPlant(P => { for (let i = 0; i < 9; i++) P.rect(4 + i, 12 - i, 3, 2, 0xf5cc2e); P.rect(12, 2, 2, 3, 0x5aa83a); }));
for (const [k, c] of [['13', 0xd8c84a], ['cat', 0x5ad84a], ['blocks', 0xd85a3a], ['chirp', 0xc83a3a], ['far', 0x8ad84a], ['mall', 0x8a5ad8], ['stal', 0x3a3a3a], ['pigstep', 0xd88a3a]]) makeTile('i_disc_' + k, pPlant(P => { P.disc(8, 8, 7, 0x1a1a1a); P.disc(8, 8, 3, c); P.disc(8, 8, 1, 0x1a1a1a); P.line(4, 4, 6, 3, 0x3a3a3a); }));
makeTile('i_compass', pPlant(P => { P.disc(8, 8, 6.5, 0x8a8a8a); P.disc(8, 8, 5, 0x3a3a3a); P.line(8, 8, 8, 4, 0xd82a2a); P.line(8, 8, 8, 12, 0xd8d8d8); }));
makeTile('i_clock', pPlant(P => { P.disc(8, 8, 6.5, 0xf5cc2e); P.disc(8, 8, 5, 0x3a6ad8); for (let y = 8; y < 14; y++) for (let x = 3; x < 14; x++) if ((x - 8) * (x - 8) + (y - 8) * (y - 8) <= 25) P.put(x, y, 0x1a2a4a); P.disc(10, 6, 1.5, 0xffe060); }));
makeTile('i_map', pPlant(P => { P.rect(2, 2, 12, 12, 0xe8dcb8); P.rect(4, 4, 4, 3, 0x5aa83a); P.rect(8, 7, 4, 4, 0x3a6ad8); P.rect(5, 9, 2, 3, 0x9a7a4a); }));
makeTile('i_spyglass', pPlant(P => { for (let i = 0; i < 10; i++) { P.rect(3 + i, 12 - i, 2, 2, i < 3 ? 0xb48ae8 : 0xc87a4a); } }));
const POTIONS = [['awkward', 'Awkward', 0x3a5ad8], ['speed', 'Swiftness', 0x7ac8f8], ['jump_boost', 'Leaping', 0x5af83a], ['strength', 'Strength', 0x9a2a2a], ['regeneration', 'Regeneration', 0xd85aa8],
  ['fire_resistance', 'Fire Resistance', 0xe89a3a], ['healing', 'Healing', 0xf83a3a], ['night_vision', 'Night Vision', 0x2a3a9a], ['invisibility', 'Invisibility', 0x8a8aa8], ['poison', 'Poison', 0x4a8a2a],
  ['weakness', 'Weakness', 0x4a4a5a], ['slow_falling', 'Slow Falling', 0xf0e8d8], ['water_breathing', 'Water Breathing', 0x2a6ad8], ['harming', 'Harming', 0x4a0a2a]];
for (const [k, , c] of POTIONS) {
  makeTile('i_potion_' + k, pPlant(P => { P.rect(7, 2, 2, 3, 0xc8e0f0); P.rect(4, 5, 8, 9, 0xd8ecf8); P.rect(5, 7, 6, 6, c); P.rect(6, 1, 4, 1, 0x8a6030); }));
  if (k !== 'awkward') makeTile('i_splash_' + k, pPlant(P => { P.rect(7, 2, 2, 2, 0xc8e0f0); P.disc(8, 9, 5, 0xd8ecf8); P.disc(8, 9, 4, c); P.rect(6, 1, 4, 1, 0x8a6030); }));
}

/* the outer End: chorus plants, end cities, shulkers, elytra */
makeTile('chorus_plant', P => { P.fill(0x5a3a5a, 10); P.speck(0x7a5a7a, 0.2, 8); P.rect(0, 0, 16, 1, 0x3a2a3a); });
makeTile('chorus_flower', P => { P.fill(0xa880a8, 10); P.rect(2, 2, 12, 12, 0xc8a0c8, 8); P.rect(5, 5, 6, 6, 0xe8c8e8); });
makeTile('i_chorus_fruit', pBlob(0x8a5a8a, 4.5, 0xc8a0c8));
makeTile('i_popped_chorus_fruit', pBlob(0xb898b8, 4.5, 0xe8d0e8));
makeTile('i_shulker_shell', pPlant(P => { P.disc(8, 9, 6, 0x8a5a8a); P.rect(2, 9, 12, 5, 0x6a3a6a); P.rect(2, 9, 12, 1, 0xc8a0c8); }));
makeTile('i_elytra', pPlant(P => { for (let i = 0; i < 7; i++) { P.line(7 - i, 2 + i, 7 - i, 13 - (i >> 1), 0x8a8ab0); P.line(8 + i, 2 + i, 8 + i, 13 - (i >> 1), 0x8a8ab0); } P.line(7, 2, 7, 13, 0x5a5a80); P.line(8, 2, 8, 13, 0x5a5a80); }));
makeTile('i_firework_rocket', pPlant(P => { P.rect(6, 4, 4, 9, 0xd83a3a); P.rect(6, 6, 4, 1, 0xf0f0f0); P.rect(6, 10, 4, 1, 0xf0f0f0); P.rect(7, 2, 2, 2, 0x8a8a8a); P.line(8, 13, 8, 15, 0x3a3a3a); }));

/* trial chambers, ocean monuments, ancient cities, archaeology */
makeTile('trial_spawner', P => { P.fill(0x2a3038, 6); for (let i = 1; i < 16; i += 3) { P.rect(i, 0, 1, 16, 0x5a6470); P.rect(0, i, 16, 1, 0x5a6470); } P.rect(5, 5, 6, 6, 0xff9a2a); P.rect(7, 7, 2, 2, 0xffe060); });
makeTile('trial_spawner_done', P => { P.fill(0x2a3038, 6); for (let i = 1; i < 16; i += 3) { P.rect(i, 0, 1, 16, 0x4a5058); P.rect(0, i, 16, 1, 0x4a5058); } P.rect(5, 5, 6, 6, 0x3a3a3a); });
makeTile('vault_side', P => { P.fill(0x3a4048, 6); P.rect(0, 0, 16, 2, 0x5a6470); P.rect(0, 14, 16, 2, 0x5a6470); P.rect(3, 4, 10, 8, 0x1a1e24); P.rect(6, 6, 4, 4, 0x5ad8f8); });
makeTile('vault_open', P => { P.fill(0x3a4048, 6); P.rect(0, 0, 16, 2, 0x5a6470); P.rect(0, 14, 16, 2, 0x5a6470); P.rect(3, 4, 10, 8, 0x1a1e24); });
makeTile('heavy_core', P => { P.fill(0x3a3a40, 4); P.rect(2, 2, 12, 12, 0x5a5a62); P.rect(5, 5, 6, 6, 0x2a2a30); });
makeTile('suspicious_sand', P => { P.fill(0xdccf9e, 8); P.speck(0xc8b98a, 0.2, 5); P.rect(5, 6, 6, 4, 0xb8a878); P.pts([[6, 7], [9, 8]], 0x8a7a5a); });
makeTile('suspicious_gravel', P => { P.fill(0x8a8480, 12); P.speck(0x6a6460, 0.25, 6); P.rect(5, 6, 6, 4, 0x7a6e60); });
makeTile('sniffer_egg', P => { P.fill(0x9a3a2a, 8); P.speck(0x3a8a4a, 0.25, 6); });
makeTile('reinforced_deepslate', P => { P.fill(0x3a3a3e, 6); P.rect(0, 0, 16, 2, 0x5a5048); P.rect(0, 14, 16, 2, 0x5a5048); P.rect(0, 0, 2, 16, 0x5a5048); P.rect(14, 0, 2, 16, 0x5a5048); P.rect(6, 6, 4, 4, 0x1a1a1e); });
makeTile('shrieker_top', P => { P.fill(0x0a2030, 6); P.rect(2, 2, 12, 12, 0xd8d0b8); P.rect(5, 5, 6, 6, 0x1a3a4a); P.rect(7, 7, 2, 2, 0x2ad8e8); });
makeTile('shrieker_side', P => { P.fill(0x0a2030, 6); P.rect(0, 0, 16, 5, 0xd8d0b8); P.speck(0x2ad8e8, 0.05, 4); });
makeTile('i_trial_key', pPlant(P => { P.disc(5, 5, 3, 0xc87a3a); P.disc(5, 5, 1.4, 0x3a3a3a); P.line(7, 7, 13, 13, 0xc87a3a); P.rect(11, 12, 2, 2, 0xc87a3a); P.rect(9, 10, 2, 2, 0xc87a3a); }));
makeTile('i_mace', pPlant(P => { for (let i = 0; i < 9; i++) { P.put(3 + i, 13 - i, 0x8ac8e8); P.put(4 + i, 13 - i, 0x5a98c8); } P.rect(10, 1, 5, 5, 0x5a5a62); P.rect(11, 2, 3, 3, 0x3a3a40); P.pts([[9, 3], [12, 0], [15, 3], [12, 6]], 0x8a8a92); }));
makeTile('i_brush', pPlant(P => { P.line(3, 13, 9, 7, 0x8a6438); P.rect(9, 4, 4, 4, 0xc87a4a); P.line(11, 1, 14, 4, 0xe8dcb8); P.line(12, 1, 15, 4, 0xe8dcb8); }));
makeTile('i_pottery_sherd', pPlant(P => { P.rect(3, 4, 10, 9, 0xa85a3a); P.rect(5, 6, 6, 5, 0x6a3a2a); P.pts([[6, 7], [9, 9], [7, 9]], 0xd88a5a); }));
makeTile('decorated_pot', P => { P.fill(0xa85a3a, 6); P.rect(0, 0, 16, 2, 0x8a4a2a); P.rect(3, 5, 10, 7, 0x6a3a2a); P.pts([[6, 7], [9, 9], [7, 9], [10, 7]], 0xd88a5a); });
makeTile('i_echo_shard', pPlant(P => { P.line(5, 13, 11, 3, 0x0e5a6a); P.line(6, 13, 12, 3, 0x2ad8e8); P.line(7, 13, 12, 5, 0x0e3a4a); }));
makeTile('i_recovery_compass', pPlant(P => { P.disc(8, 8, 6.5, 0x0e3a4a); P.disc(8, 8, 5, 0x1a2a2a); P.line(8, 8, 8, 4, 0x2ad8e8); }));
makeTile('i_enchanted_golden_apple', pPlant(P => { P.disc(8, 9, 5, 0xf5cc2e); P.disc(6, 7, 1.5, 0xfff0a0); P.line(8, 4, 9, 2, 0x6a4a2a); P.speck(0xd88aff, 0.15, 10); clipToDisc(P, 6); }));

/* rails and minecarts */
function pRail(shape, tie, steel, glow) {
  return P => {
    P.clear();
    const ns = shape === 'ns', ew = shape === 'ew';
    if (ns || ew) {
      for (let i = 1; i < 16; i += 3) { if (ns) P.rect(2, i, 12, 2, tie); else P.rect(i, 2, 2, 12, tie); }
      if (ns) { P.rect(3, 0, 2, 16, steel); P.rect(11, 0, 2, 16, steel); } else { P.rect(0, 3, 16, 2, steel); P.rect(0, 11, 16, 2, steel); }
      if (glow) { if (ns) { P.rect(3, 0, 1, 16, glow); P.rect(12, 0, 1, 16, glow); } else { P.rect(0, 3, 16, 1, glow); P.rect(0, 12, 16, 1, glow); } }
      return;
    }
    // a curve joining two sides: ne, nw, se, sw
    const cx = shape.includes('e') ? 16 : 0, cy = shape.includes('n') ? 0 : 16;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if ((d > 2.5 && d < 4.5) || (d > 10.5 && d < 12.5)) P.put(x, y, steel); else if (d > 4.5 && d < 10.5 && ((Math.atan2(y - cy, x - cx) * 6) | 0) % 2 === 0) P.put(x, y, tie);
    }
  };
}
for (const sh of ['ns', 'ew', 'ne', 'nw', 'se', 'sw']) makeTile('rail_' + sh, pRail(sh, 0x7a5a32, 0x9a9a9a));
for (const sh of ['ns', 'ew']) { makeTile('prail_' + sh + '_0', pRail(sh, 0x7a5a32, 0xd8b030, 0x5a0c0c)); makeTile('prail_' + sh + '_1', pRail(sh, 0x7a5a32, 0xf5cc2e, 0xff3a1a)); makeTile('drail_' + sh, pRail(sh, 0x6a6a6a, 0x9a9a9a, 0x8a2a2a)); }
makeTile('i_rail', pRail('ns', 0x7a5a32, 0x9a9a9a));
makeTile('i_powered_rail', pRail('ns', 0x7a5a32, 0xd8b030, 0xff3a1a));
makeTile('i_detector_rail', pRail('ns', 0x6a6a6a, 0x9a9a9a, 0x8a2a2a));
makeTile('i_minecart', pPlant(P => { P.rect(2, 6, 12, 6, 0x6a6a70); P.rect(3, 7, 10, 3, 0x3a3a40); P.disc(5, 13, 1.6, 0x2a2a2a); P.disc(11, 13, 1.6, 0x2a2a2a); }));
makeTile('i_chest_minecart', pPlant(P => { P.rect(2, 7, 12, 5, 0x6a6a70); P.rect(4, 3, 8, 5, 0x9a6a32); P.rect(7, 5, 2, 2, 0x3a3a3a); P.disc(5, 13, 1.6, 0x2a2a2a); P.disc(11, 13, 1.6, 0x2a2a2a); }));

makeTile('soul_fire', pPlant(P => { for (let x = 0; x < 16; x++) { const h = 6 + ((Math.sin(x * 1.7) + 1) * 4 + P.rng() * 3 | 0); for (let j = 0; j < h; j++) { const t = j / h; P.put(x, 15 - j, t < 0.35 ? 0xc8ffff : t < 0.7 ? 0x3ad8e8 : 0x1a7a9a); } } }));

/* spawn eggs: one for every mob (in creative); use one on a spawner to change what it spawns */
const EGG_MOBS = [['zombie', 0x00afaf, 0x799c65], ['skeleton', 0xc1c1c1, 0x494949], ['creeper', 0x0da70b, 0x000000], ['spider', 0x342d27, 0xa80e0e], ['enderman', 0x161616, 0x000000], ['zombified_piglin', 0xea9393, 0x4c7129], ['wither_skeleton', 0x141414, 0x474d4d], ['blaze', 0xf6b201, 0xfff87e], ['ghast', 0xf9f9f9, 0xbcbcbc],
  ['iron_golem', 0xdbcdc1, 0x74a332], ['wolf', 0xd7d3d3, 0xceaf96], ['horse', 0xc09e7d, 0xeee500], ['donkey', 0x534539, 0x867566], ['pillager', 0x532f36, 0x959b9b], ['villager', 0x563c33, 0xbd8b72], ['pig', 0xf0a5a2, 0xdb635f], ['cow', 0x443626, 0xa1a1a1], ['sheep', 0xe7e7e7, 0xffb5b5], ['panda', 0xe7e7e7, 0x1b1b22], ['cat', 0xefc88e, 0x957256], ['chicken', 0xa1a1a1, 0xff0000],
  ['bee', 0xedc343, 0x43241b], ['fox', 0xd5b69f, 0xcc6920], ['rabbit', 0x995f40, 0x734831], ['goat', 0xa5947c, 0x55493e], ['frog', 0xd07444, 0xffc77c], ['turtle', 0xe7e7e7, 0x00afaf], ['llama', 0xc09e7d, 0x995f40], ['camel', 0xfcc369, 0xcb9337], ['polar_bear', 0xf2f2f2, 0x959590], ['mooshroom', 0xa00f10, 0xb7b7b7], ['sniffer', 0x871e09, 0x24a678], ['armadillo', 0xad716d, 0x824848], ['parrot', 0x0da70b, 0xff0000], ['ocelot', 0xefde7d, 0x564434],
  ['squid', 0x223b4d, 0x708899], ['glow_squid', 0x095656, 0x85f1bc], ['dolphin', 0x223b4d, 0xf9f9f9], ['axolotl', 0xfbc1e3, 0xa62d74], ['cod', 0xc1a76a, 0xe5c48b], ['salmon', 0xa00f10, 0x0e8474], ['tropical_fish', 0xef6915, 0xfff9ef], ['slime', 0x51a03e, 0x7ebf6e], ['magma_cube', 0x340000, 0xfcfc00], ['phantom', 0x43518a, 0x88ff00],
  ['trader_llama', 0xeaa430, 0x456296], ['strider', 0x9c3436, 0x4d494d], ['bat', 0x4c3e30, 0x0f0f0f], ['snow_golem', 0xd9f2f2, 0x81a4a4], ['allay', 0x00daff, 0x00ade6], ['silverfish', 0x6e6e6e, 0x303030], ['endermite', 0x161616, 0x6e6e6e], ['guardian', 0x5a8272, 0xf17d30], ['breeze', 0xaf94df, 0x9166df], ['ravager', 0x757470, 0x5b5049], ['vex', 0x7a90a4, 0xe8edf1],
  ['elder_guardian', 0xceccba, 0x747693], ['shulker', 0x946794, 0x4d3852], ['creaking', 0x5f5f5f, 0xfc7812], ['warden', 0x0f4649, 0x39d6e0], ['hoglin', 0xc66e55, 0x5f6464], ['husk', 0x797061, 0xe6cc94], ['stray', 0x617677, 0xdde4e4], ['drowned', 0x8ff1d7, 0x799c65], ['witch', 0x340000, 0x51a03e], ['wandering_trader', 0x456296, 0xeaa430], ['vindicator', 0x959b9b, 0x275e61],
  ['evoker', 0x959b9b, 0x1e1c1a], ['zombie_villager', 0x563c33, 0x799c65], ['piglin_brute', 0x592a10, 0xf9f3a4], ['bogged', 0x8a9a6a, 0x3a4a2a], ['piglin', 0x995f40, 0xf9f3a4], ['mule', 0x1b0200, 0x51331d], ['skeleton_horse', 0x68684f, 0xe5e5d8], ['cave_spider', 0x0c424e, 0xa80e0e]];
for (const [k, base, spots] of EGG_MOBS) makeTile('i_egg_' + k, pPlant(P => {
  for (let y = 1; y < 16; y++) for (let x = 2; x < 14; x++) { const dx = (x - 7.5) / 5.5, dy = (y - 9) / (y < 9 ? 7.5 : 6.5); if (dx * dx + dy * dy <= 1) P.put(x, y, base); }
  for (const [x, y] of [[5, 5], [9, 4], [10, 9], [6, 11], [8, 13], [4, 9], [11, 12]]) if (P.get(x, y)[3]) { P.put(x, y, spots); P.put(x + 1, y, spots); }
  P.put(5, 3, shadeC(rgb(base), 1.3));
}));

/* the animations themselves */
const waveRows = [[2, 3], [5, 9], [8, 1], [11, 6], [14, 11], [0, 12]];
animTile('water', 16, 140, (P, f) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = Math.sin((x + f) * 0.8 + Math.sin((y - f) * 0.5) * 1.5) + Math.sin((y + f * 0.5) * 0.7 - x * 0.3);
    P.put(x, y, v > 1.2 ? [90, 140, 240] : v > 0.2 ? [60, 112, 222] : [47, 98, 212]);
  }
  for (const [y0, x0] of waveRows) { const y = (y0 + f) % 16; for (let k = 0; k < 4; k++) P.put((x0 + k + (f >> 1)) % 16, y, [110, 160, 245]); }
});
animTile('lava', 16, 180, (P, f) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = Math.sin(x * 0.7 + f * 0.39) + Math.sin(y * 0.6 - f * 0.39 * 0.7) + Math.sin((x + y) * 0.45 + f * 0.2);
    P.put(x, y, v > 1.6 ? [255, 220, 90] : v > 0.6 ? [247, 162, 27] : v > -0.8 ? [214, 90, 22] : [180, 60, 16]);
  }
});
animTile('fire', 8, 70, (P, f) => {
  P.clear();
  for (let x = 0; x < 16; x++) {
    const h = 6 + ((Math.sin(x * 1.7 + f * 0.9) + 1) * 3.5 + P.rng() * 4 | 0);
    for (let j = 0; j < h; j++) { const t = j / h; P.put(x, 15 - j, t < 0.35 ? 0xffe36a : t < 0.7 ? 0xff9a1a : 0xe0441a); }
  }
});
animTile('soul_fire', 8, 70, (P, f) => {
  P.clear();
  for (let x = 0; x < 16; x++) { const h = 6 + ((Math.sin(x * 1.7 + f * 0.9) + 1) * 3.5 + P.rng() * 4 | 0); for (let j = 0; j < h; j++) { const t = j / h; P.put(x, 15 - j, t < 0.35 ? 0xc8ffff : t < 0.7 ? 0x3ad8e8 : 0x1a7a9a); } }
});
animTile('portal', 16, 90, (P, f) => {
  const a = f / 16 * Math.PI * 2;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x - 7.5, dy = y - 7.5, ang = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
    const v = Math.sin(ang * 2 + r * 0.6 - a) + Math.sin(x * 0.9 + y * 0.5 + a) * 0.6;
    P.put(x, y, v > 0.7 ? [190, 90, 255] : v > -0.3 ? [120, 30, 210] : [70, 10, 150], 210);
  }
});
animTile('magma', 8, 200, (P, f) => {
  const glow = 0.6 + 0.4 * Math.sin(f / 8 * Math.PI * 2);
  P.fill(0x5a1a0a, 8);
  const R = mulberry32(99);
  for (let i = 0; i < 7; i++) { const x = R() * 14 | 0, y = R() * 14 | 0, l = 2 + (R() * 3 | 0), d = R() * 3 | 0; P.line(x, y, x + l, y + d, [255, Math.round(80 + 90 * glow), Math.round(26 * glow)]); }
});
animTile('end_portal', 12, 160, (P, f) => {
  P.fill(0x070612, 4);
  const R = mulberry32(5 + f);
  for (let i = 0; i < 18; i++) P.put(R() * 16 | 0, R() * 16 | 0, [0x9fe8d8, 0x6fd0e8, 0xcfa0f0, 0xffffff][i % 4]);
});
animTile('lantern', 6, 160, (P, f) => {
  const b = [1, 0.85, 0.95, 0.8, 1, 0.9][f];
  P.clear(); P.rect(5, 7, 6, 9, 0x2e2e34); P.rect(6, 9, 4, 5, [255, Math.round(201 * b), Math.round(74 * b)]); P.rect(7, 10, 2, 3, [255, Math.round(242 * b), Math.round(176 * b)]); P.rect(5, 7, 6, 1, 0x4a4a52); P.rect(5, 15, 6, 1, 0x4a4a52);
});
animTile('campfire_side', 8, 90, (P, f) => {
  P.clear(); P.rect(0, 12, 16, 4, 0x6b4a28); P.rect(0, 12, 16, 1, 0x8a6a3a);
  for (let x = 3; x < 13; x++) { const h = 3 + ((x * 7 + f * 3) % 6); P.rect(x, 12 - h, 1, h, (x + f) % 2 ? 0xffa020 : 0xffd040); }
});
animTile('campfire_top', 6, 110, (P, f) => {
  P.clear(); P.rect(0, 3, 16, 3, 0x6b4a28); P.rect(0, 10, 16, 3, 0x6b4a28); P.rect(3, 0, 3, 16, 0x5a3e20); P.rect(10, 0, 3, 16, 0x5a3e20);
  P.disc(8, 8, 2.5 + (f % 3) * 0.4, 0xffa020); P.disc(8, 8, 1.2 + (f % 2) * 0.5, 0xfff060);
});
animTile('sculk', 10, 220, (P, f) => {
  P.fill(0x0a2030, 6); P.speck(0x0e3a4a, 0.25, 6);
  const R = mulberry32(42), pulse = 0.5 + 0.5 * Math.sin(f / 10 * Math.PI * 2);
  for (let i = 0; i < 6; i++) P.put(R() * 16, R() * 16, [Math.round(42 * pulse), Math.round(120 + 96 * pulse), Math.round(140 + 92 * pulse)]);
});
animTile('sculk_sensor_top', 10, 150, (P, f) => {
  P.fill(0x0a2a38, 6); const pulse = 0.5 + 0.5 * Math.sin(f / 10 * Math.PI * 2);
  for (const [k, x] of [3, 7, 11].entries()) P.rect(x, 3 + ((f + k) % 3 === 0 ? 1 : 0), 2, 10, [Math.round(42 * pulse), Math.round(150 + 66 * pulse), Math.round(170 + 62 * pulse)]);
});
animTile('creaking_heart', 8, 250, (P, f) => {
  pLogSide(0x6a625a, 0x524a44)(P); const g = 0.55 + 0.45 * Math.sin(f / 8 * Math.PI * 2);
  P.rect(4, 4, 8, 8, 0x3a2a1a); P.rect(5, 6, 2, 3, [255, Math.round(138 * g), Math.round(26 * g)]); P.rect(9, 6, 2, 3, [255, Math.round(138 * g), Math.round(26 * g)]);
});
animTile('nest_front_full', 8, 300, (P, f) => {
  P.fill(0xd8b040, 8); for (let y = 3; y < 16; y += 4) P.rect(0, y, 16, 1, 0xa87a20); P.rect(5, 6, 6, 4, 0x3a2410);
  P.rect(4, 10, 8, 2, 0xf8a820); P.rect(6, 12, 2, 1 + (f >> 1), 0xf8a820); P.rect(10, 12, 1, 1 + ((f + 4) % 8 >> 1), 0xf8a820);
});
animTile('hive_front_full', 8, 300, (P, f) => {
  pPlanks(0xc89a5a)(P); P.rect(0, 0, 16, 2, 0x8a6030); P.rect(0, 14, 16, 2, 0x8a6030); P.rect(5, 7, 6, 3, 0x3a2410);
  P.rect(4, 10, 8, 2, 0xf8a820); P.rect(6, 12, 2, Math.min(2, 1 + (f >> 2)), 0xf8a820);
});

let nextBlockId = 1;

function block(key, name, tex, o = {}) {
  const id = nextBlockId++;
  if (id >= 4096) throw new Error('too many blocks');
  if (nextBlockId === 128) nextBlockId = 512; // 128-511 belong to items, so later blocks start at 512
  const t = typeof tex === 'string' ? { all: tex } : tex;
  const side = t.side || t.all, top = t.top || t.all || side, bottom = t.bottom || top;
  const def = Object.assign({
    id, key, name, isBlock: true, solid: true, opaque: true, cutout: false, translucent: false,
    liquid: false, cross: false, leaves: false, hardness: 1, tool: null, tier: 0, stack: 64, light: false,
  }, o);
  def.faces = [side, side, top, bottom, t.front || side, side].map(n => {
    if (TILES[n] === undefined) throw new Error('missing tile ' + n);
    return TILES[n];
  });
  def.color = TILE_AVG[def.faces[o.colorFace !== undefined ? o.colorFace : 0]];
  DEFS[id] = def; ID[key] = id;
  return def;
}
const PICK = (tier, hardness, extra) => Object.assign({ tool: 'pick', tier, hardness }, extra || {});
const CROSS = { solid: false, opaque: false, cutout: true, cross: true, hardness: 0 };
const LEAVES = { opaque: false, cutout: true, leaves: true, hardness: 0.2 };

block('grass', 'Grass Block', { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, { tool: 'shovel', hardness: 0.6, drop: 'dirt', colorFace: 2 });
block('dirt', 'Dirt', 'dirt', { tool: 'shovel', hardness: 0.5 });
block('stone', 'Stone', 'stone', PICK(1, 1.5, { drop: 'cobblestone' }));
block('cobblestone', 'Cobblestone', 'cobblestone', PICK(1, 2));
block('oak_log', 'Oak Log', { top: 'log_oak_top', side: 'log_oak' }, { tool: 'axe', hardness: 2 });
block('oak_leaves', 'Oak Leaves', 'leaves_oak', Object.assign({ drop: (r) => (r() < 0.05 ? [['oak_sapling', 1]] : r() < 0.06 ? [['apple', 1]] : r() < 0.08 ? [['stick', 1]] : []) }, LEAVES));
block('oak_planks', 'Oak Planks', 'planks_oak', { tool: 'axe', hardness: 2 });
block('sand', 'Sand', 'sand', { tool: 'shovel', hardness: 0.5 });
block('water', 'Water', 'water', { solid: false, opaque: false, translucent: true, liquid: true, hardness: Infinity });
block('gravel', 'Gravel', 'gravel', { tool: 'shovel', hardness: 0.6, drop: (r) => (r() < 0.35 ? [['flint', 1]] : [['gravel', 1]]) });
block('coal_ore', 'Coal Ore', 'coal_ore', PICK(1, 3, { drop: 'coal', xp: 1 }));
block('iron_ore', 'Iron Ore', 'iron_ore', PICK(2, 3, { xp: 1 }));
block('gold_ore', 'Gold Ore', 'gold_ore', PICK(3, 3, { xp: 2 }));
block('diamond_ore', 'Diamond Ore', 'diamond_ore', PICK(3, 3, { drop: 'diamond', xp: 6 }));
block('redstone_ore', 'Redstone Ore', 'redstone_ore', PICK(3, 3, { drop: (r) => [['redstone', 4 + (r() * 2 | 0)]], xp: 2 }));
block('emerald_ore', 'Emerald Ore', 'emerald_ore', PICK(3, 3, { drop: 'emerald', xp: 6 }));
block('lapis_ore', 'Lapis Lazuli Ore', 'lapis_ore', PICK(2, 3, { drop: (r) => [['lapis', 4 + (r() * 4 | 0)]], xp: 3 }));
block('bedrock', 'Bedrock', 'bedrock', { hardness: Infinity });
block('glass', 'Glass', 'glass', { opaque: false, cutout: true, hardness: 0.3, drop: null, glassy: true });
block('bricks', 'Bricks', 'bricks', PICK(1, 2));
block('snow_grass', 'Snowy Grass', { top: 'snow', side: 'snow_side', bottom: 'dirt' }, { tool: 'shovel', hardness: 0.6, drop: 'dirt', colorFace: 2 });
block('snow', 'Snow Block', 'snow', { tool: 'shovel', hardness: 0.2 });
block('ice', 'Ice', 'ice', { opaque: false, translucent: true, hardness: 0.5, drop: null });
block('cactus', 'Cactus', { top: 'cactus_top', side: 'cactus_side' }, { hardness: 0.4 });
block('sandstone', 'Sandstone', { top: 'sandstone_top', side: 'sandstone_side' }, PICK(1, 0.8));
block('obsidian', 'Obsidian', 'obsidian', PICK(4, 50));
block('lava', 'Lava', 'lava', { solid: false, opaque: false, liquid: true, hardness: Infinity, light: true });
block('gold_block', 'Block of Gold', 'gold_block', PICK(3, 3));
block('iron_block', 'Block of Iron', 'iron_block', PICK(2, 5));
block('diamond_block', 'Block of Diamond', 'diamond_block', PICK(3, 5));
block('tnt', 'TNT', { top: 'tnt_top', side: 'tnt_side', bottom: 'tnt_bottom' }, { hardness: 0 });
block('bookshelf', 'Bookshelf', { top: 'planks_oak', side: 'bookshelf' }, { tool: 'axe', hardness: 1.5 });
block('crafting_table', 'Crafting Table', { top: 'ct_top', side: 'ct_side', front: 'ct_front', bottom: 'planks_oak' }, { tool: 'axe', hardness: 2.5 });
block('furnace', 'Furnace', { top: 'furnace_top', side: 'furnace_side', front: 'furnace_front', bottom: 'furnace_top' }, PICK(1, 3.5));
block('pumpkin', 'Jack o\'Pumpkin', { top: 'pumpkin_top', side: 'pumpkin_side', front: 'pumpkin_face' }, { tool: 'axe', hardness: 1 });
block('birch_log', 'Birch Log', { top: 'log_birch_top', side: 'log_birch' }, { tool: 'axe', hardness: 2 });
block('birch_leaves', 'Birch Leaves', 'leaves_birch', Object.assign({ drop: (r) => (r() < 0.05 ? [['birch_sapling', 1]] : r() < 0.06 ? [['stick', 1]] : []) }, LEAVES));
block('birch_planks', 'Birch Planks', 'planks_birch', { tool: 'axe', hardness: 2 });
block('spruce_log', 'Spruce Log', { top: 'log_spruce_top', side: 'log_spruce' }, { tool: 'axe', hardness: 2 });
block('spruce_leaves', 'Spruce Leaves', 'leaves_spruce', Object.assign({ drop: (r) => (r() < 0.05 ? [['spruce_sapling', 1]] : r() < 0.06 ? [['stick', 1]] : []) }, LEAVES));
block('spruce_planks', 'Spruce Planks', 'planks_spruce', { tool: 'axe', hardness: 2 });
block('netherrack', 'Netherrack', 'netherrack', PICK(1, 0.4));
block('glowstone', 'Glowstone', 'glowstone', { hardness: 0.3, light: true, emit: 11 });
block('end_stone', 'End Stone', 'end_stone', PICK(1, 3));
block('wool_white', 'White Wool', 'wool_white', { hardness: 0.8 });
block('wool_red', 'Red Wool', 'wool_red', { hardness: 0.8 });
block('wool_blue', 'Blue Wool', 'wool_blue', { hardness: 0.8 });
block('wool_green', 'Green Wool', 'wool_green', { hardness: 0.8 });
block('wool_yellow', 'Yellow Wool', 'wool_yellow', { hardness: 0.8 });
block('wool_black', 'Black Wool', 'wool_black', { hardness: 0.8 });
block('wool_orange', 'Orange Wool', 'wool_orange', { hardness: 0.8 });
block('wool_purple', 'Purple Wool', 'wool_purple', { hardness: 0.8 });
block('mossy_cobblestone', 'Mossy Cobblestone', 'mossy_cobblestone', PICK(1, 2));
block('clay', 'Clay', 'clay', { tool: 'shovel', hardness: 0.6 });
block('terracotta', 'Terracotta', 'terracotta', PICK(1, 1.25));
block('emerald_block', 'Block of Emerald', 'emerald_block', PICK(3, 5));
block('lapis_block', 'Block of Lapis', 'lapis_block', PICK(2, 3));
block('coal_block', 'Block of Coal', 'coal_block', PICK(1, 5));
block('redstone_block', 'Block of Redstone', 'redstone_block', PICK(1, 5));
block('quartz_block', 'Block of Quartz', 'quartz_block', PICK(1, 0.8));
block('stone_bricks', 'Stone Bricks', 'stone_bricks', PICK(1, 1.5));
block('dragon_egg', 'Dragon Egg', 'dragon_egg', { hardness: 3, light: true });
block('melon', 'Melon', { top: 'melon_top', side: 'melon_side' }, { tool: 'axe', hardness: 1, drop: (r) => [['melon_slice', 3 + (r() * 5 | 0)]] });
block('hay_bale', 'Hay Bale', { top: 'hay_top', side: 'hay_side' }, { hardness: 0.5 });
block('rose', 'Rose', 'rose', CROSS);
block('dandelion', 'Dandelion', 'dandelion', CROSS);
block('tall_grass', 'Tall Grass', 'tall_grass', Object.assign({ drop: (r) => (r() < 0.125 ? [['wheat_seeds', 1]] : []), replaceable: true }, CROSS));
block('dead_bush', 'Dead Bush', 'dead_bush', Object.assign({ drop: (r) => (r() < 0.5 ? [['stick', 1]] : []), replaceable: true }, CROSS));
block('red_mushroom', 'Red Mushroom', 'red_mushroom', CROSS);
block('brown_mushroom', 'Brown Mushroom', 'brown_mushroom', CROSS);
block('soul_sand', 'Soul Sand', 'soul_sand', { tool: 'shovel', hardness: 0.5 });
block('nether_bricks', 'Nether Bricks', 'nether_bricks', PICK(1, 2));
block('nether_quartz_ore', 'Nether Quartz Ore', 'nether_quartz_ore', PICK(1, 3, { drop: (r) => [['quartz', 1 + (r() * 4 | 0)]], xp: 2 }));
block('nether_gold_ore', 'Nether Gold Ore', 'nether_gold_ore', PICK(1, 3, { drop: 'gold_ingot', xp: 1 }));
block('magma', 'Magma Block', 'magma', PICK(1, 0.5, { light: true }));
block('bed', 'Bed', { top: 'bed_top', side: 'bed_side', bottom: 'planks_oak' }, { tool: 'axe', hardness: 0.2, height: 0.5625, opaque: false, iconTile: 'i_bed' });
block('chest_loot', 'Treasure Chest', { top: 'chest_top', side: 'chest_side', front: 'chest_side' }, { tool: 'axe', hardness: 2.5, drop: null });
block('chest', 'Chest', { top: 'chest_top', side: 'chest_side' }, { tool: 'axe', hardness: 2.5 });
block('spawner', 'Monster Spawner', 'spawner', PICK(1, 5, { opaque: false, cutout: true, drop: null, light: true }));
block('nether_portal', 'Nether Portal', 'portal', { solid: false, opaque: false, translucent: true, hardness: 0, drop: null, light: true, portal: true });
block('bed_head', 'Bed', { top: 'bed_head_top', side: 'bed_side', bottom: 'planks_oak' }, { tool: 'axe', hardness: 0.2, height: 0.5625, opaque: false, drop: 'bed' });
block('wheat_crop', 'Wheat', 'wheat_crop', Object.assign({ drop: (r) => [['wheat', 1], ['wheat_seeds', 1 + (r() < 0.5 ? 1 : 0)]] }, CROSS));
block('end_stone', 'End Stone', 'end_stone', PICK(1, 3));
block('end_portal_frame', 'End Portal Frame', { top: 'end_frame_top', side: 'end_frame_side', bottom: 'end_stone' }, { hardness: Infinity, height: 0.8125, opaque: false, light: true });
block('end_portal_frame_eye', 'End Portal Frame', { top: 'end_frame_top_eye', side: 'end_frame_side', bottom: 'end_stone' }, { hardness: Infinity, height: 0.8125, opaque: false, light: true });
block('end_portal', 'End Portal', 'end_portal', { solid: false, opaque: false, hardness: Infinity, drop: null, light: true, portal: true, height: 0.75 });
block('farmland', 'Farmland', { top: 'farmland_top', side: 'dirt', bottom: 'dirt' }, { tool: 'shovel', hardness: 0.6, height: 0.9375, opaque: false, drop: 'dirt' });
block('wheat_sprout', 'Wheat (growing)', 'wheat_sprout', Object.assign({ drop: 'wheat_seeds' }, CROSS));
/* doors: two halves, closed or open, across x or z; trapdoors: closed (lying flat) or open (standing up) */
const DOOR_BOX = { xc: [0, 0, 0.40625, 1, 1, 0.59375], xo: [0, 0, 0, 0.1875, 1, 1], zc: [0.40625, 0, 0, 0.59375, 1, 1], zo: [0, 0, 0, 1, 1, 0.1875] };
for (const ax of ['x', 'z']) for (const op of ['c', 'o']) for (const half of ['lower', 'upper']) {
  const tile = half === 'lower' ? 'door_lower' : 'door_upper';
  block('door_' + ax + op + '_' + half, 'Oak Door', tile, { tool: 'axe', hardness: 1.5, opaque: false, solid: op === 'c', box: DOOR_BOX[ax + op], drop: half === 'lower' ? 'oak_door' : null, door: { ax, open: op === 'o', half } });
}
const TRAP_BOX = { c: [0, 0, 0, 1, 0.1875, 1], ox: [0, 0, 0, 1, 1, 0.1875], oz: [0, 0, 0, 0.1875, 1, 1] };
for (const ax of ['x', 'z']) for (const op of ['c', 'o']) {
  block('trapdoor_' + ax + op, 'Oak Trapdoor', 'trapdoor', { tool: 'axe', hardness: 1.5, opaque: false, solid: op === 'c', height: op === 'c' ? 0.1875 : undefined, box: op === 'c' ? TRAP_BOX.c : TRAP_BOX['o' + ax], drop: 'oak_trapdoor', trapdoor: { ax, open: op === 'o' } });
}
/* stairs: a bottom half plus a back half; the high side is the side you face when you place them */
const STAIR_UP = { n: [0, 0.5, 0, 1, 1, 0.5], s: [0, 0.5, 0.5, 1, 1, 1], w: [0, 0.5, 0, 0.5, 1, 1], e: [0.5, 0.5, 0, 1, 1, 1] };
for (const [k, n, tex, tool] of [['oak', 'Oak', 'planks_oak', 'axe'], ['cobblestone', 'Cobblestone', 'cobblestone', 'pick'], ['stone_brick', 'Stone Brick', 'stone_bricks', 'pick']]) {
  for (const d of ['n', 's', 'w', 'e']) block(k + '_stairs_' + d, n + ' Stairs', tex, { tool, tier: tool === 'pick' ? 1 : 0, hardness: 2, opaque: false, boxes: [[0, 0, 0, 1, 0.5, 1], STAIR_UP[d]], drop: k + '_stairs', stair: k });
}
block('oak_fence', 'Oak Fence', 'planks_oak', { tool: 'axe', hardness: 2, opaque: false, fence: true, iconTile: 'i_oak_fence' });
/* fence gates: across x or z, closed (a wall as tall as a fence) or open (swung aside) */
const GATE_BOXES = {
  xc: [[0, 0.3125, 0.4375, 0.125, 1, 0.5625], [0.875, 0.3125, 0.4375, 1, 1, 0.5625], [0.125, 0.375, 0.4375, 0.875, 0.5625, 0.5625], [0.125, 0.75, 0.4375, 0.875, 0.9375, 0.5625], [0.4375, 0.5625, 0.4375, 0.5625, 0.75, 0.5625]],
  xo: [[0, 0.3125, 0.4375, 0.125, 1, 0.5625], [0.875, 0.3125, 0.4375, 1, 1, 0.5625], [0, 0.375, 0.5625, 0.125, 0.5625, 0.9375], [0, 0.75, 0.5625, 0.125, 0.9375, 0.9375], [0.875, 0.375, 0.5625, 1, 0.5625, 0.9375], [0.875, 0.75, 0.5625, 1, 0.9375, 0.9375]],
};
const swapXZ = bs => bs.map(b => [b[2], b[1], b[0], b[5], b[4], b[3]]);
GATE_BOXES.zc = swapXZ(GATE_BOXES.xc); GATE_BOXES.zo = swapXZ(GATE_BOXES.xo);
for (const ax of ['x', 'z']) for (const op of ['c', 'o']) {
  const cbox = ax === 'x' ? [[0, 0, 0.375, 1, 1.5, 0.625]] : [[0.375, 0, 0, 0.625, 1.5, 1]];
  block('gate_' + ax + op, 'Oak Fence Gate', 'planks_oak', { tool: 'axe', hardness: 2, opaque: false, solid: op === 'c', boxes: GATE_BOXES[ax + op], cboxes: op === 'c' ? cbox : [], drop: 'oak_fence_gate', gate: { ax, open: op === 'o' } });
}
/* signs: standing on a post or flat on a wall; the letter is the way the writing faces */
const SIGN_BOARD = { n: [0.0625, 0.5, 0.4375, 0.9375, 1, 0.5625], s: [0.0625, 0.5, 0.4375, 0.9375, 1, 0.5625], e: [0.4375, 0.5, 0.0625, 0.5625, 1, 0.9375], w: [0.4375, 0.5, 0.0625, 0.5625, 1, 0.9375] };
const WALL_SIGN = { n: [0.0625, 0.25, 0.875, 0.9375, 0.75, 1], s: [0.0625, 0.25, 0, 0.9375, 0.75, 0.125], e: [0, 0.25, 0.0625, 0.125, 0.75, 0.9375], w: [0.875, 0.25, 0.0625, 1, 0.75, 0.9375] };
for (const d of ['n', 's', 'e', 'w']) {
  block('sign_' + d, 'Oak Sign', 'planks_oak', { tool: 'axe', hardness: 1, opaque: false, solid: false, boxes: [SIGN_BOARD[d], [0.4375, 0, 0.4375, 0.5625, 0.5, 0.5625]], drop: 'oak_sign', sign: { d, wall: false } });
  block('wall_sign_' + d, 'Oak Sign', 'planks_oak', { tool: 'axe', hardness: 1, opaque: false, solid: false, boxes: [WALL_SIGN[d]], drop: 'oak_sign', sign: { d, wall: true } });
}
block('carrot_sprout', 'Carrots (growing)', 'carrot_sprout', Object.assign({ drop: 'carrot' }, CROSS));
block('carrot_crop', 'Carrots', 'carrot_crop', Object.assign({ drop: (r) => [['carrot', 2 + (r() * 3 | 0)]] }, CROSS));
block('potato_sprout', 'Potatoes (growing)', 'potato_sprout', Object.assign({ drop: 'potato' }, CROSS));
block('potato_crop', 'Potatoes', 'potato_crop', Object.assign({ drop: (r) => [['potato', 1 + (r() * 4 | 0)]] }, CROSS));
block('pumpkin_stem', 'Pumpkin Stem', 'pumpkin_stem', Object.assign({ drop: 'pumpkin_seeds' }, CROSS));
for (const [k, n] of [['oak', 'Oak'], ['birch', 'Birch'], ['spruce', 'Spruce']]) block(k + '_sapling', n + ' Sapling', k + '_sapling', Object.assign({ sapling: k }, CROSS));
/* ladders sit flat against a wall: the letter says which side of the block they hug */
const LADDER_BOX = { w: [0, 0, 0, 0.1875, 1, 1], e: [0.8125, 0, 0, 1, 1, 1], n: [0, 0, 0, 1, 1, 0.1875], s: [0, 0, 0.8125, 1, 1, 1] };
for (const d of ['n', 's', 'w', 'e']) block('ladder_' + d, 'Ladder', 'ladder', { tool: 'axe', hardness: 0.4, opaque: false, solid: false, box: LADDER_BOX[d], ladder: d, drop: 'ladder' });

/* NEW BLOCKS GO HERE, AT THE END: saves keep blocks as numbers, so a block added in the middle
   would turn every block after it into a different one in everyone's worlds. */
/* things that light up the area around them (emit = how far the light reaches) */
block('torch', 'Torch', { side: 'torch', top: 'torch_top', bottom: 'torch_top' }, { hardness: 0, solid: false, opaque: false, cutout: true, box: [0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625], light: true, emit: 12, iconTile: 'i_torch' });
block('lantern', 'Lantern', { side: 'lantern', top: 'lantern_top', bottom: 'lantern_top' }, { hardness: 1, opaque: false, cutout: true, box: [0.3125, 0, 0.3125, 0.6875, 0.5625, 0.6875], boxes: [[0.3125, 0, 0.3125, 0.6875, 0.5625, 0.6875]], light: true, emit: 14, iconTile: 'i_lantern' });
block('fire', 'Fire', 'fire', { solid: false, opaque: false, cutout: true, cross: true, hardness: 0, drop: null, replaceable: true, light: true, emit: 11 });
/* your flag: place it anywhere, then "Show flag" points the way back (one flag each) */
block('flag', 'Flag', 'flag', { hardness: 0.3, solid: false, opaque: false, cutout: true, boxes: [[0.4375, 0, 0.4375, 0.5625, 1, 0.5625], [0.5625, 0.5, 0.47, 1, 0.94, 0.53]], iconTile: 'i_flag' });
block('ancient_debris', 'Ancient Debris', { side: 'ancient_debris_side', top: 'ancient_debris_top' }, PICK(4, 12, { xp: 2 }));
block('netherite_block', 'Block of Netherite', 'netherite_block', PICK(4, 15));
block('blackstone', 'Blackstone', 'blackstone', PICK(1, 1.5));
block('basalt', 'Basalt', { side: 'basalt_side', top: 'basalt_top' }, PICK(1, 1.25));
block('crimson_nylium', 'Crimson Nylium', { top: 'crimson_nylium', side: 'crimson_nylium_side', bottom: 'netherrack' }, PICK(1, 0.4, { drop: 'netherrack', colorFace: 2 }));
block('warped_nylium', 'Warped Nylium', { top: 'warped_nylium', side: 'warped_nylium_side', bottom: 'netherrack' }, PICK(1, 0.4, { drop: 'netherrack', colorFace: 2 }));
block('crimson_stem', 'Crimson Stem', { top: 'crimson_stem_top', side: 'crimson_stem' }, { tool: 'axe', hardness: 2 });
block('warped_stem', 'Warped Stem', { top: 'warped_stem_top', side: 'warped_stem' }, { tool: 'axe', hardness: 2 });
block('crimson_planks', 'Crimson Planks', 'crimson_planks', { tool: 'axe', hardness: 2 });
block('warped_planks', 'Warped Planks', 'warped_planks', { tool: 'axe', hardness: 2 });
block('nether_wart_block', 'Nether Wart Block', 'nether_wart_block', { tool: 'hoe', hardness: 1 });
block('warped_wart_block', 'Warped Wart Block', 'warped_wart_block', { tool: 'hoe', hardness: 1 });
block('shroomlight', 'Shroomlight', 'shroomlight', { tool: 'hoe', hardness: 1, light: true, emit: 13 });
block('crimson_roots', 'Crimson Roots', 'crimson_roots', Object.assign({ replaceable: true }, CROSS));
block('warped_roots', 'Warped Roots', 'warped_roots', Object.assign({ replaceable: true }, CROSS));
/* slabs: half blocks, on the bottom or top half of a space. Two of the same make the full block. */
const SLAB_MATS = [
  ['oak', 'Oak', 'oak_planks', 'axe'], ['birch', 'Birch', 'birch_planks', 'axe'], ['spruce', 'Spruce', 'spruce_planks', 'axe'],
  ['crimson', 'Crimson', 'crimson_planks', 'axe'], ['warped', 'Warped', 'warped_planks', 'axe'],
  ['cobblestone', 'Cobblestone', 'cobblestone', 'pick'], ['stone', 'Stone', 'stone', 'pick'], ['stone_brick', 'Stone Brick', 'stone_bricks', 'pick'],
  ['sandstone', 'Sandstone', 'sandstone', 'pick'], ['brick', 'Brick', 'bricks', 'pick'], ['blackstone', 'Blackstone', 'blackstone', 'pick'],
  ['nether_brick', 'Nether Brick', 'nether_bricks', 'pick'], ['quartz', 'Quartz', 'quartz_block', 'pick'],
];
for (const [k, n, full, tool] of SLAB_MATS) for (const half of ['b', 't']) {
  const f = DEFS[ID[full]];
  const def = block(k + '_slab_' + half, n + ' Slab', 'stone', { tool, tier: tool === 'pick' ? 1 : 0, hardness: 2, opaque: false, boxes: [half === 'b' ? [0, 0, 0, 1, 0.5, 1] : [0, 0.5, 0, 1, 1, 1]], drop: k + '_slab', slab: k, slabFull: full, slabHalf: half });
  def.faces = f.faces.slice(); def.color = f.color;
}
block('glass_pane', 'Glass Pane', 'glass', { opaque: false, cutout: true, hardness: 0.3, pane: true, iconTile: 'glass' });
for (const [k, n] of STAINS) {
  block('stained_glass_' + k, n + ' Stained Glass', 'stained_glass_' + k, { opaque: false, translucent: true, hardness: 0.3, glassy: true });
  block('stained_glass_pane_' + k, n + ' Stained Glass Pane', 'stained_glass_' + k, { opaque: false, translucent: true, hardness: 0.3, pane: true, iconTile: 'stained_glass_' + k });
}
block('deepslate', 'Deepslate', { side: 'deepslate', top: 'deepslate_top' }, PICK(1, 3, { drop: 'cobbled_deepslate' }));
block('cobbled_deepslate', 'Cobbled Deepslate', 'cobbled_deepslate', PICK(1, 3.5));
block('deepslate_coal_ore', 'Deepslate Coal Ore', 'deepslate_coal_ore', PICK(1, 4.5, { drop: 'coal', xp: 1 }));
block('deepslate_iron_ore', 'Deepslate Iron Ore', 'deepslate_iron_ore', PICK(2, 4.5, { drop: 'iron_ore', xp: 1 }));
block('deepslate_gold_ore', 'Deepslate Gold Ore', 'deepslate_gold_ore', PICK(3, 4.5, { drop: 'gold_ore', xp: 2 }));
block('deepslate_diamond_ore', 'Deepslate Diamond Ore', 'deepslate_diamond_ore', PICK(3, 4.5, { drop: 'diamond', xp: 6 }));
block('deepslate_redstone_ore', 'Deepslate Redstone Ore', 'deepslate_redstone_ore', PICK(3, 4.5, { drop: (r) => [['redstone', 4 + (r() * 2 | 0)]], xp: 2 }));
block('deepslate_emerald_ore', 'Deepslate Emerald Ore', 'deepslate_emerald_ore', PICK(3, 4.5, { drop: 'emerald', xp: 6 }));
block('deepslate_lapis_ore', 'Deepslate Lapis Ore', 'deepslate_lapis_ore', PICK(2, 4.5, { drop: (r) => [['lapis', 4 + (r() * 4 | 0)]], xp: 3 }));
block('jungle_log', 'Jungle Log', { top: 'log_jungle_top', side: 'log_jungle' }, { tool: 'axe', hardness: 2 });
block('jungle_leaves', 'Jungle Leaves', 'leaves_jungle', Object.assign({ drop: (r) => (r() < 0.04 ? [['jungle_sapling', 1]] : r() < 0.05 ? [['cocoa_beans', 1]] : r() < 0.07 ? [['stick', 1]] : []) }, LEAVES));
block('jungle_planks', 'Jungle Planks', 'planks_jungle', { tool: 'axe', hardness: 2 });
block('jungle_sapling', 'Jungle Sapling', 'jungle_sapling', Object.assign({ sapling: 'jungle' }, CROSS));
block('dark_oak_log', 'Dark Oak Log', { top: 'log_dark_oak_top', side: 'log_dark_oak' }, { tool: 'axe', hardness: 2 });
block('dark_oak_leaves', 'Dark Oak Leaves', 'leaves_dark_oak', Object.assign({ drop: (r) => (r() < 0.05 ? [['dark_oak_sapling', 1]] : r() < 0.06 ? [['apple', 1]] : r() < 0.08 ? [['stick', 1]] : []) }, LEAVES));
block('dark_oak_planks', 'Dark Oak Planks', 'planks_dark_oak', { tool: 'axe', hardness: 2 });
block('dark_oak_sapling', 'Dark Oak Sapling', 'dark_oak_sapling', Object.assign({ sapling: 'dark_oak' }, CROSS));
for (const d of ['n', 's', 'w', 'e']) block('dark_oak_stairs_' + d, 'Dark Oak Stairs', 'planks_dark_oak', { tool: 'axe', hardness: 2, opaque: false, boxes: [[0, 0, 0, 1, 0.5, 1], STAIR_UP[d]], drop: 'dark_oak_stairs', stair: 'dark_oak' });
for (const half of ['b', 't']) block('dark_oak_slab_' + half, 'Dark Oak Slab', 'planks_dark_oak', { tool: 'axe', hardness: 2, opaque: false, boxes: [half === 'b' ? [0, 0, 0, 1, 0.5, 1] : [0, 0.5, 0, 1, 1, 1]], drop: 'dark_oak_slab', slab: 'dark_oak', slabFull: 'dark_oak_planks', slabHalf: half });
function woodBlocks(w, n, pk) {
  block(w + '_fence', n + ' Fence', pk, { tool: 'axe', hardness: 2, opaque: false, fence: true, iconTile: 'i_' + w + '_fence' });
  for (const ax of ['x', 'z']) for (const op of ['c', 'o']) {
    const cbox = ax === 'x' ? [[0, 0, 0.375, 1, 1.5, 0.625]] : [[0.375, 0, 0, 0.625, 1.5, 1]];
    block(w + '_gate_' + ax + op, n + ' Fence Gate', pk, { tool: 'axe', hardness: 2, opaque: false, solid: op === 'c', boxes: GATE_BOXES[ax + op], cboxes: op === 'c' ? cbox : [], drop: w + '_fence_gate', gate: { ax, open: op === 'o', wood: w } });
    for (const half of ['lower', 'upper']) block(w + '_door_' + ax + op + '_' + half, n + ' Door', w + '_door_' + half, { tool: 'axe', hardness: 1.5, opaque: false, solid: op === 'c', box: DOOR_BOX[ax + op], drop: half === 'lower' ? w + '_door' : null, door: { ax, open: op === 'o', half, wood: w } });
    block(w + '_trapdoor_' + ax + op, n + ' Trapdoor', w + '_trapdoor', { tool: 'axe', hardness: 1.5, opaque: false, solid: op === 'c', height: op === 'c' ? 0.1875 : undefined, box: op === 'c' ? TRAP_BOX.c : TRAP_BOX['o' + ax], drop: w + '_trapdoor', trapdoor: { ax, open: op === 'o', wood: w } });
  }
  if (w !== 'dark_oak') for (const d of ['n', 's', 'w', 'e']) block(w + '_stairs_' + d, n + ' Stairs', pk, { tool: 'axe', hardness: 2, opaque: false, boxes: [[0, 0, 0, 1, 0.5, 1], STAIR_UP[d]], drop: w + '_stairs', stair: w });
}
for (const [w, n, , planks] of WOODS) woodBlocks(w, n, w === 'crimson' || w === 'warped' ? w + '_planks' : planks);
for (const half of ['b', 't']) block('jungle_slab_' + half, 'Jungle Slab', 'planks_jungle', { tool: 'axe', hardness: 2, opaque: false, boxes: [half === 'b' ? [0, 0, 0, 1, 0.5, 1] : [0, 0.5, 0, 1, 1, 1]], drop: 'jungle_slab', slab: 'jungle', slabFull: 'jungle_planks', slabHalf: half });
/* work blocks: a villager near one takes that job and has things to trade */
block('composter', 'Composter', { side: 'composter_side', top: 'composter_top', bottom: 'planks_oak' }, { tool: 'axe', hardness: 0.6, job: 'farmer' });
block('lectern', 'Lectern', { side: 'lectern_side', top: 'lectern_top', bottom: 'planks_oak' }, { tool: 'axe', hardness: 2.5, job: 'librarian' });
block('smoker', 'Smoker', { side: 'smoker_side', front: 'smoker_front', top: 'smoker_side', bottom: 'smoker_side' }, PICK(1, 3.5, { job: 'butcher' }));
block('blast_furnace', 'Blast Furnace', { side: 'blast_side', front: 'blast_front', top: 'blast_side', bottom: 'blast_side' }, PICK(1, 3.5, { job: 'armorer' }));
block('grindstone', 'Grindstone', 'grindstone', PICK(1, 2, { job: 'weaponsmith' }));
block('fletching_table', 'Fletching Table', { side: 'fletching_side', top: 'fletching_top', bottom: 'planks_oak' }, { tool: 'axe', hardness: 2.5, job: 'fletcher' });
/* beds facing a direction (from the foot towards the head): n, s, e or w */
for (const d of ['n', 's', 'e', 'w']) {
  const ax = d === 'n' || d === 's' ? 'z' : 'x';
  block('bed_foot_' + d, 'Bed', { top: 'bed_foot_top_' + ax, side: 'bed_side', bottom: 'planks_oak' }, { tool: 'axe', hardness: 0.2, height: 0.5625, opaque: false, drop: 'bed', bedPart: 'foot', bedDir: d });
  block('bed_head_' + d, 'Bed', { top: 'bed_head_top_' + d, side: 'bed_side', bottom: 'planks_oak' }, { tool: 'axe', hardness: 0.2, height: 0.5625, opaque: false, drop: 'bed', bedPart: 'head', bedDir: d });
}
/* doors hinged on the other side, so two doors side by side open like one double door */
const DOOR_BOX_R = { xc: DOOR_BOX.xc, xo: [0.8125, 0, 0, 1, 1, 1], zc: DOOR_BOX.zc, zo: [0, 0, 0.8125, 1, 1, 1] };
const rightDoors = (w, n) => { for (const ax of ['x', 'z']) for (const op of ['c', 'o']) for (const half of ['lower', 'upper']) {
  const wood = w ? w.slice(0, -1) : undefined, tile = w ? w + 'door_' + half : 'door_' + half;
  block(w + 'door_' + ax + op + '_r_' + half, n + ' Door', tile, { tool: 'axe', hardness: 1.5, opaque: false, solid: op === 'c', box: DOOR_BOX_R[ax + op], drop: half === 'lower' ? (wood || 'oak') + '_door' : null, door: { ax, open: op === 'o', half, wood, hinge: 'r' } });
} };
for (const [w, n] of [['', 'Oak'], ...WOODS.map(([k, nm]) => [k + '_', nm])]) rightDoors(w, n);
/* acacia (added after everything above, so saved worlds keep their numbers) */
block('acacia_log', 'Acacia Log', { top: 'log_acacia_top', side: 'log_acacia' }, { tool: 'axe', hardness: 2 });
block('acacia_leaves', 'Acacia Leaves', 'leaves_acacia', Object.assign({ drop: (r) => (r() < 0.05 ? [['acacia_sapling', 1]] : r() < 0.07 ? [['stick', 1]] : []) }, LEAVES));
block('acacia_planks', 'Acacia Planks', 'planks_acacia', { tool: 'axe', hardness: 2 });
block('acacia_sapling', 'Acacia Sapling', 'acacia_sapling', Object.assign({ sapling: 'acacia' }, CROSS));
woodBlocks('acacia', 'Acacia', 'planks_acacia');
for (const half of ['b', 't']) block('acacia_slab_' + half, 'Acacia Slab', 'planks_acacia', { tool: 'axe', hardness: 2, opaque: false, boxes: [half === 'b' ? [0, 0, 0, 1, 0.5, 1] : [0, 0.5, 0, 1, 1, 1]], drop: 'acacia_slab', slab: 'acacia', slabFull: 'acacia_planks', slabHalf: half });
rightDoors('acacia_', 'Acacia');
/* mangrove and cherry (after acacia, same reason) */
for (const [w, n, sap] of [['mangrove', 'Mangrove', 'Mangrove Propagule'], ['cherry', 'Cherry', 'Cherry Sapling']]) {
  block(w + '_log', n + ' Log', { top: 'log_' + w + '_top', side: 'log_' + w }, { tool: 'axe', hardness: 2 });
  block(w + '_leaves', n + ' Leaves', 'leaves_' + w, Object.assign({ drop: (r) => (r() < 0.05 ? [[w + '_sapling', 1]] : r() < 0.07 ? [['stick', 1]] : []) }, LEAVES));
  block(w + '_planks', n + ' Planks', 'planks_' + w, { tool: 'axe', hardness: 2 });
  block(w + '_sapling', sap, w + '_sapling', Object.assign({ sapling: w }, CROSS));
  woodBlocks(w, n, 'planks_' + w);
  for (const half of ['b', 't']) block(w + '_slab_' + half, n + ' Slab', 'planks_' + w, { tool: 'axe', hardness: 2, opaque: false, boxes: [half === 'b' ? [0, 0, 0, 1, 0.5, 1] : [0, 0.5, 0, 1, 1, 1]], drop: w + '_slab', slab: w, slabFull: w + '_planks', slabHalf: half });
  rightDoors(w + '_', n);
}
block('mangrove_roots', 'Mangrove Roots', 'mangrove_roots', { tool: 'axe', hardness: 0.7, opaque: false, cutout: true });
/* bamboo: a thin stalk you can stack; breaking one breaks everything above */
block('bamboo', 'Bamboo', { side: 'bamboo_side', top: 'bamboo_top', bottom: 'bamboo_top' }, { tool: 'axe', hardness: 0.5, opaque: false, cutout: true, box: [0.375, 0, 0.375, 0.625, 1, 0.625], boxes: [[0.375, 0, 0.375, 0.625, 1, 0.625]], iconTile: 'i_bamboo' });
block('bamboo_block', 'Block of Bamboo', { top: 'bamboo_block_top', side: 'bamboo_block_side' }, { tool: 'axe', hardness: 2 });
block('bamboo_planks', 'Bamboo Planks', 'planks_bamboo', { tool: 'axe', hardness: 2 });
block('sugar_cane', 'Sugar Cane', 'sugar_cane', { solid: false, opaque: false, cutout: true, cross: true, hardness: 0, iconTile: 'i_sugar_cane' });
block('enchanting_table', 'Enchanting Table', { top: 'ench_top', side: 'ench_side', bottom: 'ench_bottom' }, PICK(1, 5, { height: 0.75, opaque: false, light: true, emit: 7 }));
/* levers, buttons and pressure plates power what is right next to them, or next to the block they sit on:
   doors, trapdoors and fence gates open, TNT lights up.  Support side: n s e w (a wall) or d (the floor). */
const SWITCH_ROT = (b, d) => d === 's' ? [b[0], b[1], 1 - b[5], b[3], b[4], 1 - b[2]] : d === 'w' ? [b[2], b[1], b[0], b[5], b[4], b[3]] : d === 'e' ? [1 - b[5], b[1], b[0], 1 - b[2], b[4], b[3]] : b;
for (const d of ['d', 'n', 's', 'w', 'e']) for (const on of [0, 1]) {
  const fl = d === 'd';
  const base = fl ? [0.25, 0, 0.3125, 0.75, 0.1875, 0.6875] : SWITCH_ROT([0.3125, 0.25, 0, 0.6875, 0.75, 0.1875], d);
  const handle = fl ? (on ? [0.58, 0.1875, 0.4375, 0.705, 0.75, 0.5625] : [0.295, 0.1875, 0.4375, 0.42, 0.75, 0.5625]) : SWITCH_ROT(on ? [0.4375, 0.58, 0.1875, 0.5625, 0.705, 0.75] : [0.4375, 0.295, 0.1875, 0.5625, 0.42, 0.75], d);
  const lv = block('lever_' + d + '_' + on, 'Lever', 'lever', { hardness: 0.5, solid: false, opaque: false, cutout: true, box: [Math.min(base[0], handle[0]), Math.min(base[1], handle[1]), Math.min(base[2], handle[2]), Math.max(base[3], handle[3]), Math.max(base[4], handle[4]), Math.max(base[5], handle[5])], boxes: [base, handle], drop: 'lever', lever: { d, on: !!on }, iconTile: 'i_lever' });
  lv.boxFaces = [new Array(6).fill(TILES.cobblestone), new Array(6).fill(TILES.lever_handle)];
}
for (const [k, n, tile] of [['stone', 'Stone', 'stone'], ['oak', 'Oak', 'planks_oak']]) for (const d of ['d', 'n', 's', 'w', 'e']) for (const on of [0, 1]) {
  const dep = on ? 0.0625 : 0.125, bx = d === 'd' ? [0.3125, 0, 0.375, 0.6875, dep, 0.625] : SWITCH_ROT([0.3125, 0.375, 0, 0.6875, 0.625, dep], d);
  block(k + '_button_' + d + '_' + on, n + ' Button', tile, { hardness: 0.5, solid: false, opaque: false, box: bx, boxes: [bx], drop: k + '_button', button: { d, on: !!on, kind: k }, iconTile: 'i_' + k + '_button' });
}
for (const [k, n, tile] of [['stone', 'Stone', 'stone'], ['oak', 'Oak', 'planks_oak']]) for (const on of [0, 1]) {
  const bx = [0.0625, 0, 0.0625, 0.9375, on ? 0.03125 : 0.0625, 0.9375];
  block(k + '_plate_' + on, n + ' Pressure Plate', tile, { hardness: 0.5, solid: false, opaque: false, box: bx, boxes: [bx], drop: k + '_pressure_plate', plate: { on: !!on, kind: k }, iconTile: 'i_' + k + '_pressure_plate' });
}
/* the anvil: name your things, and join enchantments (from a second item of the same kind, or a book) */
block('anvil', 'Anvil', { side: 'anvil', top: 'anvil_top', bottom: 'anvil' }, PICK(1, 5, { opaque: false, boxes: [[0.125, 0, 0.125, 0.875, 0.25, 0.875], [0.3125, 0.25, 0.25, 0.6875, 0.625, 0.75], [0, 0.625, 0.1875, 1, 1, 0.8125]], iconTile: 'i_anvil' }));
/* the iron door: only a button, lever or pressure plate opens it (hinged either side, like wooden doors) */
for (const ax of ['x', 'z']) for (const op of ['c', 'o']) for (const hg of ['', '_r']) for (const half of ['lower', 'upper']) {
  block('iron_door_' + ax + op + hg + '_' + half, 'Iron Door', 'iron_door_' + half, PICK(1, 5, { opaque: false, solid: op === 'c', box: (hg ? DOOR_BOX_R : DOOR_BOX)[ax + op], drop: half === 'lower' ? 'iron_door' : null, door: hg ? { ax, open: op === 'o', half, wood: 'iron', hinge: 'r' } : { ax, open: op === 'o', half, wood: 'iron' } }));
}
/* redstone dust: a wire on the floor that carries power from levers, buttons, plates and redstone torches */
for (const on of [0, 1]) block('redstone_wire_' + on, 'Redstone Dust', 'rs_dust_' + (on ? 'on' : 'off'), { hardness: 0, solid: false, opaque: false, cutout: true, box: [0, 0, 0, 1, 0.0625, 1], boxes: [[0, 0, 0, 1, 0.0625, 1]], drop: 'redstone', wire: { on: !!on }, iconTile: 'i_redstone' });
/* redstone torch: always on, unless the block it is stuck to gets power (then it turns off) */
for (const d of ['d', 'n', 's', 'w', 'e']) for (const on of [0, 1]) {
  const bx = d === 'd' ? [0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625] : SWITCH_ROT([0.4375, 0.2, 0, 0.5625, 0.8, 0.14], d);
  const k = on ? 'on' : 'off';
  block('redstone_torch_' + d + '_' + on, 'Redstone Torch', { side: 'rs_torch_' + k, top: 'rs_torch_top_' + k, bottom: 'rs_torch_top_' + k }, Object.assign({ hardness: 0, solid: false, opaque: false, cutout: true, box: bx, boxes: [bx], drop: 'redstone_torch', rsTorch: { d, on: !!on }, iconTile: 'i_redstone_torch' }, on ? { light: true, emit: 7 } : {}));
}
/* powder snow: looks like snow, but you sink into it and slowly freeze. Take it with a bucket. */
block('powder_snow', 'Powder Snow', 'powder_snow', { tool: 'shovel', hardness: 0.25, solid: false, opaque: false, drop: null, powderSnow: true });
/* redstone lamp: lights up bright while it has power */
block('redstone_lamp_0', 'Redstone Lamp', 'rs_lamp_off', { hardness: 0.3, drop: 'redstone_lamp_0', lamp: { on: false } });
block('redstone_lamp_1', 'Redstone Lamp', 'rs_lamp_on', { hardness: 0.3, drop: 'redstone_lamp_0', lamp: { on: true }, light: true, emit: 15 });
/* repeater: power goes in at the back and comes out at the front (the way the arrow points), full strength,
   after a short wait (tap it for 1 to 4 steps of 0.1 seconds) */
for (const dir of ['n', 's', 'w', 'e']) for (let delay = 1; delay <= 4; delay++) for (const on of [0, 1]) {
  const back = [[0.5, 0.625], [0.625, 0.75], [0.75, 0.875], [0.8125, 0.9375]][delay - 1];
  const bxs = [[0, 0, 0, 1, 0.125, 1], [0.4375, 0.125, 0.1875, 0.5625, 0.4375, 0.3125], [0.4375, 0.125, back[0], 0.5625, 0.4375, back[1]]].map(b => SWITCH_ROT(b, dir));
  const k = on ? 'on' : 'off';
  const rp = block('repeater_' + dir + '_' + delay + '_' + on, 'Redstone Repeater', { side: 'rep_side_' + k, top: 'rep_top_' + dir + '_' + k, bottom: 'stone' }, { hardness: 0, solid: false, opaque: false, cutout: true, box: [0, 0, 0, 1, 0.4375, 1], boxes: bxs, drop: 'repeater', repeater: { dir, delay, on: !!on }, iconTile: 'i_repeater' });
  rp.boxFaces = [rp.faces, new Array(6).fill(TILES['rs_torch_top_' + k]), new Array(6).fill(TILES['rs_torch_top_' + k])];
}
/* blocks with a front (furnace, crafting table, jack o'lantern, smoker, blast furnace) turned the other three
   ways, so the front faces you when you place it. The plain block faces south (+z). */
const TURNABLE = ['furnace', 'crafting_table', 'pumpkin', 'smoker', 'blast_furnace'];
for (const k of TURNABLE) {
  const b = DEFS[ID[k]]; b.base = k; b.facing = 's';
  for (const [dir, fi] of [['n', 5], ['e', 0], ['w', 1]]) {
    const v = Object.assign({}, b); delete v.id; delete v.key; delete v.faces; delete v.color;
    const d = block(k + '_' + dir, b.name, 'stone', Object.assign(v, { drop: b.drop !== undefined ? b.drop : k, base: k, facing: dir, iconTile: b.iconTile }));
    d.faces = b.faces.slice(); d.faces[4] = b.faces[0]; d.faces[fi] = b.faces[4]; d.color = b.color;
  }
}
/* smithing table: turns diamond tools and armor into netherite (keeping their enchantments and names) */
block('smithing_table', 'Smithing Table', { top: 'smithing_top', side: 'smithing_side', front: 'smithing_front', bottom: 'planks_dark_oak' }, { tool: 'axe', hardness: 2.5, job: 'toolsmith' });
/* the skull of a wither skeleton: three on a T of soul sand bring out the Wither */
block('wither_skull', 'Wither Skeleton Skull', 'wither_skull', { hardness: 1, solid: false, opaque: false, box: [0.25, 0, 0.25, 0.75, 0.5, 0.75], boxes: [[0.25, 0, 0.25, 0.75, 0.5, 0.75]], iconTile: 'i_wither_skull' });
/* beacon: on a pyramid of iron, gold, diamond, emerald or netherite blocks it shines a beam into the sky and
   gives powers to players nearby. The power it gives is part of the block (so friends see the same) */
for (const fx of ['', 'speed', 'haste', 'resistance', 'jump_boost', 'strength', 'regeneration']) block(fx ? 'beacon_' + fx : 'beacon', 'Beacon', 'beacon', { hardness: 3, opaque: false, light: true, emit: 15, drop: 'beacon', beacon: { effect: fx || null } });
/* ender chest: every one you place opens the same chest, and only you can see what is inside (each player has their own) */
block('ender_chest', 'Ender Chest', { top: 'ender_chest_top', side: 'ender_chest_side', front: 'ender_chest_front' }, PICK(1, 6, { light: true, emit: 7, drop: (r) => [['obsidian', 8]] }));
/* shulker box: a chest you can pick up with everything still inside */
block('shulker_box', 'Shulker Box', { top: 'shulker_top', side: 'shulker_side' }, { tool: 'pick', hardness: 2, drop: null, shulker: true, stack: 1 });
/* shulker boxes in every wool colour (purple is the first one) */
for (const k of Object.keys(SHULKER_COLORS)) block('shulker_box_' + k, k[0].toUpperCase() + k.slice(1) + ' Shulker Box', { top: 'shulker_top_' + k, side: 'shulker_side_' + k }, { tool: 'pick', hardness: 2, drop: null, shulker: true, stack: 1 });
/* a small bed for your dog: when you sleep, your wolf sleeps on it */
block('dog_bed', 'Dog Bed', { top: 'dog_bed_top', side: 'dog_bed_side', bottom: 'planks_oak' }, { tool: 'axe', hardness: 0.3, solid: false, opaque: false, box: [0.0625, 0, 0.0625, 0.9375, 0.25, 0.9375], boxes: [[0.0625, 0, 0.0625, 0.9375, 0.25, 0.9375]], iconTile: 'i_dog_bed' });

/* the new biomes (swamp, mushroom fields, badlands, ice spikes, warm oceans, lush caves, dripstone caves, deep dark) */
block('mycelium', 'Mycelium', { top: 'mycelium_top', side: 'mycelium_side', bottom: 'dirt' }, { tool: 'shovel', hardness: 0.6, drop: 'dirt', colorFace: 2 });
block('red_mushroom_block', 'Red Mushroom Block', 'mushroom_red', { tool: 'axe', hardness: 0.2, drop: (r) => (r() < 0.3 ? [['red_mushroom', 1]] : []) });
block('brown_mushroom_block', 'Brown Mushroom Block', 'mushroom_brown', { tool: 'axe', hardness: 0.2, drop: (r) => (r() < 0.3 ? [['brown_mushroom', 1]] : []) });
block('mushroom_stem', 'Mushroom Stem', 'mushroom_stem', { tool: 'axe', hardness: 0.2, drop: null });
block('red_sand', 'Red Sand', 'red_sand', { tool: 'shovel', hardness: 0.5 });
for (const [k, n] of [['white', 'White'], ['orange', 'Orange'], ['yellow', 'Yellow'], ['red', 'Red'], ['brown', 'Brown'], ['light_gray', 'Light Gray']]) block('terracotta_' + k, n + ' Terracotta', 'tc_' + k, PICK(1, 1.25));
block('packed_ice', 'Packed Ice', 'packed_ice', { hardness: 0.5, drop: null });
block('blue_ice', 'Blue Ice', 'blue_ice', { hardness: 2.8, drop: null });
for (const [k, n] of [['blue_orchid', 'Blue Orchid'], ['allium', 'Allium'], ['tulip_red', 'Red Tulip'], ['tulip_orange', 'Orange Tulip'], ['tulip_pink', 'Pink Tulip'], ['tulip_white', 'White Tulip'], ['oxeye_daisy', 'Oxeye Daisy'], ['cornflower', 'Cornflower'], ['lily_of_the_valley', 'Lily of the Valley'], ['sunflower', 'Sunflower']]) block(k, n, k, CROSS);
block('lily_pad', 'Lily Pad', 'lily_pad', { hardness: 0, solid: true, opaque: false, cutout: true, box: [0, 0, 0, 1, 0.0625, 1], boxes: [[0, 0, 0, 1, 0.0625, 1]], iconTile: 'i_lily_pad' });
for (const [k, n] of [['tube', 'Tube'], ['brain', 'Brain'], ['bubble', 'Bubble'], ['fire', 'Fire'], ['horn', 'Horn']]) block('coral_block_' + k, n + ' Coral Block', 'coral_' + k, PICK(0, 1.5));
block('moss_block', 'Moss Block', 'moss', { tool: 'hoe', hardness: 0.1 });
block('azalea', 'Azalea', 'azalea', CROSS);
block('flowering_azalea', 'Flowering Azalea', 'flowering_azalea', CROSS);
block('cave_vines', 'Glow Berry Vines', 'cave_vines', Object.assign({ light: true, emit: 10, drop: 'glow_berries' }, CROSS));
block('dripstone_block', 'Dripstone Block', 'dripstone', PICK(0, 1.5));
block('pointed_dripstone', 'Pointed Dripstone', 'pointed_dripstone', Object.assign({}, CROSS, { tool: 'pick', hardness: 1.5 }));
block('sculk', 'Sculk', 'sculk', { tool: 'hoe', hardness: 0.2, drop: null, xp: 1 });
block('sculk_sensor', 'Sculk Sensor', { top: 'sculk_sensor_top', side: 'sculk_sensor_side', bottom: 'sculk' }, { tool: 'hoe', hardness: 1.5, opaque: false, light: true, emit: 3, box: [0, 0, 0, 1, 0.5, 1], boxes: [[0, 0, 0, 1, 0.5, 1]] });

/* bees' homes: a wild bee nest on a tree, or a beehive you make. Bees bring honey; when it drips out, use
   shears for honeycomb or a glass bottle for honey. (Each can face four ways, like a furnace.) */
block('bee_nest', 'Bee Nest', { top: 'nest_top', side: 'nest_side', front: 'nest_front' }, { tool: 'axe', hardness: 0.3, drop: null, hive: 'empty' });
block('bee_nest_full', 'Bee Nest', { top: 'nest_top', side: 'nest_side', front: 'nest_front_full' }, { tool: 'axe', hardness: 0.3, drop: null, hive: 'full' });
block('beehive', 'Beehive', { top: 'hive_top', side: 'hive_side', front: 'hive_front' }, { tool: 'axe', hardness: 0.6, drop: 'beehive', hive: 'empty' });
block('beehive_full', 'Beehive', { top: 'hive_top', side: 'hive_side', front: 'hive_front_full' }, { tool: 'axe', hardness: 0.6, drop: 'beehive', hive: 'full' });
for (const k of ['bee_nest', 'bee_nest_full', 'beehive', 'beehive_full']) {
  const b = DEFS[ID[k]]; b.base = k; b.facing = 's';
  for (const [dir, fi] of [['n', 5], ['e', 0], ['w', 1]]) {
    const v = Object.assign({}, b); delete v.id; delete v.key; delete v.faces; delete v.color;
    const d = block(k + '_' + dir, b.name, 'stone', Object.assign(v, { base: k, facing: dir }));
    d.faces = b.faces.slice(); d.faces[4] = b.faces[0]; d.faces[fi] = b.faces[4]; d.color = b.color;
  }
}
block('honey_block', 'Honey Block', 'honey_block', { hardness: 0, opaque: false, translucent: true, sticky: true });
block('honeycomb_block', 'Honeycomb Block', 'honeycomb_block', { hardness: 0.6 });
block('torchflower', 'Torchflower', 'torchflower', CROSS);
block('pitcher_plant', 'Pitcher Plant', 'pitcher_plant', CROSS);
block('froglight', 'Froglight', 'froglight', { hardness: 0.3, light: true, emit: 15 });
block('pale_oak_log', 'Pale Oak Log', { top: 'log_pale_oak_top', side: 'log_pale_oak' }, { tool: 'axe', hardness: 2 });
block('pale_oak_leaves', 'Pale Oak Leaves', 'leaves_pale_oak', Object.assign({ drop: (r) => (r() < 0.08 ? [['stick', 1]] : []) }, LEAVES));
block('pale_oak_planks', 'Pale Oak Planks', 'planks_pale_oak', { tool: 'axe', hardness: 2 });
block('pale_moss_block', 'Pale Moss Block', 'pale_moss', { tool: 'hoe', hardness: 0.1 });
block('creaking_heart', 'Creaking Heart', { top: 'log_pale_oak_top', side: 'log_pale_oak', front: 'creaking_heart' }, { tool: 'axe', hardness: 10, light: true, emit: 6, creakingHeart: true });
block('campfire', 'Campfire', { top: 'campfire_top', side: 'campfire_side', bottom: 'planks_oak' }, { tool: 'axe', hardness: 2, opaque: false, cutout: true, solid: false, light: true, emit: 15, box: [0, 0, 0, 1, 0.4375, 1], boxes: [[0, 0, 0, 1, 0.4375, 1]], iconTile: 'i_campfire', drop: (r) => [['coal', 2]] });
block('turtle_egg', 'Turtle Egg', 'turtle_egg', { hardness: 0.5, opaque: false, solid: false, box: [0.25, 0, 0.25, 0.75, 0.45, 0.75], boxes: [[0.2, 0, 0.3, 0.5, 0.4, 0.6], [0.55, 0, 0.45, 0.8, 0.35, 0.75]], iconTile: 'i_turtle_egg', drop: null });
/* ================= building blocks round ================= */
const PK = (h, extra) => Object.assign({ tool: 'pick', tier: 1, hardness: h || 1.5 }, extra || {});
for (const k of ['granite', 'polished_granite', 'diorite', 'polished_diorite', 'andesite', 'polished_andesite', 'tuff', 'polished_tuff', 'tuff_bricks', 'calcite', 'smooth_stone', 'chiseled_stone_bricks', 'cracked_stone_bricks', 'mossy_stone_bricks', 'polished_deepslate', 'deepslate_bricks', 'deepslate_tiles', 'chiseled_deepslate', 'polished_blackstone', 'polished_blackstone_bricks', 'smooth_basalt', 'mud_bricks', 'smooth_sandstone', 'cut_sandstone', 'chiseled_sandstone', 'end_stone_bricks', 'purpur_block', 'prismarine', 'prismarine_bricks', 'dark_prismarine', 'quartz_bricks', 'chiseled_quartz', 'smooth_quartz', 'red_nether_bricks', 'cracked_nether_bricks', 'chiseled_nether_bricks'])
  block(k, k.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ').replace('Purpur Block', 'Purpur Block'), k, PK());
block('gilded_blackstone', 'Gilded Blackstone', 'gilded_blackstone', PK(1.5, { drop: (r) => (r() < 0.05 ? [['gold_ingot', 1]] : [['gilded_blackstone', 1]]) }));
block('mud', 'Mud', 'mud', { tool: 'shovel', hardness: 0.5, sink: true });
block('packed_mud', 'Packed Mud', 'packed_mud', { tool: 'pick', hardness: 1 });
block('red_sandstone', 'Red Sandstone', { top: 'red_sandstone_top', side: 'red_sandstone' }, PK(0.8));
block('purpur_pillar', 'Purpur Pillar', { top: 'purpur_block', side: 'purpur_pillar' }, PK());
block('quartz_pillar', 'Quartz Pillar', { top: 'smooth_quartz', side: 'quartz_pillar' }, PK(0.8));
block('sea_lantern', 'Sea Lantern', 'sea_lantern', { hardness: 0.3, light: true, emit: 15, drop: (r) => [['prismarine_crystals', 2 + (r() * 2 | 0)]] });
block('crying_obsidian', 'Crying Obsidian', 'crying_obsidian', PICK(4, 50, { light: true, emit: 10 }));
block('soul_soil', 'Soul Soil', 'soul_soil', { tool: 'shovel', hardness: 0.5 });
block('bone_block', 'Bone Block', { top: 'bone_block_top', side: 'bone_block_side' }, PK(2));
block('dried_kelp_block', 'Dried Kelp Block', 'dried_kelp_block', { hardness: 0.5 });
block('sponge', 'Sponge', 'sponge', { hardness: 0.6, sponge: true });
block('wet_sponge', 'Wet Sponge', 'wet_sponge', { hardness: 0.6 });
block('tinted_glass', 'Tinted Glass', 'tinted_glass', { opaque: false, cutout: true, hardness: 0.3, glassy: true });
block('amethyst_block', 'Block of Amethyst', 'amethyst_block', PK(1.5));
block('budding_amethyst', 'Budding Amethyst', 'budding_amethyst', PK(1.5, { drop: null }));
block('amethyst_cluster', 'Amethyst Cluster', 'amethyst_cluster', Object.assign({}, CROSS, { tool: 'pick', hardness: 1.5, light: true, emit: 5, drop: (r) => [['amethyst_shard', 4]] }));
block('copper_ore', 'Copper Ore', 'copper_ore', PICK(1, 3, { drop: (r) => [['raw_copper', 2 + (r() * 3 | 0)]], xp: 1 }));
block('deepslate_copper_ore', 'Deepslate Copper Ore', 'deepslate_copper_ore', PICK(1, 4.5, { drop: (r) => [['raw_copper', 2 + (r() * 3 | 0)]], xp: 1 }));
COPPER.forEach(([p, n], age) => { block(p + 'copper_block', n === 'Copper' ? 'Block of Copper' : n, p + 'copper_block', PK(3, { copper: age, copperKind: 'copper_block' })); block(p + 'cut_copper', (n === 'Copper' ? '' : n.replace(' Copper', '') + ' ') + 'Cut Copper', p + 'cut_copper', PK(3, { copper: age, copperKind: 'cut_copper' })); });
block('iron_bars', 'Iron Bars', 'iron_bars', PK(5, { opaque: false, cutout: true, pane: true, iconTile: 'iron_bars' }));
block('chain', 'Chain', 'chain', PK(5, { opaque: false, cutout: true, solid: true, box: [0.4375, 0, 0.4375, 0.5625, 1, 0.5625], boxes: [[0.4375, 0, 0.4375, 0.5625, 1, 0.5625]], iconTile: 'i_chain' }));
block('cobweb', 'Cobweb', 'cobweb', Object.assign({}, CROSS, { hardness: 4, tool: 'sword', web: true, drop: (r) => [] }));
const VINE_BOX = { w: [0, 0, 0, 0.0625, 1, 1], e: [0.9375, 0, 0, 1, 1, 1], n: [0, 0, 0, 1, 1, 0.0625], s: [0, 0, 0.9375, 1, 1, 1] };
for (const d of ['n', 's', 'w', 'e']) block('vine_' + d, 'Vines', 'vine', { hardness: 0.2, opaque: false, cutout: true, solid: false, box: VINE_BOX[d], ladder: d, drop: 'vine', replaceable: true, iconTile: 'i_vine' });
block('kelp', 'Kelp', 'kelp', Object.assign({}, CROSS, { wlog: true, drop: 'kelp' }));
block('seagrass', 'Seagrass', 'seagrass', Object.assign({}, CROSS, { wlog: true, drop: null }));
block('sea_pickle', 'Sea Pickle', 'sea_pickle', Object.assign({}, CROSS, { wlog: true, light: true, emit: 9, iconTile: 'i_sea_pickle' }));
for (const [k, n] of [['tube', 'Tube'], ['brain', 'Brain'], ['bubble', 'Bubble'], ['fire', 'Fire'], ['horn', 'Horn']]) { block('coral_' + k, n + ' Coral', 'coral_plant_' + k, Object.assign({}, CROSS, { wlog: true })); block('coral_fan_' + k, n + ' Coral Fan', 'coral_fan_' + k, Object.assign({}, CROSS, { wlog: true })); }
block('sweet_berry_bush', 'Sweet Berry Bush', 'sweet_berry_bush', Object.assign({}, CROSS, { berry: 0, drop: 'sweet_berries', iconTile: 'i_sweet_berries' }));
block('sweet_berry_bush_ripe', 'Sweet Berry Bush', 'sweet_berry_bush_ripe', Object.assign({}, CROSS, { berry: 1, drop: (r) => [['sweet_berries', 2 + (r() * 2 | 0)]] }));
block('snow_layer', 'Snow', 'snow_layer', { tool: 'shovel', hardness: 0.1, opaque: false, box: [0, 0, 0, 1, 0.125, 1], boxes: [[0, 0, 0, 1, 0.125, 1]], replaceable: true, drop: 'snowball', iconTile: 'i_snow_layer' });
block('soul_torch', 'Soul Torch', 'soul_torch', { hardness: 0, solid: false, opaque: false, cutout: true, box: [0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625], light: true, emit: 10, iconTile: 'i_soul_torch' });
block('soul_lantern', 'Soul Lantern', { side: 'soul_lantern', top: 'lantern_top', bottom: 'lantern_top' }, { hardness: 1, opaque: false, cutout: true, box: [0.3125, 0, 0.3125, 0.6875, 0.5625, 0.6875], boxes: [[0.3125, 0, 0.3125, 0.6875, 0.5625, 0.6875]], light: true, emit: 10, iconTile: 'i_soul_lantern' });
block('end_rod', 'End Rod', 'end_rod', { hardness: 0, solid: false, opaque: false, cutout: true, box: [0.4375, 0, 0.4375, 0.5625, 1, 0.5625], light: true, emit: 14, iconTile: 'end_rod' });
// sixteen colours of wool, carpet, stained glass, terracotta, concrete, concrete powder and glazed terracotta
for (const [k, n] of COLORS16) {
  if (!OLD_WOOL.includes(k)) {
    block('wool_' + k, n + ' Wool', 'wool_' + k, { hardness: 0.8 });
    block('stained_glass_' + k, n + ' Stained Glass', 'stained_glass_' + k, { opaque: false, translucent: true, hardness: 0.3, glassy: true });
    block('stained_glass_pane_' + k, n + ' Stained Glass Pane', 'stained_glass_' + k, { opaque: false, translucent: true, hardness: 0.3, pane: true, iconTile: 'stained_glass_' + k });
  }
  if (!OLD_TC.includes(k)) block('terracotta_' + k, n + ' Terracotta', 'tc_' + k, PICK(1, 1.25));
  block('carpet_' + k, n + ' Carpet', 'wool_' + k, { hardness: 0.1, opaque: false, box: [0, 0, 0, 1, 0.0625, 1], boxes: [[0, 0, 0, 1, 0.0625, 1]] });
  block('concrete_' + k, n + ' Concrete', 'concrete_' + k, PK(1.8));
  block('concrete_powder_' + k, n + ' Concrete Powder', 'concrete_powder_' + k, { tool: 'shovel', hardness: 0.5, powder: 'concrete_' + k, falls: true });
  block('glazed_terracotta_' + k, n + ' Glazed Terracotta', 'glazed_' + k, PICK(1, 1.4));
}
// slabs, stairs and walls for the new stones
const NEW_SHAPES = [
  ['granite', 'Granite'], ['polished_granite', 'Polished Granite'], ['diorite', 'Diorite'], ['polished_diorite', 'Polished Diorite'], ['andesite', 'Andesite'], ['polished_andesite', 'Polished Andesite'],
  ['tuff', 'Tuff'], ['polished_tuff', 'Polished Tuff'], ['tuff_bricks', 'Tuff Brick'], ['cobbled_deepslate', 'Cobbled Deepslate'], ['polished_deepslate', 'Polished Deepslate'], ['deepslate_bricks', 'Deepslate Brick'], ['deepslate_tiles', 'Deepslate Tile'],
  ['polished_blackstone', 'Polished Blackstone'], ['polished_blackstone_bricks', 'Polished Blackstone Brick'], ['mud_bricks', 'Mud Brick'], ['red_sandstone', 'Red Sandstone'], ['smooth_sandstone', 'Smooth Sandstone'], ['smooth_stone', 'Smooth Stone'],
  ['end_stone_bricks', 'End Stone Brick'], ['purpur_block', 'Purpur'], ['prismarine', 'Prismarine'], ['prismarine_bricks', 'Prismarine Brick'], ['dark_prismarine', 'Dark Prismarine'],
  ['mossy_cobblestone', 'Mossy Cobblestone'], ['mossy_stone_bricks', 'Mossy Stone Brick'], ['red_nether_bricks', 'Red Nether Brick'], ['smooth_quartz', 'Smooth Quartz'], ['cut_copper', 'Cut Copper'], ['birch_planks', 'Birch'], ['spruce_planks', 'Spruce'], ['cherry_planks', 'Cherry'], ['mangrove_planks', 'Mangrove'], ['bamboo_planks', 'Bamboo'], ['pale_oak_planks', 'Pale Oak'], ['crimson_planks', 'Crimson'], ['warped_planks', 'Warped'],
];
const NS = []; // the shapes really made (some woods already had stairs)
for (const [full, n] of NEW_SHAPES) {
  const f = DEFS[ID[full]]; if (!f) continue;
  const k = 'x_' + full; NS.push([k, n, full]);
  for (const half of ['b', 't']) { const d = block(k + '_slab_' + half, n + ' Slab', 'stone', { tool: f.tool, tier: f.tool === 'pick' ? 1 : 0, hardness: 2, opaque: false, boxes: [half === 'b' ? [0, 0, 0, 1, 0.5, 1] : [0, 0.5, 0, 1, 1, 1]], drop: k + '_slab', slab: k, slabFull: full, slabHalf: half }); d.faces = f.faces.slice(); d.color = f.color; }
  for (const dd of ['n', 's', 'w', 'e']) { const d = block(k + '_stairs_' + dd, n + ' Stairs', 'stone', { tool: f.tool, tier: f.tool === 'pick' ? 1 : 0, hardness: 2, opaque: false, boxes: [[0, 0, 0, 1, 0.5, 1], STAIR_UP[dd]], drop: k + '_stairs', stair: k }); d.faces = f.faces.slice(); d.color = f.color; }
}
const WALLS = [['cobblestone', 'Cobblestone'], ['mossy_cobblestone', 'Mossy Cobblestone'], ['stone_bricks', 'Stone Brick'], ['mossy_stone_bricks', 'Mossy Stone Brick'], ['granite', 'Granite'], ['diorite', 'Diorite'], ['andesite', 'Andesite'], ['sandstone', 'Sandstone'], ['red_sandstone', 'Red Sandstone'], ['bricks', 'Brick'], ['cobbled_deepslate', 'Cobbled Deepslate'], ['deepslate_bricks', 'Deepslate Brick'], ['deepslate_tiles', 'Deepslate Tile'], ['blackstone', 'Blackstone'], ['polished_blackstone_bricks', 'Polished Blackstone Brick'], ['nether_bricks', 'Nether Brick'], ['red_nether_bricks', 'Red Nether Brick'], ['mud_bricks', 'Mud Brick'], ['end_stone_bricks', 'End Stone Brick'], ['prismarine', 'Prismarine'], ['tuff', 'Tuff'], ['tuff_bricks', 'Tuff Brick']];
for (const [full, n] of WALLS) { const f = DEFS[ID[full]]; if (!f) continue; const d = block(full + '_wall', n + ' Wall', 'stone', { tool: 'pick', tier: 1, hardness: 2, opaque: false, fence: true, wall: true, iconTile: 'i_wall' }); d.faces = f.faces.slice(); d.color = f.color; }

/* ================= machines and working blocks ================= */
const FI6 = { e: 0, w: 1, u: 2, d: 3, s: 4, n: 5 }, OPP6 = { e: 'w', w: 'e', u: 'd', d: 'u', s: 'n', n: 's' };
const DIR6 = { e: [1, 0, 0], w: [-1, 0, 0], u: [0, 1, 0], d: [0, -1, 0], s: [0, 0, 1], n: [0, 0, -1] };
/* a box from 'a' to 'b' of the way along a direction (0 = the back, 1 = the front), across the whole face or thin like a rod */
function boxAlong(dir, a, b, thin) {
  const lo = thin ? 0.375 : 0, hi = thin ? 0.625 : 1, v = DIR6[dir], out = [lo, lo, lo, hi, hi, hi];
  for (let i = 0; i < 3; i++) if (v[i]) { if (v[i] > 0) { out[i] = a; out[i + 3] = b; } else { out[i] = 1 - b; out[i + 3] = 1 - a; } }
  return out;
}
const TILES_AVG_OF = k => TILE_AVG[TILES[k]];
const faces6 = (dir, front, back, side) => { const f = [side, side, side, side, side, side]; f[FI6[dir]] = TILES[front]; f[FI6[OPP6[dir]]] = TILES[back]; return f; };
block('barrel', 'Barrel', { top: 'barrel_top', side: 'barrel_side', bottom: 'barrel_top' }, { tool: 'axe', hardness: 2.5, container: true });
block('stonecutter', 'Stonecutter', { top: 'stonecutter_top', side: 'stonecutter_side', bottom: 'furnace_top' }, PK(3.5, { opaque: false, box: [0, 0, 0, 1, 0.5625, 1], boxes: [[0, 0, 0, 1, 0.5625, 1]], station: 'stonecutter' }));
for (const k of ['empty', 'water', 'lava']) block(k === 'empty' ? 'cauldron' : k + '_cauldron', k === 'lava' ? 'Lava Cauldron' : k === 'water' ? 'Water Cauldron' : 'Cauldron', { top: 'cauldron_top_' + k, side: 'cauldron_side', bottom: 'cauldron_side' }, PK(2, { cauldron: k, drop: 'cauldron', light: k === 'lava', emit: k === 'lava' ? 15 : undefined, hide: k !== 'empty' }));
block('brewing_stand', 'Brewing Stand', 'brewing_stand', Object.assign({}, CROSS, { tool: 'pick', hardness: 0.5, station: 'brewing', light: true, emit: 1, iconTile: 'i_brewing_stand' }));
block('jukebox', 'Jukebox', { top: 'jukebox_top', side: 'jukebox_side' }, { tool: 'axe', hardness: 2, jukebox: true });
block('note_block', 'Note Block', 'note_block', { tool: 'axe', hardness: 0.8, machine: 'note' });
for (const d of ['d', 'n', 's', 'e', 'w']) block('hopper' + (d === 'd' ? '' : '_' + d), 'Hopper', { top: 'hopper_top', side: 'hopper_side', bottom: 'hopper_side' }, PK(3, { opaque: false, boxes: [[0, 0.625, 0, 1, 1, 1], [0.25, 0.25, 0.25, 0.75, 0.625, 0.75], [0.375, 0, 0.375, 0.625, 0.25, 0.625]], hopper: d, hide: d !== 'd', drop: 'hopper', iconTile: 'i_hopper' }));
for (const kind of ['dispenser', 'dropper']) for (const d of ['n', 's', 'e', 'w', 'u', 'd']) { const b = block(kind + '_' + d, kind[0].toUpperCase() + kind.slice(1), 'stone', PK(3.5, { container: true, machine: kind, facing6: d, drop: kind + '_s', hide: d !== 's', facePlace: kind })); b.faces = faces6(d, kind + '_front', 'furnace_top', TILES.furnace_side); b.color = DEFS[ID.furnace].color; }
for (const sticky of [false, true]) for (const d of ['n', 's', 'e', 'w', 'u', 'd']) {
  const kind = sticky ? 'sticky_piston' : 'piston', name = sticky ? 'Sticky Piston' : 'Piston', top = sticky ? 'piston_top_sticky' : 'piston_top';
  let b = block(kind + '_' + d, name, 'stone', { tool: 'pick', hardness: 1.5, machine: 'piston', piston: { d, sticky, ext: false }, drop: kind + '_n', hide: d !== 'n', facePlace: kind }); b.faces = faces6(d, top, 'piston_bottom', TILES.piston_side); b.color = TILES_AVG_OF('piston_side');
  b = block(kind + '_' + d + '_x', name, 'stone', { tool: 'pick', hardness: 1.5, opaque: false, machine: 'piston', piston: { d, sticky, ext: true }, boxes: [boxAlong(d, 0, 0.75)], drop: kind + '_n', hide: true, noPush: true }); b.faces = faces6(d, 'piston_inner', 'piston_bottom', TILES.piston_side); b.color = TILES_AVG_OF('piston_side');
  b = block(kind + '_head_' + d, name + ' Head', 'stone', { tool: 'pick', hardness: 1.5, opaque: false, pistonHead: { d, sticky }, boxes: [boxAlong(d, 0.75, 1), boxAlong(d, 0, 0.75, true)], drop: null, hide: true, noPush: true }); b.faces = faces6(d, top, top, TILES.piston_side); b.color = TILES_AVG_OF('piston_side');
}
for (const d of ['n', 's', 'e', 'w', 'u', 'd']) for (const on of [0, 1]) { const b = block('observer_' + d + '_' + on, 'Observer', 'stone', PK(3, { observer: { d, on: !!on }, drop: 'observer_n_0', hide: !(d === 'n' && !on), facePlace: 'observer' })); b.faces = faces6(d, 'observer_face', on ? 'observer_back_on' : 'observer_back', TILES.observer_side); b.color = TILES_AVG_OF('observer_side'); }
for (const on of [0, 1]) block('daylight_detector_' + on, 'Daylight Detector', { top: 'daylight_top', side: 'barrel_top', bottom: 'barrel_top' }, { tool: 'axe', hardness: 0.2, opaque: false, box: [0, 0, 0, 1, 0.375, 1], boxes: [[0, 0, 0, 1, 0.375, 1]], daylight: { on: !!on }, drop: 'daylight_detector_0', hide: !!on });
for (const on of [0, 1]) block('target_' + on, 'Target', { top: 'target_top', side: 'target_side' }, { hardness: 0.5, target: { on: !!on }, drop: 'target_0', hide: !!on });
// like Minecraft: a smooth stone slab with two redstone torches at the back and a small one at the front
for (const d of ['n', 's', 'w', 'e']) for (const on of [0, 1]) {
  const k = on ? 'on' : 'off';
  const bxs = [[0, 0, 0, 1, 0.125, 1], [0.1875, 0.125, 0.6875, 0.3125, 0.4375, 0.8125], [0.6875, 0.125, 0.6875, 0.8125, 0.4375, 0.8125], [0.4375, 0.125, 0.125, 0.5625, 0.3125, 0.25]].map(b => SWITCH_ROT(b, d));
  const cp = block('comparator_' + d + '_' + on, 'Redstone Comparator', { top: 'rep_top_' + d + '_' + k, side: 'rep_side_' + k, bottom: 'stone' }, { hardness: 0, solid: false, opaque: false, cutout: true, box: [0, 0, 0, 1, 0.4375, 1], boxes: bxs, comparator: { dir: d, on: !!on }, drop: 'comparator', iconTile: 'i_comparator', hide: true });
  const tt = new Array(6).fill(TILES['rs_torch_top_' + k]);
  cp.boxFaces = [cp.faces, tt, tt, tt];
}
block('scaffolding', 'Scaffolding', { top: 'scaffolding_top', side: 'scaffolding_side' }, { hardness: 0, opaque: false, cutout: true, boxes: [[0, 0.875, 0, 1, 1, 1]], ladder: 'u', scaffold: true, iconTile: 'i_scaffolding' });
for (const d of ['n', 's', 'w', 'e']) block('item_frame_' + d, 'Item Frame', 'item_frame', { hardness: 0.3, opaque: false, solid: false, box: { w: [0, 0.125, 0.125, 0.0625, 0.875, 0.875], e: [0.9375, 0.125, 0.125, 1, 0.875, 0.875], n: [0.125, 0.125, 0, 0.875, 0.875, 0.0625], s: [0.125, 0.125, 0.9375, 0.875, 0.875, 1] }[d], frame: d, drop: 'item_frame', iconTile: 'i_item_frame', hide: true });
for (const lit of [0, 1]) block('candle' + (lit ? '_lit' : ''), 'Candle', lit ? 'candle_lit' : 'candle', { hardness: 0.1, opaque: false, cutout: true, solid: false, box: [0.375, 0, 0.375, 0.625, 0.5, 0.625], candle: !!lit, light: !!lit, emit: lit ? 6 : undefined, drop: 'candle', iconTile: 'i_candle', hide: !!lit });
for (let c = 0; c <= 4; c++) block('respawn_anchor_' + c, 'Respawn Anchor', { top: c ? 'anchor_top_on' : 'anchor_top', side: 'anchor_side', bottom: 'anchor_top' }, PICK(4, 50, { anchor: c, light: c > 0, emit: c ? 3 + c * 3 : undefined, drop: 'respawn_anchor_0', hide: c > 0 }));

block('chorus_plant', 'Chorus Plant', 'chorus_plant', { hardness: 0.4, opaque: false, boxes: [[0.1875, 0, 0.1875, 0.8125, 1, 0.8125]], drop: (r) => (r() < 0.5 ? [['chorus_fruit', 1]] : []) });
block('chorus_flower', 'Chorus Flower', 'chorus_flower', { hardness: 0.4, opaque: false, boxes: [[0.125, 0, 0.125, 0.875, 0.875, 0.875]] });
block('end_gateway', 'End Gateway', 'end_portal', { solid: false, opaque: false, hardness: -1, drop: null, light: true, emit: 15, gateway: true, hide: true });
block('trial_spawner', 'Trial Spawner', 'trial_spawner', { hardness: 50, tool: 'pick', tier: 3, opaque: false, cutout: true, light: true, emit: 8, trial: true, drop: null });
block('trial_spawner_done', 'Trial Spawner', 'trial_spawner_done', { hardness: 50, tool: 'pick', tier: 3, opaque: false, cutout: true, trialDone: true, drop: null, hide: true });
block('vault', 'Vault', { top: 'heavy_core', side: 'vault_side' }, { hardness: 50, tool: 'pick', tier: 3, vault: true, light: true, emit: 6, drop: null });
block('vault_open', 'Vault', { top: 'heavy_core', side: 'vault_open' }, { hardness: 50, tool: 'pick', tier: 3, drop: null, hide: true });
block('heavy_core', 'Heavy Core', 'heavy_core', { hardness: 10, tool: 'pick', opaque: false, box: [0.25, 0, 0.25, 0.75, 0.5, 0.75], boxes: [[0.25, 0, 0.25, 0.75, 0.5, 0.75]] });
block('suspicious_sand', 'Suspicious Sand', 'suspicious_sand', { tool: 'shovel', hardness: 0.25, sus: 'sand', drop: null });
block('suspicious_gravel', 'Suspicious Gravel', 'suspicious_gravel', { tool: 'shovel', hardness: 0.25, sus: 'gravel', drop: null });
block('sniffer_egg', 'Sniffer Egg', 'sniffer_egg', { hardness: 0.5, opaque: false, box: [0.1875, 0, 0.1875, 0.8125, 0.75, 0.8125], boxes: [[0.1875, 0, 0.1875, 0.8125, 0.75, 0.8125]] });
block('reinforced_deepslate', 'Reinforced Deepslate', { top: 'reinforced_deepslate', side: 'reinforced_deepslate' }, { hardness: Infinity, drop: null });
block('sculk_shrieker', 'Sculk Shrieker', { top: 'shrieker_top', side: 'shrieker_side', bottom: 'sculk' }, { tool: 'hoe', hardness: 3, opaque: false, box: [0, 0, 0, 1, 0.5, 1], boxes: [[0, 0, 0, 1, 0.5, 1]], shrieker: true, drop: null });
block('decorated_pot', 'Decorated Pot', 'decorated_pot', { hardness: 0.1, opaque: false, box: [0.0625, 0, 0.0625, 0.9375, 1, 0.9375], boxes: [[0.0625, 0, 0.0625, 0.9375, 1, 0.9375]] });
/* rails: the shape joins up with the rails next to it; 'a' + a side = going up that way */
const RAIL_BOX = [[0, 0, 0, 1, 0.0625, 1]], RAIL_UP = { an: [[0, 0, 0.5, 1, 0.0625, 1], [0, 0.5, 0, 1, 0.5625, 0.5]], as: [[0, 0, 0, 1, 0.0625, 0.5], [0, 0.5, 0.5, 1, 0.5625, 1]], ae: [[0, 0, 0, 0.5, 0.0625, 1], [0.5, 0.5, 0, 1, 0.5625, 1]], aw: [[0.5, 0, 0, 1, 0.0625, 1], [0, 0.5, 0, 0.5, 0.5625, 1]] };
for (const sh of ['ns', 'ew', 'ne', 'nw', 'se', 'sw', 'an', 'as', 'ae', 'aw']) {
  const tile = sh[0] === 'a' ? (sh === 'an' || sh === 'as' ? 'rail_ns' : 'rail_ew') : 'rail_' + sh;
  block('rail_' + sh, 'Rail', tile, { hardness: 0.7, solid: false, opaque: false, cutout: true, boxes: RAIL_UP[sh] || RAIL_BOX, rail: { shape: sh, kind: 'rail' }, drop: 'rail', iconTile: 'i_rail', hide: true });
}
for (const sh of ['ns', 'ew', 'an', 'as', 'ae', 'aw']) for (const on of [0, 1]) {
  const ax = sh === 'ns' || sh === 'an' || sh === 'as' ? 'ns' : 'ew';
  block('prail_' + sh + '_' + on, 'Powered Rail', 'prail_' + ax + '_' + on, { hardness: 0.7, solid: false, opaque: false, cutout: true, boxes: RAIL_UP[sh] || RAIL_BOX, rail: { shape: sh, kind: 'powered', on: !!on }, drop: 'powered_rail', iconTile: 'i_powered_rail', hide: true, light: !!on, emit: on ? 3 : undefined });
}
for (const sh of ['ns', 'ew']) for (const on of [0, 1]) block('drail_' + sh + '_' + on, 'Detector Rail', 'drail_' + sh, { hardness: 0.7, solid: false, opaque: false, cutout: true, boxes: RAIL_BOX, rail: { shape: sh, kind: 'detector', on: !!on }, drop: 'detector_rail', iconTile: 'i_detector_rail', hide: true });
/* flowing water and lava: level 1 is next to the source, 7 the furthest; 'fall' pours straight down */
for (const F of ['water', 'lava']) for (const lv of [1, 2, 3, 4, 5, 6, 7, 8]) block(F + '_' + (lv === 8 ? 'fall' : lv), F === 'water' ? 'Water' : 'Lava', F, F === 'water' ? { solid: false, opaque: false, translucent: true, liquid: true, hardness: Infinity, fluid: F, level: lv, drop: null, hide: true } : { solid: false, opaque: false, liquid: true, hardness: Infinity, light: true, fluid: F, level: lv, drop: null, hide: true });
Object.assign(DEFS[ID.water], { fluid: 'water', level: 0 }); Object.assign(DEFS[ID.lava], { fluid: 'lava', level: 0 });
block('soul_fire', 'Soul Fire', 'soul_fire', { solid: false, opaque: false, cutout: true, cross: true, hardness: 0, drop: null, replaceable: true, light: true, emit: 10, burns: true, hide: true });
let nextItemId = 128;
function item(key, name, tile, o = {}) {
  if (nextItemId === 512) nextItemId = 4096; // 512 and up are blocks, so more items go to 4096 and up
  const id = nextItemId++;
  const def = Object.assign({ id, key, name, isBlock: false, tile: TILES['i_' + tile], stack: 64 }, o);
  if (def.tile === undefined) throw new Error('missing item tile ' + tile);
  def.color = TILE_AVG[def.tile];
  DEFS[id] = def; ID[key] = id;
  return def;
}
item('stick', 'Stick', 'stick');
item('coal', 'Coal', 'coal');
item('iron_ingot', 'Iron Ingot', 'iron_ingot');
item('gold_ingot', 'Gold Ingot', 'gold_ingot');
item('diamond', 'Diamond', 'diamond');
item('emerald', 'Emerald', 'emerald');
item('redstone', 'Redstone Dust', 'redstone');
item('lapis', 'Lapis Lazuli', 'lapis');
item('flint', 'Flint', 'flint');
item('string', 'String', 'string');
item('feather', 'Feather', 'feather');
item('gunpowder', 'Gunpowder', 'gunpowder');
item('bone', 'Bone', 'bone');
item('leather', 'Leather', 'leather');
item('rotten_flesh', 'Rotten Flesh', 'rotten_flesh', { food: 3 });
item('porkchop', 'Raw Porkchop', 'porkchop', { food: 3 });
item('cooked_porkchop', 'Cooked Porkchop', 'cooked_porkchop', { food: 8 });
item('beef', 'Raw Beef', 'beef', { food: 3 });
item('steak', 'Steak', 'steak', { food: 8 });
item('chicken', 'Raw Chicken', 'chicken', { food: 2 });
item('cooked_chicken', 'Cooked Chicken', 'cooked_chicken', { food: 6 });
item('apple', 'Apple', 'apple', { food: 4 });
item('golden_apple', 'Golden Apple', 'golden_apple', { food: 4, heal: 12 });
item('melon_slice', 'Melon Slice', 'melon_slice', { food: 2 });
item('ender_pearl', 'Ender Pearl', 'ender_pearl', { stack: 16 });
item('bow', 'Bow', 'bow', { stack: 1 });
item('arrow', 'Arrow', 'arrow');
item('flint_and_steel', 'Flint and Steel', 'flint_and_steel', { stack: 1 });
const TOOL_MATS = [
  ['wooden', 'Wooden', 1, 2, 4], ['stone', 'Stone', 2, 4, 5], ['iron', 'Iron', 3, 6, 6],
  ['golden', 'Golden', 1, 12, 4], ['diamond', 'Diamond', 4, 8, 8],
];
for (const [k, n, tier, speed, dmg] of TOOL_MATS) {
  item(k + '_pickaxe', n + ' Pickaxe', k + '_pickaxe', { stack: 1, tool: { type: 'pick', tier, speed }, damage: dmg - 2 });
  item(k + '_sword', n + ' Sword', k + '_sword', { stack: 1, damage: dmg });
}
item('quartz', 'Nether Quartz', 'quartz');
item('blaze_rod', 'Blaze Rod', 'blaze_rod');
item('ghast_tear', 'Ghast Tear', 'ghast_tear');
for (const [k, n, , pts] of ARMOR_MATS) ARMOR_PIECES.forEach(([piece, pn], slot) => item(k + '_' + piece, n + ' ' + pn, k + '_' + piece, { stack: 1, armor: { slot, points: pts[slot] } }));
for (const [k, n, tier, speed, dmg] of TOOL_MATS) {
  item(k + '_shovel', n + ' Shovel', k + '_shovel', { stack: 1, tool: { type: 'shovel', tier, speed }, damage: dmg - 3 });
  item(k + '_axe', n + ' Axe', k + '_axe', { stack: 1, tool: { type: 'axe', tier, speed }, damage: dmg + 1 });
}

item('blaze_powder', 'Blaze Powder', 'blaze_powder');
item('eye_of_ender', 'Eye of Ender', 'eye_of_ender', { stack: 16 });
item('wheat', 'Wheat', 'wheat');
item('wheat_seeds', 'Wheat Seeds', 'wheat_seeds');
item('carrot', 'Carrot', 'carrot', { food: 3 });
item('potato', 'Potato', 'potato', { food: 1 });
item('baked_potato', 'Baked Potato', 'baked_potato', { food: 5 });
item('pumpkin_seeds', 'Pumpkin Seeds', 'pumpkin_seeds');
item('oak_door', 'Oak Door', 'oak_door');
for (const [k, n] of [['oak', 'Oak'], ['cobblestone', 'Cobblestone'], ['stone_brick', 'Stone Brick']]) item(k + '_stairs', n + ' Stairs', k + '_stairs', { placesStair: k });
item('oak_trapdoor', 'Oak Trapdoor', 'oak_trapdoor');
item('oak_fence_gate', 'Oak Fence Gate', 'oak_fence_gate', { placesGate: true });
item('oak_sign', 'Oak Sign', 'oak_sign', { stack: 16, placesSign: true });
item('ladder', 'Ladder', 'ladder_icon', { placesLadder: true });
item('bucket', 'Bucket', 'bucket', { stack: 16 });
item('water_bucket', 'Water Bucket', 'water_bucket', { stack: 1 });
item('lava_bucket', 'Lava Bucket', 'lava_bucket', { stack: 1 });
item('milk_bucket', 'Milk Bucket', 'milk_bucket', { stack: 1 });
for (const [k, n, tier, speed, dmg] of TOOL_MATS) item(k + '_hoe', n + ' Hoe', k + '_hoe', { stack: 1, tool: { type: 'hoe', tier, speed }, damage: 1 });
item('bread', 'Bread', 'bread', { food: 5 });
/* NEW ITEMS GO HERE, AT THE END (same reason as blocks) */
item('boat', 'Boat', 'boat', { stack: 1, placesBoat: true });
item('lead', 'Rope', 'lead');
const HORSE_ARMOR = {
  leather_horse_armor: { name: 'Leather Horse Armor', pts: 3, color: 0xa0663c },
  iron_horse_armor: { name: 'Iron Horse Armor', pts: 5, color: 0xd8d8d8 },
  golden_horse_armor: { name: 'Golden Horse Armor', pts: 7, color: 0xf5cc2e },
  diamond_horse_armor: { name: 'Diamond Horse Armor', pts: 11, color: 0x5fe0d8 },
};
const HORSE_ARMOR_KEYS = Object.keys(HORSE_ARMOR);
for (const k of HORSE_ARMOR_KEYS) item(k, HORSE_ARMOR[k].name, k, { stack: 1, horseArmor: HORSE_ARMOR[k].pts });
item('netherite_scrap', 'Netherite Scrap', 'netherite_scrap');
item('netherite_ingot', 'Netherite Ingot', 'netherite_ingot');
item('netherite_pickaxe', 'Netherite Pickaxe', 'netherite_pickaxe', { stack: 1, tool: { type: 'pick', tier: 5, speed: 10 }, damage: 6 });
item('netherite_sword', 'Netherite Sword', 'netherite_sword', { stack: 1, damage: 10 });
item('netherite_shovel', 'Netherite Shovel', 'netherite_shovel', { stack: 1, tool: { type: 'shovel', tier: 5, speed: 10 }, damage: 5 });
item('netherite_axe', 'Netherite Axe', 'netherite_axe', { stack: 1, tool: { type: 'axe', tier: 5, speed: 10 }, damage: 10 });
item('netherite_hoe', 'Netherite Hoe', 'netherite_hoe', { stack: 1, tool: { type: 'hoe', tier: 5, speed: 10 }, damage: 1 });
ARMOR_PIECES.forEach(([piece, pn], slot) => item('netherite_' + piece, 'Netherite ' + pn, 'netherite_' + piece, { stack: 1, armor: { slot, points: [3, 9, 7, 3][slot] } }));
makeTile('i_cocoa_beans', pPlant(P => { for (const [x, y] of [[4, 5], [9, 4], [6, 10], [11, 9]]) { P.disc(x, y, 2.2, 0x7a4a22); P.put(x - 1, y - 1, 0xa8703a); } }));
item('cocoa_beans', 'Cocoa Beans', 'cocoa_beans');
makeTile('i_cookie', pPlant(P => { P.disc(7.5, 7.5, 5.5, 0xc8884a); P.disc(7.5, 7.5, 4.5, 0xd8985a); for (const [x, y] of [[5, 5], [10, 6], [7, 9], [4, 9], [10, 10]]) { P.put(x, y, 0x4a2a12); P.put(x + 1, y, 0x5a3418); } }));
item('cookie', 'Cookie', 'cookie', { food: 2 });
item('dark_oak_stairs', 'Dark Oak Stairs', 'dark_oak_stairs', { placesStair: 'dark_oak' });
makeTile('i_dark_oak_slab', pPlant(P => { P.rect(1, 8, 14, 6, 0x4a3220); P.rect(1, 8, 14, 1, 0x6a4a30); P.rect(1, 13, 14, 1, 0x2a1d0e); }));
item('dark_oak_slab', 'Dark Oak Slab', 'dark_oak_slab', { placesSlab: 'dark_oak' });
for (const [w, n] of WOODS) {
  item(w + '_door', n + ' Door', w + '_door', { placesDoor: w });
  item(w + '_trapdoor', n + ' Trapdoor', w + '_trapdoor', { placesTrapdoor: w });
  item(w + '_fence_gate', n + ' Fence Gate', w + '_fence_gate', { placesGate: w });
  if (w !== 'dark_oak') item(w + '_stairs', n + ' Stairs', w + '_stairs', { placesStair: w });
}
item('jungle_slab', 'Jungle Slab', 'jungle_slab', { placesSlab: 'jungle' });
for (const [k, n, full] of SLAB_MATS) {
  const c = DEFS[ID[full]].color, hi = c.map(v => Math.min(255, v + 30)), lo = c.map(v => Math.round(v * 0.6));
  makeTile('i_' + k + '_slab', pPlant(P => { P.rect(1, 8, 14, 6, c); P.rect(1, 8, 14, 1, hi); P.rect(1, 13, 14, 1, lo); P.rect(1, 8, 1, 6, hi); P.rect(14, 8, 1, 6, lo); }));
  item(k + '_slab', n + ' Slab', k + '_slab', { placesSlab: k });
}
item('acacia_door', 'Acacia Door', 'acacia_door', { placesDoor: 'acacia' });
item('acacia_trapdoor', 'Acacia Trapdoor', 'acacia_trapdoor', { placesTrapdoor: 'acacia' });
item('acacia_fence_gate', 'Acacia Fence Gate', 'acacia_fence_gate', { placesGate: 'acacia' });
item('acacia_stairs', 'Acacia Stairs', 'acacia_stairs', { placesStair: 'acacia' });
item('acacia_slab', 'Acacia Slab', 'acacia_slab', { placesSlab: 'acacia' });
for (const [w, n] of [['mangrove', 'Mangrove'], ['cherry', 'Cherry']]) {
  item(w + '_door', n + ' Door', w + '_door', { placesDoor: w });
  item(w + '_trapdoor', n + ' Trapdoor', w + '_trapdoor', { placesTrapdoor: w });
  item(w + '_fence_gate', n + ' Fence Gate', w + '_fence_gate', { placesGate: w });
  item(w + '_stairs', n + ' Stairs', w + '_stairs', { placesStair: w });
  item(w + '_slab', n + ' Slab', w + '_slab', { placesSlab: w });
}
item('paper', 'Paper', 'paper');
item('book', 'Book', 'book');
item('lever', 'Lever', 'lever', { placesSwitch: 'lever' });
item('stone_button', 'Stone Button', 'stone_button', { placesSwitch: 'stone_button' });
item('oak_button', 'Oak Button', 'oak_button', { placesSwitch: 'oak_button' });
item('stone_pressure_plate', 'Stone Pressure Plate', 'stone_pressure_plate', { placesPlate: 'stone' });
item('oak_pressure_plate', 'Oak Pressure Plate', 'oak_pressure_plate', { placesPlate: 'oak' });
item('name_tag', 'Name Tag', 'name_tag');
item('enchanted_book', 'Enchanted Book', 'enchanted_book', { stack: 1 });
item('iron_door', 'Iron Door', 'iron_door', { placesDoor: 'iron' });
item('redstone_torch', 'Redstone Torch', 'redstone_torch', { placesSwitch: 'redstone_torch' });
item('powder_snow_bucket', 'Powder Snow Bucket', 'powder_snow_bucket', { stack: 1 });
item('repeater', 'Redstone Repeater', 'repeater', { placesRepeater: true });
item('nether_star', 'Nether Star', 'nether_star');
item('cod', 'Raw Cod', 'cod', { food: 2 });
item('cooked_cod', 'Cooked Cod', 'cooked_cod', { food: 5 });
item('salmon', 'Raw Salmon', 'salmon', { food: 2 });
item('cooked_salmon', 'Cooked Salmon', 'cooked_salmon', { food: 6 });
item('fishing_rod', 'Fishing Rod', 'fishing_rod', { stack: 1 });
item('ink_sac', 'Ink Sac', 'ink_sac');
item('glow_ink_sac', 'Glow Ink Sac', 'glow_ink_sac');
item('rabbit', 'Raw Rabbit', 'rabbit', { food: 3 });
item('cooked_rabbit', 'Cooked Rabbit', 'cooked_rabbit', { food: 5 });
item('slime_ball', 'Slimeball', 'slime_ball');
item('phantom_membrane', 'Phantom Membrane', 'phantom_membrane');
item('glow_berries', 'Glow Berries', 'glow_berries', { food: 2 });
item('honeycomb', 'Honeycomb', 'honeycomb');
item('glass_bottle', 'Glass Bottle', 'glass_bottle');
item('honey_bottle', 'Honey Bottle', 'honey_bottle', { food: 6, stack: 16, leaves: 'glass_bottle' });
item('shears', 'Shears', 'shears', { stack: 1 });
item('bowl', 'Bowl', 'bowl');
item('mushroom_stew', 'Mushroom Stew', 'mushroom_stew', { food: 6, stack: 1, leaves: 'bowl' });
for (const [k, n] of [['cod', 'Cod'], ['salmon', 'Salmon'], ['tropical_fish', 'Tropical Fish'], ['axolotl', 'Axolotl']]) item('bucket_of_' + k, 'Bucket of ' + n, 'bucket_of_' + k, { stack: 1, fishBucket: k });
item('armadillo_scute', 'Armadillo Scute', 'armadillo_scute');
item('wolf_armor', 'Wolf Armor', 'wolf_armor', { stack: 1 });
item('totem_of_undying', 'Totem of Undying', 'totem_of_undying', { stack: 1 });
item('snowball', 'Snowball', 'snowball', { stack: 16 });
item('breeze_rod', 'Breeze Rod', 'breeze_rod');
item('wind_charge', 'Wind Charge', 'wind_charge', { stack: 64 });
item('turtle_scute', 'Turtle Scute', 'turtle_scute');
item('turtle_helmet', 'Turtle Shell', 'turtle_helmet', { stack: 1, armor: { slot: 0, points: 2 } });

/* the building round's items */
item('vine', 'Vines', 'vine', { placesLadder: 'vine' });
item('dried_kelp', 'Dried Kelp', 'dried_kelp', { food: 1 });
item('sweet_berries', 'Sweet Berries', 'sweet_berries', { food: 2, plants: 'sweet_berry_bush' });
item('bone_meal', 'Bone Meal', 'bone_meal');
item('water_bottle', 'Water Bottle', 'water_bottle', { stack: 1 });
item('raw_copper', 'Raw Copper', 'raw_copper');
item('copper_ingot', 'Copper Ingot', 'copper_ingot');
item('amethyst_shard', 'Amethyst Shard', 'amethyst_shard');
item('prismarine_shard', 'Prismarine Shard', 'prismarine_shard');
item('prismarine_crystals', 'Prismarine Crystals', 'prismarine_crystals');

for (const [k, n, full] of NS) {
  const c = DEFS[ID[full]].color, hi = c.map(v => Math.min(255, v + 30)), lo = c.map(v => Math.round(v * 0.6));
  makeTile('i_' + k + '_slab', pPlant(P => { P.rect(1, 8, 14, 6, c); P.rect(1, 8, 14, 1, hi); P.rect(1, 13, 14, 1, lo); P.rect(1, 8, 1, 6, hi); P.rect(14, 8, 1, 6, lo); }));
  makeTile('i_' + k + '_stairs', pPlant(P => { P.rect(1, 9, 14, 6, c); P.rect(1, 2, 7, 7, c); P.rect(1, 2, 7, 1, hi); P.rect(8, 9, 7, 1, hi); P.rect(1, 14, 14, 1, lo); }));
  item(k + '_slab', n + ' Slab', k + '_slab', { placesSlab: k });
  item(k + '_stairs', n + ' Stairs', k + '_stairs', { placesStair: k });
}

/* the machines round's items */
item('comparator', 'Redstone Comparator', 'comparator', { placesComparator: true });
item('item_frame', 'Item Frame', 'item_frame', { placesLadder: 'item_frame' });
for (const [k, n] of POTIONS) {
  item('potion_' + k, 'Potion of ' + n, 'potion_' + k, { stack: 1, potion: k });
  if (k !== 'awkward') item('splash_' + k, 'Splash Potion of ' + n, 'splash_' + k, { stack: 1, splash: k });
}
DEFS[ID.potion_awkward].name = 'Awkward Potion';
for (const [k, n, extra] of [['nether_wart', 'Nether Wart'], ['sugar', 'Sugar'], ['spider_eye', 'Spider Eye', { food: 2 }], ['fermented_spider_eye', 'Fermented Spider Eye'], ['magma_cream', 'Magma Cream'], ['rabbit_foot', "Rabbit's Foot"], ['glistering_melon', 'Glistering Melon Slice'], ['golden_carrot', 'Golden Carrot', { food: 6 }]]) item(k, n, k, extra || {});
for (const [k, n] of [['13', '13'], ['cat', 'cat'], ['blocks', 'blocks'], ['chirp', 'chirp'], ['far', 'far'], ['mall', 'mall'], ['stal', 'stal'], ['pigstep', 'Pigstep']]) item('disc_' + k, 'Music Disc (' + n + ')', 'disc_' + k, { stack: 1, disc: k });
item('compass', 'Compass', 'compass', { stack: 1 });
item('clock', 'Clock', 'clock', { stack: 1 });
item('map', 'Map', 'map', { stack: 1 });
item('spyglass', 'Spyglass', 'spyglass', { stack: 1 });
item('chorus_fruit', 'Chorus Fruit', 'chorus_fruit', { food: 4, chorus: true });
item('popped_chorus_fruit', 'Popped Chorus Fruit', 'popped_chorus_fruit');
item('shulker_shell', 'Shulker Shell', 'shulker_shell');
item('elytra', 'Elytra', 'elytra', { stack: 1, armor: { slot: 1, points: 0 }, elytra: true });
item('firework_rocket', 'Firework Rocket', 'firework_rocket', { stack: 64, firework: true });
item('trial_key', 'Trial Key', 'trial_key');
item('mace', 'Mace', 'mace', { stack: 1, damage: 6, mace: true });
item('brush', 'Brush', 'brush', { stack: 1 });
for (const [k, n] of [['archer', 'Archer'], ['prize', 'Prize'], ['skull', 'Skull'], ['heart', 'Heart'], ['friend', 'Friend']]) item('sherd_' + k, n + ' Pottery Sherd', 'pottery_sherd');
item('echo_shard', 'Echo Shard', 'echo_shard');
item('recovery_compass', 'Recovery Compass', 'recovery_compass', { stack: 1 });
item('enchanted_golden_apple', 'Enchanted Golden Apple', 'enchanted_golden_apple', { food: 4, heal: 20, notch: true });
item('rail', 'Rail', 'rail', { placesRail: 'rail' });
item('powered_rail', 'Powered Rail', 'powered_rail', { placesRail: 'powered' });
item('detector_rail', 'Detector Rail', 'detector_rail', { placesRail: 'detector' });
item('minecart', 'Minecart', 'minecart', { stack: 1, cart: 'minecart' });
item('chest_minecart', 'Minecart with Chest', 'chest_minecart', { stack: 1, cart: 'chest_minecart' });
for (const [k] of EGG_MOBS) item('egg_' + k, k.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') + ' Spawn Egg', 'egg_' + k, { stack: 64, egg: k });
item('saddle', 'Saddle', 'saddle', { stack: 1 });
item('experience_bottle', "Bottle o' Enchanting", 'experience_bottle', { stack: 64, splash: 'xp' });
HORSE_ARMOR_KEYS.push('wolf_armor');
HORSE_ARMOR.wolf_armor = { name: 'Wolf Armor', pts: 12, color: 0xa86a5a };
DEFS[ID.redstone].placesWire = true; // redstone dust goes on the floor as a wire

function getDrops(def, rng) {
  if (def.drop === null) return [];
  if (def.drop === undefined) return [[def.id, 1]];
  if (typeof def.drop === 'string') return [[ID[def.drop], 1]];
  return def.drop(rng).map(([k, n]) => [ID[k], n]);
}

/* ---------- enchantments ----------
   An enchanted item keeps its enchantments on its slot as e: { sharpness: 2, ... } */
const ENCHANTS = {
  sharpness: { name: 'Sharpness', max: 5, on: ['sword', 'axe'] },
  knockback: { name: 'Knockback', max: 2, on: ['sword'] },
  fire_aspect: { name: 'Fire Aspect', max: 2, on: ['sword', 'mace'] },
  looting: { name: 'Looting', max: 3, on: ['sword'] },
  efficiency: { name: 'Efficiency', max: 5, on: ['pick', 'axe', 'shovel', 'hoe'] },
  fortune: { name: 'Fortune', max: 3, on: ['pick', 'axe', 'shovel', 'hoe'] },
  protection: { name: 'Protection', max: 4, on: ['armor'] },
  feather_falling: { name: 'Feather Falling', max: 4, on: ['boots'] },
  power: { name: 'Power', max: 5, on: ['bow'] },
  flame: { name: 'Flame', max: 1, on: ['bow'] },
  infinity: { name: 'Infinity', max: 1, on: ['bow'] },
  density: { name: 'Density', max: 5, on: ['mace'] },
  breach: { name: 'Breach', max: 4, on: ['mace'] },
  wind_burst: { name: 'Wind Burst', max: 3, on: ['mace'] },
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
/* what kinds of enchantment an item can take ([] = none) */
function enchKinds(def) {
  if (!def) return [];
  if (def.isBlock) return []; // blocks can't be enchanted (their "tool" is just what mines them fastest)
  if (/_sword$/.test(def.key)) return ['sword'];
  if (def.mace) return ['mace'];
  if (def.tool && def.tool.type) return [def.tool.type];
  if (def.armor) return def.armor.slot === 3 ? ['armor', 'boots'] : ['armor'];
  if (def.key === 'book' || def.key === 'enchanted_book') return ['book'];
  if (def.key === 'bow') return ['bow'];
  return [];
}
const canEnchant = def => enchKinds(def).length > 0;
const enchLv = (slot, k) => (slot && slot.e && slot.e[k]) || 0;
const enchText = e => (e ? Object.keys(e).filter(k => ENCHANTS[k]).map(k => ENCHANTS[k].name + (ENCHANTS[k].max > 1 ? ' ' + ROMAN[e[k]] : '')).join(', ') : '');
/* an item's own name (given at an anvil): plain text, up to 30 letters */
const cleanName = n => (typeof n === 'string' ? n.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 30) || undefined : undefined);
/* slots with their extras (enchantments e, name n) as they are saved and sent: [id, count, e or 0, name] */
function slotToArr(s) { if (!s) return 0; const a = [s.id, s.count]; if (s.e || s.n || s.c) a.push(s.e || 0); if (s.n || s.c) a.push(s.n || 0); if (s.c) a.push(s.c.map(slotToArr)); return a; }
function slotFromArr(a, cap, inner) {
  if (!Array.isArray(a) || !DEFS[a[0]] || !(a[1] > 0)) return null;
  const e = cleanEnch(a[2]), n = cleanName(a[3]), s = { id: a[0], count: e ? 1 : Math.min(cap || 64, a[1] | 0) };
  if (e) s.e = e; if (n) s.n = n;
  // a shulker box carries what's inside it (never a box inside a box)
  if (!inner && Array.isArray(a[4]) && DEFS[a[0]].shulker) { s.c = new Array(27).fill(null).map((_, i) => slotFromArr(a[4][i], 64, true)); s.count = 1; }
  return s;
}
function copySlot(s, count) { const o = { id: s.id, count }; if (s.e) o.e = s.e; if (s.n) o.n = s.n; if (s.c) o.c = s.c; return o; }
const slotExtras = s => (s && (s.e || s.n || s.c) ? { e: s.e, n: s.n, c: s.c } : undefined);
/* two stacks can join only if they are the same plain item (enchanted, named or filled ones keep apart) */
const sameStack = (a, b) => a.id === b.id && !a.e && !b.e && !a.c && !b.c && (a.n || '') === (b.n || '');
const slotName = s => (s.n ? s.n : DEFS[s.id].name);
/* keep only real enchantments with sensible levels (from saves or other players) */
function cleanEnch(e) {
  if (!e || typeof e !== 'object') return undefined;
  const o = {};
  for (const k in e) if (ENCHANTS[k] && Number.isInteger(e[k]) && e[k] >= 1) o[k] = Math.min(e[k], ENCHANTS[k].max);
  return Object.keys(o).length ? o : undefined;
}

/* ---------- recipes ---------- */
// [output, count, {input: count}, station]   '#planks' / '#log' match any wood type
const GROUPS = {
  '#cobble': ['cobblestone', 'cobbled_deepslate', 'blackstone'],
  '#planks': ['oak_planks', 'birch_planks', 'spruce_planks', 'crimson_planks', 'warped_planks', 'jungle_planks', 'dark_oak_planks', 'acacia_planks', 'mangrove_planks', 'cherry_planks', 'bamboo_planks', 'pale_oak_planks'],
  '#log': ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'dark_oak_log', 'acacia_log', 'mangrove_log', 'cherry_log', 'pale_oak_log'],
  '#wool': ['wool_white', 'wool_red', 'wool_blue', 'wool_green', 'wool_yellow', 'wool_black', 'wool_orange', 'wool_purple'],
};
const RECIPES = [
  ['oak_planks', 4, { oak_log: 1 }], ['birch_planks', 4, { birch_log: 1 }], ['spruce_planks', 4, { spruce_log: 1 }],
  ['stick', 4, { '#planks': 2 }],
  ['crafting_table', 1, { '#planks': 4 }],
  ['chest', 1, { '#planks': 8 }, 'table'],
  ['furnace', 1, { '#cobble': 8 }, 'table'],
  ['wooden_pickaxe', 1, { '#planks': 3, stick: 2 }, 'table'],
  ['stone_pickaxe', 1, { '#cobble': 3, stick: 2 }, 'table'],
  ['iron_pickaxe', 1, { iron_ingot: 3, stick: 2 }, 'table'],
  ['golden_pickaxe', 1, { gold_ingot: 3, stick: 2 }, 'table'],
  ['diamond_pickaxe', 1, { diamond: 3, stick: 2 }, 'table'],
  ['wooden_sword', 1, { '#planks': 2, stick: 1 }, 'table'],
  ['stone_sword', 1, { '#cobble': 2, stick: 1 }, 'table'],
  ['iron_sword', 1, { iron_ingot: 2, stick: 1 }, 'table'],
  ['golden_sword', 1, { gold_ingot: 2, stick: 1 }, 'table'],
  ['diamond_sword', 1, { diamond: 2, stick: 1 }, 'table'],
  ['wooden_shovel', 1, { '#planks': 1, stick: 2 }, 'table'],
  ['wooden_axe', 1, { '#planks': 3, stick: 2 }, 'table'],
  ['stone_shovel', 1, { '#cobble': 1, stick: 2 }, 'table'],
  ['stone_axe', 1, { '#cobble': 3, stick: 2 }, 'table'],
  ['iron_shovel', 1, { iron_ingot: 1, stick: 2 }, 'table'],
  ['iron_axe', 1, { iron_ingot: 3, stick: 2 }, 'table'],
  ['golden_shovel', 1, { gold_ingot: 1, stick: 2 }, 'table'],
  ['golden_axe', 1, { gold_ingot: 3, stick: 2 }, 'table'],
  ['diamond_shovel', 1, { diamond: 1, stick: 2 }, 'table'],
  ['diamond_axe', 1, { diamond: 3, stick: 2 }, 'table'],
  ['leather_helmet', 1, { leather: 5 }, 'table'],
  ['leather_chestplate', 1, { leather: 8 }, 'table'],
  ['leather_leggings', 1, { leather: 7 }, 'table'],
  ['leather_boots', 1, { leather: 4 }, 'table'],
  ['golden_helmet', 1, { gold_ingot: 5 }, 'table'],
  ['golden_chestplate', 1, { gold_ingot: 8 }, 'table'],
  ['golden_leggings', 1, { gold_ingot: 7 }, 'table'],
  ['golden_boots', 1, { gold_ingot: 4 }, 'table'],
  ['iron_helmet', 1, { iron_ingot: 5 }, 'table'],
  ['iron_chestplate', 1, { iron_ingot: 8 }, 'table'],
  ['iron_leggings', 1, { iron_ingot: 7 }, 'table'],
  ['iron_boots', 1, { iron_ingot: 4 }, 'table'],
  ['netherite_scrap', 1, { ancient_debris: 1 }, 'furnace'],
  ['netherite_ingot', 1, { netherite_scrap: 1 }, 'furnace'], // easier than Minecraft: smelt the scrap again for an ingot
  ['netherite_ingot', 1, { netherite_scrap: 4, gold_ingot: 4 }, 'table'],
  ['netherite_block', 1, { netherite_ingot: 9 }, 'table'], ['netherite_ingot', 9, { netherite_block: 1 }],
  ['jungle_planks', 4, { jungle_log: 1 }], ['dark_oak_planks', 4, { dark_oak_log: 1 }],
  ['dark_oak_stairs', 4, { dark_oak_planks: 6 }, 'table'], ['dark_oak_slab', 6, { dark_oak_planks: 3 }, 'table'], ['cookie', 8, { wheat: 2, cocoa_beans: 1 }],
  ['crimson_planks', 4, { crimson_stem: 1 }], ['warped_planks', 4, { warped_stem: 1 }],
  ['diamond_helmet', 1, { diamond: 5 }, 'table'],
  ['diamond_chestplate', 1, { diamond: 8 }, 'table'],
  ['diamond_leggings', 1, { diamond: 7 }, 'table'],
  ['diamond_boots', 1, { diamond: 4 }, 'table'],
  ['bed', 1, { '#wool': 3, '#planks': 3 }, 'table'],
  ['bow', 1, { stick: 3, string: 3 }, 'table'],
  ['arrow', 4, { flint: 1, stick: 1, feather: 1 }, 'table'],
  ['flint_and_steel', 1, { iron_ingot: 1, flint: 1 }],
  ['tnt', 1, { gunpowder: 5, sand: 4 }, 'table'],
  ['golden_apple', 1, { apple: 1, gold_ingot: 8 }, 'table'],
  ['gold_block', 1, { gold_ingot: 9 }, 'table'], ['gold_ingot', 9, { gold_block: 1 }],
  ['iron_block', 1, { iron_ingot: 9 }, 'table'], ['iron_ingot', 9, { iron_block: 1 }],
  ['diamond_block', 1, { diamond: 9 }, 'table'], ['diamond', 9, { diamond_block: 1 }],
  ['emerald_block', 1, { emerald: 9 }, 'table'], ['emerald', 9, { emerald_block: 1 }],
  ['lapis_block', 1, { lapis: 9 }, 'table'], ['lapis', 9, { lapis_block: 1 }],
  ['coal_block', 1, { coal: 9 }, 'table'], ['coal', 9, { coal_block: 1 }],
  ['redstone_block', 1, { redstone: 9 }, 'table'], ['redstone', 9, { redstone_block: 1 }],
  ['glowstone', 1, { redstone: 4, gold_ingot: 1 }, 'table'],
  ['sandstone', 1, { sand: 4 }],
  ['quartz_block', 1, { quartz: 4 }],
  ['nether_bricks', 1, { netherrack: 4 }],
  ['glowstone', 1, { blaze_rod: 1, netherrack: 1 }],
  ['golden_apple', 1, { apple: 1, ghast_tear: 1 }, 'table'],
  ['stone_bricks', 4, { stone: 4 }],
  ['bricks', 4, { terracotta: 4 }],
  ['bookshelf', 1, { '#planks': 6, leather: 3 }, 'table'],
  ['mossy_cobblestone', 1, { cobblestone: 1, oak_leaves: 1 }],
  ['melon', 1, { melon_slice: 9 }],
  ['hay_bale', 1, { wheat: 9 }],
  ['wheat', 9, { hay_bale: 1 }],
  ['bread', 1, { wheat: 3 }],
  ['torch', 4, { coal: 1, stick: 1 }],
  ['flag', 1, { stick: 2, '#wool': 3 }],
  ['boat', 1, { '#planks': 5 }, 'table'],
  ['lead', 2, { string: 4 }, 'table'],
  ['leather_horse_armor', 1, { leather: 7 }, 'table'],
  ['iron_horse_armor', 1, { iron_ingot: 7 }, 'table'],
  ['golden_horse_armor', 1, { gold_ingot: 7 }, 'table'],
  ['diamond_horse_armor', 1, { diamond: 7 }, 'table'],
  ['lantern', 1, { torch: 1, iron_ingot: 1 }, 'table'],
  ['pumpkin_seeds', 4, { pumpkin: 1 }],
  ['baked_potato', 1, { potato: 1 }, 'furnace'],
  ['bucket', 1, { iron_ingot: 3 }, 'table'],
  ['oak_door', 3, { oak_planks: 6 }, 'table'],
  ['oak_stairs', 4, { oak_planks: 6 }, 'table'],
  ...WOODS.flatMap(([w]) => { const pk = w + '_planks'; return [[w + '_door', 3, { [pk]: 6 }, 'table'], [w + '_trapdoor', 2, { [pk]: 6 }, 'table'], [w + '_fence', 3, { [pk]: 4, stick: 2 }, 'table'], [w + '_fence_gate', 1, { [pk]: 2, stick: 4 }, 'table']].concat(w === 'dark_oak' ? [] : [[w + '_stairs', 4, { [pk]: 6 }, 'table']]); }),
  ['jungle_slab', 6, { jungle_planks: 3 }, 'table'],
  ['acacia_planks', 4, { acacia_log: 1 }], ['acacia_stairs', 4, { acacia_planks: 6 }, 'table'], ['acacia_slab', 6, { acacia_planks: 3 }, 'table'],
  ['acacia_door', 3, { acacia_planks: 6 }, 'table'], ['acacia_trapdoor', 2, { acacia_planks: 6 }, 'table'], ['acacia_fence', 3, { acacia_planks: 4, stick: 2 }, 'table'], ['acacia_fence_gate', 1, { acacia_planks: 2, stick: 4 }, 'table'],
  ['paper', 3, { sugar_cane: 3 }, 'table'], ['book', 1, { paper: 3, leather: 1 }], ['bookshelf', 1, { '#planks': 6, book: 3 }, 'table'],
  ['enchanting_table', 1, { book: 1, diamond: 2, obsidian: 4 }, 'table'],
  ['redstone_torch', 1, { redstone: 1, stick: 1 }], ['redstone_lamp_0', 1, { redstone: 4, glowstone: 1 }, 'table'], ['repeater', 1, { redstone_torch: 2, redstone: 1, stone: 3 }, 'table'],
  ['anvil', 1, { iron_block: 3, iron_ingot: 4 }, 'table'], ['shulker_box', 1, { chest: 1, wool_purple: 1 }], ['dog_bed', 1, { wool_red: 1, '#planks': 2 }], ...Object.keys(SHULKER_COLORS).map(k => ['shulker_box_' + k, 1, { chest: 1, ['wool_' + k]: 1 }]), ['ender_chest', 1, { obsidian: 8, eye_of_ender: 1 }, 'table'], ['beacon', 1, { glass: 5, obsidian: 3, nether_star: 1 }, 'table'], ['smithing_table', 1, { iron_ingot: 2, '#planks': 4 }, 'table'], ['iron_door', 3, { iron_ingot: 6 }, 'table'], ['name_tag', 1, { paper: 1, string: 1 }],
  ['lever', 1, { stick: 1, cobblestone: 1 }], ['stone_button', 1, { stone: 1 }], ['oak_button', 1, { '#planks': 1 }], ['stone_pressure_plate', 1, { stone: 2 }, 'table'], ['oak_pressure_plate', 1, { '#planks': 2 }, 'table'],
  ['bamboo_block', 1, { bamboo: 9 }], ['bamboo_planks', 2, { bamboo_block: 1 }], ['stick', 1, { bamboo: 2 }],
  ...['mangrove', 'cherry'].flatMap(w => { const pk = w + '_planks'; return [[pk, 4, { [w + '_log']: 1 }], [w + '_stairs', 4, { [pk]: 6 }, 'table'], [w + '_slab', 6, { [pk]: 3 }, 'table'], [w + '_door', 3, { [pk]: 6 }, 'table'], [w + '_trapdoor', 2, { [pk]: 6 }, 'table'], [w + '_fence', 3, { [pk]: 4, stick: 2 }, 'table'], [w + '_fence_gate', 1, { [pk]: 2, stick: 4 }, 'table']]; }),
  ['composter', 1, { '#planks': 4 }, 'table'], ['lectern', 1, { bookshelf: 1, '#planks': 4 }, 'table'],
  ['smoker', 1, { furnace: 1, '#log': 4 }, 'table'], ['blast_furnace', 1, { furnace: 1, iron_ingot: 5, stone: 3 }, 'table'],
  ['grindstone', 1, { stick: 2, stone: 1, '#planks': 2 }, 'table'], ['fletching_table', 1, { flint: 2, '#planks': 4 }, 'table'],
  ['glass_pane', 16, { glass: 6 }, 'table'],
  ['deepslate', 1, { cobbled_deepslate: 1 }, 'furnace'],
  ...STAINS.flatMap(([k]) => [['stained_glass_' + k, 8, { glass: 8, ['wool_' + k]: 1 }, 'table'], ['stained_glass_pane_' + k, 16, { ['stained_glass_' + k]: 6 }, 'table']]),
  ['oak_slab', 6, { oak_planks: 3 }, 'table'], ['birch_slab', 6, { birch_planks: 3 }, 'table'], ['spruce_slab', 6, { spruce_planks: 3 }, 'table'],
  ['crimson_slab', 6, { crimson_planks: 3 }, 'table'], ['warped_slab', 6, { warped_planks: 3 }, 'table'],
  ['cobblestone_slab', 6, { cobblestone: 3 }, 'table'], ['stone_slab', 6, { stone: 3 }, 'table'], ['stone_brick_slab', 6, { stone_bricks: 3 }, 'table'],
  ['sandstone_slab', 6, { sandstone: 3 }, 'table'], ['brick_slab', 6, { bricks: 3 }, 'table'], ['blackstone_slab', 6, { blackstone: 3 }, 'table'],
  ['nether_brick_slab', 6, { nether_bricks: 3 }, 'table'], ['quartz_slab', 6, { quartz_block: 3 }, 'table'],
  ['cobblestone_stairs', 4, { cobblestone: 6 }, 'table'],
  ['stone_brick_stairs', 4, { stone_bricks: 6 }, 'table'],
  ['oak_fence', 3, { oak_planks: 4, stick: 2 }, 'table'],
  ['ladder', 3, { stick: 7 }, 'table'],
  ['oak_fence_gate', 1, { oak_planks: 2, stick: 4 }, 'table'],
  ['oak_sign', 3, { '#planks': 6, stick: 1 }, 'table'],
  ['oak_trapdoor', 2, { oak_planks: 6 }, 'table'],
  ['wooden_hoe', 1, { '#planks': 2, stick: 2 }, 'table'],
  ['stone_hoe', 1, { '#cobble': 2, stick: 2 }, 'table'],
  ['iron_hoe', 1, { iron_ingot: 2, stick: 2 }, 'table'],
  ['golden_hoe', 1, { gold_ingot: 2, stick: 2 }, 'table'],
  ['diamond_hoe', 1, { diamond: 2, stick: 2 }, 'table'],
  ['blaze_powder', 2, { blaze_rod: 1 }],
  ['eye_of_ender', 1, { blaze_powder: 1, ender_pearl: 1 }],
  ['wool_white', 1, { string: 4 }],
  ['wool_red', 1, { wool_white: 1, rose: 1 }],
  ['wool_yellow', 1, { wool_white: 1, dandelion: 1 }],
  ['wool_blue', 1, { wool_white: 1, lapis: 1 }],
  ['wool_green', 1, { wool_white: 1, cactus: 1 }],
  ['wool_black', 1, { wool_white: 1, coal: 1 }],
  ['wool_orange', 1, { wool_white: 1, rose: 1, dandelion: 1 }],
  ['wool_purple', 1, { wool_white: 1, rose: 1, lapis: 1 }],
  ['pumpkin', 1, { melon: 1, coal: 1 }],
  // furnace
  ['iron_ingot', 1, { iron_ore: 1 }, 'furnace'],
  ['gold_ingot', 1, { gold_ore: 1 }, 'furnace'],
  ['glass', 1, { sand: 1 }, 'furnace'],
  ['stone', 1, { cobblestone: 1 }, 'furnace'],
  ['coal', 1, { '#log': 1 }, 'furnace'],
  ['terracotta', 1, { clay: 1 }, 'furnace'],
  ['cooked_porkchop', 1, { porkchop: 1 }, 'furnace'],
  ['steak', 1, { beef: 1 }, 'furnace'],
  ['bowl', 4, { '#planks': 3 }, 'table'], ['mushroom_stew', 1, { red_mushroom: 1, brown_mushroom: 1, bowl: 1 }], ['wolf_armor', 1, { armadillo_scute: 6 }, 'table'], ['snow', 1, { snowball: 4 }], ['wind_charge', 4, { breeze_rod: 1 }], ['turtle_helmet', 1, { turtle_scute: 5 }, 'table'], ['pale_oak_planks', 4, { pale_oak_log: 1 }],
  ['beehive', 1, { '#planks': 6, honeycomb: 3 }, 'table'], ['campfire', 1, { stick: 3, coal: 1, '#log': 3 }, 'table'], ['glass_bottle', 3, { glass: 3 }, 'table'], ['shears', 1, { iron_ingot: 2 }], ['honey_block', 1, { honey_bottle: 4 }], ['honeycomb_block', 1, { honeycomb: 4 }],
  ['cooked_rabbit', 1, { rabbit: 1 }, 'furnace'], ['cooked_cod', 1, { cod: 1 }, 'furnace'], ['cooked_salmon', 1, { salmon: 1 }, 'furnace'], ['fishing_rod', 1, { stick: 3, string: 2 }],
  ['cooked_chicken', 1, { chicken: 1 }, 'furnace'],
];

/* the building round's recipes (coloured things use wool as their dye, like stained glass here) */
RECIPES.push(
  ['granite', 1, { diorite: 1, quartz: 1 }], ['diorite', 2, { cobblestone: 2, quartz: 2 }, 'table'], ['andesite', 2, { diorite: 1, cobblestone: 1 }],
  ['polished_granite', 4, { granite: 4 }, 'table'], ['polished_diorite', 4, { diorite: 4 }, 'table'], ['polished_andesite', 4, { andesite: 4 }, 'table'],
  ['polished_tuff', 4, { tuff: 4 }, 'table'], ['tuff_bricks', 4, { polished_tuff: 4 }, 'table'], ['smooth_stone', 1, { stone: 1 }, 'furnace'],
  ['chiseled_stone_bricks', 1, { stone_bricks: 2 }], ['cracked_stone_bricks', 1, { stone_bricks: 1 }, 'furnace'], ['mossy_stone_bricks', 1, { stone_bricks: 1, vine: 1 }], ['mossy_cobblestone', 1, { cobblestone: 1, vine: 1 }],
  ['polished_deepslate', 4, { cobbled_deepslate: 4 }, 'table'], ['deepslate_bricks', 4, { polished_deepslate: 4 }, 'table'], ['deepslate_tiles', 4, { deepslate_bricks: 4 }, 'table'], ['chiseled_deepslate', 1, { cobbled_deepslate: 2 }],
  ['polished_blackstone', 4, { blackstone: 4 }, 'table'], ['polished_blackstone_bricks', 4, { polished_blackstone: 4 }, 'table'], ['smooth_basalt', 1, { basalt: 1 }, 'furnace'],
  ['packed_mud', 1, { mud: 1, wheat: 1 }], ['mud_bricks', 4, { packed_mud: 4 }, 'table'], ['red_sandstone', 1, { red_sand: 4 }], ['smooth_sandstone', 1, { sandstone: 1 }, 'furnace'], ['cut_sandstone', 4, { sandstone: 4 }, 'table'], ['chiseled_sandstone', 1, { sandstone: 2 }],
  ['end_stone_bricks', 4, { end_stone: 4 }, 'table'], ['prismarine', 1, { prismarine_shard: 4 }], ['prismarine_bricks', 1, { prismarine_shard: 9 }, 'table'], ['dark_prismarine', 1, { prismarine_shard: 8, ink_sac: 1 }, 'table'], ['sea_lantern', 1, { prismarine_shard: 4, prismarine_crystals: 5 }, 'table'],
  ['quartz_bricks', 4, { quartz_block: 4 }, 'table'], ['chiseled_quartz', 1, { quartz_block: 2 }], ['quartz_pillar', 2, { quartz_block: 2 }], ['smooth_quartz', 1, { quartz_block: 1 }, 'furnace'],
  ['red_nether_bricks', 1, { nether_bricks: 2, nether_wart_block: 2 }], ['cracked_nether_bricks', 1, { nether_bricks: 1 }, 'furnace'], ['chiseled_nether_bricks', 1, { nether_bricks: 2 }],
  ['bone_meal', 3, { bone: 1 }], ['bone_block', 1, { bone_meal: 9 }, 'table'], ['dried_kelp', 1, { kelp: 1 }, 'furnace'], ['dried_kelp_block', 1, { dried_kelp: 9 }, 'table'], ['sponge', 1, { wet_sponge: 1 }, 'furnace'],
  ['tinted_glass', 2, { glass: 1, amethyst_shard: 4 }, 'table'], ['amethyst_block', 1, { amethyst_shard: 4 }],
  ['copper_ingot', 1, { raw_copper: 1 }, 'furnace'], ['copper_block', 1, { copper_ingot: 9 }, 'table'], ['copper_ingot', 9, { copper_block: 1 }], ['cut_copper', 4, { copper_block: 4 }, 'table'],
  ['iron_bars', 16, { iron_ingot: 6 }, 'table'], ['chain', 1, { iron_ingot: 1 }], ['snow_layer', 6, { snow: 3 }, 'table'],
  ['soul_torch', 4, { coal: 1, stick: 1, soul_sand: 1 }], ['soul_lantern', 1, { iron_ingot: 1, soul_torch: 1 }], ['end_rod', 4, { blaze_rod: 1, end_stone: 1 }],
  ['wool_light_blue', 2, { wool_blue: 1, wool_white: 1 }], ['wool_magenta', 2, { wool_purple: 1, wool_red: 1 }], ['wool_pink', 2, { wool_red: 1, wool_white: 1 }], ['wool_lime', 2, { wool_green: 1, wool_white: 1 }],
  ['wool_gray', 2, { wool_black: 1, wool_white: 1 }], ['wool_light_gray', 2, { wool_gray: 1, wool_white: 1 }], ['wool_cyan', 2, { wool_blue: 1, wool_green: 1 }], ['wool_brown', 1, { wool_white: 1, cocoa_beans: 1 }],
  ['wool_magenta', 1, { wool_white: 1, allium: 1 }], ['wool_light_blue', 1, { wool_white: 1, blue_orchid: 1 }], ['wool_blue', 1, { wool_white: 1, cornflower: 1 }], ['wool_pink', 1, { wool_white: 1, tulip_pink: 1 }], ['wool_light_gray', 1, { wool_white: 1, oxeye_daisy: 1 }], ['wool_orange', 1, { wool_white: 1, torchflower: 1 }],
  ...COLORS16.flatMap(([k]) => [
    ['carpet_' + k, 3, { ['wool_' + k]: 2 }], ['concrete_powder_' + k, 8, { sand: 4, gravel: 4, ['wool_' + k]: 1 }, 'table'], ['glazed_terracotta_' + k, 1, { ['terracotta_' + k]: 1 }, 'furnace'],
    ...(OLD_TC.includes(k) && k !== 'white' ? [] : [['terracotta_' + k, 8, { terracotta: 8, ['wool_' + k]: 1 }, 'table']]),
    ...(OLD_WOOL.includes(k) ? [] : [['stained_glass_' + k, 8, { glass: 8, ['wool_' + k]: 1 }, 'table'], ['stained_glass_pane_' + k, 16, { ['stained_glass_' + k]: 6 }, 'table']]),
  ]),
  ...NS.flatMap(([k, , full]) => [[k + '_slab', 6, { [full]: 3 }, 'table'], [k + '_stairs', 4, { [full]: 6 }, 'table']]),
  ...WALLS.filter(([f]) => ID[f]).map(([f]) => [f + '_wall', 6, { [f]: 6 }, 'table']),
);

/* rails */
RECIPES.push(['rail', 16, { iron_ingot: 6, stick: 1 }, 'table'], ['powered_rail', 6, { gold_ingot: 6, stick: 1, redstone: 1 }, 'table'], ['detector_rail', 6, { iron_ingot: 6, stone_pressure_plate: 1, redstone: 1 }, 'table'], ['minecart', 1, { iron_ingot: 5 }, 'table'], ['chest_minecart', 1, { minecart: 1, chest: 1 }]);
/* the trials round's recipes */
RECIPES.push(['mace', 1, { heavy_core: 1, breeze_rod: 1 }, 'table'], ['brush', 1, { feather: 1, copper_ingot: 1, stick: 1 }], ['decorated_pot', 1, { bricks: 2 }], ['recovery_compass', 1, { echo_shard: 8, compass: 1 }, 'table']);
/* the End round's recipes */
RECIPES.push(['popped_chorus_fruit', 1, { chorus_fruit: 1 }, 'furnace'], ['purpur_block', 4, { popped_chorus_fruit: 4 }], ['purpur_pillar', 2, { purpur_block: 2 }], ['end_rod', 4, { blaze_rod: 1, popped_chorus_fruit: 1 }],
  ['shulker_box', 1, { shulker_shell: 2, chest: 1 }, 'table'], ['firework_rocket', 3, { paper: 1, gunpowder: 1 }], ['x_purpur_block_slab', 2, { purpur_block: 1 }, 'stonecutter'], ['x_purpur_block_stairs', 1, { purpur_block: 1 }, 'stonecutter']);
const iEndRod = RECIPES.findIndex(r => r[0] === 'end_rod' && r[2].end_stone); if (iEndRod >= 0) RECIPES.splice(iEndRod, 1);
/* the machines round's recipes */
RECIPES.push(
  ['barrel', 1, { '#planks': 7 }, 'table'], ['stonecutter', 1, { iron_ingot: 1, stone: 3 }, 'table'], ['cauldron', 1, { iron_ingot: 7 }, 'table'],
  ['brewing_stand', 1, { blaze_rod: 1, cobblestone: 3 }, 'table'], ['jukebox', 1, { '#planks': 8, diamond: 1 }, 'table'], ['note_block', 1, { '#planks': 8, redstone: 1 }, 'table'],
  ['hopper', 1, { iron_ingot: 5, chest: 1 }, 'table'], ['dispenser_s', 1, { cobblestone: 7, bow: 1, redstone: 1 }, 'table'], ['dropper_s', 1, { cobblestone: 7, redstone: 1 }, 'table'],
  ['piston_n', 1, { '#planks': 3, cobblestone: 4, iron_ingot: 1, redstone: 1 }, 'table'], ['sticky_piston_n', 1, { piston_n: 1, slime_ball: 1 }], ['observer_n_0', 1, { cobblestone: 6, redstone: 2, quartz: 1 }, 'table'],
  ['saddle', 1, { leather: 3, iron_ingot: 1 }, 'table'],
  ['daylight_detector_0', 1, { glass: 3, quartz: 3, '#planks': 3 }, 'table'], ['target_0', 1, { redstone: 4, hay_bale: 1 }, 'table'], ['comparator', 1, { redstone_torch: 3, quartz: 1, stone: 3 }, 'table'],
  ['scaffolding', 6, { bamboo: 6, string: 1 }, 'table'], ['item_frame', 1, { stick: 8, leather: 1 }, 'table'], ['candle', 1, { string: 1, honeycomb: 1 }], ['respawn_anchor_0', 1, { crying_obsidian: 6, glowstone: 3 }, 'table'],
  ['compass', 1, { iron_ingot: 4, redstone: 1 }, 'table'], ['clock', 1, { gold_ingot: 4, redstone: 1 }, 'table'], ['map', 1, { paper: 8, compass: 1 }, 'table'], ['spyglass', 1, { copper_ingot: 2, amethyst_shard: 1 }, 'table'],
  ['sugar', 1, { sugar_cane: 1 }], ['fermented_spider_eye', 1, { spider_eye: 1, sugar: 1, brown_mushroom: 1 }], ['magma_cream', 1, { slime_ball: 1, blaze_powder: 1 }],
  ['glistering_melon', 1, { melon_slice: 1, gold_ingot: 1 }, 'table'], ['golden_carrot', 1, { carrot: 1, gold_ingot: 1 }, 'table'],
  // brewing (at a brewing stand)
  ['potion_awkward', 1, { water_bottle: 1, nether_wart: 1 }, 'brewing'],
  ...[['speed', 'sugar'], ['jump_boost', 'rabbit_foot'], ['strength', 'blaze_powder'], ['regeneration', 'ghast_tear'], ['fire_resistance', 'magma_cream'], ['healing', 'glistering_melon'], ['night_vision', 'golden_carrot'], ['poison', 'spider_eye'], ['slow_falling', 'phantom_membrane'], ['water_breathing', 'turtle_scute']].map(([k, ing]) => ['potion_' + k, 1, { potion_awkward: 1, [ing]: 1 }, 'brewing']),
  ['potion_invisibility', 1, { potion_night_vision: 1, fermented_spider_eye: 1 }, 'brewing'], ['potion_weakness', 1, { water_bottle: 1, fermented_spider_eye: 1 }, 'brewing'], ['potion_harming', 1, { potion_poison: 1, fermented_spider_eye: 1 }, 'brewing'],
  ...POTIONS.filter(([k]) => k !== 'awkward').map(([k]) => ['splash_' + k, 1, { ['potion_' + k]: 1, gunpowder: 1 }, 'brewing']),
  // the stonecutter: one block in, stairs, slabs or walls out (no waste)
  ...NS.filter(([k, , full]) => DEFS[ID[full]].tool === 'pick').flatMap(([k, , full]) => [[k + '_slab', 2, { [full]: 1 }, 'stonecutter'], [k + '_stairs', 1, { [full]: 1 }, 'stonecutter']]),
  ...WALLS.filter(([f]) => ID[f]).map(([f]) => [f + '_wall', 1, { [f]: 1 }, 'stonecutter']),
  ...[['polished_granite', 'granite'], ['polished_diorite', 'diorite'], ['polished_andesite', 'andesite'], ['polished_tuff', 'tuff'], ['tuff_bricks', 'tuff'], ['polished_deepslate', 'cobbled_deepslate'], ['deepslate_bricks', 'cobbled_deepslate'], ['deepslate_tiles', 'cobbled_deepslate'], ['stone_bricks', 'stone'], ['chiseled_stone_bricks', 'stone'], ['polished_blackstone', 'blackstone'], ['polished_blackstone_bricks', 'blackstone'], ['cut_sandstone', 'sandstone'], ['chiseled_sandstone', 'sandstone'], ['end_stone_bricks', 'end_stone'], ['quartz_bricks', 'quartz_block'], ['chiseled_quartz', 'quartz_block'], ['quartz_pillar', 'quartz_block'], ['cut_copper', 'copper_block']].map(([o, i]) => [o, 1, { [i]: 1 }, 'stonecutter']),
);

/* ---------- inventory icons ---------- */
const ICON_CACHE = new Map();
const tmpTile = document.createElement('canvas');
tmpTile.width = tmpTile.height = 16;
const tmpCtx = tmpTile.getContext('2d');

function drawTileTo(ctx, tile, dark) {
  tmpCtx.clearRect(0, 0, 16, 16);
  tmpCtx.globalCompositeOperation = 'source-over';
  tmpCtx.drawImage(atlasCanvas, (tile % ATLAS_N) * 16, Math.floor(tile / ATLAS_N) * 16, 16, 16, 0, 0, 16, 16);
  if (dark) {
    tmpCtx.globalCompositeOperation = 'source-atop';
    tmpCtx.fillStyle = 'rgba(0,0,0,' + dark + ')';
    tmpCtx.fillRect(0, 0, 16, 16);
    tmpCtx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(tmpTile, 0, 0);
}

function iconURL(id) {
  if (ICON_CACHE.has(id)) return ICON_CACHE.get(id);
  const def = DEFS[id];
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (def.iconTile) {
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    drawTileTo(ctx, TILES[def.iconTile], 0);
  } else if (def.isBlock && !def.cross) {
    const s = 1 / 16;
    ctx.setTransform(14 * s, -7 * s, 14 * s, 7 * s, 2, 8); drawTileTo(ctx, def.faces[2], 0);
    ctx.setTransform(14 * s, 7 * s, 0, 16 * s, 2, 8); drawTileTo(ctx, def.faces[4], 0.22);
    ctx.setTransform(14 * s, -7 * s, 0, 16 * s, 16, 15); drawTileTo(ctx, def.faces[0], 0.42);
  } else {
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    drawTileTo(ctx, def.isBlock ? def.faces[0] : def.tile, 0);
  }
  const url = cv.toDataURL();
  ICON_CACHE.set(id, url);
  return url;
}

function tileOf(id) { const d = DEFS[id]; return d.isBlock ? d.faces[0] : d.tile; }

/* ---------- furnace: what smelts into what, and how long fuel burns (seconds; one item takes 6) ---------- */
const SMELT_TIME = 6;
const SMELT = {}; // input id -> [output id, count, xp]
const SMELT_XP = { deepslate: 0.1, netherite_scrap: 2, iron_ingot: 0.7, gold_ingot: 1, glass: 0.1, stone: 0.1, coal: 0.15, terracotta: 0.35, cooked_porkchop: 0.35, steak: 0.35, cooked_chicken: 0.35 };
for (const r of RECIPES) if (r[3] === 'furnace') for (const k in r[2]) for (const m of GROUPS[k] || [k]) if (ID[m] !== undefined) SMELT[ID[m]] = [ID[r[0]], r[1], SMELT_XP[r[0]] || 0.1];
const FUEL = {};
// (how many items each one smelts) x 6 seconds: coal smelts 5 items
for (const [k, n] of [['lava_bucket', 100], ['coal', 5], ['coal_block', 45], ['blaze_rod', 12], ['stick', 0.5], ['crafting_table', 1.5], ['chest', 1.5], ['bookshelf', 1.5],
  ['oak_log', 1.5], ['birch_log', 1.5], ['spruce_log', 1.5], ['jungle_log', 1.5], ['dark_oak_log', 1.5], ['acacia_log', 1.5], ['acacia_planks', 1.5], ['mangrove_log', 1.5], ['mangrove_planks', 1.5], ['cherry_log', 1.5], ['cherry_planks', 1.5], ['bamboo', 0.25], ['bamboo_planks', 1.5], ['bamboo_block', 1.5], ['dark_oak_planks', 1.5], ['oak_planks', 1.5], ['birch_planks', 1.5], ['spruce_planks', 1.5], ['jungle_planks', 1.5], ['bow', 1.5],
  ['wooden_pickaxe', 1], ['wooden_sword', 1], ['wooden_axe', 1], ['wooden_shovel', 1], ['dead_bush', 0.5], ['boat', 6]]) if (ID[k] !== undefined) FUEL[ID[k]] = n * SMELT_TIME;

/* ---------- what each number means ----------
   Saves (and messages between players) keep blocks and items as numbers. Every save also carries this
   list, so if the numbers ever change, old saves can be translated instead of turning into the wrong blocks. */
const ID_PALETTE = (() => { const p = {}; for (const d of DEFS) if (d) p[d.id] = d.key; return p; })();
const ID_HASH = (() => { let h = 0; const s = Object.keys(ID_PALETTE).map(k => k + ID_PALETTE[k]).join(','); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); })();
/* a function turning a saved number into today's number (or null when nothing needs changing) */
function idTranslator(pal) {
  if (!pal || typeof pal !== 'object') return null;
  const map = new Map();
  for (const k in pal) { const now = ID[pal[k]]; if (now !== undefined && now !== +k) map.set(+k, now); }
  return map.size ? id => (map.has(id) ? map.get(id) : id) : null;
}
