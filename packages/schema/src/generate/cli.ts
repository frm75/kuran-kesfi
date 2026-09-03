import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generatePostgres } from "./to-postgres.js";
import { generateSqlite } from "./to-sqlite.js";

/**
 * Migration ureticisi CLI — GOREV 02.
 *
 *   pnpm schema:generate          her iki migration'i uretir
 *   pnpm schema:generate --check  uretilen cikti diskteki ile ayni mi (CI)
 *
 * --check modu, birinin SQL'i elle duzenlemesini yakalar.
 */

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const outputs = [
  { path: resolve(packageRoot, "migrations/postgres/001_init.sql"), content: generatePostgres() },
  { path: resolve(packageRoot, "migrations/sqlite/001_init.sql"), content: generateSqlite() },
] as const;

const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  const problems: string[] = [];
  for (const { path, content } of outputs) {
    if (!existsSync(path)) {
      problems.push(`${path} yok — 'pnpm schema:generate' calistirin`);
      continue;
    }
    if (readFileSync(path, "utf8") !== content) {
      problems.push(`${path} uretilen ciktiyla ayni degil — elle duzenlenmis olabilir`);
    }
  }
  if (problems.length > 0) {
    console.error("Migration --check basarisiz:");
    for (const p of problems) console.error(`  x ${p}`);
    process.exit(1);
  }
  console.log("Migration --check temiz: uretilen cikti diskteki ile ayni.");
} else {
  for (const { path, content } of outputs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
    const lines = content.split("\n").length;
    console.log(`yazildi: ${path} (${lines} satir)`);
  }
}
