# Kaynak import scriptleri

Bu scriptler **yalnızca build makinesinde** çalışır. Üretim sunucusunda veritabanı yoktur ve site
build'i internet gerektirmez (plan §6, §1.7).

## Ön koşullar

```bash
pnpm db:up          # kuran-pg container'ı ayakta olmalı
cp .env.example .env && chmod 600 .env
```

## Çalıştırma

```bash
pnpm --filter @kuran/import tanzil     # veya: pnpm import
```

## Kurallar (plan §20.1)

- **İdempotent.** Her script tek başına ve tekrar çalıştırılabilir; upsert kullanır. İkinci
  çalıştırma aynı sonucu verir.
- **Tek seferlik çekim.** Her kaynak bir kez indirilip `cache/` altına alınır; sonraki
  çalıştırmalar ağdan veri çekmez. `cache/` git'e girmez.
- **Yapay `sleep` yok.** Eş zamanlılık `p-limit` ile `IMPORT_CONCURRENCY` kadar sınırlanır.
- **Sessiz atlama yok.** Eşleşmeyen veya eksik her kayıt `reports/<script>.md` dosyasına yazılır.
- **İşlem bütünlüğü.** Yazma tek transaction içindedir; hata hâlinde geri alınır.

Önbelleği tazelemek için ilgili dosyayı `cache/` altından silin.

## tanzil.ts

`surah` ve `verse` tablolarını doldurur. Tanzil tek gerçek kaynaktır (plan §20.1): sure/ayet
numaralandırması, Arapça metin, sayfa, cüz, secde ve nüzul sırası buradan gelir.

| Kaynak | Adres | Veri |
|---|---|---|
| Tanzil metadata | `tanzil.net/res/text/metadata/quran-data.xml` | sure listesi, sayfa/cüz/secde sınırları, nüzul sırası |
| Tanzil uthmani | `tanzil.net/pub/download/…quranType=uthmani` | `text_uthmani` |
| Tanzil simple | `…quranType=simple` | `text_simple` |
| Tanzil simple-clean | `…quranType=simple-clean` | `text_no_vowel` (arama indeksi için) |
| Quran.com API | `api.quran.com/api/v4/chapters?language=tr` | Türkçe sure adları |

**Neden Quran.com:** Tanzil metadata'sında Türkçe sure adı yoktur (Arapça, İngilizce ve
transliterasyon vardır). Türkçe adlar Quran.com API'sinden alınır ve `source` tablosuna
kaydedilir. Her iki kaynağın nüzul sırası birebir uyuşmaktadır (doğrulandı).

**Doğrulanan sabitler:** 114 sure, 6236 ayet, 604 sayfa, 30 cüz, 15 secde ayeti. Sapma hâlinde
import durur.

**Bu script tarafından doldurulmayan alanlar:**

- `surah.revelation_order_noldeke` — Nöldeke sıralaması Tanzil'de yok, ayrı kaynak gerekiyor
- `verse.transcription_tr`, `verse.transcription_en` — ayrı kaynak gerekiyor

## Atıf

Tanzil metni atıf gerektirir ve değiştirilmeden dağıtılmalıdır. Kaynak kayıtları `source`
tablosuna yazılır ve "Kaynak Şeffaflığı" sayfasında gösterilir (plan §9 Faz 5, §12.10).

## Sonraki scriptler

| Script | Durum |
|---|---|
| `acikkuran.ts` | **Beklemede** — `api.acikkuran.com` erişilemiyor (NXDOMAIN). Bkz. `docs/DEPLOY_REPORT.md` §2.3 |
| `quran_com.ts` | Meal kaynağı kararına bağlı |
| `corpus.ts` | Kök ve morfoloji (Quranic Arabic Corpus) |
