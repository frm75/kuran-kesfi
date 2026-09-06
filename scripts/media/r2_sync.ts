import { createHash } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import {
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { env, fail, info, repoRoot, warn } from "@kuran/pipeline";

/**
 * Cloudflare R2 senkronizasyonu — agir medya ve harita altligi.
 *
 * ============================================================================
 * NEDEN R2, NEDEN SUNUCU DEGIL
 * ============================================================================
 *
 * Ses, video ve PMTiles harita altligi git'e de release dizinine de girmez.
 * Release dizinine girse her `pnpm run deploy` gigabaytlari kopyalardi
 * (yayin atomik: dist_new -> mv). Sunucu diskinde dursa 30 GB'lik bos alanin
 * onemli bolumunu yerdi ve yedekleme sorunu olurdu.
 *
 * R2'nin belirleyici ozelligi EGRESS UCRETSIZ: video ve tile trafigi normal
 * object storage'da faturanin tamamini olusturur. Ucretsiz kota 10 GB
 * depolama + 1M Class A + 10M Class B islem.
 *
 * ============================================================================
 * NEDEN KENDI ALAN ADIMIZ
 * ============================================================================
 *
 * Erisim `medya.kurankesfi.tr` uzerinden; `pub-*.r2.dev` kullanilmaz.
 * Uc sebep: r2.dev rate-limitli ve uretim icin degil; Cloudflare cache
 * devreye girer ve cache hit Class B saymaz (PMTiles range istekleri icin
 * ciddi fark); saglayici degisimi tek DNS kaydina iner, kod degismez.
 * S3 uyumlu API oldugu icin bucket bir gun baska saglayiciya tasinabilir.
 *
 * ============================================================================
 * FIGUR KAPISI KALDIRILDI (2026-09-06)
 * ============================================================================
 *
 * Bu script gorsel bir dosyayi `media/FIGUR_TARAMASI.json` icinde ayni sha256
 * ile bulamazsa HICBIR SEY yuklemiyordu. Kapinin dayanagi plan 20.3'un
 * "figur yok" yasagiydi; kullanici o yasagi 2026-09-06'da kaldirdi ve kural
 * yalnizca PEYGAMBER YUZUNE indi. Yuz, hash ile denetlenemez — kapinin
 * otomatiklestirebilecegi bir sey kalmadi.
 *
 * SONUC: tarama artik koda degil INSANA bagli. Yeni medyayi yayina almadan
 * once kare kare bakmak yukleyenin isi; bu script hatirlatmiyor.
 * Alisknligin gerekcesi duruyor: 2026-09-05'te sahne notuna guvenilip kareye
 * bakilmamisti ve hatali kesim yayina cikmisti.
 *
 * ============================================================================
 * KULLANIM
 * ============================================================================
 *
 *   pnpm media:r2:check           baglanti + bucket ozeti (anahtar basilmaz)
 *   pnpm media:r2:list [onek]     uzaktaki nesneler
 *   pnpm media:r2:push [--dry-run]  media/ -> R2 (degismeyenler atlanir)
 *
 * Yerel hazirlik alani: repo kokunde `media/` (git'e girmez). Dizin yapisi
 * uzak anahtarla birebir aynidir: media/ses/x.m4a -> ses/x.m4a
 */

// --- sabitler ----------------------------------------------------------------

const stagingDir = resolve(repoRoot, "media");

const CONTENT_TYPE: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".pmtiles": "application/octet-stream",
  ".pbf": "application/x-protobuf",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
};

/**
 * PMTiles ara sira yeniden uretilir ve ADI DEGISMEZ — sonsuz immutable
 * verilirse eski altlik aylarca cachede kalir. Digerleri icerik degisince
 * yeni adla gelir, o yuzden bir yil immutable.
 */
function cacheControl(ext: string): string {
  return ext === ".pmtiles"
    ? "public, max-age=604800"
    : "public, max-age=31536000, immutable";
}

/** 8 MB ustu tek parca PUT riskli; lib-storage cok parcali yukler. */
const PART_SIZE = 8 * 1024 * 1024;

// --- yardimcilar -------------------------------------------------------------

function sha256File(path: string): Promise<string> {
  return new Promise((ok, err) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("error", err)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => ok(hash.digest("hex")));
  });
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function human(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function r2OrFail() {
  const { r2 } = env;
  if (!r2.configured) {
    fail(
      `.env icinde R2 yapilandirmasi eksik: ${r2.missing.join(", ")}\n` +
        "Nereden alinacagi .env.example icinde yazili (R2 bolumu).",
    );
  }
  return r2;
}

function client(r2: ReturnType<typeof r2OrFail>): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: r2.endpoint,
    credentials: {
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
    },
  });
}

// --- komutlar ----------------------------------------------------------------

async function check(): Promise<void> {
  const r2 = r2OrFail();
  const s3 = client(r2);

  info(`bucket    ${r2.bucket}`);
  info(`endpoint  ${r2.endpoint}`);
  info(`genel     ${r2.publicBase}`);

  try {
    await s3.send(new HeadBucketCommand({ Bucket: r2.bucket }));
  } catch (error) {
    // Anahtarin kendisi ASLA basilmaz; yalnizca hata adi ve HTTP kodu.
    const name = error instanceof Error ? error.name : "Bilinmeyen";
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode;
    fail(
      `Bucket'a erisilemedi (${name}${status ? ` / HTTP ${status}` : ""}).\n` +
        "403 ise: token izni 'Object Read & Write' mi, bu bucket'a kisitli mi?\n" +
        "404 ise: R2_BUCKET adi panelde yazilanla ayni mi?",
    );
  }
  info("baglanti  TAMAM");

  let count = 0;
  let bytes = 0;
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: r2.bucket, ContinuationToken: token }),
    );
    for (const obj of page.Contents ?? []) {
      count += 1;
      bytes += obj.Size ?? 0;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  info(`icerik    ${count} nesne, ${human(bytes)}`);
  if (bytes > 10 * 1024 ** 3) {
    warn("10 GB ucretsiz kota asildi — depolama ucretlendirilir ($0,015/GB-ay).");
  }
}

async function list(prefix: string | undefined): Promise<void> {
  const r2 = r2OrFail();
  const s3 = client(r2);
  let token: string | undefined;
  let count = 0;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: r2.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      count += 1;
      console.log(`${human(obj.Size ?? 0).padStart(8)}  ${obj.Key ?? ""}`);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  info(`${count} nesne${prefix ? ` (onek: ${prefix})` : ""}`);
}

async function push(dryRun: boolean): Promise<void> {
  const r2 = r2OrFail();
  if (!existsSync(stagingDir)) {
    fail(
      `Hazirlik dizini yok: ${stagingDir}\n` +
        "Yuklenecek dosyalar repo kokundeki media/ altina konur; dizin yapisi " +
        "uzak anahtarla birebir aynidir.",
    );
  }

  const files = await walk(stagingDir);
  if (files.length === 0) fail(`${stagingDir} bos — yuklenecek dosya yok.`);

  const s3 = client(r2);

  // sha256 tek seferde hesaplanir: hem degisiklik tespiti hem nesne
  // ustverisi ayni degeri kullanir (ETag cok parcali yuklemede MD5 degil).
  const hashes = new Map<string, string>();
  for (const file of files) {
    hashes.set(file, await sha256File(file));
  }

  // --- degismeyenleri atla --------------------------------------------------
  let uploaded = 0;
  let skipped = 0;
  let bytes = 0;

  for (const file of files) {
    const key = relative(stagingDir, file).split(sep).join("/");
    const hash = hashes.get(file) as string;
    const size = statSync(file).size;
    const ext = extname(file).toLowerCase();

    let remoteHash: string | undefined;
    try {
      const head = await s3.send(
        new HeadObjectCommand({ Bucket: r2.bucket, Key: key }),
      );
      remoteHash = head.Metadata?.["sha256"];
    } catch {
      // yok — yuklenecek
    }

    if (remoteHash === hash) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      info(`[deneme] ${key}  ${human(size)}`);
      uploaded += 1;
      bytes += size;
      continue;
    }

    const upload = new Upload({
      client: s3,
      partSize: PART_SIZE,
      params: {
        Bucket: r2.bucket,
        Key: key,
        Body: createReadStream(file),
        ContentType: CONTENT_TYPE[ext] ?? "application/octet-stream",
        CacheControl: cacheControl(ext),
        // ETag cok parcali yuklemede "-N" ekiyle gelir ve MD5 olmaz;
        // degisiklik tespiti bu yuzden ETag'e degil sha256'ya bakar.
        Metadata: { sha256: hash },
      },
    });
    await upload.done();
    uploaded += 1;
    bytes += size;
    info(`${key}  ${human(size)}  ${r2.publicBase}/${key}`);
  }

  info(
    `${dryRun ? "[deneme] " : ""}${uploaded} yuklendi (${human(bytes)}), ` +
      `${skipped} degismedigi icin atlandi.`,
  );
}

// --- giris -------------------------------------------------------------------

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "check":
    await check();
    break;
  case "list":
    await list(rest[0]);
    break;
  case "push":
    await push(rest.includes("--dry-run"));
    break;
  default:
    fail(
      "Kullanim: tsx r2_sync.ts <check|list|push>\n" +
        "  check            baglanti ve bucket ozeti\n" +
        "  list [onek]      uzaktaki nesneler\n" +
        "  push [--dry-run] media/ dizinini yukler",
    );
}
