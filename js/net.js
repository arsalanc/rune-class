'use strict';
// Client networking. When connected, the browser becomes a thin client: it sends
// intents and renders authoritative snapshots from whoever is authoritative.
// Singleplayer is untouched — everything here only runs while Net.active is true.
//
// Three transports, one protocol. `handle()` and the intent methods below neither
// know nor care which is in use:
//
//   ws    a Node server (server/) over a WebSocket — LAN and self-hosting
//   p2p   a friend's browser over a WebRTC data channel, encrypted under a
//         CPace-derived key (js/pake.js) and brokered by PeerJS
//   host  this tab *is* the authority; messages are passed to js/host.js directly
//
const Net = {
  ws: null, active: false, id: 0, name: '', online: new Map(),
  mode: '',                  // '' | 'ws' | 'p2p' | 'host'
  peer: null, conn: null,    // p2p only
  transport: null,           // { send(msg), close() }
  onStatus: null,            // UI hook: (text, cls) => void

  // ---------- shared plumbing ----------
  status(text, cls) { UI.addMessage(text, cls || 'm-quest'); if (this.onStatus) this.onStatus(text, cls); },

  send(m) { if (this.transport) this.transport.send(m); },

  disconnect() {
    const t = this.transport;
    this.transport = null; this.active = false; this.mode = '';
    if (t) { try { t.close(); } catch (e) {} }
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
    this.conn = null; this.ws = null;
  },

  // Called by every transport when the link drops. The sim lives on the other side,
  // so there is no sensible way to keep playing — say so plainly rather than letting
  // the world quietly freeze.
  onDropped(why) {
    if (!this.active && !this.mode) return;
    this.active = false;
    this.status(why || 'Disconnected from the world. Reload to play singleplayer.', 'm-red');
  },

  // ---------- transport: WebSocket (Node server) ----------
  connect(url, name) {
    url = (url || '').trim();
    if (!/^wss?:\/\//.test(url)) url = 'ws://' + url;
    this.name = (name || 'Adventurer').slice(0, 16);
    this.mode = 'ws';
    try { this.ws = new WebSocket(url); }
    catch (e) { this.status('Could not connect: ' + e.message, 'm-red'); return; }

    this.transport = {
      send: (m) => { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },
      close: () => { try { this.ws.close(); } catch (e) {} }
    };

    this.ws.onopen = () => {
      this.status('Connected. Entering the shared world...', 'm-quest');
      this.send({ t: 'login', name: this.name });
    };
    this.ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.handle(m); };
    this.ws.onclose = () => this.onDropped();
    this.ws.onerror = () => this.status('Connection error. Is the server running?', 'm-red');
  },

  // ---------- transport: host this world ourselves ----------
  // The sim runs in this tab. There is nobody to authenticate and nothing to
  // encrypt, so messages are handed straight across as objects.
  async hostWorld(name, invite) {
    this.name = (name || 'Adventurer').slice(0, 16);
    this.mode = 'host';
    const world = await Host.start({ invite });
    this.transport = await Host.attachLocal(this.name, (msg) => this.handle(msg));
    return world;
  },

  // ---------- transport: join a friend's world over WebRTC ----------
  // Runs the guest half of the CPace handshake documented in js/pake.js, then swaps
  // the plaintext JSON channel for sealed binary frames.
  async joinP2P({ worldId, name, password, invite }) {
    if (!PAKE.available()) throw new Error(PAKE.unavailableReason());
    if (typeof Peer === 'undefined') throw new Error('PeerJS failed to load (js/vendor/peerjs.min.js).');

    worldId = String(worldId || '').trim();
    this.name = (name || 'Adventurer').trim().slice(0, 16);
    this.mode = 'p2p';
    const normName = Host.normName(this.name);
    if (!Host.validName(normName)) throw new Error('Pick a name of 2–16 letters, digits, spaces, - or _.');

    const peer = await this._openGuestPeer();
    // 'raw' — not 'none'. PeerJS names the enum member SerializationType.None but its
    // wire value is the string "raw", and the serializer table is keyed by the value;
    // passing "none" throws "_serializers[t.serialization] is not a constructor".
    // Raw means PeerJS hands our bytes to the data channel untouched, which is what
    // the sealed frames from js/pake.js need.
    const conn = peer.connect(worldId, { serialization: 'raw', reliable: true });
    this.conn = conn;

    return await new Promise((resolve, reject) => {
      let done = false;
      const fail = (msg) => { if (done) return; done = true; try { conn.close(); } catch (e) {} try { peer.destroy(); } catch (e) {} this.peer = null; reject(new Error(msg)); };
      const timer = setTimeout(() => fail('Timed out reaching that world. Is the host still online?'), 30000);

      // st mirrors the host's handshake state; `rec`/`sendRec` appear at confirmation.
      const st = { phase: 'hello', sid: null, y: null, Yg: null, Yh: null, keys: null, rec: null, sendRec: null, mode: '', acct: null };
      let inQ = Promise.resolve(), outQ = Promise.resolve();

      peer.on('error', (err) => {
        if (err && err.type === 'peer-unavailable') return fail('No world is open with that ID. Check the ID, and that your friend\'s tab is still open.');
        fail(Host._peerError(err));
      });

      conn.on('open', () => {
        try { if (conn.dataChannel) conn.dataChannel.binaryType = 'arraybuffer'; } catch (e) {}
        conn.send(JSON.stringify({ t: 'hello', v: 1, name: this.name }));
      });

      conn.on('data', (data) => {
        inQ = inQ.then(async () => {
          if (st.phase === 'closed') return;

          // Sealed frames once the keys are confirmed; JSON strings before that.
          if (st.phase === 'play') {
            if (typeof data === 'string') return;
            const msg = await st.rec.open(data instanceof Uint8Array ? data : new Uint8Array(data));
            if (msg) this.handle(msg);
            return;
          }

          let m; try { m = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)); } catch (e) { return fail('Bad reply from the host.'); }
          if (m.t === 'authfail') return fail(m.reason || 'The host refused the connection.');

          // --- the host tells us which secret this handshake runs on ---
          if (st.phase === 'hello' && m.t === 'auth') {
            st.mode = m.mode;
            st.sid = PAKE.fromB64(m.sid);
            const salt = PAKE.fromB64(m.salt);
            // 'login'    → the character's own password, against the stored credential
            // 'register' → no character here yet, so the world invite code stands in
            const secret = st.mode === 'login' ? password : invite;
            if (!secret) return fail(st.mode === 'login' ? 'That character needs its password.' : 'That name is new here — you need the world\'s invite code.');

            const prs = await PAKE.derivePRS(secret, salt);
            const mine = await PAKE.cpaceStart(prs, st.sid, Host.channelId(worldId, normName));
            st.y = mine.y; st.Yg = mine.Y;

            // Registering: mint this character's own credential now, to hand over
            // once the channel is encrypted.
            if (st.mode === 'register') {
              const aSalt = PAKE.newSalt();
              const aPrs = await PAKE.derivePRS(password, aSalt);
              st.acct = { salt: PAKE.toB64(aSalt), prs: PAKE.toB64(aPrs) };
            }

            st.phase = 'cpace';
            conn.send(JSON.stringify({ t: 'cpace', Y: PAKE.toB64(st.Yg) }));
            return;
          }

          // --- the host's share: we can now compute the session key ---
          if (st.phase === 'cpace' && m.t === 'cpace') {
            st.Yh = PAKE.fromB64(m.Y);
            const K = PAKE.cpaceFinish(st.y, st.Yh);
            if (!K) return fail('Bad key exchange from the host.');
            const isk = await PAKE.intermediateKey(K, st.sid, st.Yg, st.Yh);
            st.keys = await PAKE.sessionKeys(isk);
            st.phase = 'confirm';
            const tag = await PAKE.confirmTag(st.keys.mac, 'guest-confirm', st.sid, st.Yg, st.Yh);
            conn.send(JSON.stringify({ t: 'confirm', mac: PAKE.toB64(tag) }));
            return;
          }

          // --- the host proves it derived the same key ---
          // Verifying this is what makes the channel authenticated: without it we
          // would happily encrypt to whoever answered.
          if (st.phase === 'confirm' && m.t === 'confirm') {
            const expect = await PAKE.confirmTag(st.keys.mac, 'host-confirm', st.sid, st.Yg, st.Yh);
            if (!PAKE.equalCT(expect, PAKE.fromB64(m.mac))) return fail('The host failed to prove the shared key — do not trust this connection.');

            // Guest sends on guest→host and receives on host→guest.
            st.sendRec = await PAKE.record(st.keys.g2h, 'g2h');
            st.rec = await PAKE.record(st.keys.h2g, 'h2g');
            st.phase = 'play';

            const sealedSend = (msg) => {
              outQ = outQ.then(async () => {
                if (st.phase === 'closed') return;
                const frame = await st.sendRec.seal(msg);
                try { conn.send(frame); } catch (e) {}
              }).catch(() => {});
            };
            this.transport = {
              send: sealedSend,
              close: () => { st.phase = 'closed'; try { conn.close(); } catch (e) {} }
            };
            if (st.mode === 'register') sealedSend({ t: 'register', salt: st.acct.salt, prs: st.acct.prs });

            done = true; clearTimeout(timer);
            resolve({ registered: st.mode === 'register' });
            return;
          }

          fail('Unexpected reply from the host.');
        }).catch(() => fail('Handshake failed.'));
      });

      conn.on('close', () => { st.phase = 'closed'; if (!done) fail('The host closed the connection.'); else this.onDropped(); });
      conn.on('error', () => { if (!done) fail('Connection error.'); });
    });
  },

  _openGuestPeer() {
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 0 });
      this.peer = peer;
      let settled = false;
      peer.on('open', () => { settled = true; resolve(peer); });
      peer.on('error', (err) => { if (!settled) { settled = true; reject(new Error(Host._peerError(err))); } });
    });
  },

  handle(m) {
    switch (m.t) {
      case 'welcome': return this.onWelcome(m);
      case 'snap': return this.onSnap(m);
      case 'you': return this.onYou(m);
      case 'msg': return UI.addMessage(m.text, m.cls);
      case 'levelup': {
        const nm = SKILLS.find(s => s.id === m.skill);
        UI.addMessage('Well done! You just advanced a ' + (nm ? nm.name.toLowerCase() : m.skill) + ' level! (' + m.level + ')', 'm-lvl');
        Sound.play('levelup');
        return;
      }
      case 'chat': return this.onChat(m);
      case 'emote': return this.onEmote(m);
      case 'bank': return this.onBank(m);
      case 'shop': return this.onShop(m);
      case 'scenery': return this.applyScenery(m);
      case 'layer': {
        Game.player.layer = m.layer; Game.player.x = m.x; Game.player.z = m.z;
        Game.player.tx = m.x; Game.player.tz = m.z;
        Game.players = []; Game.npcs = []; Game.ground = [];
        return;
      }
      case 'online': {
        if (m.join) this.online.set(m.id, m.name); else this.online.delete(m.id);
        UI.addMessage(m.name + (m.join ? ' has joined the world.' : ' has left the world.'), 'm-quest');
        return;
      }
    }
  },

  onWelcome(m) {
    this.active = true;
    this.id = m.id;
    // The roster the authority sends includes us, since we were added before it was
    // built — drop ourselves so "others online" means others.
    for (const o of m.online || []) if (o.id !== m.id) this.online.set(o.id, o.name);
    // adopt server character; keep singleplayer-only fields as harmless defaults
    const P = Game.player;
    P.xp = m.you.xp; P.curHits = m.you.curHits; P.inv = m.you.inv; P.style = m.you.style;
    P.worn = m.you.worn || { head: null, body: null, weapon: null, shield: null };
    P.x = m.you.x; P.z = m.you.z; P.layer = m.you.layer;
    P.tx = m.you.x; P.tz = m.you.z; P.path = []; P.action = null;
    P.maxHits = m.you.maxHits;
    // Prayer is singleplayer-only, so anything left burning from a solo session
    // would quietly drain points here for no benefit. Start clean.
    P.prayersOn = {};
    // Your solo bank must not show through as this character's. The authority sends
    // the real contents when you open a booth.
    P.bank = [];
    Game.run = !!m.you.run; UI.syncRunButton();
    for (const o of m.overrides || []) this.applyScenery(o);
    Game.players = []; Game.npcs = []; Game.ground = [];
    Game.netMode = true;
    UI.refresh();
    UI.addMessage('Welcome to the shared world of Rune Classic, ' + this.name + '!', 'm-game');
    if (this.mode === 'host') UI.addMessage('You are hosting. Keep this tab open — the world lives here.', 'm-game');
    UI.addMessage('Others online: ' + ([...this.online.values()].join(', ') || 'just you'), 'm-quest');
    document.getElementById('chatbar').classList.remove('hidden');
    if (this.onStatus) this.onStatus('', '');
    Sound.ensure();
  },

  applyScenery(m) {
    const lay = World.L[m.layer];
    if (!lay) return;
    if (m.stype === null || m.stype === undefined) lay.scenery.delete(m.key);
    else {
      const s = lay.scenery.get(m.key);
      if (s) s.type = m.stype;
      else lay.scenery.set(m.key, { type: m.stype, x: m.x, z: m.z, respawnAt: 0 });
    }
  },

  onYou(m) {
    const P = Game.player;
    if (m.xp) P.xp = m.xp;
    if (m.inv) P.inv = m.inv;
    if (m.worn) P.worn = m.worn;
    if (typeof m.curHits === 'number') P.curHits = m.curHits;
    if (typeof m.maxHits === 'number') P.maxHits = m.maxHits;
    if (typeof m.style === 'number') P.style = m.style;
    // The authority owns the run flag; mirror it onto the client so the HUD button
    // reflects what the sim is actually doing, not what we optimistically set.
    if (typeof m.run === 'boolean') { Game.run = m.run; UI.syncRunButton(); }
    // Quest progress is per-character and owned by the authority; mirror it so the
    // client's dialogue asks the right questions and the Quest tab reads true.
    if (m.quests) { P.quests = Object.assign(Game.emptyQuests(), m.quests); UI.renderQuests(); }
    // Counters the sim keeps that quest steps are proved against.
    if (typeof m.firesLit === 'number') P.firesLit = m.firesLit;
    if (typeof m.ratKills === 'number') P.ratKills = m.ratKills;
    // Crop patches are per-player and owned by the authority. Mirroring them means
    // the existing patch rendering and option menus read true — growth is wall-clock,
    // so the client can work out ripeness itself from plantedAt.
    if (m.patches) P.patches = m.patches;
    UI.renderInventory(); UI.renderStats(); UI.renderEquipment();
  },

  // The bank lives on the authority. We mirror its contents onto the local player so
  // the existing bank UI — which reads Game.player.bank directly — works unchanged,
  // but this copy is display-only: every mutation goes back out as an intent.
  onBank(m) {
    if (m.items) Game.player.bank = m.items;
    if (m.open === false) { if (UI.modal === 'bank') UI.closeModal(); return; }
    if (UI.modal === 'bank') UI.renderBank();
    else UI.openBank();
  },

  // Shop stock is shared world state. This can arrive because we bought something,
  // because someone else at the same counter did, or because the shelf restocked —
  // so it always redraws rather than assuming we caused it.
  onShop(m) {
    if (m.open === false) { if (UI.modal === 'shop') UI.closeModal(); return; }
    if (m.shop) { Game.activeShop = m.shop; Game.shops[m.shop] = m.stock || []; }
    if (UI.modal === 'shop') UI.renderShop();
    else UI.openShop(m.shop);
    if (m.chime) Sound.play('coins');     // only for our own transaction
  },

  onChat(m) {
    const who = m.id === this.id ? 'You' : (m.name || 'Someone');
    UI.addMessage(who + ': ' + m.text, m.id === this.id ? 'm-you' : 'm-npc');
    // floating bubble over the speaker
    const now = performance.now();
    if (m.id === this.id) Game.player.bubble = { text: m.text, until: now + 4000 };
    else { const q = (Game.players || []).find(p => p.id === m.id); if (q) q.bubble = { text: m.text, until: now + 4000 }; }
  },

  // someone performed an emote — start the same pose on their figure locally
  onEmote(m) {
    const def = EMOTE_BY_ID[m.emote];
    if (!def) return;
    const now = performance.now();
    const e = { id: m.emote, t0: now, ms: def.ms, until: def.loop ? now + 60000 : now + def.ms };
    if (m.id === this.id) { Game.player.emote = e; UI.renderEmotes(); }
    else { const q = (Game.players || []).find(p => p.id === m.id); if (q) q.emote = e; }
  },

  onSnap(m) {
    const now = performance.now();
    const P = Game.player;
    // local player: server authoritative target, smoothed on render
    P.tx = m.me.x; P.tz = m.me.z; P.moving = m.me.moving;
    P.curHits = m.me.curHits; P.maxHits = m.me.maxHits;
    P.splat = m.me.splat; P.showHpUntil = m.me.showHp ? now + (m.me.showHp - Date.now()) : P.showHpUntil;
    if (m.me.splat) P.splat = { v: m.me.splat.v, until: now + 800 };
    P.showHpUntil = m.me.showHp && m.me.showHp > Date.now() ? now + 5000 : 0;

    // other players: reconcile list, preserve rendered positions for smoothing
    const prevP = new Map((Game.players || []).map(p => [p.id, p]));
    Game.players = m.players.map(q => {
      const old = prevP.get(q.id);
      const r = old || { x: q.x, z: q.z, bubble: null };
      r.id = q.id; r.name = q.name; r.tx = q.x; r.tz = q.z; r.moving = q.moving;
      r.curHits = q.curHits; r.maxHits = q.maxHits; r.layer = P.layer;
      r.splat = q.splat ? { v: q.splat.v, until: now + 800 } : r.splat;
      r.showHpUntil = q.showHp && q.showHp > Date.now() ? now + 5000 : 0;
      if (r.x === undefined) { r.x = q.x; r.z = q.z; }
      return r;
    });

    // npcs
    const prevN = new Map((Game.npcs || []).map(n => [n.id, n]));
    Game.npcs = m.npcs.map(s => {
      const old = prevN.get(s.id);
      const n = old || { fx: s.fx, fz: s.fz };
      n.id = s.id; n.type = s.type; n.tfx = s.fx; n.tfz = s.fz; n.moving = s.moving;
      n.hits = s.hits; n.maxHits = s.maxHits; n.layer = P.layer; n.deadUntil = 0;
      n.splat = s.splat ? { v: s.splat.v, until: now + 800 } : n.splat;
      n.showHpUntil = s.showHp && s.showHp > Date.now() ? now + 5000 : 0;
      n.faceX = s.fcx == null ? null : s.fcx; n.faceZ = s.fcz;
      // the server bumps a sequence per strike; play one locally whenever it changes,
      // so a swing is never lost to a snapshot arriving mid-animation
      if (s.sw && s.sw !== n._sw) { n._sw = s.sw; n.swingKind = s.swk; n.swingUntil = now + 350; }
      if (n.fx === undefined) { n.fx = s.fx; n.fz = s.fz; }
      return n;
    });

    Game.ground = m.ground.map(g => ({ gid: g.gid, id: g.id, qty: g.qty, noted: g.noted, x: g.x, z: g.z, layer: P.layer }));
    // the server owns events in multiplayer; we only render what it reports
    Game.eventHud = m.events || [];
    UI.renderEventBanner();
  },

  // smooth interpolation toward server targets (called each render frame)
  interpolate(dt) {
    const k = 1 - Math.exp(-dt * 14);
    const P = Game.player;
    if (P.tx !== undefined) { P.x += (P.tx - P.x) * k; P.z += (P.tz - P.z) * k; }
    for (const q of (Game.players || [])) { q.x += (q.tx - q.x) * k; q.z += (q.tz - q.z) * k; }
    for (const n of (Game.npcs || [])) {
      if (n.tfx !== undefined) { n.fx += (n.tfx - n.fx) * k; n.fz += (n.tfz - n.fz) * k; }
    }
  },

  // ---------- intents (called from Game when netMode) ----------
  walk(x, z) { this.send({ t: 'walk', x, z }); },   // Game.walkTo already raised the marker
  action(a) { this.send({ t: 'action', a }); },
  chat(text) { this.send({ t: 'chat', text }); },
  emote(id) { this.send({ t: 'emote', id }); },
  eat(i) { this.send({ t: 'eat', i }); },
  drop(i) { this.send({ t: 'drop', i }); },
  wield(i) { this.send({ t: 'wield', i }); },
  unequip(slot) { this.send({ t: 'unequip', slot }); },
  style(s) { this.send({ t: 'style', style: s }); },
  run(on) { this.send({ t: 'run', on: !!on }); },

  // ---------- bank ----------
  // The authority owns the contents; these are requests, and the resulting 'bank'
  // message is what actually updates what you see.
  bankDeposit(id, qty, tab) { this.send({ t: 'bankdep', id, qty, tab }); },
  bankDepositSlot(i, qty) { this.send({ t: 'bankdepslot', i, qty }); },
  bankDepositAll() { this.send({ t: 'bankdepall' }); },
  bankWithdraw(id, qty, note) { this.send({ t: 'bankwd', id, qty, note: !!note }); },
  bankTab(id, tab) { this.send({ t: 'banktab', id, tab }); },
  bankClose() { this.send({ t: 'bankclose' }); },

  // ---------- shops ----------
  // Stock is shared, so the reply may also arrive because *someone else* bought
  // something at the same counter.
  shopOpen(npcId) { this.send({ t: 'shopopen', npcId }); },
  buy(id, qty) { this.send({ t: 'buy', id, qty }); },
  sell(id, qty) { this.send({ t: 'sell', id, qty }); },
  shopClose() { this.send({ t: 'shopclose' }); },

  // Firemaking creates scenery under your feet rather than acting on some, so it is
  // its own intent rather than an action with a target.
  firemake(id) { this.send({ t: 'firemake', id }); },

  // Only ever a request. The sim re-checks the step's requirements before it moves.
  questStep(id) { this.send({ t: 'quest', id }); },

  // One intent for every "use item on item" recipe. `qty` batches, so "make all"
  // is one message rather than twenty-eight.
  craft(kind, arg, qty) { this.send({ t: 'craft', kind, arg, qty: qty || 1 }); }
};
