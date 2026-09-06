/**
 * QUL "matching ayah" — LAFZI BENZERLIK iliskileri (verse_relation).
 *
 * Kaynak: qul.tarteel.ai -> matching-ayah.json. Dosya elle indirilir
 * (QUL indirmesi oturum acmayi gerektirir):  cache/qul/matching-ayah.json
 *
 * NE GETIRIR — bizde olandan farki:
 *   Mevcut 40 binden fazla `same_root` bagi KOK ortakligindan hesaplanir.
 *   Bu veri ise LAFZI benzerliktir: Kur'an'da tekrarlanan ibareler, yani
 *   muteşabih ayetler. `verse_relation_type` enum'undaki `parallel_passage`
 *   degeri tam bunun icin vardi ve bos duruyordu.
 *
 * VERI YAPISI:
 *   { "<sure>:<ayet>": [ { matched_ayah_key, matched_words_count,
 *                          coverage, score, match_words: [[bas,son], ...] } ] }
 *   `match_words` ortusen kelime araliklaridir; `note` alaninda saklanir,
 *   ileride eslesen kismi vurgulamak icin.
 *
 * GUVEN (confidence): hepsi `kesin`.
 *   Plan 12.5 ve linter kurali: `muhtemel` YALNIZCA kavram uzerinden kurulan
 *   bag icindir; kissa/olay/kok bagi gibi SAYIMA dayanan baglar kesindir.
 *   Lafzi ortusme de bir sayimdir — kelimeler ya ortusur ya ortusmez, yorum
 *   yok. Baglantinin GUCU ayri bir sey ve `reason` metninde yaziyor
 *   ("kapsam %5, benzerlik puani 50"), guven alaninda degil.
 *
 * SIRALAMA:
 *   Bir ayetin baglari puanina gore azalan sirada yazilir. Ayet sayfasi
 *   satirlari id sirasinda okuyor (build/lib/content.ts), yani yazim sirasi
 *   = gosterim sirasi: guclu eslesmeler once.
 *
 * Idempotenttir: bu kaynaktan gelen `parallel_passage` baglari sil-yaz ile
 * yenilenir; baska turdeki (same_root, same_story...) baglara DOKUNULMAZ.
 *
 * Calistirma:  pnpm --filter @kuran/import qul-matching-ayah
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Report, closePool, fail, info, pool, upsertMany, withTransaction } from "@kuran/pipeline";

const repoRoot = resolve(import.meta.dirname, "../..");
const SRC = join(repoRoot, "cache/qul/matching-ayah.json");
const RESOURCE_URL = "https://qul.tarteel.ai/resources/ayah_topic";

interface ApiMatch {
  matched_ayah_key: string;
  matched_words_count: number;
  coverage: number;
  score: number;
  match_words?: [number, number][];
}

function parseVerseKey(key: string): number | null {
  const match = /^(\d+):(\d+)$/.exec(key);
  if (match === null) return null;
  const surah = Number(match[1]);
  const verse = Number(match[2]);
  if (!Number.isInteger(surah) || !Number.isInteger(verse)) return null;
  if (surah < 1 || surah > 114 || verse < 1) return null;
  return surah * 1000 + verse;
}

/** "5-8, 12-13" — ortusen kelime araliklari, insan okuyabilir bicimde. */
function formatWords(ranges: readonly [number, number][] | undefined): string | null {
  if (ranges === undefined || ranges.length === 0) return null;
  const parts = ranges
    .filter((r) => Array.isArray(r) && r.length === 2)
    .map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`));
  return parts.length === 0 ? null : `Örtüşen kelimeler: ${parts.join(", ")}`;
}

// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const report = new Report("qul_matching_ayah");

  if (!existsSync(SRC)) {
    fail(
      `kaynak dosya yok: ${SRC}\n` +
        `${RESOURCE_URL} adresinden matching-ayah indirilip cache/qul/ altina konmali.`,
    );
  }

  const raw = JSON.parse(readFileSync(SRC, "utf8")) as Record<string, ApiMatch[]>;
  const sourceKeys = Object.keys(raw);
  info(`${sourceKeys.length} kaynak ayet okundu`);

  // Gecerli ayet kimlikleri Tanzil'den; olmayan ayete bag kurulmaz.
  const { rows: verseRows } = await pool.query<{ id: number }>("SELECT id FROM verse");
  const validVerses = new Set(verseRows.map((r) => r.id));

  interface Relation {
    source: number;
    target: number;
    reason: string;
    note: string | null;
    /** Siralama icin tasinir; veritabanina yazilmaz. */
    score: number;
  }
  const relations = new Map<string, Relation>();

  let skippedSelf = 0;
  let skippedMissing = 0;
  let duplicates = 0;

  for (const key of sourceKeys) {
    const sourceId = parseVerseKey(key);
    if (sourceId === null || !validVerses.has(sourceId)) {
      report.issue(`kaynak ayet cozulemedi veya Tanzil'de yok: "${key}"`);
      continue;
    }
    for (const match of raw[key] ?? []) {
      const targetId = parseVerseKey(match.matched_ayah_key);
      if (targetId === null || !validVerses.has(targetId)) {
        skippedMissing += 1;
        continue;
      }
      if (targetId === sourceId) {
        skippedSelf += 1;
        continue;
      }

      const words = Number(match.matched_words_count) || 0;
      const coverage = Number(match.coverage) || 0;
      const score = Number(match.score) || 0;

      const pairKey = `${sourceId}-${targetId}`;
      if (relations.has(pairKey)) {
        duplicates += 1;
        continue;
      }

      relations.set(pairKey, {
        source: sourceId,
        target: targetId,
        // Gerekce kullaniciya gosterilir; sayilar kaynagin kendi olcumleridir.
        reason:
          `Lafzî benzerlik: ${words} kelime örtüşüyor ` +
          `(kapsam %${coverage}, benzerlik puanı ${score})`,
        note: formatWords(match.match_words),
        score,
      });
    }
  }

  info(`${relations.size} lafzi benzerlik bagi hazir`);

  await withTransaction(async (client) => {
    await upsertMany(
      client,
      "source",
      ["slug", "name", "work_title", "author", "reference", "url", "license", "note"],
      [
        [
          "qul",
          "QUL — Quranic Universal Library (Tarteel)",
          "Quranic Universal Library",
          null,
          RESOURCE_URL,
          "https://qul.tarteel.ai/",
          "Yeniden yayın izinli — izin proje sahibi tarafından alındı (2026-09-06)",
          "İndirme ücretsiz hesap gerektirir; dosya elle indirilip cache/qul/ altına konur.",
        ],
      ],
      ["slug"],
    );

    const { rows: sourceRows } = await client.query<{ id: number }>(
      "SELECT id FROM source WHERE slug = 'qul'",
    );
    const sourceId = sourceRows[0]?.id;
    if (sourceId === undefined) fail("qul kaynak kaydi bulunamadi");

    // Yalnizca BU kaynaktan gelen parallel_passage baglari yenilenir.
    // same_root / same_story / same_topic baglarina dokunulmaz.
    const removed = await client.query(
      "DELETE FROM verse_relation WHERE relation_type = 'parallel_passage' AND source_id = $1",
      [sourceId],
    );
    if ((removed.rowCount ?? 0) > 0) {
      info(`${removed.rowCount} eski parallel_passage bagi silindi`);
    }

    await upsertMany(
      client,
      "verse_relation",
      [
        "source_verse_id",
        "target_verse_id",
        "relation_type",
        "reason",
        "source_id",
        "confidence",
        "note",
      ],
      [...relations.values()]
        .sort((a, b) => a.source - b.source || b.score - a.score)
        .map((r) => [
        r.source,
        r.target,
        "parallel_passage",
        r.reason,
        sourceId,
        "kesin",
        r.note,
      ]),
      ["source_verse_id", "target_verse_id", "relation_type"],
    );
  });

  // --- dogrulama ---
  const { rows } = await pool.query<{ toplam: string; ayet: string }>(
    `SELECT count(*)::text                        AS toplam,
            count(DISTINCT source_verse_id)::text AS ayet
       FROM verse_relation WHERE relation_type = 'parallel_passage'`,
  );
  const summary = rows[0];
  if (summary === undefined) fail("dogrulama sorgusu bos dondu");

  info(`veritabani: ${summary.toplam} lafzi benzerlik bagi, ${summary.ayet} ayetten`);

  report.note(`kaynak ayet: ${sourceKeys.length}, kurulan bag: ${summary.toplam}`);
  report.note("guven: hepsi 'kesin' — lafzi ortusme sayimdir, yorum degildir (plan 12.5).");
  report.note(`atlanan — kendine bag: ${skippedSelf}, hedef ayet yok: ${skippedMissing}`);
  report.note(`atlanan — ayni cift tekrar: ${duplicates}`);

  info(`rapor: ${report.write()}`);
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    await closePool();
    fail(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  });
