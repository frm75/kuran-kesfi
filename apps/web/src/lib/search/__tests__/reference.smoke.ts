/**
 * Referans ayrıştırıcı duman testleri.
 *
 * "5/58" yazan kullanıcı Mâide 58'e gitmeli, "5" ve "58" geçen ayetleri
 * taramamalı. Sınır aşımı (2/300) boş sonuç DEĞİL, açıklama döndürmeli: boş
 * ekran kullanıcıya sitenin bozuk olduğunu düşündürür.
 *
 * Calistirma:  pnpm --filter @kuran/web test:smoke
 */

import { parseReference, isPureReference } from "../reference.js";
import type { ReferenceTables } from "../reference.js";

import assert from "node:assert/strict";
import { test } from "node:test";

let group = "";

/** Sonraki denetimlerin adına ön ek olur; raporda hangi bölümün düştüğü görünür. */
function section(title: string): void {
  group = title;
}

function check(label: string, ok: boolean): void {
  test(group === "" ? label : `${group} › ${label}`, () => {
    assert.ok(ok, label);
  });
}

const tables: ReferenceTables = {
  surahs: [
    { id: 2, slug: "bakara-suresi", nameTr: "Bakara", nameAr: "البقرة", verseCount: 286, rev: 1 },
    { id: 5, slug: "maide-suresi", nameTr: "Mâide", nameAr: "المائدة", verseCount: 120, rev: 1 },
    { id: 9, slug: "tevbe-suresi", nameTr: "Tevbe", nameAr: "التوبة", verseCount: 129, rev: 1 },
    { id: 10, slug: "yunus-suresi", nameTr: "Yûnus", nameAr: "يونس", verseCount: 109, rev: 0 },
    { id: 12, slug: "yusuf-suresi", nameTr: "Yûsuf", nameAr: "يوسف", verseCount: 111, rev: 0 },
    { id: 24, slug: "nur-suresi", nameTr: "Nûr", nameAr: "النور", verseCount: 64, rev: 1 },
    { id: 71, slug: "nuh-suresi", nameTr: "Nûh", nameAr: "نوح", verseCount: 28, rev: 0 },
  ],
  aliases: [{ surahId: 9, name: "Berâe", sourceReference: "Tevbe Sûresi" }],
  juzStarts: [
    [1, 1],
    [2, 142],
    [2, 253],
  ],
  pageStarts: [
    [1, 1],
    [2, 1],
    [2, 6],
  ],
};

section("1. Sayisal referans");

for (const q of ["5/58", "5:58", "5.58", "5-58", "5 58"]) {
  const hit = parseReference(q, tables);
  check(
    `${q} -> Maide 58`,
    hit?.kind === "verse" &&
      hit.surah.id === 5 &&
      hit.verse === 58 &&
      hit.url === "/maide-suresi/58",
  );
}

section("2. Sozel referans");

for (const q of ["5. sure 58. ayet", "5.sure 58.ayet", "sure 5 ayet 58", "5 sure 58 ayet"]) {
  const hit = parseReference(q, tables);
  check(`${q} -> Maide 58`, hit?.kind === "verse" && hit.surah.id === 5 && hit.verse === 58);
}

section("3. Sure adiyla");

for (const q of ["bakara 153", "bakara/153", "bakara suresi 153", "Bakara 153"]) {
  const hit = parseReference(q, tables);
  check(`${q} -> Bakara 153`, hit?.kind === "verse" && hit.surah.id === 2 && hit.verse === 153);
}

// Kisaltilmis ad: "yus 4" tek adaya (Yusuf) inmeli. "yu 4" iki adaya (Yunus,
// Yusuf) dustugu icin referans SAYILMAZ — yanlis ayete gondermektense metin
// aramasina birakmak dogru.
const yus = parseReference("yus 4", tables);
check("yus 4 -> Yusuf 4", yus?.kind === "verse" && yus.surah.id === 12);
check("yu 4 belirsiz, referans degil", parseReference("yu 4", tables) === null);

const yusufFull = parseReference("yûsuf 4", tables);
check("yûsuf 4 -> Yusuf 4", yusufFull?.kind === "verse" && yusufFull.surah.id === 12);

// Tam ad on ekten once gelir: "nur 1" Nur'u vermeli, Nuh'la belirsizlige
// dusmemeli — ikisi de "nu" ile basliyor ama "nur" TAM eslesme.
const nur = parseReference("nur 1", tables);
check("nur 1 -> Nur 1 (tam ad on eki yener)", nur?.kind === "verse" && nur.surah.id === 24);

const berae = parseReference("berae 5", tables);
check("berae 5 -> Tevbe 5 (es ad)", berae?.kind === "verse" && berae.surah.id === 9);

section("4. Aralik");

const range = parseReference("2/153-160", tables);
check(
  "2/153-160 -> Bakara 153..160",
  range?.kind === "range" &&
    range.from === 153 &&
    range.to === 160 &&
    range.surah.id === 2 &&
    range.url === "/bakara-suresi/153",
);
const range2 = parseReference("bakara 153-160", tables);
check("bakara 153-160 ayni sonuc", range2?.kind === "range" && range2.to === 160);
check(
  "2/280-300 sinir asimi",
  parseReference("2/280-300", tables)?.kind === "outOfRange",
);

// Belirsizlik kurali: '-' YALNIZ ayet numarasindan SONRA aralik ayiracidir.
// "5-58" sure/ayet okunur, "5. sureden 58. sureye" degil.
const dash = parseReference("5-58", tables);
check("5-58 sure/ayet okunur", dash?.kind === "verse" && dash.surah.id === 5 && dash.verse === 58);

section("5. Tek sayi");

const solo = parseReference("5", tables);
check(
  "5 -> Maide suresi",
  solo?.kind === "surah" && solo.surah.id === 5 && solo.url === "/maide-suresi",
);
check("200 sure degil (>114)", parseReference("200", tables) === null);

section("6. Sinir asimi");

const over = parseReference("2/300", tables);
check("2/300 hata karti dondurur", over?.kind === "outOfRange");
check("2/300 mesaji ayet sayisini soyler", over?.kind === "outOfRange" && over.message.includes("286"));
check("2/300 sure sayfasina baglar", over?.kind === "outOfRange" && over.url === "/bakara-suresi");
check("115/1 bilinmeyen sure, referans degil", parseReference("115/1", tables) === null);
check("2/0 gecersiz ayet", parseReference("2/0", tables)?.kind === "outOfRange");

section("7. Cuz ve sayfa");

const juz = parseReference("cüz 2", tables);
check("cüz 2 -> Bakara 142", juz?.kind === "juz" && juz.juz === 2 && juz.url === "/bakara-suresi/142");
check("cuz 2 (sapkasiz) ayni", parseReference("cuz 2", tables)?.kind === "juz");
check("2. cüz ayni", parseReference("2. cüz", tables)?.kind === "juz");
check("cüz 31 sinir asimi", parseReference("cüz 31", tables)?.kind === "outOfRange");

const page = parseReference("sayfa 3", tables);
check("sayfa 3 -> Bakara 6", page?.kind === "page" && page.page === 3 && page.url === "/bakara-suresi/6");
check("3. sayfa ayni", parseReference("3. sayfa", tables)?.kind === "page");
check("sayfa 605 sinir asimi", parseReference("sayfa 605", tables)?.kind === "outOfRange");

section("8. Saf referans ayirimi");

check("5/58 saf referans", isPureReference("5/58"));
check("bakara 153 saf referans", isPureReference("bakara 153"));
check("cüz 2 saf referans", isPureReference("cüz 2"));
check("5. sure 58. ayet saf referans", isPureReference("5. sure 58. ayet"));
check("sabir saf referans DEGIL", !isPureReference("sabir"));
check("bakara sabir saf referans DEGIL", !isPureReference("bakara sabir"));

section("9. Referans olmayan");

check("bos sorgu", parseReference("", tables) === null);
check("sadece kelime", parseReference("sabir", tables) === null);
check("arapca", parseReference("صبر", tables) === null);

