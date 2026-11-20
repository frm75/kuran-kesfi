/**
 * Icerik aktarma adimlarinin ortak baglami.
 *
 * Butun adimlar AYNI transaction icinde kosar (`client`); biri duserse hicbiri
 * yazilmaz. Adimlar arasi id eslemeleri burada degil, `content.ts` icinde
 * acikca elden ele verilir — hangi adimin hangisine bagli oldugu orada okunur.
 */

import type { Client, Report } from "@kuran/pipeline";
import type { Loaded } from "./load.js";

/** Is anahtari (slug, sira no) -> veritabani id'si. */
export type IdMap = Map<string, number>;

export interface ImportContext {
  client: Client;
  data: Loaded;
  report: Report;
  /** Kaynak slug'i -> source.id; bilinmeyen slug aktarmayi durdurur. */
  sid: (slug: string) => number;
  /** Kok cevriyazisi ("Sbr") -> root.id. */
  rootIdByLatin: ReadonlyMap<string, number>;
}
