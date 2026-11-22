/* GN-BLOX: phone and tablet controls.
 *
 * The 2016 engine only listens for a keyboard and a mouse (keys on window, the mouse on the
 * canvas), so on a touch screen this draws 2016-style mobile controls over the game and turns
 * touches into the keys and mouse moves the engine knows:
 *   - the thumbstick (touch anywhere in the lower left) -> W A S D
 *   - the jump button -> Space
 *   - drag anywhere else -> turn the camera (a right-button mouse drag)
 *   - tap -> a click there (GUI buttons, tools, click detectors); press and hold, then drag -> drag with
 *     the left button (sliders, scrolling lists)
 *   - pinch -> zoom (the mouse wheel)
 *   - Chat -> opens the phone's keyboard and types into the game's chat
 *
 * play.html calls GNTouch.start(canvas) once the game is running, on touch devices (or ?touch=1).
 */
(function () {
  'use strict';
  const KEYS = {
    w: { key: 'w', code: 'KeyW', keyCode: 87 }, a: { key: 'a', code: 'KeyA', keyCode: 65 },
    s: { key: 's', code: 'KeyS', keyCode: 83 }, d: { key: 'd', code: 'KeyD', keyCode: 68 },
    space: { key: ' ', code: 'Space', keyCode: 32 }, slash: { key: '/', code: 'Slash', keyCode: 191 },
    enter: { key: 'Enter', code: 'Enter', keyCode: 13 }, backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
    escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  };
  const STICK_R = 52;             // thumbstick radius (CSS px)
  const TAP_MS = 280, TAP_MOVE = 12, HOLD_MS = 450, TURN = 1.25;

  // our own text box (for the phone keyboard) mustn't also reach the engine as key presses: this
  // runs before the engine adds its own listeners, so it gets to stop them first
  let textBox = null;
  for (const type of ['keydown', 'keyup', 'keypress']) addEventListener(type, e => { if (textBox && e.target === textBox && !e.wbOurs) e.stopImmediatePropagation(); }, true);
  // ...and the engine takes the canvas losing focus to it for the whole window losing focus (and
  // stops listening to the keyboard), so it doesn't hear about those either
  for (const type of ['blur', 'focus', 'focusin', 'focusout']) addEventListener(type, e => { if (textBox && (e.target === textBox || e.relatedTarget === textBox)) e.stopImmediatePropagation(); }, true);

  function sendKey(type, k) {
    const e = new KeyboardEvent(type, { key: k.key, code: k.code, bubbles: true, cancelable: true });
    for (const p of ['keyCode', 'which']) try { Object.defineProperty(e, p, { get: () => k.keyCode }); } catch (err) {}
    e.wbOurs = true;
    window.dispatchEvent(e);
  }
  const tapKey = k => { sendKey('keydown', k); setTimeout(() => sendKey('keyup', k), 40); };
  function charKey(c) {
    const lower = c.toLowerCase();
    const code = /[a-z]/.test(lower) ? 'Key' + lower.toUpperCase() : /[0-9]/.test(c) ? 'Digit' + c : c === ' ' ? 'Space' : '';
    const keyCode = /[a-z]/.test(lower) ? lower.toUpperCase().charCodeAt(0) : /[0-9]/.test(c) ? c.charCodeAt(0) : c === ' ' ? 32 : 0;
    return { key: c, code, keyCode };
  }

  function start(canvas) {
    if (start.done) return;
    start.done = true;
    const mouseAt = { x: innerWidth / 2, y: innerHeight / 2 };
    function sendMouse(type, x, y, button, buttons, dx, dy) {
      const e = new MouseEvent(type, { clientX: x, clientY: y, screenX: x, screenY: y, button, buttons, bubbles: true, cancelable: true, view: window, movementX: dx || 0, movementY: dy || 0 });
      for (const [p, v] of [['movementX', dx || 0], ['movementY', dy || 0]]) if (e[p] !== v) try { Object.defineProperty(e, p, { get: () => v }); } catch (err) {}
      mouseAt.x = x; mouseAt.y = y;
      canvas.dispatchEvent(e);
    }
    const wheel = dy => canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, deltaMode: 0, clientX: mouseAt.x, clientY: mouseAt.y, bubbles: true, cancelable: true }));

    // ---- the controls
    const css = document.createElement('style');
    css.textContent = `
      #gn-touch { position: fixed; inset: 0; z-index: 15; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
      #gn-touch .stick { position: absolute; width: ${STICK_R * 2}px; height: ${STICK_R * 2}px; margin: -${STICK_R}px 0 0 -${STICK_R}px; border-radius: 50%;
        background: rgba(0,0,0,.25); border: 3px solid rgba(255,255,255,.55); pointer-events: none; transition: opacity .15s; }
      #gn-touch .stick i { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
        background: rgba(255,255,255,.75); box-shadow: 0 1px 4px rgba(0,0,0,.4); }
      #gn-touch .stick.idle { opacity: .45; }
      #gn-touch .btn { position: absolute; border-radius: 50%; background: rgba(0,0,0,.3); border: 3px solid rgba(255,255,255,.6); color: #fff;
        display: flex; align-items: center; justify-content: center; font: 600 13px "Source Sans Pro", Arial, sans-serif; text-shadow: 0 1px 2px #000; }
      #gn-touch .btn.down { background: rgba(255,255,255,.35); }
      #gn-touch .jump { width: 78px; height: 78px; right: max(22px, env(safe-area-inset-right)); bottom: max(28px, env(safe-area-inset-bottom)); }
      #gn-touch .jump svg { width: 38px; height: 38px; fill: #fff; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
      #gn-touch .chat { width: 46px; height: 46px; right: max(14px, env(safe-area-inset-right)); top: 46px; }
      #gn-touch .chat svg { width: 22px; height: 22px; fill: #fff; }
      #gn-touch-text { position: fixed; left: -1000px; top: 50%; width: 10px; height: 10px; opacity: 0; font-size: 16px; }
    `;
    document.head.appendChild(css);
    const layer = document.createElement('div');
    layer.id = 'gn-touch';
    layer.innerHTML = `
      <div class="stick idle"><i></i></div>
      <div class="btn jump" aria-label="Jump"><svg viewBox="0 0 24 24"><path d="M12 4 4 13h5v7h6v-7h5z"/></svg></div>
      <div class="btn chat" aria-label="Chat"><svg viewBox="0 0 24 24"><path d="M4 4h16v12H8l-4 4z"/></svg></div>`;
    document.body.appendChild(layer);
    const form = document.createElement('form');
    form.innerHTML = '<input id="gn-touch-text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" />';
    document.body.appendChild(form);
    textBox = form.firstChild;
    const stick = layer.querySelector('.stick'), knob = stick.firstChild, jumpBtn = layer.querySelector('.jump'), chatBtn = layer.querySelector('.chat');
    const placeStick = (x, y) => { stick.style.left = x + 'px'; stick.style.top = y + 'px'; };
    const restStick = () => { stick.classList.add('idle'); knob.style.transform = ''; placeStick(Math.max(90, innerWidth * 0.12), innerHeight - Math.max(110, innerHeight * 0.2)); };
    restStick();
    addEventListener('resize', () => { if (!touches.size) restStick(); });

    // ---- walking: the thumbstick presses W A S D
    const held = new Set();
    function setMove(dx, dy) {
      const len = Math.hypot(dx, dy), want = new Set();
      if (len > STICK_R * 0.28) {
        const x = dx / len, y = dy / len;
        if (y < -0.38) want.add('w');
        if (y > 0.38) want.add('s');
        if (x < -0.38) want.add('a');
        if (x > 0.38) want.add('d');
      }
      for (const k of held) if (!want.has(k)) { held.delete(k); sendKey('keyup', KEYS[k]); }
      for (const k of want) if (!held.has(k)) { held.add(k); sendKey('keydown', KEYS[k]); }
    }

    // ---- touches
    const touches = new Map();   // identifier -> { role, x0, y0, x, y, t0, ... }
    let stickId = null, rightDown = false, leftDown = false, pinch = null;
    const inStickZone = (x, y) => x < innerWidth * 0.42 && y > innerHeight * 0.35;
    const cameraTouches = () => [...touches.values()].filter(t => t.role === 'camera' || t.role === 'pending' || t.role === 'drag');
    function endRight() { if (rightDown) { rightDown = false; sendMouse('mouseup', mouseAt.x, mouseAt.y, 2, 0); } }
    function endLeft() { if (leftDown) { leftDown = false; sendMouse('mouseup', mouseAt.x, mouseAt.y, 0, 0); } }

    layer.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const x = t.clientX, y = t.clientY, now = performance.now();
        const el = document.elementFromPoint(x, y);
        if (el && el.closest('.jump')) { touches.set(t.identifier, { role: 'jump' }); jumpBtn.classList.add('down'); sendKey('keydown', KEYS.space); continue; }
        if (el && el.closest('.chat')) { touches.set(t.identifier, { role: 'chat' }); chatBtn.classList.add('down'); continue; }
        if (stickId == null && inStickZone(x, y)) {
          stickId = t.identifier;
          touches.set(t.identifier, { role: 'stick', x0: x, y0: y });
          stick.classList.remove('idle');
          placeStick(x, y);
          continue;
        }
        const info = { role: 'pending', x0: x, y0: y, x, y, t0: now };
        touches.set(t.identifier, info);
        const cams = cameraTouches();
        if (cams.length === 2) {   // a second finger: pinch to zoom
          endRight(); endLeft();
          for (const c of cams) c.role = 'pinch';
          pinch = { d: Math.hypot(cams[0].x - cams[1].x, cams[0].y - cams[1].y) };
        } else {
          // press and hold without moving: a left-button drag (GUI sliders and lists)
          info.hold = setTimeout(() => {
            if (info.role !== 'pending') return;
            info.role = 'drag';
            sendMouse('mousemove', info.x, info.y, 0, 0);
            sendMouse('mousedown', info.x, info.y, 0, 1);
            leftDown = true;
          }, HOLD_MS);
        }
      }
    }, { passive: false });

    layer.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const info = touches.get(t.identifier);
        if (!info) continue;
        const x = t.clientX, y = t.clientY;
        if (info.role === 'stick') {
          let dx = x - info.x0, dy = y - info.y0;
          const len = Math.hypot(dx, dy);
          if (len > STICK_R) {   // the stick follows a thumb that goes past its edge
            info.x0 += (dx / len) * (len - STICK_R); info.y0 += (dy / len) * (len - STICK_R);
            placeStick(info.x0, info.y0);
            dx = x - info.x0; dy = y - info.y0;
          }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          setMove(dx, dy);
          continue;
        }
        const px = info.x, py = info.y;
        info.x = x; info.y = y;
        if (info.role === 'pending' && Math.hypot(x - info.x0, y - info.y0) > TAP_MOVE) {
          clearTimeout(info.hold);
          info.role = 'camera';
          endRight();
          sendMouse('mousemove', info.x0, info.y0, 0, 0);
          sendMouse('mousedown', info.x0, info.y0, 2, 2);
          rightDown = true;
          sendMouse('mousemove', x, y, 2, 2, (x - info.x0) * TURN, (y - info.y0) * TURN);
        } else if (info.role === 'camera') {
          sendMouse('mousemove', x, y, 2, 2, (x - px) * TURN, (y - py) * TURN);
        } else if (info.role === 'drag') {
          sendMouse('mousemove', x, y, 0, 1, x - px, y - py);
        } else if (info.role === 'pinch' && pinch) {
          const ps = [...touches.values()].filter(c => c.role === 'pinch');
          if (ps.length === 2) {
            const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
            if (Math.abs(d - pinch.d) > 14) { wheel(d > pinch.d ? -100 : 100); pinch.d = d; }
          }
        }
      }
    }, { passive: false });

    function touchEnd(e) {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const info = touches.get(t.identifier);
        touches.delete(t.identifier);
        if (!info) continue;
        if (info.role === 'jump') { jumpBtn.classList.remove('down'); sendKey('keyup', KEYS.space); }
        else if (info.role === 'chat') { chatBtn.classList.remove('down'); if (e.type === 'touchend') openChat(); }
        else if (info.role === 'stick') { stickId = null; setMove(0, 0); restStick(); }
        else if (info.role === 'pending') {
          clearTimeout(info.hold);
          if (e.type === 'touchend' && performance.now() - info.t0 < TAP_MS + HOLD_MS) {
            // a tap: click there
            const x = info.x0, y = info.y0;
            sendMouse('mousemove', x, y, 0, 0);
            sendMouse('mousedown', x, y, 0, 1);
            setTimeout(() => sendMouse('mouseup', x, y, 0, 0), 60);
          }
        } else if (info.role === 'camera') endRight();
        else if (info.role === 'drag') endLeft();
        else if (info.role === 'pinch') { pinch = null; for (const c of touches.values()) if (c.role === 'pinch') c.role = 'pinch-done'; }
      }
      if (!touches.size) { endRight(); endLeft(); }
    }
    layer.addEventListener('touchend', touchEnd, { passive: false });
    layer.addEventListener('touchcancel', touchEnd, { passive: false });
    // (no scrolling, zooming the page or pull-to-refresh while playing)
    document.addEventListener('touchmove', e => { if (e.target !== textBox) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', e => e.preventDefault());
    addEventListener('blur', () => { setMove(0, 0); endRight(); endLeft(); });

    // ---- chat with the phone's keyboard: the text box keeps one space in it, so a backspace on an
    // "empty" box still shows up; everything typed goes to the engine as key presses
    const SENTINEL = ' ';
    let chatting = false;
    function openChat() {
      chatting = true;
      tapKey(KEYS.slash);                 // the engine's chat bar takes the keyboard
      textBox.value = SENTINEL;
      textBox.focus();
      try { textBox.setSelectionRange(1, 1); } catch (e) {}
    }
    function closeChat(send) {
      if (!chatting) return;
      chatting = false;
      tapKey(send ? KEYS.enter : KEYS.escape);
      textBox.blur();
    }
    textBox.addEventListener('input', () => {
      if (!chatting) return;
      const v = textBox.value;
      if (v.length < SENTINEL.length) tapKey(KEYS.backspace);
      else for (const c of v.slice(SENTINEL.length)) { const k = charKey(c); sendKey('keydown', k); sendKey('keyup', k); }
      textBox.value = SENTINEL;
    });
    textBox.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); closeChat(true); }
      else if (e.key === 'Backspace' && textBox.value === SENTINEL) { e.preventDefault(); tapKey(KEYS.backspace); }
    });
    form.addEventListener('submit', e => { e.preventDefault(); closeChat(true); });
    textBox.addEventListener('blur', () => { if (chatting) { chatting = false; } });
    return { layer };
  }

  const isTouch = () => (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && matchMedia('(pointer: coarse)').matches;
  window.GNTouch = { start, isTouch };
})();
