'use strict';
/* Player state, inventory, movement physics and block/mob interaction. */

class Inventory {
  constructor() { this.slots = new Array(40).fill(null); this.version = 0; } // 0-8 hotbar, 9-35 backpack, 36-39 armor
  changed() { this.version++; }
  add(id, count, e, n, c) {
    const max = DEFS[id].stack || 64;
    if (c) { for (let i = 0; i < 36 && count > 0; i++) if (!this.slots[i]) { const s = { id, count: 1, c }; if (e) s.e = e; if (n) s.n = n; this.slots[i] = s; count--; } this.changed(); return count; }
    if (e) { for (let i = 0; i < 36 && count > 0; i++) if (!this.slots[i]) { this.slots[i] = n ? { id, count: 1, e, n } : { id, count: 1, e }; count--; } this.changed(); return count; }
    if (n) { for (let i = 0; i < 36 && count > 0; i++) { const s = this.slots[i]; if (s && s.id === id && s.n === n && !s.e && s.count < max) { const k = Math.min(max - s.count, count); s.count += k; count -= k; } } for (let i = 0; i < 36 && count > 0; i++) if (!this.slots[i]) { const k = Math.min(max, count); this.slots[i] = { id, count: k, n }; count -= k; } this.changed(); return count; }
    for (let i = 0; i < 36 && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && !s.e && !s.n && s.count < max) { const n = Math.min(max - s.count, count); s.count += n; count -= n; }
    }
    for (let i = 0; i < 36 && count > 0; i++) {
      if (!this.slots[i]) { const n = Math.min(max, count); this.slots[i] = { id, count: n }; count -= n; }
    }
    this.changed();
    return count;
  }
  /* is there room for this item (an empty slot, or a stack it can join)? */
  hasRoom(id, e, n) {
    const max = DEFS[id].stack || 64;
    for (let i = 0; i < 36; i++) { const s = this.slots[i]; if (!s || (!e && s.id === id && !s.e && (s.n || '') === (n || '') && s.count < max)) return true; }
    return false;
  }
  count(id) { let n = 0; for (let i = 0; i < 36; i++) { const s = this.slots[i]; if (s && s.id === id) n += s.count; } return n; }
  armorPoints() { let n = 0; for (let i = 36; i < 40; i++) { const s = this.slots[i]; if (s && DEFS[s.id].armor) n += DEFS[s.id].armor.points; } return n; }
  /* diamond and netherite armor are tougher: they hold up better against big hits */
  armorToughness() { let n = 0; for (let i = 36; i < 40; i++) { const s = this.slots[i], k = s && DEFS[s.id].key; if (k && DEFS[s.id].armor) n += /^netherite_/.test(k) ? 3 : /^diamond_/.test(k) ? 2 : 0; } return n; }
  remove(id, count) {
    for (let i = 35; i >= 0 && count > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) { const n = Math.min(s.count, count); s.count -= n; count -= n; if (!s.count) this.slots[i] = null; }
    }
    this.changed();
  }
  takeFrom(slot, n) {
    const s = this.slots[slot];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[slot] = null;
    this.changed();
  }
  toJSON() { return this.slots.map(slotToArr); }
  load(arr) { this.slots = arr.map(a => slotFromArr(a)); while (this.slots.length < 40) this.slots.push(null); this.changed(); }
}

const BED_DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

class Player {
  constructor() {
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.w = 0.6; this.h = 1.8; this.eye = 1.62;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false; this.hitH = false;
    this.inv = new Inventory();
    this.sel = 0;
    this.mode = 'survival';
    this.spawn = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.health = 20; this.hunger = 20; this.saturation = 5; this.air = 15; this.fire = 0; this.deathCause = ''; this.airWarned = false;
    this.xp = 0; this.level = 0; this.dead = false; this.flying = false;
    this.hurtCd = 0; this.attackCd = 0; this.useCd = 0; this.breakCd = 0;
    this.regenT = 0; this.starveT = 0; this.drownT = 0; this.lavaT = 0; this.cactusT = 0; this.fireT = 0;
    this.fallStart = null; this.breaking = null; this.swing = 0; this.lastJump = 0;
    this.sprinting = false; this.inWater = false; this.headInWater = false; this.inLava = false;
  }

  heldSlot() { return this.inv.slots[this.sel]; }
  /* a power from a beacon: its level, or 0 */
  fx(k) { const e = this.effects && this.effects[k]; return e && e.until > performance.now() ? e.lvl : 0; }
  addEffect(k, lvl, secs) { this.effects = this.effects || {}; this.effects[k] = { lvl, until: performance.now() + secs * 1000 }; }
  heldDef() { const s = this.heldSlot(); return s ? DEFS[s.id] : null; }
  eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + (this.sleeping ? 0.3 : this.eye - (this.sneaking ? 0.15 : 0)), this.pos.z); }
  lookDir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  hurt(amount, from, kb = 6, force = false, cause = '') {
    if (this.dead || this.mode === 'creative' || this.mode === 'spectator') return;
    // game rules can switch off kinds of hurt
    if ((!G.rule('fallDamage') && /fell|fall/i.test(cause || '')) || (!G.rule('fireDamage') && /fire|lava|burn|flame|magma/i.test(cause || '')) || (!G.rule('drowningDamage') && /drown/i.test(cause || '')) || (!G.rule('freezeDamage') && /froze|freez/i.test(cause || ''))) return;
    if (!(amount >= 1)) return; // nothing to lose: no hurt, no message
    if (this.fireProof(cause)) return;
    if (this.hurtCd > 0 && !force) return;
    if (this.sleeping) G.wake('You were woken up!');
    // armor softens every kind of hurt except falling, drowning, starving and the void (4% per armor point, like Minecraft)
    const bypass = !from && /fell from|fell out|drown|starv|void|pearl|suffocat|froze/i.test(cause || '');
    // armor works like Minecraft: big hits get through more than small ones; damage is kept in halves, so
    // a stronger sword always does more (no rounding two different swords to the same number)
    if (this.fx('resistance') && !/void|starv/i.test(cause || '')) amount = Math.max(0.5, Math.round(amount * (1 - 0.2 * this.fx('resistance')) * 2) / 2);
    // Protection on armor and Feather Falling on boots (4% less for each point, at most 80%)
    { let epf = 0; const fall = /fell from/i.test(cause || '');
      if (!/starv|void/i.test(cause || '')) for (let i = 36; i < 40; i++) { const s = this.inv.slots[i]; epf += enchLv(s, 'protection'); if (fall) epf += 3 * enchLv(s, 'feather_falling'); }
      if (epf) amount = Math.max(0.5, Math.round(amount * (1 - Math.min(20, epf) / 25) * 2) / 2); }
    if (!bypass) {
      const a = this.inv.armorPoints(), t = this.inv.armorToughness();
      const cut = clamp(Math.max(a / 5, a - amount / (2 + t / 4)), 0, 20) / 25;
      amount = Math.max(0.5, Math.round(amount * (1 - cut) * 2) / 2);
    }
    this.deathCause = cause || (from ? 'You were defeated by a monster or an explosion.' : 'You died.');
    if (from && G.lastAttacker && !G.lastAttacker.dead) for (const m of G.mobs) if (m.tame && m.type === 'wolf') m.petTarget = G.lastAttacker;
    G.lastAttacker = null;
    this.health -= amount; this.hurtCd = 0.5;
    G.ui.damagePopup(amount, this.deathCause);
    G.ui.hurtFlash();
    G.sound.play(/lava|fire|burn|flame|magma/i.test(cause || '') ? 'hurtFire' : 'hurt');
    if (from && kb) {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z, l = Math.hypot(dx, dz) || 1;
      this.vel.x += dx / l * kb; this.vel.z += dz / l * kb; this.vel.y = Math.max(this.vel.y, 5);
    }
    if (this.health <= 0) this.die();
  }

  /* an elytra: press jump while falling to spread your wings; look down to speed up, up to climb; fireworks push you */
  glideTick(dt, input, creative) {
    const ch = this.inv.slots[37], elytra = ch && DEFS[ch.id].elytra, press = input.jump && !this.jumpHeld;
    this.jumpHeld = !!input.jump;
    if (!this.gliding && press && elytra && !this.onGround && !this.flying && this.vel.y < 0) { this.gliding = true; this.glideSpeed = Math.max(6, Math.hypot(this.vel.x, this.vel.y, this.vel.z)); G.ui.message('Gliding! Look down to go faster, up to climb. Use fireworks to boost.', 'gold'); }
    if (!this.gliding) return false;
    if (this.onGround || !elytra || this.inWater || this.inLava || this.flying || this.riding) { this.gliding = false; return false; }
    const L = this.lookDir();
    this.glideSpeed += (-L.y * 26 - 2.5) * dt;
    if (this.boostT > 0) { this.boostT -= dt; this.glideSpeed += 34 * dt; if (Math.random() < dt * 20) G.particles.spawn(this.pos.x, this.pos.y + 0.5, this.pos.z, 0xffd040, 0, 0, 0, 0.1, 0.5, 0); }
    this.glideSpeed = clamp(this.glideSpeed, 3, 44);
    this.vel.set(L.x * this.glideSpeed, L.y * this.glideSpeed - 2.2, L.z * this.glideSpeed);
    this.fallStart = this.pos.y; // a glide is not a fall
    return true;
  }
  /* fire resistance keeps fire and lava from hurting you */
  fireProof(cause) { return this.fx('fire_resistance') && /fire|lava|burn|flame|magma|blaze/i.test(cause || ''); }
  die() {
    G.lastDeath = { x: this.pos.x, y: this.pos.y, z: this.pos.z, dim: G.dim };
    // holding a Totem of Undying: it saves you instead, like Minecraft
    const held = this.heldSlot();
    if (held && DEFS[held.id].key === 'totem_of_undying') {
      this.inv.takeFrom(this.sel, 1); this.inv.changed();
      this.health = 2; this.fire = 0; this.fireT = 0; this.effects = {};
      this.addEffect('regeneration', 2, 40); this.addEffect('absorption', 2, 5);
      G.particles.burst(this.pos.x, this.pos.y + 1, this.pos.z, [0xf0d040, 0x3ac83a, 0xffffff], 40, 4, 0.18);
      G.sound.play('levelup');
      G.ui.message('The Totem of Undying saved your life!', 'gold');
      return;
    }
    if (this.riding) this.dismount();
    this.health = 0; this.dead = true; this.effects = {};
    if (G.keepInventory) { if (G.rule('doImmediateRespawn') && !G.hardcore) { G.respawnPlayer(); return; } G.ui.showDeath(); return; } // keep inventory: items and XP stay with you
    for (let i = 0; i < 40; i++) {
      const s = this.inv.slots[i];
      if (s) G.spawnDrop(s.id, s.count, this.pos.x, this.pos.y + 1, this.pos.z, new THREE.Vector3((Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6), slotExtras(s));
    }
    this.inv.slots.fill(null); this.inv.changed();
    this.xp = 0; this.level = 0;
    if (G.rule('doImmediateRespawn') && !G.hardcore) { G.respawnPlayer(); return; }
    G.ui.showDeath();
  }

  respawn() {
    const xp = this.xp, level = this.level;
    this.reset();
    if (G.keepInventory) { this.xp = xp; this.level = level; }
    this.pos.copy(this.spawn); this.vel.set(0, 0, 0);
  }

  addXp(n) {
    this.xp += n;
    let need = 7 + this.level * 2;
    while (this.xp >= need) { this.xp -= need; this.level++; need = 7 + this.level * 2; G.sound.play('levelup'); }
  }

  /* ---------- per-frame ---------- */
  update(dt, input) {
    if (this.dead) return;
    const W = G.world;
    this.hurtCd -= dt; this.attackCd -= dt; this.useCd -= dt; this.breakCd -= dt;
    this.swing = Math.max(0, this.swing - dt * 3.5);
    const spectator = this.mode === 'spectator', creative = this.mode === 'creative' || spectator;
    if (!creative) this.flying = false;
    if (spectator) this.flying = true;
    if (this.riding) {
      const h = this.riding;
      if (h.dead || h.removed || input.sneak) { this.dismount(); return; }
      // steer the horse with the same controls as walking
      let mx = input.moveX, mz = input.moveZ;
      const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      const wx = -s * mz + c * mx, wz = -c * mz - s * mx;
      if (h.T.boat) {
        // in a boat: the front seat steers, the back seat just comes along
        if (this.seat === 0 && !h.remoteCtl) h.drive = { x: wx, z: wz };
        const off = h.T.cart ? 0 : this.seat === 1 ? -0.55 : 0.25, by = h.mesh.rotation.y;
        this.pos.set(h.pos.x + Math.sin(by) * off, h.pos.y + (h.T.cart ? 0.25 : 0.05), h.pos.z + Math.cos(by) * off);
      } else {
        h.drive = { x: wx, z: wz, jump: input.jump, yaw: Math.atan2(-s, -c) };
        this.pos.set(h.pos.x, h.pos.y + (h.T.seat !== undefined ? h.T.seat : h.type === 'donkey' ? 0.75 : 0.95), h.pos.z);
      }
      this.vel.set(0, 0, 0); this.onGround = true; this.fallStart = null; this.flying = false;
      // riding doesn't let you breathe under water: your head is still where it is
      const W = G.world;
      this.headInWater = W.liquidAt(this.pos.x, this.pos.y + this.eye, this.pos.z) === ID.water;
      this.inWater = this.headInWater || W.liquidAt(this.pos.x, this.pos.y + 0.4, this.pos.z) === ID.water;
      this.inLava = W.liquidAt(this.pos.x, this.pos.y + 0.4, this.pos.z) === ID.lava;
      if (!creative) this.survivalTick(dt, false);
      return;
    }

    // liquids
    const feet = W.liquidAt(this.pos.x, this.pos.y + 0.1, this.pos.z);
    const body = W.liquidAt(this.pos.x, this.pos.y + 0.9, this.pos.z);
    this.headInWater = W.liquidAt(this.pos.x, this.pos.y + this.eye, this.pos.z) === ID.water;
    this.inWater = feet === ID.water || body === ID.water;
    this.inLava = feet === ID.lava || body === ID.lava;
    const swimming = this.inWater || this.inLava;
    // powder snow: you sink in slowly, move slowly, and land softly
    const psAt = h => W.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + h), Math.floor(this.pos.z)) === ID.powder_snow;
    this.inSnow = psAt(0.1) || psAt(0.9);
    this.headInSnow = psAt(this.eye);

    // input
    if (input.flyToggle && creative) { this.flying = !this.flying; this.vel.y = 0; }
    input.flyToggle = false;
    let mx = input.moveX, mz = input.moveZ;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    this.sneaking = !this.flying && input.sneak;
    this.sprinting = input.sprint && mz > 0.3 && !this.sneaking && (creative || this.hunger > 6);
    let speed = this.flying ? (input.sprint ? 20 : 11) : this.sprinting ? 5.7 : this.sneaking ? 1.4 : 4.3;
    if (swimming && !this.flying) speed *= this.inLava ? 0.4 : 0.55;
    // flowing water carries you along
    const push = !this.flying && G.fluidPush && G.fluidPush(this.pos.x, this.pos.y + 0.2, this.pos.z);
    if (push) { const k = push[2] === 'water' ? 7 : 2; this.vel.x += push[0] * k * dt; this.vel.z += push[1] * k * dt; }
    // swimming next to a dolphin makes you fast (Dolphin's Grace)
    if (swimming && !this.inLava && G.mobs.some(m => m.type === 'dolphin' && !m.dead && m.pos.distanceTo(this.pos) < 7)) speed *= 2.2;
    if (!this.flying && this.fx('speed')) speed *= 1 + 0.2 * this.fx('speed');
    if (this.inSnow && !this.flying) speed *= 0.45;
    // a cobweb holds you; a sweet berry bush scratches and slows you
    const cellAt = h => DEFS[W.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + h), Math.floor(this.pos.z))] || {};
    const c0 = cellAt(0.1), c1 = cellAt(1.2);
    this.inWeb = !!(c0.web || c1.web);
    if (this.inWeb && !this.flying) { speed *= 0.12; this.vel.y = Math.max(this.vel.y, -1); this.fallStart = null; }
    if ((c0.berry !== undefined) && !this.flying) { speed *= 0.5; if (Math.hypot(this.vel.x, this.vel.z) > 0.6 && this.mode === 'survival' && (this.berryT = (this.berryT || 0) + dt) > 1) { this.berryT = 0; this.hurt(1, null, 0, false, 'You got scratched by a sweet berry bush.'); } }
    // honey blocks are sticky: slow to walk on and hard to jump from
    const under = this.onGround ? G.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z)) : 0;
    this.onHoney = under === ID.honey_block;
    if (this.onHoney && !this.flying) speed *= 0.4;
    if ((under === ID.soul_sand || W.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.05), Math.floor(this.pos.z)) === ID.soul_sand) && !this.flying) speed *= 0.45; // soul sand pulls at your feet
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const wx = (-s * mz + c * mx) * speed, wz = (-c * mz - s * mx) * speed;
    const accel = this.flying ? 8 : this.onGround ? 16 : swimming ? 6 : 3.5;
    this.vel.x += (wx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz - this.vel.z) * Math.min(1, accel * dt);

    if (this.flying) {
      const vy = ((input.jump ? 1 : 0) - (input.sneak ? 1 : 0)) * 9;
      this.vel.y += (vy - this.vel.y) * Math.min(1, 10 * dt);
    } else if (swimming) {
      this.vel.y -= 9 * dt;
      this.vel.y *= Math.pow(0.15, dt);
      if (input.jump) this.vel.y = Math.min(this.vel.y + 26 * dt, 3.6);
      if (input.jump && this.hitH) this.vel.y = 5.5;
    } else if (this.onLadder()) {
      // climb by walking into the ladder or holding jump; sneak to hold still; otherwise slide down slowly
      const climbing = input.jump || this.hitH || Math.abs(input.moveZ || 0) > 0.1;
      this.vel.y = climbing ? 3.2 : input.sneak ? 0 : Math.max(this.vel.y - 28 * dt, -2.4);
      this.fallStart = null;
    } else if (this.glideTick(dt, input, creative)) {
      // gliding with an elytra
    } else {
      this.vel.y -= 28 * dt;
      if (this.fx('slow_falling') && this.vel.y < -2.5) { this.vel.y = -2.5; this.fallStart = null; }
      if (this.fx('levitation')) { this.vel.y = 1.8; this.fallStart = null; }
      if (this.vel.y < -55) this.vel.y = -55;
      if (input.jump && this.onGround) { this.vel.y = (this.onHoney ? 5 : 8.7) + 1.7 * this.fx('jump_boost'); this.hungerDrain(this.sprinting ? 0.05 : 0.0125); }
      if (this.inSnow) { this.vel.y = Math.max(this.vel.y, -1.2); if (input.jump) this.vel.y = Math.max(this.vel.y, 2.2); this.fallStart = null; }
    }
    const wasGround = this.onGround;
    // sneaking keeps you from walking off edges
    if (this.sneaking && this.onGround) {
      const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
      if (!W.collides(nx, this.pos.y - 0.6, this.pos.z, this.w, 0.55)) this.vel.x = 0;
      if (!W.collides(this.pos.x, this.pos.y - 0.6, nz, this.w, 0.55)) this.vel.z = 0;
    }
    if (this.mode === 'spectator') { this.pos.addScaledVector(this.vel, dt); this.onGround = false; } // a spectator flies through everything
    else W.moveBody(this, dt);
    if (this.flying && this.onGround && !input.jump) this.flying = false;

    // fall damage
    if (swimming || this.flying || creative) this.fallStart = null;
    else if (!this.onGround) this.fallStart = this.fallStart === null ? this.pos.y : Math.max(this.fallStart, this.pos.y);
    if (this.onGround && !wasGround && this.fallStart !== null) {
      const d = this.fallStart - this.pos.y;
      if (d >= 4 + this.fx('jump_boost')) this.hurt(Math.floor(d - 3 - this.fx('jump_boost')), null, 0, true, 'You fell from too high.'); // a short drop doesn't hurt at all
      if (d > 1) G.sound.play('land');
      this.fallStart = null;
    }
    if (this.onGround) this.fallStart = null;
    if (this.pos.y < -30) { this.hurt(20, null, 0, true, 'You fell out of the world into the void.'); }

    if (!creative) this.survivalTick(dt, swimming);

    // footsteps
    if (this.onGround && Math.hypot(this.vel.x, this.vel.z) > 1) {
      this.stepT = (this.stepT || 0) - dt * Math.hypot(this.vel.x, this.vel.z);
      if (this.stepT <= 0) { this.stepT = 2.2; G.sound.play('step', null, G.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.2), Math.floor(this.pos.z))); }
    }
  }

  mount(h, seat = 0) {
    this.riding = h; this.seat = seat;
    if (seat === 0) h.rider = this;
    this.flying = false;
    if (h.T.boat) G.ui.message(seat === 0 ? 'In the boat! Steer like walking, and press sneak (C, the down button, or R3) to get out. A friend can sit in the back.' : 'You sit in the back of the boat. Press sneak to get out.', 'gold');
    else G.ui.message('Riding! Steer like walking, jump to leap, and press sneak (C, the down button, or R3) to get off.', 'gold');
  }

  dismount() {
    const h = this.riding;
    this.riding = null;
    if (h) {
      if (h.rider === this) { h.rider = null; h.drive = null; }
      // step out onto the side that has room
      const W = G.world;
      let spot = null;
      for (const [dx, dz] of [[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3], [1.3, 1.3], [-1.3, -1.3]]) {
        for (const dy of [0.3, 1.1]) if (!W.collides(h.pos.x + dx, h.pos.y + dy, h.pos.z + dz, this.w, this.h)) { spot = [h.pos.x + dx, h.pos.y + dy, h.pos.z + dz]; break; }
        if (spot) break;
      }
      if (spot) this.pos.set(spot[0], spot[1], spot[2]); else this.pos.set(h.pos.x, h.pos.y + 1, h.pos.z);
    }
    this.seat = 0;
    this.vel.set(0, 4, 0);
  }

  /* like Minecraft: food also fills a hidden 'saturation' store that gets used up before the hunger bar */
  hungerDrain(n) {
    if (this.mode !== 'survival') return;
    n *= G.diff().hunger;
    const fromSat = Math.min(this.saturation || 0, n);
    this.saturation = (this.saturation || 0) - fromSat;
    this.hunger = Math.max(0, this.hunger - (n - fromSat));
  }

  survivalTick(dt, swimming) {
    const W = G.world;
    // sand or gravel fell on your head: you can't breathe (break it or get out!)
    const headId = W.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + this.eye), Math.floor(this.pos.z));
    if (headId === ID.sand || headId === ID.gravel) {
      this.suffT = (this.suffT || 0) + dt;
      if (this.suffT >= 0.5) { this.suffT = 0; this.hurt(1, null, 0, true, headId === ID.sand ? 'You suffocated under sand.' : 'You suffocated under gravel.'); }
    } else this.suffT = 0;
    // powder snow: stay in it too long and you start to freeze
    if (this.inSnow || this.headInSnow) {
      this.freezeT = Math.min(10, (this.freezeT || 0) + dt);
      if (this.freezeT >= 7) { this.frostT = (this.frostT || 0) + dt; if (this.frostT >= 2) { this.frostT = 0; this.hurt(1, null, 0, true, 'You froze to death in powder snow.'); } }
    } else { this.freezeT = Math.max(0, (this.freezeT || 0) - dt * 2); this.frostT = 0; }
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.5;
    this.hungerDrain(dt * (this.sprinting ? 1 / 25 : moving ? 1 / 100 : 1 / 200)); // walking: a full bar lasts about 40 minutes
    const D = G.diff();
    if (D.mobs === 0 && this.hunger < 20) this.hunger = Math.min(20, this.hunger + dt / 3); // peaceful: never hungry for long
    if ((this.hunger >= 17 || D.mobs === 0) && this.health < 20 && G.rule('naturalRegeneration')) {
      this.regenT += dt;
      if (this.regenT > D.regen) { this.regenT = 0; this.health = Math.min(20, this.health + 1); this.hungerDrain(0.25); }
    } else this.regenT = 0;
    // Regeneration from a beacon heals you even when you're hungry
    // poison (from a cave spider): it hurts, but never takes your last heart
    if (this.fx('poison') && this.health > 1) { this.fxPoisonT = (this.fxPoisonT || 0) + dt; if (this.fxPoisonT >= 1.25) { this.fxPoisonT = 0; this.health -= 1; G.ui.hurtFlash(); } }
    if (this.fx('regeneration') && this.health < 20) { this.fxRegenT = (this.fxRegenT || 0) + dt; if (this.fxRegenT >= 2.5) { this.fxRegenT = 0; this.health = Math.min(20, this.health + 1); } }
    if (this.hunger <= 0) {
      this.starveT += dt;
      if (this.starveT > 4) { this.starveT = 0; if (this.health > G.diff().starve) this.hurt(1, null, 0, true, 'You starved. Eat food when your hunger bar gets low.'); }
    }
    // a turtle shell lets you breathe a little longer under water
    const turtle = this.inv.slots[36] && DEFS[this.inv.slots[36].id].key === 'turtle_helmet';
    if (this.headInWater && ((turtle && (this.turtleT = (this.turtleT || 0) + dt) < 12) || this.fx('water_breathing'))) { /* still breathing */ }
    else if (this.headInWater) {
      this.air -= dt;
      if (this.air < 5 && !this.airWarned) { this.airWarned = true; G.ui.message('You are running out of air! Swim up to the surface!', 'purple'); }
      if (this.air < 0) {
        this.drownT += dt;
        if (this.drownT > 1) { this.drownT = 0; this.hurt(2, null, 0, true, 'You drowned. Under water, watch the bubbles above your hearts and swim up before they run out.'); }
      }
    } else { this.turtleT = 0; this.air = Math.min(15, this.air + dt * 5); if (this.air > 8) this.airWarned = false; }
    if (this.inLava) {
      this.fire = 6;
      this.lavaT -= dt;
      if (this.lavaT <= 0) { this.lavaT = 0.5; this.hurt(4, null, 0, true, 'You fell into lava.'); }
    }
    if ((W.touching(this, ID.fire, 0.02) || W.touching(this, ID.soul_fire, 0.02)) && !this.inWater) this.fire = Math.max(this.fire || 0, 6);
    if (this.inWater) this.fire = 0;
    if (this.fire > 0) {
      this.fire -= dt; this.fireT -= dt;
      if (this.fireT <= 0) { this.fireT = 1; this.hurt(1, null, 0, true, 'You burned to death. Jump into water to put out the fire.'); }
    }
    this.cactusT -= dt;
    if (this.cactusT <= 0 && W.touching(this, ID.cactus, 0.06)) { this.cactusT = 0.5; this.hurt(1, null, 0, true, 'You were pricked to death by a cactus.'); }
  }

  /* ---------- targeting ---------- */
  target(aimDir) {
    const o = this.eyePos(), d = aimDir || this.lookDir();
    const reach = this.mode === 'creative' ? 6 : 4.6;
    const block = G.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, reach, false);
    let mob = null, mobT = this.mode === 'creative' ? 6 : 3.8;
    for (const m of G.mobs) {
      if (m.dead || m === this.riding) continue;
      const t = rayAABB(o, d, m.pos.x - m.w / 2 - 0.05, m.pos.y, m.pos.z - m.w / 2 - 0.05, m.pos.x + m.w / 2 + 0.05, m.pos.y + m.h, m.pos.z + m.w / 2 + 0.05);
      if (t !== null && t < mobT) { mob = m; mobT = t; }
    }
    for (const dr of G.dragons) {
      if (dr.dead) continue;
      const t = dr.hitTest(o, d, 7);
      if (t !== null && t < mobT + 3) { mob = dr; mobT = t; }
    }
    for (const rp of Net.peers.values()) {
      if (!rp.model || !rp.model.group.visible) continue;
      const q = rp.model.group.position;
      const t = rayAABB(o, d, q.x - 0.4, q.y, q.z - 0.4, q.x + 0.4, q.y + 1.9, q.z + 0.4);
      if (t !== null && t < mobT) { mob = { remote: rp, pos: q }; mobT = t; }
    }
    if (mob && block && block.dist < mobT) mob = null;
    return { block: mob ? null : block, mob };
  }

  breakTime(def) {
    if (def.hardness === Infinity) return Infinity;
    if (def.hardness === 0) return 0.05;
    const held = this.heldDef(), tool = held && held.tool;
    const canHarvest = !def.tool || !def.tier || (tool && tool.type === def.tool && tool.tier >= def.tier);
    const ef = enchLv(this.heldSlot(), 'efficiency');
    const speed = def.tool && tool && tool.type === def.tool ? tool.speed + (ef ? ef * ef + 1 : 0) : 1;
    return def.hardness * (canHarvest ? 1.5 : 5) / speed / (1 + 0.2 * this.fx('haste')) * (this.fx('mining_fatigue') ? 3.5 : 1);
  }

  canHarvest(def) {
    if (!def.tool || !def.tier) return true;
    const held = this.heldDef(), tool = held && held.tool;
    return !!(tool && tool.type === def.tool && tool.tier >= def.tier);
  }

  attack(target) {
    if (this.attackCd > 0) return;
    const held = this.heldDef();
    const hs = this.heldSlot(), sharp = enchLv(hs, 'sharpness');
    let dmg = Math.max(0.5, (held && held.damage ? held.damage : 1) + (sharp ? 0.5 * sharp + 0.5 : 0) + 3 * this.fx('strength') - 4 * this.fx('weakness'));
    const crit = !this.onGround && this.vel.y < -1 && !this.flying;
    if (crit) dmg = Math.round(dmg * 1.5);
    // the mace: the further you fall before you hit, the harder it hits (and you don't get hurt by the fall)
    if (held && held.mace && this.fallStart !== null && this.fallStart - this.pos.y > 1.5) {
      const fd = this.fallStart - this.pos.y;
      dmg += Math.min(fd, 3) * 4 + Math.max(0, Math.min(fd, 8) - 3) * 2 + Math.max(0, fd - 8);
      this.fallStart = this.pos.y; this.vel.y = 7;
      G.particles.burst(target.pos.x, target.pos.y + 0.2, target.pos.z, [0x8a8a8a, 0xc8c8c8, 0x5a98c8], 30, 4, 0.14);
      G.sound.play('explode', target.pos);
      for (const m of G.mobs) if (m !== target && !m.dead && !m.tame && m.pos.distanceTo(target.pos) < 3.5) { m.vel.y = 7; const dx = m.pos.x - target.pos.x, dz = m.pos.z - target.pos.z, l = Math.hypot(dx, dz) || 1; m.vel.x = dx / l * 6; m.vel.z = dz / l * 6; }
    }
    this.attackCd = 0.45; this.swing = 1;
    if ((target instanceof Mob && !target.tame) || target.remote) for (const m of G.mobs) if (m.tame && m.type === 'wolf' && m !== target && !m.remoteCtl) m.petTarget = target; // your wolves join your fight (a friend too)
    const kb = (this.sprinting ? 10 : 6) + 6 * enchLv(hs, 'knockback'), fa = enchLv(hs, 'fire_aspect');
    if (target.remote) Net.hit(target.remote, dmg, kb);
    else if (target instanceof Dragon) target.hurt(dmg);
    else {
      if (fa && target instanceof Mob && !target.T.fireproof) { target.onFire = Math.max(target.onFire || 0, 4 * fa); target.burnedAt = Date.now(); }
      G.looting = enchLv(hs, 'looting');
      target.hurt(dmg, this.pos, kb, true);
      G.looting = 0;
    }
    if (crit) G.particles.burst(target.pos.x, target.pos.y + 1, target.pos.z, [0xffffff, 0xdddddd], 8, 3, 0.1);
    this.hungerDrain(0.025);
  }

  putOutFire(x, y, z) {
    G.world.setBlock(x, y, z, 0);
    if (G.fires) delete G.fires[x + ',' + y + ',' + z];
    G.particles.burst(x + 0.5, y + 0.3, z + 0.5, [0x777777, 0x555555, 0x999999], 8, 1.2, 0.15, -1);
    G.sound.play('fuse', new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5));
    this.useCd = 0.15; this.breakCd = 0.15; this.swing = 1;
  }

  breakBlock(x, y, z, id) {
    const def = DEFS[id], W = G.world;
    if (id === ID.flag && G.myFlag && G.myFlag.dim === G.dim && G.myFlag.x === x && G.myFlag.y === y && G.myFlag.z === z) { G.myFlag = null; G.showFlag = false; }
    W.setBlock(x, y, z, 0);
    G.particles.blockBreak(x, y, z, id);
    G.sound.play('break', null, id);
    if (this.mode === 'survival') {
      if (this.canHarvest(def)) {
        const fortune = def.xp && def.drop !== undefined ? enchLv(this.heldSlot(), 'fortune') : 0; // ores give more with Fortune
        if (G.rule('doTileDrops')) for (const [did, n] of getDrops(def, Math.random)) G.spawnDrop(did, n * (fortune ? 1 + Math.max(0, (Math.random() * (fortune + 2) | 0) - 1) : 1), x + 0.5, y + 0.3, z + 0.5);
        if (def.xp && def.drop !== undefined) this.addXp(def.xp);
      }
      this.hungerDrain(0.005);
      if (id === ID.dragon_egg && Math.random() < 0.5) G.ui.message('The egg feels warm...', 'purple');
    }
    // plants and cactus above lose their support
    const above = W.getBlock(x, y + 1, z);
    const ad = above && DEFS[above];
    if (ad && (ad.cross || ad.rail || above === ID.cactus || above === ID.bamboo || above === ID.sugar_cane || ad.wire || ad.repeater || ad.plate || (ad.rsTorch && ad.rsTorch.d === 'd') || (ad.lever && ad.lever.d === 'd') || (ad.button && ad.button.d === 'd'))) this.breakBlock(x, y + 1, z, above);
    if (id === ID.chest_loot || id === ID.chest) G.breakChest(x, y, z, id === ID.chest_loot);
    if (DEFS[id].hive) G.angerBees(x, y, z, this);
    if (G.dim === 'nether' && (id === ID.gold_block || id === ID.gilded_blackstone || id === ID.nether_gold_ore || id === ID.chest || id === ID.chest_loot)) { let any = false; for (const m of G.mobs) if (m.type === 'piglin' && !m.dead && m.pos.distanceTo(this.pos) < 16 && this.mode === 'survival') { m.angry = true; any = true; } if (any) G.ui.message('The piglins saw you take their gold!', 'purple'); }
    { const bd = DEFS[id];
      if (bd.container || bd.jukebox || bd.frame) G.breakChest(x, y, z, false);
      if (bd.piston && bd.piston.ext) { const v = DIR6[bd.piston.d]; if (DEFS[W.getBlock(x + v[0], y + v[1], z + v[2])].pistonHead) W.setBlock(x + v[0], y + v[1], z + v[2], 0); }
      if (bd.pistonHead) { const v = DIR6[bd.pistonHead.d], bx = x - v[0], by = y - v[1], bz = z - v[2], base = DEFS[W.getBlock(bx, by, bz)]; if (base && base.piston && base.piston.ext) { W.setBlock(bx, by, bz, 0); if (this.mode === 'survival') G.spawnDrop(ID[bd.pistonHead.sticky ? 'sticky_piston_n' : 'piston_n'], 1, bx + 0.5, by + 0.5, bz + 0.5); } }
    }
    if (DEFS[id].creakingHeart) { for (const m of G.mobs) if (m.type === 'creaking' && m.heart && m.heart[0] === x && m.heart[1] === y && m.heart[2] === z) m.hurt(0, null); G.ui.message('You broke the Creaking Heart!', 'gold'); }
    // stone in the mountains sometimes hides a silverfish
    if ((id === ID.stone || id === ID.deepslate) && this.mode === 'survival' && G.dim === 'overworld' && Math.random() < (G.world.biomeAt(x, z, G.world.heightAt(x, z)) === BIOME.MOUNTAIN ? 0.03 : 0.004)) spawnMob('silverfish', x + 0.5, y, z + 0.5);
    if (def.shulker) { G.shulkerId = id; G.breakShulker(x, y, z); }
    if (DEFS[id].base === 'furnace') G.breakFurnace(x, y, z);
    if (DEFS[id].sign) G.setSign(x, y, z, null);
    if (def.lever || def.button || def.plate) G.switchGone(x, y, z, def);
    if (DEFS[id].door) {
      const oy = DEFS[id].door.half === 'lower' ? y + 1 : y - 1, other = W.getBlock(x, oy, z);
      if (other && DEFS[other].door) W.setBlock(x, oy, z, 0);
      if (DEFS[id].door.half === 'upper' && this.mode === 'survival') G.spawnDrop(ID[(DEFS[id].door.wood || 'oak') + '_door'], 1, x + 0.5, y - 0.5, z + 0.5);
    }
    if (DEFS[id].bedDir) {
      // the other half is exactly one block towards (or away from) the head
      const [dx, dz] = BED_DIRS[DEFS[id].bedDir], s = DEFS[id].bedPart === 'foot' ? 1 : -1, o = W.getBlock(x + dx * s, y, z + dz * s);
      if (DEFS[o].bedDir === DEFS[id].bedDir && DEFS[o].bedPart !== DEFS[id].bedPart) W.setBlock(x + dx * s, y, z + dz * s, 0);
    } else if (id === ID.bed || id === ID.bed_head) {
      const other = id === ID.bed ? ID.bed_head : ID.bed;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (W.getBlock(x + dx, y, z + dz) === other) { W.setBlock(x + dx, y, z + dz, 0); break; }
    }
    W.settle(x, y + 1, z);
    if (id === ID.obsidian || id === ID.nether_portal) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]])
        if (W.getBlock(x + dx, y + dy, z + dz) === ID.nether_portal) W.breakPortal(x + dx, y + dy, z + dz);
    }
    // water flows in
    if (y <= SEA + 1) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
        if (W.getBlock(x + dx, y + dy, z + dz) === ID.water) { W.setBlock(x, y, z, ID.water); break; }
      }
    }
  }

  /* left button held */
  tryDeflect() {
    const o = this.eyePos(), d = this.lookDir();
    for (const pr of G.projectiles) {
      if (pr.done || pr.kind !== 'fireball' || pr.owner === this) continue;
      const rel = pr.pos.clone().sub(o), along = rel.dot(d);
      if (along < 0 || along > 5.5) continue;
      if (rel.clone().addScaledVector(d, -along).length() > 1.3) continue;
      pr.vel.copy(d).multiplyScalar(22); pr.owner = this; pr.life = 8; pr.deflected = true;
      this.swing = 1; this.attackCd = 0.3; this.useCd = 0.3;
      G.sound.play('hurtMob', pr.pos); G.particles.burst(pr.pos.x, pr.pos.y, pr.pos.z, [0xffffff, 0xff9a2a], 10, 2, 0.12);
      G.ui.message('You hit the fireball back!', 'gold');
      return true;
    }
    return false;
  }
  primary(dt, pressed, tgt) {
    if (this.mode === 'spectator') { this.breaking = null; return; }
    if (this.adventure && !tgt.mob) { this.breaking = null; return; } // adventure: you can't break blocks
    // hit a ghast's fireball and it flies back the way you're looking
    if (pressed && this.tryDeflect()) return;
    const creative = this.mode === 'creative';
    if (tgt.mob) {
      this.breaking = null;
      if (pressed || this.attackCd <= 0) this.attack(tgt.mob);
      return;
    }
    const b = tgt.block;
    if (!b) { this.breaking = null; if (pressed) this.swing = 1; return; }
    if (b.id === ID.fire || b.id === ID.soul_fire) { if (pressed) this.putOutFire(b.x, b.y, b.z); this.breaking = null; return; }
    const def = DEFS[b.id];
    if (def.hardness === Infinity) { this.breaking = null; return; }
    if (creative) {
      if (pressed || this.breakCd <= 0) { this.breakCd = 0.25; this.swing = 1; this.breakBlock(b.x, b.y, b.z, b.id); }
      return;
    }
    const br = this.breaking;
    if (!br || br.x !== b.x || br.y !== b.y || br.z !== b.z || br.id !== b.id) this.breaking = { x: b.x, y: b.y, z: b.z, id: b.id, p: 0, tick: 0 };
    const B = this.breaking;
    if (this.breakCd > 0) return;
    B.p += dt / this.breakTime(def);
    B.tick -= dt;
    this.swing = Math.max(this.swing, 0.6);
    if (B.tick <= 0) { B.tick = 0.22; G.sound.play('dig', null, b.id); if (Math.random() < 0.6) G.particles.spawn(b.x + Math.random(), b.y + 1.02, b.z + Math.random(), 0x777777, 0, 1, 0, 0.08, 0.3, 8); }
    if (B.p >= 1) {
      this.breakBlock(b.x, b.y, b.z, b.id);
      this.breaking = null; this.breakCd = 0.15;
    }
  }

  /* right button */
  onLadder() {
    const W = G.world, r = this.w / 2 + 0.05;
    for (let y = Math.floor(this.pos.y); y <= Math.floor(this.pos.y + 1); y++)
      for (let z = Math.floor(this.pos.z - r); z <= Math.floor(this.pos.z + r); z++)
        for (let x = Math.floor(this.pos.x - r); x <= Math.floor(this.pos.x + r); x++) { const id = W.getBlock(x, y, z); if (id && DEFS[id].ladder) return true; }
    return false;
  }

  /* swap one of the held item for another (an empty bucket for a full one, and back) */
  swapHeld(id) {
    if (this.mode === 'creative') { if (DEFS[id].key === 'bucket') return; this.inv.add(id, 1); this.inv.changed(); return; }
    const held = this.heldSlot();
    if (held.count > 1) { this.inv.takeFrom(this.sel, 1); const left = this.inv.add(id, 1); if (left) G.spawnDrop(id, 1, this.pos.x, this.pos.y + 1, this.pos.z); }
    else this.inv.slots[this.sel] = { id, count: 1 };
    this.inv.changed();
  }

  /* buckets, milk, hoes and seeds; true if the held item did something */
  useBucketOrHoe(hd, b) {
    const W = G.world, k = hd.key;
    if ((hd.placesGate || hd.placesSign) && b) {
      let px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz;
      if (DEFS[b.id].replaceable) { px = b.x; py = b.y; pz = b.z; }
      const cur = W.getBlock(px, py, pz);
      if (cur && !DEFS[cur].replaceable && !DEFS[cur].liquid) return true;
      const L = this.lookDir(), alongX = Math.abs(L.x) > Math.abs(L.z);
      if (hd.placesGate) W.setBlock(px, py, pz, ID[(hd.placesGate === true ? '' : hd.placesGate + '_') + 'gate_' + (alongX ? 'z' : 'x') + 'c']);
      else {
        // on a wall: flat against it; on the floor: on a post, writing toward you
        let id;
        if (b.ny === 0) id = ID['wall_sign_' + (b.nx === 1 ? 'e' : b.nx === -1 ? 'w' : b.nz === 1 ? 's' : 'n')];
        else if (b.ny === 1) id = ID['sign_' + (alongX ? (L.x > 0 ? 'w' : 'e') : (L.z > 0 ? 'n' : 's'))];
        else return true;
        W.setBlock(px, py, pz, id);
        G.ui.editSign(px, py, pz);
      }
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('place'); this.useCd = 0.25; this.swing = 1;
      return true;
    }
    if (hd.placesSlab && b) {
      const k = hd.placesSlab, full = ID[DEFS[ID[k + '_slab_b']].slabFull];
      const done = () => { if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1); G.sound.play('place', null, full); this.useCd = 0.2; this.swing = 1; return true; };
      const hitDef = DEFS[b.id];
      // a slab on the matching half of the same slab: it becomes a full block
      if (hitDef.slab === k && ((hitDef.slabHalf === 'b' && b.ny === 1) || (hitDef.slabHalf === 't' && b.ny === -1))) { W.setBlock(b.x, b.y, b.z, full); return done(); }
      let px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz;
      if (hitDef.replaceable && !hitDef.slab) { px = b.x; py = b.y; pz = b.z; }
      const cur = W.getBlock(px, py, pz), cd = DEFS[cur];
      if (cur && cd.slab === k) { W.setBlock(px, py, pz, full); return done(); }
      if (cur && !cd.replaceable && !cd.liquid) return true;
      // the bottom or the top half: tapping the underside of a block, or the upper half of a block's side, makes a top slab
      const o = this.eyePos(), d = this.lookDir(), hitY = o.y + d.y * (b.dist || 0) - b.y;
      const half = b.ny === -1 ? 't' : b.ny === 1 ? 'b' : (hitY > 0.5 ? 't' : 'b');
      const e = 1e-3, y0 = py + (half === 't' ? 0.5 : 0);
      if (this.pos.x + this.w / 2 > px + e && this.pos.x - this.w / 2 < px + 1 - e && this.pos.z + this.w / 2 > pz + e && this.pos.z - this.w / 2 < pz + 1 - e && this.pos.y < y0 + 0.5 && this.pos.y + this.h > y0) return true;
      W.setBlock(px, py, pz, ID[k + '_slab_' + half]);
      return done();
    }
    if ((hd.facePlace || hd.hopper !== undefined || hd.placesComparator) && b && hd.isBlock !== false) {
      let px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz;
      if (DEFS[b.id].replaceable) { px = b.x; py = b.y; pz = b.z; }
      const cur = W.getBlock(px, py, pz);
      if (cur && !DEFS[cur].replaceable && !DEFS[cur].liquid) return true;
      const e = 1e-3;
      if (!hd.placesComparator && this.pos.x + this.w / 2 > px + e && this.pos.x - this.w / 2 < px + 1 - e && this.pos.z + this.w / 2 > pz + e && this.pos.z - this.w / 2 < pz + 1 - e && this.pos.y < py + 1 && this.pos.y + this.h > py) return true;
      const L = this.lookDir(), look = Math.abs(L.y) > 0.75 ? (L.y > 0 ? 'u' : 'd') : Math.abs(L.x) > Math.abs(L.z) ? (L.x > 0 ? 'e' : 'w') : (L.z > 0 ? 's' : 'n');
      const toward = { e: 'w', w: 'e', u: 'd', d: 'u', s: 'n', n: 's' }[look];
      let id;
      if (hd.placesComparator) { const h = Math.abs(L.x) > Math.abs(L.z) ? (L.x > 0 ? 'e' : 'w') : (L.z > 0 ? 's' : 'n'); id = ID['comparator_' + h + '_0']; }
      else if (hd.hopper !== undefined) { const side = b.nx === 1 ? 'w' : b.nx === -1 ? 'e' : b.nz === 1 ? 'n' : b.nz === -1 ? 's' : 'd'; id = ID[side === 'd' ? 'hopper' : 'hopper_' + side]; }
      else if (hd.facePlace === 'observer') id = ID['observer_' + look + '_0'];
      else id = ID[hd.facePlace + '_' + toward];
      W.setBlock(px, py, pz, id);
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('place', null, id); this.useCd = 0.2; this.swing = 1;
      return true;
    }
    if (hd.placesRail && b) {
      let px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz;
      if (DEFS[b.id].replaceable) { px = b.x; py = b.y; pz = b.z; }
      const cur = W.getBlock(px, py, pz), under = DEFS[W.getBlock(px, py - 1, pz)];
      if (cur && !DEFS[cur].replaceable) return true;
      if (!under || !under.solid || under.rail) { G.ui.message('Rails go on top of a solid block.'); this.useCd = 0.3; return true; }
      G.placeRail(px, py, pz, hd.placesRail, this.lookDir());
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('place', null, ID.iron_block); this.useCd = 0.2; this.swing = 1;
      return true;
    }
    if (hd.cart && b && DEFS[b.id].rail) {
      const m = spawnMob(hd.cart, b.x + 0.5, b.y + 0.1, b.z + 0.5);
      const L = this.lookDir(); m.cartH = Math.abs(L.x) > Math.abs(L.z) ? [Math.sign(L.x), 0] : [0, Math.sign(L.z) || 1];
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('place', null, ID.iron_block); this.useCd = 0.3; this.swing = 1;
      return true;
    }
    if (hd.placesRepeater && b) {
      // a repeater goes on top of a solid block, pointing the way you face
      let px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz;
      if (DEFS[b.id].replaceable) { px = b.x; py = b.y; pz = b.z; }
      const cur = W.getBlock(px, py, pz), under = DEFS[W.getBlock(px, py - 1, pz)];
      if (cur && !DEFS[cur].replaceable) return true;
      if (!under || !under.solid || under.leaves) { G.ui.message('A repeater goes on top of a solid block.'); this.useCd = 0.3; return true; }
      const L = this.lookDir(), dir = Math.abs(L.x) > Math.abs(L.z) ? (L.x > 0 ? 'e' : 'w') : (L.z > 0 ? 's' : 'n');
      W.setBlock(px, py, pz, ID['repeater_' + dir + '_1_0']);
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('place'); this.useCd = 0.2; this.swing = 1;
      return true;
    }
    if (hd.placesWire && b) {
      // redstone dust goes on top of a solid block
      let px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz;
      if (DEFS[b.id].replaceable) { px = b.x; py = b.y; pz = b.z; }
      const cur = W.getBlock(px, py, pz), under = DEFS[W.getBlock(px, py - 1, pz)];
      if (cur && !DEFS[cur].replaceable) return true;
      if (!under || !under.solid || under.leaves) { G.ui.message('Redstone dust goes on top of a solid block.'); this.useCd = 0.3; return true; }
      W.setBlock(px, py, pz, ID.redstone_wire_0);
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('place'); this.useCd = 0.15; this.swing = 1;
      return true;
    }
    if ((hd.placesSwitch || hd.placesPlate) && b) {
      // levers and buttons go on the floor or on a wall; pressure plates on the floor
      if (b.ny === -1 || (hd.placesPlate && b.ny !== 1)) { G.ui.message(hd.placesPlate ? 'Put a pressure plate on top of a block.' : 'Put it on the floor or on a wall.'); this.useCd = 0.3; return true; }
      if (!DEFS[b.id].solid || DEFS[b.id].leaves) return true;
      const px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz, cur = W.getBlock(px, py, pz);
      if (cur && !DEFS[cur].replaceable && !DEFS[cur].liquid) return true;
      const d = b.ny === 1 ? 'd' : b.nz === 1 ? 'n' : b.nz === -1 ? 's' : b.nx === 1 ? 'w' : 'e';
      W.setBlock(px, py, pz, ID[hd.placesPlate ? hd.placesPlate + '_plate_0' : hd.placesSwitch + '_' + d + (hd.placesSwitch === 'redstone_torch' ? '_1' : '_0')]);
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('place'); this.useCd = 0.2; this.swing = 1;
      return true;
    }
    if (hd.placesLadder && b) {
      const pre = typeof hd.placesLadder === 'string' ? hd.placesLadder : 'ladder';
      if (!b.nx && !b.nz) { G.ui.message('Put ' + (pre === 'vine' ? 'vines' : 'a ladder') + ' on the side of a block.'); return true; }
      const px = b.x + b.nx, py = b.y, pz = b.z + b.nz, cur = W.getBlock(px, py, pz);
      if (cur && !DEFS[cur].replaceable && !DEFS[cur].liquid) return true;
      W.setBlock(px, py, pz, ID[pre + '_' + (b.nx === 1 ? 'w' : b.nx === -1 ? 'e' : b.nz === 1 ? 'n' : 's')]);
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('place'); this.useCd = 0.2; this.swing = 1;
      return true;
    }
    if (hd.id === ID.sugar_cane && b) {
      // sugar cane needs grass, dirt or sand right next to water (or more sugar cane under it)
      let px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz;
      if (DEFS[b.id].replaceable) { px = b.x; py = b.y; pz = b.z; }
      const cur = W.getBlock(px, py, pz), under = W.getBlock(px, py - 1, pz);
      if (cur && !DEFS[cur].replaceable) return true;
      const wet = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => W.getBlock(px + a, py - 1, pz + c) === ID.water);
      if (!(under === ID.sugar_cane || ([ID.grass, ID.dirt, ID.sand].includes(under) && wet))) { G.ui.message('Sugar cane grows on grass, dirt or sand right next to water.'); this.useCd = 0.3; return true; }
      W.setBlock(px, py, pz, ID.sugar_cane);
      G.plantCrop(px, py, pz);
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('place'); this.useCd = 0.2; this.swing = 1;
      return true;
    }
    if (hd.id === ID.bamboo && b) {
      // bamboo goes on grass, dirt, sand or on top of more bamboo
      let px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz;
      if (DEFS[b.id].replaceable) { px = b.x; py = b.y; pz = b.z; }
      const cur = W.getBlock(px, py, pz), under = W.getBlock(px, py - 1, pz);
      if (cur && !DEFS[cur].replaceable) return true;
      if (![ID.grass, ID.dirt, ID.sand, ID.bamboo, ID.gravel].includes(under)) { G.ui.message('Bamboo grows on grass, dirt, sand or more bamboo.'); this.useCd = 0.3; return true; }
      W.setBlock(px, py, pz, ID.bamboo);
      G.plantCrop(px, py, pz);
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('place'); this.useCd = 0.2; this.swing = 1;
      return true;
    }
    if (hd.sapling && b) {
      if ((b.id !== ID.grass && b.id !== ID.dirt) || W.getBlock(b.x, b.y + 1, b.z)) return true;
      W.setBlock(b.x, b.y + 1, b.z, hd.id);
      G.plantCrop(b.x, b.y + 1, b.z);
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('place'); this.useCd = 0.2; this.swing = 1;
      return true;
    }
    if (hd.placesStair && b) {
      let px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz;
      if (DEFS[b.id].replaceable) { px = b.x; py = b.y; pz = b.z; }
      const cur = W.getBlock(px, py, pz);
      if (cur && !DEFS[cur].replaceable && !DEFS[cur].liquid) return true;
      const L = this.lookDir(), dir = Math.abs(L.x) > Math.abs(L.z) ? (L.x > 0 ? 'e' : 'w') : (L.z > 0 ? 's' : 'n');
      const e = 1e-3;
      if (this.pos.x + this.w / 2 > px + e && this.pos.x - this.w / 2 < px + 1 - e && this.pos.z + this.w / 2 > pz + e && this.pos.z - this.w / 2 < pz + 1 - e && this.pos.y < py + 1 && this.pos.y + this.h > py) return true;
      W.setBlock(px, py, pz, ID[hd.placesStair + '_stairs_' + dir]);
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('place'); this.useCd = 0.2; this.swing = 1;
      return true;
    }
    if ((k === 'oak_door' || k === 'oak_trapdoor' || hd.placesDoor || hd.placesTrapdoor) && b) {
      const isDoor = k === 'oak_door' || !!hd.placesDoor, wp = hd.placesDoor || hd.placesTrapdoor ? (hd.placesDoor || hd.placesTrapdoor) + '_' : '';
      let px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz;
      if (DEFS[b.id].replaceable) { px = b.x; py = b.y; pz = b.z; }
      const free = (x, y, z) => { const id = W.getBlock(x, y, z); return !id || DEFS[id].replaceable; };
      const ax = Math.abs(Math.sin(this.yaw)) > Math.abs(Math.cos(this.yaw)) ? 'z' : 'x'; // a door faces you
      if (isDoor) {
        if (!free(px, py, pz) || !free(px, py + 1, pz) || !W.isSolid(px, py - 1, pz)) { G.ui.message('A door needs two blocks of space and a floor.'); return true; }
        // next to another door in the same wall: hinge on the other side, so the two open like a double door
        const nx = ax === 'x' ? px - 1 : px, nz = ax === 'z' ? pz - 1 : pz, nd = DEFS[W.getBlock(nx, py, nz)].door;
        const hinge = nd && nd.ax === ax && nd.half === 'lower' && !nd.hinge ? '_r' : '';
        W.setBlock(px, py, pz, ID[wp + 'door_' + ax + 'c' + hinge + '_lower']); W.setBlock(px, py + 1, pz, ID[wp + 'door_' + ax + 'c' + hinge + '_upper']);
      } else {
        if (!free(px, py, pz)) return true;
        W.setBlock(px, py, pz, ID[wp + 'trapdoor_' + ax + 'c']);
      }
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('place'); this.useCd = 0.25; this.swing = 1;
      return true;
    }
    if (b && DEFS[b.id].cauldron) {
      const c = DEFS[b.id].cauldron;
      if (k === 'water_bucket' && c === 'empty') { W.setBlock(b.x, b.y, b.z, ID.water_cauldron); this.swapHeld(ID.bucket); G.sound.play('place'); this.useCd = 0.4; return true; }
      if (k === 'lava_bucket' && c === 'empty') { W.setBlock(b.x, b.y, b.z, ID.lava_cauldron); this.swapHeld(ID.bucket); G.sound.play('place'); this.useCd = 0.4; return true; }
      if (k === 'bucket' && c !== 'empty') { W.setBlock(b.x, b.y, b.z, ID.cauldron); this.swapHeld(c === 'water' ? ID.water_bucket : ID.lava_bucket); G.sound.play('pickup'); this.useCd = 0.4; return true; }
      if (k === 'glass_bottle' && c === 'water') { W.setBlock(b.x, b.y, b.z, ID.cauldron); this.swapHeld(ID.water_bottle); G.sound.play('pickup'); this.useCd = 0.4; return true; }
      if (k === 'water_bottle' && c === 'empty') { W.setBlock(b.x, b.y, b.z, ID.water_cauldron); this.swapHeld(ID.glass_bottle); G.sound.play('place'); this.useCd = 0.4; return true; }
    }
    if (k === 'flint_and_steel' && b && b.id === ID.candle) { W.setBlock(b.x, b.y, b.z, ID.candle_lit); this.useCd = 0.3; this.swing = 1; return true; }
    if (k === 'bucket') {
      const o = this.eyePos(), d = this.lookDir();
      const hit = W.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 4.6, true);
      if (!hit || (hit.id !== ID.water && hit.id !== ID.lava && hit.id !== ID.powder_snow)) return false;
      W.setBlock(hit.x, hit.y, hit.z, 0);
      this.swapHeld(hit.id === ID.water ? ID.water_bucket : hit.id === ID.lava ? ID.lava_bucket : ID.powder_snow_bucket);
      G.sound.play('pickup'); this.useCd = 0.4; this.swing = 1;
      return true;
    }
    if (k === 'powder_snow_bucket') {
      if (!b) return false;
      let px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz;
      if (DEFS[b.id].replaceable) { px = b.x; py = b.y; pz = b.z; }
      const cur = W.getBlock(px, py, pz);
      if (cur && !DEFS[cur].replaceable && !DEFS[cur].liquid) return false;
      W.setBlock(px, py, pz, ID.powder_snow);
      this.swapHeld(ID.bucket);
      this.useCd = 0.4; this.swing = 1; G.sound.play('place');
      return true;
    }
    if (k === 'water_bucket' || k === 'lava_bucket' || (hd && hd.fishBucket)) {
      if (!b) return false;
      let px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz;
      if (DEFS[b.id].replaceable) { px = b.x; py = b.y; pz = b.z; }
      const cur = W.getBlock(px, py, pz);
      if (cur && !DEFS[cur].replaceable && !DEFS[cur].liquid) return false;
      this.useCd = 0.4; this.swing = 1;
      if (k === 'water_bucket' && G.dim === 'nether') {
        G.particles.burst(px + 0.5, py + 0.5, pz + 0.5, [0xdddddd, 0xffffff], 14, 1.5, 0.15, 2);
        G.ui.message('The water boils away in the heat of the Nether.', 'purple');
      } else W.setBlock(px, py, pz, k === 'lava_bucket' ? ID.lava : ID.water);
      if (hd && hd.fishBucket && G.dim !== 'nether') spawnMob(hd.fishBucket, px + 0.5, py + 0.1, pz + 0.5);
      this.swapHeld(ID.bucket);
      G.sound.play('place');
      return true;
    }
    if (k === 'milk_bucket') {
      // drinking milk: cools you down and puts out fire
      this.fire = 0; this.fireT = 0;
      if (this.mode === 'survival') this.swapHeld(ID.bucket);
      G.sound.play('eat'); G.ui.message('You drank the milk.');
      this.useCd = 0.6; this.swing = 1;
      return true;
    }
    if (hd.tool && hd.tool.type === 'hoe') {
      if (!b || (b.id !== ID.grass && b.id !== ID.dirt) || W.getBlock(b.x, b.y + 1, b.z)) return false;
      // like Minecraft: farmland needs water close by (up to 5 blocks away, at the same height or one above)
      if (!G.waterNear(b.x, b.y, b.z)) { G.ui.message('Farmland needs water within 5 blocks. Pour a water bucket nearby first.'); this.useCd = 0.4; return true; }
      W.setBlock(b.x, b.y, b.z, ID.farmland);
      G.sound.play('dig', new THREE.Vector3(b.x, b.y, b.z));
      this.useCd = 0.25; this.swing = 1;
      return true;
    }
    // a glass bottle fills from water; a water bottle turns dirt into mud
    if (k === 'glass_bottle') {
      const o = this.eyePos(), d = this.lookDir(), hit = W.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 4.6, true);
      if (!hit || hit.id !== ID.water) return false;
      this.swapHeld(ID.water_bottle); G.sound.play('pickup'); this.useCd = 0.4; this.swing = 1; return true;
    }
    if (k === 'water_bottle' && b && (b.id === ID.dirt || b.id === ID.grass)) { W.setBlock(b.x, b.y, b.z, ID.mud); this.swapHeld(ID.glass_bottle); G.sound.play('place'); this.useCd = 0.4; this.swing = 1; return true; }
    if (k === 'bone_meal' && b) { if (G.boneMeal(b.x, b.y, b.z)) { if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1); this.useCd = 0.25; this.swing = 1; return true; } return false; }
    // an axe scrapes the green off copper
    if (/_axe$/.test(k) && b && DEFS[b.id].copper > 0) { const d = DEFS[b.id]; W.setBlock(b.x, b.y, b.z, ID[['', 'exposed_', 'weathered_', 'oxidized_'][d.copper - 1] + d.copperKind]); G.particles.burst(b.x + 0.5, b.y + 0.5, b.z + 0.5, [0xffffff, 0xc8f0e0], 8, 1.5, 0.08); this.useCd = 0.3; this.swing = 1; return true; }
    // ripe sweet berries: pick them
    if (b && b.id === ID.sweet_berry_bush_ripe) { W.setBlock(b.x, b.y, b.z, ID.sweet_berry_bush); G.plantCrop(b.x, b.y, b.z); G.spawnDrop(ID.sweet_berries, 2 + (Math.random() * 2 | 0), b.x + 0.5, b.y + 0.6, b.z + 0.5); G.sound.play('pickup'); this.useCd = 0.3; this.swing = 1; return true; }
    if (hd.plants && b && (b.id === ID.grass || b.id === ID.dirt) && !W.getBlock(b.x, b.y + 1, b.z) && b.ny === 1) { W.setBlock(b.x, b.y + 1, b.z, ID[hd.plants]); G.plantCrop(b.x, b.y + 1, b.z); if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1); G.sound.play('place'); this.useCd = 0.2; this.swing = 1; return true; }
    const PLANTS = { wheat_seeds: 'wheat_sprout', carrot: 'carrot_sprout', potato: 'potato_sprout', pumpkin_seeds: 'pumpkin_stem' };
    if (PLANTS[k]) {
      if (!b || b.id !== ID.farmland || W.getBlock(b.x, b.y + 1, b.z)) return false;
      W.setBlock(b.x, b.y + 1, b.z, ID[PLANTS[k]]);
      G.plantCrop(b.x, b.y + 1, b.z);
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('place');
      this.useCd = 0.2; this.swing = 1;
      return true;
    }
    return false;
  }

  use(tgt) {
    if (this.useCd > 0 || this.mode === 'spectator') return;
    if (this.tryDeflect()) return;
    const W = G.world, held = this.heldSlot(), hd = held ? DEFS[held.id] : null;
    const b = tgt.block;
    // one tap on fire puts it out
    if (b && (b.id === ID.fire || b.id === ID.soul_fire)) { this.putOutFire(b.x, b.y, b.z); return; }
    // a bucket on a cow: milk
    if (tgt.mob && tgt.mob.type === 'mooshroom' && !tgt.mob.dead && hd && hd.key === 'bowl') { this.useCd = 0.4; this.swing = 1; this.swapHeld(ID.mushroom_stew); G.sound.play('pickup'); return; }
    if (tgt.mob && ['cod', 'salmon', 'tropical_fish', 'axolotl'].includes(tgt.mob.type) && !tgt.mob.dead && !tgt.mob.remoteCtl && hd && hd.key === 'water_bucket') {
      this.useCd = 0.4; this.swing = 1; const t = tgt.mob.type; tgt.mob.removeSilently(); this.swapHeld(ID['bucket_of_' + t]); G.sound.play('pickup');
      G.ui.message('You caught the ' + MOB_TYPES[t].name.toLowerCase() + ' in your bucket! Use the bucket to let it out again.');
      return;
    }
    if (tgt.mob && (tgt.mob.type === 'cow' || tgt.mob.type === 'goat') && !tgt.mob.dead && hd && hd.key === 'bucket') { this.useCd = 0.4; this.swing = 1; this.swapHeld(ID.milk_bucket); G.sound.play('pickup'); return; }
    if (tgt.mob && tgt.mob.interact && tgt.mob.interact(this, hd)) { this.useCd = 0.35; this.swing = 1; return; }
    // honey dripping out of a bee nest or beehive: shears for honeycomb, a glass bottle for honey
    if (b && DEFS[b.id].hive === 'full' && hd && (hd.key === 'shears' || hd.key === 'glass_bottle')) { this.useCd = 0.5; this.swing = 1; G.harvestHive(b.x, b.y, b.z, hd.key, this); return; }
    // tie the animals on your rope to a fence
    if (b && DEFS[b.id].fence) {
      const mine = G.mobs.filter(m => m.leash === 'player' && !m.remoteCtl && !m.dead && m.pos.distanceTo(this.pos) < 16);
      if (mine.length) {
        for (const m of mine) m.leash = { x: b.x, y: b.y, z: b.z };
        this.useCd = 0.4; this.swing = 1; G.sound.play('place', null, ID.oak_fence);
        G.ui.message(mine.length === 1 ? 'Tied to the fence. Tap the animal to untie it.' : mine.length + ' animals tied to the fence.', 'gold');
        return;
      }
    }
    // put a boat on the water (or the ground)
    if (hd && hd.placesBoat) {
      const o = this.eyePos(), d = this.lookDir();
      const hit = W.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 5, true);
      if (hit) {
        const top = hit.id === ID.water ? hit.y + 0.55 : hit.y + 1;
        const bt = spawnMob('boat', hit.x + 0.5, top, hit.z + 0.5);
        bt.yaw = this.yaw + Math.PI; bt.mesh.rotation.y = bt.yaw;
        if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
        this.useCd = 0.5; this.swing = 1; G.sound.play('place', null, ID.oak_planks);
        return;
      }
    }
    if (b && !this.sneaking) {
      if (DEFS[b.id].base === 'crafting_table') { G.ui.openInventory('table'); return; }
      if (b.id === ID.enchanting_table) { G.ui.openEnchant(b.x, b.y, b.z); return; }
      const bd = DEFS[b.id];
      if (bd.station) { G.ui.openInventory(bd.station); return; }
      if (bd.vault) { if (hd && hd.key === 'trial_key') { if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1); G.openVault(b.x, b.y, b.z); } else G.ui.message('This vault opens with a Trial Key. Beat a Trial Spawner to get one.'); this.useCd = 0.5; this.swing = 1; return; }
      if (bd.sus && hd && hd.key === 'brush') {
        // brushing: a few strokes and something old comes out
        const key = b.x + ',' + b.y + ',' + b.z;
        if (this.brushAt !== key) { this.brushAt = key; this.brushN = 0; }
        this.brushN++; this.useCd = 0.35; this.swing = 1;
        G.particles.blockBreak(b.x, b.y, b.z, b.id);
        if (this.brushN >= 5) {
          this.brushAt = null; G.world.setBlock(b.x, b.y, b.z, bd.sus === 'sand' ? ID.sand : ID.gravel);
          const pool = bd.sus === 'sand' ? ['sherd_archer', 'sherd_prize', 'sherd_skull', 'emerald', 'gold_ingot', 'diamond', 'sniffer_egg', 'sniffer_egg', 'tnt', 'gunpowder'] : ['sherd_heart', 'sherd_friend', 'emerald', 'wheat', 'coal', 'iron_ingot', 'sniffer_egg', 'disc_mall', 'candle'];
          G.spawnDrop(ID[pool[Math.random() * pool.length | 0]], 1, b.x + 0.5, b.y + 1.1, b.z + 0.5);
          G.sound.play('pickup');
        }
        return;
      }
      if (bd.container) { this.useCd = 0.5; this.swing = 1; G.openChest(b.x, b.y, b.z); return; }
      if (bd.machine === 'note') { this.useCd = 0.25; this.swing = 1; G.playNote(b.x, b.y, b.z, true); return; }
      if (bd.jukebox) {
        const sl = G.chestSlots(b.x, b.y, b.z, true);
        if (sl[0]) { G.spawnDrop(sl[0].id, 1, b.x + 0.5, b.y + 1.2, b.z + 0.5); sl[0] = null; G.chestChanged(chestKey(b.x, b.y, b.z)); }
        else if (hd && hd.disc) { sl[0] = { id: hd.id, count: 1 }; if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1); G.chestChanged(chestKey(b.x, b.y, b.z)); G.ui.message('Now playing: ' + hd.name.replace('Music Disc ', ''), 'gold'); }
        else G.ui.message('Put a music disc in the jukebox. Music discs are found in dungeon and mineshaft chests.');
        this.useCd = 0.4; this.swing = 1; return;
      }
      if (bd.frame) {
        const sl = G.chestSlots(b.x, b.y, b.z, true);
        if (!sl[0] && hd) { sl[0] = { id: hd.id, count: 1 }; if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1); G.chestChanged(chestKey(b.x, b.y, b.z)); G.sound.play('place'); }
        else if (sl[0] && !hd) { G.spawnDrop(sl[0].id, 1, b.x + 0.5, b.y + 0.5, b.z + 0.5); sl[0] = null; G.chestChanged(chestKey(b.x, b.y, b.z)); }
        this.useCd = 0.3; this.swing = 1; return;
      }
      if (bd.candle !== undefined && bd.candle && !hd) { G.world.setBlock(b.x, b.y, b.z, ID.candle); this.useCd = 0.3; return; }
      if (bd.anchor !== undefined) {
        if (hd && hd.key === 'glowstone' && bd.anchor < 4) { G.world.setBlock(b.x, b.y, b.z, ID['respawn_anchor_' + (bd.anchor + 1)]); if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1); G.sound.play('levelup'); this.useCd = 0.3; return; }
        if (bd.anchor > 0 && G.dim === 'nether') { G.anchor = { x: b.x, y: b.y, z: b.z }; G.ui.message('Respawn point set! You will come back here in the Nether (it uses one charge each time).', 'gold'); this.useCd = 0.5; return; }
        if (bd.anchor > 0) { G.world.setBlock(b.x, b.y, b.z, 0); G.explode(b.x + 0.5, b.y + 0.5, b.z + 0.5, 5, true, true, null, 'A respawn anchor blew up! They only work in the Nether.'); return; }
        G.ui.message('Charge the respawn anchor with glowstone, in the Nether.'); this.useCd = 0.3; return;
      }
      if (b.id === ID.anvil) { G.ui.openAnvil(b.x, b.y, b.z); return; }
      if (b.id === ID.grindstone) { G.ui.openGrindstone(); return; }
      if (b.id === ID.smithing_table) { G.ui.openSmithing(); return; }
      if (b.id === ID.bed || b.id === ID.bed_head || DEFS[b.id].bedPart) { this.useCd = 1; G.sleep(b); return; }
      if (b.id === ID.chest_loot || b.id === ID.chest) { this.useCd = 0.5; this.swing = 1; G.openChest(b.x, b.y, b.z); return; }
      if (DEFS[b.id].shulker) { this.useCd = 0.5; this.swing = 1; G.openShulker(b.x, b.y, b.z); return; }
      if (b.id === ID.ender_chest) { this.useCd = 0.5; this.swing = 1; G.openEnderChest(b.x, b.y, b.z); return; }
      if (DEFS[b.id].base === 'furnace') { this.useCd = 0.4; G.openFurnace(b.x, b.y, b.z); return; }
      if (DEFS[b.id].beacon) { this.useCd = 0.4; G.ui.openBeacon(b.x, b.y, b.z); return; }
      if (DEFS[b.id].lever || DEFS[b.id].button || DEFS[b.id].repeater) { this.useCd = 0.3; this.swing = 1; G.useSwitch(b.x, b.y, b.z); return; }
      if (DEFS[b.id].door && DEFS[b.id].door.wood === 'iron') { this.useCd = 0.4; G.ui.message('An iron door only opens with a button, a lever or a pressure plate.'); return; }
      if (DEFS[b.id].door || DEFS[b.id].trapdoor || DEFS[b.id].gate) { this.useCd = 0.3; this.swing = 1; G.toggleDoor(b.x, b.y, b.z); return; }
      if (DEFS[b.id].sign) { this.useCd = 0.3; G.ui.editSign(b.x, b.y, b.z); return; }
      if (b.id === ID.end_portal_frame && hd && hd.key === 'eye_of_ender') {
        this.useCd = 0.4; this.swing = 1;
        if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
        G.fillEndFrame(b.x, b.y, b.z); return;
      }
      if (b.id === ID.tnt && hd && hd.key === 'flint_and_steel') {
        W.setBlock(b.x, b.y, b.z, 0); G.primeTNT(b.x, b.y, b.z, 4); this.useCd = 0.3; this.swing = 1; return;
      }
      if (b.id === ID.dragon_egg) {
        this.useCd = 1;
        if (G.dim !== 'end') G.ui.message('Dragons can only be summoned in the End.', 'purple');
        else if (!G.dragons.some(d => !d.done)) { W.setBlock(b.x, b.y, b.z, 0); G.summonDragon(); }
        else G.ui.message('A dragon is already in the sky.', 'purple');
        return;
      }
      if (hd && hd.key === 'flint_and_steel') {
        this.useCd = 0.3; this.swing = 1;
        if (W.lightPortal(b.x + b.nx, b.y + b.ny, b.z + b.nz)) {
          G.sound.play('teleport');
          G.ui.message('The portal is open! Stand inside it to travel.', 'purple');
        } else if (b.id === ID.obsidian) G.ui.message('A portal needs a full obsidian frame: 4 wide and 5 tall, with an empty 2 by 3 middle.');
        else G.lightFire(b);
        return;
      }
    }
    if (b && b.id === ID.sweet_berry_bush_ripe && !hd) { G.world.setBlock(b.x, b.y, b.z, ID.sweet_berry_bush); G.plantCrop(b.x, b.y, b.z); G.spawnDrop(ID.sweet_berries, 2 + (Math.random() * 2 | 0), b.x + 0.5, b.y + 0.6, b.z + 0.5); G.sound.play('pickup'); this.useCd = 0.3; this.swing = 1; return; }
    if (hd && this.useBucketOrHoe(hd, b)) return;
    if (!hd) return;
    if (hd.armor) {
      const slot = 36 + hd.armor.slot, old = this.inv.slots[slot];
      this.inv.slots[slot] = { id: held.id, count: 1 };
      this.inv.slots[this.sel] = old;
      this.inv.changed();
      G.sound.play('craft');
      this.useCd = 0.4;
      return;
    }
    if (hd.food) {
      const canEat = this.mode === 'creative' || this.hunger < 20 || hd.heal;
      if (!canEat) return;
      this.hunger = Math.min(20, this.hunger + hd.food);
      this.saturation = Math.min(this.hunger, (this.saturation || 0) + hd.food * 1.2);
      if (hd.heal) this.health = Math.min(20, this.health + hd.heal);
      if (hd.key === 'rotten_flesh' && Math.random() < 0.5) this.hungerDrain(2);
      if (hd.chorus) G.chorusTeleport();
      if (hd.notch) { this.addEffect('regeneration', 2, 20); this.addEffect('resistance', 1, 300); this.addEffect('fire_resistance', 1, 300); this.addEffect('absorption', 2, 120); G.ui.message('You feel super strong!', 'gold'); }
      if (this.mode === 'survival') { this.inv.takeFrom(this.sel, 1); if (hd.leaves) this.inv.add(ID[hd.leaves], 1); }
      G.sound.play('eat');
      this.useCd = 0.5; this.swing = 1;
      return;
    }
    if (hd.key === 'eye_of_ender') {
      this.useCd = 0.8; this.swing = 1;
      if (G.throwEye() && this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      return;
    }
    if (hd.key === 'fishing_rod') { this.useCd = 0.4; this.swing = 1; G.fishRod(); return; }
    if (hd.key === 'bow') {
      if (this.mode === 'survival') {
        if (!this.inv.count(ID.arrow)) { G.ui.message('You need arrows to shoot the bow.'); this.useCd = 0.5; return; }
        if (!enchLv(this.heldSlot(), 'infinity')) this.inv.remove(ID.arrow, 1);
      }
      const o = this.eyePos(), d = this.lookDir();
      G.spawnProjectile('arrow', o.addScaledVector(d, 0.5), d.multiplyScalar(38), this);
      { const pr = G.projectiles[G.projectiles.length - 1], bs = this.heldSlot(); if (pr) { pr.power = enchLv(bs, 'power'); pr.flame = enchLv(bs, 'flame'); } }
      G.sound.play('bow');
      this.useCd = 0.45; this.swing = 1;
      return;
    }
    if (hd.egg) {
      // a spawn egg: on a spawner it changes what comes out; anywhere else the mob appears
      if (b && b.id === ID.spawner) { const sl = G.chestSlots(b.x, b.y, b.z, true); sl[0] = { id: hd.id, count: 1 }; G.chestChanged(chestKey(b.x, b.y, b.z)); G.ui.message('This spawner now makes ' + MOB_TYPES[hd.egg].name + 's.', 'gold'); }
      else if (b) { const px = b.x + b.nx + 0.5, py = b.y + b.ny, pz = b.z + b.nz + 0.5; if (MOB_TYPES[hd.egg]) spawnMob(hd.egg, px, py + (b.ny < 0 ? -1 : 0), pz); }
      else return;
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      this.useCd = 0.3; this.swing = 1; G.sound.play('place');
      return;
    }
    if (hd.potion) {
      G.applyPotion(this, hd.potion, 1);
      if (this.mode === 'survival') { this.inv.takeFrom(this.sel, 1); this.inv.add(ID.glass_bottle, 1); }
      G.sound.play('eat'); this.useCd = 0.6; this.swing = 1;
      return;
    }
    if (hd.splash) {
      const o = this.eyePos(), d = this.lookDir();
      G.spawnProjectile('potion', o.addScaledVector(d, 0.5), d.multiplyScalar(15), this);
      G.projectiles[G.projectiles.length - 1].potion = hd.splash;
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      this.useCd = 0.5; this.swing = 1; G.sound.play('bow');
      return;
    }
    if (hd.key === 'spyglass') { G.zoom = !G.zoom; this.useCd = 0.3; return; }
    if (hd.firework) {
      if (this.gliding) this.boostT = 1.6; else G.launchFirework(this.pos.x, this.pos.y + 1, this.pos.z);
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('bow'); this.useCd = 0.4; this.swing = 1;
      return;
    }
    if (hd.key === 'snowball' || hd.key === 'wind_charge') {
      const o = this.eyePos(), d = this.lookDir();
      G.spawnProjectile(hd.key, o.addScaledVector(d, 0.5), d.multiplyScalar(hd.key === 'snowball' ? 24 : 20), this);
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      this.useCd = 0.35; this.swing = 1; G.sound.play('bow');
      return;
    }
    if (hd.key === 'ender_pearl') {
      const o = this.eyePos(), d = this.lookDir();
      G.spawnProjectile('ender_pearl', o.addScaledVector(d, 0.5), d.multiplyScalar(26), this);
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      this.useCd = 0.5; this.swing = 1;
      return;
    }
    if (!hd.isBlock || !b) return;
    if (this.adventure) { G.ui.message('Adventure mode: you can use things, but not place or break blocks.'); this.useCd = 0.5; return; }
    let px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz;
    if (DEFS[b.id].replaceable) { px = b.x; py = b.y; pz = b.z; }
    if (py >= WH) { G.ui.message('Height limit for building is ' + WH + ' blocks. You can\'t build any higher!'); this.useCd = 0.5; return; }
    if (py < 0) return;
    const cur = W.getBlock(px, py, pz);
    if (cur && !DEFS[cur].liquid && !DEFS[cur].replaceable) return;
    if (hd.cross) {
      const below = W.getBlock(px, py - 1, pz);
      if (!below || !DEFS[below].solid) return;
    }
    if (hd.solid) {
      const hitsBody = (e) => e.pos.x + e.w / 2 > px && e.pos.x - e.w / 2 < px + 1 && e.pos.z + e.w / 2 > pz && e.pos.z - e.w / 2 < pz + 1 && e.pos.y + e.h > py && e.pos.y < py + 1;
      if (hitsBody(this)) return;
      if (G.mobs.some(m => !m.dead && hitsBody(m))) return;
    }
    // a bed takes two blocks: the foot where you tap and the head in the direction you face
    let bedHead = null;
    if (hd.id === ID.bed) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const dx = Math.abs(fx) > Math.abs(fz) ? Math.sign(fx) : 0, dz = dx ? 0 : Math.sign(fz);
      bedHead = [px + dx, py, pz + dz];
      const there = W.getBlock(...bedHead), under = W.getBlock(bedHead[0], py - 1, bedHead[2]);
      if ((there && !DEFS[there].replaceable) || !under || !DEFS[under].solid) { G.ui.message('Not enough room for the bed here. It needs two blocks of flat floor.'); return; }
    }
    if (bedHead) {
      // a bed that remembers which way it faces (from the foot towards the head)
      const d = bedHead[0] > px ? 'e' : bedHead[0] < px ? 'w' : bedHead[2] > pz ? 's' : 'n';
      W.setBlock(px, py, pz, ID['bed_foot_' + d]);
      W.setBlock(bedHead[0], bedHead[1], bedHead[2], ID['bed_head_' + d]);
    } else if (hd.shulker) {
      // a shulker box keeps what was inside it
      W.setBlock(px, py, pz, hd.id);
      G.placeShulker(px, py, pz, this.heldSlot());
    } else if (hd.base && hd.facing) {
      // furnaces, crafting tables, jack o'lanterns...: the front faces you
      const L = this.lookDir(), f = Math.abs(L.x) > Math.abs(L.z) ? (L.x > 0 ? 'w' : 'e') : (L.z > 0 ? 'n' : 's');
      W.setBlock(px, py, pz, f === 's' ? ID[hd.base] : ID[hd.base + '_' + f]);
    } else W.setBlock(px, py, pz, hd.id);
    if (hd.id === ID.sniffer_egg) G.crops[chestKey(px, py, pz)] = 300;
    if (hd.sponge) { let n = 0; for (let a = -5; a <= 5; a++) for (let c = -5; c <= 5; c++) for (let e = -5; e <= 5; e++) { const q = W.getBlock(px + a, py + c, pz + e); if ((q === ID.water || (q && DEFS[q].wlog)) && Math.abs(a) + Math.abs(c) + Math.abs(e) <= 7) { W.setBlock(px + a, py + c, pz + e, 0); n++; } } if (n) { W.setBlock(px, py, pz, ID.wet_sponge); G.particles.burst(px + 0.5, py + 0.5, pz + 0.5, [0x3a6ad8, 0xffffff], 14, 2, 0.1); } }
    if (hd.id === ID.flag) G.placedFlag(px, py, pz);
    W.settle(px, py, pz);
    if (hd.base === 'pumpkin') G.tryBuildGolem(px, py, pz);
    if (hd.id === ID.wither_skull) G.tryBuildWither(px, py, pz);
    G.sound.play('place', null, hd.id);
    if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
    this.useCd = 0.22; this.swing = 1;
  }

  pickBlock(tgt) {
    if (!tgt.block) return;
    let id = tgt.block.id;
    for (let i = 0; i < 9; i++) { const s = this.inv.slots[i]; if (s && s.id === id) { this.sel = i; G.ui.selectionChanged(); return; } }
    if (this.mode === 'creative') { this.inv.slots[this.sel] = { id, count: DEFS[id].stack }; this.inv.changed(); G.ui.selectionChanged(); }
  }

  dropHeld(all) {
    const s = this.heldSlot();
    if (!s) return;
    const n = all ? s.count : 1;
    const o = this.eyePos(), d = this.lookDir();
    const drop = G.spawnDrop(s.id, n, o.x + d.x * 0.6, o.y - 0.3, o.z + d.z * 0.6, d.clone().multiplyScalar(6).setY(d.y * 6 + 2), slotExtras(s));
    drop.pickDelay = 1.5;
    this.inv.takeFrom(this.sel, n);
  }
}
