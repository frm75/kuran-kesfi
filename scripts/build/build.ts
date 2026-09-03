/**
 * Statik JSON uretimi — PostgreSQL -> apps/web/public/data/*.json
 *
 * Uretimde veritabani yoktur; site yalnizca bu dosyalarla calisir (plan 6).
 * Tekrarlanabilirdir: ayni veritabani ayni baytlari uretir (plan 20.1).
 *
 * Calistirma:  pnpm --filter @kuran/build data
 *
 * Bu adimda uretilenler (yalnizca Tanzil verisi mevcut):
 *   surahs_index.json      114 sure ust bilgisi + toplamlar
 *   surah/surah_{id}.json  sure + ayetleri (Arapca metin, sayfa, cuz, secde)
 *   sources.json           Kaynak Seffafligi sayfasi icin kaynak listesi
 *
 * Meal, kok, kissa, kavram ve ilke ciktilari ilgili import'lar tamamlandikca
 * eklenecektir.
 */

import type { StaticSurah, StaticSurahMeta, StaticVerse } from "@kuran/schema";
import { staticSources, staticSurah, staticSurahsIndex } from "@kuran/schema";
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
  text_simple: string;
  text_no_vowel: string;
  transcription_tr: string | null;
  page: number;
  juz: number;
  sajda: boolean;
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

  const verses = (
    await pool.query<VerseRow>(
      `SELECT id, surah_id, verse_number, text_uthmani, text_simple, text_no_vowel,
              transcription_tr, page, juz, sajda
         FROM verse
        ORDER BY id`,
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
    `okundu: ${surahs.length} sure, ${verses.length} ayet, ` +
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

  for (const row of surahs) {
    const meta = toMeta(row);
    metas.push(meta);

    const surahVerses = versesBySurah.get(row.id) ?? [];
    if (surahVerses.length !== row.verse_count) {
      fail(
        `sure ${row.id}: verse_count ${row.verse_count} ama ${surahVerses.length} ayet bulundu`,
      );
    }

    const staticVerses: StaticVerse[] = surahVerses.map((verse) => ({
      id: verse.id,
      verseNumber: verse.verse_number,
      textUthmani: verse.text_uthmani,
      textSimple: verse.text_simple,
      textNoVowel: verse.text_no_vowel,
      transcriptionTr: verse.transcription_tr,
      page: verse.page,
      juz: verse.juz,
      sajda: verse.sajda,
      translations: (translationsByVerse.get(verse.id) ?? []).map((t) => ({
        authorSlug: t.author_slug,
        authorName: t.author_name,
        text: t.text,
        footnotes: t.footnotes ?? [],
      })),
    }));

    const payload: StaticSurah = { ...meta, verses: staticVerses };

    // Yazmadan once dogrula — hatali cikti diske inmez
    const parsed = staticSurah.safeParse(payload);
    if (!parsed.success) {
      fail(`sure ${row.id} sema dogrulamasi basarisiz:\n${parsed.error.message}`);
    }

    emitter.write(`surah/surah_${row.id}.json`, payload);
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
