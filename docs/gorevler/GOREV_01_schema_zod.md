# GÖREV — packages/schema: Zod tipleri (Faz 0, adım 3)

Bu, ana site projesinin (`Kur'an-ı Kerim Keşif Platformu`) Faz 0 / 3. adımıdır:
ortak `packages/schema` paketinin Zod tiplerini yazmak. SQL migration **bu görevde
yazılmaz** — o bir sonraki görevdir. Bu görevin çıktısı yalnızca Zod tipleridir.

## Bağlam
- `docs/PROJE_PLANI.md` §4, §12.15, §18.4, §19.6, §23.2 şema tanımlarını içerir.
  Şema orada kesindir; bu dosyadaki kararlar onun üstüne yapılmış netleştirmelerdir.
- `packages/schema` iki proje tarafından paylaşılır: ana site + yerel `kuran-extract`.
  Extract projesi buraya git submodule ile bağlanır ve yalnızca üç dosyayı import eder.

## Çalışma kuralı
Önce plan + etkilenecek dosya listesi sun, onay al, sonra yaz. İş bitince 3-5 satır
özet. Bu görevde yalnızca `packages/schema/src/` altındaki dosyalar oluşturulur;
başka hiçbir yere dokunma.

---

## Oluşturulacak dosyalar (dört modül + index)

```
packages/schema/
  package.json          @kuran/schema, type: module, dependency: zod ^3.23
  tsconfig.json         strict: true, noEmit: true, moduleResolution: Bundler
  src/
    references.ts       iş anahtarları (brand + regex)
    scholar-notes.ts    §23.2 hoca notları (site + extract)
    export.ts           projeler arası JSON zarf sözleşmesi
    core.ts             §4, §12.15, §18.4, §19.6 (yalnızca site)
    index.ts            re-export
```

Bölünmenin gerekçesi: extract projesi `core.ts`'e hiç dokunmaz; yalnızca
`references.ts` + `scholar-notes.ts` + `export.ts` import eder. Çekirdek tipler
(verse, principle...) extract'te yok; extract sadece iş anahtarı string'leri üretir.

---

## KESİNLEŞMİŞ KARARLAR (bunları birebir uygula)

### K1 — Üç ayrı confidence enum'u, ASLA birleştirme
Anlamları farklı; ayrı brand'ler arayüzde doğru rozet seçimini sağlar.

| Enum | Nerede | Değerler |
|---|---|---|
| `Confidence` | §4 konum/kronoloji | `kesin \| muhtemel \| rivayet` |
| `NoteConfidence` | §23.2 hoca notu | `kesin \| muhtemel \| tartismali` |
| `RelationConfidence` | §12.15 ayet ilişkisi | `kesin \| muhtemel \| olasi` |

§23.2 için doğru üçüncü değer `tartismali`'dir. (Extract CLAUDE.md'sindeki örnek
JSON'da geçen `"muhtemel"` yasal bir değer ama örnek yanıltıcıydı; enum §23.2'den
alınır.)

### K2 — reviewer_id: string, nullable
Yerel araçta tek kullanıcı; "fatih" gibi bir etiket yeter. Sunucuda üye sistemi yok.
İleride admin paneli gelirse `reviewer` tablosu açılıp FK'ye dönüşür; şimdilik string.

### K3 — §4.6 kullanıcı verisi core.ts'e GİRMEZ
IndexedDB/Dexie tabloları (note, bookmark, progress, memorization, settings,
recent_discoveries, discovery_paths, comparison_basket) sunucuda tutulmaz.
Bunlar ayrı bir `client-state.ts` dosyasına aittir ve **bu görevde yazılmaz**
(Faz 4'te yazılacak). `core.ts` yalnızca PostgreSQL şemasına odaklıdır.

### K4 — video_id doğrulaması platform'a göre koşullu
`VideoSource.video_id` ve export'taki `video_id`:
- `platform === "youtube"` → 11 karakter YouTube id (`youtubeIdRegex`)
- `platform === "other"`   → serbest, min 1 karakter

Bunu Zod `superRefine` veya discriminated union ile uygula; düz `z.string().min(1)`
bırakma. Böylece `references.ts`'teki `YoutubeVideoId` gerçekten kullanılır (ölü
import kalmaz).

### K5 — deep_link
`z.string().url()` yeterli. YouTube `?t=` zorunluluğu koyma — `platform: "other"`
bunu bozar. Gevşek url doğrulaması kalsın.

### K6 — summary üst sınırı
`ScholarNote.summary` için üst sınır **2000 karakter** (`z.string().min(1).max(2000)`).
Özet bizim kendi ifademiz ama yine de makul bir tavan olsun. `quote` ise §23.2 +
telif gereği **≤200** (`QUOTE_MAX = 200`).

---

## Modül içerikleri

### references.ts
Brand + regex ile iş anahtarları. Ham string ile anahtarın karışmasını önler.

- `VerseKey` — regex `^(?:[1-9]|[1-9]\d|10\d|11[0-4]):[1-9]\d*$`
  (sure 1..114, ayet ≥1; üst ayet sınırı import'ta ayrıca doğrulanır). brand `"VerseKey"`.
  **Dikkat:** `1[01]\d` kullanma — 115..119'u kaçak geçirir. Yukarıdaki regex doğrudur.
- `PrincipleSlug`, `ConceptSlug`, `StorySlug`, `ScholarSlug` — ortak slug regex
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`, her biri kendi brand'i.
- `RootKey` — latin transkripsiyon `^[A-Za-z']+$` (ör. "Sbr"); büyük/küçük harf
  korunur, `root.latin` ile birebir eşleşir. Slug kuralından ayrıdır.
- `YoutubeVideoId` — `^[A-Za-z0-9_-]{11}$`, brand.

Her biri için hem `const` (şema) hem `type` (z.infer) export et.

### scholar-notes.ts (§23.2)
DB satır tipleri (id: number içeren "DB'de duran hal"). Enum'lar:
`Platform(youtube|other)`, `TranscriptSource(auto_captions|manual|whisper)`,
`NoteType(tefsir|nuzul_sebebi|ilke_aciklamasi|dogru_bilinen_yanlis|kissa_detayi|
kavram_aciklamasi|kok_aciklamasi|genel)`, `NoteConfidence` (K1), `NoteStatus(draft|
reviewed|published)`, `NoteRelation(agrees|disagrees|nuances|elaborates)`,
`NoteVerseRole(primary|secondary)`. Sabit `QUOTE_MAX = 200`.

Tablolar: `Scholar`, `VideoSource` (K4), `Transcript`, `TranscriptSegment`,
`ScholarNote` (summary K6, quote ≤200, reviewer_id K2), ve ara tablolar
`ScholarNoteVerse` (role'lü), `ScholarNotePrinciple`, `ScholarNoteConcept`,
`ScholarNoteStory`, `ScholarNoteRoot`, `ScholarNoteTag`, `ScholarNoteRelationRow`.

Tarih alanları ISO string: `z.string().datetime({ offset: true })`.
jsonb yok bu modülde.

### export.ts — İKİ PROJENİN SÖZLEŞMESİ
DB satır tiplerinden farkı: **otomatik ID yok**, eşleşme yalnızca iş anahtarlarıyla.
`SCHEMA_VERSION = 1`.

- `ExportScholar` — slug + alanlar (opsiyoneller nullable+optional)
- `ExportVideoSource` — `scholar_slug` ile hocaya bağlanır; K4 uygulanır
- `ExportScholarNote` — bileşik iş anahtarı `(scholar_slug, video_id,
  segment_start_sec, note_type)`. `status` yalnızca `reviewed|published`
  (draft export'a girmez). Referanslar iş anahtarı dizileri:
  `linked_verses: VerseKey[]`, `linked_principles: PrincipleSlug[]`,
  `linked_concepts: ConceptSlug[]`, `linked_stories: StorySlug[]`,
  `linked_roots: RootKey[]`, `tags: string[]` — hepsi `.default([])`.
  `refine`: `segment_end_sec >= segment_start_sec`.
- `ExportPackage` — `{ schema_version: literal(1), exported_at, source:
  literal("local-extract"), scholars[], video_sources[], scholar_notes[] }`
- `checkPackageIntegrity(pkg): string[]` — paket içi çapraz referans kontrolü:
  her `scholar_slug` scholars[]'ta, her `video_id` video_sources[]'ta olmalı.
  (Zod tip doğrular, bu fonksiyon çapraz-referansı doğrular. Import bunu kullanır.)

### core.ts (§4, §12.15, §18.4, §19.6) — yalnızca site
Tüm çekirdek tablolar. Dikkat edilecekler:
- Ortak enum'lar: `RevelationType(mekki|medeni)`, `Confidence` (K1),
  `AuthorSource(acikkuran|quran.com|tanzil|manual)`.
- §4.1 `Surah`, `Verse`, `Author` (priority 1..4 nullable), `Translation`, `Footnote`
- §4.2 `Root`, `RootDiff`, `VersePart` (grammar jsonb → `z.record(z.unknown())`)
- §4.3 `Story`, `StoryPassage`, `StoryLesson`, `Location` (alternatives jsonb),
  `StoryLocation`, `StoryConcept`
- §4.4 `Concept`, `ConceptVerse` (weight 1..3), `ConceptRelation`, `ConceptRoot`
- §4.5 `TimelineEvent` (period `mekke_1|mekke_2|mekke_3|medine`)
- §12.15 `SurahSection` (**refine:** origin=source ise source_id zorunlu),
  `SectionVerse`, `VerseRelation` (relation_type 11 değer; RelationConfidence K1;
  reason_ref_type `concept|root|section|story|event|null`), `Source`
- §18.4 `Principle`, `PrincipleVerse` (role primary|secondary), `PrincipleStory`,
  `PrincipleConcept`
- §19.6 `Subscription` (channel `telegram|whatsapp|email|push`; send_hour 0..23)

id alanları `z.number().int().positive()`; nullable alanlar plandaki (nullable)
işaretine göre. jsonb → `z.record(z.unknown())`. `related_stories`, `source_ids`,
`related_*_ids`, `passage_ids` gibi id dizileri `.default([])`.

### index.ts
`export * from` ile dört modülü yeniden dışa aktar.

---

## Doğrulama (yazım sonrası, bu görevde yapılacak)
1. `pnpm --filter @kuran/schema exec tsc --noEmit` — tip hatası olmamalı.
2. Küçük bir smoke test (`src/__tests__/schema.smoke.ts` veya geçici script):
   - `VerseKey`: `2:153` geçer; `115:1` ve `2:0` reddedilir; `sabir` reddedilir
   - Geçerli `ExportPackage` parse edilir; `checkPackageIntegrity` boş döner
   - `segment_end_sec < segment_start_sec` reddedilir
   - `status: "draft"` export'ta reddedilir
   - `quote` 201 karakter reddedilir
   - K4: youtube video_id 11 char değilse reddedilir; other serbest geçer
   - yetim `scholar_slug` → `checkPackageIntegrity` hata döndürür

Bu testler geçmeden görev tamamlanmış sayılmaz. (VerseKey regex ve K4 koşullu
doğrulama en sık hata yapılan iki yer; testte ikisi de olmalı.)

---

## Sıradaki görev (bunu ŞİMDİ yapma)
Aynı Zod tiplerinden PostgreSQL + SQLite migration üreten
`packages/schema/src/generate/{to-postgres,to-sqlite}.ts`. Ayrı görev, ayrı onay.
