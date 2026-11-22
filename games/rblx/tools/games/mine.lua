-- Dig Deep (tools/build_games.py): dig down through the layers, fill your backpack with ore, sell
-- it at the surface, buy better pickaxes and bigger backpacks, and rebirth for a bigger multiplier.
--
-- Everyone digs their own mine (a new one every visit and every rebirth), and progress is saved.
-- Click a block to hit it (ReplicatedStorage.WebBlox.Click, scripts/WebBloxPlayers.lua). Q or the
-- Sell button takes you up to sell, E or Back down takes you back to where you were digging.
-- Rare finds and new depths go in everyone's feed (NET).
local Players = game:GetService("Players")
local store = game:GetService("ReplicatedStorage")
local surface = workspace:WaitForChild("Surface")
local spawnPad = surface:WaitForChild("Spawn")
local sellPad = surface:WaitForChild("SellPad")
local pickPad = surface:WaitForChild("PickPad")
local bagPad = surface:WaitForChild("BagPad")
local rebirthPad = surface:WaitForChild("RebirthPad")

local B = 6               -- a block is B studs on each side
local N = 14              -- the mine is N x N blocks
local HALF = N * B / 2
local TOP = 0             -- the surface (top of the first layer)
local BEDROCK = 290       -- nothing gets through this layer

local function wb(name) local f = store:FindFirstChild("WebBlox") return f and f:FindFirstChild(name) end
local function money(n)
	n = math.floor(n)
	local s = tostring(n)
	while true do
		local k
		s, k = string.gsub(s, "^(-?%d+)(%d%d%d)", "%1,%2")
		if k == 0 then break end
	end
	return "$" .. s
end

-- ---------------------------------------------------------------- what's down there
local LAYERS = {
	{ from = 0, name = "Grass", hp = 2, value = 1, color = 37, mat = "Grass", sound = "grass" },
	{ from = 1, name = "Topsoil", hp = 3, value = 1, color = 192, mat = "Sand", sound = "grassstone" },
	{ from = 12, name = "Stone", hp = 6, value = 2, color = 194, mat = "Slate", sound = "stone" },
	{ from = 40, name = "Deep Stone", hp = 12, value = 4, color = 199, mat = "Granite", sound = "stone2" },
	{ from = 80, name = "Basalt", hp = 22, value = 8, color = 26, mat = "Slate", sound = "stone3" },
	{ from = 130, name = "Crystal Caverns", hp = 40, value = 15, color = 104, mat = "Slate", sound = "ice" },
	{ from = 190, name = "Magma Depths", hp = 70, value = 30, color = 154, mat = "Granite", sound = "stone" },
	{ from = 250, name = "The Core", hp = 120, value = 60, color = 1005, mat = "Marble", sound = "metal" },
}
local function layerOf(k)
	local L = LAYERS[1]
	for _, l in ipairs(LAYERS) do if k >= l.from then L = l end end
	return L
end
local ORES = {
	{ name = "Coal", value = 5, color = 26, mat = "Slate", from = 2, weight = 10 },
	{ name = "Copper", value = 12, color = 1014, mat = "Metal", from = 4, weight = 8 },
	{ name = "Iron", value = 25, color = 1002, mat = "Metal", from = 10, weight = 7 },
	{ name = "Gold", value = 60, color = 24, mat = "Foil", from = 25, weight = 5 },
	{ name = "Ruby", value = 150, color = 1004, mat = "Neon", from = 45, weight = 3, glow = true },
	{ name = "Sapphire", value = 250, color = 23, mat = "Neon", from = 60, weight = 2.5, glow = true },
	{ name = "Emerald", value = 400, color = 37, mat = "Neon", from = 80, weight = 2, glow = true },
	{ name = "Diamond", value = 800, color = 1019, mat = "Neon", from = 110, weight = 1.2, glow = true, rare = true },
	{ name = "Amethyst", value = 1500, color = 1031, mat = "Neon", from = 140, weight = 1, glow = true, rare = true },
	{ name = "Mythril", value = 3500, color = 1018, mat = "Neon", from = 190, weight = 0.6, glow = true, rare = true },
	{ name = "Starstone", value = 10000, color = 1, mat = "Neon", from = 250, weight = 0.25, glow = true, rare = true },
}
for _, o in ipairs(ORES) do o.ore = true end
local CHEST = { name = "Treasure Chest", chest = true, color = 192, mat = "WoodPlanks" }
local TNT = { name = "TNT", tnt = true, color = 21, mat = "SmoothPlastic" }
local BEDROCK_KIND = { name = "Bedrock", hp = math.huge, value = 0, color = 26, mat = "DiamondPlate" }

local PICKS = {
	{ name = "Wooden Pickaxe", power = 1, cost = 0, color = 1030 },
	{ name = "Stone Pickaxe", power = 2, cost = 150, color = 194 },
	{ name = "Iron Pickaxe", power = 4, cost = 800, color = 1002 },
	{ name = "Gold Pickaxe", power = 7, cost = 3500, color = 24 },
	{ name = "Ruby Pickaxe", power = 12, cost = 15000, color = 1004 },
	{ name = "Diamond Pickaxe", power = 20, cost = 60000, color = 1019 },
	{ name = "Mythril Pickaxe", power = 35, cost = 250000, color = 1018 },
	{ name = "Starforged Pickaxe", power = 60, cost = 1000000, color = 1 },
	{ name = "Cosmic Pickaxe", power = 100, cost = 5000000, color = 1031 },
}
local BAGS = {
	{ name = "Pouch", size = 15, cost = 0 },
	{ name = "Satchel", size = 40, cost = 300 },
	{ name = "Backpack", size = 100, cost = 2000 },
	{ name = "Big Backpack", size = 250, cost = 10000 },
	{ name = "Huge Backpack", size = 600, cost = 50000 },
	{ name = "Mega Backpack", size = 1500, cost = 250000 },
	{ name = "Bottomless Bag", size = 4000, cost = 1200000 },
	{ name = "Black Hole Bag", size = 10000, cost = 6000000 },
}
local function rebirthCost(r) return 100000 * (r + 1) * (r + 1) end
local function multiplier(r) return 1 + 0.5 * r end

-- ---------------------------------------------------------------- the player and their save
local me
while not me do me = Players:GetPlayers()[1] if not me then Players.PlayerAdded:wait() end end
local data = { cash = 0, pick = 1, bag = 1, rebirths = 0, best = 0 }
local ds
pcall(function() ds = game:GetService("DataStoreService"):GetDataStore("GNDigDeep") end)
pcall(function()
	local d = ds and ds:GetAsync("save")
	if type(d) == "table" then
		for k in pairs(data) do data[k] = tonumber(d[k]) or data[k] end
	end
end)
data.pick = math.max(1, math.min(#PICKS, data.pick))
data.bag = math.max(1, math.min(#BAGS, data.bag))
local dirty = false
local function save() dirty = false pcall(function() if ds then ds:SetAsync("save", data) end end) end
local bag = { count = 0, value = 0 }
local function showStats()
	H.stat(me, "Cash", math.floor(data.cash) - H.stat(me, "Cash"))
	H.stat(me, "Deepest", data.best - H.stat(me, "Deepest"))
	H.stat(me, "Rebirths", data.rebirths - H.stat(me, "Rebirths"))
end
showStats()

-- ---------------------------------------------------------------- the mine
local mineFolder
local seed
local blocks, mined, info = {}, {}, {}
local function rand(i, j, k, salt)
	local h = (seed * 7919 + i * 104729 + j * 1299709 + k * 15485863 + salt * 31) % 2147483647
	for _ = 1, 3 do h = (h * 48271) % 2147483647 end
	return h / 2147483647
end
local function kindAt(i, j, k)
	if k >= BEDROCK then return BEDROCK_KIND end
	local L = layerOf(k)
	if k >= 4 then
		local r = rand(i, j, k, 1)
		if r < 0.003 then return CHEST end
		if r < 0.008 then return TNT end
		if r < 0.008 + 0.07 + math.min(0.07, k * 0.0004) then
			local total, list = 0, {}
			for _, o in ipairs(ORES) do
				if k >= o.from then
					-- an ore gets rarer far below where it first shows up, so the new ones take over
					local w = o.weight / (1 + math.max(0, k - o.from - 60) / 60)
					total = total + w
					list[#list + 1] = { o, w }
				end
			end
			local pick = rand(i, j, k, 2) * total
			for _, x in ipairs(list) do
				pick = pick - x[2]
				if pick <= 0 then return x[1], L end
			end
		end
	end
	return L, L
end
local function key(i, j, k) return i .. "," .. j .. "," .. k end
local function posOf(i, j, k) return Vector3.new(-HALF + (i + 0.5) * B, TOP - (k + 0.5) * B, -HALF + (j + 0.5) * B) end
local function reveal(i, j, k)
	if i < 0 or j < 0 or k < 0 or i >= N or j >= N or k > BEDROCK then return end
	local id = key(i, j, k)
	if mined[id] or blocks[id] then return end
	local kind, L = kindAt(i, j, k)
	L = L or layerOf(k)
	local p = Instance.new("Part")
	pcall(function() p.FormFactor = Enum.FormFactor.Custom end)
	p.Name = "Block"
	p.Size = Vector3.new(B, B, B)
	p.Anchored = true
	p.TopSurface, p.BottomSurface = Enum.SurfaceType.Smooth, Enum.SurfaceType.Smooth
	p.BrickColor = BrickColor.new(kind.color)
	pcall(function() p.Material = Enum.Material[kind.mat] end)
	p.CFrame = CFrame.new(posOf(i, j, k))
	if kind.glow then
		local l = Instance.new("PointLight", p)
		l.Color = p.BrickColor.Color
		l.Range = 12
		l.Brightness = 1.5
	end
	if kind.chest then
		-- a chest: wooden, with a gold band
		local lid = Instance.new("Part")
		pcall(function() lid.FormFactor = Enum.FormFactor.Custom end)
		lid.Size, lid.Anchored, lid.CanCollide = Vector3.new(B + 0.1, 0.6, B + 0.1), true, false
		lid.BrickColor = BrickColor.new(24)
		lid.Material = Enum.Material.Foil
		lid.CFrame = p.CFrame * CFrame.new(0, 1, 0)
		lid.Parent = p
	elseif kind.tnt then
		local band = Instance.new("Part")
		pcall(function() band.FormFactor = Enum.FormFactor.Custom end)
		band.Size, band.Anchored, band.CanCollide = Vector3.new(B + 0.1, 1.2, B + 0.1), true, false
		band.BrickColor = BrickColor.new(1001)
		band.CFrame = p.CFrame
		band.Parent = p
	end
	p.Parent = mineFolder
	local hp = kind.hp or L.hp
	if kind.ore then hp = L.hp * 1.6 end
	blocks[id] = p
	info[p] = { i = i, j = j, k = k, kind = kind, layer = L, hp = hp, max = hp }
end
local function newMine()
	if mineFolder then mineFolder:Destroy() end
	mineFolder = Instance.new("Model")
	mineFolder.Name = "Mine"
	mineFolder.Parent = workspace
	seed = math.random(1, 999999)
	blocks, mined, info = {}, {}, {}
	for i = 0, N - 1 do for j = 0, N - 1 do reveal(i, j, 0) end end
end
newMine()

-- ---------------------------------------------------------------- the pickaxe
local tool
local function pickaxe()
	local pk = PICKS[data.pick]
	if tool and tool.Parent then
		tool.Name = pk.name
		local head = tool:FindFirstChild("Head", true)
		if head then head.BrickColor = BrickColor.new(pk.color) end
		return
	end
	tool = Instance.new("Tool")
	tool.Name = pk.name
	tool.CanBeDropped = false
	tool.GripPos = Vector3.new(0, -1, 0)
	local handle = Instance.new("Part")
	pcall(function() handle.FormFactor = Enum.FormFactor.Custom end)
	handle.Name = "Handle"
	handle.Size = Vector3.new(0.35, 4, 0.35)
	handle.BrickColor = BrickColor.new(192)
	handle.Material = Enum.Material.Wood
	handle.CanCollide = false
	handle.Parent = tool
	local head = Instance.new("Part")
	pcall(function() head.FormFactor = Enum.FormFactor.Custom end)
	head.Name = "Head"
	head.Size = Vector3.new(3.2, 0.6, 0.45)
	head.BrickColor = BrickColor.new(pk.color)
	head.Material = Enum.Material.Metal
	head.CanCollide = false
	head.Parent = tool
	local w = Instance.new("Weld")
	w.Part0, w.Part1 = handle, head
	w.C0 = CFrame.new(0, 1.8, 0)
	w.Parent = handle
	tool.Parent = me:WaitForChild("Backpack")
	local hum = me.Character and me.Character:FindFirstChild("Humanoid")
	if hum then pcall(function() hum:EquipTool(tool) end) end
end

-- ---------------------------------------------------------------- the signs on the shop pads
local function sign(pad, title)
	local board = surface:FindFirstChild(pad.Name .. "Sign")
	if not board then return function() end end
	local g = Instance.new("SurfaceGui")
	g.Face = Enum.NormalId.Back
	g.Parent = board
	local t = Instance.new("TextLabel", g)
	t.Size = UDim2.new(1, 0, 1, 0)
	t.BackgroundColor3 = Color3.new(0.1, 0.08, 0.06)
	t.TextColor3 = Color3.new(1, 0.9, 0.55)
	t.Font = Enum.Font.SourceSansBold
	t.TextScaled = true
	t.TextWrapped = true
	return function(text) t.Text = title .. "\n" .. text end
end
local signs = { sell = sign(sellPad, "SELL"), pick = sign(pickPad, "PICKAXES"), bag = sign(bagPad, "BACKPACKS"), rebirth = sign(rebirthPad, "REBIRTH") }
local function drawSigns()
	signs.sell("Step here to sell\nyour ore (x" .. multiplier(data.rebirths) .. ")")
	local np, nb = PICKS[data.pick + 1], BAGS[data.bag + 1]
	signs.pick(np and ("Next: " .. np.name .. "\n" .. money(np.cost)) or "You have the best one!")
	signs.bag(nb and ("Next: " .. nb.name .. " (" .. nb.size .. ")\n" .. money(nb.cost)) or "You have the biggest one!")
	signs.rebirth(money(rebirthCost(data.rebirths)) .. "\nStart over with x" .. multiplier(data.rebirths + 1) .. " cash")
end
drawSigns()

-- ---------------------------------------------------------------- digging
local lastPos            -- where you were digging (for Back down): your HumanoidRootPart goes back here
local goUp, goDown
local seenLayer = {}
local lastHit = 0
local box = Instance.new("SelectionBox")
box.Color = BrickColor.new(1)
pcall(function() box.LineThickness = 0.06 end)
box.Parent = workspace
local function rootOf() local c = me.Character return c and c:FindFirstChild("HumanoidRootPart"), c and c:FindFirstChild("Humanoid") end
local function collect(b, part)
	local id = key(b.i, b.j, b.k)
	info[part] = nil
	blocks[id] = nil
	mined[id] = true
	local at = part.Position
	part:Destroy()
	for _, d in ipairs({ { 1, 0, 0 }, { -1, 0, 0 }, { 0, 1, 0 }, { 0, -1, 0 }, { 0, 0, 1 }, { 0, 0, -1 } }) do
		reveal(b.i + d[1], b.j + d[2], b.k + d[3])
	end
	return at
end
local mineBlock
local function boom(b, at)
	H.sound(at, "impact_explosion_01", 0.7)
	-- a fireball that hurts nobody (a real Explosion would knock out a digger standing in the blast)
	local ball = Instance.new("Part")
	pcall(function() ball.FormFactor = Enum.FormFactor.Custom end)
	ball.Shape = Enum.PartType.Ball
	ball.Anchored, ball.CanCollide = true, false
	ball.BrickColor = BrickColor.new(106)
	ball.Material = Enum.Material.Neon
	ball.Size = Vector3.new(4, 4, 4)
	ball.CFrame = CFrame.new(at)
	ball.Parent = workspace
	spawn(function()
		for s = 1, 8 do
			ball.Size = Vector3.new(4 + s * 2.2, 4 + s * 2.2, 4 + s * 2.2)
			ball.CFrame = CFrame.new(at)
			ball.Transparency = s / 9
			wait(0.03)
		end
		ball:Destroy()
	end)
	for di = -1, 1 do for dj = -1, 1 do for dk = -1, 1 do
		local p = blocks[key(b.i + di, b.j + dj, b.k + dk)]
		local nb = p and info[p]
		if nb and nb.kind ~= BEDROCK_KIND then mineBlock(nb, p, true) end
	end end end
end
mineBlock = function(b, part, free)
	local kind = b.kind
	if kind.chest then
		local prize = math.floor(40 * (b.k + 10) * multiplier(data.rebirths))
		data.cash = data.cash + prize
		dirty = true
		H.msg(me, "Treasure chest! +" .. money(prize), 2.5)
		H.sound(part.Position, "victory", 0.5)
		lastPos = collect(b, part)
		showStats()
		return
	end
	if kind.tnt then
		local at = collect(b, part)
		lastPos = at
		H.msg(me, "TNT! Stand back!", 1)
		delay(0.8, function() boom(b, at) end)
		return
	end
	if bag.count >= BAGS[data.bag].size then
		if not free then H.msg(me, "Your backpack is full! Press Q (or Sell) to sell.", 2) end
		return
	end
	local value = kind.value
	bag.count = bag.count + 1
	bag.value = bag.value + value
	lastPos = collect(b, part)
	if kind.ore then
		H.sound(lastPos, "electronicpingshort", kind.rare and 0.6 or 0.3)
		if kind.rare then
			H.msg(me, "You found " .. kind.name .. "! (" .. money(value) .. ")", 2.5)
			local line = NET.myName() .. " found " .. kind.name .. " at depth " .. b.k .. "!"
			NET.toast(line)
			NET.send("dig", line)
		end
	end
end

local function hit(part)
	if part and not info[part] and part.Parent and info[part.Parent] then part = part.Parent end   -- (a chest's or TNT's band)
	local b = part and info[part]
	if not b or tick() - lastHit < 0.13 then return end
	local root, hum = rootOf()
	if not root or not hum or hum.Health <= 0 then return end
	if (root.Position - part.Position).magnitude > 22 then return end
	lastHit = tick()
	if tool and tool.Parent == me.Character then
		local a = Instance.new("StringValue")
		a.Name = "toolanim"
		a.Value = "Slash"
		a.Parent = tool
	end
	if b.kind == BEDROCK_KIND then
		H.msg(me, "Bedrock! This is as deep as it goes.", 2)
		H.sound(part.Position, "metal", 0.5)
		return
	end
	if bag.count >= BAGS[data.bag].size and not b.kind.chest and not b.kind.tnt then
		H.msg(me, "Your backpack is full! Press Q (or Sell) to sell.", 2)
		return
	end
	b.hp = b.hp - PICKS[data.pick].power
	H.sound(part.Position, b.kind.ore and "metal" or b.layer.sound, 0.45)
	if b.hp <= 0 then
		box.Adornee = nil
		mineBlock(b, part)
	else
		box.Adornee = part
		part.Transparency = 0.45 * (1 - b.hp / b.max)
	end
end
spawn(function()
	local f = store:WaitForChild("WebBlox")
	f:WaitForChild("Click").Event:connect(function(part) hit(part) end)
	f:WaitForChild("Key").Event:connect(function(k)
		if k == "q" then goUp() elseif k == "e" then goDown() end
	end)
end)

-- ---------------------------------------------------------------- selling and the shop
local function teleport(pos)
	local root = rootOf()
	if root then root.CFrame = CFrame.new(pos + Vector3.new(0, 3.5, 0)) root.Velocity = Vector3.new() end
end
local soldAt = 0
local function sell()
	if bag.count == 0 then return end
	soldAt = tick()
	local got = math.floor(bag.value * multiplier(data.rebirths))
	data.cash = data.cash + got
	H.msg(me, "Sold " .. bag.count .. " blocks for " .. money(got) .. "!", 2.5)
	H.sound(sellPad, "electronicpingshort", 0.6)
	bag.count, bag.value = 0, 0
	dirty = true
	showStats()
end
goUp = function()
	local root = rootOf()
	if root and root.Position.Y < TOP - 2 then lastPos = root.Position end
	teleport(sellPad.Position)
	sell()
end
goDown = function()
	local root = rootOf()
	if lastPos and root then root.CFrame = CFrame.new(lastPos) root.Velocity = Vector3.new()
	else H.msg(me, "Start digging first: click the ground in the mine!", 2) end
end
local busy = {}
local function pad(part, fn)
	part.Touched:connect(function(h)
		if H.playerOf(h) ~= me or busy[part] then return end
		busy[part] = true
		pcall(fn)
		delay(1.2, function() busy[part] = nil end)
	end)
end
pad(sellPad, function()
	if bag.count > 0 then sell() elseif tick() - soldAt > 3 then H.msg(me, "Your backpack is empty. Go dig!", 1.5) end
end)
pad(pickPad, function()
	local np = PICKS[data.pick + 1]
	if not np then H.msg(me, "You already have the best pickaxe!", 2) return end
	if data.cash < np.cost then H.msg(me, np.name .. " costs " .. money(np.cost) .. ". Keep digging!", 2) return end
	data.cash = data.cash - np.cost
	data.pick = data.pick + 1
	H.msg(me, "You got the " .. np.name .. "!", 2.5)
	H.sound(pickPad, "victory", 0.5)
	pickaxe() showStats() drawSigns() save()
end)
pad(bagPad, function()
	local nb = BAGS[data.bag + 1]
	if not nb then H.msg(me, "You already have the biggest backpack!", 2) return end
	if data.cash < nb.cost then H.msg(me, "The " .. nb.name .. " costs " .. money(nb.cost) .. ". Keep digging!", 2) return end
	data.cash = data.cash - nb.cost
	data.bag = data.bag + 1
	H.msg(me, "You got the " .. nb.name .. "! It holds " .. nb.size .. ".", 2.5)
	H.sound(bagPad, "victory", 0.5)
	showStats() drawSigns() save()
end)
pad(rebirthPad, function()
	local cost = rebirthCost(data.rebirths)
	if data.cash < cost then H.msg(me, "Rebirth costs " .. money(cost) .. ". You'd start over with x" .. multiplier(data.rebirths + 1) .. " cash for good.", 3) return end
	data.rebirths = data.rebirths + 1
	data.cash, data.pick, data.bag = 0, 1, 1
	bag.count, bag.value = 0, 0
	lastPos = nil
	H.msg(me, "REBIRTH " .. data.rebirths .. "! Everything you sell is now worth x" .. multiplier(data.rebirths) .. ".", 4)
	NET.toast(NET.myName() .. " rebirthed! (" .. data.rebirths .. ")")
	NET.send("dig", NET.myName() .. " rebirthed! (" .. data.rebirths .. ")")
	H.sound(rebirthPad, "victory", 0.6)
	newMine() pickaxe() showStats() drawSigns() save()
end)
NET.on(function(topic, text) if topic == "dig" then NET.toast(tostring(text)) end end)

-- ---------------------------------------------------------------- the buttons
local function buttons()
	local pg = me:FindFirstChild("PlayerGui")
	if not pg or pg:FindFirstChild("DigButtons") then return end
	local sg = Instance.new("ScreenGui")
	sg.Name = "DigButtons"
	sg.Parent = pg
	local function button(text, y, color, fn)
		local b = Instance.new("TextButton")
		b.Size = UDim2.new(0, 150, 0, 44)
		b.Position = UDim2.new(1, -164, 0.5, y)
		b.BackgroundColor3 = color
		b.BorderSizePixel = 0
		b.TextColor3 = Color3.new(1, 1, 1)
		b.Font = Enum.Font.SourceSansBold
		b.FontSize = Enum.FontSize.Size24
		b.Text = text
		b.Parent = sg
		b.MouseButton1Click:connect(fn)
	end
	button("Sell (Q)", -50, Color3.new(0.1, 0.6, 0.25), goUp)
	button("Back down (E)", 2, Color3.new(0.2, 0.35, 0.7), goDown)
end
-- a headlamp: it gets dark down there
local function headlamp(c)
	local head = c and c:WaitForChild("Head")
	if head and not head:FindFirstChild("Headlamp") then
		local l = Instance.new("PointLight")
		l.Name = "Headlamp"
		l.Color = Color3.new(1, 0.92, 0.75)
		l.Range = 26
		l.Brightness = 1.3
		l.Shadows = false
		l.Parent = head
	end
end
me.CharacterAdded:connect(function(c)
	wait(0.6)
	tool = nil
	pickaxe()
	buttons()
	headlamp(c)
end)
if me.Character then pickaxe() buttons() headlamp(me.Character) end

-- ---------------------------------------------------------------- the line at the top, depth records, saving
wait(1)
H.msg(me, "Dig Deep!\nClick the ground in the mine to dig. Sell your ore at the surface.", 5)
local lastSave = tick()
while true do
	local root = rootOf()
	if root then
		local depth = math.max(0, math.floor((TOP - root.Position.Y) / B))
		if root.Position.Y < TOP - 1 then
			local L = layerOf(depth)
			if not seenLayer[L.name] and depth > 0 then
				seenLayer[L.name] = true
				if L.from > 1 then H.msg(me, "Now entering: " .. L.name, 2.5) end
			end
		end
		if depth > data.best and math.abs(root.Position.X) < HALF and math.abs(root.Position.Z) < HALF then
			local was = math.floor(data.best / 50)
			data.best = depth
			dirty = true
			showStats()
			if math.floor(depth / 50) > was then
				local line = NET.myName() .. " dug down to depth " .. depth .. "!"
				NET.toast(line)
				NET.send("dig", line)
			end
		end
		local full = bag.count >= BAGS[data.bag].size and "  FULL!" or ""
		H.bar(money(data.cash) .. "   |   Bag " .. bag.count .. "/" .. BAGS[data.bag].size .. full .. "   |   Depth " .. depth)
		-- fell out of the world somehow: back to the surface
		if root.Position.Y < TOP - (BEDROCK + 4) * B then teleport(spawnPad.Position) end
	end
	if dirty and tick() - lastSave > 8 then lastSave = tick() save() end
	wait(0.25)
end
