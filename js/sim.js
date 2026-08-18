'use strict';
// Authoritative, headless game simulation. Owns the world, NPCs, ground items and
// every connected player. Emits events the transport layer broadcasts.
//
// This file is *transport-free* and runs in two places unchanged: the Node server
// (loaded into the shared VM context by server/shared.js) and the browser, where a
// player hosting a peer-to-peer world runs it in their own tab (js/host.js). It
// therefore takes its dependencies — ITEMS, World, Combat, Events, … — from the
// enclosing scope rather than importing them, exactly like the other js/ files do.

const SLOW_EVERY = 4;         // 150ms loop; "slow" logic (gather/combat/AI) every 4th = 600ms
const MOVE_SPEED = 2.1;       // tiles/sec, matches the singleplayer feel
const RUN_SPEED = 3.9;        // same pair of constants singleplayer uses (game.js tick)

let nextId = 1;

class Sim {
  constructor() {
    World.gen();
    this.players = new Map();       // id -> player
    this.npcs = [];
    this.ground = [];
    this.itemSpawns = [{ id: 'ancient_relic', layer: 1, x: 74, z: 60, respawnAt: 0 }];
    this.sceneryOverrides = new Map(); // "layer:key" -> {layer,key,x,z,stype|null}
    this.events = [];               // {kind, ...} drained each loop by the transport
    // Shop stock is *shared world state*, not per-player — unlike the bank. Two
    // people at the same counter drain the same shelf, which is the whole point of
    // shopping in a shared world. Same shape singleplayer builds in Game.init().
    this.shops = {};
    for (const [id, def] of Object.entries(SHOP_DEFS))
      this.shops[id] = def.stock.map(([iid, qty, price]) => ({ id: iid, qty, initial: qty, price }));
    this._tick = 0;
    this._gtick = 0;                // game-tick counter (one per 600ms slow tick) — drives attack speeds
    this.spawnNpcs();
    this.initEvents();
  }

  // ---------- dynamic events ----------
  // Same runner as singleplayer (shared/events.js); only this adapter differs.
  // Here `participants` is a real head-count, so waves and the Font's integrity
  // both scale with how many people turned up.
  initEvents() {
    this.eventState = Events.newState(Math.random);
    this.eventCtx = {
      state: this.eventState,
      now: () => Date.now(),
      rand: Math.random,
      participants: (x, z, layer, r) => [...this.players.values()]
        .filter(p => p.layer === layer && Math.hypot(p.x - (x + 0.5), p.z - (z + 0.5)) <= r),
      pid: p => p.id,
      combatLevel: p => this.combatLevel(p),
      spawn: (type, x, z, layer) => this.addEventNpc(type, x, z, layer),
      despawn: n => {
        const i = this.npcs.indexOf(n);
        if (i >= 0) this.npcs.splice(i, 1);
      },
      isDead: n => !!n.deadUntil || n.hits <= 0,
      blocked: (l, x, z) => World.blocked(l, x, z),
      setScenery: (l, x, z, t) => this.setScenery(l, x, z, t, null, 0),
      announce: (text, cls) => this.emit({ kind: 'announce', text, cls }),
      reward: (p, tier, def) => this.grantEventReward(p, tier, def)
    };
  }

  addEventNpc(type, x, z, layer) {
    let px = x, pz = z;
    outer: for (let r = 0; r < 6; r++)
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++)
        if (!World.blocked(layer, x + dx, z + dz)) { px = x + dx; pz = z + dz; break outer; }
    const d = NPC_DEFS[type];
    const n = {
      id: nextId++, type, layer, x: px, z: pz, hx: px, hz: pz, fx: px + 0.5, fz: pz + 0.5,
      hits: d.hits, maxHits: d.hits, deadUntil: 0, targetId: 0, moving: false, splat: null, showHp: 0
    };
    this.npcs.push(n);
    return n;
  }

  grantEventReward(p, tier, def) {
    const names = [];
    for (let i = 0; i < tier; i++) {
      const g = Combat.rollPick({ chance: 1, table: def.reward });
      if (!g) continue;
      if (!this.add(p, g.id, g.qty))
        this.ground.push({ id: g.id, qty: g.qty, x: Math.floor(p.x), z: Math.floor(p.z), layer: p.layer, until: Date.now() + 180000 });
      names.push((g.qty > 1 ? g.qty + ' ' : '') + ITEMS[g.id].name);
    }
    for (const sk in (def.xp || {})) this.addXp(p, sk, def.xp[sk] * tier / 3);
    this.toPlayer(p, EVENT_TIER_NAME[tier] + ' contribution — ' + (names.join(', ') || 'nothing this time') + '.', 'm-lvl');
    this.pushStats(p);
  }

  emit(e) { this.events.push(e); }
  drain() { const e = this.events; this.events = []; return e; }

  // ---------- world helpers ----------
  scenery(layer, key) { return World.L[layer].scenery.get(key); }

  setScenery(layer, x, z, stype, restore, respawnAt) {
    const key = World.key(x, z);
    const lay = World.L[layer];
    if (stype === null) lay.scenery.delete(key);
    else {
      const s = lay.scenery.get(key);
      if (s) { s.type = stype; s.restore = restore; s.respawnAt = respawnAt || 0; s.expireAt = 0; }
      else lay.scenery.set(key, { type: stype, x, z, respawnAt: respawnAt || 0 });
    }
    this.sceneryOverrides.set(layer + ':' + key, { layer, key, x, z, stype });
    this.emit({ kind: 'scenery', layer, key, x, z, stype });
  }

  // ---------- NPC spawns (mirrors singleplayer) ----------
  spawnNpcs() {
    const add = (type, x, z, layer) => {
      let px = x, pz = z;
      outer: for (let r = 0; r < 8; r++)
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++)
          if (!World.blocked(layer, x + dx, z + dz)) { px = x + dx; pz = z + dz; break outer; }
      const d = NPC_DEFS[type];
      this.npcs.push({
        id: nextId++, type, layer, x: px, z: pz, hx: px, hz: pz, fx: px + 0.5, fz: pz + 0.5,
        hits: d.hits, maxHits: d.hits, deadUntil: 0, targetId: 0, moving: false, splat: null, showHp: 0
      });
    };
    add('guide', 66, 62, 0); add('banker', 64, 48, 0); add('shopkeeper', 76, 64, 0);
    add('priest', 56, 74, 0); add('doric', 40, 32, 0);
    // Aldervale (north town)
    add('banker', 56, 15, 0); add('weaponsmith', 74, 16, 0); add('bartender', 74, 27, 0);
    for (const [x, z] of [[58, 21], [70, 21], [64, 26]]) add('guard', x, z, 0);
    for (const [x, z] of [[60, 20], [66, 22], [58, 18]]) add('townsman', x, z, 0);
    for (const [x, z] of [[68, 18], [62, 23], [66, 20]]) add('townswoman', x, z, 0);
    for (const [x, z] of [[58, 84], [62, 86], [66, 84], [70, 86], [63, 89]]) add('rat', x, z, 0);
    for (const [x, z] of [[78, 56], [82, 66], [76, 74], [84, 76], [80, 84]]) add('goblin', x, z, 0);
    for (const [x, z] of [[36, 70], [30, 78], [40, 86], [26, 62]]) add('bear', x, z, 0);
    for (const [x, z] of [[46, 62], [52, 64], [56, 60], [48, 68]]) add('skeleton', x, z, 1);
    for (const [x, z] of [[70, 60], [74, 64], [68, 66]]) add('zombie', x, z, 1);
    for (const [x, z] of [[62, 80], [70, 84], [66, 78], [74, 86]]) add('hobgoblin', x, z, 1);
    for (const [x, z] of [[44, 80], [48, 84], [50, 78]]) add('ghost', x, z, 1);
    add('dragon', 49, 101, 1);
    // Green Vale Farm (west)
    add('farmer', 24, 52, 0); add('cook', 54, 64, 0); add('artisan', 58, 62, 0);
    for (const [x, z] of [[17, 55], [19, 57], [20, 55]]) add('cow', x, z, 0);
    for (const [x, z] of [[28, 56], [26, 58], [29, 55]]) add('chicken', x, z, 0);
    // Combat Training Yard (south)
    add('instructor', 47, 86, 0);
    for (const [x, z] of [[46, 90], [48, 91], [47, 92]]) add('pen_goblin', x, z, 0);
    // The Hollow-folk camp (dungeon)
    add('tribe_chief', 37, 64, 1); add('farmhand', 35, 67, 1);
    for (const [x, z] of [[34, 63], [40, 66], [36, 69]]) add('tribesman', x, z, 1);
    // The Giants' Den (deep, behind the boulder)
    for (const [x, z] of [[14, 62], [18, 70], [12, 68], [20, 64], [16, 74]]) add('hill_giant', x, z, 1);
    add('grukk', 13, 72, 1);
    // ---- the southern highway (matches singleplayer, north to south) ----
    for (const [x, z] of [[62, 96], [67, 100], [59, 103], [68, 106]]) add('highwayman', x, z, 0);
    add('ava', 33, 108, 0);
    add('highwayman', 42, 119, 0);
    for (const [x, z] of [[60, 118], [66, 120], [58, 115], [70, 118], [64, 123], [72, 119]]) add('villager', x, z, 0);
    add('shopkeeper', 71, 123, 0); add('bartender', 58, 124, 0);
    // Chapman's Cross — must match game.js exactly or the two modes drift
    add('bladesmith', 50, 133, 0); add('ironmonger', 59, 133, 0);
    add('fletcher', 50, 142, 0); add('runeseller', 59, 142, 0);
    for (const [x, z] of [[53, 137], [57, 139], [61, 138]]) add('villager', x, z, 0);
    for (const [x, z] of [[37, 144], [39, 146], [35, 146], [41, 143], [38, 141]]) add('dark_wizard', x, z, 0);
    // The Ringwall — the druid circle. Spawns must match between game.js and sim.js.
    add('archmage', 38, 143, 0);
    add('druid_elder', 39, 149, 0);
    add('apothecary', 49, 153, 0);
    add('druid', 33, 148, 0);
    add('druid', 43, 148, 0);
    add('druid', 35, 152, 0);
    add('druid', 44, 141, 0);
    add('druid', 31, 139, 0);
    add('chaos_druid', 29, 151, 0);
    add('chaos_druid', 47, 138, 0);
    add('chaos_druid', 33, 156, 0);
    add('highwayman', 79, 144, 0);
    add('innkeeper', 57, 153, 0);
    for (const [x, z] of [[59, 155], [56, 151]]) add('townsman', x, z, 0);
    // Southmarch (the great southern city)
    add('banker', 51, 165, 0); add('outfitter', 76, 166, 0); add('marshal', 64, 163, 0);
    add('priest', 53, 181, 0); add('bartender', 82, 182, 0);
    for (const [x, z] of [[62, 162], [66, 170], [55, 174], [74, 176], [64, 186], [50, 173], [78, 173]]) add('guard', x, z, 0);
    for (const [x, z] of [[60, 169], [68, 170], [62, 179], [56, 172], [72, 183]]) add('townsman', x, z, 0);
    for (const [x, z] of [[66, 167], [61, 176], [69, 173], [57, 181], [70, 165]]) add('townswoman', x, z, 0);
    add('wenna', 51, 184, 0);
    // ---- Mourncross, east of the river. The quest itself is singleplayer, but the
    // town and the wraiths that hold the flats are shared world, so they spawn here
    // too — otherwise the causeway leads somewhere visibly empty.
    for (const [x, z] of [[110, 55], [120, 46], [138, 50], [112, 82], [134, 86], [146, 78], [124, 88], [148, 44]])
      add('marsh_wraith', x, z, 0);
    add('ghost_warden', 116, 63, 0); add('ghost_sexton', 148, 62, 0);
    add('ghost_chandler', 122, 71, 0); add('ghost_child', 129, 55, 0); add('ghost_trader', 137, 71, 0);
    for (const [x, z] of [[128, 78], [131, 78], [127, 83]]) add('ghost_disciple', x, z, 0);
  }

  // ---------- players ----------
  addPlayer(name, saved) {
    const id = nextId++;
    const p = saved ? this.fromSave(saved) : this.newPlayer();
    p.id = id; p.name = name;
    p.path = []; p.action = null; p.moving = false; p.splat = null; p.showHp = 0;
    if (World.blocked(p.layer, Math.floor(p.x), Math.floor(p.z))) {
      p.x = World.SPAWN.x + 0.5; p.z = World.SPAWN.z + 0.5; p.layer = 0;
    }
    this.players.set(id, p);
    this.emit({ kind: 'join', id, name });
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.emit({ kind: 'leave', id, name: p.name });
  }

  newPlayer() {
    return {
      x: World.SPAWN.x + 0.5, z: World.SPAWN.z + 0.5, layer: 0,
      xp: { hits: 1154 }, curHits: 10, style: 2,
      inv: [{ id: 'bronze_axe', qty: 1 }, { id: 'bronze_pickaxe', qty: 1 }, { id: 'tinderbox', qty: 1 }, { id: 'net', qty: 1 }],
      worn: this.emptyWorn(), nextAtkTick: 0, run: false, bank: []
    };
  }

  // same slot map as singleplayer (Game.WORN_SLOTS) — cape and legs included
  emptyWorn() { return { head: null, amulet: null, cape: null, body: null, legs: null, weapon: null, shield: null }; }

  fromSave(d) {
    const p = this.newPlayer();
    p.xp = d.xp || p.xp; p.curHits = d.curHits || 10; p.inv = d.inv || p.inv;
    p.x = d.x || p.x; p.z = d.z || p.z; p.layer = d.layer || 0; p.style = d.style == null ? 2 : d.style;
    p.run = !!d.run;
    // Sanitise on load: a save is written by the host's own storage, but a corrupt or
    // hand-edited one should not be able to conjure items that do not exist.
    p.bank = Array.isArray(d.bank)
      ? d.bank.filter(b => b && ITEMS[b.id] && b.qty > 0)
              .map(b => ({ id: b.id, qty: Math.min(b.qty | 0, this.MAX_STACK), tab: (b.tab | 0) || 1 }))
              .slice(0, this.MAX_BANK)
      : [];
    // Object.assign fills in slots a save predates (cape/legs arrived with Southmarch)
    p.worn = Object.assign(this.emptyWorn(), d.worn || null);
    if (!d.worn) for (let i = 0; i < p.inv.length; i++) { const it = p.inv[i]; if (it && it.eq) { delete it.eq; const sl = ITEMS[it.id] && ITEMS[it.id].slot; if (sl) { p.worn[sl] = it; p.inv[i] = null; } } }
    p.inv = p.inv.filter(x => x); // server keeps a dense inventory
    return p;
  }

  toSave(p) {
    return { xp: p.xp, curHits: p.curHits, inv: p.inv, worn: p.worn, x: p.x, z: p.z, layer: p.layer, style: p.style, run: !!p.run, bank: p.bank || [] };
  }

  level(p, sk) { return levelForXp(p.xp[sk] || 0); }
  maxHits(p) { return this.level(p, 'hits'); }
  // same formula as Game.combatLevel, so event scaling matches singleplayer exactly
  combatLevel(p) {
    return Math.max(3, Math.floor((this.level(p, 'attack') + this.level(p, 'strength') +
      this.level(p, 'defense') + this.level(p, 'hits')) / 4));
  }

  addXp(p, sk, amt) {
    const before = this.level(p, sk);
    p.xp[sk] = (p.xp[sk] || 0) + amt;
    const after = this.level(p, sk);
    if (after > before) {
      if (sk === 'hits') p.curHits++;
      this.emit({ kind: 'to', id: p.id, msg: { t: 'levelup', skill: sk, level: after } });
    }
    this.pushStats(p);
  }

  pushStats(p) { this.emit({ kind: 'to', id: p.id, msg: { t: 'you', xp: p.xp, curHits: p.curHits, maxHits: this.maxHits(p), inv: p.inv, worn: p.worn, style: p.style, run: !!p.run } }); }
  toPlayer(p, text, cls) { this.emit({ kind: 'to', id: p.id, msg: { t: 'msg', text, cls: cls || 'm-game' } }); }

  // ---------- inventory ----------
  // Bank notes (`noted: true`) are inert placeholders: a stackable receipt for items
  // sitting in the bank, worth nothing until reclaimed. Every "do I really have this?"
  // query below skips them, exactly as singleplayer does — otherwise a note for 1000
  // logs would read as 1000 logs you could smelt, fletch or hand to a quest NPC.
  count(p, id) { return p.inv.reduce((n, i) => n + (i.id === id && !i.noted ? i.qty : 0), 0); }
  has(p, id) { return p.inv.some(i => i.id === id && !i.noted); }
  add(p, id, qty = 1) {
    const def = ITEMS[id];
    if (def.stack) {
      const it = p.inv.find(i => i.id === id && !i.noted);
      if (it) { it.qty += qty; return true; }
      if (p.inv.length >= 30) return false;
      p.inv.push({ id, qty });
    } else {
      for (let i = 0; i < qty; i++) {
        if (p.inv.length >= 30) return false;
        p.inv.push({ id, qty: 1 });
      }
    }
    return true;
  }
  // A note stack ignores the item's own stackability — that is the whole point of it.
  addNote(p, id, qty = 1) {
    const it = p.inv.find(i => i.id === id && i.noted);
    if (it) { it.qty += qty; return true; }
    if (p.inv.length >= 30) return false;
    p.inv.push({ id, qty, noted: true });
    return true;
  }
  remove(p, id, qty = 1) {
    let left = qty;
    for (let i = p.inv.length - 1; i >= 0 && left > 0; i--) {
      const it = p.inv[i];
      if (it.id !== id || it.noted) continue;      // never consume from a note
      if (it.qty > left) { it.qty -= left; left = 0; }
      else { left -= it.qty; p.inv.splice(i, 1); }
    }
  }

  // ---------- bank ----------
  // The bank is per-player storage the sim owns outright. The client mirrors it for
  // rendering but never mutates it: every change below goes through an intent that
  // re-checks the player is actually standing at a booth, so a modified client cannot
  // bank from the middle of a dungeon or withdraw what it does not have.
  MAX_BANK = 400;        // distinct stacks; the host is someone's browser, so cap it
  MAX_STACK = 2000000000;

  // Returns the booth they have open, or null — revalidated on every operation
  // rather than trusted from when the bank was opened.
  atBank(p) {
    if (p.bankKey === undefined || p.bankKey === null) return null;
    const s = World.L[p.layer] && World.L[p.layer].scenery.get(p.bankKey);
    if (!s || s.type !== 'bank_booth') return null;
    if (Math.max(Math.abs(Math.floor(p.x) - s.x), Math.abs(Math.floor(p.z) - s.z)) > 1) return null;
    return s;
  }
  closeBank(p, tell) {
    if (p.bankKey === undefined || p.bankKey === null) return;
    p.bankKey = null;
    this.emit({ kind: 'to', id: p.id, msg: { t: 'bank', open: false } });
    if (tell) this.toPlayer(p, 'You step away from the bank booth.', 'm-game');
  }
  pushBank(p, open) {
    this.emit({ kind: 'to', id: p.id, msg: { t: 'bank', open: open !== false, items: p.bank } });
  }
  // Guard shared by every bank intent: silently drops the request and closes the
  // window if the player is no longer at a booth.
  bankOp(p) {
    if (!p.bank) p.bank = [];
    if (!this.atBank(p)) { this.closeBank(p); return false; }
    return true;
  }
  bankAdd(p, id, qty, tab) {
    const b = p.bank.find(x => x.id === id);
    if (b) { b.qty += qty; return true; }
    if (p.bank.length >= this.MAX_BANK) { this.toPlayer(p, 'Your bank is full.', 'm-red'); return false; }
    p.bank.push({ id, qty, tab: tab || 1 });
    return true;
  }

  // Deposit `qty` of an item by id, drawn from real (un-noted) stacks only.
  intentBankDeposit(p, id, qty, tab) {
    if (!this.bankOp(p)) return;
    if (!ITEMS[id]) return;
    qty = Math.min(qty | 0, this.count(p, id));
    if (qty <= 0) return;
    if (!this.bankAdd(p, id, qty, tab)) return;
    this.remove(p, id, qty);
    this.pushStats(p); this.pushBank(p);
  }

  // Deposit from ONE slot. This is the path a note takes — count()/remove() ignore
  // notes by design, so a note can only be banked by slot index.
  intentBankDepositSlot(p, index, qty) {
    if (!this.bankOp(p)) return;
    const it = p.inv[index | 0];
    if (!it) return;
    qty = Math.min(qty | 0, it.qty || 1);
    if (qty <= 0) return;
    if (!this.bankAdd(p, it.id, qty, undefined)) return;
    if ((it.qty || 1) > qty) it.qty -= qty; else p.inv.splice(index | 0, 1);
    this.pushStats(p); this.pushBank(p);
  }

  intentBankDepositAll(p) {
    if (!this.bankOp(p)) return;
    let moved = 0;
    // Walk backwards: entries are spliced out as they go.
    for (let i = p.inv.length - 1; i >= 0; i--) {
      const it = p.inv[i];
      if (!it) continue;
      if (!this.bankAdd(p, it.id, it.qty || 1, undefined)) break;   // bank full
      p.inv.splice(i, 1); moved++;
    }
    if (moved) { this.pushStats(p); this.pushBank(p); }
  }

  intentBankWithdraw(p, id, qty, asNote) {
    if (!this.bankOp(p)) return;
    const b = p.bank.find(x => x.id === id);
    if (!b) return;
    qty = Math.min(qty | 0, b.qty);
    if (qty <= 0) return;
    const def = ITEMS[id];
    let moved = 0;
    if (asNote) { if (this.addNote(p, id, qty)) moved = qty; }
    else if (def.stack) { if (this.add(p, id, qty)) moved = qty; }
    else for (let i = 0; i < qty; i++) { if (!this.add(p, id, 1)) break; moved++; }
    if (!moved) { this.toPlayer(p, "You can't carry any more.", 'm-red'); return; }
    b.qty -= moved;
    if (b.qty <= 0) p.bank.splice(p.bank.indexOf(b), 1);
    this.pushStats(p); this.pushBank(p);
  }

  // Filing a stack into one of the numbered tabs — purely organisational.
  intentBankTab(p, id, tab) {
    if (!this.bankOp(p)) return;
    const b = p.bank.find(x => x.id === id);
    if (!b) return;
    b.tab = Math.max(1, Math.min(8, tab | 0));
    this.pushBank(p);
  }

  // ---------- shops ----------
  // Shared stock, so every change has to reach everyone standing at that counter —
  // not just whoever caused it. Otherwise two players buy the last sword each.
  pushShop(p, open) {
    this.emit({ kind: 'to', id: p.id, msg: { t: 'shop', open: open !== false, shop: p.shopId, stock: this.shops[p.shopId] || [] } });
  }
  pushShopToViewers(shopId, chimeFor) {
    for (const q of this.players.values()) {
      if (q.shopId !== shopId) continue;
      this.emit({ kind: 'to', id: q.id, msg: { t: 'shop', open: true, shop: shopId, stock: this.shops[shopId] || [], chime: q.id === chimeFor } });
    }
  }
  closeShop(p, tell) {
    if (!p.shopId) return;
    p.shopId = null; p.shopNpcId = 0;
    this.emit({ kind: 'to', id: p.id, msg: { t: 'shop', open: false } });
    if (tell) this.toPlayer(p, 'You finish trading.', 'm-game');
  }

  // Re-checked before every transaction, like the bank's atBank().
  atShop(p) {
    if (!p.shopId || !this.shops[p.shopId]) return false;
    const n = this.npcs.find(m => m.id === p.shopNpcId);
    if (!n || n.deadUntil || n.layer !== p.layer) return false;
    const d = NPC_DEFS[n.type];
    if (!d || d.trade !== p.shopId) return false;
    return Math.max(Math.abs(Math.floor(p.x) - n.x), Math.abs(Math.floor(p.z) - n.z)) <= 1;
  }
  shopOp(p) { if (!this.atShop(p)) { this.closeShop(p); return false; } return true; }

  shopCurrency(shopId) { return (SHOP_DEFS[shopId] || {}).currency || 'coins'; }
  shopPrice(st) { return st.price !== undefined ? st.price : ITEMS[st.id].value; }

  intentShopOpen(p, npcId) {
    const n = this.npcs.find(m => m.id === (npcId | 0));
    if (!n || n.deadUntil || n.layer !== p.layer) return;
    const d = NPC_DEFS[n.type];
    // Ghostly traders are gated behind quest progress the sim does not model, so
    // they stay shut here rather than being silently free to everyone.
    if (!d || !d.trade || d.ghostly || !this.shops[d.trade]) return;
    if (Math.max(Math.abs(Math.floor(p.x) - n.x), Math.abs(Math.floor(p.z) - n.z)) > 1) return;
    this.closeBank(p);
    p.shopId = d.trade; p.shopNpcId = n.id;
    this.pushShop(p, true);
  }

  intentBuy(p, id, qty) {
    if (!this.shopOp(p)) return;
    const shop = this.shops[p.shopId];
    const st = shop.find(s => s.id === id);
    if (!st) { this.toPlayer(p, 'The shop has run out of stock.', 'm-red'); return; }
    const cur = this.shopCurrency(p.shopId), price = this.shopPrice(st);
    let bought = 0;
    for (let i = 0; i < Math.max(0, qty | 0); i++) {
      if (st.qty <= 0) { this.toPlayer(p, 'The shop has run out of stock.', 'm-red'); break; }
      if (this.count(p, cur) < price) { this.toPlayer(p, "You don't have enough " + ITEMS[cur].name.toLowerCase() + '.', 'm-red'); break; }
      if (!this.add(p, id, 1)) { this.toPlayer(p, "You can't carry any more.", 'm-red'); break; }
      this.remove(p, cur, price);
      st.qty--; bought++;
    }
    if (!bought) return;
    this.pushStats(p);
    this.pushShopToViewers(p.shopId, p.id);   // everyone at this counter sees the shelf drop
  }

  intentSell(p, id, qty) {
    if (!this.shopOp(p)) return;
    const def = ITEMS[id];
    if (!def) return;
    if (this.shopCurrency(p.shopId) !== 'coins') { this.toPlayer(p, 'They have no use for that, and no coin to offer you.', 'm-red'); return; }
    if (!def.value || def.quest) { this.toPlayer(p, "You can't sell that.", 'm-red'); return; }
    const sd = SHOP_DEFS[p.shopId] || {};
    // A shop always buys back what it stocks, whatever category that lands in.
    const stocksIt = (sd.stock || []).some(s => s[0] === id);
    if (sd.accepts && !stocksIt && !sd.accepts.includes(shopCategory(id))) {
      this.toPlayer(p, sd.name + ' deals in ' + sd.accepts.map(c => SHOP_CAT_NAME[c]).join(' and ') + '. Try the general store for that.', 'm-red');
      return;
    }
    qty = Math.min(qty | 0, this.count(p, id));   // count() skips notes, so you cannot sell a receipt
    if (qty <= 0) return;
    this.remove(p, id, qty);
    this.add(p, 'coins', Math.floor(def.value * 0.6) * qty);
    const shop = this.shops[p.shopId];
    const st = shop.find(s => s.id === id);
    if (st) st.qty += qty; else shop.push({ id, qty, initial: 0 });
    this.pushStats(p);
    this.pushShopToViewers(p.shopId, p.id);
  }

  // ---------- intents from clients ----------
  // Run is a plain speed toggle here, exactly as in singleplayer — there is no
  // energy system to drain. Movement speed is applied in step(), so the client
  // cannot make itself faster by lying about it.
  intentRun(p, on) { p.run = !!on; this.pushStats(p); }

  intentWalk(p, x, z) {
    p.action = null;
    this.closeBank(p); this.closeShop(p);   // walking off closes both counters, as in RS2
    const path = World.findPath(p.layer, Math.floor(p.x), Math.floor(p.z), x, z);
    if (path) p.path = path;
  }

  intentAction(p, a) {
    // a: {kind:'chop'|'mine'|'fish'|'attack'|'take'|'climb', key?, x?, z?, npcId?, gid?}
    // attacking a NEW target resets the weapon timer so the first blow lands on arrival
    if (a && a.kind === 'attack' && (!p.action || p.action.kind !== 'attack' || p.action.npcId !== a.npcId)) p.nextAtkTick = 0;
    // Doing anything else shuts the box — including walking to a different booth,
    // which re-opens it on arrival with the right key.
    if (!a || a.kind !== 'bank') this.closeBank(p);
    this.closeShop(p);
    p.action = a;
    p.path = [];
  }

  // an emote is broadcast so other players see the pose; the server keeps the id
  // on the player so it also rides along in the snapshot for anyone arriving late
  intentEmote(p, id) {
    if (!EMOTE_BY_ID[id]) return;
    p.action = null; p.path = [];
    p.emote = { id, t0: Date.now(), seq: (p.emote ? p.emote.seq : 0) + 1 };
    this.emit({ kind: 'emote', id: p.id, emote: id });
  }

  intentChat(p, text) {
    text = String(text || '').slice(0, 120);
    if (text) this.emit({ kind: 'chat', id: p.id, name: p.name, text, layer: p.layer, x: p.x, z: p.z });
  }

  intentEat(p, gidUnused, itemIndex) {
    const it = p.inv[itemIndex];
    if (!it || it.noted || !ITEMS[it.id].heal) return;   // a note is a receipt, not a meal
    const def = ITEMS[it.id];
    p.inv.splice(itemIndex, 1);
    p.curHits = Math.min(this.maxHits(p), p.curHits + def.heal);
    this.toPlayer(p, 'You eat the ' + def.name.toLowerCase() + '.', 'm-game');
    this.pushStats(p);
  }

  intentDrop(p, itemIndex) {
    const it = p.inv[itemIndex];
    if (!it) return;
    p.inv.splice(itemIndex, 1);
    // `noted` has to travel with the item. Dropping a note for 1000 logs and letting
    // anyone pick it up as 1000 real logs would be a duplication bug, and a lucrative
    // one — the flag is what keeps a receipt a receipt.
    this.ground.push({ id: it.id, qty: it.qty, noted: !!it.noted, x: Math.floor(p.x), z: Math.floor(p.z), layer: p.layer, until: Date.now() + 180000 });
    this.pushStats(p);
  }

  // ---------- main loop (call every 150ms) ----------
  step(dt) {
    this._tick++;
    const slow = this._tick % SLOW_EVERY === 0;
    const now = Date.now();

    // continuous movement for players
    for (const p of this.players.values()) {
      p.moving = false;
      if (p.path.length) {
        const n = p.path[0], tx = n.x + 0.5, tz = n.z + 0.5;
        const ddx = tx - p.x, ddz = tz - p.z, dd = Math.hypot(ddx, ddz);
        const stp = (p.run ? RUN_SPEED : MOVE_SPEED) * dt;
        if (dd <= stp) { p.x = tx; p.z = tz; p.path.shift(); }
        else { p.x += ddx / dd * stp; p.z += ddz / dd * stp; }
        p.moving = true;
      }
    }
    // continuous movement for npcs toward their tile
    for (const n of this.npcs) {
      const tx = n.x + 0.5, tz = n.z + 0.5;
      const ddx = tx - n.fx, ddz = tz - n.fz, dd = Math.hypot(ddx, ddz);
      if (dd > 0.01) { const stp = Math.min(dd, 1.9 * dt); n.fx += ddx / dd * stp; n.fz += ddz / dd * stp; n.moving = true; }
      else n.moving = false;
    }

    if (slow) {
      this.slowTick(now);
    }
  }

  slowTick(now) {
    this._gtick++;               // one game tick (600ms) — drives player & NPC attack speeds
    // Stock drifts one step back toward its starting level every 40 game ticks — the
    // same cadence and the same Math.sign drift singleplayer uses, so a shop refills
    // after a raid and sheds anything players over-sold into it.
    if (this._gtick % 40 === 0) {
      const moved = new Set();
      for (const [sid, shop] of Object.entries(this.shops))
        for (const st of shop) { const d = Math.sign(st.initial - st.qty); if (d) { st.qty += d; moved.add(sid); } }
      for (const sid of moved) this.pushShopToViewers(sid);
    }
    Events.tick(this.eventCtx);
    // scenery respawns / fire expiry
    for (let l = 0; l < 2; l++) {
      for (const [key, s] of World.L[l].scenery) {
        if (s.type === 'fire' && s.expireAt && now > s.expireAt) { this.setScenery(l, s.x, s.z, null); continue; }
        if (s.respawnAt && now > s.respawnAt) this.setScenery(l, s.x, s.z, s.restore, null, 0);
      }
    }
    // ground expiry + relic respawn
    this.ground = this.ground.filter(g => g.until === Infinity || now < g.until);
    for (const sp of this.itemSpawns) {
      if (!this.ground.some(g => g.spawn === sp) && now > sp.respawnAt)
        this.ground.push({ id: sp.id, qty: 1, x: sp.x, z: sp.z, layer: sp.layer, until: Infinity, spawn: sp });
    }
    for (const p of this.players.values()) this.resolveAction(p, now);
    this.tickNpcs(now);
  }

  // ---------- gather chance / combat rolls (identical numbers to singleplayer) ----------
  // best tool of a kind the player can actually swing (mirrors Game.bestAxe/bestPick)
  bestTool(p, flag, skill) {
    let best = null, bestTier = -1;
    const worn = p.worn || {};
    const pool = p.inv.concat(worn.weapon ? [worn.weapon] : []);
    for (const i of pool) {
      if (!i || i.noted || !ITEMS[i.id] || !ITEMS[i.id][flag]) continue;
      if (this.level(p, skill) < Combat.toolLevel(i.id)) continue;
      const tier = Combat.metalTier(i.id);
      if (tier > bestTier) { bestTier = tier; best = i.id; }
    }
    return best;
  }
  // a better tool rolls more often, it is not luckier (mirrors Game.toolReady)
  toolReady(p, toolId) {
    const every = Combat.toolInterval(toolId);
    if (every <= 1) return true;
    p.action.swings = (p.action.swings || 0) + 1;
    if (p.action.swings < every) return false;
    p.action.swings = 0;
    return true;
  }
  rollHit(att, str, def) {
    const pr = (att + 8) / (att + def + 16);
    if (Math.random() >= pr) return 0;
    const maxHit = 1 + Math.floor(str * 0.15);
    return 1 + Math.floor(Math.random() * maxHit);
  }
  // ---- worn equipment (mirrors singleplayer's player.worn slot-map) ----
  equippedIn(p, slot) { return (p.worn && p.worn[slot]) || null; }
  equipBonus(p) {
    let aim = 0, power = 0, armour = 0, mAim = 0, rAim = 0, rPow = 0;
    for (const slot in (p.worn || {})) {
      const it = p.worn[slot]; if (!it) continue; const d = ITEMS[it.id];
      aim += d.aim || 0; power += d.power || 0; armour += d.armour || 0; mAim += d.mAim || 0;
      rAim += d.rAim || 0; rPow += d.rPow || 0;
    }
    return { aim, power, armour, mAim, rAim, rPow };
  }
  playerArmourClass(p) {
    const b = this.equippedIn(p, 'body'), h = this.equippedIn(p, 'head'), lg = this.equippedIn(p, 'legs');
    return Combat.armourClass(b ? b.id : null, h ? h.id : null, lg ? lg.id : null);
  }
  // chance a loosed arrow is recovered instead of spent (Ava's Satchel: 0.72)
  arrowSave(p) { const c = this.equippedIn(p, 'cape'); return Combat.arrowSave(c ? c.id : null); }
  weaponSpeed(p) { const w = this.equippedIn(p, 'weapon'); return Combat.weaponSpeed(w ? w.id : null); }
  bestArrow(p) {
    let best = null, bestPow = -1;
    // `!i.noted` matters: a note for 1000 arrows is a receipt, not a quiver.
    for (const i of p.inv) { if (!i || i.noted) continue; const d = ITEMS[i.id]; if (d.power && i.id.endsWith('_arrow') && d.power > bestPow) { bestPow = d.power; best = i.id; } }
    return best;
  }

  wield(p, i) {
    const it = p.inv[i]; if (!it) return;
    if (it.noted) { this.toPlayer(p, 'You need to reclaim that at a bank before you can wear it.', 'm-game'); return; }
    const def = ITEMS[it.id]; if (!def.slot) return;
    if (def.slot === 'weapon' && def.wield && this.level(p, 'attack') < def.wield) { this.toPlayer(p, 'You need Attack ' + def.wield + ' to wield that.', 'm-red'); return; }
    if (def.slot !== 'weapon' && def.defReq && this.level(p, 'defense') < def.defReq) { this.toPlayer(p, 'You need Defense ' + def.defReq + ' to wear that.', 'm-red'); return; }
    const slot = def.slot, w = p.worn;
    // two-handed weapons and shields can't be worn together
    const extras = [];
    if (def.twoHand && w.shield) extras.push('shield');
    if (slot === 'shield' && w.weapon && ITEMS[w.weapon.id].twoHand) extras.push('weapon');
    p.inv.splice(i, 1);                    // dense inv: remove the item
    const swap = w[slot] || null;
    w[slot] = it;
    if (swap) p.inv.push(swap);
    for (const es of extras) { p.inv.push(w[es]); w[es] = null; }
    this.toPlayer(p, (slot === 'weapon' ? 'You wield the ' : 'You put on the ') + def.name + '.', 'm-game');
    this.pushStats(p);
  }
  unequip(p, slot) {
    const it = p.worn && p.worn[slot]; if (!it) return;
    if (p.inv.length >= 30) { this.toPlayer(p, 'Your inventory is full.', 'm-red'); return; }
    p.worn[slot] = null; p.inv.push(it);
    this.toPlayer(p, 'You unequip the ' + ITEMS[it.id].name + '.', 'm-game');
    this.pushStats(p);
  }
  intentWield(p, i) { this.wield(p, i | 0); }
  intentUnequip(p, slot) { if (['head', 'body', 'weapon', 'shield'].includes(slot)) this.unequip(p, slot); }

  resolveAction(p, now) {
    const a = p.action;
    if (!a) return;
    let tx, tz, reach = 1;
    if (a.npcId) {
      const n = this.npcs.find(m => m.id === a.npcId);
      if (!n || n.deadUntil || n.layer !== p.layer) { p.action = null; return; }
      a._n = n; tx = n.x; tz = n.z;
      // bows fire from range 5
      if (a.kind === 'attack') { const w = this.equippedIn(p, 'weapon'); if (w && ITEMS[w.id].bow && this.bestArrow(p)) reach = 5; }
    } else if (a.gid) {
      const g = this.ground.find(x => x.gid === a.gid);
      if (!g) { p.action = null; return; }
      a._g = g; tx = g.x; tz = g.z; reach = 0;
    } else if (a.key !== undefined) {
      const s = World.L[p.layer].scenery.get(a.key);
      if (!s) { p.action = null; return; }
      a._s = s; tx = s.x; tz = s.z;
    } else { p.action = null; return; }

    const px = Math.floor(p.x), pz = Math.floor(p.z);
    const dist = Math.max(Math.abs(px - tx), Math.abs(pz - tz));
    if (dist > reach) {
      if (!p.path.length) {
        const path = World.findPath(p.layer, px, pz, tx, tz);
        // stop BESIDE an NPC we're meleeing, never on top of it
        if (path && path.length && a.npcId && reach === 1) { const last = path[path.length - 1]; if (last.x === tx && last.z === tz) path.pop(); }
        if (path && path.length) p.path = path;
        else { this.toPlayer(p, "I can't reach that!", 'm-red'); p.action = null; }
      }
      return;
    }
    p.path = [];

    switch (a.kind) {
      case 'chop': return this.doChop(p, a._s, now);
      case 'mine': return this.doMine(p, a._s, now);
      case 'fish': return this.doFish(p, a._s, now);
      case 'attack': return this.doAttack(p, a._n, now);
      case 'take': return this.doTake(p, a._g);
      case 'bank': {
        p.action = null;
        if (a._s.type !== 'bank_booth') return;
        // Remember which booth, so every later operation can re-check we are still
        // standing at it rather than trusting a flag set once.
        p.bankKey = a.key;
        this.toPlayer(p, 'The banker hands you your box.', 'm-game');
        this.pushBank(p, true);
        return;
      }
      case 'climb': {
        p.layer = a._s.type === 'ladder_down' ? 1 : 0;
        p.action = null;
        this.closeBank(p); this.closeShop(p);
        this.toPlayer(p, p.layer === 1 ? 'You climb down into the darkness...' : 'You climb up to the light.', 'm-game');
        this.emit({ kind: 'to', id: p.id, msg: { t: 'layer', layer: p.layer, x: p.x, z: p.z } });
        return;
      }
      default: p.action = null;
    }
  }

  doChop(p, s, now) {
    const td = TREE_DEFS[s.type];
    if (!td) { p.action = null; return; }
    const axe = this.bestTool(p, 'axe', 'woodcut');
    if (!axe) { this.toPlayer(p, 'You need an axe you can swing to chop this tree.', 'm-red'); p.action = null; return; }
    if (this.level(p, 'woodcut') < td.lvl) { this.toPlayer(p, 'You need Woodcut ' + td.lvl + '.', 'm-red'); p.action = null; return; }
    if (!a_started(p)) return;
    if (!this.toolReady(p, axe)) return;
    if (Math.random() < Combat.gatherChance(td.low, td.high, this.level(p, 'woodcut'))) {
      // every tree used to hand out plain `logs` here, so oaks and willows were
      // worthless in multiplayer no matter what the tree table said
      if (!this.add(p, td.log, 1)) { this.toPlayer(p, "You can't carry any more.", 'm-red'); p.action = null; return; }
      this.toPlayer(p, 'You get some ' + (td.log === 'logs' ? 'wood' : ITEMS[td.log].name.toLowerCase()) + '.');
      this.addXp(p, 'woodcut', td.xp);
      if (Math.random() < td.deplete) { this.setScenery(p.layer, s.x, s.z, 'stump', s.type, now + td.respawn * 1000 + Math.random() * 15000); p.action = null; }
    }
  }

  doMine(p, s, now) {
    const def = SCENERY_DEFS[s.type];
    if (!def.ore && !def.gemRock) { p.action = null; return; }
    const pick = this.bestTool(p, 'pick', 'mining');
    if (!pick) { this.toPlayer(p, 'You need a pickaxe you can swing to mine this rock.', 'm-red'); p.action = null; return; }
    if (this.level(p, 'mining') < def.lvl) { this.toPlayer(p, 'You need Mining ' + def.lvl + '.', 'm-red'); p.action = null; return; }
    if (!a_started(p)) return;
    if (!this.toolReady(p, pick)) return;
    // same guild rules as singleplayer: invisible +7 on the roll only, and half respawn
    const guild = World.inGuild(s.x, s.z);
    if (Math.random() < Combat.gatherChance(def.low, def.high, Combat.guildMiningLevel(this.level(p, 'mining'), guild))) {
      // gem rocks roll their prize from the shared table, exactly as singleplayer does
      const ore = def.gemRock ? Combat.rollGem() : def.ore;
      if (!this.add(p, ore, 1)) { this.toPlayer(p, "You can't carry any more.", 'm-red'); p.action = null; return; }
      this.toPlayer(p, def.gemRock ? 'You prise ' + ITEMS[ore].name.toLowerCase() + ' out of the rock!' :
                   'You manage to obtain some ' + ITEMS[ore].name.toLowerCase() + '.', def.gemRock ? 'm-lvl' : 'm-game');
      this.addXp(p, 'mining', def.xp);
      this.setScenery(p.layer, s.x, s.z, 'rock_empty', s.type, now + Combat.rockRespawnMs(def, guild) + Math.random() * 4000);
      p.action = null;
    }
  }

  doFish(p, s, now) {
    const lure = s.type === 'lure_spot';
    const tool = lure ? 'fishing_rod' : 'net';
    if (!this.has(p, tool)) { this.toPlayer(p, 'You need a ' + ITEMS[tool].name.toLowerCase() + '.', 'm-red'); p.action = null; return; }
    if (lure && !this.has(p, 'feather')) { this.toPlayer(p, 'You have no feathers left to tie a fly with.', 'm-red'); p.action = null; return; }
    const fl = this.level(p, 'fishing');
    if (lure && fl < 20) { this.toPlayer(p, 'You need Fishing 20 to fish here.', 'm-red'); p.action = null; return; }
    if (!a_started(p)) return;
    if (Math.random() < Combat.gatherChance(lure ? 30 : 85, lure ? 140 : 195, fl)) {
      let fish, xp;
      if (lure) { if (fl >= 30 && Math.random() < 0.5) { fish = 'raw_salmon'; xp = 70; } else { fish = 'raw_trout'; xp = 50; } }
      else { if (fl >= 15 && Math.random() < 0.4) { fish = 'raw_anchovies'; xp = 40; } else { fish = 'raw_shrimp'; xp = 10; } }
      if (!this.add(p, fish, 1)) { this.toPlayer(p, "You can't carry any more.", 'm-red'); p.action = null; return; }
      if (lure) this.remove(p, 'feather', 1);
      this.toPlayer(p, 'You catch some ' + ITEMS[fish].name.toLowerCase().replace('raw ', '') + '.');
      this.addXp(p, 'fishing', xp);
    }
  }

  doAttack(p, n, now) {
    const d = NPC_DEFS[n.type];
    if (!d.attackable) { this.toPlayer(p, 'You cannot attack that.', 'm-red'); p.action = null; return; }
    n.targetId = p.id;
    const wep = this.equippedIn(p, 'weapon');
    const usingBow = wep && ITEMS[wep.id].bow && this.bestArrow(p);
    const speed = usingBow ? Combat.bowSpeed(wep.id, p.style) : this.weaponSpeed(p);
    if (this._gtick < (p.nextAtkTick || 0)) return;   // weapon still recovering from the last swing
    p.nextAtkTick = this._gtick + speed;
    const eq = this.equipBonus(p);
    let dmg;
    if (usingBow) {                                    // ranged: consume an arrow, apply the triangle
      const arrow = this.bestArrow(p);
      // a lodestone-lined pack (Ava's Satchel) calls the arrow back instead of spending it
      const save = this.arrowSave(p);
      if (!(save > 0 && Math.random() < save)) this.remove(p, arrow, 1);
      const t = Combat.triMult('ranged', d.carmour);
      dmg = this.rollHit((this.level(p, 'ranged') + 4 + eq.rAim) * t, ((ITEMS[arrow].power || 2) + 2 + eq.rPow) * Combat.triPow(t), d.def);
      if (dmg > 0) { this.addXp(p, 'ranged', dmg * 4); this.addXp(p, 'hits', dmg * 1.33); }
      this.pushStats(p);                               // arrow count changed
    } else {                                           // melee
      const t = Combat.triMult('melee', d.carmour);
      dmg = this.rollHit((this.level(p, 'attack') + eq.aim) * t, (this.level(p, 'strength') + eq.power) * Combat.triPow(t), d.def);
      if (dmg > 0) {
        const style = p.style;
        if (style === 0) for (const sk of ['attack', 'strength', 'defense']) this.addXp(p, sk, dmg * 1.33);
        else this.addXp(p, ['attack', 'attack', 'strength', 'defense'][style], dmg * 4);
        this.addXp(p, 'hits', dmg * 1.33);
      }
    }
    Events.credit(this.eventCtx, n, p.id, dmg);
    // Track who hurt it, so the kill can be settled on damage rather than on who
    // happened to land the last blow (UPDATE_IDEAS §6A — open since 2001's
    // "the treasure now goes to whoever damaged the monster most overall").
    if (dmg > 0) { n.dmgBy = n.dmgBy || {}; n.dmgBy[p.id] = (n.dmgBy[p.id] || 0) + dmg; }
    n.hits -= dmg; n.splat = { v: dmg, until: now + 800 }; n.showHp = now + 5000;
    if (n.hits <= 0) this.killNpc(n, p, now);
  }

  killNpc(n, lastHit, now) {
    const d = NPC_DEFS[n.type];
    const dmgBy = n.dmgBy || {};
    // the kill belongs to whoever did the most damage, not the last hitter
    let owner = lastHit, best = -1;
    for (const [id, amt] of Object.entries(dmgBy))
      if (amt > best) { best = amt; const q = this.players.get(Number(id)); if (q) owner = q; }
    this.toPlayer(owner, 'You have defeated the ' + d.name + '.');
    if (owner !== lastHit && lastHit) this.toPlayer(lastHit, 'You land the killing blow, but ' + owner.name + ' did more of the work.', 'm-game');
    n.deadUntil = now + (d.respawn || 20) * 1000; n.targetId = 0; n.splat = null;
    n.dmgBy = null;
    // No kill bonus is paid here. Hits xp already lands per blow in doAttack, so every
    // contributor is paid in proportion to the damage they did. Awarding extra on the
    // kill would make multiplayer xp outrun singleplayer — the same game.js/sim.js drift
    // that produced four earlier bugs in this game.
    // drops land under the owner so the contributor reaches them first
    for (const g of Combat.rollDrops(n.type))
      this.ground.push({ id: g.id, qty: g.qty, x: n.x, z: n.z, layer: n.layer, until: now + 180000, owner: owner ? owner.id : 0, ownerUntil: now + 60000 });
  }

  doTake(p, g) {
    // loot from a kill is the contributor's for a minute before it goes public
    if (g.owner && g.owner !== p.id && Date.now() < (g.ownerUntil || 0)) {
      this.toPlayer(p, 'That is not yours yet.', 'm-red');
      p.action = null; return;
    }
    // A dropped note is picked up as a note. Routing it through add() instead would
    // mint the real items out of nothing.
    if (g.noted ? this.addNote(p, g.id, g.qty) : this.add(p, g.id, g.qty)) {
      const i = this.ground.indexOf(g);
      if (i >= 0) this.ground.splice(i, 1);
      if (g.spawn) g.spawn.respawnAt = Date.now() + 60000;
      this.toPlayer(p, 'You take the ' + ITEMS[g.id].name.toLowerCase() + (g.noted ? ' note.' : '.'));
      this.pushStats(p);
    } else this.toPlayer(p, "You can't carry any more.", 'm-red');
    p.action = null;
  }

  // No NPC may stand on a player's tile. Multiplayer has to check EVERY player on the
  // layer, not just the one it's chasing.
  npcCanStep(n, x, z) {
    if (World.blocked(n.layer, x, z)) return false;
    for (const p of this.players.values())
      if (p.layer === n.layer && Math.floor(p.x) === x && Math.floor(p.z) === z) return false;
    return true;
  }
  npcOnPlayer(n) {
    for (const p of this.players.values())
      if (p.layer === n.layer && Math.floor(p.x) === n.x && Math.floor(p.z) === n.z) return true;
    return false;
  }
  separateNpc(n) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]])
      if (this.npcCanStep(n, n.x + dx, n.z + dz)) { n.x += dx; n.z += dz; return true; }
    return false;
  }

  tickNpcs(now) {
    for (const n of this.npcs) {
      const d = NPC_DEFS[n.type];
      if (n.deadUntil) {
        if (now > n.deadUntil) {
          n.deadUntil = 0; n.hits = n.maxHits; n.dmgBy = null; n.sap = null;   // damage record and curses clear on respawn
          n.x = n.hx; n.z = n.hz; n.fx = n.x + 0.5; n.fz = n.z + 0.5;
          if (this.npcOnPlayer(n)) this.separateNpc(n);           // respawned on top of someone
        }
        continue;
      }
      if (this.npcOnPlayer(n)) this.separateNpc(n);
      // leash: how far it will stray from where it spawned (mirrors singleplayer)
      const leash = Combat.npcLeash(n.type);
      const home = Math.max(Math.abs(n.x - n.hx), Math.abs(n.z - n.hz));
      // find current target player if still valid
      let target = n.targetId ? this.players.get(n.targetId) : null;
      if (target && (target.layer !== n.layer)) { target = null; n.targetId = 0; }
      // aggression: pick nearest player within aggro range
      if (!target && d.aggro && home < leash) {
        let best = null, bd = d.aggro + 0.5;
        for (const p of this.players.values()) {
          if (p.layer !== n.layer) continue;
          // a monster far below a given player simply ignores them
          if (!Combat.stillAggressive(n.type, this.combatLevel(p))) continue;
          const dist = Math.max(Math.abs(p.x - n.x - 0.5), Math.abs(p.z - n.z - 0.5));
          if (dist < bd) { bd = dist; best = p; }
        }
        if (best) { target = best; n.targetId = best.id; }
      }
      if (!target) n.faceX = null;                       // nobody to face — go back to facing along movement
      if (target) {
        const px = Math.floor(target.x), pz = Math.floor(target.z);
        const dist = Math.max(Math.abs(n.x - px), Math.abs(n.z - pz));
        if (dist > 12 || home >= leash) { n.targetId = 0; n.faceX = null; continue; }
        const canBreathe = d.ranged && dist > 1 && dist <= d.maxRange;
        if (dist <= 1 || canBreathe) {
          // squared up: hold the stare on whoever we're trading blows with
          n.faceX = target.x; n.faceZ = target.z;
          if (this._gtick >= (n.nextAtkTick || 0)) {   // the enemy strikes on its own attack-speed timer
            n.nextAtkTick = this._gtick + Combat.npcSpeed(n.type);
            // a bumped sequence tells clients to play a strike, however the snapshot lands
            n.swingSeq = (n.swingSeq || 0) + 1;
            n.swingKind = canBreathe ? 'ranged' : (d.cstyle === 'magic' ? 'magic' : 'melee');
            const eq = this.equipBonus(target);
            const t = Combat.triMult(d.cstyle || 'melee', this.playerArmourClass(target)); // its style vs your armour
            const dmg = this.rollHit(d.att * t, d.str, this.level(target, 'defense') + eq.armour);
            target.splat = { v: dmg, until: now + 800 }; target.showHp = now + 5000; n.showHp = now + 5000;
            if (canBreathe) this.toPlayer(target, 'The dragon breathes fire at you!', 'm-red');
            if (dmg > 0) {
              target.curHits -= dmg;
              this.pushStats(target);
              if (target.curHits <= 0) this.killPlayer(target, now);
            }
          }
        } else {
          n.faceX = null;                                // closing in — face along the path instead
          const path = World.findPath(n.layer, n.x, n.z, px, pz);
          if (path && path.length && this.npcCanStep(n, path[0].x, path[0].z)) { n.x = path[0].x; n.z = path[0].z; } // never stand on a player
        }
      } else if (home > (d.wander || 0)) {
        // gave up the chase (or drifted) — head back to its own patch
        const path = World.findPath(n.layer, n.x, n.z, n.hx, n.hz);
        if (path && path.length) {
          if (this.npcCanStep(n, path[0].x, path[0].z)) { n.x = path[0].x; n.z = path[0].z; }
        } else if (this.npcCanStep(n, n.hx, n.hz)) { n.x = n.hx; n.z = n.hz; }
      } else if (d.wander && Math.random() < 0.2) {
        const nx = n.x + ((Math.random() * 3 | 0) - 1), nz = n.z + ((Math.random() * 3 | 0) - 1);
        if (Math.abs(nx - n.hx) <= d.wander && Math.abs(nz - n.hz) <= d.wander && this.npcCanStep(n, nx, nz)) { n.x = nx; n.z = nz; }
      }
    }
  }

  killPlayer(p, now) {
    this.toPlayer(p, 'Oh dear! You are dead...', 'm-red');
    this.closeBank(p); this.closeShop(p);   // you respawn in town, not at the counter
    // keep 3 most valuable stacks, drop the rest where you fell
    const dx = Math.floor(p.x), dz = Math.floor(p.z), dl = p.layer;
    // rank pack AND worn gear together; keep the 3 best (+ quest items) in place, drop the rest
    const held = p.inv.map(it => ({ it, from: 'inv' })).concat(Object.keys(p.worn || {}).filter(s => p.worn[s]).map(s => ({ it: p.worn[s], from: 'worn', slot: s })));
    // A note is worth nothing on the floor, so rank it at zero rather than letting a
    // note for 1000 logs outrank real armour and survive the death drop.
    const worth = (o) => o.it.noted ? 0 : (ITEMS[o.it.id].value || 0) * (o.it.qty || 1);
    held.sort((a, b) => worth(b) - worth(a));
    let kept = 0; const newInv = [];
    for (const o of held) {
      if ((ITEMS[o.it.id].quest && !o.it.noted) || kept < 3) { kept++; if (o.from === 'inv') newInv.push(o.it); } // kept worn gear stays worn
      else { this.ground.push({ id: o.it.id, qty: o.it.qty || 1, noted: !!o.it.noted, x: dx, z: dz, layer: dl, until: now + 180000 }); if (o.from === 'worn') p.worn[o.slot] = null; }
    }
    p.inv = newInv;
    p.curHits = this.maxHits(p);
    p.x = World.SPAWN.x + 0.5; p.z = World.SPAWN.z + 0.5; p.layer = 0; p.path = []; p.action = null;
    for (const n of this.npcs) if (n.targetId === p.id) n.targetId = 0;
    this.pushStats(p);
    this.emit({ kind: 'to', id: p.id, msg: { t: 'layer', layer: 0, x: p.x, z: p.z } });
  }

  // ---------- snapshot for one player (only same-layer, nearby entities) ----------
  snapshotFor(p) {
    let gid = 1;
    for (const g of this.ground) if (!g.gid) g.gid = gid++; else gid = Math.max(gid, g.gid + 1);
    const near = (x, z) => Math.abs(x - p.x) < 26 && Math.abs(z - p.z) < 26;
    return {
      t: 'snap',
      me: { id: p.id, x: p.x, z: p.z, moving: p.moving, curHits: p.curHits, maxHits: this.maxHits(p), splat: p.splat, showHp: p.showHp },
      players: [...this.players.values()].filter(q => q.id !== p.id && q.layer === p.layer && near(q.x, q.z))
        .map(q => ({ id: q.id, name: q.name, x: q.x, z: q.z, moving: q.moving, curHits: q.curHits, maxHits: this.maxHits(q), splat: q.splat, showHp: q.showHp })),
      npcs: this.npcs.filter(n => !n.deadUntil && n.layer === p.layer && near(n.fx, n.fz))
        .map(n => ({ id: n.id, type: n.type, fx: n.fx, fz: n.fz, moving: n.moving, hits: n.hits, maxHits: n.maxHits,
                     splat: n.splat, showHp: n.showHp, fcx: n.faceX, fcz: n.faceZ, sw: n.swingSeq, swk: n.swingKind })),
      ground: this.ground.filter(g => g.layer === p.layer && near(g.x, g.z))
        .map(g => ({ gid: g.gid, id: g.id, qty: g.qty, noted: g.noted || undefined, x: g.x, z: g.z })),
      events: Events.hudAll(this.eventCtx)
    };
  }

  allOverrides() { return [...this.sceneryOverrides.values()]; }
}

// helper: two-stage gather (first slow tick = swing, second = roll). Uses a per-action flag.
function a_started(p) { if (!p.action.started) { p.action.started = true; return false; } return true; }
