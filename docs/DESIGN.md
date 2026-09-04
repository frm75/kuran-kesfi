# DESIGN.md — Kur'an-ı Kerim Keşfi Tasarım Sistemi

Bu doküman `docs/PROJE_PLANI.md` §22 ve §14.1'in uygulamalı karşılığıdır. Kod yazmadan önce onaylanır; sonraki
tüm bileşenler bu token'lardan beslenir.

**Referans görsel:** `docs/landing.html` (2026-09-04) ve proje logosu — mürekkep laciverdi zemin, pirinç vurgu,
altın çerçeveli hilal-rahle amblemi.

**Uygulanmış hâli:** `apps/web/src/styles/global.css`. Buradaki her değer orada token olarak durur; hex ve px
kod içine gömülmez. Bu dosyayla kod çelişirse **kod hatalıdır**.

---

## 1. Renk Token'ları

Karanlık mod **birincildir**: temel değerler karanlıktır, açık mod üzerine yazar. Yanlarındaki oranlar sRGB
bağıl parlaklıkla hesaplanmış WCAG 2.1 kontrast oranlarıdır; ölçüm zemin/kart/overlay üçlüsüne göredir ve
**en kötü hâli** yazılmıştır.

### Karanlık Mod (birincil)

```
--bg-primary:      #071023   mürekkep laciverdi — sayfa zemini
--bg-elevated:     #0C1B33   kart, panel
--bg-overlay:      #132743   modal, dropdown

--text-primary:    #EFE6D3   parşömen — ana metin        12,10:1
--text-secondary:  #CFC7B6   ikincil metin                8,93:1
--text-muted:      #B9B2A2   üçüncül, ipucu               7,11:1

--accent:          #C9A253   pirinç — ZEMİN rengi (CTA dolgusu, süs çizgisi)
--accent-hover:    #E0C489
--accent-muted:    #8A7238   pasif altın — ZEMİN, metin olarak kullanılmaz
--accent-text:     #C9A253   altının metin sürümü         6,27:1

--teal:            #449C93   firuze — ikincil ayrım rengi 4,59:1

--border:          #1E3355   DEKORATİF kenarlık, ayraç
--border-strong:   #2E4A7A   DEKORATİF, vurgulu çerçeve

--success:         #6FBF8E                                6,80:1
--warning:         #C9A253
--danger:          #E3736E                                4,96:1
```

### Açık Mod (türetilmiş)

```
--bg-primary:      #EFE6D3   parşömen
--bg-elevated:     #FBF7EA   kart
--bg-overlay:      #FFFFFF

--text-primary:    #071023                                15,29:1
--text-secondary:  #3C4657                                 7,67:1
--text-muted:      #69614F                                 4,95:1

--accent:          #C9A253   koyu moddakiyle AYNI — bkz. aşağıda
--accent-hover:    #DCB974
--accent-muted:    #E4D5AE
--accent-text:     #7C601F                                 4,77:1

--teal:            #2E6A64                                 5,04:1

--border:          #DCD2BA
--border-strong:   #C9BFA0

--success:         #2F6B45                                 5,11:1
--warning:         #7C601F
--danger:          #9B3A36                                 5,55:1
```

### Neden `--accent` iki modda aynı, `--accent-text` ayrı

Altın bir **zemin** rengidir. Altın dolgu üzerine koyu lacivert metin iki modda da **7,93:1** verir; rengi
moda göre değiştirmek gereksiz, üstelik markayı bozar.

Ama altın **metin** olarak açık modda kağıt üzerinde yalnızca **2,45:1** veriyor — bağlantı metni için AA
sınırı 4,5:1. Bu yüzden ikiye ayrıldı:

| Token | Nerede | Koyu | Açık |
|---|---|---|---|
| `--accent` | CTA dolgusu, süs çizgisi, ince ayraç | `#C9A253` | `#C9A253` |
| `--accent-text` | başlık, bağlantı, anlam taşıyan kenarlık | `#C9A253` | `#7C601F` |

**Başlıklar `--accent-text` kullanır**, `--accent` değil.

### Kenarlıklar: dekoratif ve anlam taşıyan

`--border` ve `--border-strong` **dekoratiftir** — kart çerçevesi, bölüm ayracı. Bilgi taşımazlar, bu yüzden
3:1 eşiği aranmaz (koyu modda 1,19:1 kalırlar ve bu doğrudur; kenarlığı görmemek hiçbir şey kaybettirmez).

**Anlam taşıyan kenarlık** — rozet sınıfı, güven derecesi — `--accent-text`, `--teal` veya `--text-muted`
kullanır. Üçü de her iki modda 4,5:1'in üstünde.

### İkincil vurgu: firuze

Plan §22'de altın "tek vurgu rengi" idi; 2026-09-04 tasarımıyla firuze girdi. Firuze bir **marka rengi
değil, ayrım rengidir**: yalnızca "alternatif görüş" rozetinde ve keşif ağı şemasının halka bağlarında
kullanılır. CTA'da, başlıkta, bağlantıda kullanılmaz.

Tasarımdaki `#3E8E86` kart zemini üzerinde **4,44:1** kalıyordu (sınır 4,5). Hue korunarak `#449C93`'e açıldı.

### Güven ve Rozet Renkleri (plan §12.9 belirsizlik sistemi)

```
--confidence-kesin:      --success      yeşil, düz kenarlık, dolu pin
--confidence-muhtemel:   --warning      altın, kesikli kenarlık, kesikli halka
--confidence-rivayet:    --text-muted   gri, noktalı kenarlık, şeffaf pin
```

**Renk tek başına anlam taşımaz.** Üç sınıf renk + kenarlık biçimi + metin ile ayrışır; renk körlüğünde ve
gri baskıda da okunur.

---

## 2. Tipografi

```
--font-heading:  'Kesif Latin Ek', 'Cormorant Garamond', Georgia, 'Times New Roman', serif
--font-body:     'Kesif Latin Ek', 'Karla', 'Amiri Quran', -apple-system, system-ui, sans-serif
--font-arabic:   'Amiri Quran', 'Scheherazade New', serif
--font-reading:  'Kesif Latin Ek', 'Source Serif 4', 'Karla', 'Iowan Old Style', Georgia, serif
--font-mono:     ui-monospace, 'SF Mono', 'JetBrains Mono', monospace
```

Fontlar **kendi sunucumuzdan** servis edilir. Google Fonts CDN kullanılmaz — font isteği de IP adresi ve
Referer taşır, üçüncü bir tarafa ziyaretçinin hangi sayfayı açtığını söyler (plan §1.3, §1.7).

Üretim `pnpm --filter @kuran/fonts fonts`, doğrulama `fonts:verify`. Kapsama listesi uydurulmaz, üretilen
veriden türetilir. Hepsi SIL OFL 1.1; lisans metinleri `apps/web/public/fonts/` altında.

### Ölçülen boyutlar

| Rol | Font | Ağırlık | woff2 |
|---|---|---|---|
| Gövde, arayüz | **Karla** | 300–600 değişken | 30,3 KB |
| Başlık | **Cormorant Garamond** | 300–500 değişken | 50,9 KB |
| Meal, dipnot | **Source Serif 4** | 400 sabit | 32,4 KB |
| Arapça ayet (öntanımlı) | **Amiri Quran** | 400 | 40,4 KB |
| Arapça 2. seçenek | Scheherazade New | 400 | 22,1 KB |
| Çeviriyazı yaması | **Kesif Latin Ek** | 400 | 2,3 KB |

**Sayfa başına:** tanıtım ve okuma-dışı sayfa **123,9 KB** (Karla + Cormorant + Amiri Quran + yama);
meal içeren okuma sayfası **156,3 KB** (+ Source Serif). Latin-only sayfa **83,5 KB**.

### Çeviriyazı yama fontu — neden var

Karla, Türkçe Kur'an çeviriyazısının harflerini **taşımıyor**. Ölçüldü:

| Harf | Geçiş | Etkilenen ayet | Karla | Cormorant | Source Serif |
|---|---|---|---|---|---|
| ḳ | 7364 | 3750 | yok | yok | yok |
| ẕ | 5266 | 3139 | yok | yok | yok |
| ḥ | 4151 | 2714 | yok | var | var |
| ḫ | 2540 | 1849 | yok | var | var |
| ṣ | 2427 | 1603 | yok | var | var |
| ḍ | 1763 | 1294 | yok | var | var |
| ŝ | 1454 | 1096 | yok | var | var |
| ṭ | 1403 | 1059 | yok | var | var |

Eski gövde fontu Inter hepsini taşıyordu; güvenlik ağı oydu. Karla'ya geçince ağ koptu: ayet okunuşu kelime
ortasında sistem fontuna düşerdi ve **hiçbir sayfa testi bunu yakalamazdı.**

Tam kapsamalı sans fontları tarandı — Source Sans 3, Noto Sans ve Lato tamam; **hiçbiri Karla değil**.
Tasarımın fontunu değiştirmek yerine eksik 24 kod noktası Inter'den alt kümelendi: **2,3 KB**,
`unicode-range` ile sınırlı, sayfada o harflerden biri geçmiyorsa **indirilmez**.

Görsel dikiş: bu 8 harf Karla değil Inter çizgisiyle gelir. İkisi de grotesk, ölçekleri yakın. Doğru harfi
yanlış fontla göstermek, yanlış harfi doğru fontla göstermekten iyidir.

> Yığında `'Kesif Latin Ek'` **önde** durur. `unicode-range` onu yalnızca o harflerle sınırlar; önde olmazsa
> Karla'nın `.notdef`'i kazanır.

### Doğrulama

`pnpm --filter @kuran/fonts fonts:verify` her fontu HarfBuzz ile — tarayıcının kullandığı dizgi motoruyla —
tam metin üzerinde dizer. cmap kapsaması tek başına yetmez: Arapça'da harflerin başta/ortada/sonda biçimleri
GSUB üzerinden gelir, cmap'te görünmez.

```
Amiri Quran        6236 satır TEMİZ
Scheherazade New   6236 satır TEMİZ
Karla             12586 satır TEMİZ
Source Serif 4     6236 satır TEMİZ
Cormorant Garamond  131 satır TEMİZ
Kesif Latin Ek     5751 satır TEMİZ
```

### Ölçek (modular scale, oran 1.250)

```
--text-xs:    0.75rem     12px    üstbilgi, rozet
--text-sm:    0.875rem    14px    ipucu, dipnot
--text-base:  1rem        16px    gövde
--text-md:    1.125rem    18px    meal metni
--text-lg:    1.25rem     20px    alt başlık
--text-xl:    1.5rem      24px    bölüm başlığı
--text-2xl:   1.875rem    30px    sayfa başlığı
--text-3xl:   2.25rem     36px    landing bölüm başlığı
--text-4xl:   3rem        48px
--text-5xl:   3.75rem     60px

--text-hero:  clamp(2.9rem, 7.5vw, 5.6rem)   landing hero — ekranla ölçeklenir

--text-ar-md:   1.5rem       Arapça meal ayet
--text-ar-lg:   2rem         Arapça okuma
--text-ar-xl:   2.5rem       Arapça büyük (mushaf)
```

### Ağırlık ve Satır Yüksekliği

```
--fw-light:   300      hero ve bölüm başlıkları (Cormorant'ın karakteri buna dayanır)
--fw-normal:  400
--fw-medium:  500
--fw-semi:    600
--fw-bold:    700

--lh-tight:   1.2      başlık
--lh-normal:  1.5      gövde
--lh-relaxed: 1.75     meal
--lh-arabic:  2.0      Arapça (nefes payı — hareke ve şedde üst üste binmesin)
```

Cormorant Garamond **300–500** taşır; 600/700 yoktur. İstenirse tarayıcı sentetik kalın çizer ve serif bozulur.

> **Ağırlık ekseni açık bırakıldı.** Ölçüldü: 300–500 değişken 50,8 KB · 300–400 47,6 KB · 400 sabit 32,8 KB.
> Sabitlemek 18 KB kazandırıyordu ama başlık hiyerarşisini düzleştiriyor — tasarımın karakteri hero'nun ince
> 300'ü ile kart başlığının 400'ü arasındaki farka dayanıyor.

---

## 3. Boşluk Ölçeği (4px tabanlı)

```
--space-1:   0.25rem    4px
--space-2:   0.5rem     8px
--space-3:   0.75rem    12px
--space-4:   1rem       16px
--space-6:   1.5rem     24px
--space-8:   2rem       32px
--space-12:  3rem       48px
--space-16:  4rem       64px
--space-24:  6rem       96px

--content-narrow:   36rem       576px  okuma sütunu (65-75 karakter)
--content-normal:   40rem       640px  landing okuma satırı
--content-wide:     73.75rem   1180px  landing bölümleri
--content-full:     90rem      1440px  harita, graf
--container-arabic: 46ch               Arapça okuma genişliği
```

---

## 4. Yuvarlaklık ve Gölge

```
--radius-sm:   4px      rozet, ince öğe
--radius-md:   8px      kart, buton
--radius-lg:   16px     panel
--radius-xl:   24px     modal
--radius-full: 9999px   pin, badge

--shadow-sm:  0 1px 2px rgba(0,0,0,0.2)
--shadow-md:  0 4px 12px rgba(0,0,0,0.25)
--shadow-lg:  0 12px 32px rgba(0,0,0,0.3)
```

Ayrım öncelikle **ince çizgiyle** yapılır; gölge yalnızca gerçekten yükselen öğede (açılır menü, bottom sheet).

---

## 5. Hareket

```
--ease-out:      cubic-bezier(0.16, 1, 0.3, 1)
--ease-in-out:   cubic-bezier(0.65, 0, 0.35, 1)

--duration-fast:    150ms
--duration-normal:  250ms
--duration-slow:    400ms   (harita uçuşları)
```

`prefers-reduced-motion: reduce` → süreler sıfırlanır, geçişler kaybolur, hero parıltısı durur.

---

## 6. Ortak Bileşen Anahtarları

### `<SourceBadge>` — omurga (plan §12.10)

**Kaynaklı içerik bu bileşen olmadan render edilmez.** Üç varyant:

| Sınıf | Kenarlık | Renk | Metin |
|---|---|---|---|
| Kaynaklı bilgi | düz | `--accent-text` | kaynak adı |
| Alternatif görüş | **kesikli** | `--teal` | "Alternatif görüş" öneki |
| Platform verisi | **noktalı** | `--text-muted` | "Kendi derlememiz" |

Renk + kenarlık biçimi + metin birlikte ayrışır. Gri baskıda da düz/kesikli/noktalı olarak okunur.

### `<ConfidenceBadge>`
§1'deki güven renkleri ve kenarlık dili. Yalnızca renkle ayrışmaz.

### `<DiscoveryPath>` (breadcrumb, plan §12.8a)
Yatay, kaydırılabilir; her adım `·` ile ayrılır; tıklanabilir; mobilde ortası `…` ile kısalır.

### `<AyetPanel>`
Sekmeler: Bağlam · Mealler · Kelimeler · Kavramlar · Kıssa · Hoca Notları · Bağlantılar.
Arapça bloğu üstte, seçili mealler altında, hepsi tek dikey akışta.

### CTA (buton)
- **Birincil:** altın dolu, koyu lacivert metin (7,93:1), hover'da açık altın
- **İkincil:** altın kenarlık, `--accent-text` metin
- **Ghost:** kenarlıksız, `--accent-text` metin

---

## 7. Landing Bölüm Şablonu

Her bölüm: `--content-wide` maksimum genişlik, `--space-24` dikey padding (mobilde `--space-16`).

```
──────────────
[üst çizgi altın + ortada geometrik detay]
BÖLÜM BAŞLIĞI   (Cormorant, --text-3xl, --fw-light, --text-primary)
Kısa açıklama   (Karla, --text-md, --text-secondary)
[içerik]
```

Zemin dönüşümlü: `--bg-primary` bölümleri ile `--bg-elevated` bölümleri (manifesto, ağ, şeffaflık, bülten)
birbirini takip eder; ayrım ince `--border` çizgisiyle.

### Bölüm sırası

Plan §14.1'de. Uygulanmış hâli `apps/web/src/pages/index.astro`.

---

## 8. Süsleme

- Bölüm ayraçları: ince altın çizgi + ortada geometrik detay (`.rule-ornament`)
- Hero ambiyansı: statik SVG takımyıldızı, CSS parıltı (`prefers-reduced-motion`'da durur)
- **Figür yok, insan tasviri yok** (plan §20.3)
- Stok görsel yok; kullanılırsa özel çizim / hat / geometri

---

## 9. Marka

Logo: altın çerçeveli daire, gece laciverdi kubbe içinde hilal ve yıldızlar, rahle üstünde açık mushaf,
altında "KUR'AN-I KERİM KEŞFİ" ve "KEŞFET • OKU • ANLA".

Varlıklar `apps/web/public/brand/`, **tek kaynaktan üretilir**: `scripts/brand/logo-source.png` (512×512).
Üretim `pnpm brand`, doğrulama `pnpm brand:check` — fontlardaki akışın aynısı, manifest sha256 tutar.
Bütün boyutlar kaynaktan küçültülür; hiçbir çıktı büyütülmez.

| Dosya | Boyut | Nerede |
|---|---|---|
|  `logo-256.webp` | 21,9 KB | hero |
| `logo-128.webp` | 8,3 KB | yedek |
| `logo-96.webp` | 5,4 KB | menü, kapanış |
| `logo-48.webp` | 2,2 KB | site şeridi |
| `logo-256.png` / `logo-96.png` | 33,1 / 6,9 KB | WebP desteklemeyen ortam |
| `favicon-32.png` / `favicon-16.png` | 1,8 / 1,1 KB | sekme |
| `apple-touch-icon.png` | 19,1 KB | iOS (opak zemin — saydamlık siyaha döner) |
| `og-image.png` | 62,6 KB | paylaşım önizlemesi, 1200×630 |

Logo **dekoratiftir**: yanında site adı zaten yazılıdır, bu yüzden `alt=""` ve `aria-hidden`. Tek istisna
hero'daki büyük logo — orada sayfanın adını taşıdığı için gerçek `alt` metni var.

Genişlik/yükseklik HTML'de sabit yazılır: yüklenmeden önce de yer kaplar, CLS olmaz.

---

## 10. Erişilebilirlik

- Klavyeyle tam gezinilebilir; odak halkası her zaman görünür. `outline: none` tek başına kullanılmaz.
- Arapça bloklarda `lang="ar" dir="rtl"`, meal `lang="tr" dir="ltr"` — **karışmaz**.
- Ayet numaraları `aria-label` ile açık: "Bakara suresi 153. ayet".
- Renk kontrastı WCAG AA; gövde metni AAA hedeflenir. §1'deki her değer ölçülüdür.
- `prefers-reduced-motion` ve `prefers-color-scheme` desteklenir; tema seçimi kullanıcı tercihiyle ezilebilir.
- Harita ve graf için **zorunlu liste alternatifi** — dekoratif değil, eşdeğer erişim yolu.

---

## 11. Performans

Plan §20.4 bütçesi. Ölçülen:

| Ölçüt | Değer |
|---|---|
| Tanıtım sayfası | 28 KB ham · **7,8 KB gzip** |
| Tanıtım CSS'i | 16 KB ham · **2,9 KB gzip** |
| Okuma CSS'i | 28 KB ham · **6,0 KB gzip** |
| En büyük sayfa (Bakara, 286 ayet) | 436 KB ham · **89,4 KB gzip** |
| **JavaScript** | **0 bayt** — hiçbir sayfada yok |
| Üretilen sayfa | 7996 · build 87 sn |

Tanıtım sayfasının CSS'i **ayrı paketlenir**; okuma sayfaları onu indirmez.

### Betik neden yok

Sunucu CSP'si `default-src 'none'` diyor ve `script-src` tanımlı değil — betik **sessizce engellenir**
(`infra/nginx/kurankesfi.tr.conf`). Tasarımdaki iki öğe bu yüzden JS'siz karşılıklarıyla kuruldu:

| Tasarımda | Uygulamada | Sebep |
|---|---|---|
| Hero'da `<video>` + canvas ağ animasyonu | statik SVG takımyıldızı + CSS parıltı | `script-src` ve `media-src` yok |
| Kaydırınca katılaşan menü | her zaman katı, `backdrop-filter` ile | betik gerekiyordu |
| Burger menü (JS) | `<details>` | betik gerekiyordu |
| Kapı açıklamasının hover'da açılması | açıklama her zaman görünür | dokunmatik ve klavye erişimi |

Dekoratif bir animasyon için CSP gevşetilmedi.

---

## 12. Onay

Bu doküman `main` branch'e girmeden Fatih'in onayı alınır. Token'lar `apps/web/src/styles/global.css`
içindeki `:root` ve `@theme inline` bloklarında yaşar (Tailwind v4; ayrı `tailwind.config.ts` yok).

### Karar geçmişi

| Tarih | Karar |
|---|---|
| 2026-09-03 | Arapça öntanımlı font **Amiri Quran** — mushaf hattına yakın, alt kümede 1048 glif (Scheherazade New 259), 6236 ayette HarfBuzz ile doğrulandı |
| 2026-09-04 | Meal ve dipnot için ayrı okuma serifi: **Source Serif 4** |
| 2026-09-04 | Palet **lacivert + altın**; `--accent` / `--accent-text` ayrımı kontrast ölçümünden doğdu |
| 2026-09-04 | Görsel dil `docs/landing.html`'e geçti: zemin `#071023`, **Cormorant Garamond** + **Karla**, ikincil vurgu firuze |
| 2026-09-04 | Karla çeviriyazıyı taşımadığı için **Kesif Latin Ek** yama fontu (2,3 KB) eklendi |

### Karara açık nokta

**Cormorant Garamond 50,9 KB** — Playfair'in (26,4 KB) neredeyse iki katı ve toplam font bütçesinin en büyük
kalemi. Ağırlık ekseni 400'e sabitlenirse 32,8 KB'ye iner, karşılığında hero ve bölüm başlıklarındaki ince
300 ağırlığı kaybolur. Şu an eksen açık; başlık hiyerarşisi ağırlığa dayandığı için böyle bırakıldı.
