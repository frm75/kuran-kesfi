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
 *
 * Tek dosyada sure + tum mealler tutulunca Bakara 1179 KB oluyordu; plan 20.4
 * ilk yukleme butcesi < 200 KB.
 *
 * Kok, kissa, kavram ve ilke ciktilari ilgili import'lar tamamlandikca eklenir.
 */

import type {
  StaticSurah,
  StaticSurahMeta,
  StaticSurahTranslation,
  StaticVerse,
  StaticVerseDetail,
} from "@kuran/schema";
import {
  staticAuthorsIndex,
  staticSources,
  staticSurah,
  staticSurahTranslation,
  staticSurahsIndex,
  staticVerseDetail,
} from "@kuran/schema";
import { Report, closePool, fail, info, pool } from "@kuran/pipeline";
import { Emitter, dataRoot } from "./lib/emit.js";

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

  const sources = (
    await pool.query<SourceRow>(
      `SELECT slug, name, work_title, author, reference, url, license, note
         FROM source
        ORDER BY slug`,
    )
  ).rows;

  info(
    `okundu: ${surahs.length} sure, ${verses.length} ayet, ${authors.length} yazar, ` +
      `${translations.length} meal satiri, ${sources.length} kaynak`,
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

  if (usedSources.has("acikkuran")) {
    attributionLinks.push({
      label: "Mealler, dipnotlar, kelime ve kök verisi: Açık Kuran (CC BY-NC-SA 4.0)",
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
