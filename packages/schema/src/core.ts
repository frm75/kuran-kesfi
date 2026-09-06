/**
 * core.ts — plan §4, §12.15, §18.4, §19.6 cekirdek semalar. YALNIZCA ANA SITE.
 *
 * GOREV 01 bu icerigi tek dosya olarak tarif ediyordu; burada modullere bolunmus
 * hali yeniden disa aktarilir. Sapma bilerek yapildi:
 *
 *   - Bolunmus dosyalar (quran, word, story, concept, timeline, principle,
 *     discovery, source, subscription) zaten yazilmis ve scripts/import,
 *     scripts/build ile referans linter tarafindan kullaniliyor. Tek dosyaya
 *     birlestirmek davranis degistirmeyen ama genis bir yeniden yazim olurdu
 *     (CLAUDE.md kural 3: buyuk yeniden yazim yapilmaz).
 *   - GOREV 01'in bu bolunmeden bekledigi FAYDA korunuyor: yerel
 *     `kuran-extract` projesi cekirdege hic dokunmaz; yalnizca `references`,
 *     `scholar-notes` ve `export` alt yollarini import eder. Bkz. package.json
 *     "exports" alani.
 *
 * GOREV 01 / K3: §4.6 kullanici verisi (IndexedDB) buraya GIRMEZ. Sunucuda
 * tutulmaz; ayri dosyadadir (`user_data.ts`) ve cekirdek ile karistirilmaz.
 */

export * from "./common.js";
export * from "./source.js";
export * from "./quran.js";
export * from "./word.js";
export * from "./tafsir.js";
export * from "./manuscript.js";
export * from "./media.js";
export * from "./story.js";
export * from "./concept.js";
export * from "./timeline.js";
export * from "./principle.js";
export * from "./discovery.js";
export * from "./subscription.js";
