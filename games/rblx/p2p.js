// WebBlox peer-to-peer multiplayer over PeerJS (WebRTC). No server of our own needed.
//
// The game's client script (scripts/WebBloxPlayers.lua) asks
//   <site>/games/rblx/peer-sync/<sid>/sync?room=&id=&name=&s=&l=&c=&ack=
// exactly as it would ask tools/multiplayer-server. coi-serviceworker.js hands those requests
// to this page over a BroadcastChannel, and this page answers them as a tiny in-browser server.
//
// Players in a server connect in a star: whoever gets the server's PeerJS id first (the hub)
// relays everyone's avatar state, leaderstats and chat to the others. If the hub leaves, the
// others race to take over the id. PeerJS's free cloud service only introduces the browsers to
// each other; game data flows directly between them (or via PeerJS's TURN relay when needed).
//
// Each game has up to PUBLIC_SERVERS public servers. Anyone on the site can end up hosting one,
// including someone whose network won't accept connections, so a server you can't reach (or
// that's full) is skipped for a while and you join the next one. A hub left alone on a higher
// server moves down when a lower one is free or reachable again, so players gather together.
// Private rooms (invite links) are a single server.
(function () {
  'use strict';
  const STALE_MS = 5000, MAX_PLAYERS = 30, CHAT_KEEP = 50, SEND_MS = 120, HUB_SILENT_MS = 4000;
  const PUBLIC_SERVERS = 5, JOIN_TIMEOUT_MS = 9000, KEEPALIVE_MS = 2000, CONN_SILENT_MS = 12000;
  const STATE_RE = /^[-0-9.,a-z]{1,160}$/;
  const STATS_RE = /^[A-Za-z0-9 _.:,\-]{0,200}$/;      // leaderstats: "Cash:120,Logs:4"
  const statsOf = v => (typeof v === 'string' && STATS_RE.test(v) ? v : '');
  const OFFLINE_ERRORS = /^(network|server-error|socket-error|socket-closed|browser-incompatible|ssl-unavailable)$/;
  const clean = (s, n) => String(s || '').replace(/[^A-Za-z0-9 _.\-!?,'@#:()]/g, '').trim().slice(0, n);
  // Chat goes to strangers in public servers, so swear words get the Roblox treatment: ####
  const BAD_WORDS = /(f+u+c+k|sh[i1]t|b[i1]tch|cunt|d[i1]ck|puss(y|ie)|a+s+s+h+o+l+e|bastard|slut|wh[o0]re|n[i1]gg|f[a@]g|retard|\bc[o0]ck|porn|pen[i1]s|vag[i1]na|\brap(e|ed|es|ing|ist|ists)\b|nazi|d[i1]ldo|b[o0]{2}b|\bt[i1]ts\b|\bcum\b|\bsex\b|\bkys\b)/gi;
  const filterChat = text => text.replace(BAD_WORDS, w => '#'.repeat(w.length));
  const serverId = (room, k) => 'webblox-v1-' + room + (k > 1 ? '_s' + k : '');

  function start(opts) {
    const room = opts.room;                     // pub-<game> or priv-<code>-<game>
    const sid = opts.sid;                       // this page's id in /peer-sync/<sid>/ URLs
    const peerOptions = Object.assign({ debug: 0 }, opts.peer || {});
    const privateRoom = room.indexOf('priv-') === 0;
    const SERVERS = privateRoom ? 1 : PUBLIC_SERVERS;
    const prefer = Math.min(SERVERS, Math.max(1, opts.server | 0 || 1));
    const onStatus = opts.onStatus || function () {};
    // shown in the game's status label until we're connected (see the M| line below)
    const NOTES = { connecting: 'Multiplayer: finding players...', offline: 'Multiplayer: no connection, retrying...', full: 'Multiplayer: this server is full' };
    let conn = 'connecting';
    function setConn(c) { conn = c; onStatus(c); }

    const me = { id: '', name: 'Guest', state: '', stats: '' };
    // The room's shared clock (ms): the hub's Date.now() + offset. Games use it to run
    // timed rounds together (Natural Disaster Survival). Kept across hub handovers.
    let offset = 0;
    const roomNow = () => Date.now() + offset;
    let peer = null, toHub = null, isHub = false, stopped = false, retryTimer = 0;
    let server = 0;                             // which server we're in (1..SERVERS), 0 = none yet
    let attempt = 0;                            // bumped on every new search; older callbacks give up
    const avoid = new Map();                    // server -> skip it until (ms)
    let snapshot = { p: [], c: [], q: 0, h: '' };      // what a non-hub player last heard from the hub
    let rtt = null, lastPing = 0;               // round trip to the hub (ms)
    let heard = 0;                              // when that was
    let outChat = [];
    // hub state
    const players = new Map();                  // id -> { name, state, stats, t, conn }
    const conns = new Set();                    // every open connection to the hub
    const chat = [];
    let seq = 0, hubSince = 0;

    function addChat(id, name, text) {
      if (!text) return;
      chat.push({ seq: ++seq, id, name, text: filterChat(text) });
      if (chat.length > CHAT_KEEP) chat.shift();
    }
    function hubSnapshot() {
      const now = Date.now(), p = [];
      for (const [id, pl] of players) {
        if (now - pl.t > STALE_MS) { players.delete(id); continue; }
        if (pl.state) p.push([id, pl.name, pl.state, pl.stats || '']);
      }
      return { t: 'r', p, c: chat.slice(-20).map(m => [m.seq, m.id, m.name, m.text]), q: seq, h: me.id, T: roomNow() };
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
      if (q.has('l')) me.stats = statsOf(q.get('l'));
      const c = clean(q.get('c'), 120);
      if (isHub) {
        players.set(id, { name: me.name, state: me.state, stats: me.stats, t: Date.now(), conn: null });
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
      if (!privateRoom && server) out.push('N|' + server);
      if (isHub) out.push('L|0'); else if (toHub && rtt != null) out.push('L|' + rtt);
      for (const [pid, name, st, stats] of view.p) if (pid !== id) out.push(`P|${pid}|${name}|${st}|${statsOf(stats)}`);
      if (Number.isFinite(ack) && ack >= 0) {
        for (const [mseq, mid, name, text] of view.c) if (mseq > ack && mid !== id) out.push(`C|${mseq}|${mid}|${name}|${text}`);
      }
      out.push(`T|${Math.round(roomNow())}`);
      out.push(`S|${view.q}`);
      return out.join('\n') + '\n';
    }

    let lastSent = 0;
    function sendToHub() {
      if (!toHub || !toHub.open || !me.id) return;
      const now = Date.now();
      if (now - lastSent < 60 && !outChat.length) return;
      lastSent = now;
      try { toHub.send({ t: 'u', id: me.id, n: me.name, s: me.state, l: me.stats, c: outChat.splice(0, 3), q: snapshot.q }); } catch (e) {}
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

    // ---- PeerJS: find a server to join, or host one ---------------------------------------
    function drop(p) { try { if (p) p.destroy(); } catch (e) {} }
    function retry(ms, first) {
      if (stopped) return;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => findServer(first), ms == null ? 500 + Math.random() * 1500 : ms);
    }

    // Try servers in order: the one we were in (or were sent to), then the lowest numbers first.
    function findServer(first) {
      if (stopped) return;
      const my = ++attempt, now = Date.now(), order = [];
      const want = first || server || prefer;
      if (!(avoid.get(want) > now)) order.push(want);
      for (let k = 1; k <= SERVERS; k++) if (k !== want && !(avoid.get(k) > now)) order.push(k);
      if (!order.length) { avoid.clear(); return retry(3000 + Math.random() * 3000); }
      tryNext(my, order);
    }
    function tryNext(my, order) {
      if (stopped || my !== attempt) return;
      if (!order.length) return retry(3000 + Math.random() * 3000);
      tryServer(order[0], my, order.slice(1), 0);
    }

    // Host server k if nobody does yet, otherwise join it.
    function tryServer(k, my, rest, bounces) {
      const p = new Peer(serverId(room, k), peerOptions);
      let settled = false;
      p.on('open', () => {
        if (settled) return;
        settled = true;
        if (stopped || my !== attempt) return drop(p);
        becomeHub(p, k);
      });
      p.on('error', err => {
        if (!settled) {
          settled = true;
          drop(p);
          if (stopped || my !== attempt) return;
          if (err.type === 'unavailable-id') return joinServer(k, my, rest, bounces);
          setConn(OFFLINE_ERRORS.test(err.type) ? 'offline' : 'connecting');
          return retry(3000 + Math.random() * 3000);
        }
        if (p === peer && isHub && err.type === 'unavailable-id') {
          // We lost PeerJS for a moment and someone else took this server's id meanwhile:
          // step down (our players reconnect to the new hub) rather than run two hubs.
          isHub = false; peer = null; drop(p); setConn('connecting');
          findServer(k);
        }
      });
      p.on('disconnected', () => { if (p === peer && !stopped) { try { p.reconnect(); } catch (e) {} } });
    }

    function becomeHub(p, k) {
      peer = p; isHub = true; toHub = null; server = k; hubSince = Date.now(); conns.clear();
      // carry over what we knew, so other players don't blink out while they reconnect
      // (but not the old hub: it's the one that left)
      players.clear();
      if (Date.now() - heard < STALE_MS) for (const [id, name, st, stats] of snapshot.p) if (id !== snapshot.h) players.set(id, { name, state: st, stats: statsOf(stats), t: Date.now() - 2000, conn: null });
      seq = Math.max(seq, snapshot.q || 0);
      setConn('hub');
      p.on('connection', c => {
        if (conns.size >= MAX_PLAYERS + 10) { c.on('open', () => c.close()); return; }
        conns.add(c);
        c.wbSeen = Date.now();
        c.on('data', d => {
          c.wbSeen = Date.now();
          if (d && d.t === 'who') { try { c.send({ t: 'who', n: hubSnapshot().p.length }); } catch (e) {} return; }
          if (d && d.t === 'ping') { try { c.send({ t: 'pong', ts: d.ts }); } catch (e) {} return; }
          if (!d || d.t !== 'u' || !/^[a-z0-9]{6,16}$/.test(String(d.id))) return;
          if (!players.has(d.id) && players.size >= MAX_PLAYERS) { try { c.send({ t: 'full' }); } catch (e) {} setTimeout(() => c.close(), 200); return; }
          const name = clean(d.n, 20) || 'Guest';
          players.set(d.id, { name, state: STATE_RE.test(String(d.s)) ? String(d.s) : '', stats: statsOf(d.l), t: Date.now(), conn: c });
          // after a hub handover, keep chat numbers moving forward so nobody skips new messages
          const q = d.q | 0; if (q > seq && q < seq + 1e6) seq = q;
          for (const text of (Array.isArray(d.c) ? d.c : []).slice(0, 3)) addChat(d.id, name, clean(text, 120));
        });
        c.on('close', () => { conns.delete(c); for (const [id, pl] of players) if (pl.conn === c) players.delete(id); });
        c.on('error', () => {});
      });
    }

    // Join server k. A hub we can't reach in time (its network may refuse connections) or that's
    // full gets skipped for a while, and we try the next server.
    function joinServer(k, my, rest, bounces) {
      if (stopped || my !== attempt) return;
      const p = new Peer(peerOptions);
      let settled = false;
      const timer = setTimeout(() => giveUp(60000), JOIN_TIMEOUT_MS);
      function giveUp(avoidMs) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        drop(p);
        if (stopped || my !== attempt) return;
        if (SERVERS > 1) avoid.set(k, Date.now() + avoidMs);
        tryNext(my, rest);
      }
      p.on('open', () => {
        if (settled) return;
        const c = p.connect(serverId(room, k), { reliable: true });
        c.on('open', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (stopped || my !== attempt) return drop(p);
          adoptClient(p, c, k);
        });
        c.on('error', () => {});
      });
      p.on('error', err => {
        if (settled) {
          if (p === peer && toHub) lostHub();
          return;
        }
        if (err.type === 'peer-unavailable') {
          // the hub left just now: try to take its place (a couple of times at most)
          settled = true;
          clearTimeout(timer);
          drop(p);
          if (stopped || my !== attempt) return;
          if (bounces < 2) return setTimeout(() => { if (my === attempt) tryServer(k, my, rest, bounces + 1); }, 200 + Math.random() * 800);
          if (SERVERS > 1) avoid.set(k, Date.now() + 20000);
          return tryNext(my, rest);
        }
        if (OFFLINE_ERRORS.test(err.type)) {
          settled = true;
          clearTimeout(timer);
          drop(p);
          setConn('offline');
          return retry(3000 + Math.random() * 3000);
        }
        giveUp(30000);
      });
    }

    function adoptClient(p, c, k, first) {
      peer = p; isHub = false; toHub = c; server = k; heard = Date.now(); rtt = null;
      setConn('joined');
      c.on('data', d => onHubData(c, d));
      c.on('close', () => { if (toHub === c) lostHub(); });
      if (first) onHubData(c, first);
      sendToHub();
    }
    function onHubData(c, d) {
      if (toHub !== c || !d) return;
      if (d.t === 'pong') {
        const ms = performance.now() - d.ts;
        if (ms >= 0 && ms < 60000) rtt = Math.round(rtt == null ? ms : rtt * 0.6 + ms * 0.4);
        return;
      }
      if (d.t === 'r') {
        snapshot = { p: Array.isArray(d.p) ? d.p : [], c: Array.isArray(d.c) ? d.c : [], q: d.q | 0, h: String(d.h || '') };
        heard = Date.now();
        if (Number.isFinite(d.T)) offset = d.T - Date.now();
      } else if (d.t === 'full') {
        toHub = null;
        const old = peer;
        peer = null;
        drop(old);
        if (SERVERS === 1) { stopped = true; setConn('full'); return; }
        avoid.set(server, Date.now() + 30000);
        server = 0;
        setConn('connecting');
        findServer();
      }
    }
    // Our hub left (or went quiet): race the others to take over its server.
    function lostHub() {
      toHub = null;
      setConn('connecting');
      const old = peer;
      peer = null;
      drop(old);
      retry(null, server);
    }

    // A hub alone on a higher public server moves down once a lower one is free or reachable.
    let probing = false, lastProbe = 0;
    function consolidate() {
      const now = Date.now();
      if (probing || !isHub || server <= 1 || conns.size || now - hubSince < 20000 || now - lastProbe < 30000) return;
      const targets = [];
      for (let k = 1; k < server; k++) if (!(avoid.get(k) > now)) targets.push(k);
      if (!targets.length) return;
      probing = true;
      lastProbe = now;
      const my = attempt;
      const alone = () => !stopped && my === attempt && isHub && !conns.size;
      const p = new Peer(peerOptions);
      let i = 0, cur = null, curK = 0, timer = 0, finished = false;
      const end = keep => { if (finished) return; finished = true; clearTimeout(timer); probing = false; if (!keep) drop(p); };
      const next = () => {
        clearTimeout(timer);
        if (cur) { try { cur.close(); } catch (e) {} cur = null; }
        if (!alone() || i >= targets.length) return end();
        const k = curK = targets[i++];
        const c = cur = p.connect(serverId(room, k), { reliable: true });
        timer = setTimeout(() => { avoid.set(k, Date.now() + 60000); next(); }, JOIN_TIMEOUT_MS);
        c.on('data', d => {
          if (cur !== c || finished || !d) return;
          if (d.t === 'full') { avoid.set(k, Date.now() + 30000); return next(); }
          if (d.t !== 'r') return;
          if (!alone()) return end();
          end(true);
          // leave our empty server and stay on this connection
          const old = peer;
          ++attempt;
          isHub = false; conns.clear(); players.clear();
          drop(old);
          adoptClient(p, c, k, d);
        });
        c.on('error', () => {});
      };
      p.on('open', next);
      p.on('error', err => {
        if (finished) return;
        const k = curK;
        end();
        // nobody hosts that lower server: take it over ourselves
        if (err.type === 'peer-unavailable' && k && alone()) moveHub(k, my);
      });
    }
    function moveHub(k, my) {
      const p = new Peer(serverId(room, k), peerOptions);
      p.on('open', () => {
        if (stopped || my !== attempt || !isHub || conns.size) return drop(p);
        const old = peer;
        ++attempt;
        drop(old);
        becomeHub(p, k);
        p.on('error', err => {
          if (p === peer && isHub && err.type === 'unavailable-id') { isHub = false; peer = null; drop(p); setConn('connecting'); findServer(k); }
        });
        p.on('disconnected', () => { if (p === peer && !stopped) { try { p.reconnect(); } catch (e) {} } });
      });
      p.on('error', () => { if (p !== peer) drop(p); });
    }

    // The hub sends everyone the room a few times a second. That doubles as a heartbeat: a hub that
    // vanished without saying goodbye (closed laptop, lost Wi-Fi) goes quiet, and the others replace it.
    setInterval(() => {
      const now = Date.now();
      if (isHub && peer) {
        const snap = hubSnapshot();
        for (const c of conns) {
          // a player whose browser vanished without closing the connection: let them go
          if (now - c.wbSeen > CONN_SILENT_MS) {
            conns.delete(c);
            for (const [id, pl] of players) if (pl.conn === c) players.delete(id);
            try { c.close(); } catch (e) {}
          } else if (c.open) { try { c.send(snap); } catch (e) {} }
        }
        if (SERVERS > 1) consolidate();
      } else if (toHub && now - heard > HUB_SILENT_MS) {
        lostHub();
      } else if (toHub && toHub.open && now - lastPing > 2000) {
        lastPing = now;
        try { toHub.send({ t: 'ping', ts: performance.now() }); } catch (e) {}
      } else if (toHub && toHub.open && now - lastSent > KEEPALIVE_MS) {
        // still here (our game may not be sending yet, e.g. while it loads)
        lastSent = now;
        try { toHub.send({ t: 'k' }); } catch (e) {}
      }
    }, SEND_MS);

    window.addEventListener('pagehide', () => { stopped = true; drop(peer); });
    findServer();
    return { get isHub() { return isHub; }, get server() { return server; }, stop() { stopped = true; drop(peer); } };
  }

  // "host[:port][/path]" or a full http(s) URL -> PeerJS options. Empty means PeerJS's free cloud.
  function peerOptions(spec) {
    const m = String(spec || '').trim().match(/^(https?:\/\/)?([A-Za-z0-9.\-]+)(?::(\d+))?(\/[A-Za-z0-9._\-\/]*)?$/);
    if (!m) return {};
    const local = /^(localhost|127\.)/.test(m[2]);
    const secure = m[1] ? m[1] === 'https://' : !local;
    return { host: m[2], port: +(m[3] || (secure ? 443 : 80)), path: m[4] || '/', secure };
  }

  // Who's playing: asks each server's hub. Resolves to one entry per server (1..n): a player
  // count, 0 when nobody hosts it, or null when its hub couldn't be reached. Resolves to null
  // when PeerJS itself can't be reached.
  function countServers(room, peer, n) {
    n = n || (room.indexOf('priv-') === 0 ? 1 : PUBLIC_SERVERS);
    return new Promise(resolve => {
      const counts = new Array(n).fill(undefined);
      let p, done = false;
      const finish = ok => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        setTimeout(() => { try { p && p.destroy(); } catch (e) {} }, 50);
        resolve(ok ? counts.map(c => (c === undefined ? null : c)) : null);
      };
      const set = (k, v) => { if (counts[k] === undefined) counts[k] = v; if (counts.every(c => c !== undefined)) finish(true); };
      const timer = setTimeout(() => finish(counts.some(c => c !== undefined)), 10000);
      try { p = new Peer(Object.assign({ debug: 0 }, peer || {})); } catch (e) { return finish(false); }
      p.on('open', () => {
        for (let k = 0; k < n; k++) {
          const c = p.connect(serverId(room, k + 1), { reliable: true });
          c.on('open', () => { try { c.send({ t: 'who' }); } catch (e) {} });
          c.on('data', d => { if (d && d.t === 'who') { set(k, Math.max(0, d.n | 0)); try { c.close(); } catch (e) {} } });
          c.on('error', () => {});
        }
      });
      p.on('error', err => {
        if (err.type !== 'peer-unavailable') return finish(false);
        // "Could not connect to peer <id>": nobody hosts that server
        const id = (String(err.message || '').match(/(\S+)$/) || [])[1];
        for (let k = 0; k < n; k++) if (id === serverId(room, k + 1)) set(k, 0);
      });
    });
  }

  window.WebBloxP2P = { start, peerOptions, countServers };
})();
