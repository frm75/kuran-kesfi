/**
 * FSRS zamanlayici duman testleri.
 *
 * Buradaki testler "kod calisiyor mu" testi degil; ALGORITMANIN AYIRT EDICI
 * DAVRANISLARININ hala dogru oldugunu dogrular. Bir gun biri bu dosyayi
 * "sadelestirip" SM-2'ye dondururse testler duser:
 *
 *   1. Zorluk ve kararlilik AYRI degisir — "zor ama hatirladim" araligi
 *      kisaltmakla kalmaz, zorlugu KALICI olarak yukseltir (FSRS'in SM-2'den
 *      farki tam burasi)
 *   2. Unutmak kararliligi sifirlamaz, geriye duşurur
 *   3. Gec kalinmis dogru cevap daha cok kararlilik kazandirir
 *   4. Aralik en az 1 gun, en cok 3 yil
 *
 * Calistirma:  pnpm --filter @kuran/web test:smoke
 */

import { addDays, initialState, intervalDays, nextState } from "../fsrs.js";
import type { Rating } from "../fsrs.js";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.error(`  HATA ${label}`);
  }
}

console.log("1. Ilk tekrar");

const ratings: Rating[] = [1, 2, 3, 4];
const initial = ratings.map((r) => initialState(r));

check(
  "iyi bilinen ayet unutulandan daha kararli baslar",
  (initial[2]?.stability ?? 0) > (initial[0]?.stability ?? 0),
);
check(
  "kolay bilinen ayet iyi bilinenden daha kararli baslar",
  (initial[3]?.stability ?? 0) > (initial[2]?.stability ?? 0),
);
check(
  "unutulan ayet en zor baslar",
  (initial[0]?.difficulty ?? 0) > (initial[3]?.difficulty ?? 0),
);
check(
  "zorluk her zaman 1-10 araliginda",
  initial.every((s) => s.difficulty >= 1 && s.difficulty <= 10),
);

console.log("2. FSRS'in SM-2'den farki: zorluk kalici");

const base = initialState(3);
const afterHard = nextState(base, 2, 10);
const afterGood = nextState(base, 3, 10);
const afterEasy = nextState(base, 4, 10);

check(
  "'zor' zorlugu YUKSELTIR (SM-2 yalnizca araligi kisaltirdi)",
  afterHard.difficulty > base.difficulty,
);
check("'kolay' zorlugu DUSURUR", afterEasy.difficulty < base.difficulty);
check(
  "ayni gecmisle 'zor' 'iyi'den daha az kararlilik kazandirir",
  afterHard.stability < afterGood.stability,
);
check(
  "ayni gecmisle 'kolay' 'iyi'den daha cok kararlilik kazandirir",
  afterEasy.stability > afterGood.stability,
);

console.log("3. Unutma");

const grown = nextState(nextState(base, 3, 5), 3, 20);
const forgotten = nextState(grown, 1, 30);

check("unutmak kararliligi DUSURUR", forgotten.stability < grown.stability);
check(
  "unutmak kararliligi sifirlamaz — bir kez ogrenilen ayet sifirdan baslamaz",
  forgotten.stability > 0,
);
check("unutmak zorlugu yukseltir", forgotten.difficulty > grown.difficulty);

console.log("4. Gecikme");

const onTime = nextState(base, 3, 1);
const late = nextState(base, 3, 30);

check(
  "gec kalinmis dogru cevap daha cok kararlilik kazandirir",
  late.stability > onTime.stability,
);

console.log("5. Aralik");

check("aralik en az 1 gun", intervalDays(0.01) >= 1);
check("aralik 3 yili asmaz", intervalDays(100_000) <= 365 * 3);
check("aralik kararlilikla birlikte buyur", intervalDays(50) > intervalDays(5));
check("aralik tam sayi", Number.isInteger(intervalDays(12.7)));

const from = new Date("2026-09-07T10:00:00.000Z");
check("addDays gun ekler", addDays(from, 3).startsWith("2026-09-10"));
check("addDays ay sinirini gecer", addDays(new Date("2026-09-29T10:00:00.000Z"), 3).startsWith("2026-10-02"));

console.log("6. Kararlilik uzun vadede buyur");

let state = initialState(3);
let days = intervalDays(state.stability);
for (let i = 0; i < 8; i += 1) {
  const next = nextState(state, 3, days);
  const nextDays = intervalDays(next.stability);
  if (nextDays < days) {
    failures.push(`surekli 'iyi' cevapta aralik kuculdu (adim ${String(i)}: ${String(days)} -> ${String(nextDays)})`);
    break;
  }
  state = next;
  days = nextDays;
}
check("surekli 'iyi' cevapta aralik hep buyur", days > 1);
check("sekiz dogru tekrardan sonra aralik aylara ciker", days >= 30);

console.log("");
if (failures.length > 0) {
  console.error(`${String(passed)} test gecti, ${String(failures.length)} basarisiz:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`${String(passed)} test gecti, 0 basarisiz`);
