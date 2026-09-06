/**
 * QUL (qul.tarteel.ai) tefsir import — el-Muhtasar Turkce.
 *
 * Kaynak dosya elle indirilir: QUL indirmeleri oturum acmayi gerektirir
 * (`/resources/tafsir/<id>/download?format=json` anonim cagride HTTP 401).
 * Bu yuzden script agdan bir sey cekmez; `cache/qul/` altindaki dosyayi okur.
 *
 *   1. https://qul.tarteel.ai/resources/tafsir/258 -> "Download json"
 *   2. inen zip veya json `cache/qul/turkish-mokhtasar.json` olarak acilir
 *   3. pnpm --filter @kuran/import qul-tafsir
 *
 * VERI YAPISI (Sa'di'den farkli, daha basit):
 *   { "<sure>:<ayet>": { "text": "...", "ayah_keys": ["2:3","2:4"] } }
 *   - `ayah_keys` varsa blok birden fazla ayeti kapsar; aralik oradan kurulur.
 *   - Bazi kayitlarin degeri duz DIZEDIR: kanonik kayda isaretcidir
 *     ("2:4": "2:3"). Bu kayitlar atlanir; metin kanonik kayitta zaten var.
 *
 * Idempotenttir; bloklar sil-yaz ile yazilir.
 *
 * Calistirma:  pnpm --filter @kuran/import qul-tafsir
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { computeVerseId } from "@kuran/schema";
import {
  Report,
  closePool,
  fail,
  info,
  pool,
  sanitizeSourceText,
  summarizeRepairs,
  upsertMany,
  withTransaction,
} from "@kuran/pipeline";

const repoRoot = resolve(import.meta.dirname, "../..");
const SRC = join(repoRoot, "cache/qul/turkish-mokhtasar.json");
const SURAH_COUNT = 114;

const RESOURCE_URL = "https://qul.tarteel.ai/resources/tafsir/258";

const TAFSIR = {
  slug: "el-muhtasar",
  name: "el-Muhtasar",
  workTitle: "el-Muhtasar fî Tefsîri'l-Kur'âni'l-Kerîm (Türkçe)",
  author: "Merkezü Tefsîr li'd-Dirâsâti'l-Kur'âniyye",
  license: "Yeniden yayın izinli — izin proje sahibi tarafından alındı (2026-09-06)",
  note:
    "Kur'an bütünlüğünü gözeten kısa/özet tefsir; bir kurul eseridir, tek müellifi yoktur. " +
    "QUL kaynak 258 üzerinden alındı (indirme oturum açmayı gerektirir).",
} as const;

/** Dosyadaki bir kayit: ya {text, ayah_keys?} ya da kanonik anahtara isaretci dize. */
type Entry = { text?: string; ayah_keys?: string[] } | string;

function parseVerseKey(key: string): { surah: number; verse: number } | null {
  const match = /^(\d+):(\d+)$/.exec(key);
  if (match === null) return null;
  const surah = Number(match[1]);
  const verse = Number(match[2]);
  if (!Number.isInteger(surah) || !Number.isInteger(verse)) return null;
  return { surah, verse };
}

// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const report = new Report("qul_tafsir");

  if (!existsSync(SRC)) {
    fail(
      `kaynak dosya yok: ${SRC}\n` +
        `${RESOURCE_URL} adresinden "Download json" ile indirip cache/qul/ altina koyun ` +
        "(QUL indirmesi oturum acmayi gerektirir; script agdan cekmez).",
    );
  }

  // Ayet numaralari Tanzil'e karsi dogrulanir (plan 20.1: tek gercek kaynak).
  const { rows: surahRows } = await pool.query<{ id: number; verse_count: number }>(
    "SELECT id, verse_count FROM surah ORDER BY id",
  );
  if (surahRows.length !== SURAH_COUNT) {
    fail(`surah tablosunda ${SURAH_COUNT} kayit bekleniyordu, ${surahRows.length} bulundu`);
  }
  const verseCountBySurah = new Map(surahRows.map((r) => [r.id, r.verse_count]));

  const raw = JSON.parse(readFileSync(SRC, "utf8")) as Record<string, Entry>;
  const keys = Object.keys(raw);
  info(`${SRC}: ${keys.length} kayit okundu`);

  // --- ayrisitirma ---
  interface Block {
    surahId: number;
    startVerse: number;
    endVerse: number;
    text: string;
  }
  const blocks: Block[] = [];
  const allRepairs: ReturnType<typeof sanitizeSourceText>["repairs"] = [];
  let pointers = 0;
  let grouped = 0;

  for (const key of keys) {
    const parsed = parseVerseKey(key);
    if (parsed === null) {
      report.issue(`anahtar cozulemedi: "${key}" — atlandi`);
      continue;
    }
    const value = raw[key];

    // Isaretci kayit: metin kanonik kayitta duruyor, burada tekrar yazilmaz.
    if (typeof value === "string") {
      pointers += 1;
      if (!(value in raw)) {
        report.issue(`"${key}" -> "${value}" isaretcisi hedefi dosyada yok`);
      }
      continue;
    }
    if (value === undefined) continue;

    const clean = sanitizeSourceText(value.text ?? "", key);
    allRepairs.push(...clean.repairs);
    if (clean.text === "") {
      report.issue(`${key}: bos metin — atlandi`);
      continue;
    }

    const verseCount = verseCountBySurah.get(parsed.surah) ?? 0;
    if (verseCount === 0) {
      report.issue(`${key}: sure ${parsed.surah} Tanzil'de yok — atlandi`);
      continue;
    }

    // Aralik: ayah_keys varsa oradan, yoksa anahtarin kendisi.
    let startVerse = parsed.verse;
    let endVerse = parsed.verse;
    const group = value.ayah_keys;
    if (Array.isArray(group) && group.length > 0) {
      const members = group
        .map(parseVerseKey)
        .filter((m): m is { surah: number; verse: number } => m !== null && m.surah === parsed.surah)
        .map((m) => m.verse);
      if (members.length !== group.length) {
        report.issue(`${key}: ayah_keys icinde baska sureye ait veya bozuk anahtar var`);
      }
      if (members.length > 0) {
        startVerse = Math.min(...members);
        endVerse = Math.max(...members);
        grouped += 1;
      }
    }

    if (startVerse < 1 || endVerse > verseCount || endVerse < startVerse) {
      report.issue(
        `${key}: aralik ${startVerse}-${endVerse}, sure ${verseCount} ayet — atlandi`,
      );
      continue;
    }

    blocks.push({ surahId: parsed.surah, startVerse, endVerse, text: clean.text });
  }

  // Kaynak sirasi anahtar sirasidir; sure icinde ayet numarasina gore siralanir.
  blocks.sort((a, b) => a.surahId - b.surahId || a.startVerse - b.startVerse);
  info(`${blocks.length} blok hazir (${pointers} isaretci atlandi, ${grouped} coklu ayet)`);

  // --- yazim ---
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
          TAFSIR.license,
          "İndirme ücretsiz hesap gerektirir; dosya elle indirilip cache/qul/ altına konur.",
        ],
      ],
      ["slug"],
    );

    await upsertMany(
      client,
      "tafsir",
      [
        "slug",
        "name",
        "work_title",
        "author",
        "language",
        "source_slug",
        "license",
        "license_note",
        "url",
        "publishable",
      ],
      [
        [
          TAFSIR.slug,
          TAFSIR.name,
          TAFSIR.workTitle,
          TAFSIR.author,
          "tr",
          "qul",
          TAFSIR.license,
          TAFSIR.note,
          RESOURCE_URL,
          true,
        ],
      ],
      ["slug"],
    );

    const { rows: idRows } = await client.query<{ id: number }>(
      "SELECT id FROM tafsir WHERE slug = $1",
      [TAFSIR.slug],
    );
    const tafsirId = idRows[0]?.id;
    if (tafsirId === undefined) fail(`tafsir eklenemedi: ${TAFSIR.slug}`);

    // Bloklar upsert DEGIL sil-yaz: kaynakta bir kayit kalkarsa sort_number
    // kayar ve upsert kuyrukta bayat satir birakirdi.
    await client.query("DELETE FROM tafsir_block WHERE tafsir_id = $1", [tafsirId]);

    const sortBySurah = new Map<number, number>();
    const rows = blocks.map((b) => {
      const sortNumber = (sortBySurah.get(b.surahId) ?? 0) + 1;
      sortBySurah.set(b.surahId, sortNumber);
      return [
        tafsirId,
        b.surahId,
        sortNumber,
        "ayet_tefsiri",
        null,
        computeVerseId(b.surahId, b.startVerse),
        computeVerseId(b.surahId, b.endVerse),
        b.text,
      ];
    });

    await upsertMany(
      client,
      "tafsir_block",
      [
        "tafsir_id",
        "surah_id",
        "sort_number",
        "block_type",
        "source_type",
        "start_verse_id",
        "end_verse_id",
        "text",
      ],
      rows,
      ["tafsir_id", "surah_id", "sort_number"],
    );
  });

  // --- dogrulama ---
  const { rows } = await pool.query<{ blocks: string; surahs: string; covered: string }>(
    `SELECT (SELECT count(*) FROM tafsir_block b JOIN tafsir t ON t.id = b.tafsir_id
              WHERE t.slug = $1)                                           AS blocks,
            (SELECT count(DISTINCT b.surah_id) FROM tafsir_block b JOIN tafsir t ON t.id = b.tafsir_id
              WHERE t.slug = $1)                                           AS surahs,
            (SELECT count(*) FROM verse v WHERE EXISTS (
               SELECT 1 FROM tafsir_block b JOIN tafsir t ON t.id = b.tafsir_id
                WHERE t.slug = $1 AND v.id BETWEEN b.start_verse_id AND b.end_verse_id))
                                                                           AS covered`,
    [TAFSIR.slug],
  );
  const summary = rows[0];
  if (summary === undefined) fail("dogrulama sorgusu bos dondu");

  if (Number(summary.surahs) !== SURAH_COUNT) {
    fail(`${SURAH_COUNT} surede blok bekleniyordu, ${summary.surahs} surede bulundu`);
  }

  info(
    `veritabani: ${summary.blocks} blok, ${summary.surahs} sure, ` +
      `6236 ayetin ${summary.covered} tanesinde tefsir var`,
  );

  for (const line of summarizeRepairs(allRepairs)) report.note(`onarim: ${line}`);
  report.note(`kaynak kayit: ${keys.length}, yazilan blok: ${summary.blocks}`);
  report.note(`isaretci kayit (atlandi): ${pointers}`);
  report.note(`birden fazla ayeti kapsayan blok: ${grouped}`);
  report.note(`ayet kapsami: 6236 ayetin ${summary.covered} tanesi`);

  info(`rapor: ${report.write()}`);
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    await closePool();
    fail(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  });
