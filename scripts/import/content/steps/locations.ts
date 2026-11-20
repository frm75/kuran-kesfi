/**
 * Icerik aktarma adimi — Konumlar ve kaynaklari.
 */

import type { ImportContext, IdMap } from "../context.js";
import { insertPlain, insertReturning } from "../db.js";

export async function importLocations(ctx: ImportContext): Promise<IdMap> {
  const { client, data, sid } = ctx;

  const locationId = await insertReturning(
    client,
    "location",
    ["slug", "name", "modern_name", "country", "lat", "lng", "confidence", "elevation_m", "source_note", "alternatives"],
    data.locations.map((l) => [
      l.slug, l.name, l.modernName, l.country, l.lat, l.lng, l.confidence, l.elevationM, l.sourceNote,
      JSON.stringify(l.alternatives),
    ]),
    "slug",
  );
  await insertPlain(
    client,
    "location_source",
    ["location_id", "source_id"],
    data.locations.flatMap((l) => [...new Set(l.sourceSlugs)].map((s) => [locationId.get(l.slug), sid(s)])),
  );

  return locationId;
}
