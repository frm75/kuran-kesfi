import { z } from "zod";
import { nonEmptyText, slug } from "./common.js";
import { revelationType } from "./quran.js";

/**
 * Statik JSON cikti semalari — plan 5.5.
 *
 * scripts/build bu sekilleri uretir, apps/web bunlari tuketir, referans linter
 * bunlari dogrular. Tek tanim, uc kullanici.
 *
 * ## Uc katmanli duzen
 *
 * Tek dosyada sure + tum mealler tutulunca Bakara 1179 KB oluyordu; plan 20.4
 * ilk yukleme butcesi < 200 KB. Bu yuzden veri kullanim bicimine gore bolundu:
 *
 *   data/surahs_index.json              114 sure ust bilgisi
 *   data/authors_index.json             meal listesi (secim arayuzu icin)
 *   data/surah/surah_{id}.json          CEKIRDEK: Arapca + ceviriyazi (~164 KB)
 *   data/translation/{yazar}/surah_{id}.json   TEK MEAL (~94 KB)
 *   data/verse/verse_{s}_{v}.json       TEK AYET + tum mealler (~1,5 KB)
 *   data/sources.json                   Kaynak Seffafligi
 *
 * Okuma ekrani: cekirdek + yalnizca secili meal(ler).
 * Ayet paneli ve karsilastirma sepeti (plan 12.8b): tek kucuk ayet dosyasi.
 *
 * `textSimple` ve `textNoVowel` cekirdekte YOKTUR; yalnizca arama indeksi
 * girdisidir ve okuma ekraninda kullanilmaz. Arama indeksi ayrica uretilecek.
 *
 * Dosya adlari alt cizgilidir (plan 20.2).
 */

/** Bir ayetin bir mealdeki karsiligi. */
export const staticTranslation = z.object({
  /** author.slug — sayisal id degil, yeniden build'de kaymaz */
  authorSlug: slug,
  authorName: nonEmptyText,
  text: nonEmptyText,
  footnotes: z.array(
    z.object({
      number: z.number().int().positive(),
      text: nonEmptyText,
    }),
  ),
});
export type StaticTranslation = z.infer<typeof staticTranslation>;

/**
 * Cekirdek katmandaki ayet — meal ICERMEZ.
 *
 * Okuma ekraninin ihtiyaci: Arapca metin, ceviriyazi, sayfa/cuz/secde.
 * Mealler ayri dosyadan gelir; boylece kullanici yalnizca sectigi meali indirir.
 */
export const staticVerse = z.object({
  /** surahId * 1000 + verseNumber */
  id: z.number().int().positive(),
  verseNumber: z.number().int().positive(),
  textUthmani: nonEmptyText,
  transcriptionTr: z.string().nullable(),
  page: z.number().int().positive(),
  juz: z.number().int().min(1).max(30),
  sajda: z.boolean(),
});
export type StaticVerse = z.infer<typeof staticVerse>;

/** Sure ust bilgisi — hem dizinde hem sure dosyasinda ayni sekil. */
export const staticSurahMeta = z.object({
  id: z.number().int().min(1).max(114),
  slug,
  nameTr: nonEmptyText,
  nameAr: nonEmptyText,
  nameEn: nonEmptyText,
  verseCount: z.number().int().positive(),
  revelationType,
  revelationOrderStandard: z.number().int().min(1).max(114),
  revelationOrderNoldeke: z.number().int().min(1).max(114).nullable(),
  pageStart: z.number().int().positive(),
});
export type StaticSurahMeta = z.infer<typeof staticSurahMeta>;

/** data/surah/surah_{id}.json — cekirdek katman */
export const staticSurah = staticSurahMeta.extend({
  verses: z.array(staticVerse).min(1),
});
export type StaticSurah = z.infer<typeof staticSurah>;

/**
 * data/translation/{authorSlug}/surah_{id}.json — meal katmani.
 *
 * Tek yazarin tek suredeki metinleri. Kullanici secili meallerini bu
 * dosyalardan yukler (plan 2.3: "kullanici favori 3-5 mealini secer").
 */
export const staticSurahTranslation = z.object({
  surahId: z.number().int().min(1).max(114),
  authorSlug: slug,
  authorName: nonEmptyText,
  verses: z
    .array(
      z.object({
        verseNumber: z.number().int().positive(),
        text: nonEmptyText,
        footnotes: z.array(
          z.object({ number: z.number().int().positive(), text: nonEmptyText }),
        ),
      }),
    )
    .min(1),
});
export type StaticSurahTranslation = z.infer<typeof staticSurahTranslation>;

/**
 * data/verse/verse_{s}_{v}.json — ayet katmani.
 *
 * Tek ayet, TUM mealleriyle. Ayet paneli (plan 12.4), karsilastirma sepeti
 * (plan 12.8b) ve meal farklari (plan 2.3) bu dosyayi kullanir; boylece dokuz
 * meali gormek icin dokuz sure dosyasi indirilmez.
 */
export const staticVerseDetail = staticVerse.extend({
  surahId: z.number().int().min(1).max(114),
  surahSlug: slug,
  surahNameTr: nonEmptyText,
  translations: z.array(staticTranslation),
});
export type StaticVerseDetail = z.infer<typeof staticVerseDetail>;

/** data/authors_index.json — meal secim arayuzu icin */
export const staticAuthor = z.object({
  slug,
  name: nonEmptyText,
  workTitle: z.string().nullable(),
  language: z.string().length(2),
  /** Verinin geldigi kaynak — atif yukumlulugunu belirler */
  source: nonEmptyText,
  license: nonEmptyText,
  licenseNote: z.string().nullable(),
  url: z.string().nullable(),
  isDefault: z.boolean(),
  /** 1-4 oncelikli mealler; digerleri null (plan 3.1) */
  priority: z.number().int().min(1).max(4).nullable(),
  /**
   * Bu yazarin hic ayeti bulunmayan sure numaralari — kaynak taraflı boşluk.
   * Ornek: Suleymaniye Vakfi'nin Tahrim (66) suresinin 12 ayeti de kaynakta yok.
   * Arayuz bu sureler icin meal dosyasi istemez; linter dosya sayisini buna
   * gore dogrular. Belirsizlik saklanmaz (plan 1.5).
   */
  missingSurahs: z.array(z.number().int().min(1).max(114)),
  /** Suresi var ama bazi ayetleri eksik olan toplam ayet sayisi */
  missingVerseCount: z.number().int().nonnegative(),
});
export type StaticAuthor = z.infer<typeof staticAuthor>;

export const staticAuthorsIndex = z.object({
  authors: z.array(staticAuthor),
  /**
   * Tanzil ceviri seti sarti: ucten fazla meal kullanildiginda arayuzde
   * tanzil.net/trans/ geri baglantisi gosterilmesi ZORUNLUDUR.
   * Bu alan arayuze o yukumlulugu tasir; bos birakilamaz.
   */
  requiredAttributionLinks: z
    .array(z.object({ label: nonEmptyText, url: nonEmptyText }))
    .min(1),
});
export type StaticAuthorsIndex = z.infer<typeof staticAuthorsIndex>;

/** data/surahs_index.json */
export const staticSurahsIndex = z.object({
  surahs: z.array(staticSurahMeta).length(114),
  totals: z.object({
    surahs: z.literal(114),
    verses: z.literal(6236),
    pages: z.literal(604),
    juzs: z.literal(30),
  }),
});
export type StaticSurahsIndex = z.infer<typeof staticSurahsIndex>;

/** data/sources.json — Kaynak Seffafligi sayfasi (plan 12.10, 9) */
export const staticSource = z.object({
  slug,
  name: nonEmptyText,
  workTitle: z.string().nullable(),
  author: z.string().nullable(),
  reference: z.string().nullable(),
  url: z.string().nullable(),
  license: nonEmptyText,
  note: z.string().nullable(),
});
export type StaticSource = z.infer<typeof staticSource>;

export const staticSources = z.object({
  sources: z.array(staticSource),
});
export type StaticSources = z.infer<typeof staticSources>;

// ---------------------------------------------------------------------------
// Kelime ve kok katmani — plan §2 "Kelime" kapisi, §12.6
// ---------------------------------------------------------------------------

/**
 * Ayetteki tek bir kelime.
 *
 * `rootArabic` kok sayfasina baglantidir: kok adresleri Arapca harflerle
 * kuruluyor (/kok/قول). Latin harfli `latin` alani Buckwalter benzeri bir
 * cevriyazi ve BUYUK-KUCUK HARF ANLAMLI (S=ص, s=س; T=ط, t=ت). Kucultuldugunde
 * 1641 kokten 141'i cakisiyor — bu yuzden adres icin kullanilamaz.
 */
export const staticWord = z.object({
  /** Ayet icindeki siras — 1'den baslar */
  position: z.number().int().positive(),
  arabic: nonEmptyText,
  transcriptionTr: z.string().nullable(),
  /** Kelimenin Turkce karsiligi — meal degil, kelime kelime anlam */
  translationTr: z.string().nullable(),
  /** Kok atanmamis kelimeler var (harf-i cerler, zamirler): null */
  rootArabic: z.string().nullable(),
  rootLatin: z.string().nullable(),
});
export type StaticWord = z.infer<typeof staticWord>;

/** data/word/verse_{s}_{v}.json */
export const staticVerseWords = z.object({
  surahId: z.number().int().min(1).max(114),
  verseNumber: z.number().int().positive(),
  words: z.array(staticWord).min(1),
});
export type StaticVerseWords = z.infer<typeof staticVerseWords>;

/** Bir kokun bir ayetteki gecisi. */
export const staticRootOccurrence = z.object({
  surahId: z.number().int().min(1).max(114),
  surahSlug: slug,
  surahNameTr: nonEmptyText,
  verseNumber: z.number().int().positive(),
  position: z.number().int().positive(),
  arabic: nonEmptyText,
  transcriptionTr: z.string().nullable(),
  translationTr: z.string().nullable(),
});
export type StaticRootOccurrence = z.infer<typeof staticRootOccurrence>;

/** data/root/{arapca}.json */
export const staticRoot = z.object({
  arabic: nonEmptyText,
  latin: nonEmptyText,
  /**
   * Kok anlami. Kaynakta HTML olarak geliyor; duz metne cevrilip yaziliyor
   * (packages/pipeline/src/text.ts → stripSourceHtml). Satir sonlari korunur.
   */
  meaningTr: z.string().nullable(),
  occurrenceCount: z.number().int().nonnegative(),
  occurrences: z.array(staticRootOccurrence),
});
export type StaticRoot = z.infer<typeof staticRoot>;

/** data/roots_index.json — kok listesi sayfasi icin */
export const staticRootsIndex = z.object({
  roots: z
    .array(
      z.object({
        arabic: nonEmptyText,
        latin: nonEmptyText,
        /** Anlamin ilk cumlesi; tam metin kok dosyasinda */
        meaningSummary: z.string().nullable(),
        occurrenceCount: z.number().int().nonnegative(),
      }),
    )
    .min(1),
  totals: z.object({
    roots: z.number().int().positive(),
    words: z.number().int().positive(),
    wordsWithRoot: z.number().int().nonnegative(),
  }),
});
export type StaticRootsIndex = z.infer<typeof staticRootsIndex>;
