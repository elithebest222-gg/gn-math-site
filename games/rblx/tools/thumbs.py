#!/usr/bin/env python3
"""Makes a game's two thumbnails from a 960x600 screenshot of it (the engine's top bar and the
status line at the bottom cropped off): thumbs/<id>.jpg (300 x 300) and thumbs/<id>-wide.jpg
(640 x 360), as the home page shows them.
    python3 thumbs.py SCREENSHOT.png GAME_ID [SQUARE_CENTER_X]"""
import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
src, gid = sys.argv[1], sys.argv[2]
cx = int(sys.argv[3]) if len(sys.argv) > 3 else None
im = Image.open(src).convert('RGB')
w, h = im.size
top, bottom = round(h * 0.07), round(h * 0.95)       # below the top bar, above the status line
body = im.crop((0, top, w, bottom))
bw, bh = body.size
# wide: 16:9 from the middle
ww = min(bw, round(bh * 16 / 9))
wh = round(ww * 9 / 16)
x0, y0 = (bw - ww) // 2, (bh - wh) // 2
body.crop((x0, y0, x0 + ww, y0 + wh)).resize((640, 360), Image.LANCZOS).save(os.path.join(HERE, '..', 'thumbs', gid + '-wide.jpg'), quality=88)
# square: as tall as it gets, around cx (the middle by default)
side = bh
cx = bw // 2 if cx is None else cx
x0 = max(0, min(bw - side, cx - side // 2))
body.crop((x0, 0, x0 + side, side)).resize((300, 300), Image.LANCZOS).save(os.path.join(HERE, '..', 'thumbs', gid + '.jpg'), quality=88)
print('thumbs/%s.jpg and thumbs/%s-wide.jpg' % (gid, gid))
