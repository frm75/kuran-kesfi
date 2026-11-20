import { gunVakitleri, siradakiVakit, yerelGun } from "../vakit.js";
import { VAKITLER, type Konum } from "../types.js";
import { VAKIT_ADLARI, el, konumuBagla, saatYaz } from "./ortak.js";

let konum: Konum | null = null;
let zamanlayici: number | undefined;

function kalan(ms: number): string {
  const dk = Math.max(0, Math.floor(ms / 60000));
  const s = Math.floor(dk / 60);
  return s > 0 ? `${String(s)} sa ${String(dk % 60)} dk` : `${String(dk)} dk`;
}

function ciz(): void {
  const bolum = el("ib-vakitler");
  if (konum === null) {
    bolum.hidden = true;
    return;
  }
  const simdi = new Date();
  const v = gunVakitleri(yerelGun(simdi, konum.saatDilimi), konum);
  const sira = siradakiVakit(simdi, konum);
  const liste = el("ib-vakit-liste");
  liste.replaceChildren();
  for (const ad of VAKITLER) {
    const li = document.createElement("li");
    li.className = "ib-vakit";
    if (sira?.ad === ad) {
      li.setAttribute("aria-current", "true");
      li.dataset["sira"] = "1";
    }
    const a = document.createElement("span");
    a.textContent = VAKIT_ADLARI[ad];
    const s = document.createElement("span");
    s.className = "ib-vakit-saat";
    s.textContent = saatYaz(v[ad], konum.saatDilimi);
    li.append(a, s);
    liste.append(li);
  }
  el("ib-sayac").textContent = sira
    ? `${VAKIT_ADLARI[sira.ad]} vaktine ${kalan(sira.an.getTime() - simdi.getTime())} kaldı`
    : "Sıradaki vakit hesaplanamadı";
  bolum.hidden = false;
}

void konumuBagla((k) => {
  konum = k;
  ciz();
  window.clearInterval(zamanlayici);
  if (k !== null) zamanlayici = window.setInterval(ciz, 60000);
});
