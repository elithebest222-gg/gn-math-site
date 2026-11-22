/* GN-BLOX: newer Roblox scripts (Luau, 2017 onwards) -> the Lua 5.1 the 2016 engine runs.
 *
 *   const { code, changed, notes } = GNLuau.convert(source)
 *
 * Syntax: compound assignment (+= -= *= /= %= ^= ..= //=), continue, `interpolated {strings}`,
 * type annotations / type declarations / :: casts, generic for over a table (for k, v in t do),
 * 1_000 and 0b101 numbers, if-then-else expressions, // floor division.
 * Library: task.*, TweenService / TweenInfo, :Connect / :Wait / :Disconnect, :GetDescendants,
 * :FindFirstChildOfClass / WhichIsA / FindFirstAncestor*, :GetPropertyChangedSignal, attributes,
 * :GetPivot / :PivotTo, Vector3.zero, CFrame.identity / lookAt, math.clamp / round / sign,
 * table.find / clear / create / pack / move, string.split, typeof, Color3.fromHex, newer GUI objects
 * (UICorner, UIStroke...) and newer fonts. The helpers go on the first line, so line numbers in
 * error messages stay the same. A script that needs none of this comes back unchanged.
 */
(function (G) {
  'use strict';
  const KEYWORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);
  const OPS = ['...', '..=', '//=', '..', '==', '~=', '<=', '>=', '//', '::', '->', '+=', '-=', '*=', '/=', '%=', '^='];

  // ------------------------------------------------------------------ tokenizer
  function tokenize(src) {
    const out = [];
    let i = 0;
    const n = src.length;
    const push = (t, v) => out.push({ t, v });
    const longBracket = at => { const m = /^\[(=*)\[/.exec(src.slice(at, at + 64)); return m ? m[1].length : -1; };
    while (i < n) {
      const c = src[i];
      if (c === '\n') { push('nl', c); i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { let j = i; while (j < n && /[ \t\r\f\v]/.test(src[j])) j++; push('ws', src.slice(i, j)); i = j; continue; }
      if (c === '-' && src[i + 1] === '-') {
        const lvl = longBracket(i + 2);
        if (lvl >= 0) { const close = ']' + '='.repeat(lvl) + ']'; const e = src.indexOf(close, i + 4 + lvl); const j = e < 0 ? n : e + close.length; push('com', src.slice(i, j)); i = j; continue; }
        let j = src.indexOf('\n', i); if (j < 0) j = n; push('com', src.slice(i, j)); i = j; continue;
      }
      if (c === '[') {
        const lvl = longBracket(i);
        if (lvl >= 0) { const close = ']' + '='.repeat(lvl) + ']'; const e = src.indexOf(close, i + 2 + lvl); const j = e < 0 ? n : e + close.length; push('str', src.slice(i, j)); i = j; continue; }
      }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n && src[j] !== c) { if (src[j] === '\\') j++; else if (src[j] === '\n') break; j++; }
        push('str', src.slice(i, Math.min(n, j + 1))); i = j + 1; continue;
      }
      if (c === '`') {   // interpolated string: literal parts and {expressions}
        const parts = [];
        let j = i + 1, lit = '';
        while (j < n && src[j] !== '`') {
          if (src[j] === '\\') { lit += src[j] + (src[j + 1] || ''); j += 2; continue; }
          if (src[j] === '{') {
            let depth = 1, k = j + 1;
            while (k < n && depth) {
              const ch = src[k];
              if (ch === '"' || ch === "'") { const q = ch; k++; while (k < n && src[k] !== q) { if (src[k] === '\\') k++; k++; } }
              else if (ch === '{') depth++;
              else if (ch === '}') depth--;
              k++;
            }
            parts.push({ lit }); lit = '';
            parts.push({ expr: src.slice(j + 1, k - 1) });
            j = k; continue;
          }
          lit += src[j]; j++;
        }
        parts.push({ lit });
        out.push({ t: 'istr', v: src.slice(i, Math.min(n, j + 1)), parts });
        i = j + 1; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        const m = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|[0-9_]*\.?[0-9_]*(?:[eE][+-]?[0-9_]+)?)/.exec(src.slice(i));
        let v = m[0] || c;
        push('num', v); i += v.length; continue;
      }
      if (/[A-Za-z_]/.test(c)) { let j = i; while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++; const w = src.slice(i, j); push(KEYWORDS.has(w) ? 'kw' : 'name', w); i = j; continue; }
      const op = OPS.find(o => src.startsWith(o, i));
      if (op) { push('op', op); i += op.length; continue; }
      push('op', c); i++;
    }
    return out;
  }

  // ------------------------------------------------------------------ what 2016 doesn't have (checked against the engine)
  const words = str => new Set(str.split(/\s+/).filter(Boolean));
  const NP = o => Object.assign(Object.create(null), o);
  const WEAK = words('.Enabled .Position .Size .Unit .Magnitude .Connected generic-for-call CFrame.fromAxisAngle CFrame.fromEulerAnglesYXZ');
  // obj:Method() spelled in lower case in 2016 (and Color3 / UDim2 had no lerp at all)
  const LOWER_METHODS = NP({
    Connect: 'connect', Disconnect: 'disconnect', Lerp: 'lerp', Inverse: 'inverse', ToWorldSpace: 'toWorldSpace',
    ToObjectSpace: 'toObjectSpace', PointToWorldSpace: 'pointToWorldSpace', PointToObjectSpace: 'pointToObjectSpace',
    VectorToWorldSpace: 'vectorToWorldSpace', VectorToObjectSpace: 'vectorToObjectSpace', GetComponents: 'components',
    ToEulerAnglesXYZ: 'toEulerAnglesXYZ', ToEulerAnglesYXZ: 'toEulerAnglesYXZ', ToOrientation: 'toEulerAnglesYXZ', ToAxisAngle: 'toAxisAngle',
  });
  // methods 2016 doesn't have: GNCompat has a stand-in (the engine's own is used when it has one)
  const CALL_METHODS = words(`GetDescendants FindFirstChildOfClass FindFirstChildWhichIsA FindFirstDescendant FindFirstAncestor
    FindFirstAncestorOfClass FindFirstAncestorWhichIsA GetPropertyChangedSignal GetAttribute SetAttribute GetAttributes
    GetAttributeChangedSignal AddTag RemoveTag HasTag GetTags GetTagged GetAllTags GetInstanceAddedSignal GetInstanceRemovedSignal
    GetPivot PivotTo GetBoundingBox ScaleTo GetScale ApplyImpulse ApplyImpulseAtPosition ApplyAngularImpulse GetVelocityAtPosition
    GetNetworkOwner SetNetworkOwner SetNetworkOwnershipAuto CanSetNetworkOwnership GetRootPart GetConnectedParts GetMouseLocation
    GetMouseDelta GetFocusedTextBox GetKeysPressed GetLastInputType IsServer IsClient IsStudio IsRunning IsRunMode IsEdit IsLoaded
    GetServerTimeNow GetPlayerByUserId GetActor GetAccessories AddAccessory RemoveAccessories ApplyDescription ApplyDescriptionReset
    GetAppliedDescription GetLimb Once ConnectParallel split GetPartBoundsInBox GetPartBoundsInRadius GetPartsInPart Raycast
    Spherecast Blockcast Shapecast GetTextBoundsAsync GetFriendsAsync GetPolicyInfoForPlayerAsync PromptGamePassPurchase
    UserOwnsGamePassAsync FuzzyEq Angle Abs Floor Ceil Sign Max Min ToHSV ToHex Orthonormalize`);
  const SAFE_METHODS = words('SetCore GetCore SetCoreGuiEnabled');
  // properties 2016 doesn't have: read with __gn.get, set with __gn.set (kept in Lua if the engine can't)
  const NEW_PROPS = words(`Enabled ResetOnSpawn IgnoreGuiInset ZIndexBehavior DisplayOrder AnchorPoint LayoutOrder RichText
    PlaceholderText PlaceholderColor3 CanTouch CanQuery AutomaticSize AutomaticCanvasSize MaxVisibleGraphemes TextTruncate LineHeight
    Interactable Orientation AssemblyLinearVelocity AssemblyAngularVelocity AssemblyMass AssemblyRootPart DisplayName AttributeChanged
    CastShadow FontFace CollisionGroup Massless RootPriority UseJumpPower JumpHeight BreakJointsOnDeath RequiresNeck
    EvaluateStateMachine ScreenInsets SafeAreaCompatibility ClipToDeviceSafeArea AutoLocalize RootLocalizationTable TextDirection
    BorderMode MaterialVariant PivotOffset WorldPivot PlaybackRegionsEnabled Technology EnvironmentDiffuseScale
    EnvironmentSpecularScale ShadowSoftness AutomaticScalingEnabled ScrollingEnabled TextColor`);
  // obj.Property spelled in lower case in 2016 (Vector2 had no .Magnitude)
  const LOWER_PROPS = NP({ LookVector: 'lookVector', RightVector: 'rightVector', UpVector: 'upVector', Magnitude: 'magnitude', Unit: 'unit', Connected: 'connected', XVector: 'XVector', YVector: 'YVector', ZVector: 'ZVector' });
  const CF_PROPS = NP({ Position: 'p', Rotation: 'Rotation' });   // only on things named like a CFrame
  const KNOWN_SERVICES = words(`Workspace Players Lighting ReplicatedStorage ReplicatedFirst ServerStorage ServerScriptService StarterGui
    StarterPack StarterPlayer Teams SoundService Chat RunService UserInputService ContextActionService Debris CollectionService
    PhysicsService MarketplaceService TeleportService TextService HttpService PathfindingService DataStoreService InsertService
    BadgeService GamePassService GuiService ContentProvider KeyframeSequenceProvider AssetService PointsService TestService LogService
    JointsService FriendService Selection ChangeHistoryService NetworkClient NetworkServer ScriptContext CoreGui Visit
    NotificationService LuaWebService AdService`);
  const MODERN_CLASSES = words(`UICorner UIStroke UIGradient UIListLayout UIGridLayout UIPadding UIScale UIAspectRatioConstraint
    UISizeConstraint UITextSizeConstraint UIPageLayout UITableLayout UIFlexItem WeldConstraint RigidConstraint NoCollisionConstraint
    AlignPosition AlignOrientation LinearVelocity AngularVelocity VectorForce Torque LineForce ProximityPrompt Highlight Beam Trail
    Actor WorldModel ViewportFrame CanvasGroup VideoFrame Atmosphere Clouds BloomEffect BlurEffect ColorCorrectionEffect SunRaysEffect
    DepthOfFieldEffect SurfaceAppearance MaterialVariant Bone HumanoidDescription UnreliableRemoteEvent TextChatCommand
    PathfindingModifier PathfindingLink DragDetector AudioPlayer AudioEmitter AudioListener`);
  const GUI_CLASSES = words('UIListLayout UIGridLayout UICorner UIStroke UIGradient UIPadding UIScale UIAspectRatioConstraint UISizeConstraint UITextSizeConstraint');
  // Name.member -> GNCompat's (true = every member)
  const GLOBAL_TABLES = NP({
    TweenInfo: true, NumberRange: true, NumberSequence: true, ColorSequence: true, NumberSequenceKeypoint: true, ColorSequenceKeypoint: true,
    Random: true, DateTime: true, Font: true, RaycastParams: true, OverlapParams: true,
    CFrame: words('lookAt lookAlong fromOrientation fromEulerAnglesYXZ fromEulerAngles fromMatrix fromAxisAngle'),
    Color3: words('fromHSV toHSV fromHex'), UDim2: words('fromScale fromOffset'),
  });
  // libraries the script gets a local copy of
  const LIBS = NP({ task: true, utf8: true, bit32: true, math: words('clamp sign round log'), table: words('find clear create pack move clone freeze isfrozen unpack'), string: words('split'), os: words('clock date') });
  const CONSTS = NP({
    'Vector3.zero': 'Vector3.new(0,0,0)', 'Vector3.one': 'Vector3.new(1,1,1)', 'Vector3.xAxis': 'Vector3.new(1,0,0)', 'Vector3.yAxis': 'Vector3.new(0,1,0)', 'Vector3.zAxis': 'Vector3.new(0,0,1)',
    'Vector2.zero': 'Vector2.new(0,0)', 'Vector2.one': 'Vector2.new(1,1)', 'Vector2.xAxis': 'Vector2.new(1,0)', 'Vector2.yAxis': 'Vector2.new(0,1)', 'CFrame.identity': 'CFrame.new()',
  });
  // Enum types and items 2016 doesn't have (from probing the engine)
  const ENUM_MISSING_TYPES = words(`RaycastFilterType ZIndexBehavior AutomaticSize FillDirection HorizontalAlignment VerticalAlignment SortOrder
    StartCorner PlaybackState ProximityPromptStyle ProximityPromptExclusivity ProximityPromptInputType ApplyStrokeMode LineJoinMode AspectType
    DominantAxis TextTruncate HighlightDepthMode Technology ThumbnailType ThumbnailSize ContextActionResult ActuatorRelativeTo
    ConstraintPriority PathWaypointAction Limb RenderFidelity ResamplerMode ScreenOrientation SelectionBehavior ElasticBehavior
    ScrollingDirection ScrollBarInset AssetType AnimationPlaybackState KeyInterpolationMode DataStoreRequestType TeleportResult
    ResizeIncrement ZoomPanDirection FontWeight FontStyle VelocityConstraintMode ActuatorType PositionAlignmentMode
    OrientationAlignmentMode ForceLimitMode RaycastFilterType ScreenInsets SafeAreaCompatibility TextChatMessageStatus
    ChatVersion UIFlexMode ItemLineAlignment UIFlexAlignment AnimationPriority2 CollisionFidelity2`);
  const ENUM_MISSING_ITEMS = NP({
    EasingStyle: words('Exponential Circular Cubic'), CoreGuiType: words('EmotesMenu SelfView Captures'), UserInputType: words('InputMethod'),
  });
  const ENUM_MAP = NP({
    'ScaleType.Fit': 'Stretch', 'ScaleType.Crop': 'Stretch', 'ScaleType.Tile': 'Stretch', 'CameraType.Orbital': 'Custom',
    'AnimationPriority.Action2': 'Action', 'AnimationPriority.Action3': 'Action', 'AnimationPriority.Action4': 'Action',
  });
  const FONTS_2016 = words('Legacy Arial ArialBold SourceSans SourceSansBold SourceSansLight SourceSansItalic');
  const fontFor = name => /Italic/.test(name) ? 'SourceSansItalic' : /Light|Thin/.test(name) ? 'SourceSansLight'
    : /Bold|Black|Heavy|Semi|Bangers|Creepster|Fredoka|Luckiest|Marker|Arcade|SciFi|Cartoon|Fantasy|Michroma|Sarpanch|Denk/.test(name) ? 'SourceSansBold'
    : /Bodoni|Garamond|Antique|Merriweather|Arimo/.test(name) ? 'Arial' : 'SourceSans';
  const MATERIALS_2016 = words(`Plastic SmoothPlastic Neon Wood WoodPlanks Marble Slate Concrete Granite Brick Pebble Cobblestone
    CorrodedMetal DiamondPlate Foil Metal Grass Sand Fabric Ice Air Water Rock Glacier Snow Sandstone Mud Basalt Ground CrackedLava`);
  const MATERIAL_MAP = NP({ Glass: 'SmoothPlastic', ForceField: 'SmoothPlastic', Asphalt: 'Slate', LeafyGrass: 'Grass', Salt: 'Sand',
    Limestone: 'Concrete', Pavement: 'Concrete', Cardboard: 'Wood', Carpet: 'Fabric', CeramicTiles: 'Marble', ClayRoofTiles: 'Brick',
    RoofShingles: 'Slate', Leather: 'Fabric', Plaster: 'SmoothPlastic', Rubber: 'Plastic' });

  const sig = t => t.t !== 'ws' && t.t !== 'nl' && t.t !== 'com';
  const BINOPS = new Set(['+', '-', '*', '/', '%', '^', '..', '==', '~=', '<', '>', '<=', '>=', 'and', 'or', '//']);
  const STMT_START = new Set(['local', 'return', 'if', 'for', 'while', 'repeat', 'do', 'function', 'end', 'else', 'elseif', 'until', 'break']);

  function convert(src) {
    if (typeof src !== 'string' || !src || src.startsWith('--[[GN-BLOX converted]]') || /^--![^\n]*\n--\[\[GN-BLOX converted\]\]/.test(src)) return { code: src, changed: false, notes: [] };
    const used = new Set(), libs = new Set(), notes = new Set();
    const r = core(src, used, libs, notes);
    if (!r.changed && !used.size && !libs.size) return { code: src, changed: false, notes: [] };
    // things 2016 scripts do too (Tool.Enabled, part.Position = ..., v.Unit): only worth it in a script that's newer anyway
    if (!libs.size && [...notes].every(n => WEAK.has(n))) return { code: src, changed: false, notes: [] };
    for (const l of libs) { used.add(l); notes.add(l === 'typeof' ? 'typeof' : l + ' library'); }
    const locals = [...new Set([...libs, ...[...used].filter(u => LIBS[u] || u === 'typeof')])];
    let prelude = '--[[GN-BLOX converted]]';
    if (used.size) {
      prelude += ' local __gn=require(game:GetService("ReplicatedFirst"):FindFirstChild("GNCompat"))';
      if (locals.length) prelude += ' local ' + locals.join(',') + '=' + locals.map(l => '__gn.' + l).join(',');
    }
    // keep a leading --!strict / --!nonstrict line where it is
    const body = r.code;
    const m = /^(--![^\n]*\n)/.exec(body);
    const code = m ? m[1] + prelude + ' ' + body.slice(m[1].length) : prelude + ' ' + body;
    return { code, changed: true, needsCompat: used.size > 0, notes: [...notes], used: [...used] };
  }

  // the conversion itself; inner(text) converts a piece of code a rewrite takes in, the same way
  function core(src, used, libs, notes, isExpr) {
    const inner = expr => { const r = core(expr, used, libs, notes, true); return r.changed ? r.code : expr; };
    let toks = tokenize(src);
    // positions of significant tokens
    const S = () => { const s = []; toks.forEach((t, i) => { if (sig(t)) s.push(i); }); return s; };
    // source text of tokens a..b-1 on one line, without comments (rewritten code keeps its line count)
    const text = (a, b) => toks.slice(a, b).map(t => t.t === 'nl' || t.t === 'com' ? ' ' : t.v).join('');
    const keep = t => t.v !== '' || t.t === 'nl' || t.before || t.after;
    const out = () => toks.map(t => (t.before || '') + t.v + (t.after || '')).join('');
    const nlBetween = (a, b) => { for (let k = a + 1; k < b; k++) if (toks[k].t === 'nl' || (toks[k].t === 'com' && toks[k].v.includes('\n'))) return true; return false; };
    let changed = false;
    const set = (i, v, open) => { const o = toks[i]; toks[i] = { t: 'raw', v, open: !!open, before: o.before, after: o.after }; changed = true; };
    // empty a token that a rewrite took in, keeping its line breaks
    const blank = x => {
      const t = toks[x];
      if (t.t === 'nl') return;
      const nls = t.v.replace(/[^\n]/g, '');
      toks[x] = nls ? { t: 'nl', v: nls, before: t.before, after: t.after } : { t: 'raw', v: '', before: t.before, after: t.after };
      changed = true;
    };

    // 1. numbers with _ or 0b
    for (const t of toks) if (t.t === 'num') {
      let v = t.v;
      if (v.includes('_')) v = v.replace(/_/g, '');
      if (/^0[bB]/.test(v)) v = String(parseInt(v.slice(2), 2));
      if (v !== t.v) { t.v = v; changed = true; notes.add('numbers'); }
    }
    // 2. interpolated strings
    for (let i = 0; i < toks.length; i++) if (toks[i].t === 'istr') {
      const bits = [];
      for (const p of toks[i].parts) {
        if (p.lit != null) { if (p.lit) bits.push('"' + p.lit.replace(/\\([{}`])/g, '$1').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'); }
        else bits.push('tostring(' + inner(p.expr) + ')');
      }
      set(i, '(' + (bits.length ? bits.join(' .. ') : '""') + ')');
      notes.add('`strings`');
    }

    // 3. type annotations
    let s = S();
    const tk = k => toks[s[k]];
    const val = k => { if (k < 0 || k >= s.length) return ''; const t = toks[s[k]]; return t.open ? '(' : t.v; };
    const skipType = k => {   // index (in s) just past a type expression starting at k
      const simple = k => {
        let v = val(k);
        if (v === '...') return simple(k + 1);
        if (v === '(' || v === '{' || v === '<') {
          const close = { '(': ')', '{': '}', '<': '>' }[v];
          let d = 0, j = k;
          for (; j < s.length; j++) { const w = val(j); if (w === v) d++; else if (w === close) { d--; if (!d) break; } }
          k = j + 1;
          if (v === '<' && val(k) === '(') return simple(k);
          if (val(k) === '->') return skipType(k + 1);
          return k;
        }
        if (tk(k) && (tk(k).t === 'name' || tk(k).t === 'kw' || tk(k).t === 'str')) {
          k++;
          while (val(k) === '.' && tk(k + 1) && tk(k + 1).t === 'name') k += 2;
          if (val(k) === '...') k++;
          if (val(k) === '<') { let d = 0, j = k; for (; j < s.length; j++) { if (val(j) === '<') d++; else if (val(j) === '>') { d--; if (!d) break; } } k = j + 1; }
          if (val(k - 1) === 'typeof' && val(k) === '(') { let d = 0, j = k; for (; j < s.length; j++) { if (val(j) === '(') d++; else if (val(j) === ')') { d--; if (!d) break; } } k = j + 1; }
          return k;
        }
        return k + 1;
      };
      while (val(k) === '|' || val(k) === '&') k++;
      k = simple(k);
      for (;;) {
        while (val(k) === '?') k++;
        if (val(k) === '|' || val(k) === '&') { k = simple(k + 1); continue; }
        return k;
      }
    };
    const remove = (a, b) => { if (a >= b) return; for (let x = s[a]; x < (b < s.length ? s[b] : toks.length); x++) if (toks[x].t !== 'ws') blank(x); notes.add('types'); };
    for (let k = 0; k < s.length; k++) {
      const atStmt = k === 0 || STMT_START.has(val(k - 1)) || nlBetween(s[k - 1], s[k]) || val(k - 1) === ';';
      // @native / @checked function attributes
      if (val(k) === '@' && tk(k + 1) && tk(k + 1).t === 'name' && atStmt) { blank(s[k]); blank(s[k + 1]); notes.add('attributes'); k++; continue; }
      // const x = ... (Luau, 2025) is a local
      if (val(k) === 'const' && tk(k).t === 'name' && tk(k + 1) && (tk(k + 1).t === 'name' || val(k + 1) === 'function') && atStmt) { set(s[k], 'local'); toks[s[k]].t = 'kw'; notes.add('const'); }
      const v = val(k), t = tk(k);
      // type X = ... / export type X = ...
      if (t.t === 'name' && (v === 'type' || (v === 'export' && val(k + 1) === 'type')) && (k === 0 || STMT_START.has(val(k - 1)) || nlBetween(s[k - 1], s[k]) || val(k - 1) === ';')) {
        const nameAt = v === 'export' ? k + 2 : k + 1;
        if (tk(nameAt) && tk(nameAt).t === 'name' && (val(nameAt + 1) === '=' || val(nameAt + 1) === '<')) {
          let j = nameAt + 1;
          if (val(j) === '<') { let d = 0; for (; j < s.length; j++) { if (val(j) === '<') d++; else if (val(j) === '>') { d--; if (!d) break; } } j++; }
          j = skipType(j + 1);
          remove(k, j);
          k = j - 1;
          continue;
        }
      }
      // local a: T, b: U
      if (v === 'local' && tk(k + 1) && tk(k + 1).t === 'name') {
        let j = k + 1;
        while (tk(j) && tk(j).t === 'name') {
          if (val(j + 1) === ':') { const e = skipType(j + 2); remove(j + 1, e); j = e; } else j++;
          if (val(j) === '<' && val(j + 2) === '>') { remove(j, j + 3); j += 3; }   // <const> / <close> attributes
          if (val(j) === ',') { j++; continue; }
          break;
        }
        continue;
      }
      // function f<T>(a: T, ...: any): R
      if (v === 'function') {
        let j = k + 1;
        while (tk(j) && (tk(j).t === 'name' || val(j) === '.' || val(j) === ':') && val(j) !== '(') j++;
        if (val(j) === '<') { let d = 0, e = j; for (; e < s.length; e++) { if (val(e) === '<') d++; else if (val(e) === '>') { d--; if (!d) break; } } remove(j, e + 1); j = e + 1; }
        if (val(j) !== '(') continue;
        j++;
        while (j < s.length && val(j) !== ')') {
          if ((tk(j).t === 'name' || val(j) === '...') && val(j + 1) === ':') { const e = skipType(j + 2); remove(j + 1, e); j = e; continue; }
          j++;
        }
        if (val(j + 1) === ':') { const e = skipType(j + 2); remove(j + 1, e); }
        continue;
      }
      // for i: number = ... / for k: string, v: T in ...
      if (v === 'for') {
        let j = k + 1;
        while (tk(j) && tk(j).t === 'name') {
          if (val(j + 1) === ':') { const e = skipType(j + 2); remove(j + 1, e); j = e; } else j++;
          if (val(j) === ',') { j++; continue; }
          break;
        }
        continue;
      }
      // expr :: Type
      if (v === '::') { const e = skipType(k + 1); remove(k, e); k = e - 1; continue; }
    }

    // 4. if-then-else expressions: x = if c then a else b  (c, a, b without nested statements)
    toks = toks.filter(keep);
    s = S();
    // where an if is an expression: after an operator, or as a condition (if if a then b else c then ...);
    // after then / else it's one only inside another if-expression (checked below: no end after it)
    const exprPos = k => { if (k === 0 && isExpr) return true; const p = val(k - 1); return ['=', '(', ',', 'return', '{', '[', '..', 'and', 'or', 'not', '+', '-', '*', '/', '==', '~=', '<', '>', '<=', '>=', 'if', 'elseif', 'while', 'until'].includes(p) || BINOPS.has(p); };
    const maybeExprPos = k => ['then', 'else'].includes(val(k - 1));
    for (let k = s.length - 1; k >= 0; k--) {
      const ambiguous = val(k) === 'if' && !exprPos(k) && maybeExprPos(k);
      if (val(k) !== 'if' || (!exprPos(k) && !ambiguous)) continue;
      // find then/else/elseif at depth 0, end of the expression
      let depth = 0, j = k + 1, start = k + 1, kind = 'cond';
      const segs = [];
      for (; j < s.length; j++) {
        const w = val(j);
        if (w === '(' || w === '{' || w === '[') depth++;
        else if (w === ')' || w === '}' || w === ']') { if (!depth) break; depth--; }
        else if (!depth && kind === 'else' && (w === 'then' || w === 'else' || w === 'elseif')) break;
        else if (!depth && (w === 'then' || w === 'else' || w === 'elseif')) { segs.push([kind, start, j]); kind = w; start = j + 1; continue; }
        else if (!depth && kind === 'else' && j > start && (w === ',' || w === ';' || STMT_START.has(w) || (nlBetween(s[j - 1], s[j]) && !BINOPS.has(val(j - 1)) && !BINOPS.has(w) && w !== '.' && w !== ':'))) break;
      }
      segs.push([kind, start, j]);
      if (!segs.some(x => x[0] === 'else')) continue;
      // after then / else: an if statement (ends with end, or has assignments) stays one
      if (ambiguous) {
        if (['end', 'for', 'while', 'do', 'repeat', 'local', 'return', 'if', 'function', 'break'].includes(val(j))) continue;
        if (segs.some(sg => sg[2] <= sg[1])) continue;
        if (segs.some(sg => sg[0] !== 'cond' && ['for', 'while', 'do', 'repeat', 'local', 'return', 'if', 'function', 'break', 'end'].includes(val(sg[1])))) continue;
        let stmt = false;
        for (const sg of segs) { let d = 0; for (let x = sg[1]; x < sg[2]; x++) { const w = val(x); if (w === '(' || w === '{' || w === '[') d++; else if (w === ')' || w === '}' || w === ']') d--; else if (!d && (w === '=' || w === 'local' || w === 'return' || w === 'end')) stmt = true; } }
        if (stmt) continue;
      }
      const code = x => inner(text(s[x[1]], x[2] < s.length ? s[x[2]] : toks.length).trim());
      // if c1 then a elseif c2 then b else z  ->  ((c1) and {(a)} or (c2) and {(b)} or {(z)})[1]
      // (each value sits in a table, so a false or nil value still counts, and only one side runs)
      let out = '';
      for (const sg of segs) {
        if (sg[0] === 'cond' || sg[0] === 'elseif') out += '(' + code(sg) + ') and ';
        else if (sg[0] === 'then') out += '{(' + code(sg) + ')} or ';
        else out += '{(' + code(sg) + ')}';
      }
      const endTok = j < s.length ? s[j] : toks.length;
      for (let x = s[k]; x < endTok; x++) blank(x);
      set(s[k], '((' + out + ')[1])');
      notes.add('if-expressions');
      toks = toks.filter(keep);
      s = S();
    }

    // 5. compound assignment and //
    s = S();
    const suffixedStart = k => {   // index (in s) where the expression ending at k begins
      let j = k;
      for (;;) {
        const w = val(j);
        if (w === ')' || w === ']' || w === '}') {
          const open = { ')': '(', ']': '[', '}': '{' }[w];
          let d = 0;
          for (; j >= 0; j--) { if (val(j) === w) d++; else if (val(j) === open) { d--; if (!d) break; } }
          if (j >= 0 && tk(j) && tk(j).open) return j;
          if (open === '{' || open === '(') { if (j > 0 && (tk(j - 1).t === 'name' || [')', ']'].includes(val(j - 1)) || tk(j - 1).t === 'str' || (tk(j - 1).t === 'raw' && tk(j - 1).v))) { j--; continue; } return j; }
          j--; continue;
        }
        if (tk(j) && (tk(j).t === 'name' || tk(j).t === 'str' || tk(j).t === 'raw')) {
          if (j > 0 && (val(j - 1) === '.' || val(j - 1) === ':')) { j -= 2; continue; }
          return j;
        }
        if (tk(j) && tk(j).t === 'num') return j;
        return j + 1;
      }
    };
    const blockEnd = k => {   // s index of the 'end' closing the function/if/do/repeat block opened at k
      let d = 0;
      for (let j = k; j < s.length; j++) {
        if (tk(j).t !== 'kw') continue;
        const x = val(j);
        if (x === 'function' || x === 'if' || x === 'do' || x === 'repeat') d++;
        else if (x === 'end' || x === 'until') { d--; if (!d) return j; }
      }
      return s.length - 1;
    };
    const UNARY = new Set(['-', 'not', '#']);
    const operandEnd = k => {   // s index just past one operand (unary ops, a value and its suffixes, and ^)
      let j = k;
      while (UNARY.has(val(j))) j++;
      const w = val(j);
      if (w === 'function') j = blockEnd(j) + 1;
      else if (w === '(' || w === '{') { let d = 0; for (; j < s.length; j++) { if (val(j) === '(' || val(j) === '{' || val(j) === '[') d++; else if (val(j) === ')' || val(j) === '}' || val(j) === ']') { d--; if (!d) break; } } j++; }
      else j++;
      for (;;) {
        const x = val(j);
        if ((x === '.' || x === ':') && tk(j + 1) && tk(j + 1).t === 'name') { j += 2; continue; }
        if (x === '[' || x === '(' || x === '{') { let d = 0; for (; j < s.length; j++) { if (['(', '{', '['].includes(val(j))) d++; else if ([')', '}', ']'].includes(val(j))) { d--; if (!d) break; } } j++; continue; }
        if (tk(j) && tk(j).t === 'str' && !nlBetween(s[j - 1], s[j])) { j++; continue; }
        if (x === '^') { j = operandEnd(j + 1); continue; }
        return j;
      }
    };
    const operandStart = k => {   // s index where the operand ending at k starts (for the left side of //)
      let j = suffixedStart(k);
      if (tk(k) && tk(k).t === 'num' && j > k) j = k;
      while (j > 0 && UNARY.has(val(j - 1)) && (j < 2 || BINOPS.has(val(j - 2)) || ['=', '(', ',', 'return', '{', '['].includes(val(j - 2)))) j--;
      return j;
    };
    // (rewritten code is raw text: a non-empty raw token is a whole expression or statement; empty ones are gaps)
    const prevSig = j => { let i = j - 1; while (i >= 0 && tk(i).t === 'raw' && tk(i).v === '' && !tk(i).before && !tk(i).after) i--; return i; };
    const startsWord = j => tk(j).t === 'name' || (tk(j).t === 'raw' && tk(j).v !== '' && !tk(j).open);
    const endsValue = i => {
      if (i < 0) return false;
      const t = tk(i);
      return t.t === 'name' || t.t === 'num' || t.t === 'str' || (t.t === 'raw' && t.v !== '' && !t.open) || [')', ']', '}', 'true', 'false', 'nil', 'end', '...'].includes(val(i));
    };
    const exprEnd = k => {   // index (in s) just past the expression starting at k
      let d = 0, j = k;
      for (; j < s.length; j++) {
        const w = val(j);
        if (w === '(' || w === '{' || w === '[') d++;
        else if (w === ')' || w === '}' || w === ']') { if (!d) return j; d--; }
        else if (w === 'function') {
          // an anonymous function inside the expression, or the next statement
          const pv = val(j - 1), pt = tk(j - 1);
          if (j > k && (pt.t === 'name' || pt.t === 'num' || pt.t === 'str' || pt.t === 'raw' || [')', ']', '}', 'end', 'true', 'false', 'nil', '...'].includes(pv))) return j;
          j = blockEnd(j); continue;
        }
        if (d) continue;
        if (j > k && (w === ';' || w === ',' || (tk(j).t === 'kw' && STMT_START.has(w)))) return j;
        if (j > k && nlBetween(s[j - 1], s[j]) && !BINOPS.has(val(prevSig(j))) && !['(', ',', '{', '[', '=', 'not', '-'].includes(val(prevSig(j))) && !BINOPS.has(w) && w !== '.' && w !== ':') return j;
        if (j > k && startsWord(j) && endsValue(prevSig(j))) return j;
      }
      return j;
    };
    for (let k = s.length - 1; k >= 0; k--) {
      const v = val(k);
      const m = /^(\.\.|\/\/|[-+*/%^])=$/.exec(v);
      if (m && tk(k).t === 'op') {
        const a = suffixedStart(k - 1), e = exprEnd(k + 1);
        const lhs = inner(text(s[a], s[k]).trim()), rhs = inner(text(s[k + 1], e < s.length ? s[e] : toks.length));
        const rhsTrim = rhs.replace(/\s+$/, ''), tail = rhs.slice(rhsTrim.length);
        const op = m[1];
        const expr = op === '//' ? 'math.floor(' + lhs + ' / (' + rhsTrim.trim() + '))' : lhs + ' ' + op + ' (' + rhsTrim.trim() + ')';
        for (let x = s[a]; x < (e < s.length ? s[e] : toks.length); x++) blank(x);
        set(s[a], lhs + ' = ' + expr + tail.replace(/[^\n]/g, ''));
        notes.add('compound assignment');
        k = a;
      } else if (v === '//' && tk(k).t === 'op') {
        const a = operandStart(k - 1), e = operandEnd(k + 1);
        let L = text(s[a], s[k]).trim(), Rr = text(s[k + 1], e < s.length ? s[e] : toks.length).trim();
        if (!L || !Rr) continue;
        L = inner(L); Rr = inner(Rr);
        for (let x = s[a]; x < (e < s.length ? s[e] : toks.length); x++) blank(x);
        set(s[a], 'math.floor((' + L + ') / (' + Rr + '))');
        notes.add('//');
        k = a;
      }
    }
    toks = toks.filter(keep);
    s = S();

    // 6. continue (Luau): loops that use it get a repeat ... until true body
    const blocks = [];          // stack of { kind, open (s index), loop }
    const loops = [];           // { doAt, endAt, conts: [], breaks: [], kind }
    let pendingLoop = 0;
    for (let k = 0; k < s.length; k++) {
      const v = val(k), t = tk(k);
      if (t.t === 'kw') {
        if (v === 'for' || v === 'while') pendingLoop++;
        else if (v === 'do') { if (pendingLoop) { pendingLoop--; const L = { doAt: k, conts: [], breaks: [], kind: 'loop' }; loops.push(L); blocks.push({ kind: 'loop', L }); } else blocks.push({ kind: 'do' }); }
        else if (v === 'if') blocks.push({ kind: 'if' });
        else if (v === 'function') blocks.push({ kind: 'function' });
        else if (v === 'repeat') { const L = { doAt: k, conts: [], breaks: [], kind: 'repeat' }; loops.push(L); blocks.push({ kind: 'loop', L }); }
        else if (v === 'end' || v === 'until') { const b = blocks.pop(); if (b && b.L) b.L.endAt = k; }
        else if (v === 'break') { for (let q = blocks.length - 1; q >= 0; q--) { if (blocks[q].kind === 'function') break; if (blocks[q].L) { blocks[q].L.breaks.push(k); break; } } }
      } else if (t.t === 'name' && v === 'continue') {
        const nx = val(k + 1), pv = val(k - 1);
        const stmt = (k + 1 >= s.length || ['end', 'else', 'elseif', 'until', ';'].includes(nx) || (tk(k + 1) && tk(k + 1).t === 'kw' && STMT_START.has(nx)) || nlBetween(s[k], s[k + 1])) && !['.', ':', 'local', '=', ',', '(', 'function'].includes(pv) && nx !== '=' && nx !== '(' && nx !== '.';
        if (stmt) for (let q = blocks.length - 1; q >= 0; q--) { if (blocks[q].kind === 'function') break; if (blocks[q].L) { blocks[q].L.conts.push(k); break; } }
      }
    }
    for (const L of loops) {
      if (!L.conts.length || L.endAt == null) continue;
      const flag = L.breaks.length > 0;
      // (added around the loop's own tokens, so later steps still see do / end)
      for (const c of L.conts) { set(s[c], 'break'); toks[s[c]].t = 'kw'; }
      for (const b of L.breaks) toks[s[b]].before = '__gnBreak=true ' + (toks[s[b]].before || '');
      const openTok = toks[s[L.doAt]];
      openTok.after = (flag ? ' local __gnBreak=false' : '') + ' repeat ' + (openTok.after || '');
      const endTok = toks[s[L.endAt]];
      endTok.before = 'until true ' + (flag ? 'if __gnBreak then break end ' : '') + (endTok.before || '');
      changed = true;
      notes.add('continue');
    }
    toks = toks.filter(keep);
    s = S();

    // 7. generic for over anything: for k, v in t do  ->  for k, v in __gn.iter(t) do
    for (let k = 0; k < s.length; k++) {
      if (val(k) !== 'for' || tk(k).t !== 'kw') continue;
      let j = k + 1;
      while (j < s.length && val(j) !== 'in' && val(j) !== '=' && val(j) !== 'do') j++;
      if (val(j) !== 'in') continue;
      let d = 0, e = j + 1, comma = false;
      for (; e < s.length; e++) { const w = val(e); if (w === '(' || w === '{' || w === '[') d++; else if (w === ')' || w === '}' || w === ']') d--; else if (!d && w === ',') comma = true; else if (!d && w === 'do') break; }
      if (e >= s.length || comma) continue;
      const exprText = text(s[j + 1], s[e]).trim();
      if (/^(pairs|ipairs|next)\s*\(/.test(exprText) || /[.:]gmatch\s*\(/.test(exprText) || /^__gn\.iter\(/.test(exprText)) continue;
      toks[s[j + 1]].before = '__gn.iter(' + (toks[s[j + 1]].before || '');
      toks[s[e - 1]].after = (toks[s[e - 1]].after || '') + ')';
      changed = true;
      used.add('iter');
      notes.add(/\)\s*$/.test(exprText) ? 'generic-for-call' : 'generic for');
    }
    s = S();

    // 8. library differences: everything newer than 2016 goes through __gn (scripts/GNCompat.lua)
    const G = name => { used.add(name); return '__gn.' + name; };
    // where the expression ending at s-index k starts, and whether it's the name of a function being defined
    const objStart = k => suffixedStart(k);
    const isDefinition = a => val(a - 1) === 'function';
    // replace obj:Name<args> with fn(obj, extra..., args)
    const rewriteCall = (k, fn, extra) => {
      const a = objStart(k - 2);
      if (a > k - 2 || isDefinition(a)) return false;
      const obj = text(s[a], s[k - 1]).trim();
      if (!obj || /^[.:]/.test(obj)) return false;   // (the object was already rewritten into something else this pass)
      const nx = val(k + 1), nt = tk(k + 1);
      const head = fn + '(' + obj + (extra ? ', ' + extra : '');
      if (nx === '(') {
        const empty = val(k + 2) === ')';
        for (let x = s[a]; x <= s[k]; x++) blank(x);
        set(s[k + 1], head + (empty ? '' : ', '), true);
        return true;
      }
      if (nt && nt.t === 'str') {
        for (let x = s[a]; x <= s[k]; x++) blank(x);
        set(s[k + 1], head + ', ' + toks[s[k + 1]].v + ')');
        return true;
      }
      if (nx === '{') {
        let d = 0, e = k + 1;
        for (; e < s.length; e++) { if (val(e) === '{') d++; else if (val(e) === '}') { d--; if (!d) break; } }
        for (let x = s[a]; x <= s[k]; x++) blank(x);
        set(s[k + 1], head + ', {', true);
        set(s[e], '})');
        return true;
      }
      return false;
    };
    const assignAt = k => {   // obj.P = ... as a statement: s-index of '=' or -1
      if (val(k + 1) !== '=' || tk(k + 1).t !== 'op') return -1;
      const a = objStart(k - 2);
      const before = val(a - 1);
      if (before === ',' || before === 'local' || before === '.' || before === ':') return -1;
      return k + 1;
    };
    for (let k = 0; k < s.length; k++) {
      const v = val(k), t = tk(k);
      if (t.t !== 'name') continue;
      const p = val(k - 1), nx = val(k + 1);
      // ---- methods
      if (p === ':' && (nx === '(' || nx === '{' || (tk(k + 1) && tk(k + 1).t === 'str'))) {
        if (LOWER_METHODS[v]) { if (rewriteCall(k, G('lc'), '"' + v + '", "' + LOWER_METHODS[v] + '"')) notes.add(':' + v); continue; }
        if (CALL_METHODS.has(v) || (v === 'LoadAnimation' && /animator/i.test(text(s[objStart(k - 2)], s[k - 1])))) {
          if (rewriteCall(k, G('call'), '"' + v + '"')) notes.add(':' + v);
          continue;
        }
        if (SAFE_METHODS.has(v)) { if (rewriteCall(k, G('safe'), '"' + v + '"')) notes.add(':' + v); continue; }
        if (v === 'GetService' && nx === '(' && tk(k + 2) && tk(k + 2).t === 'str' && val(k + 3) === ')') {
          const name = val(k + 2).slice(1, -1);
          if (!KNOWN_SERVICES.has(name) && rewriteCall(k, G('service'))) notes.add(name);
          continue;
        }
        if ((v === 'FindFirstChild' || v === 'WaitForChild') && nx === '(' && tk(k + 2) && tk(k + 2).t === 'str' && val(k + 3) === ')' && GUI_CLASSES.has(val(k + 2).slice(1, -1))) {
          const a = objStart(k - 2);
          if (a <= k - 2 && !isDefinition(a)) {
            const obj = text(s[a], s[k - 1]).trim();
            const childName = val(k + 2);   // (read before the tokens are blanked)
            let e = k + 2; while (e < s.length && val(e) !== ')') e++;
            for (let x = s[a]; x <= s[e]; x++) blank(x);
            set(s[a], G('child') + '(' + obj + ', ' + childName + ', "' + (v === 'FindFirstChild' ? 'find' : 'wait') + '")');
            notes.add('newer GUI objects');
          }
          continue;
        }
        continue;
      }
      // ---- properties
      if (p === '.' && tk(k - 2) && tk(k - 2).t !== 'kw') {
        const a = objStart(k - 2);
        if (a > k - 2 || isDefinition(a) || val(a - 1) === 'function') continue;
        const obj = text(s[a], s[k - 1]).trim();
        if (/^(Enum|math|table|string|os|utf8|bit32|task|coroutine|debug|_G|shared|script)$/.test(obj)) { /* handled below */ }
        else {
          const asg = assignAt(k);
          const cfLike = /(CFrame|[Cc][Ff]\w*|[Pp]ivot\(\)|[Pp]ivot)$/.test(obj);
          let prop = NEW_PROPS.has(v) ? v : null;
          if (!prop && asg >= 0 && (v === 'Position' || v === 'Size')) {
            const e = exprEnd(asg + 1), rhs = text(s[asg + 1], e < s.length ? s[e] : toks.length);
            if (/UDim2/.test(rhs) && !/\.(Position|Size)\b/.test(rhs)) prop = v;
          }
          if (!prop && asg >= 0) {
            const e = exprEnd(asg + 1), rhs = text(s[asg + 1], e < s.length ? s[e] : toks.length);
            if (/\b(NumberSequence|ColorSequence|NumberRange)\b/.test(rhs)) prop = v;
          }
          if (prop && asg >= 0) {
            const e = exprEnd(asg + 1);
            const rhs = text(s[asg + 1], e < s.length ? s[e] : toks.length);
            const rt = inner(rhs.trim()), tail = '';
            for (let x = s[a]; x < (e < s.length ? s[e] : toks.length); x++) blank(x);
            set(s[a], G('set') + '(' + obj + ', "' + v + '", ' + rt.trim() + ')' + tail.replace(/[^\n]/g, ''));
            notes.add('.' + v);
            k = e - 1;
            continue;
          }
          if (asg < 0 && (NEW_PROPS.has(v) || LOWER_PROPS[v] || (cfLike && CF_PROPS[v]))) {
            for (let x = s[a]; x <= s[k]; x++) blank(x);
            if (NEW_PROPS.has(v)) set(s[k], G('get') + '(' + obj + ', "' + v + '")');
            else set(s[k], G('lp') + '(' + obj + ', "' + v + '", "' + (LOWER_PROPS[v] || CF_PROPS[v]) + '")');
            notes.add('.' + v);
            continue;
          }
          continue;
        }
      }
      if (p === '.' || p === ':') continue;
      // ---- globals
      if (v === 'Enum' && nx === '.' && tk(k + 2) && tk(k + 2).t === 'name' && val(k + 3) === '.' && tk(k + 4) && (tk(k + 4).t === 'name' || tk(k + 4).t === 'kw')) {
        const T = val(k + 2), I = val(k + 4);
        const mapped = ENUM_MAP[T + '.' + I] || (T === 'Font' && !FONTS_2016.has(I) ? fontFor(I) : null) || (T === 'Material' && !MATERIALS_2016.has(I) ? (MATERIAL_MAP[I] || 'Plastic') : null);
        if (mapped) { set(s[k + 4], mapped); notes.add('newer ' + T + ' names'); continue; }
        if (ENUM_MISSING_TYPES.has(T) || (ENUM_MISSING_ITEMS[T] && ENUM_MISSING_ITEMS[T].has(I))) {
          for (let x = s[k]; x <= s[k + 4]; x++) blank(x);
          set(s[k], G('enum') + '("' + T + '", "' + I + '")');
          notes.add('Enum.' + T);
        }
        continue;
      }
      if (nx === '.' && GLOBAL_TABLES[v] && tk(k + 2)) {
        const member = val(k + 2);
        const full = v + '.' + member;
        if (CONSTS[full]) { set(s[k], CONSTS[full]); set(s[k + 1], ''); set(s[k + 2], ''); notes.add(full); continue; }
        if (GLOBAL_TABLES[v] === true || GLOBAL_TABLES[v].has(member)) { set(s[k], G(v)); notes.add(full); continue; }
        continue;
      }
      if (v === 'Instance' && nx === '.' && val(k + 2) === 'new' && val(k + 3) === '(' && tk(k + 4) && tk(k + 4).t === 'str' && MODERN_CLASSES.has(val(k + 4).slice(1, -1))) {
        set(s[k], G('new')); set(s[k + 1], ''); set(s[k + 2], '');
        notes.add(val(k + 4).slice(1, -1));
        continue;
      }
      if (LIBS[v] && nx === '.' && tk(k + 2) && (LIBS[v] === true || LIBS[v].has(val(k + 2)))) { libs.add(v); continue; }
      if (v === 'typeof' && nx === '(') { libs.add('typeof'); continue; }
    }

    return { code: changed ? out() : src, changed };
  }

  const API = { convert, tokenize };
  if (typeof module === 'object' && module.exports) module.exports = API;
  G.GNLuau = API;
})(typeof self !== 'undefined' ? self : this);
