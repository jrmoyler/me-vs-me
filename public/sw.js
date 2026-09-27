// Service worker for the installed game. The build replaces PRECACHE with the page, the
// bundled script and stylesheet, the manifest and the icons, and VERSION with a build hash,
// so a new deploy installs a fresh cache and drops the old one.
const VERSION = "dev";
const PRECACHE = ["/", "/manifest.webmanifest"];
const SHELL = `mvm-shell-${VERSION}`;
const ART = "mvm-art"; // fighter sheets and arenas, kept across deploys and filled as they load

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("mvm-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Art is looked up by path alone, so the same sheet is shared by every page that asks for it.
async function fromCache(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Pages: the network first so a deploy shows up at once, the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(SHELL).then((cache) => cache.put("/", response.clone()));
          return response;
        })
        .catch(() => caches.match("/", { ignoreSearch: true })),
    );
    return;
  }
  if (url.pathname.startsWith("/assets/characters/") || url.pathname.startsWith("/assets/arenas/") || url.pathname.startsWith("/assets/originals/")) {
    event.respondWith(fromCache(ART, request));
    return;
  }
  // Hashed bundles and icons never change under the same name.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) event.respondWith(fromCache(SHELL, request));
});
