#!/usr/bin/env node
// Converts a Roblox place (any year, XML or binary) into the binary format the 2016 engine reads,
// the same way Upload a Place does in the browser (rbxfile.js toEngine): Zstd chunks, 64-bit numbers,
// exact part colors, WeldConstraints, rbxassetid:// links, missing spawns and so on. Use it for places
// that go in ../places/ (built-in maps aren't converted when they load).
//   node convert_place.js IN.rbxl OUT.rbxl
'use strict';
const fs = require('fs');
const path = require('path');
global.fzstd = require(path.join(__dirname, '..', 'vendor', 'fzstd.js'));
const R = require(path.join(__dirname, '..', 'rbxfile.js'));
// newer games' scripts (Luau) are converted too, with the GN-BLOX library for them
const GNLuau = require(path.join(__dirname, '..', 'luau.js'));
const compat = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'GNCompat.lua'), 'utf8');

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node convert_place.js IN.rbxl OUT.rbxl');
  process.exit(1);
}
const typemap = JSON.parse(fs.readFileSync(path.join(__dirname, 'typemap.json'), 'utf8'));
const doc = R.read(new Uint8Array(fs.readFileSync(input)));
// assets the site has files for (the Catalog's faces, clothes and hat meshes; game-assets/): not missing
const have = new Set();
for (const dir of [['catalog', 'assets'], ['game-assets']]) {
  try { for (const f of fs.readdirSync(path.join(__dirname, '..', ...dir))) { const m = /^(\d+)\./.exec(f); if (m) have.add(m[1]); } } catch (e) { /* none */ }
}
const notes = R.toEngine(doc, typemap, { have, compat, luau: GNLuau.GNLuau || GNLuau });
const out = R.write(doc);
fs.writeFileSync(output, out);
console.log(path.basename(input) + ': ' + doc.format + ', ' + doc.insts.length + ' objects -> ' + out.length + ' bytes' + (notes.length ? '\n  ' + notes.join('\n  ') : ''));
