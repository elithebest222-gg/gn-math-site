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

Hats and hair need their mesh and texture files as well (a .rbxm only names them), so they're not
read from here.

usage: python3 build_catalog.py <folder>     (needs Pillow; run it again after adding images)
"""
import json, os, re, sys
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
    out = {k: sorted(v.values(), key=lambda e: int(e[0])) for k, v in items.items()}
    with open(path, 'w') as fh:
        fh.write('// GN-BLOX Catalog items made from images (tools/build_catalog.py; the images are in catalog/assets/).\n'
                 '// [asset id, name, price, featured]; site.js adds them to WB.ITEMS.\n'
                 'window.GNCATALOG = ' + json.dumps(out, separators=(',', ':')) + ';\n')
    print('added %d items: %d faces, %d shirts, %d pants in all' % (added, len(out['face']), len(out['shirt']), len(out['pants'])))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
