import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_DIR } from "~/lib/data-dir";
import type { Reciter, StaticRecitation } from "@kuran/schema";
import { MEDIA_BASE } from "~/lib/media";

/**
 * Arapça kıraat — okuma katmanı (plan §2.4, Faz 4).
 *
 * ## Oynatma JavaScript istemiyor
 *
 * Kayıt ayet başına ayrı bir MP3; dosya adı ayetin kendisi ("002255.mp3").
 * Bu yüzden ayet sayfasına `<audio controls src="…">` koymak yetiyor —
 * zaman damgası, oynatıcı kodu, kütüphane yok. Ayet sayfalarındaki
 * `default-src 'none'` CSP'si değişmedi; `media-src` zaten
 * medya.kurankesfi.tr'ye açıktı (medya katmanı, 2026-09-06).
 *
 * ## Dosya gerçekten var mı
 *
 * `missingVerses` indirme sonrası ÖLÇÜLEREK yazılır (bkz. `fetch_recitation.ts`).
 * O listedeki ayetlerde oynatıcı hiç basılmaz: çalmayan bir oynatıcı
 * göstermek sessiz kırılmadır.
 */

function readJsonOrNull<T>(relativePath: string): T | null {
  const path = resolve(DATA_DIR, relativePath);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function once<T>(load: () => T): () => T {
  let value: { result: T } | undefined;
  return () => {
    value ??= { result: load() };
    return value.result;
  };
}

export const getReciters = once(
  (): Reciter[] => readJsonOrNull<StaticRecitation>("recitation.json")?.reciters ?? [],
);

const missingByReciter = once((): Map<string, Set<string>> => {
  return new Map(getReciters().map((r) => [r.slug, new Set(r.missingVerses)]));
});

export interface VerseAudio {
  reciter: Reciter;
  /** Tam adres: https://medya.kurankesfi.tr/ses/alafasy/002255.mp3 */
  url: string;
}

/** "002255" — kaynağın (everyayah) dosya adı biçimi, indirirken de kullanıldı. */
function audioKey(surahId: number, verseNumber: number): string {
  return `${String(surahId).padStart(3, "0")}${String(verseNumber).padStart(3, "0")}`;
}

/** Bu ayetin dosyası duran kârîler. Hiçbiri yoksa boş dizi. */
export function getVerseAudio(surahId: number, verseNumber: number): VerseAudio[] {
  const key = `${String(surahId)}:${String(verseNumber)}`;
  const result: VerseAudio[] = [];
  for (const reciter of getReciters()) {
    if (missingByReciter().get(reciter.slug)?.has(key) === true) continue;
    result.push({
      reciter,
      url: `${MEDIA_BASE}/${reciter.basePath}/${audioKey(surahId, verseNumber)}.mp3`,
    });
  }
  return result;
}

export const STYLE_LABEL: Record<Reciter["style"], string> = {
  murattal: "murattal — ölçülü tempo",
  mucevved: "mücevved — makamlı",
};
