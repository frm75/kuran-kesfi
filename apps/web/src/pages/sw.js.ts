import type { APIRoute } from "astro";
import { varlikYollari } from "../lib/ibadet/sw-varlik.js";

/**
 * Kapsam kararı: SW "/" kapsamında kaydedilir (sw-kaydet.ts), yani tüm siteyi
 * denetler. Bilinçli: önceden okunmuş ayet/sure sayfalarının çevrimdışı
 * açılması bunu gerektirir. SW sayfa JS'i değildir; "içerik sayfalarında 0 bayt
 * JS" kuralı sayfa betiklerini kapsar. Web'de SW yalnızca /ibadet sayfalarından
 * kaydedilir; Android uygulamasında enjekte edilen zamanla.js onu her sayfadan
 * kaydeder.
 *
 * Service worker — /ibadet için çevrimdışı önbellek.
 *
 * Build anında dist/sw.js olarak üretilir (build.format "file"). SURUM build
 * zaman damgasıdır. Üç önbellek:
 *   kk-ibadet-kabuk-<SURUM>  /ibadet sayfaları + sehirler.json. Sürüme bağlı;
 *                            `activate` eski sürümlerinkini siler.
 *   kk-ibadet-varlik         /_astro/, /fonts/, /brand/. Sürümden BAĞIMSIZ:
 *                            /_astro adları içeriğe bağlıdır (değişmez), yeni
 *                            yayında silinmez. `install`, kabuk HTML'lerinden
 *                            ve onların JS/CSS'inden (import, url()) bu yolları
 *                            çıkarıp önbelleğe alır; kabuk sayfaları çevrimdışı
 *                            betik ve stiliyle açılır.
 *   kk-ibadet-calisma        SW kaydından sonra gezilen HER same-origin sayfa
 *                            (ayet/sure dahil, 200 yanıtlar) ve /data/,
 *                            /ibadet/ alt kaynakları. Sürümden bağımsız.
 * Çalışma ve varlık önbellekleri ayrı ayrı 300 girdiyle sınırlıdır (en eski
 * silinir); güncel kabuğun varlıkları kırpılmaz.
 *
 * Dokunulmayanlar: GET dışı istekler, başka köken (medya.kurankesfi.tr dahil),
 * /api/ (iletişim formu).
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
const KABUK = "kk-ibadet-kabuk-" + SURUM;
const VARLIK = "kk-ibadet-varlik";
const CALISMA = "kk-ibadet-calisma";
const ONBELLEK_LISTESI = ${JSON.stringify(ONBELLEK_LISTESI)};
const SINIR = 300;
const AG_ZAMAN_ASIMI = 4000;
const varlikYollari = ${String(varlikYollari)};

function varlikMi(yol) {
  return yol.startsWith("/_astro/") || yol.startsWith("/fonts/") || yol.startsWith("/brand/");
}

// Kabuk HTML'lerinden başlayıp JS/CSS içindeki başvuruları izleyerek kabuğun
// tüm varlık yollarını toplar. getirsin: önbellekte olmayanı (ve adı içeriğe
// bağlı olmayan /fonts/, /brand/ dosyalarını her seferinde) ağdan alıp
// VARLIK'a yazar; ağ hatasında hata fırlatır (install başarısız olur, eski SW
// çalışmaya devam eder), 200 dışı yanıtı atlar. getirsin=false yalnız
// önbellekten okur.
async function kabukVarliklari(getirsin) {
  const kabuk = await caches.open(KABUK);
  const varlik = await caches.open(VARLIK);
  const sira = [];
  for (const yol of ONBELLEK_LISTESI) {
    if (yol.endsWith(".json")) continue;
    const y = await kabuk.match(yol);
    if (y) sira.push(...varlikYollari(await y.text(), yol));
  }
  const gorulen = new Set();
  while (sira.length > 0) {
    const yol = sira.shift();
    if (gorulen.has(yol)) continue;
    gorulen.add(yol);
    let y = await varlik.match(yol);
    if (getirsin && (!y || !yol.startsWith("/_astro/"))) {
      // Ağ hatası fırlatır (install yeniden denenir). 200 dışı yanıt atlanır:
      // yanlış çıkarılmış tek bir yol SW güncellemesini kalıcı olarak kilitlemesin.
      const ag = await fetch(yol, { cache: "no-cache" });
      if (ag.status !== 200) continue;
      await varlik.put(yol, ag.clone());
      y = ag;
    }
    if (y && /\\.(?:js|css)$/.test(yol)) sira.push(...varlikYollari(await y.text(), yol));
  }
  return gorulen;
}

let korunanVarlik = null;
function korunanVarliklar() {
  if (korunanVarlik === null) {
    korunanVarlik = kabukVarliklari(false)
      .then((s) => new Set([...s].map((y) => new URL(y, self.location.origin).href)))
      .catch(() => new Set());
  }
  return korunanVarlik;
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(KABUK)
      .then((c) => c.addAll(ONBELLEK_LISTESI))
      .then(() => kabukVarliklari(true))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  const kalan = new Set([KABUK, VARLIK, CALISMA]);
  e.waitUntil(
    caches
      .keys()
      .then((adlar) =>
        Promise.all(adlar.filter((a) => a.startsWith("kk-ibadet-") && !kalan.has(a)).map((a) => caches.delete(a))),
      )
      .then(() => caches.open(VARLIK).then((c) => kirp(c, VARLIK)))
      .then(() => self.clients.claim()),
  );
});

// Girdileri SINIR ile sınırla: en eski girdiler (ekleme sırası) silinir.
// VARLIK'ta güncel kabuğun varlıkları korunur.
async function kirp(c, ad) {
  const korunan = ad === VARLIK ? await korunanVarliklar() : new Set();
  const anahtarlar = (await c.keys()).filter((r) => !korunan.has(r.url));
  for (const r of anahtarlar.slice(0, Math.max(0, anahtarlar.length - SINIR))) await c.delete(r);
}

// Ağdan getirir ve 200 yanıtı önbelleğe yazar. e.waitUntil, olay hâlâ AKTİFKEN
// (respondWith henüz sonuçlanmadan, eşzamanlı) çağrılır; 4 sn zaman aşımı
// kazanıp yanıt verilse bile yazma tamamlanır. Sonradan çağrılsaydı
// InvalidStateError verirdi.
function getir(e, istek, ad) {
  let yazma = Promise.resolve();
  const ag = fetch(istek).then((y) => {
    if (y.status === 200) {
      const kopya = y.clone();
      yazma = caches
        .open(ad)
        .then((c) => c.put(istek, kopya).then(() => kirp(c, ad)))
        .catch(() => {});
    }
    return y;
  });
  e.waitUntil(ag.then(() => yazma, () => {}));
  return ag;
}

// Önce güncel kabuk (yeni yayının /ibadet kopyası), sonra diğer önbellekler.
async function eslesen(istek) {
  const k = await caches.open(KABUK).then((c) => c.match(istek));
  return k || caches.match(istek);
}

// Önbellekte kopya varsa ağı 4 sn yarıştır, yoksa ağı bekle.
async function agOnbellek(e, istek, yedek) {
  const ag = getir(e, istek, CALISMA);
  const kopya = await eslesen(istek);
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
      agOnbellek(e, istek, () => eslesen("/ibadet").then((a) => a || Response.error())),
    );
    return;
  }

  if (varlikMi(yol)) {
    // Adı içeriğe bağlı ya da sabit: önce önbellek.
    e.respondWith(
      caches.match(istek).then((c) => c || getir(e, istek, VARLIK)),
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
