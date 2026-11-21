# GN-BLOX tools

## GN-BLOX's own games

`build_games.py` builds Rainbow Obby, Sky Tower, The Floor is Lava, Speed Run and Pizza Shift into `../places/`.
The levels are generated from code (Roblox XML, then `xml2bin.py`), and their behavior comes from the
Lua in `games/`:

- `obby.lua` gives parts their behavior by name: `KillBrick`, `Checkpoint` (+ IntValue `Stage`),
  `Vanish`, `Bounce`, `Speed`, `Spinner`, `Mover` (carries you), `Go` and `Finish`. It also keeps
  Stage/Wins leaderstats (or Best/Runs in timer mode) and respawns you on your last checkpoint.
- `lava.lua` runs The Floor is Lava's rounds on the multiplayer room's shared clock.
- `pizza.lua` runs Pizza Shift: customers, the register, dough/topping/oven/box stations (ClickDetectors
  on parts in the `Kitchen` model), the pizza you carry, and Money/Pizzas leaderstats.

```bash
pip install lz4
python3 build_games.py
```

Then add an entry to `GAMES` in `../index.html`, with `../thumbs/<id>.jpg` (300×300) and `<id>-wide.jpg` (640×360).

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

## Uploaded places

Places uploaded on the site (Upload a Place / Develop) don't need any of this: `../rbxfile.js` converts
them in the browser when the game starts. It reads any Roblox place or model, XML or binary, from
2008-era files to ones saved by today's Studio (LZ4 or Zstd chunks), and writes the binary format the
2016 engine expects:

- property types are made to match `typemap.json` (64-bit numbers, shared strings and so on),
- exact part colors (`Color3uint8`) become the nearest 2016 BrickColor (the engine's own 208-color palette),
- WeldConstraints become ManualWelds that hold the parts where they are, font faces become fonts,
- properties and objects the 2016 engine doesn't have are left out, linked scripts are cleared,
- a model file gets put in a new place with a baseplate.

If the engine still rejects the place, `../play.html` reloads it once in safe mode, which also leaves
out terrain and union data and any property the engine isn't known to read.

The converter also:

- clears `Script.LinkedSource` links (they point at an asset server that no longer exists),
- fixes `FogEnd = 0` in very old places,
- rebuilds real services from "CreatorId=… PlaceId=…" snapshot models.

`typemap.json` lists the property types the engine expects. It was read out of the
engine's own binary places, and the engine refuses a place whose property types don't match.

## Game scripts and the Roblox web services

Everything 2014-2016 game scripts use runs: Scripts in ServerScriptService and Workspace, LocalScripts in
StarterGui ScreenGuis, StarterPack, tools, StarterPlayerScripts/StarterCharacterScripts and ReplicatedFirst,
RemoteEvents/RemoteFunctions, ModuleScripts, GUI buttons and input. What used to break them was the web:
the engine asks a Roblox web server for DataStores, game passes, asset ownership, groups and friends,
and a failed request left the waiting script asleep forever. `../webapi.js` answers those requests in the
page (the engine sends them to `wb-api/`, `../coi-serviceworker.js` passes them over): DataStores and
OrderedDataStores work and are saved on the device per game; nobody owns passes or assets, nobody is in
a group, and products have plain info, so scripts carry on.

## Accounts, owner and moderators

There's no server behind the site, so accounts work like this: your account ID is a signing key made
from your username and password (PBKDF2, then Ed25519, in `../site.js`). The same username and password
give the same ID on any device; nobody without the password can make it. ROBUX, items and outfits stay on
the device you use.

`../config.js` lists the owner's and moderators' account IDs (`owners`, `mods`); `../admin.html` shows
yours and writes the lines to paste. Owners and moderators get admin commands in chat (`:kick`, `:ban`,
`:m`, `:h`, `:kill`, `:respawn`, `:tp`, `:bring`, `:to`, `:speed`, `:god`, `:freeze`... `:cmds` lists them)
and an [Owner] / [Mod] tag. A command is signed with the account's key; `../p2p.js` passes it to everyone
through the server's host, and each player's game checks the signature against `config.js` before doing
anything. Moderators can't act on the owner or each other. Bans keep the player out of that game for a day
(kept on their device and by the server's host).

## Studio

`../studio.html` (Develop on the site) is a place editor in the style of 2016 Roblox Studio: Explorer,
Properties, Move/Scale/Rotate handles with snapping, Insert Object, a Lua script editor, undo/redo,
copy/paste/duplicate/group, and Play, which hands the place to `../play.html`. It opens any .rbxl/.rbxlx/.rbxm
(through `../rbxfile.js`), saves binary .rbxl files, and keeps the place you're working on in the browser.
New objects get the property types in `typemap.json`, so what you build loads in the 2016 engine.

## Engine patch

`patch_engine.py` documents the fixes applied to `rblx.wasm` / `rblx.js` (already applied in
this folder). The main ones:

1. Lua errors, including errors inside `pcall`, used to crash the whole game. They are now
   handled like normal Lua errors.
2. Requests for linked scripts are answered immediately, so they no longer hang loading.
3. A game's scripts start before you join, like on a real Roblox server. The engine used to
   create your player first, so scripts that hand out leaderstats when a player joins never
   saw you: empty leaderboards, no Cash, no KOs.
4. The build's debug alignment check no longer ends the game (leaderboard numbers tripped it).
6. Game scripts can signal the page: a request to `https://webblox.signal/<message>` is answered
   at once and `<message>` goes to `../play.html` on a BroadcastChannel. Leave Game in the in-game
   menu uses it to go home, and the game reports its frame rate for Auto graphics.
7. Shift lock keeps the mouse locked. The engine let go of the pointer lock after any frame slower
   than 50 ms and only took it back after eight quick calls, so on slower computers the lock flickered
   on and off and the shift lock icon and camera jumped around.
5. Game sound starts right away. The audio bridge used to wait for your first click to even set up,
   and dropped any sound loaded before it; now it's set up at once and starts on your first click
   or key press (`../play.html` shows a "Click for sound" button until then).

If those files are ever replaced with a fresh build, re-run
`python3 patch_engine.py ../rblx.wasm ../rblx.js` and bump `VERSION` in `../play.html`.

## Multiplayer

Multiplayer is peer-to-peer and needs nothing hosted. The in-game side, `../scripts/WebBloxPlayers.lua`,
asks `peer-sync/<id>/sync?...` a few times a second for everyone else's avatar, leaderstats and chat.
`../coi-serviceworker.js` catches those requests and passes them (over a `BroadcastChannel`) to the play
page, where `../p2p.js` answers them. It shares the player's state with the other players in the room
over PeerJS (WebRTC):

- Each server has a PeerJS id, `webblox-v1-<room>` (public servers 2-5: `..._s2` and so on). The
  first player in a server takes it and becomes the hub; everyone after connects to the hub, which
  sends everyone the server's players and chat a few times a second. If the hub leaves (or goes
  quiet for 4 seconds), the others race to take over the id.
- PeerJS's free cloud (0.peerjs.com) only introduces the browsers to each other. Game data goes
  directly between them, or through PeerJS's free TURN relay on networks that block direct connections.
- Rooms are `pub-<game>` (everyone playing that game) and `priv-<code>-<game>` (invite links from a
  game's Servers tab). A public room has up to 5 servers: anyone can end up hosting one, including
  someone whose network refuses connections, so a server you can't reach in 9 seconds (or that's
  full) is skipped for a minute and you join the next one. A hub alone on a higher server moves down
  once a lower one is free again. Swear words in chat are masked (`####`).
- Replies also carry the room's clock (`T|ms`); `ReplicatedStorage.WebBlox` hands it, the room name
  and the other players' leaderstats to the game's own scripts and the player list.

## Natural Disaster Survival rounds

Every player runs their own copy of the game, so out of the box everyone got their own random map
and disaster. `nds_sync.py` rewrites the game's round script so rounds start on the room's shared
clock (every 190 seconds) and the map and disaster come from the room name and round number:
everyone in a server gets the same ones at the same time. It also counts Survivals in leaderstats
and fills the lobby's Top 10 board with everyone in the server.

```bash
python3 nds_sync.py --builtin ../places/natural-disaster-survival.rbxl   # the built-in game
python3 nds_sync.py "in.rbxl" "out.rbxl"                                 # e.g. the Classic copy
```

`../play.html` loads `places/natural-disaster-survival.rbxl` when no map is given.

`../config.js` can point at your own PeerJS server (`peerServer`) instead of the free cloud, or switch
to the classic `multiplayer-server/` (`multiplayerServer`), which speaks the same protocol. Its README
explains how to run it.

## Hats and gear

Catalog hats and gear are built from plain parts listed in `../site.js` (`HATS`, `GEAR`). The same list
draws them on the website in 3D (`../avatar3d.js`, three.js) and builds them in games
(`../scripts/WebBloxPlayers.lua`, which gets it from `../play.html`), so they always match. Gear becomes a
Tool in your Backpack that changes your speed and/or gravity while you hold it.

## Animations

`build_animations.py` generates `../scripts/WebBloxAnimate.lua`, which gives characters their default
2016 animations. The engine never runs the Animate script it puts into characters, and it can't load
roblox.com animation assets.
