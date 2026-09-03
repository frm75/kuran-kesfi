/**
 * Tanzil import — surah ve verse tablolarini doldurur.
 *
 * Tanzil TEK GERCEK KAYNAKTIR (plan 20.1): sure/ayet numaralandirmasi,
 * Arapca metin, sayfa, cuz ve nuzul sirasi buradan gelir. Diger butun tablolar
 * verse_id ile buraya baglanir.
 *
 * Turkce sure adlari Tanzil metadata'sinda yoktur; Quran.com API'sinden
 * (chapters?language=tr) alinir ve kaynak olarak kaydedilir.
 *
 * Idempotenttir: tekrar calistirmak ayni sonucu verir (upsert).
 * Kaynaklar tek seferlik cekilip cache/ altina alinir; ikinci calistirma
 * agdan veri cekmez.
 *
 * Calistirma:  pnpm --filter @kuran/import tanzil
 */

import { XMLParser } from "fast-xml-parser";
import { computeVerseId } from "@kuran/schema";
import {
  Report,
  closePool,
  fail,
  fetchCached,
  info,
  surahSlug,
  upsertMany,
  withTransaction,
} from "@kuran/pipeline";

// -----------------------------------------------------------------------------
// Kaynak adresleri
// -----------------------------------------------------------------------------

const TANZIL_METADATA_URL = "https://tanzil.net/res/text/metadata/quran-data.xml";
const tanzilTextUrl = (type: string): string =>
  `https://tanzil.net/pub/download/index.php?quranType=${type}&outType=xml&agree=true`;
const QURAN_COM_CHAPTERS_TR_URL = "https://api.quran.com/api/v4/chapters?language=tr";

/** Beklenen toplamlar — sapma olursa import durur. */
const EXPECTED_SURAH_COUNT = 114;
const EXPECTED_VERSE_COUNT = 6236;
const EXPECTED_PAGE_COUNT = 604;
const EXPECTED_JUZ_COUNT = 30;

// -----------------------------------------------------------------------------
// XML ayrisitirma
// -----------------------------------------------------------------------------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  trimValues: false,
});

/** fast-xml-parser tek ogeyi dizi yapmaz; her zaman dizi dondurur. */
function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

interface TanzilSuraMeta {
  index: string;
  ayas: string;
  start: string;
  name: string;
  tname: string;
  ename: string;
  type: string;
  order: string;
  rukus: string;
}

interface TanzilBoundary {
  index: string;
  sura: string;
  aya: string;
}

interface TanzilSajda extends TanzilBoundary {
  type: string;
}

interface TanzilMetadata {
  suras: TanzilSuraMeta[];
  pages: TanzilBoundary[];
  juzs: TanzilBoundary[];
  sajdas: TanzilSajda[];
}

function parseMetadata(xml: string): TanzilMetadata {
  const doc = parser.parse(xml) as {
    quran?: {
      suras?: { sura?: TanzilSuraMeta | TanzilSuraMeta[] };
      pages?: { page?: TanzilBoundary | TanzilBoundary[] };
      juzs?: { juz?: TanzilBoundary | TanzilBoundary[] };
      sajdas?: { sajda?: TanzilSajda | TanzilSajda[] };
    };
  };
  const quran = doc.quran;
  if (quran === undefined) fail("Tanzil metadata: <quran> kok ogesi bulunamadi");

  return {
    suras: asArray(quran.suras?.sura),
    pages: asArray(quran.pages?.page),
    juzs: asArray(quran.juzs?.juz),
    sajdas: asArray(quran.sajdas?.sajda),
  };
}

interface TanzilAya {
  index: string;
  text: string;
}

interface TanzilSuraText {
  index: string;
  aya?: TanzilAya | TanzilAya[];
}

/** Metin XML'ini "surah:verse -> metin" haritasina cevirir. */
function parseText(xml: string, label: string): Map<string, string> {
  const doc = parser.parse(xml) as {
    quran?: { sura?: TanzilSuraText | TanzilSuraText[] };
  };
  const suras = asArray(doc.quran?.sura);
  if (suras.length !== EXPECTED_SURAH_COUNT) {
    fail(`${label}: ${EXPECTED_SURAH_COUNT} sure bekleniyordu, ${suras.length} bulundu`);
  }

  const texts = new Map<string, string>();
  for (const sura of suras) {
    for (const aya of asArray(sura.aya)) {
      const text = aya.text.trim();
      if (text === "") {
        fail(`${label}: ${sura.index}:${aya.index} bos metin`);
      }
      texts.set(`${sura.index}:${aya.index}`, text);
    }
  }

  if (texts.size !== EXPECTED_VERSE_COUNT) {
    fail(`${label}: ${EXPECTED_VERSE_COUNT} ayet bekleniyordu, ${texts.size} bulundu`);
  }
  return texts;
}

// -----------------------------------------------------------------------------
// Sayfa ve cuz atamasi
// -----------------------------------------------------------------------------

/**
 * Sinir listesini (her sayfanin/cuzun ilk ayeti) ayet basina numaraya cevirir.
 *
 * Hem ayetler hem sinirlar mushaf sirasindadir; tek gecisli ilerleme yeterli.
 */
function assignBoundaries(
  orderedVerses: readonly { surahId: number; verseNumber: number }[],
  boundaries: readonly TanzilBoundary[],
  label: string,
): number[] {
  const sorted = [...boundaries].sort((a, b) => Number(a.index) - Number(b.index));
  const assigned: number[] = [];
  let cursor = 0;

  for (const verse of orderedVerses) {
    // Bir sonraki sinir bu ayette veya oncesinde basliyorsa ilerle
    while (cursor + 1 < sorted.length) {
      const next = sorted[cursor + 1];
      if (next === undefined) break;
      const nextSurah = Number(next.sura);
      const nextVerse = Number(next.aya);
      const reached =
        verse.surahId > nextSurah || (verse.surahId === nextSurah && verse.verseNumber >= nextVerse);
      if (!reached) break;
      cursor += 1;
    }
    const current = sorted[cursor];
    if (current === undefined) fail(`${label}: sinir listesi bos`);
    assigned.push(Number(current.index));
  }

  return assigned;
}

// -----------------------------------------------------------------------------
// Quran.com Turkce sure adlari
// -----------------------------------------------------------------------------

interface QuranComChapter {
  id: number;
  translated_name?: { name?: string };
}

function parseTurkishNames(json: string, report: Report): Map<number, string> {
  const data = JSON.parse(json) as { chapters?: QuranComChapter[] };
  const chapters = data.chapters ?? [];
  const names = new Map<number, string>();

  for (const chapter of chapters) {
    const name = chapter.translated_name?.name?.trim();
    if (name === undefined || name === "") {
      report.issue(`Quran.com: ${chapter.id} numarali sure icin Turkce ad yok`);
      continue;
    }
    names.set(chapter.id, name);
  }

  if (names.size !== EXPECTED_SURAH_COUNT) {
    fail(`Turkce sure adi: ${EXPECTED_SURAH_COUNT} bekleniyordu, ${names.size} bulundu`);
  }
  return names;
}

// -----------------------------------------------------------------------------
// Ana akis
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const report = new Report("tanzil");

  info("kaynaklar hazirlaniyor");
  const [metadataXml, uthmaniXml, simpleXml, cleanXml, chaptersJson] = await Promise.all([
    fetchCached(TANZIL_METADATA_URL, { cacheName: "tanzil_metadata.xml" }),
    fetchCached(tanzilTextUrl("uthmani"), { cacheName: "tanzil_uthmani.xml" }),
    fetchCached(tanzilTextUrl("simple"), { cacheName: "tanzil_simple.xml" }),
    fetchCached(tanzilTextUrl("simple-clean"), { cacheName: "tanzil_simple-clean.xml" }),
    fetchCached(QURAN_COM_CHAPTERS_TR_URL, { cacheName: "qurancom_chapters_tr.json" }),
  ]);

  const meta = parseMetadata(metadataXml);
  if (meta.suras.length !== EXPECTED_SURAH_COUNT) {
    fail(`metadata: ${EXPECTED_SURAH_COUNT} sure bekleniyordu, ${meta.suras.length} bulundu`);
  }
  if (meta.pages.length !== EXPECTED_PAGE_COUNT) {
    fail(`metadata: ${EXPECTED_PAGE_COUNT} sayfa bekleniyordu, ${meta.pages.length} bulundu`);
  }
  if (meta.juzs.length !== EXPECTED_JUZ_COUNT) {
    fail(`metadata: ${EXPECTED_JUZ_COUNT} cuz bekleniyordu, ${meta.juzs.length} bulundu`);
  }

  const uthmani = parseText(uthmaniXml, "uthmani");
  const simple = parseText(simpleXml, "simple");
  const clean = parseText(cleanXml, "simple-clean");
  const turkishNames = parseTurkishNames(chaptersJson, report);

  info(`ayrisitirildi: ${meta.suras.length} sure, ${uthmani.size} ayet`);

  // --- Ayet listesi (mushaf sirasinda) ---
  const orderedVerses: { surahId: number; verseNumber: number }[] = [];
  for (const sura of meta.suras) {
    const surahId = Number(sura.index);
    const ayaCount = Number(sura.ayas);
    for (let verseNumber = 1; verseNumber <= ayaCount; verseNumber += 1) {
      orderedVerses.push({ surahId, verseNumber });
    }
  }
  if (orderedVerses.length !== EXPECTED_VERSE_COUNT) {
    fail(`metadata ayet toplami ${orderedVerses.length}, beklenen ${EXPECTED_VERSE_COUNT}`);
  }

  const pageOf = assignBoundaries(orderedVerses, meta.pages, "sayfa");
  const juzOf = assignBoundaries(orderedVerses, meta.juzs, "cuz");

  const sajdaKeys = new Set(meta.sajdas.map((s) => `${s.sura}:${s.aya}`));
  report.note(`Secde ayeti sayisi: ${sajdaKeys.size}`);

  // --- surah satirlari ---
  const usedSlugs = new Map<string, number>();
  const surahRows: unknown[][] = [];

  for (const sura of meta.suras) {
    const surahId = Number(sura.index);
    const nameTr = turkishNames.get(surahId);
    if (nameTr === undefined) fail(`Turkce ad bulunamadi: sure ${surahId}`);

    const slug = surahSlug(nameTr);
    const previous = usedSlugs.get(slug);
    if (previous !== undefined) {
      fail(`slug cakismasi: '${slug}' hem ${previous}. hem ${surahId}. sure icin uretildi`);
    }
    usedSlugs.set(slug, surahId);

    // Surenin ilk ayetinin sayfasi
    const firstVerseIndex = orderedVerses.findIndex((v) => v.surahId === surahId);
    const pageStart = pageOf[firstVerseIndex];
    if (pageStart === undefined) fail(`sayfa bulunamadi: sure ${surahId}`);

    const revelationType = sura.type === "Meccan" ? "mekki" : "medeni";
    if (sura.type !== "Meccan" && sura.type !== "Medinan") {
      report.issue(`sure ${surahId}: beklenmeyen tur '${sura.type}', 'medeni' varsayildi`);
    }

    surahRows.push([
      surahId,
      nameTr,
      sura.name.trim(),
      sura.ename.trim(),
      slug,
      Number(sura.ayas),
      revelationType,
      Number(sura.order),
      // Noldeke siralamasi Tanzil'de yok; alternatif siralama ayrica eklenecek
      null,
      pageStart,
    ]);
  }

  // --- verse satirlari ---
  const verseRows: unknown[][] = [];
  for (const [index, verse] of orderedVerses.entries()) {
    const key = `${verse.surahId}:${verse.verseNumber}`;
    const textUthmani = uthmani.get(key);
    const textSimple = simple.get(key);
    const textNoVowel = clean.get(key);
    if (textUthmani === undefined || textSimple === undefined || textNoVowel === undefined) {
      fail(`metin eksik: ${key}`);
    }

    const page = pageOf[index];
    const juz = juzOf[index];
    if (page === undefined || juz === undefined) fail(`sayfa/cuz bulunamadi: ${key}`);

    verseRows.push([
      computeVerseId(verse.surahId, verse.verseNumber),
      verse.surahId,
      verse.verseNumber,
      textUthmani,
      textSimple,
      textNoVowel,
      // Transkripsiyon Tanzil'de yok; ayri kaynaktan eklenecek
      null,
      null,
      page,
      juz,
      sajdaKeys.has(key),
    ]);
  }

  // --- kaynak kayitlari (Kaynak Seffafligi sayfasi icin) ---
  const sourceRows: unknown[][] = [
    [
      "tanzil",
      "Tanzil Kur'an Metni Projesi",
      "Tanzil Quran Text",
      null,
      "quran-data.xml, uthmani / simple / simple-clean",
      "https://tanzil.net",
      "Tanzil lisansi — atif gerekli, degistirilmeden dagitim",
      "Arapca metin, sure/ayet metadata, sayfa, cuz, secde ve nuzul sirasi kaynagi.",
    ],
    [
      "quran-com",
      "Quran.com API",
      "Quran.com",
      null,
      "GET /api/v4/chapters?language=tr",
      "https://api.quran.com",
      "Quran.com kullanim sartlari",
      "Turkce sure adlari bu kaynaktan alindi; Tanzil metadata'sinda Turkce ad yoktur.",
    ],
  ];

  // --- yazma ---
  info("veritabanina yaziliyor");
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
      "surah",
      [
        "id",
        "name_tr",
        "name_ar",
        "name_en",
        "slug",
        "verse_count",
        "revelation_type",
        "revelation_order_standard",
        "revelation_order_noldeke",
        "page_start",
      ],
      surahRows,
      ["id"],
    );

    await upsertMany(
      client,
      "verse",
      [
        "id",
        "surah_id",
        "verse_number",
        "text_uthmani",
        "text_simple",
        "text_no_vowel",
        "transcription_tr",
        "transcription_en",
        "page",
        "juz",
        "sajda",
      ],
      verseRows,
      ["id"],
    );
  });

  // --- dogrulama ---
  const { rows } = await withTransaction((client) =>
    client
      .query<{ surah_count: string; verse_count: string; page_max: string; juz_max: string }>(
        `SELECT (SELECT count(*) FROM surah)          AS surah_count,
                (SELECT count(*) FROM verse)          AS verse_count,
                (SELECT max(page) FROM verse)         AS page_max,
                (SELECT max(juz)  FROM verse)         AS juz_max`,
      )
      .then((r) => r),
  );
  const summary = rows[0];
  if (summary === undefined) fail("dogrulama sorgusu bos dondu");

  info(
    `veritabani: ${summary.surah_count} sure, ${summary.verse_count} ayet, ` +
      `son sayfa ${summary.page_max}, son cuz ${summary.juz_max}`,
  );

  if (Number(summary.verse_count) !== EXPECTED_VERSE_COUNT) {
    fail(`veritabaninda ${summary.verse_count} ayet var, beklenen ${EXPECTED_VERSE_COUNT}`);
  }
  if (Number(summary.page_max) !== EXPECTED_PAGE_COUNT) {
    fail(`son sayfa ${summary.page_max}, beklenen ${EXPECTED_PAGE_COUNT}`);
  }

  report.note(`surah: ${summary.surah_count} satir`);
  report.note(`verse: ${summary.verse_count} satir`);
  report.note("Noldeke nuzul siralamasi bos birakildi — ayri kaynak gerekiyor.");
  report.note("transcription_tr / transcription_en bos birakildi — ayri kaynak gerekiyor.");

  const reportPath = report.write();
  info(`rapor: ${reportPath} (${report.issues} sorun)`);
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    await closePool();
    fail(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  });
