import { normalizeTr } from "../search/normalize.js";
import type { Konum } from "./types.js";

/**
 * Sehir arama: normalizeTr ile (Turkce buyuk/kucuk harf ve aksan duyarsiz).
 * Once ada baştan eşleşenler, sonra ad içinde geçenler; her grupta liste sırası
 * korunur (listede il merkezleri ilçelerden önce gelir).
 */
export function sehirAra(liste: Konum[], sorgu: string, sinir = 20): Konum[] {
  const q = normalizeTr(sorgu).trim();
  if (q === "") return [];
  const bas: Konum[] = [];
  const icinde: Konum[] = [];
  for (const k of liste) {
    const ad = normalizeTr(k.ad);
    if (ad.startsWith(q)) bas.push(k);
    else if (ad.includes(q)) icinde.push(k);
  }
  return bas.concat(icinde).slice(0, sinir);
}
