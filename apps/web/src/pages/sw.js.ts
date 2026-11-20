import type { APIRoute } from "astro";

/**
 * Kapsam kararı: SW "/" kapsamında kaydedilir (sw-kaydet.ts), yani tüm siteyi
 * denetler. Bilinçli: önceden okunmuş ayet/sure sayfalarının çevrimdışı
 * açılması bunu gerektirir. SW sayfa JS'i değildir; "içerik sayfalarında 0 bayt
 * JS" kuralı sayfa betiklerini kapsar, ve SW yalnızca /ibadet sayfalarında
 * kaydedilir.
 *
 * Service worker — /ibadet için çevrimdışı önbellek.
 *
 * Build anında dist/sw.js olarak üretilir (build.format "file"). SURUM build
 * zaman damgasıdır: her yayında önbellek adı değişir, `activate` eskileri siler.
 *
 * Dokunulmayanlar: GET dışı istekler, başka köken (medya.kurankesfi.tr dahil),
 * /api/ (iletişim formu).
 *
 * Önbelleğe alınanlar: /ibadet sayfaları + sehirler.json (ön önbellek) ve
 * SW kaydından sonra gezilen HER same-origin sayfa (ayet/sure dahil, 200
 * yanıtlar), ayrıca /_astro/, /fonts/, /brand/, /data/, /ibadet/ varlıkları.
 * Çalışma anı girdileri 300 ile sınırlıdır.
 *
 * Ağ kuralı: önbellekte kopya VARSA ağ 4 sn ile yarıştırılır (yavaş ağda eski
 * kopya verilir); kopya YOKSA ağ beklenir; ağ reddedilirse (çevrimdışı) gezintilerde /ibadet
 * verilir, /data/ ve /ibadet/ alt kaynaklarında Response.error() döner.
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

// Ağdan getirir ve 200 yanıtı önbelleğe yazar. e.waitUntil, olay hâlâ AKTİFKEN
// (respondWith henüz sonuçlanmadan, eşzamanlı) çağrılır; 4 sn zaman aşımı
// kazanıp yanıt verilse bile yazma tamamlanır. Sonradan çağrılsaydı
// InvalidStateError verirdi.
function getir(e, istek) {
  let yazma = Promise.resolve();
  const ag = fetch(istek).then((y) => {
    if (y.status === 200) {
      const kopya = y.clone();
      yazma = caches
        .open(AD)
        .then((c) => c.put(istek, kopya).then(() => kirp(c)))
        .catch(() => {});
    }
    return y;
  });
  e.waitUntil(ag.then(() => yazma, () => {}));
  return ag;
}

// Önbellekte kopya varsa ağı 4 sn yarıştır, yoksa ağı bekle.
async function agOnbellek(e, istek, yedek) {
  const ag = getir(e, istek);
  const kopya = await caches.match(istek);
  if (!kopya) return ag.catch(() => yedek());
  ag.catch(() => {});
  return Promise.race([
    ag,
    new Promise((coz) => setTimeout(() => coz(kopya), AG_ZAMAN_ASIMI)),
  ]).catch(() => kopya);
}

self.addEventListener("fetch", (e) => {
  const istek = e.request;
  if (istek.method !== "GET") return;
  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;
  const yol = url.pathname;
  if (yol.startsWith("/api/")) return;

  if (istek.mode === "navigate") {
    e.respondWith(
      agOnbellek(e, istek, () => caches.match("/ibadet").then((a) => a || Response.error())),
    );
    return;
  }

  if (yol.startsWith("/_astro/") || yol.startsWith("/fonts/") || yol.startsWith("/brand/")) {
    // Adı içeriğe bağlı ya da sabit: önce önbellek.
    e.respondWith(
      caches.match(istek).then((c) => c || getir(e, istek)),
    );
    return;
  }

  if (yol.startsWith("/data/") || yol.startsWith("/ibadet/")) {
    e.respondWith(agOnbellek(e, istek, () => Response.error()));
  }
});
`;

export const GET: APIRoute = () =>
  new Response(SW, { headers: { "Content-Type": "text/javascript; charset=utf-8" } });
