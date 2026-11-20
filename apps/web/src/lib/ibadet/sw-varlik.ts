/**
 * Service worker'ın ön önbellek adımı için varlık çıkarıcı.
 *
 * Bu fonksiyon sw.js içine `String(varlikYollari)` ile GÖMÜLÜR; bu yüzden
 * kendi içinde kapalıdır: dışarıdan hiçbir şeye (import, modül değişkeni)
 * başvurmaz. Node'da da test edilir.
 *
 * metin: HTML, CSS ya da JS gövdesi. yol: o kaynağın kendi yolu ("/ibadet",
 * "/_astro/x.js"); göreli başvurular ("./ortak.js") ona göre çözülür.
 * Dönen: aynı kökenli /_astro/, /fonts/, /brand/ yolları (sorgu ve çapa atılır).
 */
export function varlikYollari(metin: string, yol: string): string[] {
  const koken = "https://kk.invalid";
  const desenler = [
    // HTML: src="..." href="..."
    /(?:src|href)\s*=\s*["']([^"']+)["']/g,
    // CSS: url(...)
    /url\(\s*["']?([^"')\s]+)["']?\s*\)/g,
    // JS: import ... from "./x.js", import "./x.js", import("./x.js")
    /(?:from|import)\s*\(?\s*["']((?:\.{1,2}\/|\/_astro\/)[^"']+)["']/g,
  ];
  const sonuc = new Set<string>();
  for (const desen of desenler) {
    for (const m of metin.matchAll(desen)) {
      const ham = m[1];
      // Şablon parçası (`link[href="${i}"]` gibi) gerçek bir yol değildir.
      if (ham === undefined || /[`${}<>\s]/.test(ham)) continue;
      let u: URL;
      try {
        u = new URL(ham, koken + yol);
      } catch {
        continue;
      }
      if (u.origin !== koken) continue;
      const p = u.pathname;
      if (p.startsWith("/_astro/") || p.startsWith("/fonts/") || p.startsWith("/brand/")) sonuc.add(p);
    }
  }
  return [...sonuc];
}
