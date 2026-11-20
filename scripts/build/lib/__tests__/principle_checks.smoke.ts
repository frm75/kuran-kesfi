/**
 * Ilke denetimi duman testleri.
 *
 * `linter.ts`in uc en degerli degismezi — karsilikli oppositeSlug, kendine
 * referans yasagi, alan sayimi — su ana kadar hic testsizdi: uclu de elle
 * veri bozarak "ateslendigi kanitlandi" ama bu kanit progress.md'de kaldi,
 * suite'te degil (bkz. bütün-dal incelemesi, "Bu dalin testsiz biraktiklari"
 * madde 1). Burada hazirlanan girdi HER ZAMAN bozuk kurulur — gercek
 * `public/data/*.json`'a degil, testin kendi kurdugu Map'lere karsi calisir,
 * boylece denetimin gercekten atesledigi kanitlanir (asagidaki her `check`
 * bir ihlali BEKLER).
 *
 * Calistirma:  pnpm --filter @kuran/build test:smoke
 */

import { checkPrincipleAreaCounts, checkPrincipleOppositeReciprocity } from "../principle_checks.js";

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

section("1. Karsilikli oppositeSlug — gecerli veri");
{
  // a<->b karsilikli, c karsitsiz. Gecerli: hic hata beklenmez.
  const opposite = new Map<string, string | null>([
    ["a", "b"],
    ["b", "a"],
    ["c", null],
  ]);
  const errors = checkPrincipleOppositeReciprocity(opposite);
  check("karsilikli cift hata uretmez", errors.length === 0);
}

section("2. Karsilikli oppositeSlug — tek yonlu cift (kirilmis girdi)");
{
  // a -> b ama b -> c: tek yonlu. Denetim gercekten bunu YAKALAMALI.
  const opposite = new Map<string, string | null>([
    ["a", "b"],
    ["b", "c"],
    ["c", "b"],
  ]);
  const errors = checkPrincipleOppositeReciprocity(opposite);
  check("tek yonlu cift EN AZ bir hata uretir", errors.length > 0);
  check(
    "hata mesaji 'karsilikli degil' iceriyor",
    errors.some((e) => e.includes("karsilikli degil")),
  );
}

section("3. Kendine referans (kirilmis girdi)");
{
  const opposite = new Map<string, string | null>([["a", "a"]]);
  const errors = checkPrincipleOppositeReciprocity(opposite);
  check("kendine referans hata uretir", errors.length === 1);
  check(
    "hata mesaji 'kendi karsiti olamaz' iceriyor",
    errors.some((e) => e.includes("kendi karsiti olamaz")),
  );
}

section("4. Var olmayan karsit (dangling, kirilmis girdi)");
{
  const opposite = new Map<string, string | null>([["a", "z"]]);
  const errors = checkPrincipleOppositeReciprocity(opposite);
  check("dangling karsit hata uretir", errors.length === 1);
  check(
    "hata mesaji 'yayinlanan ilkeler arasinda yok' iceriyor",
    errors.some((e) => e.includes("yayinlanan ilkeler arasinda yok")),
  );
}

section("5. Alan sayimi — gecerli veri");
{
  const areaOf = new Map<string, string>([
    ["namaz", "ibadet"],
    ["oruc", "ibadet"],
    ["dogruluk", "toplumsal-ahlak"],
  ]);
  const declared = new Map<string, number>([
    ["ibadet", 2],
    ["toplumsal-ahlak", 1],
  ]);
  const errors = checkPrincipleAreaCounts(areaOf, declared);
  check("dogru sayim hata uretmez", errors.length === 0);
}

section("6. Alan sayimi — yanlis principleCount (kirilmis girdi)");
{
  // ibadet alaninda gercekte 2 ilke var ama principle_areas.json 4 diyor.
  const areaOf = new Map<string, string>([
    ["namaz", "ibadet"],
    ["oruc", "ibadet"],
  ]);
  const declared = new Map<string, number>([["ibadet", 4]]);
  const errors = checkPrincipleAreaCounts(areaOf, declared);
  check("yanlis sayim hata uretir", errors.length === 1);
  check(
    "hata mesaji beklenen/gercek sayiyi tasir",
    errors.some((e) => e.includes("principleCount 4") && e.includes("gercek ilke sayisi 2")),
  );
}

section("7. Alan sayimi — kullanilan ama dizinde olmayan alan (kirilmis girdi)");
{
  const areaOf = new Map<string, string>([["namaz", "hayali-alan"]]);
  const declared = new Map<string, number>();
  const errors = checkPrincipleAreaCounts(areaOf, declared);
  check("dizinde olmayan alan hata uretir", errors.length === 1);
  check(
    "hata mesaji 'dizinde yok' iceriyor",
    errors.some((e) => e.includes("dizinde yok")),
  );
}

