import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { info, warn, fail, repoRoot } from "@kuran/pipeline";
import { convert } from "fontverter";
import hbPromise, { type Harfbuzz, type ShapedGlyph } from "harfbuzzjs";

/**
 * Alt kumelenmis Arapca fontlarin ayet metnini gercekten dizebildigini
 * dogrular.
 *
 * cmap kapsamasi yetmez. Arapca'da bir harf bagimsiz/basta/ortada/sonda dort
 * bicim alir ve harekeler GPOS ile yerlestirilir; bunlarin glifleri cmap'te
 * gorunmez, GSUB uzerinden erisilir. Alt kumeleyicinin "layout closure"i
 * yanlis calisirsa cmap testi TEMIZ gorunur ama ayet bozuk dizilir.
 *
 * Bu yuzden HarfBuzz ile — tarayicinin kullandigi dizgi motorunun ta kendisi —
 * 6236 ayetin tamami iki kez diziliyor:
 *
 *   1. Alt kumede eksik glif (.notdef) var mi.
 *   2. Alt kume, TAM FONTLA ayni glif sayisini ve ayni kume (cluster)
 *      dizisini uretiyor mu. Uretmiyorsa bir yerlestirme kurali dusmustur.
 *
 * Glif ID'leri karsilastirilmaz: alt kumeleme glifleri yeniden numaralandirir,
 * esitlik beklenemez. Sayi ve kume dizisi degismezdir.
 *
 * Kullanim: pnpm --filter @kuran/fonts fonts:verify
 */

const FONTS_DIR = resolve(repoRoot, "apps/web/public/fonts");
const CACHE_DIR = resolve(repoRoot, "cache/fonts");
const SURAH_DIR = resolve(repoRoot, "apps/web/public/data/surah");

interface Target {
  id: string;
  family: string;
  subsetFile: string;
  upstreamCache: string;
}

const TARGETS: readonly Target[] = [
  {
    id: "amiri-quran",
    family: "Amiri Quran",
    subsetFile: "amiri-quran-arabic.woff2",
    upstreamCache: "amiri-quran.ttf",
  },
  {
    id: "scheherazade-new",
    family: "Scheherazade New",
    subsetFile: "scheherazade-new-arabic.woff2",
    upstreamCache: "scheherazade-new.ttf",
  },
];

interface Verse {
  key: string;
  text: string;
}

function loadVerses(): Verse[] {
  if (!existsSync(SURAH_DIR)) {
    fail(`Uretilmis veri yok: ${SURAH_DIR}\nOnce 'pnpm build:data' calistirin.`);
  }
  const verses: Verse[] = [];
  for (const name of readdirSync(SURAH_DIR).filter((f) => f.endsWith(".json"))) {
    const surah = JSON.parse(readFileSync(resolve(SURAH_DIR, name), "utf8")) as {
      id: number;
      verses: { verseNumber: number; textUthmani: string }[];
    };
    for (const verse of surah.verses) {
      verses.push({ key: `${surah.id}:${verse.verseNumber}`, text: verse.textUthmani });
    }
  }
  return verses;
}

function makeShaper(hb: Harfbuzz, sfnt: Uint8Array): (text: string) => ShapedGlyph[] {
  const blob = hb.createBlob(sfnt);
  const face = hb.createFace(blob, 0);
  const font = hb.createFont(face);

  return (text: string): ShapedGlyph[] => {
    const buffer = hb.createBuffer();
    buffer.addText(text);
    // Acikca ayarlaniyor: tahmine birakilirsa metnin ilk karakterine gore
    // degisir ve iki font farkli yollardan gecebilir.
    buffer.setDirection("rtl");
    buffer.setScript("Arab");
    buffer.setLanguage("ar");
    hb.shape(font, buffer);
    const result = buffer.json();
    buffer.destroy();
    return result;
  };
}

async function main(): Promise<void> {
  const verses = loadVerses();
  info(`${verses.length} ayet dizilecek`);

  const hb: Harfbuzz = await hbPromise;
  info(`HarfBuzz ${hb.version_string()}`);
  let failed = 0;

  for (const target of TARGETS) {
    const subsetPath = resolve(FONTS_DIR, target.subsetFile);
    const upstreamPath = resolve(CACHE_DIR, target.upstreamCache);
    if (!existsSync(subsetPath)) fail(`Yok: ${subsetPath} — once 'pnpm fonts' calistirin.`);
    if (!existsSync(upstreamPath)) {
      fail(`Yok: ${upstreamPath} — karsilastirma icin tam font gerekiyor ('pnpm fonts').`);
    }

    // HarfBuzz woff2 okumaz; yayinlanan dosyanin TA KENDISI sfnt'ye cevrilir.
    // Boylece testte kullanilan baytlar ile servis edilen baytlar ayni olur.
    const subsetSfnt = await convert(readFileSync(subsetPath), "truetype");
    const shapeSubset = makeShaper(hb, subsetSfnt);
    const shapeFull = makeShaper(hb, readFileSync(upstreamPath));

    let notdef = 0;
    let mismatch = 0;
    const examples: string[] = [];

    for (const verse of verses) {
      const subset = shapeSubset(verse.text);
      const full = shapeFull(verse.text);

      // Tam fontta da .notdef varsa sorun alt kumelemede degil kaynaktadir;
      // yalnizca alt kumelemenin EKLEDIGI eksikler sayilir.
      const missing =
        subset.filter((glyph) => glyph.g === 0).length -
        full.filter((glyph) => glyph.g === 0).length;
      if (missing > 0) {
        notdef += 1;
        if (examples.length < 5) examples.push(`${verse.key}: ${missing} eksik glif (.notdef)`);
      }

      const sameLength = subset.length === full.length;
      const sameClusters =
        sameLength && subset.every((glyph, index) => glyph.cl === full[index]?.cl);
      if (!sameLength || !sameClusters) {
        mismatch += 1;
        if (examples.length < 5) {
          examples.push(
            `${verse.key}: tam font ${full.length} glif, alt kume ${subset.length} glif`,
          );
        }
      }
    }

    if (notdef === 0 && mismatch === 0) {
      info(`${target.family.padEnd(18)} ${verses.length} ayet TEMIZ — eksik glif yok, dizgi ayni`);
    } else {
      failed += 1;
      warn(
        `${target.family}: ${notdef} ayette eksik glif, ${mismatch} ayette dizgi farki\n` +
          examples.map((line) => `    ${line}`).join("\n"),
      );
    }
  }

  if (failed > 0) fail(`${failed} fontta dogrulama basarisiz.`);
  info("Tum Arapca fontlar dogrulandi.");
}

await main();
