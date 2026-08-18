'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Sim } = require('./shared.js');

const PORT = process.env.PORT || 8787;
const SAVE_DIR = path.join(__dirname, 'players');
fs.mkdirSync(SAVE_DIR, { recursive: true });

const sim = new Sim();
const clients = new Map(); // ws -> { id, name }

function saveName(name) { return path.join(SAVE_DIR, name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase() + '.json'); }
function loadSave(name) {
  try { return JSON.parse(fs.readFileSync(saveName(name), 'utf8')); } catch (e) { return null; }
}
function writeSave(name, p) {
  try { fs.writeFileSync(saveName(name), JSON.stringify(sim.toSave(p))); } catch (e) { /* ignore */ }
}

const byId = new Map(); // player id -> ws
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }

// ---- HTTP: a tiny health page so you can confirm the server is up in a browser ----
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Rune Classic server up. Players online: ' + sim.players.size + '\nConnect a client to ws://<host>:' + PORT);
});
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  clients.set(ws, { id: 0, name: null });

  ws.on('message', (buf) => {
    let m; try { m = JSON.parse(buf); } catch (e) { return; }
    const c = clients.get(ws);

    if (m.t === 'login') {
      const name = String(m.name || 'Adventurer').slice(0, 16).trim() || 'Adventurer';
      const p = sim.addPlayer(name, loadSave(name));
      c.id = p.id; c.name = name;
      byId.set(p.id, ws);
      send(ws, {
        t: 'welcome', id: p.id, name,
        you: { xp: p.xp, curHits: p.curHits, maxHits: sim.maxHits(p), inv: p.inv, worn: p.worn, style: p.style, x: p.x, z: p.z, layer: p.layer, run: !!p.run },
        overrides: sim.allOverrides(),
        online: [...sim.players.values()].map(q => ({ id: q.id, name: q.name }))
      });
      broadcast({ t: 'msg', text: name + ' has joined the world.', cls: 'm-quest' }, p.id);
      return;
    }
    if (!c.id) return;
    const p = sim.players.get(c.id);
    if (!p) return;

    switch (m.t) {
      case 'walk': sim.intentWalk(p, m.x | 0, m.z | 0); break;
      case 'action': sim.intentAction(p, m.a || {}); break;
      case 'chat': sim.intentChat(p, m.text); break;
      case 'emote': sim.intentEmote(p, m.id); break;
      case 'eat': sim.intentEat(p, 0, m.i | 0); break;
      case 'drop': sim.intentDrop(p, m.i | 0); break;
      case 'wield': sim.intentWield(p, m.i | 0); break;
      case 'unequip': sim.intentUnequip(p, String(m.slot || '')); break;
      case 'style': if (m.style >= 0 && m.style < 4) { p.style = m.style | 0; sim.pushStats(p); } break;
      case 'run': sim.intentRun(p, !!m.on); break;
      case 'bankdep': sim.intentBankDeposit(p, String(m.id || ''), m.qty | 0, m.tab | 0); break;
      case 'bankdepslot': sim.intentBankDepositSlot(p, m.i | 0, m.qty | 0); break;
      case 'bankdepall': sim.intentBankDepositAll(p); break;
      case 'bankwd': sim.intentBankWithdraw(p, String(m.id || ''), m.qty | 0, !!m.note); break;
      case 'banktab': sim.intentBankTab(p, String(m.id || ''), m.tab | 0); break;
      case 'bankclose': sim.closeBank(p); break;
      case 'shopopen': sim.intentShopOpen(p, m.npcId | 0); break;
      case 'buy': sim.intentBuy(p, String(m.id || ''), m.qty | 0); break;
      case 'sell': sim.intentSell(p, String(m.id || ''), m.qty | 0); break;
      case 'shopclose': sim.closeShop(p); break;
      case 'firemake': sim.intentFiremake(p, String(m.id || '')); break;
    }
  });

  ws.on('close', () => {
    const c = clients.get(ws);
    if (c && c.id) {
      const p = sim.players.get(c.id);
      if (p) writeSave(c.name, p);
      sim.removePlayer(c.id);
      byId.delete(c.id);
    }
    clients.delete(ws);
  });
});

function broadcast(msg, exceptId) {
  for (const [id, ws] of byId) { if (id === exceptId) continue; send(ws, msg); }
}

// ---- drain sim events to the right sockets ----
function flushEvents() {
  for (const e of sim.drain()) {
    if (e.kind === 'to') { const ws = byId.get(e.id); if (ws) send(ws, e.msg); }
    else if (e.kind === 'scenery') broadcast({ t: 'scenery', layer: e.layer, key: e.key, x: e.x, z: e.z, stype: e.stype });
    else if (e.kind === 'chat') broadcast({ t: 'chat', id: e.id, name: e.name, text: e.text });
    else if (e.kind === 'announce') broadcast({ t: 'msg', text: e.text, cls: e.cls });
    else if (e.kind === 'emote') broadcast({ t: 'emote', id: e.id, emote: e.emote });
    else if (e.kind === 'join') broadcast({ t: 'online', id: e.id, name: e.name, join: true }, e.id);
    else if (e.kind === 'leave') broadcast({ t: 'online', id: e.id, name: e.name, join: false });
  }
}

// ---- main loop: 150ms ----
const DT = 0.15;
let saveTimer = 0;
setInterval(() => {
  sim.step(DT);
  flushEvents();
  for (const [id, ws] of byId) {
    const p = sim.players.get(id);
    if (p) send(ws, sim.snapshotFor(p));
  }
  if (++saveTimer >= 200) { // ~every 30s
    saveTimer = 0;
    for (const [id] of byId) { const p = sim.players.get(id); if (p) writeSave(p.name, p); }
  }
}, 150);

server.listen(PORT, () => console.log('Rune Classic server listening on :' + PORT + ' (ws + http)'));
