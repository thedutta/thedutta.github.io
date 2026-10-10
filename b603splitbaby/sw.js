/* ============================================================
   Splitbaby service worker

   This file has to live in the flat's own folder: GitHub Pages
   cannot send a Service-Worker-Allowed header, so a worker
   under /splitbaby/ could never claim scope over this path.

   It caches the app shell only. Ledger data is Firestore's job
   — its own persistent cache already handles offline reads and
   queues writes, and a second cache in front of it would only
   serve stale money.

   Bump CACHE_VERSION on any shell change.
   ============================================================ */

const CACHE_VERSION = "splitbaby-b603-v1";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "../assets/theme.css",
  "../assets/fonts/geist-300.woff2",
  "../assets/fonts/geist-400.woff2",
  "../assets/fonts/geist-500.woff2",
  "../assets/fonts/geist-600.woff2",
  "../assets/fonts/geist-700.woff2",
  "../assets/bg/bg-800.webp",
  "../assets/bg/bg-800.jpg",
  "../splitbaby/app.css",
  "../splitbaby/app.js",
  "../splitbaby/config.js",
  "../splitbaby/ledger.js",
  "../splitbaby/graph.js",
  "../splitbaby/data.js",
  "../splitbaby/ui-glue.js",
  "../splitbaby/firebase-config.js",
  "../splitbaby/icons/b603-192.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      /* one missing file must not abort the whole install, or a
         single renamed asset would leave the app uninstallable */
      Promise.all(SHELL.map((url) =>
        cache.add(new Request(url, { cache: "reload" }))
          .catch((e) => console.warn("[sw] skipped", url, e))
      ))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION && k.startsWith("splitbaby-b603"))
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* Firestore and the Firebase SDK go straight to the network:
     the SDK manages its own offline cache, and a stale balance
     is worse than no balance. */
  if (url.origin !== self.location.origin) return;

  /* Navigations: network first, so a deploy is picked up on the
     next online load, with the cached shell as the fallback. */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  /* Everything else: serve from cache instantly, refresh behind. */
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || network;
    })
  );
});
