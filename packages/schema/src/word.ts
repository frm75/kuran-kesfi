import { z } from "zod";
import { dbId, nonEmptyText } from "./common.js";

/** Kelime / kok katmani — plan 4.2. */

export const root = z.object({
  id: dbId,
  /** Latin harfli kok gosterimi: "Sbr" */
  latin: nonEmptyText,
  /** Arapca kok: "صبر" */
  arabic: nonEmptyText,
  /** Harf harf transkripsiyon: "sad-ba-ra" */
  lettersTranscription: z.string().nullable(),
  meaningTr: z.string().nullable(),
  meaningEn: z.string().nullable(),
  /** Kok dizininde ilk harf gruplamasi icin */
  firstLetterId: dbId.nullable(),
});
export type Root = z.infer<typeof root>;

/** Kokun Kur'an'da gecen turevi. */
export const rootDiff = z.object({
  id: dbId,
  rootId: dbId,
  formArabic: nonEmptyText,
  occurrenceCount: z.number().int().nonnegative(),
});
export type RootDiff = z.infer<typeof rootDiff>;

/**
 * Ayetteki tek kelime.
 *
 * Kok eslestirmesi scripts/import/lib/arabic_normalize.ts uzerinden yapilir;
 * duz string/regex eslesmesine guvenilmez. Eslesmeyen kelimeler rapor
 * dosyasina yazilir, sessizce atlanmaz (plan 20.1).
 */
export const versePart = z.object({
  id: dbId,
  verseId: dbId,
  /** Ayet icindeki sira */
  sortNumber: z.number().int().positive(),
  arabic: nonEmptyText,
  transcriptionTr: z.string().nullable(),
  transcriptionEn: z.string().nullable(),
  translationTr: z.string().nullable(),
  translationEn: z.string().nullable(),
  rootId: dbId.nullable(),
  rootDiffId: dbId.nullable(),
  /** Quranic Arabic Corpus morfoloji detayi (jsonb) */
  grammar: z.record(z.string(), z.unknown()).nullable(),
});
export type VersePart = z.infer<typeof versePart>;
