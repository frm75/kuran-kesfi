import type { StaticSource } from "@kuran/schema";

/**
 * Bilesen prop tipleri.
 *
 * Bunlar .astro dosyalarinin icinde `export type` ile tanimlanamaz: Astro
 * derleyicisi frontmatter export'larini hoist ederken tip export'unu deger
 * export'u sanip esbuild'e gecersiz JS veriyor
 * ("Expected \">\" but found \"$$SourceBadge\"").
 */

/**
 * <SourceBadge> icin gereken en dar kaynak sekli.
 *
 * data/sources.json kayitlari (`StaticSource`) bunu karsilar; elle kurulan
 * kucuk nesneler de gecer. Tam nesneyi istemenin anlami yok — rozet lisans,
 * ad ve referanstan baskasini gostermiyor.
 */
export type SourceRef = Pick<
  StaticSource,
  "slug" | "name" | "workTitle" | "author" | "reference" | "url" | "license"
>;
