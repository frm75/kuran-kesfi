/**
 * Gonderim takvimi duman testleri.
 *
 * Kurulan girdi GERCEK HATAYI taklit eder: yan yana iki ilke ayni ayeti
 * dayanak gosterir. 2026-09-16'da yayindaki takvimde tam olarak bu vardi —
 * gun 7 "ofkeyi-yutma" ve gun 8 "affetme" ilkelerinin ikisi de 3:134'u secti
 * ve abonelere ust uste iki gun ayni ayet gitti. Eski uretim ilke tekrarini
 * engelliyordu, ayet tekrarini DEGIL.
 *
 * Calistirma:  pnpm --filter @kuran/build test:smoke
 */

import { buildScheduleDays, checkScheduleAdjacentRepeats } from "../schedule.js";

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

section("1. Yan yana iki ilke ayni ayeti paylasiyor (gercek hata girdisi)");
{
  // 3134 hem "ofkeyi-yutma" hem "affetme" listesinin BASINDA.
  const usable = [
    { id: 1, slug: "ofkeyi-yutma" },
    { id: 2, slug: "affetme" },
    { id: 3, slug: "istisare" },
  ];
  const verses = new Map<number, number[]>([
    [1, [3134, 42037]],
    [2, [3134, 7199]],
    [3, [3159, 42038]],
  ]);
  const entries = buildScheduleDays(usable, verses, 6);
  check("6 gun uretildi", entries.length === 6);
  check("gun 0 ve gun 1 farkli ayet", entries[0]?.verseId !== entries[1]?.verseId);
  check("gun 1 sogumaya uyup 7199'a kaydi", entries[1]?.verseId === 7199);
  check("ilke rotasyonu bozulmadi (gun 1 hala 'affetme')", entries[1]?.principleSlug === "affetme");
  check("ust uste tekrar yok", checkScheduleAdjacentRepeats(entries).length === 0);
}

section("2. Tek ayetli ilke — geri dusulur, gun ATLANMAZ");
{
  // Iki ilkenin de TEK ayeti var ve ayni: soguma cozulemez.
  const usable = [
    { id: 1, slug: "giybetten-kacinma" },
    { id: 2, slug: "tecessusten-kacinma" },
  ];
  const verses = new Map<number, number[]>([
    [1, [49012]],
    [2, [49012]],
  ]);
  const entries = buildScheduleDays(usable, verses, 4);
  check("hicbir gun atlanmadi (4 gun)", entries.length === 4);
  check("her gunun ayeti var", entries.every((e) => e.verseId === 49012));
}

section("3. surahId / verseNumber ayristirmasi");
{
  const entries = buildScheduleDays([{ id: 1, slug: "adalet" }], new Map([[1, [4058]]]), 1);
  check("surahId = 4", entries[0]?.surahId === 4);
  check("verseNumber = 58", entries[0]?.verseNumber === 58);
}

section("4. Determinizm — ayni girdi ayni takvimi uretir");
{
  const usable = [
    { id: 1, slug: "a" },
    { id: 2, slug: "b" },
  ];
  const verses = new Map<number, number[]>([
    [1, [1001, 1002, 1003]],
    [2, [1002, 2001]],
  ]);
  const first = JSON.stringify(buildScheduleDays(usable, verses, 20));
  const second = JSON.stringify(buildScheduleDays(usable, verses, 20));
  check("iki calistirma birebir ayni", first === second);
}

section("5. Denetim bozuk takvimi GERCEKTEN yakaliyor");
{
  const broken = [
    { dayIndex: 7, verseId: 3134 },
    { dayIndex: 8, verseId: 3134 },
    { dayIndex: 9, verseId: 3159 },
  ];
  const errors = checkScheduleAdjacentRepeats(broken);
  check("ust uste tekrar EN AZ bir hata uretir", errors.length > 0);
  check("hata mesaji gun numaralarini iceriyor", errors.some((e) => e.includes("gun 7 ve 8")));
  check("saglam takvim hata uretmez", checkScheduleAdjacentRepeats([
    { dayIndex: 0, verseId: 1 },
    { dayIndex: 1, verseId: 2 },
  ]).length === 0);
}

