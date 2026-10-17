'use strict';
/* Block and item registry, procedural pixel-art textures, and inventory icons. */

const TILE = 16, ATLAS_N = 16;
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
makeTile('bed_top', P => { P.fill(0xb02626, 8); P.speck(0x8a1a1a, 0.2, 5); P.rect(1, 1, 14, 5, 0xeeeeee, 4); for (let i = 0; i < 16; i++) { P.put(i, 0, 0x7a5a32); P.put(i, 15, 0x7a5a32); } });
makeTile('bed_side', P => { pPlanks(0xa8834f)(P); P.rect(0, 2, 16, 7, 0xb02626, 8); P.rect(0, 2, 5, 4, 0xeeeeee, 4); P.rect(0, 13, 2, 3, 0x5a4228); P.rect(14, 13, 2, 3, 0x5a4228); for (let x = 2; x < 14; x++) for (let y = 13; y < 16; y++) P.erase(x, y); });
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
}

/* ---------- registry ---------- */
const DEFS = [];
const ID = Object.create(null);
DEFS[0] = { id: 0, key: 'air', name: 'Air', isBlock: true, solid: false, opaque: false, hardness: 0, faces: [0, 0, 0, 0, 0, 0], color: [255, 255, 255] };
ID.air = 0;
let nextBlockId = 1;

function block(key, name, tex, o = {}) {
  const id = nextBlockId++;
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
block('oak_leaves', 'Oak Leaves', 'leaves_oak', Object.assign({ drop: (r) => (r() < 0.06 ? [['apple', 1]] : r() < 0.08 ? [['stick', 1]] : r() < 0.1 ? [['oak_leaves', 1]] : []) }, LEAVES));
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
block('glass', 'Glass', 'glass', { opaque: false, cutout: true, hardness: 0.3, drop: null });
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
block('birch_leaves', 'Birch Leaves', 'leaves_birch', Object.assign({ drop: (r) => (r() < 0.06 ? [['stick', 1]] : r() < 0.1 ? [['birch_leaves', 1]] : []) }, LEAVES));
block('birch_planks', 'Birch Planks', 'planks_birch', { tool: 'axe', hardness: 2 });
block('spruce_log', 'Spruce Log', { top: 'log_spruce_top', side: 'log_spruce' }, { tool: 'axe', hardness: 2 });
block('spruce_leaves', 'Spruce Leaves', 'leaves_spruce', Object.assign({ drop: (r) => (r() < 0.06 ? [['stick', 1]] : r() < 0.1 ? [['spruce_leaves', 1]] : []) }, LEAVES));
block('spruce_planks', 'Spruce Planks', 'planks_spruce', { tool: 'axe', hardness: 2 });
block('netherrack', 'Netherrack', 'netherrack', PICK(1, 0.4));
block('glowstone', 'Glowstone', 'glowstone', { hardness: 0.3, light: true });
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
block('tall_grass', 'Tall Grass', 'tall_grass', Object.assign({ drop: null, replaceable: true }, CROSS));
block('dead_bush', 'Dead Bush', 'dead_bush', Object.assign({ drop: (r) => (r() < 0.5 ? [['stick', 1]] : []), replaceable: true }, CROSS));
block('red_mushroom', 'Red Mushroom', 'red_mushroom', CROSS);
block('brown_mushroom', 'Brown Mushroom', 'brown_mushroom', CROSS);
block('soul_sand', 'Soul Sand', 'soul_sand', { tool: 'shovel', hardness: 0.5 });
block('nether_bricks', 'Nether Bricks', 'nether_bricks', PICK(1, 2));
block('nether_quartz_ore', 'Nether Quartz Ore', 'nether_quartz_ore', PICK(1, 3, { drop: 'quartz', xp: 2 }));
block('nether_gold_ore', 'Nether Gold Ore', 'nether_gold_ore', PICK(1, 3, { drop: 'gold_ingot', xp: 1 }));
block('magma', 'Magma Block', 'magma', PICK(1, 0.5, { light: true }));
block('bed', 'Bed', { top: 'bed_top', side: 'bed_side', bottom: 'planks_oak' }, { tool: 'axe', hardness: 0.2 });
block('nether_portal', 'Nether Portal', 'portal', { solid: false, opaque: false, translucent: true, hardness: 0, drop: null, light: true, portal: true });

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

function getDrops(def, rng) {
  if (def.drop === null) return [];
  if (def.drop === undefined) return [[def.id, 1]];
  if (typeof def.drop === 'string') return [[ID[def.drop], 1]];
  return def.drop(rng).map(([k, n]) => [ID[k], n]);
}

/* ---------- recipes ---------- */
// [output, count, {input: count}, station]   '#planks' / '#log' match any wood type
const GROUPS = {
  '#planks': ['oak_planks', 'birch_planks', 'spruce_planks'],
  '#log': ['oak_log', 'birch_log', 'spruce_log'],
  '#wool': ['wool_white', 'wool_red', 'wool_blue', 'wool_green', 'wool_yellow', 'wool_black', 'wool_orange', 'wool_purple'],
};
const RECIPES = [
  ['oak_planks', 4, { oak_log: 1 }], ['birch_planks', 4, { birch_log: 1 }], ['spruce_planks', 4, { spruce_log: 1 }],
  ['stick', 4, { '#planks': 2 }],
  ['crafting_table', 1, { '#planks': 4 }],
  ['furnace', 1, { cobblestone: 8 }, 'table'],
  ['wooden_pickaxe', 1, { '#planks': 3, stick: 2 }, 'table'],
  ['stone_pickaxe', 1, { cobblestone: 3, stick: 2 }, 'table'],
  ['iron_pickaxe', 1, { iron_ingot: 3, stick: 2 }, 'table'],
  ['golden_pickaxe', 1, { gold_ingot: 3, stick: 2 }, 'table'],
  ['diamond_pickaxe', 1, { diamond: 3, stick: 2 }, 'table'],
  ['wooden_sword', 1, { '#planks': 2, stick: 1 }, 'table'],
  ['stone_sword', 1, { cobblestone: 2, stick: 1 }, 'table'],
  ['iron_sword', 1, { iron_ingot: 2, stick: 1 }, 'table'],
  ['golden_sword', 1, { gold_ingot: 2, stick: 1 }, 'table'],
  ['diamond_sword', 1, { diamond: 2, stick: 1 }, 'table'],
  ['wooden_shovel', 1, { '#planks': 1, stick: 2 }, 'table'],
  ['wooden_axe', 1, { '#planks': 3, stick: 2 }, 'table'],
  ['stone_shovel', 1, { cobblestone: 1, stick: 2 }, 'table'],
  ['stone_axe', 1, { cobblestone: 3, stick: 2 }, 'table'],
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
  ['hay_bale', 1, { tall_grass: 9 }],
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
  if (def.isBlock && !def.cross) {
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
