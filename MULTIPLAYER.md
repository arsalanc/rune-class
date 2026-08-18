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
aggro, loot, death, chat, emotes, ladders, dynamic events, and seeing other players.**

Still singleplayer-only, and they say so when you try: banking, shops,
smithing/smelting, cooking, firemaking, crafting, fletching, farming, prayer, magic,
and quests/dialogue. The skilling and combat maths already live in shared modules, so
bringing these online is mostly writing the intents and the handlers.

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
