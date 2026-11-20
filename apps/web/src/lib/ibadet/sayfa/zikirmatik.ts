import { swKaydet } from "../sw-kaydet.js";
import { el } from "./ortak.js";

const ANAHTAR = "ibadet.zikir";
interface Durum {
  sayac: number;
  hedef: number;
}
const HAZIR = [33, 99, 100];

function oku(): Durum {
  try {
    const o = JSON.parse(localStorage.getItem(ANAHTAR) ?? "null") as Partial<Durum> | null;
    const sayac = Number(o?.sayac);
    const hedef = Number(o?.hedef);
    return {
      sayac: Number.isInteger(sayac) && sayac >= 0 ? sayac : 0,
      hedef: Number.isInteger(hedef) && hedef >= 1 ? hedef : 33,
    };
  } catch {
    return { sayac: 0, hedef: 33 };
  }
}

let durum = oku();
let ozelSecili = !HAZIR.includes(durum.hedef);

function kaydet(): void {
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify(durum));
  } catch {
    /* depolama kapalı */
  }
}

const sec = el<HTMLSelectElement>("ib-zikir-hedef");
const ozel = el<HTMLInputElement>("ib-zikir-ozel");

function ciz(): void {
  el("ib-zikir-sayi").textContent = String(durum.sayac);
  el("ib-zikir-durum").textContent =
    durum.sayac >= durum.hedef
      ? `Hedefe ulaşıldı (${String(durum.hedef)})`
      : `Hedef: ${String(durum.hedef)} · kalan ${String(durum.hedef - durum.sayac)}`;
  if (ozelSecili) {
    // "Özel" seçiliyken (sayı girilmemiş olsa da) seçim ve kutu korunur.
    sec.value = "ozel";
    el("ib-zikir-ozel-kap").hidden = false;
    if (document.activeElement !== ozel && !HAZIR.includes(durum.hedef)) ozel.value = String(durum.hedef);
    return;
  }
  sec.value = String(durum.hedef);
  el("ib-zikir-ozel-kap").hidden = true;
}

el("ib-zikir-say").addEventListener("click", () => {
  const once = durum.sayac;
  durum.sayac += 1;
  // Hedefin altından üstüne geçişte bir kez titre.
  if (once < durum.hedef && durum.sayac >= durum.hedef && "vibrate" in navigator) navigator.vibrate(200);
  kaydet();
  ciz();
});
el("ib-zikir-sifirla").addEventListener("click", () => {
  durum.sayac = 0;
  kaydet();
  ciz();
});
sec.addEventListener("change", () => {
  if (sec.value === "ozel") {
    ozelSecili = true;
    ciz();
    ozel.focus();
    return;
  }
  ozelSecili = false;
  durum.hedef = Number(sec.value);
  kaydet();
  ciz();
});
ozel.addEventListener("input", () => {
  const n = Math.floor(Number(ozel.value));
  if (n >= 1 && n <= 100000) {
    durum.hedef = n;
    kaydet();
    el("ib-zikir-durum").textContent = `Hedef: ${String(n)} · kalan ${String(Math.max(0, n - durum.sayac))}`;
  }
});

ciz();

void swKaydet();
