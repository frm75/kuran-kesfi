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
 * KONUM guven derecesi (plan 12.9, 2026-09-06'da dorde cikarildi).
 *
 * NEDEN AYRI ENUM: scholar-notes.ts'in bastaki notu "UC AYRI confidence
 * enum'u vardir, ASLA birlestirilmez" diyor ve gerekcesi burada da gecerli.
 * Paylasilan `confidence` konumun YANINDA kronolojiyi de (nuzul sirasi,
 * siyer olayi) etiketliyor. Bir olayin tarihi "tartismali" olabilir ama
 * "gelenek" olamaz — gelenek bir YER TESPITI turudur, tarih turu degil.
 * Dorduncu degeri paylasilan enum'a eklemek zaman cizelgesine anlamsiz bir
 * secenek acardi.
 *
 *   kesin       tartismasiz yer (Kabe, Medine, Kudus, Babil)
 *   muhtemel    bolge genel kabul, nokta kesin degil (Medyen, Ahkaf, Kenan)
 *   gelenek     GELENEGIN gosterdigi yer; rakip tez yok ya da zayif, cografi
 *               teyit de yok (Cebel-i Musa, Cudi, Ninova, Eyke)
 *   tartismali  kaynaklar BIRDEN FAZLA ciddi aday sayiyor, hicbiri teyitli
 *               degil (Ur/Harran, Kizildeniz gecisi, Kehf magarasi, Sedd)
 *
 * `gelenek` ile `tartismali` birlikte eski `rivayet` derecesinin yerini alir:
 * o tek etiket iki ayri durumu ayni kefeye koyuyordu — "kaynaklar tek bir yer
 * soyluyor ama teyit yok" ile "kaynaklar dort ayri yer soyluyor" arasindaki
 * fark kullanicidan gizleniyordu.
 */
export const locationConfidence = z.enum(["kesin", "muhtemel", "gelenek", "tartismali"]);
export type LocationConfidence = z.infer<typeof locationConfidence>;

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

/**
 * Ayet anahtari ("2:153") burada TANIMLANMAZ.
 *
 * Tek tanim `references.ts` icindeki `verseKeyRef`'tir: brand'li ve sure ust
 * sinirini (114) dogru uygulayan surum. Burada bir zamanlar `^\d{1,3}:\d{1,3}$`
 * vardi; o regex `115:1` ve `999:1` gibi gecersiz anahtarlari kabul ediyordu.
 */

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
