/**
 * Ilke denetimleri — saf fonksiyonlar (dosya sistemi / veritabani yok).
 *
 * `linter.ts` bu fonksiyonlari YAYINLANAN statik ciktidan (principle/*.json,
 * principle_areas.json) topladigi Map'lerle cagirir. Burada ayri bir dosyada
 * durmalarinin tek sebebi test edilebilirlik: linter.ts govdesi ustten asagi
 * calisan bir betik (DB baglantisi, dosya okuma, process.exit) oldugu icin
 * dogrudan import edilip birim testi yazilamaz. Bu iki denetim dalin en
 * degerli uc degismezini tasir (karsilikli oppositeSlug, kendine referans
 * yasagi, alan sayimi) — bkz. `__tests__/principle_checks.smoke.ts`.
 */

/**
 * Ilke karsitlik denetimi (gorev 4, 2026-09-07). A'nin karsiti B ise B'nin
 * karsiti da A olmali — tek yonlu bir cift kurulursa bag ilke sayfasinda
 * yalnizca BIR yonde gorunur (A -> B), digerinde (B sayfasinda A'ya bag)
 * gorunmez ve bu sessizce gecer, kimse fark etmez. Ayni dongude, var olmayan
 * bir ilkeye isaret eden karsit slug da (dangling) ve kendine referans da
 * burada yakalanir.
 *
 * @param principleOpposite slug -> oppositeSlug (yoksa null)
 */
export function checkPrincipleOppositeReciprocity(
  principleOpposite: ReadonlyMap<string, string | null>,
): string[] {
  const errors: string[] = [];
  for (const [slug, opposite] of principleOpposite) {
    if (opposite === null) continue;
    /*
     * Kendine referans korumasi (fix round 1, inceleme bulgusu). `opposite
     * === slug` durumunda asagidaki "back !== slug" karsilastirmasi TRIVIAL
     * DOGRU cikar (back zaten slug'in kendisi) — denetim sessizce gecerdi.
     * `content_input.ts`'teki Zod refine bunu content:import asamasinda
     * zaten engelliyor (pipeline'dan gecmez), ama linter YAYINLANAN ciktiyi
     * dogruluyor — dosya elle bozulursa (ya da baska bir uretici yolundan
     * gecerse) bu koruma olmadan build durmazdi.
     */
    if (opposite === slug) {
      errors.push(`ilke ${slug}: kendi karsiti olamaz (oppositeSlug kendisine isaret ediyor)`);
      continue;
    }
    if (!principleOpposite.has(opposite)) {
      errors.push(`ilke ${slug}: karsit ilke '${opposite}' yayinlanan ilkeler arasinda yok`);
      continue;
    }
    const back = principleOpposite.get(opposite) ?? null;
    if (back !== slug) {
      errors.push(
        `ilke ${slug} <-> ${opposite}: karsilikli degil (${slug}.opposite = '${opposite}' ` +
          `ama ${opposite}.opposite = ${back === null ? "null" : `'${back}'`})`,
      );
    }
  }
  return errors;
}

/**
 * `principle_areas.json`'daki `principleCount`, `principle/` dosyalarindan
 * SAYILAN gercek dagilimla tutarli olmali. Kavramdaki "dagilim istatistigi
 * ayet sayisiyla tutarsiz" denetiminin ilke alani karsiligi: sayim elle
 * dosyada da bozulabilir, kopmasi sayfada sessizce yanlis bir sayi birakir.
 *
 * @param principleAreaOf         ilke slug -> alan slug
 * @param principleAreaDeclaredCounts alan slug -> principle_areas.json'da yazan sayi
 */
export function checkPrincipleAreaCounts(
  principleAreaOf: ReadonlyMap<string, string>,
  principleAreaDeclaredCounts: ReadonlyMap<string, number>,
): string[] {
  const errors: string[] = [];
  const actualCounts = new Map<string, number>();
  for (const areaSlug of principleAreaOf.values()) {
    actualCounts.set(areaSlug, (actualCounts.get(areaSlug) ?? 0) + 1);
  }
  for (const [areaSlug, declared] of principleAreaDeclaredCounts) {
    const actual = actualCounts.get(areaSlug) ?? 0;
    if (actual !== declared) {
      errors.push(
        `principle_areas.json: alan '${areaSlug}' principleCount ${String(declared)} bildiriyor ` +
          `ama gercek ilke sayisi ${String(actual)}`,
      );
    }
  }
  for (const areaSlug of actualCounts.keys()) {
    if (!principleAreaDeclaredCounts.has(areaSlug)) {
      errors.push(`principle_areas.json: ilkelerin kullandigi alan '${areaSlug}' dizinde yok`);
    }
  }
  return errors;
}
