# Update Ideas — mined from RuneScape's update history

A working backlog for Rune Classic, built by reading the OSRS Wiki's year-by-year
update index for two eras — **2001–2007** (the classic/RS2 build-out) and
**2013–2015** (Old School's first three years) — and sorting every update into
*already have*, *worth adding*, or *skip*.

## How this was made, and what it is not

- Source: the OSRS Wiki year pages `2001`–`2007` and `2013`–`2015`, pulled through
  the `osrs` MCP server. Bold entries mark game updates.
  - **2001–2007: 350 titles**, of which 45 are opaque ("Latest RuneScape News
    (12 April 2002)", newsletters, server-status posts) → **~305 substantive**.
  - **2013–2015: 145 titles**, of which 11 are system/bugfix noise → **134 substantive**.
  - **~439 usable updates in total.**
- **Two passes were done.** First a title pass over all 494 unique titles. Then a
  **deep pass**: the `Update:` namespace holds the full text of every update, so
  the **69 vaguely-titled** ones ("Various tweaks to the game", "Lots more
  improvements", "…& More") were opened and read. **64 of those 69 contained
  something the title concealed** — see §6. The other 362 substantive titles are
  self-describing ("Rooftop Agility Courses", "Zulrah - The Solo Snake Boss") and
  were judged from the title alone.
- ⚠️ One trap worth naming: *"The new Sailing skill is out today"* is dated
  **1 April 2014** and is an April Fools joke. (Real Sailing shipped in
  **November 2025**.) Don't mine the 1 April entries.
- **We take mechanics and design patterns, never content.** This project uses no
  Jagex assets, names, or data. "Add Treasure Trails" means *add a clue-scroll
  loop*, not their clues; "Slayer" means *a task-assignment system*, not their
  monster list. Named quests and bosses are cited only as examples of a **pattern**.
- Effort is rated against our architecture: vanilla JS, no build step,
  `file://`-friendly, script-tag globals, `combat.js` shared with the server.

### The single biggest lesson from comparing the two eras

**2001–2007 grew the world outward. 2013–2015 barely added surface land at all** —
it added *depth*: the God Wars Dungeon, the Slayer Cave, the Motherlode Mine,
Nightmare Zone, and a run of solo boss lairs (Kraken, Zulrah, Cerberus, Abyssal
Sire). Everything else in those three years was **quality of life** and **game
modes**. Two eras, two completely different strategies for "more game".

That matters for us because depth is *cheaper* than breadth in this codebase — see
§5.

---

## 1. Already have

| RuneScape update | Our equivalent |
|---|---|
| New magic system online! (2001) | `SPELLS` + Magic tab + **auto-cast** (v0.25) |
| Improved prayer system; prayers last 50% longer (2001) | `PRAYERS`, drain rates, altar recharge |
| New fishing skill and more cooking (2001) | Fishing (net/lure spots) + Cooking with burn chance |
| New tailoring ability (2001) | Crafting: needle + leather → coif/body/chaps (v0.21) |
| Stats menu now shows XP (2001) | Skills grid with xp, xp-to-next, per-skill guides |
| Completed quests list (2001) | Quests tab, colour-coded |
| Updated world map (2001); **World Map** (2014) | World-map overlay (**M**), click-to-travel, 36 landmarks |
| Tutorial island (2002) | *The Artisan's Apprentice* + *Trial by Fire* |
| Multi-part quest (2002) | *The Lost Tribe → The Rising Deep* chain |
| Bank space updates (2003, 2004, 2013, 2015) | Bank with 4 tabs |
| Easier to rearrange bank (2004) | Drag-to-file bank tabs; drag-to-reorder inventory |
| **Bank Notes!** (2004) | Bank notes (v0.28) |
| **Your banks, it has tabs!** (2014) | Bank tabs (v0.27) |
| Quest Journals (2004) | Quest tab with full descriptions |
| RuneScape chat improved (2004); Chat update (2014) | Chat scrollback (200 lines), smart-scroll, MP chat bar |
| Weapons Update (2005) | Per-weapon attack speeds in ticks (v0.29) |
| Player interfaces (2006) | RS-style icon tabs, Alt+drag HUD, fixed-size scrolling panels |
| Area sounds / Skill sounds (2006–07) | `sound.js` WebAudio sfx + generative music |
| **Game engine upgraded!** (2006); New Engine Feature (2015) | Our RSC→RS2 upgrade: WebGL, baked models, textures |
| Varrock's New Look (2007) | Town visual passes + per-settlement materials (v0.32) |
| **Animal Magnetism** (2006) | Our own version, v0.31 |
| **XP Drops** (2015) | Floating xp numbers (v0.6) |
| **Monster Examine** (2015) | Examine shows combat level **and triangle weakness** (v0.25) |
| **Zoom** (2015) | Mouse-wheel zoom, middle-drag camera |
| Achievement Diaries (2015) | ✗ — see §2 |

---

## 2. Worth adding

Ordered by *value per unit of work*, not by date.

### Tier A — high value, fits what we already have

**1. Agility + shortcuts** *(2002; Rooftop Agility Courses, 2013)*
The best fit right now. We just built a ~100-tile southern highway, so **traversal
is finally a real cost** — which is what makes shortcuts valuable. Stiles over town
walls, a rope swing across the river, stepping stones at the mere, a crumbling wall
into the ruin. Each is a scenery object with a level gate, an xp drip and a fail
state. The 2013 *rooftop course* variant is a nice second act: a fixed circuit you
run for xp rather than to get somewhere.
*Effort: medium. Same shape as `tryMoveBoulder` / `tryGuildDoor`.*

**2. Treasure Trails / clue scrolls** *(2004; expanded 2014–15)*
The biggest replay-per-effort win on the list, because it reuses content that
**already exists** — the world map, our 36 landmarks, drop tables, item icons — and
gives players a reason to walk the roads we just built. OSRS's own 2015 additions
tell you what to build in from day one: a **step counter** and **multiple
concurrent clues**.
*Effort: medium. A spade, a clue item carrying its step, a dig action, a reward
table. No new geometry.*

**3. Capes of Achievement + skill cape perks** *(2006; Skill Cape Perks & Max Cape, 2015)*
We added the **cape slot in v0.31**, and the slot, icon generator and 3D cape mesh
are already built. Skill capes are a near-free long-term goal, and the 2015 lesson
is to give each one a small **perk** so it's worn, not banked.
*Effort: small. A data table of 16 capes + a level check at a cape-seller.*

**4. Quick-prayers** *(2014)*
Tiny, and disproportionately good. Pre-select a prayer set, toggle it with one
click. Our prayer tab already tracks per-prayer state; this is a button and a saved set.
*Effort: small.*

**5. Random events — designed optional from the start** *(2004; **Optional Randoms**, 2014)*
Worth adding for life and tension while skilling, but note that OSRS shipped these
in 2004 and had to make them **opt-out in 2014** after a decade of complaints.
Build them skippable on day one and skip the decade.
*Effort: small–medium.*

**6. Runecraft** *(2005)*
We sell and consume runes but players can never **make** them, so magic has no
production loop. Essence from a mine, altars out in the world, essence → runes.
*Effort: medium.*

### Tier B — strong, more work

**7. Slayer + task rework** *(2005; Slayer batches 2013–14, Assignment Rework 2015)*
The cheapest way to give an open world **direction**: a master assigns *N* of
something, gated by level. It would push players down the long roads to specific
landmarks. Steal the 2015 rework's lesson — let players **block/skip** a task they
hate.
*Effort: medium.*

**8. Solo boss lairs** *(Kraken, Zulrah, Cerberus, Abyssal Sire — 2014–15)*
This is what OSRS did *instead of* expanding the map, and it suits us: a boss lair
is one small hand-built room on the dungeon layer with one strong monster and a
distinctive drop. We already have `boss: true`, our dragon, and Grukk. Each new one
is a few hundred lines of level data, not a system.
*Effort: small–medium **each** — the best content-per-line ratio available to us.*

**9. Special attacks** *(2004; Salamanders and Special Attack, 2014)*
Depth on weapons we already have: a special-energy bar plus a per-weapon special.
Slots into `combat.js` cleanly since damage maths is already shared with the server.
*Effort: medium.*

**10. Thieving** *(pattern: Rogue Trader 2005, Pyramid Plunder 2006)*
Our four settlements are full of **market stalls that are pure scenery**. Making
them stealable, with a guard-catch fail state, is a lot of gameplay from props that
already exist — and finally gives Willowmere's open-air market a point.
*Effort: small–medium.*

**11. Herblore / potions** *(2004–05; Super Combat 2014, Stamina 2014)*
We already have Farming as the natural herb source. Potions give the combat
triangle another lever and make the wilder areas survivable.
*Effort: medium.*

**12. Achievement Diary** *(2007; **Achievement Diaries**, 2015)*
Per-region task lists — Lumbridge / Aldervale / Willowmere / Southmarch — with a
reward per tier. Excellent structure for a world that now has four distinct
settlements, and it doubles as a soft tutorial for content players miss.
*Effort: medium, mostly data + UI.*

**13. A solo wave-survival arena** *(Nightmare Zone 2013; Fight Caves 2005)*
The one "minigame" that works without a population: escalating waves in a single
room, with a reward shop. Reuses every monster we have.
*Effort: medium.*

### Tier C — nice, low priority

- **Storage bags** *(Coal & gem bags, 2014)* — an ore/gem bag is a clean sink for
  inventory pressure, and we already have the noted-item concept to build on.
- **Crossbows** *(2006)* — ranged variety; slots into existing bow/ammo code.
- **Teleport network** *(Fairy rings 2013, Spirit trees 2014, Teletabs 2014)* — see
  §5; fast travel that *respects* long roads instead of erasing them.
- **Pets** *(Boss/Skilling pets, 2014–15)* — pure delight, no balance risk. A rare
  drop that follows you. Our renderer already draws small creatures.
- **Skill tutors** *(2006)* — extend Thessaly's pattern to newer skills.
- **Emotes** *(2005)* — cheap, adds life, best in multiplayer.
- **Music player** *(2004)* — per-area tracks; we already generate music.
- **Ironman mode** *(2014)* — a self-sufficiency toggle. Trivial for us (we have no
  trading), so it's mostly a flag + a badge, but it's real replay value.
- **Bulk actions / Cook-X** *(2005)* — we have quantity selectors in the bank; the
  same treatment for cooking/smithing/fletching would be consistent.
- **Wilderness / high-risk zone** *(2001; Rejuvenating the Wilderness, 2014)* —
  interesting, but only meaningful with a population. Park behind multiplayer.

---

## 3. Quality of life — the 2013–15 speciality

OSRS's first three years were *dominated* by QoL, and it is the cheapest category
here: almost all of it is UI and state, no new world content. Ranked by value to us:

| Idea | Source | Notes |
|---|---|---|
| **Quick-prayers** | 2014 | One-click prayer set. Small, high value. See §2.4. |
| **Custom keybinds / F-keys** | 2015 | We hardcode M / R / arrows / Esc. A rebind map in Opts + localStorage. |
| **Clue step counter, multiple clues** | 2015 | Build into Treasure Trails from the start, not bolted on later. |
| **Game filter (chat channels)** | 2014 | Our chat mixes game / quest / MP / combat. Filter toggles would help a lot. |
| **"Operate" / item options** | 2014 | A generic verb on the right-click menu for item-specific actions. |
| **Attack options** | 2014 | Control whether left-click attacks or walks — prevents misclick deaths. |
| **Time played** | 2014 | Trivial; nice in a stats panel. |
| **Resizable mode** | 2015 | We're already fullscreen-fluid with a draggable HUD — largely done, but panel scaling could improve. |
| **Boss room / kill counters** | 2015 | Per-monster kill tallies. Cheap, and feeds Achievement Diary and Slayer. |
| **Loot broadcast / rare-drop notice** | 2014 | A highlighted message on a rare drop. We have message colours already. |
| **Bank micro-UX** (scroll position, drag-to-tab pause, show empty slots) | 2014 | Found in the deep pass (§6F). All three apply to our bank today. |
| **Generic "Operate" verb** | 2004, 2014 | One extensible right-click verb instead of special-casing items (§6G). |
| **Quest points** | 2001 | We have 11 quests and no quest-point currency (§6B). Cheap progression gate. |
| **HP insurance / death mechanics rework** | 2014–15 | OSRS changed death rules **five times** in two years. Our death rule (keep 3 by value) is simple and works — treat their churn as a warning, not a spec. |

---

## 4. Skip

| Update / family | Why |
|---|---|
| **Fatigue & sleeping bags** (2002–03) | The most disliked mechanic of the era; Jagex removed it. Anti-fun by design. |
| **Grand Exchange / Trading Post** (2014–15) | A player-driven market needs a player economy. Our shops are static-stock; a GE with no population is a vending machine. Revisit only with real multiplayer. |
| **Bounty Hunter, PvP worlds, Deadman, Duel Arena, high-risk worlds** (2013–15) | All PvP. Needs population *and* accounts. |
| **Bank PIN, password security, report abuse, mass bans, player moderators** | Account infrastructure. We have no accounts — MP logs in by name. |
| **Clan chat, clan cup, friends/ignore lists, world switcher, player gallery** | Need real accounts and multiple worlds. |
| **Castle Wars, Pest Control, Barbarian Assault, Fight Pits, Clan Wars, Trouble Brewing, Trawler, Gnomeball, minigame grouping** | Team minigames — dozens of concurrent players. The *solo* wave-survival pattern (§2.13) is the exception worth taking. |
| **Player-Owned Houses + Construction** (2006, 2013–14) | Enormous scope: build mode, instanced interiors, its own economy. |
| **Hunter** (2006) | Large skill needing new creature AI and trap objects. Only for a big skill push. |
| **In-game polls** (2014) | A community-governance tool. We are one developer. |
| **Membership bonds, F2P trials, permanent F2P, DarkScape** (2014–15) | Monetisation and business decisions, not features. |
| **Named quests & bosses** — Monkey Madness, Desert Treasure, Recipe for Disaster, God Wars, Zulrah, Cerberus… | Don't reproduce their stories or creatures. Take the *patterns*: multi-part chains, puzzle quests, skill-gated finales, solo boss lairs with signature drops. |
| **Seasonal events** (Christmas/Easter/Hallowe'en, every single year) | One-off, zero replay, and they date the game. |
| **April Fools** ("Sailing", 1 April 2014) | Jokes. Not specs. |
| **System/server/maintenance/bugfix posts, language betas** | Not game content. |

---

## 5. A bigger world to explore

The comparison in the header is the useful finding here: **2013–2015 added almost no
new surface land**, and OSRS did not feel smaller for it. It added *depth*. For us
that's doubly attractive, because of how our world is actually built.

### What our world is now

- **192×192 tiles per layer, 2 layers** (surface + dungeon) = ~74k tiles.
- Surface is roughly **half-used**: four settlements, the farm, the mine, the
  training yard, Rookmoor, and the ~100-tile southern highway.
- **Tile variety is thin** — `grass, sand, rock, path, floor, road, water` and the
  dungeon's `dfloor/dwall`. Everything above ground is green.

### Cheapest → dearest ways to make it bigger

**1. More dungeon layers — the best value on this list.**
`World.L` is a 2-element array and `heightAt()` hardcodes `if (l === 1) return 0`.
Generalising to N flat layers is a handful of lines. Then every ladder in the world
can lead somewhere new, and each new layer is pure hand-placed level design — our
cheapest content type, with no terrain generation, no pathing changes and no
renderer work. This is precisely the God Wars / Slayer Cave / Motherlode strategy.
*One caveat: `World.LADDER` is a single fixed coordinate pair; multiple ladders need
a small link table (`from layer/x/z → to layer/x/z`).*

**2. Biome variety — high impact per line.**
The whole overworld is green. Adding two or three tile types with their own palette
and props would make travel *feel* varied without adding a single tile of map:
- a **desert / badlands** south-east beyond Southmarch (sand, dry scrub, heat haze),
- a **marsh** around the mere west of Willowmere (dark water, reeds, mist),
- **highlands / snow** north beyond Aldervale (pale rock, pine, bare stone).
We already have the machinery: `tileColor`, the texture atlas, per-settlement
materials, and fog colour is already set per-layer.

**3. East of the river — the land we already own but haven't used.**
The v0.32 expansion to 192 opened everything east of x≈105, and it is **empty**.
A bridge east out of Lumbridge is the natural next region, and it comes with a
built-in gate: the river. Good candidate for a distinct biome (marsh or moor) plus
one new settlement and a boss lair.

**4. The northern road needs the v0.32 treatment.**
Lumbridge→Aldervale is still ~10 tiles — the one corridor that didn't get the long-road
pass. It needs either relocation of Aldervale (churn: it's older content with many
coordinate references) or a **winding** route with landmarks, which is cheaper and
achieves most of the same feeling.

**5. Fast travel — only after there is more world.**
Fairy rings (2013), spirit trees (2014) and teletabs (2014) all arrived *after* the
map was large. Adding them now would erase the travel we just built. The right
moment is when a round trip becomes tedious rather than characterful — and the
right design is a **sparse network between fixed nodes**, not teleport-anywhere.

---

## 6. What opening the vague pages actually turned up

Titles genuinely hide things. **64 of the 69 vague-titled pages** contained
something the title gave no hint of. The haul, minus the IP-specific noise:

### Real gaps in our game, found this way

**A. Loot goes to the last hit, not the most damage — *our multiplayer has this bug*.**
*(Fixed in v0.42 — see the note at the end of §8 for what the fix taught us.)*
Buried in *"Lots of small improvements (18 August 2001)"*:
> "the treasure now goes to whoever damaged the monster most overall rather than
> the person who got the last hit. XP is split proportionally between all people
> who helped kill the monster."

In `server/sim.js`, `killNpc(n, p, now)` is called from `doAttack` by whoever lands
the killing blow, and loot is pushed to the ground unclaimed — so in multiplayer
another player can simply take a kill you did all the work for. *Fix sketch:
accumulate `n.damageBy[playerId]` in `doAttack`, award the drop to the max, and
clear it on respawn. Singleplayer is unaffected.*

**B. Quest points.** *"Lots of small improvements (10 May 2001)"* introduced the
quest-point system, and *"More RuneScape updates"* used it to gate the Champions'
Guild. We have **11 quests and no quest-point currency** — a cheap, classic
progression gate for a future guild or region.

**C. NPCs that retreat when attacked from outside their wander zone.**
From *"Lots more improvements"* (2004):
> "if they are being attacked from beyond the edge of their wander zone, they will
> run away rather than just standing there stupidly."

This is the same family as the leash we added in v0.32.1, but it's the *opposite*
design decision on safe-spotting — and ours is deliberate, since *Trial by Fire*
explicitly **teaches** safe-spotting as a skill. Worth knowing we've diverged on
purpose; don't adopt this one without also rewriting that quest.

**D. Town guards break up fights.** Also 2001: guards near the Varrock bank try to
stop players fighting, so you can bank safely. A nice complement to leashing —
towns feel lawful because something *enforces* it, not just because monsters stay away.

**E. Design rules to bake in before building the feature:**
- *"Random events will no longer interrupt make-X"* (2014) — build this into random
  events on day one rather than after a decade of complaints.
- *"Teleport spells no longer work at level-20 wilderness or beyond"* (2001) — if we
  ever build a high-risk zone, denying escape is what makes it risky.

**F. Bank micro-UX** (2014, hidden inside *"Coal & gem bags and Attack options"*):
keep the scrollbar position when reopening; pause briefly before auto-scrolling
while dragging an item so it can be dropped on a tab; show empty slots when not
using tabs. All three apply to our bank as-is.

**G. Generic right-click verbs.** *"Treasure Trails and Changes"* (2004) added an
"empty" option on potions; 2014 added a general *"Operate"*. A single extensible
verb slot on the right-click menu is tidier than special-casing each item, which is
the direction our `invOptions` is drifting.

### Confirmed we already have (checked, not assumed)

Combat level on the stats panel (2001) — we show it at `ui.js:486`. Drag-to-rearrange
inventory and bank (2003). White outline on the selected item (2004). Hover-to-see-name
without right-clicking (2003). XP per successful ranged hit (2001). And *"you can
still stack extra runes/arrows when your inventory is full"* (2001) — our `addItem`
merges into an existing stack **before** checking for a free slot, so it's correct.

### It also confirmed a *skip* call

The 2003 pages show Jagex actively tuning fatigue — *"Sleeping bags now restore
fatigue slightly faster"*, *"bread, pies and pizza restore TWICE as much fatigue"* —
which is what a mechanic looks like when it needs constant propping up. Good
evidence for leaving it out.

### Was it worth it?

Yes — and see §8, which went back and read the other 426. **The conclusion drawn
here was wrong.** I wrote that reading every page "would have been mostly wasted"
because precise titles say what they are. They do say what they are; what they do
*not* say is what else shipped alongside. §8 is the correction.

---

## 7. Suggested order

Front-loading the things that make the **world we already built** pay off:

0. ~~**Fix multiplayer loot assignment** (§6A)~~ — done in v0.42.
1. **Agility + shortcuts** — makes the long roads a system rather than a walk.
2. **Capes of Achievement** — near-free given the v0.31 cape slot.
3. **Quick-prayers + kill counters + chat filter** — a cheap QoL batch (§3).
4. **Thieving from market stalls** — turns existing scenery into gameplay.
5. **Treasure Trails** *(with step counter and multiple clues built in)*.
6. **N dungeon layers** + the first **solo boss lair** — the depth strategy (§5.1).
7. **Biome variety** — the cheapest way to make the surface feel bigger (§5.2).
8. **Slayer** or **Achievement Diary** — moment-to-moment tasks, or regional checklists.
9. **Runecraft + Herblore** — close the two missing production loops.

### Also worth noting

Two gaps in our own game that no single RuneScape update maps onto:

- **Only 3 metal tiers** (bronze/iron/steel). The 2001–07 era ran to mithril,
  adamant and rune. A fourth and fifth tier would extend progression a long way for
  very little code — `METALS` is already fully data-driven.
- **Only 4 attack spells and 3 prayers.** Both tables are trivially extensible and
  are the thinnest part of the combat triangle we built in v0.25.

---

## 8. The full pass — reading all 495 update pages

§6 read the 69 vague titles and concluded the other 426 could be judged from their
names. That was half right. A precise title does describe its headline feature
accurately — but almost every update post also carries a tail of unrelated tweaks,
and **those tails are where the mechanics hide**.

### Method

- Parsed the ten year-index pages **out of raw HTML** rather than stripped text. That
  gives the exact `Update:` page name from each href, and preserves the wiki's own
  `<b>` marker for "this is a game update".
- **1,149 dated entries** in total, of which **495 are bold game updates** — which
  matches §6's count of 494 almost exactly, confirming both passes are looking at the
  same population. The other 654 are news posts, world-list changes, wallpapers and
  newsletters, correctly excluded.
- All 495 fetched and cached, then scanned for lines that (a) describe a rule
  changing, (b) name a game system, and (c) **do not overlap the page's own title** —
  that last filter is what isolates the tail from the headline. 294 pages had at
  least one such line; 855 lines survived, and all of them were read.
- ⚠️ One practical trap: the MCP server **silently drops pipelined requests**. A
  concurrency of 6 returned 251 empty bodies for pages that serve fine one at a time.
  Fetch serially.

### The most valuable find is a flaw in our own dynamic events

**Pest Control, 24 April and 6 June 2006.** Buried in a graphical-update post:

> "we've put in a level 40 combat requirement to board the lander … Each player in a
> game of Pest Control increases the number of monsters in the game. As a lot of the
> monsters are pretty tough, this meant that it was extremely hard for lower level
> players to contribute enough to the team effort to make up for the added difficulty
> their presence had created."

**v0.41's tide event has exactly this shape and no such guard.** `Events.tickOne`
scales wave size and Font integrity off a raw head-count, so a level-3 character
standing at the Font makes the event materially harder for everyone else while being
unable to contribute. They shipped this, hit it, and documented the fix.

Two ways out, both cheap:

- scale off **summed combat level** rather than head-count, or
- only count someone as a participant above a minimum combat level.

The second is closer to what they did; the first degrades more gracefully. Either
belongs in the event def as data.

### Verified gaps — checked against our code, not assumed

| Find | Source | Our state |
|---|---|---|
| **Health bars read as empty at low HP.** "should now always show at least one pixel of green … you should no longer see a completely red health-bar until their health reaches zero" | 17 Dec 2013 | **Done in v0.42.** Both renderers floor the green at 2px above zero, and draw nothing at exactly zero. Verified by pixel-counting `drawBar` at 1/110. |
| **Monsters far below you shouldn't aggro.** "Monsters who are far weaker than you no longer auto attack" — with the wilderness made an explicit exception | 23 Oct 2002, 13 Nov 2002 | **Done in v0.42.** `Combat.stillAggressive(type, playerLevel)` — shared, so singleplayer and the server agree. Cuts out at 2× the monster's level. Their wilderness exception became a per-NPC `relentless` flag on bosses and event enemies. |
| **Batch production.** make-5/10/X on smithing and crafting; Cook-X; make-x on cannonballs; "pestle and mortar now automatically begins to grind all of that item" | 27 Sep 2004, 12 Sep 2005, 22 Jun 2005, 7 Aug 2014 | **Mostly done in v0.42.** `Game.batch` + `Game.canMake` drive gem cutting, leather stitching, jewellery casting, bone grinding, slime filling and Font worship, each reporting one summary line. **Still open: `smithMenu` and cooking**, which remain one-at-a-time. |
| **Fill-all / grind-all.** "Players can now fill all available buckets in their inventory with slime from the ectofuntus temple … removes the need for multiple clicking" | 18 Jun 2007 | **Done in v0.42.** "Fill all N buckets", "Grind all N bones" and "Worship with all N offerings" on the right-click menu at Mourncross. |
| **Confirmation before destroying something valuable.** Warnings added for alching and for dropping anything worth 30k+ | 3 Jul & 31 Jul 2014 | **Done in v0.42.** `Game.confirmDestroy` guards both alchemy and Drop at `VALUABLE` = 1,000gp, quoting the item's worth. Cheap items are untouched, so there is no confirmation treadmill on bones. |
| **Attack shouldn't be left-click on something that will kill you.** It used to be right-click when the target was stronger; they later added a toggle to force left-click | 15 May 2014 | **Missing.** Our v0.35.1 pick priority puts Attack on left-click for anything attackable, dragon included. |
| **Multiple hit-splats at once** | 28 Jun 2004 | **Done in v0.42.** A live splat is pushed to `n.splat2` and drawn offset instead of being overwritten. Both renderers. |
| **Monsters flinch when hit.** "it should now flinch in pain instead of just standing impassively and glaring at you" | 20 Sep 2006 | **Done in v0.42.** `n.flinch` set in `splatNpc`; humanoids rock back at the waist, baked meshes tip away bodily. Both renderers. |
| **Maces carry a small prayer bonus** "making them more useful for people who want to specialize as a cleric" | 17 Feb 2004 | **Done in v0.42.** `SHAPES.mace` carries `pray: 1` and the smithable generator now copies it to every metal tier. Chasing this also turned up that `itemTip` never displayed prayer bonuses **at all** — seven existing items had the stat invisibly. |
| **Chat filter** for repetitive messages | 10 Jul 2014 | **Missing.** Gathering prints a line per success. |
| **Death pile is private for a minute, then public** | 16 Oct 2014 | **Done in v0.42**, together with §6A. Drops carry `owner`/`ownerUntil`; `doTake` refuses anyone else for 60s. |
| **Same-type stackables should merge on the ground** | 23 Jun 2001, 18 Dec 2003 | **Done in v0.42.** `Game.dropToGround` merges a stackable into an existing pile on the same tile and layer. Non-stackables still pile separately, as they should. |

### Confirmed already-have — checked, not assumed

Weapon/armour level requirements; combat level on the stats panel; **shop restocking**
(`st.qty += Math.sign(initial - qty)` every 40 ticks — we already do what the
13 Jun 2005 rune-shop post is about); stackables merging into an existing stack even
with a full pack (23 Jun 2001); bank notes for all non-stackables, bank search,
deposit-all, and withdraw-X memory; auto-retaliate toggle; combat style persisting
across a save; skill guides opened from the stats panel; tool tier changing swing rate
rather than luck (v0.37 — the 27 May 2003 pickaxe post); one prayer per group with
protection prayers stacking on defensive ones (v0.36 — the 22 Aug 2006 post describes
our exact grouping); tinderbox-on-logs auto-dropping and lighting; and **Superheat only
consuming runes on a valid target**, which is a bug they had on 9 Dec 2003 and we don't.

### Reconfirmed as still open

Trimmed after v0.42 shipped ten of the rows above. What is genuinely left:

- **Run energy.** We have a run toggle with no cost at all; theirs is limited by
  carried weight and restored by Agility (7 Jan 2004).
- **Random events while skilling** (11 Sep 2014 placed the aggressive ones in the world).
- **Chat filter for repetitive messages** (10 Jul 2014). Gathering still prints a line
  per success. v0.42's batch actions reduced the worst of it — a batch reports once —
  but ordinary chopping and mining still spam.
- **Attack on left-click for something far stronger than you** (15 May 2014). Deliberately
  deferred: v0.42 made monsters *stop* attacking you when you outlevel them, which is the
  same 2002 rule seen from the other side, but the menu-priority half is untouched and
  wants the toggle they eventually added rather than a bare rule change.
- **Batch smithing and cooking.** `Game.batch` exists and six recipes use it; `smithMenu`
  and cooking were left one-at-a-time and should adopt it next.

### What v0.42 took from this section

Ten rows of the table above, plus §6A. Worth noting what the work actually cost versus
what this document predicted:

- The **mace prayer bonus** was billed as "one line". It was two — the smithable
  generator loops `SHAPES` and copies `aim`/`power`/`speed`/`armour` by name, so a new
  stat is invisible until it is added to that list. Chasing the silent failure found a
  second one: `UI.itemTip` never rendered prayer bonuses at all, so seven items already
  in the game had a stat no player could see.
- The **event scaling flaw** was the most valuable find and the least visible: it was a
  design fault in code shipped two versions earlier, not a crash, and nothing would ever
  have failed a test.
- **§6A** was implemented and then partly reverted during testing. The first cut paid a
  Hits-xp kill bonus split by damage, which singleplayer does not award — a fifth
  instance of the `game.js`/`sim.js` drift that has already produced four shipped bugs.
  Per-hit xp already pays every contributor in proportion, so only the *loot* half needed
  changing. **Whenever a change touches `sim.js`, diff the behaviour against `game.js`
  before believing it.**

### Was the full pass worth it?

Yes, and more than §6's targeted one. §6 found one live bug in our code. This pass
found **a design flaw in a feature shipped two updates ago**, one confirmed rendering
bug present in both renderers, and a QoL theme (batch production) that recurs four
times across ten years and touches five of our functions. The reason is simple and
worth remembering: **an update post's title describes its headline, never its tail** —
and the tail is where the mechanics live.
