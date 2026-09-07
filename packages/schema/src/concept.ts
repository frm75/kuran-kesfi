import { z } from "zod";
import { dbId, nonEmptyText, slug } from "./common.js";

/** Kavram katmani — plan 4.4. */

export const concept = z.object({
  id: dbId,
  slug,
  nameTr: nonEmptyText,
  nameAr: z.string().nullable(),
  /**
   * Ansiklopedik, mezhepler ustu tanim. Platform hukum cikarmaz; ihtilafli
   * konularda "farkli gorusler vardir" notu dusulur (plan 8.5).
   */
  definition: nonEmptyText,
  parentId: dbId.nullable(),
});
export type Concept = z.infer<typeof concept>;

export const conceptVerse = z.object({
  conceptId: dbId,
  verseId: dbId,
  /** Kavramin ayetteki agirligi: 1 zayif, 3 merkezi */
  weight: z.number().int().min(1).max(3),
  /** Eslestirmenin kaynagi; platform derlemesi ise sourceId null olabilir */
  sourceId: dbId.nullable(),
});
export type ConceptVerse = z.infer<typeof conceptVerse>;

export const conceptRelationType = z.enum(["co_occurrence", "cause", "contrast", "part_of"]);
export type ConceptRelationType = z.infer<typeof conceptRelationType>;

/** Baglantinin kaynagi: insan karari mi, istatistik mi. */
export const relationOrigin = z.enum(["curated", "computed"]);
export type RelationOrigin = z.infer<typeof relationOrigin>;

export const conceptRelation = z.object({
  sourceConceptId: dbId,
  targetConceptId: dbId,
  relationType: conceptRelationType,
  weight: z.number().int().min(1).max(3),
});
export type ConceptRelation = z.infer<typeof conceptRelation>;

export const conceptRoot = z.object({
  conceptId: dbId,
  rootId: dbId,
});
export type ConceptRoot = z.infer<typeof conceptRoot>;
