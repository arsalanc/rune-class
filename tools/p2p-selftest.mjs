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
    var Game = { player: {}, players: [], npcs: [], ground: [], netMode: false, eventHud: [], run: false };
    var UI = {
      modal: null,
      addMessage(t, c) { __messages.push({ t, c }); },
      refresh() {}, renderInventory() {}, renderStats() {}, renderEquipment() {},
      renderEventBanner() {}, syncRunButton() {},
      openBank() { this.modal = 'bank'; }, renderBank() {}, closeModal() { this.modal = null; }
    };
  `, ctx, { filename: 'stubs.js' });

  vm.runInContext(read('net.js'), ctx, { filename: 'net.js' });
  vm.runInContext('var __x = { Host, Net, PAKE, Sim, World, Game, UI };', ctx, { filename: 'export.js' });
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
await sleep(600);
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
await sleep(600);
guest.Net.bankDepositSlot(P().inv.findIndex(i => i.noted), 12);
await sleep(400);
check('depositing a note returns the real items to the bank',
  (P().bank.find(b => b.id === 'logs') || {}).qty === 12);
check('the note is gone from the pack', !P().inv.some(i => i.noted));

// --- the authority refuses banking from out of range ---
guest.Net.action({ kind: 'bank', key: booth.key });
await sleep(600);
const bankedBefore = (P().bank.find(b => b.id === 'logs') || {}).qty;
P().x = booth.s.x + 20; P().z = booth.s.z + 20;      // teleport away without walking
guest.Net.bankWithdraw('logs', 12, false);
await sleep(400);
check('a bank operation from out of range is refused',
  (P().bank.find(b => b.id === 'logs') || {}).qty === bankedBefore);
check('and the window is closed', P().bankKey === null);

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
