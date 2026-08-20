// End-to-end test of the peer-to-peer path: the real js/host.js and js/net.js talk to
// each other through a loopback stand-in for PeerJS, over the real CPace handshake and
// the real Sim. Only the browser's edges are faked — the signalling broker, IndexedDB
// and the DOM.
//   node tools/p2p-selftest.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

let failures = 0;
const check = (name, ok, extra) => {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || !extra ? '' : '  → ' + extra));
  if (!ok) failures++;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- fake PeerJS ----------
// A DataConnection pair wired straight together. Delivery is deferred through the
// task queue and binary payloads arrive as ArrayBuffers, both of which match how a
// real RTCDataChannel with binaryType='arraybuffer' behaves.
const brokers = new Map();     // peer id -> peer

function makeConn(peerId, label) {
  const handlers = {};
  return {
    peer: peerId, label, other: null, dataChannel: null,
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    emit(ev, arg) { for (const fn of handlers[ev] || []) fn(arg); },
    send(data) {
      const payload = typeof data === 'string' ? data : data.slice().buffer;
      setTimeout(() => this.other && this.other.emit('data', payload), 0);
    },
    close() { setTimeout(() => { if (this.other) this.other.emit('close'); this.emit('close'); }, 0); }
  };
}

class FakePeer {
  constructor(a, b) {
    const id = typeof a === 'string' ? a : null;
    this.id = id || 'guest-' + Math.random().toString(36).slice(2, 10);
    this._h = {};
    this.disconnected = false;
    setTimeout(() => {
      if (id && brokers.has(id)) return this.emit('error', { type: 'unavailable-id' });
      brokers.set(this.id, this);
      this.emit('open', this.id);
    }, 0);
  }
  on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); }
  emit(ev, arg) { for (const fn of this._h[ev] || []) fn(arg); }
  connect(targetId) {
    const target = brokers.get(targetId);
    const mine = makeConn(targetId, 'guest-side');
    if (!target) { setTimeout(() => this.emit('error', { type: 'peer-unavailable' }), 0); return mine; }
    const theirs = makeConn(this.id, 'host-side');
    mine.other = theirs; theirs.other = mine;
    setTimeout(() => { target.emit('connection', theirs); theirs.emit('open'); mine.emit('open'); }, 0);
    return mine;
  }
  destroy() { brokers.delete(this.id); this.disconnected = true; }
}

// ---------- fake IndexedDB ----------
const tables = { accounts: new Map(), meta: new Map() };
const FakeStore = {
  available: () => true,
  open: async () => ({}),
  get: async (t, k) => tables[t].get(k) || undefined,
  all: async (t) => [...tables[t].values()],
  put: async (t, v) => { tables[t].set(v.name || v.key, JSON.parse(JSON.stringify(v))); },
  del: async (t, k) => { tables[t].delete(k); }
};

// ---------- build a browser-ish realm ----------
// Each client gets its own realm, exactly like a separate tab: separate World,
// separate Game, separate Net. The fake broker is the only thing they share.
function makeRealm(tag) {
  const messages = [];
  const player = {};
  const ctx = vm.createContext({
    crypto, TextEncoder, TextDecoder, btoa, atob, console, Math, JSON, Date,
    performance, setTimeout, clearTimeout, setInterval, clearInterval,
    RTCPeerConnection: function () {},          // only PAKE.available() looks at this
    Peer: FakePeer,
    Store: FakeStore,
    indexedDB: {},
    document: { getElementById: () => ({ classList: { add() {}, remove() {} } }) },
    window: { addEventListener() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    __tag: tag, __messages: messages
  });
  ctx.globalThis = ctx;

  // Same order as index.html. Separate scripts in one realm, so their top-level
  // `const`s see each other exactly as they do in the browser.
  for (const f of ['data.js', 'combat.js', 'events.js', 'world.js',
                   'vendor/noble-ristretto255.js', 'pake.js', 'sim.js', 'host.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
  }

  // Stand-ins for the parts of the client net.js talks to.
  vm.runInContext(`
    var Sound = { ensure() {}, play() {} };
    var Game = { player: {}, players: [], npcs: [], ground: [], netMode: false, eventHud: [], run: false,
                 shops: {}, activeShop: 'general',
                 emptyQuests() { return {}; } };
    var UI = {
      modal: null,
      addMessage(t, c) { __messages.push({ t, c }); },
      refresh() {}, renderInventory() {}, renderStats() {}, renderEquipment() {},
      renderEventBanner() {}, syncRunButton() {}, renderQuests() {},
      openBank() { this.modal = 'bank'; }, renderBank() {}, closeModal() { this.modal = null; },
      openShop(id) { this.modal = 'shop'; }, renderShop() {}
    };
  `, ctx, { filename: 'stubs.js' });

  vm.runInContext(read('net.js'), ctx, { filename: 'net.js' });
  vm.runInContext('var __x = { Host, Net, PAKE, Sim, World, Game, UI, NPC_DEFS, ITEMS, SHOP_DEFS, FLETCH_KNIFE, CRAFTABLES, QUEST_STEPS };', ctx, { filename: 'export.js' });
  return { ...ctx.__x, messages, ctx };
}

// ---------- the test ----------
console.log('Peer-to-peer host / guest');

const host = makeRealm('host');
const world = await host.Net.hostWorld('Hostina');
check('host opens a world and gets an ID', /^rc-[a-z0-9]{6}-[a-z0-9]{6}$/.test(world.id), world.id);
check('host mints an invite code', /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(world.invite), world.invite);
await sleep(50);
check('host joins its own world as a local player', host.Net.active && host.Net.mode === 'host');
check('host character is in the sim', host.Host.clients.size === 1);

// --- a new player registers with the invite code ---
const guest = makeRealm('guest');
let joined = null, joinErr = null;
try {
  joined = await guest.Net.joinP2P({ worldId: world.id, name: 'Dave', password: 'correct-horse', invite: world.invite });
} catch (e) { joinErr = e; }
check('a new guest joins with the invite code', !!joined && joined.registered, joinErr && joinErr.message);
await sleep(120);
check('the guest received a welcome', guest.Net.active && guest.Net.id > 0);
check('the host sees two players', host.Host.clients.size === 2, 'clients=' + host.Host.clients.size);
check('the guest\'s account was persisted', !!tables.accounts.get('dave'));
check('the stored credential is not the password',
  JSON.stringify([...tables.accounts.values()]).indexOf('correct-horse') === -1);

// --- the game protocol actually flows over the encrypted channel ---
guest.Net.chat('hello from dave');
await sleep(400);
const heard = host.messages.some(m => /hello from dave/.test(m.t));
check('chat crosses the encrypted channel to the host', heard);
check('the guest sees its own chat bubble', !!guest.Game.player.bubble);

// Note: Game.player.x is the *rendered* position, advanced only by Net.interpolate()
// from the render loop — which does not exist headlessly. The authority is the host's
// sim, and what reaches the guest is the target, tx.
const hostSidePlayer = [...host.Host.clients.values()].find(c => !c.local);
const before = host.Host.sim.players.get(hostSidePlayer.pid).x;
const beforeTx = guest.Game.player.tx;
guest.Net.walk(70, 70);
await sleep(700);
check('a walk intent moves the guest in the host\'s sim',
  host.Host.sim.players.get(hostSidePlayer.pid).x !== before,
  before + ' -> ' + host.Host.sim.players.get(hostSidePlayer.pid).x);
check('the new position reaches the guest in a snapshot', guest.Game.player.tx !== beforeTx,
  beforeTx + ' -> ' + guest.Game.player.tx);
check('the guest is receiving snapshots', Array.isArray(guest.Game.npcs) && guest.Game.npcs.length > 0);

// --- run is authoritative: the sim applies the speed, not the client ---
const simPlayer = () => host.Host.sim.players.get(hostSidePlayer.pid);
check('players start walking', simPlayer().run === false);

guest.Net.run(true);
await sleep(300);
check('a run intent reaches the sim', simPlayer().run === true);
check('the authority echoes the run flag back', guest.Game.run === true);

// Cover the same ground walking vs running and compare distance travelled.
const runDist = await (async () => {
  const p = simPlayer(); p.x = 64.5; p.z = 64.5; p.path = [];
  guest.Net.walk(80, 64);
  await sleep(1000);
  return Math.abs(simPlayer().x - 64.5);
})();
guest.Net.run(false);
await sleep(300);
const walkDist = await (async () => {
  const p = simPlayer(); p.x = 64.5; p.z = 64.5; p.path = [];
  guest.Net.walk(80, 64);
  await sleep(1000);
  return Math.abs(simPlayer().x - 64.5);
})();
check('running covers more ground than walking', runDist > walkDist * 1.4,
  'run ' + runDist.toFixed(2) + ' vs walk ' + walkDist.toFixed(2));

// --- banking ---
// The sim owns the bank, so these all assert against the host's copy, not the
// guest's mirror. Put the player at a booth first; walking there would take ages.
const booth = (() => {
  for (const [key, s] of host.World.L[0].scenery) if (s.type === 'bank_booth') return { key, s };
  return null;
})();
check('the world has a bank booth to test against', !!booth);

const P = () => host.Host.sim.players.get(hostSidePlayer.pid);
const sim = () => host.Host.sim;
const standAtBooth = () => { const p = P(); p.x = booth.s.x + 0.5; p.z = booth.s.z + 0.5; p.layer = 0; p.path = []; };

standAtBooth();
guest.Net.action({ kind: 'bank', key: booth.key });
await sleep(1400);   // scenery actions resolve on the 600ms slow tick, so leave two
check('using a booth opens the bank', P().bankKey === booth.key);
check('the guest received the bank contents', Array.isArray(guest.Game.player.bank));

P().inv = [{ id: 'coins', qty: 500 }, { id: 'bronze_axe', qty: 1 }, { id: 'logs', qty: 12 }];
guest.Net.bankDeposit('logs', 12, 1);
await sleep(400);
check('deposit moves items out of the pack', sim().count(P(), 'logs') === 0);
check('deposit puts them in the bank', (P().bank.find(b => b.id === 'logs') || {}).qty === 12);

guest.Net.bankWithdraw('logs', 5, false);
await sleep(400);
check('withdraw returns items to the pack', sim().count(P(), 'logs') === 5);
check('withdraw decrements the bank', (P().bank.find(b => b.id === 'logs') || {}).qty === 7);

guest.Net.bankDepositAll();
await sleep(400);
check('deposit-all empties the pack', P().inv.length === 0);
check('deposit-all banks everything', P().bank.length === 3);

// --- notes ---
guest.Net.bankWithdraw('logs', 12, true);
await sleep(400);
const note = P().inv.find(i => i.noted);
check('withdraw-as-note yields a single noted stack', !!note && note.qty === 12 && note.id === 'logs');
check('a note is not counted as the real item', sim().count(P(), 'logs') === 0);
check('a note does not satisfy has()', sim().has(P(), 'logs') === false);

// The dupe that matters: drop a note, pick it up, and check it is still a note.
const noteIdx = P().inv.indexOf(note);
guest.Net.drop(noteIdx);
await sleep(400);
const dropped = sim().ground.find(g => g.id === 'logs' && g.noted);
check('a dropped note stays a note on the ground', !!dropped && dropped.qty === 12);

guest.Net.action({ kind: 'take', gid: dropped.gid });
await sleep(900);
check('picking a note back up does not mint real items', sim().count(P(), 'logs') === 0,
  'count=' + sim().count(P(), 'logs'));
check('it comes back as a note', (P().inv.find(i => i.noted) || {}).qty === 12);

// Banking a note by slot reclaims it as real stock.
standAtBooth();
guest.Net.action({ kind: 'bank', key: booth.key });
await sleep(1400);   // scenery actions resolve on the 600ms slow tick, so leave two
guest.Net.bankDepositSlot(P().inv.findIndex(i => i.noted), 12);
await sleep(400);
check('depositing a note returns the real items to the bank',
  (P().bank.find(b => b.id === 'logs') || {}).qty === 12);
check('the note is gone from the pack', !P().inv.some(i => i.noted));

// --- the authority refuses banking from out of range ---
guest.Net.action({ kind: 'bank', key: booth.key });
await sleep(1400);   // scenery actions resolve on the 600ms slow tick, so leave two
const bankedBefore = (P().bank.find(b => b.id === 'logs') || {}).qty;
P().x = booth.s.x + 20; P().z = booth.s.z + 20;      // teleport away without walking
guest.Net.bankWithdraw('logs', 12, false);
await sleep(400);
check('a bank operation from out of range is refused',
  (P().bank.find(b => b.id === 'logs') || {}).qty === bankedBefore);
check('and the window is closed', P().bankKey === null);

// --- shops: shared stock, unlike the per-player bank ---
// A tradeable, non-ghostly shopkeeper straight from the sim's NPC list.
const trader = host.Host.sim.npcs.find(n => {
  const d = host.NPC_DEFS[n.type];
  return d && d.trade && !d.ghostly && host.Host.sim.shops[d.trade];
});
check('the world has a shopkeeper to trade with', !!trader, trader && trader.type);

const shopId = trader ? host.NPC_DEFS[trader.type].trade : null;
const guestP = () => host.Host.sim.players.get(hostSidePlayer.pid);
const hostP = () => { const c = [...host.Host.clients.values()].find(x => x.local); return host.Host.sim.players.get(c.pid); };

// Shopkeepers wander, and the sim re-checks range on every transaction — so step
// back onto the keeper's *current* tile before each operation rather than once.
const standAtShop = (p) => { p.x = trader.x + 0.5; p.z = trader.z + 0.5; p.layer = trader.layer; p.path = []; };
const reopen = async (realm, p) => { standAtShop(p); realm.Net.shopOpen(trader.id); await sleep(400); };

guestP().inv = [{ id: 'coins', qty: 100000 }];
await reopen(guest, guestP());
check('trading with a shopkeeper opens the shop', guestP().shopId === shopId);
check('the guest received the stock', Array.isArray(guest.Game.shops[shopId]));

const line = host.Host.sim.shops[shopId].find(s => s.qty > 0);
const stockBefore = line.qty;
guest.Net.buy(line.id, 1);
await sleep(500);
check('buying takes one off the shelf', line.qty === stockBefore - 1, line.qty + ' vs ' + stockBefore);
check('and puts it in the pack', host.Host.sim.count(guestP(), line.id) >= 1 || guestP().inv.some(i => i.id === line.id));

// The point of shared stock: the host is standing at the same counter and sees it move.
hostP().inv = [{ id: 'coins', qty: 100000 }];
await reopen(host, hostP());
check('a second player can open the same shop', hostP().shopId === shopId);

const seenByHost = () => (host.Game.shops[shopId] || []).find(s => s.id === line.id);
check('the second player sees the already-reduced stock', seenByHost() && seenByHost().qty === line.qty,
  seenByHost() && seenByHost().qty);

await reopen(guest, guestP());
const before2 = line.qty;
guest.Net.buy(line.id, 1);
await sleep(600);
check("one player buying updates the other player's view",
  seenByHost() && seenByHost().qty === before2 - 1,
  'host sees ' + (seenByHost() || {}).qty + ', sim has ' + line.qty);

// Buying with no money must not hand out goods.
await reopen(guest, guestP());
const brokeStock = line.qty;
guestP().inv = [];
guest.Net.buy(line.id, 5);
await sleep(500);
check('you cannot buy with an empty purse', line.qty === brokeStock);

// Out of range is refused, same as the bank.
guestP().inv = [{ id: 'coins', qty: 100000 }];
await reopen(guest, guestP());
guestP().x = trader.x + 25; guestP().z = trader.z + 25;   // teleport away without walking
const farStock = line.qty;
guest.Net.buy(line.id, 1);
await sleep(500);
check('buying from out of range is refused', line.qty === farStock);
check('and the shop window is closed', guestP().shopId === null);

// Restock drifts back toward the starting level.
const drained = host.Host.sim.shops[shopId].find(s => s.id === line.id);
const low = drained.qty;
host.Host.sim._gtick = 39; host.Host.sim.slowTick(Date.now());
check('stock drifts back toward its starting level', drained.qty === low + Math.sign(drained.initial - low),
  low + ' -> ' + drained.qty + ' (initial ' + drained.initial + ')');

// --- production skills ---
// All four are authoritative: the client picks a recipe, the sim checks the level,
// consumes the materials and awards the xp.
const simP = () => host.Host.sim.players.get(hostSidePlayer.pid);
const findScenery = (type) => {
  for (const [key, s] of host.World.L[0].scenery) if (s.type === type) return { key, s };
  return null;
};
const standAt = (p, s) => { p.x = s.x + 1.5; p.z = s.z + 0.5; p.layer = 0; p.path = []; };

// smelting
const furnace = findScenery('furnace');
check('the world has a furnace', !!furnace);
standAt(simP(), furnace.s);
simP().inv = [{ id: 'copper_ore', qty: 3 }, { id: 'tin_ore', qty: 3 }, { id: 'hammer', qty: 1 }];
simP().xp = { hits: 1154 };
guest.Net.action({ kind: 'smelt', key: furnace.key, bar: 'bronze_bar' });
await sleep(2000);
check('smelting turns ore into bars', host.Host.sim.count(simP(), 'bronze_bar') > 0,
  'bars=' + host.Host.sim.count(simP(), 'bronze_bar'));
check('smelting consumes the ore', host.Host.sim.count(simP(), 'copper_ore') < 3);
check('smelting awards Smithing xp', (simP().xp.smithing || 0) > 0);
check('it repeats until the ore runs out', host.Host.sim.count(simP(), 'copper_ore') === 0,
  'copper left=' + host.Host.sim.count(simP(), 'copper_ore'));

// a level gate the client cannot talk its way past
standAt(simP(), furnace.s);
simP().inv = [{ id: 'mithril_ore', qty: 2 }, { id: 'coal', qty: 8 }];
guest.Net.action({ kind: 'smelt', key: furnace.key, bar: 'mithril_bar' });
await sleep(900);
check('a recipe above your level is refused', host.Host.sim.count(simP(), 'mithril_bar') === 0);

// smithing
const anvil = findScenery('anvil');
check('the world has an anvil', !!anvil);
standAt(simP(), anvil.s);
simP().inv = [{ id: 'bronze_bar', qty: 3 }, { id: 'hammer', qty: 1 }];
guest.Net.action({ kind: 'smith', key: anvil.key, product: 'bronze_sword' });
await sleep(1500);
check('smithing makes the product', host.Host.sim.count(simP(), 'bronze_sword') > 0);
check('smithing consumes bars', host.Host.sim.count(simP(), 'bronze_bar') < 3);

// smithing without a hammer is refused
standAt(simP(), anvil.s);
simP().inv = [{ id: 'bronze_bar', qty: 2 }];
guest.Net.action({ kind: 'smith', key: anvil.key, product: 'bronze_sword' });
await sleep(900);
check('smithing without a hammer is refused', host.Host.sim.count(simP(), 'bronze_bar') === 2);

// cooking
const range = findScenery('range');
check('the world has a range', !!range);
standAt(simP(), range.s);
simP().inv = [{ id: 'raw_shrimp', qty: 4 }];
guest.Net.action({ kind: 'cook', key: range.key });
await sleep(2500);
const cooked = host.Host.sim.count(simP(), 'shrimp'), burnt = host.Host.sim.count(simP(), 'burnt_shrimp');
check('cooking consumes the raw food', host.Host.sim.count(simP(), 'raw_shrimp') === 0);
check('and produces cooked or burnt food', cooked + burnt === 4, 'cooked=' + cooked + ' burnt=' + burnt);

// firemaking
const p = simP();
p.layer = 0; p.path = [];
// a clear grass tile with nothing already on it
let spot = null;
for (let x = 60; x < 75 && !spot; x++) for (let z = 60; z < 75; z++) {
  const t = host.World.L[0].tile[x][z];
  if (!host.World.L[0].scenery.has(host.World.key(x, z)) && t !== 'water' && t !== 'floor' && !host.World.blocked(0, x, z)) { spot = { x, z }; break; }
}
check('found somewhere to light a fire', !!spot);
p.x = spot.x + 0.5; p.z = spot.z + 0.5;
p.inv = [{ id: 'tinderbox', qty: 1 }, { id: 'logs', qty: 6 }];
p.xp = { hits: 1154, firemaking: 5000 };   // high enough that the roll effectively always succeeds
for (let i = 0; i < 6; i++) { guest.Net.firemake('logs'); await sleep(200); }
await sleep(600);
const lit = host.World.L[0].scenery.get(host.World.key(spot.x, spot.z));
check('lighting logs creates a fire', !!lit && lit.type === 'fire');
check('the fire has an expiry so it burns out', !!lit && lit.expireAt > 0);
check('lighting consumed a log', host.Host.sim.count(simP(), 'logs') < 6);
check('firemaking awarded xp', (simP().xp.firemaking || 0) > 5000);

// no tinderbox, no fire
const spot2 = { x: spot.x + 3, z: spot.z };
simP().x = spot2.x + 0.5; simP().z = spot2.z + 0.5;
simP().inv = [{ id: 'logs', qty: 2 }];
guest.Net.firemake('logs');
await sleep(500);
check('lighting a fire without a tinderbox is refused',
  !host.World.L[0].scenery.has(host.World.key(spot2.x, spot2.z)));

// --- crafting / fletching / herblore ---
// One intent covers every "use item on item" recipe; the sim re-derives each from
// the shared tables and re-checks level and materials.
const sim2 = () => host.Host.sim;
simP().xp = { hits: 1154, crafting: 200000, fletching: 200000, herblore: 200000 };
simP().inv = [{ id: 'chisel', qty: 1 }, { id: 'uncut_sapphire', qty: 3 }];
guest.Net.craft('gem', 'uncut_sapphire', 3);
await sleep(500);
check('cutting gems works and batches', sim2().count(simP(), 'sapphire') === 3);
check('the uncut gems were consumed', sim2().count(simP(), 'uncut_sapphire') === 0);

simP().inv = [{ id: 'knife', qty: 1 }, { id: 'logs', qty: 4 }];
const fletchProduct = host.FLETCH_KNIFE.logs[0];
guest.Net.craft('fletchlog', { log: 'logs', id: fletchProduct.id }, 4);
await sleep(500);
check('fletching logs works', sim2().count(simP(), fletchProduct.id) > 0);
check('the logs were consumed', sim2().count(simP(), 'logs') === 0);

simP().inv = [{ id: 'needle', qty: 1 }, { id: 'leather', qty: 6 }];
guest.Net.craft('leather', 'leather_coif', 2);
await sleep(500);
check('leatherworking makes the item', sim2().count(simP(), 'leather_coif') === 2);
check('crafting awarded xp', (simP().xp.crafting || 0) > 200000);

// Without the tool, nothing is made — the client cannot assert its way past it.
simP().inv = [{ id: 'uncut_sapphire', qty: 2 }];
guest.Net.craft('gem', 'uncut_sapphire', 2);
await sleep(400);
check('crafting without the tool is refused', sim2().count(simP(), 'sapphire') === 0 && sim2().count(simP(), 'uncut_sapphire') === 2);

// And the level gate holds.
simP().xp = { hits: 1154 };
simP().inv = [{ id: 'chisel', qty: 1 }, { id: 'uncut_diamond', qty: 1 }];
guest.Net.craft('gem', 'uncut_diamond', 1);
await sleep(400);
check('crafting above your level is refused', sim2().count(simP(), 'diamond') === 0);

// A batch is capped, so one message cannot ask for unbounded work.
simP().xp = { hits: 1154, crafting: 200000 };
simP().inv = [{ id: 'chisel', qty: 1 }, { id: 'uncut_sapphire', qty: 40 }];
guest.Net.craft('gem', 'uncut_sapphire', 9999);
await sleep(700);
check('a batch request is capped', sim2().count(simP(), 'sapphire') <= 28,
  'made ' + sim2().count(simP(), 'sapphire'));

// --- quests: progress is per-player, and the sim polices every step ---
simP().inv = [];
simP().quests = {};
guest.Net.questStep('lunch');
await sleep(400);
check('accepting a quest advances it', simP().quests.lunch === 1);
check('the guest sees its own quest progress', (guest.Game.player.quests || {}).lunch === 1);

// The whole point of server-side validation: ask to hand in without the goods.
guest.Net.questStep('lunch');
await sleep(400);
check('handing in without the items is refused', simP().quests.lunch === 1);
check('and no reward was paid', host.Host.sim.count(simP(), 'coins') === 0);

host.Host.sim.add(simP(), 'shrimp', 3);
guest.Net.questStep('lunch');
await sleep(400);
check('handing in with the items completes the step', simP().quests.lunch === 2);
check('the reward was paid', host.Host.sim.count(simP(), 'coins') === 100);
check('the items were consumed', host.Host.sim.count(simP(), 'shrimp') === 0);
check('xp was awarded', (simP().xp.cooking || 0) === 300);

// Spamming a finished quest must not pay twice.
host.Host.sim.add(simP(), 'shrimp', 3);
guest.Net.questStep('lunch');
await sleep(400);
check('a completed quest cannot be farmed', host.Host.sim.count(simP(), 'coins') === 100 && simP().quests.lunch === 2);

// Progress is per-player: the host's own character is untouched by all of that.
const hostQuests = (() => { const c = [...host.Host.clients.values()].find(x => x.local); return host.Host.sim.players.get(c.pid).quests || {}; })();
check('quest progress is per-player, not shared', !hostQuests.lunch,
  'host sees lunch=' + hostQuests.lunch);

// --- the character save survives a disconnect ---
guest.Net.transport.close();
await sleep(300);
check('the host drops the guest on disconnect', host.Host.clients.size === 1, 'clients=' + host.Host.clients.size);
const saved = tables.accounts.get('dave');
check('the guest\'s position was saved', !!(saved && saved.save && typeof saved.save.x === 'number'));

// --- returning: the character password alone, no invite code ---
const returning = makeRealm('returning');
let back = null, backErr = null;
try {
  back = await returning.Net.joinP2P({ worldId: world.id, name: 'Dave', password: 'correct-horse' });
} catch (e) { backErr = e; }
check('a returning player logs in with just their password', !!back && !back.registered, backErr && backErr.message);
await sleep(120);
check('their saved progress came back',
  Math.abs(returning.Game.player.x - saved.save.x) < 0.001,
  'expected ' + saved.save.x + ', got ' + returning.Game.player.x);
check('the run setting persisted across the disconnect', saved.save.run === false && returning.Game.run === false);
check('the bank persisted across the disconnect',
  Array.isArray(saved.save.bank) && (saved.save.bank.find(b => b.id === 'logs') || {}).qty === 12,
  JSON.stringify(saved.save.bank));
const reloaded = [...host.Host.clients.values()].find(c => !c.local);
check('the reloaded character still has its bank',
  (host.Host.sim.players.get(reloaded.pid).bank.find(b => b.id === 'logs') || {}).qty === 12);

// --- the same character cannot be logged in twice ---
const twin = makeRealm('twin');
let twinErr = null;
try { await twin.Net.joinP2P({ worldId: world.id, name: 'Dave', password: 'correct-horse' }); }
catch (e) { twinErr = e; }
check('the same character cannot log in twice', !!twinErr && /already logged in/i.test(twinErr.message),
  twinErr && twinErr.message);

returning.Net.transport.close();
await sleep(300);

// --- wrong password is refused ---
const impostor = makeRealm('impostor');
let impErr = null;
try { await impostor.Net.joinP2P({ worldId: world.id, name: 'Dave', password: 'wrong' }); }
catch (e) { impErr = e; }
check('a wrong password is refused', !!impErr && /password/i.test(impErr.message), impErr && impErr.message);
check('the impostor never entered the world', !impostor.Net.active);
check('a failed attempt does not disturb the stored account',
  tables.accounts.get('dave').prs === saved.prs);

// --- wrong invite code is refused for a new name ---
const stranger = makeRealm('stranger');
let strErr = null;
try { await stranger.Net.joinP2P({ worldId: world.id, name: 'Mallory', password: 'x1234', invite: 'nope-nope-nope' }); }
catch (e) { strErr = e; }
check('a wrong invite code is refused', !!strErr && /invite/i.test(strErr.message), strErr && strErr.message);
check('no account was created for the stranger', !tables.accounts.get('mallory'));

// --- an unknown world id fails cleanly ---
const lost = makeRealm('lost');
let lostErr = null;
try { await lost.Net.joinP2P({ worldId: 'rc-nosuch-world1', name: 'Lost', password: 'x1234', invite: 'a-b-c' }); }
catch (e) { lostErr = e; }
check('an unknown world ID fails with a clear message', !!lostErr && /No world is open/.test(lostErr.message),
  lostErr && lostErr.message);

await host.Host.stop();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
