'use strict';
function pointInQuad(px, py, q) {
  const pts = [q.p00, q.p10, q.p11, q.p01];
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    const cr = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
    if (cr !== 0) {
      const s = cr > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

// ---- overhead chat ----
// RS2 draws what you say as plain outlined text floating over your head — no speech
// bubble, no background plate. Shared by both renderers so Canvas and WebGL agree.
const CHAT_MAX_LINES = 3;

function chatWrapLines(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    // `!cur` lets a single over-long word occupy its own line rather than looping
    // forever trying to fit it.
    if (!cur || ctx.measureText(t).width <= maxW) cur = t;
    else { lines.push(cur); cur = w; if (lines.length === CHAT_MAX_LINES) break; }
  }
  if (cur && lines.length < CHAT_MAX_LINES) lines.push(cur);
  return lines;
}

function drawChatText(ctx, text, x, y, px) {
  ctx.save();
  ctx.font = 'bold ' + px + 'px Verdana, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const lines = chatWrapLines(ctx, text, px * 15);
  const lh = px * 1.12;
  // A rounded stroke under the fill gives the outline RS2 has, and keeps the text
  // readable over bright grass and dark dungeon floor alike.
  ctx.lineWidth = Math.max(2, px * 0.28);
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#ffff00';
  for (let i = 0; i < lines.length; i++) {
    const ly = y - (lines.length - 1 - i) * lh;
    ctx.strokeText(lines[i], x, ly);
    ctx.fillText(lines[i], x, ly);
  }
  ctx.restore();
}

// ---- RS2-style click marker ----
// A yellow X when you click the ground to walk, a red X when you click something to
// interact with it. Pops to full size, holds, then fades — shared by both renderers.
const CLICK_MARK_MS = 650;
function _clickCross(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
  ctx.stroke();
}
function drawClickMark(ctx, x, y, s, kind, t) {
  if (t < 0 || t > 1) return;
  const pop = t < 0.2 ? 0.5 + (t / 0.2) * 0.62 : 1.12 - Math.min(1, (t - 0.2) / 0.8) * 0.12;
  const r = s * pop;
  ctx.save();
  ctx.globalAlpha = Math.max(0, t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(3.5, s * 0.46); // backing, so it reads on any ground
  _clickCross(ctx, x, y, r);
  ctx.strokeStyle = kind === 'walk' ? '#ffe23a' : '#ff2f2f';
  ctx.lineWidth = Math.max(2, s * 0.26);
  _clickCross(ctx, x, y, r);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Emote animation. ONE pose function, shared by the WebGL renderer, the Canvas
// renderer and the emote-tab icons — so an emote is described in exactly one
// place and the little figure on the button is literally the pose you will do.
//
// `t` runs 0..1 across one cycle. Everything returned is a DELTA on the idle
// pose, in radians: arm `Pit` swings forward/back at the shoulder, `Rol` swings
// out sideways, `Yaw` twists across the body. `bob` lifts the whole figure,
// `spin` turns it, `lean`/`tilt` tip it about the feet, and the head carries its
// own three angles so a nod doesn't tip the body with it.
// ---------------------------------------------------------------------------
const EMOTE_REST = {
  bob: 0, spin: 0, lean: 0, tilt: 0, headPitch: 0, headYaw: 0, headRoll: 0,
  lPit: 0, rPit: 0, lYaw: 0, rYaw: 0, lRol: 0, rRol: 0, legL: 0, legR: 0, arms: true
};
function emotePose(id, t) {
  const p = Object.assign({}, EMOTE_REST);
  const TAU = Math.PI * 2;
  const cyc = n => Math.sin(t * TAU * n);     // n full oscillations across the emote
  const arc = Math.sin(t * Math.PI);          // a single 0 -> 1 -> 0 swell
  const ramp = Math.min(1, t * 3);            // snap to the pose, then hold it
  switch (id) {
    case 'yes':   p.headPitch = cyc(2) * 0.42; p.arms = false; break;
    case 'no':    p.headYaw = cyc(2) * 0.6; p.arms = false; break;
    case 'bow':
      p.lean = arc * 1.0; p.headPitch = arc * 0.25;
      p.lPit = arc * 0.55; p.rPit = arc * 0.55; break;      // arms trail behind the bow
    case 'angry':
      p.lPit = -2.35; p.rPit = -2.35; p.lRol = -0.5; p.rRol = 0.5;
      p.bob = Math.abs(cyc(4)) * 0.05; p.headPitch = -0.16; p.tilt = cyc(4) * 0.05; break;
    case 'think':
      // The arm is one rigid segment with no elbow, so a true chin-stroke is out of
      // reach — the hand would have to sit closer to the shoulder than the arm is
      // long. These angles put the hand in FRONT of the chin instead, which reads
      // the same and keeps the arm clear of the chest rather than through it.
      p.rPit = -2.1; p.rRol = 0.75; p.rYaw = 0;
      p.lPit = -0.35; p.lRol = 0.45;                          // other arm folded across the middle
      p.headPitch = 0.08; p.headRoll = 0.22 + cyc(1) * 0.06; break;
    case 'wave':
      p.rPit = -2.7; p.rRol = 0.3 + cyc(3) * 0.45; p.lPit = 0.12; break;
    case 'shrug':
      p.lPit = -1.0 * ramp; p.rPit = -1.0 * ramp;
      p.lRol = -1.15 * ramp; p.rRol = 1.15 * ramp;
      p.headPitch = -0.14 * ramp; p.bob = arc * 0.04; break;
    case 'cheer':
      p.lPit = -2.9; p.rPit = -2.9; p.lRol = -0.35; p.rRol = 0.35;
      p.bob = Math.abs(cyc(1)) * 0.26;
      p.legL = -Math.abs(cyc(1)) * 0.35; p.legR = -Math.abs(cyc(1)) * 0.35; break;
    case 'beckon':
      p.rPit = -1.75; p.rYaw = -0.22; p.rRol = 0.15 + cyc(3) * 0.4; p.lPit = 0.1; break;
    case 'laugh':
      p.lean = -0.32; p.rPit = -1.35; p.rYaw = 0.45; p.lPit = -0.5;
      p.bob = Math.abs(cyc(5)) * 0.05; p.headPitch = -0.38; break;
    case 'jump':
      p.bob = arc * 0.6; p.lPit = -2.6 * arc; p.rPit = -2.6 * arc;
      p.legL = -0.7 * arc; p.legR = -0.7 * arc; break;
    case 'yawn':
      p.rPit = -2.35 * arc; p.rRol = 0.3 * arc; p.lPit = -0.4 * arc;
      p.headPitch = -0.5 * arc; break;
    case 'dance':
      p.lPit = -1.25 + cyc(2) * 0.85; p.rPit = -1.25 - cyc(2) * 0.85;
      p.lRol = -0.4; p.rRol = 0.4; p.tilt = cyc(2) * 0.16;
      p.legL = cyc(2) * 0.42; p.legR = -cyc(2) * 0.42; break;
    case 'jig':
      p.lRol = -1.0; p.rRol = 1.0; p.lPit = -0.3; p.rPit = -0.3;   // hands on hips
      p.legL = Math.max(0, cyc(3)) * 1.15; p.legR = Math.max(0, -cyc(3)) * 1.15;
      p.bob = Math.abs(cyc(3)) * 0.07; break;
    case 'spin':
      p.spin = t * TAU; p.lRol = -1.25; p.rRol = 1.25; p.lPit = -0.2; p.rPit = -0.2; break;
    case 'headbang':
      p.headPitch = cyc(3) * 0.6; p.lean = Math.abs(cyc(3)) * 0.22;
      p.lPit = -0.7; p.rPit = -0.7; p.lRol = -0.75; p.rRol = 0.75; break;
    case 'cry':
      p.lPit = -2.25; p.rPit = -2.25; p.lYaw = 0.4; p.rYaw = -0.4;   // both hands to the face
      p.lean = 0.28; p.headPitch = 0.3; p.bob = -Math.abs(cyc(4)) * 0.04; break;
    case 'blow_kiss': {
      const out = Math.max(0, t - 0.5) * 2;                          // hand to the lips, then away
      p.rPit = -2.5 + out * 1.1; p.rYaw = 0.32 - out * 0.3; p.rRol = 0.2 + out * 0.5;
      p.lPit = 0.1; p.headPitch = -0.1; break;
    }
    case 'panic':
      p.lPit = -2.6 + cyc(5) * 0.5; p.rPit = -2.6 - cyc(5) * 0.5;
      p.lRol = -0.6; p.rRol = 0.6; p.headYaw = cyc(3) * 0.32;
      p.legL = cyc(6) * 0.7; p.legR = -cyc(6) * 0.7; p.bob = Math.abs(cyc(6)) * 0.06; break;
    case 'raspberry':
      p.lean = arc * 0.3; p.lPit = -2.2; p.rPit = -2.2;
      p.lYaw = 0.5; p.rYaw = -0.5;                                   // hands up beside the head
      p.lRol = -0.2 + cyc(6) * 0.3; p.rRol = 0.2 - cyc(6) * 0.3; p.headPitch = -0.18; break;
    case 'clap': {
      // Both arms point forward; the YAW swings them together in front of the chest.
      // With the shoulders 0.58 apart and the arms 0.5 long, they need ~0.5 rad of
      // inward yaw to actually meet — anything less and the figure claps thin air.
      const c = (1 - Math.cos(t * TAU * 3)) / 2;                     // hands meet three times
      p.lPit = -1.5; p.rPit = -1.5;
      p.lYaw = c * 0.5; p.rYaw = -c * 0.5;
      p.headPitch = -0.08; break;
    }
    case 'salute':
      p.rPit = -2.45 * ramp; p.rYaw = 0.5 * ramp; p.rRol = 0.55 * ramp;  // fingers to the brow
      p.lPit = 0.05; break;
    default: p.arms = false;
  }
  return p;
}
// The emote a figure is mid-way through, as {id, t}, or null. Both renderers and
// the icon drawing read state the same way: `key.emote = { id, t0, ms }`.
function emoteFor(key, now) {
  const e = key && key.emote;
  if (!e || !EMOTE_BY_ID[e.id]) return null;
  if (e.until && now > e.until) return null;
  return { id: e.id, t: ((now - e.t0) % e.ms) / e.ms };
}

// convenience: the live pose for a figure, or null
function emotePose2(key, now) { const e = emoteFor(key, now); return e ? emotePose(e.id, e.t) : null; }

const NPC_LOOKS = {
  guide:      { skin: '#c8956c', shirt: '#3b6ea5', legs: '#7a5c3a' },
  banker:     { skin: '#c8956c', shirt: '#2a2a35', legs: '#2a2a35' },
  shopkeeper: { skin: '#c8956c', shirt: '#c8a03c', legs: '#7a5c3a' },
  priest:     { skin: '#c8956c', shirt: '#e8e8e0', legs: '#e8e8e0' },
  doric:      { skin: '#c8956c', shirt: '#8a3a2a', legs: '#5a4a3a', scale: 0.72, beard: true },
  weaponsmith:{ skin: '#c8956c', shirt: '#5a4632', legs: '#3a2e20' },
  bartender:  { skin: '#c8956c', shirt: '#d8d0c8', legs: '#6a5038' },
  townsman:   { skin: '#c8956c', shirt: '#6a8a4a', legs: '#5a4632' },
  townswoman: { skin: '#e0b48c', shirt: '#a05a8a', legs: '#8a4a76', dress: true },
  guard:      { skin: '#c8956c', shirt: '#7a7d86', legs: '#5a5d66', helm: true, helmCol: '#aab4c0', weapon: { kind: 'sword', col: '#aab4c0' }, shield: { kite: true, col: '#7a7d86' } },
  goblin:     { skin: '#7aa04a', shirt: '#8a5a3a', legs: '#6a4a2e', scale: 0.75, noHair: true },
  hobgoblin:  { skin: '#6a9a3a', shirt: '#556a35', legs: '#4a5a30', scale: 1.15, noHair: true },
  ghost:      { skin: '#e8e8f5', shirt: '#d5d5ea', legs: '#d5d5ea', ghost: true, noHair: true },
  skeleton:   { skin: '#d8d8c8', shirt: '#c0c0b0', legs: '#c0c0b0', noHair: true, weapon: { kind: 'sword', col: '#8a8578' } },
  zombie:     { skin: '#7a9a5a', shirt: '#5a6a4a', legs: '#4a5a3e', noHair: true },
  farmer:     { skin: '#c8956c', shirt: '#7a6a3a', legs: '#5a4632' },
  cook:       { skin: '#c8956c', shirt: '#eae7df', legs: '#c8c2b6', helm: true, helmCol: '#f4f2ec' },
  tribe_chief:{ skin: '#a08a68', shirt: '#5a4636', legs: '#463628', beard: true },
  farmhand:   { skin: '#c8956c', shirt: '#8a5a36', legs: '#5a4632' },
  tribesman:  { skin: '#a08a68', shirt: '#6a563e', legs: '#463628', noHair: true },
  artisan:    { skin: '#d8ac84', shirt: '#7a4a7a', legs: '#4a3a5a', dress: true },
  instructor: { skin: '#c8956c', shirt: '#5a6d4a', legs: '#3a4a2e', helm: true, helmCol: '#7d8070' },
  pen_goblin: { skin: '#7aa04a', shirt: '#8a5a3a', legs: '#6a4a2e', scale: 0.8, noHair: true },
  hill_giant: { skin: '#c7b083', shirt: '#5f5236', legs: '#453a26', scale: 1.85, noHair: true },
  grukk:      { skin: '#c2a06e', shirt: '#5a3527', legs: '#3a2e1e', scale: 2.25, beard: true, helm: true, helmCol: '#7a6a4a' },
  // ---- Southmarch & the Rookmoor road ----
  highwayman: { skin: '#b8865c', shirt: '#3a2f42', legs: '#2b2431', helm: true, helmCol: '#26262c', cape: { col: '#3a2f42' }, weapon: { kind: 'sword', col: '#6b6d75' } },
  outfitter:  { skin: '#d8ac84', shirt: '#7a4a2e', legs: '#5a3a24', dress: true },
  // The Ringwall: druids in undyed wool, chaos druids in stained black
  druid:      { skin: '#d0a87e', shirt: '#cfc6ad', legs: '#b3a98e', dress: true, hat: true, hatCol: '#cfc6ad' },
  chaos_druid:{ skin: '#b39a86', shirt: '#3a3326', legs: '#2a251b', dress: true, hat: true, hatCol: '#241f18' },
  archmage:   { skin: '#dcb894', shirt: '#4a2f72', legs: '#33204f', dress: true, hat: true, hatCol: '#4a2f72' },
  druid_elder:{ skin: '#d8b78e', shirt: '#8a9a6a', legs: '#6a7a4e', dress: true, hat: true, hatCol: '#8a9a6a' },
  apothecary: { skin: '#e0bb92', shirt: '#5d7a8a', legs: '#3f5563', dress: true },
  // Chapman's Cross traders — each carries the trade they keep, so the shop reads
  // from the street: a blade, a helm and shield, a bow, a wizard's hat and staff.
  bladesmith: { skin: '#c08052', shirt: '#4a3c2e', legs: '#332a1e', beard: true,
                weapon: { kind: 'sword', col: '#cdd6e2' } },
  ironmonger: { skin: '#e0b48c', shirt: '#5d6470', legs: '#3c414a', dress: true,
                helm: true, helmCol: '#aab4c0', shield: { kite: true, col: '#8a929c' } },
  fletcher:   { skin: '#d2a274', shirt: '#4a6b3a', legs: '#3a4a28',
                weapon: { kind: 'bow', col: '#c89a52' } },
  runeseller: { skin: '#c9a486', shirt: '#3a3f8c', legs: '#2a2e63', dress: true,
                hat: true, hatCol: '#2f3f96', weapon: { kind: 'staff', col: '#6b4a2b' } },
  marshal:    { skin: '#c8956c', shirt: '#4a5a72', legs: '#33405a', helm: true, helmCol: '#aab4c0', cape: { col: '#28479c' }, weapon: { kind: 'sword', col: '#aab4c0' } },
  ava:        { skin: '#e0b48c', shirt: '#6a6459', legs: '#4a4640', dress: true },
  // a pointed hat, not the metal helmet they used to wear — they read as guards in it
  dark_wizard:{ skin: '#b8a894', shirt: '#241f33', legs: '#1a1626', dress: true, hat: true, hatCol: '#241f33',
                weapon: { kind: 'staff', col: '#3a2f42' } },
  innkeeper:  { skin: '#e0b48c', shirt: '#a8604a', legs: '#7a4436', dress: true },
  villager:   { skin: '#c8956c', shirt: '#5a6a52', legs: '#463c2e' },
  // ---- Mourncross. `ghost: true` renders translucent and `lift` floats them clear
  // of the ground; the dead of this town are green-white, not the blue-white of the
  // hostile wraiths that haunt the old dungeon.
  wenna:      { skin: '#e8c4a0', shirt: '#e4e2d8', legs: '#c8c4b6', dress: true },
  ghost_warden:{ skin: '#d6f0dc', shirt: '#b4dcc0', legs: '#a4ccb0', ghost: true, lift: 0.12, noHair: true, helm: true, helmCol: '#c2e2cc' },
  ghost_sexton:{ skin: '#d6f0dc', shirt: '#a8ccb4', legs: '#98bca4', ghost: true, lift: 0.12, noHair: true },
  ghost_chandler:{ skin: '#d6f0dc', shirt: '#c0e4c8', legs: '#a8ccb4', ghost: true, lift: 0.12, noHair: true },
  ghost_child: { skin: '#dcf4e2', shirt: '#b8e0c4', legs: '#a4ccb0', ghost: true, lift: 0.1, scale: 0.68, dress: true },
  ghost_disciple:{ skin: '#d0ecd8', shirt: '#9cc4a8', legs: '#8cb498', ghost: true, lift: 0.12, noHair: true },
  ghost_trader:{ skin: '#d6f0dc', shirt: '#b0d8bc', legs: '#98bca4', ghost: true, lift: 0.12, noHair: true },
  marsh_wraith:{ skin: '#bce4c8', shirt: '#7aab8c', legs: '#6a9a7c', ghost: true, lift: 0.24, noHair: true, scale: 1.1 },
  tallyman:   { skin: '#cfeed8', shirt: '#3f6a52', legs: '#2e5240', ghost: true, lift: 0.3, noHair: true, scale: 1.6,
                helm: true, helmCol: '#2e5240', weapon: { kind: 'staff', col: '#24402f' } }
};

// The active renderer is selected at startup (Canvas by default, WebGL via the
// Opts toggle). CanvasRenderer stays the reference implementation; GLRenderer in
// gl.js exposes the same interface (init/draw/pickAll + yaw/pitch/dist/canvas).
var Renderer;
const CanvasRenderer = {
  canvas: null, ctx: null, W: 0, H: 0, f: 500,
  yaw: 2.35, pitch: 0.62, dist: 13,
  tilePicks: [], clickables: [], _fogS: 14, _fogR: 11,
  // the metal showing through each seam — kept in step with GLRenderer.ORE_VEIN
  // altar glow per rune, shared with GLRenderer.RUNE_COL
  RUNE_COL: { air: '#cfe6f2', mind: '#c8b8e8', water: '#3f86c8', earth: '#8a6b3a', fire: '#e0592a',
              body: '#d8b0b0', cosmic: '#a86fe0', chaos: '#c03030', nature: '#3fa84a', law: '#d8c04a', death: '#d8d8d8' },
  ORE_VEIN: {
    rock_copper: '#c26e33', rock_tin: '#c9c9c9', rock_iron: '#8a4a3a', rock_coal: '#26262a',
    rock_silver: '#e2e8f0', rock_gold: '#f0c94f', rock_gem: '#5ad0e8',
    rock_mithril: '#6a80c8', rock_adamantite: '#559070'
  },

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    const rs = () => {
      this.W = this.canvas.width = window.innerWidth;
      this.H = this.canvas.height = window.innerHeight;
      this.f = this.H * 0.95;
    };
    window.addEventListener('resize', rs);
    rs();
  },

  project(wx, wy, wz) {
    const c = this._cam;
    const dx = wx - c.x, dy = wy - c.y, dz = wz - c.z;
    const x1 = dx * this._ca + dz * this._sa;
    const z1 = -dx * this._sa + dz * this._ca;
    const y2 = dy * this._cb - z1 * this._sb;
    const z2 = dy * this._sb + z1 * this._cb;
    const d = -z2;
    if (d < 0.5) return null;
    return { x: this.W / 2 + x1 * this.f / d, y: this.H / 2 - y2 * this.f / d, d };
  },

  fogA(d) { return Math.max(0, Math.min(1, (d - this._fogS) / this._fogR)); },

  pickAll(mx, my) {
    const ents = this.clickables
      .filter(c => mx >= c.x0 && mx <= c.x1 && my >= c.y0 && my <= c.y1)
      .sort((a, b) => a.d - b.d)
      .slice(0, 6)                       // 6, so a small target isn't dropped behind big scenery
      .map(c => c.ref);
    let tile = null;
    for (let i = this.tilePicks.length - 1; i >= 0; i--) {
      const t = this.tilePicks[i];
      if (pointInQuad(mx, my, t)) { tile = { kind: 'tile', x: t.x, z: t.z }; break; }
    }
    return { ents, tile };
  },

  tileColor(l, x, z, d, now) {
    const type = World.L[l].tile[x][z];
    let r, g, b;
    switch (type) {
      case 'grass': { const v = ((x * 13 + z * 7) % 4) * 6; r = 62 + v; g = 108 + v; b = 48; break; }
      case 'sand': r = 180; g = 165; b = 110; break;
      case 'rock': r = 110; g = 105; b = 95; break;
      case 'path': r = 154; g = 138; b = 100; break;
      case 'road': { const v = ((x * 7 + z * 5) % 3) * 10; r = 138 + v; g = 132 + v; b = 120 + v; break; }
      case 'floor': r = 138; g = 109; b = 70; break;
      case 'dfloor': { const v = ((x * 11 + z * 5) % 3) * 5; r = 84 + v; g = 80 + v; b = 72 + v; break; }
      case 'dwall': r = 38; g = 36; b = 31; break;
      case 'marsh': { const v = ((x * 13 + z * 7) % 4) * 4; r = 74 + v; g = 90 + v; b = 74; break; }
      default: { const w = Math.sin(now / 500 + x + z) * 10; r = 40 + w * 0.4; g = 80 + w * 0.6; b = 140 + w; }
    }
    let li = 0.85 + (World.L[l].h[x][z + 1] - World.L[l].h[x + 1][z]) * 0.5;
    li = Math.max(0.55, Math.min(1.25, li));
    const m = li * (1 - this.fogA(d));
    return `rgb(${(r * m) | 0},${(g * m) | 0},${(b * m) | 0})`;
  },

  draw(G, now) {
    const ctx = this.ctx, P = G.player, l = P.layer;
    this._fogS = l === 1 ? 8 : 14;
    this._fogR = l === 1 ? 8 : 11;
    const py = World.heightAt(l, P.x, P.z);
    const t = { x: P.x, y: py + 0.6, z: P.z };
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this._cam = {
      x: t.x + Math.sin(this.yaw) * this.dist * cp,
      y: t.y + this.dist * sp,
      z: t.z + Math.cos(this.yaw) * this.dist * cp
    };
    const a = -this.yaw;
    this._ca = Math.cos(a); this._sa = Math.sin(a);
    this._cb = cp; this._sb = sp;

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, this.W, this.H);

    // ---- terrain ----
    const R = 24, ptx = Math.floor(P.x), ptz = Math.floor(P.z);
    const x0 = Math.max(0, ptx - R), x1 = Math.min(World.SIZE - 1, ptx + R);
    const z0 = Math.max(0, ptz - R), z1 = Math.min(World.SIZE - 1, ptz + R);
    const hh = World.L[l].h;
    const corner = [];
    for (let x = x0; x <= x1 + 1; x++) {
      corner[x] = [];
      for (let z = z0; z <= z1 + 1; z++) corner[x][z] = this.project(x, hh[x][z], z);
    }
    const tiles = [];
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (World.L[l].tile[x][z] === 'void') continue;
      const p00 = corner[x][z], p10 = corner[x + 1][z], p11 = corner[x + 1][z + 1], p01 = corner[x][z + 1];
      if (!p00 || !p10 || !p11 || !p01) continue;
      const d = (p00.d + p11.d) * 0.5;
      if (d > this._fogS + this._fogR + 1) continue;
      if ((p00.x < 0 && p10.x < 0 && p11.x < 0 && p01.x < 0) ||
          (p00.x > this.W && p10.x > this.W && p11.x > this.W && p01.x > this.W) ||
          (p00.y > this.H && p10.y > this.H && p11.y > this.H && p01.y > this.H)) continue;
      tiles.push({ p00, p10, p11, p01, d, x, z });
    }
    tiles.sort((u, v) => v.d - u.d);
    for (const q of tiles) {
      const c = this.tileColor(l, q.x, q.z, q.d, now);
      ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(q.p00.x, q.p00.y); ctx.lineTo(q.p10.x, q.p10.y);
      ctx.lineTo(q.p11.x, q.p11.y); ctx.lineTo(q.p01.x, q.p01.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    this.tilePicks = tiles;

    // ---- destination marker ----
    if (G.destMark && now < G.destMark.until && G.destMark.layer === l) {
      const m = G.destMark;
      const p = this.project(m.x + 0.5, World.heightAt(l, m.x + 0.5, m.z + 0.5) + 0.03, m.z + 0.5);
      if (p) drawClickMark(ctx, p.x, p.y, this.f / p.d * 0.17, m.kind, (now - m.t0) / CLICK_MARK_MS);
    }

    // ---- entities ----
    const draws = [];
    this.clickables = [];
    const inBox = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;

    for (const s of World.L[l].scenery.values()) {
      if (!inBox(s.x, s.z)) continue;
      const p = this.project(s.x + 0.5, World.heightAt(l, s.x + 0.5, s.z + 0.5), s.z + 0.5);
      if (!p || p.d > this._fogS + this._fogR) continue;
      const sc = this.f / p.d;
      draws.push({ d: p.d, fn: () => this.drawScenery(s, p, sc, now, l) });
      if (s.type !== 'wall' || l === 0) {
        const r = this.sceneryRect(s, p, sc);
        this.clickables.push({ ...r, d: p.d, ref: { kind: 'scenery', key: World.key(s.x, s.z), s } });
      }
    }
    for (const g of G.ground) {
      if (g.layer !== l || !inBox(g.x, g.z)) continue;
      const p = this.project(g.x + 0.5, World.heightAt(l, g.x + 0.5, g.z + 0.5), g.z + 0.5);
      if (!p || p.d > this._fogS + this._fogR) continue;
      const sc = this.f / p.d;
      draws.push({ d: p.d, fn: () => this.drawGroundItem(g, p, sc) });
      this.clickables.push({ x0: p.x - 0.3 * sc, x1: p.x + 0.3 * sc, y0: p.y - 0.5 * sc, y1: p.y + 0.1 * sc, d: p.d, ref: { kind: 'ground', g } });
    }
    this._mine = G.combatTarget ? G.combatTarget() : null;   // whose bar wins the pile-up
    this._targetBar = null;
    for (const n of G.npcs) {
      if (n.deadUntil || n.layer !== l) continue;
      if (!inBox(Math.floor(n.fx), Math.floor(n.fz))) continue;
      const p = this.project(n.fx, World.heightAt(l, n.fx, n.fz), n.fz);
      if (!p || p.d > this._fogS + this._fogR) continue;
      const sc = this.f / p.d;
      draws.push({ d: p.d, fn: () => this.drawNpc(n, p, sc, now) });
      const h = n.type === 'rat' ? 0.55 : n.type === 'bear' ? 0.95 : n.type === 'dragon' ? 2.0 : 1.55;
      const wc = n.type === 'dragon' ? 1.1 : 0.45;
      this.clickables.push({ x0: p.x - wc * sc, x1: p.x + wc * sc, y0: p.y - h * sc, y1: p.y + 0.1 * sc, d: p.d, ref: { kind: 'npc', n } });
    }
    for (const q of (G.players || [])) {
      if (q.layer !== l || !inBox(Math.floor(q.x), Math.floor(q.z))) continue;
      const p = this.project(q.x, World.heightAt(l, q.x, q.z), q.z);
      if (!p || p.d > this._fogS + this._fogR) continue;
      const sc = this.f / p.d;
      draws.push({ d: p.d, fn: () => this.drawOtherPlayer(q, p, sc, now) });
    }
    {
      const p = this.project(P.x, World.heightAt(l, P.x, P.z), P.z);
      if (p) {
        const sc = this.f / p.d;
        draws.push({ d: p.d, fn: () => this.drawPlayerSprite(G, P, p, sc, now) });
      }
    }
    draws.sort((u, v) => v.d - u.d);
    for (const d of draws) d.fn();
    // your target's health bar, held back so nothing in the pile can paint over it
    if (this._targetBar) { const b = this._targetBar; this.drawBar(b.frac, b.x, b.y, b.sc, true); }

    // ---- projectiles (drawn on top) ----
    for (const pr of G.projectiles) {
      if (pr.layer !== l) continue;
      const k = Math.min(1, (now - pr.t0) / pr.dur);
      const wx = pr.fx + (pr.tx - pr.fx) * k, wz = pr.fz + (pr.tz - pr.fz) * k;
      const p = this.project(wx, World.heightAt(l, wx, wz) + 0.9, wz);
      if (!p) continue;
      const sc = this.f / p.d;
      ctx.fillStyle = pr.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, 0.07 * sc), 0, 7); ctx.fill();
    }

    // ---- floating xp text ----
    for (const fl of (G.floaters || [])) {
      const k = (now - fl.t0) / 1200;
      const p = this.project(fl.x, World.heightAt(l, fl.x, fl.z) + 1.7, fl.z);
      if (!p) continue;
      const sc = this.f / p.d;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.font = 'bold ' + Math.max(11, 0.24 * sc | 0) + 'px Verdana';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const yy = p.y - k * 42;
      ctx.fillStyle = '#000'; ctx.fillText(fl.text, p.x + 1, yy + 1);
      ctx.fillStyle = fl.color; ctx.fillText(fl.text, p.x, yy);
      ctx.globalAlpha = 1;
    }
  },

  // per-settlement building materials (mirrors GLRenderer.MATERIALS)
  MATERIALS: {
    timber:     { face: '#a9834d', top: '#8a6538' },
    northstone: { face: '#7d8694', top: '#616a78' },
    darkwood:   { face: '#5e4c3c', top: '#453629' },
    sandstone:  { face: '#c9a86a', top: '#a88750' },
    pale:       { face: '#a8aeae', top: '#8b9192' },
    coldlamp:   { face: '#4a6a86', top: '#7fc4e8' }
  },

  sceneryRect(s, p, sc) {
    let w, h;
    switch (s.type) {
      case 'tree': w = 1.3; h = 2.0; break;
      case 'oak': w = 1.7; h = 2.3; break;
      case 'willow': w = 1.5; h = 2.1; break;
      case 'maple': w = 1.7; h = 2.4; break;
      case 'yew': w = 1.8; h = 2.2; break;
      case 'stump': w = 0.4; h = 0.4; break;
      case 'fishing_spot': case 'lure_spot': w = 0.9; h = 0.35; break;
      case 'fire': w = 0.7; h = 0.8; break;
      case 'wall': w = 1.0; h = 1.4; break;
      case 'tower': w = 1.2; h = 2.6; break;
      case 'fountain': w = 1.8; h = 1.1; break;
      case 'lamppost': w = 0.5; h = 1.7; break;
      case 'signpost': w = 0.9; h = 1.3; break;
      case 'statue': w = 1.2; h = 2.4; break;
      case 'stall': w = 1.4; h = 1.5; break;
      case 'well': w = 1.1; h = 1.2; break;
      case 'bank_booth': w = 1.0; h = 1.0; break;
      case 'furnace': w = 1.0; h = 1.5; break;
      case 'anvil': w = 0.9; h = 0.7; break;
      case 'range': w = 1.0; h = 1.0; break;
      case 'altar': w = 1.2; h = 1.1; break;
      case 'ladder_down': case 'ladder_up': w = 0.8; h = 1.5; break;
      case 'rampart': w = 1.0; h = 2.0; break;
      case 'gatehouse': w = 1.1; h = 3.0; break;
      case 'shop_counter': w = 1.0; h = 0.9; break;
      case 'shelves': w = 1.0; h = 1.7; break;
      case 'stained_glass': w = 1.0; h = 2.0; break;
      case 'crate': w = 0.9; h = 0.9; break;
      case 'market_awning': w = 1.3; h = 1.5; break;
      case 'pylon': w = 0.7; h = 2.1; break;
      case 'plinth': w = 1.1; h = 0.8; break;
      case 'milestone': w = 0.5; h = 0.7; break;
      case 'shrine': w = 0.9; h = 1.0; break;
      case 'rubble': w = 0.9; h = 0.4; break;
      case 'farm_patch': w = 1.0; h = 0.7; break;
      case 'bone_font': case 'bone_font_dark': w = 1.1; h = 0.85; break;
      case 'bone_grinder': w = 0.9; h = 1.1; break;
      case 'slime_pool': w = 1.1; h = 0.35; break;
      case 'sand_bank': w = 1.0; h = 0.55; break;
      case 'grave': w = 0.8; h = 0.85; break;
      case 'dead_tree': w = 1.0; h = 1.9; break;
      case 'bell': w = 0.9; h = 1.8; break;
      case 'font_gate': w = 1.0; h = 1.8; break;
      case 'rock_copper': case 'rock_tin': case 'rock_iron': case 'rock_coal':
      case 'rock_silver': case 'rock_gold': case 'rock_gem':
      case 'rock_mithril': case 'rock_adamantite': w = 1.05; h = 0.7; break;
      case 'rock_empty': w = 1.0; h = 0.5; break;
      case 'sign_weapon': case 'sign_armour': case 'sign_ranged': case 'sign_magic': w = 0.9; h = 1.6; break;
      case 'rune_altar': w = 1.0; h = 1.2; break;
      case 'essence_rock': case 'pure_rock': w = 1.0; h = 0.7; break;
      case 'rune_rift': w = 1.1; h = 1.8; break;
      case 'herb_patch': w = 0.9; h = 0.4; break;
      default: w = 1.0; h = 0.7;
    }
    return { x0: p.x - w / 2 * sc, x1: p.x + w / 2 * sc, y0: p.y - h * sc, y1: p.y + 0.15 * sc };
  },

  box(x, y, sc, w, h, face, top) {
    const ctx = this.ctx;
    ctx.fillStyle = face;
    ctx.fillRect(x - w / 2 * sc, y - h * sc, w * sc, h * sc);
    ctx.fillStyle = top;
    ctx.fillRect(x - w / 2 * sc, y - h * sc - 0.1 * sc, w * sc, 0.12 * sc);
  },

  drawScenery(s, p, sc, now, l) {
    const ctx = this.ctx, x = p.x, y = p.y;
    ctx.globalAlpha = 1 - this.fogA(p.d);
    switch (s.type) {
      case 'tree': {
        const sw = Math.sin(now / 900 + s.x * 1.7 + s.z) * 0.06 * sc;
        ctx.fillStyle = '#6b4a2b';
        ctx.fillRect(x - 0.09 * sc, y - 1.0 * sc, 0.18 * sc, 1.0 * sc);
        ctx.fillStyle = '#295e20';
        ctx.beginPath(); ctx.arc(x + sw, y - 1.35 * sc, 0.62 * sc, 0, 7); ctx.fill();
        ctx.fillStyle = '#37772a';
        ctx.beginPath(); ctx.arc(x - 0.25 * sc + sw, y - 1.15 * sc, 0.4 * sc, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 0.26 * sc + sw, y - 1.2 * sc, 0.42 * sc, 0, 7); ctx.fill();
        break;
      }
      case 'oak': {
        const sw = Math.sin(now / 1100 + s.x + s.z) * 0.05 * sc;
        ctx.fillStyle = '#5a3d20';
        ctx.fillRect(x - 0.13 * sc, y - 1.0 * sc, 0.26 * sc, 1.0 * sc);
        ctx.fillStyle = '#1e4517';
        ctx.beginPath(); ctx.arc(x + sw, y - 1.5 * sc, 0.8 * sc, 0, 7); ctx.fill();
        ctx.fillStyle = '#2a5c1e';
        ctx.beginPath(); ctx.arc(x - 0.35 * sc + sw, y - 1.2 * sc, 0.5 * sc, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 0.36 * sc + sw, y - 1.25 * sc, 0.52 * sc, 0, 7); ctx.fill();
        break;
      }
      case 'maple': case 'yew': {
        const mp = s.type === 'maple';
        const sw = Math.sin(now / 900 + s.x) * 0.05 * sc;
        ctx.fillStyle = mp ? '#6a4726' : '#4a3524';
        ctx.fillRect(x - (mp ? 0.11 : 0.16) * sc, y - 1.2 * sc, (mp ? 0.22 : 0.32) * sc, 1.2 * sc);
        ctx.fillStyle = mp ? '#a3441f' : '#14361a';
        ctx.beginPath(); ctx.arc(x + sw, y - 1.65 * sc, (mp ? 0.85 : 0.9) * sc, 0, 7); ctx.fill();
        ctx.fillStyle = mp ? '#c2632a' : '#1b4522';
        ctx.beginPath(); ctx.arc(x - 0.34 * sc + sw, y - 1.3 * sc, 0.5 * sc, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 0.36 * sc + sw, y - 1.38 * sc, 0.55 * sc, 0, 7); ctx.fill();
        break;
      }
      case 'willow': {
        const sw = Math.sin(now / 700 + s.x) * 0.08 * sc;
        ctx.fillStyle = '#7a6444';
        ctx.fillRect(x - 0.09 * sc, y - 1.1 * sc, 0.18 * sc, 1.1 * sc);
        ctx.fillStyle = '#5d8a3e';
        ctx.beginPath(); ctx.arc(x, y - 1.5 * sc, 0.65 * sc, 0, 7); ctx.fill();
        ctx.fillStyle = '#6d9a4a';
        for (const ox of [-0.5, -0.2, 0.15, 0.45]) {
          ctx.beginPath();
          ctx.ellipse(x + ox * sc + sw * (1 + Math.abs(ox)), y - 0.9 * sc, 0.12 * sc, 0.5 * sc, 0, 0, 7);
          ctx.fill();
        }
        break;
      }
      case 'stump':
        ctx.fillStyle = '#6b4a2b';
        ctx.fillRect(x - 0.12 * sc, y - 0.28 * sc, 0.24 * sc, 0.28 * sc);
        ctx.fillStyle = '#a5825c';
        ctx.beginPath(); ctx.ellipse(x, y - 0.28 * sc, 0.12 * sc, 0.05 * sc, 0, 0, 7); ctx.fill();
        break;
      // Ore seams. Silver, gold, gem, mithril and adamantite had no case here and fell
      // through to the default box, so most of the rocks looked the same.
      case 'rock_copper': case 'rock_tin': case 'rock_iron': case 'rock_coal':
      case 'rock_silver': case 'rock_gold': case 'rock_gem':
      case 'rock_mithril': case 'rock_adamantite': case 'rock_empty': {
        const spent = s.type === 'rock_empty';
        // a lumpy outcrop rather than one flat ellipse
        ctx.fillStyle = spent ? '#544f47' : '#6e685e';
        ctx.beginPath(); ctx.ellipse(x, y - 0.16 * sc, 0.46 * sc, 0.22 * sc, 0, 0, 7); ctx.fill();
        if (!spent) {
          ctx.fillStyle = '#7c7568';
          ctx.beginPath(); ctx.ellipse(x - 0.08 * sc, y - 0.34 * sc, 0.34 * sc, 0.24 * sc, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#8a8275';
          ctx.beginPath(); ctx.ellipse(x + 0.16 * sc, y - 0.42 * sc, 0.19 * sc, 0.15 * sc, 0, 0, 7); ctx.fill();
        }
        const tint = CanvasRenderer.ORE_VEIN[s.type];
        if (tint) {
          ctx.fillStyle = tint;
          for (const [ox, oy, r] of [[-0.20, -0.30, 0.062], [0.08, -0.44, 0.055], [0.22, -0.22, 0.05],
                                     [-0.06, -0.18, 0.045], [0.02, -0.36, 0.04]]) {
            ctx.beginPath(); ctx.arc(x + ox * sc, y + oy * sc, r * sc, 0, 7); ctx.fill();
          }
        }
        break;
      }
      case 'rune_altar': {
        const rc = CanvasRenderer.RUNE_COL[s.rune] || '#b0a8c8';
        ctx.fillStyle = '#6f6a60';
        ctx.fillRect(x - 0.34 * sc, y - 0.9 * sc, 0.68 * sc, 0.9 * sc);
        ctx.fillStyle = '#837d72';
        ctx.fillRect(x - 0.4 * sc, y - 1.0 * sc, 0.8 * sc, 0.16 * sc);
        ctx.fillStyle = rc;
        ctx.beginPath(); ctx.arc(x, y - 0.52 * sc, 0.17 * sc, 0, 7); ctx.fill();
        break;
      }
      case 'essence_rock': case 'pure_rock': {
        ctx.fillStyle = s.type === 'pure_rock' ? '#cfd4dc' : '#9aa0a8';
        ctx.beginPath(); ctx.ellipse(x, y - 0.3 * sc, 0.44 * sc, 0.3 * sc, 0, 0, 7); ctx.fill();
        ctx.fillStyle = s.type === 'pure_rock' ? '#eef1f6' : '#b6bcc4';
        ctx.beginPath(); ctx.ellipse(x - 0.1 * sc, y - 0.5 * sc, 0.26 * sc, 0.2 * sc, 0, 0, 7); ctx.fill();
        break;
      }
      case 'rune_rift': {
        ctx.fillStyle = '#6f6a60';
        ctx.fillRect(x - 0.42 * sc, y - 1.5 * sc, 0.16 * sc, 1.5 * sc);
        ctx.fillRect(x + 0.26 * sc, y - 1.5 * sc, 0.16 * sc, 1.5 * sc);
        ctx.fillRect(x - 0.42 * sc, y - 1.62 * sc, 0.84 * sc, 0.16 * sc);
        const pulse = 0.5 + 0.5 * Math.sin(now / 420);
        ctx.fillStyle = 'rgba(150,110,220,' + (0.35 + pulse * 0.4).toFixed(2) + ')';
        ctx.fillRect(x - 0.26 * sc, y - 1.46 * sc, 0.52 * sc, 1.46 * sc);
        break;
      }
      case 'herb_patch': {
        ctx.fillStyle = '#4a3a22';
        ctx.beginPath(); ctx.ellipse(x, y - 0.06 * sc, 0.42 * sc, 0.2 * sc, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#4f8a3a';
        for (const ox of [-0.2, 0, 0.2]) {
          ctx.beginPath(); ctx.ellipse(x + ox * sc, y - 0.2 * sc, 0.07 * sc, 0.18 * sc, 0, 0, 7); ctx.fill();
        }
        break;
      }
      case 'sign_weapon': case 'sign_armour': case 'sign_ranged': case 'sign_magic': {
        ctx.fillStyle = '#5a3d20';                                    // post + arm
        ctx.fillRect(x - 0.30 * sc, y - 1.5 * sc, 0.09 * sc, 1.5 * sc);
        ctx.fillRect(x - 0.30 * sc, y - 1.5 * sc, 0.6 * sc, 0.08 * sc);
        // board painted in the trade colour — same coding as GLRenderer's sign models
        const bd = { sign_weapon: '#7d3a30', sign_armour: '#46525e', sign_ranged: '#2f5a34', sign_magic: '#2c3578' }[s.type];
        ctx.fillStyle = '#3a2a16';
        ctx.fillRect(x - 0.09 * sc, y - 1.35 * sc, 0.66 * sc, 0.52 * sc);
        ctx.fillStyle = bd;
        ctx.fillRect(x - 0.06 * sc, y - 1.32 * sc, 0.6 * sc, 0.46 * sc);
        const cx2 = x + 0.24 * sc, cy2 = y - 1.09 * sc;
        if (s.type === 'sign_weapon') {
          ctx.fillStyle = '#e8eef6'; ctx.fillRect(cx2 - 0.035 * sc, cy2 - 0.20 * sc, 0.07 * sc, 0.22 * sc);
          ctx.fillStyle = '#e0b23c'; ctx.fillRect(cx2 - 0.18 * sc, cy2 + 0.01 * sc, 0.36 * sc, 0.05 * sc);
          ctx.fillRect(cx2 - 0.03 * sc, cy2 + 0.06 * sc, 0.06 * sc, 0.10 * sc);
        } else if (s.type === 'sign_armour') {
          ctx.fillStyle = '#eef3f8';
          ctx.beginPath(); ctx.arc(cx2, cy2 + 0.02 * sc, 0.17 * sc, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#96a2ae'; ctx.fillRect(cx2 - 0.19 * sc, cy2 + 0.02 * sc, 0.38 * sc, 0.06 * sc);
        } else if (s.type === 'sign_ranged') {
          ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = Math.max(1, 0.05 * sc);
          ctx.beginPath(); ctx.arc(cx2 + 0.06 * sc, cy2, 0.19 * sc, Math.PI * 0.55, Math.PI * 1.45); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.fillRect(cx2 - 0.06 * sc, cy2 - 0.19 * sc, 0.025 * sc, 0.38 * sc);
          ctx.fillRect(cx2 - 0.15 * sc, cy2 - 0.02 * sc, 0.26 * sc, 0.03 * sc);
        } else {
          ctx.fillStyle = '#ffdc5e';
          ctx.fillRect(cx2 - 0.20 * sc, cy2 - 0.05 * sc, 0.40 * sc, 0.10 * sc);
          ctx.fillRect(cx2 - 0.05 * sc, cy2 - 0.20 * sc, 0.10 * sc, 0.40 * sc);
        }
        break;
      }
      case 'fishing_spot': case 'lure_spot':
        ctx.strokeStyle = s.type === 'lure_spot' ? '#ffd9a0' : '#cfe6ff';
        ctx.lineWidth = Math.max(1, 0.03 * sc);
        for (let i = 0; i < 3; i++) {
          const tt = ((now / 1400) + i / 3) % 1;
          ctx.globalAlpha = (1 - tt) * 0.8 * (1 - this.fogA(p.d));
          ctx.beginPath(); ctx.ellipse(x, y, tt * 0.5 * sc, tt * 0.25 * sc, 0, 0, 7); ctx.stroke();
        }
        break;
      case 'fire': {
        ctx.fillStyle = '#4a3320';
        ctx.fillRect(x - 0.3 * sc, y - 0.08 * sc, 0.6 * sc, 0.08 * sc);
        const cols = ['#ff6a00', '#ffb400', '#ffe97a'];
        for (let i = 0; i < 3; i++) {
          const fl = 0.75 + 0.25 * Math.sin(now / 90 + i * 2.1);
          const w = (0.5 - 0.13 * i) * sc, fh = (0.45 + 0.18 * i) * sc * fl;
          ctx.fillStyle = cols[i];
          ctx.beginPath();
          ctx.moveTo(x - w / 2, y - 0.06 * sc);
          ctx.lineTo(x + w / 2, y - 0.06 * sc);
          ctx.lineTo(x, y - 0.06 * sc - fh);
          ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'wall': {
        const m = s.mat && this.MATERIALS[s.mat];
        if (l === 1) this.box(x, y, sc, 1.0, 1.35, '#4e4a42', '#3a3730');
        else this.box(x, y, sc, 1.0, 1.35, m ? m.face : '#8a8578', m ? m.top : '#6e6a5e');
        break;
      }
      case 'tower': {
        this.box(x, y, sc, 1.1, 2.4, '#948d7e', '#7a7466');
        // crenellations
        ctx.fillStyle = '#7a7466';
        for (const ox of [-0.45, -0.15, 0.15, 0.45])
          ctx.fillRect(x + ox * sc - 0.06 * sc, y - 2.62 * sc, 0.16 * sc, 0.2 * sc);
        // pennant
        ctx.strokeStyle = '#5a544a'; ctx.lineWidth = Math.max(1, 0.03 * sc);
        ctx.beginPath(); ctx.moveTo(x, y - 2.6 * sc); ctx.lineTo(x, y - 3.1 * sc); ctx.stroke();
        ctx.fillStyle = '#b23a3a';
        const fw = 0.35 * sc + Math.sin(now / 260) * 0.05 * sc;
        ctx.beginPath(); ctx.moveTo(x, y - 3.05 * sc); ctx.lineTo(x + fw, y - 2.92 * sc); ctx.lineTo(x, y - 2.8 * sc); ctx.closePath(); ctx.fill();
        break;
      }
      case 'milestone': {
        this.box(x, y, sc, 0.3, 0.6, '#8f897c', '#a49d8e');
        ctx.fillStyle = '#e6e0cf';
        ctx.fillRect(x - 0.1 * sc, y - 0.46 * sc, 0.2 * sc, 0.22 * sc);
        break;
      }
      case 'shrine': {
        this.box(x, y, sc, 0.55, 0.85, '#7d7669', '#918a7c');
        ctx.fillStyle = '#453f36';
        ctx.fillRect(x - 0.15 * sc, y - 0.8 * sc, 0.3 * sc, 0.4 * sc);
        const flick = 0.55 + Math.sin(now / 120 + s.x) * 0.35;
        ctx.fillStyle = '#efe6c6'; ctx.fillRect(x - 0.035 * sc, y - 0.66 * sc, 0.07 * sc, 0.16 * sc);
        ctx.fillStyle = 'rgba(255,190,70,' + flick.toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(x, y - 0.7 * sc, 0.07 * sc, 0, 7); ctx.fill();
        break;
      }
      case 'rubble': {
        ctx.fillStyle = '#6f6a60';
        ctx.beginPath(); ctx.ellipse(x, y - 0.1 * sc, 0.42 * sc, 0.2 * sc, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#8a857a';
        ctx.fillRect(x - 0.22 * sc, y - 0.3 * sc, 0.24 * sc, 0.2 * sc);
        ctx.fillStyle = '#3a3028';
        ctx.fillRect(x - 0.05 * sc, y - 0.2 * sc, 0.42 * sc, 0.08 * sc);
        break;
      }
      case 'crate': {
        this.box(x, y, sc, 0.62, 0.5, '#7a5330', '#9a7444');
        this.box(x - 0.1 * sc, y - 0.5 * sc, sc, 0.4, 0.36, '#8a6538', '#a98455');
        break;
      }
      case 'market_awning': {
        ctx.fillStyle = '#6b4a2b';
        for (const ox of [-0.42, 0.42]) ctx.fillRect(x + ox * sc - 0.03 * sc, y - 1.2 * sc, 0.06 * sc, 1.2 * sc);
        for (let i = -2; i <= 2; i++) { // striped canopy
          ctx.fillStyle = i % 2 ? '#d8d0c0' : '#a8272c';
          ctx.fillRect(x + i * 0.19 * sc - 0.095 * sc, y - 1.45 * sc, 0.19 * sc, 0.22 * sc);
        }
        break;
      }
      case 'plinth': {
        this.box(x, y, sc, 0.7, 0.55, '#6a6459', '#7d776a');
        break;
      }
      case 'farm_patch': {
        const st = (typeof Game !== 'undefined' && Game.patchState) ? Game.patchState(s) : { state: 'weeds' };
        ctx.fillStyle = st.state === 'weeds' ? '#5c6a3c' : '#5a4227';
        ctx.beginPath(); ctx.ellipse(x, y - 0.04 * sc, 0.48 * sc, 0.2 * sc, 0, 0, 7); ctx.fill();
        if (st.state === 'weeds') {
          ctx.strokeStyle = '#6f8a3e'; ctx.lineWidth = Math.max(1, 0.05 * sc);
          for (let i = 0; i < 6; i++) {
            const ox = (i - 2.5) * 0.14 * sc;
            ctx.beginPath(); ctx.moveTo(x + ox, y - 0.04 * sc); ctx.lineTo(x + ox + 0.04 * sc, y - 0.28 * sc); ctx.stroke();
          }
        } else if (st.state !== 'empty') {
          const c = CROPS[st.seed];
          const h = (st.state === 'ready' ? 0.5 : 0.12 + st.pct * 0.3) * sc;
          ctx.fillStyle = { potato: '#5f8a44', onion: '#8aa04a', cabbage: '#6cbf5a', wheat: '#c8a94e' }[c.crop] || '#5f8a44';
          for (const ox of [-0.26, -0.09, 0.09, 0.26]) ctx.fillRect(x + ox * sc - 0.05 * sc, y - 0.06 * sc - h, 0.1 * sc, h);
          if (st.state === 'ready') {
            ctx.fillStyle = c.crop === 'wheat' ? '#d8bd63' : '#8fd06a';
            for (const ox of [-0.26, -0.09, 0.09, 0.26]) {
              ctx.beginPath(); ctx.arc(x + ox * sc, y - 0.06 * sc - h, 0.09 * sc, 0, 7); ctx.fill();
            }
          }
        }
        break;
      }
      // ---- Mourncross ----
      case 'bone_font': case 'bone_font_dark': {
        const dark = s.type === 'bone_font_dark';
        this.box(x, y, sc, 0.95, 0.6, dark ? '#6f716b' : '#b0b2aa', dark ? '#84867e' : '#c6c8be');
        ctx.fillStyle = dark ? '#4a504a' : '#8a9a8a';
        ctx.beginPath(); ctx.ellipse(x, y - 0.66 * sc, 0.42 * sc, 0.15 * sc, 0, 0, 7); ctx.fill();
        if (!dark) {
          const glow = 0.45 + Math.sin(now / 520 + s.x) * 0.3;
          ctx.fillStyle = 'rgba(120,235,170,' + glow.toFixed(2) + ')';
          ctx.beginPath(); ctx.ellipse(x, y - 0.68 * sc, 0.2 * sc, 0.08 * sc, 0, 0, 7); ctx.fill();
        }
        ctx.fillStyle = '#ded8c6';                                       // offered bone around the rim
        for (let i = 0; i < 5; i++) ctx.fillRect(x + (i - 2) * 0.2 * sc, y - 0.72 * sc, 0.06 * sc, 0.12 * sc);
        break;
      }
      case 'bone_grinder': {
        this.box(x, y, sc, 0.7, 0.9, '#8e9088', '#a4a69c');
        ctx.strokeStyle = '#5a4a38'; ctx.lineWidth = Math.max(2, 0.06 * sc); ctx.lineCap = 'round';
        const a = now / 900 + s.x;                                        // the crank turns
        ctx.beginPath();
        ctx.moveTo(x + 0.36 * sc, y - 0.55 * sc);
        ctx.lineTo(x + 0.36 * sc + Math.cos(a) * 0.26 * sc, y - 0.55 * sc + Math.sin(a) * 0.26 * sc);
        ctx.stroke();
        break;
      }
      case 'slime_pool': {
        const b = 0.5 + Math.sin(now / 700 + s.x * 2) * 0.5;
        ctx.fillStyle = '#2f5c3f';
        ctx.beginPath(); ctx.ellipse(x, y - 0.05 * sc, 0.5 * sc, 0.22 * sc, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgb(' + (70 + b * 30 | 0) + ',' + (150 + b * 40 | 0) + ',' + (100 + b * 20 | 0) + ')';
        ctx.beginPath(); ctx.ellipse(x, y - 0.07 * sc, 0.3 * sc, 0.13 * sc, 0, 0, 7); ctx.fill();
        break;
      }
      case 'sand_bank': {
        this.box(x, y, sc, 0.9, 0.34, '#8c8a7c', '#a2a092');
        this.box(x - 0.16 * sc, y - 0.3 * sc, sc, 0.45, 0.2, '#9c9a8a', '#b0ae9e');
        break;
      }
      case 'grave': {
        ctx.fillStyle = '#5c6156';
        ctx.beginPath(); ctx.ellipse(x, y - 0.06 * sc, 0.42 * sc, 0.16 * sc, 0, 0, 7); ctx.fill();
        const lean = ((s.x * 13 + s.z * 7) % 7 - 3) * 0.05;
        ctx.save(); ctx.translate(x, y - 0.12 * sc); ctx.rotate(lean);
        ctx.fillStyle = '#a6a89e'; ctx.fillRect(-0.17 * sc, -0.62 * sc, 0.34 * sc, 0.62 * sc);
        ctx.fillStyle = '#8e9086'; ctx.fillRect(-0.17 * sc, -0.66 * sc, 0.34 * sc, 0.06 * sc);
        ctx.restore();
        break;
      }
      case 'dead_tree': {
        ctx.strokeStyle = '#6a6558'; ctx.lineWidth = Math.max(2, 0.14 * sc); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 1.85 * sc); ctx.stroke();
        ctx.lineWidth = Math.max(1, 0.07 * sc); ctx.strokeStyle = '#77715f';
        for (const [dx, dy] of [[0.45, -0.35], [-0.42, -0.28], [0.22, -0.5]]) {
          ctx.beginPath(); ctx.moveTo(x, y - 1.35 * sc);
          ctx.lineTo(x + dx * sc, y - 1.35 * sc + dy * sc); ctx.stroke();
        }
        break;
      }
      case 'bell': {
        ctx.fillStyle = '#7a7468';                                        // frame
        for (const ox of [-0.3, 0.3]) ctx.fillRect(x + ox * sc - 0.04 * sc, y - 1.6 * sc, 0.08 * sc, 1.6 * sc);
        ctx.fillRect(x - 0.37 * sc, y - 1.66 * sc, 0.74 * sc, 0.1 * sc);
        const rung = typeof Game !== 'undefined' && Game.bellRungAt ? Game.bellRungAt(s) : 0;
        const t = rung && now < rung + 1400 ? (now - rung) / 1400 : -1;
        const sway = t >= 0 ? Math.sin(t * 22) * 0.5 * (1 - t) : 0;
        ctx.save(); ctx.translate(x, y - 1.56 * sc); ctx.rotate(sway);
        ctx.fillStyle = '#9a8a56'; ctx.fillRect(-0.21 * sc, 0.08 * sc, 0.42 * sc, 0.5 * sc);
        ctx.fillStyle = '#b0a068'; ctx.fillRect(-0.25 * sc, 0.56 * sc, 0.5 * sc, 0.12 * sc);
        ctx.restore();
        break;
      }
      case 'font_gate': {
        const open = typeof Game !== 'undefined' && Game.fontGateOpen && Game.fontGateOpen();
        if (open) { ctx.fillStyle = '#3a3a34'; ctx.fillRect(x - 0.45 * sc, y - 0.1 * sc, 0.9 * sc, 0.1 * sc); break; }
        ctx.fillStyle = '#3f4148';
        for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * 0.2 * sc - 0.03 * sc, y - 1.7 * sc, 0.06 * sc, 1.7 * sc);
        ctx.fillStyle = '#4a4c54';
        for (const yy of [0.3, 1.4]) ctx.fillRect(x - 0.5 * sc, y - yy * sc, 1.0 * sc, 0.09 * sc);
        break;
      }
      case 'pylon': {
        const lit = typeof Game !== 'undefined' && Game.pylonLit && Game.pylonLit(s);
        this.box(x, y, sc, 0.42, 1.9, lit ? '#6a6f80' : '#55514a', lit ? '#868da0' : '#6a655c');
        if (lit) {
          const pulse = 0.45 + Math.sin(now / 260 + s.x) * 0.35;
          ctx.fillStyle = 'rgba(120,190,255,' + pulse.toFixed(2) + ')';
          ctx.fillRect(x - 0.13 * sc, y - 1.35 * sc, 0.26 * sc, 0.26 * sc);
        }
        break;
      }
      case 'fountain': {
        // stone basin
        ctx.fillStyle = '#8f897c';
        ctx.beginPath(); ctx.ellipse(x, y - 0.12 * sc, 0.85 * sc, 0.4 * sc, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#3f6d9a';
        ctx.beginPath(); ctx.ellipse(x, y - 0.16 * sc, 0.7 * sc, 0.3 * sc, 0, 0, 7); ctx.fill();
        // central pillar
        ctx.fillStyle = '#a49d8e';
        ctx.fillRect(x - 0.12 * sc, y - 0.75 * sc, 0.24 * sc, 0.65 * sc);
        ctx.beginPath(); ctx.ellipse(x, y - 0.78 * sc, 0.28 * sc, 0.12 * sc, 0, 0, 7); ctx.fill();
        // arcing water jets
        ctx.strokeStyle = 'rgba(150,205,255,0.85)'; ctx.lineWidth = Math.max(1.5, 0.04 * sc);
        for (const dir of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x, y - 0.9 * sc);
          ctx.quadraticCurveTo(x + dir * 0.45 * sc, y - 1.2 * sc, x + dir * 0.6 * sc, y - 0.2 * sc);
          ctx.stroke();
        }
        // droplet sparkle
        ctx.fillStyle = 'rgba(200,235,255,0.9)';
        for (let i = 0; i < 3; i++) {
          const tt = ((now / 700) + i / 3) % 1;
          ctx.beginPath(); ctx.arc(x + (i - 1) * 0.4 * sc, y - 0.9 * sc + tt * 0.7 * sc, 0.05 * sc, 0, 7); ctx.fill();
        }
        break;
      }
      case 'lamppost': {
        ctx.strokeStyle = '#2e2a24'; ctx.lineWidth = Math.max(2, 0.07 * sc); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 1.45 * sc); ctx.stroke();
        const glow = 0.7 + 0.3 * Math.sin(now / 350 + x);
        ctx.fillStyle = `rgba(255,${(200 * glow) | 0},80,${0.35 * glow})`;
        ctx.beginPath(); ctx.arc(x, y - 1.5 * sc, 0.3 * sc, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(255,${(225 * glow) | 0},120,${glow})`;
        ctx.beginPath(); ctx.arc(x, y - 1.5 * sc, 0.11 * sc, 0, 7); ctx.fill();
        break;
      }
      case 'signpost': {
        ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = Math.max(2, 0.07 * sc);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 1.1 * sc); ctx.stroke();
        ctx.fillStyle = '#a5824f';
        ctx.fillRect(x - 0.35 * sc, y - 1.25 * sc, 0.7 * sc, 0.32 * sc);
        ctx.fillStyle = '#3a2a18';
        ctx.fillRect(x - 0.28 * sc, y - 1.18 * sc, 0.5 * sc, 0.04 * sc);
        ctx.fillRect(x - 0.28 * sc, y - 1.09 * sc, 0.42 * sc, 0.04 * sc);
        break;
      }
      case 'statue': {
        // stone plinth + heroic figure
        ctx.fillStyle = '#8a857a';
        ctx.fillRect(x - 0.4 * sc, y - 0.5 * sc, 0.8 * sc, 0.5 * sc);
        ctx.fillStyle = '#9a958a';
        ctx.fillRect(x - 0.34 * sc, y - 0.6 * sc, 0.68 * sc, 0.12 * sc);
        // figure
        ctx.fillStyle = '#b0aa9c';
        ctx.fillRect(x - 0.12 * sc, y - 1.7 * sc, 0.24 * sc, 1.15 * sc);
        ctx.beginPath(); ctx.arc(x, y - 1.8 * sc, 0.16 * sc, 0, 7); ctx.fill();
        // raised sword arm
        ctx.strokeStyle = '#b0aa9c'; ctx.lineWidth = 0.09 * sc; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x + 0.08 * sc, y - 1.5 * sc); ctx.lineTo(x + 0.34 * sc, y - 2.15 * sc); ctx.stroke();
        ctx.strokeStyle = '#c8c2b4';
        ctx.beginPath(); ctx.moveTo(x + 0.34 * sc, y - 2.05 * sc); ctx.lineTo(x + 0.34 * sc, y - 2.5 * sc); ctx.stroke();
        break;
      }
      case 'stall': {
        // counter
        ctx.fillStyle = '#7a5330';
        ctx.fillRect(x - 0.5 * sc, y - 0.55 * sc, 1.0 * sc, 0.45 * sc);
        // posts
        ctx.fillStyle = '#5a3d20';
        ctx.fillRect(x - 0.5 * sc, y - 1.3 * sc, 0.08 * sc, 0.8 * sc);
        ctx.fillRect(x + 0.42 * sc, y - 1.3 * sc, 0.08 * sc, 0.8 * sc);
        // striped awning
        const cols = ['#c23a3a', '#e8e2d0'];
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = cols[i % 2];
          ctx.beginPath();
          ctx.moveTo(x - 0.55 * sc + i * 0.22 * sc, y - 1.3 * sc);
          ctx.lineTo(x - 0.55 * sc + (i + 1) * 0.22 * sc, y - 1.3 * sc);
          ctx.lineTo(x - 0.55 * sc + (i + 0.5) * 0.22 * sc, y - 1.5 * sc);
          ctx.closePath(); ctx.fill();
        }
        // wares
        ctx.fillStyle = '#c8a03c';
        ctx.beginPath(); ctx.arc(x - 0.2 * sc, y - 0.6 * sc, 0.07 * sc, 0, 7); ctx.fill();
        ctx.fillStyle = '#6aa84a';
        ctx.beginPath(); ctx.arc(x + 0.15 * sc, y - 0.6 * sc, 0.07 * sc, 0, 7); ctx.fill();
        break;
      }
      case 'well': {
        ctx.fillStyle = '#7d786e';
        ctx.beginPath(); ctx.ellipse(x, y - 0.15 * sc, 0.45 * sc, 0.25 * sc, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#1c2a33';
        ctx.beginPath(); ctx.ellipse(x, y - 0.2 * sc, 0.32 * sc, 0.17 * sc, 0, 0, 7); ctx.fill();
        // posts + roof
        ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 0.07 * sc;
        ctx.beginPath(); ctx.moveTo(x - 0.35 * sc, y - 0.3 * sc); ctx.lineTo(x - 0.3 * sc, y - 1.0 * sc);
        ctx.moveTo(x + 0.35 * sc, y - 0.3 * sc); ctx.lineTo(x + 0.3 * sc, y - 1.0 * sc); ctx.stroke();
        ctx.fillStyle = '#7a4a2a';
        ctx.beginPath(); ctx.moveTo(x - 0.45 * sc, y - 1.0 * sc); ctx.lineTo(x + 0.45 * sc, y - 1.0 * sc); ctx.lineTo(x, y - 1.35 * sc); ctx.closePath(); ctx.fill();
        break;
      }
      case 'bank_booth':
        this.box(x, y, sc, 1.0, 0.85, '#6b4a2b', '#8a6538');
        ctx.fillStyle = '#ffe97a';
        ctx.font = 'bold ' + (0.28 * sc | 0) + 'px Verdana';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('$', x, y - 0.45 * sc);
        break;
      case 'furnace': {
        this.box(x, y, sc, 1.0, 1.4, '#6e6a60', '#57534a');
        const gl = 0.7 + 0.3 * Math.sin(now / 150);
        ctx.fillStyle = `rgba(255,${(120 * gl) | 0},0,${0.85 * gl})`;
        ctx.fillRect(x - 0.22 * sc, y - 0.5 * sc, 0.44 * sc, 0.34 * sc);
        break;
      }
      case 'anvil':
        ctx.fillStyle = '#2e2e33';
        ctx.fillRect(x - 0.14 * sc, y - 0.4 * sc, 0.28 * sc, 0.4 * sc);
        ctx.fillRect(x - 0.4 * sc, y - 0.6 * sc, 0.8 * sc, 0.22 * sc);
        break;
      case 'range':
        this.box(x, y, sc, 1.0, 0.9, '#3a3a3e', '#2a2a2e');
        ctx.fillStyle = '#c03a10';
        ctx.fillRect(x - 0.28 * sc, y - 0.55 * sc, 0.56 * sc, 0.3 * sc);
        break;
      case 'altar':
        this.box(x, y, sc, 1.2, 0.8, '#c9c4b8', '#e2ddd0');
        ctx.fillStyle = '#ffe97a';
        ctx.fillRect(x - 0.04 * sc, y - 1.15 * sc, 0.08 * sc, 0.36 * sc);
        ctx.fillRect(x - 0.14 * sc, y - 1.05 * sc, 0.28 * sc, 0.08 * sc);
        break;
      case 'ladder_down': case 'ladder_up': {
        ctx.strokeStyle = '#b08d57'; ctx.lineWidth = Math.max(2, 0.06 * sc);
        ctx.beginPath();
        ctx.moveTo(x - 0.2 * sc, y); ctx.lineTo(x - 0.2 * sc, y - 1.4 * sc);
        ctx.moveTo(x + 0.2 * sc, y); ctx.lineTo(x + 0.2 * sc, y - 1.4 * sc);
        for (let i = 1; i <= 5; i++) {
          ctx.moveTo(x - 0.2 * sc, y - i * 0.24 * sc);
          ctx.lineTo(x + 0.2 * sc, y - i * 0.24 * sc);
        }
        ctx.stroke();
        break;
      }
      case 'rampart': case 'gatehouse': {
        const gh = s.type === 'gatehouse', h = gh ? 2.9 : 1.9;
        this.box(x, y, sc, 1.0, h, '#8f897c', '#726c60');
        ctx.fillStyle = '#726c60';
        for (const ox of [-0.42, -0.14, 0.14, 0.42]) ctx.fillRect(x + ox * sc - 0.06 * sc, y - (h + 0.18) * sc, 0.16 * sc, 0.18 * sc); // merlons
        if (gh) { ctx.fillStyle = '#9a3230'; ctx.fillRect(x + 0.06 * sc, y - (h + 0.5) * sc, 0.3 * sc, 0.18 * sc); } // banner
        break;
      }
      case 'shop_counter':
        this.box(x, y, sc, 1.0, 0.9, '#7a5330', '#5a3d20');
        ctx.fillStyle = '#8a6a40'; ctx.fillRect(x - 0.3 * sc, y - 1.15 * sc, 0.34 * sc, 0.24 * sc); // crate
        break;
      case 'shelves': {
        this.box(x, y, sc, 1.0, 1.7, '#5a3d20', '#7a5330');
        const goods = ['#a83232', '#37639c', '#c9a24a', '#3a7a5a', '#8a4fa0'];
        for (let s = 0; s < 4; s++) for (let g = 0; g < 3; g++) { ctx.fillStyle = goods[(s * 3 + g) % goods.length]; ctx.fillRect(x + (-0.32 + g * 0.24) * sc, y - (0.5 + s * 0.4) * sc, 0.16 * sc, 0.28 * sc); }
        break;
      }
      case 'stained_glass': {
        this.box(x, y, sc, 1.0, 2.0, '#8f897c', '#726c60');
        const panes = ['#c23a3a', '#3a6ec2', '#e0c23a', '#3aa06a', '#8a4fb0'];
        for (let r2 = 0; r2 < 4; r2++) for (let cix = 0; cix < 3; cix++) { ctx.fillStyle = panes[(r2 * 3 + cix) % panes.length]; ctx.fillRect(x + (-0.3 + cix * 0.26) * sc, y - (0.6 + r2 * 0.34) * sc, 0.18 * sc, 0.26 * sc); }
        break;
      }
    }
    ctx.globalAlpha = 1;
  },

  drawGroundItem(g, p, sc) {
    const ctx = this.ctx;
    ctx.globalAlpha = 1 - this.fogA(p.d);
    ctx.font = (0.5 * sc | 0) + 'px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(ITEMS[g.id].icon, p.x, p.y + 0.05 * sc);
    ctx.globalAlpha = 1;
  },

  drawOtherPlayer(q, p, sc, now) {
    const ctx = this.ctx, x = p.x, y = p.y;
    ctx.globalAlpha = 1 - this.fogA(p.d);
    this.drawHuman(x, y, sc, { skin: '#c8956c', shirt: '#4c6ea0', legs: '#5a5060' }, q.moving, now, emotePose2(q, now));
    if (now < q.showHpUntil) this.drawBar(q.curHits / (q.maxHits || 10), x, y - 1.75 * sc, sc);
    this.drawSplat(q, x, y - 0.8 * sc, sc, now);
    // name label
    ctx.globalAlpha = 1 - this.fogA(p.d);
    ctx.font = 'bold ' + Math.max(9, 0.18 * sc | 0) + 'px Verdana';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#000'; ctx.fillText(q.name, x + 1, y - 1.9 * sc + 1);
    ctx.fillStyle = '#ffe97a'; ctx.fillText(q.name, x, y - 1.9 * sc);
    this.drawBubble(q, x, y - 2.15 * sc, sc, now);
    ctx.globalAlpha = 1;
  },

  drawBubble(e, x, y, sc, now) {
    if (!e.bubble || now > e.bubble.until) return;
    drawChatText(this.ctx, e.bubble.text, x, y, Math.max(9, 0.17 * sc | 0));
  },

  // `po` is an optional emote pose (see emotePose). These are billboarded sprites,
  // so only the parts that read side-on are used: the lift, the tip, and the arms
  // swinging out from the shoulders.
  drawHuman(x, y, sc, look, moving, now, po) {
    const ctx = this.ctx;
    const sw = moving ? Math.sin(now / 130) * 0.1 * sc : 0;
    if (po) {
      ctx.save();
      ctx.translate(x, y - po.bob * sc);
      ctx.rotate(po.tilt - po.lean * 0.4);
      ctx.translate(-x, -y);
      y -= po.bob * sc;
    }
    if (look.dress) {
      ctx.fillStyle = look.legs || '#8a4a76';
      ctx.beginPath();
      ctx.moveTo(x - 0.1 * sc, y - 0.6 * sc);
      ctx.lineTo(x + 0.1 * sc, y - 0.6 * sc);
      ctx.lineTo(x + 0.26 * sc, y); ctx.lineTo(x - 0.26 * sc, y);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = look.legs || '#7a5c3a';
      ctx.fillRect(x - 0.16 * sc, y - 0.6 * sc - sw, 0.13 * sc, 0.6 * sc + sw);
      ctx.fillRect(x + 0.03 * sc, y - 0.6 * sc + sw, 0.13 * sc, 0.6 * sc - sw);
    }
    ctx.fillStyle = look.shirt;
    ctx.fillRect(x - 0.22 * sc, y - 1.1 * sc, 0.44 * sc, 0.52 * sc);
    if (po && po.arms) {
      // posed arms swing out from the shoulder — same angle-from-down rule the
      // emote icons use, so the flat view agrees with the 3D one
      ctx.strokeStyle = look.shirt; ctx.lineWidth = 0.1 * sc; ctx.lineCap = 'round';
      for (const [side, pit, rol] of [[-1, po.lPit, po.lRol], [1, po.rPit, po.rRol]]) {
        const ang = Math.min(Math.PI, Math.abs(rol) + Math.max(0, -pit) * 0.92);
        const jx = x + side * 0.26 * sc, jy = y - 1.06 * sc;
        ctx.beginPath(); ctx.moveTo(jx, jy);
        ctx.lineTo(jx + Math.sin(ang) * 0.4 * sc * side, jy + Math.cos(ang) * 0.4 * sc);
        ctx.stroke();
      }
    } else {
      ctx.fillRect(x - 0.31 * sc, y - 1.08 * sc, 0.09 * sc, 0.4 * sc);
      ctx.fillRect(x + 0.22 * sc, y - 1.08 * sc, 0.09 * sc, 0.4 * sc);
    }
    ctx.fillStyle = look.skin;
    const hx = x + (po ? po.headYaw * 0.1 * sc : 0), hy = y - 1.27 * sc + (po ? po.headPitch * 0.1 * sc : 0);
    ctx.beginPath(); ctx.arc(hx, hy, 0.15 * sc, 0, 7); ctx.fill();
    if (look.helm) {
      ctx.fillStyle = look.helmCol || '#9a9da6';   // was hardcoded grey, ignoring the look
      ctx.beginPath(); ctx.arc(hx, hy - 0.04 * sc, 0.16 * sc, Math.PI, 0); ctx.fill();
      ctx.fillRect(hx - 0.16 * sc, hy - 0.05 * sc, 0.32 * sc, 0.06 * sc);
    } else if (look.hat) {
      ctx.fillStyle = look.hatCol || '#2f3f96';    // pointed hat: brim + cone
      ctx.fillRect(hx - 0.24 * sc, hy - 0.09 * sc, 0.48 * sc, 0.05 * sc);
      ctx.beginPath();
      ctx.moveTo(hx - 0.17 * sc, hy - 0.08 * sc);
      ctx.lineTo(hx + 0.17 * sc, hy - 0.08 * sc);
      ctx.lineTo(hx + 0.02 * sc, hy - 0.42 * sc);
      ctx.closePath(); ctx.fill();
    } else if (!look.noHair) {
      ctx.fillStyle = look.dress ? '#6a3f1a' : '#4a2f14';
      ctx.beginPath(); ctx.arc(hx, hy - 0.04 * sc, look.dress ? 0.16 * sc : 0.14 * sc, Math.PI, 0); ctx.fill();
    }
    if (po) ctx.restore();
  },

  drawBar(frac, x, y, sc, mine) {
    const ctx = this.ctx, w = 0.9 * sc, h = Math.max(3, 0.08 * sc);
    // the bar of whatever you're fighting gets a pale surround, so it stays legible
    // when several monsters are stood on the same tile and their bars overlap
    if (mine) { ctx.fillStyle = '#f4f0e0'; ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, h + 4); }
    ctx.fillStyle = '#c02020'; ctx.fillRect(x - w / 2, y, w, h);
    // Anything with health left keeps at least a visible sliver of green. Without
    // this a 110hp boss on 1hp draws an all-red bar and reads as already dead.
    const g = frac <= 0 ? 0 : Math.max(2, w * frac);
    ctx.fillStyle = '#20c020'; ctx.fillRect(x - w / 2, y, g, h);
  },

  drawSplat(e, x, y, sc, now) {
    if (!e.splat || now > e.splat.until) return;
    const ctx = this.ctx;
    ctx.fillStyle = e.splat.v > 0 ? '#c02020' : '#2828b8';
    ctx.beginPath(); ctx.arc(x, y, 0.22 * sc, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (0.22 * sc | 0) + 'px Verdana';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e.splat.v, x, y);
  },

  drawNpc(n, p, sc, now) {
    const ctx = this.ctx;
    // Attack lunge. These sprites are billboarded, so there is no facing to turn —
    // instead lean the whole figure at its target. Projecting a point one tile in
    // front of the creature gives the screen-space direction to lean along.
    let x = p.x, y = p.y;
    if (now < (n.swingUntil || 0)) {
      const st = Math.sin((1 - (n.swingUntil - now) / 350) * Math.PI);
      let ux = 0, uy = 0.32 * sc;                       // no target known: just dip
      if (n.faceX != null) {
        const dx = n.faceX - n.fx, dz = n.faceZ - n.fz, m = Math.hypot(dx, dz) || 1;
        const q = this.project(n.fx + dx / m, World.heightAt(n.layer, n.fx, n.fz), n.fz + dz / m);
        if (q) { ux = (q.x - p.x) * 0.34; uy = (q.y - p.y) * 0.34; }
      }
      x += ux * st; y += uy * st;
    }
    ctx.globalAlpha = 1 - this.fogA(p.d);
    if (n.type === 'rat') {
      ctx.strokeStyle = '#8a7a63'; ctx.lineWidth = Math.max(1, 0.04 * sc);
      ctx.beginPath(); ctx.moveTo(x - 0.34 * sc, y - 0.15 * sc);
      ctx.quadraticCurveTo(x - 0.55 * sc, y - 0.3 * sc, x - 0.62 * sc, y - 0.08 * sc); ctx.stroke();
      ctx.fillStyle = '#8a7a63';
      ctx.beginPath(); ctx.ellipse(x, y - 0.18 * sc, 0.34 * sc, 0.17 * sc, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 0.32 * sc, y - 0.24 * sc, 0.12 * sc, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 0.3 * sc, y - 0.36 * sc, 0.05 * sc, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 0.38 * sc, y - 0.36 * sc, 0.05 * sc, 0, 7); ctx.fill();
    } else if (n.type === 'dragon') {
      const flap = Math.sin(now / 200) * 0.15 * sc;
      ctx.fillStyle = '#2f6b2a';
      // wings
      ctx.fillStyle = '#24521f';
      ctx.beginPath(); ctx.moveTo(x, y - 1.1 * sc);
      ctx.lineTo(x - 1.05 * sc, y - 1.5 * sc - flap); ctx.lineTo(x - 0.5 * sc, y - 0.7 * sc); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y - 1.1 * sc);
      ctx.lineTo(x + 1.05 * sc, y - 1.5 * sc + flap); ctx.lineTo(x + 0.5 * sc, y - 0.7 * sc); ctx.closePath(); ctx.fill();
      // tail
      ctx.strokeStyle = '#2f6b2a'; ctx.lineWidth = 0.18 * sc; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 0.2 * sc, y - 0.3 * sc);
      ctx.quadraticCurveTo(x - 0.9 * sc, y - 0.1 * sc, x - 1.1 * sc, y - 0.5 * sc); ctx.stroke();
      // body + legs
      ctx.fillStyle = '#2f6b2a';
      ctx.fillRect(x - 0.28 * sc, y - 0.5 * sc, 0.18 * sc, 0.5 * sc);
      ctx.fillRect(x + 0.12 * sc, y - 0.5 * sc, 0.18 * sc, 0.5 * sc);
      ctx.beginPath(); ctx.ellipse(x, y - 0.75 * sc, 0.42 * sc, 0.5 * sc, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3f8a37';
      ctx.beginPath(); ctx.ellipse(x, y - 0.7 * sc, 0.24 * sc, 0.32 * sc, 0, 0, 7); ctx.fill();
      // neck + head
      ctx.strokeStyle = '#2f6b2a'; ctx.lineWidth = 0.2 * sc;
      ctx.beginPath(); ctx.moveTo(x + 0.1 * sc, y - 1.1 * sc); ctx.lineTo(x + 0.4 * sc, y - 1.75 * sc); ctx.stroke();
      ctx.fillStyle = '#357a2e';
      ctx.beginPath(); ctx.ellipse(x + 0.5 * sc, y - 1.8 * sc, 0.26 * sc, 0.18 * sc, 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath(); ctx.arc(x + 0.56 * sc, y - 1.88 * sc, 0.045 * sc, 0, 7); ctx.fill();
      // fire glow when breathing (splat active)
      if (n.splat && now < n.splat.until) {
        ctx.fillStyle = 'rgba(255,110,20,0.8)';
        ctx.beginPath(); ctx.arc(x + 0.75 * sc, y - 1.82 * sc, 0.14 * sc * (0.7 + Math.random() * 0.5), 0, 7); ctx.fill();
      }
    } else if (n.type === 'bear') {
      ctx.fillStyle = '#4e3a26';
      ctx.beginPath(); ctx.ellipse(x, y - 0.4 * sc, 0.5 * sc, 0.32 * sc, 0, 0, 7); ctx.fill();
      ctx.fillRect(x - 0.42 * sc, y - 0.3 * sc, 0.14 * sc, 0.3 * sc);
      ctx.fillRect(x + 0.28 * sc, y - 0.3 * sc, 0.14 * sc, 0.3 * sc);
      ctx.beginPath(); ctx.arc(x + 0.48 * sc, y - 0.6 * sc, 0.2 * sc, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 0.4 * sc, y - 0.76 * sc, 0.07 * sc, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 0.56 * sc, y - 0.76 * sc, 0.07 * sc, 0, 7); ctx.fill();
      ctx.fillStyle = '#2e2218';
      ctx.beginPath(); ctx.arc(x + 0.62 * sc, y - 0.56 * sc, 0.06 * sc, 0, 7); ctx.fill();
    } else {
      const look = NPC_LOOKS[n.type] || NPC_LOOKS.guide;
      const s2 = sc * (look.scale || 1);
      if (look.ghost) {
        ctx.globalAlpha *= 0.55 + 0.1 * Math.sin(now / 300);
        this.drawHuman(x, y - (look.lift || 0.15) * sc, s2, look, n.moving, now);
      } else {
        this.drawHuman(x, y, s2, look, n.moving, now);
      }
      if (look.beard) {
        ctx.fillStyle = '#d8d0c0';
        ctx.beginPath(); ctx.arc(x, y - 1.17 * s2, 0.13 * s2, 0, Math.PI); ctx.fill();
      }
      if (n.type === 'skeleton') {
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(x - 0.05 * sc, y - 1.28 * sc, 0.03 * sc, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 0.05 * sc, y - 1.28 * sc, 0.03 * sc, 0, 7); ctx.fill();
      }
    }
    // overlays stay pinned to the creature's real position — they must not bob with the lunge
    const barY = n.type === 'rat' ? 0.7 : n.type === 'bear' ? 1.05 : n.type === 'dragon' ? 2.05 : 1.75;
    // Sprites are painted back-to-front, so a nearer monster would otherwise cover the
    // bar of the one you're fighting. Defer yours and paint it after everything else.
    if (n === this._mine) this._targetBar = { frac: n.hits / n.maxHits, x: p.x, y: p.y - barY * sc, sc };
    else if (now < n.showHpUntil) this.drawBar(n.hits / n.maxHits, p.x, p.y - barY * sc, sc);
    const splatY = p.y - (n.type === 'rat' ? 0.3 : n.type === 'bear' ? 0.5 : n.type === 'dragon' ? 0.9 : 0.8) * sc;
    this.drawSplat(n, p.x, splatY, sc, now);
    if (n.splat2 && now < n.splat2.until) this.drawSplat({ splat: n.splat2 }, p.x + 0.34 * sc, splatY - 0.3 * sc, sc, now);
    if (n.bubble && now < n.bubble.until) this.drawBubble(n, p.x, p.y - 1.95 * sc, sc, now);
    ctx.globalAlpha = 1;
  },

  drawPlayerSprite(G, P, p, sc, now) {
    const ctx = this.ctx;
    // a worn cape hangs behind the figure, so it is painted before the body
    const cape = G.equippedIn && G.equippedIn('cape');
    if (cape) {
      const cc = { cape_red: '#a8272c', cape_blue: '#28479c', cape_green: '#2a7a38', cape_black: '#26262c',
                   highwayman_cloak: '#3a2f42', avas_satchel: '#6a4a2c' }[cape.id] || '#a8272c';
      const sw = P.moving ? Math.sin(now / 130) * 0.06 * sc : 0;
      ctx.fillStyle = cc;
      ctx.beginPath();
      ctx.moveTo(p.x - 0.22 * sc, p.y - 1.15 * sc);
      ctx.lineTo(p.x + 0.22 * sc, p.y - 1.15 * sc);
      ctx.lineTo(p.x + 0.3 * sc + sw, p.y - 0.35 * sc);
      ctx.lineTo(p.x - 0.3 * sc + sw, p.y - 0.35 * sc);
      ctx.closePath(); ctx.fill();
    }
    this.drawHuman(p.x, p.y, sc, G.playerLook ? G.playerLook() : { skin: '#c8956c', shirt: '#a04c4c', legs: '#7a5c3a' }, P.moving, now, emotePose2(P, now));
    const wep = G.equippedIn('weapon');
    const bow = wep && ITEMS[wep.id].bow;
    const swinging = now < (P.swingUntil || 0);
    const gathering = !G.netMode && P.action && (P.action.type === 'chop' || P.action.type === 'mine') && P.action.started && !P.path.length;
    // gathering tool swing (axe/pick)
    if (gathering) {
      const ang = -0.4 + Math.abs(Math.sin(now / 130)) * 1.2;
      const hx = p.x + 0.28 * sc, hy = p.y - 0.8 * sc;
      ctx.strokeStyle = P.action.type === 'mine' ? '#6a6a72' : '#8a6a3a';
      ctx.lineWidth = Math.max(2, 0.06 * sc); ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(ang) * 0.5 * sc, hy - Math.sin(ang) * 0.5 * sc);
      ctx.stroke();
    } else if (wep) {
      ctx.strokeStyle = bow ? '#b08d57' : '#9a9aa5';
      ctx.lineWidth = Math.max(2, 0.05 * sc);
      ctx.beginPath();
      if (bow) {
        const pull = swinging ? 0.15 * sc : 0;
        ctx.arc(p.x + 0.38 * sc + pull, p.y - 0.85 * sc, 0.3 * sc, -1.2, 1.2);
      } else {
        // melee: sweep the blade during a swing
        const t = swinging ? 1 - (P.swingUntil - now) / 350 : 0;
        const ang = swinging ? (-0.9 + t * 1.8) : -0.4;
        const hx = p.x + 0.3 * sc, hy = p.y - 0.8 * sc;
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + Math.cos(ang) * 0.55 * sc, hy - Math.sin(ang) * 0.55 * sc);
      }
      ctx.stroke();
    }
    const shield = G.equippedIn('shield');
    if (shield) {
      ctx.fillStyle = '#8a6538';
      ctx.beginPath(); ctx.ellipse(p.x - 0.36 * sc, p.y - 0.85 * sc, 0.14 * sc, 0.2 * sc, 0, 0, 7); ctx.fill();
    }
    if (now < P.showHpUntil) this.drawBar(P.curHits / Game.level('hits'), p.x, p.y - 1.75 * sc, sc);
    this.drawSplat(P, p.x, p.y - 0.8 * sc, sc, now);
    if (G.netMode) {
      ctx.globalAlpha = 1 - this.fogA(p.d);
      ctx.font = 'bold ' + Math.max(9, 0.18 * sc | 0) + 'px Verdana';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#000'; ctx.fillText(Net.name, p.x + 1, p.y - 1.9 * sc + 1);
      ctx.fillStyle = '#8fdcff'; ctx.fillText(Net.name, p.x, p.y - 1.9 * sc);
      ctx.globalAlpha = 1;
    }
    // Outside the netMode block on purpose: what you type shows over your own head
    // in singleplayer too. Sits above the name plate when there is one.
    ctx.globalAlpha = 1 - this.fogA(p.d);
    this.drawBubble(P, p.x, p.y - (G.netMode ? 2.15 : 1.9) * sc, sc, now);
    ctx.globalAlpha = 1;
    function y0(pp, s) { return pp.y - 0.75 * s; }
  }
};

// default to the canvas renderer; startup may swap in GLRenderer
Renderer = CanvasRenderer;
