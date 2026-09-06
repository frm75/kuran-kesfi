# data-external/alagas — lisans ve köken

## Eser

**Kur'an-ı Kerim Meali — Mehmet Alagaş.**

Telif hakkı yazarına aittir. Metin projeye ait değildir, `data/LICENSE`
(CC BY-NC-SA 4.0) **kapsamında değildir** ve tarafımızdan yeniden
lisanslanmamıştır. Sitede yazar adıyla, ona atfedilerek gösterilir.

Kaynak dosya kullanıcı tarafından sağlandı (2026-09-06):
`Mehmet-alagas-Kuranı kerim_meali (1).pdf` — 183 sayfa, 2,1 MB.
PDF repoya girmez; ondan çıkarılan düz metin bu dizinde durur.

## meal_raw.txt — üretilmiş dosya

PDF'in metin katmanının birebir çıktısıdır, elle düzenlenmez. Üretimi:

```bash
python3 -c "
from pypdf import PdfReader
r = PdfReader('<pdf yolu>')
open('meal_raw.txt','w',encoding='utf-8').write(
    '\n\f\n'.join((p.extract_text() or '') for p in r.pages))
"
```

Repoda durur ki PDF olmadan da import tekrar çalıştırılabilsin
(`corpus-coranicum/` ile aynı gerekçe).

## Metnin yapısı — ayet ayet DEĞİL

İki nokta bu meali diğerlerinden ayırır:

1. **Sûreler nüzul sırasındadır**, mushaf sırasında değil. Başlıklar
   "1 Alaka Sûresi", "5 Fatiha Sûresi" biçiminde; numara `surah.
   revelation_order_standard` ile birebir uyuşur (114/114 doğrulandı, ayrıca
   sûre adlarıyla çapraz kontrol edildi).

2. **Metin ayet aralıklarına yazılmıştır.** Bir blok şöyledir:

   ```
   1,2,3,4,5,6,7,8, (ALLAH'IMIZI VE YARATTIĞI İNSANI TANIYALIM)
   <sekiz ayeti birlikte anlatan kesintisiz paragraf>
   ```

   Paragrafı ayet ayet bölmek MÜMKÜN DEĞİLDİR: sınırlar metinde yazmaz,
   bölmek yorum yapmak olur ve yanlış ayete metin yazma riski taşır.
   Bu yüzden blok metni, kapsadığı HER ayete aynen yazılır ve başına
   `(1-8)` biçiminde aralık öneki konur.

   Bu desen projede yeni değildir: Diyanet İşleri meali de gruplu ayetlerde
   aynı şekilde durur (Nâs 1-6 tek metin, her ayette `(1-6)` önekiyle) ve
   arayüz ardışık aynı metinleri "1–6" diye toplar.

## Kapsam

PDF 114 sûrenin tamamını içerir ama her ayeti içermez. Blok başlıklarında
adı geçmeyen ayetler bu mealde YOKTUR ve o ayetlerde meal gösterilmez —
belirsizlik gizlenmez (plan §1.5). Güncel sayılar import raporundadır:
`reports/alagas.md`.
