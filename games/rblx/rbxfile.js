/* GN-BLOX place files: read any Roblox place or model (XML or binary, 2008 to today, LZ4 or Zstd
 * compressed), turn it into what the 2016 engine expects, and write the binary format it loads.
 *
 *   const doc = RBXFile.read(bytes)            // { roots: [Inst], insts: [Inst], meta, format }
 *   const notes = RBXFile.toEngine(doc, typemap, { safe })   // fixes it up in place
 *   const out = RBXFile.write(doc)             // Uint8Array, binary .rbxl
 *
 * The engine refuses a property whose binary type differs from the one it expects (tools/typemap.json
 * lists them, read out of its own places), can't read Zstd chunks, and reads XML very slowly. Newer
 * files also store part colors as exact RGB (Color3uint8) where the 2016 engine only has BrickColors,
 * use WeldConstraints, 64-bit IntValues, shared strings and other things it predates.
 *
 * Zstd needs vendor/fzstd.js loaded first (global fzstd). Studio (studio.html) uses this too. */
(function (G) {
  'use strict';
  const T = {
    String: 1, Bool: 2, Int: 3, Float: 4, Double: 5, UDim: 6, UDim2: 7, Ray: 8, Faces: 9, Axes: 10,
    BrickColor: 11, Color3: 12, Vector2: 13, Vector3: 14, Vector2int16: 15, CFrame: 16, Enum: 18, Ref: 19,
    Vector3int16: 20, NumberSequence: 21, ColorSequence: 22, NumberRange: 23, Rect: 24, PhysicalProperties: 25,
    Color3uint8: 26, Int64: 27, SharedString: 28, Bytecode: 29, OptionalCFrame: 30, UniqueId: 31, Font: 32,
    SecurityCapabilities: 33, Content: 34,
  };
  // types the 2016 engine can read (the newer ones get converted or dropped)
  const ENGINE_TYPES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 19, 20, 21, 22, 23, 24, 25]);

  // The 2016 engine's BrickColor palette: [number, 0xRRGGBB, name]
  const PALETTE = [
    [1,0xf2f3f3,"White"],[2,0xa1a5a2,"Grey"],[3,0xf9e999,"Light yellow"],[5,0xd7c59a,"Brick yellow"],
    [6,0xc2dab8,"Light green  Mint "],[9,0xe8bac8,"Light reddish violet"],[11,0x80bbdb,"Pastel Blue"],
    [12,0xcb8442,"Light orange brown"],[18,0xcc8e69,"Nougat"],[21,0xc4281c,"Bright red"],
    [22,0xc470a0,"Med  reddish violet"],[23,0x0d69ac,"Bright blue"],[24,0xf5cd30,"Bright yellow"],
    [25,0x624732,"Earth orange"],[26,0x1b2a35,"Black"],[27,0x6d6e6c,"Dark grey"],[28,0x287f47,"Dark green"],
    [29,0xa1c48c,"Medium green"],[36,0xf3cf9b,"Lig  Yellowich orange"],[37,0x4b974b,"Bright green"],
    [38,0xa05f35,"Dark orange"],[39,0xc1cade,"Light bluish violet"],[40,0xececec,"Transparent"],
    [41,0xcd544b,"Tr  Red"],[42,0xc1dff0,"Tr  Lg blue"],[43,0x7bb6e8,"Tr  Blue"],[44,0xf7f18d,"Tr  Yellow"],
    [45,0xb4d2e4,"Light blue"],[47,0xd9856c,"Tr  Flu  Reddish orange"],[48,0x84b68d,"Tr  Green"],
    [49,0xf8f184,"Tr  Flu  Green"],[50,0xece8de,"Phosph  White"],[100,0xeec4b6,"Light red"],
    [101,0xda867a,"Medium red"],[102,0x6e99ca,"Medium blue"],[103,0xc7c1b7,"Light grey"],
    [104,0x6b327c,"Bright violet"],[105,0xe29b40,"Br  yellowish orange"],[106,0xda8541,"Bright orange"],
    [107,0x008f9c,"Bright bluish green"],[108,0x685c43,"Earth yellow"],[110,0x435493,"Bright bluish violet"],
    [111,0xbfb7b1,"Tr  Brown"],[112,0x6874ac,"Medium bluish violet"],[113,0xe4adc8,"Tr  Medi  reddish violet"],
    [115,0xc7d23c,"Med  yellowish green"],[116,0x55a5af,"Med  bluish green"],[118,0xb7d7d5,"Light bluish green"],
    [119,0xa4bd47,"Br  yellowish green"],[120,0xd9e4a7,"Lig  yellowish green"],[121,0xe7ac58,"Med  yellowish orange"],
    [123,0xd36f4c,"Br  reddish orange"],[124,0x923978,"Bright reddish violet"],[125,0xeab892,"Light orange"],
    [126,0xa5a5cb,"Tr  Bright bluish violet"],[127,0xdcbc81,"Gold"],[128,0xae7a59,"Dark nougat"],
    [131,0x9ca3a8,"Silver"],[133,0xd5733d,"Neon orange"],[134,0xd8dd56,"Neon green"],[135,0x74869d,"Sand blue"],
    [136,0x877c90,"Sand violet"],[137,0xe09864,"Medium orange"],[138,0x958a73,"Sand yellow"],
    [140,0x203a56,"Earth blue"],[141,0x27462d,"Earth green"],[143,0xcfe2f7,"Tr  Flu  Blue"],
    [145,0x7988a1,"Sand blue metallic"],[146,0x958ea3,"Sand violet metallic"],[147,0x938767,"Sand yellow metallic"],
    [148,0x575857,"Dark grey metallic"],[149,0x161d32,"Black metallic"],[150,0xabadac,"Light grey metallic"],
    [151,0x789082,"Sand green"],[153,0x957977,"Sand red"],[154,0x7b2e2f,"Dark red"],[157,0xfff67b,"Tr  Flu  Yellow"],
    [158,0xe1a4c2,"Tr  Flu  Red"],[168,0x756c62,"Gun metallic"],[176,0x97695b,"Red flip flop"],
    [178,0xb48455,"Yellow flip flop"],[179,0x898788,"Silver flip flop"],[180,0xd7a94b,"Curry"],
    [190,0xf9d62e,"Fire Yellow"],[191,0xe8ab2d,"Flame yellowish orange"],[192,0x694028,"Reddish brown"],
    [193,0xcf6024,"Flame reddish orange"],[194,0xa3a2a5,"Medium stone grey"],[195,0x4667a4,"Royal blue"],
    [196,0x23478b,"Dark Royal blue"],[198,0x8e4285,"Bright reddish lilac"],[199,0x635f62,"Dark stone grey"],
    [200,0x828a5d,"Lemon metalic"],[208,0xe5e4df,"Light stone grey"],[209,0xb08e44,"Dark Curry"],
    [210,0x709578,"Faded green"],[211,0x79b5b5,"Turquoise"],[212,0x9fc3e9,"Light Royal blue"],
    [213,0x6c81b7,"Medium Royal blue"],[216,0x8f4c2a,"Rust"],[217,0x7c5c46,"Brown"],[218,0x96709f,"Reddish lilac"],
    [219,0x6b629b,"Lilac"],[220,0xa7a9ce,"Light lilac"],[221,0xcd6298,"Bright purple"],[222,0xe4adc8,"Light purple"],
    [223,0xdc9095,"Light pink"],[224,0xf0d5a0,"Light brick yellow"],[225,0xebb87f,"Warm yellowish orange"],
    [226,0xfdea8d,"Cool yellow"],[232,0x7dbbdd,"Dove blue"],[268,0x342b75,"Medium lilac"],[301,0x506d54,"Slime green"],
    [302,0x5b5d69,"Smoky grey"],[303,0x0010b0,"Dark blue"],[304,0x2c651d,"Parsley green"],[305,0x527cae,"Steel blue"],
    [306,0x335882,"Storm blue"],[307,0x102adc,"Lapis"],[308,0x3d1585,"Dark indigo"],[309,0x348e40,"Sea green"],
    [310,0x5b9a4c,"Shamrock"],[311,0x9fa1ac,"Fossil"],[312,0x592259,"Mulberry"],[313,0x1f801d,"Forest green"],
    [314,0x9fadc0,"Cadet blue"],[315,0x0989cf,"Electric blue"],[316,0x7b007b,"Eggplant"],[317,0x7c9c6b,"Moss"],
    [318,0x8aab85,"Artichoke"],[319,0xb9c4b1,"Sage green"],[320,0xcacbd1,"Ghost grey"],[321,0xa75e9b,"Lilac"],
    [322,0x7b2f7b,"Plum"],[323,0x94be81,"Olivine"],[324,0xa8bd99,"Laurel green"],[325,0xdfdfde,"Quill grey"],
    [327,0x970000,"Crimson"],[328,0xb1e5a6,"Mint"],[329,0x98c2db,"Baby blue"],[330,0xff98dc,"Carnation pink"],
    [331,0xff5959,"Persimmon"],[332,0x750000,"Maroon"],[333,0xefb838,"Gold"],[334,0xf8d96d,"Daisy orange"],
    [335,0xe7e7ec,"Pearl"],[336,0xc7d4e4,"Fog"],[337,0xff9494,"Salmon"],[338,0xbe6862,"Terra Cotta"],
    [339,0x562424,"Cocoa"],[340,0xf1e7c7,"Wheat"],[341,0xfef3bb,"Buttermilk"],[342,0xe0b2d0,"Mauve"],
    [343,0xd490bd,"Sunrise"],[344,0x965555,"Tawny"],[345,0x8f4c2a,"Rust"],[346,0xd3be96,"Cashmere"],
    [347,0xe2dcbc,"Khaki"],[348,0xedeaea,"Lily white"],[349,0xe9dada,"Seashell"],[350,0x883e3e,"Burgundy"],
    [351,0xbc9b5d,"Cork"],[352,0xc7ac78,"Burlap"],[353,0xcabfa3,"Beige"],[354,0xbbb3b2,"Oyster"],
    [355,0x6c584b,"Pine Cone"],[356,0xa0844f,"Fawn brown"],[357,0x958988,"Hurricane grey"],
    [358,0xaba89e,"Cloudy grey"],[359,0xaf9483,"Linen"],[360,0x966766,"Copper"],[361,0x564236,"Dirt brown"],
    [362,0x7e683f,"Bronze"],[363,0x69665c,"Flint"],[364,0x5a4c42,"Dark taupe"],[365,0x6a3909,"Burnt Sienna"],
    [1001,0xf8f8f8,"Institutional white"],[1002,0xcdcdcd,"Mid gray"],[1003,0x111111,"Really black"],
    [1004,0xff0000,"Really red"],[1005,0xffaf00,"Deep orange"],[1006,0xb480ff,"Alder"],[1007,0xa34b4b,"Dusty Rose"],
    [1008,0xc1be42,"Olive"],[1009,0xffff00,"New Yeller"],[1010,0x0000ff,"Really blue"],[1011,0x002060,"Navy blue"],
    [1012,0x2154b9,"Deep blue"],[1013,0x04afec,"Cyan"],[1014,0xaa5500,"CGA brown"],[1015,0xaa00aa,"Magenta"],
    [1016,0xff66cc,"Pink"],[1017,0xffaf00,"Deep orange"],[1018,0x12eed4,"Teal"],[1019,0x00ffff,"Toothpaste"],
    [1020,0x00ff00,"Lime green"],[1021,0x3a7d15,"Camo"],[1022,0x7f8e64,"Grime"],[1023,0x8c5b9f,"Lavender"],
    [1024,0xafddff,"Pastel light blue"],[1025,0xffc9c9,"Pastel orange"],[1026,0xb1a7ff,"Pastel violet"],
    [1027,0x9ff3e9,"Pastel blue green"],[1028,0xccffcc,"Pastel green"],[1029,0xffffcc,"Pastel yellow"],
    [1030,0xffcc99,"Pastel brown"],[1031,0x6225d1,"Royal purple"],[1032,0xff00bf,"Hot pink"],
  ];
  const BRICK = new Map(PALETTE.map(p => [p[0], p]));

  // nearest by CIELAB distance (how different the colors look)
  function lab(r, g, b) {
    const lin = c => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; };
    const R = lin(r), Gn = lin(g), B = lin(b);
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((R * 0.4124 + Gn * 0.3576 + B * 0.1805) / 0.95047), y = f(R * 0.2126 + Gn * 0.7152 + B * 0.0722), z = f((R * 0.0193 + Gn * 0.1192 + B * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  let LAB = null;
  function nearestBrick(r, g, b) {   // r, g, b: 0-255
    if (!LAB) LAB = PALETTE.map(([n, c]) => [n, lab((c >> 16) & 255, (c >> 8) & 255, c & 255)]);
    const q = lab(r, g, b);
    let best = 194, bd = Infinity;
    for (const [n, L] of LAB) {
      const d = (L[0] - q[0]) ** 2 + (L[1] - q[1]) ** 2 + (L[2] - q[2]) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  function brickRGB(n) { const p = BRICK.get(n) || BRICK.get(194); return [(p[1] >> 16) & 255, (p[1] >> 8) & 255, p[1] & 255]; }

  class Inst {
    constructor(cls) { this.cls = cls; this.props = new Map(); this.children = []; this.parent = null; this.service = false; }
    get(name) { const p = this.props.get(name); return p ? p.v : undefined; }
    set(name, t, v) { this.props.set(name, { t, v }); }
    get name() { const n = this.get('Name'); return n == null ? this.cls : str(n); }
  }

  const utf8 = new TextDecoder('utf-8');
  const enc = new TextEncoder();
  const str = v => typeof v === 'string' ? v : v instanceof Uint8Array ? utf8.decode(v) : String(v);
  const bytes = v => v instanceof Uint8Array ? v : enc.encode(v == null ? '' : String(v));
  const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // the engine's content files (rbxasset://...) that places point at (sounds, textures, fonts, sky, particles)
  const CONTENT_PATHS = ["textures", "textures/Cursors", "textures", "textures", "textures", "textures/ui", "textures/ui", "textures/ui", "textures/ui", "textures/ui", "textures/ui", "textures/ui/Settings", "textures/ui/Settings", "textures/ui/Settings", "textures/ui/Settings", "textures/ui/Settings", "textures/ui/Settings", "textures/ui", "textures/ui", "fonts/Arial.font", "fonts/ArialBold.font", "fonts/CompositExtraSlot0.mesh", "fonts/CompositExtraSlot1.mesh", "fonts/CompositExtraSlot2.mesh", "fonts/CompositExtraSlot3.mesh", "fonts/CompositExtraSlot4.mesh", "fonts/CompositFullAtlasBaseTexture.mesh", "fonts/CompositFullAtlasOverlayTexture.mesh", "fonts/CompositLeftArmBase.mesh", "fonts/CompositLeftLegBase.mesh", "fonts/CompositPantsTemplate.mesh", "fonts/CompositRightArmBase.mesh", "fonts/CompositRightLegBase.mesh", "fonts/CompositShirtTemplate.mesh", "fonts/CompositTShirt.mesh", "fonts/CompositTorsoBase.mesh", "fonts/LoadingScript.lua", "fonts/Rocket.rbxm", "fonts/SlingshotPellet.rbxm", "fonts/SourceSans.font", "fonts/SourceSansBold.font", "fonts/SourceSansItalic.font", "fonts/SourceSansLight.font", "fonts/SourceSansPro-Bold.ttf", "fonts/SourceSansPro-It.ttf", "fonts/SourceSansPro-Light.ttf", "fonts/SourceSansPro-Regular.ttf", "fonts/arial.ttf", "fonts/arialbd.ttf", "fonts/character.rbxm", "fonts/character3.rbxm", "fonts/characterCameraScript.rbxmx", "fonts/characterControlScript.rbxmx", "fonts/characterR15.rbxm", "fonts/comics.fnt", "fonts/diogenes.fnt", "fonts/fonts.dds", "fonts/gamecontrollerdb.txt", "fonts/head.mesh", "fonts/headA.mesh", "fonts/headB.mesh", "fonts/headC.mesh", "fonts/headD.mesh", "fonts/headE.mesh", "fonts/headF.mesh", "fonts/headG.mesh", "fonts/headH.mesh", "fonts/headI.mesh", "fonts/headJ.mesh", "fonts/headK.mesh", "fonts/headL.mesh", "fonts/headM.mesh", "fonts/headN.mesh", "fonts/headO.mesh", "fonts/headP.mesh", "fonts/humanoidAnimate.rbxm", "fonts/humanoidAnimateLocal.rbxm", "fonts/humanoidAnimateLocalKeyframe.rbxm", "fonts/humanoidAnimateLocalKeyframe2.rbxm", "fonts/humanoidAnimateR15.rbxm", "fonts/humanoidExtra.rbxm", "fonts/humanoidSound.rbxm", "fonts/humanoidSound2.rbxm", "fonts/humanoidSoundNew.rbxm", "fonts/humanoidSoundNewLocal.rbxmx", "fonts/humanoidStatic.rbxm", "fonts/leftarm.mesh", "fonts/leftleg.mesh", "fonts/rightarm.mesh", "fonts/rightleg.mesh", "fonts/safechat.xml", "fonts/torso.mesh", "particles/explosion.particle", "particles/fire.particle", "particles/forceFieldBeam.particle", "particles/forceFieldRadial.particle", "particles/smoke.particle", "particles/sparkles.particle", "sky/lensflare.jpg", "sky/moon-alpha.jpg", "sky/moon.jpg", "sky/null_plainsky512_bk.jpg", "sky/null_plainsky512_dn.jpg", "sky/null_plainsky512_ft.jpg", "sky/null_plainsky512_lf.jpg", "sky/null_plainsky512_rt.jpg", "sky/null_plainsky512_up.jpg", "sky/skyspheremap.jpg", "sky/sun-rays.jpg", "sky/sun.jpg", "sounds/Kerplunk.mp3", "sounds/Kid saying Ouch.mp3", "sounds/Rubber band sling shot.mp3", "sounds/Rubber band.mp3", "sounds/SWITCH3.mp3", "sounds/action_falling.mp3", "sounds/action_footsteps_plastic.mp3", "sounds/action_get_up.mp3", "sounds/action_jump.mp3", "sounds/action_jump_land.mp3", "sounds/action_swim.mp3", "sounds/bass.mp3", "sounds/bfsl-minifigfoots1.mp3", "sounds/bfsl-minifigfoots2.mp3", "sounds/button.mp3", "sounds/clickfast.mp3", "sounds/collide.mp3", "sounds/electronicpingshort.mp3", "sounds/flashbulb.mp3", "sounds/grass.mp3", "sounds/grass2.mp3", "sounds/grass3.mp3", "sounds/grassstone.mp3", "sounds/grassstone2.mp3", "sounds/grassstone3.mp3", "sounds/hit.mp3", "sounds/ice.mp3", "sounds/ice2.mp3", "sounds/ice3.mp3", "sounds/icegrass.mp3", "sounds/icegrass2.mp3", "sounds/icegrass3.mp3", "sounds/icemetal.mp3", "sounds/icemetal2.mp3", "sounds/icemetal3.mp3", "sounds/icestone.mp3", "sounds/icestone2.mp3", "sounds/icestone3.mp3", "sounds/impact_bodyfall.mp3", "sounds/impact_explosion_01.mp3", "sounds/impact_explosion_02.mp3", "sounds/impact_explosion_03.mp3", "sounds/impact_water.mp3", "sounds/metal.mp3", "sounds/metal2.mp3", "sounds/metal3.mp3", "sounds/metalgrass.mp3", "sounds/metalgrass2.mp3", "sounds/metalgrass3.mp3", "sounds/metalstone.mp3", "sounds/metalstone2.mp3", "sounds/metalstone3.mp3", "sounds/plasticgrass.mp3", "sounds/plasticgrass2.mp3", "sounds/plasticgrass3.mp3", "sounds/plasticice.mp3", "sounds/plasticice2.mp3", "sounds/plasticice3.mp3", "sounds/plasticmetal.mp3", "sounds/plasticmetal2.mp3", "sounds/plasticmetal3.mp3", "sounds/plasticplastic.mp3", "sounds/plasticplastic2.mp3", "sounds/plasticplastic3.mp3", "sounds/plasticstone.mp3", "sounds/plasticstone2.mp3", "sounds/plasticstone3.mp3", "sounds/snap.mp3", "sounds/splat.mp3", "sounds/stone.mp3", "sounds/stone2.mp3", "sounds/stone3.mp3", "sounds/switch.mp3", "sounds/swoosh.mp3", "sounds/swordlunge.mp3", "sounds/swordslash.mp3", "sounds/unsheath.mp3", "sounds/uuhhh.mp3", "sounds/victory.mp3", "sounds/woodgrass.mp3", "sounds/woodgrass2.mp3", "sounds/woodgrass3.mp3", "sounds/woodice.mp3", "sounds/woodice2.mp3", "sounds/woodice3.mp3", "sounds/woodmetal.mp3", "sounds/woodmetal2.mp3", "sounds/woodmetal3.mp3", "sounds/woodplastic.mp3", "sounds/woodplastic2.mp3", "sounds/woodplastic3.mp3", "sounds/woodstone.mp3", "sounds/woodstone2.mp3", "sounds/woodstone3.mp3", "sounds/woodwood.mp3", "sounds/woodwood2.mp3", "sounds/woodwood3.mp3", "textures/AnchorCursor.png", "textures/ArrowCursor.png", "textures/ArrowCursorDecalDrag.png", "textures/ArrowFarCursor.png", "textures/BWGradient.png", "textures/BackgroundImage.png", "textures/Blank.png", "textures/Clone.png", "textures/CloneCursor.png", "textures/CloneDownCursor.png", "textures/CloneOverCursor.png", "textures/Cursors/Gamepad/Pointer.png", "textures/Cursors/Gamepad/Pointer@2x.png", "textures/Cursors/Gamepad/PointerOver.png", "textures/Cursors/Gamepad/PointerOver@2x.png", "textures/DialogHelp.png", "textures/DialogQuest.png", "textures/DialogShop.png", "textures/DragCursor.png", "textures/DropperCursor.png", "textures/Exit.png", "textures/Exit_dn.png", "textures/Exit_ovr.png", "textures/FillCursor.png", "textures/FlagCursor.png", "textures/FlatCursor.png", "textures/GrabCursor.png", "textures/GrabRotateCursor.png", "textures/Grass_Texture.jpg", "textures/GunCursor.png", "textures/GunWaitCursor.png", "textures/HammerCursor.png", "textures/HammerDownCursor.png", "textures/HammerOverCursor.png", "textures/HingeCursor.png", "textures/LockCursor.png", "textures/MotorCursor.png", "textures/MouseLockedCursor.png", "textures/ResizeCursor.png", "textures/Roblox-loading-glow.png", "textures/Roblox-loading-glow@2x.png", "textures/Roblox-loading.png", "textures/Roblox-loading@2x.png", "textures/Roblox.bmp", "textures/RustGradient.png", "textures/Smoke.png", "textures/SpawnCursor.png", "textures/SpawnLocation.png", "textures/SurfacesDefault.png", "textures/UnAnchorCursor.png", "textures/UnlockCursor.png", "textures/WeldCursor.png", "textures/WhiteCircle.png", "textures/advClosed-hand-no-weld.png", "textures/advClosed-hand-weld.png", "textures/advClosed-hand.png", "textures/advCursor-default.png", "textures/advCursor-openedHand.png", "textures/advCursor-white.png", "textures/advancedMove.png", "textures/advancedMoveResize.png", "textures/advancedMove_joint.png", "textures/advancedMove_keysOnly.png", "textures/advancedMove_noJoint.png", "textures/blackBkg_round.png", "textures/blackBkg_square.png", "textures/chatBubble_botBlue_bkg.png", "textures/chatBubble_botBlue_notify_bkg.png", "textures/chatBubble_botBlue_tail.png", "textures/chatBubble_botBlue_tailRight.png", "textures/chatBubble_botGreen_bkg.png", "textures/chatBubble_botGreen_notify_bkg.png", "textures/chatBubble_botGreen_tail.png", "textures/chatBubble_botGreen_tailRight.png", "textures/chatBubble_botRed_bkg.png", "textures/chatBubble_botRed_notify_bkg.png", "textures/chatBubble_botRed_tail.png", "textures/chatBubble_botRed_tailRight.png", "textures/chatBubble_bot_notifyGray_dotDotDot.png", "textures/chatBubble_bot_notify_bang.png", "textures/chatBubble_bot_notify_dotDotDot.png", "textures/chatBubble_bot_notify_money.png", "textures/chatBubble_bot_notify_question.png", "textures/chatBubble_white_bkg.png", "textures/chatBubble_white_notify_bkg.png", "textures/chatBubble_white_tail.png", "textures/dirt.jpg", "textures/explosion.png", "textures/face.png", "textures/fire_0.png", "textures/glow.png", "textures/gradient.png", "textures/loading/cancelButton.png", "textures/loading/darkLoadingTexture.png", "textures/loading/loadingCircle.png", "textures/loading/loadingTexture.png", "textures/loading/loadingvignette.png", "textures/loading/robloxlogo.png", "textures/lua.png", "textures/particles/common_alpha.dds", "textures/particles/explosion01_core_alpha.png", "textures/particles/explosion01_core_main.dds", "textures/particles/explosion01_implosion_color.png", "textures/particles/explosion01_implosion_main.dds", "textures/particles/explosion01_shockwave_main.dds", "textures/particles/explosion01_smoke_alpha.dds", "textures/particles/explosion01_smoke_color_new.dds", "textures/particles/explosion01_smoke_main.dds", "textures/particles/explosion_alpha.dds", "textures/particles/explosion_color.dds", "textures/particles/fire_alpha.dds", "textures/particles/fire_color.dds", "textures/particles/fire_main.dds", "textures/particles/fire_sparks_color.dds", "textures/particles/fire_sparks_main.dds", "textures/particles/forcefield_alpha.dds", "textures/particles/forcefield_glow_alpha.dds", "textures/particles/forcefield_glow_color.dds", "textures/particles/forcefield_glow_main.dds", "textures/particles/forcefield_vortex_color.dds", "textures/particles/forcefield_vortex_main.dds", "textures/particles/legacy_fire_alpha_color.dds", "textures/particles/smoke_color.dds", "textures/particles/smoke_main.dds", "textures/particles/sparkles_color.dds", "textures/particles/sparkles_main.dds", "textures/roblox-logo.png", "textures/rotationArrow.png", "textures/script.png", "textures/shadowmask.png", "textures/spark.png", "textures/sparkle.png", "textures/transformFiveDegrees.png", "textures/transformNinetyDegrees.png", "textures/transformOneDegree.png", "textures/transformTwentyTwoDegrees.png", "textures/ui/Backpack/Backpack.png", "textures/ui/Backpack/Backpack@2x.png", "textures/ui/Backpack/Backpack_Down.png", "textures/ui/Backpack/Backpack_Down@2x.png", "textures/ui/Backpack_Close.png", "textures/ui/Backpack_Close@2x.png", "textures/ui/Backpack_Open.png", "textures/ui/Backpack_Open@2x.png", "textures/ui/ButtonLeft.png", "textures/ui/ButtonLeftDown.png", "textures/ui/ButtonRight.png", "textures/ui/ButtonRightDown.png", "textures/ui/Chat/Chat.png", "textures/ui/Chat/Chat@2x.png", "textures/ui/Chat/ChatDown.png", "textures/ui/Chat/ChatDown@2x.png", "textures/ui/Chat/MessageCounter.png", "textures/ui/Chat/MessageCounter@2x.png", "textures/ui/Chat/ToggleChat.png", "textures/ui/Chat/ToggleChat@2x.png", "textures/ui/Chat/ToggleChatDown.png", "textures/ui/Chat/ToggleChatDown@2x.png", "textures/ui/CloneButton.png", "textures/ui/CloneButton_dn.png", "textures/ui/CloseButton.png", "textures/ui/CloseButton_dn.png", "textures/ui/Concrete.png", "textures/ui/CorrodedMetal.png", "textures/ui/DPadSheet.png", "textures/ui/DeleteButton.png", "textures/ui/DeleteButton_dn.png", "textures/ui/DiamondPlate.png", "textures/ui/ErrorIcon.png", "textures/ui/ErrorIconSmall.png", "textures/ui/Foil.png", "textures/ui/Gear.png", "textures/ui/Gear_dn.png", "textures/ui/Glue.png", "textures/ui/Grass.png", "textures/ui/GroupMoveButton.png", "textures/ui/GroupMoveButton_dn.png", "textures/ui/Health-BKG-Center.png", "textures/ui/Health-BKG-Center@2x.png", "textures/ui/Health-BKG-Left-Cap.png", "textures/ui/Health-BKG-Left-Cap@2x.png", "textures/ui/Health-BKG-Right-Cap.png", "textures/ui/Health-BKG-Right-Cap@2x.png", "textures/ui/Hinge.png", "textures/ui/Ice.png", "textures/ui/Inlets.png", "textures/ui/InsertButton.png", "textures/ui/InsertButton_dn.png", "textures/ui/LoadingBKG.png", "textures/ui/MaterialButton.png", "textures/ui/MaterialButton_dn.png", "textures/ui/MaterialMenu.png", "textures/ui/Menu/Hamburger.png", "textures/ui/Menu/Hamburger@2x.png", "textures/ui/Menu/HamburgerDown.png", "textures/ui/Menu/HamburgerDown@2x.png", "textures/ui/Modal.png", "textures/ui/Motor.png", "textures/ui/PaintButton.png", "textures/ui/PaintButton_dn.png", "textures/ui/PartMoveButton.png", "textures/ui/PartMoveButton_dn.png", "textures/ui/Plastic.png", "textures/ui/PlayerList/BlockedIcon.png", "textures/ui/PlayerList/CharacterImageBackground.png", "textures/ui/PlayerList/TileShadowMissingTop.png", "textures/ui/PlayerListFriendRequestReceivedIcon.png", "textures/ui/PlayerListFriendRequestSentIcon.png", "textures/ui/PlayerlistFriendIcon.png", "textures/ui/PropertyButton.png", "textures/ui/PropertyButton_dn.png", "textures/ui/RecordDown.png", "textures/ui/RecordStop.png", "textures/ui/ResetIcon.png", "textures/ui/RobuxIcon.png", "textures/ui/ScaleButton.png", "textures/ui/ScaleButton_dn.png", "textures/ui/Scroll/scroll-bottom.png", "textures/ui/Scroll/scroll-bottom@2x.png", "textures/ui/Scroll/scroll-middle.png", "textures/ui/Scroll/scroll-middle@2x.png", "textures/ui/Scroll/scroll-top.png", "textures/ui/Scroll/scroll-top@2x.png", "textures/ui/SearchIcon.png", "textures/ui/SelectionBox.png", "textures/ui/SelectionBox@2x.png", "textures/ui/Settings/DropDown/DropDown.png", "textures/ui/Settings/DropDown/DropDown@2x.png", "textures/ui/Settings/Help/AButtonDark.png", "textures/ui/Settings/Help/AButtonDark@2x.png", "textures/ui/Settings/Help/AButtonLight.png", "textures/ui/Settings/Help/AButtonLight@2x.png", "textures/ui/Settings/Help/AButtonLightSmall.png", "textures/ui/Settings/Help/BButtonDark.png", "textures/ui/Settings/Help/BButtonDark@2x.png", "textures/ui/Settings/Help/BButtonLight.png", "textures/ui/Settings/Help/BButtonLight@2x.png", "textures/ui/Settings/Help/EscapeIcon.png", "textures/ui/Settings/Help/GenericController.png", "textures/ui/Settings/Help/GenericController@2x.png", "textures/ui/Settings/Help/LeaveIcon.png", "textures/ui/Settings/Help/ResetIcon.png", "textures/ui/Settings/Help/RotateCameraGesture.png", "textures/ui/Settings/Help/UseToolGesture.png", "textures/ui/Settings/Help/XButtonDark.png", "textures/ui/Settings/Help/XButtonDark@2x.png", "textures/ui/Settings/Help/XButtonLight.png", "textures/ui/Settings/Help/XButtonLight@2x.png", "textures/ui/Settings/Help/XboxController.png", "textures/ui/Settings/Help/YButtonDark.png", "textures/ui/Settings/Help/YButtonDark@2x.png", "textures/ui/Settings/Help/YButtonLight.png", "textures/ui/Settings/Help/YButtonLight@2x.png", "textures/ui/Settings/Help/ZoomGesture.png", "textures/ui/Settings/MenuBarAssets/MenuBackground.png", "textures/ui/Settings/MenuBarAssets/MenuButton.png", "textures/ui/Settings/MenuBarAssets/MenuButton@2x.png", "textures/ui/Settings/MenuBarAssets/MenuButtonSelected.png", "textures/ui/Settings/MenuBarAssets/MenuButtonSelected@2x.png", "textures/ui/Settings/MenuBarAssets/MenuSelection.png", "textures/ui/Settings/MenuBarAssets/MenuSelection@2x.png", "textures/ui/Settings/MenuBarIcons/GameSettingsTab.png", "textures/ui/Settings/MenuBarIcons/GameSettingsTab@2x.png", "textures/ui/Settings/MenuBarIcons/HelpTab.png", "textures/ui/Settings/MenuBarIcons/HelpTab@2x.png", "textures/ui/Settings/MenuBarIcons/HomeTab.png", "textures/ui/Settings/MenuBarIcons/HomeTab@2x.png", "textures/ui/Settings/MenuBarIcons/PlayersTabIcon.png", "textures/ui/Settings/MenuBarIcons/PlayersTabIcon@2x.png", "textures/ui/Settings/MenuBarIcons/RecordTab.png", "textures/ui/Settings/MenuBarIcons/RecordTab@2x.png", "textures/ui/Settings/MenuBarIcons/ReportAbuseTab.png", "textures/ui/Settings/MenuBarIcons/ReportAbuseTab@2x.png", "textures/ui/Settings/Radial/Alert.png", "textures/ui/Settings/Radial/Alert@2x.png", "textures/ui/Settings/Radial/Backpack.png", "textures/ui/Settings/Radial/Backpack@2x.png", "textures/ui/Settings/Radial/Bottom.png", "textures/ui/Settings/Radial/BottomLeft.png", "textures/ui/Settings/Radial/BottomLeftSelected.png", "textures/ui/Settings/Radial/BottomRight.png", "textures/ui/Settings/Radial/BottomRightSelected.png", "textures/ui/Settings/Radial/BottomSelected.png", "textures/ui/Settings/Radial/Chat.png", "textures/ui/Settings/Radial/Chat@2x.png", "textures/ui/Settings/Radial/EmptyBottom.png", "textures/ui/Settings/Radial/EmptyBottomLeft.png", "textures/ui/Settings/Radial/EmptyBottomRight.png", "textures/ui/Settings/Radial/EmptyTop.png", "textures/ui/Settings/Radial/EmptyTopLeft.png", "textures/ui/Settings/Radial/EmptyTopRight.png", "textures/ui/Settings/Radial/Leave.png", "textures/ui/Settings/Radial/Leave@2x.png", "textures/ui/Settings/Radial/Menu.png", "textures/ui/Settings/Radial/Menu@2x.png", "textures/ui/Settings/Radial/PlayerList.png", "textures/ui/Settings/Radial/PlayerList@2x.png", "textures/ui/Settings/Radial/RadialLabel.png", "textures/ui/Settings/Radial/RadialLabel@2x.png", "textures/ui/Settings/Radial/Top.png", "textures/ui/Settings/Radial/TopLeft.png", "textures/ui/Settings/Radial/TopLeftSelected.png", "textures/ui/Settings/Radial/TopRight.png", "textures/ui/Settings/Radial/TopRightSelected.png", "textures/ui/Settings/Radial/TopSelected.png", "textures/ui/Settings/Slider/BarLeft.png", "textures/ui/Settings/Slider/BarLeft@2x.png", "textures/ui/Settings/Slider/BarRight.png", "textures/ui/Settings/Slider/BarRight@2x.png", "textures/ui/Settings/Slider/Left.png", "textures/ui/Settings/Slider/Left@2x.png", "textures/ui/Settings/Slider/Right.png", "textures/ui/Settings/Slider/Right@2x.png", "textures/ui/Settings/Slider/SelectedBarLeft.png", "textures/ui/Settings/Slider/SelectedBarLeft@2x.png", "textures/ui/Settings/Slider/SelectedBarRight.png", "textures/ui/Settings/Slider/SelectedBarRight@2x.png", "textures/ui/SettingsButton.png", "textures/ui/SettingsButton_dn.png", "textures/ui/SettingsButton_ds.png", "textures/ui/SettingsButton_ovr.png", "textures/ui/SingleButton.png", "textures/ui/SingleButtonDown.png", "textures/ui/Slate.png", "textures/ui/Slider-BKG-Center.png", "textures/ui/Slider-BKG-Center@2x.png", "textures/ui/Slider-BKG-Left-Cap.png", "textures/ui/Slider-BKG-Left-Cap@2x.png", "textures/ui/Slider-BKG-Right-Cap.png", "textures/ui/Slider-BKG-Right-Cap@2x.png", "textures/ui/Slider-Fill-Center.png", "textures/ui/Slider-Fill-Center@2x.png", "textures/ui/Slider-Fill-Left-Cap.png", "textures/ui/Slider-Fill-Left-Cap@2x.png", "textures/ui/Slider-Fill-Right-Cap.png", "textures/ui/Slider-Fill-Right-Cap@2x.png", "textures/ui/Slider.png", "textures/ui/Slider_dn.png", "textures/ui/Slider_sel.png", "textures/ui/Smooth.png", "textures/ui/StampToolButton.png", "textures/ui/StampToolButton_dn.png", "textures/ui/Studs.png", "textures/ui/SurfaceButton.png", "textures/ui/SurfaceButton_dn.png", "textures/ui/SurfaceMenu.png", "textures/ui/TinyBcIcon.png", "textures/ui/TinyObcIcon.png", "textures/ui/TinyTbcIcon.png", "textures/ui/TixIcon.png", "textures/ui/ToggleFullScreen_ds.png", "textures/ui/ToolButton.png", "textures/ui/ToolButton_dn.png", "textures/ui/ToolButton_ds.png", "textures/ui/TopBar/dropshadow.png", "textures/ui/TopBar/dropshadow@2x.png", "textures/ui/TouchControlsSheet.png", "textures/ui/Universal.png", "textures/ui/Vehicle/SpeedBar.png", "textures/ui/Vehicle/SpeedBar@2x.png", "textures/ui/Vehicle/SpeedBarBKG.png", "textures/ui/Vehicle/SpeedBarBKG@2x.png", "textures/ui/Vehicle/SpeedBarEmpty.png", "textures/ui/Vehicle/SpeedBarEmpty@2x.png", "textures/ui/Weld.png", "textures/ui/Wood.png", "textures/ui/btn_grey.png", "textures/ui/btn_greyTransp.png", "textures/ui/btn_newBlue.png", "textures/ui/btn_newBlue@2x.png", "textures/ui/btn_newBlueGlow.png", "textures/ui/btn_newBlueGlow@2x.png", "textures/ui/btn_newGrey.png", "textures/ui/btn_newGrey@2x.png", "textures/ui/btn_newGreyGlow.png", "textures/ui/btn_newGreyGlow@2x.png", "textures/ui/btn_newWhite.png", "textures/ui/btn_newWhite@2x.png", "textures/ui/btn_newWhiteGlow.png", "textures/ui/btn_newWhiteGlow@2x.png", "textures/ui/btn_red.png", "textures/ui/btn_redGlow.png", "textures/ui/btn_white.png", "textures/ui/chatBubble_blue_notify_bkg.png", "textures/ui/chatBubble_green_notify_bkg.png", "textures/ui/chatBubble_red_notify_bkg.png", "textures/ui/chatBubble_white_notify_bkg.png", "textures/ui/chat_teamButton.png", "textures/ui/chat_teamButton@2x.png", "textures/ui/dialog_blue.png", "textures/ui/dialog_blue@2x.png", "textures/ui/dialog_ellipses.png", "textures/ui/dialog_green.png", "textures/ui/dialog_green@2x.png", "textures/ui/dialog_purpose_help.png", "textures/ui/dialog_purpose_quest.png", "textures/ui/dialog_purpose_shop.png", "textures/ui/dialog_red.png", "textures/ui/dialog_red@2x.png", "textures/ui/dialog_tail.png", "textures/ui/dialog_tail@2x.png", "textures/ui/dialog_white.png", "textures/ui/dialog_white@2x.png", "textures/ui/dropdown_arrow.png", "textures/ui/dropdown_arrow@2x.png", "textures/ui/expandPlayerList.png", "textures/ui/expandPlayerList@2x.png", "textures/ui/homeButton.png", "textures/ui/homeButton@2x.png", "textures/ui/icon_BC-16.png", "textures/ui/icon_OBC-16.png", "textures/ui/icon_TBC-16.png", "textures/ui/icon_admin-16.png", "textures/ui/icon_follower-16.png", "textures/ui/icon_following-16.png", "textures/ui/icon_friendrequestrecieved-16.png", "textures/ui/icon_friendrequestsent_16.png", "textures/ui/icon_friends_16.png", "textures/ui/icon_mutualfollowing-16.png", "textures/ui/icon_placeowner.png", "textures/ui/mouseLock_off.png", "textures/ui/mouseLock_off@2x.png", "textures/ui/mouseLock_on.png", "textures/ui/mouseLock_on@2x.png", "textures/ui/newBkg_square.png", "textures/ui/newBkg_square@2x.png", "textures/ui/scroll-bottom.png", "textures/ui/scroll-bottom@2x.png", "textures/ui/scroll-middle.png", "textures/ui/scroll-middle@2x.png", "textures/ui/scroll-top.png", "textures/ui/scroll-top@2x.png", "textures/ui/scrollbar.png", "textures/ui/scrollbuttonDown.png", "textures/ui/scrollbuttonDown_dn.png", "textures/ui/scrollbuttonDown_ds.png", "textures/ui/scrollbuttonDown_ovr.png", "textures/ui/scrollbuttonUp.png", "textures/ui/scrollbuttonUp_dn.png", "textures/ui/scrollbuttonUp_ds.png", "textures/ui/scrollbuttonUp_ovr.png", "textures/ui/slider_new_tab.png", "textures/ui/slider_new_tab@2x.png", "textures/water_Subsurface.dds", "textures/water_Wave.dds", "textures/wrench.png"];

  // ---------------------------------------------------------------- compression
  function lz4(src, outLen) {
    const dst = new Uint8Array(outLen);
    let s = 0, d = 0;
    while (s < src.length) {
      const tok = src[s++];
      let lit = tok >> 4;
      if (lit === 15) { let b; do { b = src[s++]; lit += b; } while (b === 255); }
      dst.set(src.subarray(s, s + lit), d); s += lit; d += lit;
      if (s >= src.length) break;
      const off = src[s] | (src[s + 1] << 8); s += 2;
      let len = tok & 15;
      if (len === 15) { let b; do { b = src[s++]; len += b; } while (b === 255); }
      len += 4;
      if (off === 0 || off > d) throw new Error('bad LZ4 data');
      let m = d - off;
      for (let i = 0; i < len; i++) dst[d++] = dst[m++];
    }
    if (d !== outLen) throw new Error('bad LZ4 data (size)');
    return dst;
  }
  function unpack(raw, outLen) {
    if (raw[0] === 0x28 && raw[1] === 0xb5 && raw[2] === 0x2f && raw[3] === 0xfd) {
      const z = G.fzstd || (typeof require === 'function' ? require('./vendor/fzstd.js') : null);
      if (!z) throw new Error('this file uses Zstd compression and the decompressor is missing');
      const out = z.decompress(raw);
      if (out.length !== outLen) throw new Error('bad Zstd data (size)');
      return out;
    }
    return lz4(raw, outLen);
  }

  // ---------------------------------------------------------------- binary reader
  class Rd {
    constructor(u8) { this.u = u8; this.p = 0; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }
    u8() { return this.u[this.p++]; }
    u16() { const v = this.dv.getUint16(this.p, true); this.p += 2; return v; }
    i16() { const v = this.dv.getInt16(this.p, true); this.p += 2; return v; }
    u32() { const v = this.dv.getUint32(this.p, true); this.p += 4; return v; }
    i32() { const v = this.dv.getInt32(this.p, true); this.p += 4; return v; }
    f32() { const v = this.dv.getFloat32(this.p, true); this.p += 4; return v; }
    f64() { const v = this.dv.getFloat64(this.p, true); this.p += 8; return v; }
    str() { const n = this.u32(); if (this.p + n > this.u.length) throw new Error('string runs past the end'); const b = this.u.slice(this.p, this.p + n); this.p += n; return b; }
    // n values of w bytes stored byte-plane by byte-plane; returns big-endian rows
    planes(n, w) {
      const src = this.u, base = this.p, out = new Uint8Array(n * w);
      if (base + n * w > src.length) throw new Error('values run past the end');
      for (let j = 0; j < w; j++) for (let i = 0; i < n; i++) out[i * w + j] = src[base + j * n + i];
      this.p += n * w;
      return out;
    }
    u32s(n) { const b = this.planes(n, 4), o = new Array(n); for (let i = 0; i < n; i++) o[i] = ((b[4 * i] << 24) | (b[4 * i + 1] << 16) | (b[4 * i + 2] << 8) | b[4 * i + 3]) >>> 0; return o; }
    ints(n) { return this.u32s(n).map(v => (v >>> 1) ^ -(v & 1)); }
    floats(n) {
      const o = this.u32s(n), dv = new DataView(new ArrayBuffer(4));
      return o.map(t => { dv.setUint32(0, ((t >>> 1) | (t << 31)) >>> 0); return dv.getFloat32(0); });
    }
    refs(n) { let acc = 0; return this.ints(n).map(d => (acc += d)); }
    int64s(n) {
      const b = this.planes(n, 8), o = new Array(n);
      for (let i = 0; i < n; i++) {
        let u = 0n;
        for (let j = 0; j < 8; j++) u = (u << 8n) | BigInt(b[8 * i + j]);
        o[i] = Number((u >> 1n) ^ -(u & 1n));
      }
      return o;
    }
    cframes(n) {
      const rot = [];
      for (let i = 0; i < n; i++) {
        const id = this.u8();
        if (id === 0) { const m = []; for (let k = 0; k < 9; k++) m.push(this.f32()); rot.push(m); }
        else rot.push(rotationFromId(id));
      }
      const x = this.floats(n), y = this.floats(n), z = this.floats(n);
      return rot.map((m, i) => [x[i], y[i], z[i], ...m]);
    }
  }
  const NORMALS = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]];
  function rotationFromId(id) {
    const a = NORMALS[Math.floor((id - 1) / 6)], b = NORMALS[(id - 1) % 6];
    if (!a || !b) return IDENT.slice();
    const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    return [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]];
  }

  function readValues(r, t, n, sstr) {
    const zip3 = (a, b, c) => a.map((v, i) => [v, b[i], c[i]]);
    switch (t) {
      case 1: case 29: return Array.from({ length: n }, () => r.str());
      case 2: return Array.from({ length: n }, () => r.u8() !== 0);
      case 3: return r.ints(n);
      case 4: return r.floats(n);
      case 5: return Array.from({ length: n }, () => r.f64());
      case 6: { const s = r.floats(n), o = r.ints(n); return s.map((v, i) => [v, o[i]]); }
      case 7: { const xs = r.floats(n), ys = r.floats(n), xo = r.ints(n), yo = r.ints(n); return xs.map((v, i) => [v, xo[i], ys[i], yo[i]]); }
      case 8: return Array.from({ length: n }, () => [r.f32(), r.f32(), r.f32(), r.f32(), r.f32(), r.f32()]);
      case 9: case 10: return Array.from({ length: n }, () => r.u8());
      case 11: case 18: return r.u32s(n);
      case 12: return zip3(r.floats(n), r.floats(n), r.floats(n));
      case 13: { const x = r.floats(n), y = r.floats(n); return x.map((v, i) => [v, y[i]]); }
      case 14: return zip3(r.floats(n), r.floats(n), r.floats(n));
      case 15: return Array.from({ length: n }, () => [r.i16(), r.i16()]);
      case 16: return r.cframes(n);
      case 19: return r.refs(n);
      case 20: return Array.from({ length: n }, () => [r.i16(), r.i16(), r.i16()]);
      case 21: return Array.from({ length: n }, () => { const k = r.u32(), o = []; for (let i = 0; i < k; i++) o.push([r.f32(), r.f32(), r.f32()]); return o; });
      case 22: return Array.from({ length: n }, () => { const k = r.u32(), o = []; for (let i = 0; i < k; i++) o.push([r.f32(), r.f32(), r.f32(), r.f32(), r.f32()]); return o; });
      case 23: return Array.from({ length: n }, () => [r.f32(), r.f32()]);
      case 24: { const a = r.floats(n), b = r.floats(n), c = r.floats(n), d = r.floats(n); return a.map((v, i) => [v, b[i], c[i], d[i]]); }
      case 25: return Array.from({ length: n }, () => {
        const f = r.u8();
        if (!(f & 1)) return null;
        const v = [r.f32(), r.f32(), r.f32(), r.f32(), r.f32()];
        if (f & 2) r.f32();   // acoustic absorption (2024+)
        return v;
      });
      case 26: { const R = r.planes(n, 1), Gr = r.planes(n, 1), B = r.planes(n, 1); return Array.from({ length: n }, (_, i) => [R[i], Gr[i], B[i]]); }
      case 27: return r.int64s(n);
      case 28: return r.u32s(n).map(i => sstr[i] || new Uint8Array(0));
      case 30: {
        if (r.u8() !== 16) throw new Error('bad OptionalCFrame');
        const cf = r.cframes(n);
        if (r.u8() !== 2) throw new Error('bad OptionalCFrame');
        return cf.map(v => (r.u8() ? v : null));
      }
      case 32: return Array.from({ length: n }, () => { const family = str(r.str()), weight = r.u16(), style = r.u8(); r.str(); return { family, weight, style: style ? 'Italic' : 'Normal' }; });
      default: return null;   // a type the engine doesn't have and we don't convert: dropped
    }
  }

  function readBinary(u8) {
    const r0 = new Rd(u8);
    const numInst = r0.dv.getInt32(20, true);
    if (numInst < 0 || numInst > 5e6) throw new Error('bad header');
    let p = 32;
    const classes = new Map(), insts = new Array(numInst), sstr = [], meta = new Map();
    const props = [];
    let prnt = null;
    while (p + 16 <= u8.length) {
      const name = String.fromCharCode(...u8.subarray(p, p + 4)).replace(/\0+$/, '');
      const cl = r0.dv.getUint32(p + 4, true), ul = r0.dv.getUint32(p + 8, true);
      p += 16;
      const raw = u8.subarray(p, p + (cl || ul));
      p += cl || ul;
      if (name === 'END') break;
      const data = cl ? unpack(raw, ul) : raw;
      const r = new Rd(data);
      if (name === 'INST') {
        const id = r.u32(), cn = str(r.str()), fmt = r.u8(), n = r.u32(), ids = r.refs(n);
        classes.set(id, { cn, ids });
        for (const ref of ids) {
          if (ref < 0 || ref >= numInst) throw new Error('bad instance id ' + ref);
          const it = new Inst(cn);
          it.service = fmt === 1;
          insts[ref] = it;
        }
      } else if (name === 'PROP') props.push(r);
      else if (name === 'PRNT') prnt = r;
      else if (name === 'SSTR') { r.u32(); const n = r.u32(); for (let i = 0; i < n; i++) { r.p += 16; sstr.push(r.str()); } }
      else if (name === 'META') { const n = r.u32(); for (let i = 0; i < n; i++) meta.set(str(r.str()), str(r.str())); }
    }
    let dropped = 0;
    for (const r of props) {
      const c = classes.get(r.u32());
      const pn = str(r.str()), t = r.u8();
      if (!c) continue;
      let vals;
      try { vals = readValues(r, t, c.ids.length, sstr); } catch (e) { vals = null; }
      if (!vals) { dropped++; continue; }
      const tt = t === 29 ? 1 : t;
      c.ids.forEach((ref, i) => insts[ref].props.set(pn, { t: tt, v: vals[i] }));
    }
    // refs -> objects
    for (const it of insts) if (it) for (const p of it.props.values()) if (p.t === 19) p.v = p.v >= 0 ? insts[p.v] || null : null;
    const roots = [];
    if (prnt) {
      prnt.u8();
      const n = prnt.u32(), ch = prnt.refs(n), pa = prnt.refs(n);
      for (let i = 0; i < n; i++) {
        const c = insts[ch[i]];
        if (!c) continue;
        const par = pa[i] >= 0 ? insts[pa[i]] : null;
        if (par) { c.parent = par; par.children.push(c); } else roots.push(c);
      }
    }
    return { roots, meta, format: 'binary', droppedProps: dropped };
  }

  // ---------------------------------------------------------------- XML reader
  // A small XML parser: enough for Roblox files (elements, attributes, text, CDATA, entities).
  function parseXml(s) {
    const root = { tag: '#root', attrs: {}, kids: [], text: '' };
    const stack = [root];
    let i = 0;
    const ent = t => t.indexOf('&') < 0 ? t : t.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) =>
      e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'" :
        String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
    while (i < s.length) {
      const lt = s.indexOf('<', i);
      if (lt < 0) break;
      if (lt > i) stack[stack.length - 1].text += ent(s.slice(i, lt));
      if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt); i = e < 0 ? s.length : e + 3; continue; }
      if (s.startsWith('<![CDATA[', lt)) { const e = s.indexOf(']]>', lt); stack[stack.length - 1].text += s.slice(lt + 9, e < 0 ? s.length : e); i = e < 0 ? s.length : e + 3; continue; }
      if (s[lt + 1] === '?' || s[lt + 1] === '!') { const e = s.indexOf('>', lt); i = e < 0 ? s.length : e + 1; continue; }
      const gt = s.indexOf('>', lt);
      if (gt < 0) break;
      if (s[lt + 1] === '/') { if (stack.length > 1) stack.pop(); i = gt + 1; continue; }
      const selfClose = s[gt - 1] === '/';
      const inner = s.slice(lt + 1, selfClose ? gt - 1 : gt);
      const sp = inner.search(/\s/);
      const tag = sp < 0 ? inner : inner.slice(0, sp);
      const attrs = {};
      if (sp >= 0) for (const m of inner.slice(sp).matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[m[1]] = ent(m[3] != null ? m[3] : m[4]);
      const el = { tag, attrs, kids: [], text: '' };
      stack[stack.length - 1].kids.push(el);
      if (!selfClose) stack.push(el);
      i = gt + 1;
    }
    return root;
  }
  const kid = (el, tag) => el.kids.find(k => k.tag === tag);
  const knum = (el, tag, d = 0) => { const k = kid(el, tag); return k ? num(k.text, d) : d; };
  function num(t, d = 0) {
    t = (t || '').trim();
    if (!t) return d;
    const v = Number(t);
    if (!Number.isNaN(v)) return v;
    const l = t.toLowerCase();
    if (l.includes('inf')) return l.startsWith('-') ? -Infinity : Infinity;
    return d;
  }
  function b64(t) {
    t = (t || '').replace(/\s+/g, '');
    if (!t) return new Uint8Array(0);
    if (typeof atob === 'function') { const s = atob(t), o = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return o; }
    return new Uint8Array(Buffer.from(t, 'base64'));
  }
  const vec = (el, keys) => [...keys].map(k => knum(el, k));
  const CF_KEYS = ['X', 'Y', 'Z', 'R00', 'R01', 'R02', 'R10', 'R11', 'R12', 'R20', 'R21', 'R22'];

  function xmlValue(el, sstr) {
    const t = el.text;
    switch (el.tag) {
      case 'string': case 'ProtectedString': return [1, enc.encode(t)];
      case 'BinaryString': return [1, b64(t)];
      case 'Content': {
        const u = kid(el, 'url') || kid(el, 'uri');
        return [1, enc.encode(u ? u.text.trim() : '')];
      }
      case 'bool': return [2, t.trim().toLowerCase() === 'true'];
      case 'int': return [3, Math.trunc(num(t)) | 0];
      case 'int64': return [27, Math.trunc(num(t))];
      case 'float': return [4, num(t)];
      case 'double': return [5, num(t)];
      case 'UDim': return [6, [knum(el, 'S'), Math.trunc(knum(el, 'O'))]];
      case 'UDim2': return [7, [knum(el, 'XS'), Math.trunc(knum(el, 'XO')), knum(el, 'YS'), Math.trunc(knum(el, 'YO'))]];
      case 'Ray': { const o = kid(el, 'origin'), d = kid(el, 'direction'); return [8, [...(o ? vec(o, 'XYZ') : [0, 0, 0]), ...(d ? vec(d, 'XYZ') : [0, 0, 0])]]; }
      case 'Faces': return [9, Math.trunc(knum(el, 'faces'))];
      case 'Axes': return [10, Math.trunc(knum(el, 'axes'))];
      case 'BrickColor': return [11, Math.trunc(num(t, 194))];
      case 'Color3': {
        if (kid(el, 'R')) return [12, vec(el, 'RGB')];
        const v = Math.trunc(num(t)) >>> 0;
        return [12, [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]];
      }
      case 'Color3uint8': { const v = Math.trunc(num(t)) >>> 0; return [26, [(v >> 16) & 255, (v >> 8) & 255, v & 255]]; }
      case 'Vector2': return [13, vec(el, 'XY')];
      case 'Vector3': return [14, vec(el, 'XYZ')];
      case 'Vector2int16': return [15, vec(el, 'XY')];
      case 'CoordinateFrame': case 'CFrame': return [16, CF_KEYS.map(k => knum(el, k))];
      case 'OptionalCoordinateFrame': { const c = kid(el, 'CFrame'); return [30, c ? CF_KEYS.map(k => knum(c, k)) : null]; }
      case 'token': return [18, Math.trunc(num(t))];
      case 'Ref': return [19, t.trim()];
      case 'Vector3int16': return [20, vec(el, 'XYZ')];
      case 'NumberSequence': { const n = t.trim().split(/\s+/).map(Number), o = []; for (let i = 0; i + 2 < n.length; i += 3) o.push([n[i], n[i + 1], n[i + 2]]); return [21, o]; }
      case 'ColorSequence': { const n = t.trim().split(/\s+/).map(Number), o = []; for (let i = 0; i + 4 < n.length; i += 5) o.push([n[i], n[i + 1], n[i + 2], n[i + 3], n[i + 4]]); return [22, o]; }
      case 'NumberRange': { const n = t.trim().split(/\s+/).map(Number); return [23, [n[0] || 0, n[1] || 0]]; }
      case 'Rect2D': { const a = kid(el, 'min'), b = kid(el, 'max'); return [24, [...(a ? vec(a, 'XY') : [0, 0]), ...(b ? vec(b, 'XY') : [0, 0])]]; }
      case 'PhysicalProperties': {
        const c = kid(el, 'CustomPhysics');
        if (!c || c.text.trim().toLowerCase() !== 'true') return [25, null];
        return [25, ['Density', 'Friction', 'Elasticity', 'FrictionWeight', 'ElasticityWeight'].map(k => knum(el, k))];
      }
      case 'SharedString': return [28, sstr.get(t.trim()) || new Uint8Array(0)];
      case 'Font': {
        const f = kid(el, 'Family'), u = f && (kid(f, 'url') || kid(f, 'uri'));
        return [32, { family: u ? u.text.trim() : '', weight: knum(el, 'Weight', 400), style: (kid(el, 'Style') || { text: 'Normal' }).text.trim() }];
      }
      default: return null;
    }
  }

  function readXml(u8) {
    const doc = parseXml(utf8.decode(u8));
    const top = doc.kids.find(k => k.tag === 'roblox');
    if (!top) throw new Error('not a Roblox file');
    const sstr = new Map();
    const ss = kid(top, 'SharedStrings');
    if (ss) for (const k of ss.kids) if (k.tag === 'SharedString') sstr.set(k.attrs.md5 || k.attrs.key || '', b64(k.text));
    const meta = new Map();
    for (const k of top.kids) if (k.tag === 'Meta') meta.set(k.attrs.name || '', k.text);
    const byRef = new Map(), refProps = [];
    let dropped = 0;
    const walk = (el, parent) => {
      const it = new Inst(el.attrs.class || 'Folder');
      it.parent = parent;
      if (el.attrs.referent) byRef.set(el.attrs.referent, it);
      for (const k of el.kids) {
        if (k.tag === 'Properties') {
          for (const p of k.kids) {
            const name = p.attrs.name;
            if (!name) continue;
            const tv = xmlValue(p, sstr);
            if (!tv) { dropped++; continue; }
            it.props.set(name, { t: tv[0], v: tv[1] });
            if (tv[0] === 19) refProps.push(it.props.get(name));
          }
        } else if (k.tag === 'Item') it.children.push(walk(k, it));
      }
      return it;
    };
    const roots = top.kids.filter(k => k.tag === 'Item').map(k => walk(k, null));
    for (const p of refProps) p.v = byRef.get(p.v) || null;
    return { roots, meta, format: 'xml', droppedProps: dropped };
  }

  function read(u8) {
    if (!(u8 instanceof Uint8Array)) u8 = new Uint8Array(u8);
    const head = String.fromCharCode(...u8.subarray(0, 8));
    const doc = head === '<roblox!' ? readBinary(u8) : readXml(u8);
    doc.insts = [];
    const add = it => { doc.insts.push(it); it.children.forEach(add); };
    doc.roots.forEach(add);
    return doc;
  }

  // ---------------------------------------------------------------- binary writer
  class Wr {
    constructor() { this.buf = new Uint8Array(1 << 16); this.n = 0; this.dv = new DataView(this.buf.buffer); }
    need(k) {
      if (this.n + k <= this.buf.length) return;
      let c = this.buf.length * 2;
      while (c < this.n + k) c *= 2;
      const b = new Uint8Array(c); b.set(this.buf.subarray(0, this.n));
      this.buf = b; this.dv = new DataView(b.buffer);
    }
    u8(v) { this.need(1); this.buf[this.n++] = v; }
    u16(v) { this.need(2); this.dv.setUint16(this.n, v, true); this.n += 2; }
    i16(v) { this.need(2); this.dv.setInt16(this.n, v, true); this.n += 2; }
    u32(v) { this.need(4); this.dv.setUint32(this.n, v >>> 0, true); this.n += 4; }
    i32(v) { this.need(4); this.dv.setInt32(this.n, v | 0, true); this.n += 4; }
    f32(v) { this.need(4); this.dv.setFloat32(this.n, fin(v), true); this.n += 4; }
    f64(v) { this.need(8); this.dv.setFloat64(this.n, Number.isNaN(v) ? 0 : v, true); this.n += 8; }
    raw(b) { this.need(b.length); this.buf.set(b, this.n); this.n += b.length; }
    str(v) { const b = bytes(v); this.u32(b.length); this.raw(b); }
    planes(rows, w) {   // rows: Uint8Array of n big-endian values
      const n = rows.length / w;
      this.need(rows.length);
      for (let j = 0; j < w; j++) for (let i = 0; i < n; i++) this.buf[this.n + j * n + i] = rows[i * w + j];
      this.n += rows.length;
    }
    u32s(vals) { const b = new Uint8Array(vals.length * 4), dv = new DataView(b.buffer); vals.forEach((v, i) => dv.setUint32(4 * i, v >>> 0)); this.planes(b, 4); }
    ints(vals) { this.u32s(vals.map(x => ((x << 1) ^ (x >> 31)) >>> 0)); }
    floats(vals) {
      const b = new Uint8Array(vals.length * 4), dv = new DataView(b.buffer);
      vals.forEach((v, i) => { dv.setFloat32(4 * i, fin(v)); const t = dv.getUint32(4 * i); dv.setUint32(4 * i, ((t << 1) | (t >>> 31)) >>> 0); });
      this.planes(b, 4);
    }
    refs(vals) { let last = 0; this.ints(vals.map(v => { const d = v - last; last = v; return d; })); }
    done() { return this.buf.slice(0, this.n); }
  }
  const fin = v => (Number.isNaN(v) || v == null ? 0 : Math.max(-3.4e38, Math.min(3.4e38, v)));
  const i32 = v => { v = Math.trunc(Number(v) || 0); return v > 2147483647 ? 2147483647 : v < -2147483648 ? -2147483648 : v; };

  const DEFAULTS = {
    1: '', 2: false, 3: 0, 4: 0, 5: 0, 6: [0, 0], 7: [0, 0, 0, 0], 8: [0, 0, 0, 0, 0, 0], 9: 0, 10: 0, 11: 194,
    12: [0, 0, 0], 13: [0, 0], 14: [0, 0, 0], 16: [0, 0, 0, ...IDENT], 18: 0, 19: null, 20: [0, 0, 0], 21: [[0, 0, 0], [1, 0, 0]],
    22: [[0, 1, 1, 1, 0], [1, 1, 1, 1, 0]], 23: [0, 0], 24: [0, 0, 0, 0], 25: null,
  };

  function writeValues(w, t, vals, refOf) {
    const col = k => vals.map(v => v[k]);
    switch (t) {
      case 1: vals.forEach(v => w.str(v)); break;
      case 2: vals.forEach(v => w.u8(v ? 1 : 0)); break;
      case 3: w.ints(vals.map(i32)); break;
      case 4: w.floats(vals.map(Number)); break;
      case 5: vals.forEach(v => w.f64(Number(v) || 0)); break;
      case 6: w.floats(col(0)); w.ints(col(1).map(i32)); break;
      case 7: w.floats(col(0)); w.floats(col(2)); w.ints(col(1).map(i32)); w.ints(col(3).map(i32)); break;
      case 8: vals.forEach(v => v.forEach(x => w.f32(x))); break;
      case 9: case 10: vals.forEach(v => w.u8(v & 255)); break;
      case 11: case 18: w.u32s(vals.map(v => i32(v) >>> 0)); break;
      case 12: case 14: w.floats(col(0)); w.floats(col(1)); w.floats(col(2)); break;
      case 13: w.floats(col(0)); w.floats(col(1)); break;
      case 16:
        vals.forEach(v => { w.u8(0); for (let k = 3; k < 12; k++) w.f32(v[k]); });
        w.floats(col(0)); w.floats(col(1)); w.floats(col(2));
        break;
      case 19: w.refs(vals.map(refOf)); break;
      case 20: vals.forEach(v => { w.i16(v[0]); w.i16(v[1]); w.i16(v[2]); }); break;
      case 21: vals.forEach(v => { w.u32(v.length); v.forEach(k => { w.f32(k[0]); w.f32(k[1]); w.f32(k[2]); }); }); break;
      case 22: vals.forEach(v => { w.u32(v.length); v.forEach(k => { for (let j = 0; j < 5; j++) w.f32(k[j]); }); }); break;
      case 23: vals.forEach(v => { w.f32(v[0]); w.f32(v[1]); }); break;
      case 24: w.floats(col(0)); w.floats(col(1)); w.floats(col(2)); w.floats(col(3)); break;
      case 25: vals.forEach(v => { if (!v) w.u8(0); else { w.u8(1); for (let j = 0; j < 5; j++) w.f32(v[j]); } }); break;
      default: throw new Error('can\'t write type ' + t);
    }
  }

  function write(doc) {
    const insts = [];
    const add = it => { insts.push(it); it.children.forEach(add); };
    doc.roots.forEach(add);
    const index = new Map(insts.map((it, i) => [it, i]));
    const refOf = v => (v && index.has(v) ? index.get(v) : -1);
    const byClass = new Map();
    insts.forEach((it, i) => { if (!byClass.has(it.cls)) byClass.set(it.cls, []); byClass.get(it.cls).push(i); });
    const names = [...byClass.keys()].sort();
    const chunks = [];
    const chunk = (name, w) => chunks.push([name, w.done()]);
    names.forEach((cn, cid) => {
      const ids = byClass.get(cn);
      const svc = ids.every(i => insts[i].service && !insts[i].parent);
      const w = new Wr();
      w.u32(cid); w.str(cn); w.u8(svc ? 1 : 0); w.u32(ids.length); w.refs(ids);
      if (svc) ids.forEach(() => w.u8(1));
      chunk('INST', w);
    });
    names.forEach((cn, cid) => {
      const ids = byClass.get(cn);
      const propTypes = new Map();
      for (const i of ids) for (const [pn, p] of insts[i].props) if (ENGINE_TYPES.has(p.t) && !propTypes.has(pn)) propTypes.set(pn, p.t);
      for (const [pn, t] of [...propTypes].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        const vals = ids.map(i => { const p = insts[i].props.get(pn); return p && p.t === t ? p.v : DEFAULTS[t]; });
        const w = new Wr();
        w.u32(cid); w.str(pn); w.u8(t);
        writeValues(w, t, vals, refOf);
        chunk('PROP', w);
      }
    });
    const order = [];
    const post = it => { it.children.forEach(post); order.push(it); };
    doc.roots.forEach(post);
    const w = new Wr();
    w.u8(0); w.u32(order.length); w.refs(order.map(refOf)); w.refs(order.map(it => refOf(it.parent)));
    chunk('PRNT', w);
    const end = new Wr(); end.raw(enc.encode('</roblox>')); chunk('END', end);

    const out = new Wr();
    out.raw(enc.encode('<roblox!')); out.raw(new Uint8Array([0x89, 0xff, 0x0d, 0x0a, 0x1a, 0x0a]));
    out.u16(0); out.i32(names.length); out.i32(insts.length); out.raw(new Uint8Array(8));
    for (const [name, data] of chunks) {
      const packed = name !== 'END' && data.length > 64 ? lz4pack(data) : null;
      const body = packed && packed.length < data.length ? packed : null;
      out.raw(enc.encode(name.padEnd(4, '\0'))); out.u32(body ? body.length : 0); out.u32(data.length); out.u32(0); out.raw(body || data);
    }
    return out.done();
  }

  // LZ4 block compression (greedy, one candidate per hash): the chunks Roblox files use
  function lz4pack(src) {
    const n = src.length, out = new Uint8Array(n + ((n / 255) | 0) + 16), table = new Int32Array(1 << 16).fill(-1);
    let o = 0, anchor = 0, i = 0;
    const len = (v) => { while (v >= 255) { out[o++] = 255; v -= 255; } out[o++] = v; };
    const emit = (litEnd, off, ml) => {
      const lit = litEnd - anchor, tokAt = o++;
      if (lit >= 15) len(lit - 15);
      out.set(src.subarray(anchor, litEnd), o); o += lit;
      let tok = Math.min(lit, 15) << 4;
      if (off) {
        out[o++] = off & 255; out[o++] = off >> 8;
        tok |= Math.min(ml - 4, 15);
        if (ml - 4 >= 15) len(ml - 4 - 15);
      }
      out[tokAt] = tok;
    };
    const limit = n - 12;   // the last match starts 12+ bytes before the end and leaves 5 literals
    while (i < limit) {
      const h = Math.imul(src[i] | (src[i + 1] << 8) | (src[i + 2] << 16) | (src[i + 3] << 24), 2654435761) >>> 16;
      const ref = table[h];
      table[h] = i;
      if (ref >= 0 && i - ref < 65536 && src[ref] === src[i] && src[ref + 1] === src[i + 1] && src[ref + 2] === src[i + 2] && src[ref + 3] === src[i + 3]) {
        let ml = 4;
        const max = n - 5 - i;
        while (ml < max && src[ref + ml] === src[i + ml]) ml++;
        emit(i, i - ref, ml);
        i += ml; anchor = i;
      } else i++;
    }
    emit(n, 0, 0);
    return out.subarray(0, o);
  }

  // ---------------------------------------------------------------- 2016 engine fix-ups
  const SERVICES = new Set(['AdService', 'AssetService', 'BadgeService', 'CSGDictionaryService', 'ChangeHistoryService',
    'Chat', 'CollectionService', 'ContentProvider', 'ContextActionService', 'CookiesService', 'Debris', 'FWService',
    'GamePassService', 'Geometry', 'GuiService', 'HttpService', 'InsertService', 'JointsService', 'Lighting', 'LogService',
    'LuaWebService', 'MarketplaceService', 'NonReplicatedCSGDictionaryService', 'NotificationService', 'PhysicsService',
    'Players', 'PointsService', 'RenderHooksService', 'ReplicatedFirst', 'ReplicatedStorage', 'RunService', 'ScriptContext',
    'ScriptInformationProvider', 'ScriptService', 'Selection', 'ServerScriptService', 'ServerStorage', 'SocialService',
    'SoundService', 'StarterGui', 'StarterPack', 'StarterPlayer', 'Teams', 'TeleportService', 'TestService', 'TimerService',
    'UserInputService', 'Visit', 'Workspace']);
  // (class.property) types the engine expects that its own sample places don't show
  const CLASS_TYPES = {
    'BrickColorValue.Value': 11, 'IntValue.Value': 3, 'NumberValue.Value': 5, 'StringValue.Value': 1, 'BoolValue.Value': 2,
    'ObjectValue.Value': 19, 'Vector3Value.Value': 14, 'CFrameValue.Value': 16, 'Color3Value.Value': 12, 'RayValue.Value': 8,
    'IntConstrainedValue.value': 3, 'DoubleConstrainedValue.value': 5,
  };
  const BRICKCOLOR_PROPS = new Set(['BrickColor', 'TeamColor', 'HeadColor', 'LeftArmColor', 'RightArmColor', 'LeftLegColor', 'RightLegColor', 'TorsoColor']);
  const BODYCOLOR3 = { HeadColor3: 'HeadColor', LeftArmColor3: 'LeftArmColor', RightArmColor3: 'RightArmColor', LeftLegColor3: 'LeftLegColor', RightLegColor3: 'RightLegColor', TorsoColor3: 'TorsoColor' };
  // safe mode leaves out the binary data blobs most likely to trip the 2016 engine's readers
  const SAFE_DROP = new Set(['SmoothGrid', 'ClusterGridV3', 'ClusterGridV2', 'ClusterGrid', 'MaterialColors', 'MeshData', 'ChildData', 'PhysicsData', 'PhysicalConfigData', 'InitialSize']);
  const RENAME_CLASS = { Actor: 'Model', WorldModel: 'Model' };
  // Enum.Font in 2016
  const FONT = { legacy: 0, arial: 1, sourcesans: 3, sourcesanspro: 3, bodoni: 7, garamond: 8, cartoon: 9, comicneueangular: 9, code: 10, inconsolata: 10, highway: 11, gothamssm: 11, gotham: 11, scifi: 12, zekton: 12, arcade: 13, pressstart2p: 13, fantasy: 14, merriweather: 14, antique: 15, specialelite: 15 };

  function convert(v, from, to) {
    if (from === to) return v;
    const isNum = t => t === 3 || t === 4 || t === 5 || t === 11 || t === 18 || t === 27;
    if (isNum(from) && isNum(to)) {
      const n = Number(v) || 0;
      if (to === 4 || to === 5) return n;
      return to === 11 ? (BRICK.has(i32(n)) ? i32(n) : 194) : i32(n);
    }
    if (from === 2 && isNum(to)) return v ? 1 : 0;
    if (isNum(from) && to === 2) return Number(v) !== 0;
    const rgb = from === 12 ? v.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255)) : from === 26 ? v : from === 11 ? brickRGB(v) : null;
    if (rgb) {
      if (to === 12) return rgb.map(x => x / 255);
      if (to === 26) return rgb;
      if (to === 11) return nearestBrick(rgb[0], rgb[1], rgb[2]);
    }
    if ((from === 1 || from === 28 || from === 29) && to === 1) return bytes(v);
    if (from === 30 && to === 16) return v || DEFAULTS[16].slice();
    if (from === 14 && to === 20) return v.map(x => Math.round(x));
    if (from === 20 && to === 14) return v.slice();
    if (from === 15 && to === 13) return v.slice();
    return undefined;
  }

  // Snapshot uploads: services saved as Models inside a "CreatorId=... PlaceId=..." Model.
  const SNAPSHOT = { Workspace: 'Workspace', Lighting: 'Lighting', StarterPack: 'StarterPack', StarterGui: 'StarterGui', Soundscape: 'SoundService', Teams: 'Teams' };
  function asService(m, cls) {
    m.cls = cls; m.service = true;
    for (const k of [...m.props.keys()]) if (k !== 'Name') m.props.delete(k);
  }
  function fixSnapshots(doc, notes) {
    const snaps = doc.roots.filter(it => it.cls === 'Model' && it.name.startsWith('CreatorId='));
    if (doc.roots.some(it => it.cls === 'Workspace')) {
      if (snaps.length) { doc.roots = doc.roots.filter(it => !snaps.includes(it)); notes.push('dropped a saved place snapshot'); }
      return;
    }
    if (snaps.length) {
      const keep = doc.roots.filter(it => it.cls !== 'Model');
      for (const c of snaps[0].children) if (c.cls === 'Model' && SNAPSHOT[c.name]) { asService(c, SNAPSHOT[c.name]); c.parent = null; keep.push(c); }
      doc.roots = keep;
      notes.push('rebuilt the place from a saved snapshot');
      return;
    }
    for (const it of doc.roots) if (it.cls === 'Model' && SNAPSHOT[it.name]) asService(it, SNAPSHOT[it.name]);
  }

  // A file that's a model (no Workspace): put it in a new Workspace with a baseplate and spawn.
  function wrapModel(doc, notes) {
    if (doc.roots.some(it => it.cls === 'Workspace')) return;
    const ws = new Inst('Workspace'); ws.service = true; ws.set('Name', 1, enc.encode('Workspace'));
    const lighting = new Inst('Lighting'); lighting.service = true; lighting.set('Name', 1, enc.encode('Lighting'));
    const base = new Inst('Part');
    base.set('Name', 1, enc.encode('Baseplate')); base.set('Anchored', 2, true); base.set('Locked', 2, true);
    base.set('size', 14, [512, 1, 512]); base.set('CFrame', 16, [0, -0.5, 0, ...IDENT]); base.set('BrickColor', 11, 28);
    const spawn = new Inst('SpawnLocation');
    spawn.set('Name', 1, enc.encode('SpawnLocation')); spawn.set('Anchored', 2, true);
    spawn.set('size', 14, [6, 1, 6]); spawn.set('CFrame', 16, [0, 0.5, -20, ...IDENT]); spawn.set('BrickColor', 11, 194);
    for (const p of [base, spawn]) { p.parent = ws; ws.children.push(p); }
    const rest = [];
    for (const it of doc.roots) {
      if (SERVICES.has(it.cls)) rest.push(it);
      else { it.parent = ws; ws.children.push(it); }
    }
    doc.roots = [ws, lighting, ...rest];
    notes.push('this file is a model, so it was put in a new place with a baseplate');
  }

  // No SpawnLocation: Roblox puts you at the middle of the map (0, 0, 0). When there's no floor
  // there either, you'd fall forever, so add an invisible spawn on top of the biggest floor.
  // A spawn only counts if it works: turned on, and for everyone (Neutral) or for a team that players
  // get put on (AutoAssignable). Team-only spawns with no such team left players in the void too.
  function ensureSpawn(doc, notes) {
    const ws = doc.roots.find(it => it.cls === 'Workspace');
    if (!ws) return;
    const parts = [];
    const spawns = [];
    const walk = it => { for (const c of it.children) { if (c.cls === 'SpawnLocation') spawns.push(c); if (c.props.has('size') && c.props.has('CFrame') && c.cls !== 'Terrain') parts.push(c); walk(c); } };
    walk(ws);
    const teams = doc.roots.find(it => it.cls === 'Teams');
    const autoTeams = new Set((teams ? teams.children : []).filter(t => t.cls === 'Team' && t.get('AutoAssignable') !== false).map(t => t.get('TeamColor')));
    const works = sp => sp.get('Enabled') !== false && (sp.get('Neutral') !== false || autoTeams.has(sp.get('TeamColor')));
    if (spawns.some(works)) return;
    const box = it => {   // world-space bounds of a part
      const s = it.props.get('size').v, cf = it.props.get('CFrame').v, h = [s[0] / 2, s[1] / 2, s[2] / 2];
      const e = [0, 1, 2].map(r => Math.abs(cf[3 + r * 3]) * h[0] + Math.abs(cf[4 + r * 3]) * h[1] + Math.abs(cf[5 + r * 3]) * h[2]);
      return { min: [cf[0] - e[0], cf[1] - e[1], cf[2] - e[2]], max: [cf[0] + e[0], cf[1] + e[1], cf[2] + e[2]] };
    };
    const solid = it => { const t = it.props.get('Transparency'), c = it.props.get('CanCollide'); return !(t && t.v >= 0.95) && !(c && c.v === false); };
    const floors = parts.filter(solid).map(it => ({ it, b: box(it) }));
    if (floors.some(({ b }) => b.min[0] <= 0 && b.max[0] >= 0 && b.min[2] <= 0 && b.max[2] >= 0 && b.max[1] > -25 && b.max[1] < 25)) return;
    let best = null;
    for (const f of floors) {
      const area = (f.b.max[0] - f.b.min[0]) * (f.b.max[2] - f.b.min[2]);
      if (area >= 16 && f.b.max[1] - f.b.min[1] < 60 && (!best || area > best.area)) best = { area, ...f };
    }
    if (!best) return;
    const sp = new Inst('SpawnLocation');
    const x = (best.b.min[0] + best.b.max[0]) / 2, z = (best.b.min[2] + best.b.max[2]) / 2;
    sp.set('Name', 1, enc.encode('SpawnLocation'));
    sp.set('Anchored', 2, true); sp.set('CanCollide', 2, false); sp.set('Transparency', 4, 1);
    sp.set('Neutral', 2, true); sp.set('Duration', 3, 0);
    sp.set('size', 14, [6, 1, 6]); sp.set('CFrame', 16, [x, best.b.max[1] + 0.5, z, ...IDENT]);
    sp.parent = ws; ws.children.push(sp);
    notes.push((spawns.length ? 'none of this place\'s spawns can be used (turned off or for a team nobody joins)' : 'this place has no spawn') + ', so one was added on ' + best.it.name);
  }

  // Scripts from 2017 on call a few things the 2016 engine doesn't have. compatSource() rewrites them
  // into calls to small stand-ins put at the top of the script (on its first line, so error line
  // numbers stay the same):
  //   x:GetDescendants()               -> __gnDesc(x)           (GetChildren, all the way down)
  //   x:GetPropertyChangedSignal("P")  -> __gnPCS(x, "P")       (Changed, for that property only)
  //   x.Activated:...                  -> __gnAct(x):...        (a button's MouseButton1Click; a Tool's Activated)
  //   game:BindToClose(f)              -> nothing                (there's no server shutting down)
  //   x:FindFirstChildWhichIsA(c), x:FindFirstAncestorWhichIsA(c), x:FindFirstAncestorOfClass(c),
  //   x:FindFirstAncestor(name)        -> the same, done by hand
  //   Instance.new("UI...")            -> a stand-in table when the engine doesn't have that class
  //                                       (UIAspectRatioConstraint, UIListLayout... from 2017 on)
  //   Sound.PlaybackSpeed              -> Sound.Pitch;  workspace.Gravity -> 196.2 (setting it does nothing)
  //   CollectionService:AddTag / HasTag / RemoveTag / GetTagged -> the same, in a table all scripts share
  //   Instance.new("Beam" / "Trail")   -> a stand-in table, like the UI classes
  //   TweenService:Create(o, TweenInfo.new(t), goal):Play() -> a stand-in that moves o's properties over t
  //   ContentProvider.RequestQueueSize -> 0                     (loading screens waiting for downloads
  //                                                              from Roblox, which never come here)
  const COMPAT_LUA = {
    __gnDesc: 'local function __gnDesc(o) local r = {} local function a(x) for _, c in ipairs(x:GetChildren()) do r[#r + 1] = c a(c) end end a(o) return r end ',
    __gnPCS: 'local function __gnPCS(o, p) local b = Instance.new("BindableEvent") o.Changed:connect(function(n) if n == p then b:Fire() end end) return b.Event end ',
    __gnAct: 'local function __gnAct(o) if o:IsA("GuiButton") then return o.MouseButton1Click end return o.Activated end ',
    __gnBTC: 'local function __gnBTC(o, f) end ',
    __gnFCW: 'local function __gnFCW(o, c, r) for _, x in ipairs(o:GetChildren()) do if x:IsA(c) then return x end if r then local y = __gnFCW(x, c, r) if y then return y end end end return nil end ',
    __gnFAW: 'local function __gnFAW(o, c, exact) local p = o.Parent while p do if (exact and p.ClassName == c) or (not exact and p:IsA(c)) then return p end p = p.Parent end return nil end ',
    __gnFA: 'local function __gnFA(o, n) local p = o.Parent while p do if p.Name == n then return p end p = p.Parent end return nil end ',
    __gnNew: 'local function __gnNew(c, p) local ok, o = pcall(Instance.new, c, p) if ok then return o end return {} end ',
    __gnTween: 'local function __gnTweenInfo(t, ...) return { Time = t or 1 } end '
      + 'local __gnTweenService = { Create = function(self, o, info, goal) local tw = {} '
      + 'local done = Instance.new("BindableEvent") tw.Completed = done.Event local stop = false '
      + 'function tw:Cancel() stop = true end function tw:Pause() stop = true end '
      + 'function tw:Play() stop = false spawn(function() local from = {} for k in pairs(goal) do from[k] = o[k] end '
      + 'local T = (info and info.Time) or 1 local t0 = tick() while not stop do local a = T > 0 and math.min(1, (tick() - t0) / T) or 1 '
      + 'for k, v in pairs(goal) do local s0 = from[k] pcall(function() if type(v) == "number" then o[k] = s0 + (v - s0) * a else o[k] = s0:lerp(v, a) end end) end '
      + 'if a >= 1 then break end wait() end if not stop then for k, v in pairs(goal) do pcall(function() o[k] = v end) end done:Fire() end end) end '
      + 'return tw end } ',
    __gnTag: 'local function __gnTags() _G.__gnTags = _G.__gnTags or setmetatable({}, { __mode = "k" }) return _G.__gnTags end '
      + 'local function __gnAddTag(s, o, t) local T = __gnTags() T[o] = T[o] or {} T[o][t] = true end '
      + 'local function __gnHasTag(s, o, t) local T = __gnTags() return T[o] ~= nil and T[o][t] == true end '
      + 'local function __gnRemoveTag(s, o, t) local T = __gnTags() if T[o] then T[o][t] = nil end end '
      + 'local function __gnGetTagged(s, t) local r = {} for o, ts in pairs(__gnTags()) do if ts[t] and o.Parent then r[#r + 1] = o end end return r end ',
  };
  // the start of the expression a method is called on, scanning back from `end` (balanced () [] and strings)
  function receiverStart(src, end) {
    let i = end;
    for (;;) {
      while (i > 0 && /[\w]/.test(src[i - 1])) i--;
      if (i > 0 && (src[i - 1] === ')' || src[i - 1] === ']')) {
        const close = src[i - 1], open = close === ')' ? '(' : '[';
        let depth = 0, j = i - 1;
        for (; j >= 0; j--) {
          const c = src[j];
          if (c === '"' || c === "'") { const q = c; j--; while (j >= 0 && src[j] !== q) j--; continue; }
          if (c === close) depth++;
          else if (c === open && --depth === 0) break;
        }
        if (j < 0) return -1;
        i = j;
        continue;
      }
      if (i > 0 && (src[i - 1] === '.' || src[i - 1] === ':')) { i--; continue; }
      break;
    }
    // a call's parentheses belong to a name before them; a bare ( ... ) is a whole expression
    return i < end ? i : -1;
  }
  function compatSource(src) {
    if (!/GetDescendants|GetPropertyChangedSignal|\.Activated\b|RequestQueueSize|BindToClose|WhichIsA|FindFirstAncestor|Instance\.new\s*\(\s*["']UI|PlaybackSpeed|\.Gravity\b|Tag(?:ged)?\s*\(|["'](?:Beam|Trail)["']|TweenService|TweenInfo/.test(src)) return src;
    const used = new Set();
    let out = src;
    const rewrite = (re, make) => {
      let m, guard = 0;
      re.lastIndex = 0;
      while ((m = re.exec(out)) && guard++ < 2000) {
        const start = receiverStart(out, m.index);
        if (start < 0) continue;
        const recv = out.slice(start, m.index);
        if (!recv || /^(end|then|do|else|return|and|or|not|local|in)$/.test(recv)) continue;
        const rep = make(recv, m);
        out = out.slice(0, start) + rep + out.slice(m.index + m[0].length);
        re.lastIndex = start + rep.length;
      }
    };
    rewrite(/:\s*GetDescendants\s*\(\s*\)/g, recv => { used.add('__gnDesc'); return '__gnDesc(' + recv + ')'; });
    rewrite(/:\s*GetPropertyChangedSignal\s*\(/g, recv => { used.add('__gnPCS'); return '__gnPCS(' + recv + ', '; });
    rewrite(/:\s*FindFirstChildWhichIsA\s*\(/g, recv => { used.add('__gnFCW'); return '__gnFCW(' + recv + ', '; });
    rewrite(/:\s*FindFirstAncestorWhichIsA\s*\(/g, recv => { used.add('__gnFAW'); return '__gnFAW(' + recv + ', '; });
    rewrite(/:\s*FindFirstAncestorOfClass\s*\(([^()]*)\)/g, (recv, m) => { used.add('__gnFAW'); return '__gnFAW(' + recv + ', ' + m[1] + ', true)'; });
    rewrite(/:\s*FindFirstAncestor\s*\(/g, recv => { used.add('__gnFA'); return '__gnFA(' + recv + ', '; });
    rewrite(/:\s*BindToClose\s*\(/g, recv => { used.add('__gnBTC'); return '__gnBTC(' + recv + ', '; });
    rewrite(/\.Activated(?=\s*:\s*(?:[Cc]onnect|[Ww]ait)\b)/g, recv => { used.add('__gnAct'); return '__gnAct(' + recv + ')'; });
    out = out.replace(/\.RequestQueueSize\b(?!\s*=[^=])/g, '.RequestQueueSize*0');
    // Sound.PlaybackSpeed (2017) is the 2016 Pitch; workspace.Gravity (2017) is always 196.2 here
    out = out.replace(/\.PlaybackSpeed\b/g, '.Pitch');
    out = out.replace(/\b((?:game\s*[.:]\s*(?:GetService\s*\(\s*["']Workspace["']\s*\)|Workspace)|[Ww]orkspace))\s*\.\s*Gravity\b(\s*=(?!=))?/g,
      (m0, w, assign) => assign ? 'local __gnGravity =' : '196.2');
    out = out.replace(/\bInstance\.new\s*\(\s*(["'](?:UI\w+|Beam|Trail)["'])/g, (_, c) => { used.add('__gnNew'); return '__gnNew(' + c; });
    // TweenService (2017): a stand-in that moves the properties itself
    out = out.replace(/\bgame\s*:\s*GetService\s*\(\s*["']TweenService["']\s*\)|\bgame\s*\.\s*TweenService\b/g, () => { used.add('__gnTween'); return '__gnTweenService'; });
    out = out.replace(/\bTweenInfo\s*\.\s*new\s*\(/g, () => { used.add('__gnTween'); return '__gnTweenInfo('; });
    // CollectionService tags (2017): kept in a table every script shares (_G)
    for (const m of ['AddTag', 'HasTag', 'RemoveTag', 'GetTagged']) {
      rewrite(new RegExp(':\\s*' + m + '\\s*\\(', 'g'), recv => { used.add('__gnTag'); return '__gn' + m + '(' + recv + ', '; });
    }
    if (!used.size) return out;
    return [...used].map(k => COMPAT_LUA[k]).join('') + out;
  }

  // ---------------------------------------------------------------- stand-ins for missing assets
  // An uploaded place only names its images, meshes and sounds; the ones Roblox hosts can't be
  // downloaded here, and some rbxasset:// files it names aren't in this engine's content (or are,
  // with other capitals: Windows didn't mind, the browser's file system does). standIns() fills in:
  //   rbxasset:// paths  -> the right capitals; .wav sounds -> the engine's .mp3 of the same name
  //   Tools              -> GN-BLOX gear built from parts inside the handle (sword, gun, rocket,
  //                         slingshot, trowel, bomb, ball, coil, skateboard, trophy, potion) and an icon
  //   ImageLabel / ImageButton -> a GN-BLOX icon picked from its name (shop, coins, wins...), or a
  //                         button background
  //   faces, particles, skyboxes, sounds -> GN-BLOX stand-ins / the engine's own sounds
  //   MeshPart (2017)    -> a Part (the engine has no MeshPart), so characters made of them show up
  // GN-BLOX's stand-in images are game-assets/<id>.png (tools/build_standins.py), ids from 9100000001.
  const CONTENT = new Map(CONTENT_PATHS.map(p => [p.toLowerCase(), p]));
  const STANDIN_BASE = 9100000000;
  const STANDIN = {};
  ['sword', 'gun', 'rocket', 'slingshot', 'trowel', 'bomb', 'ball', 'coil', 'skateboard', 'trophy',
    'potion', 'tool', 'cart', 'coin', 'star', 'gear', 'speaker', 'close', 'arrow', 'brick',
    'palette', 'person', 'play', 'lock', 'check', 'panel', 'sparkle', 'face', 'evilface', 'sky_bk',
    'sky_dn', 'sky_ft', 'sky_lf', 'sky_rt', 'sky_up', 'menu', 'shield', 'heart', 'clock', 'info',
    'question', 'dash', 'gift', 'panel_light'].forEach((n, i) => { STANDIN[n] = STANDIN_BASE + i + 1; });
  const standinUrl = name => 'http://www.roblox.com/asset/?id=' + STANDIN[name];
  // which icon a name asks for (first match wins)
  const ICON_WORDS = [
    [/shop|store|buy|cart|purchase/, 'cart'], [/coin|cash|money|robux|point|credit|gem/, 'coin'], [/win|trophy|victor|rank|leader/, 'trophy'],
    [/level|xp|star|rating|rare/, 'star'], [/setting|option|gear|config/, 'gear'], [/music|sound|mute|audio|volume/, 'speaker'],
    [/close|exit|cancel|^x$/, 'close'], [/teleport|\btp|travel|next|arrow|back|go\b/, 'arrow'], [/block|build|brick|material|wood|stone/, 'brick'],
    [/colou?r|paint/, 'palette'], [/profile|player|avatar|user|character|skin/, 'person'], [/play|start/, 'play'], [/lock/, 'lock'],
    [/check|done|\bok\b|yes|select|equip/, 'check'], [/menu|list/, 'menu'], [/shield|armou?r|defen/, 'shield'], [/health|heart|life|\bhp\b/, 'heart'],
    [/time|timer|clock/, 'clock'], [/info|help|about|guide/, 'info'], [/gift|reward|daily|code|bonus/, 'gift'], [/dash|speed|boost|energy/, 'dash'],
    [/sword|blade|katana|weapon/, 'sword'], [/gun|rifle|pistol|sniper|blaster/, 'gun'], [/question|\?/, 'question'],
  ];
  const TOOL_WORDS = [
    [/sword|blade|katana|sabre|saber|dagger|knife|scythe|axe/, 'sword'], [/rocket|launcher|bazooka|rpg/, 'rocket'],
    [/sling/, 'slingshot'], [/trowel|build|hammer|wall/, 'trowel'], [/bomb|grenade|dynamite|explosive/, 'bomb'],
    [/superball|ball/, 'ball'], [/coil|spring/, 'coil'], [/skate|board/, 'skateboard'], [/trophy|cup|award/, 'trophy'],
    [/potion|drink|cola|soda|juice|bottle|heal/, 'potion'],
    [/gun|rifle|pistol|sniper|blaster|smg|sten|tommy|uzi|shotgun|revolver|paintball|laser|plasma|minigun/, 'gun'],
  ];
  // the engine's own sounds, for sounds named like these
  const SOUND_WORDS = [
    [/lunge/, 'sounds/swordlunge.mp3'], [/slash|swing|sword/, 'sounds/swordslash.mp3'], [/unsheath|equip|draw/, 'sounds/unsheath.mp3'],
    [/sling/, 'sounds/Rubber band sling shot.mp3'], [/explo|boom|blast|^exp$|kaboom/, 'sounds/impact_explosion_01.mp3'],
    [/click|tick|beep|timer/, 'sounds/clickfast.mp3'], [/splat/, 'sounds/splat.mp3'], [/splash|water|drown/, 'sounds/impact_water.mp3'],
    [/swoosh|whoosh|woosh|throw|launch|rocket|dash/, 'sounds/swoosh.mp3'], [/coil|spring|boing|bounce|rubber/, 'sounds/Rubber band.mp3'],
    [/ping|coin|buy|purchase|collect|pickup|reward|cash|money/, 'sounds/electronicpingshort.mp3'], [/victory|win/, 'sounds/victory.mp3'],
    [/switch|button|press|open|door|lever/, 'sounds/switch.mp3'], [/jump/, 'sounds/action_jump.mp3'], [/fall/, 'sounds/action_falling.mp3'],
    [/hit|hurt|damage|ouch|oof|punch/, 'sounds/hit.mp3'], [/shot|shoot|fire|gun|bang|pistol|rifle|snap/, 'sounds/snap.mp3'],
    [/death|die|scream|uh/, 'sounds/uuhhh.mp3'], [/step|walk|run/, 'sounds/action_footsteps_plastic.mp3'],
  ];
  // GN-BLOX gear, in the handle's box: each piece is [size W,T,L, centre W,T,L (fractions; L = +0.5
  // is the end the hand holds), BrickColor, material, shape (1 block, 0 ball), reflectance]
  const GEAR_PIECES = {
    sword: [[0.22, 0.5, 0.2, 0, 0, 0.4, 192, 512, 1], [1, 0.62, 0.06, 0, 0, 0.27, 24, 1088, 1, 0.2], [0.5, 0.22, 0.72, 0, 0, -0.12, 1002, 1088, 1, 0.35], [0.3, 0.3, 0.08, 0, 0, 0.5, 24, 1088, 0]],
    gun: [[0.7, 0.7, 0.42, 0, 0, 0.05, 26, 272, 1], [0.4, 0.4, 0.5, 0, 0.05, -0.28, 199, 1088, 1, 0.2], [0.6, 0.55, 0.22, 0, -0.05, 0.38, 192, 512, 1], [0.3, 0.25, 0.12, 0, 0.42, -0.05, 199, 1088, 1]],
    rocket: [[0.8, 0.8, 0.95, 0, 0, 0, 28, 272, 1], [0.95, 0.95, 0.1, 0, 0, -0.47, 21, 272, 1], [0.3, 0.35, 0.18, 0, 0.55, 0.05, 26, 272, 1], [0.35, 0.5, 0.15, 0, -0.55, 0.18, 26, 272, 1]],
    slingshot: [[0.18, 0.5, 0.5, 0, 0, 0.25, 192, 512, 1], [0.16, 0.45, 0.48, -0.32, 0, -0.22, 192, 512, 1], [0.16, 0.45, 0.48, 0.32, 0, -0.22, 192, 512, 1], [0.8, 0.12, 0.05, 0, 0, -0.42, 21, 272, 1]],
    trowel: [[0.25, 0.4, 0.38, 0, 0, 0.31, 192, 512, 1], [0.12, 0.12, 0.12, 0, 0, 0.06, 199, 1088, 1], [0.95, 0.15, 0.5, 0, 0, -0.22, 194, 1088, 1, 0.25]],
    bomb: [[0.9, 0.9, 0.9, 0, 0, 0, 26, 272, 0], [0.2, 0.2, 0.2, 0, 0, 0.48, 199, 1088, 1], [0.08, 0.08, 0.15, 0, 0, 0.6, 24, 288, 1]],
    ball: [[0.9, 0.9, 0.9, 0, 0, 0, 23, 288, 0]],
    coil: [[0.5, 0.5, 0.15, 0, 0, 0.42, 26, 272, 1], [0.9, 0.9, 0.08, 0, 0, 0.25, 21, 288, 1], [0.9, 0.9, 0.08, 0, 0, 0.08, 21, 288, 1], [0.9, 0.9, 0.08, 0, 0, -0.09, 21, 288, 1], [0.9, 0.9, 0.08, 0, 0, -0.26, 21, 288, 1], [0.9, 0.9, 0.08, 0, 0, -0.43, 21, 288, 1]],
    skateboard: [[0.9, 0.35, 0.95, 0, 0.2, 0, 106, 512, 1], [0.12, 0.3, 0.1, -0.35, -0.3, 0.3, 26, 272, 0], [0.12, 0.3, 0.1, 0.35, -0.3, 0.3, 26, 272, 0], [0.12, 0.3, 0.1, -0.35, -0.3, -0.3, 26, 272, 0], [0.12, 0.3, 0.1, 0.35, -0.3, -0.3, 26, 272, 0]],
    trophy: [[0.9, 0.9, 0.1, 0, 0, 0.45, 192, 512, 1], [0.6, 0.6, 0.1, 0, 0, 0.35, 24, 1088, 1, 0.3], [0.2, 0.2, 0.3, 0, 0, 0.15, 24, 1088, 1, 0.3], [0.8, 0.8, 0.4, 0, 0, -0.25, 24, 1088, 0, 0.3]],
    potion: [[0.8, 0.8, 0.7, 0, 0, 0.12, 1032, 288, 0], [0.3, 0.3, 0.3, 0, 0, -0.33, 1, 272, 1], [0.35, 0.35, 0.1, 0, 0, -0.48, 192, 512, 1]],
  };
  function standIns(doc, bump, opts) {
    const have = opts.have || new Set();
    const all = [];
    const add = it => { all.push(it); it.children.forEach(add); };
    doc.roots.forEach(add);
    const assetId = s => { const m = /roblox\.com\/+asset\/*\?[^"'\s]*?\bid=(\d+)|rbxassetid:\/\/(\d+)/i.exec(s); return m ? (m[1] || m[2]) : null; };
    // a content link this engine can show: an rbxasset:// file it has (capitals fixed), an asset that
    // was uploaded, or a GN-BLOX stand-in. Returns the fixed link, or null when it would be missing.
    const resolve = s => {
      s = str(s || '').trim();
      if (!s) return '';
      const ra = /^rbxasset:\/\/(.+)$/i.exec(s);
      if (ra) {
        const path = ra[1].replace(/\\/g, '/').replace(/\/+/g, '/');
        let hit = CONTENT.get(path.toLowerCase());
        if (!hit && /\.wav$/i.test(path)) hit = CONTENT.get(path.toLowerCase().replace(/\.wav$/, '.mp3'));
        return hit ? 'rbxasset://' + hit : null;
      }
      const id = assetId(s);
      if (id) return (have.has(id) || +id > STANDIN_BASE) ? s : null;
      return s;   // something else (http to another site...): leave it
    };
    const setContent = (it, pn, v) => { const p = it.props.get(pn); it.props.set(pn, { t: p ? p.t : 1, v: enc.encode(v) }); };
    const lower = it => (it ? it.name : '').toLowerCase();
    const pick = (table, text) => { for (const [re, v] of table) if (re.test(text)) return v; return null; };
    const nightSky = (() => {
      const L = all.find(i => i.cls === 'Lighting');
      let h = parseFloat(str(L && L.get('TimeOfDay') || '14'));
      if (!Number.isFinite(h)) h = 14;
      return h < 6 || h >= 18.5;
    })();

    for (const it of all) {
      // content properties: rbxasset capitals and .wav -> .mp3
      for (const [pn, p] of it.props) {
        if (p.t !== 1 || !p.v || p.v.length < 12 || p.v.length > 300 || pn === 'Source' || pn === 'Name') continue;
        const s = str(p.v);
        if (!/^\s*rbxasset:\/\//i.test(s)) continue;
        const r = resolve(s);
        if (r && r !== s.trim()) { p.v = enc.encode(r); bump('rbxasset:// links fixed'); }
      }
      // sound files named in scripts: "rbxasset://sounds\\swordslash.wav" -> the .mp3 the engine has
      if (/Script$/.test(it.cls)) {
        const p = it.props.get('Source');
        if (p && p.v && /rbxasset:\/\//i.test(str(p.v))) {
          const before = str(p.v);
          const after = before.replace(/rbxasset:\/\/([A-Za-z0-9_\-\/\\ .]+?\.(?:wav|mp3|ogg|png|jpg|mesh))/gi, (m0, path) => {
            const r = resolve('rbxasset://' + path.replace(/\\\\/g, '/'));
            return r || m0;
          });
          if (after !== before) { p.v = enc.encode(after); bump('scripts with sound / texture paths fixed'); }
        }
      }
      if (it.cls === 'MeshPart') {
        it.cls = 'Part';
        if (!it.props.has('size') && it.props.has('Size')) { it.props.set('size', it.props.get('Size')); it.props.delete('Size'); }
        if (!it.props.has('size') && it.props.has('InitialSize')) it.props.set('size', it.props.get('InitialSize'));
        it.set('formFactorRaw', 18, 3);
        it.set('shape', 18, 1);
        bump('MeshParts turned into Parts');
      }
      if ((it.cls === 'ImageLabel' || it.cls === 'ImageButton') && it.props.has('Image')) {
        const r = resolve(it.get('Image'));
        if (r === null) {
          const text = lower(it) + ' ' + lower(it.parent);
          // a big image is a background or a picture, not an icon: only backgrounds get a panel
          const [w, h] = guiSize(it);
          const big = w > 220 || h > 220;
          const icon = big ? (/bg|background|panel|frame/.test(text) ? 'panel' : null)
            : pick(ICON_WORDS, text) || (it.cls === 'ImageButton' || /bg|background|button|frame|panel|bar/.test(text) ? 'panel' : null);
          if (icon) { setContent(it, 'Image', standinUrl(icon)); bump('UI images given GN-BLOX icons'); }
        }
      }
      if (it.cls === 'Decal' && /face/i.test(it.name)) {
        const r = resolve(it.get('Texture'));
        if (r === null) {
          let m = it.parent && it.parent.parent;
          const evil = /evil|zombie|ghost|monster|mob|enemy|boss/i.test((m ? m.name : '') + ' ' + (m && m.parent ? m.parent.name : ''));
          setContent(it, 'Texture', standinUrl(evil ? 'evilface' : 'face'));
          bump('faces given GN-BLOX faces');
        }
      }
      if (it.cls === 'ParticleEmitter' && resolve(it.get('Texture')) === null) { setContent(it, 'Texture', standinUrl('sparkle')); bump('particles given a GN-BLOX sparkle'); }
      if (it.cls === 'Sky' && !nightSky) {
        const faces = ['Bk', 'Dn', 'Ft', 'Lf', 'Rt', 'Up'];
        if (faces.every(f => resolve(it.get('Skybox' + f)) === null)) {
          for (const f of faces) setContent(it, 'Skybox' + f, standinUrl('sky_' + f.toLowerCase()));
          bump('skies given the GN-BLOX sky');
        }
      }
      if (it.cls === 'Sound' && resolve(it.get('SoundId')) === null && !it.get('Looped') && !/music|theme|song|ambien|lobby|intro/i.test(it.name)) {
        const snd = pick(SOUND_WORDS, (lower(it) + ' ' + lower(it.parent)));
        if (snd && CONTENT.has(snd.toLowerCase())) { setContent(it, 'SoundId', 'rbxasset://' + CONTENT.get(snd.toLowerCase())); bump('sounds given the engine\'s own sounds'); }
      }
      if ((it.cls === 'Tool' || it.cls === 'HopperBin')) gearStandIn(it, resolve, bump);
    }
  }
  // about how big a GUI object is on a 1000 x 600 screen (UDim2 sizes are [xScale, xOffset, yScale, yOffset])
  function guiSize(it) {
    const sz = it.get('Size');
    if (!Array.isArray(sz) || sz.length < 4) return [100, 100];
    let pw = 1000, ph = 600;
    const p = it.parent;
    if (p && /^(Frame|ImageLabel|ImageButton|TextButton|TextLabel|ScrollingFrame|TextBox|BillboardGui|SurfaceGui)$/.test(p.cls)) {
      if (p.cls === 'BillboardGui') { const s2 = p.get('Size'); pw = Array.isArray(s2) ? s2[1] || 200 : 200; ph = Array.isArray(s2) ? s2[3] || 200 : 200; }
      else if (p.cls === 'SurfaceGui') { pw = 800; ph = 600; }
      else [pw, ph] = guiSize(p);
    }
    return [Math.abs(sz[0] * pw + sz[1]), Math.abs(sz[2] * ph + sz[3])];
  }
  function gearStandIn(tool, resolve, bump) {
    const handle = tool.children.find(c => c.name === 'Handle' && c.cls !== 'Model');
    const mesh = handle && handle.children.find(c => c.cls === 'SpecialMesh' || c.cls === 'FileMesh');
    const meshPath = mesh ? str(mesh.get('MeshId') || '') : '';
    const kind = pick2(TOOL_WORDS, tool.name.toLowerCase() + ' ' + meshPath.toLowerCase());
    // the icon in the backpack
    if (tool.props.has('TextureId') ? resolve(tool.get('TextureId')) === null || !str(tool.get('TextureId')).trim() : true) {
      tool.props.set('TextureId', { t: 1, v: enc.encode(standinUrl(kind || 'tool')) });
      bump('tools given GN-BLOX icons');
    }
    if (!handle || !kind || !GEAR_PIECES[kind]) return;
    const meshType = mesh ? Number(mesh.get('MeshType')) : -1;
    // only when the handle's own mesh can't be shown (a FileMesh whose file is missing), or it has none
    if (mesh && !(meshType === 5 && resolve(meshPath) === null)) return;
    if (!mesh && Number(handle.get('Transparency') || 0) >= 1) return;
    const size = handle.get('size') || handle.get('Size');
    const cf = handle.get('CFrame');
    if (!size || !cf) return;
    const grip = tool.get('Grip') || [0, 0, 0];
    const axes = [0, 1, 2].sort((a, b) => size[b] - size[a]);
    const equal = Math.abs(size[0] - size[1]) < 0.01 && Math.abs(size[1] - size[2]) < 0.01;
    const L = equal ? 1 : axes[0];
    const rest = [0, 1, 2].filter(a => a !== L).sort((a, b) => size[b] - size[a]);
    const W = rest[0], T = rest[1];
    const dir = grip[L] < -0.01 ? -1 : 1;
    if (mesh) mesh.props.set('MeshId', { t: 1, v: new Uint8Array(0) });
    handle.set('Transparency', 4, 1);
    GEAR_PIECES[kind].forEach((pc, i) => {
      const [fw, ft, fl, cw, ct, cl, color, mat, shape, refl] = pc;
      const sz = [0, 0, 0], off = [0, 0, 0];
      sz[W] = Math.max(0.05, fw * size[W]); sz[T] = Math.max(0.05, ft * size[T]); sz[L] = Math.max(0.05, fl * size[L]);
      off[W] = cw * size[W]; off[T] = ct * size[T]; off[L] = cl * size[L] * dir;
      if (shape === 0) { const d = Math.min(sz[0], sz[1], sz[2]) || 0.2; sz[0] = sz[1] = sz[2] = Math.max(d, Math.max(...sz) * 0.9); }
      const p = new Inst('Part');
      p.set('Name', 1, enc.encode('GNGear' + (i + 1)));
      p.set('Anchored', 2, false); p.set('CanCollide', 2, false); p.set('Locked', 2, true);
      p.set('BrickColor', 11, color); p.set('Material', 18, mat || 256); p.set('Reflectance', 4, refl || 0);
      p.set('formFactorRaw', 18, 3); p.set('shape', 18, shape == null ? 1 : shape);
      p.set('TopSurface', 18, 0); p.set('BottomSurface', 18, 0);
      p.set('size', 14, sz);
      const c0 = [off[0], off[1], off[2], ...IDENT];
      p.set('CFrame', 16, cfMul(cf, c0));
      const w = new Inst('Weld');
      w.set('Name', 1, enc.encode('GNGearWeld'));
      w.set('Part0', 19, handle); w.set('Part1', 19, p);
      w.set('C0', 16, c0); w.set('C1', 16, [0, 0, 0, ...IDENT]);
      w.parent = p; p.children.push(w);
      p.parent = tool; tool.children.push(p);
    });
    bump('tools given GN-BLOX gear');
  }
  function pick2(table, text) { for (const [re, v] of table) if (re.test(text)) return v; return null; }

  function toEngine(doc, typemap, opts = {}) {
    const safe = !!opts.safe;
    const notes = [];
    const count = {};
    const bump = k => { count[k] = (count[k] || 0) + 1; };
    fixSnapshots(doc, notes);
    wrapModel(doc, notes);
    ensureSpawn(doc, notes);
    standIns(doc, bump, opts);

    // property name -> type, where every class in the typemap agrees
    const nameType = {};
    for (const [k, t] of Object.entries(typemap)) {
      const pn = k.slice(k.indexOf('.') + 1);
      nameType[pn] = nameType[pn] === undefined || nameType[pn] === t ? t : null;
    }
    const expected = (cls, pn) => typemap[cls + '.' + pn] || CLASS_TYPES[cls + '.' + pn] ||
      (BRICKCOLOR_PROPS.has(pn) ? 11 : null) || nameType[pn] || null;

    const all = [];
    const add = it => { all.push(it); it.children.forEach(add); };
    doc.roots.forEach(add);

    for (const it of all) {
      if (RENAME_CLASS[it.cls]) { it.cls = RENAME_CLASS[it.cls]; bump('classes renamed'); }
      if (!it.parent && SERVICES.has(it.cls)) it.service = true;
      const P = it.props;
      // exact part colors -> the nearest 2016 BrickColor
      const c8 = P.get('Color3uint8') || P.get('Color');
      if (c8 && !P.has('BrickColor') && (c8.t === 26 || (c8.t === 12 && P.has('size')))) {
        const rgb = c8.t === 26 ? c8.v : c8.v.map(x => Math.round(x * 255));
        P.set('BrickColor', { t: 11, v: nearestBrick(rgb[0], rgb[1], rgb[2]) });
        if (c8.t === 26) P.delete('Color3uint8');
        bump('part colors matched to BrickColors');
      }
      for (const [k3, k] of Object.entries(BODYCOLOR3)) {
        const p = P.get(k3);
        if (p && !P.has(k) && (p.t === 12 || p.t === 26)) P.set(k, { t: 11, v: convert(p.v, p.t, 11) });
      }
      // new font faces -> the 2016 Font enum
      const ff = P.get('FontFace');
      if (ff && ff.t === 32 && !P.has('Font')) {
        const fam = (ff.v.family.match(/([\w-]+)\.json/) || [, ''])[1].toLowerCase().replace(/[^a-z0-9]/g, '');
        let f = FONT[fam] != null ? FONT[fam] : 3;
        if (f === 3) f = ff.v.weight >= 600 ? 4 : ff.v.weight <= 300 ? 5 : 3;
        if (f === 1 && ff.v.weight >= 600) f = 2;
        P.set('Font', { t: 18, v: f });
      }
      for (const [pn, p] of [...P]) {
        if (pn === 'LinkedSource' && p.t === 1 && p.v.length) { p.v = new Uint8Array(0); bump('linked scripts cleared'); }
        if (pn === 'Source' && p.t === 1 && p.v && p.v.length) {
          const before = str(p.v), after = compatSource(before);
          if (after !== before) { p.v = enc.encode(after); bump('scripts given 2017+ API stand-ins'); }
        }
        // rbxassetid://123 -> http://www.roblox.com/asset/?id=123: this engine only fetches the second
        // kind (as wb-asset/?id=123, the files uploaded with the place). In scripts too, where games
        // build them as "rbxassetid://" .. id.
        if (p.t === 1 && p.v && p.v.length > 12) {
          const text = str(p.v);
          if (/rbxassetid:\/\//i.test(text) && (pn === 'Source' || /^\s*rbxassetid:\/\//i.test(text))) {
            p.v = enc.encode(text.replace(/rbxassetid:\/\//gi, 'http://www.roblox.com/asset/?id='));
            bump(pn === 'Source' ? 'scripts using rbxassetid:// links' : 'rbxassetid:// links');
          }
        }
        if (it.cls === 'Lighting' && pn === 'FogEnd' && Number(p.v) <= 0) p.v = 100000;
        let want = expected(it.cls, pn);
        if (safe && !want && pn !== 'Name') { P.delete(pn); continue; }
        if (!want) want = p.t === 26 ? 12 : p.t === 27 ? 3 : p.t === 29 ? 1 : ENGINE_TYPES.has(p.t) ? p.t : 0;
        if (safe && p.t === 28) want = 0;   // shared strings hold newer mesh / CSG data
        if (safe && SAFE_DROP.has(pn)) want = 0;   // terrain and union data blobs
        const v = want ? convert(p.v, p.t, want) : undefined;
        if (v === undefined) { P.delete(pn); bump('properties the 2016 engine doesn\'t have'); continue; }
        if (want !== p.t) { P.set(pn, { t: want, v }); bump('properties converted'); }
      }
    }

    // WeldConstraint (2017+) -> a ManualWeld holding the parts where they are
    for (const it of all) {
      if (it.cls !== 'WeldConstraint' && it.cls !== 'RigidConstraint') continue;
      const p0 = it.get('Part0') || it.get('Attachment0'), p1 = it.get('Part1') || it.get('Attachment1');
      const cf0 = p0 && p0.get && p0.get('CFrame'), cf1 = p1 && p1.get && p1.get('CFrame');
      it.cls = 'ManualWeld';
      const name = it.props.get('Name');
      it.props.clear();
      if (name) it.props.set('Name', name);
      if (!cf0 || !cf1 || it.get('Enabled') === false) { it.set('Part0', 19, null); it.set('Part1', 19, null); continue; }
      it.set('Part0', 19, p0); it.set('Part1', 19, p1);
      it.set('C0', 16, cfMul(cfInv(cf0), cf1)); it.set('C1', 16, DEFAULTS[16].slice());
      bump('WeldConstraints turned into welds');
    }
    for (const [k, n] of Object.entries(count)) notes.push(n + ' ' + k);
    return notes;
  }

  // CFrames: [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22]
  function cfMul(a, b) {
    const o = new Array(12);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) o[3 + r * 3 + c] = a[3 + r * 3] * b[3 + c] + a[4 + r * 3] * b[6 + c] + a[5 + r * 3] * b[9 + c];
      o[r] = a[3 + r * 3] * b[0] + a[4 + r * 3] * b[1] + a[5 + r * 3] * b[2] + a[r];
    }
    return o;
  }
  function cfInv(a) {
    const R = [a[3], a[6], a[9], a[4], a[7], a[10], a[5], a[8], a[11]];   // transpose
    const p = [a[0], a[1], a[2]];
    const o = [0, 0, 0, ...R];
    for (let r = 0; r < 3; r++) o[r] = -(R[r * 3] * p[0] + R[r * 3 + 1] * p[1] + R[r * 3 + 2] * p[2]);
    return o;
  }

  const API = { T, Inst, read, write, toEngine, compatSource, nearestBrick, brickRGB, PALETTE, cfMul, cfInv, lz4, lz4pack, parseXml };
  if (typeof module === 'object' && module.exports) module.exports = API;
  G.RBXFile = API;
})(typeof self !== 'undefined' ? self : this);
