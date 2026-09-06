/**
 * quranenc.com ceviri seti import — author, translation ve footnote.
 *
 * Kaynak: Kral Fahd Kur'an-i Kerim Basim Kompleksi / Rowwad Tercume Merkezi.
 * Uc Turkce meal getirir; ucu de Tanzil setinde YOKTUR (cakisma kontrolu
 * asagida `assertNoSlugClash` ile yapilir).
 *
 * TELIF (quranenc.com/en/home/api -> "Terms and Policies"):
 *   "Contents of the translations can be downloaded and re-published, with the
 *    following terms and conditions:
 *      1. No modification, addition, or deletion of the content.
 *      2. Clearly referring to the publisher and the source (QuranEnc.com).
 *      3. Mentioning the version number when re-publishing the translation.
 *      4. Keeping the transcript information inside the document.
 *      5. Notifying the source (QuranEnc.com) of any note on the translation.
 *      6. Updating the translation according to the latest version issued from
 *         the source (QuranEnc.com).
 *      7. Inappropriate advertisements must not be included when displaying
 *         translations of the meanings of the Noble Quran."
 *
 *   Yani ACIK bir yeniden yayin izni vardir — Tanzil'den farkli olarak burada
 *   izin metni yaziyla verilmistir. Kosullarin projedeki karsiligi:
 *     1 -> metin oldugu gibi yazilir; yalnizca gorunmez kontrol karakteri ve
 *          bas/son bosluk temizligi yapilir (sanitizeSourceText). Icerik
 *          eklenmez, silinmez.
 *     2 -> `source` tablosuna "quranenc" satiri; arayuzde <SourceBadge>.
 *     3 -> SURUM NUMARASI ZORUNLU. Kaynagin bildirdigi surum her calistirmada
 *          okunur ve `author.license_note` icine yazilir; arayuz bu satiri
 *          gosterir. Surum pinlenen degerden farkliysa rapora SORUN dusulur.
 *     6 -> surum degistiginde import yeniden calistirilir; cache/ silinir.
 *     7 -> sitede reklam yok (plan §1.1).
 *
 * Idempotenttir; tekrar calistirmak ayni sonucu verir.
 *
 * Calistirma:  pnpm --filter @kuran/import quranenc
 */

import { computeVerseId } from "@kuran/schema";
import {
  Report,
  closePool,
  fail,
  fetchCached,
  info,
  pool,
  sanitizeSourceText,
  summarizeRepairs,
  upsertMany,
  withTransaction,
} from "@kuran/pipeline";
import { EXPECTED_VERSE_COUNT } from "./lib/tanzil_text.js";

const API = "https://quranenc.com/api/v1";
const TERMS_URL = "https://quranenc.com/en/home/api";
const SURAH_COUNT = 114;

/** Kosul 1-7'nin ozeti; `source.license` ve `author.license` alanina yazilir. */
const QURANENC_LICENSE =
  "quranenc.com — yeniden yayin izinli; degistirilmeden, kaynak ve surum belirtilerek";

interface TranslationEntry {
  /** quranenc anahtar (API yolunda kullanilir) */
  key: string;
  /** veritabani slug'i — Tanzil setiyle cakismamalidir */
  slug: string;
  displayName: string;
  /** Eser adi; kaynak yalnizca Ingilizce basligi veriyor, Turkcesi elle yazildi */
  workTitle: string;
  /** Son gorulen surum (kosul 3/6). Degisirse rapora SORUN dusulur. */
  pinnedVersion: string;
  /** Okura gerekli ayirt edici not; uydurma bilgi degil, kaynagin kendi tanimi */
  note: string;
}

const TRANSLATIONS: readonly TranslationEntry[] = [
  {
    key: "turkish_rwwad",
    slug: "rowwad-tercume-merkezi",
    displayName: "Rowwad Tercüme Merkezi",
    workTitle: "Kur'an-ı Kerim Meali (Rowwad)",
    pinnedVersion: "1.0.4",
    note:
      "Rowwad Tercüme Merkezi ekibi; Rabwah Davet Derneği ve IslamHouse.com iş birliğiyle. " +
      "Kaynağın kendi tanımı.",
  },
  {
    key: "turkish_shaban",
    slug: "saban-britch",
    displayName: "Şaban Britch",
    workTitle: "Kur'an-ı Kerim Meali",
    pinnedVersion: "1.1.0",
    note: "Şaban Britch çevirisi; Rowwad Tercüme Merkezi gözetiminde geliştirilmiştir.",
  },
  {
    key: "turkish_shahin",
    slug: "ali-ozek-heyeti",
    displayName: "Ali Özek ve heyeti",
    workTitle: "Kur'an-ı Kerim ve Açıklamalı Meali (Rowwad gözden geçirilmiş baskı)",
    pinnedVersion: "1.0.0",
    note:
      "Ali Özek ve heyetinin meali; Rowwad Tercüme Merkezi gözetiminde gözden geçirilmiştir. " +
      "Tanzil'deki 'Diyanet Vakfı' meali aynı heyetin ÖNCEKİ metnidir; iki metin ayrı " +
      "kayıtlardır (Bakara suresinde ayetlerin yalnızca %7'si birebir aynı).",
  },
];

/** Tanzil import'unun kullandigi slug'lar — ayni meal iki kez girmesin. */
const TANZIL_SLUGS = new Set([
  "diyanet-isleri",
  "elmalili-hamdi-yazir",
  "ali-bulac",
  "suleyman-ates",
  "diyanet-vakfi",
  "abdulbaki-golpinarli",
  "yasar-nuri-ozturk",
  "suat-yildirim",
  "edip-yuksel",
]);

interface ApiAyah {
  sura: string;
  aya: string;
  translation: string;
  footnotes: string | null;
}

interface ApiListEntry {
  key: string;
  language_iso_code: string;
  version: string;
  last_update: number;
  title: string;
}

/** Bir ayetin dipnot metni; kaynak tek dize veriyor, `[n]` isaretleriyle bolunur. */
interface ParsedFootnote {
  number: number;
  text: string;
}

/**
 * "[1] ... [2] ..." biciminde gelen dipnot dizesini ayirir.
 * Isaret yoksa tek dipnot kabul edilir (number = 1).
 */
export function parseFootnotes(raw: string): ParsedFootnote[] {
  const text = raw.trim();
  if (text === "") return [];

  const matches = [...text.matchAll(/\[(\d+)\]/g)];
  if (matches.length === 0) return [{ number: 1, text }];

  const out: ParsedFootnote[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    if (current?.index === undefined) continue;
    const start = current.index + current[0].length;
    const end = next?.index ?? text.length;
    const body = text.slice(start, end).trim();
    if (body === "") continue;
    const number = Number(current[1]);
    if (!Number.isInteger(number) || number < 1) continue;
    out.push({ number, text: body });
  }
  return out;
}

function assertNoSlugClash(): void {
  for (const entry of TRANSLATIONS) {
    if (TANZIL_SLUGS.has(entry.slug)) {
      fail(`slug cakismasi: ${entry.slug} Tanzil setinde de var — ayni meal iki kez girer`);
    }
  }
}

// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const report = new Report("quranenc");
  assertNoSlugClash();

  // --- 1. surum bilgisi (kosul 3) ---
  const listBody = await fetchCached(`${API}/translations/list`, {
    cacheName: "quranenc/translations_list.json",
  });
  const listRaw: unknown = JSON.parse(listBody);
  const listEntries = collectListEntries(listRaw);
  const metaByKey = new Map(listEntries.map((e) => [e.key, e]));

  const versionByKey = new Map<string, string>();
  for (const entry of TRANSLATIONS) {
    const meta = metaByKey.get(entry.key);
    if (meta === undefined) fail(`${entry.key}: kaynagin ceviri listesinde bulunamadi`);
    versionByKey.set(entry.key, meta.version);
    if (meta.version !== entry.pinnedVersion) {
      report.issue(
        `${entry.key}: surum degismis — beklenen ${entry.pinnedVersion}, kaynakta ${meta.version}. ` +
          `Kosul 6 geregi cache/quranenc/ silinip import yeniden calistirilmali.`,
      );
    }
    report.note(
      `${entry.key}: surum ${meta.version} · son guncelleme ` +
        `${new Date(meta.last_update * 1000).toISOString().slice(0, 10)} · "${meta.title}"`,
    );
  }

  // --- 2. metinler ---
  info(`${TRANSLATIONS.length} meal x ${SURAH_COUNT} sure indiriliyor`);

  const versesByKey = new Map<string, Map<number, ApiAyah>>();
  for (const entry of TRANSLATIONS) {
    const verses = new Map<number, ApiAyah>();
    // Sure sure cekilir; tek istekte tum Kur'an veren uc yok (yalnizca SQLite indirmesi
    // var ve Node 20'de gomulu sqlite yok — ek bagimlilik eklenmiyor).
    const bodies = await Promise.all(
      Array.from({ length: SURAH_COUNT }, (_unused, index) =>
        fetchCached(`${API}/translation/sura/${entry.key}/${index + 1}`, {
          cacheName: `quranenc/${entry.key}_${String(index + 1).padStart(3, "0")}.json`,
          gzip: true,
        }),
      ),
    );

    for (const body of bodies) {
      const payload: unknown = JSON.parse(body);
      const result = (payload as { result?: unknown }).result;
      if (!Array.isArray(result)) fail(`${entry.key}: beklenmeyen yanit bicimi`);
      for (const item of result as ApiAyah[]) {
        const surah = Number(item.sura);
        const ayah = Number(item.aya);
        if (!Number.isInteger(surah) || !Number.isInteger(ayah)) {
          fail(`${entry.key}: gecersiz ayet numarasi ${item.sura}:${item.aya}`);
        }
        verses.set(computeVerseId(surah, ayah), item);
      }
    }

    if (verses.size !== EXPECTED_VERSE_COUNT) {
      fail(`${entry.key}: ${EXPECTED_VERSE_COUNT} ayet bekleniyordu, ${verses.size} bulundu`);
    }
    versesByKey.set(entry.key, verses);
    info(`${entry.key}: ${verses.size} ayet hazir`);
  }

  // --- 3. enum degeri (author.source) ---
  // author_source enum'ina 'quranenc' eklenir. ALTER TYPE ... ADD VALUE islem
  // blogu icinde calistirilamayacagi icin withTransaction disinda yapilir.
  await pool.query("ALTER TYPE author_source ADD VALUE IF NOT EXISTS 'quranenc'");

  // --- 4. yazim ---
  const allRepairs: ReturnType<typeof sanitizeSourceText>["repairs"] = [];
  let footnoteTotal = 0;

  await withTransaction(async (client) => {
    await upsertMany(
      client,
      "source",
      ["slug", "name", "work_title", "author", "reference", "url", "license", "note"],
      [
        [
          "quranenc",
          "QuranEnc — Kral Fahd Kur'an-ı Kerim Basım Kompleksi",
          "Nobel Quran Encyclopedia",
          null,
          TERMS_URL,
          "https://quranenc.com/",
          QURANENC_LICENSE,
          "Yeniden yayın 7 koşula bağlıdır: metin değiştirilmez, kaynak (QuranEnc.com) ve " +
            "SÜRÜM NUMARASI belirtilir, güncel sürüm takip edilir, uygunsuz reklam gösterilmez.",
        ],
      ],
      ["slug"],
    );

    const authorRows = TRANSLATIONS.map((entry) => {
      const version = versionByKey.get(entry.key) ?? entry.pinnedVersion;
      return [
        entry.slug,
        entry.displayName,
        entry.workTitle,
        "tr",
        "quranenc",
        QURANENC_LICENSE,
        `QuranEnc.com · sürüm ${version} · anahtar ${entry.key}. ${entry.note}`,
        `https://quranenc.com/en/browse/${entry.key}`,
        // Oncelikli dort meal Tanzil setinden geliyor; priority UNIQUE oldugu icin
        // burada NULL kalir (plan §3.1).
        false,
        null,
      ];
    });

    await upsertMany(
      client,
      "author",
      [
        "slug",
        "name",
        "work_title",
        "language",
        "source",
        "license",
        "license_note",
        "url",
        "is_default",
        "priority",
      ],
      authorRows,
      ["slug"],
    );

    const { rows: authorIds } = await client.query<{ slug: string; id: number }>(
      "SELECT slug, id FROM author WHERE slug = ANY($1)",
      [TRANSLATIONS.map((t) => t.slug)],
    );
    const idBySlug = new Map(authorIds.map((row) => [row.slug, row.id]));

    for (const entry of TRANSLATIONS) {
      const authorId = idBySlug.get(entry.slug);
      if (authorId === undefined) fail(`author eklenemedi: ${entry.slug}`);
      const verses = versesByKey.get(entry.key);
      if (verses === undefined) fail(`metin yok: ${entry.key}`);

      const translationRows: unknown[][] = [];
      const footnoteSource: { verseId: number; notes: ParsedFootnote[] }[] = [];

      for (const [verseId, item] of verses) {
        const clean = sanitizeSourceText(item.translation, `${entry.key} ${item.sura}:${item.aya}`);
        allRepairs.push(...clean.repairs);
        if (clean.unknown.length > 0) {
          report.issue(
            `${entry.key} ${item.sura}:${item.aya}: taninmayan kontrol karakteri ` +
              clean.unknown.map((cp) => `U+${cp.toString(16).padStart(4, "0").toUpperCase()}`).join(", "),
          );
        }
        if (clean.text === "") {
          report.issue(`${entry.key} ${item.sura}:${item.aya}: bos meal metni — atlandi`);
          continue;
        }
        translationRows.push([verseId, authorId, clean.text]);

        const rawNote = item.footnotes ?? "";
        if (rawNote.trim() !== "") {
          const noteClean = sanitizeSourceText(rawNote, `${entry.key} dipnot ${item.sura}:${item.aya}`);
          allRepairs.push(...noteClean.repairs);
          if (noteClean.text.includes("<")) {
            report.issue(`${entry.key} ${item.sura}:${item.aya}: dipnotta HTML olabilir — elle bakilmali`);
          }
          const notes = parseFootnotes(noteClean.text);
          if (notes.length > 0) footnoteSource.push({ verseId, notes });
        }
      }

      if (translationRows.length !== EXPECTED_VERSE_COUNT) {
        fail(
          `${entry.key}: ${EXPECTED_VERSE_COUNT} meal satiri bekleniyordu, ` +
            `${translationRows.length} yazilacak`,
        );
      }

      await upsertMany(client, "translation", ["verse_id", "author_id", "text"], translationRows, [
        "verse_id",
        "author_id",
      ]);

      if (footnoteSource.length === 0) continue;

      // footnote.translation_id yeni yazilan satirlarin id'sinden okunur.
      const { rows: translationIds } = await client.query<{ verse_id: number; id: number }>(
        "SELECT verse_id, id FROM translation WHERE author_id = $1 AND verse_id = ANY($2)",
        [authorId, footnoteSource.map((f) => f.verseId)],
      );
      const translationIdByVerse = new Map(translationIds.map((r) => [r.verse_id, r.id]));

      const footnoteRows: unknown[][] = [];
      for (const { verseId, notes } of footnoteSource) {
        const translationId = translationIdByVerse.get(verseId);
        if (translationId === undefined) {
          report.issue(`${entry.key}: verse_id ${verseId} icin translation satiri bulunamadi`);
          continue;
        }
        for (const note of notes) footnoteRows.push([translationId, note.number, note.text]);
      }
      footnoteTotal += footnoteRows.length;
      await upsertMany(client, "footnote", ["translation_id", "number", "text"], footnoteRows, [
        "translation_id",
        "number",
      ]);
    }
  });

  // --- 5. dogrulama ---
  const { rows } = await pool.query<{ authors: string; translations: string; footnotes: string }>(
    `SELECT (SELECT count(*) FROM author WHERE source = 'quranenc')            AS authors,
            (SELECT count(*) FROM translation t
               JOIN author a ON a.id = t.author_id
              WHERE a.source = 'quranenc')                                     AS translations,
            (SELECT count(*) FROM footnote f
               JOIN translation t ON t.id = f.translation_id
               JOIN author a ON a.id = t.author_id
              WHERE a.source = 'quranenc')                                     AS footnotes`,
  );
  const summary = rows[0];
  if (summary === undefined) fail("dogrulama sorgusu bos dondu");

  const expected = TRANSLATIONS.length * EXPECTED_VERSE_COUNT;
  if (Number(summary.authors) !== TRANSLATIONS.length) {
    fail(`${TRANSLATIONS.length} yazar bekleniyordu, ${summary.authors} bulundu`);
  }
  if (Number(summary.translations) !== expected) {
    fail(`${expected} meal satiri bekleniyordu, ${summary.translations} bulundu`);
  }

  info(
    `veritabani: ${summary.authors} yazar, ${summary.translations} meal satiri, ` +
      `${summary.footnotes} dipnot`,
  );

  for (const line of summarizeRepairs(allRepairs)) report.note(`onarim: ${line}`);
  report.note(`Yazar: ${summary.authors}, meal satiri: ${summary.translations}, dipnot: ${footnoteTotal}`);
  report.note(
    `ZORUNLU (kosul 2-3): arayuzde QuranEnc.com kaynagi ve her mealin SURUM NUMARASI ` +
      `gosterilmelidir; surum author.license_note icindedir.`,
  );

  info(`rapor: ${report.write()}`);
}

/** Liste ucu ic ice gruplar dondurebiliyor; 'key' tasiyan tum nesneleri toplar. */
function collectListEntries(node: unknown): ApiListEntry[] {
  const out: ApiListEntry[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value === "object" && value !== null) {
      const record = value as Record<string, unknown>;
      if (typeof record["key"] === "string" && typeof record["version"] === "string") {
        out.push(record as unknown as ApiListEntry);
      }
      for (const item of Object.values(record)) visit(item);
    }
  };
  visit(node);
  return out;
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    await closePool();
    fail(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  });
