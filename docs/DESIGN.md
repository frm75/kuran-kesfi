# DESIGN.md — Tasarım Dili

> Plan §22 gereği kod yazılmadan önce tanımlanır. Bu belge **taslaktır**;
> onaylandıktan sonra token'lar `apps/web/src/styles/global.css` içine
> `@theme` bloğu olarak işlenir ve bileşenler kodlanır.

## 0. Karakter

Sakin, tipografi odaklı, ağırbaşlı. Ekranın işi metni taşımak; arayüz kendini
göstermez.

**Kaçınılan** (plan §22): yeşil-altın palet, stok cami/minare görseli, aşırı
süsleme, gradyan, gölge yığını, animasyonlu giriş ekranı, karşılama modalı.

**Peygamber, sahabe, melek ve insan figürü tasviri yoktur** (plan §20.3).
Süsleme yalnızca geometrik/soyut desen ve ince hat detayıyla sınırlıdır.

---

## 1. Renk

Nötr palet + **tek** vurgu rengi. Karanlık mod birinci sınıf: ayrı ayarlanmış
değerler, açık modun otomatik ters çevrilmişi değil.

### Vurgu rengi seçimi

Muted indigo. Gerekçe: yeşil-altın klişesinden uzak, hem kağıt hem koyu zeminde
yeterli kontrast veriyor, "keşif/bağlantı" anlamını taşıyacak kadar canlı ama
metnin önüne geçmiyor. Tek hue kullanılır; ikinci bir marka rengi yoktur.

### Token'lar

Değerler OKLCH ile tanımlanır (algısal olarak eşit adımlı; açık/koyu geçişte
parlaklık kayması olmaz). Yanlarındaki hex, desteklemeyen araçlar için.

| Token | Açık | Koyu | Kullanım |
|---|---|---|---|
| `--bg` | `oklch(98.5% 0.005 85)` `#faf9f7` | `oklch(19% 0.012 265)` `#16181d` | Sayfa zemini — saf beyaz/siyah değil |
| `--bg-raised` | `oklch(100% 0 0)` `#ffffff` | `oklch(23% 0.014 265)` `#1d2027` | Panel, kart, bottom sheet |
| `--bg-sunken` | `oklch(96% 0.006 85)` `#f2f0ed` | `oklch(16% 0.010 265)` `#111318` | Alıntı bloğu, kod, pasif alan |
| `--text` | `oklch(24% 0.010 265)` `#1f2229` | `oklch(93% 0.006 85)` `#eceae6` | Gövde metni |
| `--text-muted` | `oklch(48% 0.012 265)` `#65697a` | `oklch(68% 0.012 265)` `#9ba0af` | Meta, dipnot, kaynak satırı |
| `--text-faint` | `oklch(62% 0.010 265)` `#8b8f9d` | `oklch(52% 0.012 265)` `#6f7484` | Ayet numarası, sayfa/cüz |
| `--line` | `oklch(90% 0.006 85)` `#e3e0db` | `oklch(29% 0.014 265)` `#2b2f38` | İnce ayırıcı |
| `--accent` | `oklch(52% 0.14 268)` `#4f5bd5` | `oklch(72% 0.13 268)` `#8f97ee` | Bağlantı, aktif durum, Keşfet |
| `--accent-weak` | `oklch(95% 0.03 268)` `#eceef9` | `oklch(28% 0.05 268)` `#252a44` | Vurgu zemini, seçili satır |
| `--focus` | `oklch(60% 0.18 268)` | `oklch(78% 0.15 268)` | Klavye odak halkası |

**Kontrast:** `--text` / `--bg` her iki modda ≥ 12:1. `--text-muted` / `--bg`
≥ 5.5:1. `--accent` / `--bg` ≥ 4.5:1 (bağlantı metni için AA).

### Renk tek başına anlam taşımaz

Güven derecesi ve kaynak sınıfı rozetleri **renk + biçim + metin** ile
ayrışır. Renk körlüğü ve gri baskı durumunda bilgi kaybolmaz.

| Güven | Kenarlık | Harita pini (plan §7) | Metin |
|---|---|---|---|
| `kesin` | düz | dolu | "kesin" |
| `muhtemel` | kesikli | kesikli halkalı | "muhtemel" |
| `rivayet` | noktalı | şeffaf | "rivayet" |

Aynı kural `verse_relation` için de geçerli; AI önerisi ilişkiler **"Olası
ilişki"** etiketiyle ayrı gösterilir (plan §12.5, §13).

---

## 2. Tipografi

### Yazı tipleri

Hepsi **kendi sunucumuzdan** servis edilir. Google Fonts CDN kullanılmaz —
plan §1.3 (takip yok) ve §1.7 (üretimde harici bağımlılık yok).

| Rol | Yazı tipi | Yedek | Boyut | Not |
|---|---|---|---|---|
| Kur'an metni (Arapça) | **Amiri Quran** | Scheherazade New, serif | 39,3 KB | Kur'an dizgisi için tasarlanmış; hareke yerleşimi doğru. **Öntanımlı.** |
| Kur'an metni — 2. seçenek | **Scheherazade New** | serif | 21,0 KB | Kullanıcı seçerse indirilir; öntanımlı olarak indirilmez |
| Gövde ve arayüz | **Inter** | Amiri Quran, system-ui | 61,4 KB | Değişken, 300–700. Türkçe kapsamı tam (ı, İ, ş, ğ, ç, ö, ü) |
| İlke / kavram başlığı | Georgia, "Times New Roman", serif | — | 0 | Source Serif 4 **henüz indirilmedi** — serif kararı açık (aşağıdaki 2. madde) |

Toplam **121,7 KB**; bir sayfada aynı anda en fazla **100,7 KB** (Inter + Amiri).
Latin-only sayfalar Arapça fontu hiç indirmez: `@font-face` `unicode-range`
Arap harf bloklarıyla sınırlı.

Inter'in gövde yığınında Amiri Quran ikinci sırada: meal ve dipnotların içinde
geçen Arap harfli alıntılar (7 kod noktası) Inter'de yok, tarayıcı karakter
bazında bir sonrakine düşer.

- `font-display: swap`, WOFF2, alt küme.
- **Alt küme uydurulmaz**, üretilen veriden türetilir: Uthmani metinde fiilen
  geçen 62 kod noktası + meallerde geçen Latin/noktalama + küçük bir arayüz
  tabanı. Liste `scripts/fonts/codepoints.json` olarak üretilir.
- **Doğrulanır**: `pnpm fonts:verify` 6236 ayetin tamamını HarfBuzz ile —
  tarayıcının kullandığı dizgi motoruyla — hem tam fontla hem alt kümeyle dizer;
  eksik glif (`.notdef`) ve dizgi farkı arar. cmap kapsaması tek başına yetmez:
  Arapça'da harflerin başta/ortada/sonda biçimleri GSUB üzerinden gelir, cmap'te
  görünmez.
- Arapça blok `dir="rtl"`, meal `dir="ltr"` — **karışmaz** (plan §6).
- Transkripsiyon Latin harflidir, `ltr`; Arapça bilmeyen okuyucu için her zaman
  erişilebilir olmalıdır (plan §2.5).

### Ölçek

Taban 16px = `1rem`. Oran ~1.25 (majör üçlü). Arapça kendi ölçeğini kullanır —
aynı punto Arapça'da çok daha küçük okunur.

| Token | Boyut | Satır aralığı | Kullanım |
|---|---|---|---|
| `--text-xs` | 0.75rem / 12px | 1.5 | Rozet, ayet numarası |
| `--text-sm` | 0.875rem / 14px | 1.6 | Meta, kaynak satırı, dipnot |
| `--text-base` | 1rem / 16px | 1.7 | Gövde, meal |
| `--text-lg` | 1.125rem / 18px | 1.65 | Öne çıkan meal, giriş paragrafı |
| `--text-xl` | 1.5rem / 24px | 1.4 | Bölüm başlığı |
| `--text-2xl` | 1.875rem / 30px | 1.3 | Sayfa başlığı |
| `--text-3xl` | 2.25rem / 36px | 1.2 | Ana sayfa |
| `--arabic-base` | 1.75rem / 28px | **2.1** | Ayet metni |
| `--arabic-lg` | 2.25rem / 36px | 2.1 | Mushaf modu, tek ayet görünümü |

Arapça satır aralığı 2.1'den aşağı inmez: hareke ve şedde üst üste biner.

Kullanıcı ayarları (plan §7): yazı boyutu, satır aralığı, Arapça yazı tipi.
Ölçek `rem` tabanlı olduğu için kök boyut değişince orantılı büyür.

### Okuma genişliği

Meal ve açıklama metni **65–75 karakter** (`--measure: 68ch`). Arapça metin
daha geniş olabilir (`--measure-arabic: 46ch`) çünkü karakter başına genişlik
farklıdır.

---

## 3. Boşluk

4px tabanlı ölçek. Cömert padding; gereksiz kutu ve çerçeve yok — ayrım
boşlukla ve ince çizgiyle yapılır.

| Token | px | Kullanım |
|---|---|---|
| `--space-1` | 4 | Rozet içi |
| `--space-2` | 8 | Satır içi öğeler arası |
| `--space-3` | 12 | Etiket ↔ değer |
| `--space-4` | 16 | Bileşen içi standart |
| `--space-6` | 24 | Ayetler arası |
| `--space-8` | 32 | Bölümler arası |
| `--space-12` | 48 | Sayfa üst/alt |
| `--space-16` | 64 | Ana sayfa blokları |

Köşe yarıçapı: `--radius-sm: 4px` (rozet), `--radius: 8px` (kart, panel),
`--radius-lg: 16px` (bottom sheet üst köşeleri). Daire yok.

Gölge yerine **ince çizgi** (`--line`) kullanılır. Tek istisna: bottom sheet ve
açılır menü — `0 -2px 16px rgb(0 0 0 / 0.08)` kadar, yükseklik hissi için.

---

## 4. Hareket

Kısa ve amaçlı. 200–300 ms, `cubic-bezier(0.2, 0, 0, 1)`.

| Token | Süre | Kullanım |
|---|---|---|
| `--motion-fast` | 150ms | Rozet, buton geri bildirimi |
| `--motion` | 220ms | Panel açılış, sekme geçişi |
| `--motion-slow` | 300ms | Bottom sheet, harita uçuşu |

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Harita uçuşları bu durumda anlık konum değişimine düşer.

---

## 5. Ortak bileşenler

Plan §22: aynı bileşen tüm sayfalarda aynı görünür.

### `<AyetPaneli>`
Her ekranda ayete tıklayınca açılan tek panel (plan §7, §12.4). İçerik sırası:
Arapça → transkripsiyon → seçili mealler → kelimeler → bağlam → keşif çıkışları
(kıssa / kavram / kök / ilgili ayetler / nüzul / konum).
Masaüstünde yan panel, mobilde bottom sheet.

### `<SourceBadge>` — omurga
**Kaynaklı içerik bu bileşen olmadan render edilmez** (plan §12.10, CLAUDE.md).
Üç sınıftan birini gösterir:

| Sınıf | Görünüm |
|---|---|
| Kaynaklı bilgi | düz kenarlık, kaynak adı + `[Kaynakları göster]` |
| Alternatif görüş | kesikli kenarlık, "Alternatif görüş" öneki |
| Platform verisi | noktalı kenarlık, "Kendi derlememiz" |

### `<ConfidenceBadge>`
§1'deki kenarlık dili. Yalnızca renkle ayrışmaz.

### `<DiscoveryPath>` — keşif yolu çubuğu
Her ekranda sabit, tek satır (plan §12.8a):
`Bakara 153 › Sabır › Yusuf › Affetmek › Yusuf 92`
Mobilde kaydırılabilir; uzun yolda ortası kısalır. "Yolu temizle" ve
"Yolu paylaş" (URL'ye kodlanır, sunucu gerekmez).

### `<ComparisonBasket>`
En fazla 8 ayet (plan §12.8b). Alt köşede sayaç; dolu değilken görünmez.

### Zorunlu atıf alanı
Her sayfanın altında, `authors_index.json` içindeki
`requiredAttributionLinks` dizisinden **veriyle gelen** bağlantılar
gösterilir. Şu an zorunlu olanlar:

- Arapça metin: **Tanzil Project** → `tanzil.net`
- Mealler, dipnotlar, kelime ve kök verisi: **Açık Kuran** (CC BY-NC-SA 4.0)

Bu liste kodda sabit değildir; hangi kaynaktan veri alındıysa build onu üretir
ve referans linter eksikse **build'i durdurur**. Ayrıntı: `data/LICENSE`.

---

## 6. Düzen

- **Tek sütun** okuma; kenar çubuğu yalnızca harita ve kavram grafında.
- Ana sayfa beş keşif kapısı + Keşfet + Bugünün Keşfi + Kaldığın yerden devam
  (plan §14). Sure listesiyle başlamaz.
- **Mobil öncelikli.** Birincil aksiyonlar başparmak erişiminde; dokunma hedefi
  en az 44×44 px.
- Harita ve graf için **zorunlu liste alternatifi** (plan §6, §22) — dekoratif
  değil, eşdeğer erişim yolu.

---

## 7. Erişilebilirlik

- Klavyeyle tam gezinilebilir; odak halkası her zaman görünür (`--focus`,
  2px dış çizgi + 2px boşluk). `outline: none` tek başına kullanılmaz.
- Arapça bloklarda `lang="ar"`, meal `lang="tr"` — ekran okuyucu doğru sesle
  okur. Transkripsiyon `lang="tr"` (Latin harfli).
- Ayet numaraları `aria-label` ile açık: "Bakara suresi 153. ayet".
- Renk kontrastı WCAG AA; gövde metni AAA hedeflenir.
- `prefers-reduced-motion` ve `prefers-color-scheme` desteklenir; tema seçimi
  kullanıcı tercihiyle ezilebilir ve yerelde saklanır.

---

## 8. Performans bütçesi

Plan §20.4:

| Ölçüt | Hedef |
|---|---|
| İlk yükleme JS | < 100 KB |
| İlk yükleme toplam (font hariç) | < 200 KB |
| LCP (3G) | < 2 sn |
| CLS | < 0.1 |

- Astro island'ları: harita, graf ve arama yalnızca kendi sayfalarında yüklenir.
- Sure JSON'ları lazy; ölçülen boyutlar (`scripts/build/README.md`):
  Bakara çekirdek + 1 meal = **68 KB gzip**, ayet paneli **~7 KB gzip**.
- Fontlar `preload` + `swap`. Inter her sayfada, Amiri Quran yalnızca Arapça
  metni olan sayfalarda (`<Base arabic>`) önceden yüklenir.
- `size-adjust` ile yedek yazı tipi metriklerine hizalama **henüz yok.** Doğru
  değerler yedek fontun (Arial / system-ui) gerçek metriklerinden hesaplanır;
  build makinesinde fontconfig ve Arial-metrik bir font yok, ölçemeden sayı
  yazılmadı. `docs/BACKLOG.md` → teknik borç.
- Görseller WebP/AVIF, `loading="lazy"`, boyut belirtilmiş.

---

## 9. Onay sonrası ilk adım

1. ✅ Token'lar `apps/web/src/styles/global.css` → `@theme` bloğu
2. ✅ Yazı tipleri `apps/web/public/fonts/` (alt kümelenmiş WOFF2)
3. ✅ `<SourceBadge>` ve `<ConfidenceBadge>` — en küçük iki bileşen, dili sabitler
4. ✅ Klasik okuma ekranı: `/[sure-slug]` ve `/[sure-slug]/[ayet]`

### Bileşen örnek sayfası

`apps/web/src/pages/_tasarim.astro` her iki rozetin bütün durumlarını gösterir.
Dosya adı `_` ile başladığı için **route üretmez, yayına çıkmaz**; `astro check`
yine de tip denetiminden geçirir. Görsel bakmak gerekirse `_` kaldırılıp
`pnpm --filter @kuran/web build` çalıştırılır, sonra geri konur.

### Ölçüm (bileşenler eklendikten sonra)

| | |
|---|---|
| CSS (tek dosya, tüm sayfalar) | 16 KB ham / **4,2 KB gzip** |
| Sayfa JS | **0 bayt** — rozetler `<details>` + CSS, işaret satır içi SVG |
| Yazı tipleri | 100,7 KB (Arapçalı sayfa) / 61,4 KB (Latin-only sayfa) |
| En büyük sayfa (Bakara, 286 ayet) | 381 KB ham / **66 KB gzip** |
| Ayet sayfası (50 meal) | 25 KB ham / **6,6 KB gzip** |
| Üretilen sayfa sayısı | 6352 · build 50 sn |

### Tekrar eden kaynak rozeti — ölçülen ve düzeltilen

İlk sürümde her meal bloğu kendi açılır kaynak panelini taşıyordu. Bakara'da
286, bir ayet sayfasında 50 kez tekrarlanıyordu:

| | HTML toplam | Bakara | Ayet sayfası |
|---|---|---|---|
| Blok başına tam rozet | 614 MB | 842 KB | 102 KB |
| Kısa rozet + global CSS | 288 MB | 521 KB | 48 KB |
| Sayfa başına tek bildirim | **153 MB** | **381 KB** | **25 KB** |

Karar bayt için değil tasarım için verildi: aynı kaynak satırını 286 kez
yazmak şeffaflık değil gürültü. Kural yine kodla korunuyor — `<Translation>`
ya `source` ister ya da kaynağın sayfada nerede bildirildiğini söyleyen
`sourceDeclaredBy` metnini; ikisi de yoksa **build durur** (test edildi).

## Karara açık noktalar

1. **Vurgu rengi** — indigo önerildi. Farklı bir hue isterseniz yalnızca
   `--accent*` token'ları değişir, geri kalan palet aynı kalır.
2. **Serif kullanımı** — şu an yalnızca ilke/kavram başlıklarında ve Georgia
   ile. Source Serif 4 indirilmedi: karar "hiç kullanmayalım" çıkarsa boşuna
   40–60 KB olurdu. "Kullanalım" derseniz `scripts/fonts/build_fonts.ts`
   içindeki listeye bir satır eklenip `pnpm fonts` çalıştırılır.

### Karara bağlandı — 2026-09-03

3. **Arapça öntanımlı yazı tipi: Amiri Quran.** Gerekçe: Kur'an dizgisi için
   yapılmış, hareke ve Kur'an işaretlerinin yerleşimi mushaf hattına yakın;
   alt kümede 1048 glif taşıyor (Scheherazade New 259). Scheherazade New
   ikinci seçenek olarak sunuluyor — daha geniş satır, daha düşük kontrast,
   küçük ekranda daha okunaklı. İkisi de HarfBuzz ile 6236 ayette doğrulandı.
