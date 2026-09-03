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

- **GÖREV 02 / N6 kapsam çelişkisi.** GÖREV 02, `migrations/postgres/001_init.sql`
  dosyasının **tüm** tabloları (core + scholar-notes) içermesini söylüyor. Bu,
  çalışan `infra/db/schema.sql`'in (35 tablo, 10 enum, ~40 CHECK,
  `blank_trim_set()`) üretilen dosyayla değiştirilmesi demektir. Kullanıcı bu
  oturumda kapsamı **"yalnızca paylaşılan hoca notu tabloları"** olarak seçmişti.
  Şu an §23.2 tabloları üretiliyor; çekirdek elle yazılı kalıyor.
  **Karar gerekiyor:** çekirdek de üretilsin mi? Üretilecekse mevcut
  `schema.sql`'deki kısıtların (verse_id formülü, `blank_trim_set`,
  `surah_section_source_required` vb.) `tables.ts` metadata'sına taşınması
  gerekir — aksi hâlde veri bütünlüğü zayıflar.

## Kullanıcıdan bekleyen

- **Plan §23 — Hoca Notları.** `CLAUDE.md` §23.2'ye atıf yapıyor ama `docs/PROJE_PLANI.md`
  §22'de bitiyor; "scholar" / "Hoca Not" kelimeleri planda hiç geçmiyor. Gereken alan
  tanımları: `scholar` (slug + ?), `video_source` (video_id + ?), `scholar_note`
  (iş anahtarı `(scholar_slug, video_id, segment_start_sec, note_type)`, not metni,
  `note_type` değerleri, `status`, `linked_verses` / `linked_principles` / `linked_concepts`).
  **Kullanıcı yazacak** (karar: 2026-09-03). Gelene kadar `scripts/sync/` ve `inbox/` boş duruyor.
- **Zod → migration üreticisi.** Kapsam kararı: yalnızca paylaşılan hoca notu tabloları
  (yerel `kuran-extract` SQLite, site PostgreSQL kullanıyor). Kur'an çekirdeği yerel projede
  olmadığı için `infra/db/schema.sql` elle yazılmış PostgreSQL şeması olarak kalır
  (10 enum, ~40 CHECK korunur). **Plan §23 geldiğinde yapılacak.**

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
