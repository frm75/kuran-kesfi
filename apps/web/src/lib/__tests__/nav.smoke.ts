/**
 * Menü veri bütünlüğü duman testleri.
 *
 * Menü yapısı TEK KAYNAKTAN geliyor (src/lib/nav.ts); şerit, hub sayfaları,
 * breadcrumb ve sitemap hep oradan besleniyor. Bu dosya o kaynağın kendi
 * içinde tutarlı kaldığını denetler — bozulursa hata build'de değil, sessizce
 * yanlış menüde ortaya çıkardı.
 *
 * Calistirma:  pnpm --filter @kuran/web test:smoke
 */

import { NAV, allNavPaths, findHub } from "../nav.js";

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

section("1. Yapi");

check("dort ust baslik var", NAV.length === 4);
check(
  "ust basliklar sirasiyla Oku, Anla, Kesfet, Kaynaklar",
  NAV.map((h) => h.label).join(",") === "Oku,Anla,Keşfet,Kaynaklar",
);
check(
  "her ust basligin en az iki cocugu var",
  NAV.every((h) => h.children.length >= 2),
);

section("2. Adresler");

const paths = allNavPaths();
check("her adres tekil", new Set(paths).size === paths.length);
check(
  "her adres '/' ile basliyor",
  paths.every((p) => p.startsWith("/")),
);
check(
  "hicbir adres '/' ile bitmiyor",
  paths.every((p) => p === "/" || !p.endsWith("/")),
);
check(
  "hicbir adres '.html' tasimiyor",
  paths.every((p) => !p.includes(".html")),
);

section("3. Metin");

check(
  "her ogenin bos olmayan etiketi var",
  NAV.every((h) => h.label.trim() !== "" && h.children.every((c) => c.label.trim() !== "")),
);
check(
  "her ogenin bos olmayan tanitim cumlesi var",
  NAV.every((h) => h.blurb.trim() !== "" && h.children.every((c) => c.blurb.trim() !== "")),
);

section("4. findHub");

check("hub adresi kendi hub'ini bulur", findHub("/anla")?.label === "Anla");
check("cocuk adresi ust hub'ini bulur", findHub("/kavramlar")?.label === "Anla");
check("yazmalar Kesfet altinda", findHub("/yazmalar")?.label === "Keşfet");
check("bilinmeyen adres null doner", findHub("/bakara-suresi") === null);
check("ayet adresi null doner", findHub("/bakara-suresi/255") === null);

section("5. Sure slug catismasi");

/*
 * Kok seviyede `[surah].astro` dinamik route'u var. Astro'da statik route
 * dinamigi yener, ama menude sure slug'iyla catisan bir hub acilirsa o sure
 * sayfasi ERISILEMEZ hale gelir ve kimse fark etmez. Sure slug'larinin hepsi
 * "-suresi" ile bitiyor; kural bu.
 */
check(
  "hicbir menu adresi '-suresi' ile bitmiyor",
  paths.every((p) => !p.endsWith("-suresi")),
);

