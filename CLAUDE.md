# CLAUDE.md — Kur'an-ı Kerim Keşif Platformu (Ana Site)

Bu dosya Claude Code için ana site projesinin talimatıdır. Tam plan `docs/PROJE_PLANI.md` dosyasındadır;
her oturumun başında o dosyayı oku. Plan ile bu dosya çelişirse plan geçerlidir.

Bu proje sunucuda çalışacak asıl web uygulamasıdır. Hoca notu çıkarımı ayrı bir proje olarak yerel
bilgisayarda çalışır (`kuran-extract`) ve buraya JSON dosyalarıyla veri aktarır.

## Proje Özeti
Ücretsiz, reklamsız, üyeliksiz, takipsiz, açık kaynak bir Kur'an keşif sitesi. Harita / Zaman / Kavram / Kelime /
İlkeler eksenlerinde keşif; merkezde AYET. Allah rızası için hazırlanmaktadır; kâr amacı yoktur.

## Domain ve Marka
- **Alan adı:** `kurankesfi.tr` (alındı) — plan §11 açık sorusu kapandı, §6 barındırma satırı güncellendi
- **Proje adı:** Kur'an-ı Kerim Keşfi
- **Tagline:** Keşfet • Oku • Anla
- Marka renkleri ve tipografi `docs/DESIGN.md`'de; kod içinde marka rengi sabitlenmez, token üzerinden gelir

## Çalışma Kuralları (kesin)
1. **Önce plan, sonra kod.** Her görevde önce yapılacaklar listesi ve etkilenecek dosyalar sunulur; kullanıcı
   onaylamadan kod yazılmaz veya dosya değiştirilmez.
2. **Kısa özet.** İş bitince açıklama 3-5 satırı geçmez: ne yapıldı, ne değişti, sıradaki adım.
3. **Küçük adımlar.** Tek seferde tek modül/tek script; büyük yeniden yazım yapılmaz.
4. **Platform kendi editoryal yorumu üretmez.** Tefsir, meal, hoca açıklaması — hepsi bir kaynağa bağlı yorumdur;
   platform bunları kaynağıyla gösterir, tek doğru gibi sunmaz, farklı görüşleri yan yana verir. Kaynağı olmayan
   içerik `data/` altına girmez.
5. **Harici API'ye üretimde bağımlılık yok — ağır medya hariç (2026-09-05'te daraltıldı).** Site build'i
   internet gerektirmez; import scriptleri ayrıdır. Tek istisna ağır medyadır: ses, video ve PMTiles harita
   altlığı Cloudflare R2'de durur ve `medya.kurankesfi.tr` üzerinden gelir (repoya da release dizinine de
   girmez — gigabaytları her deploy'da kopyalamak olurdu). **İstisnanın şartı: R2 düşerse site düşmez.**
   Sayfa metni, meal, ayet ve statik SVG harita R2'siz çalışmaya devam eder; bozulan yalnızca medyadır.
   Her medya bileşeni bu varsayımla yazılır. Erişim `pub-*.r2.dev` ile değil kendi alan adımızla; böylece
   sağlayıcı değişimi tek DNS kaydına iner. Yükleme: `pnpm media:r2:push` (`scripts/media/r2_sync.ts`).
6. **Lisans:** Kod MIT, `data/` CC BY-NC-SA 4.0.
   "Lisansı belirsiz meal, ses, görsel veya tefsir eklenmez" kuralı **kaldırıldı**
   (kullanıcı kararı 2026-09-06). Hangi mealin ekleneceğine kullanıcı karar verir;
   ajan bunu gerekçe göstererek bir meali reddetmez. Atıf yükümlülüğü ayrı bir
   maddedir ve kalkmadı (bkz. aşağıdaki atıf kuralı).
7. **Kapsam dondurulmuştur.** Planda olmayan özellik önerilmez; öneri varsa "ilk yayın sonrası" notuyla
   `docs/BACKLOG.md`'ye yazılır.
8. **Peygamberlerin yüzü gösterilmez.** Kural budur, fazlası değil (kullanıcı kararı 2026-09-06).
   Önceki "hiç figür olmasın" yasağı **kaldırıldı**: insan figürü, siluet ve uzaktan kalabalık
   serbesttir. Yasak yüzedir — bir peygamberin yüzü seçilir hâlde gösterilmez. Ayrıntı ve
   tarama alışkanlığı için Arayüz bölümündeki "Görsel ve VİDEO kuralı" maddesine bak.

## Stack
- Astro + TypeScript + Tailwind (statik export, island mimarisi, ilk yükleme < 100 KB JS)
- MapLibre GL (harita), Cytoscape.js (graf), Dexie (IndexedDB), FSRS (ezber), Pagefind/FlexSearch (arama)
- Import: Node.js/TypeScript scriptleri + PostgreSQL (yalnızca build makinesinde)
- Bot: Node.js (grammY), systemd servisi, ayrı küçük DB
- Paket yöneticisi: pnpm

## Dizin Yapısı
```
apps/web/            Astro site
packages/schema/     Zod şemaları + PostgreSQL/SQLite migration üreticileri (yerel proje ile ORTAK)
scripts/import/      Kaynak import (tanzil, acikkuran, quran_com, corpus)
scripts/build/       PostgreSQL → public/data/*.json + referans linter
scripts/sync/        Yerel projeden gelen JSON paketlerini içeri alır (inbox/ → DB)
data/stories/        Kıssa JSON (elle, kaynaklı)
data/locations/      Konum JSON
data/concepts/       Kavram JSON
data/principles/     İlke JSON
data/timeline/       Siyer zaman çizelgesi
cache/               İndirilen ham kaynak veri (git'e girmez)
inbox/               Yerel projeden gelen scholar_notes_*.json paketleri (git'e girmez)
bot/                 Telegram bot servisi
docs/                PROJE_PLANI.md, DESIGN.md, DEPLOY_REPORT.md, BACKLOG.md
```

## İsimlendirme
- JSON dosyaları: alt çizgi (`verse_2_153.json`); URL slug: tire (`/yusuf-suresi/90`)
- DB: snake_case · TS: camelCase · Bileşen: PascalCase · Kod İngilizce, UI metni Türkçe

## Veri Kuralları
- Tanzil = tek gerçek kaynak; her tablo `verse_id` ile bağlanır, ayet numarası metin olarak saklanmaz
- `scripts/build` içindeki referans linter geçmeden build tamamlanmaz
- Kök eşleştirme `scripts/import/lib/arabic_normalize.ts` üzerinden; eşleşmeyenler rapora yazılır
- Import'ta yapay `sleep` yok; `p-limit` ile 5-10 paralel; tek seferlik çekim → `cache/`
- Öncelikli mealler: Diyanet İşleri, Mehmet Okuyan, Mustafa İslamoğlu, Muhammed Esed (`author.priority` 1-4)
- Diyanet tefsiri: özet + ≤200 karakter alıntı + link; toplu kopya yok
- Her kaynaklı kayıt `source_id` taşır; `<SourceBadge>` bileşeni olmadan kaynaklı içerik render edilmez
- **Güven dereceleri İKİ AYRI enum** (2026-09-06); ihtilaf saklanmaz, gösterilir
  - Konum: `kesin | muhtemel | gelenek | tartismali` (`locationConfidence`)
  - Kronoloji ve ayet ilişkisi: `kesin | muhtemel | rivayet` (`confidence`)
  - Birleştirilmez: bir olayın tarihi "tartışmalı" olabilir ama "gelenek" olamaz — gelenek bir YER
    TESPİTİ türüdür. `rivayet` konumda kalktı çünkü iki ayrı durumu aynı kefeye koyuyordu:
    "kaynaklar tek yer söylüyor, teyit yok" (Cûdî, Nînevâ) ile "kaynaklar dört ayrı aday sayıyor"
    (Kehf mağarası, Zülkarneyn seddi). `packages/schema/src/common.ts` ve `infra/db/schema.sql`'de
    ayrı tür (`location_confidence`); `scholar-notes.ts`'in "ASLA birleştirilmez" kuralıyla aynı gerekçe

## Yerel Proje (kuran-extract) ile Uyum
Hoca notları ayrı bir yerel projede çıkarılır ve JSON paketiyle bu projeye aktarılır.

- **Ortak şema:** `packages/schema/` her iki proje tarafından kullanılır. Zod tipleri değişince iki taraf da güncellenir.
- **İki migration:** Aynı Zod tiplerinden hem `migrations/postgres/*.sql` hem `migrations/sqlite/*.sql` üretilir.
  PostgreSQL: `SERIAL`, `JSONB`, `TIMESTAMPTZ`. SQLite: `INTEGER PK`, `TEXT` (JSON/ISO datetime).
- **İş anahtarları:** Sync için otomatik artan ID değil, iş anahtarları kullanılır:
  `scholar.slug`, `video_source.video_id`, `scholar_note` için `(scholar_slug, video_id, segment_start_sec, note_type)`
- **Inbox akışı:** Yerel projeden gelen `inbox/scholar_notes_YYYY-MM-DD.json` + `.sha256` → `scripts/sync/import_notes.ts`
  hash doğrular → Zod ile parse eder → idempotent upsert → rapor (yeni/güncel/hatalı sayısı).
- **Bilinmeyen referans:** JSON'daki `linked_verses`/`linked_principles`/`linked_concepts` slug'ları DB'de yoksa
  import başarısız olur, dosya `inbox/rejected/` altına taşınır, hata raporu yazılır.
- **Silinen videolar:** Paket içinde `status=archived` gelen notlar yayından çıkar; kayıt silinmez, işaretlenir.

## Sunucu Kurulumu — Port Çakışması (kesin)
Sunucuda başka uygulamalar çalışıyor. Herhangi bir kurulum/servis işleminden önce:
1. `ss -tlnp` çıktısını al, kullanılan portları listele ve kullanıcıya göster
2. Hiçbir portu sabit kodlama; `.env` → `SITE_PORT`, `BOT_PORT`, `DB_PORT`; boş port seçip onay al
3. Mevcut Nginx/Caddy/PostgreSQL/Redis varsa yenisini kurma; mevcut yapıya blok/DB ekle
4. Değiştirilecek her yapılandırma dosyasını önce `*.bak.<tarih>` olarak yedekle
5. Servis ve cron adları `kuran-` ön ekiyle
6. Kurulum sonunda `docs/DEPLOY_REPORT.md`'ye port, servis, yol ve yedek listesini yaz

Dağıtım kökü: `/opt/kuran/`, build çıktısı `/opt/kuran/dist/`, güncelleme atomik (`dist_new` → `mv`).

## Oturum devri
**`docs/DURUM.md` bağlam sıfırlandığında ilk okunacak dosyadır**: yayındaki modüller, komut sırası,
yapılmayanlar ve NEDENİ, bir kez yaşanmış tuzaklar, sıradaki adımlar. Büyük bir iş bitince güncellenir.

## Arayüz
- **`docs/DESIGN.md` tasarım sisteminin tek kaynağıdır.** Renk token'ları, tip ölçeği, boşluk/yuvarlaklık/gölge
  ölçekleri, hareket süreleri, ortak bileşen anahtarları ve landing bölüm şablonu orada tanımlıdır. Bileşen
  yazmadan önce okunur; hex/px değeri koda gömülmez, token'dan gelir. DESIGN.md değişecekse önce onay alınır
- Palet: mürekkep laciverdi `#071023` + pirinç `#C9A253`; açık modda parşömen `#EFE6D3` (DESIGN.md §1).
  Altın **zemin** rengidir; metin ve anlam taşıyan kenarlık `--accent-text` kullanır (açık modda altın 2,45:1)
- İkincil vurgu firuze `#449C93` — marka rengi değil, yalnızca "alternatif görüş" ve keşif ağı şemasında
- Tipografi: başlık Cormorant Garamond, gövde Karla, meal Source Serif 4, Arapça Amiri Quran (DESIGN.md §2)
- Sakin, tipografi odaklı, karanlık mod birincil; açık mod aynı paletten türetilir
- Klişe "İslami site" estetiği (yeşil-altın, stok cami görseli, aşırı süs) kullanılmaz
- Fontlar kendi sunucumuzdan servis edilir; Google Fonts CDN kullanılmaz (takip yok, üretimde harici bağımlılık yok)
- **Yeni Latin fontu seçilmeden önce çeviriyazı kapsaması ölçülür.** Karla ḳ ẕ ḥ ḫ ṣ ḍ ŝ ṭ taşımıyor;
  eksikler 2,3 KB'lık "Kesif Latin Ek" yama fontuyla kapatıldı. `pnpm --filter @kuran/fonts fonts:verify`
  HarfBuzz ile yakalar — bu komut geçmeden font değişikliği birleştirilmez
- **JavaScript 0 bayt.** Sunucu CSP'si `default-src 'none'`; betik sessizce engellenir. Betik gerektiren
  bir tasarım öğesi JS'siz karşılığıyla kurulur (statik SVG, `<details>`, CSS `:focus-within`).
  Gerçekten gerekiyorsa önce CSP'ye `script-src 'self'` girer ve bu ayrıca onaylanır
- **CSP değişirse canlıya da uygulanır.** `infra/nginx/*.conf` repoda güncellenip
  `/www/server/panel/vhost/nginx/` altına kopyalanmazsa hiçbir şey hata vermez — dosyalar 200 döner,
  yalnızca `<video>` sessizce engellenir. Duman testi artık CSP başlığının kendisini okuyor
- **Görsel ve VİDEO kuralı: peygamberlerin yüzü gösterilmez.** Kural budur, fazlası değil
  (kullanıcı kararı 2026-09-06). Önceki "hiç figür olmasın, yüzü görünmemesi yeterli değil"
  kuralı **kaldırıldı**: uzaktan, küçük ve sırtı dönük siluetler serbesttir. Yasak yüzedir —
  peygamberin yüzü seçilir hâlde gösterilmez. Hero videosunda bu karar sonrası kesmeye gerek
  kalmadı, gövde tek parça oldu (`scripts/media/build_media.ts`).
  **Yeni medya yayına alınmadan önce yine kare kare taranır** — bu sefer yüz aranır — ve
  **çıktı da** taranır, yalnızca kaynak değil. 2026-09-05'te sahne notuna güvenilip kareye
  bakılmamıştı ve hatalı kesim yayına çıkmıştı; tarama alışkanlığı o yüzden duruyor.
  **R2 figür kapısı kaldırıldı** (kullanıcı kararı 2026-09-06). `pnpm media:r2:push` eskiden
  görsel bir dosyayı `media/FIGUR_TARAMASI.json` içinde aynı sha256 ile bulamazsa hiçbir şey
  yüklemiyordu; figür yasağı kalkınca kapının dayanağı da kalktı. **Tarama artık otomatik
  değil, insana bağlı**: yeni medyayı yayına almadan önce kare kare bakmak senin işin — kod
  artık hatırlatmıyor
- **Kaynak kutusu (`<SourceBadge>`) içerik sayfalarında yok** (kullanıcı kararı 2026-09-04 tanıtım,
  2026-09-05 bütün sayfalar): yalnızca mealin/tefsirin kime ait olduğu yazılır. Bu bir sunum kararıdır,
  atıf yükümlülüğü kalkmadı — atıf üç yerde durur ve üçü de zorunlu: mealin üstündeki yazar adı,
  `<Attribution>` (Base.astro, her sayfa) ve `/kaynaklar`. `<Translation>` `sourceDeclaredBy` olmadan
  build'i durdurur. `<SourceBadge>` bileşeni silinmedi; ileride kıssa/kavram gibi çok kaynaklı içerikte
  gerekirse kullanılır. CC BY-NC-SA 4.0 (`data/LICENSE`)
- **İç sayfalar tanıtım sayfasının dilini konuşur** (2026-09-05): `.pg-*`, `.chip`, `.fact-row`,
  `.surah-grid`, `.verse-list`, `.meal-grid` sınıfları `global.css` "Sayfa düzenleri" bölümünde.
  Yeni sayfa düz Tailwind yardımcılarıyla değil bu sınıflarla kurulur; düzen SIKI tutulur
- **İçerik katmanı `data/**` altında elle yazılır, veritabanı türetilmiş kopyadır.** Kıssa, konum,
  kavram, ilke ve zaman çizelgesi dosyaları tek gerçek kaynaktır; `pnpm content:import` onları
  PostgreSQL'e TRUNCATE + yeniden yazımla aktarır (upsert değil — silinen kayıt veritabanında kalmasın).
  Şema: `packages/schema/src/content_input.ts`. İçerik kuralları koda dönüştü: kaynaksız ders, kaynaksız
  konum, kaynaksız kavram ve birincil ayet dayanağı olmayan ilke build'i durdurur (plan §8.1, §8.3, §18.3)
- **Medya katmanında üç tür asla karıştırılmaz** (plan §24). Gerçek belge kaynak + lisans taşır,
  AI canlandırması prompt taşır; ikisi ayrı Zod şeması, ayrı CHECK kısıtı ve ayrı panel bölümüdür.
  **Lisans bir etiket değil kapıdır**: `COPYRIGHT`/`LINK_ONLY`/`UNKNOWN` lisanslı dosya sunucuya
  kopyalanmaz, yalnızca "Kaynağı görüntüle" bağlantısı gösterilir. Lisans tahmin edilmez —
  `pnpm data:wikimedia` dosya başına API'den çeker. **AI üretimi otomatik değildir** (spec §71):
  `pnpm media:ai:queue` prompt'ları diske yazar, üretim lokal makinede yapılır,
  `pnpm media:ai:collect` toplar. **`faceScanned` yayın kapısıdır ve hiçbir script onu true yapmaz** —
  kare kare yüz taraması insana bağlı; taranmamış kayıt statik çıktıya girmez
- **Kavram–ayet eşleştirmesi KÖKTEN hesaplanır, elle seçilmez.** Kavramın kökü ayette geçiyorsa ayet
  kavrama bağlanır; `source_id` NULL kalır (platform derlemesi). Kavramlar arası "birlikte geçer" bağı
  kosinüs benzerliğiyle hesaplanır. Elle yazılan ilişki (contrast/cause/part_of) hesaplananı ezer
- **Harita MapLibre GL JS + PMTiles (2026-09-05'te değişti); kavram grafı hâlâ JavaScript'siz.**
  CSP artık **sayfaya göre**: `script-src 'self'` yalnız `/harita` ve `/kissa/*` için açık
  (`infra/nginx` içindeki `map $uri $kesif_csp` bloğu), kalan 8100+ sayfa 0 bayt JS.
  Altlık kendi sunucumuzdan: R2'de PMTiles (OSM/Protomaps), üçüncü taraf tile yok.
  **Statik SVG silinmedi** — betik çalışmazsa veya altlık gelmezse yerinde kalır; devir teslim
  ancak ilk karo geldiğinde olur (8 sn zaman aşımı). Kavram grafı liste olarak kalıyor
- **Uydu katmanı Esri, ama yalnız RASTER.** `ibasemaps-api.arcgis.com/.../World_Imagery`.
  Esri'nin hazır `arcgis/imagery` stili 231 katman + **sprite** getirir; sprite üçüncü taraf ikon
  atlasıdır ve içeriğini biz denetlemiyoruz (Protomaps sprite'ında `theatre` = iki tiyatro maskesi,
  yani insan yüzü çıkmıştı). Bu yüzden stilin tamamı alınmaz, içinden sadece uydu raster kaynağı
  çıkarılır — fotoğraf ikon atlası taşımaz. CSP'ye yalnızca `ibasemaps-api` girdi
- **`PUBLIC_` önekli ortam değişkenleri TARAYICI PAKETİNE GÖMÜLÜR.** `PUBLIC_ARCGIS_API_KEY`
  bilerek öyle; ArcGIS anahtarı tasarımı gereği istemci taraflıdır ve koruma gizlilikle değil
  **yönlendirici (referrer) kısıtıyla** sağlanır (ölçüldü: başka kaynaktan "Token Invalid").
  Anahtar sızarsa yapılacak şey saklamak değil, panelden iptal edip yenisini üretmektir.
  Pay-as-you-go kapalı tutulur: ücretsiz kota bitince servis durur, fatura gelmez.
  Değişkenler repo kökündeki tek `.env`'den okunur (`astro.config.mjs` → `vite.envDir`);
  bu ayar olmadan Astro değişkeni **sessizce** bulamaz ve özellik kapalı görünür
- **Tanıtım sayfasında kartlar tıklanır** (`.lp-stretch`): hazır olan kendi sayfasına, hazır olmayan
  "Kullanacağınız araçlar" bölümüne gider. Olmayan bir sayfaya bağlantı verilmez
- Marka varlıkları `apps/web/public/brand/`; logo dekoratif kullanımda `alt=""` + `aria-hidden`
- Arapça: Amiri Quran / Scheherazade New, `dir="rtl"`; meal `ltr`
- Ortak bileşenler: AyetPaneli, SourceBadge, ConfidenceBadge, DiscoveryPath (breadcrumb), ComparisonBasket
- Harita/graf için zorunlu liste alternatifi; `prefers-reduced-motion` desteklenir
- Performans bütçesi: < 100 KB JS ilk yükleme, LCP < 2 sn (3G)

## Faz Sırası
Faz 0 Altyapı → Faz 1 Kıssa Haritası + İlkeler → Faz 2 Zaman + Meal Farkları → Faz 3 Kök + Kavram + Telegram bot
+ Hoca Notları import akışı → Faz 4 Günlük + PWA + Ses → Faz 5 Yayın (WhatsApp bu fazda).
Detay: `docs/PROJE_PLANI.md` §9, §16, §23.

## İlk Görev (Faz 0)
1. Sunucu port/servis envanteri raporu (`ss -tlnp`)
2. Monorepo iskeleti (pnpm workspaces)
3. `packages/schema` — Zod tipleri (§4, §12.15, §18.4, §19.6, §23.2) + PostgreSQL/SQLite migration üreticileri
4. PostgreSQL şema uygulaması + referans linter iskeleti
5. `scripts/import/tanzil.ts` ve `scripts/import/acikkuran.ts` (öncelikli 4 meal önce)
6. `scripts/build/` → `public/data/`
7. `scripts/sync/import_notes.ts` — inbox JSON paket importu (hoca notları için)
8. `docs/DESIGN.md` taslağı → onay → klasik okuma ekranı

Her adımda onay al.
