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
const BUBBLE = ['..XXX..', '.XWBBX.', 'XWBBBBX', 'XBBBBBX', 'XBBBBBX', '.XBBBX.', '..XXX..'];
const ICONS = {
  heart: pixelIcon(HEART, { X: '#1a0707', R: '#e3262b', W: '#ff9a9a' }),
  heartHalf: pixelIcon(HEART_HALF, { X: '#1a0707', R: '#e3262b', W: '#ff9a9a', E: '#3a1515' }),
  heartEmpty: pixelIcon(HEART, { X: '#1a0707', R: '#3a1515', W: '#3a1515' }),
  food: pixelIcon(FOOD, { X: '#1f1208', m: '#c8762e', M: '#f0a860', b: '#efe9dc' }),
  foodHalf: pixelIcon(FOOD_HALF, { X: '#1f1208', m: '#c8762e', M: '#f0a860', b: '#efe9dc', E: '#3a2410' }),
  foodEmpty: pixelIcon(FOOD, { X: '#1f1208', m: '#3a2410', M: '#3a2410', b: '#5a4a3a' }),
  bubble: pixelIcon(BUBBLE, { X: '#0d2a5a', B: '#3a8af0', W: '#c8e4ff' }),
};

/* ---------- input ---------- */
const Input = {
  keys: Object.create(null), moveX: 0, moveZ: 0, jump: false, sneak: false, sprint: false, flyToggle: false,
  left: false, leftPressed: false, right: false, rightPressed: false, middlePressed: false,
  lookDX: 0, lookDY: 0, sens: 1, locked: false, fallback: false, touch: false,
  joy: { x: 0, y: 0, id: null }, tJump: false, tSneak: false, lastSpace: 0,
};

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
    const sig = [Math.ceil(P.health), Math.ceil(P.hunger), Math.ceil(P.air), P.level, Math.round(P.xp / (7 + P.level * 2) * 50), P.headInWater].join('|');
    if (sig !== this.sig) {
      this.sig = sig;
      $('hearts').innerHTML = this.row(P.health, 'heart');
      $('food').innerHTML = this.row(P.hunger, 'food');
      const air = P.headInWater || P.air < 10;
      $('air').innerHTML = air ? Array.from({ length: Math.ceil(P.air) }, () => `<img src="${ICONS.bubble}" alt="">`).join('') : '';
      $('xpfill').style.width = (P.xp / (7 + P.level * 2) * 100) + '%';
      $('level').textContent = P.level > 0 ? P.level : '';
    }
    // boss bar
    let boss = null;
    for (const d of G.dragons) if (!d.done && d.pos.distanceTo(P.pos) < 180) { boss = d; break; }
    $('bossbar').hidden = !boss;
    if (boss) { $('bossname').textContent = boss.name; $('bossfill').style.width = (boss.hp / boss.maxHp * 100) + '%'; $('bossfill').style.background = '#' + boss.K.eye.toString(16).padStart(6, '0'); }
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
      el.dataset.name = DEFS[s.id].name;
    } else {
      img.style.visibility = 'hidden'; cnt.textContent = ''; el.dataset.name = '';
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
      s.addEventListener('pointerdown', e => { e.preventDefault(); this.clickSlot(i, e.button, e.shiftKey); });
      s.addEventListener('contextmenu', e => e.preventDefault());
      s.addEventListener('pointerenter', () => this.tip(s.dataset.name));
      s.addEventListener('pointerleave', () => this.tip(''));
      parent.appendChild(s);
      this.invSlots[i] = s;
    };
    for (let i = 9; i < 36; i++) mk($('inv-main'), i);
    for (let i = 0; i < 9; i++) mk($('inv-hot'), i);
    $('cat-search').addEventListener('input', () => this.renderSide());
    for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { this.tab = b.dataset.tab; this.renderSide(); });
    $('trash').addEventListener('pointerdown', e => { e.preventDefault(); this.cursor = null; this.moveCursor(); });
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

  clickSlot(i, button, shift) {
    const inv = G.player.inv, s = inv.slots[i], cur = this.cursor;
    if (shift && s && !cur) {
      const [a, b] = i < 9 ? [9, 36] : [0, 9];
      const max = DEFS[s.id].stack;
      for (let k = a; k < b && s.count; k++) { const t = inv.slots[k]; if (t && t.id === s.id && t.count < max) { const n = Math.min(max - t.count, s.count); t.count += n; s.count -= n; } }
      for (let k = a; k < b && s.count; k++) if (!inv.slots[k]) { inv.slots[k] = { id: s.id, count: s.count }; s.count = 0; }
      if (!s.count) inv.slots[i] = null;
    } else if (button === 2) {
      if (!cur && s) { const half = Math.ceil(s.count / 2); this.cursor = { id: s.id, count: half }; s.count -= half; if (!s.count) inv.slots[i] = null; }
      else if (cur && (!s || (s.id === cur.id && s.count < DEFS[s.id].stack))) {
        if (!s) inv.slots[i] = { id: cur.id, count: 1 }; else s.count++;
        cur.count--; if (!cur.count) this.cursor = null;
      }
    } else {
      if (!cur) { this.cursor = s; inv.slots[i] = null; }
      else if (!s) { inv.slots[i] = cur; this.cursor = null; }
      else if (s.id === cur.id) { const n = Math.min(DEFS[s.id].stack - s.count, cur.count); s.count += n; cur.count -= n; if (!cur.count) this.cursor = null; }
      else { inv.slots[i] = cur; this.cursor = s; }
    }
    G.sound.play('click');
    inv.changed();
    this.moveCursor();
  },

  openInventory(station) {
    if (G.state !== 'play') return;
    this.station = station || null;
    G.setState('inventory');
    $('menu-inv').hidden = false;
    this.renderInventory();
    this.renderSide();
  },

  closeInventory() {
    if (this.cursor) {
      const left = G.player.inv.add(this.cursor.id, this.cursor.count);
      if (left) { const P = G.player; G.spawnDrop(this.cursor.id, left, P.pos.x, P.pos.y + 1.2, P.pos.z); }
      this.cursor = null; this.moveCursor();
    }
    this.tip('');
    $('menu-inv').hidden = true;
    G.setState('play');
  },

  renderInventory() {
    const inv = G.player.inv;
    for (let i = 0; i < 36; i++) this.fillSlot(this.invSlots[i], inv.slots[i]);
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
      if (!d || d.id === 0 || d.liquid || d.portal) continue;
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
    $('craft-hint').textContent = this.station === 'furnace' ? 'Smelt ores, sand and food.'
      : this.station === 'table' ? 'Every recipe is available here.' : 'Place a Crafting Table and ' + (Input.touch ? 'tap' : 'right-click') + ' it for tools, weapons and more.';
    const list = $('recipes');
    const rs = this.stationRecipes().map(r => [r, this.canCraft(r)]);
    rs.sort((a, b) => (b[1] - a[1]));
    list.innerHTML = '';
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
      row.innerHTML = `<span class="out"><img alt="" src="${iconURL(outId)}">${r[1] > 1 ? '<b>' + r[1] + '</b>' : ''}</span><span class="rname">${DEFS[outId].name}</span><span class="ins">${ins}</span>`;
      row.title = ok ? 'Click to craft. Shift-click crafts as many as you can.' : 'Missing ingredients';
      row.addEventListener('click', e => { if (ok) { this.craft(r, e.shiftKey ? 64 : 1); this.renderInventory(); } });
      list.appendChild(row);
    }
  },

  /* ---------- menus ---------- */
  bindMenus() {
    $('btn-survival').addEventListener('click', () => G.startNew('survival'));
    $('btn-creative').addEventListener('click', () => G.startNew('creative'));
    $('btn-continue').addEventListener('click', () => G.continueSaved());
    $('btn-reseed').addEventListener('click', () => { const v = $('seed').value.trim(); G.previewWorld(v || null); });
    $('seed').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-reseed').click(); e.stopPropagation(); });
    $('btn-resume').addEventListener('click', () => G.resume());
    $('btn-mode').addEventListener('click', () => {
      const P = G.player;
      P.mode = P.mode === 'survival' ? 'creative' : 'survival';
      if (P.mode === 'survival') P.flying = false;
      this.syncPause();
      this.message('Game mode: ' + (P.mode === 'survival' ? 'Survival' : 'Creative'));
    });
    $('btn-dragon').addEventListener('click', () => { if (G.summonDragon()) G.resume(); });
    $('btn-time').addEventListener('click', () => { G.time = G.isNight() ? 0.02 : 0.52; this.message(G.isNight() ? 'Night falls.' : 'The sun rises.'); });
    $('btn-cam').addEventListener('click', () => { G.camMode = (G.camMode + 1) % 3; this.syncPause(); });
    $('btn-save').addEventListener('click', () => { G.save(); this.message('World saved in this browser.'); });
    $('btn-quit').addEventListener('click', () => { G.save(); G.toTitle(); });
    $('rd').addEventListener('input', () => { for (const w of Object.values(G.worlds)) { w.renderDist = +$('rd').value; w.queue = []; } $('rd-val').textContent = $('rd').value; G.applyFog(); });
    $('sens').addEventListener('input', () => { Input.sens = +$('sens').value; $('sens-val').textContent = (+$('sens').value).toFixed(1); });
    $('btn-respawn').addEventListener('click', () => { $('menu-dead').hidden = true; G.respawnPlayer(); G.resume(); });
    $('nick').addEventListener('change', () => Net.setNick($('nick').value));
    $('nick').addEventListener('keydown', e => e.stopPropagation());
    $('btn-inv-close').addEventListener('click', () => { this.closeInventory(); G.lock(); });
  },

  syncPause() {
    const P = G.player;
    $('btn-mode').textContent = 'Game mode: ' + (P.mode === 'survival' ? 'Survival' : 'Creative');
    $('rd').value = G.world.renderDist; $('rd-val').textContent = G.world.renderDist;
    $('sens').value = Input.sens; $('sens-val').textContent = Input.sens.toFixed(1);
    $('btn-time').textContent = G.isNight() ? 'Make it day' : 'Make it night';
    $('btn-cam').textContent = 'Camera: ' + ['First person', 'Behind', 'Front'][G.camMode];
    $('btn-dragon').textContent = G.dim === 'nether' ? 'Summon a dragon' : 'Summon a dragon (Nether only)';
    $('btn-dragon').classList.toggle('gold', G.dim === 'nether');
    const names = Net.names();
    $('players').textContent = Net.status === 'on'
      ? (names.length ? 'Playing with: ' + names.join(', ') + '. ' : 'Nobody else is in your world yet. Friends join you by typing seed ' + G.seed + ' on the title screen. ') + Net.describeOthers()
      : 'Multiplayer is not connected. See the title screen for details.';
    $('pad-help').hidden = !Pad.active;
  },

  showDeath() {
    G.setState('dead');
    $('death-info').textContent = 'You reached level ' + G.player.level + '. Your items are on the ground where you fell.';
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
      else if (G.state === 'pause' && k === 'Escape' && Input.fallback) { G.resume(); }
      Input.keys[k] = true;
    });
    window.addEventListener('keyup', e => { Input.keys[e.code] = false; });
    window.addEventListener('blur', () => { Input.keys = Object.create(null); Input.left = Input.right = false; });

    document.addEventListener('pointerlockchange', () => {
      Input.locked = document.pointerLockElement === cv;
      if (Input.locked) G.lockFails = 0;
      if (!Input.locked && G.state === 'play' && !Input.fallback && !Input.touch && !Pad.active) G.pause();
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
      look.hold = setTimeout(() => { if (look && !look.moved) { Input.left = true; Input.leftPressed = true; look.holding = true; } }, 280);
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });
    cv.addEventListener('pointermove', e => {
      if (!look || e.pointerId !== look.id) return;
      const dx = e.clientX - look.x, dy = e.clientY - look.y;
      look.x = e.clientX; look.y = e.clientY;
      if (Math.hypot(e.clientX - look.sx, e.clientY - look.sy) > 10) look.moved = true;
      const f = Input.touch ? 2.2 : 1.6;
      Input.lookDX += dx * f; Input.lookDY += dy * f;
    });
    const endLook = e => {
      if (!look || e.pointerId !== look.id) return;
      clearTimeout(look.hold);
      if (look.holding) Input.left = false;
      else if (!look.moved && performance.now() - look.t < 280) {
        const tgt = G.player.target();
        if (tgt.mob) { Input.leftPressed = true; } else { Input.rightPressed = true; }
      }
      look = null;
    };
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
    hold('t-drop', () => { if (G.state === 'play') G.player.dropHeld(false); });
  },

  keyPress(k, e) {
    const P = G.player;
    if (k.startsWith('Digit')) { const n = +k.slice(5); if (n >= 1 && n <= 9) P.sel = n - 1; }
    else if (k === 'KeyE') { this.openInventory(null); G.unlock(); }
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
