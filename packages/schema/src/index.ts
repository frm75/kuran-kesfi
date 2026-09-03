/**
 * @kuran/schema — Zod semalari ve paylasilan tipler.
 *
 * ## Alt yollar (iki proje icin)
 *
 * Yerel `kuran-extract` projesi bu paketi git submodule ile baglar ve YALNIZCA
 * su ucunu import eder — cekirdege hic dokunmaz (GOREV 01):
 *
 *   @kuran/schema/references      is anahtarlari (brand + regex)
 *   @kuran/schema/scholar-notes   §23.2 hoca notlari
 *   @kuran/schema/export          projeler arasi JSON zarf sozlesmesi
 *
 * Ana site ayrica sunlari kullanir:
 *
 *   @kuran/schema/core            §4, §12.15, §18.4, §19.6 cekirdek
 *   @kuran/schema                 hepsi (bu dosya)
 *
 * ## Kullanim yerleri
 *
 *   scripts/import   elle hazirlanan data/** dosyalarini import oncesi dogrular
 *   scripts/build    referans linter; uretilen statik JSON'lari dogrular
 *   scripts/sync     inbox/ hoca notu paketlerini dogrular
 *   apps/web         statik JSON tuketimi
 */

export * from "./core.js";
export * from "./references.js";
export * from "./scholar-notes.js";
export * from "./export.js";
export * from "./user_data.js";
export * from "./static_data.js";
