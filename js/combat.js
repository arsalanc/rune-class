'use strict';
// ---------------------------------------------------------------------------
// combat.js — pure, stateless combat maths shared by singleplayer (game.js) and
// the authoritative server (sim.js via the shared VM bundle). Depends only on the
// data tables (ITEMS / NPC_DEFS), so both sides compute damage, speeds and the
// combat triangle identically. No game state, no UI, no `this.player`.
// ---------------------------------------------------------------------------
const Combat = {
  // combat triangle: magic > melee > ranged > magic. An attacker's style has an
  // ADVANTAGE against the armour class it beats and is RESISTED by the class that beats it.
  TRI_BEATS: { magic: 'melee', melee: 'ranged', ranged: 'magic' },

  // accuracy + damage roll (RSC formula)
  rollHit(att, str, def) {
    const p = (att + 8) / (att + def + 16);
    if (Math.random() >= p) return 0;
    const maxHit = 1 + Math.floor(str * 0.15);
    return 1 + Math.floor(Math.random() * maxHit);
  },

  // triangle multiplier applied to the attacker's accuracy (and a small ±10% to power)
  triMult(atkStyle, armour) {
    if (!atkStyle || !armour || armour === 'none') return 1;
    if (this.TRI_BEATS[atkStyle] === armour) return 1.25;   // advantage (armour is weak to this style)
    if (this.TRI_BEATS[armour] === atkStyle) return 0.8;    // resisted (armour is strong vs this style)
    return 1;
  },
  // small power nudge that pairs with triMult (advantage hits a touch harder, resist a touch softer)
  triPow(t) { return t > 1 ? 1.1 : t < 1 ? 0.9 : 1; },

  // which style a monster is weak to (null if it has no armour class)
  npcWeakness(type) {
    const a = (NPC_DEFS[type] || {}).carmour;
    if (!a || a === 'none') return null;
    for (const s in this.TRI_BEATS) if (this.TRI_BEATS[s] === a) return s;
    return null;
  },

  // Will this monster still pick a fight? A creature far below you loses interest,
  // which is what stops a level-60 walking past goblins from being a running battle.
  // `relentless` monsters ignore the rule entirely — the same exception the wilderness
  // got when this landed in 2002.
  AGGRO_RATIO: 2,
  stillAggressive(type, playerCombatLevel) {
    const d = NPC_DEFS[type] || {};
    if (!d.aggro) return false;
    if (d.relentless) return true;
    const lvl = Math.max(1, Math.floor((d.att + d.str + d.def + d.hits) / 4));
    return playerCombatLevel < lvl * this.AGGRO_RATIO;
  },

  // ---- loot ---------------------------------------------------------------
  // Roll one `pick` entry: the chance decides whether we reach the table at all,
  // then exactly ONE row comes out, chosen by weight. Returns null on a miss.
  rollPick(p) {
    if (Math.random() >= p.chance) return null;
    const list = p.table ? DROP_TABLES[p.table] : p.of;
    if (!list || !list.length) return null;
    let total = 0;
    for (const r of list) total += r[3];
    let n = Math.random() * total;
    for (const [id, mn, mx, w] of list) {
      n -= w;
      if (n <= 0) return { id, qty: mn + Math.floor(Math.random() * (mx - mn + 1)) };
    }
    return null;
  },
  // everything a kill produces: independent `drops` plus any one-of `pick` tables
  rollDrops(type) {
    const d = NPC_DEFS[type] || {};
    const out = [];
    for (const [id, mn, mx, ch] of (d.drops || []))
      if (Math.random() < ch) out.push({ id, qty: mn + Math.floor(Math.random() * (mx - mn + 1)) });
    for (const p of (d.pick || [])) {
      const got = this.rollPick(p);
      if (got) out.push(got);
    }
    return out;
  },

  // A gem seam gives one uncut stone, weighted so a diamond stays an occasion.
  GEM_ODDS: [['uncut_sapphire', 60], ['uncut_emerald', 25], ['uncut_ruby', 11], ['uncut_diamond', 4]],
  rollGem() {
    let n = Math.random() * 100;
    for (const [id, w] of this.GEM_ODDS) { n -= w; if (n <= 0) return id; }
    return 'uncut_sapphire';
  },

  // ---- gathering ----------------------------------------------------------
  // Success chance per roll, interpolated between a resource's `low` (at level 1)
  // and `high` (at level 99) weighting. This is the shape RuneScape uses for every
  // gathering skill, and it behaves very differently from a flat linear ramp: hard
  // resources stay genuinely slow deep into the level range instead of pinning at
  // 95% a few levels after you unlock them. Weights are out of 255.
  gatherChance(low, high, level) {
    const lvl = Math.max(1, Math.min(99, level));
    return Math.floor((low * (99 - lvl) + high * (lvl - 1)) / 98) / 255;
  },

  // ---- Mining Guild ----
  // Theirs gives an invisible +7 Mining inside the guild and respawns rocks 50% faster.
  // "Invisible" matters: it improves your odds on a swing but never unlocks a rock you
  // couldn't otherwise mine, so the guild speeds you up without skipping requirements.
  // Both live here because the client and the server each need them and must agree.
  GUILD_MINING_BOOST: 7,
  GUILD_RESPAWN_MULT: 0.5,
  guildMiningLevel(level, inGuild) { return inGuild ? level + this.GUILD_MINING_BOOST : level; },
  rockRespawnMs(def, inGuild) {
    const base = (def.respawn || 8) * 1000;
    return inGuild ? base * this.GUILD_RESPAWN_MULT : base;
  },

  // A better tool does not make you luckier, it makes you roll more often — the
  // distinction the real skill draws, and the reason a rune pickaxe is worth
  // carrying even though it never improves your odds on any single swing.
  // Returns the number of game ticks between rolls.
  toolInterval(toolId) {
    const tier = this.metalTier(toolId);
    return tier < 0 ? 3 : Math.max(1, 3 - tier);
  },
  metalTier(itemId) { return itemId ? METALS.findIndex(m => itemId.startsWith(m.id + '_')) : -1; },
  // level needed to swing a tool of this tier at all
  toolLevel(toolId) { const t = this.metalTier(toolId); return t < 0 ? 1 : METALS[t].wield; },

  // ---- attack speed in ticks (1 tick = 0.6s). Slower weapons carry more power. ----
  weaponSpeed(weaponId) { const d = weaponId && ITEMS[weaponId]; return (d && d.speed) || 4; }, // 4 = unarmed
  bowSpeed(bowId, style) { const d = ITEMS[bowId] || {}; return (style === 2 && d.rapidSpeed) ? d.rapidSpeed : (d.speed || 4); }, // Aggressive style = Rapid
  npcSpeed(type) { return (NPC_DEFS[type] && NPC_DEFS[type].speed) || 4; },

  // how far a monster will stray from its spawn point before it gives up and walks
  // back. Keeps road monsters on the road instead of trailing you into a town.
  npcLeash(type) { return (NPC_DEFS[type] && NPC_DEFS[type].leash) || 12; },

  // an actor's defensive armour class, from its body, then legs, then head gear ids
  // (body decides the look of a kit; legs break the tie before a lone helmet does)
  armourClass(bodyId, headId, legsId) {
    const cls = id => (id && ITEMS[id] && ITEMS[id].dclass) || null;
    return cls(bodyId) || cls(legsId) || cls(headId) || 'none';
  },

  // Ava's Satchel and its kin recover loosed arrows. Modelled exactly as OSRS does:
  // each shot is kept with probability p, so a single arrow is fired n times with
  // p(n) = (1-p)·p^(n-1), for an expected 1/(1-p) shots per arrow (3.57 at p=0.72).
  arrowSave(capeId) { const d = capeId && ITEMS[capeId]; return (d && d.arrowSave) || 0; }
};
