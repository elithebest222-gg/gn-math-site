-- Helpers the newer GN-BLOX games share (build_games.py puts this above a game's script, below net.lua).
--   H.charOf(part)            the living character a part belongs to (and its Humanoid), or nil
--   H.playerOf(part)          the Player whose character it is, or nil
--   H.stat(plr, name, add)    a leaderstats number (made when first used); add changes it; returns it
--   H.msg(plr, text, secs)    a big message in the middle of the screen (nil plr: everyone)
--   H.bar(text)               the line at the top of the screen for everyone ("" hides it)
--   H.sound(where, name, vol) rbxasset://sounds/<name>.mp3 at a part or a position
--   H.part{...}               a new anchored part: pos, size, color, mat, name, parent, collide, alpha, shape, cf
--   H.every(secs, fn)         runs fn every secs seconds (errors don't stop it)
local H = {}
do
	local Players = game:GetService("Players")
	function H.charOf(part)
		local m = part and part.Parent
		for _ = 1, 3 do
			if not m or m == workspace then return nil end
			local hum = m:FindFirstChild("Humanoid")
			if hum and hum:IsA("Humanoid") then
				if hum.Health > 0 then return m, hum end
				return nil
			end
			m = m.Parent
		end
		return nil
	end
	function H.playerOf(part)
		local char = H.charOf(part)
		return char and Players:GetPlayerFromCharacter(char) or nil
	end
	function H.stat(plr, name, add)
		local ls = plr:FindFirstChild("leaderstats")
		if not ls then
			ls = Instance.new("IntValue")
			ls.Name = "leaderstats"
			ls.Parent = plr
		end
		local v = ls:FindFirstChild(name)
		if not v then
			v = Instance.new("IntValue")
			v.Name = name
			v.Parent = ls
		end
		if add then v.Value = v.Value + add end
		return v.Value
	end
	local function label(parent, name, pos, size, textSize)
		local t = Instance.new("TextLabel")
		t.Name = name
		t.Size = size
		t.Position = pos
		t.BackgroundColor3 = Color3.new(0, 0, 0)
		t.BackgroundTransparency = 0.35
		t.BorderSizePixel = 0
		t.TextColor3 = Color3.new(1, 1, 1)
		t.Font = Enum.Font.SourceSansBold
		t.FontSize = textSize
		t.TextWrapped = true
		t.Parent = parent
		return t
	end
	local function gui(plr, name)
		local pg = plr:FindFirstChild("PlayerGui")
		if not pg then return nil end
		local sg = pg:FindFirstChild(name)
		if not sg then
			sg = Instance.new("ScreenGui")
			sg.Name = name
			sg.Parent = pg
		end
		return sg
	end
	local msgId = 0
	function H.msg(plr, text, secs)
		if not plr then
			for _, p in pairs(Players:GetPlayers()) do H.msg(p, text, secs) end
			return
		end
		local sg = gui(plr, "GNMessage")
		if not sg then return end
		sg:ClearAllChildren()
		label(sg, "Text", UDim2.new(0.5, -240, 0.24, 0), UDim2.new(0, 480, 0, 60), Enum.FontSize.Size28).Text = text
		msgId = msgId + 1
		local mine = msgId
		delay(secs or 3, function() if mine == msgId then sg:ClearAllChildren() end end)
	end
	local barText = ""
	local function drawBar(plr)
		local sg = gui(plr, "GNBar")
		if not sg then return end
		local t = sg:FindFirstChild("Text") or label(sg, "Text", UDim2.new(0.5, -220, 0, 40), UDim2.new(0, 440, 0, 30), Enum.FontSize.Size24)
		t.Text = barText
		t.Visible = barText ~= ""
	end
	function H.bar(text)
		barText = text or ""
		for _, p in pairs(Players:GetPlayers()) do pcall(drawBar, p) end
	end
	Players.PlayerAdded:connect(function(p)
		p.CharacterAdded:connect(function() wait(0.5) pcall(drawBar, p) end)
	end)
	for _, p in pairs(Players:GetPlayers()) do
		p.CharacterAdded:connect(function() wait(0.5) pcall(drawBar, p) end)
	end
	function H.sound(where, name, vol)
		local holder = where
		if not pcall(function() return where.ClassName end) then
			holder = Instance.new("Part")
			holder.Anchored, holder.CanCollide, holder.Transparency = true, false, 1
			holder.Size = Vector3.new(1, 1, 1)
			holder.CFrame = CFrame.new(where)
			holder.Parent = workspace
			game:GetService("Debris"):AddItem(holder, 5)
		end
		local s = Instance.new("Sound")
		s.SoundId = "rbxasset://sounds/" .. name .. ".mp3"
		s.Volume = vol or 0.6
		s.Parent = holder
		s:Play()
		game:GetService("Debris"):AddItem(s, 5)
	end
	function H.part(o)
		local p = Instance.new(o.class or "Part")
		pcall(function() p.FormFactor = Enum.FormFactor.Custom end)
		p.Name = o.name or "Part"
		p.Size = o.size or Vector3.new(4, 1, 4)
		p.BrickColor = BrickColor.new(o.color or 194)
		if o.mat then pcall(function() p.Material = Enum.Material[o.mat] end) end
		p.Anchored = o.anchored ~= false
		p.CanCollide = o.collide ~= false
		p.Transparency = o.alpha or 0
		p.TopSurface, p.BottomSurface = Enum.SurfaceType.Smooth, Enum.SurfaceType.Smooth
		if o.shape == "ball" then p.Shape = Enum.PartType.Ball elseif o.shape == "cyl" then p.Shape = Enum.PartType.Cylinder end
		p.CFrame = o.cf or CFrame.new(o.pos or Vector3.new())
		p.Parent = o.parent or workspace
		return p
	end
	function H.every(secs, fn)
		spawn(function()
			while true do
				local ok, e = pcall(fn)
				if not ok then print("GN game: " .. tostring(e)) end
				wait(secs)
			end
		end)
	end
end
