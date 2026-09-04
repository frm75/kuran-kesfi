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
 * Ayni yontem Latin tarafina da uygulanir: ceviriyazi ve meal metinleri
 * Inter alt kumesiyle dizilir ve tam fontla karsilastirilir. Ceviriyazi
 * ḍ ḥ ḫ ḳ ṣ ṭ ẕ gibi Latin Genisletilmis Ek karakterler kullaniyor; bunlarin
 * biri dusse ayet okunusu bozuk gorunur ve hicbir sayfa testi bunu yakalamaz.
 *
 * Kullanim: pnpm --filter @kuran/fonts fonts:verify
 */

const FONTS_DIR = resolve(repoRoot, "apps/web/public/fonts");
const CACHE_DIR = resolve(repoRoot, "cache/fonts");
const DATA_DIR = resolve(repoRoot, "apps/web/public/data");
const SURAH_DIR = resolve(DATA_DIR, "surah");

interface Target {
  id: string;
  family: string;
  subsetFile: string;
  upstreamCache: string;
  script: "arab" | "latn";
  /** Hangi metin kumesiyle dogrulanacak. */
  corpus: "arabic" | "latin" | "headings";
}

const TARGETS: readonly Target[] = [
  {
    id: "amiri-quran",
    family: "Amiri Quran",
    subsetFile: "amiri-quran-arabic.woff2",
    upstreamCache: "amiri-quran.ttf",
    script: "arab",
    corpus: "arabic",
  },
  {
    id: "scheherazade-new",
    family: "Scheherazade New",
    subsetFile: "scheherazade-new-arabic.woff2",
    upstreamCache: "scheherazade-new.ttf",
    script: "arab",
    corpus: "arabic",
  },
  {
    id: "inter",
    family: "Inter",
    subsetFile: "inter-latin.woff2",
    upstreamCache: "inter.ttf",
    script: "latn",
    corpus: "latin",
  },
  {
    id: "playfair-display",
    family: "Playfair Display",
    subsetFile: "playfair-display-latin.woff2",
    upstreamCache: "playfair-display.ttf",
    script: "latn",
    // Baslik fontu govde metnini hic cizmez; ceviriyazi ve meal kapsamasi
    // aranmaz. Dogrulama sure adlari ve arayuz basliklariyla yapilir.
    corpus: "headings",
  },
];

interface Verse {
  key: string;
  text: string;
}

interface Corpus {
  arabic: Verse[];
  /** Ceviriyazi + ontanimli meal — govde fontunun gercekte dizecegi metin. */
  latin: Verse[];
  /** Sure adlari ve arayuz basliklari — baslik fontunun dizecegi metin. */
  headings: Verse[];
}

function loadCorpus(): Corpus {
  if (!existsSync(SURAH_DIR)) {
    fail(`Uretilmis veri yok: ${SURAH_DIR}\nOnce 'pnpm build:data' calistirin.`);
  }
  const arabic: Verse[] = [];
  const latin: Verse[] = [];
  const headings: Verse[] = [];

  // Arayuzde gecen sabit basliklar. Veriden turetilemez, elle yazilir;
  // yeni bir baslik eklenirse buraya da eklenmelidir.
  const UI_HEADINGS = [
    "Kur'an-ı Kerim Keşfi",
    "Keşfet • Oku • Anla",
    "Sureler",
    "Türkçe mealler",
    "İngilizce çeviriler",
    "Okunuşu",
    "Kaynaklar ve atıf",
    "Sayfa bulunamadı",
    "Neden Farklı",
    "Beş Keşif Kapısı",
    "Nasıl Çalışır",
    "Modüller",
    "Kaynak Şeffaflığı",
    "Bülten",
    "Kur'an'da Bugün",
    "Açık Kaynak",
    "Sadaka-i Cariye",
  ];
  for (const [index, text] of UI_HEADINGS.entries()) {
    headings.push({ key: `arayuz basligi ${index + 1}`, text });
  }

  for (const name of readdirSync(SURAH_DIR).filter((f) => f.endsWith(".json"))) {
    const surah = JSON.parse(readFileSync(resolve(SURAH_DIR, name), "utf8")) as {
      id: number;
      slug: string;
      nameTr: string;
      nameEn: string;
      verses: { verseNumber: number; textUthmani: string; transcriptionTr: string | null }[];
    };
    for (const verse of surah.verses) {
      const key = `${surah.id}:${verse.verseNumber}`;
      arabic.push({ key, text: verse.textUthmani });
      if (verse.transcriptionTr !== null) {
        latin.push({ key: `${key} okunus`, text: verse.transcriptionTr });
      }
    }
    latin.push({ key: `${surah.id} sure adi`, text: `${surah.nameTr} ${surah.slug}` });
    headings.push({
      key: `${surah.id} sure basligi`,
      text: `${surah.id}. ${surah.nameTr} Suresi — ${surah.nameEn}`,
    });
  }

  // Ontanimli mealin tamami: arayuzde en cok gorunen Latin metin bu.
  const translationDir = resolve(DATA_DIR, "translation");
  if (existsSync(translationDir)) {
    const authors = readdirSync(translationDir);
    const author = authors.includes("diyanet-isleri") ? "diyanet-isleri" : authors[0];
    if (author !== undefined) {
      for (const name of readdirSync(resolve(translationDir, author))) {
        const file = JSON.parse(
          readFileSync(resolve(translationDir, author, name), "utf8"),
        ) as { surahId: number; verses: { verseNumber: number; text: string }[] };
        for (const verse of file.verses) {
          latin.push({ key: `${file.surahId}:${verse.verseNumber} meal`, text: verse.text });
        }
      }
    }
  }

  return { arabic, latin, headings };
}

function makeShaper(
  hb: Harfbuzz,
  sfnt: Uint8Array,
  script: "arab" | "latn",
): (text: string) => ShapedGlyph[] {
  const blob = hb.createBlob(sfnt);
  const face = hb.createFace(blob, 0);
  const font = hb.createFont(face);

  return (text: string): ShapedGlyph[] => {
    const buffer = hb.createBuffer();
    buffer.addText(text);
    // Acikca ayarlaniyor: tahmine birakilirsa metnin ilk karakterine gore
    // degisir ve iki font farkli yollardan gecebilir.
    buffer.setDirection(script === "arab" ? "rtl" : "ltr");
    buffer.setScript(script === "arab" ? "Arab" : "Latn");
    buffer.setLanguage(script === "arab" ? "ar" : "tr");
    hb.shape(font, buffer);
    const result = buffer.json();
    buffer.destroy();
    return result;
  };
}

async function main(): Promise<void> {
  const corpus = loadCorpus();
  info(
    `dizilecek metin: ${corpus.arabic.length} Arapca ayet, ${corpus.latin.length} Latin satir, ` +
      `${corpus.headings.length} baslik`,
  );

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
    const shapeSubset = makeShaper(hb, subsetSfnt, target.script);
    const shapeFull = makeShaper(hb, readFileSync(upstreamPath), target.script);

    const corpusForTarget = corpus[target.corpus];

    let notdef = 0;
    let mismatch = 0;
    const examples: string[] = [];

    for (const verse of corpusForTarget) {
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
      info(
        `${target.family.padEnd(18)} ${corpusForTarget.length} satir TEMIZ — ` +
          "eksik glif yok, dizgi ayni",
      );
    } else {
      failed += 1;
      warn(
        `${target.family}: ${notdef} satirda eksik glif, ${mismatch} satirda dizgi farki\n` +
          examples.map((line) => `    ${line}`).join("\n"),
      );
    }
  }

  if (failed > 0) fail(`${failed} fontta dogrulama basarisiz.`);
  info("Tum fontlar dogrulandi.");
}

await main();
