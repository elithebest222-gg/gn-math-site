# WebBlox tools

## Adding a game

Old XML places (`<roblox xmlns...` at the top of the file) load very slowly in this engine:
it reads XML with hundreds of thousands of tiny file reads, so a 20 MB place takes minutes.
Convert them to the binary format first:

```bash
pip install lz4
python3 xml2bin.py "My Game.rbxl" "../places/My Game.rbxl"
```

Then add an entry to `GAMES` in `../index.html` (and optionally a `../thumbs/<id>.jpg`
square thumbnail plus a `<id>-wide.jpg` 16:9 one).

Places that are already binary (`<roblox!` at the top) can go straight into `places/`.

The converter also:

- clears `Script.LinkedSource` links (they point at an asset server that no longer exists),
- fixes `FogEnd = 0` in very old places,
- rebuilds real services from "CreatorId=… PlaceId=…" snapshot models.

`typemap.json` lists the property types the engine expects. It was read out of the
engine's own binary places, and the engine refuses a place whose property types don't match.

## Engine patch

`patch_engine.py` documents the two fixes applied to `rblx.wasm` / `rblx.js`
(already applied in this folder):

1. Lua errors, including errors inside `pcall`, used to crash the whole game. They are now
   handled like normal Lua errors.
2. Requests for linked scripts are answered immediately, so they no longer hang loading.

If those files are ever replaced with a fresh build, re-run
`python3 patch_engine.py ../rblx.wasm ../rblx.js` and bump `VERSION` in `../play.html`.

## Multiplayer

Multiplayer is peer-to-peer and needs nothing hosted. The in-game side, `../scripts/WebBloxPlayers.lua`,
asks `peer-sync/<id>/sync?...` a few times a second for everyone else's avatar and chat.
`../coi-serviceworker.js` catches those requests and passes them (over a `BroadcastChannel`) to the play
page, where `../p2p.js` answers them. It shares the player's state with the other players in the room
over PeerJS (WebRTC):

- Each room has a PeerJS id, `webblox-v1-<room>`. The first player in a room takes it and becomes the
  hub; everyone after connects to the hub, which sends everyone the room's players and chat a few
  times a second. If the hub leaves, the others race to take over the id.
- PeerJS's free cloud (0.peerjs.com) only introduces the browsers to each other. Game data goes
  directly between them, or through PeerJS's free TURN relay on networks that block direct connections.
- Rooms are `pub-<game>` (everyone playing that game, no chat) and `priv-<code>-<game>` (invite links
  from a game's Servers tab, chat on).

`../config.js` can point at your own PeerJS server (`peerServer`) instead of the free cloud, or switch
to the classic `multiplayer-server/` (`multiplayerServer`), which speaks the same protocol. Its README
explains how to run it.

## Animations

`build_animations.py` generates `../scripts/WebBloxAnimate.lua`, which gives characters their default
2016 animations. The engine never runs the Animate script it puts into characters, and it can't load
roblox.com animation assets.
