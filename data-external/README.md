# data-external/ — lisansı `data/` ile uyuşmayan dış kaynaklar

`data/` ağacı CC BY-NC-SA 4.0 ile yayınlanır ve **bizim derlememizdir**. Lisansı buna
uymayan ya da lisans durumu henüz kesinleşmemiş dış veri `data/` altına karıştırılmaz;
bu ağaca girer. Her alt dizin **kendi `LICENSE.md` dosyasını taşır**.

`pnpm content:import` bu ağacı **okumaz**. Buradaki hiçbir kayıt otomatik olarak siteye
çıkmaz — `docs/KAYNAK_ENVANTERI.md` §0'daki **kütüphane ≠ yayın** ayrımı gereği.

Bir kayıt yayına çıkacaksa: ilgili satır elle `data/sources/content_sources.json` içine
taşınır ve onu **gerçekten kullanan** bir kıssa/kavram/konum kaydına bağlanır. Kullanılmayan
kaynak `/kaynaklar` sayfasında görünmez; o sayfa "sitedeki metnin nereden geldiğini" anlatır,
kütüphane envanteri değildir.

## Alt dizinler

| Dizin | İçerik | Lisans durumu |
|---|---|---|
| `openiti/` | 9 klasik Arapça eserin OpenITI kimliği (metin YOK, yalnız künye) | Eserler kamu malı; derlemenin lisansı teyit bekliyor |
| `corpus-coranicum/` | 2322 eski mushaf yazmasının künyesi + 48 863 sayfa-ayet aralığı (görüntü YOK) | **CC BY-SA 4.0** — `data/`'nın CC BY-NC-SA'sıyla birleştirilemez |

## Üretilmiş dosyalar

`corpus-coranicum/manuscripts.json` ve `pages.json` elle yazılmaz;
`pnpm --filter @kuran/import corpus-coranicum` üretir. Girdi `cache/corpus-coranicum/`
(git clone, repoya girmez). Üretilmiş dosyalar repoda durur ki 335 MB'lık klon olmadan
da çalışılabilsin.
