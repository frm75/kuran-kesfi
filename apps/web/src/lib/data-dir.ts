import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Statik veri dizininin yolu — `apps/web/public/data`.
 *
 * ## Neden bu kadar uğraş
 *
 * Buranın önceki hâli her okuma kütüphanesinde tekrarlanan tek satırdı:
 *
 *     resolve(dirname(fileURLToPath(import.meta.url)), "../../public/data")
 *
 * Bu satır DEV'de her zaman, BUILD'de ise **yalnızca şans eseri** doğru
 * çalışıyor. Astro üretim build'inde modüller Vite tarafından paketleniyor ve
 * `import.meta.url` kaynak dosyanın değil, modülün düştüğü PAKETİN yolunu
 * gösteriyor. Paket yeri modülün kaç yerden import edildiğine göre değişiyor:
 *
 *   iki+ sayfadan import edilen  → `dist/chunks/manuscripts_*.mjs`
 *                                  ../../public/data = apps/web/public/data ✓
 *   tek sayfadan import edilen   → `dist/pages/_surah_/_verse_.astro.mjs`
 *                                  ../../public/data = dist/public/data ✗
 *
 * 2026-09-06'da tefsir bölümü tam olarak bunun yüzünden yayına çıkmadı:
 * `lib/tafsir.ts` yalnızca ayet sayfasından import ediliyordu, sayfa modülüne
 * gömüldü, `existsSync` false döndü ve bölüm **sessizce** hiç basılmadı. Hata
 * yok, uyarı yok, eksik bölüm var. Dev sunucusunda ise sorunsuz görünüyordu.
 *
 * Aynı tuzak `data.ts`, `manuscripts.ts` ve `media.ts` için de kuruluydu:
 * bugün çalışmalarının tek sebebi birden fazla sayfadan import edilmeleri.
 * Bir sayfa silinse ya da import değişse aynı sessiz kayıp orada da olurdu.
 *
 * ## Çözüm
 *
 * Yukarı doğru yürüyüp `public/data/surahs_index.json` dosyasını taşıyan ilk
 * dizini bul. Paketin nereye düştüğünden bağımsız, dev ve build'de aynı.
 * Bulunamazsa **hata verilir**: veri dizinini bulamamak sessizce boş sayfa
 * üretmekten iyidir.
 */
function findDataDir(): string {
  /** Veri dizini bundan tanınır; build'in her koşuda ürettiği dosya. */
  const MARKER = "public/data/surahs_index.json";

  let dir = dirname(fileURLToPath(import.meta.url));
  for (let step = 0; step < 12; step += 1) {
    if (existsSync(resolve(dir, MARKER))) return resolve(dir, "public/data");
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Statik veri dizini bulunamadi: ${dirname(fileURLToPath(import.meta.url))} ` +
      `dizininden yukari dogru '${MARKER}' aranidi. ` +
      "Once `pnpm build:data` calistirilmali (apps/web/public/data uretilir).",
  );
}

export const DATA_DIR = findDataDir();
