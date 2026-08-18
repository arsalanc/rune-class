'use strict';
// ---- XP / levels (authentic RSC experience formula) ----
const XP_FOR_LEVEL = (() => {
  const t = [0, 0];
  let pts = 0;
  for (let n = 1; n <= 120; n++) {
    pts += Math.floor(n + 300 * Math.pow(2, n / 7));
    t.push(Math.floor(pts / 4));
  }
  return t;
})();
function levelForXp(xp) {
  for (let l = 99; l > 1; l--) if (xp >= XP_FOR_LEVEL[l]) return l;
  return 1;
}

const SKILLS = [
  { id: 'attack', name: 'Attack' },
  { id: 'defense', name: 'Defense' },
  { id: 'strength', name: 'Strength' },
  { id: 'hits', name: 'Hits' },
  { id: 'ranged', name: 'Ranged' },
  { id: 'prayer', name: 'Prayer' },
  { id: 'magic', name: 'Magic' },
  { id: 'cooking', name: 'Cooking' },
  { id: 'woodcut', name: 'Woodcut' },
  { id: 'fishing', name: 'Fishing' },
  { id: 'firemaking', name: 'Firemaking' },
  { id: 'crafting', name: 'Crafting' },
  { id: 'fletching', name: 'Fletching' },
  { id: 'smithing', name: 'Smithing' },
  { id: 'mining', name: 'Mining' },
  { id: 'farming', name: 'Farming' },
  { id: 'runecraft', name: 'Runecraft' },
  { id: 'herblore', name: 'Herblore' }
];

const COMBAT_STYLES = ['Controlled', 'Accurate', 'Aggressive', 'Defensive'];

const ITEMS = {
  coins:          { name: 'Coins', icon: '🪙', stack: true, value: 1, examine: 'Lovely money!' },
  // ---- Green Vale farm & cooking ----
  bucket:         { name: 'Bucket', icon: '🪣', value: 2, examine: 'A sturdy wooden bucket' },
  bucket_of_milk: { name: 'Bucket of milk', icon: '🥛', value: 6, examine: 'A bucket of fresh milk' },
  egg:            { name: 'Egg', icon: '🥚', value: 4, examine: 'A fresh hen egg' },
  wheat:          { name: 'Wheat', icon: '🌾', value: 3, examine: 'A ripe sheaf of wheat' },
  flour:          { name: 'Pot of flour', icon: '🥣', value: 6, examine: 'Freshly ground flour' },
  chefs_hat:      { name: 'Chef hat', icon: '👨‍🍳', value: 100, slot: 'head', armour: 1, examine: 'A tall white hat, the mark of a cook' },
  tribe_charm:    { name: 'Hollow charm', icon: '🧿', value: 0, quest: true, examine: 'A carved bone charm from the folk of the deep' },
  big_bones:      { name: 'Big bones', icon: '🦴', value: 2, bury: true, prayerXp: 15, examine: 'The heavy bones of a giant — worth far more Prayer than common bones' },
  giant_totem:    { name: 'Giant totem', icon: '🗿', value: 0, quest: true, examine: "A crude totem torn from the giant chieftain's belt" },
  // ---- Crafting ----
  // ---- Mourncross: the amulet slot, prayer gear, and the Bone Font supply chain ----
  ghostspeak_amulet: { name: 'Ghostspeak Amulet', icon: '🔮', value: 0, slot: 'amulet', quest: true, pray: 2,
                    examine: 'A pale bead bound in grave-silk. While you wear it, the dead make sense' },
  holy_symbol:    { name: 'Holy Symbol', icon: '✝️', value: 250, slot: 'amulet', pray: 8, examine: 'A symbol of the old faith. It steadies the spirit' },
  monk_top:       { name: "Monk's Robe Top", icon: '🥋', value: 180, slot: 'body', armour: 2, dclass: 'magic', pray: 6, examine: 'Coarse undyed wool. Prayer comes easier in it' },
  monk_bottom:    { name: "Monk's Robe Bottom", icon: '👖', value: 180, slot: 'legs', armour: 2, dclass: 'magic', pray: 6, examine: 'A plain wool skirt worn by the devout' },
  blessed_stole:  { name: 'Blessed Stole', icon: '🧣', value: 400, slot: 'cape', armour: 1, pray: 5, examine: 'A long blessed cloth worn over the shoulders' },
  pale_bead:      { name: 'Pale Bead', icon: '⚪', value: 0, quest: true, examine: 'Marsh sand and ectoplasm, fused in a furnace. It is cold, and it hums' },
  grave_silk:     { name: 'Grave-silk', icon: '🕸️', value: 0, quest: true, examine: 'Thread spun by something that lives on the dead' },
  relic_shard:    { name: 'Relic Shard', icon: '🔺', value: 0, quest: true, examine: 'A chip of the Ancient Relic. It leans, very slightly, toward the east' },
  marsh_sand:     { name: 'Marsh Sand', icon: '⏳', value: 1, examine: 'Grey sand from the Mourncross flats' },
  bucket_slime:   { name: 'Bucket of Ectoplasm', icon: '🪣', value: 4, examine: 'A bucket of cold green slime from beneath the Bone Font' },
  // one meal per bone type, so the Font can pay out against what actually went in
  bonemeal:       { name: 'Pot of Bonemeal', icon: '🥣', value: 3, meal: 15, examine: 'Common bones ground fine. The Font takes them this way' },
  bonemeal_big:   { name: 'Pot of Coarse Bonemeal', icon: '🥣', value: 6, meal: 60, examine: 'Giant bones ground down. Heavy, and it smells of the deep halls' },
  bonemeal_dragon:{ name: 'Pot of Fine Bonemeal', icon: '🥣', value: 40, meal: 240, examine: 'Dragon bone, milled to powder. The grinder complained the whole way' },
  pot:            { name: 'Pot', icon: '🍯', value: 2, examine: 'A clay pot, good for holding bonemeal' },
  ecto_token:     { name: 'Ecto-token', icon: '🎟️', stack: true, value: 0, examine: 'Coin of the dead. The disciples of Mourncross give them for worship' },
  wraith_essence: { name: 'Wraith Essence', icon: '💠', value: 40, prayRestore: 12, examine: 'The cold residue of a thing that should not have lasted. Crush it to restore prayer points' },
  // ---- Farming: rake, seeds and what comes up ----
  rake:           { name: 'Rake', icon: '🧹', value: 15, examine: 'For clearing weeds off a patch before anything will grow in it' },
  potato_seed:    { name: 'Potato Seed', icon: '🌱', stack: true, value: 3, seed: true, examine: 'Plant in a cleared allotment' },
  onion_seed:     { name: 'Onion Seed', icon: '🌱', stack: true, value: 6, seed: true, examine: 'Plant in a cleared allotment' },
  cabbage_seed:   { name: 'Cabbage Seed', icon: '🌱', stack: true, value: 10, seed: true, examine: 'Plant in a cleared allotment' },
  wheat_seed:     { name: 'Wheat Seed', icon: '🌱', stack: true, value: 14, seed: true, examine: 'Plant in a cleared allotment — grinds down to flour' },
  potato:         { name: 'Potato', icon: '🥔', value: 4, heal: 1, examine: 'A firm, earthy potato' },
  onion:          { name: 'Onion', icon: '🧅', value: 6, heal: 1, examine: 'It makes your eyes water just holding it' },
  cabbage:        { name: 'Cabbage', icon: '🥬', value: 8, heal: 2, examine: 'A leafy green cabbage' },
  // ---- Tideforged: the reward tier for dynamic events. Deliberately slotted
  // between steel and dragon, which was the widest hole in the game's gear ladder
  // and lined up with the level 27-42 gap the drop-table audit turned up. None of
  // this is buyable, smithable or dropped by a standing monster.
  tideforged_blade: { name: 'Tideforged Blade', icon: '🗡️', value: 3200, slot: 'weapon', aim: 18, power: 14, speed: 4, wield: 30,
                    examine: 'Cold grey metal drawn out of the flats. It is heavier than it looks and never quite dries' },
  tideforged_kite: { name: 'Tideforged Kite Shield', icon: '🛡️', value: 2400, slot: 'shield', armour: 12, dclass: 'melee', defReq: 30,
                    examine: 'It rings like a struck bell and beads with water in dry air' },
  fontwardens_cape:{ name: "Fontwarden's Cape", icon: '🧣', value: 3000, slot: 'cape', armour: 3, pray: 6,
                    examine: 'Given to those who held the Font when the tide came in' },
  tideglass_amulet:{ name: 'Tideglass Amulet', icon: '📿', value: 2800, slot: 'amulet', mAim: 8, armour: 5, pray: 4,
                    examine: 'A bead of ectoplasm cooled to glass. It is faintly, unpleasantly warm' },
  drowned_bones:  { name: 'Drowned Bones', icon: '🦴', value: 60, bury: true, prayerXp: 100,
                    examine: 'They have been under the flats a long time. The best offering the Font has ever seen' },
  needle:         { name: 'Needle', icon: '🪡', value: 1, examine: 'A steel needle for working leather' },
  leather:        { name: 'Leather', icon: '🟫', value: 5, examine: 'Cured hide, ready to be crafted' },
  leather_coif:   { name: 'Leather Coif', icon: '🪖', slot: 'head', armour: 1, dclass: 'ranged', value: 20, examine: 'A simple leather hood' },
  hard_leather_body: { name: 'Hard Leather Body', icon: '🦺', slot: 'body', armour: 6, dclass: 'ranged', defReq: 5, value: 45, examine: 'Toughened leather, better than the soft kind' },
  leather_chaps:  { name: 'Leather Chaps', icon: '👖', slot: 'legs', armour: 3, dclass: 'ranged', value: 24, examine: 'Supple leather leg guards, favoured by archers' },
  hard_leather_chaps: { name: 'Hard Leather Chaps', icon: '👖', slot: 'legs', armour: 5, dclass: 'ranged', defReq: 5, value: 52, examine: 'Boiled leather chaps — they turn a blade and still let you run' },
  // `reqs` gates on any set of skills. Ranged armour needs the Ranged level to wear as
  // well as the Defence one, which `defReq` alone could never express.
  studded_body:   { name: 'Studded Body', icon: '🥋', slot: 'body', armour: 8, rAim: 2, dclass: 'ranged', reqs: { ranged: 20, defense: 20 }, value: 240, examine: 'Leather set with steel studs — a rangers compromise between weight and bite' },
  studded_chaps:  { name: 'Studded Chaps', icon: '👖', slot: 'legs', armour: 7, rAim: 2, dclass: 'ranged', reqs: { ranged: 20, defense: 20 }, value: 190, examine: 'Studded leather leg guards' },
  green_dhide_body: { name: 'Green D-hide Body', icon: '🥋', slot: 'body', armour: 11, rAim: 5, dclass: 'ranged', reqs: { ranged: 40, defense: 40 }, value: 1500, examine: 'Made from the hide of a green dragon. It turns a spell like nothing else' },
  green_dhide_chaps:{ name: 'Green D-hide Chaps', icon: '👖', slot: 'legs', armour: 9, rAim: 4, dclass: 'ranged', reqs: { ranged: 40, defense: 40 }, value: 1100, examine: 'Dragonhide leg guards, light and near unmarkable' },
  green_dragonhide:{ name: 'Green dragonhide', icon: '🟩', value: 170, examine: 'The hide of a green dragon. A tanner or a needle could do something with this' },
  tinderbox:      { name: 'Tinderbox', icon: '🎇', value: 1, examine: 'Useful for lighting a fire' },
  hammer:         { name: 'Hammer', icon: '🔨', value: 1, examine: 'Good for hitting things' },
  // bronze/iron/steel pickaxes are generated from METALS x SHAPES below, same as axes
  wooden_shield:  { name: 'Wooden Shield', icon: '🛡️', value: 20, slot: 'shield', armour: 3, dclass: 'melee', examine: 'A solid wooden shield' },
  leather_body:   { name: 'Leather Armour', icon: '🎽', value: 21, slot: 'body', armour: 4, dclass: 'ranged', examine: 'Better than no armour!' },
  knife:          { name: 'Knife', icon: '🔪', value: 6, examine: 'A sharp knife, good for fletching' },
  bowstring:      { name: 'Bow string', icon: '🧵', value: 12, stack: true, examine: 'A string for a bow' },
  feather:        { name: 'Feather', icon: '🪶', value: 1, stack: true, examine: 'A fluffy feather, for fletching arrows' },
  // bow speed: accurate/longrange = speed, aggressive style = rapid (faster). Longbows are slower but hit harder.
  // Bows carry wieldSkill:'ranged' — they used to be gated on Attack, so a pure ranger
  // could not draw an oak longbow. Levels follow the originals' bow ladder, compressed.
  shortbow:       { name: 'Shortbow', icon: '🏹', value: 50, slot: 'weapon', bow: true, twoHand: true, rAim: 2, rPow: 0, speed: 4, rapidSpeed: 3, wieldSkill: 'ranged', examine: 'A fast shortbow (4 ticks, 3 on Rapid). Needs both hands' },
  longbow:        { name: 'Longbow', wieldSkill: 'ranged', icon: '🏹', value: 80, slot: 'weapon', bow: true, twoHand: true, rAim: 3, rPow: 3, speed: 6, rapidSpeed: 5, examine: 'A slow but powerful longbow (6 ticks, 5 on Rapid). Needs both hands' },
  oak_longbow:    { name: 'Oak Longbow', icon: '🏹', value: 160, slot: 'weapon', bow: true, twoHand: true, rAim: 5, rPow: 5, speed: 6, rapidSpeed: 5, wield: 20, wieldSkill: 'ranged', examine: 'A mighty oak longbow (6 ticks, 5 on Rapid). Needs both hands' },
  willow_longbow: { name: 'Willow Longbow', icon: '🏹', value: 320, slot: 'weapon', bow: true, twoHand: true, rAim: 7, rPow: 7, speed: 6, rapidSpeed: 5, wield: 30, wieldSkill: 'ranged', examine: 'Springy willow, drawn deep (6 ticks, 5 on Rapid). Needs both hands' },
  maple_longbow:  { name: 'Maple Longbow', icon: '🏹', value: 640, slot: 'weapon', bow: true, twoHand: true, rAim: 9, rPow: 9, speed: 6, rapidSpeed: 5, wield: 40, wieldSkill: 'ranged', examine: 'Hard maple with a punishing draw (6 ticks, 5 on Rapid). Needs both hands' },
  yew_longbow:    { name: 'Yew Longbow', icon: '🏹', value: 1300, slot: 'weapon', bow: true, twoHand: true, rAim: 12, rPow: 11, speed: 6, rapidSpeed: 5, wield: 50, wieldSkill: 'ranged', examine: 'Yew, and nothing better short of magic (6 ticks, 5 on Rapid). Needs both hands' },
  // ---- Magic: staff + robes (magic-class armour: strong vs ranged, weak to melee) ----
  magic_staff:    { name: 'Magic Staff', icon: '🪄', value: 200, slot: 'weapon', magic: true, twoHand: true, mAim: 8, provides: 'air_rune', wieldSkill: 'magic', examine: 'A wizard staff that channels its own air runes' },
  // one staff per element, each supplying its own rune free — the reason to own more
  // than one staff at all
  staff_of_water: { name: 'Staff of Water', icon: '🪄', value: 260, slot: 'weapon', magic: true, twoHand: true, mAim: 8, provides: 'water_rune', wieldSkill: 'magic', examine: 'It weeps a slow bead of water, and never runs dry' },
  staff_of_earth: { name: 'Staff of Earth', icon: '🪄', value: 260, slot: 'weapon', magic: true, twoHand: true, mAim: 8, provides: 'earth_rune', wieldSkill: 'magic', examine: 'Heavy as a fencepost, and it hums when the ground shifts' },
  staff_of_fire:  { name: 'Staff of Fire', icon: '🪄', value: 260, slot: 'weapon', magic: true, twoHand: true, mAim: 8, provides: 'fire_rune', wieldSkill: 'magic', examine: 'Warm to the touch even in the rain' },
  battlestaff:    { name: 'Battlestaff', icon: '🪄', value: 900, slot: 'weapon', magic: true, twoHand: true, mAim: 12, aim: 6, power: 5, speed: 5, provides: 'air_rune', wield: 30, wieldSkill: 'magic', examine: 'A staff built to be swung as well as pointed' },
  mystic_staff:   { name: 'Mystic Staff', icon: '🪄', value: 2600, slot: 'weapon', magic: true, twoHand: true, mAim: 17, aim: 7, power: 6, speed: 5, provides: 'air_rune', wield: 40, wieldSkill: 'magic', examine: 'Rune-cut and silver-shod. The air bends around the head of it' },
  wizard_hat:     { name: 'Wizard Hat', icon: '🧙', value: 30, slot: 'head', armour: 1, mAim: 2, dclass: 'magic', examine: 'A pointed hat favoured by mages' },
  wizard_robe:    { name: 'Wizard Robe', icon: '🥋', value: 40, slot: 'body', armour: 2, mAim: 4, dclass: 'magic', examine: 'Enchanted robes that ward against arrows but tear under a blade' },
  wizard_skirt:   { name: 'Wizard Skirt', icon: '👖', value: 36, slot: 'legs', armour: 1, mAim: 3, dclass: 'magic', examine: 'Robe bottoms stitched with rune-thread' },
  mystic_hat:     { name: 'Mystic Hat', icon: '🎩', value: 700, slot: 'head', armour: 3, mAim: 5, dclass: 'magic', reqs: { magic: 40, defense: 20 }, examine: 'Deep blue, and heavier than it looks' },
  mystic_top:     { name: 'Mystic Robe Top', icon: '🥋', value: 2400, slot: 'body', armour: 5, mAim: 9, dclass: 'magic', reqs: { magic: 40, defense: 20 }, examine: 'Rune-silk. The stitching moves when you are not looking at it' },
  mystic_bottom:  { name: 'Mystic Robe Bottom', icon: '👖', value: 1800, slot: 'legs', armour: 4, mAim: 7, dclass: 'magic', reqs: { magic: 40, defense: 20 }, examine: 'The lower half of a magical robe' },
  // ---- capes (cape slot) — plain colours drop from highwaymen on the Southmarch road ----
  cape_red:       { name: 'Red Cape', icon: '🧣', value: 12, slot: 'cape', armour: 1, examine: 'A plain red cape' },
  cape_blue:      { name: 'Blue Cape', icon: '🧣', value: 12, slot: 'cape', armour: 1, examine: 'A plain blue cape' },
  cape_green:     { name: 'Green Cape', icon: '🧣', value: 12, slot: 'cape', armour: 1, examine: 'A plain green cape' },
  cape_black:     { name: 'Black Cape', icon: '🧣', value: 24, slot: 'cape', armour: 2, examine: 'A plain black cape, the sort a road-agent favours' },
  highwayman_cloak: { name: "Highwayman's Cloak", icon: '🧣', value: 350, slot: 'cape', armour: 4, dclass: 'ranged', defReq: 10, examine: 'A weighted riding cloak, oiled against the rain. Taken from a road-agent' },
  // ---- Animal Magnetism ----
  ava_notes:      { name: "Ava's Notes", icon: '📜', value: 0, quest: true, examine: 'Cramped diagrams of lodestones, and a rhyme about five standing stones' },
  lodestone_core: { name: 'Lodestone Core', icon: '🧲', value: 0, quest: true, examine: 'A fist of black iron that drags at every nail within a yard' },
  avas_satchel:   { name: "Ava's Satchel", icon: '🎒', value: 900, slot: 'cape', armour: 2, rAim: 2, arrowSave: 0.72,
                   examine: 'A lodestone-lined pack worn at the back. Loosed arrows fly home to it — 72% of them, anyway' },
  shortbow_u:     { name: 'Shortbow (unstrung)', icon: '🎋', value: 40, examine: 'It needs a bow string' },
  longbow_u:      { name: 'Longbow (unstrung)', icon: '🎋', value: 64, examine: 'It needs a bow string' },
  oak_longbow_u:  { name: 'Oak Longbow (unstrung)', icon: '🎋', value: 128, examine: 'It needs a bow string' },
  willow_longbow_u:{ name: 'Willow Longbow (unstrung)', icon: '🎋', value: 256, examine: 'It needs a bow string' },
  maple_longbow_u:{ name: 'Maple Longbow (unstrung)', icon: '🎋', value: 512, examine: 'It needs a bow string' },
  yew_longbow_u:  { name: 'Yew Longbow (unstrung)', icon: '🎋', value: 1040, examine: 'It needs a bow string' },
  arrow_shafts:   { name: 'Arrow shafts', icon: '🥢', value: 1, stack: true, examine: 'Needs feathers to become arrows' },
  headless_arrows:{ name: 'Headless arrows', icon: '➖', value: 1, stack: true, examine: 'Arrow shafts with feathers, needs heads' },
  bronze_arrowheads: { name: 'Bronze arrowheads', icon: '🔺', value: 1, stack: true, examine: 'Bronze arrow heads' },
  iron_arrowheads:   { name: 'Iron arrowheads', icon: '🔺', tint: 'iron', value: 3, stack: true, examine: 'Iron arrow heads' },
  steel_arrowheads:  { name: 'Steel arrowheads', icon: '🔺', tint: 'steel', value: 8, stack: true, examine: 'Steel arrow heads' },
  // These two existed as SMITHABLES from v0.43's new metals but had no item to make,
  // so smithing them produced nothing. Adding the heads and the arrows closes that.
  mithril_arrowheads:{ name: 'Mithril arrowheads', icon: '🔺', tint: 'mithril', value: 20, stack: true, examine: 'Mithril arrow heads' },
  adamant_arrowheads:{ name: 'Adamant arrowheads', icon: '🔺', tint: 'adamant', value: 44, stack: true, examine: 'Adamant arrow heads' },
  bronze_arrow:   { name: 'Bronze Arrows', icon: '➶', value: 2, stack: true, power: 3, rangeReq: 1, examine: 'Arrows with bronze heads' },
  iron_arrow:     { name: 'Iron Arrows', icon: '➶', tint: 'iron', value: 4, stack: true, power: 5, rangeReq: 1, examine: 'Arrows with iron heads' },
  steel_arrow:    { name: 'Steel Arrows', icon: '➶', tint: 'steel', value: 8, stack: true, power: 7, rangeReq: 5, examine: 'Arrows with steel heads' },
  mithril_arrow:  { name: 'Mithril Arrows', icon: '➶', tint: 'mithril', value: 22, stack: true, power: 9, rangeReq: 30, examine: 'Arrows with mithril heads — they need a real archer' },
  adamant_arrow:  { name: 'Adamant Arrows', icon: '➶', tint: 'adamant', value: 48, stack: true, power: 11, rangeReq: 40, examine: 'Arrows with adamant heads. Heavy, and they bite' },
  // ---- Runecraft ----
  rune_essence:   { name: 'Rune essence', icon: '⬜', value: 4, examine: 'A lump of blank rock, humming faintly. It wants to be a rune' },
  pure_essence:   { name: 'Pure essence', icon: '⬜', value: 9, examine: 'Essence without a flaw in it. The deeper runes need this' },
  // one talisman per altar — it is the key, not a reagent, so it is never consumed
  air_talisman:   { name: 'Air talisman', icon: '🟡', value: 60, talisman: 'air', examine: 'It tugs toward the air altar' },
  mind_talisman:  { name: 'Mind talisman', icon: '🟡', value: 70, talisman: 'mind', examine: 'It tugs toward the mind altar' },
  water_talisman: { name: 'Water talisman', icon: '🟡', value: 90, talisman: 'water', examine: 'It tugs toward the water altar' },
  earth_talisman: { name: 'Earth talisman', icon: '🟡', value: 120, talisman: 'earth', examine: 'It tugs toward the earth altar' },
  fire_talisman:  { name: 'Fire talisman', icon: '🟡', value: 150, talisman: 'fire', examine: 'It tugs toward the fire altar' },
  body_talisman:  { name: 'Body talisman', icon: '🟡', value: 190, talisman: 'body', examine: 'It tugs toward the body altar' },
  cosmic_talisman:{ name: 'Cosmic talisman', icon: '🟣', value: 320, talisman: 'cosmic', examine: 'It tugs somewhere that is not quite a direction' },
  chaos_talisman: { name: 'Chaos talisman', icon: '🟣', value: 420, talisman: 'chaos', examine: 'It will not sit still in the hand' },
  nature_talisman:{ name: 'Nature talisman', icon: '🟣', value: 560, talisman: 'nature', examine: 'Warm, and faintly green' },
  law_talisman:   { name: 'Law talisman', icon: '🟣', value: 720, talisman: 'law', examine: 'Heavy out of all proportion to its size' },
  death_talisman: { name: 'Death talisman', icon: '🟣', value: 900, talisman: 'death', examine: 'Cold, and it does not warm however long you hold it' },

  // ---- Herblore ----
  vial:           { name: 'Vial', icon: '🧪', value: 3, examine: 'An empty glass vial' },
  vial_of_water:  { name: 'Vial of water', icon: '🧪', value: 4, examine: 'A vial of water, ready for a herb' },
  pestle:         { name: 'Pestle and mortar', icon: '🥣', value: 20, examine: 'For grinding things that do not want to be ground' },
  eye_of_newt:    { name: 'Eye of newt', icon: '👁️', value: 24, examine: 'It is looking at you. Do not think about it' },
  limpwurt_root:  { name: 'Limpwurt root', icon: '🌱', value: 90, examine: 'A thick red root. It smells of iron' },
  red_spider_eggs:{ name: 'Red spiders eggs', icon: '🥚', value: 130, examine: 'Do not let these hatch' },
  snape_grass:    { name: 'Snape grass', icon: '🌾', value: 180, examine: 'Coarse grass from the riverbank. The druids swear by it' },
  white_berries:  { name: 'White berries', icon: '🫐', value: 220, examine: 'Poisonous raw, useful ground' },
  unicorn_horn:   { name: 'Unicorn horn', icon: '🦄', value: 160, examine: 'Grind it with a pestle and it becomes useful' },
  unicorn_dust:   { name: 'Unicorn horn dust', icon: '🥄', value: 200, examine: 'Ground horn. It fizzes against poison' },
  // ---- Herblore: grimy herbs clean into usable ones, levels and xp are theirs ----
  grimy_guam: { name: 'Grimy guam leaf', icon: '🌿', value: 4, examine: 'A herb, still caked in dirt. It needs cleaning' },
  guam: { name: 'Guam leaf', icon: '🌿', value: 8, examine: 'A clean guam leaf, ready for a vial' },
  grimy_marrentill: { name: 'Grimy marrentill', icon: '🌿', value: 7, examine: 'A herb, still caked in dirt. It needs cleaning' },
  marrentill: { name: 'Marrentill', icon: '🌿', value: 14, examine: 'A clean marrentill, ready for a vial' },
  grimy_tarromin: { name: 'Grimy tarromin', icon: '🌿', value: 13, examine: 'A herb, still caked in dirt. It needs cleaning' },
  tarromin: { name: 'Tarromin', icon: '🌿', value: 26, examine: 'A clean tarromin, ready for a vial' },
  grimy_harralander: { name: 'Grimy harralander', icon: '🌿', value: 30, examine: 'A herb, still caked in dirt. It needs cleaning' },
  harralander: { name: 'Harralander', icon: '🌿', value: 60, examine: 'A clean harralander, ready for a vial' },
  grimy_ranarr: { name: 'Grimy ranarr weed', icon: '🌿', value: 110, examine: 'A herb, still caked in dirt. It needs cleaning' },
  ranarr: { name: 'Ranarr weed', icon: '🌿', value: 220, examine: 'A clean ranarr weed, ready for a vial' },
  grimy_irit: { name: 'Grimy irit leaf', icon: '🌿', value: 170, examine: 'A herb, still caked in dirt. It needs cleaning' },
  irit: { name: 'Irit leaf', icon: '🌿', value: 340, examine: 'A clean irit leaf, ready for a vial' },
  attack_potion_unf: { name: 'Attack potion (unf)', icon: '🧪', value: 23, examine: 'An unfinished potion. It still wants its second ingredient' },
  attack_potion: { name: 'Attack potion', icon: '⚗️', value: 72, doses: 3, boost: 'attack', pct: 10, flat: 3, examine: 'Raises Attack by 10%% plus 3 for a while' },
  strength_potion_unf: { name: 'Strength potion (unf)', icon: '🧪', value: 32, examine: 'An unfinished potion. It still wants its second ingredient' },
  strength_potion: { name: 'Strength potion', icon: '⚗️', value: 108, doses: 3, boost: 'strength', pct: 10, flat: 3, examine: 'Raises Strength by 10%% plus 3 for a while' },
  defence_potion_unf: { name: 'Defence potion (unf)', icon: '🧪', value: 50, examine: 'An unfinished potion. It still wants its second ingredient' },
  defence_potion: { name: 'Defence potion', icon: '⚗️', value: 180, doses: 3, boost: 'defense', pct: 10, flat: 3, examine: 'Raises Defense by 10%% plus 3 for a while' },
  ranging_potion_unf: { name: 'Ranging potion (unf)', icon: '🧪', value: 58, examine: 'An unfinished potion. It still wants its second ingredient' },
  ranging_potion: { name: 'Ranging potion', icon: '⚗️', value: 212, doses: 3, boost: 'ranged', pct: 10, flat: 4, examine: 'Raises Ranged by 10%% plus 4 for a while' },
  prayer_potion_unf: { name: 'Prayer potion (unf)', icon: '🧪', value: 55, examine: 'An unfinished potion. It still wants its second ingredient' },
  prayer_potion: { name: 'Prayer potion', icon: '⚗️', value: 320, doses: 3, prayRestore: 14, examine: 'Restores prayer points. The reason anyone grows ranarr' },
  restore_potion_unf: { name: 'Restore potion (unf)', icon: '🧪', value: 45, examine: 'An unfinished potion. It still wants its second ingredient' },
  restore_potion: { name: 'Restore potion', icon: '⚗️', value: 190, doses: 3, restore: true, examine: 'Restores combat stats that something has sapped' },
  antipoison: { name: 'Antipoison', icon: '⚗️', value: 150, doses: 3, cure: true, examine: 'Clears a poison and keeps it off for a while' },
  antipoison_unf: { name: 'Antipoison (unf)', icon: '🧪', value: 30, examine: 'An unfinished potion. It still wants its second ingredient' },
  net:            { name: 'Fishing net', icon: '🕸️', value: 5, examine: 'Used for catching small fish' },
  fishing_rod:    { name: 'Fly fishing rod', icon: '🎣', value: 15, examine: 'Used for catching river fish' },
  // fmLvl = the Firemaking level needed to get these alight at all
  logs:           { name: 'Logs', icon: '🪵', value: 4, fmXp: 40, fmLvl: 1, examine: 'A number of wooden logs' },
  oak_logs:       { name: 'Oak logs', icon: '🪵', value: 20, fmXp: 60, fmLvl: 15, examine: 'Logs cut from an oak tree' },
  willow_logs:    { name: 'Willow logs', icon: '🪵', value: 40, fmXp: 90, fmLvl: 30, examine: 'Logs cut from a willow tree' },
  maple_logs:     { name: 'Maple logs', icon: '🪵', value: 90, fmXp: 135, fmLvl: 45, examine: 'Dense maple. It takes a real fire to catch' },
  yew_logs:       { name: 'Yew logs', icon: '🪵', value: 220, fmXp: 202.5, fmLvl: 60, examine: 'Yew, the bowyer wood. Slow to burn and slow to cut' },
  ashes:          { name: 'Ashes', icon: '🌫️', value: 1, examine: 'What is left when a fire has finished with a log' },
  raw_shrimp:     { name: 'Raw shrimp', icon: '🦐', value: 5, examine: 'I should try cooking this' },
  shrimp:         { name: 'Shrimp', icon: '🍤', value: 5, heal: 3, examine: 'Some nicely cooked shrimp' },
  raw_anchovies:  { name: 'Raw anchovies', icon: '🐟', value: 15, examine: 'Four times the Fishing experience of a shrimp. I should try cooking this' },
  // Heals 1 on purpose — anchovies are the training-and-trade catch, not a meal. The
  // examine has to say so, or a level-15 fish that heals less than a level-1 one reads
  // as a bug (it did).
  anchovies:      { name: 'Anchovies', icon: '🐟', value: 15, heal: 1, examine: 'Salty little fish — barely a mouthful, but they fetch triple what shrimp do' },
  raw_trout:      { name: 'Raw trout', icon: '🐠', value: 20, examine: 'I should try cooking this' },
  trout:          { name: 'Trout', icon: '🐠', value: 20, heal: 7, examine: 'Some nicely cooked trout' },
  raw_salmon:     { name: 'Raw salmon', icon: '🐡', value: 50, examine: 'I should try cooking this' },
  salmon:         { name: 'Salmon', icon: '🐡', value: 50, heal: 9, examine: 'Some nicely cooked salmon' },
  burnt_fish:     { name: 'Burnt fish', icon: '🐟', value: 1, burnt: true, examine: 'Oops...' },
  burnt_shrimp:   { name: 'Burnt shrimp', icon: '🍤', value: 1, burnt: true, examine: 'Oops...' },
  copper_ore:     { name: 'Copper ore', icon: '🟠', value: 3, examine: 'This needs refining' },
  tin_ore:        { name: 'Tin ore', icon: '⚪', value: 3, examine: 'This needs refining' },
  iron_ore:       { name: 'Iron ore', icon: '🟤', value: 17, examine: 'This needs refining' },
  coal:           { name: 'Coal', icon: '⚫', value: 45, examine: 'Hmm, a non-renewable energy source' },
  bronze_bar:     { name: 'Bronze Bar', icon: '🧱', value: 8, examine: 'A bar of bronze' },
  iron_bar:       { name: 'Iron Bar', icon: '🧱', tint: 'iron', value: 28, examine: 'A bar of iron' },
  steel_bar:      { name: 'Steel Bar', icon: '🧱', tint: 'steel', value: 100, examine: 'A bar of steel' },
  mithril_bar:    { name: 'Mithril Bar', icon: '🧱', tint: 'mithril', value: 320, examine: 'A bar of mithril, faintly blue' },
  adamant_bar:    { name: 'Adamant Bar', icon: '🧱', tint: 'adamant', value: 700, examine: 'A bar of adamant. Heavy, and greener than it ought to be' },
  fur:            { name: 'Bear Fur', icon: '🧥', value: 10, examine: 'A thick winter coat' },
  bones:          { name: 'Bones', icon: '🦴', value: 1, bury: true, prayerXp: 3.75, examine: 'Ew, gross!' },
  dragon_bones:   { name: 'Dragon bones', icon: '🦴', value: 30, bury: true, prayerXp: 60, examine: 'These would be great for my prayer!' },
  // Was aim 14 / power 12 — weaker than the Tideforged Blade despite being a 15% boss
  // drop worth 5,000gp. Raised to sit at the top of the ladder where its price says it
  // belongs, now that adamant reaches 18/14. Wield requirement deliberately unchanged so
  // nobody's existing sword becomes unequippable.
  dragon_sword:   { name: 'Dragon Sword', icon: '⚔️', value: 5000, slot: 'weapon', aim: 22, power: 18, speed: 4, wield: 30, examine: 'A legendary blade humming with dragonfire' },
  air_rune:       { name: 'Air Rune', icon: '💨', stack: true, value: 4, examine: 'One of the four basic elemental runes' },
  mind_rune:      { name: 'Mind Rune', icon: '🧠', stack: true, value: 3, examine: 'Used for low level missile spells' },
  water_rune:     { name: 'Water Rune', icon: '💧', stack: true, value: 2, examine: 'One of the four basic elemental runes' },
  earth_rune:     { name: 'Earth Rune', icon: '🟫', stack: true, value: 3, examine: 'One of the four basic elemental runes' },
  fire_rune:      { name: 'Fire Rune', icon: '🔥', stack: true, value: 4, examine: 'One of the four basic elemental runes' },
  // ---- catalytic runes: the ones that decide what a spell DOES, rather than what it is made of ----
  body_rune:      { name: 'Body Rune', icon: '🌀', stack: true, value: 3, examine: 'Used in the curse spells that weaken an enemy' },
  chaos_rune:     { name: 'Chaos Rune', icon: '☄️', stack: true, value: 18, examine: 'Powers the bolt spells' },
  nature_rune:    { name: 'Nature Rune', icon: '🍃', stack: true, value: 30, examine: 'Transmutes one thing into another — alchemy and superheating' },
  law_rune:       { name: 'Law Rune', icon: '⚖️', stack: true, value: 28, examine: 'Bends the rules of distance' },
  cosmic_rune:    { name: 'Cosmic Rune', icon: '✨', stack: true, value: 35, examine: 'Binds an enchantment into a gem' },
  death_rune:     { name: 'Death Rune', icon: '💀', stack: true, value: 45, examine: 'Powers the blast spells' },

  // ---- Mining & Smithing: the precious metals ----
  mithril_ore:    { name: 'Mithril ore', icon: '🔵', value: 108, examine: 'A dull blue ore, lighter than it looks' },
  adamantite_ore: { name: 'Adamantite ore', icon: '🟢', value: 240, examine: 'A dense green ore. It blunts a pick just looking at it' },
  silver_ore:     { name: 'Silver Ore', icon: '🪨', value: 28, examine: 'A lump of rock streaked with silver' },
  gold_ore:       { name: 'Gold Ore', icon: '🪨', value: 90, examine: 'A lump of rock streaked with gold' },
  silver_bar:     { name: 'Silver Bar', icon: '🔩', value: 42, examine: 'A bar of refined silver. Holy symbols are cast from it' },
  gold_bar:       { name: 'Gold Bar', icon: '🔩', value: 140, examine: 'A bar of refined gold, ready for the mould' },

  // ---- gems: mined from gem seams, cut with a chisel ----
  uncut_sapphire: { name: 'Uncut Sapphire', icon: '🔷', value: 60, uncut: 'sapphire', examine: 'A rough blue stone. A chisel would bring out its shape' },
  uncut_emerald:  { name: 'Uncut Emerald', icon: '💚', value: 120, uncut: 'emerald', examine: 'A rough green stone' },
  uncut_ruby:     { name: 'Uncut Ruby', icon: '❤️', value: 300, uncut: 'ruby', examine: 'A rough red stone' },
  uncut_diamond:  { name: 'Uncut Diamond', icon: '💎', value: 800, uncut: 'diamond', examine: 'A rough clear stone, and very hard' },
  sapphire:       { name: 'Sapphire', icon: '🔷', value: 110, gem: true, examine: 'A cut sapphire, deep blue' },
  emerald:        { name: 'Emerald', icon: '💚', value: 220, gem: true, examine: 'A cut emerald, green as spring' },
  ruby:           { name: 'Ruby', icon: '❤️', value: 550, gem: true, examine: 'A cut ruby, the colour of a hot coal' },
  diamond:        { name: 'Diamond', icon: '💎', value: 1400, gem: true, examine: 'A cut diamond. It throws the light about' },
  chisel:         { name: 'Chisel', icon: '🔨', value: 12, examine: 'For cutting gems, and nothing else you would enjoy' },
  amulet_mould:   { name: 'Amulet Mould', icon: '🕳️', value: 30, examine: 'Pour a molten bar into this and an amulet comes out' },
  symbol_mould:   { name: 'Symbol Mould', icon: '🕳️', value: 30, examine: 'For casting a holy symbol from silver' },

  // ---- jewellery: plain until a Magic enchantment wakes it up ----
  gold_amulet:    { name: 'Gold Amulet', icon: '📿', value: 250, slot: 'amulet', examine: 'Plain gold. Handsome, and does nothing at all' },
  sapphire_amulet:{ name: 'Sapphire Amulet', icon: '📿', value: 400, slot: 'amulet', gemset: 'sapphire', examine: 'A sapphire set in gold. Unenchanted, it is only jewellery' },
  emerald_amulet: { name: 'Emerald Amulet', icon: '📿', value: 620, slot: 'amulet', gemset: 'emerald', examine: 'An emerald set in gold. Unenchanted, it is only jewellery' },
  ruby_amulet:    { name: 'Ruby Amulet', icon: '📿', value: 1000, slot: 'amulet', gemset: 'ruby', examine: 'A ruby set in gold. Unenchanted, it is only jewellery' },
  diamond_amulet: { name: 'Diamond Amulet', icon: '📿', value: 1900, slot: 'amulet', gemset: 'diamond', examine: 'A diamond set in gold. Unenchanted, it is only jewellery' },
  amulet_of_magic:   { name: 'Amulet of Magic', icon: '📿', value: 700, slot: 'amulet', mAim: 10, examine: 'Sapphire, enchanted. Your casting bites harder' },
  amulet_of_defence: { name: 'Amulet of Defence', icon: '📿', value: 950, slot: 'amulet', armour: 7, examine: 'Emerald, enchanted. Blows land less often' },
  amulet_of_strength:{ name: 'Amulet of Strength', icon: '📿', value: 1500, slot: 'amulet', power: 10, examine: 'Ruby, enchanted. It lends weight to every swing' },
  amulet_of_power:   { name: 'Amulet of Power', icon: '📿', value: 2600, slot: 'amulet', aim: 6, power: 6, armour: 6, rAim: 6, mAim: 6, examine: 'Diamond, enchanted. Good at everything, best at nothing' },
  unblessed_symbol:  { name: 'Unblessed Symbol', icon: '✝️', value: 90, examine: 'Cast from silver. It needs a blessing at an altar before it means anything' },
  ancient_relic:  { name: 'Ancient Relic', icon: '🏺', value: 0, quest: true, examine: 'A holy relic of a forgotten age' }
};

// ---- metal tiers: weapons and armour generated per metal ----
const METALS = [
  { id: 'bronze', name: 'Bronze', wield: 1, smith: 1, smithXp: 12.5, mult: 1, valMult: 1, tint: null },
  { id: 'iron',   name: 'Iron',   wield: 10, smith: 10, smithXp: 25, mult: 1.6, valMult: 3.5, tint: 'iron' },
  { id: 'steel',  name: 'Steel',  wield: 20, smith: 20, smithXp: 37.5, mult: 2.3, valMult: 12.5, tint: 'steel' },
  // Mithril and adamant continue the ladder's +10 cadence. Their `mult` is chosen so an
  // adamant sword (18/14) lands just under the Tideforged Blade — event gear stays worth
  // winning because it hits that grade at Attack 30 instead of 40.
  { id: 'mithril', name: 'Mithril', wield: 30, smith: 30, smithXp: 50, mult: 3.0, valMult: 32, tint: 'mithril' },
  { id: 'adamant', name: 'Adamant', wield: 40, smith: 40, smithXp: 62.5, mult: 3.6, valMult: 70, tint: 'adamant' }
];
const SHAPES = {
  // speed = attack cooldown in game ticks (lower = faster). Slower weapons carry more power.
  sword: { name: 'Sword', icon: '🗡️', slot: 'weapon', aim: 5, power: 4, speed: 4, bars: 1, off: 0, value: 26, examine: 'A fast, razor-sharp blade' },
  // a small prayer bonus is what makes the mace shape worth choosing at all — it is
  // the cleric's weapon rather than a strictly worse sword
  mace:  { name: 'Mace', icon: '🏏', slot: 'weapon', aim: 4, power: 6, speed: 5, pray: 1, bars: 1, off: 1, value: 18, examine: 'A heavy spiked mace — slower but it crushes, and it steadies a prayer' },
  axe:   { name: 'Axe', icon: '🪓', slot: 'weapon', aim: 3, power: 8, speed: 6, bars: 1, off: 2, value: 16, axe: true, examine: 'A weighty battle-axe — slow, but brutal' },
  // Pickaxes come in tiers like everything else. A better pick does not improve your
  // odds on a swing — it lets you swing more often (see Combat.toolInterval).
  pickaxe: { name: 'Pickaxe', icon: '⛏️', slot: 'weapon', aim: 2, power: 4, speed: 5, bars: 1, off: 2, value: 20, pick: true, examine: 'Used for mining. A heavier head bites more often' },
  helm:  { name: 'Medium Helmet', icon: '⛑️', slot: 'head', armour: 2, bars: 1, off: 3, value: 24, examine: 'A medium sized helmet' },
  chain: { name: 'Chain Mail Body', icon: '🦺', slot: 'body', armour: 5, bars: 3, off: 4, value: 60, examine: 'A series of connected metal rings' },
  kite:  { name: 'Kite Shield', icon: '🛡️', slot: 'shield', armour: 4, bars: 2, off: 5, value: 54, examine: 'A large metal shield' },
  platelegs: { name: 'Plate Legs', icon: '👖', slot: 'legs', armour: 6, bars: 3, off: 6, value: 64, examine: 'Heavy plated leg armour — it stops steel, but a spell cooks you inside it' }
};
const SMITHABLES = [];
for (const m of METALS) {
  for (const [sh, s] of Object.entries(SHAPES)) {
    const id = m.id + '_' + sh;
    ITEMS[id] = {
      name: m.name + ' ' + s.name, icon: s.icon, tint: m.tint,
      slot: s.slot, value: Math.round(s.value * m.valMult),
      examine: s.examine, wield: m.wield
    };
    if (s.aim) { ITEMS[id].aim = Math.round(s.aim * m.mult); ITEMS[id].power = Math.round(s.power * m.mult); }
    if (s.speed) ITEMS[id].speed = s.speed; // attack speed carries across every metal tier
    if (s.pray) ITEMS[id].pray = s.pray;    // so does the prayer bonus: a mace is a mace
    if (s.armour) { ITEMS[id].armour = Math.round(s.armour * m.mult); ITEMS[id].dclass = 'melee'; ITEMS[id].defReq = m.wield; } // metal armour is melee-class (weak to magic), gated by Defense
    if (s.axe) ITEMS[id].axe = true;
    if (s.pick) ITEMS[id].pick = true;
    SMITHABLES.push({ id, bar: m.id + '_bar', lvl: m.smith + s.off, bars: s.bars, xp: m.smithXp * s.bars });
  }
  // one bar -> 15 arrowheads of that metal
  SMITHABLES.push({ id: m.id + '_arrowheads', bar: m.id + '_bar', lvl: m.smith + 2, bars: 1, xp: m.smithXp, qty: 15 });
}

const SMELTS = [
  { bar: 'bronze_bar', name: 'Bronze bar', lvl: 1, xp: 12.5, needs: { copper_ore: 1, tin_ore: 1 } },
  { bar: 'iron_bar', name: 'Iron bar', lvl: 10, xp: 12.5, needs: { iron_ore: 1 }, fail: 0.5 },
  { bar: 'steel_bar', name: 'Steel bar', lvl: 20, xp: 17.5, needs: { iron_ore: 1, coal: 2 } },
  { bar: 'silver_bar', name: 'Silver bar', lvl: 20, xp: 13.7, needs: { silver_ore: 1 } },
  { bar: 'gold_bar', name: 'Gold bar', lvl: 40, xp: 22.5, needs: { gold_ore: 1 } },
  // The 4-and-6 coal costs are theirs, and they are the point: coal stops being a thing
  // you walk past at Mining 20 and becomes the bottleneck on the whole top of the ladder.
  { bar: 'mithril_bar', name: 'Mithril bar', lvl: 30, xp: 30, needs: { mithril_ore: 1, coal: 4 } },
  { bar: 'adamant_bar', name: 'Adamant bar', lvl: 40, xp: 37.5, needs: { adamantite_ore: 1, coal: 6 } }
];

// low/high = success weighting (out of 255) at level 1 and level 99, interpolated by
// Combat.gatherChance. A regular tree always falls on the first log; the bigger trees
// keep giving until a `deplete` roll fells them.
const TREE_DEFS = {
  tree:   { lvl: 1, xp: 25, deplete: 1, respawn: 15, log: 'logs', low: 100, high: 210 },
  oak:    { lvl: 15, xp: 37.5, deplete: 0.4, respawn: 22, log: 'oak_logs', low: 48, high: 160 },
  willow: { lvl: 30, xp: 62.5, deplete: 0.25, respawn: 28, log: 'willow_logs', low: 28, high: 130 },
  maple:  { lvl: 45, xp: 100, deplete: 0.2, respawn: 40, log: 'maple_logs', low: 18, high: 100 },
  yew:    { lvl: 60, xp: 175, deplete: 0.15, respawn: 60, log: 'yew_logs', low: 10, high: 72 }
};

// ---- Fletching ----
// knife on a log type -> choose a product
const FLETCH_KNIFE = {
  logs:     [{ id: 'arrow_shafts', qty: 15, lvl: 1, xp: 5 }, { id: 'shortbow_u', qty: 1, lvl: 5, xp: 10 }, { id: 'longbow_u', qty: 1, lvl: 10, xp: 15 }],
  oak_logs: [{ id: 'arrow_shafts', qty: 30, lvl: 15, xp: 12 }, { id: 'oak_longbow_u', qty: 1, lvl: 20, xp: 25 }],
  willow_logs: [{ id: 'arrow_shafts', qty: 45, lvl: 30, xp: 18 }, { id: 'willow_longbow_u', qty: 1, lvl: 35, xp: 42 }],
  maple_logs: [{ id: 'arrow_shafts', qty: 60, lvl: 45, xp: 24 }, { id: 'maple_longbow_u', qty: 1, lvl: 50, xp: 58 }],
  yew_logs: [{ id: 'arrow_shafts', qty: 75, lvl: 60, xp: 32 }, { id: 'yew_longbow_u', qty: 1, lvl: 65, xp: 75 }]
};
// bowstring on an unstrung bow -> finished bow
const FLETCH_STRING = {
  shortbow_u:    { id: 'shortbow', lvl: 5, xp: 10 },
  longbow_u:     { id: 'longbow', lvl: 10, xp: 15 },
  oak_longbow_u: { id: 'oak_longbow', lvl: 20, xp: 25 },
  willow_longbow_u: { id: 'willow_longbow', lvl: 35, xp: 42 },
  maple_longbow_u: { id: 'maple_longbow', lvl: 50, xp: 58 },
  yew_longbow_u: { id: 'yew_longbow', lvl: 65, xp: 75 }
};
// arrowhead -> arrow (needs matching headless arrows), 15 at a time
const FLETCH_ARROW = {
  bronze_arrowheads: { id: 'bronze_arrow', lvl: 1, xp: 12.5 },
  iron_arrowheads:   { id: 'iron_arrow', lvl: 15, xp: 37.5 },
  steel_arrowheads:  { id: 'steel_arrow', lvl: 30, xp: 75 },
  mithril_arrowheads: { id: 'mithril_arrow', lvl: 45, xp: 112.5 },
  adamant_arrowheads: { id: 'adamant_arrow', lvl: 60, xp: 150 }
};

// crafting: needle on leather -> leather armour
// ---- Runecraft ----
// Levels and xp are the originals'. `every` is how many levels between extra runes per
// essence: air doubles at 11, triples at 22 and so on, which is what stops the low
// altars becoming worthless the moment you can reach a better one.
const RUNE_ALTARS = [
  { rune: 'air',    lvl: 1,  xp: 5,   every: 11, pure: false },
  { rune: 'mind',   lvl: 2,  xp: 5.5, every: 14, pure: false },
  { rune: 'water',  lvl: 5,  xp: 6,   every: 19, pure: false },
  { rune: 'earth',  lvl: 9,  xp: 6.5, every: 26, pure: false },
  { rune: 'fire',   lvl: 14, xp: 7,   every: 35, pure: false },
  { rune: 'body',   lvl: 20, xp: 7.5, every: 46, pure: false },
  { rune: 'cosmic', lvl: 27, xp: 8,   every: 59, pure: true },
  { rune: 'chaos',  lvl: 35, xp: 8.5, every: 74, pure: true },
  { rune: 'nature', lvl: 44, xp: 9,   every: 91, pure: true },
  { rune: 'law',    lvl: 54, xp: 9.5, every: 99, pure: true },
  { rune: 'death',  lvl: 65, xp: 10,  every: 99, pure: true }
];
const ALTAR_BY_RUNE = RUNE_ALTARS.reduce((m, a) => { m[a.rune] = a; return m; }, {});
// how many runes one essence yields at this level
function runeYield(alt, level) { return 1 + Math.floor(Math.max(0, level - alt.lvl) / alt.every); }

// ---- Herblore ----
// grimy -> clean, then clean + vial of water -> unfinished, then + secondary -> potion
const HERBS = [
  { id: 'guam',        lvl: 3,  xp: 2.5 },
  { id: 'marrentill',  lvl: 5,  xp: 3.8 },
  { id: 'tarromin',    lvl: 11, xp: 5 },
  { id: 'harralander', lvl: 20, xp: 6.3 },
  { id: 'ranarr',      lvl: 25, xp: 7.5 },
  { id: 'irit',        lvl: 40, xp: 8.8 }
];
const HERB_BY_ID = HERBS.reduce((m, h) => { m[h.id] = h; return m; }, {});
const POTIONS = [
  { id: 'attack_potion',   herb: 'guam',        sec: 'eye_of_newt',     lvl: 3,  xp: 25 },
  { id: 'antipoison',      herb: 'marrentill',  sec: 'unicorn_dust',    lvl: 5,  xp: 37.5 },
  { id: 'strength_potion', herb: 'tarromin',    sec: 'limpwurt_root',   lvl: 12, xp: 50 },
  { id: 'restore_potion',  herb: 'harralander', sec: 'red_spider_eggs', lvl: 22, xp: 62.5 },
  { id: 'defence_potion',  herb: 'ranarr',      sec: 'white_berries',   lvl: 30, xp: 75 },
  { id: 'prayer_potion',   herb: 'ranarr',      sec: 'snape_grass',     lvl: 38, xp: 87.5 },
  { id: 'ranging_potion',  herb: 'irit',        sec: 'red_spider_eggs', lvl: 45, xp: 100 }
];
// unfinished-potion level is the finished level; the herb decides which unf you get
const UNF_BY_HERB = POTIONS.reduce((m, p) => { if (!m[p.herb]) m[p.herb] = p.id + '_unf'; return m; }, {});
const POTION_BY_UNF = POTIONS.reduce((m, p) => { (m[p.id + '_unf'] = m[p.id + '_unf'] || []).push(p); return m; }, {});
// things a pestle and mortar turns into a secondary
const GRINDABLES = { unicorn_horn: 'unicorn_dust' };

const CRAFTABLES = [
  { id: 'leather_coif', lvl: 1, leather: 1, xp: 13.5 },
  { id: 'leather_body', lvl: 3, leather: 1, xp: 25 },
  { id: 'leather_chaps', lvl: 7, leather: 1, xp: 27 },
  { id: 'hard_leather_body', lvl: 10, leather: 2, xp: 35 },
  { id: 'hard_leather_chaps', lvl: 14, leather: 2, xp: 42 },
  { id: 'studded_body', lvl: 20, leather: 2, extra: { steel_bar: 1 }, xp: 60 },
  { id: 'studded_chaps', lvl: 24, leather: 2, extra: { steel_bar: 1 }, xp: 55 },
  { id: 'green_dhide_body', lvl: 40, leather: 0, extra: { green_dragonhide: 3 }, xp: 186 },
  { id: 'green_dhide_chaps', lvl: 36, leather: 0, extra: { green_dragonhide: 2 }, xp: 124 }
];

// `stopBurn` is the Cooking level at which this stops burning ON A RANGE for good;
// an open fire is cruder, so it takes 5 more levels there (see Game.burnChance).
// Burn odds fall from burnBase at the unlock level to zero at stopBurn.
const COOKABLES = {
  raw_shrimp:    { cooked: 'shrimp', burnt: 'burnt_shrimp', lvl: 1, xp: 30, burnBase: 0.45, stopBurn: 24 },
  raw_anchovies: { cooked: 'anchovies', burnt: 'burnt_fish', lvl: 5, xp: 40, burnBase: 0.5, stopBurn: 30 },
  raw_trout:     { cooked: 'trout', burnt: 'burnt_fish', lvl: 15, xp: 70, burnBase: 0.55, stopBurn: 40 },
  raw_salmon:    { cooked: 'salmon', burnt: 'burnt_fish', lvl: 25, xp: 90, burnBase: 0.6, stopBurn: 52 }
};

// ---------------------------------------------------------------------------
// The spellbook. Laid out in the order it is drawn — reading order across a
// five-column grid, low levels first, exactly like the book it is modelled on.
//
//   kind: 'combat'  — pick a target, deal damage (`max` = maximum hit)
//         'curse'   — pick a target, sap one of its combat stats (`sap`)
//         'enchant' — cast on a gem-set item in your pack (`ench` = gem tier)
//         'alch'    — cast on an item in your pack, turn it to coins (`rate`)
//         'grab'    — cast on an item on the ground, pull it to you
//         'smelt'   — cast on ore in your pack, smelt it without a furnace
//
// `elem` and `tier` only drive the icon: element decides the colour, tier decides
// the ring around it, so the book reads at a glance the way the original does.
// ---------------------------------------------------------------------------
const SPELLS = [
  { id: 'wind_strike',  name: 'Wind Strike',  lvl: 1,  kind: 'combat', elem: 'air',   tier: 1, max: 2, xp: 5.5,  runes: { air_rune: 1, mind_rune: 1 } },
  { id: 'confuse',      name: 'Confuse',      lvl: 3,  kind: 'curse',  elem: 'curse', tier: 1, sap: 'att', pct: 0.05, xp: 13,  runes: { earth_rune: 2, water_rune: 3, body_rune: 1 } },
  { id: 'water_strike', name: 'Water Strike', lvl: 5,  kind: 'combat', elem: 'water', tier: 1, max: 3, xp: 7.5,  runes: { water_rune: 1, air_rune: 1, mind_rune: 1 } },
  { id: 'enchant1',     name: 'Lvl-1 Enchant',lvl: 7,  kind: 'enchant',elem: 'ench',  tier: 1, ench: 'sapphire', xp: 17.5, runes: { water_rune: 1, cosmic_rune: 1 } },
  { id: 'earth_strike', name: 'Earth Strike', lvl: 9,  kind: 'combat', elem: 'earth', tier: 1, max: 4, xp: 9.5,  runes: { earth_rune: 2, air_rune: 1, mind_rune: 1 } },
  { id: 'weaken',       name: 'Weaken',       lvl: 11, kind: 'curse',  elem: 'curse', tier: 2, sap: 'str', pct: 0.05, xp: 21,  runes: { earth_rune: 2, water_rune: 3, body_rune: 1 } },
  { id: 'fire_strike',  name: 'Fire Strike',  lvl: 13, kind: 'combat', elem: 'fire',  tier: 1, max: 5, xp: 11.5, runes: { fire_rune: 3, air_rune: 2, mind_rune: 1 } },
  { id: 'wind_bolt',    name: 'Wind Bolt',    lvl: 17, kind: 'combat', elem: 'air',   tier: 2, max: 6, xp: 13.5, runes: { air_rune: 2, chaos_rune: 1 } },
  { id: 'curse',        name: 'Curse',        lvl: 19, kind: 'curse',  elem: 'curse', tier: 3, sap: 'def', pct: 0.05, xp: 29,  runes: { earth_rune: 2, water_rune: 3, body_rune: 1 } },
  { id: 'low_alch',     name: 'Low Alchemy',  lvl: 21, kind: 'alch',   elem: 'alch',  tier: 1, rate: 0.6, xp: 31, runes: { fire_rune: 3, nature_rune: 1 } },
  { id: 'water_bolt',   name: 'Water Bolt',   lvl: 23, kind: 'combat', elem: 'water', tier: 2, max: 7, xp: 16.5, runes: { water_rune: 2, air_rune: 2, chaos_rune: 1 } },
  { id: 'enchant2',     name: 'Lvl-2 Enchant',lvl: 27, kind: 'enchant',elem: 'ench',  tier: 2, ench: 'emerald', xp: 37,  runes: { air_rune: 3, cosmic_rune: 1 } },
  { id: 'earth_bolt',   name: 'Earth Bolt',   lvl: 29, kind: 'combat', elem: 'earth', tier: 2, max: 8, xp: 19.5, runes: { earth_rune: 3, air_rune: 2, chaos_rune: 1 } },
  { id: 'telegrab',     name: 'Telekinetic Grab', lvl: 33, kind: 'grab', elem: 'grab', tier: 1, xp: 43, runes: { air_rune: 1, law_rune: 1 } },
  { id: 'fire_bolt',    name: 'Fire Bolt',    lvl: 35, kind: 'combat', elem: 'fire',  tier: 2, max: 9, xp: 22.5, runes: { fire_rune: 4, air_rune: 3, chaos_rune: 1 } },
  { id: 'wind_blast',   name: 'Wind Blast',   lvl: 41, kind: 'combat', elem: 'air',   tier: 3, max: 10, xp: 25.5, runes: { air_rune: 3, death_rune: 1 } },
  { id: 'superheat',    name: 'Superheat Item', lvl: 43, kind: 'smelt', elem: 'smelt', tier: 1, xp: 53, runes: { fire_rune: 4, nature_rune: 1 } },
  { id: 'water_blast',  name: 'Water Blast',  lvl: 47, kind: 'combat', elem: 'water', tier: 3, max: 11, xp: 28.5, runes: { water_rune: 3, air_rune: 3, death_rune: 1 } },
  { id: 'enchant3',     name: 'Lvl-3 Enchant',lvl: 49, kind: 'enchant',elem: 'ench',  tier: 3, ench: 'ruby',    xp: 59,  runes: { fire_rune: 5, cosmic_rune: 1 } },
  { id: 'earth_blast',  name: 'Earth Blast',  lvl: 53, kind: 'combat', elem: 'earth', tier: 3, max: 12, xp: 31.5, runes: { earth_rune: 4, air_rune: 3, death_rune: 1 } },
  { id: 'high_alch',    name: 'High Alchemy', lvl: 55, kind: 'alch',   elem: 'alch',  tier: 2, rate: 1.0, xp: 65, runes: { fire_rune: 5, nature_rune: 1 } },
  { id: 'enchant4',     name: 'Lvl-4 Enchant',lvl: 57, kind: 'enchant',elem: 'ench',  tier: 4, ench: 'diamond', xp: 67, runes: { earth_rune: 10, cosmic_rune: 1 } },
  { id: 'fire_blast',   name: 'Fire Blast',   lvl: 59, kind: 'combat', elem: 'fire',  tier: 3, max: 13, xp: 34.5, runes: { fire_rune: 5, air_rune: 4, death_rune: 1 } }
];

// ---- Crafting: cut gems, then set them ----
// A chisel turns an uncut stone into a gem; a mould and a bar turn that gem into
// something you can wear. Amulets are cast straight from the mould here — the
// real skill strings them with wool afterwards, which is a step too many for us.
const GEM_CUTS = {
  uncut_sapphire: { id: 'sapphire', lvl: 20, xp: 50 },
  uncut_emerald:  { id: 'emerald',  lvl: 27, xp: 67.5 },
  uncut_ruby:     { id: 'ruby',     lvl: 34, xp: 85 },
  uncut_diamond:  { id: 'diamond',  lvl: 43, xp: 107.5 }
};
const JEWELLERY = [
  { id: 'unblessed_symbol', bar: 'silver_bar', mould: 'symbol_mould', lvl: 16, xp: 50 },
  { id: 'gold_amulet',      bar: 'gold_bar',   mould: 'amulet_mould', lvl: 8,  xp: 30 },
  { id: 'sapphire_amulet',  bar: 'gold_bar',   mould: 'amulet_mould', gem: 'sapphire', lvl: 24, xp: 65 },
  { id: 'emerald_amulet',   bar: 'gold_bar',   mould: 'amulet_mould', gem: 'emerald',  lvl: 31, xp: 70 },
  { id: 'ruby_amulet',      bar: 'gold_bar',   mould: 'amulet_mould', gem: 'ruby',     lvl: 50, xp: 85 },
  { id: 'diamond_amulet',   bar: 'gold_bar',   mould: 'amulet_mould', gem: 'diamond',  lvl: 70, xp: 100 }
];
// what each enchantment turns a gem-set item into
const ENCHANTS = {
  sapphire_amulet: 'amulet_of_magic',
  emerald_amulet:  'amulet_of_defence',
  ruby_amulet:     'amulet_of_strength',
  diamond_amulet:  'amulet_of_power'
};

// Prayer, on the OSRS model. `drain` is a *drain effect*, not points: each tick the
// sum of active drain effects is added to a counter, and one prayer point is spent
// every time that counter passes the player's drain resistance (60 + 2 x prayer
// bonus). So +prayer-bonus gear genuinely stretches your points, and a prayer that
// is only on for the tick it matters costs almost nothing — see Game.tickPrayer.
// Prayers in the same `group` are mutually exclusive; turning one on turns its
// rivals off, exactly as the real prayer book does.
const PRAY_GROUPS = { att: 'Attack', str: 'Strength', def: 'Defence', rng: 'Ranged', mag: 'Magic', protect: 'Protection' };
const PRAYERS = [
  { id: 'thick_skin',      name: 'Thick Skin',          lvl: 1,  drain: 3,  group: 'def', boost: 'defense',  pct: 5 },
  { id: 'burst_strength',  name: 'Burst of Strength',   lvl: 4,  drain: 3,  group: 'str', boost: 'strength', pct: 5 },
  { id: 'clarity',         name: 'Clarity of Thought',  lvl: 7,  drain: 3,  group: 'att', boost: 'attack',   pct: 5 },
  { id: 'sharp_eye',       name: 'Sharp Eye',           lvl: 8,  drain: 3,  group: 'rng', boost: 'ranged',   pct: 5 },
  { id: 'mystic_will',     name: 'Mystic Will',         lvl: 9,  drain: 3,  group: 'mag', boost: 'magic',    pct: 5 },
  { id: 'rock_skin',       name: 'Rock Skin',           lvl: 10, drain: 6,  group: 'def', boost: 'defense',  pct: 10 },
  { id: 'superhuman',      name: 'Superhuman Strength', lvl: 13, drain: 6,  group: 'str', boost: 'strength', pct: 10 },
  { id: 'improved_ref',    name: 'Improved Reflexes',   lvl: 16, drain: 6,  group: 'att', boost: 'attack',   pct: 10 },
  { id: 'hawk_eye',        name: 'Hawk Eye',            lvl: 22, drain: 6,  group: 'rng', boost: 'ranged',   pct: 10 },
  { id: 'mystic_lore',     name: 'Mystic Lore',         lvl: 24, drain: 6,  group: 'mag', boost: 'magic',    pct: 10 },
  { id: 'steel_skin',      name: 'Steel Skin',          lvl: 28, drain: 12, group: 'def', boost: 'defense',  pct: 15 },
  { id: 'ultimate_str',    name: 'Ultimate Strength',   lvl: 31, drain: 12, group: 'str', boost: 'strength', pct: 15 },
  { id: 'incredible_ref',  name: 'Incredible Reflexes', lvl: 34, drain: 12, group: 'att', boost: 'attack',   pct: 15 },
  { id: 'protect_magic',   name: 'Protect from Magic',  lvl: 37, drain: 12, group: 'protect', protect: 'magic' },
  { id: 'protect_missiles',name: 'Protect from Missiles',lvl: 40,drain: 12, group: 'protect', protect: 'ranged' },
  { id: 'protect_melee',   name: 'Protect from Melee',  lvl: 43, drain: 12, group: 'protect', protect: 'melee' },
  { id: 'eagle_eye',       name: 'Eagle Eye',           lvl: 44, drain: 12, group: 'rng', boost: 'ranged',   pct: 15 },
  { id: 'mystic_might',    name: 'Mystic Might',        lvl: 45, drain: 12, group: 'mag', boost: 'magic',    pct: 15 }
];
// ---------------------------------------------------------------------------
// Emotes. `ms` is one cycle of the animation; `loop` emotes keep going until you
// move or do something else, one-shot emotes play once and stop.
//
// These exist to be *observed* — the Treasure Trails feature will ask "was the
// player doing X, standing at Y, wearing Z", so every emote is identified by a
// stable `id` and Game.doEmote reports the whole event in one place.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Dynamic events. Nobody hands these out and nobody accepts them: they start on a
// timer, everyone standing nearby is a participant, and the world changes whether
// you win or lose. One definition drives BOTH singleplayer and the server — see
// js/events.js, which is the only implementation of the rules.
//
// Scaling is deliberately inverted from the game this borrows the idea from:
// **solo-completable is the baseline** and extra players make it bigger, rather
// than a solo player simply being unable to finish.
// ---------------------------------------------------------------------------
const EVENT_DEFS = [
  {
    id: 'tide',
    name: 'The Tide Rises',
    blurb: 'Something under the flats is awake. Hold the Bone Font.',
    at: { x: 129, z: 80, layer: 0 },     // the Bone Font in Mourncross
    radius: 20,                          // you are a participant inside this
    // Scaling reads combat LEVEL, not head-count. `baseLevel` is the level the
    // numbers below are balanced for; `minLevel` is the floor to count at all, so
    // somebody too weak to help cannot make the event harder for the people who
    // are — the mistake Pest Control shipped and had to patch out (UPDATE_IDEAS §8).
    baseLevel: 30,
    minLevel: 20,
    // Scaling reads combat LEVEL, not head-count. baseLevel is the level the numbers
    // below are balanced for; minLevel is the floor to count at all, so somebody too
    // weak to help cannot make the event harder for the people who are (the mistake
    // Pest Control shipped and had to patch out — see UPDATE_IDEAS.md §8).
    baseLevel: 30,
    minLevel: 20,
    idleFor: [210, 420],                 // seconds between runs, randomised
    warnFor: 12,                         // grace period after the announcement
    waves: 3,
    // wave size = base + per * (participants - 1), capped. Solo faces 3/4/5.
    wave: { base: 3, per: 2, max: 16, growth: 1 },
    spawnRing: 11,                       // how far out of the Font they surface
    enemy: 'tide_wraith',
    boss: 'tide_herald',                 // joins the final wave
    // The Font is a clock, not a punching bag: it erodes faster the more of the
    // tide is still standing, so leaving enemies alive is what loses you the event.
    integrity: { base: 60, per: 25 },
    drainPerEnemy: 1.1,
    timeLimit: 330,
    cooldown: 200,
    reward: 'tide',
    xp: { prayer: 900, hits: 300 },
    // contribution thresholds, in multiples of one wraith's health, so they scale
    // with the enemy rather than needing hand-tuning
    tiers: [0.01, 3, 8]
  }
];
const EVENT_BY_ID = {};
for (const e of EVENT_DEFS) EVENT_BY_ID[e.id] = e;
const EVENT_TIER_NAME = ['', 'Bronze', 'Silver', 'Gold'];

const EMOTES = [
  { id: 'yes',       name: 'Yes',          ms: 900,  msg: 'You nod.' },
  { id: 'no',        name: 'No',           ms: 900,  msg: 'You shake your head.' },
  { id: 'bow',       name: 'Bow',          ms: 1200, msg: 'You bow.' },
  { id: 'angry',     name: 'Angry',        ms: 1200, loop: true, msg: 'You shake your fists in rage.' },
  { id: 'think',     name: 'Think',        ms: 1800, loop: true, msg: 'You stroke your chin thoughtfully.' },
  { id: 'wave',      name: 'Wave',         ms: 1200, msg: 'You wave.' },
  { id: 'shrug',     name: 'Shrug',        ms: 1100, msg: 'You shrug.' },
  { id: 'cheer',     name: 'Cheer',        ms: 1100, loop: true, msg: 'You cheer!' },
  { id: 'beckon',    name: 'Beckon',       ms: 1100, msg: 'You beckon.' },
  { id: 'laugh',     name: 'Laugh',        ms: 1200, loop: true, msg: 'You laugh.' },
  { id: 'jump',      name: 'Jump for Joy', ms: 900,  msg: 'You jump for joy.' },
  { id: 'yawn',      name: 'Yawn',         ms: 1600, msg: 'You yawn.' },
  { id: 'dance',     name: 'Dance',        ms: 1400, loop: true, msg: 'You dance.' },
  { id: 'jig',       name: 'Jig',          ms: 1200, loop: true, msg: 'You dance a jig.' },
  { id: 'spin',      name: 'Spin',         ms: 1100, msg: 'You spin around.' },
  { id: 'headbang',  name: 'Headbang',     ms: 1000, loop: true, msg: 'You headbang.' },
  { id: 'cry',       name: 'Cry',          ms: 1500, loop: true, msg: 'You burst into tears.' },
  { id: 'blow_kiss', name: 'Blow Kiss',    ms: 1300, msg: 'You blow a kiss.' },
  { id: 'panic',     name: 'Panic',        ms: 1100, loop: true, msg: 'You panic!' },
  { id: 'raspberry', name: 'Raspberry',    ms: 1200, msg: 'You blow a raspberry.' },
  { id: 'clap',      name: 'Clap',         ms: 1200, loop: true, msg: 'You clap.' },
  { id: 'salute',    name: 'Salute',       ms: 1300, msg: 'You salute.' }
];
const EMOTE_BY_ID = {};
for (const e of EMOTES) EMOTE_BY_ID[e.id] = e;

const SAP_NAME = { att: 'Attack', str: 'Strength', def: 'Defence' };
const SKILL_NAME = { attack: 'Attack', strength: 'Strength', defense: 'Defence', ranged: 'Ranged', magic: 'Magic' };
function prayerDesc(pr) {
  return pr.protect
    ? 'Turns aside every ' + pr.protect + ' attack while it is active'
    : SKILL_NAME[pr.boost] + ' +' + pr.pct + '%';
}

// Farming crops. `grow` is REAL minutes — a planted patch keeps growing while the
// game is closed, which is the whole point of the skill: you plant, go and do
// something else, and come back to a crop. Yield rises with your Farming level.
const CROPS = {
  potato_seed:  { name: 'Potatoes', crop: 'potato',  lvl: 1,  grow: 4,  plantXp: 8,  cropXp: 9,  yield: [3, 5] },
  onion_seed:   { name: 'Onions',   crop: 'onion',   lvl: 5,  grow: 6,  plantXp: 10, cropXp: 11, yield: [3, 5] },
  cabbage_seed: { name: 'Cabbages', crop: 'cabbage', lvl: 8,  grow: 8,  plantXp: 13, cropXp: 14, yield: [3, 6] },
  wheat_seed:   { name: 'Wheat',    crop: 'wheat',   lvl: 12, grow: 10, plantXp: 16, cropXp: 18, yield: [3, 6] }
};

// Which specialist would take an item off your hands. A shop with an `accepts` list
// buys only these categories; the general store has no list and so buys anything, which
// is exactly the split the original draws between a general store and a trade shop.
// Order matters: a staff is checked as magic before it is checked as a weapon, and
// leather is ranged armour before it is armour.
function shopCategory(id) {
  const d = ITEMS[id] || {};
  if (/_rune$/.test(id) || d.magic || d.dclass === 'magic') return 'magic';
  if (d.bow || d.dclass === 'ranged' || /arrow|bowstring|feather/.test(id)) return 'ranged';
  if (d.slot === 'weapon') return 'weapon';
  if (d.armour || ['head', 'body', 'legs', 'shield'].includes(d.slot)) return 'armour';
  return 'general';
}
const SHOP_CAT_NAME = { weapon: 'weapons', armour: 'armour', ranged: 'bows and arrows', magic: 'runes and robes', general: 'odds and ends' };

const SHOP_DEFS = {
  general: {
    name: 'General Store',
    // Runes, bows and wizard robes moved to the specialists at Chapman's Cross — a
    // general store selling every rune in the game left the magic shop nothing to be.
    stock: [
      ['net', 5], ['fishing_rod', 5], ['tinderbox', 5], ['hammer', 5], ['knife', 5], ['bronze_axe', 3], ['bronze_pickaxe', 3],
      ['bucket', 10], ['pot', 10],
      ['wooden_shield', 3], ['leather_body', 3],
      ['chisel', 5], ['amulet_mould', 3], ['symbol_mould', 3]
    ]
  },
  // ---- Chapman's Cross: the four trade shops on the southern highway ----
  chapman_weapon: {
    name: "Hollis' Blades", accepts: ['weapon'],
    stock: [
      ['bronze_sword', 6], ['iron_sword', 5], ['steel_sword', 3], ['mithril_sword', 1],
      ['bronze_mace', 5], ['iron_mace', 4], ['steel_mace', 2],
      ['bronze_axe', 4], ['iron_axe', 3], ['steel_axe', 2],
      ['bronze_pickaxe', 4], ['iron_pickaxe', 3], ['steel_pickaxe', 2]
    ]
  },
  chapman_armour: {
    name: 'The Ironmonger', accepts: ['armour'],
    stock: [
      ['bronze_helm', 6], ['iron_helm', 5], ['steel_helm', 3], ['mithril_helm', 1],
      ['bronze_chain', 5], ['iron_chain', 4], ['steel_chain', 2],
      ['bronze_kite', 5], ['iron_kite', 4], ['steel_kite', 2],
      ['bronze_platelegs', 4], ['iron_platelegs', 3], ['steel_platelegs', 2],
      ['wooden_shield', 5]
    ]
  },
  chapman_ranged: {
    name: 'The Fletcher\'s Rest', accepts: ['ranged'],
    stock: [
      ['shortbow', 5], ['longbow', 4], ['oak_longbow', 2], ['willow_longbow', 1],
      ['bronze_arrow', 500], ['iron_arrow', 350], ['steel_arrow', 200], ['mithril_arrow', 80],
      ['bowstring', 60], ['feather', 800],
      ['leather_coif', 4], ['leather_body', 4], ['hard_leather_body', 2],
      ['leather_chaps', 4], ['hard_leather_chaps', 2], ['leather', 25],
      ['studded_body', 2], ['studded_chaps', 2]
    ]
  },
  chapman_magic: {
    name: "Sabra's Runes", accepts: ['magic'],
    stock: [
      ['air_rune', 200], ['mind_rune', 200], ['water_rune', 150], ['earth_rune', 150], ['fire_rune', 150],
      ['body_rune', 120], ['chaos_rune', 80], ['nature_rune', 50], ['law_rune', 50], ['cosmic_rune', 50], ['death_rune', 30],
      ['magic_staff', 3], ['staff_of_water', 2], ['staff_of_earth', 2], ['staff_of_fire', 2],
      ['battlestaff', 1], ['wizard_hat', 4], ['wizard_robe', 4], ['wizard_skirt', 4]
    ]
  },
  weapon: {
    name: 'Aldervale Armoury',
    stock: [
      ['bronze_sword', 5], ['iron_sword', 5], ['steel_sword', 2],
      ['iron_mace', 5], ['steel_mace', 2],
      ['iron_helm', 5], ['steel_helm', 3],
      ['iron_kite', 3], ['steel_kite', 2],
      ['iron_chain', 2], ['steel_chain', 1],
      ['longbow', 3], ['oak_longbow', 2], ['iron_arrow', 300], ['steel_arrow', 150]
    ]
  },
  outfitter: {
    name: 'Southmarch Outfitters',
    stock: [
      ['cape_red', 10], ['cape_blue', 10], ['cape_green', 10], ['cape_black', 4],
      ['bronze_platelegs', 4], ['iron_platelegs', 3], ['steel_platelegs', 2],
      ['leather_chaps', 5], ['hard_leather_chaps', 3], ['wizard_skirt', 3],
      ['leather', 20], ['needle', 5]
    ]
  },
  // Marrow deals only in ecto-tokens, so this stock is bought with worship, not coin.
  // It is the only source of prayer-bonus gear in the province.
  herblore: {
    name: "Ilma's Apothecary", accepts: ['general'],
    stock: [
      ['vial', 60], ['pestle', 5], ['eye_of_newt', 80], ['snape_grass', 20],
      ['limpwurt_root', 15], ['white_berries', 10], ['red_spider_eggs', 10],
      ['grimy_guam', 25], ['grimy_marrentill', 15]
    ]
  },
  farm: {
    name: 'Green Vale Seed Store',
    stock: [
      ['rake', 5], ['potato_seed', 40], ['onion_seed', 30], ['cabbage_seed', 20], ['wheat_seed', 15],
      ['bucket', 5], ['pot', 5]
    ]
  },
  // stock rows here carry a third field: the price in the shop's own currency
  mourncross: {
    name: "Marrow's Rest",
    currency: 'ecto_token',
    stock: [
      ['holy_symbol', 2, 120], ['monk_top', 3, 90], ['monk_bottom', 3, 90], ['blessed_stole', 2, 150],
      ['pot', 20, 2], ['bucket', 20, 2]
    ]
  }
};

// `done` is the stage at which the quest counts as COMPLETE. Multi-stage quests run
// well past 2, so the quest log has to compare against this rather than assuming 2.
const QUEST_DEFS = {
  runemyst: { name: 'Rune Mysteries', done: 4, desc: 'A talisman turned up where no talisman should be. Archmage Sedris at the stone circle wants to know where it came from — and what you can do with it.' },
  druidic: { name: 'Druidic Ritual', done: 4, desc: 'Elder Faelin and her circle need four things gathered before the rite can be spoken. Do it and they will teach you what they know of herbs.' },
  lunch: { name: "The Guide's Lunch", done: 2, desc: 'Bob the Guide in the town square is famished. Bring him 3 cooked shrimp.' },
  rats:  { name: 'Rat Menace', done: 2, desc: 'The shopkeeper wants 5 giant rats in the south meadow dealt with.' },
  relic: { name: 'The Restless Dead', done: 2, desc: 'Father Aereck needs the Ancient Relic recovered from the dungeon beneath the ruin north-west of town.' },
  dwarf: { name: "The Dwarf's Request", done: 2, desc: 'Doric the dwarf, by the mine, needs 4 copper ore and 4 tin ore for his forge.' },
  furs:  { name: 'Fur Trader', done: 2, desc: 'The shopkeeper will pay for 3 bear furs. Bears prowl the western forest.' },
  cooksfeast: { name: "The Cook's Feast", done: 2, desc: "The castle cook is in a panic — the Duke's feast is tonight and he is out of ingredients. He needs an egg, a bucket of milk and a pot of flour. Green Vale Farm lies west of town: milk a cow, take an egg from the coop, and grind wheat at the windmill." },
  losttribe:  { name: 'The Lost Tribe', done: 4, desc: "Farmer Wend's brother Aldric wandered into the tunnels beneath the ruin and never returned. Descend the ladder north-west of town, seek him in the dark, and find out what became of him." },
  giants:     { name: 'The Rising Deep', done: 4, desc: "Chief Morrow says the drumming under the earth is HILL GIANTS, breaking up from sealed deep halls beneath the Hollow-folk's camp. West of the camp a boulder blocks the passage — it takes a Strength level of 20 to shift. Beyond it, end the giant chieftain Grukk. Requires: The Lost Tribe complete, Strength 20." },
  apprentice: { name: "The Artisan's Apprentice", done: 6, desc: "Thessaly the Artisan by the Lumbridge kitchen is looking for an apprentice. She'll teach you the trades — woodcutting, firemaking, mining, smithing, fishing, cooking and leatherworking — one lesson at a time, and reward you handsomely for learning. A perfect start for any adventurer." },
  magnetism:  { name: 'Animal Magnetism', done: 4, desc: "Ava Corrick tinkers in a workshop on Rookmoor, off the Southmarch road. Her lodestone research has gone badly wrong and every loose nail in the county leaps at her. Help her recover the Lodestone Core from the Warding Circle on the moor — the ward is held by five standing stones, and touching one turns its neighbours too. Reward: Crafting, Fletching & Ranged xp, and Ava's Satchel, a lodestone-lined pack that calls your loosed arrows home." },
  souls:      { name: 'The Weight of Souls', done: 7, desc: "Father Aereck cannot sleep. The Ancient Relic you brought him hums in the dark, and the graves behind his church have begun to shift. Take it to Sister Wenna in the Southmarch cathedral — she reads dead scripts — and follow the thing to wherever it is leaning. Requires: The Restless Dead complete." },
  combattut:  { name: 'Trial by Fire', done: 3, desc: "Sergeant Kaelen drills recruits at the training yard south of Lumbridge. He'll teach you ranged and magic combat — and the value of a SAFE SPOT: attack the penned goblins from outside the fence, where they can't reach you. Rewards: a bow, arrows, runes, and Ranged & Magic xp." }
};

const SCENERY_DEFS = {
  tree:         { name: 'Tree', block: true, examine: 'A leafy tree' },
  oak:          { name: 'Oak', block: true, examine: 'A grand old oak tree' },
  willow:       { name: 'Willow', block: true, examine: 'A weeping willow by the water' },
  maple:        { name: 'Maple', block: true, examine: 'A broad maple, red in the leaf' },
  yew:          { name: 'Yew', block: true, examine: 'An old yew. Bowyers would give an arm for it' },
  stump:        { name: 'Tree stump', block: true, examine: 'Someone has chopped this tree down' },
  // low/high as TREE_DEFS; `respawn` is the seconds the seam stays grey after an ore
  rock_copper:  { name: 'Copper rock', ore: 'copper_ore', lvl: 1, xp: 17.5, low: 90, high: 200, respawn: 6, block: true, examine: 'A rocky outcrop with a coppery tint' },
  rock_tin:     { name: 'Tin rock', ore: 'tin_ore', lvl: 1, xp: 17.5, low: 90, high: 200, respawn: 6, block: true, examine: 'A rocky outcrop with a silvery tint' },
  rock_iron:    { name: 'Iron rock', ore: 'iron_ore', lvl: 15, xp: 35, low: 42, high: 150, respawn: 10, block: true, examine: 'A rocky outcrop with a reddish tint' },
  rock_coal:    { name: 'Coal rock', ore: 'coal', lvl: 20, xp: 50, low: 22, high: 110, respawn: 30, block: true, examine: 'A rocky outcrop seamed with black' },
  rock_silver:  { name: 'Silver rock', ore: 'silver_ore', lvl: 20, xp: 40, low: 30, high: 130, respawn: 45, block: true, examine: 'A rocky outcrop with a bright white seam' },
  rock_gold:    { name: 'Gold rock', ore: 'gold_ore', lvl: 40, xp: 65, low: 14, high: 90, respawn: 90, block: true, examine: 'A rocky outcrop with a warm yellow seam' },
  rock_gem:     { name: 'Gem rock', gemRock: true, lvl: 30, xp: 65, low: 16, high: 95, respawn: 75, block: true, examine: 'Something glitters in the cracks of this rock' },
  // levels, xp and respawns are theirs: mithril 55/80/2min, adamantite 70/95/4min
  rock_mithril: { name: 'Mithril rock', ore: 'mithril_ore', lvl: 55, xp: 80, low: 10, high: 70, respawn: 120, block: true, examine: 'A rocky outcrop veined with dull blue' },
  rock_adamantite: { name: 'Adamantite rock', ore: 'adamantite_ore', lvl: 70, xp: 95, low: 6, high: 50, respawn: 240, block: true, examine: 'A rocky outcrop shot through with green' },
  rock_empty:   { name: 'Rock', block: true, examine: 'A mined-out rock' },
  fishing_spot: { name: 'Fishing spot', block: true, examine: 'I can see small fish shoaling in the water' },
  lure_spot:    { name: 'Fishing spot', block: true, examine: 'I can see river fish leaping here' },
  fire:         { name: 'Fire', block: false, examine: 'A warm crackling fire' },
  wall:         { name: 'Wall', block: true, examine: 'A well built wall' },
  rampart:      { name: 'Town wall', block: true, examine: 'A high crenellated wall guarding the town' },
  gatehouse:    { name: 'Gatehouse', block: true, examine: 'A fortified tower flanking the town gate' },
  shop_counter: { name: 'Counter', block: true, examine: 'A shop counter, worn smooth by trade' },
  shelves:      { name: 'Shelves', block: true, examine: 'Shelves stocked with wares' },
  stained_glass:{ name: 'Stained glass window', block: true, examine: 'A window of coloured glass, glowing with the light' },
  tower:        { name: 'Tower', block: true, examine: 'A tall castle tower' },
  fountain:     { name: 'Fountain', block: true, examine: 'A grand fountain, the pride of the town' },
  lamppost:     { name: 'Lamp post', block: true, examine: 'It lights the streets at dusk' },
  signpost:     { name: 'Signpost', block: true, examine: 'It points the way to the town square' },
  // Runecraft altars. One scenery type; `s.rune` says which, so the renderer tints a
  // single model rather than eleven near-identical ones being baked.
  rune_altar:   { name: 'Mysterious altar', block: true, examine: 'A standing stone cut with a rune you almost recognise' },
  // the essence mine: these never deplete, exactly as theirs do not
  essence_rock: { name: 'Rune essence', block: true, examine: 'Blank rock, and a great deal of it' },
  pure_rock:    { name: 'Pure essence', block: true, examine: 'Paler rock, deeper in. It rings when struck' },
  rune_rift:    { name: 'Mysterious ruin', block: true, examine: 'The air inside the arch is doing something the air outside is not' },
  herb_patch:   { name: 'Herb patch', examine: 'Something useful is growing here' },
  // Hanging trade signs, so you can tell the four shops apart from the street rather
  // than by walking into each one. Not blocking — they hang over the doorway.
  sign_weapon:  { name: 'Blades sign', examine: 'A painted sword on a hanging board: weapons bought and sold' },
  sign_armour:  { name: 'Ironmonger sign', examine: 'A painted helm on a hanging board: armour bought and sold' },
  sign_ranged:  { name: 'Fletcher sign', examine: 'A painted bow on a hanging board: bows, arrows and leather' },
  sign_magic:   { name: 'Rune sign', examine: 'A painted star on a hanging board: runes, staves and robes' },
  statue:       { name: 'Statue', block: true, examine: 'A statue of a long-forgotten hero of Aldervale' },
  stall:        { name: 'Market stall', block: true, examine: 'A colourful market stall' },
  well:         { name: 'Well', block: true, examine: 'A deep stone well' },
  bank_booth:   { name: 'Bank booth', block: true, examine: 'I can deposit my items here' },
  furnace:      { name: 'Furnace', block: true, examine: 'A red hot furnace' },
  anvil:        { name: 'Anvil', block: true, examine: 'Heavy metal' },
  range:        { name: 'Cooking range', block: true, examine: 'A hot well stoked range' },
  altar:        { name: 'Altar', block: true, examine: 'An altar to the gods' },
  ladder_down:  { name: 'Ladder', block: true, examine: 'It leads down into darkness' },
  ladder_up:    { name: 'Ladder', block: true, examine: 'It leads up to the light' },
  // ---- Green Vale Farm ----
  wheat:        { name: 'Wheat', block: false, examine: 'Ripe wheat, ready to be picked' },
  windmill:     { name: 'Windmill', block: true, examine: 'Its sails turn in the breeze. It grinds wheat into flour' },
  fence:        { name: 'Fence', block: true, examine: 'A wooden farm fence' },
  haystack:     { name: 'Haystack', block: true, examine: 'A big pile of hay' },
  chicken_coop: { name: 'Chicken coop', block: true, examine: 'The hens nest here. There may be an egg' },
  // ---- The Lost Tribe ----
  tribe_hut:    { name: 'Hide tent', block: true, examine: 'A tent of stitched hides — someone lives down here' },
  totem:        { name: 'Totem', block: true, examine: 'A totem of bone and stone, carved by the Hollow-folk' },
  // ---- The Rising Deep / guilds ----
  boulder:      { name: 'Boulder', block: true, examine: 'A massive boulder seals a passage. It would take great Strength to shift' },
  guild_door:   { name: 'Guild door', block: true, examine: 'The door to the Mining Guild. Only skilled miners may enter' },
  // ---- Southmarch & Rookmoor ----
  market_awning:{ name: 'Awning', block: true, examine: 'Striped canvas over a trader\'s pitch' },
  crate:        { name: 'Crate', block: true, examine: 'A stack of trade crates bound for the docks' },
  // ---- the southern highway ----
  milestone:    { name: 'Milestone', block: true, examine: 'A weathered stone cut with a number. Someone counted the miles so you need not' },
  shrine:       { name: 'Wayside shrine', block: true, examine: 'A little roadside shrine, its step worn smooth by kneeling travellers' },
  rubble:       { name: 'Rubble', block: true, examine: 'Fallen stone and charred beams. Something happened here, and long ago' },
  pylon:        { name: 'Standing stone', block: true, examine: 'A weathered menhir. Its face is either dark, or lit with a cold blue fire' },
  plinth:       { name: 'Warding plinth', block: true, examine: 'A stone plinth at the heart of the circle. Something heavy rests on it' },
  // ---- Mourncross ----
  bone_font:    { name: 'Bone Font', block: true, examine: 'A basin of grey water fed by something underneath. Offer it bonemeal and ectoplasm and it answers' },
  bone_font_dark:{ name: 'Bone Font (dark)', block: true, examine: 'The basin has gone grey and still. Whatever was answering has stopped' },
  bone_grinder: { name: 'Bone grinder', block: true, examine: 'A hand-cranked mill. It takes bones at the top and gives back meal at the bottom' },
  slime_pool:   { name: 'Ectoplasm pool', block: true, examine: 'Cold green slime wells up out of the ground here and never drains away' },
  sand_bank:    { name: 'Sand bank', block: true, examine: 'A bank of fine grey marsh sand' },
  grave:        { name: 'Grave', block: true, examine: 'A leaning headstone. The name has gone soft with rain' },
  dead_tree:    { name: 'Dead tree', block: true, examine: 'Bare, grey and still standing. Nothing has grown here in fifty years' },
  farm_patch:   { name: 'Allotment', examine: 'A patch of turned earth. Rake it clear, plant a seed, and give it time' },
  bell:         { name: 'Bell', block: true, examine: 'One of the four bells of Mourncross. It still rings true' },
  font_gate:    { name: 'Font gate', block: true, examine: 'An iron gate over the stair to the Font chamber. The funeral peal opens it' }
};

// drops: [itemId, min, max, chance]
// ---------------------------------------------------------------------------
// Shared drop sub-tables.
//
// A monster's `drops` are INDEPENDENT rolls — each one happens or doesn't, which is
// right for "always bones, usually some coins". Its `pick` entries are ONE-OF rolls:
// the chance decides whether the table is rolled at all, and if it is, exactly one
// row comes out, chosen by weight. That is how the real game structures loot (an
// n/128 chance to reach a table, then weights inside it), and it fixes a genuine
// oddity here — a highwayman used to roll four capes independently and could hand
// you three at once.
//
// Access chances are written as n/128 to keep the shape of the source obvious.
// ---------------------------------------------------------------------------
const DROP_TABLES = {
  // The herb table: one roll, weighted to the cheap end, shared by druids and by any
  // monster that carries herbs. Rarity here is what makes ranarr worth farming.
  herb: [
    ['grimy_guam', 1, 1, 32], ['grimy_marrentill', 1, 1, 24], ['grimy_tarromin', 1, 1, 18],
    ['grimy_harralander', 1, 1, 13], ['grimy_ranarr', 1, 1, 8], ['grimy_irit', 1, 1, 5]
  ],
  // druid secondaries — the other half of a potion
  druidic: [
    ['eye_of_newt', 3, 8, 30], ['limpwurt_root', 1, 2, 22], ['snape_grass', 1, 3, 18],
    ['red_spider_eggs', 1, 2, 14], ['white_berries', 1, 2, 10], ['unicorn_horn', 1, 1, 6]
  ],
  // Seeds come off monsters, not shops. This is what ties Farming to combat — before
  // this, seeds were purchasable only, and the skill had no reason to touch the rest
  // of the game.
  seed: [
    ['potato_seed', 1, 3, 40], ['onion_seed', 1, 3, 28],
    ['cabbage_seed', 1, 2, 20], ['wheat_seed', 1, 2, 12]
  ],
  // The rare table: what makes a mid-level kill occasionally worth stopping for.
  // Deliberately weighted toward materials, with a thin tail of finished steel.
  rare: [
    ['coins', 250, 700, 40], ['coal', 2, 6, 20], ['steel_bar', 1, 2, 12],
    ['iron_bar', 2, 4, 7], ['steel_kite', 1, 1, 5], ['steel_chain', 1, 1, 4],
    ['steel_platelegs', 1, 1, 2], ['dragon_bones', 1, 1, 1],
    // the gem tail: a thin, exciting reason to keep killing things once Crafting
    // and Magic can turn a stone into an enchanted amulet
    ['uncut_sapphire', 1, 1, 5], ['uncut_emerald', 1, 1, 3], ['uncut_ruby', 1, 1, 1]
  ],
  // one cape, not four
  cape: [['cape_red', 1, 1, 30], ['cape_blue', 1, 1, 30], ['cape_green', 1, 1, 30],
         ['cape_black', 1, 1, 8], ['highwayman_cloak', 1, 1, 2]],
  // one piece of a wizard's kit
  wizard: [['wizard_hat', 1, 1, 40], ['wizard_robe', 1, 1, 34], ['wizard_skirt', 1, 1, 20], ['magic_staff', 1, 1, 6]],
  // ---- the dynamic-event reward table ----
  // Rolled once per contribution tier earned (bronze 1, silver 2, gold 3), and
  // reachable NO other way — no shop, no standing monster, no skill. The tail is
  // thin on purpose: the blade is a chase item, the bones and tokens are the
  // reliable reason to keep turning up.
  tide: [
    ['drowned_bones', 1, 2, 30], ['ecto_token', 20, 40, 22], ['coins', 400, 900, 18],
    ['wraith_essence', 2, 4, 12], ['tideglass_amulet', 1, 1, 7], ['fontwardens_cape', 1, 1, 5],
    ['tideforged_kite', 1, 1, 4], ['tideforged_blade', 1, 1, 2]
  ]
};

const NPC_DEFS = {
  rat:        { name: 'Giant rat', hits: 5, att: 2, str: 2, def: 2, attackable: true, wander: 4, respawn: 20, drops: [['bones', 1, 1, 1]], examine: 'Overgrown vermin' },
  goblin:     { name: 'Goblin', hits: 8, att: 4, str: 4, def: 4, speed: 4, attackable: true, wander: 5, respawn: 25, cstyle: 'melee', carmour: 'melee',
                drops: [['bones', 1, 1, 1], ['coins', 2, 12, 0.6], ['water_rune', 1, 2, 0.15]],
                pick: [{ chance: 12 / 128, table: 'seed' }], examine: 'An ugly green creature in scrap armour' },
  bear:       { name: 'Bear', hits: 25, att: 10, str: 12, def: 9, speed: 5, attackable: true, wander: 4, respawn: 40, aggro: 2,
                drops: [['bones', 1, 1, 1], ['fur', 1, 2, 1], ['coins', 5, 35, 0.5]],
                pick: [{ chance: 14 / 128, table: 'seed' }], examine: 'Eek! A bear!' },
  guide:      { name: 'Bob the Guide', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 2, respawn: 20, drops: [], examine: 'He looks like he knows a thing or two' },
  banker:     { name: 'Banker', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [], examine: 'He can look after my money' },
  shopkeeper: { name: 'Shopkeeper', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [], trade: 'general', examine: 'He sells a bit of everything' },
  weaponsmith:{ name: 'Weaponsmith', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 1, respawn: 20, drops: [], trade: 'weapon', examine: 'She forges the finest arms in Aldervale' },
  bartender:  { name: 'Barkeep', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [],
                chatter: ['Welcome to the Silver Stag!', 'Adventuring is thirsty work, eh?', 'Best ale this side of the river.'], examine: 'The keeper of the tavern' },
  townsman:   { name: 'Townsman', hits: 8, att: 1, str: 1, def: 1, attackable: false, wander: 5, respawn: 20, drops: [],
                chatter: ['Fine day, isn’t it?', 'The guards keep us safe from goblins.', 'Have you seen the dragon in the old dungeon?', 'The armoury sells good steel.', 'Off to the market, are you?'], examine: 'A local townsperson' },
  townswoman: { name: 'Townswoman', hits: 8, att: 1, str: 1, def: 1, attackable: false, wander: 5, respawn: 20, drops: [], dress: true,
                chatter: ['Lovely weather for a stroll.', 'Mind the bears in the western woods.', 'My husband works the mine.', 'The fountain down south is beautiful.', 'Welcome to Aldervale!'], examine: 'A local townsperson' },
  guard:      { name: 'Town Guard', hits: 22, att: 14, str: 14, def: 14, speed: 5, attackable: true, wander: 4, respawn: 30, cstyle: 'melee', carmour: 'melee',
                drops: [['coins', 10, 50, 0.9], ['bones', 1, 1, 1], ['steel_arrow', 2, 6, 0.3]],
                pick: [{ chance: 10 / 128, table: 'seed' }, { chance: 2 / 128, table: 'rare' }], examine: 'He keeps the peace in Aldervale, clad in steel' },
  priest:     { name: 'Father Aereck', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 1, respawn: 20, drops: [], examine: 'A servant of the gods' },
  doric:      { name: 'Doric', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 1, respawn: 20, drops: [], examine: 'A dwarven smith with a mighty beard' },
  skeleton:   { name: 'Skeleton', hits: 15, att: 8, str: 8, def: 8, speed: 5, attackable: true, wander: 3, respawn: 30, aggro: 4, cstyle: 'melee', carmour: 'melee',
                drops: [['bones', 1, 1, 1], ['coins', 5, 30, 0.7], ['mind_rune', 1, 3, 0.3], ['air_rune', 2, 6, 0.3]],
                pick: [{ chance: 1 / 128, table: 'rare' }], examine: 'The undead recoil from magic' },
  zombie:     { name: 'Zombie', hits: 20, att: 10, str: 10, def: 10, speed: 6, attackable: true, wander: 3, respawn: 35, aggro: 4, cstyle: 'melee', carmour: 'melee',
                drops: [['bones', 1, 1, 1], ['coins', 10, 40, 0.7], ['fire_rune', 1, 4, 0.25], ['earth_rune', 1, 4, 0.25]],
                pick: [{ chance: 2 / 128, table: 'rare' }], examine: 'The living dead, warded only against steel' },
  hobgoblin:  { name: 'Hobgoblin', hits: 30, att: 18, str: 20, def: 16, speed: 5, attackable: true, wander: 3, respawn: 40, aggro: 4, cstyle: 'melee', carmour: 'magic',
                drops: [['bones', 1, 1, 1], ['coins', 10, 60, 0.8], ['iron_ore', 1, 1, 0.4], ['coal', 1, 2, 0.25], ['fire_rune', 2, 5, 0.2]],
                pick: [{ chance: 12 / 128, table: 'herb' }, { chance: 18 / 128, table: 'seed' }, { chance: 4 / 128, table: 'rare' }], examine: 'A large brute in tattered robes — arrows find the gaps' },
  ghost:      { name: 'Ghost', hits: 35, att: 20, str: 25, def: 20, speed: 5, attackable: true, wander: 3, respawn: 45, aggro: 5, cstyle: 'magic', carmour: 'ranged',
                drops: [['air_rune', 3, 8, 0.5], ['mind_rune', 3, 8, 0.5], ['earth_rune', 2, 6, 0.3], ['coins', 20, 80, 0.5]],
                pick: [{ chance: 10 / 128, table: 'herb' }, { chance: 3 / 128, table: 'rare' }], examine: 'A wraith that hurls spectral bolts, but a blade still bites it' },
  dragon:     { name: 'Green Dragon', hits: 80, att: 30, str: 35, def: 25, speed: 5, attackable: true, wander: 2, respawn: 120, aggro: 3, cstyle: 'ranged', carmour: 'ranged',
                ranged: true, maxRange: 5, boss: true, relentless: true,
                drops: [['dragon_bones', 1, 1, 1], ['coins', 200, 600, 1], ['fire_rune', 10, 30, 0.85], ['dragon_sword', 1, 1, 0.15],
                        ['mithril_ore', 1, 2, 0.22], ['coal', 3, 6, 0.35], ['green_dragonhide', 1, 1, 1]],
                pick: [{ chance: 0.25, table: 'rare' }],
                examine: 'A fearsome dragon — its hide shrugs off spells, so close in with a blade' },
  // ---- Green Vale Farm ----
  farmer:     { name: 'Farmer Wend', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 2, respawn: 20, drops: [], trade: 'farm', examine: 'A weathered farmer with worry in his eyes. He sells seed by the handful' },
  cook:       { name: 'The Cook', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [], examine: 'He runs the castle kitchen, and today he is sweating' },
  cow:        { name: 'Cow', hits: 8, att: 1, str: 1, def: 2, attackable: true, wander: 3, respawn: 25, milk: true,
                drops: [['bones', 1, 1, 1], ['leather', 1, 1, 0.85], ['fur', 1, 1, 0.3]], chatter: ['Moo.', 'Moooo.'], examine: 'A docile dairy cow. It could be milked' },
  artisan:    { name: 'Thessaly the Artisan', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 1, respawn: 20, drops: [], examine: 'A master of every trade, and a patient teacher' },
  instructor: { name: 'Sergeant Kaelen', hits: 30, att: 14, str: 14, def: 14, attackable: false, wander: 0, respawn: 20, drops: [], examine: 'A grizzled sergeant who drills recruits in the art of war' },
  pen_goblin: { name: 'Penned Goblin', hits: 12, att: 6, str: 6, def: 4, attackable: true, wander: 0, respawn: 8, aggro: 7, relentless: true,
                drops: [['bones', 1, 1, 1]], examine: 'A goblin caged for target practice. Best struck from beyond its reach' },
  chicken:    { name: 'Chicken', hits: 3, att: 1, str: 1, def: 1, attackable: true, wander: 4, respawn: 20, scale: 0.5,
                drops: [['bones', 1, 1, 1], ['feather', 5, 15, 1]], chatter: ['Cluck.', 'Bwaaak!'], examine: 'A plump farmyard hen' },
  // ---- The Lost Tribe ----
  tribe_chief:{ name: 'Chief Morrow', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 1, respawn: 20, drops: [], examine: 'Leader of the Hollow-folk, ancient of eye' },
  farmhand:   { name: 'Aldric', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 1, respawn: 20, drops: [], examine: "Farmer Wend's lost brother, alive after all" },
  tribesman:  { name: 'Hollow-folk', hits: 12, att: 1, str: 1, def: 1, attackable: false, wander: 3, respawn: 20, drops: [],
                chatter: ['We do not go to the surface. Not anymore.', 'The great green wyrm drove us under, long ago.', 'You smell of sunlight, stranger.', 'The drumming... the giants come.'], examine: 'One of a tribe that has lived underground for generations' },
  // ---- The Rising Deep ----
  hill_giant: { name: 'Hill Giant', hits: 45, att: 22, str: 26, def: 18, speed: 6, attackable: true, wander: 3, respawn: 45, aggro: 3,
                drops: [['big_bones', 1, 1, 1], ['coins', 20, 90, 0.8], ['iron_ore', 1, 2, 0.3], ['coal', 1, 4, 0.35], ['steel_arrow', 3, 8, 0.2],
                        ['mithril_ore', 1, 1, 0.05]],
                pick: [{ chance: 14 / 128, table: 'herb' }, { chance: 18 / 128, table: 'seed' }, { chance: 6 / 128, table: 'rare' }], examine: 'A towering brute risen from the deep halls' },
  // ---- Southmarch (southern province) & the Rookmoor road ----
  // level 13: a real threat to someone fresh off the training yard, not a wall.
  // `leash` keeps them on their stretch of road — they will not follow you to town.
  highwayman: { name: 'Highwayman', hits: 22, att: 11, str: 11, def: 9, speed: 4, attackable: true, wander: 4, respawn: 35, aggro: 3, leash: 7, cstyle: 'melee', carmour: 'ranged',
                drops: [['bones', 1, 1, 1], ['coins', 20, 80, 0.9], ['leather', 1, 2, 0.3], ['iron_arrow', 4, 12, 0.25]],
                pick: [{ chance: 0.42, table: 'cape' }, { chance: 18 / 128, table: 'seed' }, { chance: 2 / 128, table: 'rare' }],
                examine: 'A masked road-agent in a heavy riding cloak. Leather turns arrows — bring a blade' },
  // dark wizards keep the stone circle on the moor — they CAST, so they shred plate
  // and get shredded by arrows: the triangle made visible on the roadside
  dark_wizard:{ name: 'Dark Wizard', hits: 30, att: 20, str: 16, def: 12, speed: 5, attackable: true, wander: 2, respawn: 40, aggro: 4, leash: 6, cstyle: 'magic', carmour: 'magic',
                drops: [['bones', 1, 1, 1], ['coins', 15, 70, 0.8], ['air_rune', 3, 9, 0.4], ['mind_rune', 3, 9, 0.4], ['fire_rune', 2, 6, 0.3],
                        ['earth_rune', 2, 6, 0.3]],
                pick: [{ chance: 0.16, table: 'wizard' }, { chance: 3 / 128, table: 'rare' }],
                examine: 'A robed figure muttering at the stones. Robes turn arrows poorly — but a blade fares worse than a bow here' },
  innkeeper:  { name: 'Hetty the Innkeep', hits: 12, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [], dress: true,
                chatter: ['Rest your feet, traveller.', 'Road south is long. Eat something.', 'Highwaymen on the downs again, I hear.'], examine: 'She keeps the only bed between the two cities' },
  villager:   { name: 'Villager', hits: 8, att: 1, str: 1, def: 1, attackable: false, wander: 4, respawn: 20, drops: [],
                chatter: ['Willowmere keeps to itself.', 'The willows drink from the mere. So do we.', 'Wizards up at the stones again. Best not look.', "Don't take the road after dark.", 'Fish are biting in the mere.'], examine: 'A quiet soul from the village by the water' },
  outfitter:  { name: 'Marda the Outfitter', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [], trade: 'outfitter', dress: true, examine: 'She cuts capes and legwear for half the county' },
  // ---- Chapman's Cross traders ----
  bladesmith: { name: 'Hollis the Bladesmith', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [], trade: 'chapman_weapon',
                examine: 'Forearms like hams, and an opinion about every blade on the wall' },
  ironmonger: { name: 'Ida the Ironmonger', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [], trade: 'chapman_armour', dress: true,
                examine: 'She sells plate by weight and will not be haggled with' },
  fletcher:   { name: 'Rell the Fletcher', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 1, respawn: 20, drops: [], trade: 'chapman_ranged',
                examine: 'Goose feathers behind both ears, and a shaft half-cut in his hand' },
  runeseller: { name: 'Sabra the Rune-seller', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [], trade: 'chapman_magic', dress: true,
                examine: 'She keeps the death runes under the counter, and counts them twice' },
  // ---- the druid order at the stone circle ----
  druid:      { name: 'Druid', hits: 30, att: 16, str: 16, def: 14, speed: 5, attackable: true, wander: 3, respawn: 35, cstyle: 'magic', carmour: 'magic',
                drops: [['bones', 1, 1, 1], ['coins', 20, 90, 0.7], ['vial', 1, 2, 0.3]],
                pick: [{ chance: 0.75, table: 'herb' }, { chance: 0.5, table: 'druidic' }],
                examine: 'A robed keeper of the old rites. They mix what they gather' },
  chaos_druid:{ name: 'Chaos Druid', hits: 42, att: 24, str: 22, def: 18, speed: 5, attackable: true, wander: 3, respawn: 45, aggro: 4, cstyle: 'magic', carmour: 'magic',
                drops: [['bones', 1, 1, 1], ['coins', 60, 200, 0.85], ['vial', 1, 3, 0.4], ['chaos_rune', 3, 9, 0.35]],
                pick: [{ chance: 1, table: 'herb' }, { chance: 0.8, table: 'druidic' }, { chance: 6 / 128, table: 'rare' }],
                examine: 'A druid who went looking for the older rites, and found them' },
  // the quest-givers for the two new skills
  archmage:   { name: 'Archmage Sedris', hits: 12, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [],
                examine: 'She has the look of someone who has read too much and slept too little' },
  druid_elder:{ name: 'Elder Faelin', hits: 12, att: 1, str: 1, def: 1, attackable: false, wander: 1, respawn: 20, drops: [], dress: true,
                examine: 'The eldest of the circle. She smells of crushed leaves' },
  apothecary: { name: 'Ilma the Apothecary', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [], trade: 'herblore', dress: true,
                examine: 'Her shelves rattle with things in glass' },
  marshal:    { name: 'Marshal Ivery', hits: 26, att: 16, str: 16, def: 16, attackable: false, wander: 1, respawn: 20, drops: [],
                chatter: ['The north road is thick with highwaymen. Travel armed.', 'Southmarch keeps its gates open — and its walls high.', 'Bounty on road-agents, if you have the stomach for it.'], examine: 'She commands the Southmarch watch' },
  ava:        { name: 'Ava Corrick', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [], dress: true, examine: 'A tinker ringed with nails, buckles and horseshoes that will not fall off her' },
  grukk:      { name: 'Grukk, Giant Chieftain', hits: 95, att: 30, str: 36, def: 26, speed: 6, attackable: true, wander: 2, respawn: 220, aggro: 4, boss: true, relentless: true, cstyle: 'melee', carmour: 'melee',
                drops: [['big_bones', 2, 3, 1], ['giant_totem', 1, 1, 1], ['coins', 300, 800, 1], ['coal', 5, 12, 0.8],
                        ['steel_bar', 1, 3, 0.5], ['dragon_bones', 1, 1, 0.2],
                        ['mithril_bar', 1, 1, 0.12], ['adamantite_ore', 1, 1, 0.06]],
                pick: [{ chance: 0.6, table: 'rare' }, { chance: 0.35, table: 'seed' }], examine: 'Chieftain of the hill giants, and the source of the drumming' },

  // ---- Mourncross, the drowned town east of the river ----
  // `ghostly` NPCs speak only to someone wearing the Ghostspeak Amulet. Without it
  // their chatter comes out as noise (see Game.ghostBabble) and they will not talk.
  wenna:      { name: 'Sister Wenna', hits: 10, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [], dress: true,
                chatter: ['Every script leaves a bruise on the page.', 'Bring me the strange ones. The plain ones bore me.'],
                examine: 'The cathedral loremaster. She reads dead languages for pleasure' },
  ghost_warden:{ name: 'Warden Halloran', hits: 12, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [], ghostly: true,
                chatter: ['Fifty years I have kept the gate. Nobody has come through it.'],
                examine: 'He was the gate-warden. He is still, in every sense, on duty' },
  ghost_sexton:{ name: 'Sexton Pike', hits: 12, att: 1, str: 1, def: 1, attackable: false, wander: 1, respawn: 20, drops: [], ghostly: true,
                chatter: ['I dug every grave in this yard. Including one.', 'The bells. Always the bells.'],
                examine: 'He buried the whole town, and then had nobody left to bury him' },
  ghost_chandler:{ name: 'Chandler Ives', hits: 12, att: 1, str: 1, def: 1, attackable: false, wander: 1, respawn: 20, drops: [], ghostly: true,
                chatter: ['Cold wicks. Cold hands. Cold trade.', 'I made the candles for the funeral. All of them.'],
                examine: 'He made the town its candles, and lit the last of them himself' },
  ghost_child:{ name: 'Nell', hits: 8, att: 1, str: 1, def: 1, attackable: false, wander: 3, respawn: 20, drops: [], ghostly: true, scale: 0.68,
                chatter: ['Nobody plays any more.', 'I remember the bells. I was counting.'],
                examine: 'She is small, and she has been small for fifty years' },
  ghost_disciple:{ name: 'Disciple of the Font', hits: 12, att: 1, str: 1, def: 1, attackable: false, wander: 2, respawn: 20, drops: [], ghostly: true,
                chatter: ['Feed the Font and it feeds you.', 'Bone and ectoplasm. That is the whole of the rite.'],
                examine: 'A ghost who tends the Bone Font, and pays in tokens for the help' },
  ghost_trader:{ name: 'Marrow the Trader', hits: 12, att: 1, str: 1, def: 1, attackable: false, wander: 0, respawn: 20, drops: [], ghostly: true, trade: 'mourncross',
                chatter: ['I do not take coin. Coin is for the living.'],
                examine: 'He kept the town shop, and keeps it still. He deals only in ecto-tokens' },
  // the marsh is the one place in the province where you have to fight things that
  // ignore armour class entirely — wraiths are drawn to warmth and hit with cold
  marsh_wraith:{ name: 'Marsh Wraith', hits: 40, att: 24, str: 22, def: 18, speed: 5, attackable: true, wander: 3, respawn: 40, aggro: 4, leash: 10,
                cstyle: 'magic', carmour: 'ranged', ghostly: true,
                drops: [['grave_silk', 1, 1, 0.5], ['wraith_essence', 1, 1, 0.35], ['coins', 30, 110, 0.6],
                        ['ecto_token', 2, 6, 0.4], ['air_rune', 4, 10, 0.35], ['mind_rune', 4, 10, 0.35]],
                pick: [{ chance: 12 / 128, table: 'herb' }, { chance: 5 / 128, table: 'rare' }],
                examine: 'A cold shape that never finished dying. It strikes with the mind — arrows serve you best' },
  // ---- dynamic-event spawns. `temp` means they are removed when they die rather
  // than respawning on a timer — the event owns their whole lifetime. ----
  tide_wraith:{ name: 'Tide Wraith', hits: 45, att: 26, str: 24, def: 20, speed: 5, attackable: true, wander: 2, respawn: 9999, aggro: 6, leash: 20, relentless: true,
                cstyle: 'magic', carmour: 'ranged', ghostly: true, temp: true,
                drops: [['ecto_token', 1, 4, 0.5], ['coins', 40, 120, 0.5], ['wraith_essence', 1, 1, 0.15]],
                examine: 'The flats have coughed this one up whole. It is heading for the Font' },
  tide_herald:{ name: 'Herald of the Tide', hits: 75, att: 32, str: 30, def: 26, speed: 5, attackable: true, wander: 1, respawn: 9999, aggro: 7, leash: 20, relentless: true,
                cstyle: 'magic', carmour: 'magic', ghostly: true, temp: true, boss: true,
                drops: [['ecto_token', 10, 25, 1], ['drowned_bones', 1, 2, 0.5], ['wraith_essence', 1, 3, 0.6], ['coins', 150, 400, 1],
                        ['mithril_ore', 1, 2, 0.25]],
                examine: 'Whatever is out there under the flats, this is the part of it that surfaced' },
  tallyman:   { name: 'The Tallyman', hits: 110, att: 34, str: 34, def: 28, speed: 5, attackable: true, wander: 1, respawn: 300, aggro: 5, boss: true, relentless: true,
                cstyle: 'magic', carmour: 'magic', ghostly: true,
                drops: [['ecto_token', 60, 90, 1], ['wraith_essence', 2, 4, 1], ['coins', 300, 700, 1], ['dragon_bones', 1, 1, 0.25], ['holy_symbol', 1, 1, 0.25],
                        ['coal', 3, 8, 0.55], ['adamantite_ore', 1, 2, 0.18], ['adamant_bar', 1, 1, 0.05]],
                pick: [{ chance: 0.5, table: 'rare' }],
                examine: 'It came when the town called, and it has been counting ever since. It casts — so bring a bow, not a blade' }
};
