import type { APIRoute } from "astro";

/**
 * Service worker — yalnızca /ibadet için çevrimdışı önbellek.
 *
 * Build anında dist/sw.js olarak üretilir (build.format "file"). SURUM build
 * zaman damgasıdır: her yayında önbellek adı değişir, `activate` eskileri siler.
 *
 * Dokunulmayanlar: GET dışı istekler, başka köken (medya.kurankesfi.tr dahil),
 * /api/ (iletişim formu). Ayet/sure sayfaları da önbelleğe alınmaz; yalnızca
 * /ibadet gezintileri ve /_astro/, /ibadet/, /data/ varlıkları.
 */
const SURUM = String(Date.now());

const ONBELLEK_LISTESI = [
  "/ibadet",
  "/ibadet/imsakiye",
  "/ibadet/kible",
  "/ibadet/takvim",
  "/ibadet/zikirmatik",
  "/ibadet/ayarlar",
  "/ibadet/sehirler.json",
];

const SW = `const SURUM = ${JSON.stringify(SURUM)};
const AD = "kk-ibadet-" + SURUM;
const ONBELLEK_LISTESI = ${JSON.stringify(ONBELLEK_LISTESI)};

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(AD).then((c) => c.addAll(ONBELLEK_LISTESI)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((adlar) =>
        Promise.all(adlar.filter((a) => a.startsWith("kk-ibadet-") && a !== AD).map((a) => caches.delete(a))),
      )
      .then(() => self.clients.claim()),
  );
});

function yaz(istek, yanit) {
  if (yanit && yanit.ok) {
    const kopya = yanit.clone();
    caches.open(AD).then((c) => c.put(istek, kopya));
  }
  return yanit;
}

self.addEventListener("fetch", (e) => {
  const istek = e.request;
  if (istek.method !== "GET") return;
  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;
  const yol = url.pathname;
  if (yol.startsWith("/api/")) return;

  if (istek.mode === "navigate") {
    // Yalnızca /ibadet gezintileri; diğer sayfalar tarayıcıya kalır.
    if (yol !== "/ibadet" && !yol.startsWith("/ibadet/")) return;
    e.respondWith(
      fetch(istek)
        .then((y) => yaz(istek, y))
        .catch(() =>
          caches.match(istek).then((c) => c || caches.match("/ibadet").then((a) => a || Response.error())),
        ),
    );
    return;
  }

  if (yol.startsWith("/_astro/") || yol.startsWith("/data/") || yol.startsWith("/ibadet/")) {
    // Önce önbellek, arkada güncelle.
    e.respondWith(
      caches.match(istek).then((c) => {
        const ag = fetch(istek).then((y) => yaz(istek, y));
        if (c) {
          ag.catch(() => {});
          return c;
        }
        return ag;
      }),
    );
  }
});
`;

export const GET: APIRoute = () =>
  new Response(SW, { headers: { "Content-Type": "text/javascript; charset=utf-8" } });
