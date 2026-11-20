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
