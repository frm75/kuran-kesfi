import { z } from "zod";
import { nonEmptyText, slug } from "./common.js";

/**
 * Arapca kiraat (ses) — plan 2.4, 6 "Faz 4 — Gunluk, PWA, Ses".
 *
 * ## Neden ayet basina dosya, neden zaman damgasi yok
 *
 * QUL'un kiraat paketi ATLANMISTI: yalnizca sure duzeyinde MP3 adresi veriyor
 * ve `segments.json` bos geliyordu — ayet zaman damgasi olmadan "bu ayeti
 * dinle" yapilamaz. everyayah.com ayet basina AYRI dosya veriyor; dosya adi
 * ayetin kendisi ("002255.mp3"), zaman damgasina gerek kalmiyor.
 *
 * Bunun ikinci sonucu: oynatma JAVASCRIPT ISTEMIYOR. Ayet sayfasina
 * <audio controls src="..."> koymak yetiyor, site JS'siz kalmaya devam ediyor.
 *
 * ## Neden veritabani tablosu yok
 *
 * Bir kari = TEK satir kunye; ayet basina satir yok, cunku dosya adi ayetten
 * hesaplaniyor. Iliski, birlestirme ve tekillik sorusu olmayan tek satir icin
 * tablo acmak, migration yazmak ve import adimi eklemek hicbir sey
 * kazandirmazdi. `data/scripture` ile ayni gerekce (bkz. build.ts).
 *
 * Dosya `pnpm media:recitation` tarafindan URETILIR (elle yazilmaz): indirme
 * bittikten sonra elde GERCEKTEN duran dosyalar sayilip yazilir.
 */

export const recitationStyle = z.enum(["murattal", "mucevved"]);
export type RecitationStyle = z.infer<typeof recitationStyle>;

export const reciter = z.object({
  slug,
  name: nonEmptyText,
  nameAr: nonEmptyText,
  style: recitationStyle,
  bitrateKbps: z.number().int().positive(),
  /** source.slug — atif yukumlulugu oradan okunur */
  sourceSlug: slug,
  /**
   * R2 anahtar onu: medya.kurankesfi.tr/<basePath>/<sss><vvv>.mp3
   * Bas ve son egik cizgi TASIMAZ.
   */
  basePath: z.string().regex(/^[a-z0-9]+(\/[a-z0-9-]+)*$/, "gecerli bir yol onu olmali"),
  /** Elde dosyasi DURAN ayet sayisi — indirilmeye calisilan degil. */
  verseCount: z.number().int().nonnegative(),
  /**
   * Dosyasi olmayan ayetler ("2:255"). Arayuz bunlarda oynatici GOSTERMEZ —
   * calmayan bir oynatici gostermek sessiz kirilmadir.
   */
  missingVerses: z.array(z.string().regex(/^\d{1,3}:\d{1,3}$/)),
  totalBytes: z.number().int().nonnegative(),
});
export type Reciter = z.infer<typeof reciter>;

/** data/recitation/reciter_<slug>.json */
export const recitationFile = z.object({
  reciters: z.array(reciter).min(1),
});
export type RecitationFile = z.infer<typeof recitationFile>;

/** data/recitation.json — butun karilerin birlesigi */
export const staticRecitation = z.object({
  reciters: z.array(reciter),
});
export type StaticRecitation = z.infer<typeof staticRecitation>;

/**
 * Kelime zaman damgasi — plan 04.
 *
 * ## Neden ayete goreli
 *
 * Kaynak (Quran.com QDC) damgayi SURE mp3'une gore veriyor. Bizde ayet basina
 * ayri dosya var. 300 ayetlik olcumde iki kaydin ayni ustadan kesildigi
 * dogrulandi (fark medyan 2 ms, p95 6 ms), bu yuzden sure dosyasini indirmek
 * yerine damga `timestamp_from` cikarilarak ayete goreli hale getirildi.
 *
 * ## Neden yalniz baslangiclar
 *
 * Bir kelimenin bitisi bir sonrakinin baslangicidir. Dizinin son elemani son
 * kelimenin bitisidir; uzunluk = kelime sayisi + 1. Boylece dosya yariya iner
 * (480 KB) ve calan kelime tek bir ikili aramayla bulunur.
 */
export const verseSegmentList = z.array(z.number().int().nonnegative()).min(2);
export type VerseSegmentList = z.infer<typeof verseSegmentList>;

/**
 * Onarim sayaclari. TAHMIN DEGIL: indirme bittikten sonra gercekten yapilan
 * onarim sayilir (`missingVerses` ile ayni gerekce).
 */
export const segmentStats = z.object({
  verseCount: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  /** Damgasi hic gelmeyip komsulardan aradegerlenen kelime */
  interpolatedWords: z.number().int().nonnegative(),
  /** Ilk kelimesi ayet basindan 500 ms'den fazla once baslayan (bozuk) ayet */
  repairedLeads: z.number().int().nonnegative(),
  /** Kaynak indisi DB kelime sayisini asan ayet */
  cappedVerses: z.number().int().nonnegative(),
});
export type SegmentStats = z.infer<typeof segmentStats>;

/** data/recitation/segments_<slug>.json */
export const segmentFile = z.object({
  reciterSlug: slug,
  sourceUrl: nonEmptyText,
  /** YYYY-MM-DD */
  fetchedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stats: segmentStats,
  /** "2:255" -> [0, 410, 980, ..., 51900] */
  verses: z.record(z.string().regex(/^\d{1,3}:\d{1,3}$/), verseSegmentList),
});
export type SegmentFile = z.infer<typeof segmentFile>;

/** public/data/ses/segment_<sure>.json */
export const staticSurahSegments = z.object({
  surahId: z.number().int().positive(),
  reciters: z.record(slug, z.record(z.string(), verseSegmentList)),
});
export type StaticSurahSegments = z.infer<typeof staticSurahSegments>;
