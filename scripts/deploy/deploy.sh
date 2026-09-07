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
  check "/kaynaklar"               200
  check "/kok"                     200
  # Icerik katmani (2026-09-05): kissa, ilke, kavram, zaman, harita.
  # Bunlar veri tablolari bossa HIC uretilmez; 404 gelirse content import
  # calismamis demektir ve sessizce eksik site yayinlanmis olur.
  check "/kissalar"                200
  check "/kissa/hz-yusuf"          200
  check "/ilkeler"                 200
  check "/ilke/adalet"             200
  check "/kavramlar"               200
  check "/kavram/sabir"            200
  check "/zaman"                   200
  check "/harita"                  200
  # Okuma gunlugu (2026-09-07): tek sayfada donen JS uygulamasi. Sayfa 200
  # dondugu halde CSP'de script-src yoksa gunluk SESSIZCE bos kalir — asagida
  # CSP'si de ayrica denetleniyor.
  check "/gunluk"                  200
  # Iletisim formu (2026-09-07): sayfa + iki sonuc sayfasi. Sonuc sayfalari
  # eksikse form calisir ama gonderen kisi 404 gorur.
  check "/iletisim"                200
  check "/iletisim-tesekkur"       200
  check "/iletisim-hata"           200
  # Kok adresleri Arap harfi tasiyor; nginx'in yuzde kodlu istegi cozdugu
  # her yayinda dogrulanir (bir kez elle test edildi, sonra buraya alindi).
  check "/kok/%D9%82%D9%88%D9%84"  200
  check "/sitemap.xml"             200
  check "/robots.txt"              200
  check "/404.html"                200
  # Yazi tipleri — adlari 2026-09-04 tasarim degisikliginde degisti
  # (Inter -> Karla, Playfair Display -> Cormorant Garamond).
  check "/fonts/karla-latin.woff2"  200
  check "/fonts/cormorant-garamond-latin.woff2" 200
  check "/fonts/source-serif-latin.woff2" 200
  check "/fonts/amiri-quran-arabic.woff2" 200
  # Ceviriyazi yama fontu: dusrse ayet okunusu bozulur, sayfa yine 200 doner.
  check "/fonts/kesif-latin-ek.woff2" 200
  # Marka varliklari — logo dusrse menu ve hero bos kutu gosterir.
  check "/brand/logo-96.webp"      200
  check "/brand/favicon-32.png"    200
  # Hero videosu ve posteri — dusrse tanitim sayfasi bos kutu gosterir.
  check "/media/hero.mp4"          200
  check "/media/hero-poster.webp"  200
  check "/data/surahs_index.json"  200
  check "/olmayan-bir-adres"       404
  # Depo ve gizli dosyalar disari acilmamali.
  check "/.user.ini"               404
  check "/manifest.json"           404

  # Icerik denetimi: durum kodu 200 iken de yanlis olabilecek seyler.
  #
  # og:image goreli yazilirsa sayfa yine 200 doner ama paylasim onizlemesi
  # gorselsiz cikar — kimse fark etmez. Bu yuzden metnin kendisi okunur.
  # 2026-09-07: bu kontrol YANLIS ALARM verdi ve teshis edilemedi.
  #
  # Ayni sayfada iki denetim var (og:image ve kanonik adres); duman testi
  # arka arkaya calistirildiginda her seferinde BIRI dusuyordu, hangisinin
  # dustugu de degisiyordu. Sayfa elle 30 kez cekildiginde hic dusmuyordu —
  # yani icerik dogruydu, curl arada bir bos donuyordu.
  #
  # Eski surum bunu gorunmez kiliyordu: `2>/dev/null` curl'un hatasini
  # yutuyor, `|| body=""` de bos govdeyi "dizge bulunamadi" diye
  # raporluyordu. Yani AG HATASI ile ICERIK HATASI ayni cikti veriyordu.
  # Bir yayin bu yuzden basarisiz isaretlendi, oysa site saglamdi.
  #
  # Simdi: govde en fazla uc kez denenir ve dusen denetim curl'un cikis
  # kodunu, gelen bayt sayisini ve hata metnini yazar.
  contains() {
    local path="$1" needle="$2" label="$3"
    local body status attempt err
    err="$(mktemp)"
    for attempt in 1 2 3; do
      body="$(curl -sS --max-time 20 \
        --resolve "kurankesfi.tr:443:127.0.0.1" "https://kurankesfi.tr$path" 2>"$err")"
      status=$?
      if [ "$status" -eq 0 ] && printf '%s' "$body" | grep -qF -- "$needle"; then
        if [ "$attempt" -gt 1 ]; then
          printf '    %-34s %s (%s. denemede)\n' "$path" "$label" "$attempt"
        else
          printf '    %-34s %s\n' "$path" "$label"
        fi
        rm -f "$err"
        return
      fi
      sleep 1
    done
    printf '    %-34s %s BULUNAMADI (curl %s, %s bayt) %s\n' \
      "$path" "$label" "$status" "${#body}" "$(head -c 120 "$err" | tr '\n' ' ')"
    rm -f "$err"
    fail=1
  }
  contains "/bakara-suresi/153" \
    'property="og:image" content="https://kurankesfi.tr/brand/og-image.png"' "og:image mutlak"
  contains "/bakara-suresi/153" \
    'rel="canonical" href="https://kurankesfi.tr/bakara-suresi/153"' "kanonik adres"

  # Sunucu basligi denetimi.
  #
  # nginx yapilandirmasi repoda guncellenip CANLIYA UYGULANMAZSA hicbir sey
  # hata vermez: dosyalar 200 doner, sayfa acilir, yalnizca <video> sessizce
  # engellenir. Bir kez oldu (2026-09-04). Bu yuzden CSP'nin kendisi okunuyor.
  header_contains() {
    local path="$1" needle="$2" label="$3"
    local headers
    headers="$(curl -sS -D - -o /dev/null --max-time 20 \
      --retry 3 --retry-delay 1 --retry-all-errors \
      --resolve "kurankesfi.tr:443:127.0.0.1" "https://kurankesfi.tr$path" 2>/dev/null)" || headers=""
    if printf '%s' "$headers" | grep -qiF -- "$needle"; then
      printf '    %-34s %s\n' "$path" "$label"
    else
      printf '    %-34s %s BULUNAMADI\n' "$path" "$label"
      fail=1
    fi
  }
  # media-src olmadan hero videosu CSP tarafindan sessizce engellenir.
  header_contains "/" "media-src 'self'" "CSP media-src"
  # CSP KAPSAMI — 2026-09-05'te sayfaya gore ayrildi (bkz. infra/nginx map blogu).
  #
  # Iki yonlu denetim, cunku iki yonde de sessiz bozulma mumkun:
  #   1. Harita sayfasinda script-src DUSERSE harita bos kalir, hata vermez.
  #   2. Icerik sayfasina script-src SIZARSA 8100+ sayfanin "0 bayt JS"
  #      garantisi sessizce kaybolur ve kimse fark etmez.
  #
  # map blogunun regex'i yanlis yazilirsa (ornegin /kissa yerine /kissalar
  # eslesirse) ikisi de olur. Bu yuzden ornek adresler tek tek okunuyor.
  csp_of() {
    curl -sS -D - -o /dev/null --max-time 20 --retry 3 --retry-delay 1 \
      --retry-all-errors --resolve "kurankesfi.tr:443:127.0.0.1" \
      "https://kurankesfi.tr$1" 2>/dev/null | grep -i '^content-security-policy:' || true
  }
  csp_must_have() {
    local path="$1" needle="$2"
    if printf '%s' "$(csp_of "$path")" | grep -qi -- "$needle"; then
      printf '    %-34s %s\n' "$path" "CSP $needle var"
    else
      printf '    %-34s %s\n' "$path" "CSP $needle YOK — harita calismaz"
      fail=1
    fi
  }
  csp_must_not_have() {
    local path="$1" needle="$2"
    if printf '%s' "$(csp_of "$path")" | grep -qi -- "$needle"; then
      printf '    %-34s %s\n' "$path" "CSP $needle ACIK — BEKLENMIYOR"
      fail=1
    else
      printf '    %-34s %s\n' "$path" "CSP $needle kapali"
    fi
  }
  # Harita sayfalari: MapLibre ve PMTiles altligi icin acik olmali.
  csp_must_have "/harita"          "script-src 'self'"
  csp_must_have "/harita"          "worker-src 'self' blob:"
  csp_must_have "/harita"          "medya.kurankesfi.tr"
  # Uydu katmani: eksikse dugme goruntlenir ama tile'lar sessizce engellenir.
  csp_must_have "/harita"          "ibasemaps-api.arcgis.com"
  csp_must_have "/kissa/hz-musa"   "script-src 'self'"
  # Gunluk: betik olmadan sayfa acilir ama hicbir sey yapmaz; connect-src
  # olmadan not satirinin yanindaki ayet metni sessizce gelmez.
  csp_must_have "/gunluk"          "script-src 'self'"
  csp_must_have "/gunluk"          "connect-src 'self'"
  # Iletisim: form-action olmadan tarayici POST'u ENGELLER ve hicbir hata
  # gostermez — sayfa acilir, "Gonder" hicbir sey yapmaz.
  csp_must_have "/iletisim"        "form-action 'self'"
  # Arka uc ayakta mi: servis dusmusse POST 502 doner ve mesaj kaybolur.
  # Yalnizca yerelden okunur; ucu disariya acilmadi.
  if curl -sf --max-time 10 http://127.0.0.1:4380/api/iletisim/durum >/dev/null 2>&1; then
    printf '    %-34s %s\n' "/api/iletisim" "arka uc ayakta"
  else
    printf '    %-34s %s\n' "/api/iletisim" "ARKA UC CEVAP VERMIYOR (pm2: kuran-iletisim)"
    fail=1
  fi
  # Geri kalan her sey: 0 bayt JS garantisini sunucu tarafinda zorlayan sey bu.
  csp_must_not_have "/"                  "script-src"
  csp_must_not_have "/bakara-suresi/153" "script-src"
  # Kiraat (2026-09-07): ayet sayfasindaki <audio> R2'den caliyor. media-src
  # duserse oynatici gorunur ama SES GELMEZ, hata da vermez.
  header_contains "/bakara-suresi/153" "medya.kurankesfi.tr" "CSP kiraat media-src"
  csp_must_not_have "/kissalar"          "script-src"
  csp_must_not_have "/sureler"           "script-src"
  # Form yalnizca /iletisim'de acik; baska bir sayfada acilirsa CSP genislemis
  # demektir ve bu sessizce olur.
  csp_must_not_have "/bakara-suresi/153" "form-action 'self'"

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
