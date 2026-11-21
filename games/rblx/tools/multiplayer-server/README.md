# WebBlox multiplayer server (optional)

**You don't need this.** WebBlox multiplayer works peer-to-peer over PeerJS with nothing to host
(see `../README.md`, *Multiplayer*). This server is an alternative for sites that would rather relay
everything through a server of their own: set `multiplayerServer` in `games/rblx/config.js` and the
games use it instead of peer-to-peer.

Lets players in the same game see each other. Each player's game sends its avatar's position, animation,
outfit and (in private servers) chat to this server a few times a second and gets everyone else's back.

**What it is:** "lite" multiplayer. You see other players walk, jump, emote and chat, but every player's
world runs on their own computer, so NPCs, rounds, disasters and items aren't shared. Real Roblox-style
multiplayer isn't possible with this engine build. Its networking library (RakNet) is missing the code
that sends game data once players are connected (the compiler removed it because of a bug in the
source). Only the engine's developers can fix that by rebuilding it.

**Public vs private servers:**
- Every game has one public server that anyone on the site joins automatically. Public servers have
  no chat, because anyone can be in them.
- Players with the same invite code (`play.html?...&room=CODE`) are in a private server together, with
  chat. The game page's **Servers** tab makes these links.

## Put it online

The site is static (GitHub Pages), so the server has to run somewhere else, for example Render's free plan:

1. Make an account at https://render.com and click **New → Web Service**.
2. Connect your GitHub account and pick the `gn-math-site` repository.
3. Fill in:
   - **Root Directory:** `games/rblx/tools/multiplayer-server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
4. Click **Create Web Service** and wait for it to say *Live*. Copy its address, something like
   `https://webblox-multiplayer.onrender.com`. Opening that address should show
   "WebBlox multiplayer server is running."
5. In this repo, open `games/rblx/config.js` and paste the address:
   ```js
   multiplayerServer: 'https://webblox-multiplayer.onrender.com'
   ```
   Commit that change. After GitHub Pages updates, games show "Online: N other players" in the
   bottom-left corner.

Render's free servers fall asleep after 15 minutes with nobody playing. The first player after that
waits about a minute ("Multiplayer: waking up the server...") while it starts. Everything else keeps
working in the meantime.

Any host that runs Node 18+ and gives you an `https://` address works the same way (it reads the port
from `PORT`).

## Run it locally

```bash
node server.js            # port 8080; PORT=9000 node server.js for another port
```

Then open a game with `&server=http://localhost:8080` added to its `play.html` address.
