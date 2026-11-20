# WebBlox relay (experimental, not working end to end yet)

The engine has an unfinished multiplayer mode (`play.html?replication=1`). In that mode it
runs a game server inside the browser and talks UDP through Emscripten's
"WebSocket to POSIX sockets" bridge, which it expects at `ws://127.0.0.1:4016`.

`relay.js` speaks that bridge protocol but never opens a real socket: UDP packets are passed in
memory between browsers connected to the same `?room=` on the relay, so it is safe to host.

```bash
npm install
node relay.js            # listens on 127.0.0.1:4016 (set HOST / PORT to change, DEBUG=1 to log)
```

Then open `play.html?replication=1&debug=1` (add `&relay=wss://your-relay/?room=abc` for a
hosted relay).

## Status

- The in-browser game server starts and binds its port through the relay.
- The client then crashes inside RakNet (`RakPeer::RunUpdateCycle` hits a compiled-in trap on
  its connection-timeout path) about 0.1 s after starting. That is engine code with no source
  available, so it needs a fixed engine build or more binary patching.
- Every browser currently starts its own server; joining someone else's game needs an engine
  change too.
