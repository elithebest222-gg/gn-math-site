-- NPCs for GN-BLOX games (build_games.py puts this above a game's script, below common.lua):
-- classic blocky characters that walk to the nearest player and hit them, like zombies or bots.
-- Catalog combat gear (swords, rockets...) hurts them like anything else with a Humanoid.
--   local m = NPC.spawn{
--     name = "Zombie", pos = Vector3, health = 100, speed = 10, damage = 10, range = 120,
--     colors = { head, torso, arms, legs } (BrickColor numbers), arms = "forward" (zombie arms),
--     sword = true (holds a sword), hit = function(npc, char, hum) end (instead of damage),
--     patrol = { Vector3, ... } (walks between these when nobody's near), died = function(npc, killer) end }
--   NPC.count()   how many are alive;   NPC.clear()   removes them all
local NPC = {}
do
	local Players = game:GetService("Players")
	local Debris = game:GetService("Debris")
	local live = {}
	local function part(name, size, color, parent)
		local p = Instance.new("Part")
		pcall(function() p.FormFactor = Enum.FormFactor.Custom end)
		p.Name = name
		p.Size = size
		p.BrickColor = BrickColor.new(color)
		p.TopSurface, p.BottomSurface = Enum.SurfaceType.Smooth, Enum.SurfaceType.Smooth
		p.Parent = parent
		return p
	end
	local function motor(name, p0, p1, c0, c1)
		local m = Instance.new("Motor6D")
		m.Name = name
		m.Part0, m.Part1, m.C0, m.C1 = p0, p1, c0, c1
		m.MaxVelocity = 0.15
		m.Parent = p0
		return m
	end
	function NPC.spawn(o)
		local c = o.colors or { 24, 23, 24, 119 }
		local m = Instance.new("Model")
		m.Name = o.name or "Bot"
		local root = part("HumanoidRootPart", Vector3.new(2, 2, 1), c[2], m)
		root.Transparency = 1
		local torso = part("Torso", Vector3.new(2, 2, 1), c[2], m)
		local head = part("Head", Vector3.new(2, 1, 1), c[1], m)
		local mesh = Instance.new("SpecialMesh", head)
		mesh.MeshType = Enum.MeshType.Head
		mesh.Scale = Vector3.new(1.25, 1.25, 1.25)
		local face = Instance.new("Decal", head)
		face.Name = "face"
		face.Texture = o.face or "rbxasset://textures/face.png"
		local ra = part("Right Arm", Vector3.new(1, 2, 1), c[3], m)
		local la = part("Left Arm", Vector3.new(1, 2, 1), c[3], m)
		local rl = part("Right Leg", Vector3.new(1, 2, 1), c[4], m)
		local ll = part("Left Leg", Vector3.new(1, 2, 1), c[4], m)
		local R = CFrame.new(0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0)
		motor("RootJoint", root, torso, R, R)
		motor("Neck", torso, head, CFrame.new(0, 1, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0), CFrame.new(0, -0.5, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0))
		local rs = motor("Right Shoulder", torso, ra, CFrame.new(1, 0.5, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0), CFrame.new(-0.5, 0.5, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0))
		local ls = motor("Left Shoulder", torso, la, CFrame.new(-1, 0.5, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0), CFrame.new(0.5, 0.5, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0))
		local rh = motor("Right Hip", torso, rl, CFrame.new(1, -1, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0), CFrame.new(0.5, 1, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0))
		local lh = motor("Left Hip", torso, ll, CFrame.new(-1, -1, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0), CFrame.new(-0.5, 1, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0))
		if o.arms == "forward" then
			rs.DesiredAngle, rs.CurrentAngle = 1.57, 1.57
			ls.DesiredAngle, ls.CurrentAngle = -1.57, -1.57
		end
		if o.sword then
			local blade = part("Sword", Vector3.new(0.3, 0.3, 4), 1002, m)
			blade.CanCollide = false
			local w = Instance.new("Weld")
			w.Part0, w.Part1 = ra, blade
			w.C0 = CFrame.new(0, -1, -1.6)
			w.Parent = blade
		end
		local hum = Instance.new("Humanoid")
		hum.MaxHealth = o.health or 100
		hum.Health = hum.MaxHealth
		hum.WalkSpeed = o.speed or 10
		hum.Parent = m
		m.PrimaryPart = root
		m:SetPrimaryPartCFrame(CFrame.new(o.pos or Vector3.new(0, 5, 0)))
		m.Parent = o.parent or workspace
		local me = { model = m, hum = hum, root = root, o = o, legs = { rh, lh }, arms = { rs, ls }, last = 0, t = 0, stuck = 0, p = 1 }
		live[m] = me
		hum.Died:connect(function()
			live[m] = nil
			local tag = hum:FindFirstChild("creator")
			local killer = tag and tag.Value
			if o.died then pcall(o.died, m, killer) end
			Debris:AddItem(m, 3)
		end)
		return m
	end
	function NPC.count()
		local n = 0
		for _ in pairs(live) do n = n + 1 end
		return n
	end
	function NPC.clear()
		for m in pairs(live) do m:Destroy() end
		live = {}
	end
	local function nearest(pos, range)
		local best, bestD, bestHum
		for _, plr in pairs(Players:GetPlayers()) do
			local char = plr.Character
			local r = char and char:FindFirstChild("HumanoidRootPart")
			local h = char and char:FindFirstChild("Humanoid")
			if r and h and h.Health > 0 and not char:FindFirstChild("GNSafe") then
				local d = (r.Position - pos).magnitude
				if d < (range or 150) and (not bestD or d < bestD) then best, bestD, bestHum = char, d, h end
			end
		end
		return best, bestD, bestHum
	end
	spawn(function()
		while true do
			local dt = wait(0.15)
			for m, n in pairs(live) do
				if not m.Parent or n.hum.Health <= 0 then live[m] = nil
				else
					local pos = n.root.Position
					local char, d, hum = nearest(pos, n.o.range)
					local moving = false
					if char then
						local tr = char.HumanoidRootPart
						n.hum:MoveTo(tr.Position)
						moving = d > 3
						if d < 4.2 and tick() - n.last > (n.o.rate or 1) then
							n.last = tick()
							if n.o.hit then pcall(n.o.hit, m, char, hum)
							else hum:TakeDamage(n.o.damage or 10) end
							n.arms[1].CurrentAngle = 1.6
						end
					elseif n.o.patrol and #n.o.patrol > 0 then
						local goal = n.o.patrol[n.p]
						n.hum:MoveTo(goal)
						moving = true
						if (Vector3.new(goal.X, pos.Y, goal.Z) - pos).magnitude < 3 then n.p = n.p % #n.o.patrol + 1 end
					end
					-- walk: swing the legs; jump when stuck against something
					n.t = n.t + (dt or 0.15) * 8
					local a = moving and math.sin(n.t) * 0.7 or 0
					n.legs[1].DesiredAngle, n.legs[2].DesiredAngle = a, a
					if n.o.arms ~= "forward" then n.arms[1].DesiredAngle, n.arms[2].DesiredAngle = -a, -a end
					local v = n.root.Velocity
					if moving and Vector3.new(v.X, 0, v.Z).magnitude < 1.5 then
						n.stuck = n.stuck + 1
						if n.stuck > 4 then n.hum.Jump = true n.stuck = 0 end
					else n.stuck = 0 end
					if pos.Y < -60 then m:Destroy() live[m] = nil end
				end
			end
		end
	end)
end
