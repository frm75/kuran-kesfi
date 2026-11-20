/**
 * Icerik aktarma adimi — Ilke alanlari ve ilkeler.
 */

import type { ImportContext, IdMap } from "../context.js";
import { expandRef, insertPlain, insertReturning } from "../db.js";

export async function importPrinciples(ctx: ImportContext, ids: { conceptId: IdMap; storyId: IdMap }): Promise<void> {
  const { client, data, sid, rootIdByLatin } = ctx;
  const { conceptId, storyId } = ids;

  const areaId = await insertReturning(
    client,
    "principle_area",
    ["slug", "name_tr", "name_ar", "definition", "order"],
    data.principleAreas.map((a) => [a.slug, a.nameTr, a.nameAr, a.definition, a.order]),
    "slug",
  );
  await insertPlain(
    client,
    "principle_area_source",
    ["principle_area_id", "source_id"],
    data.principleAreas.flatMap((a) => [...new Set(a.sourceSlugs)].map((s) => [areaId.get(a.slug), sid(s)])),
  );

  // --- ilkeler -----------------------------------------------------------
  const principleId = await insertReturning(
    client,
    "principle",
    ["slug", "name_tr", "name_ar", "root_id", "area_id", "definition", "explanation", "daily_note", "opposite_principle_id", "order"],
    data.principles.map((p) => [
      p.slug, p.nameTr, p.nameAr, p.rootLatin === null ? null : rootIdByLatin.get(p.rootLatin),
      areaId.get(p.areaSlug),
      p.definition, p.explanation, p.dailyNote, null, p.order,
    ]),
    "slug",
  );
  for (const p of data.principles) {
    if (p.oppositeSlug === null) continue;
    await client.query("UPDATE principle SET opposite_principle_id = $2 WHERE id = $1", [
      principleId.get(p.slug),
      principleId.get(p.oppositeSlug),
    ]);
  }
  await insertPlain(
    client,
    "principle_source",
    ["principle_id", "source_id"],
    data.principles.flatMap((p) => [...new Set(p.sourceSlugs)].map((s) => [principleId.get(p.slug), sid(s)])),
  );
  const pvRows: unknown[][] = [];
  for (const p of data.principles) {
    const seen = new Set<number>();
    for (const v of p.verses) {
      for (const id of expandRef(v.ref)) {
        // Ayni ayet iki referansta gecerse ilk rol kalir; PK (principle, verse)
        if (seen.has(id)) continue;
        seen.add(id);
        pvRows.push([principleId.get(p.slug), id, v.role, v.note]);
      }
    }
  }
  await insertPlain(client, "principle_verse", ["principle_id", "verse_id", "role", "note"], pvRows);
  await insertPlain(
    client,
    "principle_story",
    ["principle_id", "story_id", "note"],
    data.principles.flatMap((p) => p.stories.map((s) => [principleId.get(p.slug), storyId.get(s.slug), s.note])),
  );
  await insertPlain(
    client,
    "principle_concept",
    ["principle_id", "concept_id"],
    data.principles.flatMap((p) => [...new Set(p.concepts)].map((c) => [principleId.get(p.slug), conceptId.get(c)])),
  );
}
