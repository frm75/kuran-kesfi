# DURUM — nerede kaldık

> Bu dosya **oturum devri** içindir: bağlam sıfırlandığında tek okumayla toparlanmak için.
> Kalıcı kurallar `CLAUDE.md`'de, plan `PROJE_PLANI.md`'de, tasarım `DESIGN.md`'de.
> Son güncelleme: 2026-09-06 (meal geçişi + dipnot ayet bağlantısı + Kitab-ı Mukaddes alıntıları). Yayın `20260905T185939Z`
> (içerik genişletme: 50 kıssa / 101 kavram / 60 ilke).

## Tek cümle

`kurankesfi.tr` yayında: 11 061 sayfa, 6236 ayet + 53 meal + 1641 kök +
50 kıssa + 101 kavram + 60 ilke + 26 konum + 22 siyer olayı + 742 konu başlığı +
40 886 ayet-ayet bağı. Plan §12.1 ve §12.5 tamamlandı.

**JavaScript durumu değişti (2026-09-05).** Site artık "0 bayt JS" DEĞİL: `/harita`
MapLibre GL'e geçti ve tek başına ~970 KB betik yüklüyor. Diğer 8211 sayfa hâlâ betiksiz.
CSP `infra/nginx/kurankesfi.tr.conf` içindeki `map $uri $kesif_csp` ile sayfaya göre
seçiliyor; `script-src 'self'` yalnız `/harita` ve `/kissa/*` için açık.
Etkileşimli harita statik SVG'nin **üstüne** ekleniyor, yerine geçmiyor — betik
çalışmazsa sayfa eskisi gibi kalır.

## Komutlar (sırayla)

```bash
cd /opt/kuran                 # repo burada; /www/wwwroot/... sadece yayın sembolik bağı
pnpm db:up                    # kuran-pg container (127.0.0.1:4322)
pnpm data:import              # Tanzil + Açık Kuran + çeviriyazı  (uzun, önbellekli)
pnpm content:import           # data/** → PostgreSQL  (kıssa, kavram, ilke, konum, zaman)
pnpm build                    # = build:data → lint:refs → build:web
pnpm run deploy               # atomik yayın + duman testi   (DİKKAT: `pnpm deploy` DEĞİL)
pnpm run deploy:rollback      # geri dön
```

## Yayındaki modüller

| Modül | Adres | Veri |
|---|---|---|
| Klasik okuma | `/sureler`, `/<sure>`, `/<sure>/<ayet>` | 114 sure, 6236 ayet, 53 meal |
| Meal geçişi | `/<sure>/meal/<yazar>` | 26 Türkçe meal × 114 sure = 2849 sayfa |
| Kök kelime | `/kok`, `/kok/<arapça>` | 1641 kök, 77 429 kelime (**%65** köke bağlı — 2026-09-06'da QUL ile %61'den çıktı) |
| Kıssalar | `/kissalar`, `/kissa/<slug>` | 34 kıssa, 188 parça, 43 kaynaklı ders |
| Harita | `/harita` | 26 konum (13 kesin / 8 muhtemel / 5 rivayet) |
| Zaman | `/zaman` | 22 siyer olayı, Nöldeke 114/114 (109'u Mısır'dan farklı) |
| Kavramlar | `/kavramlar`, `/kavram/<slug>` | 71 kavram, 12 857 ayet bağı |
| İlkeler | `/ilkeler`, `/ilke/<slug>` | 32 ilke, 116 birincil + 113 ikincil dayanak |
| İlgili ayetler | her ayet sayfasında | 40 886 bağ, 5994 / 6236 ayet (%96) |
| Bağlam | her ayet sayfasında | önceki 3 + sonraki 3 ayet, öntanımlı meal |
| Konu başlığı | **114 / 114 sure** | 742 başlık, `origin=platform` |
| Kaynak şeffaflığı | `/kaynaklar` | 9 kaynak |

## Yapılmayanlar ve NEDENİ

| İş | Engel |
|---|---|
| Okuma günlüğü (IndexedDB) | **JS gerekir** — CSP'de `script-src` yok |
| Çevrimdışı (service worker) | **JS gerekir** |
| Keşif yolu çubuğu (§12.8a) | **JS gerekir** |
| İstemci tarafı arama (§12.2) | **JS gerekir** |
| Kavram grafı (D3), harita (MapLibre) | JS gerekirdi → **liste/SVG karşılığı yapıldı**, iş bitti |
| Hoca notları (§23.2) | Hoca izni + transkript; şema ve import hattı hazır, veri yok |
| Ses / kıraat | Kârî lisansı kararı açık (BACKLOG) |
| Telegram botu (§19) | `infra/db/bot_schema.sql` var; ilkeler modülü ön koşuluydu, artık hazır |

**JS kararı kullanıcıya ait ve henüz alınmadı** (2026-09-05: "şimdi değil"). Alınırsa
`infra/nginx/kurankesfi.tr.conf` CSP'sine `script-src 'self'` girer **ve canlıya kopyalanır**
(`/www/server/panel/vhost/nginx/`), duman testindeki "CSP script-src kapali" kontrolü güncellenir.

## Yazma modülü (2026-09-06'da yayına hazır)

**Yeni:** `/yazmalar` · `/yazmalar/<yüzyıl>` (10 sayfa) · `/yazma/<id>` (2322 sayfa) +
ayet sayfalarında **"Bu ayeti taşıyan yazmalar"** bölümü. Gezinme çubuğuna "Yazmalar" eklendi,
sitemap 13 393 adres.

| Katman | Dosya |
|---|---|
| Tablo | `manuscript`, `manuscript_range` (2322 + 6589 satır) |
| Şema | `packages/schema/src/manuscript.ts`, `static_content.ts` |
| Yükleme | `scripts/import/corpus_coranicum.ts` (JSON üretir **ve** DB'ye yazar) |
| Dışa aktarım | `manuscripts.json` (1,17 MB) + `verse_manuscripts.json` (0,30 MB), ikisi de build-only |
| Okuma | `apps/web/src/lib/manuscripts.ts` (`data.ts`'e dokunulmadı) |

**Görüntü yok ve olmayacak** — kaynakta 2322 kaydın hepsinde izin `restricted`.
Linter bunu kodla koruyor: `manuscripts.json` içinde `corpuscoranicum.de` dışında bir adres
çıkarsa **build durur**.

Ayet başına ortalama 70, en çok 94 yazma düşüyor; ayet sayfasında **sayı + en eski 5** var,
tam liste yüzyıl sayfalarında. En eskiler: Birmingham (632-660), BnF Arabe 328 (632-680),
Kuveyt el-Sabah (630-680).

Yüzyıl dağılımı: 7. yy 297 · **8. yy 1068** · 9. yy 147 · 10. yy 31 · 11-15. yy 69 ·
tarihsiz 710. En büyük sayfa `8-yuzyil.html` 309 KB ham / **16 KB gzip**.

## Lafzî benzerlik — yeni ilişki türü (2026-09-06)

`verse_relation_type` enum'undaki **`parallel_passage`** değeri boştu, artık dolu:
QUL `matching-ayah.json` → 3552 bağ. Mevcut 34 095 `same_root` bağından **farklı**:
o kök ortaklığından hesaplanıyor, bu ise Kur'an'da tekrarlanan ibareler (müteşâbih).

Doğrulama örnekleri — üçü de doğru çıktı:
`1:1 → 27:30` (Neml 30 besmeleyi lafzen içerir) · `1:2 → 37:182` (*ve'l-hamdü lillâhi
rabbi'l-âlemîn*) · `1:3 → 1:1`.

`note` alanında örtüşen kelime aralıkları duruyor (`Örtüşen kelimeler: 5-8`) — ileride
eşleşen kısmı vurgulamak için. Statik dışa aktarım şu an `note`'u taşımıyor.

**Güven alanı düzeltildi (2026-09-06).** Önce skora göre kesin/muhtemel ayırmıştım; linter
haklı olarak reddetti. Plan §12.5 kuralı: `muhtemel` **yalnızca** kavram üzerinden kurulan bağ
içindir, sayıma dayanan bağlar kesindir. Lafzî örtüşme de bir sayımdır — kelimeler ya örtüşür
ya örtüşmez. Hepsi `kesin`; bağın **gücü** `reason` metninde yazıyor. Bağlar puana göre azalan
sırada yazılıyor, yani ayet sayfasında güçlüler önce çıkıyor.

**DİKKAT:** `scripts/build/lib/content.ts` verse_relation'ı tür süzmeden dışa aktarıyor,
yani bu 3552 bağ **ilk build'de ayet sayfalarında görünecek**. Tefsirlerden farkı bu:
tefsirin dışa aktarımı yok, bu var.

| İlişki türü | Adet |
|---|---|
| same_root | 34 095 |
| same_story | 3 634 |
| **parallel_passage** | **3 552** |
| same_topic | 3 288 |
| same_event | 613 |

## Tefsir katmanı (2026-09-06'da kuruldu) — 2 eser, 13 208 blok

`tafsir` (eser) + `tafsir_block` (blok) tabloları eklendi. Meal ile tefsir **ayrı**:
meal ayet başınadır, tefsir ayet **aralığı** başınadır ve bir kısmı hiç ayete bağlı değildir
(sure adı, nüzul yeri, sure sonu) — o bloklarda `start_verse_id` NULL, ayet bağı uydurulmaz.

Bloklar upsert değil **sil-yaz** ile yazılır: kaynaktan bir blok kalkarsa `sort_number` kayar,
upsert kuyrukta bayat satır bırakırdı.

`tafsir_block_type` 11 değerli enum + `source_type` alanında kaynağın kendi Arapça etiketi
olduğu gibi durur; tanımadığımız bir etiket gelirse `diger` olur **ve rapora düşer**.

`tafsir.publishable` = yayın kapısı (telif değil, editoryal): statik dışa aktarım bu alanı
süzer. İkisi de şu an `true`.

| Eser | Kaynak | Blok | Kapsam |
|---|---|---|---|
| Tefsîru's-Sa'dî | quranenc `turkish_saadi` (API) | 6986 | 6236/6236 |
| el-Muhtasar | QUL 258 (elle indirilir) | 6222 | 6236/6236 |

**Sitede henüz görünmüyor** — statik dışa aktarım ve ayet sayfası bölümü yapılmadı.
Bu bilinçli: `docs/KAYNAK_ENVANTERI.md` §0, kütüphane ≠ yayın.

## Şeması var, verisi yok

`root_diff`, `scholar_note_*`, `subscription`. Diğer bütün içerik tabloları dolu.

## Ayet ilişki ağı (2026-09-05'te kuruldu)

Plan §12.5. `scripts/import/lib/relations.ts` türetir, `content.ts` aynı transaction içinde çağırır,
`verse_relations.json` olarak çıkar, ayet sayfası "İlgili ayetler" bölümünde gösterir.

**AI önerisi değil, sayım.** İki ayetin aynı kıssayı / olayı / kökü / kavramı gerçekten paylaşıp
paylaşmadığı sayılır. `source_id` NULL (platform derlemesi); `confidence` yalnızca `same_topic` için
`muhtemel`, çünkü kavram–ayet eşleştirmesinin kendisi kökten türetilmiştir.

| Tür | Nereden | Taban puan | Satır |
|---|---|---|---|
| `same_event` | `timeline_event_verse` | 6.0 | 607 |
| `same_story` | `story_passage` | 5.0 | 3 318 |
| `same_root` | `verse_part` | 4.0 | 34 301 |
| `same_topic` | `concept_verse` | 3.0 | 2 660 |

Puan = `taban / log2(grup + 1)` — grup büyüdükçe bağ zayıflar. Aynı çifte gelen kanıtlar **toplanır**;
etiket ve tür en güçlü tek kanıttan gelir, gerekçe en güçlü üç kanıttan kurulur.

Üç sınır, üçü de ölçümle konuldu:

- `MAX_ROOT_VERSES = 120` — صبر 93 ayette geçiyor ve planın kendi örneği onu gerektiriyor;
  60'ta kalsaydı düşerdi. Üstte قول (1722 geçiş) ve صلح (170 ayet) dışarıda kalır.
- `MAX_CONCEPT_VERSES = 200`.
- `MAX_PER_REF = 3` — tek kökün bütün kontenjanı yemesini engeller (bkz. Tuzak 7).
- `TOP_PER_VERSE = 8`.

1 780 000 ham kanıttan 40 886 satır kalır; import ~105 sn sürer, hesabın tamamı veritabanı içinde
biter (574 bin çift ağ üzerinden taşınmaz).

## Sure içi konu bölümlemesi (2026-09-05'te tamamlandı)

Plan §12.1, §12.15. **114 surenin tamamı, 742 konu başlığı.** Kullanıcı kararı: özgün derleme,
`origin='platform'` — telifli bir tefsirin bölümlemesi alınmadı, arayüzde "Konu başlıkları
platform derlemesidir; bir tefsirden alınmamıştır" cümlesiyle ayrılıyor.

Hat: `data/sections/sections_<no>.json` → `scripts/import/content.ts` → `sections.json` →
`getVerseSections()` → ayet sayfasındaki "Bağlam" kutusu (başlık, aralık, önceki/sonraki konu).

**Bitişiklik değişmez kuralıdır** ve üç yerde birden doğrulanır:
`surahSectionsFile` (şema), `content.ts` (sure uzunluğuna karşı), referans linter (çıktıda).
Bölümler 1. ayetten başlar, boşluk bırakmaz, surenin son ayetinde biter. Sebep arayüz:
"bu ayet hangi konuda?" sorusunun her ayette cevabı olmalı. Boşluk kalırsa sayfa hata vermez,
sessizce başlıksız kalır.

Yeni bölümleme yazarken: sınırları **mealden okuyarak** koy, ezberden değil. Doğrulama scripti
üç şeye bakar — ilk bölüm 1'den başlıyor mu, bölümler bitişik mi, son bölüm surenin son
ayetinde bitiyor mu.

## Sure sayfasında meal geçişi (2026-09-06'da yapıldı)

Plan §2.7 ("meal seçimi"). Şikâyet: ayet sayfasında 53 meal varken sure sayfası yalnız Diyanet
İşleri gösteriyordu ve aralarında geçiş yoktu.

**Neden hepsi tek sayfada değil:** Bakara tek mealle bile 411 KB (91 KB gzip); 26 meali aynı
sayfaya basmak ~4 MB ederdi. Bu yüzden her meal kendi sayfasında: `/<sure>/meal/<yazar>`.

**Neden yalnız Türkçe (kullanıcı kararı):** her ek meal 114 sayfa / ~7,2 MB HTML demek —
Arapça metin ve çeviriyazı her mealde tekrar ediyor. 26 Türkçe meal = 2849 sayfa / ~225 MB
(dist 504 MB → 729 MB, build 3m43s). 53 mealin hepsi ~382 MB ve 6042 sayfa ederdi; İngilizce
çevirilerin sure boyu okuma değeri bunu karşılamıyor. Hepsi ayet sayfasında duruyor.

Hat: `getTurkishAuthors()` / `authorHasSurah()` / `surahReadingPath()` (`lib/data.ts`) →
`<MealSecici>` (JS'siz `<details>`, sayfa başına ~2,5 KB) → `<SurahReading>` (iki sayfanın
ortak gövdesi; `[surah].astro` ve `[surah]/meal/[author].astro` yalnızca `<Base>` başlığını
ve meal slug'ını veriyor).

Kararlar:
- Öntanımlı meal `/<sure>` kanonik adresinde kalır; `/<sure>/meal/diyanet-isleri` **üretilmez**
  (aynı ekranı iki adresten yayınlamanın anlamı yok).
- Meal sayfaları kendi kanoniklerini taşır ve sitemap'e girer (priority 0.4). Arapça tekrar
  etse de sayfanın konusu o mealin metnidir; "Bakara suresi Elmalılı meali" gerçek bir arama.
- Kaynakta olmayan sure için sayfa üretilmez ama seçicide **satır silinmez**: bağlantısız,
  "bu surede yok" notuyla durur (plan §1.5). Tek örnek: Süleymaniye Vakfı / Tahrim →
  2849 = 114 × 25 − 1.
- Komşu sure aynı mealde açılır; o mealde o sure yoksa kanonik adrese düşer.

## Dipnotlarda ayet bağlantısı (2026-09-06'da yapıldı)

Kullanıcı isteği: "dipnotlarda geçen ayetler linkli olmalı, ilgili ayete gitmeli **aynı meal
yazarından**". Hedef `verseReferenceHref()`: Türkçe meal → `/<sure>/meal/<yazar>#ayet-<n>`,
İngilizce çeviri → `/<sure>/<ayet>` (onların sure sayfası yok).

**Aynı işte bir hata da düzeldi.** Süleymaniye Vakfı meali atıfları kaynakta işaretli
getiriyor (`{{16:96}}Nahl 16/96,{{/}}`) ve bu işaretler sayfaya **olduğu gibi basılıyordu** —
okuyucu dipnotta `{{16:96}}` görüyordu. 53.638 işaret. Artık ayrıştırılıp bağlantıya
dönüşüyor; çıktıda tek bir `{{` kalmadı (doğrulandı).

**46.036 bağlantı / 33.367 dipnot.** Dağılım ve kurallar `apps/web/src/lib/footnote-refs.ts`
dosya başındaki blokta.

Kural DAR tutuldu, çünkü dipnotların bir kısmı Kur'an'a değil **Tevrat/İncil'e** atıf yapıyor
ve biçim birebir aynı: "Mısır'dan Çıkış 34:28", "Matta 12:40", "Yeşeya 40/25", "Numbers,
11:1-15". Körlemesine `\d+:\d+` eşleşmesi okuyucuyu yabancı bir atıftan Kur'an ayetine
götürürdü — kaynağın söylemediği bir şey söylemek (CLAUDE.md kural 4). Üç kademe eleme:

1. **Sayıdan önceki kelime** büyük harfle başlıyor ve sure adı değilse bağlanmaz
   ("Matta 12:40"). İstisna: yönlendirme kelimeleri (bak, bkz, ayrıca…).
2. **Dipnotun tamamı** taranır; içinde Tevrat/İncil/Kitab-ı Mukaddes/Exodus… geçiyorsa o
   dipnottaki **çıplak** atıflar bağlanmaz. Sebep ölçüldü: "Kitab-ı Mukaddes, Çıkış: 2:1,
   6:16-20, 7:7" — buradaki 2:1 ve 7:7 önlerinde hiçbir ad taşımıyor ama hepsi Tevrat'a ait.
   Aynı nedenle **Yûnus** (hem sure hem Kitab-ı Mukaddes kitabı) kirli dipnotta bağlanmaz.
3. **Ayet gerçekten var mı** — kaynakta olmayan ayete işaret eden 11 atıf düz metin kalır.

`/` biçimi (`Bakara 2/153`) yalnızca sure ADI ile kabul edilir: çıplak `2/3` kesir de olabilir,
bir adresteki `content/6/1/326` de. Bu kural Süleymaniye eski baskının 1342 atfını kazandırdı.

Elenen ~370 atıf bilinçli fazla eleme: birkaç doğru bağlantı kaybetmek, yanlış yere götüren
tek bir bağlantı üretmekten iyidir.

**Denetim aracı** (yeniden çalıştırılabilir): `scripts/` altına konmadı, geçici probe ile
ölçüldü — bir daha gerekirse `splitVerseReferences()` çıktısındaki her bağlantının çevresinde
Tevrat/İncil adı arayan tarama yeterli. Son ölçümde kalan 110 uyarının hepsi doğru Kur'an
atfıydı (yalnızca metinde "Tevrat" kelimesi yakındaydı).

## Kitab-ı Mukaddes atıfları ve alıntıları (2026-09-06'da yapıldı)

Kullanıcı kararı: dipnotlarda geçen Tevrat/İncil atıfları da veriye alınsın **ve metni
gösterilsin** ("metinsiz olmaz ki, metinde olmalı").

**Ne yapıldı.** 6 mealin 363 dipnotunda 576 atıf var (Yaratılış 71, Mısır'dan Çıkış 74,
Matta 44, Tesniye 26, Levililer 24, Mezmurlar 21…). Bunlar artık dipnotta açılır bir kutu:
künye (Eski/Yeni Ahit · kitap bölüm:ayet) + ayetin **en fazla 200 karakterlik alıntısı** +
yayıncı künyesi ve bağlantısı. JS yok, `<details>`.

**Telif — asıl mesele.** Araştırma sonucu: açık lisanslı, modern Türkçe, tam Kutsal Kitap
metni **yok**.

| Çeviri | Durum |
|---|---|
| Kutsal Kitap Yeni Çeviri (2001/2008) | © Kitab-ı Mukaddes Şti. + Yeni Yaşam — kapalı |
| Kitab-ı Mukaddes 1941 (Latin harfli) | Telif belirsiz; 1941+70=2011 ama çevirmen tüzel kişi mi gerçek kişi mi belirsiz |
| Ali Bey–Kieffer 1827 / 1886 | Kamu malı ama **Arap harfli Osmanlıca** — okunmaz |
| `seven1m/open-bibles` → `tur-turkish.osis.xml` | README "Public Domain" diyor ama `<rights/>` **boş**, `publisher: nobody`, metin birebir Yeni Çeviri (2001). **Etiket yanlış.** |

Bu yüzden **Diyanet tefsiri modeli** uygulandı — projenin zaten benimsediği kural
(CLAUDE.md: "özet + en fazla 200 karakter alıntı + link; toplu kopya yok"):

- yalnızca bir mealin dipnotunda **atıf yapılan** ayetler alınır → 299 ayet (Kutsal
  Kitap'ın 30.182 ayetinin ~%1'i)
- her alıntı ≤200 karakter, uzun ayet kesilir ve `…` ile biter (27 tanesi kesildi)
- her alıntı künye + yayıncı bağlantısıyla gösterilir; `/kaynaklar` sayfasında da yazar
- sınır ŞEMADA da var (`scriptureQuote.text.max(200)`) ve build'de bir kez daha denetlenir —
  kural yalnızca yorumda kalsaydı bir gün sessizce aşılırdı

Ayrıntı ve gerekçe: `data/scripture/LICENSE.md`.

**Hat:**
`data/scripture/books.json` (65 kitap, alternatif yazımlar — bizim derlememiz, CC BY-NC-SA) +
`cache/bible/tur.osis.xml` (git'e girmez) → `pnpm data:scripture`
(`scripts/import/scripture.ts`) → `data/scripture/quotes.json` → `scripts/build/build.ts`
`emitScripture()` → `public/data/scripture.json` → `footnote-refs.ts` `markScripture()` →
`<Translation>` içindeki `<details class="scripture-ref">`.

**Kararlar / tuzaklar:**
- Kitap adları PostgreSQL'e girmedi: hiçbir tabloyla ilişkisi olmayan bir sözlük için tablo,
  migration ve import adımı açmak hiçbir şey kazandırmıyordu. Build `data/scripture/`'ı
  doğrudan okuyup doğruluyor.
- **Belirsiz adlar bağlam ister** (`needsContext`): "Çıkış", "Yaratılış", "Yunus", "Vahiy",
  "Yakup" aynı zamanda gündelik Türkçe. Bunlar ancak dipnotta Tevrat/İncil/Kitab-ı Mukaddes
  geçiyorsa kitap sayılır — yoksa "Yaratılış amacıyla ilgili… En'âm 6:73" cümlesindeki
  "Yaratılış" kitap sanılırdı.
- **Yûnus çift taraflı tuzak**: hem sure hem Kitab-ı Mukaddes kitabı. Kur'an tarafında kirli
  dipnotta bağlanmıyor; Kitab-ı Mukaddes tarafında "Yunus 10:102" gibi atıflar bölüm
  doğrulamasına takılıyor (Yunus kitabında 10. bölüm yok) ve düşüyor.
- **Çeviri bazı ayetleri birleştiriyor**: Luka 1:1 kaydı aslında 1:1-4'ün metnidir, dosyada
  1:2/1:3/1:4 kaydı yoktur. Tam eşleşme bulunamayınca önceki kayda düşülüp bloğun aralığı
  hesaplanıyor; arayüz "bu çeviride birlikte veriliyor" diye yazıyor (6 alıntı böyle).
- Alıntısı olmayan atıf düz metin kalır — metin uydurulmaz.

## Harita yeniden kuruluyor — MapLibre + Esri (2026-09-05 baslandi)

Kullanici karari: harita motoru **MapLibre GL JS**, altlik **kendi sunucumuz (PMTiles/OSM)**,
Esri **ek katman** (uydu, elevation, ArcGIS FeatureServer) olarak. Harita sayfalarinda JS
otomatik yuklenir; diger 8100+ sayfa 0 bayt JS kalir. Guven derecesi 3'ten 4'e cikarma
(rivayet -> gelenek + tartismali) AYRI IS olarak ertelendi.

Uc proje kurali degisti: JS 0 bayt (yalniz harita sayfalarinda), kural 5 harici bagimlilik
(agir medya istisnasi), "takipsiz" (medya CDN istekleri gorur — /kaynaklar'a yazilacak).

### Biten: R2 medya deposu + harita altligi

| Ne | Durum |
|---|---|
| R2 bucket `kuran-medya` + `medya.kurankesfi.tr` | ✅ dogrulandi, HTTP/2 200 |
| `scripts/media/r2_sync.ts` (`pnpm media:r2:check/list/push`) | ✅ sha256 ile fark tespiti, cok parcali yukleme |
| **Figur kapisi** — taranmamis gorsel yuklenmez | ✅ test edildi: taranmamis `.png` TUM grubu durdurdu |
| PMTiles altlik `tiles/kesif.pmtiles` | ✅ 832 MB, z0-12, bbox 22,5 → 60,45 |
| Glyph (Noto Sans Regular + Medium) | ✅ 513 dosya, 9,4 MB |
| Range request Cloudflare uzerinden | ✅ HTTP 206, content-range dogru |

bbox konum verisinden turetildi (lng 27,4-49,5 · lat 14,1-42,7) ve genisletildi: batida Misir
colu, kuzeyde Rum/Anadolu, guneyde Habesistan, doguda Ahkaf/Uman.

### Protomaps sprite'i KULLANILMIYOR — figur

Ucuncu taraf sprite'in 53 ikonundan `theatre` **iki tiyatro maskesi**, yani insan yuzu
tasviri (goz-burun-agiz). Plan 20.3 yasagi yuze degil figure. Sprite'in tamami staging'den
cikarildi; yerine DESIGN.md paletiyle kendi minimal sprite'imiz uretilecek (konum pinleri:
kesin dolu daire, muhtemel halkali, rivayet kesikli halka — bugunku SVG haritanin kurali).
Yan fayda: 184 KB yerine ~4 KB, ve haritada restoran/tiyatro POI ikonu hic cikmaz.

### Biten: CSP kapsami + MapLibre (yayina alinmadi)

| Ne | Durum |
|---|---|
| Sayfaya gore CSP (`map $uri $kesif_csp`, nginx) | ✅ canlida; /harita ve /kissa/* acik, 8100+ sayfa kapali |
| Duman testi iki yonlu CSP denetimi | ✅ `pnpm run deploy:smoke` temiz |
| `lib/harita/style.ts` — elle yazilmis MapLibre stili | ✅ sprite YOK, pois YOK, renk global.css'ten |
| `components/HaritaCanli.astro` — ada | ✅ iki temada dogru, konsol hatasiz |
| Altlik 5,3 - 72,48 z0-12 | ✅ 2,37 GB (kotanin %24'u) |
| JS yalniz harita sayfasinda | ✅ dist'te tek sayfa betik yukluyor: harita.html |

**YAYINDA** (2026-09-05, `20260905T184222Z`). R2 CORS panelden kuruldu ve
dogrulandi (206 + `access-control-expose-headers: content-range`, preflight 204).
Canli sitede gercek CSP ve gercek CORS altinda Playwright ile olculdu: iki temada
da harita aciliyor, CSP ihlali yok, konsol hatasi yok.

### Olculerek bulunan uc tuzak (hepsi sessiz bozulmaydi)

8. **maplibre-gl v6 isci dosyasini cikti dizinine koymaz.** Adresi
   `import.meta.url`den DEGISKENLE kurdugu icin paketleyici goremiyor. Build
   basarili, sayfa 200, harita BOS. `scripts/prepare-harita.mjs` isciyi ve
   `maplibre-gl-shared.mjs`i `public/_maplibre/` altina kopyalar, bilesen
   `setWorkerUrl` ile adresi acikca verir. CSP'de `worker-src 'self' blob:`.
9. **`maxBounds` `fitBounds`i sessizce eziyordu.** MapLibre kutunun disina
   tasmayi engellemek icin en dusuk zoom'u YUKSELTIYOR; 42 derecelik kutu genis
   ekranda z4,3 istiyordu, oysa 26 konum z3,3 gerektiriyor. Sonuc: Zulkarneyn
   Seddi (42,1K) ve Habesistan (14,1K) ekran disindaydi ve hicbir hata yoktu.
   `maxBounds` kaldirildi, `minZoom: 2.5` kondu.
10. **`.mjs` nginx mime.types'ta YOK.** Isci `application/octet-stream` donuyor,
    tarayici modul isciyi calistirmiyor ve KONSOLA HATA YAZMIYOR. Yayinda tam
    olarak bu oldu: sayfa 200, CSP temiz, PMTiles basligi 206, harita yine de
    acilmadi. Kullanici bozuk bir sey gormedi — kademeli iyilestirme statik
    SVG'yi yerinde tuttu. Cozum: `location ^~ /_maplibre/ { default_type
    text/javascript; }`. `types` blogu DEGIL — server icinde `types` http
    duzeyindeki tum eslemeyi ezer ve css/gorsel tiplerini bozar.
11. **Symbol cakismasinda SONRA gelen katman kazaniyor.** Ters varsayilmisti;
    konum etiketleri OSM etiketlerinin onune alininca "Kenan", "Ninevâ",
    "Ur / Harran" kayboldu. Kural olcumle konuldu, belgeye guvenilmedi.

Ayrica: `maplibre-gl-shared.mjs` hem ana pakette hem isci yanindа duruyor
(~130 KB gzip fazladan, yalniz harita sayfasinda, bir yil onbellekli).
Paketleyiciyi zorlamak maplibre'nin ic yapisina bagimli olurdu.

**DESIGN.md 1 uyumsuzlugu duzeltildi:** SVG haritada `kesin` ALTIN ciziliyordu,
yani `muhtemel` ile ayni renkti; DESIGN.md `--success` diyor. Iki harita da
artik kesin=yesil, muhtemel=altin, rivayet=gri kesikli.

### Biten: kissa rotasi (F2, yayinda)

`/kissa/<slug>` sayfasinda "Kissanin gectigi yerler" bolumu artik harita da
tasiyor. Veri zaten vardi (`story.locations[].order` + `passageOrders`), yeni
veri girilmedi; 25 kissa birden kazandi.

| Ne | Nasil |
|---|---|
| Sira numarali pin | "1 Misir", "2 Medyen"... `sira` ozelligi GeoJSON'a ekleniyor |
| Kesikli rota cizgisi | Guzergah IDDIASI degil SIRA — duz cizgi yol demek olurdu |
| Tiklaninca panel | konum + guven derecesi + modern ad + o duraktaki olay + **ayet etiketi** |
| Ayet etiketi | `passageOrders` -> `story.passages` -> "Kasas 22-28". Ayet METNI kopyalanmaz |

Iki incelik:

- **Ayni yer iki kez gecebilir** (Musa: Sina order 3 ve 5). Nokta listesi
  tekillestiriliyor (tek pin), rota listesi tekillestirilmiyor (cizgi iki kez
  ugruyor), `id` yalnizca ILK gecise konuyor (yinelenen id HTML'i bozardi).
- **Etiket yerlesimi degisken capa** (`text-variable-anchor`). Sabit "altta"
  iken "Ibrahim'in Memleketi — Ur / Harran" harita kenarindan tasip
  kirpiliyordu. Ayrica fitBounds kenar payi PIN icin degil ETIKET icin
  hesaplaniyor ve konteyner genisliginin orani (0,18) — telefonda sabit
  120 px pay haritanin yarisini yerdi. Iki degeri de olcerek koydum.

### Cloudflare cache: 512 MB duvari

Cache Rule kuruldu ve calisiyor — glyph `.pbf` dosyalari `MISS` -> `HIT`.
Ama `.pmtiles` `DYNAMIC` kaliyor ve KALACAK: Free/Pro/Business planlarinda
**512 MB ustu dosya cache'lenmez**, arsiv 2,37 GB. Zoom seviyeleri olculdu:
z0-10 = 527,6 MB (sinirin hemen ustunde), z0-11 = 1,1 GB, z0-12 = 2,37 GB.
Yani sinirin altina inmek z10'a dusmeyi gerektirir ve Mekke/Medine detayini
kaybettirir.

**Kalmasina karar verildi.** Olculen maliyet: bir harita acilisi 12 istek,
ucretsiz Class B kotasi 10M/ay -> ~200 bin harita acilisi bedava, sonrasi
milyon basina $0,36. Detay bu paraya degmez.

### Biten: Esri uydu katmani (F3, yayinda)

`/harita` ve konumu olan 25 kissa sayfasinda sol ustte **Harita / Uydu** secicisi.
Gercek radio grubu (MapLibre denetimi degil): klavyeyle gezilir, ekran okuyucu
"Katman" grubunu okur.

**Yalniz RASTER alindi.** Esri'nin hazir `arcgis/imagery` stili 231 katman ve bir
SPRITE getiriyor; sprite ucuncu taraf ikon atlasidir ve icerigini biz
denetlemiyoruz (Protomaps sprite'inda `theatre` = iki tiyatro maskesi, insan yuzu
cikmisti). Stilin tamami alinmadi, icinden yalnizca `World_Imagery` raster
kaynagi cikarildi — fotograf ikon atlasi tasimaz. CSP'ye yalnizca
`ibasemaps-api.arcgis.com` girdi; Esri'nin stil/sprite/vektor sunuculari ACILMADI.

**Anahtar:** `PUBLIC_ARCGIS_API_KEY`, repo kokundeki `.env`. Astro kendi dizinine
bakiyordu ve degiskeni SESSIZCE bulamiyordu — `astro.config.mjs` icine
`vite.envDir` eklendi. `import.meta.env` KOSELI PARANTEZ ile okunamaz:
esbuild "Unexpected env" parse hatasi verip build'i durdurdu, nokta gosterimi sart.

Yonlendirici kisiti olculdu: `kurankesfi.tr` referrer'i ile 200, baska kaynaktan
**"Token Invalid"**. Pay-as-you-go kapali; ucretsiz kota (2M tile/ay) bitince
servis durur, fatura gelmez.

**Uydu uzerinde uc sey ayrica ayarlanir** (foto zemin bizim degil, token yetmez):

| Ne | Vektor altlikta | Uyduda | Neden |
|---|---|---|---|
| Etiket | `--text-primary` + `--map-land` hale | beyaz + siyah %85 hale | foto alacali, token kontrasti garanti etmiyor |
| `muhtemel` pin ici | `--map-land` | siyah %55 | lacivert dolgu foto uzerinde yamaya benziyordu |
| `rivayet` pin hatti | `--text-muted` | beyaz | gri foto uzerinde kayboluyor |
| Rota cizgisi | altin, 2 px | altin `--accent` 2,5 px + **koyu kilif** | altin kum renginde kayboluyordu |

Ilk denemede uc pinin de hattini beyaz yapmistim; olculdu ve DESIGN.md §1'i
ihlal ediyordu — altin (muhtemel) ile gri (rivayet) ayrimi tamamen kayboluyordu.
Derece renkleri korunacak, yalniz fotografta kaybolanlar degisecek.

### Harita renkleri artik kendi token'inda

`--map-water` / `--map-land` eklendi (DESIGN.md §1, kullanici onayiyla).
Once harita denizi `--bg-primary`, karayi `--bg-elevated` ile boyuyordu; karanlik
modda tesadufen kabul edilebilirdi ama **acik modda ters okunuyordu** —
Kizildeniz parsomen bej, kara beyaz cikiyordu, yani deniz kum gibi gorunuyordu.
Sebep semantikti: `--bg-*` ARAYUZ rengidir, hicbiri "su" ya da "toprak" demez.
Statik SVG harita da ayni ikiliyi kullanir; biri digerinin JS'siz karsiligi.

Ayrica kiyi cizgisi (`--border-strong`, z4+) eklendi ve yol rengi `--border`den
`--text-muted`e cekildi — `--border` neredeyse siyah zeminde gorunmuyordu,
z10'da Suudi otoyollari ekranda hic yoktu.

### Kapanan acik madde: Arapca etiket

Gerek kalmadi. Yakinlastirilip olculdu: `name:tr` -> `name:en` zinciri butun
bolgeyi kapatiyor (Al Qunfudhah, Abha, Necran...), hicbir yerde kutu cikmiyor.
Amiri'den glyph uretme isi iptal.

### Sirada

1. **Cloudflare Cache Rule** (kullanici islemi, BEKLIYOR) — `cf-cache-status: DYNAMIC` geliyor.
   `.pmtiles` ve `.pbf` varsayilan cachelenen uzantilar degil; her istek R2'ye gidiyor ve
   Class B islem sayiliyor. Rules > Caching rules > hostname `medya.kurankesfi.tr` > Eligible for cache.
2. Kissa rotasi — veri HAZIR: `story.locations[].order` + `passageOrders`
   (hz-musa: misir → medyen → sina-tur → kizildeniz-gecis → sina-tur; 25 kissa konumlu)
5. Esri katmanlari (`maplibre-arcgis` v1.3.1, Object Read izniyle ayri API anahtari)

### Acik: Arapca etiket

Protomaps glyph paketinde Arapca yok (Noto Sans Latin/Kiril/Yunan). Etiket dili `name:tr` →
`name:en` → `name` sirasiyla kurulursa cogu yer Latin harfle cikar; `name` fallback'e dusen
Arapca isimler kutu gorunur. Cozum: repoda zaten self-host edilen Amiri'den glyph pbf uretmek.
Ilk surumde Latin etiketle gidilecek, kutu cikan yer olursa bakilacak.

## Açık konu: `/kissa/*` CSP'si

`map $uri $kesif_csp` bloğu `/harita` yanında `/kissa/*` için de `script-src 'self'`,
`worker-src blob:` ve `connect-src https://medya.kurankesfi.tr` açıyor. Ama kıssa
sayfalarında **hiç betik yok** (`HaritaCanli` oraya import edilmiyor) — ölçüldü:
50 kıssa sayfasının tamamında 0 `<script>`. Kıssa sayfasına harita eklenmeyecekse bu
satır kaldırılmalı; eklenecekse olduğu gibi kalsın. Karar kullanıcıya ait, tek taraflı
değiştirilmedi.

## Ana sayfada harita + meal sayısı (2026-09-07) — YAYINDA

Kullanıcı: *"ana sayfaya da harita modülünü koyalım, ordan gitmek isteyen olabilir."*
Ana sayfada `/harita`ya **dört metin bağlantısı zaten vardı**; eksik olan haritanın
görünmesiydi.

**Statik SVG bileşene çıkarıldı.** Projeksiyon + Natural Earth kara halkaları +
pin yerleri `apps/web/src/lib/harita/statik.ts`, çizim
`apps/web/src/components/HaritaStatik.astro`. İki varyant:

| varyant | nerede | fark |
|---|---|---|
| `tam` | `/harita` | etiketli pinler + kaynak alt yazısı, MapLibre üstüne biner |
| `onizleme` | ana sayfa `#harita` | etiket yok, kart tamamı `/harita`ya gider |

`/harita` çıktısı **birebir aynı** kaldı (deploy öncesi canlı sürümle diff'lendi).

**MapLibre ana sayfaya KONMADI.** ~970 KB betik ve ana sayfanın CSP'sinde
`script-src` açmak demekti; ikisi de plan §20.4'ü (LCP < 2 sn / 3G) ve
"8200+ sayfa 0 bayt JS" kuralını kırardı. Ana sayfa hâlâ **0 `<script>`**,
CSP'sinde `script-src` yok — duman testi bunu her yayında doğruluyor.

Maliyet: ana sayfa 6,5 KB → 16,1 KB gzip. Artışın tamamı kara çizgileri
(7,7 KB gzip); ayrı istek değil, HTML'in içinde.

**Önizleme YÜKSEKLİKTEN boyutlandırılır.** Kadraj portre (1000×1371 — Habeşistan
–Anadolu arası enlem, boylamdan geniş). `width:100%` + `max-height` denendi ve
yanlıştı: viewBox'lı SVG'de genişlik kaba yayılır, çizim `meet` ile ortalanır ve
iki yanında boş deniz şeridi kalır. `width:auto; height:34rem` tam oturuyor.

**Meal sayısı düzeltildi.** Ana sayfa aynı anda iki farklı sayı basıyordu:
hero'da veriden gelen `54`, modül listesinde elle yazılmış `26` (Mehmet Alagaş
mealı eklenmeden önceden kalma). Ayrıca `54` bir Türkçe okura "54 Türkçe meal"
diye okunuyordu; gerçek dağılım **27 Türkçe + 27 İngilizce**. Üç yer de artık
dili ayırarak `turkishAuthors.length` / `englishAuthors.length` basıyor.

Ölçüm (2026-09-07): 6029 ayette 54 meal, 207 ayette 53. Eksikler
`mehmet-alagas` 168 ayet, `suleymaniye-vakfi` 34 ayet (66. sure tamamen),
3 İngilizce yazarda 1-2 ayet.

## AI medyası yayına girdi (2026-09-07) — 10 kayıt

İlk AI çıktıları `media/ai/cikti/` altına bırakıldı: **6 görsel (1536×864) + 4 video
(960×544, 9,96 sn)**. `pnpm media:ai:collect` onları `ai_generated.json`'a yazdı.

| kayıt | kıssa | konum | tür |
|---|---|---|---|
| `nuh-gemi-hazirlik` (+video) | hz-nuh | cudi | IMAGE + VIDEO |
| `musa-tuva-vadisi` (+video) | hz-musa | sina-tur | IMAGE + VIDEO |
| `semud-kaya-yerlesimi` (+video) | hz-salih | hicr | IMAGE + VIDEO |
| `sebe-marib-kenti` (+video) | sebe | sebe-marib | IMAGE + VIDEO |
| `yusuf-kuyudan-cikarilmasi` | hz-yusuf | kenan | IMAGE |
| `firavun-sarayi` | firavun | misir | IMAGE |

### Yüz taraması

Altı görsele tam çözünürlükte, figür bölgeleri 2× büyütülerek bakıldı. Dört video
5 karede bir örneklenip (video başına 50 kare) kontak sayfalarında incelendi.
Sonuç `faceScanNote` alanlarında kayıt kayıt yazılı.

Sekizi tanınabilir yüz içermiyor. İkisi **karar gerektirdi** ve kullanıcı onayladı:
`yusuf-kuyudan-cikarilmasi` (net yüzler var ama hepsi kervancılara ait, Yûsuf kuyuda
ve kadrajda değil) ve `firavun-sarayi` (saray erkânı görünüyor, Mûsâ sahnede değil).

### İki hata yakalandı, ikisi de yayına çıkmadan

**1. AI kayıtları hiçbir sayfaya bağlanmıyordu.** `scripts/import/content.ts`
`media_story`, `media_verse`, `media_timeline_event` ve `location_id` alanlarını
yalnızca `data.media`'dan (gerçek medya) dolduruyordu. AI kaydı `media_item`'a
giriyor, taramadan geçiyor, `media.json`'a çıkıyor ve **hiçbir sayfada
görünmüyordu** — kıssa sayfası `storySlugs` ile süzüyor, dizi hep boş. Hata yoktu,
uyarı yoktu; kayıt ortada yoktu.

Bağlar prompt'ta zaten duruyor (`storySlug`, `locationSlug`, `timelineOrder`) ve
`crossCheck` bunları **doğruluyordu ama kimse kullanmıyordu**. Düzeltildi: AI
medyası bağını prompt'undan alıyor.

Ayet bağı hâlâ yok — `aiPromptInput` şemasında `verseRefs` alanı yok. AI medyası
kıssa ve konum sayfalarında çıkar, **ayet sayfalarında çıkmaz**.

**2. R2 kapısı yoktu.** `media:r2:push` `media/` altındaki her şeyi yürüyor,
`faceScanned`'e bakmıyordu. Dosya sayfada görünmese de
`medya.kurankesfi.tr/ai/cikti/<id>.png` adresinden **erişilebiliyordu**. Kapı
üç yerde birden dursun diye `r2_sync.ts` içine eklendi: kayıt `faceScanned` değilse
ya da diskteki sha256 kayıttakiyle tutmuyorsa dosya yüklenmez.

Kaldırılan figür kapısından farkı: o, görselin İÇERİĞİNİ hash ile denetlemeye
çalışıyordu ve bu imkânsız olduğu için kaldırıldı. Bu kapı içeriğe bakmıyor,
**insanın verdiği kararı** okuyor; sha256 yalnızca kararın hangi dosyaya
verildiğini bağlıyor.

**Kapı geç kaldı:** bu 10 dosya kapı yazılmadan önce R2'ye çıkmıştı ve tarama
yapılmadan önce halka açıktı. Onaylandıkları için zarar kalmadı, ama sıradaki
partide kapı önce gelmeli. `r2_sync.ts` uzaktaki onaysız nesneyi **silmiyor**,
yalnızca yenisini yüklemiyor.

## Tuzaklar (hepsi bir kez yaşandı)

1. `pnpm deploy` pnpm'in yerleşiği — sessizce hiçbir şey yapmaz. **`pnpm run deploy`** kullan.
2. Build komutları **repo kökünden** çalışır; `cd apps/web/src` yapıp unutmak `build:web not found` verir.
3. `astro check` OOM oluyor (exit 137). Gerçek denetim `pnpm build:web`.
4. `pkill -f "http.server"` kendi bash'ini öldürür (exit 144); `pgrep -f "[h]ttp.server"` kullan.
5. Medya/görsel geldiğinde **kaynağı VE çıktıyı** kare kare tara — figür yasağı (plan §20.3).
   İlk hero kesimi üç yerde figür geçirmişti ve yayına çıkmıştı.
8. **Çalışma dizini sessizce kayıyor.** Arka plan komutları ve `cd`'li zincirler sonrası
   kabuk `/www/wwwroot/kurankesfi.tr`'de kalabiliyor; göreli yollu `rm -rf apps/web/dist`
   ya da `python3 - <<PY` yamaları o zaman YANLIŞ YERDE çalışır ve sessizce başarısız olur
   (bir kez dist hiç silinmedi, bir kez yama hiç uygulanmadı). Repo dosyalarına dokunan her
   komutta **mutlak yol** kullan ya da `cd /opt/kuran &&` ile başla.
9. **İki oturum aynı repoda build alamaz.** Astro başlarken `dist`'i temizliyor; ikinci
   build birincinin ara dosyalarını siliyor ("Cannot find module dist/pages/....mjs",
   "renderers.mjs"). Bu oturumda üç build böyle kırıldı. Build almadan önce
   `pgrep -f "[a]stro\\.js build"` ile bak.
10. `pgrep -f "astro.js build"` **kendini yakalar** — beklerken sonsuz döngü olur.
   Köşeli parantezle yaz: `pgrep -f "[a]stro\\.js build"`.
6. `data/**` değişince `pnpm content:import` çalıştırılmazsa build eski veriyle geçer.
   Duman testi artık `/kissa/hz-yusuf` gibi adresleri kontrol ediyor, sessiz kalmıyor.
7. Türetilmiş ilişkilerde **puan tek başına yetmez, çeşitlilik sınırı şart**. İlk sürümde
   Bakara 153'ün sekiz bağının sekizi de tek bir nadir kökten (عون) geliyordu; sabır bağı
   listeye hiç giremiyordu. `MAX_PER_REF = 3` bunu çözdü — bkz. `scripts/import/lib/relations.ts`.
11. **Ana sayfada elle yazılmış sayı bırakma.** 2026-09-07'de aynı sayfa hem `54` hem `26`
   meal yazıyordu; biri veriden geliyordu, öteki koda gömülüydü ve yazar eklenince bayatladı.
   Sayı daima `authors_index.json`'dan hesaplanır.
13. **`pgrep -f "<desen>"` kendi bash sarmalayıcısını yakalar.** `pgrep -af "node.*astro.js build"`
   çalışan build olmadığı hâlde 2 döndürdü: desen, komutu çalıştıran `bash -c`'nin kendi
   komut satırında geçiyor. Köşeli parantez de yetmiyor. Doğrusu süreç adına bakmak:
   `ps -eo comm,args --no-headers | awk '$1=="node" && /astro\.js build/'`.
14. **Duman testi yayından hemen sonra yanlış alarm veriyor.** `contains()` gövdeyi
   `|| body=""` ile yutuyor; 13509 dosya kopyalandıktan sonra disk doluyken 20 sn zaman
   aşımı yetmiyor ve `og:image BULUNAMADI` diyor. Sembolik bağlantı çevrilmiş, sayfa 200,
   içerik doğru. 2026-09-07'de iki kez oldu. `contains()` boş gövdede yeniden denemeli.
12. **Sayfa dosyasındaki `import.meta.url` taşınırken kırılır.** `harita.astro` içindeki
   `dirname(fileURLToPath(import.meta.url)) + "../../../../"` şans eseri doğruydu; kütüphaneye
   taşınınca paket `dist/chunks/` altına düşer ve derinlik değişir. Yeni kod `DATA_DIR`
   üzerinden kök buluyor (bkz. `lib/data-dir.ts`, aynı tuzak tefsiri sessizce yayından
   düşürmüştü).

## Hero videosu (2026-09-06 durumu)

`scripts/media/build_media.ts` **parça (segment) listesi** kullanıyor; iki tür var:
`src` (kaynak aralığı, `SPEED` ile gerilir) ve `still` (duran görsel, `zoompan` ile yavaş
iç çekim). Sıra: kesintisiz gövde → **Kâbe** → uzaydan dünya.

| Ayar | Değer | Neden |
|---|---|---|
| `SPEED` | **0.60** | Kullanıcı iki kez "çok hızlı" dedi; 0.85 yetmedi |
| Gövde | 1.80–18.60 sn kaynak | Öncesi uzay siyahı, sonrası siyah uzayda dünya |
| Kâbe | `kabe.jpg`, 6 sn | Kaynakta Kâbe YOK (bkz. aşağı) |
| Kapanış | 18.60–19.95 sn | Kullanıcı isteği: "sonra dünyaya uzaydan" |
| Toplam | **35.05 sn**, 3.9 MB | Boyut kullanıcı kararıyla kabul edildi |
| `EQ` | gamma 1.55, sat 1.30, kontrast 1.06 | gamma 1.7 çöl göğünü kırpıyordu |
| `CRF` | 30 | Perde kalkınca 36'da blok görünüyordu |

**Kâbe karesi üretilmiştir** (`scripts/media/kabe.jpg`, Higgsfield / nano_banana_pro,
2026-09-06, 2 kredi). Sebep: kaynak videoda Kâbe yok — sondaki yapı altın kubbe + turkuaz
kubbe + minare, yani Kubbetü's-Sahra görünümü. Kesmeyle düzeltilemezdi. Krea'da bakiye
yoktu (video 32.5 kredi, görsel 2). Hareket ffmpeg `zoompan` ile veriliyor, model değil.

**Figür kısıtı kaldırıldı** (kullanıcı, 2026-09-05/06). `CLAUDE.md` kuralı da güncellendi:
artık yalnızca **peygamberlerin yüzü gösterilmez**; uzak, küçük, sırtı dönük siluet serbest.
Kısıt kalkınca kesmeye gerek kalmadı, gövde tek parça oldu.

**Parlaklık kapısı parça farkında**: gövde 60, kasıtlı karanlık kapanış 45. Sınır, geçişin
bittiği an değil **başladığı** andır — ilk hesap bunu kaçırmıştı.

### Perde / okunurluk — AÇIK DÖNGÜ

Kullanıcı **üç kez** "perde çok koyu, görüntü anlaşılmıyor" dedi. Her turda perde azaltıldı:

| Tur | Perde çekirdeği | Slogan p05 | Giriş p05 |
|---|---|---|---|
| 1 | %20 | 1.80 ✗ | 2.62 ✗ |
| 2 | %32 | 2.49 ✗ | 3.77 ✗ |
| 3 | %38 | 3.01 ✓ | 4.72 ✓ |
| 4 | **%24, elips %58×62 → %42×46** | **ÖLÇÜLMEDİ** | **ÖLÇÜLMEDİ** |

Eşikler: slogan 3.0 (24px = büyük metin), giriş 4.5 (normal metin). Ölçüm **haleyle**
yapılır (WCAG 1.4.3): iki kare alınır (normal + metin rengi şeffaf), fark glif maskesidir,
maskenin 2px komşusundaki renk okunur. Arka plana videonun en parlak karesi sabitlenir.

**Sıradaki adım:** `pnpm build:web` bitti mi bak, sonra ölç. Slogan 3.0'ın altına düşerse
çözüm perdeyi geri açmak DEĞİL — kullanıcı görüntünün açık olmasını istiyor. Önerilecek
çözüm: sloganın `font-weight: light` → normal. Harf kalınlaşınca hem okunur hem halka daha
iyi tutar, görüntü açık kalır. Bu bir tasarım değişikliği, **kullanıcı onayı gerekir**.

Ölçüm yordamı: dist'i `python3 -m http.server 8807` ile servis et, Playwright ile iki
şemada (dark/light) dört öğenin (`h1`, `.lp-hero-sub`, `.lp-hero-lede`, `.lp-hv-tr`) A/B
karesini al, PNG'leri ffmpeg ile ham RGB'ye çevir, maske + komşu hesabını yap.
**Build almadan önce sunucuyu kapat** (Tuzak 9).

## Kaynak araştırması — 2026-09-06 (bağlam sıfırlanırsa BURADAN devam)

Tam kayıt: **`docs/KAYNAK_ENVANTERI.md`**. Özet:

- **Alınabilir, lisansı temiz:** quranenc.com (3 TR meal, SQLite doğrudan indirme) ·
  QUL/TarteelAI (TR **kelime-kelime meal** + Diyanet + Elmalılı + 3 TR tefsir) ·
  OpenITI (8 klasik eser — Vâhidî *Esbâbü'n-Nüzûl*, Süyûtî *Lübâbü'n-Nükûl*,
  Yâkût *Mu'cemü'l-Büldân* dahil) · Corpus Coranicum TEI (2323 yazma).
- **Reddedildi:** `islamic-library-data` (lisans yok), `Keremcm/Quran-i-Kerim-Data`
  (tefsir = mealin kopyası), `asbab-al-nuzul-dataset` (MIT etiketi telifli kitabı temizlemiyor),
  `fawazahmed0/quran-api` (Unlicense ama TR meallerin telifi temizlenmemiş),
  Kütüb-i Sitte JSON depoları (lisanssız). Gerekçeler envanterde.
- **Kapalı olduğu kanıtlandı — tekrar aranmasın:** Elmalılı *tam tefsiri* dijital metni
  hiçbir yerde yok (yalnız meali var) · Türkçe İslam tarihi/kıssa açık veri seti yok →
  mevcut elle derleme yolumuz doğruymuş.
- **Okuyan / İslamoğlu / Esed:** açık lisans yok, sitelerinden indirilemez. `hayatkitabikuran.com`
  mealin tamamını gösteriyor ama API/lisans yok → kazınmaz. Tek yol yazılı izin.
  (Bu zaten `scripts/import/tanzil_translations.ts:58-59`'da yazılıydı.)
- **Mehmet Alagaş meali** (kullanıcı eklemek istiyor): kaynağı bulundu —
  `insandergisi.com/kuran-meali.pdf`. Ücretsiz ama lisanssız, 2075'e kadar telifli.
  PDF nüzul sıralı ve **meal + yorum karışık** → içerik ikiye ayrılmadan gösterilemez.
  İzin başvurusu BACKLOG'da.
- **Yazma (mushaf) katmanı:** ayet↔yazma bağı TEI'de hazır (`msItem/title/@key`), kelime
  bazında bile mümkün; ama **görseller `restricted`** → yalnız derin bağlantı.
  Lisans CC BY-SA ≠ bizim CC BY-NC-SA → `data-external/` ayrı ağaç şart.
- Kullanıcının 2026-09-06 tarihli görsel/harita/mushaf belgesindeki **planda olmayan**
  maddeler `docs/BACKLOG.md` → "Özellik önerileri" altına "ilk yayın sonrası" notuyla
  yazıldı (Media şeması, gerçek foto ↔ AI ayrımı, AI illüstrasyon ve 10 sn video hattı,
  yazma şeması + zaman çizelgesi, `data-external/`).

**Kütüphane ≠ yayın (2026-09-06 kullanıcı kararı).** Bir kaynağı almak ile göstermek ayrı
kararlar: alma ölçütü **yalnız lisans**, gösterme ölçütü **değerlendirme** (eğitimli model +
onay). Editoryal itiraz almayı engellemez, göstermeyi engeller. Tam metin:
`docs/KAYNAK_ENVANTERI.md` §0.

**QUL hesabı açıldı (2026-09-06)**, el-Muhtasar Türkçe indirildi ve içe alındı.
QUL'dan alınacak başka bir şey kalmadı (Sa'dî quranenc'ten geldi, İbn Kesîr'in Türkçesi
QUL'da yok, kelime-kelime meal zaten vardı).

**Telif/izin:** proje sahibi yürütüyor; kaynaklar için izinler alınmış durumda
(karar 2026-09-06). İçe alma sırasında lisans sorgulaması yapılmaz.

**Kullanıcı dosya bırakma yeri:** `/www/wwwroot/kurankesfi.tr/tmp/` — kullanıcı indirdiği
dosyaları buraya koyuyor, oradan alınır. Yayın ağacının dışında (nginx kökü `current`
sembolik bağı), dışarıdan erişilemiyor — doğrulandı, 404.

**Corpus Coranicum'da işlenmemiş 5 veri seti daha var** (aynı depo, aynı lisans):
`quran_variants` (kıraat farkları), `quran_intertexts` (714 dosya, geç antik metin ilişkileri —
kıssa katmanına doğrudan denk), `quran_concordance` (tam gramer çözümü), `quran_commentary`
(85 dosya kronolojik şerh), `cairo_quran` (1924 Kahire baskısı). Karar §0 gereği ayrı verilir.

## Sıradaki adımlar (öneri sırası)

### 0. Kaynak içe alma (2026-09-06)

| Adım | Durum |
|---|---|
| quranenc 3 TR meal | **BİTTİ.** `scripts/import/quranenc.ts` · `pnpm data:quranenc` · 18 708 satır + 29 dipnot · build temiz (8212 sayfa) |
| QUL kelime-kelime meal | **İPTAL.** Veri zaten tam: `verse_part.translation_tr` 77 429/77 429. QUL kaynak 99 aynı veri |
| Tefsir — Sa'dî TR | **BİTTİ.** `tafsir` + `tafsir_block` tabloları · `scripts/import/quranenc_tafsir.ts` · `pnpm data:quranenc-tafsir` · **6986 blok, 114 sure, 6236 ayetin %100'ü**. Projenin ilk tefsiri. **Arayüz yok** — §0 gereği yayın kararı ayrı |
| Tefsir — el-Muhtasar TR | **BİTTİ.** `scripts/import/qul_tafsir.ts` · `pnpm data:qul-tafsir` · **6222 blok, 114 sure, 6236 ayetin %100'ü**. Dosya elle indirilir (QUL oturum ister), `cache/qul/turkish-mokhtasar.json` |
| OpenITI atıf hedefleri | **BİTTİ.** `data-external/openiti/works.json` (9 eser künyesi, metin yok) |
| QUL kelime-kök | **BİTTİ.** `qul_word_root.ts` · `pnpm data:qul-roots` · **3052 boşluk dolduruldu, kök kapsamı %61 → %65** |
| QUL lafzî benzerlik | **BİTTİ.** `qul_matching_ayah.ts` · `pnpm data:qul-matching` · **3552 `parallel_passage` bağı** (1919 kesin / 1633 muhtemel), 1162 ayetten |
| QUL kıraat (Huthayfî) | **ATLANDI.** Yalnız sure düzeyinde MP3 adresi; `segments.json` boş → ayet zaman damgası yok, okuma takibi yapılamaz. Segmentli bir kârî dosyası gelirse bakılır |
| Corpus Coranicum | **BİTTİ.** `scripts/import/corpus_coranicum.ts` · 2322 yazma, 48 863 sayfa-ayet aralığı · **6236 ayetin %100'ü en az bir yazmada** · görüntü yok, derin bağlantı |
| "ilm" depoları | **İKİSİ DE ELENDİ.** `madogan/Wasl` arşivlenmiş ve boş; `ttv92110/IlmUlQuran` Apache-2.0 ama veri kökeni atıfsız + ebced eksenli |

Ayrıntı: `docs/KAYNAK_ENVANTERI.md` §7.

**Yayınlanmadı.** Build alındı, `pnpm run deploy` çalıştırılmadı — canlıda hâlâ
`20260905T185939Z` var. Üç yeni meal siteye ancak deploy'dan sonra çıkar.

### 1. İçerik genişletme

Kıssa 34 → 50 (Ashâb-ı Sebt, Ashâb-ı Karye, Talût, Belkıs ayrı, İrem…), kavram 71 → 100,
ilke 32 → 60. Kalıp yerleşti: `data/**` dosyası yaz → `pnpm content:import` → `pnpm build`.

### 2. Telegram botu (§19)

İlkeler modülü ön koşuluydu, artık hazır. `schedule.json` üretimi (`principle_verse` üzerinden
yıllık takvim) + `infra/db/bot_schema.sql`. Site statik kalır, bot ayrı küçük servis.

## Medya katmanı (2026-09-06'da kuruldu) — 34 gerçek kayıt, 10 prompt

Plan §24, kaynak spec `tmp/MEDYA-*.md` §32-71. **Yayında:** kıssa sayfalarında
ve ayet sayfalarında "Keşfet — medya" paneli.

| Katman | Dosya |
|---|---|
| Şema | `packages/schema/src/media.ts` + `content_input.ts` (media bölümü) |
| Girdi | `data/media/media_<coğrafya>.json` × 10 · `data/media/prompts/prompt_<slug>.json` × 6 |
| Lisans çekimi | `scripts/import/wikimedia.ts` → `pnpm data:wikimedia` |
| Tablo | `media_item`, `media_story`, `media_verse`, `media_timeline_event`, `media_source`, `ai_prompt` |
| Dışa aktarım | `media.json` + `verse_media.json` (ikisi de build-only) |
| Okuma | `apps/web/src/lib/media.ts` |
| Bileşen | `MedyaPaneli.astro`, `MedyaKarti.astro` · CSS `global.css` "Medya paneli" |
| AI hattı | `scripts/media/ai_queue.ts` + `ai/provider.ts` + `ai/file_queue.ts` |
| Testler | `packages/schema/src/__tests__/media.smoke.ts` (38 test) |

**10 coğrafya, 34 kayıt, hepsinin lisansı API'den ölçüldü:** 19 CC BY-SA ·
8 CC BY · 5 CC0 · 1 kamu malı. Hiçbiri kısıtlı çıkmadı, hiçbiri `UNKNOWN`
kalmadı. **Dosya indirilmedi** (kullanıcı kararı + spec §71): kartlar künye ve
"Kaynağı görüntüle" ile duruyor. İndirme kararı verilirse `localPath` doldurulur,
`pnpm media:r2:push` yükler, arayüz değişmez.

### Bir kez yaşanmış tuzaklar

- **Commons kategori adı yanıltıyor.** `Category:Hegra` NORVEÇ'te bir köydür
  (25 dosyanın hepsi Trøndelag manzarası). Suudi Hicr alanı `Qasr al-Farid` ve
  `Madain Salih` başlıkları altında. Kategori adına bakıp dosya seçilmez.
- **Spec'teki dosya adı yanlıştı.** §35 "Cudi Dağı panorama.jpg" diyor;
  Commons'ta "Cudi Dağı **panaroma**.jpg". Bu yüzden dosya adları elle
  kopyalanmaz, `pnpm data:wikimedia --category "<ad>"` ile listelenip doğrulanır.
- **Commons `imageinfo.url` utm parametresi ekliyor.** Takip parametresi veri
  dosyasına yazılırsa kalıcılaşır; `withoutTracking` sorgu dizesini atıyor.
- **`faceScanned` değişikliği import'suz yayına yansımaz.** `data/**` tek
  kaynak, veritabanı türetilmiş kopya — alanı true yaptıktan sonra
  `pnpm content:import` şart. Kapı iki yönlü de ölçüldü (2026-09-06):
  taranmamışken 34 yayında, taranmış işaretlenince 35.

### Yol boyunca düzeltilen ayrı bir kırık

`pnpm lint:refs` **HEAD'de zaten kırıktı** ve medya işiyle ilgisi yok:
`build.ts` 2026-09-06 kararıyla QuranEnc platform atıf bağlantısını kaldırmış
(meal atfı yazara verilir), ama `linter.ts` içindeki `requiredLinkBySource`
hâlâ `quranenc.com` bağlantısını arıyordu. Kaynak `quranenc` olan meal var,
aranan bağlantı hiç üretilmiyordu → build durum. Kural kaldırıldı, gerekçe
linter'ın içine yazıldı. QuranEnc'in kendi 3. koşulu bağlantı değil **sürüm
numarası** istiyor ve o arayüzde gösteriliyor.

### Yapılmayanlar ve nedeni

| İş | Neden |
|---|---|
| Gerçek görselleri indirme | Kullanıcı kararı: önce künye + lisans (spec §71 sırası) |
| AI görsel/video üretimi | Spec §71 açıkça yasaklıyor; hat hazır, `canGenerate=false` |
| Lightbox / kaydırmalı galeri | JavaScript gerekir, CSP değişmiyor |
| `/medya` dizin sayfası | Kapsam dışı; panel kıssa ve ayet sayfalarından geliyor |
| Konum sayfasında panel | `/harita` tek sayfa, konum başına sayfa yok |

## Tefsir arayüzü (2026-09-06) — YAYINDA

`tafsir` + `tafsir_block` içindeki **13 208 blok** artık siteye çıkıyor. Her ayet
sayfasında "Tefsir" bölümü var; **6236/6236 sayfada** iki eser birden görünüyor
(Sa'dî 6986 blok, el-Muhtasar 6222 blok — ikisi de Kur'an'ın tamamını kapsıyor).

| Katman | Dosya |
|---|---|
| Şema | `packages/schema/src/static_data.ts` → `staticTafsirIndex`, `staticTafsirSurah` |
| Çıktı | `tafsir_index.json` + `tafsir/<eser>/surah_<id>.json` (228 dosya) |
| Üretim | `scripts/build/lib/content.ts` |
| Okuma | `apps/web/src/lib/tafsir.ts` |
| Arayüz | `apps/web/src/pages/[surah]/[verse].astro` → `<section id="tefsir">` |
| Stil | `global.css` "Tefsir (ayet sayfası)" |
| Kural | `scripts/build/linter.ts` — sürümsüz QuranEnc tefsiri build'i DURDURUR |

**Yayın kapısı build tarafındadır.** `tafsir.publishable = false` olan eser çıktı
dosyalarına hiç girmez (kütüphane ≠ yayın, `KAYNAK_ENVANTERI.md` §0) — kütüphanede
duran bir eserin metni `dist/` içine de düşmez, arayüzde süzülmez.

**Sürüm numarası görünür.** QuranEnc'in yeniden yayın koşullarından 3'ü sürümün
belirtilmesini istiyor; numara `tafsir.license_note` içinde duruyor ("QuranEnc.com ·
sürüm 1.0.0 · …") ve bölümün altında olduğu gibi basılıyor. Linter bunu **hata**
seviyesinde denetliyor: kaynağı `quranenc` olan bir tefsirin notunda sürüm numarası
yoksa build durur. Uyarı değil, çünkü sürüm kaybolursa yayın izni koşulu düşer.

Sayfa ağırlığı: ayet başına ortalama +1,5 KB metin. Sayfa ortalaması 64,3 → 67,9 KB,
en ağır ayet sayfası 215 KB ham / **44 KB gzip**.

### Ayet sayfasında `pasaj` blokları GÖSTERİLMEZ

Ayete bağlı iki blok türü var: `ayet_tefsiri` (11 956 blok) ve `pasaj` (1742 blok).
`pasaj` — kaynakta "المقطع" — tefsir değil, **ayet grubunun meal metnidir**; Sa'dî
yayınında her tefsir bloğunun önüne konmuş. Ayet sayfası zaten aynı çevirinin
(Rowwad, QuranEnc) kendisini gösteriyor; pasajı ikinci kez basmak aynı meali "tefsir"
başlığı altında tekrarlamak olurdu. Blok veri dosyasında duruyor.

### Bir kez yaşanmış tuzak — `import.meta.url` ile veri dizini bulmak

Bölüm ilk build'de **sessizce hiç basılmadı**: hata yok, uyarı yok, dev sunucusunda
sorunsuz görünüyor, üretim çıktısında bölüm yok.

Sebep: okuma kütüphanelerindeki şu satır.

```ts
const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/data");
```

Astro üretim build'inde modüller Vite tarafından paketleniyor ve `import.meta.url`
kaynak dosyanın değil **paketin** yolunu veriyor. Paketin yeri modülün kaç yerden
import edildiğine göre değişiyor:

| Modül | Paket yeri | `../../public/data` |
|---|---|---|
| `manuscripts.ts` (iki+ sayfadan) | `dist/chunks/manuscripts_*.mjs` | `apps/web/public/data` ✓ |
| `tafsir.ts` (tek sayfadan) | `dist/pages/_surah_/_verse_.astro.mjs` | `dist/public/data` ✗ |

`existsSync` false döndü, `getTafsirs()` boş dizi verdi, `tafsirs.length > 0` false
oldu, bölüm hiç render edilmedi. **`data.ts`, `manuscripts.ts` ve `media.ts` de aynı
tuzağın üzerindeydi**; bugün çalışmalarının tek sebebi birden fazla sayfadan import
edilmeleriydi. Bir sayfa silinse aynı sessiz kayıp orada da olurdu.

Çözüm: `apps/web/src/lib/data-dir.ts`. Yukarı doğru yürüyüp
`public/data/surahs_index.json` işaretini taşıyan ilk dizini bulur; bulamazsa **hata
verir**. Dört kütüphane de artık oradan okuyor. Ölçüm yordamı: modül başına
`console.error(DATA_DIR, import.meta.url)` koyup build çıktısında karşılaştırmak —
tek build'de kesin sonuç verdi.

**Ders:** bir bölüm "boş veri" ile "veriyi bulamama" arasında ayrım yapmıyorsa,
ikincisi birincisi gibi görünür. Dev sunucusunda doğrulamak yetmez; bölümün üretim
çıktısında sayılması gerekir (`grep -rl "tafsir-work" dist/*-suresi/*.html | wc -l`).

## Okuma günlüğü — YAYINDA (2026-09-07)

Ana sayfadaki "yakında" kartlarından biriydi; artık `/gunluk` adresinde çalışıyor.
Plan §4.6'nın tamamı: **not, yer imi, okuma ilerlemesi, FSRS ezber tekrarı, ayarlar,
JSON dışa/içe aktarma.**

| Katman | Dosya |
|---|---|
| Depo (IndexedDB) | `apps/web/src/lib/gunluk/store.ts` |
| Zamanlayıcı | `apps/web/src/lib/gunluk/fsrs.ts` |
| Arayüz mantığı | `apps/web/src/lib/gunluk/app.ts` |
| Sayfa | `apps/web/src/pages/gunluk.astro` |
| Stil | `global.css` "Okuma günlüğü (/gunluk)" |
| Test | `apps/web/src/lib/gunluk/__tests__/fsrs.smoke.ts` (20 test) · `pnpm test` |
| CSP | `infra/nginx/kurankesfi.tr.conf` — `~^/gunluk(\.html)?$` |

### JavaScript yalnızca bu sayfada

Karar kullanıcıyla alındı (2026-09-07): **6236 ayet sayfası JS'siz kalır.** Ayet
sayfası yalnızca düz bir bağlantı taşır — `/gunluk?ekle=2:255` — ve orada
`default-src 'none'` CSP'si değişmedi. Açılan tek yer `/gunluk`:

- `script-src 'self'` — günlük uygulaması (kendi sunucumuzdan, CDN yok)
- `connect-src 'self'` — not satırının yanında ayet metnini göstermek için
  `/data/verse/verse_<s>_<v>.json` okunur

`unsafe-inline` ve `unsafe-eval` açılmadı. Paket **14 KB ham / 5 KB gzip**
(plan §20.4 bütçesi 100 KB).

### Dexie kurulmadı

Plan §6 "Dexie.js (IndexedDB)" diyor; alınmadı. Altı basit depo ve anahtar bazlı
okuma için 25 KB'lık bir bağımlılık gerekmiyordu — `store.ts` ~120 satırda aynı işi
yapıyor. Proje D3'ü ve Cytoscape'i de aynı gerekçeyle almamıştı. Sorgu ihtiyacı
büyürse (çok alanlı indeks, canlı sorgu) karar gözden geçirilir.

### Şema düzeltildi: `ease` → `stability` + `difficulty`

`packages/schema/src/user_data.ts` FSRS'i adıyla anıyor ama **SM-2 alanlarıyla**
yazılmıştı (tek bir `ease` çarpanı). FSRS'in bütün farkı kararlılık ile zorluğu
ayrı tutmasıdır: "zor ama hatırladım" SM-2'de yalnızca aralığı kısaltır, FSRS'te
o ayetin zorluğunu **kalıcı olarak** yükseltir. Kimsede veri yoktu, göç gerekmedi.
Duman testleri tam bu ayrımı koruyor — biri dosyayı "sadeleştirip" SM-2'ye
döndürürse testler düşer.

### Bilinçli olarak yapılmayanlar

- **Okuma ilerlemesi kendiliğinden işaretlenmiyor.** Ayet sayfalarında JS
  çalışmadığı için hangi ayetin okunduğu izlenemiyor; kaydı kullanıcı "Buraya
  kadar okudum" ile koyuyor. Sayfada bu açıkça yazıyor.
- **Ayarlar (`selectedAuthors`, `fontSize`, `theme`) arayüzde yok.** Depoda ve
  dışa aktarma dosyasında var, ama onları okuyacak sayfa yok (diğer sayfalarda JS
  yok). Etkisi olmayan denetim göstermek yerine boş bırakıldı.
- **Keşif yolu ve karşılaştırma sepeti** (plan §12.8) günlüğün işi değil. İçe
  aktarılan dosyada gelirlerse `passthrough` deposunda **olduğu gibi saklanır** —
  bir sürüm atlaması kullanıcının verisini silmemeli.

## Arapça kıraat — YAYINDA (2026-09-07)

Ana sayfadaki ikinci "yakında" kartı. **Mishary Alafasy** kaydı (kullanıcı seçimi),
6236/6236 ayet, 1,59 GB, eksik yok.

| Katman | Dosya |
|---|---|
| İndirme | `scripts/media/fetch_recitation.ts` · `pnpm media:recitation` |
| Künye | `data/recitation/reciter_alafasy.json` (script ÜRETİR, elle yazılmaz) |
| Şema | `packages/schema/src/recitation.ts` |
| Çıktı | `recitation.json` (`scripts/build/build.ts` → `emitRecitation`) |
| Okuma | `apps/web/src/lib/recitation.ts` |
| Arayüz | ayet sayfasında `<audio controls preload="none">` |
| Barındırma | R2 → `medya.kurankesfi.tr/ses/alafasy/<sss><vvv>.mp3` |

### Zaman damgası sorunu ortadan kalktı

QUL'un kıraat paketi **atlanmıştı**: yalnızca sure düzeyinde MP3 adresi veriyor ve
`segments.json` boş geliyordu — ayet zaman damgası olmadan "bu ayeti dinle"
yapılamaz. everyayah.com ayet başına **ayrı dosya** veriyor; dosya adı ayetin
kendisi (`002255.mp3`). Damgaya gerek kalmadı.

İkinci sonucu daha önemli: **oynatma JavaScript istemiyor.** `<audio controls>`
yetiyor. Ayet sayfalarının `default-src 'none'` CSP'si değişmedi; `media-src`
zaten medya.kurankesfi.tr'ye açıktı (medya katmanı, 2026-09-06).

### Veritabanı tablosu açılmadı

Bir kârî = **tek satır künye**; ayet başına satır yok, çünkü dosya adı ayetten
hesaplanıyor. İlişki, birleştirme ve tekillik sorusu olmayan tek satır için tablo
açmak, migration yazmak ve import adımı eklemek hiçbir şey kazandırmazdı.
`data/scripture` ile aynı gerekçe: build dosyayı doğrudan okur ve şemayla doğrular.

### `missingVerses` bir tahmin değil, ölçüm

İndirme bittikten sonra **elde gerçekten duran** dosyalar sayılır. O listedeki
ayetlerde oynatıcı hiç basılmaz — çalmayan bir oynatıcı göstermek sessiz kırılmadır.
Linter kapsamı denetliyor: `verseCount + missingVerses.length = 6236` tutmuyorsa
build durur (manifest indirmeden sonra yeniden yazılmamış demektir).

## İletişim / öneri / düzeltme formu (2026-09-07)

`/iletisim` yayında. Plan Faz 5'in "geri bildirim kanalı" maddesi ve §23.4 / K2'nin
"iletişim yolu sayfada yazılıdır" koşulu karşılandı — künye **her sayfanın altında**
duruyor (`Attribution.astro`), tek bir sayfaya gömülü değil.

| Katman | Dosya |
|---|---|
| Arka uç | `apps/iletisim/` (pm2: `kuran-iletisim`, 127.0.0.1:4380) |
| Sayfalar | `iletisim.astro` · `iletisim-tesekkur.astro` · `iletisim-hata.astro` |
| Künye | `apps/web/src/lib/site.ts` → `CONTACT` |
| Stil | `global.css` "İletişim formu (/iletisim)" |
| Nginx | `location = /api/iletisim` + CSP `~^/iletisim(\.html)?$` |
| Ayar | `.env` → `FORM_PORT`, `FORM_DB_PATH`, `SMTP_*`, `CONTACT_*` |

**Sitenin ilk ve tek sunucu taraflı parçası.** Bugüne kadar her şey statik dosyaydı.
Form düz `<form method="post">`; JavaScript yok, CSP'de açılan tek şey
`form-action 'self'`. Servis HTML üretmez, 303 ile statik sonuç sayfasına yollar
(POST-Redirect-GET) — geri tuşu formu yeniden göndermez.

### Önce veritabanı, sonra mail

Mesaj **önce** SQLite'a yazılır, **sonra** mail gönderilir ve gönderim sonucu aynı
satıra düşer. Gerekçe: posta bir gün sessizce bozulur (şifre değişir, kota dolar,
alıcı reddeder) ve o gün form "gönderildi" deyip mesajı hiçbir yere yazmamış olurdu.
Gönderilemeyen satır sayısı `/api/iletisim/durum` ucunda görünür; deploy duman testi
arka ucun ayakta olduğunu da denetliyor.

### Mail neden Brevo üzerinden

`kurankesfi.tr`'nin **SPF kaydı ve MX'i yok** (ölçüldü 2026-09-07). Sunucudaki
sendmail ile o alan adından gönderilen mail alıcı tarafında büyük olasılıkla spam'e
düşerdi. Gönderim **Brevo**'ya (`smtp-relay.brevo.com`) alındı — proje sahibinin
zaten kullandığı sağlayıcı; teslimat onun altyapısıyla imzalanıyor ve takip
edilebiliyor.

Sunucudan çıkış ölçüldü: **25 kapalı** (barındırıcı engelliyor, olağan), **465, 587
ve 2525 açık**. 587 + STARTTLS seçildi (Brevo'nun önerdiği).

**Brevo'nun şart koştuğu şey:** `CONTACT_FROM` adresi Brevo panelinde *doğrulanmış
gönderen* olmalı (Senders & IP → Senders). `SMTP_USER` (`9xxxxx@smtp-brevo.com`)
gönderen olarak çalışmaz. Doğrulanmamış adresle gönderim reddedilir ve hata
`mail_error` sütununa düşer — mesaj yine veritabanında durur, kaybolmaz.

Ziyaretçinin yazdığı adres **gönderen yapılmaz** — doğrulanmamıştır ve başkası adına
mail göndermek olurdu. Yalnızca `Reply-To` olur.

### Ne saklanmıyor

IP adresi, tarayıcı bilgisi, referans adresi saklanmaz (plan §1.2, §1.3). Hız sınırı
için IP yalnızca **bellekte, karması alınarak** tutulur; diske yazılmaz, süreç
yeniden başlayınca sıfırlanır. Captcha yok: üçüncü taraf bağımlılığı olurdu
(CLAUDE.md kural 5). Yerine bal küpü alanı + hız sınırı + uzunluk sınırları.

Bal küpü dolu gelen isteğe **başarı gösterilir**, hata değil: bota hangi alanda
yakalandığını öğretmenin anlamı yok. Mesaj hiçbir yere yazılmaz.

### Ölçülen davranış (2026-09-07)

| Durum | Sonuç |
|---|---|
| Geçerli mesaj | 303 → `/iletisim-tesekkur`, satır yazıldı |
| Bal küpü dolu | 303 → `/iletisim-tesekkur`, satır **yazılmadı** |
| Mesaj < 10 karakter | 303 → `/iletisim-hata` |
| Ayet biçimi bozuk (`abc`) | 303 → `/iletisim-hata` |
| E-posta biçimi bozuk | 303 → `/iletisim-hata` |
| Aynı IP, 20 sn içinde ikinci gönderim | 303 → `/iletisim-hata` |
| `GET /api/iletisim` | 404 (nginx'te de `limit_except POST`) |

### Açık kalan

**Brevo SMTP kullanıcı adı ve anahtarı `.env` içinde boş.** Servis çalışıyor ve
mesajları kaydediyor, ama mail gönderemiyor; satırlara "SMTP yapılandırılmamış"
düşüyor. Brevo → SMTP & API → SMTP ekranındaki **Login** değeri `SMTP_USER`,
**SMTP key** değeri `SMTP_PASS` olur (hesabın giriş e-postası ve API anahtarı
değil). Doldurunca `pm2 restart kuran-iletisim` yeter — kod değişmez. `pnpm approve-builds` gereği `better-sqlite3` `pnpm-workspace.yaml`
içindeki `onlyBuiltDependencies` listesine alındı (pnpm 10 kurulum betiklerini
varsayılan olarak çalıştırmıyor; izin verilmezse modül "better_sqlite3.node
bulunamadı" ile düşüyor).

## Yayın — 2026-09-07 (`20260907T063508Z`)

Tefsir, okuma günlüğü, kıraat, iletişim formu ve diğer oturumun harita/AI medya
işi birlikte canlıya çıktı. Nginx yapılandırması da kopyalandı ve yeniden yüklendi
(`/gunluk` ve `/iletisim` CSP kayıtları olmadan ikisi de sessizce ölü kalırdı).

Canlıda doğrulandı: ayet sayfasında 2 tefsir + sürüm numarası + kıraat oynatıcısı +
günlük bağlantısı, `/gunluk` betiği iniyor, `/iletisim` formu POST ediyor,
`medya.kurankesfi.tr/ses/alafasy/002255.mp3` 200 dönüyor. Form uçtan uca denendi:
nginx → servis → SQLite → Brevo → mail geldi; `GET /api/iletisim` 403.

### Duman testi yanlış alarm verdi — düzeltildi

Yayın sonrası duman testi `og:image mutlak BULUNAMADI` diyerek düştü, ama sayfa
doğruydu. Tekrar çalıştırınca bu kez **kanonik adres** düştü; sonraki çalıştırmada
ikisi de geçti. Sayfa elle 100 kez çekildiğinde **hiç** düşmedi (100/100 tam boyut,
200) — yani içerik değil, testin kendi ağ çağrısı kararsızdı.

Asıl kusur teşhis edilemez olmasıydı: `contains()` içindeki `2>/dev/null` curl'ün
hatasını yutuyor, `|| body=""` de boş gövdeyi "dizge bulunamadı" diye raporluyordu.
**Ağ hatası ile içerik hatası aynı çıktıyı veriyordu.** Bir yayın bu yüzden
başarısız işaretlendi, oysa site sağlamdı.

Şimdi gövde en fazla üç kez denenir; düşen denetim curl'ün çıkış kodunu, gelen bayt
sayısını ve hata metnini yazar. Dört ardışık çalıştırma temiz geçti, biri
"(3. denemede)" notuyla — yani kırılganlık gerçek ve retry onu yakalıyor.

**Açık kalan:** kırılganlığın kök sebebi bulunamadı. İzole ölçümde hiç tekrarlanmıyor
(100/100, 60/60, 50/50 temiz), yalnızca duman testinin ~50 isteklik yığını içinde
çıkıyor. Ziyaretçiye yansıdığına dair bir belirti yok; yansırsa artık çıkış kodu
kayda geçecek.

## Telegram botu (2026-09-07) — KOD HAZIR, TOKEN BEKLİYOR

Plan §19'un tamamı yazıldı; `pm2: kuran-bot` ayakta ve `BOT_TOKEN` bekliyor.
İlkeler modülü ön koşuldu, o zaten bitmişti.

| Katman | Dosya |
|---|---|
| Takvim üretimi | `scripts/build/lib/content.ts` → `schedule.json` (366 gün) |
| Şema | `packages/schema/src/subscription.ts` |
| Servis | `apps/bot/` (pm2 `kuran-bot`, 127.0.0.1:4330) |
| Abonelik deposu | SQLite — `/opt/kuran/var/bot.sqlite` |
| Test | `apps/bot/src/__tests__/bot.smoke.ts` (29 test) · `pnpm test` |
| Ayar | `.env` → `BOT_TOKEN`, `BOT_USERNAME`, `BOT_*` |

### Gönderim takvimi

**366 gün, 60 ilke dönüşümlü, 239 farklı ayet.** Rotasyon: gün *i* → ilke
`i % 60`, o ilkenin ayetlerinden `floor(i / 60)` sırasındaki. Bir ilke yılda ~6
kez geliyor ve **her seferinde başka ayetiyle**; 60 gün içinde hiçbir ilke
tekrar etmiyor. Birincil dayanaklar önce, ikinciller sonra.

Takvim **deterministik** — `generatedAt` bilerek sabit (`1970-01-01`), yoksa her
build parmak izini değiştirirdi (plan §20.1). Determinizmin asıl karşılığı veri
minimizasyonu: kullanıcıya hangi ayetin gönderildiği **kaydedilmiyor**, yalnızca
imleç ilerliyor (plan §19.2). Rastgele seçim yapsaydık gönderim geçmişi tutmak
zorunda kalırdık.

`occasion` (Ramazan, kandil, kurban) hep `null`: bu günler hicrî takvime bağlı ve
her yıl kayıyor, takvimin üretildiği yıl bilinmeden hesaplanamaz. Uydurulmadı.

### Şema düzeltmesi: `principleId` → `principleSlug`

`scheduleEntry` ilkeyi sayısal id ile tutuyordu. `principle.id` bir **seri** ve
`pnpm content:import` her çalıştığında tablo boşaltılıp yeniden dolduruluyor —
id kaysaydı abonelere sessizce **başka ilke** gitmeye başlardı. `verseId` kaldı
çünkü o seri değil, `sure * 1000 + ayet` olarak hesaplanıyor.

### Kararlar

- **grammY alınmadı.** Kullanılan yüzey üç uç: `getMe`, `getUpdates`,
  `sendMessage`. Dexie ve D3 ile aynı gerekçe.
- **Webhook değil uzun yoklama.** Webhook nginx'te yeni bir genel uç ve gizli
  yol yönetimi isterdi; yoklama dışarıya hiçbir şey açmıyor.
- **İçerik yayındaki sürümden okunuyor** (`current/data`), repodan değil. Bota
  giden ayet ve ilke sitede duranın aynısı (plan §19.6). Takvim önbelleğe
  alınmıyor — alınsaydı yeni yayından sonra bot yeniden başlatılana kadar eski
  takvimi gönderirdi ve kimse fark etmezdi.
- **Cron yok**, süreç içi saatlik zamanlayıcı var; servis zaten sürekli açık.
- **İmleç yalnızca gönderim başarılı olunca ilerler** — hata durumunda aynı gün
  yeniden denenir (plan §19.6), abone bir günü kaçırmaz.
- Bot **yalnızca birebir sohbette** çalışır; gruplarda yok sayar.

### Bir kez yaşanmış tuzak — sessizce yanlış görünen mesaj

`BOT_DEFAULT_AUTHOR` yanlış yazılmıştı (`diyanet-isleri-baskanligi`, doğrusu
`diyanet-isleri`). Sonuç: mesaj **gidiyor**, doğru meal gösteriliyor, ama altına
her seferinde "*Seçtiğiniz meal bu ayette yok; Diyanet İşleri meali gösterildi*"
notu düşüyordu. Gönderim çalıştığı için hata sayılmazdı.

Servis artık açılışta slug'ı `authors_index.json` ile doğruluyor ve uyarıyor;
duman testi de hem doğru mealde notun **çıkmadığını** hem yanlış mealde
**çıktığını** ayrı ayrı denetliyor.

### Açık kalan

- **`BOT_TOKEN` ve `BOT_USERNAME` boş.** BotFather'dan alınacak. Token gelince
  `pm2 restart kuran-bot` yeter, kod değişmez.
- **Sitedeki "Günlük ayet al" sayfası yapılmadı** — bot kullanıcı adı olmadan
  `t.me/<ad>` bağlantısı kurulamıyor ve olmayan bir adrese bağlantı vermek
  menüdeki "dürüstlük kuralı"na aykırı olurdu.
- **WhatsApp** plan §19.3'e göre Faz 5; Meta doğrulaması, şablon onayı ve
  telefon numarası saklama yükü ayrıca değerlendirilecek.

### Ana sayfada eskimiş bir yalan — düzeltildi (2026-09-07)

Tanıtım sayfasının "Bülten" bölümü şunu diyordu:

> Henüz açılmadı. Kayıt formu koymuyoruz çünkü **arkasında çalışan bir sunucu yok**;
> çalışmayan bir kutu göstermek sizi yanıltmak olurdu. Bülten Faz 3'te…

Telegram botu aynı gün yayına girmişti. Metin, sitenin **kendi dürüstlük kuralını**
çiğneyen bir yalana dönüşmüştü. **Kullanıcı fark etti, ben değil.**

Kuralın iki yönü var ve ikincisi kaçırıldı: hazır olmayanı hazır göstermek kadar
**hazır olanı yok göstermek de yalandır**. `index.astro` başındaki not bu yüzden
güncellendi — bir modül yayına girdiğinde tanıtım sayfası da güncellenir.

Bölüm artık Telegram'a bağlanıyor, "hazır" etiketi taşıyor ve kayıt formu yine
konulmadı — ama artık sebebi "sunucu yok" değil: kayıt botun içinde yapılıyor,
sitenin e-posta toplamasına gerek yok. E-posta bülteni hâlâ yok ve söz de
verilmiyor.

Aynı türden başka iddia var mı diye tanıtım sayfası tarandı: "0 bayt JS" ifadeleri
tanıtım sayfası ve 6236 ayet sayfası için hâlâ doğru (JS yalnızca `/harita`,
`/kissa/*` ve `/gunluk`'te), "yakında" kalan iki kart (hoca notları, çevrimdışı
okuma) gerçekten hazır değil.

Yayın: `20260907T090647Z`.

## Sayfa metni denetimi — eskimiş "hazır değil" cümleleri (2026-09-07)

`pnpm lint:refs` artık tanıtım metinlerini de denetliyor: **yayında olan bir şey
hakkında "hazır değil" diyen cümle build'i DURDURUR.**

Gerekçe aynı gün iki kez yaşandı ve **ikisini de kullanıcı fark etti**:

1. Bülten bölümü *"Henüz açılmadı… arkasında çalışan bir sunucu yok"* diyordu —
   Telegram botu o gün yayına girmişti.
2. Kapılar bölümü *"Şu an Kelime kapısı açık; diğer dördünün altyapısı
   hazırlanıyor"* diyordu — beş kapının beşi de açıktı.

Dürüstlük kuralının **birinci** yönünü kod zaten koruyordu: "hazır/yakında"
rozetleri `href` dolu mu diye **hesaplanıyor**. **İkinci** yönünü hiçbir şey
korumuyordu: rozetin yanındaki düzyazı elle yazılmış ve modül yayına girdiğinde
kimse o cümleyi güncellemiyor, kimse de hata almıyor.

### Nasıl çalışıyor

`scripts/build/linter.ts` → `checkPageClaims()`. İki kademe:

| Durum | Sonuç |
|---|---|
| Cümle "hazır değil" diyor **ve** yayındaki bir şeyi anıyor | **HATA** — build durur |
| Cümle "hazır değil" diyor, yayındaki bir şeyi anmıyor | uyarı — insan gözden geçirir |

`LIVE_FEATURES` listesi **elle** güncellenir ve bu kasıtlı: bir modül yayına
girdiğinde oraya bir satır eklenir, linter o andan itibaren o modül hakkında
"hazır değil" diyen her cümlede build'i durdurur. Yani **listeyi güncellemek,
metni güncellemeyi zorunlu kılar**.

### İki tuzak, ikisi de çözüldü

- **Yorumlar taranmaz.** Bu dosyalardaki açıklama notları eski *yanlış* metni
  bilerek alıntılıyor; yorumu taramak hatanın kaydını tutmayı imkânsız kılardı.
- **Makine üreten satırlar elenir.** "yakında" kelimesi sayfada iki yerde geçiyor:
  insanın yazdığı cümlelerde ve rozeti **üreten** kodda
  (`gate.href === undefined ? "yakında" : "hazır"`). İkincisi veriden
  hesaplandığı için zaten doğru. Ayrım: etiketler ve `{...}` ifadeleri
  silindikten sonra geriye 4 kelimeden uzun gerçek bir cümle kalıyor mu?
  Bu filtre olmadan denetim 5 uyarı veriyordu, 4'ü gürültüydü — **gürültülü bir
  denetim görmezden gelinir**, o yüzden filtre denetimin kendisi kadar önemli.

### Doğrulandı

İki eski cümle geçici olarak geri konup linter çalıştırıldı: ikisini de yakaladı
ve build'i durdurdu. Dosya geri alındı, denetim temiz — geriye yalnızca gerçek ve
hâlâ doğru olan bir uyarı kalıyor (`/kaynaklar`: "İngilizce dil seçeneği henüz
açılmadı").

## Ana menü — 11 düz linkten dört başlığa (2026-09-07)

Şerit artık `/sureler`, `/kissalar`, `/zaman`, `/kavramlar`, `/kok`, `/ilkeler`,
`/yazmalar`, `/harita`, `/gunluk`, `/kaynaklar`, `/iletişim` gibi 11 düz linki tek
sırada basmıyor. Bunun yerine dört üst başlık var — **Oku · Anla · Keşfet ·
Kaynaklar** — her biri altında 2-4 çocuk linkle. Karar kullanıcıya ait
(2026-09-07): 11 link genişledikçe (kıssalar, harita, zaman eklendiğinde) şerit
tek satırda taşacaktı; dört başlık büyümeye dayanıklı bir çatı.

Ayrım eksene göre: **Oku** (metnin kendisi — sureler, günlük, günlük ayet
botu), **Anla** (metni açan katmanlar — kavramlar, kökler, ilkeler),
**Keşfet** (bağlam eksenleri — kıssalar, harita, zaman, yazmalar),
**Kaynaklar** (nereden geldiği — kaynak şeffaflığı, iletişim). Tek kaynak
`apps/web/src/lib/nav.ts` → `NAV`; şerit (`SiteNav.astro`), hub sayfaları
(`HubKartlari.astro`), breadcrumb'lar ve sitemap hepsi bu diziden okuyor.

### Betiksiz açılır menü

Alt liste `:hover` ve `:focus-within` ile açılıyor — ikisi de tarayıcının
kendi işi, hiç JS yok (`global.css` "Ana gezinme" bloğu, `.nav-item:hover >
.nav-sub` / `.nav-item:focus-within > .nav-sub`). Fare üst başlığın üzerine
gelince açılıyor, klavyeyle Tab'lanınca da (`:focus-within` sekmeyle içindeki
bir linke odaklanmayı da açık tutuyor) — CSP'de `script-src` hâlâ yalnızca
`/harita` ve `/kissa/*`'e özel, şerit hiçbir sayfada bunu bozmuyor.

### 48rem altında alt liste hiç basılmıyor

`@media (max-width: 48rem) { .site-header .nav-sub { display: none !important; } }`.
Nedeni CSS özelliği değil, dokunmatik gerçeği: `:hover` dokunmatik ekranda
"kilitlenir" — bir kez dokunduğunda menü açılır ama kapanmaz, çünkü hover
durumundan çıkacak bir fare imleci yok. Alt liste responsive biçimde küçülüp
dokunmatikte de görünür kalsaydı, üst başlığa ilk dokunuş açılır menüyü açar,
arkasındaki gerçek bağlantıya (ör. hub sayfasının kendisi) ulaşmak için ikinci
bir dokunuş gerekirdi ve bazı tarayıcılarda o ikinci dokunuş hiç gelmezdi. Bu
yüzden dar ekranda alt liste derleme zamanında hiç basılmıyor; dokunma üst
başlığa gider, o da zaten hub sayfası — çocuklarına oradan devam edilir.
Gezinme kopmuyor, sadece bir basamak ekleniyor.

### `nav.ts` neden hiçbir şey import etmiyor

`Base.astro` bu dosyayı **her sayfada** çekiyor — 13516 sayfanın hepsinde.
`~/lib/data`'yı (veya `~/lib/manuscripts`'i) içeri alsaydı, yalnızca menü
metnini basmak için her sayfa `surahs_index.json`, `concepts_index.json` ve
benzerlerini okurdu; bu sayılar zaten ilgili hub sayfasında ayrıca çözülüyor,
tekrar okumanın anlamı yok. `nav.ts` bu yüzden sabit, elle yazılmış bir
diziden ibaret — sıfır bağımlılık, sıfır dosya okuma.

### Task 3'ten kalan iz: `--space-5` yok

Boşluk ölçeği (`global.css:257-265`) `1, 2, 3, 4, 6, 8, 12, 16, 24` basamaklarını
içeriyor — `5` tanımlı değil. `HubKartlari.astro`'daki `.hub-grid a` başta
`padding: var(--space-5)` (1,25rem) hedefliyordu; token yokluğu fark edilince
en yakın emsale (`.principle-grid a`, `--space-4`) uyuldu, `--space-6`'ya
çıkılmadı. Görsel etki küçük (1,25rem yerine 1rem dolgu) ama ölçek yeni bir ara
basamak (`--space-5: 1.25rem`) isteyen bir sonraki bileşende tekrar çıkacaktır.

### Sitemap ve tagline hizalandı

`sitemap.xml.ts` artık hub adreslerini elle değil `NAV`'dan okuyor — menü
değişince sitemap kendiliğinden değişir. `/kaynaklar` hem hub hem çocuk
olduğundan `Set` ile tekilleştirildi; aşağıdaki elle yazılmış ikinci
`{ loc: "/kaynaklar" }` satırı silindi, yoksa yinelenen `<loc>` sitemap hatası
doğardı (`grep ... | sort | uniq -d` boş döndü, doğrulandı).

Tagline `Keşfet • Oku • Anla` iken menü sırası `Oku · Anla · Keşfet`'e
döndüğünde ikisi ayrışmıştı. Canlı/güncel metin geçen dört yer hizalandı:
`CLAUDE.md` ("Tagline:" satırı), `apps/web/src/pages/index.astro` (`<title>`
ve `og:title`), `scripts/fonts/verify_shaping.ts` (arayüzde geçen sabit
başlıklar listesi — arayüz metniyle aynı kalmalı ki font şekillendirme
denetimi gerçek metni test etsin) ve `README.md` (üstteki marka satırı).

Bilerek **dokunulmayan** yerler: `docs/PROJE_PLANI.md` §11 ve `docs/BACKLOG.md`
"Alan adı ve proje adı" maddeleri 2026-09-04 tarihli kapanmış birer "KARAR"
kaydı — o günkü kararı geriye dönük değiştirmek tarihi yanlış yazardı.
`docs/superpowers/specs/…` ve `docs/superpowers/plans/…` de aynı sebeple
dokunulmadı: ikisi de "tagline X idi, Y'ye çekildi" geçişinin kendisini
anlatıyor, X'i Y yaparsan cümle kendi kendini çürütür. `docs/DESIGN.md` §9
Marka'daki `"KEŞFET • OKU • ANLA"` de dokunulmadı — bu, `docs/DESIGN.md`'nin
düzyazısı değil, **gerçek bir görselin** (logo, `og-image.png`,
`scripts/brand/logo-source.png`'den üretilen tüm favicon/logo dosyaları)
içine gömülü metnin açıklaması; metni değiştirmek görseli değiştirmez, sadece
belgeyi görselle uyuşmaz hâle getirirdi. **Açık kalan:** marka görselleri hâlâ
eski sırayı taşıyor; yeniden üretim (`pnpm brand`, yeni kaynak sanat) ayrı bir
görev.

### Ölçülen boyut artışı

Eşik (Spec §A.7): `/bakara-suresi/255`'in gzip'li boyutu **%2'den fazla**
artmamalı. Karşılaştırma tabanı için eski dalı ayrıca derlemeye gerek
duyulmadı (brief bunu istemiyordu); onun yerine eski 11-linkli şerit
`fa55ab4` (menü değişiminden hemen önceki commit) `Base.astro`'sundan aynen
alınıp, gerçek `bakara-suresi/255.html` çıktısındaki yeni şerit bloğunun
yerine — Astro'nun kendi minify kuralıyla (etiketler arası tek boşluk) —
yeniden kuruldu ve iki sürüm de `gzip -9` ile karşılaştırıldı:

| | Şerit (ham) | Sayfa (gzip) |
|---|---|---|
| Eski (11 link, yeniden kurulan) | 425 bayt | 26 919 bayt |
| Yeni (4 başlık + alt liste) | 976 bayt | 27 016 bayt |
| **Fark** | **+551 bayt** | **+97 bayt / %0,36** |

`%0,36`, eşiğin (`%2`) çok altında. Aynı yöntem en küçük sayfalarda da
denendi — nav'ın toplam sayfa içindeki payı en yüksek olduğu, dolayısıyla en
kötü durumu temsil eden yerler:

| Sayfa | Eski (gzip) | Yeni (gzip) | Fark |
|---|---|---|---|
| `/kavramlar` | 9 311 bayt | 9 413 bayt | +102 bayt / %1,10 |
| `/kissalar` | 8 926 bayt | 9 020 bayt | +94 bayt / %1,05 |

En kötü durumda bile (`%1,10`) eşiğin yarısı kadar. Alt liste her sayfada
basılıyor olsa da (`nav-sub` yalnızca hub sayfalarına özel değil, 4 başlığın
hepsinde her yerde basılıyor — CSS `:hover` seçicisi çalışabilsin diye DOM'da
bulunması gerekiyor) gzip tekrar eden `<a href=…>` kalıplarını iyi sıkıştırdığı
için ham fark (+551 bayt) gzip'li farka (+97..102 bayt) küçülüyor. `nav-sub`'ı
yalnızca hub sayfalarında basma fikri (brief'in bahsettiği tedbir) gerekmedi.
