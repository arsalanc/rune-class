'use strict';
// ---------------------------------------------------------------------------
// gl-lib.js — WebGL 3D toolkit shared by GLRenderer: column-major mat4 (M4),
// colour helpers (hexRGB/mul3), low-poly mesh builders (_boxC/_boxM/_taperY/
// _pyr/_octa/_tri/_quad), and procedural texture painters. All file-global;
// must load BEFORE gl.js.
// ---------------------------------------------------------------------------

// ---- tiny column-major mat4 lib ----
const M4 = {
  ident() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; },
  mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  translate(x, y, z) { return [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]; },
  scale(x, y, z) { return [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]; },
  rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; },
  rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; },
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]; },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect,0,0,0, 0,f,0,0, 0,0,(far + near) * nf,-1, 0,0,2 * far * near * nf,0];
  },
  lookAt(ex, ey, ez, cx, cy, cz, ux, uy, uz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz;
    let zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
    let xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
            -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1];
  }
};

const GLR_VS = `
attribute vec3 a_pos; attribute vec3 a_norm; attribute vec3 a_col; attribute vec2 a_uv;
uniform mat4 u_viewProj; uniform mat4 u_model;
uniform vec3 u_tint; uniform vec3 u_lightDir; uniform float u_ambient; uniform vec3 u_camPos;
varying vec3 v_rgb; varying vec2 v_uv; varying float v_dist;
void main() {
  vec4 world = u_model * vec4(a_pos, 1.0);
  gl_Position = u_viewProj * world;
  vec3 n = normalize(mat3(u_model) * a_norm);
  float d = max(dot(n, normalize(u_lightDir)), 0.0);
  float light = u_ambient + (1.0 - u_ambient) * d;
  v_rgb = a_col * u_tint * light;   // lit vertex colour (texture multiplied in the FS)
  v_uv = a_uv;
  v_dist = length(u_camPos - world.xyz);
}`;

const GLR_FS = `
precision mediump float;
varying vec3 v_rgb; varying vec2 v_uv; varying float v_dist;
uniform float u_fogStart; uniform float u_fogRange; uniform vec3 u_fogColor;
uniform sampler2D u_tex; uniform float u_useTex; uniform vec2 u_uvOff; uniform vec2 u_uvScale;
uniform float u_alpha;
void main() {
  vec3 c = v_rgb;
  if (u_useTex > 0.5) c *= texture2D(u_tex, u_uvOff + v_uv * u_uvScale).rgb;
  float f = clamp((v_dist - u_fogStart) / u_fogRange, 0.0, 1.0);
  gl_FragColor = vec4(mix(c, u_fogColor, f), u_alpha);
}`;

function hexRGB(h) {
  return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
}
// scale an [r,g,b] toward brighter/darker, clamped — for edge highlights on metal
function mul3(c, k) { return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]; }

// ---------------------------------------------------------------------------
// Low-poly mesh building. Sculpt a model out of primitives into a flat vertex
// array [x,y,z, nx,ny,nz, r,g,b] (face normals from winding), then bake to one
// static VBO per model. Local model space: facing +z, base sitting on y=0.
// ---------------------------------------------------------------------------
function _tri(a, p0, p1, p2, col) {
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
  const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  a.push(p0[0], p0[1], p0[2], nx, ny, nz, col[0], col[1], col[2]);
  a.push(p1[0], p1[1], p1[2], nx, ny, nz, col[0], col[1], col[2]);
  a.push(p2[0], p2[1], p2[2], nx, ny, nz, col[0], col[1], col[2]);
}
function _quad(a, p0, p1, p2, p3, col) { _tri(a, p0, p1, p2, col); _tri(a, p0, p2, p3, col); }
function _ap(m, x, y, z) { // apply column-major mat4 to a point
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}
// axis-aligned box centered at (cx,cy,cz)
function _boxC(a, cx, cy, cz, sx, sy, sz, col) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const F = [
    [[hx,-hy,-hz],[hx,hy,-hz],[hx,hy,hz],[hx,-hy,hz]],
    [[-hx,-hy,hz],[-hx,hy,hz],[-hx,hy,-hz],[-hx,-hy,-hz]],
    [[-hx,hy,-hz],[-hx,hy,hz],[hx,hy,hz],[hx,hy,-hz]],
    [[-hx,-hy,hz],[-hx,-hy,-hz],[hx,-hy,-hz],[hx,-hy,hz]],
    [[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz],[-hx,-hy,hz]],
    [[-hx,-hy,-hz],[-hx,hy,-hz],[hx,hy,-hz],[hx,-hy,-hz]]
  ];
  for (const f of F) _quad(a, [f[0][0]+cx,f[0][1]+cy,f[0][2]+cz], [f[1][0]+cx,f[1][1]+cy,f[1][2]+cz], [f[2][0]+cx,f[2][1]+cy,f[2][2]+cz], [f[3][0]+cx,f[3][1]+cy,f[3][2]+cz], col);
}
// unit box transformed by a mat4 (for angled/rotated parts — necks, tails, arms)
function _boxM(a, m, col) {
  const F = [
    [[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]],
    [[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]],
    [[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]],
    [[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]],
    [[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]],
    [[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]]
  ];
  for (const f of F) _quad(a, _ap(m, f[0][0], f[0][1], f[0][2]), _ap(m, f[1][0], f[1][1], f[1][2]), _ap(m, f[2][0], f[2][1], f[2][2]), _ap(m, f[3][0], f[3][1], f[3][2]), col);
}
// vertical frustum: base footprint wb×db at cy0, top wt×dt at cy0+h
function _taperY(a, cx, cy0, cz, wb, db, wt, dt, h, col) {
  const y0 = cy0, y1 = cy0 + h, bx = wb/2, bz = db/2, tx = wt/2, tz = dt/2;
  _quad(a, [cx+bx,y0,cz+bz],[cx+tx,y1,cz+tz],[cx-tx,y1,cz+tz],[cx-bx,y0,cz+bz], col); // +z
  _quad(a, [cx-bx,y0,cz-bz],[cx-tx,y1,cz-tz],[cx+tx,y1,cz-tz],[cx+bx,y0,cz-bz], col); // -z
  _quad(a, [cx+bx,y0,cz-bz],[cx+tx,y1,cz-tz],[cx+tx,y1,cz+tz],[cx+bx,y0,cz+bz], col); // +x
  _quad(a, [cx-bx,y0,cz+bz],[cx-tx,y1,cz+tz],[cx-tx,y1,cz-tz],[cx-bx,y0,cz-bz], col); // -x
  _quad(a, [cx-tx,y1,cz-tz],[cx-tx,y1,cz+tz],[cx+tx,y1,cz+tz],[cx+tx,y1,cz-tz], col); // top
  _quad(a, [cx-bx,y0,cz+bz],[cx-bx,y0,cz-bz],[cx+bx,y0,cz-bz],[cx+bx,y0,cz+bz], col); // bottom
}
// pyramid: base w×d at cy0, apex up h
function _pyr(a, cx, cy0, cz, w, d, h, col) {
  const A=[cx-w/2,cy0,cz-d/2], B=[cx-w/2,cy0,cz+d/2], C=[cx+w/2,cy0,cz+d/2], D=[cx+w/2,cy0,cz-d/2], T=[cx,cy0+h,cz];
  _tri(a, B, C, T, col); _tri(a, C, D, T, col); _tri(a, D, A, T, col); _tri(a, A, B, T, col);
  _quad(a, A, B, C, D, col);
}
// octahedron canopy: mid square w at cy, apex up hUp / down hDn
function _octa(a, cx, cy, cz, w, hUp, hDn, col) {
  const A=[cx-w/2,cy,cz-w/2], B=[cx-w/2,cy,cz+w/2], C=[cx+w/2,cy,cz+w/2], D=[cx+w/2,cy,cz-w/2];
  const T=[cx,cy+hUp,cz], Bo=[cx,cy-hDn,cz];
  _tri(a, B, C, T, col); _tri(a, C, D, T, col); _tri(a, D, A, T, col); _tri(a, A, B, T, col);
  _tri(a, C, B, Bo, col); _tri(a, D, C, Bo, col); _tri(a, A, D, Bo, col); _tri(a, B, A, Bo, col);
}

// ---------------------------------------------------------------------------
// Procedural material textures. All art is generated on a 2D canvas at load
// (no external image files → still file://-friendly) and packed into a 4×4
// atlas. Terrain samples cells directly; box scenery selects a cell per draw.
// ---------------------------------------------------------------------------
const ATLAS_CELL = { grass: 0, sand: 1, rock: 2, path: 3, road: 4, floor: 5, dfloor: 6, dwall: 7, stone: 8, wood: 9, thatch: 10, metal: 11, marsh: 12, pale: 13 };
function _rnd(n) { return Math.random() * n; }
function _speckle(g, s, n, cols, wMax) {
  for (let i = 0; i < n; i++) { g.fillStyle = cols[(Math.random() * cols.length) | 0]; const w = 1 + _rnd(wMax || 2); g.fillRect(_rnd(s), _rnd(s), w, w); }
}
function _paintCell(g, s, kind) {
  switch (kind) {
    case 'grass':
      g.fillStyle = '#3f7a2f'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 1100; i++) { const r = Math.random(); g.fillStyle = r < .45 ? '#367027' : r < .78 ? '#4a8a37' : '#2c6420'; const x = _rnd(s), y = _rnd(s); g.fillRect(x, y, 1 + _rnd(1.5), 2 + _rnd(4)); }
      break;
    case 'sand':
      g.fillStyle = '#c9b787'; g.fillRect(0, 0, s, s); _speckle(g, s, 1400, ['#bfa877', '#d4c397', '#b09b6b'], 3); break;
    case 'rock':
      g.fillStyle = '#6b6660'; g.fillRect(0, 0, s, s); _speckle(g, s, 900, ['#5c5851', '#79746c', '#4f4b45'], 4);
      g.strokeStyle = 'rgba(30,28,25,0.5)'; g.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(_rnd(s), _rnd(s)); g.lineTo(_rnd(s), _rnd(s)); g.stroke(); } break;
    case 'path':
      g.fillStyle = '#8a6a45'; g.fillRect(0, 0, s, s); _speckle(g, s, 900, ['#7d5f3d', '#9a794f', '#6f5334'], 3);
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,45,28,0.5)'; g.beginPath(); g.arc(_rnd(s), _rnd(s), 1 + _rnd(2.5), 0, 7); g.fill(); } break;
    case 'road': case 'floor': case 'dfloor': case 'road_cobble': {
      const cobble = kind === 'road';
      if (kind === 'floor') { // wooden plank floor
        g.fillStyle = '#7a5734'; g.fillRect(0, 0, s, s);
        for (let py = 0; py < s; py += s / 4) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, py, s, 2); g.fillStyle = 'rgba(255,240,210,0.05)'; g.fillRect(0, py + 3, s, 2); }
        _speckle(g, s, 300, ['#6e4d2d', '#86633c'], 2); break;
      }
      const base = kind === 'dfloor' ? '#46433d' : '#6f6a63', mortar = kind === 'dfloor' ? '#2c2a26' : '#565048', cs = s / 4;
      g.fillStyle = mortar; g.fillRect(0, 0, s, s);
      for (let cx = 0; cx < 4; cx++) for (let cy = 0; cy < 4; cy++) {
        const off = cobble && cy % 2 ? cs / 2 : 0; g.fillStyle = base;
        g.fillRect(cx * cs + off + 2, cy * cs + 2, cs - 4, cs - 4);
      }
      _speckle(g, s, 500, kind === 'dfloor' ? ['#3d3a34', '#514d46'] : ['#655f58', '#7a746c'], 3); break;
    }
    case 'dwall':
      g.fillStyle = '#26241f'; g.fillRect(0, 0, s, s); _speckle(g, s, 1000, ['#1e1c18', '#302d27', '#151310'], 4); break;
    case 'stone': { // brick masonry
      const cs = s / 4; g.fillStyle = '#6f6a5f'; g.fillRect(0, 0, s, s);
      for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
        const off = row % 2 ? -cs / 2 : 0; g.fillStyle = ['#938c7d', '#8a8374', '#9c9585', '#847d6f'][(row * 5 + col) % 4];
        g.fillRect(col * cs + off + 2, row * cs + 2, cs - 4, cs - 4);
      }
      _speckle(g, s, 260, ['#7d7668', '#a49c8b'], 2); break;
    }
    case 'wood': { // vertical planks
      g.fillStyle = '#6e4a29'; g.fillRect(0, 0, s, s);
      for (let px = 0; px < s; px += s / 4) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(px, 0, 2, s); g.fillStyle = ['#75502d', '#664426', '#7c5631'][(px / (s / 4)) | 0 % 3]; g.fillRect(px + 3, 0, s / 4 - 5, s); }
      g.strokeStyle = 'rgba(50,32,16,0.35)'; g.lineWidth = 1;
      for (let i = 0; i < 18; i++) { const y = _rnd(s); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s / 3, y + _rnd(6) - 3, 2 * s / 3, y + _rnd(6) - 3, s, y); g.stroke(); } break;
    }
    case 'thatch':
      g.fillStyle = '#a5813f'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 500; i++) { g.strokeStyle = ['#b89250', '#8f6e34', '#c7a25e'][(Math.random() * 3) | 0]; g.lineWidth = 1 + _rnd(1.5); const x = _rnd(s), y = _rnd(s); g.beginPath(); g.moveTo(x, y); g.lineTo(x + _rnd(6) - 3, y + 8 + _rnd(6)); g.stroke(); } break;
    case 'metal':
      g.fillStyle = '#41434a'; g.fillRect(0, 0, s, s); _speckle(g, s, 700, ['#4c4e56', '#35373d', '#565963'], 3); break;
    case 'marsh': {
      // Mourncross flats: drowned grass gone grey-green, with standing water in the hollows
      g.fillStyle = '#4a5a4a'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 700; i++) { const r = Math.random(); g.fillStyle = r < .4 ? '#3f5041' : r < .75 ? '#556450' : '#35443a'; g.fillRect(_rnd(s), _rnd(s), 1 + _rnd(1.5), 2 + _rnd(5)); }
      for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(70,102,88,0.45)'; g.beginPath(); g.ellipse(_rnd(s), _rnd(s), 3 + _rnd(9), 2 + _rnd(6), _rnd(3), 0, 7); g.fill(); }
      _speckle(g, s, 200, ['#68806c', '#2e3a32'], 2); break;
    }
    case 'pale': { // bleached Mourncross masonry — the same brick, sun-and-salt scoured
      const cs = s / 4; g.fillStyle = '#7d7f7a'; g.fillRect(0, 0, s, s);
      for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
        const off = row % 2 ? -cs / 2 : 0; g.fillStyle = ['#b6b8b0', '#a8aaa3', '#c0c2ba', '#9ea09a'][(row * 5 + col) % 4];
        g.fillRect(col * cs + off + 2, row * cs + 2, cs - 4, cs - 4);
      }
      _speckle(g, s, 320, ['#8f918b', '#c8cac2'], 2); break;
    }
    default:
      g.fillStyle = '#888'; g.fillRect(0, 0, s, s);
  }
}
function _buildAtlasCanvas() {
  const S = 512, cell = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const order = ['grass', 'sand', 'rock', 'path', 'road', 'floor', 'dfloor', 'dwall', 'stone', 'wood', 'thatch', 'metal', 'marsh', 'pale'];
  for (let i = 0; i < order.length; i++) {
    const cx = (i % 4) * cell, cy = ((i / 4) | 0) * cell;
    g.save(); g.beginPath(); g.rect(cx, cy, cell, cell); g.clip(); g.translate(cx, cy); _paintCell(g, cell, order[i]); g.restore();
  }
  return cv;
}
function _buildWaterCanvas() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, S); grad.addColorStop(0, '#2b5f96'); grad.addColorStop(1, '#274f7f');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  // wavy caustic streaks that wrap on both axes (periodic → seamless when tiled/scrolled)
  for (let k = 0; k < 3; k++) {
    g.strokeStyle = ['rgba(150,200,240,0.22)', 'rgba(120,175,220,0.16)', 'rgba(200,225,250,0.14)'][k];
    g.lineWidth = 2 + k;
    for (let b = 0; b < 5; b++) {
      g.beginPath();
      const yb = (b + 0.3 * k) * S / 5;
      for (let x = 0; x <= S; x += 4) { const y = yb + Math.sin((x / S) * Math.PI * 2 * (2 + k) + b) * 6; x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
  }
  for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(220,240,255,0.18)'; g.fillRect(_rnd(S), _rnd(S), 2, 2); }
  return cv;
}
