-- Brick Battle Peaks: four castle towers on a floating island. You get the whole combat kit;
-- bots from the other towers come for you (other players are fair game too).
-- Map (build_games.py): Models Tower_<Color> with a part BotSpawn each and a SpawnLocation.
-- Stats: KOs, Wipeouts.
local Players = game:GetService("Players")
local towers = {}
for _, d in pairs(workspace:GetChildren()) do
	if d:IsA("Model") and string.sub(d.Name, 1, 6) == "Tower_" then
		local s = d:FindFirstChild("BotSpawn")
		local color = d:FindFirstChild("Color")
		if s then towers[#towers + 1] = { pos = s.Position, color = color and color.Value or 194, name = string.sub(d.Name, 7) } end
	end
end
NET.giveGear("sword,rocketlauncher,slingshot,timebomb,superball")

local function bot()
	local t = towers[math.random(1, #towers)]
	NPC.spawn{
		name = t.name .. " Bot",
		pos = t.pos + Vector3.new(0, 3, 0),
		colors = { 24, t.color, t.color, 26 },
		sword = true,
		health = 100,
		speed = 14,
		damage = 10,
		rate = 1,
		range = 260,
		died = function(m, killer)
			if killer and killer.Parent then
				H.stat(killer, "KOs", 1)
				local k = H.stat(killer, "KOs")
				if k % 10 == 0 then NET.toast(NET.myName() .. " has " .. k .. " KOs!") end
			end
		end,
	}
end
local function watch(p)
	p.CharacterAdded:connect(function(c)
		H.stat(p, "KOs") H.stat(p, "Wipeouts")
		c:WaitForChild("Humanoid").Died:connect(function() H.stat(p, "Wipeouts", 1) end)
	end)
end
Players.PlayerAdded:connect(watch)
for _, p in pairs(Players:GetPlayers()) do watch(p) end
wait(3)
H.msg(nil, "Battle! Knock out the bots from the other towers.", 4)
wait(4)
H.every(4, function()
	local want = 5
	if NPC.count() < want then bot() end
end)
