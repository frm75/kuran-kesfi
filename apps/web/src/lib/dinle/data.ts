import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { StaticSurahSegments } from "@kuran/schema";
import { DATA_DIR } from "~/lib/data-dir";

/**
 * Kelime zaman damgasi — build sirasinda okunur, sayfaya GOMULUR.
 *
 * Sure basina ortalama 4,2 KB (en buyuk 36,5 KB, Bakara). Agdan cekilseydi
 * `connect-src` acilacakti; gomulu geldigi icin /dinle sayfasinin CSP'sinde
 * yalniz `script-src 'self'` var, baglanti hakki yok.
 *
 * Dosyanin tamami donuyor (yalniz `reciters` degil): Plan 05 ayni dosyaya
 * `meals` alanini ekleyecek ve cagiran taraf degismeyecek.
 *
 * Bu dosya YALNIZ build sirasinda calisir (node:fs). Tarayiciya giden mantik
 * `timeline.ts` icindedir.
 */
export function getSurahSegments(surahId: number): StaticSurahSegments | null {
  const path = resolve(DATA_DIR, `ses/segment_${String(surahId)}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as StaticSurahSegments;
}
