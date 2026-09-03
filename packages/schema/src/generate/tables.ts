import type { z } from "zod";
import {
  scholar,
  scholarNote,
  scholarNoteConcept,
  scholarNoteConceptLocal,
  scholarNotePrinciple,
  scholarNotePrincipleLocal,
  scholarNoteRelationRow,
  scholarNoteRoot,
  scholarNoteRootLocal,
  scholarNoteStory,
  scholarNoteStoryLocal,
  scholarNoteTag,
  scholarNoteVerse,
  scholarNoteVerseLocal,
  transcript,
  transcriptSegment,
  videoSource,
} from "../scholar-notes.js";
import type { TableSpec } from "./types.js";

/**
 * Tablo metadata'si — GOREV 02.
 *
 * ## Kapsam
 *
 * Su an YALNIZCA §23.2 hoca notu tablolari uretilir. Cekirdek tablolar
 * (§4, §12.15, §18.4, §19.6) elle yazilmis `infra/db/schema.sql` dosyasindadir.
 *
 * Gerekce: cift migration'a gercekten ihtiyac duyan kisim hoca notlaridir —
 * yerel `kuran-extract` SQLite, site PostgreSQL kullanir. Cekirdek veri yerel
 * projede yoktur. GOREV 02 / N6 postgres migration'inin tum tablolari
 * icermesini soyluyor; bu, calisan schema.sql'in uretilen dosyayla
 * DEGISTIRILMESI demektir ve ayri bir onay gerektirir (bkz. docs/BACKLOG.md).
 *
 * ## SD-01: ayni tablo, iki motorda farkli kolon
 *
 * Ara tablolar iki kez tanimlanir — ayni `name`, farkli `zod` ve `targets`.
 * Extract'te cekirdek veri olmadigi icin orada `verse_id` degil `verse_key`
 * tutulur; cozumleme import aninda sunucuda yapilir.
 */

const both = ["postgres", "sqlite"] as const;
const onlyPostgres = ["postgres"] as const;
const onlySqlite = ["sqlite"] as const;

type ObjectSchema = z.ZodObject<z.ZodRawShape>;
const asObject = (s: unknown): ObjectSchema => s as ObjectSchema;

export const tables: readonly TableSpec[] = [
  {
    name: "scholar",
    zod: asObject(scholar),
    primaryKey: "id",
    unique: [["slug"]],
    targets: both,
    comment: "Hoca. slug is anahtaridir (GOREV 02 / N4).",
  },
  {
    name: "video_source",
    zod: asObject(videoSource),
    primaryKey: "id",
    foreignKeys: [{ column: "scholar_id", references: "scholar(id)", onDelete: "CASCADE" }],
    unique: [["platform", "video_id"]],
    indexes: [["scholar_id"]],
    targets: both,
    comment: "Video kaynagi. (platform, video_id) is anahtaridir.",
  },
  {
    name: "transcript",
    zod: asObject(transcript),
    primaryKey: "id",
    foreignKeys: [
      { column: "video_source_id", references: "video_source(id)", onDelete: "CASCADE" },
    ],
    indexes: [["video_source_id"]],
    targets: onlySqlite,
    comment: "YALNIZCA YEREL — export paketine girmez, sunucuda satiri olusmaz (SD-01).",
  },
  {
    name: "transcript_segment",
    zod: asObject(transcriptSegment),
    primaryKey: "id",
    foreignKeys: [{ column: "transcript_id", references: "transcript(id)", onDelete: "CASCADE" }],
    indexes: [["transcript_id"]],
    checks: ["end_sec >= start_sec"],
    targets: onlySqlite,
    comment: "YALNIZCA YEREL (SD-01).",
  },
  {
    name: "scholar_note",
    zod: asObject(scholarNote),
    primaryKey: "id",
    foreignKeys: [
      { column: "scholar_id", references: "scholar(id)", onDelete: "CASCADE" },
      { column: "video_source_id", references: "video_source(id)", onDelete: "CASCADE" },
      // segment_id yalnizca yerelde dolar; sunucuda transcript_segment tablosu
      // olmadigi icin FK yalnizca SQLite'ta anlamli. to-postgres bu FK'yi atar.
      { column: "segment_id", references: "transcript_segment(id)", onDelete: "SET NULL" },
    ],
    indexes: [["scholar_id"], ["video_source_id"], ["status"], ["note_type"]],
    // SD-01: is anahtari, her iki motorda ayni
    unique: [["scholar_id", "video_source_id", "segment_start_sec", "note_type"]],
    // N3 istisnasi: ayni satirdaki iki kolon
    checks: ["segment_end_sec >= segment_start_sec"],
    targets: both,
  },

  // --- ara tablolar: sunucu varyantlari (verse_id / *_id FK) ---
  {
    name: "scholar_note_verse",
    zod: asObject(scholarNoteVerse),
    primaryKey: ["note_id", "verse_id"],
    foreignKeys: [{ column: "note_id", references: "scholar_note(id)", onDelete: "CASCADE" }],
    indexes: [["verse_id"]],
    targets: onlyPostgres,
    comment: "verse_id FK'si cekirdek semada tanimlidir (infra/db/schema.sql).",
  },
  {
    name: "scholar_note_principle",
    zod: asObject(scholarNotePrinciple),
    primaryKey: ["note_id", "principle_id"],
    foreignKeys: [{ column: "note_id", references: "scholar_note(id)", onDelete: "CASCADE" }],
    targets: onlyPostgres,
  },
  {
    name: "scholar_note_concept",
    zod: asObject(scholarNoteConcept),
    primaryKey: ["note_id", "concept_id"],
    foreignKeys: [{ column: "note_id", references: "scholar_note(id)", onDelete: "CASCADE" }],
    targets: onlyPostgres,
  },
  {
    name: "scholar_note_story",
    zod: asObject(scholarNoteStory),
    primaryKey: ["note_id", "story_id"],
    foreignKeys: [{ column: "note_id", references: "scholar_note(id)", onDelete: "CASCADE" }],
    targets: onlyPostgres,
  },
  {
    name: "scholar_note_root",
    zod: asObject(scholarNoteRoot),
    primaryKey: ["note_id", "root_id"],
    foreignKeys: [{ column: "note_id", references: "scholar_note(id)", onDelete: "CASCADE" }],
    targets: onlyPostgres,
  },

  // --- ara tablolar: yerel varyantlar (is anahtari metni, FK yok) ---
  {
    name: "scholar_note_verse",
    zod: asObject(scholarNoteVerseLocal),
    primaryKey: ["note_id", "verse_key"],
    foreignKeys: [{ column: "note_id", references: "scholar_note(id)", onDelete: "CASCADE" }],
    targets: onlySqlite,
    comment: "Yerelde verse tablosu yok; is anahtari metni tutulur (SD-01).",
  },
  {
    name: "scholar_note_principle",
    zod: asObject(scholarNotePrincipleLocal),
    primaryKey: ["note_id", "principle_slug"],
    foreignKeys: [{ column: "note_id", references: "scholar_note(id)", onDelete: "CASCADE" }],
    targets: onlySqlite,
  },
  {
    name: "scholar_note_concept",
    zod: asObject(scholarNoteConceptLocal),
    primaryKey: ["note_id", "concept_slug"],
    foreignKeys: [{ column: "note_id", references: "scholar_note(id)", onDelete: "CASCADE" }],
    targets: onlySqlite,
  },
  {
    name: "scholar_note_story",
    zod: asObject(scholarNoteStoryLocal),
    primaryKey: ["note_id", "story_slug"],
    foreignKeys: [{ column: "note_id", references: "scholar_note(id)", onDelete: "CASCADE" }],
    targets: onlySqlite,
  },
  {
    name: "scholar_note_root",
    zod: asObject(scholarNoteRootLocal),
    primaryKey: ["note_id", "root_key"],
    foreignKeys: [{ column: "note_id", references: "scholar_note(id)", onDelete: "CASCADE" }],
    targets: onlySqlite,
  },

  {
    name: "scholar_note_tag",
    zod: asObject(scholarNoteTag),
    primaryKey: ["note_id", "tag"],
    foreignKeys: [{ column: "note_id", references: "scholar_note(id)", onDelete: "CASCADE" }],
    indexes: [["tag"]],
    targets: both,
    comment: "Her iki ortamda AYNI (SD-01).",
  },
  {
    name: "scholar_note_relation",
    zod: asObject(scholarNoteRelationRow),
    primaryKey: "id",
    foreignKeys: [
      { column: "source_note_id", references: "scholar_note(id)", onDelete: "CASCADE" },
      { column: "target_note_id", references: "scholar_note(id)", onDelete: "CASCADE" },
    ],
    unique: [["source_note_id", "target_note_id", "relation"]],
    checks: ["source_note_id <> target_note_id"],
    targets: both,
    comment: "Farkli gorusler yan yana gosterilir (CLAUDE.md kural 4).",
  },
];

/** Bir hedef icin uretilecek tablolar. */
export function tablesFor(target: "postgres" | "sqlite"): TableSpec[] {
  return tables.filter((t) => (t.targets as readonly string[]).includes(target));
}
