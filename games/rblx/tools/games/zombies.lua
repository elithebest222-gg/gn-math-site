-- Undead Nights: hold out in a walled town against waves of zombies.
-- Map (build_games.py): parts named ZombieSpawn where zombies come from, a SpawnLocation in the square.
-- Every wave has more, tougher and faster zombies. Zombies drop Cash; spend it at the gun shop in the
-- square (pads you step on): new guns, and damage / fire-rate upgrades that cost more each level.
-- Guns and upgrades last the whole session; if you die the night starts over from wave 1.
-- Stats: Cash, Kills, Wave.
local spawns = {}
for _, d in pairs(workspace:GetChildren()) do
	if d:IsA("Model") then for _, p in pairs(d:GetChildren()) do if p.Name == "ZombieSpawn" then spawns[#spawns + 1] = p.Position end end end
end
local wave, best = 0, 0
local dead = false
local Players = game:GetService("Players")
NET.giveGear("pistol,sword")

-- ---------------------------------------------------------------- money and the gun shop
local cash = 0
local function addCash(n)
	cash = math.max(0, cash + n)
	for _, p in pairs(Players:GetPlayers()) do H.stat(p, "Cash", cash - H.stat(p, "Cash")) end
end
local level = { damage = 0, rate = 0 }
local SHOP = {
	{ key = "shotgun", label = "Shotgun", price = 250 },
	{ key = "rifle", label = "Rifle", price = 600 },
	{ key = "rocketlauncher", label = "Rocket Launcher", price = 1200 },
	{ key = "minigun", label = "Minigun", price = 3000 },
	{ key = "damage", label = "Damage Upgrade", base = 150, upgrade = true },
	{ key = "rate", label = "Fire Rate Upgrade", base = 200, upgrade = true },
}
local function priceOf(item)
	if item.upgrade then return math.floor(item.base * 1.7 ^ level[item.key] / 10) * 10 end
	return item.price
end
local function labelOf(item)
	if item.bought then return item.label .. "\nOWNED" end
	if item.upgrade then return item.label .. " (Lv " .. (level[item.key] + 1) .. ")\n$" .. priceOf(item) end
	return item.label .. "\n$" .. priceOf(item)
end
local stall = Instance.new("Model")
stall.Name = "GunShop"
stall.Parent = workspace
H.part{ name = "Counter", pos = Vector3.new(0, 1.5, 16), size = Vector3.new(34, 3, 2), color = 192, mat = "Wood", parent = stall }
H.part{ name = "Roof", pos = Vector3.new(0, 9, 19), size = Vector3.new(36, 0.6, 8), color = 21, parent = stall }
for _, x in ipairs({ -17, 17 }) do H.part{ name = "Post", pos = Vector3.new(x, 4.5, 22), size = Vector3.new(0.8, 9, 0.8), color = 192, mat = "Wood", parent = stall } end
H.part{ name = "Sign", pos = Vector3.new(0, 10.4, 16), size = Vector3.new(14, 2.2, 0.4), color = 24, mat = "Neon", parent = stall }
for i, item in ipairs(SHOP) do
	local pad = H.part{ name = "ShopPad", pos = Vector3.new(-15 + (i - 1) * 6, 0.3, 12), size = Vector3.new(4, 0.4, 4), color = item.upgrade and 23 or 1020, mat = "Neon", parent = stall }
	local g = Instance.new("BillboardGui")
	g.Size = UDim2.new(0, 150, 0, 46)
	g.StudsOffset = Vector3.new(0, 3, 0)
	g.Adornee = pad
	local t = Instance.new("TextLabel", g)
	t.Size = UDim2.new(1, 0, 1, 0)
	t.BackgroundTransparency = 1
	t.TextColor3 = Color3.new(1, 1, 1)
	t.TextStrokeTransparency = 0.2
	t.Font = Enum.Font.SourceSansBold
	t.FontSize = Enum.FontSize.Size18
	t.Text = labelOf(item)
	g.Parent = pad
	local busy = false
	pad.Touched:connect(function(hit)
		local plr = H.playerOf(hit)
		if not plr or busy or item.bought then return end
		busy = true
		local price = priceOf(item)
		if cash < price then
			H.msg(plr, "You need $" .. (price - cash) .. " more. Kill zombies to earn cash!", 2)
		else
			addCash(-price)
			H.sound(pad, "electronicpingshort", 0.6)
			if item.upgrade then
				level[item.key] = level[item.key] + 1
				NET.boostGear("all", 1 + level.damage * 0.25, 1 + level.rate * 0.2)
				H.msg(plr, item.label .. " level " .. level[item.key] .. "!", 2)
			else
				item.bought = true
				NET.giveGear(item.key)
				H.msg(plr, "You bought the " .. item.label .. "! It's in your Backpack.", 2.5)
			end
			t.Text = labelOf(item)
		end
		wait(1)
		busy = false
	end)
end

local function everyone(fn) for _, p in pairs(Players:GetPlayers()) do pcall(fn, p) end end
local function zombie(n)
	local boss = n % 5 == 0 and math.random() < 0.3
	NPC.spawn{
		name = boss and "Big Zombie" or "Zombie",
		pos = spawns[math.random(1, #spawns)] + Vector3.new(math.random(-4, 4), 3, math.random(-4, 4)),
		colors = boss and { 28, 1003, 28, 26 } or { 37, 106, 37, 102 },
		arms = "forward",
		health = (boss and 400 or 60) + n * 10,
		speed = math.min(16, 8 + n * 0.6),
		damage = boss and 25 or 6 + n,
		rate = 1.2,
		range = 400,
		died = function(m, killer)
			if killer and killer.Parent then H.stat(killer, "Kills", 1) end
			addCash((boss and 100 or 10) + n * 2)
			H.sound(m:FindFirstChild("Head") or m, "uuhhh", 0.4)
		end,
	}
end

local function night()
	wave, dead = 0, false
	NPC.clear()
	while not dead do
		wave = wave + 1
		everyone(function(p) if H.stat(p, "Wave") < wave then H.stat(p, "Wave", wave - H.stat(p, "Wave")) end end)
		for i = (wave == 1 and 5 or 12), 1, -1 do
			H.bar("Wave " .. wave .. " starts in " .. i)
			wait(1)
			if dead then return end
		end
		local total = 3 + wave * 2
		local made = 0
		while not dead and (made < total or NPC.count() > 0) do
			if made < total and NPC.count() < 14 then made = made + 1 zombie(wave) end
			H.bar("Wave " .. wave .. ": " .. (total - made + NPC.count()) .. " zombies left")
			wait(made < total and 0.8 or 0.5)
		end
		if dead then return end
		if wave > best then best = wave end
		NET.toast(NET.myName() .. " survived wave " .. wave .. "!")
		addCash(25 * wave)
		H.msg(nil, "Wave " .. wave .. " survived! +$" .. (25 * wave) .. " - visit the gun shop!", 3)
		H.sound(workspace, "victory", 0.5)
		-- heal up between waves
		everyone(function(p) local h = p.Character and p.Character:FindFirstChild("Humanoid") if h then h.Health = h.MaxHealth end end)
		wait(3)
	end
end

local function watch(p)
	p.CharacterAdded:connect(function(c)
		H.stat(p, "Cash", cash - H.stat(p, "Cash")) H.stat(p, "Kills") H.stat(p, "Wave")
		c:WaitForChild("Humanoid").Died:connect(function()
			if dead then return end
			dead = true
			H.msg(nil, "The zombies got you on wave " .. wave .. ". Starting a new night...", 4)
			NPC.clear()
			wait(5)
			spawn(night)
		end)
	end)
end
Players.PlayerAdded:connect(watch)
for _, p in pairs(Players:GetPlayers()) do watch(p) end
wait(2)
H.msg(nil, "Survive the night! Shoot zombies for cash and spend it at the gun shop.", 4)
spawn(night)
