# Yedek ve geri yükleme

Gecelik yerel yedek: `scripts/ops/kuran-backup.sh`, cron `/etc/cron.d/kuran-backup` (03:20),
günlük `/var/log/kuran-backup.log`. Hedef `/opt/kuran-yedek/` (`700 root`), 14 gün tutulur.

**Bu yedek aynı diskte durur.** `db:reset`, bozulma ve yanlış silmeye karşı korur; disk
kaybına karşı korumaz. Sunucu dışı kopya henüz kurulmadı. R2 medya kovası
`medya.kurankesfi.tr` üzerinden herkese açık olduğu için yedek oraya şifresiz konmaz.

## Ne yedeklenir

| Dosya | Kaynak |
|---|---|
| `<zaman>/iletisim.sqlite.gz`, `bot.sqlite.gz` | `var/*.sqlite` (`sqlite3 .backup`, bütünlük denetimli) |
| `<zaman>/postgres.dump` | `kuran-pg` içinden `pg_dump -Fc` |
| `<zaman>/env` | `.env` |
| `<zaman>/git-head` | yedek anındaki commit |
| `cache/cache-<iz>.tar.gz` | `cache/` (`corpus-coranicum` ve `geonames` hariç); içerik değişince yenilenir, son iki arşiv kalır |

`media/` yedeklenmez: R2'de durur (`pnpm media:r2:check`).

## Geri yükleme

```bash
Y=/opt/kuran-yedek/<zaman>

# SQLite — önce servisi durdur, WAL dosyalarını kaldır
systemctl stop kuran-iletisim
rm -f var/iletisim.sqlite-wal var/iletisim.sqlite-shm
zcat $Y/iletisim.sqlite.gz > var/iletisim.sqlite && chmod 600 var/iletisim.sqlite
systemctl start kuran-iletisim       # bot için aynısı: kuran-bot, bot.sqlite

# PostgreSQL — boş veritabanına
pnpm db:up
docker exec -i kuran-pg sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < $Y/postgres.dump

# .env
install -m 600 $Y/env .env

# cache/
tar -C /opt/kuran -xzf /opt/kuran-yedek/cache/cache-<iz>.tar.gz
```

PostgreSQL türetilmiş kopyadır: yedek yoksa `data:*` içe aktarmaları ve `content:import`
ile yeniden kurulabilir, ama bu `cache/` içindeki ham kaynaklara bağlıdır.
