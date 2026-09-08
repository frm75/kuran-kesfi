# Ses takip ışığı — tasarım (2026-09-07)

Arapça kıraat ve Türkçe meal sesi çalarken **okunan kelimenin metin üstünde
ışıklanması**. Kullanıcı sorusu: "türkçe meal seslendirme, arapça seslendirmede
türkçe ve arapça metinde takip ışığı mümkün müdür?"

Cevap: mümkün. Arapça tarafın verisi bugün ölçüldü ve hazır çıktı; Türkçe taraf
sıfırdan üretim gerektiriyor. İki ayrı plan:

| Plan | Dosya | Bağımlılık |
|---|---|---|
| 04 — Arapça takip ışığı | `plans/2026-09-07-04-arapca-takip-isigi.md` | yok |
| 05 — Türkçe meal sesi | `plans/2026-09-07-05-turkce-meal-sesi.md` | Plan 04'ün oynatıcısı |

---

## 1. Bugün ölçülenler (tahmin değil)

Bütün sayılar 2026-09-07'de bu sunucuda ölçüldü; kaynak komutlar bölüm 8'de.

### 1.1 Kelime zaman damgası VAR

`docs/DURUM.md` ve `fetch_recitation.ts` "QUL paketinde `segments.json` boş
geliyordu, zaman damgası yok" diyor. **O tespit eski.** Quran.com'un QDC ucu
kelime kelime damga veriyor:

```
GET https://api.qurancdn.com/api/qdc/audio/reciters/7/audio_files?chapter=1&segments=true
User-Agent zorunlu — başlıksız istek 403 döner.

verse_timings[].segments = [[kelime_indisi, baslangic_ms, bitis_ms], ...]
```

`7` = Mishary Alafasy (murattal). `6` = el-Husarî (murattal), `12` = el-Husarî
(muallim) — Husarî indirilirse damgası da hazır.

| Ölçüm | Sonuç |
|---|---|
| Damgası olan ayet | **6236 / 6236** |
| Kelimesi eksiksiz ayet | 6066 (%97,3) |
| Damgası olmayan kelime | **247 / 77.429 (%0,32)** |
| İndis sayısı DB ile uyuşan ayet | 6235; tek istisna 37:130 (QDC 4, DB 3) |
| İndirilen ham JSON | 2,07 MB (114 istek) |

### 1.2 Kelime indisi `verse_part.sort_number` ile birebir

QDC indisi 1 tabanlı ve DB'deki kelime sayısıyla eşleşiyor. Duraklama işaretleri
(ۚ ۖ ۗ) DB'de ayrı satır değil, önceki kelimenin `arabic` alanının içinde
(2:255 → 7. kelime `[ٱلْقَيُّومُ ۚ]`). Bu yüzden sayılar tutuyor: eşleme için
ek bir hizalama katmanı GEREKMİYOR.

### 1.3 Elimizdeki ayet MP3'leri QDC damgalarıyla aynı kayıt

Damgalar sure MP3'üne göre veriliyor, bizde ise ayet başına dosya var
(everyayah, 1,7 GB, `/opt/kuran/media/ses/alafasy/`). Aynı ustadan kesilmiş
olup olmadığı ölçüldü — 300 ayetlik rastgele örneklem, `ffprobe` süresi ile
QDC `verse_timings[].duration` farkı:

```
medyan 2 ms · p95 6 ms · max 481 ms · 100 ms üstü fark yalnız 3 ayette
```

**Sonuç: sure MP3'lerini yeniden indirmeye gerek yok.** Damgayı ayete göreli
hale getirmek yetiyor: `göreli = mutlak − verse_timings.timestamp_from`.

### 1.4 Onarılması gereken üç kusur

| Kusur | Ayet | Kural |
|---|---|---|
| Damgası olmayan kelime | 170 ayette 247 kelime | komşulardan doğrusal aradeğerleme |
| İlk kelime ayet başından ÖNCE başlıyor | medyan 55 ms (normal, kırpılır); 500 ms üstü **215 ayet** (bozuk, atılır) | tolerans 500 ms |
| İndis kelime sayısını aşıyor | 1 ayet (37:130) | fazlası son kelimeye katılır |

### 1.5 Boyut

Ayet başına "kelime başlangıçları + son bitiş" dizisi:

```
bütün Kur'an: 480 KB ham · 168 KB gzip
sure başına:  ortalama 4,2 KB · en büyük 36,5 KB (Bakara)
```

Sure başına 4 KB, sayfaya **gömülecek** kadar küçük. Ağa çıkmaya gerek yok →
`connect-src` açılmıyor.

### 1.6 Türkçe meal: kayıt yok, üretilecek

`data/` içinde 23 Türkçe meal var, hepsi 6236 ayet tam.

| Meal | Karakter | Kelime | Lisans |
|---|---|---|---|
| **mehmet-okuyan** (seçildi) | 913.243 | 119.050 | CC BY-NC-SA 4.0 |
| muhammed-esed | 1.044.563 | 141.043 | CC BY-NC-SA 4.0 |
| mustafa-islamoglu | 974.136 | 134.917 | CC BY-NC-SA 4.0 |
| diyanet-isleri | 915.836 | 123.555 | CC BY-NC-SA 4.0 |
| elmalili-hamdi-yazir | 762.095 | 112.974 | CC BY-NC-SA 4.0 |

Açık lisanslı **insan** kaydı yok (BACKLOG'daki tespit doğrulandı). Tek yol TTS.

**Seçim: Mehmet Okuyan** (kullanıcı kararı, 2026-09-07). Muhammed Esed'e göre
%13 daha kısa ve daha ucuz; karşılığında bir iş getiriyor — metninde dipnot
işaretleri var (§1.7).

### 1.7 Mehmet Okuyan metnindeki dipnot işaretleri

Ölçüldü:

| Ölçüm | Sonuç |
|---|---|
| Metindeki `[n]` işareti | **4.432** (3.361 ayette) |
| Gerçek bir dipnota denk gelen | 4.430 |
| Denk gelmeyen (düz metin sayılır) | 2 |
| Okuyan'ın dipnot sayısı | 4.443 (11'inin metinde işareti yok) |
| Rakam geçen ayet | 3.652 |

İşaret ayıklanmadan sentezlenirse ses **"köşeli parantez bir"** der. Ayıklama
körlemesine `\[\d+\]` silmekle yapılmaz: siteyle AYNI kural işlemeli, yoksa
sayfadaki kelime kutuları ile seslendirilen kelimeler kayar. Site zaten
`splitFootnoteMarkers(text, footnoteNumbers)` kullanıyor
(`apps/web/src/lib/data.ts:346`) ve numarası gerçek dipnota denk gelmeyen
işareti düz metin bırakıyor. Aynı işlev paylaşıma çıkarılıp sentez scriptine
bağlanacak.

Karşılaştırma — Muhammed Esed metninde `[` de rakam da YOK; seçilseydi bu iş
hiç olmayacaktı. Fark bir görevin içine sığdı (Plan 05, Görev 2).

---

## 2. Karar: takip ışığı nereye konur

**Yeni sayfa `/dinle/<sure>`.** 6236 ayet sayfasına dokunulmaz.

Gerekçe: takip ışığı `timeupdate`/`requestAnimationFrame` ister, yani JavaScript.
Sitenin kuralı 0 bayt JS (`default-src 'none'`). Bugüne kadar iki istisna açıldı
ve ikisi de TEK sayfa: `/harita` (MapLibre) ve `/gunluk` (IndexedDB). Aynı
desen sürüyor: dinleme tek sayfada döner, ayet sayfası oraya düz bir bağlantı
verir (`/dinle/2#2-255`), ayet sayfasındaki `<audio controls>` olduğu gibi kalır.

Reddedilen: ayet sayfalarına script eklemek. 6236 sayfada CSP gevşetmek,
kazanılan özelliğin karşılığı değil.

Yan fayda: BACKLOG'daki **"sure boyunca sürekli çalma yok"** maddesi bu sayfayla
kapanır — tek `<audio>`, biten ayette `src` değişir.

## 3. Sayfanın davranışı

```
/dinle/2                 Bakara, baştan
/dinle/2#2-255           Ayetü'l-Kürsi'den başlar
```

- Tek oynatıcı: oynat/duraklat, önceki/sonraki ayet, hız (0,75× / 1× / 1,25×),
  "bu ayeti tekrarla", "otomatik kaydır".
- Arapça metin kelime kelime `<span data-i="7">`; çalan kelime `.is-active`.
- Meal metni altında; Plan 05'ten sonra meal de kendi kelimeleriyle ışıklanır.
- Betik çalışmazsa: kelimeler yine basılı, her ayetin altında kendi
  `<audio controls preload="none">` etiketi durur. Işık yoktur, dinleme çalışır.
- `prefers-reduced-motion`: otomatik kaydırma kapalı, ışık geçişi anî.

### 3.1 Arapça ↔ Türkçe eşzamanlı ışık meselesi

**Aynı anda iki metinde ışık yürütmek doğru olmaz.** Meal cümle çevirisidir;
Arapça kelime sırasıyla birebir eşleşmez ("Allah'tan başka tanrı yoktur"daki
"yoktur" Arapça'da 2. kelimedir). Kelime kelime karşılık `verse_part.translation_tr`
alanında zaten var ama o meal değil, sözlük karşılığıdır.

Karar — üç kip, hepsinde ışık YALNIZ çalan metinde:

| Kip | Ses | Işık |
|---|---|---|
| Arapça | kıraat | Arapça kelimeler |
| Meal | Türkçe TTS | meal kelimeleri |
| Ardışık | önce kıraat, sonra meal | sırayla ikisi |

## 4. Veri akışı

```
QDC API ──(pnpm media:segments)──> data/recitation/segments_alafasy.json
                                        │  (git'te, 480 KB)
                                        ▼
                        scripts/build/build.ts → emitRecitationSegments
                                        │
                                        ▼
                     apps/web/public/data/ses/segment_<sure>.json  (114 dosya)
                                        │  build sırasında okunur
                                        ▼
                     /dinle/<sure> sayfasına GÖMÜLÜ JSON  (ağ isteği yok)
```

`data/**` tek kaynak kuralı korunur; JSON script tarafından ÜRETİLİR, elle
yazılmaz (`reciter_alafasy.json` ile aynı gerekçe).

## 5. Türkçe TTS kararı — ücretsiz, yerel GPU

**Kullanıcı kararı (2026-09-07): ücretsiz açık ağırlıklı model, kullanıcının
kendi GPU'lu makinesinde.** Sunucuda GPU yok (4 çekirdek, 15 GB RAM); üretim
oraya taşınmaz. Depoda bunun sözleşmesi zaten var: `media:ai` hattı
(`kuyruk/` → yerel üretim → `cikti/` → `collect`).

| Yol | Lisans | Türkçe | Kelime damgası | Maliyet |
|---|---|---|---|---|
| **Chatterbox Multilingual v3** | MIT (ağırlıklar dahil) | resmî, 23 dil | yok → hizalama | **$0** |
| F5-TTS Türkçe (`marduk-ra/F5-TTS-Turkish`) | CC BY-NC 4.0 | Common Voice 17 ince ayarı | yok → hizalama | $0 |
| XTTS-v2 (Coqui) | CPML — **ticari yasak**, proje kapandı | 17 dilden biri | yok → hizalama | $0 |
| Piper `tr_TR-dfki` | MIT | tek ses, GPU gerekmez | yok → hizalama | $0 |
| Azure Speech | — | tr-TR nöral | `WordBoundary` bedava | ~$15 |
| ElevenLabs | — | çok iyi | karakter düzeyi | ~$150–250 |

**Chatterbox ilk aday**: MIT lisanslı (ağırlıklar dahil), Türkçe resmî olarak
destekleniyor, 4 GB VRAM yetiyor, sıfır-atışlı ses klonlama var. Çıktısına
PerTh filigranı gömülü — duyulmaz, sentez olduğunu belgeler. Karar kulakla
verilir: Plan 05 Görev 1 aynı ayeti üç modelle üretip karşılaştırıyor.

Beklenti dürüst olsun: bu modeller Azure nöral sesine **yakın**, birebir aynı
değil.

### 5.0 Damga: hizalama, çünkü açık modeller vermiyor

Azure'un bedavaya verdiği `WordBoundary` burada yok. Onun yerine üretilen ses
METİNLE hizalanır — `ctc-forced-aligner` (BSD-2) +
`MahmoudAshraf/mms-300m-1130-forced-aligner` (CC BY-NC, 158 dil, Türkçe dahil),
aynı GPU'da, saniyeler içinde.

Bu bir **tanıma** işi değil: söylenen metin zaten elimizde, model yalnızca
hangi milisaniyede hangi kelimenin geçtiğini işaretliyor. Hata payı ASR'ye
göre çok düşük. Çıktı Plan 04'teki Arapça damgayla AYNI biçime çevrilir
(`starts[]`, son eleman bitiş), böylece `activeWordIndex` iki metinde de
değişmeden çalışır.

### 5.1b Referans ses — başkasının sesi klonlanmaz

Sıfır-atışlı modeller 5–10 saniyelik bir kayıttan ses klonluyor. İki meşru
yol var: **modelin öntanımlı sesi** ya da **kullanıcının kendi kaydı**. Bir
spikerin, hocanın veya tanınmış birinin sesiyle meal okutmak, o kişinin
söylemediği bir sözü söylemiş gibi göstermek olur; yapılmaz.

Seçilen referans bütün 6236 ayette AYNI kalmalı — değişirse ses sureden sureye
kayar.

### 5.1 Lisans — kullanıcı kararı bekliyor

Meal metni **CC BY-NC-SA 4.0**. Sesli kayıt o metnin türev eseridir:

- **BY** — meal sahibi künyede anılmalı (sayfada zaten `Attribution.astro` var).
- **NC** — site ticari değil; uygun.
- **SA** — üretilen ses de aynı lisansla yayımlanmalı.

Modelin kendi lisansı da zincire giriyor: Chatterbox MIT (serbest),
F5-TTS-Turkish CC BY-NC (bu site ticari değil, uygun), XTTS'in CPML'i ticari
kullanımı yasaklıyor. Hangi model seçilirse künyeye yazılır.

Sayfada "Türkçe meal sesi yapay seslendirmedir" ibaresi zorunlu — dürüstlük
gereği; Chatterbox çıktısı ayrıca filigranlı.

Bu bir hukuk sorusu değil, bir **yayın kararı**: mealin sesli türevini
yayımlamak kullanıcının kendi kararıdır (bkz. `kutuphane-yayin-ayrimi`).
Plan 05'in ilk görevi bu kararı yazıya geçirmek.

### 5.2 Sentezlenen metin, gösterilen metinle AYNI olmalı

Okuyan metnindeki dipnot işaretleri (§1.7) sentezden önce ayıklanıyor. Aynı
ayıklama `/dinle` sayfasında da yapılmalı: kelime kutuları ile seslendirilen
kelimeler birebir aynı bölmeden çıkmazsa ışık kayar. Bu yüzden hem ayıklama
hem bölme TEK bir paylaşılan işlevden geçer (`@kuran/schema/text_tokens`),
ve linter her build'de damga sayısı ile kelime sayısını karşılaştırır.

`/dinle` sayfasında dipnot işaretleri gösterilmez — orası dinleme sayfası;
dipnotlar ayet ve sure sayfalarında olduğu gibi durur.

## 6. Depolama

| Katman | Boyut | Yer |
|---|---|---|
| Arapça kıraat (mevcut) | 1,7 GB | R2 `ses/alafasy/` |
| Zaman damgası | 480 KB | git, `data/recitation/` |
| Türkçe meal sesi (yeni) | ~380 MB tahmini (≈13,2 sa, 48 kbps mono) | R2 `ses/meal/mehmet-okuyan/` |
| Model ağırlıkları, PyTorch | birkaç GB | **yalnız kullanıcının makinesinde** — sunucuya kurulmaz |

Sunucuda 22 GB boş; sorun yok. Meal sesinin gerçek boyutu Plan 05'te iki sure
üstünde ÖLÇÜLECEK, sonra tam üretim çalışacak.

## 7. Değişecek CSP

`infra/nginx/kurankesfi.tr.conf` içindeki `map $uri $kesif_csp` bloğuna üçüncü
betikli dal eklenir:

```nginx
~^/dinle/  "default-src 'none'; script-src 'self'; img-src 'self' data: https://medya.kurankesfi.tr; media-src 'self' https://medya.kurankesfi.tr; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'none'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
```

`connect-src 'none'` — damga sayfaya gömülü, ağa çıkılmıyor. `'unsafe-inline'`
ve `'unsafe-eval'` AÇILMIYOR. Depodaki dosya ile `/www/server/panel/vhost/nginx/`
altındaki canlı dosya bugün birebir aynı; ikisi birlikte güncellenir.

## 8. Ölçüm komutları

Bu belgedeki her sayı şu araçlarla üretildi (scratchpad'de duruyor):

```bash
# kelime sayıları
docker exec kuran-pg psql -U kuran -d kuran -At -F'|' -c \
  "SELECT v.surah_id, v.verse_number, count(p.*) FROM verse_part p
   JOIN verse v ON v.id=p.verse_id GROUP BY 1,2 ORDER BY 1,2;" > parts.txt

# 114 surenin damgası
curl -s -H 'User-Agent: curl/7.81.0' \
  "https://api.qurancdn.com/api/qdc/audio/reciters/7/audio_files?chapter=N&segments=true"

# yerel MP3 süresi
ffprobe -v error -show_entries format=duration -of csv=p=0 media/ses/alafasy/002255.mp3
```
