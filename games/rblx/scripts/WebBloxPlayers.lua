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
-- Real-time physics: the engine slows physics down ("environmental throttle") whenever the frame
-- rate drops, which in a browser meant everything fell and moved in slow motion.
pcall(function() settings().Physics.PhysicsEnvironmentalThrottle = Enum.EnviromentalPhysicsThrottle.Disabled end)
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

-- Hats and gear from the Catalog, built from plain parts (the engine can't download real hat
-- meshes). The parts come from site.js (WB.HATS / WB.GEAR) through play.html:
--   { c = class, s = {size}, p = {offset}, color = BrickColor, shape = "cyl" | "ball",
--     r = {extra rotation, degrees}, neon = bool, spin = turns per second }
local UP = CFrame.Angles(0, 0, math.pi / 2)
local HATS = WB.hats or {}
local GEAR = WB.gear or {}
local spinning = {}

local function buildPiece(piece, name)
	local s = piece.s or { 1, 1, 1 }
	local p = newPart(piece.c == "WedgePart" and "WedgePart" or "Part", name, Vector3.new(s[1], s[2], s[3]), piece.color)
	if piece.shape == "cyl" then p.Shape = Enum.PartType.Cylinder
	elseif piece.shape == "ball" then p.Shape = Enum.PartType.Ball end
	if piece.neon then pcall(function() p.Material = Enum.Material.Neon end) end
	return p
end
local function pieceC0(piece)
	local o = piece.p or { 0, 0, 0 }
	local cf = CFrame.new(o[1], o[2], o[3])
	if piece.shape == "cyl" then cf = cf * UP end
	local r = piece.r
	if r then cf = cf * CFrame.Angles(math.rad(r[1]), math.rad(r[2]), math.rad(r[3])) end
	return cf
end
local function weldTo(base, part, c0, spin)
	local weld = Instance.new("Weld")
	weld.Part0 = base
	weld.Part1 = part
	weld.C0 = c0
	weld.Parent = part
	if spin then table.insert(spinning, { weld = weld, base = c0, speed = spin * 2 * math.pi }) end
end

local function setHat(character, hatName)
	local old = character:FindFirstChild("WebBloxHat")
	if old then old:Destroy() end
	local head = character:FindFirstChild("Head")
	local spec = HATS[hatName or ""]
	if not head or not spec then return end
	local model = Instance.new("Model")
	model.Name = "WebBloxHat"
	for i, piece in ipairs(spec) do
		local p = buildPiece(piece, "Handle" .. i)
		weldTo(head, p, pieceC0(piece), piece.spin)
		p.Parent = model
	end
	model.Parent = character
end

RunService.RenderStepped:connect(function()
	local t = tick()
	for i = #spinning, 1, -1 do
		local s = spinning[i]
		if s.weld.Parent then
			s.weld.C0 = s.base * CFrame.Angles(0, (t * s.speed) % (2 * math.pi), 0)
		else
			table.remove(spinning, i)
		end
	end
end)

-- Gear: a Tool in your Backpack for each one you carry; it works while you hold it.
local activeGear = nil
local function gearEffect(effect, on)
	local char = player.Character
	local hum = char and char:FindFirstChild("Humanoid")
	local torso = char and char:FindFirstChild("Torso")
	if not hum or not effect then return end
	hum.WalkSpeed = (on and effect.speed) or 16
	local old = torso and torso:FindFirstChild("WebBloxGearForce")
	if old then old:Destroy() end
	if on and effect.antigravity and torso then
		local mass = 0
		local function add(obj)
			for _, c in pairs(obj:GetChildren()) do
				if c:IsA("BasePart") then mass = mass + c:GetMass() end
				if c:IsA("Tool") or c:IsA("Model") then add(c) end
			end
		end
		add(char)
		local bf = Instance.new("BodyForce")
		bf.Name = "WebBloxGearForce"
		local g = 196.2
		pcall(function() g = workspace.Gravity end)
		bf.force = Vector3.new(0, mass * g * effect.antigravity, 0)
		bf.Parent = torso
	end
end
local function giveGear()
	local backpack = player:FindFirstChild("Backpack") or player:WaitForChild("Backpack", 10)
	if not backpack or not WB.look or not WB.look.gear then return end
	for _, id in ipairs(WB.look.gear) do
		local spec = GEAR[id]
		if spec and spec.pieces and not backpack:FindFirstChild(spec.name or id) then
			local tool = Instance.new("Tool")
			tool.Name = spec.name or id
			pcall(function() tool.CanBeDropped = false end)
			local handle
			for i, piece in ipairs(spec.pieces) do
				local p = buildPiece(piece, i == 1 and "Handle" or ("Part" .. i))
				p.Parent = tool
				if i == 1 then handle = p else weldTo(handle, p, pieceC0(piece), piece.spin) end
			end
			-- switching tools can fire the new tool's Equipped before the old one's Unequipped
			tool.Equipped:connect(function() activeGear = tool gearEffect(spec.effect, true) end)
			tool.Unequipped:connect(function()
				if activeGear == tool then activeGear = nil gearEffect(spec.effect, false) end
			end)
			tool.Parent = backpack
		end
	end
end
player.CharacterAdded:connect(function() wait(0.5) giveGear() end)
if player.Character then spawn(giveGear) end

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
-- Chat: yours and other players' messages go in the game's chat window (play.html hooks the
-- engine's Chat module up to WebBlox.ChatMessage), with a speech bubble over the speaker. (In
-- public servers the hub masks swear words before passing a message on.)
local chatEvent = Instance.new("BindableEvent")
chatEvent.Name = "ChatMessage"
chatEvent.Parent = shared
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
local myName = mpInfo.name or "Player"
local outbox = {}
player.Chatted:connect(function(msg)
	if string.sub(msg, 1, 1) == "/" then return end
	msg = string.sub(msg, 1, 120)
	if online then table.insert(outbox, msg) end
	chatEvent:Fire(myName, msg)
	local head = player.Character and player.Character:FindFirstChild("Head")
	if head then speechBubble(head, msg) end
end)

-- Bottom left: multiplayer status, ping and frame rate. The frame rate also goes to the page
-- every 2 seconds, where Auto graphics uses it.
local status = Instance.new("TextLabel")
status.Name = "WebBloxMultiplayer"
status.BackgroundTransparency = 0.5
status.BackgroundColor3 = Color3.new(0, 0, 0)
status.TextColor3 = Color3.new(1, 1, 1)
status.BorderSizePixel = 0
status.Size = UDim2.new(0, 230, 0, 22)
status.Position = UDim2.new(0, 8, 1, -30)
status.FontSize = Enum.FontSize.Size14
status.Parent = game:GetService("CoreGui"):WaitForChild("RobloxGui")
local netText = online and "Multiplayer: connecting..." or "Single player"
local ping, fps = nil, nil
local function refreshStatus()
	local text = netText
	if ping then text = text .. "   |   Ping: " .. ping .. " ms" end
	if fps then text = text .. "   |   " .. fps .. " FPS" end
	status.Text = text
	status.Size = UDim2.new(0, math.max(150, status.TextBounds.X + 20), 0, 22)
end
local function setStatus(text)
	netText = text
	refreshStatus()
end
refreshStatus()
do
	local frames = 0
	RunService.RenderStepped:connect(function() frames = frames + 1 end)
	spawn(function()
		while true do
			local t0 = tick()
			frames = 0
			wait(2)
			fps = math.floor(frames / math.max(0.5, tick() - t0) + 0.5)
			refreshStatus()
			local n = fps
			spawn(function() pcall(function() game:HttpGetAsync("https://webblox.signal/fps/" .. n) end) end)
		end
	end)
end

---------------------------------------------------------------------------------------------
-- Lite multiplayer
local mp = WB.mp
if not online then return end

local myId = mp.id or ""
if not string.match(myId, "^[a-z0-9]+$") or #myId < 6 then
	math.randomseed(tick() * 1000 % 2147483647)
	myId = ""
	for _ = 1, 10 do myId = myId .. string.char(math.random(97, 122)) end
end

local function enc(s)
	return (string.gsub(tostring(s), "[^%w%-_%.]", function(c) return string.format("%%%02X", string.byte(c)) end))
end

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

-- footsteps and jumps for other players' avatars (your own character's sounds come from the
-- engine's character Sound script)
local function puppetSounds(o, animName)
	local head = o.model:FindFirstChild("Head")
	if not head then return end
	if not o.steps then
		o.steps = Instance.new("Sound")
		o.steps.SoundId = "rbxasset://sounds/action_footsteps_plastic.mp3"
		o.steps.Looped = true
		o.steps.Volume = 0.45
		o.steps.Parent = head
	end
	local walking = animName == "walk" or animName == "climb"
	if walking and not o.steps.IsPlaying then o.steps:Play() elseif not walking and o.steps.IsPlaying then o.steps:Stop() end
	if animName == "jump" then
		local s = Instance.new("Sound")
		s.SoundId = "rbxasset://sounds/action_jump.mp3"
		s.Volume = 0.45
		s.Parent = head
		s:Play()
		delay(2, function() s:Destroy() end)
	end
end

local function playOn(o, animName)
	if o.animName == animName then return end
	o.animName = animName
	pcall(puppetSounds, o, animName)
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

local function bubble(id, name, text)
	local o = others[id]
	local head = o and o.model:FindFirstChild("Head")
	chatEvent:Fire(name ~= "" and name or (o and o.model.Name) or "Someone", text)
	if head then speechBubble(head, text) end
end

-- Admin commands from the site's owner / moderators (p2p.js checks they're signed by one; X| lines)
local function adminAction(line)
	local f = {}
	for v in string.gmatch(line .. "|", "([^|]*)|") do f[#f + 1] = v end
	local what = f[1]
	local char = player.Character
	local hum = char and char:FindFirstChild("Humanoid")
	local root = char and (char:FindFirstChild("HumanoidRootPart") or char:FindFirstChild("Torso"))
	if what == "say" then
		chatEvent:Fire("GN-BLOX", f[2] or "")
	elseif what == "msg" or what == "hint" then
		local m = Instance.new(what == "msg" and "Message" or "Hint")
		m.Text = ((f[2] or "") ~= "" and (f[2] .. ": ") or "") .. (f[3] or "")
		m.Parent = workspace
		delay(what == "msg" and 6 or 8, function() pcall(function() m:Destroy() end) end)
	elseif what == "kill" then
		if hum then hum.Health = 0 end
	elseif what == "respawn" then
		pcall(function() player:LoadCharacter() end)
	elseif what == "speed" then
		if hum then hum.WalkSpeed = tonumber(f[2]) or 16 end
	elseif what == "god" then
		if hum then hum.MaxHealth = math.huge hum.Health = math.huge end
	elseif what == "ungod" then
		if hum then hum.MaxHealth = 100 hum.Health = 100 end
	elseif what == "freeze" or what == "thaw" then
		if root then root.Anchored = (what == "freeze") end
	elseif what == "tpto" then
		local o = others[f[2] or ""]
		if root and o and o.root and o.root.Parent then root.CFrame = o.root.CFrame * CFrame.new(0, 0, 4) end
	end
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
	local sent = tick()
	local ok, body = pcall(function() return game:HttpGetAsync(url) end)
	if ok and type(body) == "string" and string.find(body, "S|") then
		failures = 0
		local count, note, serverNo, latency = 0, nil, nil, nil
		for line in string.gmatch(body, "[^\n]+") do
			local kind = string.sub(line, 1, 2)
			if kind == "M|" then
				note = string.sub(line, 3)
			elseif kind == "N|" then
				serverNo = tonumber(string.sub(line, 3))
			elseif kind == "L|" then
				-- peer-to-peer: the round trip to the server's host (0 if that's you)
				latency = tonumber(string.sub(line, 3))
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
				local seq, oid, name, text = string.match(line, "^C|(%d+)|([^|]+)|([^|]*)|(.*)$")
				seq = tonumber(seq)
				if seq and lastSeq >= 0 and not seenChat[seq] then
					seenChat[seq] = true
					bubble(oid, name, text)
				end
			elseif kind == "X|" then
				pcall(adminAction, string.sub(line, 3))
			elseif kind == "S|" then
				local seq = tonumber(string.sub(line, 3))
				if seq and seq > lastSeq then lastSeq = seq end
			end
		end
		-- with a multiplayer server, the request itself is the round trip
		ping = latency or (not string.find(mp.url, "/peer-sync/", 1, true) and math.floor((tick() - sent) * 1000 + 0.5)) or nil
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
		ping = nil
		local p2p = string.find(mp.url, "/peer-sync/", 1, true)
		setStatus(failures > 3 and (p2p and "Multiplayer: reconnecting..." or "Multiplayer: waking up the server...") or "Multiplayer: connecting...")
		-- don't hold up timed rounds forever if we can't reach anyone
		if failures > 10 then clockReady.Value = true end
	end
	wait(ok and 0.12 or math.min(5, 0.5 * failures))
end
