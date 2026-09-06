import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { info, fail, repoRoot, warn } from "@kuran/pipeline";

/**
 * 3D arazi icin yukselti karelerini indirir (AWS Terrain Tiles, terrarium).
 *
 * ============================================================================
 * NEDEN ESRI DEGIL
 * ============================================================================
 *
 * Esri Elevation servisi yalnizca NOKTA sorgusu sunuyor (`at-point`), kare
 * yayinlamiyor — olculdu, `elevation-3d/v1/tiles` 404. MapLibre'nin 3D arazisi
 * ise `raster-dem` kaynagi ister: Terrain-RGB ya da Terrarium bicimli PNG kare.
 * Bu yuzden yukselti VERISI iki ayri yerden geliyor ve ikisi de dogru yerde:
 *   nokta yuksekligi (26 konum)  -> Esri, scripts/import/elevation.ts
 *   arazi kabartmasi (harita)    -> AWS Terrain Tiles, bu script
 *
 * ============================================================================
 * NEDEN R2'YE AYNALANIYOR
 * ============================================================================
 *
 * Kareler dogrudan AWS'den de cekilebilirdi. Aynalamanin uc sebebi var:
 *   1. CLAUDE.md kural 5 — ucuncu taraf uretim bagimliligi eklemiyoruz.
 *   2. Kullanicinin IP'si AWS'ye gitmiyor; site "takipsiz" kaliyor.
 *   3. Veri seti bir gun kapanirsa ya da adres degisirse harita dusmuyor.
 *
 * ============================================================================
 * NEDEN PMTILES DEGIL, DUZ PNG
 * ============================================================================
 *
 * Altlik PMTiles tek dosya olarak duruyor ve Cloudflare onu CACHELEYEMIYOR:
 * ucretsiz planlarda 512 MB ustu dosya cachelenmez, arsiv 2,37 GB
 * (olculdu, cf-cache-status: DYNAMIC). Arazi kareleri ise 34-112 KB'lik
 * PNG'ler ve `.png` Cloudflare'in VARSAYILAN cacheledigi uzantilardan —
 * yani her kare kenarda tutulur, R2'ye tekrar gidilmez.
 *
 * ============================================================================
 * NEDEN z9'DA DURUYOR
 * ============================================================================
 *
 * Kare sayisi her seviyede dortleniyor:
 *   z0-9  =  9.721 kare  ~680 MB
 *   z0-10 = 38.180 kare  ~2,7 GB   (altlikla birlikte kotanin yarisi)
 * MapLibre eksik seviyeleri ustten olcekliyor (overzoom); z9'da cozunurluk
 * ~270 m/piksel, Sina ve Hicr'in kabartmasi icin yeterli. Daha ilerisi
 * gorsel olarak az sey katip depolamayi dortluyor.
 *
 * ============================================================================
 * KULLANIM
 * ============================================================================
 *
 *   pnpm media:terrain            eksik kareleri indirir (var olanlari atlar)
 *   pnpm media:terrain --max-zoom 8
 *
 * Sonra `pnpm media:r2:push` ile R2'ye cikar.
 */

/** Altligin kutusuyla AYNI — bkz. apps/web/src/lib/harita/style.ts TILE_BOUNDS. */
const BBOX = { w: 5, s: 3, e: 72, n: 48 };

const SOURCE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const outRoot = resolve(repoRoot, "media/tiles/terrain");

const zArg = process.argv.indexOf("--max-zoom");
const MAX_ZOOM = zArg === -1 ? 9 : Number(process.argv[zArg + 1]);
if (!Number.isInteger(MAX_ZOOM) || MAX_ZOOM < 0 || MAX_ZOOM > 12) {
  fail("--max-zoom 0-12 arasi tam sayi olmali");
}

/** Es zamanli indirme. Yapay sleep yok (CLAUDE.md veri kurallari). */
const CONCURRENCY = 16;

function xTile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function yTile(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

interface Tile {
  z: number;
  x: number;
  y: number;
}

const queue: Tile[] = [];
for (let z = 0; z <= MAX_ZOOM; z += 1) {
  const x0 = xTile(BBOX.w, z);
  const x1 = xTile(BBOX.e, z);
  const y0 = yTile(BBOX.n, z);
  const y1 = yTile(BBOX.s, z);
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) queue.push({ z, x, y });
  }
}
info(`${String(queue.length)} kare (z0-${String(MAX_ZOOM)}), bbox ${BBOX.w},${BBOX.s} - ${BBOX.e},${BBOX.n}`);

let indirilen = 0;
let atlanan = 0;
let hatali = 0;
let bayt = 0;
let sirada = 0;

function human(b: number): string {
  const u = ["B", "KB", "MB", "GB"];
  let v = b;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

async function worker(): Promise<void> {
  for (;;) {
    const idx = sirada;
    sirada += 1;
    const t = queue[idx];
    if (t === undefined) return;

    const out = resolve(outRoot, String(t.z), String(t.x), `${String(t.y)}.png`);
    if (existsSync(out) && statSync(out).size > 0) {
      atlanan += 1;
      bayt += statSync(out).size;
      continue;
    }
    try {
      const res = await fetch(`${SOURCE}/${String(t.z)}/${String(t.x)}/${String(t.y)}.png`);
      if (!res.ok) {
        // Kutunun kenarinda var olmayan kare olabilir; sessiz gecmiyoruz.
        warn(`HTTP ${String(res.status)} — ${String(t.z)}/${String(t.x)}/${String(t.y)}`);
        hatali += 1;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, buf);
      indirilen += 1;
      bayt += buf.byteLength;
      if (indirilen % 500 === 0) {
        info(`${String(indirilen)} indirildi · ${human(bayt)} · sira ${String(idx)}/${String(queue.length)}`);
      }
    } catch (e) {
      warn(`${String(t.z)}/${String(t.x)}/${String(t.y)}: ${e instanceof Error ? e.message : "bilinmeyen"}`);
      hatali += 1;
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

info(`${String(indirilen)} indirildi · ${String(atlanan)} zaten vardi · ${String(hatali)} hatali`);
info(`toplam ${human(bayt)} — ${outRoot}`);
if (hatali > 0) warn("Hatali kareler icin scripti tekrar calistir; var olanlar atlanir.");
