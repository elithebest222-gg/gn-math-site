// WebBlox lite-multiplayer server.
//
// Every player's game calls GET /sync about 8 times a second with its avatar state
// (position, facing, animation, colors, hat) and any chat line, and gets back everyone
// else in the same room. No dependencies: `node server.js` (PORT env, default 8080).
//
//   GET /sync?room=&id=&name=&s=&c=&ack=   -> text lines (see reply format below)
//   GET /rooms                             -> {"room": playerCount, ...}
//
// Chat is only relayed in private rooms (names starting with "priv-"), since the
// public rooms are open to anyone on the site.
'use strict';
const http = require('http');

const PORT = +process.env.PORT || 8080;
const STALE_MS = 6000;          // players vanish this long after their last sync
const MAX_PLAYERS = 30;         // per room
const CHAT_KEEP = 50;           // chat lines kept per room

const rooms = new Map();        // name -> { players: Map<id, player>, chat: [], seq }

const ROOM_RE = /^(pub|priv)-[a-z0-9-]{1,60}$/;
const ID_RE = /^[a-z0-9]{6,16}$/;
const STATE_RE = /^[-0-9.,a-z]{1,160}$/;
const clean = (s, n) => String(s || '').replace(/[^A-Za-z0-9 _.\-!?,'@#:()]/g, '').trim().slice(0, n);

function room(name) {
  let r = rooms.get(name);
  if (!r) rooms.set(name, r = { players: new Map(), chat: [], seq: 0 });
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
    me = { name: 'Guest', state: '', t: now };
    r.players.set(id, me);
  }
  me.t = now;
  me.name = clean(q.get('name'), 20) || me.name;
  const s = String(q.get('s') || '');
  if (STATE_RE.test(s)) me.state = s;
  const c = clean(q.get('c'), 120);
  if (c && name.startsWith('priv-') && now - (me.lastChat || 0) > 700) {
    me.lastChat = now;
    r.chat.push({ seq: ++r.seq, id, name: me.name, text: c, t: now });
    if (r.chat.length > CHAT_KEEP) r.chat.shift();
  }

  // Reply: one line per other player, then chat lines newer than ?ack=, then the latest seq.
  //   P|id|name|state     C|seq|id|name|text     S|seq
  const ack = parseInt(q.get('ack'), 10);
  const out = [];
  for (const [pid, p] of r.players) if (pid !== id && p.state) out.push(`P|${pid}|${p.name}|${p.state}`);
  if (Number.isFinite(ack) && ack >= 0) {
    for (const m of r.chat) if (m.seq > ack && m.id !== id) out.push(`C|${m.seq}|${m.id}|${m.name}|${m.text}`);
  }
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
