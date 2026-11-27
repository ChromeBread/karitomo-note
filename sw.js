// Offline cache. Bump VERSION on every release so old files are replaced.
const VERSION = "karitomo-1.0.0";
const FILES = [
  "./", "index.html", "css/app.css", "manifest.json", "icon.svg",
  "js/app.js", "js/sim.js", "js/sim-worker.js", "js/unlock.js", "js/kana.js", "js/rank.js", "js/charms.js", "js/share.js", "js/spec.js", "js/spec-en.js", "js/calc.js", "js/dmgcalc.js", "js/i18n.js", "js/plan.js", "js/debug.js", "js/advice.js", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
  "data/skills.json", "data/decos.json", "data/armor.json", "data/monsters.json", "data/maps.json",
  "data/quests.json", "data/items.json", "data/readings.json", "data/weapons.json", "data/maplayouts.json", "data/mix.json", "data/monnotes.json", "data/carry.json", "data/carryroutes.json", "data/skilldetails.json", "data/huntarts.json", "data/clients.json", "data/shop.json", "data/nyanter.json", "data/meals.json", "data/questcond.json", "data/arena.json", "data/gather.json", "data/breaks.json", "data/presets.json", "data/hazards.json", "data/crowns.json", "data/randomq.json", "data/hikyo.json", "data/jponly.json", "data/skilldetails_en.json", "data/en.json", "i18n/en.json",
];

// scripts are requested as "js/x.js?v=<version>", so save them under that name (no duplicate copies)
const V = VERSION.split("-")[1];
const saved = (f) => (f.startsWith("js/") ? `${f}?v=${V}` : f);
self.addEventListener("install", (e) => {
  // add files one by one so a missing optional file does not break the install
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(FILES.map((f) => c.add(new Request(saved(f), { cache: "reload" })).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// network first (fresh data when online), cache when offline. On a weak signal, wait at most
// 4 s for the network when a cached copy exists, then show the cached one.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // no-cache: revalidate with the server so a release is picked up right away (304 when unchanged)
  const net = fetch(e.request, { cache: "no-cache" }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  });
  const cached = () => caches.match(e.request, { ignoreSearch: true });
  const slow = new Promise((r) => setTimeout(r, 4000)).then(cached).then((c) => c || net);
  e.respondWith(Promise.race([net, slow]).catch(() => cached()));
});
