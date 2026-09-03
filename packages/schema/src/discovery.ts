import { z } from "zod";
import { confidence, dbId, nonEmptyText } from "./common.js";
import { origin } from "./source.js";

/** Kesif katmani — plan 12.15. */

/**
 * Sure ici konu basligi (plan 12.1, 12.15).
 *
 * Kaynaktan alinan baslik (origin="source") ile platformun urettigi baslik
 * (origin="platform") arayuzde farkli etiketle gosterilir; kaynak basligin
 * kaynagi her zaman gorunur.
 */
export const surahSection = z
  .object({
    id: dbId,
    surahId: z.number().int().min(1).max(114),
    order: z.number().int().positive(),
    title: nonEmptyText,
    verseStart: z.number().int().positive(),
    verseEnd: z.number().int().positive(),
    origin,
    sourceId: dbId.nullable(),
    note: z.string().nullable(),
  })
  .refine((s) => s.origin !== "source" || s.sourceId !== null, {
    message: "origin='source' ise sourceId zorunludur (plan 12.15)",
    path: ["sourceId"],
  })
  .refine((s) => s.verseEnd >= s.verseStart, {
    message: "verseEnd, verseStart'tan kucuk olamaz",
    path: ["verseEnd"],
  });
export type SurahSection = z.infer<typeof surahSection>;

/**
 * Bolum-ayet baglantisi.
 *
 * verseStart/verseEnd ana araligi tanimlar; bu tablo bir ayetin birden fazla
 * konuya dahil olmasi ve arali cakismalarini tutar (plan 12.15).
 */
export const sectionVerse = z.object({
  sectionId: dbId,
  verseId: dbId,
});
export type SectionVerse = z.infer<typeof sectionVerse>;

/**
 * Ayetler arasi iliski turleri (plan 12.5).
 *
 * "Ayni konu ayeti" (same_topic / same_context) ile genel "ilgili" (related)
 * karistirilmaz. related yalnizca diger turlere girmeyen durumlar icindir.
 */
export const verseRelationType = z.enum([
  "direct_reference",
  "same_context",
  "same_topic",
  "parallel_passage",
  "explanation",
  "example",
  "contrast",
  "same_story",
  "same_event",
  "same_root",
  "related",
]);
export type VerseRelationType = z.infer<typeof verseRelationType>;

/** Iliskinin gerekcesinin neye dayandigi. */
export const reasonRefType = z.enum(["concept", "root", "section", "story", "event"]);
export type ReasonRefType = z.infer<typeof reasonRefType>;

/**
 * Ayetler arasi iliski (plan 12.5).
 *
 * reason her zaman kullaniciya gosterilir:
 *   Bakara 153 -> Ilgili: Yusuf 90
 *     Neden? Sabir kavrami · ayni kok (ص ب ر) · ayni konu
 *
 * AI tarafindan onerilen iliskiler kesin bilgi olarak gosterilmez; confidence
 * degeri ile ayrilir ve arayuzde "Olasi iliski" etiketiyle sunulur (plan 12.5, 13).
 */
export const verseRelation = z
  .object({
    id: dbId,
    sourceVerseId: dbId,
    targetVerseId: dbId,
    relationType: verseRelationType,
    /** Iliskinin gerekcesi — bos birakilamaz */
    reason: nonEmptyText,
    reasonRefType: reasonRefType.nullable(),
    reasonRefId: dbId.nullable(),
    sourceId: dbId.nullable(),
    confidence,
    note: z.string().nullable(),
  })
  .refine((r) => r.sourceVerseId !== r.targetVerseId, {
    message: "bir ayet kendisiyle iliskilendirilemez",
    path: ["targetVerseId"],
  })
  .refine((r) => (r.reasonRefType === null) === (r.reasonRefId === null), {
    message: "reasonRefType ve reasonRefId birlikte dolu veya birlikte bos olmali",
    path: ["reasonRefId"],
  });
export type VerseRelation = z.infer<typeof verseRelation>;
