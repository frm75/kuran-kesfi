/**
 * Icerik aktarma adimi — Kissalar: parcalar, dersler, duraklar, kavram baglari.
 */

import { parseVerseRef } from "@kuran/schema";
import { info } from "@kuran/pipeline";
import type { ImportContext, IdMap } from "../context.js";
import { insertPlain, insertReturning } from "../db.js";

export async function importStories(ctx: ImportContext, ids: { locationId: IdMap; conceptId: IdMap }): Promise<IdMap> {
  const { client, data, sid } = ctx;
  const { locationId, conceptId } = ids;

  const storyId = await insertReturning(
    client,
    "story",
    ["slug", "title", "type", "chronological_order", "era_start", "era_end", "summary", "cover_image"],
    data.stories.map((s) => [s.slug, s.title, s.type, s.chronologicalOrder, s.eraStart, s.eraEnd, s.summary, s.coverImage]),
    "slug",
  );
  await insertPlain(
    client,
    "story_related",
    ["story_id", "related_story_id"],
    data.stories.flatMap((s) => s.relatedStories.map((r) => [storyId.get(s.slug), storyId.get(r)])),
  );

  // Parcalar: (story_id, order) -> id
  const passageRows: unknown[][] = [];
  for (const s of data.stories) {
    for (const p of s.passages) {
      const { surahNumber, verseStart, verseEnd } = parseVerseRef(p.ref);
      passageRows.push([storyId.get(s.slug), p.order, p.title, surahNumber, verseStart, verseEnd, p.note]);
    }
  }
  const passageIdByKey = new Map<string, number>();
  if (passageRows.length > 0) {
    const quoteCols = ["story_id", "\"order\"", "title", "surah_id", "verse_start", "verse_end", "note"];
    const values: unknown[] = [];
    const tuples = passageRows.map((row) => `(${row.map((v) => { values.push(v); return `$${values.length}`; }).join(", ")})`);
    const { rows } = await client.query<{ id: number; story_id: number; order: number }>(
      `INSERT INTO story_passage (${quoteCols.join(", ")}) VALUES ${tuples.join(", ")} RETURNING id, story_id, "order"`,
      values,
    );
    for (const r of rows) passageIdByKey.set(`${r.story_id}#${r.order}`, r.id);
    info(`story_passage: ${rows.length.toLocaleString("tr-TR")} satir yazildi`);
  }

  // Dersler + kaynaklari
  const lessonRows: unknown[][] = [];
  for (const s of data.stories) {
    for (const l of s.lessons) lessonRows.push([storyId.get(s.slug), l.order, l.text, l.sourceName, l.sourceReference]);
  }
  if (lessonRows.length > 0) {
    const values: unknown[] = [];
    const tuples = lessonRows.map((row) => `(${row.map((v) => { values.push(v); return `$${values.length}`; }).join(", ")})`);
    const { rows } = await client.query<{ id: number; story_id: number; order: number }>(
      `INSERT INTO story_lesson (story_id, "order", text, source_name, source_reference) VALUES ${tuples.join(", ")}
       RETURNING id, story_id, "order"`,
      values,
    );
    const lessonId = new Map(rows.map((r) => [`${r.story_id}#${r.order}`, r.id]));
    info(`story_lesson: ${rows.length.toLocaleString("tr-TR")} satir yazildi`);
    const lsRows: unknown[][] = [];
    for (const s of data.stories) {
      for (const l of s.lessons) {
        for (const src of new Set(l.sourceSlugs)) lsRows.push([lessonId.get(`${storyId.get(s.slug)}#${l.order}`), sid(src)]);
      }
    }
    await insertPlain(client, "story_lesson_source", ["story_lesson_id", "source_id"], lsRows);
  }

  // Kissa duraklari + parca baglantilari
  const slRows: unknown[][] = [];
  const slpRows: unknown[][] = [];
  for (const s of data.stories) {
    const stId = storyId.get(s.slug);
    for (const l of s.locations) {
      const locId = locationId.get(l.locationSlug);
      slRows.push([stId, locId, l.order, l.eventDescription]);
      for (const po of l.passageOrders) slpRows.push([stId, locId, l.order, passageIdByKey.get(`${stId}#${po}`)]);
    }
  }
  await insertPlain(client, "story_location", ["story_id", "location_id", "order", "event_description"], slRows);
  await insertPlain(client, "story_location_passage", ["story_id", "location_id", "order", "story_passage_id"], slpRows);
  await insertPlain(
    client,
    "story_concept",
    ["story_id", "concept_id"],
    data.stories.flatMap((s) => [...new Set(s.concepts)].map((c) => [storyId.get(s.slug), conceptId.get(c)])),
  );

  return storyId;
}
