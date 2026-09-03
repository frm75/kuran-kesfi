# Kur'an-ı Kerim Keşif Platformu — Proje Promptu ve Planı

> Bu doküman, projenin geliştirici (insan veya AI ajan) için tam brifingidir.
> Amaç: Piyasadaki Kur'an sitelerinden farklı, keşif odaklı, ücretsiz ve reklamsız bir web uygulaması.
> Proje Allah rızası için, kâr amacı gütmeden hazırlanmaktadır.

---

## 1. Vizyon ve İlkeler

### 1.1 Vizyon
Kur'an'ı sure/ayet listesi olarak sunmak yerine; **harita, zaman, kavram ve kelime** eksenlerinde
gezilebilen, okuyucunun kendi keşfini yapmasına imkân veren bir platform.

### 1.2 Değişmez İlkeler
1. **Ücretsiz ve reklamsız.** Hiçbir modül ücretli olmayacak, reklam/sponsorlu içerik olmayacak.
2. **Üyeliksiz keşif, isteğe bağlı abonelik.** Sitenin tüm modülleri üyelik gerektirmez; kişisel veriler (notlar, ilerleme) yalnızca kullanıcının tarayıcısında saklanır. Tek istisna, kullanıcının kendi isteğiyle açtığı mesaj aboneliğidir (bkz. Bölüm 19); orada da yalnızca iletim için zorunlu asgari veri tutulur.
3. **Takip yok.** Analitik/izleme kodu, üçüncü taraf çerez, sosyal medya pikseli yok.
4. **Yorum yapılmaz, kaynak gösterilir.** Dersler, tefsir ve konum bilgileri güvenilir kaynaklardan derlenir; platform kendi yorumunu üretmez, hüküm çıkarmaz.
5. **Belirsizlik saklanmaz.** Tartışmalı konumlar, nüzul sırası farklılıkları ve meal ayrılıkları açıkça "muhtemel / rivayet / farklı görüş" olarak işaretlenir.
6. **Açık kaynak.** Kod ve elle hazırlanan veri (kıssa, konum, kavram) GitHub'da açık lisansla yayınlanır; katkıya açıktır.
7. **Bağımsız çalışır.** Harici API'ler yalnızca import aşamasında kullanılır; site kendi verisiyle statik çalışır.
8. **Erişilebilir ve hafif.** Mobil öncelikli, düşük bant genişliğinde çalışır, ekran okuyucu uyumlu.

---

## 2. Modüller

### 2.1 Kıssa Haritası (Öncelik 1)
Kur'an'daki kıssaların coğrafi ve kronolojik keşfi.

**İçerik**
- ~25 kıssa: Âdem, İdris, Nuh, Hud, Salih, İbrahim, Lut, İsmail, İshak, Yakub, Yusuf, Eyyub, Şuayb, Musa, Harun, Davud, Süleyman, İlyas, Elyesa, Yunus, Zekeriya, Yahya, Meryem, İsa, Muhammed (s.a.v.) dönemi olayları
- Kavim/kişi kıssaları: Ashab-ı Kehf, Zülkarneyn, Ashab-ı Fil, Sebe, Karun, Lokman, Ashab-ı Uhdud, Bahçe sahipleri, Hızır
- Her kıssa için: özet, geçtiği ayet aralıkları (kronolojik sıralı parçalar), muhtemel konumlar, çıkarılacak dersler, ilgili kavramlar

**Arayüz**
- Tam ekran harita (MapLibre GL), kıssalar pin olarak; aynı kıssanın ardışık konumları rota çizgisiyle bağlı
- Sol panel: kıssa listesi, tür filtresi (peygamber / kavim / kişi), zaman kaydırıcısı (Âdem → İsa → Asr-ı Saadet)
- Pin/kıssa seçildiğinde yan panel: özet, parçalar (tıklayınca ayet ve meal açılır), dersler (kaynaklı), konum güven derecesi ve kaynak notu
- Kıssayı "anlatı modu"nda okuma: dağınık ayetleri kronolojik sırayla art arda gösterme (Musa kıssası 30+ parça)

**Konum Güven Dereceleri**
- `kesin` — Kâbe, Medine, Kudüs gibi tartışmasız yerler
- `muhtemel` — çoğunluk görüşü ama kesin değil (Cudi, Sina bölgesi)
- `rivayet` — kaynaklarda geçen ama coğrafi olarak teyit edilemeyen (Kehf mağarası, Zülkarneyn seddi)

### 2.2 Nüzul Sırası ve Zaman Çizelgesi (Öncelik 2)
- Sureleri iniş sırasına göre gösteren interaktif çizelge; Mekke/Medine dönemleri renkli
- Siyer olaylarıyla eşleştirme: "Bu sure indiğinde ne oluyordu?"
- Mushaf sırası ↔ nüzul sırası geçiş düğmesi
- Standart (Mısır/Ezher) sıralama ana; Nöldeke sıralaması alternatif olarak seçilebilir; farklar işaretli

### 2.3 Meal Farkları Analizi (Öncelik 3)
- Bir ayetin tüm Türkçe meallerini yan yana gösterme
- Kelime düzeyinde farkları vurgulama: hangi Arapça kelime hangi mealde nasıl karşılanmış
- Farkın kaynağını gösterme: kök çok anlamlılığı, gramer tercihi, dipnot
- Meal seçimi: kullanıcı favori 3-5 mealini seçer, yerel olarak saklanır

### 2.4 Kavram Haritası (Öncelik 4)
- Ayetlerin kavramlar üzerinden ağ olarak keşfi
- Düğüm: kavram (sabır, şükür, tevekkül, adalet...); kenar: ilişki (birlikte geçme, sebep-sonuç, zıtlık)
- Kavrama tıklayınca ilgili ayetler, bağlı kavramlar, kök kelimeler
- Görselleştirme: force-directed graf (D3), mobilde liste görünümü

### 2.5 Kök Kelime Keşfi (Öncelik 5)
- Ayetteki her kelimeye tıklayınca: kök, kök anlamı, Kur'an'da geçiş sayısı, türevleri
- Kök ağacı görünümü: kökten türevlere, türevlerden ayetlere
- Arapça bilmeyenler için tasarlanmış: transkripsiyon + Türkçe karşılık her zaman görünür

### 2.6 Kişisel Okuma Günlüğü (Öncelik 6)
- Ayet notları, okuma ilerlemesi, işaretler
- Ezber takibi: aralıklı tekrar (spaced repetition) algoritmasıyla hatırlatma
- "Bu ayet hakkında 6 ay önce şunu yazmıştın" — geçmiş notların yeniden karşına çıkması
- Tamamen yerel (IndexedDB); dışa aktar/içe aktar (JSON) ile cihazlar arası taşıma

### 2.7 Klasik Okuma (Temel)
- Sure/ayet okuma, sayfa görünümü, meal seçimi, Arapça/transkripsiyon/meal gösterim seçenekleri
- Sesli dinleme (Türkçe meal sesi ve Arapça kıraat)
- Arama: ayet metni, meal metni, kök

---

## 3. Veri Kaynakları

| Veri | Kaynak | Lisans / Not |
|---|---|---|
| Arapça metin, sure/ayet metadata, sayfa, cüz, nüzul sırası | Tanzil.net | Açık lisans, atıf gerekli |
| Türkçe mealler (ana set, ~30) + dipnotlar | Açık Kuran API (api.acikkuran.com) | CC BY-NC-SA 4.0 — ticari olmayan kullanım uygun, atıf şart |
| Ek Türkçe mealler (Diyanet, Elmalılı, Ali Bulaç, Suat Yıldırım, Yaşar Nuri Öztürk, M. Esed, Gölpınarlı, Ö.N. Bilmen…) | Quran.com API / Tanzil çeviri seti | Her meal için ayrı lisans kontrolü |
| Kök kelimeler, türevler, kelime-kök eşleşmesi, Türkçe kök anlamları | Açık Kuran API (`/root`, `/verseparts`) | CC BY-NC-SA 4.0 |
| Morfoloji / gramer detayı | Quranic Arabic Corpus (corpus.quran.com) | GPL, atıf |
| Tefsir ve dersler | Diyanet Kur'an Yolu (kuran.diyanet.gov.tr), Elmalılı Hak Dini Kur'an Dili | Elmalılı kamu malı; Diyanet içeriği toplu kopyalanmaz — "özet + en fazla 200 karakter alıntı + kaynak link" modeli |
| Kıssa konumları | Siyer ve tarih kaynakları (birincil), Wikidata/OSM (yalnızca koordinat doğrulama) | Elle derleme, her konuma kaynak notu |
| Harita altlığı | OpenStreetMap / OpenFreeMap vektör tile | ODbL |
| Ses (Türkçe meal) | audio.acikkuran.com | CC BY-NC-SA 4.0 |
| Ses (Arapça kıraat) | everyayah.com, Quran.com açık kârî kayıtları | Her kârî için tek tek yazılı lisans kontrolü; belirsiz olan eklenmez |
| Kavram verisi | Kendi üretimimiz: Diyanet konu fihristi + kök verisi temelli | Açık lisansla yayınlanacak |

### 3.1 Meal Listesi

**Öncelikli mealler (varsayılan olarak açık gelir, import sırasında ilk çekilir ve doğrulanır):**
1. Diyanet İşleri — Kur'an-ı Kerim Türkçe Meali
2. Mehmet Okuyan — Kur'an Meal-Tefsir (dipnotlarıyla birlikte)
3. Mustafa İslamoğlu — Hayat Kitabı Kur'an
4. Muhammed Esed — Kur'an Mesajı

**Açık Kuran API'den gelen diğer Türkçe mealler (CC BY-NC-SA, doğrulandı):**
Elmalılı Hamdi Yazır (orijinal ve sadeleştirilmiş), Hasan Basri Çantay, Süleyman Ateş, Ali Bulaç,
Yaşar Nuri Öztürk, Bayraktar Bayraklı, Erhan Aktaş (yeni ve eski baskı), Süleymaniye Vakfı,
Ali Rıza Safa, Şaban Piriş, Ahmed Hulusi, Gültekin Onan, İbni Kesir (Türkçe).

**İngilizce (karşılaştırma amaçlı, Açık Kuran API):**
The Monotheist Group, Rashad Khalifa, Sam Gerrans, Aisha Bewley, Progressive Muslims.

**Quran.com / Tanzil setinden eklenecek adaylar (lisans tek tek kontrol edilecek, belirsiz olan girmez):**
Diyanet Vakfı, Suat Yıldırım, Abdulbaki Gölpınarlı, Ömer Nasuhi Bilmen, Edip Yüksel, Ali Fikri Yavuz,
Celal Yıldırım, Bekir Sadak, Ahmet Tekin, Ahmet Varol, Abdullah Parlıyan, Hayrat Neşriyat,
Seyyid Kutub (Fî Zılâl-il Kur'an meal kısmı).

**Hedef:** 25-30 Türkçe meal.

**Varsayılan seçim kuralı:** İlk açılışta 4 öncelikli meal karşılaştırmalı görünür. Kullanıcı istediğini
ekler/çıkarır; seçim yerel olarak (IndexedDB `settings.selected_authors`) saklanır. `author.is_default`
alanı bu 4 meal için `true` olur; `author.priority` alanı (1-4, diğerleri null) sıralamayı belirler.

**Telif Kuralı:** Yalnızca açık lisanslı veri setlerinde dağıtılan mealler kullanılır. Bunun dışındaki bir meal
eklenecekse hak sahibinden yazılı izin alınır. Her mealin altında kaynak ve lisans satırı gösterilir.
Ücretsiz/reklamsız olmak telif muafiyeti sağlamaz.

---

## 4. Veri Şeması

### 4.1 Kur'an Çekirdeği
```
surah
  id, name_tr, name_ar, name_en, slug, verse_count,
  revelation_type (mekki|medeni), revelation_order_standard,
  revelation_order_noldeke, page_start

verse
  id, surah_id, verse_number, text_uthmani, text_simple,
  text_no_vowel, transcription_tr, transcription_en, page, juz,
  sajda (bool)

author
  id, name, work_title, language, source (acikkuran|quran.com|tanzil|manual),
  license, license_note, url, is_default, priority (1-4 | null)

translation
  id, verse_id, author_id, text

footnote
  id, translation_id, number, text
```

### 4.2 Kelime / Kök
```
root
  id, latin, arabic, letters_transcription, meaning_tr, meaning_en,
  first_letter_id

root_diff
  id, root_id, form_arabic, occurrence_count

verse_part
  id, verse_id, sort_number, arabic, transcription_tr, transcription_en,
  translation_tr, translation_en, root_id (nullable), root_diff_id (nullable),
  grammar (jsonb)
```

### 4.3 Kıssa Katmanı
```
story
  id, slug, title, type (prophet|people|person|event), chronological_order,
  era_start, era_end (yaklaşık, metin), summary, cover_image,
  related_stories (id[])

story_passage
  id, story_id, order, title, surah_id, verse_start, verse_end,
  note (bu parçanın kıssadaki yeri)

story_lesson
  id, story_id, order, text, source_name, source_reference

location
  id, slug, name, modern_name, country, lat, lng,
  confidence (kesin|muhtemel|rivayet), source_note, alternatives (jsonb)

story_location
  story_id, location_id, order, event_description, passage_ids (id[])

story_concept
  story_id, concept_id
```

### 4.4 Kavram Katmanı
```
concept
  id, slug, name_tr, name_ar, definition, parent_id (nullable)

concept_verse
  concept_id, verse_id, weight (1-3), source

concept_relation
  source_concept_id, target_concept_id,
  relation_type (co_occurrence|cause|contrast|part_of), weight

concept_root
  concept_id, root_id
```

### 4.5 Siyer / Zaman Çizelgesi
```
timeline_event
  id, order, title, description, period (mekke_1|mekke_2|mekke_3|medine),
  approx_year, related_surah_ids (id[]), related_verse_ids (id[]),
  source_note
```

### 4.6 Kullanıcı Verisi (yalnızca tarayıcı — IndexedDB)
```
note          { id, verse_key, text, created_at, updated_at }
bookmark      { verse_key, created_at, label }
progress      { surah_id, last_verse, updated_at }
memorization  { verse_key, ease, interval_days, next_review_at, history[] }
settings      { selected_authors[], font_size, show_arabic, show_transcription, theme }
```
Dışa/içe aktarma: tek JSON dosyası.

---

## 5. Import Akışı

Tüm import scriptleri tekrar çalıştırılabilir (upsert), kaynak bazlı ayrı, oran sınırı için bekleme içerir.

1. **Tanzil** → `surah`, `verse` (Arapça metin, metadata, nüzul sıraları)
2. **Açık Kuran**
   - `/authors` → `author` (source=acikkuran, license=CC BY-NC-SA)
   - Her ayet için `/surah/{s}/verse/{v}/translations` → `translation`, `footnote`
   - `/rootchars` → `/rootchar/{id}` → `/root/{id}` → `root`, `root_diff`
   - Her ayet için `/surah/{s}/verse/{v}/verseparts` → `verse_part`
3. **Quran.com / Tanzil çevirileri** → eksik meallerin `author`/`translation`'a eklenmesi
   - Yazar adı normalize edilerek mükerrer engellenir
   - Lisans alanı her meal için doldurulur; lisansı belirsiz olan import edilmez
4. **Elle hazırlanan JSON** (`data/stories/*.json`, `data/locations.json`, `data/concepts/*.json`,
   `data/timeline.json`) → kıssa, konum, kavram, siyer tabloları
   - JSON şeması doğrulaması (zod/JSON Schema) import öncesi zorunlu
5. **Build** → PostgreSQL'den statik JSON parçaları üretilir:
   - `surah/{id}.json`, `verse/{s}-{v}.json` (tüm mealler + kelimeler)
   - `story/{slug}.json`, `stories-index.json`, `locations.json`
   - `concept/{slug}.json`, `concept-graph.json`
   - `roots/{latin}.json`, `roots-index.json`
   - `search-index.json` (istemci tarafı arama için)
6. Statik dosyalar CDN'e yüklenir; site sunucusuz çalışır.

---

## 6. Teknik Mimari

**Import ve veri**
- Node.js (TypeScript) import scriptleri; Tanzil = tek gerçek kaynak (source of truth), her şey `verse_id` ile ona bağlanır
- PostgreSQL (yalnızca build aşamasında kaynak veritabanı); üretimde veritabanı yok, site tamamen statik
- Repo: `/scripts/import/*`, `/data/*` (elle veri), `/scripts/build/*` → `public/data/*.json`
- Site build sırasında harici API'ye istek atmaz; tüm kaynak veri import aşamasında çekilip yerel cache'e alınır

**Frontend**
- Astro + TypeScript + Tailwind CSS; her modül ada (island) olarak yüklenir, ilk yükleme hedefi < 100 KB JS
- Harita: MapLibre GL JS, OpenFreeMap vektör tile (island, yalnızca harita sayfasında yüklenir)
- Graf: Cytoscape.js veya Sigma.js (D3 force yerine, daha hafif); mobilde otomatik liste + keşif yolu moduna düşer
- Yerel veri: Dexie.js (IndexedDB); ezber tekrarı için FSRS algoritması
- Arama: build aşamasında üretilen istemci indeksi (Pagefind veya FlexSearch); sunucuda arama yok;
  Türkçe normalizasyon (İ/i, ı/i, ş/s, ğ/g, ç/c, ö/o, ü/u); indeks sure/kök-harf bazlı parçalara bölünür, gzip uyumlu
- Stil: Arapça için Amiri Quran veya Scheherazade New (`font-display: swap`), Türkçe için okunabilir sans-serif;
  Arapça bloklar `dir="rtl"`, meal `ltr` — karışmaz
- PWA: kademeli önbellek (lazy caching) — kullanıcının okuduğu cüz/sure/kıssa önbelleğe alınır; "tümünü indir"
  isteğe bağlı ve depolama alanı kontrolüyle
- Erişilebilirlik: harita ve graf için zorunlu liste alternatifi; ekran okuyucu etiketleri; klavye navigasyonu

**Barındırma**
- Birincil: kullanıcının kendi sunucusu (Linux VPS) — Nginx/Caddy ile statik dosya servisi; bkz. Bölüm 21
- Alternatif/yedek: Cloudflare Pages + R2
- Maliyet hedefi: sıfıra yakın
- Alan adı: belirlenecek

**Dizin yapısı (öneri)**
```
/apps/web            Next.js site
/packages/schema     Paylaşılan tipler ve JSON şemaları
/scripts/import      Kaynak import scriptleri
/scripts/build       Statik JSON üretimi
/data/stories        Kıssa JSON'ları (elle)
/data/locations      Konum JSON'ları (elle)
/data/concepts       Kavram JSON'ları (elle)
/data/timeline       Siyer zaman çizelgesi (elle)
/docs                Bu doküman, katkı rehberi, veri girişi rehberi
```

---

## 7. Kullanıcı Arayüzü İlkeleri

- Ana giriş: klasik liste değil, dört keşif kapısı — **Harita / Zaman / Kavram / Kelime** — artı klasik okuma
- Her ekranda ayete tıklayınca aynı "ayet paneli" açılır: Arapça, transkripsiyon, seçili mealler, kelimeler, ilgili kıssa/kavram bağlantıları
- Belirsizlik görsel dille ifade edilir: kesin konum dolu pin, muhtemel konum kesikli halkalı pin, rivayet konum şeffaf pin
- Mobil: harita tam ekran, panel alttan kayan sayfa (bottom sheet)
- Karanlık mod, yazı boyutu, Arapça yazı tipi seçimi
- Sayfa yüklenmesi < 2 sn hedefi; sure JSON'ları lazy load

---

## 8. İçerik Üretim Kuralları (Kıssa / Ders / Kavram)

1. Her ders maddesi bir kaynağa bağlanır (`source_name`, `source_reference`). Kaynaksız ders eklenmez.
2. Ders metinleri kaynağın ifadesini özetler; yorum, güncel siyasi/toplumsal çıkarım eklenmez.
3. Konum girişinde en az bir kaynak ve güven derecesi zorunlu. Farklı görüşler `alternatives` alanına yazılır.
4. Kıssa parçaları (`story_passage`) kronolojik sırayla girilir; sıra tartışmalıysa `note` alanında belirtilir.
5. Kavram tanımları ansiklopedik ve mezhepler üstü tutulur; ihtilaflı konularda "farklı görüşler vardır" notu düşülür.
6. Tüm elle girilen veri PR ile gelir, en az bir gözden geçirme sonrası birleştirilir.

---

## 9. Geliştirme Fazları

**Faz 0 — Altyapı (1-2 hafta)**
- Repo, monorepo yapısı, şema tanımları, PostgreSQL şeması
- Tanzil + Açık Kuran import scriptleri
- Statik JSON build scripti
- Klasik okuma ekranı (sure/ayet/meal) — veri akışını doğrulamak için

**Faz 1 — Kıssa Haritası (3-4 hafta)**
- 3 örnek kıssa ile (Nuh, Yusuf, Musa) veri şeması ve JSON formatı netleştirilir
- Harita arayüzü, kıssa paneli, anlatı modu
- Kalan kıssaların veri girişi (paralel, katkıya açık)

**Faz 2 — Zaman Çizelgesi + Meal Farkları (2-3 hafta)**
- Nüzul sırası çizelgesi, siyer eşleştirme
- Meal karşılaştırma ve kelime düzeyi fark vurgulama

**Faz 3 — Kök Kelime + Kavram Haritası (3-4 hafta)**
- Kök ağacı arayüzü
- Çekirdek kavram seti (50-100 kavram) ve graf arayüzü

**Faz 4 — Günlük, PWA, Ses (2 hafta)**
- IndexedDB notlar, ezber tekrar, dışa/içe aktarma
- Çevrimdışı destek, ses oynatıcı

**Faz 5 — Yayın ve Topluluk**
- Açık kaynak yayın, katkı rehberi, veri giriş rehberi
- CONTRIBUTING.md'de açık kural: "Meal ekleme PR'ı kabul edilmez; yalnızca konum/kıssa/ilke/kavram verisi ve kod katkısı kabul edilir"
- "Kaynak Şeffaflığı" sayfası: her veri seti için nereden geldi, lisansı ne, ne zaman güncellendi
- Geri bildirim kanalı (e-posta / GitHub issues; takip kodu yok)

---

## 10. Geliştirici (AI Ajan) Çalışma Kuralları

- Önce plan, sonra kod. Her fazın başında yapılacaklar listesi sunulur, onay alınmadan kod yazılmaz.
- Değişiklikler küçük, gözden geçirilebilir parçalar halinde yapılır.
- Her import scripti tek başına çalıştırılabilir ve idempotent olmalıdır.
- Elle veri dosyaları için JSON şema doğrulaması kod yazılmadan önce tanımlanır.
- Harici API'lere üretimde bağımlılık eklenmez.
- Dinî içerikte yorum üretilmez; yalnızca kaynaklı içerik düzenlenir.
- Süreç sonunda açıklamalar kısa ve özet tutulur.

---

## 11. Açık Sorular (Karar Bekleyen)

- Alan adı ve proje adı
- Diyanet Kur'an Yolu tefsirinin kullanım şartları — yazılı izin gerekip gerekmediği
- Nüzul sırasında ana referans: Mısır/Ezher mi, Nöldeke mi (öneri: Ezher ana, Nöldeke alternatif)
- Kavram setinin ilk kaynağı: Diyanet konu fihristi mi, özgün derleme mi
- Arapça kıraat için hangi kârîler (lisans uyumlu olanlar arasından)
- ~~Katkı lisansı~~ → KARAR: çift lisans — kod MIT, `data/` klasörü CC BY-NC-SA 4.0 (Açık Kuran verisiyle uyum için zorunlu); elle üretilen kıssa/konum/ilke verisi de aynı lisansla
- Bağış/sunucu masrafı yaklaşımı: tamamen kişisel karşılama mı, şeffaf bağış sayfası mı
- Sure içi konu başlıkları (`surah_section`) için kaynak: Diyanet Kur'an Yolu bölümlemesi mi, başka bir tefsirin bölümlemesi mi, yoksa kaynaklı kendi derlememiz mi — kullanım izni ve atıf biçimi netleştirilecek

---

# 12. EK ÖNERİLER — KEŞİF DENEYİMİNİ GELİŞTİRME

Mevcut proje vizyonu, mimarisi, veri kaynakları, lisans kuralları ve dinî içerik ilkeleri korunacaktır.
Aşağıdaki özellikler mevcut sisteme eklenmelidir; mevcut mimariyle uyumlu olacak ve gereksiz karmaşıklık oluşturmayacaktır.

## 12.1 Ayetin Bağlamı
Standart ayet paneline **"Bağlam"** bölümü eklenir. Gösterilecekler: önceki 3 ayet, seçilen ayet, sonraki 3 ayet;
sure içindeki konu başlığı, önceki/sonraki konu; aynı konudaki diğer ayetler; ilgili kıssa, kavramlar, kök kelimeler.
Amaç: ayetin bağlamından kopuk değerlendirilmesini azaltmak, sure içi akışı görünür kılmak.

## 12.2 Gelişmiş Keşif Araması
Klasik metin aramasına ek **"Keşif Araması"**. "sabır", "Musa", "صبر", "Mısır" gibi sorgularda sonuçlar yalnızca metin
eşleşmesi değil; ayetler, kökler, kavramlar, kıssalar, sureler, ilgili ayetler, nüzul dönemi ve konumlar birbiriyle
ilişkili biçimde gösterilir. Veri ve frontend mimarisi ileride doğal dil sorgusunu ("Kur'an'da sabır nerelerde
anlatılıyor?") destekleyecek şekilde hazırlanır.

## 12.3 Kavramın Kur'an İçindeki Dağılımı
Kavram seçildiğinde: kaç ayette geçtiği, hangi surelerde, Mekke/Medine oranı (gerçek veriden hesaplanır), ilgili kök,
türevler, bağlantılı kavramlar, ilgili kıssalar. Basit grafiklerle görselleştirilir.

## 12.4 Ayetten Keşfe Geçiş
Ayet, bilgi ağının merkezidir. Her ayet panelinde tek tıkla geçiş: Kıssa, Kavramlar, Kök kelimeler, İlgili ayetler,
Nüzul, Konum, Sure, Zaman çizelgesi. Amaç: doğrusal "sure → ayet" sitesinden **Kur'an keşif ağına** dönüşmek.

## 12.5 Ayetler Arası İlişki Veri Modeli
```
verse_relation
  id, source_verse_id, target_verse_id,
  relation_type (direct_reference|same_context|same_topic|parallel_passage|explanation|example|
                 contrast|same_story|same_event|same_root|related),
  reason (ilişkinin gerekçesi: kavram/kök/konu/kıssa referansı — kullanıcıya gösterilir),
  reason_ref_type (concept|root|section|story|event|null), reason_ref_id,
  source_id, confidence (kesin|muhtemel|olasi), note
```
İlişki türleri birbirinden ayrı tutulur: "aynı konu ayeti" (same_topic/same_context) ile genel "ilgili" (related)
karıştırılmaz. `related` yalnızca diğer türlere girmeyen durumlar için kullanılır ve her zaman `reason` zorunludur.
Arayüzde her ilişkili ayetin yanında **neden ilişkili olduğu** gösterilir:
```
Bakara 153 → İlgili: Yusuf 90
  Neden? Sabır kavramı · aynı kök (ص ب ر) · aynı konu
```
Kaynak ve güven derecesi tutulur. AI tarafından önerilen ilişkiler kesin bilgi olarak gösterilmez; **"Olası ilişki"**
etiketiyle ayrı biçimde sunulur.

## 12.6 Rastgele "Keşfet" Özelliği
Ana sayfada belirgin **"Keşfet"** butonu. Her tıklamada rastgele bir ayet, kavram, kök, kıssa, konum veya nüzul olayı
"Bugünün Keşfi" kartı olarak sunulur; karttan ilgili ayetlere, köke ve kavramlara geçiş bağlantıları bulunur.

## 12.7 Keşif Yolculuğu
Kullanıcı bir kavram, ayet veya kıssadan başlayıp ilişkili bilgilere zincir halinde ilerler
(Sabır → Yusuf → Kuyu → Mısır → Tevekkül → Affetmek). Yol tarayıcıda yerel saklanır; sunucuda profil oluşturulmaz.

## 12.8 Keşif Geçmişi
IndexedDB'de `recent_discoveries` (son kıssa, kavram, ayet, kök, konum). Ana sayfada **"Kaldığın yerden devam et"**
alanı. Tamamen yerel; sunucuya davranış verisi gönderilmez.

## 12.8a Keşif Yolu Çubuğu (Breadcrumb)
Keşif ağı büyüdükçe kullanıcı yolunu kaybedebilir. Her ekranda küçük, sabit bir **"Keşif yolu"** çubuğu bulunur:
```
Bakara 153 › Sabır › Yusuf › Affetmek › Yusuf 92
```
- Her adım tıklanabilir; önceki herhangi bir noktaya dönülür, dönülen noktadan yeni dal açılır
- Yol, `discovery_paths` (IndexedDB) ile aynı yapıyı kullanır; sayfa yenilense de korunur
- Mobilde tek satır, kaydırılabilir; uzun yollarda ortası kısaltılır ("Bakara 153 › … › Yusuf 92")
- "Yolu temizle" ve "Yolu paylaş" (URL'ye kodlanmış adımlar, sunucu gerekmez)

## 12.8b Ayet Karşılaştırma Sepeti
Kullanıcı farklı ekranlardan ayetleri sepete ekleyip **"Karşılaştır"** diyebilir (en fazla 8 ayet).
```
Seçilen 4 ayet: Bakara 153 · Âl-i İmrân 200 · Yusuf 90 · Zümer 10
```
Karşılaştırma ekranında yan yana: Arapça, seçili 3-5 meal, ortak kökler, ortak kavramlar, ortak ilkeler,
ilgili kıssalar, nüzul dönemi (Mekke/Medine), aralarındaki `verse_relation` kayıtları.
Sepet IndexedDB'de tutulur (`comparison_basket`); URL ile paylaşılabilir (`/karsilastir?a=2:153,3:200,12:90,39:10`).

## 12.9 Görüş ve Belirsizlik Sistemi
"kesin / muhtemel / rivayet" sistemi konumların yanı sıra nüzul sırası, tarihsel olay, kıssa kronolojisi ve kavram
ilişkisi gibi alanlarda da kullanılır. Ana görüş / alternatif görüş / not yapısıyla gösterilir. Hiçbir ihtilaflı bilgi
kesin gerçek gibi sunulmaz.

## 12.10 Kaynak Şeffaflığı
Her kaynaklı bilginin yanında **[Kaynakları göster]**. Kaynaklar: ad, eser, yazar, bölüm/sayfa/ayet, URL, lisans
bilgileriyle saklanır.
```
source
  id, name, work_title, author, reference (bölüm/sayfa/ayet), url, license, note
```
`story_lesson`, `location`, `verse_relation`, `timeline_event`, `concept_verse`, `surah_section`, `principle`
tabloları bu tabloya `source_id[]` ile bağlanır.

**Ortak Kaynak Bileşeni (omurga):** Kaynak sistemi projenin omurgasıdır. Tüm ekranlarda aynı UI bileşeni
(`<SourceBadge>`) kullanılır ve her içerik için "Bu bilgi nereden geliyor?" tek tıkla cevaplanır.
İçerik her zaman şu üç sınıftan biriyle etiketlenir:
```
Kaynaklı bilgi      Diyanet Kur'an Yolu — Bakara Suresi, 153. ayet tefsiri
Alternatif görüş    Elmalılı Hak Dini — …
Platform verisi     Kendi veri derlememiz (kavram eşleştirmesi / bölümleme / ilişki)
```
Böylece kullanıcı Kur'an metni, meal, tefsir, tarihsel bilgi ve platformun kendi sınıflandırması arasındaki farkı
hiçbir zaman karıştırmaz. Bileşen olmadan kaynaklı içerik gösterilmez.

## 12.11 Gelişmiş Kelime / Meal Karşılaştırması
Arapça kelimeye tıklandığında: kök, Arapça form, transkripsiyon, Türkçe karşılık, Kur'an'daki kullanım sayısı, diğer
türevler, geçtiği ayetler ve seçilen meallerdeki karşılıkları tek görünümde (Kelime → Kök → Anlamlar → Meal 1..n).

## 12.12 Mushaf Modu
Sayfa bazlı görünüm: Arapça metin, ayet numaraları, sayfa geçişi, cüz ve sure bilgisi; geleneksel mushaf deneyimine
yakın. Lisansı uygun olmayan mushaf görseli kullanılmaz (metin Tanzil'den, sayfa düzeni kendi tipografimizle).

## 12.13 Minimal Okuma Modu
Modlar: Arapça / Arapça + Meal / Sadece Meal. Yazı boyutu, satır aralığı, Arapça yazı tipi ve tema ayarları korunur.

## 12.14 Çocuk Modu — Gelecek Faz
"Çocuklar İçin Kur'an Keşfi": kıssalar, haritalar, zaman çizelgesi, basitleştirilmiş anlatım, büyük görseller,
etkileşimli keşif. Ayrı içerik katmanı olarak yönetilir; ilk sürümde zorunlu değil.

## 12.15 Şema Ekleri (12. bölümün gerektirdiği)
```
surah_section
  id, surah_id, order, title, verse_start, verse_end,
  origin (source|platform), source_id (origin=source ise zorunlu), note

section_verse
  section_id, verse_id
  (bir ayet birden fazla konuya dahil olabilir; verse_start/verse_end ana aralık, section_verse istisnaları ve
   çakışmaları tutar)

Kurallar (12.1 için):
- Konu başlığı her zaman ayet aralığıyla tanımlanır
- Kaynaktan alınan başlık (`origin=source`) ile platformun ürettiği başlık (`origin=platform`) arayüzde
  farklı etiketle gösterilir; kaynak başlığın kaynağı her zaman görünür
- "Bu ayet hangi konunun içinde?" sorusu section_verse üzerinden cevaplanır; birden fazla konu varsa hepsi listelenir

verse_relation      (12.5 — yukarıda)
source              (12.10 — yukarıda)

IndexedDB ekleri:
  recent_discoveries { type, key, title, visited_at }
  discovery_paths    { id, steps[{type,key,title}], created_at }   (12.8a keşif yolu ile ortak)
  comparison_basket  { verse_keys[], updated_at }                    (12.8b)
```
Keşif araması için build aşamasında birleşik arama indeksi üretilir: `search-index.json` ayet, kök, kavram, kıssa,
sure, konum ve nüzul olaylarını tür etiketiyle içerir; Arapça köke göre arama için kök alanı normalize edilir.

---

# 13. AI Kullanım İlkeleri

AI platformun merkezinde "dinî yorumcu" olarak kullanılmayacaktır. Rolü: **yorumcu değil, kütüphaneci / keşif rehberi.**

AI:
- Yeni dinî hüküm üretmez
- Kaynaksız tefsir üretmez
- Ayet hakkında kendi yorumunu gerçek bilgi gibi sunmaz
- Kaynak olmayan bilgiyi kaynaklı gibi göstermez
- Mezhepsel/dinî bir görüşü tek doğru olarak sunmaz

AI yalnızca mevcut ve doğrulanmış veri üzerinde çalışır (kavram, kök, ayet, kıssa tabloları). AI üretimi içerik ile
kaynaklardan gelen içerik arayüzde açıkça ayrılır.

---

# 14. Ana Sayfa Bilgi Mimarisi

Ana sayfa klasik sure listesiyle başlamaz.

```
                    KUR'AN-I KERİM
                 KEŞFET • OKU • ANLA

       ┌─────────┬─────────┬─────────┬─────────┐
       │ HARİTA  │  ZAMAN  │ KAVRAM  │  KELİME │ İLKELER │
       └─────────┴─────────┴─────────┴─────────┴─────────┘
                  AYETTEN KEŞFE BAŞLA
                       [ KEŞFET ]
                    BUGÜNÜN KEŞFİ
       ┌────────────┬────────────┬────────────┐
       │   KISSA    │   KAVRAM   │    KÖK     │
       └────────────┴────────────┴────────────┘
              KALDIĞIN YERDEN DEVAM ET
                   KLASİK OKUMA
```

---

# 15. Temel Bilgi Mimarisi

Bütün keşif yollarının merkezinde **AYET** bulunur.

```
                         AYET
                           │
       ┌──────────┬────────┼────────┬──────────┐
     Kıssa      Kavram     Kök     Nüzul     Konum
       └──────────┴────────┼────────┴──────────┘
                    İLİŞKİLİ AYETLER
                    YENİ KEŞİF NOKTASI
```
Bu yapı tüm frontend ekranlarında tutarlı kullanılır.

---

# 16. Ek Özelliklerin Önceliklendirilmesi

**Öncelik 1:** Ayetin Bağlamı, Ayetten Keşfe Geçiş, Gelişmiş Keşif Araması, Ayetler Arası İlişki, Keşif Yolu Çubuğu, Ortak Kaynak Bileşeni
**Öncelik 2:** Rastgele Keşfet, Kavram dağılımı, Keşif geçmişi, Ayet Karşılaştırma Sepeti, Görüş/belirsizlik sistemi
**Öncelik 3:** Keşif Yolculuğu, Gelişmiş kelime/meal karşılaştırması, Mushaf Modu, Minimal Okuma
**Gelecek Faz:** Çocuk Modu, Kaynaklı AI keşif asistanı

Faz planına yansıması: Öncelik 1 maddeleri Faz 1-2'ye, Öncelik 2 Faz 3'e, Öncelik 3 Faz 4'e dağıtılır.

---

# 17. Geliştirme Kuralı

**Kapsam dondurma:** Bölüm 12-19 ile özellik kapsamı tamamlanmıştır. Yeni özellik önerileri ilk yayın sonrasına ertelenir; geliştirme mevcut kapsamın derinleştirilmesine odaklanır.

Yeni özellikler temel ilkeleri değiştirmez: ücretsiz, reklamsız, üyeliksiz, takipsiz, kaynaklı, belirsizlikleri açıkça
belirten, açık lisans kurallarına uyan, mobil öncelikli, hafif, mümkün olduğunca statik, kullanıcı verisini sunucuda tutmayan.

Sıra: önce veri modeli → kullanıcı akışı → arayüz → kodlama. Her modül mevcut veri kaynakları ve lisanslarıyla uyumlu olur.
Kaynaklı bilgi ile platformun ürettiği teknik/organizasyonel veri birbirinden ayrılır.


---

# 18. İlkeler Modülü — Kur'an'ın Tavsiye Ettiği İlkeler

## 18.1 Amaç
Kur'an'da doğrudan emredilen veya tavsiye edilen ahlaki/hayati ilkeleri (adalet, sabır, doğruluk, emanete sadakat,
infak, anne-babaya iyilik, ölçüde adalet, öfkeyi yutma, affetme, istişare, tevekkül, şükür, tevazu, sözünde durma,
iftiradan kaçınma, israftan kaçınma, komşu hakkı, yetimi gözetme vb.) tek bir modülde, kaynaklı ve ayet bağlantılı
biçimde sunmak.

## 18.2 Her İlke İçin İçerik
- İlke adı (Türkçe) ve Arapça anahtar kelime/kök
- Kısa tanım (kaynaklı: Diyanet Kur'an Yolu, Elmalılı, DİA — İslam Ansiklopedisi maddesi)
- Dayanak ayetler (birincil: doğrudan emir/tavsiye içeren; ikincil: ilkeyi örnekleyen)
- Açıklama: tefsirlerin ilkeyi nasıl ele aldığı, özet ve kaynaklı
- İlgili kıssalar (ilkenin yaşandığı örnek: Yusuf → affetmek, Eyyub → sabır)
- İlgili kavramlar (kavram grafına bağlantı)
- Karşıt/zıt ilke (adalet ↔ zulüm, şükür ↔ nankörlük)
- Günlük hayata dair uygulama notu — yalnızca tefsir/kaynak temelli, platform yorumu yok

## 18.3 İçerik Kuralları
- İlke listesi tefsir ve ansiklopedi kaynaklarından derlenir; platform kendi ilke icat etmez
- Her ilke en az bir doğrudan ayet dayanağıyla girilir
- Mezhepler üstü, hüküm çıkarmayan dil
- Bölüm 8 içerik üretim kuralları aynen geçerli

## 18.4 Veri Şeması
```
principle
  id, slug, name_tr, name_ar, root_id (nullable), definition, explanation,
  daily_note, opposite_principle_id (nullable), order, source_ids (id[])

principle_verse
  principle_id, verse_id, role (primary|secondary), note

principle_story
  principle_id, story_id, note

principle_concept
  principle_id, concept_id
```

## 18.5 Arayüz
- Ana sayfaya beşinci keşif kapısı: **HARİTA / ZAMAN / KAVRAM / KELİME / İLKELER**
- İlke listesi (kart görünümü), ilke detay sayfası, ayet panelinde "Bu ayetin ilkeleri" bağlantısı
- "Bugünün Keşfi" ve mesaj aboneliğinde (Bölüm 19) ana içerik kaynağı

## 18.6 Öncelik
Öncelik 1 (Faz 1-2): veri şeması ve ilk 30 ilke; kalanlar katkıyla genişler. Hedef 60-100 ilke.

---

# 19. Mesaj Aboneliği — Günlük/Haftalık Ayet ve İlke Gönderimi

## 19.1 Amaç
İsteyen kullanıcılara Telegram ve WhatsApp üzerinden günlük veya haftalık olarak bir ayet (Arapça + seçili meal),
bir ilke ve kısa kaynaklı açıklaması gönderen bot.

## 19.2 İlkelerle Uyum (zorunlu)
- Abonelik tamamen isteğe bağlıdır; site kullanımı için gerekmez
- Sunucuda yalnızca iletim için zorunlu veri tutulur: kanal (telegram|whatsapp), kanal kimliği (chat_id / telefon),
  sıklık, tercih edilen meal, saat dilimi, gönderim saati. İsim, e-posta, davranış verisi tutulmaz
- Tek komutla (`/dur`, "DUR") abonelik iptal edilir ve kayıt fiziksel olarak silinir
- Gönderilen içerik yalnızca kaynaklı veritabanı içeriğidir; AI üretimi metin gönderilmez
- Reklam, bağış çağrısı veya üçüncü taraf içerik gönderilmez
- KVKK aydınlatma metni abonelik akışında gösterilir

## 19.3 Kanal Stratejisi
**Aşama 1 — Telegram (önce):** Bot API ücretsiz, onay gerektirmez, kullanıcı botu kendisi başlatır (`/start`),
yalnızca chat_id saklanır. Uygulama ve dağıtım en düşük maliyet/risk.

**Aşama 2 — WhatsApp:** WhatsApp Business Platform (Cloud API) gerektirir: Meta Business doğrulaması, şablon mesaj
onayı, konuşma başına ücret, telefon numarası saklama zorunluluğu. Telegram kanalı stabil olduktan sonra eklenir;
maliyet ve KVKK yükü (telefon numarası kişisel veridir) ayrıca değerlendirilir. Resmi olmayan WhatsApp kütüphaneleri kullanılmaz (hesap kapanma riski).

**Ek kanal (opsiyonel):** E-posta bülteni ve web push — aynı içerik motoru, aynı abonelik tablosu.

## 19.4 Abonelik Akışı
```
Site → "Günlük ayet al" → kanal seç
  Telegram: t.me/<bot>?start=<token> → bot /start → sıklık ve meal seçimi → onay
  WhatsApp: numara gir → doğrulama kodu → sıklık ve meal seçimi → onay
Bot komutları: /gunluk /haftalik /meal /saat /dur /yardim
```

## 19.5 İçerik Motoru
- Yıllık gönderim takvimi build aşamasında üretilir (`schedule.json`): her gün için ayet + ilke eşleşmesi;
  ilkeler dönüşümlü, ayetler ilkeyle bağlantılı (`principle_verse`), tekrar etmeyecek şekilde
- Özel günler (Ramazan, Kandiller, Kurban) için tematik seçim
- Haftalık abonelere haftanın ilkesi + 3 ayet özeti
- Mesaj şablonu: Arapça, seçili meal, ilke adı, 2-3 cümle kaynaklı açıklama, siteye derin bağlantı
  (ayet paneli / ilke sayfası)

## 19.6 Teknik
- Bot servisi: Node.js (grammY Telegram; WhatsApp Cloud API resmi SDK)
- Depolama: küçük PostgreSQL veya SQLite (`subscription` tablosu); site statik kalır, bot ayrı küçük servis
- Zamanlayıcı: cron; saat dilimine göre toplu gönderim
- Barındırma: Cloudflare Workers + D1 veya küçük VPS; maliyet hedefi aylık birkaç dolar
- Günlük içerik siteyle aynı `schedule.json`dan okunur; içerik tek kaynaktan yönetilir

```
subscription
  id, channel (telegram|whatsapp|email|push), channel_id, frequency (daily|weekly),
  author_id (meal), timezone, send_hour, created_at, last_sent_at, active

  -- tekrar önleme için ayrı log tutulmaz; abonelik kaydında yalnızca:
  schedule_cursor (yıllık takvimdeki son gönderilen gün indeksi), last_sent_at
```
Gönderim takvimi (`schedule.json`) deterministik olduğundan kullanıcı başına içerik geçmişi saklamaya gerek yoktur;
imleç ilerletilir, hata durumunda aynı gün yeniden denenir. Kişisel veri minimizasyonu için kullanıcıya hangi ayetin
gönderildiği kalıcı olarak kaydedilmez.

## 19.7 Öncelik
Telegram botu Faz 3; WhatsApp Faz 5 (yayın sonrası). İlkeler modülü (Bölüm 18) botun ön koşuludur.


---

# 20. Teknik Standartlar

## 20.1 Veri Bütünlüğü ve Import
- **Referans linter:** `scripts/build` içinde zorunlu adım — `data/**` altındaki tüm ayet referansları (`2:153`,
  `12:4-6`), kavram/kök/kıssa/ilke slug'ları ve `source_id`'ler veritabanına karşı doğrulanır (Zod + JSON Schema).
  Hatalı veya var olmayan referans varsa build başarısız olur.
- **Tek gerçek kaynak:** Tanzil sure/ayet numaralandırması; Diyanet mushaf sayfa/cüz kaymaları `verse` tablosunda
  ayrı alanla tutulur, hiçbir tablo ayet numarasını metin olarak saklamaz, hep `verse_id`.
- **Kök normalizasyonu:** Corpus/Açık Kuran kök eşleştirmesinde illetli harfler (ا و ي), hemze dönüşümleri,
  şedde/idğam ve hareke farklılıkları için ayrı normalizasyon katmanı (`scripts/import/lib/arabic_normalize.ts`);
  düz string/regex eşleşmesine güvenilmez. Eşleşmeyen kelimeler rapor dosyasına yazılır, sessizce atlanmaz.
- **Kaynak nezaketi:** Yapay `sleep` kullanılmaz; ancak Açık Kuran gönüllü bir servistir — eşzamanlılık `p-limit`
  ile 5-10 paralel istekle sınırlanır, her kaynak tek seferlik çekilip `cache/` altına alınır, tekrar import cache'ten
  çalışır. Repo'da hazır dump varsa önce o kullanılır.
- **İdempotent import:** Her script tek başına ve tekrar çalıştırılabilir (upsert); bir kaynağın hatası diğerini durdurmaz.
- **Tekrarlanabilir build:** `pnpm import && pnpm build` sıfırdan aynı çıktıyı üretir.

## 20.2 İsimlendirme
- Statik JSON dosyaları ve kaynak dosya adları: alt çizgi — `verse_2_153.json`, `story_yusuf.json`, `root_Sbr.json`
- URL slug'ları: tire — `/yusuf-suresi/90`, `/kissa/hz-yusuf`, `/ilke/sabir` (SEO ve okunabilirlik)
- Veritabanı: snake_case; TypeScript: camelCase; bileşenler: PascalCase
- Dil: kod ve tanımlayıcılar İngilizce, kullanıcıya görünen metin Türkçe

## 20.3 Görsel Üretim Kuralları
- Peygamber, sahabe, melek ve insan figürü tasvir edilmez. Kıssa kapakları ve tüm görseller: manzara, mimari,
  doğa, hat sanatı, geometrik/soyut desenle sınırlıdır.
- AI ile üretilecek görsellerin promptları yalnızca İngilizce yazılır (render sadakati için); prompt'a "no human
  figures, no faces, no text" kısıtı her zaman eklenir.
- Üretilen görseller `data/images/` altında kaynak/prompt notuyla saklanır; lisansı belirsiz stok görsel kullanılmaz.

## 20.4 Performans Bütçesi
- İlk yükleme: < 100 KB JS, < 200 KB toplam (fontlar hariç)
- LCP < 2 sn (3G), CLS < 0.1
- Sure JSON'ları ve ses dosyaları lazy; harita/graf kütüphaneleri yalnızca ilgili sayfada
- Görseller WebP/AVIF, `loading="lazy"`, boyut belirtilmiş

---

# 21. Sunucu Kurulumu ve Dağıtım

Site kullanıcının kendi Linux sunucusuna kurulacaktır. Sunucuda başka uygulamalar da çalışmaktadır.

## 21.1 Port ve Kaynak Çakışması Kuralları (zorunlu)
- Kuruluma başlamadan önce `ss -tlnp` / `netstat -tlnp` ile kullanımdaki portlar listelenir ve rapor edilir.
- Hiçbir port varsayılan olarak sabit kodlanmaz; tüm portlar `.env` üzerinden gelir (`SITE_PORT`, `BOT_PORT`, `DB_PORT`).
- Önerilen aralık: 80/443 zaten reverse proxy'de ise site 4321+ aralığından boş bir port seçer; bot servisi ayrı
  boş port; PostgreSQL yalnızca build makinesinde, üretim sunucusunda gerekmiyorsa kurulmaz.
- Mevcut Nginx/Caddy/Apache varsa yeni bir tane kurulmaz; mevcut proxy'ye yeni `server`/site bloğu eklenir.
  Mevcut yapılandırma dosyaları değiştirilmeden önce yedeklenir (`*.bak.<tarih>`).
- Mevcut PostgreSQL/Redis varsa yeni instance kurulmaz; ayrı veritabanı/kullanıcı açılır.
- Systemd servis adları proje ön ekiyle (`kuran-site`, `kuran-bot`) verilir; genel adlar kullanılmaz.
- Cron/timer tanımları da aynı ön ekle; mevcut cron'lara dokunulmaz.
- Kurulum sonunda kullanılan port, servis ve dosya yolları `docs/DEPLOY_REPORT.md`'ye yazılır.

## 21.2 Dağıtım Yapısı
```
/opt/kuran/               proje kökü (repo klonu)
/opt/kuran/dist/          Astro build çıktısı — proxy buraya yönlenir
/opt/kuran/bot/           Telegram bot servisi (Faz 3)
/opt/kuran/.env           portlar, bot token, yollar (repo'ya girmez)
/etc/nginx/sites-available/kuran.conf   veya Caddyfile bloğu
```
- Statik site: Nginx/Caddy doğrudan `dist/` servis eder; Node süreci gerekmez
- Bot: systemd ile çalışan tek Node süreci, `.env`'den port
- HTTPS: mevcut sertifika yönetimi (certbot/Caddy otomatik) kullanılır
- Güncelleme: `git pull && pnpm install && pnpm build` → `dist/` atomik olarak değiştirilir (önce `dist_new`, sonra `mv`)

## 21.3 Güvenlik
- Sunucuda kullanıcı verisi yok (bot aboneliği hariç, ayrı DB/tablo)
- Bot token ve tüm sırlar `.env`'de, dosya izni 600
- Firewall'da yalnızca proxy portu dışa açık; bot ve iç servisler localhost'a bağlı

---

# 22. Arayüz Tasarım Yönü

Arayüz "güzel" olmalı: sakin, okumaya odaklı, dinî içeriğe yakışır bir ağırbaşlılık; klişe "İslami site" kalıplarından
(yeşil-altın, aşırı süsleme, stok cami görselleri) uzak.

- **Karakter:** Modern, minimal, tipografi odaklı. Ana renk paleti nötr (kağıt tonu / koyu lacivert-gri) + tek vurgu
  rengi. Karanlık mod birinci sınıf vatandaş.
- **Tipografi hiyerarşisi:** Arapça metin büyük ve rahat satır aralığıyla (Amiri Quran / Scheherazade New); meal ve
  açıklamalar okunabilir sans-serif; ilke/kavram başlıkları için karakterli bir serif kabul edilebilir.
- **Boşluk:** Cömert padding, tek sütun okuma genişliği (~65-75 karakter), gereksiz kutu/çerçeve yok.
- **Hareket:** Harita uçuşları ve panel geçişleri yumuşak ama kısa (200-300 ms); `prefers-reduced-motion` saygı görür.
- **Bileşen tutarlılığı:** Ayet paneli, kaynak rozeti, güven rozeti, keşif yolu çubuğu tüm sayfalarda aynı bileşen.
- **Mobil:** Alttan kayan panel, tek elle ulaşılabilir birincil aksiyonlar, haritada büyük dokunma hedefleri.
- **Süsleme:** Yalnızca geometrik/soyut desen, ince hat detayı; figür yok (bkz. 20.3).
- Kod yazmadan önce tasarım dili (renk token'ları, tip ölçeği, boşluk ölçeği) `docs/DESIGN.md`'de tanımlanır ve onay alınır.
