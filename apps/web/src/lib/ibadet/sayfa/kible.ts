import { kibleAcisi } from "../kible.js";
import type { Konum } from "../types.js";
import { el, konumuBagla } from "./ortak.js";

let dinleniyor = false;
let sensorGeldi = false;

function sensorDinle(): void {
  if (dinleniyor) return;
  dinleniyor = true;
  const durum = el("ib-kible-sensor");
  durum.textContent = "";
  window.addEventListener("deviceorientationabsolute", (e) => {
    const alfa = (e as DeviceOrientationEvent).alpha;
    if (alfa === null || alfa === undefined) return;
    sensorGeldi = true;
    durum.textContent = "Pusula açık: oku kıble yönüne çevirin.";
    el("ib-kible-kalibre").hidden = false;
    // alfa saat yönünün tersine ölçülür; kuzey işaretini ters yönde döndürürüz.
    el("ib-kadran").setAttribute("transform", `rotate(${String(alfa)})`);
  });
  window.setTimeout(() => {
    if (!sensorGeldi) {
      durum.textContent = "Pusula sensörü bulunamadı; telefonu kuzeye çevirip oku izleyin";
    }
  }, 2000);
}

function ciz(k: Konum | null): void {
  const bolum = el("ib-kible");
  if (k === null) {
    bolum.hidden = true;
    return;
  }
  const aci = kibleAcisi(k.enlem, k.boylam);
  el("ib-kible-aci").textContent = `Kıble: kuzeyden saat yönünde ${aci.toFixed(1)}°`;
  el("ib-kible-ok").setAttribute("transform", `rotate(${aci.toFixed(2)})`);
  bolum.hidden = false;
  sensorDinle();
}

void konumuBagla(ciz);
