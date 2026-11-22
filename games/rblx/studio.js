/* GN-BLOX Studio: build places in the browser, 2016 Roblox Studio style.
 *
 * The place is an RBXFile document (rbxfile.js): a tree of instances with typed properties, in the
 * types the 2016 engine reads, so Save writes a .rbxl the engine (and Roblox Studio) can open and
 * Play hands it straight to play.html. Parts are drawn with a few instanced meshes (one per shape)
 * and a small shader that draws studs and inlets, so even places with thousands of parts stay fast.
 */
(function () {
  'use strict';
  const R = window.RBXFile, THREE = window.THREE;
  const $ = id => document.getElementById(id);
  const enc = new TextEncoder(), dec = new TextDecoder();
  const str = v => (typeof v === 'string' ? v : v instanceof Uint8Array ? dec.decode(v) : v == null ? '' : String(v));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const round = (v, n = 3) => { const k = Math.pow(10, n); return Math.round(v * k) / k; };
  const fmt = v => String(round(v));
  const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  let TYPEMAP = {};

  // ================================================================ document model
  let doc = { roots: [] }, placeName = 'Place1', dirty = false;
  const selection = new Set();
  const expanded = new Set();

  const SERVICE_ORDER = ['Workspace', 'Players', 'Lighting', 'ReplicatedFirst', 'ReplicatedStorage', 'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPack', 'StarterPlayer', 'SoundService', 'Teams'];
  const PART_SHAPES = { Part: 1, SpawnLocation: 1, Seat: 1, VehicleSeat: 1, TrussPart: 1, WedgePart: 1, CornerWedgePart: 1, UnionOperation: 1, MeshPart: 1, NegateOperation: 1, SkateboardPlatform: 1, FlagStand: 1 };
  const isPart = it => it && it.cls !== 'Terrain' && it.props.has('size') && it.props.has('CFrame');
  const get = (it, n, d) => { const p = it.props.get(n); return p ? p.v : d; };
  const nameOf = it => { const n = it.props.get('Name'); return n ? str(n.v) : it.cls; };
  const setName = (it, n) => it.props.set('Name', { t: 1, v: enc.encode(n) });
  const childrenOf = p => (p ? p.children : doc.roots);
  const ancestors = it => { const a = []; for (let p = it.parent; p; p = p.parent) a.push(p); return a; };
  const isAncestor = (a, it) => { for (let p = it.parent; p; p = p.parent) if (p === a) return true; return false; };
  const service = cls => doc.roots.find(r => r.cls === cls);
  const workspace = () => service('Workspace');
  const inWorkspace = it => { let p = it; while (p.parent) p = p.parent; return p.cls === 'Workspace'; };
  function descendants(it, out = []) { for (const c of it.children) { out.push(c); descendants(c, out); } return out; }
  function partsIn(it) { const o = isPart(it) ? [it] : []; for (const d of descendants(it)) if (isPart(d)) o.push(d); return o; }
  function selectedParts() { const s = new Set(); for (const it of selection) for (const p of partsIn(it)) s.add(p); return [...s]; }

  // property defaults for things you can insert (types match tools/typemap.json)
  const SIDES = ['Back', 'Bottom', 'Front', 'Left', 'Right', 'Top'];
  function partProps(o = {}) {
    const p = {
      Anchored: [2, false], BrickColor: [11, 194], CanCollide: [2, true], Elasticity: [4, 0.5], Friction: [4, 0.3], Locked: [2, false],
      Material: [18, 256], Reflectance: [4, 0], Transparency: [4, 0], Velocity: [14, [0, 0, 0]], RotVelocity: [14, [0, 0, 0]],
      size: [14, [4, 1.2, 2]], CFrame: [16, [0, 0, 0, ...IDENT]], formFactorRaw: [18, 3], shape: [18, 1],
    };
    for (const s of SIDES) {
      p[s + 'Surface'] = [18, s === 'Top' ? 3 : s === 'Bottom' ? 4 : 0];
      p[s + 'SurfaceInput'] = [18, 0]; p[s + 'ParamA'] = [4, -0.5]; p[s + 'ParamB'] = [4, 0.5];
    }
    return Object.assign(p, o);
  }
  const src = s => [1, s];
  const CLASSES = {
    Part: () => partProps(),
    WedgePart: () => partProps({ size: [14, [4, 1.2, 2]], TopSurface: [18, 0] }),
    CornerWedgePart: () => partProps({ size: [14, [2, 2, 2]], TopSurface: [18, 0] }),
    TrussPart: () => partProps({ size: [14, [2, 10, 2]], BrickColor: [11, 199], Anchored: [2, true], TopSurface: [18, 0], BottomSurface: [18, 0], style: [18, 0] }),
    SpawnLocation: () => partProps({ size: [14, [6, 1, 6]], Anchored: [2, true], TopSurface: [18, 0], BottomSurface: [18, 0], Duration: [3, 10], Neutral: [2, true], AllowTeamChangeOnTouch: [2, false], TeamColor: [11, 194] }),
    Seat: () => partProps({ size: [14, [2, 1, 2]], BrickColor: [11, 192], Disabled: [2, false], TopSurface: [18, 0] }),
    VehicleSeat: () => partProps({ size: [14, [4, 1, 2]], Disabled: [2, false], HeadsUpDisplay: [2, true], MaxSpeed: [4, 25], Torque: [4, 10], TurnSpeed: [4, 1], Steer: [3, 0], Throttle: [3, 0] }),
    Model: () => ({}), Folder: () => ({}), Configuration: () => ({}),
    Script: () => ({ Disabled: [2, false], LinkedSource: src(''), Source: src('print("Hello world!")\n') }),
    LocalScript: () => ({ Disabled: [2, false], LinkedSource: src(''), Source: src('print("Hello world!")\n') }),
    ModuleScript: () => ({ LinkedSource: src(''), Source: src('local module = {}\n\nreturn module\n') }),
    PointLight: () => ({ Brightness: [4, 1], Color: [12, [1, 1, 1]], Enabled: [2, true], Range: [4, 8], Shadows: [2, false] }),
    SpotLight: () => ({ Angle: [4, 90], Brightness: [4, 1], Color: [12, [1, 1, 1]], Enabled: [2, true], Face: [18, 5], Range: [4, 16], Shadows: [2, false] }),
    SurfaceLight: () => ({ Angle: [4, 90], Brightness: [4, 1], Color: [12, [1, 1, 1]], Enabled: [2, true], Face: [18, 5], Range: [4, 16], Shadows: [2, false] }),
    Fire: () => ({ Color: [12, [236 / 255, 139 / 255, 70 / 255]], SecondaryColor: [12, [139 / 255, 80 / 255, 55 / 255]], Enabled: [2, true], heat_xml: [4, 9], size_xml: [4, 5] }),
    Smoke: () => ({ Color: [12, [1, 1, 1]], Enabled: [2, true], opacity_xml: [4, 0.5], riseVelocity_xml: [4, 1], size_xml: [4, 1] }),
    Sparkles: () => ({ Enabled: [2, true], SparkleColor: [12, [144 / 255, 25 / 255, 1]] }),
    Sound: () => ({ Looped: [2, false], Pitch: [4, 1], PlayOnRemove: [2, false], SoundId: src(''), Volume: [4, 0.5] }),
    Decal: () => ({ Face: [18, 5], Shiny: [4, 20], Specular: [4, 0], Texture: src(''), Transparency: [4, 0] }),
    Texture: () => ({ Face: [18, 5], Shiny: [4, 20], Specular: [4, 0], StudsPerTileU: [4, 2], StudsPerTileV: [4, 2], Texture: src(''), Transparency: [4, 0] }),
    ClickDetector: () => ({ MaxActivationDistance: [4, 32] }),
    SpecialMesh: () => ({ MeshType: [18, 3], MeshId: src(''), TextureId: src(''), Offset: [14, [0, 0, 0]], Scale: [14, [1, 1, 1]], VertexColor: [14, [1, 1, 1]] }),
    BlockMesh: () => ({ Offset: [14, [0, 0, 0]], Scale: [14, [1, 1, 1]], VertexColor: [14, [1, 1, 1]] }),
    CylinderMesh: () => ({ Offset: [14, [0, 0, 0]], Scale: [14, [1, 1, 1]], VertexColor: [14, [1, 1, 1]] }),
    Humanoid: () => ({ Health: [4, 100], MaxHealth: [4, 100], WalkSpeed: [4, 16], JumpPower: [4, 50] }),
    Tool: () => ({ CanBeDropped: [2, true], Enabled: [2, true], Grip: [16, [0, 0, 0, ...IDENT]], ManualActivationOnly: [2, false], TextureId: src(''), ToolTip: src('') }),
    IntValue: () => ({ Value: [3, 0] }), NumberValue: () => ({ Value: [5, 0] }), StringValue: () => ({ Value: src('') }),
    BoolValue: () => ({ Value: [2, false] }), ObjectValue: () => ({ Value: [19, null] }), Vector3Value: () => ({ Value: [14, [0, 0, 0]] }),
    CFrameValue: () => ({ Value: [16, [0, 0, 0, ...IDENT]] }), BrickColorValue: () => ({ Value: [11, 194] }), Color3Value: () => ({ Value: [12, [1, 1, 1]] }),
    RemoteEvent: () => ({}), RemoteFunction: () => ({}), BindableEvent: () => ({}), BindableFunction: () => ({}),
    ScreenGui: () => ({}),
    Frame: () => guiProps({ Size: [7, [0, 100, 0, 100]] }),
    TextLabel: () => guiProps(textProps({ Text: src('Label') })),
    TextButton: () => guiProps(textProps({ Text: src('Button'), AutoButtonColor: [2, true], Modal: [2, false], Selected: [2, false], Style: [18, 0] })),
    TextBox: () => guiProps(textProps({ Text: src('TextBox') })),
    ImageLabel: () => guiProps({ Image: src(''), ImageColor3: [12, [1, 1, 1]], ImageTransparency: [4, 0] }),
    ImageButton: () => guiProps({ Image: src(''), ImageColor3: [12, [1, 1, 1]], ImageTransparency: [4, 0], AutoButtonColor: [2, true] }),
    SurfaceGui: () => ({ Active: [2, true], Enabled: [2, true], Face: [18, 5], CanvasSize: [13, [800, 600]] }),
    BillboardGui: () => ({ Active: [2, true], Enabled: [2, true], AlwaysOnTop: [2, false], Size: [7, [0, 200, 0, 50]], StudsOffset: [14, [0, 2, 0]] }),
    Weld: () => ({ C0: [16, [0, 0, 0, ...IDENT]], C1: [16, [0, 0, 0, ...IDENT]], Part0: [19, null], Part1: [19, null] }),
    BodyVelocity: () => ({ P: [4, 1250], maxForce: [14, [4000, 4000, 4000]], velocity: [14, [0, 2, 0]] }),
    BodyPosition: () => ({ D: [4, 1250], P: [4, 10000], maxForce: [14, [4000, 4000, 4000]], position: [14, [0, 50, 0]] }),
    BodyGyro: () => ({ D: [4, 500], P: [4, 3000], cframe: [16, [0, 0, 0, ...IDENT]], maxTorque: [14, [4000, 0, 4000]] }),
    BodyForce: () => ({ force: [14, [0, 0, 0]] }),
    Team: () => ({ TeamColor: [11, 1], AutoAssignable: [2, true], Score: [3, 0] }),
    Sky: () => ({ CelestialBodiesShown: [2, true], StarCount: [3, 3000] }),
  };
  function guiProps(o) {
    return Object.assign({
      Active: [2, false], BackgroundColor3: [12, [1, 1, 1]], BackgroundTransparency: [4, 0], BorderColor3: [12, [27 / 255, 42 / 255, 53 / 255]],
      BorderSizePixel: [3, 1], ClipsDescendants: [2, false], Draggable: [2, false], Position: [7, [0, 0, 0, 0]], Rotation: [4, 0],
      Size: [7, [0, 200, 0, 50]], SizeConstraint: [18, 0], Visible: [2, true], ZIndex: [3, 1],
    }, o);
  }
  function textProps(o) {
    return Object.assign({ Font: [18, 3], FontSize: [18, 7], TextColor3: [12, [27 / 255, 42 / 255, 53 / 255]], TextScaled: [2, false], TextStrokeColor3: [12, [0, 0, 0]], TextStrokeTransparency: [4, 1], TextTransparency: [4, 0], TextWrapped: [2, false], TextXAlignment: [18, 2], TextYAlignment: [18, 1] }, o);
  }
  const INSERTABLE = Object.keys(CLASSES).sort();

  function make(cls, name) {
    const it = new R.Inst(cls);
    setName(it, name || cls);
    const defs = (CLASSES[cls] || (() => ({})))();
    const known = Object.keys(TYPEMAP).some(k => k.startsWith(cls + '.'));
    for (const [k, [t, v]] of Object.entries(defs)) {
      if (known && TYPEMAP[cls + '.' + k] == null && !/Value$|^(C0|C1|Part0|Part1)$/.test(k)) continue;   // a property this class doesn't have in 2016
      it.props.set(k, { t, v: t === 1 ? enc.encode(v) : Array.isArray(v) ? v.slice() : v });
    }
    return it;
  }
  function cloneInst(it, map = new Map()) {
    const c = new R.Inst(it.cls);
    c.service = it.service;
    map.set(it, c);
    for (const [k, p] of it.props) c.props.set(k, { t: p.t, v: Array.isArray(p.v) ? JSON.parse(JSON.stringify(p.v)) : p.v instanceof Uint8Array ? p.v.slice() : p.v });
    for (const ch of it.children) { const cc = cloneInst(ch, map); cc.parent = c; c.children.push(cc); }
    return c;
  }
  function cloneMany(list) {
    const map = new Map();
    const out = list.map(it => cloneInst(it, map));
    // references inside the copied set point at the copies
    for (const c of map.values()) for (const p of c.props.values()) if (p.t === 19 && p.v && map.has(p.v)) p.v = map.get(p.v);
    return out;
  }

  // templates for File > New
  function newPlace(kind) {
    const d = { roots: [] };
    const svc = (cls, props = {}) => { const s = make(cls); s.service = true; for (const [k, [t, v]] of Object.entries(props)) s.props.set(k, { t, v }); d.roots.push(s); return s; };
    const ws = svc('Workspace', { FilteringEnabled: [2, false] });
    svc('Players');
    svc('Lighting', { Ambient: [12, [0, 0, 0]], Brightness: [4, 1], ColorShift_Bottom: [12, [0, 0, 0]], ColorShift_Top: [12, [0, 0, 0]], FogColor: [12, [0.75, 0.75, 0.75]], FogEnd: [4, 100000], FogStart: [4, 0], GeographicLatitude: [4, 41.73], GlobalShadows: [2, true], OutdoorAmbient: [12, [0.5, 0.5, 0.5]], Outlines: [2, false], ShadowColor: [12, [0.7, 0.7, 0.72]], TimeOfDay: [1, enc.encode('14:00:00')] });
    for (const s of ['ReplicatedFirst', 'ReplicatedStorage', 'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPack']) svc(s);
    const sp = svc('StarterPlayer');
    const sps = make('StarterPlayerScripts'); sps.parent = sp; sp.children.push(sps);
    svc('SoundService'); svc('Teams');
    const add = it => { it.parent = ws; ws.children.push(it); return it; };
    const base = make('Part', 'Baseplate');
    const color = kind === 'grass' ? 37 : kind === 'classic' ? 28 : 194;
    base.props.set('size', { t: 14, v: kind === 'classic' ? [512, 1.2, 512] : [512, 20, 512] });
    base.props.set('CFrame', { t: 16, v: [0, kind === 'classic' ? -0.6 : -10, 0, ...IDENT] });
    base.props.set('Anchored', { t: 2, v: true }); base.props.set('Locked', { t: 2, v: true });
    base.props.set('BrickColor', { t: 11, v: color });
    if (kind === 'grass') base.props.set('Material', { t: 18, v: 1280 });
    add(base);
    const spawn = make('SpawnLocation');
    spawn.props.set('CFrame', { t: 16, v: [0, 0.5, 0, ...IDENT] });
    add(spawn);
    return d;
  }

  // ================================================================ undo / redo
  const undoStack = [], redoStack = [];
  function act(label, redo, undo) {
    redo();
    undoStack.push({ label, redo, undo });
    if (undoStack.length > 300) undoStack.shift();
    redoStack.length = 0;
    changed();
  }
  function undo() { const a = undoStack.pop(); if (!a) return; a.undo(); redoStack.push(a); changed(true); log('Undo: ' + a.label); }
  function redo() { const a = redoStack.pop(); if (!a) return; a.redo(); undoStack.push(a); changed(true); log('Redo: ' + a.label); }

  // property changes: [[inst, name, {t, v} or null], ...]
  function setProps(label, list) {
    const olds = list.map(([it, n]) => it.props.get(n) || null);
    const apply = vals => list.forEach(([it, n], i) => { if (vals[i]) it.props.set(n, vals[i]); else it.props.delete(n); viewsFor(it); });
    act(label, () => apply(list.map(x => x[2])), () => apply(olds));
  }
  function detach(it) {
    const arr = childrenOf(it.parent), i = arr.indexOf(it);
    if (i >= 0) arr.splice(i, 1);
    return i;
  }
  function attach(it, parent, index) {
    it.parent = parent;
    const arr = childrenOf(parent);
    arr.splice(index == null || index < 0 ? arr.length : Math.min(index, arr.length), 0, it);
  }
  function insertMany(label, items, parent, select = true) {
    act(label, () => { for (const it of items) attach(it, parent); structure(); if (select) setSelection(items); },
      () => { for (const it of items) detach(it); for (const it of items) selection.delete(it); structure(); });
  }
  function removeMany(label, items) {
    items = items.filter(it => !it.service && !items.some(o => o !== it && isAncestor(o, it)));
    if (!items.length) return;
    const where = items.map(it => [it, it.parent, childrenOf(it.parent).indexOf(it)]);
    act(label, () => { for (const it of items) { detach(it); selection.delete(it); } structure(); },
      () => { for (const [it, p, i] of where.slice().reverse()) attach(it, p, i); structure(); });
  }
  function reparent(label, items, parent) {
    items = items.filter(it => !it.service && it !== parent && !isAncestor(it, parent) && it.parent !== parent);
    if (!items.length) return;
    const where = items.map(it => [it, it.parent, childrenOf(it.parent).indexOf(it)]);
    act(label, () => { for (const it of items) { detach(it); attach(it, parent); } structure(); },
      () => { for (const [it] of where) detach(it); for (const [it, p, i] of where.slice().reverse()) attach(it, p, i); structure(); });
  }

  // ================================================================ math helpers (CFrame = [x,y,z, r00..r22])
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  function cfMatrix(cf, sx = 1, sy = 1, sz = 1, m = new THREE.Matrix4()) {
    return m.set(cf[3] * sx, cf[4] * sy, cf[5] * sz, cf[0], cf[6] * sx, cf[7] * sy, cf[8] * sz, cf[1], cf[9] * sx, cf[10] * sy, cf[11] * sz, cf[2], 0, 0, 0, 1);
  }
  const cfPos = cf => V(cf[0], cf[1], cf[2]);
  const cfAxis = (cf, i) => V(cf[3 + i], cf[6 + i], cf[9 + i]);   // the part's local X/Y/Z axis in world space
  function cfFromMatrix(m) {
    const e = m.elements;   // column-major
    const c = [e[12], e[13], e[14], e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
    return orthonormal(c);
  }
  function orthonormal(cf) {
    const x = V(cf[3], cf[6], cf[9]).normalize(), y0 = V(cf[4], cf[7], cf[10]);
    const z = new THREE.Vector3().crossVectors(x, y0).normalize(), y = new THREE.Vector3().crossVectors(z, x);
    return [cf[0], cf[1], cf[2], x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z];
  }
  function eulerXYZ(cf) {   // Roblox Rotation (degrees): CFrame.Angles(x, y, z) = Rx * Ry * Rz
    const b = Math.asin(Math.max(-1, Math.min(1, cf[5])));
    const a = Math.atan2(-cf[8], cf[11]), c = Math.atan2(-cf[4], cf[3]);
    return [a, b, c].map(r => r * 180 / Math.PI);
  }
  function fromEulerXYZ(pos, deg) {
    const [a, b, c] = deg.map(d => d * Math.PI / 180);
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    return [pos[0], pos[1], pos[2],
      cb * cc, -cb * sc, sb,
      sa * sb * cc + ca * sc, -sa * sb * sc + ca * cc, -sa * cb,
      -ca * sb * cc + sa * sc, ca * sb * sc + sa * cc, ca * cb];
  }
  function partBox(it) {   // world-space AABB of a part
    const s = get(it, 'size'), cf = get(it, 'CFrame');
    const h = [s[0] / 2, s[1] / 2, s[2] / 2], box = new THREE.Box3();
    const c = cfPos(cf);
    const ext = V(
      Math.abs(cf[3]) * h[0] + Math.abs(cf[4]) * h[1] + Math.abs(cf[5]) * h[2],
      Math.abs(cf[6]) * h[0] + Math.abs(cf[7]) * h[1] + Math.abs(cf[8]) * h[2],
      Math.abs(cf[9]) * h[0] + Math.abs(cf[10]) * h[1] + Math.abs(cf[11]) * h[2]);
    return box.set(c.clone().sub(ext), c.clone().add(ext));
  }
  function boxOf(parts) { const b = new THREE.Box3(); for (const p of parts) b.union(partBox(p)); return b; }

  // ================================================================ rendering
  const canvas = $('canvas'), viewEl = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.3, 6000);
  const overlay = new THREE.Scene();   // outlines and handles, drawn on top

  const SHADER = {
    uniforms: { lightDir: { value: V(0.35, 0.85, 0.4).normalize() }, fogColor: { value: new THREE.Color(0xc8dcf0) }, fogNear: { value: 1500 }, fogFar: { value: 5000 } },
    vertexShader: `
      attribute float surf;
      attribute vec2 extra;
      varying vec3 vN; varying vec2 vUv; varying float vCode; varying vec3 vCol; varying vec2 vExtra; varying float vDepth;
      void main() {
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec3 an = abs(normal);
        float face; vec2 uv; vec3 p = position + 0.5;
        if (an.x > 0.6) { face = normal.x > 0.0 ? 0.0 : 1.0; uv = vec2(p.z * sc.z, p.y * sc.y); }
        else if (an.y > 0.55) { face = normal.y > 0.0 ? 2.0 : 3.0; uv = vec2(p.x * sc.x, p.z * sc.z); }
        else { face = normal.z > 0.0 ? 4.0 : 5.0; uv = vec2(p.x * sc.x, p.y * sc.y); }
        vCode = mod(floor(surf / pow(16.0, face)), 16.0);
        vUv = uv;
        mat4 m = modelMatrix * instanceMatrix;
        vN = normalize(mat3(m) * (normal / (sc * sc)));
        vCol = instanceColor; vExtra = extra;
        vec4 mv = viewMatrix * m * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 lightDir; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
      varying vec3 vN; varying vec2 vUv; varying float vCode; varying vec3 vCol; varying vec2 vExtra; varying float vDepth;
      void main() {
        vec3 col = vCol;
        float alpha = vExtra.x;
        if (vCode > 14.5) {           // truss: a lattice you can see through
          vec2 f = abs(fract(vUv * 0.5) - 0.5);
          if (min(f.x, f.y) < 0.38 && abs(f.x - f.y) > 0.09) discard;
        } else if (vCode > 2.5 && vCode < 5.5) {
          vec2 f = fract(vUv) - 0.5;
          float d = length(f);
          float fade = 1.0 - smoothstep(0.18, 0.5, length(fwidth(vUv)));   // studs smaller than a few pixels fade out
          float inside = 1.0 - smoothstep(0.25, 0.29, d);
          float rim = smoothstep(0.17, 0.29, d) * inside;
          float side = dot(normalize(f + vec2(1e-4)), normalize(vec2(-0.7, 0.7)));
          if (vCode < 4.5) col *= 1.0 + fade * (inside * 0.05 + rim * side * 0.22);      // studs (and universal)
          else col *= 1.0 - fade * (inside * 0.07 + rim * side * 0.2);                   // inlets
        }
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        float diff = max(dot(n, lightDir), 0.0);
        float hemi = 0.5 + 0.5 * n.y;
        vec3 lit = vExtra.y > 0.5 ? col * 1.12 : col * (0.42 + 0.18 * hemi + 0.55 * diff);
        float fog = clamp((vDepth - fogNear) / (fogFar - fogNear), 0.0, 1.0);
        gl_FragColor = vec4(mix(lit, fogColor, fog), alpha);
      }`,
  };
  const MAT = {
    opaque: new THREE.ShaderMaterial(Object.assign({}, SHADER, { side: THREE.FrontSide, extensions: { derivatives: true } })),
    clear: new THREE.ShaderMaterial(Object.assign({}, SHADER, { transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true } })),
  };
  MAT.clear.uniforms = MAT.opaque.uniforms;

  // unit shapes (-0.5..0.5); surface codes pick the face by its normal
  function flat(positions, indices) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    const n = g.toNonIndexed(); n.computeVertexNormals();
    return n;
  }
  const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    ball: new THREE.SphereGeometry(0.5, 28, 18),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 28).rotateZ(Math.PI / 2),
    cylY: new THREE.CylinderGeometry(0.5, 0.5, 1, 28),
    wedge: flat([-.5, -.5, -.5, .5, -.5, -.5, .5, -.5, .5, -.5, -.5, .5, -.5, .5, .5, .5, .5, .5],
      [0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4, 0, 4, 5, 0, 5, 1, 0, 3, 4, 1, 5, 2]),
    corner: flat([-.5, -.5, -.5, .5, -.5, -.5, .5, -.5, .5, -.5, -.5, .5, .5, .5, -.5],
      [0, 1, 2, 0, 2, 3, 1, 4, 2, 0, 4, 1, 2, 4, 3, 3, 4, 0]),
  };
  for (const g of Object.values(GEO)) { g.computeBoundingSphere(); g.computeBoundingBox(); }

  class Batch {
    constructor(shape, clear, cap = 256) {
      this.shape = shape; this.clear = clear; this.slots = []; this.free = []; this.make(cap);
    }
    make(cap) {
      const old = this.mesh;
      const g = GEO[this.shape].clone();
      this.surf = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
      this.extra = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
      g.setAttribute('surf', this.surf); g.setAttribute('extra', this.extra);
      const mesh = new THREE.InstancedMesh(g, this.clear ? MAT.clear : MAT.opaque, cap);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      mesh.frustumCulled = false;
      mesh.userData.batch = this;
      if (old) {
        mesh.instanceMatrix.array.set(old.instanceMatrix.array);
        mesh.instanceColor.array.set(old.instanceColor.array);
        this.surf.array.set(old.geometry.attributes.surf.array);
        this.extra.array.set(old.geometry.attributes.extra.array);
        mesh.count = old.count;
        scene.remove(old); old.geometry.dispose(); old.dispose && old.dispose();
      } else mesh.count = 0;
      if (this.clear) mesh.renderOrder = 1;
      this.mesh = mesh; this.cap = cap;
      scene.add(mesh);
    }
    alloc(inst) {
      let i = this.free.pop();
      if (i == null) {
        i = this.mesh.count;
        if (i >= this.cap) this.make(this.cap * 2);
        this.mesh.count = i + 1;
      }
      this.slots[i] = inst;
      return i;
    }
    release(i) {
      this.slots[i] = null;
      this.mesh.setMatrixAt(i, ZERO);
      this.extra.setXY(i, 0, 0);
      this.mesh.instanceMatrix.needsUpdate = true; this.extra.needsUpdate = true;
      this.free.push(i);
    }
    clearAll() { scene.remove(this.mesh); this.mesh.geometry.dispose(); }
  }
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let batches = new Map();
  const views = new Map();   // part -> { batch, index }

  function surfCode(it) {
    if (it.cls === 'TrussPart') return 0xFFFFFF;
    let code = 0;
    const order = ['Right', 'Left', 'Top', 'Bottom', 'Back', 'Front'];   // +X -X +Y -Y +Z -Z
    order.forEach((s, f) => { const v = Math.min(15, Math.max(0, get(it, s + 'Surface', 0) | 0)); code += v * Math.pow(16, f); });
    return code;
  }
  const _m = new THREE.Matrix4(), _o = new THREE.Matrix4();
  function partLook(it) {
    const size = get(it, 'size', [1, 1, 1]), cf = get(it, 'CFrame', [0, 0, 0, ...IDENT]);
    let shape = 'box', s = size.slice(), alpha = 1 - (get(it, 'Transparency', 0) || 0), offset = null;
    if (it.cls === 'WedgePart') shape = 'wedge';
    else if (it.cls === 'CornerWedgePart') shape = 'corner';
    else if (it.cls === 'Part' || it.cls === 'SpawnLocation' || it.cls === 'Seat') {
      const sh = get(it, 'shape', 1);
      if (sh === 0) { shape = 'ball'; const m = Math.min(...size); s = [m, m, m]; }
      else if (sh === 2) { shape = 'cyl'; const d = Math.min(size[1], size[2]); s = [size[0], d, d]; }
    }
    if (it.cls === 'MeshPart' || it.cls === 'UnionOperation') alpha = Math.min(alpha, 0.85);
    const mesh = it.children.find(c => c.cls === 'SpecialMesh' || c.cls === 'BlockMesh' || c.cls === 'CylinderMesh');
    let plain = false;
    if (mesh) {
      const sc = get(mesh, 'Scale', [1, 1, 1]), type = mesh.cls === 'SpecialMesh' ? get(mesh, 'MeshType', 6) : mesh.cls === 'CylinderMesh' ? 4 : 6;
      offset = get(mesh, 'Offset', null);
      plain = true;
      if (type === 0) { const m = Math.min(size[0], size[2]); shape = 'cylY'; s = [m * sc[0], size[1] * sc[1], m * sc[2]]; }
      else if (type === 3) { shape = 'ball'; s = [size[0] * sc[0], size[1] * sc[1], size[2] * sc[2]]; }
      else if (type === 4) { shape = 'cylY'; s = [size[0] * sc[0], size[1] * sc[1], size[2] * sc[2]]; }
      else if (type === 2) { shape = 'wedge'; s = [size[0] * sc[0], size[1] * sc[1], size[2] * sc[2]]; }
      else if (type === 5) { shape = 'box'; s = size.slice(); alpha = Math.min(alpha, 0.35); }   // a mesh file we can't show
      else { shape = 'box'; s = [size[0] * sc[0], size[1] * sc[1], size[2] * sc[2]]; }
    }
    const sx = Math.max(s[0], 1e-3), sy = Math.max(s[1], 1e-3), sz = Math.max(s[2], 1e-3);
    if (offset && (offset[0] || offset[1] || offset[2])) {   // part CFrame * mesh offset * size
      cfMatrix(cf, 1, 1, 1, _m).multiply(_o.makeTranslation(offset[0], offset[1], offset[2])).multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
    } else cfMatrix(cf, sx, sy, sz, _m);
    const rgb = R.brickRGB(get(it, 'BrickColor', 194));
    return { shape, matrix: _m, rgb, alpha, surf: plain || shape !== 'box' ? (it.cls === 'TrussPart' ? 0xFFFFFF : 0) : surfCode(it), neon: get(it, 'Material', 256) === 288 };
  }
  function drawPart(it) {
    const look = partLook(it);
    const clear = look.alpha < 0.999;
    const key = look.shape + (clear ? '+' : '');
    let v = views.get(it);
    if (v && v.batch.key !== key) { v.batch.release(v.index); v = null; }
    if (!v) {
      let b = batches.get(key);
      if (!b) { b = new Batch(look.shape, clear); b.key = key; batches.set(key, b); }
      v = { batch: b, index: b.alloc(it) };
      views.set(it, v);
    }
    const { batch: b, index: i } = v;
    b.mesh.setMatrixAt(i, look.matrix);
    b.mesh.setColorAt(i, new THREE.Color(look.rgb[0] / 255, look.rgb[1] / 255, look.rgb[2] / 255));
    b.surf.setX(i, look.surf);
    b.extra.setXY(i, Math.max(0, Math.min(1, look.alpha)), look.neon ? 1 : 0);
    b.mesh.instanceMatrix.needsUpdate = true; b.mesh.instanceColor.needsUpdate = true; b.surf.needsUpdate = true; b.extra.needsUpdate = true;
  }
  function undrawPart(it) { const v = views.get(it); if (v) { v.batch.release(v.index); views.delete(it); } }
  function viewsFor(it) {   // after a property change
    if (isPart(it) && inWorkspace(it)) drawPart(it);
    else if (views.has(it)) undrawPart(it);
    if (it.parent && /Mesh$/.test(it.cls) && isPart(it.parent)) viewsFor(it.parent);
  }
  function rebuildViews() {
    for (const b of batches.values()) b.clearAll();
    batches = new Map(); views.clear();
    const ws = workspace();
    if (ws) for (const d of descendants(ws)) if (isPart(d)) drawPart(d);
    applyLighting();
  }
  function applyLighting() {
    const L = service('Lighting');
    const fogEnd = L ? get(L, 'FogEnd', 100000) : 100000, fogStart = L ? get(L, 'FogStart', 0) : 0;
    const fc = L ? get(L, 'FogColor', [0.75, 0.75, 0.75]) : [0.75, 0.75, 0.75];
    const u = MAT.opaque.uniforms;
    if (fogEnd < 5000) { u.fogNear.value = fogStart; u.fogFar.value = Math.max(fogStart + 1, fogEnd); u.fogColor.value.setRGB(fc[0], fc[1], fc[2]); }
    else { u.fogNear.value = 2500; u.fogFar.value = 6000; u.fogColor.value.setHex(0xc8dcf0); }
  }

  // ---------------------------------------------------------------- outlines
  const outlines = new Map();
  const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const OUTLINE = new THREE.LineBasicMaterial({ color: 0x1a8cff, depthTest: false, transparent: true });
  const HOVER = new THREE.LineBasicMaterial({ color: 0x7cc0ff, depthTest: false, transparent: true, opacity: 0.85 });
  const hoverLine = new THREE.LineSegments(boxEdges, HOVER); hoverLine.visible = false; hoverLine.matrixAutoUpdate = false; hoverLine.matrixWorldAutoUpdate = false; overlay.add(hoverLine);
  function outlineMatrix(it, line) {
    const s = get(it, 'size');
    cfMatrix(get(it, 'CFrame'), s[0] + 0.06, s[1] + 0.06, s[2] + 0.06, line.matrix);
    line.matrixWorld.copy(line.matrix);
  }
  function updateOutlines() {
    const want = new Set(selectedParts().slice(0, 3000));
    for (const [p, l] of outlines) if (!want.has(p) || !inWorkspace(p)) { overlay.remove(l); outlines.delete(p); }
    for (const p of want) {
      if (!inWorkspace(p)) continue;
      let l = outlines.get(p);
      if (!l) { l = new THREE.LineSegments(boxEdges, OUTLINE); l.matrixAutoUpdate = false; l.matrixWorldAutoUpdate = false; overlay.add(l); outlines.set(p, l); }
      outlineMatrix(p, l);
    }
    handles.update();
    requestDraw();
  }

  // ================================================================ camera
  const cam = { pos: V(0, 18, 34), yaw: 0, pitch: -0.42 };
  function applyCamera() { camera.position.copy(cam.pos); camera.rotation.set(cam.pitch, cam.yaw, 0, 'YXZ'); camera.updateMatrixWorld(); }
  const forward = () => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  function focusOn(parts) {
    if (!parts.length) return;
    const b = boxOf(parts), c = b.getCenter(V()), r = Math.max(2, b.getSize(V()).length() / 2);
    cam.pos.copy(c).addScaledVector(forward(), -(r * 1.6 + 4));
    requestDraw();
  }
  function resize() {
    const w = viewEl.clientWidth || 1, h = viewEl.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    requestDraw();
  }
  new ResizeObserver(resize).observe(viewEl);

  let drawQueued = false;
  const keys = new Set();
  let lastT = 0;
  function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(frame); } }
  function frame(t) {
    drawQueued = false;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;
    if (keys.size && document.activeElement === canvas) {
      const speed = (keys.has('shift') ? 8 : 30) * dt, f = forward(), r = new THREE.Vector3().crossVectors(f, V(0, 1, 0)).normalize();
      if (keys.has('w')) cam.pos.addScaledVector(f, speed);
      if (keys.has('s')) cam.pos.addScaledVector(f, -speed);
      if (keys.has('d')) cam.pos.addScaledVector(r, speed);
      if (keys.has('a')) cam.pos.addScaledVector(r, -speed);
      if (keys.has('e')) cam.pos.y += speed;
      if (keys.has('q')) cam.pos.y -= speed;
    }
    applyCamera();
    handles.scaleToCamera();
    renderer.autoClear = true;
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(overlay, camera);
    if (keys.size && document.activeElement === canvas) requestDraw(); else lastT = 0;
    $('st-pos').textContent = 'Camera ' + cam.pos.toArray().map(v => Math.round(v)).join(', ');
  }

  // ================================================================ picking
  const ray = new THREE.Raycaster();
  function pointerRay(e) {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    return ray;
  }
  function pickPart(e, skip) {
    pointerRay(e);
    const meshes = [...batches.values()].map(b => b.mesh);
    for (const h of ray.intersectObjects(meshes, false)) {
      const it = h.object.userData.batch.slots[h.instanceId];
      if (!it || (skip && skip.has(it))) continue;
      return { it, point: h.point, normal: h.face ? h.face.normal.clone().transformDirection(instanceWorld(h.object, h.instanceId)) : V(0, 1, 0) };
    }
    return null;
  }
  function instanceWorld(mesh, i) { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); return m; }
  // clicking a part selects the top Model it belongs to (Alt-click picks the part itself)
  function selectable(it, alt) {
    if (alt) return it;
    let top = it;
    for (let p = it.parent; p && p.cls !== 'Workspace'; p = p.parent) if (p.cls === 'Model' || p.cls === 'Tool') top = p;
    return top;
  }

  // ================================================================ handles (Move / Scale / Rotate)
  const AXIS_COLORS = [0xe8413a, 0x3fbf3f, 0x2f7de1];
  const handles = {
    group: new THREE.Group(), parts: [], frame: null, size: 1,
    build() {
      this.group.clear();
      this.parts = [];
      const tool = state.tool;
      if (tool === 'select') return;
      const mat = c => new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.95 });
      for (let a = 0; a < 3; a++) for (const sgn of [1, -1]) {
        if (tool === 'rotate') continue;
        let m;
        if (tool === 'move') {
          m = new THREE.Group();
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), mat(AXIS_COLORS[a])); shaft.position.y = 0.6;
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 14), mat(AXIS_COLORS[a])); tip.position.y = 1.45;
          m.add(shaft, tip);
        } else m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 10), mat(tool === 'scale' ? 0x2f7de1 : AXIS_COLORS[a]));
        m.userData = { axis: a, sign: sgn };
        m.traverse(o => { o.userData = m.userData; o.renderOrder = 10; });
        this.group.add(m); this.parts.push(m);
      }
      if (tool === 'rotate') for (let a = 0; a < 3; a++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 64), mat(AXIS_COLORS[a]));
        ring.userData = { axis: a, ring: true }; ring.renderOrder = 10;
        this.group.add(ring); this.parts.push(ring);
      }
    },
    update() {
      const parts = selectedParts();
      this.frame = null;
      this.group.visible = false;
      if (state.tool === 'select' || !parts.length || parts.some(p => !inWorkspace(p))) { requestDraw(); return; }
      if (state.tool === 'scale' && parts.length !== 1) { requestDraw(); return; }
      let cf, size;
      if (parts.length === 1 && (state.local || state.tool === 'scale')) { cf = get(parts[0], 'CFrame').slice(); size = get(parts[0], 'size').slice(); }
      else if (parts.length === 1) { const b = partBox(parts[0]), c = b.getCenter(V()), s = b.getSize(V()); cf = [c.x, c.y, c.z, ...IDENT]; size = [s.x, s.y, s.z]; }
      else { const b = boxOf(parts), c = b.getCenter(V()), s = b.getSize(V()); cf = [c.x, c.y, c.z, ...IDENT]; size = [s.x, s.y, s.z]; }
      this.frame = { cf, size };
      this.group.visible = true;
      this.place();
      requestDraw();
    },
    place() {
      if (!this.frame) return;
      const { cf, size } = this.frame;
      const k = this.size;
      const origin = cfPos(cf);
      for (const m of this.parts) {
        const { axis, sign, ring } = m.userData;
        const dir = cfAxis(cf, axis);
        if (ring) {
          m.position.copy(origin);
          const r = Math.max(size[0], size[1], size[2]) * 0.75 + 1.2 * k;
          m.scale.setScalar(r);
          // a torus lies in its XY plane: point its Z at the axis
          m.quaternion.setFromUnitVectors(V(0, 0, 1), dir);
        } else {
          const out = dir.clone().multiplyScalar(sign);
          m.position.copy(origin).addScaledVector(out, size[axis] / 2 + (state.tool === 'move' ? 0.25 * k : 0.6 * k));
          m.quaternion.setFromUnitVectors(V(0, 1, 0), out);
          m.scale.setScalar(k);
        }
        m.updateMatrixWorld(true);
      }
    },
    scaleToCamera() {
      if (!this.frame || !this.group.visible) return;
      const k = Math.max(0.35, camera.position.distanceTo(cfPos(this.frame.cf)) * 0.045);
      if (Math.abs(k - this.size) > 1e-3) { this.size = k; this.place(); }
    },
    pick(e) {
      if (!this.group.visible) return null;
      pointerRay(e);
      const hit = ray.intersectObjects(this.parts, true)[0];
      return hit ? hit.object.userData : null;
    },
  };
  overlay.add(handles.group);

  // closest point on a line (origin, dir) to the pointer ray, as a distance along the line
  function alongAxis(origin, dir) {
    const ro = ray.ray.origin, rd = ray.ray.direction;
    const w0 = origin.clone().sub(ro);
    const b = dir.dot(rd), d = dir.dot(w0), e = rd.dot(w0), den = 1 - b * b;
    if (Math.abs(den) < 1e-4) return null;
    return (b * e - d) / den;
  }
  function anglePlane(origin, axis) {
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, origin);
    const p = ray.ray.intersectPlane(plane, V());
    if (!p) return null;
    const u = Math.abs(axis.y) < 0.9 ? new THREE.Vector3().crossVectors(axis, V(0, 1, 0)).normalize() : new THREE.Vector3().crossVectors(axis, V(1, 0, 0)).normalize();
    const v = new THREE.Vector3().crossVectors(axis, u);
    const d = p.sub(origin);
    return Math.atan2(d.dot(v), d.dot(u));
  }
  const snapTo = (v, inc, on) => (on && inc > 0 ? Math.round(v / inc) * inc : v);

  // ================================================================ state + pointer input
  const state = { tool: 'select', local: true, snapMove: true, moveInc: 1, snapRot: true, rotInc: 15 };
  let drag = null, hoverQueued = null;

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.focus();
    canvas.setPointerCapture(e.pointerId);
    closeMenus();
    if (e.button === 2 || e.button === 1 || (e.pointerType === 'touch' && !handles.pick(e) && !pickPart(e))) {
      drag = { kind: e.button === 1 ? 'pan' : 'look', x: e.clientX, y: e.clientY, moved: 0, button: e.button };
      return;
    }
    if (e.button !== 0) return;
    const h = handles.pick(e);
    if (h) { startHandleDrag(h, e); return; }
    const hit = pickPart(e);
    const target = hit ? selectable(hit.it, e.altKey) : null;
    if (target && get(hit.it, 'Locked', false) && !e.altKey) {   // locked parts can't be clicked
      if (!(e.ctrlKey || e.shiftKey)) setSelection([]);
      return;
    }
    if (e.ctrlKey || e.shiftKey) { if (target) toggleSelect(target); }
    else if (!target || !selection.has(target)) setSelection(target ? [target] : []);
    if (target && state.tool === 'select' && selection.has(target)) {
      drag = { kind: 'maybe-drag', x: e.clientX, y: e.clientY, hit, target };
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.kind === 'look') {
        cam.yaw -= dx * 0.0055; cam.pitch = Math.max(-1.55, Math.min(1.55, cam.pitch - dy * 0.0055));
        drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
        requestDraw();
      } else if (drag.kind === 'pan') {
        const f = forward(), r = new THREE.Vector3().crossVectors(f, V(0, 1, 0)).normalize(), u = new THREE.Vector3().crossVectors(r, f);
        cam.pos.addScaledVector(r, -dx * 0.06).addScaledVector(u, dy * 0.06);
        drag.x = e.clientX; drag.y = e.clientY;
        requestDraw();
      } else if (drag.kind === 'maybe-drag') {
        if (Math.abs(dx) + Math.abs(dy) > 5) startPartDrag(drag, e);
      } else if (drag.kind === 'parts') movePartDrag(e);
      else if (drag.kind === 'handle') moveHandleDrag(e);
      return;
    }
    if (!hoverQueued) {
      hoverQueued = e;
      requestAnimationFrame(() => {
        const ev = hoverQueued; hoverQueued = null;
        const hit = state.tool === 'select' || !handles.pick(ev) ? pickPart(ev) : null;
        if (hit && !get(hit.it, 'Locked', false)) { outlineMatrix(hit.it, hoverLine); hoverLine.visible = true; }
        else hoverLine.visible = false;
        canvas.style.cursor = handles.pick(ev) ? 'pointer' : 'default';
        requestDraw();
      });
    } else hoverQueued = e;
  });
  const endDrag = e => {
    if (!drag) return;
    if (drag.kind === 'handle' || drag.kind === 'parts') finishTransform();
    drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (x) {}
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    pointerRay(e);
    const hit = pickPart(e);
    const dist = hit ? hit.point.distanceTo(cam.pos) : 40;
    const step = Math.max(1, Math.min(60, dist * 0.18)) * Math.sign(-e.deltaY);
    cam.pos.addScaledVector(ray.ray.direction, step);
    requestDraw();
  }, { passive: false });
  canvas.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if ('wasdqe'.includes(k) && k.length === 1) { keys.add(k); requestDraw(); e.preventDefault(); }
    if (k === 'shift') keys.add('shift');
  });
  canvas.addEventListener('keyup', e => { keys.delete(e.key.toLowerCase()); });
  canvas.addEventListener('blur', () => keys.clear());

  // transform drags: remember every affected part's CFrame and size
  function snapshot(parts) { return parts.map(p => [p, get(p, 'CFrame').slice(), get(p, 'size').slice()]); }
  function startHandleDrag(h, e) {
    const parts = selectedParts();
    if (!parts.length || !handles.frame) return;
    const { cf } = handles.frame;
    const axis = cfAxis(cf, h.axis), origin = cfPos(cf);
    pointerRay(e);
    drag = { kind: 'handle', h, parts, orig: snapshot(parts), axis, origin, size0: handles.frame.size.slice(), cf0: cf.slice() };
    if (h.ring) drag.a0 = anglePlane(origin, axis);
    else { drag.dir = axis.clone().multiplyScalar(h.sign); drag.t0 = alongAxis(origin, drag.dir); }
    if ((h.ring ? drag.a0 : drag.t0) == null) drag = null;
  }
  function moveHandleDrag(e) {
    pointerRay(e);
    const d = drag;
    if (d.h.ring) {
      const a = anglePlane(d.origin, d.axis);
      if (a == null) return;
      let ang = a - d.a0;
      ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      const deg = snapTo(ang * 180 / Math.PI, state.rotInc, state.snapRot);
      const rot = new THREE.Matrix4().makeRotationAxis(d.axis, deg * Math.PI / 180);
      const T = new THREE.Matrix4().makeTranslation(d.origin.x, d.origin.y, d.origin.z), Ti = new THREE.Matrix4().makeTranslation(-d.origin.x, -d.origin.y, -d.origin.z);
      const M = T.multiply(rot).multiply(Ti);
      for (const [p, cf0] of d.orig) p.props.set('CFrame', { t: 16, v: cfFromMatrix(new THREE.Matrix4().multiplyMatrices(M, cfMatrix(cf0))) });
      d.status = 'Rotate ' + fmt(deg) + '°';
    } else {
      const t = alongAxis(d.origin, d.dir);
      if (t == null) return;
      let delta = t - d.t0;
      if (state.tool === 'move') {
        delta = snapTo(delta, state.moveInc, state.snapMove);
        for (const [p, cf0] of d.orig) { const cf = cf0.slice(); cf[0] += d.dir.x * delta; cf[1] += d.dir.y * delta; cf[2] += d.dir.z * delta; p.props.set('CFrame', { t: 16, v: cf }); }
        d.status = 'Move ' + fmt(delta) + ' studs';
      } else {
        const [p, cf0, s0] = d.orig[0];
        const ax = d.h.axis;
        let g = snapTo(delta, state.moveInc, state.snapMove);
        const ns = Math.max(0.2, s0[ax] + g);
        g = ns - s0[ax];
        const size = s0.slice(); size[ax] = ns;
        const cf = cf0.slice(); cf[0] += d.dir.x * g / 2; cf[1] += d.dir.y * g / 2; cf[2] += d.dir.z * g / 2;
        p.props.set('size', { t: 14, v: size }); p.props.set('CFrame', { t: 16, v: cf });
        d.status = 'Size ' + size.map(fmt).join(' × ');
      }
    }
    for (const [p] of d.orig) drawPart(p);
    $('st-sel').textContent = d.status;
    updateOutlines();
  }
  function finishTransform() {
    const d = drag;
    const after = snapshot(d.orig.map(o => o[0]));
    const changedAny = after.some(([, cf, s], i) => cf.some((v, k) => v !== d.orig[i][1][k]) || s.some((v, k) => v !== d.orig[i][2][k]));
    if (!changedAny) return;
    const set = list => { for (const [p, cf, s] of list) { p.props.set('CFrame', { t: 16, v: cf.slice() }); p.props.set('size', { t: 14, v: s.slice() }); drawPart(p); } };
    act(d.kind === 'parts' ? 'Drag' : state.tool === 'move' ? 'Move' : state.tool === 'scale' ? 'Resize' : 'Rotate', () => set(after), () => set(d.orig));
  }
  // Select tool: drag the selection over other parts' surfaces
  function startPartDrag(d, e) {
    const parts = selectedParts().filter(p => !get(p, 'Locked', false));
    if (!parts.length) { drag = null; return; }
    const box = boxOf(parts);
    drag = { kind: 'parts', parts, orig: snapshot(parts), box, grab: d.hit.point.clone(), skip: new Set(parts), center: box.getCenter(V()), half: box.getSize(V()).multiplyScalar(0.5) };
    movePartDrag(e);
  }
  function movePartDrag(e) {
    const d = drag;
    const hit = pickPart(e, d.skip);
    let target;
    if (hit) {
      const n = hit.normal;
      target = hit.point.clone();
      // sit on the surface: offset by the selection's half size along the surface normal
      const ext = Math.abs(n.x) * d.half.x + Math.abs(n.y) * d.half.y + Math.abs(n.z) * d.half.z;
      target.addScaledVector(n, ext);
      const off = d.grab.clone().sub(d.center);
      if (Math.abs(n.y) > 0.5) { target.x += off.x; target.z += off.z; }
    } else {
      pointerRay(e);
      const p = ray.ray.intersectPlane(new THREE.Plane(V(0, 1, 0), -d.center.y), V());
      if (!p) return;
      target = p.add(d.center.clone().sub(d.grab).setY(0));
    }
    if (state.snapMove) for (const k of ['x', 'z']) target[k] = d.center[k] + snapTo(target[k] - d.center[k], state.moveInc, true);
    const delta = target.sub(d.center);
    for (const [p, cf0] of d.orig) { const cf = cf0.slice(); cf[0] += delta.x; cf[1] += delta.y; cf[2] += delta.z; p.props.set('CFrame', { t: 16, v: cf }); drawPart(p); }
    updateOutlines();
  }

  // ================================================================ selection
  function setSelection(list) {
    selection.clear();
    for (const it of list) if (it) selection.add(it);
    for (const it of selection) for (const a of ancestors(it)) expanded.add(a);
    selectionChanged();
  }
  function toggleSelect(it) { if (selection.has(it)) selection.delete(it); else selection.add(it); selectionChanged(); }
  function selectionChanged() {
    renderTree(true);
    renderProps();
    updateOutlines();
    const n = selection.size;
    $('st-sel').textContent = n === 0 ? 'Nothing selected' : n === 1 ? [...selection][0].cls + ' "' + nameOf([...selection][0]) + '"' : n + ' objects selected';
    const one = [...selection].map(it => partsIn(it)[0]).find(Boolean);
    if (one) { const c = R.brickRGB(get(one, 'BrickColor', 194)); $('color-ic').style.color = `rgb(${c})`; }
  }

  // ================================================================ explorer
  const tree = $('tree');
  let filterText = '';
  const ICONS = {
    Part: 'part', WedgePart: 'part', CornerWedgePart: 'part', TrussPart: 'part', UnionOperation: 'part', MeshPart: 'mesh', Model: 'model', Script: 'script', LocalScript: 'localscript',
    ModuleScript: 'modulescript', Folder: 'folder', Configuration: 'folder', Workspace: 'workspace', Lighting: 'lighting', Players: 'players', Camera: 'camera', Humanoid: 'humanoid',
    SpecialMesh: 'mesh', BlockMesh: 'mesh', CylinderMesh: 'mesh', CharacterMesh: 'mesh', Weld: 'weld', ManualWeld: 'weld', Motor6D: 'weld', Snap: 'weld', Glue: 'weld', Motor: 'weld',
    SpawnLocation: 'spawn', Seat: 'seat', VehicleSeat: 'seat', Tool: 'tool', HopperBin: 'tool', RemoteEvent: 'remote', RemoteFunction: 'remote', BindableEvent: 'remote', BindableFunction: 'remote',
    Fire: 'effect', Smoke: 'effect', Sparkles: 'effect', ParticleEmitter: 'effect', Explosion: 'effect', PointLight: 'light', SpotLight: 'light', SurfaceLight: 'light', Sound: 'sound',
    Decal: 'decal', Texture: 'decal', Team: 'team', Sky: 'sky', ClickDetector: 'click', BodyVelocity: 'body', BodyPosition: 'body', BodyGyro: 'body', BodyForce: 'body', BodyAngularVelocity: 'body',
    StarterPlayerScripts: 'folder', StarterCharacterScripts: 'folder', Terrain: 'workspace',
  };
  const iconOf = it => ICONS[it.cls] || (/Value$/.test(it.cls) ? 'value' : /Gui$|Frame$|Label$|Button$|TextBox$/.test(it.cls) ? 'gui' : it.service || SERVICE_ORDER.includes(it.cls) ? 'service' : 'value');
  const rowOf = new Map();
  let treeQueued = false;
  function sortedRoots() {
    return doc.roots.slice().sort((a, b) => {
      const ia = SERVICE_ORDER.indexOf(a.cls), ib = SERVICE_ORDER.indexOf(b.cls);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }
  function renderTree(selOnly) {
    if (selOnly && !treeQueued) {   // just restyle rows
      for (const [it, row] of rowOf) row.classList.toggle('sel', selection.has(it));
      const first = [...selection][0];
      if (first && !rowOf.has(first)) renderTree(false);
      else if (first) { const r = rowOf.get(first); const top = r.offsetTop, h = tree.clientHeight; if (top < tree.scrollTop || top > tree.scrollTop + h - 20) tree.scrollTop = top - h / 3; }
      return;
    }
    if (treeQueued) return;
    treeQueued = true;
    requestAnimationFrame(() => {
      treeQueued = false;
      const scroll = tree.scrollTop;
      const frag = document.createDocumentFragment();
      rowOf.clear();
      const q = filterText.toLowerCase();
      const matches = it => !q || nameOf(it).toLowerCase().includes(q) || it.cls.toLowerCase().includes(q);
      const anyMatch = it => matches(it) || it.children.some(anyMatch);
      let rows = 0;
      const add = (it, depth) => {
        if (q && !anyMatch(it)) return;
        if (rows++ > 6000) return;
        const row = document.createElement('div');
        row.className = 'node' + (selection.has(it) ? ' sel' : '');
        row.style.paddingLeft = (depth * 14 + 2) + 'px';
        const open = expanded.has(it) || (q && it.children.some(anyMatch));
        row.innerHTML = `<span class="tw">${it.children.length ? (open ? '▼' : '▶') : ''}</span><svg><use href="#ic-${iconOf(it)}"/></svg><span class="nm">${esc(nameOf(it))}</span>`;
        row.draggable = !it.service;
        rowOf.set(it, row);
        row._it = it;
        frag.appendChild(row);
        if (open) for (const c of it.children) add(c, depth + 1);
      };
      for (const r of sortedRoots()) add(r, 0);
      tree.textContent = '';
      tree.appendChild(frag);
      tree.scrollTop = scroll;
    });
  }
  tree.addEventListener('click', e => {
    const row = e.target.closest('.node'); if (!row) return;
    const it = row._it;
    if (e.target.classList.contains('tw')) { if (expanded.has(it)) expanded.delete(it); else expanded.add(it); renderTree(); return; }
    if (e.ctrlKey || e.metaKey) toggleSelect(it);
    else if (e.shiftKey && selection.size) {
      const all = [...rowOf.keys()], a = all.indexOf([...selection].pop()), b = all.indexOf(it);
      setSelection(all.slice(Math.min(a, b), Math.max(a, b) + 1));
    } else setSelection([it]);
  });
  tree.addEventListener('dblclick', e => {
    const row = e.target.closest('.node'); if (!row || e.target.classList.contains('tw')) return;
    const it = row._it;
    if (it.props.has('Source')) openScript(it);
    else if (partsIn(it).length) focusOn(partsIn(it));
    else { if (expanded.has(it)) expanded.delete(it); else expanded.add(it); renderTree(); }
  });
  tree.addEventListener('contextmenu', e => {
    e.preventDefault();
    const row = e.target.closest('.node');
    if (row && !selection.has(row._it)) setSelection([row._it]);
    contextMenu(e.clientX, e.clientY);
  });
  let dragRows = null;
  tree.addEventListener('dragstart', e => {
    const row = e.target.closest('.node'); if (!row) return;
    if (!selection.has(row._it)) setSelection([row._it]);
    dragRows = [...selection];
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'webblox');
  });
  tree.addEventListener('dragover', e => {
    const row = e.target.closest('.node'); if (!row || !dragRows) return;
    e.preventDefault();
    tree.querySelectorAll('.drop').forEach(r => r.classList.remove('drop'));
    row.classList.add('drop');
  });
  tree.addEventListener('dragleave', e => { const row = e.target.closest('.node'); if (row) row.classList.remove('drop'); });
  tree.addEventListener('drop', e => {
    e.preventDefault();
    tree.querySelectorAll('.drop').forEach(r => r.classList.remove('drop'));
    const row = e.target.closest('.node');
    if (row && dragRows) { reparent('Move to ' + nameOf(row._it), dragRows, row._it); expanded.add(row._it); }
    dragRows = null;
  });
  $('filter').addEventListener('input', e => { filterText = e.target.value.trim(); renderTree(); });

  function rename(it) {
    const row = rowOf.get(it); if (!row || it.service) return;
    const nm = row.querySelector('.nm');
    const input = document.createElement('input');
    input.value = nameOf(it);
    nm.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const finish = ok => {
      if (done) return; done = true;
      const v = input.value.trim();
      if (ok && v && v !== nameOf(it)) setProps('Rename', [[it, 'Name', { t: 1, v: enc.encode(v) }]]);
      renderTree();
    };
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
  }

  // ================================================================ properties
  const ENUMS = {
    Material: { Plastic: 256, SmoothPlastic: 272, Neon: 288, Wood: 512, WoodPlanks: 528, Marble: 784, Slate: 800, Concrete: 816, Granite: 832, Brick: 848, Pebble: 864, Cobblestone: 880, CorrodedMetal: 1040, DiamondPlate: 1056, Foil: 1072, Metal: 1088, Grass: 1280, Sand: 1296, Fabric: 1312, Ice: 1536 },
    shape: { Ball: 0, Block: 1, Cylinder: 2 },
    formFactorRaw: { Symmetric: 0, Brick: 1, Plate: 2, Custom: 3 },
    Surface: { Smooth: 0, Glue: 1, Weld: 2, Studs: 3, Inlet: 4, Universal: 5, Hinge: 6, Motor: 7, SteppingMotor: 8 },
    MeshType: { Head: 0, Torso: 1, Wedge: 2, Sphere: 3, Cylinder: 4, FileMesh: 5, Brick: 6 },
    Face: { Right: 0, Top: 1, Back: 2, Left: 3, Bottom: 4, Front: 5 },
    Font: { Legacy: 0, Arial: 1, ArialBold: 2, SourceSans: 3, SourceSansBold: 4, SourceSansLight: 5, SourceSansItalic: 6 },
    FontSize: { Size8: 0, Size9: 1, Size10: 2, Size11: 3, Size12: 4, Size14: 5, Size18: 6, Size24: 7, Size36: 8, Size48: 9 },
    TextXAlignment: { Left: 0, Right: 1, Center: 2 }, TextYAlignment: { Top: 0, Center: 1, Bottom: 2 },
    style: { AlternatingSupports: 0, BridgeStyleSupports: 1, NoSupports: 2 },
    SizeConstraint: { RelativeXY: 0, RelativeXX: 1, RelativeYY: 2 },
  };
  const enumFor = n => ENUMS[n] || (/Surface$/.test(n) ? ENUMS.Surface : null);
  const LABEL = { size: 'Size', shape: 'Shape', formFactorRaw: 'FormFactor', heat_xml: 'Heat', size_xml: 'Size', opacity_xml: 'Opacity', riseVelocity_xml: 'RiseVelocity', maxForce: 'MaxForce', velocity: 'Velocity', force: 'Force', cframe: 'CFrame', maxTorque: 'MaxTorque', position: 'Position', style: 'Style', CoordinateFrame: 'CFrame' };
  const HIDDEN = /^(LinkedSource|Health_XML|ModelInPrimary|ClusterGridV3|SmoothGrid|MeshData|ChildData|PhysicsData|AssetId|InitialSize|Tags|AttributesSerialize|Attributes|SourceAssetId|CFrame|Color3uint8|LODX|LODY|ExpSolverEnabled_Replicate|DistributedGameTime|MaxPlayersInternal|PreferredPlayersInternal|UniqueId|HistoryId|Capabilities|DefinesCapabilities|ScriptGuid|.*ParamA|.*ParamB|.*SurfaceInput)$/;
  const CATS = [
    ['Appearance', 'BrickColor Color BackgroundColor3 BorderColor3 BorderSizePixel Material Reflectance Transparency BackgroundTransparency TextColor3 TextTransparency TextStrokeColor3 TextStrokeTransparency Font FontSize TextScaled TextWrapped TextXAlignment TextYAlignment Texture Image ImageColor3 ImageTransparency Face SecondaryColor SparkleColor heat_xml size_xml opacity_xml riseVelocity_xml Brightness Range Angle Shadows MeshType MeshId TextureId Scale Offset VertexColor Shiny Specular StudsPerTileU StudsPerTileV style Visible ZIndex'],
    ['Data', 'ClassName Name Parent Text Position Rotation Size Velocity RotVelocity Value SoundId Volume Pitch Looped PlayOnRemove PrimaryPart Part0 Part1 C0 C1 Health MaxHealth WalkSpeed JumpPower TeamColor Grip ToolTip'],
    ['Behavior', 'Anchored CanCollide Locked Disabled Enabled Active Draggable Neutral AllowTeamChangeOnTouch AutoAssignable Duration MaxActivationDistance CanBeDropped ManualActivationOnly FilteringEnabled'],
    ['Part', 'formFactorRaw shape size Elasticity Friction'],
    ['Surface', 'TopSurface BottomSurface FrontSurface BackSurface LeftSurface RightSurface'],
  ].map(([c, list]) => [c, list.split(' ')]);
  const catOf = n => { for (const [c, l] of CATS) if (l.includes(n)) return c; return 'Other'; };
  const shutCats = new Set();

  function propRows(items) {
    const first = items[0];
    // properties every selected object has (same type)
    const names = [...first.props.keys()].filter(n => !HIDDEN.test(n) && items.every(it => it.props.has(n) && it.props.get(n).t === first.props.get(n).t));
    const rows = [{ name: 'ClassName', ro: true, value: items.every(i => i.cls === first.cls) ? first.cls : '' }];
    rows.push(...names.filter(n => n === 'Name').map(n => ({ name: n })));
    rows.push({ name: 'Parent', ro: true, value: first.parent ? nameOf(first.parent) : '' });
    if (items.every(isPart)) {
      rows.push({ name: 'Position', virtual: 'pos' }, { name: 'Rotation', virtual: 'rot' });
    }
    rows.push(...names.filter(n => n !== 'Name').map(n => ({ name: n })));
    if (first.props.has('CFrame') && !isPart(first) && items.length === 1) rows.push({ name: 'CFrame', ro: true, value: get(first, 'CFrame').slice(0, 3).map(fmt).join(', ') });
    return rows;
  }
  function renderProps() {
    const box = $('props');
    const items = [...selection];
    $('props-title').textContent = items.length === 1 ? `Properties - ${items[0].cls} "${nameOf(items[0])}"` : items.length ? `Properties - ${items.length} objects` : 'Properties';
    box.textContent = '';
    if (!items.length) { box.innerHTML = '<div class="empty">Select something in the Explorer or the 3D view to see its properties.</div>'; return; }
    const rows = propRows(items);
    const groups = new Map();
    for (const r of rows) {
      const c = r.name === 'ClassName' || r.name === 'Name' || r.name === 'Parent' || r.virtual ? 'Data' : catOf(r.name);
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(r);
    }
    const order = ['Appearance', 'Data', 'Behavior', 'Part', 'Surface', 'Other'];
    for (const c of order) {
      const list = groups.get(c); if (!list) continue;
      const head = document.createElement('div');
      head.className = 'cat' + (shutCats.has(c) ? ' shut' : '');
      head.textContent = c;
      head.onclick = () => { if (shutCats.has(c)) shutCats.delete(c); else shutCats.add(c); renderProps(); };
      box.appendChild(head);
      if (shutCats.has(c)) continue;
      for (const r of list) box.appendChild(propRow(items, r));
    }
  }
  function propRow(items, r) {
    const row = document.createElement('div');
    row.className = 'p';
    const label = document.createElement('label');
    label.textContent = LABEL[r.name] || r.name;
    label.title = label.textContent;
    const cell = document.createElement('div');
    row.append(label, cell);
    const first = items[0];
    const text = (value, onCommit, ro) => {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.value = value; inp.readOnly = !!ro;
      if (!ro) {
        inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = value; inp.blur(); } });
        inp.addEventListener('change', () => onCommit(inp.value));
      }
      cell.appendChild(inp);
      return inp;
    };
    const nums = s => s.split(/[,\s]+/).filter(Boolean).map(Number);
    const commit = (name, t, makeV) => setProps('Change ' + (LABEL[name] || name), items.map(it => [it, name, { t, v: makeV(it) }]));
    if (r.ro) { text(r.value, null, true); return row; }
    if (r.virtual === 'pos') {
      text(get(first, 'CFrame').slice(0, 3).map(fmt).join(', '), s => {
        const v = nums(s); if (v.length !== 3 || v.some(isNaN)) return renderProps();
        const d = [v[0] - get(first, 'CFrame')[0], v[1] - get(first, 'CFrame')[1], v[2] - get(first, 'CFrame')[2]];
        commit('CFrame', 16, it => { const cf = get(it, 'CFrame').slice(); cf[0] += d[0]; cf[1] += d[1]; cf[2] += d[2]; return cf; });
      });
      return row;
    }
    if (r.virtual === 'rot') {
      text(eulerXYZ(get(first, 'CFrame')).map(v => fmt(round(v, 2))).join(', '), s => {
        const v = nums(s); if (v.length !== 3 || v.some(isNaN)) return renderProps();
        commit('CFrame', 16, it => fromEulerXYZ(get(it, 'CFrame'), v));
      });
      return row;
    }
    const p = first.props.get(r.name), t = p.t, v = p.v;
    const mixed = items.some(it => !same(it.props.get(r.name).v, v));
    if (r.name === 'Source') {
      const b = document.createElement('button'); b.className = 'btnlink'; b.textContent = 'Edit script…';
      b.onclick = () => openScript(first);
      cell.appendChild(b);
      return row;
    }
    switch (t) {
      case 1: text(mixed ? '' : str(v), s => commit(r.name, 1, () => enc.encode(s))); break;
      case 2: {
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!v; cb.indeterminate = mixed;
        cb.onchange = () => commit(r.name, 2, () => cb.checked);
        cell.appendChild(cb); break;
      }
      case 3: case 4: case 5: text(mixed ? '' : fmt(v), s => { const n = Number(s); if (s.trim() === '' || isNaN(n)) return renderProps(); commit(r.name, t, () => (t === 3 ? Math.round(n) : n)); }); break;
      case 11: {
        const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = `rgb(${R.brickRGB(v)})`;
        const nm = (R.PALETTE.find(x => x[0] === v) || [0, 0, String(v)])[2];
        cell.appendChild(sw);
        const inp = text(mixed ? '' : nm, s => { const hit = R.PALETTE.find(x => x[2].toLowerCase() === s.trim().toLowerCase()) || R.PALETTE.find(x => String(x[0]) === s.trim()); if (hit) commit(r.name, 11, () => hit[0]); else renderProps(); });
        sw.onclick = () => paletteMenu(sw, n => commit(r.name, 11, () => n));
        inp.title = 'A BrickColor name or number';
        break;
      }
      case 12: {
        const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = `rgb(${v.map(x => Math.round(x * 255))})`;
        const pick = document.createElement('input'); pick.type = 'color'; pick.style.display = 'none';
        pick.value = '#' + v.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('');
        pick.onchange = () => { const h = pick.value; commit(r.name, 12, () => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)); };
        sw.onclick = () => pick.click();
        cell.append(sw, pick);
        text(mixed ? '' : v.map(x => Math.round(x * 255)).join(', '), s => { const n = nums(s); if (n.length !== 3 || n.some(isNaN)) return renderProps(); commit(r.name, 12, () => n.map(x => Math.max(0, Math.min(255, x)) / 255)); });
        break;
      }
      case 13: case 14: {
        const k = t === 13 ? 2 : 3;
        text(mixed ? '' : v.map(fmt).join(', '), s => {
          const n = nums(s); if (n.length !== k || n.some(isNaN)) return renderProps();
          if (r.name === 'size' && isPart(first)) commit('size', 14, () => n.map(x => Math.max(0.2, x)));
          else commit(r.name, t, () => n);
        });
        break;
      }
      case 7: text(mixed ? '' : `{${fmt(v[0])}, ${v[1]}}, {${fmt(v[2])}, ${v[3]}}`, s => { const n = s.replace(/[{}]/g, ' ').split(/[,\s]+/).filter(Boolean).map(Number); if (n.length !== 4 || n.some(isNaN)) return renderProps(); commit(r.name, 7, () => [n[0], Math.round(n[1]), n[2], Math.round(n[3])]); }); break;
      case 18: {
        const en = enumFor(r.name);
        if (en) {
          const sel = document.createElement('select');
          for (const [k, n] of Object.entries(en)) { const o = document.createElement('option'); o.value = n; o.textContent = k; sel.appendChild(o); }
          if (!Object.values(en).includes(v)) { const o = document.createElement('option'); o.value = v; o.textContent = String(v); sel.appendChild(o); }
          sel.value = String(v);
          sel.onchange = () => commit(r.name, 18, () => Number(sel.value));
          cell.appendChild(sel);
        } else text(String(v), s => { const n = Number(s); if (isNaN(n)) return renderProps(); commit(r.name, 18, () => Math.round(n)); });
        break;
      }
      case 19: {
        if (v) { const b = document.createElement('button'); b.className = 'btnlink'; b.textContent = nameOf(v); b.onclick = () => setSelection([v]); cell.appendChild(b); }
        else text('', null, true);
        break;
      }
      case 16: text(v.slice(0, 3).map(fmt).join(', '), null, true); break;
      default: text(Array.isArray(v) ? JSON.stringify(v).slice(0, 60) : String(v), null, true);
    }
    return row;
  }

  function same(a, b) {
    if (a === b) return true;
    if (a instanceof Uint8Array && b instanceof Uint8Array) return a.length === b.length && a.every((x, i) => x === b[i]);
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
    return false;
  }

  // ================================================================ script editor
  const docTabs = [{ kind: 'place' }];
  let activeTab = docTabs[0];
  const ta = $('code-ta'), hl = $('code-hl'), gutter = $('gutter');
  const LUA_KW = /^(and|break|do|else|elseif|end|false|for|function|if|in|local|nil|not|or|repeat|return|then|true|until|while)$/;
  const LUA_GLOBALS = /^(game|workspace|Workspace|script|print|warn|error|wait|spawn|delay|tick|time|Instance|Vector3|Vector2|CFrame|Color3|BrickColor|UDim2|UDim|Ray|Enum|math|string|table|pairs|ipairs|tostring|tonumber|type|require|pcall|select|unpack|next|setmetatable|getmetatable|rawget|rawset|coroutine|os)$/;
  function highlight(code) {
    const re = /(--\[(=*)\[[\s\S]*?(?:\]\2\]|$)|--[^\n]*)|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|\[(=*)\[[\s\S]*?(?:\]\4\]|$))|(\b0x[0-9a-fA-F]+\b|\b\d+\.?\d*(?:[eE][+-]?\d+)?\b)|([A-Za-z_]\w*)/g;
    let out = '', last = 0, m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      const tok = esc(m[0]);
      if (m[1]) out += `<span class="com">${tok}</span>`;
      else if (m[3]) out += `<span class="str">${tok}</span>`;
      else if (m[5]) out += `<span class="num">${tok}</span>`;
      else if (LUA_KW.test(m[6])) out += `<span class="kw">${tok}</span>`;
      else if (LUA_GLOBALS.test(m[6])) out += `<span class="glob">${tok}</span>`;
      else out += tok;
      last = re.lastIndex;
    }
    return out + esc(code.slice(last)) + '\n';
  }
  function refreshCode() {
    hl.innerHTML = highlight(ta.value);
    const n = ta.value.split('\n').length;
    if (gutter._n !== n) { gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); gutter._n = n; }
    syncScroll();
  }
  function syncScroll() { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; gutter.scrollTop = ta.scrollTop; }
  ta.addEventListener('scroll', syncScroll);
  ta.addEventListener('input', () => {
    if (activeTab.kind === 'script') activeTab.inst.props.set('Source', { t: 1, v: enc.encode(ta.value) });
    refreshCode(); markDirty();
  });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart;
      ta.setRangeText('\t', s, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
    } else if (e.key === 'Enter') {
      const s = ta.selectionStart, lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
      const indent = (ta.value.slice(lineStart, s).match(/^\s*/) || [''])[0];
      const extra = /\b(then|do|else|repeat|function\b.*\))\s*$/.test(ta.value.slice(lineStart, s)) ? '\t' : '';
      e.preventDefault();
      ta.setRangeText('\n' + indent + extra, s, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
    }
  });
  function openScript(it) {
    let tab = docTabs.find(t => t.inst === it);
    if (!tab) { tab = { kind: 'script', inst: it, before: str(get(it, 'Source', '')) }; docTabs.push(tab); }
    showTab(tab);
  }
  function leaveScriptTab(tab) {
    if (tab.kind !== 'script') return;
    const now = str(get(tab.inst, 'Source', ''));
    if (now !== tab.before) {
      const it = tab.inst, before = tab.before;
      undoStack.push({ label: 'Edit ' + nameOf(it), redo: () => it.props.set('Source', { t: 1, v: enc.encode(now) }), undo: () => it.props.set('Source', { t: 1, v: enc.encode(before) }) });
      redoStack.length = 0;
      tab.before = now;
    }
  }
  function showTab(tab) {
    if (activeTab !== tab) leaveScriptTab(activeTab);
    activeTab = tab;
    const code = tab.kind === 'script';
    $('code').classList.toggle('on', code);
    $('hint').style.display = code ? 'none' : '';
    if (code) { ta.value = str(get(tab.inst, 'Source', '')); refreshCode(); ta.focus(); ta.setSelectionRange(0, 0); ta.scrollTop = 0; }
    else { canvas.focus(); resize(); }
    renderTabs();
  }
  function closeTab(tab) {
    leaveScriptTab(tab);
    const i = docTabs.indexOf(tab);
    if (i > 0) docTabs.splice(i, 1);
    if (activeTab === tab) showTab(docTabs[Math.max(0, i - 1)]);
    else renderTabs();
  }
  function renderTabs() {
    const box = $('doctabs');
    box.textContent = '';
    for (const tab of docTabs) {
      if (tab.kind === 'script' && !isInDoc(tab.inst)) continue;
      const el = document.createElement('div');
      el.className = 'doctab' + (tab === activeTab ? ' on' : '');
      el.innerHTML = tab.kind === 'place' ? `<svg width="14" height="14"><use href="#ic-workspace"/></svg>${esc(placeName)}${dirty ? ' *' : ''}`
        : `<svg width="14" height="14"><use href="#ic-${iconOf(tab.inst)}"/></svg>${esc(nameOf(tab.inst))}<button class="x" title="Close">×</button>`;
      el.onclick = e => { if (e.target.classList.contains('x')) closeTab(tab); else showTab(tab); };
      box.appendChild(el);
    }
  }
  const isInDoc = it => { let p = it; while (p.parent) p = p.parent; return doc.roots.includes(p); };

  // ================================================================ commands
  let clipboard = [];
  const insertParent = () => [...selection][0] || workspace();
  function placeInFront(parts) {
    // drop new parts on whatever is in the middle of the view, or 20 studs ahead
    const r = canvas.getBoundingClientRect();
    const hit = pickPart({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    const box = boxOf(parts), half = box.getSize(V()).multiplyScalar(0.5), c = box.getCenter(V());
    let target = hit ? hit.point.clone() : cam.pos.clone().addScaledVector(forward(), 20);
    target.y += half.y;
    if (state.snapMove) { target.x = Math.round(target.x); target.z = Math.round(target.z); }
    const d = target.sub(c);
    for (const p of parts) { const cf = get(p, 'CFrame').slice(); cf[0] += d.x; cf[1] += d.y; cf[2] += d.z; p.props.set('CFrame', { t: 16, v: cf }); }
  }
  function insertPart(kind) {
    const cls = { block: 'Part', sphere: 'Part', cylinder: 'Part', wedge: 'WedgePart', corner: 'CornerWedgePart', truss: 'TrussPart', spawn: 'SpawnLocation', seat: 'Seat' }[kind] || 'Part';
    const p = make(cls, cls === 'Part' ? 'Part' : cls);
    if (kind === 'sphere') { p.props.set('shape', { t: 18, v: 0 }); p.props.set('size', { t: 14, v: [2, 2, 2] }); p.props.set('TopSurface', { t: 18, v: 0 }); p.props.set('BottomSurface', { t: 18, v: 0 }); }
    if (kind === 'cylinder') { p.props.set('shape', { t: 18, v: 2 }); p.props.set('size', { t: 14, v: [2, 2, 2] }); p.props.set('CFrame', { t: 16, v: [0, 0, 0, 0, -1, 0, 1, 0, 0, 0, 0, 1] }); }
    placeInFront([p]);
    insertMany('Insert ' + cls, [p], workspace());
    log('Inserted ' + cls);
  }
  function insertObject(cls, parent) {
    parent = parent || insertParent();
    const it = make(cls);
    if (isPart(it)) { placeInFront([it]); if (!inWorkspaceParent(parent)) parent = workspace(); }
    insertMany('Insert ' + cls, [it], parent);
    if (it.props.has('Source')) openScript(it);
    return it;
  }
  const inWorkspaceParent = p => { let x = p; while (x.parent) x = x.parent; return x.cls === 'Workspace'; };
  function copy() { const items = topLevel([...selection].filter(it => !it.service)); if (items.length) { clipboard = cloneMany(items); log('Copied ' + items.length + ' object' + (items.length > 1 ? 's' : '')); } }
  function cut() { copy(); removeMany('Cut', [...selection]); }
  function paste(into) {
    if (!clipboard.length) return;
    const items = cloneMany(clipboard);
    const parent = into && selection.size === 1 ? [...selection][0] : workspace();
    const parts = items.flatMap(partsIn);
    if (parts.length && !into) {   // stack the copies on top of where they were
      const b = boxOf(parts), h = b.getSize(V()).y;
      for (const p of parts) { const cf = get(p, 'CFrame').slice(); cf[1] += h; p.props.set('CFrame', { t: 16, v: cf }); }
    }
    insertMany('Paste', items, parent);
  }
  function duplicate() {
    const items = topLevel([...selection].filter(it => !it.service));
    if (!items.length) return;
    const copies = cloneMany(items);
    const parts = copies.flatMap(partsIn);
    if (parts.length) { const h = boxOf(parts).getSize(V()).y; for (const p of parts) { const cf = get(p, 'CFrame').slice(); cf[1] += h; p.props.set('CFrame', { t: 16, v: cf }); } }
    act('Duplicate', () => { copies.forEach((c, i) => attach(c, items[i].parent)); structure(); setSelection(copies); },
      () => { copies.forEach(detach); copies.forEach(c => selection.delete(c)); structure(); });
  }
  const topLevel = list => list.filter(it => !list.some(o => o !== it && isAncestor(o, it)));
  function group() {
    const items = topLevel([...selection].filter(it => !it.service));
    if (!items.length) return;
    const parent = items[0].parent;
    const model = make('Model');
    const where = items.map(it => [it, it.parent, childrenOf(it.parent).indexOf(it)]);
    act('Group', () => { attach(model, parent); for (const it of items) { detach(it); attach(it, model); } structure(); setSelection([model]); },
      () => { for (const [it] of where) detach(it); for (const [it, p, i] of where.slice().reverse()) attach(it, p, i); detach(model); structure(); setSelection(items); });
  }
  function ungroup() {
    const models = [...selection].filter(it => it.cls === 'Model' || it.cls === 'Folder');
    if (!models.length) return;
    const moves = models.map(m => [m, m.parent, childrenOf(m.parent).indexOf(m), m.children.slice()]);
    act('Ungroup', () => { const sel = []; for (const [m, p, , kids] of moves) { for (const k of kids) { detach(k); attach(k, p); sel.push(k); } detach(m); } structure(); setSelection(sel); },
      () => { for (const [m, p, i, kids] of moves.slice().reverse()) { attach(m, p, i); for (const k of kids) { detach(k); attach(k, m); } } structure(); setSelection(models); });
  }
  function toggleBool(name, label) {
    const parts = selectedParts(); if (!parts.length) return;
    const on = !parts.every(p => get(p, name, false));
    setProps((on ? '' : 'Un') + label, parts.map(p => [p, name, { t: 2, v: on }]));
    log((on ? '' : 'Un') + label.toLowerCase() + 'ed ' + parts.length + ' part' + (parts.length > 1 ? 's' : ''));
  }
  function setTool(t) {
    state.tool = t;
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    handles.build(); handles.update();
  }

  // ================================================================ menus
  function closeMenus() { document.querySelectorAll('.menu').forEach(m => m.remove()); }
  function menu(x, y, items, cls = '') {
    closeMenus();
    const m = document.createElement('div');
    m.className = 'menu ' + cls;
    for (const it of items) {
      if (it === '-') { m.appendChild(document.createElement('hr')); continue; }
      if (it.el) { m.appendChild(it.el); continue; }
      if (it.label) { const l = document.createElement('div'); l.className = 'lbl'; l.textContent = it.label; m.appendChild(l); continue; }
      const b = document.createElement('button');
      b.innerHTML = (it.icon ? `<svg width="16" height="16"><use href="#${it.icon}"/></svg>` : '') + esc(it.text) + (it.key ? `<kbd>${it.key}</kbd>` : '');
      b.disabled = !!it.disabled;
      b.onclick = () => { closeMenus(); it.run(); };
      m.appendChild(b);
    }
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
    m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
    return m;
  }
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.menu') && !e.target.closest('[data-menu]') && !e.target.closest('#file-btn')) closeMenus(); });
  function contextMenu(x, y) {
    const any = selection.size > 0, one = selection.size === 1 ? [...selection][0] : null;
    menu(x, y, [
      { text: 'Cut', key: 'Ctrl+X', icon: 'ib-cut', run: cut, disabled: !any },
      { text: 'Copy', key: 'Ctrl+C', icon: 'ib-copy', run: copy, disabled: !any },
      { text: 'Paste', key: 'Ctrl+V', run: () => paste(false), disabled: !clipboard.length },
      { text: 'Paste Into', key: 'Ctrl+Shift+V', run: () => paste(true), disabled: !clipboard.length || !one },
      { text: 'Duplicate', key: 'Ctrl+D', icon: 'ib-dup', run: duplicate, disabled: !any },
      { text: 'Delete', key: 'Del', icon: 'ib-delete', run: () => removeMany('Delete', [...selection]), disabled: !any },
      { text: 'Rename', key: 'F2', run: () => rename(one), disabled: !one || one.service },
      '-',
      { text: 'Group', key: 'Ctrl+G', icon: 'ic-model', run: group, disabled: !any },
      { text: 'Ungroup', key: 'Ctrl+U', run: ungroup, disabled: !any },
      { text: 'Select Children', run: () => setSelection([...selection].flatMap(s => s.children)), disabled: !any },
      { text: 'Zoom to', key: 'F', icon: 'ib-focus', run: () => focusOn(selectedParts()), disabled: !selectedParts().length },
      '-',
      { text: 'Insert Object…', key: 'Ctrl+I', icon: 'ib-insert', run: () => insertDialog() },
      ...(one && one.props.has('Source') ? [{ text: 'Open Script', icon: 'ic-script', run: () => openScript(one) }] : []),
    ]);
  }
  function paletteMenu(anchor, pick) {
    const grid = document.createElement('div');
    grid.className = 'palette';
    const name = document.createElement('div'); name.className = 'name'; name.textContent = 'Pick a BrickColor';
    const sorted = R.PALETTE.slice().sort((a, b) => hue(a[1]) - hue(b[1]));
    for (const [n, c, nm] of sorted) {
      const b = document.createElement('button');
      b.style.background = '#' + c.toString(16).padStart(6, '0');
      b.title = nm;
      b.onmouseenter = () => { name.textContent = nm + ' (' + n + ')'; };
      b.onclick = () => { closeMenus(); pick(n); };
      grid.appendChild(b);
    }
    grid.appendChild(name);
    const r = anchor.getBoundingClientRect();
    menu(r.left, r.bottom + 2, [{ el: grid }]);
  }
  function hue(c) {
    const r = (c >> 16 & 255) / 255, g = (c >> 8 & 255) / 255, b = (c & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 0.08) return 10 + (1 - mx);   // greys last, light to dark
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h < 0 ? h + 6 : h) + (1 - mx) * 0.001;
  }
  function ribbonMenu(kind, btn) {
    const r = btn.getBoundingClientRect();
    if (kind === 'part') {
      menu(r.left, r.bottom + 2, [
        { text: 'Block', icon: 'ic-part', run: () => insertPart('block') },
        { text: 'Sphere', icon: 'ic-part', run: () => insertPart('sphere') },
        { text: 'Wedge', icon: 'ic-part', run: () => insertPart('wedge') },
        { text: 'Corner Wedge', icon: 'ic-part', run: () => insertPart('corner') },
        { text: 'Cylinder', icon: 'ic-part', run: () => insertPart('cylinder') },
        { text: 'Truss', icon: 'ic-part', run: () => insertPart('truss') },
        '-',
        { text: 'Spawn Location', icon: 'ic-spawn', run: () => insertPart('spawn') },
        { text: 'Seat', icon: 'ic-seat', run: () => insertPart('seat') },
      ]);
    } else if (kind === 'color') {
      paletteMenu(btn, n => { const parts = selectedParts(); if (parts.length) setProps('Color', parts.map(p => [p, 'BrickColor', { t: 11, v: n }])); else log('Select parts first, then pick a color.', 'warn'); });
    } else if (kind === 'material') {
      menu(r.left, r.bottom + 2, Object.entries(ENUMS.Material).map(([name, n]) => ({
        text: name, run: () => { const parts = selectedParts(); if (parts.length) setProps('Material', parts.map(p => [p, 'Material', { t: 18, v: n }])); else log('Select parts first, then pick a material.', 'warn'); },
      })));
    }
  }
  function dialog(title, body, buttons) {
    const d = document.createElement('div');
    d.className = 'dialog';
    d.innerHTML = `<div class="box" role="dialog" aria-label="${esc(title)}"><h4>${esc(title)}</h4><div class="body"></div><div class="btns"></div></div>`;
    const b = d.querySelector('.body');
    if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
    for (const [label, fn, primary] of buttons) {
      const btn = document.createElement('button');
      btn.textContent = label; if (primary) btn.className = 'primary';
      btn.onclick = () => { if (fn() !== false) d.remove(); };
      d.querySelector('.btns').appendChild(btn);
    }
    d.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') d.remove(); });
    document.body.appendChild(d);
    return d;
  }
  function insertDialog() {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<input type="text" placeholder="Search for a class" aria-label="Search"/><div class="list"></div>';
    const input = wrap.querySelector('input'), list = wrap.querySelector('.list');
    let pick = null;
    const draw = () => {
      list.textContent = '';
      const q = input.value.trim().toLowerCase();
      for (const cls of INSERTABLE.filter(c => c.toLowerCase().includes(q))) {
        const row = document.createElement('div');
        row.className = 'node' + (cls === pick ? ' sel' : '');
        row.innerHTML = `<svg><use href="#ic-${ICONS[cls] || (/Value$/.test(cls) ? 'value' : /Gui$|Frame$|Label$|Button$|TextBox$/.test(cls) ? 'gui' : 'value')}"/></svg>${cls}`;
        row.onclick = () => { pick = cls; draw(); };
        row.ondblclick = () => { d.remove(); insertObject(cls); };
        list.appendChild(row);
      }
    };
    const d = dialog('Insert Object', wrap, [['Cancel', () => {}], ['Insert', () => { if (!pick) { const first = list.querySelector('.node'); if (!first) return false; pick = first.textContent; } insertObject(pick); }, true]]);
    input.addEventListener('input', () => { pick = null; draw(); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { const first = pick || (list.querySelector('.node') || {}).textContent; if (first) { d.remove(); insertObject(first); } } });
    draw();
    input.focus();
  }

  // ================================================================ files
  function idb(fn) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('webblox', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const tx = req.result.transaction('files', 'readwrite');
        const r = fn(tx.objectStore('files'));
        tx.oncomplete = () => resolve(r && r.result);
        tx.onerror = () => reject(tx.error);
      };
    });
  }
  function serialize() { return R.write(doc); }
  function loadDoc(d, name) {
    doc = d; placeName = name || 'Place1';
    for (const r of doc.roots) if (SERVICE_ORDER.includes(r.cls)) r.service = true;
    selection.clear(); expanded.clear(); undoStack.length = 0; redoStack.length = 0;
    docTabs.length = 1; activeTab = docTabs[0];
    const ws = workspace(); if (ws) expanded.add(ws);
    dirty = false;
    structure();
    showTab(docTabs[0]);
    const parts = ws ? descendants(ws).filter(isPart) : [];
    if (parts.length) {
      const b = boxOf(parts.filter(p => Math.max(...get(p, 'size')) < 400).slice(0, 4000));
      const c = b.isEmpty() ? V() : b.getCenter(V());
      cam.yaw = 0; cam.pitch = -0.42;
      const r = b.isEmpty() ? 20 : Math.min(250, b.getSize(V()).length() / 3);
      cam.pos.set(c.x, c.y + r * 0.45 + 8, c.z + r + 16);
    } else { cam.pos.set(0, 18, 34); cam.yaw = 0; cam.pitch = -0.42; }
    $('title').textContent = placeName + ' - GN-BLOX Studio';
    document.title = placeName + ' - GN-BLOX Studio';
    selectionChanged();
  }
  async function openFile(file) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const d = R.read(bytes);
      const notes = R.toEngine(d, TYPEMAP, { modern: false });
      loadDoc(d, file.name.replace(/\.rbx[lm]x?$/i, ''));
      log(`Opened ${file.name} (${d.insts.length} objects${d.format === 'xml' ? ', XML' : ''})`, 'info');
      for (const n of notes) log('  ' + n);
      autosave();
    } catch (e) {
      log('Couldn\'t open ' + file.name + ': ' + e.message, 'err');
      dialog('Couldn\'t open the file', `<p>${esc(file.name)} doesn't look like a Roblox place or model.</p><p><code>${esc(e.message)}</code></p>`, [['OK', () => {}, true]]);
    }
  }
  function saveFile() {
    leaveScriptTab(activeTab);
    const bytes = serialize();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    a.download = placeName.replace(/[\\/:*?"<>|]/g, '') + '.rbxl';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    dirty = false; renderTabs();
    log('Saved ' + a.download + ' (' + Math.round(bytes.length / 1024) + ' KB)', 'info');
  }
  let autosaveTimer = 0;
  function autosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try { const bytes = serialize(); idb(s => s.put({ name: placeName, time: Date.now(), bytes: bytes.buffer }, 'studio-autosave')).catch(() => {}); } catch (e) { console.warn(e); }
    }, 1500);
  }
  async function play() {
    leaveScriptTab(activeTab);
    const bytes = serialize();
    try { await idb(s => s.put(bytes.buffer.slice(0), 'upload')); }
    catch (e) { log('Couldn\'t hand the place to the game (browser storage is blocked).', 'err'); return; }
    autosave();
    let who = 'You';
    try { who = (window.WB && WB.displayName && WB.displayName()) || localStorage.getItem('webblox-name') || 'You'; } catch (e) {}
    const url = 'play.html?custom=1&title=' + encodeURIComponent(placeName) + '&by=' + encodeURIComponent(who);
    const w = window.open(url, '_blank');
    if (!w) location.href = url;
    log('Playing ' + placeName + ' in a new tab', 'info');
  }
  function fileMenu() {
    const r = $('file-btn').getBoundingClientRect();
    menu(r.left, r.bottom, [
      { text: 'New', icon: 'ib-part', run: () => confirmLose(() => startDialog(true)) },
      { text: 'Open from File…', key: 'Ctrl+O', run: () => confirmLose(() => $('open-file').click()) },
      { text: 'Save to File', key: 'Ctrl+S', run: saveFile },
      { text: 'Rename Place…', run: renamePlace },
      '-',
      { text: 'Play', key: 'F5', icon: 'ib-play', run: play },
      '-',
      { text: 'Back to GN-BLOX', run: () => { location.href = 'index.html'; } },
    ], 'filemenu');
  }
  function confirmLose(fn) {
    if (!dirty) return fn();
    dialog('Save changes?', `<p>Save your changes to ${esc(placeName)} first? (It's also kept in this browser.)</p>`, [['Cancel', () => {}], ['Don\'t Save', fn], ['Save', () => { saveFile(); fn(); }, true]]);
  }
  function renamePlace() {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<p>Place name</p><input type="text" maxlength="50" aria-label="Place name"/>';
    const inp = wrap.querySelector('input'); inp.value = placeName;
    const ok = () => { const v = inp.value.trim(); if (!v) return false; placeName = v; $('title').textContent = v + ' - GN-BLOX Studio'; document.title = v + ' - GN-BLOX Studio'; renderTabs(); autosave(); };
    const d = dialog('Rename Place', wrap, [['Cancel', () => {}], ['OK', ok, true]]);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { if (ok() !== false) d.remove(); } });
    inp.focus(); inp.select();
  }
  async function startDialog(forceNew) {
    let saved = null;
    if (!forceNew) try { saved = await idb(s => s.get('studio-autosave')); } catch (e) {}
    const wrap = document.createElement('div');
    const tile = (id, title, sub, bg) => `<button data-start="${id}"><span class="thumb" style="background:${bg}"></span><b>${esc(title)}</b><small>${esc(sub)}</small></button>`;
    wrap.innerHTML = `<p>Start a new place, or open a .rbxl / .rbxlx file (2008 to today).</p><div class="start">
      ${saved ? tile('continue', saved.name, 'Continue where you left off', 'linear-gradient(#9cc6ef,#cfe3f7 55%,#a3a2a5 55%)') : ''}
      ${tile('baseplate', 'Baseplate', 'Grey baseplate', 'linear-gradient(#9cc6ef,#cfe3f7 55%,#a3a2a5 55%)')}
      ${tile('grass', 'Flat Grass', 'Grassy ground', 'linear-gradient(#9cc6ef,#cfe3f7 55%,#5fa04a 55%)')}
      ${tile('classic', 'Classic', 'Green studded baseplate', 'linear-gradient(#9cc6ef,#cfe3f7 55%,#287f47 55%)')}
      ${tile('open', 'Open File…', '.rbxl .rbxlx .rbxm', 'repeating-linear-gradient(45deg,#eee 0 6px,#e2e2e2 6px 12px)')}
    </div>`;
    const d = dialog('GN-BLOX Studio', wrap, []);
    d.querySelector('.btns').remove();
    wrap.addEventListener('click', async e => {
      const b = e.target.closest('[data-start]'); if (!b) return;
      const k = b.dataset.start;
      if (k === 'open') { $('open-file').click(); d.remove(); return; }
      d.remove();
      if (k === 'continue') {
        try { const dd = R.read(new Uint8Array(saved.bytes)); R.toEngine(dd, TYPEMAP, { modern: false }); loadDoc(dd, saved.name); log('Opened ' + saved.name + ' (kept in this browser)', 'info'); }
        catch (err) { log('Couldn\'t restore the last place: ' + err.message, 'err'); loadDoc(newPlace('baseplate'), 'Place1'); }
      } else { loadDoc(newPlace(k), k === 'baseplate' ? 'Place1' : k === 'grass' ? 'Grass Place' : 'Classic Place'); log('New place', 'info'); autosave(); }
    });
    if (!forceNew && !saved) { /* first visit: the dialog is the welcome */ }
  }
  $('open-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ''; });

  // ================================================================ change tracking
  function markDirty() { if (!dirty) { dirty = true; renderTabs(); } autosave(); }
  function changed(full) {
    markDirty();
    if (full) structure(); else { renderTree(); renderProps(); updateOutlines(); }
  }
  function structure() {   // after objects were added, removed or moved
    rebuildViews();
    renderTree();
    renderProps();
    updateOutlines();
    renderTabs();
    requestDraw();
  }

  // ================================================================ output
  function log(msg, kind) {
    const box = $('log');
    const line = document.createElement('div');
    if (kind) line.className = kind;
    const t = new Date();
    line.textContent = t.toTimeString().slice(0, 8) + ' - ' + msg;
    box.appendChild(line);
    while (box.childNodes.length > 400) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
  }

  // ================================================================ ribbon + keys
  document.querySelectorAll('.tabs [data-page]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs [data-page]').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.ribbon .page').forEach(p => p.classList.toggle('on', p.dataset.page === b.dataset.page));
  }));
  $('file-btn').addEventListener('click', fileMenu);
  document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  document.querySelectorAll('[data-menu]').forEach(b => b.addEventListener('click', () => ribbonMenu(b.dataset.menu, b)));
  const CMDS = {
    paste: () => paste(false), copy, cut, duplicate, insert: insertDialog, group, ungroup, play,
    anchor: () => toggleBool('Anchored', 'Anchor'), lock: () => toggleBool('Locked', 'Lock'),
    spawn: () => insertPart('spawn'), script: () => insertObject('Script', [...selection][0] || service('ServerScriptService') || workspace()),
    light: () => { const p = selectedParts()[0]; if (p) insertObject('PointLight', p); else log('Select a part to put the light in.', 'warn'); },
    focus: () => focusOn(selectedParts()),
    'toggle-explorer': () => togglePanel('explorer-panel'), 'toggle-props': () => togglePanel('props-panel'), 'toggle-output': () => togglePanel('output-panel'),
  };
  document.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => CMDS[b.dataset.cmd]()));
  function togglePanel(id) { const p = $(id); p.style.display = p.style.display === 'none' ? '' : 'none'; resize(); }
  $('snap-move').onchange = e => { state.snapMove = e.target.checked; };
  $('snap-rot').onchange = e => { state.snapRot = e.target.checked; };
  $('move-inc').onchange = e => { const v = Number(e.target.value); if (v > 0) state.moveInc = v; else e.target.value = state.moveInc; };
  $('rot-inc').onchange = e => { const v = Number(e.target.value); if (v > 0) state.rotInc = v; else e.target.value = state.rotInc; };
  $('local-space').onchange = e => { state.local = e.target.checked; handles.update(); };

  document.addEventListener('keydown', e => {
    if (document.querySelector('.dialog')) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (ctrl && k === 's') { e.preventDefault(); saveFile(); return; }
    if (ctrl && k === 'o') { e.preventDefault(); confirmLose(() => $('open-file').click()); return; }
    if (e.key === 'F5') { e.preventDefault(); play(); return; }
    if (typing) return;
    if (ctrl && (k === 'z' && !e.shiftKey)) { e.preventDefault(); undo(); }
    else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (ctrl && k === 'c') { e.preventDefault(); copy(); }
    else if (ctrl && e.shiftKey && k === 'x') { e.preventDefault(); $('filter').focus(); }
    else if (ctrl && k === 'x') { e.preventDefault(); cut(); }
    else if (ctrl && k === 'v') { e.preventDefault(); paste(e.shiftKey); }
    else if (ctrl && k === 'd') { e.preventDefault(); duplicate(); }
    else if (ctrl && k === 'g') { e.preventDefault(); group(); }
    else if (ctrl && k === 'u') { e.preventDefault(); ungroup(); }
    else if (ctrl && k === 'i') { e.preventDefault(); insertDialog(); }
    else if (ctrl && k === 'l') { e.preventDefault(); state.local = !state.local; $('local-space').checked = state.local; handles.update(); log(state.local ? 'Local space' : 'World space'); }
    else if (ctrl && k === 'a') { e.preventDefault(); const ws = workspace(); if (ws) setSelection(ws.children.filter(c => c.cls !== 'Camera' && c.cls !== 'Terrain')); }
    else if (ctrl && '1234'.includes(k)) { e.preventDefault(); setTool(['select', 'move', 'scale', 'rotate'][+k - 1]); }
    else if (e.key === 'Delete' || (e.key === 'Backspace' && document.activeElement !== ta)) { if (selection.size) { e.preventDefault(); removeMany('Delete', [...selection]); } }
    else if (e.key === 'F2') { e.preventDefault(); const one = [...selection][0]; if (one) rename(one); }
    else if (k === 'f' && !ctrl && document.activeElement !== ta) { focusOn(selectedParts()); }
    else if (e.key === 'Escape') { closeMenus(); setSelection([]); }
  });
  window.addEventListener('beforeunload', e => { if (dirty) { autosave(); } });

  // resizable panels
  document.querySelectorAll('[data-resize]').forEach(g => g.addEventListener('pointerdown', e => {
    e.preventDefault();
    const kind = g.dataset.resize, main = document.querySelector('.main'), center = document.querySelector('.center'), side = $('side');
    const move = ev => {
      if (kind === 'side') main.style.gridTemplateColumns = `1fr 5px ${Math.max(180, Math.min(600, innerWidth - ev.clientX))}px`;
      else if (kind === 'output') { const r = center.getBoundingClientRect(); center.style.gridTemplateRows = `24px 1fr 5px ${Math.max(40, Math.min(r.height - 120, r.bottom - ev.clientY))}px`; }
      else { const r = side.getBoundingClientRect(); const top = Math.max(80, Math.min(r.height - 80, ev.clientY - r.top)); side.style.gridTemplateRows = `${top}px 5px 1fr`; }
      resize();
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }));

  // ================================================================ start
  const project = (x, y, z) => { applyCamera(); const v = V(x, y, z).project(camera), r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; };
  window.WebBloxStudio = { get doc() { return doc; }, project, handles, selection, setSelection, insertPart, insertObject, setTool, undo, redo, serialize, loadDoc, newPlace, openScript, state, cam, requestDraw, setProps, log };
  (async () => {
    try { TYPEMAP = await (await fetch('tools/typemap.json')).json(); } catch (e) { log('Couldn\'t load the engine\'s property list; saved places may not open in the game.', 'warn'); }
    handles.build();
    loadDoc(newPlace('baseplate'), 'Place1');
    resize();
    log('Welcome to GN-BLOX Studio! Insert parts from the HOME tab, then press Play to try your place.', 'info');
    const params = new URLSearchParams(location.search);
    if (!params.has('new')) startDialog(false);
  })();
})();
