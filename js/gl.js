'use strict';
// ---------------------------------------------------------------------------
// GLRenderer — a raw-WebGL 3D renderer targeting the RS2-2004 low-poly look.
// Same public interface as CanvasRenderer (init/draw/pickAll + yaw/pitch/dist/
// canvas), so it drops into the existing game loop. Game/world/UI/net untouched.
// ---------------------------------------------------------------------------

// Mesh/texture toolkit (M4, hexRGB, _boxC, _taperY, …) lives in gl-lib.js (loaded first).

const GLRenderer = {
  canvas: null, gl: null, W: 0, H: 0,
  yaw: 2.35, pitch: 0.62, dist: 13,
  tilePicks: [], clickables: [], _fogS: 14, _fogR: 11,
  _terrain: [null, null], _water: [null, null], _facing: new Map(),

  supported() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); }
    catch (e) { return false; }
  },

  init() {
    this.canvas = document.getElementById('game');
    const gl = this.gl = this.canvas.getContext('webgl', { antialias: true }) || this.canvas.getContext('experimental-webgl');
    // overlay 2D canvas for in-world HUD (bars, splats, names, floaters, bubbles)
    this.overlay = document.createElement('canvas');
    this.overlay.id = 'gl-overlay';
    this.overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1';
    this.canvas.parentNode.insertBefore(this.overlay, this.canvas.nextSibling);
    this.octx = this.overlay.getContext('2d');

    this.prog = this._program(GLR_VS, GLR_FS);
    this.loc = {};
    for (const n of ['a_pos', 'a_norm', 'a_col', 'a_uv']) this.loc[n] = gl.getAttribLocation(this.prog, n);
    for (const n of ['u_viewProj', 'u_model', 'u_tint', 'u_lightDir', 'u_ambient', 'u_camPos', 'u_fogStart', 'u_fogRange', 'u_fogColor', 'u_tex', 'u_useTex', 'u_uvOff', 'u_uvScale', 'u_alpha'])
      this.loc[n] = gl.getUniformLocation(this.prog, n);

    // procedural material atlas + tiling water texture (generated on a 2D canvas)
    this._atlas = this._upload(_buildAtlasCanvas(), false);
    this._waterTex = this._upload(_buildWaterCanvas(), true);

    // flat disc for soft blob shadows (triangle fan, 9-float: pos/norm-up/white)
    { const seg = 14, d = [];
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        d.push(0, 0, 0, 0, 1, 0, 1, 1, 1);
        d.push(Math.cos(a0), 0, Math.sin(a0), 0, 1, 0, 1, 1, 1);
        d.push(Math.cos(a1), 0, Math.sin(a1), 0, 1, 0, 1, 1, 1);
      }
      this.discBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.discBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW); this.discCount = seg * 3;
    }

    // unit box buffer (36 verts, pos/norm/col=white/uv per face) — 11 floats/vert
    this.boxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this._boxGeo(), gl.STATIC_DRAW);
    this.boxCount = 36;

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.02, 0.02, 0.03, 1);

    this.models = {};
    this._buildModels();

    const rs = () => {
      this.W = this.canvas.width = this.overlay.width = window.innerWidth;
      this.H = this.canvas.height = this.overlay.height = window.innerHeight;
    };
    window.addEventListener('resize', rs);
    rs();
  },

  _program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    return p;
  },

  _upload(canvas, repeat) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    const w = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  },

  _boxGeo() {
    const faces = [
      { n: [1, 0, 0], v: [[.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [.5, -.5, .5]] },
      { n: [-1, 0, 0], v: [[-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-.5, -.5, -.5]] },
      { n: [0, 1, 0], v: [[-.5, .5, -.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5]] },
      { n: [0, -1, 0], v: [[-.5, -.5, .5], [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5]] },
      { n: [0, 0, 1], v: [[.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5], [-.5, -.5, .5]] },
      { n: [0, 0, -1], v: [[-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [.5, -.5, -.5]] }
    ];
    const uvs = [[0, 1], [1, 1], [1, 0], [0, 0]]; // p,q,r,s → per-face 0..1
    const a = [];
    for (const f of faces) {
      const [p, q, r, s] = f.v, [up, uq, ur, us] = uvs;
      const verts = [[p, up], [q, uq], [r, ur], [p, up], [r, ur], [s, us]];
      for (const [v, uv] of verts) a.push(v[0], v[1], v[2], f.n[0], f.n[1], f.n[2], 1, 1, 1, uv[0], uv[1]);
    }
    return new Float32Array(a);
  },

  // ---- terrain mesh (built once per layer) ----
  tileBaseColor(l, x, z) {
    const t = World.L[l].tile[x][z];
    switch (t) {
      case 'grass': { const v = ((x * 13 + z * 7) % 4) * 0.02; return [0.24 + v, 0.42 + v, 0.19]; }
      case 'sand': return [0.7, 0.64, 0.43];
      case 'rock': return [0.43, 0.41, 0.37];
      case 'path': return [0.6, 0.54, 0.39];
      case 'road': { const v = ((x * 7 + z * 5) % 3) * 0.03; return [0.54 + v, 0.51 + v, 0.47 + v]; }
      case 'floor': return [0.54, 0.43, 0.27];
      case 'dfloor': { const v = ((x * 11 + z * 5) % 3) * 0.02; return [0.33 + v, 0.31 + v, 0.28 + v]; }
      case 'dwall': return [0.15, 0.14, 0.12];
      case 'water': return [0.16, 0.31, 0.55];
      case 'marsh': { const v = ((x * 13 + z * 7) % 4) * 0.015; return [0.29 + v, 0.35 + v, 0.29]; }
      default: return [0.3, 0.5, 0.2];
    }
  },

  // absolute atlas UV for cell `cell` at local (u,v)∈[0,1], inset to avoid bleed
  _cellUV(cell, u, v) {
    const CS = 0.25, IN = 0.5 / 512, u0 = (cell % 4) * CS, v0 = ((cell / 4) | 0) * CS;
    return [u0 + IN + u * (CS - 2 * IN), v0 + IN + v * (CS - 2 * IN)];
  },

  buildTerrain(l) {
    const gl = this.gl, S = World.SIZE, h = World.L[l].h, tile = World.L[l].tile;
    const a = [], wa = [];   // textured terrain + water (separate animated pass)
    const CELL = ATLAS_CELL, ROT = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const pushV = (arr, x, y, z, nx, ny, nz, c, u, v) => arr.push(x, y, z, nx, ny, nz, c[0], c[1], c[2], u, v);
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
      const t = tile[x][z]; if (t === 'void') continue;
      const y00 = h[x][z], y10 = h[x + 1][z], y11 = h[x + 1][z + 1], y01 = h[x][z + 1];
      const ux = 1, uy = y10 - y00, vy = y01 - y00, vz = 1;
      let nx = uy * vz, ny = -(ux * vz), nz = ux * vy;  // (u×v) with uz=vx=0
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const P = [[x, y00, z], [x + 1, y10, z], [x + 1, y11, z + 1], [x, y01, z + 1]];
      if (t === 'water') {
        const c = [1, 1, 1], W = 0.34;  // world-space UV → seamless across tiles when scrolled
        const uw = i => [P[i][0] * W, P[i][2] * W];
        for (const i of [0, 1, 2, 0, 2, 3]) pushV(wa, P[i][0], P[i][1], P[i][2], 0, 1, 0, c, uw(i)[0], uw(i)[1]);
        continue;
      }
      const cell = CELL[t] !== undefined ? CELL[t] : CELL.grass;
      const b = 0.84 + ((x * 13 + z * 7) % 5) * 0.04, c = [b, b, b];  // subtle per-tile brightness
      const r = (x * 3 + z * 5) & 3;                                  // rotate UVs to hide the grid
      const uv = i => this._cellUV(cell, ROT[(i + r) & 3][0], ROT[(i + r) & 3][1]);
      for (const i of [0, 1, 2, 0, 2, 3]) { const u = uv(i); pushV(a, P[i][0], P[i][1], P[i][2], nx, ny, nz, c, u[0], u[1]); }
    }
    const mk = arr => { const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); return { buf, count: arr.length / 11 }; };
    this._terrain[l] = mk(a);
    this._water[l] = mk(wa);
  },

  // textured geometry (terrain, water, box) → 11-float stride with UVs
  _bind11() {
    const gl = this.gl, st = 11 * 4;
    gl.vertexAttribPointer(this.loc.a_pos, 3, gl.FLOAT, false, st, 0); gl.enableVertexAttribArray(this.loc.a_pos);
    gl.vertexAttribPointer(this.loc.a_norm, 3, gl.FLOAT, false, st, 12); gl.enableVertexAttribArray(this.loc.a_norm);
    gl.vertexAttribPointer(this.loc.a_col, 3, gl.FLOAT, false, st, 24); gl.enableVertexAttribArray(this.loc.a_col);
    if (this.loc.a_uv >= 0) { gl.vertexAttribPointer(this.loc.a_uv, 2, gl.FLOAT, false, st, 36); gl.enableVertexAttribArray(this.loc.a_uv); }
  },
  // flat-shaded models → 9-float stride, no UVs (a_uv disabled, u_useTex 0)
  _bind9() {
    const gl = this.gl, st = 9 * 4;
    gl.vertexAttribPointer(this.loc.a_pos, 3, gl.FLOAT, false, st, 0); gl.enableVertexAttribArray(this.loc.a_pos);
    gl.vertexAttribPointer(this.loc.a_norm, 3, gl.FLOAT, false, st, 12); gl.enableVertexAttribArray(this.loc.a_norm);
    gl.vertexAttribPointer(this.loc.a_col, 3, gl.FLOAT, false, st, 24); gl.enableVertexAttribArray(this.loc.a_col);
    if (this.loc.a_uv >= 0) gl.disableVertexAttribArray(this.loc.a_uv);
  },

  // box from the unit-box buffer. Pass an atlas cell index to texture it (walls,
  // wood); omit for flat-coloured boxes (human limbs, ground items, projectiles).
  box(model, color, cell) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuf);
    this._bind11();
    gl.uniformMatrix4fv(this.loc.u_model, false, model);
    gl.uniform3fv(this.loc.u_tint, color);
    if (cell !== undefined) {
      gl.uniform1f(this.loc.u_useTex, 1);
      const o = this._cellUV(cell, 0, 0);
      gl.uniform2f(this.loc.u_uvOff, o[0], o[1]);
      gl.uniform2f(this.loc.u_uvScale, 0.25 - 1 / 512, 0.25 - 1 / 512);
      gl.bindTexture(gl.TEXTURE_2D, this._atlas);
    } else {
      gl.uniform1f(this.loc.u_useTex, 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, this.boxCount);
  },

  _bake(a) {
    const gl = this.gl, buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STATIC_DRAW);
    return { buf, count: a.length / 9 };
  },

  // draw a baked flat-shaded model at `base` (its own colours; no texture).
  // `tint` multiplies those colours — that's how one wall mesh serves every town.
  drawModel(name, base, tint) {
    const m = this.models[name]; if (!m) return false;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    this._bind9();
    gl.uniform1f(this.loc.u_useTex, 0);
    gl.uniformMatrix4fv(this.loc.u_model, false, base);
    gl.uniform3fv(this.loc.u_tint, tint || [1, 1, 1]);
    gl.drawArrays(gl.TRIANGLES, 0, m.count);
    return true;
  },

  // ---- settlement building materials ----
  // Each town is built of one material so it reads as its own place at a glance:
  // Lumbridge warm timber, Aldervale cold northern granite, Willowmere dark
  // stained wood, Southmarch southern sandstone.
  MATERIALS: {
    timber:     { cell: 'wood',  tint: [1.06, 0.90, 0.66] },
    northstone: { cell: 'stone', tint: [0.78, 0.84, 0.94] },
    darkwood:   { cell: 'wood',  tint: [0.58, 0.50, 0.46] },
    sandstone:  { cell: 'stone', tint: [1.12, 0.94, 0.62] },
    // Mourncross: salt-scoured masonry with the warmth pulled out of it. Slightly
    // blue-shifted and desaturated so the whole town reads cold beside Lumbridge.
    pale:       { cell: 'pale',  tint: [0.88, 0.94, 0.96] },
    // the town's lamps still burn, but with nothing warm left in them
    coldlamp:   { cell: 'metal', tint: [0.52, 0.86, 1.18] }
  },
  matOf(s) { return (s && s.mat && this.MATERIALS[s.mat]) || null; },

  // _buildModels() is defined in gl-models.js as GLRenderer._buildModels (loaded after this file).

  // animated dragon wing membrane (flap over its baked body)
  _dragonWing(base, side, flap) {
    let m = M4.mul(base, M4.translate(0.12 * side, 1.35, -0.15));
    m = M4.mul(m, M4.rotZ(-side * flap));
    m = M4.mul(m, M4.translate(0.8 * side, 0, 0));
    m = M4.mul(m, M4.scale(1.5, 0.06, 1.15));
    this.box(m, hexRGB('#2b5a24'));
  },

  // ---- world→screen projection (for picking + overlay), matches the GPU matrices ----
  project(wx, wy, wz) {
    const m = this._vp;
    const cx = m[0] * wx + m[4] * wy + m[8] * wz + m[12];
    const cy = m[1] * wx + m[5] * wy + m[9] * wz + m[13];
    const cw = m[3] * wx + m[7] * wy + m[11] * wz + m[15];
    if (cw <= 0.05) return null;
    return { x: (cx / cw * 0.5 + 0.5) * this.W, y: (1 - (cy / cw * 0.5 + 0.5)) * this.H, d: cw };
  },
  fogA(d) { return Math.max(0, Math.min(1, (d - this._fogS) / this._fogR)); },

  pickAll(mx, my) {
    const ents = this.clickables.filter(c => mx >= c.x0 && mx <= c.x1 && my >= c.y0 && my <= c.y1)
      .sort((a, b) => a.d - b.d).slice(0, 6).map(c => c.ref);   // 6, so a small target isn't dropped behind big scenery
    let tile = null;
    for (let i = this.tilePicks.length - 1; i >= 0; i--) {
      if (pointInQuad(mx, my, this.tilePicks[i])) { tile = { kind: 'tile', x: this.tilePicks[i].x, z: this.tilePicks[i].z }; break; }
    }
    return { ents, tile };
  },

  facing(key, x, z) {
    let f = this._facing.get(key);
    if (!f) { f = { x, z, a: this.yaw }; this._facing.set(key, f); }
    const dx = x - f.x, dz = z - f.z;
    if (dx * dx + dz * dz > 0.0004) { f.a = Math.atan2(dx, dz); f.x = x; f.z = z; }
    return f.a;
  },

  // ---- main draw ----
  draw(G, now) {
    const gl = this.gl, P = G.player, l = P.layer;
    if (!this._terrain[l]) this.buildTerrain(l);
    // Fog is measured from the camera, so it must scale with zoom — otherwise
    // zooming out pushes the whole scene past a fixed fog wall and it goes black.
    const zoom = this.dist;
    if (l === 1) {                                   // dungeon: stay moody, but not pitch black
      this._fogS = zoom * 0.6 + 6; this._fogR = zoom * 0.9 + 10;
      this._fog = [0.05, 0.05, 0.07]; this._amb = 0.55;
    } else {                                         // surface: bright daylight, distant haze
      this._fogS = zoom + 14; this._fogR = zoom * 1.5 + 24;
      this._fog = [0.55, 0.66, 0.78]; this._amb = 0.74;
    }

    const py = World.heightAt(l, P.x, P.z);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const tx = P.x, ty = py + 0.6, tz = P.z;
    const ex = tx + Math.sin(this.yaw) * this.dist * cp, ey = ty + this.dist * sp, ez = tz + Math.cos(this.yaw) * this.dist * cp;
    this._camPos = [ex, ey, ez];
    const far = this._fogS + this._fogR + 20;        // keep the far plane past the fog so nothing hard-clips
    const proj = M4.perspective(0.95, this.W / this.H, 0.3, far);
    const view = M4.lookAt(ex, ey, ez, tx, ty, tz, 0, 1, 0);
    this._vp = M4.mul(proj, view);

    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(this._fog[0], this._fog[1], this._fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.u_viewProj, false, this._vp);
    gl.uniform3fv(this.loc.u_camPos, this._camPos);
    gl.uniform3fv(this.loc.u_lightDir, [0.5, 0.9, 0.35]);
    gl.uniform1f(this.loc.u_ambient, this._amb);
    gl.uniform3fv(this.loc.u_fogColor, this._fog);
    gl.uniform1f(this.loc.u_fogStart, this._fogS);
    gl.uniform1f(this.loc.u_fogRange, this._fogR);
    gl.uniform1f(this.loc.u_alpha, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.loc.u_tex, 0);

    // textured terrain (samples the material atlas directly via baked UVs)
    gl.bindTexture(gl.TEXTURE_2D, this._atlas);
    gl.uniform1f(this.loc.u_useTex, 1);
    gl.uniform2f(this.loc.u_uvOff, 0, 0);
    gl.uniform2f(this.loc.u_uvScale, 1, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._terrain[l].buf);
    this._bind11();
    gl.uniformMatrix4fv(this.loc.u_model, false, M4.ident());
    gl.uniform3fv(this.loc.u_tint, [1, 1, 1]);
    gl.drawArrays(gl.TRIANGLES, 0, this._terrain[l].count);

    // animated water — scroll a tiling water texture for a shimmer
    if (this._water[l] && this._water[l].count) {
      gl.bindTexture(gl.TEXTURE_2D, this._waterTex);
      gl.uniform1f(this.loc.u_useTex, 1);
      const t = now * 0.001;
      gl.uniform2f(this.loc.u_uvOff, Math.sin(t * 0.5) * 0.05 + t * 0.03, t * 0.045);
      gl.uniform2f(this.loc.u_uvScale, 1, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._water[l].buf);
      this._bind11();
      gl.uniformMatrix4fv(this.loc.u_model, false, M4.ident());
      gl.uniform3fv(this.loc.u_tint, [1, 1, 1]);
      gl.drawArrays(gl.TRIANGLES, 0, this._water[l].count);
      gl.bindTexture(gl.TEXTURE_2D, this._atlas);   // restore atlas for textured scenery
      gl.uniform2f(this.loc.u_uvOff, 0, 0);
    }

    // entities use the unit box buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuf);
    this._bind11();

    this.clickables = [];
    // draw radius tracks zoom so distant scenery/entities stay visible when zoomed out
    const R = Math.round(24 + this.dist * 1.1), ptx = Math.floor(P.x), ptz = Math.floor(P.z);
    const inR = (x, z) => Math.abs(x - ptx) <= R && Math.abs(z - ptz) <= R;

    this._drawShadows(G, l, inR);

    for (const s of World.L[l].scenery.values()) {
      if (!inR(s.x, s.z)) continue;
      this.drawScenery(s, l, now);
    }
    for (const g of G.ground) {
      if (g.layer !== l || !inR(g.x, g.z)) continue;
      const y = World.heightAt(l, g.x + 0.5, g.z + 0.5);
      this.box(M4.mul(M4.translate(g.x + 0.5, y + 0.15, g.z + 0.5), M4.scale(0.28, 0.28, 0.28)), hexRGB('#d0b040'));
      this.addClick(g.x + 0.5, y, g.z + 0.5, 0.32, 0.5, { kind: 'ground', g });
    }
    for (const n of G.npcs) {
      if (n.deadUntil || n.layer !== l) continue;
      const fx = n.fx !== undefined ? n.fx : n.x + 0.5, fz = n.fz !== undefined ? n.fz : n.z + 0.5;
      if (!inR(Math.floor(fx), Math.floor(fz))) continue;
      this.drawCreature(n, fx, fz, l, now);
    }
    for (const q of (G.players || [])) {
      if (q.layer !== l || !inR(Math.floor(q.x), Math.floor(q.z))) continue;
      this.drawHuman(q.x, q.z, l, { skin: '#c8956c', shirt: '#4c6ea0', legs: '#5a5060' }, q.moving, now, -1, q, null);
    }
    // local player — look reflects equipped weapon/armour/shield/helm
    const swing = now < (P.swingUntil || 0) ? 1 - (P.swingUntil - now) / 350 : -1;
    this.drawHuman(P.x, P.z, l, this.equipLook(G), P.moving, now, swing, P, null);

    // projectiles as small boxes
    for (const pr of G.projectiles) {
      if (pr.layer !== l) continue;
      const k = Math.min(1, (now - pr.t0) / pr.dur);
      const wx = pr.fx + (pr.tx - pr.fx) * k, wz = pr.fz + (pr.tz - pr.fz) * k;
      this.box(M4.mul(M4.translate(wx, World.heightAt(l, wx, wz) + 0.9, wz), M4.scale(0.16, 0.16, 0.16)), hexRGB(pr.color));
    }

    this.drawOverlay(G, now, l);
    this.buildTilePicks(P, l);
  },

  // Register a clickable covering the whole model: project the 8 corners of its
  // world AABB (footprint halfW × halfW, from wyBottom up `height`) and take the
  // screen bounding box, so the hit area matches what you see. A minimum pixel
  // size keeps small/distant things (ground items, rats) easy to click.
  addClick(wx, wyBottom, wz, halfW, height, ref) {
    const center = this.project(wx, wyBottom + height * 0.5, wz);
    if (!ref) return center;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, dsum = 0, n = 0;
    for (const sx of [-halfW, halfW]) for (const sz of [-halfW, halfW]) for (const yy of [wyBottom, wyBottom + height]) {
      const p = this.project(wx + sx, yy, wz + sz);
      if (!p) continue;
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      dsum += p.d; n++;
    }
    if (!n) return center;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const hw = Math.max((maxX - minX) / 2, 11), hh = Math.max((maxY - minY) / 2, 13);
    this.clickables.push({ x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh, d: dsum / n, ref });
    return center;
  },

  // ---- equipment → character look ----
  // what colour the metal shows as in the rock face, and where the veins sit on it
  RUNE_COL: { air: '#cfe6f2', mind: '#c8b8e8', water: '#3f86c8', earth: '#8a6b3a', fire: '#e0592a',
              body: '#d8b0b0', cosmic: '#a86fe0', chaos: '#c03030', nature: '#3fa84a', law: '#d8c04a', death: '#d8d8d8' },
  ORE_VEIN: {
    rock_copper: '#b5702f', rock_tin: '#bcc0c6', rock_iron: '#8a4a34', rock_coal: '#24242a',
    rock_silver: '#dae1ea', rock_gold: '#e8c04a', rock_gem: '#5ad0e8',
    rock_mithril: '#5a6fb5', rock_adamantite: '#4a7d5c'
  },
  // The stone is an octahedron ~0.5 half-wide at its waist, and box() draws a unit cube
  // of +/-0.5 — so a vein has to be pushed past that radius or it sits buried inside the
  // rock and nothing shows. Each of these breaks the surface on at least one axis.
  ORE_VEIN_SPOTS: [
    [0.42, 0.62, 0.10, 0.30], [-0.44, 0.58, -0.12, 0.28], [0.08, 0.62, 0.44, 0.28],
    [-0.10, 0.56, -0.42, 0.26], [0.26, 0.80, 0.06, 0.24], [-0.18, 0.44, 0.32, 0.24]
  ],

  metalColor(id) {
    if (id === 'dragon_sword') return '#3f8a37';
    if (id === 'leather_body' || id === 'hard_leather_body' || id === 'leather_coif') return '#7a4d28';
    if (id === 'wooden_shield') return '#7a5a35';
    if (id === 'chefs_hat') return '#f4f2ec';
    if (/^mystic/.test(id)) return '#3a3f8c';
    if (/^green_dhide/.test(id)) return '#4f6b34';
    if (/^studded/.test(id)) return '#6b5330';
    if (/staff|battlestaff/.test(id)) return '#6b4a2b';
    if (id === 'wizard_hat' || id === 'wizard_robe') return '#2f3f96';
    if (id === 'magic_staff') return '#6b4a2b';
    const t = ITEMS[id] && ITEMS[id].tint;
    return t === 'iron' ? '#61636b' : t === 'steel' ? '#aab4c0'
         : t === 'mithril' ? '#5a6fb5' : t === 'adamant' ? '#4a7d5c' : '#b06a2e'; // bronze default
  },
  weaponKind(id) {
    const d = ITEMS[id] || {};
    if (d.bow) return 'bow';
    if (d.magic || /staff/.test(id)) return 'staff';
    if (d.axe || d.pick || /_axe$|pickaxe/.test(id)) return 'axe';
    if (/mace/.test(id)) return 'mace';
    return 'sword';
  },
  // capes are dyed cloth, not metal — their colour comes from the item, not a tint
  capeColor(id) {
    return { cape_red: '#a8272c', cape_blue: '#28479c', cape_green: '#2a7a38', cape_black: '#26262c',
             highwayman_cloak: '#3a2f42', avas_satchel: '#6a4a2c' }[id] || '#a8272c';
  },
  equipLook(G) {
    const look = { skin: '#c8956c', shirt: '#a04c4c', legs: '#7a5c3a' };
    if (!G.equippedIn) return look;
    const head = G.equippedIn('head'), body = G.equippedIn('body'), wep = G.equippedIn('weapon'), shield = G.equippedIn('shield');
    const cape = G.equippedIn('cape'), legs = G.equippedIn('legs');
    if (head) { look.helm = true; look.helmCol = this.metalColor(head.id); }
    if (body) look.shirt = this.metalColor(body.id);
    if (legs) look.legs = legs.id === 'wizard_skirt' ? '#2f3f96' : /chaps/.test(legs.id) ? '#8a5a2e' : this.metalColor(legs.id);
    if (cape) look.cape = { col: this.capeColor(cape.id), pack: cape.id === 'avas_satchel' };
    if (wep) look.weapon = { kind: this.weaponKind(wep.id), col: this.metalColor(wep.id) };
    // two-handed weapons (bows/staves) leave no hand for a shield
    if (shield && !(wep && ITEMS[wep.id].twoHand)) look.shield = { kite: /kite/.test(shield.id), col: this.metalColor(shield.id) };
    return look;
  },

  // weapon held in the right hand (handMat = fist frame). Melee gear is raised to an
  // up-and-forward "ready" pose so it reads as held, not laid backwards; it swings on attack.
  drawWeapon(handMat, w, sc) {
    const c = hexRGB(w.col), grip = hexRGB('#3a2a18');
    if (w.kind === 'bow') {
      // upright D-shaped bow held in front of the hand: grip + two forward-curving limbs + string
      const wood = hexRGB('#6b4a2b'), string = hexRGB('#d8cba0');
      const g = M4.mul(handMat, M4.translate(0, 0.34 * sc, 0.12 * sc)); // raise so grip sits at the fist, bow rises in front
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.04 * sc), M4.scale(0.05 * sc, 0.4 * sc, 0.06 * sc))), wood);               // riser (grip, belly forward)
      this.box(M4.mul(g, M4.mul(M4.mul(M4.translate(0, 0.28 * sc, 0.04 * sc), M4.rotX(-0.7)), M4.scale(0.045 * sc, 0.42 * sc, 0.05 * sc))), wood); // upper limb curves back to the string
      this.box(M4.mul(g, M4.mul(M4.mul(M4.translate(0, -0.28 * sc, 0.04 * sc), M4.rotX(0.7)), M4.scale(0.045 * sc, 0.42 * sc, 0.05 * sc))), wood); // lower limb
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, -0.18 * sc), M4.scale(0.015 * sc, 1.0 * sc, 0.015 * sc))), string);          // bowstring nearest the body
      return;
    }
    if (w.kind === 'staff') {
      // tall wooden staff held upright with a glowing orb crowning the top
      const wood = hexRGB('#6b4a2b'), orb = hexRGB('#6ab0ff'), band = hexRGB('#c9a24a');
      const s = M4.mul(handMat, M4.rotX(-1.45));
      this.box(M4.mul(s, M4.mul(M4.translate(0, 0, 0.5 * sc), M4.scale(0.045 * sc, 0.045 * sc, 1.2 * sc))), wood);   // shaft
      this.box(M4.mul(s, M4.mul(M4.translate(0, 0, 1.0 * sc), M4.scale(0.07 * sc, 0.07 * sc, 0.06 * sc))), band);    // collar
      this.box(M4.mul(s, M4.mul(M4.translate(0, 0, 1.1 * sc), M4.scale(0.12 * sc, 0.12 * sc, 0.12 * sc))), orb);     // orb
      return;
    }
    const g = M4.mul(handMat, M4.rotX(-1.15)); // raise blade up & forward
    if (w.kind === 'sword') {
      const dark = hexRGB('#2a2a30'), edge = mul3(c, 1.18);
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, -0.04 * sc), M4.scale(0.075 * sc, 0.075 * sc, 0.09 * sc))), c); // pommel
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.1 * sc), M4.scale(0.055 * sc, 0.055 * sc, 0.22 * sc))), grip); // grip
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.23 * sc), M4.scale(0.28 * sc, 0.07 * sc, 0.06 * sc))), c);   // crossguard
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.55 * sc), M4.scale(0.08 * sc, 0.045 * sc, 0.6 * sc))), c);   // blade
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.55 * sc), M4.scale(0.02 * sc, 0.05 * sc, 0.58 * sc))), edge); // fuller highlight
      this.box(M4.mul(g, M4.mul(M4.mul(M4.translate(0, 0, 0.9 * sc), M4.rotX(0)), M4.scale(0.045 * sc, 0.04 * sc, 0.14 * sc))), edge); // tapered point
    } else if (w.kind === 'mace') {
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.05 * sc), M4.scale(0.055 * sc, 0.055 * sc, 0.34 * sc))), grip); // shaft
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.5 * sc), M4.scale(0.15 * sc, 0.15 * sc, 0.18 * sc))), c);       // head core
      for (let k = 0; k < 4; k++) // flanges
        this.box(M4.mul(g, M4.mul(M4.mul(M4.translate(0, 0, 0.5 * sc), M4.rotZ(k * Math.PI / 2)), M4.mul(M4.translate(0.14 * sc, 0, 0), M4.scale(0.06 * sc, 0.05 * sc, 0.19 * sc)))), mul3(c, 1.12));
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.64 * sc), M4.scale(0.06 * sc, 0.06 * sc, 0.06 * sc))), c);      // cap
    } else { // battleaxe — haft forward, broad curved bit to one side
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.3 * sc), M4.scale(0.05 * sc, 0.05 * sc, 0.5 * sc))), grip); // haft
      this.box(M4.mul(g, M4.mul(M4.translate(0.13 * sc, 0, 0.52 * sc), M4.scale(0.16 * sc, 0.24 * sc, 0.14 * sc))), c);   // head body
      this.box(M4.mul(g, M4.mul(M4.mul(M4.translate(0.26 * sc, 0, 0.52 * sc), M4.rotY(-0.25)), M4.scale(0.12 * sc, 0.3 * sc, 0.05 * sc))), mul3(c, 1.15)); // fanned edge
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.55 * sc), M4.scale(0.07 * sc, 0.16 * sc, 0.06 * sc))), grip); // eye
    }
  },

  // ---- handheld skilling tools (drawn during a gesture; grip is the fist frame) ----
  drawTool(handMat, t, sc) {
    const wood = hexRGB('#6b4a2b'), iron = hexRGB('#5f6169'), steel = hexRGB('#9aa1ac');
    if (t.kind === 'rod') { // fishing rod: long tapered pole up-and-forward, with a hanging line
      const g = M4.mul(handMat, M4.rotX(-0.85));
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.65 * sc), M4.scale(0.03 * sc, 0.03 * sc, 1.3 * sc))), wood);       // pole
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 1.28 * sc), M4.scale(0.02 * sc, 0.02 * sc, 0.28 * sc))), hexRGB('#8a6a44'));
      this.box(M4.mul(g, M4.mul(M4.translate(0, -0.28 * sc, 1.4 * sc), M4.scale(0.006 * sc, 0.56 * sc, 0.006 * sc))), hexRGB('#d8cba0')); // line
      return;
    }
    const g = M4.mul(handMat, M4.rotX(-0.35)); // haft points up-forward, in line with the swing
    if (t.kind === 'axe') { // hatchet
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.3 * sc), M4.scale(0.045 * sc, 0.045 * sc, 0.62 * sc))), wood); // haft
      this.box(M4.mul(g, M4.mul(M4.translate(0.1 * sc, 0, 0.56 * sc), M4.scale(0.13 * sc, 0.19 * sc, 0.12 * sc))), iron); // head
      this.box(M4.mul(g, M4.mul(M4.mul(M4.translate(0.21 * sc, 0, 0.56 * sc), M4.rotY(-0.22)), M4.scale(0.1 * sc, 0.24 * sc, 0.05 * sc))), steel); // bit
    } else if (t.kind === 'pick') { // pickaxe: haft + crosswise head with two down-curved points
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.3 * sc), M4.scale(0.045 * sc, 0.045 * sc, 0.62 * sc))), wood); // haft
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.58 * sc), M4.scale(0.5 * sc, 0.06 * sc, 0.07 * sc))), iron);   // cross bar
      this.box(M4.mul(g, M4.mul(M4.mul(M4.translate(0.28 * sc, 0, 0.58 * sc), M4.rotZ(0.5)), M4.scale(0.16 * sc, 0.05 * sc, 0.06 * sc))), steel); // point
      this.box(M4.mul(g, M4.mul(M4.mul(M4.translate(-0.28 * sc, 0, 0.58 * sc), M4.rotZ(-0.5)), M4.scale(0.16 * sc, 0.05 * sc, 0.06 * sc))), steel);
    } else { // hammer
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.26 * sc), M4.scale(0.05 * sc, 0.05 * sc, 0.5 * sc))), wood);  // haft
      this.box(M4.mul(g, M4.mul(M4.translate(0, 0, 0.5 * sc), M4.scale(0.28 * sc, 0.12 * sc, 0.13 * sc))), iron);  // head
      this.box(M4.mul(g, M4.mul(M4.translate(0.16 * sc, 0, 0.5 * sc), M4.scale(0.06 * sc, 0.1 * sc, 0.11 * sc))), steel); // face
    }
  },
  // shield on the left arm (armMat = forearm frame)
  drawShield(armMat, sh, sc) {
    const c = hexRGB(sh.col);
    const m = M4.mul(armMat, M4.translate(-0.06 * sc, -0.2 * sc, 0.1 * sc));
    if (sh.kite) {
      this.box(M4.mul(m, M4.scale(0.08 * sc, 0.62 * sc, 0.42 * sc)), c);
      this.box(M4.mul(m, M4.mul(M4.translate(-0.05 * sc, 0, 0), M4.scale(0.05 * sc, 0.28 * sc, 0.1 * sc))), hexRGB('#d8c98a')); // boss
    } else {
      this.box(M4.mul(m, M4.scale(0.08 * sc, 0.44 * sc, 0.44 * sc)), c);
      this.box(M4.mul(m, M4.mul(M4.translate(-0.05 * sc, 0, 0), M4.scale(0.05 * sc, 0.12 * sc, 0.12 * sc))), hexRGB('#3a2a18')); // boss
    }
  },

  // ---- soft blob shadows on the ground under living things & trees ----
  _drawShadows(G, l, inR) {
    const gl = this.gl;
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.discBuf); this._bind9();
    gl.uniform1f(this.loc.u_useTex, 0);
    gl.uniform3fv(this.loc.u_tint, [0, 0, 0]);
    gl.uniform1f(this.loc.u_alpha, 0.26);
    const blob = (wx, wz, r) => {
      const y = World.heightAt(l, wx, wz) + 0.02;
      gl.uniformMatrix4fv(this.loc.u_model, false, M4.mul(M4.translate(wx, y, wz), M4.scale(r, 1, r)));
      gl.drawArrays(gl.TRIANGLES, 0, this.discCount);
    };
    for (const s of World.L[l].scenery.values()) {
      if (!inR(s.x, s.z)) continue;
      const r = s.type === 'oak' ? 1.1 : s.type === 'tree' ? 0.95 : s.type === 'willow' ? 1.0 : s.type === 'statue' ? 0.7 : 0;
      if (r) blob(s.x + 0.5, s.z + 0.5, r);
    }
    for (const n of G.npcs) {
      if (n.deadUntil || n.layer !== l) continue;
      if ((NPC_LOOKS[n.type] || {}).ghost) continue;        // the dead cast no shadow
      const fx = n.fx !== undefined ? n.fx : n.x + 0.5, fz = n.fz !== undefined ? n.fz : n.z + 0.5;
      if (!inR(Math.floor(fx), Math.floor(fz))) continue;
      blob(fx, fz, n.type === 'dragon' ? 1.4 : n.type === 'bear' ? 0.8 : n.type === 'rat' ? 0.45 : 0.5);
    }
    for (const q of (G.players || [])) { if (q.layer === l && inR(Math.floor(q.x), Math.floor(q.z))) blob(q.x, q.z, 0.5); }
    const P = G.player; blob(P.x, P.z, 0.5);
    gl.depthMask(true); gl.disable(gl.BLEND);
    gl.uniform1f(this.loc.u_alpha, 1);
  },

  // ---- low-poly rigged human (torso/head/2 arms/2 legs) ----
  drawLimb(base, ox, jointY, ang, sx, sy, sz, col) {
    let m = M4.mul(base, M4.translate(ox, jointY, 0));
    m = M4.mul(m, M4.rotX(ang));
    m = M4.mul(m, M4.translate(0, -sy / 2, 0));
    m = M4.mul(m, M4.scale(sx, sy, sz));
    this.box(m, col);
  },

  drawHuman(wx, wz, l, look, moving, now, swing, key, clickRef) {
    const y = World.heightAt(l, wx, wz) + (look.lift || 0);   // ghosts hang clear of the ground
    let f;
    if (key && key.faceX != null) { // facing lock while skilling/attacking a fixed target
      f = Math.atan2(key.faceX - wx, key.faceZ - wz);
      const fc = this._facing.get(key); if (fc) { fc.a = f; fc.x = wx; fc.z = wz; }
    } else f = this.facing(key || look, wx, wz);
    const sc = look.scale || 1;
    // an emote poses the whole figure: it lifts, spins and tips the body, and the
    // head carries its own angles so a nod doesn't tip everything with it
    const em = emoteFor(key, now);
    const po = em ? emotePose(em.id, em.t) : null;
    // a hit rocks the figure back briefly — set on the target in splatNpc
    const fl = (key && key.flinch && now < key.flinch) ? (key.flinch - now) / 220 : 0;
    const base = M4.mul(M4.translate(wx, y + (po ? po.bob * sc : 0), wz), M4.rotY(f + (po ? po.spin : 0)));
    // A lean bends at the WAIST, not the ankles — everything from the hips up gets
    // `upper`, the legs stay on `base`. Tipping the whole figure about its feet
    // makes a bow look like a plank falling over.
    let upper = base;
    if (fl) {
      const hip = 0.72 * sc;
      upper = M4.mul(M4.mul(M4.mul(base, M4.translate(0, hip, 0)), M4.rotX(-fl * 0.34)), M4.translate(0, -hip, 0));
    }
    if (po && (po.lean || po.tilt)) {
      const hip = 0.72 * sc;
      upper = M4.mul(M4.mul(M4.mul(M4.mul(base, M4.translate(0, hip, 0)),
        M4.rotX(po.lean)), M4.rotZ(po.tilt)), M4.translate(0, -hip, 0));
    }
    const skin = hexRGB(look.skin), shirt = hexRGB(look.shirt), legs = hexRGB(look.legs);
    // torso
    this.box(M4.mul(upper, M4.mul(M4.translate(0, 1.0 * sc, 0), M4.scale(0.44 * sc, 0.55 * sc, 0.26 * sc))), shirt);
    // head, hung off a neck joint so it can turn on its own
    let neck = M4.mul(upper, M4.translate(0, 1.3 * sc, 0));
    if (po) neck = M4.mul(neck, M4.mul(M4.mul(M4.rotY(po.headYaw), M4.rotX(po.headPitch)), M4.rotZ(po.headRoll)));
    this.box(M4.mul(neck, M4.mul(M4.translate(0, 0.14 * sc, 0), M4.scale(0.3 * sc, 0.3 * sc, 0.3 * sc))), skin);
    if (look.helm) {
      this.box(M4.mul(neck, M4.mul(M4.translate(0, 0.25 * sc, 0), M4.scale(0.34 * sc, 0.18 * sc, 0.34 * sc))), hexRGB(look.helmCol || '#9a9da6'));
      this.box(M4.mul(neck, M4.mul(M4.translate(0, 0.12 * sc, 0.15 * sc), M4.scale(0.07 * sc, 0.16 * sc, 0.06 * sc))), hexRGB(look.helmCol || '#9a9da6')); // nose guard
    } else if (look.hat) {
      // A pointed hat, stepped rather than smooth to match the low-poly look. Wizards
      // used to wear a metal helmet, which read as a guard rather than a spellcaster.
      const hc = hexRGB(look.hatCol || '#2f3f96');
      this.box(M4.mul(neck, M4.mul(M4.translate(0, 0.26 * sc, 0), M4.scale(0.52 * sc, 0.05 * sc, 0.52 * sc))), hc); // brim
      for (const [hy, hw] of [[0.34, 0.34], [0.45, 0.24], [0.55, 0.15], [0.63, 0.07]])
        this.box(M4.mul(neck, M4.mul(M4.translate(0, hy * sc, 0), M4.scale(hw * sc, 0.11 * sc, hw * sc))), hc);
    }
    // cape: hangs off the shoulders down the back, trailing further out at a run
    if (look.cape) {
      const cc = hexRGB(look.cape.col);
      const sway = moving ? 0.34 + Math.sin(now / 130) * 0.08 : 0.1 + Math.sin(now / 700) * 0.02;
      const hang = M4.mul(M4.mul(upper, M4.translate(0, 1.28 * sc, -0.15 * sc)), M4.rotX(sway));
      this.box(M4.mul(hang, M4.mul(M4.translate(0, -0.42 * sc, -0.03 * sc), M4.scale(0.42 * sc, 0.5 * sc, 0.05 * sc))), cc);  // shoulders
      this.box(M4.mul(hang, M4.mul(M4.translate(0, -0.9 * sc, -0.06 * sc), M4.scale(0.5 * sc, 0.5 * sc, 0.05 * sc))), cc);    // flared hem
      if (look.cape.pack) { // Ava's Satchel rides as a pack over the cape, lodestone glinting
        this.box(M4.mul(upper, M4.mul(M4.translate(0, 1.02 * sc, -0.27 * sc), M4.scale(0.3 * sc, 0.36 * sc, 0.16 * sc))), hexRGB('#6a4a2c'));
        this.box(M4.mul(upper, M4.mul(M4.translate(0, 1.16 * sc, -0.3 * sc), M4.scale(0.32 * sc, 0.1 * sc, 0.14 * sc))), hexRGB('#8a6538'));
        this.box(M4.mul(upper, M4.mul(M4.translate(0, 0.98 * sc, -0.36 * sc), M4.scale(0.1 * sc, 0.1 * sc, 0.05 * sc))), hexRGB('#6ab0ff'));
      }
    }
    // legs (walk cycle) or skirt
    const lp = moving ? Math.sin(now / 130) * 0.5 : 0;
    if (look.dress) {
      this.box(M4.mul(base, M4.mul(M4.translate(0, 0.34 * sc, 0), M4.scale(0.5 * sc, 0.68 * sc, 0.34 * sc))), legs);
    } else {
      this.drawLimb(base, -0.12 * sc, 0.72 * sc, lp + (po ? po.legL : 0), 0.15 * sc, 0.72 * sc, 0.16 * sc, legs);
      this.drawLimb(base, 0.12 * sc, 0.72 * sc, -lp + (po ? po.legR : 0), 0.15 * sc, 0.72 * sc, 0.16 * sc, legs);
    }
    // ---- arm posing: idle sway, walk swing, weapon-specific attack, or skilling gesture ----
    // A shoulder frame = base · translate(shoulder) · rotY(yaw) · rotZ(roll) · rotX(pitch).
    const shoulder = (side, yaw, roll, pitch) => M4.mul(upper, M4.mul(M4.mul(M4.mul(
      M4.translate(side * 0.29 * sc, 1.28 * sc, 0), M4.rotY(yaw)), M4.rotZ(roll)), M4.rotX(pitch)));
    const ap = moving ? Math.sin(now / 130) * 0.4 : Math.sin(now / 700) * 0.05; // walk swing / gentle idle
    let lPit = -ap, rPit = ap, lYaw = 0, rYaw = 0, lRol = 0, rRol = 0;
    let heldTool = null, bowInLeft = look.weapon && look.weapon.kind === 'bow';
    const acting = (key && key.actType && now < (key.actUntil || 0)) ? key.actType : null;

    if (acting) {
      if (acting === 'chop' || acting === 'mine' || acting === 'smith') {
        const cyc = acting === 'smith' ? 0.022 : 0.012;        // hammer taps faster than chops
        const gp = (1 - Math.cos(now * cyc)) / 2;               // 0→1→0 repeating strike
        rPit = -0.15 - gp * (acting === 'smith' ? 1.4 : 1.95);  // raise back, drive down
        rRol = -0.12; lPit = -0.15 - gp * 0.35;                 // off hand steadies
        heldTool = { chop: { kind: 'axe' }, mine: { kind: 'pick' }, smith: { kind: 'hammer' } }[acting];
      } else if (acting === 'fish') {
        const gp = Math.sin(now * 0.006);
        rPit = -1.0 + gp * 0.1; lPit = -0.95 - gp * 0.1;        // both hands on the rod, tip bobs
        rYaw = 0.12; lYaw = -0.12; heldTool = { kind: 'rod' };
      } else { // cook / smelt — reach toward the fire and tend it
        const gp = Math.sin(now * 0.007);
        rPit = -1.05 + gp * 0.2; lPit = -0.9 + gp * 0.14; rRol = -0.1;
      }
    } else if (swing >= 0) {
      const atk = key && key.swingKind;                          // 'melee' | 'ranged' | 'magic'
      const kind = atk === 'magic' ? 'magic' : (look.weapon ? look.weapon.kind : 'unarmed');
      const st = Math.sin(swing * Math.PI);                      // 0→1→0 over the strike
      if (kind === 'magic') {                                     // both palms thrust forward to loose the spell
        lPit = -1.1 - st * 0.35; rPit = -1.1 - st * 0.35; lYaw = -0.18; rYaw = 0.18;
      } else if (kind === 'bow') {                               // draw: off hand out, string hand to cheek
        lPit = -1.3; lYaw = 0.12; rPit = -1.25 + swing * 1.05; rYaw = 0.25;
      } else if (kind === 'sword') {                              // diagonal slash sweeping across the front
        rYaw = 0.75 - swing * 1.7; rRol = -0.35; rPit = -0.7 - st * 0.55;
      } else if (kind === 'unarmed') {                            // straight jab
        rPit = -1.5 * st; rYaw = 0.15 * st;
      } else {                                                    // axe / mace — overhead chop
        rPit = -0.25 - st * 1.85; rRol = kind === 'mace' ? 0.18 : 0;
      }
    }
    // an emote outranks the idle sway, but never a swing or a skilling gesture —
    // you cannot wave mid-chop, and the emote is cancelled the moment you act
    if (po && po.arms && !acting && swing < 0) {
      lPit = po.lPit; rPit = po.rPit; lYaw = po.lYaw; rYaw = po.rYaw; lRol = po.lRol; rRol = po.rRol;
    }

    const leftArm = shoulder(-1, lYaw, lRol, lPit);
    const rightArm = shoulder(1, rYaw, rRol, rPit);
    this.box(M4.mul(leftArm, M4.mul(M4.translate(0, -0.25 * sc, 0), M4.scale(0.12 * sc, 0.5 * sc, 0.12 * sc))), shirt);
    this.box(M4.mul(rightArm, M4.mul(M4.translate(0, -0.25 * sc, 0), M4.scale(0.12 * sc, 0.5 * sc, 0.12 * sc))), shirt);
    const rHand = M4.mul(rightArm, M4.translate(0, -0.5 * sc, 0)), lHand = M4.mul(leftArm, M4.translate(0, -0.5 * sc, 0));
    if (heldTool) this.drawTool(rHand, heldTool, sc);            // skilling tool overrides the weapon
    else if (bowInLeft) this.drawWeapon(lHand, look.weapon, sc); // archers hold the bow in the off hand
    else if (look.weapon) this.drawWeapon(rHand, look.weapon, sc);
    if (look.shield && !heldTool) this.drawShield(lHand, look.shield, sc);
    this.addClick(wx, y, wz, 0.42 * sc, 1.8 * sc, clickRef || null);
  },

  drawCreature(n, fx, fz, l, now) {
    const swing = now < (n.swingUntil || 0) ? 1 - (n.swingUntil - now) / 350 : -1;
    if (this.models[n.type]) {
      // in a fight the creature holds its stare on the target; otherwise it looks along its path
      const y = World.heightAt(l, fx, fz), f = this.creatureFacing(n, fx, fz);
      // subtle gait/idle bob so baked meshes feel alive
      const per = n.type === 'rat' ? 90 : 190;
      const bob = n.moving ? Math.abs(Math.sin(now / per)) * (n.type === 'rat' ? 0.05 : 0.07) : Math.sin(now / 640) * 0.02;
      let base = M4.mul(M4.translate(fx, y + bob, fz), M4.rotY(f));
      // A baked mesh can't be posed, so a strike reads as a lunge: dip the head,
      // drive forward off the back legs, snap back. Models face +z in local space.
      if (swing >= 0) {
        const st = Math.sin(swing * Math.PI);
        base = M4.mul(base, M4.mul(M4.rotX(st * 0.26), M4.translate(0, 0, st * 0.4)));
      }
      // taking a hit rocks it backwards, so a blow landing is visible on the target
      if (n.flinch && now < n.flinch) {
        const f = (n.flinch - now) / 220;
        base = M4.mul(base, M4.mul(M4.rotX(-f * 0.3), M4.translate(0, 0, -f * 0.18)));
      }
      this.drawModel(n.type, base);
      if (n.type === 'dragon') {
        const flap = Math.sin(now / 220) * 0.55 + 0.15;
        this._dragonWing(base, -1, flap); this._dragonWing(base, 1, flap);
      }
      const dim = n.type === 'dragon' ? [1.35, 2.6] : n.type === 'bear' ? [0.7, 1.25] : n.type === 'cow' ? [0.5, 1.05] : n.type === 'chicken' ? [0.3, 0.6] : [0.42, 0.6];
      this.addClick(fx, y, fz, dim[0], dim[1], { kind: 'npc', n });
      return;
    }
    // humanoid monsters/NPCs use the animated human model + their look
    const look = NPC_LOOKS[n.type] || NPC_LOOKS.guide;
    // humanoids flinch by leaning away for a moment (drawHuman reads key.flinch)
    if (look.ghost) {
      // The dead are drawn translucent: alpha-blended with the depth write off, so
      // the town shows through them and they don't punch holes in each other.
      const gl = this.gl;
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.uniform1f(this.loc.u_alpha, 0.44 + 0.09 * Math.sin(now / 430 + n.x + n.z));   // a slow guttering
      this.drawHuman(fx, fz, l, look, n.moving, now, swing, n, { kind: 'npc', n });
      gl.depthMask(true); gl.disable(gl.BLEND);
      gl.uniform1f(this.loc.u_alpha, 1);
      return;
    }
    this.drawHuman(fx, fz, l, look, n.moving, now, swing, n, { kind: 'npc', n });
  },

  // Facing for baked-mesh creatures: a combat lock (faceX/faceZ) wins over the
  // movement-derived angle, and it seeds the smoothed value so there's no snap
  // back to a stale heading when the fight ends.
  creatureFacing(n, fx, fz) {
    if (n.faceX == null) return this.facing(n, fx, fz);
    const f = Math.atan2(n.faceX - fx, n.faceZ - fz);
    const fc = this._facing.get(n); if (fc) { fc.a = f; fc.x = fx; fc.z = fz; }
    return f;
  },

  drawScenery(s, l, now) {
    const cx = s.x + 0.5, cz = s.z + 0.5, y = World.heightAt(l, cx, cz), C = ATLAS_CELL;
    const ORE_VEIN = this.ORE_VEIN, ORE_VEIN_SPOTS = this.ORE_VEIN_SPOTS;
    // put(): box at ground; pass `cell` to texture it (tint goes near-white so the material shows)
    const T = s.type, put = (h, w, dd, col, yo, cell) => this.box(M4.mul(M4.translate(cx, y + (yo || h / 2), cz), M4.scale(w, h, dd)), cell !== undefined ? [0.96, 0.96, 0.96] : hexRGB(col), cell);
    // sculpted models: {halfWidth, height} for both the draw and a full-model click box
    const SMODEL = {
      tree: [0.9, 2.4, 1], oak: [1.1, 2.9, 1], willow: [1.0, 2.5, 1], maple: [1.15, 3.0, 1], yew: [1.2, 2.7, 1],
      fountain: [0.9, 1.3], statue: [0.6, 2.9], well: [0.7, 2.1], stall: [0.95, 1.7],
      furnace: [0.62, 1.7], anvil: [0.5, 0.75], range: [0.62, 1.15], altar: [0.65, 1.35],
      ladder_down: [0.6, 0.9], ladder_up: [0.45, 1.95],
      bank_booth: [0.6, 1.9], tower: [0.68, 3.4], lamppost: [0.28, 2.1], signpost: [0.5, 1.5],
      windmill: [0.75, 3.1], wheat: [0.35, 0.75], fence: [0.5, 0.85], haystack: [0.62, 1.25],
      chicken_coop: [0.55, 1.3], tribe_hut: [0.78, 1.55], totem: [0.4, 2.0],
      boulder: [0.78, 1.4], guild_door: [0.62, 1.9],
      sign_weapon: [0.6, 2.2], sign_armour: [0.6, 2.2], sign_ranged: [0.6, 2.2], sign_magic: [0.6, 2.2],
      rune_rift: [0.7, 2.4], herb_patch: [0.5, 0.5],
      rampart: [0.5, 2.5], gatehouse: [0.55, 3.2], shop_counter: [0.5, 1.0], shelves: [0.5, 1.8], stained_glass: [0.5, 2.1]
    };
    const md = SMODEL[T];
    if (md && this.models[T]) {
      let base = M4.translate(cx, y, cz);
      if (s.rot) base = M4.mul(base, M4.rotY(s.rot));                                              // per-instance rotation (e.g. east-wall windows)
      else if (md[2]) base = M4.mul(base, M4.rotY(((s.x * 41 + s.z * 17) % 360) * Math.PI / 180)); // trees vary rotation
      const mat = this.matOf(s);
      this.drawModel(T, base, mat ? mat.tint : null);
      this.addClick(cx, y, cz, md[0], md[1], { kind: 'scenery', key: World.key(s.x, s.z), s });
      return;
    }
    let clickH = 1.0, halfW = 0.6;
    switch (T) {
      case 'stump': put(0.3, 0.3, 0.3, '#6b4a2b'); clickH = 0.4; halfW = 0.35; break;
      // Ore seams: one sculpted outcrop with the metal showing through as veins. Silver,
      // gold, gem, mithril and adamantite used to have no case at all here and fell
      // through to the grey default box, so five of the nine rocks looked identical.
      case 'rune_altar': {
        const st = hexRGB('#6f6a60'), cap = hexRGB('#847d72');
        this.box(M4.mul(M4.translate(cx, y + 0.45, cz), M4.scale(0.62, 0.9, 0.5)), st);
        this.box(M4.mul(M4.translate(cx, y + 0.96, cz), M4.scale(0.82, 0.14, 0.66)), cap);
        // the rune itself, floating and lit in its own colour
        const gl = hexRGB(this.RUNE_COL[s.rune] || '#b0a8c8');
        const bob = Math.sin(now / 600 + s.x) * 0.05;
        this.box(M4.mul(M4.mul(M4.translate(cx, y + 1.42 + bob, cz), M4.rotY(now / 900)), M4.scale(0.3, 0.3, 0.3)), gl);
        clickH = 1.7; halfW = 0.55; break;
      }
      case 'essence_rock': case 'pure_rock': {
        const pure = T === 'pure_rock';
        const base = M4.mul(M4.translate(cx, y, cz), M4.rotY(((s.x * 37 + s.z * 19) % 360) * Math.PI / 180));
        this.drawModel('ore_rock', base, pure ? [1.35, 1.4, 1.5] : [1.15, 1.18, 1.22]);
        clickH = 1.0; halfW = 0.62; break;
      }
      case 'rune_rift': {
        const st = hexRGB('#6f6a60');
        this.box(M4.mul(M4.translate(cx - 0.42, y + 1.0, cz), M4.scale(0.2, 2.0, 0.3)), st);
        this.box(M4.mul(M4.translate(cx + 0.42, y + 1.0, cz), M4.scale(0.2, 2.0, 0.3)), st);
        this.box(M4.mul(M4.translate(cx, y + 2.08, cz), M4.scale(1.04, 0.22, 0.32)), st);
        const pulse = 0.55 + 0.45 * Math.sin(now / 420);
        this.box(M4.mul(M4.translate(cx, y + 0.98, cz), M4.scale(0.62, 1.9, 0.08)), [0.55 * pulse, 0.35 * pulse, 0.85 * pulse]);
        clickH = 2.2; halfW = 0.6; break;
      }
      case 'herb_patch': {
        this.box(M4.mul(M4.translate(cx, y + 0.04, cz), M4.scale(0.82, 0.08, 0.82)), hexRGB('#4a3a22'));
        for (const [hx, hz] of [[-0.2, -0.1], [0.05, 0.18], [0.22, -0.16]])
          this.box(M4.mul(M4.translate(cx + hx, y + 0.22, cz + hz), M4.scale(0.12, 0.34, 0.12)), hexRGB('#4f8a3a'));
        clickH = 0.5; halfW = 0.5; break;
      }
      case 'rock_copper': case 'rock_tin': case 'rock_iron': case 'rock_coal':
      case 'rock_silver': case 'rock_gold': case 'rock_gem':
      case 'rock_mithril': case 'rock_adamantite': case 'rock_empty': {
        const spent = T === 'rock_empty';
        const base = M4.mul(M4.translate(cx, y, cz), M4.rotY(((s.x * 53 + s.z * 29) % 360) * Math.PI / 180));
        this.drawModel(spent ? 'ore_rock_spent' : 'ore_rock', base);
        if (!spent) {
          const vein = hexRGB(ORE_VEIN[T] || '#9a948a');
          // veins sit proud of the stone in a fixed scatter, rotated with the rock
          for (const [vx, vy, vz, vs] of ORE_VEIN_SPOTS) {
            const m = M4.mul(M4.mul(base, M4.translate(vx, vy, vz)), M4.scale(vs, vs * 0.72, vs));
            this.box(m, vein);
          }
        }
        clickH = spent ? 0.55 : 1.0; halfW = 0.62; break;
      }
      case 'fishing_spot': case 'lure_spot': {
        // a little cluster of bobbing foam so the spot is visible on the water — and clickable
        const foam = hexRGB(T === 'lure_spot' ? '#cfe6f2' : '#eef6fc');
        for (let b = 0; b < 4; b++) {
          const ang = b * 1.7 + now * 0.0025, bob = Math.sin(now * 0.006 + b * 1.3) * 0.03;
          const bx = cx + Math.cos(ang) * 0.26, bz = cz + Math.sin(ang) * 0.26;
          this.box(M4.mul(M4.translate(bx, y + 0.07 + bob, bz), M4.scale(0.12, 0.05, 0.12)), foam);
        }
        this.box(M4.mul(M4.translate(cx, y + 0.06, cz), M4.scale(0.16, 0.05, 0.16)), foam);
        this.addClick(cx, y, cz, 0.55, 0.5, { kind: 'scenery', key: World.key(s.x, s.z), s });
        return;
      }
      case 'fire': {
        const flick = 1 + Math.sin(now / 90 + s.x) * 0.09 + Math.sin(now / 47) * 0.05;
        this.drawModel('fire', M4.mul(M4.mul(M4.translate(cx, y, cz), M4.rotY(now / 600)), M4.scale(1, flick, 1)));
        clickH = 0.6; break;
      }
      case 'wall': {
        const mat = this.matOf(s);
        const cell = l === 1 ? C.dwall : (mat ? C[mat.cell] : C.stone);
        this.box(M4.mul(M4.translate(cx, y + 0.7, cz), M4.scale(1.0, 1.4, 1.0)), mat ? mat.tint : [0.96, 0.96, 0.96], cell);
        clickH = 1.4; halfW = 0.5; break;
      }
      case 'milestone': {
        // squat waymarker: a rounded post with a pale painted face
        put(0.62, 0.34, 0.3, '#8f897c');
        this.box(M4.mul(M4.translate(cx, y + 0.44, cz + 0.16), M4.scale(0.2, 0.24, 0.04)), hexRGB('#e6e0cf'));
        clickH = 0.8; halfW = 0.35; break;
      }
      case 'shrine': {
        // a little stone niche with a lit candle — the one warm thing on the moor
        put(0.9, 0.62, 0.5, '#7d7669');
        this.box(M4.mul(M4.translate(cx, y + 0.62, cz + 0.2), M4.scale(0.3, 0.42, 0.1)), hexRGB('#453f36')); // dark niche
        const flick = 0.5 + Math.sin(now / 120 + s.x) * 0.5;
        this.box(M4.mul(M4.translate(cx, y + 0.58, cz + 0.16), M4.scale(0.07, 0.16, 0.07)), hexRGB('#efe6c6'));
        this.box(M4.mul(M4.translate(cx, y + 0.72, cz + 0.16), M4.scale(0.05, 0.09, 0.05)), [1, 0.72 + flick * 0.22, 0.25]);
        put(0.14, 0.9, 0.8, '#6a6459', 0.02); // worn step
        clickH = 1.1; halfW = 0.5; break;
      }
      case 'rubble': {
        // scattered fallen stone + a charred beam, low to the ground
        const h = ((s.x * 7 + s.z * 13) % 5) * 0.04;
        put(0.34 + h, 0.86, 0.8, '#6f6a60');
        this.box(M4.mul(M4.mul(M4.translate(cx + 0.12, y + 0.2, cz - 0.1), M4.rotY(s.x * 0.7)), M4.scale(0.7, 0.14, 0.16)), hexRGB('#3a3028'));
        clickH = 0.55; halfW = 0.5; break;
      }
      case 'crate': {
        put(0.5, 0.7, 0.7, '#7a5330');
        this.box(M4.mul(M4.translate(cx - 0.12, y + 0.72, cz + 0.1), M4.scale(0.44, 0.44, 0.44)), hexRGB('#8a6538')); // one stacked askew
        clickH = 1.0; halfW = 0.5; break;
      }
      case 'market_awning': {
        for (const dx of [-0.42, 0.42]) this.box(M4.mul(M4.translate(cx + dx, y + 0.6, cz), M4.scale(0.06, 1.2, 0.06)), hexRGB('#6b4a2b')); // posts
        // striped canopy, pitched forward
        for (let i = -2; i <= 2; i++)
          this.box(M4.mul(M4.mul(M4.translate(cx + i * 0.19, y + 1.28, cz), M4.rotX(0.22)), M4.scale(0.19, 0.06, 1.0)), hexRGB(i % 2 ? '#d8d0c0' : '#a8272c'));
        clickH = 1.5; halfW = 0.55; break;
      }
      case 'plinth': {
        put(0.5, 0.9, 0.9, '#6a6459');
        put(0.16, 1.05, 1.05, '#7d776a', 0.5);                                                    // cap stone
        clickH = 0.8; halfW = 0.55; break;
      }
      case 'pylon': {
        // a menhir; when its face is lit the rune-band pulses cold blue
        const lit = typeof Game !== 'undefined' && Game.pylonLit && Game.pylonLit(s);
        this.box(M4.mul(M4.translate(cx, y + 1.05, cz), M4.scale(0.34, 2.1, 0.3)), hexRGB(lit ? '#6a6f80' : '#55514a'));
        this.box(M4.mul(M4.translate(cx, y + 0.12, cz), M4.scale(0.46, 0.24, 0.42)), hexRGB('#4a4640')); // footing
        if (lit) {
          const pulse = 0.5 + Math.sin(now / 260 + s.x) * 0.5;
          this.box(M4.mul(M4.translate(cx, y + 1.5, cz + 0.17), M4.scale(0.2, 0.2, 0.04)),
            [0.25 + pulse * 0.35, 0.6 + pulse * 0.3, 1.0]);
        }
        clickH = 2.2; halfW = 0.42; break;
      }
      case 'farm_patch': {
        // the patch shows its own state: weeds, bare tilled earth, shoots, or a crop
        const st = (typeof Game !== 'undefined' && Game.patchState) ? Game.patchState(s) : { state: 'weeds' };
        put(0.1, 0.94, 0.94, st.state === 'weeds' ? '#5c6a3c' : '#5a4227', 0.02);   // soil
        if (st.state === 'weeds') {
          for (let i = 0; i < 6; i++) {
            const a = i * 1.05 + s.x, r = 0.3;
            this.box(M4.mul(M4.translate(cx + Math.cos(a) * r, y + 0.14, cz + Math.sin(a) * r), M4.scale(0.07, 0.24, 0.07)), hexRGB('#6f8a3e'));
          }
        } else if (st.state !== 'empty') {
          const c = CROPS[st.seed];
          const h = st.state === 'ready' ? 0.5 : 0.12 + st.pct * 0.3;
          const col = { potato: '#5f8a44', onion: '#8aa04a', cabbage: '#6cbf5a', wheat: '#c8a94e' }[c.crop] || '#5f8a44';
          for (const [ox, oz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]])
            this.box(M4.mul(M4.translate(cx + ox, y + h / 2 + 0.04, cz + oz), M4.scale(0.16, h, 0.16)), hexRGB(col));
          if (st.state === 'ready')                                   // ripe heads sit on top
            for (const [ox, oz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]])
              this.box(M4.mul(M4.translate(cx + ox, y + h + 0.1, cz + oz), M4.scale(0.2, 0.16, 0.2)), hexRGB(c.crop === 'wheat' ? '#d8bd63' : '#8fd06a'));
        }
        clickH = 0.7; halfW = 0.5; break;
      }
      // ---- Mourncross ----
      case 'bone_font': case 'bone_font_dark': {
        // a low pale basin brimming with grey water, ringed with offered bone.
        // When the tide puts it out the water goes flat and the glow stops.
        const dark = T === 'bone_font_dark';
        put(0.62, 1.0, 1.0, dark ? '#6f716b' : '#b0b2aa');
        this.box(M4.mul(M4.translate(cx, y + 0.6, cz), M4.scale(0.82, 0.08, 0.82)), dark ? [0.28, 0.3, 0.28] : [0.55, 0.62, 0.55]);   // the water
        for (let i = 0; i < 5; i++) {
          const a = i * 1.256 + s.x;
          this.box(M4.mul(M4.mul(M4.translate(cx + Math.cos(a) * 0.42, y + 0.68, cz + Math.sin(a) * 0.42), M4.rotY(a)), M4.scale(0.09, 0.14, 0.09)), hexRGB('#ded8c6'));
        }
        if (!dark) {
          const glow = 0.5 + Math.sin(now / 520 + s.x) * 0.5;
          this.box(M4.mul(M4.translate(cx, y + 0.72, cz), M4.scale(0.3, 0.05, 0.3)), [0.4, 0.75 + glow * 0.2, 0.55]);
        }
        clickH = 0.95; halfW = 0.55; break;
      }
      case 'bone_grinder': {
        put(0.9, 0.72, 0.72, '#8e9088');                                                              // the mill drum
        put(0.16, 0.9, 0.9, '#6f7169', 0.9);                                                          // hopper lip
        const spin = now / 900 + s.x;
        this.box(M4.mul(M4.mul(M4.translate(cx + 0.44, y + 0.6, cz), M4.rotZ(spin)), M4.scale(0.06, 0.5, 0.06)), hexRGB('#5a4a38')); // crank
        clickH = 1.15; halfW = 0.5; break;
      }
      case 'slime_pool': {
        // a seep of cold ectoplasm, breathing very slowly
        const b = 0.5 + Math.sin(now / 700 + s.x * 2) * 0.5;
        this.box(M4.mul(M4.translate(cx, y + 0.06, cz), M4.scale(0.92, 0.1, 0.92)), [0.24, 0.5 + b * 0.14, 0.34]);
        this.box(M4.mul(M4.translate(cx, y + 0.1, cz), M4.scale(0.5, 0.08, 0.5)), [0.35, 0.7 + b * 0.16, 0.45]);
        clickH = 0.4; halfW = 0.5; break;
      }
      case 'sand_bank': {
        put(0.36, 0.94, 0.9, '#8c8a7c');
        this.box(M4.mul(M4.translate(cx - 0.16, y + 0.44, cz + 0.1), M4.scale(0.42, 0.2, 0.4)), hexRGB('#9c9a8a'));
        clickH = 0.6; halfW = 0.5; break;
      }
      case 'grave': {
        put(0.14, 0.86, 0.7, '#5c6156');                                                              // the mound
        // headstone, leaning a little differently at every plot
        const lean = ((s.x * 13 + s.z * 7) % 7 - 3) * 0.05;
        this.box(M4.mul(M4.mul(M4.translate(cx, y + 0.42, cz - 0.22), M4.rotZ(lean)), M4.scale(0.34, 0.62, 0.09)), hexRGB('#a6a89e'));
        clickH = 0.9; halfW = 0.45; break;
      }
      case 'dead_tree': {
        this.box(M4.mul(M4.translate(cx, y + 0.95, cz), M4.scale(0.16, 1.9, 0.16)), hexRGB('#6a6558'));
        for (const [bx, bz, ba] of [[0.3, 0.1, 0.7], [-0.28, -0.14, -0.8], [0.05, -0.3, 0.35]])
          this.box(M4.mul(M4.mul(M4.translate(cx + bx * 0.6, y + 1.5, cz + bz * 0.6), M4.rotZ(ba)), M4.scale(0.5, 0.08, 0.08)), hexRGB('#77715f'));
        clickH = 2.0; halfW = 0.45; break;
      }
      case 'bell': {
        for (const dx of [-0.3, 0.3]) this.box(M4.mul(M4.translate(cx + dx, y + 0.8, cz), M4.scale(0.08, 1.6, 0.08)), hexRGB('#7a7468'));  // the frame
        this.box(M4.mul(M4.translate(cx, y + 1.56, cz), M4.scale(0.74, 0.1, 0.12)), hexRGB('#7a7468'));
        // the bell itself swings for a moment after it is struck
        const rung = typeof Game !== 'undefined' && Game.bellRungAt ? Game.bellRungAt(s) : 0;
        const t = rung && now < rung + 1400 ? (now - rung) / 1400 : -1;
        const sway = t >= 0 ? Math.sin(t * 22) * 0.5 * (1 - t) : 0;
        const hang = M4.mul(M4.mul(M4.translate(cx, y + 1.5, cz), M4.rotZ(sway)), M4.translate(0, -0.34, 0));
        this.box(M4.mul(hang, M4.scale(0.42, 0.5, 0.42)), hexRGB('#9a8a56'));
        this.box(M4.mul(hang, M4.mul(M4.translate(0, -0.3, 0), M4.scale(0.5, 0.12, 0.5))), hexRGB('#b0a068'));
        clickH = 1.9; halfW = 0.5; break;
      }
      case 'font_gate': {
        const open = typeof Game !== 'undefined' && Game.fontGateOpen && Game.fontGateOpen();
        if (open) { put(0.1, 0.9, 0.2, '#3a3a34', 0.02); clickH = 0.3; halfW = 0.5; break; }   // folded flat when open
        for (let i = -2; i <= 2; i++) this.box(M4.mul(M4.translate(cx + i * 0.2, y + 0.85, cz), M4.scale(0.06, 1.7, 0.08)), hexRGB('#3f4148'));
        for (const yy of [0.3, 1.4]) this.box(M4.mul(M4.translate(cx, y + yy, cz), M4.scale(1.0, 0.09, 0.1)), hexRGB('#4a4c54'));
        clickH = 1.8; halfW = 0.5; break;
      }
      default: put(0.8, 0.8, 0.8, '#888'); break;
    }
    this.addClick(cx, y, cz, halfW, clickH, { kind: 'scenery', key: World.key(s.x, s.z), s });
  },

  // near-tile corners for click-picking (CPU, mirrors CanvasRenderer)
  buildTilePicks(P, l) {
    const R = Math.min(32, Math.round(18 + this.dist * 0.8)), x0 = Math.max(0, Math.floor(P.x) - R), x1 = Math.min(World.SIZE - 1, Math.floor(P.x) + R);
    const z0 = Math.max(0, Math.floor(P.z) - R), z1 = Math.min(World.SIZE - 1, Math.floor(P.z) + R);
    const h = World.L[l].h, corner = [], picks = [];
    for (let x = x0; x <= x1 + 1; x++) { corner[x] = []; for (let z = z0; z <= z1 + 1; z++) corner[x][z] = this.project(x, h[x][z], z); }
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (World.L[l].tile[x][z] === 'void') continue;
      const p00 = corner[x][z], p10 = corner[x + 1][z], p11 = corner[x + 1][z + 1], p01 = corner[x][z + 1];
      if (!p00 || !p10 || !p11 || !p01) continue;
      const d = (p00.d + p11.d) * 0.5;
      if (d > this._fogS + this._fogR + 2) continue;
      picks.push({ p00, p10, p11, p01, x, z, d });
    }
    picks.sort((a, b) => b.d - a.d);
    this.tilePicks = picks;
  },

  // ---- 2D overlay: HP bars, splats, names, floaters, bubbles, dest marker ----
  drawOverlay(G, now, l) {
    const ctx = this.octx;
    ctx.clearRect(0, 0, this.W, this.H);
    const P = G.player;
    if (G.destMark && now < G.destMark.until && G.destMark.layer === l) {
      const m = G.destMark;
      const p = this.project(m.x + 0.5, World.heightAt(l, m.x + 0.5, m.z + 0.5) + 0.05, m.z + 0.5);
      if (p) drawClickMark(ctx, p.x, p.y, this.H / p.d * 0.17, m.kind, (now - m.t0) / CLICK_MARK_MS);
    }
    // a sliver of green always survives above 0hp — see CanvasRenderer.drawBar
    const bar = (frac, x, y, sc, mine) => {
      const w = 0.9 * sc, hh = Math.max(3, 0.08 * sc);
      // the bar of whatever you're fighting gets a pale surround, so it stays legible
      // when several monsters are stood on the same tile and their bars overlap
      if (mine) { ctx.fillStyle = '#f4f0e0'; ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, hh + 4); }
      ctx.fillStyle = '#c02020'; ctx.fillRect(x - w / 2, y, w, hh);
      ctx.fillStyle = '#20c020'; ctx.fillRect(x - w / 2, y, frac <= 0 ? 0 : Math.max(2, w * frac), hh);
    };
    const splat = (e, x, y, sc) => { if (!e.splat || now > e.splat.until) return; ctx.fillStyle = e.splat.v > 0 ? '#c02020' : '#2828b8'; ctx.beginPath(); ctx.arc(x, y, 0.22 * sc, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold ' + (0.22 * sc | 0) + 'px Verdana'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e.splat.v, x, y); };
    // drawChatText lives in renderer.js so both engines draw overhead chat identically
    const bubble = (e, x, y, sc) => { if (!e.bubble || now > e.bubble.until) return; drawChatText(ctx, e.bubble.text, x, y, Math.max(9, 0.17 * sc | 0)); };
    const label = (txt, x, y, sc, col) => { ctx.font = 'bold ' + Math.max(9, 0.18 * sc | 0) + 'px Verdana'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#000'; ctx.fillText(txt, x + 1, y + 1); ctx.fillStyle = col; ctx.fillText(txt, x, y); };

    // Your target is drawn last so a pile of monsters can never bury the one bar that
    // matters, and its bar shows the moment you engage rather than on first blood.
    const mine = G.combatTarget ? G.combatTarget() : null;
    const drawNpcOverlay = (n, isMine) => {
      const fx = n.fx !== undefined ? n.fx : n.x + 0.5, fz = n.fz !== undefined ? n.fz : n.z + 0.5;
      const top = n.type === 'dragon' ? 2.9 : n.type === 'bear' ? 1.3 : n.type === 'rat' ? 0.7 : n.type === 'cow' ? 1.2 : n.type === 'chicken' ? 0.7 : 2.0;
      const p = this.project(fx, World.heightAt(l, fx, fz) + top, fz);
      if (!p) return; const sc = this.H / p.d;
      if (n.splat2 && now < n.splat2.until) splat({ splat: n.splat2 }, p.x + 0.34 * sc, p.y + 0.34 * sc, sc);
      if (isMine || now < n.showHpUntil) bar(n.hits / n.maxHits, p.x, p.y, sc, isMine);
      splat(n, p.x, p.y + 0.35 * sc, sc);
      bubble(n, p.x, p.y - 0.1 * sc, sc);
    };
    for (const n of G.npcs) {
      if (n.deadUntil || n.layer !== l || n === mine) continue;
      drawNpcOverlay(n, false);
    }
    if (mine && !mine.deadUntil && mine.layer === l) drawNpcOverlay(mine, true);
    for (const q of (G.players || [])) {
      if (q.layer !== l) continue;
      const p = this.project(q.x, World.heightAt(l, q.x, q.z) + 2.0, q.z);
      if (!p) continue; const sc = this.H / p.d;
      label(q.name, p.x, p.y - 0.1 * sc, sc, '#ffe97a');
      if (now < q.showHpUntil) bar(q.curHits / (q.maxHits || 10), p.x, p.y, sc);
      splat(q, p.x, p.y + 0.35 * sc, sc);
      bubble(q, p.x, p.y - 0.35 * sc, sc);
    }
    // local player
    {
      const p = this.project(P.x, World.heightAt(l, P.x, P.z) + 2.0, P.z);
      if (p) { const sc = this.H / p.d;
        const named = G.netMode && typeof Net !== 'undefined';
        if (named) label(Net.name, p.x, p.y - 0.1 * sc, sc, '#8fdcff');
        if (now < P.showHpUntil) bar(P.curHits / Game.level('hits'), p.x, p.y, sc);
        splat(P, p.x, p.y + 0.35 * sc, sc);
        // Chat floats above the name plate when there is one, and over your head
        // regardless — singleplayer included.
        bubble(P, p.x, p.y - (named ? 0.35 : 0.1) * sc, sc);
      }
    }
    for (const fl of (G.floaters || [])) {
      const k = (now - fl.t0) / 1200;
      const p = this.project(fl.x, World.heightAt(l, fl.x, fl.z) + 1.9, fl.z);
      if (!p) continue; const sc = this.H / p.d;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.font = 'bold ' + Math.max(11, 0.24 * sc | 0) + 'px Verdana'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const yy = p.y - k * 42; ctx.fillStyle = '#000'; ctx.fillText(fl.text, p.x + 1, yy + 1); ctx.fillStyle = fl.color; ctx.fillText(fl.text, p.x, yy);
      ctx.globalAlpha = 1;
    }
  }
};
