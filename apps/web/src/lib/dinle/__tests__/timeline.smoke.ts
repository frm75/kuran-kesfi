/**
 * Calan kelimeyi bulma — plan 04, Gorev 4.
 *
 * Calistirma:  pnpm --filter @kuran/web test:smoke
 */

import { activeWordIndex } from "../timeline";

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

// 4 kelime: [0, 580, 1409, 2502] baslangiclar, 5840 son bitis
const starts = [0, 580, 1409, 2502, 5840];

console.log("1. Sinirlar");
check("t=0 ilk kelime", activeWordIndex(starts, 0) === 0);
check("t=579 hala ilk", activeWordIndex(starts, 579) === 0);
check("t=580 ikinci kelime", activeWordIndex(starts, 580) === 1);
check("t=2502 dorduncu kelime", activeWordIndex(starts, 2502) === 3);
check("t=5839 hala dorduncu", activeWordIndex(starts, 5839) === 3);

console.log("2. Disarisi");
check("son bitisten sonra -1", activeWordIndex(starts, 5840) === -1);
check("cok sonra -1", activeWordIndex(starts, 99999) === -1);
check("negatif zaman -1", activeWordIndex(starts, -5) === -1);

console.log("3. Ayni ms'de baslayan kelimeler");
{
  // Aradegerlemede iki kelime ayni ms'ye dusebilir; sonuncusu kazanmali ki
  // isik ileri gitsin, takilmasin.
  const tied = [0, 1000, 1000, 2000];
  check("esitlikte sonraki kelime", activeWordIndex(tied, 1000) === 2);
}

console.log("4. Bozuk girdi");
check("bos dizi -1", activeWordIndex([], 100) === -1);
check("tek eleman -1", activeWordIndex([0], 100) === -1);

console.log("5. Buyuk ayet (2:282, 129 kelime) dogrusal degil ikili arama");
{
  const big = Array.from({ length: 130 }, (_, i) => i * 500);
  check("ortadaki kelime", activeWordIndex(big, 64 * 500 + 10) === 64);
  check("son kelime", activeWordIndex(big, 128 * 500 + 10) === 128);
}

console.log(`\n${String(passed)} gecti, ${String(failures.length)} kaldi`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
