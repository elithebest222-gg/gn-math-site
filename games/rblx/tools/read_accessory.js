#!/usr/bin/env node
// Prints what build_catalog.py needs from Roblox accessory files (.rbxm / .rbxmx, XML or binary),
// as JSON: one entry per file with the accessory's handle size, mesh (ids, scale, offset, vertex
// color), attachment (name and CFrame) and legacy AttachmentPoint.
//   node read_accessory.js FILE...
'use strict';
const fs = require('fs');
const path = require('path');
global.fzstd = require(path.join(__dirname, '..', 'vendor', 'fzstd.js'));
const R = require(path.join(__dirname, '..', 'rbxfile.js'));

const idOf = v => { const m = /(\d{3,})\s*$/.exec(String(v || '').replace(/[^0-9]*$/, '')) || /id=(\d+)|rbxassetid:\/\/(\d+)/i.exec(String(v || '')); return m ? (m[1] || m[2]) : ''; };
const text = v => v instanceof Uint8Array ? new TextDecoder().decode(v) : v == null ? '' : String(v);
const IDENT = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];

const out = [];
for (const file of process.argv.slice(2)) {
  try {
    const doc = R.read(new Uint8Array(fs.readFileSync(file)));
    const acc = doc.insts.find(i => i.cls === 'Accessory' || i.cls === 'Hat' || i.cls === 'Accoutrement');
    const handle = acc && acc.children.find(c => c.name === 'Handle');
    if (!handle) { out.push({ file, error: 'no accessory with a Handle' }); continue; }
    const mesh = handle.children.find(c => c.cls === 'SpecialMesh');
    const att = handle.children.find(c => c.cls === 'Attachment');
    const mp = handle.cls === 'MeshPart';
    out.push({
      file,
      name: acc.name,
      size: handle.get('size') || handle.get('Size') || [1, 1, 1],
      meshId: idOf(text(mp ? handle.get('MeshId') || handle.get('MeshID') : mesh && mesh.get('MeshId'))),
      textureId: idOf(text(mp ? handle.get('TextureID') || handle.get('TextureId') : mesh && mesh.get('TextureId'))),
      scale: (mesh && mesh.get('Scale')) || [1, 1, 1],
      offset: (mesh && mesh.get('Offset')) || [0, 0, 0],
      vertexColor: (mesh && mesh.get('VertexColor')) || [1, 1, 1],
      meshPart: mp,
      attachment: att ? { name: att.name, cframe: att.get('CFrame') || IDENT } : null,
      attachmentPoint: acc.get('AttachmentPoint') || IDENT,
    });
  } catch (e) {
    out.push({ file, error: e.message });
  }
}
process.stdout.write(JSON.stringify(out, null, 1));
