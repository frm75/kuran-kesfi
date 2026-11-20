/**
 * Saf bildirim planlayici: Capacitor'a dokunmaz, Node'da test edilir.
 * Kimlik semasi: id = yyyymmdd*10 + k  (k 0..5 vakitler, 8 gunluk ayet, 9 gunluk tekrar).
 */
import type { IbadetAyarlari } from "./ayarlar.js";
import { gunVakitleri, yerelGun } from "./vakit.js";
import { VAKITLER, type VakitAdi } from "./types.js";

export interface PlanliBildirim {
  id: number;
  an: Date;
  baslik: string;
  govde: string;
  url: string;
}

export interface AyetKaydi {
  surahId: number;
  verseNumber: number;
  surahNameTr: string;
  surahSlug: string;
  meal: string | null;
}

type Gun = { yil: number; ay: number; gun: number };

const VAKIT_ADI: Record<VakitAdi, string> = {
  imsak: "İmsak",
  gunes: "Güneş",
  ogle: "Öğle",
  ikindi: "İkindi",
  aksam: "Akşam",
  yatsi: "Yatsı",
};

const MEAL_AZAMI = 180;
const VAKIT_AZAMI = 180;

export function varsayilanDilim(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function gunEkle(g: Gun, n: number): Gun {
  const d = new Date(Date.UTC(g.yil, g.ay - 1, g.gun + n));
  return { yil: d.getUTCFullYear(), ay: d.getUTCMonth() + 1, gun: d.getUTCDate() };
}

function kimlikGunu(g: Gun): number {
  return g.yil * 10000 + g.ay * 100 + g.gun;
}

function p2(n: number): string {
  return String(n).padStart(2, "0");
}

function dilimFarki(an: number, tz: string): number {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(an));
  const al = (t: string): number => Number(p.find((x) => x.type === t)?.value);
  const duvar = Date.UTC(al("year"), al("month") - 1, al("day"), al("hour"), al("minute"), al("second"));
  return duvar - Math.floor(an / 1000) * 1000;
}

/** Verilen saat diliminde duvar saati g SS:DD olan an. */
function duvarAni(g: Gun, saat: number, dakika: number, tz: string): Date {
  const hedef = Date.UTC(g.yil, g.ay - 1, g.gun, saat, dakika);
  let an = hedef - dilimFarki(hedef, tz);
  an = hedef - dilimFarki(an, tz);
  return new Date(an);
}

function saatAyir(s: string | null): { s: number; d: number } | null {
  if (s === null) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const sa = Number(m[1]);
  const dk = Number(m[2]);
  return sa < 24 && dk < 60 ? { s: sa, d: dk } : null;
}

function hhmm(an: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(an);
  const al = (t: string): string => p.find((x) => x.type === t)?.value ?? "00";
  return `${al("hour")}:${al("minute")}`;
}

export function vakitPlani(ayar: IbadetAyarlari, simdi: Date, gunSayisi = 30): PlanliBildirim[] {
  const konum = ayar.konum;
  if (konum === null) return [];
  const cikti: PlanliBildirim[] = [];
  const bugun = yerelGun(simdi, konum.saatDilimi);
  for (let i = 0; i < gunSayisi; i += 1) {
    const gun = gunEkle(bugun, i);
    const v = gunVakitleri(gun, konum);
    VAKITLER.forEach((ad, k) => {
      if (!ayar.vakitBildirimi[ad]) return;
      const vakit = v[ad];
      if (vakit === null) return;
      const an = new Date(vakit.getTime() - ayar.dakikaOnce * 60000);
      if (an.getTime() <= simdi.getTime()) return;
      cikti.push({
        id: kimlikGunu(gun) * 10 + k,
        an,
        baslik: `${VAKIT_ADI[ad]} vakti`,
        govde:
          ayar.dakikaOnce > 0
            ? `${ayar.dakikaOnce} dakika sonra · ${konum.ad}`
            : `${konum.ad} · ${hhmm(vakit, konum.saatDilimi)}`,
        url: "/ibadet",
      });
    });
  }
  return cikti.slice(0, VAKIT_AZAMI);
}

function mealKirp(meal: string): string {
  return meal.length > MEAL_AZAMI ? `${meal.slice(0, MEAL_AZAMI - 1)}…` : meal;
}

/** ayetler[i] = bugunden itibaren i. yerel gun; null kayit icin bildirim yok. */
export function ayetPlani(
  ayar: IbadetAyarlari,
  simdi: Date,
  ayetler: Array<AyetKaydi | null>,
): PlanliBildirim[] {
  const saat = saatAyir(ayar.ayetSaati);
  if (saat === null) return [];
  const tz = ayar.konum?.saatDilimi ?? varsayilanDilim();
  const bugun = yerelGun(simdi, tz);
  const cikti: PlanliBildirim[] = [];
  ayetler.forEach((a, i) => {
    if (a === null) return;
    const gun = gunEkle(bugun, i);
    const an = duvarAni(gun, saat.s, saat.d, tz);
    if (an.getTime() <= simdi.getTime()) return;
    cikti.push({
      id: kimlikGunu(gun) * 10 + 8,
      an,
      baslik: `Günün ayeti — ${a.surahNameTr} ${a.verseNumber}`,
      govde: a.meal === null ? "Okumak için dokunun" : `${mealKirp(a.meal)} — Diyanet İşleri`,
      url: `/${a.surahSlug}/${a.verseNumber}`,
    });
  });
  return cikti;
}

export function tekrarPlani(ayar: IbadetAyarlari, simdi: Date, gunSayisi = 14): PlanliBildirim[] {
  const saat = saatAyir(ayar.tekrarSaati);
  if (saat === null) return [];
  const tz = ayar.konum?.saatDilimi ?? varsayilanDilim();
  const bugun = yerelGun(simdi, tz);
  const cikti: PlanliBildirim[] = [];
  for (let i = 0; i < gunSayisi; i += 1) {
    const gun = gunEkle(bugun, i);
    const an = duvarAni(gun, saat.s, saat.d, tz);
    if (an.getTime() <= simdi.getTime()) continue;
    cikti.push({
      id: kimlikGunu(gun) * 10 + 9,
      an,
      baslik: "Tekrar zamanı",
      govde: "Bugünkü tekrarlarınız sizi bekliyor.",
      url: "/gunluk",
    });
  }
  return cikti;
}

/** Yerel yilin gunu (1 Ocak = 1) % uzunluk. */
export function gununSiraNo(an: Date, saatDilimi: string, uzunluk: number): number {
  const g = yerelGun(an, saatDilimi);
  const gunNo = Math.round((Date.UTC(g.yil, g.ay - 1, g.gun) - Date.UTC(g.yil, 0, 0)) / 86400000);
  return gunNo % uzunluk;
}

/** Bu uygulamanin kimlik semasina uyan bildirim mi (yyyymmdd*10 + k, k 0..5|8|9). */
export function bizimId(id: number): boolean {
  const k = id % 10;
  return Number.isInteger(id) && (k <= 5 || k === 8 || k === 9) && id >= 20000101 * 10 && id <= 21001231 * 10 + 9;
}

/**
 * Yeni plan kurulduktan sonra iptal edilecek bayat kimlikler:
 * bekleyen ∩ bizim − yeni plan. ayetiKoru: ayet indirilemedi; bekleyen k=8
 * girdileri (eski gunun ayeti) yerinde kalir.
 */
export function silinecekKimlikler(
  bekleyen: readonly number[],
  yeniPlan: readonly number[],
  secenek: { ayetiKoru: boolean },
): number[] {
  const yeni = new Set(yeniPlan);
  return [...new Set(bekleyen)].filter(
    (id) => bizimId(id) && !yeni.has(id) && !(secenek.ayetiKoru && id % 10 === 8),
  );
}
