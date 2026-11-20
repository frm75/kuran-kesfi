/**
 * Üretilen arama indeksine karşı uçtan uca duman testleri.
 *
 * Diğer üç test dosyası oyuncak veriyle çalışır ve mantığı kilitler; bu dosya
 * GERÇEK indeksi okur ve spec §14 kabul kriterlerini doğrular. `graf.smoke.ts`
 * de aynı şeyi yapıyor (gerçek `concepts_index.json`), kalıp oradan.
 *
 * `fetch` yerine dosya sistemi kullanılır: ağ katmanı `query.smoke.ts` içinde
 * zaten saf fonksiyonlardan ayrıldı, burada aranan şey VERİNİN kendisi.
 *
 * İndeks yoksa test ATLANIR (build çalışmamış olabilir) — kırmızı vermez ama
 * atlandığını açıkça söyler.
 *
 * Calistirma:  pnpm --filter @kuran/web test:smoke
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hasArabic, shardKey, tokenize } from "../normalize.js";
import { parseReference, isPureReference } from "../reference.js";
import { RecordResolver } from "../records.js";
import { applyFilters, countByType, scoreHits } from "../query.js";
import type { SearchIndex, Shard } from "../types.js";

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../public/data/search");

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

if (!existsSync(resolve(DATA, "index.json"))) {
  test("gercek arama indeksi", { skip: "indeks yok — once `pnpm build:data` calistirin" }, () => {});
} else {
  run();
}

function run(): void {
  const index = JSON.parse(readFileSync(resolve(DATA, "index.json"), "utf8")) as SearchIndex;
  const resolver = new RecordResolver(index);

  /** Bir sorgunun ihtiyaç duyduğu shard'ları okur ve birleştirir. */
  function search(query: string): ReturnType<typeof scoreHits> {
    const spaces = hasArabic(query) ? (["ar"] as const) : (["meal", "cev"] as const);
    const merged: Record<string, number[]> = {};
    let tokens: string[] = [];
    for (const ns of spaces) {
      const script = ns === "ar" ? "ar" : "tr";
      const nsTokens = tokenize(query, script);
      if (nsTokens.length === 0) continue;
      tokens = nsTokens;
      for (const key of new Set(nsTokens.map((t) => shardKey(t, script)))) {
        if (!index.shards[ns].includes(key)) continue;
        const shard = JSON.parse(readFileSync(resolve(DATA, ns, `${key}.json`), "utf8")) as Shard;
        for (const [token, ids] of Object.entries(shard)) {
          merged[token] = [...new Set([...(merged[token] ?? []), ...ids])];
        }
      }
    }
    return scoreHits(tokens, merged, resolver);
  }

  const tables = {
    surahs: index.surahs,
    aliases: index.aliases,
    juzStarts: index.juzStarts,
    pageStarts: index.pageStarts,
  };

  section("1. Indeks butunlugu");

  check("9004 kayit", index.docCount === 9004);
  check("6236 ayet", index.typeCounts.ayet === 6236);
  check("114 sure", index.surahs.length === 114);
  check("30 cuz", index.juzStarts.length === 30);
  check("604 sayfa", index.pageStarts.length === 604);
  check("2768 ayet disi kayit", index.entries.length === 2768);
  check("es ad kaynagi TDV", index.aliasSourceSlug === "tdv-islam-ansiklopedisi");
  check(
    "her kayit adresi '/' ile basliyor",
    index.entries.every((e) => e[2].startsWith("/")),
  );
  check(
    "hicbir adres .html tasimiyor",
    index.entries.every((e) => !e[2].includes(".html")),
  );

  section("2. Ayet turetmesi (ornekleme)");

  check("ilk kayit Fatiha 1", resolver.resolve(0).url === "/fatiha-suresi/1");
  check("son ayet Nas 6", resolver.resolve(6235).url === "/nas-suresi/6");
  const bakara153 = resolver.resolve(7 + 152); // Fatiha 7 ayet, sonra Bakara
  check("Bakara 153 basligi", bakara153.title === "Bakara 153");
  check("Bakara 153 adresi", bakara153.url === "/bakara-suresi/153");
  check("Bakara 153 cuz 2", bakara153.extra?.[2] === 2);
  check("Bakara medeni", bakara153.extra?.[4] === 1);

  section("3. Referans (spec §14)");

  const maide58 = parseReference("5/58", tables);
  check("5/58 -> /maide-suresi/58", maide58?.kind === "verse" && maide58.url === "/maide-suresi/58");
  check("5.sure 58.ayet ayni", parseReference("5.sure 58.ayet", tables)?.kind === "verse");
  const range = parseReference("bakara 153-160", tables);
  check("bakara 153-160 aralik", range?.kind === "range" && range.to === 160);
  const over = parseReference("2/300", tables);
  check("2/300 uyari + 286", over?.kind === "outOfRange" && over.message.includes("286"));
  const cuz2 = parseReference("cüz 2", tables);
  check("cüz 2 -> Bakara 142", cuz2?.kind === "juz" && cuz2.url === "/bakara-suresi/142");
  const sayfa23 = parseReference("sayfa 23", tables);
  check("sayfa 23 -> Bakara 146", sayfa23?.kind === "page" && sayfa23.url === "/bakara-suresi/146");
  check("5/58 saf referans", isPureReference("5/58"));
  check("berae 5 es adla bulunur", parseReference("berae 5", tables)?.kind === "verse");

  section("4. Anlik oneri (index.json icinden, ag yok)");

  // "yus." -> Yusuf suresi. Bu spec §14'un 2. kriteri.
  const yus = index.entries.filter((e) => e[1].toLocaleLowerCase("tr").startsWith("yûs"));
  check("yus. Yusuf suresini bulur", yus.some((e) => e[2] === "/yusuf-suresi"));
  check(
    "nu on eki Nuh ve Nur'u bulur",
    ["/nuh-suresi", "/nur-suresi"].every((u) => index.entries.some((e) => e[2] === u)),
  );

  section("5. Metin aramasi (spec §14)");

  const sabir = search("sabır");
  check("sabır sonuc dondurur", sabir.length > 0);
  const sabirCounts = countByType(sabir);
  check("sabır ayet bulur", sabirCounts.ayet > 0);
  check("sabır kavrami bulur", sabir.some((h) => h.url === "/kavram/sabir"));
  check(
    "sabır ilk sonucu ayet DEGIL (tur agirligi)",
    sabir[0] !== undefined && sabir[0].type !== "ayet",
  );
  check(
    "Bakara 153 sabır sonuclarinda",
    sabir.some((h) => h.url === "/bakara-suresi/153"),
  );

  const arabic = search("صبر");
  check("صبر Arapca sonuc dondurur", arabic.length > 0);
  check("صبر sonuclari ayet", arabic.some((h) => h.type === "ayet"));

  const namaz = search("namaz");
  check("namaz sonuc dondurur", namaz.length > 0);

  // Unsuz yumusamasi: indekste "kitap" yok, "kitabi"/"kitabin" var.
  const kitap = search("kitap");
  check("kitap yumusama ile sonuc bulur", kitap.length > 0);

  section("6. Suzgecler gercek veride");

  const onlyVerses = applyFilters(sabir, { type: "ayet" });
  check("tur suzgeci ayet birakir", onlyVerses.every((h) => h.type === "ayet"));
  const bakaraOnly = applyFilters(sabir, { type: "ayet", surahId: 2 });
  check("sure suzgeci", bakaraOnly.every((h) => h.extra?.[0] === 2));
  check("sure suzgeci daraltiyor", bakaraOnly.length < onlyVerses.length);
  const mekki = applyFilters(sabir, { type: "ayet", revelation: "mekki" });
  check("nuzul suzgeci", mekki.every((h) => h.extra?.[4] === 0));
  const cuz1 = applyFilters(sabir, { type: "ayet", juzFrom: 1, juzTo: 3 });
  check("cuz araligi", cuz1.every((h) => (h.extra?.[2] ?? 0) <= 3));
  const mushaf = applyFilters(sabir, { type: "ayet", sort: "mushaf" });
  check(
    "mushaf sirasi artan",
    mushaf.every((h, i) => i === 0 || (mushaf[i - 1]?.docId ?? 0) < h.docId),
  );
}
