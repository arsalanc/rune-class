// Self-test for js/pake.js — runs the CPace handshake end to end in Node, using the
// same vendored ristretto255 bundle and WebCrypto calls the browser uses.
//   node tools/pake-selftest.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js');
const ctx = vm.createContext({ crypto, TextEncoder, TextDecoder, btoa, atob, console, Math, JSON });
vm.runInContext(fs.readFileSync(path.join(dir, 'vendor/noble-ristretto255.js'), 'utf8'), ctx, { filename: 'noble.js' });
// `const PAKE` is lexical, so it never lands on the sandbox global — the same trick
// server/shared.js uses: a `var` epilogue in the *same* script hoists it across.
vm.runInContext(fs.readFileSync(path.join(dir, 'pake.js'), 'utf8') + '\nvar __pake = PAKE;', ctx, { filename: 'pake.js' });
const PAKE = ctx.__pake;

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok   ' : '  FAIL ') + name); if (!ok) failures++; };

// One full handshake. `guestPw` and `hostPw` differ in the negative cases.
async function handshake(guestPw, hostPw) {
  const salt = PAKE.newSalt(), sid = PAKE.newSid(), ci = 'rune-classic/1|host-abc|dave';
  const [prsG, prsH] = await Promise.all([PAKE.derivePRS(guestPw, salt), PAKE.derivePRS(hostPw, salt)]);

  const g = await PAKE.cpaceStart(prsG, sid, ci);
  const h = await PAKE.cpaceStart(prsH, sid, ci);
  const Kg = PAKE.cpaceFinish(g.y, h.Y);
  const Kh = PAKE.cpaceFinish(h.y, g.Y);
  if (!Kg || !Kh) return { agreed: false };

  const [iskG, iskH] = await Promise.all([
    PAKE.intermediateKey(Kg, sid, g.Y, h.Y),
    PAKE.intermediateKey(Kh, sid, g.Y, h.Y)
  ]);
  const [kG, kH] = await Promise.all([PAKE.sessionKeys(iskG), PAKE.sessionKeys(iskH)]);

  const tagG = await PAKE.confirmTag(kG.mac, 'guest-confirm', sid, g.Y, h.Y);
  const expect = await PAKE.confirmTag(kH.mac, 'guest-confirm', sid, g.Y, h.Y);
  return { agreed: PAKE.equalCT(tagG, expect), kG, kH };
}

console.log('CPace over ristretto255');
const good = await handshake('hunter2', 'hunter2');
check('matching passwords agree on a session key', good.agreed);
const bad = await handshake('hunter2', 'hunter3');
check('mismatched passwords fail key confirmation', !bad.agreed);

// Two runs must never produce the same key: the sid is fresh each connection.
const a = await handshake('same', 'same'), b = await handshake('same', 'same');
check('each session derives a distinct key', Buffer.compare(Buffer.from(a.kG.g2h), Buffer.from(b.kG.g2h)) !== 0);

console.log('\nAES-GCM record layer');
const send = await PAKE.record(good.kG.g2h, 'g2h');
const recv = await PAKE.record(good.kH.g2h, 'g2h');
const msg = { t: 'chat', text: 'hello from the other side', n: 42 };
const f1 = await send.seal(msg);
check('seal/open round-trips a message', JSON.stringify(await recv.open(f1)) === JSON.stringify(msg));

const f2 = await send.seal({ t: 'walk', x: 10, z: 20 });
const f3 = await send.seal({ t: 'walk', x: 11, z: 21 });
await recv.open(f2);
check('a replayed frame is rejected', (await recv.open(f2)) === null);
check('the next genuine frame still opens', (await recv.open(f3)) !== null);

const forged = await send.seal({ t: 'chat', text: 'tampered' });
forged[9] ^= 0xff;                       // flip a ciphertext byte, leaving the counter intact
check('a tampered frame is rejected', (await recv.open(forged)) === null);
check('a rejected frame does not burn the counter', (await recv.open(await send.seal({ t: 'ok' }))) !== null);

const wrongKey = await PAKE.record(bad.kH ? bad.kH.g2h : PAKE.randomBytes(32), 'g2h');
check('a frame from the wrong key is rejected', (await wrongKey.open(await send.seal({ t: 'x' }))) === null);

console.log('\nInput handling');
check('identity share is refused', PAKE.cpaceFinish(1n, new Uint8Array(32)) === null);
check('malformed share is refused', PAKE.cpaceFinish(1n, PAKE.randomBytes(31)) === null);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
