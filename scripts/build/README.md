# Statik JSON üretimi ve referans linter

PostgreSQL → `apps/web/public/data/*.json`. Üretimde veritabanı yoktur; site yalnızca bu
dosyalarla çalışır (plan §6).

## Çalıştırma

```bash
pnpm build:data     # JSON üret
pnpm lint:refs      # referans linter
pnpm build          # üçü sırayla: build:data -> lint:refs -> build:web
```

`pnpm build` linter'dan geçmezse **durur** — plan §20.1 gereği hatalı referansla build tamamlanmaz.

> **Uyarı:** Kök script adı `data:import`, `import` değil. `pnpm import` pnpm'in yerleşik
> komutudur ve çalıştırıldığında `pnpm-lock.yaml`'ı siler. Plan §20.1'deki `pnpm import && pnpm build`
> ifadesi bu yüzden `pnpm data:import && pnpm build` olarak uygulanmıştır.

## build.ts — üç katmanlı çıktı

Tek dosyada sure + tüm mealler tutulduğunda Bakara **1179 KB** oluyordu; plan §20.4 ilk yükleme
bütçesi < 200 KB. Veri, kullanım biçimine göre üç katmana bölündü.

| Dosya | Sayı | İçerik |
|---|---|---|
| `surahs_index.json` | 1 | 114 sure üst bilgisi + toplamlar |
| `authors_index.json` | 1 | Meal listesi + **zorunlu atıf bağlantıları** |
| `surah/surah_{id}.json` | 114 | **Çekirdek:** Arapça (Osmani) + çeviriyazı + sayfa/cüz/secde |
| `translation/{yazar}/surah_{id}.json` | 1026 | **Tek meal** — kullanıcı yalnızca seçtiğini indirir |
| `verse/verse_{s}_{v}.json` | 6236 | **Tek ayet + tüm mealler** — ayet paneli, karşılaştırma sepeti |
| `sources.json` | 1 | Kaynak Şeffaflığı (plan §12.10) |

Toplam 7379 dosya, 28,7 MB içerik (diskte 43 MB — 6236 küçük dosyanın blok yükü).

### Ölçülen kazanç

| Senaryo | Ham | gzip |
|---|---|---|
| Bakara, 1 meal (çekirdek + Diyanet) | 256 KB | **68 KB** |
| Bakara, 4 öncelikli meal | 474 KB | ~112 KB |
| Ayet paneli `verse_2_153.json` (9 mealin hepsi) | 2,2 KB | **0,9 KB** |
| `surahs_index.json` | 23,9 KB | 4,3 KB |

Sunucudaki nginx'te `gzip on` ve `application/json` gzip listesinde — doğrulandı.

**`textSimple` ve `textNoVowel` çekirdekte yoktur.** Yalnızca arama indeksi girdisidir ve okuma
ekranında kullanılmaz; her sure dosyasında taşınmaları 158 KB'lık gereksiz yüktü.

Dosya adları alt çizgilidir (plan §20.2); `translation/` altındaki dizin adı yazar slug'ıdır
(tire — URL slug kuralı). Çıktı şemaları `@kuran/schema` (`static_data.ts`) içinde tanımlıdır;
üretici, tüketici (web) ve linter aynı tanımı kullanır.

**Tekrarlanabilir:** Aynı veritabanı bayt bayt aynı çıktıyı üretir. `public/data/` git'e girmez.

**Henüz üretilmeyenler** (ilgili import'lar tamamlandıkça): `story/*.json`, `stories_index.json`,
`locations.json`, `concept/*.json`, `concept_graph.json`, `roots/*.json`, `roots_index.json`,
`search_index.json`, `schedule.json`.

## linter.ts — üç küme denetim

**A. Veritabanı bütünlüğü** — DDL'in ifade edemediği kurallar:
sure/ayet/sayfa/cüz sayıları · `verse_count` tutarlılığı · ayet numarası sürekliliği ·
`verse.id` formülü · nüzul sıralamasının 1..114'ü tam kaplaması · slug biçimi ·
her ilkenin en az bir `primary` ayet dayanağı (plan §18.3) · ilke/konum/kıssa dersi/zaman
çizelgesi kayıtlarının kaynak taşıması (plan §8.1, §8.3) · `verse_relation.reason_ref_id`
çözümlemesi (çok hedefli olduğu için FK konulamıyor) · kavram ağacında döngü.
Kök eşleşmeyen kelime oranı **uyarı** olarak raporlanır, hata değil (plan §20.1).

**B. Üretilen statik JSON** — her dosya Zod şemasına karşı doğrulanır; dosya adı ve yol biçimi,
mükerrer id/slug, ayet sırası ve id formülü kontrol edilir. Katman sayıları denetlenir
(114 sure · yazar başına 114 meal dosyası · 6236 ayet). `authors_index.json` içinde üçten fazla
meal varken `tanzil.net/trans/` geri bağlantısı yoksa **hata** verir (bkz. `data/LICENSE`).
300 KB'ı aşan dosya **uyarı** olarak raporlanır (plan §20.4).

**C. `data/**` elle veri** — dosyalardaki tüm ayet referansları (`2:153`, `12:4-6`)
veritabanına karşı çözülür; çözülmeyen referans build'i durdurur.

### Doğrulama

Linter'ın gerçekten yakaladığı test edildi:

| Bozma | Sonuç |
|---|---|
| Bir sure dosyası silindi | `114 sure dosyasi bekleniyordu, 113 bulundu` |
| `surahs_index.json` bozuldu | `gecersiz JSON — SyntaxError` |
| `data/` içine `2:999` ve `115:1` eklendi | ikisi de yakalandı; `2:153` ve `12:4-6` geçti |
| Veritabanından bir ayet silindi | `ayet sayisi: 6236 olmali` + `sure 2: 286 ilan, 285 gercek` |

### Faz 1'de eklenecek

Tür bazlı **girdi şemaları** (`storyInput`, `principleInput`, `locationInput` …). Şu andaki
`data/**` taraması jenerik: hangi alanda olursa olsun ayet referansı biçimindeki her dizgiyi
bulur ve doğrular. Kıssa/konum/ilke dosyalarının alan yapısı ilk örnek kıssa yazıldığında
netleşecek (plan §9 Faz 1) ve o zaman slug referansları da tür bazlı denetlenecek.
