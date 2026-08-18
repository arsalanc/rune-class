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
smithing, cooking, firemaking, chat, emotes, ladders, dynamic events, and seeing
other players.**

Still singleplayer-only, and they say so when you try: crafting, fletching, herblore,
farming, prayer, magic, and most quests. The remaining production skills all share
one input path — *use item on item*, with their own batch menus — so they are a
single coherent batch rather than six separate ones.

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

Ported so far: **The Guide's Lunch**. The rest are blocked less by the framework than
by their ingredients — The Cook's Feast needs farm produce, The Artisan's Apprentice
needs a crafted leather coif, and both of those skills are still offline.

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
