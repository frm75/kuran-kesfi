import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { isHostableLicense, mediaFile } from "@kuran/schema";
import type { MediaLicense } from "@kuran/schema";
import { Report, fail, info, repoRoot, warn } from "@kuran/pipeline";

/**
 * Gercek gorselleri indirir ve web surumunu uretir.
 *
 * ============================================================================
 * LISANS KAPISI — INDIRME KARARINI KOD VERIR
 * ============================================================================
 *
 * Yalnizca `isHostableLicense` gecen kayitlar indirilir (spec 34):
 * PUBLIC_DOMAIN, CC0, CC_BY, CC_BY_SA, CC_BY_NC. COPYRIGHT / LINK_ONLY /
 * UNKNOWN lisansli kayit ATLANIR ve `localPath` null kalir — o kartlar
 * yalnizca "Kaynagi goruntule" baglantisi gosterir.
 *
 * Karar bir insanin dikkatine birakilmadi: sema, veritabani ve linter ayni
 * kurali zaten uyguluyor, bu script de indirmeden once bakiyor. Dorduncu kez
 * bakmak fazla degil — indirme geri alinamayan taraf, dosya bir kez sunucuya
 * kopyalandiginda kural ihlali yayina cikmis olur.
 *
 * ============================================================================
 * NEDEN OLCEK KUCULTULUYOR
 * ============================================================================
 *
 * Cudi panoramasi 13319x2760. Kartta en fazla ~600 px genislikte gosteriliyor;
 * aslini servis etmek her acilista megabaytlar tasimak olurdu. En uzun kenar
 * MAX_EDGE'e indiriliyor ve WebP'ye ceviriliyor.
 *
 * Kaydedilen `width`/`height` SERVIS EDILEN dosyanin olculeridir, kaynagin
 * degil. Kart bu degerlerle yer ayiriyor; kaynagin olcusu yazilsaydi sayfa
 * yuklenirken zipliyordu.
 *
 * ============================================================================
 * LISANS OLCEKLE DEGISMEZ
 * ============================================================================
 *
 * Kucultulmus kopya kaynagin lisansini tasimaya devam eder; atif ve lisans
 * baglantisi kartta gosterilir (`copyright`, `licenseUrl`). Gorseller
 * `data/` agacinin CC BY-NC-SA'sina DAHIL DEGILDIR — her biri kendi lisansini
 * korur. Bu ayrim `data/media/LICENSE.md` icinde yazili.
 *
 * ============================================================================
 * KULLANIM
 * ============================================================================
 *
 *   pnpm media:fetch              eksikleri indirir
 *   pnpm media:fetch --force      hepsini yeniden indirir
 *   pnpm media:fetch --dry-run    ne indirilecegini yazar, indirmez
 *
 * Sonra:  pnpm media:r2:push  ·  pnpm content:import  ·  pnpm build
 */

/** En uzun kenar. Kart 600 px; 2x ekran ve buyutme payi icin 2000. */
const MAX_EDGE = 2000;
const WEBP_QUALITY = 82;

const mediaDataDir = resolve(repoRoot, "data/media");
const outDir = resolve(repoRoot, "media/gorsel");

const args = process.argv.slice(2);
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");

interface MediaItem {
  id: string;
  title: string;
  license: MediaLicense;
  originalUrl: string | null;
  localPath: string | null;
  width: number | null;
  height: number | null;
  [k: string]: unknown;
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "user-agent": "kurankesfi.tr import (https://kurankesfi.tr)" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`HTTP ${String(response.status)} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

const report = new Report("media_fetch");
let fetched = 0;
let skippedLicense = 0;
let skippedExisting = 0;
let failed = 0;
let totalBytes = 0;

if (!dryRun) mkdirSync(outDir, { recursive: true });

const files = readdirSync(mediaDataDir)
  .filter((f) => f.startsWith("media_") && f.endsWith(".json"))
  .sort();
if (files.length === 0) fail("data/media/ altinda media_*.json yok");

for (const file of files) {
  const path = join(mediaDataDir, file);
  const doc = JSON.parse(readFileSync(path, "utf8")) as {
    "//"?: string[];
    place: string | null;
    note: string | null;
    items: MediaItem[];
  };

  for (const item of doc.items) {
    // 1. Lisans kapisi (spec 34)
    if (!isHostableLicense(item.license)) {
      skippedLicense += 1;
      report.note(`${item.id}: ${item.license} — indirilmedi, yalnizca baglanti`);
      continue;
    }

    const target = join(outDir, `${item.id}.webp`);
    if (!force && item.localPath !== null && existsSync(target)) {
      skippedExisting += 1;
      continue;
    }

    if (item.originalUrl === null) {
      report.issue(`${item.id}: originalUrl yok — once 'pnpm data:wikimedia' calistirin`);
      failed += 1;
      continue;
    }

    if (dryRun) {
      info(`${item.id.padEnd(34)} ${item.license.padEnd(14)} indirilecek`);
      fetched += 1;
      continue;
    }

    try {
      const raw = await download(item.originalUrl);
      const image = sharp(raw, { limitInputPixels: 500_000_000 });
      const meta = await image.metadata();

      /*
       * `withoutEnlargement`: kaynak MAX_EDGE'den kucukse buyutulmez.
       * es-Suveydani kuyusu 638x478 — buyutmek yalnizca bulanik piksel uretir.
       */
      const output = await image
        /*
         * ARGUMANSIZ `.rotate()` = EXIF Orientation'a gore dondur.
         *
         * sharp bunu KENDILIGINDEN YAPMAZ ve atlanirsa hata vermez, sessizce
         * yatik dosya uretir. Uhud panoramasi boyle yakalandi (2026-09-06):
         * kaynak 9856x2304 yatay, EXIF'i "sola dondur" diyor; rotate olmadan
         * 2304x9856 dikey ve 90 derece yatik cikti. Kaynak varliga bakmadan
         * fark edilmezdi — sayfa hata vermiyor, yalnizca yanlis gorunuyordu.
         */
        .rotate()
        .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });

      writeFileSync(target, output.data);

      item.localPath = `gorsel/${item.id}.webp`;
      item.width = output.info.width;
      item.height = output.info.height;

      fetched += 1;
      totalBytes += output.data.length;
      const kb = Math.round(output.data.length / 1024);
      info(
        `${item.id.padEnd(34)} ${item.license.padEnd(14)} ` +
          `${String(meta.width ?? "?")}x${String(meta.height ?? "?")} → ` +
          `${String(output.info.width)}x${String(output.info.height)}  ${String(kb)} KB`,
      );
      report.note(
        `${item.id}: ${item.license} · ${String(output.info.width)}x${String(output.info.height)} · ` +
          `${String(kb)} KB · sha256 ${createHash("sha256").update(output.data).digest("hex").slice(0, 16)}`,
      );
    } catch (error) {
      failed += 1;
      report.issue(`${item.id}: indirilemedi — ${String(error)}`);
    }
  }

  if (!dryRun) {
    /*
     * Sema dogrulamasi YAZMADAN once: lisans kapisi burada da isler. Kisitli
     * lisansli bir kayda localPath yazilmis olsaydi dosya diske yazilmis olur
     * ama veri dosyasi bozulmadan durur ve hata gorunur olurdu.
     */
    const parsed = mediaFile.safeParse(doc);
    if (!parsed.success) {
      fail(`${file} sema dogrulamasindan gecmedi:\n${JSON.stringify(parsed.error.issues, null, 2)}`);
    }
    writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", "utf8");
  }
}

const mb = (totalBytes / 1024 / 1024).toFixed(1);
info(
  `${String(fetched)} indirildi (${mb} MB) · ${String(skippedExisting)} zaten var · ` +
    `${String(skippedLicense)} lisans nedeniyle atlandi · ${String(failed)} basarisiz`,
);
if (!dryRun) {
  const onDisk = existsSync(outDir)
    ? readdirSync(outDir).reduce((n, f) => n + statSync(join(outDir, f)).size, 0)
    : 0;
  info(`${outDir}: ${(onDisk / 1024 / 1024).toFixed(1)} MB`);
  info(`rapor: ${report.write()}`);
  info("sirada: pnpm media:r2:push · pnpm content:import · pnpm build");
}
if (failed > 0) warn(`${String(failed)} kayit indirilemedi; localPath null kaldi, kart baglanti gosterir.`);
