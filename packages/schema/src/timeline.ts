import { z } from "zod";
import { confidence, dbId, nonEmptyText } from "./common.js";

/** Siyer / zaman cizelgesi — plan 4.5. */

export const timelinePeriod = z.enum(["mekke_1", "mekke_2", "mekke_3", "medine"]);
export type TimelinePeriod = z.infer<typeof timelinePeriod>;

export const timelineEvent = z.object({
  id: dbId,
  order: z.number().int().positive(),
  title: nonEmptyText,
  description: nonEmptyText,
  period: timelinePeriod,
  /** Yaklasik miladi yil; kesin degilse confidence alaniyla isaretlenir */
  approxYear: z.number().int().nullable(),
  relatedSurahIds: z.array(z.number().int().min(1).max(114)),
  relatedVerseIds: z.array(dbId),
  /** Kronoloji ihtilafi gizlenmez (plan 12.9) */
  confidence,
  sourceNote: nonEmptyText,
  sourceIds: z.array(dbId).min(1, "zaman cizelgesi olayi en az bir kaynak tasimali"),
});
export type TimelineEvent = z.infer<typeof timelineEvent>;
