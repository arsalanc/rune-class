'use strict';
// ---------------------------------------------------------------------------
// ItemIcons — procedurally-drawn inventory icons so each item reads clearly and
// metal tiers/food states are distinct. Drawn once per id on a canvas, cached.
// Falls back to the item's emoji for anything not specially handled.
// ---------------------------------------------------------------------------
const ItemIcons = {
  SIZE: 32,
  _cache: {},

  el(id) {
    const c = document.createElement('canvas');
    c.width = c.height = this.SIZE; c.className = 'icon';
    c.getContext('2d').drawImage(this._src(id), 0, 0);
    return c;
  },

  // ---- NPC/player face portrait for the dialogue box (drawn from their colours,
  //      since the low-poly models have no faces) ----
  portrait(g, S, look, type) {
    look = look || {};
    const skin = look.skin || '#c8956c', shirt = look.shirt || '#7a5c3a';
    const hairCol = look.beard ? '#b8b0a0' : type === 'guide' ? '#5a4632' : '#3f3020';
    const ghost = type === 'ghost', skele = type === 'skeleton', mob = ghost || skele || type === 'zombie';
    // backdrop
    const bg = g.createRadialGradient(S / 2, S * 0.42, 4, S / 2, S * 0.5, S * 0.7);
    bg.addColorStop(0, '#4a4433'); bg.addColorStop(1, '#2a251b');
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    if (ghost) g.globalAlpha = 0.72;
    // shoulders
    g.fillStyle = shirt; g.beginPath(); g.ellipse(S * 0.5, S * 1.02, S * 0.42, S * 0.34, 0, Math.PI, 0); g.fill();
    // neck
    g.fillStyle = skin; this._rect(g, S * 0.42, S * 0.62, S * 0.16, S * 0.16, skin);
    // head
    g.fillStyle = skin; g.beginPath(); g.ellipse(S * 0.5, S * 0.44, S * 0.24, S * 0.28, 0, 0, 7); g.fill();
    // ears
    this._circ(g, S * 0.26, S * 0.46, S * 0.045, skin); this._circ(g, S * 0.74, S * 0.46, S * 0.045, skin);
    // hair / helm
    if (look.helm) { g.fillStyle = look.helmCol || '#9a9da6'; g.beginPath(); g.ellipse(S * 0.5, S * 0.34, S * 0.27, S * 0.2, 0, Math.PI, 0); g.fill(); this._rect(g, S * 0.23, S * 0.3, S * 0.54, S * 0.06, look.helmCol || '#9a9da6'); this._rect(g, S * 0.47, S * 0.3, S * 0.06, S * 0.2, look.helmCol || '#9a9da6'); }
    else if (!look.noHair && !mob) { g.fillStyle = hairCol; g.beginPath(); g.ellipse(S * 0.5, S * 0.3, S * 0.26, S * 0.18, 0, Math.PI, 0); g.fill(); this._rect(g, S * 0.24, S * 0.28, S * 0.08, S * 0.2, hairCol); this._rect(g, S * 0.68, S * 0.28, S * 0.08, S * 0.2, hairCol); }
    // eyes
    const ey = S * 0.44;
    if (skele || ghost) { this._circ(g, S * 0.4, ey, S * 0.055, '#1a1a1a'); this._circ(g, S * 0.6, ey, S * 0.055, '#1a1a1a'); }
    else {
      this._circ(g, S * 0.4, ey, S * 0.05, '#fff'); this._circ(g, S * 0.6, ey, S * 0.05, '#fff');
      this._circ(g, S * 0.4, ey, S * 0.025, '#2a1f16'); this._circ(g, S * 0.6, ey, S * 0.025, '#2a1f16');
      this._rect(g, S * 0.33, ey - S * 0.09, S * 0.13, S * 0.02, hairCol); this._rect(g, S * 0.54, ey - S * 0.09, S * 0.13, S * 0.02, hairCol); // brows
    }
    // nose + mouth
    this._line(g, S * 0.5, ey + S * 0.02, S * 0.5, ey + S * 0.1, this._shade(skin, -30), 1.4);
    g.strokeStyle = skele ? '#3a2a20' : '#7a4a44'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(S * 0.43, S * 0.58); g.lineTo(S * 0.57, S * 0.58); g.stroke();
    if (skele) for (let mx = 0.4; mx <= 0.6; mx += 0.05) this._line(g, S * mx, S * 0.55, S * mx, S * 0.61, '#3a2a20', 1); // teeth
    if (look.beard) { g.fillStyle = hairCol; g.beginPath(); g.ellipse(S * 0.5, S * 0.58, S * 0.2, S * 0.16, 0, 0, Math.PI); g.fill(); }
    g.globalAlpha = 1;
  },
  _shade(hex, d) { const n = parseInt(hex.slice(1), 16); const r = Math.max(0, Math.min(255, (n >> 16) + d)), gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + d)), b = Math.max(0, Math.min(255, (n & 255) + d)); return 'rgb(' + r + ',' + gg + ',' + b + ')'; },
  portraitEl(canvas, look, type) {
    const S = canvas.width, g = canvas.getContext('2d');
    g.clearRect(0, 0, S, canvas.height);
    this.portrait(g, S, look, type);
  },

  // ---- per-skill glyphs for the Stats panel & skill guide ----
  skillEl(id, size) {
    const S = size || 24, c = document.createElement('canvas');
    c.width = c.height = S; c.className = 'skillicon';
    this.skill(c.getContext('2d'), S, id);
    return c;
  },
  skill(g, S, id) {
    const w = this._wood, steel = { b: '#aab4c0', h: '#dde4ec', d: '#74808c' }, L = (a, b, x1, y1, x2, y2, cc, ww) => this._line(g, S * x1, S * y1, S * x2, S * y2, cc, ww);
    switch (id) {
      case 'attack': this._sword(g, S, steel); break;
      case 'strength': // flexed arm
        this._rect(g, S * 0.3, S * 0.5, S * 0.16, S * 0.32, '#c8956c'); g.fillStyle = '#c8956c'; g.beginPath(); g.arc(S * 0.52, S * 0.44, S * 0.2, 0, 7); g.fill(); this._rect(g, S * 0.5, S * 0.24, S * 0.3, S * 0.16, '#c8956c'); break;
      case 'defense': this._shield(g, S, steel); break;
      case 'hits': g.fillStyle = '#c83a3a'; g.beginPath(); g.moveTo(S * 0.5, S * 0.8); g.bezierCurveTo(S * 0.05, S * 0.45, S * 0.32, S * 0.14, S * 0.5, S * 0.4); g.bezierCurveTo(S * 0.68, S * 0.14, S * 0.95, S * 0.45, S * 0.5, S * 0.8); g.fill(); break;
      case 'ranged': this._bow(g, S, true); break;
      case 'prayer': g.strokeStyle = '#e7d27a'; g.lineWidth = 2.4; g.beginPath(); g.arc(S * 0.5, S * 0.32, S * 0.13, 0, 7); g.stroke(); L(0, 0, 0.5, 0.42, 0.5, 0.82, '#e7d27a', 2.4); L(0, 0, 0.3, 0.54, 0.7, 0.54, '#e7d27a', 2.4); break;
      case 'magic': { // wizard hat — visually distinct from prayer's ankh
        this._poly(g, [[S * 0.5, S * 0.08], [S * 0.74, S * 0.66], [S * 0.26, S * 0.66]], '#3f5fd0'); // cone
        this._rect(g, S * 0.14, S * 0.64, S * 0.72, S * 0.12, '#2b357a');                            // brim
        const star = (cx, cy, ro, ri) => { const p = []; for (let k = 0; k < 8; k++) { const ang = -Math.PI / 2 + k * Math.PI / 4, rr = k % 2 ? ri : ro; p.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]); } this._poly(g, p, '#ffd24a'); };
        star(S * 0.5, S * 0.42, S * 0.11, S * 0.045);                                                // gold star emblem
        break;
      }
      case 'cooking': g.fillStyle = '#3a3a42'; g.beginPath(); g.arc(S * 0.5, S * 0.56, S * 0.26, 0, Math.PI); g.fill(); this._rect(g, S * 0.2, S * 0.5, S * 0.6, S * 0.08, '#2b2b30'); this._poly(g, [[S * 0.5, S * 0.16], [S * 0.58, S * 0.36], [S * 0.42, S * 0.36]], '#ff8a2a'); break;
      case 'woodcut': L(0, 0, 0.32, 0.84, 0.6, 0.24, w.d, 3); this._poly(g, [[S * 0.5, S * 0.1], [S * 0.82, S * 0.18], [S * 0.66, S * 0.4]], steel.b); break;
      case 'fishing': this._fish(g, S, false, true); break;
      case 'firemaking': this._poly(g, [[S * 0.5, S * 0.14], [S * 0.72, S * 0.5], [S * 0.62, S * 0.82], [S * 0.38, S * 0.82], [S * 0.28, S * 0.5]], '#e2531e'); this._poly(g, [[S * 0.5, S * 0.36], [S * 0.6, S * 0.62], [S * 0.4, S * 0.62]], '#ffd24a'); break;
      case 'crafting': this._needle(g, S); this._line(g, S * 0.5, S * 0.3, S * 0.74, S * 0.62, '#c23a3a', 1.4); break;
      case 'fletching': this._arrow(g, S, w); break;
      case 'smithing': this._rect(g, S * 0.18, S * 0.56, S * 0.5, S * 0.16, '#3a3a42'); this._poly(g, [[S * 0.16, S * 0.56], [S * 0.34, S * 0.4], [S * 0.5, S * 0.56]], '#3a3a42'); L(0, 0, 0.66, 0.86, 0.78, 0.4, w.d, 3); this._rect(g, S * 0.62, S * 0.24, S * 0.28, S * 0.14, steel.b); break;
      case 'mining': L(0, 0, 0.34, 0.84, 0.6, 0.2, w.d, 3); g.strokeStyle = steel.b; g.lineWidth = 3; g.beginPath(); g.moveTo(S * 0.28, S * 0.26); g.quadraticCurveTo(S * 0.55, S * 0.12, S * 0.82, S * 0.26); g.stroke(); break;
      case 'farming': for (const dx of [-0.14, 0, 0.14]) { L(0, 0, 0.5 + dx, 0.84, 0.5 + dx, 0.4, '#b7972f', 2); this._circ(g, S * (0.5 + dx), S * 0.34, 3, '#e6c74a'); } break;
      case 'runecraft': return this._talisman(g, S);
      case 'herblore': return this._potion(g, S, '#3fa84a');
      default: this._emoji(g, S, '?');
    }
  },

  // ---- spellbook glyphs -----------------------------------------------------
  // Every spell is a coloured disc with a glyph on it, on a dark plate: the ELEMENT
  // picks the colour, the TIER draws the ring around it. That is the whole reading
  // system of the book it is modelled on — you learn "blue with two rings" as Water
  // Bolt without reading a word, and utility spells break the pattern deliberately
  // so they stand out from the combat grid.
  SPELL_COLS: {
    air:   { a: '#cfe3f2', b: '#8fb6d6', ink: '#3b5a75' },
    water: { a: '#7fc4ff', b: '#2f6fc0', ink: '#123a6b' },
    earth: { a: '#9fd06a', b: '#4d7f2e', ink: '#22400f' },
    fire:  { a: '#ffbe5c', b: '#d1531b', ink: '#5e2005' },
    curse: { a: '#d3a6f0', b: '#7b3fb0', ink: '#33125a' },
    ench:  { a: '#ffe7a0', b: '#c79b2e', ink: '#4d3505' },
    alch:  { a: '#ffe07a', b: '#c08a12', ink: '#4a3204' },
    grab:  { a: '#bfe6ff', b: '#4b90c0', ink: '#123a52' },
    smelt: { a: '#ff9d5c', b: '#c2400f', ink: '#4d1703' }
  },
  spellEl(sp, size) {
    const S = size || 26, c = document.createElement('canvas');
    c.width = c.height = S; c.className = 'spellicon';
    this.spell(c.getContext('2d'), S, sp);
    return c;
  },
  spell(g, S, sp) {
    const col = this.SPELL_COLS[sp.elem] || this.SPELL_COLS.air;
    const cx = S * 0.5, cy = S * 0.5;
    // the disc, with a soft top-light so it reads as a stone and not a flat circle
    const grd = g.createLinearGradient(0, S * 0.16, 0, S * 0.86);
    grd.addColorStop(0, col.a); grd.addColorStop(1, col.b);
    g.fillStyle = grd;
    g.beginPath(); g.arc(cx, cy, S * 0.36, 0, 7); g.fill();
    g.strokeStyle = col.ink; g.lineWidth = Math.max(1, S * 0.045);
    g.beginPath(); g.arc(cx, cy, S * 0.36, 0, 7); g.stroke();
    // tier rings: one for strike, two for bolt, three for blast
    for (let t = 1; t < (sp.tier || 1) && t < 4; t++) {
      g.lineWidth = Math.max(1, S * 0.035);
      g.beginPath(); g.arc(cx, cy, S * (0.36 - t * 0.075), 0, 7); g.stroke();
    }
    const ink = col.ink, lw = Math.max(1.4, S * 0.075);
    g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
    const P = (...pts) => { g.beginPath(); g.moveTo(S * pts[0], S * pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(S * pts[i], S * pts[i + 1]); g.stroke(); };
    switch (sp.elem) {
      case 'air':   // three curling gusts
        for (const y of [0.4, 0.5, 0.6]) { g.beginPath(); g.moveTo(S * 0.34, S * y); g.quadraticCurveTo(S * 0.55, S * (y - 0.08), S * 0.66, S * y); g.stroke(); }
        break;
      case 'water': // a droplet
        g.beginPath(); g.moveTo(cx, S * 0.32);
        g.bezierCurveTo(S * 0.68, S * 0.5, S * 0.64, S * 0.68, cx, S * 0.68);
        g.bezierCurveTo(S * 0.36, S * 0.68, S * 0.32, S * 0.5, cx, S * 0.32); g.fill();
        break;
      case 'earth': // a stacked cairn
        this._rect(g, S * 0.36, S * 0.55, S * 0.28, S * 0.13, ink);
        this._rect(g, S * 0.41, S * 0.42, S * 0.18, S * 0.12, ink);
        break;
      case 'fire':  // a flame
        g.beginPath(); g.moveTo(cx, S * 0.3);
        g.bezierCurveTo(S * 0.7, S * 0.5, S * 0.62, S * 0.7, cx, S * 0.7);
        g.bezierCurveTo(S * 0.38, S * 0.7, S * 0.42, S * 0.54, cx, S * 0.3); g.fill();
        break;
      case 'curse': // a downward broken arrow — something being pulled down
        P(0.5, 0.32, 0.5, 0.62); P(0.38, 0.52, 0.5, 0.66, 0.62, 0.52);
        break;
      case 'ench':  // a faceted gem
        this._poly(g, [[cx, S * 0.32], [S * 0.66, S * 0.46], [cx, S * 0.68], [S * 0.34, S * 0.46]], ink);
        break;
      case 'alch':  // a coin with a slash of light
        g.beginPath(); g.arc(cx, cy, S * 0.17, 0, 7); g.fill();
        g.strokeStyle = col.a; g.lineWidth = Math.max(1, S * 0.05);
        g.beginPath(); g.moveTo(S * 0.44, S * 0.44); g.lineTo(S * 0.56, S * 0.56); g.stroke();
        break;
      case 'grab':  // an open hand reaching
        this._rect(g, S * 0.42, S * 0.5, S * 0.16, S * 0.16, ink);
        for (const x of [0.4, 0.47, 0.54, 0.61]) P(x, 0.5, x, 0.34);
        break;
      case 'smelt': // a bar over a flame
        this._rect(g, S * 0.34, S * 0.36, S * 0.32, S * 0.11, ink);
        P(0.42, 0.68, 0.5, 0.54, 0.58, 0.68);
        break;
    }
  },

  // ---- prayer glyphs --------------------------------------------------------
  // Grouped by what the prayer does and tinted by how strong it is: the same
  // symbol in dull bronze, bright silver and gold as you climb a group, so the
  // book shows its own progression the way the original's does.
  PRAY_TINT: [
    { a: '#c99a63', b: '#8a5f2e', ink: '#3c2710' },   // tier 1
    { a: '#dfe6ee', b: '#98a3b0', ink: '#3a424c' },   // tier 2
    { a: '#ffdf7a', b: '#c99b1e', ink: '#4c3705' }    // tier 3
  ],
  PRAY_PROT: { melee: '#c0433a', ranged: '#3f9a4a', magic: '#4470c8' },
  prayEl(pr, size) {
    const S = size || 26, c = document.createElement('canvas');
    c.width = c.height = S; c.className = 'prayicon';
    this.pray(c.getContext('2d'), S, pr);
    return c;
  },
  pray(g, S, pr) {
    // rank within its own group decides the tint
    const group = PRAYERS.filter(p => p.group === pr.group);
    const rank = Math.min(2, group.indexOf(pr));
    const t = this.PRAY_TINT[rank];
    const cx = S * 0.5;
    if (pr.protect) {
      // protection prayers are a shield in the colour of the style they turn aside
      const c2 = this.PRAY_PROT[pr.protect];
      g.fillStyle = c2;
      g.beginPath();
      g.moveTo(cx, S * 0.16); g.lineTo(S * 0.84, S * 0.32); g.lineTo(S * 0.84, S * 0.56);
      g.quadraticCurveTo(S * 0.84, S * 0.8, cx, S * 0.9);
      g.quadraticCurveTo(S * 0.16, S * 0.8, S * 0.16, S * 0.56);
      g.lineTo(S * 0.16, S * 0.32); g.closePath(); g.fill();
      g.strokeStyle = '#20242c'; g.lineWidth = Math.max(1, S * 0.05); g.stroke();
      g.strokeStyle = '#f4f1e6'; g.lineWidth = Math.max(1.4, S * 0.07); g.lineCap = 'round';
      if (pr.protect === 'melee') {            // crossed blades
        g.beginPath(); g.moveTo(S * 0.34, S * 0.36); g.lineTo(S * 0.66, S * 0.66); g.stroke();
        g.beginPath(); g.moveTo(S * 0.66, S * 0.36); g.lineTo(S * 0.34, S * 0.66); g.stroke();
      } else if (pr.protect === 'ranged') {    // an arrow head-on
        g.beginPath(); g.moveTo(cx, S * 0.3); g.lineTo(cx, S * 0.7); g.stroke();
        g.beginPath(); g.moveTo(S * 0.38, S * 0.44); g.lineTo(cx, S * 0.3); g.lineTo(S * 0.62, S * 0.44); g.stroke();
      } else {                                  // a star
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 4;
          g.beginPath();
          g.moveTo(cx - Math.cos(a) * S * 0.18, S * 0.52 - Math.sin(a) * S * 0.18);
          g.lineTo(cx + Math.cos(a) * S * 0.18, S * 0.52 + Math.sin(a) * S * 0.18);
          g.stroke();
        }
      }
      return;
    }
    const grd = g.createLinearGradient(0, S * 0.14, 0, S * 0.88);
    grd.addColorStop(0, t.a); grd.addColorStop(1, t.b);
    g.fillStyle = grd; g.strokeStyle = t.ink;
    g.lineWidth = Math.max(1, S * 0.05); g.lineJoin = 'round'; g.lineCap = 'round';
    const fillStroke = () => { g.fill(); g.stroke(); };
    // One symbol per group, following the reference book: cross for Defence,
    // flexed arm for Strength, brain for Attack, eye for Ranged, pyramid for Magic.
    // All of them are chunky on purpose — these are read at 26px.
    switch (pr.group) {
      case 'def': {   // a broad cross
        g.beginPath();
        g.moveTo(S * 0.40, S * 0.10); g.lineTo(S * 0.60, S * 0.10); g.lineTo(S * 0.60, S * 0.34);
        g.lineTo(S * 0.86, S * 0.34); g.lineTo(S * 0.86, S * 0.54); g.lineTo(S * 0.60, S * 0.54);
        g.lineTo(S * 0.60, S * 0.90); g.lineTo(S * 0.40, S * 0.90); g.lineTo(S * 0.40, S * 0.54);
        g.lineTo(S * 0.14, S * 0.54); g.lineTo(S * 0.14, S * 0.34); g.lineTo(S * 0.40, S * 0.34);
        g.closePath(); fillStroke();
        break;
      }
      case 'str': {   // a flexed arm, built from blocks — curves turn to mush at 26px
        // upper arm across the bottom, forearm standing up on the right, fist on top
        g.beginPath();
        g.moveTo(S * 0.08, S * 0.60);
        g.lineTo(S * 0.52, S * 0.60);   // upper arm, elbow at the right
        g.lineTo(S * 0.52, S * 0.30);   // forearm rising
        g.lineTo(S * 0.86, S * 0.30);
        g.lineTo(S * 0.86, S * 0.10);   // fist
        g.lineTo(S * 0.44, S * 0.10);
        g.lineTo(S * 0.44, S * 0.44);   // inside of the elbow
        g.lineTo(S * 0.08, S * 0.44);
        g.closePath(); fillStroke();
        // the bicep, bulging over the joint
        g.beginPath(); g.ellipse(S * 0.30, S * 0.44, S * 0.20, S * 0.15, 0, Math.PI, 0); fillStroke();
        break;
      }
      case 'att': {   // a brain: two lobes and a fissure
        g.beginPath();
        g.moveTo(S * 0.5, S * 0.16);
        g.bezierCurveTo(S * 0.86, S * 0.14, S * 0.92, S * 0.56, S * 0.68, S * 0.76);
        g.quadraticCurveTo(S * 0.5, S * 0.90, S * 0.32, S * 0.76);
        g.bezierCurveTo(S * 0.08, S * 0.56, S * 0.14, S * 0.14, S * 0.5, S * 0.16);
        g.closePath(); fillStroke();
        g.lineWidth = Math.max(1, S * 0.055);
        g.beginPath(); g.moveTo(S * 0.5, S * 0.18); g.lineTo(S * 0.5, S * 0.82); g.stroke();
        g.beginPath();                                       // a fold either side
        g.moveTo(S * 0.32, S * 0.34); g.quadraticCurveTo(S * 0.42, S * 0.44, S * 0.32, S * 0.56); g.stroke();
        g.beginPath();
        g.moveTo(S * 0.68, S * 0.34); g.quadraticCurveTo(S * 0.58, S * 0.44, S * 0.68, S * 0.56); g.stroke();
        break;
      }
      case 'rng': {   // an eye
        g.beginPath();
        g.moveTo(S * 0.08, S * 0.5);
        g.quadraticCurveTo(cx, S * 0.16, S * 0.92, S * 0.5);
        g.quadraticCurveTo(cx, S * 0.84, S * 0.08, S * 0.5);
        g.closePath(); fillStroke();
        g.fillStyle = t.ink;
        g.beginPath(); g.arc(cx, S * 0.5, S * 0.15, 0, 7); g.fill();
        g.fillStyle = '#ffffff'; g.globalAlpha = 0.8;
        g.beginPath(); g.arc(cx - S * 0.05, S * 0.44, S * 0.05, 0, 7); g.fill();
        g.globalAlpha = 1;
        break;
      }
      case 'mag': {   // a pyramid
        g.beginPath();
        g.moveTo(cx, S * 0.12); g.lineTo(S * 0.9, S * 0.84); g.lineTo(S * 0.1, S * 0.84);
        g.closePath(); fillStroke();
        g.lineWidth = Math.max(1, S * 0.05);
        g.beginPath(); g.moveTo(cx, S * 0.12); g.lineTo(cx, S * 0.84); g.stroke();  // the near edge
        break;
      }
    }
  },

  // ---- emote glyphs ---------------------------------------------------------
  // A little figure struck in the emote's own pose, read out of the SAME
  // emotePose() the renderers animate — so the button always shows what you are
  // about to do, and adding an emote never means drawing a second icon by hand.
  // `at` is the moment in the cycle that reads best as a still.
  // Picked so each still lands on the PEAK of that emote's oscillation, not a
  // zero-crossing — a nod caught mid-cycle is just a figure standing still.
  EMOTE_STILL: { yes: 0.125, no: 0.125, wave: 0.083, clap: 0.5, dance: 0.125, jig: 0.083,
                 headbang: 0.083, panic: 0.05, cheer: 0.25, jump: 0.5, spin: 0.3,
                 beckon: 0.083, angry: 0.0625, raspberry: 0.5, blow_kiss: 0.85 },
  emoteEl(id, size) {
    const S = size || 26, c = document.createElement('canvas');
    c.width = c.height = S; c.className = 'emoteicon';
    this.emote(c.getContext('2d'), S, id);
    return c;
  },
  emote(g, S, id) {
    const p = emotePose(id, this.EMOTE_STILL[id] !== undefined ? this.EMOTE_STILL[id] : 0.5);
    const skin = '#e8b98d', tunic = '#8a5a8a', trews = '#4a4460';
    // the figure stands in the lower two-thirds; bob lifts it, lean tips it
    const cx = S * 0.5, groundY = S * 0.9 - p.bob * S * 0.5;
    g.save();
    g.translate(cx, groundY);
    if (p.lean || p.tilt) g.rotate(p.tilt - p.lean * 0.35);   // a hint of the 3D tip, flattened
    const U = S / 26;                                          // one "unit" at 26px
    // A limb is one line from its joint. `ang` is measured from straight-down, so
    // 0 hangs, PI/2 sticks out sideways and PI points straight up — which lets the
    // 3D pitch (raise) and roll (spread) collapse onto one angle in this flat view.
    const limb = (jx, jy, ang, sign, len) => {
      g.beginPath(); g.moveTo(jx, jy);
      g.lineTo(jx + Math.sin(ang) * len * sign, jy + Math.cos(ang) * len);
      g.stroke();
    };
    // legs: their pitch reads as a kick out to the side in a front-on view
    g.strokeStyle = trews; g.lineWidth = 2.6 * U; g.lineCap = 'round';
    limb(-1.6 * U, -7 * U, Math.abs(p.legL) * 0.9, -1, 7 * U);
    limb(1.6 * U, -7 * U, Math.abs(p.legR) * 0.9, 1, 7 * U);
    // torso
    g.fillStyle = tunic;
    g.fillRect(-3 * U, -14 * U, 6 * U, 7.5 * U);
    // arms: raising the arm (negative pitch) and spreading it (roll) both open the
    // same angle away from the body
    g.strokeStyle = skin; g.lineWidth = 2.4 * U;
    for (const [sign, pit, rol] of [[-1, p.lPit, p.lRol], [1, p.rPit, p.rRol]]) {
      const ang = Math.min(Math.PI, Math.abs(rol) + Math.max(0, -pit) * 0.92);
      limb(sign * 3 * U, -13 * U, ang, sign, 6.5 * U);
    }
    // head, with its own tilt
    g.save();
    g.translate(0, -14.5 * U);
    g.rotate(p.headRoll + p.headPitch * 0.5);
    // amplified: a nod is a fraction of a radian, which at 26px is sub-pixel unless
    // it is exaggerated — Yes and No are otherwise indistinguishable from standing
    g.translate(p.headYaw * 5 * U, p.headPitch * 5 * U);
    this._circ(g, 0, -2.4 * U, 3.1 * U, skin);
    g.restore();
    g.restore();
  },

  // ---- RS-style tab-bar glyphs ----
  tabEl(name) {
    const S = 26, c = document.createElement('canvas');
    c.width = c.height = S; c.className = 'tabicon';
    const g = c.getContext('2d'), base = '#e6dcc0';
    switch (name) {
      case 'inv': {   // a leather satchel: tan body, darker flap, brass buckle
        const body = g.createLinearGradient(0, S * 0.36, 0, S * 0.88);
        body.addColorStop(0, '#a9743c'); body.addColorStop(1, '#6e4526');
        g.fillStyle = body;
        g.beginPath();
        g.moveTo(S * 0.2, S * 0.42); g.lineTo(S * 0.8, S * 0.42);
        g.lineTo(S * 0.76, S * 0.86); g.lineTo(S * 0.24, S * 0.86);
        g.closePath(); g.fill();
        g.strokeStyle = '#4a2e15'; g.lineWidth = 1.4; g.stroke();
        // the carry handle, arcing over the top
        g.strokeStyle = '#7a4f28'; g.lineWidth = 2.4;
        g.beginPath(); g.arc(S * 0.5, S * 0.42, S * 0.17, Math.PI, 0); g.stroke();
        // flap
        const flap = g.createLinearGradient(0, S * 0.4, 0, S * 0.64);
        flap.addColorStop(0, '#c88f4e'); flap.addColorStop(1, '#9a6534');
        g.fillStyle = flap;
        g.beginPath();
        g.moveTo(S * 0.18, S * 0.4); g.lineTo(S * 0.82, S * 0.4);
        g.lineTo(S * 0.78, S * 0.62); g.lineTo(S * 0.22, S * 0.62);
        g.closePath(); g.fill();
        g.strokeStyle = '#4a2e15'; g.lineWidth = 1.2; g.stroke();
        this._rect(g, S * 0.42, S * 0.56, S * 0.16, S * 0.13, '#e2b93c');   // brass buckle
        this._rect(g, S * 0.45, S * 0.59, S * 0.1, S * 0.06, '#8a6a1e');
        break;
      }
      case 'worn': {   // a knight's helm: steel dome, gold band, red plume
        this._line(g, S * 0.5, S * 0.26, S * 0.5, S * 0.08, '#c0433a', 3);  // plume
        this._circ(g, S * 0.5, S * 0.08, S * 0.07, '#d9564a');
        const dome = g.createLinearGradient(S * 0.3, 0, S * 0.74, 0);
        dome.addColorStop(0, '#dde4ec'); dome.addColorStop(0.45, '#aab4c0'); dome.addColorStop(1, '#6d7883');
        g.fillStyle = dome;
        g.beginPath(); g.arc(S * 0.5, S * 0.56, S * 0.3, Math.PI, 0); g.fill();
        this._rect(g, S * 0.2, S * 0.56, S * 0.6, S * 0.22, '#939ea9');     // face plate
        g.strokeStyle = '#5b646e'; g.lineWidth = 1.2;
        g.beginPath(); g.arc(S * 0.5, S * 0.56, S * 0.3, Math.PI, 0); g.stroke();
        g.strokeRect(S * 0.2, S * 0.56, S * 0.6, S * 0.22);
        this._rect(g, S * 0.2, S * 0.53, S * 0.6, S * 0.07, '#e2b93c');     // gold brow band
        this._rect(g, S * 0.24, S * 0.63, S * 0.2, S * 0.07, '#3a4149');    // eye slits
        this._rect(g, S * 0.56, S * 0.63, S * 0.2, S * 0.07, '#3a4149');
        this._rect(g, S * 0.47, S * 0.56, S * 0.06, S * 0.22, '#c9d2db');   // nose guard
        break;
      }
      case 'stats':
        this._rect(g, S * 0.24, S * 0.5, S * 0.14, S * 0.32, '#9acda0'); this._rect(g, S * 0.43, S * 0.36, S * 0.14, S * 0.46, '#e0d48a'); this._rect(g, S * 0.62, S * 0.24, S * 0.14, S * 0.58, '#d99a6a'); break;
      case 'pray': {   // a gold ankh with a sapphire in the loop, on a soft halo
        const halo = g.createRadialGradient(S * 0.5, S * 0.5, 0, S * 0.5, S * 0.5, S * 0.46);
        halo.addColorStop(0, 'rgba(255,232,150,0.42)'); halo.addColorStop(1, 'rgba(255,232,150,0)');
        g.fillStyle = halo; g.fillRect(0, 0, S, S);
        const gold = g.createLinearGradient(0, S * 0.1, 0, S * 0.9);
        gold.addColorStop(0, '#ffe89a'); gold.addColorStop(0.5, '#e2b93c'); gold.addColorStop(1, '#a37f16');
        g.strokeStyle = gold; g.lineCap = 'round';
        g.lineWidth = 4.2;                                   // the ankh, drawn fat
        g.beginPath(); g.arc(S * 0.5, S * 0.32, S * 0.15, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(S * 0.5, S * 0.46); g.lineTo(S * 0.5, S * 0.88); g.stroke();
        g.beginPath(); g.moveTo(S * 0.26, S * 0.58); g.lineTo(S * 0.74, S * 0.58); g.stroke();
        g.strokeStyle = 'rgba(255,248,214,0.85)'; g.lineWidth = 1.2;   // a highlight down one side
        g.beginPath(); g.moveTo(S * 0.465, S * 0.5); g.lineTo(S * 0.465, S * 0.84); g.stroke();
        this._circ(g, S * 0.5, S * 0.32, S * 0.07, '#2f6fc0');          // the gem
        this._circ(g, S * 0.48, S * 0.3, S * 0.028, '#bfe0ff');
        break;
      }
      // the same wizard hat the Stats panel uses, drawn from one place so the two
      // can never drift apart
      case 'magic': this.skill(g, S, 'magic'); break;
      case 'quest': {   // a parchment scroll, rolled at both ends, red wax seal
        const sheet = g.createLinearGradient(S * 0.2, 0, S * 0.8, 0);
        sheet.addColorStop(0, '#d9cba0'); sheet.addColorStop(0.4, '#f6efd4'); sheet.addColorStop(1, '#cfbf94');
        g.fillStyle = sheet;
        g.fillRect(S * 0.24, S * 0.14, S * 0.52, S * 0.72);
        g.strokeStyle = '#8a7a52'; g.lineWidth = 1;                       // ruled lines
        for (let y = 0.28; y < 0.72; y += 0.11) {
          g.beginPath(); g.moveTo(S * 0.32, S * y); g.lineTo(S * (y < 0.6 ? 0.68 : 0.58), S * y); g.stroke();
        }
        // the rolled ends, top and bottom
        for (const y of [0.14, 0.8]) {
          const roll = g.createLinearGradient(S * 0.16, 0, S * 0.84, 0);
          roll.addColorStop(0, '#a9946a'); roll.addColorStop(0.35, '#e8dcb6'); roll.addColorStop(1, '#94805a');
          g.fillStyle = roll;
          g.beginPath(); g.roundRect ? g.roundRect(S * 0.16, S * y - S * 0.05, S * 0.68, S * 0.12, S * 0.05)
                                     : g.rect(S * 0.16, S * y - S * 0.05, S * 0.68, S * 0.12);
          g.fill();
          g.strokeStyle = '#6f5c38'; g.lineWidth = 1; g.stroke();
        }
        this._circ(g, S * 0.66, S * 0.62, S * 0.13, '#8f251f');            // wax seal, rim then face
        this._circ(g, S * 0.66, S * 0.62, S * 0.105, '#c0433a');
        this._circ(g, S * 0.63, S * 0.59, S * 0.04, '#e07a6a');
        break;
      }
      case 'combat': // crossed sword & sword, RS2's crossed-swords tab
        this._poly(g, [[S * 0.2, S * 0.78], [S * 0.3, S * 0.84], [S * 0.8, S * 0.24], [S * 0.72, S * 0.18]], '#cfd6de');
        this._poly(g, [[S * 0.8, S * 0.78], [S * 0.7, S * 0.84], [S * 0.2, S * 0.24], [S * 0.28, S * 0.18]], '#cfd6de');
        this._line(g, S * 0.18, S * 0.72, S * 0.32, S * 0.86, '#9a6a3a', 3);
        this._line(g, S * 0.82, S * 0.72, S * 0.68, S * 0.86, '#9a6a3a', 3); break;
      case 'emotes': // a simple smiling face
        this._circ(g, S * 0.5, S * 0.5, S * 0.32, '#e7d27a');
        this._circ(g, S * 0.39, S * 0.42, S * 0.055, '#45402f');
        this._circ(g, S * 0.61, S * 0.42, S * 0.055, '#45402f');
        g.strokeStyle = '#45402f'; g.lineWidth = 2; g.beginPath();
        g.arc(S * 0.5, S * 0.52, S * 0.16, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke(); break;
      case 'opts':
        g.fillStyle = base; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * 7, r = S * 0.34; g.lineTo(S * 0.5 + Math.cos(a) * r, S * 0.5 + Math.sin(a) * r); const b = (i + 0.5) / 8 * 7, r2 = S * 0.24; g.lineTo(S * 0.5 + Math.cos(b) * r2, S * 0.5 + Math.sin(b) * r2); } g.closePath(); g.fill();
        this._circ(g, S * 0.5, S * 0.5, S * 0.11, '#45402f'); break;
      default: this._emoji(g, S, '?');
    }
    return c;
  },
  _src(id) {
    if (this._cache[id]) return this._cache[id];
    const S = this.SIZE, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const def = (typeof ITEMS !== 'undefined' && ITEMS[id]) || {};
    try { this.draw(g, S, id, def); } catch (e) { this._emoji(g, S, def.icon || '?'); }
    this._cache[id] = c; return c;
  },

  // ---- palettes & primitives ----
  // skill glyphs for the two new tabs
  _talisman(g, S) { this._circ(g, S*0.5, S*0.5, S*0.28, '#c9a94a'); this._circ(g, S*0.5, S*0.5, S*0.18, '#8a6f22');
    this._rect(g, S*0.46, S*0.26, S*0.08, S*0.48, '#e8d27a'); },
  _potion(g, S, col) { this._rect(g, S*0.42, S*0.16, S*0.16, S*0.14, '#cfd6de');
    this._poly(g, [[S*0.34,S*0.36],[S*0.66,S*0.36],[S*0.72,S*0.82],[S*0.28,S*0.82]], '#b9c4cf');
    this._poly(g, [[S*0.37,S*0.5],[S*0.63,S*0.5],[S*0.68,S*0.79],[S*0.32,S*0.79]], col || '#3fa84a'); },
  _herb(g, S) { this._rect(g, S*0.47, S*0.4, S*0.06, S*0.42, '#4a6b2a');
    for (const [dx,dy] of [[-1,0],[1,-0.12],[-1,-0.24],[1,-0.36]])
      this._poly(g, [[S*0.5,S*(0.7+dy*0.5)],[S*(0.5+dx*0.26),S*(0.62+dy*0.5)],[S*0.5,S*(0.56+dy*0.5)]], '#5f9a38'); },

  metal(id) {
    if (id === 'dragon_sword') return { b: '#3f8a37', h: '#69c25c', d: '#235d1f' };
    if (id.indexOf('iron') === 0 || /_iron/.test(id)) return { b: '#6b6d75', h: '#a4a6ae', d: '#45464c' };
    if (id.indexOf('steel') === 0 || /_steel/.test(id)) return { b: '#aab4c0', h: '#dde4ec', d: '#74808c' };
    if (/^green_dhide|^studded/.test(id)) return { b: '#4f6b34', h: '#7c9c58', d: '#33461f' };
    if (/^mystic/.test(id)) return { b: '#3a3f8c', h: '#6f76c8', d: '#252863' };
    if (id.indexOf('mithril') === 0 || /_mithril/.test(id)) return { b: '#5a6fb5', h: '#8ea3dd', d: '#38477a' };
    if (id.indexOf('adamant') === 0 || /_adamant/.test(id)) return { b: '#4a7d5c', h: '#77b189', d: '#2c523a' };
    if (id.indexOf('silver') === 0) return { b: '#c3ccd6', h: '#f2f6fa', d: '#8f96a0' };
    if (id.indexOf('gold') === 0) return { b: '#e2b93c', h: '#ffe07a', d: '#a37f16' };
    return { b: '#b06a2e', h: '#d79554', d: '#7a4a1e' }; // bronze
  },
  _wood: { b: '#7a5330', h: '#9a7444', d: '#4a3218' },
  _rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); },
  _poly(g, pts, c) { g.fillStyle = c; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); },
  _circ(g, x, y, r, c) { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); },
  _line(g, x1, y1, x2, y2, c, w) { g.strokeStyle = c; g.lineWidth = w || 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); },
  _emoji(g, S, ch) { g.font = Math.floor(S * 0.62) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, S / 2, S / 2 + 1); },

  draw(g, S, id, def) {
    const u = S / 32, m = this.metal(id), w = this._wood;
    // ---- weapons / tools ----
    if (/bow/.test(id) && id !== 'bowstring') return this._bow(g, S, !!def.bow);
    if (id === 'bowstring') return this._bowstring(g, S);
    if (/_arrow$/.test(id)) return this._arrow(g, S, m);
    if (/_arrowheads$/.test(id)) return this._arrowheads(g, S, m);
    if (id === 'arrow_shafts') return this._shafts(g, S, false);
    if (id === 'headless_arrows') return this._shafts(g, S, true);
    if (/sword$/.test(id)) return this._sword(g, S, m);
    if (/mace$/.test(id)) return this._mace(g, S, m);
    if (/pickaxe$/.test(id)) return this._axe(g, S, m, true);
    if (/axe$/.test(id)) return this._axe(g, S, m, false);
    if (id === 'needle') return this._needle(g, S);
    if (id === 'leather') return this._leather(g, S);
    const LEA = { b: '#8a5a2e', h: '#a97a45', d: '#5e3c1c' };
    if (/helm$/.test(id) || id === 'leather_coif') return this._helm(g, S, id === 'leather_coif' ? LEA : m);
    if (/chain$/.test(id) || id === 'leather_body' || id === 'hard_leather_body') return this._body(g, S, /leather/.test(id) ? LEA : m, /chain$/.test(id));
    if (/kite$/.test(id) || id === 'wooden_shield') return this._shield(g, S, id === 'wooden_shield' ? w : m, id === 'wooden_shield');
    if (/platelegs$/.test(id)) return this._legs(g, S, m, true);
    if (/chaps$/.test(id)) return this._legs(g, S, LEA, false);
    if (id === 'wizard_skirt') return this._legs(g, S, { b: '#2f3f96', h: '#5a6cd0', d: '#1d2864' }, false);
    if (id === 'avas_satchel') return this._satchel(g, S);
    if (/^cape_/.test(id) || id === 'highwayman_cloak') return this._cape(g, S, id);
    if (id === 'lodestone_core') return this._lodestone(g, S);
    if (id === 'ava_notes') return this._notes(g, S);
    if (id === 'hammer') return this._hammer(g, S);
    if (id === 'knife') return this._knife(g, S);
    if (id === 'net') return this._net(g, S);
    if (id === 'fishing_rod') return this._rod(g, S);
    if (id === 'tinderbox') return this._tinderbox(g, S);
    // ---- resources ----
    if (/talisman$/.test(id)) return this._talisman(g, S);
    if (/^grimy_/.test(id)) return this._herb(g, S);
    if (HERB_BY_ID && HERB_BY_ID[id]) return this._herb(g, S);
    if (/_potion$|^antipoison$/.test(id)) return this._potion(g, S, def.prayRestore ? '#6fc0e8' : def.restore ? '#e8c04a' : def.cure ? '#8ae05a' : '#3fa84a');
    if (/_unf$/.test(id)) return this._potion(g, S, '#7a8a6a');
    if (/^vial/.test(id)) return this._potion(g, S, id === 'vial_of_water' ? '#4f9ad8' : null);
    if (/essence$/.test(id)) { this._poly(g, [[S*0.3,S*0.7],[S*0.26,S*0.42],[S*0.5,S*0.28],[S*0.74,S*0.44],[S*0.7,S*0.72]], id === 'pure_essence' ? '#dfe4ec' : '#9aa0a8'); return; }
    if (/_bar$/.test(id)) return this._bar(g, S, m);
    if (/_ore$/.test(id) || id === 'coal') return this._ore(g, S, id);
    if (/logs$/.test(id)) return this._logs(g, S, id);
    if (id === 'coins') return this._coins(g, S);
    if (/_rune$/.test(id)) return this._rune(g, S, id);
    if (/bones$/.test(id)) return this._bone(g, S, id === 'dragon_bones');
    if (id === 'feather') return this._feather(g, S);
    if (id === 'fur') return this._fur(g, S);
    if (id === 'ancient_relic') return this._relic(g, S);
    // ---- gems, jewellery & the tools that make them ----
    if (def.uncut) return this._gem(g, S, def.uncut, true);
    if (def.gem) return this._gem(g, S, id, false);
    if (id === 'chisel') return this._chisel(g, S);
    if (/_mould$/.test(id)) return this._mould(g, S, id === 'symbol_mould');
    if (id === 'unblessed_symbol' || id === 'holy_symbol') return this._symbol(g, S, id === 'holy_symbol');
    if (/amulet/.test(id)) return this._amulet(g, S, id);
    // ---- food ----
    if (/shrimp/.test(id)) return this._shrimp(g, S, def.burnt, id.indexOf('raw_') === 0);
    if (/anchov|trout|salmon|_fish$/.test(id)) return this._fish(g, S, def.burnt, id.indexOf('raw_') === 0);
    // fallback
    this._emoji(g, S, def.icon || '?');
  },

  // ---- weapon drawings ----
  _sword(g, S, m) {
    const cx = S * 0.5;
    this._poly(g, [[cx, S * 0.08], [cx + 3, S * 0.2], [cx + 2, S * 0.62], [cx - 2, S * 0.62], [cx - 3, S * 0.2]], m.b);
    this._line(g, cx - 1.5, S * 0.6, cx - 1.5, S * 0.16, m.h, 1.4); // highlight
    this._rect(g, cx - 6, S * 0.6, 12, 3, m.d);                     // crossguard
    this._rect(g, cx - 1.5, S * 0.66, 3, S * 0.22, '#4a3218');      // grip
    this._circ(g, cx, S * 0.9, 2.4, m.d);                          // pommel
  },
  _mace(g, S, m) {
    const cx = S * 0.5;
    this._rect(g, cx - 1.5, S * 0.42, 3, S * 0.46, '#4a3218');      // shaft
    this._circ(g, cx, S * 0.28, S * 0.17, m.b);                    // head
    for (let i = 0; i < 6; i++) { const a = i / 6 * 7, r = S * 0.17; this._rect(g, cx + Math.cos(a) * r - 1, S * 0.28 + Math.sin(a) * r - 1, 2.4, 2.4, m.d); }
    this._circ(g, cx - 1.5, S * 0.24, 2, m.h);
  },
  _axe(g, S, m, pick) {
    this._line(g, S * 0.34, S * 0.86, S * 0.6, S * 0.16, this._wood.d, 3);   // handle
    if (pick) { this._poly(g, [[S * 0.28, S * 0.2], [S * 0.82, S * 0.2], [S * 0.55, S * 0.32]], m.b); this._line(g, S * 0.3, S * 0.22, S * 0.8, S * 0.22, m.h, 1.4); }
    else { this._poly(g, [[S * 0.5, S * 0.1], [S * 0.82, S * 0.16], [S * 0.82, S * 0.4], [S * 0.5, S * 0.34]], m.b); this._line(g, S * 0.8, S * 0.18, S * 0.8, S * 0.38, m.h, 1.4); }
  },
  _bow(g, S, strung) {
    g.strokeStyle = this._wood.b; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.arc(S * 0.66, S * 0.5, S * 0.4, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
    if (strung) this._line(g, S * 0.29, S * 0.16, S * 0.29, S * 0.84, '#efe6c6', 1);
  },
  _bowstring(g, S) {
    this._circ(g, S * 0.5, S * 0.5, S * 0.16, '#8a7a52'); this._circ(g, S * 0.5, S * 0.5, S * 0.08, '#5c5030');
    g.strokeStyle = '#efe6c6'; g.lineWidth = 1; g.beginPath(); g.arc(S * 0.5, S * 0.5, S * 0.24, 0, 5); g.stroke();
  },
  _arrow(g, S, m) {
    this._line(g, S * 0.24, S * 0.82, S * 0.72, S * 0.2, '#6b4a2b', 2);
    this._poly(g, [[S * 0.78, S * 0.12], [S * 0.66, S * 0.26], [S * 0.58, S * 0.18]], m.b); // head
    this._line(g, S * 0.22, S * 0.86, S * 0.34, S * 0.72, '#d8d0c0', 2); this._line(g, S * 0.28, S * 0.9, S * 0.4, S * 0.76, '#d8d0c0', 2); // fletch
  },
  _arrowheads(g, S, m) { for (const [x, y] of [[0.36, 0.4], [0.6, 0.34], [0.5, 0.62]]) this._poly(g, [[S * x, S * (y - 0.1)], [S * (x + 0.14), S * (y + 0.06)], [S * (x - 0.14), S * (y + 0.06)]], m.b); },
  _shafts(g, S, headless) {
    for (const dx of [-0.14, 0, 0.14]) this._line(g, S * (0.5 + dx), S * 0.86, S * (0.5 + dx), S * 0.16, '#6b4a2b', 2);
    if (headless) for (const dx of [-0.14, 0, 0.14]) this._line(g, S * (0.5 + dx) - 3, S * 0.84, S * (0.5 + dx), S * 0.76, '#d8d0c0', 1.4);
  },

  // ---- armour ----
  _helm(g, S, m) {
    g.fillStyle = m.b; g.beginPath(); g.arc(S * 0.5, S * 0.5, S * 0.3, Math.PI, 0); g.fill();
    this._rect(g, S * 0.2, S * 0.48, S * 0.6, S * 0.12, m.d);        // rim
    this._rect(g, S * 0.47, S * 0.48, S * 0.06, S * 0.28, m.d);      // nose guard
    g.strokeStyle = m.h; g.lineWidth = 1.4; g.beginPath(); g.arc(S * 0.5, S * 0.5, S * 0.22, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
  },
  _body(g, S, m, mail) {
    this._poly(g, [[S * 0.5, S * 0.16], [S * 0.74, S * 0.24], [S * 0.7, S * 0.84], [S * 0.3, S * 0.84], [S * 0.26, S * 0.24]], m.b);
    this._poly(g, [[S * 0.5, S * 0.16], [S * 0.62, S * 0.2], [S * 0.5, S * 0.3], [S * 0.38, S * 0.2]], m.d); // collar
    if (mail) { g.fillStyle = m.h; for (let y = 0.32; y < 0.8; y += 0.1) for (let x = 0.34; x < 0.68; x += 0.09) { g.globalAlpha = 0.5; this._circ(g, S * x, S * y, 1, m.h); } g.globalAlpha = 1; }
    else this._line(g, S * 0.5, S * 0.32, S * 0.5, S * 0.8, m.d, 1.4);
  },
  _shield(g, S, m, wooden) {
    if (wooden) { this._circ(g, S * 0.5, S * 0.5, S * 0.32, m.b); this._circ(g, S * 0.5, S * 0.5, S * 0.32, m.d === undefined ? '#4a3218' : m.d); this._circ(g, S * 0.5, S * 0.5, S * 0.28, m.b); this._circ(g, S * 0.5, S * 0.5, S * 0.06, '#3a2a18'); for (let i = 0; i < 8; i++) { const a = i / 8 * 7; this._rect(g, S * 0.5 + Math.cos(a) * S * 0.24 - 1, S * 0.5 + Math.sin(a) * S * 0.24 - 1, 2, 2, '#3a2a18'); } }
    else { this._poly(g, [[S * 0.5, S * 0.14], [S * 0.78, S * 0.26], [S * 0.72, S * 0.66], [S * 0.5, S * 0.88], [S * 0.28, S * 0.66], [S * 0.22, S * 0.26]], m.b); this._line(g, S * 0.5, S * 0.16, S * 0.5, S * 0.86, m.h, 1.4); this._line(g, S * 0.26, S * 0.44, S * 0.74, S * 0.44, m.d, 1.4); }
  },

  // legwear: a waistband over two tapering legs. `plated` adds knee cops + a highlight seam.
  _legs(g, S, m, plated) {
    this._rect(g, S * 0.28, S * 0.18, S * 0.44, S * 0.14, m.d);                                          // waistband
    this._poly(g, [[S * 0.28, S * 0.3], [S * 0.48, S * 0.3], [S * 0.46, S * 0.86], [S * 0.3, S * 0.86]], m.b); // left leg
    this._poly(g, [[S * 0.52, S * 0.3], [S * 0.72, S * 0.3], [S * 0.7, S * 0.86], [S * 0.54, S * 0.86]], m.b); // right leg
    if (plated) {
      this._rect(g, S * 0.3, S * 0.54, S * 0.16, S * 0.08, m.h);                                         // knee cops
      this._rect(g, S * 0.54, S * 0.54, S * 0.16, S * 0.08, m.h);
      this._line(g, S * 0.34, S * 0.34, S * 0.34, S * 0.82, m.h, 1);
    } else {
      g.strokeStyle = m.d; g.lineWidth = 1;
      for (const y of [0.42, 0.62]) { g.beginPath(); g.moveTo(S * 0.3, S * y); g.lineTo(S * 0.46, S * y); g.moveTo(S * 0.54, S * y); g.lineTo(S * 0.7, S * y); g.stroke(); }
    }
  },
  // a cape hangs from a clasped collar and flares out below
  _cape(g, S, id) {
    const C = { cape_red: ['#a8272c', '#d0454a'], cape_blue: ['#28479c', '#4e70d0'], cape_green: ['#2a7a38', '#4aa858'],
                cape_black: ['#26262c', '#4a4a54'], highwayman_cloak: ['#3a2f42', '#5e4f68'] }[id] || ['#a8272c', '#d0454a'];
    this._poly(g, [[S * 0.36, S * 0.2], [S * 0.64, S * 0.2], [S * 0.82, S * 0.84], [S * 0.18, S * 0.84]], C[0]);
    this._poly(g, [[S * 0.42, S * 0.22], [S * 0.5, S * 0.22], [S * 0.5, S * 0.82], [S * 0.32, S * 0.82]], C[1]); // lit fold
    this._rect(g, S * 0.34, S * 0.16, S * 0.32, S * 0.08, '#c9a24a');                                            // clasp band
    this._circ(g, S * 0.5, S * 0.2, 2.2, '#f2dc94');
  },
  _satchel(g, S) {
    this._rect(g, S * 0.24, S * 0.34, S * 0.52, S * 0.46, '#6a4a2c');       // pack body
    this._rect(g, S * 0.24, S * 0.3, S * 0.52, S * 0.16, '#8a6538');        // flap
    this._rect(g, S * 0.44, S * 0.4, S * 0.12, S * 0.1, '#c9a24a');         // buckle
    this._circ(g, S * 0.5, S * 0.6, S * 0.11, '#2b2b33');                   // lodestone lining, showing through
    this._circ(g, S * 0.47, S * 0.57, S * 0.04, '#6ab0ff');
    this._line(g, S * 0.28, S * 0.34, S * 0.2, S * 0.8, '#4a3218', 2); this._line(g, S * 0.72, S * 0.34, S * 0.8, S * 0.8, '#4a3218', 2); // straps
  },
  _lodestone(g, S) {
    this._poly(g, [[S * 0.5, S * 0.18], [S * 0.78, S * 0.4], [S * 0.68, S * 0.78], [S * 0.32, S * 0.78], [S * 0.22, S * 0.4]], '#2b2b33');
    this._poly(g, [[S * 0.5, S * 0.18], [S * 0.78, S * 0.4], [S * 0.5, S * 0.5], [S * 0.22, S * 0.4]], '#4a4a58');
    g.globalAlpha = 0.75; this._circ(g, S * 0.42, S * 0.42, 2.4, '#6ab0ff'); this._circ(g, S * 0.6, S * 0.56, 1.8, '#6ab0ff'); g.globalAlpha = 1;
  },
  _notes(g, S) {
    this._rect(g, S * 0.24, S * 0.18, S * 0.52, S * 0.64, '#e8dcb8');
    this._rect(g, S * 0.24, S * 0.18, S * 0.52, S * 0.06, '#c9b789');
    g.strokeStyle = '#7a6a48'; g.lineWidth = 1;
    for (const y of [0.34, 0.44, 0.54, 0.64]) { g.beginPath(); g.moveTo(S * 0.3, S * y); g.lineTo(S * 0.7, S * y); g.stroke(); }
    this._circ(g, S * 0.62, S * 0.72, 2.6, '#2b2b33'); // a sketched lodestone in the margin
  },

  _needle(g, S) { this._line(g, S * 0.5, S * 0.16, S * 0.52, S * 0.84, '#cdd2da', 2); this._circ(g, S * 0.5, S * 0.24, 2.4, '#cdd2da'); this._circ(g, S * 0.5, S * 0.24, 1, '#45402f'); },
  _leather(g, S) { this._poly(g, [[S * 0.24, S * 0.3], [S * 0.72, S * 0.24], [S * 0.8, S * 0.66], [S * 0.5, S * 0.82], [S * 0.2, S * 0.64]], '#8a5a2e'); g.strokeStyle = '#5e3c1c'; g.lineWidth = 1; for (const [x, y] of [[0.36, 0.36], [0.56, 0.34], [0.64, 0.56], [0.44, 0.66], [0.3, 0.5]]) { g.beginPath(); g.moveTo(S * x, S * y); g.lineTo(S * (x + 0.05), S * (y + 0.03)); g.stroke(); } },

  // ---- tools ----
  _hammer(g, S) { this._line(g, S * 0.4, S * 0.86, S * 0.6, S * 0.34, this._wood.d, 3); this._rect(g, S * 0.42, S * 0.16, S * 0.34, S * 0.16, '#5b5d64'); this._rect(g, S * 0.42, S * 0.16, S * 0.08, S * 0.16, '#3f4147'); },
  _knife(g, S) { this._poly(g, [[S * 0.3, S * 0.7], [S * 0.66, S * 0.2], [S * 0.72, S * 0.28], [S * 0.4, S * 0.74]], '#c2c7cf'); this._line(g, S * 0.3, S * 0.72, S * 0.66, S * 0.24, '#e6ebf2', 1); this._rect(g, S * 0.24, S * 0.66, S * 0.12, S * 0.12, '#4a3218'); },
  _net(g, S) { g.strokeStyle = '#8a7a52'; g.lineWidth = 1; for (let i = -2; i <= 2; i++) { this._line(g, S * 0.5 + i * S * 0.1, S * 0.24, S * 0.5 + i * S * 0.1 - S * 0.14, S * 0.8, '#8a7a52', 1); this._line(g, S * 0.5 + i * S * 0.1, S * 0.24, S * 0.5 + i * S * 0.1 + S * 0.14, S * 0.8, '#8a7a52', 1); } this._line(g, S * 0.16, S * 0.24, S * 0.84, S * 0.24, '#6b4a2b', 2); },
  _rod(g, S) { this._line(g, S * 0.22, S * 0.82, S * 0.78, S * 0.14, '#6b4a2b', 2); this._line(g, S * 0.78, S * 0.14, S * 0.6, S * 0.5, '#cfd6de', 1); this._circ(g, S * 0.34, S * 0.66, 2.2, '#3a3a42'); },
  _tinderbox(g, S) { this._rect(g, S * 0.28, S * 0.5, S * 0.44, S * 0.3, '#6b4a2b'); this._rect(g, S * 0.28, S * 0.5, S * 0.44, S * 0.06, '#8a6538'); this._poly(g, [[S * 0.5, S * 0.2], [S * 0.58, S * 0.44], [S * 0.42, S * 0.44]], '#ff8a2a'); this._poly(g, [[S * 0.5, S * 0.3], [S * 0.55, S * 0.44], [S * 0.45, S * 0.44]], '#ffd24a'); },

  // ---- resources ----
  _bar(g, S, m) { this._poly(g, [[S * 0.24, S * 0.56], [S * 0.72, S * 0.42], [S * 0.82, S * 0.54], [S * 0.34, S * 0.68]], m.b); this._poly(g, [[S * 0.24, S * 0.56], [S * 0.72, S * 0.42], [S * 0.72, S * 0.5], [S * 0.24, S * 0.64]], m.h); this._poly(g, [[S * 0.34, S * 0.68], [S * 0.82, S * 0.54], [S * 0.82, S * 0.6], [S * 0.34, S * 0.74]], m.d); },
  _ore(g, S, id) {
    const c = { copper_ore: ['#9a6038', '#c98a4a'], tin_ore: ['#9a9a9a', '#c4c4c4'], iron_ore: ['#7a4436', '#a5624a'], coal: ['#2a2a2e', '#494952'],
                silver_ore: ['#8f96a0', '#e6ecf2'], gold_ore: ['#8a7434', '#ffd75c'],
                mithril_ore: ['#4a5a92', '#7f95d8'], adamantite_ore: ['#3b6349', '#69ac81'] }[id] || ['#7a746a', '#9a948a'];
    this._poly(g, [[S * 0.3, S * 0.7], [S * 0.22, S * 0.48], [S * 0.4, S * 0.3], [S * 0.66, S * 0.28], [S * 0.8, S * 0.5], [S * 0.68, S * 0.74]], c[0]);
    for (const [x, y] of [[0.4, 0.42], [0.58, 0.38], [0.5, 0.58], [0.66, 0.6]]) this._circ(g, S * x, S * y, 2.2, c[1]);
  },
  // ---- gems & jewellery ----
  GEM_COL: { sapphire: ['#5aa8ff', '#1f4f9c', '#bfe0ff'], emerald: ['#4fd07a', '#146b35', '#c0f5d2'],
             ruby: ['#e8455a', '#8a0f22', '#ffc2cc'], diamond: ['#dff2ff', '#8fb4c8', '#ffffff'] },
  _gem(g, S, kind, uncut) {
    const c = this.GEM_COL[kind] || this.GEM_COL.sapphire;
    if (uncut) {
      // rough: an irregular lump of the gem's own colour with a bright unpolished
      // face, sitting in a pale rim of matrix. The colour has to lead or every
      // uncut stone looks like the same grey pebble in the pack.
      this._poly(g, [[S * 0.26, S * 0.7], [S * 0.16, S * 0.46], [S * 0.34, S * 0.22],
                     [S * 0.66, S * 0.2], [S * 0.86, S * 0.46], [S * 0.74, S * 0.76]], '#9a948a');
      this._poly(g, [[S * 0.32, S * 0.66], [S * 0.24, S * 0.46], [S * 0.38, S * 0.28],
                     [S * 0.64, S * 0.28], [S * 0.78, S * 0.48], [S * 0.66, S * 0.7]], c[0]);
      this._poly(g, [[S * 0.38, S * 0.28], [S * 0.64, S * 0.28], [S * 0.56, S * 0.46], [S * 0.34, S * 0.44]], c[2]);
      this._poly(g, [[S * 0.56, S * 0.46], [S * 0.78, S * 0.48], [S * 0.66, S * 0.7]], c[1]);
      return;
    }
    // cut: a brilliant, table on top and a point below
    this._poly(g, [[S * 0.5, S * 0.2], [S * 0.78, S * 0.42], [S * 0.5, S * 0.82], [S * 0.22, S * 0.42]], c[0]);
    this._poly(g, [[S * 0.5, S * 0.2], [S * 0.78, S * 0.42], [S * 0.5, S * 0.5], [S * 0.22, S * 0.42]], c[2]);
    this._poly(g, [[S * 0.5, S * 0.5], [S * 0.78, S * 0.42], [S * 0.5, S * 0.82]], c[1]);
    g.strokeStyle = c[1]; g.lineWidth = 1;
    g.beginPath(); g.moveTo(S * 0.22, S * 0.42); g.lineTo(S * 0.78, S * 0.42); g.stroke();
  },
  _chisel(g, S) {
    this._rect(g, S * 0.44, S * 0.2, S * 0.13, S * 0.34, '#4a3218');
    this._poly(g, [[S * 0.44, S * 0.54], [S * 0.57, S * 0.54], [S * 0.55, S * 0.84], [S * 0.46, S * 0.84]], '#c3ccd6');
    this._poly(g, [[S * 0.46, S * 0.84], [S * 0.55, S * 0.84], [S * 0.5, S * 0.9]], '#eef3f8');
  },
  _mould(g, S, symbol) {
    this._rect(g, S * 0.2, S * 0.3, S * 0.6, S * 0.4, '#8f96a0');
    this._rect(g, S * 0.2, S * 0.3, S * 0.6, S * 0.08, '#b6bec8');
    g.fillStyle = '#2b2f36';
    if (symbol) { this._rect(g, S * 0.46, S * 0.36, S * 0.08, S * 0.28, '#2b2f36'); this._rect(g, S * 0.34, S * 0.44, S * 0.32, S * 0.08, '#2b2f36'); }
    else { g.beginPath(); g.arc(S * 0.5, S * 0.5, S * 0.13, 0, 7); g.fill(); }
  },
  _symbol(g, S, blessed) {
    const c = blessed ? '#ffe89a' : '#d8dde4';
    g.strokeStyle = '#b9c2cc'; g.lineWidth = 1.4;
    g.beginPath(); g.arc(S * 0.5, S * 0.22, S * 0.12, 0.6, Math.PI - 0.6, true); g.stroke();   // the loop it hangs by
    this._rect(g, S * 0.45, S * 0.34, S * 0.1, S * 0.46, c);
    this._rect(g, S * 0.28, S * 0.46, S * 0.44, S * 0.1, c);
    if (blessed) { g.globalAlpha = 0.5; this._circ(g, S * 0.5, S * 0.56, S * 0.3, '#ffe89a'); g.globalAlpha = 1; }
  },
  _amulet(g, S, id) {
    const kind = /sapphire/.test(id) ? 'sapphire' : /emerald/.test(id) ? 'emerald' : /ruby/.test(id) ? 'ruby'
      : /diamond/.test(id) ? 'diamond' : /magic/.test(id) ? 'sapphire' : /defence/.test(id) ? 'emerald'
      : /strength/.test(id) ? 'ruby' : /power/.test(id) ? 'diamond' : null;
    const glow = /_of_/.test(id);
    // the chain
    g.strokeStyle = '#d9b64a'; g.lineWidth = Math.max(1.4, S * 0.06);
    g.beginPath(); g.moveTo(S * 0.28, S * 0.2); g.quadraticCurveTo(S * 0.5, S * 0.46, S * 0.72, S * 0.2); g.stroke();
    if (glow) { g.globalAlpha = 0.45; this._circ(g, S * 0.5, S * 0.62, S * 0.28, this.GEM_COL[kind][0]); g.globalAlpha = 1; }
    // the setting
    this._poly(g, [[S * 0.5, S * 0.4], [S * 0.68, S * 0.6], [S * 0.5, S * 0.84], [S * 0.32, S * 0.6]], '#e2b93c');
    if (kind) {
      const c = this.GEM_COL[kind];
      this._poly(g, [[S * 0.5, S * 0.48], [S * 0.62, S * 0.61], [S * 0.5, S * 0.76], [S * 0.38, S * 0.61]], c[0]);
      this._poly(g, [[S * 0.5, S * 0.48], [S * 0.62, S * 0.61], [S * 0.5, S * 0.63], [S * 0.38, S * 0.61]], c[2]);
    } else {
      this._poly(g, [[S * 0.5, S * 0.48], [S * 0.62, S * 0.61], [S * 0.5, S * 0.76], [S * 0.38, S * 0.61]], '#f6de86');
    }
  },
  _logs(g, S, id) {
    const bark = { logs: '#6b4a2b', oak_logs: '#5a3d20', willow_logs: '#7a6444' }[id] || '#6b4a2b', ring = '#c9a86a';
    for (const [x, y] of [[0.36, 0.4], [0.6, 0.36], [0.48, 0.62]]) { this._circ(g, S * x, S * y, S * 0.15, bark); this._circ(g, S * x, S * y, S * 0.09, ring); this._circ(g, S * x, S * y, S * 0.04, bark); }
  },
  _coins(g, S) {
    for (const [x, y, r] of [[0.4, 0.68, 0.16], [0.62, 0.62, 0.16], [0.5, 0.46, 0.18], [0.42, 0.34, 0.13]]) { this._circ(g, S * x, S * y, S * r, '#c99a2e'); this._circ(g, S * x, S * y, S * r, '#e2b93c'); this._circ(g, S * (x - 0.03), S * (y - 0.03), S * (r * 0.4), '#f6de86'); }
  },
  _rune(g, S, id) {
    const c = { air_rune: '#cfe0e6', mind_rune: '#d98ac0', water_rune: '#3f7fd8', earth_rune: '#7a5a34', fire_rune: '#e2531e',
                body_rune: '#b9c2cc', chaos_rune: '#c05a2e', nature_rune: '#4f9e46', law_rune: '#5f7fd0',
                cosmic_rune: '#9a6fd0', death_rune: '#dcd6c6' }[id] || '#9a9a9a';
    this._poly(g, [[S * 0.5, S * 0.16], [S * 0.8, S * 0.4], [S * 0.68, S * 0.82], [S * 0.32, S * 0.82], [S * 0.2, S * 0.4]], c);
    g.globalAlpha = 0.4; this._poly(g, [[S * 0.5, S * 0.16], [S * 0.8, S * 0.4], [S * 0.5, S * 0.5], [S * 0.2, S * 0.4]], '#ffffff'); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(S * 0.5, S * 0.32); g.lineTo(S * 0.5, S * 0.66); g.moveTo(S * 0.38, S * 0.46); g.lineTo(S * 0.62, S * 0.46); g.stroke();
  },
  _bone(g, S, dragon) {
    const c = dragon ? '#cfead0' : '#e8e6d8';
    g.strokeStyle = c; g.lineWidth = dragon ? 5 : 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(S * 0.3, S * 0.7); g.lineTo(S * 0.7, S * 0.3); g.stroke();
    for (const [x, y] of [[0.28, 0.68], [0.32, 0.74], [0.68, 0.32], [0.74, 0.28]]) this._circ(g, S * x, S * y, 3, c);
  },
  _feather(g, S) { this._poly(g, [[S * 0.62, S * 0.16], [S * 0.74, S * 0.4], [S * 0.44, S * 0.78], [S * 0.32, S * 0.66]], '#e8eef4'); this._line(g, S * 0.66, S * 0.2, S * 0.36, S * 0.74, '#9aa4ae', 1.2); },
  _fur(g, S) { this._poly(g, [[S * 0.3, S * 0.28], [S * 0.7, S * 0.24], [S * 0.8, S * 0.6], [S * 0.5, S * 0.82], [S * 0.2, S * 0.6]], '#7a5433'); for (const [x, y] of [[0.4, 0.4], [0.58, 0.42], [0.5, 0.58]]) this._line(g, S * x, S * y, S * x, S * (y + 0.12), '#5e3f24', 1.4); },
  _relic(g, S) { this._poly(g, [[S * 0.5, S * 0.14], [S * 0.76, S * 0.42], [S * 0.5, S * 0.86], [S * 0.24, S * 0.42]], '#49c0c8'); g.globalAlpha = 0.5; this._poly(g, [[S * 0.5, S * 0.14], [S * 0.76, S * 0.42], [S * 0.5, S * 0.5], [S * 0.24, S * 0.42]], '#bff2f5'); g.globalAlpha = 1; },

  // ---- food ----
  _shrimp(g, S, burnt, raw) {
    const c = burnt ? '#3a2a1c' : raw ? '#c98a86' : '#e8722e';
    g.strokeStyle = c; g.lineWidth = S * 0.16; g.lineCap = 'round'; g.beginPath(); g.arc(S * 0.5, S * 0.52, S * 0.24, Math.PI * 1.7, Math.PI * 0.7); g.stroke();
    g.lineWidth = 2; this._line(g, S * 0.66, S * 0.34, S * 0.78, S * 0.26, c, 2); if (!burnt) this._circ(g, S * 0.5, S * 0.3, 1.6, '#3a1e14');
  },
  _fish(g, S, burnt, raw) {
    const c = burnt ? '#38291b' : raw ? '#8fa6b8' : '#d7a34a';
    this._poly(g, [[S * 0.2, S * 0.5], [S * 0.5, S * 0.34], [S * 0.72, S * 0.5], [S * 0.5, S * 0.66]], c);
    this._poly(g, [[S * 0.72, S * 0.5], [S * 0.86, S * 0.38], [S * 0.86, S * 0.62]], c); // tail
    this._circ(g, S * 0.3, S * 0.48, 1.6, burnt ? '#000' : '#2a2a2a');                  // eye
    if (!burnt) { g.strokeStyle = raw ? '#6f8494' : '#b5842f'; g.lineWidth = 1; g.beginPath(); g.moveTo(S * 0.42, S * 0.44); g.lineTo(S * 0.42, S * 0.56); g.moveTo(S * 0.52, S * 0.42); g.lineTo(S * 0.52, S * 0.58); g.stroke(); }
  }
};
