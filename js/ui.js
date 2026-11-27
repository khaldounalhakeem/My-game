'use strict';
/* HUD, inventory/crafting screens, menus and input (keyboard, mouse, touch). */

const $ = id => document.getElementById(id);

function pixelIcon(rows, pal) {
  const c = document.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const x = c.getContext('2d');
  rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) if (pal[r[i]]) { x.fillStyle = pal[r[i]]; x.fillRect(i, y, 1, 1); } });
  return c.toDataURL();
}
const HEART = ['.XX...XX.', 'XWRX.XRRX', 'XRRRXRRRX', 'XRRRRRRRX', '.XRRRRRX.', '..XRRRX..', '...XRX...', '....X....'];
const HEART_HALF = ['.XX...XX.', 'XWRX.XEEX', 'XRRRXEEEX', 'XRRREEEEX', '.XRRREEX.', '..XRREX..', '...XRX...', '....X....'];
const FOOD = ['....XXX..', '...XmmmX.', '..XmMmmX.', '..XmmmmX.', '...XmmX..', '..XbX....', '.XbX.....', 'XbbX.....', '.XX......'];
const FOOD_HALF = ['....XXX..', '...XEEEX.', '..XmEEEX.', '..XmmEEX.', '...XmmX..', '..XbX....', '.XbX.....', 'XbbX.....', '.XX......'];
const ARMOR_ICON = ['XX...XX', 'XWAXAAX', 'XAAAAAX', '.XAAAX.', '.XAAAX.', '.XAAAX.', '..XXX..'];
const ARMOR_ICON_HALF = ['XX...XX', 'XWAXEEX', 'XAAAEEX', '.XAAEX.', '.XAAEX.', '.XAAEX.', '..XXX..'];
const BUBBLE = ['..XXX..', '.XWBBX.', 'XWBBBBX', 'XBBBBBX', 'XBBBBBX', '.XBBBX.', '..XXX..'];
const ICONS = {
  heart: pixelIcon(HEART, { X: '#1a0707', R: '#e3262b', W: '#ff9a9a' }),
  heartHalf: pixelIcon(HEART_HALF, { X: '#1a0707', R: '#e3262b', W: '#ff9a9a', E: '#3a1515' }),
  heartEmpty: pixelIcon(HEART, { X: '#1a0707', R: '#3a1515', W: '#3a1515' }),
  food: pixelIcon(FOOD, { X: '#1f1208', m: '#c8762e', M: '#f0a860', b: '#efe9dc' }),
  foodHalf: pixelIcon(FOOD_HALF, { X: '#1f1208', m: '#c8762e', M: '#f0a860', b: '#efe9dc', E: '#3a2410' }),
  foodEmpty: pixelIcon(FOOD, { X: '#1f1208', m: '#3a2410', M: '#3a2410', b: '#5a4a3a' }),
  bubble: pixelIcon(BUBBLE, { X: '#0d2a5a', B: '#3a8af0', W: '#c8e4ff' }),
  armor: pixelIcon(ARMOR_ICON, { X: '#1a1a1a', A: '#d8d8d8', W: '#ffffff' }),
  armorHalf: pixelIcon(ARMOR_ICON_HALF, { X: '#1a1a1a', A: '#d8d8d8', W: '#ffffff', E: '#3a3a3a' }),
  armorEmpty: pixelIcon(ARMOR_ICON, { X: '#1a1a1a', A: '#3a3a3a', W: '#3a3a3a' }),
};

/* ---------- input ---------- */
const Input = {
  keys: Object.create(null), moveX: 0, moveZ: 0, jump: false, sneak: false, sprint: false, flyToggle: false,
  left: false, leftPressed: false, right: false, rightPressed: false, middlePressed: false,
  lookDX: 0, lookDY: 0, sens: 1, locked: false, fallback: false, touch: false,
  joy: { x: 0, y: 0, id: null }, tJump: false, tSneak: false, lastSpace: 0,
};

/* recipes are always listed in the same order as Minecraft's creative inventory:
   building blocks, colored blocks, natural, functional, redstone, tools, combat, food, ingredients */
const MC_ORDER = (() => {
  const woods = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'crimson', 'warped'];
  const colors = ['white', 'light_gray', 'gray', 'black', 'brown', 'red', 'orange', 'yellow', 'lime', 'green', 'cyan', 'light_blue', 'blue', 'purple', 'magenta', 'pink'];
  const mats = ['wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite'];
  const o = [];
  for (const w of woods) for (const t of ['planks', 'stairs', 'slab', 'fence', 'fence_gate', 'door', 'trapdoor']) o.push(w + '_' + t);
  o.push('bamboo_block', 'bamboo_planks');
  o.push('stone_slab', 'cobblestone_stairs', 'cobblestone_slab', 'mossy_cobblestone', 'stone_bricks', 'stone_brick_stairs', 'stone_brick_slab',
    'sandstone', 'sandstone_slab', 'bricks', 'brick_slab', 'nether_bricks', 'nether_brick_slab', 'blackstone_slab', 'quartz_block', 'quartz_slab',
    'coal_block', 'iron_block', 'gold_block', 'redstone_block', 'emerald_block', 'lapis_block', 'diamond_block', 'netherite_block');
  for (const c of colors) o.push('wool_' + c);
  for (const c of colors) o.push('stained_glass_' + c);
  o.push('glass_pane');
  for (const c of colors) o.push('stained_glass_pane_' + c);
  o.push('bed', 'flag');
  o.push('melon', 'pumpkin', 'hay_bale', 'glowstone', 'pumpkin_seeds', 'bamboo', 'sugar_cane');
  o.push('torch', 'lantern', 'crafting_table', 'fletching_table', 'grindstone', 'furnace', 'smoker', 'blast_furnace', 'composter', 'enchanting_table', 'anvil', 'smithing_table', 'beacon', 'lectern', 'bookshelf', 'ladder', 'oak_sign', 'chest', 'ender_chest', 'dog_bed', 'shulker_box', 'shulker_box_white', 'shulker_box_red', 'shulker_box_orange', 'shulker_box_yellow', 'shulker_box_green', 'shulker_box_blue', 'shulker_box_black');
  o.push('redstone', 'redstone_torch', 'redstone_block', 'repeater', 'redstone_lamp_0', 'iron_door', 'lever', 'stone_button', 'oak_button', 'stone_pressure_plate', 'oak_pressure_plate', 'tnt');
  for (const m of mats) for (const t of ['shovel', 'pickaxe', 'axe', 'hoe']) o.push(m + '_' + t);
  o.push('bucket', 'powder_snow_bucket', 'flint_and_steel', 'lead', 'name_tag', 'boat', 'saddle', 'eye_of_ender');
  for (const m of mats) o.push(m + '_sword');
  for (const m of ['leather', 'chainmail', 'iron', 'golden', 'diamond', 'netherite']) for (const t of ['helmet', 'chestplate', 'leggings', 'boots']) o.push(m + '_' + t);
  for (const m of ['leather', 'iron', 'golden', 'diamond']) o.push(m + '_horse_armor');
  o.push('bow', 'arrow');
  o.push('golden_apple', 'melon_slice', 'bread', 'cookie', 'cake');
  o.push('coal', 'emerald', 'lapis', 'diamond', 'quartz', 'iron_ingot', 'gold_ingot', 'netherite_ingot', 'stick', 'wheat', 'leather', 'paper', 'book', 'enchanted_book', 'blaze_powder', 'nether_star');
  const m = {}; o.forEach((k, i) => { if (!(k in m)) m[k] = i; });
  return m;
})();
const mcRank = k => (k in MC_ORDER ? MC_ORDER[k] : 100000 + (ID[k] || 0));

const UI = {
  cursor: null, station: null, invVersion: -1, sel: -1, sig: '', tab: 'blocks',

  init() {
    this.hotbar = $('hotbar');
    this.hotSlots = [];
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = '<img alt=""><span class="count"></span>';
      s.addEventListener('pointerdown', e => { if (G.state === 'play') { e.stopPropagation(); G.player.sel = i; this.selectionChanged(); } });
      this.hotbar.appendChild(s); this.hotSlots.push(s);
    }
    this.buildInvGrid();
    this.bindMenus();
    this.bindInput();
    window.addEventListener('pointermove', e => { this.mouseX = e.clientX; this.mouseY = e.clientY; this.moveCursor(); });
  },

  /* ---------- messages & effects ---------- */
  message(text, tone) {
    const p = document.createElement('p');
    p.textContent = text;
    if (tone) p.className = 'tone-' + tone;
    $('messages').appendChild(p);
    setTimeout(() => p.classList.add('fade'), 5000);
    setTimeout(() => p.remove(), 6500);
    const all = $('messages').children;
    if (all.length > 6) all[0].remove();
  },
  /* a short note under the crosshair saying what just hurt you and how many hearts */
  damagePopup(amount, cause) {
    const el = $('dmg-popup');
    const hearts = amount / 2;
    const short = (cause || '').replace(/^You were |^You |^A |^An |^The /, '').replace(/\..*$/, '');
    el.textContent = '-' + (hearts % 1 ? hearts.toFixed(1) : hearts) + ' ♥  ' + short;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  },
  hurtFlash() {
    const o = $('fx-hurt');
    o.classList.remove('on'); void o.offsetWidth; o.classList.add('on');
  },
  selectionChanged() {
    const d = G.player.heldDef();
    const n = $('itemname');
    n.textContent = d ? d.name : '';
    n.classList.remove('show'); void n.offsetWidth; if (d) n.classList.add('show');
  },

  /* ---------- per-frame HUD ---------- */
  update() {
    const P = G.player;
    if (P.inv.version !== this.invVersion || P.sel !== this.sel) {
      if (P.sel !== this.sel && this.sel !== -1) this.selectionChanged();
      this.invVersion = P.inv.version; this.sel = P.sel;
      this.renderHotbar();
      if (G.state === 'inventory') this.renderInventory();
    }
    const survival = P.mode === 'survival';
    $('stats').hidden = !survival;
    const armorPts = P.inv.armorPoints();
    const sig = [armorPts, Math.ceil(P.health), Math.ceil(P.hunger), Math.ceil(P.air), P.level, Math.round(P.xp / (7 + P.level * 2) * 50), P.headInWater].join('|');
    if (sig !== this.sig) {
      this.sig = sig;
      $('hearts').innerHTML = this.row(P.health, 'heart');
      $('armor').innerHTML = armorPts ? this.row(armorPts, 'armor') : '';
      $('food').innerHTML = this.row(P.hunger, 'food');
      const air = P.headInWater || P.air < 15;
      $('air').innerHTML = air ? Array.from({ length: Math.ceil(Math.max(0, P.air) / 1.5) }, () => `<img src="${ICONS.bubble}" alt="">`).join('') : '';
      $('xpfill').style.width = (P.xp / (7 + P.level * 2) * 100) + '%';
      $('level').textContent = P.level > 0 ? P.level : '';
    }
    // boss bar
    let boss = null;
    for (const d of G.dragons) if (!d.done && d.pos.distanceTo(P.pos) < 180) { boss = d; break; }
    if (!boss) for (const m of G.mobs) if (m.T.boss && !m.dead && m.pos.distanceTo(P.pos) < 120) { boss = { name: m.T.name, hp: m.hp, maxHp: m.T.hp, K: { eye: 0x8a3ac8 } }; break; }
    $('bossbar').hidden = !boss;
    if (boss) { $('bossname').textContent = boss.name; $('bossfill').style.width = (Math.max(0, boss.hp) / boss.maxHp * 100) + '%'; $('bossfill').style.background = '#' + boss.K.eye.toString(16).padStart(6, '0'); }
    $('fx-water').classList.toggle('on', P.headInWater);
    $('fx-fire').classList.toggle('on', P.fire > 0 && survival);
  },

  row(v, kind) {
    let h = '';
    for (let i = 0; i < 10; i++) {
      const left = v - i * 2;
      const src = left >= 2 ? ICONS[kind] : left >= 1 ? ICONS[kind + 'Half'] : ICONS[kind + 'Empty'];
      h += `<img src="${src}" alt="">`;
    }
    return h;
  },

  fillSlot(el, s) {
    const img = el.firstChild, cnt = el.lastChild;
    if (s) {
      const url = iconURL(s.id);
      if (img.getAttribute('src') !== url) img.src = url;
      img.style.visibility = 'visible';
      cnt.textContent = s.count > 1 ? s.count : '';
      el.dataset.name = (s.n ? '“' + s.n + '” ' + DEFS[s.id].name : DEFS[s.id].name) + (s.e ? ' (' + enchText(s.e) + ')' : '') + (s.c ? ' (' + s.c.filter(Boolean).length + ' stacks inside)' : '');
      el.classList.toggle('ench', !!s.e);
    } else {
      img.style.visibility = 'hidden'; cnt.textContent = ''; el.dataset.name = ''; el.classList.remove('ench');
    }
  },

  renderHotbar() {
    const P = G.player;
    this.hotSlots.forEach((el, i) => { this.fillSlot(el, P.inv.slots[i]); el.classList.toggle('sel', i === P.sel); });
  },

  /* ---------- inventory screen ---------- */
  buildInvGrid() {
    this.invSlots = [];
    const mk = (parent, i) => {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = '<img alt=""><span class="count"></span>';
      s.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.closeSplit();
        const fsig = this.furnSig();
        // picking up a whole stack: a little "Take half" button pops up on that slot
        const st = !e.shiftKey && !this.cursor && i !== 202 && e.button !== 2 ? this.slotBox(i) : null;
        const big = st && st.box[st.k] && st.box[st.k].count > 1 ? st.box[st.k].count : 0;
        this.clickSlot(i, e.button, e.shiftKey);
        if (big && this.cursor && this.cursor.count === big) this.openSplit(i, s);
        this.furnaceEdited(fsig);
      });
      s.addEventListener('contextmenu', e => e.preventDefault());
      s.addEventListener('pointerenter', () => this.tip(s.dataset.name));
      s.addEventListener('pointerleave', () => this.tip(''));
      parent.appendChild(s);
      this.invSlots[i] = s;
    };
    for (let i = 36; i < 40; i++) { mk($('inv-armor'), i); this.invSlots[i].dataset.hint = ['Head', 'Chest', 'Legs', 'Feet'][i - 36]; }
    for (let i = 100; i < 127; i++) mk($('inv-chest'), i);
    mk($('fslot-in'), 200); mk($('fslot-fuel'), 201); mk($('fslot-out'), 202);
    this.invSlots[200].dataset.hint = 'Smelt'; this.invSlots[201].dataset.hint = 'Fuel';
    for (let i = 9; i < 36; i++) mk($('inv-main'), i);
    for (let i = 0; i < 9; i++) mk($('inv-hot'), i);
    $('cat-search').addEventListener('input', () => this.renderSide());
    $('craft-search').addEventListener('input', () => this.renderRecipes());
    $('craft-search').addEventListener('keydown', e => e.stopPropagation()); // typing E or W here shouldn't close the inventory or walk
    for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { this.tab = b.dataset.tab; this.renderSide(); });
    $('trash').addEventListener('pointerdown', e => { e.preventDefault(); this.cursor = null; this.moveCursor(); });
    document.addEventListener('pointerdown', e => {
      if (G.state !== 'inventory' || !this.cursor || e.target.closest('#menu-inv .panel, #hotbar, button')) return;
      e.preventDefault(); e.stopPropagation();
      this.throwCursor(e.button === 2);
    }, true);
    $('menu-inv').addEventListener('contextmenu', e => e.preventDefault());
    $('btn-chest-all').addEventListener('click', () => this.takeAll());
  },

  tip(text) {
    const t = $('tooltip');
    t.textContent = text || '';
    t.hidden = !text;
    this.moveCursor();
  },

  moveCursor() {
    const c = $('cursor'), t = $('tooltip');
    c.style.transform = `translate(${this.mouseX - 20}px, ${this.mouseY - 20}px)`;
    t.style.transform = `translate(${this.mouseX + 16}px, ${this.mouseY - 34}px)`;
    if (this.cursor) {
      c.hidden = false;
      c.firstChild.src = iconURL(this.cursor.id);
      c.lastChild.textContent = this.cursor.count > 1 ? this.cursor.count : '';
    } else c.hidden = true;
  },

  /* a click on one of the open chest's slots (ids 100-126) */
  clickChest(k, button, shift, other) {
    const box = other || (this.chest && this.chest.slots), inv = G.player.inv;
    if (!box) return;
    const s = box[k], cur = this.cursor;
    if (shift && s && !cur) {
      const left = inv.add(s.id, s.count);
      if (left) s.count = left; else box[k] = null;
    } else if (button === 2) {
      if (!cur && s) { const half = Math.ceil(s.count / 2); this.cursor = copySlot(s, half); s.count -= half; if (!s.count) box[k] = null; }
      else if (cur && (!s || (sameStack(s, cur) && s.count < DEFS[s.id].stack))) {
        if (!s) box[k] = copySlot(cur, 1); else s.count++;
        cur.count--; if (!cur.count) this.cursor = null;
      }
    } else {
      if (!cur) { this.cursor = s; box[k] = null; }
      else if (!s) { box[k] = cur; this.cursor = null; }
      else if (sameStack(s, cur)) { const n = Math.min(DEFS[s.id].stack - s.count, cur.count); s.count += n; cur.count -= n; if (!cur.count) this.cursor = null; }
      else { box[k] = cur; this.cursor = s; }
    }
    G.sound.play('click');
    inv.changed();
    if (!other) this.chestEdited();
    this.renderInventory();
    this.moveCursor();
  },

  chestEdited() { if (this.chest && !this.chest.mob && !this.chest.ender) G.chestChanged(G.chestKey(this.chest.x, this.chest.y, this.chest.z)); },

  /* shift-click from your inventory into the open chest */
  toChest(i) {
    const box = this.chest.slots, inv = G.player.inv, s = inv.slots[i];
    const max = DEFS[s.id].stack;
    for (let k = 0; k < 27 && s.count; k++) { const t = box[k]; if (t && sameStack(t, s) && t.count < max) { const n = Math.min(max - t.count, s.count); t.count += n; s.count -= n; } }
    for (let k = 0; k < 27 && s.count; k++) if (!box[k]) { box[k] = Object.assign({}, s); s.count = 0; }
    if (!s.count) inv.slots[i] = null;
    G.sound.play('click'); inv.changed(); this.chestEdited(); this.renderInventory();
  },

  takeAll() {
    const box = this.chest && this.chest.slots, inv = G.player.inv;
    if (!box) return;
    for (let k = 0; k < 27; k++) if (box[k]) { const left = inv.add(box[k].id, box[k].count); if (left) box[k].count = left; else box[k] = null; }
    G.sound.play('pickup'); inv.changed(); this.chestEdited(); this.renderInventory();
  },

  /* furnace slots: 0 = what to smelt, 1 = fuel, 2 = the result (you can only take from it) */
  clickFurnace(k, button, shift) {
    const f = this.furnace, inv = G.player.inv;
    if (!f) return;
    const box = f.slots, s = box[k], cur = this.cursor;
    if (k === 2) {
      if (!s) return;
      if (shift) { const left = inv.add(s.id, s.count); if (left) s.count = left; else box[2] = null; }
      else if (!cur) { this.cursor = s; box[2] = null; }
      else if (cur.id === s.id && cur.count + s.count <= DEFS[s.id].stack) { cur.count += s.count; box[2] = null; }
      else return;
      this.furnaceXp();
    } else {
      if (cur && k === 1 && !FUEL[cur.id]) { G.ui.message(DEFS[cur.id].name + ' can\'t be used as fuel. Try coal, wood or planks.'); return; }
      if (cur && k === 0 && !SMELT[cur.id]) { G.ui.message(DEFS[cur.id].name + ' can\'t be smelted.'); return; }
      return this.clickChest(k, button, shift, box);
    }
    G.sound.play('click'); inv.changed(); this.renderInventory(); this.moveCursor();
  },

  /* XP from smelting goes to whoever takes the result out */
  furnaceXp() {
    const f = this.furnace;
    if (!f || f.xp <= 0) return;
    let n = Math.floor(f.xp);
    if (Math.random() < f.xp - n) n++;
    f.xp = 0;
    if (n) G.player.addXp(n);
  },

  toFurnace(i) {
    const f = this.furnace, inv = G.player.inv, s = inv.slots[i];
    const k = SMELT[s.id] ? 0 : FUEL[s.id] ? 1 : -1;
    if (k < 0) { G.ui.message(DEFS[s.id].name + ' can\'t be smelted or burned.'); return; }
    const t = f.slots[k], max = DEFS[s.id].stack;
    if (!t) { f.slots[k] = Object.assign({}, s); inv.slots[i] = null; }
    else if (sameStack(t, s)) { const n = Math.min(max - t.count, s.count); t.count += n; s.count -= n; if (!s.count) inv.slots[i] = null; }
    else return;
    G.sound.play('click'); inv.changed(); this.renderInventory();
  },

  renderFurnace() {
    const f = this.furnace;
    if (!f) return;
    if (DEFS[G.world.getBlock(f.x, f.y, f.z)].base !== 'furnace') { this.closeInventory(); return; }
    for (let k = 0; k < 3; k++) { this.fillSlot(this.invSlots[200 + k], f.slots[k]); this.invSlots[200 + k].classList.toggle('empty', !f.slots[k]); }
    $('f-flame').style.height = (f.burnMax ? Math.round(100 * f.burn / f.burnMax) : 0) + '%';
    $('f-arrow').style.width = Math.round(100 * f.cook / SMELT_TIME) + '%';
    const st = !f.slots[0] ? (f.burn > 0 ? 'Fire saved for later: put something to smelt on top' : 'Put something to smelt on top')
      : !SMELT[f.slots[0].id] ? 'That can\'t be smelted' : f.burn > 0 ? 'Smelting...' : !f.slots[1] ? 'Add fuel below (coal, wood or planks)' : '';
    if ($('f-status').textContent !== st) $('f-status').textContent = st;
  },

  /* which list a slot number belongs to: your inventory, the open chest, or the furnace */
  slotBox(i) {
    if (i >= 200) return this.furnace ? { box: this.furnace.slots, k: i - 200 } : null;
    if (i >= 100) return this.chest ? { box: this.chest.slots, k: i - 100 } : null;
    return { box: G.player.inv.slots, k: i };
  },

  /* you just picked up a whole stack from slot i: offer to leave half of it there */
  openSplit(i, el) {
    let b = $('split-pop');
    if (!b) {
      b = document.createElement('button'); b.type = 'button'; b.id = 'split-pop'; b.textContent = 'Take half';
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.takeSplit(); });
      document.body.appendChild(b);
    }
    const r = el.getBoundingClientRect();
    b.style.left = (r.left + r.width / 2) + 'px';
    b.style.top = r.top + 'px';
    b.hidden = false;
    this.split = { i };
  },
  closeSplit() { const b = $('split-pop'); if (b) b.hidden = true; this.split = null; },
  /* what's in the open furnace, to notice when you change it (so your friends see it too) */
  furnSig() { const f = this.furnace; return f ? JSON.stringify(f.slots) : null; },
  furnaceEdited(before) {
    const f = this.furnace;
    if (!f || before === null || JSON.stringify(f.slots) === before) return;
    G.furnaceChanged(G.chestKey(f.x, f.y, f.z), true);
  },
  takeSplit() {
    const fsig = this.furnSig();
    setTimeout(() => this.furnaceEdited(fsig), 0);
    const sp = this.split, cur = this.cursor;
    this.closeSplit();
    if (!sp || !cur || cur.count < 2) return;
    const st = this.slotBox(sp.i);
    if (!st || st.box[st.k]) return;
    const back = Math.floor(cur.count / 2);
    st.box[st.k] = copySlot(cur, back);
    cur.count -= back;
    G.sound.play('click');
    G.player.inv.changed();
    if (sp.i >= 100 && sp.i < 200) this.chestEdited();
    this.renderInventory();
    this.moveCursor();
  },

  clickSlot(i, button, shift) {
    if (i >= 200) return this.clickFurnace(i - 200, button, shift);
    if (i >= 100) return this.clickChest(i - 100, button, shift);
    if (shift && this.chest && G.player.inv.slots[i] && !this.cursor && i < 36) return this.toChest(i);
    if (shift && this.furnace && G.player.inv.slots[i] && !this.cursor && i < 36) return this.toFurnace(i);
    const inv = G.player.inv, s = inv.slots[i], cur = this.cursor;
    // armor slots only take the matching piece
    if (i >= 36 && cur && !(DEFS[cur.id].armor && DEFS[cur.id].armor.slot === i - 36)) { G.ui.message('That slot is for ' + ['helmets', 'chestplates', 'leggings', 'boots'][i - 36] + '.'); return; }
    if (shift && s && !cur && i < 36 && DEFS[s.id].armor && !inv.slots[36 + DEFS[s.id].armor.slot]) {
      inv.slots[36 + DEFS[s.id].armor.slot] = s; inv.slots[i] = null; inv.changed(); G.sound.play('click'); return;
    }
    if (shift && s && !cur && i >= 36) {
      for (let k = 9; k < 36; k++) if (!inv.slots[k]) { inv.slots[k] = s; inv.slots[i] = null; break; }
      inv.changed(); G.sound.play('click'); return;
    }
    if (shift && s && !cur) {
      const [a, b] = i < 9 ? [9, 36] : [0, 9];
      const max = DEFS[s.id].stack;
      for (let k = a; k < b && s.count; k++) { const t = inv.slots[k]; if (t && sameStack(t, s) && t.count < max) { const n = Math.min(max - t.count, s.count); t.count += n; s.count -= n; } }
      for (let k = a; k < b && s.count; k++) if (!inv.slots[k]) { inv.slots[k] = Object.assign({}, s); s.count = 0; }
      if (!s.count) inv.slots[i] = null;
    } else if (button === 2) {
      if (!cur && s) { const half = Math.ceil(s.count / 2); this.cursor = copySlot(s, half); s.count -= half; if (!s.count) inv.slots[i] = null; }
      else if (cur && (!s || (sameStack(s, cur) && s.count < DEFS[s.id].stack))) {
        if (!s) inv.slots[i] = copySlot(cur, 1); else s.count++;
        cur.count--; if (!cur.count) this.cursor = null;
      }
    } else {
      if (!cur) { this.cursor = s; inv.slots[i] = null; }
      else if (!s) { inv.slots[i] = cur; this.cursor = null; }
      else if (sameStack(s, cur)) { const n = Math.min(DEFS[s.id].stack - s.count, cur.count); s.count += n; cur.count -= n; if (!cur.count) this.cursor = null; }
      else { inv.slots[i] = cur; this.cursor = s; }
    }
    G.sound.play('click');
    inv.changed();
    this.moveCursor();
  },

  openInventory(station, chest, furnace) {
    if (G.state !== 'play') return;
    // riding a horse or donkey with a chest: Items opens its chest too
    const rd = G.player.riding;
    if (!station && !chest && !furnace && rd && rd.chestSlots && !rd.remoteCtl) { station = 'chest'; chest = { slots: rd.chestSlots, mob: rd }; }
    this.station = station === 'chest' ? null : station || null;
    this.chest = chest || null;
    this.furnace = furnace || null;
    $('chest-box').hidden = !this.chest;
    $('chest-box').querySelector('.label').textContent = this.chest && this.chest.mob ? 'Chest on your ' + this.chest.mob.T.name.toLowerCase() : this.chest && this.chest.ender ? 'Ender Chest (only yours)' : this.chest && this.chest.shulker ? 'Shulker Box' : 'Chest';
    $('furnace-box').hidden = !this.furnace;
    $('menu-inv').firstElementChild.classList.toggle('with-furnace', !!this.furnace);
    $('menu-inv').firstElementChild.classList.toggle('with-chest', !!this.chest);
    G.setState('inventory');
    $('menu-inv').hidden = false;
    this.renderInventory();
    this.renderSide();
  },

  closeInventory() {
    this.closeSplit();
    if (this.cursor) {
      const left = G.player.inv.add(this.cursor.id, this.cursor.count, this.cursor.e, this.cursor.n, this.cursor.c);
      if (left) { const P = G.player; G.spawnDrop(this.cursor.id, left, P.pos.x, P.pos.y + 1.2, P.pos.z, undefined, slotExtras(this.cursor)); }
      this.cursor = null; this.moveCursor();
    }
    this.tip('');
    this.chest = null; this.furnace = null;
    $('menu-inv').hidden = true;
    G.setState('play');
  },

  renderInventory() {
    const inv = G.player.inv;
    for (let i = 0; i < 40; i++) this.fillSlot(this.invSlots[i], inv.slots[i]);
    for (let i = 36; i < 40; i++) this.invSlots[i].classList.toggle('empty', !inv.slots[i]);
    if (this.furnace) this.renderFurnace();
    if (this.chest) {
      // someone broke the chest while it was open
      // someone broke the chest (or box) while it was open
      const here = this.chest.mob ? 0 : G.world.getBlock(this.chest.x, this.chest.y, this.chest.z);
      const gone = this.chest.mob ? this.chest.mob.dead || this.chest.mob.removed || !this.chest.mob.chestSlots
        : this.chest.ender ? here !== ID.ender_chest : this.chest.shulker ? !DEFS[here].shulker : here !== ID.chest;
      if (gone) { this.closeInventory(); return; }
      for (let k = 0; k < 27; k++) this.fillSlot(this.invSlots[100 + k], this.chest.slots[k]);
    }
    if (G.player.mode === 'survival') this.renderRecipes();
  },

  renderSide() {
    const creative = G.player.mode === 'creative';
    $('side-craft').hidden = creative;
    $('side-creative').hidden = !creative;
    $('trash').hidden = !creative;
    if (creative) this.renderCatalog(); else this.renderRecipes();
  },

  renderCatalog() {
    const q = $('cat-search').value.trim().toLowerCase();
    for (const b of document.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === this.tab);
    const box = $('catalog');
    box.innerHTML = '';
    const ids = [];
    for (const d of DEFS) {
      if (!d || d.id === 0 || d.liquid || d.portal || d.key === 'bed_head' || d.bedPart || d.door || d.trapdoor || d.stair || d.slab || d.ladder || d.gate || d.sign || d.key === 'wheat_sprout') continue;
      // the other versions of a block (switched on, turned, ...) only appear in the world
      if (d.lever || d.button || d.plate || d.wire || d.rsTorch || d.repeater || (d.lamp && d.lamp.on) || (d.base && d.facing !== 's') || (d.beacon && d.beacon.effect)) continue;
      if (q ? !d.name.toLowerCase().includes(q) : (this.tab === 'blocks') !== d.isBlock) continue;
      ids.push(d.id);
    }
    for (const id of ids) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = `<img alt="" src="${iconURL(id)}"><span class="count"></span>`;
      s.dataset.name = DEFS[id].name;
      s.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (this.cursor) { this.cursor = null; }
        else if (e.shiftKey) G.player.inv.add(id, DEFS[id].stack);
        else this.cursor = { id, count: e.button === 2 ? 1 : DEFS[id].stack };
        G.sound.play('click');
        this.moveCursor();
      });
      s.addEventListener('contextmenu', e => e.preventDefault());
      s.addEventListener('pointerenter', () => this.tip(s.dataset.name));
      s.addEventListener('pointerleave', () => this.tip(''));
      box.appendChild(s);
    }
  },

  stationRecipes() {
    const st = this.station;
    return RECIPES.filter(r => (st === 'furnace' ? r[3] === 'furnace' : (!r[3] || (r[3] === 'table' && st === 'table'))));
  },

  have(key) {
    const inv = G.player.inv;
    return (GROUPS[key] || [key]).reduce((a, k) => a + inv.count(ID[k]), 0);
  },

  canCraft(r) { for (const k in r[2]) if (this.have(k) < r[2][k]) return false; return true; },

  craft(r, times) {
    const inv = G.player.inv;
    let made = 0;
    for (let t = 0; t < times && this.canCraft(r); t++) {
      for (const k in r[2]) {
        let n = r[2][k];
        for (const m of GROUPS[k] || [k]) { const take = Math.min(inv.count(ID[m]), n); if (take) { inv.remove(ID[m], take); n -= take; } if (!n) break; }
      }
      const left = inv.add(ID[r[0]], r[1]);
      if (left) { const P = G.player; G.spawnDrop(ID[r[0]], left, P.pos.x, P.pos.y + 1.2, P.pos.z); }
      made++;
    }
    if (made) G.sound.play(this.station === 'furnace' ? 'smelt' : 'craft');
  },

  renderRecipes() {
    const title = { table: 'Crafting Table', furnace: 'Furnace' }[this.station] || 'Crafting';
    $('craft-title').textContent = title;
    $('craft-hint').textContent = this.station === 'furnace' ? 'Put what you want to smelt in the top slot and fuel in the bottom slot. Each item takes 6 seconds. Coal smelts 5 items, wood or planks 1 and a half, a stick half of one.'
      : this.station === 'table' ? 'Every recipe is available here.' : 'Place a Crafting Table and ' + (Input.touch ? 'tap' : 'right-click') + ' it for tools, weapons and more.';
    const list = $('recipes');
    // searching shows every recipe whose result matches, wherever it's made, and what it needs
    const q = ($('craft-search').value || '').trim().toLowerCase();
    const here = new Set(this.stationRecipes());
    const nameOf = k => (DEFS[ID[k]] ? DEFS[ID[k]].name : k);
    const pool = q ? RECIPES.filter(r => nameOf(r[0]).toLowerCase().includes(q) || r[0].replace(/_/g, ' ').includes(q)) : this.stationRecipes();
    // what you can make right now on top, then the rest; each part in Minecraft's creative inventory order
    const rs = pool.map(r => [r, here.has(r) && this.canCraft(r)]);
    rs.sort((a, b) => (b[1] - a[1]) || (mcRank(a[0][0]) - mcRank(b[0][0])));
    list.innerHTML = '';
    if (q && !rs.length) {
      const found = Object.values(ID).map(i => DEFS[i]).find(d => d && d.name.toLowerCase().includes(q));
      const p = document.createElement('p'); p.className = 'hint';
      p.textContent = found ? found.name + " can't be crafted: you find it in the world (mine it, loot it from chests, or get it from mobs)." : 'Nothing called "' + q + '". Try another word.';
      list.appendChild(p);
      return;
    }
    for (const [r, ok] of rs) {
      const row = document.createElement('button');
      row.className = 'recipe' + (ok ? ' ok' : '');
      row.type = 'button';
      const outId = ID[r[0]];
      let ins = '';
      for (const k in r[2]) {
        const opts = GROUPS[k] || [k];
        const shown = opts.find(m => G.player.inv.count(ID[m])) || opts[0];
        const enough = this.have(k) >= r[2][k];
        ins += `<span class="need${enough ? '' : ' short'}"><img alt="" src="${iconURL(ID[shown])}">${r[2][k]}</span>`;
      }
      let extra = '';
      if (q) {
        const needs = Object.keys(r[2]).map(k => r[2][k] + ' ' + (GROUPS[k] ? 'any ' + k.slice(1) : nameOf(k))).join(', ');
        const where = r[3] === 'furnace' ? 'Smelt it in a Furnace' : r[3] === 'table' ? 'Make it at a Crafting Table' : 'Make it anywhere (in your inventory)';
        extra = `<small class="rhow">${where}. Needs ${needs}.</small>`;
      }
      row.innerHTML = `<span class="out"><img alt="" src="${iconURL(outId)}">${r[1] > 1 ? '<b>' + r[1] + '</b>' : ''}</span><span class="rname">${DEFS[outId].name}${extra}</span><span class="ins">${ins}</span>`;
      if (q && !here.has(r)) { row.className = 'recipe guide'; row.title = r[3] === 'furnace' ? 'Smelt it in a furnace' : 'Make it at a crafting table'; list.appendChild(row); continue; }
      if (this.station === 'furnace') { row.className = 'recipe guide' + (ok ? ' ok' : ''); row.title = 'Put it in the furnace to smelt it'; list.appendChild(row); continue; }
      row.title = ok ? 'Click to craft. Shift-click crafts as many as you can.' : 'Missing ingredients';
      row.addEventListener('click', e => { if (ok) { this.craft(r, e.shiftKey ? 64 : 1); this.renderInventory(); } });
      list.appendChild(row);
    }
  },

  /* ---------- menus ---------- */
  /* the arrow above the XP bar that points to the closest friend in this world */
  /* "Show flag": a big arrow in the middle of the screen pointing to your flag */
  toggleFlag() {
    if (!G.myFlag) { G.showFlag = false; this.message('You have no flag yet. Craft one from 2 sticks and 3 wool, then place it.'); return; }
    G.showFlag = !G.showFlag;
    if (G.showFlag && G.myFlag.dim !== G.dim) this.message('Your flag is in the ' + { overworld: 'Overworld', nether: 'Nether', end: 'End' }[G.myFlag.dim] + '.');
  },
  updateFlagArrow() {
    const btn = $('btn-flag'), box = $('flag-arrow'), playing = G.state === 'play';
    const showBtn = playing && !!G.myFlag;
    if (btn.hidden === showBtn) btn.hidden = !showBtn;
    btn.textContent = G.showFlag ? 'Hide flag' : 'Show flag';
    const f = G.myFlag, on = playing && G.showFlag && f && f.dim === G.dim;
    if (!on) { if (!box.hidden) box.hidden = true; return; }
    box.hidden = false;
    const P = G.player, fx = f.x + 0.5, fz = f.z + 0.5, d = Math.hypot(fx - P.pos.x, fz - P.pos.z);
    const rel = Math.atan2(-(fx - P.pos.x), -(fz - P.pos.z)) - P.yaw;
    box.firstElementChild.style.transform = 'rotate(' + (-rel * 180 / Math.PI).toFixed(1) + 'deg)';
    const up = f.y - P.pos.y, ud = Math.abs(up) > 4 ? (up > 0 ? ' up' : ' down') : '';
    const text = d < 2 ? 'You are at your flag!' : 'Your flag · ' + Math.round(d) + ' blocks' + ud;
    if (this.flagText !== text) { this.flagText = text; $('flag-label').textContent = text; }
  },

  updateFriendArrow() {
    const P = G.player, box = $('friend-arrow');
    let best = null, bd = Infinity;
    if (G.state === 'play' || G.state === 'inventory') {
      for (const rp of Net.peers.values()) {
        if (!rp.inWorld || !rp.model || rp.dim !== G.dim) continue;
        const q = rp.model.group.position, d = Math.hypot(q.x - P.pos.x, q.z - P.pos.z);
        if (d < bd) { bd = d; best = rp; }
      }
    }
    if (!best) { if (!box.hidden) box.hidden = true; return; }
    box.hidden = false;
    const q = best.model.group.position;
    // turn the arrow so straight up means "walk forward"
    const want = Math.atan2(-(q.x - P.pos.x), -(q.z - P.pos.z));
    const rel = want - P.yaw;
    box.firstElementChild.style.transform = 'rotate(' + (-rel * 180 / Math.PI).toFixed(1) + 'deg)';
    const up = q.y - P.pos.y, ud = Math.abs(up) > 4 ? (up > 0 ? ' up' : ' down') : '';
    const text = (best.name || 'Friend') + ' · ' + Math.round(bd) + ' blocks' + ud;
    if (this.friendText !== text) { this.friendText = text; $('friend-label').textContent = text; }
  },

  /* tap outside the inventory box while holding items: throw them out in front of you (right-click throws one) */
  throwCursor(one) {
    const cur = this.cursor;
    if (!cur) return;
    const n = one ? 1 : cur.count, P = G.player, d = P.lookDir(), o = P.eyePos();
    const drop = G.spawnDrop(cur.id, n, o.x + d.x * 0.6, o.y - 0.3, o.z + d.z * 0.6, d.clone().multiplyScalar(6).setY(d.y * 6 + 2));
    drop.pickDelay = 1.5;
    cur.count -= n;
    if (cur.count <= 0) this.cursor = null;
    G.sound.play('click');
    this.moveCursor();
  },

  /* the sign editor: up to four short lines */
  editSign(x, y, z) {
    if (G.state !== 'play') return;
    this.signAt = [x, y, z];
    const lines = G.signs[G.chestKey(x, y, z)] || [];
    document.querySelectorAll('.sign-line').forEach((el, i) => { el.value = lines[i] || ''; });
    G.setState('sign');
    $('menu-sign').hidden = false;
    G.unlock();
    setTimeout(() => document.querySelector('.sign-line').focus(), 50);
  },

  closeSign() {
    if (!this.signAt) return;
    const lines = [...document.querySelectorAll('.sign-line')].map(el => el.value);
    const [x, y, z] = this.signAt;
    if (DEFS[G.world.getBlock(x, y, z)].sign) G.setSign(x, y, z, lines);
    this.signAt = null;
    $('menu-sign').hidden = true;
    G.resume();
  },

  /* ---------- main menu pages ---------- */
  titlePage(name) {
    for (const pg of document.querySelectorAll('.title-page')) pg.hidden = pg.dataset.page !== name;
    $('menu-start').classList.toggle('sub', name !== 'main');
    // the seed box sits on whichever page needs it
    const slot = document.querySelector('.title-page[data-page="' + name + '"] .seed-slot');
    $('seed-row').hidden = !slot;
    if (slot) slot.appendChild($('seed-row'));
    const dslot = document.querySelector('.title-page[data-page="' + name + '"] .diff-slot');
    $('diff-row').hidden = !dslot;
    if (dslot) { dslot.appendChild($('diff-row')); this.renderDiff(); }
    if (name === 'skins') this.renderSkins();
    if (name === 'single') this.renderWorldList();
    if (name === 'create' || name === 'multi') this.seedHints();
    if (G.sound && G.state === 'title') G.sound.play('click');
  },

  /* the list of worlds you have played, newest first */
  renderWorldList() {
    const box = $('world-list');
    if (!box) return;
    box.innerHTML = '';
    const list = G.worldList();
    if (!list.length) { const p = document.createElement('p'); p.className = 'world-empty'; p.textContent = 'No worlds yet. Create one!'; box.appendChild(p); return; }
    for (const w of list) {
      const row = document.createElement('div'); row.className = 'world-row';
      const play = document.createElement('button'); play.type = 'button'; play.className = 'btn world-play';
      const b = document.createElement('b'); b.textContent = w.name || 'My World';
      const sm = document.createElement('small');
      const when = w.last ? new Date(w.last).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
      sm.textContent = 'Seed ' + w.seed + ' · ' + (w.mode === 'creative' ? 'Creative' : 'Survival') + (when ? ' · ' + when : '');
      play.append(b, sm);
      play.addEventListener('click', () => G.continueSaved(w.id));
      const del = document.createElement('button'); del.type = 'button'; del.className = 'btn world-del'; del.textContent = 'Delete';
      del.addEventListener('click', () => { if (confirm('Delete the world "' + (w.name || 'My World') + '"? This can\'t be undone.')) { G.deleteWorld(w.id); this.renderWorldList(); } });
      row.append(play, del);
      box.appendChild(row);
    }
  },

  /* trading with a villager: what it wants and what it gives; tap a trade to make it */
  openTrades(v) {
    if (G.state !== 'play') return;
    const job = VILLAGER_JOBS[v.prof];
    if (!job) { this.message("This villager has no job yet. Put a work block near it: composter (farmer), lectern (librarian), smoker (butcher), blast furnace (armorer), grindstone (weaponsmith), fletching table (fletcher) or smithing table (toolsmith)."); return; }
    G.sound.play('mob_villager', v.pos);
    let box = $('trade-pop');
    if (!box) {
      box = document.createElement('div'); box.id = 'trade-pop'; box.className = 'copy-pick';
      box.innerHTML = '<div class="copy-card trade-card"><h3 class="trade-title"></h3><p class="trade-hint">Tap a trade to make it. You need what is on the left.</p><div class="trade-list"></div><button type="button" class="btn trade-close">Close</button></div>';
      box.addEventListener('pointerdown', e => { if (e.target === box) this.closeTrades(); });
      box.querySelector('.trade-close').addEventListener('click', () => this.closeTrades());
      document.body.appendChild(box);
    }
    this.tradeWith = v;
    box.querySelector('.trade-title').textContent = job.name;
    this.renderTrades();
    box.hidden = false;
    G.setState('trade'); G.unlock();
  },
  renderTrades() {
    const v = this.tradeWith, job = v && VILLAGER_JOBS[v.prof], list = $('trade-pop').querySelector('.trade-list'), inv = G.player.inv;
    list.innerHTML = '';
    if (!job) return;
    const icon = (k, n) => `<span class="need"><img alt="" src="${iconURL(ID[k])}"><b>${n}</b></span>`;
    for (const [give, get] of job.trades) {
      if (give.some(([k]) => ID[k] === undefined) || ID[get[0]] === undefined) continue;
      const ok = give.every(([k, n]) => inv.count(ID[k]) >= n);
      const row = document.createElement('button'); row.type = 'button'; row.className = 'recipe trade' + (ok ? ' ok' : '');
      row.innerHTML = `<span class="ins">${give.map(([k, n]) => icon(k, n)).join('')}</span><span class="arrow">➜</span>${icon(get[0], get[1])}<span class="rname">${DEFS[ID[get[0]]].name}</span>`;
      row.title = give.map(([k, n]) => n + ' ' + DEFS[ID[k]].name).join(' + ') + ' for ' + get[1] + ' ' + DEFS[ID[get[0]]].name;
      row.addEventListener('click', () => {
        if (!give.every(([k, n]) => inv.count(ID[k]) >= n)) { this.message('You need ' + give.map(([k, n]) => n + ' ' + DEFS[ID[k]].name).join(' and ') + '.'); return; }
        for (const [k, n] of give) inv.remove(ID[k], n);
        const left = inv.add(ID[get[0]], get[1]);
        if (left) { const P = G.player; G.spawnDrop(ID[get[0]], left, P.pos.x, P.pos.y + 1, P.pos.z); }
        inv.changed(); G.sound.play('levelup'); G.player.addXp(1);
        if (v.mesh) G.particles.burst(v.pos.x, v.pos.y + 2.1, v.pos.z, [0x4ad84a, 0x9aff9a], 6, 1, 0.1, -1);
        this.renderTrades();
      });
      list.appendChild(row);
    }
  },
  /* ---------- the enchanting table ----------
     Pick a tool, weapon, armor piece or bow, then one of three offers. Each costs lapis lazuli and
     levels (1, 2 or 3) and needs a high enough level. Bookshelves around the table (with a one block
     gap, up to 15) make the offers stronger, like in Minecraft. */
  openEnchant(x, y, z) {
    if (G.state !== 'play') return;
    const W = G.world;
    let shelves = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue;
      for (let dy = 0; dy <= 1; dy++) if (W.getBlock(x + dx, y + dy, z + dz) === ID.bookshelf && !W.getBlock(x + Math.sign(dx), y + dy, z + Math.sign(dz))) shelves++;
    }
    let box = $('ench-pop');
    if (!box) {
      box = document.createElement('div'); box.id = 'ench-pop'; box.className = 'copy-pick';
      box.innerHTML = '<div class="copy-card trade-card et-card"><h3>Enchanting Table</h3>'
        + '<div class="et-top"><div class="et-slots"><button type="button" class="et-slot et-item" title="What to enchant"></button><button type="button" class="et-slot et-lapis" title="Lapis lazuli"></button></div>'
        + '<div class="trade-list ench-offers"></div></div>'
        + '<p class="trade-hint ench-hint"></p><b class="anvil-step">Your things: tap one to put it in the table</b><div class="et-inv"></div>'
        + '<button type="button" class="btn trade-close">Close</button></div>';
      box.addEventListener('pointerdown', e => { if (e.target === box) this.closeTrades(); });
      box.querySelector('.trade-close').addEventListener('click', () => this.closeTrades());
      box.querySelector('.et-item').addEventListener('click', () => { const st = this.ench; if (st && st.item) { this.enchGiveBack(st.item); st.item = null; G.sound.play('click'); this.renderEnchant(); } });
      box.querySelector('.et-lapis').addEventListener('click', () => { const st = this.ench; if (st && st.lapis) { this.enchGiveBack(st.lapis); st.lapis = null; G.sound.play('click'); this.renderEnchant(); } });
      document.body.appendChild(box);
    }
    this.ench = { x, y, z, shelves: Math.min(15, shelves), item: null, lapis: null };
    if (G.enchSeed === undefined) G.enchSeed = Math.random() * 1e9 | 0;
    this.renderEnchant();
    box.hidden = false;
    G.sound.play('click');
    G.setState('trade'); G.unlock();
  },
  /* something taken out of the table goes back into your inventory (or onto the ground if it's full) */
  enchGiveBack(s) {
    const P = G.player, left = P.inv.add(s.id, s.count, s.e, s.n, s.c);
    if (left) G.spawnDrop(s.id, left, P.pos.x, P.pos.y + 1, P.pos.z, undefined, slotExtras(s));
    P.inv.changed();
  },
  enchOffers(slot) {
    const sh = this.ench.shelves, def = DEFS[slot.id], kinds = enchKinds(def);
    const r = mulberry32((G.enchSeed ^ (slot.id * 2654435761)) >>> 0), ri = n => r() * n | 0;
    const base = 1 + ri(8) + (sh >> 1) + ri(sh + 1);
    const lvls = [Math.max(base / 3 | 0, 1), (base * 2 / 3 | 0) + 1, Math.max(base, sh * 2)];
    const pool = Object.keys(ENCHANTS).filter(k => kinds.includes('book') || ENCHANTS[k].on.some(o => kinds.includes(o)));
    return lvls.map((L, i) => {
      const e = {}, pick = () => {
        const left = pool.filter(k => !e[k] && !(k === 'fortune' && e.silk));
        if (!left.length) return;
        const k = left[ri(left.length)], mx = ENCHANTS[k].max;
        e[k] = Math.max(1, Math.min(mx, Math.ceil(L / 30 * mx * (0.6 + r() * 0.7))));
      };
      pick();
      if (r() < L / 45) pick();
      if (r() < L / 90) pick();
      return { L, cost: i + 1, e };
    });
  },
  renderEnchant() {
    const box = $('ench-pop'), st = this.ench, P = G.player, inv = P.inv, creative = P.mode === 'creative';
    const lapis = st.lapis ? st.lapis.count : 0;
    const fill = (el, s, empty) => {
      el.innerHTML = '';
      if (s) { const img = document.createElement('img'); img.alt = ''; img.src = iconURL(s.id); el.appendChild(img); if (s.count > 1) { const c = document.createElement('span'); c.className = 'count'; c.textContent = s.count; el.appendChild(c); } }
      else { const t = document.createElement('span'); t.className = 'et-empty'; t.textContent = empty; el.appendChild(t); }
      el.classList.toggle('glint', !!(s && s.e));
    };
    fill(box.querySelector('.et-item'), st.item, 'Item');
    fill(box.querySelector('.et-lapis'), st.lapis, 'Lapis');
    box.querySelector('.ench-hint').textContent = !st.item ? 'Put in a sword, tool, armor, bow or book, and some lapis lazuli.'
      : st.item.e ? 'All done! Tap it to take it out.'
      : !lapis ? 'Now put in lapis lazuli.'
      : 'Pick an enchantment. Your level: ' + P.level + '. Bookshelves: ' + st.shelves + ' of 15' + (st.shelves < 15 ? ' (more bookshelves around the table, one block away, give better choices).' : '.');
    // three choices, like Minecraft: the level you need on the left, a hint of the magic, and the lapis it costs
    const offers = box.querySelector('.ench-offers'); offers.innerHTML = '';
    const list = st.item && !st.item.e ? this.enchOffers(st.item) : null;
    for (let i = 0; i < 3; i++) {
      const o = list && list[i], row = document.createElement('button'); row.type = 'button';
      const ok = !!o && (creative || (P.level >= o.L && lapis >= o.cost));
      row.className = 'recipe ench-offer' + (ok ? ' ok' : '') + (o ? '' : ' empty');
      if (!o) { row.disabled = true; offers.appendChild(row); continue; }
      const ks = Object.keys(o.e), first = ks[0], hint = ENCHANTS[first].name + (ENCHANTS[first].max > 1 ? ' ' + ROMAN[o.e[first]] : '') + (ks.length > 1 ? ' . . . ?' : '');
      row.innerHTML = '<span class="ench-lv"></span><span class="rname"></span><span class="ins"><span class="need"><img alt="" src="' + iconURL(ID.lapis) + '">' + o.cost + '</span></span>';
      row.querySelector('.ench-lv').textContent = o.L; row.querySelector('.rname').textContent = hint;
      row.title = 'Needs level ' + o.L + '. Costs ' + o.cost + ' lapis and ' + o.cost + ' level' + (o.cost > 1 ? 's' : '') + '.';
      row.addEventListener('click', () => {
        if (!creative && lapis < o.cost) { this.message('You need ' + o.cost + ' lapis lazuli in the table for this one.'); return; }
        if (!creative && P.level < o.L) { this.message('You need level ' + o.L + ' for this one. Get XP by mining ores, smelting and defeating mobs.'); return; }
        if (!creative) { st.lapis.count -= o.cost; if (st.lapis.count <= 0) st.lapis = null; P.level = Math.max(0, P.level - o.cost); }
        st.item = st.item.id === ID.book ? { id: ID.enchanted_book, count: 1, e: o.e } : Object.assign(st.item, { e: o.e });
        G.enchSeed = Math.random() * 1e9 | 0; // new choices next time, like Minecraft
        G.sound.play('levelup');
        G.particles.burst(st.x + 0.5, st.y + 1.2, st.z + 0.5, [0xb07aff, 0x7a5aff, 0xe8d8ff], 18, 2, 0.1, -1);
        this.message((st.item.id === ID.enchanted_book ? 'You made an Enchanted Book of ' : DEFS[st.item.id].name + ' is now enchanted with ') + enchText(o.e) + '!', 'purple');
        this.renderEnchant();
      });
      offers.appendChild(row);
    }
    // your inventory: tap something to put it in the table
    const grid = box.querySelector('.et-inv'); grid.innerHTML = '';
    for (let i = 0; i < 36; i++) {
      const s = inv.slots[i], b = document.createElement('button'); b.type = 'button'; b.className = 'et-slot small';
      const usable = s && (s.id === ID.lapis || (!s.e && s.id !== ID.enchanted_book && canEnchant(DEFS[s.id])));
      if (s) { fill(b, s, ''); b.title = slotName(s); if (!usable) b.classList.add('dim'); }
      b.addEventListener('click', () => {
        const s2 = inv.slots[i];
        if (!s2) return;
        if (s2.id === ID.lapis) { if (st.lapis) st.lapis.count += s2.count; else st.lapis = { id: ID.lapis, count: s2.count }; inv.slots[i] = null; }
        else if (!s2.e && s2.id !== ID.enchanted_book && canEnchant(DEFS[s2.id])) {
          if (st.item) this.enchGiveBack(st.item);
          if (s2.count > 1) { st.item = copySlot(s2, 1); s2.count--; } else { st.item = s2; inv.slots[i] = null; }
        } else { this.message(s2.e ? 'That is already enchanted. Use an anvil to add more.' : slotName(s2) + ' can\'t be enchanted.'); return; }
        inv.changed(); G.sound.play('click'); this.renderEnchant();
      });
      grid.appendChild(b);
    }
  },

  /* ---------- the beacon: pick the power it gives (paid with an iron, gold or netherite ingot, an emerald or a diamond) ---------- */
  openBeacon(x, y, z) {
    if (G.state !== 'play') return;
    let box = $('beacon-pop');
    if (!box) {
      box = document.createElement('div'); box.id = 'beacon-pop'; box.className = 'copy-pick';
      box.innerHTML = '<div class="copy-card trade-card"><h3>Beacon</h3><p class="trade-hint beacon-hint"></p><div class="trade-list beacon-list"></div><button type="button" class="btn trade-close">Close</button></div>';
      box.addEventListener('pointerdown', e => { if (e.target === box) this.closeTrades(); });
      box.querySelector('.trade-close').addEventListener('click', () => this.closeTrades());
      document.body.appendChild(box);
    }
    this.beacon = { x, y, z };
    this.renderBeacon();
    box.hidden = false;
    G.sound.play('click');
    G.setState('trade'); G.unlock();
  },
  renderBeacon() {
    const box = $('beacon-pop'), b = this.beacon, W = G.world, P = G.player, inv = P.inv;
    const lvl = G.beaconLevel(b.x, b.y, b.z), sky = W.skyExposed(b.x, b.y, b.z), cur = DEFS[W.getBlock(b.x, b.y, b.z)].beacon;
    const PAY = ['iron_ingot', 'gold_ingot', 'emerald', 'diamond', 'netherite_ingot'], payWith = PAY.find(k => inv.count(ID[k]) > 0);
    box.querySelector('.beacon-hint').textContent = (lvl === 0 ? 'The beacon needs a pyramid under it: a 3 by 3 layer of iron, gold, diamond, emerald or netherite blocks (bigger layers below it make it stronger, up to 4 layers).'
      : 'Pyramid: ' + lvl + ' of 4 layers. It reaches ' + (10 + lvl * 10) + ' blocks.' + (sky ? '' : ' Its beam is blocked: it needs open sky (or glass) above it.'))
      + ' Pick a power. It costs 1 iron ingot, gold ingot, emerald, diamond or netherite ingot' + (payWith ? ' (you will pay 1 ' + DEFS[ID[payWith]].name + ').' : ' (you have none).');
    const list = box.querySelector('.beacon-list'); list.innerHTML = '';
    for (const k in BEACON_FX) {
      const [name, need] = BEACON_FX[k], ok = lvl >= need && sky && (payWith || P.mode === 'creative'), on = cur && cur.effect === k;
      const row = document.createElement('button'); row.type = 'button'; row.className = 'recipe ench-offer' + (ok || on ? ' ok' : '');
      const n = document.createElement('span'); n.className = 'rname'; n.textContent = name + (lvl >= 4 && k !== 'regeneration' ? ' II' : '') + (on ? ' (on now)' : '');
      const sm = document.createElement('small'); sm.className = 'rhow'; sm.textContent = lvl >= need ? { speed: 'Run faster', haste: 'Mine faster', resistance: 'Take less damage', jump_boost: 'Jump higher, fall softer', strength: 'Hit harder', regeneration: 'Heal over time' }[k] : 'Needs ' + need + ' pyramid layer' + (need > 1 ? 's' : '');
      n.appendChild(sm); row.appendChild(n);
      row.addEventListener('click', () => {
        if (lvl < need) { this.message('This power needs a pyramid with ' + need + ' layers.'); return; }
        if (!sky) { this.message('The beacon needs open sky above it.'); return; }
        if (on) return;
        if (P.mode !== 'creative') { if (!payWith) { this.message('Pay with 1 iron ingot, gold ingot, emerald, diamond or netherite ingot.'); return; } inv.remove(ID[payWith], 1); inv.changed(); }
        W.setBlock(b.x, b.y, b.z, ID['beacon_' + k]);
        G.sound.play('levelup');
        this.message('The beacon now gives ' + name + '!', 'gold');
        G.tickBeacons();
        this.renderBeacon();
      });
      list.appendChild(row);
    }
  },

  /* ---------- the smithing table: diamond -> netherite, with one netherite ingot (enchantments and names stay) ---------- */
  openSmithing() {
    if (G.state !== 'play') return;
    let box = $('smith-pop');
    if (!box) {
      box = document.createElement('div'); box.id = 'smith-pop'; box.className = 'copy-pick';
      box.innerHTML = '<div class="copy-card trade-card"><h3>Smithing Table</h3><p class="trade-hint smith-hint"></p><div class="ench-items smith-items"></div><button type="button" class="btn trade-close">Close</button></div>';
      box.addEventListener('pointerdown', e => { if (e.target === box) this.closeTrades(); });
      box.querySelector('.trade-close').addEventListener('click', () => this.closeTrades());
      document.body.appendChild(box);
    }
    this.renderSmithing();
    box.hidden = false;
    G.sound.play('click');
    G.setState('trade'); G.unlock();
  },
  renderSmithing() {
    const box = $('smith-pop'), list = box.querySelector('.smith-items'), P = G.player, inv = P.inv, ingots = inv.count(ID.netherite_ingot);
    box.querySelector('.smith-hint').textContent = 'Tap a diamond tool or diamond armor to make it netherite. Each costs 1 netherite ingot (you have ' + ingots + '). Enchantments and names stay.';
    list.innerHTML = '';
    let any = false;
    for (let i = 0; i < 40; i++) {
      const s = inv.slots[i], k = s && DEFS[s.id].key;
      if (!k || !/^diamond_(pickaxe|sword|axe|shovel|hoe|helmet|chestplate|leggings|boots)$/.test(k) || ID[k.replace('diamond_', 'netherite_')] === undefined) continue;
      any = true;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ench-item' + (s.e ? ' glint' : '') + (ingots ? '' : ' dim');
      const img = document.createElement('img'); img.alt = ''; img.src = iconURL(s.id);
      const arrow = document.createElement('span'); arrow.textContent = ' \u279c ';
      const img2 = document.createElement('img'); img2.alt = ''; img2.src = iconURL(ID[k.replace('diamond_', 'netherite_')]);
      const sp = document.createElement('span'); sp.textContent = slotName(s) + (s.e ? ' (' + enchText(s.e) + ')' : '');
      b.append(img, arrow, img2, sp);
      b.addEventListener('click', () => {
        if (P.mode !== 'creative' && !inv.count(ID.netherite_ingot)) { this.message('You need a netherite ingot. Smelt ancient debris into netherite scrap, then craft 4 scrap and 4 gold ingots into an ingot.'); return; }
        if (P.mode !== 'creative') inv.remove(ID.netherite_ingot, 1);
        s.id = ID[k.replace('diamond_', 'netherite_')];
        inv.changed();
        G.sound.play('levelup');
        this.message('Upgraded to ' + slotName(s) + '!', 'gold');
        this.renderSmithing();
      });
      list.appendChild(b);
    }
    if (!any) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'You have no diamond tools or armor to upgrade.'; list.appendChild(p); }
  },

  /* ---------- the grindstone: takes the enchantments off something (you get a little XP back) ---------- */
  openGrindstone() {
    if (G.state !== 'play') return;
    let box = $('grind-pop');
    if (!box) {
      box = document.createElement('div'); box.id = 'grind-pop'; box.className = 'copy-pick';
      box.innerHTML = '<div class="copy-card trade-card"><h3>Grindstone</h3><p class="trade-hint">Tap something enchanted to take its enchantments off. An enchanted book turns back into a book. Its name stays.</p><div class="ench-items grind-items"></div><button type="button" class="btn trade-close">Close</button></div>';
      box.addEventListener('pointerdown', e => { if (e.target === box) this.closeTrades(); });
      box.querySelector('.trade-close').addEventListener('click', () => this.closeTrades());
      document.body.appendChild(box);
    }
    this.renderGrindstone();
    box.hidden = false;
    G.sound.play('click');
    G.setState('trade'); G.unlock();
  },
  renderGrindstone() {
    const box = $('grind-pop'), list = box.querySelector('.grind-items'), P = G.player, inv = P.inv;
    list.innerHTML = '';
    let any = false;
    for (let i = 0; i < 40; i++) {
      const s = inv.slots[i];
      if (!s || !s.e) continue;
      any = true;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ench-item glint';
      const img = document.createElement('img'); img.alt = ''; img.src = iconURL(s.id);
      const sp = document.createElement('span'); sp.textContent = slotName(s) + ' (' + enchText(s.e) + ')';
      b.append(img, sp);
      b.addEventListener('click', () => {
        const levels = Object.values(s.e).reduce((a, v) => a + v, 0);
        delete s.e;
        if (s.id === ID.enchanted_book) s.id = ID.book;
        inv.changed();
        P.addXp(Math.max(1, levels * 3));
        G.sound.play('break');
        this.message('The enchantments came off your ' + slotName(s) + '.', 'gold');
        this.renderGrindstone();
      });
      list.appendChild(b);
    }
    if (!any) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'You have nothing enchanted.'; list.appendChild(p); }
  },

  /* ---------- the anvil ----------
     Pick something, type a new name (1 level), and/or pick a second item of the same kind or an Enchanted
     Book to add its enchantments (more levels). Like Minecraft, two of the same enchantment at the same
     level make the next level up. */
  openAnvil(x, y, z) {
    if (G.state !== 'play') return;
    let box = $('anvil-pop');
    if (!box) {
      box = document.createElement('div'); box.id = 'anvil-pop'; box.className = 'copy-pick';
      box.innerHTML = '<div class="copy-card trade-card"><h3>Anvil</h3><p class="trade-hint anvil-hint"></p>'
        + '<b class="anvil-step">1. Pick what to change</b><div class="ench-items anvil-items"></div>'
        + '<b class="anvil-step">2. Give it a name</b><input class="anvil-name" type="text" maxlength="30" autocomplete="off" placeholder="Type a name">'
        + '<b class="anvil-step">3. Add enchantments from (if you want)</b><div class="ench-items anvil-adds"></div>'
        + '<p class="anvil-result"></p><button type="button" class="btn wide anvil-go">Make it</button><button type="button" class="btn trade-close">Close</button></div>';
      box.addEventListener('pointerdown', e => { if (e.target === box) this.closeTrades(); });
      box.querySelector('.trade-close').addEventListener('click', () => this.closeTrades());
      const inp = box.querySelector('.anvil-name');
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); }); // typing E shouldn't close it
      inp.addEventListener('input', () => this.anvilPreview());
      box.querySelector('.anvil-go').addEventListener('click', () => this.anvilMake());
      document.body.appendChild(box);
    }
    this.anvil = { x, y, z, pick: null, add: null };
    box.querySelector('.anvil-name').value = '';
    this.renderAnvil();
    box.hidden = false;
    G.sound.play('click');
    G.setState('trade'); G.unlock();
  },
  anvilCanAdd(t, s) {
    if (!t || !s || s === t) return false;
    return (s.id === t.id && (s.e || t.e || true)) || (s.id === ID.enchanted_book && !!s.e);
  },
  renderAnvil() {
    const box = $('anvil-pop'), st = this.anvil, inv = G.player.inv;
    if (st.pick !== null && !inv.slots[st.pick]) { st.pick = null; st.add = null; }
    const t = st.pick !== null ? inv.slots[st.pick] : null;
    if (st.add !== null && !this.anvilCanAdd(t, inv.slots[st.add])) st.add = null;
    const mk = (i, s, sel, onPick) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ench-item' + (sel ? ' sel' : '');
      const img = document.createElement('img'); img.alt = ''; img.src = iconURL(s.id);
      const sp = document.createElement('span'); sp.textContent = slotName(s) + (s.count > 1 ? ' x' + s.count : '') + (s.e ? ' (' + enchText(s.e) + ')' : '');
      b.append(img, sp); if (s.e) b.classList.add('glint');
      b.addEventListener('click', onPick);
      return b;
    };
    const items = box.querySelector('.anvil-items'); items.innerHTML = '';
    for (let i = 0; i < 40; i++) { const s = inv.slots[i]; if (s) items.appendChild(mk(i, s, i === st.pick, () => { st.pick = i; st.add = null; box.querySelector('.anvil-name').value = inv.slots[i].n || ''; G.sound.play('click'); this.renderAnvil(); })); }
    const adds = box.querySelector('.anvil-adds'); adds.innerHTML = '';
    if (t) {
      const none = document.createElement('button'); none.type = 'button'; none.className = 'ench-item' + (st.add === null ? ' sel' : ''); none.textContent = 'Nothing';
      none.addEventListener('click', () => { st.add = null; this.renderAnvil(); }); adds.appendChild(none);
      for (let i = 0; i < 40; i++) { const s = inv.slots[i]; if (i !== st.pick && this.anvilCanAdd(t, s) && s.e) adds.appendChild(mk(i, s, i === st.add, () => { st.add = i; G.sound.play('click'); this.renderAnvil(); })); }
    }
    box.querySelector('.anvil-name').disabled = !t;
    this.anvilPreview();
  },
  /* what the anvil would make, and what it costs */
  anvilPlan() {
    const st = this.anvil, inv = G.player.inv, P = G.player;
    const t = st.pick !== null ? inv.slots[st.pick] : null;
    if (!t) return null;
    const typed = cleanName($('anvil-pop').querySelector('.anvil-name').value);
    const n = typed && typed !== DEFS[t.id].name ? typed : undefined;
    let cost = (n || undefined) !== (t.n || undefined) ? 1 : 0, e = t.e ? Object.assign({}, t.e) : {}, added = false;
    const s = st.add !== null ? inv.slots[st.add] : null;
    if (s && s.e && t.id !== ID.book) {
      const kinds = enchKinds(DEFS[t.id]);
      for (const k in s.e) {
        if (!ENCHANTS[k] || !(kinds.includes('book') || ENCHANTS[k].on.some(o => kinds.includes(o)))) continue;
        const a = e[k] || 0, b = s.e[k], nv = a === b ? Math.min(ENCHANTS[k].max, a + 1) : Math.max(a, b);
        if (nv !== a) { e[k] = nv; cost += nv * (s.id === ID.enchanted_book ? 1 : 2); added = true; }
      }
    }
    return { t, s, n, e: Object.keys(e).length ? e : undefined, cost, changed: cost > 0, added, can: P.mode === 'creative' || P.level >= cost, tooMuch: cost >= 40 };
  },
  anvilPreview() {
    const box = $('anvil-pop'), P = G.player, plan = this.anvilPlan(), go = box.querySelector('.anvil-go'), res = box.querySelector('.anvil-result');
    box.querySelector('.anvil-hint').textContent = 'Your level: ' + P.level + '. Naming something costs 1 level; adding enchantments costs more.';
    if (!plan) { res.textContent = 'Pick something first.'; go.disabled = true; go.textContent = 'Make it'; return; }
    if (!plan.changed) { res.textContent = 'Type a new name, or pick something to add enchantments from.'; go.disabled = true; go.textContent = 'Make it'; return; }
    res.textContent = 'You get: ' + (plan.n ? '\u201c' + plan.n + '\u201d (' + DEFS[plan.t.id].name + ')' : DEFS[plan.t.id].name) + (plan.e ? ' with ' + enchText(plan.e) : '');
    go.disabled = plan.tooMuch;
    go.textContent = plan.tooMuch ? 'Too expensive!' : 'Make it (costs ' + plan.cost + ' level' + (plan.cost > 1 ? 's' : '') + ')';
    go.classList.toggle('short', !plan.can);
  },
  anvilMake() {
    const plan = this.anvilPlan(), P = G.player, inv = P.inv, st = this.anvil;
    if (!plan || !plan.changed || plan.tooMuch) return;
    if (!plan.can) { this.message('You need level ' + plan.cost + ' for this. Get XP by mining ores, smelting and defeating mobs.'); return; }
    if (P.mode !== 'creative') P.level -= plan.cost;
    const t = plan.t;
    if (plan.n) t.n = plan.n; else delete t.n;
    if (plan.e) t.e = plan.e; else delete t.e;
    if (plan.added && t.count > 1 && t.id !== ID.enchanted_book) { /* tools and armor never stack, so this doesn't happen */ }
    if (plan.s && plan.added) { plan.s.count--; if (plan.s.count <= 0) inv.slots[st.add] = null; }
    inv.changed();
    G.sound.play('levelup');
    G.particles.burst(st.x + 0.5, st.y + 1.1, st.z + 0.5, [0xffffff, 0xdddddd, 0xffd84a], 14, 2, 0.1, -1);
    this.message('Done: ' + slotName(t) + (t.e ? ' (' + enchText(t.e) + ')' : '') + '!', 'gold');
    st.add = null;
    this.renderAnvil();
  },

  closeTrades() {
    const box = $('trade-pop');
    if (box) box.hidden = true;
    const eb = $('ench-pop');
    if (eb) eb.hidden = true;
    const gb = $('grind-pop');
    if (gb) gb.hidden = true;
    const sb = $('smith-pop');
    if (sb) sb.hidden = true;
    const bb = $('beacon-pop');
    if (bb) bb.hidden = true;
    if (this.ench) { if (this.ench.item) this.enchGiveBack(this.ench.item); if (this.ench.lapis) this.enchGiveBack(this.ench.lapis); }
    this.ench = null;
    const ab = $('anvil-pop');
    if (ab) { ab.hidden = true; const inp = ab.querySelector('.anvil-name'); if (inp) inp.blur(); }
    this.anvil = null;
    this.tradeWith = null;
    if (G.state === 'trade') G.resume();
  },

  /* the device forgot who's playing: pick your name from the players saved online. Resolves to a name, or null. */
  whoIsPlaying(players) {
    return new Promise(done => {
      const box = document.createElement('div'); box.className = 'copy-pick';
      const card = document.createElement('div'); card.className = 'copy-card';
      const h = document.createElement('h3'); h.textContent = "Who's playing?";
      const p = document.createElement('p'); p.textContent = 'Pick your name to get your worlds back.';
      card.append(h, p);
      const close = v => { box.remove(); done(v); };
      for (const pl of players.slice(0, 8)) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = pl.name;
        b.addEventListener('click', () => close(pl.name));
        card.appendChild(b);
      }
      const x = document.createElement('button'); x.type = 'button'; x.className = 'btn'; x.textContent = "Someone new";
      x.addEventListener('click', () => { close(null); G.ui.message('Type your name in the box at the top left, so your worlds are saved under it.', 'gold'); });
      card.appendChild(x);
      box.appendChild(card);
      document.body.appendChild(box);
    });
  },

  /* this device has no save of a world, but there are several online copies (one per device that
     played it): let the player pick theirs. Resolves to the chosen copy, or null. */
  chooseCopy(entry, copies) {
    return new Promise(done => {
      const box = document.createElement('div'); box.className = 'copy-pick';
      const card = document.createElement('div'); card.className = 'copy-card';
      const h = document.createElement('h3'); h.textContent = 'Which copy of "' + (entry.name || 'My World') + '" is yours?';
      const p = document.createElement('p'); p.textContent = 'This world was saved on more than one device. Pick the one you played.';
      card.append(h, p);
      const close = v => { box.remove(); done(v); };
      for (const c of copies) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn';
        const who = c.dev === 'old' ? 'Older backup' : (c.nick ? c.nick + "'s copy" : 'A copy') + (c.dev === Cloud.dev ? ' (this device)' : '');
        const when = c.last ? new Date(c.last).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
        b.textContent = who + (when ? ' · saved ' + when : '');
        if (c.nick && c.nick === Net.nick) b.classList.add('on');
        b.addEventListener('click', () => close(c));
        card.appendChild(b);
      }
      const x = document.createElement('button'); x.type = 'button'; x.className = 'btn'; x.textContent = 'Cancel';
      x.addEventListener('click', () => close(null));
      card.appendChild(x);
      box.appendChild(card);
      document.body.appendChild(box);
    });
  },

  /* tell people what typing this seed will do: open a world they already have, or join a friend's named world */
  seedHints() {
    const txt = $('seed').value.trim(), seed = txt ? seedFromText(txt) : G.seed;
    const mine = G.findWorld(seed), friend = Net.friendWorldName ? Net.friendWorldName(seed) : null;
    const ch = $('create-hint'), mh = $('mp-hint'), mn = $('mp-world-name');
    if (ch) ch.textContent = mine ? 'You already have a world with this seed: "' + mine.name + '". Creating will open it.' : '';
    if (mn) {
      if (mine) { mn.value = mine.name; mn.disabled = true; mh.textContent = 'You played this world before. Join to go back to "' + mine.name + '".'; }
      else if (friend) { mn.value = friend.name; mn.disabled = true; mh.textContent = friend.by + ' already named this world "' + friend.name + '".'; }
      else { if (mn.disabled) mn.value = ''; mn.disabled = false; mh.textContent = 'You are the first one here, so you get to name this world.'; }
    }
  },

  renderDiff() {
    const d = G.pickedDifficulty();
    for (const b of document.querySelectorAll('[data-diff]')) b.classList.toggle('on', b.dataset.diff === d);
    $('diff-hint').textContent = {
      peaceful: 'No monsters, you never stay hungry, and you heal fast.',
      normal: 'The usual game.',
      hard: 'More monsters that hit harder, and you get hungry faster.',
      extreme: 'Twice the monsters, they hit twice as hard, and starving can kill you.',
    }[d];
  },

  renderSkins() {
    const grid = $('skin-grid');
    if (!grid.childElementCount) {
      SKINS.forEach((sk, i) => {
        const card = document.createElement('button');
        card.type = 'button'; card.className = 'skin-card'; card.title = sk.n; card.dataset.i = i;
        const cv = document.createElement('canvas'); cv.width = 32; cv.height = 64;
        drawSkinFront(cv.getContext('2d'), sk, 2);
        card.appendChild(cv);
        card.addEventListener('click', () => { G.setSkin(i); this.renderSkins(); G.sound.play('click'); });
        grid.appendChild(card);
      });
    }
    for (const c of grid.children) c.classList.toggle('on', +c.dataset.i === G.skin);
    const sk = SKINS[G.skin];
    drawSkinFront($('skin-preview').getContext('2d'), sk, 6);
    $('skin-name').textContent = sk.n;
    this.renderNameFace();
  },

  renderNameFace() {
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const x = c.getContext('2d');
    drawSkinFace((a, b, col, w = 1, h = 1) => { x.fillStyle = col; x.fillRect(a, b, w, h); }, SKINS[G.skin || 0]);
    $('name-face').style.backgroundImage = 'url(' + c.toDataURL() + ')';
  },

  bindMenus() {
    for (const b of document.querySelectorAll('[data-go]')) b.addEventListener('click', () => this.titlePage(b.dataset.go));
    for (const b of document.querySelectorAll('[data-diff]')) b.addEventListener('click', () => { try { localStorage.setItem('blockrealm-diff', b.dataset.diff); } catch (e) { /* storage unavailable */ } this.renderDiff(); });
    $('btn-sign-done').addEventListener('click', () => this.closeSign());
    document.querySelectorAll('.sign-line').forEach((el, i, all) => el.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); if (i < all.length - 1) all[i + 1].focus(); else this.closeSign(); }
      if (e.key === 'Escape') this.closeSign();
    }));
    $('btn-settings').addEventListener('click', () => this.pausePage('settings'));
    $('btn-settings-back').addEventListener('click', () => this.pausePage('main'));
    for (const b of document.querySelectorAll('[data-pdiff]')) b.addEventListener('click', () => { G.setDifficulty(b.dataset.pdiff); try { localStorage.setItem('blockrealm-diff', b.dataset.pdiff); } catch (e) { /* storage unavailable */ } this.syncPause(); });
    $('btn-firespread').addEventListener('click', () => {
      G.noFireSpread = !G.noFireSpread;
      this.message(G.noFireSpread ? 'Fire Spreads is off: fire stays where you light it.' : 'Fire Spreads is on: fire spreads along wood, leaves and wool. Careful with wooden houses!', 'gold');
      this.syncPause();
    });
    try { G.showCoords = localStorage.getItem('blockrealm-coords') === '1'; } catch (e) { G.showCoords = false; }
    $('btn-coords').addEventListener('click', () => {
      G.showCoords = !G.showCoords;
      try { localStorage.setItem('blockrealm-coords', G.showCoords ? '1' : '0'); } catch (e) { /* only for this time */ }
      this.syncPause();
    });
    $('btn-keepinv').addEventListener('click', () => {
      G.keepInventory = !G.keepInventory;
      this.message('Keep Inventory is ' + (G.keepInventory ? 'on: you keep your items when you die.' : 'off: your items drop when you die.'), 'gold');
      this.syncPause();
    });
    const mpName = () => { const t = $('seed').value.trim(), f = Net.friendWorldName(t ? seedFromText(t) : G.seed); return f ? f.name : $('mp-world-name').value || 'Shared World'; };
    $('btn-mp-s').addEventListener('click', () => { this.fromMultiplayer = true; G.startNew('survival', mpName()); this.fromMultiplayer = false; });
    $('btn-mp-c').addEventListener('click', () => { this.fromMultiplayer = true; G.startNew('creative', mpName()); this.fromMultiplayer = false; });
    $('seed').addEventListener('input', () => this.seedHints());
    $('nick').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); });
    this.titlePage('main');
    this.renderNameFace();
    $('btn-survival').addEventListener('click', () => G.startNew('survival'));
    $('btn-creative').addEventListener('click', () => G.startNew('creative'));
    $('btn-continue').addEventListener('click', () => G.continueSaved());
    $('btn-random').addEventListener('click', () => G.previewWorld(null));
    $('btn-play-seed-s').addEventListener('click', () => G.startNew('survival', $('world-name').value));
    $('btn-play-seed-c').addEventListener('click', () => G.startNew('creative', $('world-name').value));
    $('world-name').addEventListener('keydown', e => e.stopPropagation());
    $('mp-world-name').addEventListener('keydown', e => e.stopPropagation());
    $('seed').addEventListener('keydown', e => { e.stopPropagation(); });
    $('btn-resume').addEventListener('click', () => G.resume());
    $('btn-mode').addEventListener('click', () => {
      const P = G.player;
      P.mode = P.mode === 'survival' ? 'creative' : 'survival';
      if (P.mode === 'survival') P.flying = false;
      this.syncPause();
      this.message('Game mode: ' + (P.mode === 'survival' ? 'Survival' : 'Creative'));
    });
    $('btn-dragon').addEventListener('click', () => { if (G.summonDragon()) G.resume(); });
    $('btn-time').addEventListener('click', () => { G.time = G.isNight() ? 0.02 : 0.52; G.timeEventAt = Date.now(); this.message(G.isNight() ? 'Night falls.' : 'The sun rises.'); });
    $('btn-cam').addEventListener('click', () => { G.camMode = (G.camMode + 1) % 3; this.syncPause(); });
    $('btn-save').addEventListener('click', () => { G.save(); this.message('World saved in this browser.'); });
    $('btn-quit').addEventListener('click', () => { G.save({ now: true }); G.toTitle(); });
    $('rd').addEventListener('input', () => { for (const w of Object.values(G.worlds)) { w.renderDist = +$('rd').value; w.queue = []; } $('rd-val').textContent = $('rd').value; G.applyFog(); });
    $('sens').addEventListener('input', () => { Input.sens = +$('sens').value; $('sens-val').textContent = (+$('sens').value).toFixed(1); });
    $('btn-wake').addEventListener('click', () => G.wake());
    $('btn-respawn').addEventListener('click', () => { $('menu-dead').hidden = true; G.respawnPlayer(); G.resume(); });
    $('nick').addEventListener('change', () => Net.setNick($('nick').value));
    $('nick').addEventListener('keydown', e => e.stopPropagation());
    $('btn-inv-close').addEventListener('click', () => { this.closeInventory(); G.lock(); });
  },

  pausePage(name) {
    $('pause-main').hidden = name !== 'main';
    $('pause-settings').hidden = name !== 'settings';
    this.syncPause();
  },

  syncPause() {
    const P = G.player;
    $('btn-mode').textContent = 'Game mode: ' + (P.mode === 'survival' ? 'Survival' : 'Creative');
    for (const b of document.querySelectorAll('[data-pdiff]')) b.classList.toggle('on', b.dataset.pdiff === G.difficulty);
    $('btn-keepinv').setAttribute('aria-checked', G.keepInventory ? 'true' : 'false');
    $('btn-firespread').setAttribute('aria-checked', G.noFireSpread ? 'false' : 'true');
    $('btn-coords').setAttribute('aria-checked', G.showCoords ? 'true' : 'false');
    $('rd').value = G.world.renderDist; $('rd-val').textContent = G.world.renderDist;
    $('sens').value = Input.sens; $('sens-val').textContent = Input.sens.toFixed(1);
    $('btn-time').textContent = G.isNight() ? 'Make it day' : 'Make it night';
    $('btn-cam').textContent = 'Camera: ' + ['First person', 'Behind', 'Front'][G.camMode];
    $('btn-dragon').textContent = G.dim === 'end' ? 'Summon a dragon' : 'Summon a dragon (End only)';
    $('btn-dragon').classList.toggle('gold', G.dim === 'nether');
    const names = Net.names();
    $('players').textContent = Net.status === 'on'
      ? (names.length ? 'Playing with: ' + names.join(', ') + '. ' : 'Nobody else is in your world yet. Friends join you by typing seed ' + G.seed + ' on the title screen. ') + Net.describeOthers()
      : 'Multiplayer is not connected. See the title screen for details.';
    $('pad-help').hidden = !Pad.active;
  },

  showDeath() {
    G.setState('dead');
    G.unlock(); // free the mouse so the Respawn button can be clicked
    $('death-info').textContent = (G.player.deathCause ? G.player.deathCause + ' ' : '') + 'You reached level ' + G.player.level + '. Your items are on the ground where you fell.';
    $('menu-dead').hidden = false;
  },

  /* ---------- input binding ---------- */
  bindInput() {
    const cv = G.renderer.domElement;
    Input.touch = matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('touch', Input.touch);

    window.addEventListener('keydown', e => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const k = e.code;
      if (G.state === 'play') {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
        if (!Input.keys[k]) this.keyPress(k, e);
      } else if (G.state === 'inventory' && (k === 'KeyE' || k === 'Escape')) { this.closeInventory(); G.lock(); e.preventDefault(); }
      else if (G.state === 'trade' && (k === 'KeyE' || k === 'Escape')) { this.closeTrades(); e.preventDefault(); }
      else if (G.state === 'pause' && k === 'Escape' && Input.fallback) { G.resume(); }
      Input.keys[k] = true;
    });
    window.addEventListener('keyup', e => { Input.keys[e.code] = false; });
    window.addEventListener('blur', () => { Input.keys = Object.create(null); Input.left = Input.right = false; });

    document.addEventListener('pointerlockchange', () => {
      Input.locked = document.pointerLockElement === cv;
      if (Input.locked) G.lockFails = 0;
      if (!Input.locked && G.state === 'play' && !Input.fallback && !Input.touch && !Pad.active && !(G.player && G.player.sleeping)) G.pause();
    });
    document.addEventListener('pointerlockerror', () => G.lockFailed());

    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => {
      if (G.state !== 'play') return;
      if (!Input.locked) return;
      if (e.button === 0) { Input.left = true; Input.leftPressed = true; }
      if (e.button === 2) { Input.right = true; Input.rightPressed = true; }
      if (e.button === 1) { Input.middlePressed = true; e.preventDefault(); }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) Input.left = false; if (e.button === 2) Input.right = false; });
    window.addEventListener('mousemove', e => {
      if (Input.locked && G.state === 'play') { Input.lookDX += e.movementX; Input.lookDY += e.movementY; }
    });
    cv.addEventListener('wheel', e => {
      if (G.state !== 'play') return;
      e.preventDefault();
      const P = G.player;
      P.sel = (P.sel + (e.deltaY > 0 ? 1 : 8)) % 9;
    }, { passive: false });

    // drag-to-look (touch, or mouse when pointer lock is unavailable)
    let look = null;
    cv.addEventListener('pointerdown', e => {
      if (G.state !== 'play') return;
      if (Input.locked) return;
      if (e.pointerType === 'mouse' && !Input.fallback) { G.lock(); return; }
      if (e.pointerType === 'mouse' && e.button === 2) { Input.rightPressed = true; return; }
      if (e.pointerType === 'mouse' && e.button === 1) { Input.middlePressed = true; return; }
      if (look) return;
      look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, hold: null };
      // like Minecraft on a phone: hold your finger on a block to mine the block under your finger
      look.hold = setTimeout(() => { if (look && !look.moved) { Input.aim = { x: look.x, y: look.y }; Input.left = true; Input.leftPressed = true; look.holding = true; } }, 300);
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });
    cv.addEventListener('pointermove', e => {
      if (!look || e.pointerId !== look.id) return;
      const dx = e.clientX - look.x, dy = e.clientY - look.y;
      look.x = e.clientX; look.y = e.clientY;
      if (Math.hypot(e.clientX - look.sx, e.clientY - look.sy) > 10) look.moved = true;
      const f = Input.touch ? 2.2 : 1.6;
      // the camera always turns with the finger, also while mining, and mining follows the finger
      Input.lookDX += dx * f; Input.lookDY += dy * f;
      if (look.holding) Input.aim = { x: e.clientX, y: e.clientY };
    });
    const endLook = e => {
      if (!look || e.pointerId !== look.id) return;
      clearTimeout(look.hold);
      if (look.holding) { Input.left = false; Input.aim = null; }
      else if (!look.moved) {
        // a quick tap on a block places/uses on that block; a tap on a mob hits it
        Input.tap = { x: e.clientX, y: e.clientY };
      }
      look = null;
    };
    this.dropLook = () => { if (look) { clearTimeout(look.hold); look = null; } };
    cv.addEventListener('pointerup', endLook);
    cv.addEventListener('pointercancel', endLook);

    // touch joystick and buttons
    const joy = $('joy'), knob = $('knob');
    joy.addEventListener('pointerdown', e => { e.preventDefault(); Input.joy.id = e.pointerId; joy.setPointerCapture(e.pointerId); moveJoy(e); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === Input.joy.id) moveJoy(e); });
    const endJoy = e => { if (e.pointerId !== Input.joy.id) return; Input.joy.id = null; Input.joy.x = Input.joy.y = 0; knob.style.transform = ''; };
    joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
    function moveJoy(e) {
      const r = joy.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const max = r.width / 2 - 10, l = Math.hypot(dx, dy);
      if (l > max) { dx = dx / l * max; dy = dy / l * max; }
      Input.joy.x = dx / max; Input.joy.y = dy / max;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    const hold = (id, on, off) => {
      const el = $(id);
      el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); on(); });
      if (off) { el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off); }
    };
    hold('t-jump', () => { const now = performance.now(); if (now - Input.lastSpace < 300) Input.flyToggle = true; Input.lastSpace = now; Input.tJump = true; }, () => { Input.tJump = false; });
    hold('t-sneak', () => { Input.tSneak = true; }, () => { Input.tSneak = false; });
    hold('t-inv', () => { if (G.state === 'play') this.openInventory(null); else if (G.state === 'inventory') this.closeInventory(); });
    hold('t-pause', () => { if (G.state === 'play') G.pause(); });
    $('btn-flag').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.toggleFlag(); });
    hold('t-drop', () => { if (G.state === 'play') G.player.dropHeld(false); });
  },

  keyPress(k, e) {
    const P = G.player;
    if (k.startsWith('Digit')) { const n = +k.slice(5); if (n >= 1 && n <= 9) P.sel = n - 1; }
    else if (k === 'KeyE') { this.openInventory(null); G.unlock(); }
    else if (k === 'KeyG') this.toggleFlag();
    else if (k === 'Escape' && Input.fallback) G.pause();
    else if (k === 'KeyQ') P.dropHeld(e.ctrlKey);
    else if (k === 'F3' || k === 'KeyH') { e.preventDefault(); $('debug').hidden = !$('debug').hidden; }
    else if (k === 'KeyF') { if (P.mode === 'creative') Input.flyToggle = true; }
    else if (k === 'Space') { const now = performance.now(); if (now - Input.lastSpace < 300 && P.mode === 'creative') Input.flyToggle = true; Input.lastSpace = now; }
    else if (k === 'KeyP') G.pause();
    else if (k === 'F5' || k === 'KeyV') { e.preventDefault(); G.camMode = (G.camMode + 1) % 3; }
  },

  readMovement() {
    const K = Input.keys;
    let x = 0, z = 0;
    if (K.KeyW || K.ArrowUp) z += 1;
    if (K.KeyS || K.ArrowDown) z -= 1;
    if (K.KeyA || K.ArrowLeft) x -= 1;
    if (K.KeyD || K.ArrowRight) x += 1;
    if (Input.joy.id !== null) { x += Input.joy.x; z -= Input.joy.y; }
    const pd = Input.pad;
    if (pd) { x += pd.mx; z += pd.mz; }
    Input.moveX = x; Input.moveZ = z;
    Input.jump = !!(K.Space || Input.tJump || (pd && pd.jump));
    const flying = G.player.flying;
    Input.sneak = !!(K.KeyC || K.KeyZ || Input.tSneak || (pd && pd.sneak) || (flying && (K.ShiftLeft || K.ShiftRight)));
    Input.sprint = !flying && !!(K.ShiftLeft || K.ShiftRight || (pd && pd.sprint) || (Input.joy.id !== null && Math.hypot(Input.joy.x, Input.joy.y) > 0.95));
  },
};
