import {
  CONTENT_FINGERPRINT_KEY,
  IMPORT_STATE_DDL,
  Report,
  closePool,
  contentFingerprint,
  fail,
  info,
  pool,
  upsertMany,
  withTransaction,
} from "@kuran/pipeline";
import { deriveVerseRelations } from "./lib/relations.js";
import type { ImportContext } from "./content/context.js";
import { CONTENT_TABLES, resolveVerseRefs } from "./content/db.js";
import { loadAll, parseErrors } from "./content/load.js";
import { crossCheck } from "./content/cross_check.js";
import { importLocations } from "./content/steps/locations.js";
import { importConcepts } from "./content/steps/concepts.js";
import { importStories } from "./content/steps/stories.js";
import { importPrinciples } from "./content/steps/principles.js";
import { importTimeline } from "./content/steps/timeline.js";
import { importMedia } from "./content/steps/media.js";
import { importNoldeke } from "./content/steps/order.js";
import { importSections } from "./content/steps/sections.js";

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

async function main(): Promise<void> {
  const fingerprint = contentFingerprint();
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

    // --- icerik adimlari ---------------------------------------------------
    // Sira FK bagimliligidir; her adim kendinden sonrakilerin ihtiyac duydugu
    // id eslemesini dondurur.
    const ctx: ImportContext = { client, data, report, sid, rootIdByLatin };
    const locationId = await importLocations(ctx);
    const conceptId = await importConcepts(ctx);
    const storyId = await importStories(ctx, { locationId, conceptId });
    await importPrinciples(ctx, { conceptId, storyId });
    const eventId = await importTimeline(ctx);
    await importMedia(ctx, { locationId, storyId, eventId });
    await importNoldeke(ctx);
    await importSections(ctx);

    /*
     * --- ayetler arasi iliskiler ------------------------------------------
     *
     * En sonda, ayni transaction icinde: kissa / olay / kavram baglari yukarida
     * kuruldu, iliski turetimi onlarin uzerinden gecer. Ayri bir komuta
     * alinsaydi, data/** degisip bu calistirilmadiginda iliskiler eski
     * icerige isaret ederdi.
     */
    const staleRelations = await client.query(
      "DELETE FROM verse_relation WHERE source_id IS NULL",
    );
    info(`verse_relation: ${String(staleRelations.rowCount ?? 0)} turetilmis bag silindi (kaynakli baglar korundu)`);
    const relationCount = await deriveVerseRelations(client);
    report.note(`Ayet iliskisi: ${relationCount.toLocaleString("tr-TR")} satir (turetilmis)`);
  });

  /*
   * Parmak izi: bu kosunun hangi data/ icerigini yazdigi. Islem BASARIYLA
   * bittikten sonra yazilir; yarim kalan kosu eski izi birakir ve linter
   * "bayat" der — dogru olan da bu. Iz, kosunun BASINDA hesaplanir: ice
   * aktarma surerken data/ degisirse yazilan iz diske uymaz, linter yakalar.
   */
  await pool.query(IMPORT_STATE_DDL);
  await pool.query(
    `INSERT INTO import_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [CONTENT_FINGERPRINT_KEY, fingerprint],
  );
  info(`parmak izi yazildi: ${fingerprint.slice(0, 12)}`);

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
