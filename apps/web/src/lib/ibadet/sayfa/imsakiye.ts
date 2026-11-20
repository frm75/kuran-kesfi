import { hicriTarih } from "../hicri.js";
import { VAKITLER, type Konum } from "../types.js";
import { aylikImsakiye, yerelGun } from "../vakit.js";
import { VAKIT_ADLARI, el, konumuBagla, saatYaz } from "./ortak.js";

const AYLAR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

let konum: Konum | null = null;
let yil = 0;
let ay = 0;

function ramazanMi(tz: string): boolean {
  return [1, 15, 28].some(
    (g) => hicriTarih(new Date(Date.UTC(yil, ay - 1, g, 12)), tz).ay === 9,
  );
}

function ciz(): void {
  const bolum = el("ib-imsakiye");
  if (konum === null) {
    bolum.hidden = true;
    return;
  }
  const tz = konum.saatDilimi;
  const ad = `${AYLAR[ay - 1] ?? ""} ${String(yil)}`;
  el("ib-imsakiye-baslik").textContent = ramazanMi(tz)
    ? `Ramazan imsakiyesi — ${ad}`
    : `${ad} imsakiyesi`;
  const tablo = el("ib-imsakiye-tablo");
  tablo.replaceChildren();
  const bas = tablo.createTHead().insertRow();
  for (const b of ["Gün", ...VAKITLER.map((v) => VAKIT_ADLARI[v])]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = b;
    bas.append(th);
  }
  const govde = tablo.createTBody();
  const bugun = yerelGun(new Date(), tz);
  for (const satir of aylikImsakiye(yil, ay, konum)) {
    const tr = govde.insertRow();
    if (bugun.yil === yil && bugun.ay === ay && bugun.gun === satir.gun) {
      tr.setAttribute("aria-current", "date");
    }
    tr.insertCell().textContent = String(satir.gun);
    for (const v of VAKITLER) tr.insertCell().textContent = saatYaz(satir[v], tz);
  }
  bolum.hidden = false;
}

function git(fark: number): void {
  const d = new Date(Date.UTC(yil, ay - 1 + fark, 1));
  yil = d.getUTCFullYear();
  ay = d.getUTCMonth() + 1;
  ciz();
}

el("ib-onceki").addEventListener("click", () => git(-1));
el("ib-sonraki").addEventListener("click", () => git(1));

void konumuBagla((k) => {
  if (k !== null && (konum === null || konum.saatDilimi !== k.saatDilimi || yil === 0)) {
    const g = yerelGun(new Date(), k.saatDilimi);
    yil = g.yil;
    ay = g.ay;
  }
  konum = k;
  ciz();
});
