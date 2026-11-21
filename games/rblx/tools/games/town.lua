-- Sunny Town (tools/build_games.py): a town to hang out in. Parts and models get their behaviour
-- by name:
--   Coin           spins; touch it for +1 Coin (it comes back after a while)
--   Swing          a model with a Pivot and a Seat (Seat class): swings back and forth with you on it
--   Carousel       a part that turns and carries whoever stands on it
--   Bounce         + NumberValue "Power": a trampoline
--   Door           click to open or close (it turns around its left edge)
--   FishingSpot    click to cast a line; after a while you catch something
--   StreetLight    a lamp whose PointLight turns on at night
-- Days pass too: a full day takes 8 minutes.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")
local coins, swings, carousels, lights = {}, {}, {}, {}
local FISH = { "Goldfish", "Bass", "Trout", "Salmon", "Old Boot", "Catfish", "Pufferfish", "Tiny Shark" }

local function characterOf(hit)
	local char = hit and hit.Parent
	if char and not char:FindFirstChild("Humanoid") then char = char.Parent end
	local hum = char and char:FindFirstChild("Humanoid")
	if hum and hum.Health > 0 then return char, hum end
end
local function rootOf(char) return char and (char:FindFirstChild("HumanoidRootPart") or char:FindFirstChild("Torso")) end
local function stat(plr, name)
	local ls = plr and plr:FindFirstChild("leaderstats")
	return ls and ls:FindFirstChild(name)
end
local function sound(part, id, volume)
	local s = Instance.new("Sound")
	s.SoundId = "rbxasset://sounds/" .. id
	s.Volume = volume or 0.6
	s.Parent = part
	s:Play()
	delay(3, function() s:Destroy() end)
end
local function note(plr, text)
	local gui = plr:FindFirstChild("PlayerGui")
	if not gui then return end
	local old = gui:FindFirstChild("TownNote")
	if old then old:Destroy() end
	local sg = Instance.new("ScreenGui")
	sg.Name = "TownNote"
	local t = Instance.new("TextLabel")
	t.Size = UDim2.new(0, 420, 0, 44)
	t.Position = UDim2.new(0.5, -210, 0.2, 0)
	t.BackgroundColor3 = Color3.new(0, 0, 0)
	t.BackgroundTransparency = 0.35
	t.BorderSizePixel = 0
	t.TextColor3 = Color3.new(1, 1, 1)
	t.Font = Enum.Font.SourceSansBold
	t.FontSize = Enum.FontSize.Size24
	t.Text = text
	t.Parent = sg
	sg.Parent = gui
	delay(3, function() if sg.Parent then sg:Destroy() end end)
end
local function click(part, distance, fn)
	local cd = Instance.new("ClickDetector")
	cd.MaxActivationDistance = distance or 14
	cd.Parent = part
	cd.MouseClick:connect(fn)
end

local busy = {}
local function setup(obj)
	local kind = obj.Name
	if kind == "Coin" and obj:IsA("BasePart") then
		table.insert(coins, { part = obj, base = obj.CFrame })
		obj.Touched:connect(function(hit)
			if obj.Transparency > 0.5 then return end
			local char = characterOf(hit)
			local plr = char and Players:GetPlayerFromCharacter(char)
			local c = stat(plr, "Coins")
			if not c then return end
			c.Value = c.Value + 1
			sound(obj, "electronicpingshort.mp3", 0.4)
			obj.Transparency = 1
			delay(30, function() obj.Transparency = 0 end)
		end)
	elseif kind == "Swing" and obj:IsA("Model") then
		local pivot, seat = obj:FindFirstChild("Pivot"), obj:FindFirstChild("Seat")
		if pivot and seat then
			local chains = {}
			for _, c in pairs(obj:GetChildren()) do
				if c.Name == "Chain" then table.insert(chains, { part = c, off = pivot.CFrame:toObjectSpace(c.CFrame) }) end
			end
			table.insert(swings, { pivot = pivot.CFrame, seat = seat, off = pivot.CFrame:toObjectSpace(seat.CFrame), chains = chains, phase = math.random() * 6 })
		end
	elseif kind == "Carousel" and obj:IsA("BasePart") then
		table.insert(carousels, { part = obj, base = obj.CFrame, angle = 0, last = obj.CFrame })
	elseif kind == "Bounce" and obj:IsA("BasePart") then
		local power = obj:FindFirstChild("Power") and obj.Power.Value or 90
		obj.Touched:connect(function(hit)
			local char = characterOf(hit)
			local root = rootOf(char)
			if not root or busy[char] then return end
			busy[char] = true
			root.Velocity = Vector3.new(root.Velocity.X, power, root.Velocity.Z)
			sound(obj, "Rubber band sling shot.mp3", 0.4)
			delay(0.3, function() busy[char] = nil end)
		end)
	elseif kind == "Door" and obj:IsA("BasePart") then
		local closed = obj.CFrame
		-- hinge on the door's left edge (its -X side), swinging inward
		local hinge = closed * CFrame.new(-obj.Size.X / 2, 0, 0)
		local open = hinge * CFrame.Angles(0, math.rad(95), 0) * CFrame.new(obj.Size.X / 2, 0, 0)
		local isOpen = false
		click(obj, 14, function()
			isOpen = not isOpen
			obj.CFrame = isOpen and open or closed
			sound(obj, isOpen and "switch.mp3" or "button.mp3", 0.4)
		end)
	elseif kind == "FishingSpot" and obj:IsA("BasePart") then
		click(obj, 14, function(plr)
			if busy[plr] then return end
			busy[plr] = true
			note(plr, "You cast your line... wait for a bite!")
			sound(obj, "swoosh.mp3", 0.5)
			delay(2 + math.random() * 3, function()
				busy[plr] = nil
				local catch = FISH[math.random(#FISH)]
				local f = stat(plr, "Fish")
				if catch ~= "Old Boot" and f then f.Value = f.Value + 1 end
				note(plr, catch == "Old Boot" and "You caught... an old boot. Yuck!" or ("You caught a " .. catch .. "!"))
				sound(obj, catch == "Old Boot" and "Kerplunk.mp3" or "impact_water.mp3", 0.6)
			end)
		end)
	elseif kind == "StreetLight" and obj:IsA("BasePart") then
		local light = Instance.new("PointLight")
		light.Range = 22
		light.Brightness = 2
		light.Color = Color3.new(1, 0.9, 0.7)
		light.Enabled = false
		light.Parent = obj
		table.insert(lights, { part = obj, light = light })
	end
end
local function scan(o)
	for _, c in pairs(o:GetChildren()) do
		setup(c)
		scan(c)
	end
end
scan(workspace)

local function onPlayer(plr)
	if plr:FindFirstChild("leaderstats") then return end
	local ls = Instance.new("IntValue")
	ls.Name = "leaderstats"
	for _, n in ipairs({ "Coins", "Fish" }) do
		local v = Instance.new("IntValue")
		v.Name = n
		v.Parent = ls
	end
	ls.Parent = plr
end
Players.PlayerAdded:connect(onPlayer)
for _, p in pairs(Players:GetPlayers()) do onPlayer(p) end

-- who's standing on a part
local function standingOn(part)
	local out = {}
	local half = part.Size / 2
	for _, plr in pairs(Players:GetPlayers()) do
		local root = rootOf(plr.Character)
		if root then
			local rel = part.CFrame:pointToObjectSpace(root.Position)
			-- an upright cylinder's axis is its local X
			local r2, up = rel.X * rel.X + rel.Z * rel.Z, rel.Y
			if part.Shape == Enum.PartType.Cylinder then r2, up = rel.Y * rel.Y + rel.Z * rel.Z, rel.X end
			if r2 <= (half.Z + 0.5) * (half.Z + 0.5) and up > -1 and up < 6 then table.insert(out, root) end
		end
	end
	return out
end

local t0 = tick()
local night = nil
RunService.Stepped:connect(function(_, dt)
	dt = math.min(dt or 0.03, 0.1)
	local t = tick() - t0
	for _, c in ipairs(coins) do
		c.part.CFrame = c.base * CFrame.Angles(0, t * 2, 0)
	end
	for _, s in ipairs(swings) do
		local a = math.sin(t * 1.6 + s.phase) * 0.55
		local cf = s.pivot * CFrame.Angles(a, 0, 0)
		s.seat.CFrame = cf * s.off
		for _, ch in ipairs(s.chains) do ch.part.CFrame = cf * ch.off end
	end
	for _, c in ipairs(carousels) do
		c.angle = c.angle + dt * 0.9
		-- turn around the world's up axis (the part itself may be rotated, like an upright cylinder)
		local cf = CFrame.new(c.base.p) * CFrame.Angles(0, c.angle, 0) * (c.base - c.base.p)
		local delta = cf * c.last:inverse()
		for _, root in ipairs(standingOn(c.part)) do root.CFrame = delta * root.CFrame end
		c.part.CFrame = cf
		c.last = cf
	end
	-- a day every 8 minutes, starting in the morning
	local minutes = (8 * 60 + t * 3) % 1440
	Lighting:SetMinutesAfterMidnight(minutes)
	local isNight = minutes < 6 * 60 + 30 or minutes > 18 * 60 + 30
	if isNight ~= night then
		night = isNight
		for _, l in ipairs(lights) do
			l.light.Enabled = isNight
			l.part.BrickColor = BrickColor.new(isNight and "New Yeller" or "Institutional white")
			pcall(function() l.part.Material = isNight and Enum.Material.Neon or Enum.Material.SmoothPlastic end)
		end
	end
end)
