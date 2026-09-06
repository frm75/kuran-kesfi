/**
 * Referans linter — plan 20.1 zorunlu adimi.
 *
 * "data/** altindaki tum ayet referanslari, kavram/kok/kissa/ilke slug'lari ve
 *  source_id'ler veritabanina karsi dogrulanir. Hatali veya var olmayan
 *  referans varsa build BASARISIZ olur."
 *
 * Uc kume denetim yapar:
 *   A. Veritabani butunlugu   — DDL'in ifade edemedigi kurallar
 *   B. Uretilen statik JSON   — Zod semalarina karsi dogrulama
 *   C. data/** elle veri      — ayet referanslari ve slug'lar veritabaninda var mi
 *
 * Calistirma:  pnpm --filter @kuran/build lint:refs
 * Cikis kodu:  0 temiz, 1 en az bir hata
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import {
  conceptInput,
  contentSourcesFile,
  locationsFile,
  noldekeOrderFile,
  parseVerseRef,
  principleInput,
  staticAuthorsIndex,
  staticConcept,
  staticConceptsIndex,
  staticLocations,
  staticPrinciple,
  staticPrinciplesIndex,
  staticStoriesIndex,
  staticStory,
  staticTimeline,
  staticVerseLinks,
  staticManuscripts,
  staticVerseManuscripts,
  staticVerseRelations,
  staticSurahSections,
  storyInput,
  surahSectionsFile,
  timelineFile,
  staticRoot,
  staticRootsIndex,
  staticVerseWords,
  scriptureBooksFile,
  scriptureQuotesFile,
  staticScripture,
  staticSources,
  staticSurah,
  staticSurahTranslation,
  staticSurahsIndex,
  staticVerseDetail,
  verseRef as verseRefSchema,
} from "@kuran/schema";
import { closePool, info, pool, repoRoot } from "@kuran/pipeline";
import { dataRoot } from "./lib/emit.js";

// -----------------------------------------------------------------------------
// Hata toplama
// -----------------------------------------------------------------------------

const errors: string[] = [];
const warnings: string[] = [];
let checksRun = 0;

function check(label: string, ok: boolean, detail: string): void {
  checksRun += 1;
  if (ok) return;
  errors.push(`${label}: ${detail}`);
}

function warn(label: string, detail: string): void {
  warnings.push(`${label}: ${detail}`);
}

// -----------------------------------------------------------------------------
// A. Veritabani butunlugu
// -----------------------------------------------------------------------------

async function scalar(sql: string): Promise<string> {
  const { rows } = await pool.query<{ value: string | null }>(sql);
  return rows[0]?.value ?? "";
}

async function rows<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  return (await pool.query<T>(sql)).rows;
}

async function checkDatabase(): Promise<void> {
  info("A. veritabani butunlugu");

  check("sure sayisi", (await scalar("SELECT count(*)::text AS value FROM surah")) === "114", "114 olmali");
  check(
    "ayet sayisi",
    (await scalar("SELECT count(*)::text AS value FROM verse")) === "6236",
    "6236 olmali",
  );

  // verse_count ile gercek ayet sayisi uyusmali
  const countMismatch = await rows<{ id: number; declared: number; actual: string }>(
    `SELECT s.id, s.verse_count AS declared, count(v.id)::text AS actual
       FROM surah s LEFT JOIN verse v ON v.surah_id = s.id
      GROUP BY s.id, s.verse_count
     HAVING s.verse_count <> count(v.id)`,
  );
  check(
    "verse_count tutarliligi",
    countMismatch.length === 0,
    countMismatch.map((r) => `sure ${r.id}: ${r.declared} ilan, ${r.actual} gercek`).join("; "),
  );

  // Ayet numaralarinda bosluk olmamali: max(verse_number) = count
  const gaps = await rows<{ id: number; max_number: number; total: string }>(
    `SELECT surah_id AS id, max(verse_number) AS max_number, count(*)::text AS total
       FROM verse GROUP BY surah_id HAVING max(verse_number) <> count(*)`,
  );
  check(
    "ayet numarasi surekliligi",
    gaps.length === 0,
    gaps.map((r) => `sure ${r.id}: en buyuk ${r.max_number}, toplam ${r.total}`).join("; "),
  );

  // verse.id formulu (DDL'de CHECK var; burada da dogrulanir)
  check(
    "verse.id formulu",
    (await scalar(
      "SELECT count(*)::text AS value FROM verse WHERE id <> surah_id * 1000 + verse_number",
    )) === "0",
    "id = surah_id * 1000 + verse_number olmali",
  );

  // Nuzul siralamasi 1..114'u tam kaplamali
  check(
    "nuzul siralamasi kapsami",
    (await scalar(
      `SELECT count(*)::text AS value FROM generate_series(1, 114) g
        WHERE NOT EXISTS (SELECT 1 FROM surah WHERE revelation_order_standard = g)`,
    )) === "0",
    "1..114 arasinda eksik nuzul sirasi var",
  );

  // Sayfa ve cuz araliklari kesintisiz olmali
  check(
    "sayfa sureklilligi",
    (await scalar(
      `SELECT count(*)::text AS value FROM generate_series(1, 604) g
        WHERE NOT EXISTS (SELECT 1 FROM verse WHERE page = g)`,
    )) === "0",
    "1..604 arasinda ayeti olmayan sayfa var",
  );
  check(
    "cuz surekliligi",
    (await scalar(
      `SELECT count(*)::text AS value FROM generate_series(1, 30) g
        WHERE NOT EXISTS (SELECT 1 FROM verse WHERE juz = g)`,
    )) === "0",
    "1..30 arasinda ayeti olmayan cuz var",
  );

  // Slug bicimi (UNIQUE veritabaninda; bicim burada)
  for (const table of ["surah", "author", "source", "story", "location", "concept", "principle"]) {
    const bad = await scalar(
      `SELECT count(*)::text AS value FROM ${table} WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    );
    check(`${table}.slug bicimi`, bad === "0", `${bad} kayit kebab-case degil`);
  }

  // --- DDL'in ifade edemedigi kurallar ---

  // Her ilke en az bir dogrudan (primary) ayet dayanagi tasimali (plan 18.3)
  const principlesWithoutPrimary = await rows<{ slug: string }>(
    `SELECT p.slug FROM principle p
      WHERE NOT EXISTS (
        SELECT 1 FROM principle_verse pv
         WHERE pv.principle_id = p.id AND pv.role = 'primary')`,
  );
  check(
    "ilke birincil ayet dayanagi",
    principlesWithoutPrimary.length === 0,
    principlesWithoutPrimary.map((r) => r.slug).join(", "),
  );

  // Kaynak zorunlulugu (plan 8.1, 8.3, 18.3)
  const sourceRequired: readonly { label: string; sql: string }[] = [
    {
      label: "ilke kaynagi",
      sql: `SELECT p.slug AS key FROM principle p
             WHERE NOT EXISTS (SELECT 1 FROM principle_source s WHERE s.principle_id = p.id)`,
    },
    {
      label: "konum kaynagi",
      sql: `SELECT l.slug AS key FROM location l
             WHERE NOT EXISTS (SELECT 1 FROM location_source s WHERE s.location_id = l.id)`,
    },
    {
      label: "kissa dersi kaynagi",
      sql: `SELECT (st.slug || '#' || sl."order") AS key
              FROM story_lesson sl JOIN story st ON st.id = sl.story_id
             WHERE NOT EXISTS (
               SELECT 1 FROM story_lesson_source s WHERE s.story_lesson_id = sl.id)`,
    },
    {
      label: "kavram kaynagi",
      sql: `SELECT c.slug AS key FROM concept c
             WHERE NOT EXISTS (SELECT 1 FROM concept_source s WHERE s.concept_id = c.id)`,
    },
    {
      label: "zaman cizelgesi kaynagi",
      sql: `SELECT te."order"::text AS key FROM timeline_event te
             WHERE NOT EXISTS (
               SELECT 1 FROM timeline_event_source s WHERE s.timeline_event_id = te.id)`,
    },
  ];
  for (const { label, sql } of sourceRequired) {
    const missing = await rows<{ key: string }>(sql);
    check(label, missing.length === 0, `kaynaksiz kayit: ${missing.map((r) => r.key).join(", ")}`);
  }

  // verse_relation.reason_ref_id cok hedefli oldugu icin FK yok — burada cozulur
  const relationRefTables: Readonly<Record<string, string>> = {
    concept: "concept",
    root: "root",
    section: "surah_section",
    story: "story",
    event: "timeline_event",
  };
  for (const [refType, table] of Object.entries(relationRefTables)) {
    const dangling = await scalar(
      `SELECT count(*)::text AS value FROM verse_relation vr
        WHERE vr.reason_ref_type = '${refType}'
          AND NOT EXISTS (SELECT 1 FROM ${table} t WHERE t.id = vr.reason_ref_id)`,
    );
    check(
      `verse_relation reason_ref (${refType})`,
      dangling === "0",
      `${dangling} kayit ${table} tablosunda bulunamayan id'ye isaret ediyor`,
    );
  }

  // Kavram agacinda dongu olmamali
  const conceptCycles = await rows<{ slug: string }>(
    `WITH RECURSIVE walk(id, root_id, depth) AS (
       SELECT id, id, 0 FROM concept WHERE parent_id IS NOT NULL
       UNION ALL
       SELECT c.parent_id, w.root_id, w.depth + 1
         FROM walk w JOIN concept c ON c.id = w.id
        WHERE c.parent_id IS NOT NULL AND w.depth < 32
     )
     SELECT DISTINCT c.slug FROM walk w JOIN concept c ON c.id = w.root_id
      WHERE w.id = w.root_id AND w.depth > 0`,
  );
  check(
    "kavram agaci dongusu",
    conceptCycles.length === 0,
    conceptCycles.map((r) => r.slug).join(", "),
  );

  // Kok eslesmeyen kelimeler: hata degil, rapor konusu (plan 20.1)
  const partsTotal = await scalar("SELECT count(*)::text AS value FROM verse_part");
  if (partsTotal !== "0") {
    const unmatched = await scalar(
      "SELECT count(*)::text AS value FROM verse_part WHERE root_id IS NULL",
    );
    const ratio = (Number(unmatched) / Number(partsTotal)) * 100;
    warn(
      "kok eslesmesi",
      `${unmatched}/${partsTotal} kelime koke baglanmadi (%${ratio.toFixed(1)})`,
    );
  }
}

// -----------------------------------------------------------------------------
// B. Uretilen statik JSON
// -----------------------------------------------------------------------------

function listJsonFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (extname(entry) === ".json") {
        found.push(path);
      }
    }
  };
  walk(root);
  return found.sort();
}

function checkStaticOutput(): void {
  info("B. uretilen statik JSON");

  const files = listJsonFiles(dataRoot);
  if (files.length === 0) {
    errors.push("statik cikti: apps/web/public/data bos — once 'pnpm build:data' calistirin");
    return;
  }

  let surahFiles = 0;
  let translationFiles = 0;
  let verseFiles = 0;
  let authorSlugs = new Set<string>();
  const translationCounts = new Map<string, number>();
  const expectedFilesByAuthor = new Map<string, number>();
  const seenIds = new Set<number>();
  const seenSlugs = new Set<string>();
  let rootFiles = 0;
  let wordFiles = 0;
  let wordCount = 0;
  let rootsIndexEntries = 0;
  /** Kelimelerin gosterdigi kokler ve gercekten var olan kok dosyalari */
  const referencedRoots = new Set<string>();
  const rootFileNames = new Set<string>();
  /** Icerik katmani: dizin <-> dosya eslesmesi */
  let storiesIndexSlugs = new Set<string>();
  const storyFileSlugs = new Set<string>();
  let principlesIndexSlugs = new Set<string>();
  const principleFileSlugs = new Set<string>();
  let conceptsIndexSlugs = new Set<string>();
  const conceptFileSlugs = new Set<string>();

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
    checksRun += 1;
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

    if (relativePath === "surahs_index.json") {
      const result = staticSurahsIndex.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
    } else if (relativePath === "sources.json") {
      const result = staticSources.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
    } else if (relativePath === "scripture.json") {
      const result = staticScripture.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
    } else if (relativePath === "authors_index.json") {
      const result = staticAuthorsIndex.safeParse(parsed);
      checksRun += 1;
      if (!result.success) {
        errors.push(`${relativePath}: ${result.error.message}`);
      } else {
        authorSlugs = new Set(result.data.authors.map((a) => a.slug));
        for (const a of result.data.authors) {
          expectedFilesByAuthor.set(a.slug, 114 - a.missingSurahs.length);
          if (a.missingSurahs.length > 0 || a.missingVerseCount > 0) {
            warn(
              "kaynak boslugu",
              `${a.slug}: ${a.missingVerseCount} ayet eksik` +
                (a.missingSurahs.length > 0
                  ? `, tamamen eksik sure(ler): ${a.missingSurahs.join(", ")}`
                  : ""),
            );
          }
        }

        // Atif yukumlulugu: her kullanilan kaynagin baglantisi bulunmali
        // (bkz. data/LICENSE). Kaynak bazli, sabit yazilmaz.
        const requiredLinkBySource: Readonly<Record<string, string>> = {
          acikkuran: "acikkuran.com",
          tanzil: "tanzil.net/trans",
          "quran.com": "quran.com",
          quranenc: "quranenc.com",
        };
        const links = result.data.requiredAttributionLinks.map((l) => l.url).join(" ");
        for (const source of new Set(result.data.authors.map((a) => a.source))) {
          checksRun += 1;
          const needle = requiredLinkBySource[source];
          if (needle === undefined) {
            warn("atif", `'${source}' kaynagi icin tanimli atif baglantisi kurali yok`);
            continue;
          }
          if (!links.includes(needle)) {
            errors.push(
              `${relativePath}: '${source}' kaynagindan meal var ama ${needle} ` +
                "atif baglantisi yok (bkz. data/LICENSE)",
            );
          }
        }

        // Arapca metin her zaman Tanzil'den gelir — atfi kosulsuz zorunlu
        checksRun += 1;
        if (!links.includes("tanzil.net")) {
          errors.push(
            `${relativePath}: Arapça metin Tanzil'den geliyor, tanzil.net atfi zorunlu`,
          );
        }
      }
    } else if (relativePath.startsWith("translation/")) {
      const result = staticSurahTranslation.safeParse(parsed);
      checksRun += 1;
      if (!result.success) {
        errors.push(`${relativePath}: ${result.error.message}`);
        continue;
      }
      translationFiles += 1;
      const payload = result.data;
      const expectedPath = `translation/${payload.authorSlug}/surah_${payload.surahId}.json`;
      if (relativePath !== expectedPath) {
        errors.push(`${relativePath}: yol ${expectedPath} olmali`);
      }
      translationCounts.set(
        payload.authorSlug,
        (translationCounts.get(payload.authorSlug) ?? 0) + 1,
      );
    } else if (relativePath.startsWith("verse/")) {
      const result = staticVerseDetail.safeParse(parsed);
      checksRun += 1;
      if (!result.success) {
        errors.push(`${relativePath}: ${result.error.message}`);
        continue;
      }
      verseFiles += 1;
      const verse = result.data;
      if (verse.id !== verse.surahId * 1000 + verse.verseNumber) {
        errors.push(`${relativePath}: id formulune uymuyor`);
      }
      if (base !== `verse_${verse.surahId}_${verse.verseNumber}.json`) {
        errors.push(`${relativePath}: dosya adi verse_${verse.surahId}_${verse.verseNumber}.json olmali`);
      }
    } else if (relativePath.startsWith("surah/")) {
      const result = staticSurah.safeParse(parsed);
      checksRun += 1;
      if (!result.success) {
        errors.push(`${relativePath}: ${result.error.message}`);
        continue;
      }
      surahFiles += 1;
      const surah = result.data;

      if (seenIds.has(surah.id)) errors.push(`${relativePath}: sure id ${surah.id} mukerrer`);
      seenIds.add(surah.id);
      if (seenSlugs.has(surah.slug)) errors.push(`${relativePath}: slug ${surah.slug} mukerrer`);
      seenSlugs.add(surah.slug);

      if (base !== `surah_${surah.id}.json`) {
        errors.push(`${relativePath}: dosya adi surah_${surah.id}.json olmali`);
      }
      if (surah.verses.length !== surah.verseCount) {
        errors.push(
          `${relativePath}: verseCount ${surah.verseCount} ama ${surah.verses.length} ayet var`,
        );
      }
      surah.verses.forEach((verse, index) => {
        if (verse.verseNumber !== index + 1) {
          errors.push(`${relativePath}: ${index + 1}. sirada ayet ${verse.verseNumber} var`);
        }
        if (verse.id !== surah.id * 1000 + verse.verseNumber) {
          errors.push(`${relativePath}: ayet ${verse.verseNumber} id formulune uymuyor`);
        }
      });
    } else if (relativePath === "roots_index.json") {
      const result = staticRootsIndex.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
      else rootsIndexEntries = result.data.roots.length;
    } else if (relativePath.startsWith("root/")) {
      const result = staticRoot.safeParse(parsed);
      checksRun += 1;
      if (!result.success) {
        errors.push(`${relativePath}: ${result.error.message}`);
        continue;
      }
      rootFiles += 1;
      const root = result.data;
      rootFileNames.add(root.arabic);
      // Dosya adi kokun kendisi olmali; adres de bu adi kullaniyor.
      if (base !== `${root.arabic}.json`) {
        errors.push(`${relativePath}: dosya adi ${root.arabic}.json olmali`);
      }
      if (root.occurrences.length !== root.occurrenceCount) {
        errors.push(
          `${relativePath}: occurrenceCount ${root.occurrenceCount} ama ` +
            `${root.occurrences.length} gecis var`,
        );
      }
      // Gecisler sure/ayet sirasinda olmali; sayfa onlari sirayla grupluyor.
      let previous = 0;
      for (const occurrence of root.occurrences) {
        const key = occurrence.surahId * 1000 + occurrence.verseNumber;
        if (key < previous) {
          errors.push(`${relativePath}: gecisler sirali degil (${occurrence.surahId}:${occurrence.verseNumber})`);
          break;
        }
        previous = key;
      }
    } else if (relativePath.startsWith("word/")) {
      const result = staticVerseWords.safeParse(parsed);
      checksRun += 1;
      if (!result.success) {
        errors.push(`${relativePath}: ${result.error.message}`);
        continue;
      }
      wordFiles += 1;
      const wordData = result.data;
      if (base !== `verse_${wordData.surahId}_${wordData.verseNumber}.json`) {
        errors.push(
          `${relativePath}: dosya adi verse_${wordData.surahId}_${wordData.verseNumber}.json olmali`,
        );
      }
      wordData.words.forEach((word, index) => {
        if (word.position !== index + 1) {
          errors.push(`${relativePath}: ${index + 1}. sirada konum ${word.position} var`);
        }
        // Kok bilgisi ya tam gelir ya hic gelmez; yarim kayit baglanti kirar.
        if ((word.rootArabic === null) !== (word.rootLatin === null)) {
          errors.push(`${relativePath}: kelime ${word.position} yarim kok bilgisi tasiyor`);
        }
        if (word.rootArabic !== null) referencedRoots.add(word.rootArabic);
      });
      wordCount += wordData.words.length;
    } else if (relativePath === "stories_index.json") {
      const result = staticStoriesIndex.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
      else storiesIndexSlugs = new Set(result.data.stories.map((x) => x.slug));
    } else if (relativePath.startsWith("story/")) {
      const result = staticStory.safeParse(parsed);
      checksRun += 1;
      if (!result.success) {
        errors.push(`${relativePath}: ${result.error.message}`);
        continue;
      }
      storyFileSlugs.add(result.data.slug);
      if (base !== `story_${result.data.slug}.json`) {
        errors.push(`${relativePath}: dosya adi story_${result.data.slug}.json olmali`);
      }
      // Parcalar sirali ve verseCount tutarli olmali
      const sum = result.data.passages.reduce((a, p) => a + (p.verseEnd - p.verseStart + 1), 0);
      if (sum !== result.data.verseCount) {
        errors.push(`${relativePath}: verseCount ${result.data.verseCount} ama parcalar ${sum} ayet kapsiyor`);
      }
      result.data.passages.forEach((p, i) => {
        if (p.order !== i + 1) errors.push(`${relativePath}: parca sirasi kesintili (${p.order})`);
        if (p.verseEnd < p.verseStart) errors.push(`${relativePath}: parca ${p.order} tersine aralik`);
      });
    } else if (relativePath === "locations.json") {
      const result = staticLocations.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
    } else if (relativePath === "timeline.json") {
      const result = staticTimeline.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
      else {
        result.data.events.forEach((e, i) => {
          if (i > 0 && e.order <= (result.data.events[i - 1]?.order ?? 0)) {
            errors.push(`${relativePath}: olaylar order'a gore sirali degil (${e.order})`);
          }
        });
      }
    } else if (relativePath === "principles_index.json") {
      const result = staticPrinciplesIndex.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
      else principlesIndexSlugs = new Set(result.data.principles.map((x) => x.slug));
    } else if (relativePath.startsWith("principle/")) {
      const result = staticPrinciple.safeParse(parsed);
      checksRun += 1;
      if (!result.success) {
        errors.push(`${relativePath}: ${result.error.message}`);
        continue;
      }
      principleFileSlugs.add(result.data.slug);
      if (base !== `principle_${result.data.slug}.json`) {
        errors.push(`${relativePath}: dosya adi principle_${result.data.slug}.json olmali`);
      }
      if (!result.data.verses.some((v) => v.role === "primary")) {
        errors.push(`${relativePath}: birincil ayet dayanagi yok (plan 18.3)`);
      }
    } else if (relativePath === "concepts_index.json") {
      const result = staticConceptsIndex.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
      else conceptsIndexSlugs = new Set(result.data.concepts.map((x) => x.slug));
    } else if (relativePath.startsWith("concept/")) {
      const result = staticConcept.safeParse(parsed);
      checksRun += 1;
      if (!result.success) {
        errors.push(`${relativePath}: ${result.error.message}`);
        continue;
      }
      conceptFileSlugs.add(result.data.slug);
      if (base !== `concept_${result.data.slug}.json`) {
        errors.push(`${relativePath}: dosya adi concept_${result.data.slug}.json olmali`);
      }
      const st = result.data.stats;
      if (st.mekki + st.medeni !== st.verseCount || st.verseCount !== result.data.verses.length) {
        errors.push(`${relativePath}: dagilim istatistigi ayet sayisiyla tutarsiz`);
      }
    } else if (relativePath === "verse_links.json") {
      const result = staticVerseLinks.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
      else {
        for (const key of Object.keys(result.data.verses)) {
          const id = Number(key);
          const surahId = Math.floor(id / 1000);
          if (surahId < 1 || surahId > 114 || id % 1000 === 0) {
            errors.push(`${relativePath}: gecersiz ayet anahtari ${key}`);
            break;
          }
        }
      }
    } else if (relativePath === "sections.json") {
      const result = staticSurahSections.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
      else {
        /*
         * Bitisiklik cikti tarafinda BIR DAHA bakiliyor. Girdi semasi zaten
         * dogruluyor ama arayuz "bu ayet hangi konuda?" sorusunun her ayette
         * cevabi olduguna guveniyor; bosluk kalirsa sayfa sessizce basliksiz
         * kalir, hata vermez. Sessiz bozulma en pahali bozulmadir.
         */
        for (const [key, entry] of Object.entries(result.data.surahs)) {
          const sorted = [...entry.sections].sort((a, b) => a.order - b.order);
          let expected = 1;
          let broken = false;
          for (const [i, section] of sorted.entries()) {
            if (section.order !== i + 1 || section.verseStart !== expected) {
              errors.push(
                `${relativePath}: sure ${key} bolumlemesi ${section.order}. bolumde kopuk ` +
                  `(${section.verseStart}. ayetten basliyor, ${expected} bekleniyordu)`,
              );
              broken = true;
              break;
            }
            expected = section.verseEnd + 1;
          }
          if (broken) continue;
          for (const section of sorted) {
            const inside = section.alsoVerses.filter(
              (n) => n >= section.verseStart && n <= section.verseEnd,
            );
            if (inside.length > 0) {
              errors.push(
                `${relativePath}: sure ${key} bolum ${section.order}: ek ayet ${inside.join(", ")} ` +
                  "zaten ana aralikta",
              );
              break;
            }
          }
        }
      }
    } else if (relativePath === "verse_relations.json") {
      const result = staticVerseRelations.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
      else {
        /*
         * Iki kural veritabani kisitiyla korunuyor ama cikti dosyasi elle de
         * duzenlenebilir; burada bir daha bakiliyor:
         *   1. Bir ayet kendisiyle iliskilendirilemez (verse_relation_not_self).
         *   2. "muhtemel" yalnizca kavram uzerinden kurulan bag icindir
         *      (plan 12.5) — kissa/olay/kok bagi sayimdir, kesindir.
         */
        for (const [key, list] of Object.entries(result.data.verses)) {
          const id = Number(key);
          const surahId = Math.floor(id / 1000);
          if (surahId < 1 || surahId > 114 || id % 1000 === 0) {
            errors.push(`${relativePath}: gecersiz ayet anahtari ${key}`);
            break;
          }
          for (const r of list) {
            if (r.surahId * 1000 + r.verseNumber === id) {
              errors.push(`${relativePath}: ${key} kendisiyle iliskilendirilmis`);
              break;
            }
            if ((r.confidence === "muhtemel") !== (r.type === "same_topic")) {
              errors.push(
                `${relativePath}: ${key} -> ${String(r.surahId)}:${String(r.verseNumber)} ` +
                  `${r.type} turu icin confidence '${r.confidence}' beklenmiyor`,
              );
              break;
            }
          }
        }
      }
    } else if (relativePath === "manuscripts.json") {
      const result = staticManuscripts.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
      else {
        /*
         * Yazma verisi CC BY-SA 4.0 ve GORUNTU TASIMAZ: kaynaktaki kayitlarin
         * hepsinde goruntu izni "restricted". Buraya bir goruntu adresi
         * sizarsa lisans ihlali olur — build durur.
         */
        for (const m of result.data.manuscripts) {
          if (!m.url.startsWith("https://corpuscoranicum.de/")) {
            errors.push(`${relativePath}: ${String(m.id)} kaynak disi adres: ${m.url}`);
            break;
          }
          const bad = m.ranges.find(([start, end]) => end < start);
          if (bad !== undefined) {
            errors.push(`${relativePath}: ${String(m.id)} ters aralik ${bad[0]}-${bad[1]}`);
            break;
          }
        }
      }
    } else if (relativePath === "verse_manuscripts.json") {
      const result = staticVerseManuscripts.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
      else {
        for (const [key, entry] of Object.entries(result.data.verses)) {
          if (entry.oldest.length > entry.count) {
            errors.push(
              `${relativePath}: ${key} icin gosterilen yazma sayisi toplamdan buyuk`,
            );
            break;
          }
        }
      }
    } else {
      warn("statik cikti", `${relativePath} icin tanimli sema yok, atlandi`);
    }
  }

  // Dizin ile dosyalar birebir eslesmeli — olu baglanti olmasin
  for (const [label, index, files] of [
    ["kissa", storiesIndexSlugs, storyFileSlugs],
    ["ilke", principlesIndexSlugs, principleFileSlugs],
    ["kavram", conceptsIndexSlugs, conceptFileSlugs],
  ] as const) {
    checksRun += 1;
    const missing = [...index].filter((x) => !files.has(x));
    const orphan = [...files].filter((x) => !index.has(x));
    if (missing.length > 0) errors.push(`${label}: dizinde var, dosyasi yok: ${missing.join(", ")}`);
    if (orphan.length > 0) errors.push(`${label}: dosyasi var, dizinde yok: ${orphan.join(", ")}`);
  }

  checksRun += 1;
  if (surahFiles !== 114) {
    errors.push(`statik cikti: 114 sure dosyasi bekleniyordu, ${surahFiles} bulundu`);
  }

  checksRun += 1;
  if (verseFiles !== 6236) {
    errors.push(`statik cikti: 6236 ayet dosyasi bekleniyordu, ${verseFiles} bulundu`);
  }

  // --- kok ve kelime butunlugu ---
  //
  // Kok dosyalari kelime dosyalarindan bagimsiz uretiliyor; ikisi arasindaki
  // baglanti kopuk kalirsa sayfada olu baglanti olusur. Burada eslesiyorlar mi
  // diye bakiliyor.
  checksRun += 1;
  if (rootFiles !== rootsIndexEntries) {
    errors.push(
      `statik cikti: roots_index.json ${rootsIndexEntries} kok sayiyor ama ` +
        `${rootFiles} kok dosyasi var`,
    );
  }

  checksRun += 1;
  if (wordFiles > 0 && wordFiles !== 6236) {
    // Kelime verisi bir ayette hic olmayabilir; ama varsa hepsinde olmali.
    warn("statik cikti", `${wordFiles}/6236 ayette kelime dosyasi var`);
  }

  // Kelimelerin gosterdigi her kok icin dosya olmali — /kok/... baglantilari
  // buradan uretiliyor.
  checksRun += 1;
  const missingRootFiles = [...referencedRoots].filter((arabic) => !rootFileNames.has(arabic));
  if (missingRootFiles.length > 0) {
    errors.push(
      `statik cikti: ${missingRootFiles.length} kok kelimelerde geciyor ama dosyasi yok: ` +
        missingRootFiles.slice(0, 5).join(", "),
    );
  }

  info(
    `   kok/kelime: ${rootFiles} kok dosyasi, ${wordFiles} ayette ${wordCount} kelime, ` +
      `${referencedRoots.size} farkli kok kullanilmis`,
  );

  // Her yazarin dosya sayisi, authors_index.json'da ilan ettigi kaynak
  // bosluklariyla tutarli olmali. Bosluk ilan edilmemisse 114 beklenir.
  checksRun += 1;
  const expectedTranslationFiles = [...authorSlugs].reduce(
    (sum, s) => sum + (expectedFilesByAuthor.get(s) ?? 114),
    0,
  );
  if (translationFiles !== expectedTranslationFiles) {
    errors.push(
      `statik cikti: ${expectedTranslationFiles} meal dosyasi bekleniyordu, ` +
        `${translationFiles} bulundu`,
    );
  }
  for (const slugName of authorSlugs) {
    checksRun += 1;
    const expected = expectedFilesByAuthor.get(slugName) ?? 114;
    const count = translationCounts.get(slugName) ?? 0;
    if (count !== expected) {
      errors.push(
        `meal dosyalari: ${slugName} icin ${expected} sure bekleniyordu (ilan edilen ` +
          `bosluklara gore), ${count} bulundu`,
      );
    }
  }
  for (const slugName of translationCounts.keys()) {
    checksRun += 1;
    if (!authorSlugs.has(slugName)) {
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
  ]);

  checksRun += 1;
  for (const path of files) {
    const rel = relative(dataRoot, path);
    const size = statSync(path).size;
    const isBuildOnly = buildOnly.has(rel);
    const budget = isBuildOnly ? BUILD_ONLY_BUDGET : PAGE_BUDGET;
    if (size <= budget) continue;
    warn(
      "performans butcesi",
      `${rel} ${Math.round(size / 1024)} KB (esik ${Math.round(budget / 1024)} KB` +
        (isBuildOnly ? ", build-zamani dosyasi" : ", plan 20.4") + ")",
    );
  }
}

// -----------------------------------------------------------------------------
// C. data/** elle hazirlanan veri
// -----------------------------------------------------------------------------

/**
 * Elle veri dosyalarindaki ayet referanslarini toplar ve veritabanina karsi
 * dogrular. Tur bazli girdi semalari (storyInput, principleInput …) ilk kissa
 * JSON'u yazildiginda Faz 1'de eklenecektir; bu tarama o zamana kadar var
 * olmayan referansi yakalar.
 */
function collectVerseRefs(value: unknown, path: string, found: Map<string, string[]>): void {
  if (typeof value === "string") {
    if (verseRefSchema.safeParse(value).success) {
      const list = found.get(value) ?? [];
      list.push(path);
      found.set(value, list);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectVerseRefs(item, path, found));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectVerseRefs(item, path, found);
  }
}

async function checkManualData(): Promise<void> {
  info("C. data/** elle veri");

  const manualRoot = join(repoRoot, "data");
  const files = listJsonFiles(manualRoot);

  if (files.length === 0) {
    info("   data/ altinda JSON yok — kontrol edilecek referans bulunmadi");
    return;
  }

  /**
   * Tur bazli girdi semalari (Faz 1'de eklenecegi soylenmisti — eklendi,
   * 2026-09-05). Dosya yolu hangi semayi soyluyorsa o uygulanir; bilinmeyen
   * yol yalnizca ayet referansi taramasindan gecer ve UYARI verir.
   */
  const inputSchemaFor = (rel: string):
    | { safeParse: (v: unknown) => { success: boolean; error?: { message: string } } }
    | null => {
    if (rel === "data/sources/content_sources.json") return contentSourcesFile;
    if (rel === "data/scripture/books.json") return scriptureBooksFile;
    if (rel === "data/scripture/quotes.json") return scriptureQuotesFile;
    if (rel === "data/locations/locations.json") return locationsFile;
    if (rel === "data/timeline/timeline.json") return timelineFile;
    if (rel === "data/timeline/noldeke_order.json") return noldekeOrderFile;
    if (/^data\/stories\/story_[a-z0-9-]+\.json$/.test(rel)) return storyInput;
    if (/^data\/principles\/principle_[a-z0-9-]+\.json$/.test(rel)) return principleInput;
    if (/^data\/concepts\/concept_[a-z0-9-]+\.json$/.test(rel)) return conceptInput;
    if (/^data\/sections\/sections_(?:[1-9]|[1-9][0-9]|10[0-9]|11[0-4])\.json$/.test(rel)) {
      return surahSectionsFile;
    }
    return null;
  };

  const refs = new Map<string, string[]>();
  for (const path of files) {
    const relativePath = relative(repoRoot, path);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      errors.push(`${relativePath}: gecersiz JSON — ${String(error)}`);
      continue;
    }
    const schema = inputSchemaFor(relativePath);
    checksRun += 1;
    if (schema === null) {
      warn("elle veri", `${relativePath}: tanimli girdi semasi yok, yalnizca ayet referanslari tarandi`);
    } else {
      const result = schema.safeParse(parsed);
      if (!result.success) errors.push(`${relativePath}: ${result.error?.message ?? "sema hatasi"}`);
    }
    collectVerseRefs(parsed, relativePath, refs);
  }

  info(`   ${files.length} dosya, ${refs.size} farkli ayet referansi`);

  // Referanslari tek sorguda coz
  const keys = [...refs.keys()];
  for (const ref of keys) {
    const { surahNumber, verseStart, verseEnd } = parseVerseRef(ref);
    checksRun += 1;

    const { rows: found } = await pool.query<{ hit: string }>(
      `SELECT count(*)::text AS hit FROM verse
        WHERE surah_id = $1 AND verse_number BETWEEN $2 AND $3`,
      [surahNumber, verseStart, verseEnd],
    );
    const expected = verseEnd - verseStart + 1;
    if (Number(found[0]?.hit ?? "0") !== expected) {
      errors.push(
        `ayet referansi '${ref}' cozulemedi (${refs.get(ref)?.join(", ") ?? ""}) — ` +
          `${expected} ayet bekleniyordu, ${found[0]?.hit ?? 0} bulundu`,
      );
    }
    if (verseEnd < verseStart) {
      errors.push(`ayet referansi '${ref}' tersine aralik`);
    }
  }
}

// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  await checkDatabase();
  checkStaticOutput();
  await checkManualData();

  info("");
  info(`${checksRun} denetim calisti`);

  if (warnings.length > 0) {
    info(`${warnings.length} uyari:`);
    for (const message of warnings) info(`   ! ${message}`);
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} HATA:`);
    for (const message of errors) console.error(`   x ${message}`);
    console.error("\nReferans linter basarisiz — build tamamlanmadi (plan 20.1).");
    await closePool();
    process.exit(1);
  }

  info("referans linter temiz");
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    await closePool();
    console.error(error);
    process.exit(1);
  });
