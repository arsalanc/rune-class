'use strict';
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNoise(rand, cells, size) {
  const n = cells + 2, g = [];
  for (let i = 0; i < n; i++) { g[i] = []; for (let j = 0; j < n; j++) g[i][j] = rand(); }
  return function (x, z) {
    const s = cells / size;
    const u = x * s, v = z * s;
    const xi = Math.floor(u), zi = Math.floor(v);
    const fx = u - xi, fz = v - zi;
    const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    const a = g[xi][zi], b = g[xi + 1][zi], c = g[xi][zi + 1], d = g[xi + 1][zi + 1];
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  };
}

const WALKABLE = { grass: 1, sand: 1, rock: 1, path: 1, floor: 1, dfloor: 1, road: 1, marsh: 1 };

const World = {
  // 192×192. The extra land is all south (z>128) and east of the river (x>105):
  // the southern highway needs real length for travel to feel like a journey.
  SIZE: 192,
  SPAWN: { x: 64, z: 64 },
  LADDER: { x: 48, z: 46 },
  // The Mining Guild footprint, both floors (hall above, Deep Gallery below). Inside it
  // Mining gets an invisible +7 and rocks come back twice as fast — see Combat.
  GUILD: { x0: 18, z0: 33, x1: 29, z1: 43 },
  L: [null, null],
  key(x, z) { return x + ',' + z; },
  inGuild(x, z) {
    const g = this.GUILD;
    return x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1;
  },

  gen() {
    this.L[0] = this.genSurface();
    this.L[1] = this.genDungeon();
  },

  genSurface() {
    const S = this.SIZE, rand = mulberry32(1337);
    // noise cell counts scale with S so hills stay the same size on a bigger map
    const n1 = makeNoise(rand, Math.round(S / 14), S), n2 = makeNoise(rand, Math.round(S / 5), S);
    const lay = { h: [], tile: [], scenery: new Map() };
    for (let x = 0; x <= S; x++) {
      lay.h[x] = [];
      for (let z = 0; z <= S; z++)
        lay.h[x][z] = Math.max(0, (n1(x, z) - 0.35) * 4 + (n2(x, z) - 0.5) * 0.7);
    }
    for (let x = 0; x < S; x++) {
      lay.tile[x] = [];
      for (let z = 0; z < S; z++) {
        const rc = 94 + Math.sin(z * 0.07) * 7 + (n2(0, z) - 0.5) * 6;
        const d = Math.abs(x + 0.5 - rc);
        let t = 'grass';
        if (d < 2.6) t = 'water';
        else if (d < 4.2) t = 'sand';
        if (Math.hypot(x - 30, z - 30) < 9 && t === 'grass') t = 'rock';
        lay.tile[x][z] = t;
      }
    }
    // flatten water and beaches
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
      const t = lay.tile[x][z];
      if (t !== 'water' && t !== 'sand') continue;
      const lim = t === 'water' ? -0.35 : 0.15;
      for (const [cx, cz] of [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]])
        lay.h[cx][cz] = Math.min(lay.h[cx][cz], lim);
    }
    // flatten the two town areas + the road corridor between them (soft blend ring)
    const TOWNS = [{ x0: 46, z0: 42, x1: 82, z1: 84 }, { x0: 52, z0: 8, x1: 90, z1: 32 }, { x0: 61, z0: 8, x1: 66, z1: 84 }, { x0: 14, z0: 44, x1: 38, z1: 66 }, { x0: 20, z0: 34, x1: 30, z1: 42 }, { x0: 40, z0: 84, x1: 54, z1: 95 },
                   // the southern highway and everything strung along it
                   { x0: 60, z0: 84, x1: 68, z1: 160 },   // the road corridor itself
                   { x0: 24, z0: 100, x1: 44, z1: 122 },  // Rookmoor (Ava)
                   { x0: 46, z0: 108, x1: 80, z1: 130 },  // Willowmere
                   { x0: 46, z0: 127, x1: 63, z1: 148 },  // Chapman's Cross (trade market)
                   { x0: 28, z0: 134, x1: 56, z1: 158 },  // The Ringwall (druids + rune altars)
                   { x0: 74, z0: 136, x1: 84, z1: 148 },  // the burnt steading
                   { x0: 52, z0: 148, x1: 64, z1: 160 },  // the wayside inn
                   { x0: 42, z0: 158, x1: 96, z1: 190 },  // Southmarch
                   // east of the river: the causeway, the Mourncross flats and the town
                   { x0: 80, z0: 60, x1: 108, z1: 66 },   // the causeway corridor
                   { x0: 104, z0: 38, x1: 152, z1: 90 }]; // the flats + Mourncross
    for (const T of TOWNS) {
      for (let x = T.x0 - 6; x <= T.x1 + 6; x++) for (let z = T.z0 - 6; z <= T.z1 + 6; z++) {
        if (x < 0 || z < 0 || x > S || z > S) continue;
        const dx = Math.max(0, T.x0 - x, x - T.x1), dz = Math.max(0, T.z0 - z, z - T.z1);
        const w = Math.max(0, 1 - Math.max(dx, dz) / 6);
        lay.h[x][z] = lay.h[x][z] * (1 - w) + 0.5 * w;
      }
    }

    const setTile = (x, z, t) => { lay.tile[x][z] = t; };
    // `mat` tags a piece of scenery with its settlement's building material, so each
    // town reads as its own place (see MATERIALS in gl.js / renderer.js).
    const put = (type, x, z, mat) => {
      const s = { type, x, z, respawnAt: 0 };
      if (mat) s.mat = mat;
      lay.scenery.set(this.key(x, z), s);
      return s;
    };
    const building = (x0, z0, x1, z1, doors, wallType, mat) => {
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        setTile(x, z, 'floor');
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        if (edge && !doors.includes(x + ',' + z)) put(wallType || 'wall', x, z, mat);
      }
    };

    // ---- Lumbridge: warm timber and thatch, the green riverside home town ----
    const LB = 'timber';
    const road = (x, z) => { if (x >= 0 && z >= 0 && x < S && z < S) setTile(x, z, 'road'); };
    // two main cobbled streets crossing at the square
    for (let z = 42; z <= 84; z++) { road(63, z); road(64, z); }
    for (let x = 50; x <= 80; x++) { road(x, 63); road(x, 64); }
    // the central cobbled plaza
    for (let x = 57; x <= 71; x++) for (let z = 59; z <= 69; z++) road(x, z);

    // Castle set-piece (north) — houses the bank; the main road runs through its
    // north and south gates, so it doubles as the gateway to the north road.
    // Tall crenellated (rampart) walls + corner towers give it a multi-storey keep feel.
    building(56, 44, 72, 56, ['63,56', '64,56', '63,44', '64,44'], 'rampart');
    for (const [tx, tz] of [[56, 44], [72, 44], [56, 56], [72, 56]]) put('tower', tx, tz);
    for (const bx of [58, 60, 66, 68]) put('bank_booth', bx, 46);
    // Kitchen (west) — the cooking range lives indoors now
    building(50, 60, 56, 68, ['56,63', '56,64'], 'wall', LB);
    put('range', 53, 64);
    // General store (east) — counters flanking the entrance lane, stocked shelves at the back
    building(72, 60, 80, 68, ['72,63', '72,64'], 'wall', LB);
    for (const [cx, cz] of [[74, 62], [74, 66]]) put('shop_counter', cx, cz, LB);
    for (const [sx, sz] of [[79, 61], [79, 63], [79, 65], [79, 67]]) put('shelves', sx, sz, LB);
    // Church with altar (south-west) — stained-glass windows down the nave
    building(52, 71, 61, 81, ['56,71', '57,71'], 'wall', LB);
    put('altar', 56, 76);
    for (const [gx, gz] of [[53, 81], [56, 81], [59, 81]]) put('stained_glass', gx, gz);                                    // south wall (faces ±z)
    for (const gz of [74, 78]) { put('stained_glass', 61, gz); lay.scenery.get(this.key(61, gz)).rot = Math.PI / 2; }       // east wall (rotate to face ±x)
    // Blacksmith (south-east) — furnace and anvil now under a roof
    building(67, 71, 77, 81, ['71,71', '72,71'], 'wall', LB);
    put('furnace', 74, 77);
    put('anvil', 70, 78);
    // Fountain centrepiece, street lamps and a signpost
    put('fountain', 64, 61);
    for (const [lx, lz] of [[58, 60], [70, 60], [58, 68], [70, 68], [61, 58], [67, 58], [61, 70], [67, 70]])
      if (!lay.scenery.has(this.key(lx, lz))) put('lamppost', lx, lz);
    put('signpost', 65, 82);
    // ruin with the dungeon ladder (west of the castle)
    put('ladder_down', this.LADDER.x, this.LADDER.z);
    for (const [wx, wz] of [[46, 44], [50, 44], [46, 48], [50, 48], [46, 46], [48, 44]]) put('wall', wx, wz);

    // ---- Lumbridge town walls: west & south ramparts, each with an open gate & a road leading out ----
    const perim = (x, z, type) => { if (!lay.scenery.has(this.key(x, z))) put(type, x, z); };
    // west wall (x=49) — open gateway where the farm path leaves (z 51-53), gatehouses flanking it
    for (let z = 44; z <= 83; z++) {
      if (z >= 51 && z <= 53) continue;
      perim(49, z, (z === 50 || z === 54) ? 'gatehouse' : 'rampart');
    }
    // south wall (z=83) — open gateway on the main road (x 62-65), gatehouses flanking it
    for (let x = 49; x <= 80; x++) {
      if (x >= 62 && x <= 65) continue;
      perim(x, 83, (x === 61 || x === 66) ? 'gatehouse' : 'rampart');
    }
    for (let z = 84; z <= 90; z++) { road(63, z); road(64, z); } // the south road continues out of the gate

    // ---- the north road through the woods, and Aldervale: cold grey northern stone ----
    const AV = 'northstone';
    for (let z = 8; z <= 42; z++) { road(63, z); road(64, z); }
    // Aldervale market plaza
    for (let x = 57; x <= 71; x++) for (let z = 13; z <= 25; z++) road(x, z);
    for (let x = 52; x <= 78; x++) { road(x, 19); road(x, 20); }
    // second bank (west) — a fortified two-storey bank with corner towers
    building(52, 12, 58, 20, ['58,15', '58,16'], 'rampart', AV);
    for (const [tx, tz] of [[52, 12], [58, 12], [52, 20], [58, 20]]) put('tower', tx, tz, AV);
    for (const bx of [54, 56]) put('bank_booth', bx, 13);
    // the armoury (east) — sells iron & steel gear; counter + weapon racks inside
    building(70, 12, 78, 20, ['70,15', '70,16'], 'wall', AV);
    for (const [cx, cz] of [[72, 14], [72, 18]]) put('shop_counter', cx, cz, AV);
    for (const [sx, sz] of [[77, 13], [77, 15], [77, 17], [77, 19]]) put('shelves', sx, sz, AV);
    // the tavern (south-east) with its own range
    building(70, 24, 78, 31, ['71,24', '72,24'], 'wall', AV);
    put('range', 75, 28);
    // a hero statue centrepiece + a well + market stalls
    put('statue', 64, 16);
    put('well', 60, 22);
    for (const [sx, sz] of [[60, 17], [62, 17], [66, 17], [68, 17]]) put('stall', sx, sz);
    for (const [lx, lz] of [[58, 14], [70, 14], [58, 24], [70, 24], [61, 12], [67, 12]])
      if (!lay.scenery.has(this.key(lx, lz))) put('lamppost', lx, lz);
    put('signpost', 64, 30);

    // ---- Green Vale Farm (west) — reached by a path from Lumbridge's west gate ----
    const path = (x, z) => { if (x >= 0 && z >= 0 && x < S && z < S && lay.tile[x][z] === 'grass') setTile(x, z, 'path'); };
    for (let x = 26; x <= 50; x++) path(x, 52); // country path east to town
    building(20, 46, 25, 51, ['25,48', '25,49']); // farmhouse
    put('windmill', 31, 46);
    put('signpost', 37, 52);
    // wheat field
    for (let x = 28; x <= 35; x++) for (let z = 48; z <= 54; z++) if ((x * 3 + z) % 2 === 0 && lay.tile[x][z] === 'grass') put('wheat', x, z);
    // cow pen (fenced, with a gate gap on the east side)
    const pen = { x0: 15, z0: 53, x1: 22, z1: 59 };
    for (let x = pen.x0; x <= pen.x1; x++) { put('fence', x, pen.z0); put('fence', x, pen.z1); }
    for (let z = pen.z0; z <= pen.z1; z++) { put('fence', pen.x0, z); put('fence', pen.x1, z); }
    lay.scenery.delete(this.key(pen.x1, 56)); // gate opening
    // the allotments — six patches you rake, sow and come back to
    for (const [ax, az] of [[26, 60], [28, 60], [30, 60], [26, 62], [28, 62], [30, 62]]) put('farm_patch', ax, az);
    for (let x = 24; x <= 32; x++) { put('fence', x, 59); put('fence', x, 64); }
    for (let z = 59; z <= 64; z++) { put('fence', 24, z); put('fence', 32, z); }
    lay.scenery.delete(this.key(28, 59)); lay.scenery.delete(this.key(29, 59));   // gate onto the farm path
    put('signpost', 33, 61);
    // chicken coop & haystacks
    put('chicken_coop', 27, 57);
    put('haystack', 26, 47); put('haystack', 33, 57); put('haystack', 18, 49);

    // ---- Mining Guild (by the mine, north) — a level-gated ore hall ----
    // It used to be a 8x7 room holding ore you could already get in the open pit, which
    // made the level-20 door pointless. Now it is a proper hall: silver, gold and gems
    // are found nowhere else on the surface, it smelts and banks on site, and a ladder
    // drops to the Deep Gallery where the only mithril and adamantite in the world sit.
    building(18, 33, 29, 43, ['29,38']);
    put('guild_door', 29, 38);
    for (const [rx, rz, rt] of [
      [20, 35, 'rock_coal'], [22, 35, 'rock_coal'], [24, 35, 'rock_iron'], [26, 35, 'rock_coal'],
      [20, 37, 'rock_silver'], [27, 35, 'rock_iron'],
      [20, 41, 'rock_gold'], [22, 41, 'rock_gem'], [24, 41, 'rock_silver'], [26, 41, 'rock_gold'],
      [27, 41, 'rock_gem'], [27, 39, 'rock_coal']
    ]) put(rt, rx, rz);
    put('bank_booth', 19, 39); put('bank_booth', 19, 40);
    put('furnace', 21, 39);                 // smelt where you mine — the guild's real convenience
    put('anvil', 22, 39);
    put('ladder_down', 24, 38);             // to the Deep Gallery (mithril + adamantite)
    put('lamppost', 25, 37); put('lamppost', 25, 39);
    put('signpost', 31, 38);

    // ---- Beginner's Scar (west of Lumbridge) — copper and tin only ----
    // Somewhere to learn the swing without walking to the north mine.
    for (let x = 42; x <= 47; x++) for (let z = 56; z <= 61; z++)
      if (Math.hypot(x - 44.5, z - 58.5) < 3.4) setTile(x, z, 'rock');
    for (const [rx, rz, rt] of [[43, 57, 'rock_copper'], [45, 57, 'rock_tin'], [42, 59, 'rock_tin'],
                                [46, 59, 'rock_copper'], [44, 60, 'rock_copper'], [46, 57, 'rock_tin']])
      put(rt, rx, rz);
    put('signpost', 47, 58);

    // ---- Blackscar Quarry (north of the mine) — coal country ----
    // Coal is the bottleneck on every bar above steel, so it gets a site of its own.
    for (let x = 25; x <= 35; x++) for (let z = 7; z <= 15; z++)
      if (Math.hypot((x - 30) * 0.8, z - 11) < 5) { setTile(x, z, 'rock'); lay.scenery.delete(this.key(x, z)); }
    for (const [rx, rz, rt] of [[27, 9, 'rock_coal'], [30, 8, 'rock_coal'], [33, 9, 'rock_coal'],
                                [26, 12, 'rock_coal'], [30, 11, 'rock_iron'], [34, 12, 'rock_coal'],
                                [28, 14, 'rock_coal'], [32, 14, 'rock_iron'], [30, 13, 'rock_coal']])
      put(rt, rx, rz);
    put('signpost', 30, 16);

    // ---- Combat Training Yard (south) — safe-spot practice pen ----
    put('signpost', 47, 85);
    // a fully-fenced goblin pen: melee can't reach in, but ranged/magic (reach 5) can
    const tpen = { x0: 45, z0: 89, x1: 49, z1: 93 };
    for (let x = tpen.x0; x <= tpen.x1; x++) { put('fence', x, tpen.z0); put('fence', x, tpen.z1); }
    for (let z = tpen.z0; z <= tpen.z1; z++) { put('fence', tpen.x0, z); put('fence', tpen.x1, z); }
    put('haystack', 42, 88); put('haystack', 52, 88); // target butts

    // ================= The Southern Highway =================
    // Lumbridge's south gate to Southmarch is ~95 tiles of road. Travel is meant to
    // feel like a journey, so the highway is paced with a landmark every 15-25 tiles:
    //   downs (highwaymen) → Willowmere village → stone circle / burnt steading
    //   → wayside inn → Southmarch. Rookmoor (Ava) hangs off it to the west.
    const perim2 = (x, z, type, mat) => { if (!lay.scenery.has(this.key(x, z))) put(type, x, z, mat); };
    for (let z = 90; z <= 158; z++) { road(63, z); road(64, z); }
    // milestones count down the miles; examine text is generated from the number
    for (const [mz, n] of [[96, 9], [112, 7], [128, 5], [146, 3], [156, 1]])
      put('milestone', 66, mz).miles = n;

    // ---- Willowmere: a small village of dark timber around a still mere ----
    // Deliberately the opposite of the walled cities — no wall, no plan, just
    // cottages leaning toward the water under willows.
    const WM = 'darkwood';
    for (let x = 54; x <= 78; x++) { road(x, 118); road(x, 119); }        // the one street
    building(56, 111, 62, 116, ['62,113', '62,114'], 'wall', WM);        // cottages
    building(68, 111, 74, 116, ['68,113', '68,114'], 'wall', WM);
    building(55, 121, 61, 127, ['58,121', '59,121'], 'wall', WM);
    building(69, 121, 77, 127, ['72,121', '73,121'], 'wall', WM);
    put('range', 58, 125); put('shop_counter', 71, 124, WM); put('shelves', 76, 123, WM); put('shelves', 76, 125, WM);
    put('well', 66, 116);
    for (const [sx, sz] of [[60, 117], [63, 117], [67, 117], [70, 117]]) put('stall', sx, sz);   // open-air market, no shopfronts
    for (const [ax, az] of [[61, 120], [69, 120]]) put('market_awning', ax, az);
    // the mere itself: a still pond ringed with willows
    for (let x = 48; x <= 53; x++) for (let z = 120; z <= 125; z++) {
      setTile(x, z, 'water');
      for (const [cx, cz] of [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]]) lay.h[cx][cz] = -0.3;
    }
    for (const [wx, wz] of [[47, 119], [47, 123], [47, 126], [54, 120], [54, 124], [50, 127], [52, 118], [49, 118]])
      if (!lay.scenery.has(this.key(wx, wz))) put('willow', wx, wz);
    put('fishing_spot', 54, 122);
    put('signpost', 65, 116); put('signpost', 65, 128);
    for (const [lx, lz] of [[62, 116], [68, 116], [62, 121], [68, 121]]) if (!lay.scenery.has(this.key(lx, lz))) put('lamppost', lx, lz);

    // ---- Chapman's Cross: the trade market on the highway ----
    // A chapman is a travelling pedlar, and this is where four of them stopped travelling.
    // Four shopfronts facing one street, which is the whole town: no walls, no castle,
    // no quest — you come here to spend. It sits between Willowmere and the wayside inn,
    // clear of the downs so the highwaymen don't wander into the market.
    const CC = 'timber';
    for (let x = 47; x <= 64; x++) { road(x, 137); road(x, 138); }        // the street, joining the highway
    for (let x = 47; x <= 62; x++) { road(x, 136); road(x, 139); }        // widened into a plaza
    building(48, 129, 53, 135, ['51,135'], 'wall', CC);                   // Hollis' Blades (weapons)
    building(56, 129, 61, 135, ['58,135'], 'wall', CC);                   // The Ironmonger (armour)
    building(48, 140, 53, 146, ['51,140'], 'wall', CC);                   // The Fletcher's Rest (ranged)
    building(56, 140, 61, 146, ['58,140'], 'wall', CC);                   // Sabra's Runes (magic)
    // shopfronts: a counter by each door, stock on the back wall
    for (const [cx, cz] of [[50, 134], [59, 134], [50, 141], [59, 141]]) put('shop_counter', cx, cz, CC);
    for (const [sx, sz] of [[49, 130], [51, 130], [57, 130], [60, 130],
                            [49, 145], [51, 145], [57, 145], [60, 145]]) put('shelves', sx, sz, CC);
    put('well', 54, 137);
    put('anvil', 52, 131); put('furnace', 49, 133);                        // the blade-smith works out back
    // a trade sign beside each door, so you can read the street without entering
    put('sign_weapon', 52, 136); put('sign_armour', 57, 136);
    put('sign_ranged', 52, 139); put('sign_magic', 57, 139);
    for (const [ax, az] of [[55, 136], [55, 139]]) put('market_awning', ax, az);
    for (const [tx, tz] of [[47, 135], [47, 140], [62, 135], [62, 140]]) put('stall', tx, tz);
    for (const [lx, lz] of [[54, 135], [54, 140], [46, 137], [63, 136]])
      if (!lay.scenery.has(this.key(lx, lz))) put('lamppost', lx, lz);
    put('signpost', 65, 137);

    // ---- two woods worth walking to: maple and yew groves ----
    // Deliberately groves rather than scattered trees. A yew is a Woodcutting 60 tree and
    // the only source of the best bow in the game; it should be somewhere you go on
    // purpose, not something you trip over outside the town gate.
    for (let x = 12; x <= 20; x++) for (let z = 60; z <= 68; z++)
      if (lay.tile[x][z] === 'grass' && !lay.scenery.has(this.key(x, z)) &&
          Math.hypot(x - 16, z - 64) < 4.6 && rand() < 0.55) put('maple', x, z);
    put('signpost', 21, 64);
    for (let x = 6; x <= 14; x++) for (let z = 120; z <= 128; z++)
      if (lay.tile[x][z] === 'grass' && !lay.scenery.has(this.key(x, z)) &&
          Math.hypot(x - 10, z - 124) < 4.4 && rand() < 0.5) put('yew', x, z);
    put('signpost', 15, 124);

    // ---- the stone circle (west of the road): dark wizards, and a wayside shrine ----
    const CIRCLE = [[36, 142], [40, 142], [42, 145], [40, 148], [36, 148], [34, 145]];
    for (const [cx, cz] of CIRCLE) put('pylon', cx, cz);          // plain menhirs (no pidx = not the Ava puzzle)
    put('shrine', 38, 145);
    for (let x = 44; x <= 60; x++) path(x, 145);                   // the spur track off the highway
    put('signpost', 61, 145);

    // ---- The Ringwall: the druid circle, the rune altars and the ruin ----
    // Both new skills hang off this one place, which is why it grew from a menhir ring
    // into a settlement: eleven altars, a herb garden, an apothecary and the arch down
    // into the essence mine.
    const alt = (rune, x, z) => { const a = put('rune_altar', x, z); a.rune = rune; return a; };
    // the six low altars ring the shrine; the five deep ones sit behind it
    const LOW = [['air', 34, 140], ['mind', 38, 139], ['water', 42, 140],
                 ['earth', 34, 150], ['fire', 38, 151], ['body', 42, 150]];
    for (const [r, x, z] of LOW) alt(r, x, z);
    const DEEP = [['cosmic', 30, 142], ['chaos', 30, 146], ['nature', 46, 142],
                  ['law', 46, 146], ['death', 38, 155]];
    for (const [r, x, z] of DEEP) alt(r, x, z);
    put('rune_rift', 31, 145);                                     // the arch into the essence mine
    // the druids' own ground: a walled garden of herb patches and Ilma's shop
    building(46, 150, 54, 157, ['46,153', '46,154'], 'wall', 'darkwood');
    for (const [cx, cz] of [[48, 152], [48, 155]]) put('shop_counter', cx, cz, 'darkwood');
    for (const [sx, sz] of [[53, 151], [53, 153], [53, 155], [53, 156]]) put('shelves', sx, sz, 'darkwood');
    for (const [hx, hz] of [[33, 137], [36, 136], [40, 136], [43, 137], [32, 152], [44, 153]]) put('herb_patch', hx, hz);
    for (const [lx, lz] of [[36, 144], [40, 144], [36, 146], [40, 146]])
      if (!lay.scenery.has(this.key(lx, lz))) put('lamppost', lx, lz);

    // ---- the burnt-out steading (east of the road) ----
    for (const [rx, rz] of [[78, 140], [79, 140], [80, 141], [78, 143], [81, 143], [80, 144], [77, 142]]) put('rubble', rx, rz);
    put('fire', 79, 142);
    for (let x = 66; x <= 76; x++) path(x, 142);

    // ---- the wayside inn: the only bed between the two cities ----
    building(54, 150, 61, 157, ['61,153', '61,154'], 'wall', 'timber');
    put('range', 56, 155); put('shop_counter', 57, 152, 'timber');
    put('signpost', 62, 154);
    for (const [lx, lz] of [[62, 151], [62, 157]]) put('lamppost', lx, lz);

    // ---- Southmarch: the largest city on the map, built in southern sandstone ----
    const SM = 'sandstone';
    const CITY = { x0: 44, z0: 160, x1: 94, z1: 188 };
    for (let x = CITY.x0; x <= CITY.x1; x++) {
      if (!(x >= 62 && x <= 65)) perim2(x, CITY.z0, (x === 61 || x === 66) ? 'gatehouse' : 'rampart', SM); // north (highway)
      if (!(x >= 62 && x <= 65)) perim2(x, CITY.z1, (x === 61 || x === 66) ? 'gatehouse' : 'rampart', SM); // south (dock road)
    }
    for (let z = CITY.z0; z <= CITY.z1; z++) {
      if (!(z >= 173 && z <= 175)) perim2(CITY.x0, z, (z === 172 || z === 176) ? 'gatehouse' : 'rampart', SM); // west gate
      perim2(CITY.x1, z, 'rampart', SM);
    }
    // three great streets + a broad market plaza
    for (let z = CITY.z0; z <= CITY.z1; z++) { road(63, z); road(64, z); }
    for (let x = CITY.x0; x <= CITY.x1; x++) { road(x, 173); road(x, 174); }
    for (let x = CITY.x0; x <= CITY.x1; x++) { road(x, 165); road(x, 183); }
    for (let x = 54; x <= 76; x++) for (let z = 167; z <= 181; z++) road(x, z);
    for (let z = 173; z <= 174; z++) for (let x = 30; x < CITY.x0; x++) road(x, z);   // west road out of the gate
    for (let z = CITY.z1 + 1; z <= 190; z++) { road(63, z); road(64, z); }            // the dock road

    // the counting-house (north-west), fortified with corner towers
    building(47, 162, 56, 171, ['56,166', '56,167'], 'rampart', SM);
    for (const [tx, tz] of [[47, 162], [56, 162], [47, 171], [56, 171]]) put('tower', tx, tz, SM);
    for (const bx of [49, 51, 53]) put('bank_booth', bx, 163);
    // Southmarch Outfitters (north-east)
    building(72, 162, 84, 171, ['72,166', '72,167'], 'wall', SM);
    for (const [cx, cz] of [[74, 164], [74, 169]]) put('shop_counter', cx, cz, SM);
    for (const [sx, sz] of [[83, 163], [83, 165], [83, 167], [83, 169]]) put('shelves', sx, sz, SM);
    // the cathedral (south-west) — the grandest building in the province
    building(46, 178, 60, 188, ['53,178', '54,178'], 'wall', SM);
    put('altar', 53, 183);
    for (const gx of [48, 51, 55, 58]) put('stained_glass', gx, 188);
    for (const gz of [181, 185]) { put('stained_glass', 46, gz, SM).rot = Math.PI / 2; }
    for (const gz of [181, 185]) { put('stained_glass', 60, gz, SM).rot = Math.PI / 2; }
    // the guildhall & tavern (south-east)
    building(70, 178, 86, 187, ['77,178', '78,178'], 'wall', SM);
    put('range', 83, 184);
    for (const [cx, cz] of [[72, 180], [72, 185]]) put('shop_counter', cx, cz, SM);
    // the market
    put('fountain', 64, 170);
    put('statue', 64, 178);
    put('well', 57, 177);
    for (const [sx, sz] of [[56, 168], [59, 168], [69, 168], [72, 168], [56, 180], [72, 180], [59, 171], [69, 171]]) put('stall', sx, sz);
    for (const [ax, az] of [[55, 170], [73, 170], [55, 179], [73, 179]]) put('market_awning', ax, az);
    for (const [kx, kz] of [[66, 185], [67, 186], [61, 186], [60, 185], [68, 163], [69, 164]]) put('crate', kx, kz);
    for (const [lx, lz] of [[58, 164], [70, 164], [58, 172], [70, 172], [58, 182], [70, 182], [52, 174], [76, 174]])
      if (!lay.scenery.has(this.key(lx, lz))) put('lamppost', lx, lz);
    put('signpost', 65, 161); put('signpost', 45, 175);

    // ======== EAST OF THE RIVER: the Mourncross flats and the drowned town ========
    // Everything here reads cold on purpose: marsh instead of grass, bleached masonry
    // instead of timber, bare trees, and graves where other towns put gardens.
    const MX = 'pale', mrand = mulberry32(7717);   // own RNG: don't disturb the tree scatter
    // The town-flatten pass near the top lifts everything inside its boxes to 0.5,
    // including river tiles — harmless where a box sits on dry land, but the causeway
    // and the flats both reach the water. Drop water and beach back to their own
    // levels here so the river still reads as a river on either side of the crossing.
    for (let x = 76; x <= 152; x++) for (let z = 32; z <= 96; z++) {
      if (x >= S || z >= S) continue;
      const t = lay.tile[x][z];
      if (t !== 'water' && t !== 'sand') continue;
      const lim = t === 'water' ? -0.35 : 0.15;
      for (const [cx, cz] of [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]]) lay.h[cx][cz] = Math.min(lay.h[cx][cz], lim);
    }
    // The causeway: the only dry crossing. It is a raised stone bank, so the river
    // tiles under it are re-laid as road and lifted clear of the water line.
    for (let z = 61; z <= 63; z++) for (let x = 80; x <= 107; x++) {
      setTile(x, z, 'road');
      for (const [cx, cz] of [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]]) lay.h[cx][cz] = Math.max(lay.h[cx][cz], 0.32);
    }
    const CL = 'coldlamp';   // Mourncross lamps burn blue — the first thing you notice from the causeway
    for (const [lx, lz] of [[81, 60], [81, 64], [88, 60], [88, 64], [95, 60], [95, 64], [102, 60], [102, 64]]) put('lamppost', lx, lz, CL);
    put('signpost', 79, 62); put('milestone', 108, 62);

    // the flats: sodden ground all around the town, with sand banks and slime seeps
    for (let x = 104; x <= 151; x++) for (let z = 38; z <= 90; z++) {
      if (x >= S || z >= S) continue;
      if (lay.tile[x][z] !== 'grass') continue;
      // feather the boundary: the flats should bleed into the grass over a few tiles
      // rather than stopping dead on the edge of a rectangle
      const edge = Math.min(x - 104, 151 - x, z - 38, 90 - z);
      if (edge < 5 && mrand() > edge / 5) continue;
      setTile(x, z, 'marsh');
    }
    for (const [sx, sz] of [[108, 50], [112, 76], [126, 88], [140, 46], [150, 80]]) put('sand_bank', sx, sz);
    for (const [px, pz] of [[110, 68], [118, 84], [136, 84], [110, 44]]) put('slime_pool', px, pz);
    for (let i = 0; i < 70; i++) {                       // bare standing timber, thick near the water
      const dx = 104 + Math.floor(mrand() * 48), dz = 38 + Math.floor(mrand() * 52);
      if (dx < S && dz < S && lay.tile[dx][dz] === 'marsh' && !lay.scenery.has(this.key(dx, dz))) put('dead_tree', dx, dz);
    }

    // ---- Mourncross itself: one long street, a bell tower, a churchyard, the Font ----
    // bare grey flagstone underfoot, not the warm packed earth every other town walks on
    const MC = { x0: 116, z0: 50, x1: 144, z1: 78 };
    for (let x = MC.x0; x <= MC.x1; x++) for (let z = MC.z0; z <= MC.z1; z++) setTile(x, z, 'rock');
    for (let x = 108; x <= MC.x1; x++) { road(x, 63); road(x, 64); }          // the causeway becomes the high street
    for (let z = MC.z0; z <= MC.z1; z++) { road(129, z); road(130, z); }      // the cross street
    // the gatehouse arch where the causeway meets the town
    for (const gz of [62, 65]) put('gatehouse', 115, gz, MX);
    // houses along the street — shut, intact, and empty
    building(118, 53, 125, 60, ['125,56', '125,57'], 'wall', MX);
    building(133, 53, 141, 60, ['133,56', '133,57'], 'wall', MX);
    building(118, 68, 126, 75, ['122,68', '123,68'], 'wall', MX);
    building(134, 68, 142, 76, ['138,68', '139,68'], 'wall', MX);
    put('shop_counter', 136, 71, MX); put('shelves', 141, 70, MX); put('shelves', 141, 73, MX);   // Marrow's Rest
    put('range', 121, 58); put('well', 128, 58);
    // The bell tower. The bell floor is open — you must be able to reach the bells to
    // ring them — and the Tallyman's chamber sits behind it, walled, with the barred
    // Font gate as its only doorway. Ringing the peal opens that gate.
    for (let x = 124; x <= 135; x++) for (let z = 37; z <= 51; z++) setTile(x, z, 'floor');
    for (const [tx, tz] of [[124, 44], [135, 44], [124, 51], [135, 51]]) put('tower', tx, tz, MX);
    // Deliberately NOT laid out in peal order — the player has to work out which bell
    // is which from the ghosts' clues, not sweep left to right (see Game.PEAL).
    const BELLS = [[126, 46, 'Thin'], [133, 46, 'Mourning'], [126, 49, 'Dawn'], [133, 49, 'Deep']];
    for (const [bx, bz, name] of BELLS) put('bell', bx, bz, MX).bell = name;
    building(125, 37, 134, 43, ['129,43', '130,43'], 'wall', MX);              // the sealed chamber
    put('font_gate', 129, 43); put('font_gate', 130, 43);
    for (let z = 51; z <= 62; z++) { road(129, z); road(130, z); }             // tower road down to the street
    // the Bone Font and its workings, south of the tower
    put('bone_font', 129, 80); put('bone_font', 130, 80);
    put('bone_grinder', 127, 80); put('slime_pool', 132, 80);
    for (let x = 126; x <= 133; x++) for (let z = 78; z <= 82; z++) setTile(x, z, 'rock');
    for (let z = 65; z <= 78; z++) { road(129, z); road(130, z); }
    // the churchyard: the reason the town is quiet
    for (let x = 146; x <= 150; x++) for (let z = 55; z <= 72; z++) if (x < S) setTile(x, z, 'rock');
    for (let z = 56; z <= 71; z += 3) for (const gx of [147, 149]) put('grave', gx, z);
    for (let x = 143; x <= 145; x++) { road(x, 63); road(x, 64); }
    put('altar', 148, 53);
    for (const [lx, lz] of [[117, 62], [117, 65], [128, 62], [131, 62], [128, 65], [131, 65], [143, 62], [143, 65]])
      if (!lay.scenery.has(this.key(lx, lz))) put('lamppost', lx, lz, CL);
    put('signpost', 114, 62);
    // The flats were scattered with dead timber before the town went down on top of
    // them, which left trees standing in the middle of the high street. Anything that
    // is no longer on marsh never belonged there.
    for (const [k, sv] of [...lay.scenery])
      if (sv.type === 'dead_tree' && lay.tile[sv.x][sv.z] !== 'marsh') lay.scenery.delete(k);

    // ---- Rookmoor (west of the city): Ava's workshop and the Warding Circle ----
    building(30, 104, 37, 110, ['37,108', '37,109']);   // the workshop, opening onto the moor road
    put('anvil', 32, 106); put('fire', 35, 106);
    for (const [kx, kz] of [[31, 109], [36, 105]]) put('crate', kx, kz);
    put('signpost', 38, 110);
    // The Warding Circle: five standing stones around a plinth. Touching a stone flips
    // it AND its two neighbours — a ring of five is always solvable (see Game.touchPylon).
    const RING = [[34, 113], [37, 115], [36, 118], [32, 118], [31, 115]];
    RING.forEach(([px, pz], i) => { put('pylon', px, pz); lay.scenery.get(this.key(px, pz)).pidx = i; });
    put('plinth', 34, 116);

    // trees (not in the towns): willows near the river, oaks scattered, regular trees common
    const inTown = (x, z) => TOWNS.some(T => x >= T.x0 - 2 && x <= T.x1 + 2 && z >= T.z0 - 2 && z <= T.z1 + 2);
    for (let x = 1; x < S - 1; x++) for (let z = 1; z < S - 1; z++) {
      if (lay.tile[x][z] !== 'grass') continue;
      if (inTown(x, z)) continue;
      if (rand() < 0.035 && !lay.scenery.has(this.key(x, z))) {
        const nearRiver = x > 82;
        const r = rand();
        put(nearRiver && r < 0.5 ? 'willow' : r < 0.15 ? 'oak' : 'tree', x, z);
      }
    }
    // The open pit is the everyday mine: the four common metals and nothing else.
    // Silver, gold and gems moved behind the Guild door, which is what makes the door
    // worth opening — the pit used to hold everything the Guild did.
    const ores = ['rock_copper', 'rock_tin', 'rock_copper', 'rock_tin', 'rock_iron', 'rock_coal',
                  'rock_copper', 'rock_tin', 'rock_iron', 'rock_coal', 'rock_copper', 'rock_tin',
                  'rock_copper', 'rock_tin', 'rock_iron', 'rock_coal'];
    let oi = 0;
    for (let x = 22; x < 39; x++) for (let z = 22; z < 39; z++) {
      if (lay.tile[x][z] === 'rock' && rand() < 0.16 && !lay.scenery.has(this.key(x, z)))
        put(ores[oi++ % ores.length], x, z);
    }
    // fishing spots on the river bank (net) and lure spots (rod)
    for (const [z, type] of [[50, 'fishing_spot'], [64, 'fishing_spot'], [78, 'fishing_spot'], [44, 'lure_spot'], [70, 'lure_spot']]) {
      for (let x = 1; x < S - 1; x++) {
        if (lay.tile[x][z] === 'water' && lay.tile[x - 1][z] === 'sand') { put(type, x, z); break; }
      }
    }
    return lay;
  },

  genDungeon() {
    const S = this.SIZE;
    const lay = { h: [], tile: [], scenery: new Map() };
    for (let x = 0; x <= S; x++) { lay.h[x] = []; for (let z = 0; z <= S; z++) lay.h[x][z] = 0; }
    for (let x = 0; x < S; x++) { lay.tile[x] = []; for (let z = 0; z < S; z++) lay.tile[x][z] = 'void'; }
    const carve = (x0, z0, x1, z1) => {
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) lay.tile[x][z] = 'dfloor';
    };
    carve(44, 42, 52, 50);      // entry room (ladder at 48,46)
    carve(47, 50, 49, 58);      // corridor south
    carve(42, 58, 58, 70);      // great hall (skeletons)
    carve(58, 62, 66, 65);      // corridor east
    carve(66, 56, 78, 68);      // crypt (zombies + relic)
    carve(70, 68, 72, 76);      // deep corridor south
    carve(58, 76, 78, 90);      // hobgoblin hall
    carve(52, 80, 58, 83);      // corridor west
    carve(40, 76, 52, 88);      // ghost crypt
    carve(45, 88, 49, 94);      // corridor south to the lair
    carve(38, 94, 60, 110);     // dragon's lair (deepest)
    carve(32, 60, 42, 70);      // Hollow-folk camp (west of the great hall)
    carve(24, 65, 31, 65);      // sealed corridor west from the camp (1 wide)
    carve(8, 56, 24, 76);       // the Giants' Den cavern
    carve(19, 34, 28, 42);      // the Guild's Deep Gallery (ladder down at 24,38)
    carve(148, 30, 170, 52);    // the rune essence mine (reached only through the ruin)
    // the lost tribe's camp
    for (const [hx, hz] of [[35, 62], [39, 68], [34, 67]]) lay.scenery.set(this.key(hx, hz), { type: 'tribe_hut', x: hx, z: hz, respawnAt: 0 });
    lay.scenery.set(this.key(37, 65), { type: 'totem', x: 37, z: 65, respawnAt: 0 });
    lay.scenery.set(this.key(38, 66), { type: 'fire', x: 38, z: 66, respawnAt: 0 });
    // boulder sealing the deep passage, and giant-den ore + a campfire
    lay.scenery.set(this.key(31, 65), { type: 'boulder', x: 31, z: 65, respawnAt: 0 });
    for (const [rx, rz, rt] of [[12, 60, 'rock_iron'], [16, 73, 'rock_coal'], [20, 58, 'rock_iron'], [10, 68, 'rock_coal']])
      lay.scenery.set(this.key(rx, rz), { type: rt, x: rx, z: rz, respawnAt: 0 });
    lay.scenery.set(this.key(14, 66), { type: 'fire', x: 14, z: 66, respawnAt: 0 });
    // The essence mine: blank rock that never runs out, and paler stone deeper in that
    // wants Mining 30. There is no ladder — the only way in or out is the ruin.
    for (const [rx, rz] of [[152, 34], [155, 33], [158, 35], [161, 34], [164, 36], [151, 40],
                            [154, 42], [157, 41], [160, 43], [163, 40], [166, 38], [152, 47],
                            [156, 48], [160, 47], [164, 45]])
      lay.scenery.set(this.key(rx, rz), { type: 'essence_rock', x: rx, z: rz, respawnAt: 0 });
    for (const [rx, rz] of [[167, 48], [168, 44], [166, 51], [169, 40], [164, 50]])
      lay.scenery.set(this.key(rx, rz), { type: 'pure_rock', x: rx, z: rz, respawnAt: 0 });
    lay.scenery.set(this.key(158, 40), { type: 'rune_rift', x: 158, z: 40, respawnAt: 0 });

    // The Deep Gallery under the Mining Guild — the only mithril and adamantite there is.
    // Coal sits down here too, because a mithril bar eats four of it and an adamant six,
    // and nobody should have to climb the ladder between every bar.
    for (const [rx, rz, rt] of [[21, 36, 'rock_mithril'], [26, 36, 'rock_mithril'], [23, 35, 'rock_mithril'],
                                [21, 41, 'rock_adamantite'], [26, 41, 'rock_adamantite'],
                                [20, 38, 'rock_coal'], [27, 38, 'rock_coal'], [24, 41, 'rock_coal']])
      lay.scenery.set(this.key(rx, rz), { type: rt, x: rx, z: rz, respawnAt: 0 });
    lay.scenery.set(this.key(24, 38), { type: 'ladder_up', x: 24, z: 38, respawnAt: 0 });
    for (const [fx, fz] of [[22, 38], [25, 38]])
      lay.scenery.set(this.key(fx, fz), { type: 'fire', x: fx, z: fz, respawnAt: 0 });
    // a deep gem seam in the ghost crypt — gems are a reason to go down, not just across
    for (const [rx, rz] of [[42, 78], [50, 86], [44, 86]])
      lay.scenery.set(this.key(rx, rz), { type: 'rock_gem', x: rx, z: rz, respawnAt: 0 });
    // dungeon mining: iron and coal seams in the hobgoblin hall
    for (const [rx, rz, rt] of [[60, 78, 'rock_iron'], [76, 78, 'rock_coal'], [60, 88, 'rock_coal'], [76, 88, 'rock_iron'], [68, 89, 'rock_coal']])
      lay.scenery.set(this.key(rx, rz), { type: rt, x: rx, z: rz, respawnAt: 0 });
    // walls around every carved area
    for (let x = 1; x < S - 1; x++) for (let z = 1; z < S - 1; z++) {
      if (lay.tile[x][z] !== 'void') continue;
      let adj = false;
      for (let dx = -1; dx <= 1 && !adj; dx++) for (let dz = -1; dz <= 1; dz++)
        if (lay.tile[x + dx][z + dz] === 'dfloor') { adj = true; break; }
      if (adj) {
        lay.tile[x][z] = 'dwall';
        lay.scenery.set(this.key(x, z), { type: 'wall', x, z, respawnAt: 0 });
      }
    }
    lay.scenery.set(this.key(this.LADDER.x, this.LADDER.z), { type: 'ladder_up', x: this.LADDER.x, z: this.LADDER.z, respawnAt: 0 });
    return lay;
  },

  tileAt(l, x, z) {
    if (x < 0 || z < 0 || x >= this.SIZE || z >= this.SIZE) return 'void';
    return this.L[l].tile[x][z];
  },

  heightAt(l, x, z) {
    if (l === 1) return 0;
    const h = this.L[l].h;
    const xi = Math.max(0, Math.min(this.SIZE - 1, Math.floor(x)));
    const zi = Math.max(0, Math.min(this.SIZE - 1, Math.floor(z)));
    const fx = x - xi, fz = z - zi;
    const a = h[xi][zi], b = h[xi + 1][zi], c = h[xi][zi + 1], d = h[xi + 1][zi + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  },

  sceneryAt(l, x, z) { return this.L[l].scenery.get(this.key(x, z)); },

  blocked(l, x, z) {
    if (!WALKABLE[this.tileAt(l, x, z)]) return true;
    const s = this.L[l].scenery.get(this.key(x, z));
    return !!(s && SCENERY_DEFS[s.type].block);
  },

  // BFS; if the target is unreachable/blocked, path to the nearest reachable tile
  findPath(l, sx, sz, tx, tz) {
    if (sx === tx && sz === tz) return [];
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const seen = new Map();
    seen.set(sx + ',' + sz, null);
    const q = [[sx, sz]];
    let head = 0, best = null, bestD = Infinity, found = null;
    while (head < q.length && head < 8000) {
      const [x, z] = q[head++];
      const d = Math.hypot(x - tx, z - tz);
      if (d < bestD) { bestD = d; best = [x, z]; }
      if (x === tx && z === tz) { found = [x, z]; break; }
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz, k = nx + ',' + nz;
        if (seen.has(k) || this.blocked(l, nx, nz)) continue;
        if (dx && dz && (this.blocked(l, x + dx, z) || this.blocked(l, x, z + dz))) continue;
        seen.set(k, x + ',' + z);
        q.push([nx, nz]);
      }
    }
    const end = found || best;
    if (!end || (end[0] === sx && end[1] === sz)) return null;
    const path = [];
    let k = end[0] + ',' + end[1];
    const startK = sx + ',' + sz;
    while (k && k !== startK) {
      const [x, z] = k.split(',').map(Number);
      path.push({ x, z });
      k = seen.get(k);
    }
    return path.reverse();
  }
};
