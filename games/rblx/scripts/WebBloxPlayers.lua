-- WebBlox players: your Catalog outfit, and lite multiplayer.
--
-- play.html runs this inside the client's StarterScript, after WebBloxAnimate.lua, with a
-- shared table in scope:
--   WEBBLOX.look  = { skin = <BrickColor number>, shirt = ..., pants = ..., hat = "<name>" }
--   WEBBLOX.mp    = { url = "https://server", room = "pub-...", name = "...", id = "...", private = bool }
--   WEBBLOX.anim  = name of the animation the local character is playing (from WebBloxAnimate)
--   WEBBLOX.anims = animation name -> registered KeyframeSequence id (from WebBloxAnimate)
--
-- The engine's own networking can't carry a shared game, so multiplayer here is "lite":
-- every player keeps their own world and only avatar positions, animations, outfits,
-- leaderstats and private-room chat are passed between them (p2p.js, or
-- tools/multiplayer-server). Other players show up as stand-in avatars with name tags and
-- chat bubbles, and on the leaderboard.
--
-- ReplicatedStorage.WebBlox is shared with the place's own scripts and the player list:
--   Room (StringValue)        the multiplayer room, or "solo"
--   ClockOffset (NumberValue) add to tick() for the room's shared clock (timed rounds, see
--                             tools/nds_sync.py); ClockReady (BoolValue) once it's known
--   LocalName (StringValue)   your WebBlox name (the engine calls every local player "Player")
--   Players (Folder)          a Folder per other player in the room, with their leaderstats

local WB = WEBBLOX or {}
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local player = Players.LocalPlayer
while not player do
	Players.ChildAdded:wait()
	player = Players.LocalPlayer
end

local mpInfo = WB.mp or {}
local online = mpInfo.url and mpInfo.url ~= ""
local shared = Instance.new("Folder")
shared.Name = "WebBlox"
local function sharedValue(class, name, v)
	local o = Instance.new(class)
	o.Name = name
	o.Value = v
	o.Parent = shared
	return o
end
sharedValue("StringValue", "Room", online and mpInfo.room or "solo")
local clockOffset = sharedValue("NumberValue", "ClockOffset", 0)
local clockReady = sharedValue("BoolValue", "ClockReady", not online)
sharedValue("StringValue", "LocalName", mpInfo.name or "Player")
local remoteFolder = Instance.new("Folder")
remoteFolder.Name = "Players"
remoteFolder.Parent = shared
shared.Parent = game:GetService("ReplicatedStorage")

local BODY = { "Head", "Torso", "Left Arm", "Right Arm", "Left Leg", "Right Leg" }
local SLOT = { Head = "skin", ["Left Arm"] = "skin", ["Right Arm"] = "skin", Torso = "shirt", ["Left Leg"] = "pants", ["Right Leg"] = "pants" }
local BODYCOLOR_PROP = { Head = "HeadColor", Torso = "TorsoColor", ["Left Arm"] = "LeftArmColor", ["Right Arm"] = "RightArmColor", ["Left Leg"] = "LeftLegColor", ["Right Leg"] = "RightLegColor" }

local function newPart(class, name, size, color)
	local p = Instance.new(class)
	pcall(function() p.FormFactor = Enum.FormFactor.Custom end)
	p.Name = name
	p.Size = size
	p.BrickColor = BrickColor.new(color or 194)
	p.CanCollide = false
	p.Anchored = false
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	pcall(function() p.CustomPhysicalProperties = PhysicalProperties.new(0.01, 0, 0) end)
	return p
end

-- Hats from the Catalog, built from plain parts (the engine can't download real hat meshes).
-- Each piece: part class, size, BrickColor, offset from the head's center, rotate cylinder upright?
local UP = CFrame.Angles(0, 0, math.pi / 2)
local HATS = {
	tophat = {
		{ "Part", Vector3.new(0.2, 2.3, 2.3), 26, Vector3.new(0, 0.62, 0), "cyl" },
		{ "Part", Vector3.new(1.3, 1.6, 1.6), 26, Vector3.new(0, 1.35, 0), "cyl" },
		{ "Part", Vector3.new(0.25, 1.65, 1.65), 21, Vector3.new(0, 0.85, 0), "cyl" },
	},
	cheese = { { "WedgePart", Vector3.new(1.6, 0.8, 1.4), 24, Vector3.new(0, 0.9, 0) } },
	cap = {
		{ "Part", Vector3.new(1.35, 1.35, 1.35), 21, Vector3.new(0, 0.5, 0.05), "ball" },
		{ "Part", Vector3.new(1.2, 0.12, 0.9), 21, Vector3.new(0, 0.55, -0.85) },
	},
	crown = {
		{ "Part", Vector3.new(1.5, 0.35, 0.15), 24, Vector3.new(0, 0.72, -0.68) },
		{ "Part", Vector3.new(1.5, 0.35, 0.15), 24, Vector3.new(0, 0.72, 0.68) },
		{ "Part", Vector3.new(0.15, 0.35, 1.5), 24, Vector3.new(-0.68, 0.72, 0) },
		{ "Part", Vector3.new(0.15, 0.35, 1.5), 24, Vector3.new(0.68, 0.72, 0) },
		{ "Part", Vector3.new(0.25, 0.35, 0.25), 24, Vector3.new(-0.62, 1.05, -0.62) },
		{ "Part", Vector3.new(0.25, 0.35, 0.25), 24, Vector3.new(0.62, 1.05, -0.62) },
		{ "Part", Vector3.new(0.25, 0.35, 0.25), 24, Vector3.new(-0.62, 1.05, 0.62) },
		{ "Part", Vector3.new(0.25, 0.35, 0.25), 24, Vector3.new(0.62, 1.05, 0.62) },
	},
	halo = { { "Part", Vector3.new(0.12, 1.8, 1.8), 1009, Vector3.new(0, 1.45, 0), "cyl", true } },
	box = { { "Part", Vector3.new(2.3, 1.3, 1.3), 192, Vector3.new(0, 0.05, 0) } },
}

local function setHat(character, hatName)
	local old = character:FindFirstChild("WebBloxHat")
	if old then old:Destroy() end
	local head = character:FindFirstChild("Head")
	local spec = HATS[hatName or ""]
	if not head or not spec then return end
	local model = Instance.new("Model")
	model.Name = "WebBloxHat"
	for i, piece in ipairs(spec) do
		local p = newPart(piece[1], "Handle" .. i, piece[2], piece[3])
		if piece[5] == "cyl" then p.Shape = Enum.PartType.Cylinder
		elseif piece[5] == "ball" then p.Shape = Enum.PartType.Ball end
		if piece[6] then pcall(function() p.Material = Enum.Material.Neon end) end
		local weld = Instance.new("Weld")
		weld.Part0 = head
		weld.Part1 = p
		weld.C0 = CFrame.new(piece[4]) * (piece[5] == "cyl" and UP or CFrame.new())
		weld.Parent = p
		p.Parent = model
	end
	model.Parent = character
end

local function colorFor(look, partName)
	local n = look and tonumber(look[SLOT[partName]])
	return n and n > 0 and n or nil
end

local function applyLook(character, look)
	if not look then return end
	for _, name in ipairs(BODY) do
		local n = colorFor(look, name)
		local part = character:FindFirstChild(name)
		if n and part then part.BrickColor = BrickColor.new(n) end
	end
	local bc = character:FindFirstChild("Body Colors") or character:FindFirstChild("BodyColors")
	if bc then
		for name, prop in pairs(BODYCOLOR_PROP) do
			local n = colorFor(look, name)
			if n then pcall(function() bc[prop] = BrickColor.new(n) end) end
		end
	end
	setHat(character, look.hat)
end

-- Your own character: wear the Catalog outfit (re-applied for a while, because the engine
-- paints default body colors onto new characters shortly after they spawn).
local function hasLook(look)
	return look and (look.hat or look.skin or look.shirt or look.pants)
end
local function dressMe(character)
	if not hasLook(WB.look) then return end
	character:WaitForChild("Head")
	for _ = 1, 10 do
		applyLook(character, { skin = WB.look.skin, shirt = WB.look.shirt, pants = WB.look.pants })
		wait(0.5)
	end
	setHat(character, WB.look.hat)
end
player.CharacterAdded:connect(function(c) dressMe(c) end)
if player.Character then spawn(function() dressMe(player.Character) end) end

---------------------------------------------------------------------------------------------
-- Lite multiplayer
local mp = WB.mp
if not mp or not mp.url or mp.url == "" then return end

local status = Instance.new("TextLabel")
status.Name = "WebBloxMultiplayer"
status.BackgroundTransparency = 0.5
status.BackgroundColor3 = Color3.new(0, 0, 0)
status.TextColor3 = Color3.new(1, 1, 1)
status.BorderSizePixel = 0
status.Size = UDim2.new(0, 230, 0, 22)
status.Position = UDim2.new(0, 8, 1, -30)
status.FontSize = Enum.FontSize.Size14
status.Text = "Multiplayer: connecting..."
status.Parent = game:GetService("CoreGui"):WaitForChild("RobloxGui")
local function setStatus(text)
	status.Text = text
	status.Size = UDim2.new(0, math.max(150, status.TextBounds.X + 20), 0, 22)
end

local myId = mp.id or ""
if not string.match(myId, "^[a-z0-9]+$") or #myId < 6 then
	math.randomseed(tick() * 1000 % 2147483647)
	myId = ""
	for _ = 1, 10 do myId = myId .. string.char(math.random(97, 122)) end
end

local function enc(s)
	return (string.gsub(tostring(s), "[^%w%-_%.]", function(c) return string.format("%%%02X", string.byte(c)) end))
end

-- Chat. This engine build draws neither chat bubbles nor a chat log for local messages, so
-- show both here: a speech bubble over the speaker and a short message list. (In public
-- servers the hub masks swear words before passing a message on.)
local feed = Instance.new("Frame")
feed.Name = "WebBloxChat"
feed.BackgroundTransparency = 1
feed.Size = UDim2.new(0, 360, 0, 120)
feed.Position = UDim2.new(0, 8, 1, -156)
feed.Parent = status.Parent
local feedLines = {}
local function addFeed(who, text)
	table.insert(feedLines, who .. ": " .. text)
	if #feedLines > 5 then table.remove(feedLines, 1) end
	for _, c in pairs(feed:GetChildren()) do c:Destroy() end
	for i, line in ipairs(feedLines) do
		local t = Instance.new("TextLabel")
		t.BackgroundTransparency = 0.5
		t.BackgroundColor3 = Color3.new(0, 0, 0)
		t.BorderSizePixel = 0
		t.TextColor3 = Color3.new(1, 1, 1)
		t.FontSize = Enum.FontSize.Size14
		t.TextXAlignment = Enum.TextXAlignment.Left
		t.Size = UDim2.new(1, 0, 0, 22)
		t.Position = UDim2.new(0, 0, 1, -24 * (#feedLines - i + 1))
		t.Text = " " .. line
		t.Parent = feed
	end
end

local function speechBubble(head, text)
	local old = head:FindFirstChild("WebBloxBubble")
	if old then old:Destroy() end
	local bb = Instance.new("BillboardGui")
	bb.Name = "WebBloxBubble"
	bb.Adornee = head
	bb.Size = UDim2.new(0, 220, 0, 46)
	bb.StudsOffset = Vector3.new(0, 3.2, 0)
	local t = Instance.new("TextLabel")
	t.Size = UDim2.new(1, 0, 1, 0)
	t.BackgroundColor3 = Color3.new(1, 1, 1)
	t.BorderColor3 = Color3.new(0.6, 0.6, 0.6)
	t.TextColor3 = Color3.new(0.1, 0.1, 0.1)
	t.FontSize = Enum.FontSize.Size14
	t.TextWrapped = true
	t.Text = text
	t.Parent = bb
	bb.Parent = head
	delay(7, function() if bb.Parent then bb:Destroy() end end)
end

local outbox = {}
player.Chatted:connect(function(msg)
	if string.sub(msg, 1, 1) == "/" then return end
	msg = string.sub(msg, 1, 120)
	table.insert(outbox, msg)
	addFeed(mp.name, msg)
	local head = player.Character and player.Character:FindFirstChild("Head")
	if head then speechBubble(head, msg) end
end)

local function myState()
	local c = player.Character
	local root = c and c:FindFirstChild("HumanoidRootPart")
	if not root then return nil end
	local p, look = root.Position, root.CFrame.lookVector
	local colors = {}
	for i, name in ipairs(BODY) do
		local part = c:FindFirstChild(name)
		colors[i] = part and part.BrickColor.Number or 194
	end
	local hat = (WB.look and HATS[WB.look.hat or ""]) and WB.look.hat or "none"
	return string.format("%.2f,%.2f,%.2f,%.3f,%s,%d,%d,%d,%d,%d,%d,%s", p.X, p.Y, p.Z,
		math.atan2(-look.X, -look.Z), WB.anim or "idle", colors[1], colors[2], colors[3], colors[4], colors[5], colors[6], hat)
end

-- Your leaderstats, sent to the others: "Cash:120,Logs:4"
local function myStats()
	local ls = player:FindFirstChild("leaderstats")
	if not ls then return "" end
	local out = {}
	for _, v in pairs(ls:GetChildren()) do
		local ok, val = pcall(function() return v.Value end)
		local name = string.gsub(v.Name, "[^%w _]", "")
		if ok and name ~= "" then
			local text
			if type(val) == "number" then
				text = val == math.floor(val) and string.format("%.0f", val) or string.format("%.2f", val)
			elseif type(val) == "string" or type(val) == "boolean" then
				text = string.gsub(tostring(val), "[^%w _%.%-]", "")
			end
			if text then out[#out + 1] = string.sub(name, 1, 24) .. ":" .. string.sub(text, 1, 24) end
		end
	end
	return string.sub(table.concat(out, ","), 1, 200)
end

-- Another player's entry for the leaderboard: a Folder with a leaderstats copy
local function setRemoteStats(o, name, stats)
	local f = o.folder
	if not f or not f.Parent then
		f = Instance.new("Folder")
		o.folder, o.statsKey = f, nil
	end
	if f.Name ~= name then f.Name = name end
	if o.statsKey ~= stats then
		o.statsKey = stats
		local ls = f:FindFirstChild("leaderstats")
		if not ls then
			ls = Instance.new("IntValue")
			ls.Name = "leaderstats"
		end
		local seen = {}
		for pair in string.gmatch(stats, "[^,]+") do
			local k, v = string.match(pair, "^([^:]+):(.*)$")
			if k then
				seen[k] = true
				local num = tonumber(v)
				local want = num and (num == math.floor(num) and math.abs(num) < 2^31 and "IntValue" or "NumberValue") or "StringValue"
				local cur = ls:FindFirstChild(k)
				if cur and cur.ClassName ~= want then cur:Destroy() cur = nil end
				if not cur then
					cur = Instance.new(want)
					cur.Name = k
					cur.Parent = ls
				end
				cur.Value = num or v
			end
		end
		for _, c in pairs(ls:GetChildren()) do
			if not seen[c.Name] then c:Destroy() end
		end
		if not ls.Parent then ls.Parent = f end
	end
	if not f.Parent then f.Parent = remoteFolder end
end

-- Stand-in avatar for another player
local others = {}

local function joint(name, parent, p0, p1, c0, c1)
	local m = Instance.new("Motor6D")
	m.Name = name
	m.Part0, m.Part1, m.C0, m.C1 = p0, p1, c0, c1
	m.Parent = parent
end

local function makeAvatar(name)
	local m = Instance.new("Model")
	m.Name = name
	local root = newPart("Part", "HumanoidRootPart", Vector3.new(2, 2, 1))
	root.Transparency = 1
	root.Anchored = true
	local torso = newPart("Part", "Torso", Vector3.new(2, 2, 1))
	local head = newPart("Part", "Head", Vector3.new(2, 1, 1))
	local mesh = Instance.new("SpecialMesh", head)
	mesh.MeshType = Enum.MeshType.Head
	mesh.Scale = Vector3.new(1.25, 1.25, 1.25)
	local face = Instance.new("Decal", head)
	face.Name = "face"
	face.Texture = "rbxasset://textures/face.png"
	local la = newPart("Part", "Left Arm", Vector3.new(1, 2, 1))
	local ra = newPart("Part", "Right Arm", Vector3.new(1, 2, 1))
	local ll = newPart("Part", "Left Leg", Vector3.new(1, 2, 1))
	local rl = newPart("Part", "Right Leg", Vector3.new(1, 2, 1))
	for _, p in ipairs({ root, torso, head, la, ra, ll, rl }) do p.Parent = m end
	local R = CFrame.new(0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0)
	joint("RootJoint", root, root, torso, R, R)
	joint("Neck", torso, torso, head, CFrame.new(0, 1, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0), CFrame.new(0, -0.5, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0))
	joint("Right Shoulder", torso, torso, ra, CFrame.new(1, 0.5, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0), CFrame.new(-0.5, 0.5, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0))
	joint("Left Shoulder", torso, torso, la, CFrame.new(-1, 0.5, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0), CFrame.new(0.5, 0.5, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0))
	joint("Right Hip", torso, torso, rl, CFrame.new(1, -1, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0), CFrame.new(0.5, 1, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0))
	joint("Left Hip", torso, torso, ll, CFrame.new(-1, -1, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0), CFrame.new(-0.5, 1, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0))
	local hum = Instance.new("Humanoid")
	hum.Parent = m
	m.PrimaryPart = root
	m.Parent = workspace
	return m, root, hum
end

local function playOn(o, animName)
	if o.animName == animName then return end
	o.animName = animName
	if o.track then pcall(function() o.track:Stop(0.2) end) o.track = nil end
	local id = WB.anims and WB.anims[animName]
	if not id then return end
	local a = Instance.new("Animation")
	a.AnimationId = id
	local ok, track = pcall(function() return o.hum:LoadAnimation(a) end)
	if ok and track then
		o.track = track
		track:Play(0.2)
	end
end

local function update(id, name, state, stats)
	local f = {}
	for v in string.gmatch(state, "[^,]+") do f[#f + 1] = v end
	if #f < 12 then return end
	local x, y, z, yaw = tonumber(f[1]), tonumber(f[2]), tonumber(f[3]), tonumber(f[4])
	if not (x and y and z and yaw) then return end
	local o = others[id]
	if not o or not o.model.Parent then
		local model, root, hum = makeAvatar(name)
		o = { model = model, root = root, hum = hum }
		others[id] = o
		root.CFrame = CFrame.new(x, y, z) * CFrame.Angles(0, yaw, 0)
	end
	o.seen = tick()
	o.target = CFrame.new(x, y, z) * CFrame.Angles(0, yaw, 0)
	if o.model.Name ~= name then o.model.Name = name end
	local key = table.concat(f, ",", 6, 12)
	if o.lookKey ~= key then
		o.lookKey = key
		local colors = { tonumber(f[6]), tonumber(f[7]), tonumber(f[8]), tonumber(f[9]), tonumber(f[10]), tonumber(f[11]) }
		for i, partName in ipairs(BODY) do
			local part = o.model:FindFirstChild(partName)
			if part and colors[i] then part.BrickColor = BrickColor.new(colors[i]) end
		end
		setHat(o.model, f[12])
	end
	playOn(o, f[5])
	setRemoteStats(o, name, stats or "")
end

local function bubble(id, text)
	local o = others[id]
	local head = o and o.model:FindFirstChild("Head")
	addFeed(o and o.model.Name or "Someone", text)
	if head then speechBubble(head, text) end
end

RunService.RenderStepped:connect(function(dt)
	local a = math.min(1, (dt or 0.03) * 12)
	for _, o in pairs(others) do
		if o.target and o.root.Parent then o.root.CFrame = o.root.CFrame:lerp(o.target, a) end
	end
end)

local lastSeq, failures, seenChat = -1, 0, {}
while true do
	local state = myState()
	local chat = table.remove(outbox, 1)
	local url = mp.url .. "/sync?room=" .. enc(mp.room) .. "&id=" .. myId .. "&name=" .. enc(mp.name)
		.. "&ack=" .. lastSeq .. (state and ("&s=" .. enc(state)) or "") .. "&l=" .. enc(myStats())
		.. (chat and ("&c=" .. enc(chat)) or "")
	local ok, body = pcall(function() return game:HttpGetAsync(url) end)
	if ok and type(body) == "string" and string.find(body, "S|") then
		failures = 0
		local count, note, serverNo = 0, nil, nil
		for line in string.gmatch(body, "[^\n]+") do
			local kind = string.sub(line, 1, 2)
			if kind == "M|" then
				note = string.sub(line, 3)
			elseif kind == "N|" then
				serverNo = tonumber(string.sub(line, 3))
			elseif kind == "P|" then
				local id, name, st, stats = string.match(line, "^P|([^|]+)|([^|]*)|([^|]*)|?(.*)$")
				if id then count = count + 1 update(id, name ~= "" and name or "Guest", st, stats) end
			elseif kind == "T|" then
				-- the room's shared clock (ms); small jitter from the request itself is ignored
				local ms = tonumber(string.sub(line, 3))
				if ms then
					local off = ms / 1000 - tick()
					if not clockReady.Value or math.abs(off - clockOffset.Value) > 0.25 then clockOffset.Value = off end
					clockReady.Value = true
				end
			elseif kind == "C|" then
				local seq, oid, text = string.match(line, "^C|(%d+)|([^|]+)|[^|]*|(.*)$")
				seq = tonumber(seq)
				if seq and lastSeq >= 0 and not seenChat[seq] then
					seenChat[seq] = true
					bubble(oid, text)
				end
			elseif kind == "S|" then
				local seq = tonumber(string.sub(line, 3))
				if seq and seq > lastSeq then lastSeq = seq end
			end
		end
		local word = count == 1 and " other player" or " other players"
		local where = mp.private and "Private server: " or (serverNo and ("Server " .. serverNo .. ": ") or "Online: ")
		setStatus(note or (where .. count .. word))
		for oid, o in pairs(others) do
			if tick() - (o.seen or 0) > 4 then
				pcall(function() o.model:Destroy() end)
				if o.folder then pcall(function() o.folder:Destroy() end) end
				others[oid] = nil
			end
		end
	else
		failures = failures + 1
		local p2p = string.find(mp.url, "/peer-sync/", 1, true)
		setStatus(failures > 3 and (p2p and "Multiplayer: reconnecting..." or "Multiplayer: waking up the server...") or "Multiplayer: connecting...")
		-- don't hold up timed rounds forever if we can't reach anyone
		if failures > 10 then clockReady.Value = true end
	end
	wait(ok and 0.12 or math.min(5, 0.5 * failures))
end
