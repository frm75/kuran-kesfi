/**
 * Acik Kuran import — author, translation, footnote, root, verse_part.
 *
 * ## Kaynak ve lisans
 *
 * Acik Kuran (acikkuran.com) acik kaynak, gonullu bir projedir. Deposundaki
 * LICENCE dosyasi tam CC BY-NC-SA 4.0 metnidir; veri bu lisansla paylasilir.
 * Projemiz ticari degildir ve data/ klasorunu ayni lisansla yayinlar —
 * ShareAlike sarti karsilanir. Atif zorunludur.
 *
 * ## Neden bu uc
 *
 * Yayinlanan REST API'si (api.acikkuran.com) 2026 Agustos basindan beri
 * kapalidir (NXDOMAIN; GitHub issue #20). Veri hicbir depoda yoktur — uc depo
 * da yalnizca uygulama kodudur. Site ayakta oldugu icin veri, sitenin kendi
 * sayfa verisi ucundan alinir:
 *
 *   /_next/data/<buildId>/<sure>/<ayet>.json
 *
 * Tek istek su hepsini dondurur: 50 meal (tr+en) + dipnotlar, kelime bazli
 * verse_part'lar, kok bilgisi (Turkce anlamiyla) ve morfoloji.
 *
 * buildId her dagitimda degisir; bu yuzden her calistirmada ana sayfadan
 * yeniden okunur. Onbellek anahtari buildId ICERMEZ — aksi halde kaynagin her
 * dagitimi tum onbellegi gecersiz kilardi.
 *
 * ## Kaynak nezaketi (plan 20.1)
 * Yapay sleep yok; es zamanlilik IMPORT_CONCURRENCY ile sinirli. Her ayet TEK
 * SEFER cekilir ve gzip'li olarak cache/ altina alinir; ikinci calistirma agdan
 * veri cekmez. Istek basligi projeyi acikca tanitir.
 *
 * Calistirma:  pnpm --filter @kuran/import acikkuran
 */

import { computeVerseId } from "@kuran/schema";
import {
  Report,
  closePool,
  fail,
  fetchCached,
  info,
  pool,
  slugify,
  upsertMany,
  withTransaction,
} from "@kuran/pipeline";

const SITE = "https://acikkuran.com";
const EXPECTED_VERSE_COUNT = 6236;
const LICENSE = "CC BY-NC-SA 4.0";

/**
 * Plan §3.1 oncelikli mealleri. Acik Kuran'da dordu de mevcut oldugu icin
 * planin ORIJINAL listesi uygulanabiliyor.
 */
const PRIORITY_BY_NAME: Readonly<Record<string, 1 | 2 | 3 | 4>> = {
  "Diyanet İşleri": 1,
  "Mehmet Okuyan": 2,
  "Mustafa İslamoğlu": 3,
  "Muhammed Esed": 4,
};

// -----------------------------------------------------------------------------
// Kaynak yanit tipleri
// -----------------------------------------------------------------------------

interface AkAuthor {
  id: number;
  name: string;
  language: string;
  description: string | null;
  url: string | null;
}

interface AkFootnote {
  id: number;
  number: number;
  text: string;
}

interface AkTranslation {
  id: number;
  text: string;
  author: AkAuthor;
  footnotes: AkFootnote[] | null;
}

interface AkRoot {
  id: number;
  latin: string;
  arabic: string;
  mean: string | null;
}

interface AkWord {
  id: number;
  sort_number: number;
  arabic: string;
  transcription_tr: string | null;
  transcription_en: string | null;
  translation_tr: string | null;
  translation_en: string | null;
  details: unknown;
  root: AkRoot | null;
}

interface AkVersePage {
  pageProps?: {
    verse?: {
      number: number;
      original: string;
      transcription: string | null;
      transcription_en: string | null;
      page: number;
      juz_number: number;
    };
    translations?: AkTranslation[];
    words?: AkWord[];
  };
}

// -----------------------------------------------------------------------------

/** Ana sayfadan gecerli buildId'yi okur. Her dagitimda degisir. */
async function resolveBuildId(): Promise<string> {
  const html = await fetchCached(`${SITE}/`, { cacheName: "acikkuran_home.html", force: true });
  const match = /"buildId":"([^"]+)"/.exec(html);
  if (match?.[1] === undefined) {
    fail("acikkuran.com ana sayfasinda buildId bulunamadi — sayfa yapisi degismis olabilir");
  }
  return match[1];
}

async function main(): Promise<void> {
  const report = new Report("acikkuran");

  const buildId = await resolveBuildId();
  info(`buildId: ${buildId}`);

  // --- ayet listesi veritabanindan (Tanzil tek gercek kaynak) ---
  const { rows: verses } = await pool.query<{ id: number; surah_id: number; verse_number: number }>(
    "SELECT id, surah_id, verse_number FROM verse ORDER BY id",
  );
  if (verses.length !== EXPECTED_VERSE_COUNT) {
    fail(`verse tablosunda ${verses.length} ayet var — once 'tanzil' import'unu calistirin`);
  }

  info(`${verses.length} ayet cekiliyor (onbellekte olanlar agdan cekilmez)`);

  const authorsById = new Map<number, AkAuthor>();
  const rootsById = new Map<number, AkRoot>();
  /** verse_id -> (authorId -> {text, footnotes}) */
  const translationsByVerse = new Map<number, Map<number, AkTranslation>>();
  const wordsByVerse = new Map<number, AkWord[]>();
  const transcriptionEn = new Map<number, string>();

  let fetched = 0;
  const fetchVerse = async (v: { id: number; surah_id: number; verse_number: number }) => {
    const url = `${SITE}/_next/data/${buildId}/${v.surah_id}/${v.verse_number}.json`;
    const body = await fetchCached(url, {
      // buildId onbellek anahtarina GIRMEZ
      cacheName: `acikkuran/verse_${v.surah_id}_${v.verse_number}.json`,
      gzip: true,
    });

    let page: AkVersePage;
    try {
      page = JSON.parse(body) as AkVersePage;
    } catch {
      fail(`${v.surah_id}:${v.verse_number} gecersiz JSON`);
    }

    const props = page.pageProps;
    if (props?.verse === undefined) {
      fail(`${v.surah_id}:${v.verse_number} beklenen 'verse' alani yok`);
    }

    if (props.verse.number !== v.verse_number) {
      fail(
        `${v.surah_id}:${v.verse_number} icin ${props.verse.number} numarali ayet dondu — ` +
          "kaynak eslesmiyor",
      );
    }

    if (props.verse.transcription_en !== null && props.verse.transcription_en !== undefined) {
      transcriptionEn.set(v.id, props.verse.transcription_en);
    }

    const perAuthor = new Map<number, AkTranslation>();
    for (const t of props.translations ?? []) {
      authorsById.set(t.author.id, t.author);
      perAuthor.set(t.author.id, t);
    }
    translationsByVerse.set(v.id, perAuthor);

    const words = props.words ?? [];
    wordsByVerse.set(v.id, words);
    for (const w of words) {
      if (w.root !== null) rootsById.set(w.root.id, w.root);
    }

    fetched += 1;
    if (fetched % 500 === 0) {
      info(`  ${fetched}/${verses.length} ayet islendi`);
    }
  };

  // fetchCached kendi icinde p-limit uyguluyor; hepsini birden baslatmak
  // guvenli ama bellek icin gruplar halinde islenir
  const BATCH = 500;
  for (let offset = 0; offset < verses.length; offset += BATCH) {
    await Promise.all(verses.slice(offset, offset + BATCH).map(fetchVerse));
  }

  info(
    `cekildi: ${authorsById.size} yazar, ${rootsById.size} kok, ` +
      `${[...wordsByVerse.values()].reduce((n, w) => n + w.length, 0)} kelime`,
  );

  // --- slug uretimi ve cakisma denetimi ---
  const slugByAuthorId = new Map<number, string>();
  const usedSlugs = new Map<string, number>();
  for (const author of authorsById.values()) {
    const base = slugify(author.name);
    if (base === "") fail(`yazar ${author.id} icin slug uretilemedi: "${author.name}"`);
    const clash = usedSlugs.get(base);
    if (clash !== undefined) {
      fail(`slug cakismasi '${base}': yazar ${clash} ve ${author.id}`);
    }
    usedSlugs.set(base, author.id);
    slugByAuthorId.set(author.id, base);
  }

  // --- yazma ---
  await withTransaction(async (client) => {
    await upsertMany(
      client,
      "source",
      ["slug", "name", "work_title", "author", "reference", "url", "license", "note"],
      [
        [
          "acikkuran",
          "Açık Kuran",
          "Açık Kuran",
          null,
          "acikkuran.com sayfa verisi",
          SITE,
          LICENSE,
          "Mealler, dipnotlar, kelime ve kök verisi. Yayınlanan REST API'si kapalı olduğu için " +
            "veri sitenin kendi sayfa verisi ucundan alınmıştır. Atıf zorunludur.",
        ],
      ],
      ["slug"],
    );

    // --- author ---
    const authorRows = [...authorsById.values()].map((a) => {
      const slug = slugByAuthorId.get(a.id);
      if (slug === undefined) fail(`slug yok: ${a.id}`);
      const priority = PRIORITY_BY_NAME[a.name] ?? null;
      return [
        slug,
        a.name,
        a.description,
        a.language,
        "acikkuran",
        LICENSE,
        `Açık Kuran yazar id ${a.id}`,
        a.url,
        priority !== null,
        priority,
      ];
    });
    await upsertMany(
      client,
      "author",
      [
        "slug",
        "name",
        "work_title",
        "language",
        "source",
        "license",
        "license_note",
        "url",
        "is_default",
        "priority",
      ],
      authorRows,
      ["slug"],
    );

    const { rows: authorIdRows } = await client.query<{ slug: string; id: number }>(
      "SELECT slug, id FROM author WHERE source = 'acikkuran'",
    );
    const dbAuthorIdBySlug = new Map(authorIdRows.map((r) => [r.slug, r.id]));

    // --- root ---
    const rootRows = [...rootsById.values()].map((r) => [r.latin, r.arabic, r.mean]);
    await upsertMany(client, "root", ["latin", "arabic", "meaning_tr"], rootRows, ["latin"]);

    const { rows: rootIdRows } = await client.query<{ latin: string; id: number }>(
      "SELECT latin, id FROM root",
    );
    const dbRootIdByLatin = new Map(rootIdRows.map((r) => [r.latin, r.id]));

    // --- translation ---
    const translationRows: unknown[][] = [];
    let emptyTranslations = 0;
    for (const [verseId, perAuthor] of translationsByVerse) {
      for (const [akAuthorId, t] of perAuthor) {
        const slug = slugByAuthorId.get(akAuthorId);
        const dbId = slug === undefined ? undefined : dbAuthorIdBySlug.get(slug);
        if (dbId === undefined) continue;
        // Kaynakta metni bos meal kayitlari var; yazilmaz, sayisi rapora gecer
        if (t.text === null || t.text === undefined || t.text.trim() === "") {
          emptyTranslations += 1;
          continue;
        }
        translationRows.push([verseId, dbId, t.text]);
      }
    }
    await upsertMany(
      client,
      "translation",
      ["verse_id", "author_id", "text"],
      translationRows,
      ["verse_id", "author_id"],
    );
    if (emptyTranslations > 0) {
      report.issue(`${emptyTranslations} meal kaynakta bos metinle geldi ve yazilmadi`);
    }

    // --- footnote ---
    const { rows: translationIdRows } = await client.query<{
      id: number;
      verse_id: number;
      author_id: number;
    }>("SELECT id, verse_id, author_id FROM translation");
    const translationIdKey = new Map(
      translationIdRows.map((r) => [`${r.verse_id}:${r.author_id}`, r.id]),
    );

    const footnoteRows: unknown[][] = [];
    let emptyFootnotes = 0;
    for (const [verseId, perAuthor] of translationsByVerse) {
      for (const [akAuthorId, t] of perAuthor) {
        if (t.footnotes === null || t.footnotes.length === 0) continue;
        const slug = slugByAuthorId.get(akAuthorId);
        const dbAuthorId = slug === undefined ? undefined : dbAuthorIdBySlug.get(slug);
        if (dbAuthorId === undefined) continue;
        const translationId = translationIdKey.get(`${verseId}:${dbAuthorId}`);
        if (translationId === undefined) continue;
        const seen = new Set<number>();
        for (const f of t.footnotes) {
          if (seen.has(f.number)) continue;
          seen.add(f.number);
          // Kaynakta metni bos dipnotlar var (Acik Kuran issue #4). Anlamsiz
          // oldugu icin yazilmaz; sayisi rapora gecer, sessizce atlanmaz.
          if (f.text === null || f.text === undefined || f.text.trim() === "") {
            emptyFootnotes += 1;
            continue;
          }
          footnoteRows.push([translationId, f.number, f.text]);
        }
      }
    }
    await upsertMany(
      client,
      "footnote",
      ["translation_id", "number", "text"],
      footnoteRows,
      ["translation_id", "number"],
    );
    if (emptyFootnotes > 0) {
      report.issue(
        `${emptyFootnotes} dipnot kaynakta bos metinle geldi ve yazilmadi ` +
          "(Acik Kuran issue #4)",
      );
    }

    // --- verse_part ---
    let unmatchedRoots = 0;
    const partRows: unknown[][] = [];
    for (const [verseId, words] of wordsByVerse) {
      for (const w of words) {
        let rootId: number | null = null;
        if (w.root !== null) {
          rootId = dbRootIdByLatin.get(w.root.latin) ?? null;
          if (rootId === null) unmatchedRoots += 1;
        }
        partRows.push([
          verseId,
          w.sort_number,
          w.arabic,
          w.transcription_tr,
          w.transcription_en,
          w.translation_tr,
          w.translation_en,
          rootId,
          JSON.stringify(w.details ?? null),
        ]);
      }
    }
    await upsertMany(
      client,
      "verse_part",
      [
        "verse_id",
        "sort_number",
        "arabic",
        "transcription_tr",
        "transcription_en",
        "translation_tr",
        "translation_en",
        "root_id",
        "grammar",
      ],
      partRows,
      ["verse_id", "sort_number"],
    );
    if (unmatchedRoots > 0) {
      report.issue(`${unmatchedRoots} kelimede kok kaydi veritabaninda bulunamadi`);
    }

    // --- verse.transcription_en ---
    if (transcriptionEn.size > 0) {
      await client.query(
        `CREATE TEMP TABLE tmp_tr_en (verse_id integer PRIMARY KEY, text text NOT NULL)
         ON COMMIT DROP`,
      );
      await upsertMany(
        client,
        "tmp_tr_en",
        ["verse_id", "text"],
        [...transcriptionEn].map(([id, text]) => [id, text]),
        ["verse_id"],
      );
      const updated = await client.query(
        `UPDATE verse v SET transcription_en = t.text
           FROM tmp_tr_en t
          WHERE t.verse_id = v.id AND v.transcription_en IS DISTINCT FROM t.text`,
      );
      info(`verse.transcription_en: ${updated.rowCount ?? 0} satir guncellendi`);
    }
  });

  // --- dogrulama ---
  const { rows: summaryRows } = await pool.query<{
    authors_tr: string;
    authors_en: string;
    translations: string;
    footnotes: string;
    roots: string;
    parts: string;
    parts_without_root: string;
    verses_without_translation: string;
  }>(
    `SELECT (SELECT count(*) FROM author WHERE source='acikkuran' AND language='tr') AS authors_tr,
            (SELECT count(*) FROM author WHERE source='acikkuran' AND language='en') AS authors_en,
            (SELECT count(*) FROM translation)                                       AS translations,
            (SELECT count(*) FROM footnote)                                          AS footnotes,
            (SELECT count(*) FROM root)                                              AS roots,
            (SELECT count(*) FROM verse_part)                                        AS parts,
            (SELECT count(*) FROM verse_part WHERE root_id IS NULL)                  AS parts_without_root,
            (SELECT count(*) FROM verse v WHERE NOT EXISTS
               (SELECT 1 FROM translation t WHERE t.verse_id=v.id))                  AS verses_without_translation`,
  );
  const s = summaryRows[0];
  if (s === undefined) fail("dogrulama sorgusu bos dondu");

  info(
    `veritabani: ${s.authors_tr} Türkçe + ${s.authors_en} İngilizce meal, ` +
      `${Number(s.translations).toLocaleString("tr-TR")} meal satiri, ` +
      `${Number(s.footnotes).toLocaleString("tr-TR")} dipnot`,
  );
  info(
    `kelime: ${Number(s.parts).toLocaleString("tr-TR")} verse_part, ` +
      `${Number(s.roots).toLocaleString("tr-TR")} kok`,
  );

  if (s.verses_without_translation !== "0") {
    fail(`${s.verses_without_translation} ayette hic meal yok`);
  }

  // Kaynakta eksik olan yazar/ayet ciftleri sessizce atlanmaz (plan 20.1)
  const { rows: gaps } = await pool.query<{ slug: string; missing: string }>(
    `SELECT a.slug, count(*)::text AS missing
       FROM author a CROSS JOIN verse v
      WHERE a.source = 'acikkuran'
        AND NOT EXISTS (SELECT 1 FROM translation t
                         WHERE t.author_id = a.id AND t.verse_id = v.id)
      GROUP BY a.slug ORDER BY 2 DESC`,
  );
  if (gaps.length > 0) {
    const total = gaps.reduce((n, g) => n + Number(g.missing), 0);
    report.note(
      `Kaynakta eksik meal: ${total} ayet-yazar çifti — ` +
        gaps.map((g) => `${g.slug} (${g.missing})`).join(", "),
    );
    info(`kaynakta eksik meal: ${total} ayet-yazar cifti (${gaps.length} yazar)`);
  }

  const ratio = (Number(s.parts_without_root) / Number(s.parts)) * 100;
  report.note(`Köke bağlanmayan kelime: ${s.parts_without_root}/${s.parts} (%${ratio.toFixed(1)})`);
  report.note(`Türkçe meal: ${s.authors_tr}, İngilizce meal: ${s.authors_en}`);
  report.note(`Dipnot: ${s.footnotes}`);
  report.note("ZORUNLU: arayüzde Açık Kuran atfı (CC BY-NC-SA 4.0) gösterilmelidir.");
  report.note("root_diff (kök türevleri) bu uçta yok; ayrı kaynak gerekiyor.");

  info(`rapor: ${report.write()} (${report.issues} sorun)`);
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    await closePool();
    fail(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  });
