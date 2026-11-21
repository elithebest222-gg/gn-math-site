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
