-- GN-BLOX compatibility library: what newer Roblox scripts (2017 onwards) expect, built on the
-- 2016 engine's API. rbxfile.js puts this in ReplicatedFirst as the ModuleScript "GNCompat" when it
-- converts an uploaded game, and every script luau.js converted starts with
--   local __gn = require(game:GetService("ReplicatedFirst"):FindFirstChild("GNCompat"))
-- so they all share one copy (and one set of attributes, tags and layouts).
--
-- Objects from the place file are matched to their attributes, tags and GUI layouts by their full
-- name (the "GNCompatData" module next to this one, made by rbxfile.js); copies made by StarterGui,
-- StarterPack or :Clone() are matched by the end of their name.

local M = {}
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local function idx(o, k) return o[k] end
local function nidx(o, k, v) o[k] = v end
local function try(o, k)
	if type(o) == "table" then return o[k] end
	local ok, v = pcall(idx, o, k)
	if ok then return v end
	return nil
end
local function weak() return setmetatable({}, { __mode = "k" }) end
local function isA(o, c)
	if type(o) ~= "userdata" then return false end
	local ok, r = pcall(function() return o:IsA(c) end)
	return ok and r
end
M.try = try

-- ------------------------------------------------------------------ signals made in Lua
local Signal = {}
Signal.__index = Signal
local SignalMT = Signal
function M.signal()
	return setmetatable({ handlers = {}, waiting = {} }, Signal)
end
local Connection = {}
Connection.__index = Connection
function Connection:Disconnect()
	self.Connected = false
	self.connected = false
	if self.signal then self.signal.handlers[self] = nil end
end
Connection.disconnect = Connection.Disconnect
function Signal:Connect(f)
	local c = setmetatable({ signal = self, fn = f, Connected = true, connected = true }, Connection)
	self.handlers[c] = true
	return c
end
Signal.connect = Signal.Connect
Signal.ConnectParallel = Signal.Connect
function Signal:Once(f)
	local c
	c = self:Connect(function(...) c:Disconnect() f(...) end)
	return c
end
function Signal:Wait()
	local be = Instance.new("BindableEvent")
	table.insert(self.waiting, be)
	be.Event:wait()
	local args = self.lastArgs or {}
	return unpack(args, 1, args.n or #args)
end
Signal.wait = Signal.Wait
function Signal:Fire(...)
	self.lastArgs = { n = select("#", ...), ... }
	for c in pairs(self.handlers) do
		local f = c.fn
		local args = self.lastArgs
		coroutine.wrap(function() local ok, e = pcall(f, unpack(args, 1, args.n)) if not ok then warn(e) end end)()
	end
	local w = self.waiting
	self.waiting = {}
	for _, be in ipairs(w) do be:Fire() end
end
function Signal:DisconnectAll() self.handlers = {} end

-- ------------------------------------------------------------------ a placeholder for things the 2016 engine doesn't have
local Dummy = {}
local function dummy(name)
	return setmetatable({ __name = name or "Dummy" }, Dummy)
end
local DUMMY_METHODS = {
	IsA = function() return false end,
	FindFirstChild = function() return nil end,
	FindFirstChildOfClass = function() return nil end,
	FindFirstChildWhichIsA = function() return nil end,
	GetChildren = function() return {} end,
	GetDescendants = function() return {} end,
	Destroy = function() end,
	Remove = function() end,
	ClearAllChildren = function() end,
	Clone = function(self) return dummy(rawget(self, "__name")) end,
	GetAttribute = function() return nil end,
	SetAttribute = function() end,
	GetAttributes = function() return {} end,
	Disconnect = function() end,
	disconnect = function() end,
}
Dummy.__index = function(t, k)
	if k == "ClassName" or k == "Name" then return rawget(t, "__name") end
	if DUMMY_METHODS[k] then return DUMMY_METHODS[k] end
	if k == "Parent" then return nil end
	return t
end
Dummy.__newindex = function(t, k, v) rawset(t, k, v) end
Dummy.__call = function(t) return t end
Dummy.__tostring = function(t) return rawget(t, "__name") or "Dummy" end
M.dummy = dummy

-- ------------------------------------------------------------------ data from the place file
local data
local function D()
	if data == nil then
		data = false
		local m = game:GetService("ReplicatedFirst"):FindFirstChild("GNCompatData")
		if m then
			local ok, r = pcall(require, m)
			if ok and type(r) == "table" then data = r end
		end
	end
	return data or {}
end
local function pathOf(o)
	local ok, p = pcall(function() return o:GetFullName() end)
	return ok and p or nil
end
local function remap(p)
	local q = p:gsub("^Players%.[^%.]+%.PlayerGui", "StarterGui")
	q = q:gsub("^Players%.[^%.]+%.Backpack", "StarterPack")
	q = q:gsub("^Players%.[^%.]+%.PlayerScripts", "StarterPlayer.StarterPlayerScripts")
	return q
end
local suffixes = setmetatable({}, { __mode = "k" })
local function suffixIndex(tbl)
	local s = suffixes[tbl]
	if s then return s end
	s = {}
	for p in pairs(tbl) do
		local parts = {}
		for w in p:gmatch("[^%.]+") do table.insert(parts, w) end
		for n = 2, 3 do
			if #parts >= n then
				local k = table.concat(parts, ".", #parts - n + 1)
				if s[k] == nil then s[k] = p elseif s[k] ~= p then s[k] = false end
			end
		end
	end
	suffixes[tbl] = s
	return s
end
-- the entry in a path-keyed table (from GNCompatData) that belongs to this object
local function lookup(tbl, o)
	if not tbl then return nil end
	local p = pathOf(o)
	if not p then return nil end
	local v = tbl[p]
	if v ~= nil then return v end
	local q = remap(p)
	v = tbl[q]
	if v ~= nil then return v end
	local parts = {}
	for w in q:gmatch("[^%.]+") do table.insert(parts, w) end
	local s = suffixIndex(tbl)
	for n = 3, 2, -1 do
		if #parts >= n then
			local k = s[table.concat(parts, ".", #parts - n + 1)]
			if k then return tbl[k] end
		end
	end
	return nil
end
M.lookup = lookup
local function findPath(p)   -- an object by its full name
	local o = game
	for w in p:gmatch("[^%.]+") do
		local c = o:FindFirstChild(w)
		if not c then
			local ok, s = pcall(function() return game:GetService(w) end)
			if o == game and ok and s then c = s else return nil end
		end
		o = c
	end
	return o
end

-- ------------------------------------------------------------------ task
local task = {}
local cancelled = setmetatable({}, { __mode = "k" })
local function resume(co, ...)
	local ok, e = coroutine.resume(co, ...)
	if not ok then warn(tostring(e)) end
end
function task.wait(t) local a = wait(t) return a end
function task.spawn(f, ...)
	local co = type(f) == "thread" and f or coroutine.create(f)
	resume(co, ...)
	return co
end
function task.defer(f, ...)
	local co = type(f) == "thread" and f or coroutine.create(f)
	local a, n = { ... }, select("#", ...)
	spawn(function() if not cancelled[co] then resume(co, unpack(a, 1, n)) end end)
	return co
end
function task.delay(t, f, ...)
	local co = type(f) == "thread" and f or coroutine.create(f)
	local a, n = { ... }, select("#", ...)
	delay(t or 0, function() if not cancelled[co] then resume(co, unpack(a, 1, n)) end end)
	return co
end
function task.cancel(co) if co then cancelled[co] = true end end
function task.synchronize() end
function task.desynchronize() end
M.task = task

-- ------------------------------------------------------------------ math, table, string, os, utf8, bit32
local function split(s, sep)
	s = tostring(s)
	sep = sep or ","
	local r = {}
	if sep == "" then for c in s:gmatch(".") do r[#r + 1] = c end return r end
	local i = 1
	while true do
		local a, b = s:find(sep, i, true)
		if not a then r[#r + 1] = s:sub(i) break end
		r[#r + 1] = s:sub(i, a - 1)
		i = b + 1
	end
	return r
end
M.split = split
pcall(function() if not string.split then string.split = split end end)
M.string = setmetatable({ split = split }, { __index = string })

M.math = setmetatable({
	clamp = function(x, a, b) if x < a then return a elseif x > b then return b end return x end,
	sign = function(x) if x > 0 then return 1 elseif x < 0 then return -1 end return 0 end,
	round = function(x) if x >= 0 then return math.floor(x + 0.5) end return math.ceil(x - 0.5) end,
	log = function(x, b) if b then return math.log(x) / math.log(b) end return math.log(x) end,
	noise = math.noise or function() return 0 end,
}, { __index = math })

local frozen = setmetatable({}, { __mode = "k" })
M.table = setmetatable({
	find = function(t, v, i) for k = i or 1, #t do if t[k] == v then return k end end return nil end,
	clear = function(t) for k in pairs(t) do t[k] = nil end end,
	create = function(n, v) local r = {} for k = 1, n do r[k] = v end return r end,
	pack = function(...) return { n = select("#", ...), ... } end,
	unpack = unpack,
	move = function(a, f, e, t, b) b = b or a if f <= e then for k = 0, e - f do b[t + k] = a[f + k] end end return b end,
	clone = function(t) local r = {} for k, v in pairs(t) do r[k] = v end return setmetatable(r, getmetatable(t)) end,
	freeze = function(t) frozen[t] = true return t end,
	isfrozen = function(t) return frozen[t] == true end,
}, { __index = table })

local function civil(t)   -- seconds since 1970 -> UTC date fields
	local days = math.floor(t / 86400)
	local secs = t - days * 86400
	local z = days + 719468
	local era = math.floor(z / 146097)
	local doe = z - era * 146097
	local yoe = math.floor((doe - math.floor(doe / 1460) + math.floor(doe / 36524) - math.floor(doe / 146096)) / 365)
	local y = yoe + era * 400
	local doy = doe - (365 * yoe + math.floor(yoe / 4) - math.floor(yoe / 100))
	local mp = math.floor((5 * doy + 2) / 153)
	local d = doy - math.floor((153 * mp + 2) / 5) + 1
	local m = mp < 10 and mp + 3 or mp - 9
	if m <= 2 then y = y + 1 end
	local jan1 = days - (doy - (mp < 10 and 306 or -59))
	return { year = y, month = m, day = d, hour = math.floor(secs / 3600), min = math.floor(secs % 3600 / 60),
		sec = math.floor(secs % 60), wday = (days + 4) % 7 + 1, yday = 0, isdst = false }
end
local DAYS = { "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" }
local MONTHS = { "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" }
M.os = setmetatable({
	clock = function() return tick() end,
	date = function(fmt, t)
		local ok, r = pcall(os.date, fmt, t)
		if ok and r then return r end
		fmt = fmt or "%c"
		t = t or os.time()
		local d = civil(t)
		if fmt:find("^!?%*t") then return d end
		return (fmt:gsub("^!", ""):gsub("%%(%a)", function(c)
			if c == "Y" then return tostring(d.year) elseif c == "y" then return string.format("%02d", d.year % 100)
			elseif c == "m" then return string.format("%02d", d.month) elseif c == "d" then return string.format("%02d", d.day)
			elseif c == "H" then return string.format("%02d", d.hour) elseif c == "M" then return string.format("%02d", d.min)
			elseif c == "S" then return string.format("%02d", d.sec) elseif c == "p" then return d.hour < 12 and "AM" or "PM"
			elseif c == "I" then return string.format("%02d", (d.hour + 11) % 12 + 1)
			elseif c == "A" then return DAYS[d.wday] elseif c == "a" then return DAYS[d.wday]:sub(1, 3)
			elseif c == "B" then return MONTHS[d.month] elseif c == "b" then return MONTHS[d.month]:sub(1, 3)
			elseif c == "c" then return string.format("%s %s %d %02d:%02d:%02d %d", DAYS[d.wday]:sub(1, 3), MONTHS[d.month]:sub(1, 3), d.day, d.hour, d.min, d.sec, d.year)
			elseif c == "x" then return string.format("%02d/%02d/%02d", d.month, d.day, d.year % 100)
			elseif c == "X" then return string.format("%02d:%02d:%02d", d.hour, d.min, d.sec) end
			return c
		end))
	end,
	time = function(t) if type(t) == "table" then local ok, r = pcall(os.time, t) if ok then return r end end return os.time() end,
	difftime = function(a, b) return a - (b or 0) end,
}, { __index = os })

local utf8 = { charpattern = "[%z\1-\127\194-\244][\128-\191]*" }
function utf8.char(...)
	local out = {}
	for _, c in ipairs({ ... }) do
		if c < 0x80 then out[#out + 1] = string.char(c)
		elseif c < 0x800 then out[#out + 1] = string.char(0xC0 + math.floor(c / 64), 0x80 + c % 64)
		elseif c < 0x10000 then out[#out + 1] = string.char(0xE0 + math.floor(c / 4096), 0x80 + math.floor(c / 64) % 64, 0x80 + c % 64)
		else out[#out + 1] = string.char(0xF0 + math.floor(c / 262144), 0x80 + math.floor(c / 4096) % 64, 0x80 + math.floor(c / 64) % 64, 0x80 + c % 64) end
	end
	return table.concat(out)
end
function utf8.codes(s)
	local i = 1
	return function()
		if i > #s then return nil end
		local start = i
		local c = s:byte(i)
		local n = c >= 0xF0 and 4 or c >= 0xE0 and 3 or c >= 0xC0 and 2 or 1
		local cp = n == 1 and c or (c % (2 ^ (7 - n)))
		for k = 1, n - 1 do cp = cp * 64 + (s:byte(i + k) or 128) % 64 end
		i = i + n
		return start, cp
	end
end
function utf8.len(s) local n = 0 for _ in utf8.codes(s) do n = n + 1 end return n end
function utf8.codepoint(s, i, j)
	i = i or 1
	j = j or i
	local r = {}
	for p, c in utf8.codes(s) do if p >= i and p <= j then r[#r + 1] = c end end
	return unpack(r)
end
function utf8.offset(s, n, i)
	i = i or 1
	local k = 0
	for p in utf8.codes(s) do if p >= i then k = k + 1 if k == n then return p end end end
	return nil
end
function utf8.graphemes(s) return utf8.codes(s) end
function utf8.nfcnormalize(s) return s end
function utf8.nfdnormalize(s) return s end
M.utf8 = utf8

local function tobits(a) a = math.floor(tonumber(a) or 0) % 4294967296 return a end
local function bitop(a, b, f)
	a, b = tobits(a), tobits(b)
	local r, bit = 0, 1
	for _ = 1, 32 do
		local x, y = a % 2, b % 2
		if f(x, y) then r = r + bit end
		a, b, bit = (a - x) / 2, (b - y) / 2, bit * 2
	end
	return r
end
local bit32 = {}
function bit32.band(a, b, ...) local r = bitop(a, b or 4294967295, function(x, y) return x == 1 and y == 1 end) if ... then return bit32.band(r, ...) end return r end
function bit32.bor(a, b, ...) local r = bitop(a, b or 0, function(x, y) return x == 1 or y == 1 end) if ... then return bit32.bor(r, ...) end return r end
function bit32.bxor(a, b, ...) local r = bitop(a, b or 0, function(x, y) return x ~= y end) if ... then return bit32.bxor(r, ...) end return r end
function bit32.bnot(a) return 4294967295 - tobits(a) end
function bit32.lshift(a, n) return tobits(tobits(a) * 2 ^ n) end
function bit32.rshift(a, n) return math.floor(tobits(a) / 2 ^ n) end
function bit32.arshift(a, n) a = tobits(a) local r = math.floor(a / 2 ^ n) if a >= 2147483648 then r = r + (2 ^ 32 - 2 ^ (32 - n)) end return tobits(r) end
function bit32.btest(...) return bit32.band(...) ~= 0 end
function bit32.extract(a, f, w) w = w or 1 return math.floor(tobits(a) / 2 ^ f) % 2 ^ w end
function bit32.replace(a, v, f, w) w = w or 1 local mask = 2 ^ w - 1 v = tobits(v) % (mask + 1) return tobits(a) - bit32.extract(a, f, w) * 2 ^ f + v * 2 ^ f end
function bit32.lrotate(a, n) n = n % 32 a = tobits(a) return tobits(a * 2 ^ n + math.floor(a / 2 ^ (32 - n))) end
function bit32.rrotate(a, n) return bit32.lrotate(a, 32 - n % 32) end
function bit32.countlz(a) a = tobits(a) local n = 0 for b = 31, 0, -1 do if math.floor(a / 2 ^ b) % 2 == 1 then return n end n = n + 1 end return 32 end
function bit32.countrz(a) a = tobits(a) if a == 0 then return 32 end local n = 0 while a % 2 == 0 do a = a / 2 n = n + 1 end return n end
M.bit32 = bit32

-- ------------------------------------------------------------------ typeof and Enum items that came later
local FakeEnum = {}
FakeEnum.__index = FakeEnum
FakeEnum.__tostring = function(e) return "Enum." .. e.EnumType .. "." .. e.Name end
function FakeEnum:IsA(t) return t == self.EnumType end
local enums = {}
local enumCount = {}
function M.enum(t, i)
	local key = t .. "." .. i
	local v = enums[key]
	if v ~= nil then return v end
	local ok, r = pcall(function() return Enum[t][i] end)
	if ok and r then v = r
	else
		enumCount[t] = (enumCount[t] or 0) + 1
		v = setmetatable({ Name = i, EnumType = t, Value = enumCount[t] - 1 }, FakeEnum)
	end
	enums[key] = v
	return v
end
local function enumName(e)
	if e == nil then return nil end
	if type(e) == "string" then return e end
	local n = try(e, "Name")
	if n then return n end
	return (tostring(e):match("[^%.]+$"))
end
M.enumName = enumName

function M.typeof(v)
	local t = type(v)
	if t == "table" then
		local mt = getmetatable(v)
		if mt == FakeEnum then return "EnumItem" end
		if mt == SignalMT then return "RBXScriptSignal" end
		if mt == Connection then return "RBXScriptConnection" end
		if mt == Dummy then return "Instance" end
		if type(mt) == "table" and rawget(mt, "__type") then return mt.__type end
		return "table"
	end
	if t ~= "userdata" then return t end
	local function has(k) return try(v, k) ~= nil end
	if has("ClassName") then return "Instance" end
	if has("lookVector") then return "CFrame" end
	if has("Z") and has("magnitude") then return "Vector3" end
	if has("X") and has("magnitude") then return "Vector2" end
	if has("Number") and has("Color") then return "BrickColor" end
	if has("EnumType") then return "EnumItem" end
	if has("r") and has("g") then return "Color3" end
	if has("Scale") and has("Offset") then return "UDim" end
	if has("X") and has("Y") and try(try(v, "X"), "Scale") ~= nil then return "UDim2" end
	if has("Origin") and has("Direction") then return "Ray" end
	local s = tostring(v)
	if s:find("^Signal") then return "RBXScriptSignal" end
	if s:find("^Connection") then return "RBXScriptConnection" end
	return "userdata"
end

-- ------------------------------------------------------------------ value types
M.Vector3 = setmetatable({}, { __index = Vector3 })
M.CFrame = setmetatable({
	lookAt = function(at, target, up)
		if not up then return CFrame.new(at, target) end
		local look = (target - at).unit
		local right = look:Cross(up).unit
		local up2 = right:Cross(look)
		return CFrame.new(at.X, at.Y, at.Z, right.X, up2.X, -look.X, right.Y, up2.Y, -look.Y, right.Z, up2.Z, -look.Z)
	end,
	lookAlong = function(at, dir, up) return M.CFrame.lookAt(at, at + dir, up) end,
	fromOrientation = function(x, y, z) return CFrame.Angles(0, y, 0) * CFrame.Angles(x, 0, 0) * CFrame.Angles(0, 0, z) end,
	fromEulerAnglesYXZ = function(x, y, z) return CFrame.Angles(0, y, 0) * CFrame.Angles(x, 0, 0) * CFrame.Angles(0, 0, z) end,
	fromEulerAngles = function(x, y, z) return CFrame.Angles(x, y, z) end,
	fromMatrix = function(p, vx, vy, vz)
		vz = vz or vx:Cross(vy)
		return CFrame.new(p.X, p.Y, p.Z, vx.X, vy.X, vz.X, vx.Y, vy.Y, vz.Y, vx.Z, vy.Z, vz.Z)
	end,
	fromAxisAngle = function(axis, a)
		local ok, r = pcall(function() return CFrame.fromAxisAngle(axis, a) end)
		if ok then return r end
		local u = axis.unit
		local c, s = math.cos(a), math.sin(a)
		local t = 1 - c
		local x, y, z = u.X, u.Y, u.Z
		return CFrame.new(0, 0, 0, t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c)
	end,
	identity = CFrame.new(),
}, { __index = CFrame })

local function hsv(h, s, v)
	local i = math.floor(h * 6)
	local f = h * 6 - i
	local p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
	i = i % 6
	if i == 0 then return Color3.new(v, t, p) elseif i == 1 then return Color3.new(q, v, p) elseif i == 2 then return Color3.new(p, v, t)
	elseif i == 3 then return Color3.new(p, q, v) elseif i == 4 then return Color3.new(t, p, v) end
	return Color3.new(v, p, q)
end
local function toHSV(c)
	local r, g, b = c.r, c.g, c.b
	local mx, mn = math.max(r, g, b), math.min(r, g, b)
	local d = mx - mn
	local h = 0
	if d > 0 then
		if mx == r then h = ((g - b) / d) % 6 elseif mx == g then h = (b - r) / d + 2 else h = (r - g) / d + 4 end
		h = h / 6
	end
	return h, mx == 0 and 0 or d / mx, mx
end
M.Color3 = setmetatable({
	fromHSV = function(h, s, v) local ok, r = pcall(function() return Color3.fromHSV(h, s, v) end) if ok and r then return r end return hsv(h, s, v) end,
	toHSV = function(c) return toHSV(c) end,
	fromHex = function(h)
		h = tostring(h):gsub("#", "")
		if #h == 3 then h = h:sub(1, 1):rep(2) .. h:sub(2, 2):rep(2) .. h:sub(3, 3):rep(2) end
		return Color3.new((tonumber(h:sub(1, 2), 16) or 0) / 255, (tonumber(h:sub(3, 4), 16) or 0) / 255, (tonumber(h:sub(5, 6), 16) or 0) / 255)
	end,
}, { __index = Color3 })
M.UDim2 = setmetatable({
	fromScale = function(x, y) return UDim2.new(x or 0, 0, y or 0, 0) end,
	fromOffset = function(x, y) return UDim2.new(0, x or 0, 0, y or 0) end,
}, { __index = UDim2 })
M.Vector2 = setmetatable({}, { __index = Vector2 })

-- NumberRange, NumberSequence and ColorSequence aren't in this engine's Lua: plain tables stand in
-- (setting one on a ParticleEmitter is skipped)
local function kp(t, v, e) return { Time = t, Value = v, Envelope = e or 0 } end
M.NumberRange = rawget(getfenv(0), "NumberRange") or { new = function(a, b) return setmetatable({ Min = a, Max = b or a }, { __type = "NumberRange" }) end }
M.NumberSequenceKeypoint = rawget(getfenv(0), "NumberSequenceKeypoint") or { new = kp }
M.ColorSequenceKeypoint = rawget(getfenv(0), "ColorSequenceKeypoint") or { new = function(t, c) return { Time = t, Value = c } end }
M.NumberSequence = rawget(getfenv(0), "NumberSequence") or { new = function(a, b)
	if type(a) == "table" then return setmetatable({ Keypoints = a }, { __type = "NumberSequence" }) end
	return setmetatable({ Keypoints = { kp(0, a), kp(1, b or a) } }, { __type = "NumberSequence" })
end }
M.ColorSequence = rawget(getfenv(0), "ColorSequence") or { new = function(a, b)
	if type(a) == "table" then return setmetatable({ Keypoints = a }, { __type = "ColorSequence" }) end
	return setmetatable({ Keypoints = { { Time = 0, Value = a }, { Time = 1, Value = b or a } } }, { __type = "ColorSequence" })
end }

-- Random (2017): xorshift-free, a plain linear congruential generator on doubles
local RandomC = {}
RandomC.__index = RandomC
RandomC.__type = "Random"
local function lcg(self)
	self.s = (self.s * 1103515245 + 12345) % 2147483648
	return self.s / 2147483648
end
function RandomC:NextNumber(a, b)
	local x = lcg(self)
	if a then return a + (b - a) * x end
	return x
end
function RandomC:NextInteger(a, b) return math.floor(a + (b - a + 1) * lcg(self)) end
function RandomC:NextUnitVector()
	local z = 2 * lcg(self) - 1
	local t = 2 * math.pi * lcg(self)
	local r = math.sqrt(1 - z * z)
	return Vector3.new(r * math.cos(t), r * math.sin(t), z)
end
function RandomC:Shuffle(t) for i = #t, 2, -1 do local j = self:NextInteger(1, i) t[i], t[j] = t[j], t[i] end end
function RandomC:Clone() return setmetatable({ s = self.s }, RandomC) end
M.Random = rawget(getfenv(0), "Random") or { new = function(seed)
	seed = math.floor(seed or (tick() * 1000 + math.random(1, 100000)))
	return setmetatable({ s = seed % 2147483648 }, RandomC)
end }

M.DateTime = {
	now = function()
		local t = tick()
		return { UnixTimestamp = math.floor(t), UnixTimestampMillis = math.floor(t * 1000),
			ToIsoDate = function(self) local d = civil(self.UnixTimestamp) return string.format("%04d-%02d-%02dT%02d:%02d:%02dZ", d.year, d.month, d.day, d.hour, d.min, d.sec) end,
			ToUniversalTime = function(self) local d = civil(self.UnixTimestamp) return { Year = d.year, Month = d.month, Day = d.day, Hour = d.hour, Minute = d.min, Second = d.sec, Millisecond = 0 } end,
			FormatUniversalTime = function(self, f) return M.os.date("!%c", self.UnixTimestamp) end,
			FormatLocalTime = function(self, f) return M.os.date("%c", self.UnixTimestamp) end }
	end,
	fromUnixTimestamp = function(t) local d = M.DateTime.now() d.UnixTimestamp = t d.UnixTimestampMillis = t * 1000 return d end,
}

-- Font objects (2022) -> the 2016 Font enum
local function fontEnum(family, weight, style)
	local f = tostring(family or ""):lower()
	local w = enumName(weight) or ""
	local bold = w == "Bold" or w == "Heavy" or w == "ExtraBold" or w == "SemiBold" or w == "Black" or (tonumber(weight) or 400) >= 600
	local light = w == "Light" or w == "Thin" or w == "ExtraLight"
	if f:find("arial") or f:find("arimo") then return bold and Enum.Font.ArialBold or Enum.Font.Arial end
	if enumName(style) == "Italic" then return Enum.Font.SourceSansItalic end
	if bold or f:find("bold") or f:find("black") then return Enum.Font.SourceSansBold end
	if light then return Enum.Font.SourceSansLight end
	return Enum.Font.SourceSans
end
M.Font = {
	new = function(family, weight, style) return setmetatable({ Family = family, Weight = weight or M.enum("FontWeight", "Regular"), Style = style or M.enum("FontStyle", "Normal"), Bold = false }, { __type = "Font" }) end,
	fromEnum = function(e) return setmetatable({ Family = tostring(e), Weight = M.enum("FontWeight", "Regular"), Style = M.enum("FontStyle", "Normal"), enum = e }, { __type = "Font" }) end,
	fromName = function(n, weight, style) return M.Font.new(n, weight, style) end,
	fromId = function(id, weight, style) return M.Font.new(tostring(id), weight, style) end,
}

M.RaycastParams = { new = function(t)
	local p = { FilterDescendantsInstances = {}, FilterType = M.enum("RaycastFilterType", "Exclude"), IgnoreWater = false, CollisionGroup = "Default", RespectCanCollide = false, BruteForceAllSlow = false }
	function p:AddToFilter(x) if type(x) == "table" then for _, v in ipairs(x) do table.insert(self.FilterDescendantsInstances, v) end else table.insert(self.FilterDescendantsInstances, x) end end
	return setmetatable(p, { __type = "RaycastParams" })
end }
M.OverlapParams = { new = function() local p = M.RaycastParams.new() p.MaxParts = 0 return setmetatable(p, { __type = "OverlapParams" }) end }

-- ------------------------------------------------------------------ attributes and tags
local attrs = weak()
local attrSignals = weak()
local attrChanged = weak()
local function attrsOf(o)
	local a = attrs[o]
	if a == nil then
		a = {}
		local src = lookup(D().attrs, o)
		if src then for k, v in pairs(src) do a[k] = v end end
		attrs[o] = a
	end
	return a
end
local function attrSignal(o, k)
	local s = attrSignals[o]
	if not s then s = {} attrSignals[o] = s end
	if not s[k] then s[k] = M.signal() end
	return s[k]
end

local tagSets = {}            -- tag -> { [inst] = true } added while playing
local untagged = {}           -- tag -> { [inst] = true } removed while playing
local tagAdded, tagRemoved = {}, {}
local function weakSet(t, k) local s = t[k] if not s then s = weak() t[k] = s end return s end
local fileTagsByPath
local function fileTags(o)
	if not fileTagsByPath then
		fileTagsByPath = {}
		for tag, paths in pairs(D().tags or {}) do
			for _, p in ipairs(paths) do
				local l = fileTagsByPath[p] or {}
				l[tag] = true
				fileTagsByPath[p] = l
			end
		end
	end
	return lookup(fileTagsByPath, o)
end
local function hasTag(o, tag)
	if weakSet(tagSets, tag)[o] then return true end
	if weakSet(untagged, tag)[o] then return false end
	local f = fileTags(o)
	return f ~= nil and f[tag] == true
end
local function addTag(o, tag)
	if hasTag(o, tag) then return end
	weakSet(untagged, tag)[o] = nil
	weakSet(tagSets, tag)[o] = true
	if tagAdded[tag] then tagAdded[tag]:Fire(o) end
end
local function removeTag(o, tag)
	if not hasTag(o, tag) then return end
	weakSet(tagSets, tag)[o] = nil
	weakSet(untagged, tag)[o] = true
	if tagRemoved[tag] then tagRemoved[tag]:Fire(o) end
end
local resolved = {}   -- file paths -> objects (resolved once)
local function getTagged(tag)
	local out, seen = {}, {}
	local function add(o)
		if o and not seen[o] and o.Parent ~= nil and hasTag(o, tag) then seen[o] = true table.insert(out, o) end
	end
	for _, p in ipairs((D().tags or {})[tag] or {}) do
		local o = resolved[p]
		if o == nil or o.Parent == nil then o = findPath(p) resolved[p] = o or false end
		if o then add(o) end
	end
	for o in pairs(weakSet(tagSets, tag)) do add(o) end
	return out
end
local watching = {}
local function watchTag(tag)
	if watching[tag] then return end
	watching[tag] = true
	-- copies of tagged objects (made while playing) get the tag too
	local seen = weak()
	for _, o in ipairs(getTagged(tag)) do seen[o] = true end
	local function check(o)
		if not seen[o] and hasTag(o, tag) then seen[o] = true if tagAdded[tag] then tagAdded[tag]:Fire(o) end end
	end
	workspace.DescendantAdded:connect(check)
	local rs = game:GetService("ReplicatedStorage")
	rs.DescendantAdded:connect(check)
end
local function tagsOf(o)
	local r = {}
	local f = fileTags(o)
	if f then for t in pairs(f) do if hasTag(o, t) then r[#r + 1] = t end end end
	for t, s in pairs(tagSets) do if s[o] then r[#r + 1] = t end end
	return r
end

-- ------------------------------------------------------------------ properties that came later
local store = weak()   -- object -> { property = value } for properties the engine doesn't have
local function propsOf(o)
	local s = store[o]
	if s == nil then
		s = {}
		local src = lookup(D().props, o)
		if src then for k, v in pairs(src) do s[k] = v end end
		store[o] = s
	end
	return s
end
local anchors = weak()
local function anchorOf(o)
	local a = anchors[o]
	if a == nil then
		a = lookup(D().anchors, o) or false
		anchors[o] = a
	end
	return a or nil
end
local function shift(a, size)
	return UDim2.new(a[1] * size.X.Scale, a[1] * size.X.Offset, a[2] * size.Y.Scale, a[2] * size.Y.Offset)
end

local relayout   -- (set below)
local G = {}     -- getters: object, stored props -> value
local S = {}     -- setters: object, value, stored props -> handled
local DEFAULTS = { Enabled = true, ResetOnSpawn = true, IgnoreGuiInset = false, LayoutOrder = 0, RichText = false, CanTouch = true,
	CanQuery = true, PlaceholderText = "", Interactable = true, MaxVisibleGraphemes = -1, LineHeight = 1, Massless = false,
	CollisionGroup = "Default", BreakJointsOnDeath = true, RequiresNeck = true, UseJumpPower = true, EvaluateStateMachine = true,
	DisplayOrder = 0, CastShadow = true, AutoLocalize = true, ClipToDeviceSafeArea = true, SafeAreaCompatibility = true }

local function setHidden(gui, hide, st)
	if hide then
		st.__hidden = st.__hidden or {}
		for _, c in ipairs(gui:GetChildren()) do
			if isA(c, "GuiObject") and c.Visible then c.Visible = false table.insert(st.__hidden, c) end
		end
		if not st.__watch then
			st.__watch = gui.ChildAdded:connect(function(c)
				if st.Enabled == false and isA(c, "GuiObject") and c.Visible then c.Visible = false table.insert(st.__hidden, c) end
			end)
		end
	else
		for _, c in ipairs(st.__hidden or {}) do pcall(function() c.Visible = true end) end
		st.__hidden = nil
	end
end
S.Enabled = function(o, v, st)
	if isA(o, "ScreenGui") or isA(o, "BillboardGui") or isA(o, "SurfaceGui") then
		local was = st.Enabled ~= false and not st.__applied == false
		st.Enabled = v and true or false
		setHidden(o, not st.Enabled, st)
		st.__applied = true
		return true
	end
	st.Enabled = v
	return true
end
S.Orientation = function(o, v) o.Rotation = v return true end
G.Orientation = function(o) return o.Rotation end
S.AssemblyLinearVelocity = function(o, v) o.Velocity = v return true end
G.AssemblyLinearVelocity = function(o) return o.Velocity end
S.AssemblyAngularVelocity = function(o, v) o.RotVelocity = v return true end
G.AssemblyAngularVelocity = function(o) return o.RotVelocity end
G.AssemblyMass = function(o) return o:GetMass() end
G.Mass = function(o) return o:GetMass() end
G.AssemblyRootPart = function(o) return o end
G.DisplayName = function(o)
	if isA(o, "Humanoid") then return o.Parent and o.Parent.Name or "" end
	return o.Name
end
S.JumpHeight = function(o, v, st) st.JumpHeight = v o.JumpPower = math.sqrt(2 * workspace.Gravity * v) return true end
G.JumpHeight = function(o, st) if st.JumpHeight then return st.JumpHeight end local p = o.JumpPower return p * p / (2 * workspace.Gravity) end
G.AttributeChanged = function(o)
	local s = attrChanged[o]
	if not s then s = M.signal() attrChanged[o] = s end
	return s
end
S.AnchorPoint = function(o, v, st)
	if not isA(o, "GuiObject") then return false end
	local old = anchorOf(o) or { 0, 0 }
	local new = { v.X, v.Y }
	local size = o.Size
	o.Position = o.Position - shift({ new[1] - old[1], new[2] - old[2] }, size)
	anchors[o] = (new[1] ~= 0 or new[2] ~= 0) and new or false
	return true
end
G.AnchorPoint = function(o) local a = anchorOf(o) return a and Vector2.new(a[1], a[2]) or Vector2.new(0, 0) end
S.Position = function(o, v)
	local a = isA(o, "GuiObject") and anchorOf(o)
	if a and v then v = v - shift(a, o.Size) end
	o.Position = v
	return true
end
G.Position = function(o)
	local a = isA(o, "GuiObject") and anchorOf(o)
	if a then return o.Position + shift(a, o.Size) end
	return o.Position
end
S.Size = function(o, v)
	local a = isA(o, "GuiObject") and anchorOf(o)
	if a then
		local old = o.Size
		o.Size = v
		o.Position = o.Position - shift(a, UDim2.new(v.X.Scale - old.X.Scale, v.X.Offset - old.X.Offset, v.Y.Scale - old.Y.Scale, v.Y.Offset - old.Y.Offset))
		return true
	end
	o.Size = v
	return true
end
S.LayoutOrder = function(o, v, st)
	st.LayoutOrder = v
	if relayout and o.Parent then relayout(o.Parent) end
	return true
end
S.FontFace = function(o, v, st)
	st.FontFace = v
	if type(v) == "table" then pcall(nidx, o, "Font", v.enum or fontEnum(v.Family, v.Weight, v.Style)) end
	return true
end
G.FontFace = function(o, st) return st.FontFace or M.Font.fromEnum(o.Font) end
S.TextColor = function(o, v) o.TextColor3 = v.Color return true end
S.RichText = function(o, v, st) st.RichText = v if v then pcall(function() o.Text = o.Text:gsub("<[^>]->", "") end) end return true end

function M.get(o, k)
	if type(o) ~= "userdata" then return o[k] end
	local g = G[k]
	if g == nil or k == "Position" or k == "Size" then
		local ok, v = pcall(idx, o, k)
		if ok and (g == nil or not isA(o, "GuiObject") or not anchorOf(o)) then return v end
	end
	local st = propsOf(o)
	if g then return g(o, st) end
	local v = st[k]
	if v == nil then v = DEFAULTS[k] end
	return v
end
function M.set(o, k, v)
	if type(o) ~= "userdata" then o[k] = v return end
	local st
	if S[k] and (k == "Position" or k == "Size" or k == "Enabled") then
		if k ~= "Enabled" or isA(o, "LayerCollector") or isA(o, "ScreenGui") or isA(o, "BillboardGui") then
			st = propsOf(o)
			if S[k](o, v, st) then return end
		end
	end
	local ok = pcall(nidx, o, k, v)
	if ok then return end
	st = st or propsOf(o)
	if S[k] and S[k](o, v, st) then return end
	st[k] = v   -- the engine doesn't have it: remember it so the game can read it back
end

-- method and property names that changed case
local LF = {}   -- fallbacks for methods neither spelling has
LF.Lerp = function(a, b, t)
	if try(a, "r") ~= nil then return Color3.new(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t) end
	if try(a, "X") ~= nil and try(a.X, "Scale") ~= nil then
		return UDim2.new(a.X.Scale + (b.X.Scale - a.X.Scale) * t, a.X.Offset + (b.X.Offset - a.X.Offset) * t, a.Y.Scale + (b.Y.Scale - a.Y.Scale) * t, a.Y.Offset + (b.Y.Offset - a.Y.Offset) * t)
	end
	if try(a, "Scale") ~= nil then return UDim.new(a.Scale + (b.Scale - a.Scale) * t, a.Offset + (b.Offset - a.Offset) * t) end
	return a + (b - a) * t
end
LF.ToOrientation = function(cf)
	local _, _, _, r00, r01, r02, r10, r11, r12, r20, r21, r22 = cf:components()
	local x = math.asin(math.max(-1, math.min(1, -r12)))
	local y, z
	if math.abs(r12) < 0.9999 then y = math.atan2(r02, r22) z = math.atan2(r10, r11) else y = math.atan2(-r20, r00) z = 0 end
	return x, y, z
end
LF.ToEulerAnglesYXZ = LF.ToOrientation
LF.toEulerAnglesYXZ = LF.ToOrientation
LF.FuzzyEq = function(a, b, eps) eps = eps or 1e-5 return (a - b).magnitude <= eps end
LF.Angle = function(a, b, axis) local d = a.unit:Dot(b.unit) return math.acos(math.max(-1, math.min(1, d))) end
LF.Abs = function(v) return Vector3.new(math.abs(v.X), math.abs(v.Y), math.abs(v.Z)) end
LF.Floor = function(v) return Vector3.new(math.floor(v.X), math.floor(v.Y), math.floor(v.Z)) end
LF.Ceil = function(v) return Vector3.new(math.ceil(v.X), math.ceil(v.Y), math.ceil(v.Z)) end
LF.Sign = function(v) local s = M.math.sign return Vector3.new(s(v.X), s(v.Y), s(v.Z)) end
LF.Max = function(a, b) return Vector3.new(math.max(a.X, b.X), math.max(a.Y, b.Y), math.max(a.Z, b.Z)) end
LF.Min = function(a, b) return Vector3.new(math.min(a.X, b.X), math.min(a.Y, b.Y), math.min(a.Z, b.Z)) end
LF.ToHSV = function(c) return toHSV(c) end
LF.ToHex = function(c) return string.format("%02X%02X%02X", math.floor(c.r * 255 + .5), math.floor(c.g * 255 + .5), math.floor(c.b * 255 + .5)) end
LF.Orthonormalize = function(cf) return cf end
LF.GetComponents = function(cf) return cf:components() end
local PF = {}   -- fallbacks for properties
PF.Rotation = function(cf) return cf - cf.p end
PF.Position = function(cf) return cf.p end
PF.XVector = function(cf) return cf.rightVector end
PF.YVector = function(cf) return cf.upVector end
PF.ZVector = function(cf) return -cf.lookVector end
PF.Min = function(r) return r.Min end
PF.Connected = function() return true end

function M.lc(o, m, l, ...)   -- o:Method(...) where 2016 spells it l
	if type(o) == "table" then
		local f = o[m] or o[l]
		return f(o, ...)
	end
	local f = try(o, l)
	if type(f) ~= "function" then f = try(o, m) end
	if type(f) == "function" then return f(o, ...) end
	local fb = LF[m] or LF[l]
	if fb then return fb(o, ...) end
	error(tostring(m) .. " is not a valid member of " .. tostring(o), 2)
end
function M.lp(o, m, l)   -- o.Property where 2016 spells it l
	if type(o) == "table" then return o[m] end
	local v = try(o, l)
	if v ~= nil then return v end
	v = try(o, m)
	if v ~= nil then return v end
	local fb = PF[m]
	if fb then return fb(o) end
	return nil
end

-- ------------------------------------------------------------------ Instance methods that came later
local F = {}
local function descendants(o, out)
	out = out or {}
	for _, c in ipairs(o:GetChildren()) do out[#out + 1] = c descendants(c, out) end
	return out
end
F.GetDescendants = function(o) return descendants(o) end
F.FindFirstChildOfClass = function(o, c)
	for _, x in ipairs(o:GetChildren()) do if x.ClassName == c then return x end end
	return M.layoutObject(o, c)
end
F.FindFirstChildWhichIsA = function(o, c, deep)
	for _, x in ipairs(deep and descendants(o) or o:GetChildren()) do if x:IsA(c) then return x end end
	return M.layoutObject(o, c)
end
F.FindFirstDescendant = function(o, n) for _, x in ipairs(descendants(o)) do if x.Name == n then return x end end return nil end
F.FindFirstAncestor = function(o, n) local p = o.Parent while p do if p.Name == n then return p end p = p.Parent end return nil end
F.FindFirstAncestorOfClass = function(o, c) local p = o.Parent while p do if p.ClassName == c then return p end p = p.Parent end return nil end
F.FindFirstAncestorWhichIsA = function(o, c) local p = o.Parent while p do if p:IsA(c) then return p end p = p.Parent end return nil end
F.GetPropertyChangedSignal = function(o, prop)
	local s = {}
	function s:Connect(f)
		if prop == "Value" and isA(o, "ValueBase") then return o.Changed:connect(function() f() end) end
		if prop == "AbsoluteContentSize" and getmetatable(o) then return { Disconnect = function() end } end
		return o.Changed:connect(function(p) if p == prop then f() end end)
	end
	s.connect = s.Connect
	function s:Once(f) local c c = s:Connect(function() c:disconnect() f() end) return c end
	function s:Wait()
		if prop == "Value" and isA(o, "ValueBase") then o.Changed:wait() return end
		repeat local p = o.Changed:wait() until p == prop
	end
	s.wait = s.Wait
	return setmetatable(s, { __type = "RBXScriptSignal" })
end
F.GetAttribute = function(o, k) return attrsOf(o)[k] end
F.SetAttribute = function(o, k, v)
	local a = attrsOf(o)
	if a[k] == v then return end
	a[k] = v
	if attrSignals[o] and attrSignals[o][k] then attrSignals[o][k]:Fire() end
	if attrChanged[o] then attrChanged[o]:Fire(k) end
end
F.GetAttributes = function(o) local r = {} for k, v in pairs(attrsOf(o)) do r[k] = v end return r end
F.GetAttributeChangedSignal = function(o, k) return attrSignal(o, k) end
local function isCS(o) return type(o) == "userdata" and try(o, "ClassName") == "CollectionService" end
F.AddTag = function(o, a, b) if isCS(o) then addTag(a, b) else addTag(o, a) end end
F.RemoveTag = function(o, a, b) if isCS(o) then removeTag(a, b) else removeTag(o, a) end end
F.HasTag = function(o, a, b) if isCS(o) then return hasTag(a, b) end return hasTag(o, a) end
F.GetTags = function(o, a) if isCS(o) then return tagsOf(a) end return tagsOf(o) end
F.GetTagged = function(o, tag) return getTagged(tag) end
F.GetAllTags = function()
	local r, seen = {}, {}
	for t in pairs(D().tags or {}) do if not seen[t] then seen[t] = true r[#r + 1] = t end end
	for t in pairs(tagSets) do if not seen[t] then seen[t] = true r[#r + 1] = t end end
	return r
end
F.GetInstanceAddedSignal = function(o, tag)
	if not tagAdded[tag] then tagAdded[tag] = M.signal() end
	watchTag(tag)
	return tagAdded[tag]
end
F.GetInstanceRemovedSignal = function(o, tag)
	if not tagRemoved[tag] then tagRemoved[tag] = M.signal() end
	return tagRemoved[tag]
end
F.GetPivot = function(o)
	if o:IsA("BasePart") then return o.CFrame end
	if o:IsA("Model") then
		if o.PrimaryPart then return o.PrimaryPart.CFrame end
		local ok, cf = pcall(function() return o:GetModelCFrame() end)
		if ok then return cf end
	end
	for _, c in ipairs(descendants(o)) do if c:IsA("BasePart") then return c.CFrame end end
	return CFrame.new()
end
F.PivotTo = function(o, cf)
	if o:IsA("BasePart") then o.CFrame = cf return end
	if o:IsA("Model") and o.PrimaryPart then o:SetPrimaryPartCFrame(cf) return end
	local base = F.GetPivot(o)
	local rel = cf * base:inverse()
	for _, c in ipairs(descendants(o)) do if c:IsA("BasePart") then c.CFrame = rel * c.CFrame end end
end
F.GetBoundingBox = function(o)
	local ok, cf = pcall(function() return o:GetModelCFrame() end)
	local ok2, size = pcall(function() return o:GetExtentsSize() end)
	if not ok2 then ok2, size = pcall(function() return o:GetModelSize() end) end
	return ok and cf or F.GetPivot(o), ok2 and size or Vector3.new(1, 1, 1)
end
F.GetExtentsSize = function(o) local _, s = F.GetBoundingBox(o) return s end
F.ScaleTo = function() end
F.GetScale = function() return 1 end
F.ApplyImpulse = function(o, v) local m = o:GetMass() if m > 0 then o.Velocity = o.Velocity + v / m end end
F.ApplyImpulseAtPosition = F.ApplyImpulse
F.ApplyAngularImpulse = function(o, v) local m = o:GetMass() if m > 0 then o.RotVelocity = o.RotVelocity + v / m end end
F.GetVelocityAtPosition = function(o) return o.Velocity end
F.GetNetworkOwner = function() return nil end
F.SetNetworkOwner = function() end
F.SetNetworkOwnershipAuto = function() end
F.CanSetNetworkOwnership = function() return true end
F.GetRootPart = function(o) return o end
F.GetConnectedParts = function(o) return { o } end
F.GetMouseLocation = function()
	local p = Players.LocalPlayer
	local m = p and p:GetMouse()
	if not m then return Vector2.new(0, 0) end
	return Vector2.new(m.X, m.Y + 36)
end
F.GetMouseDelta = function() return Vector2.new(0, 0) end
F.GetFocusedTextBox = function() return nil end
F.GetKeysPressed = function() return {} end
F.GetLastInputType = function() return Enum.UserInputType.Keyboard end
F.IsServer = function() return true end
F.IsClient = function() return true end
F.IsStudio = function() return false end
F.IsRunning = function() return true end
F.IsRunMode = function() return false end
F.IsEdit = function() return false end
F.IsLoaded = function() return true end
F.GetServerTimeNow = function()
	local wb = game:GetService("ReplicatedStorage"):FindFirstChild("WebBlox")
	local off = wb and wb:FindFirstChild("ClockOffset")
	return tick() + (off and off.Value or 0)
end
F.GetPlayerByUserId = function(o, id) for _, p in ipairs(o:GetPlayers()) do if p.UserId == id then return p end end return nil end
F.GetActor = function() return nil end
F.GetAccessories = function(h)
	local r = {}
	if h.Parent then for _, c in ipairs(h.Parent:GetChildren()) do if c:IsA("Accoutrement") or c.ClassName == "Hat" or c.ClassName == "Accessory" then r[#r + 1] = c end end end
	return r
end
F.AddAccessory = function(h, a) if h.Parent then a.Parent = h.Parent end end
F.RemoveAccessories = function(h) for _, a in ipairs(F.GetAccessories(h)) do a:Destroy() end end
F.ApplyDescription = function() end
F.ApplyDescriptionReset = function() end
F.GetAppliedDescription = function() return dummy("HumanoidDescription") end
F.GetLimb = function() return M.enum("Limb", "Unknown") end
F.LoadAnimation = function(o, a)
	if o.Parent then return o.Parent:LoadAnimation(a) end
	error("LoadAnimation needs a Humanoid", 2)
end
F.Once = function(sig, f) local c c = sig:connect(function(...) c:disconnect() f(...) end) return c end
F.ConnectParallel = function(sig, f) return sig:connect(f) end
F.split = function(s, sep) return split(s, sep) end
F.GetPartBoundsInBox = function(ws, cf, size, params)
	local h = size / 2
	local p = cf.p
	local r = Region3.new(p - Vector3.new(math.abs(h.X), math.abs(h.Y), math.abs(h.Z)) * 1.42, p + Vector3.new(math.abs(h.X), math.abs(h.Y), math.abs(h.Z)) * 1.42)
	local ignore = params and params.FilterDescendantsInstances or {}
	local mode = params and enumName(params.FilterType) or "Exclude"
	if mode == "Include" or mode == "Whitelist" then
		local ok, parts = pcall(function() return ws:FindPartsInRegion3WithWhiteList(r, ignore, (params and params.MaxParts ~= 0 and params.MaxParts) or 100) end)
		if ok then return parts end
		return {}
	end
	return ws:FindPartsInRegion3WithIgnoreList(r, ignore, (params and params.MaxParts ~= 0 and params.MaxParts) or 100)
end
F.GetPartBoundsInRadius = function(ws, pos, radius, params)
	local out = {}
	for _, part in ipairs(F.GetPartBoundsInBox(ws, CFrame.new(pos), Vector3.new(2, 2, 2) * radius / 1.42, params)) do
		if (part.Position - pos).magnitude <= radius + part.Size.magnitude / 2 then out[#out + 1] = part end
	end
	return out
end
F.GetPartsInPart = function(ws, part, params)
	local out = {}
	for _, p in ipairs(F.GetPartBoundsInBox(ws, part.CFrame, part.Size, params)) do if p ~= part then out[#out + 1] = p end end
	return out
end
F.Raycast = function(ws, origin, dir, params)
	local list = params and params.FilterDescendantsInstances or {}
	local mode = params and enumName(params.FilterType) or "Exclude"
	local ray = Ray.new(origin, dir)
	local hit, pos, normal, mat
	if mode == "Include" or mode == "Whitelist" then
		local ok
		ok, hit, pos, normal, mat = pcall(function() return ws:FindPartOnRayWithWhitelist(ray, list, params and params.IgnoreWater) end)
		if not ok then hit = nil end
	else
		hit, pos, normal, mat = ws:FindPartOnRayWithIgnoreList(ray, list, false, params and params.IgnoreWater)
	end
	if not hit then return nil end
	return setmetatable({ Instance = hit, Position = pos, Normal = normal or Vector3.new(0, 1, 0), Material = mat or hit.Material, Distance = (pos - origin).magnitude }, { __type = "RaycastResult" })
end
F.Spherecast = function(ws, origin, radius, dir, params) return F.Raycast(ws, origin, dir, params) end
F.Blockcast = function(ws, cf, size, dir, params) return F.Raycast(ws, cf.p, dir, params) end
F.Shapecast = function(ws, part, dir, params) return F.Raycast(ws, part.Position, dir, params) end
F.GetTextBoundsAsync = function(ts, p) return ts:GetTextSize(p.Text, p.Size, Enum.Font.SourceSans, Vector2.new(p.Width or 1e5, 1e5)) end
F.GetUserIdFromNameAsync = function() return 0 end
F.GetNameFromUserIdAsync = function() return "Player" end
F.GetUserThumbnailAsync = function() return "", true end
F.GetFriendsAsync = function() return { GetCurrentPage = function() return {} end, IsFinished = true, AdvanceToNextPageAsync = function() end } end
F.GetPolicyInfoForPlayerAsync = function() return { AreAdsAllowed = false, ArePaidRandomItemsRestricted = false, AllowedExternalLinkReferences = {}, IsSubjectToChinaPolicies = false } end
F.SetCore = function() end
F.GetCore = function() return nil end
F.PromptPurchase = function() end
F.PromptProductPurchase = function() end
F.PromptGamePassPurchase = function() end
F.UserOwnsGamePassAsync = function() return false end
F.PlayerOwnsAsset = function() return false end

function M.call(o, m, ...)   -- o:Method(...) for methods newer than 2016: the engine's own if it has it
	if type(o) == "table" then
		local f = o[m]
		if f then return f(o, ...) end
	else
		local f = try(o, m)
		if type(f) == "function" then return f(o, ...) end
	end
	local fb = F[m]
	if fb then return fb(o, ...) end
	error(tostring(m) .. " is not a valid member of " .. tostring(o), 2)
end
function M.safe(o, m, ...)   -- calls that may fail on things 2016 doesn't know (SetCore, SetCoreGuiEnabled)
	local r = { pcall(function(...) return o[m](o, ...) end, ...) }
	if r[1] then return unpack(r, 2) end
	return nil
end

-- ------------------------------------------------------------------ TweenService (2017)
local EASE = {
	Linear = function(t) return t end,
	Sine = function(t) return 1 - math.cos(t * math.pi / 2) end,
	Quad = function(t) return t * t end,
	Cubic = function(t) return t * t * t end,
	Quart = function(t) return t ^ 4 end,
	Quint = function(t) return t ^ 5 end,
	Exponential = function(t) if t == 0 then return 0 end return 2 ^ (10 * t - 10) end,
	Circular = function(t) return 1 - math.sqrt(math.max(0, 1 - t * t)) end,
	Back = function(t) return 2.70158 * t ^ 3 - 1.70158 * t * t end,
	Bounce = function(t)
		t = 1 - t
		local r
		if t < 1 / 2.75 then r = 7.5625 * t * t
		elseif t < 2 / 2.75 then t = t - 1.5 / 2.75 r = 7.5625 * t * t + 0.75
		elseif t < 2.5 / 2.75 then t = t - 2.25 / 2.75 r = 7.5625 * t * t + 0.9375
		else t = t - 2.625 / 2.75 r = 7.5625 * t * t + 0.984375 end
		return 1 - r
	end,
	Elastic = function(t)
		if t == 0 or t == 1 then return t end
		return -(2 ^ (10 * t - 10)) * math.sin((t * 10 - 10.75) * 2 * math.pi / 3)
	end,
}
EASE.Constant = function(t) return t < 1 and 0 or 1 end
local function ease(style, dir, t)
	local f = EASE[enumName(style) or "Quad"] or EASE.Quad
	local d = enumName(dir) or "Out"
	if d == "In" then return f(t) end
	if d == "Out" then return 1 - f(1 - t) end
	if t < 0.5 then return f(t * 2) / 2 end
	return 1 - f((1 - t) * 2) / 2
end
M.ease = ease
local function lerp(a, b, t)
	local ty = type(a)
	if ty == "number" then return a + (b - a) * t end
	if ty == "boolean" then if t >= 1 then return b end return a end
	local ok, r = pcall(function() return a:lerp(b, t) end)
	if ok then return r end
	ok, r = pcall(LF.Lerp, a, b, t)
	if ok then return r end
	if t >= 1 then return b end
	return a
end
local TweenInfo = {}
function TweenInfo.new(time, style, dir, reps, rev, delayTime)
	return setmetatable({ Time = time or 1, EasingStyle = style or Enum.EasingStyle.Quad, EasingDirection = dir or Enum.EasingDirection.Out,
		RepeatCount = reps or 0, Reverses = rev or false, DelayTime = delayTime or 0 }, { __type = "TweenInfo" })
end
M.TweenInfo = TweenInfo
local Tween = {}
Tween.__index = Tween
Tween.__type = "Tween"
local playing = weak()   -- object -> { property -> tween }, so a new tween takes over a property
local heartbeat
local active = {}
local function step()
	local now = tick()
	for tw in pairs(active) do tw:_step(now) end
end
function Tween:_step(now)
	local info = self.TweenInfo
	local el = now - self._t0 - (info.DelayTime or 0)
	if el < 0 then return end
	local dur = math.max(info.Time or 1, 1e-3)
	local cycle = dur * (info.Reverses and 2 or 1)
	local k = math.floor(el / cycle)
	local reps = info.RepeatCount or 0
	local finished = reps >= 0 and k > reps
	local ph
	if finished then ph = info.Reverses and 0 or 1 else ph = (el - k * cycle) / dur if ph > 1 then ph = 2 - ph end end
	ph = math.min(1, math.max(0, ph))
	local a = ease(info.EasingStyle, info.EasingDirection, ph)
	local o = self.Instance
	local mine = playing[o] or {}
	for p, goal in pairs(self._goal) do
		if mine[p] == self then
			local v = lerp(self._from[p], goal, a)
			if type(o) == "userdata" then pcall(M.set, o, p, v) else o[p] = v end
		end
	end
	if finished then
		active[self] = nil
		self.PlaybackState = M.enum("PlaybackState", "Completed")
		self._done:Fire(self.PlaybackState)
	end
end
function Tween:Play()
	if self.PlaybackState == M.enum("PlaybackState", "Paused") and self._pausedAt then
		self._t0 = self._t0 + (tick() - self._pausedAt)
		self._pausedAt = nil
	else
		self._from = {}
		local mine = playing[self.Instance] or {}
		playing[self.Instance] = mine
		for p in pairs(self._goal) do
			local o = self.Instance
			self._from[p] = type(o) == "userdata" and M.get(o, p) or o[p]
			mine[p] = self
		end
		self._t0 = tick()
	end
	self.PlaybackState = M.enum("PlaybackState", "Playing")
	active[self] = true
	if not heartbeat then heartbeat = RunService.Heartbeat:connect(step) end
end
function Tween:Pause()
	if active[self] then active[self] = nil self._pausedAt = tick() self.PlaybackState = M.enum("PlaybackState", "Paused") end
end
function Tween:Cancel()
	active[self] = nil
	self.PlaybackState = M.enum("PlaybackState", "Cancelled")
	self._done:Fire(self.PlaybackState)
end
function Tween:Destroy() active[self] = nil end
Tween.play, Tween.pause, Tween.cancel = Tween.Play, Tween.Pause, Tween.Cancel
local TweenService = {}
function TweenService:Create(o, info, goal)
	info = info or TweenInfo.new()
	local done = M.signal()
	return setmetatable({ Instance = o, TweenInfo = info, _goal = goal or {}, _done = done, Completed = done,
		PlaybackState = M.enum("PlaybackState", "Begin") }, Tween)
end
TweenService.create = TweenService.Create
function TweenService:GetValue(alpha, style, dir) return ease(style, dir, alpha) end
function TweenService:SmoothDamp(cur, target, vel, smooth, maxSpeed, dt) return target, vel end
M.TweenService = setmetatable(TweenService, { __index = function(_, k)
	local native = game:GetService("TweenService")
	local v = native[k]
	if type(v) == "function" then return function(_, ...) return v(native, ...) end end
	return v
end })

-- ------------------------------------------------------------------ services and Instance.new
local SERVICE_STAND_INS = { TweenService = M.TweenService }
function M.service(o, name)
	if SERVICE_STAND_INS[name] then return SERVICE_STAND_INS[name] end
	local ok, s = pcall(function() return o:GetService(name) end)
	if ok and s then return s end
	local d = dummy(name)
	SERVICE_STAND_INS[name] = d
	return d
end

-- UIListLayout and UIGridLayout (2016 has neither): place the children in Lua. A layout object is a
-- table that looks like an Instance; its fields live in __p.
local layouts = weak()   -- container -> layout object
local Layout = {}
local function udim(u, def) if u == nil then return def or UDim.new(0, 0) end if type(u) == "table" then return UDim.new(u[1] or 0, u[2] or 0) end return u end
local function udim2(u, def) if u == nil then return def end if type(u) == "table" then return UDim2.new(u[1] or 0, u[2] or 0, u[3] or 0, u[4] or 0) end return u end
local function doLayout(c)
	local L = layouts[c]
	if not L then return end
	local P = rawget(L, "__p")
	P._pending = false
	local kids = {}
	for _, k in ipairs(c:GetChildren()) do
		if isA(k, "GuiObject") and k.Visible then kids[#kids + 1] = k end
	end
	local byName = enumName(P.SortOrder) == "Name"
	table.sort(kids, function(a, b)
		if not byName then
			local la, lb = M.get(a, "LayoutOrder") or 0, M.get(b, "LayoutOrder") or 0
			if la ~= lb then return la < lb end
		end
		return a.Name < b.Name
	end)
	local pad = P.__padding or {}
	local pl, pt, pr, pb = udim(pad[1]), udim(pad[2]), udim(pad[3]), udim(pad[4])
	local abs = c.AbsoluteSize
	local horiz = enumName(P.FillDirection) == "Horizontal"
	local ha, va = enumName(P.HorizontalAlignment) or "Left", enumName(P.VerticalAlignment) or "Top"
	if P.ClassName == "UIGridLayout" then
		local cs = udim2(P.CellSize, UDim2.new(0, 100, 0, 100))
		local cp = udim2(P.CellPadding, UDim2.new(0, 5, 0, 5))
		local W = abs.X - (pl.Scale + pr.Scale) * abs.X - pl.Offset - pr.Offset
		local H = abs.Y - (pt.Scale + pb.Scale) * abs.Y - pt.Offset - pb.Offset
		local cw, ch = cs.X.Scale * abs.X + cs.X.Offset, cs.Y.Scale * abs.Y + cs.Y.Offset
		local px, py = cp.X.Scale * abs.X + cp.X.Offset, cp.Y.Scale * abs.Y + cp.Y.Offset
		local per = horiz and math.max(1, math.floor((W + px) / math.max(1, cw + px))) or math.max(1, math.floor((H + py) / math.max(1, ch + py)))
		if (P.FillDirectionMaxCells or 0) > 0 then per = math.min(per, P.FillDirectionMaxCells) end
		local n = #kids
		local cols = horiz and math.min(per, math.max(1, n)) or math.max(1, math.ceil(n / per))
		local rows = horiz and math.max(1, math.ceil(n / per)) or math.min(per, math.max(1, n))
		local usedW, usedH = cols * cw + (cols - 1) * px, rows * ch + (rows - 1) * py
		local ox = ha == "Center" and (W - usedW) / 2 or ha == "Right" and W - usedW or 0
		local oy = va == "Center" and (H - usedH) / 2 or va == "Bottom" and H - usedH or 0
		for i, k in ipairs(kids) do
			local a, b = (i - 1) % per, math.floor((i - 1) / per)
			local col, row = horiz and a or b, horiz and b or a
			anchors[k] = false
			k.Size = UDim2.new(0, cw, 0, ch)
			k.Position = UDim2.new(pl.Scale, pl.Offset + ox + col * (cw + px), pt.Scale, pt.Offset + oy + row * (ch + py))
		end
		P.AbsoluteContentSize = Vector2.new(usedW, usedH)
		P.AbsoluteCellSize = Vector2.new(cw, ch)
		P.AbsoluteCellCount = Vector2.new(cols, rows)
	else
		local padding = udim(P.Padding)
		local mainS, mainO = 0, 0   -- running position along the fill direction (scale, offset)
		local positions = {}
		for i, k in ipairs(kids) do
			local sz = horiz and k.Size.X or k.Size.Y
			positions[i] = { mainS, mainO }
			mainS = mainS + sz.Scale + (i < #kids and padding.Scale or 0)
			mainO = mainO + sz.Offset + (i < #kids and padding.Offset or 0)
		end
		local mainAbs = mainS * (horiz and abs.X or abs.Y) + mainO
		local align = horiz and ha or va
		local padA, padB = horiz and pl or pt, horiz and pr or pb
		local startS, startO
		if align == "Center" then startS, startO = 0.5 - mainS / 2 + (padA.Scale - padB.Scale) / 2, -mainO / 2 + (padA.Offset - padB.Offset) / 2
		elseif align == "Right" or align == "Bottom" then startS, startO = 1 - mainS - padB.Scale, -mainO - padB.Offset
		else startS, startO = padA.Scale, padA.Offset end
		local crossAlign = horiz and va or ha
		local cpA, cpB = horiz and pt or pl, horiz and pb or pr
		local crossMax = 0
		for i, k in ipairs(kids) do
			local sz = k.Size
			local cross = horiz and sz.Y or sz.X
			local cS, cO
			if crossAlign == "Center" then cS, cO = 0.5 - cross.Scale / 2 + (cpA.Scale - cpB.Scale) / 2, -cross.Offset / 2 + (cpA.Offset - cpB.Offset) / 2
			elseif crossAlign == "Right" or crossAlign == "Bottom" then cS, cO = 1 - cross.Scale - cpB.Scale, -cross.Offset - cpB.Offset
			else cS, cO = cpA.Scale, cpA.Offset end
			local mS, mO = startS + positions[i][1], startO + positions[i][2]
			anchors[k] = false
			if horiz then k.Position = UDim2.new(mS, mO, cS, cO) else k.Position = UDim2.new(cS, cO, mS, mO) end
			local a = horiz and k.AbsoluteSize.Y or k.AbsoluteSize.X
			if a > crossMax then crossMax = a end
		end
		P.AbsoluteContentSize = horiz and Vector2.new(mainAbs, crossMax) or Vector2.new(crossMax, mainAbs)
	end
	-- ScrollingFrames that size their canvas to fit
	local auto = enumName(propsOf(c).AutomaticCanvasSize)
	if auto and auto ~= "None" and isA(c, "ScrollingFrame") then
		local cs = P.AbsoluteContentSize
		local x = (auto == "X" or auto == "XY") and cs.X + pl.Offset + pr.Offset or 0
		local y = (auto == "Y" or auto == "XY") and cs.Y + pt.Offset + pb.Offset or 0
		pcall(function() c.CanvasSize = UDim2.new(0, x, 0, y) end)
	end
	if P._changed then P._changed:Fire("AbsoluteContentSize") end
end
local function schedule(c)
	local L = layouts[c]
	if not L then return end
	local P = rawget(L, "__p")
	if P._pending then return end
	P._pending = true
	spawn(function() local ok, e = pcall(doLayout, c) if not ok then warn("GN-BLOX layout: " .. tostring(e)) end end)
end
relayout = schedule
local function detach(L)
	local P = rawget(L, "__p")
	local c = P.Parent
	for _, x in ipairs(P._conns or {}) do x:disconnect() end
	for _, x in pairs(P._kidConns or {}) do x:disconnect() end
	P._conns, P._kidConns = {}, {}
	if c and layouts[c] == L then layouts[c] = nil end
	P.Parent = nil
end
local function attach(c, L)
	local P = rawget(L, "__p")
	if layouts[c] and layouts[c] ~= L then detach(layouts[c]) end
	layouts[c] = L
	P.Parent = c
	P._conns = {}
	local conns = {}
	local function watchKid(k)
		if isA(k, "GuiObject") then
			conns[k] = k.Changed:connect(function(q) if q == "Size" or q == "Visible" or q == "Name" then schedule(c) end end)
		end
	end
	for _, k in ipairs(c:GetChildren()) do watchKid(k) end
	table.insert(P._conns, c.ChildAdded:connect(function(k) watchKid(k) schedule(c) end))
	table.insert(P._conns, c.ChildRemoved:connect(function(k) if conns[k] then conns[k]:disconnect() conns[k] = nil end schedule(c) end))
	table.insert(P._conns, c.Changed:connect(function(q) if q == "AbsoluteSize" then schedule(c) end end))
	P._kidConns = conns
	schedule(c)
end
local LayoutMT = {
	__index = function(t, k)
		local v = rawget(t, "__p")[k]
		if v ~= nil then return v end
		return Layout[k]
	end,
	__newindex = function(t, k, v)
		local P = rawget(t, "__p")
		if k == "Parent" then
			if P.Parent then detach(t) end
			if v then attach(v, t) end
			return
		end
		P[k] = v
		if P.Parent then schedule(P.Parent) end
	end,
	__tostring = function(t) return rawget(t, "__p").Name end,
	__type = "Instance",
}
function Layout:IsA(c) return c == self.ClassName or c == "UIGridStyleLayout" or c == "UIComponent" or c == "UIBase" or c == "Instance" end
function Layout:Destroy() self.Parent = nil end
Layout.Remove = Layout.Destroy
function Layout:Clone()
	local n = M.newLayout(self.ClassName)
	for k, v in pairs(rawget(self, "__p")) do if k ~= "Parent" and k:sub(1, 1) ~= "_" then rawget(n, "__p")[k] = v end end
	return n
end
function Layout:ApplyLayout() if self.Parent then doLayout(self.Parent) end end
function Layout:GetChildren() return {} end
function Layout:FindFirstChild() return nil end
function Layout:GetFullName() return (self.Parent and self.Parent:GetFullName() .. "." or "") .. self.Name end
function Layout:GetPropertyChangedSignal(p)
	local P = rawget(self, "__p")
	if not P._changed then P._changed = M.signal() end
	local sig = {}
	function sig:Connect(f) return P._changed:Connect(function(q) if q == p then f() end end) end
	sig.connect = sig.Connect
	return sig
end
function M.newLayout(cls, cfg)
	local P = { ClassName = cls, Name = cls, Archivable = true, AbsoluteContentSize = Vector2.new(0, 0), _conns = {} }
	if cfg then for k, v in pairs(cfg) do P[k] = v end end
	return setmetatable({ __p = P }, LayoutMT)
end
function M.layoutObject(c, cls)   -- the layout object a container has (for FindFirstChildOfClass and friends)
	local L = layouts[c]
	if L and (cls == nil or L:IsA(cls)) then return L end
	return nil
end

local GUI_DECOR = { UICorner = true, UIStroke = true, UIGradient = true, UIAspectRatioConstraint = true, UIScale = true,
	UISizeConstraint = true, UITextSizeConstraint = true, UIPadding = true, UIFlexItem = true, UIPageLayout = true, UITableLayout = true }
function M.child(o, name, how)   -- o.UIListLayout, o:FindFirstChild("UIStroke") ... for objects 2016 doesn't have
	local ok, c = pcall(function() return o:FindFirstChild(name) end)
	if ok and c then return c end
	local L = layouts[o]
	if L and L.Name == name then return L end
	if name == "UIListLayout" or name == "UIGridLayout" then
		if L then return L end
		if how == "find" then return nil end
	end
	if GUI_DECOR[name] or name == "UIListLayout" or name == "UIGridLayout" then return dummy(name) end
	if how == "find" then return nil end
	return o[name]
end

-- WeldConstraint (2017): a weld holding the two parts where they are when both are set
local WeldC = {}
local function weldUpdate(w)
	local p = rawget(w, "__p")
	if p._weld then pcall(function() p._weld:Destroy() end) p._weld = nil end
	if p.Enabled == false or not p.Part0 or not p.Part1 then return end
	local weld = Instance.new("ManualWeld")
	weld.Name = p.Name or "WeldConstraint"
	weld.Part0 = p.Part0
	weld.Part1 = p.Part1
	weld.C0 = p.Part0.CFrame:inverse() * p.Part1.CFrame
	weld.Parent = p.Parent or p.Part0
	p._weld = weld
end
local WeldMT = {
	__index = function(t, k)
		local p = rawget(t, "__p")
		if k == "Active" then return p._weld ~= nil end
		if p[k] ~= nil then return p[k] end
		return WeldC[k]
	end,
	__newindex = function(t, k, v)
		local p = rawget(t, "__p")
		p[k] = v
		if k == "Part0" or k == "Part1" or k == "Enabled" or k == "Parent" then weldUpdate(t) end
	end,
	__type = "Instance",
}
function WeldC:IsA(c) return c == "WeldConstraint" or c == "Instance" end
function WeldC:Destroy() local p = rawget(self, "__p") if p._weld then pcall(function() p._weld:Destroy() end) end p._weld = nil p.Parent = nil end
WeldC.Remove = WeldC.Destroy
function WeldC:Clone() local n = M.new("WeldConstraint") n.Part0, n.Part1 = self.Part0, self.Part1 return n end

local CLASS_ALIAS = { Actor = "Model", WorldModel = "Model", RigidConstraint = "WeldConstraint" }
function M.new(cls, parent)
	cls = CLASS_ALIAS[cls] or cls
	if cls == "WeldConstraint" then
		local w = setmetatable({ __p = { ClassName = "WeldConstraint", Name = "WeldConstraint", Enabled = true } }, WeldMT)
		if parent then w.Parent = parent end
		return w
	end
	if cls == "UIListLayout" or cls == "UIGridLayout" then
		local L = M.newLayout(cls)
		if parent then L.Parent = parent end
		return L
	end
	local ok, o = pcall(Instance.new, cls)
	if ok and o then
		if parent then o.Parent = parent end
		return o
	end
	local d = dummy(cls)
	if parent then rawset(d, "Parent", parent) end
	return d
end

function M.iter(t, ...)   -- for k, v in t do (generalized iteration)
	if type(t) == "table" then
		local mt = getmetatable(t)
		if not (type(mt) == "table" and rawget(mt, "__call")) then
			if type(mt) == "table" and rawget(mt, "__iter") then return mt.__iter(t) end
			return next, t
		end
	end
	return t, ...
end

-- ------------------------------------------------------------------ the place file's GUI extras (started by GNCompatClient)
local function applyGui(root)
	local function visit(o)
		if not isA(o, "GuiBase2d") and not isA(o, "GuiObject") and not isA(o, "LayerCollector") then return end
		local d = D()
		local L = lookup(d.layouts, o)
		if L and not layouts[o] then
			local cfg = {}
			for k, v in pairs(L) do cfg[k] = v end
			local cls = cfg.ClassName or "UIListLayout"
			cfg.ClassName = nil
			if cfg.SortOrder then cfg.SortOrder = M.enum("SortOrder", cfg.SortOrder) end
			if cfg.FillDirection then cfg.FillDirection = M.enum("FillDirection", cfg.FillDirection) end
			if cfg.HorizontalAlignment then cfg.HorizontalAlignment = M.enum("HorizontalAlignment", cfg.HorizontalAlignment) end
			if cfg.VerticalAlignment then cfg.VerticalAlignment = M.enum("VerticalAlignment", cfg.VerticalAlignment) end
			if cfg.Padding then cfg.Padding = udim(cfg.Padding) end
			if cfg.CellSize then cfg.CellSize = udim2(cfg.CellSize) end
			if cfg.CellPadding then cfg.CellPadding = udim2(cfg.CellPadding) end
			local obj = M.newLayout(cls, cfg)
			obj.Parent = o
		end
		local st = lookup(d.props, o)
		if st and st.Enabled == false and (isA(o, "ScreenGui") or isA(o, "BillboardGui")) then
			local s = propsOf(o)
			if not s.__applied then s.__applied = true s.Enabled = false setHidden(o, true, s) end
		end
	end
	visit(root)
	for _, o in ipairs(descendants(root)) do visit(o) end
end
function M.client()
	local p = Players.LocalPlayer
	if not p then return end
	local d = D()
	if not d.layouts and not d.props then return end
	local pg = p:WaitForChild("PlayerGui")
	for _, g in ipairs(pg:GetChildren()) do pcall(applyGui, g) end
	pg.ChildAdded:connect(function(g) wait() pcall(applyGui, g) end)
	pg.DescendantAdded:connect(function(o)
		if lookup(d.layouts, o) then pcall(applyGui, o) end
	end)
end

return M
