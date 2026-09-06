/**
 * QUL kelime-kok eslesmesi — verse_part.root_id BOSLUKLARINI doldurur.
 *
 * Kaynak: qul.tarteel.ai "Quranic Grammar and Morphology" -> word-root.db
 * (SQLite). Dosya elle indirilir; QUL indirmesi oturum acmayi gerektirir.
 *   cache/qul/word-root.db
 *
 * NEDEN sqlite3 CLI:
 *   Node 20'de gomulu `node:sqlite` yok (22.5'te geldi) ve depoya native ya da
 *   wasm sqlite bagimliligi eklemek istemiyoruz. Import scriptleri zaten
 *   YALNIZCA build makinesinde calisir (scripts/import/package.json), orada
 *   sqlite3 CLI var. Tek bir SELECT calistirilip cikti okunur.
 *
 * NE YAPAR / NE YAPMAZ:
 *   - YALNIZCA `verse_part.root_id IS NULL` olan kelimeleri doldurur.
 *   - Dolu bir kok kaydinin USTUNE YAZMAZ. Gerekcesi olculdu: QUL'un kelime
 *     indeksi bazi yerlerde kaymis. Ornek 2:181 —
 *       kelime 12  سَمِيعٌ  bizde سمع (dogru)  QUL اله  (yanlis)
 *       kelime 13  عَلِيمٌۭ  bizde علم (dogru)  QUL سمع  (bir kaymis)
 *     Celiskiler rapora tek tek yazilir; karar insana birakilir.
 *   - Bizde olmayan kok EKLEMEZ; rapora yazar. Kok tablosu Acik Kuran'dan
 *     gelir, tek kaynakli kalir (plan 20.1).
 *
 * Calistirma:  pnpm --filter @kuran/import qul-word-root
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Report, closePool, fail, info, pool, withTransaction } from "@kuran/pipeline";

const repoRoot = resolve(import.meta.dirname, "../..");
const DB = join(repoRoot, "cache/qul/word-root.db");
const RESOURCE_URL = "https://qul.tarteel.ai/resources/word_translation";

/** Bir QUL bagi: kok (bosluksuz Arapca) + kelimenin yeri. */
interface QulLink {
  arabic: string;
  verseId: number;
  wordNo: number;
}

/**
 * SQLite'tan kok-kelime baglarini okur.
 *
 * `roots.arabic_trilateral` harfleri bosluklu tutuyor ("ث   و   ي");
 * bizim `root.arabic` bitisik. Bosluklar silinerek eslestirilir.
 */
function readLinks(): QulLink[] {
  const raw = execFileSync(
    "sqlite3",
    [
      DB,
      "-separator",
      "\t",
      "SELECT r.arabic_trilateral, rw.word_location FROM root_words rw " +
        "JOIN roots r ON r.id = rw.root_id",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );

  const links: QulLink[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    const [arabicRaw, location] = line.split("\t");
    if (arabicRaw === undefined || location === undefined) continue;
    const parts = location.split(":");
    if (parts.length !== 3) continue;
    const surah = Number(parts[0]);
    const verse = Number(parts[1]);
    const wordNo = Number(parts[2]);
    if (!Number.isInteger(surah) || !Number.isInteger(verse) || !Number.isInteger(wordNo)) continue;
    links.push({
      arabic: arabicRaw.replace(/\s+/g, ""),
      verseId: surah * 1000 + verse,
      wordNo,
    });
  }
  return links;
}

// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const report = new Report("qul_word_root");

  if (!existsSync(DB)) {
    fail(
      `kaynak dosya yok: ${DB}\n` +
        `${RESOURCE_URL} adresinden "Quranic Grammar and Morphology" indirilip ` +
        "cache/qul/word-root.db olarak acilmali (QUL indirmesi oturum ister).",
    );
  }

  const links = readLinks();
  if (links.length === 0) fail("sqlite'tan hic bag okunamadi");
  info(`${links.length.toLocaleString("tr-TR")} kelime-kok bagi okundu`);

  const before = await countLinked();

  await withTransaction(async (client) => {
    await client.query(
      `CREATE TEMP TABLE tmp_qul_root (
         arabic   text NOT NULL,
         verse_id integer NOT NULL,
         word_no  integer NOT NULL
       ) ON COMMIT DROP`,
    );
    // Gecici tabloya duz INSERT; upsertMany catisma anahtari ister, burada yok.
    const CHUNK = 1000;
    for (let offset = 0; offset < links.length; offset += CHUNK) {
      const chunk = links.slice(offset, offset + CHUNK);
      const values: unknown[] = [];
      const tuples = chunk.map((l) => {
        values.push(l.arabic, l.verseId, l.wordNo);
        return `($${values.length - 2}, $${values.length - 1}, $${values.length})`;
      });
      await client.query(
        `INSERT INTO tmp_qul_root (arabic, verse_id, word_no) VALUES ${tuples.join(", ")}`,
        values,
      );
    }
    info(`gecici tabloya ${links.length.toLocaleString("tr-TR")} satir yazildi`);

    // --- once celiskiler ve eksikler raporlanir, sonra yazilir ---
    const { rows: conflicts } = await client.query<{
      yer: string;
      kelime: string;
      bizim: string;
      qul: string;
    }>(
      `SELECT q.verse_id || ':' || q.word_no AS yer,
              p.arabic                       AS kelime,
              br.arabic                      AS bizim,
              q.arabic                       AS qul
         FROM tmp_qul_root q
         JOIN verse_part p ON p.verse_id = q.verse_id AND p.sort_number = q.word_no
         JOIN root r  ON r.arabic = q.arabic
         JOIN root br ON br.id = p.root_id
        WHERE p.root_id IS NOT NULL AND p.root_id <> r.id
        ORDER BY q.verse_id, q.word_no`,
    );
    for (const c of conflicts) {
      report.issue(
        `celiski ${c.yer} "${c.kelime}": bizde ${c.bizim}, QUL ${c.qul} — ` +
          "DOKUNULMADI, dolu kayit korunur",
      );
    }

    const { rows: missingRoots } = await client.query<{ arabic: string; adet: string }>(
      `SELECT q.arabic, count(*)::text AS adet
         FROM tmp_qul_root q
        WHERE NOT EXISTS (SELECT 1 FROM root r WHERE r.arabic = q.arabic)
        GROUP BY q.arabic
        ORDER BY count(*) DESC`,
    );
    for (const m of missingRoots) {
      report.issue(`kok tablomuzda yok: "${m.arabic}" (${m.adet} kelime) — eklenmedi`);
    }

    const { rows: missingWords } = await client.query<{ adet: string }>(
      `SELECT count(*)::text AS adet
         FROM tmp_qul_root q
        WHERE NOT EXISTS (
          SELECT 1 FROM verse_part p
           WHERE p.verse_id = q.verse_id AND p.sort_number = q.word_no)`,
    );
    const notFound = Number(missingWords[0]?.adet ?? 0);
    if (notFound > 0) {
      report.note(`kelime konumu bizde bulunamadi: ${notFound} (kelime bolutlemesi farkli)`);
    }

    // --- yalnizca BOS olanlar doldurulur ---
    const updated = await client.query(
      `UPDATE verse_part p
          SET root_id = r.id
         FROM tmp_qul_root q
         JOIN root r ON r.arabic = q.arabic
        WHERE p.verse_id = q.verse_id
          AND p.sort_number = q.word_no
          AND p.root_id IS NULL`,
    );
    info(`verse_part.root_id: ${(updated.rowCount ?? 0).toLocaleString("tr-TR")} bosluk dolduruldu`);
  });

  const after = await countLinked();
  const total = after.total;
  const pctBefore = ((before.linked / total) * 100).toFixed(1);
  const pctAfter = ((after.linked / total) * 100).toFixed(1);

  info(
    `kok kapsami: ${before.linked.toLocaleString("tr-TR")} -> ` +
      `${after.linked.toLocaleString("tr-TR")} / ${total.toLocaleString("tr-TR")} ` +
      `(%${pctBefore} -> %${pctAfter})`,
  );

  report.note(`okunan QUL bagi: ${links.length}`);
  report.note(`kok kapsami: %${pctBefore} -> %${pctAfter} (${after.linked - before.linked} yeni bag)`);
  report.note("Dolu kok kayitlarinin ustune YAZILMADI; celiskiler yukarida tek tek listelendi.");

  info(`rapor: ${report.write()}`);
}

async function countLinked(): Promise<{ linked: number; total: number }> {
  const { rows } = await pool.query<{ linked: string; total: string }>(
    "SELECT count(root_id)::text AS linked, count(*)::text AS total FROM verse_part",
  );
  return { linked: Number(rows[0]?.linked ?? 0), total: Number(rows[0]?.total ?? 0) };
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    await closePool();
    fail(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  });
