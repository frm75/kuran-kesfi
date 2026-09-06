import type {
  StaticConcept,
  StaticConceptsIndex,
  StaticLocations,
  StaticManuscripts,
  StaticMedia,
  StaticVerseMedia,
  StaticPrinciple,
  StaticPrinciplesIndex,
  StaticStoriesIndex,
  StaticStory,
  StaticSurahMeta,
  StaticTimeline,
  StaticVerseLinks,
  StaticVerseManuscripts,
  StaticVerseRelations,
  StaticSurahSections,
  StaticTafsirBlock,
  StaticTafsirIndex,
  StaticTafsirSurah,
} from "@kuran/schema";
import {
  staticConcept,
  staticConceptsIndex,
  staticLocations,
  staticManuscripts,
  staticMedia,
  staticVerseMedia,
  staticPrinciple,
  staticPrinciplesIndex,
  staticStoriesIndex,
  staticStory,
  staticTimeline,
  staticVerseLinks,
  staticVerseManuscripts,
  staticVerseRelations,
  staticSurahSections,
  staticTafsirIndex,
  staticTafsirSurah,
} from "@kuran/schema";
import { fail, info, pool } from "@kuran/pipeline";
import type { Report } from "@kuran/pipeline";
import type { Emitter } from "./emit.js";

/**
 * Icerik katmani ciktisi — kissa, konum, kavram, ilke, zaman cizelgesi.
 *
 * Girdi: scripts/import/content.ts'in doldurdugu tablolar. Cikti: statik JSON
 * (sema: @kuran/schema static_content.ts). Icerik tablolari bossa hic dosya
 * yazilmaz ve build yine gecer — siteler icerik gelmeden de kurulabilmeli.
 *
 * Ayet METNI tasinmaz (bkz. static_content.ts basi). Adlar (sure adi, kavram
 * adi) tasinir ki sayfa build'inde ikinci bir dizin okumaya gerek kalmasin.
 */

type Rows<T> = Promise<T[]>;
async function q<T extends Record<string, unknown>>(sql: string): Rows<T> {
  return (await pool.query<T>(sql)).rows;
}

function verifyOrFail<T>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { message: string } } },
  payload: unknown,
  label: string,
): void {
  const r = schema.safeParse(payload);
  if (!r.success) fail(`${label} sema dogrulamasi basarisiz:\n${r.error.message}`);
}

export async function emitContent(
  emitter: Emitter,
  metas: readonly StaticSurahMeta[],
  report: Report,
): Promise<void> {
  const surahById = new Map(metas.map((m) => [m.id, m]));
  const surahOf = (id: number): StaticSurahMeta => {
    const m = surahById.get(id);
    if (m === undefined) fail(`bilinmeyen sure ${id}`);
    return m;
  };
  const pointer = (verseId: number) => {
    const surahId = Math.floor(verseId / 1000);
    const m = surahOf(surahId);
    return { surahId, surahSlug: m.slug, surahNameTr: m.nameTr, verseNumber: verseId % 1000 };
  };

  // --- ham satirlar ----------------------------------------------------------
  const stories = await q<{
    id: number; slug: string; title: string; type: "prophet" | "people" | "person" | "event";
    chronological_order: number; era_start: string | null; era_end: string | null;
    summary: string; cover_image: string | null;
  }>("SELECT * FROM story ORDER BY chronological_order, slug");

  const concepts = await q<{
    id: number; slug: string; name_tr: string; name_ar: string | null; definition: string; parent_id: number | null;
  }>("SELECT * FROM concept ORDER BY slug");

  const principles = await q<{
    id: number; slug: string; name_tr: string; name_ar: string | null; root_id: number | null;
    definition: string; explanation: string; daily_note: string | null;
    opposite_principle_id: number | null; order: number;
  }>('SELECT * FROM principle ORDER BY "order"');

  const events = await q<{
    id: number; order: number; title: string; description: string;
    period: "mekke_1" | "mekke_2" | "mekke_3" | "medine"; approx_year: number | null;
    confidence: "kesin" | "muhtemel" | "rivayet"; source_note: string;
  }>('SELECT * FROM timeline_event ORDER BY "order"');

  // Konum DORT dereceli (location_confidence), kronoloji ve iliski UC
  // (confidence_level). Iki tur bilerek ayri — packages/schema/src/common.ts.
  const locations = await q<{
    id: number; slug: string; name: string; modern_name: string | null; country: string | null;
    lat: number | null; lng: number | null;
    confidence: "kesin" | "muhtemel" | "gelenek" | "tartismali";
    elevation_m: number | null;
    source_note: string; alternatives: unknown;
  }>("SELECT * FROM location ORDER BY slug");

  if (stories.length + concepts.length + principles.length + events.length + locations.length === 0) {
    info("icerik katmani: tablolar bos, cikti yazilmadi");
    return;
  }

  const sourceSlugById = new Map(
    (await q<{ id: number; slug: string }>("SELECT id, slug FROM source")).map((r) => [r.id, r.slug]),
  );
  const sslug = (id: number): string => {
    const s = sourceSlugById.get(id);
    if (s === undefined) fail(`kaynak id ${id} yok`);
    return s;
  };
  const group = <T, K>(rows: readonly T[], key: (r: T) => K): Map<K, T[]> => {
    const m = new Map<K, T[]>();
    for (const r of rows) {
      const k = key(r);
      const list = m.get(k);
      if (list === undefined) m.set(k, [r]);
      else list.push(r);
    }
    return m;
  };

  const storyById = new Map(stories.map((s) => [s.id, s]));
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const principleById = new Map(principles.map((p) => [p.id, p]));
  const locationById = new Map(locations.map((l) => [l.id, l]));

  const passages = group(
    await q<{ id: number; story_id: number; order: number; title: string; surah_id: number; verse_start: number; verse_end: number; note: string | null }>(
      'SELECT * FROM story_passage ORDER BY story_id, "order"',
    ),
    (r) => r.story_id,
  );
  const lessons = group(
    await q<{ id: number; story_id: number; order: number; text: string; source_name: string; source_reference: string }>(
      'SELECT * FROM story_lesson ORDER BY story_id, "order"',
    ),
    (r) => r.story_id,
  );
  const lessonSources = group(
    await q<{ story_lesson_id: number; source_id: number }>("SELECT * FROM story_lesson_source ORDER BY 1, 2"),
    (r) => r.story_lesson_id,
  );
  const storyLocations = group(
    await q<{ story_id: number; location_id: number; order: number; event_description: string }>(
      'SELECT * FROM story_location ORDER BY story_id, "order", location_id',
    ),
    (r) => r.story_id,
  );
  const storyLocationPassages = await q<{ story_id: number; location_id: number; order: number; story_passage_id: number }>(
    "SELECT * FROM story_location_passage",
  );
  const passageOrderById = new Map<number, number>();
  for (const list of passages.values()) for (const p of list) passageOrderById.set(p.id, p.order);
  const storyRelated = group(
    await q<{ story_id: number; related_story_id: number }>("SELECT * FROM story_related ORDER BY 1, 2"),
    (r) => r.story_id,
  );
  const storyConcepts = await q<{ story_id: number; concept_id: number }>("SELECT * FROM story_concept ORDER BY 1, 2");
  const principleStories = await q<{ principle_id: number; story_id: number; note: string | null }>(
    "SELECT * FROM principle_story ORDER BY 1, 2",
  );
  const principleConcepts = await q<{ principle_id: number; concept_id: number }>("SELECT * FROM principle_concept ORDER BY 1, 2");
  const principleSources = group(
    await q<{ principle_id: number; source_id: number }>("SELECT * FROM principle_source ORDER BY 1, 2"),
    (r) => r.principle_id,
  );
  const principleVerses = group(
    await q<{ principle_id: number; verse_id: number; role: "primary" | "secondary"; note: string | null }>(
      "SELECT * FROM principle_verse ORDER BY principle_id, role, verse_id",
    ),
    (r) => r.principle_id,
  );
  const conceptRoots = group(
    await q<{ concept_id: number; arabic: string; latin: string; n: string }>(
      `SELECT cr.concept_id, r.arabic, r.latin,
              (SELECT count(*) FROM verse_part vp WHERE vp.root_id = r.id)::text AS n
         FROM concept_root cr JOIN root r ON r.id = cr.root_id
        ORDER BY cr.concept_id, r.arabic`,
    ),
    (r) => r.concept_id,
  );
  const conceptVerses = group(
    await q<{ concept_id: number; verse_id: number; weight: number }>(
      "SELECT concept_id, verse_id, weight FROM concept_verse ORDER BY concept_id, weight DESC, verse_id",
    ),
    (r) => r.concept_id,
  );
  const conceptRelations = await q<{ source_concept_id: number; target_concept_id: number; relation_type: "co_occurrence" | "cause" | "contrast" | "part_of"; weight: number }>(
    "SELECT * FROM concept_relation ORDER BY 1, 2, 3",
  );
  const conceptSources = group(
    await q<{ concept_id: number; source_id: number }>("SELECT * FROM concept_source ORDER BY 1, 2"),
    (r) => r.concept_id,
  );
  const locationSources = group(
    await q<{ location_id: number; source_id: number }>("SELECT * FROM location_source ORDER BY 1, 2"),
    (r) => r.location_id,
  );
  const eventSurahs = group(
    await q<{ timeline_event_id: number; surah_id: number }>("SELECT * FROM timeline_event_surah ORDER BY 1, 2"),
    (r) => r.timeline_event_id,
  );
  const eventVerses = group(
    await q<{ timeline_event_id: number; verse_id: number }>("SELECT * FROM timeline_event_verse ORDER BY 1, 2"),
    (r) => r.timeline_event_id,
  );
  const eventSources = group(
    await q<{ timeline_event_id: number; source_id: number }>("SELECT * FROM timeline_event_source ORDER BY 1, 2"),
    (r) => r.timeline_event_id,
  );

  // --- ters dizin ----------------------------------------------------------
  const links = new Map<number, { stories: Set<string>; principles: { slug: string; role: "primary" | "secondary" }[]; concepts: { slug: string; weight: number }[]; events: Set<number> }>();
  const linkOf = (verseId: number) => {
    let l = links.get(verseId);
    if (l === undefined) {
      l = { stories: new Set(), principles: [], concepts: [], events: new Set() };
      links.set(verseId, l);
    }
    return l;
  };

  // --- kissalar ------------------------------------------------------------
  const storiesIndex: StaticStoriesIndex["stories"] = [];
  for (const s of stories) {
    const ps = passages.get(s.id) ?? [];
    if (ps.length === 0) fail(`kissa ${s.slug}: parca yok`);
    const staticPassages = ps.map((p) => {
      const m = surahOf(p.surah_id);
      for (let n = p.verse_start; n <= p.verse_end; n += 1) linkOf(p.surah_id * 1000 + n).stories.add(s.slug);
      return {
        order: p.order, title: p.title, surahId: p.surah_id, surahSlug: m.slug, surahNameTr: m.nameTr,
        verseStart: p.verse_start, verseEnd: p.verse_end, note: p.note,
      };
    });
    const verseCount = ps.reduce((a, p) => a + (p.verse_end - p.verse_start + 1), 0);
    const locs = (storyLocations.get(s.id) ?? []).map((sl) => {
      const l = locationById.get(sl.location_id);
      if (l === undefined) fail(`kissa ${s.slug}: konum ${sl.location_id} yok`);
      return {
        slug: l.slug, name: l.name, modernName: l.modern_name, country: l.country, lat: l.lat, lng: l.lng,
        confidence: l.confidence, order: sl.order, eventDescription: sl.event_description,
        passageOrders: storyLocationPassages
          .filter((x) => x.story_id === s.id && x.location_id === sl.location_id && x.order === sl.order)
          .map((x) => passageOrderById.get(x.story_passage_id) ?? 0)
          .filter((o) => o > 0)
          .sort((a, b) => a - b),
      };
    });
    const payload: StaticStory = {
      slug: s.slug, title: s.title, type: s.type, chronologicalOrder: s.chronological_order,
      eraStart: s.era_start, eraEnd: s.era_end, summary: s.summary, coverImage: s.cover_image,
      passages: staticPassages, verseCount,
      lessons: (lessons.get(s.id) ?? []).map((l) => ({
        order: l.order, text: l.text, sourceName: l.source_name, sourceReference: l.source_reference,
        sourceSlugs: (lessonSources.get(l.id) ?? []).map((x) => sslug(x.source_id)),
      })),
      locations: locs,
      concepts: storyConcepts.filter((x) => x.story_id === s.id).map((x) => {
        const c = conceptById.get(x.concept_id);
        if (c === undefined) fail(`kissa ${s.slug}: kavram ${x.concept_id} yok`);
        return { slug: c.slug, nameTr: c.name_tr };
      }),
      principles: principleStories.filter((x) => x.story_id === s.id).map((x) => {
        const p = principleById.get(x.principle_id);
        if (p === undefined) fail(`kissa ${s.slug}: ilke ${x.principle_id} yok`);
        return { slug: p.slug, nameTr: p.name_tr, note: x.note };
      }),
      relatedStories: (storyRelated.get(s.id) ?? []).map((x) => {
        const r = storyById.get(x.related_story_id);
        if (r === undefined) fail(`kissa ${s.slug}: iliskili kissa ${x.related_story_id} yok`);
        return { slug: r.slug, title: r.title };
      }),
    };
    verifyOrFail(staticStory, payload, `story/story_${s.slug}.json`);
    emitter.write(`story/story_${s.slug}.json`, payload);
    storiesIndex.push({
      slug: s.slug, title: s.title, type: s.type, chronologicalOrder: s.chronological_order,
      eraStart: s.era_start, eraEnd: s.era_end, summary: s.summary,
      passageCount: ps.length, verseCount, locationCount: locs.length, first: staticPassages[0]!,
    });
  }
  if (storiesIndex.length > 0) {
    const payload: StaticStoriesIndex = { stories: storiesIndex };
    verifyOrFail(staticStoriesIndex, payload, "stories_index.json");
    emitter.write("stories_index.json", payload);
  }

  // --- konumlar ------------------------------------------------------------
  if (locations.length > 0) {
    const payload: StaticLocations = {
      locations: locations.map((l) => ({
        slug: l.slug, name: l.name, modernName: l.modern_name, country: l.country, lat: l.lat, lng: l.lng,
        confidence: l.confidence, elevationM: l.elevation_m, sourceNote: l.source_note,
        alternatives: (l.alternatives as StaticLocations["locations"][number]["alternatives"]) ?? [],
        sourceSlugs: (locationSources.get(l.id) ?? []).map((x) => sslug(x.source_id)),
        stories: [...storyLocations.values()].flat()
          .filter((sl) => sl.location_id === l.id)
          .map((sl) => {
            const s = storyById.get(sl.story_id);
            if (s === undefined) fail(`konum ${l.slug}: kissa ${sl.story_id} yok`);
            return { slug: s.slug, title: s.title, order: sl.order, eventDescription: sl.event_description };
          })
          .sort((a, b) => a.slug.localeCompare(b.slug) || a.order - b.order),
      })),
    };
    verifyOrFail(staticLocations, payload, "locations.json");
    emitter.write("locations.json", payload);
  }

  // --- zaman cizelgesi -----------------------------------------------------
  if (events.length > 0) {
    const payload: StaticTimeline = {
      events: events.map((e) => {
        for (const v of eventVerses.get(e.id) ?? []) linkOf(v.verse_id).events.add(e.order);
        return {
          order: e.order, title: e.title, description: e.description, period: e.period,
          approxYear: e.approx_year, confidence: e.confidence, sourceNote: e.source_note,
          sourceSlugs: (eventSources.get(e.id) ?? []).map((x) => sslug(x.source_id)),
          surahs: (eventSurahs.get(e.id) ?? []).map((x) => {
            const m = surahOf(x.surah_id);
            return { id: m.id, slug: m.slug, nameTr: m.nameTr };
          }),
          verses: (eventVerses.get(e.id) ?? []).map((x) => pointer(x.verse_id)),
        };
      }),
    };
    verifyOrFail(staticTimeline, payload, "timeline.json");
    emitter.write("timeline.json", payload);
  }

  // --- ilkeler -------------------------------------------------------------
  const rootById = new Map(
    (await q<{ id: number; arabic: string; latin: string }>("SELECT id, arabic, latin FROM root")).map((r) => [r.id, r]),
  );
  const principlesIndex: StaticPrinciplesIndex["principles"] = [];
  for (const p of principles) {
    const vs = principleVerses.get(p.id) ?? [];
    if (vs.length === 0) fail(`ilke ${p.slug}: ayet dayanagi yok`);
    for (const v of vs) linkOf(v.verse_id).principles.push({ slug: p.slug, role: v.role });
    const root = p.root_id === null ? null : rootById.get(p.root_id) ?? null;
    const opposite = p.opposite_principle_id === null ? null : principleById.get(p.opposite_principle_id) ?? null;
    const payload: StaticPrinciple = {
      slug: p.slug, nameTr: p.name_tr, nameAr: p.name_ar,
      root: root === null ? null : { arabic: root.arabic, latin: root.latin },
      definition: p.definition, explanation: p.explanation, dailyNote: p.daily_note,
      opposite: opposite === null ? null : { slug: opposite.slug, nameTr: opposite.name_tr },
      order: p.order,
      sourceSlugs: (principleSources.get(p.id) ?? []).map((x) => sslug(x.source_id)),
      verses: vs.map((v) => ({ ...pointer(v.verse_id), role: v.role, note: v.note })),
      stories: principleStories.filter((x) => x.principle_id === p.id).map((x) => {
        const s = storyById.get(x.story_id);
        if (s === undefined) fail(`ilke ${p.slug}: kissa ${x.story_id} yok`);
        return { slug: s.slug, title: s.title, note: x.note };
      }),
      concepts: principleConcepts.filter((x) => x.principle_id === p.id).map((x) => {
        const c = conceptById.get(x.concept_id);
        if (c === undefined) fail(`ilke ${p.slug}: kavram ${x.concept_id} yok`);
        return { slug: c.slug, nameTr: c.name_tr };
      }),
    };
    verifyOrFail(staticPrinciple, payload, `principle/principle_${p.slug}.json`);
    emitter.write(`principle/principle_${p.slug}.json`, payload);
    principlesIndex.push({
      slug: p.slug, nameTr: p.name_tr, nameAr: p.name_ar, definition: p.definition, order: p.order,
      primaryCount: vs.filter((v) => v.role === "primary").length, verseCount: vs.length,
      oppositeSlug: opposite?.slug ?? null,
    });
  }
  if (principlesIndex.length > 0) {
    const payload: StaticPrinciplesIndex = { principles: principlesIndex };
    verifyOrFail(staticPrinciplesIndex, payload, "principles_index.json");
    emitter.write("principles_index.json", payload);
  }

  // --- kavramlar -----------------------------------------------------------
  const conceptsIndex: StaticConceptsIndex["concepts"] = [];
  for (const c of concepts) {
    const vs = conceptVerses.get(c.id) ?? [];
    for (const v of vs) linkOf(v.verse_id).concepts.push({ slug: c.slug, weight: v.weight });
    const bySurah = new Map<number, number>();
    for (const v of vs) {
      const sid = Math.floor(v.verse_id / 1000);
      bySurah.set(sid, (bySurah.get(sid) ?? 0) + 1);
    }
    let mekki = 0;
    let medeni = 0;
    for (const [sid, n] of bySurah) {
      if (surahOf(sid).revelationType === "mekki") mekki += n;
      else medeni += n;
    }
    const parent = c.parent_id === null ? null : conceptById.get(c.parent_id) ?? null;
    const rel = conceptRelations
      .filter((r) => r.source_concept_id === c.id || r.target_concept_id === c.id)
      .map((r) => {
        const otherId = r.source_concept_id === c.id ? r.target_concept_id : r.source_concept_id;
        const o = conceptById.get(otherId);
        if (o === undefined) fail(`kavram ${c.slug}: iliski hedefi ${otherId} yok`);
        return { slug: o.slug, nameTr: o.name_tr, type: r.relation_type, weight: r.weight };
      })
      .sort((a, b) => (a.type === b.type ? b.weight - a.weight || a.slug.localeCompare(b.slug) : a.type.localeCompare(b.type)));
    const payload: StaticConcept = {
      slug: c.slug, nameTr: c.name_tr, nameAr: c.name_ar, definition: c.definition,
      parent: parent === null ? null : { slug: parent.slug, nameTr: parent.name_tr },
      children: concepts.filter((x) => x.parent_id === c.id).map((x) => ({ slug: x.slug, nameTr: x.name_tr })),
      roots: (conceptRoots.get(c.id) ?? []).map((r) => ({ arabic: r.arabic, latin: r.latin, occurrenceCount: Number(r.n) })),
      sourceSlugs: (conceptSources.get(c.id) ?? []).map((x) => sslug(x.source_id)),
      stats: {
        verseCount: vs.length, surahCount: bySurah.size, mekki, medeni,
        bySurah: [...bySurah.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([sid, count]) => {
            const m = surahOf(sid);
            return { id: m.id, slug: m.slug, nameTr: m.nameTr, count };
          }),
      },
      verses: vs.map((v) => ({ ...pointer(v.verse_id), weight: v.weight })),
      relations: rel,
      stories: storyConcepts.filter((x) => x.concept_id === c.id).map((x) => {
        const s = storyById.get(x.story_id);
        if (s === undefined) fail(`kavram ${c.slug}: kissa ${x.story_id} yok`);
        return { slug: s.slug, title: s.title };
      }),
      principles: principleConcepts.filter((x) => x.concept_id === c.id).map((x) => {
        const p = principleById.get(x.principle_id);
        if (p === undefined) fail(`kavram ${c.slug}: ilke ${x.principle_id} yok`);
        return { slug: p.slug, nameTr: p.name_tr };
      }),
    };
    verifyOrFail(staticConcept, payload, `concept/concept_${c.slug}.json`);
    emitter.write(`concept/concept_${c.slug}.json`, payload);
    conceptsIndex.push({
      slug: c.slug, nameTr: c.name_tr, nameAr: c.name_ar, definition: c.definition,
      parentSlug: parent?.slug ?? null, verseCount: vs.length, rootCount: (conceptRoots.get(c.id) ?? []).length,
    });
  }
  if (conceptsIndex.length > 0) {
    const payload: StaticConceptsIndex = { concepts: conceptsIndex };
    verifyOrFail(staticConceptsIndex, payload, "concepts_index.json");
    emitter.write("concepts_index.json", payload);
  }

  // --- ters dizin dosyasi ----------------------------------------------------
  const linksPayload: StaticVerseLinks = { verses: {} };
  for (const [verseId, l] of [...links.entries()].sort((a, b) => a[0] - b[0])) {
    linksPayload.verses[String(verseId)] = {
      stories: [...l.stories].sort(),
      principles: l.principles.sort((a, b) => a.slug.localeCompare(b.slug)),
      concepts: l.concepts.sort((a, b) => b.weight - a.weight || a.slug.localeCompare(b.slug)),
      events: [...l.events].sort((a, b) => a - b),
    };
  }
  verifyOrFail(staticVerseLinks, linksPayload, "verse_links.json");
  emitter.write("verse_links.json", linksPayload);

  /*
   * --- sure ici konu bolumlemesi ---------------------------------------------
   *
   * Bolumlemesi olan sure dosyada gecer, olmayan hic gecmez. Bos dizi yazmak
   * "bolumlendi ama bolum yok" gibi okunurdu; arayuz anahtari bulamayinca
   * baslik cizmez.
   */
  const sectionRows = await q<{
    id: number; surah_id: number; order: number; title: string;
    verse_start: number; verse_end: number;
    origin: "source" | "platform"; source_id: number | null; note: string | null;
  }>('SELECT * FROM surah_section ORDER BY surah_id, "order"');

  if (sectionRows.length > 0) {
    const extraBySection = group(
      await q<{ section_id: number; verse_id: number }>(
        "SELECT * FROM section_verse ORDER BY section_id, verse_id",
      ),
      (r) => r.section_id,
    );
    const payload: StaticSurahSections = { surahs: {} };
    for (const row of sectionRows) {
      const key = String(row.surah_id);
      const entry = payload.surahs[key] ?? {
        origin: row.origin,
        sourceSlug: row.source_id === null ? null : sslug(row.source_id),
        sections: [],
      };
      if (payload.surahs[key] === undefined) payload.surahs[key] = entry;
      entry.sections.push({
        order: row.order,
        title: row.title,
        verseStart: row.verse_start,
        verseEnd: row.verse_end,
        alsoVerses: (extraBySection.get(row.id) ?? []).map((x) => x.verse_id % 1000),
        note: row.note,
      });
    }
    verifyOrFail(staticSurahSections, payload, "sections.json");
    emitter.write("sections.json", payload);
    info(`bolumleme: ${Object.keys(payload.surahs).length} sure · ${sectionRows.length} konu basligi`);
    report.note(`Bolumleme: ${Object.keys(payload.surahs).length} / 114 sure · ${sectionRows.length} konu basligi`);
  }

  /*
   * --- ayetler arasi iliski agi ---------------------------------------------
   *
   * scripts/import/lib/relations.ts turetir, burada oldugu gibi aktarilir —
   * puanlama ve secim import tarafinda, cunku hesap veritabaninin isi.
   *
   * Satirlar id sirasinda okunur: import onlari puan sirasina gore yazdi,
   * dolayisiyla id sirasi = guclu -> zayif sirasi. Ekstra siralama yapilmaz,
   * yoksa puan bilgisi tasinmadigindan sira kaybolurdu.
   */
  const relationRows = await q<{
    source_verse_id: number; target_verse_id: number;
    relation_type: string; reason: string; confidence: "kesin" | "muhtemel" | "rivayet";
  }>("SELECT source_verse_id, target_verse_id, relation_type, reason, confidence FROM verse_relation ORDER BY source_verse_id, id");

  if (relationRows.length > 0) {
    const relPayload: StaticVerseRelations = { verses: {} };
    for (const r of relationRows) {
      const key = String(r.source_verse_id);
      const list = relPayload.verses[key] ?? [];
      if (list.length === 0) relPayload.verses[key] = list;
      list.push({
        surahId: Math.floor(r.target_verse_id / 1000),
        verseNumber: r.target_verse_id % 1000,
        type: r.relation_type as StaticVerseRelations["verses"][string][number]["type"],
        reason: r.reason,
        confidence: r.confidence,
      });
    }
    verifyOrFail(staticVerseRelations, relPayload, "verse_relations.json");
    emitter.write("verse_relations.json", relPayload);
    const linked = Object.keys(relPayload.verses).length;
    info(`ayet iliskisi: ${relationRows.length.toLocaleString("tr-TR")} bag · ${linked} ayet`);
    report.note(`Ayet iliskisi: ${relationRows.length.toLocaleString("tr-TR")} bag · ${linked} / 6236 ayet`);
  }

  /*
   * --- tefsir (plan 3, 12.9) -------------------------------------------------
   *
   * YAYIN KAPISI: `tafsir.publishable = false` olan eser HIC okunmaz. Ice almak
   * ile gostermek ayri kararlardir (docs/KAYNAK_ENVANTERI.md 0) — kutuphanede
   * duran bir eserin metni dist/ icine de dusmez.
   *
   *   tafsir_index.json               eser kunyeleri + kapsam sayilari
   *   tafsir/{slug}/surah_{id}.json   bir eserin bir suredeki BUTUN bloklari
   *
   * Blok araliklari sure ICI numaraya cevrilir; ayet sayfasi (surahId,
   * verseNumber) ile bakiyor ve verse.id aritmetigini tekrarlamasi gerekmiyor.
   * Blogun sure sinirini asmadigi 2026-09-06'da olculdu (0 satir).
   */
  const tafsirRows = await q<{
    id: number; slug: string; name: string; work_title: string | null;
    author: string | null; language: string; source_slug: string;
    license: string; license_note: string | null; url: string | null;
  }>(
    `SELECT id, slug, name, work_title, author, language, source_slug,
            license, license_note, url
       FROM tafsir
      WHERE publishable
      ORDER BY id`,
  );

  if (tafsirRows.length > 0) {
    const tafsirBlockRows = await q<{
      tafsir_id: number; surah_id: number; sort_number: number; block_type: string;
      source_type: string | null; start_verse_id: number | null;
      end_verse_id: number | null; text: string;
    }>(
      `SELECT b.tafsir_id, b.surah_id, b.sort_number, b.block_type, b.source_type,
              b.start_verse_id, b.end_verse_id, b.text
         FROM tafsir_block b
         JOIN tafsir t ON t.id = b.tafsir_id
        WHERE t.publishable
        ORDER BY b.tafsir_id, b.surah_id, b.sort_number`,
    );

    /** tafsir_id -> surah_id -> bloklar (sirasi korunur) */
    const bySurah = new Map<number, Map<number, StaticTafsirBlock[]>>();
    /** tafsir_id -> ayete bagli blogu olan verse.id kumesi */
    const coveredVerses = new Map<number, Set<number>>();

    for (const b of tafsirBlockRows) {
      let surahs = bySurah.get(b.tafsir_id);
      if (surahs === undefined) {
        surahs = new Map();
        bySurah.set(b.tafsir_id, surahs);
      }
      let list = surahs.get(b.surah_id);
      if (list === undefined) {
        list = [];
        surahs.set(b.surah_id, list);
      }
      list.push({
        sortNumber: b.sort_number,
        blockType: b.block_type,
        sourceType: b.source_type,
        startVerse: b.start_verse_id === null ? null : b.start_verse_id % 1000,
        endVerse: b.end_verse_id === null ? null : b.end_verse_id % 1000,
        text: b.text,
      });

      if (b.start_verse_id !== null && b.end_verse_id !== null) {
        let covered = coveredVerses.get(b.tafsir_id);
        if (covered === undefined) {
          covered = new Set();
          coveredVerses.set(b.tafsir_id, covered);
        }
        for (let id = b.start_verse_id; id <= b.end_verse_id; id += 1) covered.add(id);
      }
    }

    const tafsirIndex: StaticTafsirIndex = { tafsirs: [] };
    for (const t of tafsirRows) {
      const surahs = bySurah.get(t.id);
      // Kaydi olan ama tek blogu olmayan eser kunye olarak da cikmaz: arayuzde
      // acilip bos duran bir bolum, olmayan bir bolumden kotudur.
      if (surahs === undefined || surahs.size === 0) continue;

      let blockCount = 0;
      for (const [surahId, blocks] of [...surahs].sort((a, b) => a[0] - b[0])) {
        const payload: StaticTafsirSurah = { tafsirSlug: t.slug, surahId, blocks };
        verifyOrFail(staticTafsirSurah, payload, `tafsir/${t.slug}/surah_${String(surahId)}.json`);
        emitter.write(`tafsir/${t.slug}/surah_${String(surahId)}.json`, payload);
        blockCount += blocks.length;
      }

      tafsirIndex.tafsirs.push({
        slug: t.slug,
        name: t.name,
        workTitle: t.work_title,
        author: t.author,
        language: t.language,
        sourceSlug: t.source_slug,
        license: t.license,
        licenseNote: t.license_note,
        url: t.url,
        surahIds: [...surahs.keys()].sort((a, b) => a - b),
        blockCount,
        verseCount: coveredVerses.get(t.id)?.size ?? 0,
      });
    }

    if (tafsirIndex.tafsirs.length > 0) {
      verifyOrFail(staticTafsirIndex, tafsirIndex, "tafsir_index.json");
      emitter.write("tafsir_index.json", tafsirIndex);

      for (const t of tafsirIndex.tafsirs) {
        info(
          `tefsir: ${t.name} — ${t.blockCount.toLocaleString("tr-TR")} blok · ` +
            `${t.surahIds.length} sure · ${t.verseCount.toLocaleString("tr-TR")} / 6236 ayet`,
        );
        report.note(
          `Tefsir: ${t.name} — ${t.blockCount.toLocaleString("tr-TR")} blok · ` +
            `${t.verseCount.toLocaleString("tr-TR")} / 6236 ayet · kaynak ${t.sourceSlug}`,
        );
      }
    }
  }

  /*
   * --- eski mushaf yazmalari -------------------------------------------------
   *
   * GORUNTU YOK: kaynaktaki 2322 yazmanin hepsinde goruntu izni "restricted";
   * `url` yalnizca corpuscoranicum.de'ye derin baglantidir (CLAUDE.md kural 5).
   *
   * Iki dosya cikar:
   *   manuscripts.json        — kunyeler + kapsanan ayet araliklari
   *   verse_manuscripts.json  — ayet basina SAYI + en eski birkac yazma
   *
   * Ayet basina ortalama 70, en cok 94 yazma dusuyor. Hepsini ayet sayfasina
   * basmak gurultuden baska bir sey olmaz; bu yuzden ayet tarafinda yalnizca
   * sayi ve en eskiler tasinir, tam liste yazma sayfalarindadir.
   */
  const manuscriptRows = await q<{
    id: number; title: string; repository: string | null; idno: string | null;
    orig_date: string | null; date_start: number | null; script: string | null;
    summary: string | null; page_count: number; url: string;
  }>(
    `SELECT id, title, repository, idno, orig_date, date_start, script, summary,
            page_count, url
       FROM manuscript
      ORDER BY date_start NULLS LAST, id`,
  );

  if (manuscriptRows.length > 0) {
    const rangeRows = await q<{ manuscript_id: number; start_verse_id: number; end_verse_id: number }>(
      `SELECT manuscript_id, start_verse_id, end_verse_id
         FROM manuscript_range
        ORDER BY manuscript_id, start_verse_id`,
    );
    const rangesById = new Map<number, [number, number][]>();
    for (const r of rangeRows) {
      const list = rangesById.get(r.manuscript_id) ?? [];
      if (list.length === 0) rangesById.set(r.manuscript_id, list);
      list.push([r.start_verse_id, r.end_verse_id]);
    }

    const msPayload: StaticManuscripts = {
      manuscripts: manuscriptRows.map((m) => ({
        id: m.id,
        title: m.title,
        repository: m.repository,
        idno: m.idno,
        origDate: m.orig_date,
        dateStart: m.date_start,
        script: m.script,
        summary: m.summary,
        pageCount: m.page_count,
        url: m.url,
        ranges: rangesById.get(m.id) ?? [],
      })),
    };
    verifyOrFail(staticManuscripts, msPayload, "manuscripts.json");
    emitter.write("manuscripts.json", msPayload);

    // Ayet -> yazma: aralik genisletmesi gercek ayet listesine karsi yapilir,
    // cunku verse_id = sure*1000 + ayet ve sure asan araliklar arada var
    // olmayan kimlikler icerir.
    const verseIdRows = await q<{ id: number }>("SELECT id FROM verse ORDER BY id");
    const verseIds = verseIdRows.map((v) => v.id);

    // En eski once: tarihi olmayanlar sona.
    const orderById = new Map(manuscriptRows.map((m, index) => [m.id, index]));
    const OLDEST_SHOWN = 5;

    const byVerse = new Map<number, number[]>();
    for (const r of rangeRows) {
      let low = 0;
      let high = verseIds.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if ((verseIds[mid] ?? 0) < r.start_verse_id) low = mid + 1;
        else high = mid;
      }
      for (let i = low; i < verseIds.length; i += 1) {
        const id = verseIds[i] ?? 0;
        if (id > r.end_verse_id) break;
        const list = byVerse.get(id) ?? [];
        if (list.length === 0) byVerse.set(id, list);
        list.push(r.manuscript_id);
      }
    }

    const vmPayload: StaticVerseManuscripts = { verses: {} };
    for (const [verseId, ids] of byVerse) {
      const unique = [...new Set(ids)].sort(
        (a, b) => (orderById.get(a) ?? Infinity) - (orderById.get(b) ?? Infinity),
      );
      vmPayload.verses[String(verseId)] = {
        count: unique.length,
        oldest: unique.slice(0, OLDEST_SHOWN),
      };
    }
    verifyOrFail(staticVerseManuscripts, vmPayload, "verse_manuscripts.json");
    emitter.write("verse_manuscripts.json", vmPayload);

    const dated = manuscriptRows.filter((m) => m.date_start !== null).length;
    info(
      `yazma: ${manuscriptRows.length} kunye · ${rangeRows.length} aralik · ` +
        `${byVerse.size} / 6236 ayet kapsandi · ${dated} tarihli`,
    );
    report.note(
      `Yazma: ${manuscriptRows.length} kunye · ${rangeRows.length} ayet araligi · ` +
        `${byVerse.size} / 6236 ayet · ${dated} tarihlenebilir · goruntu yok, derin baglanti`,
    );
  }

  /*
   * --- medya (spec 32-71) ---------------------------------------------------
   *
   *   media.json        gercek + AI medya kayitlari
   *   verse_media.json  ayet -> medya kimlikleri (ters dizin)
   *
   * IKI YAYIN KAPISI BURADA ISLER, ikisi de sessiz gecmez:
   *
   *   1. `face_scanned = false` olan AI medyasi CIKTIYA GIRMEZ. Kare kare yuz
   *      taramasi otomatiklestirilemez (bir yuz hash ile denetlenemez), bu
   *      yuzden tarayan kisi alani elle true yapana kadar medya yayina cikmaz.
   *   2. Kisitli lisansli kayitta `path` NULL'a zorlanir. Veritabani zaten
   *      media_item_license_gate ile bunu engelliyor; burada ikinci kez
   *      bakilmasinin sebebi cikti dosyasinin son soz olmasi — linter de
   *      ayni sarti cikti uzerinde dogruluyor.
   */
  const mediaRows = await q<{
    id: number; media_key: string; kind: string; title: string;
    description: string | null; caution: string | null;
    source_name: string | null; source_url: string | null; author: string | null;
    institution: string | null; source_date: string | null;
    license: string | null; license_url: string | null; copyright: string | null;
    local_path: string | null; width: number | null; height: number | null;
    duration_sec: number | null;
    location_name: string | null; location_slug: string | null;
    prompt_key: string | null; face_scanned: boolean;
  }>(
    `SELECT m.id, m.media_key, m.kind::text AS kind, m.title, m.description, m.caution,
            m.source_name, m.source_url, m.author, m.institution, m.source_date,
            m.license::text AS license, m.license_url, m.copyright,
            m.local_path, m.width, m.height, m.duration_sec,
            m.location_name, l.slug AS location_slug,
            p.prompt_key, m.face_scanned
       FROM media_item m
       LEFT JOIN location  l ON l.id = m.location_id
       LEFT JOIN ai_prompt p ON p.id = m.ai_prompt_id
      ORDER BY m.media_key`,
  );

  if (mediaRows.length > 0) {
    const isAi = (kind: string): boolean => kind === "AI_IMAGE" || kind === "AI_VIDEO";
    const HOSTABLE = new Set(["PUBLIC_DOMAIN", "CC0", "CC_BY", "CC_BY_SA", "CC_BY_NC"]);

    const withheld = mediaRows.filter((m) => isAi(m.kind) && !m.face_scanned);
    const publishable = mediaRows.filter((m) => !isAi(m.kind) || m.face_scanned);
    const publishableIds = new Set(publishable.map((m) => m.id));

    const storyRows = await q<{ media_item_id: number; slug: string }>(
      `SELECT ms.media_item_id, s.slug
         FROM media_story ms JOIN story s ON s.id = ms.story_id
        ORDER BY ms.media_item_id, s.slug`,
    );
    const verseRows = await q<{ media_item_id: number; verse_id: number }>(
      "SELECT media_item_id, verse_id FROM media_verse ORDER BY media_item_id, verse_id",
    );
    const storiesOf = group(storyRows, (r) => r.media_item_id);
    const versesOf = group(verseRows, (r) => r.media_item_id);

    const mediaPayload: StaticMedia = {
      media: publishable.map((m) => ({
        id: m.media_key,
        kind: m.kind as StaticMedia["media"][number]["kind"],
        title: m.title,
        description: m.description,
        caution: m.caution,
        sourceName: m.source_name,
        sourceUrl: m.source_url,
        author: m.author,
        institution: m.institution,
        date: m.source_date,
        license: m.license as StaticMedia["media"][number]["license"],
        licenseUrl: m.license_url,
        copyright: m.copyright,
        // Kisitli lisansta dosya yolu tasinmaz — kart yalnizca baglanti gosterir
        path: m.license !== null && !HOSTABLE.has(m.license) ? null : m.local_path,
        width: m.width,
        height: m.height,
        durationSec: m.duration_sec,
        locationName: m.location_name,
        locationSlug: m.location_slug,
        storySlugs: (storiesOf.get(m.id) ?? []).map((r) => r.slug),
        verses: (versesOf.get(m.id) ?? []).map((r) => pointer(r.verse_id)),
        promptId: m.prompt_key,
      })),
    };
    verifyOrFail(staticMedia, mediaPayload, "media.json");
    emitter.write("media.json", mediaPayload);

    const keyById = new Map(publishable.map((m) => [m.id, m.media_key]));
    const byVerseMedia = new Map<number, string[]>();
    for (const r of verseRows) {
      if (!publishableIds.has(r.media_item_id)) continue;
      const key = keyById.get(r.media_item_id);
      if (key === undefined) continue;
      const list = byVerseMedia.get(r.verse_id);
      if (list === undefined) byVerseMedia.set(r.verse_id, [key]);
      else list.push(key);
    }
    const vmediaPayload: StaticVerseMedia = {
      verses: Object.fromEntries(
        [...byVerseMedia].sort(([a], [b]) => a - b).map(([id, keys]) => [String(id), keys.sort()]),
      ),
    };
    verifyOrFail(staticVerseMedia, vmediaPayload, "verse_media.json");
    emitter.write("verse_media.json", vmediaPayload);

    const real = publishable.filter((m) => !isAi(m.kind)).length;
    const hosted = publishable.filter((m) => m.local_path !== null).length;
    info(
      `medya: ${publishable.length} yayinda (${real} gercek, ${publishable.length - real} AI) · ` +
        `${hosted} dosya barindiriliyor · ${byVerseMedia.size} ayet · ` +
        `${withheld.length} AI kaydi taranmadigi icin cikarilmadi`,
    );
    report.note(
      `Medya: ${publishable.length} kayit (${real} gercek, ${publishable.length - real} AI) · ` +
        `${byVerseMedia.size} ayet bagi · ${withheld.length} taranmamis AI kaydi yayina girmedi`,
    );
    if (withheld.length > 0) {
      report.note(
        `Taranmamis AI medyasi: ${withheld.map((m) => m.media_key).join(", ")} — ` +
          `kare kare yuz taramasi yapilip data/media/ai_generated.json icinde ` +
          `faceScanned=true yapilmadan yayina girmez.`,
      );
    }
  }

  info(
    `icerik: ${stories.length} kissa, ${locations.length} konum, ${concepts.length} kavram, ` +
      `${principles.length} ilke, ${events.length} olay · ${links.size} ayet en az bir icerige bagli`,
  );
  report.note(`Icerik katmani: ${stories.length} kissa · ${locations.length} konum · ${concepts.length} kavram · ${principles.length} ilke · ${events.length} olay`);
  report.note(`Baglantili ayet: ${links.size} / 6236`);
}
