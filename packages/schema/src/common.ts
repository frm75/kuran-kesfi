import { z } from "zod";

/**
 * Ortak yapi taslari.
 *
 * Isimlendirme (CLAUDE.md, plan 20.2):
 *   - Bu semalar TypeScript'tir, bu yuzden alan adlari camelCase'dir.
 *   - PostgreSQL tablolarinda ayni alanlar snake_case olur; donusum import
 *     katmaninda yapilir (scripts/import).
 *   - Elle hazirlanan JSON dosyalari (data/**) bu semalarla dogrulandigi icin
 *     onlar da camelCase kullanir. Dosya ADLARI alt cizgilidir: verse_2_153.json.
 */

/** Veritabani birincil anahtari (PostgreSQL serial). */
export const dbId = z.number().int().positive();
export type DbId = z.infer<typeof dbId>;

/** URL slug'i: tire ayirici, kucuk harf ASCII (plan 20.2). */
export const slug = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug kebab-case olmali: ornek 'hz-yusuf'");
export type Slug = z.infer<typeof slug>;

/** Bos olmayan, kirpilmis metin. */
export const nonEmptyText = z.string().trim().min(1);

/**
 * Guven derecesi (plan 12.9).
 *
 * Konum, nuzul sirasi, tarihsel olay, kissa kronolojisi ve iliski kayitlarinda
 * ayni uc degerli sistem kullanilir.
 *
 * NOT: Plan 12.5, verse_relation icin ucuncu degeri "olasi" olarak yaziyor;
 * plan 12.9 ise sistemi "kesin | muhtemel | rivayet" olarak genelliyor. Burada
 * 12.9 esas alindi. Plan 12.5'teki yazim duzeltilmelidir.
 */
export const confidence = z.enum(["kesin", "muhtemel", "rivayet"]);
export type Confidence = z.infer<typeof confidence>;

/**
 * Ayet referansi — elle hazirlanan JSON dosyalarinda kullanilir.
 *
 * Veritabaninda hicbir tablo ayet numarasini metin olarak saklamaz; her sey
 * verse_id ile baglanir (plan 20.1). Bu tip yalnizca data/** girdilerinin
 * insan tarafindan yazilabilmesi icindir; referans linter bunlari verse_id'ye
 * cozer ve cozulmeyen referansta build'i basarisiz kilar.
 *
 * Bicim: "2:153" (tek ayet) veya "12:4-6" (aralik).
 */
export const verseRef = z
  .string()
  .regex(/^\d{1,3}:\d{1,3}(?:-\d{1,3})?$/, "ayet referansi '2:153' veya '12:4-6' biciminde olmali");
export type VerseRef = z.infer<typeof verseRef>;

/** Ayrisitirilmis ayet referansi. */
export interface ParsedVerseRef {
  surahNumber: number;
  verseStart: number;
  verseEnd: number;
}

/** "12:4-6" -> { surahNumber: 12, verseStart: 4, verseEnd: 6 } */
export function parseVerseRef(ref: VerseRef): ParsedVerseRef {
  const [surahPart, versePart] = ref.split(":");
  const [startPart, endPart] = (versePart ?? "").split("-");
  const surahNumber = Number(surahPart);
  const verseStart = Number(startPart);
  const verseEnd = endPart === undefined ? verseStart : Number(endPart);
  return { surahNumber, verseStart, verseEnd };
}

/** Ayet anahtari — tarayici tarafinda (IndexedDB) ve URL'de kullanilir: "2:153". */
export const verseKey = z
  .string()
  .regex(/^\d{1,3}:\d{1,3}$/, "ayet anahtari '2:153' biciminde olmali");
export type VerseKey = z.infer<typeof verseKey>;

/** ISO 8601 zaman damgasi. */
export const isoTimestamp = z.iso.datetime({ offset: true });

/** Kesif agindaki dugum turleri (plan 12.2, 12.8, 12.8a). */
export const discoveryNodeType = z.enum([
  "verse",
  "surah",
  "story",
  "concept",
  "root",
  "location",
  "principle",
  "timeline_event",
]);
export type DiscoveryNodeType = z.infer<typeof discoveryNodeType>;
