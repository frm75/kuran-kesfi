/** Planlayici ciktisini Capacitor LocalNotifications'a uygulayan ince katman. */
import { LocalNotifications } from "@capacitor/local-notifications";
import { ayarDeposu, type IbadetAyarlari } from "./ayarlar.js";
import {
  ayetPlani,
  gununSiraNo,
  silinecekKimlikler,
  tekrarPlani,
  vakitPlani,
  varsayilanDilim,
  type AyetKaydi,
} from "./planla.js";

const AYET_GUN = 14;

interface ProgramGirdisi {
  dayIndex: number;
  surahId: number;
  verseNumber: number;
}

export interface YenilemeSecenegi {
  /**
   * Ayet bildirimlerine dokunma: indirme yapilmaz, bekleyen k=8 girdileri
   * korunur, sonPlanlama damgalanmaz (offline.html).
   */
  ayetAtla?: boolean;
}

async function getir<T>(yol: string): Promise<T | null> {
  try {
    const r = await fetch(yol);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * null = program indirilemedi (cevrimdisi, CSP connect-src 'none', https://localhost).
 * Dizi icindeki null = o gunun ayeti indirilemedi.
 */
async function ayetleriGetir(ayar: IbadetAyarlari, simdi: Date): Promise<Array<AyetKaydi | null> | null> {
  const program = await getir<{ entries: ProgramGirdisi[] }>("/data/schedule.json");
  if (!program || program.entries.length === 0) return null;
  const tz = ayar.konum?.saatDilimi ?? varsayilanDilim();
  const bugun = gununSiraNo(simdi, tz, program.entries.length);
  const sonuc: Array<AyetKaydi | null> = [];
  for (let i = 0; i < AYET_GUN; i += 1) {
    const e = program.entries[(bugun + i) % program.entries.length];
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

async function yenile(
  ayar: IbadetAyarlari,
  simdi: Date,
  secenek: YenilemeSecenegi,
): Promise<{ kurulan: number; kesin: boolean }> {
  // Sira: once indir ve plani kur, sonra ayni kimlikle yeniden planla (ayni id
  // eskisinin yerine gecer), en son yalniz bayatlari iptal et. Arada sayfa
  // degisip JS olurse bekleyen alarmlar kaybolmaz.
  const ayetAcik = ayar.ayetSaati !== null;
  const ayetler = ayetAcik && !secenek.ayetAtla ? await ayetleriGetir(ayar, simdi) : null;
  const ayetEksik = ayetAcik && (ayetler === null || ayetler.some((a) => a === null));
  const plan = [
    ...vakitPlani(ayar, simdi),
    ...ayetPlani(ayar, simdi, ayetler ?? []),
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

  const bekleyen = await LocalNotifications.getPending();
  const sil = silinecekKimlikler(
    bekleyen.notifications.map((n) => n.id),
    plan.map((p) => p.id),
    { ayetiKoru: ayetEksik },
  );
  if (sil.length > 0) await LocalNotifications.cancel({ notifications: sil.map((id) => ({ id })) });

  const kesin = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === "granted";
  // Program indirilemediyse damgalama: 12 saatlik esik yeniden denemeyi engellemesin.
  const damgala = !secenek.ayetAtla && !(ayetAcik && ayetler === null);
  if (damgala) {
    // Arada kaydedilen ayarlari ezmemek icin depoyu yeniden oku, yalniz damgayi yaz.
    const depo = ayarDeposu();
    await depo.yaz({ ...(await depo.oku()), sonPlanlama: simdi.toISOString() });
  }
  return { kurulan: plan.length, kesin };
}

type KkKuresel = typeof globalThis & { __kkBildirimSirasi?: Promise<unknown> };

/**
 * Ayni sayfadaki cagrilar (enjekte zamanla.js ve site betigi ayri paketlerdir)
 * tek bir global zincirde sirayla calisir; biri digerinin yeni kimliklerini
 * bayat sanip iptal etmez.
 */
export function bildirimleriYenile(
  ayar: IbadetAyarlari,
  simdi: Date = new Date(),
  secenek: YenilemeSecenegi = {},
): Promise<{ kurulan: number; kesin: boolean }> {
  const g = globalThis as KkKuresel;
  const onceki = g.__kkBildirimSirasi ?? Promise.resolve();
  const bu = onceki.catch(() => undefined).then(() => yenile(ayar, simdi, secenek));
  g.__kkBildirimSirasi = bu.catch(() => undefined);
  return bu;
}
