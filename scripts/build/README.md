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

## build.ts — üretilen dosyalar

| Dosya | İçerik |
|---|---|
| `surahs_index.json` | 114 sure üst bilgisi + toplamlar (sure/ayet/sayfa/cüz) |
| `surah/surah_{id}.json` | Sure + ayetleri: Osmani/sade/harekesiz metin, transkripsiyon, sayfa, cüz, secde, mealler |
| `sources.json` | Kaynak Şeffaflığı sayfası için kaynak listesi (plan §12.10) |

Dosya adları alt çizgilidir (plan §20.2). Çıktı şemaları `@kuran/schema`
(`static_data.ts`) içinde tanımlıdır; hem üretici hem tüketici hem linter aynı tanımı kullanır.

**Tekrarlanabilir:** Aynı veritabanı bayt bayt aynı çıktıyı üretir (doğrulandı). Bu yüzden
çıktıya zaman damgası, sürüm numarası veya rastgele değer gömülmez.

`public/data/` git'e girmez; her build'de yeniden üretilir.

**Henüz üretilmeyenler** (ilgili import'lar tamamlandıkça eklenecek): `story/*.json`,
`stories_index.json`, `locations.json`, `concept/*.json`, `concept_graph.json`,
`roots/*.json`, `roots_index.json`, `search_index.json`, `schedule.json`.
Ayet başına dosya (`verse/verse_2_153.json`) mealler eklendikten sonra üretilecektir; şu an
6236 neredeyse boş dosya anlamına gelirdi.

## linter.ts — üç küme denetim

**A. Veritabanı bütünlüğü** — DDL'in ifade edemediği kurallar:
sure/ayet/sayfa/cüz sayıları · `verse_count` tutarlılığı · ayet numarası sürekliliği ·
`verse.id` formülü · nüzul sıralamasının 1..114'ü tam kaplaması · slug biçimi ·
her ilkenin en az bir `primary` ayet dayanağı (plan §18.3) · ilke/konum/kıssa dersi/zaman
çizelgesi kayıtlarının kaynak taşıması (plan §8.1, §8.3) · `verse_relation.reason_ref_id`
çözümlemesi (çok hedefli olduğu için FK konulamıyor) · kavram ağacında döngü.
Kök eşleşmeyen kelime oranı **uyarı** olarak raporlanır, hata değil (plan §20.1).

**B. Üretilen statik JSON** — her dosya Zod şemasına karşı doğrulanır; dosya adı biçimi,
mükerrer id/slug, ayet sırası ve id formülü kontrol edilir.

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
