#!/usr/bin/env python3
"""Make Natural Disaster Survival run the same round for everyone in a multiplayer server.

Every WebBlox player runs their own copy of the game, so out of the box each player got their
own random map and disaster on their own schedule. This rewrites the game's round script so:

- Rounds start on the room's shared clock (ReplicatedStorage.WebBlox.ClockOffset, kept by
  scripts/WebBloxPlayers.lua from the multiplayer sync), every WB_ROUND seconds. Each step of a
  round happens at a fixed time after the round starts, so players stay in step. You can
  still join a round in its first WB_LATE seconds; otherwise a "Next round in m:ss" bar counts
  down to the next one.
- The map, the disaster (and double disasters), and where the tornado, tsunami, volcano and
  wind come from are picked from the room name and round number instead of math.random,
  so they're the same for everyone in the room.
- Survivals are counted in leaderstats (shown on the player list, and sent to the other
  players), and the lobby's Top 10 board ranks everyone in the room by them. It used to read
  Roblox's old Data Persistence, which this engine doesn't have.

Works on both copies: the built-in one (ServerScriptService.MainScript) and places/Natural
Disaster Survival.rbxl (Workspace.Script). Already-converted files are left alone.

usage:
  python3 nds_sync.py IN.rbxl OUT.rbxl
  python3 nds_sync.py --builtin OUT.rbxl     # the engine's own copy, read out of ../rblx.data.*
                                             # (needs: pip install lz4)
"""
import os, re, struct, sys
import lz4.block

MARKER = '-- WebBlox: rounds run on the multiplayer room'

PRELUDE = MARKER + r''''s shared clock (tools/nds_sync.py).
local WB_ROUND = 190      -- seconds from one round's start to the next
local WB_LATE = 40        -- you can still join a round this long after it starts
local wbStore = game:GetService("ReplicatedStorage")
local wbRound, wbT0, wbRand = 0, 0, {}
local function wbGet(name)
	local f = wbStore:FindFirstChild("WebBlox")
	return f and f:FindFirstChild(name)
end
local function wbNow()
	local off = wbGet("ClockOffset")
	return tick() + (off and off.Value or 0)
end
local function wbHash(text, n)
	local h = 5381
	for i = 1, #text do h = (h * 33 + string.byte(text, i)) % 2147483647 end
	h = (h + n * 7919 + 1) % 2147483647
	for _ = 1, 4 do h = (h * 48271) % 2147483647 end
	return h
end
local function wbRoom()
	local r = wbGet("Room")
	return r and r.Value or "solo"
end
-- 1..count, the same for everyone in the room for round n
local function wbPick(n, salt, count)
	return 1 + wbHash(wbRoom() .. salt, n) % math.max(1, count)
end
local function wbDisaster(n, count)
	local i = wbPick(n, "disaster", count)
	if count > 1 and i == wbPick(n - 1, "disaster", count) then i = i % count + 1 end
	return i
end
-- like math.random, but the same sequence for everyone in the room this round
local function wbR(key, a, b)
	local st = wbRand[key] or wbHash(wbRoom() .. key, wbRound)
	st = (st * 48271) % 2147483647
	if st == 0 then st = 1 end
	wbRand[key] = st
	local r = (st - 1) / 2147483646
	if not a then return r end
	if not b then a, b = 1, a end
	return a + math.floor(r * (b - a + 1))
end
local function wbWaitUntil(t)
	while wbNow() < t do wait(math.min(0.5, math.max(0.03, t - wbNow()))) end
end
-- Wait for the next round to start (or join this one if it only just started)
local function wbIntermission()
	local hint, started = nil, tick()
	while true do
		local now = wbNow()
		local n = math.floor(now / WB_ROUND)
		local ready = wbGet("ClockReady")
		ready = (ready and ready.Value) or tick() - started > 15
		if ready and now - n * WB_ROUND <= WB_LATE then
			if hint then hint:Destroy() end
			wbRound, wbT0, wbRand = n, n * WB_ROUND, {}
			return
		end
		if not hint or not hint.Parent then
			hint = Instance.new("Hint")
			hint.Parent = workspace
		end
		if ready then
			local left = math.max(0, math.ceil((n + 1) * WB_ROUND - now))
			hint.Text = string.format("Next round in %d:%02d", math.floor(left / 60), left % 60)
		else
			hint.Text = "Joining the server..."
		end
		wait(0.5)
	end
end
-- Survivals, in leaderstats
local function wbLeaderstats(p)
	if not p:IsA("Player") or p:FindFirstChild("leaderstats") then return end
	local ls = Instance.new("IntValue")
	ls.Name = "leaderstats"
	local sv = Instance.new("IntValue")
	sv.Name = "Survivals"
	sv.Parent = ls
	ls.Parent = p
end
local function wbAddSurvival(p, amount)
	local ls = p and p:FindFirstChild("leaderstats")
	local sv = ls and ls:FindFirstChild("Survivals")
	if sv then sv.Value = sv.Value + (amount or 1) end
end
game:GetService("Players").ChildAdded:connect(wbLeaderstats)
for _, p in pairs(game:GetService("Players"):GetPlayers()) do wbLeaderstats(p) end
-- Everyone in the room with their Survivals, for the Top 10 board
local function wbBoard()
	local list = {}
	local function add(name, ls)
		local sv = ls and ls:FindFirstChild("Survivals")
		if sv then table.insert(list, { Name = name, Wins = tonumber(sv.Value) or 0 }) end
	end
	local me = wbGet("LocalName")
	for _, p in pairs(game:GetService("Players"):GetPlayers()) do
		add(me and me.Value ~= "" and me.Value or p.Name, p:FindFirstChild("leaderstats"))
	end
	local others = wbGet("Players")
	if others then
		for _, f in pairs(others:GetChildren()) do add(f.Name, f:FindFirstChild("leaderstats")) end
	end
	return list
end

'''

# (pattern, replacement, required) applied to the round loop / script, in order
EDITS = [
    # intermission: wait for the room's next round instead of 20 seconds
    (r'\n\twait\(20\)\n(\twhile #game\.Players:GetChildren\(\)<1 do)', r'\n\twbIntermission()\n\1', True),
    # map
    (r'\twait\(3\)\n(\tlocal structures=[^\n]*\n)\tlocal rs=math\.random\(1,#structures\)',
     r'\twbWaitUntil(wbT0+3)\n\1\tlocal rs=wbPick(wbRound,"map",#structures)', True),
    (r'(\.Status\.Value="New Map"\n)\twait\(3\)\n\tns:MakeJoints\(\)\n\twait\(2\)',
     r'\1\twbWaitUntil(wbT0+6)\n\tns:MakeJoints()\n\twbWaitUntil(wbT0+8)', True),
    # built-in: double disaster every 4th round, picked by round number
    (r'\twait\(1\)\n\tdisasternumber=disasternumber\+1\n\tdoubledisaster=disasternumber%4==0',
     r'\twbWaitUntil(wbT0+9)\n\tdisasternumber=wbRound\n\tdoubledisaster=disasternumber%4==0', False),
    (r'(Status\.Value="Double Disaster"\n\t\t)wait\(5\)', r'\1wbWaitUntil(wbT0+14)', False),
    (r'\tif #disasters>1 then\n\t\twhile disaster==lastdisaster do\n\t\t\tdisaster=disasters\[math\.random\(1,#disasters\)\]\n'
     r'\t\tend\n\telse\n\t\tdisaster=disasters\[1\]\n\tend\n',
     r'\tdisaster=disasters[wbDisaster(wbRound,#disasters)]\n', False),
    (r'\t\twhile disaster2==nil or disaster2==disaster do\n\t\t\tdisaster2=disasters\[math\.random\(1,#disasters\)\]\n\t\tend\n',
     r'\t\tdisaster2=disasters[(wbDisaster(wbRound,#disasters)+wbPick(wbRound,"second",#disasters-1)-1)%#disasters+1]\n', False),
    # classic: one disaster per round
    (r'\twait\(1\)\n\s*\tlocal rd=math\.random\(1,#disasters\)',
     r'\twbWaitUntil(wbT0+9)\n\tlocal rd=wbDisaster(wbRound,#disasters)', False),
    # the disaster starts at the same moment for everyone
    (r'\n\twait\(40\)\n', r'\n\twbWaitUntil(wbT0+54)\n', True),
    # survivals
    (r'(function checkplayer\(pv,ph,pst,pst2,amount\)\n)', r'\1\twbAddSurvival(pv,amount)\n', False),
    (r'(function checkplayer\(pv,ph,pst,pst2\)\n)', r'\1\twbAddSurvival(pv,1)\n', False),
    # built-in Top 10 board: everyone in the room, by Survivals
    (r'\tfor _,plr in pairs\(game\.Players:GetPlayers\(\)\) do\n\t\tif plr and plr\.DataReady then\n'
     r'\t\t\tlocal totalwins=plr:LoadNumber\("SurvivedTotal"\) or 0\n',
     r'\tfor _,plr in pairs(wbBoard()) do\n\t\tif plr then\n\t\t\tlocal totalwins=plr.Wins\n', False),
]

# Where each disaster comes from: the same for everyone (math.random -> wbR on these lines)
GEOMETRY = [('tornado', r'tornadostartpos=|table\.insert\(tornadoposes,'), ('tsunami', r'waveangle='),
            ('volcano', r'volcanopos='), ('wind', r'windvec=')]


def convert_source(src):
    if MARKER in src:
        return None
    out = src
    done = 0
    for pat, rep, required in EDITS:
        out, n = re.subn(pat, rep, out, count=1)
        if required and n != 1:
            raise SystemExit('round script not recognized (no match for %r)' % pat[:50])
        done += n
    lines = out.split('\n')
    counts = {}
    for i, line in enumerate(lines):
        for key, pat in GEOMETRY:
            if re.search(pat, line) and 'math.random(' in line:
                counts[key] = counts.get(key, 0) + 1
                k = key + str(counts[key]) if key == 'wind' else key
                line = line.replace('math.random(', 'wbR("%s",' % k).replace('wbR("%s",)' % k, 'wbR("%s")' % k)
                lines[i] = line
    print('  %d round edits, randomness pinned for: %s' % (done, ', '.join(sorted(counts)) or 'nothing'))
    return PRELUDE + '\n'.join(lines)


# ---- binary .rbxl: read, change one script's Source, write back ---------------------------------

def rstr(b, o):
    n, = struct.unpack_from('<I', b, o)
    return b[o + 4:o + 4 + n], o + 4 + n


def refs(b, o, n):
    raw = [bytes(b[o + j * n + i] for j in range(4)) for i in range(n)]
    out, acc = [], 0
    for r in raw:
        x = int.from_bytes(r, 'big')
        acc += (x >> 1) ^ -(x & 1)
        out.append(acc)
    return out


def read_chunks(d):
    assert d[:8] == b'<roblox!', 'not a binary place'
    o, out = 32, []
    while o < len(d):
        name = d[o:o + 4]
        cl, ul, _ = struct.unpack_from('<III', d, o + 4)
        body = d[o + 16:o + 16 + (cl or ul)]
        data = lz4.block.decompress(body, uncompressed_size=ul) if cl else body
        out.append([name, data, d[o:o + 16 + (cl or ul)]])
        o += 16 + (cl or ul)
        if name.startswith(b'END'):
            break
    return out


def chunk_bytes(name, data):
    c = lz4.block.compress(data, store_size=False)
    return name + struct.pack('<III', len(c), len(data), 0) + c


def convert_place(d):
    chunks = read_chunks(d)
    classes, names = {}, {}
    for name, data, _ in chunks:
        if name == b'INST':
            cid, = struct.unpack_from('<i', data, 0)
            cn, o = rstr(data, 4)
            cnt, = struct.unpack_from('<I', data, o + 1)
            classes[cid] = (cn.decode(), refs(data, o + 5, cnt))
    changed = False
    for ch in chunks:
        name, data, _ = ch
        if name != b'PROP':
            continue
        cid, = struct.unpack_from('<i', data, 0)
        pn, o = rstr(data, 4)
        if classes[cid][0] != 'Script' or pn != b'Source' or data[o] != 1:
            continue
        o += 1
        vals = []
        for _ in classes[cid][1]:
            v, o = rstr(data, o)
            vals.append(v)
        here = False
        for i, v in enumerate(vals):
            src = v.decode('utf-8', 'replace')
            if 'disasters' in src and 'Structures' in src and 'while true do' in src:
                new = convert_source(src)
                if new is not None:
                    vals[i] = new.encode('utf-8')
                    here = changed = True
        if here:
            # rebuild: class id, property name, type, values
            body = struct.pack('<i', cid) + struct.pack('<I', len(pn)) + pn + b'\x01'
            body += b''.join(struct.pack('<I', len(v)) + v for v in vals)
            ch[1], ch[2] = body, None
    if not changed:
        return None
    out = bytearray(d[:32])
    for name, data, raw in chunks:
        out += raw if raw is not None else chunk_bytes(name, data)
    return bytes(out)


def builtin_place():
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    js = open(os.path.join(here, 'rblx.js'), encoding='utf-8', errors='replace').read()
    m = re.search(r'\{filename:"/content/game\.rbxl",start:(\d+),end:(\d+)\}', js)
    start, end = int(m.group(1)), int(m.group(2))
    size = os.path.getsize(os.path.join(here, 'rblx.data.0'))
    out = bytearray()
    for i in range(start // size, (end - 1) // size + 1):
        with open(os.path.join(here, 'rblx.data.%d' % i), 'rb') as f:
            out += f.read()
    first = (start // size) * size
    return bytes(out[start - first:end - first])


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == '--builtin':
        src, dst = builtin_place(), args[1]
    elif len(args) == 2:
        src, dst = open(args[0], 'rb').read(), args[1]
    else:
        raise SystemExit(__doc__)
    res = convert_place(src)
    if res is None:
        print('already converted (or no round script found); nothing written')
    else:
        open(dst, 'wb').write(res)
        print('wrote', dst, len(res), 'bytes')
