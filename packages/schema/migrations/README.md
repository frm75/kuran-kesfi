# migrations/

**ÜRETİLMİŞ DOSYALAR — elle düzenlemeyin.**

Kaynak: `packages/schema/src/generate/`. Değişiklik gerekiyorsa Zod şemasını
veya `tables.ts` metadata'sını düzenleyip yeniden üretin:

```bash
pnpm schema:generate          # iki migration'ı üretir
pnpm schema:generate -- --check   # CI: elle düzenleme yakalar
```

## Kapsam

| Dosya | İçerik |
|---|---|
| `postgres/001_init.sql` | §23.2 hoca notu tabloları (10 tablo) |
| `sqlite/001_init.sql` | §23.2 hoca notu tabloları, yerel varyant (12 tablo) |

Çekirdek tablolar (§4, §12.15, §18.4, §19.6) burada **değildir**;
`infra/db/schema.sql` içinde elle yazılmış hâlde durur. Gerekçe ve açık karar:
`packages/schema/src/generate/tables.ts` başındaki not ve `docs/BACKLOG.md`.

## Neden iki dosya farklı

SD-01: yerel `kuran-extract` aracında çekirdek veri (verse, principle, concept,
story, root) yoktur. Ara tablolar orada iş anahtarı metni tutar
(`verse_key`, `principle_slug`…) ve bu kolonlarda yabancı anahtar bulunmaz;
çözümleme import anında sunucuda yapılır.

`transcript` ve `transcript_segment` yalnızca SQLite'ta üretilir — transkript
sunucuya taşınmaz.

## SQLite uyarısı (N1)

Dosyadaki `PRAGMA foreign_keys = ON;` yalnızca betiği çalıştıran bağlantı için
geçerlidir. **Uygulama her bağlantı açtığında da çalıştırmalıdır**
(better-sqlite3: `db.pragma('foreign_keys = ON')`).

## Doğrulandı

- PostgreSQL'de boş test veritabanında hatasız çalışır (10 tablo)
- SQLite'ta hatasız çalışır (12 tablo), `PRAGMA foreign_key_check` temiz
- `--check` modu elle düzenlemeyi yakalar
- Tablo sırası FK bağımlılığından topolojik olarak çözülür; döngü hata verir
