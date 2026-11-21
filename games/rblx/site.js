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
  const CATEGORY = { hat: 'Hats', gear: 'Gear', shirt: 'Shirts', pants: 'Pants', skin: 'Body Colors' };

  const WB = {
    esc, BRICK, ITEMS, CATEGORY, DEFAULT_LOOK, HATS, GEAR,
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
  function face() {
    return '<circle cx="44" cy="34" r="2.3" fill="#191919"/><circle cx="56" cy="34" r="2.3" fill="#191919"/><path d="M43,40 Q50,46 57,40" stroke="#191919" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
  }
  // mode: 'full' (whole body), 'head' (headshot), 'hatonly' (hat on a grey mannequin head)
  WB.avatarSVG = function (look, mode, bg) {
    look = Object.assign({}, DEFAULT_LOOK, look || {});
    const skin = WB.colorHex(look.skin), shirt = WB.colorHex(look.shirt), pants = WB.colorHex(look.pants);
    const body = `<rect x="10" y="52" width="18" height="40" rx="2" fill="${skin}"/><rect x="72" y="52" width="18" height="40" rx="2" fill="${skin}"/>
      <rect x="30" y="94" width="19" height="40" rx="2" fill="${pants}"/><rect x="51" y="94" width="19" height="40" rx="2" fill="${pants}"/>
      <rect x="30" y="52" width="40" height="40" rx="2" fill="${shirt}"/>`;
    const head = `<rect x="33" y="22" width="34" height="28" rx="8" fill="${mode === 'hatonly' ? '#d4d4d4' : skin}"/>` + (mode === 'hatonly' ? '' : face());
    const vb = mode === 'full' ? '-6 -6 112 148' : mode === 'hatonly' ? '14 -6 72 72' : '10 -2 80 80';
    const back = bg ? `<rect x="-20" y="-20" width="160" height="200" fill="${bg}"/>` : '';
    return `<svg viewBox="${vb}" width="100%" height="100%" aria-hidden="true">${back}${mode === 'hatonly' ? '' : body}${head}${hatSVG(look.hat)}</svg>`;
  };
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
      </ul>
      <a class="upgrade" href="studio.html">Create in Studio</a>
      <a class="upgrade alt" href="#" onclick="WB.pickPlace(); return false;">Upload a Place</a>
      <h4>Events</h4>
      <a class="event" href="index.html#game=nds">Disaster Weekend<small>Survive every disaster!</small></a>
    </aside>
    <div class="scrim" onclick="document.body.classList.remove('nav-open')"></div>
    <div class="confirm launch" id="launch"><div class="box"><div class="spinner"></div><h3>GN-BLOX is now loading.</h3><p>Get ready to play!</p></div></div>
    <input type="file" id="rbxl" accept=".rbxl,.rbxlx,.rbxm,.rbxmx" hidden />`;
    document.body.insertAdjacentHTML('afterbegin', html);
    document.getElementById('who').textContent = WB.displayName();
    WB.updateRobux();
    document.getElementById('rbxl').addEventListener('change', uploadPlace);
    document.querySelectorAll('.lnav a').forEach(a => a.addEventListener('click', () => document.body.classList.remove('nav-open')));
  };

  // ---------- accounts ----------
  // GN-BLOX accounts live in this browser only (there's no server behind this site): each one keeps
  // its own name, ROBUX, items and outfit. Passwords are stored as salted SHA-256 hashes. The
  // active account's data sits in the usual webblox-* keys, so every page and game just reads those.
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
  };
  WB.logIn = async function (username, password) {
    const key = String(username || '').trim().toLowerCase();
    const a = accounts()[key];
    if (!a || !window.crypto || !crypto.subtle || await hashPassword(a.salt, String(password || '')) !== a.hash) throw new Error('Wrong username or password.');
    const was = WB.session();
    if (was === key) return;
    if (was) stash(was); else setRaw('webblox-guest', JSON.stringify(current()));
    restore(load('webblox-acct:' + key, null));
    if (!raw('webblox-name')) setRaw('webblox-name', a.name);
    setRaw('webblox-session', key);
  };
  WB.logOut = function () {
    const was = WB.session();
    if (!was) return;
    stash(was);
    restore(load('webblox-guest', null));
    setRaw('webblox-guest', null);
    setRaw('webblox-session', null);
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
  WB.pickPlace = function () { document.body.classList.remove('nav-open'); document.getElementById('rbxl').click(); };
  async function uploadPlace(e) {
    const f = e.target.files[0]; if (!f) return;
    const buf = await f.arrayBuffer();
    try {
      await new Promise((resolve, reject) => {
        const req = indexedDB.open('webblox', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('files');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('files', 'readwrite');
          tx.objectStore('files').put(buf, 'upload');
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
        };
      });
    } catch (err) {
      alert('Could not open that file in this browser (storage is blocked or full).');
      return;
    }
    WB.launch('play.html?custom=1&title=' + encodeURIComponent(f.name.replace(/\.rbx[lm]x?$/i, '')));
  }

  window.WB = WB;
})();
