-- ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: packages/schema/src/
-- Hedef: SQLite (yerel kuran-extract) · Kapsam: §23.2 hoca notları
--
-- N1 UYARI: SQLite'ta yabancı anahtarlar varsayılan olarak KAPALIDIR.
-- Aşağıdaki PRAGMA yalnızca bu betiği çalıştıran bağlantı için geçerlidir.
-- Uygulama her bağlantı açtığında da çalıştırmalıdır
-- (better-sqlite3: db.pragma('foreign_keys = ON')).
--
-- Yerelde çekirdek tablolar (verse, principle, concept, story, root) YOKTUR;
-- ara tablolar iş anahtarı metni tutar (verse_key, principle_slug…) ve bu
-- kolonlarda FK bulunmaz. Çözümleme import anında sunucuda yapılır (SD-01).

PRAGMA foreign_keys = ON;

BEGIN;

-- Hoca. slug is anahtaridir (GOREV 02 / N4).
CREATE TABLE "scholar" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel_name" TEXT,
  "channel_url" TEXT,
  "note" TEXT,
  UNIQUE ("slug")
);

-- Video kaynagi. (platform, video_id) is anahtaridir.
CREATE TABLE "video_source" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "scholar_id" INTEGER NOT NULL,
  "platform" TEXT NOT NULL CHECK ("platform" IN ('youtube', 'other')),
  "video_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "published_at" TEXT,
  "duration_sec" INTEGER,
  UNIQUE ("platform", "video_id"),
  FOREIGN KEY ("scholar_id") REFERENCES scholar(id) ON DELETE CASCADE
);
CREATE INDEX "video_source_scholar_id_idx" ON "video_source" ("scholar_id");

-- YALNIZCA YEREL — export paketine girmez, sunucuda satiri olusmaz (SD-01).
CREATE TABLE "transcript" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "video_source_id" INTEGER NOT NULL,
  "source" TEXT NOT NULL CHECK ("source" IN ('auto_captions', 'manual', 'whisper')),
  "language" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  FOREIGN KEY ("video_source_id") REFERENCES video_source(id) ON DELETE CASCADE
);
CREATE INDEX "transcript_video_source_id_idx" ON "transcript" ("video_source_id");

-- YALNIZCA YEREL (SD-01).
CREATE TABLE "transcript_segment" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "transcript_id" INTEGER NOT NULL,
  "start_sec" INTEGER NOT NULL,
  "end_sec" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  CHECK (end_sec >= start_sec),
  FOREIGN KEY ("transcript_id") REFERENCES transcript(id) ON DELETE CASCADE
);
CREATE INDEX "transcript_segment_transcript_id_idx" ON "transcript_segment" ("transcript_id");

CREATE TABLE "scholar_note" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "scholar_id" INTEGER NOT NULL,
  "video_source_id" INTEGER NOT NULL,
  "segment_id" INTEGER,
  "segment_start_sec" INTEGER NOT NULL,
  "segment_end_sec" INTEGER NOT NULL,
  "note_type" TEXT NOT NULL CHECK ("note_type" IN ('tefsir', 'nuzul_sebebi', 'ilke_aciklamasi', 'yaygin_anlayisa_farkli_bakis', 'kissa_detayi', 'kavram_aciklamasi', 'kok_aciklamasi', 'genel')),
  "summary" TEXT NOT NULL CHECK (length("summary") <= 2000),
  "quote" TEXT CHECK (length("quote") <= 200),
  "deep_link" TEXT NOT NULL,
  "confidence" TEXT NOT NULL CHECK ("confidence" IN ('kesin', 'muhtemel', 'tartismali')),
  "status" TEXT NOT NULL CHECK ("status" IN ('draft', 'reviewed', 'published')),
  "reviewer_id" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  UNIQUE ("scholar_id", "video_source_id", "segment_start_sec", "note_type"),
  CHECK (segment_end_sec >= segment_start_sec),
  FOREIGN KEY ("scholar_id") REFERENCES scholar(id) ON DELETE CASCADE,
  FOREIGN KEY ("video_source_id") REFERENCES video_source(id) ON DELETE CASCADE,
  FOREIGN KEY ("segment_id") REFERENCES transcript_segment(id) ON DELETE SET NULL
);
CREATE INDEX "scholar_note_scholar_id_idx" ON "scholar_note" ("scholar_id");
CREATE INDEX "scholar_note_video_source_id_idx" ON "scholar_note" ("video_source_id");
CREATE INDEX "scholar_note_status_idx" ON "scholar_note" ("status");
CREATE INDEX "scholar_note_note_type_idx" ON "scholar_note" ("note_type");

-- Yerelde verse tablosu yok; is anahtari metni tutulur (SD-01).
CREATE TABLE "scholar_note_verse" (
  "note_id" INTEGER NOT NULL,
  "verse_key" TEXT NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('primary', 'secondary')),
  PRIMARY KEY ("note_id", "verse_key"),
  FOREIGN KEY ("note_id") REFERENCES scholar_note(id) ON DELETE CASCADE
);

CREATE TABLE "scholar_note_principle" (
  "note_id" INTEGER NOT NULL,
  "principle_slug" TEXT NOT NULL,
  PRIMARY KEY ("note_id", "principle_slug"),
  FOREIGN KEY ("note_id") REFERENCES scholar_note(id) ON DELETE CASCADE
);

CREATE TABLE "scholar_note_concept" (
  "note_id" INTEGER NOT NULL,
  "concept_slug" TEXT NOT NULL,
  PRIMARY KEY ("note_id", "concept_slug"),
  FOREIGN KEY ("note_id") REFERENCES scholar_note(id) ON DELETE CASCADE
);

CREATE TABLE "scholar_note_story" (
  "note_id" INTEGER NOT NULL,
  "story_slug" TEXT NOT NULL,
  PRIMARY KEY ("note_id", "story_slug"),
  FOREIGN KEY ("note_id") REFERENCES scholar_note(id) ON DELETE CASCADE
);

CREATE TABLE "scholar_note_root" (
  "note_id" INTEGER NOT NULL,
  "root_key" TEXT NOT NULL,
  PRIMARY KEY ("note_id", "root_key"),
  FOREIGN KEY ("note_id") REFERENCES scholar_note(id) ON DELETE CASCADE
);

-- Her iki ortamda AYNI (SD-01).
CREATE TABLE "scholar_note_tag" (
  "note_id" INTEGER NOT NULL,
  "tag" TEXT NOT NULL,
  PRIMARY KEY ("note_id", "tag"),
  FOREIGN KEY ("note_id") REFERENCES scholar_note(id) ON DELETE CASCADE
);
CREATE INDEX "scholar_note_tag_tag_idx" ON "scholar_note_tag" ("tag");

-- Farkli gorusler yan yana gosterilir (CLAUDE.md kural 4).
CREATE TABLE "scholar_note_relation" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "source_note_id" INTEGER NOT NULL,
  "target_note_id" INTEGER NOT NULL,
  "relation" TEXT NOT NULL CHECK ("relation" IN ('agrees', 'disagrees', 'nuances', 'elaborates')),
  "note" TEXT,
  UNIQUE ("source_note_id", "target_note_id", "relation"),
  CHECK (source_note_id <> target_note_id),
  FOREIGN KEY ("source_note_id") REFERENCES scholar_note(id) ON DELETE CASCADE,
  FOREIGN KEY ("target_note_id") REFERENCES scholar_note(id) ON DELETE CASCADE
);

COMMIT;
