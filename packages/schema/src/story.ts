import { z } from "zod";
import { dbId, locationConfidence, nonEmptyText, slug } from "./common.js";

/** Kissa katmani — plan 4.3. */

export const storyType = z.enum(["prophet", "people", "person", "event"]);
export type StoryType = z.infer<typeof storyType>;

export const story = z.object({
  id: dbId,
  slug,
  title: nonEmptyText,
  type: storyType,
  /** Adem -> Isa -> Asr-i Saadet ekseninde sira */
  chronologicalOrder: z.number().int().positive(),
  /** Yaklasik donem, serbest metin: "M.O. 2000 civari" */
  eraStart: z.string().nullable(),
  eraEnd: z.string().nullable(),
  summary: nonEmptyText,
  /**
   * Kapak gorseli. Figur yasagi (plan 20.3): peygamber, sahabe, melek ve insan
   * tasviri iceremez; yalnizca manzara, mimari, doga, hat, geometrik desen.
   */
  coverImage: z.string().nullable(),
  relatedStories: z.array(dbId),
});
export type Story = z.infer<typeof story>;

/**
 * Kissanin bir ayet parcasi.
 *
 * Parcalar kronolojik sirayla girilir; sira tartismaliysa note alaninda
 * belirtilir (plan 8.4).
 */
export const storyPassage = z.object({
  id: dbId,
  storyId: dbId,
  /** Anlati modundaki sira */
  order: z.number().int().positive(),
  title: nonEmptyText,
  surahId: z.number().int().min(1).max(114),
  verseStart: z.number().int().positive(),
  verseEnd: z.number().int().positive(),
  note: z.string().nullable(),
});
export type StoryPassage = z.infer<typeof storyPassage>;

/**
 * Kissadan cikarilan ders.
 *
 * Her ders maddesi bir kaynaga baglanir; kaynaksiz ders eklenmez. Ders metni
 * kaynagin ifadesini ozetler, platform yorumu eklenmez (plan 8.1, 8.2).
 */
export const storyLesson = z.object({
  id: dbId,
  storyId: dbId,
  order: z.number().int().positive(),
  text: nonEmptyText,
  sourceName: nonEmptyText,
  sourceReference: nonEmptyText,
  sourceIds: z.array(dbId),
});
export type StoryLesson = z.infer<typeof storyLesson>;

/**
 * Konum.
 *
 * En az bir kaynak ve guven derecesi zorunludur. Farkli gorusler alternatives
 * alaninda saklanir; ihtilaf gizlenmez (plan 8.3, 1.5).
 */
export const locationAlternative = z.object({
  name: nonEmptyText,
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  note: nonEmptyText,
  sourceIds: z.array(dbId),
});
export type LocationAlternative = z.infer<typeof locationAlternative>;

export const location = z.object({
  id: dbId,
  slug,
  name: nonEmptyText,
  modernName: z.string().nullable(),
  country: z.string().nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  confidence: locationConfidence,
  sourceNote: nonEmptyText,
  alternatives: z.array(locationAlternative),
  sourceIds: z.array(dbId).min(1, "konum en az bir kaynak tasimali (plan 8.3)"),
});
export type Location = z.infer<typeof location>;

export const storyLocation = z.object({
  storyId: dbId,
  locationId: dbId,
  /** Kissanin rotasindaki sira; harita cizgisi bu siraya gore cizilir */
  order: z.number().int().positive(),
  eventDescription: nonEmptyText,
  passageIds: z.array(dbId),
});
export type StoryLocation = z.infer<typeof storyLocation>;

export const storyConcept = z.object({
  storyId: dbId,
  conceptId: dbId,
});
export type StoryConcept = z.infer<typeof storyConcept>;
