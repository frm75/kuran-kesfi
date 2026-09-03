#!/usr/bin/env bash
#
# kurankesfi.tr — atomik statik yayin.
#
# Yayin dizen:
#   /www/wwwroot/kurankesfi.tr/
#     .well-known/            SSL dogrulama (aaPanel kullanir, ELLENMEZ)
#     releases/<UTC zaman>/   her yayin ayri dizin
#     current -> releases/... sembolik bag, nginx root'u
#
# Yeni surum once yeni bir releases/ dizinine yazilir; her sey hazir olunca
# 'current' bagi TEK islemde degistirilir (ln -sfn + mv). Yarim yayinlanmis
# site olusmaz, geri almak bir komuttur.
#
# Kullanim:
#   scripts/deploy/deploy.sh              yayinla
#   scripts/deploy/deploy.sh --rollback   bir onceki surume don
#   scripts/deploy/deploy.sh --list       yayinlari listele
#   scripts/deploy/deploy.sh --smoke      yalnizca duman testi
#
# Bu script build YAPMAZ. Once: pnpm build

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIST="$REPO_ROOT/apps/web/dist"
SITE_ROOT="/www/wwwroot/kurankesfi.tr"
RELEASES="$SITE_ROOT/releases"
CURRENT="$SITE_ROOT/current"
WELL_KNOWN="$SITE_ROOT/.well-known"
NGINX="/www/server/nginx/sbin/nginx"
KEEP=2          # tutulacak eski yayin sayisi (yayindaki + 2 = ~1 GB)
OWNER="www:www" # nginx bu kullaniciyla calisiyor

log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { printf '%s  HATA  %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; exit 1; }

list_releases() {
  ls -1 "$RELEASES" 2>/dev/null | sort || true
}

cmd_list() {
  log "yayinlar ($RELEASES):"
  local active=""
  [ -L "$CURRENT" ] && active="$(basename "$(readlink -f "$CURRENT")")"
  for r in $(list_releases); do
    if [ "$r" = "$active" ]; then
      printf '  * %s  (yayinda)  %s\n' "$r" "$(du -sh "$RELEASES/$r" | cut -f1)"
    else
      printf '    %s             %s\n' "$r" "$(du -sh "$RELEASES/$r" | cut -f1)"
    fi
  done
}

# nginx'i yalnizca yapilandirma gecerliyse yeniden yukler.
reload_nginx() {
  "$NGINX" -t 2>&1 | sed 's/^/    /'
  "$NGINX" -t >/dev/null 2>&1 || die "nginx yapilandirmasi gecersiz; yeniden yukleme YAPILMADI"
  "$NGINX" -s reload
  log "nginx yeniden yuklendi"
}

# Yayinin gercekten ayakta oldugunu disaridan dogrular.
#
# --retry: 'nginx -s reload' hemen ardindan gelen ilk istek, kapanmakta olan
# eski worker'a denk gelip HTTP/2 cerceve hatasi verebiliyor (bir kez goruldu).
# Yayin saglikli, baglanti degil; bu yuzden yeniden deneniyor.
smoke_test() {
  local fail=0
  check() {
    local path="$1" expect="$2"
    local code
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 \
      --retry 3 --retry-delay 1 --retry-all-errors \
      --resolve "kurankesfi.tr:443:127.0.0.1" "https://kurankesfi.tr$path" 2>/dev/null)" || code="baglanti-hatasi"
    if [ "$code" = "$expect" ]; then
      printf '    %-34s %s\n' "$path" "$code"
    else
      printf '    %-34s %s  (beklenen %s) BASARISIZ\n' "$path" "$code" "$expect"
      fail=1
    fi
  }
  check "/"                        200
  check "/sureler"                 200
  check "/fatiha-suresi"           200
  check "/bakara-suresi/153"       200
  check "/nas-suresi/6"            200
  check "/404.html"                200
  check "/fonts/inter-latin.woff2" 200
  check "/data/surahs_index.json"  200
  check "/olmayan-bir-adres"       404
  # Depo ve gizli dosyalar disari acilmamali.
  check "/.user.ini"               404
  check "/manifest.json"           404
  [ "$fail" -eq 0 ] || die "duman testi basarisiz"
  log "duman testi temiz"
}

cmd_rollback() {
  [ -L "$CURRENT" ] || die "'$CURRENT' yok; geri alinacak yayin bulunamadi"
  local active previous
  active="$(basename "$(readlink -f "$CURRENT")")"
  previous="$(list_releases | grep -v "^${active}$" | tail -1)"
  [ -n "$previous" ] || die "geri alinacak onceki yayin yok"

  log "geri aliniyor: $active -> $previous"
  ln -sfn "$RELEASES/$previous" "$CURRENT.tmp"
  mv -Tf "$CURRENT.tmp" "$CURRENT"
  reload_nginx
  smoke_test
  log "geri alindi: $previous"
}

cmd_deploy() {
  [ -d "$DIST" ] || die "$DIST yok. Once 'pnpm build' calistirin."
  [ -f "$DIST/index.html" ] || die "$DIST/index.html yok; build eksik gorunuyor."
  [ -f "$DIST/404.html" ] || die "$DIST/404.html yok; build eksik gorunuyor."
  [ -d "$DIST/fonts" ] || die "$DIST/fonts yok; 'pnpm fonts' calistirilmamis."
  [ -d "$DIST/data" ] || die "$DIST/data yok; 'pnpm build:data' calistirilmamis."

  local pages
  pages="$(find "$DIST" -name '*.html' | wc -l)"
  [ "$pages" -ge 6000 ] || die "yalnizca $pages HTML dosyasi var; 6000+ bekleniyordu. Build eksik."

  # Yer kontrolu: yeni yayin + mevcut yayin ayni anda diskte duracak.
  local need_mb free_mb
  need_mb="$(du -sm "$DIST" | cut -f1)"
  free_mb="$(df -Pm "$SITE_ROOT" | awk 'NR==2 {print $4}')"
  [ "$free_mb" -gt $((need_mb * 2)) ] ||
    die "disk yetersiz: yayin ${need_mb} MB, bos ${free_mb} MB (en az $((need_mb * 2)) MB isteniyor)"

  local stamp target
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  target="$RELEASES/$stamp"

  log "yayin $stamp — $pages sayfa, ${need_mb} MB (bos: ${free_mb} MB)"
  mkdir -p "$RELEASES"

  # .part son ana kadar: kopyalama yarida kesilirse yarim dizin 'current'
  # olamaz, adindan da belli olur.
  rm -rf "$target.part"
  cp -a "$DIST" "$target.part"

  # SSL dogrulamasi: well-known lua blogu $document_root altina bakiyor,
  # yani 'current' icine. Sertifika yenilemesi kirilmasin diye her yayinda
  # sabit dizine bag kuruluyor.
  [ -d "$WELL_KNOWN" ] || mkdir -p "$WELL_KNOWN"
  ln -sfn "$WELL_KNOWN" "$target.part/.well-known"

  chown -R "$OWNER" "$target.part"
  find "$target.part" -type d -exec chmod 755 {} +
  find "$target.part" -type f -exec chmod 644 {} +

  mv -T "$target.part" "$target"
  log "dosyalar hazir: $target"

  local before=""
  [ -L "$CURRENT" ] && before="$(basename "$(readlink -f "$CURRENT")")"

  # Atomik gecis: ln -sfn yeni bir bag yazar, mv -T onu tek islemde
  # 'current' uzerine tasir. Ziyaretci hicbir an iki surum arasinda kalmaz.
  ln -sfn "$target" "$CURRENT.tmp"
  mv -Tf "$CURRENT.tmp" "$CURRENT"
  log "current -> $stamp${before:+  (onceki: $before)}"

  reload_nginx
  smoke_test

  # Eski yayinlari buda; yayindaki asla silinmez.
  local active
  active="$(basename "$(readlink -f "$CURRENT")")"
  local old
  old="$(list_releases | grep -v "^${active}$" | head -n -"$KEEP" || true)"
  for r in $old; do
    log "eski yayin siliniyor: $r"
    rm -rf "${RELEASES:?}/$r"
  done

  log "yayin tamam: https://kurankesfi.tr"
}

case "${1:-}" in
  --rollback) cmd_rollback ;;
  --list)     cmd_list ;;
  --smoke)    smoke_test ;;
  "")         cmd_deploy ;;
  *)          die "bilinmeyen secenek: $1 (--rollback | --list | --smoke veya bos)" ;;
esac
