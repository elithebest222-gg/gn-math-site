-- Cellblock Breakout: you wake up in a cell. Find the spoon, dig through the loose wall, sneak
-- through the guard room for a keycard, get out to the yard and climb over the wall to freedom.
-- Guards who catch you send you back to your cell (and you lose what you were carrying).
-- Map parts (build_games.py): Spoon, LooseWall, Keycard, SecurityDoor, Freedom, CellSpawn (the
-- SpawnLocation), GuardPost<group><n> (patrol points: group A = guard room, B = yard, C = corridor).
-- Stats: Escapes, Caught.
local Players = game:GetService("Players")
local find = function(name)
	for _, d in pairs(workspace:GetChildren()) do
		local p = d.Name == name and d or (d:IsA("Model") and d:FindFirstChild(name, true))
		if p then return p end
	end
end
local spoon, wall, card, door, freedom, cell = find("Spoon"), find("LooseWall"), find("Keycard"), find("SecurityDoor"), find("Freedom"), find("CellSpawn")
local carrying = {}   -- player -> { spoon = true, card = true }
local function has(plr, what) return carrying[plr] and carrying[plr][what] end
local function give(plr, what, text)
	carrying[plr] = carrying[plr] or {}
	if carrying[plr][what] then return end
	carrying[plr][what] = true
	H.msg(plr, text, 3)
	H.sound(workspace, "electronicpingshort", 0.5)
end
local function open(part, secs)
	if part.Transparency > 0.5 then return end
	part.Transparency, part.CanCollide = 0.8, false
	H.sound(part, "switch", 0.6)
	delay(secs, function() part.Transparency, part.CanCollide = 0, true end)
end
local function arrest(guard, char, hum)
	local plr = Players:GetPlayerFromCharacter(char)
	if not plr or char:FindFirstChild("GNArrested") then return end
	local tag = Instance.new("BoolValue")
	tag.Name = "GNArrested"
	tag.Parent = char
	game:GetService("Debris"):AddItem(tag, 3)
	carrying[plr] = {}
	H.stat(plr, "Caught", 1)
	H.msg(plr, "Busted! Back to your cell.", 3)
	H.sound(char:FindFirstChild("Head") or char, "SWITCH3", 0.7)
	local root = char:FindFirstChild("HumanoidRootPart")
	if root then root.CFrame = cell.CFrame + Vector3.new(0, 3, 0) end
end
spoon.Touched:connect(function(hit) local p = H.playerOf(hit) if p then give(p, "spoon", "You found a spoon! Dig through the cracked wall in your cell.") end end)
card.Touched:connect(function(hit) local p = H.playerOf(hit) if p then give(p, "card", "Keycard! It opens the security door to the yard.") end end)
wall.Touched:connect(function(hit)
	local p = H.playerOf(hit)
	if not p then return end
	if has(p, "spoon") then open(wall, 5) else H.msg(p, "This wall is cracked... if only you had something to dig with.", 2) end
end)
door.Touched:connect(function(hit)
	local p = H.playerOf(hit)
	if not p then return end
	if has(p, "card") then open(door, 4) else H.msg(p, "Locked. You need a keycard.", 2) end
end)
local escaping = {}
freedom.Touched:connect(function(hit)
	local p = H.playerOf(hit)
	if not p or escaping[p] then return end
	escaping[p] = true
	local n = H.stat(p, "Escapes", 1)
	NET.toast(NET.myName() .. " broke out of prison! (" .. n .. (n == 1 and " escape)" or " escapes)"))
	H.msg(p, "You escaped! The guards will be more careful next time...", 4)
	H.sound(workspace, "victory", 0.6)
	carrying[p] = {}
	wait(5)
	local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
	if root then root.CFrame = cell.CFrame + Vector3.new(0, 3, 0) end
	escaping[p] = false
end)

-- guards
local posts = {}
for _, d in pairs(workspace:GetChildren()) do
	if d:IsA("Model") then
		for _, p in pairs(d:GetChildren()) do
			local g, n = string.match(p.Name, "^GuardPost(%a)(%d+)$")
			if g then posts[g] = posts[g] or {} posts[g][tonumber(n)] = p.Position end
		end
	end
end
local function guard(group, i)
	local route = posts[group]
	if not route or not route[1] then return end
	NPC.spawn{
		name = "Guard",
		pos = route[((i - 1) % #route) + 1] + Vector3.new(0, 3, 0),
		colors = { 24, 23, 23, 1010 },
		speed = 14.5,
		range = group == "A" and 26 or 34,
		patrol = route,
		health = 100000,
		hit = arrest,
		died = function() delay(10, function() guard(group, i) end) end,
	}
end
guard("A", 1) guard("A", 3)
guard("B", 1) guard("B", 4)
guard("C", 1)
Players.PlayerAdded:connect(function(p) p.CharacterAdded:connect(function() carrying[p] = {} H.stat(p, "Escapes") H.stat(p, "Caught") end) end)
for _, p in pairs(Players:GetPlayers()) do carrying[p] = {} H.stat(p, "Escapes") H.stat(p, "Caught") end
wait(3)
H.msg(nil, "You're locked up. Look around your cell...", 4)
