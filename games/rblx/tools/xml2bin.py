#!/usr/bin/env python3
"""Convert a Roblox XML place (.rbxl/.rbxlx, 2008-2016 era) into the binary
.rbxl format the WebBlox (2016) engine reads quickly.

Also clears Script.LinkedSource (the engine waits forever on the missing asset
server), fixes FogEnd=0 in very old places, and rebuilds real services from
"CreatorId=... PlaceId=..." snapshot models.

Property types come from typemap.json ("Class.Property": binary type id), read
out of the engine's own binary places in rblx.data. The engine rejects a
property chunk whose type differs from what it expects.

usage: python3 xml2bin.py in.rbxl out.rbxl      (needs: pip install lz4)
"""
import sys, os, json, struct, math
import xml.etree.ElementTree as ET
from collections import defaultdict
import lz4.block
T_STRING, T_BOOL, T_INT, T_FLOAT, T_DOUBLE, T_UDIM2 = 1, 2, 3, 4, 5, 7
T_BRICKCOLOR, T_COLOR3, T_VECTOR2, T_VECTOR3, T_CFRAME, T_ENUM, T_REF = 11, 12, 13, 14, 16, 18, 19

XML_TYPE = {'string': T_STRING, 'ProtectedString': T_STRING, 'Content': T_STRING, 'BinaryString': T_STRING,
            'bool': T_BOOL, 'int': T_INT, 'float': T_FLOAT, 'double': T_DOUBLE, 'UDim2': T_UDIM2,
            'Color3': T_COLOR3, 'Vector2': T_VECTOR2, 'Vector3': T_VECTOR3, 'CoordinateFrame': T_CFRAME,
            'token': T_ENUM, 'Ref': T_REF}
BRICKCOLOR_NAMES = {'BrickColor', 'TeamColor', 'HeadColor', 'LeftArmColor', 'RightArmColor',
                    'LeftLegColor', 'RightLegColor', 'TorsoColor'}
# (class, property) types the engine expects that its own sample files don't cover
CLASS_TYPES = {('BrickColorValue', 'Value'): T_BRICKCOLOR, ('IntValue', 'Value'): T_INT,
               ('NumberValue', 'Value'): T_DOUBLE, ('StringValue', 'Value'): T_STRING,
               ('BoolValue', 'Value'): T_BOOL, ('ObjectValue', 'Value'): T_REF,
               ('Vector3Value', 'Value'): T_VECTOR3, ('CFrameValue', 'Value'): T_CFRAME,
               ('Color3Value', 'Value'): T_COLOR3}
SERVICES = {'AdService', 'AssetService', 'BadgeService', 'CSGDictionaryService', 'ChangeHistoryService',
            'Chat', 'CollectionService', 'ContentProvider', 'ContextActionService', 'CookiesService', 'Debris',
            'FWService', 'GamePassService', 'Geometry', 'GuiService', 'HttpService', 'InsertService', 'JointsService',
            'Lighting', 'LogService', 'LuaWebService', 'MarketplaceService', 'NonReplicatedCSGDictionaryService',
            'NotificationService', 'PhysicsService', 'Players', 'PointsService', 'RenderHooksService',
            'ReplicatedFirst', 'ReplicatedStorage', 'RunService', 'ScriptContext', 'ScriptInformationProvider',
            'ScriptService', 'Selection', 'ServerScriptService', 'ServerStorage', 'SocialService', 'SoundService',
            'StarterGui', 'StarterPack', 'StarterPlayer', 'Teams', 'TeleportService', 'TestService', 'TimerService',
            'UserInputService', 'Visit', 'Workspace'}


def num(s, default=0.0):
    if s is None:
        return default
    s = s.strip()
    try:
        return float(s)
    except ValueError:
        sl = s.lower()
        if 'inf' in sl:
            return -math.inf if sl.startswith('-') else math.inf
        return default


def child_num(el, tag, default=0.0):
    c = el.find(tag)
    return num(c.text if c is not None else None, default)


def parse_value(el, typ):
    tag = el.tag
    txt = el.text or ''
    if typ == T_STRING:
        if tag == 'Content':
            for c in el:
                if c.tag == 'url':
                    return (c.text or '').strip()
            return ''
        return txt
    if typ == T_BOOL:
        return txt.strip().lower() == 'true'
    if typ in (T_INT, T_BRICKCOLOR, T_ENUM):
        v = num(txt)
        return int(v) if math.isfinite(v) else 0
    if typ in (T_FLOAT, T_DOUBLE):
        return num(txt)
    if typ == T_VECTOR3:
        return tuple(child_num(el, k) for k in 'XYZ')
    if typ == T_VECTOR2:
        return tuple(child_num(el, k) for k in 'XY')
    if typ == T_CFRAME:
        return tuple(child_num(el, k) for k in ('X', 'Y', 'Z', 'R00', 'R01', 'R02', 'R10', 'R11', 'R12', 'R20', 'R21', 'R22'))
    if typ == T_UDIM2:
        return (child_num(el, 'XS'), child_num(el, 'YS'), int(child_num(el, 'XO')), int(child_num(el, 'YO')))
    if typ == T_COLOR3:
        if el.find('R') is not None:
            return tuple(child_num(el, k) for k in 'RGB')
        v = int(num(txt)) & 0xFFFFFFFF
        return (((v >> 16) & 255) / 255.0, ((v >> 8) & 255) / 255.0, (v & 255) / 255.0)
    if typ == T_REF:
        return txt.strip()
    raise ValueError(typ)


DEFAULTS = {T_STRING: '', T_BOOL: False, T_INT: 0, T_BRICKCOLOR: 194, T_ENUM: 0, T_FLOAT: 0.0, T_DOUBLE: 0.0,
            T_VECTOR3: (0.0, 0.0, 0.0), T_VECTOR2: (0.0, 0.0), T_CFRAME: (0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1),
            T_UDIM2: (0.0, 0.0, 0, 0), T_COLOR3: (0.0, 0.0, 0.0), T_REF: 'null'}


# ---- binary encoders -------------------------------------------------------
def interleave(rows):
    if not rows:
        return b''
    k = len(rows[0])
    return bytes(r[j] for j in range(k) for r in rows)


def zz32(x):
    x = ((x + 2**31) % 2**32) - 2**31
    return ((x << 1) ^ (x >> 31)) & 0xFFFFFFFF


def rbxfloat(f):
    b, = struct.unpack('>I', struct.pack('>f', f))
    return ((b << 1) | (b >> 31)) & 0xFFFFFFFF


def enc_floats(vals):
    return interleave([rbxfloat(v).to_bytes(4, 'big') for v in vals])


def enc_ints(vals):
    return interleave([zz32(v).to_bytes(4, 'big') for v in vals])


def enc_u32(vals):
    return interleave([(v & 0xFFFFFFFF).to_bytes(4, 'big') for v in vals])


def enc_refs(vals):
    out, last = [], 0
    for v in vals:
        out.append(v - last)
        last = v
    return enc_ints(out)


def finite(f, big=1e30):
    if math.isnan(f):
        return 0.0
    return max(-3.4e38, min(3.4e38, f))


def encode(typ, vals):
    if typ == T_STRING:
        out = bytearray()
        for v in vals:
            b = v.encode('utf-8', 'surrogatepass') if isinstance(v, str) else v
            out += struct.pack('<I', len(b)) + b
        return bytes(out)
    if typ == T_BOOL:
        return bytes(1 if v else 0 for v in vals)
    if typ == T_INT:
        return enc_ints(vals)
    if typ in (T_BRICKCOLOR, T_ENUM):
        return enc_u32(vals)
    if typ == T_FLOAT:
        return enc_floats([finite(v) for v in vals])
    if typ == T_DOUBLE:
        return b''.join(struct.pack('<d', v) for v in vals)
    if typ == T_VECTOR3:
        return b''.join(enc_floats([finite(v[i]) for v in vals]) for i in range(3))
    if typ == T_VECTOR2:
        return b''.join(enc_floats([finite(v[i]) for v in vals]) for i in range(2))
    if typ == T_COLOR3:
        return b''.join(enc_floats([finite(v[i]) for v in vals]) for i in range(3))
    if typ == T_UDIM2:
        return (enc_floats([finite(v[0]) for v in vals]) + enc_floats([finite(v[1]) for v in vals]) +
                enc_ints([v[2] for v in vals]) + enc_ints([v[3] for v in vals]))
    if typ == T_CFRAME:
        rot = bytearray()
        for v in vals:
            rot += b'\x00' + struct.pack('<9f', *[finite(x) for x in v[3:]])
        return bytes(rot) + b''.join(enc_floats([finite(v[i]) for v in vals]) for i in range(3))
    if typ == T_REF:
        return enc_refs(vals)
    raise ValueError(typ)


def coerce(typ, v):
    """Convert a value parsed with the XML's own type to the engine's type."""
    if typ in (T_INT, T_BRICKCOLOR, T_ENUM):
        return int(v) if not isinstance(v, (tuple, str)) else DEFAULTS[typ]
    if typ in (T_FLOAT, T_DOUBLE):
        return float(v) if not isinstance(v, (tuple, str)) else 0.0
    if typ == T_STRING:
        return v if isinstance(v, str) else ''
    return v


def chunk(name, data, compress=True):
    name = name.encode().ljust(4, b'\0')
    if compress and data:
        c = lz4.block.compress(data, store_size=False)
        return name + struct.pack('<III', len(c), len(data), 0) + c
    return name + struct.pack('<III', 0, len(data), 0) + data


SNAPSHOT_SERVICES = {'Workspace': 'Workspace', 'Lighting': 'Lighting', 'StarterPack': 'StarterPack',
                     'StarterGui': 'StarterGui', 'Soundscape': 'SoundService', 'Teams': 'Teams'}


def item_name(it):
    e = it.find("Properties/string[@name='Name']")
    return (e.text or '') if e is not None else ''


def as_service(model, cls):
    """Turn a Model that holds a saved service's children into that service."""
    model.set('class', cls)
    props = model.find('Properties')
    if props is not None:
        for p in list(props):
            if p.get('name') != 'Name':
                props.remove(p)
    return model


def normalize(root, stats):
    """Some uploads are 'place snapshots': services saved as Models inside a
    'CreatorId=... ___ PlaceId=...' Model. Rebuild real services from them, or
    drop the snapshot when the file already has a real Workspace."""
    tops = [it for it in root if it.tag == 'Item']
    snaps = [it for it in tops if it.get('class') == 'Model' and item_name(it).startswith('CreatorId=')]
    if any(it.get('class') == 'Workspace' for it in tops):
        for s in snaps:
            root.remove(s)
            stats['snapshot-dropped'] += 1
        return
    if snaps:
        for it in tops:
            if it.get('class') == 'Model':
                root.remove(it)
        for c in snaps[0]:
            if c.tag == 'Item' and c.get('class') == 'Model' and item_name(c) in SNAPSHOT_SERVICES:
                root.append(as_service(c, SNAPSHOT_SERVICES[item_name(c)]))
                stats['snapshot-service:' + item_name(c)] += 1
        return
    for it in tops:
        if it.get('class') == 'Model' and item_name(it) in SNAPSHOT_SERVICES:
            as_service(it, SNAPSHOT_SERVICES[item_name(it)])
            stats['model-to-service:' + item_name(it)] += 1


def load_typemap():
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'typemap.json')) as f:
        return {tuple(k.split('.', 1)): v for k, v in json.load(f).items()}


def convert(tmap, src):
    tree = ET.parse(src)
    root = tree.getroot()
    insts = []          # (class, parentIndex or -1, {prop: (xmltag, element)})
    ref_index = {}
    stats = defaultdict(int)
    normalize(root, stats)

    def walk(item, parent):
        idx = len(insts)
        ref = item.get('referent')
        if ref:
            ref_index[ref] = idx
        props = {}
        p = item.find('Properties')
        if p is not None:
            for el in p:
                name = el.get('name')
                if name and el.tag in XML_TYPE:
                    props[name] = el
                elif name:
                    stats['skipped-tag:' + el.tag] += 1
        insts.append([item.get('class'), parent, props, []])
        for c in item:
            if c.tag == 'Item':
                insts[idx][3].append(walk(c, idx))
        return idx

    tops = [walk(it, -1) for it in root if it.tag == 'Item']

    by_class = defaultdict(list)
    for i, (cn, _, _, _) in enumerate(insts):
        by_class[cn].append(i)
    class_names = sorted(by_class)

    out_chunks = []
    for cid, cn in enumerate(class_names):
        ids = by_class[cn]
        svc = all(insts[i][1] == -1 for i in ids) and cn in SERVICES
        data = struct.pack('<i', cid) + struct.pack('<I', len(cn)) + cn.encode() + bytes([1 if svc else 0])
        data += struct.pack('<I', len(ids)) + enc_refs(ids)
        if svc:
            data += b'\x01' * len(ids)
        out_chunks.append(chunk('INST', data))

    for cid, cn in enumerate(class_names):
        ids = by_class[cn]
        names = sorted({n for i in ids for n in insts[i][2]})
        for pn in names:
            tags = {insts[i][2][pn].tag for i in ids if pn in insts[i][2]}
            xtyp = XML_TYPE[sorted(tags)[0]]
            typ = tmap.get((cn, pn)) or CLASS_TYPES.get((cn, pn))
            if typ is None:
                typ = T_BRICKCOLOR if (pn in BRICKCOLOR_NAMES and xtyp == T_INT) else xtyp
            vals = []
            for i in ids:
                el = insts[i][2].get(pn)
                if el is None:
                    stats['default-filled'] += 1
                    v = DEFAULTS[typ]
                else:
                    v = parse_value(el, XML_TYPE[el.tag])
                    if XML_TYPE[el.tag] != typ:
                        v = coerce(typ, v)
                if pn == 'LinkedSource' and v:
                    stats['linkedsource-stripped'] += 1
                    v = ''
                if cn == 'Lighting' and pn == 'FogEnd' and v <= 0:
                    v = 100000.0
                if typ == T_REF:
                    v = ref_index.get(v, -1) if isinstance(v, str) else v
                vals.append(v)
            data = struct.pack('<i', cid) + struct.pack('<I', len(pn)) + pn.encode() + bytes([typ]) + encode(typ, vals)
            out_chunks.append(chunk('PROP', data))

    order = []
    def post(i):
        for c in insts[i][3]:
            post(c)
        order.append(i)
    for t in tops:
        post(t)
    data = b'\x00' + struct.pack('<I', len(order)) + enc_refs(order) + enc_refs([insts[i][1] for i in order])
    out_chunks.append(chunk('PRNT', data))
    out_chunks.append(chunk('END', b'</roblox>', compress=False))

    header = b'<roblox!\x89\xff\r\n\x1a\n' + struct.pack('<Hii', 0, len(class_names), len(insts)) + b'\0' * 8
    return header + b''.join(out_chunks), len(insts), len(class_names), dict(stats)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    blob, n, nc, stats = convert(load_typemap(), sys.argv[1])
    with open(sys.argv[2], 'wb') as f:
        f.write(blob)
    print(f'{sys.argv[1]} -> {sys.argv[2]}: {n} instances, {nc} classes, {len(blob)} bytes, {dict(stats)}')
