import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * MapLibre isci dosyasini public/ altina kopyalar.
 *
 * ============================================================================
 * NEDEN GEREKLI — sessiz bir hataydi
 * ============================================================================
 *
 * maplibre-gl v6 isci dosyasinin adresini CALISMA ANINDA kuruyor:
 *
 *   let t = import.meta.url.endsWith("-dev.mjs") ? "...-dev.mjs" : "maplibre-gl-worker.mjs";
 *   return new URL(t, import.meta.url)
 *
 * Dosya adi bir degisken oldugu icin Vite/Rollup bunu goremiyor ve isciyi
 * cikti dizinine HIC koymuyor. Sonuc: build basarili, sayfa 200 donuyor,
 * harita aciliyor ama BOS kaliyor; konsolda yalnizca ERR_FAILED var.
 * 2026-09-05'te tam olarak bu yasandi ve headless testte yakalandi.
 *
 * Cozum: isciyi kurulu paketten alip kendi sunucumuzdan servis etmek ve
 * adresini `setWorkerUrl` ile ACIKCA soylemek (components/HaritaCanli.astro).
 * Boylece adres kod icinde gorunur, CSP `worker-src 'self'` ile eslesir ve
 * paketleyicinin davranisina bagli kalmaz.
 *
 * Hedef `/_maplibre/` — `/harita` altina konmuyor, cunku `/harita` bir SAYFA
 * adresidir ve nginx `try_files $uri $uri.html` ile ikisi karisabilir.
 *
 * Dosya public/ altinda ama git'e girmez (.gitignore): kaynagi
 * node_modules'dur, surumu pnpm-lock.yaml belirler. Iki yerde tutulmaz.
 */

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

// package.json "exports" ana giris tanimlamiyor; paketin kokunu
// package.json uzerinden buluyoruz (exports icinde o var).
const pkg = require.resolve("maplibre-gl/package.json");
const dist = resolve(dirname(pkg), "dist");
const targetDir = resolve(here, "../public/_maplibre");

/**
 * IKI dosya, cunku isci tek basina calismiyor:
 * `maplibre-gl-worker.mjs` ilk satirinda `./maplibre-gl-shared.mjs`
 * iceri aliyor. Yalniz isciyi kopyalamak 404 verir ve harita yine
 * sessizce bos kalir.
 *
 * BILINEN MALIYET: `maplibre-gl-shared.mjs` (480 KB ham, ~130 KB gzip)
 * ana pakette de var — Astro maplibre'yi tek parcaya derliyor. Yani ayni
 * mantik iki kez iniyor. Paketleyiciyi isciyi dogru cikarmaya zorlamak
 * maplibre'nin ic yapisina bagimli bir cozum olurdu; bu kopya ise
 * maplibre'nin kendi onerdigi "dist'i oldugu gibi servis et" yontemi.
 * Maliyet yalniz harita sayfasinda ve bir yil onbellekli.
 */
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(targetDir, { recursive: true });
for (const file of files) {
  copyFileSync(resolve(dist, file), resolve(targetDir, file));
}
console.log(`[harita] isci dosyalari kopyalandi: ${files.join(", ")} -> ${targetDir}`);

/**
 * DUNYA KARA SILUETI — kure projeksiyonu icin.
 *
 * Altligimiz yalniz 5,3-72,48 kutusunu kapsiyor. Mercator'da bu gorunmuyordu;
 * kureye gecince uzaklasinca gezegenin geri kalani BOS cikti — harita bozuk
 * gibi duruyordu. Natural Earth 1:110m kara cokgenleri (134 KB, kamu mali)
 * o boslugu dolduruyor.
 *
 * Dosya zaten repoda: statik SVG harita da build zamaninda ayni veriden
 * ciziliyor (pages/harita.astro). Ikinci bir kopya tutulmuyor, buraya
 * kopyalaniyor; public/geo git'e girmez.
 */
const geoSrc = resolve(here, "../../../data/geo/ne_110m_land.geojson");
const geoDir = resolve(here, "../public/geo");
mkdirSync(geoDir, { recursive: true });
copyFileSync(geoSrc, resolve(geoDir, "ne_110m_land.geojson"));
console.log(`[harita] dunya silueti kopyalandi -> ${geoDir}`);
