# Rune Classic

A browser-playable remake in the spirit of RuneScape Classic — singleplayer, or
peer-to-peer multiplayer where one player's browser tab hosts the world. Fan project —
all art is procedural/original (canvas-drawn sprites, emoji item icons); no Jagex assets or data are used.

## Play

Open `index.html` in any browser — no build step, no server needed (works from `file://`).
It renders in **WebGL 3D** by default; if your browser can't, it falls back to the
Canvas 2.5D engine automatically (you can also force it in **Opts** or with `?nogl`).

## Controls

- **Left-click** — default action (walk, chop, attack, talk, take…)
- **Right-click** — RSC-style "Choose option" menu
- **Arrow keys** — rotate/tilt camera; **mouse wheel** — zoom; **Esc** — close windows
- **Enter** — chat; what you type floats over your head
- Inventory: left-click wields/eats/buries/selects for "use"; right-click for all options
- While the bank/shop window is open, clicking inventory items deposits/sells them

## Multiplayer

Three ways in, all under **Opts → Multiplayer**. They share one protocol and one
simulation — see [MULTIPLAYER.md](MULTIPLAYER.md) for how it works and what it does
and does not protect you from.

- **Host** — your tab becomes the server. You get a **World ID** and an **invite
  code**; hand both to a friend. The world lives in that tab and ends when you close it.
- **Join** — paste your friend's World ID, pick a character name and password, and add
  the invite code the first time. Your character is saved on the host's machine, so
  your progress is there when you come back.
- **LAN** — the original Node server in [`server/`](server/), for low-latency play on
  a local network.

Traffic between peers is encrypted under a key derived from your password with a
**PAKE** (CPace), so the public signalling broker relays only ciphertext and never
sees a password. Hosting needs an `https://` page or `localhost` — browsers withhold
WebCrypto elsewhere, so it will not work from `file://`.

### Hosting from GitHub Pages

The game is plain static files with no build step, so pushing the repo and enabling
Pages is the whole deployment:

1. **Settings → Pages → Build and deployment → Deploy from a branch**, pick your
   branch and `/ (root)`.
2. Open `https://<you>.github.io/<repo>/` and use **Opts → Multiplayer → Host**.

Pages serves over https, which is the secure context hosting needs. Note that Pages
only ever serves the files — the world itself runs in whichever browser tab is
hosting, and stops when that tab closes.

## Development

```bash
npm run serve        # static server on localhost:8080 (a secure context, so P2P works)
npm test             # crypto self-test + peer-to-peer host/guest integration test
npm run test:browser # two headless browser tabs over the real PeerJS broker
npm run server       # the optional Node server for LAN play
npm run vendor       # regenerate js/vendor/ from npm (only when bumping versions)
```

## What's new in v0.46 — Runecraft & Herblore

Two new skills, two quests, a new settlement, a hidden mine, a new enemy type and a shop.
Skill count goes from 16 to 18.

### The Ringwall

The stone circle on the southern highway was a menhir ring with some dark wizards in it.
It is now the home of both new skills: **eleven rune altars**, a druid circle, a walled
herb garden, an apothecary, and a ruin that goes somewhere.

### Runecraft

Mine blank **rune essence**, bind it at an altar, get runes. The talisman is a *key*, not
an ingredient — it opens the altar and is never consumed.

- Levels, xp and the rune order are the originals': air 1, mind 2, water 5, earth 9,
  fire 14, body 20, cosmic 27, chaos 35, nature 44, law 54, death 65
- **Higher levels bind more runes from the same essence** — air doubles at 11, triples at
  22. That's what stops a low altar becoming worthless the moment you can reach a better
  one
- The five deep altars want **pure essence**, which needs **Mining 30** — the Mining tie-in

The essence mine is reached only through the ruin, and only after **Rune Mysteries**. The
rocks never deplete, exactly as theirs don't: the trip is the cost, not the rock.

### Herblore

The full chain: **grimy herb → clean → vial of water → unfinished → add the secondary**.

| Potion | Herblore | Herb + secondary |
|---|---|---|
| Attack | 3 | Guam + eye of newt |
| Antipoison | 5 | Marrentill + unicorn horn dust |
| Strength | 12 | Tarromin + limpwurt root |
| Restore | 22 | Harralander + red spiders' eggs |
| Defence | 30 | Ranarr + white berries |
| Prayer | 38 | Ranarr + snape grass |
| Ranging | 45 | Irit + red spiders' eggs |

Potions are three doses, boost a skill by 10% + a flat amount for three minutes, and leave
an empty vial. Boosts run through the same `effLevel` path prayers already used, so they
stack with prayers correctly and decay on their own timer.

### Druids

Two new enemies at the Ringwall. **Druids** (level ~22) and **Chaos druids** (level ~31)
drop from a shared **herb table** and a **druidic secondaries table** — both halves of a
potion from the same enemy. Herbs also appear on hobgoblins, ghosts, hill giants and marsh
wraiths at around 1 in 10, so the world drops them naturally.

### Two quests

- **Rune Mysteries** — Archmage Sedris wants a talisman carried down into the ruin.
  Finishing it unlocks the essence mine and gives you two more talismans
- **Druidic Ritual** — Elder Faelin needs four things gathered for a rite. Finishing it
  unlocks Herblore and gives you a pestle and mortar

## What's new in v0.45 — Ranged & Magic

Melee had five metal tiers plus event and boss gear. Ranged had three bows and three
arrows; Magic had exactly one set of robes and one staff. Both now run the full length of
the game.

### Bows and arrows are gated on Ranged, not Attack

A real bug, not a missing feature: `wield` was always checked against **Attack**, so a
pure archer with Ranged 60 and Attack 1 could not draw an oak longbow. Bows now carry
`wieldSkill: 'ranged'` and staves `'magic'`.

Arrows had no requirement at all, which meant a level-1 archer would auto-fire the best
arrows in the game the moment any dropped. They're tiered now, and `bestArrow` picks the
heaviest you can actually draw.

| Bow | Ranged | Arrow | Ranged |
|---|---|---|---|
| Shortbow / Longbow | 1 | Bronze / Iron | 1 |
| Oak longbow | 20 | Steel | 5 |
| Willow longbow | 30 | Mithril | 30 |
| Maple longbow | 40 | Adamant | 40 |
| Yew longbow | 50 | | |

**This also fixes a bug v0.43 left behind.** Adding mithril and adamant generated
smithing recipes for their arrowheads — but the arrowheads and arrows didn't exist, so
those two recipes made nothing at all. There's now a test asserting every smithing,
fletching and crafting recipe produces a real item.

### Two more trees, which Woodcutting badly needed

Yew longbows need yew logs, so Woodcutting gained **maple (45)** and **yew (60)** — it had
stopped dead at willow 30. They grow in two groves rather than scattered everywhere: a
yew is a level-60 tree and the only source of the best bow in the game, so it should be
somewhere you go on purpose.

### Ranged armour goes past leather

Leather stopped at hard leather. Now **studded** (Ranged 20 / Defence 20, leather plus a
steel bar) and **green dragonhide** (Ranged 40 / Defence 40), crafted from hide the green
dragon drops — one per kill, as in the original.

That needed a new requirement system: `defReq` could only ever express a Defence level,
so ranged and magic armour now use a generic `reqs` map and are gated on **both** skills.

### Magic gets staves and mystic robes

- **Elemental staves** — water, earth and fire, each supplying its own rune free. The
  mechanic already existed on the one magic staff; now there's a reason to own more than
  one
- **Battlestaff** (Magic 30) and **Mystic staff** (Magic 40), both usable as weapons
- **Mystic robes** (Magic 40 / Defence 20) — the first magic armour above wizard robes

Both skill guides are now generated from the item tables, so they can't drift out of date
the way the Ranged guide had (it still claimed the oak longbow was the best bow).

## What's new in v0.44 — Chapman's Cross & the trade shops

The general store sold **every rune in the game**, plus bows, plus wizard robes, which
left nothing for a magic shop or an archery shop to be. There are now four specialists,
and they live in a new market town on the southern highway.

### Chapman's Cross

A chapman is a travelling pedlar, and this is where four of them stopped travelling. Four
shopfronts facing one street between Willowmere and the wayside inn — no walls, no
castle, no quest. You come here to spend.

| Shop | Keeper | Sells |
|---|---|---|
| Hollis' Blades | Hollis the Bladesmith | swords, maces, axes, pickaxes — bronze to mithril |
| The Ironmonger | Ida the Ironmonger | helms, chainmail, kite shields, platelegs |
| The Fletcher's Rest | Rell the Fletcher | bows, arrows, bowstring, feathers, leather armour |
| Sabra's Runes | Sabra the Rune-seller | every rune, staves, wizard robes |

### Specialists are picky

Trade shops now buy **only their own category** — the archery shop won't take your
platelegs, and the rune-seller has no use for a bow. The general store still buys
anything at 60%, which is exactly the split the original draws. Categories are worked out
from the item itself, so nothing needs hand-tagging.

One rule stops that being annoying: **a shop always buys back what it stocks**, whatever
category the item falls in. Without it the fletcher would sell you raw leather and then
refuse to take it back.

### You can read the street

Each shop hangs a **painted trade sign** over its door, and the boards are colour-coded —
rust red with a sword, iron grey with a helm, forest green with a bow, deep blue with a
gold star. The first version carved emblems into plain wooden boards and it didn't work: a
sword and a bow both read as "vertical pale bar" from across the street. Colour does the
work; the emblem confirms it.

The keepers carry their trade too. Hollis holds a blade, Ida wears a helm and kite shield,
Rell has a bow, and Sabra is under a **pointed wizard's hat** with a staff. That meant
adding a proper hat to both renderers — `look.helm` only ever drew a metal helmet, which
is also why the dark wizards at the stone circle had been wearing one. They have hats now.

### You can't be beaten up mid-conversation any more

While a dialogue box was open, **every** click in the world was swallowed to advance it —
so if something attacked you mid-conversation you couldn't walk away, eat, or fight back.
You just stood there and took it.

Now a landed blow **closes the dialogue** and hands control straight back, and you can't
start a conversation while something is already swinging at you. Deliberately *not* done:
making you invulnerable while talking, which would let you shrug off a dragon by chatting
to a townsman — damage still lands normally.

The Rookmoor highwayman also moved. Its old spawn was five tiles from Ava's workshop door
and its leash is seven, so it could walk in and camp her. It now patrols far enough down
the moor road that the workshop is out of reach.

### Runes left the general store

The general store is now what it should be — tools, buckets, pots, moulds, a wooden
shield. No runes at all. Every rune is still buyable, and the Magic guide and world map
point at the new shop. If you want to cast, you make the trip.

## What's new in v0.43 — Mining

Mining was the thinnest skill in the game: every seam was one flat tinted cube, gem rocks
couldn't be mined **at all**, the whole world's ore sat in a single pit, and the Mining
Guild held nothing you couldn't already get outside its level-20 door.

### Gem rocks work now

They offered nothing but *Examine*. The mining code had always handled them — both menu
builders and the server gated on an `ore` field that gem rocks don't carry, because their
prize is rolled rather than fixed. Three-line fix, one genuinely missing feature.

### Two new tiers: mithril and adamant

The ladder stopped at steel, which meant Mining stalled at 40 and Smithing at 20. It now
runs to **Mining 70** and **Smithing 40**:

| | Mine | Ore xp | Smelt | Bar costs |
|---|---|---|---|---|
| Mithril | 55 | 80 | Smithing 30 | 1 ore + **4 coal** |
| Adamant | 70 | 95 | Smithing 40 | 1 ore + **6 coal** |

Those coal costs are the originals' and they're the point: coal stops being something you
walk past at Mining 20 and becomes the bottleneck on the entire top of the ladder.

Both tiers generate the full range — swords, maces, axes, pickaxes, helms, chainmail,
kite shields, platelegs — through the existing `METALS` × `SHAPES` table. Adamant lands at
aim 18 / power 14, just under the Tideforged Blade, so the v0.41 event gear keeps its
niche: it reaches that grade at Attack 30 instead of 40.

The **Dragon Sword** was buffed to 22/18. It was a 15% boss drop worth 5,000gp that was
*weaker* than the event blade — an inconsistency that predates this update and would have
got worse once adamant existed. Its wield requirement is unchanged, so nobody's existing
sword becomes unequippable.

### Rocks look like rocks

Every seam was `put(0.5, 0.8, 0.8, tint)` — one tinted box. Worse, silver, gold, gem,
mithril and adamantite had **no render case at all** and fell through to the default grey
cube, so five of the nine rock types were visually identical. There's now a sculpted
outcrop with the metal breaking through the surface as veins, in both renderers.

### Four places to mine, each with a reason

- **Beginner's Scar** (west of Lumbridge) — copper and tin, close enough to learn on
- **The open pit** (north) — the four common metals, and nothing else any more
- **Blackscar Quarry** (further north) — coal country, because everything above steel eats it
- **The Mining Guild** — silver, gold and gems, found nowhere else above ground

### The Guild is worth the door now

It was an 8×7 room holding ore you could already get outside. It's now a proper hall with
a furnace and two bank booths, and behind it:

- **An invisible +7 Mining** while you're inside. Invisible is the exact mechanic: it
  improves your odds on every swing but never unlocks a rock you couldn't otherwise mine
- **Rocks respawn twice as fast**
- **A ladder to the Deep Gallery** — the only mithril and adamantite in the world, with
  coal seams beside them so you aren't climbing the ladder between every bar

Both bonuses live in `js/combat.js` and are used by singleplayer and the server alike.

### Monsters feed the new tiers — but never hand you the gear

High-level monsters now drop mithril and adamant **ore, bars and coal**. They do not drop
mithril or adamant equipment, on purpose: adamant needs Attack 40 to wield, and anyone
killing the level-51 Tallyman is already past that, so gear drops would hand over the
tier's payoff to players who skipped Mining 70 and Smithing 40 entirely. Inputs still
require the Smithing level to become anything, so the skill stays worth training.

Coal is the headline. It's the bottleneck on everything above steel — 4 per mithril bar,
6 per adamant — and Grukk and the Tallyman now shed it in bulk. Mining is still much the
faster route: a full adamant set is ~129 Tallyman kills from bar drops against a
five-minute respawn, versus two rocks in the Deep Gallery.

Side effect worth naming: coal is worth 45gp, so boss income rose — dragon +8%, Grukk
+10%, Tallyman +27%. The Tallyman's jump corrects an old imbalance; at 7.9 gp per
hitpoint it had been the *lowest*-paying of the three bosses despite being the hardest
monster in the game.

### Anchovies

Not a bug, and now the game says so. Anchovies heal 1 on purpose — they're the fish you
train and sell, at four times a shrimp's Fishing xp and three times its value. The examine
text and the Fishing guide say that outright, because a level-15 fish that heals less than
a level-1 one reads as broken otherwise.

## What's new in v0.42 — The essentials

A pass over the oldest genuinely-missing things, drawn from the update audit in
`UPDATE_IDEAS.md`. Less new content than the last few versions and more of the plumbing
that a game this size is expected to already have.

### Loot goes to whoever did the work (multiplayer)

The oldest open item in the audit, and a real 2001 fix of theirs: **the kill belongs to
whoever dealt the most damage, not whoever landed the last blow**. Drops fall under that
player and stay theirs for a minute before going public, so nobody can camp a fight and
snipe the finish. Land the killing blow on someone else's monster and you're told so.

Combat xp was already paid per blow as damage lands, so everyone who helped was always
paid in proportion — that half needed no change, only the loot did.

### Make more than one at a time

Cutting 27 gems used to be 27 clicks. Gem cutting, bone grinding, slime filling, leather
stitching, jewellery casting and Bone Font worship all take a **quantity** now — 5, 10 or
*All* — and report one line at the end instead of flooding the chat.

### Aggressive monsters lose interest

Monsters stop hunting you once you're roughly **twice their combat level**, the way the
originals worked, so walking past the goblins at level 60 is no longer a running battle.
Bosses and event enemies are marked `relentless` and ignore the rule — the tide doesn't
care how strong you are.

### It asks before it destroys something

High alchemy and Drop both delete an item in one click. Anything worth **1,000gp or
more** now asks first, with the item's value in the prompt. Cheap items are unaffected —
no confirmation treadmill for dropping bones.

### Fairer event scaling

The v0.41 event scaled on head-count, which imported the exact trap Pest Control has:
low-level players standing in the ring made the event *harder for everyone* while adding
nothing. Scaling is now weighted by combat level against the event's own baseline, and
anyone under the minimum level is a **spectator** — they can fight, but they don't inflate
the wave sizes.

### Polish

- Health bars keep a visible sliver of green at 1hp instead of vanishing at some
  fraction — you can tell "nearly dead" from "dead"
- **The bar of whatever you're fighting is drawn last and framed in white**, so a pile of
  monsters on one tile can't bury the only bar you care about. It also appears the moment
  you engage rather than waiting for first blood
- Monsters **flinch** when hit, in both renderers, so a landed blow reads without
  reading the number
- Rapid hits show **stacked hit-splats** instead of one flickering number
- Maces grant a **prayer bonus** at every metal tier, and the item tooltip finally shows
  prayer bonuses at all (seven items had the stat and never displayed it)
- Dropping onto a tile that already has the same stack **merges the pile** rather than
  leaving two piles that look like one

## What's new in v0.41 — Dynamic events

The first world event: **The Tide Rises**. Nobody hands it out and nobody accepts it —
it starts on a timer at the Bone Font in Mourncross, everyone standing nearby is a
participant, and the world changes whether you win or lose.

### How it plays

Three waves surface from the flats, the last one with a **Herald of the Tide**. The
Font is a clock rather than a punching bag: **it erodes faster the more of the tide is
still standing**, so leaving enemies alive is what loses you the event. Clear all three
waves before it runs dry and it holds. Fail, and the Font goes dark for a few minutes —
no worship, no Prayer training — until the flats go quiet again.

A banner shows the wave, the count remaining, the timer and the Font's integrity while
you're inside the ring, and the world map draws a pulsing ring so you can see one is
running from anywhere and decide whether to make the trip.

### Solo-first scaling

The GW2 idea this borrows from assumes a crowd; a lone player often *can't* finish a big
event there. That's inverted here — **solo-completable is the baseline** and extra
players make it bigger:

| | waves | Font integrity |
|---|---|---|
| Solo | 3 / 4 / 5 + Herald | 60 |
| Three players | 7 / 8 / 9 + Herald | 110 |

Latecomers count too: the event grows if more people arrive mid-fight. (The table assumes
players at the event's baseline combat level — since v0.42 scaling weighs level, not
head-count.)

### Paid for helping, not for last-hitting

Contribution is tracked as damage dealt to event enemies, and thresholds are **absolute**
rather than a share of the total — so in a group everyone who pulls their weight can earn
gold, instead of competing for it. Bronze, silver and gold buy one, two or three rolls on
the event's own reward table. No tagging, no stealing, no need to land a killing blow.

### The rewards

**Tideforged** gear is the point of turning up, and it slots into the widest hole in the
gear ladder — above steel, below dragon — which is exactly the level 27–42 gap the
drop-table audit flagged. None of it is buyable, smithable, or dropped by any standing
monster:

- **Tideforged Blade** — the best melee weapon short of the dragon sword
- **Tideforged Kite Shield**, **Fontwarden's Cape** (+6 prayer), **Tideglass Amulet**
- **Drowned Bones** — 100 Prayer xp buried, the best offering in the game
- plus ecto-tokens, coins and wraith essence as the reliable baseline

### One implementation, two modes

`js/events.js` holds the rules and **nothing else** — no `Game`, no `Sim`, no DOM, no
clock. Each side passes an adapter for spawning, participation, scenery and rewards.
Singleplayer drives it from `Game.tick`; the server drives the identical code from
`Sim.slowTick` and ships the banner state in each snapshot.

That was a deliberate call. Every time this project has mirrored logic between `game.js`
and `sim.js` — the NPC leash, tree logs, the pickaxe check — the two copies drifted and
shipped a bug. Adding events as a shared module rather than a mirrored pair is the same
lesson applied up front.

---

## What's new in v0.40 — Emotes

The Emotes tab was eight buttons that printed "not implemented yet". It's now **22
working emotes** with real animation, built so Treasure Trails can plug straight in.

### The emotes

Yes, No, Bow, Angry, Think, Wave, Shrug, Cheer, Beckon, Laugh, Jump for Joy, Yawn,
Dance, Jig, Spin, Headbang, Cry, Blow Kiss, Panic, Raspberry, Clap and Salute. Some
play once; some loop until you move or act.

They're driven by **one pose function** shared by the WebGL renderer, the Canvas
renderer *and* the tab icons — so an emote is described in exactly one place, and the
little figure on each button is literally the pose you're about to strike. Adding an
emote never means drawing a second icon by hand.

The player model gained two joints to make this work: a **neck**, so a nod doesn't tip
the whole body, and a **waist**, so a bow bends where a person bends. Tipping the
figure about its ankles — which is what it did first — made bowing look like a plank
falling over.

You can also type **`::wave`** (or any emote id) in chat, which meant opening the chat
bar in singleplayer for the first time; it only transmits when you're connected.
Emotes broadcast in multiplayer, so other players see the pose.

### Built for Treasure Trails

An emote clue is "perform X, at Y, wearing Z" — and every part of that is known the
instant the emote starts. So `Game.doEmote` funnels every performance through one
place and hands out a complete event:

```js
Game.watchEmote(ev => {
  // ev = { emote, x, z, layer, worn: {head, amulet, cape, body, legs, weapon, shield} }
  if (ev.emote === 'panic' && ev.x === 70 && ev.z === 70 && ev.worn.amulet === 'amulet_of_power') {
    solveClueStep();
    return true;          // consumed — later watchers don't see it
  }
  return false;
});
```

`Game.emoteActive()` answers "what are they doing right now". That's the whole surface
a clue system needs, and it's tested: a registered watcher fires on the right emote at
the right tile in the right gear, consuming stops the chain, and unwatching cleans up.

---

## What's new in v0.39 — A real spellbook, jewellery, and interfaces with sprites

Magic was four strike spells in a text list. It's now a **23-spell standard spellbook**
drawn as a grid of glyphs, and it does things other than damage.

### The book

Four tiers of elemental combat — **strike, bolt, blast** across air, water, earth and
fire — plus everything a spellbook is actually for:

- **Curses**: Confuse, Weaken and Curse sap a monster's Attack, Strength or Defence by
  5% a cast, stacking to 15% until it respawns.
- **Enchantment**: Lvl-1 through Lvl-4 Enchant, which is what makes jewellery worth
  crafting.
- **Alchemy**: Low and High turn an item in your pack into coins (60% and 100% of value).
- **Telekinetic Grab**: pull a ground item to you from eight tiles away.
- **Superheat Item**: smelt an ore with no furnace — and iron never fails when you do,
  which is the whole point of the spell given iron's flat 50% at a furnace.

Every spell is a coloured disc with a glyph: the **element picks the colour**, the
**tier draws the rings**. You learn "blue with two rings" as Water Bolt without reading
a word — which is how the book it's modelled on works. Utility spells break the pattern
deliberately so they stand out from the combat grid. Spells you know but can't afford
the runes for are dimmed; locked ones are greyed out.

Teleports are the one thing deliberately left out — the world map already does
click-to-travel, and adding them would undercut the roads v0.32 was built to make
worth walking.

### Silver, gold, gems and jewellery

Mining and Smithing gained the precious metals, and Crafting gained a second trade.

- **Silver** (Mining 20 / Smithing 20) and **gold** (40 / 40) seams, plus **gem rocks**
  that yield uncut sapphires through diamonds. All three sit behind the Mining Guild's
  level-20 door, which finally makes that door worth opening.
- **Cut a gem** with a chisel, then pour a bar into a **mould** at a furnace to set it.
- **Enchant it** with the matching Enchant spell: sapphire → Amulet of Magic (+10 magic),
  emerald → Defence, ruby → Strength (+10), diamond → Power (+6 to everything).
  Unenchanted jewellery is pure decoration, exactly as it should be.
- **Silver has its own line**: cast a symbol mould, bless it at any altar, and you have
  a **Holy Symbol** (+8 prayer bonus) — previously only buyable with ecto-tokens.

The rare drop table gained a thin gem tail, so killing things now feeds this too.

### Interfaces

The **spellbook and prayer book are icon grids** now instead of text lists — 23 and 18
entries respectively don't fit a 216px panel as rows, and both books are meant to be
read by shape and colour.

Prayer glyphs follow the same reference: **cross** for Defence, **flexed arm** for
Strength, **brain** for Attack, **eye** for Ranged, **pyramid** for Magic, each tinted
bronze → silver → gold as you climb its group, so a family of three reads as one
progression. Protection prayers are shields in the colour of the style they turn aside.
Under each grid is a plain-language read-out of what's selected or active.

All the new items are drawn too — faceted gems, rough uncut stones, gold amulets with
their gem set in, moulds, symbols and the six new runes.

The **tab bar** got colour as well. Inventory, Worn, Quest and Prayer were flat cream
outlines that all read the same at a glance; they're now a tan leather satchel with a
brass buckle, a steel helm with a gold brow band and a red plume, a parchment scroll
sealed in red wax, and a gold ankh set with a sapphire. Magic uses the same wizard hat
as the Stats panel, drawn from one place so the two can't drift apart.

### One bug worth naming

The curse spells stored the stat they sap as `defense`, but monster stats are keyed
`def`. **Curses did nothing at all** — the lookup silently missed every time. Caught by
testing the numbers rather than the code path.

---

## What's new in v0.38 — Drop tables, documented and rebalanced

There is now a **[DROP_TABLES.md](DROP_TABLES.md)** — every attackable monster, every
drop, every rate, with the mechanical half generated straight from the game data by
`tools/gen-drop-tables.mjs` (rates measured over 300,000 simulated kills each, so the
document can't drift from what the game actually rolls).

Writing it turned up four real problems.

**Loot now comes from two kinds of table.** `drops` are independent rolls — right for
"always bones, usually some coins". `pick` entries are one-of rolls: a chance to reach
a shared sub-table, then exactly one row by weight, the way the source structures loot.

- **A highwayman could hand you three capes at once.** Each cape was its own 16% roll,
  so red, blue and green could all land on one corpse — and 51% of kills produced a
  cape, on a level-13 monster, for an item the shop sells for 12gp. Now one cape or
  none, at 42%.
- **Farming seeds were shop-only**, so v0.37's rebuilt Farming had no connection to the
  rest of the game. There's a shared `seed` table now, rolled by seven monsters.
- **Grukk paid a quarter of what the Green Dragon did**, despite being four levels
  higher and a quest boss — 309gp against 1,248. He's at 1,132 now.
- **Twelve smithable items existed that nothing dropped** — coal, bars, the whole steel
  set. The new `rare` table is weighted toward *materials* rather than finished gear,
  so it feeds the production skills instead of short-circuiting them.

Also: marsh wraiths no longer drop bones (they're spirits), bears went from 11gp to
27gp at level 14, and the dungeon undead gained thin rare rolls.

The document ends with the one gap the audit couldn't close: **nothing between level 27
and level 42 is worth farming for money.** That's where the next monster should go.

---

## What's new in v0.37 — Skills that play like the real thing

A pass over every gathering and artisan skill, comparing each against how it actually
works, and fixing the places ours only pretended to.

### Tools finally matter (and mining was broken)

Mining demanded a **bronze** pickaxe *by name*. A steel one did nothing; selling your
starter pick stopped you mining at all. Woodcutting checked tiers but only nudged the
success chance by a few percent.

Both now follow the real rule, which is more interesting than "better tool, better odds":

- **A better tool doesn't make you luckier — it lets you swing more often.** Bronze rolls
  every 3 ticks, iron every 2, steel every tick. Your odds on any given swing never change.
- **Pickaxes come in tiers** — bronze, iron and steel, generated alongside the axes and
  smithable at an anvil, so Smithing now feeds Mining directly.
- Tools have level requirements: you can carry a steel pick at level 1, you just can't
  swing it.

### Gathering odds curve instead of ramping

Success was one flat line for every resource — `25% + 5%/level`, pinned at 95% a few
levels after unlocking anything. It's now interpolated between a per-resource low and
high weighting, which is the shape the real skills use, and it changes how the game feels:

| | lvl 1 | lvl 30 | lvl 60 | lvl 99 |
|---|---|---|---|---|
| Tree | 39% | 52% | 65% | 82% |
| Willow | 11% | 23% | 35% | 51% |
| Copper | 35% | 48% | 61% | 78% |
| Coal | 9% | 19% | 29% | 43% |

Coal stays genuinely slow deep into the level range, the way it should. Rich seams also
take longer to respawn now (copper 6s, coal 30s) instead of a flat 8.

### Cooking has an end to burning

Burn chance bottomed out at 5% forever, so you never stopped ruining shrimp. Every food
now has a level where it **stops burning entirely** — shrimp at 24, salmon at 52 — and
an open fire is cruder than a range, taking five more levels to get there. The guide
lists both numbers per food.

### Firemaking, Fishing, Smithing

- **Logs need levels**: oak at 15, willow at 30. And a fire now burns down to **ashes**
  you can pick up, so the skill has an end product.
- **Fly fishing spends a feather a cast**, which finally gives feathers a reason to exist
  beyond fletching — and a reason to keep them off every chicken.
- **Iron smelting is a coin-flip at every level, forever.** It used to get easier as you
  levelled; it shouldn't, and now doesn't. Bronze and steel never fail.

### Farming is a real skill now

It was two verbs: pick wheat, grind flour. It's now **allotments** — a fenced plot of six
patches at Green Vale.

Rake a patch clear, sow a seed, and walk away. **Crops ripen in real time and keep growing
while the game is closed**, which is the whole point of the skill — you plant, go and do
something else, and come back to a harvest. Potatoes (4 min) through wheat (10 min), with
yield rising with your level. Farmer Wend now sells rakes and seed. Patches render their
own state: weeds, bare tilled earth, shoots, ripe crop.

### Also fixed in multiplayer

The server had the same pickaxe bug — and one of its own: **every tree gave plain logs**
there, so oaks and willows were worthless in multiplayer no matter what the tree table
said. Both fixed, along with the new roll rates and feather cost.

---

## What's new in v0.36 — Mourncross, and Prayer that means something

The biggest single update so far: a drowned town east of the river, the quest that gets
you into it, and a Prayer skill rebuilt on the real mechanics.

### Prayer, rebuilt

Prayer was three prayers draining a fraction of a point per tick. It is now the OSRS
model, faithfully:

- **18 prayers in six mutually exclusive groups** — Attack, Strength, Defence, Ranged,
  Magic and Protection. Turning one on switches its rivals off, the way the prayer book
  does. Boosts run +5% / +10% / +15% up the ladder.
- **Protection prayers** (levels 37–43) turn aside *every* attack of their style. The
  monster still swings; it simply cannot land.
- **The drain-counter model.** Each prayer has a *drain effect*, not a point cost. Every
  tick the total is added to a counter, and one point is spent each time that counter
  passes your **drain resistance** = `60 + 2 × prayer bonus`. Thick Skin (drain 3) costs
  one point every 12 seconds at zero bonus; Protect from Melee (drain 12) costs one every
  3 seconds. Both match the source exactly.
- **Prayer bonus** is a real equipment stat now, shown in the Worn tab. +15 of it makes
  your points last 50% longer.
- **1-tick flicking.** A prayer that was switched off at any point during a tick is not
  charged for that tick. Flick one off and straight back on between ticks and it is up
  when it matters and costs nothing — measured at **0 points over 200 ticks**, against 40
  points for leaving it on. It costs you a click every 600ms, which is the whole point.
  The new enemy attack animations are what let you time it.

### Mourncross

A raised stone **causeway** crosses the river east of Lumbridge onto the **Mourncross
Flats** — marsh, bare standing timber, ectoplasm seeps and **marsh wraiths**. Beyond it
is a town that looks intact and is not: pale salt-scoured masonry, grey flagstones,
lamps burning cold blue, a churchyard, and a population who are all dead and all still
there. Ghosts render **translucent**, hover clear of the ground, and cast no shadow.

You cannot talk to any of them without the **Ghostspeak Amulet** — a new **amulet
equipment slot**. Without it, every ghost is noise, and even the shopkeeper will not
deal with you.

**Why go:** the **Bone Font** is the best Prayer training in the game. Grind bones at the
mill, draw ectoplasm from a seep, and offer both — **4× what burying the same bones would
give**, with per-bone-type meal so dragon bones still pay like dragon bones. The disciples
pay 5 **ecto-tokens** an offering, and **Marrow's Rest** — which refuses coin entirely —
is the only source of prayer-bonus gear in the province.

### The Weight of Souls (sequel to The Restless Dead)

Seven stages, and it finally answers what the Ancient Relic actually *is*.

Father Aereck's relic hums at night and his graves have started settling upward. Sister
Wenna reads it in the Southmarch cathedral: it is not holy, it is a **piece of a
machine** — a soul-anchor reading LET NONE DEPART, chipped from a much larger one still
standing in Mourncross. Fifty years ago a plague came up the coast, the town prayed, and
something answered: not one soul of Mourncross would be *taken*. It kept its word.

- **Craft the amulet** from three parts: a pale bead fused from marsh sand and ectoplasm
  at a furnace, grave-silk taken off the wraiths, and a shard chipped off the relic itself.
- **A logic puzzle**, and a different shape from Animal Magnetism's lights-out ring: the
  gate to the Tallyman's chamber opens only to the funeral peal, and nobody remembers all
  of it. Three ghosts each hold one clue — *Mourning was last*, *Deep came immediately
  after Dawn*, *Thin was not first* — and together they pin down exactly one of the 24
  possible orders. Ring the four named bells wrong and the peal dies and resets.
- **A boss.** The Tallyman casts, so bring a bow, not a blade.
- **Reward:** 2,500 Prayer xp, 900 Crafting, 600 Hits, 40 ecto-tokens, and the Bone Font.

### Enemy attack animations, and enemies that face you

Enemies used to fight with their backs to you and never visibly swing.

- Monsters now **square up** to whoever they are fighting — whether they aggroed you or
  you opened on them — and hold that facing until the fight breaks off.
- They **play a strike** on their attack tick: humanoids use the same weapon-specific
  motion the player does, baked-mesh creatures lunge, and the Canvas fallback leans the
  sprite at its target. Mirrored to the multiplayer server via a per-strike sequence
  number, so a swing is never lost to a snapshot landing mid-animation.

While mirroring this I found the **v0.32.1 leash was never actually added to the server**
— my note from that session said it was. Server-side monsters could still trail players
forever. It is in now.

### Quest log fixed

Quests turned green as soon as they hit stage 2, but multi-stage quests run well past
that — The Lost Tribe completes at 4, The Artisan's Apprentice at 6. So five of eleven
quests showed as **complete while you were still doing them**. Each quest now declares
its own completion stage, and in-progress multi-stage quests show how far along you are.

---

## What's new in v0.35.2 — Nothing stands on you any more

Fixes the long-standing bug where you could end up fighting an enemy **on your own
square**. The v0.29 fix only guarded the *chase* code; three other paths could still
put a monster on your tile — **wandering**, **walking home**, and **respawning**. Once
one landed there, combat never separated you, because you were already within reach so
neither side ever moved again.

- Every NPC movement path now goes through one occupancy check, so nothing can step
  onto your square.
- A catch-all separates anything already sharing your tile — so old saves, or an enemy
  respawning under you, heal themselves instead of locking you together.
- The same fixes are in the multiplayer server, which checks **every** player on the
  level rather than only the one a monster is chasing.
- Multiplayer also gained the **leash** from v0.32.1, which had only ever been applied
  to singleplayer — server-side monsters could still trail players indefinitely.

## What's new in v0.35.1 — Clicking picks the thing you meant

Overlapping click boxes used to be resolved purely by **distance from the camera**, so
a tall town wall standing between you and a ladder won the click — and since a wall's
only option is *Examine*, hovering the ladder offered "Examine Town wall".

Targets are now ranked RS2-style instead:

- **Things with a real action beat examine-only scenery**, so the ladder wins over the
  wall in front of it, and a bank booth wins over the castle wall around it.
- **Examine is always last** in the list, however many things overlap.
- Six overlapping candidates are considered rather than four, so a small target isn't
  dropped behind big scenery.

Right-click still lists everything, so nothing became unreachable — a wall on its own
now left-clicks as *Walk here*, with *Examine* a right-click away.

## What's new in v0.35 — RS2 click markers

- **A yellow X** marks the spot when you click the ground to walk, and **a red X**
  lands on whatever you clicked to interact with — an NPC, a tree, a bank booth, an
  item on the floor. Both pop to full size and fade out over ~0.65s, as RS2's did.
- The red X is placed on the **target's own tile**, not where the cursor was, so it
  reads as "that thing" rather than "that point on the floor".
- Markers are tagged with the level they were made on, so one doesn't linger over
  the dungeon after you climb down.
- Drawn by one shared helper used by both the WebGL and canvas renderers, and raised
  from `Game.setAction`/`walkTo`, so every path — left-click, right-click menu, and
  the multiplayer verbs — gets the same feedback for free.

## What's new in v0.34.1 — The map scales

Pinging a key entry with many locations dragged the game to a crawl. The cause turned
out not to be the number of pings but the fact that **every animation frame redrew the
whole map from scratch** — 36,864 tile rects at Fit zoom.

- **Terrain is baked once per layer** into a 1px-per-tile bitmap and blitted scaled.
  This is O(1) per view change instead of O(map area), which is what makes a much
  bigger world affordable.
- **Markers and labels are cached** to an offscreen canvas keyed on the view, so an
  animation frame is one `drawImage` plus the pings.
- **Pings cluster.** Locations that look bunched merge into a single ring labelled with
  how many it covers (**×17**), so 41 mine rocks are 3 rings rather than 41 overlapping
  ones. Clustering works in *screen* space, so zooming in splits a cluster back into
  its parts.

Measured on the 192×192 map:

| | before | after |
|---|---|---|
| Ping frame at Fit zoom | 121 ms | **0.08 ms** |
| Ping frame zoomed in | 6.1 ms | **0.03 ms** |
| Redraw on drag/zoom at Fit | 62 ms | **0.59 ms** |

## What's new in v0.34 — A real world map

Modelled on the OSRS world map (its icon key, zoom levels and click-to-find behaviour):

- **Facility icons.** The map now marks every bank, shop, altar, anvil, furnace,
  cooking range, fishing spot, mine, farming spot, dungeon ladder and quest-start NPC,
  each with its own glyph — derived from the world's actual scenery and NPCs, so it can
  never fall out of sync with the map.
- **An icon key** down the side listing every facility with a count. **Click a row and
  those locations pulse** on the map (exactly what OSRS's key does); **right-click a row
  to hide** that category.
- **Zoom and pan** — mouse wheel zooms toward the cursor, drag pans, and **Fit** frames
  the whole world. A drag no longer counts as a click, so panning never walks you somewhere.
- **Layer switching.** Surface / Dungeon buttons let you read the dungeon map while
  standing above ground, instead of only ever seeing the layer you're on.
- **Ore rocks are coloured by type** (copper, tin, iron, coal) — an OSRS 2024 map change
  worth stealing.
- **Labels no longer collide.** Each label tries several offsets and is dropped if the
  space is taken, so nothing overlaps or gets clipped — the old map jumbled
  "Kitchen / General Sto / River" on top of each other.
- **Find yourself instantly.** *You are here* sits at the top of the key and there's a
  **Find me** button: either one centres the map on you and sets off an expanding **ping**.
  And whenever you're zoomed in far enough that you're off the visible area, an **arrow
  pins to the edge of the map pointing at you, labelled with how many tiles away you
  are** ("You · 95") — so you always know where you are relative to what you're looking at.
  If you're viewing the other level, the row jumps you back to yours.

## What's new in v0.33 — RS2-style interface

- **Tabs are split across two bars**, RS2-style: character and gameplay on top
  (Combat · Stats · Quest · Inventory · Worn · Prayer · Magic), system below
  (Emotes · Options).
- **New Combat tab.** Combat styles moved out of Skills and auto-retaliate out of
  Options, joined by your combat level and current weapon. Each style now says what
  it trains, so "Controlled" vs "Accurate" is no longer a guess.
- **New Emotes tab** — a placeholder shelf, ready for real emotes later.
- **The Worn tab now shows a full RS2-style bonus block**: **Attack** and **Defence**
  side by side, **Other bonuses**, and **Weapon speed** in ticks and seconds.
  Stab/slash/crush are collapsed into one broader **Melee** figure, since our combat
  model has no per-blade-type maths.
  - Defence is the interesting one: we carry a single armour value plus an armour
    *class*, so each figure is that value read through the combat triangle. Full
    steel shows **Ranged +53 / Melee +42 / Magic +34** — it resists arrows, is
    neutral to blades, and cooks under spells. The triangle is finally legible at a
    glance instead of buried in an examine string.

## What's new in v0.32.1 — Road monsters stay on the road

- **Monsters are now leashed to where they spawned.** Previously an aggressive NPC
  would ratchet after you forever — it only gave up at 12 tiles *from you*, and
  re-aggroed the moment you came back in range — so highwaymen followed players
  through the town gate and all the way to the bank. Each monster now has a `leash`
  distance from its spawn point: it breaks off when it strays past it, and walks home.
  Highwaymen leash at 7 and so can never get closer than 6 tiles outside Lumbridge's
  south wall; Dark Wizards leash at 6 and stay in their circle.
- **Highwaymen thinned and toned down** — 11 → 6 on the road, and combat level 21 → 13,
  so they read as a hazard for someone fresh off the training yard rather than a wall.
- **The toll gate is gone.** Walking around it was easy enough that it was decoration
  pretending to be an obstacle, so the gate, its wall and Toll Keeper Bramm have been removed.

## What's new in v0.32 — The Long Road: a world worth walking

The map grew from 128×128 to **192×192**, and the space went almost entirely into
one thing: making travel feel like a journey instead of a corridor.

- **The southern highway is now ~100 tiles of road** from Lumbridge's south gate to
  Southmarch's dock gate, paced with a landmark every 15–25 tiles so there is always
  something ahead of you:
  1. **The training yard** and then **the downs**, where highwaymen work the road
  2. **Rookmoor** — Ava's workshop and the Warding Circle, hanging off to the west
  3. **Willowmere** — a new village (below)
  4. **The stone circle** — six menhirs, a **wayside shrine** that restores prayer, and
     **Dark Wizards**: casters, so plate armour is the wrong answer and a bow is the right one
  5. **The burnt steading** — a ruin of rubble and charred beams off the east verge
  6. **The wayside inn** — the only bed and range between the two cities
  7. **Southmarch**, now much larger (50×28) with three great streets
- **Milestones** count down the leagues along the road — read one to see how far is left.
- **Willowmere** — a small village of dark stained timber leaning toward a still mere,
  with willows, a fishing spot, an open-air market (stalls, no shopfronts) and villagers
  who would rather you didn't mention the wizards up at the stones.
- **Every settlement now has its own building material**, so you can tell where you are
  at a glance: Lumbridge **warm timber**, Aldervale **cold northern granite**, Willowmere
  **dark stained wood**, Southmarch **southern sandstone**. One `mat` tag on a piece of
  scenery tints the shared meshes, in both the WebGL and canvas renderers.
- The world map gained 14 new landmarks so the whole road is legible at a glance.

## What's new in v0.31 — The Southmarch, capes & legs, and Animal Magnetism

- **Two new equipment slots: Cape and Legs.** The Worn tab now lays out six slots
  (helmet · cape · body · legs · weapon · shield), and both new slots render on your
  character in 3D — a cape hangs off the shoulders and swings when you run.
  - **Plate legs** in bronze/iron/steel — smithable (3 bars) and melee-class, so they
    stop steel but leave you exposed to spells.
  - **Leather chaps** and **hard leather chaps** — craftable (Crafting 7 / 14), ranged-class.
  - **Wizard skirt** — magic-class robe bottoms, sold in the general store.
  - Legs now count toward your **armour class** for the combat triangle, so a full kit
    reads consistently instead of hanging entirely off your body slot.
- **A new province: the Southmarch.** The south road runs on past the training yard,
  across open downs, and in at the north gate of **Southmarch** — the largest city on
  the map. Curtain walls with three gates, two great streets crossing at a market
  plaza (fountain, statue, well, stalls, awnings, dock crates), a fortified bank, a
  cathedral with glass down both aisles, a guildhall/tavern, and **Southmarch
  Outfitters**, which sells capes and legwear.
- **Highwaymen** haunt the road between the two cities — road-agents in leather (bring
  a blade, not a bow) who drop **coloured capes**, and rarely a **Highwayman's Cloak**.
  (Retuned to level 13 in v0.32.1.)
- **New quest: Animal Magnetism.** Ava Corrick's lodestone research has gone wrong and
  every loose nail in the county leaps at her. Recover the Lodestone Core from the
  **Warding Circle** on Rookmoor — a genuine puzzle: five standing stones, and touching
  one flips its **two neighbours** as well. (A ring of five is always solvable, so no
  sequence of touches can ever strand you — the quest tells you so, and it's true.)
  Read **Ava's Notes** in your pack for the rules and your current progress.
- **Reward: Ava's Satchel** (cape slot) — a lodestone-lined pack that calls your loosed
  arrows home. It keeps **72% of arrows fired**, exactly as OSRS models it: p(n) = 0.72^(n−1)
  is the chance a single arrow is fired *at least* n times (p(1) = 1 — any arrow can always
  be fired once), giving an expected 1/(1−0.72) ≈ **3.57 shots per arrow**. Plus 1,000
  Crafting, 750 Fletching and 750 Ranged xp.
- Multiplayer keeps pace: the server has the same six worn slots, the same arrow-recovery
  maths (shared via `js/combat.js`), and the same Southmarch/Rookmoor NPC spawns.

## What's new in v0.30 — Multiplayer catches up to singleplayer

- **Shared combat module** — the damage roll, combat triangle, weapon/NPC attack
  speeds and armour classes now live in one file (`js/combat.js`) that **both**
  singleplayer and the game server use, so combat can never drift between them.
- **The server plays like singleplayer** — multiplayer now has the worn-equipment
  system (**wield/unequip** your gear), **ranged combat** with arrows, the **combat
  triangle**, **per-weapon and per-monster attack speeds**, and the **stop-beside-the-
  enemy** melee fix. NPC spawns and world content (farms, training yard, Hollow-folk
  camp, Giants' Den) match singleplayer too.
- Banking, shops, smithing/cooking, prayer, magic and quests are still singleplayer-
  only in multiplayer for now — but because the rules are shared modules, wiring them
  up later is mostly plumbing.

## What's new in v0.29 — Attack speeds & clean melee

- **Weapon attack speeds** — weapons now strike on their own timer (in RS2 ticks, 0.6s
  each) instead of every tick. Fast blades hit often; heavy weapons hit slower **but
  harder**: swords 4 ticks, maces 5, battle-axes 6, and daggers-fast on the light end.
  **Bows** fire faster on the **Aggressive (Rapid)** style — shortbow 3 rapid / 4
  otherwise, longbow 5 / 6.
- **Enemy attack speeds** — monsters have their own speeds too (goblins 4 ticks, giants
  and zombies 6, dragons 5…), so slow bruisers hit hard but rarely.
- **No more overlap** — when you melee, your character now stops on the **tile beside**
  the enemy instead of standing on top of it, and enemies won't step onto your square —
  so you can always see who's hitting whom.

## What's new in v0.28 — Bank search & bank notes

- **Search** — a search box in the bank filters items by name as you type (works with
  the tabs).
- **Bank notes** — toggle **Note** and withdrawing hands you a single **stackable note**
  instead of a slot per item — carry 500 logs in one space. Notes can't be used, worn
  or eaten; deposit them (or click **Deposit all**) to reclaim the real items at the
  bank. This also lays the groundwork for **noted drops** from tough monsters later.

## What's new in v0.27 — Worn gear off the belt & a real bank

- **Equipped items leave your inventory** — wielding a weapon or wearing armour now
  moves it out of the pack into your worn-equipment slots, **freeing up inventory
  space** (RS2-style). Take gear off from the **Worn** tab and it returns to your bag.
  Swapping same-slot gear is a clean one-slot swap; two-handed weapons and shields
  still auto-stow each other. Old saves migrate automatically.
- **A proper bank** — a **quantity selector** (1 / 5 / 10 / X / All) sits at the
  bottom of the bank; pick an amount and every click withdraws or deposits that many.
  **Withdraw/Deposit X** prompts for a custom number, and the bank now has **tabs** —
  right-click an item to file it into tab 1–4, and click a tab (or **All**) to filter.

## What's new in v0.26 — A town that feels lived-in

- **Town walls & gates** — Lumbridge is now ringed on its **west and south** sides by
  tall crenellated **ramparts** with arrow-slits, flanked by **gatehouses** with
  banners. The gates stand **open**, with the farm path leaving to the west and the
  cobbled road running out to the south.
- **A proper castle & bank** — the castle and the Aldervale bank now have those tall
  multi-storey rampart walls with storey banding and windowed **corner towers**, so
  they read as real keeps rather than one-storey boxes.
- **Shops you can browse** — the general store and armoury have **counters** flanking
  the entrance and back-wall **shelves stocked with colourful wares**.
- **Stained glass** — the church nave is lit by arched **stained-glass windows** down
  its south and east walls.

## What's new in v0.25.2 — RS2-style skills grid

- The **Stats** tab now lays the 16 skills out in a compact **3-column grid** (icon +
  level per cell, over an xp-progress fill), like RS2 — so the whole skill list fits
  in the panel without scrolling. Hover a cell for the name and xp-to-next-level;
  click it for the skill guide as before.
- The **Magic** skill icon is now a **wizard hat** (was a star) so it no longer
  reads like Prayer's ankh.
- **Armour now requires Defense to wear** — Leather/Bronze at level 1, Hard Leather
  at 5, Iron at 10, Steel at 20 — so the Defense skill guide finally has real tiers
  (with item icons), and Defense levelling unlocks better gear like Attack does for
  weapons.

## What's new in v0.25.1 — HUD stays on-screen

- **Fixed** a bug where dragging a HUD panel (HP/PR/run, minimap, chat, inventory)
  and then changing the window size — e.g. leaving fullscreen — could push it
  off-screen and out of reach. Panels are now clamped fully inside the window while
  dragging, on every page load, and whenever the window resizes.

## What's new in v0.25 — The combat triangle, two-handed bows & magic

- **Combat triangle** — RS2-style rock-paper-scissors: **magic > melee > ranged >
  magic**. Every monster now has an armour class with a weakness and a resistance;
  bring the style it fears (shown right in the **Attack** option and on **Examine**)
  for a real accuracy and damage edge — and pick the wrong one and it shrugs you off.
  Your own equipped armour class (metal = melee, leather = ranged, robes = magic)
  decides how well you soak each foe's attacks, too.
- **Two-handed bows** — bows (and the new staff) now need both hands, so they
  can't share a hand with a shield. Equipping one stows your shield and vice versa;
  the old bow-and-shield-in-one-fist look is gone.
- **Auto-cast** — hit the **⟳** beside a spell in the Magic tab to set it as your
  auto-cast, then just **Attack** a monster to sling that spell every turn, at range.
- **Magic gear** — a new **Magic Staff** (channels its own air runes) plus **Wizard
  Hat & Robe** (magic-class armour: turns arrows, tears under a blade). The staff and
  robes are a reward from **Trial by Fire**, which now teaches auto-cast and the
  triangle; all three are also stocked at the general store.

## What's new in v0.24 — Animations & tools in hand

- **Weapon-specific attacks** — swords sweep a **diagonal slash**, axes and maces
  **chop overhead**, bows play a **draw-and-loose**, spells **thrust both palms
  forward**, and unarmed throws a straight **jab**. Your character now turns to
  **face** whatever they're fighting or working on.
- **Skilling animations** — you visibly swing the right tool for the job: a
  **hatchet** at trees, a **pickaxe** at rocks, a **hammer** at the anvil, and you
  **cast and bob a rod** while fishing (with cooking/smelting reach-and-tend). The
  gesture repeats for as long as the action runs.
- **Better-defined models** — new handheld **axe / pickaxe / hammer / fishing-rod**
  models, and the weapons gained detail: swords now have a **pommel, crossguard,
  fuller and tapered point**, maces a **flanged head**, axes a **fanned bit**.
  Bows now ride correctly in the **off hand**.

## What's new in v0.23 — Skills panel & guide glass-up

- **Skill icons** — every skill in the Stats panel now has its own drawn icon
  (sword, shield, heart, bow, pickaxe, wheat…), with a subtle **XP-progress fill**
  behind each row so you can see how close you are to the next level at a glance.
- **A proper skill guide** — click any skill to open a guide with its icon, an
  **XP progress bar**, and a list of what you unlock at each level — now with the
  **item icons** for what you produce, have/locked highlighting, and full entries
  for the newer skills (Crafting's leatherworking and Farming), plus big bones in
  the Prayer guide.

## What's new in v0.22 — Trial by Fire: ranged, magic & safe spots

- **Quest: Trial by Fire** — Sergeant Kaelen runs a **training yard** south of
  Lumbridge with a **fenced goblin pen**. He arms you with a **shortbow, arrows
  and runes**, then teaches the single most important combat trick: the **safe
  spot**. Attack the penned goblins from *outside* the fence — melee can't path to
  them, but your **bow and spells reach right over it**, so they rage and claw and
  never lay a finger on you. *Rewards:* a bow, ~180 arrows, ~140 runes, and 250
  Ranged + 250 Magic xp to launch your ranged/magic career.
- **Safe spots are real mechanics** — because enemies pathfind and ranged/magic
  attack at a distance, standing behind a rock, gate or fence a monster can't cross
  genuinely protects you. The pen makes the lesson concrete (a melee attacker
  literally can't reach a fully-fenced target, but you can).
- **Locked to 60 fps** — rendering is now capped at 60 fps on any display, while
  the simulation runs on a fixed **RS2-style 0.6-second tick**, independent of your
  frame rate.

## What's new in v0.21 — The Artisan's Apprentice & a Crafting skill

Getting started is now a guided adventure, not a cold plunge into the grind.

- **Quest: The Artisan's Apprentice** — Thessaly, by the Lumbridge kitchen, teaches
  you the trades one lesson at a time: chop logs (**Woodcutting**), light fires
  (**Firemaking**), smelt a bronze bar (**Mining & Smithing**), catch and cook a
  shrimp (**Fishing & Cooking**), and stitch a leather coif (**Crafting**). Each
  lesson pays out a **big chunk of XP** — a deliberate head-start of ~250 xp per
  skill so you blow past the slowest early levels — and it finishes with coins.
- **Crafting comes alive** — cows now drop **leather**; use a **needle** on it to
  craft a **leather coif**, **leather body** or a tougher **hard leather body**,
  earning Crafting xp. The old empty skill finally has a loop.
- If you already know a trade, the matching lesson just completes when you talk to
  her — the tutorial respects veterans and guides newcomers.

## What's new in v0.20 — The Rising Deep: giants, big bones & gated areas

Skills now open the world up. Two **level-gated areas** and a quest that pays off
the Lost Tribe's "something old wakes" teaser.

- **The Giants' Den** — a deep cavern beneath the Hollow-folk camp, sealed by a
  **boulder you can only shift with Strength 20**. Inside: towering **hill giants**
  and their chieftain **Grukk**, a proper boss.
- **Big bones** — hill giants drop them, and they give **15 Prayer xp** a bury
  (versus 3.75 for common bones) — the in-between Prayer method Prayer sorely
  needed, plus a whole den to farm them in.
- **Quest: The Rising Deep** — Chief Morrow asks you to end the giants stirring in
  the deep. It requires **The Lost Tribe complete and Strength 20** to progress —
  a requirement that fits the story (you must be strong to move the boulder).
  *Reward:* 500 coins, 5 big bones, and **800 Prayer + 400 Strength xp**. It ends on
  a new teaser… the giants broke into something even older.
- **Mining Guild** — a new hall by the mine, its door **gated to Mining 20**, with
  rich iron & coal seams and a bank inside — a real reason to train Mining.
- Giants are rendered with the character model **scaled up**, so they genuinely
  tower over you.

## What's new in v0.19.1 — Dialogue over the chat & a bug sweep

- The **dialogue box now sits over the chat window** (bottom-left), RS2-style,
  instead of floating centre-screen; the conversation transcript reappears in the
  chat when it closes.
- Ran a full audit — combat, banking, shops, smithing, prayer, magic, farming,
  death, every NPC dialogue, skill guides, drop/pickup and the multiplayer server
  boot all check out clean. Fixed a cosmetic slip where an equipped chef's hat
  rendered bronze instead of white.

## What's new in v0.19 — Dialogue choices & threat colours

- **Dialogue choices** — conversations can now branch. NPCs ask, and you pick a
  reply from a list of options (e.g. Farmer Wend and the Cook now ask whether
  you'll take their quest — say yes to start it, or come back later). The dialogue
  system supports this anywhere, so future quests can have real branching.
- **Monster threat colours** — hovering (or right-clicking) an enemy now shows its
  combat level tinted **red → yellow → green** by how it compares to your own
  level, just like RuneScape: red means it far outmatches you, green means it's
  easy prey.

## What's new in v0.18 — Dialogue portraits, auto-retaliate & scrollback

- **A proper dialogue box** — NPC conversations now play in an RS-style parchment
  panel with the speaker's **face portrait**, their name, and click-through text
  (click, Space or Enter to continue; Esc to close). Your low-poly characters
  don't have faces in the world, so each portrait is **drawn procedurally** from
  that character's colours — the Cook keeps his white hat, the skeleton has hollow
  sockets, Doric has his grey beard, and so on. The portrait bobs and the text
  fades in for a bit of life.
- **Auto-retaliate** — you now automatically fight back when something attacks you
  (toggle in **Options**; on by default).
- **Scrollback** — the chat/quest log keeps a long history and no longer yanks you
  to the newest line while you're scrolled up reading; every line of dialogue is
  also written to the log so you can re-read a conversation.

## What's new in v0.17 — RS-style tabs & a movable HUD

- **Icon tab bar** — the side-panel tabs are now **icons** (inventory, worn,
  skills, prayer, magic, quests, options), RS2-style, with tooltips on hover.
- **Move your HUD** — hold **Alt and drag** any HUD panel (health/prayer bars,
  minimap, the side panel, the chat box) to place it wherever you like. Your
  layout is **saved per browser**; reset it any time from **Options → Reset HUD
  layout**.

## What's new in v0.16 — Quests & the world opens up

The early game is now an **adventure**, not a grind — a new area and two proper
story quests, plus a new skill.

- **Green Vale Farm** (west of Lumbridge) — a living farmstead with a farmhouse,
  a **windmill**, golden **wheat fields**, a fenced **cow pen**, a **chicken coop**
  and clucking hens, haystacks, and **Farmer Wend**. Milk a cow (with a bucket),
  search the coop for eggs, pick wheat and grind it into flour at the windmill.
- **New skill: Farming** — trained by working the fields.
- **Quest: The Cook's Feast** — the castle **Cook** is out of ingredients for the
  Duke's feast tonight. Fetch an egg, a bucket of milk and a pot of flour from the
  farm. *Reward:* coins, **500 Cooking xp**, and a **Chef hat**.
- **Quest: The Lost Tribe** — Farmer Wend's brother vanished into the tunnels
  beneath the ruin. Descend into the dark and you'll find the **Hollow-folk** — a
  tribe that fled underground from the dragon generations ago, living in a hidden
  camp of hide tents and totems. A real storyline with a twist and a teaser of
  deeper things stirring below. *Reward:* coins, Defense & Hits xp.
- The **Quest journal** tracks both; the world map and the road west lead you on.

## What's new in v0.15 — Equipment screen, item icons & more props

- **Worn-equipment tab** — a new **Worn** tab shows your gear on an RS-style paper-
  doll (helmet, weapon, body, shield) with your total **Weapon Aim / Power / Armour**
  bonuses; click a slot to take the item off.
- **Hand-drawn item icons** — inventory items are now **procedurally drawn** so each
  reads at a glance: swords/maces/axes/bows, tier-tinted armour, ore lumps, metal
  bars, log bundles, coin stacks, elemental runes (colour-coded), fish (raw/cooked/
  burnt), bones, and every tool — no more ambiguous emoji.
- **More sculpted props** — **bank booths** (a counter with a banner), **castle
  towers** (battlements + a flying pennant), **street lamps** (a glowing lantern)
  and **signposts** are proper low-poly models now, finishing off the box scenery.

## What's new in v0.14 — Workshop models & easier clicking

- **Sculpted workshop props** — the **furnace** (stone, with a glowing mouth and
  a chimney), the **anvil** (a horned iron anvil on a wooden stump), the **cooking
  range** (a stone oven with a stew pot on the hot plate) and the church **altar**
  (a draped stone table with a gold cross and lit candles) are now proper low-poly
  models instead of textured boxes.
- **Dungeon ladders read right** — the down-ladder is now a **dark hole in the
  ground** with a stone rim and a ladder descending into it (no more wooden panel
  that looked like it went *up*); the up-ladder is a proper runged ladder.
- **Much easier clicking** — hit areas now match the **whole model** you see. The
  3D renderer projects each object's full bounding box to the screen (with a
  sensible minimum size), so clicking enemies, ground items, trees and objects is
  no longer a game of pixel-hunting.

## What's new in v0.13 — Inventory & polish

- **RS-style fixed inventory** — your 30 slots now stay put. Using, dropping or
  eating an item **leaves that slot empty** instead of sliding everything up, and
  new items drop into the first free slot.
- **Drag to rearrange** — pick up an item and drop it on another slot to move or
  swap it, just like the real thing (a plain click still uses/wields as before).
- **A real campfire** — fires are now a proper low-poly flame (logs + flickering
  red/orange/yellow tongues) instead of an orange box.
- **Weapons sit right** — swords, axes and maces are held up at the ready (and
  swing on attack) rather than pointing backwards; the **bow** is now a proper
  D-shape with a string instead of a diagonal stick.
- **Fishing spots show in 3D** — a bobbing cluster of foam on the water marks
  each net/lure spot (and they're clickable again).

## What's new in v0.12 — Visible equipment, shadows & 3D by default (engine Stage 4)

The engine upgrade lands: **WebGL 3D is now the default renderer.** (Canvas 2.5D
is still there as a fallback — turn it back on in **Opts**, or add `?nogl` to the
URL — and it kicks in automatically if your browser can't do WebGL.)

- **Your gear now shows on your character.** What you wield and wear is drawn in
  3D: **swords, maces, axes and bows** appear in your hand and **swing when you
  attack**; **kite and wooden shields** sit on your off-arm; **helmets** cap your
  head; and **body armour** (chain / leather) re-skins your torso and arms. Metal
  tiers are tinted — bronze, iron, steel — and the **Dragon Sword** glows green.
- **Soft shadows** — characters, monsters and trees now cast blob shadows that
  ground them on the terrain instead of floating.
- Town **guards** and dungeon **skeletons** carry visible weapons too.
- All of this is cosmetic and reads from your actual equipment, so it just works
  as you gear up. (Other players' gear isn't networked yet — coming later.)

## What's new in v0.11 — Textures & water (engine Stage 3)

The 3D world gets real surfaces. A set of **procedurally-generated material
textures** (all drawn on a canvas at load — no image files, still `file://`-
friendly) is packed into an atlas and mapped across the world (WebGL engine only).

- **Textured ground** — grass, sand, dirt paths, cobbled roads, dungeon stone
  and floors all have real surface detail now, with the UVs rotated per tile so
  the grid stops looking like a grid
- **Masonry & timber** — castle walls and towers are laid up in **stone brick**,
  the blacksmith's furnace is rough stone, the anvil is iron, and booths,
  signposts and ladders are **wood-grained planks**
- **Shimmering water** — the river is now a separate animated pass: a tiling
  caustic texture that **scrolls and ripples**, meeting the land at a sandy shore
- Characters and monsters stay crisply **flat-shaded** (the authentic low-poly
  look), so the textured world and the sculpted models read as one style
- Lighting is per-fragment now, and the canvas renderer is still untouched

## What's new in v0.10 — Sculpted low-poly models (engine Stage 2)

The 3D world stops being made of boxes. A new **mesh system** bakes each monster
and set-piece into its own sculpted low-poly model (tapered bodies, pyramids,
octahedron canopies), drawn in a single call with animation layered on top —
still only in the WebGL engine (**Opts → Engine: WebGL 3D**).

- **Real monster models** — the **giant rat** is a hunched, tailed critter with
  ears and little legs; the **bear** has a shoulder hump, snout and four sturdy
  paws; the **green dragon** now has a proper body, a horned head on a raised
  neck, a tapering tail, four clawed legs, a row of back spikes and **flapping
  wings** — no more green box
- **Sculpted set-pieces** — a two-tier **fountain** with a stone basin and blue
  water, a hero **statue** raising a sword on a stepped pedestal, a roofed stone
  **well**, and striped **market stalls** with awnings, posts and goods
- **Low-poly trees** — trunks topped with layered octahedron canopies, each
  rotated a little by position so no two look identical (oak, willow and normal
  all distinct)
- Creatures **bob** as they move/idle so the baked meshes feel alive
- **Brighter daylight** — the surface no longer fades to black. The distance fog
  is now a soft daytime haze and **scales with zoom**, so zooming out reveals a
  lit, hazy horizon instead of a dark void (the dungeon stays moody on purpose)
- Picking, HUD and the canvas renderer are all untouched — same clean swap

## What's new in v0.9 — Real 3D engine (WebGL, beta)

The big one: a from-scratch **WebGL renderer** that takes the game from RuneScape
Classic's flat sprites to a **RuneScape 2-era low-poly 3D world**. Turn it on in
**Opts → Engine: WebGL 3D** (Canvas 2.5D remains the default while it matures).

- **Real 3D terrain** — the heightmap is a lit triangle mesh with directional
  shading from surface normals and distance fog, drawn with a depth buffer (no more
  painter's-algorithm sorting)
- **3D characters** — players, NPCs and monsters are low-poly models built from
  jointed boxes (head/torso/arms/legs) with **walk and attack animation** — the
  classic 2004 look
- **A 3D town** — buildings, walls, towers, lamp posts, market stalls, the fountain
  and statue are all real 3D geometry you can walk around
- Hand-written GLSL shaders and matrix math — **still zero dependencies, no build
  step, runs from `file://`**
- Everything still works: click-to-interact (GPU-matched picking), the HUD/health
  bars/names/floating-xp draw on a 2D overlay, both map layers, multiplayer
- The renderer is a clean swap behind a toggle — game logic, world, UI and the
  multiplayer server are completely untouched

This is **Stage 1** of the engine upgrade (terrain, characters, picking, parity).
Next stages: sculpted monster/scenery models, textures, water and lighting polish,
then WebGL becomes the default.

## What's new in v0.8 — A second town & living NPCs

- **Aldervale**, a trade town to the north, reached by a **cobbled road running through
  the woods** (it passes right through the castle's north and south gates)
- **An armoury** that finally sells real gear — iron & steel weapons, helmets, chain
  bodies, kite shields, longbows and better arrows — so your coins have a purpose
  (the shop system now supports multiple distinct stores)
- A **market square** with a hero **statue**, striped **market stalls**, a **well**,
  a **second bank**, and a **tavern** (the Silver Stag, with its own cooking range)
- **Living NPCs**: wandering **townsfolk** (men and women) who **chatter** with
  floating speech bubbles, plus **town guards** who patrol, fight back if provoked,
  and drop coins
- Both towns and all NPCs are in the multiplayer world too
- World map & minimap show Aldervale, the road, and every new landmark

## What's new in v0.7 — A proper town

The town was rebuilt to actually feel like a town (think Lumbridge):

- **Castle set-piece** to the north with four crenellated corner towers and pennants,
  housing the **bank** in its courtyard
- **Fountain centrepiece** with animated water jets in a **cobblestone plaza**
- **Real streets** — two cobbled roads crossing at the square, lined with glowing
  **street lamps**, plus a signpost at the south gate
- The **furnace and anvil** now sit indoors in a **blacksmith**, and the **cooking
  range** in a **kitchen** — no more tools scattered in an open field
- **General store** and **church** buildings around the square, each with a door
- The **world map and minimap** now render the town's roads and landmarks clearly
- Old saves that ended up inside a new wall are safely nudged back to the square

## What's new in v0.6 — Quality of Life

Lots of small things that make the game nicer to actually play:

- **World map** (press **M** or the 🗺 button) — the whole surface/dungeon with
  every landmark labelled (bank, store, mine, dungeon, dragon's lair…); click
  anywhere to travel there
- **Skill guides** — click any skill name in the Stats panel to see exactly what
  you unlock at each level, generated from the real game data
- **Run toggle** (press **R** or the HUD button) — ~1.85× move speed for crossing
  the now-larger map
- **Always-visible HP / Prayer bars** so you're not opening a tab mid-fight
- **Floating XP** numbers and a **level-up banner** for satisfying feedback
- **Inventory tooltips** — hover any item to see its aim/power/armour/heal and
  level requirement
- **Bank "Deposit all"** button
- **Animation polish** — trees sway, your weapon swings and your axe/pick chops
  while gathering

## What's new in v0.5 — Fletching & the Dragon

An endgame progression loop: train ranged, then hunt a boss for the best weapon.

- **New skill — Fletching**: cut logs with a knife into arrow shafts and unstrung
  bows, add a bow string to finish bows (shortbow / longbow / oak longbow), and
  fletch arrows (shafts → feathered → tipped with smithed arrowheads). Woodcutting
  now feeds ranged combat, and **oak/willow trees drop their own log types**
- **Reworked ranged**: bows carry aim/power bonuses and the game auto-picks your
  best arrow tier (bronze/iron/steel); smith arrowheads 15 at a time from a bar
- **Boss: the Green Dragon** — lurks in a lair carved deep beneath the ghost crypt,
  80 hits, **breathes fire at range** (a real projectile), and hits hard enough to
  need food and good armour
- **Rewards worth the fight**: **dragon bones** (60 Prayer xp vs 3.75 for normal
  bones) and a rare unique — the **Dragon Sword**, the best melee weapon in the game
  (~15% drop)
- Fletching added to the Stats panel (15 skills now); old saves migrate cleanly

## What's new in v0.4 — Multiplayer (beta)

The game is now optionally a **shared online world**, while singleplayer still runs
standalone from `file://` with no server.

- **Authoritative Node server** (`server/`, WebSocket) owns the world and runs the
  600 ms tick; browser clients send intents and render server snapshots
- **See other players** move in real time, each with a name label and floating
  **chat bubbles**; a chat bar (press **Enter**) and online roster
- **Shared, server-authoritative**: movement, woodcutting, mining, fishing, melee
  combat, monster aggro/AI, loot drops, and death — two players can fight the same
  monsters and watch each other chop the same forest
- **Deterministic world sync**: server and clients generate the identical seeded
  map, so only *changes* (chopped trees, depleted rocks, dropped items) are sent
- **Server-side persistence**: your character saves to `server/players/<name>.json`
- Zero-build client preserved: the server loads the browser's own `data.js` /
  `world.js` in a Node VM, so there's one source of truth and nothing to compile

To play together: `cd server && npm install && npm start`, then in-game open the
**Opts** tab → Multiplayer → Join. See [`server/README.md`](server/README.md).
Banking, smithing, quests, prayer and magic remain singleplayer-only for now.

## What's new in v0.3

- **Metal tiers**: bronze → iron (lvl 10) → steel (lvl 20) swords, maces, axes, helmets, chain bodies, and kite shields — all smithable, with Attack-level wield requirements and tinted icons
- **Smelting recipes**: bronze (copper+tin), iron (50% impurity fail, improves with level), steel (iron + 2 coal)
- **New resources**: coal rocks (mine + dungeon), oak (lvl 15) and willow (lvl 30) trees, better axes chop faster
- **Fly fishing**: lure spots on the river (rod from the store) give trout (lvl 20) and salmon (lvl 30); net spots now also give anchovies (lvl 15); data-driven cooking with per-fish levels and burn rates
- **Deeper dungeon**: the crypt now descends to a hobgoblin hall (with iron/coal seams to mine) and a ghost crypt — both heavily aggressive
- **New surface monsters**: goblins east of town, bears (aggressive, drop furs) in the western forest
- **Two new quests**: *The Dwarf's Request* (Doric, by the mine) and *Fur Trader* (shopkeeper, after Rat Menace)
- **Real death penalty**: you keep only your 3 most valuable item stacks (+ quest items); the rest drops where you fell for 3 minutes
- **Generative music**: ambient pentatonic loop (toggle in Options), plus minimap click-to-walk, middle-mouse camera drag, and xp-to-next-level tooltips

## What's in (v0.2)

**Engine**
- Software-projected 3D terrain (heightmap quads, painter's algorithm, black distance fog) on a 2D canvas
- 128×128 surface world **plus an underground dungeon layer**: river, beach, forest, mine, and a town (bank, general store, church, smithy, ruin with dungeon ladder)
- Click-to-move BFS pathfinding, 600 ms game ticks, **authentic RSC XP curve**
- Procedural WebAudio sound effects (mutable in Options)

**Skills** — Woodcutting, Mining, Fishing, Firemaking, Cooking (fires + range, range burns less), **Smithing** (smelt copper+tin at the furnace, hammer bars into sword/mace/axe at the anvil), **Prayer** (bury bones; 3 toggleable prayers that boost combat and drain points; recharge at the church altar), **Magic** (4 strike spells using runes), **Ranged** (shortbow + arrows, projectile animation)

**Combat**
- Melee with **equipment** (wield weapons/shields/armour, RSC-style highlighted in inventory) and **4 combat styles** (Controlled/Accurate/Aggressive/Defensive xp routing)
- Aggressive dungeon monsters (skeletons, zombies) with weighted drop tables; giant rats in the meadow
- Hit splats, health bars, retaliation, death/respawn

**Economy**
- **Bank** with deposit/withdraw (1/5/All) at the booths
- **General store**: buy gear, runes, arrows, tools; sell anything at 60% value; slow restock

**Quests** (journal tab with red/yellow/green status)
1. *The Guide's Lunch* — Bob wants 3 cooked shrimp
2. *Rat Menace* — the shopkeeper wants 5 giant rats slain
3. *The Restless Dead* — recover the Ancient Relic from the dungeon for Father Aereck

**Persistence** — autosave to localStorage (v2 format, migrates v1 saves)

## Dev tools

- **`tools/model-viewer.html`** — open it straight from `file://` like the game. Three
  modes: a **gallery** of every baked model with triangle counts, a **turntable** for one
  model (drag to orbit, wheel to zoom), and a **GL vs Canvas** split that draws the same
  scenery type through both renderers. It drives the real `GLRenderer.drawModel` and
  `CanvasRenderer.drawScenery`, so what it shows is what the game shows. Edit
  `js/gl-models.js`, press F5 — no screenshot scripting.
- **`tools/gen-drop-tables.mjs`** — regenerates `DROP_TABLES.md` from the live tables.

## Reference

[`DROP_TABLES.md`](DROP_TABLES.md) — every attackable monster's loot, with measured
rates and the shared sub-tables. The mechanical half is generated from the game data
by `tools/gen-drop-tables.mjs`; **rerun it after touching `NPC_DEFS` or `DROP_TABLES`**
so the document stays true.

## Backlog

[`UPDATE_IDEAS.md`](UPDATE_IDEAS.md) — a working backlog mined from ~439 RuneScape
updates across two eras (**2001–2007** and **2013–2015**), sorted into *already have*
/ *worth adding* / *skip*, with dedicated sections on **quality of life** and on
**growing the world**, plus a suggested order. Mechanics and design patterns only;
no Jagex content.

## Layout

- `js/data.js` — items, NPCs, scenery, skills, spells, prayers, shop stock, quests, XP table
- `js/combat.js` — pure combat maths shared with the server (damage roll, triangle,
  attack speeds, armour classes, arrow recovery)
- `js/world.js` — two-layer map generation (surface towns + dungeon), pathfinding
- `js/renderer.js` — the software 3D renderer + procedural sprites + projectiles
- `js/sound.js` — WebAudio synth effects
- `js/ui.js` — chat, menus, 6 side panels, bank/shop windows, minimap, input
- `js/game.js` — tick loop, actions, combat, economy, quests, saves

## Roadmap

1. ~~Equipment and combat styles~~ ✅
2. ~~Smithing and cooking range~~ ✅
3. ~~Banks, shops, coins economy~~ ✅
4. ~~Town + dungeon with stronger monsters~~ ✅
5. ~~More quests with a quest journal tab~~ ✅
6. ~~Prayer points, Magic, Ranged~~ ✅
7. ~~Sound effects~~ ✅ (music still todo)
8. ~~Content depth: metal tiers, more resources, deeper dungeon, more quests, music~~ ✅ (v0.3)
9. ~~Multiplayer: authoritative server, client renders snapshots~~ ✅ (v0.4 beta)
10. ~~Fletching skill + a boss (Green Dragon) with a unique reward~~ ✅ (v0.5)
11. ~~Quality of life: world map, skill guides, run, HUD, floating xp, tooltips~~ ✅ (v0.6)
12. ~~Town rebuild: castle, fountain, roads, indoor smithy/kitchen~~ ✅ (v0.7)
13. ~~Second town (Aldervale) with an armoury + living, chattering NPCs~~ ✅ (v0.8)
14. **In progress — RSC→RS2 engine upgrade (raw WebGL):**
    - ✅ Stage 1 (v0.9): WebGL renderer beside the canvas one — lit 3D terrain,
      low-poly animated characters, 3D scenery, picking & HUD parity, toggle
    - ✅ Stage 2 (v0.10): sculpted low-poly models for monsters (rat/bear/dragon),
      set-pieces (fountain/statue/well/stall) & trees, via a baked-mesh system
    - ✅ Stage 3 (v0.11): procedural material textures (grass/stone/wood/…) on an
      atlas + a scrolling animated water pass; brighter zoom-scaled daylight fog
    - ✅ Stage 4 (v0.12): blob shadows, equipped weapons/armour/shields drawn on
      the character, and **WebGL promoted to the default** (canvas kept as fallback)
15. ~~Cape & legs slots, a third city (Southmarch) and the Animal Magnetism questline~~ ✅ (v0.31)
16. ~~A 192×192 world, a ~100-tile southern highway with landmarks, Willowmere, and per-town materials~~ ✅ (v0.32)
17. **Later:** more bosses & a boss-gear tier, rest of the systems online server-side, player accounts, auto-retaliate & WASD, network other players' equipment, cross-town quests
