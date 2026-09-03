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
- **§3 veri kaynağı tablosu.** Açık Kuran API'si kapanmıştır (doğrulandı, 2026-09-03). Tablodaki
  "Açık Kuran API" satırları Tanzil çeviri seti ve Quranic Arabic Corpus ile değiştirilmeli.
  Bkz. `docs/DEPLOY_REPORT.md` §3.4.
- **§3.1 öncelikli meal listesi.** Mehmet Okuyan, Mustafa İslamoğlu ve Muhammed Esed açık
  lisanslı hiçbir sette yok. Yeni sıra: Diyanet İşleri, Elmalılı, Ali Bulaç, Süleyman Ateş.
  Plan metni güncellenmeli.
- **Statik JSON dosya adı çelişkisi.** Plan §5.5 `verse/{s}-{v}.json` (tire) diyor; §20.2
  "Statik JSON dosyaları: alt çizgi — `verse_2_153.json`" diyor. §20.2 esas alındı (daha
  spesifik kural). Plan §5.5 düzeltilmeli.
- **`pnpm import` komut adı kullanılamaz.** Plan §20.1 "`pnpm import && pnpm build` sıfırdan
  aynı çıktıyı üretir" diyor; ancak `pnpm import` pnpm'in **yerleşik** komutudur (başka bir
  lockfile'dan `pnpm-lock.yaml` üretir) ve çalıştırıldığında mevcut lockfile'ı siler. Bu
  oturumda bir kez oldu, git'ten geri alındı. Script `data:import` olarak adlandırıldı; plan
  metni `pnpm data:import && pnpm build` olarak düzeltilmeli.

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
- **Türkçe kök anlamları (`root.meaning_tr`) için kaynak.** Açık Kuran kapandığı için bu veri
  kaynaksız kaldı. Quranic Arabic Corpus morfolojiyi verir ama Türkçe anlam vermez.
  **Faz 3 (Kök Kelime Keşfi) için ön koşul.**

## Faz 4 — depolama

- **Arapça kıraat sesi için harici nesne depolaması (Cloudflare R2 veya CDN).** Tek kârînin tam
  kaydı 500 MB – 2 GB; 3-4 kârî ile 2-8 GB. Sunucuda 41 GB boş alan var ama ses dosyalarını
  statik `dist/` içinde tutmak hem yedekleme hem dağıtım açısından yanlış. Plan §6'daki
  "alternatif/yedek: Cloudflare Pages + R2" notu bu ihtiyacı karşılıyor.
  Metin verisi için gerekmiyor: `cache/` 3,9 MB, tam veri setiyle en kötü ~100 MB
  (ölçüm: `docs/DEPLOY_REPORT.md` §3.4).

## Özellik önerileri

*(henüz yok)*
