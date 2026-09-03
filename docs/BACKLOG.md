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
- **§3 veri kaynağı tablosu.** `api.acikkuran.com` erişilemiyor (NXDOMAIN, 2026-09-03).
  Kaynak araştırması sonuçlandığında tablo güncellenmeli. Bkz. `docs/DEPLOY_REPORT.md` §2.3.

## Teknik borç

- **Astro 5 → 7 yükseltmesi.** Astro 6+ Node ≥22.12 istiyor; sunucudaki Node 20.20.2'ye pm2'deki
  üretim uygulamaları bağlı. Proje-yerel Node 22 (fnm) ile ayrıştırılabilir.
  Bkz. `docs/DEPLOY_REPORT.md` §2.2.

## Özellik önerileri

*(henüz yok)*
