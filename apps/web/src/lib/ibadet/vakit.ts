import { CalculationMethod, Coordinates, PrayerTimes } from "adhan";
import { VAKITLER, type GunVakitleri, type Konum, type VakitAdi } from "./types.js";

type Gun = { yil: number; ay: number; gun: number };

/** `an` anının verilen saat dilimindeki takvim günü. */
export function yerelGun(an: Date, saatDilimi: string): Gun {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: saatDilimi,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(an);
  const al = (t: string): number => Number(p.find((x) => x.type === t)?.value);
  return { yil: al("year"), ay: al("month"), gun: al("day") };
}

function gecerli(d: Date): Date | null {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

export function gunVakitleri(gun: Gun, konum: Konum): GunVakitleri {
  // adhan takvim gününü yerel bileşenlerden okur; sunucu saat diliminden
  // bağımsız olması için günü konumun saat diliminde verdiğimiz bileşenlerle kurarız.
  const tarih = new Date(gun.yil, gun.ay - 1, gun.gun, 12, 0, 0);
  const bos: GunVakitleri = { imsak: null, gunes: null, ogle: null, ikindi: null, aksam: null, yatsi: null };
  try {
    const pt = new PrayerTimes(
      new Coordinates(konum.enlem, konum.boylam),
      tarih,
      CalculationMethod.Turkey(),
    );
    return {
      imsak: gecerli(pt.fajr),
      gunes: gecerli(pt.sunrise),
      ogle: gecerli(pt.dhuhr),
      ikindi: gecerli(pt.asr),
      aksam: gecerli(pt.maghrib),
      yatsi: gecerli(pt.isha),
    };
  } catch {
    return bos;
  }
}

function sonrakiGun(g: Gun): Gun {
  const d = new Date(Date.UTC(g.yil, g.ay - 1, g.gun + 1));
  return { yil: d.getUTCFullYear(), ay: d.getUTCMonth() + 1, gun: d.getUTCDate() };
}

export function siradakiVakit(simdi: Date, konum: Konum): { ad: VakitAdi; an: Date } | null {
  let gun = yerelGun(simdi, konum.saatDilimi);
  for (let i = 0; i < 3; i += 1) {
    const v = gunVakitleri(gun, konum);
    for (const ad of VAKITLER) {
      const an = v[ad];
      if (an !== null && an.getTime() > simdi.getTime()) return { ad, an };
    }
    gun = sonrakiGun(gun);
  }
  return null;
}

export function aylikImsakiye(
  yil: number,
  ay: number,
  konum: Konum,
): Array<{ gun: number } & GunVakitleri> {
  const gunSayisi = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
  return Array.from({ length: gunSayisi }, (_, i) => ({
    gun: i + 1,
    ...gunVakitleri({ yil, ay, gun: i + 1 }, konum),
  }));
}
