import { z } from "zod";
import { discoveryNodeType, isoTimestamp, nonEmptyText, slug, verseKey } from "./common.js";

/**
 * Kullanici verisi — plan 4.6 ve 12.15.
 *
 * TAMAMEN TARAYICIDA (IndexedDB / Dexie). Sunucuya davranis verisi
 * gonderilmez, profil olusturulmaz (plan 1.2, 1.3, 12.7, 12.8).
 * Disa/ice aktarma tek JSON dosyasiyla yapilir.
 */

export const note = z.object({
  id: z.string(),
  verseKey,
  text: nonEmptyText,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});
export type Note = z.infer<typeof note>;

export const bookmark = z.object({
  verseKey,
  createdAt: isoTimestamp,
  label: z.string().nullable(),
});
export type Bookmark = z.infer<typeof bookmark>;

export const progress = z.object({
  surahId: z.number().int().min(1).max(114),
  lastVerse: z.number().int().positive(),
  updatedAt: isoTimestamp,
});
export type Progress = z.infer<typeof progress>;

/** Ezber takibi — FSRS araliksiz tekrar algoritmasi (plan 2.6, 6). */
export const memorizationReview = z.object({
  reviewedAt: isoTimestamp,
  rating: z.number().int().min(1).max(4),
});

export const memorization = z.object({
  verseKey,
  ease: z.number(),
  intervalDays: z.number().nonnegative(),
  nextReviewAt: isoTimestamp,
  history: z.array(memorizationReview),
});
export type Memorization = z.infer<typeof memorization>;

export const theme = z.enum(["light", "dark", "system"]);
export type Theme = z.infer<typeof theme>;

export const settings = z.object({
  /**
   * Secili meallerin author.slug degerleri; ilk acilista 4 oncelikli meal
   * (plan 3.1). Sayisal id degil slug saklanir: statik site yeniden build
   * edildiginde author id'leri kayabilir ve tarayicidaki secim bozulurdu.
   */
  selectedAuthors: z.array(slug),
  fontSize: z.number().int().min(12).max(48),
  showArabic: z.boolean(),
  showTranscription: z.boolean(),
  theme,
});
export type Settings = z.infer<typeof settings>;

/** Kesif agindaki bir adim (plan 12.8, 12.8a). */
export const discoveryStep = z.object({
  type: discoveryNodeType,
  /** Dugumun anahtari: ayet icin "2:153", kissa icin slug */
  key: nonEmptyText,
  title: nonEmptyText,
});
export type DiscoveryStep = z.infer<typeof discoveryStep>;

/** "Kaldigin yerden devam et" (plan 12.8). */
export const recentDiscovery = discoveryStep.extend({
  visitedAt: isoTimestamp,
});
export type RecentDiscovery = z.infer<typeof recentDiscovery>;

/** Kesif yolu cubugu — breadcrumb (plan 12.8a). */
export const discoveryPath = z.object({
  id: z.string(),
  steps: z.array(discoveryStep),
  createdAt: isoTimestamp,
});
export type DiscoveryPath = z.infer<typeof discoveryPath>;

/** Ayet karsilastirma sepeti — en fazla 8 ayet (plan 12.8b). */
export const comparisonBasket = z.object({
  verseKeys: z.array(verseKey).max(8, "sepete en fazla 8 ayet eklenebilir (plan 12.8b)"),
  updatedAt: isoTimestamp,
});
export type ComparisonBasket = z.infer<typeof comparisonBasket>;

/** Disa/ice aktarma dosyasi — tek JSON (plan 4.6). */
export const userDataExport = z.object({
  version: z.literal(1),
  exportedAt: isoTimestamp,
  notes: z.array(note),
  bookmarks: z.array(bookmark),
  progress: z.array(progress),
  memorization: z.array(memorization),
  settings,
  recentDiscoveries: z.array(recentDiscovery),
  discoveryPaths: z.array(discoveryPath),
  comparisonBasket: comparisonBasket.nullable(),
});
export type UserDataExport = z.infer<typeof userDataExport>;
