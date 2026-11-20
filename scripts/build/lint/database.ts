/**
 * A. Veritabani butunlugu — DDL'in ifade edemedigi kurallar.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  segmentFile,
} from "@kuran/schema";
import { CONTENT_FINGERPRINT_KEY, IMPORT_STATE_DDL, contentFingerprint, info, pool, repoRoot } from "@kuran/pipeline";
import { check, warn } from "./report.js";

export async function scalar(sql: string): Promise<string> {
  const { rows } = await pool.query<{ value: string | null }>(sql);
  return rows[0]?.value ?? "";
}

export async function rows<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  return (await pool.query<T>(sql)).rows;
}

/**
 * Veritabani data/ ile ayni icerikten mi uretildi?
 *
 * data/ degisip `pnpm content:import` unutulursa asagidaki butun denetimler
 * yine temiz gecer — cunku ESKI veritabani kendi icinde tutarlidir. Degisiklik
 * yayina cikmaz ve bunu hicbir sey soylemez. Bu denetim soyler.
 */
async function checkFreshness(): Promise<void> {
  await pool.query(IMPORT_STATE_DDL);
  const stored = (
    await pool.query<{ value: string }>("SELECT value FROM import_state WHERE key = $1", [
      CONTENT_FINGERPRINT_KEY,
    ])
  ).rows[0]?.value;
  const current = contentFingerprint();
  check(
    "veritabani guncelligi",
    stored === current,
    stored === undefined
      ? "ice aktarma kaydi yok — 'pnpm content:import' calistirin"
      : `data/ son ice aktarmadan sonra degismis (kayitli ${stored.slice(0, 12)}, ` +
          `diskte ${current.slice(0, 12)}) — 'pnpm content:import' calistirin`,
  );
}

export async function checkDatabase(): Promise<void> {
  info("A. veritabani butunlugu");

  await checkFreshness();

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

  await checkSegments();
}

/**
 * Kelime zaman damgasi <-> kelime sayisi — plan 04.
 *
 * Damga bir ayette kayarsa isik butun ayet boyunca yanlis kelimede yanar ve
 * bu SESSIZ bir kirilmadir: sayfa acilir, ses calar, yalnizca isik yanlistir.
 * Bu yuzden her build'de denetleniyor:
 *   damga sayisi = kelime sayisi + 1   (son eleman son kelimenin bitisi)
 *   dizi artan sirali
 */
async function checkSegments(): Promise<void> {
  const dir = resolve(repoRoot, "data/recitation");
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((n) => /^segments_[a-z0-9-]+\.json$/.test(n));
  if (files.length === 0) return;

  const counts = (
    await pool.query<{ key: string; n: string }>(
      `SELECT v.surah_id || ':' || v.verse_number AS key, count(p.*)::text AS n
         FROM verse_part p JOIN verse v ON v.id = p.verse_id
        GROUP BY 1`,
    )
  ).rows;
  if (counts.length === 0) return;
  const expected = new Map(counts.map((r) => [r.key, Number(r.n)]));

  for (const name of files) {
    const parsed = segmentFile.safeParse(JSON.parse(readFileSync(resolve(dir, name), "utf8")));
    if (!parsed.success) {
      check(`damga ${name}`, false, `sema dogrulamasi basarisiz: ${parsed.error.message}`);
      continue;
    }
    const problems: string[] = [];
    for (const [key, starts] of Object.entries(parsed.data.verses)) {
      const want = expected.get(key);
      if (want === undefined) {
        problems.push(`${key}: veritabaninda yok`);
        continue;
      }
      if (starts.length !== want + 1) {
        problems.push(`${key}: ${String(starts.length - 1)} damga, ${String(want)} kelime`);
      }
      for (let i = 1; i < starts.length; i += 1) {
        if ((starts[i] ?? 0) < (starts[i - 1] ?? 0)) {
          problems.push(`${key}: ${String(i)}. damga geriye gidiyor`);
          break;
        }
      }
    }
    check(
      `damga ${name}`,
      problems.length === 0,
      `${String(problems.length)} sorun — ${problems.slice(0, 5).join(" · ")}`,
    );
    if (problems.length === 0) {
      info(
        `  damga denetimi: ${name} — ${String(Object.keys(parsed.data.verses).length)} ayet temiz`,
      );
    }
  }
}
