/**
 * Icerik aktarma adimi — Zaman cizelgesi.
 */

import type { ImportContext, IdMap } from "../context.js";
import { expandRef, insertPlain, insertReturning } from "../db.js";

export async function importTimeline(ctx: ImportContext): Promise<IdMap> {
  const { client, data, sid } = ctx;

  const eventId = await insertReturning(
    client,
    "timeline_event",
    ["order", "title", "description", "period", "approx_year", "confidence", "source_note"],
    data.events.map((e) => [e.order, e.title, e.description, e.period, e.approxYear, e.confidence, e.sourceNote]),
    "order",
  );
  const eid = (order: number): number | undefined => eventId.get(String(order));
  await insertPlain(
    client,
    "timeline_event_surah",
    ["timeline_event_id", "surah_id"],
    data.events.flatMap((e) => [...new Set(e.surahIds)].map((s) => [eid(e.order), s])),
  );
  const evRows: unknown[][] = [];
  for (const e of data.events) {
    const seen = new Set<number>();
    for (const ref of e.verseRefs) for (const id of expandRef(ref)) {
      if (seen.has(id)) continue;
      seen.add(id);
      evRows.push([eid(e.order), id]);
    }
  }
  await insertPlain(client, "timeline_event_verse", ["timeline_event_id", "verse_id"], evRows);
  await insertPlain(
    client,
    "timeline_event_source",
    ["timeline_event_id", "source_id"],
    data.events.flatMap((e) => [...new Set(e.sourceSlugs)].map((s) => [eid(e.order), sid(s)])),
  );

  return eventId;
}
