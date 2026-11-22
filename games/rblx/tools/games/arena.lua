-- Sword Clash Arena: one sword, a ring over lava, and challengers that get tougher every round.
-- Win a duel and the next challenger is faster and hits harder. Stats: Streak, Best.
local Players = game:GetService("Players")
local gate = workspace.Arena:FindFirstChild("Gate")
local round = 0
NET.giveGear("sword")
local NAMES = { "Rookie", "Squire", "Knight", "Duelist", "Veteran", "Champion", "Warlord", "Legend" }
local COLORS = { 1001, 106, 23, 1004, 26, 24, 1032, 21 }

local function challenger()
	round = round + 1
	local i = math.min(round, #NAMES)
	local c = COLORS[i]
	H.bar("Round " .. round .. ": " .. NAMES[i])
	NPC.spawn{
		name = NAMES[i] .. (round > #NAMES and (" " .. round) or ""),
		pos = gate.Position + Vector3.new(0, 3, 0),
		colors = { 24, c, c, 26 },
		sword = true,
		health = 60 + round * 15,
		speed = math.min(18, 11 + round),
		damage = 8 + round * 2,
		rate = math.max(0.5, 1.1 - round * 0.05),
		range = 200,
		died = function(m, killer)
			for _, p in pairs(Players:GetPlayers()) do
				local s = H.stat(p, "Streak", 1)
				if s > H.stat(p, "Best") then H.stat(p, "Best", s - H.stat(p, "Best")) end
				if s % 5 == 0 then NET.toast(NET.myName() .. " is on a " .. s .. " win streak!") end
			end
			H.msg(nil, "You beat the " .. NAMES[i] .. "!", 2.5)
			H.sound(workspace, "victory", 0.4)
			delay(4, function()
				for _, p in pairs(Players:GetPlayers()) do
					local h = p.Character and p.Character:FindFirstChild("Humanoid")
					if h and h.Health > 0 then h.Health = math.min(h.MaxHealth, h.Health + 40) end
				end
				challenger()
			end)
		end,
	}
end
local function watch(p)
	p.CharacterAdded:connect(function(c)
		H.stat(p, "Streak") H.stat(p, "Best")
		c:WaitForChild("Humanoid").Died:connect(function()
			H.stat(p, "Streak", -H.stat(p, "Streak"))
			H.msg(p, "Defeated! Back to round 1.", 3)
			NPC.clear()
			round = 0
			delay(6, challenger)
		end)
	end)
end
Players.PlayerAdded:connect(watch)
for _, p in pairs(Players:GetPlayers()) do watch(p) end
-- lava around the ring
for _, p in pairs(workspace.Arena:GetChildren()) do
	if p.Name == "Lava" then
		p.Touched:connect(function(hit)
			local char, hum = H.charOf(hit)
			if hum then hum.Health = 0 end
		end)
	end
end
wait(3)
H.msg(nil, "Beat challenger after challenger. Click to swing!", 4)
wait(4)
challenger()
