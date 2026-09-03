import { z } from "zod";
import { nonEmptyText, slug } from "./common.js";
import { revelationType } from "./quran.js";

/**
 * Statik JSON cikti semalari — plan 5.5.
 *
 * scripts/build bu sekilleri uretir, apps/web bunlari tuketir, referans linter
 * bunlari dogrular. Tek tanim, uc kullanici.
 *
 * Dosya adlari alt cizgilidir (plan 20.2):
 *   data/surahs_index.json
 *   data/surah/surah_1.json
 */

/** Bir ayetin bir mealdeki karsiligi. */
export const staticTranslation = z.object({
  /** author.slug — sayisal id degil, yeniden build'de kaymaz */
  authorSlug: slug,
  authorName: nonEmptyText,
  text: nonEmptyText,
  footnotes: z.array(
    z.object({
      number: z.number().int().positive(),
      text: nonEmptyText,
    }),
  ),
});
export type StaticTranslation = z.infer<typeof staticTranslation>;

export const staticVerse = z.object({
  /** surahId * 1000 + verseNumber */
  id: z.number().int().positive(),
  verseNumber: z.number().int().positive(),
  textUthmani: nonEmptyText,
  textSimple: nonEmptyText,
  /** Harekesiz — istemci tarafi aramada kullanilir */
  textNoVowel: nonEmptyText,
  transcriptionTr: z.string().nullable(),
  page: z.number().int().positive(),
  juz: z.number().int().min(1).max(30),
  sajda: z.boolean(),
  /** Mealler; henuz import edilmediyse bos dizi */
  translations: z.array(staticTranslation),
});
export type StaticVerse = z.infer<typeof staticVerse>;

/** Sure ust bilgisi — hem dizinde hem sure dosyasinda ayni sekil. */
export const staticSurahMeta = z.object({
  id: z.number().int().min(1).max(114),
  slug,
  nameTr: nonEmptyText,
  nameAr: nonEmptyText,
  nameEn: nonEmptyText,
  verseCount: z.number().int().positive(),
  revelationType,
  revelationOrderStandard: z.number().int().min(1).max(114),
  revelationOrderNoldeke: z.number().int().min(1).max(114).nullable(),
  pageStart: z.number().int().positive(),
});
export type StaticSurahMeta = z.infer<typeof staticSurahMeta>;

/** data/surah/surah_{id}.json */
export const staticSurah = staticSurahMeta.extend({
  verses: z.array(staticVerse).min(1),
});
export type StaticSurah = z.infer<typeof staticSurah>;

/** data/surahs_index.json */
export const staticSurahsIndex = z.object({
  surahs: z.array(staticSurahMeta).length(114),
  totals: z.object({
    surahs: z.literal(114),
    verses: z.literal(6236),
    pages: z.literal(604),
    juzs: z.literal(30),
  }),
});
export type StaticSurahsIndex = z.infer<typeof staticSurahsIndex>;

/** data/sources.json — Kaynak Seffafligi sayfasi (plan 12.10, 9) */
export const staticSource = z.object({
  slug,
  name: nonEmptyText,
  workTitle: z.string().nullable(),
  author: z.string().nullable(),
  reference: z.string().nullable(),
  url: z.string().nullable(),
  license: nonEmptyText,
  note: z.string().nullable(),
});
export type StaticSource = z.infer<typeof staticSource>;

export const staticSources = z.object({
  sources: z.array(staticSource),
});
export type StaticSources = z.infer<typeof staticSources>;
