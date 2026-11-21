#!/usr/bin/env python3
"""Build ../scripts/WebBloxAnimate.lua, which gives characters their 2016 animations.

Why: the engine puts the default "Animate" LocalScript into characters but never
runs it, and even when animations are requested the engine can't load
roblox.com animation assets (tracks come back empty). It can, however, play
KeyframeSequences that are built at runtime and registered with
KeyframeSequenceProvider:RegisterKeyframeSequence().

So the generated Lua (run on the client from the StarterScript by play.html):
  1. builds every default animation from data embedded below -- five taken
     from the engine's own content/animations, the rest authored here --
     and registers them;
  2. runs the engine's bundled 2016 Animate logic for the local character,
     swapping the default roblox.com animation ids for the registered ones
     (also for ids configured in a game's own Animate script).

usage: python3 build_animations.py      (needs: pip install lz4)
"""
import gzip, math, os, re, struct
import xml.etree.ElementTree as ET
import lz4.block

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# animation name -> roblox.com asset ids used by the 2016 and 2014 Animate scripts
IDS = {
    'idle': [180435571, 125750544], 'idle2': [180435792, 125750618],
    'walk': [180426354, 125749145], 'jump': [125750702],
    'fall': [180436148, 125750759], 'climb': [180436334, 125750800],
    'sit': [178130996], 'toolnone': [182393478, 125750867],
    'toolslash': [129967390], 'toollunge': [129967478],
    'wave': [128777973], 'point': [128853357], 'laugh': [129423131], 'cheer': [129423030],
    'dance': [182435998, 182491037, 182491065, 182436842, 182491248, 182491277, 182436935, 182491368,
              182491423, 130018893, 132546839, 132546884, 160934142, 160934298, 160934376, 160934458,
              160934530, 160934593],
}
FROM_ENGINE = {'idle': 'Idle1LoopAnimation', 'idle2': 'Idle2LoopAnimation', 'walk': 'WalkLoopAnimation',
               'jump': 'JumpAnimation', 'fall': 'FallLoopAnimation'}

CORE, IDLE, MOVEMENT, ACTION = 1000, 0, 1, 2

# Authored animations: (loop, priority, [(time, {part: (z_degrees, x_degrees)})]).
# R6 joints swing around their Z axis: +Z raises the right arm / right leg forward, -Z the left ones.
AUTHORED = {
    'toolnone': (True, ACTION, [(0, {'Right Arm': (90, 0)}), (1, {'Right Arm': (90, 0)})]),
    'sit': (True, CORE, [(t, {'Right Arm': (90, 0), 'Left Arm': (-90, 0), 'Right Leg': (90, 0), 'Left Leg': (-90, 0)}) for t in (0, 1)]),
    'climb': (True, CORE, [
        (0.0, {'Right Arm': (165, 0), 'Left Arm': (-115, 0), 'Right Leg': (25, 0), 'Left Leg': (0, 0)}),
        (0.5, {'Right Arm': (115, 0), 'Left Arm': (-165, 0), 'Right Leg': (0, 0), 'Left Leg': (-25, 0)}),
        (1.0, {'Right Arm': (165, 0), 'Left Arm': (-115, 0), 'Right Leg': (25, 0), 'Left Leg': (0, 0)})]),
    'toolslash': (False, ACTION, [(0.0, {'Right Arm': (90, 0)}), (0.1, {'Right Arm': (175, 0)}),
                                  (0.25, {'Right Arm': (25, 0)}), (0.4, {'Right Arm': (90, 0)})]),
    'toollunge': (False, ACTION, [(0.0, {'Right Arm': (90, 0)}), (0.15, {'Right Arm': (105, -20)}),
                                  (0.45, {'Right Arm': (105, -20)}), (0.6, {'Right Arm': (90, 0)})]),
    'wave': (False, ACTION, [(i * 0.2, {'Right Arm': (150 if i % 2 == 0 else 180, 0)}) for i in range(6)]),
    'point': (False, ACTION, [(0.0, {'Right Arm': (0, 0)}), (0.2, {'Right Arm': (90, 0)}),
                              (1.4, {'Right Arm': (90, 0)}), (1.6, {'Right Arm': (0, 0)})]),
    'cheer': (False, ACTION, [(i * 0.25, {'Right Arm': (170 if i % 2 == 0 else 145, 0),
                                         'Left Arm': (-170 if i % 2 == 0 else -145, 0)}) for i in range(6)]),
    'laugh': (False, ACTION, [(i * 0.15, {'Head': (0, 8 if i % 2 else -8), 'Right Arm': (20, 0), 'Left Arm': (-20, 0)})
                              for i in range(9)]),
    'dance': (True, ACTION, [
        (0.0, {'Right Arm': (160, 0), 'Left Arm': (-20, 0), 'Right Leg': (20, 0), 'Left Leg': (0, 0)}),
        (0.4, {'Right Arm': (20, 0), 'Left Arm': (-160, 0), 'Right Leg': (0, 0), 'Left Leg': (-20, 0)}),
        (0.8, {'Right Arm': (160, 0), 'Left Arm': (-20, 0), 'Right Leg': (20, 0), 'Left Leg': (0, 0)})]),
}

IDENTITY = (0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)


# ---- reading the engine's animations -------------------------------------
def engine_content():
    js = open(os.path.join(ROOT, 'rblx.js')).read()
    files = {f: (int(s), int(e)) for f, s, e in re.findall(r'\{filename:"([^"]+)",start:(\d+),end:(\d+)\}', js)}
    data = b''.join(open(os.path.join(ROOT, f'rblx.data.{i}'), 'rb').read() for i in range(12))
    return lambda path: data[files[path][0]:files[path][1]]


def _deinterleave(b, n, k=4):
    return [bytes(b[j * n + i] for j in range(k)) for i in range(n)]


def _rbxfloat(b):
    u = int.from_bytes(b, 'big')
    return struct.unpack('>f', (((u >> 1) | ((u & 1) << 31)) & 0xFFFFFFFF).to_bytes(4, 'big'))[0]


def _refs(b, n):
    acc, out = 0, []
    for r in _deinterleave(b, n):
        u = int.from_bytes(r, 'big')
        acc += (u >> 1) ^ -(u & 1)
        out.append(acc)
    return out


def read_binary(blob):
    """Decode a binary .rbxm into {ref: {'class', 'props', 'parent'}} (just the types animations use)."""
    assert blob[:8] == b'<roblox!'
    o, insts, classes = 32, {}, {}
    while o < len(blob):
        name = blob[o:o + 4].rstrip(b'\0').decode()
        clen, ulen = struct.unpack('<II', blob[o + 4:o + 12])
        body = blob[o + 16:o + 16 + (clen or ulen)]
        o += 16 + (clen or ulen)
        d = lz4.block.decompress(body, uncompressed_size=ulen) if clen else body
        if name == 'INST':
            cid, = struct.unpack('<i', d[:4]); ln, = struct.unpack('<I', d[4:8]); cn = d[8:8 + ln].decode()
            cnt, = struct.unpack('<I', d[9 + ln:13 + ln])
            classes[cid] = refs = _refs(d[13 + ln:13 + ln + 4 * cnt], cnt)
            for r in refs:
                insts[r] = {'class': cn, 'props': {}, 'parent': -1}
        elif name == 'PROP':
            cid, = struct.unpack('<i', d[:4]); ln, = struct.unpack('<I', d[4:8]); pn = d[8:8 + ln].decode()
            t, v, refs = d[8 + ln], d[9 + ln:], classes[cid]
            n = len(refs)
            if t == 1:
                vals, p = [], 0
                for _ in range(n):
                    l, = struct.unpack('<I', v[p:p + 4]); vals.append(v[p + 4:p + 4 + l].decode('utf-8', 'replace')); p += 4 + l
            elif t == 2:
                vals = [bool(x) for x in v[:n]]
            elif t == 4:
                vals = [_rbxfloat(x) for x in _deinterleave(v, n)]
            elif t == 18:
                vals = [int.from_bytes(x, 'big') for x in _deinterleave(v, n)]
            elif t == 16:
                rots, p = [], 0
                for _ in range(n):
                    if v[p] == 0:
                        rots.append(struct.unpack('<9f', v[p + 1:p + 37])); p += 37
                    else:
                        assert v[p] == 2, 'unexpected CFrame rotation id %d' % v[p]
                        rots.append(IDENTITY[3:]); p += 1
                pos = [[_rbxfloat(x) for x in _deinterleave(v[p + i * 4 * n:p + (i + 1) * 4 * n], n)] for i in range(3)]
                vals = [(pos[0][i], pos[1][i], pos[2][i]) + tuple(rots[i]) for i in range(n)]
            else:
                continue
            for r, val in zip(refs, vals):
                insts[r]['props'][pn] = val
        elif name == 'PRNT':
            cnt, = struct.unpack('<I', d[1:5])
            for c, p in zip(_refs(d[5:5 + 4 * cnt], cnt), _refs(d[5 + 4 * cnt:5 + 8 * cnt], cnt)):
                insts[c]['parent'] = p
        elif name == 'END':
            break
    return insts


def read_xml(blob):
    root, insts, n = ET.fromstring(blob), {}, [0]

    def walk(item, parent):
        ref = n[0]; n[0] += 1
        props = {}
        for p in item.find('Properties'):
            k = p.get('name')
            if p.tag == 'CoordinateFrame':
                props[k] = tuple(float(p.find(c).text) for c in ('X', 'Y', 'Z', 'R00', 'R01', 'R02', 'R10', 'R11', 'R12', 'R20', 'R21', 'R22'))
            elif p.tag in ('float', 'double'):
                props[k] = float(p.text)
            elif p.tag == 'bool':
                props[k] = p.text == 'true'
            elif p.tag == 'token':
                props[k] = int(p.text)
            else:
                props[k] = p.text or ''
        insts[ref] = {'class': item.get('class'), 'props': props, 'parent': parent}
        for c in item.findall('Item'):
            walk(c, ref)
    for it in root.findall('Item'):
        walk(it, -1)
    return insts


def sequence_from_insts(insts):
    """-> (loop, priority, [(time, keyframe name, [(pose name, parent index or 0, cframe, weight)])])"""
    ks = next(r for r, i in insts.items() if i['class'] == 'KeyframeSequence')
    kids = {}
    for r, i in insts.items():
        kids.setdefault(i['parent'], []).append(r)
    frames = []
    for kf in sorted(kids.get(ks, []), key=lambda r: insts[r]['props'].get('Time', 0)):
        poses = []

        def add(r, parent_idx):
            p = insts[r]['props']
            poses.append((p.get('Name', ''), parent_idx, p.get('CFrame', IDENTITY), p.get('Weight', 1)))
            me = len(poses)
            for c in kids.get(r, []):
                if insts[c]['class'] == 'Pose':
                    add(c, me)
        for r in kids.get(kf, []):
            if insts[r]['class'] == 'Pose':
                add(r, 0)
        frames.append((insts[kf]['props'].get('Time', 0), insts[kf]['props'].get('Name', 'Keyframe'), poses))
    p = insts[ks]['props']
    return p.get('Loop', False), p.get('Priority', CORE), frames


def authored_sequence(loop, priority, frames):
    out = []
    for t, parts in frames:
        poses = [('HumanoidRootPart', 0, IDENTITY, 1), ('Torso', 1, IDENTITY, 1)]
        for part, (zd, xd) in parts.items():
            z, x = math.radians(zd), math.radians(xd)
            cz, sz, cx, sx = math.cos(z), math.sin(z), math.cos(x), math.sin(x)
            m = (cz, -sz * cx, sz * sx, sz, cz * cx, -cz * sx, 0, sx, cx)   # Rz(z) * Rx(x)
            poses.append((part, 2, (0, 0, 0) + m, 1))
        out.append((t, 'Keyframe', poses))
    return loop, priority, out


# ---- Lua output ------------------------------------------------------------
def num(v):
    s = ('%.4f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('', '-0') else s


def lua_sequences(seqs):
    lines = ['local ANIMATIONS = {']
    for name, (loop, priority, frames) in sorted(seqs.items()):
        lines.append(f'\t["{name}"] = {{ loop = {str(bool(loop)).lower()}, priority = {priority}, frames = {{')
        for t, kname, poses in frames:
            ps = []
            for pname, parent, cf, w in poses:
                cfs = 'false' if tuple(round(x, 4) for x in cf) == IDENTITY else '{' + ','.join(num(x) for x in cf) + '}'
                ps.append(f'{{"{pname}",{parent},{cfs},{num(w)}}}')
            lines.append(f'\t\t{{ {num(t)}, "{kname}", {{ {", ".join(ps)} }} }},')
        lines.append('\t} },')
    lines.append('}')
    return '\n'.join(lines)


def animate_logic(read):
    model = ET.fromstring(read('/content/fonts/humanoidAnimateLocalKeyframe2.rbxm'))
    src = model.find(".//ProtectedString[@name='Source']").text
    assert 'local Figure = script.Parent' in src
    names = sorted(set(re.findall(r'^function\s+(\w+)\s*\(', src, re.M)))
    body = src.replace('local Figure = script.Parent', '-- (Figure is the character passed to run)')
    # read per-animation overrides (StringValue children) from the character's own Animate script
    body = re.sub(r'\bscript([:.])', r'config\1', body)
    assert not re.search(r'\bscript\b', re.sub(r'--.*', '', body))
    # swap default roblox.com animation ids for the animations registered below
    for old, new in [('animTable[name][idx].anim = childPart', 'animTable[name][idx].anim = remapAnimation(childPart)'),
                     ('animTable[name][idx].anim.AnimationId = anim.id', 'animTable[name][idx].anim.AnimationId = remapId(anim.id)'),
                     # tell WebBloxPlayers.lua what we're playing, so other players see it too
                     ('\t\tcurrentAnim = animName\n', '\t\tcurrentAnim = animName\n\t\tif WEBBLOX then WEBBLOX.anim = animName end\n')]:
        assert body.count(old) == 1, old
        body = body.replace(old, new)
    return names, '\n'.join('\t' + line for line in body.splitlines())


def build_lua(seqs, read):
    names, body = animate_logic(read)
    ids = ', '.join(f'[{i}] = "{n}"' for n, lst in IDS.items() for i in lst)
    return f'''-- WebBlox character animations. Generated by tools/build_animations.py -- edit that instead.
--
-- The engine puts the default "Animate" LocalScript into characters but never runs it, and it
-- can't load roblox.com animation assets. So this builds the default animations at runtime,
-- registers them with KeyframeSequenceProvider, and runs the engine's bundled 2016 Animate
-- logic (content/fonts/humanoidAnimateLocalKeyframe2.rbxm) for the local player's character,
-- using the character's own Animate script (if any) for its settings and disabling it.

{lua_sequences(seqs)}

-- roblox.com asset id -> animation above
local DEFAULT_IDS = {{ {ids} }}

local KeyframeSequenceProvider = game:GetService("KeyframeSequenceProvider")
local registered, keep = {{}}, {{}}
for name, data in pairs(ANIMATIONS) do
	local ok, id = pcall(function()
		local ks = Instance.new("KeyframeSequence")
		ks.Loop = data.loop
		pcall(function() ks.Priority = data.priority end)
		for _, frame in ipairs(data.frames) do
			local kf = Instance.new("Keyframe")
			kf.Time = frame[1]
			kf.Name = frame[2]
			local made = {{}}
			for i, p in ipairs(frame[3]) do
				local pose = Instance.new("Pose")
				pose.Name = p[1]
				local c = p[3]
				if c then pose.CFrame = CFrame.new(c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], c[12]) end
				pose.Weight = p[4]
				pose.Parent = p[2] == 0 and kf or made[p[2]]
				made[i] = pose
			end
			kf.Parent = ks
		end
		keep[name] = ks
		return KeyframeSequenceProvider:RegisterKeyframeSequence(ks)
	end)
	if ok and id then registered[name] = id end
end
if WEBBLOX then WEBBLOX.anims = registered end   -- shared with WebBloxPlayers.lua (other players' avatars)

local function remapId(id)
	local s = tostring(id)
	local n = tonumber(string.match(s, "[?&][iI][dD]=(%d+)") or string.match(s, "rbxassetid://(%d+)") or "")
	local name = n and DEFAULT_IDS[n]
	return (name and registered[name]) or id
end

local function remapAnimation(anim)
	local id = remapId(anim.AnimationId)
	if id == anim.AnimationId then return anim end
	local copy = Instance.new("Animation")
	copy.Name = anim.Name
	copy.AnimationId = id
	return copy
end

local Players = game:GetService("Players")
local player = Players.LocalPlayer
while not player do
	Players.ChildAdded:wait()
	player = Players.LocalPlayer
end

local function run(Figure)
	wait()
	if not Figure.Parent then return end
	local config = Figure:FindFirstChild("Animate")
	if config and config:IsA("LocalScript") then
		pcall(function() config.Disabled = true end)
	else
		config = Instance.new("Folder")
	end
	local {", ".join(names)}
{body}
end

player.CharacterAdded:connect(function(character) run(character) end)
if player.Character then run(player.Character) end
'''


def main():
    read = engine_content()
    seqs = {}
    for name, base in FROM_ENGINE.items():
        blob = gzip.decompress(read(f'/content/animations/{base}.rbxm'))
        seqs[name] = sequence_from_insts(read_binary(blob) if blob[:8] == b'<roblox!' else read_xml(blob))
    for name, spec in AUTHORED.items():
        seqs[name] = authored_sequence(*spec)
    assert set(IDS) == set(seqs), set(IDS) ^ set(seqs)
    os.makedirs(os.path.join(ROOT, 'scripts'), exist_ok=True)
    path = os.path.join(ROOT, 'scripts', 'WebBloxAnimate.lua')
    open(path, 'w').write(build_lua(seqs, read))
    print('wrote', path, os.path.getsize(path), 'bytes;', ', '.join(f'{n}:{len(s[2])}kf' for n, s in sorted(seqs.items())))


if __name__ == '__main__':
    main()
