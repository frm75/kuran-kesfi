# infra/nginx

`kurankesfi.tr.conf` — sunucudaki vhost'un **kopyası**, referans içindir.

Canlı dosya: `/www/server/panel/vhost/nginx/kurankesfi.tr.conf`
(aaPanel yönetiyor). Buradaki kopya otomatik uygulanmaz; sunucudaki dosya
elle düzenlenir ve bu kopya güncellenir.

Neden repoda: aaPanel siteyle ilgili bir ayar değiştirildiğinde vhost'u
yeniden yazabiliyor. O olursa `root`, `try_files` ve güvenlik başlıkları
kaybolur, site 404'e düşer. Bu dosya neyin kaybolduğunu gösterir.

Kontrol: `pnpm deploy:smoke`

Ayrıntı ve gerekçeler: `docs/DEPLOY_REPORT.md` §3.9
