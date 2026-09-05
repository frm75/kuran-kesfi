-- =============================================================================
-- Kur'an-ı Kerim Keşif Platformu — build aşaması veritabanı şeması
--
-- Kapsam: plan §4 (çekirdek, kelime/kök, kıssa, kavram, siyer),
--         §12.10 (kaynak), §12.15 (keşif katmanı), §18.4 (ilkeler).
--
-- Bot aboneliği (§19.6) BU VERİTABANINDA DEĞİLDİR; ayrı küçük servis ve ayrı
-- veritabanı kullanır — bkz. infra/db/bot_schema.sql (Faz 3).
--
-- Bu veritabanı YALNIZCA build makinesinde çalışır. Üretim sunucusunda
-- veritabanı yoktur; site tamamen statiktir (plan §6).
--
-- Çalıştırma:  psql -h 127.0.0.1 -p $DB_PORT -U $DB_USER -d $DB_NAME -f schema.sql
-- Şema idempotent değildir; sıfırdan kurulum içindir (plan §20.1 tekrarlanabilir build).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Yardımcılar
-- -----------------------------------------------------------------------------

-- Boş metin denetimi için kırpma kümesi.
--
-- `btrim(text)` yalnızca ASCII boşluğu siler; kaynak veride yalnızca kırılmaz
-- boşluk (U+00A0) içeren meal ve dipnot kayıtları bulundu. Bu küme JavaScript
-- `String.prototype.trim()` ile aynı karakterleri kapsar, böylece veritabanı
-- kısıtı ile import katmanındaki `.trim()` aynı sonucu verir.
--
-- Karakterler `chr()` ile kurulur; dosya saf ASCII kalır ve kabuk/heredoc
-- taşımasında bozulmaz.
CREATE FUNCTION blank_trim_set() RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)
              || chr(160)    -- U+00A0 kırılmaz boşluk
              || chr(8203)   -- U+200B sıfır genişlikli boşluk
              || chr(65279)  -- U+FEFF BOM
$$;

-- -----------------------------------------------------------------------------
-- Numaralandırılmış türler
-- -----------------------------------------------------------------------------

-- Güven derecesi (plan §12.9). Konum, kronoloji, tarihsel olay ve ilişki
-- kayıtlarında aynı üç değerli sistem kullanılır. İhtilaf saklanmaz.
CREATE TYPE confidence_level AS ENUM ('kesin', 'muhtemel', 'rivayet');

CREATE TYPE revelation_type AS ENUM ('mekki', 'medeni');

CREATE TYPE author_source AS ENUM ('acikkuran', 'quran.com', 'tanzil', 'manual');

CREATE TYPE story_type AS ENUM ('prophet', 'people', 'person', 'event');

CREATE TYPE concept_relation_type AS ENUM ('co_occurrence', 'cause', 'contrast', 'part_of');

CREATE TYPE timeline_period AS ENUM ('mekke_1', 'mekke_2', 'mekke_3', 'medine');

CREATE TYPE principle_verse_role AS ENUM ('primary', 'secondary');

-- Bir içeriğin kökeni (plan §12.15). origin='source' ise kaynak zorunludur;
-- origin='platform' arayüzde "Platform verisi" etiketiyle ayrılır.
CREATE TYPE content_origin AS ENUM ('source', 'platform');

-- Ayetler arası ilişki türleri (plan §12.5). "Aynı konu ayeti"
-- (same_topic/same_context) ile genel "ilgili" (related) karıştırılmaz;
-- related yalnızca diğer türlere girmeyen durumlar içindir.
CREATE TYPE verse_relation_type AS ENUM (
  'direct_reference', 'same_context', 'same_topic', 'parallel_passage',
  'explanation', 'example', 'contrast', 'same_story', 'same_event',
  'same_root', 'related'
);

CREATE TYPE reason_ref_type AS ENUM ('concept', 'root', 'section', 'story', 'event');

-- -----------------------------------------------------------------------------
-- §12.10 — Kaynak şeffaflığı
--
-- Kaynak sistemi projenin omurgasıdır. Kaynaklı hiçbir içerik <SourceBadge>
-- bileşeni olmadan render edilmez.
--
-- NOT (plan sapması): Plan, kaynak bağlantısını `source_id[]` dizisi olarak
-- tarif ediyor. PostgreSQL dizilerine yabancı anahtar kısıtı konulamadığı için
-- burada tablo başına bağlantı (junction) tabloları kullanıldı; böylece hatalı
-- kaynak referansı veritabanı düzeyinde engellenir. Statik JSON çıktısında alan
-- yine plandaki gibi `sourceIds` dizisi olarak üretilir.
-- -----------------------------------------------------------------------------

CREATE TABLE source (
  id          integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  -- Aynı kaynağın tekrar eklenmesini engelleyen kararlı anahtar
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text NOT NULL CHECK (length(btrim(name)) > 0),
  work_title  text,
  author      text,
  -- Bölüm / sayfa / ayet referansı: "Bakara Suresi, 153. ayet tefsiri"
  reference   text,
  url         text,
  -- Lisans bilgisi zorunludur; lisansı belirsiz kaynak eklenmez (plan §3.1)
  license     text NOT NULL CHECK (length(btrim(license)) > 0),
  note        text
);

COMMENT ON TABLE source IS
  'Plan §12.10. Her kaynaklı kayıt buraya bağlanır. Lisans alanı boş bırakılamaz.';

-- -----------------------------------------------------------------------------
-- §4.1 — Kur'an çekirdeği
--
-- Tanzil tek gerçek kaynaktır. Hiçbir tablo ayet numarasını metin olarak
-- saklamaz; her şey verse_id ile bağlanır (plan §20.1).
-- -----------------------------------------------------------------------------

CREATE TABLE surah (
  -- Doğal anahtar: Tanzil sure numarası 1-114
  id                        smallint PRIMARY KEY CHECK (id BETWEEN 1 AND 114),
  name_tr                   text NOT NULL,
  name_ar                   text NOT NULL,
  name_en                   text NOT NULL,
  slug                      text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  verse_count               smallint NOT NULL CHECK (verse_count > 0),
  revelation_type           revelation_type NOT NULL,
  -- Mısır/Ezher sıralaması — ana referans (plan §11)
  revelation_order_standard smallint NOT NULL UNIQUE CHECK (revelation_order_standard BETWEEN 1 AND 114),
  -- Nöldeke sıralaması — alternatif; farklar arayüzde işaretlenir
  revelation_order_noldeke  smallint CHECK (revelation_order_noldeke BETWEEN 1 AND 114),
  page_start                smallint NOT NULL CHECK (page_start > 0)
);

CREATE TABLE verse (
  -- Deterministik birincil anahtar: surah_id * 1000 + verse_number.
  -- En uzun sure 286 ayettir, çakışma olmaz. Tekrarlanabilir build için
  -- (plan §20.1) identity yerine hesaplanan değer kullanılır; böylece
  -- yeniden import verse_id'leri kaydırmaz.
  id             integer PRIMARY KEY,
  surah_id       smallint NOT NULL REFERENCES surah (id),
  verse_number   smallint NOT NULL CHECK (verse_number > 0),
  text_uthmani   text NOT NULL,
  text_simple    text NOT NULL,
  -- Harekesiz metin — arama indeksi için
  text_no_vowel  text NOT NULL,
  transcription_tr text,
  transcription_en text,
  -- Mushaf sayfası; Diyanet sayfa/cüz kaymaları ayrı alanda tutulur (plan §20.1)
  page           smallint NOT NULL CHECK (page > 0),
  juz            smallint NOT NULL CHECK (juz BETWEEN 1 AND 30),
  sajda          boolean NOT NULL DEFAULT false,
  UNIQUE (surah_id, verse_number),
  CONSTRAINT verse_id_formula CHECK (id = surah_id * 1000 + verse_number)
);

CREATE INDEX verse_surah_idx ON verse (surah_id, verse_number);
CREATE INDEX verse_page_idx  ON verse (page);
CREATE INDEX verse_juz_idx   ON verse (juz);

COMMENT ON COLUMN verse.id IS
  'surah_id * 1000 + verse_number. Yeniden import sonrası değişmez.';

CREATE TABLE author (
  id           integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  -- Kararlı anahtar. Tarayıcıda saklanan meal seçimi (settings.selectedAuthors)
  -- bu slug'ı tutar; sayısal id yeniden build'de kayabileceği için
  -- kullanıcı verisinde id kullanılmaz.
  slug         text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text NOT NULL,
  work_title   text,
  language     char(2) NOT NULL,
  source       author_source NOT NULL,
  -- Telif kuralı (plan §3.1): lisansı belirsiz meal import edilmez.
  license      text NOT NULL CHECK (length(btrim(license)) > 0),
  license_note text,
  url          text,
  is_default   boolean NOT NULL DEFAULT false,
  -- 1-4 öncelikli mealler; diğerleri NULL (plan §3.1)
  priority     smallint UNIQUE CHECK (priority BETWEEN 1 AND 4),
  -- Öncelikli meal aynı zamanda varsayılan olarak açık gelir
  CONSTRAINT author_priority_is_default CHECK (priority IS NULL OR is_default)
);

COMMENT ON TABLE author IS
  'Plan §4.1, §3.1. Öncelikli 4 meal: Diyanet İşleri, Mehmet Okuyan, '
  'Mustafa İslamoğlu, Muhammed Esed (priority 1-4).';

CREATE TABLE translation (
  id        integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  verse_id  integer NOT NULL REFERENCES verse (id) ON DELETE CASCADE,
  author_id integer NOT NULL REFERENCES author (id) ON DELETE CASCADE,
  -- Bos meal anlamsizdir. Kaynakta metni bos veya yalnizca kirilmaz bosluk
  -- (U+00A0) iceren kayitlar bulundugu icin NOT NULL yeterli degil.
  -- blank_trim_set() JS String.prototype.trim() ile ayni karakterleri siler.
  text      text NOT NULL CHECK (btrim(text, blank_trim_set()) <> ''),
  UNIQUE (verse_id, author_id)
);

CREATE INDEX translation_author_idx ON translation (author_id);

CREATE TABLE footnote (
  id             integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  translation_id integer NOT NULL REFERENCES translation (id) ON DELETE CASCADE,
  number         smallint NOT NULL CHECK (number > 0),
  -- Kaynakta (Acik Kuran issue #4) metni bos veya yalnizca U+00A0 iceren
  -- dipnotlar var; NOT NULL yeterli degil.
  text           text NOT NULL CHECK (btrim(text, blank_trim_set()) <> ''),
  UNIQUE (translation_id, number)
);

-- -----------------------------------------------------------------------------
-- §4.2 — Kelime / kök
-- -----------------------------------------------------------------------------

CREATE TABLE root (
  id                    integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  -- Kararlı anahtar; URL'de ve statik dosya adında kullanılır (root_Sbr.json)
  latin                 text NOT NULL UNIQUE,
  arabic                text NOT NULL UNIQUE,
  letters_transcription text,
  meaning_tr            text,
  meaning_en            text,
  -- Kök dizininde ilk harf gruplaması
  first_letter_id       smallint
);

CREATE TABLE root_diff (
  id               integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  root_id          integer NOT NULL REFERENCES root (id) ON DELETE CASCADE,
  form_arabic      text NOT NULL,
  occurrence_count integer NOT NULL DEFAULT 0 CHECK (occurrence_count >= 0),
  UNIQUE (root_id, form_arabic)
);

CREATE TABLE verse_part (
  id               integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  verse_id         integer NOT NULL REFERENCES verse (id) ON DELETE CASCADE,
  sort_number      smallint NOT NULL CHECK (sort_number > 0),
  arabic           text NOT NULL,
  transcription_tr text,
  transcription_en text,
  translation_tr   text,
  translation_en   text,
  -- Kök eşleştirmesi arabic_normalize.ts üzerinden yapılır; eşleşmeyenler
  -- rapora yazılır, sessizce atlanmaz (plan §20.1). Eşleşmeyen kelime NULL kalır.
  root_id          integer REFERENCES root (id),
  root_diff_id     integer REFERENCES root_diff (id),
  -- Quranic Arabic Corpus morfoloji detayı
  grammar          jsonb,
  UNIQUE (verse_id, sort_number)
);

CREATE INDEX verse_part_root_idx ON verse_part (root_id) WHERE root_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- §4.3 — Kıssa katmanı
-- -----------------------------------------------------------------------------

CREATE TABLE story (
  id                  integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  slug                text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title               text NOT NULL,
  type                story_type NOT NULL,
  -- Âdem → İsa → Asr-ı Saadet ekseninde sıra
  chronological_order smallint NOT NULL CHECK (chronological_order > 0),
  era_start           text,
  era_end             text,
  summary             text NOT NULL,
  -- Figür yasağı (plan §20.3): peygamber, sahabe, melek ve insan tasviri
  -- içeremez; yalnızca manzara, mimari, doğa, hat, geometrik desen.
  cover_image         text
);

CREATE TABLE story_related (
  story_id         integer NOT NULL REFERENCES story (id) ON DELETE CASCADE,
  related_story_id integer NOT NULL REFERENCES story (id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, related_story_id),
  CONSTRAINT story_related_not_self CHECK (story_id <> related_story_id)
);

CREATE TABLE story_passage (
  id          integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  story_id    integer NOT NULL REFERENCES story (id) ON DELETE CASCADE,
  -- Anlatı modundaki sıra; kronolojik (plan §8.4)
  "order"     smallint NOT NULL CHECK ("order" > 0),
  title       text NOT NULL,
  surah_id    smallint NOT NULL REFERENCES surah (id),
  verse_start smallint NOT NULL CHECK (verse_start > 0),
  verse_end   smallint NOT NULL CHECK (verse_end > 0),
  -- Sıra tartışmalıysa burada belirtilir (plan §8.4)
  note        text,
  UNIQUE (story_id, "order"),
  CONSTRAINT story_passage_range CHECK (verse_end >= verse_start)
);

CREATE TABLE story_lesson (
  id               integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  story_id         integer NOT NULL REFERENCES story (id) ON DELETE CASCADE,
  "order"          smallint NOT NULL CHECK ("order" > 0),
  -- Kaynağın ifadesini özetler; yorum ve güncel çıkarım eklenmez (plan §8.2)
  text             text NOT NULL,
  source_name      text NOT NULL,
  source_reference text NOT NULL,
  UNIQUE (story_id, "order")
);

COMMENT ON TABLE story_lesson IS
  'Plan §8.1: Her ders maddesi bir kaynağa bağlanır. Kaynaksız ders eklenmez — '
  'story_lesson_source kaydı olmadan referans linter build''i durdurur.';

CREATE TABLE story_lesson_source (
  story_lesson_id integer NOT NULL REFERENCES story_lesson (id) ON DELETE CASCADE,
  source_id       integer NOT NULL REFERENCES source (id),
  PRIMARY KEY (story_lesson_id, source_id)
);

CREATE TABLE location (
  id          integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text NOT NULL,
  modern_name text,
  country     text,
  lat         double precision CHECK (lat BETWEEN -90 AND 90),
  lng         double precision CHECK (lng BETWEEN -180 AND 180),
  -- Zorunlu (plan §8.3). Arayüzde pin biçimini belirler: dolu / kesikli halkalı
  -- / şeffaf (plan §7).
  confidence  confidence_level NOT NULL,
  source_note text NOT NULL,
  -- Farklı görüşler burada saklanır; ihtilaf gizlenmez (plan §1.5, §8.3)
  alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT location_alternatives_is_array CHECK (jsonb_typeof(alternatives) = 'array'),
  -- Koordinat ya tam verilir ya hiç verilmez
  CONSTRAINT location_coords_together CHECK ((lat IS NULL) = (lng IS NULL))
);

CREATE TABLE location_source (
  location_id integer NOT NULL REFERENCES location (id) ON DELETE CASCADE,
  source_id   integer NOT NULL REFERENCES source (id),
  PRIMARY KEY (location_id, source_id)
);

CREATE TABLE story_location (
  story_id          integer NOT NULL REFERENCES story (id) ON DELETE CASCADE,
  location_id       integer NOT NULL REFERENCES location (id),
  -- Kıssanın rotasındaki sıra; harita çizgisi bu sıraya göre çizilir
  "order"           smallint NOT NULL CHECK ("order" > 0),
  event_description text NOT NULL,
  PRIMARY KEY (story_id, location_id, "order")
);

CREATE TABLE story_location_passage (
  story_id        integer NOT NULL,
  location_id     integer NOT NULL,
  "order"         smallint NOT NULL,
  story_passage_id integer NOT NULL REFERENCES story_passage (id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, location_id, "order", story_passage_id),
  FOREIGN KEY (story_id, location_id, "order")
    REFERENCES story_location (story_id, location_id, "order") ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- §4.4 — Kavram katmanı
-- -----------------------------------------------------------------------------

CREATE TABLE concept (
  id         integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_tr    text NOT NULL,
  name_ar    text,
  -- Ansiklopedik, mezhepler üstü; ihtilaflı konularda "farklı görüşler vardır"
  -- notu düşülür (plan §8.5)
  definition text NOT NULL,
  parent_id  integer REFERENCES concept (id),
  CONSTRAINT concept_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE concept_verse (
  concept_id integer NOT NULL REFERENCES concept (id) ON DELETE CASCADE,
  verse_id   integer NOT NULL REFERENCES verse (id) ON DELETE CASCADE,
  -- 1 zayıf, 3 merkezi
  weight     smallint NOT NULL CHECK (weight BETWEEN 1 AND 3),
  -- Platform derlemesiyse NULL kalır; arayüzde "Platform verisi" etiketi çıkar
  source_id  integer REFERENCES source (id),
  PRIMARY KEY (concept_id, verse_id)
);

CREATE INDEX concept_verse_verse_idx ON concept_verse (verse_id);

CREATE TABLE concept_relation (
  source_concept_id integer NOT NULL REFERENCES concept (id) ON DELETE CASCADE,
  target_concept_id integer NOT NULL REFERENCES concept (id) ON DELETE CASCADE,
  relation_type     concept_relation_type NOT NULL,
  weight            smallint NOT NULL CHECK (weight BETWEEN 1 AND 3),
  PRIMARY KEY (source_concept_id, target_concept_id, relation_type),
  CONSTRAINT concept_relation_not_self CHECK (source_concept_id <> target_concept_id)
);

CREATE TABLE concept_root (
  concept_id integer NOT NULL REFERENCES concept (id) ON DELETE CASCADE,
  root_id    integer NOT NULL REFERENCES root (id) ON DELETE CASCADE,
  PRIMARY KEY (concept_id, root_id)
);

-- Kavram tanımının kaynağı (plan §8.5: ansiklopedik, kaynaklı). 2026-09-05'te
-- eklendi — ilke ve konumda vardı, kavramda unutulmuştu; content import'u
-- kaynaksız kavram yazamasın diye tablo açıldı.
CREATE TABLE concept_source (
  concept_id integer NOT NULL REFERENCES concept (id) ON DELETE CASCADE,
  source_id  integer NOT NULL REFERENCES source (id),
  PRIMARY KEY (concept_id, source_id)
);

CREATE TABLE story_concept (
  story_id   integer NOT NULL REFERENCES story (id) ON DELETE CASCADE,
  concept_id integer NOT NULL REFERENCES concept (id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, concept_id)
);

-- -----------------------------------------------------------------------------
-- §4.5 — Siyer / zaman çizelgesi
-- -----------------------------------------------------------------------------

CREATE TABLE timeline_event (
  id          integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "order"     smallint NOT NULL UNIQUE CHECK ("order" > 0),
  title       text NOT NULL,
  description text NOT NULL,
  period      timeline_period NOT NULL,
  approx_year smallint,
  -- Kronoloji ihtilafı gizlenmez (plan §12.9)
  confidence  confidence_level NOT NULL,
  source_note text NOT NULL
);

CREATE TABLE timeline_event_surah (
  timeline_event_id integer NOT NULL REFERENCES timeline_event (id) ON DELETE CASCADE,
  surah_id          smallint NOT NULL REFERENCES surah (id),
  PRIMARY KEY (timeline_event_id, surah_id)
);

CREATE TABLE timeline_event_verse (
  timeline_event_id integer NOT NULL REFERENCES timeline_event (id) ON DELETE CASCADE,
  verse_id          integer NOT NULL REFERENCES verse (id) ON DELETE CASCADE,
  PRIMARY KEY (timeline_event_id, verse_id)
);

CREATE TABLE timeline_event_source (
  timeline_event_id integer NOT NULL REFERENCES timeline_event (id) ON DELETE CASCADE,
  source_id         integer NOT NULL REFERENCES source (id),
  PRIMARY KEY (timeline_event_id, source_id)
);

-- -----------------------------------------------------------------------------
-- §18.4 — İlkeler modülü
-- -----------------------------------------------------------------------------

CREATE TABLE principle (
  id                     integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  slug                   text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_tr                text NOT NULL,
  name_ar                text,
  root_id                integer REFERENCES root (id),
  -- Kısa, kaynaklı tanım (plan §18.2)
  definition             text NOT NULL,
  -- Tefsirlerin ilkeyi nasıl ele aldığı — özet ve kaynaklı
  explanation            text NOT NULL,
  -- Yalnızca tefsir/kaynak temelli; platform yorumu yok (plan §18.2)
  daily_note             text,
  -- Karşıt ilke: adalet ↔ zulüm
  opposite_principle_id  integer REFERENCES principle (id),
  "order"                smallint NOT NULL UNIQUE CHECK ("order" > 0),
  CONSTRAINT principle_opposite_not_self
    CHECK (opposite_principle_id IS NULL OR opposite_principle_id <> id)
);

COMMENT ON TABLE principle IS
  'Plan §18.3: İlke listesi tefsir ve ansiklopedi kaynaklarından derlenir; '
  'platform kendi ilkesini icat etmez. Her ilke en az bir primary ayet '
  'dayanağı ve en az bir kaynak taşımalıdır — referans linter denetler.';

CREATE TABLE principle_source (
  principle_id integer NOT NULL REFERENCES principle (id) ON DELETE CASCADE,
  source_id    integer NOT NULL REFERENCES source (id),
  PRIMARY KEY (principle_id, source_id)
);

CREATE TABLE principle_verse (
  principle_id integer NOT NULL REFERENCES principle (id) ON DELETE CASCADE,
  verse_id     integer NOT NULL REFERENCES verse (id) ON DELETE CASCADE,
  -- primary = doğrudan emir/tavsiye içeren; secondary = ilkeyi örnekleyen
  role         principle_verse_role NOT NULL,
  note         text,
  PRIMARY KEY (principle_id, verse_id)
);

CREATE INDEX principle_verse_verse_idx ON principle_verse (verse_id);

CREATE TABLE principle_story (
  principle_id integer NOT NULL REFERENCES principle (id) ON DELETE CASCADE,
  story_id     integer NOT NULL REFERENCES story (id) ON DELETE CASCADE,
  note         text,
  PRIMARY KEY (principle_id, story_id)
);

CREATE TABLE principle_concept (
  principle_id integer NOT NULL REFERENCES principle (id) ON DELETE CASCADE,
  concept_id   integer NOT NULL REFERENCES concept (id) ON DELETE CASCADE,
  PRIMARY KEY (principle_id, concept_id)
);

-- -----------------------------------------------------------------------------
-- §12.15 — Keşif katmanı
-- -----------------------------------------------------------------------------

-- Sure içi konu başlığı (plan §12.1, §12.15)
CREATE TABLE surah_section (
  id          integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  surah_id    smallint NOT NULL REFERENCES surah (id) ON DELETE CASCADE,
  "order"     smallint NOT NULL CHECK ("order" > 0),
  title       text NOT NULL,
  verse_start smallint NOT NULL CHECK (verse_start > 0),
  verse_end   smallint NOT NULL CHECK (verse_end > 0),
  origin      content_origin NOT NULL,
  source_id   integer REFERENCES source (id),
  note        text,
  UNIQUE (surah_id, "order"),
  CONSTRAINT surah_section_range CHECK (verse_end >= verse_start),
  -- Kaynaktan alınan başlığın kaynağı her zaman görünür olmalıdır (plan §12.15)
  CONSTRAINT surah_section_source_required
    CHECK (origin <> 'source' OR source_id IS NOT NULL)
);

-- Bir ayet birden fazla konuya dahil olabilir; verse_start/verse_end ana
-- aralığı, bu tablo istisnaları ve çakışmaları tutar (plan §12.15).
CREATE TABLE section_verse (
  section_id integer NOT NULL REFERENCES surah_section (id) ON DELETE CASCADE,
  verse_id   integer NOT NULL REFERENCES verse (id) ON DELETE CASCADE,
  PRIMARY KEY (section_id, verse_id)
);

CREATE INDEX section_verse_verse_idx ON section_verse (verse_id);

-- Ayetler arası ilişki (plan §12.5)
CREATE TABLE verse_relation (
  id              integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  source_verse_id integer NOT NULL REFERENCES verse (id) ON DELETE CASCADE,
  target_verse_id integer NOT NULL REFERENCES verse (id) ON DELETE CASCADE,
  relation_type   verse_relation_type NOT NULL,
  -- İlişkinin gerekçesi kullanıcıya gösterilir, boş bırakılamaz:
  --   "Sabır kavramı · aynı kök (ص ب ر) · aynı konu"
  reason          text NOT NULL CHECK (length(btrim(reason)) > 0),
  reason_ref_type reason_ref_type,
  reason_ref_id   integer,
  source_id       integer REFERENCES source (id),
  -- AI önerisi ilişkiler kesin bilgi olarak gösterilmez; arayüzde
  -- "Olası ilişki" etiketiyle ayrılır (plan §12.5, §13)
  confidence      confidence_level NOT NULL,
  note            text,
  UNIQUE (source_verse_id, target_verse_id, relation_type),
  CONSTRAINT verse_relation_not_self CHECK (source_verse_id <> target_verse_id),
  CONSTRAINT verse_relation_reason_ref_pair
    CHECK ((reason_ref_type IS NULL) = (reason_ref_id IS NULL))
);

CREATE INDEX verse_relation_source_idx ON verse_relation (source_verse_id);
CREATE INDEX verse_relation_target_idx ON verse_relation (target_verse_id);

COMMENT ON COLUMN verse_relation.reason_ref_id IS
  'reason_ref_type''a göre concept / root / surah_section / story / '
  'timeline_event id''si. Çoklu hedef tablo olduğundan yabancı anahtar '
  'konulamaz; referans linter doğrular (plan §20.1).';

COMMIT;
