#!/usr/bin/env python3
"""Add avatar items to the GN-BLOX Catalog from a folder of images:

  <folder>/Classic Faces/<asset id>.png   faces (a decal on the head)
  <folder>/shirt/<asset id>.png           classic shirt templates (585 x 559)
  <folder>/pants/<asset id>.png           classic pants templates (585 x 559)

The images go in ../catalog/assets/<asset id>.png (faces at most 256 px), and ../catalog/items.js
lists every item for the site (site.js adds them to WB.ITEMS). In games, a face or template is
asked for as http://www.roblox.com/asset/?id=<asset id> and the service worker
(../coi-serviceworker.js) answers with the file from catalog/assets/, so uploaded games that use
the same ids get them too.

Hats, hair and other accessories come from Roblox accessory files (.rbxm / .rbxmx, anywhere in the
folder, read with read_accessory.js and Node). A .rbxm only names its mesh and texture by asset id,
so those files have to be in the folder too, named by their ids (1090700.mesh or 1090700, and
1090703.png); an accessory whose files aren't there yet is listed and left out. Meshes of any
version (and .obj files) become mesh 2.00 in catalog/assets/<id>.mesh, textures PNG. Where an
accessory sits comes from its attachment (HatAttachment, HairAttachment, FaceFrontAttachment,
WaistFrontAttachment...) matched to the classic R6 body's.

usage: python3 build_catalog.py <folder>     (needs Pillow and Node; run it again after adding files)
"""
import json, os, re, struct, subprocess, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CATALOG = os.path.join(HERE, '..', 'catalog')
ASSETS = os.path.join(CATALOG, 'assets')

# names and prices for clothes (by asset id); anything else gets a plain name
NAMES = {
    '121355517030620': 'Pink Kitty Tee', '121364656835410': 'Black Smiley Shirt', '12142438478': 'Black Suit',
    '125157548394108': 'Black Graphic Hoodie', '13707005008': 'Black Zip Jacket', '15676421144': 'Red Flannel Shirt',
    '17044638424': 'Dab Tee', '17828041045': 'Green Cat Tee', '5134719820': 'Black Plaid Shirt',
    '6553589977': 'Black Vest Outfit', '6668635237': 'Two-Tone Puffer Jacket',
    '10694861156': 'Light Blue Jeans', '12955459388': 'Black Jeans', '13500839149': 'Black Track Pants',
    '144076760': 'Dark Green Pants', '18879690980': 'Orange Fighter Pants', '398633812': 'Black Pants',
    '6960786140': 'Grey Plaid Skirt', '8565793393': 'Black Frilly Skirt', '96344185125757': 'Plaid Shorts',
}
FEATURED = {'15676421144', '12142438478', '17828041045', '10694861156', '12955459388', '6960786140'}
FOLDERS = (('Classic Faces', 'face'), ('faces', 'face'), ('shirt', 'shirt'), ('shirts', 'shirt'), ('pants', 'pants'))


# accessories: names for the ones we know (others come from the file name)
ACC_NAMES = {
    '136457733167605': 'Black Shades', '1016145591': 'Blue Top Hat', '1097026': 'Cheese Hat', '138932314': 'Dominus Aureus',
    '21070012': 'Dominus Empyreus', '64444871': 'Dominus Messor', '250395631': 'Dominus Rex',
    '19027209': 'Perfectly Legitimate Business Hat', '417457461': 'ROBLOX R Baseball Cap', '116777409': 'Tiger Hat',
    '8331552': 'Tiny Top Hat', '1365767': 'Valkyrie Helm', '1402432199': 'Violet Valkyrie',
    '233615637': 'Beautiful Blonde Hair', '17877340': 'Beautiful Brown Hair', '16630147': 'Beautiful Hair for Beautiful People',
    '120209930556189': 'Black Messy Curly Hair', '323476364': 'Brown Scene Hair', '13745548': 'Cinnamon Hair',
    '553722174': 'Crimson Shaggy 2.0', '498747460': 'Nerd Hair', '32278814': 'Trecky Hair', '451221329': 'True Blue Hair',
    '119266145525998': 'Rolled Up Ski Mask with Messy Dreads', '99639405620235': 'Pizza Box',
}
ACC_PRICES = {'138932314': 2500, '21070012': 2000, '64444871': 2000, '250395631': 2000, '1365767': 1500, '1402432199': 1200}
# the classic R6 body's attachments: name -> (body part, position)
R6_ATTACH = {
    'HatAttachment': ('Head', (0, 0.6, 0)), 'HairAttachment': ('Head', (0, 0.6, 0)), 'FaceFrontAttachment': ('Head', (0, 0, -0.6)),
    'FaceCenterAttachment': ('Head', (0, 0, 0)), 'NeckAttachment': ('Torso', (0, 1, 0)), 'BodyFrontAttachment': ('Torso', (0, 0, -0.5)),
    'BodyBackAttachment': ('Torso', (0, 0, 0.5)), 'LeftCollarAttachment': ('Torso', (-1, 1, 0)), 'RightCollarAttachment': ('Torso', (1, 1, 0)),
    'WaistFrontAttachment': ('Torso', (0, -1, -0.5)), 'WaistBackAttachment': ('Torso', (0, -1, 0.5)), 'WaistCenterAttachment': ('Torso', (0, -1, 0)),
}
# outfit slot by attachment (one of each can be worn)
SLOT = {'HatAttachment': 'hat', 'HairAttachment': 'hair', 'FaceFrontAttachment': 'glasses', 'FaceCenterAttachment': 'glasses'}


def cf_inv(c):
    """CFrame [x, y, z, r00..r22] -> its inverse"""
    x, y, z = c[:3]
    r = c[3:]
    t = [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]]
    return [-(t[0] * x + t[1] * y + t[2] * z), -(t[3] * x + t[4] * y + t[5] * z), -(t[6] * x + t[7] * y + t[8] * z)] + t


def cf_mul(a, b):
    ra, rb = a[3:], b[3:]
    r = [sum(ra[i * 3 + k] * rb[k * 3 + j] for k in range(3)) for i in range(3) for j in range(3)]
    p = [ra[i * 3] * b[0] + ra[i * 3 + 1] * b[1] + ra[i * 3 + 2] * b[2] + a[i] for i in range(3)]
    return p + r


# ---- meshes -> version 2.00 (what the 2016 engine and avatar3d.js read)
def mesh_v2(verts, faces):
    out = bytearray(b'version 2.00\n') + struct.pack('<HBBII', 12, 36, 12, len(verts), len(faces) // 3)
    for v in verts:
        out += struct.pack('<9f', v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], 0)
    out += struct.pack('<%dI' % len(faces), *faces)
    return bytes(out)


def to_mesh_v2(data, name=''):
    if name.lower().endswith('.obj'):
        return obj_to_v2(data.decode('utf-8', 'replace'))
    nl = data.index(b'\n')
    ver = data[8:nl].decode().strip()
    body = data[nl + 1:]
    if ver in ('1.00', '1.01'):
        nums = [float(x) for x in re.findall(rb'-?[\d.]+(?:e-?\d+)?', body.split(b'\n', 1)[1])]
        k = 0.5 if ver == '1.00' else 1
        verts, faces = [], []
        for i in range(0, len(nums) - 8, 9):
            p, n, t = nums[i:i + 3], nums[i + 3:i + 6], nums[i + 6:i + 9]
            verts.append((p[0] * k, p[1] * k, p[2] * k, n[0], n[1], n[2], t[0], 1 - t[1]))
            faces.append(len(verts) - 1)
        return mesh_v2(verts, faces)
    if ver == '2.00':
        return data
    if ver in ('3.00', '3.01'):
        hs, vs, fs, _, nlod, nv, nf = struct.unpack_from('<HBBHHII', body, 0)
        o = hs
        verts = [struct.unpack_from('<8f', body, o + i * vs) for i in range(nv)]
        o += nv * vs
        faces = list(struct.unpack_from('<%dI' % (nf * 3), body, o))
        o += nf * 12
        lods = list(struct.unpack_from('<%dI' % nlod, body, o)) if nlod else []
    elif ver in ('4.00', '4.01', '5.00'):
        hs, _, nv, nf, nlod, nbones = struct.unpack_from('<HHIIHH', body, 0)
        o = hs
        verts = [struct.unpack_from('<8f', body, o + i * 40) for i in range(nv)]
        o += nv * 40 + (nv * 8 if nbones else 0)
        faces = list(struct.unpack_from('<%dI' % (nf * 3), body, o))
        o += nf * 12
        lods = list(struct.unpack_from('<%dI' % nlod, body, o)) if nlod else []
    else:
        raise ValueError('mesh version %s (2023 and later) can\'t be converted: export it from Studio as .obj' % ver)
    if len(lods) >= 2 and lods[1] > lods[0]:
        faces = faces[lods[0] * 3:lods[1] * 3]   # the most detailed level only
    return mesh_v2(verts, faces)


def obj_to_v2(text):
    P, T, N, verts, faces, seen = [], [], [], [], [], {}
    for line in text.splitlines():
        w = line.split()
        if not w:
            continue
        if w[0] == 'v':
            P.append(tuple(map(float, w[1:4])))
        elif w[0] == 'vt':
            T.append(tuple(map(float, w[1:3])))
        elif w[0] == 'vn':
            N.append(tuple(map(float, w[1:4])))
        elif w[0] == 'f':
            idx = []
            for key in w[1:]:
                if key not in seen:
                    a = (key.split('/') + ['', ''])[:3]
                    p = P[int(a[0]) - 1]
                    t = T[int(a[1]) - 1] if a[1] else (0, 0)
                    n = N[int(a[2]) - 1] if a[2] else (0, 1, 0)
                    seen[key] = len(verts)
                    verts.append((p[0], p[1], p[2], n[0], n[1], n[2], t[0], 1 - t[1]))
                idx.append(seen[key])
            for k in range(1, len(idx) - 1):
                faces += [idx[0], idx[k], idx[k + 1]]
    return mesh_v2(verts, faces)


def find_files(folder):
    """asset id -> file, for every file named by an id (1090700, 1090700.mesh, 1090703.png...)"""
    out = {}
    for root, _, files in os.walk(folder):
        for f in files:
            m = re.match(r'^(\d{3,})(?:\.(mesh|obj|png|jpe?g|bmp|gif|webp))?$', f, re.I)
            if m and m.group(1) not in out:
                out[m.group(1)] = os.path.join(root, f)
    return out


def accessories(folder, files):
    rbxm = [os.path.join(r, f) for r, _, fs in os.walk(folder) for f in fs if re.search(r'\.rbxmx?$', f, re.I)]
    if not rbxm:
        return [], []
    info = json.loads(subprocess.check_output(['node', os.path.join(HERE, 'read_accessory.js')] + rbxm))
    items, waiting = [], []
    for e in info:
        base = os.path.basename(e['file'])
        m = re.search(r'(\d{4,})', base)
        id_ = m.group(1) if m else ''
        if e.get('error') or not id_ or not e['meshId']:
            print('skipped', base, e.get('error') or 'no asset id / mesh')
            continue
        att = (e.get('attachment') or {}).get('name')
        if att in R6_ATTACH:
            part, pos = R6_ATTACH[att]
            c0 = cf_mul([pos[0], pos[1], pos[2], 1, 0, 0, 0, 1, 0, 0, 0, 1], cf_inv(e['attachment']['cframe']))
        else:   # an old-style hat: Head * (0, 0.5, 0) * AttachmentPoint:inverse()
            part = 'Head'
            c0 = cf_mul([0, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], cf_inv(e['attachmentPoint']))
        slot = SLOT.get(att, 'hat' if part == 'Head' else 'back')
        name = ACC_NAMES.get(id_) or re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', re.sub(r'_?\d+\.rbxmx?$', '', base, flags=re.I))
        need = [x for x in (e['meshId'], e['textureId']) if x and x not in files]
        if need:
            waiting.append((name, e['meshId'], e['textureId'], need))
            continue
        mesh = files[e['meshId']]
        with open(mesh, 'rb') as fh:
            data = to_mesh_v2(fh.read(), mesh)
        with open(os.path.join(ASSETS, e['meshId'] + '.mesh'), 'wb') as fh:
            fh.write(data)
        if e['textureId']:
            Image.open(files[e['textureId']]).convert('RGBA').save(os.path.join(ASSETS, e['textureId'] + '.png'), optimize=True)
        r = lambda v: [round(float(x), 4) for x in v]
        items.append({'id': id_, 'name': name, 'price': ACC_PRICES.get(id_, 50 + (int(id_) % 9) * 50), 'slot': slot, 'part': part,
                      'mesh': e['meshId'], 'tex': e['textureId'], 'c0': r(c0), 'size': r(e['size']), 'scale': r(e['scale']),
                      'offset': r(e['offset']), 'vc': r(e['vertexColor'])})
    return items, waiting


def price(kind, id_):
    n = int(id_)
    if kind == 'face':
        return 10 + (n % 10) * 10
    return 5 + (n % 8) * 5


def main(folder):
    os.makedirs(ASSETS, exist_ok=True)
    old = {}
    path = os.path.join(CATALOG, 'items.js')
    if os.path.exists(path):   # keep items added before
        text = open(path).read()
        old = json.loads(text[text.index('{'):text.rindex('}') + 1])
    items = {k: {e[0]: e for e in old.get(k, [])} for k in ('face', 'shirt', 'pants')}
    acc = {e['id']: e for e in old.get('acc', [])}
    added = 0
    for sub, kind in FOLDERS:
        d = os.path.join(folder, sub)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            m = re.match(r'^(\d+)(?: \(\d+\))?\.png$', f, re.I)
            if not m:
                print('skipped (not <asset id>.png):', os.path.join(sub, f))
                continue
            id_ = m.group(1)
            if id_ in items[kind]:
                continue
            try:
                im = Image.open(os.path.join(d, f))
                im.load()
            except Exception as e:
                print('skipped (not an image):', os.path.join(sub, f), e)
                continue
            im = im.convert('RGBA')
            if kind == 'face' and max(im.size) > 256:
                s = 256 / max(im.size)
                im = im.resize((max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s))), Image.LANCZOS)
            im.save(os.path.join(ASSETS, id_ + '.png'), optimize=True)
            items[kind][id_] = [id_, NAMES.get(id_, ''), price(kind, id_), 1 if id_ in FEATURED else 0]
            added += 1
    new_acc, waiting = accessories(folder, find_files(folder))
    for e in new_acc:
        if e['id'] not in acc:
            added += 1
        acc[e['id']] = e
    if waiting:
        print('%d accessories are waiting for their mesh and texture files (name them by id):' % len(waiting))
        for name, mesh, tex, need in waiting:
            print('   %-40s mesh %-16s texture %-16s missing: %s' % (name, mesh, tex, ', '.join(need)))
    out = {k: sorted(v.values(), key=lambda e: int(e[0])) for k, v in items.items()}
    out['acc'] = sorted(acc.values(), key=lambda e: (e['slot'], e['name']))
    with open(path, 'w') as fh:
        fh.write('// GN-BLOX Catalog items made from images (tools/build_catalog.py; the images are in catalog/assets/).\n'
                 '// face / shirt / pants: [asset id, name, price, featured]; acc: hats, hair and other accessories\n'
                 '// (mesh and texture in catalog/assets/, c0: where the handle sits on its body part). site.js adds them to WB.ITEMS.\n'
                 'window.GNCATALOG = ' + json.dumps(out, separators=(',', ':')) + ';\n')
    print('added %d items: %d faces, %d shirts, %d pants, %d accessories in all' % (added, len(out['face']), len(out['shirt']), len(out['pants']), len(out['acc'])))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
