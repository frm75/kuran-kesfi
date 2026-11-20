/** Planlayici ciktisini Capacitor LocalNotifications'a uygulayan ince katman. */
import { LocalNotifications } from "@capacitor/local-notifications";
import { ayarDeposu, type IbadetAyarlari } from "./ayarlar.js";
import { ayetPlani, gununSiraNo, tekrarPlani, vakitPlani, type AyetKaydi } from "./planla.js";

const AYET_GUN = 14;

interface ProgramGirdisi {
  dayIndex: number;
  surahId: number;
  verseNumber: number;
}

function bizimId(id: number): boolean {
  const k = id % 10;
  return (k <= 5 || k === 8 || k === 9) && id >= 20000101 * 10 && id <= 21001231 * 10 + 9;
}

async function getir<T>(yol: string): Promise<T | null> {
  try {
    const r = await fetch(yol);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

async function ayetleriGetir(ayar: IbadetAyarlari, simdi: Date): Promise<Array<AyetKaydi | null>> {
  if (ayar.ayetSaati === null) return [];
  const program = await getir<{ entries: ProgramGirdisi[] }>("/data/schedule.json");
  if (!program || program.entries.length === 0) return [];
  const tz = ayar.konum?.saatDilimi ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const bugun = gununSiraNo(simdi, tz, program.entries.length);
  const sonuc: Array<AyetKaydi | null> = [];
  for (let i = 0; i < AYET_GUN; i += 1) {
    const e =
      program.entries.find((x) => x.dayIndex === (bugun + i) % program.entries.length) ??
      program.entries[(bugun + i) % program.entries.length];
    if (!e) {
      sonuc.push(null);
      continue;
    }
    const v = await getir<{
      surahSlug: string;
      surahNameTr: string;
      verseNumber: number;
      translations: Array<{ authorSlug: string; text: string }>;
    }>(`/data/verse/verse_${e.surahId}_${e.verseNumber}.json`);
    sonuc.push(
      v === null
        ? null
        : {
            surahId: e.surahId,
            verseNumber: v.verseNumber,
            surahNameTr: v.surahNameTr,
            surahSlug: v.surahSlug,
            meal: v.translations.find((t) => t.authorSlug === "diyanet-isleri")?.text ?? null,
          },
    );
  }
  return sonuc;
}

export async function bildirimleriYenile(
  ayar: IbadetAyarlari,
  simdi: Date = new Date(),
): Promise<{ kurulan: number; kesin: boolean }> {
  const bekleyen = await LocalNotifications.getPending();
  const eski = bekleyen.notifications.filter((n) => bizimId(n.id));
  if (eski.length > 0) await LocalNotifications.cancel({ notifications: eski.map((n) => ({ id: n.id })) });

  const ayetler = await ayetleriGetir(ayar, simdi);
  const plan = [
    ...vakitPlani(ayar, simdi),
    ...ayetPlani(ayar, simdi, ayetler),
    ...tekrarPlani(ayar, simdi),
  ];
  if (plan.length > 0) {
    await LocalNotifications.schedule({
      notifications: plan.map((p) => ({
        id: p.id,
        title: p.baslik,
        body: p.govde,
        schedule: { at: p.an, allowWhileIdle: true },
        extra: { url: p.url },
      })),
    });
  }
  const kesin = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === "granted";
  await ayarDeposu().yaz({ ...ayar, sonPlanlama: simdi.toISOString() });
  return { kurulan: plan.length, kesin };
}
