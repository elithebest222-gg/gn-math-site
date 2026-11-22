self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const mpChan = new BroadcastChannel("webblox-mp");
const pending = new Map();
const apiChan = new BroadcastChannel("gnblox-api");
const apiPending = new Map();
apiChan.onmessage = (e) => {
  const { id, reply, type } = e.data || {};
  const resolve = apiPending.get(id);
  if (resolve) {
    apiPending.delete(id);
    resolve(reply, type);
  }
};
const swId = Math.random().toString(36).slice(2, 8);
let reqSeq = 0;

mpChan.onmessage = (e) => {
  const { id, reply } = e.data || {};
  const resolve = pending.get(id);
  if (resolve) {
    pending.delete(id);
    resolve(reply);
  }
};

function addHeaders(headers) {
  const h = new Headers(headers);
  if (!h.has("Cross-Origin-Opener-Policy"))
    h.set("Cross-Origin-Opener-Policy", "same-origin");
  if (!h.has("Cross-Origin-Embedder-Policy"))
    h.set("Cross-Origin-Embedder-Policy", "require-corp");
  if (!h.has("Cross-Origin-Resource-Policy"))
    h.set("Cross-Origin-Resource-Policy", "cross-origin");
  return h;
}

let assetDb = null;
function openAssets() {
  if (!assetDb) assetDb = new Promise((resolve) => {
    try {
      const req = indexedDB.open("webblox", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("files");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { assetDb = null; resolve(null); };
    } catch (err) { assetDb = null; resolve(null); }
  });
  return assetDb;
}
const assetChan = new BroadcastChannel("gnblox-assets");
async function serveAsset(url) {
  const id = (new URL(url).searchParams.get("id") || "").replace(/[^0-9]/g, "");
  let rec = null;
  if (id) {
    const db = await openAssets();
    if (db) rec = await new Promise((resolve) => {
      try {
        const get = db.transaction("files").objectStore("files").get("asset:" + id);
        get.onsuccess = () => resolve(get.result || null);
        get.onerror = () => resolve(null);
      } catch (err) { resolve(null); }
    });
  }
  if (!rec || !rec.bytes) {
    // the Catalog's faces and clothes (catalog/assets/<id>.png): avatars wear them, and uploaded
    // games that use the same classic faces and clothes get them too
    // (and the meshes of its hats and hair, catalog/assets/<id>.mesh)
    if (id) {
      for (const [ext, type] of [["png", "image/png"], ["mesh", "application/octet-stream"]]) {
        try {
          const r = await fetch(new URL("catalog/assets/" + id + "." + ext, self.registration.scope));
          if (r.ok) return new Response(await r.arrayBuffer(), { status: 200, headers: addHeaders({ "Content-Type": type, "Cache-Control": "max-age=86400" }) });
        } catch (err) {}
      }
    }
    try { assetChan.postMessage({ missing: id }); } catch (err) {}
    return new Response("", { status: 404, headers: addHeaders({ "Content-Type": "text/plain", "Cache-Control": "no-store" }) });
  }
  return new Response(rec.bytes, { status: 200, headers: addHeaders({ "Content-Type": rec.type || "application/octet-stream", "Cache-Control": "no-store" }) });
}

self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  if (!url.startsWith(self.location.origin)) return;

  // Multiplayer: the game's sync requests (scripts/WebBloxPlayers.lua -> /peer-sync/<sid>/sync?...)
  // are answered by the play page that owns <sid> (p2p.js), which talks to the other players
  // over PeerJS. Nothing goes to the network.
  if (url.includes("/peer-sync/")) {
    e.respondWith(
      new Promise((resolve) => {
        const id = swId + "-" + ++reqSeq;
        const headers = addHeaders({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve(new Response("busy\n", { status: 503, headers }));
        }, 2000);
        pending.set(id, (reply) => {
          clearTimeout(timer);
          resolve(new Response(String(reply || ""), { status: 200, headers }));
        });
        mpChan.postMessage({ id, url });
      })
    );
    return;
  }

  // The game's images, meshes and sounds (rblx.js sends rbxassetid://N and .../asset/?id=N here as
  // wb-asset/?id=N): the ones uploaded with the place (assets.js keeps them in IndexedDB as asset:N).
  // A missing one is a 404, and the page hears about it (it tells the player what's missing).
  if (url.includes("/wb-asset/")) {
    e.respondWith(serveAsset(url));
    return;
  }

  // The engine's Roblox web API requests (rblx.js sends them to wb-api/...): DataStores, game
  // passes, groups... answered by the game page (webapi.js).
  if (url.includes("/wb-api/")) {
    e.respondWith(
      e.request.text().catch(() => "").then((body) => new Promise((resolve) => {
        const id = swId + "-a" + ++reqSeq;
        const timer = setTimeout(() => {
          apiPending.delete(id);
          resolve(new Response("", { status: 200, headers: addHeaders({ "Content-Type": "text/plain" }) }));
        }, 4000);
        apiPending.set(id, (reply, type) => {
          clearTimeout(timer);
          resolve(new Response(String(reply == null ? "" : reply), { status: 200, headers: addHeaders({ "Content-Type": (type || "text/plain") + "; charset=utf-8", "Cache-Control": "no-store" }) }));
        });
        apiChan.postMessage({ id, url, method: e.request.method, body });
      }))
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const headers = addHeaders(resp.headers);
        return new Response(resp.body, {
          status: resp.status,
          statusText: resp.statusText,
          headers,
        });
      })
      .catch(() => fetch(e.request))
  );
});
