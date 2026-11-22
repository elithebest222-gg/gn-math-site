-- Rising Tide: rounds on flooding maps. Press the buttons to open the hatches and climb out
-- before the water reaches you. Map (build_games.py): Models named Map_<name> with Start, Exit,
-- Water (starts low, rises to its NumberValue Top), Button parts (StringValue Opens = the name
-- of a Gate part in the same map). The lobby has the SpawnLocation. Stats: Escapes, Coins.
local Players = game:GetService("Players")
local maps = {}
for _, d in pairs(workspace:GetChildren()) do
	if d:IsA("Model") and string.sub(d.Name, 1, 4) == "Map_" then maps[#maps + 1] = d end
end
local lobby = workspace.Lobby.Spawn
local ROUND = 90
local current, water, top, startY, escaped = nil, nil, 0, 0, {}

local function reset(map)
	for _, p in pairs(map:GetChildren()) do
		if p.Name == "Gate" or string.sub(p.Name, 1, 4) == "Gate" then p.Transparency, p.CanCollide = 0, true end
		if p.Name == "Button" then p.BrickColor = BrickColor.new(21) end
	end
	local w = map.Water
	w.CFrame = CFrame.new(w.Position.X, map.Water.Start.Value, w.Position.Z)
end
for _, map in pairs(maps) do
	local w = map.Water
	local s = Instance.new("NumberValue", w)
	s.Name = "Start"
	s.Value = w.Position.Y
	for _, b in pairs(map:GetChildren()) do
		if b.Name == "Button" then
			b.Touched:connect(function(hit)
				if not H.playerOf(hit) or b.BrickColor == BrickColor.new(37) then return end
				b.BrickColor = BrickColor.new(37)
				H.sound(b, "switch", 0.7)
				local g = map:FindFirstChild(b.Opens.Value)
				if g then g.Transparency, g.CanCollide = 0.85, false end
				H.msg(H.playerOf(hit), "A hatch opened!", 1.5)
			end)
		end
	end
	map.Exit.Touched:connect(function(hit)
		local p = H.playerOf(hit)
		if not p or escaped[p] or current ~= map then return end
		escaped[p] = true
		H.stat(p, "Escapes", 1)
		H.stat(p, "Coins", 10)
		NET.toast(NET.myName() .. " escaped " .. map.Title.Value .. "!")
		H.msg(p, "You escaped! +10 coins", 3)
		H.sound(workspace, "victory", 0.5)
		local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
		if root then root.CFrame = lobby.CFrame + Vector3.new(0, 4, 0) end
	end)
end

local function inRound(p)
	local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
	local hum = p.Character and p.Character:FindFirstChild("Humanoid")
	if not root or not hum or hum.Health <= 0 or escaped[p] then return nil end
	return root, hum
end

local n = 0
while true do
	for i = 10, 1, -1 do H.bar("Next flood in " .. i) wait(1) end
	n = n % #maps + 1
	current = maps[n]
	reset(current)
	escaped = {}
	water = current.Water
	top = water.Top.Value
	startY = water.Start.Value
	for _, p in pairs(Players:GetPlayers()) do
		local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
		if root then root.CFrame = current.Start.CFrame + Vector3.new(math.random(-3, 3), 4, math.random(-3, 3)) end
		H.stat(p, "Escapes") H.stat(p, "Coins")
	end
	H.msg(nil, current.Title.Value .. " - the water is rising!", 3)
	local t0 = tick()
	while tick() - t0 < ROUND do
		local f = (tick() - t0) / ROUND
		local y = startY + (top - startY) * math.min(1, f * 1.08)
		water.CFrame = CFrame.new(water.Position.X, y, water.Position.Z)
		local surface = y + water.Size.Y / 2
		local left = 0
		for _, p in pairs(Players:GetPlayers()) do
			local root, hum = inRound(p)
			if root and (root.Position - current.Start.Position).magnitude < 200 then
				left = left + 1
				if root.Position.Y + 1 < surface then hum.Health = 0 H.msg(p, "You drowned!", 2) end
			end
		end
		H.bar(current.Title.Value .. ": " .. math.ceil(ROUND - (tick() - t0)) .. "s")
		if left == 0 and tick() - t0 > 3 then break end
		wait(0.1)
	end
	current = nil
	H.bar("")
	wait(1)
end
