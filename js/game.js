'use strict';
const Game = {
  player: null, npcs: [], ground: [], players: [], projectiles: [], floaters: [], shops: {}, activeShop: 'general',
  itemSpawns: [], selectedSlot: -1, selectedSpell: null, netMode: false, run: false,
  lastTick: 0, _last: 0, _ticks: 0, destMark: null,
  bankQty: 1, bankXVal: 10, bankActiveTab: 'all', bankNote: false, // bank UI: amount, active tab, withdraw-as-note
  bankResolveQty(max) { const q = this.bankQty; if (q === 'all') return max; if (q === 'x') return Math.min(this.bankXVal || 0, max); return Math.min(q, max); },
  bankDepositTab() { return typeof this.bankActiveTab === 'number' ? this.bankActiveTab : 1; },

  msg(t, c) { UI.addMessage(t, c); },
  level(s) { return levelForXp(this.player.xp[s] || 0); },
  effLevel(s) {
    let lvl = this.level(s);
    for (const pr of PRAYERS)
      if (this.player.prayersOn[pr.id] && pr.boost === s) lvl += Math.max(1, Math.floor(lvl * pr.pct / 100));
    // a potion boost sits on top, and decays on its own timer (see tickPotions)
    const b = (this.player.boosts || {})[s];
    if (b && b.until > (this._now || 0)) lvl += b.amt;
    return lvl;
  },
  // Potion boosts are flat + percentage, taken from your BASE level so drinking twice
  // does not stack into nonsense, and they tick away rather than lasting forever.
  drinkPotion(i) {
    const P = this.player, it = P.inv[i], def = ITEMS[it.id];
    if (def.prayRestore) {
      const max = this.level('prayer');
      if (P.curPrayer >= max) { this.msg('Your prayer is already full.', 'm-game'); return; }
      P.curPrayer = Math.min(max, P.curPrayer + def.prayRestore);
      this.msg('You drink the ' + def.name.toLowerCase() + '. Your prayer is restored.', 'm-game');
    } else if (def.restore) {
      let fixed = 0;
      for (const sk of ['attack', 'strength', 'defense', 'ranged', 'magic'])
        if (P.sap && P.sap[sk]) { delete P.sap[sk]; fixed++; }
      this.msg(fixed ? 'The potion puts your strength back where it belongs.' : 'You feel no different.', 'm-game');
    } else if (def.cure) {
      P.poison = 0;
      this.msg('You drink the antipoison. The sickness passes.', 'm-game');
    } else if (def.boost) {
      const base = this.level(def.boost);
      const amt = Math.floor(base * def.pct / 100) + def.flat;
      P.boosts = P.boosts || {};
      P.boosts[def.boost] = { amt, until: (this._now || 0) + 180000 };
      this.msg('You drink the ' + def.name.toLowerCase() + '. Your ' + SKILL_NAME[def.boost] + ' rises by ' + amt + '.', 'm-lvl');
    }
    // a dose comes off; an empty vial is worth keeping
    const doses = (it.dose === undefined ? def.doses : it.dose) - 1;
    if (doses > 0) it.dose = doses;
    else { P.inv[i] = null; this.addItem('vial', 1); }
    Sound.play('eat');
    UI.renderInventory(); UI.renderStats();
  },
  // is a protection prayer for this attack style currently up?
  protectedFrom(style) {
    for (const pr of PRAYERS)
      if (pr.protect === style && this.player.prayersOn[pr.id]) return true;
    return false;
  },
  combatLevel() {
    return Math.max(3, Math.floor((this.level('attack') + this.level('strength') + this.level('defense') + this.level('hits')) / 4));
  },
  npcCombatLevel(n) {
    const d = NPC_DEFS[n.type];
    return Math.max(1, Math.floor((d.att + d.str + d.def + d.hits) / 4));
  },
  // a monster's live combat stat, after any curse spell has sapped it. Curses stack
  // to a floor of -15%, and wear off when the monster respawns.
  npcStat(n, key) {
    const base = NPC_DEFS[n.type][key] || 0;
    const s = n.sap && n.sap[key];
    if (!s) return base;
    // always take at least a whole point off, or a 5% curse rounds away to nothing
    // on the small stats every early monster has and the spell looks broken
    return Math.max(1, base - Math.max(1, Math.round(base * s)));
  },
  // RS-style threat colour: red when the monster far outlevels you → green when it's far below
  combatColor(mobLevel) {
    const t = Math.max(-20, Math.min(20, this.combatLevel() - mobLevel));
    return 'hsl(' + Math.round((t + 20) / 40 * 120) + ',85%,55%)'; // 0=red, 60=yellow, 120=green
  },

  init() {
    this.player = this.load() || this.newPlayer();
    this.autoRetaliate = localStorage.getItem('rc_autoret') !== '0'; // on by default
    // RS2-style fixed 30-slot inventory: items keep their slot, removals leave a gap
    this.player.inv = this.normInv(this.player.inv);
    // safety: if a loaded save sits on a tile the town redesign turned into a wall, return to spawn
    const P = this.player;
    if (World.blocked(P.layer, Math.floor(P.x), Math.floor(P.z))) {
      P.x = World.SPAWN.x + 0.5; P.z = World.SPAWN.z + 0.5; P.layer = 0; P.path = [];
    }
    this.shops = {};
    for (const [id, def] of Object.entries(SHOP_DEFS))
      this.shops[id] = def.stock.map(([iid, qty, price]) => ({ id: iid, qty, initial: qty, price }));
    this.itemSpawns = [{ id: 'ancient_relic', layer: 1, x: 74, z: 60, respawnAt: 0 }];
    if (this.player.quests.souls >= 5) this.openFontGate();   // the peal was already rung
    this.spawnNpcs();
    this.initEvents();
  },

  // the worn-equipment slot map, in the order the Worn tab lays them out
  WORN_SLOTS: ['head', 'amulet', 'cape', 'body', 'legs', 'weapon', 'shield'],
  emptyWorn() { const w = {}; for (const s of this.WORN_SLOTS) w[s] = null; return w; },
  emptyQuests() { return { lunch: 0, rats: 0, relic: 0, dwarf: 0, furs: 0, cooksfeast: 0, losttribe: 0, giants: 0, apprentice: 0, combattut: 0, magnetism: 0, souls: 0, runemyst: 0, druidic: 0 }; },

  newPlayer() {
    return {
      x: World.SPAWN.x + 0.5, z: World.SPAWN.z + 0.5, layer: 0,
      path: [], action: null, moving: false,
      xp: { hits: 1154 }, curHits: 10, curPrayer: 1, prayersOn: {},
      inv: [{ id: 'bronze_axe', qty: 1 }, { id: 'bronze_pickaxe', qty: 1 }, { id: 'tinderbox', qty: 1 }, { id: 'net', qty: 1 }],
      worn: this.emptyWorn(),
      bank: [], quests: this.emptyQuests(), ratKills: 0, firesLit: 0, penRangedKills: 0, penMagicKills: 0,
      ward: [false, false, false, false, false], // Animal Magnetism: the five standing stones' polarity
      prayCounter: 0,                            // OSRS-style prayer drain accumulator
      peal: [], clues: {}, tokensOwed: 0, worships: 0,  // The Weight of Souls: bells, clues, Font takings
      patches: {},                               // Farming: per-allotment state, keyed by tile
      style: 0, splat: null, showHpUntil: 0, autocast: null
    };
  },

  spawnNpcs() {
    this.npcs = [];
    this.addNpc('guide', 66, 62, 0);
    this.addNpc('banker', 64, 48, 0);
    this.addNpc('shopkeeper', 76, 64, 0);
    this.addNpc('priest', 56, 74, 0);
    this.addNpc('doric', 40, 32, 0);
    // Aldervale (north town)
    this.addNpc('banker', 56, 15, 0);
    this.addNpc('weaponsmith', 74, 16, 0);
    this.addNpc('bartender', 74, 27, 0);
    for (const [x, z] of [[58, 21], [70, 21], [64, 26]]) this.addNpc('guard', x, z, 0);
    for (const [x, z] of [[60, 20], [66, 22], [58, 18]]) this.addNpc('townsman', x, z, 0);
    for (const [x, z] of [[68, 18], [62, 23], [66, 20]]) this.addNpc('townswoman', x, z, 0);
    for (const [x, z] of [[58, 84], [62, 86], [66, 84], [70, 86], [63, 89]]) this.addNpc('rat', x, z, 0);
    for (const [x, z] of [[78, 56], [82, 66], [76, 74], [84, 76], [80, 84]]) this.addNpc('goblin', x, z, 0);
    for (const [x, z] of [[36, 70], [30, 78], [40, 86], [26, 62]]) this.addNpc('bear', x, z, 0);
    for (const [x, z] of [[46, 62], [52, 64], [56, 60], [48, 68]]) this.addNpc('skeleton', x, z, 1);
    for (const [x, z] of [[70, 60], [74, 64], [68, 66]]) this.addNpc('zombie', x, z, 1);
    for (const [x, z] of [[62, 80], [70, 84], [66, 78], [74, 86]]) this.addNpc('hobgoblin', x, z, 1);
    for (const [x, z] of [[44, 80], [48, 84], [50, 78]]) this.addNpc('ghost', x, z, 1);
    this.addNpc('dragon', 49, 101, 1);
    // Green Vale Farm (west)
    this.addNpc('farmer', 24, 52, 0);
    this.addNpc('cook', 54, 64, 0);           // in the castle kitchen
    this.addNpc('artisan', 58, 62, 0);        // by the kitchen — the tutorial teacher
    // Combat Training Yard (south) — Sergeant + penned goblins for safe-spot practice
    this.addNpc('instructor', 47, 86, 0);
    for (const [x, z] of [[46, 90], [48, 91], [47, 92]]) this.addNpc('pen_goblin', x, z, 0);
    for (const [x, z] of [[17, 55], [19, 57], [20, 55]]) this.addNpc('cow', x, z, 0);
    for (const [x, z] of [[28, 56], [26, 58], [29, 55]]) this.addNpc('chicken', x, z, 0);
    // The Hollow-folk camp (dungeon)
    this.addNpc('tribe_chief', 37, 64, 1);
    this.addNpc('farmhand', 35, 67, 1);
    for (const [x, z] of [[34, 63], [40, 66], [36, 69]]) this.addNpc('tribesman', x, z, 1);
    // ================= the southern highway, north to south =================
    // the downs: highwaymen prey on travellers just past the training yard
    for (const [x, z] of [[62, 96], [67, 100], [59, 103], [68, 106]]) this.addNpc('highwayman', x, z, 0);
    // Rookmoor (Ava's workshop, west off the road)
    this.addNpc('ava', 33, 108, 0);
    this.addNpc('highwayman', 42, 119, 0);
    // Willowmere — a quiet village of fisherfolk and willow-cutters
    for (const [x, z] of [[60, 118], [66, 120], [58, 115], [70, 118], [64, 123], [72, 119]]) this.addNpc('villager', x, z, 0);
    this.addNpc('shopkeeper', 71, 123, 0);
    this.addNpc('bartender', 58, 124, 0);
    // Chapman's Cross — the four traders, each behind their own counter
    this.addNpc('bladesmith', 50, 133, 0);
    this.addNpc('ironmonger', 59, 133, 0);
    this.addNpc('fletcher', 50, 142, 0);
    this.addNpc('runeseller', 59, 142, 0);
    for (const [x, z] of [[53, 137], [57, 139], [61, 138]]) this.addNpc('villager', x, z, 0);
    // the stone circle — dark wizards, the most dangerous stop on the road
    for (const [x, z] of [[37, 144], [39, 146], [35, 146], [41, 143], [38, 141]]) this.addNpc('dark_wizard', x, z, 0);
    // The Ringwall — the druid circle. Spawns must match between game.js and sim.js.
    this.addNpc('archmage', 38, 143, 0);
    this.addNpc('druid_elder', 39, 149, 0);
    this.addNpc('apothecary', 49, 153, 0);
    this.addNpc('druid', 33, 148, 0);
    this.addNpc('druid', 43, 148, 0);
    this.addNpc('druid', 35, 152, 0);
    this.addNpc('druid', 44, 141, 0);
    this.addNpc('druid', 31, 139, 0);
    this.addNpc('chaos_druid', 29, 151, 0);
    this.addNpc('chaos_druid', 47, 138, 0);
    this.addNpc('chaos_druid', 33, 156, 0);
    // the burnt steading, and the road on to the inn
    this.addNpc('highwayman', 79, 144, 0);
    this.addNpc('innkeeper', 57, 153, 0);
    for (const [x, z] of [[59, 155], [56, 151]]) this.addNpc('townsman', x, z, 0);
    // ---- Southmarch (the great southern city) ----
    this.addNpc('banker', 51, 165, 0);
    this.addNpc('outfitter', 76, 166, 0);
    this.addNpc('marshal', 64, 163, 0);
    this.addNpc('priest', 53, 181, 0);
    this.addNpc('bartender', 82, 182, 0);
    for (const [x, z] of [[62, 162], [66, 170], [55, 174], [74, 176], [64, 186], [50, 173], [78, 173]]) this.addNpc('guard', x, z, 0);
    for (const [x, z] of [[60, 169], [68, 170], [62, 179], [56, 172], [72, 183]]) this.addNpc('townsman', x, z, 0);
    for (const [x, z] of [[66, 167], [61, 176], [69, 173], [57, 181], [70, 165]]) this.addNpc('townswoman', x, z, 0);
    this.addNpc('wenna', 51, 184, 0);         // the cathedral loremaster, by the altar
    // The Giants' Den (deep, behind the boulder)
    for (const [x, z] of [[14, 62], [18, 70], [12, 68], [20, 64], [16, 74]]) this.addNpc('hill_giant', x, z, 1);
    this.addNpc('grukk', 13, 72, 1);
    // ================= Mourncross, east of the river =================
    // Wraiths hold the flats, so the crossing has to be earned. They leash to the
    // marsh — they will not follow you back over the causeway.
    for (const [x, z] of [[110, 55], [120, 46], [138, 50], [112, 82], [134, 86], [146, 78], [124, 88], [148, 44]])
      this.addNpc('marsh_wraith', x, z, 0);
    this.addNpc('ghost_warden', 116, 63, 0);          // at the gatehouse, still on duty
    this.addNpc('ghost_sexton', 148, 62, 0);          // in the churchyard
    this.addNpc('ghost_chandler', 122, 71, 0);        // his shuttered shop
    this.addNpc('ghost_child', 129, 55, 0);           // playing on the high street
    this.addNpc('ghost_trader', 137, 71, 0);          // Marrow's Rest
    for (const [x, z] of [[128, 78], [131, 78], [127, 83]]) this.addNpc('ghost_disciple', x, z, 0);
    this.addNpc('tallyman', 129, 41, 0);              // the bell tower, behind the peal
  },

  addNpc(type, x, z, layer) {
    let px = x, pz = z;
    outer: for (let r = 0; r < 8; r++)
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++)
        if (!World.blocked(layer, x + dx, z + dz)) { px = x + dx; pz = z + dz; break outer; }
    const d = NPC_DEFS[type];
    const n = { type, layer, x: px, z: pz, hx: px, hz: pz, fx: px + 0.5, fz: pz + 0.5, hits: d.hits, maxHits: d.hits, deadUntil: 0, target: false, splat: null, showHpUntil: 0, moving: false };
    this.npcs.push(n);
    return n;
  },

  // ---------- main loop ----------
  // RS2-style fixed simulation tick; rendering is capped to ~60fps
  TICK_MS: 600,
  FRAME_MS: 1000 / 60,
  loop() {
    requestAnimationFrame(this._loop);
    const now = performance.now();
    if (now - (this._lastFrame || 0) < this.FRAME_MS - 1.5) return; // lock to ~60fps
    this._lastFrame = now;
    const dt = Math.min(0.1, (now - this._last) / 1000) || 0.016;
    this._last = now;
    if (UI.keys.ArrowLeft) Renderer.yaw += dt * 2.4;
    if (UI.keys.ArrowRight) Renderer.yaw -= dt * 2.4;
    if (UI.keys.ArrowUp) Renderer.pitch = Math.min(1.15, Renderer.pitch + dt * 1.1);
    if (UI.keys.ArrowDown) Renderer.pitch = Math.max(0.35, Renderer.pitch - dt * 1.1);
    if (this.netMode) {
      Net.interpolate(dt);
    } else {
      this.updateMovement(dt);
      // fixed 0.6s simulation tick, independent of frame rate (RS2-style)
      if (now - this.lastTick >= this.TICK_MS) { this.lastTick = now; this.tick(now); }
    }
    this.projectiles = this.projectiles.filter(p => now - p.t0 < p.dur + 100);
    this.floaters = this.floaters.filter(f => now - f.t0 < 1200);
    Renderer.draw(this, now);
    UI.drawMinimap(this);
    UI.renderEventBanner();
  },

  updateMovement(dt) {
    const P = this.player;
    P.moving = false;
    if (P.path.length) {
      const n = P.path[0], tx = n.x + 0.5, tz = n.z + 0.5;
      const dx = tx - P.x, dz = tz - P.z, dist = Math.hypot(dx, dz), step = (this.run ? 3.9 : 2.1) * dt;
      if (dist <= step) { P.x = tx; P.z = tz; P.path.shift(); }
      else { P.x += dx / dist * step; P.z += dz / dist * step; }
      P.moving = true;
      P.actType = null; P.faceX = null; // walking cancels any skilling gesture / facing lock
      if (P.emote) this.clearEmote();     // ...and any emote you were mid-way through
    }
    for (const n of this.npcs) {
      const tx = n.x + 0.5, tz = n.z + 0.5;
      const dx = tx - n.fx, dz = tz - n.fz, d = Math.hypot(dx, dz);
      if (d > 0.01) {
        const st = Math.min(d, 1.9 * dt);
        n.fx += dx / d * st; n.fz += dz / d * st;
        n.moving = true;
      } else n.moving = false;
    }
  },

  // ---------- game tick (600ms) ----------
  tick(now) {
    this._now = now;                                  // effLevel reads this for potion timers
    if (!this.netMode && this.eventCtx) Events.tick(this.eventCtx);   // the server owns events in multiplayer
    for (const lay of World.L) {
      for (const [k, s] of lay.scenery) {
        if (s.type === 'fire' && now > s.expireAt) {
          lay.scenery.delete(k);
          // a burnt-out fire leaves ashes where it stood, for anyone who wants them
          if (s.ashLayer !== undefined)
            this.ground.push({ id: 'ashes', qty: 1, x: s.x, z: s.z, layer: World.L.indexOf(lay), until: now + 120000 });
          continue;
        }
        if (s.respawnAt && now > s.respawnAt) { s.type = s.restore; s.respawnAt = 0; }
      }
    }
    this.ground = this.ground.filter(g => now < g.until);
    for (const sp of this.itemSpawns) {
      if (!this.ground.some(g => g.spawn === sp) && now > sp.respawnAt)
        this.ground.push({ id: sp.id, qty: 1, x: sp.x, z: sp.z, layer: sp.layer, until: Infinity, spawn: sp });
    }
    this.tickPrayer();
    this.tickAction(now);
    this.tickNpcs(now);
    this._ticks++;
    if (this._ticks % 40 === 0) for (const shop of Object.values(this.shops)) for (const st of shop) st.qty += Math.sign(st.initial - st.qty);
    if (this._ticks % 25 === 0) this.save();
  },

  // Prayer bonus doesn't reduce drain directly — it raises how much drain you can
  // soak before a point is spent. Each point of bonus is worth 2 resistance, so +15
  // gear makes your prayer points last 50% longer (60 -> 90).
  prayDrainResist() { return 60 + 2 * this.equipBonus().pray; },

  // Prayers toggled off at any point during a tick are not charged for that tick.
  // That single rule *is* prayer flicking: switch a prayer off and straight back on
  // between ticks and it is up when it matters but costs nothing. Done perfectly it
  // is free, exactly as in the game this borrows from — and it costs a click every
  // 600ms to keep up, which is the point.
  _flicked: {},
  tickPrayer() {
    const P = this.player;
    let drain = 0;
    for (const pr of PRAYERS) if (P.prayersOn[pr.id] && !this._flicked[pr.id]) drain += pr.drain;
    this._flicked = {};
    if (!drain) return;
    const before = P.curPrayer;
    const resist = this.prayDrainResist();
    P.prayCounter = (P.prayCounter || 0) + drain;
    while (P.prayCounter >= resist && P.curPrayer > 0) { P.prayCounter -= resist; P.curPrayer--; }
    if (P.curPrayer <= 0) {
      P.curPrayer = 0; P.prayersOn = {}; P.prayCounter = 0;
      this.msg('You have run out of prayer points. You can recharge at an altar.', 'm-red');
      UI.renderPrayers(); UI.renderStats();
    } else if (P.curPrayer !== before) { UI.renderPrayers(); UI.renderStats(); }
  },

  togglePrayer(id) {
    const P = this.player, pr = PRAYERS.find(p => p.id === id);
    if (!pr) return;
    // The sim does not model prayer, so switching one on here would drain points
    // client-side and change nothing about the combat the server is resolving. Say
    // so instead of letting the tab pretend it worked.
    if (this.netMode) { this.msg('Prayer is singleplayer-only for now — it would have no effect in a shared world.', 'm-red'); return; }
    if (P.prayersOn[id]) { delete P.prayersOn[id]; this._flicked[id] = true; }
    else {
      if (this.level('prayer') < pr.lvl) { this.msg('You need a Prayer level of ' + pr.lvl + ' to use ' + pr.name + '.', 'm-red'); return; }
      if (P.curPrayer <= 0) { this.msg('You need to recharge your prayer at an altar.', 'm-red'); return; }
      // rival prayers in the same group switch off, the way the prayer book works
      for (const o of PRAYERS)
        if (o.group === pr.group && o.id !== id && P.prayersOn[o.id]) { delete P.prayersOn[o.id]; this._flicked[o.id] = true; }
      P.prayersOn[id] = true;
      Sound.play('pray');
    }
    UI.renderPrayers();
  },

  // Burn odds fall from burnBase at the food's unlock level to exactly zero at its
  // stopBurn level — so every food has a level where you stop ruining it for good,
  // which is the single most satisfying thing about training Cooking. An open fire
  // is cruder than a range and takes five more levels to get there.
  burnChance(ck, onRange) {
    const stop = (ck.stopBurn || 30) + (onRange ? 0 : 5);
    const lvl = this.level('cooking');
    if (lvl >= stop) return 0;
    const span = Math.max(1, stop - ck.lvl);
    return ck.burnBase * Math.max(0, (stop - lvl) / span);
  },
  // the level at which a food stops burning here — surfaced in the Cooking guide
  stopBurnLevel(ck, onRange) { return (ck.stopBurn || 30) + (onRange ? 0 : 5); },

  tickAction(now) {
    const P = this.player, a = P.action;
    if (!a) return;
    let tx, tz, reach = 1;
    if (a.key !== undefined) {
      const s = World.L[P.layer].scenery.get(a.key);
      if (!s || (a.stype && s.type !== a.stype)) { P.action = null; return; }
      a.s = s; tx = s.x; tz = s.z;
    } else if (a.npc) {
      if (a.npc.deadUntil || a.npc.layer !== P.layer) { P.action = null; return; }
      tx = a.npc.x; tz = a.npc.z;
      if (a.type === 'cast') reach = 5;
      if (a.type === 'attack' && this.autocastSpell()) reach = 5;
      else if (a.type === 'attack' && this.equippedIn('weapon') && ITEMS[this.equippedIn('weapon').id].bow && this.bestArrow()) reach = 5;
    } else if (a.item) {
      if (!this.ground.includes(a.item)) { P.action = null; return; }
      tx = a.item.x; tz = a.item.z; reach = 0;
    } else { P.action = null; return; }

    const px = Math.floor(P.x), pz = Math.floor(P.z);
    const dist = Math.max(Math.abs(px - tx), Math.abs(pz - tz));
    if (dist > reach) {
      if (!P.path.length) {
        const path = World.findPath(P.layer, px, pz, tx, tz);
        // when meleeing/talking to an NPC, stop on the tile BESIDE it — never walk on top of it
        if (path && path.length && a.npc && reach === 1) {
          const last = path[path.length - 1];
          if (last.x === tx && last.z === tz) path.pop();
        }
        if (path && path.length) P.path = path;
        else { this.msg("I can't reach that!", 'm-red'); P.action = null; }
      }
      return;
    }
    P.path = [];
    this.faceTarget(tx, tz); // face what we're acting on
    // repeating skilling gestures — the tool used is inferred by the renderer from the type
    if (a.type === 'chop' || a.type === 'mine' || a.type === 'fish' || a.type === 'cook' || a.type === 'smelt' || a.type === 'smith') this.gesture(a.type, now);

    switch (a.type) {
      case 'chop': {
        const td = TREE_DEFS[a.s.type];
        const axe = this.bestAxe();
        if (!axe) { this.msg('You need an axe you can swing to chop down this tree.', 'm-red'); P.action = null; break; }
        if (this.level('woodcut') < td.lvl) { this.msg('You need a Woodcut level of ' + td.lvl + ' to chop this tree.', 'm-red'); P.action = null; break; }
        if (!a.started) { this.msg('You swing your axe at the tree...', 'm-game'); a.started = true; break; }
        if (!this.toolReady(a, axe)) break;
        if (Math.random() < Combat.gatherChance(td.low, td.high, this.level('woodcut'))) {
          if (!this.addItem(td.log, 1)) { P.action = null; break; }
          this.msg('You get some ' + (td.log === 'logs' ? 'wood' : ITEMS[td.log].name.toLowerCase()) + '.', 'm-game');
          Sound.play('success');
          this.addXp('woodcut', td.xp);
          if (Math.random() < td.deplete) {
            a.s.restore = a.s.type; a.s.type = 'stump';
            a.s.respawnAt = now + td.respawn * 1000 + Math.random() * 15000;
            P.action = null;
          }
        }
        break;
      }
      case 'essence': {
        const def = SCENERY_DEFS[a.s.type];
        const pure = a.s.type === 'pure_rock';
        if (!this.player.quests.runemyst || this.player.quests.runemyst < 4) {
          this.msg('You have no idea what to do with this rock.', 'm-red'); P.action = null; break;
        }
        if (!this.bestPick()) { this.msg('You need a pickaxe you can swing to mine this rock.', 'm-red'); P.action = null; break; }
        if (pure && this.level('mining') < 30) { this.msg('You need a Mining level of 30 to cut pure essence.', 'm-red'); P.action = null; break; }
        if (!a.started) { this.msg('You swing your pick at the blank rock...', 'm-game'); a.started = true; break; }
        if (!this.toolReady(a, this.bestPick())) break;
        // essence rocks never run out — the trip is the cost, not the rock
        if (!this.addItem(pure ? 'pure_essence' : 'rune_essence', 1)) { P.action = null; break; }
        this.addXp('mining', 5);
        break;
      }
      case 'mine': {
        const def = SCENERY_DEFS[a.s.type];
        const pick = this.bestPick();
        // this used to demand a *bronze* pickaxe by id, so better picks did nothing
        // and, if you sold the bronze one, mining stopped working entirely
        if (!pick) { this.msg('You need a pickaxe you can swing to mine this rock.', 'm-red'); P.action = null; break; }
        // The guild's boost is invisible: it never unlocks a rock, so the level check
        // uses your real Mining and only the success roll below is boosted.
        if (this.level('mining') < def.lvl) { this.msg('You need a Mining level of ' + def.lvl + ' to mine this rock.', 'm-red'); P.action = null; break; }
        if (!a.started) { this.msg('You swing your pick at the rock...', 'm-game'); a.started = true; break; }
        if (!this.toolReady(a, pick)) break;
        const guild = World.inGuild(a.s.x, a.s.z);
        if (Math.random() < Combat.gatherChance(def.low, def.high, Combat.guildMiningLevel(this.level('mining'), guild))) {
          // a gem seam yields one of the four stones, weighted toward the cheap ones
          const ore = def.gemRock ? Combat.rollGem() : def.ore;
          if (!this.addItem(ore, 1)) { P.action = null; break; }
          this.msg(def.gemRock ? 'You prise ' + ITEMS[ore].name.toLowerCase() + ' out of the rock!' :
                   'You manage to obtain some ' + ITEMS[ore].name.toLowerCase() + '.', def.gemRock ? 'm-lvl' : 'm-game');
          Sound.play('success');
          this.addXp('mining', def.xp);
          a.s.restore = a.s.type; a.s.type = 'rock_empty';
          // richer seams keep you waiting longer for the rock to come back — halved
          // inside the guild, the other half of what the level-20 door buys you
          a.s.respawnAt = now + Combat.rockRespawnMs(def, guild) + Math.random() * 4000;
          P.action = null;
        }
        break;
      }
      case 'fish': {
        const lure = a.s.type === 'lure_spot';
        const tool = lure ? 'fishing_rod' : 'net';
        if (!this.hasItem(tool)) { this.msg('You need a ' + ITEMS[tool].name.toLowerCase() + ' to catch these fish.', 'm-red'); P.action = null; break; }
        // fly fishing spends a feather a cast, which is what makes feathers worth
        // keeping off every chicken you kill
        if (lure && !this.hasItem('feather')) { this.msg('You have no feathers left to tie a fly with.', 'm-red'); P.action = null; break; }
        const fl = this.level('fishing');
        if (lure && fl < 20) { this.msg('You need a Fishing level of 20 to fish here.', 'm-red'); P.action = null; break; }
        if (!a.started) { this.msg(lure ? 'You cast out your line...' : 'You cast out your net...', 'm-game'); a.started = true; break; }
        if (Math.random() < Combat.gatherChance(lure ? 30 : 85, lure ? 140 : 195, fl)) {
          let fish, xp;
          if (lure) {
            if (fl >= 30 && Math.random() < 0.5) { fish = 'raw_salmon'; xp = 70; }
            else { fish = 'raw_trout'; xp = 50; }
          } else {
            if (fl >= 15 && Math.random() < 0.4) { fish = 'raw_anchovies'; xp = 40; }
            else { fish = 'raw_shrimp'; xp = 10; }
          }
          if (!this.addItem(fish, 1)) { P.action = null; break; }
          if (lure) this.removeItem('feather', 1);
          this.msg('You catch some ' + ITEMS[fish].name.toLowerCase().replace('raw ', '') + '.', 'm-game');
          Sound.play('success');
          this.addXp('fishing', xp);
        }
        break;
      }
      case 'cook': {
        const rawId = (a.rawId && this.hasItem(a.rawId)) ? a.rawId
          : (this.player.inv.find(i => i && COOKABLES[i.id]) || {}).id;
        if (!rawId) { this.msg('You have nothing to cook.', 'm-game'); P.action = null; break; }
        const ck = COOKABLES[rawId];
        if (this.level('cooking') < ck.lvl) { this.msg('You need a Cooking level of ' + ck.lvl + ' to cook this.', 'm-red'); P.action = null; break; }
        this.removeItem(rawId, 1);
        const burn = this.burnChance(ck, a.s.type === 'range');
        if (Math.random() < burn) {
          this.addItem(ck.burnt, 1);
          this.msg('You accidentally burn the ' + ITEMS[ck.cooked].name.toLowerCase() + '.', 'm-red');
          Sound.play('fail');
        } else {
          this.addItem(ck.cooked, 1);
          this.addXp('cooking', ck.xp);
          this.msg('The ' + ITEMS[ck.cooked].name.toLowerCase() + ' is now nicely cooked.', 'm-game');
          Sound.play('success');
        }
        break;
      }
      case 'smelt': {
        const rec = SMELTS.find(r => r.bar === a.bar);
        if (!rec) { P.action = null; break; }
        if (this.level('smithing') < rec.lvl) { this.msg('You need a Smithing level of ' + rec.lvl + ' to smelt that.', 'm-red'); P.action = null; break; }
        const missing = Object.entries(rec.needs).find(([id, q]) => this.countItem(id) < q);
        if (missing) { this.msg('You need ' + Object.entries(rec.needs).map(([id, q]) => q + ' ' + ITEMS[id].name.toLowerCase()).join(' and ') + ' to make a ' + rec.name.toLowerCase() + '.', 'm-red'); P.action = null; break; }
        for (const [id, q] of Object.entries(rec.needs)) this.removeItem(id, q);
        // iron is a coin-flip forever, at every level — the one ore that never gets
        // easier, exactly as in the game this borrows from
        if (rec.fail && Math.random() < rec.fail) {
          this.msg('The ore is too impure and you fail to refine it.', 'm-red');
          Sound.play('fail');
        } else {
          this.addItem(rec.bar, 1);
          this.addXp('smithing', rec.xp);
          this.msg('You retrieve a ' + rec.name.toLowerCase() + ' from the furnace.', 'm-game');
          Sound.play('success');
        }
        break;
      }
      case 'smith': {
        const rec = SMITHABLES.find(r => r.id === a.product);
        if (!this.hasItem('hammer')) { this.msg('You need a hammer to work the metal. The store sells them.', 'm-red'); P.action = null; break; }
        if (this.level('smithing') < rec.lvl) { this.msg('You need a Smithing level of ' + rec.lvl + ' to make that.', 'm-red'); P.action = null; break; }
        if (this.countItem(rec.bar) < rec.bars) { this.msg('You have run out of ' + ITEMS[rec.bar].name.toLowerCase() + 's.', 'm-game'); P.action = null; break; }
        this.removeItem(rec.bar, rec.bars);
        const qty = rec.qty || 1;
        this.addItem(rec.id, qty);
        this.addXp('smithing', rec.xp);
        this.msg('You hammer the metal and make ' + (qty > 1 ? qty + ' ' : 'a ') + ITEMS[rec.id].name.toLowerCase() + '.', 'm-game');
        Sound.play('success');
        break;
      }
      case 'attack': {
        const n = a.npc;
        n.target = true;
        const auto = this.autocastSpell();
        const wep = this.equippedIn('weapon');
        const usingBow = !auto && wep && ITEMS[wep.id].bow && this.bestArrow();
        // how many ticks until this weapon/style can strike again
        const speed = auto ? 5 : usingBow ? this.bowSpeed(wep.id) : this.weaponSpeed();
        if (this._ticks < (P.nextAtkTick || 0)) break; // still recovering from the last swing — hold ground
        P.nextAtkTick = this._ticks + speed;
        if (auto) {                                     // auto-cast: attacking repeatedly casts your set spell
          this._lastAttackType = 'magic';
          if (!this.castSpell(auto.id, n, now)) {       // out of runes / level → stop rather than melee-lunge
            if (!a.warnedRunes) { this.msg('Auto-cast off: cast another way or restock runes.', 'm-red'); a.warnedRunes = true; }
            P.action = null; break;
          }
        } else if (wep && ITEMS[wep.id].bow) {
          if (!this.bestArrow()) {
            if (!a.warnedArrows) { this.msg('You have run out of arrows!', 'm-red'); a.warnedArrows = true; }
            if (dist > 1) break;
            this._lastAttackType = 'melee'; this.meleeAttack(n, now);
          } else { this._lastAttackType = 'ranged'; this.rangedAttack(n, now); }
        } else { this._lastAttackType = 'melee'; this.meleeAttack(n, now); }
        if (n.hits <= 0) { this.killNpc(n, now); P.action = null; }
        break;
      }
      case 'cast': {
        const n = a.npc;
        this._lastAttackType = 'magic';
        this.castSpell(a.spellId, n, now);
        P.action = null;
        if (n.hits <= 0) this.killNpc(n, now);
        else n.target = true;
        break;
      }
      case 'talk':
        P.action = null;
        this.talkTo(a.npc);
        break;
      case 'take': {
        const g = a.item;
        if (g.noted ? this.addNote(g.id, g.qty) : this.addItem(g.id, g.qty)) {
          this.ground.splice(this.ground.indexOf(g), 1);
          if (g.spawn) g.spawn.respawnAt = now + 60000;
          this.msg('You take the ' + ITEMS[g.id].name.toLowerCase() + '.', 'm-game');
        }
        P.action = null;
        break;
      }
      case 'bank':
        P.action = null;
        UI.openBank();
        break;
      case 'shop':
        P.action = null;
        UI.openShop(a.shop || 'general');
        break;
      case 'altar': {
        const P2 = this.player;
        P2.curPrayer = this.level('prayer'); P2.prayCounter = 0;
        this.msg('You recharge your prayer points.', 'm-game');
        Sound.play('pray');
        UI.renderPrayers();
        P.action = null;
        break;
      }
      case 'climb': {
        const down = a.s.type === 'ladder_down';
        P.layer = down ? 1 : 0;
        P.path = [];
        for (const n of this.npcs) if (n.layer !== P.layer) n.target = false;
        this.msg(down ? 'You climb down the ladder into the darkness...' : 'You climb up the ladder into the light.', 'm-game');
        Sound.play('climb');
        P.action = null;
        break;
      }
      default:
        P.action = null;
    }
  },

  // turn the player to look at a tile centre (renderer honours faceX/faceZ as a facing lock)
  faceTarget(tx, tz) { this.player.faceX = tx + 0.5; this.player.faceZ = tz + 0.5; },
  // play a repeating skilling gesture (chop/mine/fish/cook/smelt/smith) for the next ~0.7s
  gesture(type, now) { this.player.actType = type; this.player.actUntil = now + 700; },

  // ---------- combat / tools ----------
  bestAxe() {
    let best = null, bestTier = -1;
    // an axe can be carried in the pack OR wielded as a weapon — check both
    const worn = this.player.worn || {};
    const pool = this.player.inv.concat(worn.weapon ? [worn.weapon] : []);
    for (const i of pool) {
      if (!i || i.noted) continue;
      const d = ITEMS[i.id];
      if (!d.axe) continue;
      if (this.level('woodcut') < Combat.toolLevel(i.id)) continue;   // too heavy for you yet
      const tier = Combat.metalTier(i.id);
      if (tier > bestTier) { bestTier = tier; best = i.id; }
    }
    return best;
  },
  // the best pickaxe you can actually swing, same rules as bestAxe
  bestPick() {
    let best = null, bestTier = -1;
    const worn = this.player.worn || {};
    const pool = this.player.inv.concat(worn.weapon ? [worn.weapon] : []);
    for (const i of pool) {
      if (!i || i.noted) continue;
      const d = ITEMS[i.id];
      if (!d.pick) continue;
      if (this.level('mining') < Combat.toolLevel(i.id)) continue;   // too heavy for you yet
      const tier = Combat.metalTier(i.id);
      if (tier > bestTier) { bestTier = tier; best = i.id; }
    }
    return best;
  },
  // Do we roll for a resource this tick? A better tool rolls more often — it never
  // improves the odds of any single swing (Combat.toolInterval).
  toolReady(a, toolId) {
    const every = Combat.toolInterval(toolId);
    if (every <= 1) return true;
    a.swings = (a.swings || 0) + 1;
    if (a.swings < every) return false;
    a.swings = 0;
    return true;
  },

  // worn gear lives in player.worn (a slot→item map), NOT in the inventory, so equipping frees a slot
  equippedIn(slot) {
    const w = this.player.worn;
    return (w && w[slot]) || null;
  },
  equipBonus() {
    let aim = 0, power = 0, armour = 0, mAim = 0, rAim = 0, rPow = 0, pray = 0;
    const w = this.player.worn || {};
    for (const slot in w) {
      const it = w[slot]; if (!it) continue;
      const d = ITEMS[it.id];
      aim += d.aim || 0; power += d.power || 0; armour += d.armour || 0; mAim += d.mAim || 0;
      rAim += d.rAim || 0; rPow += d.rPow || 0; pray += d.pray || 0;
    }
    return { aim, power, armour, mAim, rAim, rPow, pray };
  },

  // ---- combat maths live in the shared Combat module (so the server matches exactly) ----
  weaponSpeed() { const w = this.equippedIn('weapon'); return Combat.weaponSpeed(w ? w.id : null); },
  bowSpeed(id) { return Combat.bowSpeed(id, this.player.style); },
  npcSpeed(type) { return Combat.npcSpeed(type); },
  npcLeash(type) { return Combat.npcLeash(type); },
  triMult(atkStyle, armour) { return Combat.triMult(atkStyle, armour); },
  npcWeakness(type) { return Combat.npcWeakness(type); },
  playerArmourClass() {
    const b = this.equippedIn('body'), h = this.equippedIn('head'), lg = this.equippedIn('legs');
    return Combat.armourClass(b ? b.id : null, h ? h.id : null, lg ? lg.id : null);
  },
  // chance a loosed arrow is recovered instead of spent (Ava's Satchel: 0.72)
  arrowSave() { const c = this.equippedIn('cape'); return Combat.arrowSave(c ? c.id : null); },
  rollHit(att, str, def) { return Combat.rollHit(att, str, def); },

  // Who am I actually fighting? Both renderers ask this so the target's health bar can be
  // drawn last and marked — with several monsters stood on the same tile their bars pile
  // up and you can't tell which one is yours.
  combatTarget() {
    // Multiplayer resolves by id, not by reference: net.js rebuilds Game.npcs from every
    // snapshot, so a held object goes stale the moment one drops out of range.
    if (this.netMode) {
      if (!this._netTargetId) return null;
      return this.npcs.find(n => n.id === this._netTargetId && !n.deadUntil) || null;
    }
    const a = this.player.action;
    if (!a || (a.type !== 'attack' && a.type !== 'cast') || !a.npc) return null;
    return a.npc.deadUntil ? null : a.npc;
  },

  // Is something actually in a position to swing at us right now? Mirrors the reach test
  // in tickNpcs so the two can never disagree about who is in a fight.
  underAttack() {
    const P = this.player, px = Math.floor(P.x), pz = Math.floor(P.z);
    return this.npcs.some(n => {
      const d = NPC_DEFS[n.type];
      if (!n.target || n.deadUntil || n.layer !== P.layer || !d.attackable) return false;
      const reach = d.ranged ? (d.maxRange || 1) : 1;
      return Math.max(Math.abs(n.x - px), Math.abs(n.z - pz)) <= reach;
    });
  },

  splatNpc(n, dmg, now) {
    if (this.eventCtx) Events.credit(this.eventCtx, n, 'me', dmg);
    // Keep the previous splat alive alongside the new one instead of replacing it, so
    // rapid hits read as several numbers rather than one flickering one.
    if (n.splat && now < n.splat.until) n.splat2 = n.splat;
    n.flinch = now + 220;                     // a visible reaction to being hit
    n.splat = { v: dmg, until: now + 900 };
    n.showHpUntil = now + 5000;
    this.player.showHpUntil = now + 5000;
    this.player.swingUntil = now + 350;
    this.player.swingKind = this._lastAttackType; // 'melee' | 'ranged' | 'magic' — renderer picks the motion
    n.hits -= dmg;
    Sound.play(dmg > 0 ? 'hit' : 'miss');
  },

  meleeAttack(n, now) {
    const d = NPC_DEFS[n.type], eq = this.equipBonus();
    const t = this.triMult('melee', d.carmour);
    const dmg = this.rollHit((this.effLevel('attack') + eq.aim) * t, (this.effLevel('strength') + eq.power) * (t > 1 ? 1.1 : t < 1 ? 0.9 : 1), this.npcStat(n, 'def'));
    this.splatNpc(n, dmg, now);
    if (dmg > 0) {
      const style = this.player.style;
      if (style === 0) for (const s of ['attack', 'strength', 'defense']) this.addXp(s, dmg * 1.33);
      else this.addXp(['attack', 'attack', 'strength', 'defense'][style], dmg * 4);
      this.addXp('hits', dmg * 1.33);
    }
  },

  // Picks the heaviest arrow you can actually draw. Without the rangeReq check a level-1
  // archer would auto-fire adamant arrows the moment any dropped.
  bestArrow() {
    let best = null, bestPow = -1;
    const lvl = this.level('ranged');
    for (const i of this.player.inv) {
      if (!i || i.noted) continue;
      const d = ITEMS[i.id];
      if (!d.power || !i.id.endsWith('_arrow')) continue;
      if (lvl < (d.rangeReq || 1)) continue;
      if (d.power > bestPow) { bestPow = d.power; best = i.id; }
    }
    return best;
  },

  rangedAttack(n, now) {
    const d = NPC_DEFS[n.type];
    const arrow = this.bestArrow();
    const eq = this.equipBonus();
    // a lodestone-lined pack (Ava's Satchel) calls the arrow back instead of spending it
    const save = this.arrowSave();
    if (!(save > 0 && Math.random() < save)) this.removeItem(arrow, 1);
    else this._arrowsSaved = (this._arrowsSaved || 0) + 1;
    const rAim = eq.rAim, rPow = eq.rPow;
    const t = this.triMult('ranged', d.carmour);
    const dmg = this.rollHit((this.level('ranged') + 4 + rAim) * t, ((ITEMS[arrow].power || 2) + 2 + rPow) * (t > 1 ? 1.1 : t < 1 ? 0.9 : 1), this.npcStat(n, 'def'));
    this.projectiles.push({ fx: this.player.x, fz: this.player.z, tx: n.fx, tz: n.fz, t0: now, dur: 300, color: '#c8a03c', layer: this.player.layer });
    this.splatNpc(n, dmg, now);
    if (dmg > 0) { this.addXp('ranged', dmg * 4); this.addXp('hits', dmg * 1.33); }
  },

  // the spell set for auto-cast, if any (returns the spell def, or null)
  autocastSpell() { return this.player.autocast ? (SPELLS.find(s => s.id === this.player.autocast) || null) : null; },
  // a wielded staff supplies its own rune type for free
  staffProvides() { const w = this.equippedIn('weapon'); return w ? (ITEMS[w.id].provides || null) : null; },
  // does the player have level + runes to cast this spell right now?
  canCast(sp) {
    if (this.level('magic') < sp.lvl) return false;
    const free = this.staffProvides();
    for (const [id, q] of Object.entries(sp.runes)) if (id !== free && this.countItem(id) < q) return false;
    return true;
  },

  // do we hold the runes for this spell (a staff supplies its own element)?
  haveRunes(sp) {
    const free = this.staffProvides();
    for (const [id, q] of Object.entries(sp.runes))
      if (id !== free && this.countItem(id) < q) return false;
    return true;
  },
  spendRunes(sp) {
    const free = this.staffProvides();
    for (const [id, q] of Object.entries(sp.runes)) if (id !== free) this.removeItem(id, q);
  },
  missingRuneMsg(sp) {
    const free = this.staffProvides();
    for (const [id, q] of Object.entries(sp.runes))
      if (id !== free && this.countItem(id) < q) { this.msg("You don't have enough " + ITEMS[id].name + 's to cast ' + sp.name + '.', 'm-red'); return; }
  },

  castSpell(spellId, n, now) {
    const sp = SPELLS.find(s => s.id === spellId), d = NPC_DEFS[n.type], eq = this.equipBonus();
    if (this.level('magic') < sp.lvl) { this.msg('Your Magic level is not high enough for this spell.', 'm-red'); return false; }
    if (!this.haveRunes(sp)) { this.missingRuneMsg(sp); return false; }
    // curse spells sap a stat instead of dealing damage
    if (sp.kind === 'curse') {
      this.spendRunes(sp);
      n.sap = n.sap || {};
      const already = n.sap[sp.sap] || 0;
      this.projectiles.push({ fx: this.player.x, fz: this.player.z, tx: n.fx, tz: n.fz, t0: now, dur: 350, color: '#b06ad8', layer: this.player.layer });
      Sound.play('cast');
      this.addXp('magic', sp.xp);
      if (already >= 0.15) { this.msg('The ' + d.name + ' is already as weakened as this spell can make it.', 'm-game'); return true; }
      n.sap[sp.sap] = already + sp.pct;
      n.showHpUntil = now + 5000;
      this.msg('You sap the ' + d.name + "'s " + SAP_NAME[sp.sap] + '.', 'm-quest');
      return true;
    }
    this.spendRunes(sp);
    const t = this.triMult('magic', d.carmour);
    const effMag = (this.level('magic') + eq.mAim) * t;                 // staff/robes + triangle sharpen your aim
    const p = (effMag + 8) / (effMag + this.npcStat(n, 'def') + 16);
    const dmg = Math.random() < p ? Math.floor(Math.random() * (sp.max + 1 + (t > 1 ? 1 : 0))) : 0;
    this.projectiles.push({ fx: this.player.x, fz: this.player.z, tx: n.fx, tz: n.fz, t0: now, dur: 350, color: '#66aaff', layer: this.player.layer });
    Sound.play('cast');
    this.splatNpc(n, dmg, now);
    this.addXp('magic', sp.xp + dmg * 2);
    if (dmg > 0) this.addXp('hits', dmg * 1.33);
    return true;
  },

  // ---- utility spells: cast on something in your pack, or on the ground ----
  // Every one of these funnels through here so the rune cost, the level check and
  // the "wrong target" message read the same wherever you cast from.
  castOnItem(spellId, slot) {
    const P = this.player, sp = SPELLS.find(s => s.id === spellId), it = P.inv[slot];
    if (!sp || !it) return false;
    if (this.level('magic') < sp.lvl) { this.msg('Your Magic level is not high enough for this spell.', 'm-red'); return false; }
    const def = ITEMS[it.id];
    let done = false;

    if (sp.kind === 'enchant') {
      const into = ENCHANTS[it.id];
      if (!into || def.gemset !== sp.ench) {
        this.msg(into ? sp.name + ' only works on ' + sp.ench + ' jewellery.' : 'That is not something you can enchant.', 'm-red');
        return false;
      }
      if (!this.haveRunes(sp)) { this.missingRuneMsg(sp); return false; }
      this.spendRunes(sp);
      P.inv[slot] = { id: into, qty: 1 };
      this.msg('The ' + sp.ench + ' flares and settles. You have made ' + ITEMS[into].name.toLowerCase() + '.', 'm-lvl');
      done = true;

    } else if (sp.kind === 'alch') {
      if (it.id === 'coins') { this.msg('That would be a very short spell.', 'm-red'); return false; }
      if (def.quest) { this.msg('You cannot turn a quest item into coins.', 'm-red'); return false; }
      if (!def.value) { this.msg('Nobody would give you a coin for that.', 'm-red'); return false; }
      if (!this.haveRunes(sp)) { this.missingRuneMsg(sp); return false; }
      // a dear item gets a confirmation, and the spell is cast from inside it
      if ((def.value || 0) >= this.VALUABLE) {
        this.confirmDestroy(it.id, 'Alchemise', () => {
          if (!this.haveRunes(sp) || P.inv[slot] !== it) return;
          this.spendRunes(sp);
          const gp2 = Math.max(1, Math.floor(def.value * sp.rate * (it.qty || 1)));
          P.inv[slot] = null;
          if (this.selectedSlot === slot) this.selectedSlot = -1;
          this.addItem('coins', gp2);
          this.addXp('magic', sp.xp);
          this.msg('The ' + def.name.toLowerCase() + ' turns to ' + gp2 + ' coins in your hand.', 'm-game');
          Sound.play('cast');
          this.selectedSpell = null;
          UI.renderInventory(); UI.renderMagic(); UI.renderStats();
        });
        return false;
      }
      this.spendRunes(sp);
      const gp = Math.max(1, Math.floor(def.value * sp.rate * (it.qty || 1)));
      P.inv[slot] = null;
      if (this.selectedSlot === slot) this.selectedSlot = -1;
      this.addItem('coins', gp);
      this.msg('The ' + def.name.toLowerCase() + ' turns to ' + gp + ' coins in your hand.', 'm-game');
      done = true;

    } else if (sp.kind === 'smelt') {
      const rec = SMELTS.find(r => Object.keys(r.needs).includes(it.id) && Object.keys(r.needs).length === 1);
      if (!rec) { this.msg('Superheat needs an ore that smelts on its own — iron, silver or gold.', 'm-red'); return false; }
      if (this.level('smithing') < rec.lvl) { this.msg('You need a Smithing level of ' + rec.lvl + ' to smelt that.', 'm-red'); return false; }
      if (!this.haveRunes(sp)) { this.missingRuneMsg(sp); return false; }
      this.spendRunes(sp);
      this.removeItem(it.id, 1);
      // superheating an iron ore never fails — the whole point of the spell
      this.addItem(rec.bar, 1);
      this.addXp('smithing', rec.xp);
      this.msg('The ore glows white and runs into a ' + rec.name.toLowerCase() + '. No furnace needed.', 'm-game');
      done = true;

    } else {
      this.msg('You cannot cast ' + sp.name + ' on that.', 'm-red');
      return false;
    }

    if (done) {
      this.addXp('magic', sp.xp);
      Sound.play('cast');
      this.selectedSpell = null;
      UI.renderInventory(); UI.renderMagic(); UI.renderStats();
    }
    return done;
  },

  // Telekinetic Grab: pull a ground item to you from range
  castGrab(g) {
    const sp = SPELLS.find(s => s.id === 'telegrab');
    if (this.level('magic') < sp.lvl) { this.msg('Your Magic level is not high enough for this spell.', 'm-red'); return false; }
    if (!this.ground.includes(g)) { this.msg('It is already gone.', 'm-game'); return false; }
    if (!this.haveRunes(sp)) { this.missingRuneMsg(sp); return false; }
    const dist = Math.max(Math.abs(Math.floor(this.player.x) - g.x), Math.abs(Math.floor(this.player.z) - g.z));
    if (dist > 8) { this.msg('That is too far away to reach, even like this.', 'm-red'); return false; }
    this.spendRunes(sp);
    this.projectiles.push({ fx: g.x + 0.5, fz: g.z + 0.5, tx: this.player.x, tz: this.player.z, t0: performance.now(), dur: 300, color: '#9fd8ff', layer: this.player.layer });
    if (g.noted ? this.addNote(g.id, g.qty) : this.addItem(g.id, g.qty)) {
      this.ground.splice(this.ground.indexOf(g), 1);
      if (g.spawn) g.spawn.respawnAt = performance.now() + 60000;
      this.addXp('magic', sp.xp);
      this.msg('The ' + ITEMS[g.id].name.toLowerCase() + ' lifts off the ground and flies to your hand.', 'm-game');
      Sound.play('cast');
    }
    this.selectedSpell = null;
    UI.renderInventory(); UI.renderMagic(); UI.renderStats();
    return true;
  },

  // Put an item on the floor, merging with a stack of the same thing already on that
  // tile instead of leaving two piles that look like one (a 2001 fix of theirs).
  dropToGround(id, qty, x, z, layer, until) {
    if (ITEMS[id].stack) {
      const same = this.ground.find(g => g.id === id && g.x === x && g.z === z && g.layer === layer && !g.noted);
      if (same) { same.qty += qty; same.until = Math.max(same.until, until); return same; }
    }
    const g = { id, qty, x, z, layer, until };
    this.ground.push(g);
    return g;
  },

  killNpc(n, now) {
    const d = NPC_DEFS[n.type];
    if (d.boss) { this.msg('With a final roar, the ' + d.name + ' collapses! You have slain the beast!', 'm-lvl'); Sound.play('levelup'); }
    else this.msg('You have defeated the ' + d.name + '.', 'm-game');
    n.deadUntil = now + (d.respawn || 20) * 1000;
    n.target = false; n.splat = null;
    for (const g of Combat.rollDrops(n.type)) {
      this.dropToGround(g.id, g.qty, n.x, n.z, n.layer, now + 180000);
      if (ITEMS[g.id].value >= 1000) this.msg('The ' + d.name + ' dropped something valuable!', 'm-lvl');
    }
    if (n.type === 'rat' && this.player.quests.rats === 1 && this.player.ratKills < 5) {
      this.player.ratKills++;
      if (this.player.ratKills < 5) this.msg('Giant rats slain: ' + this.player.ratKills + '/5', 'm-quest');
      else this.msg('You have dealt with the rats! Return to the shopkeeper.', 'm-quest');
    }
    if (n.type === 'grukk' && this.player.quests.giants === 2) {
      this.player.quests.giants = 3;
      this.msg('Grukk is slain and the drumming falls silent! Return to Chief Morrow with the totem.', 'm-quest');
      UI.renderQuests();
    }
    if (n.type === 'pen_goblin') {
      if (this._lastAttackType === 'ranged') this.player.penRangedKills = (this.player.penRangedKills || 0) + 1;
      else if (this._lastAttackType === 'magic') this.player.penMagicKills = (this.player.penMagicKills || 0) + 1;
    }
    if (n.type === 'tallyman' && this.player.quests.souls === 5) {
      this.player.quests.souls = 6;
      this.msg('The Tallyman comes apart mid-count. Above you, all four bells ring at once, untouched.', 'm-lvl');
      this.msg('Return to Warden Halloran at the gatehouse.', 'm-quest');
      UI.renderQuests();
    }
  },

  // Nothing may step onto the tile the player occupies. Every NPC movement path has to
  // go through this — the chase code guarded it, but wandering, walking home and
  // respawning did not, which is how you ended up trading blows inside a goblin.
  npcCanStep(n, x, z, px, pz) {
    if (World.blocked(n.layer, x, z)) return false;
    return !(n.layer === this.player.layer && x === px && z === pz);
  },
  // catch-all: if something HAS ended up sharing your square (an old save, a respawn on
  // top of you, you walking onto it), ease it off to a free neighbour rather than
  // leaving you overlapped — combat never separates you on its own, since you're
  // already within reach and so neither side ever repaths.
  separateNpc(n, px, pz) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = n.x + dx, z = n.z + dz;
      if (this.npcCanStep(n, x, z, px, pz)) { n.x = x; n.z = z; return true; }
    }
    return false;
  },

  tickNpcs(now) {
    const P = this.player, px = Math.floor(P.x), pz = Math.floor(P.z);
    const myLevel = this.combatLevel();          // decides who still bothers with you
    for (const n of this.npcs) {
      const d = NPC_DEFS[n.type];
      if (n.deadUntil) {
        if (now > n.deadUntil) {
          n.deadUntil = 0; n.hits = n.maxHits; n.sap = null;   // curses lift when it comes back
          n.x = n.hx; n.z = n.hz; n.fx = n.x + 0.5; n.fz = n.z + 0.5;
          if (n.layer === P.layer && n.x === px && n.z === pz) this.separateNpc(n, px, pz); // respawned on top of you
        }
        continue;
      }
      if (n.layer === P.layer && n.x === px && n.z === pz) this.separateNpc(n, px, pz);
      const sameLayer = n.layer === P.layer;
      const dist = sameLayer ? Math.max(Math.abs(n.x - px), Math.abs(n.z - pz)) : 999;
      // leash: how far a monster will stray from where it spawned. Without this an
      // aggressive NPC ratchets after you forever — re-aggroing every time you come
      // back inside its aggro range — and ends up standing in the town bank.
      const leash = this.npcLeash(n.type);
      const home = Math.max(Math.abs(n.x - n.hx), Math.abs(n.z - n.hz));
      if (!n.target && sameLayer && dist <= d.aggro && home < leash &&
          Combat.stillAggressive(n.type, myLevel)) n.target = true;
      // Square up to whoever you're fighting. It holds whether the monster aggroed you
      // or you opened on it — a passive cow still turns to face the axe. Out of the
      // fight the lock clears and the renderer goes back to facing along movement.
      const reach = d.ranged ? (d.maxRange || 1) : 1;
      const fighting = sameLayer && dist <= reach &&
        (n.target || (P.action && P.action.type === 'attack' && P.action.npc === n));
      if (fighting) { n.faceX = P.x; n.faceZ = P.z; } else n.faceX = null;
      if (n.target) {
        if (!sameLayer || dist > 12 || home >= leash) { n.target = false; n.faceX = null; continue; }
        const canBreathe = d.ranged && dist > 1 && dist <= d.maxRange;
        if (dist <= 1 || canBreathe) {
          if (this._ticks >= (n.nextAtkTick || 0)) {   // the enemy only strikes on its own attack-speed timer
            n.nextAtkTick = this._ticks + this.npcSpeed(n.type);
            // tell the renderer to play a strike; kind picks the motion, same as the player's
            n.swingUntil = now + 350;
            n.swingKind = canBreathe ? 'ranged' : (d.cstyle === 'magic' ? 'magic' : 'melee');
            const eq = this.equipBonus();
            const t = this.triMult(d.cstyle || 'melee', this.playerArmourClass()); // your armour class vs its attack style
            let dmg = this.rollHit(this.npcStat(n, 'att') * t, this.npcStat(n, 'str'), this.effLevel('defense') + eq.armour);
            // a protection prayer turns the blow aside entirely — it still swings, it
            // just cannot land. This is why flicking one is worth the click.
            const style = canBreathe ? 'ranged' : (d.cstyle || 'melee');
            if (dmg > 0 && this.protectedFrom(style)) { dmg = 0; n.blocked = now + 900; }
            if (canBreathe) {
              this.projectiles.push({ fx: n.fx, fz: n.fz, tx: P.x, tz: P.z, t0: now, dur: 400, color: '#ff5a1e', layer: n.layer });
              this.msg('The dragon breathes fire at you!', 'm-red');
            }
            P.splat = { v: dmg, until: now + 900 };
            P.showHpUntil = now + 5000;
            n.showHpUntil = now + 5000;
            Sound.play(dmg > 0 ? 'hit' : 'miss');
            // A swing at you ends the conversation. While the dialogue box is up every
            // world click is swallowed to advance it, so being talked at while something
            // hits you means you cannot flee, eat or fight back — you just stand there.
            if (UI.dialogueOpen) {
              UI.closeDialogue();
              this.msg('You are under attack!', 'm-red');
            }
            if (dmg > 0) {
              P.curHits -= dmg;
              UI.renderStats();
              if (P.curHits <= 0) { this.die(); return; }
            }
            // auto-retaliate: fight back if we're not already attacking something
            if (this.autoRetaliate && d.attackable) {
              const cur = P.action;
              const busy = cur && cur.type === 'attack' && cur.npc && !cur.npc.deadUntil && cur.npc.layer === P.layer;
              if (!busy) this.setAction({ type: 'attack', npc: n });
            }
          }
        } else {
          const path = World.findPath(n.layer, n.x, n.z, px, pz);
          if (path && path.length && !(path[0].x === px && path[0].z === pz)) { n.x = path[0].x; n.z = path[0].z; } // never stand on the player
        }
      } else if (home > (d.wander || 0)) {
        // gave up the chase (or drifted) — head back to its own patch
        const path = World.findPath(n.layer, n.x, n.z, n.hx, n.hz);
        if (path && path.length) {
          if (this.npcCanStep(n, path[0].x, path[0].z, px, pz)) { n.x = path[0].x; n.z = path[0].z; }
        } else if (this.npcCanStep(n, n.hx, n.hz, px, pz)) { n.x = n.hx; n.z = n.hz; }
      } else if (d.wander && Math.random() < 0.2) {
        const nx = n.x + ((Math.random() * 3 | 0) - 1), nz = n.z + ((Math.random() * 3 | 0) - 1);
        if (Math.abs(nx - n.hx) <= d.wander && Math.abs(nz - n.hz) <= d.wander && this.npcCanStep(n, nx, nz, px, pz)) { n.x = nx; n.z = nz; }
      }
      // ambient chatter: townsfolk occasionally speak, shown as a floating bubble.
      // The dead of Mourncross chatter too — you just can't parse it without the amulet.
      if (d.chatter && !n.deadUntil && n.layer === P.layer && Math.random() < 0.012) {
        const near = Math.abs(n.x - px) < 16 && Math.abs(n.z - pz) < 16;
        const text = (d.ghostly && !this.canHearGhosts()) ? this.ghostBabble() : d.chatter[Math.random() * d.chatter.length | 0];
        if (near) n.bubble = { text, until: now + 3500 };
      }
    }
  },

  die() {
    const P = this.player, now = performance.now();
    this.msg('Oh dear! You are dead...', 'm-red');
    // RSC-style death: keep your 3 most valuable items (and quest items), drop the rest
    const dx = Math.floor(P.x), dz = Math.floor(P.z), dl = P.layer;
    // rank everything held — pack AND worn gear — keep the 3 best (+ quest items), drop the rest
    const held = P.inv.map((it, idx) => ({ it, idx })).filter(o => o.it);
    for (const slot in P.worn) if (P.worn[slot]) held.push({ it: P.worn[slot], slot });
    const ranked = held.slice().sort((a, b) => (ITEMS[b.it.id].value || 0) * (b.it.qty || 1) - (ITEMS[a.it.id].value || 0) * (a.it.qty || 1));
    let kept = 0; const lose = [];
    for (const o of ranked) {
      if (ITEMS[o.it.id].quest || kept < 3) kept++;
      else lose.push(o);
    }
    if (lose.length) {
      for (const o of lose) {
        this.ground.push({ id: o.it.id, qty: o.it.qty || 1, x: dx, z: dz, layer: dl, until: now + 180000 });
        if (o.slot) P.worn[o.slot] = null; else P.inv[o.idx] = null; // clear from wherever it was
      }
      this.msg('You keep your 3 most valuable items. The rest lies where you fell...', 'm-red');
    }
    P.curHits = this.level('hits');
    P.x = World.SPAWN.x + 0.5; P.z = World.SPAWN.z + 0.5; P.layer = 0;
    P.path = []; P.action = null; P.prayersOn = {};
    for (const n of this.npcs) n.target = false;
    UI.renderInventory(); UI.renderStats(); UI.renderPrayers();
  },

  // ---------- xp / inventory ----------
  addXp(sk, amt) {
    const P = this.player, before = this.level(sk);
    P.xp[sk] = (P.xp[sk] || 0) + amt;
    const after = this.level(sk);
    this.addFloater('+' + Math.round(amt) + ' ' + sk, '#ffe97a');
    if (after > before) {
      const name = SKILLS.find(s => s.id === sk).name;
      this.msg('Well done! You just advanced a ' + name.toLowerCase() + ' level! (' + after + ')', 'm-lvl');
      Sound.play('levelup');
      UI.levelBanner(name, after);
      if (sk === 'hits') P.curHits++;
      if (sk === 'prayer') P.curPrayer++;
    }
    UI.renderStats();
    if (sk === 'prayer') UI.renderPrayers();
    if (sk === 'magic') UI.renderMagic();
  },

  addFloater(text, color) {
    this.floaters.push({ text, color, x: this.player.x + (Math.random() - 0.5) * 0.5, z: this.player.z + (Math.random() - 0.5) * 0.3, t0: performance.now() + this.floaters.length * 40 });
    if (this.floaters.length > 12) this.floaters.shift();
  },

  depositAll() {
    if (this.netMode) { Net.bankDepositAll(); return; }   // one intent, not 30
    const P = this.player;
    for (let i = 0; i < P.inv.length; i++) { const it = P.inv[i]; if (!it) continue; it.noted ? this.depositSlot(i, it.qty) : this.deposit(it.id, it.qty); }
    UI.renderBank();
  },

  // fixed 30-slot inventory helpers (empty slots are null, so items don't shuffle)
  normInv(arr) {
    const out = new Array(30).fill(null);
    if (Array.isArray(arr)) for (let i = 0; i < arr.length && i < 30; i++) out[i] = arr[i] || null;
    return out;
  },
  emptySlot() { const inv = this.player.inv; for (let i = 0; i < inv.length; i++) if (!inv[i]) return i; return -1; },

  // NB: bank-note stacks (i.noted) are inert placeholders — excluded from "real item" queries
  hasItem(id) { return this.player.inv.some(i => i && i.id === id && !i.noted); },
  countItem(id) { return this.player.inv.reduce((n, i) => n + (i && i.id === id && !i.noted ? (i.qty || 1) : 0), 0); },

  addItem(id, qty = 1) {
    const P = this.player, def = ITEMS[id];
    if (def.stack) {
      const it = P.inv.find(i => i && i.id === id && !i.noted);
      if (it) { it.qty += qty; UI.renderInventory(); return true; }
      const s = this.emptySlot();
      if (s < 0) { this.msg("You can't carry any more!", 'm-red'); return false; }
      P.inv[s] = { id, qty };
    } else {
      for (let i = 0; i < qty; i++) {
        const s = this.emptySlot();
        if (s < 0) { this.msg("You can't carry any more!", 'm-red'); UI.renderInventory(); return false; }
        P.inv[s] = { id, qty: 1 };
      }
    }
    UI.renderInventory();
    return true;
  },

  // add a bank-note stack (a stackable placeholder; many fit one slot). Returns false if the pack is full.
  addNote(id, qty = 1) {
    const P = this.player;
    const it = P.inv.find(i => i && i.id === id && i.noted);
    if (it) { it.qty += qty; UI.renderInventory(); return true; }
    const s = this.emptySlot();
    if (s < 0) { this.msg("You can't carry any more!", 'm-red'); return false; }
    P.inv[s] = { id, qty, noted: true };
    UI.renderInventory();
    return true;
  },

  // deposit qty from ONE inventory slot (handles noted stacks, which countItem/removeItem ignore)
  depositSlot(i, qty) {
    const P = this.player, it = P.inv[i];
    if (!it) return;
    if (this.netMode) { Net.bankDepositSlot(i, qty); return; }
    qty = Math.min(qty, it.qty || 1);
    if (qty <= 0) return;
    if ((it.qty || 1) > qty) it.qty -= qty; else { P.inv[i] = null; if (this.selectedSlot === i) this.selectedSlot = -1; }
    const b = this.player.bank.find(x => x.id === it.id);
    if (b) b.qty += qty; else this.player.bank.push({ id: it.id, qty, tab: this.bankDepositTab() });
    UI.renderBank(); UI.renderStats(); UI.renderInventory();
  },

  removeItem(id, qty = 1) {
    const P = this.player;
    let left = qty;
    for (let i = P.inv.length - 1; i >= 0 && left > 0; i--) {
      const it = P.inv[i];
      if (!it || it.id !== id || it.noted) continue; // never consume from a bank-note stack
      if (it.qty > left) { it.qty -= left; left = 0; }
      else { left -= it.qty; P.inv[i] = null; if (this.selectedSlot === i) this.selectedSlot = -1; }
    }
    UI.renderInventory();
  },

  // equip the inventory item at slot i (moving it out of the pack into player.worn)
  wield(i) {
    if (this.netMode) { const it = this.player.inv[i]; if (it && ITEMS[it.id].slot) Net.wield(i); return; } // server is authoritative
    const P = this.player, it = P.inv[i], def = ITEMS[it.id];
    if (!it || !def.slot) return;
    // A bow is drawn with Ranged and a staff is wielded with Magic — gating both on
    // Attack meant a pure ranger could not pick up an oak longbow.
    if (def.slot === 'weapon' && def.wield) {
      const sk = def.wieldSkill || 'attack';
      if (this.level(sk) < def.wield) {
        this.msg('You need a ' + SKILL_NAME[sk] + ' level of ' + def.wield + ' to wield the ' + def.name + '.', 'm-red'); return;
      }
    }
    if (def.slot !== 'weapon' && def.defReq && this.level('defense') < def.defReq) {
      this.msg('You need a Defense level of ' + def.defReq + ' to wear the ' + def.name + '.', 'm-red'); return;
    }
    // ranged and magic armour need their own skill as well as Defence
    for (const sk in (def.reqs || {})) {
      if (this.level(sk) < def.reqs[sk]) {
        this.msg('You need a ' + SKILL_NAME[sk] + ' level of ' + def.reqs[sk] + ' to wear the ' + def.name + '.', 'm-red'); return;
      }
    }
    const slot = def.slot, w = P.worn;
    // two-handed weapons and shields can't be worn together — the other one must come off
    const extras = []; // gear that has to be unequipped into the pack (besides a same-slot swap)
    if (def.twoHand && w.shield) extras.push('shield');
    if (slot === 'shield' && w.weapon && ITEMS[w.weapon.id].twoHand) extras.push('weapon');
    // space check: freeing slot i gives one slot; a same-slot swap reuses it; extras need the rest
    const empties = P.inv.reduce((n, x) => n + (x ? 0 : 1), 0);
    if (extras.length > empties + 1 - (w[slot] ? 1 : 0)) { this.msg('You need more inventory space to equip that.', 'm-red'); return; }
    // perform: vacate the pack slot, swap any same-slot gear back into it, stow extras
    P.inv[i] = null;
    const swap = w[slot] || null;
    w[slot] = it;
    if (swap) P.inv[i] = swap;
    for (const es of extras) { const g = w[es]; w[es] = null; P.inv[this.emptySlot()] = g; this.msg('You stow the ' + ITEMS[g.id].name + ' to free your hands.', 'm-game'); }
    this.msg((slot === 'weapon' ? 'You wield the ' : 'You put on the ') + def.name + '.', 'm-game');
    if (this.selectedSlot === i) this.selectedSlot = -1;
    UI.renderInventory(); UI.renderEquipment(); UI.renderStats();
  },

  // take a worn item off, returning it to the pack (needs a free slot)
  unequip(slot) {
    if (this.netMode) { Net.unequip(slot); return; } // server is authoritative
    const P = this.player, it = P.worn[slot];
    if (!it) return;
    const s = this.emptySlot();
    if (s < 0) { this.msg('Your inventory is full — make room before unequipping.', 'm-red'); return; }
    P.worn[slot] = null; P.inv[s] = it;
    this.msg('You unequip the ' + ITEMS[it.id].name + '.', 'm-game');
    UI.renderInventory(); UI.renderEquipment(); UI.renderStats();
  },

  // drag an item to another slot (RS-style rearranging); dropping on a filled slot swaps
  swapSlots(i, j) {
    if (i === j) return;
    const P = this.player, t = P.inv[i]; P.inv[i] = P.inv[j]; P.inv[j] = t;
    if (this.selectedSlot === i) this.selectedSlot = j; else if (this.selectedSlot === j) this.selectedSlot = i;
    UI.renderInventory();
  },

  invClick(i) {
    const P = this.player, it = P.inv[i];
    if (!it) return;
    // With the bank open, a click deposits — in both modes. This has to come before
    // the netMode branch below, or clicking an item at the booth would wield it.
    if (UI.modal === 'bank') {
      if (it.noted) this.depositSlot(i, this.bankResolveQty(it.qty));
      else this.deposit(it.id, this.bankResolveQty(this.countItem(it.id)));
      return;
    }
    if (this.netMode) {
      const def = ITEMS[it.id];
      if (it.noted) this.msg('This is a bank note. Take it to a bank to reclaim the item.', 'm-game');
      else if (def.slot) Net.wield(i);
      else if (def.heal) Net.eat(i);
      else this.msg(def.name + ' — right-click to drop. Crafting and questing are singleplayer-only for now.', 'm-game');
      return;
    }
    if (UI.modal === 'shop') { if (it.noted) { this.msg('Un-note that at a bank before selling it.', 'm-game'); return; } this.sell(it.id, 1); return; }
    if (it.noted) { this.msg('This is a bank note. Take it to a bank to reclaim the item.', 'm-game'); return; }
    // a utility spell armed in the spellbook fires at whatever you click next
    if (this.selectedSpell) {
      const sp = SPELLS.find(s => s.id === this.selectedSpell);
      if (sp && ['enchant', 'alch', 'smelt'].includes(sp.kind)) { this.castOnItem(sp.id, i); return; }
    }
    if (ITEMS[it.id].doses) { this.drinkPotion(i); return; }
    if (/^grimy_/.test(it.id)) { this.cleanHerb(it.id); UI.renderInventory(); UI.renderStats(); return; }
    if (this.selectedSlot === i) { this.selectedSlot = -1; UI.renderInventory(); return; }
    if (this.selectedSlot >= 0) {
      const j = this.selectedSlot;
      this.selectedSlot = -1;
      this.useItemOnItem(j, i);
      UI.renderInventory();
      return;
    }
    const def = ITEMS[it.id];
    if (it.id === 'ava_notes') this.readNotes();
    else if (def.slot) this.wield(i);
    else if (def.heal) this.eat(i);
    else if (def.bury) this.bury(i);
    else if (def.prayRestore) this.crushEssence(i);
    else { this.selectedSlot = i; UI.renderInventory(); }
  },

  invOptions(i) {
    const it = this.player.inv[i];
    if (!it) return [];
    const def = ITEMS[it.id], opts = [];
    // The bank branch comes first in both modes: deposit()/depositSlot() know how to
    // route themselves, so these options are identical online and off.
    if (UI.modal !== 'bank' && this.netMode) {
      if (it.noted) {
        opts.push({ label: 'Drop ' + def.name + ' note', cb: () => Net.drop(i) });
        opts.push({ label: 'Examine ' + def.name, cb: () => this.msg('A bank note worth ' + it.qty + ' × ' + def.name.toLowerCase() + '. Reclaim it at a bank.', 'm-game') });
        opts.push({ label: 'Cancel', cb: () => {} });
        return opts;
      }
      if (def.slot) opts.push({ label: (def.slot === 'weapon' ? 'Wield ' : 'Wear ') + def.name, cb: () => Net.wield(i) });
      if (def.heal) opts.push({ label: 'Eat ' + def.name, cb: () => Net.eat(i) });
      opts.push({ label: 'Drop ' + def.name, cb: () => Net.drop(i) });
      opts.push({ label: 'Examine ' + def.name, cb: () => this.msg(def.examine, 'm-game') });
      opts.push({ label: 'Cancel', cb: () => {} });
      return opts;
    }
    if (UI.modal === 'bank') {
      if (it.noted) { // a note deposits straight back into the bank as the real item
        opts.push({ label: 'Deposit 1', cb: () => this.depositSlot(i, 1) });
        opts.push({ label: 'Deposit X', cb: () => { const n = parseInt(prompt('Deposit how many?', this.bankXVal), 10); if (n > 0) { this.bankXVal = n; this.depositSlot(i, n); } } });
        opts.push({ label: 'Deposit All', cb: () => this.depositSlot(i, it.qty) });
        opts.push({ label: 'Cancel', cb: () => {} });
        return opts;
      }
      opts.push({ label: 'Deposit 1', cb: () => this.deposit(it.id, 1) });
      opts.push({ label: 'Deposit 10', cb: () => this.deposit(it.id, 10) });
      opts.push({ label: 'Deposit X', cb: () => { const n = parseInt(prompt('Deposit how many?', this.bankXVal), 10); if (n > 0) { this.bankXVal = n; this.deposit(it.id, n); } } });
      opts.push({ label: 'Deposit All', cb: () => this.deposit(it.id, this.countItem(it.id)) });
      opts.push({ label: 'Cancel', cb: () => {} });
      return opts;
    }
    if (it.noted) { // bank notes can only be dropped or examined outside a bank
      opts.push({ label: 'Drop ' + def.name + ' note', cb: () => this.drop(i) });
      opts.push({ label: 'Examine ' + def.name, cb: () => this.msg('A bank note worth ' + it.qty + ' × ' + def.name.toLowerCase() + '. Reclaim it at a bank.', 'm-game') });
      opts.push({ label: 'Cancel', cb: () => {} });
      return opts;
    }
    if (UI.modal === 'shop') {
      const gp = Math.floor((def.value || 0) * 0.6);
      opts.push({ label: 'Sell 1 (' + gp + 'gp)', cb: () => this.sell(it.id, 1) });
      opts.push({ label: 'Sell 5', cb: () => this.sell(it.id, 5) });
      opts.push({ label: 'Cancel', cb: () => {} });
      return opts;
    }
    if (it.id === 'ava_notes') opts.push({ label: 'Read ' + def.name, cb: () => this.readNotes() });
    if (def.slot) opts.push({ label: (def.slot === 'weapon' ? 'Wield ' : 'Wear ') + def.name, cb: () => this.wield(i) });
    if (def.heal) opts.push({ label: 'Eat ' + def.name, cb: () => this.eat(i) });
    if (def.prayRestore) opts.push({ label: 'Crush ' + def.name, cb: () => this.crushEssence(i) });
    if (it.id === 'vial') opts.push({ label: 'Fill Vial', cb: () => { this.fillVial(); UI.renderInventory(); } });
    if (/^grimy_/.test(it.id)) opts.push({ label: 'Clean ' + def.name, cb: () => { this.cleanHerb(it.id); UI.renderInventory(); UI.renderStats(); } });
    if (def.doses) opts.push({ label: 'Drink ' + def.name, cb: () => this.drinkPotion(i) });
    if (GEM_CUTS[it.id] && this.hasItem('chisel')) {
      opts.push({ label: 'Cut ' + def.name, cb: () => this.cutGem(it.id) });
      const n = this.canMake('gem', it.id);
      if (n > 1) opts.push({ label: 'Cut all ' + n + ' ' + def.name, cb: () => this.batch('cut %n gems', n, s => this.cutGem(it.id, s)) });
    }
    if (def.bury) opts.push({ label: 'Bury ' + def.name, cb: () => this.bury(i) });
    opts.push({ label: 'Use ' + def.name, cb: () => { this.selectedSlot = i; UI.renderInventory(); } });
    opts.push({ label: 'Drop ' + def.name, cb: () => this.drop(i) });
    opts.push({ label: 'Examine ' + def.name, cb: () => this.msg(def.examine, 'm-game') });
    opts.push({ label: 'Cancel', cb: () => {} });
    return opts;
  },

  eat(i) {
    const P = this.player, def = ITEMS[P.inv[i].id];
    P.inv[i] = null;
    if (this.selectedSlot === i) this.selectedSlot = -1;
    P.curHits = Math.min(this.level('hits'), P.curHits + def.heal);
    this.msg('You eat the ' + def.name.toLowerCase() + '. It heals some health.', 'm-game');
    Sound.play('eat');
    UI.renderInventory(); UI.renderStats();
  },

  // wraith essence is the only prayer restore in the game — it is why the flats are
  // worth farming even after the quest is behind you
  crushEssence(i) {
    const P = this.player, def = ITEMS[P.inv[i].id];
    const max = this.level('prayer');
    if (P.curPrayer >= max) { this.msg('Your prayer is already full.', 'm-game'); return; }
    P.inv[i] = null;
    if (this.selectedSlot === i) this.selectedSlot = -1;
    P.curPrayer = Math.min(max, P.curPrayer + def.prayRestore);
    P.prayCounter = 0;
    this.msg('You crush the essence. Something cold goes through you, and your prayer steadies.', 'm-game');
    Sound.play('pray');
    UI.renderInventory(); UI.renderPrayers(); UI.renderStats();
  },

  bury(i) {
    const P = this.player, def = ITEMS[P.inv[i].id];
    P.inv[i] = null;
    if (this.selectedSlot === i) this.selectedSlot = -1;
    this.addXp('prayer', def.prayerXp || 3.75);
    this.msg('You dig a hole and bury the ' + def.name.toLowerCase() + '.', 'm-game');
    Sound.play('pray');
    UI.renderInventory();
  },

  drop(i) {
    const it0 = this.player.inv[i];
    if (it0 && !it0.noted && (ITEMS[it0.id].value || 0) >= this.VALUABLE) {
      return this.confirmDestroy(it0.id, 'Drop', () => { if (this.player.inv[i] === it0) this.dropNow(i); });
    }
    return this.dropNow(i);
  },
  dropNow(i) {
    const P = this.player, it = P.inv[i];
    P.inv[i] = null;
    if (this.selectedSlot === i) this.selectedSlot = -1;
    this.ground.push({ id: it.id, qty: it.qty, noted: it.noted, x: Math.floor(P.x), z: Math.floor(P.z), layer: P.layer, until: performance.now() + 180000 });
    UI.renderInventory(); UI.renderStats();
  },

  useItemOnItem(i, j) {
    const a = this.player.inv[i], b = this.player.inv[j];
    if (!a || !b) return;
    const ids = [a.id, b.id];
    const logId = ids.find(id => ITEMS[id].fmXp);
    const knifeLog = ids.includes('knife') && ids.find(id => FLETCH_KNIFE[id]);
    // herb into a vial of water -> unfinished potion
    const herbId = ids.find(id => HERB_BY_ID[id]);
    if (ids.includes('vial_of_water') && herbId && UNF_BY_HERB[herbId]) return this.mixUnf(herbId);
    // unfinished potion + its secondary -> the finished thing
    const unfId = ids.find(id => POTION_BY_UNF[id]);
    if (unfId) { const rec = POTION_BY_UNF[unfId].find(r => ids.includes(r.sec)); if (rec) return this.mixPotion(rec); }
    // pestle and mortar grinds a secondary out of something
    if (ids.includes('pestle')) { const g = ids.find(id => GRINDABLES[id]); if (g) return this.grindSecondary(g); }
    const stringBow = ids.includes('bowstring') && ids.find(id => FLETCH_STRING[id]);
    const featherShaft = ids.includes('feather') && ids.includes('arrow_shafts');
    const headArrow = ids.find(id => FLETCH_ARROW[id]);
    if (ids.includes('tinderbox') && logId) this.lightFire(logId);
    else if (knifeLog) this.fletchMenu(knifeLog);
    else if (stringBow) this.stringBow(stringBow);
    else if (featherShaft) this.makeHeadless();
    else if (headArrow && ids.includes('headless_arrows')) this.makeArrows(headArrow);
    else if (ids.includes('needle') && ids.includes('leather')) this.craftLeatherMenu();
    else if (ids.includes('chisel') && ids.find(id => GEM_CUTS[id])) this.cutGem(ids.find(id => GEM_CUTS[id]));
    else this.msg('Nothing interesting happens.', 'm-game');
  },

  // A vial fills anywhere there is water to dip it in.
  fillVial(silent) {
    const P = this.player;
    if (!this.hasItem('vial')) return false;
    const px = Math.floor(P.x), pz = Math.floor(P.z);
    let near = false;
    for (let dx = -1; dx <= 1 && !near; dx++) for (let dz = -1; dz <= 1; dz++)
      if (World.tileAt(P.layer, px + dx, pz + dz) === 'water') { near = true; break; }
    if (!near) { if (!silent) this.msg('You need to be beside water to fill that.', 'm-red'); return false; }
    this.removeItem('vial', 1);
    if (!this.addItem('vial_of_water', 1)) { this.addItem('vial', 1); return false; }
    if (!silent) this.msg('You fill the vial.', 'm-game');
    return true;
  },
  // herb patches at the druid circle regrow, so the skill has a floor that is not combat
  pickHerb(sn) {
    if (sn.pickedUntil && this._now < sn.pickedUntil) { this.msg('This patch has been stripped. Give it time.', 'm-game'); return; }
    const g = Combat.rollPick({ chance: 1, table: 'herb' });
    if (!g) return;
    if (!this.addItem(g.id, g.qty)) return;
    sn.pickedUntil = this._now + 45000;
    this.addXp('herblore', 4);
    this.msg('You pick a ' + ITEMS[g.id].name.toLowerCase() + '.', 'm-game');
  },

  // ---------- Herblore ----------
  // Cleaning is the first thing you do with a herb and the cheapest xp in the skill.
  cleanHerb(id, silent) {
    const h = HERB_BY_ID[id.replace('grimy_', '')];
    if (!h) return false;
    if (this.level('herblore') < h.lvl) { if (!silent) this.msg('You need a Herblore level of ' + h.lvl + ' to clean that.', 'm-red'); return false; }
    if (!this.hasItem('grimy_' + h.id)) return false;
    this.removeItem('grimy_' + h.id, 1);
    if (!this.addItem(h.id, 1)) { this.addItem('grimy_' + h.id, 1); return false; }
    this.addXp('herblore', h.xp);
    if (!silent) this.msg('You clean the dirt from the ' + ITEMS[h.id].name.toLowerCase() + '.', 'm-game');
    return true;
  },
  mixUnf(herbId, silent) {
    const unf = UNF_BY_HERB[herbId];
    const rec = POTIONS.find(r => r.id + '_unf' === unf);
    if (this.level('herblore') < rec.lvl) { if (!silent) this.msg('You need a Herblore level of ' + rec.lvl + ' for that mixture.', 'm-red'); return false; }
    if (!this.hasItem(herbId) || !this.hasItem('vial_of_water')) return false;
    this.removeItem(herbId, 1); this.removeItem('vial_of_water', 1);
    if (!this.addItem(unf, 1)) { this.addItem(herbId, 1); this.addItem('vial_of_water', 1); return false; }
    if (!silent) this.msg('You grind the herb into the water. It clouds over.', 'm-game');
    return true;
  },
  mixPotion(rec, silent) {
    if (this.level('herblore') < rec.lvl) { if (!silent) this.msg('You need a Herblore level of ' + rec.lvl + ' to finish that.', 'm-red'); return false; }
    const unf = rec.id + '_unf';
    if (!this.hasItem(unf) || !this.hasItem(rec.sec)) return false;
    this.removeItem(unf, 1); this.removeItem(rec.sec, 1);
    if (!this.addItem(rec.id, 1)) { this.addItem(unf, 1); this.addItem(rec.sec, 1); return false; }
    this.addXp('herblore', rec.xp);
    if (!silent) { this.msg('You mix the ' + ITEMS[rec.sec].name.toLowerCase() + ' in. You have a ' + ITEMS[rec.id].name.toLowerCase() + '.', 'm-lvl'); Sound.play('success'); }
    return true;
  },
  grindSecondary(id, silent) {
    if (!this.hasItem('pestle') || !this.hasItem(id)) return false;
    this.removeItem(id, 1);
    if (!this.addItem(GRINDABLES[id], 1)) { this.addItem(id, 1); return false; }
    if (!silent) this.msg('You grind it to a powder.', 'm-game');
    return true;
  },

  // The ruin is a one-way arch into the essence mine and back out again. Both ends sit
  // at the same x/z on different layers, so it reuses the ladder machinery.
  RIFT: { x: 158, z: 40 },
  enterRift() {
    const P = this.player;
    if ((P.quests.runemyst || 0) < 4) {
      this.msg('You put a hand into the arch and nothing happens. You are missing something.', 'm-red');
      return;
    }
    if (P.layer === 1 && Math.abs(P.x - this.RIFT.x) < 12) {
      P.layer = 0; P.x = 38.5; P.z = 145.5;
      this.msg('The ruin spits you back out onto the moor.', 'm-game');
    } else {
      P.layer = 1; P.x = this.RIFT.x + 0.5; P.z = this.RIFT.z + 0.5;
      this.msg('The arch takes you somewhere with no sky.', 'm-quest');
    }
    P.path = []; P.action = null;
    Sound.play('climb');
  },

  // ---------- Runecraft ----------
  // An altar turns essence into runes. The talisman is the key and is never spent.
  craftRunes(alt, silent) {
    const P = this.player;
    if (this.level('runecraft') < alt.lvl) { if (!silent) this.msg('You need a Runecraft level of ' + alt.lvl + ' to use this altar.', 'm-red'); return false; }
    if (!this.hasItem(alt.rune + '_talisman')) { if (!silent) this.msg('The altar will not open without a ' + alt.rune + ' talisman.', 'm-red'); return false; }
    const ess = alt.pure ? 'pure_essence' : 'rune_essence';
    const have = this.countItem(ess);
    if (!have) { if (!silent) this.msg('You have no ' + ITEMS[ess].name.toLowerCase() + '.', 'm-red'); return false; }
    const per = runeYield(alt, this.level('runecraft'));
    this.removeItem(ess, have);
    this.addItem(alt.rune + '_rune', have * per);
    this.addXp('runecraft', alt.xp * have);
    if (!silent) {
      this.msg('You bind ' + have + ' essence into ' + (have * per) + ' ' + alt.rune + ' runes.', 'm-lvl');
      Sound.play('success');
    }
    UI.renderInventory(); UI.renderStats();
    return true;
  },

  // ---------- Crafting: needle on leather -> leather armour ----------
  craftLeatherMenu() {
    const avail = CRAFTABLES.filter(r => this.level('crafting') >= r.lvl);
    if (!avail.length) { this.msg('You need a higher Crafting level to work this leather.', 'm-red'); return; }
    const opts = avail.map(r => ({
      label: ITEMS[r.id].name + ' (lvl ' + r.lvl + ', ' +
        [r.leather ? r.leather + ' leather' : null]
          .concat(Object.entries(r.extra || {}).map(([id, q]) => q + ' ' + ITEMS[id].name.toLowerCase()))
          .filter(Boolean).join(' + ') + ')',
      cb: () => {
        const n = this.canMake('leather', r);
        if (n > 1) this.batch('stitch %n ' + ITEMS[r.id].name.toLowerCase() + 's', n, s => this.craftLeather(r, s));
        else this.craftLeather(r);
      }
    }));
    opts.push({ label: 'Cancel', cb: () => {} });
    UI.showMenu(window.innerWidth / 2 - 110, window.innerHeight / 2 - 80, opts);
  },
  craftLeather(r, silent) {
    if (this.level('crafting') < r.lvl) { if (!silent) this.msg('You need a Crafting level of ' + r.lvl + ' for that.', 'm-red'); return false; }
    if (this.countItem('leather') < r.leather) { if (!silent) this.msg('You need ' + r.leather + ' leather for that.', 'm-red'); return false; }
    // dragonhide and studded pieces want materials beyond plain leather
    for (const id in (r.extra || {})) {
      if (this.countItem(id) < r.extra[id]) {
        if (!silent) this.msg('You need ' + r.extra[id] + ' ' + ITEMS[id].name.toLowerCase() + ' for that.', 'm-red');
        return false;
      }
    }
    if (r.leather) this.removeItem('leather', r.leather);
    for (const id in (r.extra || {})) this.removeItem(id, r.extra[id]);
    if (!this.addItem(r.id, 1)) {
      if (r.leather) this.addItem('leather', r.leather);
      for (const id in (r.extra || {})) this.addItem(id, r.extra[id]);
      return false;
    }
    this.addXp('crafting', r.xp);
    if (!silent) {
      this.msg('You stitch the leather into a ' + ITEMS[r.id].name.toLowerCase() + '.', 'm-game');
      Sound.play('woodcut');
    }
    return true;
  },

  lightFire(logId) {
    const P = this.player, now = performance.now();
    if (P.layer !== 0) { this.msg("You can't light a fire down here.", 'm-red'); return; }
    const x = Math.floor(P.x), z = Math.floor(P.z), k = World.key(x, z);
    const lay = World.L[0];
    if (lay.scenery.has(k) || lay.tile[x][z] === 'water' || lay.tile[x][z] === 'floor') { this.msg("You can't light a fire here.", 'm-red'); return; }
    // heavier logs need a real Firemaking level before they will take at all
    const need = ITEMS[logId].fmLvl || 1;
    if (this.level('firemaking') < need) {
      this.msg('You need a Firemaking level of ' + need + ' to get ' + ITEMS[logId].name.toLowerCase() + ' alight.', 'm-red');
      return;
    }
    if (Math.random() < Math.min(0.95, 0.4 + this.level('firemaking') * 0.03)) {
      this.removeItem(logId, 1);
      // a fire burns down and leaves ashes behind, so firemaking has an end product
      lay.scenery.set(k, { type: 'fire', x, z, respawnAt: 0, expireAt: now + 60000, ashLayer: 0 });
      this.addXp('firemaking', ITEMS[logId].fmXp || 40);
      this.player.firesLit = (this.player.firesLit || 0) + 1;
      this.msg('The fire catches and the logs begin to burn.', 'm-game');
      Sound.play('fire');
      if (!World.blocked(0, x - 1, z)) P.path = [{ x: x - 1, z }];
    } else {
      this.msg('You attempt to light the fire but fail.', 'm-game');
    }
  },

  // ---------- fletching ----------
  fletchMenu(logId) {
    const opts = FLETCH_KNIFE[logId].map(r => ({
      label: (r.qty > 1 ? r.qty + ' ' : '') + ITEMS[r.id].name + ' (lvl ' + r.lvl + ')',
      cb: () => this.fletchLog(logId, r)
    }));
    opts.push({ label: 'Cancel', cb: () => {} });
    UI.showMenu(window.innerWidth / 2 - 100, window.innerHeight / 2 - 70, opts);
  },
  fletchLog(logId, r) {
    if (this.level('fletching') < r.lvl) { this.msg('You need a Fletching level of ' + r.lvl + ' to make that.', 'm-red'); return; }
    if (!this.hasItem(logId)) { this.msg('You have run out of ' + ITEMS[logId].name.toLowerCase() + '.', 'm-game'); return; }
    this.removeItem(logId, 1);
    this.addItem(r.id, r.qty);
    this.addXp('fletching', r.xp);
    this.msg('You carefully cut the wood into ' + (r.qty > 1 ? r.qty + ' ' : 'a ') + ITEMS[r.id].name.toLowerCase() + '.', 'm-game');
    Sound.play('success');
  },
  stringBow(uid) {
    const r = FLETCH_STRING[uid];
    if (this.level('fletching') < r.lvl) { this.msg('You need a Fletching level of ' + r.lvl + ' to string that.', 'm-red'); return; }
    if (!this.hasItem('bowstring')) { this.msg('You need a bow string.', 'm-red'); return; }
    this.removeItem(uid, 1); this.removeItem('bowstring', 1);
    this.addItem(r.id, 1);
    this.addXp('fletching', r.xp);
    this.msg('You add a string to the bow, making a ' + ITEMS[r.id].name.toLowerCase() + '.', 'm-game');
    Sound.play('success');
  },
  makeHeadless() {
    const n = Math.min(15, this.countItem('feather'), this.countItem('arrow_shafts'));
    if (n <= 0) return;
    this.removeItem('feather', n); this.removeItem('arrow_shafts', n);
    this.addItem('headless_arrows', n);
    this.addXp('fletching', 1 * n);
    this.msg('You attach feathers to ' + n + ' arrow shafts.', 'm-game');
    Sound.play('success');
  },
  makeArrows(headId) {
    const r = FLETCH_ARROW[headId];
    if (this.level('fletching') < r.lvl) { this.msg('You need a Fletching level of ' + r.lvl + ' to make those arrows.', 'm-red'); return; }
    const n = Math.min(15, this.countItem(headId), this.countItem('headless_arrows'));
    if (n <= 0) { this.msg('You need headless arrows and arrowheads.', 'm-red'); return; }
    this.removeItem(headId, n); this.removeItem('headless_arrows', n);
    this.addItem(r.id, n);
    this.addXp('fletching', r.xp / 15 * n);
    this.msg('You attach ' + n + ' arrowheads, making ' + n + ' ' + ITEMS[r.id].name.toLowerCase() + '.', 'm-game');
    Sound.play('success');
  },

  useItemOnScenery(slot, s) {
    const it = this.player.inv[slot];
    this.selectedSlot = -1;
    UI.renderInventory();
    if (!it) return;
    const key = World.key(s.x, s.z);
    if ((s.type === 'fire' || s.type === 'range') && COOKABLES[it.id]) this.setAction({ type: 'cook', key, rawId: it.id });
    else if (s.type === 'furnace' && ['copper_ore', 'tin_ore', 'iron_ore', 'coal'].includes(it.id)) this.smeltMenu(key);
    else if (s.type === 'anvil' && it.id.endsWith('_bar')) this.smithMenu(key);
    else if (s.type === 'windmill' && it.id === 'wheat') this.grindFlour();
    else if (s.type === 'farm_patch' && it.id === 'rake') this.rakePatch(s);
    else if (s.type === 'farm_patch' && ITEMS[it.id].seed) this.plantSeed(s, it.id);
    else if (s.type === 'bone_grinder' && ITEMS[it.id].bury) this.grindBones();
    else if (s.type === 'slime_pool' && it.id === 'bucket') this.fillSlime();
    else if (s.type === 'furnace' && it.id === 'marsh_sand') this.smeltPaleBead();
    else if (s.type === 'furnace' && (it.id === 'gold_bar' || it.id === 'silver_bar')) this.jewelleryMenu(key);
    else if (s.type === 'altar' && it.id === 'unblessed_symbol') this.blessSymbol();
    else this.msg('Nothing interesting happens.', 'm-game');
  },

  useItemOnNpc(slot, n) {
    const it = this.player.inv[slot];
    this.selectedSlot = -1; UI.renderInventory();
    if (!it) return;
    if (NPC_DEFS[n.type].milk && it.id === 'bucket') this.milkCow();
    else this.msg('Nothing interesting happens.', 'm-game');
  },

  // ---------- Green Vale Farm ----------
  milkCow() {
    if (!this.hasItem('bucket')) { this.msg('You need an empty bucket to milk a cow.', 'm-red'); return; }
    this.removeItem('bucket', 1);
    this.addItem('bucket_of_milk', 1);
    this.msg('You milk the cow, filling your bucket.', 'm-game');
    Sound.play('eat');
  },
  searchCoop() {
    if (Math.random() < 0.5) { this.addItem('egg', 1); this.msg('You search the coop and find a fresh egg.', 'm-game'); }
    else { this.addItem('feather', 2 + (Math.random() * 4 | 0)); this.msg('You find some feathers among the straw.', 'm-game'); }
    Sound.play('woodcut');
  },
  pickWheat(s) {
    this.addItem('wheat', 1);
    this.addXp('farming', 8);
    this.msg('You pick a sheaf of ripe wheat.', 'm-game');
    Sound.play('woodcut');
    // the plot is bare for a while, then regrows
    const lay = World.L[0], k = World.key(s.x, s.z), cur = lay.scenery.get(k);
    if (cur) { lay.scenery.delete(k); setTimeout(() => { if (!lay.scenery.has(k)) lay.scenery.set(k, { type: 'wheat', x: s.x, z: s.z, respawnAt: 0 }); }, 15000); }
  },
  // ---------- Dynamic events ----------
  // Singleplayer drives the SAME runner the server does (js/events.js); the only
  // difference is this adapter. Participation is trivially "is it me, am I close
  // enough", and scaling therefore lands on 1 — which is the baseline the events
  // are balanced around.
  eventCtx: null, eventState: null,
  initEvents() {
    this.eventState = Events.newState(Math.random);
    this.eventCtx = {
      state: this.eventState,
      now: () => performance.now(),
      rand: Math.random,
      participants: (x, z, layer, r) => {
        const P = this.player;
        if (!P || P.layer !== layer) return [];
        return Math.hypot(P.x - (x + 0.5), P.z - (z + 0.5)) <= r ? [P] : [];
      },
      pid: () => 'me',
      combatLevel: () => this.combatLevel(),
      spawn: (type, x, z, layer) => this.addNpc(type, x, z, layer),
      despawn: (n) => { const i = this.npcs.indexOf(n); if (i >= 0) this.npcs.splice(i, 1); },
      isDead: (n) => !!n.deadUntil || n.hits <= 0,
      blocked: (l, x, z) => World.blocked(l, x, z),
      setScenery: (l, x, z, t) => {
        const lay = World.L[l], k = World.key(x, z), cur = lay.scenery.get(k);
        if (cur) cur.type = t; else lay.scenery.set(k, { type: t, x, z, respawnAt: 0 });
        if (Renderer && Renderer._terrain) Renderer._terrain[l] = Renderer._terrain[l]; // scenery is drawn live
      },
      announce: (t, c) => this.msg(t, c),
      reward: (p, tier, def) => this.grantEventReward(tier, def)
    };
  },

  // Paid by contribution tier, not by who landed the last blow: bronze/silver/gold
  // buy one, two or three rolls on the event's own table.
  grantEventReward(tier, def) {
    const names = [];
    for (let i = 0; i < tier; i++) {
      const g = Combat.rollPick({ chance: 1, table: def.reward });
      if (!g) continue;
      if (!this.addItem(g.id, g.qty))
        this.ground.push({ id: g.id, qty: g.qty, x: Math.floor(this.player.x), z: Math.floor(this.player.z), layer: this.player.layer, until: performance.now() + 180000 });
      names.push((g.qty > 1 ? g.qty + ' ' : '') + ITEMS[g.id].name);
    }
    for (const sk in (def.xp || {})) this.addXp(sk, def.xp[sk] * tier / 3);
    this.msg(EVENT_TIER_NAME[tier] + ' contribution — ' + (names.join(', ') || 'nothing this time') + '.', 'm-lvl');
    Sound.play('levelup');
    UI.renderInventory(); UI.renderStats();
  },

  // ---------- Emotes ----------
  // An emote is a pose the renderers play plus an *observable event*. Treasure
  // Trails will need "did the player perform X, at Y, wearing Z" — so doEmote
  // funnels every performance through one place and hands the whole event to
  // anything watching (see emoteWatchers below).
  doEmote(id) {
    const P = this.player, def = EMOTE_BY_ID[id];
    if (!def) return false;
    if (P.curHits <= 0) return false;
    const now = performance.now();
    // acting or fighting cancels the emote instead of layering on top of it
    P.action = null; P.path = []; P.actType = null;
    P.emote = { id, t0: now, ms: def.ms, until: def.loop ? now + 60000 : now + def.ms };
    this.msg(def.msg, 'm-game');
    if (this.netMode && typeof Net !== 'undefined' && Net.emote) Net.emote(id);
    this.fireEmote(id);
    UI.renderEmotes();
    return true;
  },
  // stop whatever emote is running (movement, combat and skilling all call this)
  clearEmote() { if (this.player && this.player.emote) { this.player.emote = null; UI.renderEmotes(); } },
  // the emote currently playing, or null — the thing a clue step will ask about
  emoteActive() {
    const e = this.player && this.player.emote;
    if (!e) return null;
    return (e.until && performance.now() > e.until) ? null : e.id;
  },

  // ---- Treasure Trails hook ----------------------------------------------
  // Everything a clue step needs to judge a performance is known the instant the
  // emote starts, so it is all gathered here into one object. Register a watcher
  // with Game.watchEmote(fn); it gets {emote, x, z, layer, worn} and returns true
  // if it consumed the performance.
  emoteWatchers: [],
  watchEmote(fn) { this.emoteWatchers.push(fn); return fn; },
  unwatchEmote(fn) { const i = this.emoteWatchers.indexOf(fn); if (i >= 0) this.emoteWatchers.splice(i, 1); },
  emoteEvent(id) {
    const P = this.player, worn = {};
    for (const slot of this.WORN_SLOTS) worn[slot] = P.worn[slot] ? P.worn[slot].id : null;
    return { emote: id, x: Math.floor(P.x), z: Math.floor(P.z), layer: P.layer, worn };
  },
  fireEmote(id) {
    const ev = this.emoteEvent(id);
    for (const fn of this.emoteWatchers.slice()) { try { if (fn(ev)) break; } catch (e) { /* a watcher must never break the emote */ } }
  },

  // ---------- destroying valuables ----------
  // Alchemy and Drop both delete an item with one click. That was survivable when the
  // dearest thing in the game was a steel kite; it is not now that a Tideforged Blade
  // is 3,200gp and only drops from an event. Anything at or above this asks first.
  VALUABLE: 1000,
  confirmDestroy(id, what, go) {
    const def = ITEMS[id];
    if (!def || (def.value || 0) < this.VALUABLE) { go(); return; }
    this.dialogueNpc = null;
    this.dialogue([{ who: '', text: what + ' your ' + def.name + '? It is worth about ' + def.value + ' coins.', choices: [
      { label: 'No, keep it.', cb: () => this.msg('You think better of it.', 'm-game') },
      { label: 'Yes, ' + what.toLowerCase() + ' it.', cb: go }
    ] }]);
  },

  // ---------- batch production ----------
  // The most-repeated request in ten years of update notes: make-5/10/X on every
  // production action, "fill all your buckets", "grind all of it". One helper serves
  // the lot — `doOne(true)` makes a single item silently and returns false the moment
  // it can't, and the batch prints one line instead of thirty.
  batch(what, max, doOne) {
    let made = 0;
    for (let i = 0; i < max; i++) { if (!doOne(true)) break; made++; }
    if (!made) { doOne(false); return 0; }          // let the single call explain why
    this.msg('You ' + what.replace('%n', made), made > 1 ? 'm-lvl' : 'm-game');
    Sound.play('success');
    UI.renderInventory(); UI.renderStats();
    return made;
  },
  // how many times a recipe could run right now
  canMake(kind, arg) {
    switch (kind) {
      case 'gem': return this.countItem(arg);
      case 'grind': return Math.min(this.countItem('pot'),
        this.countItem('bones') + this.countItem('big_bones') + this.countItem('dragon_bones'));
      case 'slime': return this.countItem('bucket');
      case 'leather': {
        let n = arg.leather ? Math.floor(this.countItem('leather') / arg.leather) : Infinity;
        for (const id in (arg.extra || {})) n = Math.min(n, Math.floor(this.countItem(id) / arg.extra[id]));
        return n === Infinity ? 0 : n;
      }
      case 'jewel': return Math.min(this.countItem(arg.bar), arg.gem ? this.countItem(arg.gem) : Infinity);
      case 'worship': return Math.min(
        this.countItem('bonemeal') + this.countItem('bonemeal_big') + this.countItem('bonemeal_dragon'),
        this.countItem('bucket_slime'));
      default: return 0;
    }
  },

  // ---------- Crafting: gems and jewellery ----------
  // A chisel opens a stone; a mould and a bar at a furnace set it into something
  // wearable. The result is inert until Magic enchants it (see castEnchant).
  cutGem(uncutId, silent) {
    const r = GEM_CUTS[uncutId];
    if (!r) return false;
    if (!this.hasItem('chisel')) { if (!silent) this.msg('You need a chisel to cut a gem.', 'm-red'); return false; }
    if (this.level('crafting') < r.lvl) { if (!silent) this.msg('You need a Crafting level of ' + r.lvl + ' to cut that.', 'm-red'); return false; }
    if (!this.hasItem(uncutId)) return false;
    this.removeItem(uncutId, 1);
    if (!this.addItem(r.id, 1)) { this.addItem(uncutId, 1); return false; }
    this.addXp('crafting', r.xp);
    this.gesture('smith', performance.now());
    if (!silent) {
      this.msg('You cut the ' + ITEMS[uncutId].name.toLowerCase().replace('uncut ', '') + '.', 'm-game');
      Sound.play('success');
      UI.renderInventory();
    }
    return true;
  },

  jewelleryMenu(key) {
    const opts = [];
    for (const r of JEWELLERY) {
      if (!this.hasItem(r.bar) || !this.hasItem(r.mould)) continue;
      if (r.gem && !this.hasItem(r.gem)) continue;
      const n = this.canMake('jewel', r);
      opts.push({ label: ITEMS[r.id].name + ' (lvl ' + r.lvl + ')', cb: () => this.castJewellery(r, key) });
      if (n > 1) opts.push({ label: '— all ' + n + ' ' + ITEMS[r.id].name,
        cb: () => this.batch('cast %n ' + ITEMS[r.id].name.toLowerCase() + 's', n, s => this.castJewellery(r, key, s)) });
    }
    if (!opts.length) {
      this.msg('You need a mould and a matching bar to cast jewellery here — and a cut gem for a gem setting.', 'm-red');
      return;
    }
    opts.push({ label: 'Cancel', cb: () => {} });
    UI.showMenu(window.innerWidth / 2 - 100, window.innerHeight / 2 - 70, opts);
  },

  castJewellery(r, key, silent) {
    if (this.level('crafting') < r.lvl) { if (!silent) this.msg('You need a Crafting level of ' + r.lvl + ' to cast that.', 'm-red'); return false; }
    if (!this.hasItem(r.bar) || !this.hasItem(r.mould)) { if (!silent) this.msg('You are missing the bar or the mould.', 'm-red'); return false; }
    if (r.gem && !this.hasItem(r.gem)) { if (!silent) this.msg('You need a cut ' + ITEMS[r.gem].name.toLowerCase() + ' to set in it.', 'm-red'); return false; }
    this.removeItem(r.bar, 1);
    if (r.gem) this.removeItem(r.gem, 1);
    if (!this.addItem(r.id, 1)) { this.addItem(r.bar, 1); if (r.gem) this.addItem(r.gem, 1); return false; }
    this.addXp('crafting', r.xp);
    this.gesture('smelt', performance.now());
    if (!silent) {
      this.msg('You pour the bar into the mould and turn out ' + ITEMS[r.id].name.toLowerCase() + '.', 'm-game');
      Sound.play('success');
      UI.renderInventory();
    }
    return true;
  },

  blessSymbol() {
    if (!this.hasItem('unblessed_symbol')) { this.msg('You have nothing here that wants blessing.', 'm-red'); return; }
    this.removeItem('unblessed_symbol', 1);
    if (!this.addItem('holy_symbol', 1)) { this.addItem('unblessed_symbol', 1); return; }
    this.addXp('prayer', 60);
    this.msg('You lay the silver symbol on the altar. It comes away warm. (60 Prayer xp)', 'm-lvl');
    Sound.play('pray');
    UI.renderInventory(); UI.renderStats();
  },

  // ---------- Farming: allotments you rake, sow, and come back to ----------
  // Patch state lives on the player (so it saves) keyed by tile, and growth is
  // measured in WALL-CLOCK time — a crop keeps ripening while the game is closed.
  // That is the whole shape of the skill: plant, go away, come back to a harvest.
  patch(s) {
    const P = this.player;
    P.patches = P.patches || {};
    const k = World.key(s.x, s.z);
    if (!P.patches[k]) P.patches[k] = { state: 'weeds' };
    return P.patches[k];
  },
  // 'weeds' | 'empty' | 'growing' | 'ready', plus how far along a growing crop is
  patchState(s) {
    const p = this.patch(s);
    if (p.state !== 'growing') return { state: p.state, seed: p.seed, pct: 0 };
    const c = CROPS[p.seed];
    const pct = Math.min(1, (Date.now() - p.plantedAt) / (c.grow * 60000));
    return { state: pct >= 1 ? 'ready' : 'growing', seed: p.seed, pct };
  },

  rakePatch(s) {
    const p = this.patch(s);
    if (p.state !== 'weeds') { this.msg('This patch is already clear.', 'm-game'); return; }
    if (!this.hasItem('rake')) { this.msg('You need a rake to clear the weeds. Farmer Wend sells them.', 'm-red'); return; }
    p.state = 'empty';
    this.addXp('farming', 4);
    this.gesture('chop', performance.now());
    this.msg('You rake the weeds out of the patch. It is ready for a seed.', 'm-game');
    Sound.play('woodcut');
    UI.renderStats();
  },

  plantMenu(s) {
    const p = this.patch(s);
    if (p.state === 'weeds') { this.msg('The patch is thick with weeds. Rake it first.', 'm-red'); return; }
    if (p.state !== 'empty') { this.msg('Something is already growing here.', 'm-game'); return; }
    const seeds = Object.keys(CROPS).filter(id => this.hasItem(id));
    if (!seeds.length) { this.msg('You have no seeds. Farmer Wend sells them by the handful.', 'm-red'); return; }
    const opts = seeds.map(id => ({
      label: CROPS[id].name + ' (lvl ' + CROPS[id].lvl + ', ' + CROPS[id].grow + ' min)',
      cb: () => this.plantSeed(s, id)
    }));
    opts.push({ label: 'Cancel', cb: () => {} });
    UI.showMenu(window.innerWidth / 2 - 100, window.innerHeight / 2 - 70, opts);
  },

  plantSeed(s, seedId) {
    const c = CROPS[seedId], p = this.patch(s);
    if (p.state !== 'empty') return;
    if (this.level('farming') < c.lvl) { this.msg('You need a Farming level of ' + c.lvl + ' to plant that.', 'm-red'); return; }
    if (!this.hasItem(seedId)) return;
    this.removeItem(seedId, 1);
    p.state = 'growing'; p.seed = seedId; p.plantedAt = Date.now();
    this.addXp('farming', c.plantXp);
    this.msg('You plant the ' + c.name.toLowerCase() + ' seed. It will be ready in about ' + c.grow + ' minutes.', 'm-game');
    Sound.play('woodcut');
    UI.renderInventory(); UI.renderStats();
  },

  harvestPatch(s) {
    const st = this.patchState(s), p = this.patch(s);
    if (st.state === 'weeds') { this.msg('The patch is thick with weeds. Rake it first.', 'm-red'); return; }
    if (st.state === 'empty') { this.msg('There is nothing planted here.', 'm-game'); return; }
    if (st.state === 'growing') {
      const c = CROPS[st.seed];
      const left = Math.max(1, Math.ceil(c.grow * (1 - st.pct)));
      this.msg('The ' + c.name.toLowerCase() + ' are still coming up — about ' + left + ' more minute' + (left === 1 ? '' : 's') + '.', 'm-game');
      return;
    }
    const c = CROPS[st.seed];
    // a higher Farming level pulls more out of the same patch
    const bonus = Math.floor(this.level('farming') / 20);
    let n = c.yield[0] + Math.floor(Math.random() * (c.yield[1] - c.yield[0] + 1)) + bonus;
    let got = 0;
    for (let i = 0; i < n; i++) { if (!this.addItem(c.crop, 1)) break; got++; this.addXp('farming', c.cropXp); }
    if (!got) { this.msg("You can't carry any more.", 'm-red'); return; }
    p.state = 'empty'; p.seed = null; p.plantedAt = 0;
    this.gesture('chop', performance.now());
    this.msg('You clear the patch and gather ' + got + ' ' + ITEMS[c.crop].name.toLowerCase() + (got === 1 ? '' : 's') + '.', 'm-lvl');
    Sound.play('success');
    UI.renderInventory(); UI.renderStats();
  },

  grindFlour() {
    if (!this.hasItem('wheat')) { this.msg('You need some wheat to grind. Pick it from the field first.', 'm-red'); return; }
    this.removeItem('wheat', 1);
    this.addItem('flour', 1);
    this.addXp('farming', 12);
    this.msg('You grind the wheat into a pot of flour.', 'm-game');
    Sound.play('woodcut');
  },

  // ---------- level-gated passages (Giants' Den boulder, guild doors) ----------
  tryMoveBoulder(s) {
    const REQ = 20;
    if (this.level('strength') < REQ) {
      this.msg('You heave against the boulder with all your might, but it will not move. (Requires Strength ' + REQ + '.)', 'm-red');
      return;
    }
    World.L[1].scenery.delete(World.key(s.x, s.z));
    this.msg('With a mighty heave, you roll the massive boulder aside! A dark passage yawns open before you.', 'm-lvl');
    Sound.play('mine');
    if (this.player.quests.giants === 1) { this.player.quests.giants = 2; UI.renderQuests(); }
  },
  readNotes() {
    const lit = (this.player.ward || []).filter(Boolean).length;
    this.dialogueNpc = null;
    this.dialogue([
      ['', "Ava's Notes — on the Warding Circle at Rookmoor"],
      ['', '"Five stones stand. Each shows a face: dark, or lit with the cold fire."'],
      ['', '"Touch a stone and it turns — but it drags BOTH ITS NEIGHBOURS round with it. Three faces change at every touch."'],
      ['', '"The ward opens only when all five together face north."'],
      ['', '"Five being odd, no sequence of touches can strand you: there is always a way on from wherever you stand."'],
      ['', lit + ' of 5 stones currently face north.']
    ]);
  },

  // ---------- Animal Magnetism: the Warding Circle puzzle ----------
  // Five standing stones in a ring. Touching one flips its own polarity AND both
  // neighbours'; the ward opens when all five face north (all lit). On a ring of
  // ODD length the toggle matrix is invertible, so every state is solvable — the
  // stones can never be locked into a dead end no matter what order they're hit.
  WARD_N: 5,
  pylonLit(s) {
    const w = this.player && this.player.ward;
    return !!(w && s.pidx !== undefined && w[s.pidx]);
  },
  wardOpen() { const w = this.player.ward || []; return w.length === this.WARD_N && w.every(Boolean); },
  touchPylon(s) {
    const P = this.player, N = this.WARD_N;
    if (s.pidx === undefined) return;
    if (P.quests.magnetism < 1) { this.msg('The stone is cold and dead to your touch. You have no idea what it wants.', 'm-game'); return; }
    if (this.wardOpen()) { this.msg('The circle is already open. The plinth stands unguarded.', 'm-game'); return; }
    for (const d of [-1, 0, 1]) { const i = (s.pidx + d + N) % N; P.ward[i] = !P.ward[i]; } // self + both neighbours
    Sound.play('climb');
    const lit = P.ward.filter(Boolean).length;
    if (this.wardOpen()) {
      this.msg('All five stones blaze at once — the ward tears open with a sound like a snapping wire!', 'm-lvl');
      Sound.play('success');
      if (P.quests.magnetism === 1) { P.quests.magnetism = 2; UI.renderQuests(); }
      this.msg('Something heavy waits on the plinth at the centre of the circle.', 'm-quest');
    } else {
      this.msg('The stone turns — and drags its neighbours round with it. ' + lit + ' of ' + N + ' now face north.', 'm-game');
    }
  },
  searchPlinth() {
    const P = this.player;
    if (P.quests.magnetism < 1) { this.msg('A heavy black stone sits on the plinth, but the ward throws your hand back.', 'm-red'); return; }
    if (!this.wardOpen()) { this.msg('The ward still holds. All five standing stones must face north before you can reach the plinth.', 'm-red'); return; }
    if (P.quests.magnetism >= 3 || this.hasItem('lodestone_core')) { this.msg('The plinth is bare — you already took the core.', 'm-game'); return; }
    if (!this.addItem('lodestone_core', 1)) return;
    this.msg('You lift the Lodestone Core. Every buckle and nail on you strains toward it.', 'm-quest');
    Sound.play('success');
  },

  readMilestone(s) {
    const n = s.miles || 1;
    this.msg('The milestone reads: SOUTHMARCH — ' + n + ' league' + (n === 1 ? '' : 's') + '.', 'm-game');
    this.msg(n >= 7 ? 'A long way yet.' : n >= 3 ? 'Over halfway.' : 'Nearly there.', 'm-quest');
  },
  prayShrine() {
    const P = this.player;
    if (P.curPrayer >= this.level('prayer')) { this.msg('You kneel a moment. Your spirit is already steady.', 'm-game'); return; }
    P.curPrayer = this.level('prayer'); P.prayCounter = 0;
    this.msg('You kneel at the wayside shrine. Your prayer is restored.', 'm-game');
    Sound.play('pray');
    UI.renderPrayers();
  },

  tryGuildDoor(s) {
    const REQ = 20;
    if (this.level('mining') < REQ) {
      this.msg('A gruff voice booms: "Only miners of level ' + REQ + ' or higher may enter the Guild." The door stays shut.', 'm-red');
      return;
    }
    World.L[0].scenery.delete(World.key(s.x, s.z));
    this.msg('The Mining Guild door recognises a seasoned miner and swings open. Rich seams await within.', 'm-game');
    Sound.play('climb');
  },

  // RS2 click feedback: a yellow X where you asked to walk, a red X on whatever you
  // asked to interact with. Both fade after a beat (see drawClickMark in renderer.js).
  mark(x, z, kind) {
    const now = performance.now();
    this.destMark = { x, z, kind, layer: this.player.layer, t0: now, until: now + CLICK_MARK_MS };
  },
  // where an action's target actually is, so the red X lands on the thing you clicked
  actionTile(a) {
    if (!a) return null;
    if (a.npc) return [a.npc.x, a.npc.z];
    if (a.item) return [a.item.x, a.item.z];
    if (a.key !== undefined) { const p = String(a.key).split(',').map(Number); return [p[0], p[1]]; }
    return null;
  },

  setAction(a) {
    const P = this.player;
    if (P.emote) this.clearEmote();          // doing something outranks posing about it
    // attacking a NEW target resets the weapon timer so the first blow lands on arrival
    if (a && a.type === 'attack' && (!P.action || P.action.type !== 'attack' || P.action.npc !== a.npc)) P.nextAtkTick = 0;
    const t = this.actionTile(a);
    if (t) this.mark(t[0], t[1], 'action');
    P.action = a; P.path = [];
  },

  walkTo(x, z) {
    this.mark(x, z, 'walk');
    if (this.player && this.player.emote) this.clearEmote();  // ordering a move drops the pose at once
    if (this.netMode) { this._netTargetId = 0; Net.walk(x, z); return; }  // walking away drops the target
    const P = this.player;
    P.action = null;
    const path = World.findPath(P.layer, Math.floor(P.x), Math.floor(P.z), x, z);
    if (path) P.path = path;
  },

  // in multiplayer, only the shared-world verbs are wired; the rest are singleplayer-only for now
  netAction(kind, ref) {
    const a = { kind };
    const t = ref.s || ref.n || ref.g;
    if (t) this.mark(t.x, t.z, 'action');   // same red X as singleplayer
    if (ref.s) a.key = World.key(ref.s.x, ref.s.z);
    if (ref.n) a.npcId = ref.n.id;
    // The server owns combat in multiplayer, so the client has no action to read back.
    // Remember what we asked to attack so combatTarget() can still mark its health bar.
    if (kind === 'attack' && ref.n) this._netTargetId = ref.n.id;
    else this._netTargetId = 0;
    if (ref.g) a.gid = ref.g.gid;
    Net.action(a);
  },
  netTodo() { this.msg('That is only available in singleplayer for now.', 'm-red'); },

  smeltMenu(key) {
    const opts = SMELTS.map(r => ({
      label: r.name + ' (lvl ' + r.lvl + ': ' + Object.entries(r.needs).map(([id, q]) => q + ' ' + ITEMS[id].name.toLowerCase()).join(' + ') + ')',
      cb: () => this.setAction({ type: 'smelt', key, stype: 'furnace', bar: r.bar })
    }));
    opts.push({ label: 'Cancel', cb: () => {} });
    UI.showMenu(window.innerWidth / 2 - 120, window.innerHeight / 2 - 70, opts);
  },

  smithMenu(key) {
    // only offer recipes for bar types the player is carrying
    const bars = new Set(this.player.inv.filter(i => i && i.id.endsWith('_bar')).map(i => i.id));
    const avail = SMITHABLES.filter(r => bars.has(r.bar));
    if (!avail.length) { this.msg('You need some metal bars to work here. Smelt ore at the furnace first.', 'm-red'); return; }
    const opts = avail.map(r => ({
      label: ITEMS[r.id].name + ' (lvl ' + r.lvl + ', ' + r.bars + ' bar' + (r.bars > 1 ? 's' : '') + ')',
      cb: () => this.setAction({ type: 'smith', key, stype: 'anvil', product: r.id })
    }));
    opts.push({ label: 'Cancel', cb: () => {} });
    UI.showMenu(window.innerWidth / 2 - 110, window.innerHeight / 2 - 90, opts);
  },

  optionsFor(ref) {
    if (this.netMode) return this.netOptionsFor(ref);
    const opts = [];
    const sel = this.selectedSlot >= 0 ? this.player.inv[this.selectedSlot] : null;
    if (ref.kind === 'scenery') {
      const s = ref.s, def = SCENERY_DEFS[s.type], key = World.key(s.x, s.z);
      if (sel) opts.push({ label: 'Use ' + ITEMS[sel.id].name + ' with ' + def.name, cb: () => this.useItemOnScenery(this.selectedSlot, s) });
      if (TREE_DEFS[s.type]) opts.push({ label: 'Chop ' + def.name, cb: () => this.setAction({ type: 'chop', key, stype: s.type }) });
      // gem rocks carry no `ore` (the drop is rolled), so they need naming here too —
      // without this they offered nothing but Examine
      if (def.ore || def.gemRock) opts.push({ label: 'Mine ' + def.name, cb: () => this.setAction({ type: 'mine', key, stype: s.type }) });
      if (s.type === 'essence_rock' || s.type === 'pure_rock')
        opts.push({ label: 'Mine ' + def.name, cb: () => this.setAction({ type: 'essence', key, stype: s.type }) });
      if (s.type === 'rune_altar') {
        const alt = ALTAR_BY_RUNE[s.rune];
        opts.push({ label: 'Craft ' + s.rune + ' runes', cb: () => this.craftRunes(alt) });
      }
      if (s.type === 'rune_rift') opts.push({ label: 'Enter Mysterious ruin', cb: () => this.enterRift() });
      if (s.type === 'herb_patch') opts.push({ label: 'Pick Herb patch', cb: () => this.pickHerb(s) });
      if (s.type === 'fishing_spot') opts.push({ label: 'Net Fishing spot', cb: () => this.setAction({ type: 'fish', key, stype: 'fishing_spot' }) });
      if (s.type === 'lure_spot') opts.push({ label: 'Lure Fishing spot', cb: () => this.setAction({ type: 'fish', key, stype: 'lure_spot' }) });
      if (s.type === 'range') opts.push({ label: 'Cook at range', cb: () => this.setAction({ type: 'cook', key, stype: 'range' }) });
      if (s.type === 'bank_booth') opts.push({ label: 'Bank at booth', cb: () => this.setAction({ type: 'bank', key, stype: 'bank_booth' }) });
      if (s.type === 'furnace') opts.push({ label: 'Smelt ores', cb: () => this.smeltMenu(key) });
      if (s.type === 'furnace') opts.push({ label: 'Cast jewellery', cb: () => this.jewelleryMenu(key) });
      if (s.type === 'altar' && this.hasItem('unblessed_symbol'))
        opts.push({ label: 'Bless Holy Symbol', cb: () => this.blessSymbol() });
      if (s.type === 'anvil') opts.push({ label: 'Smith at anvil', cb: () => this.smithMenu(key) });
      if (s.type === 'altar') opts.push({ label: 'Recharge at altar', cb: () => this.setAction({ type: 'altar', key, stype: 'altar' }) });
      if (s.type === 'altar' && this.player.quests.souls === 2) {
        opts.push({ label: 'Chip the Ancient Relic', cb: () => this.chipRelic() });
        opts.push({ label: 'Thread Ghostspeak Amulet', cb: () => this.craftGhostspeak() });
      }
      if (s.type === 'furnace' && this.player.quests.souls >= 2 && this.hasItem('marsh_sand'))
        opts.push({ label: 'Fuse a pale bead', cb: () => this.smeltPaleBead() });
      if (s.type === 'wheat') opts.push({ label: 'Pick wheat', cb: () => this.pickWheat(s) });
      if (s.type === 'farm_patch') {
        const st = this.patchState(s);
        if (st.state === 'weeds') opts.push({ label: 'Rake Allotment', cb: () => this.rakePatch(s) });
        else if (st.state === 'empty') opts.push({ label: 'Plant seed in Allotment', cb: () => this.plantMenu(s) });
        else if (st.state === 'ready') opts.push({ label: 'Harvest ' + CROPS[st.seed].name, cb: () => this.harvestPatch(s) });
        else opts.push({ label: 'Inspect ' + CROPS[st.seed].name, cb: () => this.harvestPatch(s) });
      }
      if (s.type === 'windmill') opts.push({ label: 'Grind wheat', cb: () => this.grindFlour() });
      if (s.type === 'chicken_coop') opts.push({ label: 'Search coop', cb: () => this.searchCoop() });
      if (s.type === 'boulder') opts.push({ label: 'Move boulder', cb: () => this.tryMoveBoulder(s) });
      if (s.type === 'milestone') opts.push({ label: 'Read Milestone', cb: () => this.readMilestone(s) });
      if (s.type === 'shrine') opts.push({ label: 'Pray at shrine', cb: () => this.prayShrine() });
      if (s.type === 'pylon' && s.pidx !== undefined) opts.push({ label: 'Touch Standing stone', cb: () => this.touchPylon(s) });
      if (s.type === 'plinth') opts.push({ label: 'Search Warding plinth', cb: () => this.searchPlinth() });
      if (s.type === 'guild_door') opts.push({ label: 'Enter Mining Guild', cb: () => this.tryGuildDoor(s) });
      // ---- Mourncross ----
      // Each of these gets a "do it until you run out" twin. This is the single most
      // repeated request in the update history — and the 2007 note that fixed it was
      // about filling buckets of slime at a Font, which is literally this loop.
      if (s.type === 'bone_font') {
        opts.push({ label: 'Worship Bone Font', cb: () => this.worshipFont() });
        const n = this.canMake('worship');
        if (n > 1) opts.push({ label: 'Worship with all ' + n + ' offerings', cb: () => this.batch('make %n offerings at the Font', n, si => this.worshipFont(si)) });
      }
      if (s.type === 'bone_grinder') {
        opts.push({ label: 'Grind bones', cb: () => this.grindBones() });
        const n = this.canMake('grind');
        if (n > 1) opts.push({ label: 'Grind all ' + n + ' bones', cb: () => this.batch('grind %n lots of bonemeal', n, si => this.grindBones(si)) });
      }
      if (s.type === 'slime_pool') {
        opts.push({ label: 'Fill from Ectoplasm pool', cb: () => this.fillSlime() });
        const n = this.canMake('slime');
        if (n > 1) opts.push({ label: 'Fill all ' + n + ' buckets', cb: () => this.batch('fill %n buckets with ectoplasm', n, si => this.fillSlime(si)) });
      }
      if (s.type === 'sand_bank') opts.push({ label: 'Dig Sand bank', cb: () => this.digMarshSand() });
      // each bell is named, and the name is the whole puzzle — put it in the label
      if (s.type === 'bell') {
        opts.push({ label: 'Ring ' + s.bell + ' bell', cb: () => this.ringBell(s) });
        opts.push({ label: 'Examine ' + s.bell + ' bell', cb: () => this.msg('The ' + s.bell + ' bell of Mourncross. Its name is cut into the rim, worn but legible.', 'm-game') });
      }
      if (s.type === 'font_gate') opts.push({ label: 'Open Font gate', cb: () => this.tryFontGate() });
      if (s.type === 'grave') opts.push({ label: 'Read Grave', cb: () => this.readGrave(s) });
      if (s.type === 'ladder_down') opts.push({ label: 'Climb-down Ladder', cb: () => this.setAction({ type: 'climb', key, stype: 'ladder_down' }) });
      if (s.type === 'ladder_up') opts.push({ label: 'Climb-up Ladder', cb: () => this.setAction({ type: 'climb', key, stype: 'ladder_up' }) });
      opts.push({ label: 'Examine ' + def.name, cb: () => this.msg(def.examine, 'm-game') });
    } else if (ref.kind === 'npc') {
      const n = ref.n, d = NPC_DEFS[n.type];
      if (n.deadUntil) return opts;
      if (this.selectedSpell && d.attackable) {
        const sp = SPELLS.find(s => s.id === this.selectedSpell);
        opts.push({ label: 'Cast ' + sp.name + ' on ' + d.name, cb: () => {
          const id = this.selectedSpell;
          this.selectedSpell = null;
          UI.renderMagic();
          this.setAction({ type: 'cast', npc: n, spellId: id });
        } });
      }
      if (d.milk) opts.push({ label: 'Milk ' + d.name, cb: () => this.milkCow() });
      if (sel) opts.push({ label: 'Use ' + ITEMS[sel.id].name + ' with ' + d.name, cb: () => this.useItemOnNpc(this.selectedSlot, n) });
      if (d.attackable) { const lvl = this.npcCombatLevel(n); const wk = this.npcWeakness(n.type); opts.push({ label: 'Attack ' + d.name + ' (level-' + lvl + ')' + (wk ? ' — weak to ' + wk : ''), lvlCol: this.combatColor(lvl), cb: () => this.setAction({ type: 'attack', npc: n }) }); }
      // a shopkeeper you cannot hear cannot be haggled with
      if (d.trade && !(d.ghostly && !this.canHearGhosts()))
        opts.push({ label: 'Trade ' + d.name, cb: () => this.setAction({ type: 'shop', npc: n, shop: d.trade }) });
      if (!d.attackable) opts.push({ label: 'Talk-to ' + d.name, cb: () => this.setAction({ type: 'talk', npc: n }) });
      opts.push({ label: 'Examine ' + d.name, cb: () => { const wk = this.npcWeakness(n.type); this.msg(d.examine + (wk ? ' (It is weak to ' + wk + '.)' : ''), 'm-game'); } });
    } else if (ref.kind === 'ground') {
      const g = ref.g, def = ITEMS[g.id];
      if (this.selectedSpell === 'telegrab')
        opts.push({ label: 'Cast Telekinetic Grab on ' + def.name, cb: () => this.castGrab(g) });
      opts.push({ label: 'Take ' + def.name, cb: () => this.setAction({ type: 'take', item: g }) });
      if (this.level('magic') >= 33 && this.selectedSpell !== 'telegrab')
        opts.push({ label: 'Telegrab ' + def.name, cb: () => this.castGrab(g) });
      opts.push({ label: 'Examine ' + def.name, cb: () => this.msg(def.examine, 'm-game') });
    } else if (ref.kind === 'tile') {
      opts.push({ label: 'Walk here', cb: () => this.walkTo(ref.x, ref.z) });
    }
    return opts;
  },

  // ---------- bank & shop ----------
  // In multiplayer the bank lives on the authority: these become requests, and the
  // 'bank' message it sends back is what redraws the window. `player.bank` is a
  // read-only mirror there, so nothing below may write to it.
  deposit(id, qty) {
    if (this.netMode) { Net.bankDeposit(id, qty, this.bankDepositTab()); return; }
    const have = this.countItem(id);
    qty = Math.min(qty, have);
    if (qty <= 0) return;
    this.removeItem(id, qty);
    const b = this.player.bank.find(i => i.id === id);
    if (b) b.qty += qty;
    else this.player.bank.push({ id, qty, tab: this.bankDepositTab() });
    UI.renderBank(); UI.renderStats();
  },

  withdraw(id, qty) {
    if (this.netMode) { Net.bankWithdraw(id, qty, this.bankNote); return; }
    const b = this.player.bank.find(i => i.id === id);
    if (!b) return;
    qty = Math.min(qty, b.qty);
    const def = ITEMS[id];
    let moved = 0;
    if (this.bankNote) { if (this.addNote(id, qty)) moved = qty; }       // withdraw as a single note stack
    else if (def.stack) { if (this.addItem(id, qty)) moved = qty; }
    else for (let i = 0; i < qty; i++) { if (!this.addItem(id, 1)) break; moved++; }
    b.qty -= moved;
    if (b.qty <= 0) this.player.bank.splice(this.player.bank.indexOf(b), 1);
    UI.renderBank();
  },

  // Filing a stack into a numbered tab. Split out so the UI never pokes at the
  // bank array itself — it can't, in multiplayer.
  bankFile(id, tab) {
    if (this.netMode) { Net.bankTab(id, tab); return; }
    const b = this.player.bank.find(x => x.id === id);
    if (b) { b.tab = tab; UI.renderBank(); }
  },

  // Marrow of Mourncross trades in ecto-tokens, not coin, so price and currency both
  // come from the shop rather than being assumed.
  shopCurrency(shopId) { return (SHOP_DEFS[shopId || this.activeShop] || {}).currency || 'coins'; },
  shopPrice(st) { return st.price !== undefined ? st.price : ITEMS[st.id].value; },

  buy(id, qty) {
    const shop = this.shops[this.activeShop];
    const st = shop.find(s => s.id === id);
    if (!st) { this.msg('The shop has run out of stock.', 'm-red'); return; }
    const cur = this.shopCurrency(), price = this.shopPrice(st);
    for (let i = 0; i < qty; i++) {
      if (st.qty <= 0) { this.msg('The shop has run out of stock.', 'm-red'); break; }
      if (this.countItem(cur) < price) { this.msg("You don't have enough " + ITEMS[cur].name.toLowerCase() + '.', 'm-red'); break; }
      if (!this.addItem(id, 1)) break;
      this.removeItem(cur, price);
      st.qty--;
    }
    Sound.play('coins');
    UI.renderShop(); UI.renderStats();
  },

  sell(id, qty) {
    const def = ITEMS[id];
    if (this.shopCurrency() !== 'coins') { this.msg('Marrow has no use for that, and no coin to offer you.', 'm-red'); return; }
    if (!def.value || def.quest) { this.msg("You can't sell that.", 'm-red'); return; }
    // a trade shop deals in its own goods only; the general store takes anything
    const sd = SHOP_DEFS[this.activeShop] || {};
    // A shop always buys back what it stocks, whatever category that lands in — without
    // this the fletcher sells you raw leather and then refuses to take it back.
    const stocksIt = (sd.stock || []).some(s => s[0] === id);
    if (sd.accepts && !stocksIt && !sd.accepts.includes(shopCategory(id))) {
      this.msg(sd.name + ' deals in ' + sd.accepts.map(c => SHOP_CAT_NAME[c]).join(' and ') +
               '. Try the general store for that.', 'm-red');
      return;
    }
    const have = this.countItem(id);
    qty = Math.min(qty, have);
    if (qty <= 0) return;
    this.removeItem(id, qty);
    this.addItem('coins', Math.floor(def.value * 0.6) * qty);
    const shop = this.shops[this.activeShop];
    const st = shop.find(s => s.id === id);
    if (st) st.qty += qty;
    else shop.push({ id, qty, initial: 0 });
    Sound.play('coins');
    UI.renderShop(); UI.renderStats();
  },

  // ---------- Rune Mysteries ----------
  archmageDialogue() {
    const P = this.player, q = P.quests.runemyst || 0;
    if (q === 0) return this.dialogue([
      ['Archmage Sedris', 'You are standing on a rune altar. Did you know that? Most people do not.'],
      ['Archmage Sedris', 'The circle here is older than the kingdom. Under it is a place full of blank stone.'],
      { who: 'Archmage Sedris', text: 'I need someone to carry a talisman down and see whether it still answers. Will you?',
        choices: [
          { label: 'I will.', cb: () => { P.quests.runemyst = 1; this.addItem('air_talisman', 1);
            this.dialogue([['Archmage Sedris', 'Take this air talisman. Find the ruin west of the circle and put your hand through the arch.'],
                           ['Archmage Sedris', 'Bring me back a handful of essence and I will show you what to do with it.']]); } },
          { label: 'Not today.', cb: () => this.msg('She goes back to her book.', 'm-game') }
        ] }
    ]);
    if (q === 1) { P.quests.runemyst = 2; return this.dialogue([
      ['Archmage Sedris', 'The ruin is west of here. The arch will not look like much until you are through it.']]); }
    if (q === 2 || q === 3) {
      if (this.countItem('rune_essence') >= 5) {
        this.removeItem('rune_essence', 5);
        P.quests.runemyst = 4;
        this.addXp('runecraft', 300); this.addXp('magic', 250);
        this.addItem('mind_talisman', 1); this.addItem('water_talisman', 1);
        this.addItem('coins', 300);
        return this.dialogue([
          ['You', 'Five lumps of blank rock, as asked.'],
          ['Archmage Sedris', 'Blank is the point. It is what a rune is before anyone tells it what to be.'],
          ['Archmage Sedris', 'Stand at an altar with the matching talisman and the essence will do the rest.'],
          ['', 'You feel you understand something about Runecraft that you did not before.'],
          ['Archmage Sedris', 'Keep these two. The circle has altars for both, and more besides.']
        ]);
      }
      P.quests.runemyst = Math.max(2, q);
      return this.dialogue([['Archmage Sedris', 'Five pieces of rune essence. The ruin is west, and the arch is waiting.']]);
    }
    return this.dialogue([
      ['Archmage Sedris', 'The altars are yours to use now. Mind you, the deeper ones want purer stone.'],
      ['Archmage Sedris', 'Thirty in Mining, and you can cut the pale rock further in.']
    ]);
  },

  // ---------- Druidic Ritual ----------
  DRUID_WANTS: [['grimy_guam', 2], ['eye_of_newt', 2], ['vial_of_water', 1], ['limpwurt_root', 1]],
  druidElderDialogue() {
    const P = this.player, q = P.quests.druidic || 0;
    const wantsText = this.DRUID_WANTS.map(([id, n]) => n + ' ' + ITEMS[id].name.toLowerCase()).join(', ');
    if (q === 0) return this.dialogue([
      ['Elder Faelin', 'You smell of roads. We do not get many who smell of roads.'],
      ['Elder Faelin', 'The circle keeps a rite that teaches the properties of herbs. It has to be spoken over the right things.'],
      { who: 'Elder Faelin', text: 'Gather them for us and the rite will teach you as well as it teaches us. Will you?',
        choices: [
          { label: 'Tell me what you need.', cb: () => { P.quests.druidic = 1;
            this.dialogue([['Elder Faelin', 'Bring me: ' + wantsText + '.'],
                           ['Elder Faelin', 'The newts are in the marsh. The rest my people carry, if you are willing to ask them firmly.']]); } },
          { label: 'I have my own business.', cb: () => this.msg('She nods, unbothered.', 'm-game') }
        ] }
    ]);
    if (q >= 4) return this.dialogue([
      ['Elder Faelin', 'The rite holds. Clean your herbs before you drown them, and mind which vial you reach for.'],
      ['Elder Faelin', 'Ilma keeps a shop by the circle. She will sell you what the ground will not.']
    ]);
    const missing = this.DRUID_WANTS.filter(([id, n]) => this.countItem(id) < n);
    if (missing.length) return this.dialogue([
      ['Elder Faelin', 'Not yet. I still want: ' + missing.map(([id, n]) => (n - this.countItem(id)) + ' ' + ITEMS[id].name.toLowerCase()).join(', ') + '.']
    ]);
    for (const [id, n] of this.DRUID_WANTS) this.removeItem(id, n);
    P.quests.druidic = 4;
    this.addXp('herblore', 250); this.addXp('farming', 200);
    this.addItem('pestle', 1); this.addItem('vial', 5); this.addItem('coins', 400);
    return this.dialogue([
      ['You', 'Everything on your list.'],
      ['Elder Faelin', 'Then stand inside the stones and do not speak.'],
      ['', 'The circle says something you cannot follow, and something in you shifts to make room for it.'],
      ['Elder Faelin', 'You know herbs now. Not well — but you know them.'],
      ['Elder Faelin', 'Take the pestle. Grind what will not dissolve, and never drink what you have not finished.']
    ]);
  },

  // ---------- dialogue & quests ----------
  talkTo(n) {
    // Refuse to start a conversation while something is swinging at you. Without this
    // the obvious "fix" — going untouchable during dialogue — becomes an exploit: chat
    // to a townsman to shrug off a dragon.
    if (this.underAttack()) {
      this.msg('You are under attack — this is no time for talking.', 'm-red');
      return;
    }
    this.dialogueNpc = n; // remembered so the dialogue box can show this NPC's portrait
    // The dead of Mourncross are perfectly willing to talk. You are the one who
    // cannot hear them — until the amulet is round your neck it is all noise.
    if (NPC_DEFS[n.type].ghostly && !this.canHearGhosts())
      return this.dialogue([[NPC_DEFS[n.type].name, this.ghostBabble()], ['', 'You cannot make out a word of it.']]);
    switch (n.type) {
      case 'archmage': return this.archmageDialogue();
      case 'druid_elder': return this.druidElderDialogue();
      case 'apothecary': return this.openShop('herblore');
      case 'wenna': return this.wennaDialogue();
      case 'ghost_warden': return this.wardenDialogue();
      case 'ghost_sexton': return this.bellClueDialogue('sexton');
      case 'ghost_chandler': return this.bellClueDialogue('chandler');
      case 'ghost_child': return this.bellClueDialogue('child');
      case 'ghost_disciple': return this.discipleDialogue();
      case 'ghost_trader': return this.dialogue([
        ['Marrow', "Coin? What would I buy? Bread I cannot eat, boots I cannot wear out."],
        ['Marrow', 'Bring me ecto-tokens from the disciples and I will let you have the good cloth.']
      ]);
      case 'guide': return this.guideDialogue();
      case 'banker': return this.dialogue([
        ['Banker', 'Welcome to the Bank of Rune Classic.'],
        ['Banker', 'Use the booths to deposit anything you want to keep safe.']
      ]);
      case 'shopkeeper': return this.shopkeeperDialogue();
      case 'priest': return this.priestDialogue();
      case 'doric': return this.doricDialogue();
      case 'weaponsmith': return this.dialogue([
        ['Weaponsmith', 'Welcome to the Aldervale Armoury.'],
        ['Weaponsmith', 'Iron and steel arms, the finest in the north. Care to trade?']
      ]);
      case 'bartender': return this.dialogue([
        ['Barkeep', 'Welcome to the Silver Stag, traveller!'],
        ['Barkeep', "You can cook a meal on our range if you've caught something."]
      ]);
      case 'townsman': case 'townswoman': case 'tribesman': {
        const lines = NPC_DEFS[n.type].chatter;
        return this.dialogue([[NPC_DEFS[n.type].name, lines[Math.random() * lines.length | 0]]]);
      }
      case 'cook': return this.cookDialogue();
      case 'artisan': return this.apprenticeDialogue();
      case 'instructor': return this.combatTutDialogue();
      case 'ava': return this.avaDialogue();
      case 'innkeeper': case 'villager': {
        const lines = NPC_DEFS[n.type].chatter;
        return this.dialogue([[NPC_DEFS[n.type].name, lines[Math.random() * lines.length | 0]]]);
      }
      case 'marshal': case 'outfitter': {
        const lines = NPC_DEFS[n.type].chatter;
        if (lines) return this.dialogue([[NPC_DEFS[n.type].name, lines[Math.random() * lines.length | 0]]]);
        return this.dialogue([
          ['Marda', 'Capes, chaps, platelegs — if you wear it below the belt or behind the shoulders, I cut it.'],
          ['Marda', 'Mind the road north, mind you. The highwaymen take a fine cape off a corpse as gladly as off a rack.']
        ]);
      }
      case 'farmer': return this.farmerDialogue();
      case 'tribe_chief': return this.chiefDialogue();
      case 'farmhand': return this.farmhandDialogue();
    }
  },

  doricDialogue() {
    const q = this.player.quests;
    if (q.dwarf === 0) {
      this.dialogue([
        ['Doric', 'Hello there, traveller! Fine day for smithing, eh?'],
        ['Doric', "My forge is hungry but my back is not what it was."],
        ['Doric', 'Fetch me 4 copper ore and 4 tin ore from the mine'],
        ['Doric', "and I'll teach you a thing or two about metal."],
        ['', "You have started the quest: The Dwarf's Request"]
      ]);
      q.dwarf = 1;
      UI.renderQuests();
    } else if (q.dwarf === 1) {
      if (this.countItem('copper_ore') >= 4 && this.countItem('tin_ore') >= 4) {
        this.removeItem('copper_ore', 4);
        this.removeItem('tin_ore', 4);
        this.addItem('coins', 100);
        this.addXp('mining', 250);
        this.addXp('smithing', 300);
        this.dialogue([
          ['You', 'Here are your ores, Doric.'],
          ['Doric', 'Splendid! Watch closely now... and take these coins for your trouble.'],
          ['', "You have completed the quest: The Dwarf's Request!"]
        ]);
        Sound.play('coins');
        q.dwarf = 2;
        UI.renderQuests();
      } else {
        this.dialogue([['Doric', 'Still need 4 copper ore and 4 tin ore, friend. The mine is just south of here.']]);
      }
    } else {
      this.dialogue([['Doric', 'The forge burns bright thanks to you! Smelt iron at level 10 smithing, steel at 20.']]);
    }
  },

  // ---- Trial by Fire (ranged & magic + safe-spot tutorial) ----
  combatTutDialogue() {
    const q = this.player.quests, P = this.player;
    if (q.combattut === 0) {
      this.dialogue([
        ['Sergeant Kaelen', "Recruit! You carry a blade — but do you know when NOT to swing it?"],
        ['Sergeant Kaelen', "A wise fighter takes ground the enemy cannot reach, and strikes from there. A SAFE SPOT."],
        ['Sergeant Kaelen', "See those goblins, penned behind the fence? Melee them and they'd tear at you."],
        { who: 'Sergeant Kaelen', text: 'Let me teach you range and magic. Stand outside the pen, and they cannot touch you. Ready?', choices: [
          { label: 'Teach me, Sergeant.', cb: () => {
            q.combattut = 1;
            if (!P.inv.some(i => i && ITEMS[i.id].bow)) this.addItem('shortbow', 1);
            this.addItem('bronze_arrow', 40);
            UI.renderQuests();
            this.dialogue([
              ['Sergeant Kaelen', "Here — a shortbow and forty arrows. WIELD the bow (click it in your pack)."],
              ['Sergeant Kaelen', "Then attack a penned goblin from OUTSIDE the fence. It'll rage and claw and never reach you."],
              ['', 'You have started the quest: Trial by Fire'],
              ['', 'Wield the shortbow, then attack a penned goblin from outside the fence.']
            ]);
          } },
          { label: 'Not just now.', cb: () => this.dialogue([['Sergeant Kaelen', "Hmph. Come back when you value your own hide, recruit."]]) }
        ] }
      ]);
      return;
    }
    if (q.combattut === 1) {
      if (P.penRangedKills >= 1) {
        this.addXp('ranged', 250); this.addItem('bronze_arrow', 60);
        this.addItem('air_rune', 40); this.addItem('mind_rune', 40);
        if (!P.inv.some(i => i && ITEMS[i.id].magic)) this.addItem('magic_staff', 1);
        q.combattut = 2; UI.renderQuests();
        this.dialogue([
          ['Sergeant Kaelen', "HA! Dropped it clean, and not a scratch on you. THAT is a safe spot, recruit."],
          ['Sergeant Kaelen', "Now magic. Here — a wizard's staff. It feeds you air runes, so you'll only spend mind runes."],
          ['Sergeant Kaelen', "WIELD the staff, open the Magic tab, and cast Wind Strike on a goblin from the same safe ground."],
          ['Sergeant Kaelen', "Tip: hit the ⟳ beside a spell to AUTO-CAST it — then just Attack, and you'll sling spells every time."],
          ['', 'Reward: 250 Ranged xp, a Magic Staff, 60 arrows, and starter runes.'],
          ['', 'Wield the staff and cast Wind Strike on a penned goblin from outside the fence.']
        ]);
      } else {
        this.dialogue([['Sergeant Kaelen', "Wield that bow and drop a penned goblin from OUTSIDE the fence, recruit. That's the lesson."]]);
      }
      return;
    }
    if (q.combattut === 2) {
      if (P.penMagicKills >= 1) {
        this.addXp('magic', 250); this.addItem('air_rune', 30); this.addItem('mind_rune', 30); this.addItem('bronze_arrow', 40);
        this.addItem('wizard_hat', 1); this.addItem('wizard_robe', 1);
        q.combattut = 3; UI.renderQuests();
        this.dialogue([
          ['Sergeant Kaelen', "Struck down with a bolt of wind, and never in harm's way. THAT wins wars, recruit."],
          ['Sergeant Kaelen', "One last lesson — the fighter's triangle. MAGIC beats MELEE, MELEE beats RANGE, RANGE beats MAGIC."],
          ['Sergeant Kaelen', "Robes turn arrows but split under a blade; plate stops steel but cooks under a spell; hide shrugs off magic but not a sword."],
          ['Sergeant Kaelen', "Read your foe — EXAMINE it — and bring the weapon it fears. Take these robes; they'll ward you and sharpen your spells."],
          ['', 'You have completed the quest: Trial by Fire!'],
          ['', 'Reward: 250 Magic xp, a Wizard Hat & Robe, plus arrows and runes.']
        ]);
        Sound.play('coins');
      } else {
        this.dialogue([['Sergeant Kaelen', "Sling a spell at a penned goblin from safety, recruit. Wind Strike will do nicely."]]);
      }
      return;
    }
    this.dialogue([['Sergeant Kaelen', "Keep to high ground and safe spots, recruit, and you'll die old in your bed. Dismissed."]]);
  },

  // ---- Animal Magnetism (Ava Corrick, Rookmoor) ----
  // 0 not started · 1 sent to the circle · 2 ward opened · 3 core in hand, gathering
  // materials · 4 complete. The puzzle itself lives in touchPylon/searchPlinth.
  MAG_MATS: { lodestone_core: 1, iron_bar: 2, feather: 20, leather: 2 },
  magMatsList() {
    return Object.entries(this.MAG_MATS).map(([id, q]) => q + ' × ' + ITEMS[id].name.toLowerCase()).join(', ');
  },
  magMatsMissing() {
    const miss = [];
    for (const [id, q] of Object.entries(this.MAG_MATS)) {
      const have = this.countItem(id);
      if (have < q) miss.push((q - have) + ' more ' + ITEMS[id].name.toLowerCase());
    }
    return miss;
  },
  avaDialogue() {
    const q = this.player.quests, P = this.player;
    if (q.magnetism === 0) {
      this.dialogue([
        ['Ava Corrick', "Don't stand so — no, too late."],
        ['', 'A horseshoe leaps off the wall and clamps itself to her apron. She does not react.'],
        ['Ava Corrick', "Ava Corrick. Tinker. I was studying lodestones — the black rock that pulls iron — and I overreached."],
        ['Ava Corrick', "My workshop draws every nail in the county. I cannot eat with a spoon. I cannot sleep for the hinges."],
        ['Ava Corrick', "The cure is more lodestone, not less: a CORE, to gather the pull into one place. There is one on the moor."],
        { who: 'Ava Corrick', text: 'It sits on a plinth inside the old Warding Circle — five standing stones, and a spiteful lock. Will you fetch it?', choices: [
          { label: 'I will fetch your core.', cb: () => {
            q.magnetism = 1;
            this.addItem('ava_notes', 1);
            UI.renderQuests();
            this.dialogue([
              ['Ava Corrick', "Take my notes. The circle is south of here, on the open moor."],
              ['Ava Corrick', "Mind the trick of it: TOUCH ONE STONE AND ITS TWO NEIGHBOURS TURN WITH IT. All five must face north."],
              ['Ava Corrick', "Five is an odd number, and that is the mercy in it — no order of touches can ever lock you out. Keep going and it opens."],
              ['', 'You have started the quest: Animal Magnetism'],
              ['', 'Open the Warding Circle on Rookmoor, then take the Lodestone Core from the plinth.']
            ]);
          } },
          { label: 'Sounds like your problem.', cb: () => this.dialogue([['Ava Corrick', "It is. It will be yours too, if you walk the north road in a mail shirt. Good day."]]) }
        ] }
      ]);
      return;
    }
    if (q.magnetism === 1 || q.magnetism === 2) {
      if (this.hasItem('lodestone_core')) {  // player opened the ward and grabbed the core
        q.magnetism = 3; UI.renderQuests();
        this.dialogue([
          ['You', 'Your core, tinker.'],
          ['Ava Corrick', "...you actually — HA! Look at it. Look how it wants."],
          ['Ava Corrick', "Now. I have had an idea, and it is a good one, and it will make you rich in arrows."],
          ['Ava Corrick', "A pack. Lodestone-lined, worn at the back. Loose an arrow and the pack calls it home before it ever hits the dirt."],
          ['Ava Corrick', 'Bring me ' + this.magMatsList() + ' — the core for the heart, bars for the frame, feathers to teach it what to want, leather for the straps.'],
          ['', 'Reward: 1,000 Crafting xp, 750 Fletching xp, 750 Ranged xp, and Ava\'s Satchel.']
        ]);
        return;
      }
      const hint = this.wardOpen()
        ? 'The ward is open — take the core from the plinth at the centre.'
        : 'Touch the standing stones until all five face north. Each touch turns its neighbours too.';
      this.dialogue([['Ava Corrick', 'The circle is on the moor, south of my door. ' + hint]]);
      return;
    }
    if (q.magnetism === 3) {
      const miss = this.magMatsMissing();
      if (miss.length) { this.dialogue([['Ava Corrick', 'Still short: ' + miss.join(', ') + '. I cannot spin it out of air.']]); return; }
      for (const [id, n] of Object.entries(this.MAG_MATS)) this.removeItem(id, n);
      if (!this.addItem('avas_satchel', 1)) { this.msg('You need a free inventory slot for the satchel.', 'm-red'); return; }
      this.addXp('crafting', 1000); this.addXp('fletching', 750); this.addXp('ranged', 750);
      q.magnetism = 4; UI.renderQuests();
      this.dialogue([
        ['', 'She works for an hour without speaking, and hands you a heavy, humming pack.'],
        ['Ava Corrick', "There. Wear it on your back — the CAPE slot, where a cloak would sit."],
        ['Ava Corrick', "Roughly seven arrows in ten come home to it. Over a long fight that is the same as buying three and a half times as many."],
        ['Ava Corrick', "And my workshop is quiet at last. Mostly. Go on — go and empty a quiver at something."],
        ['', 'You have completed the quest: Animal Magnetism!'],
        ["", "Reward: 1,000 Crafting xp, 750 Fletching xp, 750 Ranged xp, and Ava's Satchel (keeps 72% of loosed arrows)."]
      ]);
      Sound.play('coins');
      return;
    }
    this.dialogue([
      ['Ava Corrick', "How does the satchel serve? Seven in ten, near enough — I have counted."],
      ['Ava Corrick', "If you ever lose it, come back. I know the shape of the thing now."]
    ]);
  },

  // ================= Mourncross & The Weight of Souls =================
  // The whole area hangs off one gate: the Ghostspeak Amulet. Without it the dead are
  // noise; with it the town opens up, and the quest opens the Bone Font behind it.
  canHearGhosts() { const a = this.equippedIn('amulet'); return !!a && a.id === 'ghostspeak_amulet'; },
  ghostBabble() {
    const B = ['Wooo... oooOOoo...', 'Hhhaaaaa... sss... aaah...', 'Ooooo... woooOOOoo...', 'Mmmmm... hhhoooo...', 'Sss-aaah... ooooOOoo...'];
    return B[Math.random() * B.length | 0];
  },

  // ---- the four bells. The funeral peal is Dawn, Deep, Thin, Mourning; three
  // ghosts each hold one clue, and together the three pin down exactly one order. ----
  PEAL: ['Dawn', 'Deep', 'Thin', 'Mourning'],
  bellRungAt(s) { return (this._bellRung && this._bellRung[s.bell]) || 0; },
  fontGateOpen() { return !!(this.player && this.player.quests.souls >= 5); },
  // The world is regenerated from scratch every load, so an opened gate has to be
  // re-opened from the save on startup — otherwise a returning player finds the
  // chamber they already unsealed walled up again.
  openFontGate() {
    for (const [x, z] of [[129, 43], [130, 43]]) World.L[0].scenery.delete(World.key(x, z));
  },

  ringBell(s) {
    const P = this.player;
    this._bellRung = this._bellRung || {};
    this._bellRung[s.bell] = performance.now();
    Sound.play('pray');
    if (P.quests.souls >= 5) { this.msg('You ring the ' + s.bell + ' bell. Its note rolls out over the flats and fades.', 'm-game'); return; }
    if (P.quests.souls < 4) {
      this.msg('You ring the ' + s.bell + ' bell. Nothing answers it — you have no idea what order it wants.', 'm-game');
      return;
    }
    P.peal = P.peal || [];
    P.peal.push(s.bell);
    const want = this.PEAL[P.peal.length - 1];
    if (s.bell !== want) {
      P.peal = [];
      this.msg('The ' + s.bell + ' bell rings sour and the whole peal dies in the air. You will have to start again.', 'm-red');
      return;
    }
    if (P.peal.length < 4) {
      this.msg('The ' + s.bell + ' bell rings true, and hangs there waiting for the next. (' + P.peal.length + ' of 4)', 'm-lvl');
      return;
    }
    // the peal is complete
    P.peal = []; P.quests.souls = 5; this.openFontGate(); UI.renderQuests();
    this.dialogue([
      ['', 'The four bells ring the funeral peal of Mourncross, in order, for the first time in fifty years.'],
      ['', 'Below you, iron grinds on stone. The gate over the Font stair folds open.'],
      ['', 'And something down there stops counting, and starts climbing.'],
      ['Warden Halloran', "That is IT. That is the peal. Gods keep you — it heard."],
      ['', 'The Tallyman is awake in the tower. Descend and end it.']
    ]);
    Sound.play('levelup');
  },

  tryFontGate() {
    if (this.fontGateOpen()) { this.msg('The gate stands folded open. The stair below is clear.', 'm-game'); return; }
    this.msg('The gate will not shift. There is no lock on it — it is held by something that is listening for a sound.', 'm-red');
  },

  readGrave(s) {
    const N = ['ILSE MARCHETTI, WHO KEPT THE LAMPS', 'TOB HALLORAN, AGED FOUR', 'THE FERRYMAN, NAME UNRECORDED',
               'ANNIKE PIKE, BELOVED', 'SEVEN OF THE HOUSE OF IVES', 'HERE LIES NOBODY. THE GRAVE WAS DUG IN HOPE'];
    const t = N[(s.x * 7 + s.z * 13) % N.length];
    this.msg('The stone reads: ' + t + '. Below, in a different hand: AND NOT ONE OF THEM WENT.', 'm-game');
  },

  // ---- the Bone Font supply chain: grind, fill, worship ----
  digMarshSand() {
    if (!this.addItem('marsh_sand', 1)) return;
    this.msg('You scrape a handful of cold grey sand out of the bank.', 'm-game');
    UI.renderInventory();
  },

  fillSlime(silent) {
    if (!this.hasItem('bucket')) { if (!silent) this.msg('You need an empty bucket to carry the ectoplasm.', 'm-red'); return false; }
    this.removeItem('bucket', 1);
    if (!this.addItem('bucket_slime', 1)) { this.addItem('bucket', 1); return false; }
    if (!silent) {
      this.msg('You fill the bucket with cold green slime. It is heavier than water and much less pleasant.', 'm-game');
      UI.renderInventory();
    }
    return true;
  },

  grindBones(silent) {
    const BONES = [['dragon_bones', 'bonemeal_dragon'], ['big_bones', 'bonemeal_big'], ['bones', 'bonemeal']];
    if (!this.hasItem('pot')) { if (!silent) this.msg('You need an empty pot to catch the meal.', 'm-red'); return false; }
    const pick = BONES.find(([b]) => this.hasItem(b));
    if (!pick) { if (!silent) this.msg('You have no bones to grind.', 'm-red'); return false; }
    this.removeItem(pick[0], 1); this.removeItem('pot', 1);
    if (!this.addItem(pick[1], 1)) { this.addItem(pick[0], 1); this.addItem('pot', 1); return false; }
    if (!silent) {
      this.msg('You crank the grinder. ' + ITEMS[pick[0]].name + ' go in at the top and meal comes out at the bottom.', 'm-game');
      UI.renderInventory();
    }
    return true;
  },

  fontDark() { const s = World.L[0].scenery.get(World.key(129, 80)); return !!s && s.type === 'bone_font_dark'; },

  worshipFont(silent) {
    const P = this.player;
    if (this.fontDark()) { if (!silent) this.msg('The basin is grey and still. The tide put it out — it will come back when the flats are quiet.', 'm-red'); return false; }
    if (!this.canHearGhosts()) {
      if (!silent) this.msg('The basin is quiet grey water. Whatever rite it wants, nobody here can explain it to you.', 'm-red');
      return false;
    }
    if (P.quests.souls < 6) {
      if (!silent) this.msg('The Font takes, but it does not give. Something further down is still holding what it swallows.', 'm-red');
      return false;
    }
    const MEALS = ['bonemeal_dragon', 'bonemeal_big', 'bonemeal'];
    const meal = MEALS.find(m => this.hasItem(m));
    if (!meal) { if (!silent) this.msg('You need a pot of bonemeal to offer. Grind bones at the mill north of here.', 'm-red'); return false; }
    if (!this.hasItem('bucket_slime')) { if (!silent) this.msg('You need a bucket of ectoplasm to pour with it.', 'm-red'); return false; }
    this.removeItem(meal, 1); this.removeItem('bucket_slime', 1);
    this.addItem('pot', 1); this.addItem('bucket', 1);           // the vessels come back
    const xp = ITEMS[meal].meal;
    this.addXp('prayer', xp);
    P.tokensOwed = (P.tokensOwed || 0) + 5;
    P.worships = (P.worships || 0) + 1;
    this.gesture('cook', performance.now());
    if (!silent) {
      this.msg('You pour the meal and the ectoplasm into the Font. The water takes it, and something far below says thank you. (' + xp + ' Prayer xp)', 'm-lvl');
      Sound.play('pray');
      UI.renderInventory(); UI.renderStats();
    }
    return true;
  },

  discipleDialogue() {
    const P = this.player;
    if (P.quests.souls < 6) {
      return this.dialogue([
        ['Disciple', 'You can hear me. Good. Most who cross the causeway cannot, and they leave again very quickly.'],
        ['Disciple', 'We tend the Font. It is meant to take bone and slime and give back grace.'],
        ['Disciple', 'It has given nothing back for fifty years. Something under the bell tower takes its cut first.'],
        ['Disciple', 'Deal with that, and I will show you the rite. And I will pay you for the help — in tokens, which is all we have.']
      ]);
    }
    const owed = P.tokensOwed || 0;
    if (owed > 0) {
      P.tokensOwed = 0;
      this.addItem('ecto_token', owed);
      Sound.play('coins');
      return this.dialogue([
        ['Disciple', 'You have fed the Font ' + (P.worships || 0) + ' times now. Here — your share.'],
        ['', 'The disciple counts ' + owed + ' ecto-tokens into your hand. They are cold and weigh nothing.'],
        ['Disciple', 'Marrow keeps the shop up the street. He will not take coin, but he will take these.']
      ]);
    }
    return this.dialogue([
      ['Disciple', 'The rite is simple. A pot of bonemeal, a bucket of ectoplasm, both into the basin.'],
      ['Disciple', 'Grind your bones at the mill and draw slime from any seep on the flats.'],
      ['Disciple', 'Worship first, then come back and I will pay you. Five tokens the offering.']
    ]);
  },

  // ---- the quest ----
  wennaDialogue() {
    const q = this.player.quests;
    if (q.souls === 0) {
      if (q.relic < 2) return this.dialogue([
        ['Sister Wenna', 'I read languages nobody living speaks. It is quieter work than it sounds.'],
        ['Sister Wenna', 'Bring me something strange and I will tell you what it says.']
      ]);
      return this.dialogue([
        ['Sister Wenna', 'You have the look of someone carrying a question. Out with it.'],
        ['Sister Wenna', 'Father Aereck? Aereck is a kind man and a poor scholar. If his relic is humming, he should have come to me years ago.'],
        ['Sister Wenna', 'Go back and ask him for it, and for his blessing to chip it. Then we will talk properly.']
      ]);
    }
    if (q.souls === 1) {
      if (!this.hasItem('ancient_relic')) return this.dialogue([
        ['Sister Wenna', 'You came without it. I cannot read a relic you left in a drawer.'],
        ['Sister Wenna', 'Fetch the Ancient Relic from Father Aereck and bring it here.']
      ]);
      q.souls = 2; UI.renderQuests();
      return this.dialogue([
        ['Sister Wenna', 'Ah. Give it here. Mind your fingers — it is colder than it has any business being.'],
        ['', 'She turns it under the lamp for a long time without speaking.'],
        ['Sister Wenna', 'This is not a holy relic. This is a piece of a machine.'],
        ['Sister Wenna', 'The script is Mourncross — a port town east of the river, across the flats. It says: LET NONE DEPART.'],
        ['Sister Wenna', 'It is a soul-anchor. It holds the dead where they fell. And this is only a CHIP of one.'],
        ['Sister Wenna', 'The whole anchor still stands in Mourncross. It has been holding a town full of people in place for fifty years.'],
        ['Sister Wenna', 'And now that a piece of it sits in a churchyard in Lumbridge, that churchyard is beginning to learn the same trick.'],
        { who: 'Sister Wenna', text: 'Will you go and break it?', choices: [
          { label: 'I will. What do I need?', cb: () => this.dialogue([
            ['Sister Wenna', 'Ears. You cannot argue with people you cannot hear, and everyone left in Mourncross is dead.'],
            ['Sister Wenna', 'Make a listener. A Ghostspeak Amulet. Three things go into it:'],
            ['Sister Wenna', 'A PALE BEAD — marsh sand from the flats and a bucket of ectoplasm, fused in a furnace.'],
            ['Sister Wenna', 'GRAVE-SILK — the wraiths on the flats spin it. You will have to take it off them.'],
            ['Sister Wenna', 'And a RELIC SHARD. Chip it from the relic itself, at Aereck\'s altar. Fight fire with fire.'],
            ['Sister Wenna', 'Bring all three together at that altar and thread them. Then go east, and be polite to the dead.'],
            ['', 'You have started the quest: The Weight of Souls']
          ]) },
          { label: 'Not today.', cb: () => this.dialogue([['Sister Wenna', 'It has waited fifty years. It will wait for you.']]) }
        ] }
      ]);
    }
    if (q.souls < 7) return this.dialogue([
      ['Sister Wenna', 'A pale bead, grave-silk, and a shard off the relic. Thread them at Aereck\'s altar.'],
      ['Sister Wenna', 'Then east over the causeway. The town is called Mourncross. Do not go unarmed.']
    ]);
    return this.dialogue([
      ['Sister Wenna', 'You broke it, then. I felt the relic go quiet on my desk, three counties away.'],
      ['Sister Wenna', 'Fifty years of people, let go in an afternoon. That is a good day\'s work by any measure.']
    ]);
  },

  wardenDialogue() {
    const q = this.player.quests;
    if (q.souls < 3) return this.dialogue([
      ['Warden Halloran', 'Halt — well. That was the habit. I have no gate to hold you at any more.'],
      ['Warden Halloran', 'You are the first living thing through here in a very long time. Do not touch anything.']
    ]);
    if (q.souls === 3) {
      q.souls = 4; UI.renderQuests();
      return this.dialogue([
        ['Warden Halloran', 'You hear me. You actually hear me.'],
        ['Warden Halloran', '...Forgive me. Fifty years is a long time to be spoken through.'],
        ['Warden Halloran', 'I am Halloran. I kept this gate. When the sickness came up the coast we shut the town and we prayed.'],
        ['Warden Halloran', 'Something answered. It offered a bargain: not one soul of Mourncross would be taken by the plague.'],
        ['Warden Halloran', 'It kept its word. The plague took nobody. Everything else did — the winter, the hunger, the well going bad.'],
        ['Warden Halloran', 'And not one of us was TAKEN. We are all still here. That was the whole of the trick.'],
        ['Warden Halloran', 'It sits under the bell tower and it counts us. Every day. We call it the Tallyman.'],
        { who: 'Warden Halloran', text: 'The gate to its chamber only opens to the funeral peal. Will you ring it?', choices: [
          { label: 'Tell me the peal.', cb: () => this.dialogue([
            ['Warden Halloran', 'That is the trouble. Nobody remembers the whole of it — it takes the four bells in one exact order.'],
            ['Warden Halloran', 'But between them, three of us remember enough. Pike the sexton. Ives the chandler. And little Nell.'],
            ['Warden Halloran', 'Ask all three. Put their three scraps together and there is only one order it can be.'],
            ['', 'Find Sexton Pike, Chandler Ives and Nell, then ring the four bells in the tower.']
          ]) },
          { label: 'Let me think about it.', cb: () => this.dialogue([['Warden Halloran', 'Take your time. We are extremely good at waiting.']]) }
        ] }
      ]);
    }
    if (q.souls === 4) return this.dialogue([
      ['Warden Halloran', 'Pike is in the churchyard. Ives keeps to his shop. Nell is on the street — she never goes far.'],
      ['Warden Halloran', 'Three clues, four bells, one order.']
    ]);
    if (q.souls === 5) return this.dialogue([
      ['Warden Halloran', 'The stair is open. It is down there, and it knows the gate moved.'],
      ['Warden Halloran', 'Go carefully. It does not swing anything. It simply decides you are cold.']
    ]);
    if (q.souls === 6) {
      q.souls = 7; UI.renderQuests();
      this.addXp('prayer', 2500); this.addXp('crafting', 900); this.addXp('hits', 600);
      this.addItem('ecto_token', 40);
      Sound.play('levelup');
      return this.dialogue([
        ['You', 'It is done. The counting has stopped.'],
        ['Warden Halloran', '...'],
        ['Warden Halloran', 'I can feel the road. I had forgotten there was a road.'],
        ['Warden Halloran', 'Some are going now. Look — over the flats. That is Ilse, who kept the lamps.'],
        ['Warden Halloran', 'Some of us are staying a while. The Font is honest again and it should be tended by someone.'],
        ['Warden Halloran', 'It will answer you now: bone and ectoplasm, and it gives back grace four times over what a graveside burial ever would.'],
        ['Warden Halloran', 'The disciples will pay you in tokens for every offering. Marrow will take those, and only those.'],
        ['', 'You have completed the quest: The Weight of Souls!'],
        ['', 'Reward: 2,500 Prayer xp, 900 Crafting xp, 600 Hits xp, 40 ecto-tokens, and the Bone Font is open to you.'],
        ['Warden Halloran', 'Fifty years I kept a gate against nothing at all. Thank you for opening it.']
      ]);
    }
    return this.dialogue([
      ['Warden Halloran', 'The Font is yours to use. Grind, fill, offer — the disciples will see you paid.'],
      ['Warden Halloran', 'And the gate stays open. I find I like it that way.']
    ]);
  },

  bellClueDialogue(who) {
    const q = this.player.quests;
    const LINES = {
      sexton: [
        ['Sexton Pike', 'I rang the peal at every funeral in this town, and then I rang it at my own, which took some arranging.'],
        ['Sexton Pike', 'Here is what I am certain of: MOURNING was rung LAST. Always last.'],
        ['Sexton Pike', 'It is the bell that answers. It never calls.']
      ],
      chandler: [
        ['Chandler Ives', 'I made the candles for every one of those funerals. Two hundred and six of them, at the end.'],
        ['Chandler Ives', 'I could not tell you the whole peal. But I know DEEP came IMMEDIATELY after DAWN.'],
        ['Chandler Ives', 'Those two always together, in that order, back to back.']
      ],
      child: [
        ['Nell', 'I was counting! I always counted the bells. I was good at it.'],
        ['Nell', 'THIN was not first. I am sure. Thin was NOT the first one.'],
        ['Nell', '...Are you going to make them stop? The bells never finish. They just stop in the middle.']
      ]
    };
    if (q.souls < 4) {
      const idle = { sexton: 'I dug every grave in this yard, and one of them for me.',
                     chandler: 'Cold wicks. Cold hands. Nobody buys a candle any more.',
                     child: 'Nobody plays. Do you want to play?' };
      return this.dialogue([[NPC_DEFS['ghost_' + who].name, idle[who]]]);
    }
    const P = this.player;
    P.clues = P.clues || {};
    const fresh = !P.clues[who];
    P.clues[who] = 1;
    const lines = LINES[who].slice();
    if (fresh && Object.keys(P.clues).length === 3)
      lines.push(['', 'That is all three. Mourning last, Deep straight after Dawn, and Thin not first — only one order fits.']);
    return this.dialogue(lines);
  },

  // crafting the amulet: three parts, threaded at the altar the relic sits on
  craftGhostspeak() {
    const P = this.player;
    if (P.quests.souls !== 2) { this.msg('You have no reason to be threading beads at an altar.', 'm-red'); return; }
    const need = [['pale_bead', 'a pale bead'], ['grave_silk', 'grave-silk'], ['relic_shard', 'a relic shard']];
    const missing = need.filter(([id]) => !this.hasItem(id));
    if (missing.length) { this.msg('You still need ' + missing.map(m => m[1]).join(' and ') + '.', 'm-red'); return; }
    for (const [id] of need) this.removeItem(id, 1);
    this.addItem('ghostspeak_amulet', 1);
    this.addXp('crafting', 600);
    P.quests.souls = 3; UI.renderQuests();
    Sound.play('levelup');
    this.dialogue([
      ['', 'You thread the grave-silk through the pale bead and bind the relic shard against it.'],
      ['', 'The moment the knot closes, the church goes loud.'],
      ['', 'Not with voices — with the shape of voices, just under hearing, from the direction of the graves outside.'],
      ['', 'You have made a Ghostspeak Amulet. (600 Crafting xp)'],
      ['', 'Wear it and cross the causeway east of Lumbridge. The town is called Mourncross.']
    ]);
    UI.renderInventory();
  },

  chipRelic() {
    const P = this.player;
    if (P.quests.souls !== 2) { this.msg('Chipping pieces off a church relic seems a poor way to spend an afternoon.', 'm-red'); return; }
    if (this.hasItem('relic_shard')) { this.msg('You already have a shard. One is quite enough.', 'm-game'); return; }
    if (!this.hasItem('ancient_relic')) { this.msg('Father Aereck has the relic. Ask him for it.', 'm-red'); return; }
    if (!this.hasItem('hammer')) { this.msg('You would need a hammer, and a certain amount of nerve.', 'm-red'); return; }
    if (!this.addItem('relic_shard', 1)) return;
    this.msg('You strike the relic once. A shard comes away far too easily, as though it wanted to.', 'm-game');
    Sound.play('hit');
    UI.renderInventory();
  },

  smeltPaleBead() {
    const P = this.player;
    if (!this.hasItem('marsh_sand') || !this.hasItem('bucket_slime')) {
      this.msg('You would need marsh sand and a bucket of ectoplasm to try that.', 'm-red'); return;
    }
    if (P.quests.souls < 2) { this.msg('You have no idea what you would even be making.', 'm-red'); return; }
    this.removeItem('marsh_sand', 1); this.removeItem('bucket_slime', 1);
    this.addItem('bucket', 1);
    if (!this.addItem('pale_bead', 1)) return;
    this.addXp('crafting', 200);
    this.gesture('smelt', performance.now());
    this.msg('The sand and the slime fight each other in the furnace, and then agree. You draw out a pale bead. (200 Crafting xp)', 'm-lvl');
    Sound.play('pray');
    UI.renderInventory();
  },

  // ---- The Artisan's Apprentice (skill tutorial questline) ----
  apprenticeDialogue() {
    const q = this.player.quests;
    // Each lesson: prove a skill, hand over the proof, earn a boosting chunk of xp.
    //
    // `ask` is interpolated into three sentences below — "First lesson: X.",
    // "Next lesson: X." and "You still need to X." — so it has to be a bare
    // imperative verb phrase that reads correctly after "You still need to".
    // Flavour goes after a dash, never in front of the verb.
    const STEPS = [
      { ask: 'chop 3 logs from a tree (a hatchet does it)', proof: () => this.countItem('logs') >= 3, take: () => this.removeItem('logs', 3), praise: 'Good, clean timber!', xp: { woodcut: 250 } },
      { ask: 'light 2 fires with a tinderbox on your logs', proof: () => (this.player.firesLit || 0) >= 2, take: () => {}, praise: 'A fine warm blaze!', xp: { firemaking: 250 } },
      { ask: 'mine copper and tin at the rocks, then smelt a bronze bar at the furnace', proof: () => this.hasItem('bronze_bar'), take: () => this.removeItem('bronze_bar', 1), praise: 'Solid metalwork!', xp: { mining: 250, smithing: 220 } },
      { ask: 'net a shrimp at the river, then cook it on a range or fire', proof: () => this.hasItem('shrimp'), take: () => this.removeItem('shrimp', 1), praise: 'Cooked to perfection!', xp: { fishing: 250, cooking: 250 } },
      { ask: 'craft a leather coif — a cow carries good hide, so tan some leather and put your needle to it', proof: () => this.hasItem('leather_coif'), take: () => this.removeItem('leather_coif', 1), praise: 'Beautifully stitched!', xp: { crafting: 350 } }
    ];
    if (q.apprentice === 0) {
      this.dialogue([
        ['Thessaly', "Well now — you've the look of someone bound for great things, but green as spring grass."],
        ['Thessaly', "I'm Thessaly. I've mastered every trade worth knowing, and I could use an apprentice."],
        { who: 'Thessaly', text: "Learn the trades with me? I'll teach you each craft and reward every lesson.", choices: [
          { label: 'Yes — teach me the trades!', cb: () => {
            q.apprentice = 1; if (!this.hasItem('needle')) this.addItem('needle', 1); UI.renderQuests();
            this.dialogue([
              ['Thessaly', "Splendid! Take this needle — you'll want it later for leatherwork."],
              ['Thessaly', 'First lesson: ' + STEPS[0].ask + '. Come back when it\'s done.'],
              ['', "You have started the quest: The Artisan's Apprentice"],
              ['', 'Thessaly gives you a needle.']
            ]);
          } },
          { label: 'Not right now.', cb: () => this.dialogue([['Thessaly', "No matter. The offer stands whenever you're ready to learn."]]) }
        ] }
      ]);
      return;
    }
    const idx = q.apprentice - 1;
    if (idx >= STEPS.length) { this.dialogue([['Thessaly', "You've learned every lesson I can teach, and learned them well. Go make your fortune, artisan!"]]); return; }
    const step = STEPS[idx];
    if (!step.proof()) { this.dialogue([['Thessaly', 'Not yet, apprentice. You still need to ' + step.ask + '.']]); return; }
    step.take();
    for (const sk in step.xp) this.addXp(sk, step.xp[sk]);
    q.apprentice++; UI.renderQuests();
    if (q.apprentice - 1 >= STEPS.length) {
      this.addItem('coins', 300); if (!this.hasItem('needle')) this.addItem('needle', 1);
      this.dialogue([
        ['Thessaly', step.praise],
        ['Thessaly', "And that's the last lesson! You've the hands of a real craftsman now."],
        ['', "You have completed the quest: The Artisan's Apprentice!"],
        ['', 'Reward: 300 coins, and a strong head-start across seven skills.']
      ]);
      Sound.play('coins');
    } else {
      this.dialogue([
        ['Thessaly', step.praise],
        ['Thessaly', 'Here — some hard-won experience for your trouble.'],
        ['Thessaly', 'Next lesson: ' + STEPS[q.apprentice - 1].ask + '.']
      ]);
    }
  },

  // ---- The Cook's Feast ----
  cookDialogue() {
    const q = this.player.quests;
    if (q.cooksfeast === 0) {
      this.dialogue([
        ['Cook', "Oh, thank the gods, a helper! You there — are you any good with your feet?"],
        ['Cook', "The Duke's feast is tonight and I've a cake to bake, but my pantry is BARE."],
        { who: 'Cook', text: "I need an egg, a bucket of milk and a pot of flour. Will you help me?", choices: [
          { label: "Of course — where do I start?", cb: () => {
            this.player.quests.cooksfeast = 1; UI.renderQuests();
            if (!this.hasItem('bucket')) this.addItem('bucket', 1);
            this.dialogue([
              ['Cook', "You're a lifesaver! Green Vale Farm lies west, past the mine road."],
              ['Cook', "Take this bucket — milk a cow, nab an egg from the coop, and grind wheat at the windmill."],
              ['', 'You have started the quest: The Cook\'s Feast'],
              ['', 'The Cook hands you a bucket.']
            ]);
          } },
          { label: "Sorry, I'm busy right now.", cb: () => this.dialogue([['Cook', "Aagh! Fine, FINE. But hurry back — the Duke arrives at dusk!"]]) }
        ] }
      ]);
    } else if (q.cooksfeast === 1) {
      if (this.hasItem('egg') && this.hasItem('bucket_of_milk') && this.hasItem('flour')) {
        this.removeItem('egg', 1); this.removeItem('bucket_of_milk', 1); this.removeItem('flour', 1);
        this.addItem('coins', 250); this.addItem('chefs_hat', 1); this.addXp('cooking', 500);
        this.dialogue([
          ['You', "Here — one egg, a bucket of milk, and a pot of flour."],
          ['Cook', "You wonderful soul! The feast is SAVED! Here, coins for your trouble..."],
          ['Cook', "...and my old hat. Wear it proud — you cook like a friend of the kitchen now."],
          ['', 'You have completed the quest: The Cook\'s Feast!'],
          ['', 'Reward: 250 coins, a Chef hat, and 500 Cooking xp.']
        ]);
        Sound.play('coins'); q.cooksfeast = 2; UI.renderQuests();
      } else {
        const need = [];
        if (!this.hasItem('egg')) need.push('an egg');
        if (!this.hasItem('bucket_of_milk')) need.push('a bucket of milk');
        if (!this.hasItem('flour')) need.push('a pot of flour');
        this.dialogue([['Cook', 'Still missing ' + need.join(', ') + '! Green Vale Farm, west of town — hurry!']]);
      }
    } else {
      this.dialogue([['Cook', 'That cake was the talk of the feast! Come by the range any time to cook.']]);
    }
  },

  // ---- The Lost Tribe (hook) ----
  farmerDialogue() {
    const q = this.player.quests;
    if (q.losttribe === 0) {
      this.dialogue([
        ['Farmer Wend', "Welcome to Green Vale. Milk the cows, take what eggs you find — I don't mind."],
        ['Farmer Wend', "...though my heart's not in the harvest. My brother Aldric is gone."],
        ['Farmer Wend', "He swore he heard drumming under the old ruin by town. Went down the ladder to look."],
        ['Farmer Wend', "That was a fortnight past. The guards won't go into the dark."],
        { who: 'Farmer Wend', text: 'Will you find Aldric, and bring me word he lives?', choices: [
          { label: 'Yes — I will find your brother.', cb: () => {
            this.player.quests.losttribe = 1; UI.renderQuests();
            this.dialogue([
              ['Farmer Wend', "Bless you, stranger. Bless you."],
              ['', 'You have started the quest: The Lost Tribe'],
              ['', 'Descend the ladder north-west of Lumbridge and search the tunnels.']
            ]);
          } },
          { label: "I'd rather not go into the dark.", cb: () => this.dialogue([['Farmer Wend', "I understand. It is no small thing I ask. Come back if you change your mind."]]) }
        ] }
      ]);
    } else if (q.losttribe === 3) {
      this.addItem('coins', 300); this.addXp('defense', 400); this.addXp('hits', 200);
      this.dialogue([
        ['You', 'Aldric is alive, Wend. He lives with the Hollow-folk beneath the ruin.'],
        ['You', 'A whole tribe, hidden from the dragon for generations. He chose to stay — to help them.'],
        ['Farmer Wend', "Alive... my brother's alive. And a hero to some lost people, no less."],
        ['Farmer Wend', "Take this, and my thanks. He always did have a bigger heart than sense."],
        ['Farmer Wend', "The Chief spoke of deeper halls, you say? Older things stirring? ...Best you rest first."],
        ['', 'You have completed the quest: The Lost Tribe!'],
        ['', 'Reward: 300 coins, 400 Defense and 200 Hits xp.']
      ]);
      Sound.play('coins'); q.losttribe = 4; UI.renderQuests();
    } else if (q.losttribe >= 4) {
      this.dialogue([['Farmer Wend', "Aldric sends word up with the traders now. Strange folk, the Hollow-kin, but kind. Thank you, friend."]]);
    } else {
      this.dialogue([['Farmer Wend', "Any sign of Aldric? Down the ladder by the ruin, into the tunnels. Mind the skeletons in the great hall."]]);
    }
  },
  chiefDialogue() {
    const q = this.player.quests;
    if (q.losttribe < 1) { this.dialogue([['Chief Morrow', "Sunlander. Few of your kind reach our fires. Speak your purpose, and speak true."]]); return; }
    if (q.losttribe === 1) {
      this.dialogue([
        ['Chief Morrow', "Halt. You stand in the last home of the Hollow-folk. I am Morrow, their chief."],
        ['Chief Morrow', "We fled beneath the earth when the green wyrm came, generations gone. The sun forgot us."],
        ['Chief Morrow', "You seek the newcomer — the farmer, Aldric. Aye, he is here, and well."],
        ['Chief Morrow', "He mends our tools and teaches our young. Speak with him, by the totem yonder."],
        ['', 'Find Aldric at the totem in the camp.']
      ]);
      q.losttribe = 2; UI.renderQuests();
    } else if (q.losttribe === 2) {
      this.dialogue([['Chief Morrow', 'Aldric waits by the totem. Speak with him.']]);
    } else if (q.losttribe === 3) {
      this.dialogue([['Chief Morrow', 'Aldric has chosen his path. Carry his word to his brother above.']]);
    } else {
      // The Lost Tribe is complete — offer The Rising Deep
      const g = q.giants;
      if (g === 0) {
        this.dialogue([
          ['Chief Morrow', "Sunlander — you return. Then hear me, for the drumming grows louder."],
          ['Chief Morrow', "West of our fires, a boulder seals the deep halls. Beyond it, HILL GIANTS wake."],
          ['Chief Morrow', "Their chieftain Grukk beats the war-drum. Soon they will break through and crush us."],
          { who: 'Chief Morrow', text: 'You are strong, sunlander. Will you shift the boulder and end Grukk?', choices: [
            { label: 'I will face the giants.', cb: () => {
              this.player.quests.giants = 1; UI.renderQuests();
              this.dialogue([
                ['Chief Morrow', "The bones of the earth are with you. The boulder needs great Strength — level 20, no less."],
                ['', 'You have started the quest: The Rising Deep'],
                ['', 'Move the boulder west of the camp (Strength 20), then slay the chieftain Grukk.']
              ]);
            } },
            { label: 'That is beyond me for now.', cb: () => this.dialogue([['Chief Morrow', 'Then hurry your training, sunlander. The drums do not wait.']]) }
          ] }
        ]);
      } else if (g === 3 && this.hasItem('giant_totem')) {
        this.removeItem('giant_totem', 1);
        this.addItem('coins', 500); this.addItem('big_bones', 5); this.addXp('prayer', 800); this.addXp('strength', 400);
        this.dialogue([
          ['You', "Grukk is dead, Chief. The drumming has stopped."],
          ['Chief Morrow', "...It is done. Generations of fear, ended by one sunlander's arm."],
          ['Chief Morrow', "Take these giant bones — bury them at any altar and the gods will hear you clearly."],
          ['Chief Morrow', "And take our thanks, which is worth more than coin, though here is coin too."],
          ['', 'You have completed the quest: The Rising Deep!'],
          ['', 'Reward: 500 coins, 5 big bones, 800 Prayer and 400 Strength xp.'],
          ['Chief Morrow', "Rest now. Though... the halls Grukk broke into run deeper still. We are not the oldest thing down here."]
        ]);
        Sound.play('coins'); q.giants = 4; UI.renderQuests();
      } else if (g >= 4) {
        this.dialogue([['Chief Morrow', "The deep is quiet, and the Hollow-folk sleep without fear. You are always welcome at our fires."]]);
      } else {
        this.dialogue([['Chief Morrow', "The boulder lies west of the fires. It takes Strength 20 to move. End Grukk, and bring me proof."]]);
      }
    }
  },
  farmhandDialogue() {
    const q = this.player.quests;
    if (q.losttribe < 2) { this.dialogue([['Aldric', 'Speak with the Chief first, friend — Morrow, by the fire. He decides who may pass.']]); return; }
    if (q.losttribe === 2) {
      this.dialogue([
        ['Aldric', "You came down here looking for ME? Ha! Wend sent you, I'd wager."],
        ['Aldric', "I found these people starving in the dark. I couldn't just leave them."],
        ['Aldric', "Tell my brother I'm alive, and happy. Give him this — a charm of the Hollow-folk."],
        ['Aldric', "He'll know I'm among friends. I'll send word up with the traders now and then."],
        ['', 'Aldric gives you a Hollow charm.'],
        ['', 'Return to Farmer Wend at Green Vale with the news.']
      ]);
      if (!this.hasItem('tribe_charm')) this.addItem('tribe_charm', 1);
      q.losttribe = 3; UI.renderQuests();
    } else {
      this.dialogue([['Aldric', 'Give my brother my love. And come visit — the Chief has tales that would curl your hair.']]);
    }
  },

  netOptionsFor(ref) {
    const opts = [];
    if (ref.kind === 'scenery') {
      const s = ref.s, def = SCENERY_DEFS[s.type];
      if (TREE_DEFS[s.type]) opts.push({ label: 'Chop ' + def.name, cb: () => this.netAction('chop', { s }) });
      if (def.ore || def.gemRock) opts.push({ label: 'Mine ' + def.name, cb: () => this.netAction('mine', { s }) });
      if (s.type === 'fishing_spot') opts.push({ label: 'Net Fishing spot', cb: () => this.netAction('fish', { s }) });
      if (s.type === 'lure_spot') opts.push({ label: 'Lure Fishing spot', cb: () => this.netAction('fish', { s }) });
      if (s.type === 'ladder_down') opts.push({ label: 'Climb-down Ladder', cb: () => this.netAction('climb', { s }) });
      if (s.type === 'ladder_up') opts.push({ label: 'Climb-up Ladder', cb: () => this.netAction('climb', { s }) });
      if (s.type === 'bank_booth') opts.push({ label: 'Use ' + def.name, cb: () => this.netAction('bank', { s }) });
      else if (['furnace', 'anvil', 'range', 'altar'].includes(s.type))
        opts.push({ label: 'Use ' + def.name, cb: () => this.netTodo() });
      opts.push({ label: 'Examine ' + def.name, cb: () => this.msg(def.examine, 'm-game') });
    } else if (ref.kind === 'npc') {
      const n = ref.n, d = NPC_DEFS[n.type];
      if (d.attackable) {
        // Identical to the singleplayer label. Every input is already local: the
        // level comes from NPC_DEFS, the weakness from the shared Combat module, and
        // the colour from your own combat level — the server is not involved, so
        // there is no reason for multiplayer to show a plainer option than
        // singleplayer does.
        const lvl = this.npcCombatLevel(n), wk = this.npcWeakness(n.type);
        opts.push({
          label: 'Attack ' + d.name + ' (level-' + lvl + ')' + (wk ? ' — weak to ' + wk : ''),
          lvlCol: this.combatColor(lvl),
          cb: () => this.netAction('attack', { n })
        });
      } else opts.push({ label: 'Talk-to ' + d.name, cb: () => this.netTodo() });
      opts.push({ label: 'Examine ' + d.name, cb: () => this.msg(d.examine, 'm-game') });
    } else if (ref.kind === 'ground') {
      const g = ref.g, def = ITEMS[g.id];
      opts.push({ label: 'Take ' + def.name, cb: () => this.netAction('take', { g }) });
      opts.push({ label: 'Examine ' + def.name, cb: () => this.msg(def.examine, 'm-game') });
    } else if (ref.kind === 'tile') {
      opts.push({ label: 'Walk here', cb: () => this.walkTo(ref.x, ref.z) });
    }
    return opts;
  },

  guideDialogue() {
    const q = this.player.quests;
    if (q.lunch === 0) {
      this.dialogue([
        ['Bob', 'Welcome to Rune Classic, adventurer!'],
        ['Bob', 'Round the fountain here: the castle and bank stand to the north,'],
        ['Bob', 'the general store east, the kitchen west, church south-west'],
        ['Bob', 'and the blacksmith south-east. The mine is far north-west, river to the east.'],
        ['Bob', "Say... I'm famished. Bring me 3 cooked shrimp and I'll make it worth your while."],
        ['', "You have started the quest: The Guide's Lunch"]
      ]);
      q.lunch = 1;
      UI.renderQuests();
    } else if (q.lunch === 1) {
      if (this.countItem('shrimp') >= 3) {
        this.removeItem('shrimp', 3);
        this.addItem('coins', 100);
        this.addXp('cooking', 300);
        this.dialogue([
          ['You', 'Here you go, three cooked shrimp.'],
          ['Bob', 'Delicious! Here, take these coins.'],
          ['', "You have completed the quest: The Guide's Lunch!"]
        ]);
        Sound.play('coins');
        q.lunch = 2;
        UI.renderQuests();
      } else {
        this.dialogue([
          ['Bob', 'Got my 3 cooked shrimp yet? Net some raw shrimp at the river,'],
          ['Bob', 'then cook them on a fire or the range by the smithy.']
        ]);
      }
    } else {
      this.dialogue([
        ['Bob', 'Thanks again for lunch, adventurer!'],
        ['Bob', 'Have you spoken to the shopkeeper and Father Aereck? They both need help.']
      ]);
    }
  },

  shopkeeperDialogue() {
    const q = this.player.quests;
    if (q.rats === 0) {
      this.dialogue([
        ['Shopkeeper', 'Welcome! Browse my wares any time... but ugh, those giant rats!'],
        ['Shopkeeper', 'They keep gnawing through my stock. Slay 5 of them in the south meadow'],
        ['Shopkeeper', "and I'll pay you well."],
        ['', 'You have started the quest: Rat Menace']
      ]);
      q.rats = 1;
      UI.renderQuests();
    } else if (q.rats === 1) {
      if (this.player.ratKills >= 5) {
        this.addItem('coins', 150);
        this.addItem('bronze_mace', 1);
        this.addXp('attack', 250);
        this.dialogue([
          ['Shopkeeper', 'The rats are gone? Marvellous! Here, coins and a mace from my stock.'],
          ['', 'You have completed the quest: Rat Menace!']
        ]);
        Sound.play('coins');
        q.rats = 2;
        UI.renderQuests();
      } else {
        this.dialogue([['Shopkeeper', 'Still ' + (5 - this.player.ratKills) + ' rats gnawing at my stock! The meadow is south of town.']]);
      }
    } else if (q.furs === 0) {
      this.dialogue([
        ['Shopkeeper', 'My stock is safe thanks to you! Say, are you the outdoors type?'],
        ['Shopkeeper', 'Bear fur fetches a fine price in the city. Bring me 3 furs'],
        ['Shopkeeper', 'from the bears in the western forest and I will pay handsomely.'],
        ['', 'You have started the quest: Fur Trader']
      ]);
      q.furs = 1;
      UI.renderQuests();
    } else if (q.furs === 1) {
      if (this.countItem('fur') >= 3) {
        this.removeItem('fur', 3);
        this.addItem('coins', 200);
        this.addXp('crafting', 250);
        this.dialogue([
          ['You', 'Three bear furs, as promised.'],
          ['Shopkeeper', 'Magnificent pelts! Here is your payment.'],
          ['', 'You have completed the quest: Fur Trader!']
        ]);
        Sound.play('coins');
        q.furs = 2;
        UI.renderQuests();
      } else {
        this.dialogue([['Shopkeeper', 'I still need ' + (3 - this.countItem('fur')) + ' more bear furs. Beware — bears bite back!']]);
      }
    } else {
      this.dialogue([['Shopkeeper', 'A pleasure doing business with you. Care to browse my wares?']]);
    }
  },

  priestDialogue() {
    const q = this.player.quests;
    if (q.relic === 0) {
      this.dialogue([
        ['Father Aereck', 'Welcome to the house of the gods, my child.'],
        ['Father Aereck', 'A terrible thing: our Ancient Relic was stolen and taken into'],
        ['Father Aereck', 'the dungeon beneath the ruin north-west of town. The dead walk there!'],
        ['Father Aereck', 'Recover it and the gods will reward you. Take food, and beware.'],
        ['', 'You have started the quest: The Restless Dead']
      ]);
      q.relic = 1;
      UI.renderQuests();
    } else if (q.relic === 1) {
      if (this.hasItem('ancient_relic')) {
        this.removeItem('ancient_relic', 1);
        this.addItem('coins', 200);
        this.addXp('prayer', 300);
        this.dialogue([
          ['You', 'I found your relic, Father.'],
          ['Father Aereck', 'The gods smile upon you! Accept this blessing and these coins.'],
          ['', 'You have completed the quest: The Restless Dead!']
        ]);
        Sound.play('levelup');
        q.relic = 2;
        UI.renderQuests();
      } else {
        this.dialogue([['Father Aereck', 'The relic lies deep in the dungeon below the old ruin. Climb down the ladder north-west of town.']]);
      }
    } else if (q.souls === 0) {
      // The Restless Dead is done — and its reward has started causing trouble
      this.dialogue([
        ['Father Aereck', 'Child. I am glad you came. I have not slept properly in a month.'],
        ['Father Aereck', 'The relic you brought me. It HUMS. Not always — at night, and always at the same hour.'],
        ['Father Aereck', 'And the graves behind the church have begun to... settle. Wrongly. Upward.'],
        { who: 'Father Aereck', text: 'I am a priest, not a scholar. Will you take it to someone who can read it?', choices: [
          { label: 'Who should I take it to?', cb: () => {
            q.souls = 1; UI.renderQuests();
            if (!this.hasItem('ancient_relic')) this.addItem('ancient_relic', 1);
            this.dialogue([
              ['Father Aereck', 'Sister Wenna, at the cathedral in Southmarch. She reads dead scripts for the pleasure of it.'],
              ['Father Aereck', 'Take the relic. Take it out of my church, if I am honest with you.'],
              ['Father Aereck', 'And whatever she asks of it — you have my blessing. Chip it, break it, I do not care.'],
              ['', 'You have started the quest: The Weight of Souls'],
              ['', 'Father Aereck gives you the Ancient Relic.']
            ]);
          } },
          { label: 'Some other time, Father.', cb: () => this.dialogue([['Father Aereck', 'Of course. It has waited this long. ...It is waiting now.']]) }
        ] }
      ]);
    } else if (q.souls < 7) {
      if (!this.hasItem('ancient_relic') && q.souls < 3) {
        this.addItem('ancient_relic', 1);
        this.dialogue([['Father Aereck', 'You came back without it? Here — take it again, and please do not lose it a third time.']]);
        return;
      }
      this.dialogue([['Father Aereck', 'Sister Wenna, at the Southmarch cathedral. She will know what the humming is.']]);
    } else {
      this.dialogue([
        ['Father Aereck', 'The graves are still. The hum has stopped. I slept eight hours and woke up frightened of how well I had slept.'],
        ['Father Aereck', 'Bless you, child. Recharge your prayers at our altar any time.']
      ]);
    }
  },

  dialogue(lines) {
    UI.showDialogue(lines, this.dialogueNpc);
  },
  playerLook() {
    const look = { skin: '#c8956c', shirt: '#a04c4c' };
    const head = this.equippedIn && this.equippedIn('head');
    if (head) { look.helm = true; look.helmCol = (typeof Renderer !== 'undefined' && Renderer.metalColor) ? Renderer.metalColor(head.id) : '#9a9da6'; }
    const body = this.equippedIn && this.equippedIn('body');
    if (body && typeof Renderer !== 'undefined' && Renderer.metalColor) look.shirt = Renderer.metalColor(body.id);
    const legs = this.equippedIn && this.equippedIn('legs');
    if (legs && typeof Renderer !== 'undefined' && Renderer.metalColor)
      look.legs = legs.id === 'wizard_skirt' ? '#2f3f96' : /chaps/.test(legs.id) ? '#8a5a2e' : Renderer.metalColor(legs.id);
    return look;
  },
  playerName() { return (this.netMode && typeof Net !== 'undefined' && Net.name) ? Net.name : 'You'; },

  // ---------- persistence ----------
  save() {
    if (this.netMode) return; // the server owns your multiplayer character
    const P = this.player;
    localStorage.setItem('runeclassic_save', JSON.stringify({
      v: 3, xp: P.xp, curHits: P.curHits, curPrayer: P.curPrayer, prayCounter: P.prayCounter,
      inv: P.inv, worn: P.worn, bank: P.bank, quests: P.quests, ratKills: P.ratKills, ward: P.ward,
      clues: P.clues, tokensOwed: P.tokensOwed, worships: P.worships, patches: P.patches,
      style: P.style, x: P.x, z: P.z, layer: P.layer, muted: Sound.muted, music: Sound.musicOff
    }));
  },

  load() {
    try {
      const d = JSON.parse(localStorage.getItem('runeclassic_save'));
      if (!d) return null;
      const P = this.newPlayer();
      if (d.v === 1) {
        P.xp = d.xp; P.curHits = d.curHits; P.inv = d.inv;
        P.quests.lunch = d.quest || 0;
        return P; // old positions don't fit the new map; respawn in town
      }
      if (d.v !== 2 && d.v !== 3) return null;
      Object.assign(P, {
        // prayer points became a whole number when the drain-counter model landed —
        // old saves can carry a fraction, so round it down on the way in
        xp: d.xp, curHits: d.curHits, curPrayer: Math.floor(d.curPrayer || 1),
        inv: d.inv, bank: d.bank || [], ratKills: d.ratKills || 0,
        style: d.style || 0, x: d.x, z: d.z, layer: d.layer || 0
      });
      // Object.assign fills in slots a save predates (cape/legs arrived with Southmarch)
      P.worn = Object.assign(this.emptyWorn(), d.worn || null);
      if (!d.worn && Array.isArray(P.inv)) { // migrate old saves: pull eq-flagged items out of the pack into worn
        for (let i = 0; i < P.inv.length; i++) { const it = P.inv[i]; if (it && it.eq) { delete it.eq; const sl = ITEMS[it.id] && ITEMS[it.id].slot; if (sl) { P.worn[sl] = it; P.inv[i] = null; } } }
      }
      P.quests = Object.assign(this.emptyQuests(), d.quests);
      if (Array.isArray(d.ward) && d.ward.length === 5) P.ward = d.ward.map(Boolean);
      // The Weight of Souls / prayer: a part-rung peal is deliberately not saved —
      // it resets on reload, which is no worse than getting a bell wrong.
      P.prayCounter = d.prayCounter || 0;
      P.clues = d.clues || {}; P.tokensOwed = d.tokensOwed || 0; P.worships = d.worships || 0;
      P.peal = [];
      // farming timestamps are wall-clock, so crops planted before you closed the
      // game carry on ripening while it is shut — that is the point of the skill
      P.patches = d.patches || {};
      Sound.muted = !!d.muted;
      Sound.musicOff = !!d.music;
      return P;
    } catch (e) { return null; }
  },

  reset() {
    localStorage.removeItem('runeclassic_save');
    window.onbeforeunload = null;
    location.reload();
  }
};

window.addEventListener('DOMContentLoaded', () => {
  // WebGL 3D is the default renderer; fall back to canvas if disabled (Opts) or unsupported
  const pref = localStorage.getItem('rc_gl');
  const wantGL = /[?&]nogl\b/.test(location.search) ? false : (pref !== '0');
  if (wantGL && GLRenderer.supported()) {
    GLRenderer.yaw = Renderer.yaw; GLRenderer.pitch = Renderer.pitch; GLRenderer.dist = Renderer.dist;
    Renderer = GLRenderer;
  }
  Renderer.init();
  World.gen();
  Game.init();
  UI.init();
  UI.refresh();
  document.getElementById('btn-sound').textContent = Sound.muted ? 'Sound: off' : 'Sound: on';
  document.getElementById('btn-music').textContent = Sound.musicOff ? 'Music: off' : 'Music: on';
  document.getElementById('btn-renderer').textContent = 'Engine: ' + (Renderer === GLRenderer ? 'WebGL 3D' : 'Canvas 2.5D');
  Game.msg('Welcome to Rune Classic.', 'm-game');
  if (Game.player.quests.lunch === 0) Game.msg('Talk to Bob the Guide in the town square to get started.', 'm-quest');
  window.onbeforeunload = () => { Game.save(); };
  Game._last = performance.now();
  Game.lastTick = performance.now();
  requestAnimationFrame(Game._loop = Game.loop.bind(Game));
});
