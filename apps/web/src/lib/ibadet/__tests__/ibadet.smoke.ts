/**
 * Ibadet hesap kutuphanesi duman testleri (vakit, kible, hicri).
 * Sunucunun saat diliminden bagimsiz olmali: TZ=Asia/Tokyo ile de calistirilir.
 *
 * Calistirma:  pnpm --filter @kuran/web test:smoke
 */

import { gunVakitleri, siradakiVakit, aylikImsakiye, yerelGun } from "../vakit.js";
import { kibleAcisi } from "../kible.js";
import { hicriTarih } from "../hicri.js";
import { VAKITLER, type Konum } from "../types.js";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.error(`  HATA ${label}`);
  }
}

const istanbul: Konum = { ad: "Istanbul", enlem: 41.0082, boylam: 28.9784, saatDilimi: "Europe/Istanbul" };
const londra: Konum = { ad: "Londra", enlem: 51.5074, boylam: -0.1278, saatDilimi: "Europe/London" };
const oslo: Konum = { ad: "Oslo", enlem: 59.9139, boylam: 10.7522, saatDilimi: "Europe/Oslo" };

console.log("1. Kible");
check("Istanbul 151.6 +-1", Math.abs(kibleAcisi(41.0082, 28.9784) - 151.6) <= 1);
check("Ankara 160.8 +-1", Math.abs(kibleAcisi(39.9334, 32.8597) - 160.8) <= 1);
{
  const a = kibleAcisi(-33.8688, 151.2093);
  check("aci [0,360)", a >= 0 && a < 360);
}

console.log("");
console.log("2. Hicri tarih");
{
  const h = hicriTarih(new Date("2026-03-20T12:00:00Z"), "Europe/Istanbul");
  check("1 Sevval 1447", h.gun === 1 && h.ay === 10 && h.yil === 1447);
  check("metin dolu", h.metin.length > 0 && h.ayAdi.length > 0);
}

console.log("");
console.log("3. Istanbul vakitleri (Diyanet)");
// Kaynak: https://namazvakitleri.diyanet.gov.tr/tr-TR/9541/istanbul-icin-namaz-vakti
// Alinma tarihi: 2026-11-20 (Istanbul, 20 Kasim 2026 Cuma satiri).
const diyanet: Record<string, string> = {
  imsak: "06:21", gunes: "07:50", ogle: "12:55", ikindi: "15:26", aksam: "17:49", yatsi: "19:13",
};
function hhmm(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}
function dk(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
{
  const v = gunVakitleri({ yil: 2026, ay: 11, gun: 20 }, istanbul);
  for (const ad of VAKITLER) {
    const d = v[ad];
    check(`${ad} Diyanet +-2 dk`, d !== null && Math.abs(dk(hhmm(d, istanbul.saatDilimi)) - dk(diyanet[ad] as string)) <= 2);
  }
  const t = VAKITLER.map((a) => v[a]?.getTime() ?? NaN);
  check("vakitler sirali", t.every((x, i) => i === 0 || x > (t[i - 1] as number)));
}

console.log("");
console.log("4. Saat dilimi");
{
  const v = gunVakitleri({ yil: 2026, ay: 11, gun: 20 }, londra);
  const o = v.ogle ? dk(hhmm(v.ogle, "Europe/London")) : -1;
  check("Londra ogle 11-13 arasi", o >= 11 * 60 && o <= 13 * 60);
}

console.log("");
console.log("5. Gun donumu");
{
  // 2026-11-20 23:30 Istanbul = 20:30Z
  const s = siradakiVakit(new Date("2026-11-20T20:30:00Z"), istanbul);
  check("ertesi gun imsak", s !== null && s.ad === "imsak" && yerelGun(s.an, istanbul.saatDilimi).gun === 21);
  const y = yerelGun(new Date("2026-11-20T22:30:00Z"), "Europe/Istanbul");
  check("yerelGun gece yarisini asar", y.yil === 2026 && y.ay === 11 && y.gun === 21);
}

console.log("");
console.log("6. Yuksek enlem");
{
  let ok = true;
  let hata = false;
  try {
    const v = gunVakitleri({ yil: 2026, ay: 6, gun: 21 }, oslo);
    for (const ad of VAKITLER) {
      const d = v[ad];
      if (d !== null && !(d instanceof Date && !Number.isNaN(d.getTime()))) ok = false;
    }
  } catch {
    hata = true;
  }
  check("hata firlatmaz", !hata);
  check("Invalid Date yok", ok);
}

{
  // Tromso: adhan Turkey() yontemi burada bazi vakitleri hesaplayamaz (gece guneşi);
  // null yolu gercekten calisir.
  const tromso: Konum = { ad: "Tromso", enlem: 69.65, boylam: 18.96, saatDilimi: "Europe/Oslo" };
  let hata = false;
  let v = null as ReturnType<typeof gunVakitleri> | null;
  try {
    v = gunVakitleri({ yil: 2026, ay: 6, gun: 21 }, tromso);
  } catch {
    hata = true;
  }
  check("Tromso hata firlatmaz", !hata && v !== null);
  const vals = v ? VAKITLER.map((a) => v[a]) : [];
  check("Tromso Invalid Date yok", vals.every((d) => d === null || !Number.isNaN(d.getTime())));
  check("Tromso en az bir vakit null", vals.some((d) => d === null));
  check("Tromso ogle ve ikindi hesaplanir", v?.ogle instanceof Date && v.ikindi instanceof Date);
}

console.log("");
console.log("7. Aylik imsakiye");
{
  const a = aylikImsakiye(2026, 2, istanbul);
  check("subat 2026 = 28 gun", a.length === 28 && a[0]?.gun === 1);
}

console.log("");
if (failures.length > 0) {
  console.error(`\n${String(failures.length)} basarisiz, ${String(passed)} gecti`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log(`${String(passed)} denetim gecti`);
}
