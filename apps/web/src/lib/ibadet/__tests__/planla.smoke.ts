/**
 * Bildirim planlayici duman testleri. TZ=Asia/Tokyo ile de calistirilir.
 */
import { VARSAYILAN_AYARLAR, type IbadetAyarlari } from "../ayarlar.js";
import { vakitPlani, ayetPlani, tekrarPlani, gununSiraNo, type AyetKaydi } from "../planla.js";
import { VAKITLER, type Konum } from "../types.js";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

const IST: Konum = { ad: "İstanbul", enlem: 41.0082, boylam: 28.9784, saatDilimi: "Europe/Istanbul" };
const OSLO: Konum = { ad: "Oslo", enlem: 59.9139, boylam: 10.7522, saatDilimi: "Europe/Oslo" };
const tum = { imsak: true, gunes: true, ogle: true, ikindi: true, aksam: true, yatsi: true };
const ayar = (o: Partial<IbadetAyarlari>): IbadetAyarlari => ({ ...VARSAYILAN_AYARLAR, ...o });
const sadeceOgle = { ...VARSAYILAN_AYARLAR.vakitBildirimi, ogle: true };

// Gecmis an: 14:00'te bugunun oglesi uretilmez
{
  const simdi = new Date("2026-06-10T14:00:00+03:00");
  const p = vakitPlani(ayar({ konum: IST, vakitBildirimi: sadeceOgle }), simdi, 2);
  check("gecmis an: tek bildirim (yarin)", p.length === 1);
  check("gecmis an: id yarin ogle", p[0]?.id === 202606112);
  check("gecmis an: gelecekte", (p[0]?.an.getTime() ?? 0) > simdi.getTime());
  check("vakit basligi/url", p[0]?.baslik === "Öğle vakti" && p[0]?.url === "/ibadet");
  check("vakit govdesi SS:DD", /^İstanbul · \d\d:\d\d$/.test(p[0]?.govde ?? ""));
}
// Dakika once
{
  const simdi = new Date("2026-06-10T06:00:00+03:00");
  const a0 = vakitPlani(ayar({ konum: IST, vakitBildirimi: sadeceOgle }), simdi, 1);
  const a15 = vakitPlani(ayar({ konum: IST, vakitBildirimi: sadeceOgle, dakikaOnce: 15 }), simdi, 1);
  check("dakika once: tam 15 dk", a0[0] !== undefined && a15[0] !== undefined && a0[0].an.getTime() - a15[0].an.getTime() === 15 * 60000);
  check("dakika once: id", a15[0]?.id === 202606102);
  check("dakika once: govde", a15[0]?.govde === "15 dakika sonra · İstanbul");
}
// Yuksek enlem
{
  let hata = false;
  let p: ReturnType<typeof vakitPlani> = [];
  try {
    p = vakitPlani(ayar({ konum: OSLO, vakitBildirimi: { ...VARSAYILAN_AYARLAR.vakitBildirimi, yatsi: true } }), new Date("2026-06-15T00:00:00Z"), 5);
  } catch {
    hata = true;
  }
  check("yuksek enlem: hata yok", !hata);
  check("yuksek enlem: yatsi basligi", p.every((x) => x.baslik === "Yatsı vakti"));
}
// Sinir
{
  const p = vakitPlani(ayar({ konum: IST, vakitBildirimi: tum }), new Date("2026-03-01T00:00:00+03:00"), 30);
  check("sinir: <= 180", p.length <= 180 && p.length > 150);
  check("sinir: benzersiz id", new Set(p.map((x) => x.id)).size === p.length);
  check("sinir: id k haneleri", p.every((x) => [0, 1, 2, 3, 4, 5].includes(x.id % 10)));
  check("sinir: VAKITLER 6", VAKITLER.length === 6);
}
// Konum yok
check("konum yok: bos", vakitPlani(ayar({ konum: null, vakitBildirimi: tum }), new Date()).length === 0);

// Ayet
{
  const simdi = new Date("2026-06-10T06:00:00+03:00");
  const k = (meal: string | null): AyetKaydi => ({ surahId: 2, verseNumber: 255, surahNameTr: "Bakara", surahSlug: "bakara", meal });
  const a = ayar({ konum: IST, ayetSaati: "08:00" });
  const p = ayetPlani(a, simdi, [k(null), k("x".repeat(200)), null]);
  check("ayet: null kayit atlanir (2)", p.length === 2);
  check("ayet: meal yok govde", p[0]?.govde === "Okumak için dokunun");
  check("ayet: baslik", p[0]?.baslik === "Günün ayeti — Bakara 255");
  check("ayet: url", p[0]?.url === "/bakara/255");
  check("ayet: id gun0 / gun1", p[0]?.id === 202606108 && p[1]?.id === 202606118);
  check("ayet: kirpilir ve ekle", (p[1]?.govde ?? "").endsWith("… — Diyanet İşleri") && (p[1]?.govde ?? "").length === 180 + " — Diyanet İşleri".length);
  check("ayet: 08:00 yerel", p[0]?.an.toISOString() === "2026-06-10T05:00:00.000Z");
  const gec = ayetPlani(a, new Date("2026-06-10T09:00:00+03:00"), [k("a"), k("b")]);
  check("ayet: gecmis gun0 atlanir", gec.length === 1 && gec[0]?.id === 202606118);
  check("ayet: kapali", ayetPlani(ayar({ konum: IST }), simdi, [k("a")]).length === 0);
}
// Gun sirasi
check("gun sirasi 1 Ocak", gununSiraNo(new Date("2026-01-01T00:30:00+03:00"), "Europe/Istanbul", 366) === 1);
check("gun sirasi modulo", gununSiraNo(new Date("2026-12-31T12:00:00+03:00"), "Europe/Istanbul", 100) === 365 % 100);

// Tekrar
{
  check("tekrar: kapali bos", tekrarPlani(ayar({ konum: IST, tekrarSaati: null }), new Date()).length === 0);
  const p = tekrarPlani(ayar({ konum: IST, tekrarSaati: "20:00" }), new Date("2026-06-10T06:00:00+03:00"), 14);
  check("tekrar: 14 bildirim", p.length === 14);
  check("tekrar: id/url/baslik", p[0]?.id === 202606109 && p[0]?.url === "/gunluk" && p[0]?.baslik === "Tekrar zamanı" && p[0]?.govde === "Bugünkü tekrarlarınız sizi bekliyor.");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
