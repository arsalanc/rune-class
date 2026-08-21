'use strict';
const UI = {
  keys: {}, els: {}, modal: null, // modal: null | 'bank' | 'shop'

  init() {
    const $ = id => document.getElementById(id);
    this.els = {
      chat: $('chat'), menu: $('ctxmenu'), inv: $('invgrid'), equip: $('equip'), stats: $('statlist'),
      pray: $('praylist'), magic: $('magiclist'), quest: $('questlist'),
      combat: $('combatpanel'), emotes: $('emotelist'),
      hover: $('hover'), mm: $('minimap'),
      modal: $('modal'), mtitle: $('modal-title'), mnote: $('modal-note'), mgrid: $('modal-grid'), mbar: $('modal-bar'), mfoot: $('modal-foot'),
      hpFill: $('hud-hp-fill'), hpTxt: $('hud-hp-txt'), prayFill: $('hud-pray-fill'), prayTxt: $('hud-pray-txt'),
      runBtn: $('hud-run'), levelup: $('levelup'),
      worldmap: $('worldmap'), wm: $('wmcanvas'),
      guide: $('guide'), guideTitle: $('guide-title'), guideBody: $('guide-body'),
      dlgBox: $('dialoguebox'), dlgPortrait: $('dlg-portrait'), dlgName: $('dlg-name'), dlgText: $('dlg-text'),
      dlgChoices: $('dlg-choices'), dlgCont: $('dlg-cont')
    };
    this.mmctx = this.els.mm.getContext('2d');
    this.wmctx = this.els.wm.getContext('2d');

    // inventory drag-to-rearrange: track movement, resolve on release (see renderInventory)
    document.addEventListener('mousemove', e => {
      if (this._drag && !this._drag.moved && (Math.abs(e.clientX - this._drag.sx) > 4 || Math.abs(e.clientY - this._drag.sy) > 4)) {
        this._drag.moved = true; this.els.inv.classList.add('dragging');
      }
    });
    document.addEventListener('mouseup', () => {
      if (!this._drag) return;
      const d = this._drag; this._drag = null; this.els.inv.classList.remove('dragging');
      if (!d.moved) Game.invClick(d.from); // a plain click that never dragged
    });

    const TAB_NAMES = { inv: 'Inventory', worn: 'Worn Equipment', combat: 'Combat Options', stats: 'Skills', pray: 'Prayer', magic: 'Magic', quest: 'Quests', emotes: 'Emotes', opts: 'Options' };
    // both bars share the .tab class, so one handler drives top and bottom
    document.querySelectorAll('.tab').forEach(b => {
      const tab = b.dataset.tab;
      b.title = TAB_NAMES[tab] || tab;
      b.textContent = '';
      b.appendChild(ItemIcons.tabEl(tab)); // RS-style icon instead of a text label
      b.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === b));
        document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
        $('panel-' + tab).classList.remove('hidden');
      });
    });

    // Alt+drag to reposition HUD panels; positions persist per-browser
    ['hud', 'minimap-wrap', 'side', 'chat'].forEach(id => this.makeDraggable($(id)));
    this.loadHudLayout();
    // if the window shrinks (e.g. leaving fullscreen), keep moved panels on-screen & reachable
    window.addEventListener('resize', () => this.clampHud());
    $('btn-save').addEventListener('click', () => { Game.save(); this.addMessage('Game saved.', 'm-game'); });
    $('btn-hud-reset').addEventListener('click', () => this.resetHudLayout());
    this.els.dlgBox.addEventListener('click', () => this.advanceDialogue());
    $('btn-reset').addEventListener('click', () => { if (confirm('Reset your save and start over?')) Game.reset(); });
    $('btn-sound').addEventListener('click', () => {
      Sound.muted = !Sound.muted;
      $('btn-sound').textContent = Sound.muted ? 'Sound: off' : 'Sound: on';
    });
    $('btn-renderer').addEventListener('click', () => {
      const on = Renderer === GLRenderer;          // currently WebGL?
      if (!on && !GLRenderer.supported()) { this.addMessage('WebGL is not available in this browser.', 'm-red'); return; }
      localStorage.setItem('rc_gl', on ? '0' : '1'); // turn it off / back on
      Game.save();
      location.reload();
    });
    $('btn-music').addEventListener('click', () => {
      Sound.ensure();
      if (Sound.musicOff) Sound.startMusic(); else Sound.stopMusic();
      $('btn-music').textContent = Sound.musicOff ? 'Music: off' : 'Music: on';
    });
    // minimap click-to-walk
    this.els.mm.addEventListener('mousedown', e => {
      const T = 3, N = 156 / T, half = N / 2 | 0;
      const P = Game.player;
      const tx = Math.floor(P.x) + Math.floor(e.offsetX / T) - half;
      const tz = Math.floor(P.z) + Math.floor(e.offsetY / T) - half;
      if (tx >= 0 && tz >= 0 && tx < World.SIZE && tz < World.SIZE) Game.walkTo(tx, tz);
    });
    $('modal-close').addEventListener('click', () => this.closeModal());
    window.addEventListener('mousedown', () => Sound.ensure(), { once: true });

    // world map, guide, run, HUD
    $('btn-map').addEventListener('click', () => this.toggleMap());
    $('wm-close').addEventListener('click', () => this.els.worldmap.classList.add('hidden'));
    // world map: drag to pan, wheel to zoom, click to travel
    this.els.wm.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      this._wmDrag = { x: e.clientX, y: e.clientY, px: this.wmPan.x, pz: this.wmPan.z };
      this._wmDragged = false;
    });
    window.addEventListener('mousemove', e => {
      if (!this._wmDrag) return;
      const dx = e.clientX - this._wmDrag.x, dy = e.clientY - this._wmDrag.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._wmDragged = true;
      this.wmPan.x = this._wmDrag.px - dx; this.wmPan.z = this._wmDrag.pz - dy;
      this.clampMapPan(); this.drawWorldMap();
    });
    window.addEventListener('mouseup', () => { this._wmDrag = null; });
    this.els.wm.addEventListener('click', e => this.mapClick(e));
    this.els.wm.addEventListener('wheel', e => {
      e.preventDefault();
      this.setMapZoom(this.wmZoom * (e.deltaY > 0 ? 0.82 : 1.22), { x: e.offsetX, z: e.offsetY });
    }, { passive: false });
    $('wm-zin').addEventListener('click', () => this.setMapZoom(this.wmZoom * 1.35));
    $('wm-zout').addEventListener('click', () => this.setMapZoom(this.wmZoom / 1.35));
    $('wm-fit').addEventListener('click', () => { this.wmFit(); this.drawWorldMap(); });
    $('wm-me').addEventListener('click', () => this.findMe());
    document.querySelectorAll('.wm-layer').forEach(b => b.addEventListener('click', () => {
      this.wmLayer = +b.dataset.layer;
      this.renderMapKey(); this.drawWorldMap();
    }));
    $('guide-close').addEventListener('click', () => this.els.guide.classList.add('hidden'));
    this.els.runBtn.addEventListener('click', () => this.toggleRun());

    this.initMultiplayer($);
    // Chat bar: Enter opens and sends. It used to be multiplayer-only, but the
    // ::emote commands are worth having in singleplayer too, so it opens either
    // way and only actually transmits when connected.
    const chatInput = $('chatinput');
    window.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const bar = $('chatbar');
      if (document.activeElement === chatInput) {
        const v = chatInput.value.trim();
        if (v) this.submitChat(v);
        chatInput.value = ''; chatInput.blur();
        if (!Net.active) bar.classList.add('hidden');
      } else { bar.classList.remove('hidden'); chatInput.focus(); }
    });

    const cv = Renderer.canvas;
    // Suppress the browser's native menu everywhere, so only in-game menus show
    document.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => {
      this.hideMenu();
      if (this.dialogueOpen && e.button !== 1) { this.advanceDialogue(); return; } // click through dialogue
      if (e.button === 1) { // middle-drag rotates the camera
        this._drag = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }
      const pick = Renderer.pickAll(e.offsetX, e.offsetY);
      const opts = this.gatherOptions(pick);
      if (e.button === 0) {
        if (opts.length) opts[0].cb();
      } else if (e.button === 2) {
        opts.push({ label: 'Cancel', cb: () => {} });
        this.showMenu(e.clientX, e.clientY, opts);
      }
    });
    window.addEventListener('mouseup', e => { if (e.button === 1) this._drag = null; });
    cv.addEventListener('mousemove', e => {
      if (this._drag) {
        Renderer.yaw -= (e.clientX - this._drag.x) * 0.008;
        Renderer.pitch = Math.max(0.35, Math.min(1.15, Renderer.pitch + (e.clientY - this._drag.y) * 0.004));
        this._drag = { x: e.clientX, y: e.clientY };
        return;
      }
      const pick = Renderer.pickAll(e.offsetX, e.offsetY);
      const opts = this.gatherOptions(pick);
      this.els.hover.innerHTML = opts.length
        ? this.optLabelHTML(opts[0]) + (opts.length > 1 ? ' <span class="more">/ ' + (opts.length - 1) + ' more options</span>' : '')
        : '';
    });
    cv.addEventListener('wheel', e => {
      Renderer.dist = Math.max(7, Math.min(24, Renderer.dist + (e.deltaY > 0 ? 1.2 : -1.2)));
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('keydown', e => {
      this.keys[e.key] = true;
      if (e.key.startsWith('Arrow')) e.preventDefault();
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      if (this.dialogueOpen && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); this.advanceDialogue(); return; }
      if (e.key === 'Escape') { if (this.dialogueOpen) { this.closeDialogue(); return; } this.hideMenu(); this.closeModal(); this.els.worldmap.classList.add('hidden'); this.els.guide.classList.add('hidden'); }
      if (e.key === 'm' || e.key === 'M') this.toggleMap();
      if (e.key === 'r' || e.key === 'R') this.toggleRun();
    });
    window.addEventListener('keyup', e => { this.keys[e.key] = false; });
    window.addEventListener('mousedown', e => {
      if (!this.els.menu.contains(e.target) && e.target !== Renderer.canvas) this.hideMenu();
    });
  },

  // Overlapping click boxes are ranked RS2-style rather than purely by depth:
  //   1. things offering a real action beat examine-only scenery, so a tall town wall
  //      can't steal the left-click from the ladder standing in front of it;
  //   2. within that, the original (nearest-first) order is kept;
  //   3. Examine is always pushed to the bottom of the whole list.
  gatherOptions(pick) {
    const isExamine = o => /^Examine\b/.test(o.label);
    const groups = pick.ents.map(ref => Game.optionsFor(ref));
    if (pick.tile) groups.push(Game.optionsFor(pick.tile));
    const scored = groups.map((g, i) => ({ g, i, real: g.some(o => !isExamine(o)) ? 1 : 0 }));
    scored.sort((a, b) => (b.real - a.real) || (a.i - b.i));
    const actions = [], examines = [];
    for (const s of scored) for (const o of s.g) (isExamine(o) ? examines : actions).push(o);
    return actions.concat(examines);
  },
  // option label as HTML; colours the "(level-N)" on attack options by threat
  optLabelHTML(o) {
    let s = String(o.label).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (o.lvlCol) s = s.replace(/(\(level-\d+\))/, '<span style="color:' + o.lvlCol + '">$1</span>');
    return s;
  },

  // ---------- multiplayer panel ----------
  // Three ways in — join a friend's browser world, host one here, or the original
  // Node server for LAN play. Only one can be live at a time; once connected the
  // whole panel locks so there's no way to half-join a second world.
  initMultiplayer($) {
    const status = $('mp-status');
    const say = (text, cls) => { status.textContent = text || ''; status.className = 'mp-status' + (cls ? ' ' + cls : ''); };
    const busy = (on) => { for (const b of ['btn-join', 'btn-host', 'btn-connect']) $(b).disabled = on; };
    Net.onStatus = (text, cls) => say(text, cls === 'm-red' ? 'bad' : '');

    for (const t of document.querySelectorAll('#mp-tabs .mp-tab')) {
      t.addEventListener('click', () => {
        for (const o of document.querySelectorAll('#mp-tabs .mp-tab')) o.classList.toggle('active', o === t);
        for (const p of document.querySelectorAll('.mp-pane')) p.classList.add('hidden');
        $('mp-pane-' + t.dataset.mp).classList.remove('hidden');
        say('');
      });
    }

    for (const b of document.querySelectorAll('.mp-copy')) {
      b.addEventListener('click', async () => {
        const text = $(b.dataset.copy).textContent;
        try { await navigator.clipboard.writeText(text); b.textContent = 'copied'; }
        catch (e) { b.textContent = 'copy failed'; }   // denied permission, or an insecure page
        setTimeout(() => { b.textContent = 'copy'; }, 1200);
      });
    }

    // `needsCrypto` is false for LAN: a plain WebSocket to your own server needs
    // neither WebRTC nor WebCrypto, so it must keep working from file:// where both
    // are unavailable.
    const guard = (needsCrypto) => {
      if (Net.active || Net.mode) { say('You are already in a world. Reload to leave.', 'bad'); return false; }
      if (needsCrypto && !PAKE.available()) { say(PAKE.unavailableReason(), 'bad'); return false; }
      return true;
    };

    // --- join ---
    $('btn-join').addEventListener('click', async () => {
      if (!guard(true)) return;
      const worldId = $('mp-world').value.trim();
      const name = $('mp-name').value.trim();
      const password = $('mp-pass').value;
      if (!worldId) return say('Paste the World ID your friend gave you.', 'bad');
      if (!name) return say('Pick a character name.', 'bad');
      if (password.length < 4) return say('Your character password must be at least 4 characters.', 'bad');

      busy(true);
      say('Connecting… (the key exchange takes a moment on purpose)');
      try {
        const r = await Net.joinP2P({ worldId, name, password, invite: $('mp-invite').value.trim() });
        say(r.registered ? 'Character created. Remember that password — the host cannot reset it.' : '');
        $('mp-pass').value = ''; $('mp-invite').value = '';
      } catch (e) {
        Net.disconnect();
        say(e.message || 'Could not join.', 'bad');
        busy(false);
      }
    });

    // --- host ---
    $('btn-host').addEventListener('click', async () => {
      if (!guard(true)) return;
      const name = $('mp-host-name').value.trim();
      if (!name) return say('Pick a name for your own character.', 'bad');

      busy(true);
      say('Opening your world…');
      try {
        const world = await Net.hostWorld(name);
        $('mp-host-id').textContent = world.id;
        $('mp-host-invite').textContent = world.invite;
        $('mp-host-info').classList.remove('hidden');
        Host.onChange = () => this.renderRoster($);
        this.renderRoster($);
        say('');
      } catch (e) {
        await Host.stop().catch(() => {});
        Net.disconnect();
        say(e.message || 'Could not open the world.', 'bad');
        busy(false);
      }
    });

    // --- LAN (Node server) ---
    $('btn-connect').addEventListener('click', () => {
      if (!guard(false)) return;
      busy(true);
      Net.connect($('mp-url').value, $('mp-lan-name').value || 'Adventurer');
    });

    // Closing the tab kills the world, so give the host a chance to think again —
    // and flush everyone's save on the way out either way.
    window.addEventListener('beforeunload', (e) => {
      if (Net.mode === 'host' && Host.clients.size > 1) { e.preventDefault(); e.returnValue = ''; }
      if (Net.mode === 'host') for (const c of Host.clients.values()) Host.persist(c);
    });
  },

  renderRoster($) {
    const el = $('mp-roster');
    if (!el) return;
    const names = [...Host.clients.values()].map(c => c.display + (c.local ? ' (you)' : ''));
    el.innerHTML = '<div class="mp-roster-t">In this world (' + names.length + ')</div>' +
      names.map(n => '<div class="mp-roster-n">' + n.replace(/[<&]/g, ch => (ch === '<' ? '&lt;' : '&amp;')) + '</div>').join('');
  },

  addMessage(txt, cls) {
    const chat = this.els.chat;
    // only snap to the newest line if the player is already reading the bottom,
    // so scrolling up to read history isn't yanked back down
    const atBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 30;
    const d = document.createElement('div');
    d.className = 'msg ' + (cls || 'm-game');
    d.textContent = txt;
    chat.appendChild(d);
    while (chat.children.length > 200) chat.firstChild.remove();
    if (atBottom) chat.scrollTop = chat.scrollHeight;
  },

  // ---- RS-style dialogue box (portrait + name + click-through), with chat history ----
  showDialogue(lines, npc) {
    // keep a scrollable transcript in the chat log too (skip choice nodes)
    for (const l of lines) {
      if (l.choices) continue;
      if (l[0]) this.addMessage(l[0] + ': ' + l[1], l[0] === 'You' ? 'm-you' : 'm-npc');
      else this.addMessage(l[1], 'm-quest');
    }
    this._dlg = { lines, npc, i: -1 };
    this.dialogueOpen = true;
    this.els.dlgBox.classList.remove('hidden');
    this.advanceDialogue();
  },
  _npcPortrait(npc, isYou) {
    this.els.dlgPortrait.classList.remove('hidden');
    const look = isYou ? Game.playerLook() : (NPC_LOOKS[npc && npc.type] || NPC_LOOKS.guide);
    ItemIcons.portraitEl(this.els.dlgPortrait, look, isYou ? 'player' : (npc && npc.type));
  },
  advanceDialogue() {
    const s = this._dlg; if (!s || this._dlgChoosing) return; // must pick a choice, not click past it
    s.i++;
    if (s.i >= s.lines.length) return this.closeDialogue();
    const node = s.lines[s.i];
    if (node.choices) return this.showChoices(node, s.npc);
    this.els.dlgChoices.innerHTML = ''; this.els.dlgCont.classList.remove('hidden');
    const [who, text] = node, isYou = who === 'You', isSys = !who;
    if (isSys) this.els.dlgPortrait.classList.add('hidden');
    else this._npcPortrait(s.npc, isYou);
    this.els.dlgName.textContent = isSys ? '' : (isYou ? Game.playerName() : (NPC_DEFS[s.npc && s.npc.type] ? NPC_DEFS[s.npc.type].name : who));
    this.els.dlgBox.classList.toggle('sys', isSys);
    const t = this.els.dlgText; t.textContent = text; t.classList.remove('anim'); void t.offsetWidth; t.classList.add('anim'); // retrigger fade
  },
  showChoices(node, npc) {
    this._dlgChoosing = true;
    const isYou = node.who === 'You';
    this._npcPortrait(npc, isYou);
    this.els.dlgBox.classList.remove('sys');
    this.els.dlgName.textContent = node.who || (NPC_DEFS[npc && npc.type] ? NPC_DEFS[npc.type].name : '');
    const t = this.els.dlgText; t.textContent = node.text || ''; t.classList.remove('anim'); void t.offsetWidth; t.classList.add('anim');
    this.els.dlgCont.classList.add('hidden');
    const c = this.els.dlgChoices; c.innerHTML = '';
    node.choices.forEach(opt => {
      const b = document.createElement('div'); b.className = 'dlg-choice'; b.textContent = opt.label;
      b.addEventListener('click', ev => { ev.stopPropagation(); this._dlgChoosing = false; this.closeDialogue(); if (opt.cb) opt.cb(); });
      c.appendChild(b);
    });
  },
  closeDialogue() {
    this._dlg = null; this.dialogueOpen = false; this._dlgChoosing = false;
    this.els.dlgChoices.innerHTML = '';
    this.els.dlgBox.classList.add('hidden');
  },

  showMenu(x, y, opts) {
    const m = this.els.menu;
    m.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'mtitle'; t.textContent = 'Choose option';
    m.appendChild(t);
    for (const o of opts) {
      const r = document.createElement('div');
      r.className = 'mopt'; r.innerHTML = this.optLabelHTML(o);
      r.addEventListener('mousedown', ev => { ev.stopPropagation(); this.hideMenu(); o.cb(); });
      m.appendChild(r);
    }
    m.classList.remove('hidden');
    m.style.left = Math.min(x, window.innerWidth - m.offsetWidth - 4) + 'px';
    m.style.top = Math.min(y, window.innerHeight - m.offsetHeight - 4) + 'px';
  },

  hideMenu() { this.els.menu.classList.add('hidden'); },

  refresh() {
    this.renderInventory(); this.renderEquipment(); this.renderStats(); this.renderPrayers();
    this.renderMagic(); this.renderQuests(); this.renderCombat(); this.renderEmotes();
    if (this.modal === 'bank') this.renderBank();
    if (this.modal === 'shop') this.renderShop();
  },

  itemTip(def) {
    const bits = [def.name];
    const b = [];
    if (def.aim || def.power) b.push('Aim +' + (def.aim || 0) + ', Power +' + (def.power || 0));
    if (def.armour) b.push('Armour +' + def.armour);
    if (def.rAim || def.rPow) b.push('Ranged aim +' + (def.rAim || 0) + ', power +' + (def.rPow || 0));
    if (def.mAim) b.push('Magic aim +' + def.mAim);
    if (def.pray) b.push('Prayer +' + def.pray);
    if (def.arrowSave) b.push('Keeps ' + Math.round(def.arrowSave * 100) + '% of loosed arrows');
    if (def.defReq) b.push('Needs Defense ' + def.defReq);
    if (def.power && def.stack) b.push('Arrow power +' + def.power);
    if (def.heal) b.push('Heals ' + def.heal + ' hits');
    if (def.prayerXp) b.push(def.prayerXp + ' Prayer xp when buried');
    if (def.wield) b.push('Needs Attack ' + def.wield);
    if (def.fmXp) b.push('Firemaking ' + def.fmXp + ' xp');
    if (b.length) bits.push(b.join(' · '));
    if (def.value) bits.push(def.value + ' gp');
    bits.push(def.examine);
    return bits.join('\n');
  },

  // ---- Alt+drag repositionable HUD ----
  makeDraggable(el) {
    if (!el) return;
    el.addEventListener('mousedown', e => {
      if (!e.altKey) return;                 // normal clicks pass through untouched
      e.preventDefault(); e.stopPropagation();
      const r = el.getBoundingClientRect();
      el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
      document.body.classList.add('hud-dragging');
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      const move = ev => {
        // keep the whole panel inside the viewport so it can never be dragged out of reach
        const nx = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, ev.clientX - ox));
        const ny = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, ev.clientY - oy));
        el.style.left = nx + 'px'; el.style.top = ny + 'px';
      };
      const up = () => {
        document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
        document.body.classList.remove('hud-dragging'); this.saveHudLayout();
      };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    }, true); // capture: run before inner handlers (e.g. inventory slots)
  },
  saveHudLayout() {
    const out = {};
    for (const id of ['hud', 'minimap-wrap', 'side', 'chat']) {
      const el = document.getElementById(id);
      if (el && el.style.left) out[id] = { l: el.style.left, t: el.style.top };
    }
    try { localStorage.setItem('rc_hud', JSON.stringify(out)); } catch (e) {}
  },
  loadHudLayout() {
    let saved; try { saved = JSON.parse(localStorage.getItem('rc_hud')); } catch (e) {}
    if (!saved) return;
    for (const id in saved) {
      const el = document.getElementById(id);
      if (el) { el.style.left = saved[id].l; el.style.top = saved[id].t; el.style.right = 'auto'; el.style.bottom = 'auto'; }
    }
    this.clampHud(); // saved positions may come from a larger window — pull them back into view
  },
  // pull every repositioned panel fully inside the current viewport (run on load & on resize)
  clampHud() {
    for (const id of ['hud', 'minimap-wrap', 'side', 'chat']) {
      const el = document.getElementById(id);
      if (!el || !el.style.left) continue; // untouched panels keep their responsive CSS anchor
      const maxL = Math.max(0, window.innerWidth - el.offsetWidth);
      const maxT = Math.max(0, window.innerHeight - el.offsetHeight);
      const l = Math.max(0, Math.min(maxL, parseFloat(el.style.left) || 0));
      const t = Math.max(0, Math.min(maxT, parseFloat(el.style.top) || 0));
      el.style.left = l + 'px'; el.style.top = t + 'px';
    }
  },
  resetHudLayout() {
    try { localStorage.removeItem('rc_hud'); } catch (e) {}
    for (const id of ['hud', 'minimap-wrap', 'side', 'chat']) {
      const el = document.getElementById(id);
      if (el) { el.style.left = el.style.top = el.style.right = el.style.bottom = ''; }
    }
    this.addMessage('HUD layout reset.', 'm-game');
  },

  makeSlot(id, qty, opts) {
    const def = ITEMS[id];
    const s = document.createElement('div');
    s.className = 'slot' + (opts.noted ? ' noted' : '');
    s.title = opts.noted ? 'Bank note: ' + qty + ' × ' + def.name : this.itemTip(def);
    s.appendChild(ItemIcons.el(id));
    if (qty > 1 || opts.showQty || opts.noted) {
      const q = document.createElement('span');
      q.className = 'qty'; q.textContent = qty;
      s.appendChild(q);
    }
    if (opts.tag) {
      const p = document.createElement('span');
      p.className = 'price'; p.textContent = opts.tag;
      s.appendChild(p);
    }
    return s;
  },

  renderInventory() {
    const g = this.els.inv;
    g.innerHTML = '';
    const inv = Game.player.inv;
    for (let i = 0; i < 30; i++) {
      const it = inv[i];
      let s;
      if (it) {
        s = this.makeSlot(it.id, it.qty, { noted: !!it.noted });
        s.classList.toggle('sel', Game.selectedSlot === i);
        s.addEventListener('mousedown', e => {
          e.stopPropagation(); this.hideMenu();
          if (e.button === 0) this._drag = { from: i, sx: e.clientX, sy: e.clientY, moved: false }; // click-or-drag, resolved on mouseup
          else this.showMenu(e.clientX, e.clientY, Game.invOptions(i));
        });
        s.addEventListener('contextmenu', e => e.preventDefault());
      } else {
        s = document.createElement('div');
        s.className = 'slot';
      }
      // any slot is a valid drop target for a dragged item
      s.addEventListener('mouseup', e => {
        if (e.button !== 0 || !this._drag) return;
        const d = this._drag; this._drag = null; g.classList.remove('dragging');
        if (d.moved) { if (d.from !== i) Game.swapSlots(d.from, i); }
        else Game.invClick(d.from);
        e.stopPropagation();
      });
      g.appendChild(s);
    }
  },

  // RS-style worn-equipment screen: slots for the gear you have on + combat bonuses
  renderEquipment() {
    const el = this.els.equip;
    if (!el) return;
    el.innerHTML = '';
    const layout = [[null, 'head', null], [null, 'amulet', null], ['cape', 'body', null], ['weapon', 'legs', 'shield']];
    const names = { head: 'Helmet', amulet: 'Amulet', cape: 'Cape', body: 'Body', legs: 'Legs', weapon: 'Weapon', shield: 'Shield' };
    for (const row of layout) {
      const r = document.createElement('div'); r.className = 'eqrow';
      for (const slot of row) {
        const cell = document.createElement('div');
        if (!slot) { cell.className = 'eqspace'; r.appendChild(cell); continue; }
        const item = Game.equippedIn ? Game.equippedIn(slot) : null;
        cell.className = 'eqslot' + (item ? ' filled' : '');
        if (item) {
          cell.title = 'Remove ' + ITEMS[item.id].name;
          cell.appendChild(ItemIcons.el(item.id));
          cell.addEventListener('click', () => Game.unequip(slot));
        } else {
          cell.textContent = names[slot];
        }
        r.appendChild(cell);
      }
      el.appendChild(r);
    }
    el.appendChild(this.bonusPanel());
  },

  // RS2's "Equip Your Character" bonus read-out, but with stab/slash/crush collapsed
  // into one broader **Melee** figure — our combat model has no per-blade-type maths.
  bonusPanel() {
    const b = Game.equipBonus();
    const box = document.createElement('div');
    box.className = 'eqbonus';
    const sec = (title, rows) =>
      '<div class="bx-h">' + title + '</div>' +
      rows.map(([k, v, t]) => '<div class="bx-r"' + (t ? ' title="' + t + '"' : '') + '><span>' + k + '</span><b>' + v + '</b></div>').join('');
    const sgn = n => (n >= 0 ? '+' : '') + n;

    // ---- defence: one armour value, read through the combat triangle ----
    // Our armour has a class (melee/ranged/magic) and the triangle scales the
    // ATTACKER's accuracy, so effective protection vs a style = armour / triMult.
    const cls = Game.playerArmourClass();
    const def = style => Math.round(b.armour / Combat.triMult(style, cls));
    const triNote = style => {
      const m = Combat.triMult(style, cls);
      return m > 1 ? 'Your armour is weak to ' + style : m < 1 ? 'Your armour resists ' + style : 'Neutral vs ' + style;
    };

    // Attack and Defence pair up side by side (their labels are short enough for a
    // 216px panel); the longer-labelled sections below stay full width so nothing wraps.
    let html = '<div class="bx2"><div>' + sec('Attack', [
      ['Melee', sgn(b.aim), 'Accuracy with melee weapons'],
      ['Ranged', sgn(b.rAim), 'Accuracy with bows'],
      ['Magic', sgn(b.mAim), 'Accuracy when casting']
    ]) + '</div><div>' + sec('Defence', [
      ['Melee', sgn(def('melee')), triNote('melee')],
      ['Ranged', sgn(def('ranged')), triNote('ranged')],
      ['Magic', sgn(def('magic')), triNote('magic')]
    ]) + '</div></div>';
    const other = [
      ['Melee STR', sgn(b.power), 'Added melee damage'],
      ['Ranged STR', sgn(b.rPow), 'Added arrow damage'],
      ['Prayer', sgn(b.pray), 'Prayer points last ' + Math.round(b.pray * 2 / 60 * 100) + '% longer (drain resistance ' + Game.prayDrainResist() + ')']
    ];
    const save = Game.arrowSave();
    if (save > 0) other.push(['Arrows kept', Math.round(save * 100) + '%', 'Chance a loosed arrow returns to you']);

    // ---- weapon speed, in ticks and seconds, honouring the current style ----
    const wep = Game.equippedIn('weapon');
    const bow = wep && ITEMS[wep.id].bow;
    const ticks = bow ? Combat.bowSpeed(wep.id, Game.player.style) : Combat.weaponSpeed(wep ? wep.id : null);
    html += sec('Other bonuses', other);
    html += sec('Weapon speed', [
      [wep ? ITEMS[wep.id].name : 'Unarmed', ticks + 't / ' + (ticks * 0.6).toFixed(1) + 's',
       'One attack every ' + ticks + ' game ticks' + (bow ? ' (Rapid on Aggressive)' : '')]
    ]);
    box.innerHTML = html;
    return box;
  },

  // ---- Combat tab: styles + auto-retaliate, split out of Skills/Options RS2-style ----
  renderCombat() {
    const el = this.els.combat;
    if (!el) return;
    el.innerHTML = '';
    const P = Game.player;
    const head = document.createElement('div');
    head.className = 'cb-head';
    const wep = Game.equippedIn('weapon');
    head.innerHTML = '<div class="cb-lvl">Combat level <b>' + Game.combatLevel() + '</b></div>' +
                     '<div class="cb-wep">' + (wep ? ITEMS[wep.id].name : 'Unarmed') + '</div>';
    el.appendChild(head);

    const styleBox = document.createElement('div');
    styleBox.className = 'cb-styles';
    const XPFOR = ['Attack, Strength & Defense evenly', 'Attack xp', 'Strength xp', 'Defense xp'];
    COMBAT_STYLES.forEach((name, i) => {
      const b = document.createElement('button');
      b.className = 'stylebtn' + (P.style === i ? ' active' : '');
      b.innerHTML = '<span class="sb-name">' + name + '</span><span class="sb-xp">' + XPFOR[i] + '</span>';
      b.title = 'Combat style: ' + name + ' — trains ' + XPFOR[i];
      b.addEventListener('click', () => {
        P.style = i;
        if (Game.netMode) Net.style(i);
        this.renderCombat(); this.renderEquipment(); // bow speed depends on style
      });
      styleBox.appendChild(b);
    });
    el.appendChild(styleBox);

    const ret = document.createElement('button');
    ret.className = 'cb-toggle' + (Game.autoRetaliate ? ' on' : '');
    ret.textContent = 'Auto-retaliate: ' + (Game.autoRetaliate ? 'on' : 'off');
    ret.title = 'Fight back automatically when something attacks you';
    ret.addEventListener('click', () => {
      Game.autoRetaliate = !Game.autoRetaliate;
      localStorage.setItem('rc_autoret', Game.autoRetaliate ? '1' : '0');
      this.renderCombat();
    });
    el.appendChild(ret);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Bows fire faster on Aggressive (Rapid). Your armour class decides the combat triangle — see the Worn tab.';
    el.appendChild(hint);
  },

  // ---- Emotes tab: a placeholder shelf, ready for real emotes later ----
  // ---- dynamic event banner ----------------------------------------------
  // Deliberately not in the quest log: an event is not something you accepted, it
  // is something happening near you. It appears when you are in range and goes
  // away when you leave, in both singleplayer and multiplayer.
  eventHudNow() {
    if (Game.netMode) return Game.eventHud || [];        // the server tells us
    return (Game.eventCtx) ? Events.hudAll(Game.eventCtx) : [];
  },
  renderEventBanner() {
    const el = this.els.eventbar || (this.els.eventbar = document.getElementById('eventbar'));
    if (!el) return;
    const P = Game.player;
    const all = this.eventHudNow();
    // only show the one you are actually standing in
    const e = all.find(h => h.layer === P.layer &&
      Math.hypot(P.x - (h.x + 0.5), P.z - (h.z + 0.5)) <= h.radius + 6);
    if (!e) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (e.phase === 'warn') {
      el.innerHTML = '<div class="ev-name">' + e.name + '</div><div class="ev-sub">Beginning shortly…</div>';
      return;
    }
    const pct = e.maxIntegrity ? Math.max(0, e.integrity / e.maxIntegrity) : 0;
    const cls = pct > 0.5 ? 'ok' : pct > 0.25 ? 'warn' : 'bad';
    el.innerHTML =
      '<div class="ev-name">' + e.name + '</div>' +
      '<div class="ev-sub">Wave ' + e.wave + '/' + e.waves + ' &middot; ' + e.left + ' remaining &middot; ' +
        Math.floor(e.secs / 60) + ':' + String(e.secs % 60).padStart(2, '0') + ' left</div>' +
      '<div class="ev-bar"><div class="ev-fill ' + cls + '" style="width:' + (pct * 100).toFixed(1) + '%"></div>' +
        '<span class="ev-txt">Font integrity ' + e.integrity + '/' + e.maxIntegrity + '</span></div>';
  },

  // `::wave` / `!wave` performs an emote; anything else is ordinary chat.
  submitChat(text) {
    const m = /^(?:::|!)\s*(\w+)$/.exec(text);
    if (m) {
      const id = m[1].toLowerCase();
      const e = EMOTE_BY_ID[id] || EMOTES.find(x => x.name.toLowerCase().replace(/[^a-z]/g, '') === id);
      if (e) { Game.doEmote(e.id); return; }
      this.addMessage('There is no emote called "' + m[1] + '". The Emotes tab lists them all.', 'm-red');
      return;
    }
    if (Net.active) { Net.chat(text); return; }
    // Singleplayer still echoes you over your own head — the same thing RS2 does,
    // and it makes the emote commands and the chat bar feel like one feature.
    Game.player.bubble = { text: text.slice(0, 120), until: performance.now() + 4000 };
    this.addMessage('You: ' + text, 'm-you');
  },

  renderEmotes() {
    const el = this.els.emotes;
    if (!el) return;
    el.innerHTML = '';
    const active = Game.emoteActive && Game.emoteActive();
    const grid = document.createElement('div');
    grid.className = 'emotegrid';
    for (const e of EMOTES) {
      const cell = document.createElement('div');
      cell.className = 'emotecell' + (active === e.id ? ' on' : '');
      cell.appendChild(ItemIcons.emoteEl(e.id, 26));
      cell.title = e.name + (e.loop ? '\nRepeats until you move or act.' : '') + '\nChat: ::' + e.id;
      cell.addEventListener('click', () => Game.doEmote(e.id));
      grid.appendChild(cell);
    }
    el.appendChild(grid);
    const bar = document.createElement('div');
    bar.className = 'spellsel';
    bar.innerHTML = active ? 'Performing <b>' + EMOTE_BY_ID[active].name + '</b>' : 'Click an emote to perform it.';
    el.appendChild(bar);
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.innerHTML = 'Moving or acting stops an emote. You can also type <b>::wave</b> (or any emote id) in chat. Some emotes repeat until you interrupt them.';
    el.appendChild(hint);
  },

  skillProgress(id) {
    const lvl = Game.level(id), xp = Math.floor(Game.player.xp[id] || 0);
    if (lvl >= 99) return { lvl, xp, nextXp: xp, pct: 1 };
    const base = XP_FOR_LEVEL[lvl] || 0, next = XP_FOR_LEVEL[lvl + 1];
    return { lvl, xp, nextXp: next, pct: Math.max(0, Math.min(1, (xp - base) / (next - base))) };
  },

  renderStats() {
    const el = this.els.stats;
    el.innerHTML = '';
    // RS2-style compact grid: each cell shows the skill icon + level over an xp-progress fill
    const grid = document.createElement('div');
    grid.className = 'statgrid';
    for (const sk of SKILLS) {
      const p = this.skillProgress(sk.id);
      const c = document.createElement('div');
      c.className = 'skcell click';
      c.title = sk.name + ' — ' + p.xp + ' xp' + (p.lvl < 99 ? ' (' + (p.nextXp - p.xp) + ' xp to level ' + (p.lvl + 1) + ')' : '') + ' — click for guide';
      const prog = document.createElement('div'); prog.className = 'skprog'; prog.style.width = (p.pct * 100).toFixed(0) + '%';
      const ic = ItemIcons.skillEl(sk.id, 18);
      const b = document.createElement('span'); b.className = 'sklvl';
      b.textContent = p.lvl; // single number keeps the cell compact; live HP is on the HUD bar
      c.appendChild(prog); c.appendChild(ic); c.appendChild(b);
      c.addEventListener('click', () => this.openGuide(sk.id));
      grid.appendChild(c);
    }
    el.appendChild(grid);
    const eq = Game.equipBonus();
    const bo = document.createElement('div');
    bo.className = 'stat total';
    bo.innerHTML = '<span>Aim/Power/Armour</span><span>' + eq.aim + '/' + eq.power + '/' + eq.armour + '</span>';
    el.appendChild(bo);
    const cb = document.createElement('div');
    cb.className = 'stat total';
    cb.innerHTML = '<span>Combat level</span><span>' + Game.combatLevel() + '</span>';
    el.appendChild(cb);
    this.updateHud();
  },

  updateHud() {
    const P = Game.player, maxH = Game.level('hits');
    this.els.hpFill.style.width = Math.max(0, P.curHits / maxH * 100) + '%';
    this.els.hpTxt.textContent = P.curHits + '/' + maxH;
    const maxP = Game.level('prayer');
    this.els.prayFill.style.width = (maxP ? Math.floor(P.curPrayer) / maxP * 100 : 0) + '%';
    this.els.prayTxt.textContent = Math.floor(P.curPrayer) + '/' + maxP;
  },

  toggleRun() {
    Game.run = !Game.run;
    this.syncRunButton();
    // Multiplayer: the sim owns movement speed, so this is only a request. The
    // authority echoes the flag back in its next 'you' message, which re-syncs the
    // button if it disagreed.
    if (Game.netMode) Net.run(Game.run);
  },

  syncRunButton() {
    this.els.runBtn.textContent = Game.run ? 'Run' : 'Walk';
    this.els.runBtn.classList.toggle('on', Game.run);
  },

  levelBanner(skillName, level) {
    const el = this.els.levelup;
    el.textContent = 'Level up!  ' + skillName + '  ' + level;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth; // restart the animation
    el.style.animation = '';
  },

  renderPrayers() {
    const el = this.els.pray;
    el.innerHTML = '';
    const pts = document.createElement('div');
    pts.className = 'stat total';
    pts.innerHTML = '<span>Prayer points</span><span>' + Math.floor(Game.player.curPrayer) + '/' + Game.level('prayer') + '</span>';
    el.appendChild(pts);
    // seconds per point at the current loadout, so the drain numbers mean something
    const resist = Game.prayDrainResist();
    // Drawn as a grid of glyphs, in level order like the book it is modelled on.
    // The symbol says what the prayer does and the tint says how strong it is, so
    // a group reads as one family climbing from bronze to gold.
    const grid = document.createElement('div');
    grid.className = 'praygrid';
    for (const pr of PRAYERS) {
      const have = Game.level('prayer') >= pr.lvl;
      const on = !!Game.player.prayersOn[pr.id];
      const cell = document.createElement('div');
      cell.className = 'praycell' + (on ? ' on' : '') + (have ? '' : ' locked');
      cell.appendChild(ItemIcons.prayEl(pr, 26));
      cell.title = pr.name + ' — level ' + pr.lvl + '\n' + prayerDesc(pr) +
        '\nDrain ' + pr.drain + ': one point every ' + (resist / pr.drain * 0.6).toFixed(1) + 's while it is on' +
        '\nOnly one ' + PRAY_GROUPS[pr.group] + ' prayer at a time';
      if (have) cell.addEventListener('click', () => Game.togglePrayer(pr.id));
      grid.appendChild(cell);
    }
    el.appendChild(grid);
    // what is actually switched on, spelled out — the grid alone is too terse
    const active = PRAYERS.filter(p => Game.player.prayersOn[p.id]);
    const bar = document.createElement('div');
    bar.className = 'spellsel';
    bar.innerHTML = active.length
      ? '<b>' + active.map(p => p.name).join('</b>, <b>') + '</b>'
      : 'No prayers active.';
    el.appendChild(bar);
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.innerHTML = 'One prayer per group. <b>Flicking</b>: switch a prayer off and straight back on between ticks and it costs nothing — it is only charged for a tick it stayed on throughout. Recharge at any altar; train fastest at the Bone Font in Mourncross.';
    el.appendChild(hint);
    this.updateHud();
  },

  // what a spell wants you to click next, in one line
  spellTargetHint(sp) {
    switch (sp.kind) {
      case 'combat': return 'Click a monster.';
      case 'curse': return 'Click a monster to sap its ' + SAP_NAME[sp.sap] + '.';
      case 'enchant': return 'Click ' + sp.ench + ' jewellery in your pack.';
      case 'alch': return 'Click an item in your pack to turn it to coins.';
      case 'grab': return 'Right-click an item on the ground.';
      case 'smelt': return 'Click an ore in your pack.';
      default: return '';
    }
  },

  // The spellbook, drawn as a grid of glyphs rather than a list of names — the
  // book is meant to be read by shape and colour, and a 216px panel has no room
  // for 23 rows of text anyway. Hovering names the spell; the runes it costs are
  // in the tooltip, greyed if you can't pay.
  renderMagic() {
    const el = this.els.magic;
    el.innerHTML = '';
    const lvl = Game.level('magic');
    const grid = document.createElement('div');
    grid.className = 'spellgrid';
    for (const sp of SPELLS) {
      const have = lvl >= sp.lvl;
      const sel = Game.selectedSpell === sp.id;
      const isAuto = Game.player.autocast === sp.id;
      const runesOk = have && Game.haveRunes(sp);
      const cell = document.createElement('div');
      cell.className = 'spellcell' + (sel ? ' on' : '') + (isAuto ? ' autocast' : '') +
        (have ? (runesOk ? '' : ' norunes') : ' locked');
      cell.appendChild(ItemIcons.spellEl(sp, 26));
      const cost = Object.entries(sp.runes)
        .map(([id, n]) => n + ' ' + ITEMS[id].name + (Game.countItem(id) < n ? ' (have ' + Game.countItem(id) + ')' : ''))
        .join('\n');
      cell.title = sp.name + ' — level ' + sp.lvl +
        (sp.max ? '\nMax hit ' + sp.max : '') + '\n' + this.spellTargetHint(sp) +
        '\n\nRunes:\n' + cost + (have ? (runesOk ? '' : '\n\nYou are short of runes.') : '\n\nYou need Magic ' + sp.lvl + '.');
      if (have) {
        cell.addEventListener('mousedown', e => {
          e.preventDefault(); e.stopPropagation(); this.hideMenu();
          if (e.button === 0) {
            Game.selectedSpell = sel ? null : sp.id;
            this.renderMagic();
            if (!sel) this.addMessage('You ready ' + sp.name + '. ' + this.spellTargetHint(sp), 'm-quest');
          } else if (sp.kind === 'combat') {
            // The sim owns autocast in multiplayer — it decides what a swing becomes.
            if (Game.netMode) Net.autocast(isAuto ? null : sp.id);
            else Game.player.autocast = isAuto ? null : sp.id;
            if (!isAuto) Game.selectedSpell = null;
            this.renderMagic();
            this.addMessage(isAuto ? 'Auto-cast disabled.' : 'Auto-cast set to ' + sp.name + '. Attacking a monster now casts it.', 'm-quest');
          }
        });
        cell.addEventListener('contextmenu', e => e.preventDefault());
      }
      grid.appendChild(cell);
    }
    el.appendChild(grid);
    const sel = Game.selectedSpell && SPELLS.find(s => s.id === Game.selectedSpell);
    const bar = document.createElement('div');
    bar.className = 'spellsel';
    bar.innerHTML = sel
      ? '<b>' + sel.name + '</b><br>' + this.spellTargetHint(sel)
      : (Game.player.autocast ? 'Auto-casting <b>' + SPELLS.find(s => s.id === Game.player.autocast).name + '</b> — just Attack.' : 'Left-click a spell to ready it.');
    el.appendChild(bar);
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.innerHTML = '<b>Right-click</b> a combat spell to set it as auto-cast. A staff supplies its own element. Dim spells are ones you cannot afford the runes for.';
    el.appendChild(hint);
  },

  renderQuests() {
    const el = this.els.quest;
    el.innerHTML = '';
    for (const [id, def] of Object.entries(QUEST_DEFS)) {
      const st = Game.player.quests[id] || 0;
      const done = def.done || 2;
      const r = document.createElement('div');
      r.className = 'listrow quest ' + (st >= done ? 'q-done' : st > 0 ? 'q-started' : 'q-not');
      r.textContent = def.name;
      // multi-stage quests show how far along you are, so "yellow" isn't a black box
      if (st > 0 && st < done && done > 2) r.textContent += ' (' + st + '/' + done + ')';
      r.title = def.desc;
      r.addEventListener('click', () => this.addMessage(def.name + ': ' + def.desc, 'm-quest'));
      el.appendChild(r);
    }
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Red: not started. Yellow: in progress. Green: complete.';
    el.appendChild(hint);
  },

  // ---------- bank ----------
  openBank() {
    this.modal = 'bank';
    this.els.mtitle.textContent = 'Bank of Rune Classic';
    this.els.mnote.textContent = 'Click a bank item to withdraw, an inventory item to deposit — the amount is set below. Right-click for more.';
    this.els.modal.classList.remove('hidden');
    this.renderBank();
  },

  // number of bank tabs (tab 0 = "All" view; 1..N are bins)
  BANK_TABS: 4, bankSearch: '',
  renderBankBar() {
    const bar = this.els.mbar; bar.innerHTML = '';
    const mk = (label, val, title) => {
      const b = document.createElement('button');
      b.className = 'bank-tab' + (Game.bankActiveTab === val ? ' on' : '');
      b.textContent = label; if (title) b.title = title;
      b.addEventListener('click', () => { Game.bankActiveTab = val; this.renderBank(); });
      // drop a dragged bank item onto a numbered tab to file it there
      if (typeof val === 'number') b.addEventListener('mouseup', () => { if (this._bankDrag != null) { Game.bankFile(this._bankDrag, val); this._bankDrag = null; this.renderBank(); } });
      bar.appendChild(b);
    };
    mk('All', 'all', 'Show every item');
    for (let t = 1; t <= this.BANK_TABS; t++) mk(String(t), t, 'Tab ' + t + ' — right-click an item to file it here');
    const search = document.createElement('input');
    search.className = 'bank-search'; search.type = 'text'; search.placeholder = 'Search…'; search.value = this.bankSearch;
    search.addEventListener('input', () => { this.bankSearch = search.value.toLowerCase(); this.renderBankGrid(); }); // grid-only so focus stays
    search.addEventListener('mousedown', e => e.stopPropagation());
    bar.appendChild(search);
    const dep = document.createElement('button');
    dep.className = 'bank-depall'; dep.textContent = 'Deposit all';
    dep.addEventListener('click', () => Game.depositAll());
    bar.appendChild(dep);
  },
  renderBankFoot() {
    const f = this.els.mfoot; f.innerHTML = '';
    const lab = document.createElement('span'); lab.className = 'qty-label'; lab.textContent = 'Qty:';
    f.appendChild(lab);
    const opts = [['1', 1], ['5', 5], ['10', 10], ['X', 'x'], ['All', 'all']];
    for (const [label, val] of opts) {
      const b = document.createElement('button');
      b.className = 'qty-btn' + (Game.bankQty === val ? ' on' : '');
      b.textContent = val === 'x' && Game.bankQty === 'x' ? 'X:' + Game.bankXVal : label;
      b.addEventListener('click', () => {
        if (val === 'x') { const n = parseInt(prompt('Withdraw/deposit how many?', Game.bankXVal), 10); if (n > 0) Game.bankXVal = n; }
        Game.bankQty = val; this.renderBankFoot();
      });
      f.appendChild(b);
    }
    const note = document.createElement('button');
    note.className = 'qty-btn note-toggle' + (Game.bankNote ? ' on' : '');
    note.textContent = 'Note'; note.title = 'Withdraw items as bank notes (a single stackable placeholder)';
    note.style.marginLeft = 'auto';
    note.addEventListener('click', () => { Game.bankNote = !Game.bankNote; this.renderBankFoot(); });
    f.appendChild(note);
  },
  renderBankGrid() {
    const g = this.els.mgrid;
    g.innerHTML = '';
    const tab = Game.bankActiveTab, q = this.bankSearch;
    const items = Game.player.bank.filter(it =>
      (tab === 'all' || (it.tab || 1) === tab) &&
      (!q || ITEMS[it.id].name.toLowerCase().includes(q)));
    for (const it of items) {
      const s = this.makeSlot(it.id, it.qty, { showQty: true });
      s.addEventListener('mousedown', e => {
        e.stopPropagation(); this.hideMenu();
        if (e.button === 0) { this._bankDrag = it.id; Game.withdraw(it.id, Game.bankResolveQty(it.qty)); }
        else this.showMenu(e.clientX, e.clientY, [
          { label: 'Withdraw 1', cb: () => Game.withdraw(it.id, 1) },
          { label: 'Withdraw 10', cb: () => Game.withdraw(it.id, 10) },
          { label: 'Withdraw X', cb: () => { const n = parseInt(prompt('Withdraw how many?', Game.bankXVal), 10); if (n > 0) { Game.bankXVal = n; Game.withdraw(it.id, n); } } },
          { label: 'Withdraw All', cb: () => Game.withdraw(it.id, it.qty) },
          { label: (Game.bankNote ? '✓ ' : '') + 'Withdraw-as-note', cb: () => { Game.bankNote = !Game.bankNote; this.renderBankFoot(); } },
          ...Array.from({ length: this.BANK_TABS }, (_, k) => ({ label: 'File in tab ' + (k + 1), cb: () => { Game.bankFile(it.id, k + 1); this.renderBank(); } })),
          { label: 'Cancel', cb: () => {} }
        ]);
      });
      s.addEventListener('mouseup', () => { this._bankDrag = null; });
      s.addEventListener('contextmenu', e => e.preventDefault());
      g.appendChild(s);
    }
    if (!items.length) g.innerHTML = '<div class="hint">' + (q ? 'No items match “' + q + '”.' : Game.player.bank.length ? 'This tab is empty.' : 'Your bank is empty.') + '</div>';
  },
  renderBank() {
    this.renderBankBar(); this.renderBankFoot(); this.renderBankGrid();
  },

  // ---------- shop ----------
  openShop(shopId) {
    Game.activeShop = shopId || 'general';
    this.modal = 'shop';
    this.els.mtitle.textContent = SHOP_DEFS[Game.activeShop].name;
    this.els.mnote.textContent = Game.shopCurrency() === 'coins'
      ? 'Click a shop item to buy. Click an inventory item to sell. Right-click for amounts.'
      : 'Marrow deals only in ecto-tokens — earn them by worshipping at the Bone Font. He buys nothing.';
    this.els.mbar.innerHTML = ''; this.els.mfoot.innerHTML = '';
    this.els.modal.classList.remove('hidden');
    this.renderShop();
  },

  renderShop() {
    const g = this.els.mgrid;
    g.innerHTML = '';
    for (const st of (Game.shops[Game.activeShop] || [])) {
      if (st.qty <= 0) continue;
      const cur = Game.shopCurrency();
      const s = this.makeSlot(st.id, st.qty, { showQty: true, tag: Game.shopPrice(st) + (cur === 'coins' ? 'gp' : 'et') });
      s.addEventListener('mousedown', e => {
        e.stopPropagation(); this.hideMenu();
        if (e.button === 0) Game.buy(st.id, 1);
        else this.showMenu(e.clientX, e.clientY, [
          { label: 'Buy 1', cb: () => Game.buy(st.id, 1) },
          { label: 'Buy 5', cb: () => Game.buy(st.id, 5) },
          { label: 'Cancel', cb: () => {} }
        ]);
      });
      s.addEventListener('contextmenu', e => e.preventDefault());
      g.appendChild(s);
    }
  },

  closeModal() {
    // Tell the authority the counter is shut, so it stops accepting operations from
    // us. Harmless if it already knows — both closers are idempotent.
    if (Game.netMode) {
      if (this.modal === 'bank') Net.bankClose();
      else if (this.modal === 'shop') Net.shopClose();
    }
    this.modal = null;
    this.els.modal.classList.add('hidden');
    this.els.mfoot.innerHTML = '';
  },

  // ---------- world map ----------
  WM_LABELS: [
    { x: 64, z: 63, l: 0, t: 'Town Square' },
    { x: 64, z: 49, l: 0, t: 'Castle & Bank' },
    { x: 76, z: 64, l: 0, t: 'General Store' },
    { x: 53, z: 64, l: 0, t: 'Kitchen' },
    { x: 56, z: 76, l: 0, t: 'Church' },
    { x: 72, z: 77, l: 0, t: 'Blacksmith' },
    { x: 30, z: 30, l: 0, t: 'Mine' },
    { x: 24, z: 38, l: 0, t: 'Mining Guild' },
    { x: 30, z: 11, l: 0, t: 'Blackscar Quarry' },
    { x: 44, z: 58, l: 0, t: "Beginner's Scar" },
    { x: 24, z: 38, l: 1, t: 'Deep Gallery' },
    { x: 54, z: 137, l: 0, t: "Chapman's Cross" },
    { x: 38, z: 145, l: 0, t: 'The Ringwall' },
    { x: 49, z: 153, l: 0, t: 'Apothecary' },
    { x: 158, z: 40, l: 1, t: 'Essence Mine' },
    { x: 40, z: 32, l: 0, t: 'Doric' },
    { x: 48, z: 46, l: 0, t: 'Dungeon' },
    { x: 64, z: 87, l: 0, t: 'Rat Meadow' },
    { x: 33, z: 74, l: 0, t: 'Bear Forest' },
    { x: 90, z: 64, l: 0, t: 'River' },
    { x: 64, z: 17, l: 0, t: 'Aldervale' },
    { x: 55, z: 15, l: 0, t: 'Bank' },
    { x: 74, z: 15, l: 0, t: 'Armoury' },
    { x: 74, z: 28, l: 0, t: 'Tavern' },
    { x: 49, z: 46, l: 1, t: 'Ladder Up' },
    { x: 50, z: 64, l: 1, t: 'Skeletons' },
    { x: 72, z: 62, l: 1, t: 'Crypt' },
    { x: 68, z: 84, l: 1, t: 'Hobgoblins' },
    { x: 46, z: 82, l: 1, t: 'Ghosts' },
    { x: 49, z: 101, l: 1, t: "Dragon's Lair" },
    // ---- the southern highway ----
    { x: 47, z: 88, l: 0, t: 'Training Yard' },
    { x: 64, z: 97, l: 0, t: 'The Downs' },
    { x: 33, z: 108, l: 0, t: "Ava's Workshop" },
    { x: 34, z: 116, l: 0, t: 'Warding Circle' },
    { x: 65, z: 119, l: 0, t: 'Willowmere' },
    { x: 50, z: 122, l: 0, t: 'The Mere' },
    { x: 38, z: 145, l: 0, t: 'Stone Circle' },
    { x: 79, z: 142, l: 0, t: 'Burnt Steading' },
    { x: 57, z: 153, l: 0, t: 'Wayside Inn' },
    { x: 64, z: 174, l: 0, t: 'Southmarch' },
    { x: 51, z: 165, l: 0, t: 'Bank' },
    { x: 76, z: 166, l: 0, t: 'Outfitters' },
    // ---- east of the river ----
    { x: 94, z: 62, l: 0, t: 'The Causeway' },
    { x: 120, z: 85, l: 0, t: 'Mourncross Flats' },
    { x: 129, z: 63, l: 0, t: 'MOURNCROSS' },
    { x: 129, z: 43, l: 0, t: 'Bell Tower' },
    { x: 129, z: 80, l: 0, t: 'Bone Font' },
    { x: 148, z: 63, l: 0, t: 'Churchyard' },
    { x: 137, z: 71, l: 0, t: "Marrow's Rest" },
    { x: 53, z: 183, l: 0, t: 'Cathedral' }
  ],

  // ---------- world map ----------
  // The in-game key, RS-style: each entry collects the scenery (or NPCs) that
  // provide that facility, draws a marker for them, and flashes them when clicked.
  WM_KEY: [
    { id: 'bank',    name: 'Bank',       col: '#ffe97a', shape: 'coin',  types: ['bank_booth'] },
    { id: 'shop',    name: 'Shop',       col: '#e0603c', shape: 'tri',   types: ['shop_counter', 'stall'] },
    { id: 'quest',   name: 'Quest start',col: '#7fd0e6', shape: 'star',  npcs: true },
    { id: 'altar',   name: 'Altar',      col: '#efe6d0', shape: 'cross', types: ['altar', 'shrine'] },
    { id: 'anvil',   name: 'Anvil',      col: '#9aa4b0', shape: 'sq',    types: ['anvil'] },
    { id: 'furnace', name: 'Furnace',    col: '#ff8c42', shape: 'sq',    types: ['furnace'] },
    { id: 'range',   name: 'Range',      col: '#ff6b3d', shape: 'sq',    types: ['range'] },
    { id: 'fish',    name: 'Fishing',    col: '#6fd0ff', shape: 'dot',   types: ['fishing_spot', 'lure_spot'] },
    { id: 'mine',    name: 'Mine',       col: '#c9a06a', shape: 'ore',   types: ['rock_copper', 'rock_tin', 'rock_iron', 'rock_coal'] },
    { id: 'farm',    name: 'Farming',    col: '#9acd32', shape: 'dot',   types: ['wheat', 'windmill', 'chicken_coop'] },
    { id: 'dungeon', name: 'Dungeon',    col: '#ffd23a', shape: 'ladder',types: ['ladder_down', 'ladder_up'] },
    { id: 'font',    name: 'Bone Font',  col: '#8fe6b0', shape: 'cross', types: ['bone_font', 'bone_grinder', 'slime_pool'] },
    { id: 'grave',   name: 'Graveyard',  col: '#b8bcb2', shape: 'sq',    types: ['grave'] }
  ],
  // NPCs that begin or advance a quest — these get the "quest start" marker
  WM_QUEST_NPCS: ['guide', 'shopkeeper', 'priest', 'doric', 'cook', 'farmer', 'artisan', 'instructor', 'tribe_chief', 'ava', 'wenna', 'ghost_warden'],
  // ore rocks are coloured by what's in them (an OSRS 2024 map change)
  WM_ORE: { rock_copper: '#c07a3a', rock_tin: '#cfd2d6', rock_iron: '#96513f', rock_coal: '#3a3a42' },

  wmZoom: 4, wmPan: null, wmLayer: 0, wmFlash: null, wmHidden: {},

  toggleMap() {
    const wm = this.els.worldmap;
    if (wm.classList.contains('hidden')) {
      wm.classList.remove('hidden');
      this._wmBaseKey = ''; this._wmTerrain = [null, null]; // world may have changed since last open
      this.wmLayer = Game.player.layer;
      this.wmFit();                                   // open framed on the whole map
      this.centreMapOn(Game.player.x, Game.player.z);
      this.renderMapKey();
      this.drawWorldMap();
    } else wm.classList.add('hidden');
  },

  // canvas viewport size, recomputed on open so it tracks the window
  wmView() {
    const cv = this.els.wm;
    return { w: cv.width || 1, h: cv.height || 1 };
  },
  wmFit() {
    const cv = this.els.wm;
    const box = Math.min(620, Math.floor(window.innerHeight * 0.66));
    cv.width = box; cv.height = box;
    this.wmZoom = Math.max(2, box / World.SIZE);      // whole map in view
    this.wmPan = { x: 0, z: 0 };
  },
  centreMapOn(wx, wz) {
    const v = this.wmView();
    this.wmPan = { x: wx * this.wmZoom - v.w / 2, z: wz * this.wmZoom - v.h / 2 };
    this.clampMapPan();
  },
  clampMapPan() {
    const v = this.wmView(), full = World.SIZE * this.wmZoom;
    const maxX = Math.max(0, full - v.w), maxZ = Math.max(0, full - v.h);
    this.wmPan.x = Math.max(0, Math.min(maxX, this.wmPan.x));
    this.wmPan.z = Math.max(0, Math.min(maxZ, this.wmPan.z));
  },
  setMapZoom(z, anchor) {
    const v = this.wmView(), old = this.wmZoom;
    const ax = anchor ? anchor.x : v.w / 2, az = anchor ? anchor.z : v.h / 2;
    const wx = (this.wmPan.x + ax) / old, wz = (this.wmPan.z + az) / old;  // world point under the cursor
    this.wmZoom = Math.max(1.5, Math.min(16, z));
    this.wmPan = { x: wx * this.wmZoom - ax, z: wz * this.wmZoom - az };   // keep it under the cursor
    this.clampMapPan();
    this.drawWorldMap();
  },

  // every facility on a layer, grouped by key entry
  mapFacilities(l) {
    const out = {};
    for (const k of this.WM_KEY) out[k.id] = [];
    const byType = {};
    for (const k of this.WM_KEY) for (const t of (k.types || [])) byType[t] = k.id;
    for (const s of World.L[l].scenery.values()) {
      const id = byType[s.type];
      if (id) out[id].push(s);
    }
    for (const n of Game.npcs) {
      if (n.layer !== l || n.deadUntil) continue;
      if (this.WM_QUEST_NPCS.includes(n.type)) out.quest.push(n);
    }
    return out;
  },

  // The terrain + markers + labels only change when the view does, so they're baked to
  // an offscreen canvas and blitted. Without this, every ping frame re-drew ~37k tiles
  // (121ms at Fit zoom) and the animation crawled; now a ping frame is one drawImage.
  _wmBase: null, _wmBaseKey: '', _wmFac: null,
  wmViewKey(l, v) {
    const hidden = this.WM_KEY.filter(k => this.wmHidden[k.id]).map(k => k.id).join('.');
    return [l, this.wmZoom.toFixed(3), Math.round(this.wmPan.x), Math.round(this.wmPan.z), v.w, v.h, hidden].join('|');
  },

  drawWorldMap() {
    const l = this.wmLayer, zoom = this.wmZoom;
    const cv = this.els.wm, c = this.wmctx;
    if (!this.wmPan) this.wmFit();
    const v = { w: cv.width, h: cv.height };
    document.getElementById('wm-title').textContent = 'World Map — ' + (l === 0 ? 'Surface' : 'Dungeon');
    document.getElementById('wm-zoom').textContent = Math.round(zoom / 4 * 100) + '%';
    document.querySelectorAll('.wm-layer').forEach(b => b.classList.toggle('on', +b.dataset.layer === l));

    const sx = (wx) => wx * zoom - this.wmPan.x, sz = (wz) => wz * zoom - this.wmPan.z;
    const key = this.wmViewKey(l, v);
    if (key !== this._wmBaseKey) {
      if (!this._wmBase) this._wmBase = document.createElement('canvas');
      this._wmBase.width = v.w; this._wmBase.height = v.h;
      this._wmFac = this.mapFacilities(l);
      this.wmDrawStatic(this._wmBase.getContext('2d'), l, v, sx, sz);
      this._wmBaseKey = key;
    }
    c.drawImage(this._wmBase, 0, 0);
    const fac = this._wmFac;

    // ---- flashing "find" pulse from the key (clustered — see wmClusters) ----
    if (this.wmFlash && this.wmFlash.id !== '__me' && performance.now() < this.wmFlash.until) {
      const t = (performance.now() - this.wmFlash.t0) / 380;
      const f = t % 1;
      c.lineWidth = 2.5;
      c.strokeStyle = 'rgba(255,240,140,' + (0.85 - f * 0.8).toFixed(2) + ')';
      for (const cl of this.wmClusters(fac[this.wmFlash.id] || [], sx, sz, v)) {
        c.beginPath(); c.arc(cl.x, cl.y, cl.r + 8 + f * 16, 0, 7); c.stroke();
        if (cl.n > 1) {                              // a merged group says how many it covers
          c.fillStyle = 'rgba(0,0,0,0.6)';
          const txt = '×' + cl.n;
          c.font = 'bold 10px Verdana'; c.textAlign = 'center'; c.textBaseline = 'middle';
          const w = c.measureText(txt).width + 6;
          c.fillRect(cl.x - w / 2, cl.y - cl.r - 20, w, 13);
          c.fillStyle = '#fff0a0'; c.fillText(txt, cl.x, cl.y - cl.r - 13.5);
        }
      }
      if (!this._wmAnim) { this._wmAnim = true; requestAnimationFrame(() => { this._wmAnim = false; this.drawWorldMap(); }); }
    }

    // ---- a running event: a pulsing ring over its radius, so you can see one is
    // happening from anywhere on the map and decide whether to run for it ----
    for (const e of this.eventHudNow()) {
      if (e.layer !== l) continue;
      // wmView() carries only {w,h} — the tiles-to-pixels scale is wmZoom
      const ex = sx(e.x + 0.5), ey = sz(e.z + 0.5), er = Math.max(7, e.radius * this.wmZoom);
      const pulse = 0.5 + Math.sin(performance.now() / 320) * 0.5;
      c.save();
      c.strokeStyle = 'rgba(255,150,60,' + (0.45 + pulse * 0.5).toFixed(2) + ')';
      c.lineWidth = 2;
      c.beginPath(); c.arc(ex, ey, er, 0, 7); c.stroke();
      c.fillStyle = 'rgba(255,150,60,0.10)';
      c.beginPath(); c.arc(ex, ey, er, 0, 7); c.fill();
      c.fillStyle = '#ffb03c'; c.font = 'bold 11px Verdana'; c.textAlign = 'center';
      c.strokeStyle = '#000'; c.lineWidth = 3;
      c.strokeText(e.name, ex, ey - er - 5); c.fillText(e.name, ex, ey - er - 5);
      c.restore();
      if (!this._wmAnim) { this._wmAnim = true; requestAnimationFrame(() => { this._wmAnim = false; this.drawWorldMap(); }); }
    }

    // ---- player: a marker if they're in view, an edge arrow pointing to them if not ----
    if (l === Game.player.layer) this.drawPlayerOnMap(c, sx(Game.player.x), sz(Game.player.z), v);
  },

  // Greedy screen-space clustering: locations that *look* bunched merge into one ping,
  // so 41 mine rocks are a couple of rings rather than 41 overlapping ones. Because it
  // works in screen space it adapts to zoom — zoom in and a cluster splits apart again.
  wmClusters(list, sx, sz, v) {
    const R = 26, R2 = R * R, out = [];
    for (const s of list) {
      const x = sx(s.x + 0.5), y = sz(s.z + 0.5);
      if (x < -40 || y < -40 || x > v.w + 40 || y > v.h + 40) continue;   // off-screen never pings
      let best = null, bd = R2;
      for (const cl of out) {
        const d = (cl.x - x) * (cl.x - x) + (cl.y - y) * (cl.y - y);
        if (d < bd) { bd = d; best = cl; }
      }
      if (best) {
        best.n++; best.tx += x; best.ty += y;
        best.x = best.tx / best.n; best.y = best.ty / best.n;
        best.r = Math.max(best.r, Math.hypot(best.x - x, best.y - y));
      } else out.push({ x, y, tx: x, ty: y, n: 1, r: 0 });
    }
    return out;
  },

  // everything that only changes when the view changes: terrain, scenery, markers, labels
  // Terrain is baked ONCE per layer into a 1px-per-tile bitmap and then blitted
  // scaled. Drawing a rect per visible tile cost 62ms per view change at Fit zoom and
  // grows with map area (a 512² map would be ~440ms); this is O(1) per view change,
  // so the map stays smooth however far the world expands.
  _wmTerrain: [null, null],
  wmTerrain(l) {
    if (this._wmTerrain[l]) return this._wmTerrain[l];
    const S = World.SIZE, lay = World.L[l];
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const cx = cv.getContext('2d'), img = cx.createImageData(S, S), d = img.data;
    const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const TCOL = { water: '#3d5d8a', sand: '#b0a068', rock: '#6e6a60', path: '#9a8a64', road: '#8f897c', floor: '#a5825a', dfloor: '#57534a', dwall: '#26241f' };
    const SCOL = { tree: '#1e4a18', oak: '#173d12', willow: '#2c6a34', wall: '#7a7466', rampart: '#8b8578', gatehouse: '#a09889',
      tower: '#b0a894', fountain: '#5cc9ff', well: '#5cc9ff', statue: '#cfc8b8', fire: '#ff7a00', pylon: '#8f93a6', rubble: '#6f6a60' };
    const T = {}, GRASS = rgb('#4c7a3d');
    for (const k in TCOL) T[k] = rgb(TCOL[k]);
    const SC = {};
    for (const k in SCOL) SC[k] = rgb(SCOL[k]);
    for (const k in this.WM_ORE) SC[k] = rgb(this.WM_ORE[k]);
    const put = (x, z, c3) => { const i = (z * S + x) * 4; d[i] = c3[0]; d[i + 1] = c3[1]; d[i + 2] = c3[2]; d[i + 3] = 255; };
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
      const t = lay.tile[x][z];
      if (t === 'void') continue;                       // left transparent; the dark backing shows through
      put(x, z, T[t] || GRASS);
    }
    for (const s of lay.scenery.values()) { const c3 = SC[s.type]; if (c3) put(s.x, s.z, c3); }
    cx.putImageData(img, 0, 0);
    this._wmTerrain[l] = cv;
    return cv;
  },

  wmDrawStatic(c, l, v, sx, sz) {
    const zoom = this.wmZoom;
    c.fillStyle = '#05060a'; c.fillRect(0, 0, v.w, v.h);
    c.imageSmoothingEnabled = false;                    // keep the pixel-map look crisp
    c.save();
    c.translate(-this.wmPan.x, -this.wmPan.z);
    c.scale(zoom, zoom);
    c.drawImage(this.wmTerrain(l), 0, 0);
    c.restore();

    // ---- facility markers ----
    const fac = this._wmFac || this.mapFacilities(l);
    const R = Math.max(3, Math.min(7, zoom * 0.9));
    for (const k of this.WM_KEY) {
      if (this.wmHidden[k.id]) continue;
      for (const s of fac[k.id]) {
        const mx = sx(s.x + 0.5), my = sz(s.z + 0.5);
        if (mx < -12 || my < -12 || mx > v.w + 12 || my > v.h + 12) continue;
        this.wmMarker(c, k, mx, my, R);
      }
    }

    // ---- place labels, skipping any that would collide ----
    c.font = 'bold ' + Math.max(9, Math.min(13, zoom * 2.2 | 0)) + 'px Verdana';
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const placed = [];
    const fits = (r) => !placed.some(p => r.x < p.x2 && r.x2 > p.x && r.y < p.y2 && r.y2 > p.y);
    for (const lb of this.WM_LABELS) {
      if (lb.l !== l) continue;
      const x = sx(lb.x + 0.5), y = sz(lb.z + 0.5);
      if (x < 0 || y < 0 || x > v.w || y > v.h) continue;
      const w = c.measureText(lb.t).width + 6;
      let box = null;
      for (const dy of [-14, -26, 12, -38, 24]) {            // try a few offsets before giving up
        const r = { x: x - w / 2, y: y + dy - 11, x2: x + w / 2, y2: y + dy + 3 };
        if (fits(r)) { box = r; break; }
      }
      c.fillStyle = '#ffe97a';
      c.beginPath(); c.arc(x, y, 2.5, 0, 7); c.fill();
      if (!box) continue;                                     // too crowded — the dot stands alone
      placed.push(box);
      c.fillStyle = 'rgba(0,0,0,0.62)';
      c.fillRect(box.x, box.y, w, 14);
      c.fillStyle = '#ffe97a';
      c.fillText(lb.t, x, box.y + 11);
    }

  },

  // You-are-here marker. When the player is off the visible area (which happens as
  // soon as you zoom in), an arrow pins to the edge of the map pointing at them, with
  // how far away they are — so you are never hunting the map for yourself.
  drawPlayerOnMap(c, px, py, v) {
    const M = 16;
    const onScreen = px >= M && py >= M && px <= v.w - M && py <= v.h - M;
    const pinging = this.wmFlash && this.wmFlash.id === '__me' && performance.now() < this.wmFlash.until;

    if (onScreen) {
      if (pinging) {                                     // expanding ping rings
        const t = (performance.now() - this.wmFlash.t0) / 420;
        for (const k of [0, 0.5]) {
          const f = (t + k) % 1;
          c.strokeStyle = 'rgba(255,255,255,' + (0.9 - f * 0.85).toFixed(2) + ')';
          c.lineWidth = 3; c.beginPath(); c.arc(px, py, 6 + f * 30, 0, 7); c.stroke();
        }
      }
      c.fillStyle = 'rgba(0,0,0,0.45)';                  // halo, so it reads over any terrain
      c.beginPath(); c.arc(px, py, 8, 0, 7); c.fill();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(px, py, 4.5, 0, 7); c.fill();
      c.strokeStyle = '#e02020'; c.lineWidth = 2.5; c.stroke();
      return;
    }

    // off-screen: clamp to the viewport edge along the line from the centre
    const cx = v.w / 2, cy = v.h / 2;
    let dx = px - cx, dy = py - cy;
    if (!dx && !dy) return;
    const tx = dx ? (cx - M) / Math.abs(dx) : Infinity;
    const ty = dy ? (cy - M) / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty);
    const ex = cx + dx * t, ey = cy + dy * t, ang = Math.atan2(dy, dx);
    const tiles = Math.round(Math.hypot(px - cx, py - cy) / this.wmZoom);

    c.save();
    c.translate(ex, ey); c.rotate(ang);
    const pulse = pinging ? 1 + Math.sin(performance.now() / 110) * 0.22 : 1;
    c.scale(pulse, pulse);
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.beginPath(); c.moveTo(13, 0); c.lineTo(-8, -10); c.lineTo(-8, 10); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.strokeStyle = '#e02020'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(10, 0); c.lineTo(-6, -7.5); c.lineTo(-6, 7.5); c.closePath();
    c.fill(); c.stroke();
    c.restore();

    // "You · 42" tucked just inside the arrow
    const lx = ex - Math.cos(ang) * 26, ly = ey - Math.sin(ang) * 26;
    const txt = 'You · ' + tiles;
    c.font = 'bold 10px Verdana'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(txt).width + 8;
    c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(lx - w / 2, ly - 8, w, 15);
    c.fillStyle = '#fff'; c.fillText(txt, lx, ly);
    if (pinging && !this._wmAnim) { this._wmAnim = true; requestAnimationFrame(() => { this._wmAnim = false; this.drawWorldMap(); }); }
  },

  // centre the map on the player and ping them
  findMe() {
    if (this.wmLayer !== Game.player.layer) { this.wmLayer = Game.player.layer; this.renderMapKey(); }
    this.centreMapOn(Game.player.x, Game.player.z);
    this.wmFlash = { id: '__me', t0: performance.now(), until: performance.now() + 2400 };
    this.drawWorldMap();
  },

  // one facility marker — a small distinct glyph per key entry
  wmMarker(c, k, x, y, R) {
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.beginPath(); c.arc(x, y, R + 1.5, 0, 7); c.fill();
    c.fillStyle = k.col; c.strokeStyle = '#1a1712'; c.lineWidth = 1;
    const s = R;
    switch (k.shape) {
      case 'coin':
        c.beginPath(); c.arc(x, y, s, 0, 7); c.fill(); c.stroke();
        c.fillStyle = '#8a6a12'; c.beginPath(); c.arc(x, y, s * 0.4, 0, 7); c.fill(); break;
      case 'tri':
        c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s, y + s * 0.8); c.lineTo(x - s, y + s * 0.8); c.closePath(); c.fill(); c.stroke(); break;
      case 'star':
        c.beginPath();
        for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? s * 0.45 : s * 1.1; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
        c.closePath(); c.fill(); c.stroke(); break;
      case 'cross':
        c.fillRect(x - s * 0.3, y - s, s * 0.6, s * 2);
        c.fillRect(x - s, y - s * 0.3, s * 2, s * 0.6); break;
      case 'ladder':
        c.fillRect(x - s * 0.75, y - s, s * 0.3, s * 2);
        c.fillRect(x + s * 0.45, y - s, s * 0.3, s * 2);
        for (const dy of [-0.45, 0.2]) c.fillRect(x - s * 0.75, y + s * dy, s * 1.5, s * 0.25); break;
      case 'ore':
        c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s, y - s * 0.1); c.lineTo(x + s * 0.55, y + s); c.lineTo(x - s * 0.55, y + s); c.lineTo(x - s, y - s * 0.1);
        c.closePath(); c.fill(); c.stroke(); break;
      case 'dot':
        c.beginPath(); c.arc(x, y, s * 0.85, 0, 7); c.fill(); c.stroke(); break;
      default:
        c.fillRect(x - s * 0.85, y - s * 0.85, s * 1.7, s * 1.7); c.strokeRect(x - s * 0.85, y - s * 0.85, s * 1.7, s * 1.7);
    }
  },

  // the key panel: a swatch + count per facility, click to find, checkbox to hide
  renderMapKey() {
    const el = document.getElementById('wm-key');
    if (!el) return;
    el.innerHTML = '<div class="wmk-title">Key</div>';

    // "You are here" sits at the top of the key — click to centre on yourself and ping
    const me = document.createElement('div');
    me.className = 'wmk-row wmk-me';
    const msw = document.createElement('canvas'); msw.width = msw.height = 18; msw.className = 'wmk-sw';
    const mc = msw.getContext('2d');
    mc.fillStyle = '#fff'; mc.beginPath(); mc.arc(9, 9, 5, 0, 7); mc.fill();
    mc.strokeStyle = '#e02020'; mc.lineWidth = 2.5; mc.stroke();
    me.appendChild(msw);
    const mn = document.createElement('span'); mn.className = 'wmk-name'; mn.textContent = 'You are here';
    me.appendChild(mn);
    const onThis = this.wmLayer === Game.player.layer;
    const mtag = document.createElement('span'); mtag.className = 'wmk-n';
    mtag.textContent = onThis ? '' : '↔';
    me.appendChild(mtag);
    me.title = onThis ? 'Centre the map on you and ping' : 'You are on the other level — click to jump there';
    me.addEventListener('click', () => this.findMe());
    el.appendChild(me);

    const fac = this.mapFacilities(this.wmLayer);
    for (const k of this.WM_KEY) {
      const n = fac[k.id].length;
      const row = document.createElement('div');
      row.className = 'wmk-row' + (n ? '' : ' empty') + (this.wmHidden[k.id] ? ' off' : '');
      const sw = document.createElement('canvas');
      sw.width = sw.height = 18; sw.className = 'wmk-sw';
      this.wmMarker(sw.getContext('2d'), k, 9, 9, 6);
      row.appendChild(sw);
      const lbl = document.createElement('span'); lbl.className = 'wmk-name'; lbl.textContent = k.name;
      const cnt = document.createElement('span'); cnt.className = 'wmk-n'; cnt.textContent = n || '';
      row.appendChild(lbl); row.appendChild(cnt);
      row.title = n ? 'Click to flash all ' + n + ' on the map · right-click to hide' : 'None on this level';
      row.addEventListener('click', () => {
        if (!n) return;
        this.wmFlash = { id: k.id, t0: performance.now(), until: performance.now() + 2600 };
        this.drawWorldMap();
      });
      row.addEventListener('contextmenu', e => {
        e.preventDefault();
        this.wmHidden[k.id] = !this.wmHidden[k.id];
        this.renderMapKey(); this.drawWorldMap();
      });
      el.appendChild(row);
    }
    const hint = document.createElement('div');
    hint.className = 'wmk-hint';
    hint.textContent = 'Click a row to find it. Right-click to hide.';
    el.appendChild(hint);
  },

  mapClick(e) {
    if (this._wmDragged) { this._wmDragged = false; return; }   // a pan, not a click
    const zoom = this.wmZoom;
    const x = Math.floor((e.offsetX + this.wmPan.x) / zoom), z = Math.floor((e.offsetY + this.wmPan.z) / zoom);
    if (x < 0 || z < 0 || x >= World.SIZE || z >= World.SIZE) return;
    if (this.wmLayer !== Game.player.layer) { this.addMessage('That is on another level — you must travel there in person.', 'm-game'); return; }
    if (World.blocked(Game.player.layer, x, z)) { this.addMessage("You can't walk there.", 'm-red'); return; }
    Game.walkTo(x, z);
    this.els.worldmap.classList.add('hidden');
  },

  // ---------- skill guides ----------
  openGuide(id) {
    const g = this.skillGuide(id), p = this.skillProgress(id);
    const t = this.els.guideTitle; t.innerHTML = ''; t.appendChild(ItemIcons.skillEl(id, 22));
    t.appendChild(document.createTextNode(' ' + SKILLS.find(s => s.id === id).name + ' guide'));
    const body = this.els.guideBody; body.innerHTML = '';
    // header: description + level + xp progress bar
    const head = document.createElement('div'); head.className = 'g-desc';
    head.innerHTML = g.desc + '<br><b>Level ' + p.lvl + '</b>' + (p.lvl < 99 ? ' — ' + p.xp.toLocaleString() + ' / ' + p.nextXp.toLocaleString() + ' xp to level ' + (p.lvl + 1) : ' (max)');
    const bar = document.createElement('div'); bar.className = 'g-xpbar';
    const fill = document.createElement('div'); fill.className = 'g-xpfill'; fill.style.width = (p.pct * 100).toFixed(0) + '%';
    bar.appendChild(fill); head.appendChild(bar); body.appendChild(head);
    // unlock rows (sorted by level), with an item icon where relevant
    for (const u of g.unlocks.slice().sort((a, b) => a.lvl - b.lvl)) {
      const have = p.lvl >= u.lvl;
      const r = document.createElement('div'); r.className = 'g-row ' + (have ? 'have' : 'locked');
      const lv = document.createElement('span'); lv.className = 'g-lvl'; lv.textContent = 'Lv ' + u.lvl;
      r.appendChild(lv);
      if (u.icon && ITEMS[u.icon]) { const ic = ItemIcons.el(u.icon); ic.className = 'g-icon'; r.appendChild(ic); }
      const what = document.createElement('span'); what.className = 'g-what'; what.textContent = u.text;
      r.appendChild(what); body.appendChild(r);
    }
    this.els.guide.classList.remove('hidden');
  },

  skillGuide(id) {
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    switch (id) {
      case 'woodcut': return { desc: 'Chop trees for logs with an axe. A better axe does not make you luckier — it lets you swing more often (bronze every 3 ticks, iron 2, steel every tick). Regular trees fall on the first log; oaks and willows keep giving until they do.',
        unlocks: Object.entries(TREE_DEFS).map(([t, d]) => ({ lvl: d.lvl, icon: d.log, text: 'Chop ' + SCENERY_DEFS[t].name + ' → ' + ITEMS[d.log].name + ' (' + d.xp + ' xp)' }))
          .concat(METALS.map(m => ({ lvl: m.wield, icon: m.id + '_axe', text: cap(m.id) + ' axe — swings every ' + Combat.toolInterval(m.id + '_axe') + ' tick(s)' }))) };
      case 'mining': return { desc: 'Mine rocks for ore with a pickaxe. As with axes, a better pick swings more often rather than hitting luckier. Rich seams are slower to crack AND slower to come back. Sites: the Beginner\'s Scar west of Lumbridge (copper and tin), the open pit north (the four common metals), Blackscar Quarry further north (coal), and the Mining Guild behind its level-20 door — the only silver, gold and gems above ground, where you also mine at an unseen +7 and rocks return twice as fast. The ladder in the Guild drops to the Deep Gallery, the world\'s only mithril and adamantite.',
        unlocks: Object.entries(SCENERY_DEFS).filter(([k, d]) => d.ore || d.gemRock).map(([k, d]) => ({ lvl: d.lvl, icon: d.ore || 'uncut_sapphire', text: 'Mine ' + d.name + (d.gemRock ? ' → an uncut gem' : ' → ' + ITEMS[d.ore].name) + ' (' + d.xp + ' xp, ' + d.respawn + 's respawn)' }))
          .concat(METALS.map(m => ({ lvl: m.wield, icon: m.id + '_pickaxe', text: cap(m.id) + ' pickaxe — swings every ' + Combat.toolInterval(m.id + '_pickaxe') + ' tick(s)' }))) };
      case 'fishing': return { desc: 'Fish at spots on the riverbank. A small net takes shrimp and anchovies. Lure spots need a fishing rod AND feathers — one feather per cast, so keep them off every chicken you kill. Anchovies are the fish to train and sell on; shrimp are the fish to eat.',
        unlocks: [{ lvl: 1, icon: 'raw_shrimp', text: 'Net → Raw shrimp (10 xp, heals 3)' }, { lvl: 15, icon: 'raw_anchovies', text: 'Net → Raw anchovies (40 xp, heals 1 — sell them)' }, { lvl: 20, icon: 'raw_trout', text: 'Rod + feather → Raw trout' }, { lvl: 30, icon: 'raw_salmon', text: 'Rod + feather → Raw salmon' }] };
      case 'cooking': return { desc: 'Cook raw food on a fire or range. Burning gets rarer as you level and then stops for good — a range gets you there five levels sooner than an open fire.',
        unlocks: Object.entries(COOKABLES).map(([raw, d]) => ({ lvl: d.lvl, icon: d.cooked,
          text: 'Cook ' + ITEMS[d.cooked].name + ' (heals ' + (ITEMS[d.cooked].heal || 0) + ', ' + d.xp + ' xp) — stops burning at ' + d.stopBurn + ' on a range, ' + (d.stopBurn + 5) + ' on a fire' })) };
      case 'firemaking': return { desc: 'Use a tinderbox on logs to light a fire. Heavier logs need a real level before they will take. A fire burns for about a minute, then leaves ashes behind.',
        unlocks: ['logs', 'oak_logs', 'willow_logs'].map(id => ({ lvl: ITEMS[id].fmLvl, icon: id, text: 'Burn ' + ITEMS[id].name + ' (' + ITEMS[id].fmXp + ' xp)' })) };
      case 'smithing': return { desc: 'Smelt ore into bars at a furnace, then hammer bars into gear at an anvil. Iron is a coin-flip to smelt at EVERY level — that never improves, so bring spare ore.',
        unlocks: SMELTS.map(r => ({ lvl: r.lvl, icon: r.bar, text: 'Smelt ' + r.name })).concat(
          METALS.map(m => ({ lvl: m.smith, icon: m.id + '_sword', text: cap(m.id) + ' weapons & armour (from ' + cap(m.id) + ' bars)' }))) };
      case 'fletching': return { desc: 'Use a knife on logs to make bows and arrow shafts; add a bow string, feathers and arrowheads.',
        unlocks: [{ lvl: 1, text: 'Arrow shafts from logs' }, { lvl: 1, text: 'Feather + shafts → headless arrows' }]
          .concat(Object.values(FLETCH_STRING).map(r => ({ lvl: r.lvl, text: 'String ' + ITEMS[r.id].name })))
          .concat(Object.values(FLETCH_ARROW).map(r => ({ lvl: r.lvl, text: 'Make ' + ITEMS[r.id].name })))
          .sort((a, b) => a.lvl - b.lvl) };
      case 'ranged': return { desc: 'Wield a bow and arrows, then attack from range. The heaviest arrows you can actually draw are used automatically. Bows and arrows are gated on Ranged, not Attack. Use a SAFE SPOT — attack from where melee enemies cannot reach you.',
        unlocks: Object.entries(ITEMS).filter(([id, d]) => d.bow)
          .map(([id, d]) => ({ lvl: d.wield || 1, icon: id, text: d.name + ' (aim +' + d.rAim + ')' }))
          .concat(Object.entries(ITEMS).filter(([id, d]) => d.rangeReq && /_arrow$/.test(id))
            .map(([id, d]) => ({ lvl: d.rangeReq, icon: id, text: d.name + ' (power +' + d.power + ')' })))
          .concat(Object.entries(ITEMS).filter(([id, d]) => d.dclass === 'ranged' && d.slot)
            .map(([id, d]) => ({ lvl: (d.reqs && d.reqs.ranged) || 1, icon: id, text: 'Wear ' + d.name + ' (armour +' + (d.armour || 0) + ')' }))) };
      case 'runecraft': return { desc: 'Mine blank rune essence in the mine under the Ringwall, then bind it at an altar. You need the matching talisman in your pack — it is a key, not an ingredient, and is never used up. Higher levels bind more runes from the same essence. The five deep altars want pure essence, which needs Mining 30.',
        unlocks: RUNE_ALTARS.map(a => ({ lvl: a.lvl, icon: a.rune + '_rune',
          text: (a.pure ? 'Pure essence' : 'Rune essence') + ' at the ' + a.rune + ' altar (' + a.xp + ' xp, x2 at ' + (a.lvl + a.every) + ')' })) };
      case 'herblore': return { desc: 'Clean a grimy herb, add it to a vial of water for an unfinished potion, then mix in the secondary. Druids at the Ringwall carry both halves; Ilma sells the rest. Potions boost a skill for three minutes and come in three doses.',
        unlocks: HERBS.map(h => ({ lvl: h.lvl, icon: h.id, text: 'Clean ' + ITEMS[h.id].name + ' (' + h.xp + ' xp)' }))
          .concat(POTIONS.map(r => ({ lvl: r.lvl, icon: r.id,
            text: ITEMS[r.id].name + ' — ' + ITEMS[r.herb].name + ' + ' + ITEMS[r.sec].name + ' (' + r.xp + ' xp)' }))) };
      case 'prayer': return { desc: 'Bury bones for xp. Activate prayers to boost combat — they drain points you recharge at an altar.',
        unlocks: [{ lvl: 1, icon: 'bones', text: 'Bury Bones (3.75 xp)' }, { lvl: 1, icon: 'big_bones', text: 'Bury Big bones (15 xp) — from hill giants' }, { lvl: 1, icon: 'dragon_bones', text: 'Bury Dragon bones (60 xp)' }].concat(PRAYERS.map(p => ({ lvl: p.lvl, text: p.name + ' — boosts ' + p.boost }))) };
      case 'magic': return { desc: 'Ready a spell in the book, then click what it wants: a monster for combat and curses, an item in your pack for enchanting, alchemy and superheating, a ground item for Telekinetic Grab. Runes come from the rune-seller at the Chapman Cross market on the southern highway — the general store does not stock them; a staff supplies its own element free, so pick the staff that matches what you cast most.',
        unlocks: SPELLS.map(s => ({ lvl: s.lvl,
          text: s.name + (s.max ? ' (max ' + s.max + ')' : s.kind === 'curse' ? ' (saps ' + SAP_NAME[s.sap] + ')' : s.kind === 'enchant' ? ' (' + s.ench + ' jewellery)' : '') +
            ' — ' + Object.entries(s.runes).map(([r, n]) => n + ' ' + ITEMS[r].name).join(', ') }))
          .concat(Object.entries(ITEMS).filter(([id, d]) => d.magic && d.slot === 'weapon')
            .map(([id, d]) => ({ lvl: d.wield || 1, icon: id, text: 'Wield ' + d.name + ' (magic aim +' + d.mAim + ', free ' + ITEMS[d.provides].name + ')' })))
          .concat(Object.entries(ITEMS).filter(([id, d]) => d.dclass === 'magic' && d.slot)
            .map(([id, d]) => ({ lvl: (d.reqs && d.reqs.magic) || 1, icon: id, text: 'Wear ' + d.name + ' (magic aim +' + (d.mAim || 0) + ')' }))) };
      case 'attack': return { desc: 'Determines the weapons you can wield and your accuracy in melee.',
        unlocks: METALS.map(m => ({ lvl: m.wield, text: 'Wield ' + cap(m.id) + ' weapons' })).concat([{ lvl: 30, text: 'Wield the Dragon Sword' }]) };
      case 'strength': return { desc: 'Increases your maximum melee hit. Train with the Aggressive combat style.', unlocks: [{ lvl: 1, text: 'Higher max hits as this rises' }] };
      case 'defense': return { desc: 'Reduces how often enemies hit you, and lets you wear better armour. Train Defensive.',
        unlocks: [
          { lvl: 1, text: 'Fewer enemy hits as this rises' },
          { lvl: 1, icon: 'leather_body', text: 'Wear Leather armour & Wooden shields' },
        ].concat(METALS.map(m => ({ lvl: m.wield, icon: m.id + '_chain', text: 'Wear ' + cap(m.id) + ' armour (helm, body, shield)' })))
         .concat([{ lvl: 5, icon: 'hard_leather_body', text: 'Wear a Hard Leather Body' }]) };
      case 'hits': return { desc: 'Your life points. Rises as you train combat. At 0 hits you die.', unlocks: [{ lvl: 10, text: 'You start at 10 Hits' }] };
      case 'crafting': return { desc: 'Two trades under one name. Leather into armour with a needle — cows drop the hide. And gems into jewellery: cut a stone with a chisel, then pour a bar into a mould at a furnace to set it. Jewellery does nothing until Magic enchants it.',
        unlocks: CRAFTABLES.map(r => ({ lvl: r.lvl, icon: r.id, text: 'Craft ' + ITEMS[r.id].name + ' (' + r.leather + ' leather, ' + r.xp + ' xp)' }))
          .concat(Object.entries(GEM_CUTS).map(([u, r]) => ({ lvl: r.lvl, icon: r.id, text: 'Cut ' + ITEMS[u].name + ' -> ' + ITEMS[r.id].name + ' (' + r.xp + ' xp)' })))
          .concat(JEWELLERY.map(r => ({ lvl: r.lvl, icon: r.id, text: 'Cast ' + ITEMS[r.id].name + ' (' + ITEMS[r.bar].name + (r.gem ? ' + ' + ITEMS[r.gem].name : '') + ', ' + r.xp + ' xp)' })))
          .sort((a, b) => a.lvl - b.lvl) };
      case 'farming': return { desc: 'Work the allotments at Green Vale Farm. Rake a patch clear, sow a seed, then go and do something else — crops ripen in real time and keep growing while the game is closed. Come back and harvest. Farmer Wend sells rakes and seed.',
        unlocks: [{ lvl: 1, icon: 'rake', text: 'Rake weeds off an allotment (4 xp)' }]
          .concat(Object.entries(CROPS).map(([sid, c]) => ({ lvl: c.lvl, icon: c.crop,
            text: 'Sow ' + c.name + ' — ' + c.grow + ' min, ' + c.yield[0] + '-' + c.yield[1] + ' crops (' + c.plantXp + ' xp to plant, ' + c.cropXp + ' each)' })))
          .concat([{ lvl: 1, icon: 'flour', text: 'Grind wheat → flour at the windmill (12 xp)' }, { lvl: 1, icon: 'bucket_of_milk', text: 'Milk cows, gather eggs from the coop' }]) };
      default: return { desc: 'Train this skill through play.', unlocks: [] };
    }
  },

  drawMinimap(G) {
    const c = this.mmctx, S = 156, T = 3, N = S / T;
    const l = G.player.layer;
    const px = Math.floor(G.player.x), pz = Math.floor(G.player.z);
    const half = N / 2 | 0;
    c.fillStyle = '#000'; c.fillRect(0, 0, S, S);
    for (let dx = -half; dx < half; dx++) for (let dz = -half; dz < half; dz++) {
      const x = px + dx, z = pz + dz;
      if (x < 0 || z < 0 || x >= World.SIZE || z >= World.SIZE) continue;
      const t = World.L[l].tile[x][z];
      if (t === 'void') continue;
      c.fillStyle = { water: '#3d5d8a', sand: '#b0a068', rock: '#6e6a60', path: '#9a8a64', road: '#8a8578', floor: '#8a6d46', dfloor: '#57534a', dwall: '#26241f' }[t] || '#4c7a3d';
      c.fillRect((dx + half) * T, (dz + half) * T, T, T);
      const s = World.L[l].scenery.get(World.key(x, z));
      if (s) {
        c.fillStyle = s.type === 'tree' || s.type === 'oak' || s.type === 'willow' ? '#1e4a18'
          : s.type === 'fire' ? '#ff7a00'
          : s.type === 'fishing_spot' || s.type === 'lure_spot' ? '#9cf'
          : s.type.startsWith('ladder') ? '#ff0'
          : s.type === 'fountain' || s.type === 'well' ? '#5cc9ff'
          : s.type === 'lamppost' ? '#ffd23a'
          : s.type === 'statue' ? '#cfc8b8'
          : s.type === 'stall' ? '#c23a3a'
          : s.type === 'wall' || s.type === 'tower' ? '#8a8578' : '#555';
        c.fillRect((dx + half) * T, (dz + half) * T, T, T);
      }
    }
    for (const n of G.npcs) {
      if (n.deadUntil || n.layer !== l) continue;
      const dx = n.x - px + half, dz = n.z - pz + half;
      if (dx >= 0 && dz >= 0 && dx < N && dz < N) { c.fillStyle = '#ff0'; c.fillRect(dx * T, dz * T, T, T); }
    }
    c.fillStyle = '#fff';
    c.fillRect(half * T - 1, half * T - 1, 5, 5);
  }
};
