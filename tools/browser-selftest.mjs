// Browser end-to-end test. Boots index.html in a real headless Chromium-family
// browser over the DevTools protocol, then has two tabs host and join a world
// through the *real* PeerJS broker and a *real* WebRTC data channel.
//
//   npm run test:browser
//
// This is the only test that exercises the actual signalling and transport, so it is
// the one that catches things the loopback harness structurally cannot — PeerJS
// option names, data-channel binary types, secure-context requirements. It needs a
// browser and an internet connection; without either it skips rather than fails.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CDP_PORT = 9339;
const WEB_PORT = 8139;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
const check = (n, ok, extra) => { console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok || !extra ? '' : '  → ' + extra)); if (!ok) failures++; };

// ---------- find a browser ----------
const CANDIDATES = [
  process.env.BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);
const browser = CANDIDATES.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
if (!browser) {
  console.log('No Chromium-family browser found — skipping the browser test.');
  console.log('Set BROWSER=/path/to/chrome to run it.');
  process.exit(0);
}
console.log('Browser end-to-end (' + path.basename(browser) + ')\n');

// ---------- serve the game ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': (TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(data);
  });
}).listen(WEB_PORT);

const profile = path.join(root, '.tooling', 'browser-test-profile');
const proc = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + CDP_PORT, 'about:blank'
], { stdio: 'ignore' });

const cleanup = () => { try { proc.kill(); } catch (e) {} try { server.close(); } catch (e) {} };
process.on('exit', cleanup);

// ---------- DevTools protocol ----------
const devtools = (p, method = 'GET') => new Promise((res, rej) => {
  const req = http.request({ host: '127.0.0.1', port: CDP_PORT, path: p, method }, r => {
    let b = ''; r.on('data', d => b += d); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(new Error(b.slice(0, 120))); } });
  });
  req.on('error', rej); req.end();
});

// Each tab is an isolated realm — its own World, Game and Net, like a separate
// player's machine. They share only the broker.
async function openTab(url) {
  const t = await devtools('/json/new?' + encodeURIComponent(url), 'PUT');
  const ws = new WebSocket(t.webSocketDebuggerUrl);   // Node's built-in WebSocket
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push(d.exception?.description || d.text);
    }
  });
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const send = (method, params) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  return {
    errors,
    async evaluate(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      const ex = r.result?.exceptionDetails;
      if (ex) throw new Error(ex.exception?.description || 'evaluate failed');
      return r.result?.result?.value;
    },
    close: () => ws.close()
  };
}

let targets = null;
for (let i = 0; i < 40 && !targets; i++) { try { targets = await devtools('/json/list'); } catch (e) { await sleep(500); } }
if (!targets) { console.log('  could not reach the browser devtools endpoint'); cleanup(); process.exit(1); }

const url = 'http://localhost:' + WEB_PORT + '/index.html';
const host = await openTab(url);
const guest = await openTab(url);

// Wait for the page to actually be ready rather than guessing at a sleep — a cold
// browser start is several times slower than a warm one, and a fixed delay turns
// that into a flaky test.
async function waitReady(tab, name) {
  for (let i = 0; i < 120; i++) {
    try { if (await tab.evaluate('document.readyState === "complete" && typeof PAKE !== "undefined"')) return true; }
    catch (e) { /* still navigating */ }
    await sleep(500);
  }
  check(name + ' tab finished loading', false, 'timed out after 60s');
  return false;
}
if (!(await waitReady(host, 'host')) || !(await waitReady(guest, 'guest'))) { cleanup(); process.exit(1); }

// ---------- the page loads at all ----------
// Named one by one rather than looked up on globalThis: top-level const/class
// declarations live in the global *lexical* environment, so globalThis.PAKE is
// undefined even when PAKE is perfectly well defined.
const boot = JSON.parse(await host.evaluate(`JSON.stringify({
  globals: Object.entries({
    PAKE: typeof PAKE, Host: typeof Host, Sim: typeof Sim, Store: typeof Store,
    Net: typeof Net, Peer: typeof Peer, NobleRistretto: typeof NobleRistretto,
    drawChatText: typeof drawChatText
  }).filter(([, t]) => t === 'undefined').map(([n]) => n),
  cryptoReady: PAKE.available(), reason: PAKE.unavailableReason(), layers: World.L.length
})`));
check('every multiplayer global loaded', boot.globals.length === 0, boot.globals.join(','));
check('the page is a secure context with WebCrypto and WebRTC', boot.cryptoReady, boot.reason);
check('the world generated', boot.layers === 2);

// ---------- host a world ----------
// Clear any world left by a previous run so the invite code we read is this run's.
await host.evaluate(`(async () => { await Store.del('meta','world'); for (const a of await Store.all('accounts')) await Store.del('accounts', a.name); return 1; })()`);
const w = JSON.parse(await host.evaluate(`(async () => { const w = await Net.hostWorld('Hostina'); return JSON.stringify({ id: w.id, invite: w.invite }); })()`));
check('the host registered with the broker and got a World ID', /^rc-[a-z0-9]{6}-[a-z0-9]{6}$/.test(w.id || ''), w.id);
await sleep(1500);

// ---------- join it from the other tab ----------
const j = JSON.parse(await guest.evaluate(`(async () => {
  try { const r = await Net.joinP2P({ worldId: ${JSON.stringify(w.id)}, name: 'Dave', password: 'correct-horse', invite: ${JSON.stringify(w.invite)} });
        return JSON.stringify({ ok: true, registered: r.registered }); }
  catch (e) { return JSON.stringify({ ok: false, err: e.message }); }
})()`));
check('the guest completed the handshake over a real data channel', j.ok && j.registered, j.err);
await sleep(3000);
check('the guest is live in the world', await guest.evaluate('Net.active === true && Net.id > 0'));
check('the host sees both players', await host.evaluate('Host.clients.size') === 2);

// ---------- the game protocol over the encrypted channel ----------
await guest.evaluate(`Net.chat('hello over webrtc')`);
await sleep(1500);
check('chat reached the host tab', await host.evaluate(`[...document.querySelectorAll('#chat .msg')].some(d => /hello over webrtc/.test(d.textContent))`));
check('the host renders a bubble over the guest', await host.evaluate(`(Game.players||[]).some(p => p.bubble && /hello over webrtc/.test(p.bubble.text))`));

const before = await guest.evaluate('Game.player.tx');
await guest.evaluate('Net.walk(70, 70)');
await sleep(2500);
check('a walk intent round-trips through the host\'s sim',
  (await guest.evaluate('Game.player.tx')) !== before, before + ' -> ' + await guest.evaluate('Game.player.tx'));
check('the guest is rendering the host\'s NPCs', await guest.evaluate('Game.npcs.length') > 0);
check('the guest\'s character was saved on the host', await host.evaluate(`(async () => !!(await Store.get('accounts','dave')))()`));
check('the stored credential is not the plaintext password',
  await host.evaluate(`(async () => JSON.stringify(await Store.get('accounts','dave')).indexOf('correct-horse') === -1)()`));

const errs = [...host.errors, ...guest.errors];
check('no uncaught exceptions in either tab', errs.length === 0, errs.join(' | '));

host.close(); guest.close(); cleanup();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
