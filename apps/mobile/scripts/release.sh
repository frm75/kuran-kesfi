#!/usr/bin/env bash
# Play'e yuklenecek imzali AAB uretir: web paketi -> cap sync -> versionCode -> bundleRelease.
# Upload anahtari (keystore) repoda DURMAZ; yolu ve sifreleri .env'den ya da ortamdan okunur.
set -euo pipefail

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$MOBILE_DIR/../.." && pwd)"
GRADLE_FILE="$MOBILE_DIR/android/app/build.gradle"
AAB="$MOBILE_DIR/android/app/build/outputs/bundle/release/app-release.aab"

# .env'den yalnizca ANDROID_* anahtarlari alinir; ortamda zaten varsa ortam kazanir.
if [ -f "$ROOT_DIR/.env" ]; then
  for key in ANDROID_KEYSTORE_PATH ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS; do
    if [ -z "${!key:-}" ]; then
      line="$(grep -E "^${key}=" "$ROOT_DIR/.env" | tail -n1 || true)"
      if [ -n "$line" ]; then
        val="${line#*=}"
        val="${val%\"}"; val="${val#\"}"
        export "$key=$val"
      fi
    fi
  done
fi

if [ -z "${ANDROID_KEYSTORE_PATH:-}" ] || [ ! -f "${ANDROID_KEYSTORE_PATH:-}" ]; then
  cat >&2 <<MSG
HATA: Upload anahtari (keystore) bulunamadi.
  ANDROID_KEYSTORE_PATH = '${ANDROID_KEYSTORE_PATH:-<tanimsiz>}'

Anahtari bir kez kendiniz uretin ve REPO DISINDA saklayin (kaybederseniz uygulamayi guncelleyemezsiniz):

  keytool -genkeypair -v -keystore <yol>/upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000

Sonra .env dosyasina yazin:
  ANDROID_KEYSTORE_PATH=<yol>/upload.keystore
  ANDROID_KEYSTORE_PASSWORD=<keystore sifresi>
  ANDROID_KEY_ALIAS=upload
MSG
  exit 1
fi
if [ -z "${ANDROID_KEYSTORE_PASSWORD:-}" ] || [ -z "${ANDROID_KEY_ALIAS:-}" ]; then
  echo "HATA: ANDROID_KEYSTORE_PASSWORD ve ANDROID_KEY_ALIAS .env'de tanimli olmali." >&2
  exit 1
fi
export ANDROID_KEYSTORE_PATH ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS
# ANDROID_KEY_PASSWORD istege bagli; yoksa gradle keystore sifresini kullanir (ortamda varsa otomatik gecer).

echo "==> 1/4 Web paketi ve cap sync"
(cd "$ROOT_DIR" && pnpm --filter @kuran/mobile build)

echo "==> 2/4 versionCode artiriliyor"
current="$(grep -E '^[[:space:]]*versionCode[[:space:]]+[0-9]+' "$GRADLE_FILE" | head -n1 | grep -oE '[0-9]+')"
next=$((current + 1))
sed -i -E "s/^([[:space:]]*versionCode[[:space:]]+)[0-9]+/\1${next}/" "$GRADLE_FILE"
echo "    versionCode: $current -> $next (apps/mobile/android/app/build.gradle; commit'e almayi unutmayin)"

echo "==> 3/4 bundleRelease"
if ! (cd "$MOBILE_DIR/android" && ./gradlew bundleRelease); then
  sed -i -E "s/^([[:space:]]*versionCode[[:space:]]+)[0-9]+/\1${current}/" "$GRADLE_FILE"
  echo "HATA: bundleRelease basarisiz. versionCode eski degerine ($current) geri alindi." >&2
  exit 1
fi

echo "==> 4/4 Cikti"
if [ ! -f "$AAB" ]; then
  echo "HATA: AAB uretilmedi: $AAB" >&2
  exit 1
fi
echo "$AAB"
