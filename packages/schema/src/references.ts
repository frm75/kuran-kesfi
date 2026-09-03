import { z } from "zod";

/**
 * Is anahtarlari — brand + regex.
 *
 * GOREV 01 / references.ts. Ham string ile is anahtarinin karismasini onler.
 *
 * Bu modul ana site ve yerel `kuran-extract` projesi tarafindan PAYLASILIR.
 * Extract projesinde `verse`, `principle`, `concept`, `story`, `root` tablolari
 * yoktur (SD-01, Degisiklik 2); elde sayisal id degil bu anahtarlar bulunur.
 * Cozumleme import aninda sunucuda yapilir.
 */

/** Ortak slug kurali: kebab-case, kucuk harf ASCII (plan 20.2). */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Ayet anahtari: "2:153".
 *
 * Sure 1..114, ayet >= 1.
 *
 * DIKKAT: `1[01]\d` yazilmaz — 115..119'u kacak gecirir. Alternatifler
 * tek haneli, iki haneli, 100-109 ve 110-114 araliklarini ayri kapatir.
 * Ayetin sure icindeki ust siniri burada bilinemez; import sirasinda
 * veritabanina karsi ayrica dogrulanir (scripts/build referans linter).
 */
export const verseKeyRef = z
  .string()
  .regex(/^(?:[1-9]|[1-9]\d|10\d|11[0-4]):[1-9]\d*$/, "ayet anahtari '2:153' biciminde olmali")
  .brand<"VerseKey">();
export type VerseKey = z.infer<typeof verseKeyRef>;

export const principleSlug = z
  .string()
  .regex(SLUG_PATTERN, "ilke slug'i kebab-case olmali")
  .brand<"PrincipleSlug">();
export type PrincipleSlug = z.infer<typeof principleSlug>;

export const conceptSlug = z
  .string()
  .regex(SLUG_PATTERN, "kavram slug'i kebab-case olmali")
  .brand<"ConceptSlug">();
export type ConceptSlug = z.infer<typeof conceptSlug>;

export const storySlug = z
  .string()
  .regex(SLUG_PATTERN, "kissa slug'i kebab-case olmali")
  .brand<"StorySlug">();
export type StorySlug = z.infer<typeof storySlug>;

export const scholarSlug = z
  .string()
  .regex(SLUG_PATTERN, "hoca slug'i kebab-case olmali")
  .brand<"ScholarSlug">();
export type ScholarSlug = z.infer<typeof scholarSlug>;

/**
 * Kok anahtari — latin transkripsiyon, ornek "Sbr".
 *
 * `root.latin` ile BIREBIR eslesir; buyuk/kucuk harf korunur.
 * Slug kuralindan ayridir (slug'a cevrilirse "Sbr" ve "sbr" cakisirdi).
 */
export const rootKey = z
  .string()
  .regex(/^[A-Za-z']+$/, "kok anahtari latin harflerinden olusmali, ornek 'Sbr'")
  .brand<"RootKey">();
export type RootKey = z.infer<typeof rootKey>;

/** YouTube video kimligi — tam 11 karakter. */
export const youtubeVideoId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{11}$/, "YouTube video kimligi 11 karakter olmali")
  .brand<"YoutubeVideoId">();
export type YoutubeVideoId = z.infer<typeof youtubeVideoId>;
