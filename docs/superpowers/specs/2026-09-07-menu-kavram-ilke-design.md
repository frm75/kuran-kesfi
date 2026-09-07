# Tasarım — Ana menü yeniden yapılandırma, kavram haritası ve ilke katmanı

**Tarih:** 2026-09-07
**Durum:** kullanıcı onayı alındı (menü dağılımı, menü mekaniği, graf görünümü, ilke kapsamı)
**Kapsam kaydı:** Bu iş `docs/PROJE_PLANI.md` dışındadır. `CLAUDE.md` kural 7 "kapsam
dondurulmuştur" diyor; kullanıcı talebiyle bilinçli olarak açıldı. Uygulama bitince plana
§25 olarak işlenecek ya da kural 7 güncellenecek — karar kullanıcınındır.

---

## 1. Sorun

Üç ayrı sorun, ortak kökü "hiyerarşi verisi yok":

1. **Menü.** `apps/web/src/layouts/Base.astro` içinde 11 düz link gömülü. Gruplama yok,
   kullanıcı sitenin kaç eksende çalıştığını göremiyor, listeye yeni sayfa eklemek şeridi
   taşırıyor.
2. **Kavram haritası.** 101 kavramın **99'unda `parentSlug: null`**. `kavramlar.astro`
   "üst kavram → alt kavram ağacı" olarak yazılmış ama pratikte 99 kutuluk düz ızgara
   basıyor. Kavramlar arası 139 ilişki var (co_occurrence 73, contrast 36, cause 15,
   part_of 15) ve hiçbiri görselleşmiyor.
3. **İlkeler.** 60 ilke düz liste. Kategori alanı yok, `oppositeSlug` 60'ta yalnızca 4
   dolu, ibadet ilkeleri (namaz, oruç, zekât, hac) hiç yok.

## 2. Değişmeyen kısıtlar

Bu kısıtlar tasarımın girdisidir, tartışmaya açık değildir:

- **JS yok.** `infra/nginx/kurankesfi.tr.conf` içindeki `$kesif_csp` map'i varsayılan
  olarak `default-src 'none'` uyguluyor. `script-src` yalnızca `/harita`, `/kissa/*` ve
  `/gunluk` için açık. Bu işin **hiçbir parçası CSP'yi değiştirmez.** Graf inline SVG'dir.
- **Determinizm.** Plan §20.1 tekrarlanabilir build istiyor; aynı girdi aynı baytları
  üretmeli. Graf koordinatları trigonometriyle hesaplanır, fizik simülasyonu ile değil.
- **Kaynaksız içerik `data/` altına girmez** (`CLAUDE.md` kural 4). Hesaplanan veri
  kaynaklı veriden ayrı etiketlenir.
- **Erişilebilirlik.** Her grafiğin JS'siz, ekran okuyucu ile gezilebilir liste
  karşılığı bulunur (plan §12).

## 3. Üretim hattı (mevcut, değişmiyor)

```
data/**.json
  → scripts/import/content.ts        (zod doğrulama, TRUNCATE + yeniden yazım)
  → PostgreSQL                       (infra/db/schema.sql — ELLE yazılmış)
  → scripts/build/lib/content.ts     (SQL → statik JSON)
  → apps/web/public/data/*.json
  → Astro sayfaları (build anında okunur)
```

Yeni bir alan eklemek beş dosyaya birden dokunmak demektir:
`content_input.ts` (girdi şeması) → `infra/db/schema.sql` (tablo) →
`scripts/import/content.ts` (yazma + `CONTENT_TABLES`) →
`scripts/build/lib/content.ts` (okuma + dışa aktarım) →
`static_content.ts` (çıktı şeması) → sayfa.

`infra/db/schema.sql` **elle yazılır**; `packages/schema/src/generate/` yalnızca §23.2
hoca notu tablolarını üretir (karar 2026-09-03, `generate/tables.ts` başındaki not).

---

## 4. Bölüm A — Ana menü

### A.1 Yapı

Dört üst başlık, alt dağılımı onaylanan hâliyle:

| Oku | Anla | Keşfet | Kaynaklar |
|---|---|---|---|
| Sureler `/sureler` | Kavramlar `/kavramlar` | Kıssalar `/kissalar` | Kaynak şeffaflığı `/kaynaklar` |
| Okuma günlüğü `/gunluk` | Kökler `/kok` | Harita `/harita` | İletişim `/iletisim` |
| Günlük ayet `/telegram` | İlkeler `/ilkeler` | Zaman `/zaman` | Lisans / atıf `/kaynaklar#lisans` |
| | | Yazmalar `/yazmalar` | |

### A.2 Tek kaynak

Yeni dosya `apps/web/src/lib/nav.ts`:

```ts
export interface NavChild { href: string; label: string; blurb: string }
export interface NavHub { href: string; label: string; blurb: string; children: NavChild[] }
export const NAV: readonly NavHub[] = [ /* 4 hub */ ];
```

`Base.astro` içindeki gömülü `<nav>` bloğu çıkar; yerine
`apps/web/src/components/SiteNav.astro` gelir ve `NAV` dizisini basar. Breadcrumb'lar,
hub sayfalarının kart listeleri ve `sitemap.xml.ts` aynı diziden beslenir — ikinci kez
yazılmaz. `nav.ts` dışında hiçbir yerde sabit menü metni kalmaz.

### A.3 Açılır menü — CSS, JS yok

```html
<nav aria-label="Ana gezinme" class="site-nav">
  <ul class="nav-root">
    <li class="nav-item">
      <a href="/anla" aria-current={...}>Anla</a>
      <ul class="nav-sub">
        <li><a href="/kavramlar">Kavramlar</a></li>
        ...
      </ul>
    </li>
  </ul>
</nav>
```

Açılma kuralı:

```css
.nav-sub { display: none; }
.nav-item:hover > .nav-sub,
.nav-item:focus-within > .nav-sub { display: block; }
@media (max-width: 48rem) { .nav-sub { display: none !important; } }
```

- Klavye: `:focus-within` alt listeyi açar, Tab ile gezilir.
- Dokunmatik: `48rem` altında alt liste hiç basılmaz — dokunuş hub sayfasına gider,
  gezinme oradan sürer. Dokunmatikte "hover kilitlenmesi" tuzağı böylece hiç doğmaz.
- `aria-current="page"` yalnızca tam eşleşen sayfada. Hub, alt sayfalarından biri
  aktifken `data-active` sınıfı alır — `aria-current` iki kez basılmaz.

CSS `apps/web/src/styles/global.css` içinde mevcut `.site-header .site-nav` bloğunun
(satır ~1101) hemen altına yazılır; mevcut renk ve `aria-current` alt çizgi kuralları
korunur.

### A.4 Yeni sayfalar

`/oku`, `/anla`, `/kesfet` — üçü de aynı kalıp: kicker + başlık + kısa giriş + alt sayfa
kartları (ad, bir cümlelik `blurb`, canlı sayı: "101 kavram", "60 ilke", "114 sure").
Sayılar veri katmanından okunur, elle yazılmaz.

`/kaynaklar` zaten var; başına aynı kart listesi eklenir, mevcut atıf içeriği altta kalır.

**Route çakışması:** kök seviyede `[surah].astro` dinamik route'u var. Astro'da statik
route dinamiği yener, ayrıca tüm sure slug'ları `-suresi` ile bittiği için çakışma yok.
Yine de linter'a bir denetim eklenir: hub slug'ları sure slug listesiyle kesişmemeli.

### A.5 Kicker ve breadcrumb düzeltmesi

Mevcut kicker'lar Roma rakamlı kapı numaralandırması kullanıyor:
`I. Kapı — Kıssa`, `II. Kapı — Zaman`, `III. Kapı — Kavram`, `IV. Kapı — Kelime`,
`V. Kapı — İlkeler`. Yeni yapıda bu beş kapı Anla ve Keşfet arasında bölünüyor;
numaralandırma yanıltıcı hâle geliyor.

Roma rakamları kalkar. Kicker hub adını taşır: `Anla`, `Keşfet`.
Breadcrumb: `Ana sayfa › Anla › Kavramlar`.

### A.6 Tagline

`CLAUDE.md` içindeki tagline `Keşfet • Oku • Anla`. Menü sırası `Oku · Anla · Keşfet`.
Tagline menüyle aynı sıraya çekilir: **`Oku • Anla • Keşfet`**. `CLAUDE.md`, `DESIGN.md`
ve tanıtım sayfasında birlikte güncellenir.

### A.7 Maliyet ve denetim

Her sayfada nav 11 link yerine 17 link taşır (~+300 bayt ham HTML). 8138 sayfada gzip
sonrası ihmal edilebilir; uygulamada ölçülüp rapora yazılır. Ölçüm eşiği: `/bakara-suresi/255`
sayfasının gzip'li boyutu %2'den fazla artarsa durup nedeni yazılır.

---

## 5. Bölüm B — Kavram haritası

### B.1 Taksonomi — şema değişikliği yok

`concept.parent_id` ve `staticConcept.parent`/`children` zaten var. Yapılacak iş veridir:

**8 üst kavram** yeni `data/concepts/concept_<slug>.json` dosyası olarak eklenir
(`parentSlug: null`, `roots: []`, `sourceSlugs: ["tdv-islam-ansiklopedisi"]`).

`conceptInput` şu anda `roots.length > 0 || verses.length > 0` şartını dayatıyor. Üst
kavramın kendi kökü yok. **Şema düzeltmesi:** bu `refine` gevşetilir — kökü ve elle ayet
eşleştirmesi olmayan kavrama izin verilir **ancak yalnızca çocuğu varsa**. Doğrulama
`content.ts` yükleme aşamasında yapılır (tek dosya zod'u tüm kümeyi göremez):
"kökü olmayan kavramın en az bir çocuğu olmalı".

Mevcut `kufur → [fisk, sirk]` bağı **korunur**. Ağaç üç seviyeye çıkar:
`üst kavram → kavram → alt kavram`.

Üst kavramın ayet sayısı çocuklarından toplanır; kendi kökü olmadığı sayfada yazılır
("Bu bir üst başlıktır; sayılar alt kavramlarından toplanmıştır").

#### Tam eşleme (101 kavram → 8 üst kavram)

| Üst kavram (slug) | Alt kavramlar | Adet |
|---|---|---|
| **Tevhid ve Allah** `tevhid-ve-allah` | fazl, ilah, izzet, kudret, mulk, nur, nusret, rahmet, riza, tevhid, velayet | 11 |
| **Vahiy ve Peygamberlik** `vahiy-ve-peygamberlik` | ayet, hikmet, ilim, kiraat, kitap, mesel, mujde, nubuvvet, nuzul, risalet, uyari, vahiy | 12 |
| **İnsan ve Nefs** `insan-ve-nefs` | dunya, hayat, isitme-gorme, kalp, nefs, olum, su, yaratilis, zan | 9 |
| **İman ve Küfür** `iman-ve-kufur` | curum, dalalet, din, hidayet, iman, islam, itaat, ittiba, kufur *(→ fisk, sirk)*, sebil, sidk, yalan | 12 (+2) |
| **Amel ve İbadet** `amel-ve-ibadet` | amel, cihad, dua, hamd, ibadet, infak, namaz, sabir, sukur, takva, tesbih, tevekkul, zekat, zikir | 14 |
| **Ahlak ve Toplum** `ahlak-ve-toplum` | adalet, ahid, birr, emanet, hak, helal-haram, hilafet, ihsan, kadin-erkek-hak, kibir, sahitlik, sevgi, tevazu-kavram, ummet, zulum | 15 |
| **İmtihan ve Kader** `imtihan-ve-kader` | ecel, hayir, helak, imtihan, kader, korku, nimet, rizik, ser, seytan, umut | 11 |
| **Ahiret ve Hesap** `ahiret-ve-hesap` | af, ahiret, azap, cennet, dirilis, ebedilik, ecir, hesap, husran, karsilik, kurtulus, magfiret, sefaat, tevbe, vaad | 15 |

Toplam 11+12+9+14+14+15+11+15 = **101**. Linter denetimi: her kavramın tam bir üst
kavrama bağlı olması, hiçbirinin bağsız kalmaması.

Slug çakışması yok: `tevhid` (kavram) ile `tevhid-ve-allah` (üst kavram) ayrı.

### B.2 Hesaplanan ilişkiler — BÜYÜK ÖLÇÜDE ZATEN VAR

Tasarım turunda "139 ilişki var, hesaplama eklenmeli" denmişti. Doğrulandı: **139 sayısı
elle yazılan kaynak dosyalarındı.** Hesaplama hattı `scripts/import/content.ts:622-659`
içinde zaten çalışıyor ve önerilen tasarımın neredeyse tamamını yapıyor:

- `concept_verse` üzerinde SQL self-join ile ortak ayet sayımı, `HAVING count(*) >= 3`
- **Kosinüs benzerliği** ile normalize (PMI değil — mevcut seçim korunur)
- **Kavram başına en yakın 6 komşu**
- **Elle yazılan çift kazanır**, hesaplanan onun üstüne yazılmaz
- Ağırlık eşiği: kosinüs ≥0.25 → 3, ≥0.12 → 2, altı → 1

Üretilen veride ölçülen gerçek graf (`public/data/concept/*.json`):

| Ölçüm | Değer |
|---|---|
| Tekil yönsüz çift | **543** |
| contrast / cause / part_of | 25 / 12 / 14 |
| co_occurrence (ağırlık 3 / 2 / 1) | 27 / 172 / 293 |
| Düğüm derecesi (min / medyan / maks) | 3 / 9 / **90** (`ilah`) |
| İlişkisiz kavram | **0** |

**Geriye kalan gerçek iş yalnızca ikisi:**

1. **`origin` ayrımı yok.** `staticConcept.relations[]` şu an `{slug, nameTr, type, weight}`
   taşıyor; bir bağın elle mi yazıldığı yoksa istatistikten mi geldiği **görünmüyor**.
   Arayüz hesaplanan bağı kaynaklı bağ gibi gösteriyor — `CLAUDE.md` kural 4'e aykırı.
   Şema eklemesi gerekiyor:

   ```sql
   CREATE TYPE relation_origin AS ENUM ('curated', 'computed');
   ALTER TABLE concept_relation ADD COLUMN origin relation_origin NOT NULL DEFAULT 'curated';
   ```

   `content.ts:622` elle yazılanlara `'curated'`, `:658` hesaplananlara `'computed'` yazar.
   Arayüz hesaplanan bağı **"birlikte geçiş (hesaplanmış)"** diye ayrı etiketler.

2. **`concepts_index.json` ilişki taşımıyor.** Atlas sayfası tek dosyadan okuyabilsin diye
   eklenir (§B.3).

**Bu bölümde yeni bir hesaplama yazılmayacak.** Mevcut kosinüs hattına dokunulmaz.

#### Atlas için çizim bütçesi

Düğüm derecesi maksimumu 90 (`ilah`). 543 çiftin hepsini çizmek saç yumağı üretir.
Atlasta çizilecek kenarlar ölçülen sayılarla sabitlenir:

| Kenar | Adet | Atlasta |
|---|---|---|
| contrast | 25 | **çizilir** — kiriş, en belirgin |
| part_of | 14 | **çizilir** — kiriş |
| cause | 12 | **çizilir** — kiriş |
| co_occurrence ağırlık 3 | 27 | **çizilir** — soluk yay |
| co_occurrence ağırlık 2 | 172 | yalnızca grup sayfasında |
| co_occurrence ağırlık 1 | 293 | yalnızca ego-grafta |

Atlas toplam **78 kenar / 101 düğüm** — okunur yoğunluk.

### B.3 `concepts_index.json` genişlemesi

`staticConceptsIndex.concepts[]` içine eklenecek alanlar:

```ts
parentSlug: slug.nullable(),          // zaten var
relations: z.array(z.object({         // YENİ — en fazla 6
  slug, type: conceptRelationType,
  weight: z.number().int().min(1).max(3),
  origin: relationOrigin,
})),
```

Böylece atlas sayfası 101 ayrı dosya yerine tek dosya okur. Dosya ~23 KB'tan tahminen
~45 KB'a çıkar; yalnızca build anında okunur, tarayıcıya gitmez.

### B.4 Görünüm — radyal taksonomi + kiriş

Koordinatlar **Astro sayfasında build anında** trigonometriyle hesaplanır. Ortak yardımcı:
`apps/web/src/lib/graf.ts`.

Yerleşim:
- 8 üst kavram, çember üzerinde ayet sayısına orantılı açı dilimlerine bölünür.
- Her grubun çocukları kendi diliminde, iç yarıçapta yay üzerine dizilir.
- Üçüncü seviye (`sirk`, `fisk`) ebeveyninin hemen dışında, kısa bir çıkıntıda.
- Düğüm yarıçapı `sqrt(verseCount)` ile ölçeklenir — alan orantılı olsun, büyük kavram
  ekranı yutmasın.
- Kenarlar §B.2'deki çizim bütçesine göre: 51 elle yazılmış bağ (contrast 25,
  part_of 14, cause 12) çemberin **içinden** kiriş olarak geçer — kontrol noktası
  merkez olan quadratic Bézier. Ağırlık 3 birlikte geçiş (27 çift) soluk yay olarak
  eklenir. Ağırlık 1 ve 2 atlasa **girmez**; toplam 78 kenar.
- Her düğüm `<a href="/kavram/<slug>">`.

Determinizm: yalnızca `Math.sin`/`Math.cos` ve veri sırası. Rastgelelik, zaman damgası
ve iterasyon yok.

**Sayfalar:**

| Rota | İçerik |
|---|---|
| `/kavramlar` | Radyal atlas (101 düğüm) + altında grup grup tam liste |
| `/kavram/grup/[slug]` | 8 grup sayfası: grubun alt grafiği, tanımı, tam listesi |
| `/kavram/[slug]` | Mevcut içerik korunur; üstüne **ego-graf** (kavram + en güçlü 6 komşu, tek halka) |

### B.5 Erişilebilirlik

- SVG `role="img"`, içinde `<title>` ve `<desc>`.
- Grafiğin **hemen altında** aynı veriyi taşıyan gerçek liste (plan §12 zorunlu
  alternatif). Liste grafiğin süsü değil, birincil içeriktir; grafik onun görsel özeti.
- Gruplar renk **ve konum** ile ayrılır — renk tek başına anlam taşımaz
  (mevcut `aria-current` kuralıyla aynı ilke).
- İki temada da kontrast denetlenir (`prefers-color-scheme`).
- Düğüm etiketleri SVG `<text>` olarak yazılır, görsel olarak gizlenmez; küçük ekranda
  atlas gizlenip yalnızca liste gösterilir (`@media`), grafik dekoratif hâle düşmez.

---

## 6. Bölüm C — İlkeler

### C.1 Alan katmanı — şema değişikliği gerekiyor

Kavramın aksine ilkede hiyerarşi alanı yok.

**Veri:** `data/principle_areas/area_<slug>.json` — 7 alan
(`slug`, `nameTr`, `nameAr`, `definition`, `order`, `sourceSlugs`).

**Şema zinciri:**

1. `packages/schema/src/content_input.ts` — yeni `principleAreaInput`;
   `principleInput`'a `areaSlug: slug` eklenir (zorunlu).
2. `infra/db/schema.sql`:
   ```sql
   CREATE TABLE principle_area (
     id        integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
     slug      text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
     name_tr   text NOT NULL,
     name_ar   text,
     definition text NOT NULL,
     "order"   smallint NOT NULL UNIQUE CHECK ("order" > 0)
   );
   ALTER TABLE principle ADD COLUMN area_id integer NOT NULL REFERENCES principle_area (id);
   ```
   `principle_area_source` ara tablosu, diğer kaynak tabloları kalıbıyla.
3. `scripts/import/content.ts` — `CONTENT_TABLES` dizisine `principle_area` ve
   `principle_area_source`, **`principle`'dan önce** (TRUNCATE CASCADE sırası ve FK).
4. `scripts/build/lib/content.ts` — alanları okur, `staticPrinciple.area` ve
   `staticPrinciplesIndex.principles[].areaSlug` olarak yazar; ayrıca
   `principle_areas.json` dizini üretir.
5. `apps/web/src/pages/ilkeler.astro` — 7 alana gruplanmış liste + radyal görünüm.

#### Tam eşleme (60 mevcut ilke → 7 alan)

| Alan (slug) | İlkeler | Adet |
|---|---|---|
| **Allah'a karşı** `allaha-karsi` | takva, sukur, zikir, dua, tevbe, tevekkul, umit-kesmeme | 7 |
| **İbadet** `ibadet` | *(yeni — C.2)* | 0 |
| **Nefis terbiyesi** `nefis-terbiyesi` | sabir, iffet, tevazu, ofkeyi-yutma, israftan-kacinma, kibirden-kacinma, temizlik | 7 |
| **Söz ve doğruluk** `soz-ve-dogruluk` | dogruluk, guzel-soz, yalandan-kacinma, giybetten-kacinma, iftiradan-kacinma, zandan-kacinma, tecessusten-kacinma, alay-etmeme, bilmedigini-soylememe, sozunde-durma, yemine-baglilik, haberi-arastirma, hakki-gizlememe, selamlasma | 14 |
| **Aile ve yakınlar** `aile-ve-yakinlar` | anne-babaya-iyilik, akrabaya-iyilik, eslere-iyi-davranma, cocuklari-oldurmeme, yetimi-gozetme, yetim-malini-koruma, komsu-hakki, ev-mahremiyeti | 8 |
| **Mal ve iktisat** `mal-ve-iktisat` | infak, gizli-sadaka, faizden-kacinma, haksiz-kazanctan-kacinma, olcude-durustluk, borcu-yazma, borcluya-muhlet, cimrilikten-kacinma, koleyi-azat, yolcuya-hak, basa-kakmama | 11 |
| **Toplum ve yönetim** `toplum-ve-yonetim` | adalet, adaletle-hukmetme, emanete-sadakat, istisare, iyiligi-emretme, baris-ve-uzlasma, savasta-olcululuk, esire-iyilik, dinde-zorlama-yok, ilim-ogrenme, hayirda-yarisma, affetme, ihsan | 13 |

Toplam 7+0+7+14+8+11+13 = **60**. Linter: alanı olmayan ilke build'i düşürür.

### C.2 İbadet ilkeleri

Namaz, oruç, zekât, hac yeni ilke dosyası olarak yazılır; her biri en az bir `primary`
dayanak ayeti ve en az bir kaynak taşır (`principleInput` zaten dayatıyor).

`principle."order"` **UNIQUE**. Yeni ilkeler 61–64 sırasıyla eklenir; mevcut 1–60
numaralandırması **değişmez** (kaymaz numaralandırma diff'i küçük tutar).

**Bot takvimine etkisi.** `scripts/build/lib/content.ts:582-615` takvimi
`usable.length` ile döndürüyor — 60 sabit değil. 64 ilkeyle rotasyon kendiliğinden
64'e geçer, kod değişmez. Sonuç: mevcut abonelerin gün→ayet eşlemesi kayar. Bu
beklenen davranıştır (takvim zaten her build'de yeniden üretiliyor, gönderim geçmişi
tutulmuyor — plan §19.2), ama `docs/DURUM.md` içindeki "366 gün, 60 ilke dönüşümlü,
239 farklı ayet" cümlesi yeni sayılarla güncellenmelidir.

Kurban ve gece namazı (teheccüd) **aday** olarak C.4 raporuna girer, doğrudan eklenmez.

### C.3 Emir/nehiy çifti

`oppositeSlug` 60'ta 4 dolu. Doldurulacaklar — yalnızca Kur'an'ın **aynı bağlamda
karşı karşıya koyduğu** çiftler:

| İlke | Karşıtı | Dayanak |
|---|---|---|
| dogruluk | yalandan-kacinma | 9:119, 22:30 |
| infak | cimrilikten-kacinma | 47:38, 3:180 |
| tevazu | kibirden-kacinma | 31:18, 17:37 |
| guzel-soz | alay-etmeme | 49:11, 17:53 |
| olcude-durustluk | haksiz-kazanctan-kacinma | 83:1-3, 4:29 |

**Zorlanmaz.** Çifti olmayan ilkede alan `null` kalır. `israftan-kacinma` ile
`cimrilikten-kacinma` karşıt değil, aynı ölçünün iki ucudur (25:67) — `oppositeSlug`
değil, ilke sayfasında ayrı bir "iki uç" notu olarak gösterilir.

### C.4 Kur'an taraması → aday raporu

**Önemli kısıt:** kelime verisinde morfoloji **yok**. `public/data/word/verse_*.json`
yalnızca `arabic`, `transcriptionTr`, `translationTr`, `rootArabic`, `rootLatin` taşıyor —
kip/POS etiketi yok. Emir kipi gramerden tespit edilemez.

**Metin kaynağı:** `apps/web/public/data/surah/surah_<1..114>.json`, ayet alanı
**`textUthmani`** (`arabic` değil).

**Normalizasyon — bu adım atlanırsa script sessizce sıfır sonuç verir.** Uthmânî
imlâda hareke ve küçük işaretler harflerin arasına giriyor; ham metinde düz kalıp
eşleşmesi çalışmaz. Doğrulanmış tarif:

```js
const strip = (s) => s.normalize("NFC")
  .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "") // hareke + küçük işaret + tatvil
  .replace(/[آأإٱ]/g, "ا")   // elif çeşitleri
  .replace(/ءا/g, "ا")        // ءَامَنُوا۟ → امنوا
  .replace(/ى/g, "ي")
  .replace(/\s+/g, " ").trim();
```

Tuzak: `ً` ile biten dar bir aralık kullanmak fatha/damma/kasra/şedde/sükûn
(`َ`–`ْ`) ve medde (`ٓ`) işaretlerini **kaçırır**; kalıplar tutmaz ve
hata vermeden 0 sonuç döner. Aralık `ً-ٟ` olmalıdır.

Yeni script `scripts/build/principle_candidates.ts` üç sinyali birleştirir:

1. **Arapça yapısal işaret** (normalize edilmiş düz metin eşleşmesi, morfoloji
   gerekmez). Sayılar 6236 ayet üzerinde ölçüldü:

   | Kalıp | Regex (normalize sonrası) | Ayet |
   |---|---|---|
   | "Ey iman edenler" ile **açılan** | `^يا?ايها الذين امنوا` | **88** |
   | "Ey insanlar" ile **açılan** | `^يا?ايها الناس` | **14** |
   | Nehiy | `(^\|\s)(ولا\|فلا) ت` | **285** |
   | "Farz kılındı" | `كتب عليكم` | **5** |

   88 hitabın neredeyse tamamı doğrudan emir ya da nehiy taşır; tarama için en
   yüksek sinyalli küme budur.
2. **Türkçe meal emir/nehiy kalıpları:** `-ın/-iniz`, `…mayın/…meyin`, `sakının`,
   `kaçının`, `…ediniz`. Varsayılan meal üzerinden.
3. **Kök kapsama farkı:** bu ayetlerin kökleri 60+4 ilkenin `rootLatin` kümesinde
   geçmiyorsa aday.

**Çıktı:** `reports/principle_candidates.md` — aday kök, dayanak ayetler, mevcut
ilkelerle örtüşme skoru, öneri adı.

**Script ilke YAZMAZ.** `data/` altına hiçbir dosya koymaz. Kullanıcı raporu okur,
onayladıkları kaynağıyla elle yazılır. `CLAUDE.md` kural 4 böylece korunur.

Gözle şimdiden görünen boşluklar (rapor bunları doğrulayacak):
fesattan kaçınma, haddi aşmama (i'tidâ), haksız yere cana kıymama, hırsızlık,
zinaya yaklaşmama, içki-kumardan kaçınma, kötülüğü iyilikle savma (41:34),
güzel cedel (16:125), yetimi azarlamama (93:9-10), fakiri doyurmaya teşvik (107:3).

### C.5 İlke ↔ kavram çapraz bağı — ZATEN VAR, iş yok

Tasarım turunda bunun eksik olduğu varsayılmıştı. Doğrulandı: **yanlış.** Bağ iki
yönde de kurulu ve ekranda:

- `apps/web/src/pages/kavram/[slug].astro:188-193` — "bağlı ilkeler" listesi.
- `apps/web/src/pages/ilke/[slug].astro:112-118` — "bağlı kavramlar" listesi.

Ölçülen kapsam:

| Ölçüm | Değer |
|---|---|
| Kavram bağı olan ilke | **60 / 60** |
| İlke başına ortalama kavram | 2.6 |
| İlkelerce anılan farklı kavram | **44 / 101** |

Anılmayan 57 kavram (ahiret, cennet, tevhid, vahiy, nubuvvet, kader…) ağırlıkla
itikadî ve uhrevî kavramlar; ahlâkî bir ilkeye bağlanmamaları **beklenen** durumdur,
eksiklik değil. Kapsamı yapay olarak artırmak için ilke–kavram bağı uydurulmaz.

C.2'deki dört ibadet ilkesi eklendiğinde `namaz`, `zekat` ve `ibadet` kavramları
kendiliğinden bu kümeye girer — 44 sayısı veri büyüdükçe artar, arayüz değişmez.

**Bu maddede yapılacak iş yoktur.** Uygulama sırasından çıkarıldı.

### C.6 İlke radyal görünümü

Kavramla aynı `graf.ts` yardımcısı: 7 alan halkada, ilkeler dışta, emir/nehiy çiftleri
çemberin içinden kiriş. `/ilkeler` sayfasında atlas + altında alan alan tam liste.

---

## 7. Uygulama sırası

| # | İş | Bağımlılık |
|---|---|---|
| 1 | Menü: `nav.ts`, `SiteNav.astro`, CSS, 3 hub sayfası, kicker/breadcrumb, tagline, sitemap | — |
| 2 | Kavram taksonomisi: 8 üst kavram dosyası, 101 `parentSlug`, `conceptInput` refine gevşetme, linter denetimi | — |
| 3 | `relation_origin` enum + `origin` sütunu + index genişlemesi (hesaplama ZATEN var, dokunulmuyor) | 2 |
| 4 | `graf.ts` + radyal atlas + grup sayfaları + ego-graf | 3 |
| 5 | İlke alan katmanı: şema zinciri, 7 alan dosyası, 60 eşleme, `ilkeler.astro` gruplama | — |
| 6 | İbadet ilkeleri (4 yeni) + `oppositeSlug` çiftleri + DURUM.md takvim güncellemesi | 5 |
| 7 | İlke radyal görünümü | 4, 5 |
| 8 | `principle_candidates.ts` → rapor → **kullanıcı onay turu** | 6 |

1, 2 ve 5 birbirinden bağımsız, paralel gidebilir. 8 kullanıcının karar turunu bekler.
(İlke ↔ kavram çapraz bağı sırada yoktu değil — C.5'te zaten kurulu olduğu
doğrulandığı için çıkarıldı.)

## 8. Doğrulama

- `pnpm lint:refs` — yeni linter denetimleri: her kavram bir üst kavrama bağlı;
  kökü olmayan kavramın çocuğu var; her ilkenin alanı var; hub slug'ları sure
  slug'larıyla çakışmıyor; `oppositeSlug` karşılıklı (A'nın karşıtı B ise B'nin de A).
- `pnpm typecheck` — `astro check`.
- `pnpm build` — tam zincir; `schedule.json` yeniden üretilir.
- Yeni duman testi `apps/web/src/lib/__tests__/graf.smoke.ts`: aynı girdi iki çağrıda
  aynı koordinatları veriyor mu (determinizm), düğümler görüş alanı dışına taşıyor mu,
  hiçbir düğüm çakışıyor mu.
- Elle: `/kavramlar` ve `/ilkeler` sayfalarında **JS baytı 0** kalmalı —
  `dist/` içinde ilgili HTML'de `<script>` etiketi bulunmamalı.
- Nav gzip boyut ölçümü (§A.7).
- `principle_candidates.ts` içinde normalizasyon denetimi: script, C.4 tablosundaki
  dört sayıyı (88 / 14 / 285 / 5) yeniden üretmezse **hata verip durur**. Sessiz sıfır
  sonuç bu tarama için en olası ve en görünmez hata biçimidir; sayılar kilit görevi görür.

## 9. Riskler

| Risk | Karşılık |
|---|---|
| Radyal atlas 101 düğümle mobilde okunmaz | Küçük ekranda atlas gizlenir, liste birincil kalır. Grup sayfaları asıl gezinme yolu. |
| Hesaplanan co-occurrence gürültü üretir | Kavram başına en güçlü 6 ile sınırlı; PMI eşiği raporlanır ve ayarlanır. Arayüzde ayrı etiket. |
| `principle.area_id NOT NULL` mevcut veriyi düşürür | 60 eşleme aynı commit'te girer; import atomiktir (TRUNCATE + yeniden yazım), yarım durum oluşmaz. |
| Bot takvimi kayar | Beklenen. Gönderim geçmişi tutulmuyor, imleç ilerliyor. DURUM.md güncellenir. |
| Taksonomi tartışmalıdır | Üst kavram bölümlemesi editoryal bir karardır; her üst kavram dosyası `sourceSlugs` taşır ve sayfada "bu bölümleme platform derlemesidir" notu görünür. |
