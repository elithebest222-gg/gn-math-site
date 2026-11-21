self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const mpChan = new BroadcastChannel("webblox-mp");
const pending = new Map();
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

  // Intercept Lua HttpGet sync calls from the game worker thread
  if (url.includes("/peer-sync")) {
    e.respondWith(
      new Promise((resolve) => {
        const id = ++reqSeq;
        const u = new URL(url);
        const out = u.searchParams.get("d") || "";
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve(new Response("0|", { status: 200, headers: addHeaders() }));
        }, 400);

        pending.set(id, (reply) => {
          clearTimeout(timer);
          resolve(new Response(reply || "0|", { status: 200, headers: addHeaders() }));
        });

        mpChan.postMessage({ id, out });
      })
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
