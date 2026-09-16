/**
 * Gonderim takvimi — saf fonksiyon (dosya sistemi / veritabani yok).
 *
 * `lib/content.ts` bunu PostgreSQL'den topladigi ilke listesi ve ilke -> ayet
 * haritasiyla cagirir. Ayri dosyada durmasinin sebebi test edilebilirlik:
 * content.ts govdesi bastan sona calisan bir betik (DB baglantisi, dosya
 * yazma) oldugu icin dogrudan import edilip birim testi yazilamaz.
 * Bkz. `__tests__/schedule.smoke.ts`.
 *
 * ## Neden ayri bir ayet sogumasi var
 *
 * Rotasyon ilkeyi gun basina degistirir (gun i -> ilke[i % ilkeSayisi]), yani
 * bir ILKE 64 gunden once tekrar etmez. Ama AYNI AYET birden fazla ilkenin
 * dayanagi olabilir ve siralamada yan yana dusen iki ilke ayni ayeti
 * gosterebilir. 2026-09-16'da bu yasandi: gun 7 "ofkeyi-yutma" ve gun 8
 * "affetme" ilkelerinin ikisi de 3:134'u secti, abonelere ust uste iki gun
 * AYNI AYET gitti (gun 9/10 ciftinde de 3:159 ayni sekilde tekrarliyordu).
 * Ilke tekrar etmiyordu, bu yuzden eski uretim bunu hic fark etmedi.
 *
 * Cozum: ilke rotasyonu aynen korunur; yalnizca AYET secimi, o ilkenin ayet
 * listesinde son `VERSE_COOLDOWN_DAYS` gunde kullanilmamis ilk ayete kayar.
 * Secim hala DETERMINISTIK (rastgelelik yok) — bot hangi ayetin gonderildigini
 * kaydetmedigi ve yalnizca imleci ilerlettigi icin bu sart (plan 19.2).
 */

/**
 * Bir ayet en az bu kadar gun gecmeden tekrar edemez.
 *
 * 45 gun, mevcut 64 ilke / 249 ayetlik icerikle olculdu: ust uste tekrar ve
 * 7 gun icinde tekrar tamamen kalkiyor, geri dusulen (cozulemeyen) gun sayisi
 * 1'de kaliyor. Daha buyuk pencere (90) geri dusus sayisini 17'ye cikariyor,
 * yani pratikte daha kotu bir takvim uretiyor.
 */
export const VERSE_COOLDOWN_DAYS = 45;

export interface SchedulePrinciple {
  id: number;
  slug: string;
}

export interface ScheduleDay {
  dayIndex: number;
  verseId: number;
  surahId: number;
  verseNumber: number;
  principleSlug: string;
  occasion: null;
}

/**
 * @param usable  Ayeti olan ilkeler, takvim sirasinda (`ORDER BY "order", id`)
 * @param versesByPrinciple  ilke id -> ayet id listesi (birincil dayanaklar once)
 * @param days  Uretilecek gun sayisi
 */
export function buildScheduleDays(
  usable: readonly SchedulePrinciple[],
  versesByPrinciple: ReadonlyMap<number, readonly number[]>,
  days: number,
  cooldown: number = VERSE_COOLDOWN_DAYS,
): ScheduleDay[] {
  const entries: ScheduleDay[] = [];
  if (usable.length === 0) return entries;

  /** ayet id -> en son gonderildigi gun. Sogumayi bu tasiyor. */
  const lastUsedDay = new Map<number, number>();

  for (let day = 0; day < days; day += 1) {
    const principle = usable[day % usable.length];
    if (principle === undefined) continue;
    const verses = versesByPrinciple.get(principle.id) ?? [];
    if (verses.length === 0) continue;

    // Eski davranisin sectigi ayet: rotasyonun bu tur icin isaret ettigi yer.
    const start = Math.floor(day / usable.length) % verses.length;

    /*
     * Sogumayi saglayan ilk ayete kay. Listenin tamami sicaksa (kisa ayet
     * listesi olan ilkelerde olur) `start` ayetine GERI DUSULUR: takvimde bos
     * gun birakmak, tekrar eden bir ayetten daha kotu olurdu.
     */
    let verseId = verses[start];
    for (let offset = 0; offset < verses.length; offset += 1) {
      const candidate = verses[(start + offset) % verses.length];
      if (candidate === undefined) continue;
      const last = lastUsedDay.get(candidate);
      if (last === undefined || day - last > cooldown) {
        verseId = candidate;
        break;
      }
    }
    if (verseId === undefined) continue;

    lastUsedDay.set(verseId, day);
    entries.push({
      dayIndex: day,
      verseId,
      surahId: Math.floor(verseId / 1000),
      verseNumber: verseId % 1000,
      principleSlug: principle.slug,
      occasion: null,
    });
  }
  return entries;
}

/**
 * Takvim denetimi — ust uste ayni ayeti gosteren gun ciftlerini dondurur.
 *
 * `linter.ts` yayinlanan `schedule.json`u bununla dogrular: uretici duzeltildi
 * ama ayet listeleri degistikce ayni tuzak geri gelebilir ve bot sessizce iki
 * gun ayni ayeti gonderir — kimse fark etmez.
 */
export function checkScheduleAdjacentRepeats(
  entries: readonly { dayIndex: number; verseId: number }[],
): string[] {
  const errors: string[] = [];
  for (let i = 1; i < entries.length; i += 1) {
    const previous = entries[i - 1];
    const current = entries[i];
    if (previous === undefined || current === undefined) continue;
    if (previous.verseId === current.verseId) {
      errors.push(
        `schedule.json: gun ${String(previous.dayIndex)} ve ${String(current.dayIndex)} ayni ayeti ` +
          `gosteriyor (${String(current.verseId)}) — abonelere ust uste iki gun ayni ayet gider`,
      );
    }
  }
  return errors;
}
