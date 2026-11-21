#!/usr/bin/env python3
"""Build WebBlox's own games into ../places/ (original levels, generated from code):

  rainbow-obby.rbxl    Rainbow Obby: 30 stages of jumps, lava, spinners, trampolines and more
  sky-tower.rbxl       Sky Tower: climb a tower in the clouds, floor by floor
  floor-is-lava.rbxl   The Floor is Lava: get up high before the lava rises (shared rounds)
  speed-run.rbxl       Speed Run: race the clock over a course of speed pads and jumps

Each place is written as Roblox XML and converted with xml2bin.py. Behaviour comes from the
Lua in games/: obby.lua gives parts their behaviour by name (KillBrick, Checkpoint, Vanish,
Bounce, Speed, Spinner, Mover, Go, Finish); lava.lua runs The Floor is Lava's rounds.

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


def kit(game_table):
    src = open(os.path.join(HERE, 'games', 'obby.lua')).read()
    return 'GAME = ' + game_table + '\n' + src


def checkpoint(pl, parent, pos, n, color, size=(10, 1, 10)):
    cls = 'SpawnLocation' if n == 1 else 'Part'
    cp = pl.part(pos, size, color, 'Checkpoint', parent, cls=cls)
    pl.value(cp, 'IntValue', 'Stage', n)
    return cp


def kill(pl, parent, pos, size, r=(0, 0, 0)):
    return pl.part(pos, size, KILL, 'KillBrick', parent, mat='neon', r=r)


# ------------------------------------------------------------------------------------------
# Rainbow Obby: stages along +X, each starting on a checkpoint pad.
def rainbow_obby():
    pl = Place('rainbow-obby')
    pl.lighting(ambient=(0.55, 0.55, 0.6))
    rng = random.Random(7)
    # start island
    start = pl.model('Start')
    pl.part((-30, -1, 0), (50, 2, 50), 37, 'Ground', start, mat='grass')
    x, y = 0.0, 0.0
    color = lambda i: RAINBOW[i % len(RAINBOW)]

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
    order = [0, 1, 3, 2, 10, 5, 6, 4, 8, 9, 7, 11, 12, 13, 0, 5, 6, 2, 1, 9, 3, 4, 11, 8, 13, 12, 10, 7, 6]
    for i in range(30):
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
    pl.script('ObbyScript', kit('{ stat = "Stage", winText = "You beat the Rainbow Obby!" }'))
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
    pl.script('ObbyScript', kit('{ stat = "Floor", winText = "You reached the top of the Sky Tower!" }'))
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
    pl.script('LavaScript', open(os.path.join(HERE, 'games', 'lava.lua')).read())
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


if __name__ == '__main__':
    rainbow_obby()
    sky_tower()
    floor_is_lava()
    speed_run()
