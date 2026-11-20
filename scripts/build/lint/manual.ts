/**
 * C. data/** elle hazirlanan veri — ayet referanslari ve slug'lar veritabaninda
 * var mi.
 */

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  conceptInput,
  aiGeneratedFile,
  aiPromptsFile,
  contentSourcesFile,
  mediaFile,
  locationsFile,
  noldekeOrderFile,
  parseVerseRef,
  principleInput,
  recitationFile,
  storyInput,
  surahSectionsFile,
  timelineFile,
  scriptureBooksFile,
  scriptureQuotesFile,
  verseRef as verseRefSchema,
} from "@kuran/schema";
import { info, pool, repoRoot } from "@kuran/pipeline";
import { errors, tick, warn } from "./report.js";
import { listJsonFiles } from "./files.js";
import { rows } from "./database.js";

/**
 * Elle veri dosyalarindaki ayet referanslarini toplar ve veritabanina karsi
 * dogrular. Tur bazli girdi semalari (storyInput, principleInput …) ilk kissa
 * JSON'u yazildiginda Faz 1'de eklenecektir; bu tarama o zamana kadar var
 * olmayan referansi yakalar.
 */
function collectVerseRefs(value: unknown, path: string, found: Map<string, string[]>): void {
  if (typeof value === "string") {
    if (verseRefSchema.safeParse(value).success) {
      const list = found.get(value) ?? [];
      list.push(path);
      found.set(value, list);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectVerseRefs(item, path, found));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectVerseRefs(item, path, found);
  }
}

export async function checkManualData(): Promise<void> {
  info("C. data/** elle veri");

  const manualRoot = join(repoRoot, "data");
  const files = listJsonFiles(manualRoot);

  if (files.length === 0) {
    info("   data/ altinda JSON yok — kontrol edilecek referans bulunmadi");
    return;
  }

  /**
   * Tur bazli girdi semalari (Faz 1'de eklenecegi soylenmisti — eklendi,
   * 2026-09-05). Dosya yolu hangi semayi soyluyorsa o uygulanir; bilinmeyen
   * yol yalnizca ayet referansi taramasindan gecer ve UYARI verir.
   */
  const inputSchemaFor = (rel: string):
    | { safeParse: (v: unknown) => { success: boolean; error?: { message: string } } }
    | null => {
    if (rel === "data/sources/content_sources.json") return contentSourcesFile;
    if (rel === "data/scripture/books.json") return scriptureBooksFile;
    if (rel === "data/scripture/quotes.json") return scriptureQuotesFile;
    if (rel === "data/locations/locations.json") return locationsFile;
    if (rel === "data/timeline/timeline.json") return timelineFile;
    if (rel === "data/timeline/noldeke_order.json") return noldekeOrderFile;
    if (/^data\/stories\/story_[a-z0-9-]+\.json$/.test(rel)) return storyInput;
    if (/^data\/principles\/principle_[a-z0-9-]+\.json$/.test(rel)) return principleInput;
    if (/^data\/concepts\/concept_[a-z0-9-]+\.json$/.test(rel)) return conceptInput;
    if (/^data\/sections\/sections_(?:[1-9]|[1-9][0-9]|10[0-9]|11[0-4])\.json$/.test(rel)) {
      return surahSectionsFile;
    }
    if (/^data\/media\/media_[a-z0-9-]+\.json$/.test(rel)) return mediaFile;
    if (/^data\/media\/prompts\/prompt_[a-z0-9-]+\.json$/.test(rel)) return aiPromptsFile;
    if (rel === "data/media/ai_generated.json") return aiGeneratedFile;
    if (/^data\/recitation\/reciter_[a-z0-9-]+\.json$/.test(rel)) return recitationFile;
    return null;
  };

  const refs = new Map<string, string[]>();
  for (const path of files) {
    const relativePath = relative(repoRoot, path);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      errors.push(`${relativePath}: gecersiz JSON — ${String(error)}`);
      continue;
    }
    const schema = inputSchemaFor(relativePath);
    tick();
    if (schema === null) {
      warn("elle veri", `${relativePath}: tanimli girdi semasi yok, yalnizca ayet referanslari tarandi`);
    } else {
      const result = schema.safeParse(parsed);
      if (!result.success) errors.push(`${relativePath}: ${result.error?.message ?? "sema hatasi"}`);
    }
    collectVerseRefs(parsed, relativePath, refs);
  }

  info(`   ${files.length} dosya, ${refs.size} farkli ayet referansi`);

  // Referanslari tek sorguda coz
  const keys = [...refs.keys()];
  for (const ref of keys) {
    const { surahNumber, verseStart, verseEnd } = parseVerseRef(ref);
    tick();

    const { rows: found } = await pool.query<{ hit: string }>(
      `SELECT count(*)::text AS hit FROM verse
        WHERE surah_id = $1 AND verse_number BETWEEN $2 AND $3`,
      [surahNumber, verseStart, verseEnd],
    );
    const expected = verseEnd - verseStart + 1;
    if (Number(found[0]?.hit ?? "0") !== expected) {
      errors.push(
        `ayet referansi '${ref}' cozulemedi (${refs.get(ref)?.join(", ") ?? ""}) — ` +
          `${expected} ayet bekleniyordu, ${found[0]?.hit ?? 0} bulundu`,
      );
    }
    if (verseEnd < verseStart) {
      errors.push(`ayet referansi '${ref}' tersine aralik`);
    }
  }
}
