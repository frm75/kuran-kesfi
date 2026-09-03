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

function requiredInt(name: string): number {
  const raw = required(name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`.env icinde ${name} pozitif tam sayi olmali, bulunan: ${raw}`);
  }
  return value;
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
} as const;
