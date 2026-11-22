#!/usr/bin/env node
// Downloads the assets an uncopylocked place uses (meshes, textures, sounds, animations, inserted
// models) from Roblox, using YOUR Roblox login, and packs them with the place into one .zip for
// GN-BLOX's "Upload a Place" (assets.js reads it: every file is named <asset id>.<kind>).
//
// Run it on your own computer (Node 18 or newer), from this folder:
//   node fetch_assets.js "My Place.rbxl"                -> "My Place (with assets).zip"
//   node fetch_assets.js "My Place.rbxl" -o pack.zip
//
// It needs ONE of these, which stay on your computer (never paste them into a chat or a website):
//   ROBLOX_API_KEY   an Open Cloud API key (create.roblox.com > Open Cloud > API Keys, with the
//                    "legacy-assets" read permission). Safest choice: you can delete the key after.
//   ROBLOX_COOKIE    your .ROBLOSECURITY cookie, or --cookie-file FILE holding it. Treat it like your
//                    password: anyone who has it is logged in as you.
//   (PowerShell: $env:ROBLOX_API_KEY="..."   macOS/Linux: export ROBLOX_API_KEY="...")
//
// Options:  -o FILE   where to write the .zip
//           --depth N how many levels of models to follow inside downloaded models (default 2)
//           --list    only print the asset ids the place uses; download nothing
//
// Only use this on places whose creators allow copying them.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
global.fzstd = require(path.join(__dirname, '..', 'vendor', 'fzstd.js'));
const R = require(path.join(__dirname, '..', 'rbxfile.js'));

// ---------------------------------------------------------------- options
const args = process.argv.slice(2);
const opt = { depth: 2 };
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-o' || a === '--out') opt.out = args[++i];
  else if (a === '--depth') opt.depth = +args[++i] || 0;
  else if (a === '--cookie-file') opt.cookieFile = args[++i];
  else if (a === '--list') opt.list = true;
  else if (a === '-h' || a === '--help') { help(); process.exit(0); }
  else files.push(a);
}
function help() {
  const src = fs.readFileSync(__filename, 'utf8').split('\n');
  console.log(src.slice(1, src.findIndex(l => l.startsWith("'use strict'"))).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
}
if (files.length !== 1) { help(); process.exit(1); }
const placeFile = files[0];
const out = opt.out || placeFile.replace(/\.[^.\\/]+$/, '') + ' (with assets).zip';

const API_KEY = (process.env.ROBLOX_API_KEY || '').trim();
let COOKIE = (process.env.ROBLOX_COOKIE || '').trim();
if (opt.cookieFile) COOKIE = fs.readFileSync(opt.cookieFile, 'utf8').trim();
COOKIE = COOKIE.replace(/^\.ROBLOSECURITY=/, '').replace(/;.*$/, '');
// (for testing against a stand-in server; normally unset)
const BASE = process.env.ROBLOX_ASSET_BASE || '';

// ---------------------------------------------------------------- the ids a place uses
const text = v => v instanceof Uint8Array ? Buffer.from(v).toString('utf8') : typeof v === 'string' ? v : '';
// "rbxassetid://123", "http://www.roblox.com/asset/?id=123", "roblox.com/asset?id=123&..."
const CONTENT_RE = /rbxassetid:\/\/(\d+)|roblox\.com\/+asset\/*\?[^"'\s]*?\bid=(\d+)/gi;
// in scripts: InsertService:LoadAsset(123), "...asset/?id=" .. 123, "rbxassetid://" .. 123
const SCRIPT_RE = /LoadAsset(?:Version)?\s*\(\s*(\d{4,})|(?:id=|rbxassetid:\/\/)["']\s*\.\.\s*(\d{4,})/g;

function idsIn(doc) {
  const found = new Map();   // id -> 'content' (used as an image/mesh/sound) or 'model' (inserted by a script)
  const add = (id, why) => { if (id && !found.has(id)) found.set(id, why); };
  for (const it of doc.insts) {
    for (const [name, p] of it.props) {
      const s = text(p.v);
      if (!s) continue;
      for (const m of s.matchAll(CONTENT_RE)) add(m[1] || m[2], 'content');
      if (name === 'Source' || name === 'source') for (const m of s.matchAll(SCRIPT_RE)) add(m[1] || m[2], m[1] ? 'model' : 'content');
    }
  }
  return found;
}

// ---------------------------------------------------------------- downloading
const sleep = ms => new Promise(r => setTimeout(r, ms));
function headers() {
  const h = { 'User-Agent': 'Roblox/WinInet', 'Accept-Encoding': 'gzip, deflate' };
  if (API_KEY) h['x-api-key'] = API_KEY;
  if (COOKIE) h.Cookie = '.ROBLOSECURITY=' + COOKIE;
  return h;
}
async function get(url, h) {
  for (let tries = 0; ; tries++) {
    const r = await fetch(url, { headers: h, redirect: 'follow' });
    if ((r.status === 429 || r.status >= 500) && tries < 5) { await sleep(1500 * 2 ** tries); continue; }
    return r;
  }
}
// -> { bytes } or { error }
async function download(id) {
  const tries = [];
  if (BASE) tries.push(BASE + id);
  else {
    if (API_KEY) tries.push('https://apis.roblox.com/asset-delivery-api/v1/assetId/' + id);
    tries.push('https://assetdelivery.roblox.com/v2/assetId/' + id);
    tries.push('https://assetdelivery.roblox.com/v1/asset/?id=' + id);
  }
  let last = 'not found';
  for (const url of tries) {
    let r;
    try { r = await get(url, headers()); } catch (e) { last = e.cause ? e.cause.code || e.message : e.message; continue; }
    if (!r.ok) {
      last = r.status === 401 ? 'not logged in (check your API key or cookie)'
        : r.status === 403 ? 'not allowed (the asset is private, e.g. audio its owner never shared)'
        : r.status === 404 ? 'deleted or doesn\'t exist' : 'HTTP ' + r.status;
      continue;   // the next address may still work (an API key without the right permission, say)
    }
    let bytes = new Uint8Array(await r.arrayBuffer());
    // the v2 / Open Cloud addresses answer with JSON naming where the file is
    if (bytes[0] === 0x7b && /json/i.test(r.headers.get('content-type') || 'json')) {
      let j;
      try { j = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch (e) { j = null; }
      if (j) {
        const loc = j.location || (j.locations && j.locations[0] && j.locations[0].location);
        if (!loc) { last = (j.errors && j.errors[0] && j.errors[0].message) || 'no download address'; continue; }
        const f = await get(loc, { 'User-Agent': 'Roblox/WinInet' });
        if (!f.ok) { last = 'HTTP ' + f.status + ' from the file server'; continue; }
        bytes = new Uint8Array(await f.arrayBuffer());
      }
    }
    return { bytes: unpack(bytes) };
  }
  return { error: last };
}
// some files come gzipped (the CDN doesn't always say so)
function unpack(b) {
  if (b[0] === 0x1f && b[1] === 0x8b) { try { return new Uint8Array(zlib.gunzipSync(b)); } catch (e) { /* keep it */ } }
  return b;
}

// ---------------------------------------------------------------- what came back
const starts = (b, s) => s.split('').every((c, i) => b[i] === c.charCodeAt(0));
function ext(b) {
  if (b[0] === 0x89 && starts(b.subarray(1), 'PNG')) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (starts(b, 'GIF8')) return 'gif';
  if (starts(b, 'RIFF') && starts(b.subarray(8), 'WEBP')) return 'webp';
  if (starts(b, 'BM')) return 'bmp';
  if (starts(b, 'version ')) return 'mesh';
  if (starts(b, 'OggS')) return 'ogg';
  if (starts(b, 'RIFF') && starts(b.subarray(8), 'WAVE')) return 'wav';
  if (starts(b, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  if (starts(b, 'fLaC')) return 'flac';
  if (starts(b.subarray(4), 'ftyp')) return 'm4a';
  if (starts(b, '<roblox')) return 'model';   // (not .rbxm: Upload a Place would take that for the place)
  return 'bin';
}
// A decal / shirt / pants / face asset is a little model pointing at its image. When the place uses
// one where an image goes (Texture = decal id), the engine wants the image itself.
const IMAGE_OF = { Decal: 'Texture', Texture: 'Texture', Shirt: 'ShirtTemplate', Pants: 'PantsTemplate', ShirtGraphic: 'Graphic' };
function imageOf(doc) {
  const real = doc.insts.filter(i => i.cls !== 'Folder' && i.cls !== 'Model');
  if (real.length !== 1 || !IMAGE_OF[real[0].cls]) return '';
  const m = /(?:id=|rbxassetid:\/\/)(\d+)/i.exec(text(real[0].get(IMAGE_OF[real[0].cls])));
  return m ? m[1] : '';
}

// ---------------------------------------------------------------- .zip writer
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = b => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function zip(entries) {
  const parts = [], central = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = zlib.deflateRawSync(e.bytes);
    const store = data.length >= e.bytes.length;
    const body = store ? Buffer.from(e.bytes) : data;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(store ? 0 : 8, 8);
    h.writeUInt32LE(crc32(e.bytes), 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(e.bytes.length, 22); h.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(store ? 0 : 8, 10);
    c.writeUInt32LE(crc32(e.bytes), 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(e.bytes.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, name, body);
    central.push(c, name);
    off += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

// ---------------------------------------------------------------- main
(async () => {
  const placeBytes = new Uint8Array(fs.readFileSync(placeFile));
  const doc = R.read(placeBytes);
  const want = idsIn(doc);
  console.log(path.basename(placeFile) + ': ' + doc.insts.length + ' instances, ' + want.size + ' asset ids');
  if (opt.list) { for (const [id, why] of want) console.log(id + (why === 'model' ? '  (inserted by a script)' : '')); return; }
  if (!API_KEY && !COOKIE && !BASE) {
    console.error('\nSet ROBLOX_API_KEY (or ROBLOX_COOKIE / --cookie-file) first. Run with --help for how.');
    process.exit(1);
  }

  const got = new Map(), failed = new Map();   // id -> { name, bytes } / reason
  const queue = [...want].map(([id, why]) => ({ id, why, depth: 0 }));
  const seen = new Set(want.keys());
  let done = 0;
  async function one(job) {
    const r = await download(job.id);
    done++;
    if (r.error) { failed.set(job.id, r.error); return; }   // (the progress line catches up on the next one)
    let bytes = r.bytes, kind = ext(bytes);
    if (kind === 'model') {
      let m = null;
      try { m = R.read(bytes); } catch (e) { /* keep it as it is */ }
      if (m) {
        const img = job.why === 'content' && imageOf(m);
        if (img) {
          const ir = await download(img);
          if (!ir.error) { bytes = ir.bytes; kind = ext(bytes); }
        }
        // a model can use more assets of its own
        if (kind === 'model' && job.depth < opt.depth) {
          for (const [id, why] of idsIn(m)) if (!seen.has(id)) { seen.add(id); queue.push({ id, why, depth: job.depth + 1 }); }
        }
      }
    }
    got.set(job.id, { name: job.id + '.' + kind, bytes });
    if (process.stdout.isTTY) process.stdout.write('\r' + got.size + ' downloaded, ' + failed.size + ' failed, ' + queue.length + ' to go   ');
    else if (done % 50 === 0) console.log(got.size + ' downloaded, ' + failed.size + ' failed, ' + queue.length + ' to go');
  }
  const workers = Array.from({ length: 4 }, async () => { while (queue.length) await one(queue.shift()); });
  await Promise.all(workers);
  process.stdout.write('\n');

  const entries = [{ name: path.basename(placeFile), bytes: placeBytes }, ...got.values()];
  fs.writeFileSync(out, zip(entries));
  const count = k => [...got.values()].filter(e => k.test(e.name)).length;
  console.log('\nWrote ' + out);
  console.log('  ' + count(/\.mesh$/) + ' meshes, ' + count(/\.(png|jpg|gif|webp|bmp)$/) + ' images, ' + count(/\.(ogg|mp3|wav|flac|m4a)$/) + ' sounds, ' + count(/\.model$/) + ' models/animations');
  if (failed.size) {
    console.log('  ' + failed.size + ' couldn\'t be downloaded:');
    const why = new Map();
    for (const [id, r] of failed) { if (!why.has(r)) why.set(r, []); why.get(r).push(id); }
    for (const [r, ids] of why) console.log('    ' + r + ': ' + ids.slice(0, 12).join(', ') + (ids.length > 12 ? ' and ' + (ids.length - 12) + ' more' : ''));
  }
  console.log('\nOn GN-BLOX: Create > Upload a Place, and pick this .zip.');
})().catch(e => { console.error(e.message || e); process.exit(1); });
