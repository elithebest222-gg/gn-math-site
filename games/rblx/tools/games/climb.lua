-- Endless Climb (tools/build_games.py): a tower that never ends, built section by section as you
-- climb, spiralling around a central pillar.
--
-- The tower is the same for everyone in a server and new every day (it comes from the room and
-- the day, on the room's shared clock). It gets harder as it goes up, and the scenery changes
-- every 20 sections. A checkpoint every 6 sections; falling takes you back to the last one.
-- Stats: Height (this climb), Best (saved on the device), Falls. The best climbers in the server
-- (NET shared values) are on the board at the bottom.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local store = game:GetService("ReplicatedStorage")
local base = workspace:WaitForChild("Base")
local spawnPad = base:WaitForChild("Spawn")

local CENTER = Vector3.new(0, 0, 0)
local R = 30                      -- the path runs this far from the middle
local START_Y = spawnPad.Position.Y + 1
local GROUND_Y = spawnPad.Position.Y + 3.2   -- where your HumanoidRootPart is, standing at the bottom (height 0)

local function wb(name) local f = store:FindFirstChild("WebBlox") return f and f:FindFirstChild(name) end
local function now() local off = wb("ClockOffset") return tick() + (off and off.Value or 0) end
local function roomName() local r = wb("Room") return r and r.Value ~= "" and r.Value or "solo" end
local function hash(text, n)
	local h = 5381
	for i = 1, #text do h = (h * 33 + string.byte(text, i)) % 2147483647 end
	h = (h + n * 7919 + 1) % 2147483647
	for _ = 1, 4 do h = (h * 48271) % 2147483647 end
	return h
end
local function newRng(seed)
	local s = seed % 2147483646 + 1
	local r = {}
	function r.next() s = (s * 48271) % 2147483647 return s / 2147483647 end
	function r.int(a, b) return a + math.floor(r.next() * (b - a + 1)) end
	function r.num(a, b) return a + r.next() * (b - a) end
	function r.pick(t) return t[r.int(1, #t)] end
	return r
end
-- the tower comes from the room and the day: wait a moment for the room to connect
for _ = 1, 40 do local r = wb("Room") if r and r.Value ~= "" then break end wait(0.1) end
local DAY = math.floor(now() / 86400)

-- ---------------------------------------------------------------- zones (the scenery changes as you go up)
local ZONES = {
	{ name = "Meadow", colors = { 37, 24, 1020, 23 }, mat = "SmoothPlastic", pillar = 1002, pmat = "Cobblestone" },
	{ name = "Stone Keep", colors = { 1002, 194, 199, 192 }, mat = "Slate", pillar = 26, pmat = "Slate" },
	{ name = "Frozen Peak", colors = { 1, 1019, 1013, 23 }, mat = "Ice", pillar = 1, pmat = "Marble" },
	{ name = "Neon Heights", colors = { 1032, 1031, 1020, 1004 }, mat = "Neon", pillar = 26, pmat = "Metal" },
	{ name = "Candy Clouds", colors = { 1016, 1024, 1029, 1028 }, mat = "SmoothPlastic", pillar = 1016, pmat = "SmoothPlastic" },
	{ name = "Lava Spire", colors = { 21, 1004, 106, 26 }, mat = "Slate", pillar = 26, pmat = "Slate" },
}
local function zoneOf(i) return ZONES[1 + math.floor((i - 1) / 20) % #ZONES] end

-- ---------------------------------------------------------------- building helpers
local tower = Instance.new("Model")
tower.Name = "Tower"
tower.Parent = workspace
local anims = {}        -- moving things: function(t)
local hazards = {}      -- spinning bars: touching one sends you back
local function at(a, y, out)
	local pos = CENTER + Vector3.new(math.cos(a) * (R + (out or 0)), y, math.sin(a) * (R + (out or 0)))
	local tangent = Vector3.new(-math.sin(a), 0, math.cos(a))
	return CFrame.new(pos, pos + tangent)
end
local function block(sec, cf, size, color, mat, name)
	local p = H.part{ parent = sec, cf = cf, size = size, color = color, mat = mat, name = name or "Step" }
	return p
end

local checkpointOf = {}   -- player -> CFrame
local function backToCheckpoint(p, why)
	local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
	local cp = checkpointOf[p] or spawnPad.CFrame
	if root then root.CFrame = cp + Vector3.new(0, 4, 0) root.Velocity = Vector3.new() end
	H.stat(p, "Falls", 1)
	if why then H.msg(p, why, 1.5) end
end
local function killBrick(part)
	part.Touched:connect(function(hit)
		local p = H.playerOf(hit)
		if p then backToCheckpoint(p, "Ouch! Back to your checkpoint.") end
	end)
end

-- ---------------------------------------------------------------- sections
-- each: function(sec, a, y, rng, d, z) -> new angle, new height   (d: 0 easy .. 1 hardest)
local SECTIONS = {}
local function section(name, fn, minD) SECTIONS[#SECTIONS + 1] = { name = name, fn = fn, minD = minD or 0 } end

section("steps", function(sec, a, y, rng, d, z)
	local n = 5
	local w = 5 - d * 2
	for i = 1, n do
		a = a + 0.16 + d * 0.05
		y = y + 2.4
		block(sec, at(a, y), Vector3.new(w, 1, w), z.colors[1 + i % #z.colors], z.mat)
	end
	return a, y
end)
section("gaps", function(sec, a, y, rng, d, z)
	for i = 1, 3 do
		a = a + (6.5 + d * 3.5) / R
		y = y + rng.num(0, 1.5)
		block(sec, at(a, y, rng.num(-3, 3)), Vector3.new(4.5 - d, 1, 4.5 - d), z.colors[i], z.mat)
	end
	return a, y
end)
section("truss", function(sec, a, y, rng, d, z)
	a = a + 0.2
	block(sec, at(a, y), Vector3.new(6, 1, 6), z.colors[1], z.mat)
	local h = 10 + math.floor(d * 8)
	H.part{ parent = sec, class = "TrussPart", name = "Truss", cf = at(a, y + h / 2 + 0.5, -3.5), size = Vector3.new(2, h, 2), color = 194, mat = "Metal" }
	y = y + h
	block(sec, at(a, y, -6.5), Vector3.new(8, 1, 6), z.colors[2], z.mat)
	return a + 0.08, y
end)
section("spinner", function(sec, a, y, rng, d, z)
	a = a + 0.35
	local cf = at(a, y)
	block(sec, cf, Vector3.new(16, 1, 16), z.colors[1], z.mat, "Floor")
	local bar = H.part{ parent = sec, name = "Spinner", size = Vector3.new(15, 1, 1), color = 21, mat = "Neon", collide = false }
	local speed = (1.2 + d * 2.2) * (rng.next() < 0.5 and -1 or 1)
	anims[#anims + 1] = function(t) if bar.Parent then bar.CFrame = cf * CFrame.new(0, 1.4, 0) * CFrame.Angles(0, t * speed, 0) end end
	hazards[#hazards + 1] = bar
	a = a + 0.32
	y = y + 2.5
	block(sec, at(a, y), Vector3.new(5, 1, 5), z.colors[2], z.mat)
	return a, y
end, 0.1)
section("movers", function(sec, a, y, rng, d, z)
	for i = 1, 2 do
		a = a + 0.32
		y = y + 1.5
		local cf = at(a, y)
		local p = block(sec, cf, Vector3.new(5, 1, 5), z.colors[i + 1], "SmoothPlastic", "Mover")
		local w = 6.28 / (3.2 - d * 1.4)
		local phase = rng.num(0, 6.28)
		anims[#anims + 1] = function(t)
			if p.Parent then
				p.CFrame = cf * CFrame.new(math.sin(t * w + phase) * 6, 0, 0)
				p.Velocity = cf:vectorToWorldSpace(Vector3.new(math.cos(t * w + phase) * 6 * w, 0, 0))
			end
		end
	end
	a = a + 0.3
	block(sec, at(a, y), Vector3.new(5, 1, 5), z.colors[1], z.mat)
	return a, y
end, 0.15)
section("vanish", function(sec, a, y, rng, d, z)
	for i = 1, 4 do
		a = a + 0.2
		y = y + 0.8
		local p = block(sec, at(a, y), Vector3.new(4.5, 1, 4.5), 1, "SmoothPlastic", "Vanish")
		p.Transparency = 0.2
		p.Touched:connect(function(hit)
			if p.CanCollide and H.playerOf(hit) and not p:FindFirstChild("Going") then
				local g = Instance.new("BoolValue", p) g.Name = "Going"
				delay(0.7 - d * 0.3, function() p.Transparency, p.CanCollide = 0.9, false end)
				delay(3, function() p.Transparency, p.CanCollide = 0.2, true g:Destroy() end)
			end
		end)
	end
	return a, y
end, 0.2)
section("wallhop", function(sec, a, y, rng, d, z)
	a = a + 0.15
	block(sec, at(a + 0.2, y + 6, 4.5), Vector3.new(1, 14, 14), z.colors[4], z.mat, "Wall")
	for i = 1, 4 do
		y = y + 2.6
		a = a + 0.06
		block(sec, at(a, y, (i % 2 == 0) and 2 or -2), Vector3.new(3 - d, 1, 2.5), z.colors[1 + i % 3], z.mat, "Ledge")
	end
	a = a + 0.12
	block(sec, at(a, y), Vector3.new(5, 1, 5), z.colors[1], z.mat)
	return a, y
end, 0.25)
section("bounce", function(sec, a, y, rng, d, z)
	a = a + 0.2
	local pad = block(sec, at(a, y), Vector3.new(6, 1, 6), 1032, "Neon", "Bounce")
	pad.Touched:connect(function(hit)
		local r = hit.Parent and hit.Parent:FindFirstChild("HumanoidRootPart")
		if r and H.playerOf(hit) then r.Velocity = Vector3.new(r.Velocity.X, 92, r.Velocity.Z) H.sound(pad, "Rubber band", 0.4) end
	end)
	a = a + 0.18
	y = y + 15
	block(sec, at(a, y), Vector3.new(7 - d * 2, 1, 7 - d * 2), z.colors[2], z.mat)
	return a, y
end, 0.05)
section("stripes", function(sec, a, y, rng, d, z)
	a = a + 0.45
	local cf = at(a, y)
	block(sec, cf, Vector3.new(10, 1, 26), z.colors[1], z.mat, "Floor")
	for i = -1, 1 do
		local k = H.part{ parent = sec, name = "Kill", cf = cf * CFrame.new(rng.num(-2, 2), 0.7, i * 8), size = Vector3.new(9, 0.4, 1.4 + d), color = 21, mat = "Neon" }
		killBrick(k)
	end
	a = a + 0.45
	y = y + 2
	block(sec, at(a, y), Vector3.new(5, 1, 5), z.colors[2], z.mat)
	return a, y
end, 0.1)
section("beam", function(sec, a, y, rng, d, z)
	a = a + 0.35
	y = y + 3
	block(sec, at(a, y) * CFrame.Angles(math.rad(10), 0, 0), Vector3.new(1.6 - d * 0.6, 1, 20), z.colors[3], z.mat, "Beam")
	a = a + 0.35
	y = y + 3
	block(sec, at(a, y), Vector3.new(5, 1, 5), z.colors[1], z.mat)
	return a, y
end, 0.3)
section("pillars", function(sec, a, y, rng, d, z)
	for i = 1, 5 do
		a = a + 0.17
		y = y + 1.8
		block(sec, at(a, y - 4, rng.num(-2, 2)), Vector3.new(2.2 - d * 0.6, 9, 2.2 - d * 0.6), z.colors[1 + i % #z.colors], z.mat, "Pillar")
	end
	return a, y
end, 0.35)

-- ---------------------------------------------------------------- the tower, built as you climb
local sections = {}      -- i -> { model, top, a, y }
local rng = newRng(hash(roomName() .. "climb", DAY))
local nextA, nextY = 0, START_Y
local built = 0
local function buildNext()
	built = built + 1
	local i = built
	local d = math.min(1, (i - 1) / 70)
	local z = zoneOf(i)
	local sec = Instance.new("Model")
	sec.Name = "Section" .. i
	sec.Parent = tower
	local y0 = nextY
	if i % 6 == 0 then
		-- a checkpoint: a wide pad (and a banner when the zone changes)
		nextA = nextA + 0.3
		local cf = at(nextA, nextY)
		local pad = H.part{ parent = sec, name = "Checkpoint", cf = cf, size = Vector3.new(9, 1, 9), color = 24, mat = "Neon" }
		pad.Touched:connect(function(hit)
			local p = H.playerOf(hit)
			if p and (not checkpointOf[p] or checkpointOf[p].p.Y < pad.Position.Y - 1) then
				checkpointOf[p] = pad.CFrame
				H.msg(p, "Checkpoint! " .. zoneOf(i).name .. ", section " .. i, 1.5)
				H.sound(pad, "electronicpingshort", 0.5)
			end
		end)
		nextY = nextY + 1
	else
		local options = {}
		for _, s in ipairs(SECTIONS) do if d >= s.minD then options[#options + 1] = s end end
		local s = rng.pick(options)
		local ok, a, y = pcall(s.fn, sec, nextA, nextY, rng, d, z)
		if ok then nextA, nextY = a, y else print("GN climb: " .. tostring(a)) end
		nextA = nextA + 0.18
	end
	-- the pillar grows with the tower
	H.part{ parent = sec, name = "Pillar", size = Vector3.new(nextY - y0 + 2, 34, 34), shape = "cyl", color = z.pillar, mat = z.pmat,
		cf = CFrame.new(CENTER + Vector3.new(0, (nextY + y0) / 2, 0)) * CFrame.Angles(0, 0, math.pi / 2) }
	if (i - 1) % 20 == 0 then
		H.part{ parent = sec, name = "ZoneRing", size = Vector3.new(1.2, 40, 40), shape = "cyl", color = z.colors[1], mat = "Neon", collide = false,
			cf = CFrame.new(CENTER + Vector3.new(0, y0, 0)) * CFrame.Angles(0, 0, math.pi / 2) }
	end
	sections[i] = { model = sec, top = nextY }
end

-- ---------------------------------------------------------------- climbers
local best = {}
local ds
pcall(function() ds = game:GetService("DataStoreService"):GetDataStore("GNEndlessClimb") end)
local milestones = {}
local function heightOf(p)
	local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
	return root and math.max(0, math.floor(root.Position.Y - GROUND_Y)) or 0
end
local function joined(p)
	local b = 0
	pcall(function() local v = ds and ds:GetAsync("best") b = tonumber(v or 0) or 0 end)
	best[p] = b
	H.stat(p, "Height") H.stat(p, "Best", b - H.stat(p, "Best")) H.stat(p, "Falls")
	p.CharacterAdded:connect(function(c)
		wait(0.4)
		local cp = checkpointOf[p]
		local root = c:WaitForChild("HumanoidRootPart")
		if cp then root.CFrame = cp + Vector3.new(0, 4, 0) end
	end)
end
Players.PlayerAdded:connect(joined)
for _, p in ipairs(Players:GetPlayers()) do joined(p) end

-- the board at the bottom: the best climbers in the server
local board = base:FindFirstChild("Board")
local boardText
if board then
	local g = Instance.new("SurfaceGui")
	g.Face = Enum.NormalId.Back
	g.Parent = board
	boardText = Instance.new("TextLabel", g)
	boardText.Size = UDim2.new(1, 0, 1, 0)
	boardText.BackgroundColor3 = Color3.new(0.07, 0.08, 0.14)
	boardText.TextColor3 = Color3.new(1, 0.86, 0.3)
	boardText.Font = Enum.Font.SourceSansBold
	boardText.TextScaled = true
	boardText.TextWrapped = true
end
local function drawBoard()
	if not boardText then return end
	local rows = {}
	for k, v in pairs(NET.values("climb_")) do
		local name, h = string.match(v, "^(.*)|(%d+)$")
		if name then rows[#rows + 1] = { name, tonumber(h) } end
	end
	table.sort(rows, function(x, y) return x[2] > y[2] end)
	local lines = { "TODAY'S TOWER - BEST CLIMBS" }
	for i = 1, math.min(5, #rows) do lines[#lines + 1] = i .. ". " .. rows[i][1] .. "  " .. rows[i][2] .. "m" end
	if #rows == 0 then lines[#lines + 1] = "Be the first to the top!" end
	boardText.Text = table.concat(lines, "\n")
end
NET.onShared(drawBoard)
drawBoard()
NET.on(function(topic, data) if topic == "climb" then NET.toast(tostring(data)) end end)
local function hitHazard(root)
	for _, bar in ipairs(hazards) do
		if bar.Parent then
			local l = bar.CFrame:pointToObjectSpace(root.Position)
			if math.abs(l.X) < 8 and math.abs(l.Z) < 1.6 and l.Y > 0.2 and l.Y < 2.6 then return true end
		end
	end
	return false
end

for _ = 1, 14 do buildNext() end
wait(2)
H.msg(nil, "Endless Climb: today's tower. How high can you go?", 4)
local shared, swept, drawn = 0, 0, 0
while true do
	local t = now() % 100000
	for _, f in ipairs(anims) do pcall(f, t) end
	local top = 0
	for _, p in ipairs(Players:GetPlayers()) do
		local h = heightOf(p)
		if h > top then top = h end
		H.stat(p, "Height", h - H.stat(p, "Height"))
		if h > (best[p] or 0) then
			best[p] = h
			H.stat(p, "Best", h - H.stat(p, "Best"))
		end
		-- fell well below the last checkpoint: back up you go
		local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
		local cp = checkpointOf[p] or spawnPad.CFrame
		if root and root.Position.Y < cp.p.Y - 30 then backToCheckpoint(p, "You fell! Back to your checkpoint.")
		elseif root and hitHazard(root) then backToCheckpoint(p, "Ouch! Back to your checkpoint.") end
		if tick() - drawn > 0.5 then
			local sec = 1
			for i = built, 1, -1 do if sections[i] and sections[i].top <= START_Y + h + 1 then sec = i + 1 break end end
			H.bar(zoneOf(sec).name .. "  -  " .. h .. "m  (best " .. (best[p] or 0) .. "m)")
		end
		-- every 100m: tell everyone
		local m = math.floor(h / 100)
		if m > (milestones[p] or 0) then
			milestones[p] = m
			local line = NET.myName() .. " climbed past " .. (m * 100) .. "m!"
			NET.toast(line)
			NET.send("climb", line)
			H.sound(workspace, "victory", 0.4)
		end
	end
	if tick() - drawn > 0.5 then drawn = tick() end
	-- keep the tower ahead of the highest climber, and clear what's far below
	while sections[built].top < START_Y + top + 140 do buildNext() end
	if tick() - swept > 2 then
	swept = tick()
	local lowest = math.huge
	for _, p in ipairs(Players:GetPlayers()) do local cp = checkpointOf[p] or spawnPad.CFrame if cp.p.Y < lowest then lowest = cp.p.Y end end
	for i, s in pairs(sections) do
		if s.top < lowest - 60 and s.model.Parent then s.model:Destroy() sections[i] = nil end
	end
	end
	-- save and share the best, now and then
	if tick() - shared > 5 then
		shared = tick()
		for _, p in ipairs(Players:GetPlayers()) do
			local b = best[p] or 0
			if b > 0 then
				NET.set("climb_" .. NET.myId(), NET.myName() .. "|" .. b)
				pcall(function() if ds then ds:SetAsync("best", b) end end)
			end
		end
	end
	wait(0.03)
end
