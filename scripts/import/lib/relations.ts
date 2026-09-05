import { info } from "@kuran/pipeline";
import type { Client } from "@kuran/pipeline";

/**
 * Ayetler arasi iliskilerin turetimi — plan 12.5.
 *
 * ## Bu bir AI onerisi DEGIL, sayimdir
 *
 * Plan 12.5 "AI tarafindan onerilen iliskiler kesin bilgi olarak gosterilmez"
 * diyor. Burada oneri yok: iki ayetin ayni kissayi, ayni olayi, ayni kokü ya da
 * ayni kavrami gercekten paylasip paylasmadigi sayiliyor. Bu yuzden source_id
 * NULL (platform derlemesi) ama confidence kaynagina gore ayrilir:
 *
 *   same_story / same_event / same_root  -> kesin     (dogrudan veri)
 *   same_topic                           -> muhtemel  (kavram-ayet eslestirmesi
 *                                                      kendisi kokten turetilmis,
 *                                                      yorum payi var)
 *
 * ## Kombinatorik patlama
 *
 * Ham cift sayisi olculdu (2026-09-05): kok 158 647, kavram 342 997,
 * kissa 69 889, olay 2 465 — toplam ~574 bin. Hepsi yazilmaz:
 *
 *   1. Buyuk gruplar elenir. "قول" 1722 gecisli; iki ayetin onu paylasmasi
 *      hicbir sey soylemez. Kok gruplari <= MAX_ROOT_VERSES, kavram gruplari
 *      <= MAX_CONCEPT_VERSES ayet ile sinirli.
 *   2. Grup buyudukce puan duser: base / log2(grup + 1). Nadir kok yakin bag,
 *      genis kavram uzak bag.
 *   3. Ayni cifte birden fazla kanit gelirse puanlar TOPLANIR — ayni kissada
 *      olup ustelik ayni koku paylasan iki ayet, yalnizca birini paylasandan
 *      once gelir.
 *   4. Ayet basina yalnizca en iyi TOP_PER_VERSE iliski yazilir (~50 bin satir).
 *
 * Gerekce (reason) en guclu uc kanittan kurulur ve kullaniciya oldugu gibi
 * gosterilir: "Ayni kissa: Hz. Yusuf · Ayni kok: ص ب ر (103 gecis)".
 *
 * Butun is veritabani icinde biter; 574 bin cift ag uzerinden tasinmaz.
 */

/** Ayet basina yazilan en fazla iliski. */
const TOP_PER_VERSE = 8;

/**
 * Bundan genis kok / kavram gruplari ayirt edici degildir, elenir.
 *
 * Kok siniri 120 AYET (gecis degil). Sinir keyfi degil: صبر 93 ayette geciyor
 * ve plan 12.5'in kendi ornegi ("Bakara 153 -> Yusuf 90, ayni kok ص ب ر") bu
 * kokun iceride kalmasini gerektiriyor. 60'ta kalsaydi Kur'an'in en merkezi
 * kavramlarindan biri agdan tumuyle duserdi. Ustteki esikte قول (1722 gecis)
 * ve صلح (170 ayet) disarida kalir — onlari paylasmak bir sey soylemez.
 */
const MAX_ROOT_VERSES = 120;
const MAX_CONCEPT_VERSES = 200;

/**
 * Tek bir kok/kavram/kissa ayet basina en fazla kac bag kurabilir.
 *
 * Bu sinir olmadan ilk surum ise yaramiyordu: Bakara 153'un sekiz baginin
 * sekizi de عون kokundendi (11 gecisli nadir kok, puani yuksek) — sabir da,
 * kissa bagi da listeye hic giremedi. Nadir bir kok butun kontenjani yiyordu.
 * Ucte sinirlayinca liste farkli acilardan bakan baglar tasiyor.
 */
const MAX_PER_REF = 3;

/**
 * Taban puanlar. Siralama ozgullukten genellige: bir olay bir kissadan dar,
 * kissa bir kokten dar, kok bir kavramdan dardir.
 */
const BASE = { event: 6.0, story: 5.0, root: 4.0, concept: 3.0 } as const;

/** Gerekcede yan yana yazilan en fazla kanit. */
const REASON_PARTS = 3;

export async function deriveVerseRelations(client: Client): Promise<number> {
  // Aday tablosu: her satir "su ayetten su ayete, su gerekceyle" tek bir kanit.
  // Yonlu — her ciftin iki yonu de uretilir, cunku siralama ayete goredir:
  // A'nin en iyi 8'inde B olabilir ama B'nin en iyi 8'inde A olmayabilir.
  await client.query(`
    CREATE TEMP TABLE rel_cand (
      src      integer NOT NULL,
      tgt      integer NOT NULL,
      rel      text    NOT NULL,
      score    double precision NOT NULL,
      ref_type text    NOT NULL,
      ref_id   integer NOT NULL,
      label    text    NOT NULL
    ) ON COMMIT DROP
  `);

  // --- kissa ---------------------------------------------------------------
  // story_passage aralik tutar; ayete acilir. Ayni ayet iki parcada gecerse
  // DISTINCT tekler, yoksa cift kanit sayilirdi.
  await client.query(`
    WITH sv AS (
      SELECT DISTINCT sp.story_id AS gid, sp.surah_id * 1000 + n AS vid
        FROM story_passage sp, generate_series(sp.verse_start::int, sp.verse_end::int) AS n
    ),
    sz AS (SELECT gid, count(*) AS n FROM sv GROUP BY gid)
    INSERT INTO rel_cand (src, tgt, rel, score, ref_type, ref_id, label)
    SELECT a.vid, b.vid, 'same_story',
           ${String(BASE.story)} / log(2.0, (sz.n + 1)::numeric),
           'story', a.gid, 'Aynı kıssa: ' || s.title
      FROM sv a
      JOIN sv b ON b.gid = a.gid AND b.vid <> a.vid
      JOIN sz ON sz.gid = a.gid
      JOIN story s ON s.id = a.gid
  `);

  // --- siyer olayi ---------------------------------------------------------
  await client.query(`
    WITH ev AS (SELECT timeline_event_id AS gid, verse_id AS vid FROM timeline_event_verse),
    sz AS (SELECT gid, count(*) AS n FROM ev GROUP BY gid)
    INSERT INTO rel_cand (src, tgt, rel, score, ref_type, ref_id, label)
    SELECT a.vid, b.vid, 'same_event',
           ${String(BASE.event)} / log(2.0, (sz.n + 1)::numeric),
           'event', a.gid, 'Aynı olay: ' || e.title
      FROM ev a
      JOIN ev b ON b.gid = a.gid AND b.vid <> a.vid
      JOIN sz ON sz.gid = a.gid
      JOIN timeline_event e ON e.id = a.gid
  `);

  // --- ortak kok -----------------------------------------------------------
  // Gerekcede "kac gecis" yazar: okuyucu kokun ne kadar yaygin oldugunu gorur,
  // "sabir 103 gecis" ile "irem 2 gecis" ayni agirlikta sunulmaz.
  await client.query(`
    WITH rv AS (
      SELECT DISTINCT root_id AS gid, verse_id AS vid FROM verse_part WHERE root_id IS NOT NULL
    ),
    occ AS (SELECT root_id AS gid, count(*) AS c FROM verse_part WHERE root_id IS NOT NULL GROUP BY root_id),
    sz AS (
      SELECT gid, count(*) AS n FROM rv GROUP BY gid
       HAVING count(*) BETWEEN 2 AND ${String(MAX_ROOT_VERSES)}
    )
    INSERT INTO rel_cand (src, tgt, rel, score, ref_type, ref_id, label)
    SELECT a.vid, b.vid, 'same_root',
           ${String(BASE.root)} / log(2.0, (sz.n + 1)::numeric),
           'root', a.gid,
           'Aynı kök: ' || r.arabic || ' (' || occ.c || ' geçiş)'
      FROM sz
      JOIN rv a ON a.gid = sz.gid
      JOIN rv b ON b.gid = sz.gid AND b.vid <> a.vid
      JOIN root r ON r.id = sz.gid
      JOIN occ ON occ.gid = sz.gid
  `);

  // --- ortak kavram --------------------------------------------------------
  await client.query(`
    WITH cv AS (SELECT concept_id AS gid, verse_id AS vid FROM concept_verse),
    sz AS (
      SELECT gid, count(*) AS n FROM cv GROUP BY gid
       HAVING count(*) BETWEEN 2 AND ${String(MAX_CONCEPT_VERSES)}
    )
    INSERT INTO rel_cand (src, tgt, rel, score, ref_type, ref_id, label)
    SELECT a.vid, b.vid, 'same_topic',
           ${String(BASE.concept)} / log(2.0, (sz.n + 1)::numeric),
           'concept', a.gid, 'Ortak kavram: ' || c.name_tr
      FROM sz
      JOIN cv a ON a.gid = sz.gid
      JOIN cv b ON b.gid = sz.gid AND b.vid <> a.vid
      JOIN concept c ON c.id = sz.gid
  `);

  const { rows: candRows } = await client.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM rel_cand",
  );
  info(`verse_relation: ${Number(candRows[0]?.n ?? 0).toLocaleString("tr-TR")} ham kanit`);

  await client.query("CREATE INDEX ON rel_cand (src, tgt)");
  await client.query("ANALYZE rel_cand");

  /*
   * Kanitlar cifte gore toplanir, sonra ayet basina en iyi TOP_PER_VERSE secilir.
   *
   * Tur ve gerekce en GUCLU kanittan gelir, puan ise TOPLAMDAN — boylece
   * "ayni kissa + ayni kok" cifti "yalnizca ayni kissa" ciftini geride birakir
   * ama etiketi yine en ozgul kanitin etiketi olur.
   *
   * Siralama beraberliginde tgt'ye gore kirilir: tekrarlanabilir build
   * (plan 20.1) icin sonuc girdi ayni oldugunda ayni olmali.
   */
  const inserted = await client.query(`
    INSERT INTO verse_relation
      (source_verse_id, target_verse_id, relation_type, reason,
       reason_ref_type, reason_ref_id, source_id, confidence)
    WITH agg AS (
      SELECT src, tgt,
             sum(score) AS total,
             (array_agg(rel      ORDER BY score DESC, ref_id))[1] AS rel,
             (array_agg(ref_type ORDER BY score DESC, ref_id))[1] AS ref_type,
             (array_agg(ref_id   ORDER BY score DESC, ref_id))[1] AS ref_id,
             (array_agg(label    ORDER BY score DESC, ref_id))[1:${String(REASON_PARTS)}] AS labels
        FROM rel_cand
       GROUP BY src, tgt
    ),
    -- Once kaynak basina cesitlilik siniri: tek bir kok butun kontenjani yiyemez
    capped AS (
      SELECT *, row_number() OVER (
               PARTITION BY src, ref_type, ref_id ORDER BY total DESC, tgt
             ) AS rn_ref
        FROM agg
    ),
    -- Sonra ayet basina en iyi TOP_PER_VERSE
    ranked AS (
      SELECT *, row_number() OVER (PARTITION BY src ORDER BY total DESC, tgt) AS rn
        FROM capped
       WHERE rn_ref <= ${String(MAX_PER_REF)}
    )
    SELECT src, tgt, rel::verse_relation_type,
           array_to_string(labels, ' · '),
           ref_type::reason_ref_type, ref_id, NULL,
           (CASE WHEN rel = 'same_topic' THEN 'muhtemel' ELSE 'kesin' END)::confidence_level
      FROM ranked
     WHERE rn <= ${String(TOP_PER_VERSE)}
  `);

  const count = inserted.rowCount ?? 0;
  const { rows: covered } = await client.query<{ n: string }>(
    "SELECT count(DISTINCT source_verse_id)::text AS n FROM verse_relation",
  );
  info(
    `verse_relation: ${count.toLocaleString("tr-TR")} iliski yazildi · ` +
      `${Number(covered[0]?.n ?? 0).toLocaleString("tr-TR")} / 6236 ayet bagli`,
  );
  return count;
}
