import { z } from "zod";
import { dbId, nonEmptyText, slug } from "./common.js";

/**
 * Tefsir semasi (plan 3, 12.9).
 *
 * Meal ile tefsir ayri tutulur: meal ayet basinadir, tefsir ayet ARALIGI
 * basinadir ve bir kismi hic ayete bagli degildir (sure adi, nuzul yeri,
 * sure sonu). Bkz. infra/db/schema.sql.
 */

/**
 * Blok turu.
 *
 * Kaynak etiketleri Arapcadir; burasi yalnizca arayuzun ayirt edebilmesi icin.
 * Kaynagin kendi etiketi `sourceType` icinde oldugu gibi durur. Taninmayan
 * etiket 'diger' olur — sessizce ayet tefsiri sayilmaz.
 */
export const tafsirBlockType = z.enum([
  "sure_adi",
  "nuzul_yeri",
  "pasaj",
  "giris",
  "ayet_tefsiri",
  "besmele",
  "fasil",
  "faideler",
  "hatime",
  "alinti",
  "sure_sonu",
  "diger",
]);
export type TafsirBlockType = z.infer<typeof tafsirBlockType>;

/**
 * Tefsir eseri.
 *
 * Telif kurali (CLAUDE.md 6): lisansi belirsiz tefsir eklenmez; `license`
 * bos birakilamaz.
 */
export const tafsir = z.object({
  id: dbId,
  slug,
  name: nonEmptyText,
  workTitle: nonEmptyText.nullable(),
  author: nonEmptyText.nullable(),
  /** ISO 639-1: "tr" */
  language: z.string().length(2),
  /** source.slug — atif yukumlulugu bu kayittan okunur */
  sourceSlug: slug,
  license: nonEmptyText,
  licenseNote: z.string().nullable(),
  url: z.url().nullable(),
  /**
   * Kutuphane != yayin (docs/KAYNAK_ENVANTERI.md 0): ice almak ile gostermek
   * ayri kararlardir. false = eser kutuphanede durur, siteye cikmaz.
   * Yayin karari editoryaldir; statik disa aktarim bu alani suzer.
   */
  publishable: z.boolean(),
});
export type Tafsir = z.infer<typeof tafsir>;

/**
 * Tefsir blogu.
 *
 * `startVerseId` / `endVerseId` ya ikisi de dolu ya ikisi de bostur. Bos olmasi
 * "bu blok belirli bir ayete bagli degil" demektir (sure adi, nuzul yeri,
 * sure sonu); ayet bagi UYDURULMAZ.
 */
export const tafsirBlock = z
  .object({
    id: dbId,
    tafsirId: dbId,
    surahId: z.number().int().min(1).max(114),
    sortNumber: z.number().int().positive(),
    blockType: tafsirBlockType,
    /** Kaynagin kendi tur etiketi, cevrilmeden */
    sourceType: z.string().nullable(),
    startVerseId: dbId.nullable(),
    endVerseId: dbId.nullable(),
    text: nonEmptyText,
  })
  .refine((b) => (b.startVerseId === null) === (b.endVerseId === null), {
    message: "startVerseId ve endVerseId ya birlikte dolu ya birlikte bos olmali",
  })
  .refine((b) => b.startVerseId === null || (b.endVerseId ?? 0) >= b.startVerseId, {
    message: "endVerseId startVerseId'den kucuk olamaz",
  });
export type TafsirBlock = z.infer<typeof tafsirBlock>;
