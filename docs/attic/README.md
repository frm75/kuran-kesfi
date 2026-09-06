# docs/attic — yayına girmemiş sürümler

Denenmiş, ölçülmüş ama kullanıcı kararıyla geri alınmış çalışmalar. Kod
ağacında durmalarının anlamı yok; tamamen kaybolmaları da doğru değil.

## index.astro.daktilo-2026-09-06 + build_media.ts.daktilo-2026-09-06

2026-09-06'da denenen hero sürümü: logo yok, **perde yok**, başlık ve slogan
satır satır **daktilo efektiyle** (saf CSS `clip-path` + `steps()`, JS yok),
videonun sonunda `tpad` ile donan kare.

Kontrast ölçümü haleyle yapıldı ve iki modda da geçti (en düşük p05 3,19:1).
Kullanıcı görünümü beğenmedi ve eski hâline dönüldü; ayrıntı `docs/DURUM.md`.

Daktilo efekti tek başına sağlamdır ve yeniden kullanılabilir: her satır kendi
kutusunda, `clip-path: inset(0 100% 0 0)` → `inset(0 0 0 0)`, harf sayısı kadar
`steps()`. Dolgu + negatif dikey pay olmadan glif halesi kırpılır.
