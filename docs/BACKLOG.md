# BACKLOG — İlk yayın sonrası

> Kapsam dondurulmuştur (plan §17, CLAUDE.md kural 7). Planda olmayan her öneri buraya yazılır,
> ilk yayından önce uygulanmaz.

## Karar bekleyen (plan §11'den devralınan)

- ~~Alan adı ve proje adı~~ → **KAPANDI 2026-09-04**: `kurankesfi.tr`, "Kur'an-ı Kerim Keşfi",
  tagline "Keşfet • Oku • Anla" (CLAUDE.md → Domain ve Marka; plan §11)
- Diyanet Kur'an Yolu tefsirinin kullanım şartları; yazılı izin gerekip gerekmediği
- ~~Kavram setinin ilk kaynağı~~ → **KAPANDI 2026-09-05**: özgün derleme. TDV İslâm Ansiklopedisi
  maddeleri + mevcut kök verisi; ayet eşleştirmesi kökten hesaplanıyor. Diyanet konu fihristinin
  kullanım şartı belirsizdi, beklenmedi (71 kavram yazıldı)
- Arapça kıraat için hangi kârîler (lisans uyumlu olanlar arasından)
- Bağış/sunucu masrafı yaklaşımı
- `surah_section` başlıkları için kaynak ve atıf biçimi

## Plan düzeltmesi gereken

- **§12.5 güven derecesi tutarsızlığı.** `verse_relation.confidence` planda `kesin | muhtemel | olasi`
  yazıyor; §12.9 ise sistemi `kesin | muhtemel | rivayet` olarak genelliyor. Şemada §12.9 esas alındı
  (`packages/schema/src/common.ts`). Plan metni düzeltilmeli.
- **§6 dizin yapısı.** Plan `/apps/web  Next.js site` diyor; CLAUDE.md ve gerçek uygulama Astro.
  Plan metni düzeltilmeli.
- **§3 veri kaynağı tablosu.** Açık Kuran'ın yayınlanan REST API'si (`api.acikkuran.com`)
  kapanmıştır; veri sitenin kendi sayfa verisi ucundan alınmaktadır. Tablodaki uç adresi
  güncellenmeli. Lisans (CC BY-NC-SA 4.0) ve kaynak adı değişmiyor.
  Bkz. `docs/DEPLOY_REPORT.md` §3.6.
- **§3.1 öncelikli meal listesi — DEĞİŞİKLİK GEREKMİYOR.** Planın orijinal listesi
  (Diyanet İşleri, Mehmet Okuyan, Mustafa İslamoğlu, Muhammed Esed) uygulanabiliyor;
  dördü de Açık Kuran'da mevcut. (2026-09-03'te bir ara "uygulanamıyor" sonucuna varılmıştı;
  o sonuç yanlıştı, bkz. `docs/DEPLOY_REPORT.md` §3.6.)
- **§3 İngilizce mealler.** 27 İngilizce meal de import ediliyor; ileride İngilizce dil
  seçeneği planlanıyor (kullanıcı kararı, 2026-09-03). Plan §3.1 İngilizce bölümü
  genişletilmeli.
- **Statik JSON dosya adı çelişkisi.** Plan §5.5 `verse/{s}-{v}.json` (tire) diyor; §20.2
  "Statik JSON dosyaları: alt çizgi — `verse_2_153.json`" diyor. §20.2 esas alındı (daha
  spesifik kural). Plan §5.5 düzeltilmeli.
- **`pnpm import` komut adı kullanılamaz.** Plan §20.1 "`pnpm import && pnpm build` sıfırdan
  aynı çıktıyı üretir" diyor; ancak `pnpm import` pnpm'in **yerleşik** komutudur (başka bir
  lockfile'dan `pnpm-lock.yaml` üretir) ve çalıştırıldığında mevcut lockfile'ı siler. Bu
  oturumda bir kez oldu, git'ten geri alındı. Script `data:import` olarak adlandırıldı; plan
  metni `pnpm data:import && pnpm build` olarak düzeltilmeli.
- **`pnpm deploy` de yerleşik komut.** Aynı tuzağın ikinci örneği: `deploy` pnpm'in yerleşik
  komutudur, kök script'i gölgeler ve `ERR_PNPM_NOTHING_TO_DEPLOY` verir. Zarar vermiyor ama
  sessizce hiçbir şey yapmıyor — "yayınladım" sanılabilir. Kullanım **`pnpm run deploy`**.
  Script adını değiştirmek yerine `run` kullanılması yeterli görüldü; ad `release` yapılırsa
  belgeler ve alışkanlık da değişir. `pnpm run` gerektiren adlar README'de işaretli.

## Verilen kararlar — 2026-09-03

Kullanıcı bu üç kararı bana bıraktı ("en iyi kararı vererek devam et").

### A. Migration üreticisi kapsamı — çekirdek ÜRETİLMEZ

GÖREV 02 / N6 postgres migration'ının tüm tabloları içermesini söylüyor.
**Uygulanmadı.** Gerekçe:

1. Çift migration üretmenin **amacı** iki motoru senkron tutmaktır. Çekirdek
   veri yerel `kuran-extract` projesinde yoktur — senkron tutulacak bir şey
   olmadığı için çekirdeği üretmek hiçbir şey kazandırmaz.
2. Bedeli ağırdır: `schema.sql` 35 tablo, 10 enum ve ~40 CHECK taşıyor
   (`verse_id` formülü, `blank_trim_set()`, `surah_section_source_required`,
   `location_coords_together`, `author_priority_is_default`…). Üretici bunları
   destekleyecek kadar genişletilmedikçe taşımak **veri bütünlüğünü zayıflatır**.
3. Kullanıcı kapsamı bu oturumda zaten "yalnızca paylaşılan tablolar" seçmişti.

**Bunun yerine iki yarı gerçekten birleştirildi:** `infra/db/docker-compose.yml`
önce `schema.sql`, sonra üretilen migration'ı uygular (`10_` / `20_` ön ekleri).
Sıfırdan kurulum doğrulandı: **45 tablo** (35 çekirdek + 10 hoca notu), init
hatasız.

**Bu sırada gerçek bir hata bulundu ve düzeltildi:** ara tabloların çekirdeğe
giden yabancı anahtarları (`verse_id → verse(id)`, `principle_id`, `concept_id`,
`story_id`, `root_id`) hiçbir yerde tanımlı değildi. `tables.ts`'e eklendi;
geçersiz `verse_id` artık veritabanı düzeyinde reddediliyor (test edildi).

### C. Web kökündeki dokümanlar SİLİNDİ

`kurankesfi.tr` altında 6 markdown dosyası herkese açık indirilebiliyordu.
Silinmeden önce hepsi repoya alındı ve md5 ile doğrulandı:

| Dosya | Nereye |
|---|---|
| `GOREV_01_schema_zod.md`, `GOREV_02_migration_uretici.md`, `SD01_sema_degisikligi.md` | `docs/gorevler/` |
| `CLAUDE_site.md` | `/opt/kuran/CLAUDE.md` (özdeş) |
| `CLAUDE.md` (eski) | `CLAUDE_site.md` tarafından geçersiz kılındı |
| `PROJE_PLANI.md` | `docs/PROJE_PLANI.md` (repo sürümü üstün — §23 eklendi) |

Doğrulandı: dördü de artık **HTTP 404**. Web kökü deploy için temiz.

## Kullanıcıdan bekleyen — GÖREV 01/02 sonrası

- **Plan §23'ün eksik bölümleri.** SD-01 içeriği §23.2 olarak plana işlendi
  (2026-09-03). §23.1 (amaç, kapsam, içerik kuralları) ve §23.3+ hâlâ yok.
- **`scholar-notes.ts`'te ÇIKARIMLA doldurulan alanlar.** GÖREV 01 tablo
  adlarını ve enum'ları veriyordu ama her kolonu değil; §23.2 elde olmadığı için
  aşağıdakiler makul varsayımla yazıldı ve §23 geldiğinde karşılaştırılmalıdır:

  | Tablo | Çıkarımla eklenen alanlar |
  |---|---|
  | `scholar` | `channelName`, `channelUrl`, `note` |
  | `videoSource` | `title`, `url`, `publishedAt`, `durationSec` |
  | `transcript` | `source`, `language`, `createdAt` |
  | `transcriptSegment` | `startSec`, `endSec`, `text` |
  | `scholarNote` | `createdAt`, `updatedAt` |
  | `scholarNoteRelationRow` | `note` (serbest açıklama) |

  `export.ts`'e ayrıca `linked_verse_roles` eklendi: GÖREV 01 `linked_verses`'i
  düz `VerseKey[]` olarak tanımlıyor ama `ScholarNoteVerse` bir `role` alanı
  taşıyor; rol bilgisi aktarılmazsa export'ta kaybolurdu. Onay bekliyor.

- **`scripts/sync/import_notes.ts` yazılmadı.** Şema ve migration hazır ama inbox akışı
  (hash doğrulama → Zod parse → `checkPackageIntegrity` → idempotent upsert → rapor;
  bilinmeyen referans → `inbox/rejected/`) henüz yok. Faz 3 işi; §23.1'in içerik kuralları
  netleştiğinde yazılır.

## İzin / iletişim bekleyen

- **Mehmet Okuyan, Mustafa İslamoğlu, Muhammed Esed mealleri** — hak sahibinden yazılı izin
  gerekiyor. İzin gelmedikçe eklenmez (plan §3.1).
- **Açık Kuran** — API'nin geri dönüp dönmeyeceği ve veri dump'ı paylaşılıp paylaşılmayacağı.
  Kullanıcı kendisi iletişim kuracak (karar: 2026-09-03). Yanıt gelirse plan §3 güncellenir.
- **Diyanet Kur'an Yolu tefsiri** — kullanım şartları, yazılı izin gerekip gerekmediği.
- **Mehmet Alagaş meali** (karar 2026-09-06) — `insandergisi.com/kuran-meali.pdf` ücretsiz
  indiriliyor ama lisans metni yok; Alagaş v. 2004 → 2075'e kadar kamu malı değil.
  İnsan Dergisi'ne (`insandergisi.com/iletisim.php`) yazılı kullanım izni başvurusu gerekiyor.
  İzin gelmeden `data/` altına girmez. Ayrıntı: `docs/KAYNAK_ENVANTERI.md` §5.
- **Mustafa İslamoğlu — Hayat Kitabı Kur'an**: `hayatkitabikuran.com` çalışıyor ve mealin
  tamamı ayet ayet çevrimiçi, ama API ve lisans yok. Kazıma yapılmaz (CLAUDE.md §6).
  İzin muhatabı Düşün Yayıncılık.
- **OpenITI / RELEASE** — depoda `LICENSE` dosyası yok. Klasik metinler kamu malı olsa da
  derlemenin kendisi için yazılı teyit alınacak; teyit gelene kadar yalnız atıf hedefi
  olarak kullanılır, metin indirilmez. Durum: `data-external/openiti/LICENSE.md`.
- ~~**QUL (qul.tarteel.ai)**~~ — **KAPANDI 2026-09-06.** Hesap açıldı, el-Muhtasar Türkçe
  indirilip içe alındı (6222 blok). QUL'dan alınacak başka bir şey yok.
- ~~**Çeviriyazı (transkripsiyon) yok: 0/6236.**~~ **ÇÖZÜLDÜ 2026-09-04**:
  `scripts/import/transcription.ts` eklendi, 6236/6236 dolu. Ayrıntı commit
  a9df4f2. Aşağıdaki özgün kayıt tarihsel olarak duruyor.

- **(çözüldü) Çeviriyazı (transkripsiyon) yok: 0/6236.** `staticVerse.transcriptionTr`
  alanı şemada var, veritabanında var, ama **hiçbir ayette dolu değil**.
  Açık Kuran import'u çeviriyazı getirmiyor. Plan §2.5 çeviriyazının "Arapça
  bilmeyen okuyucu için her zaman erişilebilir" olmasını istiyor; DESIGN.md
  §2 de sayıyor. Ayet sayfasında boş bir "Okunuşu" başlığı göstermek yerine
  bölüm hiç render edilmiyor.
  **Kaynak var:** `scripts/import/tanzil_translations.ts` çeviriyazı da
  getiriyor (yedek zincirde duruyor, varsayılan zincirde değil). O script'ten
  yalnızca çeviriyazıyı alan bir import yazılabilir — yazar slug'ları
  çakışmadan, çünkü çeviriyazı `verse` tablosuna yazılır, `translation`'a
  değil. Faz 1 işi.

## Veri kalitesi — font alt kümelemesi sırasında bulundu (2026-09-03)

**ÇÖZÜLDÜ 2026-09-04.** Font kapsama listesi üretilen verinin tamamı taranarak
çıkarıldığı için (`scripts/fonts/build_fonts.ts`) metinlerdeki kodlama artıkları
ortaya çıktı. Hiçbiri ayet metninde değildi; hepsi meal ve dipnotlardaydı.

`packages/pipeline/src/text.ts` → `sanitizeSourceText()` eklendi, Açık Kuran
import'una bağlandı. **32 onarım** yapıldı, hepsi rapora yazıldı:

| Kod noktası | Ne | Kaç | Onarım |
|---|---|---|---|
| `U+0091` | cp1252 `‘` | 22 | `‘` |
| `U+200E` | soldan-sağa işareti | 5 | silindi (metinde RTL yok) |
| `U+0085` | cp1252 `…` | 2 | `…` |
| `U+0096` | cp1252 `–` | 2 | `–` |
| `U+200B` | sıfır genişlikli boşluk | 1 | silindi |

Hepsi tek bir aktarım hatasının izi: cp1252 kodlu metin UTF-8 sanılmış.
22'sinin 22'si Mahmoud Ghali çevirisinde. Bu **editoryal müdahale değil**;
yazarın koyduğu karakter zaten tırnak/tire/üç noktaydı, aktarımda bozulmuştu.
Sanitizer tanımadığı bir kontrol karakteri görürse **değiştirmez**, rapora
sorun olarak yazar.

Doğrulandı: yeniden import sonrası kalan bozuk karakter **yok**.

### Açık kalan

- **`U+00AD` yumuşak tire — 1046 kez.** Görünmez; satır sonu ipucu olarak
  geçerli bir karakter, ama bu kadar çoğu muhtemelen kaynak dizgisinden
  kalma. Zararsız (çizilmiyor, fonta alınmıyor) ama kopyala-yapıştırda
  metne bulaşıyor. Temizlenip temizlenmeyeceği kararı bekliyor.
- **İbranice harfler (22 kod noktası, birer kez).** Bir İngilizce meal
  dipnotunda İbranice alıntı var; Inter İbranice taşımıyor, o satır sistem
  fontuna düşüyor. Kasıtlıysa sorun değil.
- **`U+06AF` (گ, Farsça gaf).** Amiri Quran'da yok, Scheherazade New'de var;
  gövde yığını sayesinde ona düşüyor.
- **`U+23AF`, `U+2C6B`, `U+263C`, `U+0202`.** Muhtemelen kaynak metindeki
  dizgi artıkları; içerik olarak zararsız.

## Performans

- **`translation/abul-ala-maududi/surah_2.json` 365 KB** — plan §20.4 eşiği
  300 KB. Referans linter uyarı veriyor ama build'i durdurmuyor. Bu mealin
  dipnotları çok uzun. Dipnotları ayrı bir dosyaya bölmek çözer; ayet
  sayfası zaten dipnotları ayrı yüklemiyor, sure sayfası da bu meali
  kullanmıyor. Faz 1 işi.

## Teknik borç

- **`size-adjust` ile yedek font metrik hizalaması yok.** DESIGN.md §8 CLS
  hedefi < 0.1. Doğru `ascent-override` / `descent-override` / `size-adjust`
  değerleri yedek fontun (Arial / system-ui) gerçek metriklerinden hesaplanır.
  Build makinesinde fontconfig yok (`fc-list` bulunamadı) ve Arial ile
  metrik uyumlu bir font (Liberation Sans) kurulu değil; ölçemeden sayı
  yazılmadı. Fontlar `preload` + `swap` ile geliyor, Inter 61,4 KB — geçiş
  sıçraması küçük ama sıfır değil.

- **Astro 5 → 7 yükseltmesi.** Astro 6+ Node ≥22.12 istiyor; sunucudaki Node 20.20.2'ye pm2'deki
  üretim uygulamaları bağlı. Proje-yerel Node 22 (fnm) ile ayrıştırılabilir.
  Bkz. `docs/DEPLOY_REPORT.md` §2.2.
- **`root_diff` (kök türevleri ve geçiş sayıları) için kaynak.** Açık Kuran'ın ayet ucu kök
  bilgisini veriyor (`latin`, `arabic`, Türkçe anlam) ama kökün türevlerini listelemiyor.
  Eski `/root/{id}` ucu kapalı. Türev listesi Faz 3 kök ağacı görünümü için gerekiyor;
  ya `verse_part` verisinden türetilir ya da Quranic Arabic Corpus'tan alınır.
- **Açık Kuran uç kırılganlığı.** Veri, sitenin yayınlanmamış sayfa verisi ucundan alınıyor;
  `buildId` her dağıtımda değişiyor ve uç şekli haber verilmeden değişebilir. Önbellek
  alındığı için mevcut veri risk altında değil, ama yeniden çekim gerekirse script
  güncellenmesi gerekebilir. `scripts/import/tanzil_translations.ts` yedek olarak duruyor.

## Faz 4 — depolama

- **Arapça kıraat sesi için harici nesne depolaması (Cloudflare R2 veya CDN).** Tek kârînin tam
  kaydı 500 MB – 2 GB; 3-4 kârî ile 2-8 GB. Sunucuda 41 GB boş alan var ama ses dosyalarını
  statik `dist/` içinde tutmak hem yedekleme hem dağıtım açısından yanlış. Plan §6'daki
  "alternatif/yedek: Cloudflare Pages + R2" notu bu ihtiyacı karşılıyor.
  Metin verisi için gerekmiyor: `cache/` 3,9 MB, tam veri setiyle en kötü ~100 MB
  (ölçüm: `docs/DEPLOY_REPORT.md` §3.4).

## Tefsir arayüzü — veri hazır, ekran yok (2026-09-06)

`tafsir` + `tafsir_block` dolu: **iki eser, 13 208 blok** (Sa'dî 6986 + el-Muhtasar 6222),
ikisi de 6236 ayetin %100'ünü kapsıyor.
Sitede görünmüyor çünkü statik dışa aktarım ve ayet sayfası bölümü yapılmadı.
Bilinçli bırakıldı — `docs/KAYNAK_ENVANTERI.md` §0 (kütüphane ≠ yayın) + o sırada başka bir
oturum `[surah].astro` / `lib/data.ts` üzerinde çalışıyordu.

Kalan iş:
1. `scripts/build/build.ts` → `tafsir_index.json` + sure başına blok dosyaları
2. `packages/schema/src/static_data.ts` → statik şema
3. Ayet sayfasında "Tefsir" bölümü — `<SourceBadge>` zorunlu, **sürüm numarası görünmeli**
   (QuranEnc koşul 3), tek tefsir olduğu için "bu bir yorumdur, tek görüş değildir" uyarısı
   (plan §12.9)
4. Performans: bir blok 3-5 KB; Bakara'nın 433 bloğu var → sure sayfasına toptan konmaz,
   ayet başına veya ayrı `/tefsir/...` sayfası (plan §20.4 bütçesi)

## Kök sayfası ağırlığı — QUL doldurmasından sonra (2026-09-06)

`root/اله.json` 490 KB oldu (eşik 300 KB, plan §20.4); sayfa `/kok/اله` 622 KB ham /
**25,7 KB gzip**. Sebep bir hata değil, bir **düzeltme**: QUL kelime-kök verisi eklenince
`اله` kökü 2850 kelimeye çıktı — yani "Allah" kelimesinin geçtiği yerlerin çoğu daha önce
köke bağlı değildi. Veri doğru, sayfa uzun.

Yapılacak: en kalabalık köklerde (اله, قول, كون) sayfayı bölmek ya da ayet listesini
sure sure katlamak. Acil değil — gzip'li ağırlık 26 KB.

## Özellik önerileri

> Hepsi **ilk yayın sonrası**. Kaynağı: kullanıcının 2026-09-06 tarihli
> "Kur'an Bilgi Ağı — Görsel, Harita, Kıssa ve Mushaf Sistemi" belgesi.
> Plan §12.4, §12.9, §12.10, §12.12 ve §20.3 ile **çakışan** maddeler buraya alınmadı;
> aşağıdakiler planda karşılığı olmayanlardır.

- **`Media` varlığı ve şeması** (ilk yayın sonrası) — `packages/schema/src/media.ts`.
  Zorunlu alan: `mediaType` (`photo` | `illustration` | `video` | `diagram` | `map`),
  `origin` (`real_photo` | `ai_generated` | `hand_drawn` | `archive`), `license`,
  `attribution`, `verseIds[]`, `placeId?`.
  Kural: `origin != real_photo` olan her medya **görünür etikette** "yapay zekâ üretimi /
  temsilîdir" yazısı taşır; etiket CSS ile gizlenemez (statik HTML'de metin olarak).
  Gerekçe: plan §13'ün "yorumcu değil, kütüphaneci" ilkesi görsel katmana da uygulanmalı.

- **Gerçek fotoğraf ↔ AI görsel ayrımı** (ilk yayın sonrası) — aynı sayfada yan yana
  gösterilirse çerçeve rengi + rozet farklı olur. Plan §12.10 (kaynak şeffaflığı) metin
  için ne diyorsa görsel için de aynısı.

- **AI illüstrasyon üretim hattı** (ilk yayın sonrası) — `scripts/media/` altında prompt
  üretici. CLAUDE.md §8 gereği **peygamber yüzü üretilmez**; üretilen her kare yayından
  önce taranır ve **çıktı da** taranır, yalnız kaynak değil.

- **10 saniyelik AI video hattı** (ilk yayın sonrası) — kıssa sayfaları için. Ağır medya
  R2/`medya.kurankesfi.tr` üzerinde (CLAUDE.md §5). `poster` + `<video>` etiketi JS'siz;
  `/kissa/*` zaten CSP'de betiğe açık. Kare taraması zorunlu.

- ~~**Mushaf/yazma şeması ve arayüzü**~~ — **BİTTİ 2026-09-06.** `manuscript` +
  `manuscript_range` tabloları, `packages/schema/src/manuscript.ts`,
  `apps/web/src/lib/manuscripts.ts`, sayfalar `/yazmalar`, `/yazmalar/<yüzyıl>`,
  `/yazma/<id>` (2322) ve ayet sayfasında "Bu ayeti taşıyan yazmalar".
  Görüntü yok; linter `corpuscoranicum.de` dışı adres görürse build'i durduruyor.
  Ayrıntı: `docs/DURUM.md` → "Yazma modülü".

- **Corpus Coranicum'un diğer 5 veri seti** (ilk yayın sonrası) — aynı depo, aynı CC BY-SA 4.0:
  `quran_variants` (kıraat farkları; daha önce reddedilen qiraat depolarının lisanslı karşılığı),
  `quran_intertexts` (714 dosya — Kur'an ile geç antik metinler arası ilişki; kıssa katmanına
  doğrudan denk), `quran_concordance` (Talmon, tam gramer çözümü), `quran_commentary`
  (85 dosya, sure sure kronolojik-edebî şerh), `cairo_quran` (1924 Kahire baskısı + EN/DE/FR).
  Kıraat ve şerh hassas alanlar (plan §12.9); yayın kararı ayrı verilir.

- **Yazma zaman çizelgesi modülü** (ilk yayın sonrası) — mevcut `/zaman` siyer çizelgesinin
  yanına mushaf nüshalarının tarihlenmesi. Ön koşul: yukarıdaki şema.

- ~~**Ayet → yazma çift yönlü gezinme**~~ — **BİTTİ 2026-09-06.** Ayet sayfasından
  "bu ayeti taşıyan yazmalar" (sayı + en eski 5), yazma sayfasından "taşıdığı ayetler"
  (aralıklar, ayet sayfalarına bağlı).

- ~~**`data-external/` ağacı**~~ — **KURULDU 2026-09-06.** `data-external/README.md` +
  `data-external/openiti/` (LICENSE.md + works.json, 9 klasik eserin künyesi, metin yok).
  `pnpm content:import` bu ağacı okumaz. **İlk yayın sonrasına kalan kısım:** buradan
  `data/`'ya kayıt taşıyan onaylı bir hat (şu an elle taşınıyor).

---

## Medya katmanı — ilk yayın sonrası (plan §24, 2026-09-06)

Modülün kendisi yayında; aşağıdakiler bilinçli olarak dışarıda bırakıldı.

- **Gerçek görselleri indirip barındırmak.** Bugün 34 kaydın hepsi künye +
  "Kaynağı görüntüle" ile duruyor; hiçbir dosya sunucuda değil. Kullanıcı
  kararı ve spec §71 sırası böyle. Karar değişirse iş: uygun lisanslıları
  (`isHostableLicense`) indir → `media/gorsel/` → `localPath` doldur →
  `pnpm media:r2:push` → **nginx CSP'sine `img-src` için `medya.kurankesfi.tr`
  ekle ve canlıya kopyala** (yoksa görseller sessizce engellenir, bkz. CLAUDE.md
  CSP notu).
- **AI üretim hattını açmak.** `fileQueueProvider.canGenerate = false`; kuyruk
  ve toplayıcı hazır, 10 prompt yazılı. Spec §71 önce gerçek görsel işinin
  bitmesini şart koşuyor.
- **Somut AI adaptörü** (ComfyUI / A1111 / API). `scripts/media/ai/provider.ts`
  arayüzleri hazır; `ai_generator` enum'una yeni değer girer.
- **Lightbox ve kaydırmalı galeri.** JavaScript gerekir; ayet sayfalarında CSP
  `script-src` kapalı. Açılırsa panel filtresi de çipe dönebilir (spec §63).
- **`/medya` dizin sayfası** — bütün medyayı türe ve coğrafyaya göre gezme.
- **Konum başına medya sayfası.** Bugün `/harita` tek sayfa; konum sayfası yok.
- **Kalan coğrafyalar.** İlk 10 coğrafya prototipi hazır (spec §70). Kudüs,
  Eyke, Ahkāf, Lût gölü, Ur/Harran, Kenan, Taif, Habeşistan, Bedir, Hudeybiye,
  Huneyn ve Hendek için medya kaydı yok.
- **Medyen'in yer fotoğrafı.** Commons'ta Al-Bad' bölgesinin doğrulanmış yer
  fotoğrafı bulunamadı; elde uydu görüntüsü ve iki kuyu fotoğrafı var. Başka
  kaynak (UNESCO, Suudi Turizm Komisyonu arşivleri) araştırılabilir.

