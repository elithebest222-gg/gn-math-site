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
- a model file gets put in a new place with a baseplate,
- a place with no SpawnLocation and no floor in the middle of the map (where Roblox puts you when there's
  no spawn) gets an invisible spawn on top of its biggest floor, so you don't fall forever.

If the engine still rejects the place, `../play.html` reloads it once in safe mode, which also leaves
out terrain and union data and any property the engine isn't known to read.

The converter also:

- clears `Script.LinkedSource` links (they point at an asset server that no longer exists),
- fixes `FogEnd = 0` in very old places,
- rebuilds real services from "CreatorId=… PlaceId=…" snapshot models,
- turns `rbxassetid://123` links (in properties and in scripts) into `http://www.roblox.com/asset/?id=123`,
  the only kind this engine fetches.

### Images, meshes and sounds

A place file only names its assets; the files are on Roblox's servers, which the site can't use. So a
game's images, meshes and sounds can be uploaded with it: pick the place and the files together in Upload
a Place, or one `.zip` with all of them, each file named with its asset id (`123456.png`,
`Sword 123456.mesh`; the longest number in the name is the id). `../assets.js` keeps them in the browser
(IndexedDB `webblox` / `files`, as `asset:<id>`), replacing the last game's, and converts what the 2016
engine can't read: Roblox meshes from version 3.00 to 5.00 and `.obj` files become mesh 2.00 (the most
detailed level), WebP / GIF / BMP / SVG images become PNG, and M4A / FLAC / WebM sounds become WAV.
Mesh 6.00 and later (2023 onwards) can't be converted; export those from Studio as `.obj`.

The engine asks for content as `localhost:4015/asset/?id=N` (and sometimes roblox.com asset URLs); rblx.js
sends those to `wb-asset/?id=N` (engine patch 17), and the service worker answers from IndexedDB, or with a
404. The game page lists the ids that were missing so the player knows which files to add.

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

Later fixes (10 to 17) are listed in `patch_engine.py` too: steadier shift lock, DataStores, the web
services answered by `../webapi.js`, typed symbols and capital letters, speed (the debug build's heap
checks), smoother frames, and 17: images, meshes and sounds coming from the files uploaded with a place
(`wb-asset/?id=N`, see "Images, meshes and sounds" above).

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

### Game scripts in multiplayer

Every player runs their own copy of the world, so a game's scripts can't just change a part and have
everyone see it. They can talk to each other's games through `ReplicatedStorage.WebBlox` instead:

```lua
local WB = game:GetService("ReplicatedStorage"):WaitForChild("WebBlox")
WB.Send:Fire("tagged", targetId)                    -- a message for everyone else in the server
WB.Message.Event:connect(function(topic, data, fromId, fromName) ... end)
WB.SetShared:Fire("round", "3")                     -- a value the whole server shares
WB.Shared:WaitForChild("round").Changed:connect(...) -- (StringValues; "" removes one)
print(WB.MyId.Value)                                 -- your player id ("solo" offline)
```

Topics and keys are letters, digits, `_ . -` (up to 32); message data is text up to 400 characters,
shared values up to 200. Other players' avatars, and your own character, carry a `GNPlayerId`
StringValue, so a touch can be matched to the player it belongs to. The hub keeps the last 100 messages
and every shared value (up to 256), so players who join later get the values; sync lines `G|`, `V|`
and `H|` carry them (same in `multiplayer-server`).

## Phone and tablet controls

The 2016 engine only listens for a keyboard and a mouse. On touch screens (or with `?touch=1`),
`../touch.js` draws 2016-style mobile controls and turns touches into those events: the thumbstick presses
W A S D, the arrow button is Space, dragging is a right-button mouse drag (the camera), a tap is a click,
press-and-hold then drag is a left-button drag, pinching is the mouse wheel, and the chat button opens the
phone's keyboard and types into the game's chat.

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
