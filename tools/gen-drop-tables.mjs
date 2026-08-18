// Regenerates the mechanical half of DROP_TABLES.md straight from the game data, so
// the document cannot drift from what the game actually rolls. Rewrites only the
// block between the GENERATED markers; the hand-written analysis above is untouched.
//
//   node gendoc.mjs        (from anywhere; paths are absolute)
import fs from 'fs';
const ROOT = 'D:/projects/rune-classic';
process.chdir(ROOT);
const S = await import('file:///D:/projects/rune-classic/server/shared.js').then(m => m.default || m);
const { NPC_DEFS, ITEMS, Combat, DROP_TABLES } = S;

const N = 300000;
const lvl = d => Math.max(1, Math.floor((d.att + d.str + d.def + d.hits) / 4));
const nm = id => (ITEMS[id] ? ITEMS[id].name : id);
const pct = x => (x * 100 < 1 ? (x * 100).toFixed(2) : (x * 100).toFixed(x * 100 < 10 ? 1 : 0)) + '%';
const qty = (mn, mx) => (mn === mx ? String(mn) : mn + '\u2013' + mx);

let out = '';
const w = s => { out += s + '\n'; };

w('## Shared sub-tables\n');
for (const [name, list] of Object.entries(DROP_TABLES)) {
  const total = list.reduce((a, r) => a + r[3], 0);
  const users = Object.entries(NPC_DEFS).filter(([, d]) => (d.pick || []).some(p => p.table === name));
  w('### `' + name + '`\n');
  w(users.length
    ? 'Rolled by: ' + users.map(([, d]) => '**' + d.name + '** ' + pct(d.pick.find(p => p.table === name).chance)).join(' · ') + '\n'
    : 'No monster rolls this one — it is awarded by a **dynamic event**, once per contribution tier earned (bronze 1 roll, silver 2, gold 3). Nothing in it is buyable, smithable or dropped by a standing monster.\n');
  w('| Item | Qty | Weight | Chance once rolled |');
  w('|---|---|---|---|');
  for (const [id, mn, mx, wt] of list) w('| ' + nm(id) + ' | ' + qty(mn, mx) + ' | ' + wt + '/' + total + ' | ' + pct(wt / total) + ' |');
  w('');
}

const rows = Object.entries(NPC_DEFS).filter(([, d]) => d.attackable).map(([id, d]) => ({ id, d, lvl: lvl(d) }));
rows.sort((a, b) => a.lvl - b.lvl);

w('## Monsters\n');
w('Sorted by combat level. Rates are measured over ' + N.toLocaleString('en-GB') + ' simulated kills each.\n');
for (const { id, d, lvl: L } of rows) {
  let gp = 0;
  for (let i = 0; i < N; i++) for (const g of Combat.rollDrops(id))
    gp += (g.id === 'coins' ? 1 : (ITEMS[g.id].value || 0)) * g.qty;
  const ev = Math.round(gp / N);
  w('### ' + d.name + ' \u2014 level ' + L + '\n');
  w('`' + id + '` \u00b7 ' + d.hits + ' hp \u00b7 attacks with **' + (d.cstyle || 'melee') + '** \u00b7 armour class **' + (d.carmour || 'none') +
    '** \u00b7 respawns in ' + (d.respawn || 20) + 's' +
    (d.aggro ? ' \u00b7 aggressive within ' + d.aggro + ' tiles' : '') +
    (d.leash ? ' \u00b7 leashes at ' + d.leash : '') + (d.boss ? ' \u00b7 **boss**' : '') + '\n');
  w('Expected **' + ev.toLocaleString('en-GB') + ' gp** per kill (' + (ev / d.hits).toFixed(1) + ' gp per hitpoint).\n');
  w('| Item | Qty | Rate | Roll |');
  w('|---|---|---|---|');
  for (const [iid, mn, mx, ch] of (d.drops || []))
    w('| ' + nm(iid) + ' | ' + qty(mn, mx) + ' | ' + (ch >= 1 ? '**Always**' : pct(ch)) + ' | independent |');
  for (const p of (d.pick || [])) {
    const list = DROP_TABLES[p.table];
    const total = list.reduce((a, r) => a + r[3], 0);
    for (const [iid, mn, mx, wt] of list)
      w('| ' + nm(iid) + ' | ' + qty(mn, mx) + ' | ' + pct(p.chance * wt / total) + ' | one-of `' + p.table + '`, ' + pct(p.chance) + ' to roll |');
  }
  w('');
}

const DOC = ROOT + '/DROP_TABLES.md';
const src = fs.readFileSync(DOC, 'utf8');
const A = '<!-- BEGIN GENERATED -->', B = '<!-- END GENERATED -->';
const i = src.indexOf(A), j = src.indexOf(B);
if (i < 0 || j < 0) { console.error('markers missing in DROP_TABLES.md'); process.exit(1); }
fs.writeFileSync(DOC, src.slice(0, i + A.length) + '\n\n' + out + '\n' + src.slice(j));
console.log('DROP_TABLES.md updated:', rows.length, 'monsters,', Object.keys(DROP_TABLES).length, 'sub-tables');
