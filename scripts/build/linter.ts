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
  parseVerseRef,
  staticAuthorsIndex,
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
    const base = relativePath.split("/").pop() ?? "";
    checksRun += 1;
    if (!/^[a-z0-9_]+\.json$/.test(base)) {
      errors.push(`${relativePath}: dosya adi alt cizgili kucuk harf olmali (plan 20.2)`);
    }

    if (relativePath === "surahs_index.json") {
      const result = staticSurahsIndex.safeParse(parsed);
      checksRun += 1;
      if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
    } else if (relativePath === "sources.json") {
      const result = staticSources.safeParse(parsed);
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
    } else {
      warn("statik cikti", `${relativePath} icin tanimli sema yok, atlandi`);
    }
  }

  checksRun += 1;
  if (surahFiles !== 114) {
    errors.push(`statik cikti: 114 sure dosyasi bekleniyordu, ${surahFiles} bulundu`);
  }

  checksRun += 1;
  if (verseFiles !== 6236) {
    errors.push(`statik cikti: 6236 ayet dosyasi bekleniyordu, ${verseFiles} bulundu`);
  }

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

  // Performans butcesi (plan 20.4): tek dosya asiri buyumemeli
  checksRun += 1;
  const oversized = files
    .map((path) => ({ path: relative(dataRoot, path), size: statSync(path).size }))
    .filter((entry) => entry.size > 300 * 1024);
  if (oversized.length > 0) {
    for (const entry of oversized) {
      warn(
        "performans butcesi",
        `${entry.path} ${Math.round(entry.size / 1024)} KB (esik 300 KB, plan 20.4)`,
      );
    }
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
