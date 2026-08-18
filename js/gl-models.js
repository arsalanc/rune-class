'use strict';
// ---------------------------------------------------------------------------
// gl-models.js — the baked low-poly model catalog, attached to GLRenderer as
// _buildModels() and called once at init. Uses the mesh builders from gl-lib.js
// and this._bake / this.models. Must load AFTER gl.js.
// ---------------------------------------------------------------------------
GLRenderer._buildModels = function () {
    // ---------- rat ----------
    {
      const a = [], fur = hexRGB('#8a7a63'), dk = hexRGB('#6f5f4c'), ear = hexRGB('#c59f96'), nose = hexRGB('#3a2a24');
      _boxC(a, 0, 0.22, -0.18, 0.44, 0.34, 0.5, fur);   // haunches (higher rear)
      _boxC(a, 0, 0.17, 0.24, 0.34, 0.26, 0.44, fur);   // front body
      _boxC(a, 0, 0.16, 0.55, 0.28, 0.24, 0.26, fur);   // head
      _boxC(a, 0, 0.13, 0.72, 0.16, 0.14, 0.16, fur);   // snout
      _boxC(a, 0, 0.13, 0.81, 0.06, 0.06, 0.05, nose);  // nose
      _pyr(a, -0.1, 0.28, 0.5, 0.12, 0.06, 0.14, ear); _pyr(a, 0.1, 0.28, 0.5, 0.12, 0.06, 0.14, ear);
      _boxC(a, 0, 0.26, -0.5, 0.08, 0.08, 0.4, dk); _boxC(a, 0, 0.34, -0.78, 0.06, 0.06, 0.4, dk); // rising tail
      for (const lx of [-0.14, 0.14]) for (const lz of [0.32, -0.15]) _boxC(a, lx, 0.08, lz, 0.08, 0.16, 0.08, dk);
      this.models.rat = this._bake(a);
    }
    // ---------- bear ----------
    {
      const a = [], fur = hexRGB('#4e3a26'), dk = hexRGB('#3a2b1c'), snout = hexRGB('#6b5138'), nose = hexRGB('#1a120c');
      _boxC(a, 0, 0.6, -0.1, 0.9, 0.66, 1.1, fur);      // body
      _boxC(a, 0, 0.82, 0.3, 0.72, 0.4, 0.55, fur);     // shoulder hump
      _boxC(a, 0, 0.72, 0.78, 0.5, 0.44, 0.42, fur);    // head
      _boxC(a, 0, 0.64, 1.02, 0.28, 0.26, 0.28, snout); // snout
      _boxC(a, 0, 0.7, 1.16, 0.12, 0.1, 0.06, nose);    // nose
      _boxC(a, -0.18, 0.98, 0.7, 0.16, 0.16, 0.1, fur); _boxC(a, 0.18, 0.98, 0.7, 0.16, 0.16, 0.1, fur); // ears
      _boxC(a, 0, 0.55, -0.68, 0.16, 0.16, 0.14, fur);  // tail
      for (const lx of [-0.3, 0.3]) { _boxC(a, lx, 0.28, 0.5, 0.28, 0.56, 0.32, dk); _boxC(a, lx * 1.07, 0.28, -0.5, 0.3, 0.56, 0.34, dk); }
      this.models.bear = this._bake(a);
    }
    // ---------- green dragon ----------
    {
      const a = [], bd = hexRGB('#2f6b2a'), belly = hexRGB('#3f7f38'), horn = hexRGB('#cfc9a8'), nose = hexRGB('#20160e'), eye = hexRGB('#e8c020'), spike = hexRGB('#1f4a1a');
      _boxC(a, 0, 0.8, -0.15, 1.05, 0.82, 1.5, bd);     // torso
      _boxC(a, 0, 0.82, -0.75, 0.9, 0.75, 0.7, bd);     // rear haunch
      _boxC(a, 0, 0.82, 0.6, 0.95, 0.85, 0.7, bd);      // chest
      _boxC(a, 0, 0.45, 0.15, 0.82, 0.3, 1.3, belly);   // belly
      // neck (two angled segments) → head
      _boxM(a, M4.mul(M4.mul(M4.mul(M4.translate(0, 1.15, 0.8), M4.rotX(-0.6)), M4.translate(0, 0.4, 0)), M4.scale(0.5, 0.85, 0.5)), bd);
      _boxM(a, M4.mul(M4.mul(M4.mul(M4.translate(0, 1.6, 1.1), M4.rotX(-0.25)), M4.translate(0, 0.35, 0)), M4.scale(0.44, 0.6, 0.44)), bd);
      _boxC(a, 0, 1.98, 1.42, 0.5, 0.46, 0.55, bd);     // head
      _boxC(a, 0, 1.9, 1.78, 0.36, 0.3, 0.42, bd);      // snout
      _boxC(a, 0, 1.79, 1.74, 0.32, 0.14, 0.4, belly);  // jaw
      _boxC(a, 0, 1.9, 2.0, 0.34, 0.06, 0.06, nose);    // nostrils
      _boxC(a, -0.16, 2.05, 1.5, 0.09, 0.09, 0.09, eye); _boxC(a, 0.16, 2.05, 1.5, 0.09, 0.09, 0.09, eye);
      _pyr(a, -0.16, 2.2, 1.25, 0.14, 0.14, 0.42, horn); _pyr(a, 0.16, 2.2, 1.25, 0.14, 0.14, 0.42, horn); // horns
      // tapering tail lying back
      _boxC(a, 0, 0.65, -1.05, 0.6, 0.55, 0.6, bd);
      _boxC(a, 0, 0.5, -1.55, 0.42, 0.4, 0.6, bd);
      _boxC(a, 0, 0.38, -2.0, 0.26, 0.26, 0.6, bd);
      _boxC(a, 0, 0.32, -2.35, 0.14, 0.14, 0.5, bd);
      // legs
      for (const lx of [-0.44, 0.44]) { _boxC(a, lx, 0.3, 0.55, 0.3, 0.6, 0.34, bd); _boxC(a, lx * 1.02, 0.32, -0.55, 0.34, 0.64, 0.38, bd); }
      // back spikes along the spine
      for (let i = 0; i < 6; i++) { const z = 0.9 - i * 0.4; _pyr(a, 0, 1.18 - Math.max(0, i - 3) * 0.12, z, 0.14, 0.16, 0.26, spike); }
      this.models.dragon = this._bake(a);
    }
    // ---------- tree / oak / willow ----------
    {
      let a = []; _taperY(a, 0, 0, 0, 0.24, 0.24, 0.16, 0.16, 1.0, hexRGB('#6b4a2b'));
      _octa(a, 0, 1.65, 0, 1.7, 0.95, 0.7, hexRGB('#2f7024')); _octa(a, 0.15, 1.95, -0.1, 1.15, 0.7, 0.5, hexRGB('#357a28'));
      this.models.tree = this._bake(a);
      a = []; _taperY(a, 0, 0, 0, 0.32, 0.32, 0.22, 0.22, 1.15, hexRGB('#5a3d20'));
      _octa(a, 0, 1.9, 0, 2.15, 1.1, 0.8, hexRGB('#1e4517')); _octa(a, -0.2, 2.2, 0.15, 1.4, 0.8, 0.5, hexRGB('#24521c'));
      this.models.oak = this._bake(a);
      a = []; _taperY(a, 0, 0, 0, 0.22, 0.22, 0.15, 0.15, 1.25, hexRGB('#7a6444'));
      _octa(a, 0, 1.85, 0, 1.95, 0.7, 1.0, hexRGB('#5d8a3e')); _octa(a, 0, 1.55, 0, 1.55, 0.4, 1.15, hexRGB('#6d9a48'));
      this.models.willow = this._bake(a);
      // maple: broad and red in the leaf, so it reads apart from oak at a distance
      a = []; _taperY(a, 0, 0, 0, 0.30, 0.30, 0.20, 0.20, 1.2, hexRGB('#6a4726'));
      _octa(a, 0, 1.95, 0, 2.25, 1.05, 0.85, hexRGB('#a3441f')); _octa(a, 0.18, 2.25, -0.12, 1.45, 0.75, 0.5, hexRGB('#c2632a'));
      this.models.maple = this._bake(a);
      // yew: squat, near-black green, with a thick bole
      a = []; _taperY(a, 0, 0, 0, 0.46, 0.46, 0.30, 0.30, 1.0, hexRGB('#4a3524'));
      _octa(a, 0, 1.7, 0, 2.35, 0.9, 0.8, hexRGB('#14361a')); _octa(a, -0.15, 2.05, 0.1, 1.6, 0.7, 0.55, hexRGB('#1b4522'));
      this.models.yew = this._bake(a);
    }
    // ---------- fountain ----------
    {
      const a = [], st = hexRGB('#8f897c'), stD = hexRGB('#7c7669'), wat = hexRGB('#2f6fb0'), watHi = hexRGB('#3f86c8');
      _taperY(a, 0, 0, 0, 1.7, 1.7, 1.5, 1.5, 0.4, st);      // basin exterior
      _taperY(a, 0, 0.4, 0, 1.5, 1.5, 1.56, 1.56, 0.12, stD); // rim lip
      _boxC(a, 0, 0.42, 0, 1.3, 0.06, 1.3, wat);             // water surface
      _taperY(a, 0, 0.4, 0, 0.5, 0.5, 0.34, 0.34, 0.55, st);  // column
      _taperY(a, 0, 0.9, 0, 0.34, 0.34, 0.8, 0.8, 0.26, st);  // upper bowl
      _boxC(a, 0, 1.14, 0, 0.66, 0.05, 0.66, watHi);          // upper water
      _boxC(a, 0, 1.35, 0, 0.1, 0.4, 0.1, watHi);             // jet
      this.models.fountain = this._bake(a);
    }
    // ---------- statue ----------
    {
      const a = [], st = hexRGB('#9a938a'), base = hexRGB('#7f786e'), steel = hexRGB('#b9b6ad');
      _taperY(a, 0, 0, 0, 1.1, 1.1, 1.0, 1.0, 0.25, base);
      _taperY(a, 0, 0.25, 0, 0.9, 0.9, 0.8, 0.8, 0.3, base);
      _boxC(a, 0, 0.75, 0, 0.7, 0.5, 0.7, st);               // pedestal
      _boxC(a, -0.12, 1.3, 0, 0.16, 0.6, 0.18, st); _boxC(a, 0.12, 1.3, 0, 0.16, 0.6, 0.18, st); // legs
      _taperY(a, 0, 1.6, 0, 0.44, 0.26, 0.32, 0.22, 0.5, st); // torso
      _boxC(a, 0, 2.24, 0, 0.28, 0.3, 0.28, st);             // head
      _boxM(a, M4.mul(M4.mul(M4.mul(M4.translate(-0.28, 2.05, 0), M4.rotZ(0.25)), M4.translate(0, -0.28, 0)), M4.scale(0.13, 0.56, 0.13)), st); // left arm down
      _boxM(a, M4.mul(M4.mul(M4.mul(M4.translate(0.28, 2.1, 0), M4.rotZ(-2.5)), M4.translate(0, -0.3, 0)), M4.scale(0.13, 0.6, 0.13)), st);     // right arm raised
      _boxC(a, 0.6, 2.95, 0, 0.06, 0.72, 0.12, steel);       // sword blade
      _boxC(a, 0.6, 2.58, 0, 0.26, 0.08, 0.1, steel);        // crossguard
      this.models.statue = this._bake(a);
    }
    // ---------- well ----------
    {
      const a = [], st = hexRGB('#86807a'), wood = hexRGB('#6b4a2b'), roof = hexRGB('#7a4a2a'), dk = hexRGB('#20160e');
      _taperY(a, 0, 0, 0, 1.05, 1.05, 1.0, 1.0, 0.5, st);    // stone ring
      _boxC(a, 0, 0.48, 0, 0.7, 0.06, 0.7, dk);              // dark water/void
      _boxC(a, -0.44, 1.0, 0, 0.12, 1.1, 0.12, wood); _boxC(a, 0.44, 1.0, 0, 0.12, 1.1, 0.12, wood); // posts
      _boxC(a, 0, 1.5, 0, 1.0, 0.1, 0.12, wood);             // crossbar
      _boxC(a, 0, 1.28, 0, 0.2, 0.2, 0.2, wood);             // bucket
      _pyr(a, 0, 1.55, 0, 1.35, 1.1, 0.5, roof);             // roof
      this.models.well = this._bake(a);
    }
    // ---------- market stall ----------
    {
      const a = [], wood = hexRGB('#7a5330'), woodD = hexRGB('#5f3f24'), red = hexRGB('#c23a3a'), white = hexRGB('#e8e2d4');
      _boxC(a, 0, 0.45, 0, 1.2, 0.5, 0.9, wood);             // counter
      _boxC(a, 0, 0.72, 0, 1.28, 0.08, 0.98, woodD);         // counter top
      for (const px of [-0.56, 0.56]) for (const pz of [-0.4, 0.4]) _boxC(a, px, 1.05, pz, 0.1, 1.4, 0.1, woodD); // posts
      for (let i = 0; i < 5; i++) { const x = -0.48 + i * 0.24; // striped sloped awning
        _boxM(a, M4.mul(M4.mul(M4.translate(x, 1.55, 0), M4.rotX(-0.32)), M4.scale(0.24, 0.07, 1.2)), i % 2 ? red : white); }
      _boxC(a, -0.3, 0.82, 0.1, 0.14, 0.12, 0.14, hexRGB('#c0392b')); // goods (apples/cloth)
      _boxC(a, 0.02, 0.82, -0.1, 0.16, 0.14, 0.16, hexRGB('#4c6ea0'));
      _boxC(a, 0.34, 0.82, 0.12, 0.14, 0.1, 0.14, hexRGB('#d9a441'));
      this.models.stall = this._bake(a);
    }
    // ---------- campfire (flame flickers via model scale at draw time) ----------
    {
      const a = [], log = hexRGB('#4a3018'), red = hexRGB('#d8331a'), orange = hexRGB('#ff7a1e'), yellow = hexRGB('#ffd24a');
      _boxM(a, M4.mul(M4.mul(M4.translate(0, 0.07, 0), M4.rotY(0.6)), M4.scale(0.72, 0.12, 0.14)), log);
      _boxM(a, M4.mul(M4.mul(M4.translate(0, 0.07, 0), M4.rotY(-0.6)), M4.scale(0.72, 0.12, 0.14)), log);
      _pyr(a, 0, 0.12, 0, 0.52, 0.52, 0.5, red);
      _pyr(a, 0.04, 0.26, 0, 0.36, 0.36, 0.62, orange);
      _pyr(a, -0.03, 0.46, 0, 0.2, 0.2, 0.5, yellow);
      this.models.fire = this._bake(a);
    }
    // ---------- furnace (stone smelting furnace with a glowing mouth + chimney) ----------
    {
      const a = [], st = hexRGB('#726c60'), stD = hexRGB('#5b5649'), dark = hexRGB('#17130f'), glow = hexRGB('#ff7422');
      _taperY(a, 0, 0, 0, 1.05, 1.05, 0.9, 0.9, 1.15, st);     // body
      _boxC(a, 0, 1.22, 0, 1.1, 0.16, 1.1, stD);               // cap
      _boxC(a, 0.3, 1.55, -0.2, 0.34, 0.6, 0.34, st);          // chimney
      _boxC(a, 0, 0.42, 0.44, 0.56, 0.6, 0.18, dark);          // arched mouth (recess)
      _boxC(a, 0, 0.36, 0.5, 0.44, 0.42, 0.08, glow);          // fire glow
      _boxC(a, 0, 0.9, 0.46, 0.5, 0.28, 0.06, dark);           // upper vent
      this.models.furnace = this._bake(a);
    }
    // ---------- anvil (classic horned anvil on a wooden stump) ----------
    {
      const a = [], iron = hexRGB('#3a3a42'), ironD = hexRGB('#2a2a30'), wood = hexRGB('#6b4a2b');
      _taperY(a, 0, 0, 0, 0.5, 0.42, 0.44, 0.36, 0.3, wood);   // stump base
      _boxC(a, 0, 0.4, 0, 0.44, 0.16, 0.34, ironD);            // anvil foot
      _boxC(a, 0, 0.54, 0, 0.2, 0.16, 0.22, ironD);            // waist
      _boxC(a, 0, 0.68, 0, 0.72, 0.16, 0.34, iron);            // face/body
      _boxM(a, M4.mul(M4.mul(M4.translate(0.5, 0.68, 0), M4.rotZ(0.05)), M4.scale(0.34, 0.13, 0.2)), iron); // horn (tapered)
      _boxM(a, M4.mul(M4.translate(0.62, 0.68, 0), M4.scale(0.16, 0.09, 0.12)), iron);
      this.models.anvil = this._bake(a);
    }
    // ---------- cooking range (stone oven, hot plate, pot) ----------
    {
      const a = [], st = hexRGB('#57524a'), top = hexRGB('#2e2c28'), dark = hexRGB('#15120f'), glow = hexRGB('#ff7422'), pot = hexRGB('#2b2b30'), stew = hexRGB('#8a6a3a');
      _boxC(a, 0, 0.45, 0, 1.1, 0.9, 0.92, st);                // body
      _boxC(a, 0, 0.93, 0, 1.16, 0.1, 0.98, top);              // hot plate top
      _boxC(a, 0, 0.4, 0.48, 0.66, 0.52, 0.12, dark);          // oven mouth
      _boxC(a, 0, 0.34, 0.53, 0.54, 0.4, 0.06, glow);          // fire glow
      _taperY(a, -0.22, 0.98, 0, 0.34, 0.34, 0.4, 0.4, 0.26, pot); // pot
      _boxC(a, -0.22, 1.25, 0, 0.42, 0.04, 0.42, stew);        // stew surface
      _boxC(a, 0.3, 1.0, 0, 0.1, 0.14, 0.1, top);              // small chimney/vent
      this.models.range = this._bake(a);
    }
    // ---------- altar (church stone altar with cloth, candles & cross) ----------
    {
      const a = [], st = hexRGB('#c9c4b8'), stD = hexRGB('#a8a294'), cloth = hexRGB('#7a2530'), gold = hexRGB('#d8b24a'), flame = hexRGB('#ffcf5a'), wax = hexRGB('#efe7d2');
      _boxC(a, -0.42, 0.35, 0, 0.16, 0.7, 0.5, stD); _boxC(a, 0.42, 0.35, 0, 0.16, 0.7, 0.5, stD); // legs
      _boxC(a, 0, 0.52, 0.05, 0.9, 0.44, 0.5, cloth);          // cloth drape front
      _boxC(a, 0, 0.78, 0, 1.2, 0.14, 0.66, st);               // table top
      _boxC(a, -0.42, 0.94, -0.12, 0.08, 0.2, 0.08, wax); _boxC(a, -0.42, 1.07, -0.12, 0.05, 0.07, 0.05, flame); // candle L
      _boxC(a, 0.42, 0.94, -0.12, 0.08, 0.2, 0.08, wax); _boxC(a, 0.42, 1.07, -0.12, 0.05, 0.07, 0.05, flame);   // candle R
      _boxC(a, 0, 1.02, -0.12, 0.07, 0.36, 0.07, gold); _boxC(a, 0, 1.1, -0.12, 0.24, 0.07, 0.07, gold);         // cross
      this.models.altar = this._bake(a);
    }
    // ---------- ladder down: a dark hole in the ground with a ladder descending ----------
    {
      const a = [], rim = hexRGB('#6b6660'), rimD = hexRGB('#565248'), hole = hexRGB('#08090b'), wood = hexRGB('#6b4a2b'), rung = hexRGB('#553a1e');
      // raised stone rim around the mouth (reads as a lip you step over)
      _boxC(a, 0, 0.1, 0.44, 1.0, 0.2, 0.16, rim); _boxC(a, 0, 0.1, -0.44, 1.0, 0.2, 0.16, rimD);
      _boxC(a, 0.44, 0.1, 0, 0.16, 0.2, 0.72, rimD); _boxC(a, -0.44, 0.1, 0, 0.16, 0.2, 0.72, rim);
      // the dark opening: top sits just above the grass (hiding it); depth below is under the terrain
      _boxC(a, 0, -0.18, 0, 0.74, 0.5, 0.74, hole);
      // ladder rising out of the hole toward the near rim (so it clearly leads DOWN into the dark)
      const L = M4.mul(M4.translate(0, 0.03, 0.0), M4.rotX(0.5));
      _boxM(a, M4.mul(L, M4.mul(M4.translate(-0.17, 0.4, 0), M4.scale(0.06, 0.86, 0.06))), wood);
      _boxM(a, M4.mul(L, M4.mul(M4.translate(0.17, 0.4, 0), M4.scale(0.06, 0.86, 0.06))), wood);
      for (let k = 0; k < 4; k++) _boxM(a, M4.mul(L, M4.mul(M4.translate(0, 0.14 + k * 0.22, 0), M4.scale(0.42, 0.05, 0.05))), rung);
      this.models.ladder_down = this._bake(a);
    }
    // ---------- ladder up: an upright runged ladder to a hole in the ceiling ----------
    {
      const a = [], wood = hexRGB('#6b4a2b'), rung = hexRGB('#553a1e'), dark = hexRGB('#0a0a0d');
      _boxC(a, -0.22, 0.9, 0, 0.08, 1.8, 0.08, wood); _boxC(a, 0.22, 0.9, 0, 0.08, 1.8, 0.08, wood);
      for (let k = 0; k < 6; k++) _boxC(a, 0, 0.25 + k * 0.28, 0, 0.52, 0.06, 0.06, rung);
      _boxC(a, 0, 1.86, 0, 0.85, 0.14, 0.85, dark); // opening in the ceiling above
      this.models.ladder_up = this._bake(a);
    }
    // ---------- bank booth (wooden counter with a back panel & banner) ----------
    {
      const a = [], wood = hexRGB('#6b4a2b'), woodD = hexRGB('#553a1e'), top = hexRGB('#8a6538'), cloth = hexRGB('#37639c'), gold = hexRGB('#e2b93c');
      _boxC(a, 0, 0.45, 0.12, 1.0, 0.9, 0.5, wood);       // counter body
      _boxC(a, 0, 0.92, 0.12, 1.08, 0.12, 0.58, top);     // countertop
      _boxC(a, 0, 1.15, -0.28, 1.0, 1.5, 0.12, woodD);    // back panel
      _boxC(a, 0, 1.62, -0.27, 1.06, 0.5, 0.14, cloth);   // banner
      _boxC(a, -0.3, 1.62, -0.19, 0.18, 0.18, 0.03, gold); _boxC(a, 0.02, 1.62, -0.19, 0.18, 0.18, 0.03, gold); _boxC(a, 0.32, 1.62, -0.19, 0.18, 0.18, 0.03, gold); // gp coins on banner
      this.models.bank_booth = this._bake(a);
    }
    // ---------- castle tower (tapered stone shaft, battlements, pennant) ----------
    {
      const a = [], st = hexRGB('#8f897c'), stD = hexRGB('#726c60'), pole = hexRGB('#4a4238'), flag = hexRGB('#a83232'), slit = hexRGB('#1a1815');
      _taperY(a, 0, 0, 0, 1.2, 1.2, 1.02, 1.02, 2.4, st);   // shaft
      for (const by of [0.85, 1.65]) { _boxC(a, 0, by, 0, 1.24, 0.09, 1.24, stD); // storey string-courses + arrow-slit windows
        for (const [sx, sz, ax] of [[0, 0.6, 1], [0, -0.6, 1], [0.6, 0, 0], [-0.6, 0, 0]]) _boxC(a, sx, by + 0.22, sz, ax ? 0.12 : 0.04, 0.28, ax ? 0.04 : 0.12, slit); }
      _boxC(a, 0, 2.5, 0, 1.28, 0.2, 1.28, stD);            // battlement ring
      const m = 0.5;  // merlons around the top
      for (const [mx, mz] of [[-m, -m], [0, -m], [m, -m], [m, 0], [m, m], [0, m], [-m, m], [-m, 0]])
        _boxC(a, mx, 2.72, mz, 0.24, 0.26, 0.24, st);
      _boxC(a, 0, 2.72, 0, 0.7, 0.06, 0.7, hexRGB('#2b2824')); // dark inner top
      _boxC(a, 0, 3.1, 0, 0.06, 0.85, 0.06, pole);          // flag pole
      _boxM(a, M4.mul(M4.translate(0.22, 3.35, 0), M4.scale(0.36, 0.22, 0.02)), flag); // pennant
      this.models.tower = this._bake(a);
    }
    // ---------- lamppost (post + glowing lantern + cap) ----------
    {
      const a = [], metal = hexRGB('#2c2b28'), post = hexRGB('#3a382f'), glow = hexRGB('#ffcf6a'), cap = hexRGB('#23211d');
      _taperY(a, 0, 0, 0, 0.32, 0.32, 0.2, 0.2, 0.16, metal); // base
      _boxC(a, 0, 0.9, 0, 0.12, 1.5, 0.12, post);            // post
      _boxC(a, 0, 1.66, 0, 0.22, 0.34, 0.22, glow);          // glowing lantern glass
      for (const [cxo, czo] of [[-0.12, -0.12], [0.12, -0.12], [0.12, 0.12], [-0.12, 0.12]])
        _boxC(a, cxo, 1.66, czo, 0.05, 0.36, 0.05, metal);   // cage bars
      _pyr(a, 0, 1.84, 0, 0.34, 0.34, 0.2, cap);             // cap roof
      _boxC(a, 0, 2.06, 0, 0.07, 0.1, 0.07, cap);            // finial
      this.models.lamppost = this._bake(a);
    }
    // ---------- signpost (post + board with routes + arrow) ----------
    {
      const a = [], wood = hexRGB('#6b4a2b'), woodD = hexRGB('#4a3218'), board = hexRGB('#a5824f'), ink = hexRGB('#3a2a18');
      _boxC(a, 0, 0.6, 0, 0.14, 1.2, 0.14, wood);            // post
      _boxC(a, 0, 1.25, 0.05, 0.86, 0.42, 0.08, board);      // sign board
      _boxC(a, -0.06, 1.34, 0.1, 0.5, 0.05, 0.02, ink); _boxC(a, -0.1, 1.2, 0.1, 0.42, 0.05, 0.02, ink); // route text lines
      _boxM(a, M4.mul(M4.mul(M4.translate(0.46, 1.25, 0.05), M4.rotY(0.785)), M4.scale(0.26, 0.3, 0.09)), board); // pointer (small diamond)
      this.models.signpost = this._bake(a);
    }
    // ---------- windmill (stone tower, conical cap, four sails) ----------
    {
      const a = [], st = hexRGB('#9a8f76'), stD = hexRGB('#7f755f'), roof = hexRGB('#7a4a2a'), sail = hexRGB('#d8cdb0'), spar = hexRGB('#5a3d20');
      _taperY(a, 0, 0, 0, 1.35, 1.35, 0.95, 0.95, 2.4, st);
      for (let b = 0; b < 3; b++) _boxC(a, 0, 0.5 + b * 0.7, 0, 1.36 - b * 0.12, 0.05, 1.36 - b * 0.12, stD); // banding
      _pyr(a, 0, 2.4, 0, 1.2, 1.2, 0.6, roof);
      _boxC(a, 0, 1.95, 0.7, 0.18, 0.18, 0.18, spar);       // sail hub (front)
      for (let k = 0; k < 4; k++) { // four sails as a cross in the x-y plane
        let m = M4.mul(M4.translate(0, 1.95, 0.78), M4.rotZ(k * Math.PI / 2));
        m = M4.mul(m, M4.translate(0, 0.75, 0));
        _boxM(a, M4.mul(m, M4.scale(0.16, 1.4, 0.04)), spar);
        _boxM(a, M4.mul(m, M4.scale(0.42, 1.2, 0.03)), sail);
      }
      this.models.windmill = this._bake(a);
    }
    // ---------- wheat (a clump of golden stalks) ----------
    {
      const a = [], stalk = hexRGB('#b7972f'), head = hexRGB('#e6c74a');
      for (const [sx, sz] of [[-0.18, -0.1], [0.16, -0.16], [0, 0.14], [0.2, 0.12], [-0.14, 0.18]]) {
        _taperY(a, sx, 0, sz, 0.06, 0.06, 0.04, 0.04, 0.5, stalk);
        _boxC(a, sx, 0.58, sz, 0.11, 0.22, 0.11, head);
      }
      this.models.wheat = this._bake(a);
    }
    // ---------- fence (orientation-agnostic post + rail stubs) ----------
    {
      const a = [], wood = hexRGB('#7a5330'), woodD = hexRGB('#5f3f24');
      _boxC(a, 0, 0.42, 0, 0.14, 0.84, 0.14, woodD);         // post
      _boxC(a, 0, 0.58, 0, 1.02, 0.09, 0.08, wood); _boxC(a, 0, 0.32, 0, 1.02, 0.09, 0.08, wood); // rails along x
      _boxC(a, 0, 0.58, 0, 0.08, 0.09, 1.02, wood); _boxC(a, 0, 0.32, 0, 0.08, 0.09, 1.02, wood); // rails along z
      this.models.fence = this._bake(a);
    }
    // ---------- haystack ----------
    {
      const a = [], hay = hexRGB('#c9a94a'), hayD = hexRGB('#a98a34');
      _taperY(a, 0, 0, 0, 1.15, 1.15, 0.7, 0.7, 0.7, hay);
      _pyr(a, 0, 0.7, 0, 0.75, 0.75, 0.55, hayD);
      this.models.haystack = this._bake(a);
    }
    // ---------- chicken coop ----------
    {
      const a = [], wood = hexRGB('#6b4a2b'), woodD = hexRGB('#513518'), roof = hexRGB('#7a4a2a'), dark = hexRGB('#100c08');
      _boxC(a, 0, 0.4, 0, 1.0, 0.8, 0.8, wood);
      _boxC(a, 0, 0.3, 0.42, 0.36, 0.42, 0.06, dark);        // entrance hole
      for (let k = 0; k < 3; k++) _boxC(a, 0, 0.16 + k * 0.22, 0, 1.02, 0.04, 0.82, woodD); // plank lines
      _pyr(a, 0, 0.8, 0, 1.15, 0.95, 0.5, roof);
      this.models.chicken_coop = this._bake(a);
    }
    // ---------- hide tent (Hollow-folk hut) ----------
    {
      const a = [], hide = hexRGB('#6f5640'), hideD = hexRGB('#54402d'), pole = hexRGB('#3a2a1a'), dark = hexRGB('#0c0a08');
      _pyr(a, 0, 0, 0, 1.5, 1.5, 1.5, hide);
      _boxC(a, 0, 0.35, 0.62, 0.4, 0.7, 0.08, dark);         // entrance flap
      _boxM(a, M4.mul(M4.mul(M4.translate(0.4, 0.9, 0), M4.rotZ(0.4)), M4.scale(0.05, 1.5, 0.05)), pole); // lashed poles poking out
      _boxM(a, M4.mul(M4.mul(M4.translate(-0.4, 0.9, 0), M4.rotZ(-0.4)), M4.scale(0.05, 1.5, 0.05)), pole);
      _boxC(a, 0, 0.9, 0, 0.9, 0.05, 0.05, hideD);
      this.models.tribe_hut = this._bake(a);
    }
    // ---------- totem (carved pole of the Hollow-folk) ----------
    {
      const a = [], w1 = hexRGB('#8a5a36'), w2 = hexRGB('#6a4a2a'), red = hexRGB('#9a3a2a'), teal = hexRGB('#3a7a6a'), bone = hexRGB('#e2ddc8');
      _taperY(a, 0, 0, 0, 0.4, 0.4, 0.34, 0.34, 0.4, w2);
      _boxC(a, 0, 0.6, 0, 0.44, 0.4, 0.44, red);
      _boxC(a, 0, 0.62, 0.24, 0.12, 0.12, 0.06, bone); _boxC(a, -0.14, 0.66, 0.22, 0.06, 0.06, 0.05, bone); _boxC(a, 0.14, 0.66, 0.22, 0.06, 0.06, 0.05, bone); // face
      _boxC(a, 0, 1.0, 0, 0.44, 0.4, 0.44, teal);
      _boxC(a, 0, 1.4, 0, 0.44, 0.4, 0.44, w1);
      _boxM(a, M4.mul(M4.translate(0, 1.6, 0), M4.scale(1.0, 0.1, 0.1)), bone); // outstretched arms/wings
      _pyr(a, 0, 1.6, 0, 0.5, 0.5, 0.4, red);
      this.models.totem = this._bake(a);
    }
    // ---------- cow ----------
    {
      const a = [], hide = hexRGB('#eae6dc'), patch = hexRGB('#2e2a26'), snout = hexRGB('#d3a1a0'), horn = hexRGB('#d8cfae'), hoof = hexRGB('#3a3230');
      _boxC(a, 0, 0.62, -0.05, 0.72, 0.6, 1.2, hide);        // body
      _boxC(a, 0.18, 0.72, 0.1, 0.42, 0.42, 0.5, patch); _boxC(a, -0.22, 0.5, -0.35, 0.34, 0.34, 0.4, patch); // patches
      _boxC(a, 0, 0.66, 0.72, 0.42, 0.42, 0.4, hide);        // head
      _boxC(a, 0, 0.56, 0.96, 0.3, 0.26, 0.2, snout);        // snout
      _boxC(a, -0.16, 0.92, 0.68, 0.1, 0.14, 0.1, hide); _boxC(a, 0.16, 0.92, 0.68, 0.1, 0.14, 0.1, hide); // ears
      _boxC(a, -0.12, 0.98, 0.78, 0.06, 0.1, 0.12, horn); _boxC(a, 0.12, 0.98, 0.78, 0.06, 0.1, 0.12, horn); // horns
      _boxC(a, 0, 0.32, -0.5, 0.24, 0.18, 0.2, snout);       // udder
      for (const lx of [-0.26, 0.26]) for (const lz of [0.4, -0.5]) _boxC(a, lx, 0.16, lz, 0.16, 0.34, 0.16, hoof);
      this.models.cow = this._bake(a);
    }
    // ---------- chicken (small) ----------
    {
      const a = [], body = hexRGB('#f2efe6'), comb = hexRGB('#c83a2a'), beak = hexRGB('#e0a028'), leg = hexRGB('#d8a038');
      _boxC(a, 0, 0.28, -0.02, 0.28, 0.3, 0.36, body);       // body
      _boxC(a, 0, 0.48, 0.16, 0.2, 0.22, 0.2, body);         // head
      _boxC(a, 0, 0.6, 0.16, 0.14, 0.08, 0.1, comb);         // comb
      _boxC(a, 0, 0.46, 0.3, 0.1, 0.07, 0.1, beak);          // beak
      _boxC(a, 0, 0.34, -0.24, 0.18, 0.22, 0.12, body);      // tail
      for (const lx of [-0.08, 0.08]) _boxC(a, lx, 0.08, 0.02, 0.05, 0.16, 0.05, leg);
      this.models.chicken = this._bake(a);
    }
    // ---------- boulder (seals the Giants' Den passage) ----------
    {
      const a = [], rock = hexRGB('#6b665e'), rockD = hexRGB('#54504a'), rockH = hexRGB('#807a70');
      _octa(a, 0, 0.75, 0, 1.5, 0.65, 0.75, rock);
      _boxC(a, 0.34, 0.52, 0.24, 0.62, 0.62, 0.62, rockD);
      _boxC(a, -0.38, 0.42, -0.22, 0.5, 0.5, 0.5, rockH);
      _boxC(a, 0.1, 0.95, -0.3, 0.44, 0.44, 0.44, rockD);
      this.models.boulder = this._bake(a);
    }
    // ---------- ore rock ----------
    // Every seam used to be a single tinted cube. This is one sculpted outcrop shared by
    // all of them; drawScenery lays the ore's own colour over it as veins, so copper and
    // adamantite are the same stone with different metal showing through.
    {
      const a = [], st = hexRGB('#6e685e'), stD = hexRGB('#565049'), stH = hexRGB('#847d71');
      _octa(a, 0, 0.30, 0, 1.30, 0.30, 0.62, stD);            // rubble skirt at the base
      _octa(a, -0.05, 0.60, 0.02, 1.02, 0.52, 0.66, st);      // main mass
      _boxC(a, 0.30, 0.52, -0.24, 0.46, 0.52, 0.44, stH);     // a bright shoulder to catch the light
      _boxC(a, -0.32, 0.44, 0.26, 0.40, 0.44, 0.38, stD);
      _pyr(a, 0.02, 0.86, -0.04, 0.62, 0.58, 0.42, st);       // broken cap
      this.models.ore_rock = this._bake(a);
    }
    // a spent seam: the same outcrop, lower and duller, so it reads as "already mined"
    {
      const a = [], st = hexRGB('#5d584f'), stD = hexRGB('#4a463f');
      _octa(a, 0, 0.22, 0, 1.24, 0.24, 0.58, stD);
      _octa(a, -0.04, 0.42, 0.02, 0.90, 0.34, 0.60, st);
      _boxC(a, 0.26, 0.34, -0.20, 0.40, 0.30, 0.38, stD);
      this.models.ore_rock_spent = this._bake(a);
    }
    // ---------- shop signs (Chapman's Cross) ----------
    // A post, a hanging board, and a painted emblem so the trade reads from the street.
    {
      const post = hexRGB('#5a3d20'), rim = hexRGB('#3a2a16');
      // The board is painted in the trade's own colour. A carved emblem alone was not
      // enough — a sword and a bow both read as "vertical pale bar" from across a street.
      const frame = (a, boardCol) => {
        _boxC(a, -0.34, 1.05, 0, 0.11, 2.1, 0.11, post);          // post
        _boxC(a, 0.02, 1.98, 0, 0.78, 0.10, 0.11, post);          // arm out over the door
        _boxC(a, 0.30, 1.62, 0, 0.06, 0.62, 0.06, rim);           // chain
        _boxC(a, 0.30, 1.14, -0.04, 0.94, 0.74, 0.04, rim);       // border behind
        _boxC(a, 0.30, 1.14, 0, 0.86, 0.66, 0.07, hexRGB(boardCol));
      };
      const mk = (name, boardCol, emblem) => { const a = []; frame(a, boardCol); emblem(a); this.models[name] = this._bake(a); };
      const E = 0.055;                                            // emblem sits proud of the board
      mk('sign_weapon', '#7d3a30', a => {                         // a sword, point up, on rust red
        const st = hexRGB('#e8eef6'), gd = hexRGB('#e0b23c');
        _boxC(a, 0.30, 1.30, E, 0.10, 0.30, 0.05, st);            // blade
        _boxC(a, 0.30, 1.46, E, 0.05, 0.10, 0.05, st);            // point
        _boxC(a, 0.30, 1.10, E, 0.52, 0.09, 0.05, gd);            // a wide crossguard reads instantly
        _boxC(a, 0.30, 0.98, E, 0.09, 0.18, 0.05, gd);            // grip
        _boxC(a, 0.30, 0.87, E, 0.16, 0.09, 0.05, gd);            // pommel
      });
      mk('sign_armour', '#46525e', a => {                         // a helm on iron grey
        const st = hexRGB('#eef3f8'), dk = hexRGB('#96a2ae');
        _boxC(a, 0.30, 1.24, E, 0.50, 0.34, 0.05, st);            // dome
        _boxC(a, 0.30, 1.02, E, 0.58, 0.11, 0.05, dk);            // brow band
        _boxC(a, 0.30, 0.90, E, 0.10, 0.22, 0.05, st);            // nose guard
      });
      mk('sign_ranged', '#2f5a34', a => {                         // a drawn bow on forest green
        const wd = hexRGB('#e8c27a'), sr = hexRGB('#ffffff');
        // stepped limbs curve away from the string, so it reads as a bow not a stick
        _boxC(a, 0.10, 1.14, E, 0.10, 0.30, 0.05, wd);
        _boxC(a, 0.16, 1.34, E, 0.10, 0.16, 0.05, wd);
        _boxC(a, 0.16, 0.94, E, 0.10, 0.16, 0.05, wd);
        _boxC(a, 0.28, 1.44, E, 0.16, 0.09, 0.05, wd);
        _boxC(a, 0.28, 0.84, E, 0.16, 0.09, 0.05, wd);
        _boxC(a, 0.36, 1.14, E, 0.05, 0.62, 0.04, sr);            // the string, dead straight
        _boxC(a, 0.24, 1.14, E + 0.01, 0.34, 0.05, 0.04, sr);     // a nocked arrow across it
      });
      mk('sign_magic', '#2c3578', a => {                          // a gold star on deep blue
        const gl = hexRGB('#ffdc5e');
        _boxC(a, 0.30, 1.14, E, 0.52, 0.13, 0.05, gl);
        _boxC(a, 0.30, 1.14, E, 0.13, 0.52, 0.05, gl);
        _boxC(a, 0.30, 1.14, E, 0.26, 0.26, 0.05, gl);
      });
    }
    // ---------- Mining Guild door (stone frame, timber doors, pick emblem) ----------
    {
      const a = [], stone = hexRGB('#8f897c'), stoneD = hexRGB('#736d60'), wood = hexRGB('#5a3d20'), gold = hexRGB('#cba63c');
      _boxC(a, -0.5, 0.9, 0, 0.18, 1.8, 0.34, stone); _boxC(a, 0.5, 0.9, 0, 0.18, 1.8, 0.34, stone);
      _boxC(a, 0, 1.86, 0, 1.18, 0.22, 0.34, stoneD);                     // lintel
      _boxC(a, -0.21, 0.85, 0.1, 0.38, 1.62, 0.1, wood); _boxC(a, 0.21, 0.85, 0.1, 0.38, 1.62, 0.1, wood); // doors
      _boxC(a, 0, 0.95, 0.17, 0.08, 0.44, 0.05, gold); _boxC(a, 0, 1.18, 0.17, 0.3, 0.1, 0.05, gold);      // pickaxe emblem
      this.models.guild_door = this._bake(a);
    }
    // ---------- town rampart (tall crenellated wall, symmetric so it works either axis) ----------
    {
      const a = [], st = hexRGB('#8f897c'), stD = hexRGB('#726c60'), slit = hexRGB('#1c1a17');
      _taperY(a, 0, 0, 0, 1.0, 1.0, 0.92, 0.92, 2.0, st);    // main wall body
      _boxC(a, 0, 1.0, 0, 1.02, 0.08, 1.02, stD);            // mid string course (reads as a storey line)
      _boxC(a, 0, 2.02, 0, 1.04, 0.14, 1.04, stD);           // parapet walkway lip
      for (const [sx, sz] of [[0, 0.47], [0, -0.47], [0.47, 0], [-0.47, 0]]) _boxC(a, sx, 1.35, sz, sz ? 0.14 : 0.05, 0.4, sz ? 0.05 : 0.14, slit); // arrow slits
      const m = 0.36;                                        // crenellations (alternating merlons)
      for (const [mx, mz] of [[-m, -m], [m, -m], [m, m], [-m, m], [0, 0.48], [0, -0.48], [0.48, 0], [-0.48, 0]])
        _boxC(a, mx, 2.24, mz, 0.24, 0.3, 0.24, st);
      this.models.rampart = this._bake(a);
    }
    // ---------- gatehouse (taller gate tower with an arch + banner, flanks the open gate) ----------
    {
      const a = [], st = hexRGB('#8f897c'), stD = hexRGB('#726c60'), dark = hexRGB('#161410'), cloth = hexRGB('#9a3230'), pole = hexRGB('#4a4238');
      _taperY(a, 0, 0, 0, 1.04, 1.04, 0.96, 0.96, 2.7, st);  // shaft (a storey taller than the rampart)
      _boxC(a, 0, 1.0, 0, 1.06, 0.08, 1.06, stD); _boxC(a, 0, 1.9, 0, 1.06, 0.08, 1.06, stD); // two storey lines
      _boxC(a, 0, 0.55, 0.49, 0.42, 1.0, 0.06, dark);        // arched gateway opening (front)
      _boxC(a, 0, 1.15, 0.49, 0.16, 0.16, 0.06, dark); _boxC(a, 0, 1.55, 0.49, 0.16, 0.16, 0.06, dark); // upper windows
      _boxC(a, 0, 2.78, 0, 1.12, 0.16, 1.12, stD);           // parapet
      const m = 0.4;
      for (const [mx, mz] of [[-m, -m], [m, -m], [m, m], [-m, m]]) _boxC(a, mx, 3.0, mz, 0.26, 0.32, 0.26, st); // corner merlons
      _boxC(a, 0, 3.3, -0.02, 0.05, 0.7, 0.05, pole);        // flagpole
      _boxM(a, M4.mul(M4.translate(0.2, 3.5, -0.02), M4.scale(0.34, 0.22, 0.02)), cloth); // banner
      this.models.gatehouse = this._bake(a);
    }
    // ---------- shop counter (timber counter with a top ledge and a goods crate) ----------
    {
      const a = [], wood = hexRGB('#7a5330'), woodD = hexRGB('#5a3d20'), top = hexRGB('#9a723f'), crate = hexRGB('#8a6a40'), cd = hexRGB('#6a4e2c');
      _boxC(a, 0, 0.42, 0, 0.96, 0.84, 0.7, wood);           // counter body
      for (let k = 0; k < 3; k++) _boxC(a, 0, 0.2 + k * 0.24, 0.36, 0.98, 0.05, 0.04, woodD); // front plank lines
      _boxC(a, 0, 0.9, 0, 1.02, 0.12, 0.78, top);            // counter top ledge
      _boxC(a, -0.24, 1.06, -0.02, 0.34, 0.22, 0.34, crate); // a crate of goods on the counter
      _boxC(a, -0.24, 1.06, -0.02, 0.36, 0.06, 0.36, cd);
      this.models.shop_counter = this._bake(a);
    }
    // ---------- shelves (stocked shop shelving) ----------
    {
      const a = [], frame = hexRGB('#5a3d20'), board = hexRGB('#7a5330');
      const goods = ['#a83232', '#37639c', '#c9a24a', '#3a7a5a', '#8a4fa0', '#c07a30'].map(hexRGB);
      _boxC(a, 0, 0.9, -0.34, 1.0, 1.8, 0.1, frame);         // back panel
      _boxC(a, -0.46, 0.9, 0, 0.08, 1.8, 0.6, frame); _boxC(a, 0.46, 0.9, 0, 0.08, 1.8, 0.6, frame); // side posts
      for (let s = 0; s < 4; s++) {
        const sy = 0.4 + s * 0.44;
        _boxC(a, 0, sy, 0, 0.9, 0.06, 0.5, board);           // shelf board
        for (let g = 0; g < 4; g++) _boxC(a, -0.33 + g * 0.22, sy + 0.16, 0.02, 0.13, 0.24, 0.13, goods[(s * 4 + g) % goods.length]); // wares
      }
      this.models.shelves = this._bake(a);
    }
    // ---------- stained glass window (arched frame + coloured panes, set in a wall slab) ----------
    {
      const a = [], st = hexRGB('#8f897c'), stD = hexRGB('#726c60');
      const panes = ['#c23a3a', '#3a6ec2', '#e0c23a', '#3aa06a', '#8a4fb0'].map(hexRGB);
      _taperY(a, 0, 0, 0, 1.0, 0.94, 0.92, 0.94, 2.0, st);   // full-depth wall slab, sits in the wall line
      _boxC(a, 0, 2.02, 0, 1.02, 0.14, 1.0, stD);            // top course
      // coloured panes shown on BOTH faces (window seen from town side and outside)
      for (const face of [0.49, -0.49]) {
        for (let r = 0; r < 4; r++) for (let cix = 0; cix < 3; cix++)
          _boxC(a, -0.28 + cix * 0.28, 0.6 + r * 0.36, face, 0.24, 0.3, 0.03, panes[(r * 3 + cix) % panes.length]);
        _boxC(a, 0, 1.9, face, 0.9, 0.34, 0.03, panes[0]);   // arched top light
      }
      this.models.stained_glass = this._bake(a);
    }
};
