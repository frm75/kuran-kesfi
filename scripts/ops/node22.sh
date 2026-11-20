#!/bin/sh
# Astro 7 Node >= 22.23 ister; sistem Node'u 20'dir ve sunucudaki baska
# uygulamalar ona baglidir, yukseltilmez. Astro komutlari (build, dev, check)
# bu sarmalayici uzerinden proje-yerel Node 22 ile calisir. Geri kalan her sey
# (pnpm install, tsx betikleri, servisler) sistem Node'unda kalir — boylece
# better-sqlite3 gibi yerel moduller tek bir Node surumune karsi derlenir.
#
# Kurulum: docs/DEPLOY_REPORT.md "Astro 7 / Node 22". Baska bir yol icin:
#   KURAN_NODE22=/yol/bin/node
NODE="${KURAN_NODE22:-/opt/kuran-node/bin/node}"
if [ ! -x "$NODE" ]; then
  echo "node22.sh: Node 22 bulunamadi: $NODE (bkz. docs/DEPLOY_REPORT.md)" >&2
  exit 1
fi
exec "$NODE" "$@"
