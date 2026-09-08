# Arama (plan §12.2) — tasarım

> Tarih: 2026-09-08 · Durum: kullanıcı onayı bekliyor
> İlgili: `docs/PROJE_PLANI.md` §12.2, §5 (frontend arama satırı), §12.11 (indeks)
> Bu belge onaylanınca `docs/superpowers/plans/2026-09-08-06-arama.md` uygulama planı yazılır.

## 1. Sorun

Sitede arama **yok**. 11 061 sayfa, 6 236 ayet, 1 641 kök, 742 konu başlığı var; kullanıcı
aradığı kelimeye ancak dizin sayfalarından tıklaya tıklaya ulaşabiliyor. `docs/DURUM.md`
"Yapılmayanlar" tablosunda gerekçe şuydu: *"İstemci tarafı arama (§12.2) — JS gerekir,
CSP'de script-src yok."*

O engel artık kısmen kalktı: `/harita`, `/kissa/*`, `/dinle/*` ve `/gunluk` için
`script-src 'self'` açıldı. Arama bu listeye eklenecek **beşinci** adres olur.
6 236 ayet sayfasında `default-src 'none'` değişmez.

## 2. Kapsam

**Girer:** `/ara` sayfası, build aşamasında üretilen parçalı ters indeks, referans
ayrıştırıcı (`5/58`, `cüz 2`), hızlı öneri katmanı, tür sekmeleri ve süzgeçler,
JS'siz gezinilebilir dizin.

**Girmez:**
- Sunucu tarafı arama. Plan §5: *"sunucuda arama yok"*. Site statik kalır.
- Yazma (manuscript) kayıtları — 2 322 satır indekslenmez (kullanıcı kararı 2026-09-08).
  Yazmalara ayet sayfasındaki "Bu ayeti taşıyan yazmalar" bölümünden erişiliyor;
  aramaya girseler sonuç listesini boğarlardı.
- Tefsir blokları — `tafsir.publishable` kapısı henüz sitede görünmüyor
  (`docs/KAYNAK_ENVANTERI.md` §0: kütüphane ≠ yayın). Tefsir yayına girdiğinde
  indekse tür olarak eklenir.
- Doğal dil sorgusu ("Kur'an'da sabır nerelerde anlatılıyor?"). Plan §12.2 bunu
  *ileride* diyor; veri modeli engel çıkarmayacak biçimde kurulur, ama bu işte yapılmaz.
- Yeni `/cuz/<n>` veya `/sayfa/<n>` sayfaları. Cüz/sayfa araması mevcut ayet
  sayfalarına bağlantı verir, yeni sayfa üretmez.

## 3. Kararlar ve gerekçeleri

| Karar | Seçilen | Gerekçe |
|---|---|---|
| Motor | Kendi ters indeksimiz, bağımlılıksız | ~6 KB JS. Pagefind WASM ister (`wasm-unsafe-eval` CSP'ye girerdi); FlexSearch indeksin tamamını belleğe yükler, parçalı indirme yapmaz. |
| Meal kapsamı | Yalnız Diyanet İşleri | 27 Türkçe mealin hepsi ~28 MB. Tek meal ~1 MB gzip'te kalıyor. 4 meale çıkmak sonradan tek build parametresi. |
| Ek metinler | Arapça (harekesiz) + transkripsiyon | Arapça arayan da, `bismillah` yazan da bulsun. |
| JS'siz hâl | Gezinilebilir dizin | Sayfa boş gelmez; kavram/kök/kıssa/ilke/sure/konum A-Z listeleri basılı gelir. |
| Parçalama | İlk harfe göre shard | Tek harfli sorgu tek dosya indirir. İki harf ~500 minik dosya yapardı. |
| Yazmalar | İndekslenmez | Kullanıcı kararı 2026-09-08. |
| Cüz/sayfa | Referans olarak aranır | Kullanıcı kararı 2026-09-08. |

## 4. Ne indeksleniyor

9 tür, **9 004 kayıt**:

| Kod | Tür | Kaynak | Adet | Aranan alanlar | URL |
|---|---|---|---|---|---|
| 0 | Ayet | `verse/verse_<s>_<v>.json` | 6 236 | Diyanet meali, `textUthmani`, `transcriptionTr` | `/<sure>/<ayet>` |
| 1 | Kök | `roots_index.json` | 1 641 | `arabic`, `latin`, `meaningSummary` | `/kok/<arapça>` |
| 2 | Konu başlığı | `sections.json` | 742 | başlık metni | `/<sure>/<verseStart>` |
| 3 | Sure | `surahs_index.json` + eş adlar | 114 | `nameTr`, `nameAr`, `nameEn`, eş adlar | `/<sure>` |
| 4 | Kavram | `concepts_index.json` | 109 | `nameTr`, `nameAr`, `definition` | `/kavram/<slug>` |
| 5 | İlke | `principles_index.json` | 64 | `nameTr`, `nameAr`, `definition` | `/ilke/<slug>` |
| 6 | Kıssa | `stories_index.json` | 50 | `title`, `summary` | `/kissa/<slug>` |
| 7 | Konum | `locations.json` | 26 | `name`, `modernName`, `country`, `alternatives` | `/harita#konum-<slug>` |
| 8 | Zaman/olay | `timeline.json` | 22 | `title`, `description`, `period` | `/zaman#olay-<order>` |

Sayılar 2026-09-08'de `apps/web/public/data/` içinden sayıldı.

**Konu başlığının kendi sayfası yok**; `verseStart` ayetinin sayfasına bağlanır — o sayfa
zaten başlığı gösteriyor (`getVerseSections`). **Zaman olaylarının çıpası yok**:
`zaman.astro` içindeki olay `<li>`'sine `id="olay-<order>"` eklenecek. Konum çıpası
(`konum-<slug>`) `harita.astro:132`'de zaten var.

Tür kodu doküman kaydında **sayı** olarak durur; sekme etiketleri istemcide çözülür.

## 5. Normalizasyon

Aynı mantık **hem build hem istemci** tarafında çalışmak zorunda; tek modülde durur
(`apps/web/src/lib/search/normalize.ts`) ve build script'i bunu içe aktarır. İki ayrı
kopya yazılmaz — sapmaları kimse fark etmez.

**Türkçe / latin:**
1. `toLocaleLowerCase("tr")` — `İ`→`i`, `I`→`ı`
2. ASCII katlama: `ş→s ğ→g ç→c ö→o ü→u ı→i â→a î→i û→u ê→e`
3. Kesme işareti, tire, nokta, virgül, iki nokta atılır: `En'âm` → `enam`, `yus.` → `yus`
4. Boşluk dizisi tek boşluğa iner

Sonuç: `salât` = `SALAT` = `Salat` = `salat`.

**Arapça:** hareke (U+064B–U+0652) atılır, tatvîl (U+0640) atılır, elif varyantları
(`أ إ آ ٱ` → `ا`), `ى`→`ي`, `ة`→`ه`. Mevcut `scripts/import/lib/arabic_normalize.ts`
mantığı web tarafına ortak modül olarak taşınır — orada kalıp kopyalanmaz.

**Tokenizasyon:** boşluk ve noktalamadan böl, 2 harften kısa token indekslenmez.
Durak kelimeler (`ve ile bir bu şu o da de ki mi mı ise için gibi`) indekslenmez ama
tırnaklı tam ifade aramasında kullanılır.

**Ek eşleşmesi:** Türkçe eklemeli dil; kök atma (stemming) yapılmaz, **ön ek eşleşmesi**
yapılır. `sabr` → `sabreden`, `sabırla`, `sabredenlerle`. Tam kelime eşleşmesi daha
yüksek skor alır.

**Ünsüz yumuşaması:** sorgu `p ç t k` ile bitiyorsa istemci **ikinci bir ön ek** daha
dener (`b c d ğ`): `kitap` → `kitab*` de aranır, `kitabı` bulunur. Bu istemci tarafında
yapılır; indekse ek kayıt yazılmaz.

## 6. İndeks biçimi

`apps/web/public/data/search/` altında:

```
meta.json              sürüm, blok haritası, shard listesi, durak kelimeler, tür sayıları
quick.json             hızlı katman (§8)
meal/<harf>.json       Diyanet meali + kavram/ilke/kıssa/konu/sure/konum metinleri
cev/<harf>.json        transkripsiyon (çeviriyazı) + kök latin
ar/<harf>.json         Arapça ayet metni + kök arapça + kavram/ilke Arapça adları
docs/<n>.json          doküman kayıtları, 500'erlik bloklar (19 blok)
```

**Üç ayrı ad alanı, tek gerekçe:** "eşleşme yeri" süzgeci (Meal / Arapça /
Transkripsiyon) böylece **indirilen dosya seviyesinde** çalışır. Süzgeç daraltılınca
gereksiz shard hiç inmez. Yan faydası: shard'lar küçülür.

Shard anahtarı = normalize edilmiş token'ın ilk karakteri.
`meal/` ve `cev/` → 26 harf + `0` (rakam/diğer) = 27 dosya. `ar/` → 28 harf + `0` = 29 dosya.

**Postings dosyası** — token → doküman id listesi, artan sırada:
```json
{ "sabir": [12, 340, 1877], "sabreden": [341, 1878] }
```

**Doküman kaydı** — dizi, alan adı yok (bayt tasarrufu):
```
[tür, başlık, url, kısa_parça, ek]
```
`ek` türe göre: ayet için `[surahId, verseNumber, juz, page, "mekki"|"medeni"]`,
diğer türlerde `null`. `kısa_parça` ≤ 160 karakter.

Doküman id'si **global** (0 … 9 003) ve tür sırasına göre bloklanır, böylece tek türe
süzülmüş bir sorgu az sayıda `docs/` bloğu indirir.

**Betik hangi dosyayı indirir:** sorgu Arapça harf içeriyorsa yalnız `ar/`, içermiyorsa
`meal/` + `cev/`. İnen her shard `sessionStorage`'da tutulur; aynı harf ikinci kez inmez.

**Boyut hedefi (kabul kriteri):** ilk arama < **60 KB** gzip transfer;
`public/data/search/` toplamı < **1 MB** gzip.

## 7. Referans ayrıştırıcı

`apps/web/src/lib/search/reference.ts`. Sorgu, metin aramasından **önce** buradan geçer.
Eşleşirse sonuçların en üstünde **"Doğrudan git"** kartı çıkar; altında normal metin
sonuçları devam eder (`5` yazan biri hem Mâide suresini hem "5" geçen ayetleri görür).
Sorgu **saf referanssa** Enter doğrudan ayete gider.

| Yazılan | Sonuç |
|---|---|
| `5/58` · `5:58` · `5.58` · `5-58` · `5 58` | Mâide 58 |
| `5. sure 58. ayet` · `5.sure 58.ayet` · `sure 5 ayet 58` | Mâide 58 |
| `bakara 153` · `bakara/153` · `bakara suresi 153` | Bakara 153 |
| `yusuf 4` · `yûsuf 4` · `yus 4` | Yûsuf 4 |
| `2/153-160` · `bakara 153-160` | 8 ayetlik liste |
| `5` (tek sayı ≤ 114) | Mâide suresi kartı |
| `cüz 2` · `cuz 2` · `2. cüz` | Cüz 2 kartı → Bakara 142 |
| `sayfa 23` · `23. sayfa` | Sayfa 23 kartı → Bakara 146 |

**Doğrulama.** Sure 1-114, ayet 1-`verseCount[sure]`, cüz 1-30, sayfa 1-604.
Sınır aşılırsa **boş sonuç değil**, açıklayıcı kart:
*"Mâide suresi 120 ayettir"* + `/maide-suresi` bağlantısı.

**Belirsizlik kuralı.** `5-58` hem sure/ayet hem aralık okunabilir. Kural: `-` yalnız
**ayet numarasından sonra** aralık ayıracıdır (`2/153-160`). `5-58` sure/ayet sayılır.
Metin sonuçları zaten altta durduğu için yanlış okuma kullanıcıyı kilitlemez.

**Cüz/sayfa sınırları** build'de hesaplanır: 6 236 ayetin `juz` ve `page` alanları
taranıp 30 cüz ve 604 sayfa için `[surahId, verseNumber]` başlangıçları çıkarılır ve
`quick.json` içine yazılır. Yeni sayfa üretilmez; kart mevcut ayet sayfasına bağlanır.

## 8. Hızlı öneri katmanı

`search/quick.json` — sayfa açılışında **bir kez** iner, sonra tuş başına ağ isteği yok.

İçerik:
- 385 kısa kayıt: 114 sure + 109 kavram + 64 ilke + 50 kıssa + 26 konum + 22 olay
- 30 cüz sınırı + 604 sayfa başlangıcı
- sure eş adları

Tahmini boyut ~55 KB ham / **~16 KB gzip**.

Davranış:
- 2 harften itibaren canlı eşleşme. `yus` → Yûsuf (12); `yus.` → nokta atılır, aynı sonuç
- Sıralama: **tam ad > baştan eşleşme > içinde geçme**. `nu` → Nûh, Nûr, Mü'minûn
- Ayet (6 236) ve kök (1 641) shard'lı kalır ve **300 ms** gecikmeyle aranır;
  sure/kavram önerisi o sırada zaten ekranda

**Sure eş adları.** Normalizasyon çoğunu çözer (`Yâsîn`→`yasin`, `A'râf`→`araf`,
`Fîl`→`fil`, `Âl-i İmrân`→`ali imran`). Çözemediği yaygın ikinci adlar:

Tevbe/**Berâe** · İsrâ/**Benî İsrâîl** · Fâtır/**Melâike** · Mü'min/**Gâfir** ·
İnsân/**Dehr** · İnşirâh/**Şerh** · Tebbet/**Mesed**/**Leheb** · Nebe/**Amme** ·
Beyyine/**Kayyime** · Muhammed/**Kıtâl**

Bunlar bir iddia taşıdığı için CLAUDE.md kural 4 gereği koda gömülmez:
`data/sections/surah_aliases.json`, her kayıtta `source_slug` (TDV İslâm Ansiklopedisi).
Sonuç kartında *"Diğer adı: Berâe"* olarak da gösterilir — kaynaklı içerik
`<SourceBadge>` ile çıkar.

## 9. Sınıflandırma ve süzgeçler

**Tür sekmeleri, her birinde sonuç sayısı:**
Tümü · Ayet · Kavram · Kök · Kıssa · İlke · Sure · Konu · Konum · Zaman

**Ayet süzgeçleri:** sure seçimi · Mekkî/Medenî · cüz aralığı · sayfa aralığı

**Eşleşme yeri:** Meal / Arapça / Transkripsiyon (§6'daki ad alanlarına birebir düşer)

**Sıralama:** Alaka (varsayılan) · Mushaf sırası

**Skor:**
1. Tam kelime eşleşmesi > ön ek eşleşmesi > yumuşatılmış ön ek eşleşmesi
2. Çok kelimeli sorguda **hepsi** geçen kayıt, bir kısmı geçenden önce
3. Tür ağırlığı: kavram/kök/kıssa/ilke/sure başlığı ayetten önce — kısa ve isabetliler
4. Başlıkta eşleşme, gövdede eşleşmeden önce
5. Eşitlikte mushaf sırası

## 10. Sayfa, URL, gezinme

- `/ara?q=sabır&tur=ayet&sure=2&yer=meal&sira=mushaf` — paylaşılabilir; durum
  `history.replaceState` ile yazılır, geri tuşu çalışır
- Sayfa açılırken `q` varsa arama otomatik koşar (paylaşılan bağlantı boş açılmaz)
- `SiteNav.astro`'ya **"Ara"** eklenir; JS'siz sayfalardan `/ara`'ya düz bağlantı
- JS'siz `/ara`: kavram / kök / kıssa / ilke / sure / konum için A-Z dizinler **basılı**
  gelir; serbest kelime kutusunun yerinde açık uyarı durur

## 11. CSP ve yayın

`infra/nginx/kurankesfi.tr.conf` içindeki `map $uri $kesif_csp` bloğuna yeni satır:

```
~^/ara(\.html)?$  "... script-src 'self'; connect-src 'self'; ..."
```

Açılan **iki** yetki ve tam gerekçesi:
- `script-src 'self'` — arama betiği, kendi sunucumuzdan, CDN yok
- `connect-src 'self'` — `/data/search/*.json` shard'ları okunur

`'unsafe-inline'`, `'unsafe-eval'`, `wasm-unsafe-eval` **açılmaz**. `/ara` dışındaki
8 100+ sayfada `default-src 'none'` değişmez.

Değişiklik canlı nginx'e de kopyalanır (`/www/server/panel/vhost/nginx/`) —
`docs/DURUM.md` bunu bir kez yaşanmış tuzak olarak kaydediyor.

## 12. Değişecek dosyalar

| Dosya | İş |
|---|---|
| `scripts/build/lib/search.ts` **(yeni)** | kayıtları topla, normalize et, shard'la, `quick.json` + `meta.json` yaz |
| `scripts/build/build.ts` | search adımını çağır |
| `scripts/build/linter.ts` | indeks bütünlüğü (aşağıda) |
| `apps/web/src/lib/search/normalize.ts` **(yeni)** | TR + AR normalizasyon, tokenize — build ile ORTAK |
| `apps/web/src/lib/search/reference.ts` **(yeni)** | referans ayrıştırıcı + sınır doğrulama |
| `apps/web/src/lib/search/query.ts` **(yeni)** | shard indir/önbellek, ön ek eşleşme, skor, süzgeç |
| `apps/web/src/lib/search/types.ts` **(yeni)** | indeks tipleri |
| `apps/web/src/pages/ara.astro` **(yeni)** | sayfa + JS'siz dizin |
| `apps/web/src/components/AramaKutusu.astro` **(yeni)** | kutu, sekmeler, süzgeçler, sonuç iskeleti |
| `apps/web/src/components/SiteNav.astro` | "Ara" bağlantısı |
| `apps/web/src/pages/zaman.astro` | olay `<li>`'sine `id="olay-<order>"` çıpası |
| `apps/web/src/pages/sitemap.xml.ts` | `/ara` |
| `data/sections/surah_aliases.json` **(yeni)** | sure eş adları, `source_slug` zorunlu |
| `infra/nginx/kurankesfi.tr.conf` | `/ara` CSP satırı |
| `scripts/deploy/deploy.sh` | duman testi (aşağıda) |
| `docs/DURUM.md` | §12.2 "Yapılmayanlar"dan çıkar, yayındaki modüller tablosuna girer |

**Linter kuralları (geçmezse build durur):**
- Her posting id'si bir `docs/` kaydına düşmeli
- Her doküman `url`'i üretilen bir sayfaya karşılık gelmeli
- `surah_aliases.json` kayıtlarında `source_slug` zorunlu, `surah_id` 1-114 arasında
- `quick.json` cüz sayısı 30, sayfa sayısı 604
- Toplam gzip boyutu 1 MB'ı aşarsa uyarı, 1,5 MB'ı aşarsa hata

**Duman testi eklemeleri:** `/ara` 200 · `/data/search/meta.json` 200 ·
`/data/search/quick.json` 200 · `/ara` CSP'sinde `script-src 'self'` var ·
`/bakara-suresi/153` CSP'sinde `script-src` **yok**.

## 13. Test

TDD. `apps/web/src/lib/search/__tests__/`:

- **normalize**: `İ/ı` (`İSTANBUL`→`istanbul`), `â/î/û`, kesme işareti (`En'âm`→`enam`),
  sondaki nokta (`yus.`→`yus`), Arapça hareke ve elif varyantları
- **tokenize**: durak kelime elemesi, 2 harf altı elemesi, tırnaklı tam ifade
- **reference**: `5/58`, `5:58`, `5.sure 58.ayet`, `sure 5 ayet 58`, `bakara 153`,
  `yus 4`, `bakara 153-160`, `2/300` (sınır aşımı), `cüz 2`, `sayfa 23`,
  `cüz 31` (sınır aşımı), `5-58` belirsizlik kuralı
- **query**: ön ek eşleşme, ünsüz yumuşaması (`kitap`→`kitabı`), çok kelimeli kesişim,
  skor sırası, tür süzgeci, eşleşme yeri süzgeci
- **quick**: `nu` sıralaması (Nûh > Nûr > Mü'minûn), eş ad eşleşmesi (`berae`→Tevbe)

Build tarafı: `scripts/build/__tests__/` — indeks üretimi smoke, shard bütünlüğü.

## 14. Kabul kriterleri

1. `/ara` JS kapalıyken 200 döner ve dizin içeriği **dolu** gelir
2. `yus.` yazınca Yûsuf ve Yûnus **ağ isteği olmadan** çıkar
3. `5/58` → "Mâide 58" kartı; Enter doğrudan `/maide-suresi/58`
4. `5.sure 58.ayet` → aynı sonuç
5. `bakara 153-160` → 8 ayet listelenir
6. `2/300` → *"Bakara suresi 286 ayettir"* uyarısı
7. `cüz 2` → Bakara 142 kartı · `sayfa 23` → Bakara 146 kartı
8. `sabır` → Ayet sekmesinde sonuç var, Kavram sekmesinde "Sabır" var
9. `صبر` → Arapça eşleşme döner
10. İlk arama transferi < 60 KB gzip; `public/data/search/` toplamı < 1 MB gzip
11. `/bakara-suresi/153` CSP'sinde `script-src` **yok** (duman testi doğrular)
12. `pnpm test` ve `pnpm typecheck` geçer

## 15. Bilinen sınırlar

1. **Tek meal.** Diyanet'te geçmeyip Okuyan/Esed'de geçen kelime bulunmaz
   (Diyanet "namaz", Okuyan "salât"). Kavram ve kök katmanı bunu kısmen kapatır.
   4 meale çıkmak build parametresi: indeks ~4×, ilk transfer ~2×.
2. **Ön ek eşleşmesi Türkçe'de tam değil.** Ünsüz yumuşaması kuralı `kitap→kitabı`
   gibi sık durumu çözer; ünlü düşmesi (`burun→burnu`) çözülmez.
3. **Build ve dist.** ~1 MB gzip indeks; 625 MB'lık `dist` içinde ölçülemeyecek kadar
   küçük. Build süresine 6 236 ayet dosyasının taranması eklenir.
4. **`sessionStorage` sınırı.** Çok sayıda shard inen uzun oturumda kota dolabilir;
   yazma `try/catch` içinde, dolarsa önbellek atlanır, arama çalışmaya devam eder.
