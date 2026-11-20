/** /ibadet sayfalarının ortak istemci yardımcıları. */
import { ayarDeposu, type IbadetAyarlari } from "../ayarlar.js";
import { sehirAra } from "../sehir.js";
import type { Konum, VakitAdi } from "../types.js";

export const VAKIT_ADLARI: Record<VakitAdi, string> = {
  imsak: "İmsak",
  gunes: "Güneş",
  ogle: "Öğle",
  ikindi: "İkindi",
  aksam: "Akşam",
  yatsi: "Yatsı",
};

export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} yok`);
  return e as T;
}

export function saatYaz(d: Date | null, saatDilimi: string): string {
  if (d === null) return "hesaplanamadı";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: saatDilimi,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

export function cihazDilimi(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export async function ayarlariOku(): Promise<IbadetAyarlari> {
  return ayarDeposu().oku();
}

let sehirler: Konum[] | null = null;
async function sehirleriGetir(): Promise<Konum[]> {
  if (sehirler) return sehirler;
  const r = await fetch("/ibadet/sehirler.json");
  if (!r.ok) throw new Error("sehir listesi");
  sehirler = ((await r.json()) as { kayitlar: Konum[] }).kayitlar;
  return sehirler;
}

async function gpsKonumu(): Promise<{ enlem: number; boylam: number }> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    const p = await Geolocation.getCurrentPosition({ timeout: 15000 });
    return { enlem: p.coords.latitude, boylam: p.coords.longitude };
  }
  return new Promise((coz, red) => {
    if (!("geolocation" in navigator)) {
      red(new Error("yok"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => coz({ enlem: p.coords.latitude, boylam: p.coords.longitude }),
      (h) => red(new Error(String(h.code))),
      { timeout: 15000 },
    );
  });
}

function mesaj(metin: string | null): void {
  const m = el("ib-konum-mesaj");
  m.hidden = metin === null;
  m.textContent = metin ?? "";
}

/**
 * Konum seçiciyi bağlar. Geçerli konumu (varsa) `degisti`'ye verir; kullanıcı
 * yeni konum seçince de çağrılır. Konum ayar deposunda saklanır (sayfalar arası ortak).
 */
export async function konumuBagla(degisti: (k: Konum | null) => void): Promise<void> {
  const depo = ayarDeposu();
  let ayar = await depo.oku();
  const adYaz = (k: Konum | null): void => {
    el("ib-konum-ad").textContent = k
      ? `${k.ad} (${k.saatDilimi})`
      : "Konum seçilmedi.";
  };
  const sec = async (k: Konum, kaynak: "gps" | "elle"): Promise<void> => {
    ayar = { ...(await depo.oku()), konum: k, konumKaynagi: kaynak };
    await depo.yaz(ayar);
    adYaz(k);
    mesaj(null);
    el("ib-sehir-liste").hidden = true;
    degisti(k);
  };

  adYaz(ayar.konum);
  degisti(ayar.konum);

  el("ib-konum-gps").addEventListener("click", () => {
    mesaj("Konum alınıyor…");
    gpsKonumu().then(
      (p) => sec({ ad: "Konumum", ...p, saatDilimi: cihazDilimi() }, "gps"),
      () =>
        mesaj(
          "Konum alınamadı. İzin verilmemiş ya da cihaz konumu kapalı olabilir; aşağıdan şehir arayın.",
        ),
    );
  });

  const kutu = el<HTMLInputElement>("ib-sehir-ara");
  const liste = el("ib-sehir-liste");
  kutu.addEventListener("input", () => {
    const q = kutu.value;
    if (q.trim() === "") {
      liste.hidden = true;
      return;
    }
    sehirleriGetir().then(
      (tum) => {
        if (kutu.value !== q) return;
        const bulunan = sehirAra(tum, q, 12);
        liste.replaceChildren();
        for (const k of bulunan) {
          const li = document.createElement("li");
          const b = document.createElement("button");
          b.type = "button";
          b.className = "g-btn";
          b.textContent = k.ad;
          b.addEventListener("click", () => {
            void sec(k, "elle");
            kutu.value = "";
          });
          li.append(b);
          liste.append(li);
        }
        if (bulunan.length === 0) mesaj("Eşleşen şehir bulunamadı.");
        else mesaj(null);
        liste.hidden = bulunan.length === 0;
      },
      () => mesaj("Şehir listesi yüklenemedi."),
    );
  });
}
