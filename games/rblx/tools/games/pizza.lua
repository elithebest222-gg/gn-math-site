-- Pizza Shift (tools/build_games.py): run a pizza restaurant. Customers come to the counter one
-- at a time: take their order at the register, grab dough, add the topping they asked for, bake
-- it, box it and hand it over. Money and Pizzas go on the leaderboard.
--
-- Stations are parts with a ClickDetector, found by name in workspace.Kitchen: Register, Dough,
-- Topping_<name>, Oven, Box, Trash. The customer stands on workspace.Kitchen.CustomerSpot.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local kitchen = workspace:WaitForChild("Kitchen")
local spot = kitchen:WaitForChild("CustomerSpot")
local door = kitchen:WaitForChild("Exit")
local TOPPINGS = {
	Cheese = { color = "Bright yellow", dots = 0 },
	Pepperoni = { color = "Really red", dots = 7 },
	Veggie = { color = "Bright green", dots = 7 },
	Mushroom = { color = "Brown", dots = 6 },
}
local ORDERS = { "Cheese", "Pepperoni", "Veggie", "Mushroom" }
local BAKE_TIME = 5

local function sound(parent, id, volume)
	local s = Instance.new("Sound")
	s.SoundId = "rbxasset://sounds/" .. id
	s.Volume = volume or 0.6
	s.Parent = parent
	s:Play()
	delay(3, function() s:Destroy() end)
end
local function part(name, size, color, parent, props)
	local p = Instance.new("Part")
	pcall(function() p.FormFactor = Enum.FormFactor.Custom end)
	p.Name = name
	p.Size = size
	p.BrickColor = BrickColor.new(color)
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.CanCollide = false
	for k, v in pairs(props or {}) do p[k] = v end
	p.Parent = parent
	return p
end
local function weld(a, b, c0)
	local w = Instance.new("Weld")
	w.Part0, w.Part1, w.C0 = a, b, c0
	w.Parent = b
end
local function bubble(head, text)
	local old = head:FindFirstChild("Bubble")
	if old then old:Destroy() end
	if not text then return end
	local bb = Instance.new("BillboardGui")
	bb.Name = "Bubble"
	bb.Adornee = head
	bb.Size = UDim2.new(0, 230, 0, 50)
	bb.StudsOffset = Vector3.new(0, 3, 0)
	local t = Instance.new("TextLabel")
	t.Size = UDim2.new(1, 0, 1, 0)
	t.BackgroundColor3 = Color3.new(1, 1, 1)
	t.BorderColor3 = Color3.new(0.6, 0.6, 0.6)
	t.TextColor3 = Color3.new(0.1, 0.1, 0.1)
	t.Font = Enum.Font.SourceSansBold
	t.FontSize = Enum.FontSize.Size18
	t.TextWrapped = true
	t.Text = text
	t.Parent = bb
	bb.Parent = head
end

local function setBoard(text)
	local board = kitchen:FindFirstChild("OrderBoard")
	if board and board:FindFirstChild("SurfaceGui") then board.SurfaceGui.Text.Text = text end
end

-- a pizza (or a box) you carry in front of you
local function makePizza(stage, topping)
	local m = Instance.new("Model")
	m.Name = "Carry"
	if stage == "boxed" then
		local box = part("Box", Vector3.new(2.8, 0.7, 2.8), "Institutional white", m)
		local stripe = part("Stripe", Vector3.new(2.85, 0.2, 0.6), "Bright red", m)
		weld(box, stripe, CFrame.new(0, 0.2, 0))
		return m, box
	end
	local crust = part("Crust", Vector3.new(0.25, 2.6, 2.6), stage == "baked" and "Dark orange" or "Brick yellow", m, { Shape = Enum.PartType.Cylinder })
	if topping then
		local t = TOPPINGS[topping]
		local sauce = part("Sauce", Vector3.new(0.27, 2.2, 2.2), topping == "Cheese" and (stage == "baked" and "Bright orange" or "Bright yellow") or "Bright red", m, { Shape = Enum.PartType.Cylinder })
		weld(crust, sauce, CFrame.new(0.02, 0, 0))
		for i = 1, t.dots do
			local a = i / t.dots * math.pi * 2
			local d = part("Dot", Vector3.new(0.12, 0.45, 0.45), t.color, m, { Shape = Enum.PartType.Cylinder })
			weld(crust, d, CFrame.new(0.15, math.cos(a) * 0.65, math.sin(a) * 0.65))
		end
	end
	return m, crust
end
local function carry(char, stage, topping)
	local old = char:FindFirstChild("Carry")
	if old then old:Destroy() end
	if not stage then return end
	local torso = char:FindFirstChild("Torso")
	if not torso then return end
	local m, base = makePizza(stage, topping)
	-- held flat, in front of the chest
	local c0 = CFrame.new(0, 0.2, -1.8) * (stage == "boxed" and CFrame.new() or CFrame.Angles(0, 0, math.pi / 2))
	weld(torso, base, c0)
	m.Parent = char
end

-- the customer -------------------------------------------------------------------------------
local customer, order, taken, arrived = nil, nil, false, 0
local SKIN = { "Bright yellow", "Light orange", "Nougat", "Reddish brown", "Pastel brown" }
local SHIRT = { "Bright blue", "Bright red", "Bright green", "Royal purple", "Bright orange", "Black", "Hot pink" }
local function newCustomer()
	local m = Instance.new("Model")
	m.Name = "Customer"
	local skin = SKIN[math.random(#SKIN)]
	local shirt = SHIRT[math.random(#SHIRT)]
	local root = part("HumanoidRootPart", Vector3.new(2, 2, 1), "Medium stone grey", m, { Transparency = 1, Anchored = true })
	local function body(name, size, color, c0)
		local p = part(name, size, color, m, { CanCollide = true })
		weld(root, p, c0)
		return p
	end
	body("Torso", Vector3.new(2, 2, 1), shirt, CFrame.new())
	local head = body("Head", Vector3.new(2, 1, 1), skin, CFrame.new(0, 1.5, 0))
	local mesh = Instance.new("SpecialMesh", head)
	mesh.MeshType = Enum.MeshType.Head
	mesh.Scale = Vector3.new(1.25, 1.25, 1.25)
	local face = Instance.new("Decal", head)
	face.Texture = "rbxasset://textures/face.png"
	body("Left Arm", Vector3.new(1, 2, 1), skin, CFrame.new(-1.5, 0, 0))
	body("Right Arm", Vector3.new(1, 2, 1), skin, CFrame.new(1.5, 0, 0))
	body("Left Leg", Vector3.new(1, 2, 1), "Dark stone grey", CFrame.new(-0.5, -2, 0))
	body("Right Leg", Vector3.new(1, 2, 1), "Dark stone grey", CFrame.new(0.5, -2, 0))
	local hum = Instance.new("Humanoid")
	hum.Parent = m
	-- click anywhere on them to hand over the pizza
	for _, p in pairs(m:GetChildren()) do
		if p:IsA("BasePart") and p ~= root then
			local click = Instance.new("ClickDetector")
			click.MaxActivationDistance = 20
			click.Parent = p
			click.MouseClick:connect(function(plr) serve(plr) end)
		end
	end
	-- walk in from the door
	local goal = spot.CFrame * CFrame.new(0, 3.1, 0)
	root.CFrame = door.CFrame * CFrame.new(0, 3.1, 0)
	m.Parent = workspace
	spawn(function()
		local start = root.CFrame
		for i = 1, 40 do
			root.CFrame = start:lerp(goal, i / 40)
			wait(0.05)
		end
		root.CFrame = goal
	end)
	order = ORDERS[math.random(#ORDERS)]
	taken = false
	arrived = tick()
	customer = m
	bubble(head, "Hi! Can I order?")
	return m
end
local function leave(happy)
	local m = customer
	customer = nil
	if not m then return end
	bubble(m.Head, happy and "Thanks! Yum!" or nil)
	spawn(function()
		wait(1)
		local root = m:FindFirstChild("HumanoidRootPart")
		local start = root.CFrame
		for i = 1, 30 do
			root.CFrame = start:lerp(door.CFrame * CFrame.new(0, 3.1, 0), i / 30)
			wait(0.05)
		end
		m:Destroy()
	end)
	delay(4, newCustomer)
end

-- players --------------------------------------------------------------------------------------
local state = {}      -- player -> { stage = nil|"dough"|"topped"|"baked"|"boxed", topping }
local oven = { busy = false, ready = false, topping = nil, owner = nil }
local function stat(plr, name)
	local ls = plr:FindFirstChild("leaderstats")
	return ls and ls:FindFirstChild(name)
end
local function guide(plr, text)
	local gui = plr:FindFirstChild("PlayerGui")
	if not gui then return end
	local sg = gui:FindFirstChild("PizzaGuide")
	if not sg then
		sg = Instance.new("ScreenGui")
		sg.Name = "PizzaGuide"
		local t = Instance.new("TextLabel")
		t.Name = "Text"
		t.Size = UDim2.new(0, 520, 0, 40)
		t.Position = UDim2.new(0.5, -260, 1, -130)
		t.BackgroundColor3 = Color3.new(0.1, 0.1, 0.1)
		t.BackgroundTransparency = 0.3
		t.BorderSizePixel = 0
		t.TextColor3 = Color3.new(1, 1, 1)
		t.Font = Enum.Font.SourceSansBold
		t.FontSize = Enum.FontSize.Size24
		t.Parent = sg
		sg.Parent = gui
	end
	sg.Text.Text = text
end
local function update(plr)
	local s = state[plr] or {}
	local text
	if not customer then text = "Waiting for the next customer..."
	elseif not taken then text = "A customer is here! Click the register to take the order."
	elseif not s.stage then
		if oven.ready and oven.owner == plr then text = "Your pizza is ready! Click the oven to take it out."
		elseif oven.busy and oven.owner == plr then text = "Baking... wait for the oven to ding."
		else text = "Order: " .. order .. ". Grab some dough from the dough table." end
	elseif s.stage == "dough" then text = "Add " .. order .. " at the topping table."
	elseif s.stage == "topped" then text = "Put the pizza in the oven."
	elseif s.stage == "baked" then text = "Put the pizza in a box at the box table."
	elseif s.stage == "boxed" then text = "Give the box to the customer (click them)." end
	guide(plr, text)
	local char = plr.Character
	if char then carry(char, s.stage, s.topping) end
end
local function updateAll() for _, p in pairs(Players:GetPlayers()) do update(p) end end

function serve(plr)
	local s = state[plr]
	if not customer then return end
	if not taken then bubble(customer.Head, "Please take my order at the register!") return end
	if not s or s.stage ~= "boxed" then bubble(customer.Head, "Where's my " .. order .. " pizza?") return end
	if s.topping ~= order then
		bubble(customer.Head, "That's not what I ordered! I wanted " .. order .. ".")
		return
	end
	local tip = math.max(0, 10 - math.floor((tick() - arrived) / 6))
	local money, pizzas = stat(plr, "Money"), stat(plr, "Pizzas")
	if money then money.Value = money.Value + 15 + tip end
	if pizzas then pizzas.Value = pizzas.Value + 1 end
	sound(customer.Torso, "victory.mp3", 0.5)
	state[plr] = {}
	setBoard("NO ORDERS")
	leave(true)
	update(plr)
end

local function onClick(name, fn)
	local p = kitchen:FindFirstChild(name, true)
	if not p then return end
	local cd = Instance.new("ClickDetector")
	cd.MaxActivationDistance = 16
	cd.Parent = p
	cd.MouseClick:connect(function(plr)
		state[plr] = state[plr] or {}
		fn(plr, state[plr], p)
		updateAll()
	end)
end
onClick("Register", function(plr, s, p)
	if customer and not taken then
		taken = true
		sound(p, "electronicpingshort.mp3", 0.5)
		bubble(customer.Head, "One " .. order .. " pizza, please!")
		setBoard("ORDER: " .. string.upper(order))
	end
end)
onClick("Dough", function(plr, s, p)
	if not s.stage then s.stage, s.topping = "dough", nil sound(p, "snap.mp3", 0.4) end
end)
for name in pairs(TOPPINGS) do
	onClick("Topping_" .. name, function(plr, s, p)
		if s.stage == "dough" then s.stage, s.topping = "topped", name sound(p, "button.mp3", 0.5) end
	end)
end
onClick("Oven", function(plr, s, p)
	if s.stage == "topped" and not oven.busy and not oven.ready then
		oven.busy, oven.owner, oven.topping = true, plr, s.topping
		state[plr] = {}
		local glow = kitchen:FindFirstChild("OvenGlow", true)
		if glow then glow.BrickColor = BrickColor.new("Neon orange") pcall(function() glow.Material = Enum.Material.Neon end) end
		sound(p, "switch.mp3", 0.5)
		delay(BAKE_TIME, function()
			oven.busy, oven.ready = false, true
			if glow then glow.BrickColor = BrickColor.new("Black") pcall(function() glow.Material = Enum.Material.SmoothPlastic end) end
			sound(p, "electronicpingshort.mp3", 0.8)
			updateAll()
		end)
	elseif oven.ready and oven.owner == plr and not s.stage then
		oven.ready = false
		s.stage, s.topping = "baked", oven.topping
	end
end)
onClick("Box", function(plr, s, p)
	if s.stage == "baked" then s.stage = "boxed" sound(p, "swoosh.mp3", 0.5) end
end)
onClick("Trash", function(plr, s, p)
	if s.stage then state[plr] = {} sound(p, "Kerplunk.mp3", 0.5) end
end)

-- labels over the stations
local function label(p, text)
	local bb = Instance.new("BillboardGui")
	bb.Adornee = p
	bb.Size = UDim2.new(0, 140, 0, 30)
	bb.StudsOffset = Vector3.new(0, 3.2, 0)
	local t = Instance.new("TextLabel")
	t.Size = UDim2.new(1, 0, 1, 0)
	t.BackgroundTransparency = 1
	t.TextColor3 = Color3.new(1, 1, 1)
	t.TextStrokeTransparency = 0.3
	t.Font = Enum.Font.SourceSansBold
	t.FontSize = Enum.FontSize.Size24
	t.Text = text
	t.Parent = bb
	bb.Parent = p
end
for _, c in pairs({ "Register", "Dough", "Oven", "Box", "Trash" }) do
	local p = kitchen:FindFirstChild(c, true)
	if p then label(p, c == "Box" and "Boxes" or c) end
end
for name in pairs(TOPPINGS) do
	local p = kitchen:FindFirstChild("Topping_" .. name, true)
	if p then label(p, name) end
end
do
	local board = kitchen:FindFirstChild("OrderBoard")
	if board then
		local sg = Instance.new("SurfaceGui")
		sg.Face = Enum.NormalId.Front
		sg.CanvasSize = Vector2.new(400, 120)
		local t = Instance.new("TextLabel")
		t.Name = "Text"
		t.Size = UDim2.new(1, 0, 1, 0)
		t.BackgroundColor3 = Color3.new(0.1, 0.1, 0.1)
		t.TextColor3 = Color3.new(1, 0.85, 0.2)
		t.Font = Enum.Font.SourceSansBold
		t.FontSize = Enum.FontSize.Size48
		t.Text = "NO ORDERS"
		t.Parent = sg
		sg.Parent = board
	end
end

do
	local sign = kitchen:FindFirstChild("Sign")
	if sign then
		local sg = Instance.new("SurfaceGui")
		sg.Face = Enum.NormalId.Front
		sg.CanvasSize = Vector2.new(600, 120)
		local t = Instance.new("TextLabel")
		t.Size = UDim2.new(1, 0, 1, 0)
		t.BackgroundTransparency = 1
		t.TextColor3 = Color3.new(1, 1, 1)
		t.TextStrokeTransparency = 0.5
		t.Font = Enum.Font.SourceSansBold
		t.FontSize = Enum.FontSize.Size96
		t.Text = "PIZZA SHIFT"
		t.Parent = sg
		sg.Parent = sign
	end
end

local function onPlayer(plr)
	if plr:FindFirstChild("leaderstats") then return end
	local ls = Instance.new("IntValue")
	ls.Name = "leaderstats"
	for _, n in ipairs({ "Money", "Pizzas" }) do
		local v = Instance.new("IntValue")
		v.Name = n
		v.Parent = ls
	end
	ls.Parent = plr
	state[plr] = {}
	plr.CharacterAdded:connect(function() wait(1) state[plr] = {} update(plr) end)
	spawn(function() wait(2) update(plr) end)
end
Players.PlayerAdded:connect(onPlayer)
for _, p in pairs(Players:GetPlayers()) do onPlayer(p) end

wait(3)
newCustomer()
updateAll()
while true do
	wait(1)
	updateAll()
end
