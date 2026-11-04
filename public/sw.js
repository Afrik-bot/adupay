// AduPay service worker: installable app + offline viewing of key screens.
// - Static assets (hashed by Next, icons, fonts): cache first.
// - Key screens (home, tontines, savings, Payer pour, profile, notifications):
//   network first with a short timeout, the last good copy when offline.
// - Everything else (API, admin, auth, server actions, non-GET) is never cached.
// Signing out deletes the screens cache, so the next person on a shared phone sees nothing.
const VERSION = "v1";
const STATIC = `adupay-static-${VERSION}`;
const PAGES = "adupay-pages"; // name shared with the sign-out button
const OFFLINE_URL = "/hors-ligne";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/brand/adupay-mark.svg"];
const KEY_SCREENS = [/^\/$/, /^\/accueil$/, /^\/tontines(\/[0-9a-f-]{36})?$/, /^\/epargne$/, /^\/payer-pour$/, /^\/profil$/, /^\/notifications$/];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("adupay-static-") && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-pages") event.waitUntil(caches.delete(PAGES));
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/") || url.pathname.startsWith("/__nextjs_font/");

function cacheable(response) {
  return response && response.ok && response.type === "basic" && !response.redirected;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) (await caches.open(STATIC)).put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS)),
    ]);
    // Only a real page, not a redirect to sign-in, replaces the saved copy.
    if (cacheable(response)) cache.put(request.url.split("?")[0], response.clone());
    return response;
  } catch {
    const saved = await cache.match(request.url.split("?")[0]);
    return saved || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function offlineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isStatic(url)) return event.respondWith(cacheFirst(request));
  if (request.mode !== "navigate") return; // RSC fetches, API calls: straight to the network
  if (KEY_SCREENS.some((re) => re.test(url.pathname))) return event.respondWith(networkFirst(request));
  event.respondWith(offlineFallback(request));
});
