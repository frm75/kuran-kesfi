import { swKaydet } from "../sw-kaydet.js";
import { ayarDeposu, type IbadetAyarlari } from "../ayarlar.js";
import { VAKITLER } from "../types.js";
import { VAKIT_ADLARI, el } from "./ortak.js";

const depo = ayarDeposu();
const kesinUyari = el("ib-kesin-uyari");

function mesaj(metin: string): void {
  const m = el("ib-ayar-mesaj");
  m.textContent = metin;
  m.hidden = false;
}

async function kesinKontrol(): Promise<boolean> {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === "granted";
}

class IzinHatasi extends Error {}

async function izinIste(): Promise<void> {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const durum = await LocalNotifications.checkPermissions();
  if (durum.display === "granted") return;
  const s = await LocalNotifications.requestPermissions();
  if (s.display !== "granted") throw new IzinHatasi();
}

function dolduFormu(a: IbadetAyarlari): void {
  const kap = el("ib-vakit-secenekler");
  kap.replaceChildren();
  for (const v of VAKITLER) {
    const l = document.createElement("label");
    l.className = "ib-onay";
    const c = document.createElement("input");
    c.type = "checkbox";
    c.name = v;
    c.checked = a.vakitBildirimi[v];
    l.append(c, ` ${VAKIT_ADLARI[v]}`);
    kap.append(l);
  }
  el<HTMLSelectElement>("ib-dakika-once").value = String(a.dakikaOnce);
  el<HTMLInputElement>("ib-ayet-acik").checked = a.ayetSaati !== null;
  el<HTMLInputElement>("ib-ayet-saat").value = a.ayetSaati ?? "08:00";
  el<HTMLInputElement>("ib-tekrar-acik").checked = a.tekrarSaati !== null;
  el<HTMLInputElement>("ib-tekrar-saat").value = a.tekrarSaati ?? "20:00";
}

function formdanOku(taban: IbadetAyarlari): IbadetAyarlari {
  const vakitBildirimi = { ...taban.vakitBildirimi };
  for (const v of VAKITLER) {
    vakitBildirimi[v] = el("ib-vakit-secenekler").querySelector<HTMLInputElement>(`input[name="${v}"]`)?.checked ?? false;
  }
  const dakika = Number(el<HTMLSelectElement>("ib-dakika-once").value) as IbadetAyarlari["dakikaOnce"];
  return {
    ...taban,
    vakitBildirimi,
    dakikaOnce: dakika,
    ayetSaati: el<HTMLInputElement>("ib-ayet-acik").checked ? el<HTMLInputElement>("ib-ayet-saat").value || "08:00" : null,
    tekrarSaati: el<HTMLInputElement>("ib-tekrar-acik").checked ? el<HTMLInputElement>("ib-tekrar-saat").value || "20:00" : null,
  };
}

function herhangiAcik(a: IbadetAyarlari): boolean {
  return Object.values(a.vakitBildirimi).some(Boolean) || a.ayetSaati !== null || a.tekrarSaati !== null;
}

async function baslat(): Promise<void> {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) {
    el("ib-web-not").hidden = false;
    return;
  }
  const form = el<HTMLFormElement>("ib-ayar-form");
  let ayar = await depo.oku();
  dolduFormu(ayar);
  form.hidden = false;
  if (herhangiAcik(ayar)) {
    try {
      kesinUyari.hidden = await kesinKontrol();
    } catch {
      mesaj("Alarm izni durumu okunamadı.");
    }
  }

  // İzin, bildirim ilk kez açıldığında istenir.
  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === "checkbox" && t.checked && !herhangiAcik(ayar)) {
      izinIste().catch((h: unknown) => {
        mesaj(
          h instanceof IzinHatasi
            ? "Bildirim izni verilmedi; telefon ayarlarından açabilirsiniz."
            : "Bildirim izni istenemedi.",
        );
      });
    }
  });

  el("ib-kesin-dugme").addEventListener("click", () => {
    void import("@capacitor/local-notifications")
      .then(({ LocalNotifications }) => LocalNotifications.changeExactNotificationSetting())
      .then((r) => {
        kesinUyari.hidden = r.exact_alarm === "granted";
      })
      .catch(() => mesaj("Alarm izni ayarı açılamadı; telefon ayarlarından Alarmlar ve hatırlatıcılar iznini verin."));
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void (async () => {
      try {
        const yeni = formdanOku(await depo.oku());
        await depo.yaz(yeni);
        ayar = yeni;
        if (herhangiAcik(yeni)) await izinIste();
        const { bildirimleriYenile } = await import("../uygula.js");
        const s = await bildirimleriYenile(yeni);
        kesinUyari.hidden = s.kesin || s.kurulan === 0;
        const konumYok = yeni.konum === null && Object.values(yeni.vakitBildirimi).some(Boolean);
        mesaj(
          konumYok
            ? "Kaydedildi. Vakit bildirimleri için önce Vakitler sayfasında konum seçin."
            : `Kaydedildi. ${String(s.kurulan)} bildirim kuruldu.`,
        );
      } catch (hata) {
        console.error("ibadet ayarlar", hata);
        mesaj(
          hata instanceof IzinHatasi
            ? "Bildirim izni verilmedi; telefon ayarlarından açabilirsiniz."
            : `Kaydedilemedi: ${hata instanceof Error ? hata.message : "bilinmeyen hata"}`,
        );
      }
    })();
  });
}

void baslat();

void swKaydet();
