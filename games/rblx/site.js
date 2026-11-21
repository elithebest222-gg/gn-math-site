// WebBlox site: shared left menu, saved player state (Robux, inventory, outfit, name), the games,
// pretend friends and chat, the Catalog's items, and avatar drawings. Used by every page.
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
    { id: 'shades', name: 'Cool Shades', type: 'hat', value: 'shades', price: 110, featured: true, desc: 'The coolest sunglasses in WebBlox.' },
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
    displayName() { return WB.name() || 'WebBloxPlayer'; },
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

  // ---------- games ----------
  const GAMES = [
    { id: 'nds', title: 'Natural Disaster Survival', by: 'WebBlox', genre: 'Adventure', playing: 4127, visits: '1.2M', up: 95,
      desc: 'Survive natural disasters on a randomly chosen island. Each round brings a new map and a new disaster: floods, tsunamis, tornadoes, volcanoes, meteor showers and more.\n\nEveryone in a server gets the same map and the same disaster at the same time. How many can you survive?' },
    { id: 'obby', map: 'rainbow-obby.rbxl', title: 'Rainbow Obby', by: 'WebBlox', genre: 'Adventure', playing: 3864, visits: '987K', up: 94,
      desc: '30 stages of obby fun! Jump across stepping stones, dodge spinning lava bars, ride moving platforms, bounce on trampolines, climb trusses and run across a belt that pushes you back.\n\nCheckpoints save your stage, so you only go back to the last one you reached. Reach the golden trophy to win!' },
    { id: 'tower', map: 'sky-tower.rbxl', title: 'Sky Tower', by: 'WebBlox', genre: 'Adventure', playing: 2296, visits: '640K', up: 93,
      desc: 'A tower in the clouds, ten floors high. Jump from platform to platform as they spiral up around it. The higher you go, the smaller they get, and some of them vanish or move.\n\nEvery floor has a checkpoint. Make it to the roof to win!' },
    { id: 'lava', map: 'floor-is-lava.rbxl', title: 'The Floor is Lava', by: 'WebBlox', genre: 'Funny', playing: 2941, visits: '812K', up: 95,
      desc: 'THE FLOOR IS LAVA! Every minute the lava rises out of the floor of a giant living room. Climb the couches, shelves, bunk beds and the tower before it gets you.\n\nEveryone who survives the round gets a win. Everyone in a server faces the same lava at the same time.' },
    { id: 'speedrun', map: 'speed-run.rbxl', title: 'Speed Run', by: 'WebBlox', genre: 'Sports', playing: 1527, visits: '433K', up: 92,
      desc: 'How fast can you go? Cross the line and race over speed pads, gaps, trampolines, stepping stones and a balance beam to the finish.\n\nYour best time goes on the leaderboard. Fall off and you start again!' }
  ];
  WB.GAMES = GAMES;
  WB.game = id => GAMES.find(g => g.id === id);
  WB.fmt = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
  WB.thumbUrl = (g, wide) => 'thumbs/' + g.id + (wide ? '-wide' : '') + '.jpg';
  WB.playUrl = (g, room, ps) => 'play.html?' + (g.map ? 'map=' + encodeURIComponent(g.map) + '&' : '') + 'title=' + encodeURIComponent(g.title)
    + (g.by ? '&by=' + encodeURIComponent(g.by) : '') + (room ? '&room=' + room : '') + (ps > 1 ? '&ps=' + ps : '');
  // games you've played, newest first
  WB.recent = () => { const v = load('webblox-recent', []); return Array.isArray(v) ? v.filter(id => WB.game(id)) : []; };
  WB.playGame = function (g, room, ps) {
    save('webblox-recent', [g.id].concat(WB.recent().filter(id => id !== g.id)).slice(0, 12));
    WB.launch(WB.playUrl(g, room, ps));
  };

  // A headshot or full-body picture of someone else (doesn't borrow your hat or gear).
  function pic(look, mode) {
    look = Object.assign({}, DEFAULT_LOOK, look || {});
    if (window.WB3D) {
      try { return `<img src="${window.WB3D.snapshot(look, { mode, size: mode === 'head' ? 192 : 320 })}" alt="" style="width:100%;height:100%;object-fit:contain;display:block" />`; } catch (e) { /* drawing below */ }
    }
    return WB.avatarSVG(look, mode);
  }
  WB.pic = pic;

  // ---------- friends (pretend ones, kept in this browser) ----------
  const FRIENDS = [
    { name: 'BuilderBen', look: { skin: 24, shirt: 21, pants: 26, hat: 'hardhat' }, game: 'obby' },
    { name: 'ObbyQueen', look: { skin: 125, shirt: 1032, pants: 1, hat: 'bunny' }, game: 'tower' },
    { name: 'CoilKid', look: { skin: 192, shirt: 1031, pants: 23, hat: 'propeller' }, online: true },
    { name: 'Guest1337', look: { skin: 125, shirt: 1, pants: 26, hat: 'cheese' }, game: 'nds' },
    { name: 'LavaJumper', look: { skin: 18, shirt: 106, pants: 26, hat: 'cap' }, game: 'lava' },
    { name: 'WizardWes', look: { skin: 24, shirt: 26, pants: 26, hat: 'wizard' }, online: true },
    { name: 'ChefMaya', look: { skin: 192, shirt: 1, pants: 194, hat: 'chef' } },
    { name: 'SkyPilot99', look: { skin: 125, shirt: 23, pants: 192, hat: 'viking' } },
    { name: 'PartyPanda', look: { skin: 1, shirt: 26, pants: 26, hat: 'party' } },
    { name: 'CowboyCarl', look: { skin: 18, shirt: 192, pants: 23, hat: 'cowboy' } },
    { name: 'ShadesSam', look: { skin: 125, shirt: 199, pants: 26, hat: 'shades' } },
    { name: 'NoobSlayer', look: { skin: 24, shirt: 23, pants: 37 } },
  ];
  const REQUESTS = [
    { name: 'TowerClimber', look: { skin: 18, shirt: 37, pants: 26, hat: 'beanie' } },
    { name: 'SpeedySam', look: { skin: 24, shirt: 21, pants: 1, hat: 'headphones' } },
  ];
  const copy = v => JSON.parse(JSON.stringify(v));
  const cleanName = n => String(n || '').replace(/[^A-Za-z0-9_ ]/g, '').trim().slice(0, 20);
  WB.friends = () => { const v = load('webblox-friends', null); return Array.isArray(v) ? v : copy(FRIENDS); };
  WB.requests = () => { const v = load('webblox-requests', null); return Array.isArray(v) ? v : copy(REQUESTS); };
  WB.friend = name => WB.friends().find(f => f.name === name);
  function friendsChanged(list, reqs) {
    if (list) save('webblox-friends', list);
    if (reqs) save('webblox-requests', reqs);
    updateBadges();
    window.dispatchEvent(new Event('webblox-friends'));
  }
  // { kind: 'game' | 'online' | 'off', text, game }
  WB.presence = function (f) {
    const g = f.game && WB.game(f.game);
    if (g) return { kind: 'game', text: 'Playing ' + g.title, game: g };
    return f.online ? { kind: 'online', text: 'Online' } : { kind: 'off', text: 'Offline' };
  };
  const RANK = { game: 0, online: 1, off: 2 };
  WB.sortedFriends = () => WB.friends().map((f, i) => [f, i]).sort((a, b) => RANK[WB.presence(a[0]).kind] - RANK[WB.presence(b[0]).kind] || a[1] - b[1]).map(p => p[0]);
  WB.friendAv = f => `<span class="av">${pic(f.look, 'head')}<i class="dot ${WB.presence(f).kind}"></i></span>`;
  function randomLook() {
    const r = a => a[Math.floor(Math.random() * a.length)];
    return { skin: r([24, 125, 18, 192]), shirt: r([21, 23, 37, 26, 1, 106, 1031, 1032, 24, 199]), pants: r([26, 23, 192, 194, 28, 1]),
      hat: r(['', 'cap', 'beanie', 'tophat', 'fedora', 'party', 'headphones', 'shades', 'cowboy', 'pirate']) };
  }
  WB.addFriend = function (name, look) {
    name = cleanName(name);
    if (!name) return 'Type a username first.';
    if (name.toLowerCase() === WB.displayName().toLowerCase()) return 'That\'s you!';
    const list = WB.friends();
    if (list.some(f => f.name.toLowerCase() === name.toLowerCase())) return 'You\'re already friends with ' + name + '.';
    if (list.length >= 200) return 'You have too many friends!';
    list.unshift({ name, look: look || randomLook(), online: true });
    friendsChanged(list, WB.requests().filter(r => r.name !== name));
    return '';
  };
  WB.removeFriend = function (name) { friendsChanged(WB.friends().filter(f => f.name !== name)); };
  WB.acceptRequest = function (name) { const r = WB.requests().find(q => q.name === name); if (r) WB.addFriend(r.name, r.look); };
  WB.declineRequest = function (name) { friendsChanged(null, WB.requests().filter(r => r.name !== name)); };

  // ---------- chat (your friends answer with canned replies) ----------
  const CHAT_SEED = {
    threads: { BuilderBen: [['them', 'yo want to do Rainbow Obby later?']], Guest1337: [['them', 'just bought the cheese hat lol']] },
    unread: { BuilderBen: 1, Guest1337: 1 },
  };
  const chatState = () => { const v = load('webblox-chat', null); return v && v.threads && v.unread ? v : copy(CHAT_SEED); };
  const saveChat = s => save('webblox-chat', s);
  WB.unread = function () { const u = chatState().unread, names = new Set(WB.friends().map(f => f.name)); return Object.keys(u).reduce((n, k) => n + (names.has(k) ? u[k] || 0 : 0), 0); };
  function updateBadges() {
    const n = WB.unread(), r = WB.requests().length;
    document.querySelectorAll('.msg-count').forEach(e => { e.textContent = n ? String(n) : ''; });
    document.querySelectorAll('.req-count').forEach(e => { e.textContent = r ? String(r) : ''; });
  }
  WB.updateBadges = updateBadges;

  const chatUI = { open: false, with: null, typing: null };
  function chatReply(f, text) {
    const t = text.toLowerCase(), p = WB.presence(f);
    const pick = a => a[Math.floor(Math.random() * a.length)];
    if (/\b(hi+|hey+|hello|yo+|sup|hai)\b/.test(t)) return pick(['hey!', 'yo', 'hiii', 'sup ' + WB.displayName()]);
    if (/(play|join|game|server|obby|lava|tower)/.test(t)) return p.game ? pick([`im in ${p.game.title} rn, join me!`, `come to ${p.game.title}`]) : pick(['sure, what game?', 'ok lets do The Floor is Lava', 'one sec, getting on']);
    if (/(hat|catalog|robux|coil|outfit)/.test(t)) return pick(['the Speed Coil is so op', 'i want the Golden Crown so bad', 'collect your daily robux in the catalog!']);
    if (/\?\s*$/.test(t)) return pick(['idk', 'yeah', 'nah', 'maybe lol', 'why?']);
    return pick(['lol', 'nice', 'haha', 'gg', 'same', 'fr', 'ok', 'brb', 'did you see the new hats?', ':)']);
  }
  function renderChat() {
    const box = document.getElementById('chat');
    if (!box) return;
    box.classList.toggle('open', chatUI.open);
    updateBadges();
    if (!chatUI.open) return;
    const body = document.getElementById('chat-body');
    const s = chatState();
    const f = chatUI.with && WB.friend(chatUI.with);
    if (!f) {
      chatUI.with = null;
      const list = WB.sortedFriends().sort((a, b) => (s.unread[b.name] || 0) - (s.unread[a.name] || 0));
      body.innerHTML = `<div class="chat-list">${list.length ? list.map(fr => {
        const th = s.threads[fr.name] || [], last = th.filter(m => m[0] !== 'note').pop(), un = s.unread[fr.name] || 0;
        const sub = last ? (last[0] === 'me' ? 'You: ' : '') + last[1] : WB.presence(fr).text;
        return `<button class="chat-row${un ? ' unread' : ''}" data-name="${esc(fr.name)}">${WB.friendAv(fr)}<span class="tx"><b>${esc(fr.name)}</b><span>${esc(sub)}</span></span>${un ? '<i class="pip"></i>' : ''}</button>`;
      }).join('') : '<p class="empty" style="margin:8px">Add some friends to chat with them.</p>'}</div>`;
      body.querySelectorAll('.chat-row').forEach(b => b.addEventListener('click', () => WB.chatWith(b.dataset.name)));
      return;
    }
    if (s.unread[f.name]) { s.unread[f.name] = 0; saveChat(s); updateBadges(); }
    const p = WB.presence(f);
    const msgs = (s.threads[f.name] || []).map(([who, text]) => who === 'note' ? `<p class="note">${esc(text)}</p>` : `<p class="${who === 'me' ? 'me' : ''}">${esc(text)}</p>`).join('')
      + (chatUI.typing === f.name ? `<p class="typing">${esc(f.name)} is typing…</p>` : '');
    const keep = document.getElementById('chat-in');
    const draft = keep && keep.dataset.name === f.name ? keep.value : '';
    body.innerHTML = `<div class="chat-top"><button aria-label="Back" id="chat-back"><svg class="o"><use href="#o-back"/></svg></button>
        <div><b>${esc(f.name)}</b><span>${esc(p.text)}</span></div></div>
      <div class="chat-msgs" id="chat-msgs">${msgs || `<p class="note">Say hi to ${esc(f.name)}!</p>`}</div>
      <form class="chat-form" id="chat-form"><input id="chat-in" data-name="${esc(f.name)}" maxlength="200" placeholder="Send a message" autocomplete="off" aria-label="Message" /><button aria-label="Send"><svg class="o"><use href="#o-send"/></svg></button></form>`;
    const m = document.getElementById('chat-msgs'); m.scrollTop = m.scrollHeight;
    document.getElementById('chat-back').onclick = () => { chatUI.with = null; renderChat(); };
    const input = document.getElementById('chat-in');
    input.value = draft;
    if (window.matchMedia('(pointer: fine)').matches) input.focus();
    document.getElementById('chat-form').onsubmit = e => {
      e.preventDefault();
      const text = input.value.trim(); if (!text) return;
      input.value = '';
      sendChat(f.name, text);
    };
  }
  function sendChat(name, text) {
    const s = chatState();
    const th = s.threads[name] = (s.threads[name] || []).concat([['me', text]]).slice(-60);
    const f = WB.friend(name);
    if (f && WB.presence(f).kind === 'off') {
      if (!th.slice(-3).some(m => m[0] === 'note')) th.push(['note', name + ' is offline. They\'ll see this next time they\'re on.']);
      saveChat(s); renderChat(); return;
    }
    saveChat(s); renderChat();
    if (!f) return;
    setTimeout(() => { chatUI.typing = name; if (chatUI.with === name) renderChat(); }, 500 + Math.random() * 500);
    setTimeout(() => {
      const s2 = chatState();
      s2.threads[name] = (s2.threads[name] || []).concat([['them', chatReply(f, text)]]).slice(-60);
      if (!(chatUI.open && chatUI.with === name)) s2.unread[name] = (s2.unread[name] || 0) + 1;
      saveChat(s2);
      if (chatUI.typing === name) chatUI.typing = null;
      renderChat();
    }, 1400 + Math.random() * 1600);
  }
  WB.chatWith = function (name) { chatUI.open = true; chatUI.with = name || null; renderChat(); };
  WB.toggleChat = function () { chatUI.open = !chatUI.open; if (!chatUI.open) chatUI.with = null; renderChat(); };

  // ---------- friends list + a friend's card (modals, on every page) ----------
  function modal(id, html) {
    let m = document.getElementById(id);
    if (!m) {
      m = document.createElement('div');
      m.className = 'modal'; m.id = id;
      m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
      document.body.appendChild(m);
    }
    m.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" style="width:min(${id === 'friend-card' ? 640 : 860}px,100%)"><button class="x" aria-label="Close">&times;</button>${html}</div>`;
    m.querySelector('.x').onclick = () => m.classList.remove('open');
    m.classList.add('open');
    return m;
  }
  let flTab = 'friends', flMsg = '';
  WB.openFriends = function (tab) {
    document.body.classList.remove('nav-open');
    if (tab) flTab = tab;
    const list = WB.sortedFriends(), reqs = WB.requests();
    const row = (f, acts) => `<div class="fl-row">${WB.friendAv(f)}<button class="who" data-open="${esc(f.name)}"><b>${esc(f.name)}</b>
      <span class="${WB.presence(f).kind}">${esc(flTab === 'requests' ? 'Wants to be your friend' : WB.presence(f).text)}</span></button><span class="acts">${acts}</span></div>`;
    const body = flTab === 'requests'
      ? (reqs.length ? `<div class="fl-list">${reqs.map(r => row(r, `<button class="btn-blue" data-accept="${esc(r.name)}">Accept</button><button class="btn-white" data-decline="${esc(r.name)}">Ignore</button>`)).join('')}</div>`
        : '<p class="empty">No friend requests right now.</p>')
      : `<form class="fl-add" id="fl-add"><input id="fl-name" maxlength="20" placeholder="Add a friend by username" autocomplete="off" aria-label="Username" /><button class="btn-blue">Add Friend</button></form>
        ${flMsg ? `<p class="fl-msg">${esc(flMsg)}</p>` : ''}
        ${list.length ? `<div class="fl-list">${list.map(f => row(f, `<button class="btn-white" data-chat="${esc(f.name)}">Chat</button>`)).join('')}</div>` : '<p class="empty">No friends yet. Add someone above!</p>'}`;
    const m = modal('friends-modal', `<div class="fl-head"><h2>Friends</h2></div>
      <div class="fl-tabs"><button data-tab="friends" class="${flTab === 'friends' ? 'on' : ''}">Friends (${list.length})</button>
        <button data-tab="requests" class="${flTab === 'requests' ? 'on' : ''}">Requests${reqs.length ? `<span class="count">${reqs.length}</span>` : ''}</button></div>
      <div class="fl-body">${body}</div>`);
    flMsg = '';
    m.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => WB.openFriends(b.dataset.tab));
    m.querySelectorAll('[data-open]').forEach(b => b.onclick = () => WB.openFriend(b.dataset.open));
    m.querySelectorAll('[data-chat]').forEach(b => b.onclick = () => { m.classList.remove('open'); WB.chatWith(b.dataset.chat); });
    m.querySelectorAll('[data-accept]').forEach(b => b.onclick = () => { WB.acceptRequest(b.dataset.accept); WB.openFriends(); });
    m.querySelectorAll('[data-decline]').forEach(b => b.onclick = () => { WB.declineRequest(b.dataset.decline); WB.openFriends(); });
    const form = m.querySelector('#fl-add');
    if (form) {
      form.onsubmit = e => {
        e.preventDefault();
        const name = cleanName(m.querySelector('#fl-name').value);
        const err = WB.addFriend(name);
        flMsg = err || 'You and ' + name + ' are now friends!';
        WB.openFriends();
        if (err) { const i = document.getElementById('fl-name'); i.value = name; i.focus(); }
      };
      if (window.matchMedia('(pointer: fine)').matches) m.querySelector('#fl-name').focus();
    }
  };
  WB.openFriend = function (name) {
    const f = WB.friend(name) || WB.requests().find(r => r.name === name);
    if (!f) return;
    const isFriend = !!WB.friend(name), p = isFriend ? WB.presence(f) : { kind: 'off', text: 'Wants to be your friend' };
    const btns = isFriend
      ? (p.game ? `<button class="btn-blue" id="fp-join">Join Game</button>` : '') + `<button class="btn-white" id="fp-chat">Chat</button><button class="btn-white" id="fp-remove">Unfriend</button>`
      : `<button class="btn-blue" id="fp-accept">Accept</button><button class="btn-white" id="fp-decline">Ignore</button>`;
    const m = modal('friend-card', `<div class="fp"><div class="fig">${pic(f.look, 'full')}</div><div>
      <h2>${esc(f.name)}</h2><div class="st ${p.kind}">${esc(p.text)}</div>
      <div class="btns">${btns}</div>
      <p class="since">Friends here are pretend and live in this browser. To play with a real friend, open a game's Servers tab and send them a private server link.</p></div></div>`);
    const on = (id, fn) => { const b = m.querySelector('#' + id); if (b) b.onclick = fn; };
    const close = () => m.classList.remove('open');
    on('fp-join', () => { close(); WB.playGame(p.game); });
    on('fp-chat', () => { close(); document.getElementById('friends-modal')?.classList.remove('open'); WB.chatWith(f.name); });
    on('fp-remove', () => { if (confirm('Unfriend ' + f.name + '?')) { WB.removeFriend(f.name); close(); if (document.getElementById('friends-modal')?.classList.contains('open')) WB.openFriends(); } });
    on('fp-accept', () => { WB.acceptRequest(f.name); WB.openFriend(f.name); if (document.getElementById('friends-modal')?.classList.contains('open')) WB.openFriends(); });
    on('fp-decline', () => { WB.declineRequest(f.name); close(); if (document.getElementById('friends-modal')?.classList.contains('open')) WB.openFriends(); });
  };

  // ---------- left menu ----------
  // outline icons (o-*) for the menu; filled ones (i-*) for ratings, ROBUX and the play button
  const sym = (id, d) => `<symbol id="${id}" viewBox="0 0 24 24">${d}</symbol>`;
  const ICONS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <symbol id="i-menu" viewBox="0 0 24 24"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></symbol>
    <symbol id="i-user" viewBox="0 0 24 24"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z"/></symbol>
    <symbol id="i-robux" viewBox="0 0 24 24"><path d="M12 2 21 7v10l-9 5-9-5V7zm0 2.3L5 8.2v7.6l7 3.9 7-3.9V8.2zM9 9h6v6H9z"/></symbol>
    <symbol id="i-thumb" viewBox="0 0 24 24"><path d="M2 10h4v11H2zm6 11V10l5-8 1.5 1c.6.4.8 1.1.6 1.8L14 9h6.2c1 0 1.8.9 1.6 1.9l-1.6 8.6c-.2 1-1 1.5-2 1.5z"/></symbol>
    <symbol id="i-play" viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></symbol>
    ${sym('o-home', '<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>')}
    ${sym('o-profile', '<circle cx="12" cy="7" r="3.5"/><path d="M8.5 21v-3.2L7 12.8A2 2 0 0 1 9 10.5h6a2 2 0 0 1 2 2.3l-1.5 5V21z"/>')}
    ${sym('o-plus', '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M10 16.5v-9h2.8a2.6 2.6 0 0 1 0 5.2H10"/>')}
    ${sym('o-msg', '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H9l-5 4z"/><path d="M8 9h8M8 12.5h5"/>')}
    ${sym('o-friends', '<circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2M17.5 14.2A5 5 0 0 1 21 19v1"/>')}
    ${sym('o-avatar', '<circle cx="12" cy="4.8" r="2.3"/><path d="M5.5 9h13M12 9v5M8.5 21 12 14l3.5 7M8 9l-.6 4.5M16 9l.6 4.5"/>')}
    ${sym('o-inv', '<path d="M6 9a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v10.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5z"/><path d="M9.5 5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1M9 14h6v3"/>')}
    ${sym('o-trade', '<path d="M4 8h15M15.5 4.5 19 8l-3.5 3.5M20 16H5M8.5 12.5 5 16l3.5 3.5"/>')}
    ${sym('o-groups', '<circle cx="12" cy="7.5" r="2.8"/><circle cx="5.5" cy="9.5" r="2"/><circle cx="18.5" cy="9.5" r="2"/><path d="M7.5 19.5v-1a4.5 4.5 0 0 1 9 0v1M2.5 18.5V18a3 3 0 0 1 4-2.8M21.5 18.5V18a3 3 0 0 0-4-2.8"/>')}
    ${sym('o-news', '<path d="M12 2.8 6.5 8.5 8.3 17h7.4l1.8-8.5z"/><path d="M12 2.8V11"/><circle cx="12" cy="12.3" r="1.4"/><path d="M8 21h8"/>')}
    ${sym('o-store', '<path d="M4.5 10v10h15V10"/><path d="M3 9.5 5 4h14l2 5.5a2.6 2.6 0 0 1-4.5 1.7 2.6 2.6 0 0 1-4.5 0 2.6 2.6 0 0 1-4.5 0A2.6 2.6 0 0 1 3 9.5z"/><path d="M10 20v-5h4v5"/>')}
    ${sym('o-robux', '<path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z"/><rect x="9.3" y="9.3" width="5.4" height="5.4" rx=".6"/>')}
    ${sym('o-create', '<path d="M15 4.5l4.5 4.5L9 19.5H4.5V15z"/><path d="M12.5 7l4.5 4.5"/>')}
    ${sym('o-settings', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')}
    ${sym('o-search', '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/>')}
    ${sym('o-add', '<path d="M12 4.5v15M4.5 12h15"/>')}
    ${sym('o-arrow', '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>')}
    ${sym('o-compose', '<path d="M20 13.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19V6a1.5 1.5 0 0 1 1.5-1.5H11"/><path d="M17.5 3.5l3 3L12 15H9v-3z"/>')}
    ${sym('o-back', '<path d="M15 5l-7 7 7 7"/>')}
    ${sym('o-send', '<path d="M4 12 20 4l-4 16-4-6.5z"/><path d="M12 13.5 20 4"/>')}
  </svg>`;

  // active: 'home' | 'profile' | 'avatar' | 'inventory' | 'catalog' | 'communities' | 'news'
  WB.chrome = function (active, searchPlaceholder) {
    const item = (k, href, icon, label, extra) => `<li><a href="${href}" data-k="${k}"${active === k ? ' class="on"' : ''}><svg class="o"><use href="#o-${icon}"/></svg>${label}${extra || ''}</a></li>`;
    const action = (fn, icon, label, extra) => `<li><button type="button" onclick="${fn}"><svg class="o"><use href="#o-${icon}"/></svg>${label}${extra || ''}</button></li>`;
    const html = ICONS + `
    <header class="topbar">
      <button class="burger" aria-label="Menu" onclick="document.body.classList.toggle('nav-open')"><svg class="i"><use href="#i-menu"/></svg></button>
      <a class="logo" href="index.html" aria-label="WebBlox home"><img src="WebBlox.png" alt="WebBlox" /></a>
      <a class="rbx" href="catalog.html#robux" title="ROBUX"><svg class="i"><use href="#i-robux"/></svg><span class="rbx-count"></span></a>
    </header>
    <aside class="lnav" aria-label="Menu">
      <a class="who" href="profile.html"><span class="hs" id="who-hs"></span><span id="who-name"></span></a>
      <label class="search"><svg class="o"><use href="#o-search"/></svg><input id="q" type="search" placeholder="${esc(searchPlaceholder || 'Search')}" autocomplete="off" aria-label="Search" /></label>
      <ul>
        ${item('home', 'index.html', 'home', 'Home')}
        ${item('profile', 'profile.html', 'profile', 'Profile')}
        ${item('plus', 'catalog.html#robux', 'plus', 'WebBlox Plus')}
        ${action('WB.chatWith()', 'msg', 'Messages', '<span class="count msg-count"></span>')}
        ${action('WB.openFriends()', 'friends', 'Friends', '<span class="count req-count"></span>')}
        ${item('avatar', 'catalog.html?cat=wearing', 'avatar', 'Avatar')}
        ${item('inventory', 'catalog.html?cat=inventory', 'inv', 'Inventory')}
        ${item('trade', 'catalog.html?cat=inventory', 'trade', 'Trade')}
        ${item('communities', 'index.html#communities', 'groups', 'Communities')}
        ${item('news', 'index.html#news', 'news', 'Newsroom')}
        ${item('catalog', 'catalog.html', 'store', 'Official Store')}
      </ul>
      <hr />
      <ul>
        ${item('robux', 'catalog.html#robux', 'robux', 'Robux', '<span class="bal rbx-count"></span>')}
        ${action('WB.pickPlace()', 'create', 'Create')}
        ${action('WB.rename()', 'settings', 'Settings')}
      </ul>
      <div class="brand"><img src="WebBlox.png" alt="" /><span>Fan-made. Not affiliated with Roblox.</span></div>
    </aside>
    <div class="scrim" onclick="document.body.classList.remove('nav-open')"></div>
    <div class="chat" id="chat">
      <button class="chat-bar" onclick="WB.toggleChat()" aria-label="Chat"><span class="t">Chat</span><span class="count msg-count"></span><svg class="o"><use href="#o-compose"/></svg></button>
      <div class="chat-body" id="chat-body"></div>
    </div>
    <div class="confirm launch" id="launch"><div class="box"><div class="spinner"></div><h3>WebBlox is now loading.</h3><p>Get ready to play!</p></div></div>
    <input type="file" id="rbxl" accept=".rbxl,.rbxlx" hidden />`;
    document.body.insertAdjacentHTML('afterbegin', html);
    WB.refreshMe();
    WB.updateRobux();
    updateBadges();
    document.getElementById('rbxl').addEventListener('change', uploadPlace);
    document.querySelectorAll('.lnav a, .lnav button').forEach(a => a.addEventListener('click', () => document.body.classList.remove('nav-open')));
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      ['friend-card', 'friends-modal'].map(id => document.getElementById(id)).filter(m => m && m.classList.contains('open')).slice(0, 1).forEach(m => m.classList.remove('open'));
    });
  };
  // mark a menu item as the current page
  WB.setNav = k => document.querySelectorAll('.lnav a[data-k]').forEach(a => a.classList.toggle('on', a.dataset.k === k));
  WB.refreshMe = function () {
    document.querySelectorAll('#who-name, .my-name').forEach(e => { e.textContent = WB.displayName(); });
    const hs = document.getElementById('who-hs');
    if (hs) hs.innerHTML = WB.avatarImg(WB.look(), 'head', null, 96);
  };

  WB.rename = function () {
    const n = prompt('Pick your name (letters, numbers and spaces, up to 20). Other players see it above your head.', WB.name());
    if (n == null) return;
    WB.setName(n);
    WB.refreshMe();
  };

  WB.launch = function (url) {
    document.getElementById('launch').classList.add('open');
    setTimeout(() => { location.href = url; }, 900);
  };
  // coming back with the browser's Back button: don't leave the loading box up
  window.addEventListener('pageshow', () => { const l = document.getElementById('launch'); if (l) l.classList.remove('open'); });

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
    WB.launch('play.html?custom=1&title=' + encodeURIComponent(f.name.replace(/\.rbxlx?$/i, '')));
  }

  window.WB = WB;
})();
