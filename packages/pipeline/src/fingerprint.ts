import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { repoRoot } from "./env.js";

/**
 * data/** parmak izi — "veritabani bayat mi?" sorusunun cevabi.
 *
 * `data/` elle yazilan tek kaynak, PostgreSQL ondan TURETILEN kopya. Aradaki
 * kopru `pnpm content:import`; unutulursa build eski veritabanindan uretir ve
 * `data/` altindaki degisiklik yayina hic cikmaz — hata yok, uyari yok.
 *
 * Ice aktarma bitince bu parmak izini veritabanina yazar (`import_state`),
 * linter build'den once yeniden hesaplayip karsilastirir. Tutmuyorsa build
 * durur.
 */

/**
 * `scripts/import/content.ts`'in okudugu dizinler. Baska betiklerin okudugu
 * dizinler (scripture, recitation, geo, images) burada YOK: onlar degisince
 * content:import'un yeniden calismasi gerekmez, yanlis alarm olurdu.
 */
export const CONTENT_DIRS = [
  "concepts",
  "locations",
  "media",
  "principle_areas",
  "principles",
  "sections",
  "sources",
  "stories",
  "timeline",
] as const;

/** import_state tablosundaki anahtar. */
export const CONTENT_FINGERPRINT_KEY = "content_fingerprint";

/**
 * Tablo semada (infra/db) degil burada: bir satirlik durum kaydi, icerik
 * degil. IF NOT EXISTS ile hem ice aktarma hem linter guvenle cagirabilir.
 */
export const IMPORT_STATE_DDL = `
  CREATE TABLE IF NOT EXISTS import_state (
    key        text PRIMARY KEY,
    value      text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Icerik dizinlerindeki her dosyanin yolu + icerigi uzerinden sha256.
 * Sirali ve goreli yollarla: ayni icerik her makinede ayni izi verir.
 */
export function contentFingerprint(): string {
  const dataRoot = resolve(repoRoot, "data");
  const hash = createHash("sha256");
  for (const dir of CONTENT_DIRS) {
    const full = join(dataRoot, dir);
    if (!existsSync(full)) continue;
    for (const file of walk(full).sort()) {
      hash.update(relative(dataRoot, file));
      hash.update("\0");
      hash.update(readFileSync(file));
      hash.update("\0");
    }
  }
  return hash.digest("hex");
}
