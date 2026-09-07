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
