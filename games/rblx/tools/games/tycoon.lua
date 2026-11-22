-- GN-BLOX tycoon kit (build_games.py puts a TYCOON table above this: { name = "Burger Tycoon",
-- money = "Cash", block = { color, mat, size } }).
-- Map: workspace.Tycoon with
--   Items    Models you can buy, hidden until bought. Their parts can be:
--              Dropper   + IntValue Worth, NumberValue Rate: drops a block every Rate seconds
--              Upgrader  + NumberValue Mult: a block passing through is worth Mult times more (once each)
--   Buttons  Parts named Button + StringValue Item, IntValue Price, StringValue Needs (an item that
--            has to be bought first; "" for none), StringValue Label
--   Collector  turns blocks into money;  Conveyor parts move blocks along (their Velocity)
-- Progress (money and what you own) is saved on this device (DataStore) every few seconds.
local Players = game:GetService("Players")
local Debris = game:GetService("Debris")
local T = workspace:WaitForChild("Tycoon")
local MONEY = TYCOON.money or "Cash"
local store = Instance.new("Folder")
store.Name = "TycoonStore"
store.Parent = game:GetService("Lighting")
local items, buttons = {}, {}
for _, m in pairs(T.Items:GetChildren()) do items[m.Name] = m m.Parent = store end
for _, b in pairs(T.Buttons:GetChildren()) do
	buttons[#buttons + 1] = { part = b, item = b.Item.Value, price = b.Price.Value, needs = b.Needs.Value, label = b.Label.Value }
end
local owned, cash = {}, 0
local ds
pcall(function() ds = game:GetService("DataStoreService"):GetDataStore("GNTycoon_" .. string.gsub(TYCOON.name, "%W", "")) end)

local function money(plr) return H.stat(plr, MONEY) end
local function setMoney(v)
	cash = v
	for _, p in pairs(Players:GetPlayers()) do H.stat(p, MONEY, v - H.stat(p, MONEY)) end
end
local function short(n)
	if n >= 1e6 then return string.format("%.1fM", n / 1e6) elseif n >= 1e4 then return string.format("%.1fK", n / 1e3) end
	return tostring(n)
end

-- what each button shows; buttons whose item you own, or whose "needs" you don't, are hidden
local function refresh()
	for _, b in ipairs(buttons) do
		local show = not owned[b.item] and (b.needs == "" or owned[b.needs])
		b.part.Parent = show and T.Buttons or store
		if show and not b.part:FindFirstChild("Tag") then
			local g = Instance.new("BillboardGui")
			g.Name = "Tag"
			g.Size = UDim2.new(0, 170, 0, 46)
			g.StudsOffset = Vector3.new(0, 2.6, 0)
			g.Adornee = b.part
			local t = Instance.new("TextLabel", g)
			t.Size = UDim2.new(1, 0, 1, 0)
			t.BackgroundTransparency = 1
			t.TextColor3 = Color3.new(1, 1, 1)
			t.TextStrokeTransparency = 0.2
			t.Font = Enum.Font.SourceSansBold
			t.FontSize = Enum.FontSize.Size18
			t.Text = b.label .. (b.price > 0 and ("\n$" .. short(b.price)) or "\nFREE")
			g.Parent = b.part
		end
	end
end
local function own(name)
	if owned[name] or not items[name] then return end
	owned[name] = true
	items[name].Parent = T
end
local function save()
	if not ds then return end
	local list = {}
	for k in pairs(owned) do list[#list + 1] = k end
	pcall(function() ds:SetAsync("save", { cash = cash, owned = list }) end)
end
pcall(function()
	local d = ds and ds:GetAsync("save")
	if type(d) == "table" then
		for _, k in ipairs(d.owned or {}) do own(k) end
		cash = tonumber(d.cash) or 0
	end
end)
for _, b in ipairs(buttons) do if b.price == 0 then own(b.item) end end
refresh()

local busy = {}
for _, b in ipairs(buttons) do
	b.part.Touched:connect(function(hit)
		local plr = H.playerOf(hit)
		if not plr or busy[b] or owned[b.item] then return end
		busy[b] = true
		if cash >= b.price then
			setMoney(cash - b.price)
			own(b.item)
			refresh()
			H.sound(b.part, "electronicpingshort", 0.6)
			save()
		else
			H.msg(plr, "You need $" .. short(b.price - cash) .. " more for " .. b.label .. ".", 2)
		end
		wait(1)
		busy[b] = false
	end)
end

-- blocks: droppers make them, upgraders multiply them, the collector cashes them in
local blockColor = TYCOON.block and TYCOON.block[1] or 194
local blockMat = TYCOON.block and TYCOON.block[2] or "SmoothPlastic"
local blockSize = TYCOON.block and TYCOON.block[3] or 1
local function drop(d)
	local b = Instance.new("Part")
	pcall(function() b.FormFactor = Enum.FormFactor.Custom end)
	b.Name = "TycoonBlock"
	b.Size = Vector3.new(blockSize, blockSize, blockSize)
	b.BrickColor = BrickColor.new(blockColor)
	pcall(function() b.Material = Enum.Material[blockMat] end)
	b.TopSurface, b.BottomSurface = Enum.SurfaceType.Smooth, Enum.SurfaceType.Smooth
	b.CFrame = d.CFrame * CFrame.new(0, -d.Size.Y / 2 - blockSize, 0)
	local w = Instance.new("NumberValue", b)
	w.Name = "Worth"
	w.Value = d.Worth.Value
	b.Parent = workspace
	Debris:AddItem(b, 30)
end
local timers = {}
H.every(0.25, function()
	for name in pairs(owned) do
		local m = items[name]
		for _, d in pairs(m:GetChildren()) do
			if d.Name == "Dropper" and d:FindFirstChild("Worth") then
				timers[d] = (timers[d] or 0) + 0.25
				if timers[d] >= (d:FindFirstChild("Rate") and d.Rate.Value or 2) then timers[d] = 0 drop(d) end
			end
		end
	end
end)
local function upgrader(u)
	u.Touched:connect(function(hit)
		if hit.Name ~= "TycoonBlock" or hit:FindFirstChild("Up_" .. u:GetFullName()) then return end
		local tag = Instance.new("BoolValue", hit)
		tag.Name = "Up_" .. u:GetFullName()
		hit.Worth.Value = hit.Worth.Value * (u:FindFirstChild("Mult") and u.Mult.Value or 2)
		hit.BrickColor = BrickColor.new(24)
		pcall(function() hit.Material = Enum.Material.Neon end)
	end)
end
for _, m in pairs(items) do for _, p in pairs(m:GetChildren()) do if p.Name == "Upgrader" then upgrader(p) end end end
T.Collector.Touched:connect(function(hit)
	if hit.Name ~= "TycoonBlock" or not hit:FindFirstChild("Worth") then return end
	local v = math.floor(hit.Worth.Value)
	hit:Destroy()
	setMoney(cash + v)
end)

local function joined(p)
	p.CharacterAdded:connect(function() wait(0.3) H.stat(p, MONEY, cash - H.stat(p, MONEY)) end)
	H.stat(p, MONEY, cash - H.stat(p, MONEY))
end
Players.PlayerAdded:connect(joined)
for _, p in pairs(Players:GetPlayers()) do joined(p) end
local savedAt = cash
H.every(8, function() if cash ~= savedAt then savedAt = cash save() end end)
wait(3)
H.msg(nil, "Welcome to " .. TYCOON.name .. "! Step on the green buttons to build.", 4)
