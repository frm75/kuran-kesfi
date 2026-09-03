# GÖREV 02 — Migration üreticileri (packages/schema, Faz 0)

Ana site projesi. Ön koşul: **GÖREV 01 tamamlanmış** olmalı
(`packages/schema/src/{references,scholar-notes,export,core}.ts` yazılmış,
`tsc --noEmit` temiz, smoke testler geçiyor).

Bu görev, aynı Zod tiplerinden iki SQL migration üretir. Bu, iki projenin
şema uyumunun tek garantisidir: SQL elle yazılmaz, üretilir.

## Çalışma kuralı
Önce plan + etkilenecek dosya listesi sun, onay al, sonra kod yaz. İş bitince
3-5 satır özet.

---

## Oluşturulacak dosyalar

```
packages/schema/
  src/generate/
    types.ts          TableSpec / ColumnSpec ara temsili
    tables.ts         Zod şema → TableSpec eşlemeleri (metadata)
    to-postgres.ts    TableSpec → PostgreSQL DDL
    to-sqlite.ts      TableSpec → SQLite DDL
    cli.ts            pnpm schema:generate
  migrations/
    postgres/001_init.sql     ← üretilen çıktı, elle düzenlenmez
    sqlite/001_init.sql       ← üretilen çıktı, elle düzenlenmez
```

Üretilen SQL dosyalarının başına şu satır konur:
`-- ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: packages/schema/src/`

---

## Yaklaşım — neden ara temsil

Zod şemasından doğrudan SQL üretmek kırılgan: Zod'da tablo adı, birincil anahtar,
yabancı anahtar hedefi, indeks ve UNIQUE kısıtı yoktur. Bu bilgiler `tables.ts`'te
her tabloya **açık metadata** olarak yazılır; Zod ise kolon tiplerinin ve
nullable/enum bilgisinin kaynağı olur.

```ts
// tables.ts — şekil örneği (birebir kopyalama, tasarımı sen tamamla)
{
  name: "scholar_note",
  zod: ScholarNote,
  primaryKey: "id",
  foreignKeys: [
    { column: "scholar_id", references: "scholar(id)", onDelete: "CASCADE" },
    { column: "video_source_id", references: "video_source(id)", onDelete: "CASCADE" },
    { column: "segment_id", references: "transcript_segment(id)", onDelete: "SET NULL" },
  ],
  indexes: [["scholar_id"], ["video_source_id"], ["status"], ["note_type"]],
  unique: [],
}
```

Zod'dan türetilecekler: kolon adı, NULL izni, enum değerleri (CHECK için),
string max (VARCHAR/CHECK için), sayı tipi.

---

## Tip eşlemesi

| Zod | PostgreSQL | SQLite |
|---|---|---|
| PK `number().int().positive()` | `SERIAL PRIMARY KEY` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `number().int()` | `INTEGER` | `INTEGER` |
| `number()` | `DOUBLE PRECISION` | `REAL` |
| `string()` | `TEXT` | `TEXT` |
| `string().max(n)` | `VARCHAR(n)` | `TEXT CHECK (length(x) <= n)` |
| `boolean()` | `BOOLEAN` | `INTEGER CHECK (x IN (0,1))` |
| `string().datetime()` | `TIMESTAMPTZ` | `TEXT` (ISO 8601 UTC) |
| `record(unknown())` (jsonb) | `JSONB` | `TEXT` (JSON string) |
| `enum([...])` | `TEXT CHECK (x IN (...))` | `TEXT CHECK (x IN (...))` |
| `array(number())` (id[]) | `INTEGER[]` | `TEXT` (JSON dizi) |
| `nullable()` | (NULL serbest) | (NULL serbest) |
| nullable değil | `NOT NULL` | `NOT NULL` |

Brand tipleri (`VerseKey`, `ScholarSlug`...) taban tipine düşer: `TEXT`.
Brand yalnızca TypeScript tarafında anlamlıdır.

---

## Kritik noktalar

### N1 — SQLite'ta yabancı anahtar varsayılan KAPALI
Üretilen SQLite dosyasının başına `PRAGMA foreign_keys = ON;` konur. Ayrıca
uygulama açılışında da her bağlantıda çalıştırılmalı (better-sqlite3 bağlantı
kurulumunda). Bunu üretilen SQL'e yazmak yetmez — not olarak belirt.

### N2 — Bileşik birincil anahtarlar
Ara tablolarda (`scholar_note_verse`, `section_verse`, `concept_root`,
`principle_concept`, `story_concept`, `scholar_note_tag`...) `id` yoktur;
`PRIMARY KEY (a, b)` biçiminde bileşik anahtar üretilir. `tables.ts` bunu
`primaryKey: ["note_id", "verse_id"]` gibi dizi olarak destekler.

### N3 — refine'lar SQL'e taşınmaz (bir istisna dışında)
Zod `refine`'ları (ör. `origin=source ise source_id zorunlu`,
`segment_end_sec >= segment_start_sec`) uygulama katmanında kalır.
SQL'e CHECK olarak çevirmeye çalışma — sadece kolon-içi basit kontroller
(enum, max length, boolean 0/1) DDL'e girer.

**İstisna:** `segment_end_sec >= segment_start_sec` gibi aynı satırdaki iki
kolonu karşılaştıran kontroller her iki motorda da CHECK olarak yazılabilir.
Bunları `tables.ts`'te `checks: ["end_sec >= start_sec"]` şeklinde açık liste
olarak ver; Zod'dan otomatik türetmeye çalışma.

### N4 — İş anahtarları için UNIQUE
Sync'in dayandığı anahtarlar veritabanı seviyesinde de benzersiz olmalı:
- `scholar.slug` → UNIQUE
- `video_source (platform, video_id)` → UNIQUE
- `scholar_note (scholar_id, video_source_id, segment_start_sec, note_type)`
  → **DİKKAT:** `scholar_note` tablosunda `segment_start_sec` kolonu yok;
  segment bilgisi `segment_id` üzerinden geliyor. İş anahtarı export
  formatında `segment_start_sec` kullanıyor. Bu uyumsuzluğu **kod yazmadan
  önce kullanıcıya sor** — iki çözüm var:
  (a) `scholar_note`'a denormalize `segment_start_sec` kolonu eklemek
      (§23.2 değişikliği gerektirir, önce ana planda onaylanmalı)
  (b) UNIQUE'i `(scholar_id, video_source_id, segment_id, note_type)` yapmak
      ve import'ta `segment_start_sec`'i `segment_id`'ye çözmek
  Karar verilmeden bu UNIQUE'i yazma.
- `surah.slug`, `story.slug`, `concept.slug`, `principle.slug`,
  `location.slug` → UNIQUE

### N5 — Tablo üretim sırası
FK'ler nedeniyle tablolar bağımlılık sırasına göre yazılmalı (önce `surah`,
sonra `verse`, sonra `translation`...). `tables.ts`'teki diziyi topolojik
sıralamadan geçir; döngü varsa hata ver. Sıralamayı elle sabitlemek yerine
üreticinin çözmesi doğru — yeni tablo eklendiğinde kimse sırayı düşünmesin.

### N6 — İki dosya, ortak tablo kümesi DEĞİL
- `migrations/postgres/001_init.sql` → **tüm** tablolar (core + scholar-notes)
- `migrations/sqlite/001_init.sql` → **yalnızca** §23.2 tabloları
  (`scholar`, `video_source`, `transcript`, `transcript_segment`,
  `scholar_note` + ara tabloları)

Sebebi: yerel extract aracında `verse`, `principle`, `concept` tabloları yok.
Extract iş anahtarı string'leri üretir; çözümleme sunucuda yapılır. Bu yüzden
`scholar_note_verse.verse_id` gibi FK'ler SQLite tarafında **FK olmadan**,
düz `INTEGER`/`TEXT` olarak üretilir — ya da bu ara tablolar SQLite'ta hiç
üretilmez ve bağlantılar JSON kolonunda tutulur.

**Bu da kullanıcıya sorulacak bir karar.** Önerilen: SQLite'ta ara tabloları
üret ama `verse_id` yerine `verse_key TEXT` tut (extract elinde ID yok, "2:153"
var). Bu §23.2'den sapma olur; onay gerekir. Alternatif: extract bağlantıları
`scholar_note` satırında JSON kolonunda tutar, export'ta açar.

---

## CLI
```
pnpm schema:generate          # her iki migration'ı üretir
pnpm schema:generate --check  # üretilen çıktı diskteki ile aynı mı (CI için)
```
`--check` modu, birinin SQL'i elle düzenlemesini yakalar.

---

## Doğrulama (görev bitmeden)
1. `pnpm schema:generate` çalışır, iki dosya üretir
2. PostgreSQL'de `001_init.sql` hatasız çalışır (boş test DB'de)
3. SQLite'ta `001_init.sql` hatasız çalışır (geçici dosyada)
4. `PRAGMA foreign_key_check` temiz döner
5. `--check` modu, dosya elle değiştirilince hata verir
6. Yeni bir tablo `tables.ts`'e eklenince sıralama otomatik çözülür (N5 testi)

---

## Kullanıcıya sorulacaklar (kod yazmadan ÖNCE)
1. **N4** — `scholar_note` iş anahtarı UNIQUE'i: (a) denormalize kolon mu,
   (b) `segment_id` üzerinden mi?
2. **N6** — SQLite'ta ara tablolar: `verse_key TEXT` mi, JSON kolonu mu,
   yoksa başka bir çözüm mü?

Bu ikisi §23.2'yi etkiler; cevap gelmeden üretici yazılmaz.
