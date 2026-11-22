/* GN-BLOX asset packs: the images, meshes and sounds a game uses, uploaded with the place.
 *
 * A place file only names its assets (rbxassetid://123, http://www.roblox.com/asset/?id=123); the
 * files themselves live on Roblox's servers, which this site can't use. So you upload them with the
 * place: pick the place and its files together (or a .zip with all of them), each file named with its
 * asset id somewhere in the name ("123.png", "Sword mesh 123.mesh", "123"). They're kept in this
 * browser (IndexedDB "webblox" / "files", as asset:<id>), and the service worker
 * (coi-serviceworker.js) hands them to the engine when the game asks for that id.
 *
 * What the 2016 engine can't read is converted first:
 *   - meshes: newer Roblox mesh versions (3.00, 4.00, 5.00) and .obj files -> mesh version 2.00
 *   - images other than PNG / JPEG (WebP, GIF, BMP...) -> PNG
 *   - sounds other than MP3 / OGG / WAV (M4A, FLAC, WebM...) -> WAV
 *
 *   const r = await GNAssets.sort(files)   // { place: File|null, assets: [{ id, name, bytes }], skipped: [names] }
 *   const n = await GNAssets.store(r.assets, { replace: true })
 */
(function () {
  'use strict';
  const PLACE_RE = /\.(rbxl|rbxlx|rbxm|rbxmx)$/i;
  const te = new TextEncoder(), td = new TextDecoder();

  // ---------------------------------------------------------------- .zip files
  async function unzip(buf) {
    const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not a zip file');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let n = 0; n < count && dv.getUint32(p, true) === 0x02014b50; n++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = td.decode(b.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/')) continue;
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = b.subarray(start, start + csize);
      let bytes;
      if (method === 0) bytes = data.slice();
      else if (method === 8) bytes = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else continue;
      out.push({ name: name.split('/').pop(), bytes });
    }
    return out;
  }

  // ---------------------------------------------------------------- what a file is
  const startsWith = (b, s) => s.split('').every((c, i) => b[i] === c.charCodeAt(0));
  function kind(bytes, name) {
    const b = bytes;
    if (b[0] === 0x89 && startsWith(b.subarray(1), 'PNG')) return 'png';
    if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
    if (startsWith(b, 'GIF8')) return 'gif';
    if (startsWith(b, 'RIFF') && startsWith(b.subarray(8), 'WEBP')) return 'webp';
    if (startsWith(b, 'BM')) return 'bmp';
    if (startsWith(b, 'version ')) return 'mesh';
    if (startsWith(b, 'OggS')) return 'ogg';
    if (startsWith(b, 'RIFF') && startsWith(b.subarray(8), 'WAVE')) return 'wav';
    if (startsWith(b, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
    if (startsWith(b, 'fLaC')) return 'flac';
    if (startsWith(b.subarray(4), 'ftyp')) return 'm4a';
    if (b[0] === 0x1a && b[1] === 0x45) return 'webm';
    if (startsWith(b, '<roblox')) return 'model';
    if (/\.obj$/i.test(name)) return 'obj';
    if (/\.svg$/i.test(name) || startsWith(b, '<svg') || startsWith(b, '<?xml')) return 'svg';
    return 'other';
  }
  const TYPES = { png: 'image/png', jpeg: 'image/jpeg', mesh: 'application/octet-stream', ogg: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg', model: 'application/octet-stream' };

  // the asset id in a file name: its longest run of digits ("Sword 1234567.mesh" -> 1234567)
  function idOf(name) {
    const runs = String(name).replace(/\.[^.]*$/, '').match(/\d+/g) || [];
    return runs.sort((a, b) => b.length - a.length)[0] || '';
  }

  // ---------------------------------------------------------------- meshes -> version 2.00
  function meshV2(verts, faces) {   // verts: [px,py,pz, nx,ny,nz, u,v] * n, faces: [a,b,c] * m
    const nv = verts.length / 8, nf = faces.length / 3;
    const head = te.encode('version 2.00\n');
    const out = new Uint8Array(head.length + 12 + nv * 36 + nf * 12);
    out.set(head);
    const dv = new DataView(out.buffer);
    let o = head.length;
    dv.setUint16(o, 12, true); dv.setUint8(o + 2, 36); dv.setUint8(o + 3, 12); dv.setUint32(o + 4, nv, true); dv.setUint32(o + 8, nf, true);
    o += 12;
    for (let i = 0; i < nv; i++) {
      for (let k = 0; k < 8; k++) dv.setFloat32(o + k * 4, verts[i * 8 + k], true);
      dv.setFloat32(o + 32, 0, true);
      o += 36;
    }
    for (let i = 0; i < faces.length; i++) { dv.setUint32(o, faces[i], true); o += 4; }
    return out;
  }
  function convertMesh(b) {
    const nl = b.indexOf(10);
    const ver = td.decode(b.subarray(8, nl)).trim();
    if (ver === '1.00' || ver === '1.01' || ver === '2.00') return b;   // the 2016 engine reads these
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let o = nl + 1;
    let nv, nf, vsize, lods = [], verts, faces;
    if (ver === '3.00' || ver === '3.01') {
      const hs = dv.getUint16(o, true); vsize = dv.getUint8(o + 2);
      const nlod = dv.getUint16(o + 6, true); nv = dv.getUint32(o + 8, true); nf = dv.getUint32(o + 12, true);
      o += hs;
      const vstart = o; o += nv * vsize;
      const fstart = o; o += nf * 12;
      for (let i = 0; i < nlod; i++) lods.push(dv.getUint32(o + i * 4, true));
      verts = readVerts(dv, vstart, nv, vsize, true);
      faces = readFaces(dv, fstart, nf);
    } else if (ver === '4.00' || ver === '4.01' || ver === '5.00') {
      const hs = dv.getUint16(o, true);
      nv = dv.getUint32(o + 4, true); nf = dv.getUint32(o + 8, true);
      const nlod = dv.getUint16(o + 12, true), nbones = dv.getUint16(o + 14, true);
      o += hs;
      verts = readVerts(dv, o, nv, 40, false);
      o += nv * 40;
      if (nbones > 0) o += nv * 8;   // skinning
      faces = readFaces(dv, o, nf);
      o += nf * 12;
      for (let i = 0; i < nlod; i++) lods.push(dv.getUint32(o + i * 4, true));
    } else {
      throw new Error('mesh version ' + ver + ' (from 2023 on) can\'t be converted; export it from Studio as an .obj instead');
    }
    if (lods.length >= 2 && lods[1] > lods[0]) faces = faces.slice(lods[0] * 3, lods[1] * 3);   // the most detailed level only
    return meshV2(verts, faces);
  }
  function readVerts(dv, o, n, size, uvw) {
    const v = new Float32Array(n * 8);
    for (let i = 0; i < n; i++, o += size) {
      for (let k = 0; k < 6; k++) v[i * 8 + k] = dv.getFloat32(o + k * 4, true);
      v[i * 8 + 6] = dv.getFloat32(o + 24, true);
      v[i * 8 + 7] = dv.getFloat32(o + 28, true);
      void uvw;
    }
    return v;
  }
  function readFaces(dv, o, n) {
    const f = new Uint32Array(n * 3);
    for (let i = 0; i < n * 3; i++) f[i] = dv.getUint32(o + i * 4, true);
    return f;
  }
  // a Wavefront .obj (what Studio and Blender export) -> mesh 2.00
  function objToMesh(text) {
    const P = [], T = [], N = [], verts = [], faces = [], seen = new Map();
    const vert = key => {
      if (seen.has(key)) return seen.get(key);
      const [pi, ti, ni] = key.split('/').map(x => (x ? parseInt(x, 10) : 0));
      const p = P[pi > 0 ? pi - 1 : P.length + pi] || [0, 0, 0];
      const t = ti ? T[ti > 0 ? ti - 1 : T.length + ti] || [0, 0] : [0, 0];
      const nn = ni ? N[ni > 0 ? ni - 1 : N.length + ni] || null : null;
      const i = verts.length / 8;
      verts.push(p[0], p[1], p[2], nn ? nn[0] : NaN, nn ? nn[1] : 0, nn ? nn[2] : 0, t[0], 1 - t[1]);
      seen.set(key, i);
      return i;
    };
    for (const line of text.split(/\r?\n/)) {
      const w = line.trim().split(/\s+/);
      if (w[0] === 'v') P.push([+w[1], +w[2], +w[3]]);
      else if (w[0] === 'vt') T.push([+w[1], +w[2]]);
      else if (w[0] === 'vn') N.push([+w[1], +w[2], +w[3]]);
      else if (w[0] === 'f' && w.length >= 4) {
        const idx = w.slice(1).map(vert);
        for (let k = 1; k + 1 < idx.length; k++) faces.push(idx[0], idx[k], idx[k + 1]);
      }
    }
    if (!faces.length) throw new Error('no faces in the .obj file');
    // vertices without normals: average the faces around them
    const acc = new Float32Array(verts.length / 8 * 3);
    for (let f = 0; f < faces.length; f += 3) {
      const [a, b, c] = [faces[f], faces[f + 1], faces[f + 2]].map(i => [verts[i * 8], verts[i * 8 + 1], verts[i * 8 + 2]]);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      for (const i of [faces[f], faces[f + 1], faces[f + 2]]) for (let k = 0; k < 3; k++) acc[i * 3 + k] += n[k];
    }
    for (let i = 0; i < verts.length / 8; i++) {
      if (!Number.isNaN(verts[i * 8 + 3])) continue;
      const l = Math.hypot(acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]) || 1;
      for (let k = 0; k < 3; k++) verts[i * 8 + 3 + k] = acc[i * 3 + k] / l;
    }
    return meshV2(verts, faces);
  }

  // ---------------------------------------------------------------- images -> PNG, sounds -> WAV
  async function toPng(bytes, type) {
    const bmp = await createImageBitmap(new Blob([bytes], { type }));
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }
  async function toWav(bytes) {
    const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
    const audio = await ac.decodeAudioData(bytes.slice().buffer);
    const ch = Math.min(2, audio.numberOfChannels), n = audio.length, rate = audio.sampleRate;
    const out = new Uint8Array(44 + n * ch * 2), dv = new DataView(out.buffer);
    out.set(te.encode('RIFF'), 0); dv.setUint32(4, 36 + n * ch * 2, true); out.set(te.encode('WAVEfmt '), 8);
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
    out.set(te.encode('data'), 36); dv.setUint32(40, n * ch * 2, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(audio.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return out;
  }

  // one uploaded file -> { id, type, bytes, note } in a form the engine reads
  async function prepare(name, bytes) {
    const id = idOf(name);
    if (!id) return { skip: name + ' (no asset id in its name)' };
    const k = kind(bytes, name);
    try {
      if (k === 'mesh') return { id, type: TYPES.mesh, bytes: convertMesh(bytes), what: 'mesh' };
      if (k === 'obj') return { id, type: TYPES.mesh, bytes: objToMesh(td.decode(bytes)), what: 'mesh' };
      if (k === 'png' || k === 'jpeg') return { id, type: TYPES[k], bytes, what: 'image' };
      if (k === 'gif' || k === 'webp' || k === 'bmp' || k === 'svg') return { id, type: 'image/png', bytes: await toPng(bytes, k === 'svg' ? 'image/svg+xml' : 'image/' + k), what: 'image' };
      if (k === 'mp3' || k === 'ogg' || k === 'wav') return { id, type: TYPES[k], bytes, what: 'sound' };
      if (k === 'flac' || k === 'm4a' || k === 'webm') return { id, type: 'audio/wav', bytes: await toWav(bytes), what: 'sound' };
      if (k === 'model') return { id, type: TYPES.model, bytes, what: 'model' };
      return { skip: name + ' (not an image, mesh or sound)' };
    } catch (e) {
      return { skip: name + ' (' + (e.message || e) + ')' };
    }
  }

  // the files someone picked -> the place, and its assets ready to store
  async function sort(files) {
    const list = [];
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (/\.zip$/i.test(f.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4)) {
        try { for (const e of await unzip(bytes)) list.push(e); } catch (err) { list.push({ name: f.name, bytes, bad: 'couldn\'t open the zip: ' + err.message }); }
      } else list.push({ name: f.name, bytes });
    }
    const places = list.filter(e => PLACE_RE.test(e.name)).sort((a, b) => (/\.rbxl$/i.test(b.name) ? 1 : 0) - (/\.rbxl$/i.test(a.name) ? 1 : 0));
    const assets = [], skipped = [];
    for (const e of list) {
      if (PLACE_RE.test(e.name)) continue;
      if (e.bad) { skipped.push(e.name + ' (' + e.bad + ')'); continue; }
      const r = await prepare(e.name, e.bytes);
      if (r.skip) skipped.push(r.skip); else assets.push(Object.assign({ name: e.name }, r));
    }
    return { place: places[0] ? { name: places[0].name, bytes: places[0].bytes } : null, assets, skipped };
  }

  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('webblox', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  // keep the assets (replace: forget the last game's first)
  async function store(assets, opts = {}) {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction('files', 'readwrite'), st = tx.objectStore('files');
      if (opts.replace) st.delete(IDBKeyRange.bound('asset:', 'asset:￿'));
      for (const a of assets) st.put({ type: a.type, bytes: a.bytes.buffer.slice(a.bytes.byteOffset, a.bytes.byteOffset + a.bytes.byteLength), name: a.name }, 'asset:' + a.id);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    return assets.length;
  }

  window.GNAssets = { sort, store, unzip, convertMesh, objToMesh, idOf, kind };
})();
