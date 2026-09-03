import { z } from "zod";
import { dbId, isoTimestamp, nonEmptyText } from "./common.js";
import {
  conceptSlug,
  principleSlug,
  rootKey,
  scholarSlug,
  storySlug,
  verseKeyRef,
} from "./references.js";

/**
 * Hoca notlari — plan §23.2 (GOREV 01) + SD-01 sema degisikligi.
 *
 * Veritabani SATIR tipleri ("DB'de duran hal", id iceren). Projeler arasi JSON
 * zarfi icin `export.ts` kullanilir; orada otomatik id yoktur, eslesme yalnizca
 * is anahtarlariyladir.
 *
 * ## Iki ortam
 *
 * | Ortam | Motor | Kapsam |
 * |---|---|---|
 * | Yerel `kuran-extract` | SQLite | transkript + not cikarimi, cevrimdisi |
 * | Ana site | PostgreSQL | yayin; transkript TASIMAZ |
 *
 * SD-01: Export paketi `transcript` ve `transcript_segment` tasimaz — transkript
 * arayuzde gosterilmez, yalnizca ekstraksiyon kaynagidir ve yerel makinede kalir.
 * Sunucuda `transcript_segment` satiri hic olusmaz, dolayisiyla
 * `scholarNote.segmentId` sunucuda HER ZAMAN null'dur.
 *
 * ## Icerik kurali (CLAUDE.md kural 4)
 *
 * Platform kendi editoryal yorumunu uretmez. Hoca aciklamasi bir kaynaga bagli
 * yorumdur; kaynagiyla gosterilir, tek dogru gibi sunulmaz, farkli gorusler yan
 * yana verilir.
 */

/** Alinti ust siniri — telif geregi (plan §3 Diyanet tefsiri modeli). */
export const QUOTE_MAX = 200;

/** Ozet ust siniri (GOREV 01 / K6). Ozet bizim ifademiz ama tavan olsun. */
export const SUMMARY_MAX = 2000;

// -----------------------------------------------------------------------------
// Numaralandirmalar
// -----------------------------------------------------------------------------

export const platform = z.enum(["youtube", "other"]);
export type Platform = z.infer<typeof platform>;

export const transcriptSource = z.enum(["auto_captions", "manual", "whisper"]);
export type TranscriptSource = z.infer<typeof transcriptSource>;

export const noteType = z.enum([
  "tefsir",
  "nuzul_sebebi",
  "ilke_aciklamasi",
  "dogru_bilinen_yanlis",
  "kissa_detayi",
  "kavram_aciklamasi",
  "kok_aciklamasi",
  "genel",
]);
export type NoteType = z.infer<typeof noteType>;

/**
 * Hoca notu guven derecesi (GOREV 01 / K1).
 *
 * UC AYRI confidence enum'u vardir, ASLA birlestirilmez — anlamlari farklidir
 * ve arayuzde farkli rozet secilir:
 *   Confidence         §4     konum/kronoloji   kesin | muhtemel | rivayet
 *   NoteConfidence     §23.2  hoca notu         kesin | muhtemel | tartismali
 *   RelationConfidence §12.15 ayet iliskisi     kesin | muhtemel | olasi
 */
export const noteConfidence = z.enum(["kesin", "muhtemel", "tartismali"]);
export type NoteConfidence = z.infer<typeof noteConfidence>;

export const noteStatus = z.enum(["draft", "reviewed", "published"]);
export type NoteStatus = z.infer<typeof noteStatus>;

/** Bir notun baska bir notla iliskisi — farkli gorusler yan yana verilir. */
export const noteRelation = z.enum(["agrees", "disagrees", "nuances", "elaborates"]);
export type NoteRelation = z.infer<typeof noteRelation>;

export const noteVerseRole = z.enum(["primary", "secondary"]);
export type NoteVerseRole = z.infer<typeof noteVerseRole>;

// -----------------------------------------------------------------------------
// Tablolar
// -----------------------------------------------------------------------------

export const scholar = z.object({
  id: dbId,
  /** Is anahtari — UNIQUE (GOREV 02 / N4) */
  slug: scholarSlug,
  name: nonEmptyText,
  /** Kanal / kurum adi */
  channelName: z.string().nullable(),
  channelUrl: z.url().nullable(),
  note: z.string().nullable(),
});
export type Scholar = z.infer<typeof scholar>;

/**
 * Video kaynagi.
 *
 * GOREV 01 / K4: `videoId` dogrulamasi platform'a gore kosulludur —
 * youtube ise 11 karakter, other ise serbest. Duz `string().min(1)` birakilmaz.
 * Is anahtari: (platform, videoId) UNIQUE.
 */
export const videoSource = z
  .object({
    id: dbId,
    scholarId: dbId,
    platform,
    videoId: nonEmptyText,
    title: nonEmptyText,
    url: z.url(),
    publishedAt: isoTimestamp.nullable(),
    durationSec: z.number().int().nonnegative().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.platform === "youtube" && !/^[A-Za-z0-9_-]{11}$/.test(value.videoId)) {
      ctx.addIssue({
        code: "custom",
        path: ["videoId"],
        message: "platform 'youtube' ise videoId 11 karakter olmali",
      });
    }
  });
export type VideoSource = z.infer<typeof videoSource>;

/**
 * Transkript — YALNIZCA YEREL.
 *
 * SD-01: export paketine girmez, sunucuda satiri olusmaz.
 */
export const transcript = z.object({
  id: dbId,
  videoSourceId: dbId,
  source: transcriptSource,
  language: z.string().length(2),
  createdAt: isoTimestamp,
});
export type Transcript = z.infer<typeof transcript>;

/** Transkript parcasi — YALNIZCA YEREL (SD-01). */
export const transcriptSegment = z
  .object({
    id: dbId,
    transcriptId: dbId,
    startSec: z.number().int().nonnegative(),
    endSec: z.number().int().nonnegative(),
    text: nonEmptyText,
  })
  .refine((s) => s.endSec >= s.startSec, {
    message: "endSec, startSec'ten kucuk olamaz",
    path: ["endSec"],
  });
export type TranscriptSegment = z.infer<typeof transcriptSegment>;

/**
 * Hoca notu.
 *
 * SD-01 Degisiklik 1: `segmentStartSec` ve `segmentEndSec` eklendi.
 *
 * Gerekce: sync is anahtari (scholarSlug, videoId, segmentStartSec, noteType)
 * olarak tanimli. Bu anahtarin veritabani seviyesinde UNIQUE kurulabilmesi icin
 * saniye degerinin SATIRDA bulunmasi gerekir. `deepLink` zaman damgasini iceriyor
 * ama URL icine gomulu oldugu icin sorgulanabilir/indekslenebilir anahtar degildir.
 *
 * `segmentId` kalir, anlami ortama gore degisir:
 *
 * | Ortam | segmentId | segmentStartSec / segmentEndSec |
 * |---|---|---|
 * | Yerel (SQLite) | transcriptSegment(id)'ye FK, dolu | dolu |
 * | Sunucu (PostgreSQL) | HER ZAMAN null | dolu |
 *
 * Export sirasinda `segmentId` saniyeye cozulur ve pakete saniye degerleri
 * yazilir; `segmentId` export paketine GIRMEZ.
 */
export const scholarNote = z
  .object({
    id: dbId,
    scholarId: dbId,
    videoSourceId: dbId,
    /** Sunucuda her zaman null (SD-01) */
    segmentId: dbId.nullable(),
    /** SD-01 Degisiklik 1 — is anahtarinin parcasi */
    segmentStartSec: z.number().int().nonnegative(),
    segmentEndSec: z.number().int().nonnegative(),
    noteType,
    /** Bizim ifademizle ozet (GOREV 01 / K6) */
    summary: z.string().min(1).max(SUMMARY_MAX),
    /** Hocanin sozunden dogrudan alinti — telif geregi <= 200 karakter */
    quote: z.string().max(QUOTE_MAX).nullable(),
    /** Videonun ilgili anina derin baglanti (GOREV 01 / K5: gevsek url) */
    deepLink: z.url(),
    confidence: noteConfidence,
    status: noteStatus,
    /**
     * Gozden geciren (GOREV 01 / K2): yerel arac tek kullanicilidir, "fatih"
     * gibi bir etiket yeter. Sunucuda uye sistemi yok. Ileride admin paneli
     * gelirse `reviewer` tablosu acilip FK'ye donusur.
     */
    reviewerId: z.string().nullable(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .refine((n) => n.segmentEndSec >= n.segmentStartSec, {
    message: "segmentEndSec, segmentStartSec'ten kucuk olamaz",
    path: ["segmentEndSec"],
  });
export type ScholarNote = z.infer<typeof scholarNote>;

// -----------------------------------------------------------------------------
// Ara tablolar — iki varyant (SD-01 Degisiklik 2)
//
// Ayni mantiksal tablo iki ortamda FARKLI kolon tutar. Extract'te cekirdek veri
// (verse, principle, concept, story, root) yoktur; elde sayisal id degil is
// anahtari bulunur. Cozumleme import aninda sunucuda yapilir; bilinmeyen anahtar
// -> paket reddedilir, inbox/rejected/ altina tasinir.
//
// Yerel varyantlarda FK yoktur; dogrulama references.ts brand tipleriyle yapilir.
// -----------------------------------------------------------------------------

export const scholarNoteVerse = z.object({
  noteId: dbId,
  verseId: dbId,
  role: noteVerseRole,
});
export type ScholarNoteVerse = z.infer<typeof scholarNoteVerse>;

export const scholarNoteVerseLocal = z.object({
  noteId: dbId,
  verseKey: verseKeyRef,
  role: noteVerseRole,
});
export type ScholarNoteVerseLocal = z.infer<typeof scholarNoteVerseLocal>;

export const scholarNotePrinciple = z.object({ noteId: dbId, principleId: dbId });
export type ScholarNotePrinciple = z.infer<typeof scholarNotePrinciple>;

export const scholarNotePrincipleLocal = z.object({ noteId: dbId, principleSlug });
export type ScholarNotePrincipleLocal = z.infer<typeof scholarNotePrincipleLocal>;

export const scholarNoteConcept = z.object({ noteId: dbId, conceptId: dbId });
export type ScholarNoteConcept = z.infer<typeof scholarNoteConcept>;

export const scholarNoteConceptLocal = z.object({ noteId: dbId, conceptSlug });
export type ScholarNoteConceptLocal = z.infer<typeof scholarNoteConceptLocal>;

export const scholarNoteStory = z.object({ noteId: dbId, storyId: dbId });
export type ScholarNoteStory = z.infer<typeof scholarNoteStory>;

export const scholarNoteStoryLocal = z.object({ noteId: dbId, storySlug });
export type ScholarNoteStoryLocal = z.infer<typeof scholarNoteStoryLocal>;

export const scholarNoteRoot = z.object({ noteId: dbId, rootId: dbId });
export type ScholarNoteRoot = z.infer<typeof scholarNoteRoot>;

export const scholarNoteRootLocal = z.object({ noteId: dbId, rootKey });
export type ScholarNoteRootLocal = z.infer<typeof scholarNoteRootLocal>;

/** Etiket her iki ortamda AYNI (SD-01 tablosu). */
export const scholarNoteTag = z.object({ noteId: dbId, tag: nonEmptyText });
export type ScholarNoteTag = z.infer<typeof scholarNoteTag>;

/** Notlar arasi iliski — farkli gorusler yan yana gosterilir. */
export const scholarNoteRelationRow = z
  .object({
    id: dbId,
    sourceNoteId: dbId,
    targetNoteId: dbId,
    relation: noteRelation,
    note: z.string().nullable(),
  })
  .refine((r) => r.sourceNoteId !== r.targetNoteId, {
    message: "bir not kendisiyle iliskilendirilemez",
    path: ["targetNoteId"],
  });
export type ScholarNoteRelationRow = z.infer<typeof scholarNoteRelationRow>;
