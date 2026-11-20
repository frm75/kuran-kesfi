import { swKaydet } from "../sw-kaydet.js";
import { hicriTarih } from "../hicri.js";
import { yerelGun } from "../vakit.js";
import { AYLAR, cihazDilimi, ayarlariOku, el } from "./ortak.js";

const GUNLER = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

async function baslat(): Promise<void> {
  const ayar = await ayarlariOku();
  const tz = ayar.konum?.saatDilimi ?? cihazDilimi();
  const simdi = new Date();
  el("ib-hicri-bugun").textContent = `Bugün: ${hicriTarih(simdi, tz).metin}`;
  const { yil, ay, gun } = yerelGun(simdi, tz);
  el("ib-takvim-baslik").textContent = `${AYLAR[ay - 1] ?? ""} ${String(yil)}`;
  const tablo = el("ib-takvim-tablo");
  const bas = tablo.createTHead().insertRow();
  for (const b of ["Miladi", "Gün", "Hicri"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = b;
    bas.append(th);
  }
  const govde = tablo.createTBody();
  const sayi = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
  for (let g = 1; g <= sayi; g += 1) {
    // Öğle 12:00 UTC: takvim günü, saat dilimi kaymasından etkilenmez.
    const d = new Date(Date.UTC(yil, ay - 1, g, 12));
    const tr = govde.insertRow();
    if (g === gun) tr.setAttribute("aria-current", "date");
    tr.insertCell().textContent = `${String(g)} ${AYLAR[ay - 1] ?? ""}`;
    tr.insertCell().textContent = GUNLER[d.getUTCDay()] ?? "";
    tr.insertCell().textContent = hicriTarih(d, "UTC").metin;
  }
}

void baslat();

void swKaydet();
