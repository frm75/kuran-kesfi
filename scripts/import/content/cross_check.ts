/**
 * Dosyalar arasi tutarlilik — veritabanina dokunmadan sinanabilen her sey.
 */

import type { Loaded } from "./load.js";

export function crossCheck(data: Loaded, dbSourceSlugs: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const uniq = (label: string, slugs: string[]): Set<string> => {
    const seen = new Set<string>();
    for (const s of slugs) {
      if (seen.has(s)) errors.push(`${label}: '${s}' slug'i birden fazla dosyada`);
      seen.add(s);
    }
    return seen;
  };

  const sourceSlugs = new Set([...dbSourceSlugs, ...data.sources.map((s) => s.slug)]);
  const locationSlugs = uniq("konum", data.locations.map((l) => l.slug));
  const storySlugs = uniq("kissa", data.stories.map((s) => s.slug));
  const conceptSlugs = uniq("kavram", data.concepts.map((c) => c.slug));
  const principleSlugs = uniq("ilke", data.principles.map((p) => p.slug));
const principleOppositeOf = new Map(data.principles.map((p) => [p.slug, p.oppositeSlug] as const));

  const needSource = (where: string, slugs: readonly string[]): void => {
    for (const s of slugs) {
      if (!sourceSlugs.has(s)) errors.push(`${where}: kaynak '${s}' tanimli degil`);
    }
  };
  const need = (where: string, set: ReadonlySet<string>, what: string, slugs: readonly string[]): void => {
    for (const s of slugs) if (!set.has(s)) errors.push(`${where}: ${what} '${s}' yok`);
  };

  for (const l of data.locations) {
    needSource(`konum ${l.slug}`, l.sourceSlugs);
    for (const a of l.alternatives) needSource(`konum ${l.slug} / alternatif ${a.name}`, a.sourceSlugs);
  }
  for (const s of data.stories) {
    need(`kissa ${s.slug}`, storySlugs, "iliskili kissa", s.relatedStories);
    need(`kissa ${s.slug}`, conceptSlugs, "kavram", s.concepts);
    need(`kissa ${s.slug}`, locationSlugs, "konum", s.locations.map((l) => l.locationSlug));
    for (const lesson of s.lessons) needSource(`kissa ${s.slug} / ders ${lesson.order}`, lesson.sourceSlugs);
    // Ayni konum ayni sirada iki kez olmasin — PK (story, location, order)
    const seen = new Set<string>();
    for (const l of s.locations) {
      const key = `${l.locationSlug}#${l.order}`;
      if (seen.has(key)) errors.push(`kissa ${s.slug}: konum ${key} mukerrer`);
      seen.add(key);
    }
  }
  for (const c of data.concepts) {
    if (c.parentSlug !== null && !conceptSlugs.has(c.parentSlug)) {
      errors.push(`kavram ${c.slug}: ebeveyn '${c.parentSlug}' yok`);
    }
    need(`kavram ${c.slug}`, conceptSlugs, "iliski hedefi", c.relations.map((r) => r.target));
    needSource(`kavram ${c.slug}`, c.sourceSlugs);
  }
  const conceptChildCount = new Map<string, number>();
  for (const c of data.concepts) {
    if (c.parentSlug !== null) {
      conceptChildCount.set(c.parentSlug, (conceptChildCount.get(c.parentSlug) ?? 0) + 1);
    }
  }
  for (const c of data.concepts) {
    // Koku ve elle ayet eslestirmesi olmayan kavram ancak UST BASLIK olabilir:
    // sayilari cocuklarindan toplanir. Cocugu da yoksa sayfasi bos cikardi.
    if (c.roots.length === 0 && c.verses.length === 0 && (conceptChildCount.get(c.slug) ?? 0) === 0) {
      errors.push(`kavram ${c.slug}: kok, ayet ve cocuk yok — bos kavram sayfasi uretilemez`);
    }
  }
  for (const p of data.principles) {
    if (p.oppositeSlug !== null) {
      if (!principleSlugs.has(p.oppositeSlug)) {
        errors.push(`ilke ${p.slug}: karsit ilke '${p.oppositeSlug}' yok`);
      } else {
        // Karsilikli olmali (A->B ⟹ B->A) — tek yonlu bir cift build asamasinda
        // lint:refs'e kadar yakalanmaz, DB'ye temiz yazilirdi (bkz. linter.ts
        // checkPrincipleOppositeReciprocity, ayni degismezi YAYINLANAN ciktida
        // denetler).
        const back = principleOppositeOf.get(p.oppositeSlug) ?? null;
        if (back !== p.slug) {
          errors.push(
            `ilke ${p.slug}: karsit ilke '${p.oppositeSlug}' karsilikli degil ` +
              `(${p.oppositeSlug}.oppositeSlug = ${back === null ? "null" : `'${back}'`})`,
          );
        }
      }
    }
    need(`ilke ${p.slug}`, storySlugs, "kissa", p.stories.map((s) => s.slug));
    need(`ilke ${p.slug}`, conceptSlugs, "kavram", p.concepts);
    needSource(`ilke ${p.slug}`, p.sourceSlugs);
  }
  const areaSlugs = uniq("ilke alani", data.principleAreas.map((a) => a.slug));
  for (const p of data.principles) {
    need(`ilke ${p.slug}`, areaSlugs, "alan", [p.areaSlug]);
  }
  for (const a of data.principleAreas) needSource(`ilke alani ${a.slug}`, a.sourceSlugs);
  const orders = new Set<number>();
  for (const p of data.principles) {
    if (orders.has(p.order)) errors.push(`ilke ${p.slug}: order ${p.order} baska bir ilkede de var`);
    orders.add(p.order);
  }
  const areaOrders = new Set<number>();
  for (const a of data.principleAreas) {
    if (areaOrders.has(a.order)) errors.push(`ilke alani ${a.slug}: order ${a.order} baska bir alanda da var`);
    areaOrders.add(a.order);
  }
  for (const e of data.events) needSource(`olay ${e.order}`, e.sourceSlugs);
  if (data.noldeke !== null) needSource("noldeke", [data.noldeke.sourceSlug]);

  /*
   * --- medya ---------------------------------------------------------------
   *
   * Sema tek DOSYA icinde benzersizligi dogruluyor; burada butun dosyalara
   * bakilir, cunku media_key veritabaninda UNIQUE'tir ve iki cografya dosyasi
   * ayni id'yi kullanirsa import transaction'in ortasinda patlardi.
   */
  const eventOrders = new Set(data.events.map((e) => e.order));
  const mediaIds = uniq("medya", data.media.map((m) => m.id));
  const promptIds = uniq("prompt", data.prompts.map((p) => p.id));

  for (const m of data.media) {
    needSource(`medya ${m.id}`, m.sourceSlugs);
    if (m.locationSlug !== null && !locationSlugs.has(m.locationSlug)) {
      errors.push(`medya ${m.id}: konum '${m.locationSlug}' yok`);
    }
    need(`medya ${m.id}`, storySlugs, "kissa", m.storySlugs);
    for (const o of m.timelineOrders) {
      if (!eventOrders.has(o)) errors.push(`medya ${m.id}: olay '${String(o)}' yok`);
    }
  }
  for (const p of data.prompts) {
    if (p.storySlug !== null && !storySlugs.has(p.storySlug)) {
      errors.push(`prompt ${p.id}: kissa '${p.storySlug}' yok`);
    }
    if (p.locationSlug !== null && !locationSlugs.has(p.locationSlug)) {
      errors.push(`prompt ${p.id}: konum '${p.locationSlug}' yok`);
    }
    if (p.timelineOrder !== null && !eventOrders.has(p.timelineOrder)) {
      errors.push(`prompt ${p.id}: olay '${String(p.timelineOrder)}' yok`);
    }
    if (p.baseImagePromptId !== null && !promptIds.has(p.baseImagePromptId)) {
      errors.push(`prompt ${p.id}: baslangic gorseli '${p.baseImagePromptId}' yok`);
    }
  }
  for (const a of data.aiMedia) {
    if (mediaIds.has(a.id)) errors.push(`AI medya ${a.id}: id gercek medyayla cakisiyor`);
    if (!promptIds.has(a.promptId)) errors.push(`AI medya ${a.id}: prompt '${a.promptId}' yok`);
  }

  return errors;
}
