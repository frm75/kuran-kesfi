/**
 * Statik JSON uretimi — PostgreSQL -> apps/web/public/data/*.json
 *
 * Uretimde veritabani yoktur; site yalnizca bu dosyalarla calisir (plan 6).
 * Tekrarlanabilirdir: ayni veritabani ayni baytlari uretir (plan 20.1).
 *
 * Calistirma:  pnpm --filter @kuran/build data
 *
 * Uc katmanli duzen (bkz. @kuran/schema static_data.ts):
 *   surahs_index.json                        114 sure ust bilgisi + toplamlar
 *   authors_index.json                       meal listesi + zorunlu atif baglantilari
 *   surah/surah_{id}.json                    CEKIRDEK: Arapca + ceviriyazi
 *   translation/{yazar}/surah_{id}.json      TEK MEAL
 *   verse/verse_{s}_{v}.json                 TEK AYET + tum mealler
 *   sources.json                             Kaynak Seffafligi
 *   word/verse_{s}_{v}.json                  AYETIN KELIMELERI (kok baglantili)
 *   root/{arapca}.json                       BIR KOK + tum gecisleri
 *   roots_index.json                         kok listesi
 *
 * Tek dosyada sure + tum mealler tutulunca Bakara 1179 KB oluyordu; plan 20.4
 * ilk yukleme butcesi < 200 KB.
 *
 *   stories_index.json · story/story_<slug>.json     KISSALAR (ayet metni tasimaz)
 *   locations.json                                   KONUMLAR
 *   timeline.json                                    SIYER OLAYLARI
 *   principles_index.json · principle/principle_<slug>.json   ILKELER
 *   concepts_index.json · concept/concept_<slug>.json         KAVRAMLAR
 *   verse_links.json                                 ayet -> icerik ters dizini
 *   scripture.json                                   Kitab-i Mukaddes atiflari (kunye + alinti)
 *
 * Icerik katmani lib/content.ts icinde; tablolar bossa hic dosya yazmaz.
 */

import type {
  StaticRoot,
  StaticRootOccurrence,
  StaticSurah,
  StaticSurahMeta,
  StaticSurahTranslation,
  StaticVerse,
  StaticVerseDetail,
  StaticVerseWords,
  StaticWord,
} from "@kuran/schema";
import {
  staticAuthorsIndex,
  staticRoot,
  staticRootsIndex,
  staticSources,
  scriptureBooksFile,
  scriptureQuotesFile,
  staticScripture,
  staticSurah,
  staticSurahTranslation,
  staticSurahsIndex,
  staticVerseDetail,
  staticVerseWords,
} from "@kuran/schema";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Report, closePool, fail, info, pool, repoRoot, stripSourceHtml } from "@kuran/pipeline";
import { Emitter, dataRoot } from "./lib/emit.js";
import { emitContent } from "./lib/content.js";

interface SurahRow {
  id: number;
  slug: string;
  name_tr: string;
  name_ar: string;
  name_en: string;
  verse_count: number;
  revelation_type: "mekki" | "medeni";
  revelation_order_standard: number;
  revelation_order_noldeke: number | null;
  page_start: number;
}

interface VerseRow {
  id: number;
  surah_id: number;
  verse_number: number;
  text_uthmani: string;
  transcription_tr: string | null;
  page: number;
  juz: number;
  sajda: boolean;
}

interface AuthorRow {
  slug: string;
  name: string;
  work_title: string | null;
  language: string;
  source: string;
  license: string;
  license_note: string | null;
  url: string | null;
  is_default: boolean;
  priority: number | null;
}

interface TranslationRow {
  verse_id: number;
  author_slug: string;
  author_name: string;
  text: string;
  footnotes: { number: number; text: string }[] | null;
}

interface WordRow {
  verse_id: number;
  sort_number: number;
  arabic: string;
  transcription_tr: string | null;
  translation_tr: string | null;
  root_arabic: string | null;
  root_latin: string | null;
}

interface RootRow {
  arabic: string;
  latin: string;
  meaning_tr: string | null;
}

interface SourceRow {
  slug: string;
  name: string;
  work_title: string | null;
  author: string | null;
  reference: string | null;
  url: string | null;
  license: string;
  note: string | null;
}

function toMeta(row: SurahRow): StaticSurahMeta {
  return {
    id: row.id,
    slug: row.slug,
    nameTr: row.name_tr,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    verseCount: row.verse_count,
    revelationType: row.revelation_type,
    revelationOrderStandard: row.revelation_order_standard,
    revelationOrderNoldeke: row.revelation_order_noldeke,
    pageStart: row.page_start,
  };
}

/**
 * scripture.json — meal dipnotlarindaki Kitab-i Mukaddes atiflari.
 *
 * PostgreSQL'den GECMEZ, `data/scripture/` altindan dogrudan okunur. Sebep:
 * bu iki dosyanin hicbir tabloyla iliskisi yok — biri kitap ADLARI sozlugu,
 * digeri `pnpm data:scripture` ile uretilen alinti listesi. Iliskisiz bir sozluk
 * icin tablo acmak, migration yazmak ve import adimi eklemek hicbir sey
 * kazandirmazdi.
 *
 * Alinti sinirini burada BIR KEZ DAHA dogruluyoruz (semada `text` en fazla 200
 * karakter): telifli metin yayina cikmadan once son kapi burasi. Sinir asilirsa
 * build durur — sessizce gecmez (data/scripture/LICENSE.md).
 */
function emitScripture(emitter: Emitter, report: Report): void {
  const scriptureDir = resolve(repoRoot, "data/scripture");
  const booksParsed = scriptureBooksFile.safeParse(
    JSON.parse(readFileSync(resolve(scriptureDir, "books.json"), "utf8")),
  );
  if (!booksParsed.success) {
    fail(`data/scripture/books.json sema dogrulamasi basarisiz:\n${booksParsed.error.message}`);
  }
  const quotesParsed = scriptureQuotesFile.safeParse(
    JSON.parse(readFileSync(resolve(scriptureDir, "quotes.json"), "utf8")),
  );
  if (!quotesParsed.success) {
    fail(`data/scripture/quotes.json sema dogrulamasi basarisiz:\n${quotesParsed.error.message}`);
  }

  const payload = {
    source: quotesParsed.data.source,
    books: booksParsed.data.books,
    quotes: quotesParsed.data.quotes,
  };
  const parsed = staticScripture.safeParse(payload);
  if (!parsed.success) {
    fail(`scripture.json sema dogrulamasi basarisiz:\n${parsed.error.message}`);
  }
  emitter.write("scripture.json", payload);

  const longest = payload.quotes.reduce((max, quote) => Math.max(max, quote.text.length), 0);
  info(
    `kitab-i mukaddes: ${String(payload.books.length)} kitap, ` +
      `${String(payload.quotes.length)} alinti (en uzun ${String(longest)} karakter)`,
  );
  report.note(
    `Kitab-i Mukaddes alintisi: ${String(payload.quotes.length)} ayet, ` +
      `en uzun ${String(longest)}/${String(payload.source.quoteLimit)} karakter — ` +
      "telifli metin, iktibas (data/scripture/LICENSE.md)",
  );
}

async function main(): Promise<void> {
  const report = new Report("build");
  const emitter = new Emitter();

  info("veritabanindan okunuyor");

  const surahs = (
    await pool.query<SurahRow>(
      `SELECT id, slug, name_tr, name_ar, name_en, verse_count, revelation_type,
              revelation_order_standard, revelation_order_noldeke, page_start
         FROM surah
        ORDER BY id`,
    )
  ).rows;

  if (surahs.length === 0) {
    fail("surah tablosu bos — once 'pnpm import' calistirin");
  }

  // text_simple ve text_no_vowel bilerek okunmuyor: yalnizca arama indeksi
  // girdisidir, okuma ekraninda kullanilmaz (bkz. static_data.ts).
  const verses = (
    await pool.query<VerseRow>(
      `SELECT id, surah_id, verse_number, text_uthmani,
              transcription_tr, page, juz, sajda
         FROM verse
        ORDER BY id`,
    )
  ).rows;

  const authors = (
    await pool.query<AuthorRow>(
      `SELECT slug, name, work_title, language, source, license, license_note, url,
              is_default, priority
         FROM author
        ORDER BY priority NULLS LAST, language, slug`,
    )
  ).rows;

  // Mealler; henuz import edilmediyse bos doner
  const translations = (
    await pool.query<TranslationRow>(
      `SELECT t.verse_id,
              a.slug AS author_slug,
              a.name AS author_name,
              t.text,
              COALESCE(
                (SELECT json_agg(json_build_object('number', f.number, 'text', f.text)
                                 ORDER BY f.number)
                   FROM footnote f
                  WHERE f.translation_id = t.id),
                '[]'::json
              ) AS footnotes
         FROM translation t
         JOIN author a ON a.id = t.author_id
        ORDER BY t.verse_id, a.priority NULLS LAST, a.slug`,
    )
  ).rows;

  // Kelime kelime veri — plan 2 "Kelime" kapisi.
  // Kok atanmamis kelimeler de okunur (harf-i cer, zamir): kelime dizisinde
  // bosluk olmasin, ayet eksiksiz gorunsun.
  const words = (
    await pool.query<WordRow>(
      `SELECT vp.verse_id, vp.sort_number, vp.arabic,
              vp.transcription_tr, vp.translation_tr,
              r.arabic AS root_arabic, r.latin AS root_latin
         FROM verse_part vp
         LEFT JOIN root r ON r.id = vp.root_id
        ORDER BY vp.verse_id, vp.sort_number`,
    )
  ).rows;

  const roots = (
    await pool.query<RootRow>(
      `SELECT arabic, latin, meaning_tr FROM root ORDER BY arabic`,
    )
  ).rows;

  const sources = (
    await pool.query<SourceRow>(
      `SELECT slug, name, work_title, author, reference, url, license, note
         FROM source
        ORDER BY slug`,
    )
  ).rows;

  info(
    `okundu: ${surahs.length} sure, ${verses.length} ayet, ${authors.length} yazar, ` +
      `${translations.length} meal satiri, ${sources.length} kaynak, ` +
      `${words.length} kelime, ${roots.length} kok`,
  );

  // --- ayetleri sureye gore grupla ---
  const versesBySurah = new Map<number, VerseRow[]>();
  for (const verse of verses) {
    const bucket = versesBySurah.get(verse.surah_id);
    if (bucket === undefined) {
      versesBySurah.set(verse.surah_id, [verse]);
    } else {
      bucket.push(verse);
    }
  }

  const wordsByVerse = new Map<number, WordRow[]>();
  for (const row of words) {
    const bucket = wordsByVerse.get(row.verse_id);
    if (bucket === undefined) wordsByVerse.set(row.verse_id, [row]);
    else bucket.push(row);
  }

  const translationsByVerse = new Map<number, TranslationRow[]>();
  for (const row of translations) {
    const bucket = translationsByVerse.get(row.verse_id);
    if (bucket === undefined) {
      translationsByVerse.set(row.verse_id, [row]);
    } else {
      bucket.push(row);
    }
  }

  // --- yaz ---
  info(`cikti dizini temizleniyor: ${dataRoot}`);
  emitter.reset();

  const metas: StaticSurahMeta[] = [];
  /** yazar slug -> kaynakta eksik olan sureler ve ayet sayisi */
  const authorGaps = new Map<string, { surahs: number[]; verses: number }>();
  /** Kelime verisi olmayan ayet sayisi — sessizce gecilmez, rapora yazilir */
  let versesWithoutWords = 0;

  for (const row of surahs) {
    const meta = toMeta(row);
    metas.push(meta);

    const surahVerses = versesBySurah.get(row.id) ?? [];
    if (surahVerses.length !== row.verse_count) {
      fail(
        `sure ${row.id}: verse_count ${row.verse_count} ama ${surahVerses.length} ayet bulundu`,
      );
    }

    // --- 1. katman: cekirdek (Arapca + ceviriyazi, meal yok) ---
    const staticVerses: StaticVerse[] = surahVerses.map((verse) => ({
      id: verse.id,
      verseNumber: verse.verse_number,
      textUthmani: verse.text_uthmani,
      transcriptionTr: verse.transcription_tr,
      page: verse.page,
      juz: verse.juz,
      sajda: verse.sajda,
    }));

    const payload: StaticSurah = { ...meta, verses: staticVerses };

    // Yazmadan once dogrula — hatali cikti diske inmez
    const parsed = staticSurah.safeParse(payload);
    if (!parsed.success) {
      fail(`sure ${row.id} sema dogrulamasi basarisiz:\n${parsed.error.message}`);
    }
    emitter.write(`surah/surah_${row.id}.json`, payload);

    // --- 2. katman: yazar basina meal dosyasi ---
    for (const author of authors) {
      const authorVerses = surahVerses
        .map((verse) => {
          const match = (translationsByVerse.get(verse.id) ?? []).find(
            (t) => t.author_slug === author.slug,
          );
          if (match === undefined) return null;
          return {
            verseNumber: verse.verse_number,
            text: match.text,
            footnotes: match.footnotes ?? [],
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      // Kaynak taraflı boşluklar sessizce atlanmaz: eksik sureler
      // authors_index.json'a yazilir, eksik ayetler rapora gecer (plan 1.5, 20.1)
      const missing = surahVerses.length - authorVerses.length;
      if (missing > 0) {
        const gap = authorGaps.get(author.slug) ?? { surahs: [], verses: 0 };
        gap.verses += missing;
        if (authorVerses.length === 0) gap.surahs.push(row.id);
        authorGaps.set(author.slug, gap);
        report.note(
          `${author.slug} / sure ${row.id}: ${surahVerses.length} ayetin ` +
            `${authorVerses.length} tanesinde meal var`,
        );
      }
      if (authorVerses.length === 0) continue;

      const translationPayload: StaticSurahTranslation = {
        surahId: row.id,
        authorSlug: author.slug,
        authorName: author.name,
        verses: authorVerses,
      };
      const translationParsed = staticSurahTranslation.safeParse(translationPayload);
      if (!translationParsed.success) {
        fail(
          `${author.slug} / sure ${row.id} sema dogrulamasi basarisiz:\n` +
            translationParsed.error.message,
        );
      }
      emitter.write(`translation/${author.slug}/surah_${row.id}.json`, translationPayload);
    }

    // --- 3. katman: ayet basina dosya (tum mealler) ---
    for (const verse of surahVerses) {
      const detail: StaticVerseDetail = {
        id: verse.id,
        verseNumber: verse.verse_number,
        textUthmani: verse.text_uthmani,
        transcriptionTr: verse.transcription_tr,
        page: verse.page,
        juz: verse.juz,
        sajda: verse.sajda,
        surahId: row.id,
        surahSlug: meta.slug,
        surahNameTr: meta.nameTr,
        translations: (translationsByVerse.get(verse.id) ?? []).map((t) => ({
          authorSlug: t.author_slug,
          authorName: t.author_name,
          text: t.text,
          footnotes: t.footnotes ?? [],
        })),
      };
      const detailParsed = staticVerseDetail.safeParse(detail);
      if (!detailParsed.success) {
        fail(
          `ayet ${row.id}:${verse.verse_number} sema dogrulamasi basarisiz:\n` +
            detailParsed.error.message,
        );
      }
      emitter.write(`verse/verse_${row.id}_${verse.verse_number}.json`, detail);

      // --- 4. katman: kelime kelime ---
      const verseWords = wordsByVerse.get(verse.id) ?? [];
      if (verseWords.length > 0) {
        const wordPayload: StaticVerseWords = {
          surahId: row.id,
          verseNumber: verse.verse_number,
          words: verseWords.map<StaticWord>((word) => ({
            position: word.sort_number,
            arabic: word.arabic,
            transcriptionTr: word.transcription_tr,
            translationTr: word.translation_tr,
            rootArabic: word.root_arabic,
            rootLatin: word.root_latin,
          })),
        };
        const wordParsed = staticVerseWords.safeParse(wordPayload);
        if (!wordParsed.success) {
          fail(
            `ayet ${row.id}:${verse.verse_number} kelime semasi basarisiz:\n` +
              wordParsed.error.message,
          );
        }
        emitter.write(`word/verse_${row.id}_${verse.verse_number}.json`, wordPayload);
      } else {
        versesWithoutWords += 1;
      }
    }
  }

  const indexPayload = {
    surahs: metas,
    totals: {
      surahs: surahs.length,
      verses: verses.length,
      pages: Math.max(...verses.map((v) => v.page)),
      juzs: Math.max(...verses.map((v) => v.juz)),
    },
  };
  const indexParsed = staticSurahsIndex.safeParse(indexPayload);
  if (!indexParsed.success) {
    fail(`surahs_index.json sema dogrulamasi basarisiz:\n${indexParsed.error.message}`);
  }
  emitter.write("surahs_index.json", indexPayload);

  // --- meal listesi + zorunlu atif baglantilari ---
  //
  // Her kaynagin atif yukumlulugu veriyle birlikte tasinir ki arayuz tarafinda
  // unutulmasin (bkz. data/LICENSE). Hangi baglantinin zorunlu oldugu, gercekte
  // hangi kaynaktan meal alindigina gore belirlenir — sabit yazilmaz.
  const usedSources = new Set(authors.map((a) => a.source));

  // Arapca metin her zaman Tanzil'den gelir (plan 20.1 tek gercek kaynak)
  const attributionLinks = [
    { label: "Arapça metin: Tanzil Project", url: "https://tanzil.net" },
  ];

  /*
   * 2026-09-06 (kullanici karari): "kaynaklar sadece hocalarin meallerine atif
   * yapilacak". MEAL bir platformun degil, onu yapan yazarin eseridir —
   * "Mehmet Okuyan meali" gibi. Meal atfi bu yuzden yazar adiyla verilir:
   * her mealin ustundeki yazar adi ve /kaynaklar sayfasindaki meal listesi.
   *
   * Bu satirdan "Mealler" CIKARILDI. Acik Kuran yalnizca GERCEKTEN kendi
   * derlemesi olan veriyle kaliyor: dipnotlar, kelime ve kok verisi. Onlar
   * meal degil, veri kumesidir ve CC BY-NC-SA atfi onlar icin gecerlidir.
   * Tamamen kaldirilmasi istenirse kelime/kok verisinin atfi da kalkar —
   * o ayri bir karar.
   */
  if (usedSources.has("acikkuran")) {
    attributionLinks.push({
      label: "Dipnot, kelime ve kök verisi: Açık Kuran (CC BY-NC-SA 4.0)",
      url: "https://acikkuran.com",
    });
  }
  if (usedSources.has("tanzil")) {
    // Tanzil sarti: ucten fazla ceviri kullanilirsa geri baglanti zorunlu
    attributionLinks.push({
      label: "Türkçe mealler: Tanzil çeviri seti",
      url: "https://tanzil.net/trans/",
    });
  }
  if (usedSources.has("quran.com")) {
    attributionLinks.push({ label: "Sure adları: Quran.com", url: "https://quran.com" });
  }
  /*
   * QuranEnc satiri KALDIRILDI (kullanici karari 2026-09-06): oradan gelen uc
   * kayit da meal, yani yazarlarinin eseri. Atiflari yazar adiyla veriliyor
   * (Rowwad Tercume Merkezi, Saban Britch, Ali Ozek ve heyeti) — her mealin
   * ustunde ve /kaynaklar meal listesinde. Meali hangi sitede bulduğumuz
   * eserin sahibi degildir.
   *
   * QuranEnc surum numarasi meal bazinda author.license_note icinde durmaya
   * devam eder ve /kaynaklar meal tablosunda gorunur.
   */

  // Ceviriyazi bir meal degil; author tablosunda kaydi yok, bu yuzden
  // usedSources'ta gorunmez. Atif yukumlulugu yine de var: hazirlayanin adi
  // source tablosundan OKUNUR, sabit yazilmaz.
  const transcriptionCount = verses.filter((v) => v.transcription_tr !== null).length;
  if (transcriptionCount > 0) {
    const transcriptionSource = sources.find((s) => s.slug === "tanzil-transliteration");
    if (transcriptionSource === undefined) {
      fail(
        `${transcriptionCount} ayette ceviriyazi var ama 'tanzil-transliteration' kaynak kaydi yok. ` +
          "Kaynaksiz icerik yayinlanmaz (plan 12.10).",
      );
    }
    attributionLinks.push({
      label: `Çeviriyazı: ${transcriptionSource.author ?? transcriptionSource.name} (Tanzil)`,
      url: transcriptionSource.url ?? "https://tanzil.net/trans/",
    });
  }

  info(
    `${authors.length} meal, kaynaklar: ${[...usedSources].join(", ")} — ` +
      `${attributionLinks.length} zorunlu atif baglantisi`,
  );

  const authorsPayload = {
    authors: authors.map((a) => ({
      slug: a.slug,
      name: a.name,
      workTitle: a.work_title,
      language: a.language,
      source: a.source,
      license: a.license,
      licenseNote: a.license_note,
      url: a.url,
      isDefault: a.is_default,
      priority: a.priority,
      missingSurahs: (authorGaps.get(a.slug)?.surahs ?? []).slice().sort((x, y) => x - y),
      missingVerseCount: authorGaps.get(a.slug)?.verses ?? 0,
    })),
    requiredAttributionLinks: attributionLinks,
  };
  const authorsParsed = staticAuthorsIndex.safeParse(authorsPayload);
  if (!authorsParsed.success) {
    fail(`authors_index.json sema dogrulamasi basarisiz:\n${authorsParsed.error.message}`);
  }
  emitter.write("authors_index.json", authorsPayload);

  // --- kokler ---
  //
  // Kok adresleri Arapca harflerle kuruluyor (/kok/قول). Latin cevriyazi
  // buyuk-kucuk harf anlamli (S=ص, s=س) ve kucultuldugunde 1641 kokten
  // 141'i cakisiyor; adres olarak kullanilamaz. Arapca kok ise veritabaninda
  // UNIQUE.
  const surahById = new Map(metas.map((m) => [m.id, m]));
  const occurrencesByRoot = new Map<string, StaticRootOccurrence[]>();
  for (const word of words) {
    if (word.root_arabic === null) continue;
    const surahId = Math.floor(word.verse_id / 1000);
    const verseNumber = word.verse_id % 1000;
    const meta = surahById.get(surahId);
    if (meta === undefined) {
      fail(`kelime ${word.verse_id}:${word.sort_number} bilinmeyen sureye bagli (${surahId})`);
    }
    const bucket = occurrencesByRoot.get(word.root_arabic) ?? [];
    bucket.push({
      surahId,
      surahSlug: meta.slug,
      surahNameTr: meta.nameTr,
      verseNumber,
      position: word.sort_number,
      arabic: word.arabic,
      transcriptionTr: word.transcription_tr,
      translationTr: word.translation_tr,
    });
    occurrencesByRoot.set(word.root_arabic, bucket);
  }

  const rootsIndexEntries: {
    arabic: string;
    latin: string;
    meaningSummary: string | null;
    occurrenceCount: number;
  }[] = [];
  const unknownHtmlTags = new Set<string>();
  let rootsWithoutOccurrence = 0;

  for (const root of roots) {
    let meaning: string | null = null;
    if (root.meaning_tr !== null) {
      const stripped = stripSourceHtml(root.meaning_tr);
      for (const tag of stripped.unknownTags) unknownHtmlTags.add(tag);
      meaning = stripped.text === "" ? null : stripped.text;
    }

    const occurrences = occurrencesByRoot.get(root.arabic) ?? [];
    if (occurrences.length === 0) rootsWithoutOccurrence += 1;

    const rootPayload: StaticRoot = {
      arabic: root.arabic,
      latin: root.latin,
      meaningTr: meaning,
      occurrenceCount: occurrences.length,
      occurrences,
    };
    const rootParsed = staticRoot.safeParse(rootPayload);
    if (!rootParsed.success) {
      fail(`kok ${root.arabic} sema dogrulamasi basarisiz:\n${rootParsed.error.message}`);
    }
    emitter.write(`root/${root.arabic}.json`, rootPayload);

    rootsIndexEntries.push({
      arabic: root.arabic,
      latin: root.latin,
      // Ilk cumle ozet; tam metin kok dosyasinda. Nokta yoksa ilk satir.
      // 80 karakter: kok listesi 1641 kart tasiyor, 160 karakterle sayfa
      // 543 KB / 97 KB gzip oluyordu (olculdu).
      meaningSummary:
        meaning === null
          ? null
          : ((meaning.split("\n")[0] ?? meaning).split(/(?<=[.;])\s/)[0] ?? "")
              .slice(0, 80)
              .trim() || null,
      occurrenceCount: occurrences.length,
    });
  }

  const rootsIndexPayload = {
    roots: rootsIndexEntries.sort((a, b) => b.occurrenceCount - a.occurrenceCount),
    totals: {
      roots: roots.length,
      words: words.length,
      wordsWithRoot: words.filter((w) => w.root_arabic !== null).length,
    },
  };
  const rootsIndexParsed = staticRootsIndex.safeParse(rootsIndexPayload);
  if (!rootsIndexParsed.success) {
    fail(`roots_index.json sema dogrulamasi basarisiz:\n${rootsIndexParsed.error.message}`);
  }
  emitter.write("roots_index.json", rootsIndexPayload);

  if (unknownHtmlTags.size > 0) {
    report.issue(
      `kok anlamlarinda tanimlanmayan HTML etiketi: ${[...unknownHtmlTags].join(", ")} ` +
        "— duz metne cevrilmedi, oldugu gibi birakildi",
    );
  }
  if (rootsWithoutOccurrence > 0) {
    report.note(`Hicbir kelimeye baglanmayan kok: ${rootsWithoutOccurrence}`);
  }
  if (versesWithoutWords > 0) {
    report.note(`Kelime verisi olmayan ayet: ${versesWithoutWords}`);
  }
  info(
    `kok: ${roots.length} dosya, ${rootsIndexPayload.totals.wordsWithRoot} kelime koke bagli ` +
      `(${words.length} kelimenin %${((rootsIndexPayload.totals.wordsWithRoot / words.length) * 100).toFixed(0)}'i)`,
  );

  // --- icerik katmani: kissa, konum, kavram, ilke, zaman cizelgesi ---
  await emitContent(emitter, metas, report);

  const sourcesPayload = {
    sources: sources.map((s) => ({
      slug: s.slug,
      name: s.name,
      workTitle: s.work_title,
      author: s.author,
      reference: s.reference,
      url: s.url,
      license: s.license,
      note: s.note,
    })),
  };
  const sourcesParsed = staticSources.safeParse(sourcesPayload);
  if (!sourcesParsed.success) {
    fail(`sources.json sema dogrulamasi basarisiz:\n${sourcesParsed.error.message}`);
  }
  emitter.write("sources.json", sourcesPayload);

  emitScripture(emitter, report);

  const { files, bytes } = emitter.stats;
  info(
    `yazildi: ${files} dosya, ${(bytes / 1024 / 1024).toFixed(2)} MB ` +
      `(parmak izi ${emitter.fingerprint()})`,
  );

  report.note(`Dosya sayisi: ${files}`);
  report.note(`Toplam boyut: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  report.note(`Sure: ${surahs.length}, ayet: ${verses.length}`);
  if (translations.length === 0) {
    report.note("Meal verisi yok — translations alanlari bos dizi olarak uretildi.");
  }
  const withoutTranscription = verses.filter((v) => v.transcription_tr === null).length;
  if (withoutTranscription > 0) {
    report.note(`Transkripsiyonu olmayan ayet: ${withoutTranscription}`);
  }

  info(`rapor: ${report.write()}`);
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    await closePool();
    fail(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  });
