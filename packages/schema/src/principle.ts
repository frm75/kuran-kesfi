import { z } from "zod";
import { dbId, nonEmptyText, slug } from "./common.js";

/** Ilkeler modulu — plan 18.4. */

/**
 * Kur'an'in tavsiye ettigi ilke.
 *
 * Icerik kurallari (plan 18.3):
 *   - Ilke listesi tefsir ve ansiklopedi kaynaklarindan derlenir; platform
 *     kendi ilkesini icat etmez.
 *   - Her ilke en az bir dogrudan ayet dayanagiyla (role="primary") girilir.
 *   - Mezhepler ustu, hukum cikarmayan dil kullanilir.
 */
export const principle = z.object({
  id: dbId,
  slug,
  nameTr: nonEmptyText,
  /** Arapca anahtar kelime: "صبر" */
  nameAr: z.string().nullable(),
  rootId: dbId.nullable(),
  /** Kisa, kaynakli tanim */
  definition: nonEmptyText,
  /** Tefsirlerin ilkeyi nasil ele aldigi — ozet ve kaynakli */
  explanation: nonEmptyText,
  /** Gunluk hayata dair not — yalnizca tefsir/kaynak temelli, platform yorumu yok */
  dailyNote: z.string().nullable(),
  /** Karsit ilke: adalet <-> zulum */
  oppositePrincipleId: dbId.nullable(),
  order: z.number().int().positive(),
  sourceIds: z.array(dbId).min(1, "ilke en az bir kaynak tasimali (plan 18.3)"),
});
export type Principle = z.infer<typeof principle>;

/** primary = dogrudan emir/tavsiye iceren; secondary = ilkeyi ornekleyen */
export const principleVerseRole = z.enum(["primary", "secondary"]);
export type PrincipleVerseRole = z.infer<typeof principleVerseRole>;

export const principleVerse = z.object({
  principleId: dbId,
  verseId: dbId,
  role: principleVerseRole,
  note: z.string().nullable(),
});
export type PrincipleVerse = z.infer<typeof principleVerse>;

export const principleStory = z.object({
  principleId: dbId,
  storyId: dbId,
  note: z.string().nullable(),
});
export type PrincipleStory = z.infer<typeof principleStory>;

export const principleConcept = z.object({
  principleId: dbId,
  conceptId: dbId,
});
export type PrincipleConcept = z.infer<typeof principleConcept>;
