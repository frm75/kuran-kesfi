/**
 * quranenc.com tefsir seti import — tafsir ve tafsir_block.
 *
 * Kaynak: Kral Fahd Kur'an-i Kerim Basim Kompleksi / Rowwad Tercume Merkezi.
 * quranenc'in MEALLERDEN AYRI bir tefsir ucu var:
 *   liste   https://quranenc.com/api/v1/tafsirs/list
 *   icerik  https://quranenc.com/api/v1/tafsir/sura/<anahtar>/<sure>
 *
 * Su an tek Turkce kayit: `turkish_saadi` — Abdurrahman b. Nasir es-Sa'di
 * tefsirinin Turkce cevirisi. Ayni eser QUL'da da var (kaynak 484) ama orada
 * indirme oturum acmayi gerektiriyor VE lisans beyani yok; burada oturum
 * gerekmiyor ve lisans yazili.
 *
 * TELIF:
 *   quranenc'in 7 kosullu yeniden yayin izni (bkz. scripts/import/quranenc.ts
 *   basindaki tam metin). Kritik olan kosul 3: SURUM NUMARASI belirtilmelidir;
 *   surum her calistirmada kaynaktan okunup tafsir.license_note icine yazilir.
 *
 *   Sa'di 1957'de vefat etti; eser Turkiye'de 2027 sonuna kadar teliflidir.
 *   Dayanagimiz kamu mali olmasi DEGIL, yayincinin yazili yeniden yayin izni —
 *   uc meal icin dayandigimiz temelin aynisi.
 *
 * VERI YAPISI:
 *   Tefsir ayet ARALIGI basinadir (`from_aya`-`to_aya`) ve bir kismi hic ayete
 *   bagli degildir (`from_aya = 0`: sure adi, nuzul yeri, sure sonu). Bu bloklar
 *   icin ayet bagi UYDURULMAZ, NULL birakilir.
 *
 * Idempotenttir; tekrar calistirmak ayni sonucu verir.
 *
 * Calistirma:  pnpm --filter @kuran/import quranenc-tafsir
 */

import { computeVerseId, type TafsirBlockType } from "@kuran/schema";
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

const API = "https://quranenc.com/api/v1";
const TERMS_URL = "https://quranenc.com/en/home/api";
const SURAH_COUNT = 114;

/** quranenc.ts ile ayni metin; iki script ayni kaynagin ayni iznine dayanir. */
const QURANENC_LICENSE =
  "quranenc.com — yeniden yayin izinli; degistirilmeden, kaynak ve surum belirtilerek";

interface TafsirEntry {
  key: string;
  slug: string;
  name: string;
  workTitle: string;
  author: string;
  pinnedVersion: string;
  note: string;
}

const TAFSIRS: readonly TafsirEntry[] = [
  {
    key: "turkish_saadi",
    slug: "sadi-tefsiri",
    name: "Tefsîru's-Sa'dî",
    workTitle: "Teysîru'l-Kerîmi'r-Rahmân fî Tefsîri Kelâmi'l-Mennân (Türkçe)",
    author: "Abdurrahman b. Nâsır es-Sa'dî (v. 1957)",
    pinnedVersion: "1.0.0",
    note:
      "Rowwad Tercüme Merkezi gözetiminde Türkçeye çevrildi. Selefî geleneğe ait bir " +
      "tefsirdir; tek başına değil, kaynak etiketiyle ve başka tefsirlerle birlikte " +
      "gösterilmelidir (plan §12.9).",
  },
];

/**
 * Kaynagin Arapca blok etiketi -> ic tur.
 *
 * Taninmayan etiket 'diger' olur ve rapora yazilir; sessizce ayet tefsiri
 * sayilmaz. Etiketin kendisi tafsir_block.source_type icinde saklanir.
 */
const BLOCK_TYPE_BY_LABEL: Readonly<Record<string, TafsirBlockType>> = {
  "اسم السورة": "sure_adi",
  "مكان نزول السورة": "nuzul_yeri",
  "المقطع": "pasaj",
  "تمهيد للآيات": "giris",
  "تمهيد للمقطع": "giris",
  "تفسير آية": "ayet_tefsiri",
  "تكملة تفسير الآية": "ayet_tefsiri",
  "البسملة": "besmele",
  "تفسير البسملة": "besmele",
  "فصل": "fasil",
  "فوائد للآيات": "faideler",
  "فوائد للسورة": "faideler",
  "خاتمة للآيات السابقة": "hatime",
  "اقتباس": "alinti",
  "خاتمة السورة": "sure_sonu",
};

/**
 * Metin degil, dizgi ayiraci olan etiketler.
 *
 * `نجوم` bloklarinin metni ISTISNASIZ "***" (100 blogun 100'u kontrol edildi).
 * Bunlar kaynagin basili duzenindeki ayiraclardir; icerik tasimadiklari icin
 * saklanmaz. Sayilari rapora yazilir, sessizce yok sayilmaz.
 */
const SEPARATOR_LABELS: ReadonlySet<string> = new Set(["نجوم"]);

interface ApiBlock {
  id: string;
  sura: string;
  from_aya: string;
  to_aya: string;
  type: string;
  text: string | null;
}

interface ApiListEntry {
  key: string;
  language_iso_code: string;
  version: string;
  last_update: number;
  title: string;
}

/** Liste ucu ic ice gruplar dondurebiliyor; 'key' + 'version' tasiyanlari toplar. */
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

// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const report = new Report("quranenc_tafsir");

  // Ayet numaralari Tanzil'e karsi dogrulanir (plan 20.1: tek gercek kaynak).
  const { rows: surahRows } = await pool.query<{ id: number; verse_count: number }>(
    "SELECT id, verse_count FROM surah ORDER BY id",
  );
  if (surahRows.length !== SURAH_COUNT) {
    fail(`surah tablosunda ${SURAH_COUNT} kayit bekleniyordu, ${surahRows.length} bulundu`);
  }
  const verseCountBySurah = new Map(surahRows.map((r) => [r.id, r.verse_count]));

  // --- 1. surum bilgisi (kosul 3) ---
  const listBody = await fetchCached(`${API}/tafsirs/list`, {
    cacheName: "quranenc/tafsirs_list.json",
  });
  const metaByKey = new Map(
    collectListEntries(JSON.parse(listBody) as unknown).map((e) => [e.key, e]),
  );

  const versionByKey = new Map<string, string>();
  for (const entry of TAFSIRS) {
    const meta = metaByKey.get(entry.key);
    if (meta === undefined) fail(`${entry.key}: kaynagin tefsir listesinde bulunamadi`);
    versionByKey.set(entry.key, meta.version);
    if (meta.version !== entry.pinnedVersion) {
      report.issue(
        `${entry.key}: surum degismis — beklenen ${entry.pinnedVersion}, kaynakta ${meta.version}. ` +
          "Kosul 6 geregi cache/quranenc/ silinip import yeniden calistirilmali.",
      );
    }
    report.note(
      `${entry.key}: surum ${meta.version} · son guncelleme ` +
        `${new Date(meta.last_update * 1000).toISOString().slice(0, 10)}`,
    );
  }

  // --- 2. metin ---
  info(`${TAFSIRS.length} tefsir x ${SURAH_COUNT} sure indiriliyor`);

  const blocksByKey = new Map<string, ApiBlock[]>();
  for (const entry of TAFSIRS) {
    const bodies = await Promise.all(
      Array.from({ length: SURAH_COUNT }, (_unused, index) =>
        fetchCached(`${API}/tafsir/sura/${entry.key}/${index + 1}`, {
          cacheName: `quranenc/tafsir_${entry.key}_${String(index + 1).padStart(3, "0")}.json`,
          gzip: true,
        }),
      ),
    );
    const all: ApiBlock[] = [];
    for (const body of bodies) {
      const result = (JSON.parse(body) as { result?: unknown }).result;
      if (!Array.isArray(result)) fail(`${entry.key}: beklenmeyen yanit bicimi`);
      all.push(...(result as ApiBlock[]));
    }
    blocksByKey.set(entry.key, all);
    info(`${entry.key}: ${all.length} blok hazir`);
  }

  // --- 3. yazim ---
  const allRepairs: ReturnType<typeof sanitizeSourceText>["repairs"] = [];
  const unknownLabels = new Map<string, number>();
  let unlinked = 0;
  let separators = 0;
  let outOfRange = 0;
  let written = 0;

  await withTransaction(async (client) => {
    // Kaynak kaydi quranenc.ts tarafindan da yazilir; ikisi de ayni satiri
    // upsert eder, sirasi onemli degil.
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
      TAFSIRS.map((entry) => [
        entry.slug,
        entry.name,
        entry.workTitle,
        entry.author,
        "tr",
        "quranenc",
        QURANENC_LICENSE,
        `QuranEnc.com · sürüm ${versionByKey.get(entry.key) ?? entry.pinnedVersion} · ` +
          `anahtar ${entry.key}. ${entry.note}`,
        `https://quranenc.com/en/browse/${entry.key}`,
        true,
      ]),
      ["slug"],
    );

    const { rows: tafsirIds } = await client.query<{ slug: string; id: number }>(
      "SELECT slug, id FROM tafsir WHERE slug = ANY($1)",
      [TAFSIRS.map((t) => t.slug)],
    );
    const idBySlug = new Map(tafsirIds.map((r) => [r.slug, r.id]));

    for (const entry of TAFSIRS) {
      const tafsirId = idBySlug.get(entry.slug);
      if (tafsirId === undefined) fail(`tafsir eklenemedi: ${entry.slug}`);

      // Bloklar upsert DEGIL, sil-yaz ile yazilir: kaynakta bir blok kalkarsa
      // sort_number kayar ve upsert kuyrukta bayat satir birakirdi.
      // (data/** icin de ayni kural gecerli — CLAUDE.md, content:import.)
      await client.query("DELETE FROM tafsir_block WHERE tafsir_id = $1", [tafsirId]);
      const blocks = blocksByKey.get(entry.key);
      if (blocks === undefined) fail(`blok yok: ${entry.key}`);

      // Sure icinde kaynak sirasi korunur; sort_number sure basina sayilir.
      const sortBySurah = new Map<number, number>();
      const rows: unknown[][] = [];

      for (const block of blocks) {
        const surahId = Number(block.sura);
        if (!Number.isInteger(surahId) || surahId < 1 || surahId > SURAH_COUNT) {
          report.issue(`${entry.key}: gecersiz sure numarasi "${block.sura}" — atlandi`);
          continue;
        }

        const clean = sanitizeSourceText(block.text ?? "", `${entry.key} ${block.sura}`);
        allRepairs.push(...clean.repairs);
        if (clean.text === "") {
          report.issue(
            `${entry.key} ${block.sura}:${block.from_aya}-${block.to_aya}: bos metin — atlandi`,
          );
          continue;
        }

        const label = (block.type ?? "").trim();
        if (SEPARATOR_LABELS.has(label)) {
          separators += 1;
          continue;
        }
        const blockType = BLOCK_TYPE_BY_LABEL[label];
        if (blockType === undefined) {
          unknownLabels.set(label, (unknownLabels.get(label) ?? 0) + 1);
        }

        // from_aya = 0: blok belirli bir ayete bagli degil (sure adi, nuzul yeri,
        // sure sonu). Ayet bagi uydurulmaz, NULL kalir.
        const fromAya = Number(block.from_aya);
        const toAya = Number(block.to_aya);
        const verseCount = verseCountBySurah.get(surahId) ?? 0;

        let startVerseId: number | null = null;
        let endVerseId: number | null = null;
        if (Number.isInteger(fromAya) && fromAya > 0 && Number.isInteger(toAya) && toAya > 0) {
          if (fromAya > verseCount || toAya > verseCount || toAya < fromAya) {
            outOfRange += 1;
            report.issue(
              `${entry.key} ${surahId}:${block.from_aya}-${block.to_aya}: ` +
                `sure ${verseCount} ayet — ayet bagi kurulmadi, metin yine de saklandi`,
            );
          } else {
            startVerseId = computeVerseId(surahId, fromAya);
            endVerseId = computeVerseId(surahId, toAya);
          }
        }
        if (startVerseId === null) unlinked += 1;

        const sortNumber = (sortBySurah.get(surahId) ?? 0) + 1;
        sortBySurah.set(surahId, sortNumber);

        rows.push([
          tafsirId,
          surahId,
          sortNumber,
          blockType ?? "diger",
          label === "" ? null : label,
          startVerseId,
          endVerseId,
          clean.text,
        ]);
      }

      written += await upsertMany(
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
    }
  });

  // --- 4. dogrulama ---
  const { rows } = await pool.query<{
    tafsirs: string;
    blocks: string;
    linked: string;
    surahs: string;
  }>(
    `SELECT (SELECT count(*) FROM tafsir)                                      AS tafsirs,
            (SELECT count(*) FROM tafsir_block)                                AS blocks,
            (SELECT count(*) FROM tafsir_block WHERE start_verse_id IS NOT NULL) AS linked,
            (SELECT count(DISTINCT surah_id) FROM tafsir_block)                AS surahs`,
  );
  const summary = rows[0];
  if (summary === undefined) fail("dogrulama sorgusu bos dondu");

  if (Number(summary.surahs) !== SURAH_COUNT) {
    fail(`${SURAH_COUNT} surede blok bekleniyordu, ${summary.surahs} surede bulundu`);
  }

  // Ayet kapsami: kac ayetin ustunde en az bir tefsir blogu var
  const { rows: coverRows } = await pool.query<{ covered: string }>(
    `SELECT count(*) AS covered
       FROM verse v
      WHERE EXISTS (
        SELECT 1 FROM tafsir_block b
         WHERE b.start_verse_id IS NOT NULL
           AND v.id BETWEEN b.start_verse_id AND b.end_verse_id)`,
  );
  const covered = Number(coverRows[0]?.covered ?? 0);

  info(
    `veritabani: ${summary.tafsirs} tefsir, ${summary.blocks} blok ` +
      `(${summary.linked} ayete bagli), ${summary.surahs} sure`,
  );
  info(`ayet kapsami: 6236 ayetin ${covered} tanesinde tefsir var`);

  for (const [label, count] of unknownLabels) {
    report.issue(`taninmayan blok etiketi "${label}" x${count} — 'diger' olarak yazildi`);
  }
  for (const line of summarizeRepairs(allRepairs)) report.note(`onarim: ${line}`);
  report.note(`yazilan blok: ${written}`);
  report.note(`ayete baglanmayan blok: ${unlinked} (sure adi, nuzul yeri, sure sonu vb.)`);
  report.note(`atlanan ayirac blogu ("***"): ${separators}`);
  report.note(`ayet araligi sure uzunlugunu asan blok: ${outOfRange}`);
  report.note(`ayet kapsami: 6236 ayetin ${covered} tanesi`);
  report.note(
    "ZORUNLU (kosul 2-3): arayuzde QuranEnc.com kaynagi ve SURUM NUMARASI gosterilmelidir.",
  );

  info(`rapor: ${report.write()}`);
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    await closePool();
    fail(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  });
