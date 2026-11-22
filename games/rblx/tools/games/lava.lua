-- The Floor is Lava (tools/build_games.py). Every ROUND seconds the lava rises to a new height;
-- climb onto something before it gets you. Everyone who was in the room when the lava started
-- rising and is still alive when it drains wins the round.
--
-- Rounds run on the multiplayer room's shared clock (ReplicatedStorage.WebBlox, kept by
-- scripts/WebBloxPlayers.lua), so everyone in a server sees the same lava at the same time, and
-- each player's game tells the others who survived (NET, games/net.lua), so the round's result
-- lists everyone in the server who made it.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local store = game:GetService("ReplicatedStorage")
local lava = workspace:WaitForChild("Lava")
local arena = workspace:WaitForChild("Arena")          -- invisible box: who's "in the room"
local ROUND = 60
local HEIGHTS = { 3, 5, 7, 9, 11, 13, 15 }               -- lava top, studs above the floor
-- seconds into the round
local WARN, RISE, HOLD, DRAIN, DONE = 14, 18, 28, 42, 47

local base = lava.CFrame
local floorTop = base.p.Y + lava.Size.Y / 2             -- lava starts level with the floor

local function wb(name)
	local f = store:FindFirstChild("WebBlox")
	return f and f:FindFirstChild(name)
end
local function now()
	local off = wb("ClockOffset")
	return tick() + (off and off.Value or 0)
end
local function hash(text, n)
	local h = 5381
	for i = 1, #text do h = (h * 33 + string.byte(text, i)) % 2147483647 end
	h = (h + n * 7919 + 1) % 2147483647
	for _ = 1, 4 do h = (h * 48271) % 2147483647 end
	return h
end
local function heightFor(n)
	local room = wb("Room")
	return HEIGHTS[1 + hash((room and room.Value or "solo") .. "lava", n) % #HEIGHTS]
end

local hint = Instance.new("Hint")
hint.Parent = workspace
local function rootOf(char) return char and (char:FindFirstChild("HumanoidRootPart") or char:FindFirstChild("Torso")) end
local function inArena(pos)
	local rel = arena.CFrame:pointToObjectSpace(pos)
	local half = arena.Size / 2
	return math.abs(rel.X) <= half.X and math.abs(rel.Z) <= half.Z and math.abs(rel.Y) <= half.Y
end
local function sound(id, volume)
	local s = Instance.new("Sound")
	s.SoundId = "rbxasset://sounds/" .. id
	s.Volume = volume or 0.7
	s.Parent = workspace
	s:Play()
	delay(4, function() s:Destroy() end)
end

local function onPlayer(plr)
	if plr:FindFirstChild("leaderstats") then return end
	local ls = Instance.new("IntValue")
	ls.Name = "leaderstats"
	local w = Instance.new("IntValue")
	w.Name = "Wins"
	w.Parent = ls
	ls.Parent = plr
end
Players.PlayerAdded:connect(onPlayer)
for _, plr in pairs(Players:GetPlayers()) do onPlayer(plr) end

local round, phase, height, playing, result = -1, "", HEIGHTS[1], {}, nil
local survivors = {}   -- round -> names (yours, and the other players' from their games)
local function survived(n, name)
	local list = survivors[n] or {}
	survivors[n] = list
	for _, v in ipairs(list) do if v == name then return end end
	table.insert(list, name)
	if n == round then result = "Survived: " .. table.concat(list, ", ") end
end
NET.on(function(topic, data, fromId, fromName)
	if topic == "survived" and tonumber(data) then survived(tonumber(data), fromName ~= "" and fromName or "Someone") end
end)
local function fmt(s) s = math.max(0, math.ceil(s)) return string.format("%d:%02d", math.floor(s / 60), s % 60) end

RunService.Stepped:connect(function()
	local t = now()
	local n = math.floor(t / ROUND)
	local into = t - n * ROUND
	if n ~= round then
		round = n
		height = heightFor(n)
		playing = {}
		result = nil
		survivors[n - 2] = nil
	end
	-- lava level
	local top = floorTop - 2
	if into >= RISE and into < HOLD then
		top = floorTop + height * (into - RISE) / (HOLD - RISE)
	elseif into >= HOLD and into < DRAIN then
		top = floorTop + height
	elseif into >= DRAIN and into < DONE then
		top = floorTop + height * (1 - (into - DRAIN) / (DONE - DRAIN))
	end
	lava.CFrame = base + Vector3.new(0, top - floorTop, 0)

	-- what's happening
	local p
	if into < WARN then
		p = "wait"
		hint.Text = "Next round in " .. fmt(WARN - into)
	elseif into < RISE then
		p = "warn"
		hint.Text = "THE FLOOR IS LAVA! Get up high! (" .. height .. " studs)"
	elseif into < DRAIN then
		p = "lava"
		hint.Text = "Stay off the lava! " .. fmt(DRAIN - into)
	else
		p = "done"
		hint.Text = (result and into < DONE + 6) and result or ("Next round in " .. fmt(ROUND - into + WARN))
	end
	if p ~= phase then
		local old = phase
		phase = p
		if p == "warn" then sound("switch.mp3", 0.8) end
		if p == "lava" then
			-- who's in the room when it starts rising
			for _, plr in pairs(Players:GetPlayers()) do
				local root = rootOf(plr.Character)
				local hum = plr.Character and plr.Character:FindFirstChild("Humanoid")
				if root and hum and hum.Health > 0 and inArena(root.Position) then playing[plr] = plr.Character end
			end
		end
		if p == "done" and old == "lava" then
			local names = {}
			for plr, char in pairs(playing) do
				local hum = char:FindFirstChild("Humanoid")
				if plr.Parent and plr.Character == char and hum and hum.Health > 0 then
					local ls = plr:FindFirstChild("leaderstats")
					local w = ls and ls:FindFirstChild("Wins")
					if w then w.Value = w.Value + 1 end
					local me = wb("LocalName")
					table.insert(names, me and me.Value ~= "" and me.Value or plr.Name)
				end
			end
			if #names > 0 then
				sound("victory.mp3", 0.7)
				NET.send("survived", tostring(round))
			end
			result = "Nobody survived!"
			for _, name in ipairs(names) do survived(round, name) end
			if survivors[round] and #survivors[round] > 0 then result = "Survived: " .. table.concat(survivors[round], ", ") end
		end
	end

	-- the lava itself
	for _, plr in pairs(Players:GetPlayers()) do
		local char = plr.Character
		local root = rootOf(char)
		local hum = char and char:FindFirstChild("Humanoid")
		if root and hum and hum.Health > 0 and inArena(root.Position) and root.Position.Y - 2.8 < top then
			hum.Health = 0
			sound("splat.mp3", 0.6)
		end
	end
end)
