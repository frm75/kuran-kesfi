import { z } from "zod";
import { nonEmptyText } from "./common.js";

/**
 * Kitab-ı Mukaddes atıfları — meal dipnotlarında geçen Tevrat/İncil atıfları.
 *
 * İki ayrı şey, iki ayrı lisans (bkz. `data/scripture/LICENSE.md`):
 *
 *   books.json   kitap ADLARI sözlüğü — bizim derlememiz, CC BY-NC-SA
 *   quotes.json  ayet ALINTILARI     — üçüncü tarafa ait, iktibas (FSEK m. 35)
 *
 * Alıntı sınırı şemada da duruyor (`quoteLimit`, `text` uzunluğu): kural
 * yalnızca yorumda kalırsa bir gün sessizce aşılır. 200 karakter sınırı
 * projenin Diyanet tefsiri için benimsediği kuralın aynısıdır (CLAUDE.md).
 */

export const scriptureCanon = z.enum(["eski-ahit", "yeni-ahit"]);
export type ScriptureCanon = z.infer<typeof scriptureCanon>;

/** OSIS kitap kodu: "Gen", "1Sam", "Rev". */
export const osisBookId = z
  .string()
  .regex(/^[1-3]?[A-Z][A-Za-z]{1,7}$/, "OSIS kitap kodu olmali (ornek: Gen, 1Sam, Rev)");

export const scriptureBookName = z.object({
  text: nonEmptyText,
  /**
   * Ad gundelik Turkce'de de kullaniliyorsa true ("Çıkış", "Yaratılış",
   * "Yunus", "Vahiy"). Bu adlar yalnizca dipnotta Tevrat/Incil/Kitab-i
   * Mukaddes gibi bir baglam sozcugu geciyorsa atif sayilir — yoksa
   * "Yaratılış amacı" gibi siradan bir cumle kitap atfi sanilir.
   */
  needsContext: z.boolean().optional(),
});

export const scriptureBook = z.object({
  osisId: osisBookId,
  slug: z
    .string()
    .regex(/^[1-3]?[a-z]+$/, "kitap slug'i kucuk harf olmali"),
  canon: scriptureCanon,
  order: z.number().int().min(1).max(66),
  nameTr: nonEmptyText,
  /** 1./2./3. diye numaralanan kitaplarda sira; digerlerinde null. */
  ordinal: z.number().int().min(1).max(3).nullable(),
  names: z.array(scriptureBookName).min(1),
});
export type ScriptureBook = z.infer<typeof scriptureBook>;

export const scriptureBooksFile = z.object({
  note: nonEmptyText,
  books: z.array(scriptureBook).min(1),
});
export type ScriptureBooksFile = z.infer<typeof scriptureBooksFile>;

/** Alinti uzunlugu ust siniri — CLAUDE.md "≤200 karakter alinti" kurali. */
export const SCRIPTURE_QUOTE_LIMIT = 200;

export const scriptureQuote = z.object({
  osisId: osisBookId,
  chapter: z.number().int().min(1),
  verse: z.number().int().min(1),
  /**
   * Ceviri bazi ayetleri birlestirerek veriyor (Luka 1:1 = 1-4). Alinti o
   * blogun metnidir; arayuz "bu ceviride 1-4 birlikte veriliyor" diyebilsin
   * diye blogun sinirlari da tasinir.
   */
  spanStart: z.number().int().min(1),
  spanEnd: z.number().int().min(1),
  text: nonEmptyText.max(
    SCRIPTURE_QUOTE_LIMIT,
    `alinti ${String(SCRIPTURE_QUOTE_LIMIT)} karakteri asamaz (data/scripture/LICENSE.md)`,
  ),
  /** Ayet uzun oldugu icin kesildiyse true; arayuz "…" ve kaynak linki verir. */
  truncated: z.boolean(),
});
export type ScriptureQuote = z.infer<typeof scriptureQuote>;

export const scriptureSource = z.object({
  name: nonEmptyText,
  publisher: nonEmptyText,
  url: nonEmptyText,
  license: nonEmptyText,
  quoteLimit: z.literal(SCRIPTURE_QUOTE_LIMIT),
  note: nonEmptyText,
});

export const scriptureQuotesFile = z.object({
  source: scriptureSource,
  quotes: z.array(scriptureQuote),
});
export type ScriptureQuotesFile = z.infer<typeof scriptureQuotesFile>;

/** apps/web/public/data/scripture.json — kitap sozlugu + alintilar birlikte. */
export const staticScripture = z.object({
  source: scriptureSource,
  books: z.array(scriptureBook).min(1),
  quotes: z.array(scriptureQuote),
});
export type StaticScripture = z.infer<typeof staticScripture>;
