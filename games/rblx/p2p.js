// WebBlox peer-to-peer multiplayer over PeerJS (WebRTC). No server of our own needed.
//
// The game's client script (scripts/WebBloxPlayers.lua) asks
//   <site>/games/rblx/peer-sync/<sid>/sync?room=&id=&name=&s=&c=&ack=
// exactly as it would ask tools/multiplayer-server. coi-serviceworker.js hands those requests
// to this page over a BroadcastChannel, and this page answers them as a tiny in-browser server.
//
// Players in a room connect in a star: whoever gets the room's PeerJS id first relays
// everyone's avatar state and chat to the others. If that player leaves, the others race to
// take over the id. PeerJS's free cloud service only introduces the browsers to each other;
// game data flows directly between them (or via PeerJS's TURN relay when a network needs it).
(function () {
  'use strict';
  const STALE_MS = 5000, MAX_PLAYERS = 30, CHAT_KEEP = 50, SEND_MS = 120, HUB_SILENT_MS = 4000;
  const STATE_RE = /^[-0-9.,a-z]{1,160}$/;
  const OFFLINE_ERRORS = /^(network|server-error|socket-error|socket-closed|browser-incompatible|ssl-unavailable)$/;
  const clean = (s, n) => String(s || '').replace(/[^A-Za-z0-9 _.\-!?,'@#:()]/g, '').trim().slice(0, n);

  function start(opts) {
    const room = opts.room;                     // pub-<game> or priv-<code>-<game>
    const sid = opts.sid;                       // this page's id in /peer-sync/<sid>/ URLs
    const peerOptions = Object.assign({ debug: 0 }, opts.peer || {});
    const hubId = 'webblox-v1-' + room;
    const privateRoom = room.indexOf('priv-') === 0;
    const onStatus = opts.onStatus || function () {};
    // shown in the game's status label until we're connected (see the M| line below)
    const NOTES = { connecting: 'Multiplayer: finding players...', offline: 'Multiplayer: no connection, retrying...', full: 'Multiplayer: this server is full' };
    let conn = 'connecting';
    function setConn(c) { conn = c; onStatus(c); }

    const me = { id: '', name: 'Guest', state: '' };
    let peer = null, toHub = null, isHub = false, stopped = false, retryTimer = 0;
    let snapshot = { p: [], c: [], q: 0, h: '' };      // what a non-hub player last heard from the hub
    let heard = 0;                              // when that was
    let outChat = [];
    // hub state
    const players = new Map();                  // id -> { name, state, t, conn }
    const conns = new Set();                    // every open connection to the hub
    const chat = [];
    let seq = 0;

    function addChat(id, name, text) {
      if (!privateRoom || !text) return;
      chat.push({ seq: ++seq, id, name, text });
      if (chat.length > CHAT_KEEP) chat.shift();
    }
    function hubSnapshot() {
      const now = Date.now(), p = [];
      for (const [id, pl] of players) {
        if (now - pl.t > STALE_MS) { players.delete(id); continue; }
        if (pl.state) p.push([id, pl.name, pl.state]);
      }
      return { t: 'r', p, c: chat.slice(-20).map(m => [m.seq, m.id, m.name, m.text]), q: seq, h: me.id };
    }

    // ---- answering the game's /sync requests --------------------------------------------
    function handleSync(url) {
      const q = new URL(url).searchParams;
      const id = String(q.get('id') || '');
      if (!/^[a-z0-9]{6,16}$/.test(id)) return 'E|bad request\n';
      me.id = id;
      me.name = clean(q.get('name'), 20) || me.name;
      const s = String(q.get('s') || '');
      if (STATE_RE.test(s)) me.state = s;
      const c = clean(q.get('c'), 120);
      if (isHub) {
        players.set(id, { name: me.name, state: me.state, t: Date.now(), conn: null });
        if (c) addChat(id, me.name, c);
      } else {
        if (c) outChat.push(c);
        sendToHub();
      }
      let view = isHub ? hubSnapshot() : snapshot;
      if (!isHub && !toHub) {
        // between hubs: keep showing everyone for a moment, except the hub that left
        const fresh = Date.now() - heard < STALE_MS;
        view = { p: fresh ? snapshot.p.filter(pl => pl[0] !== snapshot.h) : [], c: snapshot.c, q: snapshot.q };
      }
      const ack = parseInt(q.get('ack'), 10);
      const out = [];
      if (NOTES[conn]) out.push('M|' + NOTES[conn]);
      for (const [pid, name, st] of view.p) if (pid !== id) out.push(`P|${pid}|${name}|${st}`);
      if (Number.isFinite(ack) && ack >= 0) {
        for (const [mseq, mid, name, text] of view.c) if (mseq > ack && mid !== id) out.push(`C|${mseq}|${mid}|${name}|${text}`);
      }
      out.push(`S|${view.q}`);
      return out.join('\n') + '\n';
    }

    let lastSent = 0;
    function sendToHub() {
      if (!toHub || !toHub.open || !me.id) return;
      const now = Date.now();
      if (now - lastSent < 60 && !outChat.length) return;
      lastSent = now;
      try { toHub.send({ t: 'u', id: me.id, n: me.name, s: me.state, c: outChat.splice(0, 3), q: snapshot.q }); } catch (e) {}
    }

    const bc = new BroadcastChannel('webblox-mp');
    bc.onmessage = e => {
      const d = e.data || {};
      if (!d.id || typeof d.url !== 'string') return;
      const m = d.url.match(/\/peer-sync\/([a-z0-9]+)\//);
      if (!m || m[1] !== sid) return;
      let reply;
      try { reply = handleSync(d.url); } catch (err) { reply = 'E|' + err.message + '\n'; }
      bc.postMessage({ id: d.id, reply });
    };

    // ---- PeerJS: become the room's hub, or join whoever is ---------------------------------
    function retry(ms) {
      if (stopped) return;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(becomeHubOrJoin, ms == null ? 500 + Math.random() * 1500 : ms);
    }
    function drop(p) { try { if (p) p.destroy(); } catch (e) {} }

    function becomeHubOrJoin() {
      if (stopped) return;
      const p = new Peer(hubId, peerOptions);
      p.on('open', () => {
        peer = p; isHub = true; toHub = null; conns.clear();
        // carry over what we knew, so other players don't blink out while they reconnect
        players.clear();
        // (but not the old hub: it's the one that left)
        if (Date.now() - heard < STALE_MS) for (const [id, name, st] of snapshot.p) if (id !== snapshot.h) players.set(id, { name, state: st, t: Date.now() - 2000, conn: null });
        seq = Math.max(seq, snapshot.q || 0);
        setConn('hub');
      });
      p.on('connection', c => {
        if (conns.size >= MAX_PLAYERS + 10) { c.on('open', () => c.close()); return; }
        conns.add(c);
        c.on('data', d => {
          if (d && d.t === 'who') { try { c.send({ t: 'who', n: hubSnapshot().p.length }); } catch (e) {} return; }
          if (!d || d.t !== 'u' || !/^[a-z0-9]{6,16}$/.test(String(d.id))) return;
          if (!players.has(d.id) && players.size >= MAX_PLAYERS) { try { c.send({ t: 'full' }); } catch (e) {} c.close(); return; }
          const name = clean(d.n, 20) || 'Guest';
          players.set(d.id, { name, state: STATE_RE.test(String(d.s)) ? String(d.s) : '', t: Date.now(), conn: c });
          // after a hub handover, keep chat numbers moving forward so nobody skips new messages
          const q = d.q | 0; if (q > seq && q < seq + 1e6) seq = q;
          for (const text of (Array.isArray(d.c) ? d.c : []).slice(0, 3)) addChat(d.id, name, clean(text, 120));
        });
        c.on('close', () => { conns.delete(c); for (const [id, pl] of players) if (pl.conn === c) players.delete(id); });
        c.on('error', () => {});
      });
      p.on('error', err => {
        if (p === peer && isHub) {
          // We lost the PeerJS server for a moment and someone else took the room's id meanwhile:
          // step down (our players reconnect to the new hub) rather than run two hubs.
          if (err.type === 'unavailable-id') { isHub = false; peer = null; setConn('connecting'); drop(p); joinHub(); }
          return;
        }
        drop(p);
        if (isHub || toHub) return;             // a leftover peer; we're connected through another one
        if (err.type === 'unavailable-id') joinHub();
        else { setConn(OFFLINE_ERRORS.test(err.type) ? 'offline' : 'connecting'); retry(3000 + Math.random() * 3000); }
      });
      p.on('disconnected', () => { if (p === peer && !stopped) { try { p.reconnect(); } catch (e) {} } });
    }

    function joinHub() {
      if (stopped) return;
      const p = new Peer(peerOptions);
      p.on('open', () => {
        const c = p.connect(hubId, { reliable: true });
        const timer = setTimeout(() => { if (!c.open) { drop(p); retry(); } }, 12000);
        c.on('open', () => {
          clearTimeout(timer);
          peer = p; isHub = false; toHub = c; heard = Date.now();
          setConn('joined');
          sendToHub();
        });
        c.on('data', d => {
          if (d && d.t === 'r') { snapshot = { p: Array.isArray(d.p) ? d.p : [], c: Array.isArray(d.c) ? d.c : [], q: d.q | 0, h: String(d.h || '') }; heard = Date.now(); }
          else if (d && d.t === 'full') { stopped = true; setConn('full'); drop(p); }
        });
        c.on('close', () => { if (toHub === c) { toHub = null; setConn('connecting'); drop(p); retry(); } });
        c.on('error', () => {});
      });
      p.on('error', err => {
        const current = p === peer;
        drop(p);
        if (!current && (isHub || toHub)) return;   // a leftover peer; we're connected through another one
        if (current) { toHub = null; setConn('connecting'); }
        if (err.type !== 'peer-unavailable' && OFFLINE_ERRORS.test(err.type)) setConn('offline');
        retry(err.type === 'peer-unavailable' ? 200 + Math.random() * 800 : 3000 + Math.random() * 3000);
      });
    }

    // The hub sends everyone the room a few times a second. That doubles as a heartbeat: a hub that
    // vanished without saying goodbye (closed laptop, lost Wi-Fi) goes quiet, and the others replace it.
    setInterval(() => {
      if (isHub && peer) {
        const snap = hubSnapshot();
        for (const c of conns) if (c.open) { try { c.send(snap); } catch (e) {} }
      } else if (toHub && Date.now() - heard > HUB_SILENT_MS) {
        toHub = null;
        setConn('connecting');
        drop(peer);
        retry();
      }
    }, SEND_MS);

    window.addEventListener('pagehide', () => { stopped = true; drop(peer); });
    becomeHubOrJoin();
    return { get isHub() { return isHub; }, stop() { stopped = true; drop(peer); } };
  }

  // "host[:port][/path]" or a full http(s) URL -> PeerJS options. Empty means PeerJS's free cloud.
  function peerOptions(spec) {
    const m = String(spec || '').trim().match(/^(https?:\/\/)?([A-Za-z0-9.\-]+)(?::(\d+))?(\/[A-Za-z0-9._\-\/]*)?$/);
    if (!m) return {};
    const local = /^(localhost|127\.)/.test(m[2]);
    const secure = m[1] ? m[1] === 'https://' : !local;
    return { host: m[2], port: +(m[3] || (secure ? 443 : 80)), path: m[4] || '/', secure };
  }

  // How many people are in a room right now: asks the room's hub. Resolves to a number,
  // 0 when nobody is hosting the room, or null when PeerJS can't be reached.
  function countPlayers(room, peer) {
    return new Promise(resolve => {
      let p, done = false;
      const finish = n => { if (done) return; done = true; clearTimeout(timer); setTimeout(() => { try { p && p.destroy(); } catch (e) {} }, 50); resolve(n); };
      const timer = setTimeout(() => finish(null), 10000);
      try { p = new Peer(Object.assign({ debug: 0 }, peer || {})); } catch (e) { return finish(null); }
      p.on('open', () => {
        const c = p.connect('webblox-v1-' + room, { reliable: true });
        c.on('open', () => { try { c.send({ t: 'who' }); } catch (e) { finish(null); } });
        c.on('data', d => { if (d && d.t === 'who') finish(Math.max(0, d.n | 0)); });
      });
      p.on('error', err => finish(err.type === 'peer-unavailable' ? 0 : null));
    });
  }

  window.WebBloxP2P = { start, peerOptions, countPlayers };
})();
