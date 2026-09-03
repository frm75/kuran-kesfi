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

**Atıf zorunluluğu:** Tanzil metni değiştirilmeden dağıtılmalı, kaynağı "Tanzil Project" olarak
açıkça belirtilmeli ve `tanzil.net` bağlantısı verilmelidir (bkz. `data/LICENSE`).

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

## acikkuran.ts

`author`, `translation`, `footnote`, `root`, `verse_part` ve `verse.transcription_en` alanlarını
doldurur. **Meal, dipnot, kelime ve kök verisinin birincil kaynağıdır.**

**Lisans:** Açık Kuran deposundaki `LICENCE` dosyası tam **CC BY-NC-SA 4.0** metnidir. Proje
ticari değildir ve `data/` aynı lisansla yayınlanır — ShareAlike şartı karşılanır. **Atıf
zorunludur.**

**Uç:** Yayınlanan REST API'si (`api.acikkuran.com`) 2026 Ağustos'undan beri kapalıdır ve veri
hiçbir depoda yoktur. Site ayakta olduğu için veri kendi sayfa verisi ucundan alınır:

```
/_next/data/<buildId>/<sure>/<ayet>.json
```

Tek istek şunların hepsini döndürür: **50 meal** (23 tr + 27 en) dipnotlarıyla, kelime bazlı
`verse_part`'lar, kök bilgisi (**Türkçe anlamıyla**) ve tam morfoloji.

`buildId` her dağıtımda değişir; her çalıştırmada ana sayfadan yeniden okunur. **Önbellek
anahtarı `buildId` içermez** — aksi hâlde kaynağın her dağıtımı tüm önbelleği geçersiz kılardı.

6236 istek tek seferliktir, `p-limit` ile sınırlanır ve **gzip'li** önbelleğe alınır (~72 MB);
ikinci çalıştırma ağdan veri çekmez.

**Öncelikli mealler** (plan §3.1, orijinal liste — dördü de mevcut):
Diyanet İşleri (1) · Mehmet Okuyan (2) · Mustafa İslamoğlu (3) · Muhammed Esed (4)

**Doldurulmayan:** `root_diff` (kök türevleri) bu uçta yok; ayrı kaynak gerekiyor.

## tanzil_translations.ts — yedek

Tanzil çeviri setinden 9 Türkçe meal + çeviriyazı. **Varsayılan zincirde çalışmaz.** Açık
Kuran'ın erişimi bir kez kesildiği için yedek olarak korunmaktadır. Tanzil meal şartları
`data/LICENSE` içinde kayıtlıdır (ticari olmayan kullanım; üçten fazla meal kullanılırsa
`tanzil.net/trans/` geri bağlantısı zorunlu).

```bash
pnpm --filter @kuran/import tanzil-translations
```

## Sonraki scriptler

| Script | Durum |
|---|---|
| `corpus.ts` | `root_diff` ve ek morfoloji (Quranic Arabic Corpus) — Faz 3 |
