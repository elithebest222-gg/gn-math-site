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
--
-- and lets the place's scripts talk to the other players' games (each has its own world):
--   Send (BindableEvent)      WebBlox.Send:Fire(topic, data): a message for everyone else in the
--                             server (topic: letters, digits, _ . -; data: text, up to 400 chars)
--   Message (BindableEvent)   WebBlox.Message.Event:connect(function(topic, data, fromId, fromName))
--   SetShared (BindableEvent) WebBlox.SetShared:Fire(key, value): a value the whole server shares
--   Shared (Folder)           those values, as StringValues named by key ("" removes one); players
--                             who join later get them too, and everyone ends up with the same ones
--   MyId (StringValue)        your player id ("solo" with no multiplayer). Other players' avatars,
--                             and your own character, have a GNPlayerId StringValue with theirs.

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

-- game messages and shared values (sent with each sync below; see the header)
local gameOut, sharedOut = {}, {}
local function bindable(name)
	local b = Instance.new("BindableEvent")
	b.Name = name
	b.Parent = shared
	return b
end
local sendEvent, messageEvent, setSharedEvent = bindable("Send"), bindable("Message"), bindable("SetShared")
local sharedFolder = Instance.new("Folder")
sharedFolder.Name = "Shared"
sharedFolder.Parent = shared
local myIdValue = sharedValue("StringValue", "MyId", online and "" or "solo")
local function cleanKey(t)
	t = tostring(t or "")
	if #t < 1 or #t > 32 or not string.match(t, "^[%w_%.%-]+$") then return nil end
	return t
end
local function oneLine(v, n) return string.sub((string.gsub(tostring(v == nil and "" or v), "[\r\n]", " ")), 1, n) end
local function setLocalShared(key, value)
	local v = sharedFolder:FindFirstChild(key)
	if value == "" then
		if v then v:Destroy() end
	elseif not v then
		v = Instance.new("StringValue")
		v.Name = key
		v.Value = value
		v.Parent = sharedFolder
	elseif v.Value ~= value then
		v.Value = value
	end
end
sendEvent.Event:connect(function(topic, data)
	topic = cleanKey(topic)
	if topic and online and #gameOut < 100 then table.insert(gameOut, topic .. "|" .. oneLine(data, 400)) end
end)
setSharedEvent.Event:connect(function(key, value)
	key = cleanKey(key)
	if not key then return end
	value = oneLine(value, 200)
	setLocalShared(key, value)
	if online then
		for i, x in ipairs(sharedOut) do if x[1] == key then table.remove(sharedOut, i) break end end   -- (only the latest)
		table.insert(sharedOut, { key, value })
	end
end)
local function tagPlayerId(model, id)
	local v = model:FindFirstChild("GNPlayerId")
	if not v then
		v = Instance.new("StringValue")
		v.Name = "GNPlayerId"
		v.Parent = model
	end
	v.Value = id
end
player.CharacterAdded:connect(function(c) tagPlayerId(c, myIdValue.Value) end)
if player.Character then tagPlayerId(player.Character, myIdValue.Value) end
myIdValue.Changed:connect(function() if player.Character then tagPlayerId(player.Character, myIdValue.Value) end end)
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

-- Hats, hair and other accessories with meshes (WB.acc, from the Catalog's .rbxm items): a Handle
-- with the item's mesh, welded where its attachment sits on the classic body (c0, worked out by
-- tools/build_catalog.py). One per slot: hat, hair, glasses (face), back (body).
local ACC = WB.acc or {}
local ACC_MODEL = { hat = "WebBloxHat", hair = "WebBloxHair", glasses = "WebBloxGlasses", back = "WebBloxBack" }
local function setAccessory(character, slot, key)
	local old = character:FindFirstChild(ACC_MODEL[slot])
	if old then old:Destroy() end
	local a = ACC[key or ""]
	local base = a and character:FindFirstChild(a.part or "Head")
	if not base then return end
	local model = Instance.new("Model")
	model.Name = ACC_MODEL[slot]
	local h = Instance.new("Part")
	pcall(function() h.FormFactor = Enum.FormFactor.Custom end)
	h.Name = "Handle"
	h.Size = Vector3.new(a.size[1], a.size[2], a.size[3])
	h.CanCollide = false
	h.TopSurface = Enum.SurfaceType.Smooth
	h.BottomSurface = Enum.SurfaceType.Smooth
	pcall(function() h.CustomPhysicalProperties = PhysicalProperties.new(0.01, 0, 0) end)
	local m = Instance.new("SpecialMesh")
	m.MeshType = Enum.MeshType.FileMesh
	m.MeshId = "http://www.roblox.com/asset/?id=" .. a.mesh
	if a.tex and a.tex ~= "" then m.TextureId = "http://www.roblox.com/asset/?id=" .. a.tex end
	m.Scale = Vector3.new(a.scale[1], a.scale[2], a.scale[3])
	m.Offset = Vector3.new(a.offset[1], a.offset[2], a.offset[3])
	m.VertexColor = Vector3.new(a.vc[1], a.vc[2], a.vc[3])
	m.Parent = h
	local c = a.c0
	weldTo(base, h, CFrame.new(c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], c[12]))
	h.Parent = model
	model.Parent = character
end

local function setHat(character, hatName)
	local old = character:FindFirstChild("WebBloxHat")
	if old then old:Destroy() end
	if ACC[hatName or ""] then return setAccessory(character, "hat", hatName) end
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

-- Catalog faces and clothes (asset ids; the service worker serves catalog/assets/<id>.png). Only
-- what's worn changes: a game's own uniforms stay when you aren't wearing any clothes from the Catalog.
local ASSET = "http://www.roblox.com/asset/?id="
local function wearImages(character, look)
	local head = character:FindFirstChild("Head")
	local face = head and head:FindFirstChild("face")
	if face and look.face and look.face ~= "" then face.Texture = ASSET .. look.face end
	for _, kind in ipairs({ "Shirt", "Pants" }) do
		local id = look[kind == "Shirt" and "shirtTex" or "pantsTex"]
		if id and id ~= "" then
			local c = character:FindFirstChild(kind)
			if not c or not c:IsA(kind) then
				c = Instance.new(kind)
				c.Name = kind
				c.Parent = character
			end
			local url = ASSET .. id
			if kind == "Shirt" then
				if c.ShirtTemplate ~= url then c.ShirtTemplate = url end
			elseif c.PantsTemplate ~= url then
				c.PantsTemplate = url
			end
		end
	end
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
	for _, slot in ipairs({ "hair", "glasses", "back" }) do
		if look[slot] ~= nil then setAccessory(character, slot, look[slot]) end
	end
	wearImages(character, look)
end

-- Your own character: wear the Catalog outfit (re-applied for a while, because the engine
-- paints default body colors onto new characters shortly after they spawn).
local function hasLook(look)
	return look and (look.hat or look.skin or look.shirt or look.pants or look.face or look.shirtTex or look.pantsTex or look.hair or look.glasses or look.back)
end
local function dressMe(character)
	if not hasLook(WB.look) then return end
	character:WaitForChild("Head")
	for _ = 1, 10 do
		applyLook(character, { skin = WB.look.skin, shirt = WB.look.shirt, pants = WB.look.pants, face = WB.look.face, shirtTex = WB.look.shirtTex, pantsTex = WB.look.pantsTex })
		wait(0.5)
	end
	setHat(character, WB.look.hat)
	for _, slot in ipairs({ "hair", "glasses", "back" }) do setAccessory(character, slot, WB.look[slot]) end
end
player.CharacterAdded:connect(function(c) dressMe(c) end)
if player.Character then spawn(function() dressMe(player.Character) end) end

-- Never fall forever. Some uploaded games spawn you over nothing (a spawn you fall through, no floor
-- where you appear), or put the void miles down. If you haven't landed since you spawned and you're
-- falling with nothing below, you're put on the place's biggest floor; if you've been falling with
-- nothing below for 5 seconds, back where you last stood. (An ordinary fall off a map still ends the
-- usual way: the void is reached well before that.)
-- the first solid part below (rays hit parts you can walk through too, like a spawn you fall through)
local function solidBelow(root, char, dist)
	local ignore = { char }
	for _ = 1, 8 do
		local hit = workspace:FindPartOnRayWithIgnoreList(Ray.new(root.Position, Vector3.new(0, -dist, 0)), ignore)
		if not hit or hit.CanCollide then return hit end
		table.insert(ignore, hit)
	end
	return nil
end
-- (a short ray down from the root: the 2016 Humanoid's FloorMaterial doesn't turn to Air in the air)
local function onGround(hum, root, char) return solidBelow(root, char, 4.5) ~= nil end
local function nothingBelow(root, char) return solidBelow(root, char, 999) == nil end
local function safeSpot()
	local best, area = nil, 0
	local function scan(o)
		for _, c in pairs(o:GetChildren()) do
			if c:IsA("BasePart") then
				if c.CanCollide and c.Transparency < 0.95 and c.Size.Y < 60 and c.Size.X * c.Size.Z > area then best, area = c, c.Size.X * c.Size.Z end
			elseif not c:FindFirstChild("Humanoid") then
				scan(c)
			end
		end
	end
	scan(workspace)
	return best and (best.Position + Vector3.new(0, best.Size.Y / 2, 0))
end
local function watchFalls(char)
	local hum = char:WaitForChild("Humanoid")
	local root = char:WaitForChild("HumanoidRootPart")
	-- (CharacterAdded comes before the character is put in the world)
	for _ = 1, 100 do if char.Parent then break end wait(0.1) end
	local landed, last, fallSince = false, nil, nil
	while char.Parent and hum.Health > 0 do
		wait(0.25)
		if onGround(hum, root, char) then
			landed, last, fallSince = true, root.Position, nil
		elseif root.Velocity.Y < -25 and nothingBelow(root, char) then
			fallSince = fallSince or tick()
			if tick() - fallSince > (landed and 5 or 1.2) then
				local to = landed and last or safeSpot()
				if to then
					root.Velocity = Vector3.new(0, 0, 0)
					root.CFrame = CFrame.new(to + Vector3.new(0, 4, 0))
				end
				fallSince = nil
			end
		else
			fallSince = nil
		end
	end
end
player.CharacterAdded:connect(function(c) watchFalls(c) end)
if player.Character then spawn(function() watchFalls(player.Character) end) end

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
myIdValue.Value = myId

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
	local hat = (WB.look and (HATS[WB.look.hat or ""] or ACC[WB.look.hat or ""])) and WB.look.hat or "none"
	local lk = WB.look or {}
	-- + face, shirt and pants (Catalog asset ids, 0 = none), then hair, glasses and back accessories
	local acc = function(slot) return ACC[lk[slot] or ""] and lk[slot] or "none" end
	return string.format("%.2f,%.2f,%.2f,%.3f,%s,%d,%d,%d,%d,%d,%d,%s,%s,%s,%s,%s,%s,%s", p.X, p.Y, p.Z,
		math.atan2(-look.X, -look.Z), WB.anim or "idle", colors[1], colors[2], colors[3], colors[4], colors[5], colors[6], hat,
		lk.face or "0", lk.shirtTex or "0", lk.pantsTex or "0", acc("hair"), acc("glasses"), acc("back"))
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

-- The site's owner and moderators wear the GN logo above their head
local ROLE_ICONS = { owner = "rbxasset://textures/ui/gn-owner.png", mod = "rbxasset://textures/ui/gn-mod.png" }
local function roleBadge(model, role)
	local head = model and model:FindFirstChild("Head")
	if not head then return end
	local old = head:FindFirstChild("GNRoleTag")
	local icon = role and ROLE_ICONS[string.lower(role)]
	if not icon then if old then old:Destroy() end return end
	if old and old:FindFirstChild("Icon") and old.Icon.Image == icon then return end
	if old then old:Destroy() end
	local bb = Instance.new("BillboardGui")
	bb.Name = "GNRoleTag"
	bb.Size = UDim2.new(0, 30, 0, 30)
	bb.StudsOffset = Vector3.new(0, 3.1, 0)
	bb.AlwaysOnTop = true
	local img = Instance.new("ImageLabel")
	img.Name = "Icon"
	img.BackgroundTransparency = 1
	img.Size = UDim2.new(1, 0, 1, 0)
	img.Image = icon
	img.Parent = bb
	bb.Parent = head
end
if WB.role then   -- your own badge
	local function badgeMe(c) c:WaitForChild("Head") roleBadge(c, WB.role) end
	player.CharacterAdded:connect(badgeMe)
	if player.Character then spawn(function() badgeMe(player.Character) end) end
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
		tagPlayerId(model, id)
		o = { model = model, root = root, hum = hum }
		others[id] = o
		root.CFrame = CFrame.new(x, y, z) * CFrame.Angles(0, yaw, 0)
	end
	o.seen = tick()
	o.target = CFrame.new(x, y, z) * CFrame.Angles(0, yaw, 0)
	local role, plain = string.match(name, "^%[(%a+)%] (.*)$")
	local shown = plain or name
	if o.model.Name ~= shown then o.model.Name = shown end
	if o.role ~= role then o.role = role roleBadge(o.model, role) end
	local key = table.concat(f, ",", 6, math.min(#f, 18))
	if o.lookKey ~= key then
		o.lookKey = key
		local colors = { tonumber(f[6]), tonumber(f[7]), tonumber(f[8]), tonumber(f[9]), tonumber(f[10]), tonumber(f[11]) }
		for i, partName in ipairs(BODY) do
			local part = o.model:FindFirstChild(partName)
			if part and colors[i] then part.BrickColor = BrickColor.new(colors[i]) end
		end
		setHat(o.model, f[12])
		local img = function(v) return v and v ~= "0" and string.match(v, "^%d+$") and v or nil end
		wearImages(o.model, { face = img(f[13]), shirtTex = img(f[14]), pantsTex = img(f[15]) })
		setAccessory(o.model, "hair", f[16])
		setAccessory(o.model, "glasses", f[17])
		setAccessory(o.model, "back", f[18])
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
local admin = { loopkill = false, noclip = false, fly = nil, jail = nil, hidden = nil }
local function myParts(char)
	local out = {}
	local function walk(o) for _, c in pairs(o:GetChildren()) do if c:IsA("BasePart") then table.insert(out, c) end walk(c) end end
	if char then walk(char) end
	return out
end
local function removeNamed(parent, name)
	if not parent then return end
	for _, c in pairs(parent:GetChildren()) do if c.Name == name then c:Destroy() end end
end
local function effect(char, class, on)
	local torso = char and char:FindFirstChild("Torso")
	if not torso then return end
	removeNamed(torso, "GNAdmin" .. class)
	if on then
		local e = Instance.new(class)
		e.Name = "GNAdmin" .. class
		if class == "PointLight" then e.Range = 18 e.Brightness = 3 end
		e.Parent = torso
	end
end
local function setFly(on)
	local char = player.Character
	local root = char and (char:FindFirstChild("HumanoidRootPart") or char:FindFirstChild("Torso"))
	local hum = char and char:FindFirstChild("Humanoid")
	if admin.fly then admin.fly.conn:disconnect() pcall(function() admin.fly.gyro:Destroy() admin.fly.vel:Destroy() end) admin.fly = nil end
	if hum then hum.PlatformStand = false end
	if not (on and root and hum) then return end
	local gyro = Instance.new("BodyGyro")
	gyro.maxTorque = Vector3.new(4e5, 4e5, 4e5) gyro.P = 9e4 gyro.cframe = root.CFrame gyro.Parent = root
	local vel = Instance.new("BodyVelocity")
	vel.maxForce = Vector3.new(4e5, 4e5, 4e5) vel.velocity = Vector3.new() vel.Parent = root
	hum.PlatformStand = true
	local UIS = game:GetService("UserInputService")
	local function down(k) local ok, r = pcall(function() return UIS:IsKeyDown(k) end) return ok and r end
	local conn = RunService.RenderStepped:connect(function()
		local cam = workspace.CurrentCamera
		if not (cam and root.Parent) then return end
		local cf = cam.CoordinateFrame
		local dir = Vector3.new()
		if down(Enum.KeyCode.W) then dir = dir + cf.lookVector end
		if down(Enum.KeyCode.S) then dir = dir - cf.lookVector end
		if down(Enum.KeyCode.D) then dir = dir + cf.rightVector end
		if down(Enum.KeyCode.A) then dir = dir - cf.rightVector end
		if down(Enum.KeyCode.Space) then dir = dir + Vector3.new(0, 1, 0) end
		if dir.magnitude > 0 then dir = dir.unit end
		vel.velocity = dir * 60
		gyro.cframe = cf
	end)
	admin.fly = { conn = conn, gyro = gyro, vel = vel }
end
RunService.Stepped:connect(function()
	if not admin.noclip then return end
	for _, p in ipairs(myParts(player.Character)) do p.CanCollide = false end
end)
player.CharacterAdded:connect(function(c)
	admin.fly = nil
	if admin.loopkill then
		local hum = c:WaitForChild("Humanoid")
		wait(1)
		if admin.loopkill then hum.Health = 0 end
	end
end)
local function jail(on)
	if admin.jail then admin.jail:Destroy() admin.jail = nil end
	local char = player.Character
	local root = char and (char:FindFirstChild("HumanoidRootPart") or char:FindFirstChild("Torso"))
	if not (on and root) then return end
	local m = Instance.new("Model")
	m.Name = "GNJail"
	local c = root.Position - Vector3.new(0, 2.5, 0)
	local function bar(pos, size, transparency)
		local b = Instance.new("Part")
		b.Anchored = true b.FormFactor = Enum.FormFactor.Custom b.Size = size b.CFrame = CFrame.new(c + pos)
		b.BrickColor = BrickColor.new("Really black") b.Transparency = transparency or 0 b.TopSurface = 0 b.BottomSurface = 0
		b.Parent = m
	end
	bar(Vector3.new(0, 0, 0), Vector3.new(8, 1, 8))
	bar(Vector3.new(0, 8, 0), Vector3.new(8, 1, 8))
	for i = -3, 3, 2 do
		bar(Vector3.new(i, 4, 3.5), Vector3.new(0.4, 7, 0.4)) bar(Vector3.new(i, 4, -3.5), Vector3.new(0.4, 7, 0.4))
		bar(Vector3.new(3.5, 4, i), Vector3.new(0.4, 7, 0.4)) bar(Vector3.new(-3.5, 4, i), Vector3.new(0.4, 7, 0.4))
	end
	for _, side in ipairs({ Vector3.new(0, 4, 4), Vector3.new(0, 4, -4), Vector3.new(4, 4, 0), Vector3.new(-4, 4, 0) }) do
		bar(side, Vector3.new(side.X ~= 0 and 0.2 or 8, 7, side.Z ~= 0 and 0.2 or 8), 1)
	end
	m.Parent = workspace
	admin.jail = m
	root.CFrame = CFrame.new(c + Vector3.new(0, 3.5, 0))
end
local function giveBuildTools()
	local pack = player:FindFirstChild("Backpack")
	if not pack then return end
	for _, kind in ipairs({ { "Grab", 2 }, { "Clone", 3 }, { "Delete", 4 } }) do
		local h = Instance.new("HopperBin")
		h.Name = kind[1]
		pcall(function() h.BinType = kind[2] end)
		h.Parent = pack
	end
end
local countdownId = 0
local function adminAction(line)
	local f = {}
	for v in string.gmatch(line .. "|", "([^|]*)|") do f[#f + 1] = v end
	local what, arg = f[1], f[2]
	local n = tonumber(arg)
	local char = player.Character
	local hum = char and char:FindFirstChild("Humanoid")
	local root = char and (char:FindFirstChild("HumanoidRootPart") or char:FindFirstChild("Torso"))
	local torso = char and char:FindFirstChild("Torso")
	if what == "say" then
		chatEvent:Fire("GN-BLOX", arg or "")
	elseif what == "msg" or what == "hint" then
		local m = Instance.new(what == "msg" and "Message" or "Hint")
		m.Text = ((arg or "") ~= "" and (arg .. ": ") or "") .. (f[3] or "")
		m.Parent = workspace
		delay(what == "msg" and 6 or 8, function() pcall(function() m:Destroy() end) end)
	elseif what == "countdown" then
		countdownId = countdownId + 1
		local my = countdownId
		spawn(function()
			local h = Instance.new("Hint")
			h.Parent = workspace
			for i = math.floor(n or 10), 1, -1 do
				if my ~= countdownId then break end
				h.Text = tostring(i)
				wait(1)
			end
			h:Destroy()
		end)
	elseif what == "time" then
		pcall(function() game:GetService("Lighting"):SetMinutesAfterMidnight((n or 14) * 60) end)
	elseif what == "fog" then
		local L = game:GetService("Lighting")
		L.FogStart = 0 L.FogEnd = n or 100000
	elseif what == "kill" then
		if hum then hum.Health = 0 end
	elseif what == "explode" then
		if root then local e = Instance.new("Explosion") e.Position = root.Position e.BlastRadius = 6 e.Parent = workspace end
	elseif what == "respawn" then
		pcall(function() player:LoadCharacter() end)
	elseif what == "loopkill" or what == "unloopkill" then
		admin.loopkill = what == "loopkill"
		if admin.loopkill and hum then hum.Health = 0 end
	elseif what == "heal" then
		if hum then hum.Health = hum.MaxHealth end
	elseif what == "damage" then
		if hum then hum:TakeDamage(n or 25) end
	elseif what == "health" then
		if hum then hum.MaxHealth = math.max(1, n or 100) hum.Health = hum.MaxHealth end
	elseif what == "god" then
		if hum then hum.MaxHealth = math.huge hum.Health = math.huge end
	elseif what == "ungod" then
		if hum then hum.MaxHealth = 100 hum.Health = 100 end
	elseif what == "ff" or what == "unff" then
		if char then removeNamed(char, "ForceField") if what == "ff" then Instance.new("ForceField", char) end end
	elseif what == "speed" then
		if hum then hum.WalkSpeed = math.max(0, n or 16) end
	elseif what == "jumppower" then
		if hum then pcall(function() hum.JumpPower = math.max(0, n or 50) end) end
	elseif what == "gravity" or what == "ungravity" then
		if torso then
			removeNamed(torso, "GNAdminGravity")
			if what == "gravity" then
				local mass = 0
				for _, p in ipairs(myParts(char)) do mass = mass + p:GetMass() end
				local bf = Instance.new("BodyForce")
				bf.Name = "GNAdminGravity"
				bf.force = Vector3.new(0, mass * (196.2 - (n or 196.2)), 0)
				bf.Parent = torso
			end
		end
	elseif what == "fly" or what == "unfly" then
		setFly(what == "fly")
	elseif what == "noclip" or what == "clip" then
		admin.noclip = what == "noclip"
		if not admin.noclip and torso then torso.CanCollide = true end
	elseif what == "sit" then
		if hum then hum.Sit = true end
	elseif what == "jump" then
		if hum then hum.Jump = true end
	elseif what == "trip" then
		if hum and torso then
			hum.PlatformStand = true
			torso.CFrame = torso.CFrame * CFrame.Angles(math.rad(90), 0, 0)
			delay(1.5, function() if hum.Parent then hum.PlatformStand = false end end)
		end
	elseif what == "stun" or what == "unstun" then
		if hum then hum.PlatformStand = (what == "stun") end
	elseif what == "freeze" or what == "thaw" then
		if root then root.Anchored = (what == "freeze") end
		for _, p in ipairs(myParts(char)) do if p.Name ~= "HumanoidRootPart" then p.Anchored = (what == "freeze") end end
	elseif what == "spin" or what == "unspin" then
		if torso then
			removeNamed(torso, "GNAdminSpin")
			if what == "spin" then
				local s = Instance.new("BodyAngularVelocity")
				s.Name = "GNAdminSpin" s.maxTorque = Vector3.new(0, 4e5, 0) s.angularvelocity = Vector3.new(0, 20, 0) s.Parent = torso
			end
		end
	elseif what == "invisible" or what == "visible" then
		local hide = what == "invisible"
		if hide and not admin.hidden then admin.hidden = {} end
		for _, p in ipairs(myParts(char)) do
			if p.Name ~= "HumanoidRootPart" then
				if hide then admin.hidden[p] = admin.hidden[p] or p.Transparency p.Transparency = 1
				elseif admin.hidden and admin.hidden[p] then p.Transparency = admin.hidden[p] end
			end
			for _, d in pairs(p:GetChildren()) do if d:IsA("Decal") then d.Transparency = hide and 1 or 0 end end
		end
		if not hide then admin.hidden = nil end
	elseif what == "fire" or what == "unfire" then effect(char, "Fire", what == "fire")
	elseif what == "smoke" or what == "unsmoke" then effect(char, "Smoke", what == "smoke")
	elseif what == "sparkles" or what == "unsparkles" then effect(char, "Sparkles", what == "sparkles")
	elseif what == "light" or what == "unlight" then effect(char, "PointLight", what == "light")
	elseif what == "jail" or what == "unjail" then
		jail(what == "jail")
	elseif what == "btools" then
		giveBuildTools()
	elseif what == "removetools" then
		local pack = player:FindFirstChild("Backpack")
		if pack then for _, t in pairs(pack:GetChildren()) do if t:IsA("Tool") or t:IsA("HopperBin") then t:Destroy() end end end
		if char then for _, t in pairs(char:GetChildren()) do if t:IsA("Tool") then t:Destroy() end end end
	elseif what == "tpto" then
		local o = others[arg or ""]
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
local lastG, lastV = -1, 0   -- the last game message / shared-value version heard
while true do
	local state = myState()
	local chat = table.remove(outbox, 1)
	-- up to 8 game messages and 8 shared values go with each sync (put back if it fails)
	local sendG, sendV, extra = {}, {}, {}
	for _ = 1, 8 do local m = table.remove(gameOut, 1) if not m then break end sendG[#sendG + 1] = m extra[#extra + 1] = "&g=" .. enc(m) end
	for _ = 1, 8 do local m = table.remove(sharedOut, 1) if not m then break end sendV[#sendV + 1] = m extra[#extra + 1] = "&v=" .. enc(m[1] .. "|" .. m[2]) end
	local url = mp.url .. "/sync?room=" .. enc(mp.room) .. "&id=" .. myId .. "&name=" .. enc(mp.name)
		.. "&ack=" .. lastSeq .. (state and ("&s=" .. enc(state)) or "") .. "&l=" .. enc(myStats())
		.. (chat and ("&c=" .. enc(chat)) or "") .. "&ga=" .. lastG .. "&va=" .. lastV .. table.concat(extra)
	local sent = tick()
	local ok, body = pcall(function() return game:HttpGetAsync(url) end)
	if ok and type(body) == "string" and string.find(body, "S|") then
		failures = 0
		local count, note, serverNo, latency = 0, nil, nil, nil
		local gotG, highG = {}, nil
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
			elseif kind == "G|" then
				local seq, oid, name, topic, data = string.match(line, "^G|(%d+)|([^|]+)|([^|]*)|([^|]+)|(.*)$")
				seq = tonumber(seq)
				if seq and lastG >= 0 and seq > lastG then gotG[#gotG + 1] = { seq, topic, data, oid, name } end
			elseif kind == "V|" then
				local ver, key, value = string.match(line, "^V|(%d+)|([^|]+)|(.*)$")
				ver = tonumber(ver)
				if ver then
					local pending = false
					for _, x in ipairs(sharedOut) do if x[1] == key then pending = true end end
					if not pending then setLocalShared(key, value) end
					if ver > lastV then lastV = ver end
				end
			elseif kind == "H|" then
				highG = tonumber(string.match(line, "^H|(%d+)"))
			elseif kind == "S|" then
				local seq = tonumber(string.sub(line, 3))
				if seq and seq > lastSeq then lastSeq = seq end
			end
		end
		-- game messages, oldest first (the first sync only learns where the room is up to)
		table.sort(gotG, function(a, b) return a[1] < b[1] end)
		for _, m in ipairs(gotG) do
			if m[1] > lastG then
				lastG = m[1]
				messageEvent:Fire(m[2], m[3], m[4], m[5])
			end
		end
		if highG and (lastG < 0 or highG < lastG - 100000) then lastG = highG end
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
		for i = #sendG, 1, -1 do table.insert(gameOut, 1, sendG[i]) end
		for i = #sendV, 1, -1 do
			local queued = false
			for _, x in ipairs(sharedOut) do if x[1] == sendV[i][1] then queued = true end end
			if not queued then table.insert(sharedOut, 1, sendV[i]) end
		end
		local p2p = string.find(mp.url, "/peer-sync/", 1, true)
		setStatus(failures > 3 and (p2p and "Multiplayer: reconnecting..." or "Multiplayer: waking up the server...") or "Multiplayer: connecting...")
		-- don't hold up timed rounds forever if we can't reach anyone
		if failures > 10 then clockReady.Value = true end
	end
	wait(ok and 0.12 or math.min(5, 0.5 * failures))
end
