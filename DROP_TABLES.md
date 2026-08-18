# Drop Tables

Every attackable monster in Rune Classic, what it drops, and how likely each drop is.

The mechanical sections below are **generated from `js/data.js`** — the rates are
measured by simulating 300,000 kills per monster, so they describe what the game
actually rolls rather than what the table looks like it should do. Regenerate them
after changing `NPC_DEFS` or `DROP_TABLES`.

> This project takes mechanics and design patterns from RuneScape, never content.
> No Jagex assets, names, or data are used. Where this document says "the source",
> it means the publicly documented *shape* of a mechanic, reimplemented from scratch.

---

## How a kill rolls loot

`Combat.rollDrops(type)` produces every kill's loot from two different kinds of table:

**`drops` — independent rolls.** Each row happens or doesn't, on its own. This is
right for the things a monster reliably has: bones always, coins usually, a bit of
ore sometimes. Several can land at once.

**`pick` — one-of rolls.** The `chance` decides whether the table is reached at all;
if it is, **exactly one** row comes out, chosen by weight. This mirrors how the
source structures loot (an `n/128` chance to reach a table, then weights inside it)
and it is written as `n/128` in the data to keep that shape visible.

Both are in the shared `Combat` module, so singleplayer and the multiplayer server
roll identical loot.

---

## What changed in this pass, and why

The tables were written piecemeal as content landed, and three of the last four
updates added items nothing dropped. Auditing them turned up four real problems.

### 1. A highwayman could hand you three capes at once

Every cape was an independent roll at 16%, so `red`, `blue` and `green` could all
land on the same corpse. That is not how loot is supposed to read, and it also made
capes near-worthless: **51% of kills produced at least one**, on a level-13 monster,
for an item the outfitter sells for 12gp.

The four cape rolls collapsed into one `cape` table at 42%. You now get **one cape
per kill or none**, at roughly the same overall rate, and the rare cloak sits in the
tail of that table rather than being its own roll.

The same fix applies to the dark wizard's hat/robe/staff.

### 2. Farming seeds were shop-only

v0.37 rebuilt Farming around allotments, but seeds could only be bought — so the
skill had no connection to the rest of the game. In the source, seeds come off
monsters via a shared seed table (hill giants roll it at 18/128).

There is now a `seed` sub-table, rolled by **seven** monsters at 10–18/128 — goblins
and bears because they raid crops, guards and highwaymen because they carry
provisions, hobgoblins and hill giants as the classic mid-level source. Farming is
now something combat feeds.

### 3. Grukk paid a quarter of what the dragon did

Grukk is level 46 with 95 hp and a quest boss. The Green Dragon is level 42 with 80
hp. Grukk paid **309 gp** a kill against the dragon's **1,248**.

Grukk's coins went up, and he gained coal, steel bars and a 60% roll on the rare
table. He now pays **1,132 gp** — comparable to the dragon, slightly behind on
gp-per-hitpoint, which is right for a monster you can only meaningfully fight once.

### 4. Twelve craftable items existed that nothing dropped

`coal`, `steel_bar`, `iron_bar` and the whole steel armour set were smithable but
never appeared as loot, so Smithing had no input beyond mining it yourself. The new
`rare` sub-table is deliberately weighted toward **materials** rather than finished
gear (66% coins/coal/bars, 11% steel armour, 1% dragon bones), so it feeds the
production skills instead of short-circuiting them.

### Smaller corrections

- **Marsh wraiths dropped bones.** They are spirits; they have no bones to leave.
  Removed, and their ecto-token rate went up to compensate.
- **Ghosts correctly drop no bones** — that was already right, and stays.
- **Bears** were a level-14 kill worth 11 gp. Now 27 gp with 1–2 furs and a seed
  roll. Still a Crafting kill rather than a money kill, which is intended.
- **Skeletons, zombies and ghosts** gained thin (1–3/128) rare rolls, so the dungeon
  is not exclusively coins and runes.

### Deliberately left alone

- **Rats and penned goblins** drop nothing but bones, every time. They are the
  tutorial monster and the safe-spot practice dummy; a flat, predictable table is
  the point, and the penned goblin's 8-second respawn makes it a fine early Prayer
  loop.
- **Chickens** drop bones and feathers, always. Since v0.37 made fly fishing consume
  a feather per cast, this went from a throwaway kill to a genuine supply run.
- **Cows** are worth 8 gp and that is fine — they are the leather source for
  Crafting, not an income.
- **Ecto-tokens are valued at 0** in the tables below, because they cannot be sold.
  This understates the Tallyman badly: its 60–90 tokens are a sixth of the 450
  needed for the full prayer set, and tokens are otherwise earned five at a time.

### Where the value curve sits now

| Level | Monster | gp/kill | gp/hp |
|---|---|---|---|
| 2 | Giant rat | 1 | 0.2 |
| 5 | Goblin | 7 | 0.8 |
| 9 | Skeleton | 23 | 1.5 |
| 13 | Highwayman | 72 | 3.3 |
| 16 | Town guard | 44 | 2.0 |
| 21 | Hobgoblin | 68 | 2.3 |
| 26 | Marsh wraith | 87 | 2.2 |
| 27 | Hill giant | 125 | 2.8 |
| 40 | Herald of the Tide | 409 | 5.5 |
| 42 | Green dragon | 1,438 | 18.0 |
| 46 | Grukk | 1,229 | 12.9 |
| 51 | The Tallyman | 1,095 | 10.0 |

The curve rises smoothly to the hill giant and then jumps hard at the dragon. That
gap is intentional — the dragon is the first monster that requires real gear and a
plan — but it does mean there is nothing between level 27 and level 42 worth
farming for money. **That is the clearest remaining gap in the game's loot economy**,
and the natural place for the next monster to go.

---

<!-- BEGIN GENERATED -->

## Shared sub-tables

### `herb`

Rolled by: **Hobgoblin** 9.4% · **Ghost** 7.8% · **Hill Giant** 11% · **Druid** 75% · **Chaos Druid** 100% · **Marsh Wraith** 9.4%

| Item | Qty | Weight | Chance once rolled |
|---|---|---|---|
| Grimy guam leaf | 1 | 32/100 | 32% |
| Grimy marrentill | 1 | 24/100 | 24% |
| Grimy tarromin | 1 | 18/100 | 18% |
| Grimy harralander | 1 | 13/100 | 13% |
| Grimy ranarr weed | 1 | 8/100 | 8.0% |
| Grimy irit leaf | 1 | 5/100 | 5.0% |

### `druidic`

Rolled by: **Druid** 50% · **Chaos Druid** 80%

| Item | Qty | Weight | Chance once rolled |
|---|---|---|---|
| Eye of newt | 3–8 | 30/100 | 30% |
| Limpwurt root | 1–2 | 22/100 | 22% |
| Snape grass | 1–3 | 18/100 | 18% |
| Red spiders eggs | 1–2 | 14/100 | 14% |
| White berries | 1–2 | 10/100 | 10% |
| Unicorn horn | 1 | 6/100 | 6.0% |

### `seed`

Rolled by: **Goblin** 9.4% · **Bear** 11% · **Town Guard** 7.8% · **Hobgoblin** 14% · **Hill Giant** 14% · **Highwayman** 14% · **Grukk, Giant Chieftain** 35%

| Item | Qty | Weight | Chance once rolled |
|---|---|---|---|
| Potato Seed | 1–3 | 40/100 | 40% |
| Onion Seed | 1–3 | 28/100 | 28% |
| Cabbage Seed | 1–2 | 20/100 | 20% |
| Wheat Seed | 1–2 | 12/100 | 12% |

### `rare`

Rolled by: **Town Guard** 1.6% · **Skeleton** 0.78% · **Zombie** 1.6% · **Hobgoblin** 3.1% · **Ghost** 2.3% · **Green Dragon** 25% · **Hill Giant** 4.7% · **Highwayman** 1.6% · **Dark Wizard** 2.3% · **Chaos Druid** 4.7% · **Grukk, Giant Chieftain** 60% · **Marsh Wraith** 3.9% · **The Tallyman** 50%

| Item | Qty | Weight | Chance once rolled |
|---|---|---|---|
| Coins | 250–700 | 40/100 | 40% |
| Coal | 2–6 | 20/100 | 20% |
| Steel Bar | 1–2 | 12/100 | 12% |
| Iron Bar | 2–4 | 7/100 | 7.0% |
| Steel Kite Shield | 1 | 5/100 | 5.0% |
| Steel Chain Mail Body | 1 | 4/100 | 4.0% |
| Steel Plate Legs | 1 | 2/100 | 2.0% |
| Dragon bones | 1 | 1/100 | 1.0% |
| Uncut Sapphire | 1 | 5/100 | 5.0% |
| Uncut Emerald | 1 | 3/100 | 3.0% |
| Uncut Ruby | 1 | 1/100 | 1.0% |

### `cape`

Rolled by: **Highwayman** 42%

| Item | Qty | Weight | Chance once rolled |
|---|---|---|---|
| Red Cape | 1 | 30/100 | 30% |
| Blue Cape | 1 | 30/100 | 30% |
| Green Cape | 1 | 30/100 | 30% |
| Black Cape | 1 | 8/100 | 8.0% |
| Highwayman's Cloak | 1 | 2/100 | 2.0% |

### `wizard`

Rolled by: **Dark Wizard** 16%

| Item | Qty | Weight | Chance once rolled |
|---|---|---|---|
| Wizard Hat | 1 | 40/100 | 40% |
| Wizard Robe | 1 | 34/100 | 34% |
| Wizard Skirt | 1 | 20/100 | 20% |
| Magic Staff | 1 | 6/100 | 6.0% |

### `tide`

No monster rolls this one — it is awarded by a **dynamic event**, once per contribution tier earned (bronze 1 roll, silver 2, gold 3). Nothing in it is buyable, smithable or dropped by a standing monster.

| Item | Qty | Weight | Chance once rolled |
|---|---|---|---|
| Drowned Bones | 1–2 | 30/100 | 30% |
| Ecto-token | 20–40 | 22/100 | 22% |
| Coins | 400–900 | 18/100 | 18% |
| Wraith Essence | 2–4 | 12/100 | 12% |
| Tideglass Amulet | 1 | 7/100 | 7.0% |
| Fontwarden's Cape | 1 | 5/100 | 5.0% |
| Tideforged Kite Shield | 1 | 4/100 | 4.0% |
| Tideforged Blade | 1 | 2/100 | 2.0% |

## Monsters

Sorted by combat level. Rates are measured over 300,000 simulated kills each.

### Chicken — level 1

`chicken` · 3 hp · attacks with **melee** · armour class **none** · respawns in 20s

Expected **11 gp** per kill (3.7 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Bones | 1 | **Always** | independent |
| Feather | 5–15 | **Always** | independent |

### Giant rat — level 2

`rat` · 5 hp · attacks with **melee** · armour class **none** · respawns in 20s

Expected **1 gp** per kill (0.2 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Bones | 1 | **Always** | independent |

### Cow — level 3

`cow` · 8 hp · attacks with **melee** · armour class **none** · respawns in 25s

Expected **8 gp** per kill (1.0 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Bones | 1 | **Always** | independent |
| Leather | 1 | 85% | independent |
| Bear Fur | 1 | 30% | independent |

### Goblin — level 5

`goblin` · 8 hp · attacks with **melee** · armour class **melee** · respawns in 25s

Expected **7 gp** per kill (0.9 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Bones | 1 | **Always** | independent |
| Coins | 2–12 | 60% | independent |
| Water Rune | 1–2 | 15% | independent |
| Potato Seed | 1–3 | 3.8% | one-of `seed`, 9.4% to roll |
| Onion Seed | 1–3 | 2.6% | one-of `seed`, 9.4% to roll |
| Cabbage Seed | 1–2 | 1.9% | one-of `seed`, 9.4% to roll |
| Wheat Seed | 1–2 | 1.1% | one-of `seed`, 9.4% to roll |

### Penned Goblin — level 7

`pen_goblin` · 12 hp · attacks with **melee** · armour class **none** · respawns in 8s · aggressive within 7 tiles

Expected **1 gp** per kill (0.1 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Bones | 1 | **Always** | independent |

### Skeleton — level 9

`skeleton` · 15 hp · attacks with **melee** · armour class **melee** · respawns in 30s · aggressive within 4 tiles

Expected **22 gp** per kill (1.5 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Bones | 1 | **Always** | independent |
| Coins | 5–30 | 70% | independent |
| Mind Rune | 1–3 | 30% | independent |
| Air Rune | 2–6 | 30% | independent |
| Coins | 250–700 | 0.31% | one-of `rare`, 0.78% to roll |
| Coal | 2–6 | 0.16% | one-of `rare`, 0.78% to roll |
| Steel Bar | 1–2 | 0.09% | one-of `rare`, 0.78% to roll |
| Iron Bar | 2–4 | 0.05% | one-of `rare`, 0.78% to roll |
| Steel Kite Shield | 1 | 0.04% | one-of `rare`, 0.78% to roll |
| Steel Chain Mail Body | 1 | 0.03% | one-of `rare`, 0.78% to roll |
| Steel Plate Legs | 1 | 0.02% | one-of `rare`, 0.78% to roll |
| Dragon bones | 1 | 0.01% | one-of `rare`, 0.78% to roll |
| Uncut Sapphire | 1 | 0.04% | one-of `rare`, 0.78% to roll |
| Uncut Emerald | 1 | 0.02% | one-of `rare`, 0.78% to roll |
| Uncut Ruby | 1 | 0.01% | one-of `rare`, 0.78% to roll |

### Zombie — level 12

`zombie` · 20 hp · attacks with **melee** · armour class **melee** · respawns in 35s · aggressive within 4 tiles

Expected **28 gp** per kill (1.4 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Bones | 1 | **Always** | independent |
| Coins | 10–40 | 70% | independent |
| Fire Rune | 1–4 | 25% | independent |
| Earth Rune | 1–4 | 25% | independent |
| Coins | 250–700 | 0.63% | one-of `rare`, 1.6% to roll |
| Coal | 2–6 | 0.31% | one-of `rare`, 1.6% to roll |
| Steel Bar | 1–2 | 0.19% | one-of `rare`, 1.6% to roll |
| Iron Bar | 2–4 | 0.11% | one-of `rare`, 1.6% to roll |
| Steel Kite Shield | 1 | 0.08% | one-of `rare`, 1.6% to roll |
| Steel Chain Mail Body | 1 | 0.06% | one-of `rare`, 1.6% to roll |
| Steel Plate Legs | 1 | 0.03% | one-of `rare`, 1.6% to roll |
| Dragon bones | 1 | 0.02% | one-of `rare`, 1.6% to roll |
| Uncut Sapphire | 1 | 0.08% | one-of `rare`, 1.6% to roll |
| Uncut Emerald | 1 | 0.05% | one-of `rare`, 1.6% to roll |
| Uncut Ruby | 1 | 0.02% | one-of `rare`, 1.6% to roll |

### Highwayman — level 13

`highwayman` · 22 hp · attacks with **melee** · armour class **ranged** · respawns in 35s · aggressive within 3 tiles · leashes at 7

Expected **71 gp** per kill (3.2 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Bones | 1 | **Always** | independent |
| Coins | 20–80 | 90% | independent |
| Leather | 1–2 | 30% | independent |
| Iron Arrows | 4–12 | 25% | independent |
| Red Cape | 1 | 13% | one-of `cape`, 42% to roll |
| Blue Cape | 1 | 13% | one-of `cape`, 42% to roll |
| Green Cape | 1 | 13% | one-of `cape`, 42% to roll |
| Black Cape | 1 | 3.4% | one-of `cape`, 42% to roll |
| Highwayman's Cloak | 1 | 0.84% | one-of `cape`, 42% to roll |
| Potato Seed | 1–3 | 5.6% | one-of `seed`, 14% to roll |
| Onion Seed | 1–3 | 3.9% | one-of `seed`, 14% to roll |
| Cabbage Seed | 1–2 | 2.8% | one-of `seed`, 14% to roll |
| Wheat Seed | 1–2 | 1.7% | one-of `seed`, 14% to roll |
| Coins | 250–700 | 0.63% | one-of `rare`, 1.6% to roll |
| Coal | 2–6 | 0.31% | one-of `rare`, 1.6% to roll |
| Steel Bar | 1–2 | 0.19% | one-of `rare`, 1.6% to roll |
| Iron Bar | 2–4 | 0.11% | one-of `rare`, 1.6% to roll |
| Steel Kite Shield | 1 | 0.08% | one-of `rare`, 1.6% to roll |
| Steel Chain Mail Body | 1 | 0.06% | one-of `rare`, 1.6% to roll |
| Steel Plate Legs | 1 | 0.03% | one-of `rare`, 1.6% to roll |
| Dragon bones | 1 | 0.02% | one-of `rare`, 1.6% to roll |
| Uncut Sapphire | 1 | 0.08% | one-of `rare`, 1.6% to roll |
| Uncut Emerald | 1 | 0.05% | one-of `rare`, 1.6% to roll |
| Uncut Ruby | 1 | 0.02% | one-of `rare`, 1.6% to roll |

### Bear — level 14

`bear` · 25 hp · attacks with **melee** · armour class **none** · respawns in 40s · aggressive within 2 tiles

Expected **27 gp** per kill (1.1 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Bones | 1 | **Always** | independent |
| Bear Fur | 1–2 | **Always** | independent |
| Coins | 5–35 | 50% | independent |
| Potato Seed | 1–3 | 4.4% | one-of `seed`, 11% to roll |
| Onion Seed | 1–3 | 3.1% | one-of `seed`, 11% to roll |
| Cabbage Seed | 1–2 | 2.2% | one-of `seed`, 11% to roll |
| Wheat Seed | 1–2 | 1.3% | one-of `seed`, 11% to roll |

### Town Guard — level 16

`guard` · 22 hp · attacks with **melee** · armour class **melee** · respawns in 30s

Expected **44 gp** per kill (2.0 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Coins | 10–50 | 90% | independent |
| Bones | 1 | **Always** | independent |
| Steel Arrows | 2–6 | 30% | independent |
| Potato Seed | 1–3 | 3.1% | one-of `seed`, 7.8% to roll |
| Onion Seed | 1–3 | 2.2% | one-of `seed`, 7.8% to roll |
| Cabbage Seed | 1–2 | 1.6% | one-of `seed`, 7.8% to roll |
| Wheat Seed | 1–2 | 0.94% | one-of `seed`, 7.8% to roll |
| Coins | 250–700 | 0.63% | one-of `rare`, 1.6% to roll |
| Coal | 2–6 | 0.31% | one-of `rare`, 1.6% to roll |
| Steel Bar | 1–2 | 0.19% | one-of `rare`, 1.6% to roll |
| Iron Bar | 2–4 | 0.11% | one-of `rare`, 1.6% to roll |
| Steel Kite Shield | 1 | 0.08% | one-of `rare`, 1.6% to roll |
| Steel Chain Mail Body | 1 | 0.06% | one-of `rare`, 1.6% to roll |
| Steel Plate Legs | 1 | 0.03% | one-of `rare`, 1.6% to roll |
| Dragon bones | 1 | 0.02% | one-of `rare`, 1.6% to roll |
| Uncut Sapphire | 1 | 0.08% | one-of `rare`, 1.6% to roll |
| Uncut Emerald | 1 | 0.05% | one-of `rare`, 1.6% to roll |
| Uncut Ruby | 1 | 0.02% | one-of `rare`, 1.6% to roll |

### Dark Wizard — level 19

`dark_wizard` · 30 hp · attacks with **magic** · armour class **magic** · respawns in 40s · aggressive within 4 tiles · leashes at 6

Expected **75 gp** per kill (2.5 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Bones | 1 | **Always** | independent |
| Coins | 15–70 | 80% | independent |
| Air Rune | 3–9 | 40% | independent |
| Mind Rune | 3–9 | 40% | independent |
| Fire Rune | 2–6 | 30% | independent |
| Earth Rune | 2–6 | 30% | independent |
| Wizard Hat | 1 | 6.4% | one-of `wizard`, 16% to roll |
| Wizard Robe | 1 | 5.4% | one-of `wizard`, 16% to roll |
| Wizard Skirt | 1 | 3.2% | one-of `wizard`, 16% to roll |
| Magic Staff | 1 | 0.96% | one-of `wizard`, 16% to roll |
| Coins | 250–700 | 0.94% | one-of `rare`, 2.3% to roll |
| Coal | 2–6 | 0.47% | one-of `rare`, 2.3% to roll |
| Steel Bar | 1–2 | 0.28% | one-of `rare`, 2.3% to roll |
| Iron Bar | 2–4 | 0.16% | one-of `rare`, 2.3% to roll |
| Steel Kite Shield | 1 | 0.12% | one-of `rare`, 2.3% to roll |
| Steel Chain Mail Body | 1 | 0.09% | one-of `rare`, 2.3% to roll |
| Steel Plate Legs | 1 | 0.05% | one-of `rare`, 2.3% to roll |
| Dragon bones | 1 | 0.02% | one-of `rare`, 2.3% to roll |
| Uncut Sapphire | 1 | 0.12% | one-of `rare`, 2.3% to roll |
| Uncut Emerald | 1 | 0.07% | one-of `rare`, 2.3% to roll |
| Uncut Ruby | 1 | 0.02% | one-of `rare`, 2.3% to roll |

### Druid — level 19

`druid` · 30 hp · attacks with **magic** · armour class **magic** · respawns in 35s

Expected **163 gp** per kill (5.4 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Bones | 1 | **Always** | independent |
| Coins | 20–90 | 70% | independent |
| Vial | 1–2 | 30% | independent |
| Grimy guam leaf | 1 | 24% | one-of `herb`, 75% to roll |
| Grimy marrentill | 1 | 18% | one-of `herb`, 75% to roll |
| Grimy tarromin | 1 | 14% | one-of `herb`, 75% to roll |
| Grimy harralander | 1 | 9.8% | one-of `herb`, 75% to roll |
| Grimy ranarr weed | 1 | 6.0% | one-of `herb`, 75% to roll |
| Grimy irit leaf | 1 | 3.8% | one-of `herb`, 75% to roll |
| Eye of newt | 3–8 | 15% | one-of `druidic`, 50% to roll |
| Limpwurt root | 1–2 | 11% | one-of `druidic`, 50% to roll |
| Snape grass | 1–3 | 9.0% | one-of `druidic`, 50% to roll |
| Red spiders eggs | 1–2 | 7.0% | one-of `druidic`, 50% to roll |
| White berries | 1–2 | 5.0% | one-of `druidic`, 50% to roll |
| Unicorn horn | 1 | 3.0% | one-of `druidic`, 50% to roll |

### Hobgoblin — level 21

`hobgoblin` · 30 hp · attacks with **melee** · armour class **magic** · respawns in 40s · aggressive within 4 tiles

Expected **70 gp** per kill (2.3 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Bones | 1 | **Always** | independent |
| Coins | 10–60 | 80% | independent |
| Iron ore | 1 | 40% | independent |
| Coal | 1–2 | 25% | independent |
| Fire Rune | 2–5 | 20% | independent |
| Grimy guam leaf | 1 | 3.0% | one-of `herb`, 9.4% to roll |
| Grimy marrentill | 1 | 2.3% | one-of `herb`, 9.4% to roll |
| Grimy tarromin | 1 | 1.7% | one-of `herb`, 9.4% to roll |
| Grimy harralander | 1 | 1.2% | one-of `herb`, 9.4% to roll |
| Grimy ranarr weed | 1 | 0.75% | one-of `herb`, 9.4% to roll |
| Grimy irit leaf | 1 | 0.47% | one-of `herb`, 9.4% to roll |
| Potato Seed | 1–3 | 5.6% | one-of `seed`, 14% to roll |
| Onion Seed | 1–3 | 3.9% | one-of `seed`, 14% to roll |
| Cabbage Seed | 1–2 | 2.8% | one-of `seed`, 14% to roll |
| Wheat Seed | 1–2 | 1.7% | one-of `seed`, 14% to roll |
| Coins | 250–700 | 1.3% | one-of `rare`, 3.1% to roll |
| Coal | 2–6 | 0.63% | one-of `rare`, 3.1% to roll |
| Steel Bar | 1–2 | 0.38% | one-of `rare`, 3.1% to roll |
| Iron Bar | 2–4 | 0.22% | one-of `rare`, 3.1% to roll |
| Steel Kite Shield | 1 | 0.16% | one-of `rare`, 3.1% to roll |
| Steel Chain Mail Body | 1 | 0.13% | one-of `rare`, 3.1% to roll |
| Steel Plate Legs | 1 | 0.06% | one-of `rare`, 3.1% to roll |
| Dragon bones | 1 | 0.03% | one-of `rare`, 3.1% to roll |
| Uncut Sapphire | 1 | 0.16% | one-of `rare`, 3.1% to roll |
| Uncut Emerald | 1 | 0.09% | one-of `rare`, 3.1% to roll |
| Uncut Ruby | 1 | 0.03% | one-of `rare`, 3.1% to roll |

### Ghost — level 25

`ghost` · 35 hp · attacks with **magic** · armour class **ranged** · respawns in 45s · aggressive within 5 tiles

Expected **58 gp** per kill (1.7 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Air Rune | 3–8 | 50% | independent |
| Mind Rune | 3–8 | 50% | independent |
| Earth Rune | 2–6 | 30% | independent |
| Coins | 20–80 | 50% | independent |
| Grimy guam leaf | 1 | 2.5% | one-of `herb`, 7.8% to roll |
| Grimy marrentill | 1 | 1.9% | one-of `herb`, 7.8% to roll |
| Grimy tarromin | 1 | 1.4% | one-of `herb`, 7.8% to roll |
| Grimy harralander | 1 | 1.0% | one-of `herb`, 7.8% to roll |
| Grimy ranarr weed | 1 | 0.63% | one-of `herb`, 7.8% to roll |
| Grimy irit leaf | 1 | 0.39% | one-of `herb`, 7.8% to roll |
| Coins | 250–700 | 0.94% | one-of `rare`, 2.3% to roll |
| Coal | 2–6 | 0.47% | one-of `rare`, 2.3% to roll |
| Steel Bar | 1–2 | 0.28% | one-of `rare`, 2.3% to roll |
| Iron Bar | 2–4 | 0.16% | one-of `rare`, 2.3% to roll |
| Steel Kite Shield | 1 | 0.12% | one-of `rare`, 2.3% to roll |
| Steel Chain Mail Body | 1 | 0.09% | one-of `rare`, 2.3% to roll |
| Steel Plate Legs | 1 | 0.05% | one-of `rare`, 2.3% to roll |
| Dragon bones | 1 | 0.02% | one-of `rare`, 2.3% to roll |
| Uncut Sapphire | 1 | 0.12% | one-of `rare`, 2.3% to roll |
| Uncut Emerald | 1 | 0.07% | one-of `rare`, 2.3% to roll |
| Uncut Ruby | 1 | 0.02% | one-of `rare`, 2.3% to roll |

### Chaos Druid — level 26

`chaos_druid` · 42 hp · attacks with **magic** · armour class **magic** · respawns in 45s · aggressive within 4 tiles

Expected **357 gp** per kill (8.5 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Bones | 1 | **Always** | independent |
| Coins | 60–200 | 85% | independent |
| Vial | 1–3 | 40% | independent |
| Chaos Rune | 3–9 | 35% | independent |
| Grimy guam leaf | 1 | 32% | one-of `herb`, 100% to roll |
| Grimy marrentill | 1 | 24% | one-of `herb`, 100% to roll |
| Grimy tarromin | 1 | 18% | one-of `herb`, 100% to roll |
| Grimy harralander | 1 | 13% | one-of `herb`, 100% to roll |
| Grimy ranarr weed | 1 | 8.0% | one-of `herb`, 100% to roll |
| Grimy irit leaf | 1 | 5.0% | one-of `herb`, 100% to roll |
| Eye of newt | 3–8 | 24% | one-of `druidic`, 80% to roll |
| Limpwurt root | 1–2 | 18% | one-of `druidic`, 80% to roll |
| Snape grass | 1–3 | 14% | one-of `druidic`, 80% to roll |
| Red spiders eggs | 1–2 | 11% | one-of `druidic`, 80% to roll |
| White berries | 1–2 | 8.0% | one-of `druidic`, 80% to roll |
| Unicorn horn | 1 | 4.8% | one-of `druidic`, 80% to roll |
| Coins | 250–700 | 1.9% | one-of `rare`, 4.7% to roll |
| Coal | 2–6 | 0.94% | one-of `rare`, 4.7% to roll |
| Steel Bar | 1–2 | 0.56% | one-of `rare`, 4.7% to roll |
| Iron Bar | 2–4 | 0.33% | one-of `rare`, 4.7% to roll |
| Steel Kite Shield | 1 | 0.23% | one-of `rare`, 4.7% to roll |
| Steel Chain Mail Body | 1 | 0.19% | one-of `rare`, 4.7% to roll |
| Steel Plate Legs | 1 | 0.09% | one-of `rare`, 4.7% to roll |
| Dragon bones | 1 | 0.05% | one-of `rare`, 4.7% to roll |
| Uncut Sapphire | 1 | 0.23% | one-of `rare`, 4.7% to roll |
| Uncut Emerald | 1 | 0.14% | one-of `rare`, 4.7% to roll |
| Uncut Ruby | 1 | 0.05% | one-of `rare`, 4.7% to roll |

### Marsh Wraith — level 26

`marsh_wraith` · 40 hp · attacks with **magic** · armour class **ranged** · respawns in 40s · aggressive within 4 tiles · leashes at 10

Expected **89 gp** per kill (2.2 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Grave-silk | 1 | 50% | independent |
| Wraith Essence | 1 | 35% | independent |
| Coins | 30–110 | 60% | independent |
| Ecto-token | 2–6 | 40% | independent |
| Air Rune | 4–10 | 35% | independent |
| Mind Rune | 4–10 | 35% | independent |
| Grimy guam leaf | 1 | 3.0% | one-of `herb`, 9.4% to roll |
| Grimy marrentill | 1 | 2.3% | one-of `herb`, 9.4% to roll |
| Grimy tarromin | 1 | 1.7% | one-of `herb`, 9.4% to roll |
| Grimy harralander | 1 | 1.2% | one-of `herb`, 9.4% to roll |
| Grimy ranarr weed | 1 | 0.75% | one-of `herb`, 9.4% to roll |
| Grimy irit leaf | 1 | 0.47% | one-of `herb`, 9.4% to roll |
| Coins | 250–700 | 1.6% | one-of `rare`, 3.9% to roll |
| Coal | 2–6 | 0.78% | one-of `rare`, 3.9% to roll |
| Steel Bar | 1–2 | 0.47% | one-of `rare`, 3.9% to roll |
| Iron Bar | 2–4 | 0.27% | one-of `rare`, 3.9% to roll |
| Steel Kite Shield | 1 | 0.20% | one-of `rare`, 3.9% to roll |
| Steel Chain Mail Body | 1 | 0.16% | one-of `rare`, 3.9% to roll |
| Steel Plate Legs | 1 | 0.08% | one-of `rare`, 3.9% to roll |
| Dragon bones | 1 | 0.04% | one-of `rare`, 3.9% to roll |
| Uncut Sapphire | 1 | 0.20% | one-of `rare`, 3.9% to roll |
| Uncut Emerald | 1 | 0.12% | one-of `rare`, 3.9% to roll |
| Uncut Ruby | 1 | 0.04% | one-of `rare`, 3.9% to roll |

### Hill Giant — level 27

`hill_giant` · 45 hp · attacks with **melee** · armour class **none** · respawns in 45s · aggressive within 3 tiles

Expected **127 gp** per kill (2.8 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Big bones | 1 | **Always** | independent |
| Coins | 20–90 | 80% | independent |
| Iron ore | 1–2 | 30% | independent |
| Coal | 1–4 | 35% | independent |
| Steel Arrows | 3–8 | 20% | independent |
| Mithril ore | 1 | 5.0% | independent |
| Grimy guam leaf | 1 | 3.5% | one-of `herb`, 11% to roll |
| Grimy marrentill | 1 | 2.6% | one-of `herb`, 11% to roll |
| Grimy tarromin | 1 | 2.0% | one-of `herb`, 11% to roll |
| Grimy harralander | 1 | 1.4% | one-of `herb`, 11% to roll |
| Grimy ranarr weed | 1 | 0.88% | one-of `herb`, 11% to roll |
| Grimy irit leaf | 1 | 0.55% | one-of `herb`, 11% to roll |
| Potato Seed | 1–3 | 5.6% | one-of `seed`, 14% to roll |
| Onion Seed | 1–3 | 3.9% | one-of `seed`, 14% to roll |
| Cabbage Seed | 1–2 | 2.8% | one-of `seed`, 14% to roll |
| Wheat Seed | 1–2 | 1.7% | one-of `seed`, 14% to roll |
| Coins | 250–700 | 1.9% | one-of `rare`, 4.7% to roll |
| Coal | 2–6 | 0.94% | one-of `rare`, 4.7% to roll |
| Steel Bar | 1–2 | 0.56% | one-of `rare`, 4.7% to roll |
| Iron Bar | 2–4 | 0.33% | one-of `rare`, 4.7% to roll |
| Steel Kite Shield | 1 | 0.23% | one-of `rare`, 4.7% to roll |
| Steel Chain Mail Body | 1 | 0.19% | one-of `rare`, 4.7% to roll |
| Steel Plate Legs | 1 | 0.09% | one-of `rare`, 4.7% to roll |
| Dragon bones | 1 | 0.05% | one-of `rare`, 4.7% to roll |
| Uncut Sapphire | 1 | 0.23% | one-of `rare`, 4.7% to roll |
| Uncut Emerald | 1 | 0.14% | one-of `rare`, 4.7% to roll |
| Uncut Ruby | 1 | 0.05% | one-of `rare`, 4.7% to roll |

### Tide Wraith — level 28

`tide_wraith` · 45 hp · attacks with **magic** · armour class **ranged** · respawns in 9999s · aggressive within 6 tiles · leashes at 20

Expected **46 gp** per kill (1.0 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Ecto-token | 1–4 | 50% | independent |
| Coins | 40–120 | 50% | independent |
| Wraith Essence | 1 | 15% | independent |

### Herald of the Tide — level 40

`tide_herald` · 75 hp · attacks with **magic** · armour class **magic** · respawns in 9999s · aggressive within 7 tiles · leashes at 20 · **boss**

Expected **409 gp** per kill (5.5 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Ecto-token | 10–25 | **Always** | independent |
| Drowned Bones | 1–2 | 50% | independent |
| Wraith Essence | 1–3 | 60% | independent |
| Coins | 150–400 | **Always** | independent |
| Mithril ore | 1–2 | 25% | independent |

### Green Dragon — level 42

`dragon` · 80 hp · attacks with **ranged** · armour class **ranged** · respawns in 120s · aggressive within 3 tiles · **boss**

Expected **1,606 gp** per kill (20.1 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Dragon bones | 1 | **Always** | independent |
| Coins | 200–600 | **Always** | independent |
| Fire Rune | 10–30 | 85% | independent |
| Dragon Sword | 1 | 15% | independent |
| Mithril ore | 1–2 | 22% | independent |
| Coal | 3–6 | 35% | independent |
| Green dragonhide | 1 | **Always** | independent |
| Coins | 250–700 | 10% | one-of `rare`, 25% to roll |
| Coal | 2–6 | 5.0% | one-of `rare`, 25% to roll |
| Steel Bar | 1–2 | 3.0% | one-of `rare`, 25% to roll |
| Iron Bar | 2–4 | 1.8% | one-of `rare`, 25% to roll |
| Steel Kite Shield | 1 | 1.3% | one-of `rare`, 25% to roll |
| Steel Chain Mail Body | 1 | 1.0% | one-of `rare`, 25% to roll |
| Steel Plate Legs | 1 | 0.50% | one-of `rare`, 25% to roll |
| Dragon bones | 1 | 0.25% | one-of `rare`, 25% to roll |
| Uncut Sapphire | 1 | 1.3% | one-of `rare`, 25% to roll |
| Uncut Emerald | 1 | 0.75% | one-of `rare`, 25% to roll |
| Uncut Ruby | 1 | 0.25% | one-of `rare`, 25% to roll |

### Grukk, Giant Chieftain — level 46

`grukk` · 95 hp · attacks with **melee** · armour class **melee** · respawns in 220s · aggressive within 4 tiles · **boss**

Expected **1,229 gp** per kill (12.9 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Big bones | 2–3 | **Always** | independent |
| Giant totem | 1 | **Always** | independent |
| Coins | 300–800 | **Always** | independent |
| Coal | 5–12 | 80% | independent |
| Steel Bar | 1–3 | 50% | independent |
| Dragon bones | 1 | 20% | independent |
| Mithril Bar | 1 | 12% | independent |
| Adamantite ore | 1 | 6.0% | independent |
| Coins | 250–700 | 24% | one-of `rare`, 60% to roll |
| Coal | 2–6 | 12% | one-of `rare`, 60% to roll |
| Steel Bar | 1–2 | 7.2% | one-of `rare`, 60% to roll |
| Iron Bar | 2–4 | 4.2% | one-of `rare`, 60% to roll |
| Steel Kite Shield | 1 | 3.0% | one-of `rare`, 60% to roll |
| Steel Chain Mail Body | 1 | 2.4% | one-of `rare`, 60% to roll |
| Steel Plate Legs | 1 | 1.2% | one-of `rare`, 60% to roll |
| Dragon bones | 1 | 0.60% | one-of `rare`, 60% to roll |
| Uncut Sapphire | 1 | 3.0% | one-of `rare`, 60% to roll |
| Uncut Emerald | 1 | 1.8% | one-of `rare`, 60% to roll |
| Uncut Ruby | 1 | 0.60% | one-of `rare`, 60% to roll |
| Potato Seed | 1–3 | 14% | one-of `seed`, 35% to roll |
| Onion Seed | 1–3 | 9.8% | one-of `seed`, 35% to roll |
| Cabbage Seed | 1–2 | 7.0% | one-of `seed`, 35% to roll |
| Wheat Seed | 1–2 | 4.2% | one-of `seed`, 35% to roll |

### The Tallyman — level 51

`tallyman` · 110 hp · attacks with **magic** · armour class **magic** · respawns in 300s · aggressive within 5 tiles · **boss**

Expected **1,094 gp** per kill (9.9 gp per hitpoint).

| Item | Qty | Rate | Roll |
|---|---|---|---|
| Ecto-token | 60–90 | **Always** | independent |
| Wraith Essence | 2–4 | **Always** | independent |
| Coins | 300–700 | **Always** | independent |
| Dragon bones | 1 | 25% | independent |
| Holy Symbol | 1 | 25% | independent |
| Coal | 3–8 | 55% | independent |
| Adamantite ore | 1–2 | 18% | independent |
| Adamant Bar | 1 | 5.0% | independent |
| Coins | 250–700 | 20% | one-of `rare`, 50% to roll |
| Coal | 2–6 | 10% | one-of `rare`, 50% to roll |
| Steel Bar | 1–2 | 6.0% | one-of `rare`, 50% to roll |
| Iron Bar | 2–4 | 3.5% | one-of `rare`, 50% to roll |
| Steel Kite Shield | 1 | 2.5% | one-of `rare`, 50% to roll |
| Steel Chain Mail Body | 1 | 2.0% | one-of `rare`, 50% to roll |
| Steel Plate Legs | 1 | 1.0% | one-of `rare`, 50% to roll |
| Dragon bones | 1 | 0.50% | one-of `rare`, 50% to roll |
| Uncut Sapphire | 1 | 2.5% | one-of `rare`, 50% to roll |
| Uncut Emerald | 1 | 1.5% | one-of `rare`, 50% to roll |
| Uncut Ruby | 1 | 0.50% | one-of `rare`, 50% to roll |


<!-- END GENERATED -->
