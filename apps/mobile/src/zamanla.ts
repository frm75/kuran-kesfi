/** Sayfaya enjekte edilen paket: bildirime dokunma, planlama, SW kaydı. */
import { LocalNotifications } from "@capacitor/local-notifications";
import { ayarDeposu } from "../../web/src/lib/ibadet/ayarlar";
import { swKaydet } from "../../web/src/lib/ibadet/sw-kaydet";
import { bildirimleriYenile } from "../../web/src/lib/ibadet/uygula";

const ON_IKI_SAAT = 12 * 60 * 60 * 1000;

type KkPencere = Window & { __kkZamanla?: boolean };

async function planla(): Promise<void> {
  const depo = ayarDeposu();
  const ayar = await depo.oku();
  const son = ayar.sonPlanlama === null ? Number.NaN : Date.parse(ayar.sonPlanlama);
  if (Number.isNaN(son) || Date.now() - son > ON_IKI_SAAT) {
    await bildirimleriYenile(ayar);
  }
}

function basla(): void {
  const w = window as KkPencere;
  if (w.__kkZamanla) return;
  w.__kkZamanla = true;

  void LocalNotifications.addListener("localNotificationActionPerformed", (e) => {
    const url = (e.notification.extra as { url?: unknown } | null | undefined)?.url;
    if (typeof url === "string" && url.startsWith("/")) location.assign(url);
  });

  planla().catch((h: unknown) => {
    console.warn("planlama başarısız", h);
  });

  if (location.host === "kurankesfi.tr") void swKaydet();
}

basla();
