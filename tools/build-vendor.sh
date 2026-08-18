#!/bin/sh
# Regenerates js/vendor/ — the two third-party bundles the peer-to-peer path needs.
#
# The output is committed on purpose: the game is served as plain static files from
# GitHub Pages with no build step, and vendoring means a CDN outage (or a CDN
# compromise) can never take the crypto down or swap it out.
#
#   sh tools/build-vendor.sh
#
# Bumping a version: run this, then run `node tools/pake-selftest.mjs` — it exercises
# ristretto255 through the bundle and will catch an API change.
set -e
cd "$(dirname "$0")/.."

npm install --no-save --prefix ./.tooling @noble/curves@1 peerjs@1 esbuild

# PeerJS ships a ready-made standalone browser build.
cp .tooling/node_modules/peerjs/dist/peerjs.min.js js/vendor/peerjs.min.js

# noble-curves ships ESM/CJS only. Bundle the ristretto255 surface js/pake.js uses
# into a classic script exposing one global, so index.html can load it with a plain
# <script> tag like every other file here.
echo "export { RistrettoPoint, hashToRistretto255 } from '@noble/curves/ed25519.js';" > .tooling/entry-noble.js
./.tooling/node_modules/.bin/esbuild .tooling/entry-noble.js \
  --bundle --minify --format=iife --global-name=NobleRistretto \
  --legal-comments=inline --outfile=js/vendor/noble-ristretto255.js

echo
echo "Rebuilt js/vendor/. Versions:"
node -p "'  @noble/curves ' + require('./.tooling/node_modules/@noble/curves/package.json').version"
node -p "'  peerjs        ' + require('./.tooling/node_modules/peerjs/package.json').version"
