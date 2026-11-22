#!/usr/bin/env python3
"""GN-BLOX's own stand-in images for uploaded games whose Roblox images can't be downloaded:
tool icons, UI icons, button backgrounds, faces, a particle sparkle and a daytime sky.

Each one is ../game-assets/<id>.png, with ids from 9100000001 up (no Roblox asset has ids that
high). The place converter (rbxfile.js, STANDIN) points missing images at them by what the object
is (a Tool's icon, a shop button, a mob's face...), and the service worker serves them like any
other asset.

usage: python3 build_standins.py        (needs: pip install pillow)
"""
import math, os
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'game-assets')
BASE = 9100000000
S = 4                     # drawn at 4x, then scaled down (smooth edges)
# the order here IS the id (BASE + index + 1); rbxfile.js STANDIN uses the same numbers
NAMES = ['sword', 'gun', 'rocket', 'slingshot', 'trowel', 'bomb', 'ball', 'coil', 'skateboard', 'trophy',
         'potion', 'tool', 'cart', 'coin', 'star', 'gear', 'speaker', 'close', 'arrow', 'brick',
         'palette', 'person', 'play', 'lock', 'check', 'panel', 'sparkle', 'face', 'evilface', 'sky_bk',
         'sky_dn', 'sky_ft', 'sky_lf', 'sky_rt', 'sky_up', 'menu', 'shield', 'heart', 'clock', 'info',
         'question', 'dash', 'gift', 'panel_light']

OUTLINE = (20, 24, 32, 255)


def canvas(w=128, h=128):
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def done(im, w=128, h=128):
    return im.resize((w, h), Image.LANCZOS)


def P(*pts):
    return [(x * S, y * S) for x, y in pts]


def poly(d, pts, fill, width=4):
    d.polygon(P(*pts), fill=fill, outline=OUTLINE, width=width * S // 2)


def rect(d, x0, y0, x1, y1, fill, r=0, width=4):
    d.rounded_rectangle([x0 * S, y0 * S, x1 * S, y1 * S], radius=r * S, fill=fill, outline=OUTLINE, width=width * S // 2)


def ellipse(d, x0, y0, x1, y1, fill, width=4):
    d.ellipse([x0 * S, y0 * S, x1 * S, y1 * S], fill=fill, outline=OUTLINE, width=width * S // 2)


def line(d, pts, fill, width):
    d.line(P(*pts), fill=fill, width=width * S, joint='curve')


def rotated(im, deg):
    return im.rotate(deg, resample=Image.BICUBIC)


SILVER, STEEL, GOLD, BROWN, RED, GREEN, BLUE, DARK = (214, 220, 228, 255), (150, 160, 172, 255), (245, 196, 48, 255), (140, 90, 52, 255), (220, 60, 52, 255), (70, 170, 80, 255), (60, 130, 230, 255), (60, 64, 72, 255)


def sword():
    im, d = canvas()
    poly(d, [(58, 10), (70, 10), (70, 78), (64, 90), (58, 78)], SILVER)
    line(d, [(64, 16), (64, 78)], STEEL, 2)
    rect(d, 40, 78, 88, 88, GOLD, 3)
    rect(d, 58, 88, 70, 112, BROWN, 2)
    ellipse(d, 56, 110, 72, 124, GOLD)
    return done(rotated(im, -45))


def gun():
    im, d = canvas()
    rect(d, 14, 44, 108, 64, DARK, 4)
    rect(d, 100, 48, 120, 58, STEEL, 2)
    poly(d, [(30, 62), (52, 62), (46, 100), (26, 100)], BROWN)
    rect(d, 52, 62, 66, 80, DARK, 2)
    rect(d, 60, 36, 76, 44, STEEL, 2)
    return done(im)


def rocket():
    im, d = canvas()
    rect(d, 12, 46, 104, 74, GREEN, 6)
    rect(d, 96, 42, 116, 78, RED, 4)
    rect(d, 40, 30, 60, 46, DARK, 3)
    rect(d, 52, 74, 66, 98, DARK, 3)
    return done(rotated(im, 25))


def slingshot():
    im, d = canvas()
    line(d, [(64, 118), (64, 66), (34, 22)], BROWN, 12)
    line(d, [(64, 66), (94, 22)], BROWN, 12)
    line(d, [(34, 26), (64, 54), (94, 26)], RED, 4)
    ellipse(d, 56, 48, 72, 62, STEEL)
    return done(im)


def trowel():
    im, d = canvas()
    poly(d, [(64, 8), (100, 58), (64, 76), (28, 58)], SILVER)
    rect(d, 60, 74, 68, 88, STEEL, 2)
    rect(d, 56, 88, 72, 122, BROWN, 4)
    return done(im)


def bomb():
    im, d = canvas()
    ellipse(d, 18, 34, 108, 124, (36, 38, 44, 255))
    d.ellipse([38 * S, 52 * S, 56 * S, 70 * S], fill=(120, 124, 134, 255))
    rect(d, 56, 22, 74, 38, STEEL, 2)
    line(d, [(66, 22), (76, 10), (90, 8)], BROWN, 4)
    for a in range(0, 360, 45):
        r = math.radians(a)
        line(d, [(94, 8), (94 + 8 * math.cos(r), 8 + 8 * math.sin(r))], GOLD, 3)
    return done(im)


def ball():
    im, d = canvas()
    ellipse(d, 16, 16, 112, 112, (60, 140, 255, 255))
    d.ellipse([34 * S, 30 * S, 62 * S, 54 * S], fill=(200, 230, 255, 255))
    return done(im)


def coil():
    im, d = canvas()
    for i in range(6):
        y = 20 + i * 15
        d.ellipse([28 * S, y * S, 100 * S, (y + 16) * S], outline=OUTLINE, width=10 * S)
        d.ellipse([28 * S, y * S, 100 * S, (y + 16) * S], outline=RED, width=6 * S)
    rect(d, 52, 104, 76, 122, DARK, 3)
    return done(im)


def skateboard():
    im, d = canvas()
    rect(d, 10, 52, 118, 70, (230, 120, 40, 255), 9)
    for x in (28, 88):
        rect(d, x - 4, 70, x + 16, 76, STEEL, 1)
        ellipse(d, x - 6, 74, x + 6, 86, DARK)
        ellipse(d, x + 6, 74, x + 18, 86, DARK)
    return done(rotated(im, 15))


def trophy():
    im, d = canvas()
    d.arc([16 * S, 26 * S, 50 * S, 62 * S], 90, 270, fill=OUTLINE, width=8 * S)
    d.arc([78 * S, 26 * S, 112 * S, 62 * S], 270, 90, fill=OUTLINE, width=8 * S)
    poly(d, [(32, 14), (96, 14), (90, 52), (76, 70), (52, 70), (38, 52)], GOLD)
    rect(d, 58, 70, 70, 92, GOLD, 2)
    rect(d, 38, 92, 90, 106, GOLD, 3)
    rect(d, 30, 106, 98, 118, BROWN, 3)
    return done(im)


def potion():
    im, d = canvas()
    rect(d, 52, 12, 76, 22, BROWN, 3)
    rect(d, 54, 22, 74, 40, (210, 230, 240, 255), 2)
    ellipse(d, 24, 36, 104, 116, (210, 230, 240, 255))
    d.chord([28 * S, 40 * S, 100 * S, 112 * S], 10, 170, fill=(220, 50, 120, 255))
    return done(im)


def tool():
    im, d = canvas()
    line(d, [(36, 92), (84, 44)], STEEL, 14)
    ellipse(d, 70, 14, 116, 60, STEEL)
    d.polygon(P((92, 14), (116, 30), (100, 46), (82, 32)), fill=(0, 0, 0, 0))
    ellipse(d, 16, 80, 50, 114, STEEL)
    return done(im)


def cart():
    im, d = canvas()
    line(d, [(10, 22), (28, 22), (42, 82), (104, 82)], OUTLINE, 8)
    poly(d, [(30, 32), (116, 32), (106, 70), (40, 70)], GOLD)
    ellipse(d, 40, 90, 60, 110, DARK)
    ellipse(d, 86, 90, 106, 110, DARK)
    return done(im)


def coin():
    im, d = canvas()
    ellipse(d, 14, 14, 114, 114, GOLD)
    ellipse(d, 30, 30, 98, 98, (255, 220, 90, 255), 3)
    d.text((0, 0), '')
    line(d, [(64, 42), (64, 86)], (190, 140, 20, 255), 10)
    return done(im)


def star(fill=GOLD):
    im, d = canvas()
    pts = []
    for i in range(10):
        r = 54 if i % 2 == 0 else 23
        a = math.radians(-90 + i * 36)
        pts.append((64 + r * math.cos(a), 68 + r * math.sin(a)))
    poly(d, pts, fill)
    return done(im)


def gear():
    im, d = canvas()
    for i in range(8):
        a = math.radians(i * 45)
        cx, cy = 64 + 44 * math.cos(a), 64 + 44 * math.sin(a)
        rect(d, cx - 10, cy - 10, cx + 10, cy + 10, STEEL, 2, 3)
    ellipse(d, 22, 22, 106, 106, STEEL)
    ellipse(d, 48, 48, 80, 80, (40, 44, 52, 255))
    return done(im)


def speaker():
    im, d = canvas()
    poly(d, [(16, 48), (40, 48), (70, 20), (70, 108), (40, 80), (16, 80)], (235, 235, 240, 255))
    d.arc([60 * S, 34 * S, 100 * S, 94 * S], -50, 50, fill=(235, 235, 240, 255), width=8 * S)
    d.arc([66 * S, 18 * S, 124 * S, 110 * S], -50, 50, fill=(235, 235, 240, 255), width=8 * S)
    return done(im)


def close():
    im, d = canvas()
    ellipse(d, 10, 10, 118, 118, RED)
    line(d, [(42, 42), (86, 86)], (255, 255, 255, 255), 14)
    line(d, [(86, 42), (42, 86)], (255, 255, 255, 255), 14)
    return done(im)


def arrow():
    im, d = canvas()
    poly(d, [(14, 48), (70, 48), (70, 20), (116, 64), (70, 108), (70, 80), (14, 80)], (60, 200, 255, 255))
    return done(im)


def brick():
    im, d = canvas()
    rect(d, 12, 40, 116, 112, RED, 4)
    for x in (30, 64, 98):
        ellipse(d, x - 12, 24, x + 12, 46, RED)
    return done(im)


def palette():
    im, d = canvas()
    ellipse(d, 10, 18, 118, 112, (235, 210, 170, 255))
    for (x, y), c in zip([(38, 44), (62, 34), (88, 44), (36, 72)], [RED, BLUE, GREEN, GOLD]):
        ellipse(d, x - 10, y - 10, x + 10, y + 10, c, 3)
    d.ellipse([72 * S, 70 * S, 94 * S, 92 * S], fill=(0, 0, 0, 0))
    return done(im)


def person():
    im, d = canvas()
    rect(d, 44, 12, 84, 50, (250, 210, 80, 255), 8)
    rect(d, 34, 54, 94, 96, BLUE, 6)
    rect(d, 36, 96, 62, 120, GREEN, 3)
    rect(d, 66, 96, 92, 120, GREEN, 3)
    return done(im)


def play():
    im, d = canvas()
    ellipse(d, 8, 8, 120, 120, GREEN)
    poly(d, [(50, 36), (92, 64), (50, 92)], (255, 255, 255, 255))
    return done(im)


def lock():
    im, d = canvas()
    d.arc([36 * S, 12 * S, 92 * S, 76 * S], 180, 360, fill=OUTLINE, width=14 * S)
    d.arc([36 * S, 12 * S, 92 * S, 76 * S], 180, 360, fill=STEEL, width=8 * S)
    rect(d, 24, 50, 104, 116, GOLD, 8)
    ellipse(d, 56, 70, 72, 86, DARK)
    return done(im)


def check():
    im, d = canvas()
    ellipse(d, 8, 8, 120, 120, GREEN)
    line(d, [(36, 66), (56, 86), (94, 44)], (255, 255, 255, 255), 14)
    return done(im)


def panel(light=False):
    w, h = 256, 96
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    top, bot = ((250, 250, 252), (222, 226, 234)) if light else ((70, 78, 96), (36, 40, 52))
    for y in range(h * S):
        t = y / (h * S)
        c = tuple(int(top[i] * (1 - t) + bot[i] * t) for i in range(3))
        d.line([(0, y), (w * S, y)], fill=c + (255,))
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w * S - 1, h * S - 1], radius=18 * S, fill=255)
    im.putalpha(mask)
    ImageDraw.Draw(im).rounded_rectangle([2 * S, 2 * S, w * S - 3 * S, h * S - 3 * S], radius=16 * S,
                                         outline=(255, 255, 255, 110) if not light else (150, 160, 175, 255), width=3 * S)
    return im.resize((w, h), Image.LANCZOS)


def sparkle():
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    px = im.load()
    for y in range(64):
        for x in range(64):
            r = math.hypot(x - 31.5, y - 31.5) / 32
            a = max(0.0, 1 - r) ** 2
            px[x, y] = (255, 255, 255, int(255 * a))
    return im


def face(evil=False):
    im, d = canvas()
    eye = (20, 20, 20, 255)
    if evil:
        poly(d, [(30, 40), (56, 52), (54, 62), (32, 56)], (200, 20, 20, 255), 2)
        poly(d, [(98, 40), (72, 52), (74, 62), (96, 56)], (200, 20, 20, 255), 2)
        d.arc([34 * S, 76 * S, 94 * S, 116 * S], 200, 340, fill=eye, width=6 * S)
    else:
        d.ellipse([40 * S, 40 * S, 52 * S, 60 * S], fill=eye)
        d.ellipse([76 * S, 40 * S, 88 * S, 60 * S], fill=eye)
        d.arc([34 * S, 50 * S, 94 * S, 98 * S], 20, 160, fill=eye, width=6 * S)
    return done(im)


def sky(face_name):
    n = 256
    im = Image.new('RGB', (n, n))
    d = ImageDraw.Draw(im)
    if face_name == 'up':
        d.rectangle([0, 0, n, n], fill=(92, 150, 230))
    elif face_name == 'dn':
        d.rectangle([0, 0, n, n], fill=(150, 170, 190))
    else:
        for y in range(n):
            t = y / n
            top, hor = (92, 150, 230), (196, 222, 245)
            c = tuple(int(top[i] * (1 - t) + hor[i] * t) for i in range(3))
            d.line([(0, y), (n, y)], fill=c)
        # a few soft clouds, different on each side
        seed = sum(map(ord, face_name))
        cl = Image.new('RGBA', (n, n), (0, 0, 0, 0))
        cd = ImageDraw.Draw(cl)
        for i in range(5):
            x = (seed * 37 + i * 71) % n
            y = 70 + (seed * 13 + i * 29) % 90
            w = 40 + (seed + i * 17) % 50
            cd.ellipse([x - w, y - w // 3, x + w, y + w // 3], fill=(255, 255, 255, 170))
        cl = cl.filter(ImageFilter.GaussianBlur(9))
        im = Image.alpha_composite(im.convert('RGBA'), cl).convert('RGB')
    return im


def menu():
    im, d = canvas()
    for y in (32, 60, 88):
        rect(d, 20, y, 108, y + 14, (240, 240, 245, 255), 6, 3)
    return done(im)


def shield():
    im, d = canvas()
    poly(d, [(64, 10), (108, 26), (102, 78), (64, 118), (26, 78), (20, 26)], BLUE)
    poly(d, [(64, 26), (92, 36), (88, 72), (64, 98)], (120, 180, 255, 255), 2)
    return done(im)


def heart():
    im, d = canvas()
    ellipse(d, 14, 22, 66, 74, RED)
    ellipse(d, 62, 22, 114, 74, RED)
    poly(d, [(18, 56), (110, 56), (64, 112)], RED)
    d.rectangle([22 * S, 44 * S, 106 * S, 60 * S], fill=RED)
    return done(im)


def clock():
    im, d = canvas()
    ellipse(d, 10, 10, 118, 118, (245, 245, 250, 255))
    line(d, [(64, 64), (64, 30)], OUTLINE, 8)
    line(d, [(64, 64), (88, 76)], OUTLINE, 8)
    return done(im)


def letter(ch, color):
    im, d = canvas()
    ellipse(d, 8, 8, 120, 120, color)
    if ch == 'i':
        d.ellipse([56 * S, 28 * S, 72 * S, 44 * S], fill=(255, 255, 255, 255))
        rect(d, 56, 52, 72, 98, (255, 255, 255, 255), 4, 0)
    else:
        d.arc([40 * S, 24 * S, 88 * S, 70 * S], 180, 90, fill=(255, 255, 255, 255), width=12 * S)
        rect(d, 58, 66, 70, 82, (255, 255, 255, 255), 2, 0)
        d.ellipse([56 * S, 90 * S, 72 * S, 106 * S], fill=(255, 255, 255, 255))
    return done(im)


def dash():
    im, d = canvas()
    poly(d, [(72, 6), (28, 70), (58, 70), (48, 122), (100, 50), (68, 50)], GOLD)
    return done(im)


def gift():
    im, d = canvas()
    rect(d, 18, 50, 110, 118, RED, 6)
    rect(d, 12, 36, 116, 56, RED, 6)
    rect(d, 56, 36, 72, 118, GOLD, 0, 3)
    ellipse(d, 36, 14, 66, 40, GOLD)
    ellipse(d, 62, 14, 92, 40, GOLD)
    return done(im)


MAKERS = {
    'sword': sword, 'gun': gun, 'rocket': rocket, 'slingshot': slingshot, 'trowel': trowel, 'bomb': bomb,
    'ball': ball, 'coil': coil, 'skateboard': skateboard, 'trophy': trophy, 'potion': potion, 'tool': tool,
    'cart': cart, 'coin': coin, 'star': star, 'gear': gear, 'speaker': speaker, 'close': close, 'arrow': arrow,
    'brick': brick, 'palette': palette, 'person': person, 'play': play, 'lock': lock, 'check': check,
    'panel': panel, 'sparkle': sparkle, 'face': face, 'evilface': lambda: face(True),
    'sky_bk': lambda: sky('bk'), 'sky_dn': lambda: sky('dn'), 'sky_ft': lambda: sky('ft'),
    'sky_lf': lambda: sky('lf'), 'sky_rt': lambda: sky('rt'), 'sky_up': lambda: sky('up'),
    'menu': menu, 'shield': shield, 'heart': heart, 'clock': clock, 'info': lambda: letter('i', BLUE),
    'question': lambda: letter('?', (140, 90, 220, 255)), 'dash': dash, 'gift': gift, 'panel_light': lambda: panel(True),
}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for i, name in enumerate(NAMES):
        img = MAKERS[name]()
        path = os.path.join(OUT, '%d.png' % (BASE + i + 1))
        img.save(path, optimize=True)
    # a contact sheet to look at (not served)
    print('%d stand-ins in %s' % (len(NAMES), os.path.relpath(OUT)))
