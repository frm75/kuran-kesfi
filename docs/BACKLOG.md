# BACKLOG — İlk yayın sonrası

> Kapsam dondurulmuştur (plan §17, CLAUDE.md kural 7). Planda olmayan her öneri buraya yazılır,
> ilk yayından önce uygulanmaz.

## Karar bekleyen (plan §11'den devralınan)

- Alan adı ve proje adı — `kurankesfi.tr` kullanılıyor, proje adı netleşmedi
- Diyanet Kur'an Yolu tefsirinin kullanım şartları; yazılı izin gerekip gerekmediği
- Kavram setinin ilk kaynağı: Diyanet konu fihristi mi, özgün derleme mi
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

## Teknik borç

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

## Özellik önerileri

*(henüz yok)*
