import type { APIRoute } from "astro";

/**
 * Kapsam kararı: SW "/" kapsamında kaydedilir (sw-kaydet.ts), yani tüm siteyi
 * denetler. Bilinçli: önceden okunmuş ayet/sure sayfalarının çevrimdışı
 * açılması bunu gerektirir. SW sayfa JS'i değildir; "içerik sayfalarında 0 bayt
 * JS" kuralı sayfa betiklerini kapsar, ve SW yalnızca /ibadet sayfalarında
 * kaydedilir.
 *
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
const SINIR = 300;
const AG_ZAMAN_ASIMI = 4000;

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

// Çalışma anı girdilerini SINIR ile sınırla: ön önbellek girdileri korunur,
// en eski çalışma anı girdileri (ekleme sırası) silinir.
async function kirp(c) {
  const korunan = new Set(ONBELLEK_LISTESI.map((y) => new URL(y, self.location.origin).href));
  const anahtarlar = (await c.keys()).filter((r) => !korunan.has(r.url));
  for (const r of anahtarlar.slice(0, Math.max(0, anahtarlar.length - SINIR))) await c.delete(r);
}

function yaz(istek, yanit) {
  if (yanit && yanit.status === 200) {
    const kopya = yanit.clone();
    caches
      .open(AD)
      .then((c) => c.put(istek, kopya).then(() => kirp(c)))
      .catch(() => {});
  }
  return yanit;
}

function agOnce(istek, zamanAsimi) {
  const ag = fetch(istek).then((y) => yaz(istek, y));
  if (!zamanAsimi) return ag;
  return Promise.race([
    ag,
    new Promise((_, red) => setTimeout(() => red(new Error("zaman asimi")), zamanAsimi)),
  ]);
}

self.addEventListener("fetch", (e) => {
  const istek = e.request;
  if (istek.method !== "GET") return;
  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;
  const yol = url.pathname;
  if (yol.startsWith("/api/")) return;

  if (istek.mode === "navigate") {
    // Ağ öncelikli (4 sn), sonra önbellek, sonra /ibadet.
    e.respondWith(
      agOnce(istek, AG_ZAMAN_ASIMI).catch(() =>
        caches.match(istek).then((c) => c || caches.match("/ibadet").then((a) => a || Response.error())),
      ),
    );
    return;
  }

  if (yol.startsWith("/_astro/") || yol.startsWith("/fonts/") || yol.startsWith("/brand/")) {
    // Adı içeriğe bağlı ya da sabit: önce önbellek.
    e.respondWith(caches.match(istek).then((c) => c || agOnce(istek)));
    return;
  }

  if (yol.startsWith("/data/") || yol.startsWith("/ibadet/")) {
    // Ağ öncelikli: çevrimiçi kullanıcı hep taze ve tutarlı veri alır.
    e.respondWith(agOnce(istek).catch(() => caches.match(istek).then((c) => c || Response.error())));
  }
});
`;

export const GET: APIRoute = () =>
  new Response(SW, { headers: { "Content-Type": "text/javascript; charset=utf-8" } });
