// Virtual-network relay for WebBlox multiplayer.
// Speaks Emscripten's websocket_to_posix_socket protocol, but never opens a
// real socket: UDP datagrams are delivered in memory between players that are
// connected to the same room. Safe to host publicly (it can't reach anything).
'use strict';
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = +process.env.PORT || 4016;
const HOST = process.env.HOST || '127.0.0.1';
const DEBUG = !!process.env.DEBUG;

// Emscripten (WASI) errno values
const E = { ADDRINUSE: 3, ADDRNOTAVAIL: 4, AFNOSUPPORT: 5, AGAIN: 6, BADF: 8, INVAL: 28, NOPROTOOPT: 50, NOTCONN: 53, NOTSOCK: 57, NOTSUP: 58, CONNREFUSED: 14, MSGSIZE: 35, NOENT: 44 };
const FN = { 1: 'socket', 2: 'socketpair', 3: 'shutdown', 4: 'bind', 5: 'connect', 6: 'listen', 7: 'accept', 8: 'getsockname', 9: 'getpeername', 10: 'send', 11: 'recv', 12: 'sendto', 13: 'recvfrom', 16: 'getsockopt', 17: 'setsockopt', 18: 'getaddrinfo', 19: 'getnameinfo' };
const AF_INET = 2, SOCK_DGRAM = 2, MSG_DONTWAIT = 0x40, SOL_SOCKET = 1;

const rooms = new Map(); // name -> { ports: Map<port, Sock>, nextPort, clients:Set }
function room(name) {
  let r = rooms.get(name);
  if (!r) rooms.set(name, r = { name, ports: new Map(), nextPort: 49152, clients: new Set() });
  return r;
}

function addr(port, ip = [127, 0, 0, 1]) {
  const b = Buffer.alloc(16);
  b.writeUInt16LE(AF_INET, 0); b.writeUInt16BE(port, 2); b[4] = ip[0]; b[5] = ip[1]; b[6] = ip[2]; b[7] = ip[3];
  return b;
}
function parseAddr(buf) {
  if (buf.length < 8) return null;
  return { family: buf.readUInt16LE(0), port: buf.readUInt16BE(2), ip: [buf[4], buf[5], buf[6], buf[7]] };
}

class Client {
  constructor(ws, roomName) {
    this.ws = ws; this.room = room(roomName); this.room.clients.add(this);
    this.socks = new Map(); this.nextFd = 3; this.id = Math.random().toString(36).slice(2, 7);
  }
  reply(callId, ret, errno = 0, extra) {
    const h = Buffer.alloc(12);
    h.writeInt32LE(callId, 0); h.writeInt32LE(ret, 4); h.writeInt32LE(errno, 8);
    if (this.ws.readyState === 1) this.ws.send(extra ? Buffer.concat([h, extra]) : h);
  }
  fail(callId, errno) { this.reply(callId, -1, errno); }
  log(...a) { if (DEBUG) console.log(`[${this.room.name}/${this.id}]`, ...a); }

  ephemeral() {
    const r = this.room;
    for (let i = 0; i < 16384; i++) {
      const p = r.nextPort++; if (r.nextPort > 65535) r.nextPort = 49152;
      if (!r.ports.has(p)) return p;
    }
    return 0;
  }
  bindTo(s, port) {
    if (port === 0) port = this.ephemeral();
    if (this.room.ports.has(port)) return -E.ADDRINUSE;
    s.port = port; this.room.ports.set(port, s);
    return 0;
  }

  handle(msg) {
    const callId = msg.readInt32LE(0), fn = msg.readInt32LE(4);
    const i32 = o => msg.readInt32LE(o);
    const s = this.socks.get(i32(8));
    switch (fn) {
      case 1: { // socket(domain, type, protocol)
        const domain = i32(8), type = i32(12) & 0xf;
        if (domain !== AF_INET) { this.log('socket domain', domain, '-> EAFNOSUPPORT'); return this.fail(callId, E.AFNOSUPPORT); }
        if (type !== SOCK_DGRAM) { this.log('socket type', type, '-> ENOTSUP'); return this.fail(callId, E.NOTSUP); }
        const fd = this.nextFd++;
        this.socks.set(fd, { fd, port: 0, queue: [], waiting: [], timeoutMs: 0, peer: null, owner: this });
        this.log('socket ->', fd);
        return this.reply(callId, fd);
      }
      case 4: case 5: { // bind / connect(socket, len, addr)
        if (!s) return this.fail(callId, E.BADF);
        const a = parseAddr(msg.subarray(16, 16 + i32(12)));
        if (!a) return this.fail(callId, E.INVAL);
        if (fn === 4) {
          const r = this.bindTo(s, a.port);
          this.log('bind', s.fd, 'port', a.port, '->', r === 0 ? s.port : r);
          return r === 0 ? this.reply(callId, 0) : this.fail(callId, -r);
        }
        if (!s.port) this.bindTo(s, 0);
        s.peer = a.port; this.log('connect', s.fd, '->', a.port);
        return this.reply(callId, 0);
      }
      case 8: case 9: { // getsockname / getpeername
        if (!s) return this.fail(callId, E.BADF);
        if (fn === 9 && !s.peer) return this.fail(callId, E.NOTCONN);
        const a = addr(fn === 8 ? s.port : s.peer);
        const len = Buffer.alloc(4); len.writeInt32LE(16, 0);
        return this.reply(callId, 0, 0, Buffer.concat([len, a]));
      }
      case 10: case 12: { // send / sendto
        if (!s) return this.fail(callId, E.BADF);
        let len, data, dest;
        if (fn === 10) { len = i32(12); data = msg.subarray(20, 20 + len); dest = s.peer; }
        else { len = i32(12); const dl = i32(20); const a = parseAddr(msg.subarray(24, 24 + dl)); dest = a ? a.port : s.peer; data = msg.subarray(24 + 256, 24 + 256 + len); }
        if (!s.port) this.bindTo(s, 0);
        const target = this.room.ports.get(dest);
        if (target) target.owner.deliver(target, Buffer.from(data), s.port);
        else this.log('sendto', s.fd, 'port', dest, 'dropped (nobody bound)');
        return this.reply(callId, len);
      }
      case 11: case 13: { // recv / recvfrom
        if (!s) return this.fail(callId, E.BADF);
        const req = { callId, max: i32(12), from: fn === 13 };
        if (s.queue.length) return this.answer(s, req, s.queue.shift());
        if (i32(16) & MSG_DONTWAIT) return this.fail(callId, E.AGAIN);
        if (s.timeoutMs > 0) req.timer = setTimeout(() => { s.waiting = s.waiting.filter(w => w !== req); this.fail(callId, E.AGAIN); }, s.timeoutMs);
        s.waiting.push(req);
        return;
      }
      case 16: { // getsockopt -> report zeros of the requested size
        if (!s) return this.fail(callId, E.BADF);
        return this.reply(callId, 0, 0, Buffer.alloc(Math.min(Math.max(i32(20), 4), 16)));
      }
      case 17: { // setsockopt(socket, level, name, len, value)
        if (!s) return this.fail(callId, E.BADF);
        const level = i32(12), name = i32(16), len = i32(20), v = msg.subarray(24, 24 + len);
        if (level === SOL_SOCKET && (name === 20 || name === 66) && len >= 8) { // SO_RCVTIMEO (old / time64)
          const sec = len >= 16 ? Number(v.readBigInt64LE(0)) : v.readInt32LE(0);
          const usec = len >= 16 ? Number(v.readBigInt64LE(8)) : v.readInt32LE(4);
          s.timeoutMs = sec * 1000 + Math.floor(usec / 1000);
        }
        this.log('setsockopt', s.fd, level, name, len, v.toString('hex'));
        return this.reply(callId, 0);
      }
      case 18: { // getaddrinfo(node, service, hints) -> 127.0.0.1
        const node = msg.subarray(8, 8 + 2048).toString('latin1').replace(/\0.*$/s, '');
        const service = msg.subarray(8 + 2048, 8 + 2048 + 128).toString('latin1').replace(/\0.*$/s, '');
        const base = 8 + 2048 + 128, hasHints = i32(base), socktype = hasHints ? i32(base + 12) : SOCK_DGRAM;
        this.log('getaddrinfo', node, service);
        const canon = Buffer.alloc(2048); canon.write(node || 'localhost', 'latin1');
        const count = Buffer.alloc(4); count.writeInt32LE(1, 0);
        const ai = Buffer.alloc(20); ai.writeInt32LE(0, 0); ai.writeInt32LE(AF_INET, 4); ai.writeInt32LE(socktype || SOCK_DGRAM, 8); ai.writeInt32LE(17, 12); ai.writeInt32LE(16, 16);
        return this.reply(callId, 0, 0, Buffer.concat([canon, count, ai, addr(parseInt(service, 10) || 0)]));
      }
      case 3: return this.reply(callId, 0); // shutdown
      default:
        this.log('unsupported call', FN[fn] || fn);
        return this.fail(callId, E.NOTSUP);
    }
  }
  deliver(s, data, fromPort) {
    const pkt = { data, fromPort };
    const req = s.waiting.shift();
    if (req) this.answer(s, req, pkt); else if (s.queue.length < 4096) s.queue.push(pkt);
  }
  answer(s, req, pkt) {
    if (req.timer) clearTimeout(req.timer);
    const data = pkt.data.subarray(0, req.max);
    if (!req.from) return this.reply(req.callId, data.length, 0, data);
    const meta = Buffer.alloc(8); meta.writeInt32LE(data.length, 0); meta.writeInt32LE(16, 4);
    this.reply(req.callId, data.length, 0, Buffer.concat([meta, data, addr(pkt.fromPort)]));
  }
  close() {
    for (const s of this.socks.values()) {
      if (s.port && this.room.ports.get(s.port) === s) this.room.ports.delete(s.port);
      for (const w of s.waiting) if (w.timer) clearTimeout(w.timer);
    }
    this.room.clients.delete(this);
    if (!this.room.clients.size) rooms.delete(this.room.name);
  }
}

const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('WebBlox relay\n'); });
const wss = new WebSocketServer({ server, maxPayload: 1 << 20 });
wss.on('connection', (ws, req) => {
  const roomName = (new URL(req.url, 'http://x').searchParams.get('room') || 'default').slice(0, 64);
  const c = new Client(ws, roomName);
  c.log('connected; players in room:', c.room.clients.size);
  ws.on('message', (m, isBinary) => { if (isBinary && m.length >= 8) { try { c.handle(m); } catch (e) { console.error(e); } } });
  ws.on('close', () => { c.log('disconnected'); c.close(); });
});
server.listen(PORT, HOST, () => console.log(`relay listening on ${HOST}:${PORT}`));
