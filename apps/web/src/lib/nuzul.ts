import { getTimeline } from "~/lib/data";

/**
 * Nüzul dönemi — TEK KAYNAK.
 *
 * Aynı sınıflandırma hem `/zaman` hem sure listelerinde kullanılıyor. İki
 * kopya olsaydı sınır bir gün değişince biri sessizce eskide kalırdı.
 *
 * ## Dönem, Mekkî/Medenî'nin YERİNE geçmez
 *
 * Sitede iki ayrı bilgi var ve BİRBİRİNİN AYNISI DEĞİL:
 *
 *   `revelationType`  Tanzil'in Mekkî / Medenî kaydı — ana referans
 *   dönem             Nöldeke sırasından türetilir (Mekke I-III, Medine)
 *
 * 114 surenin 4'ünde ÇELİŞİYORLAR: Ra'd (Tanzil Medenî / Nöldeke Mekke III),
 * Rahmân (Medenî / Mekke I), İnsân (Medenî / Mekke II), Zilzâl (Medenî /
 * Mekke I). CLAUDE.md veri kuralı: "ihtilaf saklanmaz, gösterilir". Bu yüzden
 * arayüzde ikisi de yan yana basılır ve çelişen surelerde fark okuyucunun
 * gözüne çarpar; biri ötekinin yerine geçirilmez.
 */

export type Period = "mekke_1" | "mekke_2" | "mekke_3" | "medine";

export const PERIOD_LABEL: Readonly<Record<Period, string>> = {
  mekke_1: "Mekke I",
  mekke_2: "Mekke II",
  mekke_3: "Mekke III",
  medine: "Medine",
};

export const PERIOD_ORDER: readonly Period[] = ["mekke_1", "mekke_2", "mekke_3", "medine"];

/**
 * Nöldeke dönem sınırları: 1-48 Mekke I, 49-69 Mekke II, 70-90 Mekke III,
 * 91-114 Medine (`noldeke_order.json` başındaki nota göre).
 *
 * Nöldeke sırası yoksa elde yalnızca Tanzil'in Mekkî/Medenî kaydı kalır;
 * Medenî ise "Medine" denir, Mekkî ise hangi Mekke dönemi olduğu BİLİNMEZ ve
 * uydurulmaz — `null` döner.
 */
export function periodOf(noldeke: number | null, revelationType: string): Period | null {
  if (noldeke === null) return revelationType === "medeni" ? "medine" : null;
  if (noldeke <= 48) return "mekke_1";
  if (noldeke <= 69) return "mekke_2";
  if (noldeke <= 90) return "mekke_3";
  return "medine";
}

/**
 * Bir dönemin yaklaşık yıl aralığı — siyer olaylarının `approxYear`
 * alanlarından HESAPLANIR, elle yazılmaz.
 *
 * Yıl surenin değil DÖNEMİN yılıdır: elimizde sure başına iniş tarihi ya da
 * iniş süresi yok, o yüzden uydurulmuyor.
 */
export function periodYears(period: Period): { from: number; to: number } | null {
  const years = getTimeline()
    .filter((event) => event.period === period)
    .map((event) => event.approxYear)
    .filter((year): year is number => year !== null);
  if (years.length === 0) return null;
  return { from: Math.min(...years), to: Math.max(...years) };
}
