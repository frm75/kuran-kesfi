/**
 * Radyal yerlesim duman testleri.
 *
 * En kritik ozellik DETERMINIZM: plan §20.1 ayni girdinin ayni baytlari
 * uretmesini istiyor. Biri bu dosyayi bir gun force-directed simulasyona
 * cevirirse ilk test duser.
 *
 * Oyuncak girdi (2 grup, 4 kavram, 2 alt kavram) kucuk ve seyrek — cakisma/
 * gorus-alani testlerini hemen hemen her sabitle gecirir, bu yuzden gercek
 * yogunlugu YAKALAMAZ. Bu yuzden 6. bolum, gercek `concepts_index.json`
 * dosyasindan (109 kavram, en yogun grup 15 cocuklu) tam yerlesimi kurup
 * ayni denetimleri orada da yapiyor — sabit degisikligi (`MAKS_YARICAP`,
 * `ALT_YELPAZE_CARPANI`) burada dogrulanmazsa gercek atlasta sessizce
 * cakisma cikar.
 *
 * Calistirma:  pnpm --filter @kuran/web test:smoke
 */

import { existsSync, readFileSync } from "node:fs";
import { radyalYerlesim, kirisYolu } from "../graf.js";
import type { RadyalGirdi, RadyalGrup, RadyalCocuk } from "../graf.js";

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
      { slug: "b", label: "B", agirlik: 40, altlar: [
        { slug: "d", label: "D", agirlik: 5 },
        { slug: "e", label: "E", agirlik: 15 },
      ] },
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
check("her dugum uretildi", bir.dugumler.length === 7); // 2 grup + 3 cocuk + 2 alt
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
console.log("3. Ucuncu seviye (alt kavram)");
const altDugumler = bir.dugumler.filter((d) => d.derinlik === 2);
const bDugum = bir.dugumler.find((d) => d.slug === "b");
check("alt dugumler uretildi", altDugumler.length === 2);
check(
  "alt dugumler ebeveyninden merkeze daha uzak",
  bDugum !== undefined &&
    altDugumler.every((alt) => {
      const merkez = girdi.boyut / 2;
      return Math.hypot(alt.x - merkez, alt.y - merkez) > Math.hypot(bDugum.x - merkez, bDugum.y - merkez);
    }),
);
check(
  "alt dugumler birbiriyle ve ebeveynleriyle cakismiyor",
  altDugumler.every((d1) =>
    bir.dugumler.every((d2) => d1 === d2 || Math.hypot(d1.x - d2.x, d1.y - d2.y) > d1.r + d2.r - 0.01),
  ),
);

console.log("");
console.log("4. Kenarlar");
check("kenar korundu", bir.kenarlar.length === 1);
const a = bir.dugumler.find((d) => d.slug === "a");
const c = bir.dugumler.find((d) => d.slug === "c");
check(
  "kiris yolu gecerli SVG path",
  a !== undefined && c !== undefined && /^M [\d.-]+ [\d.-]+ Q [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+$/.test(kirisYolu(a, c, girdi.boyut / 2)),
);

console.log("");
console.log("5. Bos girdi");
const bos = radyalYerlesim({ boyut: 900, gruplar: [], kenarlar: [] });
check("bos girdi patlamiyor", bos.dugumler.length === 0 && bos.kenarlar.length === 0);

console.log("");
console.log("6. Gercek veri denetimi (concepts_index.json)");
interface GercekKavram {
  slug: string;
  nameTr: string;
  parentSlug: string | null;
  verseCount: number;
}
const idxYolu = "public/data/concepts_index.json";
if (!existsSync(idxYolu)) {
  console.log("  atlandi  gercek veri denetimi (concepts_index.json yok — once pnpm build:data)");
} else {
  const raw = JSON.parse(readFileSync(idxYolu, "utf8")) as { concepts: GercekKavram[] };
  const kavramlar = raw.concepts;

  // Taksonomi ebeveyn zincirinden cikariliyor: kokler (parentSlug null),
  // ikinci seviye (ebeveyni bir kok) ve ucuncu seviye (ebeveyni ikinci
  // seviyede) — build/lib/content.ts'in urettigi hiyerarsiyle ayni mantik.
  const kokler = kavramlar.filter((k) => k.parentSlug === null);
  const kokSlug = new Set(kokler.map((k) => k.slug));
  const ikinciSeviye = kavramlar.filter((k) => k.parentSlug !== null && kokSlug.has(k.parentSlug));
  const ucuncuSeviye = kavramlar.filter((k) => k.parentSlug !== null && !kokSlug.has(k.parentSlug));

  const gercekGruplar: RadyalGrup[] = kokler.map((kok) => ({
    slug: kok.slug,
    label: kok.nameTr,
    cocuklar: ikinciSeviye
      .filter((k) => k.parentSlug === kok.slug)
      .map((k): RadyalCocuk => {
        const altlar = ucuncuSeviye
          .filter((a) => a.parentSlug === k.slug)
          .map((a) => ({ slug: a.slug, label: a.nameTr, agirlik: a.verseCount }));
        return { slug: k.slug, label: k.nameTr, agirlik: k.verseCount, ...(altlar.length > 0 ? { altlar } : {}) };
      }),
  }));

  const gercekGirdi: RadyalGirdi = { boyut: 900, gruplar: gercekGruplar, kenarlar: [] };
  const gercekBir = radyalYerlesim(gercekGirdi);
  const gercekIki = radyalYerlesim(gercekGirdi);

  check(
    "gercek veri duzgun dugum sayisi uretiyor",
    gercekBir.dugumler.length === kokler.length + ikinciSeviye.length + ucuncuSeviye.length,
  );
  check(
    "gercek veride hicbir dugum gorus alani disinda degil",
    gercekBir.dugumler.every(
      (d) => d.x - d.r >= 0 && d.x + d.r <= gercekGirdi.boyut && d.y - d.r >= 0 && d.y + d.r <= gercekGirdi.boyut,
    ),
  );
  check(
    "gercek veride hicbir dugum cifti cakismiyor",
    gercekBir.dugumler.every((d1, i) =>
      gercekBir.dugumler.slice(i + 1).every((d2) => Math.hypot(d1.x - d2.x, d1.y - d2.y) > d1.r + d2.r - 0.01),
    ),
  );
  check("gercek veride ayni girdi ayni ciktiyi verir", JSON.stringify(gercekBir) === JSON.stringify(gercekIki));
}

console.log("");
if (failures.length > 0) {
  console.error(`${String(passed)} test gecti, ${String(failures.length)} basarisiz:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${String(passed)} test gecti, 0 basarisiz`);
