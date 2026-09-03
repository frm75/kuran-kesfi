/**
 * @kuran/schema — Zod semalari ve paylasilan tipler.
 *
 * Kapsam: plan 4 (cekirdek), 12.15 (kesif katmani), 18.4 (ilkeler),
 * 19.6 (abonelik), 4.6 (tarayici verisi).
 *
 * Bu semalar iki yerde kullanilir:
 *   1. scripts/import — elle hazirlanan data/** JSON dosyalarini import
 *      oncesi dogrular (plan 5.4, 10).
 *   2. scripts/build — referans linter, uretilen statik JSON'lari dogrular
 *      (plan 20.1). Linter gecmeden build tamamlanmaz.
 */

export * from "./common.js";
export * from "./source.js";
export * from "./quran.js";
export * from "./word.js";
export * from "./story.js";
export * from "./concept.js";
export * from "./timeline.js";
export * from "./principle.js";
export * from "./discovery.js";
export * from "./subscription.js";
export * from "./user_data.js";
