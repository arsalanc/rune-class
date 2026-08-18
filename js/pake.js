'use strict';
// Password-authenticated key exchange for peer-to-peer worlds.
//
// WHY THIS EXISTS. Two peers meet through a public signalling broker (PeerJS). The
// broker relays the WebRTC offer/answer, which carries the DTLS fingerprints — so a
// malicious or compromised broker could substitute its own and sit in the middle of
// an otherwise "encrypted" data channel. DTLS proves you are talking to *someone*
// consistently; it does not prove you are talking to your friend. A PAKE closes that
// gap: both sides prove knowledge of the same password without revealing it, and the
// exchange yields a session key that an eavesdropper (broker included) cannot derive.
// We then encrypt the game protocol under that key, so the broker only ever relays
// ciphertext. It doubles as the account login: the password *is* the credential.
//
// THE PROTOCOL is CPace (draft-irtf-cfrg-cpace) over ristretto255:
//
//   PRS = PBKDF2-SHA256(password, salt, 310000)      both sides, from the typed password
//   G   = hash_to_ristretto255(PRS ‖ sid ‖ CI)       a generator only they can compute
//   guest: ya <- random, Ya = G^ya  ------------->
//   host:  yb <- random, Yb = G^yb  <-------------
//   K   = Yb^ya = Ya^yb                              equal iff both used the same PRS
//   ISK = SHA-512("RuneClassic/CPace/ISK" ‖ sid ‖ K ‖ Ya ‖ Yb)
//
// A wrong password yields a different G, so the two K values are unrelated and the
// key-confirmation MACs fail. An attacker gets exactly one online guess per
// connection and learns nothing else — there is no offline attack on the transcript.
//
// KNOWN LIMIT (balanced PAKE). The host stores PRS in order to run its half. PRS is
// login-equivalent for that world, so whoever holds the host's browser storage can
// impersonate any account on it, and can mount an offline dictionary attack at
// 310k PBKDF2 iterations per guess. An augmented PAKE (OPAQUE) removes this; it is
// deliberately out of scope here. Practical reading: your friend hosting the world
// is trusted, and players should not reuse a password that matters elsewhere.

const PAKE = (() => {
  const enc = new TextEncoder();
  const subtle = () => (typeof crypto !== 'undefined' && crypto.subtle) || null;

  // ristretto255 from the vendored @noble/curves bundle (js/vendor/noble-ristretto255.js)
  const N = (typeof NobleRistretto !== 'undefined') ? NobleRistretto : null;

  const KDF_ITERS = 310000;
  const DST = 'RuneClassic/CPace/ristretto255';

  // ---------- byte helpers ----------
  function u32le(n) { return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
  // Length-prefixed concatenation. Without this, ("ab","c") and ("a","bc") would hash
  // identically and the generator could be steered by a chosen account name.
  function lvcat(...parts) {
    const bs = parts.map(p => (typeof p === 'string' ? enc.encode(p) : p));
    let n = 0; for (const b of bs) n += 4 + b.length;
    const out = new Uint8Array(n); let o = 0;
    for (const b of bs) { out.set(u32le(b.length), o); o += 4; out.set(b, o); o += b.length; }
    return out;
  }
  function concat(...bs) {
    let n = 0; for (const b of bs) n += b.length;
    const out = new Uint8Array(n); let o = 0;
    for (const b of bs) { out.set(b, o); o += b.length; }
    return out;
  }
  function randomBytes(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; }

  function toB64(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function fromB64(s) { const b = atob(s); const u8 = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i); return u8; }

  // Compare without leaking where the first difference is — MAC checks must not be
  // usable as an oracle for guessing a tag byte at a time.
  function equalCT(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
    return d === 0;
  }

  // ---------- scalars ----------
  const ORDER = N ? N.RistrettoPoint.Fn.ORDER : 0n;
  function bytesToNumberLE(u8) { let n = 0n; for (let i = u8.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(u8[i]); return n; }
  // 64 uniform bytes reduced mod the group order: the bias is ~2^-256, i.e. none.
  // Rejecting 0 keeps Y from collapsing to the identity.
  function randomScalar() {
    for (;;) { const s = bytesToNumberLE(randomBytes(64)) % ORDER; if (s !== 0n) return s; }
  }

  // ---------- primitives over WebCrypto ----------
  async function pbkdf2(password, salt, iters, bytes) {
    const k = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters }, k, bytes * 8);
    return new Uint8Array(bits);
  }
  async function sha512(data) { return new Uint8Array(await subtle().digest('SHA-512', data)); }
  async function hkdf(ikm, info, bytes) {
    const k = await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    const bits = await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) }, k, bytes * 8);
    return new Uint8Array(bits);
  }
  async function hmac(keyBytes, data) {
    const k = await subtle().importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await subtle().sign('HMAC', k, data));
  }

  return {
    toB64, fromB64, randomBytes, equalCT,

    // P2P needs WebCrypto, which browsers only expose in a secure context. https and
    // localhost qualify; file:// does not. Callers use this to explain the failure
    // instead of dying on `crypto.subtle` being undefined.
    available() { return !!subtle() && !!N && typeof RTCPeerConnection !== 'undefined'; },
    unavailableReason() {
      if (typeof RTCPeerConnection === 'undefined') return 'This browser has no WebRTC support.';
      if (!N) return 'Crypto library failed to load (js/vendor/noble-ristretto255.js).';
      if (!subtle()) return 'Peer-to-peer needs a secure page: use https:// or localhost, not a file:// path.';
      return '';
    },

    newSalt() { return randomBytes(16); },
    newSid() { return randomBytes(16); },

    // Stretch the typed password into the password-related string both halves use.
    // Slow on purpose: this is the only thing standing between a stolen host save
    // and the player's actual password.
    derivePRS(password, salt) { return pbkdf2(String(password), salt, KDF_ITERS, 32); },

    // ---------- CPace ----------
    // Both sides derive the same generator from the secret, then do a plain DH on it.
    async cpaceGenerator(prs, sid, ci) {
      return N.hashToRistretto255(lvcat(prs, sid, ci), { DST });
    },
    async cpaceStart(prs, sid, ci) {
      const G = await this.cpaceGenerator(prs, sid, ci);
      const y = randomScalar();
      return { y, Y: G.multiply(y).toBytes() };
    },
    // Returns null when the peer's share is unusable. The identity check matters:
    // accepting it would force K to a constant an attacker knows without the password.
    cpaceFinish(y, peerYBytes) {
      let P;
      try { P = N.RistrettoPoint.fromBytes(peerYBytes); } catch (e) { return null; }
      if (P.is0()) return null;
      const K = P.multiply(y);
      if (K.is0()) return null;
      return K.toBytes();
    },

    // Bind the session key to the full transcript, so neither side's share can be
    // swapped for a replayed one from an earlier connection.
    async intermediateKey(K, sid, Yguest, Yhost) {
      return sha512(lvcat('RuneClassic/CPace/ISK', sid, K, Yguest, Yhost));
    },

    // Independent keys per direction: AES-GCM is catastrophically broken by nonce
    // reuse, and separate keys mean the two sides' counters can never collide.
    async sessionKeys(isk) {
      const [g2h, h2g, mac] = await Promise.all([
        hkdf(isk, 'RuneClassic/key/guest-to-host', 32),
        hkdf(isk, 'RuneClassic/key/host-to-guest', 32),
        hkdf(isk, 'RuneClassic/key/confirm', 32)
      ]);
      return { g2h, h2g, mac };
    },

    // Explicit key confirmation. Without it a wrong password would surface as
    // undecryptable garbage later; with it we can say "wrong password" and hang up,
    // and an active attacker is held to a single guess per connection.
    async confirmTag(macKey, label, sid, Yguest, Yhost) {
      return hmac(macKey, lvcat(label, sid, Yguest, Yhost));
    },

    // ---------- authenticated record layer ----------
    // Wraps the game protocol in AES-256-GCM. A frame is a flat byte buffer —
    // 8-byte big-endian counter ‖ ciphertext — so it can go straight down the data
    // channel with no serialisation library in between.
    //
    // Nonce = 4-byte per-direction prefix (derived from the session key) ‖ the same
    // 8-byte counter, so nonces are unique by construction rather than by luck; a
    // repeat would leak the keystream and forge-enable the channel. The receiver
    // demands strictly increasing counters, rejecting replays and reordering.
    async record(keyBytes, dir) {
      const key = await subtle().importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
      const prefix = await hkdf(keyBytes, 'RuneClassic/nonce/' + dir, 4);
      let sendCtr = 0n, recvCtr = -1n;
      const nonce = (ctr) => {
        const n = new Uint8Array(12); n.set(prefix, 0);
        let v = ctr; for (let i = 11; i >= 4; i--) { n[i] = Number(v & 255n); v >>= 8n; }
        return n;
      };
      const putCtr = (buf, ctr) => { let v = ctr; for (let i = 7; i >= 0; i--) { buf[i] = Number(v & 255n); v >>= 8n; } };
      const getCtr = (buf) => { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(buf[i]); return v; };
      return {
        async seal(obj) {
          const ctr = sendCtr++;
          const pt = enc.encode(JSON.stringify(obj));
          const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce(ctr) }, key, pt));
          const frame = new Uint8Array(8 + ct.length);
          putCtr(frame, ctr); frame.set(ct, 8);
          return frame;
        },
        async open(bytes) {
          const f = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
          if (f.length < 9) return null;
          const ctr = getCtr(f);
          if (ctr <= recvCtr) return null;                 // replayed or reordered
          let pt;
          try { pt = await subtle().decrypt({ name: 'AES-GCM', iv: nonce(ctr) }, key, f.subarray(8)); }
          catch (e) { return null; }                       // forged or corrupt: drop it
          recvCtr = ctr;                                   // only advance on a valid tag
          try { return JSON.parse(new TextDecoder().decode(pt)); } catch (e) { return null; }
        }
      };
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { PAKE };
