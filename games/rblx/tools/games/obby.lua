-- WebBlox obby kit (tools/build_games.py puts a GAME table above this).
-- Parts get their behaviour from their name:
--   KillBrick           touching it resets you
--   Checkpoint          + IntValue "Stage": saves your progress; you respawn on the highest one
--   Vanish              fades away a moment after you step on it, then comes back
--   Bounce              + NumberValue "Power": launches you upward
--   Speed               runs you at double speed for a few seconds
--   Spinner             spins around its own up axis (+ NumberValue "Speed", turns per second);
--                       it kills whoever its arms touch
--   Mover               + Vector3Value "Offset", NumberValue "Period": slides back and forth
--                       and carries whoever stands on it
--   Finish              the end: a win (or your time, in timer mode), then back to the start
--   Go                  timer mode (GAME.timer): crossing it starts your clock
--
-- Multiplayer (NET, games/net.lua): everyone in the server hears when someone reaches every fifth
-- stage or wins, and in timer mode the server's best time is shared (players who join later see it).
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local STAT = GAME.stat or "Stage"
local LAST = 1
local checkpoints = {}
local spinners, movers = {}, {}
local started = {}            -- timer mode: player -> tick() when they crossed Go

local function characterOf(hit)
	local char = hit and hit.Parent
	if char and not char:FindFirstChild("Humanoid") then char = char.Parent end
	local hum = char and char:FindFirstChild("Humanoid")
	if hum and hum.Health > 0 then return char, hum end
end
local function rootOf(char)
	return char and (char:FindFirstChild("HumanoidRootPart") or char:FindFirstChild("Torso"))
end
local function statOf(plr, name)
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
local function message(plr, text, seconds)
	local gui = plr:FindFirstChild("PlayerGui")
	if not gui then return end
	local old = gui:FindFirstChild("WebBloxMessage")
	if old then old:Destroy() end
	local sg = Instance.new("ScreenGui")
	sg.Name = "WebBloxMessage"
	local t = Instance.new("TextLabel")
	t.Size = UDim2.new(0, 460, 0, 56)
	t.Position = UDim2.new(0.5, -230, 0.22, 0)
	t.BackgroundColor3 = Color3.new(0, 0, 0)
	t.BackgroundTransparency = 0.35
	t.BorderSizePixel = 0
	t.TextColor3 = Color3.new(1, 1, 1)
	t.Font = Enum.Font.SourceSansBold
	t.FontSize = Enum.FontSize.Size28
	t.Text = text
	t.Parent = sg
	sg.Parent = gui
	delay(seconds or 3, function() if sg.Parent then sg:Destroy() end end)
end

-- a big number on top of each checkpoint
local function label(part, text)
	local sg = Instance.new("SurfaceGui")
	sg.Face = Enum.NormalId.Top
	sg.CanvasSize = Vector2.new(200, 200)
	local t = Instance.new("TextLabel")
	t.Size = UDim2.new(1, 0, 1, 0)
	t.BackgroundTransparency = 1
	t.TextColor3 = Color3.new(1, 1, 1)
	t.TextStrokeTransparency = 0.4
	t.Font = Enum.Font.SourceSansBold
	t.FontSize = Enum.FontSize.Size96
	t.Text = text
	t.Parent = sg
	sg.Parent = part
end

local busy = {}
local function setup(p)
	local kind = p.Name
	if kind == "KillBrick" then
		p.Touched:connect(function(hit)
			local _, hum = characterOf(hit)
			if hum then hum.Health = 0 end
		end)
	elseif kind == "Checkpoint" then
		local v = p:FindFirstChild("Stage")
		local n = v and v.Value or 1
		checkpoints[n] = p
		if n > LAST then LAST = n end
		if n > 1 then label(p, tostring(n)) end
		p.Touched:connect(function(hit)
			local char = characterOf(hit)
			local plr = char and Players:GetPlayerFromCharacter(char)
			local st = statOf(plr, STAT)
			if st and st.Value < n then
				st.Value = n
				if n % 5 == 0 and not GAME.timer then NET.send("stage", tostring(n)) end
				sound(p, "electronicpingshort.mp3", 0.5)
				local old = p.BrickColor
				p.BrickColor = BrickColor.new("Lime green")
				delay(0.4, function() p.BrickColor = old end)
			end
		end)
	elseif kind == "Vanish" then
		p.Touched:connect(function(hit)
			if busy[p] or not characterOf(hit) then return end
			busy[p] = true
			delay(0.35, function()
				for i = 1, 6 do p.Transparency = i * 0.13 wait(0.05) end
				p.CanCollide = false
				wait(2.5)
				p.CanCollide = true
				p.Transparency = 0
				busy[p] = nil
			end)
		end)
	elseif kind == "Bounce" then
		local power = p:FindFirstChild("Power") and p.Power.Value or 110
		p.Touched:connect(function(hit)
			local char = characterOf(hit)
			local root = rootOf(char)
			if not root or busy[char] then return end
			busy[char] = true
			local v = root.Velocity
			root.Velocity = Vector3.new(v.X, power, v.Z)
			sound(p, "Rubber band sling shot.mp3", 0.5)
			delay(0.3, function() busy[char] = nil end)
		end)
	elseif kind == "Speed" then
		p.Touched:connect(function(hit)
			local char, hum = characterOf(hit)
			if not hum or busy[hum] then return end
			busy[hum] = true
			hum.WalkSpeed = 36
			delay(3, function() hum.WalkSpeed = 16 busy[hum] = nil end)
		end)
	elseif kind == "Spinner" then
		local speed = p:FindFirstChild("Speed") and p.Speed.Value or 0.4
		table.insert(spinners, { part = p, speed = speed * 2 * math.pi, base = p.CFrame, angle = 0 })
	elseif kind == "Mover" then
		local off = p:FindFirstChild("Offset") and p.Offset.Value or Vector3.new(0, 0, 12)
		local period = p:FindFirstChild("Period") and p.Period.Value or 4
		table.insert(movers, { part = p, base = p.CFrame, offset = off, period = period, last = p.CFrame })
	elseif kind == "Go" then
		p.Touched:connect(function(hit)
			local char = characterOf(hit)
			local plr = char and Players:GetPlayerFromCharacter(char)
			if plr and not started[plr] then started[plr] = tick() end
		end)
	elseif kind == "Finish" then
		p.Touched:connect(function(hit)
			local char = characterOf(hit)
			local plr = char and Players:GetPlayerFromCharacter(char)
			if not plr or busy[plr] then return end
			if GAME.timer and not started[plr] then return end
			busy[plr] = true
			sound(p, "victory.mp3", 0.8)
			if GAME.timer then
				local time = math.floor((tick() - started[plr]) * 100 + 0.5) / 100
				started[plr] = nil
				local best, runs = statOf(plr, "Best"), statOf(plr, "Runs")
				if runs then runs.Value = runs.Value + 1 end
				local record = best and (best.Value == 0 or time < best.Value)
				if record then best.Value = time end
				-- the server's best time, shared with everyone: "12.34|Name"
				local srv = tonumber(string.match(NET.get("record") or "", "^([%d%.]+)|"))
				local serverRecord = not srv or time < srv
				if serverRecord then NET.set("record", string.format("%.2f|%s", time, NET.myName())) end
				NET.send("time", string.format("%.2f", time))
				message(plr, string.format("%.2f seconds!%s", time, serverRecord and " Server record!" or record and " New best!" or ""), 4)
			else
				local wins = statOf(plr, "Wins")
				if wins then wins.Value = wins.Value + 1 end
				NET.send("win", "")
				message(plr, GAME.winText or "You win!", 4)
			end
			local sp = Instance.new("Sparkles")
			sp.Parent = rootOf(char)
			delay(4, function()
				local st = statOf(plr, STAT)
				if st then st.Value = 1 end
				busy[plr] = nil
				if plr.Character == char then
					local hum = char:FindFirstChild("Humanoid")
					if hum then hum.Health = 0 end   -- respawn at the start
				end
			end)
		end)
	end
end
local function scan(obj)
	for _, c in pairs(obj:GetChildren()) do
		if c:IsA("BasePart") then setup(c) end
		scan(c)
	end
end
scan(workspace)

-- characters standing on a part (for movers)
local function standingOn(part)
	local out = {}
	local half = part.Size / 2
	for _, plr in pairs(Players:GetPlayers()) do
		local root = rootOf(plr.Character)
		if root then
			local rel = part.CFrame:pointToObjectSpace(root.Position)
			if math.abs(rel.X) <= half.X + 0.5 and math.abs(rel.Z) <= half.Z + 0.5 and rel.Y > half.Y and rel.Y < half.Y + 4.5 then
				table.insert(out, root)
			end
		end
	end
	return out
end
-- does a spinning arm touch this point?
local function onArm(s, pos)
	local p = s.part
	local rel = p.CFrame:pointToObjectSpace(pos)
	local half = p.Size / 2
	return math.abs(rel.X) <= half.X + 1 and math.abs(rel.Z) <= half.Z + 1 and math.abs(rel.Y) <= half.Y + 2.5
end

local t0 = tick()
RunService.Stepped:connect(function(_, dt)
	dt = math.min(dt or 0.03, 0.1)
	local t = tick() - t0
	for _, s in ipairs(spinners) do
		s.angle = s.angle + s.speed * dt
		s.part.CFrame = s.base * CFrame.Angles(0, s.angle, 0)
		for _, plr in pairs(Players:GetPlayers()) do
			local char = plr.Character
			local root = rootOf(char)
			local hum = char and char:FindFirstChild("Humanoid")
			if root and hum and hum.Health > 0 and onArm(s, root.Position) then hum.Health = 0 end
		end
	end
	for _, m in ipairs(movers) do
		local k = (1 - math.cos(t / m.period * 2 * math.pi)) / 2
		local cf = m.base + m.offset * k
		local delta = cf.p - m.last.p
		for _, root in ipairs(standingOn(m.part)) do root.CFrame = root.CFrame + delta end
		m.part.CFrame = cf
		m.last = cf
	end
end)

-- timer mode: the clock on screen
local function timerLabel(plr)
	local gui = plr:FindFirstChild("PlayerGui")
	if not gui then return end
	local sg = gui:FindFirstChild("WebBloxTimer")
	if not sg then
		sg = Instance.new("ScreenGui")
		sg.Name = "WebBloxTimer"
		local t = Instance.new("TextLabel")
		t.Name = "Time"
		t.Size = UDim2.new(0, 220, 0, 44)
		t.Position = UDim2.new(0.5, -110, 0, 44)
		t.BackgroundColor3 = Color3.new(0, 0, 0)
		t.BackgroundTransparency = 0.4
		t.BorderSizePixel = 0
		t.TextColor3 = Color3.new(1, 1, 1)
		t.Font = Enum.Font.SourceSansBold
		t.FontSize = Enum.FontSize.Size28
		t.Parent = sg
		sg.Parent = gui
	end
	return sg:FindFirstChild("Time")
end
if GAME.timer then
	RunService.Stepped:connect(function()
		for _, plr in pairs(Players:GetPlayers()) do
			local t = timerLabel(plr)
			if t then
				local s = started[plr]
				t.Text = s and string.format("Time: %.2f", tick() - s) or "Cross the line to start!"
			end
		end
	end)
end

-- leaderstats, and respawning on your last checkpoint
local function onCharacter(plr, char)
	started[plr] = nil
	local root = char:WaitForChild("HumanoidRootPart")
	wait(0.1)
	local st = statOf(plr, STAT)
	local cp = st and checkpoints[st.Value]
	if cp and st.Value > 1 then char:MoveTo(cp.Position + Vector3.new(0, 3, 0)) end
end
local function onPlayer(plr)
	if plr:FindFirstChild("leaderstats") then return end
	local ls = Instance.new("IntValue")
	ls.Name = "leaderstats"
	local function stat(class, name, value)
		local v = Instance.new(class)
		v.Name = name
		v.Value = value
		v.Parent = ls
	end
	if GAME.timer then
		stat("NumberValue", "Best", 0)
		stat("IntValue", "Runs", 0)
	else
		stat("IntValue", STAT, 1)
		stat("IntValue", "Wins", 0)
	end
	ls.Parent = plr
	plr.CharacterAdded:connect(function(c) onCharacter(plr, c) end)
	if plr.Character then spawn(function() onCharacter(plr, plr.Character) end) end
end
Players.PlayerAdded:connect(onPlayer)
for _, plr in pairs(Players:GetPlayers()) do onPlayer(plr) end

-- what the other players are up to
NET.on(function(topic, data, fromId, fromName)
	local who = fromName ~= "" and fromName or "Someone"
	if topic == "stage" then
		NET.toast(who .. " reached " .. string.lower(STAT) .. " " .. data .. "!")
	elseif topic == "win" then
		NET.toast(who .. " beat " .. (GAME.title or "the obby") .. "!")
	elseif topic == "time" then
		NET.toast(who .. " finished in " .. data .. " seconds")
	end
end)
if GAME.timer then
	-- the server record, at the top of the screen
	-- (shown again after each respawn: the 2016 engine clears your GUIs then)
	local recordText = "Server record: none yet"
	local function showRecord(plr)
		local gui = plr:FindFirstChild("PlayerGui")
		if not gui then return end
		local sg = gui:FindFirstChild("GNRecord")
		if not sg then
			sg = Instance.new("ScreenGui")
			sg.Name = "GNRecord"
			local l = Instance.new("TextLabel")
			l.Name = "Text"
			l.Size = UDim2.new(0, 320, 0, 28)
			l.Position = UDim2.new(0.5, -160, 0, 40)
			l.BackgroundColor3 = Color3.new(0.1, 0.1, 0.1)
			l.BackgroundTransparency = 0.3
			l.BorderSizePixel = 0
			l.TextColor3 = Color3.new(1, 0.85, 0.2)
			l.Font = Enum.Font.SourceSansBold
			l.FontSize = Enum.FontSize.Size24
			l.Parent = sg
			sg.Parent = gui
		end
		sg.Text.Text = recordText
	end
	NET.watch("record", function(value)
		local t, name = string.match(value or "", "^([%d%.]+)|(.*)$")
		recordText = t and ("Server record: " .. t .. "s by " .. name) or "Server record: none yet"
		for _, plr in pairs(Players:GetPlayers()) do showRecord(plr) end
	end)
	local function hookRecord(plr)
		plr.CharacterAdded:connect(function() wait(1) showRecord(plr) end)
		spawn(function() wait(2) showRecord(plr) end)
	end
	Players.PlayerAdded:connect(hookRecord)
	for _, plr in pairs(Players:GetPlayers()) do hookRecord(plr) end
end
