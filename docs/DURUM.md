# DURUM — nerede kaldık

> Bu dosya **oturum devri** içindir: bağlam sıfırlandığında tek okumayla toparlanmak için.
> Kalıcı kurallar `CLAUDE.md`'de, plan `PROJE_PLANI.md`'de, tasarım `DESIGN.md`'de.
> Son güncelleme: 2026-09-05, yayın `20260905T185939Z` (içerik genişletme: 50 kıssa / 101 kavram / 60 ilke).

## Tek cümle

`kurankesfi.tr` yayında: 8212 sayfa, 6236 ayet + 50 meal + 1641 kök +
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
| Klasik okuma | `/sureler`, `/<sure>`, `/<sure>/<ayet>` | 114 sure, 6236 ayet, 50 meal |
| Kök kelime | `/kok`, `/kok/<arapça>` | 1641 kök, 77 429 kelime (%61 köke bağlı) |
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

## Tuzaklar (hepsi bir kez yaşandı)

1. `pnpm deploy` pnpm'in yerleşiği — sessizce hiçbir şey yapmaz. **`pnpm run deploy`** kullan.
2. Build komutları **repo kökünden** çalışır; `cd apps/web/src` yapıp unutmak `build:web not found` verir.
3. `astro check` OOM oluyor (exit 137). Gerçek denetim `pnpm build:web`.
4. `pkill -f "http.server"` kendi bash'ini öldürür (exit 144); `pgrep -f "[h]ttp.server"` kullan.
5. Medya/görsel geldiğinde **kaynağı VE çıktıyı** kare kare tara — figür yasağı (plan §20.3).
   İlk hero kesimi üç yerde figür geçirmişti ve yayına çıkmıştı.
6. `data/**` değişince `pnpm content:import` çalıştırılmazsa build eski veriyle geçer.
   Duman testi artık `/kissa/hz-yusuf` gibi adresleri kontrol ediyor, sessiz kalmıyor.
7. Türetilmiş ilişkilerde **puan tek başına yetmez, çeşitlilik sınırı şart**. İlk sürümde
   Bakara 153'ün sekiz bağının sekizi de tek bir nadir kökten (عون) geliyordu; sabır bağı
   listeye hiç giremiyordu. `MAX_PER_REF = 3` bunu çözdü — bkz. `scripts/import/lib/relations.ts`.

## Sıradaki adımlar (öneri sırası)

### 1. İçerik genişletme

Kıssa 34 → 50 (Ashâb-ı Sebt, Ashâb-ı Karye, Talût, Belkıs ayrı, İrem…), kavram 71 → 100,
ilke 32 → 60. Kalıp yerleşti: `data/**` dosyası yaz → `pnpm content:import` → `pnpm build`.

### 2. Telegram botu (§19)

İlkeler modülü ön koşuluydu, artık hazır. `schedule.json` üretimi (`principle_verse` üzerinden
yıllık takvim) + `infra/db/bot_schema.sql`. Site statik kalır, bot ayrı küçük servis.
