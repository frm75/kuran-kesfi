/**
 * Service worker duman testleri: varlik cikarici ve uretilen sw.js'in
 * sozdizimi (gomulu fonksiyon kendi icinde kapali mi).
 *
 * Calistirma:  pnpm --filter @kuran/web test:smoke
 */
import { varlikYollari } from "../sw-varlik.js";
import { GET } from "../../../pages/sw.js.js";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}
const ayni = (a: string[], b: string[]): boolean => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

{
  const html = `<link rel="stylesheet" href="/_astro/_surah_.Bs2QboFK.css">
<link rel="preload" href="/fonts/karla-latin.woff2" as="font" crossorigin>
<link rel="icon" href="/brand/favicon-32.png">
<script type="module" src="/_astro/index.astro_astro_type_script_index_0_lang.b9MIeQnF.js"></script>
<a href="/ibadet/kible">Kible</a> <a href="https://tanzil.net">t</a> <a href="//kotu.example/_astro/x.js">x</a>
<img src='/brand/logo-48.webp?v=2#c'>`;
  check(
    "html: /_astro, /fonts, /brand; sayfa ve dis bag yok",
    ayni(varlikYollari(html, "/ibadet"), [
      "/_astro/_surah_.Bs2QboFK.css",
      "/fonts/karla-latin.woff2",
      "/brand/favicon-32.png",
      "/_astro/index.astro_astro_type_script_index_0_lang.b9MIeQnF.js",
      "/brand/logo-48.webp",
    ]),
  );
}
{
  const js = `import{k as b}from"./ortak.RHdudYo0.js";import"./normalize.sN2FNjn3.js";const x=()=>import("./uygula.BwipNa8C.js");import {a} from '../_astro/types.DGoNkTTf.js';`;
  check(
    "js: statik ve dinamik goreli import",
    ayni(varlikYollari(js, "/_astro/index.b9.js"), [
      "/_astro/ortak.RHdudYo0.js",
      "/_astro/normalize.sN2FNjn3.js",
      "/_astro/uygula.BwipNa8C.js",
      "/_astro/types.DGoNkTTf.js",
    ]),
  );
}
{
  const css = `@font-face{src:url(/fonts/amiri-quran-arabic.woff2) format("woff2")}a{background:url("/brand/x.svg")}b{background:url(data:image/png;base64,AAA)}`;
  check(
    "css: url() fontlar ve gorseller, data: yok",
    ayni(varlikYollari(css, "/_astro/a.css"), ["/fonts/amiri-quran-arabic.woff2", "/brand/x.svg"]),
  );
}
check(
  "js: sablon parcasi yol sayilmaz",
  varlikYollari('document.querySelector(`link[href="${i}"]${m}`);a.href="/_astro/${x}.js"', "/_astro/ortak.js").length === 0,
);
check("bos metin", varlikYollari("", "/ibadet").length === 0);

{
  const metin = await (GET as unknown as () => Response)().text();
  let gecerli = true;
  try {
    // Yalniz derlenir; dinleyiciler calistirilmaz.
    new Function("self", "caches", "fetch", metin);
  } catch (h) {
    gecerli = false;
    console.error(h);
  }
  check("sw.js sozdizimi gecerli", gecerli);
  check("sw.js kabuk/varlik/calisma onbellekleri", /kk-ibadet-kabuk-/.test(metin) && /"kk-ibadet-varlik"/.test(metin) && /"kk-ibadet-calisma"/.test(metin));
  // Gomulu fonksiyon disariya basvurmamali: yalniz kendisiyle calistir.
  const m = /const varlikYollari = ([\s\S]*?);\n\nfunction varlikMi/.exec(metin);
  let calisti = false;
  if (m?.[1]) {
    const fn = new Function(`return (${m[1]});`)() as typeof varlikYollari;
    calisti = ayni(fn('<script src="/_astro/a.js"></script>', "/ibadet"), ["/_astro/a.js"]);
  }
  check("sw.js gomulu varlikYollari kendi basina calisir", calisti);
}

if (failures.length > 0) {
  console.error(`\n${String(failures.length)} denetim basarisiz:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log(`${String(passed)} denetim gecti`);
}
