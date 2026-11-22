// GN-BLOX peer-to-peer multiplayer over PeerJS (WebRTC). No server of our own needed.
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
//
// The place's own scripts can talk to each other's games too (ReplicatedStorage.WebBlox.Send /
// Message, and SetShared / Shared for values the whole server shares): the hub keeps the last
// messages and every shared value, so players who join later get the values.
//
// The site's owner and moderators (config.js, by account ID) can use admin commands in chat
// (:kick, :ban, :m ... :cmds lists them). A command is signed with the account's key and passed
// to everyone through the hub; each player's game checks the signature against config.js before
// doing anything, so nobody else can send one. Players also prove their account ID with a
// signature, which gives owners and moderators an [Owner] / [Mod] tag in chat and the player list.
(function () {
  'use strict';
  const STALE_MS = 5000, MAX_PLAYERS = 30, CHAT_KEEP = 50, SEND_MS = 120, HUB_SILENT_MS = 4000;
  const PUBLIC_SERVERS = 5, JOIN_TIMEOUT_MS = 9000, KEEPALIVE_MS = 2000, CONN_SILENT_MS = 12000;
  const STATE_RE = /^[-0-9.,a-z]{1,240}$/;
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

    const me = { id: '', name: 'Guest', state: '', stats: '', k: '', pr: '' };
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

    // game messages and shared values (WebBlox.Send / SetShared in the place's scripts)
    const G_KEEP = 100, KV_MAX = 256, G_PER_SEC = 30;
    const TOPIC_RE = /^[A-Za-z0-9_.\-]{1,32}$/;
    let gmsgs = [], gseq = 0;                    // hub: the last messages ({ seq, id, name, topic, data })
    const kv = new Map();                        // key -> { v, ver }: everyone keeps a copy
    let kver = 0;
    const outGame = [], outKV = [];              // ours, waiting to go to the hub
    const gRate = new Map();                     // hub: id -> { t, n }
    const gameData = d => String(d == null ? '' : d).replace(/[\r\n]/g, ' ').slice(0, 400);
    const kvValue = v => String(v == null ? '' : v).replace(/[\r\n]/g, ' ').slice(0, 200);
    function splitPair(text) {                   // "topic|data" -> [topic, data]
      const t = String(text || ''), i = t.indexOf('|');
      const k = i < 0 ? t : t.slice(0, i);
      return TOPIC_RE.test(k) ? [k, i < 0 ? '' : t.slice(i + 1)] : null;
    }
    function addGame(id, name, topic, data) {
      const now = Date.now(), r = gRate.get(id) || { t: now, n: 0 };
      if (now - r.t > 1000) { r.t = now; r.n = 0; }
      if (++r.n > G_PER_SEC) return;
      gRate.set(id, r);
      gmsgs.push({ seq: ++gseq, id, name, topic, data: gameData(data) });
      if (gmsgs.length > G_KEEP) gmsgs.shift();
    }
    function setKV(key, v) {
      if (!TOPIC_RE.test(key) || (!kv.has(key) && kv.size >= KV_MAX)) return;
      kv.set(key, { v: kvValue(v), ver: ++kver });
    }
    function mergeKV(list, vv) {                 // from the hub: [[key, value, version], ...]
      for (const e of Array.isArray(list) ? list : []) {
        if (!Array.isArray(e) || !TOPIC_RE.test(String(e[0])) || !Number.isFinite(e[2])) continue;
        const cur = kv.get(e[0]);
        if (!cur || cur.ver < e[2]) kv.set(e[0], { v: kvValue(e[1]), ver: e[2] });
      }
      if (Number.isFinite(vv) && vv > kver) kver = vv;
    }
    const kvSince = ver => [...kv].filter(([, e]) => e.ver > ver).sort((a, b) => a[1].ver - b[1].ver);

    function addChat(id, name, text) {
      if (!text) return;
      chat.push({ seq: ++seq, id, name, text: filterChat(text) });
      if (chat.length > CHAT_KEEP) chat.shift();
    }
    function hubSnapshot() {
      const now = Date.now(), p = [];
      for (const [id, pl] of players) {
        if (now - pl.t > STALE_MS) { players.delete(id); continue; }
        if (pl.state) p.push([id, pl.name, pl.state, pl.stats || '', pl.k || '', pl.pr || '']);
      }
      trimActs();
      return { t: 'r', p, c: chat.slice(-20).map(m => [m.seq, m.id, m.name, m.text]), q: seq, h: me.id, T: roomNow(), a: acts,
        g: gmsgs.slice(-40).map(m => [m.seq, m.id, m.name, m.topic, m.data]), gq: gseq, vv: kver };
    }

    // ---- owners and moderators ---------------------------------------------------------------
    const ident = opts.identity || null;          // { pub, sign(text) -> Promise<signature> }
    const verify = opts.verify || (async () => false);
    const roleOf = opts.roleOf || (() => null);
    const myRole = ident ? roleOf(ident.pub) : null;
    if (ident) me.k = ident.pub;
    const KEY_RE = /^[A-Za-z0-9_-]{43}$/, SIG_RE = /^[A-Za-z0-9_-]{86}$/;
    const safe = v => String(v == null ? '' : v).replace(/[|\r\n]/g, ' ').slice(0, 200);
    const luaQueue = [];                          // X| lines for this player's game
    const say = text => luaQueue.push('X|say|' + safe(text));
    let proofFor = '';
    function ensureProof() {                      // "this player id belongs to this account"
      if (!ident || !me.id || proofFor === me.id) return;
      proofFor = me.id;
      me.pr = '';
      ident.sign('gnblox-id:' + room + ':' + me.id).then(sig => { if (proofFor === me.id) me.pr = sig; }).catch(() => {});
    }
    const playerRoles = new Map();                // id -> { tag, role } once their proof checks out
    function checkPlayer(id, k, pr) {
      if (!KEY_RE.test(k || '') || !SIG_RE.test(pr || '')) return;
      const tag = k + pr, cur = playerRoles.get(id);
      if (cur && cur.tag === tag) return;
      const role = roleOf(k);
      // keep a verified tag while a new proof is checked (no flicker in the player list)
      playerRoles.set(id, { tag, role: cur && cur.k === k ? cur.role : null, k });
      if (!role) { playerRoles.get(id).role = null; return; }
      verify(k, 'gnblox-id:' + room + ':' + id, pr).then(ok => { const c = playerRoles.get(id); if (c && c.tag === tag) c.role = ok ? role : null; });
    }
    const roleTag = id => { const r = (playerRoles.get(id) || {}).role; return r === 'owner' ? '[Owner] ' : r === 'mod' ? '[Mod] ' : ''; };

    // bans: kept on the banned player's device (a day, this game) and by the server's host
    const BAN_KEY = 'gnblox-bans';
    const bans = () => { try { return JSON.parse(localStorage.getItem(BAN_KEY) || '{}') || {}; } catch (e) { return {}; } };
    const myBan = () => { const b = bans()[room]; return b && b.until > Date.now() ? b : null; };
    function quit(info) {
      stopped = true; clearTimeout(retryTimer);
      const p = peer; peer = null; toHub = null; isHub = false; drop(p);
      if (opts.onKick) opts.onKick(info);
    }

    // signed admin actions: { r: room, c: command, t: '*' or [player ids / account ids], x: [args],
    //   ts, n: nonce, k: signer's account ID, sn: signer's name, s: signature }
    // who: takes players (left out = you); num: a number; rest: text; all: everyone; owner: owner only
    const COMMANDS = {
      kick: { who: true, rest: true, help: ':kick <player> [reason]' },
      ban: { who: true, rest: true, help: ':ban <player> [reason] (out of this game for a day)' },
      kill: { who: true }, respawn: { who: true }, refresh: { who: true }, explode: { who: true },
      loopkill: { who: true }, unloopkill: { who: true },
      heal: { who: true }, damage: { who: true, num: 25 }, health: { who: true, num: 100 },
      god: { who: true }, ungod: { who: true }, ff: { who: true }, unff: { who: true },
      speed: { who: true, num: 16 }, jumppower: { who: true, num: 50 }, gravity: { who: true, num: 196 }, ungravity: { who: true },
      fly: { who: true }, unfly: { who: true }, noclip: { who: true }, clip: { who: true },
      sit: { who: true }, jump: { who: true }, trip: { who: true }, stun: { who: true }, unstun: { who: true },
      freeze: { who: true }, thaw: { who: true }, spin: { who: true }, unspin: { who: true },
      invisible: { who: true }, visible: { who: true },
      fire: { who: true }, unfire: { who: true }, smoke: { who: true }, unsmoke: { who: true },
      sparkles: { who: true }, unsparkles: { who: true }, light: { who: true }, unlight: { who: true },
      jail: { who: true }, unjail: { who: true }, btools: { who: true }, removetools: { who: true },
      tp: { who: true, dest: true, help: ':tp <player> <to player>' }, bring: { who: true }, to: { local: true, help: ':to <player>' },
      m: { all: true, help: ':m <message>' }, h: { all: true, help: ':h <hint>' }, countdown: { all: true, num: 10 },
      time: { all: true, num: 14 }, fog: { all: true, num: 100 }, unfog: { all: true },
      lock: { all: true }, unlock: { all: true }, shutdown: { all: true, owner: true },
    };
    for (const [k, c] of Object.entries(COMMANDS)) if (!c.help) c.help = ':' + k + (c.who ? ' <player>' : '') + (c.num ? ' <number>' : '');
    const HELP = 'Commands: ' + Object.keys(COMMANDS).map(k => ':' + k).join(' ') + ' (players: a name, me, all or others; left out = you)';
    const acts = [], seenActs = new Set(), hubBanned = new Set();
    const ACT_KEEP_MS = 120000;
    const actText = a => JSON.stringify(['gnblox-act', a.r, a.c, a.t, a.x, a.ts, a.n, a.k, a.sn]);
    const validAct = a => !!a && typeof a === 'object' && a.r === room && typeof a.c === 'string' && COMMANDS[a.c] && !COMMANDS[a.c].local
      && (a.t === '*' || (Array.isArray(a.t) && a.t.length <= 60 && a.t.every(x => typeof x === 'string' && x.length <= 64)))
      && Array.isArray(a.x) && a.x.length <= 3 && a.x.every(x => typeof x === 'string' && x.length <= 200)
      && Number.isFinite(a.ts) && typeof a.n === 'string' && /^[a-z0-9]{8,32}$/.test(a.n) && KEY_RE.test(a.k) && SIG_RE.test(a.s || '') && typeof a.sn === 'string' && a.sn.length <= 40;
    function trimActs() {
      const now = Date.now();
      while (acts.length && (acts.length > 30 || now - acts[0].ts > ACT_KEEP_MS)) acts.shift();
    }
    const rank = r => (r === 'owner' ? 2 : r === 'mod' ? 1 : 0);
    function consumeActs(list) {
      if (!Array.isArray(list)) return;
      for (const a of list) {
        if (!a || typeof a.n !== 'string' || seenActs.has(a.n)) continue;
        seenActs.add(a.n);
        if (!validAct(a) || Math.abs(Date.now() - a.ts) > 5 * 60000) continue;
        const role = roleOf(a.k);
        if (!role) continue;
        verify(a.k, actText(a), a.s).then(ok => { if (ok && !stopped) applyAct(a, role); else if (!ok) console.warn('GN-BLOX: ignored an admin command with a bad signature'); });
      }
    }
    let serverLocked = false;
    function applyAct(a, role) {
      const by = safe(a.sn || 'Admin');
      const spec = COMMANDS[a.c];
      if (spec.owner && role !== 'owner') return;
      const num = spec.num != null ? Math.max(-100000, Math.min(100000, Number(a.x[0]) || spec.num)) : 0;
      if (spec.all) {   // everyone: messages, lighting, the server itself
        if (a.c === 'm' || a.c === 'h') luaQueue.push('X|' + (a.c === 'm' ? 'msg' : 'hint') + '|' + by + '|' + safe(a.x[0]));
        else if (a.c === 'countdown') luaQueue.push('X|countdown|' + Math.max(1, Math.min(600, num)));
        else if (a.c === 'time') luaQueue.push('X|time|' + ((num % 24) + 24) % 24);
        else if (a.c === 'fog') luaQueue.push('X|fog|' + Math.max(5, num));
        else if (a.c === 'unfog') luaQueue.push('X|fog|100000');
        else if (a.c === 'lock' || a.c === 'unlock') { serverLocked = a.c === 'lock'; luaQueue.push('X|say|' + by + (serverLocked ? ' locked this server.' : ' unlocked this server.')); }
        else if (a.c === 'shutdown' && a.k !== me.k) quit({ by, reason: 'The server is shutting down.' });
        return;
      }
      const mine = a.t === '*' || a.t.includes(me.id) || (me.k && a.t.includes(me.k));
      if (!mine) { if (a.c === 'ban' && isHub) for (const t of a.t) hubBanned.add(t); return; }
      // moderators can't touch the owner or each other (anyone can target themselves)
      const meRole = me.pr ? myRole : null;
      if (a.k !== me.k && rank(meRole) >= rank(role)) return;
      const reason = safe(a.x[0] || '');
      if (a.c === 'kick') return quit({ by, reason });
      if (a.c === 'ban') {
        const b = bans(); b[room] = { until: Date.now() + 86400000, by, reason };
        try { localStorage.setItem(BAN_KEY, JSON.stringify(b)); } catch (e) {}
        return quit({ ban: true, by, reason });
      }
      if (a.c === 'tp' || a.c === 'bring') luaQueue.push('X|tpto|' + safe(a.x[0]));
      else if (spec.num != null) luaQueue.push('X|' + a.c + '|' + num);
      else luaQueue.push('X|' + (a.c === 'refresh' ? 'respawn' : a.c));
    }
    function nowPlayers() {
      const list = (isHub ? hubSnapshot().p : snapshot.p).filter(pl => pl[0] !== me.id).map(pl => ({ id: pl[0], name: String(pl[1] || ''), k: KEY_RE.test(pl[4] || '') ? pl[4] : '' }));
      return [{ id: me.id, name: me.name, k: me.k, me: true }, ...list];
    }
    function pick(word, list) {
      const w = String(word || '').toLowerCase();
      if (!w) return [];
      if (w === 'me') return list.filter(p => p.me);
      if (w === 'all') return list;
      if (w === 'others') return list.filter(p => !p.me);
      const exact = list.filter(p => p.name.toLowerCase() === w || p.name.toLowerCase().replace(/\s+/g, '') === w);
      return exact.length ? exact : list.filter(p => p.name.toLowerCase().startsWith(w) || p.name.toLowerCase().replace(/\s+/g, '').startsWith(w));
    }
    function runCommand(text) {
      console.info('GN-BLOX admin command:', text);
      const parts = text.slice(1).trim().split(/\s+/);
      const cmd = (parts.shift() || '').toLowerCase();
      if (cmd === 'cmds' || cmd === 'help' || cmd === 'commands') return say(HELP);
      const spec = COMMANDS[cmd];
      if (!spec) return say('There\'s no :' + cmd + ' command. Type :cmds for the list.');
      if (spec.owner && myRole !== 'owner') return say(':' + cmd + ' is for the owner.');
      const list = nowPlayers();
      if (cmd === 'to') {
        const d = pick(parts[0], list).filter(p => !p.me)[0];
        return d ? luaQueue.push('X|tpto|' + d.id) : say('Usage: ' + spec.help);
      }
      let t = '*', x = [], names = '';
      if (spec.who) {
        // a number in the first slot (":speed 50") means you
        const first = parts[0] && !(spec.num != null && /^-?\d+(\.\d+)?$/.test(parts[0])) ? parts.shift() : 'me';
        const who = pick(first, list);
        if (!who.length) return say('Nobody called "' + first + '" here. Usage: ' + spec.help);
        t = [...new Set(who.flatMap(p => (p.k ? [p.id, p.k] : [p.id])))];
        names = who.map(p => (p.me ? 'you' : p.name)).join(', ');
      }
      if (spec.dest) {
        const d = pick(parts.shift(), list)[0];
        if (!d) return say('Usage: ' + spec.help);
        x = [d.id];
      }
      if (cmd === 'bring') x = [me.id];
      if (spec.num != null) { const n = Number(parts.shift()); x = [String(Number.isFinite(n) ? n : spec.num)]; }
      if (spec.rest) x = [parts.join(' ').slice(0, 150)];
      if (cmd === 'm' || cmd === 'h') { x = [parts.join(' ').slice(0, 180)]; if (!x[0]) return say('Usage: ' + spec.help); }
      const a = { r: room, c: cmd, t, x, ts: Date.now(), n: Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join(''), k: ident.pub, sn: me.name };
      ident.sign(actText(a)).then(sig => {
        a.s = sig;
        if (isHub) { acts.push(a); trimActs(); }
        else if (toHub && toHub.open) { try { toHub.send({ t: 'a', a }); } catch (e) {} }
        else return say('Not connected to a server yet.');
        consumeActs([a]);
        say(':' + cmd + (names ? ' (' + names + ')' : '') + ' done');
      }).catch(() => say('Couldn\'t sign that command. Log out and back in on the Log In page.'));
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
      ensureProof();
      let c = clean(q.get('c'), 120);
      const rawChat = String(q.get('c') || '').replace(/[|\r\n]/g, ' ').slice(0, 200);
      if (/^[:;]\S/.test(rawChat) && myRole && ident) { runCommand(':' + rawChat.slice(1)); c = ''; }
      const games = q.getAll('g').slice(0, 10).map(splitPair).filter(Boolean);
      const sets = q.getAll('v').slice(0, 10).map(splitPair).filter(Boolean);
      if (isHub) {
        players.set(id, { name: me.name, state: me.state, stats: me.stats, t: Date.now(), conn: null, k: me.pr ? me.k : '', pr: me.pr });
        if (c) addChat(id, me.name, c);
        for (const [topic, data] of games) addGame(id, me.name, topic, data);
        for (const [key, v] of sets) setKV(key, v);
      } else {
        if (c) outChat.push(c);
        for (const m of games) if (outGame.length < 100) outGame.push(m);
        for (const m of sets) { const i = outKV.findIndex(x => x[0] === m[0]); if (i >= 0) outKV.splice(i, 1); outKV.push(m); }
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
      for (const [pid, name, st, stats, k, pr] of view.p) {
        if (pid === id) continue;
        checkPlayer(pid, k, pr);
        out.push(`P|${pid}|${roleTag(pid)}${name}|${st}|${statsOf(stats)}`);
      }
      if (Number.isFinite(ack) && ack >= 0) {
        for (const [mseq, mid, name, text] of view.c) if (mseq > ack && mid !== id) out.push(`C|${mseq}|${mid}|${roleTag(mid)}${name}|${text}`);
      }
      consumeActs(isHub ? acts : snapshot.a);
      while (luaQueue.length) out.push(luaQueue.shift());
      // G|seq|id|name|topic|data   V|version|key|value   H|last message seq|last version
      const ga = parseInt(q.get('ga'), 10), va = parseInt(q.get('va'), 10) || 0;
      const glist = isHub ? gmsgs : (snapshot.g || []).map(m => ({ seq: m[0], id: m[1], name: m[2], topic: m[3], data: m[4] }));
      if (Number.isFinite(ga) && ga >= 0) for (const m of glist) if (m.seq > ga && m.id !== id && TOPIC_RE.test(String(m.topic))) out.push(`G|${m.seq}|${m.id}|${clean(m.name, 20)}|${m.topic}|${gameData(m.data)}`);
      for (const [key, e] of kvSince(va).slice(0, 100)) out.push(`V|${e.ver}|${key}|${e.v}`);
      out.push(`H|${isHub ? gseq : snapshot.gq | 0}|${kver}`);
      out.push(`T|${Math.round(roomNow())}`);
      out.push(`S|${view.q}`);
      return out.join('\n') + '\n';
    }

    let lastSent = 0;
    function sendToHub() {
      if (!toHub || !toHub.open || !me.id) return;
      const now = Date.now();
      if (now - lastSent < 60 && !outChat.length && !outGame.length && !outKV.length) return;
      lastSent = now;
      try {
        toHub.send({ t: 'u', id: me.id, n: me.name, s: me.state, l: me.stats, c: outChat.splice(0, 3), q: snapshot.q, k: me.pr ? me.k : '', pr: me.pr,
          g: outGame.splice(0, 20), v: outKV.splice(0, 20), vv: kver, gq: snapshot.gq | 0 });
      } catch (e) {}
    }

    const banned = myBan();
    if (banned) { stopped = true; setTimeout(() => opts.onKick && opts.onKick({ ban: true, by: banned.by, reason: banned.reason, until: banned.until }), 0); }

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
      gmsgs = (snapshot.g || []).map(m => ({ seq: m[0], id: m[1], name: m[2], topic: m[3], data: m[4] }));
      gseq = Math.max(gseq, snapshot.gq || 0);
      kver += 1000;   // (so values set from now on are newer than anything a player has heard)
      for (const a of snapshot.a || []) if (validAct(a) && !acts.some(x => x.n === a.n)) acts.push(a);
      setConn('hub');
      p.on('connection', c => {
        if (conns.size >= MAX_PLAYERS + 10) { c.on('open', () => c.close()); return; }
        conns.add(c);
        c.wbSeen = Date.now();
        c.on('data', d => {
          c.wbSeen = Date.now();
          if (d && d.t === 'who') { try { c.send({ t: 'who', n: hubSnapshot().p.length }); } catch (e) {} return; }
          if (d && d.t === 'ping') { try { c.send({ t: 'pong', ts: d.ts }); } catch (e) {} return; }
          if (d && d.t === 'a') {
            if (validAct(d.a) && !acts.some(x => x.n === d.a.n)) { acts.push(d.a); trimActs(); consumeActs([d.a]); }
            return;
          }
          if (!d || d.t !== 'u' || !/^[a-z0-9]{6,16}$/.test(String(d.id))) return;
          const k = KEY_RE.test(String(d.k)) ? String(d.k) : '', pr = SIG_RE.test(String(d.pr)) ? String(d.pr) : '';
          if (hubBanned.has(d.id) || (k && hubBanned.has(k))) { try { c.send({ t: 'banned' }); } catch (e) {} setTimeout(() => c.close(), 200); return; }
          if (!players.has(d.id) && players.size >= MAX_PLAYERS) { try { c.send({ t: 'full' }); } catch (e) {} setTimeout(() => c.close(), 200); return; }
          if (serverLocked && !players.has(d.id) && !(k && roleOf(k))) { try { c.send({ t: 'locked' }); } catch (e) {} setTimeout(() => c.close(), 200); return; }
          const name = clean(d.n, 20) || 'Guest';
          players.set(d.id, { name, state: STATE_RE.test(String(d.s)) ? String(d.s) : '', stats: statsOf(d.l), t: Date.now(), conn: c, k, pr });
          // after a hub handover, keep chat numbers moving forward so nobody skips new messages
          const q = d.q | 0; if (q > seq && q < seq + 1e6) seq = q;
          for (const text of (Array.isArray(d.c) ? d.c : []).slice(0, 3)) addChat(d.id, name, clean(text, 120));
          for (const m of (Array.isArray(d.g) ? d.g : []).slice(0, 20)) if (Array.isArray(m) && TOPIC_RE.test(String(m[0]))) addGame(d.id, name, String(m[0]), m[1]);
          for (const m of (Array.isArray(d.v) ? d.v : []).slice(0, 20)) if (Array.isArray(m)) setKV(String(m[0]), m[1]);
          if (Number.isFinite(d.vv)) c.wbVV = d.vv;
          const gq = d.gq | 0; if (gq > gseq && gq < gseq + 1e6) gseq = gq;
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
        snapshot = { p: Array.isArray(d.p) ? d.p : [], c: Array.isArray(d.c) ? d.c : [], q: d.q | 0, h: String(d.h || ''), a: Array.isArray(d.a) ? d.a.slice(-30) : [],
          g: Array.isArray(d.g) ? d.g.slice(-40) : [], gq: d.gq | 0 };
        mergeKV(d.v, d.vv);
        heard = Date.now();
        if (Number.isFinite(d.T)) offset = d.T - Date.now();
      } else if (d.t === 'locked') {
        quit({ by: '', reason: 'This server is locked. Try another server.' });
      } else if (d.t === 'banned') {
        const b = myBan() || {};
        quit({ ban: true, by: b.by || '', reason: b.reason || '' });
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
          } else if (c.open) {
            const delta = kvSince(c.wbVV | 0).slice(0, 100);
            try { c.send(delta.length ? Object.assign({}, snap, { v: delta.map(([k, e]) => [k, e.v, e.ver]) }) : snap); } catch (e) {}
            if (delta.length) c.wbVV = delta[delta.length - 1][1].ver;
          }
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
