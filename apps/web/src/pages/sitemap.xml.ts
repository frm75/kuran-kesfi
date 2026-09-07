import type { APIRoute } from "astro";
import {
  authorHasSurah,
  getConceptsIndex,
  getDefaultAuthor,
  getPrinciplesIndex,
  getRootsIndex,
  getStoriesIndex,
  getSurahsIndex,
  getTurkishAuthors,
} from "~/lib/data";
import { getCenturyBuckets, getManuscripts } from "~/lib/manuscripts";
import { NAV } from "~/lib/nav";
import { SITE } from "~/lib/site";

/**
 * sitemap.xml — arama motorları için adres listesi.
 *
 * Elle bakım yok: adresler `surahs_index.json`'dan türetilir, yani veri
 * değişince sitemap de değişir. Astro entegrasyonu kullanılmadı; tek dosya
 * için bir bağımlılık eklemenin anlamı yok.
 *
 * ~9350 adres tek dosyada (2849'u meal sayfası). Sitemap sınırı 50.000 adres /
 * 50 MB, rahat sığıyor.
 *
 * `lastmod` YAZILMIYOR: doğru değeri metnin gerçekten değiştiği tarihtir,
 * build tarihi değil. Her build'de bugünün tarihini yazmak arama motoruna
 * yalan söylemek olurdu (site haftada bir yeniden derlenirse 6354 sayfa
 * "değişti" görünür).
 */

export const GET: APIRoute = () => {
  const { surahs } = getSurahsIndex();
  const { roots } = getRootsIndex();

  const urls: { loc: string; priority: string }[] = [
    { loc: "/", priority: "1.0" },
    // Hub sayfalari nav.ts'ten geliyor: menu degisince sitemap de degisir.
    // /kaynaklar hem hub hem cocuk oldugu icin bir kez girsin diye Set.
    ...[...new Set(NAV.map((hub) => hub.href))].map((loc) => ({ loc, priority: "0.9" })),
    { loc: "/sureler", priority: "0.9" },
    { loc: "/kissalar", priority: "0.9" },
    { loc: "/zaman", priority: "0.8" },
    { loc: "/kavramlar", priority: "0.8" },
    { loc: "/ilkeler", priority: "0.8" },
    { loc: "/harita", priority: "0.8" },
    { loc: "/kok", priority: "0.8" },
    { loc: "/yazmalar", priority: "0.7" },
  ];

  // Yazma sayfalari — 2322 kayit. Yuzyil sayfalari da listelenir ki katalogun
  // tamami sitemap uzerinden dolasilabilsin.
  for (const bucket of getCenturyBuckets()) {
    urls.push({ loc: `/yazmalar/${bucket.slug}`, priority: "0.5" });
  }
  for (const manuscript of getManuscripts()) {
    urls.push({ loc: `/yazma/${String(manuscript.id)}`, priority: "0.4" });
  }

  // Icerik katmani — tablolar bossa bu listeler bos doner, sitemap kucululur.
  for (const story of getStoriesIndex()) urls.push({ loc: `/kissa/${story.slug}`, priority: "0.7" });
  for (const principle of getPrinciplesIndex()) {
    urls.push({ loc: `/ilke/${principle.slug}`, priority: "0.7" });
  }
  for (const concept of getConceptsIndex()) {
    urls.push({ loc: `/kavram/${concept.slug}`, priority: "0.6" });
  }

  // Kok adresleri Arapca harf tasiyor; sitemap'te yuzde kodlu olmalari gerekir.
  for (const root of roots) {
    urls.push({ loc: `/kok/${encodeURIComponent(root.arabic)}`, priority: "0.5" });
  }

  /**
   * Meal sayfalari (2026-09-06).
   *
   * Ontanimli meal disindaki 25 Turkce meal, sure basina bir adres. Kendi
   * kanonigi olan gercek sayfalar: Arapca metin tekrar etse de sayfanin
   * KONUSU o mealin metnidir ve "Bakara suresi Elmalili meali" gercek bir
   * arama. Yine de onceligi ayet sayfalarinin altinda: sitenin merkezi ayet.
   */
  const defaultAuthorSlug = getDefaultAuthor().slug;
  const mealAuthors = getTurkishAuthors().filter((author) => author.slug !== defaultAuthorSlug);

  for (const surah of surahs) {
    urls.push({ loc: `/${surah.slug}`, priority: "0.8" });
    for (let verse = 1; verse <= surah.verseCount; verse += 1) {
      urls.push({ loc: `/${surah.slug}/${verse}`, priority: "0.6" });
    }
    for (const author of mealAuthors) {
      // Uretilmeyen sayfa sitemap'e girmez, yoksa arama motoruna 404 vaat eder.
      if (!authorHasSurah(author, surah.id)) continue;
      urls.push({ loc: `/${surah.slug}/meal/${author.slug}`, priority: "0.4" });
    }
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (url) => `  <url><loc>${SITE}${url.loc}</loc><priority>${url.priority}</priority></url>`,
    ),
    "</urlset>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
