// Static file server for local development.
//
// Singleplayer runs fine straight from file://, but the peer-to-peer path does not:
// WebCrypto is only exposed in a secure context, and file:// is not one. localhost
// is, so serving the folder here is the way to test hosting and joining locally.
//
//   npm run serve        → http://localhost:8080
//
// Two tabs on localhost can host and join each other — the PeerJS broker will happily
// connect two peers on the same machine.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.wasm': 'application/wasm'
};

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const file = path.join(root, rel);

  // Refuse anything that resolves outside the project folder.
  if (!file.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + rel); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'      // always pick up the file you just edited
    });
    res.end(data);
  });
}).listen(port, () => {
  console.log('Rune Classic dev server → http://localhost:' + port);
  console.log('(localhost is a secure context, so peer-to-peer hosting works here.)');
});
