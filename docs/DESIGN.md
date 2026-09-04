# DESIGN.md — Kur'an-ı Kerim Keşfi Tasarım Sistemi

Bu doküman `docs/PROJE_PLANI.md` §22 ve §14.1'in uygulamalı karşılığıdır. Kod yazmadan önce onaylanır; sonraki
tüm bileşenler bu token'lardan beslenir. Referans görsel: proje afişi (koyu lacivert + altın, sakin tipografi).

## 1. Renk Token'ları

### Karanlık Mod (birincil)
```
--bg-primary:      #0B1B3B   koyu lacivert (arka plan)
--bg-elevated:     #122649   kart, panel arka planı
--bg-overlay:      #1A3059   modal, dropdown

--text-primary:    #F5EFE0   ana metin (kağıt tonu)
--text-secondary:  #C9D3E8   ikincil metin
--text-muted:      #8A99B8   üçüncül, ipucu

--accent:          #C9A756   altın (birincil vurgu, CTA)
--accent-hover:    #D6B76A
--accent-muted:    #8A7238   pasif altın (rozet arka planı)

--border:          #1F3560
--border-strong:   #2A4676

--success:         #6BAA6B
--warning:         #C9A756
--danger:          #B85450
```

### Açık Mod
```
--bg-primary:      #F5EFE0   kağıt tonu
--bg-elevated:     #FFFFFF   kart
--bg-overlay:      #FBF7EA

--text-primary:    #0B1B3B   koyu lacivert metin
--text-secondary:  #3A4A6B
--text-muted:      #6B7A96

--accent:          #A88B3F   altın (açık modda biraz daha koyu, kontrast için)
--accent-hover:    #957A35
--accent-muted:    #E8DCB8

--border:          #E5DDC5
--border-strong:   #C9BFA0
```

### Güven ve Rozet Renkleri (§9 belirsizlik sistemi)
```
--confidence-kesin:      --success        yeşil, dolu
--confidence-muhtemel:   --warning        altın/sarı, kesikli halka
--confidence-rivayet:    --text-muted     gri, şeffaf/kesik çizgi
```

## 2. Tipografi

```
--font-heading:  'Playfair Display', 'Cormorant Garamond', Georgia, serif
--font-body:     'Inter', 'DM Sans', -apple-system, system-ui, sans-serif
--font-arabic:   'Amiri Quran', 'Scheherazade New', serif
--font-mono:     'JetBrains Mono', ui-monospace, monospace
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
--text-3xl:   2.25rem     36px    landing alt hero
--text-4xl:   3rem        48px    landing hero
--text-5xl:   3.75rem     60px    landing devasa (mobilde küçülür)

--text-ar-md:   1.5rem       Arapça meal ayet
--text-ar-lg:   2rem         Arapça okuma
--text-ar-xl:   2.5rem       Arapça büyük (mushaf)
```

### Ağırlık ve Satır Yüksekliği
```
--fw-normal:  400
--fw-medium:  500
--fw-semi:    600
--fw-bold:    700

--lh-tight:   1.2      başlık
--lh-normal:  1.5      gövde
--lh-relaxed: 1.75     meal
--lh-arabic:  2.0      Arapça (nefes payı)
```

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

--content-narrow:   36rem      576px  okuma sütunu (65-75 karakter)
--content-normal:   48rem      768px  standart içerik
--content-wide:     72rem     1152px  landing bölümleri
--content-full:     90rem     1440px  harita, graf
```

## 4. Yuvarlaklık ve Gölge
```
--radius-sm:  4px      rozet, ince öğe
--radius-md:  8px      kart, buton
--radius-lg:  16px     panel
--radius-xl:  24px     modal
--radius-full: 9999px  pin, badge

--shadow-sm:  0 1px 2px rgba(0,0,0,0.2)
--shadow-md:  0 4px 12px rgba(0,0,0,0.25)
--shadow-lg:  0 12px 32px rgba(0,0,0,0.3)
```

## 5. Hareket
```
--ease-out:      cubic-bezier(0.16, 1, 0.3, 1)
--ease-in-out:   cubic-bezier(0.65, 0, 0.35, 1)

--duration-fast:    150ms
--duration-normal:  250ms
--duration-slow:    400ms   (harita uçuşları)
```
`prefers-reduced-motion: reduce` → tüm süreler 0ms'ye iner, geçişler kaybolur.

## 6. Ortak Bileşen Anahtarları

### `<SourceBadge>` — §12.10
Üç varyant:
- **Kaynaklı bilgi** — altın kenarlık, ince ikon (kitap)
- **Alternatif görüş** — altın kesikli kenarlık, ince ikon (çatal yol)
- **Platform verisi** — nötr kenarlık, ince ikon (küp)

Yapı: `[ikon] [Kaynak türü etiketi] · [Eser/Yazar] · [Referans]` — tıklanınca detay açılır.

### `<ConfidenceBadge>`
`--confidence-kesin` yeşil dolu · `--confidence-muhtemel` altın halka · `--confidence-rivayet` gri kesik.

### `<DiscoveryPath>` (breadcrumb, §12.8a)
Yatay, kaydırılabilir; her adım `·` ile ayrılır; tıklanabilir; mobilde ortası `…` ile kısalır.

### `<AyetPanel>`
Sekmeler: Bağlam · Mealler · Kelimeler · Kavramlar · Kıssa · Hoca Notları · Bağlantılar
Arapça bloğu üstte, seçili mealler altında, hepsi tek dikey akışta.

### `<CTA>` (buton)
- Birincil: altın dolu, koyu lacivert metin, hover'da açık altın
- İkincil: altın kenarlık, altın metin
- Ghost: kenarlıksız, altın metin

## 7. Landing Bölüm Şablonu

Her bölüm: `--content-wide` maksimum genişlik, `--space-24` dikey padding (mobilde `--space-12`).
Başlık üstte serif, açıklama altında sans-serif, içerik altta.

Bölüm başlığı yapısı:
```
──────────────
[üst çizgi altın, --space-12]
BÖLÜM BAŞLIĞI (Playfair, --text-3xl, altın)
Kısa açıklama (Inter, --text-md, --text-secondary)
[içerik]
```

## 8. Süsleme
- Bölüm ayraçları: ince altın çizgi + ortada geometrik/hat detayı (afişteki gibi)
- Kart köşelerinde ince İslam sanatı motifi (SVG, opsiyonel, `--accent-muted`)
- Figür yok, insan tasviri yok (§20.3)
- Stok görsel yok; kullanılırsa özel çizim/hat/geometri

## 9. Onay
Bu doküman `main` branch'e girmeden Fatih'in onayı alınır. Sonra `apps/web/src/styles/tokens.css`
ve `tailwind.config.ts` bu değerlerden üretilir.

---

## 10. Kontrast düzeltmeleri — 2026-09-04

§1'deki palet WCAG AA'ya göre ölçüldü ve **açık modda birkaç değer kalıyordu.**
Metnin okunamaması bir tasarım tercihi değil hatadır (plan §1.8 "erişilebilir");
aşağıdaki değerler asgari düzeltmeyle, hue korunarak açıldı. Ölçüm: sRGB
bağıl parlaklık, WCAG 2.1 kontrast oranı.

| Token | Mod | DESIGN.md | Ölçülen | Düzeltildi | Yeni ölçüm |
|---|---|---|---|---|---|
| `--text-muted` | açık | `#6B7A96` | 3,77:1 ✗ | `#5F6D86` | 4,56:1 ✓ |
| `--success` | açık | `#6BAA6B` | 2,30:1 ✗ | `#4A774A` | 4,54:1 ✓ |
| `--danger` | koyu | `#B85450` | 3,58:1 ✗ | `#DF6863` | 5,10:1 ✓ |
| `--danger` | açık | `#B85450` | 3,53:1 ✗ | `#8E3F3C` | 6,26:1 ✓ |

### Yeni token: `--accent-text`

Açık modda `--accent` (`#A88B3F`) kağıt üzerinde **2,85:1** veriyor. Bağlantı
metni için AA sınırı 4,5:1, anlam taşıyan kenarlık için 3:1. Altını büsbütün
koyulaştırmak markayı bozardı; bunun yerine ikiye ayrıldı:

- `--accent` — **zemin** rengi olarak kalır (CTA dolgusu, ince süs çizgisi).
  Altın zeminde koyu lacivert metin: koyu modda 7,41:1, açık modda 5,21:1 ✓
- `--accent-text` — altının **metin ve anlam taşıyan kenarlık** sürümü.
  Koyu modda `#C9A756` (7,41:1), açık modda `#816A2F` (4,54:1) ✓

`--accent-muted` (`#8A7238`) koyu modda 3,68:1 — DESIGN.md'de zaten "rozet
arka planı" olarak tanımlı, **metin olarak kullanılmaz.**

### Başlıklarda altın

Başlıklar `--accent-text` kullanır, `--accent` değil. Açık modda `--accent`
(`#A88B3F`) kağıt üzerinde **2,85:1**; büyük metin için AA sınırı 3:1 ve o bile
tutmuyor. `--accent-text` (`#816A2F`) 4,54:1 veriyor — normal metin sınırının
da üstünde.

`--accent` yalnızca **zemin** ve **süs** olarak kullanılır: CTA dolgusu (üstünde
koyu lacivert metin, 5,21:1) ve bölüm ayracının ince çizgisi.

### Kenarlık kontrastı

`--border` ve `--border-strong` yalnızca ayraçtır (1,4–1,8:1) ve öyle kalır.
Ama **anlam taşıyan** kenarlıklar — `<SourceBadge>`'in üç sınıfı,
`<ConfidenceBadge>` — 3:1 istiyor. Onlar `--accent-text` ve `--text-muted`
kullanır:

| | koyu | açık |
|---|---|---|
| altın kenarlık | 7,41:1 | 4,54:1 |
| nötr kenarlık | 5,94:1 | 4,56:1 |

## 11. Uygulama notları

- **`--content-full` → `--container-map`.** Tailwind'de `max-w-full` zaten
  `100%` demek; aynı adı kullanmak çakışırdı.
- **`--container-arabic: 46ch`** eklendi. DESIGN.md §3'te Arapça okuma
  genişliği yok; aynı satır uzunluğu Arapça'da daha uzun görünüyor.
- **Playfair Display ağırlığı 600'e sabitlendi.** Ölçüldü: değişken eksen
  (500–700) 48,7 KB, (600–700) 40,2 KB, sabit 600 **26,4 KB**. Plan §20.4
  font bütçesi (Latin-only sayfa < 95 KB) yalnızca sonuncusuyla tutuyor.
  Başlıklar boyutla ayrışıyor, ağırlıkla değil.
- **JetBrains Mono indirilmedi.** `--font-mono` yalnızca birkaç yerde
  kullanılıyor, CDN yasak, 30+ KB'lık bir font bunun için indirilmiyor;
  `ui-monospace` yığınına düşüyor.
- **Kod içinde hex yok.** Tek istisna: altın zemin üzerindeki CTA metni
  `#0B1B3B` sabit yazılı — o metin temayla birlikte değişemez, çünkü zemin
  her iki modda da altındır.

### Ölçüm — bu tasarımla

| | |
|---|---|
| CSS (tek dosya, tüm site) | 20,1 KB ham / **5,3 KB gzip** |
| Sayfa JS | **0 bayt** |
| Yazı tipleri | 127,1 KB (Arapçalı sayfa) / 87,8 KB (Latin-only) — bütçe 140 / 95 |
| Üretilen sayfa | 6354 |
