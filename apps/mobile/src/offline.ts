/** offline.html: son konumla bugünün vakitleri ve kıble; bildirimleri yeniden kurar. */
import { ayarDeposu } from "../../web/src/lib/ibadet/ayarlar";
import { kibleAcisi } from "../../web/src/lib/ibadet/kible";
import { bildirimleriYenile } from "../../web/src/lib/ibadet/uygula";
import { VAKITLER } from "../../web/src/lib/ibadet/types";
import { gunVakitleri, siradakiVakit, yerelGun } from "../../web/src/lib/ibadet/vakit";
import { cihazDilimi, saatYaz, VAKIT_ADLARI } from "../../web/src/lib/ibadet/sayfa/ortak";

function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} yok`);
  return e;
}

async function calistir(): Promise<void> {
  el("tekrar").addEventListener("click", () => {
    location.href = "https://kurankesfi.tr";
  });

  const ayar = await ayarDeposu().oku();
  const konum = ayar.konum;
  if (konum === null) {
    el("mesaj").hidden = false;
    return;
  }
  const tz = konum.saatDilimi || cihazDilimi();
  const simdi = new Date();
  const vakitler = gunVakitleri(yerelGun(simdi, tz), konum);
  const sira = siradakiVakit(simdi, konum);

  el("konum-ad").textContent = konum.ad;
  const liste = el("vakitler");
  for (const v of VAKITLER) {
    const li = document.createElement("li");
    if (sira?.ad === v) li.setAttribute("aria-current", "true");
    const ad = document.createElement("span");
    ad.textContent = VAKIT_ADLARI[v];
    const saat = document.createElement("span");
    saat.textContent = saatYaz(vakitler[v], tz);
    li.append(ad, saat);
    liste.append(li);
  }
  el("kible").textContent = `Kıble: kuzeyden saat yönünde ${kibleAcisi(konum.enlem, konum.boylam).toFixed(1)}°`;
  el("icerik").hidden = false;

  // Ayet metni siteden indirilir; burada (https://localhost) indirilemez.
  // Bekleyen ayet bildirimleri yerinde kalir, yalnız vakit ve tekrar yenilenir.
  try {
    await bildirimleriYenile(ayar, simdi, { ayetAtla: true });
  } catch (h) {
    console.warn("bildirimler yenilenemedi", h);
  }
}

void calistir();
