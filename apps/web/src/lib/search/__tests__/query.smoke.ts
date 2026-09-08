/**
 * Sorgu motoru duman testleri.
 *
 * Skorlama ve süzgeç SAF fonksiyon olduğu için burada gerçek indekse veya
 * `fetch` taklidine gerek yok; oyuncak indeks yeterli. Ağ katmanı
 * (`SearchEngine`) ayrı tutuldu — proje test koşucusu düz `tsx`, mock
 * kütüphanesi yok; bu ayrım olmadan motor hiç test edilemezdi.
 *
 * Calistirma:  pnpm --filter @kuran/web test:smoke
 */

import { expandPrefixes, scoreHits, applyFilters, countByType } from "../query.js";
import { RecordResolver } from "../records.js";
import type { SearchIndex, TypeKey } from "../types.js";

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

/*
 * Oyuncak indeks — 8 kayit:
 *   0..2  Bakara 1..3   (medeni)
 *   3..4  Yusuf 1..2    (mekki)
 *   5..6  sure kayitlari
 *   7     kavram "Sabır"
 * Ayet kayitlari yok: records.ts sure tablosundan turetiyor.
 */
const emptyRange = [0, -1] as const;
const index: SearchIndex = {
  version: 1,
  docCount: 8,
  blockSize: 100,
  blocks: 1,
  typeCounts: { ayet: 5, kok: 0, konu: 0, sure: 2, kavram: 1, ilke: 0, kissa: 0, konum: 0, zaman: 0 },
  typeRanges: {
    ayet: [0, 4],
    kok: emptyRange,
    konu: emptyRange,
    sure: [5, 6],
    kavram: [7, 7],
    ilke: emptyRange,
    kissa: emptyRange,
    konum: emptyRange,
    zaman: emptyRange,
  },
  shards: { meal: ["sa", "ba", "ki"], cev: [], ar: [] },
  stopwords: ["ve", "ile"],
  entries: [
    [3, "Bakara suresi", "/bakara-suresi"],
    [3, "Yûsuf suresi", "/yusuf-suresi"],
    [4, "Sabır", "/kavram/sabir"],
  ],
  surahs: [
    { id: 2, slug: "bakara-suresi", nameTr: "Bakara", nameAr: "البقرة", verseCount: 3, rev: 1 },
    { id: 12, slug: "yusuf-suresi", nameTr: "Yûsuf", nameAr: "يوسف", verseCount: 2, rev: 0 },
  ],
  aliases: [],
  juzStarts: [[2, 1]],
  pageStarts: [
    [2, 1],
    [2, 3],
    [12, 1],
  ],
  aliasSourceSlug: "tdv-islam-ansiklopedisi",
};

const resolver = new RecordResolver(index);

const postings: Record<string, number[]> = {
  sabrederek: [0],
  sabrederse: [3],
  sabir: [7],
  kitabi: [0],
  bakara: [5],
};
const keys = Object.keys(postings);

console.log("1. Kayit cozumu (turetme)");

check("docId 0 -> Bakara 1", resolver.resolve(0).title === "Bakara 1");
check("docId 0 adresi", resolver.resolve(0).url === "/bakara-suresi/1");
check("docId 3 -> Yûsuf 1", resolver.resolve(3).title === "Yûsuf 1");
check("docId 3 adresi", resolver.resolve(3).url === "/yusuf-suresi/1");
check("docId 2 sayfa 2", resolver.resolve(2).extra?.[3] === 2);
check("docId 4 sayfa 3", resolver.resolve(4).extra?.[3] === 3);
check("Bakara medeni", resolver.resolve(0).extra?.[4] === 1);
check("Yûsuf mekki", resolver.resolve(3).extra?.[4] === 0);
check("docId 7 kavram", resolver.resolve(7).type === "kavram" && resolver.resolve(7).title === "Sabır");
check("docId 5 sure", resolver.resolve(5).url === "/bakara-suresi");

console.log("");
console.log("2. On ek genisletme");

check(
  "sabr -> sabrederek, sabrederse",
  expandPrefixes("sabr", keys).sort().join(",") === "sabrederek,sabrederse",
);
check("sabir tam eslesmeyi bulur", expandPrefixes("sabir", keys).join(",") === "sabir");
// Unsuz yumusamasi: "kitap" yazan "kitabı" bulmali.
check("kitap -> kitabi (yumusama)", expandPrefixes("kitap", keys).includes("kitabi"));
check("eslesmeyen token bos dizi", expandPrefixes("zzz", keys).length === 0);

console.log("");
console.log("3. Skorlama");

const exact = scoreHits(["sabir"], postings, resolver);
check("sabir tek sonuc", exact.length === 1 && exact[0]?.docId === 7);

const wide = scoreHits(["sabr"], postings, resolver);
check("sabr iki ayet bulur", wide.length === 2);
check("sabr sonuclari ayet", wide.every((h) => h.type === "ayet"));

// Tur agirligi: kisa ve isabetli turler ayetten once gelir.
const mixed = scoreHits(["sab"], postings, resolver);
check("sab uc sonuc", mixed.length === 3);
check("kavram ayetten once", mixed[0]?.type === "kavram");

// Cok kelimeli sorguda HEPSI gecen kayit once gelir.
const multi = scoreHits(["sabrederek", "kitabi"], postings, resolver);
check("iki token da gecen kayit en ustte", multi[0]?.docId === 0);
check("tek token gecen sonra gelir", multi.length === 1);

const both = scoreHits(["sabr", "kitabi"], postings, resolver);
check("kismi eslesme de listelenir", both.length === 2 && both[0]?.docId === 0);

console.log("");
console.log("4. Sekme sayilari");

const counts = countByType(mixed);
check("ayet 2", counts.ayet === 2);
check("kavram 1", counts.kavram === 1);
check("kok 0", counts.kok === 0);

console.log("");
console.log("5. Suzgecler");

check(
  "tur suzgeci",
  applyFilters(mixed, { type: "ayet" }).every((h) => h.type === "ayet"),
);
check("tur suzgeci sayisi", applyFilters(mixed, { type: "ayet" }).length === 2);
check(
  "sure suzgeci",
  applyFilters(mixed, { type: "ayet", surahId: 2 }).length === 1,
);
check(
  "mekki suzgeci",
  applyFilters(mixed, { type: "ayet", revelation: "mekki" }).every((h) => h.extra?.[4] === 0),
);
check(
  "medeni suzgeci Bakara'yi verir",
  applyFilters(mixed, { type: "ayet", revelation: "medeni" })[0]?.docId === 0,
);
check("cuz araligi disi bos", applyFilters(mixed, { type: "ayet", juzFrom: 2, juzTo: 3 }).length === 0);
check("cuz araligi ici dolu", applyFilters(mixed, { type: "ayet", juzFrom: 1, juzTo: 1 }).length === 2);
check("sayfa araligi", applyFilters(mixed, { type: "ayet", pageFrom: 1, pageTo: 1 }).length === 1);
check("ayet disi tur sayfa suzgecinden etkilenmez", applyFilters(mixed, { pageFrom: 1, pageTo: 1 }).length === 2);

console.log("");
console.log("6. Siralama");

const mushaf = applyFilters(mixed, { sort: "mushaf" });
check(
  "mushaf sirasi docId artan",
  mushaf.map((h) => h.docId).join(",") === "0,3,7",
);
const relevance = applyFilters(mixed, { sort: "alaka" });
check("alaka sirasinda kavram once", relevance[0]?.type === "kavram");

console.log("");
console.log("7. Bos sonuc");

check("eslesmeyen sorgu bos dizi", scoreHits(["zzzz"], postings, resolver).length === 0);
check("bos token listesi bos dizi", scoreHits([], postings, resolver).length === 0);

console.log("");
if (failures.length > 0) {
  console.error(`\n${String(failures.length)} basarisiz, ${String(passed)} gecti`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log(`${String(passed)} denetim gecti`);
}
