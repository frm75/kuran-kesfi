import type { APIRoute } from "astro";
import { getSurahsIndex } from "~/lib/data";

/**
 * sitemap.xml — arama motorları için adres listesi.
 *
 * Elle bakım yok: adresler `surahs_index.json`'dan türetilir, yani veri
 * değişince sitemap de değişir. Astro entegrasyonu kullanılmadı; tek dosya
 * için bir bağımlılık eklemenin anlamı yok.
 *
 * 6354 adres tek dosyada. Sitemap sınırı 50.000 adres / 50 MB, rahat sığıyor.
 *
 * `lastmod` YAZILMIYOR: doğru değeri metnin gerçekten değiştiği tarihtir,
 * build tarihi değil. Her build'de bugünün tarihini yazmak arama motoruna
 * yalan söylemek olurdu (site haftada bir yeniden derlenirse 6354 sayfa
 * "değişti" görünür).
 */

const SITE = "https://kurankesfi.tr";

export const GET: APIRoute = () => {
  const { surahs } = getSurahsIndex();

  const urls: { loc: string; priority: string }[] = [
    { loc: "/", priority: "1.0" },
    { loc: "/sureler", priority: "0.9" },
    { loc: "/kaynaklar", priority: "0.7" },
  ];

  for (const surah of surahs) {
    urls.push({ loc: `/${surah.slug}`, priority: "0.8" });
    for (let verse = 1; verse <= surah.verseCount; verse += 1) {
      urls.push({ loc: `/${surah.slug}/${verse}`, priority: "0.6" });
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
