/**
 * Veritabani yardimcilari: referans cozumleme ve toplu INSERT.
 */

import { computeVerseId, parseVerseRef } from "@kuran/schema";
import { info } from "@kuran/pipeline";
import type { Client } from "@kuran/pipeline";

/** Referanstaki her ayet gercekten var mi; yoksa hata metni. */
export async function resolveVerseRefs(client: Client, refs: Iterable<string>): Promise<string[]> {
  const errors: string[] = [];
  for (const ref of new Set(refs)) {
    const { surahNumber, verseStart, verseEnd } = parseVerseRef(ref);
    if (verseEnd < verseStart) {
      errors.push(`ayet referansi '${ref}' tersine aralik`);
      continue;
    }
    const { rows } = await client.query<{ hit: string }>(
      `SELECT count(*)::text AS hit FROM verse
        WHERE surah_id = $1 AND verse_number BETWEEN $2 AND $3`,
      [surahNumber, verseStart, verseEnd],
    );
    const expected = verseEnd - verseStart + 1;
    if (Number(rows[0]?.hit ?? "0") !== expected) {
      errors.push(`ayet referansi '${ref}' cozulemedi — ${expected} ayet bekleniyordu, ${rows[0]?.hit ?? 0} bulundu`);
    }
  }
  return errors;
}

export function expandRef(ref: string): number[] {
  const { surahNumber, verseStart, verseEnd } = parseVerseRef(ref);
  const ids: number[] = [];
  for (let n = verseStart; n <= verseEnd; n += 1) ids.push(computeVerseId(surahNumber, n));
  return ids;
}

/** Coklu INSERT ... RETURNING; anahtar kolonuyla id eslestirir. */
export async function insertReturning(
  client: Client,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
  keyColumn: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (rows.length === 0) return map;
  const quote = (c: string): string => `"${c}"`;
  const values: unknown[] = [];
  const tuples = rows.map(
    (row) => `(${row.map((v) => { values.push(v); return `$${values.length}`; }).join(", ")})`,
  );
  const { rows: out } = await client.query<{ id: number; key: unknown }>(
    `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")}) VALUES ${tuples.join(", ")}
     RETURNING id, ${quote(keyColumn)}::text AS key`,
    values,
  );
  for (const r of out) map.set(String(r.key), r.id);
  info(`${table}: ${out.length.toLocaleString("tr-TR")} satir yazildi`);
  return map;
}

export async function insertPlain(
  client: Client,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
): Promise<void> {
  if (rows.length === 0) return;
  const quote = (c: string): string => `"${c}"`;
  const values: unknown[] = [];
  const tuples = rows.map(
    (row) => `(${row.map((v) => { values.push(v); return `$${values.length}`; }).join(", ")})`,
  );
  const result = await client.query(
    `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")}) VALUES ${tuples.join(", ")}`,
    values,
  );
  info(`${table}: ${(result.rowCount ?? 0).toLocaleString("tr-TR")} satir yazildi`);
}

export const CONTENT_TABLES = [
  "story", "story_related", "story_passage", "story_lesson", "story_lesson_source",
  "location", "location_source", "story_location", "story_location_passage",
  "concept", "concept_verse", "concept_relation", "concept_root", "concept_source", "story_concept",
  "timeline_event", "timeline_event_surah", "timeline_event_verse", "timeline_event_source",
  "principle_area", "principle_area_source",
  "principle", "principle_source", "principle_verse", "principle_story", "principle_concept",
  "surah_section", "section_verse",
  "ai_prompt", "media_item", "media_story", "media_verse", "media_timeline_event", "media_source",
  // `verse_relation` BILEREK burada degil: tabloyu iki yazar paylasiyor.
  // Turetilmis baglar (source_id NULL) asagida silinip yeniden hesaplanir;
  // QUL lafzi benzerlik baglari (`data:qul-matching`, source_id dolu) kalir.
  // TRUNCATE ikisini birden siliyordu — 3 552 parallel_passage boyle kayboldu.
] as const;
