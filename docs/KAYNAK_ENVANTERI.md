# KAYNAK ENVANTERİ — dış veri kaynakları, lisans durumu ve karar kaydı

Bu dosya `docs/PROJE_PLANI.md` §3 (Veri Kaynakları) tablosunun **genişletilmiş ve doğrulanmış**
karşılığıdır. Amaç: hangi dış kaynağın alınabileceği, hangisinin alınamayacağı ve **neden**
olduğunu tek yerde tutmak; aynı araştırmanın tekrar yapılmasını önlemek.

**Tarih:** 2026-09-06 · Her satır o gün canlı uçtan doğrulandı (HTTP 200 / dosya indirildi).

**Telif ve izin:** proje sahibi yürütüyor. Kaynaklar için izinler alınmış durumda
(karar 2026-09-06). Bu belgedeki lisans satırları künye ve atıf bilgisi olarak durur;
içe alma önünde engel değildir.

---

## 0. Temel ayrım: **kütüphane ≠ yayın** (kullanıcı kararı, 2026-09-06)

> "Hepsini göstereceksin diye bir şart yok. Yapay zekâ eğitimli olacak, zamanı geldiğinde
> değerlendirip yorumlayıp yayınlamaya değerse yayınlayacak."

Bir kaynağı **almak** ile onu **sitede göstermek** iki ayrı karardır:

| Katman | Ne yapar | Ölçüt |
|---|---|---|
| **Kütüphane** (`cache/`, `data-external/`, bilgi deposu) | Ham malzemeyi tutar. Ne kadar çoksa o kadar iyi | **Yalnız lisans.** Lisansı temizse alınır |
| **Yayın** (`data/` → site sayfaları) | Okura gösterilen içerik | **Değerlendirme.** Eğitimli model + insan onayı; değmezse yayınlanmaz |

Sonuçları:

1. Bir kaynağın "editoryal olarak riskli" olması **almamak için gerekçe değildir** — göstermemek
   için gerekçedir. Karar yayın anına ertelenir.
2. Import hattı ile yayın hattı ayrı tutulur: içe alınan her kayıt öntanımlı olarak
   **yayınlanmamış** sayılır; sitede görünmesi ayrı bir onayla olur.
3. Yayın kararını verecek model `/opt/kuran-bilgi` deposunda eğitilir. Telifli metin orada
   kalır, siteye çıkmaz.
4. CLAUDE.md §6 (lisans) bu ayrımdan **muaf değildir**: lisansı belirsiz malzeme kütüphaneye
   de girmez, çünkü kopyalamanın kendisi lisans meselesidir.

---

## 1. Şu an kullanılan kaynaklar (değişiklik yok)

| Veri | Kaynak | Lisans |
|---|---|---|
| Arapça metin, metadata, nüzul sırası | Tanzil.net | Açık, atıf |
| Türkçe mealler (~30) + dipnot, kök, kelime | Açık Kuran (`api.acikkuran.com`) | CC BY-NC-SA 4.0 |
| Morfoloji | Quranic Arabic Corpus | GPL, atıf |
| Harita altlığı | OSM / Protomaps (PMTiles, R2) | ODbL |
| Uydu raster | Esri World Imagery (yalnız raster kaynak) | API anahtarı, referrer kısıtlı |

---

## 2. YENİ — eklenebilir, lisansı temiz

### 2.1 quranenc.com (Kral Fahd Kur'an Basım Kompleksi / Rowwad)
75 dil, ayet bazlı meal. **SQLite + JSON doğrudan indirme**, API anahtarı yok.

| key | Meal | İndirme |
|---|---|---|
| `turkish_rwwad` | Rowwad Tercüme Merkezi | `https://quranenc.com/downloads/sqlite/turkish_rwwad.sqlite` |
| `turkish_shaban` | Şaban Britch | `https://quranenc.com/downloads/sqlite/turkish_shaban.sqlite` |
| `turkish_shahin` | **Ali Özek ve heyet** (TDV/Diyanet Vakfı meali kökenli) | `https://quranenc.com/downloads/sqlite/turkish_shahin.sqlite` |

Liste uçları: meal `https://quranenc.com/api/v1/translations/list` · **tefsir
`https://quranenc.com/api/v1/tafsirs/list`**

### 2.1a quranenc TEFSİR — `turkish_saadi` (2026-09-06'da bulundu)

**Projenin ilk tefsiri buradan gelebilir.** quranenc'in ayrı bir tefsir listesi var (7 kayıt,
hepsi Sa'dî); içinde **`turkish_saadi`** var — QUL'daki 484 numaralı kaynağın aynısı, ama
**oturum açmadan** ve **yazılı 7 koşullu lisansla** (§2.1'deki aynı koşullar).

- Uç: `https://quranenc.com/api/v1/tafsir/sura/turkish_saadi/<sure>` · sürüm 1.0.0
- Alanlar: `id, sura, from_aya, to_aya, type, text` — ayet **aralığı** bazlı, tek ayet değil
- Blok türleri: `اسم السورة` (sure adı) · `مكان نزول السورة` (nüzul yeri) · `المقطع` (pasaj metni) ·
  `تمهيد للآيات` (ayetlere giriş) · `تفسير آية` (ayet tefsiri) · `خاتمة السورة` (sure sonu)
- Ölçüldü: 6 surede 670 blok / 768 292 karakter → **114 sure ~13 MB**

Not: Abdurrahman es-Sa'dî 1957'de vefat etti, yani eser Türkiye'de 2027 sonuna kadar telifli.
Bizi kurtaran şey kamu malı olması değil, **yayıncının yazılı yeniden yayın izni** — mealler
için dayandığımız aynı temel.

**İçe alındı 2026-09-06** — `pnpm data:quranenc-tafsir`. Gerçek sayılar (ilk ölçüm 6 sureden
tahmindi): **6986 blok, 114 sure, 6236 ayetin %100'ünde tefsir var**, 6476 blok doğrudan
ayet aralığına bağlı.

Kaynakta bulunan üç durum (hiçbiri uydurulmadı):
- **11 blok türü var, 6 değil.** İlk ölçüm yalnız Fâtiha'ya bakmıştı. Tam liste:
  `اسم السورة` `مكان نزول السورة` `المقطع` `تمهيد للآيات` / `تمهيد للمقطع` `تفسير آية` /
  `تكملة تفسير الآية` `البسملة` / `تفسير البسملة` `فصل` `فوائد للآيات` / `فوائد للسورة`
  `خاتمة للآيات السابقة` `اقتباس` `خاتمة السورة`. Hepsi eşlendi; `diger` kovasında **0 blok** kaldı.
  `فصل` ve `فوائد` blokları kıssa katmanı için değerli: kıssa sonu ders/ibret bölümleri.
- **`نجوم` etiketli 100 blok atlandı** — metinleri istisnasız `***`, yani basılı düzendeki
  ayıraç. 100'ünün 100'ü kontrol edildi. Sayı rapora yazılıyor.
- **64 blokun metni kaynakta boş.** Ayrıştırma hatası değil, kaynak `""` gönderiyor.
  Atlandı ve tek tek rapora yazıldı (plan §1.5: eksik gizlenmez).

**Önemi:** plan §3.1'de "Diyanet Vakfı — lisans tek tek kontrol edilecek" satırı vardı;
`turkish_shahin` bunun yasal yolunu açıyor. Dağıtım izni davet (da'wah) amaçlı ve açık.
İçe almadan önce her mealin kendi lisans metni yine tek tek okunur.

### 2.2 QUL — Quranic Universal Library (`TarteelAI/quranic-universal-library`, MIT, 993★)
Quran.com/Tarteel'in resmî kaynak kütüphanesi. `https://qul.tarteel.ai/resources/…`

- **Türkçe meal (6):** Diyanet · Elmalılı Hamdi Yazır · Şaban Britch · Muslim Shahin ·
  Dar Al-Salam (dipnotlu) · **Türkçe kelime-kelime meal**
- **Türkçe tefsir: 2 (3 değil — DÜZELTME 2026-09-06).** `id=258` Türkçe el-Muhtasar ·
  `id=484` Tefsîru's-Sa'dî Türkçe. **İbn Kesîr tefsirinin Türkçesi QUL'da YOK** — yalnız
  İngilizce, Arapça, Urduca ve Bengalce var.
  Sa'dî artık quranenc'ten hesapsız ve lisanslı alınabiliyor (§2.1a) → QUL'a kalan tek şey
  **el-Muhtasar Türkçe**.
- Her kayıt `simple.json` / `simple.sqlite` olarak inilebiliyor.

Tespit edilen kaynak id'leri (`/resources/translation/<id>`):
Elmalılı 233 · Diyanet 148 · Şaban Britch 161 · Muslim Shahin 157 · kelime-kelime 99

**DÜZELTME (2026-09-06, doğrulandı):** "Türkçe kelime-kelime meal bizde yok" tespiti YANLIŞTI.
`verse_part` tablosunda **77 429 / 77 429 kelimenin** `translation_tr` ve `transcription_tr`
alanı zaten dolu (Açık Kuran `/verseparts`). Dahası QUL'un kaynak 99'u **aynı veri**:
73:4 önizlemesi bizim kayıtlarımızla kelimesi kelimesine aynı çıktı
(`أَوْ` veya · `زِدْ` artır · `عَلَيْهِ` bunu · `وَرَتِّلِ` ve oku). Tek fark ön ek bölütlemesi
(QUL `عَلَيْ هِ` ayırıyor, biz ayırmıyoruz). **Alınmasına gerek yok.**

⚠ **QUL indirmeleri oturum açmayı gerektiriyor.** İndirme ucu
`/resources/translation/<id>/download?format=json` anonim çağrıda **HTTP 401** döndürüyor —
404 değil, yani uç var, kimlik istiyor. Kayıt formu: ad, soyad, e-posta, parola
(`/users/sign_up`, OAuth yok) ve **e-posta doğrulaması zorunlu** (Devise confirmable;
giriş sayfasında "confirmation instructions" bağlantısı var).

**el-Muhtasar dosya yapısı** (Sa'dî'den basit): `{"<sure>:<ayet>": {"text": "...",
"ayah_keys": [...]}}` — 6236 kayıt, 1 706 417 karakter, boş metin yok, HTML yok.
12 kayıt birden çok ayeti kapsıyor (`ayah_keys`), 14 kayıt kanonik kayda işaret eden düz
dize (atlanır). Sonuç: 6222 blok.

**İndirme elle yapılır:** `qul.tarteel.ai/resources/tafsir/258` → "Download json".
Script ağdan çekmez, `cache/qul/turkish-mokhtasar.json` dosyasını okur.

### 2.2a QUL — tefsir dışı üç dosya (2026-09-06)

Kullanıcı üç dosya daha indirdi. İkisi alındı, biri atlandı.

**`word-root.db`** (SQLite, 1642 kök / 50 298 kelime-kök bağı) → **ALINDI.**
`word_location` biçimi `sure:ayet:kelime`, `verse_part`'a birebir oturuyor.
**3052 boşluk dolduruldu; kök kapsamı %61 → %65.** `lint:refs` uyarısı
"30176 kelime bağlanmadı (%39)" → "27124 (%35)".
- Yalnızca `root_id IS NULL` olanlar dolduruldu, **dolu kaydın üstüne yazılmadı**.
  Gerekçe ölçüldü: QUL'un kelime indeksi bazı yerlerde kaymış —
  `2:181` kelime 12 `سَمِيعٌ` bizde **سمع** (doğru), QUL **اله**; kelime 13 `عَلِيمٌۭ`
  bizde **علم** (doğru), QUL **سمع**. İki çelişki de rapora yazıldı, dokunulmadı.
- Bizde olmayan 1 kök (`واد`, 1 kelime) **eklenmedi** — kök tablosu tek kaynaklı kalır.
- Node 20'de gömülü sqlite yok; bağımlılık eklemek yerine build makinesindeki
  `sqlite3` CLI'sinden tek SELECT ile okunuyor.

**`matching-ayah.json`** (1162 ayet, 3552 eşleşme) → **ALINDI.**
Lafzî benzerlik = Kur'an'da tekrarlanan ibareler. `verse_relation_type` enum'undaki
**`parallel_passage`** değeri bunun için vardı ve boştu.
Güven: `score>=80 ve coverage>=50` → kesin (1919), diğerleri muhtemel (1633).
Örtüşen kelime aralıkları `note` alanında.

**`surah-recitation-...huthaify.zip`** (12,8 KB) → **ATLANDI.**
Yalnız 114 sure için `download.quranicaudio.com` MP3 adresi ve süre;
**`segments.json` boş (`{}`)** → ayet zaman damgası yok, okuma takibi yapılamaz.
Ayrıca dosyalar üçüncü tarafta, kural 5 gereği R2'ye taşınması gerekirdi.
Segmentli bir kârî dosyası indirilirse yeniden bakılır.

**Editoryal not (§0 ışığında):** QUL'un 3 Türkçe tefsiri de Arapçadan çeviri, selefî geleneğe
ait eserlerdir; Türk okurun beklediği taban Diyanet/Elmalılı'dır. Bu **almamak için gerekçe
değil** — kütüphaneye girer. Yayın kararı ayrıdır: gösterilirse plan §12.9 gereği yan yana ve
kaynak etiketiyle gösterilir; **tek tefsir olarak konursa yanıltır.**

### 2.3 OpenITI RELEASE — klasik Arapça külliyat (7727 metin sürümü)
`github.com/OpenITI/RELEASE` · katalog: `OpenITI/kitab-metadata-automation/output/`

Künyeler `data-external/openiti/works.json` içine **yazıldı** (2026-09-06). Nüsha sayıları
katalogdan yeniden sayıldı; ilk taramadaki tahminler yanlıştı, aşağıdaki tablo doğrulanmış hâli.
Her satırda OpenITI'nin `pri` (birincil) işaretli nüshası seçildi.

| Eser | Nüsha | Katman | `versionUri` (pri) |
|---|---|---|---|
| İbn Hişâm — *es-Sîre* | 4 | siyer | `0213IbnHisham.SiraNabawiyya.Shamela0023833-ara1` |
| Vâkıdî — *el-Meğâzî* | 2 | siyer | `0207Waqidi.Maghazi.Shamela0023680-ara1` |
| İbn Sa'd — *Tabakât* | 9 | kişiler | `0230IbnSacd.TabaqatKubra.Shamela0001686-ara1` |
| Taberî — *Târîh* | 5 | tarih | `0310Tabari.Tarikh.Shamela0009783-ara1` |
| İbn Kesîr — *el-Bidâye ve'n-Nihâye* | 16 | tarih | `0774IbnKathir.Bidaya.Shamela0004445-ara1` |
| **İbn Kesîr — *Kısasü'l-Enbiyâ*** | 2 | **kıssa** | `0774IbnKathir.QisasAnbiya.Shia003721Vols-ara1` |
| Vâhidî — *Esbâbü'n-Nüzûl* | 3 | nüzul | `0468IbnAhmadWahidiNaysaburi.AsbabNuzul.Shamela0011456-ara1` |
| Süyûtî — *Lübâbü'n-Nükûl* | 3 | nüzul | `0911Suyuti.LubabNuqul.Shamela0002247-ara1` |
| Yâkût — *Mu'cemü'l-Büldân* | 3 | konum | `0626YaqutHamawi.MucjamBuldan.Shamela0023735-ara1` |

**Yeni bulgu:** İbn Kesîr'in ***Kısasü'l-Enbiyâ***'sı korpusta var (178 518 kelime). §4'te
"Türkçe kıssa açık veri seti yok" tespiti duruyor, ama kıssa katmanının **klasik çapraz
kontrol kaynağı** böylece bulundu — 50 kıssa kaydımızın hepsi buna karşı doğrulanabilir.

Hepsi ortaçağ eseri → kamu malı. **Kullanım biçimi: metni göstermek değil**, kıssa/konum
kayıtlarına **atıf hedefi ve çapraz doğrulama**. Türk okura Arapça metin sunulmaz.

⚠ `OpenITI/RELEASE` deposunda `LICENSE` dosyası yok. İçe almadan önce BBAW'daki gibi
**yazılı teyit** gerekir.

### 2.4 Corpus Coranicum TEI — eski mushaflar (**ALINDI 2026-09-06**)
`telota/corpus-coranicum-tei` · **CC BY-SA 4.0**, © BBAW 2024 (README'de yazılı) ·
sıkıştırılmış 23 MB / açılmış 335 MB · 2323 dosya, **2322 yazma**

Üretici: `scripts/import/corpus_coranicum.ts` → `pnpm --filter @kuran/import corpus-coranicum`
Çıktı: `data-external/corpus-coranicum/manuscripts.json` (1,4 MB) + `pages.json` (1,5 MB)

**Sonuç: 48 863 sayfa-ayet aralığı. 6236 ayetin 6236'sı (%100) en az bir yazmada geçiyor** —
yani her ayet sayfası en az bir erken mushafa bağlanabilir.

Doğrulama: 16 numaralı yazmanın kendi özeti "Q 68:9-68:24, Q 68:36-68:45" diyor; bizim
türettiğimiz aralıklar `[[68009,68024],[68036,68045]]`. Birebir tutuyor.

Envanterden çıkan başka sayılar: 1613 yazma tarihli, **977'si 600–799 aralığında başlıyor**;
en çok yazma tutan yerler San'a (644), Paris (298), Rhode Island (203); yazı türü
kûfî 1730, mağribî 63, **hicâzî 60**.

**Kaynak verisinde bulunan ve ayrı işlenen üç durum** (hiçbiri uydurulmadı, hepsi rapora yazıldı):
- `SSS:000` → ayet değil, **sure başı (besmele)** işareti. 887 satır. Saklandı, kapsama katılmadı.
- Bitiş < başlangıç → 38 satır. Dağılmış/yanlış ciltlenmiş yazma; saklandı, kapsama katılmadı.
- Tanzil'de karşılığı olmayan ayet numarası → 28 satır (`002:296`, `089:089` gibi). Atlandı, rapora yazıldı.

**Diğer beş veri seti de aynı depoda** (ilk yayın sonrası değerlendirilir, §0):
`quran_variants` (kıraat farkları — daha önce reddedilen qiraat depolarının lisanslı karşılığı),
`quran_intertexts` (714 dosya; Kur'an ile geç antik metinler arası ilişki — kıssa katmanına
doğrudan denk), `quran_concordance` (her kelimenin tam gramer çözümü, Talmon),
`quran_commentary` (85 dosya, sure sure kronolojik-edebî şerh),
`cairo_quran` (1924 Kahire baskısı + EN/DE/FR çeviri).

Ayet ↔ mushaf bağı **veride hazır, icat edilmeyecek**:
```xml
<msItem n="1r"><title type="numeric" key="068:009:004-068:024:006"/></msItem>
<surface n="1r"><graphic decls="#imageRights-1" url="manuscript/16/<uuid>/…-image-4393.tif"/></surface>
<l n="1"><w n="068-009-005">ں</w> <w n="068-010-001">ولا</w> …</l>
```
- `msItem/title/@key` → `(manuscript_id, sayfa, verse_start, verse_end)` tablosu
- Gövdedeki `<w n="SSS-VVV-WWW">` sayesinde **kelime bazında** highlight mümkün
- **Görseller kopyalanamaz:** taranan her yazmada `<availability status="restricted">`.
  Görseller BBAW `digilib` sunucusunda, OpenSeaDragon ile. Yalnız **derin bağlantı**:
  `https://corpuscoranicum.de/en/manuscripts/16?sura=068&verse=009` (200 döndü, SPA)
- **Lisans çakışması:** TEI verisi CC BY-**SA**, bizim `data/` CC BY-**NC**-SA. BY-SA'ya NC
  eklenemez. Çözüm: `data/` içine karıştırma; `data-external/corpus-coranicum/` ayrı ağaç +
  kendi `LICENSE` (derleme, türev değil).

---

## 3. REDDEDİLDİ — gerekçesiyle

| Kaynak | Gerekçe |
|---|---|
| `mohammed-2-5/islamic-library-data` | **Lisans yok** (252 MB). Lisanssız = tüm haklar saklı. İçindeki QCF fontları ve 75 klasik kitap ayrıca KFGQPC/başka hak sahibine ait |
| `Keremcm/Quran-i-Kerim-Data` | MIT etiketi ama `tefsir` alanı mealin birebir kopyası; meal atıfsız. Bizde zaten 30+ meal var |
| `mostafaahmed97/asbab-al-nuzul-dataset` | MIT etiketi çağdaş telifli kitabın telifini temizlemez (صحيح أسباب النزول, İbrahim Muhammed el-Alî). Ayrıca yalnız Arapça. **Yerine Vâhidî + Süyûtî (kamu malı) kullanılacak** |
| `fawazahmed0/quran-api` | Unlicense **ama** 31 Türkçe mealin telifi temizlenmemiş (Esed, İslamoğlu dahil). Yalnız **kapsam indeksi / çapraz kontrol**, dağıtım kaynağı değil |
| `mokumus/KUTUB-I-SITTE-JSON`, `ykpylcn/KutubiSitteHadislerV1` | Lisanssız / kaynak belirsiz |
| `qiraat-explorer` (3 ayrı depo) | Veri seti değil, uygulama. NOASSERTION / lisanssız |
| IslamHouse-API depoları | SEO amaçlı boş depolar |
| `telota/corpus-coranicum-website` | Veri değil, Laravel+Vue uygulaması + MySQL. Yalnız **referans uygulama** olarak okunur (GPL-3.0) |
| `madogan/Wasl` (kullanıcı sorusu üzerine bakıldı, 2026-09-06) | **Arşivlenmiş ve boş.** MIT lisansı var ama depoda yalnız `.gitignore`, `LICENSE`, `README.md` — 0 MB, ne veri ne kod. Tanıtımdaki "IlmGraph bilgi grafiği" yazılmamış |
| `ttv92110/IlmUlQuran` (aynı) | Apache-2.0, 20,5 MB, FastAPI + `data/`. **Veri kökeni belirsiz:** 50 MB'lık `complete_Quran_data.json` Urduca meal + Arapça *Tefsîru'l-Müyesser* taşıyor, atıfsız. Apache etiketi bu üçüncü taraf teliflerini temizlemez (aynı gerekçe: `fawazahmed0`). Türkçe alanlar var (`surah_meaning.json` → "Açılış", "İnek"; Esmâ-i Hüsnâ ve peygamber adlarının Türkçesi) ama **kaynağı yazılı değil** → CLAUDE.md §6. Ayrıca ana ekseni **ebced/sayısal** çözümleme; bizim yaklaşımımız değil |

---

## 4. Doğrulanmış boşluklar — açık kaynak YOK

Bunlar aranıp bulunamadı; tekrar aranmasın.

- **Elmalılı *Hak Dini Kur'an Dili* tam tefsiri.** Kamu malı (vefat 1942) ama **hiçbir yerde
  temiz dijital metin yok** — GitHub, Vikikaynak, archive.org üçü de boş; yalnız *meal* kısmı
  dijital. Tam tefsir isteniyorsa kamu malı taramadan kendi OCR'ımız gerekir.
- **Mehmet Vehbi — *Hulâsatü'l-Beyân*** (vefat 1949, 2020'den beri kamu malı): dijital metin yok.
- **Türkçe İslam tarihi / kıssa açık veri seti: YOK.** `siyer`, `islam tarihi`, `kütüb-i sitte`,
  `kıssa` aramalarının hepsi 0-2★ lisanssız hobi deposu. Ahmed Cevdet Paşa *Kısas-ı Enbiyâ*
  (kamu malı) archive.org'da yalnız ses/tarama, metin yok.
  → Kıssa katmanı için mevcut yol (TDV İA maddesine dayanıp kendi derlememiz) **doğru yolmuş**.

---

## 5. Mehmet Alagaş meali (kullanıcı kararı 2026-09-06: eklenecek)

- **Kaynak:** `https://www.insandergisi.com/kuran-meali.pdf` (1,8 MB, son güncelleme 2022-09-11).
  Site "Kur'an Mealini İndir" bağlantısıyla ücretsiz sunuyor. Aynı sitede ayet bazlı
  gezinme (`/ayet.php?r=<n>`), mushaf/nüzul/alfabetik sıralama ve "Mehmed Alagaş Yorumları" var.
- **Biçim:** nüzul sırasına göre; ayet grupları başlıklandırılmış; parantez içi açıklamalar
  meal metnine gömülü. Yani **saf meal değil, meal + yorum karışımı** — bizim `<Translation>`
  bileşenimiz bunu olduğu gibi meal olarak gösteremez, yorum kısmı ayrılmalı (plan §23 K1'in
  "içerik iki parçadır ve ayrı işaretlenir" kuralı buraya da uygulanır).
- **Telif:** Mehmed Alagaş vefat 2004 → Türkiye'de koruma 70 yıl → **2075'e kadar kamu malı
  DEĞİL.** Ücretsiz indirilebilir olması açık lisans değildir.
- **Yapılacak:** İnsan Dergisi'ne (`insandergisi.com/iletisim.php`) yazılı kullanım izni
  başvurusu. İzin gelmeden `data/` altına girmez.

---

## 6. "Okuyan / İslamoğlu / Esed tefsirlerini sitelerinden indiremez miyiz?" — cevap

Kısa cevap: **hayır.** Üçü de yürürlükte telifli ticari eser.

| Eser | Site durumu (2026-09-06 ölçüm) | Değerlendirme |
|---|---|---|
| Mustafa İslamoğlu — *Hayat Kitabı Kur'an* | `hayatkitabikuran.com` **çalışıyor**; meal tamamı ayet ayet çevrimiçi (`/<n>-<sure>-suresi-<a>-ayet`), nüzul sırası numaralı. API yok, lisans yok | Okunabilir ≠ alınabilir. Kazımak (scraping) telif ihlali; CLAUDE.md §6'ya aykırı |
| Mehmet Okuyan — *Kur'an Meal-Tefsir* | `mehmetokuyan.com(.tr)`, `kuranmealtefsir.com`, `okuyankuran.com` → **hepsi ulaşılamadı** | Erişilebilir resmî dijital kaynak yok |
| Muhammed Esed — *Kur'an Mesajı* | Resmî site yok. İngilizce aslı Esed (v. 1992) telifli; Türkçe çeviri (Cahit Koytak / Ahmet Ertürk, İşaret Yayınları) **ayrıca** telifli | Çift telif |

Bu zaten bilinen bir durum: `scripts/import/tanzil_translations.ts:58-59` —
*"Okuyan, İslamoğlu ve Esed açık lisanslı hiçbir sette yok."*

**Tek yasal yol:** hak sahibinden yazılı izin. `docs/BACKLOG.md` → "İzin / iletişim bekleyen"
başlığı bu üç meal için zaten açık; oraya İslamoğlu için `hayatkitabikuran.com` ve Alagaş için
İnsan Dergisi eklendi.

---

## 7. Sıradaki adımlar (öncelik sırasıyla)

1. ~~quranenc TR 3 meal~~ → **BİTTİ 2026-09-06.** `scripts/import/quranenc.ts`, 18 708 meal
   satırı + 29 dipnot, sürüm numaraları `/kaynaklar`'da. Lisans: koşullu yeniden yayın izni
   (koşullar script başında yazılı)
2. ~~QUL Türkçe kelime-kelime meal~~ → **İPTAL.** Veri zaten elimizde ve aynı kaynak (yukarı bak)
3. **Tefsir** → ikiye ayrıldı:
   a. ~~`turkish_saadi` quranenc'ten~~ → **BİTTİ 2026-09-06.** `tafsir` + `tafsir_block`
      tabloları, `scripts/import/quranenc_tafsir.ts`, **6986 blok / 114 sure /
      6236 ayetin %100'ü**. Arayüz yok — §0 gereği yayın kararı ayrı
   b. ~~el-Muhtasar Türkçe~~ → **BİTTİ 2026-09-06.** QUL hesabı açıldı, dosya elle indirildi
      (`cache/qul/turkish-mokhtasar.json`), `scripts/import/qul_tafsir.ts` ile alındı:
      **6222 blok, 114 sure, 6236 ayetin %100'ü**
4. ~~OpenITI atıf hedefleri~~ → **BİTTİ 2026-09-06.** 9 eserin künyesi
   `data-external/openiti/works.json`, lisans durumu `data-external/openiti/LICENSE.md`.
   **Metin indirilmedi.** `data/sources/` yerine `data-external/` seçildi: kullanılmayan kaynak
   `/kaynaklar` sayfasına düşmemeli, o sayfa kütüphane envanteri değil
5. ~~Corpus Coranicum~~ → **BİTTİ 2026-09-06.** `data-external/corpus-coranicum/`
   (LICENSE.md + manuscripts.json + pages.json). Görüntü yok, yalnız derin bağlantı.
   **Sırada:** ayet sayfasına "bu ayeti taşıyan yazmalar" bölümü — ayrı karar, `docs/BACKLOG.md`
6. **İzin başvuruları**: İnsan Dergisi (Alagaş), Düşün Yayıncılık (İslamoğlu/Okuyan),
   İşaret Yayınları (Esed), BBAW (OpenITI/Corpus teyidi)
