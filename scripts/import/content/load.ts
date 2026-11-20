/**
 * data/** dosyalarini okur ve girdi semalarina karsi dogrular.
 *
 * Hata firlatmaz: okunamayan ya da semaya uymayan her dosya `parseErrors`a
 * yazilir ki tek kosuda hepsi birden gorulsun.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  aiGeneratedFile,
  aiPromptsFile,
  conceptInput,
  contentSourcesFile,
  mediaFile,
  locationsFile,
  noldekeOrderFile,
  principleAreaInput,
  principleInput,
  storyInput,
  surahSectionsFile,
  timelineFile,
} from "@kuran/schema";
import type {
  AiMediaInput,
  AiPromptInput,
  ConceptInput,
  LocationInput,
  MediaItemInput,
  NoldekeOrderFile,
  PrincipleAreaInput,
  PrincipleInput,
  StoryInput,
  SurahSectionsFile,
  TimelineEventInput,
} from "@kuran/schema";
import { repoRoot } from "@kuran/pipeline";

const DATA = resolve(repoRoot, "data");

export const parseErrors: string[] = [];

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    parseErrors.push(`${relative(repoRoot, path)}: gecersiz JSON — ${String(error)}`);
    return undefined;
  }
}

function parseWith<T>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { message: string } } },
  value: unknown,
  path: string,
): T | undefined {
  if (value === undefined) return undefined;
  const result = schema.safeParse(value);
  if (!result.success) {
    parseErrors.push(`${relative(repoRoot, path)}:\n${result.error.message}`);
    return undefined;
  }
  return result.data;
}

/** data/<dir>/<prefix>_*.json — sirali, deterministik. */
function listPrefixed(dir: string, prefix: string): string[] {
  const full = join(DATA, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((name) => name.startsWith(`${prefix}_`) && name.endsWith(".json"))
    .sort()
    .map((name) => join(full, name));
}

export interface Loaded {
  sources: ReturnType<typeof contentSourcesFile.parse>["sources"];
  locations: LocationInput[];
  stories: StoryInput[];
  concepts: ConceptInput[];
  principleAreas: PrincipleAreaInput[];
  principles: PrincipleInput[];
  events: TimelineEventInput[];
  sections: SurahSectionsFile[];
  noldeke: NoldekeOrderFile | null;
  /** Gercek medya — spec 32-48 */
  media: MediaItemInput[];
  /** AI prompt'lari — spec 65; medya URETMEZ, yalnizca tanimlar */
  prompts: AiPromptInput[];
  /** Uretilmis AI medyasi — kuyruk toplayicisinin yazdigi dosya */
  aiMedia: AiMediaInput[];
}

export function loadAll(): Loaded {
  const sourcesPath = join(DATA, "sources/content_sources.json");
  const sources = existsSync(sourcesPath)
    ? parseWith(contentSourcesFile, readJson(sourcesPath), sourcesPath)?.sources ?? []
    : [];

  const locationsPath = join(DATA, "locations/locations.json");
  const locations = existsSync(locationsPath)
    ? parseWith(locationsFile, readJson(locationsPath), locationsPath)?.locations ?? []
    : [];

  const stories: StoryInput[] = [];
  for (const path of listPrefixed("stories", "story")) {
    const story = parseWith(storyInput, readJson(path), path);
    if (story === undefined) continue;
    // Dosya adi slug'i tasimali — plan 20.2 (story_hz-yusuf.json)
    if (!path.endsWith(`story_${story.slug}.json`)) {
      parseErrors.push(`${relative(repoRoot, path)}: dosya adi story_${story.slug}.json olmali`);
    }
    stories.push(story);
  }

  const concepts: ConceptInput[] = [];
  for (const path of listPrefixed("concepts", "concept")) {
    const concept = parseWith(conceptInput, readJson(path), path);
    if (concept === undefined) continue;
    if (!path.endsWith(`concept_${concept.slug}.json`)) {
      parseErrors.push(`${relative(repoRoot, path)}: dosya adi concept_${concept.slug}.json olmali`);
    }
    concepts.push(concept);
  }

  const principleAreas: PrincipleAreaInput[] = [];
  for (const path of listPrefixed("principle_areas", "area")) {
    const area = parseWith(principleAreaInput, readJson(path), path);
    if (area === undefined) continue;
    if (!path.endsWith(`area_${area.slug}.json`)) {
      parseErrors.push(`${relative(repoRoot, path)}: dosya adi area_${area.slug}.json olmali`);
    }
    principleAreas.push(area);
  }

  const principles: PrincipleInput[] = [];
  for (const path of listPrefixed("principles", "principle")) {
    const principle = parseWith(principleInput, readJson(path), path);
    if (principle === undefined) continue;
    if (!path.endsWith(`principle_${principle.slug}.json`)) {
      parseErrors.push(
        `${relative(repoRoot, path)}: dosya adi principle_${principle.slug}.json olmali`,
      );
    }
    principles.push(principle);
  }

  const timelinePath = join(DATA, "timeline/timeline.json");
  const events = existsSync(timelinePath)
    ? parseWith(timelineFile, readJson(timelinePath), timelinePath)?.events ?? []
    : [];

  // Bolumleme: sure basina bir dosya. Dosya adi sure numarasini tasir; ic
  // alanla uyusmazsa sessizce yanlis sureye yazilirdi, bu yuzden kontrol var.
  const sections: SurahSectionsFile[] = [];
  for (const path of listPrefixed("sections", "sections")) {
    const file = parseWith(surahSectionsFile, readJson(path), path);
    if (file === undefined) continue;
    if (!path.endsWith(`sections_${String(file.surahId)}.json`)) {
      parseErrors.push(
        `${relative(repoRoot, path)}: dosya adi sections_${String(file.surahId)}.json olmali`,
      );
    }
    sections.push(file);
  }

  const noldekePath = join(DATA, "timeline/noldeke_order.json");
  const noldeke = existsSync(noldekePath)
    ? parseWith(noldekeOrderFile, readJson(noldekePath), noldekePath) ?? null
    : null;

  /*
   * Medya: cografya basina bir dosya. Dosya adi ile ic alan arasinda kissa/
   * bolumleme dosyalarindaki gibi bir bag YOKTUR — bir dosya birden fazla
   * konumun medyasini tasiyabilir (media_medine.json Uhud'u da tasiyor),
   * bu yuzden ad denetimi yapilmaz.
   */
  const media: MediaItemInput[] = [];
  for (const path of listPrefixed("media", "media")) {
    const file = parseWith(mediaFile, readJson(path), path);
    if (file === undefined) continue;
    media.push(...file.items);
  }

  const prompts: AiPromptInput[] = [];
  const promptsDir = join(DATA, "media/prompts");
  if (existsSync(promptsDir)) {
    for (const name of readdirSync(promptsDir).filter((n) => n.endsWith(".json")).sort()) {
      const path = join(promptsDir, name);
      const file = parseWith(aiPromptsFile, readJson(path), path);
      if (file === undefined) continue;
      prompts.push(...file.prompts);
    }
  }

  const aiPath = join(DATA, "media/ai_generated.json");
  const aiMedia = existsSync(aiPath)
    ? parseWith(aiGeneratedFile, readJson(aiPath), aiPath)?.items ?? []
    : [];

  return {
    sources, locations, stories, concepts, principleAreas, principles, events, sections, noldeke,
    media, prompts, aiMedia,
  };
}
