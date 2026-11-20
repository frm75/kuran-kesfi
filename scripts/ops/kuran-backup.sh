#!/usr/bin/env bash
#
# kurankesfi.tr — gecelik yerel yedek.
#
# Git'te OLMAYAN ve yeniden uretilemeyen durumu yedekler:
#   - var/*.sqlite       iletisim mesajlari, bot aboneleri (sqlite3 .backup:
#                        WAL acikken tutarli kopya; dosyayi cp'lemek degildir)
#   - PostgreSQL         pg_dump -Fc (kuran-pg kapsayicisi icinden)
#   - .env               sirlarin tek kopyasi
#   - cache/             yeniden indirilemeyebilen ham kaynaklar. Yeniden
#                        klonlanabilen corpus-coranicum ve geonames HARIC.
#                        Icerik degismediyse onceki arsiv yeniden kullanilir.
#
# media/ (4,7 GB) burada YOK: R2'de durur (pnpm media:r2:check).
#
# DIKKAT: bu yedek AYNI DISKTE durur. db:reset, bozulma ve yanlis silmeye
# karsi korur; disk kaybina karsi KORUMAZ. Sunucu disi kopya ayri bir adim.
#
# Kullanim:  scripts/ops/kuran-backup.sh            (cron: /etc/cron.d/kuran-backup)
# Geri yukleme: docs/YEDEK.md

set -euo pipefail
umask 077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="${KURAN_BACKUP_DIR:-/opt/kuran-yedek}"
KEEP_DAYS="${KURAN_BACKUP_KEEP_DAYS:-14}"
PG_CONTAINER="kuran-pg"

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "HATA  $*" >&2; exit 1; }

exec 9>/run/lock/kuran-backup.lock
flock -n 9 || die "baska bir yedekleme suruyor"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$DEST/$stamp.part"
final="$DEST/$stamp"
mkdir -p "$DEST" "$DEST/cache"
chmod 700 "$DEST"
find "$DEST" -maxdepth 1 -name '*.part' -exec rm -rf {} +
mkdir "$work"

# --- sqlite ------------------------------------------------------------------
for db in "$REPO_ROOT"/var/*.sqlite; do
  [ -f "$db" ] || continue
  name="$(basename "$db")"
  sqlite3 "$db" ".backup '$work/$name'"
  [ "$(sqlite3 "$work/$name" 'PRAGMA integrity_check;')" = "ok" ] ||
    die "$name yedegi butunluk denetimini gecemedi"
  gzip "$work/$name"
  log "sqlite  $name"
done

# --- PostgreSQL --------------------------------------------------------------
# Kimlik bilgisi kapsayicinin kendi ortamindan okunur; .env burada acilmaz.
if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  docker exec "$PG_CONTAINER" sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    > "$work/postgres.dump"
  [ -s "$work/postgres.dump" ] || die "pg_dump bos cikti verdi"
  log "postgres  $(du -h "$work/postgres.dump" | cut -f1)"
else
  # Build makinesi DB'si kapali olabilir; bu bir hata degil ama soylenir.
  log "UYARI  $PG_CONTAINER calismiyor; PostgreSQL yedegi ATLANDI"
fi

# --- .env --------------------------------------------------------------------
cp -p "$REPO_ROOT/.env" "$work/env"
log "env"

# --- cache/ ------------------------------------------------------------------
# Parmak izi: dosya yolu + boyut + degisim zamani. Degismediyse yeni arsiv
# uretilmez; 90 MB'i her gece yeniden yazmak gereksiz.
cache_sig="$(cd "$REPO_ROOT/cache" && find . -type f \
  -not -path './corpus-coranicum/*' -not -path './geonames/*' \
  -printf '%p %s %T@\n' | sort | sha256sum | cut -c1-16)"
cache_tar="$DEST/cache/cache-$cache_sig.tar.gz"
if [ ! -f "$cache_tar" ]; then
  tar -C "$REPO_ROOT" --exclude='cache/corpus-coranicum' --exclude='cache/geonames' \
    -czf "$cache_tar.part" cache
  mv "$cache_tar.part" "$cache_tar"
  log "cache  yeni arsiv $(du -h "$cache_tar" | cut -f1)"
  # Son iki arsiv kalir.
  ls -1t "$DEST"/cache/cache-*.tar.gz | tail -n +3 | xargs -r rm -f
else
  log "cache  degismedi"
fi
echo "$cache_sig" > "$work/cache.sig"

git -C "$REPO_ROOT" rev-parse HEAD > "$work/git-head" 2>/dev/null || true
mv -T "$work" "$final"

# --- eski yedekleri buda -----------------------------------------------------
find "$DEST" -maxdepth 1 -type d -regextype posix-extended \
  -regex '.*/[0-9]{8}T[0-9]{6}Z' -mtime +"$KEEP_DAYS" -exec rm -rf {} +

log "yedek tamam: $final ($(du -sh "$final" | cut -f1))"
