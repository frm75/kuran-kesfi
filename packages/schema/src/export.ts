import { z } from "zod";
import {
  conceptSlug,
  principleSlug,
  rootKey,
  scholarSlug,
  storySlug,
  verseKeyRef,
} from "./references.js";
import {
  QUOTE_MAX,
  SUMMARY_MAX,
  noteConfidence,
  noteType,
  noteVerseRole,
  platform,
} from "./scholar-notes.js";

/**
 * IKI PROJENIN SOZLESMESI — yerel `kuran-extract` -> ana site JSON zarfi.
 *
 * DB satir tiplerinden (scholar-notes.ts) farki: **otomatik ID YOK**. Eslesme
 * yalnizca is anahtarlariyla yapilir; iki veritabaninin id uzayi ortak degildir.
 *
 * Alan adlari bu modulde snake_case'dir. Gerekce: bu bir TELDEKI SOZLESME,
 * dahili TypeScript tipi degil; iki proje ayni JSON'u okuyup yazar ve GOREV 01
 * bu adlari birebir tanimlar. Projenin geri kalani camelCase kullanir
 * (CLAUDE.md isimlendirme).
 *
 * SD-01: `transcript` ve `transcript_segment` pakete GIRMEZ — transkript
 * arayuzde gosterilmez, yalnizca ekstraksiyon kaynagidir ve yerel makinede
 * kalir. `segment_id` de girmez; export sirasinda saniyeye cozulur.
 *
 * Akis: `inbox/scholar_notes_YYYY-MM-DD.json` + `.sha256`
 *       -> `scripts/sync/import_notes.ts` -> hash dogrular -> Zod parse
 *       -> `checkPackageIntegrity` -> idempotent upsert -> rapor.
 * Bilinmeyen referans -> paket reddedilir, `inbox/rejected/` altina tasinir.
 */

export const SCHEMA_VERSION = 1;

const isoDateTime = z.iso.datetime({ offset: true });

/** Opsiyonel metin alani: hem yok hem null kabul edilir. */
const optionalText = z.string().nullable().optional();

// -----------------------------------------------------------------------------

export const exportScholar = z.object({
  /** Is anahtari */
  slug: scholarSlug,
  name: z.string().min(1),
  channel_name: optionalText,
  channel_url: optionalText,
  note: optionalText,
});
export type ExportScholar = z.infer<typeof exportScholar>;

/**
 * Video kaynagi. Hocaya `scholar_slug` ile baglanir (sayisal id yok).
 *
 * GOREV 01 / K4: `video_id` dogrulamasi platform'a gore kosulludur.
 */
export const exportVideoSource = z
  .object({
    scholar_slug: scholarSlug,
    platform,
    video_id: z.string().min(1),
    title: z.string().min(1),
    url: z.url(),
    published_at: isoDateTime.nullable().optional(),
    duration_sec: z.number().int().nonnegative().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.platform === "youtube" && !/^[A-Za-z0-9_-]{11}$/.test(value.video_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["video_id"],
        message: "platform 'youtube' ise video_id 11 karakter olmali",
      });
    }
  });
export type ExportVideoSource = z.infer<typeof exportVideoSource>;

/**
 * Hoca notu — bilesik is anahtari:
 *   (scholar_slug, video_id, segment_start_sec, note_type)
 *
 * `status` yalnizca `reviewed | published`; `draft` export'a GIRMEZ.
 */
export const exportScholarNote = z
  .object({
    scholar_slug: scholarSlug,
    video_id: z.string().min(1),
    segment_start_sec: z.number().int().nonnegative(),
    segment_end_sec: z.number().int().nonnegative(),
    note_type: noteType,

    summary: z.string().min(1).max(SUMMARY_MAX),
    quote: z.string().max(QUOTE_MAX).nullable().optional(),
    deep_link: z.url(),
    confidence: noteConfidence,
    /** draft export'a girmez */
    status: z.enum(["reviewed", "published"]),
    reviewer_id: optionalText,
    created_at: isoDateTime,
    updated_at: isoDateTime,

    /** Referanslar is anahtari dizileridir; cozumleme sunucuda yapilir. */
    linked_verses: z.array(verseKeyRef).default([]),
    linked_verse_roles: z.record(z.string(), noteVerseRole).default({}),
    linked_principles: z.array(principleSlug).default([]),
    linked_concepts: z.array(conceptSlug).default([]),
    linked_stories: z.array(storySlug).default([]),
    linked_roots: z.array(rootKey).default([]),
    tags: z.array(z.string().min(1)).default([]),
  })
  .refine((n) => n.segment_end_sec >= n.segment_start_sec, {
    message: "segment_end_sec, segment_start_sec'ten kucuk olamaz",
    path: ["segment_end_sec"],
  });
export type ExportScholarNote = z.infer<typeof exportScholarNote>;

export const exportPackage = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  exported_at: isoDateTime,
  source: z.literal("local-extract"),
  scholars: z.array(exportScholar),
  video_sources: z.array(exportVideoSource),
  scholar_notes: z.array(exportScholarNote),
});
export type ExportPackage = z.infer<typeof exportPackage>;

// -----------------------------------------------------------------------------

/**
 * Paket ICI capraz referans denetimi.
 *
 * Zod tipleri dogrular; bu fonksiyon paketin kendi icindeki tutarliligi
 * dogrular. Veritabanina karsi cozumleme (ayet/ilke/kavram anahtarlarinin
 * gercekten var olmasi) import sirasinda ayrica yapilir.
 *
 * @returns Bos dizi = temiz. Aksi halde insan okur hata satirlari.
 */
export function checkPackageIntegrity(pkg: ExportPackage): string[] {
  const errors: string[] = [];

  const scholarSlugs = new Set<string>();
  for (const s of pkg.scholars) {
    if (scholarSlugs.has(s.slug)) {
      errors.push(`scholars: '${s.slug}' mukerrer`);
    }
    scholarSlugs.add(s.slug);
  }

  /** video_id -> onu tanimlayan hocanin slug'i */
  const videoOwner = new Map<string, string>();
  for (const v of pkg.video_sources) {
    if (!scholarSlugs.has(v.scholar_slug)) {
      errors.push(
        `video_sources: '${v.video_id}' bilinmeyen scholar_slug '${v.scholar_slug}' kullaniyor`,
      );
    }
    if (videoOwner.has(v.video_id)) {
      errors.push(`video_sources: '${v.video_id}' mukerrer`);
    }
    videoOwner.set(v.video_id, v.scholar_slug);
  }

  const noteKeys = new Set<string>();
  for (const n of pkg.scholar_notes) {
    if (!scholarSlugs.has(n.scholar_slug)) {
      errors.push(`scholar_notes: bilinmeyen scholar_slug '${n.scholar_slug}'`);
    }

    const owner = videoOwner.get(n.video_id);
    if (owner === undefined) {
      errors.push(`scholar_notes: bilinmeyen video_id '${n.video_id}'`);
    } else if (owner !== n.scholar_slug) {
      errors.push(
        `scholar_notes: '${n.video_id}' videosu '${owner}' hocasina ait, ` +
          `not '${n.scholar_slug}' diyor`,
      );
    }

    // Bilesik is anahtari paket icinde de benzersiz olmali
    const key = `${n.scholar_slug}|${n.video_id}|${n.segment_start_sec}|${n.note_type}`;
    if (noteKeys.has(key)) {
      errors.push(`scholar_notes: is anahtari mukerrer -> ${key}`);
    }
    noteKeys.add(key);

    // linked_verse_roles anahtarlari linked_verses icinde olmali
    for (const verseKey of Object.keys(n.linked_verse_roles)) {
      if (!(n.linked_verses as readonly string[]).includes(verseKey)) {
        errors.push(
          `scholar_notes (${key}): linked_verse_roles '${verseKey}' iceriyor ` +
            "ama linked_verses'te yok",
        );
      }
    }
  }

  return errors;
}
