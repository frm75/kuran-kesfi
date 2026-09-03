/**
 * Tanzil ceviri seti import — author, translation ve verse.transcription_tr.
 *
 * Acik Kuran API'si kapandigi icin (bkz. docs/DEPLOY_REPORT.md §3.4) Turkce
 * mealler Tanzil ceviri setinden alinir.
 *
 * TELIF (tanzil.net/trans/ Terms of Use):
 *   - "The translations provided at this page are for non-commercial purposes
 *     only." Proje ticari degildir (plan §1.1).
 *   - "If you are using more than three of the following translations in a
 *     website or application, we require you to put a link back to this page."
 *     Dokuz meal kullanildigi icin arayuzde tanzil.net/trans/ baglantisi
 *     ZORUNLUDUR. <SourceBadge> bu baglantiyi tasir.
 *   - Mealler Tanzil tarafindan LISANSLANMAMISTIR; yalnizca ticari olmayan
 *     kullanima izin verilmistir. Telif hakki cevirmen/yayinciya aittir.
 *     Bu yuzden data/LICENSE'taki CC BY-NC-SA 4.0 yalnizca KENDI derledigimiz
 *     veriyi kapsar, mealleri kapsamaz.
 *
 * Idempotenttir; tekrar calistirmak ayni sonucu verir.
 *
 * Calistirma:  pnpm --filter @kuran/import tanzil-translations
 */

import { computeVerseId } from "@kuran/schema";
import {
  Report,
  closePool,
  fail,
  fetchAllCached,
  info,
  upsertMany,
  withTransaction,
} from "@kuran/pipeline";

const EXPECTED_VERSE_COUNT = 6236;

const TRANSLATIONS_TERMS_URL = "https://tanzil.net/trans/";

/** Tanzil'in tum ceviri dosyalarinda gecerli olan lisans ifadesi. */
const TANZIL_TRANSLATION_LICENSE =
  "Tanzil — yalnizca ticari olmayan kullanim; telif cevirmen/yayinciya aittir";

/**
 * Ceviri kaydi.
 *
 * `displayName` Tanzil'in dosya sonundaki "Name" / "Translator" alanlarinin
 * Turkce imla ile duzeltilmis halidir; Tanzil'de bazi kayitlar eksik veya
 * hatali yazilmistir (ornek: tr.ozturk -> "Öztürk", tr.bulac -> "Alİ Bulaç").
 * Yanlis dosyayi yanlis yazara yazmamak icin dosya sonundaki "ID" alani
 * beklenen kimlikle karsilastirilir; uyusmazsa import durur.
 *
 * `priority` 1-4: ilk acilista karsilastirmali gorunen mealler (plan §3.1).
 * Plandaki ilk liste (Diyanet, Okuyan, Islamoglu, Esed) uygulanamadi; Okuyan,
 * Islamoglu ve Esed acik lisansli hicbir sette yok (docs/DEPLOY_REPORT.md §3.4).
 */
interface TranslationEntry {
  tanzilId: string;
  slug: string;
  displayName: string;
  priority: 1 | 2 | 3 | 4 | null;
}

const TRANSLATIONS: readonly TranslationEntry[] = [
  { tanzilId: "tr.diyanet", slug: "diyanet-isleri", displayName: "Diyanet İşleri", priority: 1 },
  { tanzilId: "tr.yazir", slug: "elmalili-hamdi-yazir", displayName: "Elmalılı Hamdi Yazır", priority: 2 },
  { tanzilId: "tr.bulac", slug: "ali-bulac", displayName: "Ali Bulaç", priority: 3 },
  { tanzilId: "tr.ates", slug: "suleyman-ates", displayName: "Süleyman Ateş", priority: 4 },
  { tanzilId: "tr.vakfi", slug: "diyanet-vakfi", displayName: "Diyanet Vakfı", priority: null },
  { tanzilId: "tr.golpinarli", slug: "abdulbaki-golpinarli", displayName: "Abdulbaki Gölpınarlı", priority: null },
  { tanzilId: "tr.ozturk", slug: "yasar-nuri-ozturk", displayName: "Yaşar Nuri Öztürk", priority: null },
  { tanzilId: "tr.yildirim", slug: "suat-yildirim", displayName: "Suat Yıldırım", priority: null },
  { tanzilId: "tr.yuksel", slug: "edip-yuksel", displayName: "Edip Yüksel", priority: null },
];

/** Ceviriyazi bir meal degildir; verse.transcription_tr alanina yazilir. */
const TRANSLITERATION = {
  tanzilId: "tr.transliteration",
  displayName: "Çeviriyazı — Muhammet Abay",
} as const;

const transUrl = (tanzilId: string): string => `https://tanzil.net/trans/${tanzilId}`;
const cacheName = (tanzilId: string): string => `tanzil_${tanzilId.replace(".", "_")}.txt`;

// -----------------------------------------------------------------------------
// Ayrisitirma
// -----------------------------------------------------------------------------

interface ParsedTranslation {
  /** "surah:verse" -> metin */
  texts: Map<string, string>;
  /** Dosya sonundaki yorum blogundan okunan ust bilgi */
  meta: Record<string, string>;
}

/**
 * Tanzil ceviri dosyasi bicimi:
 *   1|1|Rahman ve Rahim olan Allah'in adiyla:
 *   ...
 *   # --------------------------------------------------
 *   #  Name: Diyanet İşleri
 *   #  ID: tr.diyanet
 */
function parseTranslationFile(body: string, tanzilId: string): ParsedTranslation {
  const texts = new Map<string, string>();
  const meta: Record<string, string> = {};

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;

    if (line.startsWith("#")) {
      const match = /^#\s*([A-Za-z ]+):\s*(.+)$/.exec(line);
      if (match?.[1] !== undefined && match[2] !== undefined) {
        meta[match[1].trim()] = match[2].trim();
      }
      continue;
    }

    // Metin '|' icerebilecegi icin yalnizca ilk iki ayirici bolunur
    const first = line.indexOf("|");
    const second = line.indexOf("|", first + 1);
    if (first === -1 || second === -1) {
      fail(`${tanzilId}: ayrisitirilamayan satir -> ${line.slice(0, 60)}`);
    }

    const surahNumber = Number(line.slice(0, first));
    const verseNumber = Number(line.slice(first + 1, second));
    const text = line.slice(second + 1).trim();

    if (!Number.isInteger(surahNumber) || !Number.isInteger(verseNumber)) {
      fail(`${tanzilId}: gecersiz ayet anahtari -> ${line.slice(0, 60)}`);
    }
    if (text === "") {
      fail(`${tanzilId}: ${surahNumber}:${verseNumber} bos metin`);
    }

    texts.set(`${surahNumber}:${verseNumber}`, text);
  }

  if (texts.size !== EXPECTED_VERSE_COUNT) {
    fail(`${tanzilId}: ${EXPECTED_VERSE_COUNT} ayet bekleniyordu, ${texts.size} bulundu`);
  }

  // Yanlis dosyayi yanlis yazara yazmaya karsi koruma
  const declaredId = meta["ID"];
  if (declaredId !== undefined && declaredId !== tanzilId) {
    fail(`${tanzilId}: dosya kendini '${declaredId}' olarak tanitiyor — kaynak karismis`);
  }

  return { texts, meta };
}

// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const report = new Report("tanzil_translations");

  const all = [...TRANSLATIONS, TRANSLITERATION];
  info(`${all.length} dosya hazirlaniyor (${TRANSLATIONS.length} meal + 1 ceviriyazi)`);

  const bodies = await fetchAllCached(
    all.map((entry) => ({ url: transUrl(entry.tanzilId), cacheName: cacheName(entry.tanzilId) })),
  );

  const parsed = new Map<string, ParsedTranslation>();
  all.forEach((entry, index) => {
    const body = bodies[index];
    if (body === undefined) fail(`${entry.tanzilId}: indirilen govde bulunamadi`);
    const result = parseTranslationFile(body, entry.tanzilId);
    parsed.set(entry.tanzilId, result);
    report.note(
      `${entry.tanzilId}: ${result.texts.size} ayet · Tanzil adi "${result.meta["Name"] ?? "?"}" ` +
        `· cevirmen "${result.meta["Translator"] ?? "?"}" · guncelleme ${result.meta["Last Update"] ?? "?"}`,
    );
  });

  info("ayrisitirma tamam, veritabanina yaziliyor");

  // --- kaynak kaydi ---
  const sourceRows: unknown[][] = [
    [
      "tanzil-translations",
      "Tanzil Ceviri Seti",
      "Tanzil Quran Translations",
      null,
      TRANSLATIONS_TERMS_URL,
      TRANSLATIONS_TERMS_URL,
      TANZIL_TRANSLATION_LICENSE,
      "Ucten fazla meal kullanildigi icin tanzil.net/trans/ geri baglantisi zorunludur. " +
        "Mealler Tanzil tarafindan lisanslanmamistir; telif cevirmen/yayinciya aittir.",
    ],
  ];

  // --- author satirlari ---
  const authorRows = TRANSLATIONS.map((entry) => {
    const meta = parsed.get(entry.tanzilId)?.meta ?? {};
    const rawName = meta["Name"] ?? "";
    const rawTranslator = meta["Translator"] ?? "";
    const lastUpdate = meta["Last Update"] ?? "?";
    return [
      entry.slug,
      entry.displayName,
      // Eser adi Tanzil tarafindan verilmiyor; uydurulmaz
      null,
      "tr",
      "tanzil",
      TANZIL_TRANSLATION_LICENSE,
      `Tanzil kaydi — Name: "${rawName}" · Translator: "${rawTranslator}" · ` +
        `Last Update: ${lastUpdate} · ID: ${entry.tanzilId}`,
      transUrl(entry.tanzilId),
      entry.priority !== null,
      entry.priority,
    ];
  });

  await withTransaction(async (client) => {
    await upsertMany(
      client,
      "source",
      ["slug", "name", "work_title", "author", "reference", "url", "license", "note"],
      sourceRows,
      ["slug"],
    );

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

    // author.id degerleri slug uzerinden okunur (id'ler kararli degil)
    const { rows: authorIds } = await client.query<{ slug: string; id: number }>(
      "SELECT slug, id FROM author WHERE slug = ANY($1)",
      [TRANSLATIONS.map((t) => t.slug)],
    );
    const idBySlug = new Map(authorIds.map((row) => [row.slug, row.id]));

    // --- translation satirlari ---
    for (const entry of TRANSLATIONS) {
      const authorId = idBySlug.get(entry.slug);
      if (authorId === undefined) fail(`author eklenemedi: ${entry.slug}`);

      const texts = parsed.get(entry.tanzilId)?.texts;
      if (texts === undefined) fail(`ayrisitirilmis metin yok: ${entry.tanzilId}`);

      const rows: unknown[][] = [];
      for (const [key, text] of texts) {
        const [surahPart, versePart] = key.split(":");
        rows.push([computeVerseId(Number(surahPart), Number(versePart)), authorId, text]);
      }

      await upsertMany(
        client,
        "translation",
        ["verse_id", "author_id", "text"],
        rows,
        ["verse_id", "author_id"],
      );
    }

    // --- ceviriyazi: verse.transcription_tr ---
    const transliteration = parsed.get(TRANSLITERATION.tanzilId)?.texts;
    if (transliteration === undefined) fail("ceviriyazi ayrisitirilamadi");

    const transRows: unknown[][] = [];
    for (const [key, text] of transliteration) {
      const [surahPart, versePart] = key.split(":");
      transRows.push([computeVerseId(Number(surahPart), Number(versePart)), text]);
    }

    // Gecici tablo uzerinden toplu guncelleme — 6236 tek tek UPDATE'ten hizli.
    // upsertMany ON CONFLICT kullandigi icin verse_id birincil anahtar olmali.
    await client.query(
      `CREATE TEMP TABLE tmp_transcription (
         verse_id integer PRIMARY KEY,
         text     text NOT NULL
       ) ON COMMIT DROP`,
    );
    await upsertMany(
      client,
      "tmp_transcription",
      ["verse_id", "text"],
      transRows,
      ["verse_id"],
    );
    const updated = await client.query(
      `UPDATE verse v SET transcription_tr = t.text
         FROM tmp_transcription t
        WHERE t.verse_id = v.id
          AND (v.transcription_tr IS DISTINCT FROM t.text)`,
    );
    info(`verse.transcription_tr: ${(updated.rowCount ?? 0).toLocaleString("tr-TR")} satir guncellendi`);
  });

  // --- dogrulama ---
  const { rows } = await withTransaction((client) =>
    client
      .query<{ authors: string; translations: string; with_transcription: string; missing: string }>(
        `SELECT (SELECT count(*) FROM author WHERE source = 'tanzil')          AS authors,
                (SELECT count(*) FROM translation)                            AS translations,
                (SELECT count(*) FROM verse WHERE transcription_tr IS NOT NULL) AS with_transcription,
                (SELECT count(*) FROM verse v WHERE NOT EXISTS (
                   SELECT 1 FROM translation t WHERE t.verse_id = v.id))       AS missing`,
      )
      .then((r) => r),
  );
  const summary = rows[0];
  if (summary === undefined) fail("dogrulama sorgusu bos dondu");

  const expectedTranslations = TRANSLATIONS.length * EXPECTED_VERSE_COUNT;
  info(
    `veritabani: ${summary.authors} yazar, ${summary.translations} meal satiri, ` +
      `${summary.with_transcription} ayette ceviriyazi`,
  );

  if (Number(summary.translations) !== expectedTranslations) {
    fail(`${expectedTranslations} meal satiri bekleniyordu, ${summary.translations} bulundu`);
  }
  if (Number(summary.with_transcription) !== EXPECTED_VERSE_COUNT) {
    fail(`${EXPECTED_VERSE_COUNT} ayette ceviriyazi bekleniyordu, ${summary.with_transcription} bulundu`);
  }
  if (summary.missing !== "0") {
    fail(`${summary.missing} ayette hic meal yok`);
  }

  report.note(`Yazar: ${summary.authors}, meal satiri: ${summary.translations}`);
  report.note(`ZORUNLU: arayuzde ${TRANSLATIONS_TERMS_URL} geri baglantisi gosterilmelidir.`);
  report.note("Dipnot (footnote) verisi Tanzil ceviri setinde yok; ayri kaynak gerekiyor.");

  info(`rapor: ${report.write()}`);
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    await closePool();
    fail(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  });
