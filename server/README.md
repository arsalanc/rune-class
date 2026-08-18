# Rune Classic — Multiplayer Server (LAN)

Authoritative game server. It owns the world, runs the 600 ms simulation tick,
and streams snapshots to connected browser clients. Singleplayer does **not** need
this — the game still runs standalone from `file://`.

**This is the LAN option.** To play with friends over the internet without running
anything, use the peer-to-peer path instead — one player's browser tab hosts the
world, and you share a World ID. See [../MULTIPLAYER.md](../MULTIPLAYER.md).

## Run it

```bash
cd server
npm install      # one-time: installs ws
npm start        # listens on ws + http :8787  (set PORT to change)
```

Then in the game: **Opts** tab → Multiplayer → **LAN** → enter your name and the
server address (`localhost:8787` locally, or `your-lan-ip:8787` for friends on your
network) → **Join shared world**.

Open `http://localhost:8787/` in a browser for a quick "server up" health check.

## How it works

- **Shared source of truth**: [`shared.js`](shared.js) loads the *browser* files
  `js/data.js`, `js/combat.js`, `js/events.js`, `js/world.js` **and `js/sim.js`**
  verbatim in a Node VM context — the server and every client generate the identical
  seeded world and use the **same combat maths**, so only *changes* (a chopped tree,
  a depleted rock, dropped loot) travel over the wire.
- [`js/combat.js`](../js/combat.js) — pure, stateless combat module (damage roll,
  combat triangle, weapon/NPC attack speeds, armour classes). **Both** singleplayer
  (`game.js`) and the server (`sim.js`) call into it, so combat never drifts between
  the two — change it once, both stay in sync.
- [`../js/sim.js`](../js/sim.js) — the headless authoritative simulation: movement,
  gathering, combat, NPC AI, ground items, death, per-player state. It lives in `js/`
  rather than here because the browser P2P host runs the very same file; it is
  transport-free and takes its dependencies from the enclosing scope.
- [`server.js`](server.js) — WebSocket transport + JSON persistence
  (`server/players/<name>.json`, created on first join).

## Scope

Shared and server-authoritative: **movement (walk and run), woodcutting, mining, fishing,
combat (melee + ranged, per-weapon/NPC attack speeds, the RS2 combat triangle,
worn equipment via wield/unequip across all six slots — head, cape, body, legs,
weapon, shield — arrow recovery from Ava's Satchel, melee adjacency), monster
AI/aggro, loot, death, banking (tabs and bank notes included), shops with
shared stock, chat, and seeing other players**. NPC spawns and world
content (farms, training yard, Hollow-folk camp, Giants' Den, town walls,
Southmarch and the Rookmoor road) match singleplayer.

Still singleplayer-only for now (they show a notice when you try):
smithing/smelting, cooking, firemaking, crafting,
fletching, farming actions, prayer, magic, and quests/dialogue (including
Animal Magnetism's Warding Circle puzzle). Because the
combat/skilling maths are now shared modules, bringing these online later is
mostly writing the intents + server handlers — the rules already live in one place.

No accounts/passwords on this transport — anyone can log in as any name on your
server, and the WebSocket is unencrypted. Fine for a LAN; don't expose it to the
open internet as-is. The peer-to-peer path *does* authenticate players and encrypt
its traffic — see [../MULTIPLAYER.md](../MULTIPLAYER.md).
