#!/usr/bin/env python3
"""Build WebBlox's own games into ../places/ (original levels, generated from code):

  rainbow-obby.rbxl    Rainbow Obby: 30 stages of jumps, lava, spinners, trampolines and more
  sky-tower.rbxl       Sky Tower: climb a tower in the clouds, floor by floor
  floor-is-lava.rbxl   The Floor is Lava: get up high before the lava rises (shared rounds)
  speed-run.rbxl       Speed Run: race the clock over a course of speed pads and jumps

Each place is written as Roblox XML and converted with xml2bin.py. Behaviour comes from the
Lua in games/: obby.lua gives parts their behaviour by name (KillBrick, Checkpoint, Vanish,
Bounce, Speed, Spinner, Mover, Go, Finish); lava.lua runs The Floor is Lava's rounds; pizza.lua
runs Pizza Shift. net.lua goes above them: it lets each player's copy of the game tell the
others what happened (milestones and wins, Speed Run's server record, who survived the lava,
pizzas served).

usage: python3 build_games.py            (needs: pip install lz4)
"""
import math, os, random
import xml.etree.ElementTree as ET
from xml2bin import convert, load_typemap

HERE = os.path.dirname(os.path.abspath(__file__))
PLACES = os.path.join(HERE, '..', 'places')

MATERIAL = {'plastic': 256, 'smooth': 272, 'neon': 288, 'wood': 512, 'planks': 528, 'marble': 784, 'slate': 800,
            'concrete': 816, 'granite': 832, 'brick': 848, 'pebble': 864, 'cobblestone': 880, 'diamond': 1056,
            'foil': 1072, 'metal': 1088, 'grass': 1280, 'sand': 1296, 'fabric': 1312, 'ice': 1536}
SMOOTH, STUDS, INLET = 0, 3, 4
# bright 2016 obby colours (BrickColor numbers)
RAINBOW = [21, 106, 24, 37, 23, 1031, 1032, 119, 1009, 102, 1019, 1004]
LAVA = 1004          # Really red
KILL = 21            # Bright red


def rot(rx=0, ry=0, rz=0):
    """Rotation matrix (row-major) for CFrame.Angles(rx, ry, rz), degrees."""
    a, b, c = (math.radians(v) for v in (rx, ry, rz))
    ca, sa, cb, sb, cc, sc = math.cos(a), math.sin(a), math.cos(b), math.sin(b), math.cos(c), math.sin(c)
    rxm = [[1, 0, 0], [0, ca, -sa], [0, sa, ca]]
    rym = [[cb, 0, sb], [0, 1, 0], [-sb, 0, cb]]
    rzm = [[cc, -sc, 0], [sc, cc, 0], [0, 0, 1]]
    mul = lambda m, n: [[sum(m[i][k] * n[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    return mul(mul(rxm, rym), rzm)


class Place:
    def __init__(self, name):
        self.name = name
        self.root = ET.Element('roblox', version='4')
        self.ref = 0
        self.workspace = self.item(self.root, 'Workspace', {'Name': ('string', 'Workspace'), 'FallenPartsDestroyHeight': ('float', -200)})

    def item(self, parent, cls, props):
        self.ref += 1
        it = ET.SubElement(parent, 'Item', {'class': cls, 'referent': 'RBX%d' % self.ref})
        p = ET.SubElement(it, 'Properties')
        for name, (tag, val) in props.items():
            el = ET.SubElement(p, tag, name=name)
            if tag == 'Vector3':
                for k, v in zip('XYZ', val):
                    ET.SubElement(el, k).text = repr(float(v))
            elif tag == 'CoordinateFrame':
                pos, m = val
                for k, v in zip('XYZ', pos):
                    ET.SubElement(el, k).text = repr(float(v))
                for i in range(3):
                    for j in range(3):
                        ET.SubElement(el, 'R%d%d' % (i, j)).text = repr(float(m[i][j]))
            elif tag == 'Color3':
                for k, v in zip('RGB', val):
                    ET.SubElement(el, k).text = repr(float(v))
            elif tag == 'bool':
                el.text = 'true' if val else 'false'
            else:
                el.text = str(val)
        return it

    def model(self, name, parent=None):
        return self.item(self.workspace if parent is None else parent, 'Model', {'Name': ('string', name)})

    def part(self, pos, size, color, name='Part', parent=None, cls='Part', mat='plastic', anchored=True, collide=True,
             transparency=0.0, r=(0, 0, 0), shape=None, surface=None, velocity=None, reflectance=0.0):
        if surface is None:
            surface = STUDS if mat == 'plastic' else SMOOTH
        props = {
            'Name': ('string', name), 'Anchored': ('bool', anchored), 'CanCollide': ('bool', collide),
            'BrickColor': ('int', color), 'Material': ('token', MATERIAL[mat]), 'Transparency': ('float', transparency),
            'Reflectance': ('float', reflectance), 'CFrame': ('CoordinateFrame', (pos, rot(*r))),
            'size': ('Vector3', size), 'TopSurface': ('token', surface), 'BottomSurface': ('token', INLET if surface == STUDS else SMOOTH),
            'LeftSurface': ('token', SMOOTH), 'RightSurface': ('token', SMOOTH), 'FrontSurface': ('token', SMOOTH), 'BackSurface': ('token', SMOOTH),
        }
        if cls in ('Part', 'SpawnLocation', 'Seat'):
            props['formFactorRaw'] = ('token', 3)
            props['shape'] = ('token', {'ball': 0, 'cyl': 2}.get(shape, 1))
        if velocity:
            props['Velocity'] = ('Vector3', velocity)
        if cls == 'SpawnLocation':
            props['Neutral'] = ('bool', True)
            props['Duration'] = ('int', 0)
        return self.item(self.workspace if parent is None else parent, cls, props)

    def value(self, parent, cls, name, val):
        tag = {'IntValue': 'int', 'NumberValue': 'double', 'StringValue': 'string', 'Vector3Value': 'Vector3'}[cls]
        return self.item(parent, cls, {'Name': ('string', name), 'Value': (tag, val)})

    def lighting(self, time='14:00:00', ambient=(0.5, 0.5, 0.5), fog_end=100000, fog=(0.75, 0.75, 0.75)):
        self.item(self.root, 'Lighting', {
            'Name': ('string', 'Lighting'), 'TimeOfDay': ('string', time), 'Brightness': ('float', 1.0),
            'Ambient': ('Color3', (0.0, 0.0, 0.0)), 'OutdoorAmbient': ('Color3', ambient), 'GlobalShadows': ('bool', True),
            'Outlines': ('bool', False), 'FogEnd': ('float', fog_end), 'FogStart': ('float', 0.0), 'FogColor': ('Color3', fog),
            'ShadowColor': ('Color3', (0.7, 0.7, 0.72)), 'GeographicLatitude': ('float', 41.7)})

    def script(self, name, source):
        sss = self.item(self.root, 'ServerScriptService', {'Name': ('string', 'ServerScriptService')})
        self.item(sss, 'Script', {'Name': ('string', name), 'Source': ('ProtectedString', source)})

    def save(self):
        os.makedirs(PLACES, exist_ok=True)
        xml_path = os.path.join(HERE, '.build-%s.rbxlx' % self.name)
        ET.ElementTree(self.root).write(xml_path, encoding='utf-8', xml_declaration=False)
        blob, n, nc, stats = convert(load_typemap(), xml_path)
        os.remove(xml_path)
        out = os.path.join(PLACES, self.name + '.rbxl')
        with open(out, 'wb') as f:
            f.write(blob)
        print('%-22s %5d instances, %3d classes, %7d bytes' % (self.name + '.rbxl', n, nc, len(blob)))


def with_net(src):
    """A game's script with games/net.lua above it (NET: messages and shared values between players' games)."""
    return open(os.path.join(HERE, 'games', 'net.lua')).read() + '\n' + src


def kit(game_table):
    src = open(os.path.join(HERE, 'games', 'obby.lua')).read()
    return with_net('GAME = ' + game_table + '\n' + src)


def checkpoint(pl, parent, pos, n, color, size=(10, 1, 10)):
    cls = 'SpawnLocation' if n == 1 else 'Part'
    cp = pl.part(pos, size, color, 'Checkpoint', parent, cls=cls)
    pl.value(cp, 'IntValue', 'Stage', n)
    return cp


def kill(pl, parent, pos, size, r=(0, 0, 0)):
    return pl.part(pos, size, KILL, 'KillBrick', parent, mat='neon', r=r)


# ------------------------------------------------------------------------------------------
# Rainbow Obby: stages along +X, each starting on a checkpoint pad.
def rainbow_obby(file='rainbow-obby', title='the Rainbow Obby', palette=RAINBOW, seed=7, count=30, mat=None,
                 light=None, ground=37, order=None, stat='Stage'):
    """An obby along +X (also used, with other colors, materials and orders, for the themed obbies)."""
    pl = Place(file)
    pl.lighting(**(light or {'ambient': (0.55, 0.55, 0.6)}))
    rng = random.Random(seed)
    base_part = pl.part

    def part(pos, size, color, name='Part', parent=None, **k):
        if mat and 'mat' not in k and name not in ('KillBrick', 'Vanish', 'Truss', 'Hub'):
            k['mat'] = mat
        return base_part(pos, size, color, name, parent, **k)
    pl.part = part
    # start island
    start = pl.model('Start')
    pl.part((-30, -1, 0), (50, 2, 50), ground, 'Ground', start, mat='grass')
    x, y = 0.0, 0.0
    color = lambda i: palette[i % len(palette)]

    def stage_steps(m, c):            # stepping stones
        nonlocal x, y
        for i in range(5):
            x += 8
            y += 0.6
            pl.part((x, y, rng.uniform(-3, 3)), (4, 1, 4), c, 'Step', m)
        x += 4

    def stage_lava_run(m, c):         # a floor of lava with safe tiles
        nonlocal x
        pl.part((x + 22, y - 0.4, 0), (36, 1, 10), LAVA, 'KillBrick', m, mat='neon', surface=SMOOTH)
        for i in range(5):
            pl.part((x + 8 + i * 7, y + 0.2, rng.choice([-3, 0, 3])), (3, 1, 3), c, 'Tile', m)
        x += 44

    def stage_truss(m, c):            # climb a truss up a wall
        nonlocal x, y
        pl.part((x + 3, y, 0), (6, 1, 12), c, 'Floor', m)
        pl.part((x + 9, y + 5, 0), (6, 12, 12), c, 'Wall', m)
        pl.part((x + 5.5, y + 6, 0), (2, 14, 2), 194, 'Truss', m, cls='TrussPart', mat='metal')
        pl.part((x + 9, y + 11.5, 0), (6, 1, 12), c, 'Top', m)
        y += 11
        x += 12

    def stage_spinner(m, c):          # a spinning bar to jump over
        nonlocal x
        pl.part((x + 18, y, 0), (30, 1, 14), c, 'Floor', m)
        pl.part((x + 18, y + 1.5, 0), (2, 2, 2), 194, 'Hub', m, mat='metal', shape='cyl', r=(0, 0, 90))
        sp = pl.part((x + 18, y + 2.6, 0), (26, 1, 1.2), KILL, 'Spinner', m, mat='neon', surface=SMOOTH)
        pl.value(sp, 'NumberValue', 'Speed', 0.25)
        x += 34

    def stage_vanish(m, c):           # tiles that disappear under you
        nonlocal x
        for i in range(6):
            x += 6
            pl.part((x, y, 0), (4.5, 1, 6), 44, 'Vanish', m, mat='smooth', transparency=0.15)
        x += 4

    def stage_beam(m, c):             # a long tightrope
        nonlocal x
        pl.part((x + 16, y, 0), (28, 1, 1.2), c, 'Beam', m)
        x += 32

    def stage_bounce(m, c):           # trampoline up to a high ledge
        nonlocal x, y
        pl.part((x + 8, y, 0), (6, 1, 6), c, 'Floor', m)
        b = pl.part((x + 8, y + 0.7, 0), (4, 0.4, 4), 1009, 'Bounce', m, mat='neon', surface=SMOOTH)
        pl.value(b, 'NumberValue', 'Power', 88)
        pl.part((x + 17, y + 14, 0), (8, 1, 10), c, 'Ledge', m)
        y += 14
        x += 22

    def stage_zigzag(m, c):           # zigzag platforms
        nonlocal x, y
        for i in range(6):
            x += 6
            y += 0.8
            pl.part((x, y, 3 if i % 2 else -3), (3, 1, 3), c, 'Zig', m)
        x += 4

    def stage_conveyor(m, c):         # a belt that pushes you back
        nonlocal x
        pl.part((x + 16, y, 0), (28, 1, 8), 26, 'Conveyor', m, mat='diamond', velocity=(-9, 0, 0))
        x += 32

    def stage_mover(m, c):            # ride moving platforms across a gap
        nonlocal x
        for i in range(2):
            mv = pl.part((x + 7 + i * 10, y, -6), (6, 1, 6), c, 'Mover', m, mat='smooth')
            pl.value(mv, 'Vector3Value', 'Offset', (0, 0, 12))
            pl.value(mv, 'NumberValue', 'Period', 3.0 + i * 0.6)
        x += 23

    def stage_speed(m, c):            # speed pad, then a long jump
        nonlocal x
        pl.part((x + 10, y, 0), (16, 1, 8), c, 'Runway', m)
        pl.part((x + 6, y + 0.55, 0), (4, 0.1, 6), 1009, 'Speed', m, mat='neon', surface=SMOOTH)
        x += 18 + 11
        pl.part((x + 4, y, 0), (8, 1, 8), c, 'Landing', m)
        x += 8

    def stage_pillars(m, c):          # dodge the lava pillars
        nonlocal x
        pl.part((x + 18, y, 0), (32, 1, 16), c, 'Floor', m)
        for i in range(5):
            kill(pl, m, (x + 6 + i * 6, y + 3.5, (-4, 3, -2, 4, 0)[i]), (2, 6, 2))
        x += 36

    def stage_balls(m, c):            # round, slippery hops
        nonlocal x, y
        for i in range(5):
            x += 7
            pl.part((x, y - 1, 0), (4, 4, 4), c, 'Ball', m, shape='ball', mat='smooth')
        y += 1
        x += 4

    def stage_stairs(m, c):           # floating stairs going up
        nonlocal x, y
        for i in range(8):
            x += 4.5
            y += 2
            pl.part((x, y, 0), (3, 1, 6), c, 'Stair', m)
        x += 2

    stages = [stage_steps, stage_beam, stage_lava_run, stage_zigzag, stage_truss, stage_vanish, stage_spinner,
              stage_bounce, stage_balls, stage_conveyor, stage_stairs, stage_mover, stage_speed, stage_pillars]
    order = order or [0, 1, 3, 2, 10, 5, 6, 4, 8, 9, 7, 11, 12, 13, 0, 5, 6, 2, 1, 9, 3, 4, 11, 8, 13, 12, 10, 7, 6]
    for i in range(count):
        m = pl.model('Stage%d' % (i + 1))
        checkpoint(pl, m, (x + 5, y, 0), i + 1, color(i))
        x += 10
        if i < len(order):
            stages[order[i]](m, color(i + 1))
    # the end
    end = pl.model('End')
    pl.part((x + 12, y, 0), (24, 1, 24), 24, 'Podium', end, mat='marble', surface=SMOOTH)
    fin = pl.part((x + 12, y + 0.6, 0), (10, 0.2, 10), 24, 'Finish', end, mat='neon', surface=SMOOTH)
    pl.part((x + 12, y + 5, 0), (8, 3, 3), 24, 'Trophy', end, mat='foil', collide=False, shape='cyl', r=(0, 0, 90))
    # lava sea under the whole course (parts can't be bigger than 2048 studs)
    x0, x1 = -60, x + 40
    n = int((x1 - x0) // 1000) + 1
    for i in range(n):
        w = (x1 - x0) / n
        pl.part((x0 + w * (i + 0.5), -14, 0), (w, 2, 240), KILL, 'KillBrick', mat='smooth', surface=SMOOTH)
    pl.script('ObbyScript', kit('{ stat = "%s", winText = "You beat %s!", title = "%s" }' % (stat, title, title)))
    pl.save()


# ------------------------------------------------------------------------------------------
# Sky Tower: a pillar in the clouds; platforms spiral up around it, a checkpoint every floor.
def sky_tower():
    pl = Place('sky-tower')
    pl.lighting(ambient=(0.6, 0.6, 0.66), fog_end=1400, fog=(0.78, 0.86, 0.95))
    rng = random.Random(3)
    tower = pl.model('Tower')
    floors, per_floor, rise, radius = 10, 12, 2.0, 17
    total = floors * per_floor * rise
    pl.part((0, (total - 2) / 2, 0), (12, total + 2, 12), 1, 'Pillar', tower, mat='marble', surface=SMOOTH)
    # clouds far below: falling there resets you
    for i in range(14):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(10, 90)
        pl.part((math.cos(a) * d, -30 + rng.uniform(-3, 3), math.sin(a) * d), (rng.uniform(20, 40), 6, rng.uniform(16, 30)),
                1, 'Cloud', tower, mat='smooth', transparency=0.15, collide=False)
    pl.part((0, -36, 0), (400, 2, 400), 1, 'KillBrick', tower, mat='smooth', transparency=1, collide=True)
    pl.part((0, -1, 0), (26, 2, 26), 1, 'Base', tower, mat='marble', surface=SMOOTH)
    angle, y = -90.0, 0.0
    step = 360.0 / per_floor
    for f in range(floors):
        m = pl.model('Floor%d' % (f + 1))
        c = RAINBOW[f % len(RAINBOW)]
        a = math.radians(angle)
        checkpoint(pl, m, (math.cos(a) * radius, y, math.sin(a) * radius), f + 1, c, size=(8, 1, 8))
        for k in range(per_floor - 1):
            angle += step
            y += rise
            a = math.radians(angle)
            pos = (math.cos(a) * radius, y, math.sin(a) * radius)
            kind = (f + k) % 7 if f > 0 else 0
            size = (5 - min(f, 6) * 0.3, 1, 5 - min(f, 6) * 0.3)
            if kind == 3 and f > 1:
                pl.part(pos, size, 44, 'Vanish', m, mat='smooth', transparency=0.15)
            elif kind == 5 and f > 2:
                pl.part(pos, (1.6, 1, 1.6), c, 'Step', m, r=(0, -math.degrees(a), 0))   # a tiny one
            elif kind == 6 and f > 3:
                mv = pl.part(pos, size, c, 'Mover', m, mat='smooth')
                pl.value(mv, 'Vector3Value', 'Offset', (0, 2.2, 0))
                pl.value(mv, 'NumberValue', 'Period', 2.4)
            else:
                pl.part(pos, size, c, 'Step', m)
        angle += step
        y += rise
    m = pl.model('Top')
    a = math.radians(angle)
    pl.part((0, y + 0.5, 0), (34, 1, 34), 24, 'Roof', m, mat='marble', surface=SMOOTH)
    pl.part((math.cos(a) * radius, y + 0.3, math.sin(a) * radius), (8, 1, 8), 24, 'Landing', m)
    pl.part((0, y + 1.1, 0), (12, 0.2, 12), 24, 'Finish', m, mat='neon', surface=SMOOTH)
    pl.script('ObbyScript', kit('{ stat = "Floor", winText = "You reached the top of the Sky Tower!", title = "the Sky Tower" }'))
    pl.save()


# ------------------------------------------------------------------------------------------
# The Floor is Lava: a big room full of furniture to climb on.
def floor_is_lava():
    pl = Place('floor-is-lava')
    pl.lighting(ambient=(0.55, 0.52, 0.5))
    rng = random.Random(11)
    room = pl.model('Room')
    W, D, H = 96, 96, 34
    pl.part((0, -1, 0), (W, 2, D), 192, 'Floor', room, mat='planks', surface=SMOOTH)
    # walls with a doorway to the lobby on the -Z side
    pl.part((0, H / 2, D / 2 + 1), (W + 4, H, 2), 1001, 'Wall', room, mat='smooth', surface=SMOOTH)
    pl.part((W / 2 + 1, H / 2, 0), (2, H, D), 1001, 'Wall', room, mat='smooth', surface=SMOOTH)
    pl.part((-W / 2 - 1, H / 2, 0), (2, H, D), 1001, 'Wall', room, mat='smooth', surface=SMOOTH)
    pl.part((-(W / 4 + 5), H / 2, -D / 2 - 1), (W / 2 - 10, H, 2), 1001, 'Wall', room, mat='smooth', surface=SMOOTH)
    pl.part(((W / 4 + 5), H / 2, -D / 2 - 1), (W / 2 - 10, H, 2), 1001, 'Wall', room, mat='smooth', surface=SMOOTH)
    pl.part((0, H / 2 + 6, -D / 2 - 1), (20, H - 12, 2), 1001, 'Wall', room, mat='smooth', surface=SMOOTH)
    # lobby outside the door
    lobby = pl.model('Lobby')
    pl.part((0, -1, -D / 2 - 18), (40, 2, 32), 194, 'LobbyFloor', lobby, mat='concrete', surface=SMOOTH)
    pl.part((0, 0.5, -D / 2 - 22), (8, 1, 8), 23, 'Spawn', lobby, cls='SpawnLocation')
    # the lava (a slab whose top starts level with the floor) and the box that counts as "in the room"
    # (opaque: this renderer drops neon parts that are even slightly transparent)
    pl.part((0, -2, 0), (W, 4, D), LAVA, 'Lava', mat='neon', collide=False, surface=SMOOTH)
    pl.part((0, 12, 0), (W, 30, D), 1, 'Arena', transparency=1, collide=False, surface=SMOOTH)
    furn = pl.model('Furniture')

    def couch(x, z, c, ry=0):
        f = pl.model('Couch', furn)
        cs, sn = math.cos(math.radians(ry)), math.sin(math.radians(ry))
        at = lambda dx, dy, dz: (x + dx * cs + dz * sn, dy, z - dx * sn + dz * cs)
        pl.part(at(0, 1.5, 0), (12, 3, 5), c, 'Seat', f, mat='fabric', surface=SMOOTH, r=(0, ry, 0))
        pl.part(at(0, 4, 2.2), (12, 5, 1.2), c, 'Back', f, mat='fabric', surface=SMOOTH, r=(0, ry, 0))
        pl.part(at(-6.5, 3, 0), (1.5, 6, 5), c, 'Arm', f, mat='fabric', surface=SMOOTH, r=(0, ry, 0))
        pl.part(at(6.5, 3, 0), (1.5, 6, 5), c, 'Arm', f, mat='fabric', surface=SMOOTH, r=(0, ry, 0))

    def table_(x, z, h=4):
        f = pl.model('Table', furn)
        pl.part((x, h, z), (10, 0.6, 6), 192, 'Top', f, mat='wood', surface=SMOOTH)
        for dx in (-4.4, 4.4):
            for dz in (-2.4, 2.4):
                pl.part((x + dx, h / 2 - 0.15, z + dz), (0.6, h - 0.3, 0.6), 192, 'Leg', f, mat='wood', surface=SMOOTH)

    def shelf(x, z, levels=4, ry=0):
        f = pl.model('Shelf', furn)
        for i in range(levels):
            pl.part((x, 3.5 + i * 4, z), (10, 0.6, 4), 192, 'Shelf', f, mat='wood', surface=SMOOTH, r=(0, ry, 0))
        pl.part((x - 5.2 if ry == 0 else x, (levels * 4 + 2) / 2, z if ry == 0 else z - 5.2), (0.6 if ry == 0 else 4, levels * 4 + 2, 4 if ry == 0 else 0.6),
                192, 'Side', f, mat='wood', surface=SMOOTH)

    def boxes(x, z, n, c):
        f = pl.model('Boxes', furn)
        h = 0
        for i in range(n):
            s = 4.5 - i * 0.5
            h += s
            pl.part((x + rng.uniform(-0.4, 0.4), h - s / 2, z + rng.uniform(-0.4, 0.4)), (s, s, s), c, 'Box', f, mat='plastic', r=(0, rng.uniform(-15, 15), 0))

    def bed(x, z):
        f = pl.model('BunkBed', furn)
        for h in (3, 10):
            pl.part((x, h, z), (7, 1.4, 12), 1, 'Mattress', f, mat='fabric', surface=SMOOTH)
        for dx in (-3.6, 3.6):
            for dz in (-6, 6):
                pl.part((x + dx, 6.5, z + dz), (0.8, 13, 0.8), 192, 'Post', f, mat='wood', surface=SMOOTH)
        pl.part((x + 4.6, 7, z - 3), (2, 14, 2), 194, 'Ladder', f, cls='TrussPart', mat='metal')

    def lamp(x, z):
        f = pl.model('Lamp', furn)
        pl.part((x, 0.4, z), (0.8, 3, 3), 26, 'Base', f, mat='metal', surface=SMOOTH, shape='cyl', r=(0, 0, 90))
        pl.part((x, 7, z), (0.6, 12, 0.6), 26, 'Pole', f, mat='metal', surface=SMOOTH)
        pl.part((x, 14, z), (4, 3, 4), 24, 'Shade', f, mat='fabric', surface=SMOOTH)

    couch(-30, 36, 21)
    couch(26, 38, 23, ry=180)
    couch(-38, -10, 28, ry=90)
    table_(0, 20)
    table_(-14, -22, 3)
    shelf(40, 6, levels=4)
    shelf(-20, 44, levels=3, ry=90)
    bed(36, -28)
    bed(-38, 18)
    lamp(20, -10)
    lamp(-6, 40)
    boxes(10, -34, 4, 1019)
    boxes(-28, -36, 3, 1031)
    boxes(4, 36, 5, 24)
    boxes(28, 22, 3, 37)
    # a climbing tower in the middle: stairs around a column up to a lookout at 20 studs
    tw = pl.model('ClimbingTower', furn)
    pl.part((0, 10, 0), (6, 20, 6), 1031, 'Column', tw, surface=SMOOTH)
    for i in range(10):
        a = math.radians(i * 72)
        pl.part((math.cos(a) * 6, 2 + i * 2, math.sin(a) * 6), (4, 1, 4), RAINBOW[i % 12], 'Step', tw)
    pl.part((0, 20.5, 0), (12, 1, 12), 24, 'Lookout', tw)
    pl.script('LavaScript', with_net(open(os.path.join(HERE, 'games', 'lava.lua')).read()))
    pl.save()


# ------------------------------------------------------------------------------------------
# Speed Run: a timed course; the clock starts at the Go line.
def speed_run():
    pl = Place('speed-run')
    pl.lighting(ambient=(0.55, 0.55, 0.6))
    rng = random.Random(5)
    pl.part((200, -16, 60), (700, 2, 500), 23, 'KillBrick', mat='smooth', transparency=0.2, surface=SMOOTH)   # water
    st = pl.model('Start')
    pl.part((0, -1, 0), (24, 2, 24), 194, 'StartPad', st, mat='concrete', surface=SMOOTH)
    pl.part((-6, 0.5, 0), (6, 1, 6), 23, 'Spawn', st, cls='SpawnLocation')
    pl.part((10, 0.05, 0), (1, 0.1, 24), 1009, 'Go', st, mat='neon', collide=False, surface=SMOOTH)
    course = pl.model('Course')
    x, y, z = 12.0, 0.0, 0.0
    segs = ['run', 'speed', 'gap', 'turn', 'bounce', 'steps', 'speed', 'zig', 'run', 'beam', 'speed', 'gap', 'steps', 'bounce', 'run']
    heading = 0
    for i, s in enumerate(segs):
        c = RAINBOW[i % 12]
        if s == 'run':
            pl.part((x + 15, y - 0.5, z), (30, 1, 10), c, 'Track', course)
            x += 30
        elif s == 'speed':
            pl.part((x + 10, y - 0.5, z), (20, 1, 10), c, 'Track', course)
            pl.part((x + 4, y + 0.05, z), (4, 0.1, 8), 1009, 'Speed', course, mat='neon', surface=SMOOTH)
            x += 20
        elif s == 'gap':
            x += 10
            pl.part((x + 6, y - 0.5, z), (12, 1, 10), c, 'Track', course)
            x += 12
        elif s == 'turn':
            pl.part((x + 5, y - 0.5, z + 10), (10, 1, 30), c, 'Track', course)
            z += 20
            x += 10
        elif s == 'bounce':
            pl.part((x + 4, y - 0.5, z), (8, 1, 10), c, 'Track', course)
            b = pl.part((x + 5, y + 0.1, z), (4, 0.4, 6), 1009, 'Bounce', course, mat='neon', surface=SMOOTH)
            pl.value(b, 'NumberValue', 'Power', 95)
            y += 9
            x += 16
            pl.part((x + 6, y - 0.5, z), (12, 1, 10), c, 'Track', course)
            x += 12
        elif s == 'steps':
            for k in range(4):
                x += 7
                pl.part((x, y - 0.5, z + rng.uniform(-2, 2)), (4, 1, 4), c, 'Step', course)
            x += 3
        elif s == 'zig':
            for k in range(5):
                x += 6
                pl.part((x, y - 0.5, z + (4 if k % 2 else -4)), (3.5, 1, 3.5), c, 'Zig', course)
            x += 3
        elif s == 'beam':
            pl.part((x + 12, y - 0.5, z), (24, 1, 1.5), c, 'Beam', course)
            x += 24
    fin = pl.model('Finish')
    pl.part((x + 10, y - 0.5, z), (20, 1, 20), 24, 'FinishPad', fin, mat='marble', surface=SMOOTH)
    pl.part((x + 10, y + 0.1, z), (12, 0.2, 12), 24, 'Finish', fin, mat='neon', surface=SMOOTH)
    for dz in (-7, 7):
        pl.part((x + 4, y + 5, z + dz), (1, 10, 1), 26, 'Flag', fin, mat='metal', surface=SMOOTH)
    pl.part((x + 4, y + 10.5, z), (1, 1, 15), 26, 'Banner', fin, mat='metal', surface=SMOOTH)
    pl.script('SpeedRunScript', kit('{ timer = true }'))
    pl.save()


# ------------------------------------------------------------------------------------------
# Pizza Shift: a restaurant to run. Stations live in the Kitchen model (games/pizza.lua).
def pizza_shift():
    pl = Place('pizza-shift')
    pl.lighting(ambient=(0.58, 0.56, 0.54))
    pl.part((0, -1, 0), (400, 2, 400), 37, 'Grass', mat='grass', surface=SMOOTH)
    pl.part((0, 0.05, -52), (400, 0.1, 24), 199, 'Road', mat='concrete', surface=SMOOTH)
    pl.part((0, 0.1, -37), (400, 0.2, 6), 194, 'Sidewalk', mat='concrete', surface=SMOOTH)
    k = pl.model('Kitchen')
    b = pl.model('Building')
    H = 16
    # floor: checkered dining room, grey kitchen
    for i in range(8):
        for j in range(4):
            pl.part((-28 + i * 8, 0.1, -28 + j * 7), (8, 0.2, 7), 1 if (i + j) % 2 else 26, 'Tile', b, mat='smooth', surface=SMOOTH)
    pl.part((0, 0.1, 14), (64, 0.2, 36), 194, 'KitchenFloor', b, mat='concrete', surface=SMOOTH)
    # walls (door in the front, windows either side of it)
    wall = lambda pos, size: pl.part(pos, size, 21, 'Wall', b, mat='brick', surface=SMOOTH)
    wall((0, H / 2, 32.5), (66, H, 1))
    wall((-32.5, H / 2, 0), (1, H, 64))
    wall((32.5, H / 2, 0), (1, H, 64))
    wall((-28, H / 2, -32.5), (10, H, 1))
    wall((28, H / 2, -32.5), (10, H, 1))
    wall((-14.5, 1.5, -32.5), (17, 3, 1))
    wall((14.5, 1.5, -32.5), (17, 3, 1))
    wall((-14.5, 13.5, -32.5), (17, 5, 1))
    wall((14.5, 13.5, -32.5), (17, 5, 1))
    wall((0, 13, -32.5), (12, 6, 1))
    for x in (-14.5, 14.5):
        pl.part((x, 7, -32.5), (17, 8, 0.4), 1, 'Window', b, mat='smooth', transparency=0.55, surface=SMOOTH)
    pl.part((0, H + 0.5, 0), (66, 1, 66), 194, 'Roof', b, mat='concrete', surface=SMOOTH)
    pl.part((0, H - 0.6, 0), (64, 0.2, 64), 1001, 'Ceiling', b, mat='smooth', surface=SMOOTH)
    pl.part((0, H + 3.5, -33.3), (30, 5, 0.6), 24, 'Sign', k, mat='smooth', surface=SMOOTH)
    pl.part((0, 0.2, -38), (6, 0.2, 2), 194, 'Exit', k, mat='concrete', transparency=1, collide=False, r=(0, 180, 0), surface=SMOOTH)
    # counter and register
    pl.part((-8, 2, -6), (40, 4, 3), 192, 'Counter', b, mat='wood', surface=SMOOTH)
    pl.part((-8, 4.15, -6), (41, 0.3, 3.6), 1, 'CounterTop', b, mat='marble', surface=SMOOTH)
    pl.part((-18, 4.9, -6), (2.2, 1.2, 1.6), 26, 'Register', k, mat='metal', surface=SMOOTH)
    pl.part((-18, 5.9, -6.2), (1.8, 0.9, 0.2), 23, 'Screen', k, mat='neon', surface=SMOOTH, r=(-15, 0, 0))
    pl.part((-18, 0.2, -11), (4, 0.2, 4), 24, 'CustomerSpot', k, mat='smooth', transparency=1, collide=False, r=(0, 180, 0), surface=SMOOTH)
    # kitchen stations along the back wall
    pl.part((-22, 1.75, 27), (7, 3.5, 4), 192, 'Dough', k, mat='wood', surface=SMOOTH)
    for dx in (-2, 0, 2):
        pl.part((-22 + dx, 3.9, 27), (1.4, 1.4, 1.4), 1001, 'DoughBall', k, shape='ball', surface=SMOOTH)
    pl.part((-8, 1.75, 27), (14, 3.5, 4), 194, 'ToppingTable', k, mat='metal', surface=SMOOTH)
    for name, color, x in (('Cheese', 24, -13), ('Pepperoni', 21, -9.7), ('Veggie', 37, -6.3), ('Mushroom', 192, -3)):
        pl.part((x, 3.95, 27), (0.8, 2.4, 2.4), color, 'Topping_' + name, k, shape='cyl', r=(0, 0, 90), surface=SMOOTH)
    pl.part((8, 4, 28), (10, 8, 6), 199, 'Oven', k, mat='metal', surface=SMOOTH)
    pl.part((8, 3.5, 24.9), (6.5, 3, 0.2), 26, 'OvenGlow', k, mat='smooth', surface=SMOOTH)
    pl.part((8, 8.6, 28), (4, 1.2, 4), 1004, 'OvenTop', k, mat='brick', surface=SMOOTH)
    pl.part((22, 1.75, 27), (8, 3.5, 4), 192, 'Box', k, mat='wood', surface=SMOOTH)
    for i in range(4):
        pl.part((22, 3.85 + i * 0.6, 27), (2.8, 0.6, 2.8), 1001, 'BoxStack', k, mat='smooth', surface=SMOOTH)
    pl.part((27, 1.6, 12), (3.2, 2.6, 2.6), 199, 'Trash', k, mat='metal', shape='cyl', r=(0, 0, 90), surface=SMOOTH)
    pl.part((-8, 10, 31.6), (14, 4, 0.4), 26, 'OrderBoard', k, mat='smooth', surface=SMOOTH)
    # dining tables and chairs
    for (x, z) in ((14, -24), (26, -24), (14, -14), (26, -14), (-26, -26)):
        pl.part((x, 3, z), (0.4, 5, 5), 1001, 'Table', b, shape='cyl', r=(0, 0, 90), surface=SMOOTH)
        pl.part((x, 1.4, z), (2.8, 0.8, 0.8), 199, 'TableLeg', b, mat='metal', shape='cyl', r=(0, 0, 90), surface=SMOOTH)
        for dx in (-3.6, 3.6):
            pl.part((x + dx, 1.3, z), (2, 0.5, 2), 21, 'Chair', b, cls='Seat', mat='smooth', surface=SMOOTH)
    pl.part((24, 0.3, 4), (6, 0.2, 6), 23, 'Spawn', cls='SpawnLocation', mat='smooth', surface=SMOOTH)
    pl.script('PizzaScript', with_net(open(os.path.join(HERE, 'games', 'pizza.lua')).read()))
    pl.save()


def game_script(*names):
    """games/net.lua + common.lua + the named files (e.g. 'npc', 'zombies'), in that order."""
    parts = [open(os.path.join(HERE, 'games', n + '.lua')).read() for n in ('common',) + names]
    return with_net('\n'.join(parts))


def walls(pl, parent, x0, x1, z0, z1, h, color, mat='brick', gaps=(), y0=0, t=2):
    """A walled rectangle; gaps: (side, center, width) with side in 'n','s','e','w' (n = +z)."""
    def run(side, a0, a1, fixed):
        cuts = sorted([(c - w / 2, c + w / 2) for sd, c, w in gaps if sd == side])
        segs, a = [], a0
        for c0, c1 in cuts:
            segs.append((a, c0)); a = c1
        segs.append((a, a1))
        for b0, b1 in segs:
            if b1 - b0 < 0.1:
                continue
            mid, ln = (b0 + b1) / 2, b1 - b0
            if side in 'ns':
                pl.part((mid, y0 + h / 2, fixed), (ln, h, t), color, 'Wall', parent, mat=mat, surface=SMOOTH)
            else:
                pl.part((fixed, y0 + h / 2, mid), (t, h, ln), color, 'Wall', parent, mat=mat, surface=SMOOTH)
    run('n', x0, x1, z1); run('s', x0, x1, z0); run('e', z0, z1, x1); run('w', z0, z1, x0)


# ------------------------------------------------------------------------------------------
# Undead Nights: a small walled town at dusk; zombies come in through the gates.
def undead_nights():
    pl = Place('undead-nights')
    pl.lighting(time='18:20:00', ambient=(0.42, 0.36, 0.4), fog_end=500, fog=(0.35, 0.3, 0.35))
    rng = random.Random(21)
    town = pl.model('Town')
    pl.part((0, -1, 0), (260, 2, 260), 28, 'Ground', town, mat='grass', surface=SMOOTH)
    pl.part((0, 0.05, 0), (40, 0.2, 40), 1002, 'Square', town, mat='cobblestone', surface=SMOOTH)
    for ax in (0, 90):
        pl.part((0, 0.05, 0), (200, 0.15, 10), 194, 'Road', town, mat='concrete', surface=SMOOTH, r=(0, ax, 0))
    walls(pl, town, -100, 100, -100, 100, 12, 1002, mat='cobblestone', gaps=[('n', 0, 14), ('s', 0, 14), ('e', 0, 14), ('w', 0, 14)])
    for (x, z) in ((0, 112), (0, -112), (112, 0), (-112, 0)):
        pl.part((x, 1, z), (4, 2, 4), 26, 'ZombieSpawn', town, transparency=1, collide=False)
    # houses
    for (x, z) in ((-50, -50), (50, -50), (-50, 50), (50, 50), (-55, 0), (55, 0), (0, 55), (0, -55)):
        c = rng.choice([1001, 5, 18, 125, 1030, 101])
        w, d = rng.choice([(20, 16), (16, 20), (18, 18)])
        h = pl.model('House')
        pl.part((x, 6, z), (w, 12, d), c, 'Walls', h, mat='brick', surface=SMOOTH)
        pl.part((x, 12.6, z), (w + 2, 1.2, d + 2), 192, 'Roof', h, mat='wood', surface=SMOOTH)
        pl.part((x, 3.5, z - d / 2 - 0.1), (4, 7, 0.4), 192, 'Door', h, mat='wood', surface=SMOOTH)
    # barricades and crates to fight from
    for i in range(14):
        x, z = rng.uniform(-80, 80), rng.uniform(-80, 80)
        if abs(x) < 22 and abs(z) < 22:
            continue
        pl.part((x, 1.5, z), (rng.choice([6, 8, 10]), 3, 2), 192, 'Barricade', town, mat='planks', r=(0, rng.uniform(0, 180), 0), surface=SMOOTH)
    for (x, z) in ((10, 10), (-12, 8), (8, -12)):
        pl.part((x, 2, z), (4, 4, 4), 192, 'Crate', town, mat='planks', surface=SMOOTH)
    # a watchtower in the square
    pl.part((-14, 6, -14), (6, 12, 6), 192, 'Tower', town, mat='wood', surface=SMOOTH)
    pl.part((-14, 12.5, -14), (10, 1, 10), 192, 'TowerTop', town, mat='planks', surface=SMOOTH)
    pl.part((-10.6, 6, -14), (1, 12, 3), 194, 'Truss', town, cls='TrussPart', mat='metal')
    for (x, z) in ((-30, 20), (30, -20), (20, 30), (-20, -30)):
        pl.part((x, 6, z), (0.6, 12, 0.6), 26, 'LampPost', town, mat='metal', shape='cyl', r=(0, 0, 90), surface=SMOOTH)
        pl.part((x, 12.4, z), (1.6, 1.6, 1.6), 24, 'Lamp', town, mat='neon', shape='ball', surface=SMOOTH)
    pl.part((0, 0.3, 0), (8, 0.4, 8), 1002, 'Spawn', cls='SpawnLocation', mat='smooth', surface=SMOOTH)
    pl.script('ZombieScript', game_script('npc', 'zombies'))
    pl.save()


# ------------------------------------------------------------------------------------------
# Brick Battle Peaks: four colored castle towers on a floating island, bridges between them.
def brick_battle_peaks():
    pl = Place('brick-battle-peaks')
    pl.lighting(ambient=(0.55, 0.55, 0.62), fog_end=1500, fog=(0.7, 0.8, 0.95))
    isle = pl.model('Island')
    pl.part((0, -2, 0), (180, 4, 180), 37, 'Ground', isle, mat='grass', surface=SMOOTH)
    pl.part((0, -10, 0), (150, 12, 150), 1030, 'Rock', isle, mat='slate', surface=SMOOTH)
    pl.part((0, -200, 0), (2000, 2, 2000), KILL, 'KillBrick', mat='smooth', transparency=1)
    for (name, color, x, z) in (('Red', 21, -55, -55), ('Blue', 23, 55, -55), ('Green', 37, -55, 55), ('Yellow', 24, 55, 55)):
        t = pl.model('Tower_' + name)
        pl.value(t, 'IntValue', 'Color', color)
        H = 46
        pl.part((x, H / 2, z), (22, H, 22), color, 'Keep', t, surface=SMOOTH)
        pl.part((x, H + 0.5, z), (28, 1, 28), color, 'Top', t)
        for dx, dz in ((-13, 0), (13, 0), (0, -13), (0, 13)):
            w = (2, 3, 28) if dx else (28, 3, 2)
            pl.part((x + dx, H + 2.5, z + dz), w, color, 'Battlement', t)
        # stairs spiralling up the outside
        for i in range(23):
            a = math.radians(i * 32)
            pl.part((x + math.cos(a) * 14.5, 1 + i * 2, z + math.sin(a) * 14.5), (6, 1, 6), color, 'Stair', t, r=(0, -i * 32, 0))
        pl.part((x, H + 1.2, z), (6, 0.4, 6), color, 'Spawn', t, cls='SpawnLocation', mat='smooth', surface=SMOOTH)
        pl.part((x + (12 if x < 0 else -12), 1, z), (3, 2, 3), color, 'BotSpawn', t, transparency=1, collide=False)
    # cover in the middle
    mid = pl.model('Middle')
    pl.part((0, 3, 0), (14, 6, 14), 1002, 'Rocks', mid, mat='slate', surface=SMOOTH)
    for (x, z) in ((-25, 0), (25, 0), (0, -25), (0, 25)):
        pl.part((x, 2, z), (8, 4, 2), 192, 'Wall', mid, mat='planks', r=(0, 45 if x else -45, 0), surface=SMOOTH)
    pl.script('BattleScript', game_script('npc', 'towers'))
    pl.save()


# ------------------------------------------------------------------------------------------
# Sword Clash Arena: a round stone ring over lava, challengers come in through a gate.
def sword_clash_arena():
    pl = Place('sword-clash-arena')
    pl.lighting(time='20:00:00', ambient=(0.5, 0.4, 0.38), fog_end=600, fog=(0.3, 0.12, 0.08))
    a = pl.model('Arena')
    pl.part((0, -6, 0), (400, 2, 400), LAVA, 'Lava', a, mat='neon', surface=SMOOTH)
    pl.part((0, -1, 0), (2, 70, 70), 1002, 'Ring', a, mat='cobblestone', shape='cyl', r=(0, 0, 90), surface=SMOOTH)
    pl.part((0, 0.05, 0), (0.2, 20, 20), 21, 'Center', a, mat='smooth', shape='cyl', r=(0, 0, 90), surface=SMOOTH)
    for i in range(16):
        ang = math.radians(i * 22.5)
        pl.part((math.cos(ang) * 37, 6, math.sin(ang) * 37), (3, 14, 3), 1002, 'Pillar', a, mat='marble', surface=SMOOTH)
        pl.part((math.cos(ang) * 37, 13.6, math.sin(ang) * 37), (2.4, 2.4, 2.4), 1004, 'Torch', a, mat='neon', shape='ball', surface=SMOOTH)
    pl.part((0, 0.5, -30), (8, 1, 6), 26, 'Gate', a, mat='metal', surface=SMOOTH)
    pl.part((0, 0.5, 28), (8, 0.4, 8), 23, 'Spawn', cls='SpawnLocation', mat='smooth', surface=SMOOTH)
    pl.script('ArenaScript', game_script('npc', 'arena'))
    pl.save()


# ------------------------------------------------------------------------------------------
# Cellblock Breakout: cells, a tunnel, the guard room, the yard and the wall.
def cellblock_breakout():
    pl = Place('cellblock-breakout')
    pl.lighting(ambient=(0.5, 0.5, 0.52))
    m = pl.model('Prison')
    pl.part((20, -1, -20), (240, 2, 240), 37, 'Ground', m, mat='grass', surface=SMOOTH)
    # cell block: x -40..40, z -20..20; cells along the north side (z 10..20)
    pl.part((0, 0.05, 0), (80, 0.2, 40), 1002, 'Floor', m, mat='concrete', surface=SMOOTH)
    walls(pl, m, -40, 40, -20, 20, 12, 1001, mat='concrete', gaps=[('n', -6, 5)])
    for i in range(6):
        cx = -30 + i * 12
        pl.part((cx - 6, 6, 15), (1, 12, 10), 1001, 'CellWall', m, mat='concrete', surface=SMOOTH)
        for b in range(9):
            pl.part((cx - 4.5 + b * 1.1, 6, 10), (0.3, 12, 0.3), 199, 'Bars', m, mat='metal', surface=SMOOTH)
        pl.part((cx, 6, 10), (12, 0.5, 0.5), 199, 'BarTop', m, mat='metal', surface=SMOOTH)
        pl.part((cx + 3.5, 1, 17), (4, 2, 6), 21 if i != 2 else 106, 'Bed', m, mat='fabric', surface=SMOOTH)
    pl.part((36 - 6, 6, 15), (1, 12, 10), 1001, 'CellWall', m, mat='concrete', surface=SMOOTH)
    # my cell is the third one (x -12..0... centred at -6)
    cx = -30 + 2 * 12
    pl.part((cx - 2, 0.3, 14), (4, 0.4, 4), 106, 'CellSpawn', m, cls='SpawnLocation', mat='smooth', surface=SMOOTH)
    pl.part((cx + 3.5, 2.3, 18), (0.4, 0.4, 1.6), 199, 'Spoon', m, mat='metal', collide=False)
    pl.part((cx, 3.5, 20), (5, 7, 2.4), 1001, 'LooseWall', m, mat='concrete', surface=SMOOTH)
    pl.part((cx + 1, 4, 18.9), (1.5, 2.5, 0.1), 26, 'Crack', m, mat='smooth', collide=False, surface=SMOOTH)
    # tunnel behind the cells: z 21..27, from the loose wall east to the guard room
    pl.part((cx + 24, 0.05, 24), (52, 0.2, 6), 192, 'TunnelFloor', m, mat='slate', surface=SMOOTH)
    pl.part((cx + 24, 5, 27.5), (52, 10, 1), 1030, 'TunnelWall', m, mat='slate', surface=SMOOTH)
    pl.part((cx + 24, 10.5, 24), (52, 1, 8), 1030, 'TunnelRoof', m, mat='slate', surface=SMOOTH)
    pl.part((43, 5, 20.5), (6, 10, 1), 1030, 'TunnelWall', m, mat='slate', surface=SMOOTH)
    pl.part((cx - 2.5, 5, 24), (1, 10, 6), 1030, 'TunnelEnd', m, mat='slate', surface=SMOOTH)
    # guard room: x 46..76, z -10..27
    walls(pl, m, 46, 76, -10, 27, 12, 23, mat='concrete', gaps=[('w', 24, 6), ('s', 61, 6)])
    pl.part((61, 0.05, 8.5), (30, 0.2, 37), 194, 'GuardFloor', m, mat='concrete', surface=SMOOTH)
    pl.part((70, 1.75, 0), (6, 3.5, 3), 192, 'Desk', m, mat='wood', surface=SMOOTH)
    pl.part((70, 3.6, 0), (1, 0.15, 0.7), 24, 'Keycard', m, mat='neon', collide=False)
    for (x, z) in ((52, 20), (68, 20)):
        pl.part((x, 3, z), (3, 6, 6), 199, 'Locker', m, mat='metal', surface=SMOOTH)
    pl.part((61, 5, -10), (6, 10, 1), 1004, 'SecurityDoor', m, mat='metal', surface=SMOOTH)
    for i, (x, z) in enumerate(((52, 15), (70, 15), (70, -5), (52, -5))):
        pl.part((x, 1, z), (1, 1, 1), 23, 'GuardPostA%d' % (i + 1), m, transparency=1, collide=False)
    # corridor patrol inside the cell block
    for i, (x, z) in enumerate(((-34, 0), (34, 0))):
        pl.part((x, 1, z), (1, 1, 1), 23, 'GuardPostC%d' % (i + 1), m, transparency=1, collide=False)
    pl.part((0, 1, -2), (1, 1, 1), 23, 'CorridorMark', m, transparency=1, collide=False)
    # yard: x 30..96, z -70..-10 with the outer wall at z -70
    walls(pl, m, 30, 96, -70, -10, 16, 1002, mat='brick', gaps=[('n', 61, 8)])
    for i, (x, z) in enumerate(((40, -20), (88, -20), (88, -60), (40, -60))):
        pl.part((x, 1, z), (1, 1, 1), 23, 'GuardPostB%d' % (i + 1), m, transparency=1, collide=False)
    pl.part((50, 0.6, -40), (20, 1.2, 12), 1003, 'Court', m, mat='concrete', surface=SMOOTH)
    pl.part((44, 5, -40), (0.5, 10, 0.5), 199, 'Hoop', m, mat='metal', surface=SMOOTH)
    pl.part((90, 8, -16), (6, 16, 6), 1002, 'WatchTower', m, mat='brick', surface=SMOOTH)
    # the way over: crates stacked by the wall in a corner
    for (x, z, h) in ((88, -56, 4), (84, -62, 8), (90, -64, 12), (86, -67, 16)):
        pl.part((x, h / 2, z), (5, h, 5), 192, 'Crate', m, mat='planks', surface=SMOOTH)
    pl.part((61, 0.2, -100), (80, 0.4, 40), 37, 'Freedom', m, mat='grass', surface=SMOOTH)
    pl.part((61, 6, -120), (20, 0.5, 6), 24, 'Sign', m, mat='smooth', surface=SMOOTH)
    pl.script('PrisonScript', game_script('npc', 'prison'))
    pl.save()


# ------------------------------------------------------------------------------------------
# Tycoons: a plot with a conveyor into a collector; buttons buy droppers, upgraders and the building.
def tycoon(file, name, theme):
    pl = Place(file)
    pl.lighting(ambient=(0.55, 0.55, 0.58))
    t = pl.model('Tycoon')
    items = pl.model('Items', t)
    buttons = pl.model('Buttons', t)
    floor_c, wall_c, accent = theme['floor'], theme['wall'], theme['accent']
    pl.part((0, -1, 0), (300, 2, 300), 37, 'Grass', mat='grass', surface=SMOOTH)
    pl.part((0, 0.1, 0), (70, 0.2, 60), floor_c, 'Plot', t, mat=theme.get('floor_mat', 'concrete'), surface=SMOOTH)
    # conveyor along +x into the collector
    pl.part((-4, 1, 0), (44, 1, 5), 26, 'Conveyor', t, mat='metal', surface=SMOOTH, velocity=(9, 0, 0))
    pl.part((-4, 1.6, 2.8), (44, 1.2, 0.6), 199, 'Rail', t, mat='metal', surface=SMOOTH)
    pl.part((-4, 1.6, -2.8), (44, 1.2, 0.6), 199, 'Rail', t, mat='metal', surface=SMOOTH)
    pl.part((20.5, 1.5, 0), (5, 2, 6), accent, 'Collector', t, mat='neon', surface=SMOOTH)
    pl.part((0, 0.4, -22), (6, 0.4, 6), accent, 'Spawn', t, cls='SpawnLocation', mat='smooth', surface=SMOOTH)
    # what you can buy: (key, label, price, needs, builder)
    def dropper(x, worth, rate, color):
        def build(pl_, m):
            d = pl.part((x, 9.5, 0), (3, 3, 3), color, 'Dropper', m, mat='metal', surface=SMOOTH)
            pl.value(d, 'IntValue', 'Worth', worth)
            pl.value(d, 'NumberValue', 'Rate', rate)
            pl.part((x, 11.6, 0), (2, 1.2, 2), accent, 'Hopper', m, mat='neon', surface=SMOOTH)
            for dz in (-3, 3):
                pl.part((x, 5.5, dz), (1, 11, 1), 199, 'Leg', m, mat='metal', surface=SMOOTH)
            pl.part((x, 11, 0), (1, 1, 7), 199, 'Beam', m, mat='metal', surface=SMOOTH)
        return build
    def upgrader(x, mult):
        def build(pl_, m):
            u = pl.part((x, 3, 0), (1, 3.5, 5), accent, 'Upgrader', m, mat='neon', transparency=0.4, collide=False, surface=SMOOTH)
            pl.value(u, 'NumberValue', 'Mult', mult)
            for dz in (-3, 3):
                pl.part((x, 3, dz), (1.6, 5, 1), wall_c, 'Frame', m, mat='metal', surface=SMOOTH)
            pl.part((x, 5.8, 0), (1.6, 1, 7), wall_c, 'Frame', m, mat='metal', surface=SMOOTH)
        return build
    def wall(side):
        def build(pl_, m):
            if side == 'back':
                pl.part((0, 7, 30), (70, 14, 2), wall_c, 'Wall', m, mat=theme.get('wall_mat', 'brick'), surface=SMOOTH)
            elif side == 'left':
                pl.part((-35, 7, 0), (2, 14, 60), wall_c, 'Wall', m, mat=theme.get('wall_mat', 'brick'), surface=SMOOTH)
            else:
                pl.part((35, 7, 0), (2, 14, 60), wall_c, 'Wall', m, mat=theme.get('wall_mat', 'brick'), surface=SMOOTH)
        return build
    def roof(pl_, m):
        pl.part((0, 14.5, 0), (72, 1, 62), wall_c, 'Roof', m, mat='slate', surface=SMOOTH)
    def sign(pl_, m):
        pl.part((0, 20, 30), (40, 8, 1), accent, 'Sign', m, mat='neon', surface=SMOOTH)
    extras = theme['extras']
    shop = [
        ('dropper1', theme['d'][0], 0, '', dropper(-22, 2, 1.5, theme['dc'][0])),
        ('dropper2', theme['d'][1], 25, 'dropper1', dropper(-16, 4, 1.5, theme['dc'][1])),
        ('wall_back', 'Back Wall', 60, 'dropper1', wall('back')),
        ('dropper3', theme['d'][2], 150, 'dropper2', dropper(-10, 10, 1.4, theme['dc'][2])),
        ('upgrader1', theme['u'][0], 300, 'dropper3', upgrader(6, 2)),
        ('wall_left', 'Left Wall', 350, 'wall_back', wall('left')),
        ('dropper4', theme['d'][3], 800, 'upgrader1', dropper(-4, 25, 1.3, theme['dc'][3])),
        ('wall_right', 'Right Wall', 900, 'wall_left', wall('right')),
        ('dropper5', theme['d'][4], 2500, 'dropper4', dropper(2, 60, 1.2, theme['dc'][4])),
        ('upgrader2', theme['u'][1], 5000, 'dropper5', upgrader(12, 3)),
        ('roof', 'Roof', 8000, 'wall_right', roof),
        ('extra1', extras[0][0], 12000, 'upgrader2', extras[0][1]),
        ('sign', 'Big Sign', 20000, 'roof', sign),
        ('extra2', extras[1][0], 40000, 'extra1', extras[1][1]),
    ]
    for i, (key, label, price, needs, build) in enumerate(shop):
        m = pl.model(key, items)
        build(pl, m)
        row, col = divmod(i, 7)
        b = pl.part((-27 + col * 9, 0.45, -10 - row * 7), (4, 0.5, 4), 37 if price == 0 else 1020, 'Button', buttons, mat='neon', surface=SMOOTH)
        pl.value(b, 'StringValue', 'Item', key)
        pl.value(b, 'IntValue', 'Price', price)
        pl.value(b, 'StringValue', 'Needs', needs)
        pl.value(b, 'StringValue', 'Label', label)
    table = '{ name = "%s", money = "Cash", block = { %d, "%s", %s } }' % (name, theme['block'][0], theme['block'][1], theme['block'][2])
    pl.script('TycoonScript', game_script() + '\nTYCOON = ' + table + '\n' + open(os.path.join(HERE, 'games', 'tycoon.lua')).read())
    pl.save()


def burger_tycoon():
    def tables(pl, m):
        for (x, z) in ((-24, 18), (-14, 18), (24, -20), (24, 18)):
            pl.part((x, 3, z), (0.4, 5, 5), 1001, 'Table', m, shape='cyl', r=(0, 0, 90), surface=SMOOTH)
            for dx in (-3.5, 3.5):
                pl.part((x + dx, 1.3, z), (2, 0.5, 2), 21, 'Chair', m, cls='Seat', mat='smooth', surface=SMOOTH)
    def mascot(pl, m):
        pl.part((26, 6, 22), (4, 12, 4), 24, 'Statue', m, mat='foil', surface=SMOOTH)
        pl.part((26, 13.5, 22), (6, 3, 6), 192, 'BurgerTop', m, shape='ball', surface=SMOOTH)
    tycoon('burger-tycoon', 'Burger Tycoon', {
        'floor': 1001, 'floor_mat': 'marble', 'wall': 21, 'wall_mat': 'brick', 'accent': 24, 'block': (192, 'SmoothPlastic', 1.2),
        'd': ['Patty Grill', 'Bun Toaster', 'Cheese Melter', 'Fry Cooker', 'Shake Machine'],
        'dc': [199, 192, 24, 1004, 1032], 'u': ['Sauce Station', 'Golden Wrapper'],
        'extras': [('Dining Tables', tables), ('Burger Statue', mascot)]})


def crystal_mine_tycoon():
    def carts(pl, m):
        for i, x in enumerate((-26, -18, -10)):
            pl.part((x, 1.5, 20), (4, 2.5, 3), 199, 'Cart', m, mat='metal', surface=SMOOTH)
            pl.part((x, 3, 20), (3, 1, 2), (1032, 1031, 23)[i], 'Gems', m, mat='neon', surface=SMOOTH)
        pl.part((-18, 0.3, 20), (30, 0.2, 1), 192, 'Track', m, mat='wood', surface=SMOOTH)
    def drill(pl, m):
        pl.part((26, 8, 20), (6, 16, 6), 199, 'Drill', m, mat='diamond', surface=SMOOTH)
        pl.part((26, 17, 20), (4, 4, 4), 1032, 'Core', m, mat='neon', shape='ball', surface=SMOOTH)
    tycoon('crystal-mine-tycoon', 'Crystal Mine Tycoon', {
        'floor': 1030, 'floor_mat': 'slate', 'wall': 1002, 'wall_mat': 'slate', 'accent': 1032, 'block': (1032, 'Neon', 1),
        'd': ['Pickaxe Rig', 'Stone Crusher', 'Gem Drill', 'Laser Cutter', 'Mega Excavator'],
        'dc': [194, 1002, 23, 21, 26], 'u': ['Polisher', 'Crystal Enchanter'],
        'extras': [('Mine Carts', carts), ('Giant Drill', drill)]})


# ------------------------------------------------------------------------------------------
# Themed obbies (the Rainbow Obby's stages in other colors, materials and orders)
def shuffled_order(seed, n):
    r = random.Random(seed)
    out, last = [], None
    while len(out) < n:
        k = r.randrange(14)
        if k != last:
            out.append(k)
            last = k
    return out


def themed_obbies():
    rainbow_obby('mega-obby', 'the Mega Obby', RAINBOW, seed=31, count=60, order=shuffled_order(31, 60))
    rainbow_obby('ice-cave-obby', 'the Ice Cave Obby', [1, 1019, 1013, 23, 102, 11, 1024], seed=41, count=30, mat='ice',
                 light={'ambient': (0.55, 0.62, 0.7), 'fog_end': 700, 'fog': (0.72, 0.85, 0.95)}, ground=1, order=shuffled_order(41, 30))
    rainbow_obby('neon-night-obby', 'the Neon Night Obby', [1032, 1031, 1020, 1009, 1010, 1004, 1019], seed=51, count=30, mat='neon',
                 light={'time': '00:00:00', 'ambient': (0.3, 0.3, 0.4), 'fog_end': 900, 'fog': (0.05, 0.05, 0.12)}, ground=26, order=shuffled_order(51, 30))
    rainbow_obby('candy-land-obby', 'Candy Land Obby', [1016, 1024, 1025, 1026, 1027, 1028, 1029], seed=61, count=30, mat='smooth',
                 light={'ambient': (0.62, 0.55, 0.6)}, ground=1016, order=shuffled_order(61, 30))
    rainbow_obby('volcano-obby', 'the Volcano Obby', [1004, 21, 105, 199, 26, 1014], seed=71, count=30, mat='slate',
                 light={'time': '17:40:00', 'ambient': (0.6, 0.42, 0.36), 'fog_end': 800, 'fog': (0.45, 0.2, 0.12)}, ground=26,
                 order=shuffled_order(71, 30))


# ------------------------------------------------------------------------------------------
# Rising Tide: a lobby and three flooding maps of three floors each; buttons open hatches upward.
def rising_tide():
    pl = Place('rising-tide')
    pl.lighting(ambient=(0.52, 0.55, 0.6))
    lobby = pl.model('Lobby')
    pl.part((120, -9, -40), (520, 2, 400), 1019, 'Ocean', mat='smooth', transparency=0.2, collide=False, surface=SMOOTH)
    pl.part((120, -12, -40), (520, 2, 400), 1014, 'Seabed', mat='sand', collide=False, surface=SMOOTH)
    pl.part((0, -1, -120), (60, 2, 60), 1, 'LobbyFloor', lobby, mat='marble', surface=SMOOTH)
    pl.part((0, 0.3, -120), (8, 0.4, 8), 23, 'Spawn', lobby, cls='SpawnLocation', mat='smooth', surface=SMOOTH)
    walls(pl, lobby, -30, 30, -150, -90, 8, 1002, mat='marble')
    themes = [('Sunken Temple', 1030, 'slate', 24), ('Old Shipyard', 192, 'planks', 21), ('Waterworks', 199, 'metal', 1019)]
    for k, (title, color, mat, button_color) in enumerate(themes):
        cx = k * 120
        m = pl.model('Map_' + title.replace(' ', ''))
        pl.value(m, 'StringValue', 'Title', title)
        W, D, FH = 50, 30, 20
        walls(pl, m, cx - W / 2, cx + W / 2, -D / 2, D / 2, FH * 3 + 6, color, mat=mat)
        pl.part((cx, -1, 0), (W, 2, D), color, 'Floor', m, mat=mat, surface=SMOOTH)
        pl.part((cx - 18, 0.3, 0), (6, 0.4, 6), 37, 'Start', m, mat='smooth', surface=SMOOTH)
        for f in range(3):
            y = f * FH
            hole_x = cx + (18 if f % 2 == 0 else -18)
            # the ceiling of this floor, with a hatch over a hole at one end
            if f < 2:
                yy = y + FH
                left, right = cx - W / 2, cx + W / 2
                h0, h1 = hole_x - 4, hole_x + 4
                pl.part(((left + h0) / 2, yy, 0), (h0 - left, 1, D), color, 'Ceiling', m, mat=mat, surface=SMOOTH)
                pl.part(((h1 + right) / 2, yy, 0), (right - h1, 1, D), color, 'Ceiling', m, mat=mat, surface=SMOOTH)
                gate = pl.part((hole_x, yy, 0), (8, 1, D), 1001, 'Gate%d' % (f + 1), m, mat='metal', surface=SMOOTH)
                # the button is at the far end from the hole
                b = pl.part((cx - (hole_x - cx) * 0.9, y + 0.5, 10), (3, 1, 3), 21, 'Button', m, mat='neon', surface=SMOOTH)
                pl.value(b, 'StringValue', 'Opens', 'Gate%d' % (f + 1))
                # steps up to the hatch
                for i in range(6):
                    pl.part((hole_x + (-1 if hole_x > cx else 1) * (14 - i * 2.6), y + 2 + i * 3.1, -6 + (i % 2) * 6), (4, 1, 4), button_color, 'Step', m)
            # obstacles on the floor: crates to hop over
            for i in range(3):
                pl.part((cx - 10 + i * 10, y + 1.5, -8 + (i % 2) * 16), (4, 3, 4), 192, 'Crate', m, mat='planks', surface=SMOOTH)
        top_y = FH * 2
        pl.part((cx + 18, top_y + 0.8, 0), (6, 0.6, 6), 24, 'Exit', m, mat='neon', surface=SMOOTH)
        w = pl.part((cx, -6, 0), (W - 2, 8, D - 2), 1019, 'Water', m, mat='smooth', transparency=0.35, collide=False, surface=SMOOTH)
        pl.value(w, 'NumberValue', 'Top', top_y + 6)
    pl.script('TideScript', game_script('tide'))
    pl.save()


if __name__ == '__main__':
    rainbow_obby()
    sky_tower()
    floor_is_lava()
    speed_run()
    pizza_shift()
    undead_nights()
    brick_battle_peaks()
    sword_clash_arena()
    cellblock_breakout()
    burger_tycoon()
    crystal_mine_tycoon()
    themed_obbies()
    rising_tide()
