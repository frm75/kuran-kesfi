import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

/**
 * Ortam yapilandirmasi.
 *
 * Hicbir port kodda sabit yazilmaz; hepsi .env'den gelir (plan 21.1).
 * .env yoksa script calismaz — sessizce varsayilana dusmez.
 */

/**
 * Repo koku.
 *
 * Goreli ".." sayisi paketin nereye derlendigine bagli oldugu icin sabit
 * yazilmaz; pnpm-workspace.yaml bulunana kadar yukari cikilir.
 */
function findRepoRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("Repo koku bulunamadi: pnpm-workspace.yaml hicbir ust dizinde yok");
}

export const repoRoot = findRepoRoot();

const envPath = resolve(repoRoot, ".env");
if (!existsSync(envPath)) {
  throw new Error(
    `.env bulunamadi: ${envPath}\n` +
      "Once '.env.example' dosyasini '.env' olarak kopyalayip duzenleyin (chmod 600).",
  );
}
loadDotenv({ path: envPath, quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`.env icinde ${name} tanimli degil`);
  }
  return value;
}

/** Tanimsizsa veya bossa null — cagiran taraf eksikligi kendi yorumlar. */
function optional(name: string): string | null {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? null : value.trim();
}

function requiredInt(name: string): number {
  const raw = required(name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`.env icinde ${name} pozitif tam sayi olmali, bulunan: ${raw}`);
  }
  return value;
}


/**
 * Cloudflare R2 yapilandirmasi.
 *
 * Bes alanin BIRI eksikse baglanmayi denemeyiz: yarim yapilandirmayla gelen
 * hata mesaji (403 / NoSuchBucket) hangi alanin eksik oldugunu gizler.
 * Onun yerine eksik alan adlari sayilir, cagiran taraf kullaniciya soyler.
 */
function readR2():
  | { readonly configured: false; readonly missing: readonly string[] }
  | {
      readonly configured: true;
      readonly accountId: string;
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
      readonly bucket: string;
      readonly publicHost: string;
      readonly endpoint: string;
      readonly publicBase: string;
    } {
  const names = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_HOST",
  ] as const;
  const missing = names.filter((n) => optional(n) === null);
  if (missing.length > 0) return { configured: false, missing };

  const accountId = required("R2_ACCOUNT_ID");
  const publicHost = required("R2_PUBLIC_HOST").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return {
    configured: true,
    accountId,
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    bucket: required("R2_BUCKET"),
    publicHost,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    publicBase: `https://${publicHost}`,
  };
}

export const env = {
  db: {
    host: required("DB_HOST"),
    port: requiredInt("DB_PORT"),
    database: required("DB_NAME"),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
  },
  /** Yapay sleep yok; es zamanlilik p-limit ile sinirlanir (plan 20.1) */
  concurrency: requiredInt("IMPORT_CONCURRENCY"),
  cacheDir: resolve(repoRoot, process.env["CACHE_DIR"] ?? "cache"),
  reportsDir: resolve(repoRoot, "reports"),
  /**
   * Kaldirma talebi kanallari — plan 23.4.
   *
   * ZORUNLU DEGIL, cunku site bugun hoca notu yayinlamiyor ve diger
   * scriptlerin bunlara ihtiyaci yok. Ama K2 "iletisim yolu sayfada
   * yazilidir" diyor: ikisi de bos oldugu surece `import_notes` hicbir notu
   * `published` yazmaz, `reviewed`e dusurur ve sebebini rapora yazar.
   *
   * Boylece kapi bir insanin hatirlamasina degil, yapilandirmaya bagli.
   */
  contact: {
    takedownEmail: optional("TAKEDOWN_EMAIL"),
    repoUrl: optional("REPO_URL"),
  },
  /**
   * Cloudflare R2 — agir medya (ses, video) ve harita altligi (PMTiles).
   *
   * CLAUDE.md kural 5 "harici API'ye uretimde bagimlilik yok" diyordu; bu
   * kural 2026-09-05'te daraltildi: site HTML/CSS build'i hala internet
   * gerektirmez ve R2 dusse sayfa metni, meal, ayet ve statik SVG harita
   * calismaya devam eder. Bozulan yalnizca medyadir.
   *
   * ZORUNLU DEGIL: yalnizca `pnpm media:r2*` komutlari ister. Eksikse build
   * durmaz.
   */
  r2: readR2(),
} as const;
