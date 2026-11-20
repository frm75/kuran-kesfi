/**
 * B. Uretilen statik JSON — Icerik katmani: kissa, ilke, kavram, konum, zaman, baglar.
 *
 * Her fonksiyon tek bir dosya turunu dogrular; hangi yolun hangisine gittigi
 * `../static_output.ts` icindeki tabloda.
 */

import {
  staticConcept,
  staticConceptsIndex,
  staticLocations,
  staticPrinciple,
  staticPrincipleAreas,
  staticPrinciplesIndex,
  staticStoriesIndex,
  staticStory,
  staticTimeline,
  staticVerseLinks,
  staticVerseRelations,
  staticSurahSections,
} from "@kuran/schema";
import { errors, tick } from "../report.js";
import type { StaticFile, StaticState } from "./state.js";

export function checkStoriesIndex({ relativePath, parsed }: StaticFile, s: StaticState): void {
  const result = staticStoriesIndex.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else s.storiesIndexSlugs = new Set(result.data.stories.map((x) => x.slug));
}

export function checkStoryFile({ relativePath, parsed, base }: StaticFile, s: StaticState): void {
  const result = staticStory.safeParse(parsed);
  tick();
  if (!result.success) {
    errors.push(`${relativePath}: ${result.error.message}`);
    return;
  }
  s.storyFileSlugs.add(result.data.slug);
  if (base !== `story_${result.data.slug}.json`) {
    errors.push(`${relativePath}: dosya adi story_${result.data.slug}.json olmali`);
  }
  // Parcalar sirali ve verseCount tutarli olmali
  const sum = result.data.passages.reduce((a, p) => a + (p.verseEnd - p.verseStart + 1), 0);
  if (sum !== result.data.verseCount) {
    errors.push(`${relativePath}: verseCount ${result.data.verseCount} ama parcalar ${sum} ayet kapsiyor`);
  }
  result.data.passages.forEach((p, i) => {
    if (p.order !== i + 1) errors.push(`${relativePath}: parca sirasi kesintili (${p.order})`);
    if (p.verseEnd < p.verseStart) errors.push(`${relativePath}: parca ${p.order} tersine aralik`);
  });
}

export function checkLocations({ relativePath, parsed }: StaticFile): void {
  const result = staticLocations.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
}

export function checkTimeline({ relativePath, parsed }: StaticFile): void {
  const result = staticTimeline.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else {
    result.data.events.forEach((e, i) => {
      if (i > 0 && e.order <= (result.data.events[i - 1]?.order ?? 0)) {
        errors.push(`${relativePath}: olaylar order'a gore sirali degil (${e.order})`);
      }
    });
  }
}

export function checkPrinciplesIndex({ relativePath, parsed }: StaticFile, s: StaticState): void {
  const result = staticPrinciplesIndex.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else s.principlesIndexSlugs = new Set(result.data.principles.map((x) => x.slug));
}

export function checkPrincipleFile({ relativePath, parsed, base }: StaticFile, s: StaticState): void {
  const result = staticPrinciple.safeParse(parsed);
  tick();
  if (!result.success) {
    errors.push(`${relativePath}: ${result.error.message}`);
    return;
  }
  s.principleFileSlugs.add(result.data.slug);
  if (base !== `principle_${result.data.slug}.json`) {
    errors.push(`${relativePath}: dosya adi principle_${result.data.slug}.json olmali`);
  }
  if (!result.data.verses.some((v) => v.role === "primary")) {
    errors.push(`${relativePath}: birincil ayet dayanagi yok (plan 18.3)`);
  }
  s.principleOpposite.set(result.data.slug, result.data.opposite?.slug ?? null);
  s.principleAreaOf.set(result.data.slug, result.data.area.slug);
}

export function checkPrincipleAreas({ relativePath, parsed }: StaticFile, s: StaticState): void {
  const result = staticPrincipleAreas.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else s.principleAreaDeclaredCounts = new Map(result.data.areas.map((a) => [a.slug, a.principleCount]));
}

export function checkConceptsIndex({ relativePath, parsed }: StaticFile, s: StaticState): void {
  const result = staticConceptsIndex.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else s.conceptsIndexSlugs = new Set(result.data.concepts.map((x) => x.slug));
}

export function checkConceptFile({ relativePath, parsed, base }: StaticFile, s: StaticState): void {
  const result = staticConcept.safeParse(parsed);
  tick();
  if (!result.success) {
    errors.push(`${relativePath}: ${result.error.message}`);
    return;
  }
  s.conceptFileSlugs.add(result.data.slug);
  if (base !== `concept_${result.data.slug}.json`) {
    errors.push(`${relativePath}: dosya adi concept_${result.data.slug}.json olmali`);
  }
  const st = result.data.stats;
  if (st.mekki + st.medeni !== st.verseCount || st.verseCount !== result.data.verses.length) {
    errors.push(`${relativePath}: dagilim istatistigi ayet sayisiyla tutarsiz`);
  }
}

export function checkVerseLinks({ relativePath, parsed }: StaticFile): void {
  const result = staticVerseLinks.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else {
    for (const key of Object.keys(result.data.verses)) {
      const id = Number(key);
      const surahId = Math.floor(id / 1000);
      if (surahId < 1 || surahId > 114 || id % 1000 === 0) {
        errors.push(`${relativePath}: gecersiz ayet anahtari ${key}`);
        break;
      }
    }
  }
}

export function checkSections({ relativePath, parsed }: StaticFile): void {
  const result = staticSurahSections.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else {
    /*
     * Bitisiklik cikti tarafinda BIR DAHA bakiliyor. Girdi semasi zaten
     * dogruluyor ama arayuz "bu ayet hangi konuda?" sorusunun her ayette
     * cevabi olduguna guveniyor; bosluk kalirsa sayfa sessizce basliksiz
     * kalir, hata vermez. Sessiz bozulma en pahali bozulmadir.
     */
    for (const [key, entry] of Object.entries(result.data.surahs)) {
      const sorted = [...entry.sections].sort((a, b) => a.order - b.order);
      let expected = 1;
      let broken = false;
      for (const [i, section] of sorted.entries()) {
        if (section.order !== i + 1 || section.verseStart !== expected) {
          errors.push(
            `${relativePath}: sure ${key} bolumlemesi ${section.order}. bolumde kopuk ` +
              `(${section.verseStart}. ayetten basliyor, ${expected} bekleniyordu)`,
          );
          broken = true;
          break;
        }
        expected = section.verseEnd + 1;
      }
      if (broken) continue;
      for (const section of sorted) {
        const inside = section.alsoVerses.filter(
          (n) => n >= section.verseStart && n <= section.verseEnd,
        );
        if (inside.length > 0) {
          errors.push(
            `${relativePath}: sure ${key} bolum ${section.order}: ek ayet ${inside.join(", ")} ` +
              "zaten ana aralikta",
          );
          break;
        }
      }
    }
  }
}

export function checkVerseRelations({ relativePath, parsed }: StaticFile): void {
  const result = staticVerseRelations.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else {
    /*
     * Iki kural veritabani kisitiyla korunuyor ama cikti dosyasi elle de
     * duzenlenebilir; burada bir daha bakiliyor:
     *   1. Bir ayet kendisiyle iliskilendirilemez (verse_relation_not_self).
     *   2. "muhtemel" yalnizca kavram uzerinden kurulan bag icindir
     *      (plan 12.5) — kissa/olay/kok bagi sayimdir, kesindir.
     */
    for (const [key, list] of Object.entries(result.data.verses)) {
      const id = Number(key);
      const surahId = Math.floor(id / 1000);
      if (surahId < 1 || surahId > 114 || id % 1000 === 0) {
        errors.push(`${relativePath}: gecersiz ayet anahtari ${key}`);
        break;
      }
      for (const r of list) {
        if (r.surahId * 1000 + r.verseNumber === id) {
          errors.push(`${relativePath}: ${key} kendisiyle iliskilendirilmis`);
          break;
        }
        if ((r.confidence === "muhtemel") !== (r.type === "same_topic")) {
          errors.push(
            `${relativePath}: ${key} -> ${String(r.surahId)}:${String(r.verseNumber)} ` +
              `${r.type} turu icin confidence '${r.confidence}' beklenmiyor`,
          );
          break;
        }
      }
    }
  }
}
