/**
 * Damga onarim kurallarinin duman testleri — plan 04, Gorev 1.
 *
 * Calistirma:  pnpm --filter @kuran/pipeline test:smoke
 */

import { LEAD_TOLERANCE_MS, repairVerseSegments } from "../segments.js";

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

console.log("1. Temiz veri");
{
  const r = repairVerseSegments({
    wordCount: 4,
    verseStartMs: 1000,
    verseDurationMs: 5000,
    segments: [
      [1, 1000, 1580],
      [2, 1580, 2409],
      [3, 2409, 3502],
      [4, 3502, 5840],
    ],
  });
  check("uzunluk = kelime + 1", r.starts.length === 5);
  check("ayete goreli", r.starts[0] === 0 && r.starts[1] === 580);
  check("son eleman son bitis", r.starts[4] === 4840);
  check("aradegerleme yok", r.interpolated === 0);
  check("on-yukleme onarimi yok", !r.leadRepaired);
  check("kirpma yok", !r.capped);
}

console.log("2. Kucuk negatif on-yukleme kirpilir");
{
  // Gercek veride medyan 55 ms: ilk kelime ayet basindan biraz once baslar.
  const r = repairVerseSegments({
    wordCount: 2,
    verseStartMs: 6090,
    verseDurationMs: 5590,
    segments: [
      [1, 6025, 7025],
      [2, 7025, 11550],
    ],
  });
  check("negatif deger sifira kirpilir", r.starts[0] === 0);
  check("bozuk sayilmaz", !r.leadRepaired);
  check("ikinci kelime dogru", r.starts[1] === 935);
}

console.log("3. Buyuk on-yukleme bozuktur, atilir");
{
  // 60:13 gercek ornegi: ilk damga ayet basindan 50 saniye once.
  const r = repairVerseSegments({
    wordCount: 3,
    verseStartMs: 420800,
    verseDurationMs: 25640,
    segments: [
      [1, 370305, 373085],
      [2, 425800, 430800],
      [3, 430800, 446440],
    ],
  });
  check("bozuk ilk damga atildi, aradegerlendi", r.leadRepaired);
  check("ilk kelime sifirdan baslar", r.starts[0] === 0);
  check("ikinci kelime korunur", r.starts[1] === 5000);
  check("aradegerlenen 1 kelime", r.interpolated === 1);
  check("tolerans 500 ms", LEAD_TOLERANCE_MS === 500);
}

console.log("4. Eksik kelime aradegerlenir");
{
  const r = repairVerseSegments({
    wordCount: 4,
    verseStartMs: 0,
    verseDurationMs: 4000,
    segments: [
      [1, 0, 1000],
      [2, 1000, 2000],
      // 3. kelimenin damgasi yok
      [4, 3000, 4000],
    ],
  });
  check("uzunluk yine kelime + 1", r.starts.length === 5);
  check("3. kelime komsular arasina konur", r.starts[2] === 2000);
  check("aradegerlenen 1", r.interpolated === 1);
  check("artan sirali", r.starts.every((v, i, a) => i === 0 || (a[i - 1] ?? 0) <= v));
}

console.log("5. Bastaki ve sondaki eksikler");
{
  const r = repairVerseSegments({
    wordCount: 3,
    verseStartMs: 0,
    verseDurationMs: 3000,
    segments: [[2, 1000, 2000]],
  });
  check("bastaki eksik sifir olur", r.starts[0] === 0);
  check("sondaki eksik son bitise dayanir", r.starts[2] === 2000);
  check("son eleman ayet suresini asmaz", (r.starts[3] ?? 0) <= 3000);
  check("aradegerlenen 2", r.interpolated === 2);
}

console.log("6. Fazla indis son kelimeye katilir (37:130)");
{
  const r = repairVerseSegments({
    wordCount: 3,
    verseStartMs: 0,
    verseDurationMs: 4000,
    segments: [
      [1, 0, 1000],
      [2, 1000, 2000],
      [3, 2000, 3000],
      [4, 3000, 4000],
    ],
  });
  check("uzunluk kelime sayisina uyar", r.starts.length === 4);
  check("kirpma isaretlendi", r.capped);
  check("fazlanin bitisi son elemana yazildi", r.starts[3] === 4000);
}

console.log("7. Bozuk girdiler");
{
  const r = repairVerseSegments({
    wordCount: 2,
    verseStartMs: 0,
    verseDurationMs: 2000,
    // 3 elemandan kisa satirlar gercek veride var: [[1],[2]]
    segments: [[1, 0, 1000], [1], [2, 1000, 2000], [2]],
  });
  check("eksik satirlar yok sayilir", r.starts.length === 3);
  check("dogru okundu", r.starts[1] === 1000);
}
{
  const r = repairVerseSegments({
    wordCount: 2,
    verseStartMs: 0,
    verseDurationMs: 2000,
    segments: [],
  });
  check("hic damga yoksa esit bolunur", r.starts.length === 3 && r.starts[1] === 1000);
  check("hepsi aradegerlenmis sayilir", r.interpolated === 2);
}

console.log(`\n${String(passed)} gecti, ${String(failures.length)} kaldi`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
