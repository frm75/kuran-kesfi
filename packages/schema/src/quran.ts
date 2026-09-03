import { z } from "zod";
import { dbId, nonEmptyText, slug } from "./common.js";

/** Kur'an cekirdegi — plan 4.1. Tek gercek kaynak: Tanzil (plan 20.1). */

/**
 * verse.id deterministik olarak hesaplanir: surahId * 1000 + verseNumber.
 * En uzun sure 286 ayettir, cakisma olmaz. Tekrarlanabilir build icin
 * (plan 20.1) yeniden import verse_id'leri kaydirmaz.
 */
export function computeVerseId(surahId: number, verseNumber: number): number {
  return surahId * 1000 + verseNumber;
}

export const revelationType = z.enum(["mekki", "medeni"]);
export type RevelationType = z.infer<typeof revelationType>;

export const surah = z.object({
  /** 1-114; Tanzil numaralandirmasi */
  id: z.number().int().min(1).max(114),
  nameTr: nonEmptyText,
  nameAr: nonEmptyText,
  nameEn: nonEmptyText,
  slug,
  verseCount: z.number().int().positive(),
  revelationType,
  /** Misir/Ezher siralamasi — ana referans (plan 11) */
  revelationOrderStandard: z.number().int().min(1).max(114),
  /** Noldeke siralamasi — alternatif; farklar arayuzde isaretlenir */
  revelationOrderNoldeke: z.number().int().min(1).max(114).nullable(),
  pageStart: z.number().int().positive(),
});
export type Surah = z.infer<typeof surah>;

export const verse = z.object({
  id: dbId,
  surahId: z.number().int().min(1).max(114),
  verseNumber: z.number().int().positive(),
  /** Osmani hatli Arapca metin (Tanzil) */
  textUthmani: nonEmptyText,
  /** Harekeli sade metin */
  textSimple: nonEmptyText,
  /** Harekesiz metin — arama indeksi icin */
  textNoVowel: nonEmptyText,
  transcriptionTr: z.string().nullable(),
  transcriptionEn: z.string().nullable(),
  /** Mushaf sayfa numarasi */
  page: z.number().int().positive(),
  juz: z.number().int().min(1).max(30),
  sajda: z.boolean(),
});
export type Verse = z.infer<typeof verse>;

/** Meal kaynagi (plan 3.1). */
export const authorSource = z.enum(["acikkuran", "quran.com", "tanzil", "manual"]);
export type AuthorSource = z.infer<typeof authorSource>;

/**
 * Meal yazari.
 *
 * Telif kurali (plan 3.1): yalnizca acik lisansli veri setlerinde dagitilan
 * mealler kullanilir. license alani bos birakilamaz; lisansi belirsiz meal
 * import edilmez.
 */
export const author = z.object({
  id: dbId,
  /**
   * Kararli anahtar. Tarayicida saklanan meal secimi (settings.selectedAuthors)
   * bu slug'i tutar; sayisal id yeniden build'de kayabileceginden kullanici
   * verisinde id kullanilmaz.
   */
  slug,
  name: nonEmptyText,
  workTitle: nonEmptyText.nullable(),
  /** ISO 639-1: "tr", "en" */
  language: z.string().length(2),
  source: authorSource,
  license: nonEmptyText,
  licenseNote: z.string().nullable(),
  url: z.url().nullable(),
  /** Ilk acilista karsilastirmali gorunen 4 oncelikli meal */
  isDefault: z.boolean(),
  /** 1-4 oncelikli mealler icin siralama; digerleri null (plan 3.1) */
  priority: z.number().int().min(1).max(4).nullable(),
});
export type Author = z.infer<typeof author>;

export const translation = z.object({
  id: dbId,
  verseId: dbId,
  authorId: dbId,
  text: nonEmptyText,
});
export type Translation = z.infer<typeof translation>;

export const footnote = z.object({
  id: dbId,
  translationId: dbId,
  number: z.number().int().positive(),
  text: nonEmptyText,
});
export type Footnote = z.infer<typeof footnote>;
