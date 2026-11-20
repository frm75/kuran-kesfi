/**
 * B. Uretilen statik JSON — Zod semalarina karsi dogrulama ve dosyalar arasi
 * tutarlilik.
 *
 * Dosya turu basina denetimler `static/` altinda; burada yalnizca dongu, yol ->
 * denetim tablosu ve butun dosyalar gorulmeden sinanamayan kurallar durur.
 */

import { readFileSync, statSync } from "node:fs";
import { relative } from "node:path";
import {
  schedule,
} from "@kuran/schema";
import { info } from "@kuran/pipeline";
import { dataRoot } from "../lib/emit.js";
import { checkPrincipleAreaCounts, checkPrincipleOppositeReciprocity } from "../lib/principle_checks.js";
import { errors, tick, warn } from "./report.js";
import { listJsonFiles } from "./files.js";
import {
  checkSurahsIndex,
  checkSources,
  checkScripture,
  checkAuthorsIndex,
  checkTranslationFile,
  checkVerseFile,
  checkSurahFile,
  checkRootsIndex,
  checkRootFile,
  checkWordFile,
} from "./static/quran.js";
import {
  checkStoriesIndex,
  checkStoryFile,
  checkLocations,
  checkTimeline,
  checkPrinciplesIndex,
  checkPrincipleFile,
  checkPrincipleAreas,
  checkConceptsIndex,
  checkConceptFile,
  checkVerseLinks,
  checkSections,
  checkVerseRelations,
} from "./static/content.js";
import {
  checkManuscripts,
  checkVerseManuscripts,
  checkSchedule,
  checkRecitation,
  checkTafsirIndex,
  checkTafsirFile,
  checkMedia,
  checkVerseMedia,
} from "./static/sources.js";
import { createStaticState } from "./static/state.js";
import type { StaticFile, StaticState } from "./static/state.js";

type Handler = (file: StaticFile, s: StaticState) => void;

/** Tam yol eslesmesi: tekil dizin/veri dosyalari. */
const EXACT = new Map<string, Handler>([
  ["surahs_index.json", checkSurahsIndex],
  ["sources.json", checkSources],
  ["scripture.json", checkScripture],
  ["authors_index.json", checkAuthorsIndex],
  ["roots_index.json", checkRootsIndex],
  ["stories_index.json", checkStoriesIndex],
  ["locations.json", checkLocations],
  ["timeline.json", checkTimeline],
  ["principles_index.json", checkPrinciplesIndex],
  ["principle_areas.json", checkPrincipleAreas],
  ["concepts_index.json", checkConceptsIndex],
  ["verse_links.json", checkVerseLinks],
  ["sections.json", checkSections],
  ["verse_relations.json", checkVerseRelations],
  ["manuscripts.json", checkManuscripts],
  ["verse_manuscripts.json", checkVerseManuscripts],
  ["schedule.json", checkSchedule],
  ["recitation.json", checkRecitation],
  ["tafsir_index.json", checkTafsirIndex],
  ["media.json", checkMedia],
  ["verse_media.json", checkVerseMedia],
]);

/** On ek eslesmesi: dizin basina bir dosya turu. */
const PREFIXED: readonly (readonly [string, Handler])[] = [
  ["translation/", checkTranslationFile],
  ["verse/", checkVerseFile],
  ["surah/", checkSurahFile],
  ["root/", checkRootFile],
  ["word/", checkWordFile],
  ["story/", checkStoryFile],
  ["principle/", checkPrincipleFile],
  ["concept/", checkConceptFile],
  ["tafsir/", checkTafsirFile],
];

export function checkStaticOutput(): void {
  info("B. uretilen statik JSON");

  const files = listJsonFiles(dataRoot);
  if (files.length === 0) {
    errors.push("statik cikti: apps/web/public/data bos — once 'pnpm build:data' calistirin");
    return;
  }

  const s = createStaticState();

  for (const path of files) {
    const relativePath = relative(dataRoot, path);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      errors.push(`${relativePath}: gecersiz JSON — ${String(error)}`);
      continue;
    }

    // Dosya adi alt cizgili olmali (plan 20.2)
    //
    // TEK ISTISNA: root/ altindaki dosyalar Arapca kok harfleriyle adlandirilir
    // (root/قول.json) cunku adres de oyle kurulur (/kok/قول). Latin cevriyazi
    // buyuk-kucuk harf anlamlidir (S=ص, s=س; T=ط, t=ت) ve kucultuldugunde
    // 1641 kokten 141'i cakisir — adres olarak kullanilamaz. Arapca kok ise
    // veritabaninda UNIQUE. Sunucuda dogrulandi: nginx hem yuzde kodlu hem ham
    // UTF-8 istegi cozuyor.
    //
    // Istisna genis degil: yalnizca Arap harfleri, en fazla 8 harf. Bosluk,
    // buyuk-kucuk harf karisikligi ya da baska bir alfabe yine reddedilir.
    //
    // IKINCI ISTISNA: icerik katmani dosyalari <tur>_<slug>.json bicimindedir
    // (story_hz-yusuf.json) ve slug TIRE tasir. Plan 20.2'nin "alt cizgi"
    // kurali dosya adindaki AYIRICI icindir; slug'in kendi ayiricisi tiredir
    // ve ayni slug adreste de kullanilir (/kissa/hz-yusuf). Slug'i dosya
    // adinda alt cizgiye cevirmek her okumada bir donusum gerektirirdi ve
    // ölü baglanti kaynagi olurdu — kok dosyalarindaki gerekcenin aynisi.
    const base = relativePath.split("/").pop() ?? "";
    const isRootFile = relativePath.startsWith("root/");
    const isContentFile = /^(?:story|principle|concept)\//.test(relativePath);
    tick();
    const nameOk = isRootFile
      ? /^[\u0621-\u064A]{1,8}\.json$/.test(base)
      : isContentFile
        ? /^(?:story|principle|concept)_[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(base)
        : /^[a-z0-9_]+\.json$/.test(base);
    if (!nameOk) {
      errors.push(
        isRootFile
          ? `${relativePath}: kok dosya adi yalnizca Arap harfi olmali (1-8 harf)`
          : isContentFile
            ? `${relativePath}: dosya adi <tur>_<slug>.json olmali, slug kebab-case`
            : `${relativePath}: dosya adi alt cizgili kucuk harf olmali (plan 20.2)`,
      );
    }


    const file: StaticFile = { relativePath, base, parsed };
    const handler =
      EXACT.get(relativePath) ?? PREFIXED.find(([prefix]) => relativePath.startsWith(prefix))?.[1];
    if (handler === undefined) {
      warn("statik cikti", `${relativePath} icin tanimli sema yok, atlandi`);
    } else {
      handler(file, s);
    }
  }


  /*
   * verse_media.json icindeki her kimlik media.json'da olmali. Ters dizin
   * ayri uretiliyor; kopmasi ayet sayfasinda sessizce bos bir bolum birakirdi.
   */
  /*
   * Tefsir indeksi ile dosyalar birbirini tutmali. Indeks bir sure vaat edip
   * dosya yoksa ayet sayfasi o eseri sessizce atlar; dosya var ama indekste
   * yoksa metin hic okunmaz. Iki yon de sessiz kayiptir.
   */
  tick();
  {
    const missing = [...s.tafsirIndexClaims].filter((f) => !s.tafsirFiles.has(f));
    if (missing.length > 0) {
      errors.push(`tafsir_index.json dosyasi olmayan sure vaat ediyor: ${missing.slice(0, 5).join(", ")}`);
    }
    const unclaimed = [...s.tafsirFiles].filter((f) => !s.tafsirIndexClaims.has(f));
    if (unclaimed.length > 0) {
      errors.push(`tafsir dosyasi indekste yok: ${unclaimed.slice(0, 5).join(", ")}`);
    }
  }

  tick();
  {
    const orphan = [...s.verseMediaIds].filter((id) => !s.mediaIds.has(id));
    if (orphan.length > 0) {
      errors.push(`verse_media.json: media.json'da olmayan kimlik: ${orphan.join(", ")}`);
    }
  }

  // Dizin ile dosyalar birebir eslesmeli — olu baglanti olmasin
  for (const [label, index, files] of [
    ["kissa", s.storiesIndexSlugs, s.storyFileSlugs],
    ["ilke", s.principlesIndexSlugs, s.principleFileSlugs],
    ["kavram", s.conceptsIndexSlugs, s.conceptFileSlugs],
  ] as const) {
    tick();
    const missing = [...index].filter((x) => !files.has(x));
    const orphan = [...files].filter((x) => !index.has(x));
    if (missing.length > 0) errors.push(`${label}: dizinde var, dosyasi yok: ${missing.join(", ")}`);
    if (orphan.length > 0) errors.push(`${label}: dosyasi var, dizinde yok: ${orphan.join(", ")}`);
  }

  /*
   * Ilke karsitlik + kendine referans + alan sayimi denetimleri (gorev 4,
   * 2026-09-07). Saf fonksiyonlara tasindi (bkz. lib/principle_checks.ts)
   * ki dosya sistemi/DB'siz birim testi yazilabilsin — bkz.
   * lib/__tests__/principle_checks.smoke.ts.
   */
  tick();
  errors.push(...checkPrincipleOppositeReciprocity(s.principleOpposite));

  tick();
  errors.push(...checkPrincipleAreaCounts(s.principleAreaOf, s.principleAreaDeclaredCounts));

  tick();
  if (s.surahFiles !== 114) {
    errors.push(`statik cikti: 114 sure dosyasi bekleniyordu, ${s.surahFiles} bulundu`);
  }

  tick();
  if (s.verseFiles !== 6236) {
    errors.push(`statik cikti: 6236 ayet dosyasi bekleniyordu, ${s.verseFiles} bulundu`);
  }

  // --- kok ve kelime butunlugu ---
  //
  // Kok dosyalari kelime dosyalarindan bagimsiz uretiliyor; ikisi arasindaki
  // baglanti kopuk kalirsa sayfada olu baglanti olusur. Burada eslesiyorlar mi
  // diye bakiliyor.
  tick();
  if (s.rootFiles !== s.rootsIndexEntries) {
    errors.push(
      `statik cikti: roots_index.json ${s.rootsIndexEntries} kok sayiyor ama ` +
        `${s.rootFiles} kok dosyasi var`,
    );
  }

  tick();
  if (s.wordFiles > 0 && s.wordFiles !== 6236) {
    // Kelime verisi bir ayette hic olmayabilir; ama varsa hepsinde olmali.
    warn("statik cikti", `${s.wordFiles}/6236 ayette kelime dosyasi var`);
  }

  // Kelimelerin gosterdigi her kok icin dosya olmali — /kok/... baglantilari
  // buradan uretiliyor.
  tick();
  const missingRootFiles = [...s.referencedRoots].filter((arabic) => !s.rootFileNames.has(arabic));
  if (missingRootFiles.length > 0) {
    errors.push(
      `statik cikti: ${missingRootFiles.length} kok kelimelerde geciyor ama dosyasi yok: ` +
        missingRootFiles.slice(0, 5).join(", "),
    );
  }

  info(
    `   kok/kelime: ${s.rootFiles} kok dosyasi, ${s.wordFiles} ayette ${s.wordCount} kelime, ` +
      `${s.referencedRoots.size} farkli kok kullanilmis`,
  );

  // Her yazarin dosya sayisi, authors_index.json'da ilan ettigi kaynak
  // bosluklariyla tutarli olmali. Bosluk ilan edilmemisse 114 beklenir.
  tick();
  const expectedTranslationFiles = [...s.authorSlugs].reduce(
    (sum, slug) => sum + (s.expectedFilesByAuthor.get(slug) ?? 114),
    0,
  );
  if (s.translationFiles !== expectedTranslationFiles) {
    errors.push(
      `statik cikti: ${expectedTranslationFiles} meal dosyasi bekleniyordu, ` +
        `${s.translationFiles} bulundu`,
    );
  }
  for (const slugName of s.authorSlugs) {
    tick();
    const expected = s.expectedFilesByAuthor.get(slugName) ?? 114;
    const count = s.translationCounts.get(slugName) ?? 0;
    if (count !== expected) {
      errors.push(
        `meal dosyalari: ${slugName} icin ${expected} sure bekleniyordu (ilan edilen ` +
          `bosluklara gore), ${count} bulundu`,
      );
    }
  }
  for (const slugName of s.translationCounts.keys()) {
    tick();
    if (!s.authorSlugs.has(slugName)) {
      errors.push(`meal dosyalari: '${slugName}' authors_index.json'da yok`);
    }
  }

  /*
   * Performans butcesi (plan 20.4): tek dosya asiri buyumemeli.
   *
   * Esik iki turlu. Plan 20.4 SAYFA AGIRLIGI icin yazilmis; asagidaki iki
   * dosyayi hicbir sayfa indirmez, build zamaninda okunup HTML'e donusurler
   * (apps/web/src/lib/data.ts). Onlar icin 300 KB anlamsiz bir uyari uretir ve
   * gercek asimlar bu gurultunun icinde kaybolur. Yine de sinirsiz degiller:
   * bu dosyalar public/data altinda durur, yani istenirse indirilebilir ve her
   * yayina kopyalanir. Buyume gozden kacmasin diye ayri, yuksek esik konuldu.
   */
  const PAGE_BUDGET = 300 * 1024;
  const BUILD_ONLY_BUDGET = 8 * 1024 * 1024;
  const buildOnly = new Set([
    "verse_links.json",
    "verse_relations.json",
    // 2322 yazma kunyesi + ayet araliklari; hicbir sayfa indirmez, build okur.
    "manuscripts.json",
    "verse_manuscripts.json",
    // Medya kunyeleri; build okur, sayfaya kunye degil HTML iner.
    "media.json",
    "verse_media.json",
  ]);
  /*
   * Tefsir sure dosyalari da build-zamani girdisidir: site JS'siz, hicbir
   * sayfa bu JSON'u indirmiyor — Astro build'de okuyup HTML'e basiyor.
   * Sa'di'nin Bakara dosyasi 582 KB; sayfa butcesiyle olculmesi yanlis olurdu.
   */
  const buildOnlyPrefixes = ["tafsir/"];

  tick();
  for (const path of files) {
    const rel = relative(dataRoot, path);
    const size = statSync(path).size;
    const isBuildOnly =
      buildOnly.has(rel) || buildOnlyPrefixes.some((prefix) => rel.startsWith(prefix));
    const budget = isBuildOnly ? BUILD_ONLY_BUDGET : PAGE_BUDGET;
    if (size <= budget) continue;
    warn(
      "performans butcesi",
      `${rel} ${Math.round(size / 1024)} KB (esik ${Math.round(budget / 1024)} KB` +
        (isBuildOnly ? ", build-zamani dosyasi" : ", plan 20.4") + ")",
    );
  }
}
