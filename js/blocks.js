'use strict';
/* Block and item registry, procedural pixel-art textures, and inventory icons. */

const TILE = 16, ATLAS_N = 32; // room for 1024 pictures
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
  paint(P);
  actx.putImageData(img, (i % ATLAS_N) * TILE, Math.floor(i / ATLAS_N) * TILE);
  let r = 0, g = 0, b = 0, n = 0;
  for (let k = 0; k < D.length; k += 4) if (D[k + 3] > 100) { r += D[k]; g += D[k + 1]; b += D[k + 2]; n++; }
  TILE_AVG[i] = n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [255, 255, 255];
  return i;
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
for (const [w, , c] of WOODS) {
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
DEFS[0] = { id: 0, key: 'air', name: 'Air', isBlock: true, solid: false, opaque: false, hardness: 0, faces: [0, 0, 0, 0, 0, 0], color: [255, 255, 255] };
ID.air = 0;
let nextBlockId = 1;

function block(key, name, tex, o = {}) {
  const id = nextBlockId++;
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
for (const [w, n, , planks] of WOODS) {
  const pk = w === 'crimson' || w === 'warped' ? w + '_planks' : planks;
  block(w + '_fence', n + ' Fence', pk, { tool: 'axe', hardness: 2, opaque: false, fence: true, iconTile: 'i_' + w + '_fence' });
  for (const ax of ['x', 'z']) for (const op of ['c', 'o']) {
    const cbox = ax === 'x' ? [[0, 0, 0.375, 1, 1.5, 0.625]] : [[0.375, 0, 0, 0.625, 1.5, 1]];
    block(w + '_gate_' + ax + op, n + ' Fence Gate', pk, { tool: 'axe', hardness: 2, opaque: false, solid: op === 'c', boxes: GATE_BOXES[ax + op], cboxes: op === 'c' ? cbox : [], drop: w + '_fence_gate', gate: { ax, open: op === 'o', wood: w } });
    for (const half of ['lower', 'upper']) block(w + '_door_' + ax + op + '_' + half, n + ' Door', w + '_door_' + half, { tool: 'axe', hardness: 1.5, opaque: false, solid: op === 'c', box: DOOR_BOX[ax + op], drop: half === 'lower' ? w + '_door' : null, door: { ax, open: op === 'o', half, wood: w } });
    block(w + '_trapdoor_' + ax + op, n + ' Trapdoor', w + '_trapdoor', { tool: 'axe', hardness: 1.5, opaque: false, solid: op === 'c', height: op === 'c' ? 0.1875 : undefined, box: op === 'c' ? TRAP_BOX.c : TRAP_BOX['o' + ax], drop: w + '_trapdoor', trapdoor: { ax, open: op === 'o', wood: w } });
  }
  if (w !== 'dark_oak') for (const d of ['n', 's', 'w', 'e']) block(w + '_stairs_' + d, n + ' Stairs', pk, { tool: 'axe', hardness: 2, opaque: false, boxes: [[0, 0, 0, 1, 0.5, 1], STAIR_UP[d]], drop: w + '_stairs', stair: w });
}
for (const half of ['b', 't']) block('jungle_slab_' + half, 'Jungle Slab', 'planks_jungle', { tool: 'axe', hardness: 2, opaque: false, boxes: [half === 'b' ? [0, 0, 0, 1, 0.5, 1] : [0, 0.5, 0, 1, 1, 1]], drop: 'jungle_slab', slab: 'jungle', slabFull: 'jungle_planks', slabHalf: half });
/* work blocks: a villager near one takes that job and has things to trade */
block('composter', 'Composter', { side: 'composter_side', top: 'composter_top', bottom: 'planks_oak' }, { tool: 'axe', hardness: 0.6, job: 'farmer' });
block('lectern', 'Lectern', { side: 'lectern_side', top: 'lectern_top', bottom: 'planks_oak' }, { tool: 'axe', hardness: 2.5, job: 'librarian' });
block('smoker', 'Smoker', { side: 'smoker_side', front: 'smoker_front', top: 'smoker_side', bottom: 'smoker_side' }, PICK(1, 3.5, { job: 'butcher' }));
block('blast_furnace', 'Blast Furnace', { side: 'blast_side', front: 'blast_front', top: 'blast_side', bottom: 'blast_side' }, PICK(1, 3.5, { job: 'armorer' }));
block('grindstone', 'Grindstone', 'grindstone', PICK(1, 2, { job: 'weaponsmith' }));
block('fletching_table', 'Fletching Table', { side: 'fletching_side', top: 'fletching_top', bottom: 'planks_oak' }, { tool: 'axe', hardness: 2.5, job: 'fletcher' });

let nextItemId = 128;
function item(key, name, tile, o = {}) {
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
  ['golden', 'Golden', 1, 12, 4], ['diamond', 'Diamond', 4, 8, 7],
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
item('netherite_sword', 'Netherite Sword', 'netherite_sword', { stack: 1, damage: 9 });
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

function getDrops(def, rng) {
  if (def.drop === null) return [];
  if (def.drop === undefined) return [[def.id, 1]];
  if (typeof def.drop === 'string') return [[ID[def.drop], 1]];
  return def.drop(rng).map(([k, n]) => [ID[k], n]);
}

/* ---------- recipes ---------- */
// [output, count, {input: count}, station]   '#planks' / '#log' match any wood type
const GROUPS = {
  '#cobble': ['cobblestone', 'cobbled_deepslate', 'blackstone'],
  '#planks': ['oak_planks', 'birch_planks', 'spruce_planks', 'crimson_planks', 'warped_planks', 'jungle_planks', 'dark_oak_planks'],
  '#log': ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'dark_oak_log'],
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
  ['netherite_ingot', 1, { netherite_scrap: 4, gold_ingot: 4 }, 'table'],
  ['netherite_block', 1, { netherite_ingot: 9 }, 'table'], ['netherite_ingot', 9, { netherite_block: 1 }],
  ['netherite_pickaxe', 1, { diamond_pickaxe: 1, netherite_ingot: 1 }, 'table'],
  ['netherite_sword', 1, { diamond_sword: 1, netherite_ingot: 1 }, 'table'],
  ['netherite_axe', 1, { diamond_axe: 1, netherite_ingot: 1 }, 'table'],
  ['netherite_shovel', 1, { diamond_shovel: 1, netherite_ingot: 1 }, 'table'],
  ['netherite_hoe', 1, { diamond_hoe: 1, netherite_ingot: 1 }, 'table'],
  ['netherite_helmet', 1, { diamond_helmet: 1, netherite_ingot: 1 }, 'table'],
  ['netherite_chestplate', 1, { diamond_chestplate: 1, netherite_ingot: 1 }, 'table'],
  ['netherite_leggings', 1, { diamond_leggings: 1, netherite_ingot: 1 }, 'table'],
  ['netherite_boots', 1, { diamond_boots: 1, netherite_ingot: 1 }, 'table'],
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
  ['cooked_chicken', 1, { chicken: 1 }, 'furnace'],
];

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
  ['oak_log', 1.5], ['birch_log', 1.5], ['spruce_log', 1.5], ['jungle_log', 1.5], ['dark_oak_log', 1.5], ['dark_oak_planks', 1.5], ['oak_planks', 1.5], ['birch_planks', 1.5], ['spruce_planks', 1.5], ['jungle_planks', 1.5], ['bow', 1.5],
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
