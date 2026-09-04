/**
 * Sitenin kendi adresi.
 *
 * Tek yerde durur çünkü iki farklı yerde MUTLAK adres gerekiyor ve ikisi
 * ayrışırsa sessizce bozulur:
 *   - sitemap.xml — `<loc>` göreli adres kabul etmez
 *   - Open Graph `og:image` / `og:url` — paylaşım botları göreli adresi
 *     çözmez, önizleme görselsiz çıkar
 *
 * Yapılandırmaya (env) taşınmadı: site tek alan adında yayınlanıyor ve
 * derleme çıktısı statik. Ortam değişkeni, üretimde okunmayacak bir
 * değişkeni her derlemede taşımak olurdu.
 */
export const SITE = "https://kurankesfi.tr";

/** Göreli yolu mutlak adrese çevirir. Yol her zaman `/` ile başlar. */
export const absoluteUrl = (path: string): string => {
  if (!path.startsWith("/")) {
    throw new Error(`absoluteUrl mutlak yol bekler, '${path}' aldi.`);
  }
  return `${SITE}${path}`;
};

/**
 * `Astro.url.pathname` → sitenin gerçekten yayınladığı adres.
 *
 * `build.format: "file"` ile Astro derleme sırasında ÇIKTI DOSYASININ yolunu
 * verir: `/sureler.html`, `/bakara-suresi/153.html`, `/index.html`. Yayınlanan
 * adres ise uzantısız (`trailingSlash: "never"`, nginx `try_files $uri $uri.html`).
 *
 * Bu fark iki yerde sessizce bozdu, ikisi de 200 döndüğü için fark edilmedi:
 *   - kanonik adres `.html` ile çıkıyordu, yani sitenin hiçbir yerden
 *     bağlanmadığı bir adresi kanonik ilan ediyordu
 *   - menüde `aria-current="page"` hiç çalışmıyordu (`/sureler.html` ===
 *     `/sureler` yanlış), ekran okuyucu bulunduğu bölümü söyleyemiyordu
 */
export const routePath = (pathname: string): string => {
  const withoutIndex = pathname.replace(/\/index\.html$/, "/");
  const withoutExtension = withoutIndex.replace(/\.html$/, "");
  if (withoutExtension === "" || withoutExtension === "/") return "/";
  return withoutExtension.replace(/\/+$/, "");
};
