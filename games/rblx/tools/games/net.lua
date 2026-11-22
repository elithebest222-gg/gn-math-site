-- GN-BLOX multiplayer for a game's own script (tools/games/net.lua; build_games.py puts it above
-- the game's script). Every player runs their own copy of the game, and ReplicatedStorage.WebBlox
-- (scripts/WebBloxPlayers.lua) passes messages and shared values between the copies:
--   NET.send(topic, data)       a message for everyone else in the server
--   NET.on(function(topic, data, fromId, fromName) end)
--   NET.set(key, value)         a value the whole server shares (players who join later get it too)
--   NET.get(key), NET.watch(key, function(value) end), NET.values(prefix) -> { key = value }
--   NET.toast(text)             a line in the feed at the top of the screen
local NET = {}
do
	local store = game:GetService("ReplicatedStorage")
	local function wb(name, wait)
		local f = store:FindFirstChild("WebBlox")
		if not f and wait then f = store:WaitForChild("WebBlox") end
		if not f then return nil end
		return wait and f:WaitForChild(name) or f:FindFirstChild(name)
	end
	function NET.send(topic, data)
		local s = wb("Send")
		if s then s:Fire(topic, data) end
	end
	function NET.set(key, value)
		local s = wb("SetShared")
		if s then s:Fire(key, value) end
	end
	function NET.get(key)
		local f = wb("Shared")
		local v = f and f:FindFirstChild(key)
		return v and v.Value or nil
	end
	function NET.values(prefix)
		local out, f = {}, wb("Shared")
		if f then
			for _, v in pairs(f:GetChildren()) do
				if string.sub(v.Name, 1, #prefix) == prefix then out[v.Name] = v.Value end
			end
		end
		return out
	end
	function NET.on(fn)
		spawn(function() wb("Message", true).Event:connect(fn) end)
	end
	function NET.watch(key, fn)
		spawn(function()
			local f = wb("Shared", true)
			local function hook(v)
				if v.Name ~= key then return end
				fn(v.Value)
				v.Changed:connect(function() fn(v.Value) end)
			end
			for _, v in pairs(f:GetChildren()) do hook(v) end
			f.ChildAdded:connect(hook)
			f.ChildRemoved:connect(function(v) if v.Name == key then fn(nil) end end)
		end)
	end
	-- (any change in the shared values; for totals made of one value per player)
	function NET.onShared(fn)
		spawn(function()
			local f = wb("Shared", true)
			local function hook(v) v.Changed:connect(fn) fn() end
			for _, v in pairs(f:GetChildren()) do hook(v) end
			f.ChildAdded:connect(hook)
			f.ChildRemoved:connect(fn)
		end)
	end
	function NET.myId()
		local v = wb("MyId")
		return v and v.Value ~= "" and v.Value or "solo"
	end
	function NET.myName()
		local n = wb("LocalName")
		return n and n.Value ~= "" and n.Value or "You"
	end

	-- the feed: a few lines at the top of the screen that fade after a while
	local lines = {}
	function NET.toast(text)
		local Players = game:GetService("Players")
		for _, plr in pairs(Players:GetPlayers()) do
			local gui = plr:FindFirstChild("PlayerGui")
			if gui then
				local sg = gui:FindFirstChild("GNFeed")
				if not sg then
					sg = Instance.new("ScreenGui")
					sg.Name = "GNFeed"
					sg.Parent = gui
				end
				local t = Instance.new("TextLabel")
				t.Size = UDim2.new(0, 420, 0, 26)
				t.BackgroundColor3 = Color3.new(0, 0, 0)
				t.BackgroundTransparency = 0.45
				t.BorderSizePixel = 0
				t.TextColor3 = Color3.new(1, 1, 1)
				t.Font = Enum.Font.SourceSansBold
				t.FontSize = Enum.FontSize.Size18
				t.Text = text
				t.Parent = sg
				table.insert(lines, 1, t)
				while #lines > 4 do table.remove(lines):Destroy() end
				for i, l in ipairs(lines) do l.Position = UDim2.new(0.5, -210, 0, 74 + (i - 1) * 30) end
				delay(6, function()
					for i, l in ipairs(lines) do if l == t then table.remove(lines, i) break end end
					t:Destroy()
				end)
			end
		end
	end
end
