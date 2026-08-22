# Multiplayer

One simulation, three transports. Whichever you use, the client is a thin renderer:
it sends *intents* ("I want to walk here", "I want to attack that") and draws the
authoritative snapshots it gets back. It never decides anything.

| Transport | Authority | Where saves live | Use it for |
|---|---|---|---|
| **Host** | this browser tab | the host's IndexedDB | playing with friends over the internet, no server |
| **Join** | a friend's tab | the host's IndexedDB | being that friend |
| **LAN** | `server/server.js` | `server/players/*.json` | low latency on a local network |

## One sim, two runtimes

[`js/sim.js`](js/sim.js) is the authoritative simulation — movement, gathering, combat,
NPC AI, ground items, death. It is transport-free and imports nothing, taking `ITEMS`,
`World`, `Combat`, `Events` and friends from the enclosing scope like every other file
in `js/`. That one file runs unmodified in both places:

- **browser** — loaded by a `<script>` tag and driven by [`js/host.js`](js/host.js)
- **Node** — loaded into a VM context by [`server/shared.js`](server/shared.js),
  alongside `data.js` / `combat.js` / `events.js` / `world.js`, and driven by
  [`server/server.js`](server/server.js)

So the world generates identically everywhere and only *changes* — a chopped tree, a
depleted rock, dropped loot — travel over the wire.

## The peer-to-peer path

```
guest browser                  PeerJS broker                  host browser
     |------------- offer/answer (signalling) ------------------->|
     |<==================== WebRTC data channel ==================>|
     |------------- CPace handshake, then AES-GCM --------------->|
```

The broker's only job is introducing two peers. It is a free public service, and the
design assumes it is hostile.

### Why a PAKE and not just WebRTC's own encryption

WebRTC data channels are always DTLS-encrypted, but the DTLS fingerprints are
exchanged *through the broker*. A malicious broker can substitute its own and sit in
the middle of a connection that reports itself as encrypted at both ends. DTLS proves
you are talking to the same someone throughout; it does not prove that someone is your
friend.

CPace closes that gap. Both sides turn the password into a group generator only they
can compute, do a Diffie-Hellman on it, and prove they got the same answer. An
eavesdropper — broker included — cannot derive the key, and a wrong password produces
an unrelated one that fails key confirmation. All game traffic is then AES-256-GCM
under that key, so the broker relays ciphertext it cannot read or forge.

The protocol, the exact transcript binding and the reasoning are documented at the top
of [`js/pake.js`](js/pake.js).

### Logging in

One password per character. The invite code is only for newcomers.

- **Returning player** — CPace runs against your character's stored credential. Your
  password is all you need.
- **New player** — you have no character on that world yet, so there is nothing to run
  CPace against. It runs against the world's **invite code** instead, and your chosen
  character password is registered *inside* the resulting encrypted channel.

That second case is why the invite code exists: it means first contact is already
authenticated, so there is no trust-on-first-use window for the broker to exploit, and
a stranger who learns your World ID still cannot create characters on your world.

### What this does not protect against

Worth being straight about, because the guarantees stop in specific places.

- **CPace is a balanced PAKE**, so the host stores a value equivalent to your password
  *for that world*. Whoever controls the host's browser storage can impersonate any
  character on it and can run an offline dictionary attack against your password at
  310,000 PBKDF2 iterations per guess. An augmented PAKE (OPAQUE) would remove this;
  it is deliberately out of scope. **Do not reuse a password that matters elsewhere.**
- **The host is fully trusted.** They run the simulation, so they can hand themselves
  items, edit any save, and read anything you say. This is a game you play with
  friends, not a public server.
- **Your IP is visible to peers.** WebRTC negotiates a direct connection, which means
  the people you play with learn your IP address. That is inherent to peer-to-peer.
- **Online guessing is slowed, not stopped.** Failed attempts back off exponentially
  per peer and per character, capped at a minute. A determined attacker with the
  invite code still gets one guess per connection.

### Availability

- The world lives in the host's tab. Close it and everyone drops.
- **Keep the hosting tab visible.** Browsers throttle background timers to about 1 Hz.
  The loop compensates by stepping the sim multiple times per wake-up so game time
  stays roughly correct, but updates arrive in visible chunks for everyone.
- The broker holds a World ID for up to a minute after a tab closes. A quick refresh
  hits `unavailable-id`, so the host automatically mints a new ID and says so — which
  does mean re-sharing it.

## Persistence

- **P2P** — [`js/store.js`](js/store.js), IndexedDB in the host's browser. One row per
  character: `salt`, `prs` (the stretched credential) and the sim save blob. Written
  every 30 seconds, on disconnect, and on tab close.
- **LAN** — `server/players/<name>.json`, same shape, same 30-second cadence.

The plaintext password is never stored or transmitted anywhere, in either mode.

### The world itself

The world is regenerated from scratch every time the sim boots, so anything a quest
changed **for good** has to be re-applied — otherwise a host who closes their tab
re-seals a gate the world already opened, and the players who did that quest find the
chamber walled up again.

That state is kept as a handful of named **facts** (`worldFlags`), not as a dump of
scenery. This matters: `sceneryOverrides` also holds every chopped tree and depleted
rock, which respawn on their own and would be nonsense to persist — a tree felled a
second before shutdown would stay a stump for ever. A fact is small, readable, and
survives world-generation changes that would invalidate saved tile data.

`WORLD_EFFECTS` in [`js/sim.js`](js/sim.js) maps each fact to the change it makes, and
every effect runs through `setScenery()` — so it broadcasts to everyone present and
reaches later joiners through `allOverrides()` with no extra plumbing. Facts are
written the moment they change rather than on the 30-second tick: they are rare, and
losing one to a closed tab would undo a quest.

Stored in the host's IndexedDB (`meta/worldstate`) and, for LAN, `server/world.json`.

## Vendored dependencies

[`js/vendor/`](js/vendor/) holds two committed bundles, rebuilt by
`npm run vendor` ([`tools/build-vendor.sh`](tools/build-vendor.sh)):

- `peerjs.min.js` — signalling client
- `noble-ristretto255.js` — `@noble/curves` ristretto255, bundled to a classic script

They are committed rather than loaded from a CDN so the game keeps working offline and
so a CDN outage or compromise cannot take down the crypto or quietly replace it.

## Scope

Shared and authoritative: **movement (walk and run), woodcutting, mining, fishing,
combat (melee + ranged, per-weapon and per-NPC attack speeds, the combat triangle,
worn equipment across all six slots, arrow recovery, melee adjacency), monster AI and
aggro, loot, death, banking (including tabs and bank notes), shops, smelting,
smithing, cooking, firemaking, crafting, fletching, herblore, farming, prayer, magic,
chat, emotes, ladders, dynamic events, and seeing other players.**

**Every skill is now online.** What remains singleplayer-only is most of the quests,
and they say so when you try.

### Magic

Combat casts ride on the ordinary attack action with a `spellId`, or on an autocast
set in the spellbook — a spell replaces the swing entirely, at a fixed 5-tick cast
speed and a 5-tile reach, like a bow. Out of runes or under-levelled, the sim stops
the action rather than letting you lunge into melee with a staff.

The interesting half is **curses**. Sap lives on the *shared* NPC, not on the caster,
so one player's Confuse weakens that monster for everyone hitting it — which is the
whole reason to cast it in a group. That only works because every damage roll now
reads `npcStat(n, 'def')` instead of the static `NPC_DEFS` value; melee and ranged
were still reading the raw stat, so a curse would have helped nobody but the mage.

Enchanting and alchemy are per-player and go through their own intent. Alchemy's
"are you sure?" prompt for a valuable item stays on the client — it is a confirmation,
not a rule, and the sim re-checks the value either way.

### Prayer

The thing that makes prayer real rather than decorative is that the sim's combat
rolls use `effLevel()` — base level plus whatever prayers are lit — instead of
`level()`. A prayer that does not change a damage roll is just an animation. The same
goes for protection prayers, which zero an incoming hit in the NPC damage path.

Points, drain and the combat effect all live on the authority; the client only asks
to toggle. Drain runs on the 600ms game tick and reproduces singleplayer's
**flicking**: a prayer switched off during a tick is not charged for it, so perfect
flicking is free and costs a click every 600ms — which is the point of the mechanic.
Running out switches everything off and says so. Prayers always come back off after a
disconnect: the points carry over, but nothing should still be burning from a session
that ended who knows when.

This one also fixed a latent bug: the sim's `equipBonus()` had no `pray` field, so
`prayDrainResist()` was `NaN` and prayer would have drained *never*.

### Farming

**Allotments are per-player**, keyed by tile and saved with the character, exactly as
in singleplayer. Shared patches would mean whoever walked past first could harvest
your crop, which is not a thing to do to a friend. Wheat plots are the exception —
they are ordinary shared scenery on the same respawn timer trees and rocks use, so
two players genuinely do compete for a sheaf.

Growth is **wall-clock**, measured from `plantedAt`, so a crop keeps ripening while
you are logged out and the sim never ticks a patch. The client mirrors the patch data
and works out ripeness itself, which is why the existing patch menus read true
online with no changes.

### Use item on item

Crafting, fletching and herblore all reach the player the same way — combine two
items — so they share **one** intent, `craft`, rather than nine. The client works out
*which* recipe from the two items and, where there is a choice, shows the same menu it
always has; the sim re-derives everything from the shared tables and re-checks the
level, the tool and the materials. `qty` batches, so "make all" is one message rather
than twenty-eight, and it is capped so a single request cannot ask for unbounded work.

### Quests

**Quest progress is per-player; quest effects on the world are shared.** Once anyone
rings the peal, the Font gate is open for everyone, permanently — those effects go
through `setScenery()`, which already broadcasts. But each player has their own quest
state, saved with their character, and earns their own rewards.

The alternative — one shared quest state — was rejected on purpose: the first player
to finish a quest would permanently lock everyone else out of its rewards, and a
friend joining next month could never play the content at all.

**How dialogue crosses the wire: it doesn't.** Dialogue choices are JS closures and
cannot be serialised, so rewriting fourteen quest trees as server-side state machines
would have been the bulk of the work. Instead the client renders the dialogue it
already has — text is harmless — and only ever *asks* to advance a quest.
`intentQuestStep()` then re-reads the same shared step table and re-checks the
requirements itself. A modified client can ask all it likes; it cannot hand in shrimp
it does not have.

That works because quest steps are **data**, in `QUEST_STEPS` (`data.js`): `from`/`to`
stage, `needs`, `give`, `xp`. Both sides read one table, so the rules cannot drift —
the same reason `combat.js` and `cookBurnChance()` are shared.

`Game.NET_TALK` whitelists which NPCs will talk in a shared world: pure-flavour ones,
and quests whose steps live in that table. Everything else still says so, because its
dialogue mutates player state directly and the authority would never see it.

Ported and completable end to end: **The Guide's Lunch**, **The Artisan's
Apprentice**, **The Cook's Feast**, **The Dwarf's Request**, **Rat Menace**, **Fur
Trader**, **Trial by Fire** and **The Restless Dead**.

**The Weight of Souls** is partial on purpose: its opening two steps are here, and
its bell peal is implemented, but from stage 2 it needs a Ghostspeak Amulet — marsh
sand, ectoplasm, furnace fusing, wraith drops and altar threading — none of which the
sim models. The table stops where the sim stops, rather than offering a step that
cannot be finished. Steps proved by a running total rather than an item held —
the Apprentice's "light 2 fires" — use a `counter` field checked against a tally the
sim keeps, so the client never touches it: Rat Menace counts rats, and Trial by Fire
counts penned-goblin kills *by attack type*, which is the only way "you did it from a
safe spot with a bow" can be checked at all.

Each was unblocked by a skill landing first — the Apprentice by crafting, the Cook's
Feast by farming, Trial by Fire by ranged and magic — which is why the skills went in
before the quests that need them.

The **bell peal** is the first content to exercise the shared half of the model.
Working out the order is per-player — everyone solves the puzzle themselves — but the
Font gate it opens is a fact about the world, so the first person to ring it true
opens the stair for everybody, permanently, including players who join months later.
The earlier stages of the souls questline still gate reaching it in normal play.

### Production skills

Smelting, smithing and cooking are ordinary repeating tick actions anchored to
scenery, and they mirror the singleplayer handlers in `game.js` one for one: one
click works the whole inventory, and every level check and material check happens in
the sim. The recipe tables (`SMELTS`, `SMITHABLES`, `COOKABLES`) were already shared.

The cooking burn maths were **not** shared — they lived in `Game.burnChance`. They
now live in `data.js` as pure `cookBurnChance()` / `cookStopBurn()`, which both sides
call, for exactly the reason `combat.js` exists: otherwise the same fish would burn
at different rates online and off.

Firemaking is the odd one out. It does not act *on* scenery, it **creates** scenery
under your feet, so it is an intent rather than a `resolveAction` case. It goes
through `setScenery()`, which broadcasts — so everyone nearby sees your fire, and
sees it burn out 60 seconds later via the sweep already in `slowTick()`.

### The bank

Per-character storage the sim owns outright, saved with the character. The client
keeps a **display-only mirror** at `Game.player.bank` so the existing bank window
works unchanged; every mutation goes out as an intent and comes back as a `bank`
message. Writing to the mirror achieves nothing — the test suite asserts exactly that
by pushing a fake rune sword into it and trying to withdraw.

Two things the sim has to police, because the client is not trusted:

- **Range.** `atBank()` re-checks on *every* operation that the player is still
  standing beside the booth they opened, rather than trusting a flag set once. Walking
  away, climbing a ladder, starting another action or dying all close the window.
- **Bank notes can't become real items.** A note is `{ noted: true }` — a stackable
  receipt. Every "do I really have this?" query (`count`, `has`, `remove`,
  `bestArrow`) skips notes, and the flag is preserved through **drop → ground → pick
  up** and through the death drop. Miss any one of those and a note for 1000 logs
  becomes 1000 logs: `doTake` would mint them, or `bestArrow` would fire arrows
  straight out of the receipt.

### Shops, and why they differ from the bank

Everything else so far is *per-player* state. Shop stock is **shared world state**:
one `this.shops` on the sim, and two people at the same counter drain the same shelf.
That is the whole point of shopping in a shared world, and it changes the plumbing.

- A transaction pushes to **every player with that shop open**, not just the buyer —
  `pushShopToViewers()`. Otherwise two players each buy the last sword.
- The `chime` flag marks which push was *your* transaction, so the coin sound plays
  for the buyer and not for everyone watching the shelf move.
- Stock drifts one step back toward its starting level every 40 game ticks, the same
  `Math.sign` drift singleplayer uses — so a shop refills after a raid and also sheds
  anything players over-sold into it.
- Range is re-checked per transaction like the bank, but against a **moving target**:
  shopkeepers wander, so `atShop()` measures against the NPC's current tile. (This
  caught a test of mine that assumed the keeper stayed put.)
- Ghostly traders stay shut online — they are gated behind quest progress the sim does
  not model, so opening them would hand out a quest reward for free.

Two rules of thumb from doing this:

- **If the client already has the data, don't gate it.** Attack options show the
  monster's combat level and weakness in multiplayer because `NPC_DEFS` and the
  `Combat` module are already on every client — the server was never involved. Any
  purely presentational difference between the two modes is a bug, not a limitation.
- **Never let a control pretend.** Prayer used to toggle happily in multiplayer,
  drain points client-side, and change nothing about the combat the sim was actually
  resolving. A control that lies is worse than one that refuses.

## Tests

```bash
npm test            # crypto + loopback, no browser or network needed
npm run test:all    # the above, plus the real-browser end-to-end test
```

- [`tools/pake-selftest.mjs`](tools/pake-selftest.mjs) — CPace agreement, mismatched
  passwords, session separation, and the AES-GCM record layer against replay,
  tampering and wrong keys.
- [`tools/p2p-selftest.mjs`](tools/p2p-selftest.mjs) — the real `host.js` and `net.js`
  talking to each other through a loopback stand-in for PeerJS: registration, login,
  wrong password, wrong invite code, duplicate login, save/restore across a
  disconnect, and game intents flowing over the encrypted channel.
- [`tools/browser-selftest.mjs`](tools/browser-selftest.mjs) — two headless browser
  tabs hosting and joining through the **real** PeerJS broker over a **real** WebRTC
  data channel. Needs a Chromium-family browser and an internet connection; skips
  cleanly without them.

The last one earns its keep: the loopback harness structurally cannot catch anything
about the actual transport. It is what caught PeerJS rejecting `serialization: 'none'`
— the enum member is `SerializationType.None`, but its wire value, and the key the
serializer table is looked up by, is the string `"raw"`.
