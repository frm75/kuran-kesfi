/**
 * Radyal yerlesim duman testleri.
 *
 * En kritik ozellik DETERMINIZM: plan §20.1 ayni girdinin ayni baytlari
 * uretmesini istiyor. Biri bu dosyayi bir gun force-directed simulasyona
 * cevirirse ilk test duser.
 *
 * Calistirma:  pnpm --filter @kuran/web test:smoke
 */

import { radyalYerlesim, kirisYolu } from "../graf.js";
import type { RadyalGirdi } from "../graf.js";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean): void {
  if (ok) { passed += 1; console.log(`  ok   ${label}`); }
  else { failures.push(label); console.error(`  HATA ${label}`); }
}

const girdi: RadyalGirdi = {
  boyut: 900,
  gruplar: [
    { slug: "g1", label: "Grup 1", cocuklar: [
      { slug: "a", label: "A", agirlik: 10 },
      { slug: "b", label: "B", agirlik: 40 },
    ] },
    { slug: "g2", label: "Grup 2", cocuklar: [
      { slug: "c", label: "C", agirlik: 25 },
    ] },
  ],
  kenarlar: [{ a: "a", b: "c", type: "contrast", weight: 3, origin: "curated" }],
};

console.log("1. Determinizm");
const bir = radyalYerlesim(girdi);
const iki = radyalYerlesim(girdi);
check("ayni girdi ayni ciktiyi verir", JSON.stringify(bir) === JSON.stringify(iki));

console.log("");
console.log("2. Yerlesim");
check("her dugum uretildi", bir.dugumler.length === 5); // 2 grup + 3 cocuk
check(
  "hicbir dugum gorus alani disinda degil",
  bir.dugumler.every((d) => d.x - d.r >= 0 && d.x + d.r <= girdi.boyut && d.y - d.r >= 0 && d.y + d.r <= girdi.boyut),
);
check(
  "buyuk agirlik buyuk yaricap",
  (bir.dugumler.find((d) => d.slug === "b")?.r ?? 0) > (bir.dugumler.find((d) => d.slug === "a")?.r ?? 0),
);
check(
  "grup dugumleri cocuklarindan ice yakin",
  bir.dugumler.filter((d) => d.derinlik === 0).every((g) => {
    const merkez = girdi.boyut / 2;
    const gr = Math.hypot(g.x - merkez, g.y - merkez);
    return bir.dugumler.filter((d) => d.derinlik === 1 && d.grup === g.slug)
      .every((c) => Math.hypot(c.x - merkez, c.y - merkez) > gr);
  }),
);
check(
  "hicbir dugum cifti cakismiyor",
  bir.dugumler.every((d1, i) =>
    bir.dugumler.slice(i + 1).every((d2) => Math.hypot(d1.x - d2.x, d1.y - d2.y) > d1.r + d2.r - 0.01),
  ),
);

console.log("");
console.log("3. Kenarlar");
check("kenar korundu", bir.kenarlar.length === 1);
const a = bir.dugumler.find((d) => d.slug === "a");
const c = bir.dugumler.find((d) => d.slug === "c");
check(
  "kiris yolu gecerli SVG path",
  a !== undefined && c !== undefined && /^M [\d.-]+ [\d.-]+ Q [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+$/.test(kirisYolu(a, c, girdi.boyut / 2)),
);

console.log("");
console.log("4. Bos girdi");
const bos = radyalYerlesim({ boyut: 900, gruplar: [], kenarlar: [] });
check("bos girdi patlamiyor", bos.dugumler.length === 0 && bos.kenarlar.length === 0);

console.log("");
if (failures.length > 0) {
  console.error(`${String(passed)} test gecti, ${String(failures.length)} basarisiz:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${String(passed)} test gecti, 0 basarisiz`);
