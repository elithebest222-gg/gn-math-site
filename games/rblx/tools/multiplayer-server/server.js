// WebBlox lite-multiplayer server.
//
// Every player's game calls GET /sync about 8 times a second with its avatar state
// (position, facing, animation, colors, hat) and any chat line, and gets back everyone
// else in the same room. No dependencies: `node server.js` (PORT env, default 8080).
//
//   GET /sync?room=&id=&name=&s=&l=&c=&ack=&g=&v=&ga=&va= -> text lines (see reply format below)
//   (l = the player's leaderstats, "Cash:120,Logs:4"; g = "topic|data", a message from the game's
//   scripts for everyone else; v = "key|value", a value the whole room shares; see p2p.js)
//   GET /rooms                             -> {"room": playerCount, ...}
//
// Public rooms are open to anyone on the site, so swear words in chat are masked (####).
'use strict';
const http = require('http');

const PORT = +process.env.PORT || 8080;
const STALE_MS = 6000;          // players vanish this long after their last sync
const MAX_PLAYERS = 30;         // per room
const CHAT_KEEP = 50;           // chat lines kept per room
const G_KEEP = 100, KV_MAX = 256, G_PER_SEC = 30;   // game messages kept, shared values, messages a second
const TOPIC_RE = /^[A-Za-z0-9_.\-]{1,32}$/;
const splitPair = t => { t = String(t || ''); const i = t.indexOf('|'), k = i < 0 ? t : t.slice(0, i); return TOPIC_RE.test(k) ? [k, (i < 0 ? '' : t.slice(i + 1)).replace(/[\r\n]/g, ' ')] : null; };

const rooms = new Map();        // name -> { players: Map<id, player>, chat: [], seq }

const ROOM_RE = /^(pub|priv)-[a-z0-9-]{1,60}$/;
const ID_RE = /^[a-z0-9]{6,16}$/;
const STATE_RE = /^[-0-9.,a-z]{1,160}$/;
const STATS_RE = /^[A-Za-z0-9 _.:,\-]{0,200}$/;
const clean = (s, n) => String(s || '').replace(/[^A-Za-z0-9 _.\-!?,'@#:()]/g, '').trim().slice(0, n);
// (same list as p2p.js)
const BAD_WORDS = /(f+u+c+k|sh[i1]t|b[i1]tch|cunt|d[i1]ck|puss(y|ie)|a+s+s+h+o+l+e|bastard|slut|wh[o0]re|n[i1]gg|f[a@]g|retard|\bc[o0]ck|porn|pen[i1]s|vag[i1]na|\brap(e|ed|es|ing|ist|ists)\b|nazi|d[i1]ldo|b[o0]{2}b|\bt[i1]ts\b|\bcum\b|\bsex\b|\bkys\b)/gi;
const filterChat = text => text.replace(BAD_WORDS, w => '#'.repeat(w.length));

function room(name) {
  let r = rooms.get(name);
  if (!r) rooms.set(name, r = { players: new Map(), chat: [], seq: 0, game: [], gseq: 0, kv: new Map(), kver: 0 });
  return r;
}

function prune(now) {
  for (const [name, r] of rooms) {
    for (const [id, p] of r.players) if (now - p.t > STALE_MS) r.players.delete(id);
    if (!r.players.size && (!r.chat.length || now - r.chat[r.chat.length - 1].t > 60000)) rooms.delete(name);
  }
}

function sync(q, now) {
  const name = String(q.get('room') || '').toLowerCase();
  const id = String(q.get('id') || '');
  if (!ROOM_RE.test(name) || !ID_RE.test(id)) return [400, 'bad request\n'];
  const r = room(name);
  let me = r.players.get(id);
  if (!me) {
    if (r.players.size >= MAX_PLAYERS) return [503, 'E|room is full\n'];
    me = { name: 'Guest', state: '', stats: '', t: now };
    r.players.set(id, me);
  }
  me.t = now;
  me.name = clean(q.get('name'), 20) || me.name;
  const s = String(q.get('s') || '');
  if (STATE_RE.test(s)) me.state = s;
  const l = String(q.get('l') || '');
  if (q.has('l') && STATS_RE.test(l)) me.stats = l;
  const c = clean(q.get('c'), 120);
  if (c && now - (me.lastChat || 0) > 700) {
    me.lastChat = now;
    r.chat.push({ seq: ++r.seq, id, name: me.name, text: filterChat(c), t: now });
    if (r.chat.length > CHAT_KEEP) r.chat.shift();
  }

  for (const [topic, data] of q.getAll('g').slice(0, 10).map(splitPair).filter(Boolean)) {
    if (now - (me.gT || 0) > 1000) { me.gT = now; me.gN = 0; }
    if (++me.gN > G_PER_SEC) break;
    r.game.push({ seq: ++r.gseq, id, name: me.name, topic, data: data.slice(0, 400) });
    if (r.game.length > G_KEEP) r.game.shift();
  }
  for (const [key, v] of q.getAll('v').slice(0, 10).map(splitPair).filter(Boolean)) {
    if (!r.kv.has(key) && r.kv.size >= KV_MAX) continue;
    r.kv.set(key, { v: v.slice(0, 200), ver: ++r.kver });
  }

  // Reply: one line per other player, then chat lines newer than ?ack=, the server's clock
  // (ms; games use it to run timed rounds together), then the latest seq.
  //   P|id|name|state|stats     C|seq|id|name|text     T|ms     S|seq
  const ack = parseInt(q.get('ack'), 10);
  const out = [];
  for (const [pid, p] of r.players) if (pid !== id && p.state) out.push(`P|${pid}|${p.name}|${p.state}|${p.stats}`);
  if (Number.isFinite(ack) && ack >= 0) {
    for (const m of r.chat) if (m.seq > ack && m.id !== id) out.push(`C|${m.seq}|${m.id}|${m.name}|${m.text}`);
  }
  //   G|seq|id|name|topic|data (game messages newer than ?ga=)   V|version|key|value (newer than ?va=)
  //   H|last message seq|last version
  const ga = parseInt(q.get('ga'), 10), va = parseInt(q.get('va'), 10) || 0;
  if (Number.isFinite(ga) && ga >= 0) for (const m of r.game) if (m.seq > ga && m.id !== id) out.push(`G|${m.seq}|${m.id}|${m.name}|${m.topic}|${m.data}`);
  for (const [key, e] of [...r.kv].filter(([, e]) => e.ver > va).sort((a, b) => a[1].ver - b[1].ver).slice(0, 100)) out.push(`V|${e.ver}|${key}|${e.v}`);
  out.push(`H|${r.gseq}|${r.kver}`);
  out.push(`T|${now}`);
  out.push(`S|${r.seq}`);
  return [200, out.join('\n') + '\n'];
}

const server = http.createServer((req, res) => {
  const now = Date.now();
  const url = new URL(req.url, 'http://x');
  // The engine sends its requests with credentials, so CORS has to name the origin (no "*").
  const origin = /^https?:\/\/[A-Za-z0-9.\-]+(:\d+)?$/.test(req.headers.origin || '') ? req.headers.origin : '*';
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  };
  if (req.method === 'OPTIONS') {   // CORS preflight (the game engine adds its own request headers)
    res.writeHead(204, Object.assign(headers, {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
      'Access-Control-Max-Age': '86400',
    }));
    return res.end();
  }
  let status = 200, body = 'WebBlox multiplayer server is running.\n';
  if (url.pathname === '/sync') [status, body] = sync(url.searchParams, now);
  else if (url.pathname === '/rooms') {
    const counts = {};
    for (const [name, r] of rooms) if (name.startsWith('pub-') && r.players.size) counts[name] = r.players.size;
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(counts);
  } else if (url.pathname !== '/') { status = 404; body = 'not found\n'; }
  res.writeHead(status, headers);
  res.end(body);
});

setInterval(() => prune(Date.now()), 2000).unref();
server.listen(PORT, () => console.log(`WebBlox multiplayer server on port ${PORT}`));
