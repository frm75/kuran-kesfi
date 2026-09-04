import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { info, warn, fail, repoRoot } from "@kuran/pipeline";
import subsetFont from "subset-font";
import { readFontInfo } from "./sfnt.js";

/**
 * Yazi tipi alt kumeleme — plan 1.3, 1.7; DESIGN.md 2 ve 9.
 *
 * Google Fonts CDN'i KULLANILMAZ. Ziyaretcinin tarayicisi ucuncu bir sunucuya
 * istek atmaz; fontlar kendi alan adimizdan gelir. Bu bir performans tercihi
 * degil, gizlilik tercihi: font istegi de IP adresi ve Referer tasir.
 *
 * Akis:
 *   1. Ust kaynaktan tam TTF indir (cache/fonts/ altina alinir, bir kez).
 *   2. Tam fontun cmap'ini oku, gereken kod noktalarini kapsiyor mu dogrula.
 *   3. hb-subset ile alt kumele (dogrulama icin sfnt, yayin icin woff2).
 *   4. Alt kumenin cmap'ini tekrar oku, ayni kod noktalari hala var mi bak.
 *      Eksik varsa build durur.
 *   5. woff2 + OFL lisans metni + manifest yaz.
 *
 * Kapsama listesi UYDURULMAZ: uretilen veride (apps/web/public/data) fiilen
 * gecen kod noktalarindan turetilir. Arayuz metinleri build aninda bilinmedigi
 * icin latin tarafina kucuk bir sabit taban eklenir (UI_BASE_RANGES).
 *
 * Kullanim:
 *   pnpm --filter @kuran/fonts fonts          uret
 *   pnpm --filter @kuran/fonts fonts:check    uretilenle diskteki ayni mi
 */

const OUT_DIR = resolve(repoRoot, "apps/web/public/fonts");
const CACHE_DIR = resolve(repoRoot, "cache/fonts");
const DATA_DIR = resolve(repoRoot, "apps/web/public/data");
const CODEPOINTS_FILE = resolve(import.meta.dirname, "codepoints.json");
const MANIFEST_FILE = resolve(OUT_DIR, "manifest.json");

const GOOGLE_FONTS_RAW = "https://raw.githubusercontent.com/google/fonts/main";

type Coverage = "arabic" | "latin" | "latin-headings";

interface FontSpec {
  id: string;
  /** CSS font-family adi */
  family: string;
  /** Ust kaynak dosya yolu (google/fonts deposu icinde) */
  upstreamPath: string;
  licensePath: string;
  outFile: string;
  licenseFile: string;
  coverage: Coverage;
  /**
   * Degisken font eksenlerinin daraltilmasi. Kullanmadigimiz bir ekseni
   * sabitlemek dosyayi ciddi kuculttugu icin acikca yaziliyor.
   */
  variationAxes?: Record<string, number | { min: number; max: number; default?: number }>;
  /** font-face'te yazilacak agirlik araligi */
  weightRange: string;
  note: string;
}

/**
 * Fontlar google/fonts deposundan alinir: tek kaynak, her fontun yaninda
 * kendi OFL.txt'si. Hepsi SIL Open Font License 1.1; lisans metnini birlikte
 * dagitmak OFL'nin sartidir, bu yuzden OFL dosyalari da public/fonts/ altina
 * kopyalanir ve manifest'te gosterilir.
 */
const FONTS: readonly FontSpec[] = [
  {
    id: "inter",
    family: "Inter",
    upstreamPath: "ofl/inter/Inter%5Bopsz,wght%5D.ttf",
    licensePath: "ofl/inter/OFL.txt",
    outFile: "inter-latin.woff2",
    licenseFile: "OFL-Inter.txt",
    coverage: "latin",
    // opsz sabitlendi: optik boyut ekseni kullanilmiyor (font-optical-sizing
    // kapali), tasimanin bedeli var. wght 300-700'e daraltildi; tasarim dili
    // bu araligin disina cikmiyor (DESIGN.md 2).
    variationAxes: { opsz: 16, wght: { min: 300, max: 700 } },
    weightRange: "300 700",
    note: "Arayuz ve meal metni.",
  },
  {
    id: "playfair-display",
    family: "Playfair Display",
    upstreamPath: "ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf",
    licensePath: "ofl/playfairdisplay/OFL.txt",
    outFile: "playfair-display-latin.woff2",
    licenseFile: "OFL-PlayfairDisplay.txt",
    coverage: "latin-headings",
    // Agirlik ekseni 600'e SABITLENDI. Olculdu:
    //   wght 500-700 degisken  48,7 KB
    //   wght 600-700 degisken  40,2 KB
    //   wght 600 sabit         26,4 KB
    // Plan 20.4 font butcesi (Latin-only sayfa < 95 KB) yalnizca sonuncusuyla
    // tutuyor. Basliklar zaten boyutla ayrisiyor, agirlikla degil.
    variationAxes: { wght: 600 },
    weightRange: "600",
    note: "Baslik yazi tipi (DESIGN.md 2). Govde metninde kullanilmaz.",
  },
  {
    id: "amiri-quran",
    family: "Amiri Quran",
    upstreamPath: "ofl/amiriquran/AmiriQuran-Regular.ttf",
    licensePath: "ofl/amiriquran/OFL.txt",
    outFile: "amiri-quran-arabic.woff2",
    licenseFile: "OFL-AmiriQuran.txt",
    coverage: "arabic",
    weightRange: "400",
    note: "Arapca ayet metni — ONTANIMLI. Mushaf hattina en yakin OFL font.",
  },
  {
    id: "scheherazade-new",
    family: "Scheherazade New",
    upstreamPath: "ofl/scheherazadenew/ScheherazadeNew-Regular.ttf",
    licensePath: "ofl/scheherazadenew/OFL.txt",
    outFile: "scheherazade-new-arabic.woff2",
    licenseFile: "OFL-ScheherazadeNew.txt",
    coverage: "arabic",
    weightRange: "400",
    note: "Arapca ikinci secenek: genis satir, dusuk kontrast, kucuk ekranda okunakli.",
  },
];

/**
 * Arayuz tabani.
 *
 * Veriden turetilemeyen tek sey arayuz metinleridir (buton yazilari, hata
 * mesajlari, ilerde eklenecek sayfalar). Bu yuzden veriye ek olarak kucuk,
 * acik bir taban aliniyor. Genis bloklar degil — 869 kod noktalik acik
 * araliklar denendi ve Inter'i 184 KB yapti; taban 200 kod noktasinin altinda
 * tutuluyor.
 */
const UI_BASE_RANGES: readonly (readonly [number, number])[] = [
  [0x0020, 0x007e], // Temel Latin
  [0x00a0, 0x00ff], // Latin-1 Ek (Turkce ç ö ü, © « » ° × ÷)
  [0x011e, 0x011f], // Ğ ğ
  [0x0130, 0x0131], // İ ı
  [0x015e, 0x015f], // Ş ş
  [0x2010, 0x2015], // tire ve cizgiler
  [0x2018, 0x201e], // tirnaklar
  [0x2020, 0x2022], // † ‡ •
  [0x2026, 0x2026], // …
  [0x2039, 0x203a], // ‹ ›
  [0x20ba, 0x20ba], // ₺
  [0x2190, 0x2193], // ← ↑ → ↓  (kesif yolu cubugu)
  [0x203a, 0x203a], // ›  (kesif yolu ayirici)
  [0x2713, 0x2714], // ✓ ✔
];

/** Fontta karsiligi olmayan, bicimlendirme/kontrol amacli kod noktalari. */
function isNonRenderable(cp: number): boolean {
  return (
    cp < 0x20 || // C0 kontrol
    (cp >= 0x7f && cp <= 0x9f) || // DEL + C1 kontrol
    cp === 0x00ad || // yumusak tire — gorunmez, cizilmez
    (cp >= 0x200b && cp <= 0x200f) || // sifir genislikli + yon isaretleri
    (cp >= 0x2028 && cp <= 0x202e) ||
    cp === 0xfeff
  );
}

// ---------------------------------------------------------------------------
// Kapsama listesi — uretilen veriden turetilir
// ---------------------------------------------------------------------------

/**
 * Baslik tabani.
 *
 * Playfair Display yalnizca basliklarda kullaniliyor (DESIGN.md 2). Basliklar
 * ceviriyazi (ḍ ḥ ṣ ṭ ẕ), Ibranice alinti ya da kesir isareti icermez; govde
 * kapsamasinin tamamini tasimak olculdu ve 57,3 KB yapiyordu — plan 20.4 font
 * butcesi (Latin-only sayfa < 95 KB) asiliyordu. Bu taban + sure adlarindaki
 * harfler yeterli.
 */
const HEADING_BASE_RANGES: readonly (readonly [number, number])[] = [
  [0x0020, 0x007e], // Temel Latin
  [0x00c0, 0x00ff], // Latin-1 aksanli harfler (â î û ü ö ç ...)
  [0x011e, 0x011f], // Ğ ğ
  [0x0130, 0x0131], // İ ı
  [0x015e, 0x015f], // Ş ş
  [0x2013, 0x2014], // – —
  [0x2018, 0x201d], // ' ' " "
  [0x2022, 0x2022], // •
  [0x2026, 0x2026], // …
  [0x203a, 0x203a], // ›
];

interface Coverages {
  /**
   * Uthmani ayet metninde gecen kod noktalari. Arapca fontun bunlari
   * kapsamamasi build'i durdurur — ayet eksik gosterilemez.
   */
  arabicRequired: number[];
  /**
   * Arap harfli ama ayet metninde OLMAYAN kod noktalari: meal ve dipnotlarda
   * gecen alintilar, Farsca/Urduca harfler (ornek U+06AF گ). Alt kumeye
   * alinmaya calisilir ama font tasimiyorsa build durmaz — bunlar govde
   * metninin icinde gecer, ayet degil.
   */
  arabicExtra: number[];
  latin: number[];
  /** Yalnizca basliklarda gecen kod noktalari — Playfair Display icin. */
  latinHeadings: number[];
  derivedFrom: string;
}

/** Arap harf bloklari — bu araliklar Arapca fonta, gerisi Latin fonta gider. */
function isArabicBlock(cp: number): boolean {
  return (
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0x08a0 && cp <= 0x08ff) ||
    (cp >= 0xfb50 && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfeff)
  );
}

function expandRanges(ranges: readonly (readonly [number, number])[]): number[] {
  const out: number[] = [];
  for (const [start, end] of ranges) {
    for (let cp = start; cp <= end; cp += 1) out.push(cp);
  }
  return out;
}

/**
 * Uretilen JSON'lardaki tum metinleri tarar.
 *
 * apps/web/public/data/ build ciktisidir ve git'e girmez; bu yuzden sonuc
 * `codepoints.json` olarak repoya yazilir ve veri yoksa oradan okunur. Veri
 * varsa her calismada YENIDEN turetilir — kaynak degisirse font sessizce
 * eskimez.
 */
function deriveCoverages(): Coverages {
  if (!existsSync(DATA_DIR)) {
    if (!existsSync(CODEPOINTS_FILE)) {
      fail(
        `Ne uretilmis veri (${DATA_DIR}) ne de ${CODEPOINTS_FILE} var.\n` +
          "Once 'pnpm build:data' calistirin.",
      );
    }
    info("veri yok — kapsama listesi codepoints.json dosyasindan okunuyor");
    const stored = JSON.parse(readFileSync(CODEPOINTS_FILE, "utf8")) as {
      arabicRequired: string[];
      arabicExtra: string[];
      latin: string[];
      latinHeadings: string[];
    };
    const parse = (list: string[]): number[] =>
      list.map((hex) => Number.parseInt(hex, 16)).sort((a, b) => a - b);
    return {
      arabicRequired: parse(stored.arabicRequired),
      arabicExtra: parse(stored.arabicExtra),
      latin: parse(stored.latin),
      latinHeadings: parse(stored.latinHeadings),
      derivedFrom: "codepoints.json",
    };
  }

  const arabicRequired = new Set<number>();
  const headings = new Set<number>();
  const arabic = new Set<number>();
  const other = new Set<number>();
  const nonRenderable = new Map<number, number>();
  let scannedFiles = 0;

  const scan = (text: string): void => {
    for (const char of text) {
      const cp = char.codePointAt(0);
      if (cp === undefined) continue;
      if (isNonRenderable(cp)) {
        nonRenderable.set(cp, (nonRenderable.get(cp) ?? 0) + 1);
        continue;
      }
      if (isArabicBlock(cp)) arabic.add(cp);
      else other.add(cp);
    }
  };

  // Once ayet metni: Arapca fontun ZORUNLU kapsamasi buradan gelir.
  const surahDir = resolve(DATA_DIR, "surah");
  for (const name of readdirSync(surahDir).filter((f) => f.endsWith(".json"))) {
    const parsed = JSON.parse(readFileSync(resolve(surahDir, name), "utf8")) as {
      nameTr: string;
      nameEn: string;
      verses: { textUthmani: string }[];
    };
    // Sure adlari baslik olarak cizilir; harfleri baslik kapsamasina girer.
    for (const char of `${parsed.nameTr} ${parsed.nameEn}`) {
      const cp = char.codePointAt(0);
      if (cp !== undefined && !isNonRenderable(cp) && !isArabicBlock(cp)) headings.add(cp);
    }
    for (const verse of parsed.verses) {
      for (const char of verse.textUthmani) {
        const cp = char.codePointAt(0);
        // Bosluk DAHIL: alt kumeleyici onu kendiliginden eklemiyor, cikarinca
        // her ayette .notdef olusuyor (HarfBuzz dogrulamasiyla yakalandi).
        if (cp !== undefined) arabicRequired.add(cp);
      }
    }
  }

  /** Herhangi bir JSON agacindaki butun dizeleri gezer. */
  const walk = (node: unknown): void => {
    if (typeof node === "string") scan(node);
    else if (Array.isArray(node)) for (const item of node) walk(item);
    else if (node !== null && typeof node === "object")
      for (const value of Object.values(node)) walk(value);
  };

  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith(".json")) {
        walk(JSON.parse(readFileSync(path, "utf8")));
        scannedFiles += 1;
      }
    }
  };
  visit(DATA_DIR);

  if (nonRenderable.size > 0) {
    // Bunlar font sorunu degil VERI sorunu: C1 kontrol karakterleri neredeyse
    // her zaman cp1252 metnin UTF-8 sanilmasindan gelir. Sessizce yutulmaz.
    const listed = [...nonRenderable.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([cp, n]) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}(${n})`)
      .join(" ");
    warn(`veride ${nonRenderable.size} gorunmez/kontrol kod noktasi var, fonta alinmadi: ${listed}`);
  }

  for (const cp of expandRanges(UI_BASE_RANGES)) {
    if (!isNonRenderable(cp)) other.add(cp);
  }
  for (const cp of expandRanges(HEADING_BASE_RANGES)) {
    if (!isNonRenderable(cp)) headings.add(cp);
  }
  // Baslik kumesi govde kumesinin alt kumesidir; Inter zaten hepsini tasiyor.
  for (const cp of headings) other.add(cp);
  for (const cp of arabicRequired) arabic.delete(cp);

  const result: Coverages = {
    arabicRequired: [...arabicRequired].sort((a, b) => a - b),
    arabicExtra: [...arabic].sort((a, b) => a - b),
    latin: [...other].sort((a, b) => a - b),
    latinHeadings: [...headings].sort((a, b) => a - b),
    derivedFrom: `${scannedFiles} JSON dosyasi + arayuz tabani`,
  };

  const hex = (list: number[]): string[] =>
    list.map((cp) => cp.toString(16).toUpperCase().padStart(4, "0"));
  const serialized =
    JSON.stringify(
      {
        "//": [
          "URETILEN DOSYA — elle duzenlenmez.",
          "apps/web/public/data/**/*.json icindeki tum metinlerde gecen kod",
          "noktalari + arayuz tabani (UI_BASE_RANGES). Alt kumeleme buna dayanir.",
          "Uretim: pnpm --filter @kuran/fonts fonts",
        ],
        scannedFiles,
        arabicRequired: hex(result.arabicRequired),
        arabicExtra: hex(result.arabicExtra),
        latin: hex(result.latin),
        latinHeadings: hex(result.latinHeadings),
      },
      null,
      2,
    ) + "\n";

  if (existsSync(CODEPOINTS_FILE) && readFileSync(CODEPOINTS_FILE, "utf8") !== serialized) {
    info("kapsama listesi degisti — codepoints.json guncelleniyor");
  }
  writeFileSync(CODEPOINTS_FILE, serialized, "utf8");
  return result;
}

// ---------------------------------------------------------------------------
// Indirme
// ---------------------------------------------------------------------------

async function download(path: string, cacheName: string): Promise<Buffer> {
  const cachePath = resolve(CACHE_DIR, cacheName);
  if (existsSync(cachePath)) return readFileSync(cachePath);

  const url = `${GOOGLE_FONTS_RAW}/${path}`;
  info(`indiriliyor: ${path}`);
  const response = await fetch(url, {
    headers: { "user-agent": "kurankesfi.tr font build (https://kurankesfi.tr)" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) fail(`${url} -> HTTP ${response.status} ${response.statusText}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) fail(`${url} -> bos yanit`);

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, buffer);
  return buffer;
}

// ---------------------------------------------------------------------------
// Ana akis
// ---------------------------------------------------------------------------

interface ManifestEntry {
  id: string;
  family: string;
  file: string;
  bytes: number;
  sha256: string;
  upstream: string;
  upstreamSha256: string;
  upstreamBytes: number;
  fontVersion: string | null;
  license: string;
  licenseFile: string;
  coverage: Coverage;
  weightRange: string;
  codepoints: number;
  glyphsBefore: number;
  glyphsAfter: number;
  note: string;
}

const sha256 = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

const formatCodepoints = (list: readonly number[]): string =>
  list
    .slice(0, 20)
    .map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");

async function main(): Promise<void> {
  const checkOnly = process.argv.includes("--check");

  const coverages = deriveCoverages();
  info(
    `kapsama (${coverages.derivedFrom}): ayet metni ${coverages.arabicRequired.length} ` +
      `(+${coverages.arabicExtra.length} arap harfli alinti), latin ${coverages.latin.length}, ` +
      `baslik ${coverages.latinHeadings.length}`,
  );

  mkdirSync(OUT_DIR, { recursive: true });
  const manifest: ManifestEntry[] = [];
  const written: { path: string; content: Buffer }[] = [];

  for (const spec of FONTS) {
    // Zorunlu kume: karsilanmazsa build durur.
    // Istenen kume: zorunlu + "olursa iyi olur" (arap harfli alintilar).
    const isArabic = spec.coverage === "arabic";
    const latinSet =
      spec.coverage === "latin-headings" ? coverages.latinHeadings : coverages.latin;
    const mandatory = isArabic ? coverages.arabicRequired : latinSet;
    const wanted = isArabic
      ? [...coverages.arabicRequired, ...coverages.arabicExtra].sort((a, b) => a - b)
      : latinSet;

    const original = await download(spec.upstreamPath, `${spec.id}.ttf`);
    const before = readFontInfo(original);

    // 1) Tam font ZORUNLU kumeyi kapsiyor mu?
    const missingMandatory = mandatory.filter((cp) => !before.codepoints.has(cp));
    if (isArabic && missingMandatory.length > 0) {
      fail(
        `${spec.family} ust kaynakta ayet metninin ${missingMandatory.length} kod noktasini ` +
          `tasimiyor: ${formatCodepoints(missingMandatory)}\n` +
          "Bu font Uthmani metni eksiksiz gosteremez.",
      );
    }
    // Latin ve arap harfli alintilarda eksik olabilir (Ibranice alintilar,
    // Farsca harfler, seyrek semboller). Tarayici bunlari sistem fontuna
    // dusurur; sessiz gecilmez, yazilir.
    const missingWanted = wanted.filter((cp) => !before.codepoints.has(cp));
    if (missingWanted.length > 0) {
      warn(
        `${spec.family} ${missingWanted.length} kod noktasini kapsamiyor, ` +
          `sistem fontuna dusecek: ${formatCodepoints(missingWanted)}`,
      );
    }
    const covered = wanted.filter((cp) => before.codepoints.has(cp));
    const text = covered.map((cp) => String.fromCodePoint(cp)).join("");

    const options = {
      ...(spec.variationAxes === undefined ? {} : { variationAxes: spec.variationAxes }),
      // TrueType hinting'i web'de kullanilmiyor; her fontta birkac KB.
      noHinting: true,
    };

    // 2) Dogrulama kopyasi: woff2 dogrudan okunamaz, sfnt okunabilir.
    const subsetSfnt = Buffer.from(
      await subsetFont(original, text, { ...options, targetFormat: "sfnt" }),
    );
    const after = readFontInfo(subsetSfnt);
    const lost = covered.filter((cp) => !after.codepoints.has(cp));
    if (lost.length > 0) {
      fail(
        `${spec.family} alt kumelemeden sonra ${lost.length} kod noktasi kayip: ` +
          formatCodepoints(lost),
      );
    }

    // 3) Yayinlanacak dosya.
    const woff2 = Buffer.from(
      await subsetFont(original, text, { ...options, targetFormat: "woff2" }),
    );
    written.push({ path: resolve(OUT_DIR, spec.outFile), content: woff2 });

    const licenseText = await download(spec.licensePath, `${spec.id}-OFL.txt`);
    written.push({ path: resolve(OUT_DIR, spec.licenseFile), content: licenseText });

    manifest.push({
      id: spec.id,
      family: spec.family,
      file: spec.outFile,
      bytes: woff2.length,
      sha256: sha256(woff2),
      upstream: `google/fonts:${decodeURIComponent(spec.upstreamPath)}`,
      upstreamSha256: sha256(original),
      upstreamBytes: original.length,
      fontVersion: before.version,
      license: "SIL Open Font License 1.1",
      licenseFile: spec.licenseFile,
      coverage: spec.coverage,
      weightRange: spec.weightRange,
      codepoints: covered.length,
      glyphsBefore: before.glyphCount,
      glyphsAfter: after.glyphCount,
      note: spec.note,
    });

    info(
      `${spec.family.padEnd(18)} ${String(covered.length).padStart(4)} kod noktasi · ` +
        `glif ${before.glyphCount} -> ${after.glyphCount} · ` +
        `${(original.length / 1024).toFixed(0)} KB -> ${(woff2.length / 1024).toFixed(1)} KB woff2`,
    );
  }

  const manifestBody =
    JSON.stringify(
      {
        "//": [
          "URETILEN DOSYA — elle duzenlenmez.",
          "Uretim: pnpm --filter @kuran/fonts fonts",
          "Tum fontlar SIL Open Font License 1.1; lisans metinleri bu dizindedir.",
          "Fontlar kendi sunucumuzdan servis edilir; Google Fonts CDN kullanilmaz.",
        ],
        fonts: manifest,
      },
      null,
      2,
    ) + "\n";
  written.push({ path: MANIFEST_FILE, content: Buffer.from(manifestBody, "utf8") });

  if (checkOnly) {
    const differences = written.filter(
      (item) => !existsSync(item.path) || !readFileSync(item.path).equals(item.content),
    );
    if (differences.length > 0) {
      fail(
        `Uretilen cikti diskteki ile ayni degil (${differences.length} dosya):\n` +
          differences.map((d) => `  ${d.path}`).join("\n") +
          "\n'pnpm --filter @kuran/fonts fonts' calistirip degisikligi commit'leyin.\n" +
          "Not: subset-font/harfbuzz surumu degistiyse woff2 baytlari da degisebilir.",
      );
    }
    info("--check temiz: uretilen cikti diskteki ile ayni.");
    return;
  }

  for (const item of written) writeFileSync(item.path, item.content);
  const total = manifest.reduce((sum, entry) => sum + entry.bytes, 0);
  info(`${written.length} dosya yazildi -> ${OUT_DIR}`);
  info(`toplam woff2: ${(total / 1024).toFixed(1)} KB`);
}

await main();
