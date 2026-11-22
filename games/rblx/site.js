// GN-BLOX site: shared header/menu, saved player state (Robux, inventory, outfit, name),
// the Catalog's items, and 2016-style avatar drawings. Used by index.html and catalog.html.
(function () {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  // BrickColor number -> color (the ones the Catalog uses)
  const BRICK = {
    1: '#f2f3f3', 18: '#cc8e69', 21: '#c4281c', 23: '#0d69ac', 24: '#f5cd30', 26: '#1b2a35', 28: '#287f47',
    37: '#4b974b', 102: '#6e99ca', 106: '#da8541', 119: '#a4bd47', 125: '#eab892', 192: '#694028', 194: '#a3a2a5',
    199: '#635f62', 1001: '#f8f8f8', 1004: '#ff0000', 1009: '#ffff00', 1019: '#00ffff', 1031: '#6225d1', 1032: '#ff00bf',
  };

  // Hats and gear as the game builds them: parts relative to the head's center (studs; the face
  // looks toward -Z), or for gear, to the Handle (the first part). Used by the game
  // (scripts/WebBloxPlayers.lua, via play.html) and the 3D avatar (avatar3d.js), so they match.
  //   s = size, p = position, color = BrickColor number, c = 'WedgePart', shape = 'cyl' (stood
  //   upright; s[0] is its height) | 'ball', r = extra rotation (degrees), neon, spin (turns)
  const cyl = (h, d, y, color, more) => Object.assign({ s: [h, d, d], p: [0, y, 0], color, shape: 'cyl' }, more);
  const ball = (d, p, color, more) => Object.assign({ s: [d, d, d], p, color, shape: 'ball' }, more);
  const box = (s, p, color, more) => Object.assign({ s, p, color }, more);
  const HATS = {
    tophat: [cyl(0.2, 2.3, 0.62, 26), cyl(1.3, 1.6, 1.35, 26), cyl(0.25, 1.65, 0.85, 21)],
    cheese: [box([1.6, 0.8, 1.4], [0, 0.9, 0], 24, { c: 'WedgePart' })],
    cap: [ball(1.35, [0, 0.5, 0.05], 21), box([1.2, 0.12, 0.9], [0, 0.55, -0.85], 21)],
    crown: [
      box([1.5, 0.35, 0.15], [0, 0.72, -0.68], 24), box([1.5, 0.35, 0.15], [0, 0.72, 0.68], 24),
      box([0.15, 0.35, 1.5], [-0.68, 0.72, 0], 24), box([0.15, 0.35, 1.5], [0.68, 0.72, 0], 24),
      box([0.25, 0.35, 0.25], [-0.62, 1.05, -0.62], 24), box([0.25, 0.35, 0.25], [0.62, 1.05, -0.62], 24),
      box([0.25, 0.35, 0.25], [-0.62, 1.05, 0.62], 24), box([0.25, 0.35, 0.25], [0.62, 1.05, 0.62], 24)],
    halo: [cyl(0.12, 1.8, 1.45, 1009, { neon: true })],
    box: [box([2.3, 1.3, 1.3], [0, 0.05, 0], 192)],
    fedora: [cyl(0.12, 2.2, 0.66, 199), cyl(0.8, 1.45, 1.05, 199), cyl(0.2, 1.5, 0.78, 26)],
    viking: [ball(1.5, [0, 0.55, 0], 194), cyl(0.2, 1.55, 0.4, 192),
      box([0.25, 0.9, 0.25], [-0.85, 0.95, 0], 1, { r: [0, 0, 25] }), box([0.25, 0.9, 0.25], [0.85, 0.95, 0], 1, { r: [0, 0, -25] })],
    cone: [box([1.8, 0.15, 1.8], [0, 0.68, 0], 106), cyl(0.5, 1.3, 1.0, 106), cyl(0.45, 1.0, 1.45, 1), cyl(0.5, 0.7, 1.9, 106), cyl(0.3, 0.4, 2.25, 106)],
    pirate: [cyl(0.15, 2.4, 0.66, 26), cyl(0.7, 1.45, 1.05, 26), cyl(0.15, 1.5, 0.8, 24),
      box([1.6, 0.6, 0.15], [0, 1.0, -0.85], 26, { r: [-15, 0, 0] }), ball(0.35, [0, 1.05, -0.95], 1)],
    wizard: [cyl(0.12, 2.4, 0.66, 1031), cyl(0.6, 1.3, 1.0, 1031), cyl(0.6, 0.95, 1.55, 1031), cyl(0.6, 0.6, 2.05, 1031),
      cyl(0.5, 0.3, 2.45, 1031), ball(0.3, [0, 1.35, -0.66], 1009, { neon: true })],
    party: [cyl(0.4, 1.1, 0.8, 1032), cyl(0.4, 0.85, 1.2, 1009), cyl(0.4, 0.6, 1.6, 1032), cyl(0.35, 0.35, 1.95, 1009), ball(0.4, [0, 2.25, 0], 1)],
    headphones: [box([1.6, 0.18, 0.3], [0, 0.8, 0], 26), box([0.18, 0.6, 0.3], [-0.8, 0.5, 0], 26), box([0.18, 0.6, 0.3], [0.8, 0.5, 0], 26),
      Object.assign(cyl(0.3, 0.75, 0, 21), { p: [-0.75, 0.05, 0], r: [0, 0, -90] }), Object.assign(cyl(0.3, 0.75, 0, 21), { p: [0.75, 0.05, 0], r: [0, 0, -90] })],
    chef: [cyl(0.55, 1.4, 0.85, 1001), ball(1.7, [0, 1.45, 0], 1001), ball(1.2, [0.35, 1.75, 0.2], 1001)],
    beanie: [ball(1.42, [0, 0.5, 0.02], 23), cyl(0.3, 1.45, 0.3, 102), ball(0.45, [0, 1.22, 0], 1)],
    cowboy: [cyl(0.12, 2.8, 0.66, 192), cyl(0.75, 1.4, 1.05, 192), cyl(0.18, 1.45, 0.8, 26)],
    bunny: [box([1.4, 0.12, 0.3], [0, 0.65, 0], 1032),
      box([0.3, 1.3, 0.15], [-0.35, 1.25, 0], 1, { r: [0, 0, 8] }), box([0.3, 1.3, 0.15], [0.35, 1.25, 0], 1, { r: [0, 0, -8] }),
      box([0.15, 1.0, 0.05], [-0.35, 1.25, -0.08], 1032, { r: [0, 0, 8] }), box([0.15, 1.0, 0.05], [0.35, 1.25, -0.08], 1032, { r: [0, 0, -8] })],
    shades: [box([1.35, 0.32, 0.08], [0, 0.12, -0.66], 26), box([0.06, 0.1, 0.9], [-0.66, 0.15, -0.2], 26), box([0.06, 0.1, 0.9], [0.66, 0.15, -0.2], 26)],
    hardhat: [ball(1.5, [0, 0.55, 0], 24), cyl(0.1, 1.85, 0.45, 24), box([0.18, 0.2, 1.5], [0, 1.2, 0], 24)],
    propeller: [ball(1.35, [0, 0.5, 0.05], 23), box([1.2, 0.12, 0.9], [0, 0.55, -0.85], 23), cyl(0.35, 0.12, 1.25, 26),
      box([1.6, 0.06, 0.25], [0, 1.42, 0], 21, { spin: 1.5 }), box([0.25, 0.06, 1.6], [0, 1.42, 0], 24, { spin: 1.5 })],
  };
  const coil = color => [box([0.3, 0.5, 0.3], [0, 0, 0], 26)].concat([-0.2, 0.05, 0.3, 0.55, 0.8].map(y => cyl(0.1, 0.85, y + 0.25, color)))
    .concat([cyl(0.12, 0.25, 1.15, color, { neon: true })]);
  // gear: pieces (held in the right hand) and what it does while you hold it
  const GEAR = {
    speedcoil: { pieces: coil(21), effect: { speed: 32 } },
    gravitycoil: { pieces: coil(1031), effect: { antigravity: 0.75 } },
    fusioncoil: { pieces: coil(37), effect: { speed: 26, antigravity: 0.6 } },
    balloon: { pieces: [box([0.2, 0.2, 0.2], [0, 0, 0], 1), box([0.05, 3, 0.05], [0, 1.5, 0], 1), ball(2.2, [0, 4, 0], 21)], effect: { antigravity: 0.85 } },
    // combat gear (scripts/WebBloxPlayers.lua): kind sword | shot | bomb; damage per hit, cooldown
    // (seconds); shots: speed, drop (share of gravity), size, ball, bounce (times), splat, blast
    // (radius: it explodes), color (BrickColor; none = a random one), sound (rbxasset://sounds/<name>.mp3)
    sword: {
      pieces: [box([0.3, 1, 0.3], [0, 0, 0], 192), box([1.3, 0.2, 0.35], [0, 0.6, 0], 24), box([0.5, 3.4, 0.12], [0, 2.4, 0], 1002), box([0.5, 0.35, 0.12], [0, 4.25, 0], 1002, { c: 'WedgePart' })],
      combat: { kind: 'sword', damage: 10, lunge: 30, idle: 5, cooldown: 0.15 },
    },
    slingshot: {
      pieces: [cyl(1, 0.3, 0, 192), box([0.18, 0.9, 0.18], [-0.28, 0.85, 0], 192, { r: [0, 0, 18] }), box([0.18, 0.9, 0.18], [0.28, 0.85, 0], 192, { r: [0, 0, -18] }), box([0.7, 0.08, 0.08], [0, 1.25, 0.1], 21)],
      combat: { kind: 'shot', speed: 110, drop: 0.35, size: [0.5, 0.5, 0.5], ball: true, damage: 8, bounce: 2, keep: 0.6, color: 194, cooldown: 0.25, sound: 'Rubber band sling shot', life: 3 },
    },
    rocketlauncher: {
      pieces: [box([0.35, 0.9, 0.45], [0, 0, 0], 26), cyl(4, 0.9, 0, 28, { p: [0, 0.75, -0.4], r: [0, 90, 0] }), cyl(0.3, 1, 0, 21, { p: [0, 0.75, -2.3], r: [0, 90, 0] })],
      combat: { kind: 'shot', speed: 70, size: [0.8, 0.8, 3], damage: 100, blast: 7, color: 21, fire: true, cooldown: 3, sound: 'collide', life: 6 },
    },
    timebomb: {
      pieces: [ball(1.6, [0, 0, 0], 26), cyl(0.5, 0.2, 0.95, 24), ball(0.3, [0, 1.3, 0], 105, { neon: true })],
      combat: { kind: 'bomb', fuse: 3, blast: 12, damage: 100, cooldown: 5 },
    },
    superball: {
      pieces: [ball(1, [0, 0, 0], 23, { neon: true })],
      combat: { kind: 'shot', speed: 75, drop: 1, size: [2, 2, 2], ball: true, damage: 15, bounce: 6, keep: 0.85, stop: false, cooldown: 2, sound: 'swoosh', boing: 'Rubber band', life: 6 },
    },
    paintballgun: {
      pieces: [box([0.35, 0.9, 0.4], [0, 0, 0], 23), box([0.4, 0.45, 2.2], [0, 0.6, -0.7], 26), ball(0.7, [0, 1.15, 0.1], 24)],
      combat: { kind: 'shot', speed: 200, drop: 0.1, size: [0.5, 0.5, 0.5], ball: true, neon: true, splat: true, damage: 15, cooldown: 0.2, sound: 'electronicpingshort', life: 3 },
    },
  };
  const DEFAULT_LOOK = { skin: 24, shirt: 23, pants: 37 };   // the classic look

  // Catalog. type: hat | gear | shirt | pants | skin; value: hat/gear name or BrickColor number.
  const ITEMS = [
    { id: 'propeller', name: 'Propeller Cap', type: 'hat', value: 'propeller', price: 250, featured: true, desc: 'A cap with a propeller on top. It really spins!' },
    { id: 'wizard', name: 'Wizard Hat', type: 'hat', value: 'wizard', price: 400, featured: true, desc: 'A tall purple hat with a glowing star. Magic not included.' },
    { id: 'viking', name: 'Viking Helmet', type: 'hat', value: 'viking', price: 300, desc: 'Horns up! For brave explorers of distant obbies.' },
    { id: 'headphones', name: 'Red Headphones', type: 'hat', value: 'headphones', price: 120, featured: true, desc: 'Big red headphones for big beats.' },
    { id: 'fedora', name: 'Grey Fedora', type: 'hat', value: 'fedora', price: 200, desc: 'A sharp grey fedora with a black band.' },
    { id: 'cone', name: 'Traffic Cone', type: 'hat', value: 'cone', price: 30, desc: 'Caution: wearer may be hard to take seriously.' },
    { id: 'pirate', name: 'Pirate Captain Hat', type: 'hat', value: 'pirate', price: 350, desc: 'Arr! A captain\'s hat with a skull on the front.' },
    { id: 'party', name: 'Party Hat', type: 'hat', value: 'party', price: 40, desc: 'It\'s a party! A striped cone with a pom-pom on top.' },
    { id: 'chef', name: 'Chef Hat', type: 'hat', value: 'chef', price: 90, desc: 'A tall, puffy white chef\'s hat. Pizza time.' },
    { id: 'beanie', name: 'Blue Beanie', type: 'hat', value: 'beanie', price: 60, desc: 'A cozy knit beanie with a white pom-pom.' },
    { id: 'cowboy', name: 'Cowboy Hat', type: 'hat', value: 'cowboy', price: 180, desc: 'Yeehaw! A wide-brimmed brown cowboy hat.' },
    { id: 'bunny', name: 'Bunny Ears', type: 'hat', value: 'bunny', price: 80, desc: 'Fluffy white bunny ears on a pink headband.' },
    { id: 'shades', name: 'Cool Shades', type: 'hat', value: 'shades', price: 110, featured: true, desc: 'The coolest sunglasses in GN-BLOX.' },
    { id: 'hardhat', name: 'Construction Hard Hat', type: 'hat', value: 'hardhat', price: 70, desc: 'Safety first! A yellow hard hat for builders.' },
    { id: 'speedcoil', name: 'Speed Coil', type: 'gear', value: 'speedcoil', price: 300, featured: true, desc: 'Hold it to run twice as fast. Shows up in your Backpack in every game.' },
    { id: 'gravitycoil', name: 'Gravity Coil', type: 'gear', value: 'gravitycoil', price: 300, featured: true, desc: 'Hold it to jump way higher and fall slowly. Shows up in your Backpack in every game.' },
    { id: 'fusioncoil', name: 'Fusion Coil', type: 'gear', value: 'fusioncoil', price: 600, collectible: true, desc: 'Speed and gravity in one coil: run fast and jump high. Shows up in your Backpack in every game.' },
    { id: 'balloon', name: 'Red Balloon', type: 'gear', value: 'balloon', price: 150, desc: 'Float gently down from anywhere. Shows up in your Backpack in every game.' },
    { id: 'sword', name: 'Sword', type: 'gear', value: 'sword', price: 250, featured: true, desc: 'Click to slash, click twice fast to lunge. Hits other players in any game too.' },
    { id: 'slingshot', name: 'Slingshot', type: 'gear', value: 'slingshot', price: 100, desc: 'Click where to shoot: pellets that bounce.' },
    { id: 'rocketlauncher', name: 'Rocket Launcher', type: 'gear', value: 'rocketlauncher', price: 600, featured: true, desc: 'Click where to fire a rocket that explodes when it hits. Mind the blast!' },
    { id: 'timebomb', name: 'Time Bomb', type: 'gear', value: 'timebomb', price: 400, desc: 'Click to drop a bomb. It ticks for 3 seconds, then BOOM. Run!' },
    { id: 'superball', name: 'Superball', type: 'gear', value: 'superball', price: 200, desc: 'Click to throw a ball that bounces all over the place.' },
    { id: 'paintballgun', name: 'Paintball Gun', type: 'gear', value: 'paintballgun', price: 350, desc: 'Click to shoot fast paintballs that splat in every color.' },
    { id: 'tophat', name: 'Top Hat', type: 'hat', value: 'tophat', price: 150, featured: true, desc: 'A classy black top hat with a red band. For the distinguished Robloxian.' },
    { id: 'crown', name: 'Golden Crown', type: 'hat', value: 'crown', price: 1000, featured: true, collectible: true, desc: 'Only royalty may wear this crown. Or anyone with 1,000 ROBUX.' },
    { id: 'halo', name: 'Glowing Halo', type: 'hat', value: 'halo', price: 500, collectible: true, desc: 'A neon halo that floats above your head. Angels only.' },
    { id: 'cheese', name: 'Cheese Hat', type: 'hat', value: 'cheese', price: 75, featured: true, desc: 'A wedge of cheese, worn proudly on the head.' },
    { id: 'cap', name: 'Red Baseball Cap', type: 'hat', value: 'cap', price: 50, desc: 'A sporty red cap. Brim forward, of course.' },
    { id: 'box', name: 'Cardboard Box', type: 'hat', value: 'box', price: 25, desc: 'Nobody will ever find you in here.' },
    { id: 'shirt-red', name: 'Bright Red Shirt', type: 'shirt', value: 21, price: 15, featured: true, desc: 'A plain bright red shirt.' },
    { id: 'shirt-blue', name: 'Classic Blue Shirt', type: 'shirt', value: 23, price: 0, desc: 'The classic blue shirt everybody starts with.' },
    { id: 'shirt-green', name: 'Green Shirt', type: 'shirt', value: 37, price: 15, desc: 'A plain green shirt.' },
    { id: 'shirt-black', name: 'Black Shirt', type: 'shirt', value: 26, price: 20, desc: 'A plain black shirt. Very cool.' },
    { id: 'shirt-white', name: 'White Shirt', type: 'shirt', value: 1, price: 20, desc: 'A plain white shirt.' },
    { id: 'shirt-orange', name: 'Orange Shirt', type: 'shirt', value: 106, price: 15, desc: 'A plain orange shirt.' },
    { id: 'shirt-purple', name: 'Royal Purple Shirt', type: 'shirt', value: 1031, price: 25, desc: 'A royal purple shirt.' },
    { id: 'shirt-pink', name: 'Hot Pink Shirt', type: 'shirt', value: 1032, price: 25, featured: true, desc: 'A very pink shirt.' },
    { id: 'shirt-yellow', name: 'Sunny Yellow Shirt', type: 'shirt', value: 24, price: 15, desc: 'A bright yellow shirt.' },
    { id: 'shirt-cyan', name: 'Toothpaste Shirt', type: 'shirt', value: 1019, price: 25, desc: 'A shirt in the brightest cyan there is.' },
    { id: 'shirt-grey', name: 'Dark Grey Shirt', type: 'shirt', value: 199, price: 15, desc: 'A plain dark grey shirt.' },
    { id: 'pants-green', name: 'Classic Green Pants', type: 'pants', value: 37, price: 0, desc: 'The classic green pants everybody starts with.' },
    { id: 'pants-black', name: 'Black Pants', type: 'pants', value: 26, price: 15, featured: true, desc: 'Plain black pants.' },
    { id: 'pants-blue', name: 'Blue Jeans', type: 'pants', value: 23, price: 15, desc: 'Comfy blue jeans.' },
    { id: 'pants-brown', name: 'Brown Pants', type: 'pants', value: 192, price: 15, desc: 'Plain brown pants.' },
    { id: 'pants-grey', name: 'Grey Pants', type: 'pants', value: 194, price: 15, desc: 'Plain grey pants.' },
    { id: 'pants-darkgreen', name: 'Dark Green Pants', type: 'pants', value: 28, price: 15, desc: 'Plain dark green pants.' },
    { id: 'pants-white', name: 'White Pants', type: 'pants', value: 1, price: 15, desc: 'Plain white pants. Stay away from mud.' },
    { id: 'pants-red', name: 'Red Pants', type: 'pants', value: 21, price: 15, desc: 'Plain bright red pants.' },
    { id: 'pants-purple', name: 'Purple Pants', type: 'pants', value: 1031, price: 20, desc: 'Royal purple pants.' },
    { id: 'skin-yellow', name: 'Classic Yellow Skin', type: 'skin', value: 24, price: 0, desc: 'The classic bright yellow.' },
    { id: 'skin-light', name: 'Light Orange Skin', type: 'skin', value: 125, price: 0, desc: 'A light skin tone.' },
    { id: 'skin-nougat', name: 'Nougat Skin', type: 'skin', value: 18, price: 0, desc: 'A medium skin tone.' },
    { id: 'skin-brown', name: 'Reddish Brown Skin', type: 'skin', value: 192, price: 0, desc: 'A dark skin tone.' },
    { id: 'skin-robot', name: 'Robot Grey Skin', type: 'skin', value: 194, price: 10, desc: 'Beep boop.' },
    { id: 'skin-zombie', name: 'Zombie Green Skin', type: 'skin', value: 37, price: 10, featured: true, desc: 'For when you are not feeling your best.' },
  ];
  // Items made from images (catalog/items.js, see tools/build_catalog.py): faces, and classic shirt and
  // pants templates. They go in their own outfit slots (face, shirtTex, pantsTex), so a template shirt
  // sits over your shirt color the way Roblox clothes sit over body colors.
  const TEX = window.GNCATALOG || {};
  (TEX.face || []).forEach(([id, name, price, featured], i) => ITEMS.push({ id: 'face-' + id, name: name || 'Classic Face ' + (i + 1), type: 'face', value: id,
    price, featured: !!featured || i % 120 === 7, desc: 'A classic face for your avatar. It shows in every game.' }));
  (TEX.shirt || []).forEach(([id, name, price, featured]) => ITEMS.push({ id: 'shirt-' + id, name: name || 'Shirt ' + id, type: 'shirtTex', value: id,
    price, featured: !!featured, desc: 'A shirt with sleeves, worn over your shirt color (it shows wherever the shirt is see-through).' }));
  (TEX.pants || []).forEach(([id, name, price, featured]) => ITEMS.push({ id: 'pants-' + id, name: name || 'Pants ' + id, type: 'pantsTex', value: id,
    price, featured: !!featured, desc: 'Pants, worn over your pants color (it shows wherever they\'re see-through).' }));
  // Hats, hair and other accessories with real meshes (catalog/items.js "acc", from .rbxm files): the
  // value is 'a' + the accessory's asset id, and it goes in the slot its attachment says (hat, hair,
  // glasses for the face, back for the body). The game and avatar3d.js build them from WB.ACCESSORIES.
  const ACCESSORIES = {};
  const ACC_DESC = { hat: 'A hat for your avatar.', hair: 'Hair for your avatar. Wear it with a hat too.', glasses: 'For your face. Wear it with a hat and hair too.', back: 'An accessory you wear on your body.' };
  (TEX.acc || []).forEach(a => {
    const value = 'a' + a.id;
    ACCESSORIES[value] = a;
    ITEMS.push({ id: 'acc-' + a.id, name: a.name, type: a.slot, value, price: a.price, featured: a.price >= 1000, collectible: a.price >= 1000, desc: ACC_DESC[a.slot] || ACC_DESC.back });
  });
  const CATEGORY = { hat: 'Hats', hair: 'Hair', glasses: 'Hats', back: 'Hats', gear: 'Gear', face: 'Faces', shirt: 'Shirts', shirtTex: 'Shirts', pants: 'Pants', pantsTex: 'Pants', skin: 'Body Colors' };
  // an image item's file (faces and templates); games get the same file as asset id <id>
  const assetUrl = (id, ext) => 'catalog/assets/' + String(id).replace(/[^0-9]/g, '') + '.' + (ext || 'png');

  const WB = {
    esc, BRICK, ITEMS, CATEGORY, DEFAULT_LOOK, HATS, GEAR, ACCESSORIES, assetUrl,
    item: id => ITEMS.find(i => i.id === id),
    colorHex: n => BRICK[n] || '#a3a2a5',
    robux: () => { const n = load('webblox-robux', 8451); return Number.isFinite(n) ? n : 8451; },
    setRobux(n) { save('webblox-robux', Math.max(0, Math.floor(n))); WB.updateRobux(); },
    inventory: () => { const v = load('webblox-inventory', []); return Array.isArray(v) ? v : []; },
    owns: id => WB.inventory().includes(id) || (WB.item(id) && WB.item(id).price === 0),
    addItem(id) { const inv = WB.inventory(); if (!inv.includes(id)) { inv.push(id); save('webblox-inventory', inv); } },
    outfit: () => { const v = load('webblox-outfit', {}); return v && typeof v === 'object' ? v : {}; },
    setOutfit(o) { save('webblox-outfit', o); },
    look: () => Object.assign({}, DEFAULT_LOOK, WB.outfit()),
    name() { try { return (localStorage.getItem('webblox-name') || '').replace(/[^A-Za-z0-9_ ]/g, '').slice(0, 20); } catch (e) { return ''; } },
    setName(n) { try { localStorage.setItem('webblox-name', String(n).replace(/[^A-Za-z0-9_ ]/g, '').trim().slice(0, 20)); } catch (e) {} },
    displayName() { return WB.name() || 'GNBloxPlayer'; },
    // gear: you can carry several (outfit.gear is a list); everything else is one per slot
    gear: () => { const g = WB.outfit().gear; return Array.isArray(g) ? g.filter(v => GEAR[v]) : []; },
    wearing(item) {
      if (!item) return false;
      if (item.type === 'gear') return WB.gear().includes(item.value);
      return WB.outfit()[item.type] === item.value;
    },
    wear(item) {
      const o = WB.outfit();
      if (item.type === 'gear') { o.gear = WB.gear().filter(v => v !== item.value).concat([item.value]); }
      else o[item.type] = item.value;
      WB.setOutfit(o);
    },
    takeOff(item) {
      const o = WB.outfit();
      if (item.type === 'gear') o.gear = WB.gear().filter(v => v !== item.value);
      else if (o[item.type] === item.value) delete o[item.type];
      WB.setOutfit(o);
    },
    updateRobux() { document.querySelectorAll('.rbx-count').forEach(e => { e.textContent = WB.robux().toLocaleString('en-US'); }); },
  };

  // ---------- drawings ----------
  // 2D front view in a 100 x 142 box: hat area on top, head 22-50, torso/arms 52-92, legs 94-134.
  function hatSVG(hat) {
    switch (hat) {
      case 'tophat': return '<rect x="27" y="17" width="46" height="5" rx="1" fill="#1b2a35"/><rect x="35" y="0" width="30" height="19" fill="#1b2a35"/><rect x="35" y="12" width="30" height="4" fill="#c4281c"/>';
      case 'crown': return '<polygon points="33,25 33,9 41,17 50,4 59,17 67,9 67,25" fill="#f5cd30" stroke="#b8860b" stroke-width="1.5"/><circle cx="50" cy="19" r="2.5" fill="#c4281c"/>';
      case 'halo': return '<ellipse cx="50" cy="10" rx="17" ry="4.5" fill="none" stroke="#ffe94d" stroke-width="3.5"/>';
      case 'cheese': return '<polygon points="31,26 69,26 69,8" fill="#f5cd30" stroke="#d9a400" stroke-width="1.2"/><circle cx="58" cy="20" r="2.4" fill="#d9a400"/><circle cx="64" cy="15" r="1.6" fill="#d9a400"/>';
      case 'cap': return '<path d="M32,28 Q32,9 50,9 Q68,9 68,28 Z" fill="#c4281c"/><rect x="58" y="25" width="22" height="4" rx="2" fill="#a3201a"/>';
      case 'box': return '<rect x="26" y="13" width="48" height="42" fill="#a0703f" stroke="#7a5230" stroke-width="1.5"/><rect x="26" y="30" width="48" height="5" fill="#d8c08a"/>';
      default: return '';
    }
  }
  function face(id) {
    if (id) return `<image href="${assetUrl(id)}" x="33" y="22" width="34" height="28" preserveAspectRatio="xMidYMid meet"/>`;
    return '<circle cx="44" cy="34" r="2.3" fill="#191919"/><circle cx="56" cy="34" r="2.3" fill="#191919"/><path d="M43,40 Q50,46 57,40" stroke="#191919" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
  }
  // mode: 'full' (whole body), 'head' (headshot), 'hatonly' (hat on a grey mannequin head)
  WB.avatarSVG = function (look, mode, bg) {
    look = Object.assign({}, DEFAULT_LOOK, look || {});
    const skin = WB.colorHex(look.skin), shirt = WB.colorHex(look.shirt), pants = WB.colorHex(look.pants);
    const body = `<rect x="10" y="52" width="18" height="40" rx="2" fill="${skin}"/><rect x="72" y="52" width="18" height="40" rx="2" fill="${skin}"/>
      <rect x="30" y="94" width="19" height="40" rx="2" fill="${pants}"/><rect x="51" y="94" width="19" height="40" rx="2" fill="${pants}"/>
      <rect x="30" y="52" width="40" height="40" rx="2" fill="${shirt}"/>`;
    const head = `<rect x="33" y="22" width="34" height="28" rx="8" fill="${mode === 'hatonly' ? '#d4d4d4' : skin}"/>` + (mode === 'hatonly' ? '' : face(look.face));
    const vb = mode === 'full' ? '-6 -6 112 148' : mode === 'hatonly' ? '14 -6 72 72' : '10 -2 80 80';
    const back = bg ? `<rect x="-20" y="-20" width="160" height="200" fill="${bg}"/>` : '';
    const clothes = mode === 'full' ? templateSVG(look.pantsTex, true) + templateSVG(look.shirtTex, false) : '';
    return `<svg viewBox="${vb}" width="100%" height="100%" aria-hidden="true">${back}${mode === 'hatonly' ? '' : body + clothes}${head}${hatSVG(look.hat)}</svg>`;
  };
  // the front of a classic 585 x 559 clothing template on the 2D drawing: torso, and arms (shirt) or legs (pants)
  let clipN = 0;
  function templateSVG(id, pants) {
    if (!id) return '';
    const url = assetUrl(id), out = [];
    const piece = (sx, sy, sw, sh, dx, dy, dw, dh) => {
      const kx = dw / sw, ky = dh / sh, c = 'wbclip' + (++clipN);
      out.push(`<clipPath id="${c}"><rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" rx="2"/></clipPath><image href="${url}" clip-path="url(#${c})" preserveAspectRatio="none"
        x="${dx - sx * kx}" y="${dy - sy * ky}" width="${585 * kx}" height="${559 * ky}"/>`);
    };
    piece(231, 74, 128, 128, 30, 52, 40, 40);                                   // torso front
    if (pants) { piece(217, 355, 64, 128, 30, 94, 19, 40); piece(308, 355, 64, 128, 51, 94, 19, 40); }   // right leg, left leg
    else { piece(217, 355, 64, 128, 10, 52, 18, 40); piece(308, 355, 64, 128, 72, 52, 18, 40); }        // right arm, left arm
    return out.join('');
  }
  // Your avatar as a picture: a 3D render when the page loads avatar3d.js (and WebGL works),
  // otherwise the 2D drawing. mode: 'full' | 'head'
  WB.avatarImg = function (look, mode, bg, size) {
    if (window.WB3D) {
      try {
        const src = window.WB3D.snapshot(Object.assign({}, WB.look(), look || {}), { mode: mode === 'head' ? 'head' : 'full', size: size || 300 });
        return `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain;display:block${bg ? ';background:' + bg : ''}" />`;
      } catch (e) { /* fall back to the drawing */ }
    }
    return WB.avatarSVG(look, mode, bg);
  };
  WB.itemThumb = function (item, size) {
    const bg = '#ebebeb';
    if (item.type === 'face') {
      return `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true"><rect width="100" height="100" fill="${bg}"/>
        <rect x="14" y="18" width="72" height="64" rx="18" fill="${WB.colorHex(24)}"/><image href="${assetUrl(item.value)}" x="18" y="20" width="64" height="60" preserveAspectRatio="xMidYMid meet"/></svg>`;
    }
    if (ACCESSORIES[item.value]) {
      if (window.WB3D) {
        try {
          const src = window.WB3D.snapshot(null, { mode: 'acc', item: item.value, size: size || 200 });
          return `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain;display:block;background:${bg}" />`;
        } catch (e) { /* fall back to the drawing */ }
      }
      return `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true"><rect width="100" height="100" fill="${bg}"/><text x="50" y="56" font-size="11" text-anchor="middle" fill="#555">${esc(item.name)}</text></svg>`;
    }
    if (item.type === 'shirtTex' || item.type === 'pantsTex') {
      const look = { skin: 194, shirt: 194, pants: 194, [item.type]: item.value };
      if (window.WB3D) {
        try {
          const src = window.WB3D.snapshot(look, { mode: 'full', size: size || 200, mannequin: true });
          return `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain;display:block;background:${bg}" />`;
        } catch (e) { /* fall back to the drawing */ }
      }
      return WB.avatarSVG(look, 'full', bg);
    }
    if (window.WB3D && /^(hat|gear|skin)$/.test(item.type)) {
      try {
        const src = item.type === 'skin'
          ? window.WB3D.snapshot({ skin: item.value, shirt: 194, pants: 194 }, { mode: 'full', size: size || 200 })
          : window.WB3D.snapshot(null, { mode: item.type, item: item.value, size: size || 200 });
        return `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain;display:block;background:${bg}" />`;
      } catch (e) { /* fall back to the drawing */ }
    }
    if (item.type === 'hat') return WB.avatarSVG({ hat: item.value }, 'hatonly', bg);
    if (item.type === 'gear') return `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true"><rect width="100" height="100" fill="${bg}"/><text x="50" y="56" font-size="12" text-anchor="middle" fill="#555">${esc(item.name)}</text></svg>`;
    if (item.type === 'skin') return WB.avatarSVG({ skin: item.value, shirt: 194, pants: 194 }, 'full', bg);
    const c = WB.colorHex(item.value);
    const shape = item.type === 'shirt'
      ? `<path d="M30,18 L42,12 Q50,20 58,12 L70,18 L84,36 L72,44 L68,38 L68,86 L32,86 L32,38 L28,44 L16,36 Z" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>`
      : `<path d="M32,14 L68,14 L72,86 L54,86 L50,40 L46,86 L28,86 Z" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/><rect x="32" y="14" width="36" height="7" fill="rgba(0,0,0,.18)"/>`;
    return `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true"><rect width="100" height="100" fill="${bg}"/>${shape}</svg>`;
  };

  // ---------- header + left menu ----------
  const ICONS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <symbol id="i-menu" viewBox="0 0 24 24"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></symbol>
    <symbol id="i-home" viewBox="0 0 24 24"><path d="M12 3 2 11.5h3V21h5.5v-6h3v6H19v-9.5h3z"/></symbol>
    <symbol id="i-user" viewBox="0 0 24 24"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z"/></symbol>
    <symbol id="i-msg" viewBox="0 0 24 24"><path d="M3 5h18v14H3zm2 2v.5l7 4.5 7-4.5V7l-7 4.4z"/></symbol>
    <symbol id="i-avatar" viewBox="0 0 24 24"><path d="M8 2h8v6H8zM5 9h14v7h-3v6h-3v-6h-2v6H8v-6H5z"/></symbol>
    <symbol id="i-inv" viewBox="0 0 24 24"><path d="M9 3h6v3h5v14H4V6h5zm2 3h2V5h-2zM6 10v2h12v-2z"/></symbol>
    <symbol id="i-trade" viewBox="0 0 24 24"><path d="M7 4 3 8l4 4V9h10V7H7zm10 8v3H7v2h10v3l4-4z"/></symbol>
    <symbol id="i-forum" viewBox="0 0 24 24"><path d="M3 4h13v9H7l-4 4zm15 4h3v12l-4-4H8v-1h10z"/></symbol>
    <symbol id="i-blog" viewBox="0 0 24 24"><path d="M4 4h16v16H4zm2 2v4h5V6zm7 0v1h5V6zm0 3v1h5V9zM6 12v1h12v-1zm0 3v1h12v-1z"/></symbol>
    <symbol id="i-shop" viewBox="0 0 24 24"><path d="M3 4h2.6l.8 2H21l-2.5 8H8.2l-.6 2H19v2H5l1.5-4.6L4.2 6H3zm5 16a1.5 1.5 0 1 0 0 .1zm9 0a1.5 1.5 0 1 0 0 .1z"/></symbol>
    <symbol id="i-search" viewBox="0 0 24 24"><path d="M10 3a7 7 0 0 1 5.6 11.2l5.6 5.6-1.4 1.4-5.6-5.6A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></symbol>
    <symbol id="i-gear" viewBox="0 0 24 24"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></symbol>
    <symbol id="i-robux" viewBox="0 0 24 24"><path d="M12 2 21 7v10l-9 5-9-5V7zm0 2.3L5 8.2v7.6l7 3.9 7-3.9V8.2zM9 9h6v6H9z"/></symbol>
    <symbol id="i-thumb" viewBox="0 0 24 24"><path d="M2 10h4v11H2zm6 11V10l5-8 1.5 1c.6.4.8 1.1.6 1.8L14 9h6.2c1 0 1.8.9 1.6 1.9l-1.6 8.6c-.2 1-1 1.5-2 1.5z"/></symbol>
    <symbol id="i-play" viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></symbol>
  </svg>`;

  // active: 'home' | 'profile' | 'catalog' | 'avatar' | 'inventory'
  WB.chrome = function (active, searchPlaceholder) {
    const on = k => active === k ? ' class="on"' : '';
    const html = ICONS + `
    <header class="hdr">
      <button class="burger" aria-label="Menu" onclick="document.body.classList.toggle('nav-open')"><svg class="i"><use href="#i-menu"/></svg></button>
      <a class="logo" href="index.html" aria-label="GN-BLOX home"><img src="GN-BLOX.png" alt="GN-BLOX" /></a>
      <nav class="hnav">
        <a href="index.html#games">Games</a>
        <a href="catalog.html"${on('catalog')}>Catalog</a>
        <a href="studio.html">Develop</a>
        <a href="catalog.html#robux">ROBUX</a>
      </nav>
      <label class="search"><input id="q" type="search" placeholder="${esc(searchPlaceholder || 'Search')}" autocomplete="off" aria-label="Search" /><svg class="i"><use href="#i-search"/></svg></label>
      <div class="hright">
        <a href="catalog.html#robux" title="ROBUX"><svg class="i"><use href="#i-robux"/></svg><span class="rbx-count"></span></a>
        <a class="gear" href="#" title="Change your name" onclick="WB.rename(); return false;"><svg class="i"><use href="#i-gear"/></svg></a>
        ${WB.session()
          ? `<a class="acct" href="#" onclick="WB.logOut(); location.reload(); return false;" title="Log out of ${esc(WB.accountName())}">Log Out</a>`
          : `<a class="acct" href="login.html">Log In</a><a class="acct signup" href="login.html#signup">Sign Up</a>`}
      </div>
    </header>
    <aside class="lnav">
      <a class="who" href="profile.html" id="who"></a>
      <ul>
        <li><a href="index.html"${on('home')}><svg class="i"><use href="#i-home"/></svg>Home</a></li>
        <li><a href="profile.html"${on('profile')}><svg class="i"><use href="#i-user"/></svg>Profile</a></li>
        <li><a href="index.html#feed"><svg class="i"><use href="#i-msg"/></svg>Messages<span class="count">3</span></a></li>
        <li><a href="catalog.html?cat=wearing"${on('avatar')}><svg class="i"><use href="#i-avatar"/></svg>Avatar</a></li>
        <li><a href="catalog.html?cat=inventory"${on('inventory')}><svg class="i"><use href="#i-inv"/></svg>Inventory</a></li>
        <li><a href="catalog.html"><svg class="i"><use href="#i-trade"/></svg>Trade</a></li>
        <li><a href="index.html#feed"><svg class="i"><use href="#i-forum"/></svg>Forum</a></li>
        <li><a href="index.html#news"><svg class="i"><use href="#i-blog"/></svg>Blog</a></li>
        <li><a href="catalog.html"${on('catalog')}><svg class="i"><use href="#i-shop"/></svg>Shop</a></li>
        ${WB.role() ? `<li><a href="admin.html"${on('admin')}><svg class="i"><use href="#i-gear"/></svg>Admin</a></li>` : ''}
      </ul>
      <a class="upgrade" href="studio.html">Create in Studio</a>
      <a class="upgrade alt" href="#" onclick="WB.pickPlace(); return false;">Upload a Place</a>
      <h4>Events</h4>
      <a class="event" href="index.html#game=nds">Disaster Weekend<small>Survive every disaster!</small></a>
    </aside>
    <div class="scrim" onclick="document.body.classList.remove('nav-open')"></div>
    <div class="confirm launch" id="launch"><div class="box"><div class="spinner"></div><h3>GN-BLOX is now loading.</h3><p>Get ready to play!</p></div></div>
    <input type="file" id="rbxl" accept=".rbxl,.rbxlx,.rbxm,.rbxmx,.zip,.mesh,.obj,image/*,audio/*,.ogg,.mp3,.wav" multiple hidden />`;
    document.body.insertAdjacentHTML('afterbegin', html);
    document.getElementById('who').textContent = WB.displayName();
    WB.updateRobux();
    document.getElementById('rbxl').addEventListener('change', uploadPlace);
    document.querySelectorAll('.lnav a').forEach(a => a.addEventListener('click', () => document.body.classList.remove('nav-open')));
  };

  // ---------- accounts ----------
  // GN-BLOX accounts keep their name, ROBUX, items and outfit in this browser (there's no server
  // behind this site). Passwords are stored as salted SHA-256 hashes. The active account's data
  // sits in the usual webblox-* keys, so every page and game just reads those.
  //
  // Each account also has an account ID: a signing key made from its username and password
  // (PBKDF2, then Ed25519), so the same username and password give the same ID on any device and
  // nobody without the password can make it. config.js lists the owner's and moderators' IDs;
  // their admin commands in games are signed with the key and checked by every player's game.
  const ACCOUNT_KEYS = ['webblox-robux', 'webblox-inventory', 'webblox-outfit', 'webblox-name', 'webblox-stipend', 'webblox-status', 'webblox-joined'];
  const raw = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const setRaw = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
  const current = () => { const o = {}; for (const k of ACCOUNT_KEYS) o[k] = raw(k); return o; };
  const restore = o => { for (const k of ACCOUNT_KEYS) setRaw(k, o && o[k] != null ? o[k] : null); };
  const accounts = () => { const a = load('webblox-accounts', {}); return a && typeof a === 'object' ? a : {}; };
  const stash = key => setRaw('webblox-acct:' + key, JSON.stringify(current()));
  const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  async function hashPassword(salt, password) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + password));
    return hex(new Uint8Array(buf));
  }
  // account IDs ---------------------------------------------------------------------------
  const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));
  const PKCS8_ED25519 = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];
  const ID_RE = /^[A-Za-z0-9_-]{43}$/;
  async function deriveIdentity(username, password) {
    const te = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', te.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
    const seed = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: te.encode('gn-blox-account:' + String(username).toLowerCase()), iterations: 250000, hash: 'SHA-256' }, base, 256));
    const key = await crypto.subtle.importKey('pkcs8', new Uint8Array([...PKCS8_ED25519, ...seed]), { name: 'Ed25519' }, true, ['sign']);
    const jwk = await crypto.subtle.exportKey('jwk', key);
    return { seed: b64u(seed), pub: jwk.x };
  }
  async function makeIdentity(key, username, password) {
    try {
      const id = await deriveIdentity(username, password);
      save('gnblox-key', { user: key, pub: id.pub, seed: id.seed });
      const all = accounts();
      if (all[key] && all[key].pub !== id.pub) { all[key].pub = id.pub; save('webblox-accounts', all); }
    } catch (e) { console.warn('GN-BLOX: this browser can\'t make account IDs (Ed25519)', e); setRaw('gnblox-key', null); }
  }
  WB.identity = () => { const k = load('gnblox-key', null); return k && k.user === WB.session() && ID_RE.test(k.pub) ? k : null; };
  WB.accountId = () => { const k = WB.identity(); return k ? k.pub : null; };
  WB.roleOf = pub => {
    const c = window.WEBBLOX_CONFIG || {};
    if (!pub || !ID_RE.test(pub)) return null;
    if ((c.owners || []).includes(pub)) return 'owner';
    if ((c.mods || []).includes(pub)) return 'mod';
    return null;
  };
  WB.role = () => WB.roleOf(WB.accountId());
  let signKey = null;
  WB.sign = async text => {
    const k = WB.identity();
    if (!k) throw new Error('Log in first.');
    if (!signKey || signKey.pub !== k.pub) signKey = { pub: k.pub, key: await crypto.subtle.importKey('pkcs8', new Uint8Array([...PKCS8_ED25519, ...unb64u(k.seed)]), { name: 'Ed25519' }, false, ['sign']) };
    return b64u(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, signKey.key, new TextEncoder().encode(text))));
  };
  const verifyKeys = new Map();
  WB.verify = async (pub, text, sig) => {
    try {
      if (!ID_RE.test(pub) || typeof sig !== 'string') return false;
      if (!verifyKeys.has(pub)) verifyKeys.set(pub, await crypto.subtle.importKey('raw', unb64u(pub), { name: 'Ed25519' }, false, ['verify']));
      return await crypto.subtle.verify({ name: 'Ed25519' }, verifyKeys.get(pub), unb64u(sig), new TextEncoder().encode(text));
    } catch (e) { return false; }
  };

  WB.session = () => { const s = raw('webblox-session'); return s && accounts()[s] ? s : null; };
  WB.accountName = () => { const s = WB.session(); return s ? accounts()[s].name : null; };
  WB.signUp = async function (username, password) {
    username = String(username || '').trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) throw new Error('Usernames are 3 to 20 letters, numbers or underscores.');
    if (String(password || '').length < 6) throw new Error('Pick a password with at least 6 characters.');
    if (!window.crypto || !crypto.subtle) throw new Error('This browser can\'t make accounts here (it needs a secure https page).');
    const all = accounts(), key = username.toLowerCase();
    if (all[key]) throw new Error('That username is already taken on this device. Log in instead?');
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    all[key] = { name: username, salt, hash: await hashPassword(salt, password), created: new Date().toISOString().slice(0, 10) };
    save('webblox-accounts', all);
    const was = WB.session();
    if (was) { stash(was); restore(null); }     // switching accounts: the new one starts fresh
    // (from a guest, everything you have so far comes with you)
    setRaw('webblox-session', key);
    setRaw('webblox-name', username);
    if (!raw('webblox-joined')) setRaw('webblox-joined', all[key].created);
    await makeIdentity(key, username, password);
  };
  WB.logIn = async function (username, password) {
    const key = String(username || '').trim().toLowerCase();
    const a = accounts()[key];
    if (!a && /^[A-Za-z0-9_]{3,20}$/.test(key)) throw new Error('There\'s no account called ' + String(username).trim() + ' on this device yet. To use your account here, Sign Up with the same username and password: your account ID will be the same.');
    if (!a || !window.crypto || !crypto.subtle || await hashPassword(a.salt, String(password || '')) !== a.hash) throw new Error('Wrong username or password.');
    const was = WB.session();
    if (was === key) { if (!WB.identity()) await makeIdentity(key, a.name, password); return; }
    if (was) stash(was); else setRaw('webblox-guest', JSON.stringify(current()));
    restore(load('webblox-acct:' + key, null));
    if (!raw('webblox-name')) setRaw('webblox-name', a.name);
    setRaw('webblox-session', key);
    await makeIdentity(key, a.name, password);
  };
  WB.logOut = function () {
    const was = WB.session();
    if (!was) return;
    stash(was);
    restore(load('webblox-guest', null));
    setRaw('webblox-guest', null);
    setRaw('webblox-session', null);
    setRaw('gnblox-key', null);
  };

  WB.rename = function () {
    const n = prompt('Pick your name (letters, numbers and spaces, up to 20). Other players see it above your head.', WB.name());
    if (n == null) return;
    WB.setName(n);
    document.querySelectorAll('#who, .my-name').forEach(e => { e.textContent = WB.displayName(); });
  };

  WB.launch = function (url) {
    document.getElementById('launch').classList.add('open');
    setTimeout(() => { location.href = url; }, 900);
  };

  // Uploaded places go through IndexedDB: sessionStorage can't hold files bigger than a few MB.
  // The place can come with its images, meshes and sounds: pick them together, or a .zip of them
  // all, each named with its asset id (assets.js; the game gets them from the service worker).
  WB.pickPlace = function () { document.body.classList.remove('nav-open'); document.getElementById('rbxl').click(); };
  const loadScript = src => new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); });
  async function uploadPlace(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    let place = null, assets = [], skipped = [];
    const onlyPlace = files.length === 1 && /\.(rbxl|rbxlx|rbxm|rbxmx)$/i.test(files[0].name);
    try {
      if (onlyPlace) place = { name: files[0].name, bytes: new Uint8Array(await files[0].arrayBuffer()) };
      else {
        if (!window.GNAssets) await loadScript('assets.js');
        ({ place, assets, skipped } = await GNAssets.sort(files));
      }
    } catch (err) {
      alert('Could not read those files: ' + (err.message || err));
      return;
    }
    if (!place) {
      alert('Pick the place file (.rbxl or .rbxlx) too, together with its images, meshes and sounds (or put them all in a .zip).');
      return;
    }
    try {
      await new Promise((resolve, reject) => {
        const req = indexedDB.open('webblox', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('files');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('files', 'readwrite');
          const st = tx.objectStore('files');
          st.put(place.bytes.buffer.slice(place.bytes.byteOffset, place.bytes.byteOffset + place.bytes.byteLength), 'upload');
          // a new game: the last one's assets go
          st.delete(IDBKeyRange.bound('asset:', 'asset:\uffff'));
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
        };
      });
      if (assets.length) await GNAssets.store(assets);
    } catch (err) {
      alert('Could not open that file in this browser (storage is blocked or full).');
      return;
    }
    if (skipped.length) {
      const list = skipped.slice(0, 12).join('\n') + (skipped.length > 12 ? '\n...and ' + (skipped.length - 12) + ' more' : '');
      alert((assets.length ? assets.length + ' asset' + (assets.length === 1 ? '' : 's') + ' added. ' : '') + 'These files were left out:\n\n' + list +
        '\n\nAsset files need the asset id in their name, like 123456.png, and have to be an image, a mesh (.mesh or .obj) or a sound.');
    }
    WB.launch('play.html?custom=1&title=' + encodeURIComponent(place.name.replace(/\.rbx[lm]x?$/i, '')));
  }

  window.WB = WB;
})();
