import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Report, closePool, fail, info, pool, repairVerseSegments, repoRoot, warn } from "@kuran/pipeline";
import { segmentFile } from "@kuran/schema";

/**
 * Kelime zaman damgasi indiricisi — plan 04.
 *
 * ============================================================================
 * NEDEN QDC, NEDEN SIMDI
 * ============================================================================
 *
 * fetch_recitation.ts "QUL paketinde segments.json bos geliyordu" diyor. O
 * tespit ESKIDI: Quran.com'un QDC ucu kelime kelime damga veriyor ve 6236
 * ayetin HEPSINDE dolu (2026-09-07 olcumu).
 *
 * Damga SURE mp3'une gore. Bizde ayet basina dosya var; 300 ayetlik olcumde
 * iki kaydin ayni ustadan kesildigi dogrulandi (sure farki medyan 2 ms,
 * p95 6 ms). Bu yuzden sure MP3'u INDIRILMIYOR, damga `timestamp_from`
 * cikarilarak ayete goreli hale getiriliyor.
 *
 * ============================================================================
 * NEDEN VERITABANI OKUNUYOR
 * ============================================================================
 *
 * Dogrunun olcusu `verse_part` satir sayisidir. Kaynagin indisine korlemesine
 * guvenmek, tek bir ayette kaydigi anda isigi butun sure boyunca yanlis
 * kelimeye yakardi. Uyusmayan her ayet rapora yazilir.
 *
 * ============================================================================
 * KULLANIM
 * ============================================================================
 *
 *   pnpm media:segments                    alafasy
 *   pnpm media:segments --reciter husary
 *   pnpm media:segments --limit 5          ilk N sure (deneme)
 *   pnpm media:segments --force            onbellegi yok say
 *
 * Sonra:  pnpm build
 */

interface SegmentSource {
  slug: string;
  /** QDC audio/reciters/<id> */
  qdcId: number;
  name: string;
}

const SOURCES: Record<string, SegmentSource> = {
  alafasy: { slug: "alafasy", qdcId: 7, name: "Mishary Rashid Alafasy" },
  husary: { slug: "husary", qdcId: 6, name: "Mahmoud Khalil Al-Husary" },
};

const API = "https://api.qurancdn.com/api/qdc/audio/reciters";
/** Baslik olmadan 403 doner. */
const HEADERS = {
  "User-Agent": "kurankesfi.tr/1.0 (+https://kurankesfi.tr)",
  Accept: "application/json",
};

interface QdcVerseTiming {
  verse_key: string;
  timestamp_from: number;
  duration: number;
  segments: number[][] | null;
}

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

async function fetchChapter(
  source: SegmentSource,
  chapter: number,
  force: boolean,
): Promise<QdcVerseTiming[]> {
  const cacheDir = resolve(repoRoot, "scripts/media/.tmp/segments", source.slug);
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = resolve(cacheDir, `${String(chapter)}.json`);

  let body = "";
  if (!force && existsSync(cachePath)) {
    body = readFileSync(cachePath, "utf8");
  } else {
    const url = `${API}/${String(source.qdcId)}/audio_files?chapter=${String(chapter)}&segments=true`;
    let lastError = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
        body = await response.text();
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    if (body === "") fail(`sure ${String(chapter)} indirilemedi: ${lastError}`);
    writeFileSync(cachePath, body, "utf8");
  }

  const parsed = JSON.parse(body) as { audio_files?: { verse_timings?: QdcVerseTiming[] }[] };
  const timings = parsed.audio_files?.[0]?.verse_timings;
  if (!timings) fail(`sure ${String(chapter)}: verse_timings yok`);
  return timings;
}

async function main(): Promise<void> {
  const slugArg = arg("reciter") ?? "alafasy";
  const source = SOURCES[slugArg];
  if (!source) fail(`bilinmeyen kari: ${slugArg} (${Object.keys(SOURCES).join(", ")})`);

  const force = process.argv.includes("--force");
  const limitArg = arg("limit");
  const lastChapter = limitArg === null ? 114 : Number(limitArg);

  const report = new Report(`segments-${source.slug}`);

  // DB'deki kelime sayilari — dogrunun olcusu.
  const rows = (
    await pool.query<{ surah_id: number; verse_number: number; n: string }>(
      `SELECT v.surah_id, v.verse_number, count(p.*)::text AS n
         FROM verse_part p JOIN verse v ON v.id = p.verse_id
        GROUP BY 1, 2`,
    )
  ).rows;
  if (rows.length === 0) fail("verse_part tablosu bos — once 'pnpm data:import' calistirin");

  const wordCounts = new Map<string, number>();
  for (const row of rows) {
    wordCounts.set(`${String(row.surah_id)}:${String(row.verse_number)}`, Number(row.n));
  }
  info(`veritabani: ${String(wordCounts.size)} ayetin kelime sayisi okundu`);

  const verses: Record<string, number[]> = {};
  let wordTotal = 0;
  let interpolatedTotal = 0;
  let leadRepairedTotal = 0;
  let cappedTotal = 0;

  for (let chapter = 1; chapter <= lastChapter; chapter += 1) {
    const timings = await fetchChapter(source, chapter, force);
    for (const timing of timings) {
      const key = timing.verse_key;
      const wordCount = wordCounts.get(key);
      if (wordCount === undefined) {
        report.issue(`${key}: veritabaninda kelime yok, atlandi`);
        continue;
      }
      const result = repairVerseSegments({
        wordCount,
        verseStartMs: timing.timestamp_from,
        verseDurationMs: timing.duration,
        segments: timing.segments ?? [],
      });
      verses[key] = result.starts;
      wordTotal += wordCount;
      interpolatedTotal += result.interpolated;
      if (result.leadRepaired) leadRepairedTotal += 1;
      if (result.capped) cappedTotal += 1;
      if (result.interpolated > 0) {
        report.note(
          `${key}: ${String(result.interpolated)} kelime aradegerlendi ` +
            `(${String(wordCount)} kelimelik ayet)`,
        );
      }
      if (result.capped) report.note(`${key}: kaynak indisi kelime sayisini asti, kirpildi`);
      if (result.leadRepaired) report.note(`${key}: bozuk on-yukleme atildi`);
    }
    if (chapter % 20 === 0) info(`sure ${String(chapter)}/114`);
  }

  const missing = [...wordCounts.keys()].filter((k) => !(k in verses));
  if (missing.length > 0 && lastChapter === 114) {
    fail(`${String(missing.length)} ayetin damgasi gelmedi — ornek: ${missing.slice(0, 5).join(", ")}`);
  }

  const payload = {
    reciterSlug: source.slug,
    sourceUrl: `${API}/${String(source.qdcId)}/audio_files?segments=true`,
    fetchedAt: new Date().toISOString().slice(0, 10),
    stats: {
      verseCount: Object.keys(verses).length,
      wordCount: wordTotal,
      interpolatedWords: interpolatedTotal,
      repairedLeads: leadRepairedTotal,
      cappedVerses: cappedTotal,
    },
    verses,
  };

  const checked = segmentFile.safeParse(payload);
  if (!checked.success) fail(`sema dogrulamasi basarisiz:\n${checked.error.message}`);

  const outPath = resolve(repoRoot, "data/recitation", `segments_${source.slug}.json`);
  const body = JSON.stringify(payload);
  writeFileSync(outPath, `${body}\n`, "utf8");

  info(
    `${source.name}: ${String(payload.stats.verseCount)} ayet · ` +
      `${wordTotal.toLocaleString("tr-TR")} kelime · ` +
      `${String(interpolatedTotal)} aradegerlenen · ` +
      `${String(leadRepairedTotal)} bozuk on-yukleme · ` +
      `${String(cappedTotal)} kirpilan · ${(Buffer.byteLength(body) / 1024).toFixed(0)} KB`,
  );
  if (interpolatedTotal / Math.max(1, wordTotal) > 0.01) {
    warn("aradegerlenen kelime orani %1'i asti — kaynak bozulmus olabilir");
  }
  report.write();
  await closePool();
}

await main();
