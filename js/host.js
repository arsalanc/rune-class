'use strict';
// Peer-to-peer host. One player's browser tab becomes the authoritative server: it
// runs the same `Sim` the Node server runs, listens for friends through the PeerJS
// signalling broker, authenticates them with CPace (js/pake.js) and keeps their
// character saves in IndexedDB (js/store.js).
//
// Nothing here is trusted to the broker. The broker learns that two peers want to
// talk and relays their WebRTC offers; every byte of game traffic after the handshake
// is AES-GCM under a key it cannot derive.
//
// LOGIN MODEL — one password per character, an invite code only for newcomers:
//
//   returning player   CPace against the *character's* stored credential
//   new player         CPace against the world's *invite code*, then registers a
//                      character password inside the resulting encrypted channel
//
// The invite code is what you hand out alongside the world ID. It gates registration
// so a stranger who guesses your world ID cannot create characters, and it means
// first contact is already authenticated — there is no trust-on-first-use window
// where the broker could slip in as the middle.

const Host = {
  peer: null,
  sim: null,
  world: null,               // { key:'world', id, inviteSalt, invitePrs }
  clients: new Map(),        // sim player id -> client
  running: false,
  status: 'offline',         // offline | starting | online | error
  statusText: '',
  onChange: null,            // UI hook, fired whenever status or the roster moves

  _timer: 0,
  _acc: 0,
  _last: 0,
  _saveAcc: 0,
  _fails: new Map(),         // peer/account key -> { n, until }

  DT: 0.15,                  // sim step, matching server.js
  MAX_CATCHUP: 8,            // steps per wake-up; see _tick()

  // ---------- identity ----------
  // PeerJS ids share one global namespace on the public broker, so this needs enough
  // entropy to not collide with a stranger — and to not be guessable, since knowing
  // the id is the first half of finding the world. Ambiguous glyphs are left out so
  // the id survives being read aloud or copied by hand.
  ALPHABET: 'abcdefghjkmnpqrstuvwxyz23456789',
  randomId(n) {
    const b = new Uint8Array(n); crypto.getRandomValues(b);
    let s = ''; for (let i = 0; i < n; i++) s += this.ALPHABET[b[i] % this.ALPHABET.length];
    return s;
  },
  newWorldId() { return 'rc-' + this.randomId(6) + '-' + this.randomId(6); },
  newInviteCode() { return this.randomId(4) + '-' + this.randomId(4) + '-' + this.randomId(4); },

  normName(n) { return String(n || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 16); },
  validName(n) { return /^[a-z0-9][a-z0-9 _-]{1,15}$/.test(n); },

  // The CPace channel identifier. Both halves must build this byte-for-byte
  // identically or the generators diverge and the handshake fails, so guest and host
  // share this one definition — net.js calls it too. Binding the world id and the
  // character name in means a share captured from one handshake is useless in any
  // other world or against any other character.
  channelId(worldId, normalisedName) { return 'rune-classic/1|' + worldId + '|' + normalisedName; },

  // ---------- world config ----------
  // The world identity is created once and reused, so a host who refreshes keeps the
  // same id and invite code and does not have to re-brief their friends.
  async loadWorld() {
    let w = null;
    try { w = await Store.get('meta', 'world'); } catch (e) { /* fresh or unavailable */ }
    this.world = w || null;
    return this.world;
  },
  async createWorld(inviteCode) {
    const salt = PAKE.newSalt();
    const prs = await PAKE.derivePRS(inviteCode, salt);
    const w = {
      key: 'world', id: this.newWorldId(), invite: inviteCode,
      inviteSalt: PAKE.toB64(salt), invitePrs: PAKE.toB64(prs), created: Date.now()
    };
    await Store.put('meta', w);
    this.world = w;
    return w;
  },
  async setInvite(code) {
    const salt = PAKE.newSalt();
    const prs = await PAKE.derivePRS(code, salt);
    this.world.invite = code;
    this.world.inviteSalt = PAKE.toB64(salt);
    this.world.invitePrs = PAKE.toB64(prs);
    await Store.put('meta', this.world);
  },
  async resetWorldId() {
    this.world.id = this.newWorldId();
    await Store.put('meta', this.world);
    return this.world.id;
  },

  // ---------- accounts ----------
  async account(name) { try { return await Store.get('accounts', this.normName(name)); } catch (e) { return null; } },
  async listAccounts() { try { return await Store.all('accounts'); } catch (e) { return []; } },
  async putAccount(a) { try { await Store.put('accounts', a); } catch (e) { /* quota or private mode */ } },

  // Persist a live sim player back onto their account row.
  async persist(client) {
    if (!client || !client.pid) return;
    const p = this.sim.players.get(client.pid);
    if (!p) return;
    const a = (await this.account(client.name)) || { name: this.normName(client.name) };
    a.display = client.display || a.display || client.name;
    a.save = this.sim.toSave(p);
    a.lastSeen = Date.now();
    await this.putAccount(a);
  },

  // ---------- failure throttling ----------
  // An online guess is the only attack CPace leaves open, so make guesses expensive
  // in wall-clock terms. Keyed by remote peer AND account so one noisy peer cannot
  // lock a character out for everyone.
  blocked(key) { const f = this._fails.get(key); return !!(f && f.n >= 5 && Date.now() < f.until); },
  noteFail(key) {
    const f = this._fails.get(key) || { n: 0, until: 0 };
    f.n++; f.until = Date.now() + Math.min(60000, 1000 * Math.pow(2, f.n));
    this._fails.set(key, f);
  },
  clearFail(key) { this._fails.delete(key); },

  // ---------- lifecycle ----------
  async start(opts) {
    opts = opts || {};
    if (this.running) return this.world;
    if (!PAKE.available()) throw new Error(PAKE.unavailableReason());
    if (typeof Peer === 'undefined') throw new Error('PeerJS failed to load (js/vendor/peerjs.min.js).');

    await this.loadWorld();
    if (!this.world) await this.createWorld(opts.invite || this.newInviteCode());
    else if (opts.invite && opts.invite !== this.world.invite) await this.setInvite(opts.invite);

    this.sim = new Sim();
    this.clients.clear();
    this.running = true;
    this._setStatus('starting', 'Registering with the signalling broker…');

    await this._openPeer();
    this._startLoop();
    return this.world;
  },

  _openPeer() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const peer = new Peer(this.world.id, { debug: 0 });
      this.peer = peer;

      peer.on('open', (id) => {
        settled = true;
        this._setStatus('online', 'World open. Share the ID and invite code.');
        resolve(id);
      });
      peer.on('connection', (conn) => this._onConnection(conn));
      peer.on('error', (err) => {
        const type = err && err.type;
        // The broker holds an id for up to a minute after a tab closes, so a quick
        // refresh lands here. Minting a fresh id is friendlier than making the host
        // wait it out — but it does mean re-sharing the id, so we say so.
        if (type === 'unavailable-id' && !settled) {
          settled = true;
          this.resetWorldId().then((id) => {
            this._setStatus('starting', 'Previous world ID still held by the broker — switched to ' + id + '.');
            try { peer.destroy(); } catch (e) {}
            this._openPeer().then(resolve, reject);
          });
          return;
        }
        if (!settled) { settled = true; this.running = false; this._setStatus('error', this._peerError(err)); reject(new Error(this._peerError(err))); }
        else this._setStatus(this.peer && !this.peer.disconnected ? 'online' : 'error', this._peerError(err));
      });
      peer.on('disconnected', () => {
        if (!this.running) return;
        this._setStatus('starting', 'Lost the broker — reconnecting…');
        try { peer.reconnect(); } catch (e) {}
      });
    });
  },

  _peerError(err) {
    const t = err && err.type;
    if (t === 'browser-incompatible') return 'This browser cannot do WebRTC data channels.';
    if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Cannot reach the signalling broker. Check your connection.';
    if (t === 'unavailable-id') return 'That world ID is already taken on the broker.';
    if (t === 'ssl-unavailable') return 'The broker needs an https:// page.';
    return (err && err.message) || 'Networking error.';
  },

  async stop() {
    this.running = false;
    if (this._timer) { clearInterval(this._timer); this._timer = 0; }
    for (const c of [...this.clients.values()]) { try { await this.persist(c); } catch (e) {} c.close(true); }
    this.clients.clear();
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
    this.sim = null;
    this._setStatus('offline', '');
  },

  _setStatus(s, text) { this.status = s; this.statusText = text || ''; if (this.onChange) this.onChange(this); },

  // ---------- main loop ----------
  _startLoop() {
    this._last = performance.now(); this._acc = 0; this._saveAcc = 0;
    // Wake more often than the step so the accumulator stays tight when the tab is
    // active. Background tabs get clamped to ~1 Hz by the browser, which is why the
    // step below is driven by elapsed time rather than by tick count.
    this._timer = setInterval(() => this._tick(), 50);
  },

  _tick() {
    if (!this.running || !this.sim) return;
    const now = performance.now();
    let elapsed = (now - this._last) / 1000;
    this._last = now;
    if (elapsed > 5) elapsed = 5;         // returning from sleep: skip the lost time
    this._acc += elapsed;

    // Catch up on missed steps so a throttled tab keeps roughly correct game time
    // instead of running in slow motion. Capped so a long stall cannot produce a
    // burst of work that stalls us again.
    let steps = 0;
    while (this._acc >= this.DT && steps < this.MAX_CATCHUP) { this.sim.step(this.DT); this._acc -= this.DT; steps++; }
    if (steps === this.MAX_CATCHUP) this._acc = 0;
    if (!steps) return;

    this._flush();
    for (const c of this.clients.values()) {
      const p = this.sim.players.get(c.pid);
      if (p) c.send(this.sim.snapshotFor(p));
    }

    this._saveAcc += elapsed;
    if (this._saveAcc >= 30) { this._saveAcc = 0; for (const c of this.clients.values()) this.persist(c); }
  },

  // Route the sim's event queue to the right sockets — the browser twin of
  // server.js's flushEvents().
  _flush() {
    for (const e of this.sim.drain()) {
      if (e.kind === 'to') { const c = this.clients.get(e.id); if (c) c.send(e.msg); }
      else if (e.kind === 'scenery') this.broadcast({ t: 'scenery', layer: e.layer, key: e.key, x: e.x, z: e.z, stype: e.stype });
      else if (e.kind === 'chat') this.broadcast({ t: 'chat', id: e.id, name: e.name, text: e.text });
      else if (e.kind === 'announce') this.broadcast({ t: 'msg', text: e.text, cls: e.cls });
      else if (e.kind === 'emote') this.broadcast({ t: 'emote', id: e.id, emote: e.emote });
      else if (e.kind === 'join') this.broadcast({ t: 'online', id: e.id, name: e.name, join: true }, e.id);
      else if (e.kind === 'leave') this.broadcast({ t: 'online', id: e.id, name: e.name, join: false });
    }
  },

  broadcast(msg, exceptId) {
    for (const [id, c] of this.clients) { if (id === exceptId) continue; c.send(msg); }
  },

  // ---------- admitting a player ----------
  // Shared by remote peers and by the host's own local player: build the sim player
  // from their save, wire up a client record, and send the welcome.
  _admit(display, account, transport) {
    const p = this.sim.addPlayer(display, (account && account.save) || null);
    const client = {
      pid: p.id,
      name: this.normName(display),
      display,
      local: !!transport.local,
      send: transport.send,
      close: (silent) => {
        if (!this.clients.has(p.id)) return;
        this.clients.delete(p.id);
        if (this.sim) this.sim.removePlayer(p.id);
        if (!silent) this._flush();
        transport.close();
        if (this.onChange) this.onChange(this);
      }
    };
    this.clients.set(p.id, client);

    client.send({
      t: 'welcome', id: p.id, name: display,
      you: {
        xp: p.xp, curHits: p.curHits, maxHits: this.sim.maxHits(p), inv: p.inv, worn: p.worn,
        style: p.style, x: p.x, z: p.z, layer: p.layer, run: !!p.run
      },
      overrides: this.sim.allOverrides(),
      online: [...this.sim.players.values()].map(q => ({ id: q.id, name: q.name }))
    });
    this._flush();
    if (this.onChange) this.onChange(this);
    return client;
  },

  // The same intent switch as server.js. Everything a client can ask for goes
  // through here, and the sim decides whether it is legal — a client is never
  // trusted with its own state.
  _intent(client, m) {
    const p = this.sim && this.sim.players.get(client.pid);
    if (!p) return;
    switch (m.t) {
      case 'walk': this.sim.intentWalk(p, m.x | 0, m.z | 0); break;
      case 'action': this.sim.intentAction(p, m.a || {}); break;
      case 'chat': this.sim.intentChat(p, m.text); break;
      case 'emote': this.sim.intentEmote(p, m.id); break;
      case 'eat': this.sim.intentEat(p, 0, m.i | 0); break;
      case 'drop': this.sim.intentDrop(p, m.i | 0); break;
      case 'wield': this.sim.intentWield(p, m.i | 0); break;
      case 'unequip': this.sim.intentUnequip(p, String(m.slot || '')); break;
      case 'style': if (m.style >= 0 && m.style < 4) { p.style = m.style | 0; this.sim.pushStats(p); } break;
      case 'run': this.sim.intentRun(p, !!m.on); break;
      case 'bankdep': this.sim.intentBankDeposit(p, String(m.id || ''), m.qty | 0, m.tab | 0); break;
      case 'bankdepslot': this.sim.intentBankDepositSlot(p, m.i | 0, m.qty | 0); break;
      case 'bankdepall': this.sim.intentBankDepositAll(p); break;
      case 'bankwd': this.sim.intentBankWithdraw(p, String(m.id || ''), m.qty | 0, !!m.note); break;
      case 'banktab': this.sim.intentBankTab(p, String(m.id || ''), m.tab | 0); break;
      case 'bankclose': this.sim.closeBank(p); break;
    }
    this._flush();
  },

  // ---------- the host's own player ----------
  // No handshake: this player is already inside the tab that owns the sim, so there
  // is nothing to authenticate and nothing to encrypt. Messages are handed straight
  // to the client code as objects.
  async attachLocal(display, deliver) {
    const name = this.normName(display);
    const existing = await this.account(name);
    if (existing && existing.remote) throw new Error('“' + display + '” is a visiting player\'s character on this world.');
    const account = existing || { name, display, local: true, created: Date.now() };
    if (!existing) await this.putAccount(account);

    const client = this._admit(display, account, {
      local: true,
      // A macrotask, not a microtask: _admit emits the welcome before attachLocal
      // has returned, and the caller wires up its transport on the awaited result.
      // Deferring past the microtask queue guarantees it is ready to receive.
      send: (msg) => setTimeout(() => deliver(msg), 0),
      close: () => {}
    });
    return {
      send: (m) => this._intent(client, m),
      close: () => { this.persist(client); client.close(); }
    };
  },

  // ---------- remote peers: handshake then play ----------
  _onConnection(conn) {
    const st = {
      conn, phase: 'hello', client: null, rec: null, sendRec: null,
      name: '', display: '', mode: '', sid: null, y: null, Yg: null, Yh: null,
      keys: null, account: null,
      // Two independent chains. Inbound keeps the handshake in sequence and opens
      // record frames in arrival order; outbound keeps seal()'s nonce counters going
      // out in the order they were assigned. Sharing one chain would let a send
      // queued during message handling reorder against the handler itself.
      inQ: Promise.resolve(), outQ: Promise.resolve()
    };

    // Anything that hasn't authenticated within 30s is dropped, so half-finished
    // handshakes cannot pile up on the host.
    const deadline = setTimeout(() => { if (st.phase !== 'play') this._reject(st, 'Handshake timed out.'); }, 30000);

    conn.on('open', () => {
      try { if (conn.dataChannel) conn.dataChannel.binaryType = 'arraybuffer'; } catch (e) {}
    });
    conn.on('data', (data) => {
      // Serialise handling: the handshake is a strict sequence, and once encrypted
      // the record layer needs frames opened in the order they arrived.
      st.inQ = st.inQ.then(() => this._onData(st, data)).catch(() => this._reject(st, 'Protocol error.'));
    });
    conn.on('close', () => { clearTimeout(deadline); this._dropConn(st); });
    conn.on('error', () => { clearTimeout(deadline); this._dropConn(st); });
  },

  _dropConn(st) {
    // Capture before clearing: persist() is async, and 'close' can fire twice, so
    // the callback must not depend on st.client still being set when it runs.
    const client = st.client;
    st.client = null;
    st.phase = 'closed';
    if (client) this.persist(client).then(() => client.close(), () => client.close());
  },

  _reject(st, reason) {
    try { st.conn.send(JSON.stringify({ t: 'authfail', reason })); } catch (e) {}
    st.phase = 'closed';
    setTimeout(() => { try { st.conn.close(); } catch (e) {} }, 100);
  },

  async _onData(st, data) {
    if (st.phase === 'closed') return;

    // Once the keys are confirmed every inbound byte is a sealed binary frame; before
    // that, every inbound byte is a JSON string. Mixing the two is a protocol error,
    // so the binary phases are handled first and never reach the JSON parse below.
    if (st.phase === 'play' || st.phase === 'register') {
      if (typeof data === 'string') return;
      const msg = await st.rec.open(data instanceof Uint8Array ? data : new Uint8Array(data));
      if (!msg) return;                                  // forged, replayed or corrupt
      if (st.phase === 'register') return this._register(st, msg);
      if (msg.t === 'register') return;                  // registration is a one-shot
      this._intent(st.client, msg);
      return;
    }

    let m; try { m = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)); } catch (e) { return this._reject(st, 'Bad message.'); }

    // --- step 1: who do you claim to be? ---
    if (st.phase === 'hello' && m.t === 'hello') {
      const name = this.normName(m.name);
      if (!this.validName(name)) return this._reject(st, 'Pick a name of 2–16 letters, digits, spaces, - or _.');
      if ([...this.clients.values()].some(c => c.name === name)) return this._reject(st, 'That character is already logged in.');
      if (this.blocked(st.conn.peer) || this.blocked(name)) return this._reject(st, 'Too many failed attempts. Wait a minute and try again.');

      const acct = await this.account(name);
      if (acct && acct.local) return this._reject(st, 'That name belongs to the host\'s own character.');

      st.name = name;
      st.display = String(m.name).trim().slice(0, 16);
      st.account = acct;
      // Which secret this handshake runs on — the character's, or the world invite
      // for someone who has no character here yet.
      st.mode = acct ? 'login' : 'register';
      st.sid = PAKE.newSid();
      st.phase = 'cpace';
      st.conn.send(JSON.stringify({
        t: 'auth', v: 1, mode: st.mode, sid: PAKE.toB64(st.sid),
        salt: acct ? acct.salt : this.world.inviteSalt
      }));
      return;
    }

    // --- step 2: CPace shares ---
    if (st.phase === 'cpace' && m.t === 'cpace') {
      const prs = PAKE.fromB64(st.mode === 'login' ? st.account.prs : this.world.invitePrs);
      const ci = this._ci(st.name);
      const mine = await PAKE.cpaceStart(prs, st.sid, ci);
      st.y = mine.y; st.Yh = mine.Y;
      st.Yg = PAKE.fromB64(m.Y);

      const K = PAKE.cpaceFinish(st.y, st.Yg);
      if (!K) return this._reject(st, 'Bad key exchange.');
      const isk = await PAKE.intermediateKey(K, st.sid, st.Yg, st.Yh);
      st.keys = await PAKE.sessionKeys(isk);

      st.phase = 'confirm';
      st.conn.send(JSON.stringify({ t: 'cpace', Y: PAKE.toB64(st.Yh) }));
      return;
    }

    // --- step 3: prove the shared key, then open the encrypted channel ---
    if (st.phase === 'confirm' && m.t === 'confirm') {
      const expect = await PAKE.confirmTag(st.keys.mac, 'guest-confirm', st.sid, st.Yg, st.Yh);
      if (!PAKE.equalCT(expect, PAKE.fromB64(m.mac))) {
        this.noteFail(st.conn.peer); this.noteFail(st.name);
        return this._reject(st, st.mode === 'login' ? 'Wrong password for that character.' : 'Wrong invite code.');
      }
      this.clearFail(st.conn.peer); this.clearFail(st.name);

      const tag = await PAKE.confirmTag(st.keys.mac, 'host-confirm', st.sid, st.Yg, st.Yh);
      st.conn.send(JSON.stringify({ t: 'confirm', mac: PAKE.toB64(tag) }));

      // Host receives on the guest→host key and sends on host→guest.
      st.rec = await PAKE.record(st.keys.g2h, 'g2h');
      st.sendRec = await PAKE.record(st.keys.h2g, 'h2g');
      st.phase = st.mode === 'register' ? 'register' : 'play';
      if (st.mode === 'login') this._enterWorld(st);
      return;
    }

    return this._reject(st, 'Unexpected message.');
  },

  // --- step 4 (new characters only): record the character's own password ---
  // Runs inside the encrypted channel, so the credential the host stores never
  // reaches the broker or the network in any form.
  async _register(st, msg) {
    if (!msg || msg.t !== 'register' || !msg.salt || !msg.prs) return this._reject(st, 'Registration failed.');
    if (await this.account(st.name)) return this._reject(st, 'That character was just taken.');
    st.account = {
      name: st.name, display: st.display, remote: true,
      salt: String(msg.salt).slice(0, 64), prs: String(msg.prs).slice(0, 64),
      created: Date.now()
    };
    await this.putAccount(st.account);
    st.phase = 'play';
    this._enterWorld(st);
  },

  _ci(name) { return this.channelId(this.world.id, name); },

  _enterWorld(st) {
    const send = (msg) => {
      // seal() assigns nonce counters in call order and the receiver rejects
      // anything out of order, so these awaits must never interleave.
      st.outQ = st.outQ.then(async () => {
        if (st.phase === 'closed') return;
        const frame = await st.sendRec.seal(msg);
        try { st.conn.send(frame); } catch (e) {}
      }).catch(() => {});
    };
    st.client = this._admit(st.display, st.account, {
      send,
      close: () => { try { st.conn.close(); } catch (e) {} }
    });
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { Host };
