# scripts/sync — hoca notu paketi alımı

Yerel `kuran-extract` projesi hoca notlarını bir JSON zarfıyla gönderir;
`import_notes.ts` onu build veritabanına alır. Plan §23.2.3 ve §23.4.

## Akış

```
inbox/scholar_notes_YYYY-MM-DD.json
inbox/scholar_notes_YYYY-MM-DD.json.sha256
        │
        ├─ sha256 doğrula ────────────┐
        ├─ Zod parse (exportPackage) ─┤
        ├─ checkPackageIntegrity ─────┤  herhangi biri düşerse
        ├─ referansları çözümle ──────┘  → inbox/rejected/
        │
        └─ tek işlemde upsert → inbox/processed/ + reports/import_notes.md
```

## Komutlar

| Komut | Ne yapar |
|---|---|
| `pnpm notes:check` | Doğrular, veritabanına **yazmaz**, dosyayı yerinde bırakır |
| `pnpm notes:import` | Alır ve `inbox/processed/` altına taşır |
| `pnpm --filter @kuran/sync notes <dosya.json>` | Tek paket (inbox dışından da olabilir) |

Reddedilen paket varsa komut **sıfırdan farklı** çıkış kodu verir.

## Paket adı

`scholar_notes_YYYY-MM-DD.json`, istenirse sonuna kebab-case bir etiket:
`scholar_notes_2026-09-04_bakara.json`. Bu kalıba uymayan dosyalar `inbox/`
içinde görmezden gelinir — dizine düşen alakasız bir dosya paket sanılmaz.

## sha256 yan dosyası zorunludur

`sha256sum paket.json > paket.json.sha256` yeterli. Hem bu biçim (`<hash>
dosya`) hem de çıplak hash kabul edilir.

Yan dosya **yoksa paket reddedilir.** Gerekçe: hash'in amacı dosyanın yolda
bozulmadığını göstermek; "yoksa geç" demek denetimi isteğe bağlı yapar ve
isteğe bağlı denetim denetim değildir.

## Neden paketin tamamı reddediliyor

Bir paket tek bir editoryal partidir: bir insan oturup gözden geçirmiş,
"bunlar yayınlanabilir" demiştir. Yarısını alıp yarısını bırakmak, o kişinin
onaylamadığı bir bileşimi yayınlamak olur. Ayrıca bilinmeyen bir ayet anahtarı
genelde tek bir yazım hatası değil, iki projenin veri sürümünün ayrışmasıdır;
o durumda doğru cevap "kısmen al" değil "dur, bak".

Reddedilen paket **silinmez**: `inbox/rejected/` altına zaman damgasıyla
taşınır ve yanına `.hata.txt` yazılır. Gönderen kişinin düzeltip yeniden
göndermesi için gereken tek kanıt odur.

## Yayın kapısı (plan §23.4)

`.env` içindeki `TAKEDOWN_EMAIL` ve `REPO_URL` **ikisi birden dolu değilse**
paket yine alınır ama `published` notlar `reviewed`'e düşürülür ve sebep
rapora yazılır. Veri kaybolmaz, yalnızca yayınlanmaz.

Kapının bir insanın hatırlamasına değil yapılandırmaya bağlı olması
bilerektir: K2 "kaldırma talebi yolu sayfada yazılıdır" diyor, o yol yokken
alıntı yayınlamak verilen sözü tutmamak olur.

## İki davranış ayrıntısı

**Ara tablolar sil-yaz, upsert değil.** Bir nottan ayet çıkarılırsa (paketin
yeni sürümünde artık yok), upsert o satırı olduğu yerde bırakırdı: not artık
bağlı olmadığı bir ayette görünmeye devam ederdi. Aynı işlem içinde silinip
yeniden yazılıyor.

**Birincil ayet garantisi.** `linked_verse_roles` yalnızca istisnaları taşır;
listedeki diğerleri `secondary` sayılır. Notun hiç birincil ayeti yoksa
listedeki **ilk** ayet birincil yapılır ve rapora yazılır — birincil ayeti
olmayan bir not hiçbir ayet sayfasında ana not olarak görünmez, yani sessizce
kaybolurdu.

## Doğrulandı (2026-09-04)

Beş yol da bilerek bozularak sınandı:

| Sınama | Sonuç |
|---|---|
| Geçerli paket | 2 not, 1 hoca, 1 video yazıldı |
| Bozuk sha256 | reddedildi, beklenen/bulunan hash raporda |
| sha256 yan dosyası yok | reddedildi |
| Bilinmeyen ayet / kavram / kök | üçü de ayrı satır olarak raporlandı, paket reddedildi, veritabanına **hiçbir şey yazılmadı** |
| Aynı notun yeni sürümü (ayet ve etiket çıkarılmış) | not `id`'si korundu, artık geçersiz ara satırlar silindi |
| Yayın kapısı kapalı / açık | kapalıyken `published` → `reviewed`; env dolunca `published` korundu |
