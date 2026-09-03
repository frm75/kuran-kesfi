# ŞEMA DEĞİŞİKLİĞİ — §23.2 (SD-01)

Durum: **onaylandı** · Etkilenen: `docs/PROJE_PLANI.md` §23.2,
`packages/schema/src/scholar-notes.ts`, her iki migration

Bu not, `PROJE_PLANI.md` §23.2'ye işlendikten sonra arşivlenebilir. GÖREV 02
(migration üreticisi) bu değişiklik plana yansımadan başlatılmaz.

---

## Gerekçe

Export paketi `transcript` ve `transcript_segment` taşımaz — transkript UI'da
gösterilmez, yalnızca ekstraksiyon kaynağıdır ve yerel makinede kalır.

Bunun sonucu: sunucuda `transcript_segment` satırı hiç oluşmaz. Dolayısıyla
`scholar_note.segment_id` sunucuda **hiçbir zaman dolamaz** — işaret edeceği
satır yoktur.

Oysa sync iş anahtarı `(scholar_slug, video_id, segment_start_sec, note_type)`
olarak tanımlı. Bu anahtarın veritabanı seviyesinde UNIQUE olarak
kurulabilmesi için `segment_start_sec`'in `scholar_note` satırında bulunması
gerekir.

`deep_link` alanı zaman damgasını içeriyor ama URL içinde gömülü olduğu için
sorgulanabilir/indekslenebilir bir anahtar değildir; ayrı kolon yine gereklidir.

---

## Değişiklik 1 — scholar_note'a iki kolon eklenir

`scholar_note` tablosuna:

```
segment_start_sec  INTEGER NOT NULL
segment_end_sec    INTEGER NOT NULL
```

`segment_id` kolonu **kalır** ama anlamı netleşir:

| Ortam | `segment_id` | `segment_start_sec` / `segment_end_sec` |
|---|---|---|
| Yerel (SQLite, extract) | `transcript_segment(id)`'ye FK, dolu | dolu |
| Sunucu (PostgreSQL) | her zaman NULL | dolu |

Export sırasında `segment_id` → start/end saniyeye çözülür ve pakete saniye
değerleri yazılır. `segment_id` export paketine **girmez**.

### Kısıt
```sql
CHECK (segment_end_sec >= segment_start_sec)
```
(GÖREV 02 / N3'teki "aynı satırdaki iki kolon" istisnası kapsamında DDL'e girer.)

### İş anahtarı UNIQUE
```sql
UNIQUE (scholar_id, video_source_id, segment_start_sec, note_type)
```
Her iki motorda da aynı. Bu, GÖREV 02 / N4'ün cevabıdır: **(a) denormalize
kolon** seçildi.

---

## Değişiklik 2 — Yerel ara tablolar iş anahtarı tutar

GÖREV 02 / N6'nın cevabı: extract'te `verse`, `principle`, `concept`, `story`,
`root` tabloları yoktur ve olmayacaktır (çevrimdışı araç, çekirdek veri
sunucuda). Elde `verse_id` değil `"2:153"` vardır.

Bu nedenle **aynı mantıksal tablo iki ortamda farklı kolon tutar**:

| Tablo | PostgreSQL (sunucu) | SQLite (yerel) |
|---|---|---|
| `scholar_note_verse` | `verse_id INTEGER` FK + `role` | `verse_key TEXT` + `role` |
| `scholar_note_principle` | `principle_id` FK | `principle_slug TEXT` |
| `scholar_note_concept` | `concept_id` FK | `concept_slug TEXT` |
| `scholar_note_story` | `story_id` FK | `story_slug TEXT` |
| `scholar_note_root` | `root_id` FK | `root_key TEXT` |
| `scholar_note_tag` | `tag TEXT` | `tag TEXT` (aynı) |

Yerelde bu kolonlarda FK yoktur; doğrulama `packages/schema`'daki
`references.ts` brand tipleriyle (regex) yapılır.

Çözümleme **import anında sunucuda** olur. Bilinmeyen anahtar → paket
reddedilir, `inbox/rejected/` altına taşınır, hata raporu yazılır (mevcut kural
korunuyor).

### Zod tarafında karşılığı
`scholar-notes.ts` bu ara tablolar için **iki varyant** tanımlar:

- `ScholarNoteVerse` (sunucu satırı: `verse_id`)
- `ScholarNoteVerseLocal` (yerel satırı: `verse_key`)

Diğer dördü için de aynı desen. Ortak alanlar (`note_id`, `role`) paylaşılır.
`export.ts` zaten iş anahtarı kullanıyor, değişmez.

Migration üreticisi (GÖREV 02 / N6) hangi varyantı hangi hedefe yazacağını
`tables.ts` metadata'sından okur.

---

## Değişmeyenler

- `note_type`, `confidence` (`kesin|muhtemel|tartismali`), `status` enum'ları
- `quote` ≤200 karakter kuralı
- `reviewer_id: string, nullable`
- Export zarfı (`schema_version: 1`) — iş anahtarları zaten saniye tabanlıydı,
  bu değişiklik onu DB tarafıyla hizalıyor
- `transcript` / `transcript_segment` export'a girmez

---

## Uygulama sırası

1. Bu not `PROJE_PLANI.md` §23.2'ye işlenir
2. GÖREV 01 çıktısı (`scholar-notes.ts`) güncellenir: iki kolon + `*Local`
   varyantları
3. GÖREV 02 başlatılabilir; N4 ve N6 artık cevaplı
4. Extract projesi GÖREV E01 Bölüm B'ye geçebilir
