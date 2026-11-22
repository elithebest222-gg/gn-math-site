-- Undead Nights: hold out in a walled town against waves of zombies.
-- Map (build_games.py): parts named ZombieSpawn where zombies come from, a SpawnLocation in the square.
-- Every wave has more, tougher and faster zombies; more gear unlocks as you go. If you die the
-- night starts over. Stats: Kills, Wave.
local spawns = {}
for _, d in pairs(workspace:GetChildren()) do
	if d:IsA("Model") then for _, p in pairs(d:GetChildren()) do if p.Name == "ZombieSpawn" then spawns[#spawns + 1] = p.Position end end end
end
local UNLOCK = { [1] = "sword,slingshot", [3] = "paintballgun", [5] = "rocketlauncher", [7] = "timebomb", [9] = "superball" }
local wave, best = 0, 0
local dead = false
local Players = game:GetService("Players")

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
			H.sound(m:FindFirstChild("Head") or m, "uuhhh", 0.4)
		end,
	}
end

local function night()
	wave, dead = 0, false
	NPC.clear()
	while not dead do
		wave = wave + 1
		if UNLOCK[wave] then
			NET.giveGear(UNLOCK[wave])
			if wave > 1 then H.msg(nil, "New gear in your Backpack!", 3) end
		end
		everyone(function(p) if H.stat(p, "Wave") < wave then H.stat(p, "Wave", wave - H.stat(p, "Wave")) end end)
		for i = 5, 1, -1 do
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
		H.msg(nil, "Wave " .. wave .. " survived!", 3)
		H.sound(workspace, "victory", 0.5)
		-- heal up between waves
		everyone(function(p) local h = p.Character and p.Character:FindFirstChild("Humanoid") if h then h.Health = h.MaxHealth end end)
		wait(3)
	end
end

local function watch(p)
	p.CharacterAdded:connect(function(c)
		H.stat(p, "Kills") H.stat(p, "Wave")
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
H.msg(nil, "Survive the night! Click to swing your sword.", 4)
spawn(night)
