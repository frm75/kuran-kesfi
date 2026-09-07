/**
 * Menü veri bütünlüğü duman testleri.
 *
 * Menü yapısı TEK KAYNAKTAN geliyor (src/lib/nav.ts); şerit, hub sayfaları,
 * breadcrumb ve sitemap hep oradan besleniyor. Bu dosya o kaynağın kendi
 * içinde tutarlı kaldığını denetler — bozulursa hata build'de değil, sessizce
 * yanlış menüde ortaya çıkardı.
 *
 * Calistirma:  pnpm --filter @kuran/web test:smoke
 */

import { NAV, allNavPaths, findHub } from "../nav.js";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.error(`  HATA ${label}`);
  }
}

console.log("1. Yapi");

check("dort ust baslik var", NAV.length === 4);
check(
  "ust basliklar sirasiyla Oku, Anla, Kesfet, Kaynaklar",
  NAV.map((h) => h.label).join(",") === "Oku,Anla,Keşfet,Kaynaklar",
);
check(
  "her ust basligin en az iki cocugu var",
  NAV.every((h) => h.children.length >= 2),
);

console.log("");
console.log("2. Adresler");

const paths = allNavPaths();
check("her adres tekil", new Set(paths).size === paths.length);
check(
  "her adres '/' ile basliyor",
  paths.every((p) => p.startsWith("/")),
);
check(
  "hicbir adres '/' ile bitmiyor",
  paths.every((p) => p === "/" || !p.endsWith("/")),
);
check(
  "hicbir adres '.html' tasimiyor",
  paths.every((p) => !p.includes(".html")),
);

console.log("");
console.log("3. Metin");

check(
  "her ogenin bos olmayan etiketi var",
  NAV.every((h) => h.label.trim() !== "" && h.children.every((c) => c.label.trim() !== "")),
);
check(
  "her ogenin bos olmayan tanitim cumlesi var",
  NAV.every((h) => h.blurb.trim() !== "" && h.children.every((c) => c.blurb.trim() !== "")),
);

console.log("");
console.log("4. findHub");

check("hub adresi kendi hub'ini bulur", findHub("/anla")?.label === "Anla");
check("cocuk adresi ust hub'ini bulur", findHub("/kavramlar")?.label === "Anla");
check("yazmalar Kesfet altinda", findHub("/yazmalar")?.label === "Keşfet");
check("bilinmeyen adres null doner", findHub("/bakara-suresi") === null);
check("ayet adresi null doner", findHub("/bakara-suresi/255") === null);

console.log("");
console.log("5. Sure slug catismasi");

/*
 * Kok seviyede `[surah].astro` dinamik route'u var. Astro'da statik route
 * dinamigi yener, ama menude sure slug'iyla catisan bir hub acilirsa o sure
 * sayfasi ERISILEMEZ hale gelir ve kimse fark etmez. Sure slug'larinin hepsi
 * "-suresi" ile bitiyor; kural bu.
 */
check(
  "hicbir menu adresi '-suresi' ile bitmiyor",
  paths.every((p) => !p.endsWith("-suresi")),
);

console.log("");
if (failures.length > 0) {
  console.error(`${String(passed)} test gecti, ${String(failures.length)} basarisiz:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`${String(passed)} test gecti, 0 basarisiz`);
