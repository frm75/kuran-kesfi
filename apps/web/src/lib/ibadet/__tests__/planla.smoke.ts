/**
 * Bildirim planlayici duman testleri. TZ=Asia/Tokyo ile de calistirilir.
 */
import { VARSAYILAN_AYARLAR, type IbadetAyarlari } from "../ayarlar.js";
import { vakitPlani, ayetPlani, tekrarPlani, gununSiraNo, bizimId, silinecekKimlikler, type AyetKaydi } from "../planla.js";
import { gunVakitleri } from "../vakit.js";
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
const OSLO: Konum = { ad: "Tromsø", enlem: 69.65, boylam: 18.96, saatDilimi: "Europe/Oslo" };
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
// Dakika once gecmise iter
{
  const ogle = gunVakitleri({ yil: 2026, ay: 6, gun: 10 }, IST).ogle as Date;
  const simdi = new Date(ogle.getTime() - 10 * 60000);
  const p = vakitPlani(ayar({ konum: IST, vakitBildirimi: sadeceOgle, dakikaOnce: 15 }), simdi, 2);
  check("dakika once gecmise: bugun yok, yarin var", p.length === 1 && p[0]?.id === 202606112);
}
// Yuksek enlem
{
  const bas = new Date("2026-05-05T12:00:00Z");
  const yatsiAyar = ayar({ konum: OSLO, vakitBildirimi: { ...VARSAYILAN_AYARLAR.vakitBildirimi, yatsi: true } });
  let hata = false;
  let p: ReturnType<typeof vakitPlani> = [];
  try {
    p = vakitPlani(yatsiAyar, bas, 30);
  } catch {
    hata = true;
  }
  let dolu = 0;
  let bos = 0;
  for (let i = 0; i < 30; i += 1) {
    const d = new Date(Date.UTC(2026, 4, 5 + i));
    const y = gunVakitleri({ yil: d.getUTCFullYear(), ay: d.getUTCMonth() + 1, gun: d.getUTCDate() }, OSLO).yatsi;
    if (y === null) bos += 1;
    else dolu += 1;
  }
  check("yuksek enlem: hata yok", !hata);
  check("yuksek enlem: hem dolu hem null gun var", dolu > 0 && bos > 0);
  check("yuksek enlem: yatsi sayisi = null olmayan gun", p.length === dolu);
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

// Bayat kimlik hesabi (bildirimleriYenile: once kur, sonra yalniz bayatlari iptal et)
{
  check("bizimId: vakit/ayet/tekrar", bizimId(202606100) && bizimId(202606105) && bizimId(202606108) && bizimId(202606109));
  check("bizimId: k=6,7 degil", !bizimId(202606106) && !bizimId(202606107));
  check("bizimId: yabanci kimlik degil", !bizimId(1) && !bizimId(42) && !bizimId(-202606100) && !bizimId(2026061.5));
  const bekleyen = [202606100, 202606102, 202606108, 202606118, 202606109, 42, 202606102];
  const plan = [202606102, 202606112, 202606109];
  const sil = silinecekKimlikler(bekleyen, plan, { ayetiKoru: false });
  check("bayat: plan disi bizim kimlikler", JSON.stringify([...sil].sort()) === JSON.stringify([202606100, 202606108, 202606118]));
  check("bayat: yeni plandaki silinmez", !sil.includes(202606102) && !sil.includes(202606109));
  check("bayat: yabanci (42) silinmez", !sil.includes(42));
  check("bayat: tekrar eden bekleyen tek kez", sil.length === new Set(sil).size);
  const koru = silinecekKimlikler(bekleyen, plan, { ayetiKoru: true });
  check("bayat: ayet indirilemedi -> k=8 korunur", JSON.stringify(koru) === JSON.stringify([202606100]));
  check("bayat: bekleyen yok", silinecekKimlikler([], plan, { ayetiKoru: false }).length === 0);
  // Ayet kapatildi: plan k=8 icermez, koruma yok -> tum k=8 iptal
  const kapali = silinecekKimlikler([202606108, 202606118], [], { ayetiKoru: false });
  check("bayat: ayet kapali -> k=8 iptal", kapali.length === 2);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
