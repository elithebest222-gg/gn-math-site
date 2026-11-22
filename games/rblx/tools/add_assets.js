#!/usr/bin/env node
// Adds a game's asset files (images, meshes, sounds named with their asset id, like
// "TreasureChest_23723701.mesh" or "123456.png") to ../game-assets/, for GN-BLOX's built-in games.
// Meshes newer than 2016's engine reads are converted to version 2.00 (as Upload a Place does,
// ../assets.js). ../game-assets/index.json lists every id there; the service worker reads it and
// serves those files when a game asks for that asset id.
//   node add_assets.js FILE_OR_FOLDER...
'use strict';
const fs = require('fs');
const path = require('path');

global.window = {};
require(path.join(__dirname, '..', 'assets.js'));
const A = window.GNAssets;
// models (inserted by scripts with InsertService:LoadAsset) are converted like places
global.fzstd = require(path.join(__dirname, '..', 'vendor', 'fzstd.js'));
const R = require(path.join(__dirname, '..', 'rbxfile.js'));
const GNLuau = require(path.join(__dirname, '..', 'luau.js'));
const TYPEMAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'typemap.json'), 'utf8'));
const COMPAT = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'GNCompat.lua'), 'utf8');
const OUT = path.join(__dirname, '..', 'game-assets');
const INDEX = path.join(OUT, 'index.json');
const EXT = { png: 'png', jpeg: 'jpg', mesh: 'mesh', obj: 'mesh', ogg: 'ogg', mp3: 'mp3', wav: 'wav', model: 'rbxm' };

const files = [];
const walk = p => {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f));
  else if (!/\.(rbxl|rbxlx|zip)$/i.test(p)) files.push(p);
};
process.argv.slice(2).forEach(walk);
if (!files.length) { console.error('usage: node add_assets.js FILE_OR_FOLDER...'); process.exit(1); }

const index = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : {};
let added = 0;
const skipped = [];
for (const f of files) {
  const name = path.basename(f);
  const id = A.idOf(name);
  if (!id) { skipped.push(name + ' (no asset id in the name)'); continue; }
  let bytes = new Uint8Array(fs.readFileSync(f));
  const kind = A.kind(bytes, name);
  try {
    if (kind === 'mesh') bytes = A.convertMesh(bytes);
    else if (kind === 'obj') bytes = A.objToMesh(new TextDecoder().decode(bytes));
    else if (kind === 'model') {
      const doc = R.read(bytes);
      R.toEngine(doc, TYPEMAP, { compat: COMPAT, luau: GNLuau, model: true });
      bytes = R.write(doc);
    }
  } catch (e) { skipped.push(name + ' (' + e.message + ')'); continue; }
  const ext = EXT[kind];
  if (!ext) { skipped.push(name + ' (' + kind + ': not an image, mesh or sound the engine reads)'); continue; }
  fs.writeFileSync(path.join(OUT, id + '.' + ext), bytes);
  index[id] = ext;
  added++;
}
// GN-BLOX's own stand-ins (tools/build_standins.py) are listed too
for (const f of fs.readdirSync(OUT)) { const m = /^(91\d{8})\.png$/.exec(f); if (m) index[m[1]] = 'png'; }
fs.writeFileSync(INDEX, JSON.stringify(index));
console.log(added + ' assets added to game-assets/ (' + Object.keys(index).length + ' in all)' + (skipped.length ? '\nskipped:\n  ' + skipped.join('\n  ') : ''));
