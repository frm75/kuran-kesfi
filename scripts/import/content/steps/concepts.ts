/**
 * Icerik aktarma adimi — Kavramlar: kokten turetilen ayet eslesmesi, elle duzeltmeler, birlikte gecme.
 */

import { info, upsertMany } from "@kuran/pipeline";
import type { ImportContext, IdMap } from "../context.js";
import { expandRef, insertPlain, insertReturning } from "../db.js";

export async function importConcepts(ctx: ImportContext): Promise<IdMap> {
  const { client, data, report, sid, rootIdByLatin } = ctx;

  const conceptId = await insertReturning(
    client,
    "concept",
    ["slug", "name_tr", "name_ar", "definition", "parent_id"],
    data.concepts.map((c) => [c.slug, c.nameTr, c.nameAr, c.definition, null]),
    "slug",
  );
  for (const c of data.concepts) {
    if (c.parentSlug === null) continue;
    await client.query("UPDATE concept SET parent_id = $2 WHERE id = $1", [
      conceptId.get(c.slug),
      conceptId.get(c.parentSlug),
    ]);
  }
  await insertPlain(
    client,
    "concept_source",
    ["concept_id", "source_id"],
    data.concepts.flatMap((c) => [...new Set(c.sourceSlugs)].map((s) => [conceptId.get(c.slug), sid(s)])),
  );
  await insertPlain(
    client,
    "concept_root",
    ["concept_id", "root_id"],
    data.concepts.flatMap((c) => [...new Set(c.roots)].map((r) => [conceptId.get(c.slug), rootIdByLatin.get(r)])),
  );

  // Kokten turetilen ayet eslestirmesi — platform derlemesi, source_id NULL
  const derived = await client.query(
    `INSERT INTO concept_verse (concept_id, verse_id, weight, source_id)
     SELECT cr.concept_id, vp.verse_id, LEAST(3, count(*))::smallint, NULL
       FROM concept_root cr
       JOIN verse_part vp ON vp.root_id = cr.root_id
      GROUP BY cr.concept_id, vp.verse_id`,
  );
  info(`concept_verse: ${(derived.rowCount ?? 0).toLocaleString("tr-TR")} satir kokten turetildi`);

  // Elle duzeltmeler turetilenin ustune yazar
  const manualVerses: unknown[][] = [];
  for (const c of data.concepts) {
    for (const v of c.verses) for (const id of expandRef(v.ref)) manualVerses.push([conceptId.get(c.slug), id, v.weight]);
  }
  if (manualVerses.length > 0) {
    await upsertMany(client, "concept_verse", ["concept_id", "verse_id", "weight"], manualVerses, ["concept_id", "verse_id"]);
  }

  /*
   * Elle yazilan iliskiler.
   *
   * Iliski YONSUZ ama birincil anahtar (source, target, type) yonlu. Iki
   * kavram birbirini karsilikli yazdiginda (kibir<->tevazu) ya da ayni cift
   * iki dosyada gectiginde catisma olurdu. Bu yuzden her cift kucuk id
   * once gelecek sekilde normalize edilir ve tekillestirilir; agirlik
   * catisirsa buyuk olan kalir (daha guclu iddia korunur).
   */
  const manualKeys = new Set<string>();
  const manualMap = new Map<string, unknown[]>();
  for (const c of data.concepts) {
    for (const r of c.relations) {
      const a = conceptId.get(c.slug);
      const b = conceptId.get(r.target);
      if (a === undefined || b === undefined) continue;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const key = `${String(lo)}:${String(hi)}:${r.type}`;
      const existing = manualMap.get(key);
      if (existing === undefined) {
        manualMap.set(key, [lo, hi, r.type, r.weight]);
      } else if (r.weight > Number(existing[3])) {
        existing[3] = r.weight;
      }
      manualKeys.add(`${String(lo)}:${String(hi)}`);
    }
  }
  await insertPlain(
    client,
    "concept_relation",
    ["source_concept_id", "target_concept_id", "relation_type", "weight", "origin"],
    [...manualMap.values()].map((row) => [...row, "curated"]),
  );

  // Hesaplanan birlikte gecme (co_occurrence)
  const sizes = new Map<number, number>();
  for (const r of (await client.query<{ concept_id: number; n: string }>(
    "SELECT concept_id, count(*)::text AS n FROM concept_verse GROUP BY concept_id",
  )).rows) sizes.set(r.concept_id, Number(r.n));
  const pairs = (await client.query<{ a: number; b: number; shared: string }>(
    `SELECT a.concept_id AS a, b.concept_id AS b, count(*)::text AS shared
       FROM concept_verse a JOIN concept_verse b
         ON a.verse_id = b.verse_id AND a.concept_id < b.concept_id
      GROUP BY a.concept_id, b.concept_id HAVING count(*) >= 3`,
  )).rows.map((r) => {
    const shared = Number(r.shared);
    const cosine = shared / Math.sqrt((sizes.get(r.a) ?? 1) * (sizes.get(r.b) ?? 1));
    return { a: r.a, b: r.b, shared, cosine };
  });
  // Kavram basina en yakin 6 komsu; cift her iki taraftan da secilebilir
  const neighbours = new Map<number, typeof pairs>();
  for (const p of pairs) {
    for (const side of [p.a, p.b]) {
      const list = neighbours.get(side) ?? [];
      list.push(p);
      neighbours.set(side, list);
    }
  }
  const chosen = new Set<string>();
  for (const list of neighbours.values()) {
    list.sort((x, y) => y.cosine - x.cosine);
    for (const p of list.slice(0, 6)) chosen.add(`${p.a}:${p.b}`);
  }
  const coRows: unknown[][] = [];
  for (const key of chosen) {
    // Elle yazilmis bir cift ise hesaplanan iliski onun ustune yazilmaz:
    // insan kararı (contrast, cause, part_of) istatistigi yener.
    if (manualKeys.has(key)) continue;
    const [a, b] = key.split(":").map(Number);
    const p = pairs.find((x) => x.a === a && x.b === b);
    if (p === undefined) continue;
    const weight = p.cosine >= 0.25 ? 3 : p.cosine >= 0.12 ? 2 : 1;
    coRows.push([a, b, "co_occurrence", weight, "computed"]);
  }
  await insertPlain(
    client,
    "concept_relation",
    ["source_concept_id", "target_concept_id", "relation_type", "weight", "origin"],
    coRows,
  );
  report.note(`Kavram birlikte gecme iliskisi: ${coRows.length} cift (kosinus benzerligi, kavram basina en fazla 6)`);

  return conceptId;
}
