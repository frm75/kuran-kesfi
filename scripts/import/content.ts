import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  aiGeneratedFile,
  aiPromptsFile,
  computeVerseId,
  conceptInput,
  contentSourcesFile,
  mediaFile,
  locationsFile,
  noldekeOrderFile,
  parseVerseRef,
  principleInput,
  storyInput,
  surahSectionsFile,
  timelineFile,
} from "@kuran/schema";
import type {
  AiMediaInput,
  AiPromptInput,
  ConceptInput,
  LocationInput,
  MediaItemInput,
  NoldekeOrderFile,
  PrincipleInput,
  StoryInput,
  SurahSectionsFile,
  TimelineEventInput,
} from "@kuran/schema";
import {
  Report,
  closePool,
  fail,
  info,
  pool,
  repoRoot,
  upsertMany,
  withTransaction,
} from "@kuran/pipeline";
import type { Client } from "@kuran/pipeline";
import { deriveVerseRelations } from "./lib/relations.js";

/**
 * Elle hazirlanan icerik import'u — data/** -> PostgreSQL (plan 5.4).
 *
 * Kissa, konum, kavram, ilke, zaman cizelgesi ve Noldeke siralamasi. Kaynak
 * dosyalar insan yazimi JSON'dur (sema: @kuran/schema content_input.ts);
 * veritabani id'si degil is anahtari tasirlar. Burada cozulur:
 *
 *   "12:4-6"     -> verse.id (surahId*1000+n), varligi veritabaninda dogrulanir
 *   kissa slug   -> story.id        konum slug -> location.id
 *   kavram slug  -> concept.id      ilke slug  -> principle.id
 *   kaynak slug  -> source.id       kok "Sbr"  -> root.id
 *
 * Cozulmeyen TEK referans import'u durdurur; yarim veri yazilmaz (tek islem).
 *
 * ## Neden TRUNCATE + yeniden yazim, upsert degil
 *
 * Bu tablolarin tek gercek kaynagi data/** dizinidir; veritabani yalnizca
 * build makinesinde yasar (plan 6). Bir kissadan silinen parca upsert ile
 * veritabaninda kalirdi. Bu yuzden icerik tablolari her import'ta bosaltilip
 * RESTART IDENTITY ile yeniden yazilir — ayni girdi ayni id'leri uretir
 * (plan 20.1 tekrarlanabilirlik). scholar_note_* baglanti tablolari bu
 * tablolara FK tasidigi icin CASCADE gerekir; bugun bostur ve hoca notlari
 * zaten ayri paketle yeniden import edilir.
 *
 * ## Kavram-ayet eslestirmesi KOKTEN turetilir
 *
 * Plan 3: "Kavram verisi — kendi uretimimiz: ... kok verisi temelli". Kavramin
 * koklerinden biri ayette geciyorsa ayet kavrama baglanir; agirlik ayetteki
 * gecis sayisidir (1, 2, >=3 -> 3). source_id NULL kalir: bu platform
 * derlemesidir, arayuzde oyle etiketlenir. Dosyadaki `verses` alani elle
 * duzeltme icindir ve turetilenin ustune yazar.
 *
 * Kavramlar arasi `co_occurrence` iliskisi de hesaplanir: ayni ayette gecme
 * sayisi kosinus benzerligine cevrilir (buyuk kavramlar — iman 879 ayet —
 * her seye baglanmasin), kavram basina en yakin 6 komsu alinir. Elle yazilan
 * iliskiler (contrast, cause, part_of) oldugu gibi eklenir.
 *
 * Calistirma:  pnpm content:import   (= build:packages + bu script)
 */

const DATA = resolve(repoRoot, "data");

// -----------------------------------------------------------------------------
// Dosya okuma
// -----------------------------------------------------------------------------

const parseErrors: string[] = [];

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    parseErrors.push(`${relative(repoRoot, path)}: gecersiz JSON — ${String(error)}`);
    return undefined;
  }
}

function parseWith<T>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { message: string } } },
  value: unknown,
  path: string,
): T | undefined {
  if (value === undefined) return undefined;
  const result = schema.safeParse(value);
  if (!result.success) {
    parseErrors.push(`${relative(repoRoot, path)}:\n${result.error.message}`);
    return undefined;
  }
  return result.data;
}

/** data/<dir>/<prefix>_*.json — sirali, deterministik. */
function listPrefixed(dir: string, prefix: string): string[] {
  const full = join(DATA, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((name) => name.startsWith(`${prefix}_`) && name.endsWith(".json"))
    .sort()
    .map((name) => join(full, name));
}

interface Loaded {
  sources: ReturnType<typeof contentSourcesFile.parse>["sources"];
  locations: LocationInput[];
  stories: StoryInput[];
  concepts: ConceptInput[];
  principles: PrincipleInput[];
  events: TimelineEventInput[];
  sections: SurahSectionsFile[];
  noldeke: NoldekeOrderFile | null;
  /** Gercek medya — spec 32-48 */
  media: MediaItemInput[];
  /** AI prompt'lari — spec 65; medya URETMEZ, yalnizca tanimlar */
  prompts: AiPromptInput[];
  /** Uretilmis AI medyasi — kuyruk toplayicisinin yazdigi dosya */
  aiMedia: AiMediaInput[];
}

function loadAll(): Loaded {
  const sourcesPath = join(DATA, "sources/content_sources.json");
  const sources = existsSync(sourcesPath)
    ? parseWith(contentSourcesFile, readJson(sourcesPath), sourcesPath)?.sources ?? []
    : [];

  const locationsPath = join(DATA, "locations/locations.json");
  const locations = existsSync(locationsPath)
    ? parseWith(locationsFile, readJson(locationsPath), locationsPath)?.locations ?? []
    : [];

  const stories: StoryInput[] = [];
  for (const path of listPrefixed("stories", "story")) {
    const story = parseWith(storyInput, readJson(path), path);
    if (story === undefined) continue;
    // Dosya adi slug'i tasimali — plan 20.2 (story_hz-yusuf.json)
    if (!path.endsWith(`story_${story.slug}.json`)) {
      parseErrors.push(`${relative(repoRoot, path)}: dosya adi story_${story.slug}.json olmali`);
    }
    stories.push(story);
  }

  const concepts: ConceptInput[] = [];
  for (const path of listPrefixed("concepts", "concept")) {
    const concept = parseWith(conceptInput, readJson(path), path);
    if (concept === undefined) continue;
    if (!path.endsWith(`concept_${concept.slug}.json`)) {
      parseErrors.push(`${relative(repoRoot, path)}: dosya adi concept_${concept.slug}.json olmali`);
    }
    concepts.push(concept);
  }

  const principles: PrincipleInput[] = [];
  for (const path of listPrefixed("principles", "principle")) {
    const principle = parseWith(principleInput, readJson(path), path);
    if (principle === undefined) continue;
    if (!path.endsWith(`principle_${principle.slug}.json`)) {
      parseErrors.push(
        `${relative(repoRoot, path)}: dosya adi principle_${principle.slug}.json olmali`,
      );
    }
    principles.push(principle);
  }

  const timelinePath = join(DATA, "timeline/timeline.json");
  const events = existsSync(timelinePath)
    ? parseWith(timelineFile, readJson(timelinePath), timelinePath)?.events ?? []
    : [];

  // Bolumleme: sure basina bir dosya. Dosya adi sure numarasini tasir; ic
  // alanla uyusmazsa sessizce yanlis sureye yazilirdi, bu yuzden kontrol var.
  const sections: SurahSectionsFile[] = [];
  for (const path of listPrefixed("sections", "sections")) {
    const file = parseWith(surahSectionsFile, readJson(path), path);
    if (file === undefined) continue;
    if (!path.endsWith(`sections_${String(file.surahId)}.json`)) {
      parseErrors.push(
        `${relative(repoRoot, path)}: dosya adi sections_${String(file.surahId)}.json olmali`,
      );
    }
    sections.push(file);
  }

  const noldekePath = join(DATA, "timeline/noldeke_order.json");
  const noldeke = existsSync(noldekePath)
    ? parseWith(noldekeOrderFile, readJson(noldekePath), noldekePath) ?? null
    : null;

  /*
   * Medya: cografya basina bir dosya. Dosya adi ile ic alan arasinda kissa/
   * bolumleme dosyalarindaki gibi bir bag YOKTUR — bir dosya birden fazla
   * konumun medyasini tasiyabilir (media_medine.json Uhud'u da tasiyor),
   * bu yuzden ad denetimi yapilmaz.
   */
  const media: MediaItemInput[] = [];
  for (const path of listPrefixed("media", "media")) {
    const file = parseWith(mediaFile, readJson(path), path);
    if (file === undefined) continue;
    media.push(...file.items);
  }

  const prompts: AiPromptInput[] = [];
  const promptsDir = join(DATA, "media/prompts");
  if (existsSync(promptsDir)) {
    for (const name of readdirSync(promptsDir).filter((n) => n.endsWith(".json")).sort()) {
      const path = join(promptsDir, name);
      const file = parseWith(aiPromptsFile, readJson(path), path);
      if (file === undefined) continue;
      prompts.push(...file.prompts);
    }
  }

  const aiPath = join(DATA, "media/ai_generated.json");
  const aiMedia = existsSync(aiPath)
    ? parseWith(aiGeneratedFile, readJson(aiPath), aiPath)?.items ?? []
    : [];

  return {
    sources, locations, stories, concepts, principles, events, sections, noldeke,
    media, prompts, aiMedia,
  };
}

// -----------------------------------------------------------------------------
// Dosyalar arasi tutarlilik (veritabanisiz)
// -----------------------------------------------------------------------------

function crossCheck(data: Loaded, dbSourceSlugs: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const uniq = (label: string, slugs: string[]): Set<string> => {
    const seen = new Set<string>();
    for (const s of slugs) {
      if (seen.has(s)) errors.push(`${label}: '${s}' slug'i birden fazla dosyada`);
      seen.add(s);
    }
    return seen;
  };

  const sourceSlugs = new Set([...dbSourceSlugs, ...data.sources.map((s) => s.slug)]);
  const locationSlugs = uniq("konum", data.locations.map((l) => l.slug));
  const storySlugs = uniq("kissa", data.stories.map((s) => s.slug));
  const conceptSlugs = uniq("kavram", data.concepts.map((c) => c.slug));
  const principleSlugs = uniq("ilke", data.principles.map((p) => p.slug));

  const needSource = (where: string, slugs: readonly string[]): void => {
    for (const s of slugs) {
      if (!sourceSlugs.has(s)) errors.push(`${where}: kaynak '${s}' tanimli degil`);
    }
  };
  const need = (where: string, set: ReadonlySet<string>, what: string, slugs: readonly string[]): void => {
    for (const s of slugs) if (!set.has(s)) errors.push(`${where}: ${what} '${s}' yok`);
  };

  for (const l of data.locations) {
    needSource(`konum ${l.slug}`, l.sourceSlugs);
    for (const a of l.alternatives) needSource(`konum ${l.slug} / alternatif ${a.name}`, a.sourceSlugs);
  }
  for (const s of data.stories) {
    need(`kissa ${s.slug}`, storySlugs, "iliskili kissa", s.relatedStories);
    need(`kissa ${s.slug}`, conceptSlugs, "kavram", s.concepts);
    need(`kissa ${s.slug}`, locationSlugs, "konum", s.locations.map((l) => l.locationSlug));
    for (const lesson of s.lessons) needSource(`kissa ${s.slug} / ders ${lesson.order}`, lesson.sourceSlugs);
    // Ayni konum ayni sirada iki kez olmasin — PK (story, location, order)
    const seen = new Set<string>();
    for (const l of s.locations) {
      const key = `${l.locationSlug}#${l.order}`;
      if (seen.has(key)) errors.push(`kissa ${s.slug}: konum ${key} mukerrer`);
      seen.add(key);
    }
  }
  for (const c of data.concepts) {
    if (c.parentSlug !== null && !conceptSlugs.has(c.parentSlug)) {
      errors.push(`kavram ${c.slug}: ebeveyn '${c.parentSlug}' yok`);
    }
    need(`kavram ${c.slug}`, conceptSlugs, "iliski hedefi", c.relations.map((r) => r.target));
    needSource(`kavram ${c.slug}`, c.sourceSlugs);
  }
  const conceptChildCount = new Map<string, number>();
  for (const c of data.concepts) {
    if (c.parentSlug !== null) {
      conceptChildCount.set(c.parentSlug, (conceptChildCount.get(c.parentSlug) ?? 0) + 1);
    }
  }
  for (const c of data.concepts) {
    // Koku ve elle ayet eslestirmesi olmayan kavram ancak UST BASLIK olabilir:
    // sayilari cocuklarindan toplanir. Cocugu da yoksa sayfasi bos cikardi.
    if (c.roots.length === 0 && c.verses.length === 0 && (conceptChildCount.get(c.slug) ?? 0) === 0) {
      errors.push(`kavram ${c.slug}: kok, ayet ve cocuk yok — bos kavram sayfasi uretilemez`);
    }
  }
  for (const p of data.principles) {
    if (p.oppositeSlug !== null && !principleSlugs.has(p.oppositeSlug)) {
      errors.push(`ilke ${p.slug}: karsit ilke '${p.oppositeSlug}' yok`);
    }
    need(`ilke ${p.slug}`, storySlugs, "kissa", p.stories.map((s) => s.slug));
    need(`ilke ${p.slug}`, conceptSlugs, "kavram", p.concepts);
    needSource(`ilke ${p.slug}`, p.sourceSlugs);
  }
  const orders = new Set<number>();
  for (const p of data.principles) {
    if (orders.has(p.order)) errors.push(`ilke ${p.slug}: order ${p.order} baska bir ilkede de var`);
    orders.add(p.order);
  }
  for (const e of data.events) needSource(`olay ${e.order}`, e.sourceSlugs);
  if (data.noldeke !== null) needSource("noldeke", [data.noldeke.sourceSlug]);

  /*
   * --- medya ---------------------------------------------------------------
   *
   * Sema tek DOSYA icinde benzersizligi dogruluyor; burada butun dosyalara
   * bakilir, cunku media_key veritabaninda UNIQUE'tir ve iki cografya dosyasi
   * ayni id'yi kullanirsa import transaction'in ortasinda patlardi.
   */
  const eventOrders = new Set(data.events.map((e) => e.order));
  const mediaIds = uniq("medya", data.media.map((m) => m.id));
  const promptIds = uniq("prompt", data.prompts.map((p) => p.id));

  for (const m of data.media) {
    needSource(`medya ${m.id}`, m.sourceSlugs);
    if (m.locationSlug !== null && !locationSlugs.has(m.locationSlug)) {
      errors.push(`medya ${m.id}: konum '${m.locationSlug}' yok`);
    }
    need(`medya ${m.id}`, storySlugs, "kissa", m.storySlugs);
    for (const o of m.timelineOrders) {
      if (!eventOrders.has(o)) errors.push(`medya ${m.id}: olay '${String(o)}' yok`);
    }
  }
  for (const p of data.prompts) {
    if (p.storySlug !== null && !storySlugs.has(p.storySlug)) {
      errors.push(`prompt ${p.id}: kissa '${p.storySlug}' yok`);
    }
    if (p.locationSlug !== null && !locationSlugs.has(p.locationSlug)) {
      errors.push(`prompt ${p.id}: konum '${p.locationSlug}' yok`);
    }
    if (p.timelineOrder !== null && !eventOrders.has(p.timelineOrder)) {
      errors.push(`prompt ${p.id}: olay '${String(p.timelineOrder)}' yok`);
    }
    if (p.baseImagePromptId !== null && !promptIds.has(p.baseImagePromptId)) {
      errors.push(`prompt ${p.id}: baslangic gorseli '${p.baseImagePromptId}' yok`);
    }
  }
  for (const a of data.aiMedia) {
    if (mediaIds.has(a.id)) errors.push(`AI medya ${a.id}: id gercek medyayla cakisiyor`);
    if (!promptIds.has(a.promptId)) errors.push(`AI medya ${a.id}: prompt '${a.promptId}' yok`);
  }

  return errors;
}

// -----------------------------------------------------------------------------
// Veritabani cozumleme
// -----------------------------------------------------------------------------

/** Referanstaki her ayet gercekten var mi; yoksa hata metni. */
async function resolveVerseRefs(client: Client, refs: Iterable<string>): Promise<string[]> {
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

function expandRef(ref: string): number[] {
  const { surahNumber, verseStart, verseEnd } = parseVerseRef(ref);
  const ids: number[] = [];
  for (let n = verseStart; n <= verseEnd; n += 1) ids.push(computeVerseId(surahNumber, n));
  return ids;
}

/** Coklu INSERT ... RETURNING; anahtar kolonuyla id eslestirir. */
async function insertReturning(
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

async function insertPlain(
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

const CONTENT_TABLES = [
  "story", "story_related", "story_passage", "story_lesson", "story_lesson_source",
  "location", "location_source", "story_location", "story_location_passage",
  "concept", "concept_verse", "concept_relation", "concept_root", "concept_source", "story_concept",
  "timeline_event", "timeline_event_surah", "timeline_event_verse", "timeline_event_source",
  "principle", "principle_source", "principle_verse", "principle_story", "principle_concept",
  "surah_section", "section_verse",
  "ai_prompt", "media_item", "media_story", "media_verse", "media_timeline_event", "media_source",
  // Turetilmis: elle yazilmaz, her import'ta yeniden hesaplanir (lib/relations.ts)
  "verse_relation",
] as const;

// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const report = new Report("content");
  const data = loadAll();
  if (parseErrors.length > 0) {
    console.error(`\n${parseErrors.length} dosya hatasi:`);
    for (const e of parseErrors) console.error(`   x ${e}`);
    fail("data/** sema dogrulamasi basarisiz — hicbir sey yazilmadi");
  }

  info(
    `okundu: ${data.sources.length} kaynak, ${data.locations.length} konum, ${data.stories.length} kissa, ` +
      `${data.concepts.length} kavram, ${data.principles.length} ilke, ${data.events.length} olay, ` +
      `${data.media.length} medya, ${data.prompts.length} prompt, ${data.aiMedia.length} AI cikti` +
      (data.noldeke !== null ? ", Noldeke siralamasi" : ""),
  );

  const dbSources = new Set(
    (await pool.query<{ slug: string }>("SELECT slug FROM source")).rows.map((r) => r.slug),
  );
  const crossErrors = crossCheck(data, dbSources);
  if (crossErrors.length > 0) {
    console.error(`\n${crossErrors.length} tutarlilik hatasi:`);
    for (const e of crossErrors) console.error(`   x ${e}`);
    fail("dosyalar arasi referanslar cozulemedi — hicbir sey yazilmadi");
  }

  await withTransaction(async (client) => {
    // --- ayet referanslari -------------------------------------------------
    const allRefs: string[] = [];
    for (const s of data.stories) for (const p of s.passages) allRefs.push(p.ref);
    for (const c of data.concepts) for (const v of c.verses) allRefs.push(v.ref);
    for (const p of data.principles) for (const v of p.verses) allRefs.push(v.ref);
    for (const e of data.events) allRefs.push(...e.verseRefs);
    for (const f of data.sections) for (const x of f.sections) allRefs.push(...x.alsoVerses);
    for (const m of data.media) allRefs.push(...m.verseRefs);
    const refErrors = await resolveVerseRefs(client, allRefs);
    if (refErrors.length > 0) {
      for (const e of refErrors) console.error(`   x ${e}`);
      fail(`${refErrors.length} ayet referansi cozulemedi — hicbir sey yazilmadi`);
    }

    // --- kokler ------------------------------------------------------------
    const wantedRoots = new Set<string>();
    for (const c of data.concepts) for (const r of c.roots) wantedRoots.add(r);
    for (const p of data.principles) if (p.rootLatin !== null) wantedRoots.add(p.rootLatin);
    const rootIdByLatin = new Map<string, number>();
    if (wantedRoots.size > 0) {
      const { rows } = await client.query<{ id: number; latin: string }>(
        "SELECT id, latin FROM root WHERE latin = ANY($1)",
        [[...wantedRoots]],
      );
      for (const r of rows) rootIdByLatin.set(r.latin, r.id);
      const missing = [...wantedRoots].filter((l) => !rootIdByLatin.has(l));
      if (missing.length > 0) fail(`kok anahtari root tablosunda yok: ${missing.join(", ")}`);
    }

    // --- kaynaklar (upsert, slug ile) --------------------------------------
    await upsertMany(
      client,
      "source",
      ["slug", "name", "work_title", "author", "reference", "url", "license", "note"],
      data.sources.map((s) => [s.slug, s.name, s.workTitle, s.author, s.reference, s.url, s.license, s.note]),
      ["slug"],
    );
    const sourceIdBySlug = new Map<string, number>();
    for (const r of (await client.query<{ id: number; slug: string }>("SELECT id, slug FROM source")).rows) {
      sourceIdBySlug.set(r.slug, r.id);
    }
    const sid = (slug: string): number => {
      const id = sourceIdBySlug.get(slug);
      if (id === undefined) fail(`kaynak '${slug}' source tablosunda yok`);
      return id;
    };

    // --- icerik tablolarini bosalt -----------------------------------------
    await client.query(`TRUNCATE ${CONTENT_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
    info(`${CONTENT_TABLES.length} icerik tablosu bosaltildi (RESTART IDENTITY)`);

    // --- konumlar ----------------------------------------------------------
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

    // --- kavramlar ---------------------------------------------------------
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
    await insertPlain(client, "concept_relation", ["source_concept_id", "target_concept_id", "relation_type", "weight"], [...manualMap.values()]);

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
      coRows.push([a, b, "co_occurrence", weight]);
    }
    await insertPlain(client, "concept_relation", ["source_concept_id", "target_concept_id", "relation_type", "weight"], coRows);
    report.note(`Kavram birlikte gecme iliskisi: ${coRows.length} cift (kosinus benzerligi, kavram basina en fazla 6)`);

    // --- kissalar ----------------------------------------------------------
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

    // --- ilkeler -----------------------------------------------------------
    const principleId = await insertReturning(
      client,
      "principle",
      ["slug", "name_tr", "name_ar", "root_id", "definition", "explanation", "daily_note", "opposite_principle_id", "order"],
      data.principles.map((p) => [
        p.slug, p.nameTr, p.nameAr, p.rootLatin === null ? null : rootIdByLatin.get(p.rootLatin),
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

    // --- zaman cizelgesi ---------------------------------------------------
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

    /*
     * --- medya (spec 32-71) -------------------------------------------------
     *
     * Zaman cizelgesinden SONRA: prompt ve medya kayitlari kissa, konum ve
     * olay id'lerine baglanir, ucu de yukarida yazildi.
     *
     * Prompt'lar once yazilir cunku media_item.ai_prompt_id onlara isaret
     * eder. `base_image_prompt_id` kendine gonderme oldugu icin ikinci gecise
     * birakilir — tek INSERT icinde henuz olusmamis bir id'ye baglanamaz.
     */
    const promptId = await insertReturning(
      client,
      "ai_prompt",
      [
        "prompt_key", "title", "prompt_type", "prompt", "negative_prompt", "model",
        "duration_sec", "aspect_ratio", "version", "depicts_prophet",
        "story_id", "location_id", "timeline_event_id",
      ],
      data.prompts.map((p) => [
        p.id, p.title, p.promptType, p.prompt, p.negativePrompt, p.model,
        p.durationSec, p.aspectRatio, p.version, p.depictsProphet,
        p.storySlug === null ? null : storyId.get(p.storySlug),
        p.locationSlug === null ? null : locationId.get(p.locationSlug),
        p.timelineOrder === null ? null : eid(p.timelineOrder),
      ]),
      "prompt_key",
    );
    /*
     * Prompt kimligi -> prompt kaydi. AI medyasinin kissa/konum/olay baglari
     * BURADAN gelir; ai_generated.json'da bag alani YOKTUR ve olmamalidir.
     */
    const promptByKey = new Map(data.prompts.map((p) => [p.id, p]));
    const promptOf = (key: string): AiPromptInput | undefined => promptByKey.get(key);
    const aiLocationId = (key: string): number | null => {
      const slug = promptOf(key)?.locationSlug;
      return slug == null ? null : (locationId.get(slug) ?? null);
    };

    for (const p of data.prompts) {
      if (p.baseImagePromptId === null) continue;
      await client.query("UPDATE ai_prompt SET base_image_prompt_id = $2 WHERE id = $1", [
        promptId.get(p.id),
        promptId.get(p.baseImagePromptId),
      ]);
    }

    /*
     * Gercek medya ve AI medyasi AYNI tabloya yazilir ama alanlari birbirine
     * karismaz: veritabanindaki media_item_kind_split ve
     * media_item_ai_has_no_source kisitlari bunu zorlar. Burada iki ayri
     * satir uretici olmasinin sebebi de bu — tek bir "esnek" nesne kurup
     * ikisini de ondan turetmek, kisitlarin yakaladigi hatayi kod duzeyinde
     * mumkun kilardi.
     *
     * AI ciktisinda `face_scanned` yayin kapisidir ve dosyadan OLDUGU GIBI
     * gelir; import onu true yapmaz. Kare kare yuz taramasi insana bagli
     * (CLAUDE.md "Gorsel ve VIDEO kurali").
     */
    const MEDIA_COLUMNS = [
      "media_key", "kind", "title", "description", "caution",
      "source_name", "source_url", "original_url", "author", "institution", "source_date",
      "license", "license_raw", "license_url", "copyright",
      "location_name", "lat", "lng", "location_id", "manuscript_id",
      "local_path", "width", "height",
      "ai_prompt_id", "generator", "model", "sha256", "duration_sec", "created_at",
      "face_scanned", "face_scan_note",
    ] as const;

    const mediaRows: unknown[][] = [
      ...data.media.map((m) => [
        m.id, m.kind, m.title, m.description, m.caution,
        m.sourceName, m.sourceUrl, m.originalUrl, m.author, m.institution, m.date,
        m.license, m.licenseRaw, m.licenseUrl, m.copyright,
        m.locationName, m.lat, m.lng,
        m.locationSlug === null ? null : locationId.get(m.locationSlug), m.manuscriptId,
        m.localPath, m.width, m.height,
        null, null, null, null, null, null,
        false, null,
      ]),
      ...data.aiMedia.map((a) => [
        a.id, a.kind, a.title, null, null,
        null, null, null, null, null, null,
        null, null, null, null,
        /*
         * Konum AI kaydinin KENDISINDE yok, prompt'unda var. ai_generated.json
         * `collect` tarafindan uretilir ve yalnizca dosyanin olculebilir
         * ozelliklerini tasir (karma, en/boy, sure); nereye ait oldugu
         * editoryal bir karardir ve prompt'ta durur.
         */
        null, null, null, aiLocationId(a.promptId), null,
        a.localPath, a.width, a.height,
        promptId.get(a.promptId), a.generator, a.model, a.sha256, a.durationSec, a.createdAt,
        a.faceScanned, a.faceScanNote,
      ]),
    ];
    const mediaId = await insertReturning(client, "media_item", MEDIA_COLUMNS, mediaRows, "media_key");

    /*
     * KISSA BAGI — gercek medya kendi `storySlugs` alanindan, AI medyasi
     * PROMPT'undan gelir.
     *
     * 2026-09-07'ye kadar yalnizca `data.media` yaziliyordu. Sonuc: AI kaydi
     * media_item'a giriyor, yuz taramasi onaylaniyor, media.json'a cikiyor ve
     * HICBIR SAYFADA gorunmuyordu — kissa sayfasi `storySlugs` ile suzuyor,
     * dizi bos oldugu icin hep eleniyordu. Hata vermiyordu; yalnizca ortada
     * yoktu. Ilk 10 AI ciktisi yayina alinirken yakalandi.
     */
    await insertPlain(
      client,
      "media_story",
      ["media_item_id", "story_id"],
      [
        ...data.media.flatMap((m) =>
          [...new Set(m.storySlugs)].map((s) => [mediaId.get(m.id), storyId.get(s)]),
        ),
        ...data.aiMedia.flatMap((a) => {
          const slug = promptOf(a.promptId)?.storySlug;
          return slug == null ? [] : [[mediaId.get(a.id), storyId.get(slug)]];
        }),
      ],
    );
    const mediaVerseRows: unknown[][] = [];
    for (const m of data.media) {
      const seen = new Set<number>();
      for (const ref of m.verseRefs) for (const id of expandRef(ref)) {
        if (seen.has(id)) continue;
        seen.add(id);
        mediaVerseRows.push([mediaId.get(m.id), id]);
      }
    }
    await insertPlain(client, "media_verse", ["media_item_id", "verse_id"], mediaVerseRows);
    await insertPlain(
      client,
      "media_timeline_event",
      ["media_item_id", "timeline_event_id"],
      [
        ...data.media.flatMap((m) =>
          [...new Set(m.timelineOrders)].map((o) => [mediaId.get(m.id), eid(o)]),
        ),
        ...data.aiMedia.flatMap((a) => {
          const order = promptOf(a.promptId)?.timelineOrder;
          return order == null ? [] : [[mediaId.get(a.id), eid(order)]];
        }),
      ],
    );
    await insertPlain(
      client,
      "media_source",
      ["media_item_id", "source_id"],
      data.media.flatMap((m) => [...new Set(m.sourceSlugs)].map((x) => [mediaId.get(m.id), sid(x)])),
    );

    const unscanned = data.aiMedia.filter((a) => !a.faceScanned).length;
    report.note(
      `Medya: ${data.media.length} gercek · ${data.aiMedia.length} AI cikti ` +
        `(${unscanned} taranmamis, yayina girmez) · ${data.prompts.length} prompt`,
    );

    // --- Noldeke -----------------------------------------------------------
    if (data.noldeke !== null) {
      let updated = 0;
      for (const [surah, order] of Object.entries(data.noldeke.order)) {
        const r = await client.query("UPDATE surah SET revelation_order_noldeke = $2 WHERE id = $1", [Number(surah), order]);
        updated += r.rowCount ?? 0;
      }
      info(`surah.revelation_order_noldeke: ${updated} sure guncellendi`);
      report.note(`Noldeke siralamasi: ${updated} sure · kaynak ${data.noldeke.sourceSlug}`);
    }

    // --- sure ici konu bolumlemesi -----------------------------------------
    if (data.sections.length > 0) {
      const verseCounts = new Map(
        (await client.query<{ id: number; verse_count: number }>(
          "SELECT id, verse_count FROM surah",
        )).rows.map((r) => [r.id, r.verse_count]),
      );

      /*
       * Sema bitisikligi zaten dogruladi (1'den baslar, bosluk yok). Burada
       * yalnizca veritabanina karsi dogrulanabilen sey bakiliyor: bolumleme
       * surenin SONUNA kadar gidiyor mu? Sema sure uzunlugunu bilemez.
       */
      const sectionErrors: string[] = [];
      for (const file of data.sections) {
        const count = verseCounts.get(file.surahId);
        if (count === undefined) {
          sectionErrors.push(`sure ${String(file.surahId)} yok`);
          continue;
        }
        const last = file.sections[file.sections.length - 1];
        if (last !== undefined && last.verseEnd !== count) {
          sectionErrors.push(
            `sure ${String(file.surahId)}: bolumleme ${String(last.verseEnd)}. ayette bitiyor, ` +
              `sure ${String(count)} ayet — kalan ayetler basliksiz kalirdi`,
          );
        }
        for (const section of file.sections) {
          if (section.verseEnd > count) {
            sectionErrors.push(
              `sure ${String(file.surahId)} bolum ${String(section.order)}: ` +
                `${String(section.verseEnd)}. ayet yok (sure ${String(count)} ayet)`,
            );
          }
          for (const ref of section.alsoVerses) {
            for (const id of expandRef(ref)) {
              // Ek ayet baska surede olamaz: bolum bir surenin icindedir.
              if (Math.floor(id / 1000) !== file.surahId) {
                sectionErrors.push(
                  `sure ${String(file.surahId)} bolum ${String(section.order)}: ` +
                    `ek ayet '${ref}' baska surede`,
                );
                break;
              }
              const n = id % 1000;
              if (n >= section.verseStart && n <= section.verseEnd) {
                sectionErrors.push(
                  `sure ${String(file.surahId)} bolum ${String(section.order)}: ` +
                    `ek ayet '${ref}' zaten ana aralikta`,
                );
                break;
              }
            }
          }
        }
      }
      if (sectionErrors.length > 0) {
        for (const e of sectionErrors) console.error(`   x ${e}`);
        fail(`${sectionErrors.length} bolumleme hatasi — hicbir sey yazilmadi`);
      }

      await insertPlain(
        client,
        "surah_section",
        ["surah_id", "order", "title", "verse_start", "verse_end", "origin", "source_id", "note"],
        data.sections.flatMap((f) =>
          f.sections.map((x) => [
            f.surahId, x.order, x.title, x.verseStart, x.verseEnd,
            f.origin, f.sourceSlug === null ? null : sid(f.sourceSlug), x.note,
          ]),
        ),
      );

      // section_verse YALNIZCA istisnalari tutar (DDL notu): ana aralik
      // surah_section satirinda zaten duruyor, orayi kopyalamak veriyi ikizlerdi.
      const sectionId = new Map<string, number>();
      for (const r of (await client.query<{ id: number; surah_id: number; order: number }>(
        'SELECT id, surah_id, "order" FROM surah_section',
      )).rows) sectionId.set(`${String(r.surah_id)}:${String(r.order)}`, r.id);

      const extraRows: unknown[][] = [];
      for (const f of data.sections) {
        for (const x of f.sections) {
          const id = sectionId.get(`${String(f.surahId)}:${String(x.order)}`);
          if (id === undefined) continue;
          const seen = new Set<number>();
          for (const ref of x.alsoVerses) {
            for (const verseId of expandRef(ref)) {
              if (seen.has(verseId)) continue;
              seen.add(verseId);
              extraRows.push([id, verseId]);
            }
          }
        }
      }
      await insertPlain(client, "section_verse", ["section_id", "verse_id"], extraRows);

      const covered = data.sections.reduce((a, f) => a + f.sections.length, 0);
      report.note(
        `Bolumleme: ${data.sections.length} sure · ${covered} konu basligi · ` +
          `${extraRows.length} ek ayet baglantisi`,
      );
    }

    /*
     * --- ayetler arasi iliskiler ------------------------------------------
     *
     * En sonda, ayni transaction icinde: kissa / olay / kavram baglari yukarida
     * kuruldu, iliski turetimi onlarin uzerinden gecer. Ayri bir komuta
     * alinsaydi, data/** degisip bu calistirilmadiginda iliskiler eski
     * icerige isaret ederdi.
     */
    const relationCount = await deriveVerseRelations(client);
    report.note(`Ayet iliskisi: ${relationCount.toLocaleString("tr-TR")} satir (turetilmis)`);
  });

  // --- ozet ------------------------------------------------------------------
  const counts = (await pool.query<{ t: string; n: string }>(
    `SELECT 'story' t, count(*)::text n FROM story
     UNION ALL SELECT 'story_passage', count(*)::text FROM story_passage
     UNION ALL SELECT 'story_lesson', count(*)::text FROM story_lesson
     UNION ALL SELECT 'location', count(*)::text FROM location
     UNION ALL SELECT 'concept', count(*)::text FROM concept
     UNION ALL SELECT 'concept_verse', count(*)::text FROM concept_verse
     UNION ALL SELECT 'concept_relation', count(*)::text FROM concept_relation
     UNION ALL SELECT 'principle', count(*)::text FROM principle
     UNION ALL SELECT 'principle_verse', count(*)::text FROM principle_verse
     UNION ALL SELECT 'timeline_event', count(*)::text FROM timeline_event
     UNION ALL SELECT 'surah_section', count(*)::text FROM surah_section
     UNION ALL SELECT 'verse_relation', count(*)::text FROM verse_relation
     UNION ALL SELECT 'media_item', count(*)::text FROM media_item
     UNION ALL SELECT 'media_verse', count(*)::text FROM media_verse
     UNION ALL SELECT 'ai_prompt', count(*)::text FROM ai_prompt`,
  )).rows;
  for (const c of counts) report.note(`${c.t}: ${c.n}`);
  info(counts.map((c) => `${c.t}=${c.n}`).join(" · "));
  info(`rapor: ${report.write()}`);
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    await closePool();
    console.error(error);
    process.exit(1);
  });
