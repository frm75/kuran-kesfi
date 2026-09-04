-- ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: packages/schema/src/
-- Hedef: PostgreSQL · Kapsam: §23.2 hoca notları
--
-- Çekirdek tablolar (§4, §12.15, §18.4, §19.6) bu dosyada DEĞİLDİR;
-- infra/db/schema.sql içinde elle yazılmış hâlde durur. Gerekçe:
-- packages/schema/src/generate/tables.ts başındaki not.
--
-- scholar_note.segment_id sunucuda HER ZAMAN NULL'dur; transcript_segment
-- tablosu sunucuda üretilmez ve ona giden yabancı anahtar yazılmaz (SD-01).

BEGIN;

-- Hoca. slug is anahtaridir (GOREV 02 / N4).
CREATE TABLE "scholar" (
  "id" SERIAL PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel_name" TEXT,
  "channel_url" TEXT,
  "note" TEXT,
  UNIQUE ("slug")
);

-- Video kaynagi. (platform, video_id) is anahtaridir.
CREATE TABLE "video_source" (
  "id" SERIAL PRIMARY KEY,
  "scholar_id" INTEGER NOT NULL,
  "platform" TEXT NOT NULL CHECK ("platform" IN ('youtube', 'other')),
  "video_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "published_at" TIMESTAMPTZ,
  "duration_sec" INTEGER,
  UNIQUE ("platform", "video_id"),
  FOREIGN KEY ("scholar_id") REFERENCES scholar(id) ON DELETE CASCADE
);
CREATE INDEX "video_source_scholar_id_idx" ON "video_source" ("scholar_id");

CREATE TABLE "scholar_note" (
  "id" SERIAL PRIMARY KEY,
  "scholar_id" INTEGER NOT NULL,
  "video_source_id" INTEGER NOT NULL,
  "segment_id" INTEGER,
  "segment_start_sec" INTEGER NOT NULL,
  "segment_end_sec" INTEGER NOT NULL,
  "note_type" TEXT NOT NULL CHECK ("note_type" IN ('tefsir', 'nuzul_sebebi', 'ilke_aciklamasi', 'yaygin_anlayisa_farkli_bakis', 'kissa_detayi', 'kavram_aciklamasi', 'kok_aciklamasi', 'genel')),
  "summary" VARCHAR(2000) NOT NULL,
  "quote" VARCHAR(200),
  "deep_link" TEXT NOT NULL,
  "confidence" TEXT NOT NULL CHECK ("confidence" IN ('kesin', 'muhtemel', 'tartismali')),
  "status" TEXT NOT NULL CHECK ("status" IN ('draft', 'reviewed', 'published')),
  "reviewer_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL,
  UNIQUE ("scholar_id", "video_source_id", "segment_start_sec", "note_type"),
  CHECK (segment_end_sec >= segment_start_sec),
  FOREIGN KEY ("scholar_id") REFERENCES scholar(id) ON DELETE CASCADE,
  FOREIGN KEY ("video_source_id") REFERENCES video_source(id) ON DELETE CASCADE
);
CREATE INDEX "scholar_note_scholar_id_idx" ON "scholar_note" ("scholar_id");
CREATE INDEX "scholar_note_video_source_id_idx" ON "scholar_note" ("video_source_id");
CREATE INDEX "scholar_note_status_idx" ON "scholar_note" ("status");
CREATE INDEX "scholar_note_note_type_idx" ON "scholar_note" ("note_type");

-- verse_id cekirdek verse tablosuna baglanir; migration schema.sql'den SONRA calisir.
CREATE TABLE "scholar_note_verse" (
  "note_id" INTEGER NOT NULL,
  "verse_id" INTEGER NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('primary', 'secondary')),
  PRIMARY KEY ("note_id", "verse_id"),
  FOREIGN KEY ("note_id") REFERENCES scholar_note(id) ON DELETE CASCADE,
  FOREIGN KEY ("verse_id") REFERENCES verse(id) ON DELETE CASCADE
);
CREATE INDEX "scholar_note_verse_verse_id_idx" ON "scholar_note_verse" ("verse_id");

CREATE TABLE "scholar_note_principle" (
  "note_id" INTEGER NOT NULL,
  "principle_id" INTEGER NOT NULL,
  PRIMARY KEY ("note_id", "principle_id"),
  FOREIGN KEY ("note_id") REFERENCES scholar_note(id) ON DELETE CASCADE,
  FOREIGN KEY ("principle_id") REFERENCES principle(id) ON DELETE CASCADE
);

CREATE TABLE "scholar_note_concept" (
  "note_id" INTEGER NOT NULL,
  "concept_id" INTEGER NOT NULL,
  PRIMARY KEY ("note_id", "concept_id"),
  FOREIGN KEY ("note_id") REFERENCES scholar_note(id) ON DELETE CASCADE,
  FOREIGN KEY ("concept_id") REFERENCES concept(id) ON DELETE CASCADE
);

CREATE TABLE "scholar_note_story" (
  "note_id" INTEGER NOT NULL,
  "story_id" INTEGER NOT NULL,
  PRIMARY KEY ("note_id", "story_id"),
  FOREIGN KEY ("note_id") REFERENCES scholar_note(id) ON DELETE CASCADE,
  FOREIGN KEY ("story_id") REFERENCES story(id) ON DELETE CASCADE
);

CREATE TABLE "scholar_note_root" (
  "note_id" INTEGER NOT NULL,
  "root_id" INTEGER NOT NULL,
  PRIMARY KEY ("note_id", "root_id"),
  FOREIGN KEY ("note_id") REFERENCES scholar_note(id) ON DELETE CASCADE,
  FOREIGN KEY ("root_id") REFERENCES root(id) ON DELETE CASCADE
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
  "id" SERIAL PRIMARY KEY,
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
