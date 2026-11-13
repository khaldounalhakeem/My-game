'use strict';
/* Player state, inventory, movement physics and block/mob interaction. */

class Inventory {
  constructor() { this.slots = new Array(40).fill(null); this.version = 0; } // 0-8 hotbar, 9-35 backpack, 36-39 armor
  changed() { this.version++; }
  add(id, count) {
    const max = DEFS[id].stack || 64;
    for (let i = 0; i < 36 && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < max) { const n = Math.min(max - s.count, count); s.count += n; count -= n; }
    }
    for (let i = 0; i < 36 && count > 0; i++) {
      if (!this.slots[i]) { const n = Math.min(max, count); this.slots[i] = { id, count: n }; count -= n; }
    }
    this.changed();
    return count;
  }
  count(id) { let n = 0; for (let i = 0; i < 36; i++) { const s = this.slots[i]; if (s && s.id === id) n += s.count; } return n; }
  armorPoints() { let n = 0; for (let i = 36; i < 40; i++) { const s = this.slots[i]; if (s && DEFS[s.id].armor) n += DEFS[s.id].armor.points; } return n; }
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
  toJSON() { return this.slots.map(s => (s ? [s.id, s.count] : 0)); }
  load(arr) { this.slots = arr.map(a => (a && DEFS[a[0]] ? { id: a[0], count: a[1] } : null)); while (this.slots.length < 40) this.slots.push(null); this.changed(); }
}

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
  heldDef() { const s = this.heldSlot(); return s ? DEFS[s.id] : null; }
  eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eye - (this.sneaking ? 0.15 : 0), this.pos.z); }
  lookDir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  hurt(amount, from, kb = 6, force = false, cause = '') {
    if (this.dead || this.mode === 'creative') return;
    if (this.hurtCd > 0 && !force) return;
    if (this.sleeping) G.wake('You were woken up!');
    // armor softens every kind of hurt except falling, drowning, starving and the void (4% per armor point, like Minecraft)
    const bypass = !from && /fell from|fell out|drown|starv|void|pearl/i.test(cause || '');
    if (!bypass) amount = Math.max(1, Math.round(amount * (1 - Math.min(0.8, this.inv.armorPoints() * 0.04))));
    this.deathCause = cause || (from ? 'You were defeated by a monster or an explosion.' : 'You died.');
    if (from && G.lastAttacker && !G.lastAttacker.dead) for (const m of G.mobs) if (m.tame && m.type === 'wolf') m.petTarget = G.lastAttacker;
    G.lastAttacker = null;
    this.health -= amount; this.hurtCd = 0.5;
    G.ui.damagePopup(amount, this.deathCause);
    G.ui.hurtFlash();
    G.sound.play('hurt');
    if (from && kb) {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z, l = Math.hypot(dx, dz) || 1;
      this.vel.x += dx / l * kb; this.vel.z += dz / l * kb; this.vel.y = Math.max(this.vel.y, 5);
    }
    if (this.health <= 0) this.die();
  }

  die() {
    if (this.riding) this.dismount();
    this.health = 0; this.dead = true;
    for (let i = 0; i < 40; i++) {
      const s = this.inv.slots[i];
      if (s) G.spawnDrop(s.id, s.count, this.pos.x, this.pos.y + 1, this.pos.z, new THREE.Vector3((Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6));
    }
    this.inv.slots.fill(null); this.inv.changed();
    this.xp = 0; this.level = 0;
    G.ui.showDeath();
  }

  respawn() {
    this.reset();
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
    const creative = this.mode === 'creative';
    if (!creative) this.flying = false;
    if (this.riding) {
      const h = this.riding;
      if (h.dead || h.removed || input.sneak) { this.dismount(); return; }
      // steer the horse with the same controls as walking
      let mx = input.moveX, mz = input.moveZ;
      const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      const wx = -s * mz + c * mx, wz = -c * mz - s * mx;
      h.drive = { x: wx, z: wz, jump: input.jump, yaw: Math.atan2(-s, -c) };
      this.pos.set(h.pos.x, h.pos.y + 0.95, h.pos.z);
      this.vel.set(0, 0, 0); this.onGround = true; this.fallStart = null; this.flying = false;
      this.headInWater = false; this.inWater = false; this.inLava = false;
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
    } else {
      this.vel.y -= 28 * dt;
      if (this.vel.y < -55) this.vel.y = -55;
      if (input.jump && this.onGround) { this.vel.y = 8.7; this.hungerDrain(this.sprinting ? 0.05 : 0.0125); }
    }
    const wasGround = this.onGround;
    // sneaking keeps you from walking off edges
    if (this.sneaking && this.onGround) {
      const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
      if (!W.collides(nx, this.pos.y - 0.6, this.pos.z, this.w, 0.55)) this.vel.x = 0;
      if (!W.collides(this.pos.x, this.pos.y - 0.6, nz, this.w, 0.55)) this.vel.z = 0;
    }
    W.moveBody(this, dt);
    if (this.flying && this.onGround && !input.jump) this.flying = false;

    // fall damage
    if (swimming || this.flying || creative) this.fallStart = null;
    else if (!this.onGround) this.fallStart = this.fallStart === null ? this.pos.y : Math.max(this.fallStart, this.pos.y);
    if (this.onGround && !wasGround && this.fallStart !== null) {
      const d = this.fallStart - this.pos.y;
      if (d > 3.4) this.hurt(Math.floor(d - 3), null, 0, true, 'You fell from too high.');
      if (d > 1) G.sound.play('land');
      this.fallStart = null;
    }
    if (this.onGround) this.fallStart = null;
    if (this.pos.y < -30) { this.hurt(20, null, 0, true, 'You fell out of the world into the void.'); }

    if (!creative) this.survivalTick(dt, swimming);

    // footsteps
    if (this.onGround && Math.hypot(this.vel.x, this.vel.z) > 1) {
      this.stepT = (this.stepT || 0) - dt * Math.hypot(this.vel.x, this.vel.z);
      if (this.stepT <= 0) { this.stepT = 2.2; G.sound.play('step'); }
    }
  }

  mount(h) {
    this.riding = h; h.rider = this;
    this.flying = false;
    G.ui.message('Riding! Steer like walking, jump to leap, and press sneak (C, the down button, or R3) to get off.', 'gold');
  }

  dismount() {
    const h = this.riding;
    this.riding = null;
    if (h) { h.rider = null; h.drive = null; this.pos.set(h.pos.x + 1.2, h.pos.y + 0.2, h.pos.z); }
    this.vel.set(0, 4, 0);
  }

  /* like Minecraft: food also fills a hidden 'saturation' store that gets used up before the hunger bar */
  hungerDrain(n) {
    if (this.mode !== 'survival') return;
    const fromSat = Math.min(this.saturation || 0, n);
    this.saturation = (this.saturation || 0) - fromSat;
    this.hunger = Math.max(0, this.hunger - (n - fromSat));
  }

  survivalTick(dt, swimming) {
    const W = G.world;
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.5;
    this.hungerDrain(dt * (this.sprinting ? 1 / 45 : moving ? 1 / 300 : 1 / 600));
    if (this.hunger >= 17 && this.health < 20) {
      this.regenT += dt;
      if (this.regenT > 2.5) { this.regenT = 0; this.health = Math.min(20, this.health + 1); this.hungerDrain(0.25); }
    } else this.regenT = 0;
    if (this.hunger <= 0) {
      this.starveT += dt;
      if (this.starveT > 4) { this.starveT = 0; if (this.health > 2) this.hurt(1, null, 0, true, 'You starved. Eat food when your hunger bar gets low.'); }
    }
    if (this.headInWater) {
      this.air -= dt;
      if (this.air < 5 && !this.airWarned) { this.airWarned = true; G.ui.message('You are running out of air! Swim up to the surface!', 'purple'); }
      if (this.air < 0) {
        this.drownT += dt;
        if (this.drownT > 1) { this.drownT = 0; this.hurt(2, null, 0, true, 'You drowned. Under water, watch the bubbles above your hearts and swim up before they run out.'); }
      }
    } else { this.air = Math.min(15, this.air + dt * 5); if (this.air > 8) this.airWarned = false; }
    if (this.inLava) {
      this.fire = 6;
      this.lavaT -= dt;
      if (this.lavaT <= 0) { this.lavaT = 0.5; this.hurt(4, null, 0, true, 'You fell into lava.'); }
    }
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
    const speed = def.tool && tool && tool.type === def.tool ? tool.speed : 1;
    return def.hardness * (canHarvest ? 1.5 : 5) / speed;
  }

  canHarvest(def) {
    if (!def.tool || !def.tier) return true;
    const held = this.heldDef(), tool = held && held.tool;
    return !!(tool && tool.type === def.tool && tool.tier >= def.tier);
  }

  attack(target) {
    if (this.attackCd > 0) return;
    const held = this.heldDef();
    let dmg = held && held.damage ? held.damage : 1;
    const crit = !this.onGround && this.vel.y < -1 && !this.flying;
    if (crit) dmg = Math.round(dmg * 1.5);
    this.attackCd = 0.45; this.swing = 1;
    if (target instanceof Mob && !target.tame) for (const m of G.mobs) if (m.tame && m.type === 'wolf' && m !== target) m.petTarget = target;
    if (target.remote) Net.hit(target.remote, dmg, this.sprinting ? 10 : 6);
    else if (target instanceof Dragon) target.hurt(dmg);
    else target.hurt(dmg, this.pos, this.sprinting ? 10 : 6, true);
    if (crit) G.particles.burst(target.pos.x, target.pos.y + 1, target.pos.z, [0xffffff, 0xdddddd], 8, 3, 0.1);
    this.hungerDrain(0.025);
  }

  breakBlock(x, y, z, id) {
    const def = DEFS[id], W = G.world;
    W.setBlock(x, y, z, 0);
    G.particles.blockBreak(x, y, z, id);
    G.sound.play('break', null, id);
    if (this.mode === 'survival') {
      if (this.canHarvest(def)) {
        for (const [did, n] of getDrops(def, Math.random)) G.spawnDrop(did, n, x + 0.5, y + 0.3, z + 0.5);
        if (def.xp && def.drop !== undefined) this.addXp(def.xp);
      }
      this.hungerDrain(0.005);
      if (id === ID.dragon_egg && Math.random() < 0.5) G.ui.message('The egg feels warm...', 'purple');
    }
    // plants and cactus above lose their support
    const above = W.getBlock(x, y + 1, z);
    if (above && (DEFS[above].cross || above === ID.cactus)) this.breakBlock(x, y + 1, z, above);
    if (id === ID.chest_loot || id === ID.chest) G.breakChest(x, y, z, id === ID.chest_loot);
    if (id === ID.furnace) G.breakFurnace(x, y, z);
    if (id === ID.bed || id === ID.bed_head) {
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
  primary(dt, pressed, tgt) {
    const creative = this.mode === 'creative';
    if (tgt.mob) {
      this.breaking = null;
      if (pressed || this.attackCd <= 0) this.attack(tgt.mob);
      return;
    }
    const b = tgt.block;
    if (!b) { this.breaking = null; if (pressed) this.swing = 1; return; }
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
  use(tgt) {
    if (this.useCd > 0) return;
    const W = G.world, held = this.heldSlot(), hd = held ? DEFS[held.id] : null;
    const b = tgt.block;
    if (tgt.mob && tgt.mob.interact && tgt.mob.interact(this, hd)) { this.useCd = 0.35; this.swing = 1; return; }
    if (b && !this.sneaking) {
      if (b.id === ID.crafting_table) { G.ui.openInventory('table'); return; }
      if (b.id === ID.bed || b.id === ID.bed_head) { this.useCd = 1; G.sleep(b); return; }
      if (b.id === ID.chest_loot || b.id === ID.chest) { this.useCd = 0.5; this.swing = 1; G.openChest(b.x, b.y, b.z); return; }
      if (b.id === ID.furnace) { this.useCd = 0.4; G.openFurnace(b.x, b.y, b.z); return; }
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
        if (G.dim !== 'nether') G.ui.message('Dragons can only be summoned in the Nether.', 'purple');
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
        return;
      }
    }
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
      if (this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      G.sound.play('eat');
      this.useCd = 0.5; this.swing = 1;
      return;
    }
    if (hd.key === 'eye_of_ender') {
      this.useCd = 0.8; this.swing = 1;
      if (G.throwEye() && this.mode === 'survival') this.inv.takeFrom(this.sel, 1);
      return;
    }
    if (hd.key === 'bow') {
      if (this.mode === 'survival') {
        if (!this.inv.count(ID.arrow)) { G.ui.message('You need arrows to shoot the bow.'); this.useCd = 0.5; return; }
        this.inv.remove(ID.arrow, 1);
      }
      const o = this.eyePos(), d = this.lookDir();
      G.spawnProjectile('arrow', o.addScaledVector(d, 0.5), d.multiplyScalar(38), this);
      G.sound.play('bow');
      this.useCd = 0.45; this.swing = 1;
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
    let px = b.x + b.nx, py = b.y + b.ny, pz = b.z + b.nz;
    if (DEFS[b.id].replaceable) { px = b.x; py = b.y; pz = b.z; }
    if (py < 0 || py >= WH) return;
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
    W.setBlock(px, py, pz, hd.id);
    if (bedHead) W.setBlock(bedHead[0], bedHead[1], bedHead[2], ID.bed_head);
    W.settle(px, py, pz);
    if (hd.id === ID.pumpkin) G.tryBuildGolem(px, py, pz);
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
    const drop = G.spawnDrop(s.id, n, o.x + d.x * 0.6, o.y - 0.3, o.z + d.z * 0.6, d.clone().multiplyScalar(6).setY(d.y * 6 + 2));
    drop.pickDelay = 1.5;
    this.inv.takeFrom(this.sel, n);
  }
}
