# data/scripture — lisans

**Bu dizin `data/LICENSE` (CC BY-NC-SA 4.0) kapsamında DEĞİLDİR.** İki ayrı içerik var:

## books.json — bizim derlememiz

Kitab-ı Mukaddes kitaplarının adları, sırası ve alternatif yazımları. Yalnızca AD listesidir,
kutsal metin içermez. Projenin kendi derlemesi; `data/LICENSE` (CC BY-NC-SA 4.0) geçerlidir.

## quotes.json — üçüncü tarafa ait, iktibas

Kaynak: **Kutsal Kitap (Yeni Çeviri)** — © Kitab-ı Mukaddes Şirketi · Yeni Yaşam Yayınları.
<https://kitabimukaddes.com/>

Bu metin **teliflidir ve yeniden lisanslanmamıştır.** Burada FSEK m. 35 (iktibas) kapsamında,
sınırlı ve kaynak göstererek yer alır. Uygulanan sınırlar `scripts/import/scripture.ts`
içinde kodlanmıştır:

- yalnızca bir Kur'an mealinin dipnotunda **atıf yapılan** ayetler alınır
- her alıntı en fazla **200 karakter**; uzun ayet kesilir ve `…` ile biter
- her alıntı, kaynak künyesi ve yayıncı bağlantısıyla birlikte gösterilir
- bütün bir bölüm veya kitap hiçbir koşulda alınmaz

Alınan ayet sayısı Kutsal Kitap'ın 30.182 ayetinin yaklaşık %1'idir ve her biri başka bir
kaynağın (mealin) ona atıf yapması nedeniyle buradadır.

Bu model projede yeni değildir: Diyanet tefsiri için de aynı kural uygulanıyor
(CLAUDE.md — "özet + en fazla 200 karakter alıntı + kaynak link; toplu kopya yok").

## Neden kamu malı bir çeviri kullanılmadı

2026-09-06'da araştırıldı (`docs/DURUM.md`):

| Çeviri | Durum |
|---|---|
| Kutsal Kitap Yeni Çeviri (2001/2008) | Telifli — Kitab-ı Mukaddes Şti. |
| Kitab-ı Mukaddes 1941 (Latin harfli) | Telif durumu belirsiz; hukuki karar gerektirir |
| Ali Bey–Kieffer 1827 / 1886 | Kamu malı, ama **Arap harfli Osmanlıca** — bugünün okuru için kullanılamaz |
| `seven1m/open-bibles` içindeki `tur-turkish.osis.xml` | README'de "Public Domain" yazıyor ama `<rights/>` alanı **boş** ve metin birebir Yeni Çeviri (2001). Etiket yanlış; kamu malı sayılamaz. |

Yani açık lisanslı, modern Türkçe, tam Kutsal Kitap metni bulunamadı. Böyle bir metin
bulunursa ya da yayıncıdan yazılı izin alınırsa bu dosya ve bu sınırlar yeniden gözden
geçirilmelidir.
