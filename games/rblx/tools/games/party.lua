-- Party Panic (tools/build_games.py): a new minigame every round, on its own map.
--
-- Rounds run on the multiplayer room's shared clock (ReplicatedStorage.WebBlox), and every random
-- thing in a round (which minigame, the tiles' colors, where meteors fall, the obby's course...)
-- comes from the room and the round number, so everyone in a server plays the same minigame at
-- the same time. Coins, XP / Level and Wins are saved on the device (DataStore).
--
-- Each minigame: name, tip, build() (once, at the start), reset(rng) (before each round),
-- spawn(i, rng) -> where player i starts, step(t, dt, rng) (while it runs; t = seconds in),
-- killY (falling below it is out), won(st) -> did this player win (st: alive, score).
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Debris = game:GetService("Debris")
local store = game:GetService("ReplicatedStorage")

local ROUND = 80
local LOBBY_END, PLAY_START, PLAY_END = 12, 16, 74   -- seconds into the round
local lobby = workspace:WaitForChild("Lobby")
local lobbySpawn = lobby:WaitForChild("Spawn")

-- ---------------------------------------------------------------- the shared clock and randomness
local function wb(name)
	local f = store:FindFirstChild("WebBlox")
	return f and f:FindFirstChild(name)
end
local function now()
	local off = wb("ClockOffset")
	return tick() + (off and off.Value or 0)
end
local function roomName()
	local r = wb("Room")
	return r and r.Value ~= "" and r.Value or "solo"
end
local function hash(text, n)
	local h = 5381
	for i = 1, #text do h = (h * 33 + string.byte(text, i)) % 2147483647 end
	h = (h + n * 7919 + 1) % 2147483647
	for _ = 1, 4 do h = (h * 48271) % 2147483647 end
	return h
end
-- a random number source everyone in the room gets the same numbers from
local function newRng(seed)
	local s = seed % 2147483646 + 1
	local r = {}
	function r.next() s = (s * 48271) % 2147483647 return s / 2147483647 end
	function r.int(a, b) return a + math.floor(r.next() * (b - a + 1)) end
	function r.num(a, b) return a + r.next() * (b - a) end
	function r.pick(t) return t[r.int(1, #t)] end
	return r
end

-- ---------------------------------------------------------------- players
local playing = {}       -- player -> { alive, score }
local saved = {}         -- player -> { coins, xp, wins }
local ds
pcall(function() ds = game:GetService("DataStoreService"):GetDataStore("GNPartyPanic") end)
local function levelOf(xp) return math.floor(math.sqrt((xp or 0) / 40)) + 1 end
local function showStats(p)
	local d = saved[p]
	if not d then return end
	H.stat(p, "Level", levelOf(d.xp) - H.stat(p, "Level"))
	H.stat(p, "Wins", d.wins - H.stat(p, "Wins"))
	H.stat(p, "Coins", d.coins - H.stat(p, "Coins"))
end
local function load(p)
	local d
	pcall(function() d = ds and ds:GetAsync("save") end)
	if type(d) ~= "table" then d = {} end
	saved[p] = { coins = tonumber(d.coins) or 0, xp = tonumber(d.xp) or 0, wins = tonumber(d.wins) or 0 }
	showStats(p)
end
local function save(p)
	local d = saved[p]
	if d and ds then pcall(function() ds:SetAsync("save", d) end) end
end
local function rootOf(p)
	local c = p.Character
	return c and c:FindFirstChild("HumanoidRootPart"), c and c:FindFirstChild("Humanoid")
end
local function teleport(p, pos)
	local root = rootOf(p)
	if root then
		root.CFrame = CFrame.new(pos + Vector3.new(0, 3, 0))
		root.Velocity = Vector3.new()
	end
end
local function out(p, why)
	local st = playing[p]
	if not st or not st.alive then return end
	st.alive = false
	H.msg(p, why or "You're out!", 2)
	H.sound(workspace, "uuhhh", 0.4)
	delay(1, function() if playing[p] and not playing[p].alive then teleport(p, lobbySpawn.Position) end end)
end
local function alive()
	local n = 0
	for _, st in pairs(playing) do if st.alive then n = n + 1 end end
	return n
end

-- ---------------------------------------------------------------- helpers for building
local function model(name)
	local m = Instance.new("Model")
	m.Name = name
	m.Parent = workspace
	return m
end
local PALETTE = { 21, 23, 24, 37, 1031, 106 }   -- red, blue, yellow, green, purple, orange
local COLOR_NAME = { [21] = "RED", [23] = "BLUE", [24] = "YELLOW", [37] = "GREEN", [1031] = "PURPLE", [106] = "ORANGE" }

local G = {}
local order = {}
local function minigame(key, def) def.key = key G[key] = def order[#order + 1] = key end

-- ---------------------------------------------------------------- 1. Tumble Tiles
do
	local O = Vector3.new(700, 200, 0)
	local tiles = {}
	local armed = false     -- tiles only fall once the round has started (not during the countdown)
	minigame("tiles", {
		name = "Tumble Tiles", tip = "Tiles fall a moment after you step on them. Keep moving!",
		killY = O.Y - 70,
		build = function()
			local m = model("TumbleTiles")
			for layer = 0, 2 do
				for x = -5, 5 do
					for z = -5, 5 do
						local t = H.part{ name = "Tile", parent = m, size = Vector3.new(5.6, 1, 5.6), mat = "SmoothPlastic",
							pos = O + Vector3.new(x * 6, -layer * 22, z * 6), color = ({ 1004, 24, 23 })[layer + 1] }
						tiles[#tiles + 1] = t
						t.Touched:connect(function(hit)
							if not armed or t:FindFirstChild("Falling") or t.Transparency > 0.5 or not H.playerOf(hit) then return end
							local f = Instance.new("BoolValue", t) f.Name = "Falling"
							t.BrickColor = BrickColor.new(1001)
							delay(0.55, function() t.Transparency, t.CanCollide = 1, false end)
						end)
					end
				end
			end
			H.part{ name = "Void", parent = m, pos = O + Vector3.new(0, -66, 0), size = Vector3.new(90, 1, 90), color = 1004, mat = "Neon", alpha = 0.3, collide = false }
		end,
		reset = function()
			armed = false
			for _, t in ipairs(tiles) do
				t.Transparency, t.CanCollide = 0, true
				local f = t:FindFirstChild("Falling") if f then f:Destroy() end
				t.BrickColor = BrickColor.new(({ [200] = 1004, [178] = 24, [156] = 23 })[math.floor(t.Position.Y + 0.5)] or 24)
			end
		end,
		spawn = function(i, rng) return O + Vector3.new(rng.int(-4, 4) * 6, 1, rng.int(-4, 4) * 6) end,
		step = function(t) armed = true end,
	})
end

-- ---------------------------------------------------------------- 2. Color Clash
do
	local O = Vector3.new(1400, 200, 0)
	local tiles = {}
	local wave, waveAt, safe
	minigame("color", {
		name = "Color Clash", tip = "Stand on the color that's called. The rest disappear!",
		killY = O.Y - 40,
		build = function()
			local m = model("ColorClash")
			for x = -4, 4 do for z = -4, 4 do
				tiles[#tiles + 1] = H.part{ name = "Tile", parent = m, size = Vector3.new(7.8, 1, 7.8), pos = O + Vector3.new(x * 8, 0, z * 8), mat = "SmoothPlastic" }
			end end
			H.part{ name = "Void", parent = m, pos = O + Vector3.new(0, -30, 0), size = Vector3.new(120, 1, 120), color = 26, mat = "Neon", collide = false, alpha = 0.5 }
		end,
		reset = function(rng) wave, waveAt, safe = 0, 0, nil for _, t in ipairs(tiles) do t.BrickColor = BrickColor.new(rng.pick(PALETTE)) t.Transparency, t.CanCollide = 0, true end end,
		spawn = function(i, rng) return O + Vector3.new(rng.int(-3, 3) * 8, 1, rng.int(-3, 3) * 8) end,
		step = function(t, dt, rng)
			-- each wave: colors shuffle, a color is called, the others vanish, faster every wave
			local len = math.max(3.2, 8 - wave * 0.6)
			if t >= waveAt then
				wave = wave + 1
				local wrng = newRng(hash(roomName() .. "color", wave * 31 + math.floor(t)))
				safe = wrng.pick(PALETTE)
				for _, p in ipairs(tiles) do p.Transparency, p.CanCollide = 0, true p.BrickColor = BrickColor.new(wrng.pick(PALETTE)) end
				waveAt = t + len
				H.bar("Color Clash: " .. COLOR_NAME[safe] .. "!")
				H.sound(workspace, "electronicpingshort", 0.5)
			elseif safe and t >= waveAt - 1.4 then
				for _, p in ipairs(tiles) do if p.BrickColor.Number ~= safe then p.Transparency, p.CanCollide = 0.85, false end end
			end
		end,
	})
end

-- ---------------------------------------------------------------- 3. Spin Cycle
do
	local O = Vector3.new(2100, 200, 0)
	local bars = {}
	minigame("spin", {
		name = "Spin Cycle", tip = "Jump over the spinning bars. They keep getting faster!",
		killY = O.Y - 30,
		build = function()
			local m = model("SpinCycle")
			H.part{ name = "Floor", parent = m, pos = O, size = Vector3.new(1, 70, 70), shape = "cyl", color = 1002, mat = "Slate", cf = CFrame.new(O) * CFrame.Angles(0, 0, math.pi / 2) }
			H.part{ name = "Hub", parent = m, pos = O + Vector3.new(0, 3, 0), size = Vector3.new(4, 6, 6), shape = "cyl", color = 26, mat = "Metal", cf = CFrame.new(O + Vector3.new(0, 2.5, 0)) * CFrame.Angles(0, 0, math.pi / 2) }
			for i = 1, 3 do
				local b = H.part{ name = "Bar", parent = m, size = Vector3.new(66, 1.4, 1.4), color = 21, mat = "Neon", collide = false }
				bars[i] = b
				b.Touched:connect(function(hit) local p = H.playerOf(hit) if p and playing[p] and playing[p].alive and b.Transparency < 0.5 then out(p, "The bar got you!") end end)
			end
			H.part{ name = "Void", parent = m, pos = O + Vector3.new(0, -25, 0), size = Vector3.new(140, 1, 140), color = 1004, mat = "Neon", collide = false, alpha = 0.3 }
		end,
		reset = function() for i, b in ipairs(bars) do b.Transparency = i == 1 and 0 or 1 b.CFrame = CFrame.new(O + Vector3.new(0, 1.6, 0)) end end,
		spawn = function(i, rng) local a = rng.num(0, math.pi * 2) return O + Vector3.new(math.cos(a) * 20, 1, math.sin(a) * 20) end,
		step = function(t)
			local count = t > 34 and 3 or t > 16 and 2 or 1
			local speed = 0.9 + t * 0.045
			for i, b in ipairs(bars) do
				b.Transparency = i <= count and 0 or 1
				b.CFrame = CFrame.new(O + Vector3.new(0, 1.6, 0)) * CFrame.Angles(0, t * speed * (i == 2 and -1 or 1) + i * 2.1, 0)
				-- (a bar moved like this doesn't always register touches: check where everyone's feet are)
				if i <= count then
					for p, st in pairs(playing) do
						local root = rootOf(p)
						if st.alive and root then
							local rel = b.CFrame:pointToObjectSpace(root.Position)
							local feet = root.Position.Y - 3
							if math.abs(rel.X) < 33 and math.abs(rel.Z) < 1.4 and feet < b.Position.Y + 0.7 and feet > b.Position.Y - 3 then out(p, "The bar got you!") end
						end
					end
				end
			end
		end,
	})
end

-- ---------------------------------------------------------------- 4. Lava Tower
do
	local O = Vector3.new(2800, 200, 0)
	local built, lava, goal
	local TOP = 90
	minigame("lava", {
		name = "Lava Tower", tip = "The lava is rising! Climb to the golden pad at the top.",
		killY = O.Y - 40,
		build = function()
			local m = model("LavaTower")
			H.part{ name = "Base", parent = m, pos = O, size = Vector3.new(60, 2, 60), color = 1030, mat = "Slate" }
			H.part{ name = "Pillar", parent = m, pos = O + Vector3.new(0, TOP / 2, 0), size = Vector3.new(10, TOP + 4, 10), color = 1002, mat = "Cobblestone" }
			lava = H.part{ name = "Lava", parent = m, size = Vector3.new(80, 2, 80), color = 1004, mat = "Neon", collide = false, alpha = 0.15 }
			lava.Touched:connect(function(hit) local p = H.playerOf(hit) if p and playing[p] and playing[p].alive then out(p, "Burned by the lava!") end end)
			goal = H.part{ name = "Goal", parent = m, pos = O + Vector3.new(0, TOP + 3, 0), size = Vector3.new(14, 1, 14), color = 24, mat = "Neon" }
			goal.Touched:connect(function(hit)
				local p = H.playerOf(hit)
				local st = p and playing[p]
				if st and st.alive and st.score == 0 then st.score = 1 H.msg(p, "You made it to the top!", 2) H.sound(workspace, "victory", 0.4) end
			end)
		end,
		reset = function(rng)
			if built then built:Destroy() end
			built = model("LavaSteps")
			-- a new climb every round: steps spiral up around the pillar
			local a, y = rng.num(0, 6.28), 2
			while y < TOP do
				a = a + rng.num(0.45, 0.85)
				y = y + rng.num(2.2, 3.6)
				local r = rng.num(9, 16)
				local kind = rng.next()
				local p = H.part{ name = "Step", parent = built, pos = O + Vector3.new(math.cos(a) * r, y, math.sin(a) * r),
					size = kind < 0.2 and Vector3.new(2.5, 1, 2.5) or Vector3.new(5, 1, 5), color = PALETTE[1 + math.floor(y / 15) % #PALETTE], mat = "SmoothPlastic" }
				if kind > 0.92 then H.part{ name = "Truss", parent = built, class = "TrussPart", pos = p.Position + Vector3.new(0, 6, 0), size = Vector3.new(2, 10, 2), color = 194, mat = "Metal" } y = y + 8 end
			end
			lava.CFrame = CFrame.new(O + Vector3.new(0, -3, 0))
		end,
		spawn = function(i, rng) local a = rng.num(0, 6.28) return O + Vector3.new(math.cos(a) * 22, 1, math.sin(a) * 22) end,
		step = function(t)
			local y = math.min(TOP - 4, math.max(-3, (t - 8) * 1.8))
			lava.CFrame = CFrame.new(O + Vector3.new(0, y, 0))
			for p, st in pairs(playing) do
				local root = rootOf(p)
				if st.alive and st.score == 0 and root and root.Position.Y - 3 < O.Y + y + 1 then out(p, "Burned by the lava!") end
			end
		end,
		won = function(st) return st.alive and st.score > 0 end,
	})
end

-- ---------------------------------------------------------------- 5. Coin Rush
do
	local O = Vector3.new(3500, 200, 0)
	local coins = {}
	local TARGET = 20
	minigame("coins", {
		name = "Coin Rush", tip = "Grab " .. TARGET .. " coins before time runs out!",
		killY = O.Y - 40,
		build = function()
			local m = model("CoinRush")
			H.part{ name = "Ground", parent = m, pos = O, size = Vector3.new(120, 2, 120), color = 37, mat = "Grass" }
			local rng = newRng(77)
			for i = 1, 26 do   -- a park of walls, hills and crates to run around
				local x, z = rng.num(-50, 50), rng.num(-50, 50)
				if math.abs(x) > 8 or math.abs(z) > 8 then
					local h = rng.pick({ 3, 5, 8 })
					H.part{ name = "Block", parent = m, pos = O + Vector3.new(x, h / 2 + 1, z), size = Vector3.new(rng.int(4, 12), h, rng.int(4, 12)), color = rng.pick({ 192, 1002, 106, 23 }), mat = rng.pick({ "Wood", "Brick", "SmoothPlastic" }) }
				end
			end
			for _, w in ipairs({ { 60, 0, 2, 120 }, { -60, 0, 2, 120 }, { 0, 60, 120, 2 }, { 0, -60, 120, 2 } }) do
				H.part{ name = "Fence", parent = m, pos = O + Vector3.new(w[1], 3, w[2]), size = Vector3.new(w[3], 4, w[4]), color = 192, mat = "Wood" }
			end
		end,
		reset = function() for _, c in ipairs(coins) do c:Destroy() end coins = {} end,
		spawn = function(i, rng) return O + Vector3.new(rng.num(-5, 5), 1, rng.num(-5, 5)) end,
		step = function(t, dt, rng)
			-- a coin every 0.8 s, at places everyone in the room gets
			while #coins < math.floor(t / 0.8) + 6 do
				local k = #coins + 1
				local cr = newRng(hash(roomName() .. "coin", k))
				local pos = O + Vector3.new(cr.num(-54, 54), cr.pick({ 2.5, 2.5, 6.5, 9.5 }), cr.num(-54, 54))
				local c = H.part{ name = "Coin", size = Vector3.new(0.4, 2.2, 2.2), shape = "cyl", color = 24, mat = "Neon", collide = false, cf = CFrame.new(pos) }
				coins[k] = c
				c.Touched:connect(function(hit)
					local p = H.playerOf(hit)
					local st = p and playing[p]
					if st and st.alive and c.Transparency < 1 then
						c.Transparency = 1
						st.score = st.score + 1
						H.sound(workspace, "electronicpingshort", 0.35)
						if st.score == TARGET then H.msg(p, "20 coins! You win this one. Keep grabbing!", 2) end
					end
				end)
			end
			for _, c in ipairs(coins) do if c.Transparency < 1 then c.CFrame = CFrame.new(c.Position) * CFrame.Angles(0, t * 3, math.pi / 2) end end
		end,
		won = function(st) return st.score >= TARGET end,
		status = function(st, left)
			if st.score >= TARGET then return "Coin Rush: " .. st.score .. " coins - you win!  |  " .. left .. "s" end
			return "Coin Rush: " .. st.score .. " / " .. TARGET .. " coins  |  " .. left .. "s"
		end,
	})
end

-- ---------------------------------------------------------------- 6. Bot Brawl
do
	local O = Vector3.new(4200, 200, 0)
	local spawnAt = 0
	minigame("brawl", {
		name = "Bot Brawl", tip = "Grab your sword and knock out 6 bots! Click to swing.",
		killY = O.Y - 40, gear = "sword",
		build = function()
			local m = model("BotBrawl")
			H.part{ name = "Ring", parent = m, size = Vector3.new(2, 80, 80), shape = "cyl", color = 1002, mat = "Cobblestone", cf = CFrame.new(O) * CFrame.Angles(0, 0, math.pi / 2) }
			for i = 1, 12 do
				local a = i / 12 * math.pi * 2
				H.part{ name = "Pillar", parent = m, pos = O + Vector3.new(math.cos(a) * 42, 6, math.sin(a) * 42), size = Vector3.new(3, 12, 3), color = 1, mat = "Marble" }
				H.part{ name = "Torch", parent = m, pos = O + Vector3.new(math.cos(a) * 42, 13, math.sin(a) * 42), size = Vector3.new(2, 2, 2), shape = "ball", color = 106, mat = "Neon", collide = false }
			end
			-- a low wall around the ring, so a hit doesn't knock you off
			for i = 1, 24 do
				local a = (i + 0.5) / 24 * math.pi * 2
				H.part{ name = "Rim", parent = m, size = Vector3.new(1.5, 3, 11), color = 199, mat = "Cobblestone",
					cf = CFrame.new(O + Vector3.new(math.cos(a) * 39.5, 2.5, math.sin(a) * 39.5)) * CFrame.Angles(0, -a, 0) }
			end
			H.part{ name = "Void", parent = m, pos = O + Vector3.new(0, -25, 0), size = Vector3.new(160, 1, 160), color = 1004, mat = "Neon", collide = false, alpha = 0.3 }
		end,
		reset = function() NPC.clear() spawnAt = 0 end,
		spawn = function(i, rng) return O + Vector3.new(rng.num(-8, 8), 2, rng.num(-8, 8)) end,
		step = function(t)
			-- up to three bots at a time; knocking one out heals you a bit
			if t >= spawnAt and NPC.count() < 3 then
				spawnAt = t + 2
				local a = math.random() * math.pi * 2
				NPC.spawn{ name = "Brawler", pos = O + Vector3.new(math.cos(a) * 30, 4, math.sin(a) * 30), colors = { 24, 1004, 1004, 26 },
					sword = true, health = 40, speed = 12, damage = 7, rate = 1.3, range = 120,
					died = function(m, killer)
						for p, st in pairs(playing) do
							if st.alive and (killer == p or not killer) then
								st.score = st.score + 1
								local _, hum = rootOf(p)
								if hum and hum.Health > 0 then hum.Health = math.min(hum.MaxHealth, hum.Health + 25) end
							end
						end
					end }
			end
		end,
		finish = function() NPC.clear() end,
		won = function(st) return st.alive and st.score >= 6 end,
		status = function(st, left) return "Bot Brawl: " .. st.score .. " / 6 KOs  |  " .. left .. "s" end,
	})
end

-- ---------------------------------------------------------------- 7. Meteor Storm
do
	local O = Vector3.new(4900, 200, 0)
	local next = 1
	minigame("meteor", {
		name = "Meteor Storm", tip = "Meteors are falling! Watch for the red circles and dodge.",
		killY = O.Y - 40,
		build = function()
			local m = model("MeteorStorm")
			H.part{ name = "Island", parent = m, size = Vector3.new(4, 90, 90), shape = "cyl", color = 37, mat = "Grass", cf = CFrame.new(O) * CFrame.Angles(0, 0, math.pi / 2) }
			H.part{ name = "Rock", parent = m, size = Vector3.new(18, 70, 70), shape = "cyl", color = 1030, mat = "Slate", cf = CFrame.new(O - Vector3.new(0, 11, 0)) * CFrame.Angles(0, 0, math.pi / 2) }
			local rng = newRng(5)
			for i = 1, 8 do H.part{ name = "Boulder", parent = m, pos = O + Vector3.new(rng.num(-30, 30), 3, rng.num(-30, 30)), size = Vector3.new(6, 6, 6), shape = "ball", color = 1002, mat = "Slate" } end
		end,
		reset = function() next = 1 end,
		spawn = function(i, rng) return O + Vector3.new(rng.num(-20, 20), 3, rng.num(-20, 20)) end,
		step = function(t)
			-- meteor k lands at a time and place everyone in the room gets; more and more of them
			while true do
				local at = 2 + (next - 1) * math.max(0.25, 1.1 - next * 0.012)
				if at > t then break end
				local mr = newRng(hash(roomName() .. "meteor", next))
				local pos = O + Vector3.new(mr.num(-40, 40), 2.2, mr.num(-40, 40))
				next = next + 1
				local mark = H.part{ name = "Mark", size = Vector3.new(0.2, 12, 12), shape = "cyl", color = 1004, mat = "Neon", collide = false, alpha = 0.4, cf = CFrame.new(pos) * CFrame.Angles(0, 0, math.pi / 2) }
				local rock = H.part{ name = "Meteor", size = Vector3.new(5, 5, 5), shape = "ball", color = 1004, mat = "Neon", collide = false, cf = CFrame.new(pos + Vector3.new(0, 80, 0)) }
				Instance.new("Fire", rock).Size = 8
				spawn(function()
					local t0 = tick()
					while tick() - t0 < 1.5 do local a = (tick() - t0) / 1.5 rock.CFrame = CFrame.new(pos + Vector3.new(0, 80 * (1 - a), 0)) wait() end
					rock:Destroy() mark:Destroy()
					local e = Instance.new("Explosion")
					e.Position, e.BlastRadius, e.BlastPressure = pos, 6, 0
					pcall(function() e.DestroyJointRadiusPercent = 0 end)
					e.Parent = workspace
					for p, st in pairs(playing) do
						local root = rootOf(p)
						if st.alive and root and (root.Position - pos).magnitude < 6.5 then out(p, "Squashed by a meteor!") end
					end
				end)
			end
		end,
	})
end

-- ---------------------------------------------------------------- 8. Obby Dash
do
	local O = Vector3.new(5600, 200, 0)
	local course, finish
	minigame("obby", {
		name = "Obby Dash", tip = "Race to the finish! A new course every time.",
		killY = O.Y - 30,
		build = function()
			local m = model("ObbyDash")
			H.part{ name = "Start", parent = m, pos = O, size = Vector3.new(16, 1, 16), color = 37, mat = "SmoothPlastic" }
			H.part{ name = "Void", parent = m, pos = O + Vector3.new(150, -25, 0), size = Vector3.new(400, 1, 60), color = 1004, mat = "Neon", collide = false, alpha = 0.3 }
		end,
		reset = function(rng)
			if course then course:Destroy() end
			course = model("ObbyCourse")
			local x, y = 8, 0
			for s = 1, 14 do
				local kind = rng.int(1, 6)
				local c = PALETTE[1 + s % #PALETTE]
				if kind == 1 then        -- stepping stones
					for i = 1, 4 do x = x + rng.num(6, 8) y = y + rng.num(-0.5, 1.2) H.part{ parent = course, pos = O + Vector3.new(x, y, rng.num(-4, 4)), size = Vector3.new(4, 1, 4), color = c } end
				elseif kind == 2 then    -- beam
					x = x + 12 H.part{ parent = course, pos = O + Vector3.new(x, y, 0), size = Vector3.new(18, 1, 1.4), color = c } x = x + 10
				elseif kind == 3 then    -- stairs up
					for i = 1, 4 do x = x + 5 y = y + 2.2 H.part{ parent = course, pos = O + Vector3.new(x, y, 0), size = Vector3.new(4, 1, 6), color = c } end
				elseif kind == 4 then    -- floor with kill stripes
					x = x + 14 H.part{ parent = course, pos = O + Vector3.new(x, y, 0), size = Vector3.new(26, 1, 10), color = c }
					for i = -1, 1 do
						local k = H.part{ name = "Kill", parent = course, pos = O + Vector3.new(x + i * 8, y + 0.7, rng.num(-2, 2)), size = Vector3.new(1.4, 0.4, 7), color = 21, mat = "Neon" }
						k.Touched:connect(function(hit) local p = H.playerOf(hit) if p and playing[p] and playing[p].alive then local cp = playing[p].check if cp then teleport(p, cp) end end end)
					end
					x = x + 14
				elseif kind == 5 then    -- zigzag
					for i = 1, 4 do x = x + 6 H.part{ parent = course, pos = O + Vector3.new(x, y, (i % 2 == 0) and 5 or -5), size = Vector3.new(4, 1, 4), color = c } end
				else                     -- trampoline
					x = x + 7 local b = H.part{ name = "Bounce", parent = course, pos = O + Vector3.new(x, y, 0), size = Vector3.new(6, 1, 6), color = 1032, mat = "Neon" }
					b.Touched:connect(function(hit) local c2 = hit.Parent local r = c2 and c2:FindFirstChild("HumanoidRootPart") if r and H.playerOf(hit) then r.Velocity = Vector3.new(r.Velocity.X, 85, r.Velocity.Z) end end)
					x = x + 11 y = y + 9 H.part{ parent = course, pos = O + Vector3.new(x, y, 0), size = Vector3.new(8, 1, 8), color = c }
				end
				if s % 5 == 0 then   -- a checkpoint: touching a kill stripe takes you back here
					x = x + 6
					local cp = H.part{ name = "Checkpoint", parent = course, pos = O + Vector3.new(x, y, 0), size = Vector3.new(8, 1, 8), color = 23, mat = "Neon" }
					cp.Touched:connect(function(hit) local p = H.playerOf(hit) if p and playing[p] then playing[p].check = cp.Position end end)
				end
			end
			x = x + 10
			finish = H.part{ name = "Finish", parent = course, pos = O + Vector3.new(x, y, 0), size = Vector3.new(14, 1, 14), color = 24, mat = "Neon" }
			finish.Touched:connect(function(hit)
				local p = H.playerOf(hit)
				local st = p and playing[p]
				if st and st.alive and st.score == 0 then st.score = 1 H.msg(p, "You finished!", 2) H.sound(workspace, "victory", 0.4) end
			end)
		end,
		spawn = function(i, rng) return O + Vector3.new(rng.num(-4, 4), 1, rng.num(-4, 4)) end,
		won = function(st) return st.score > 0 end,
	})
end

-- ---------------------------------------------------------------- the lobby board
local board = lobby:FindFirstChild("Board")
local boardText
if board then
	local g = Instance.new("SurfaceGui")
	g.Face = Enum.NormalId.Back   -- (the side facing the plaza)
	g.Parent = board
	boardText = Instance.new("TextLabel", g)
	boardText.Size = UDim2.new(1, 0, 1, 0)
	boardText.BackgroundColor3 = Color3.new(0.08, 0.09, 0.15)
	boardText.TextColor3 = Color3.new(1, 0.85, 0.2)
	boardText.Font = Enum.Font.SourceSansBold
	boardText.FontSize = Enum.FontSize.Size96
	boardText.TextScaled = true
	boardText.TextWrapped = true
end

-- ---------------------------------------------------------------- rounds
for _, k in ipairs(order) do pcall(G[k].build) end
local function gameFor(n)
	-- (tests can pick the minigames: ReplicatedStorage.GNPartyForce = "lava,coins")
	local force = store:FindFirstChild("GNPartyForce")
	if force and force.Value ~= "" then
		local list = {}
		for k in string.gmatch(force.Value, "[%w]+") do if G[k] then list[#list + 1] = k end end
		if #list > 0 then return list[1 + n % #list] end
	end
	-- every minigame once per cycle of #order rounds, in a new order each cycle (and never the same twice in a row)
	local function perm(cycle)
		local list = {}
		for i, k in ipairs(order) do list[i] = k end
		local r = hash(roomName() .. "party", cycle)
		for i = #list, 2, -1 do
			r = (r * 48271) % 2147483647
			local j = 1 + r % i
			list[i], list[j] = list[j], list[i]
		end
		return list
	end
	local cycle = math.floor(n / #order)
	local list = perm(cycle)
	local prev = perm(cycle - 1)
	if list[1] == prev[#prev] then list[1], list[2] = list[2], list[1] end
	return list[1 + n % #order]
end

local function joined(p)
	load(p)
	local function hook(c)
		c:WaitForChild("Humanoid").Died:connect(function() if playing[p] and playing[p].alive then out(p, "You're out!") end end)
	end
	p.CharacterAdded:connect(function(c)
		hook(c)
		wait(0.5)
		showStats(p)
	end)
	if p.Character then spawn(function() hook(p.Character) end) end
end
Players.PlayerAdded:connect(joined)
for _, p in ipairs(Players:GetPlayers()) do joined(p) end
Players.PlayerRemoving:connect(function(p) save(p) playing[p] = nil saved[p] = nil end)

local current, currentN, phase = nil, -1, "lobby"
local lastStep = tick()
local rng
local function startRound(n, key)
	current, currentN = G[key], n
	rng = newRng(hash(roomName() .. key, n))
	if current.reset then pcall(current.reset, rng) end
	playing = {}
	local i = 0
	for _, p in ipairs(Players:GetPlayers()) do
		local root, hum = rootOf(p)
		if root and hum and hum.Health > 0 then
			i = i + 1
			playing[p] = { alive = true, score = 0 }
			teleport(p, current.spawn(i, rng))
		end
	end
	if current.gear then NET.giveGear(current.gear) end
	H.msg(nil, current.name .. "\n" .. current.tip, 4)
end
local function endRound()
	if not current then return end
	if current.gear then NET.takeGear(current.gear) end
	if current.finish then pcall(current.finish) end
	for p, st in pairs(playing) do
		local won = current.won and current.won(st) or (not current.won and st.alive)
		local d = saved[p]
		if d then
			local coins = won and 25 or 5
			local before = levelOf(d.xp)
			d.coins = d.coins + coins
			d.xp = d.xp + (won and 30 or 8)
			if won then d.wins = d.wins + 1 end
			showStats(p)
			save(p)
			local up = levelOf(d.xp) > before and ("  LEVEL UP: " .. levelOf(d.xp) .. "!") or ""
			H.msg(p, (won and "You won " .. current.name .. "! +" or "Nice try! +") .. coins .. " coins" .. up, 4)
			if won then NET.toast(NET.myName() .. " won " .. current.name .. "!") H.sound(workspace, "victory", 0.5) end
		end
		teleport(p, lobbySpawn.Position + Vector3.new(math.random(-6, 6), 0, math.random(-6, 6)))
	end
	playing = {}
	current = nil
end

while true do
	local t = now()
	local n = math.floor(t / ROUND)
	local into = t - n * ROUND
	local key = gameFor(n)
	local dt = math.min(0.2, tick() - lastStep)
	lastStep = tick()
	if into < LOBBY_END then
		if phase == "play" then endRound() end
		phase = "lobby"
		H.bar("Next: " .. G[key].name .. " in " .. math.ceil(LOBBY_END - into))
		if boardText then boardText.Text = "NEXT UP\n" .. G[key].name end
	elseif into < PLAY_START then
		if phase ~= "starting" then phase = "starting" startRound(n, key) end
		H.bar(G[key].name .. " starts in " .. math.ceil(PLAY_START - into))
	elseif into < PLAY_END then
		if phase == "lobby" then phase = "starting" startRound(n, key) end   -- (joined mid-way: catch up)
		phase = "play"
		if current then
			local playT = into - PLAY_START
			if current.step then local ok, e = pcall(current.step, playT, dt, rng) if not ok then print("GN party: " .. tostring(e)) end end
			for p, st in pairs(playing) do
				local root = rootOf(p)
				local _, hum = rootOf(p)
				if st.alive and root and hum and hum.Health > 0 and root.Position.Y < current.killY then out(p, "You fell!") end
			end
			if boardText then boardText.Text = "NOW PLAYING\n" .. current.name end
			local left = math.ceil(PLAY_END - into)
			if current.status then
				local mine = nil
				for _, st in pairs(playing) do mine = st break end
				if mine then H.bar(current.status(mine, left)) else H.bar(current.name .. ": " .. left .. "s") end
			elseif current.key ~= "color" then H.bar(current.name .. ": " .. left .. "s  |  " .. alive() .. " left") end
		end
	else
		if phase == "play" or phase == "starting" then endRound() end
		phase = "results"
		H.bar("Round over! Next round soon...")
	end
	wait(0.05)
end
