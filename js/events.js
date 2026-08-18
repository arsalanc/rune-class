'use strict';
// ---------------------------------------------------------------------------
// events.js — dynamic world events. Pure rules, ONE implementation, shared by
// singleplayer (js/game.js) and the authoritative server (server/sim.js via the
// shared VM bundle), exactly like combat.js.
//
// This file must not touch `Game`, `Sim`, the DOM or any clock directly. Every
// side-effect goes through the `ctx` adapter each caller provides:
//
//   ctx.state                          -> the mutable run-state (see newState)
//   ctx.now()                          -> ms; SP uses performance.now, MP Date.now
//   ctx.rand()                         -> 0..1
//   ctx.participants(x, z, layer, r)   -> [handle] of players inside the ring
//   ctx.pid(handle)                    -> a stable id for a participant
//   ctx.combatLevel(handle)            -> used for scaling, and for the level floor
//   ctx.spawn(type, x, z, layer)       -> npc handle (or null if it couldn't)
//   ctx.despawn(npc)
//   ctx.isDead(npc)                    -> true once it has been killed
//   ctx.blocked(layer, x, z)           -> terrain test, for placing spawns
//   ctx.setScenery(layer, x, z, type)  -> type null removes; used for the fail state
//   ctx.announce(text, cls)            -> chat, to everyone who can see it
//   ctx.reward(handle, tier, def)      -> hand out the loot for a contribution tier
//
// The reason this is one file rather than two mirrored ones is scar tissue: every
// time this project has duplicated logic across game.js and sim.js — the NPC
// leash, tree logs, the pickaxe check — the two copies drifted and shipped a bug.
// ---------------------------------------------------------------------------
const Events = {

  // ---- run-state -----------------------------------------------------------
  // phase: 'idle' -> 'warn' -> 'active' -> 'done' -> (cooldown) -> 'idle'
  newState(rand) {
    const st = {};
    for (const d of EVENT_DEFS) {
      st[d.id] = {
        phase: 'idle', at: 0, wave: 0, integrity: 0, maxIntegrity: 0,
        npcs: [], credit: {}, scale: 1, endsAt: 0, outcome: null
      };
      // stagger the first run so a fresh world doesn't fire everything at once
      st[d.id].at = (rand ? rand() : Math.random()) * (d.idleFor[1] - d.idleFor[0]) * 1000 + d.idleFor[0] * 1000;
    }
    return st;
  },

  // ---- helpers -------------------------------------------------------------
  waveSize(def, wave, scale) {
    const w = def.wave;
    return Math.min(w.max, w.base + w.per * (scale - 1) + (wave - 1) * w.growth);
  },

  // How much the event grows for the people present.
  //
  // NOT a head-count. Counting heads is the trap Pest Control fell into and had to
  // patch out: every extra body raises the difficulty, so somebody too weak to help
  // makes the event strictly worse for everyone who is. Instead:
  //   * anyone below `minLevel` is a spectator — welcome, but not counted;
  //   * the rest scale by their combat level RELATIVE to the event's own baseline,
  //     so two players of the intended level count as 2, and two half-level players
  //     count as about 1.
  // A solo player at the baseline lands on exactly 1, which is what the numbers are
  // balanced around.
  scaleFor(ctx, def, here) {
    const base = def.baseLevel || 1;
    let s = 0;
    for (const p of here) {
      const lvl = ctx.combatLevel ? ctx.combatLevel(p) : base;
      if (lvl < (def.minLevel || 0)) continue;
      s += Math.min(1.5, lvl / base);
    }
    return Math.max(1, Math.round(s * 10) / 10);
  },
  // people near the event who are too low to be counted — told so, once
  spectators(ctx, def, here) {
    if (!def.minLevel || !ctx.combatLevel) return [];
    return here.filter(p => ctx.combatLevel(p) < def.minLevel);
  },
  // damage thresholds for bronze/silver/gold, expressed in enemy-healths so they
  // track the enemy rather than needing a magic number per event
  tierFor(def, dmg) {
    const hp = NPC_DEFS[def.enemy].hits;
    let t = 0;
    for (let i = 0; i < def.tiers.length; i++) if (dmg >= def.tiers[i] * hp) t = i + 1;
    return t;
  },
  // credit damage to whoever dealt it. Called from BOTH damage paths; the npc
  // carries the event id so ordinary monsters cost nothing.
  credit(ctx, npc, pid, dmg) {
    if (!npc || !npc.eventId || !(dmg > 0)) return;
    const st = ctx.state[npc.eventId];
    if (!st || st.phase !== 'active') return;
    st.credit[pid] = (st.credit[pid] || 0) + dmg;
  },

  // a ring of tiles around the Font that something can actually stand on
  spawnPoint(ctx, def, i, n) {
    const a = (i / n) * Math.PI * 2 + ctx.rand() * 0.6;
    for (let r = def.spawnRing; r >= 3; r--) {
      const x = Math.round(def.at.x + Math.cos(a) * r), z = Math.round(def.at.z + Math.sin(a) * r);
      if (!ctx.blocked(def.at.layer, x, z)) return [x, z];
    }
    return null;
  },

  // ---- the tick ------------------------------------------------------------
  tick(ctx) {
    const now = ctx.now();
    for (const def of EVENT_DEFS) this.tickOne(ctx, def, ctx.state[def.id], now);
  },

  tickOne(ctx, def, st, now) {
    switch (st.phase) {
      case 'idle': {
        if (now < st.at) return;
        // only start where somebody can see it happen; otherwise wait a bit and
        // look again, so events don't burn themselves out in an empty world
        const here = ctx.participants(def.at.x, def.at.z, def.at.layer, def.radius + 14);
        if (!here.length) { st.at = now + 20000; return; }
        st.phase = 'warn'; st.at = now + def.warnFor * 1000;
        st.scale = this.scaleFor(ctx, def, here);
        ctx.announce(def.name + ' — ' + def.blurb, 'm-lvl');
        if (def.minLevel) ctx.announce('Combat level ' + def.minLevel + '+ to take part. Anyone below that can watch safely — they will not make it harder.', 'm-quest');
        return;
      }
      case 'warn': {
        if (now < st.at) return;
        const here = ctx.participants(def.at.x, def.at.z, def.at.layer, def.radius);
        st.scale = this.scaleFor(ctx, def, here);
        st.maxIntegrity = Math.round(def.integrity.base + def.integrity.per * (st.scale - 1));
        st.integrity = st.maxIntegrity;
        st.wave = 0; st.credit = {}; st.npcs = []; st.outcome = null;
        st.endsAt = now + def.timeLimit * 1000;
        st.phase = 'active';
        this.startWave(ctx, def, st, now);
        return;
      }
      case 'active': {
        // participants can join late — the event grows to meet them
        const here = ctx.participants(def.at.x, def.at.z, def.at.layer, def.radius);
        const s2 = this.scaleFor(ctx, def, here);
        if (s2 > st.scale) st.scale = s2;

        st.npcs = st.npcs.filter(n => {
          if (!ctx.isDead(n)) return true;
          ctx.despawn(n);
          return false;
        });
        // the Font erodes while the tide is still standing
        st.integrity -= st.npcs.length * def.drainPerEnemy;
        if (st.integrity <= 0) { st.integrity = 0; return this.finish(ctx, def, st, now, false); }
        if (now > st.endsAt) return this.finish(ctx, def, st, now, false);
        if (!st.npcs.length) {
          if (st.wave >= def.waves) return this.finish(ctx, def, st, now, true);
          this.startWave(ctx, def, st, now);
        }
        return;
      }
      case 'done': {
        if (now < st.at) return;
        // put the world back the way it was and go quiet again
        if (st.outcome === false) ctx.setScenery(def.at.layer, def.at.x, def.at.z, 'bone_font');
        st.phase = 'idle';
        st.at = now + (def.idleFor[0] + ctx.rand() * (def.idleFor[1] - def.idleFor[0])) * 1000;
        return;
      }
    }
  },

  startWave(ctx, def, st, now) {
    st.wave++;
    const n = this.waveSize(def, st.wave, st.scale);
    const last = st.wave >= def.waves;
    for (let i = 0; i < n; i++) {
      const at = this.spawnPoint(ctx, def, i, n);
      if (!at) continue;
      const npc = ctx.spawn(def.enemy, at[0], at[1], def.at.layer);
      if (npc) { npc.eventId = def.id; st.npcs.push(npc); }
    }
    if (last) {
      const at = this.spawnPoint(ctx, def, 0.5, 1);
      if (at) {
        const boss = ctx.spawn(def.boss, at[0], at[1], def.at.layer);
        if (boss) { boss.eventId = def.id; st.npcs.push(boss); }
      }
    }
    ctx.announce('Wave ' + st.wave + ' of ' + def.waves + ' — ' + st.npcs.length + ' surface from the flats!' +
      (last ? ' Something bigger is with them.' : ''), 'm-quest');
  },

  finish(ctx, def, st, now, won) {
    for (const n of st.npcs) ctx.despawn(n);
    st.npcs = [];
    st.outcome = won;
    st.phase = 'done';
    st.at = now + def.cooldown * 1000;
    if (!won) {
      // the world wears the loss until the cooldown expires
      ctx.setScenery(def.at.layer, def.at.x, def.at.z, 'bone_font_dark');
      ctx.announce('The tide closes over the Bone Font. It has gone dark, and the disciples have scattered.', 'm-red');
      return;
    }
    ctx.announce('The tide breaks. The Font holds!', 'm-lvl');
    // everyone who helped is paid, by how much they helped — no tagging, no
    // stealing, and no need to have landed the last blow on anything
    const here = ctx.participants(def.at.x, def.at.z, def.at.layer, def.radius + 6);
    for (const p of here) {
      const tier = this.tierFor(def, st.credit[ctx.pid(p)] || 0);
      if (tier > 0) ctx.reward(p, tier, def);
    }
  },

  // what the HUD needs, small enough to ride along in a snapshot every tick
  hud(ctx, def) {
    const st = ctx.state[def.id];
    if (!st || (st.phase !== 'active' && st.phase !== 'warn')) return null;
    return {
      id: def.id, name: def.name, phase: st.phase,
      wave: st.wave, waves: def.waves,
      left: st.npcs.length,
      integrity: Math.max(0, Math.round(st.integrity)), maxIntegrity: st.maxIntegrity,
      secs: Math.max(0, Math.round((st.endsAt - ctx.now()) / 1000)),
      x: def.at.x, z: def.at.z, layer: def.at.layer, radius: def.radius
    };
  },
  hudAll(ctx) {
    const out = [];
    for (const def of EVENT_DEFS) { const h = this.hud(ctx, def); if (h) out.push(h); }
    return out;
  }
};
