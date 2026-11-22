// GN-BLOX 3D avatars (three.js, three.min.js): your avatar the way the game builds it, with the
// classic R6 body, your Catalog colors, faces and clothes (classic 585 x 559 shirt and pants
// templates, mapped onto the body like Roblox does), and hats and gear from WB.HATS / WB.GEAR in
// site.js (the same parts scripts/WebBloxPlayers.lua builds in-game).
//
// Faces and clothes are images, so the first picture of a look can come out without them: once
// they've loaded, window gets a "wb3d-ready" event and pages draw their avatars again.
//
//   WB3D.snapshot(look, { mode, size, bg, item })  -> image data URL
//       mode: 'full' (whole avatar), 'head' (headshot), 'hat' (item on a grey head), 'gear'
//   WB3D.viewer(element, look, { bg })             -> { update(look), destroy() }: turns by itself,
//                                                     drag to turn it yourself
// WB3D is left undefined when the browser has no WebGL; pages fall back to the 2D drawings.
(function () {
  'use strict';
  if (!window.THREE || !window.WB) return;
  try {
    const c = document.createElement('canvas');
    if (!(c.getContext('webgl2') || c.getContext('webgl'))) return;
  } catch (e) { return; }
  const T = window.THREE;
  const WB = window.WB;
  const MANNEQUIN = '#b9b9b9';
  const UP = new T.Matrix4().makeRotationZ(Math.PI / 2);   // CFrame.Angles(0, 0, pi/2)
  const DEG = Math.PI / 180;

  // ---- geometry (Roblox part shapes) ---------------------------------------------------------
  const cache = {};
  const once = (key, make) => cache[key] || (cache[key] = make());
  function wedge(x, y, z) {
    // a Roblox wedge: full bottom and back (+Z); the slope runs from the bottom front edge up to the top back edge
    x /= 2; y /= 2; z /= 2;
    const v = {
      a: [-x, -y, -z], b: [x, -y, -z], c: [x, -y, z], d: [-x, -y, z], e: [-x, y, z], f: [x, y, z],
    };
    // counter-clockwise from outside: bottom, back, slope, left, right
    const tris = [['a', 'b', 'c'], ['a', 'c', 'd'], ['d', 'c', 'f'], ['d', 'f', 'e'], ['a', 'f', 'b'], ['a', 'e', 'f'], ['a', 'd', 'e'], ['b', 'f', 'c']];
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(tris.flat().flatMap(k => v[k]), 3));
    g.computeVertexNormals();
    return g;
  }
  function geometry(piece) {
    const [x, y, z] = piece.s;
    if (piece.c === 'WedgePart') return once('w' + piece.s, () => wedge(x, y, z));
    if (piece.shape === 'ball') return once('b' + Math.min(x, y, z), () => new T.SphereGeometry(Math.min(x, y, z) / 2, 28, 18));
    if (piece.shape === 'cyl') {
      // Roblox cylinders lie along X: s[0] is the length, the smaller of s[1], s[2] the diameter
      return once('c' + piece.s, () => new T.CylinderGeometry(Math.min(y, z) / 2, Math.min(y, z) / 2, x, 32).rotateZ(Math.PI / 2));
    }
    return once('x' + piece.s, () => new T.BoxGeometry(x, y, z));
  }
  const headGeometry = () => once('head', () => {
    // the classic head: a cylinder with rounded edges, 1.2 studs across
    const pts = [[0, -0.6], [0.48, -0.6]];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2); pts.push([0.48 + 0.13 * Math.cos(a), -0.47 + 0.13 * Math.sin(a)]); }
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push([0.48 + 0.13 * Math.cos(a), 0.47 + 0.13 * Math.sin(a)]); }
    pts.push([0, 0.6]);
    return new T.LatheGeometry(pts.map(p => new T.Vector2(p[0], p[1])), 40);
  });
  // ---- images (faces and clothing templates, catalog/assets/<id>.png) -------------------------
  const images = new Map();   // id -> { img, ok }
  let missing = false;        // something the current build needed wasn't loaded yet
  let readyTimer = 0;
  function image(id) {
    let e = images.get(id);
    if (!e) {
      e = { img: new Image(), ok: false };
      images.set(id, e);
      e.img.onload = () => { e.ok = true; clearTimeout(readyTimer); readyTimer = setTimeout(() => window.dispatchEvent(new Event('wb3d-ready')), 30); };
      e.img.onerror = () => { e.failed = true; };
      e.img.src = WB.assetUrl(id);
    }
    if (!e.ok && !e.failed) missing = true;
    return e.ok ? e.img : null;
  }
  const faceTextures = new Map();
  function faceTex(id) {
    if (faceTextures.has(id)) return faceTextures.get(id);
    const img = image(id);
    if (!img) return null;
    // the strip around the head is 1.16 studs wide and 0.9 tall in a 256 x 128 picture: the face is a 0.9-stud square
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    c.getContext('2d').drawImage(img, 29, 0, 199, 128);
    const t = new T.CanvasTexture(c);
    faceTextures.set(id, t);
    return t;
  }
  let faceTexture = null;
  function face(id) {
    const custom = id && faceTex(id);
    if (!faceTexture && !custom) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#1a1a1a';
      for (const x of [104, 152]) { g.beginPath(); g.ellipse(x, 46, 8, 14, 0, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = '#1a1a1a'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.arc(128, 54, 34, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke();
      faceTexture = new T.CanvasTexture(c);
    }
    // a strip of cylinder wrapped around the front of the head (which looks toward -Z)
    const geo = once('face', () => new T.CylinderGeometry(0.613, 0.613, 0.9, 24, 1, true, Math.PI - 0.95, 1.9));
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ map: custom || faceTexture, transparent: true }));
    m.position.y = -0.02;
    return m;
  }

  // ---- clothes: classic templates on the R6 body ----------------------------------------------
  // where each face of each body part is in a 585 x 559 template: [x, y, w, h] for the box faces
  // in three.js order (+X: the character's right, -X, top, bottom, +Z: back, -Z: front)
  const TPL = {
    torso: [[165, 74, 64, 128], [361, 74, 64, 128], [231, 8, 128, 64], [231, 204, 128, 64], [427, 74, 128, 128], [231, 74, 128, 128]],
    right: [[19, 355, 64, 128], [151, 355, 64, 128], [217, 289, 64, 64], [217, 485, 64, 64], [85, 355, 64, 128], [217, 355, 64, 128]],
    left: [[374, 355, 64, 128], [506, 355, 64, 128], [308, 289, 64, 64], [308, 485, 64, 64], [440, 355, 64, 128], [308, 355, 64, 128]],
  };
  function templateBox(size, rects) {
    return once('t' + size + rects, () => {
      const g = new T.BoxGeometry(size[0], size[1], size[2]);
      const uv = g.attributes.uv;
      for (let f = 0; f < 6; f++) {
        const [x, y, w, h] = rects[f];
        for (let k = 0; k < 4; k++) {
          let u = uv.getX(f * 4 + k), v = uv.getY(f * 4 + k);
          if (f === 2 || f === 3) { u = 1 - u; v = 1 - v; }   // top and bottom: turned to match the template
          uv.setXY(f * 4 + k, (x + u * w) / 585, 1 - (y + (1 - v) * h) / 559);
        }
      }
      uv.needsUpdate = true;
      return g;
    });
  }
  // one picture per body area: its color underneath, then the pants, then the shirt
  const clothTextures = new Map();
  function clothes(base, layers) {
    const imgs = layers.map(id => id && image(id));
    if (layers.some((id, i) => id && !imgs[i])) return null;
    const key = base + '|' + layers.join('|');
    if (clothTextures.has(key)) return clothTextures.get(key);
    const c = document.createElement('canvas');
    c.width = 585; c.height = 559;
    const g = c.getContext('2d');
    g.fillStyle = typeof base === 'string' ? base : WB.colorHex(base);
    g.fillRect(0, 0, 585, 559);
    for (const img of imgs) if (img) g.drawImage(img, 0, 0, 585, 559);
    const t = new T.CanvasTexture(c);
    const m = new T.MeshLambertMaterial({ map: t });
    clothTextures.set(key, m);
    return m;
  }

  // ---- materials -----------------------------------------------------------------------------
  const materials = {};
  function material(color, neon) {
    const hex = typeof color === 'string' ? color : WB.colorHex(color);
    const key = hex + (neon ? 'n' : '');
    return materials[key] || (materials[key] = neon
      ? new T.MeshBasicMaterial({ color: new T.Color(hex).multiplyScalar(1.15) })
      : new T.MeshLambertMaterial({ color: new T.Color(hex) }));
  }

  // one part, placed the way the game welds it: CFrame.new(p) * (cyl and UP) * CFrame.Angles(r)
  function partMesh(piece) {
    const mesh = new T.Mesh(geometry(piece), material(piece.color, piece.neon));
    const m = new T.Matrix4().makeTranslation(piece.p[0], piece.p[1], piece.p[2]);
    if (piece.shape === 'cyl') m.multiply(UP);
    if (piece.r) m.multiply(new T.Matrix4().makeRotationFromEuler(new T.Euler(piece.r[0] * DEG, piece.r[1] * DEG, piece.r[2] * DEG, 'XYZ')));
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(m);
    mesh.userData.base = m.clone();
    mesh.userData.spin = piece.spin || 0;
    return mesh;
  }
  function pieces(list) {
    const g = new T.Group();
    for (const p of list || []) g.add(partMesh(p));
    return g;
  }

  function avatar(look, opts) {
    look = Object.assign({}, WB.DEFAULT_LOOK, look || {});
    opts = opts || {};
    const g = new T.Group();
    const skin = opts.mannequin ? MANNEQUIN : look.skin;
    const add = (size, pos, color) => {
      const m = new T.Mesh(once('x' + size, () => new T.BoxGeometry(size[0], size[1], size[2])), material(color));
      m.position.set(pos[0], pos[1], pos[2]);
      g.add(m);
    };
    const head = new T.Group();
    head.position.set(0, 4.5, 0);
    head.add(new T.Mesh(headGeometry(), material(skin)));
    if (!opts.mannequin || opts.faceless === false) head.add(face(look.face));
    if (look.hat && WB.HATS[look.hat]) head.add(pieces(WB.HATS[look.hat]));
    g.add(head);
    if (opts.headOnly) return g;
    const shirtTex = look.shirtTex || '', pantsTex = look.pantsTex || '';
    // (the character's right is +X: its right arm and leg are at +1.5 and +0.5)
    const part = (size, pos, color, rects, layers) => {
      const mat = layers.some(Boolean) && clothes(color, layers);
      if (!mat) return add(size, pos, color);
      const m = new T.Mesh(templateBox(size, rects), mat);
      m.position.set(pos[0], pos[1], pos[2]);
      g.add(m);
    };
    part([2, 2, 1], [0, 3, 0], look.shirt, TPL.torso, [pantsTex, shirtTex]);
    part([1, 2, 1], [1.5, 3, 0], skin, TPL.right, [shirtTex]);
    part([1, 2, 1], [-1.5, 3, 0], skin, TPL.left, [shirtTex]);
    part([1, 2, 1], [0.5, 1, 0], look.pants, TPL.right, [pantsTex]);
    part([1, 2, 1], [-0.5, 1, 0], look.pants, TPL.left, [pantsTex]);
    return g;
  }

  // ---- scenes ----------------------------------------------------------------------------------
  function scene(bg) {
    const s = new T.Scene();
    if (bg) s.background = new T.Color(bg);
    s.add(new T.HemisphereLight(0xffffff, 0x8a8a8a, 0.9));
    const sun = new T.DirectionalLight(0xffffff, 0.75);
    sun.position.set(-4, 9, -7);
    s.add(sun);
    return s;
  }
  // what to show, and the direction we look at it from (the front is -Z)
  function subject(look, mode, item, opts) {
    if (mode === 'gear') return { obj: pieces((WB.GEAR[item] || {}).pieces), dir: [-0.9, 0.35, -1] };
    if (mode === 'hat') return { obj: avatar({ hat: item }, { headOnly: true, mannequin: true }), dir: [-0.55, 0.45, -1] };
    if (mode === 'head') return { obj: avatar(look, { headOnly: true }), dir: [-0.3, 0.12, -1] };
    return { obj: avatar(look, opts && opts.mannequin ? { mannequin: true } : {}), dir: [-0.42, 0.2, -1] };
  }
  function frame(camera, obj, dir, fill) {
    const box = new T.Box3().setFromObject(obj);
    const sphere = box.getBoundingSphere(new T.Sphere());
    const d = new T.Vector3(dir[0], dir[1], dir[2]).normalize();
    const dist = sphere.radius / Math.sin((camera.fov * DEG) / 2) * (fill || 1.02);
    camera.position.copy(sphere.center).addScaledVector(d, dist);
    camera.near = dist / 20;
    camera.far = dist * 4;
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();
  }

  // one renderer shared by all snapshots
  let snapRenderer = null;
  const snaps = new Map();
  function snapshot(look, opts) {
    opts = opts || {};
    const size = opts.size || 256, mode = opts.mode || 'full';
    const key = JSON.stringify([look || null, mode, opts.item || '', size, opts.bg || '', !!opts.mannequin]);
    if (snaps.has(key)) return snaps.get(key);
    if (!snapRenderer) {
      snapRenderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      snapRenderer.setPixelRatio(1);
    }
    snapRenderer.setSize(size, size, false);
    const s = scene(opts.bg);
    missing = false;
    const { obj, dir } = subject(look, mode, opts.item, opts);
    const complete = !missing;
    s.add(obj);
    const cam = new T.PerspectiveCamera(30, 1, 0.1, 100);
    frame(cam, obj, dir, mode === 'full' ? 1.0 : 1.05);
    snapRenderer.setClearColor(0x000000, 0);
    snapRenderer.render(s, cam);
    const url = snapRenderer.domElement.toDataURL('image/png');
    if (complete) snaps.set(key, url);   // (drawn again once its images are in)
    return url;
  }

  // a live avatar that turns
  function viewer(el, look, opts) {
    opts = opts || {};
    const r = new T.WebGLRenderer({ antialias: true, alpha: !opts.bg });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(r.domElement);
    r.domElement.style.display = 'block';
    r.domElement.style.touchAction = 'pan-y';
    r.domElement.style.cursor = 'grab';
    const s = scene(opts.bg);
    const cam = new T.PerspectiveCamera(30, 1, 0.1, 100);
    const turn = new T.Group();
    s.add(turn);
    let obj = null, angle = -0.35, auto = true, dragging = false, lastX = 0, idleSince = 0, raf = 0, alive = true, current = look;
    function setLook(l) {
      current = l;
      if (obj) turn.remove(obj);
      missing = false;
      obj = avatar(l);
      obj.userData.missing = missing;
      turn.add(obj);
      turn.rotation.y = 0;
      frame(cam, obj, [0, 0.16, -1], 1.0);
    }
    function resize() {
      const w = el.clientWidth || 300, h = el.clientHeight || w;
      r.setSize(w, h, false);
      r.domElement.style.width = w + 'px';
      r.domElement.style.height = h + 'px';
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    const down = e => { dragging = true; auto = false; lastX = e.clientX; r.domElement.style.cursor = 'grabbing'; r.domElement.setPointerCapture && r.domElement.setPointerCapture(e.pointerId); };
    const move = e => { if (!dragging) return; angle += (e.clientX - lastX) * 0.012; lastX = e.clientX; };
    const up = () => { dragging = false; idleSince = performance.now(); r.domElement.style.cursor = 'grab'; };
    r.domElement.addEventListener('pointerdown', down);
    r.domElement.addEventListener('pointermove', move);
    r.domElement.addEventListener('pointerup', up);
    r.domElement.addEventListener('pointercancel', up);
    const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', resize);
    let last = performance.now();
    function tick(now) {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!auto && !dragging && now - idleSince > 2500) auto = true;
      if (auto) angle += dt * 0.45;
      turn.rotation.y = angle;
      // spinning parts (the propeller cap)
      obj && obj.traverse(m => {
        if (m.userData && m.userData.spin) {
          m.userData.t = (m.userData.t || 0) + dt * m.userData.spin * Math.PI * 2;
          m.matrix.copy(m.userData.base).multiply(new T.Matrix4().makeRotationY(m.userData.t));
        }
      });
      r.render(s, cam);
      raf = requestAnimationFrame(tick);
    }
    const onReady = () => { if (alive && obj && obj.userData.missing) { const a = turn.rotation.y; setLook(current); turn.rotation.y = a; } };
    window.addEventListener('wb3d-ready', onReady);
    setLook(look);
    resize();
    raf = requestAnimationFrame(tick);
    return {
      update: setLook,
      destroy() { alive = false; window.removeEventListener('wb3d-ready', onReady); cancelAnimationFrame(raf); if (ro) ro.disconnect(); r.dispose(); r.domElement.remove(); },
    };
  }

  window.WB3D = { snapshot, viewer };
})();
