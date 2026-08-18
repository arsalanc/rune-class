'use strict';
// Loads the *browser* data.js, world.js and sim.js verbatim in a Node VM context so
// the server, the browser P2P host and every client share one source of truth. The
// files are never modified for Node — they keep working from file:// unchanged.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'js');
const EXPORTS = [
  'XP_FOR_LEVEL', 'levelForXp', 'SKILLS', 'COMBAT_STYLES', 'ITEMS', 'METALS', 'SHAPES',
  'SMITHABLES', 'SMELTS', 'TREE_DEFS', 'COOKABLES', 'SPELLS', 'PRAYERS', 'SHOP_DEFS', 'shopCategory', 'SHOP_CAT_NAME', 'RUNE_ALTARS', 'ALTAR_BY_RUNE', 'runeYield', 'HERBS', 'HERB_BY_ID', 'POTIONS', 'UNF_BY_HERB', 'POTION_BY_UNF', 'GRINDABLES',
  'QUEST_DEFS', 'SCENERY_DEFS', 'NPC_DEFS', 'WALKABLE', 'World', 'mulberry32', 'makeNoise', 'Combat', 'CROPS', 'DROP_TABLES', 'GEM_CUTS', 'JEWELLERY', 'ENCHANTS', 'SAP_NAME', 'EMOTES', 'EMOTE_BY_ID', 'Events', 'EVENT_DEFS', 'EVENT_BY_ID', 'EVENT_TIER_NAME',
  'Sim'
];

// Concatenate so every top-level `const` lives in one lexical scope, then an epilogue
// (same script) copies them onto the context via `var` (which attaches to the sandbox).
const code = ['data.js', 'combat.js', 'events.js', 'world.js', 'sim.js']
  .map(f => fs.readFileSync(path.join(dir, f), 'utf8'))
  .join('\n\n')
  + '\nvar __rc = { ' + EXPORTS.join(', ') + ' };';

const ctx = vm.createContext({ Math, JSON, console, performance: { now: () => Date.now() } });
vm.runInContext(code, ctx, { filename: 'shared-bundle.js' });
module.exports = ctx.__rc;
