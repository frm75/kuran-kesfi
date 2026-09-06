/**
 * Corpus Coranicum TEI — eski mushaf yazmalarinin AYET DIZINI.
 *
 * Kaynak: telota/corpus-coranicum-tei (BBAW, Berlin-Brandenburgische Akademie
 * der Wissenschaften). 2323 yazma, TEI/msDesc kodlamasi.
 *
 * TELIF:
 *   Veri CC BY-SA 4.0 (c) BBAW 2024. Projemizin `data/` agaci CC BY-NC-SA 4.0
 *   ile yayinlanir; BY-SA'ya NC eklemek ShareAlike'i ihlal eder. Bu yuzden
 *   cikti `data/` altina DEGIL, `data-external/corpus-coranicum/` altina yazilir
 *   ve o dizin kendi LICENSE.md dosyasini tasir (docs/KAYNAK_ENVANTERI.md 0, 2.4).
 *
 * GORUNTU HAKLARI:
 *   Taranan 2323 yazmanin tamaminda goruntu izni `<availability status="restricted">`.
 *   Tek bir acik goruntu yok. Bu yuzden GORUNTU KOPYALANMAZ; yalnizca
 *   corpuscoranicum.de'ye derin baglanti verilir. Bu ayni zamanda CLAUDE.md
 *   kural 5'i de saglar (uretimde ucuncu taraf bagimliligi yok).
 *
 * AYET <-> YAZMA BAGI:
 *   Veride hazir, uydurulmaz. Her sayfa bir <msItem> ve icindeki
 *   <title type="numeric" key="SSS:VVV:WWW-SSS:VVV:WWW"/> o sayfanin
 *   hangi ayetten hangi ayete kadar oldugunu soyler.
 *
 * XML ayristirmasi neden regex:
 *   76 MB / 2323 dosya. Yalnizca sabit bicimli birkac alan okunuyor; tam DOM
 *   kurmak (fast-xml-parser) burada 10 kattan fazla bellek ve sure demek.
 *   Okunan alanlarin hepsi tek satirlik, oznitelik tabanli ve semayla sabit.
 *
 * Girdi:  cache/corpus-coranicum/  (git clone; cache/ repoya girmez)
 * Cikti:  data-external/corpus-coranicum/manuscripts.json + pages.json
 *
 * Calistirma:  pnpm --filter @kuran/import corpus-coranicum
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { computeVerseId } from "@kuran/schema";
import { Report, closePool, fail, info, pool, upsertMany, warn, withTransaction } from "@kuran/pipeline";

const repoRoot = resolve(import.meta.dirname, "../..");
const SRC = join(repoRoot, "cache/corpus-coranicum/data/quran_manuscripts");
const OUT = join(repoRoot, "data-external/corpus-coranicum");

const CLONE_HINT =
  "Once klonlayin:  git clone --depth 1 " +
  "https://github.com/telota/corpus-coranicum-tei.git cache/corpus-coranicum";

/** Sayfa araligi: bir yazma sayfasinin tasidigi ayet araligi. */
interface PageRange {
  /** Yazma kimligi (dosya adindaki sayi) */
  manuscriptId: number;
  /** Varak/sayfa isareti — "1r", "12v" gibi */
  folio: string;
  startVerseId: number;
  /** Ayet icindeki kelime sirasi; kaynak "0-1" yazdiysa bilinmiyor demektir */
  startWord: number | null;
  endVerseId: number;
  endWord: number | null;
  /**
   * Kaynakta bitis baslangictan kucuk. Hata degil: bazi yazmalar dagilmis ya da
   * yanlis ciltlenmistir, bir varak iki ayri yerden metin tasiyabilir. Aralik
   * UYDURULMAZ; satir oldugu gibi saklanir ama kapsam hesabina katilmaz.
   */
  reversed?: true;
  /**
   * Uclardan biri "SSS:000" — Corpus Coranicum'da bu ayet degil, SURE BASI
   * (besmele) demektir. 887 satir boyle. Ayet numarasi olarak yorumlanmaz;
   * satir korunur, kapsam hesabina katilmaz (hangi ayete kadar gittigi belirsiz).
   */
  suraStart?: true;
}

interface Manuscript {
  id: number;
  title: string;
  repository: string | null;
  idno: string | null;
  /** Kaynagin kendi tarihlemesi — "700-800" gibi; yorumlanmadan aktarilir */
  origDate: string | null;
  /** Yazi turu — "kufi C.Ia" gibi */
  script: string | null;
  /** msContents/summary ilk paragrafi; kisaltilir, yorum eklenmez */
  summary: string | null;
  pageCount: number;
  /** Bu yazmanin kapsadigi birlesik ayet araliklari [baslangic, bitis] */
  verseRanges: [number, number][];
  url: string;
}

/**
 * Tarihleme dizesinden baslangic yilini cikarir: "700-800" -> 700.
 *
 * Kaynak serbest metin kullaniyor ("650-750", "9th century", bos). Sayi
 * cikarilamiyorsa null doner — UYDURULMAZ, yalnizca siralama disi kalir.
 */
export function parseDateStart(raw: string | null): number | null {
  if (raw === null) return null;
  const match = /(\d{3,4})/.exec(raw);
  if (match === null) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) && year > 0 && year < 2100 ? year : null;
}

// --- kucuk yardimcilar -------------------------------------------------------

const stripTags = (value: string): string =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

function firstMatch(xml: string, pattern: RegExp): string | null {
  const match = pattern.exec(xml);
  if (match === null) return null;
  const text = stripTags(match[1] ?? "");
  return text === "" ? null : text;
}

/** "0-1" bilinmeyen kelime demektir; sayiya cevrilmez. */
function parseWord(raw: string): number | null {
  if (raw === "0-1") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Bitisik ve ust uste binen araliklari birlestirir. */
function mergeRanges(ranges: readonly [number, number][]): [number, number][] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [];
  let [start, end] = sorted[0] as [number, number];
  for (const [s, e] of sorted.slice(1)) {
    // 1 fark = ayni sure icinde ardisik ayet; birlestirilir.
    if (s <= end + 1) {
      if (e > end) end = e;
    } else {
      out.push([start, end]);
      [start, end] = [s, e];
    }
  }
  out.push([start, end]);
  return out;
}

// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const report = new Report("corpus_coranicum");

  // Ayet numaralari Tanzil'e karsi dogrulanir (plan 20.1: tek gercek kaynak).
  // Kaynakta "002:296" gibi var olmayan ayetler var; sessizce gecirilmez.
  const { rows: surahRows } = await pool.query<{ id: number; verse_count: number }>(
    "SELECT id, verse_count FROM surah ORDER BY id",
  );
  if (surahRows.length !== 114) {
    fail(`surah tablosunda 114 kayit bekleniyordu, ${surahRows.length} bulundu — once pnpm data:import`);
  }
  const verseCountBySurah = new Map(surahRows.map((r) => [r.id, r.verse_count]));

  if (!existsSync(SRC)) fail(`kaynak dizin yok: ${SRC}\n${CLONE_HINT}`);

  const files = readdirSync(SRC)
    // Dizinde places.xml gibi yazma olmayan dosyalar da var.
    .filter((name) => /^manuscript-\d+\.xml$/.test(name))
    .sort();
  if (files.length === 0) fail(`${SRC} icinde xml yok\n${CLONE_HINT}`);
  info(`${files.length} yazma dosyasi okunuyor`);

  // Sema sabit oldugu icin desenler dosya disinda bir kez derlenir.
  const titleRe = /<titleStmt>[\s\S]*?<title>([\s\S]*?)<\/title>/;
  const repositoryRe = /<repository[^>]*>([\s\S]*?)<\/repository>/;
  const idnoRe = /<idno[^>]*>([\s\S]*?)<\/idno>/;
  const summaryRe = /<summary>\s*<p>([\s\S]*?)<\/p>/;
  const origDateRe = /<origDate[^>]*>([\s\S]*?)<\/origDate>/;
  const scriptRe = /<scriptNote[^>]*>([\s\S]*?)<\/scriptNote>/;
  const itemRe =
    /<msItem[^>]*\sn="([^"]*)"[^>]*>\s*<title type="numeric" key="(\d{3}):(\d{3}):([0-9-]+)-(\d{3}):(\d{3}):([0-9-]+)"/g;
  const availabilityRe = /<availability[^>]*status="([^"]*)"/g;

  const manuscripts: Manuscript[] = [];
  const pages: PageRange[] = [];

  let withoutRanges = 0;
  let invalidVerse = 0;
  let reversedCount = 0;
  let suraStartCount = 0;
  let unknownWord = 0;
  const statuses = new Map<string, number>();

  for (const name of files) {
    const path = join(SRC, name);
    const xml = readFileSync(path, "utf8");

    const idMatch = /manuscript-(\d+)\.xml$/.exec(basename(name));
    if (idMatch === null) {
      report.issue(`${name}: dosya adindan yazma kimligi okunamadi`);
      continue;
    }
    const manuscriptId = Number(idMatch[1]);

    for (const match of xml.matchAll(availabilityRe)) {
      const status = match[1] ?? "?";
      statuses.set(status, (statuses.get(status) ?? 0) + 1);
    }

    const ranges: [number, number][] = [];
    let pageCount = 0;

    for (const match of xml.matchAll(itemRe)) {
      const [, folio, s1, v1, w1, s2, v2, w2] = match;
      const startSurah = Number(s1);
      const startVerse = Number(v1);
      const endSurah = Number(s2);
      const endVerse = Number(v2);

      // Kaynakta "001:000:0-1" gibi ayet numarasi 0 olan kayitlar var; bunlar
      // "sayfa hangi ayete denk geliyor bilinmiyor" demektir, uydurulmaz.
      if (startSurah < 1 || startSurah > 114 || endSurah < 1 || endSurah > 114) {
        invalidVerse += 1;
        continue;
      }
      const startMax = verseCountBySurah.get(startSurah) ?? 0;
      const endMax = verseCountBySurah.get(endSurah) ?? 0;

      // 000 = sure basi (besmele) isareti; ayet numarasi degildir.
      const suraStart = startVerse === 0 || endVerse === 0;
      if (suraStart) suraStartCount += 1;

      if (startVerse < 0 || startVerse > startMax || endVerse < 0 || endVerse > endMax) {
        invalidVerse += 1;
        report.issue(
          `${name} ${folio ?? "?"}: kaynakta olmayan ayet ` +
            `${s1}:${v1}-${s2}:${v2} (sure uzunlugu ${startMax}/${endMax}) — atlandi`,
        );
        continue;
      }

      const startVerseId = computeVerseId(startSurah, startVerse);
      const endVerseId = computeVerseId(endSurah, endVerse);
      const reversed = endVerseId < startVerseId;
      if (reversed) reversedCount += 1;

      const startWord = parseWord(w1 ?? "");
      const endWord = parseWord(w2 ?? "");
      if (startWord === null || endWord === null) unknownWord += 1;

      pages.push({
        manuscriptId,
        folio: folio ?? "",
        startVerseId,
        startWord,
        endVerseId,
        endWord,
        ...(reversed ? { reversed: true as const } : {}),
        ...(suraStart ? { suraStart: true as const } : {}),
      });
      // Ters aralikta sayfanin iki ucu arasinda ne oldugu bilinmez; kapsam
      // hesabina katmak yazmaya sahip olmadigi ayetleri atfetmek olurdu.
      // Sure basi (000) isaretli uclarda da hangi ayete kadar gidildigi belirsiz.
      if (!reversed && !suraStart) ranges.push([startVerseId, endVerseId]);
      pageCount += 1;
    }

    if (pageCount === 0) withoutRanges += 1;

    const summary = firstMatch(xml, summaryRe);
    manuscripts.push({
      id: manuscriptId,
      title: firstMatch(xml, titleRe) ?? `Yazma ${manuscriptId}`,
      repository: firstMatch(xml, repositoryRe),
      idno: firstMatch(xml, idnoRe),
      origDate: firstMatch(xml, origDateRe),
      script: firstMatch(xml, scriptRe),
      // Ozet kaynagin kendi metnidir; kisaltilir ama yeniden yazilmaz.
      summary: summary === null ? null : summary.length > 400 ? `${summary.slice(0, 397)}...` : summary,
      pageCount,
      verseRanges: mergeRanges(ranges),
      url: `https://corpuscoranicum.de/en/manuscripts/${manuscriptId}`,
    });
  }

  // --- goruntu haklari kontrolu ---
  // Tek bir acik goruntu cikarsa bu kural degisir; sessizce varsayilmaz.
  const openImages = [...statuses.entries()].filter(([status]) => status !== "restricted");
  if (openImages.length > 0) {
    report.issue(
      "goruntu izni 'restricted' DISINDA deger bulundu: " +
        openImages.map(([s, n]) => `${s} x${n}`).join(", ") +
        " — derin baglanti kurali gozden gecirilmeli",
    );
  } else {
    report.note(
      `goruntu izni: ${statuses.get("restricted") ?? 0} kaydin tamami 'restricted' — ` +
        "goruntu kopyalanmaz, yalnizca derin baglanti",
    );
  }

  // --- yazim ---
  mkdirSync(OUT, { recursive: true });

  const header = [
    "URETILMIS DOSYA — elle duzenlemeyin. Kaynak: scripts/import/corpus_coranicum.ts",
    "Veri: telota/corpus-coranicum-tei (BBAW), CC BY-SA 4.0. Bkz. LICENSE.md.",
    "Goruntuler 'restricted'; bu dosyada goruntu yoktur, yalnizca derin baglanti.",
  ];

  writeFileSync(
    join(OUT, "manuscripts.json"),
    `${JSON.stringify({ "//": header, generatedAt: new Date().toISOString().slice(0, 10), count: manuscripts.length, manuscripts }, null, 1)}\n`,
    "utf8",
  );

  // pages.json satir bazli dizidir: [yazmaId, varak, baslangicAyetId, baslangicKelime,
  // bitisAyetId, bitisKelime]. Nesne yerine dizi: 48 binden fazla satirda alan
  // adlarini tekrar etmek dosyayi ucuza katliyor.
  const pageRows = pages.map((p) => [
    p.manuscriptId,
    p.folio,
    p.startVerseId,
    p.startWord,
    p.endVerseId,
    p.endWord,
    p.reversed === true ? 1 : 0,
    p.suraStart === true ? 1 : 0,
  ]);
  writeFileSync(
    join(OUT, "pages.json"),
    `${JSON.stringify({
      "//": [
        ...header,
        "columns dizisi satirlarin alan sirasini verir.",
        "kelime alani null ise kaynakta '0-1' yaziyordu: kelime sirasi bilinmiyor.",
        "reversed=1: kaynakta bitis baslangictan kucuk (dagilmis/yanlis ciltlenmis yazma).",
        "suraStart=1: uclardan biri SSS:000, yani ayet degil SURE BASI (besmele).",
        "Iki durumda da satir korunur ama kapsam hesabina katilmaz; aralik uydurulmaz.",
      ],
      columns: [
        "manuscriptId",
        "folio",
        "startVerseId",
        "startWord",
        "endVerseId",
        "endWord",
        "reversed",
        "suraStart",
      ],
      count: pageRows.length,
      rows: pageRows,
    })}\n`,
    "utf8",
  );

  const sizeOf = (file: string): string =>
    `${(statSync(join(OUT, file)).size / 1024 / 1024).toFixed(1)} MB`;

  info(
    `yazildi: manuscripts.json (${manuscripts.length} yazma, ${sizeOf("manuscripts.json")}) · ` +
      `pages.json (${pageRows.length} sayfa araligi, ${sizeOf("pages.json")})`,
  );

  // Gercek kapsam: verse_id = sure*1000 + ayet oldugu icin sure asan bir aralik
  // arada var olmayan kimlikleri de icerir (2287..2999 gibi). Bu yuzden kapsam
  // Tanzil'in gercek ayet listesine karsi sayilir, aralik uzunlugundan degil.
  const { rows: verseRows } = await pool.query<{ id: number }>("SELECT id FROM verse ORDER BY id");
  const allVerseIds = verseRows.map((r) => r.id);
  // --- veritabanina yazim ---
  // Site build'i Postgres'ten okur; data-external/ dosyalari kaynak ve arsivdir.
  await withTransaction(async (client) => {
    // Sil-yaz: kaynaktan bir yazma kalkarsa artik satir kalmasin.
    await client.query("DELETE FROM manuscript_range");
    await client.query("DELETE FROM manuscript");

    await upsertMany(
      client,
      "manuscript",
      [
        "id",
        "title",
        "repository",
        "idno",
        "orig_date",
        "date_start",
        "script",
        "summary",
        "page_count",
        "url",
      ],
      manuscripts.map((m) => [
        m.id,
        m.title,
        m.repository,
        m.idno,
        m.origDate,
        parseDateStart(m.origDate),
        m.script,
        m.summary,
        m.pageCount,
        m.url,
      ]),
      ["id"],
    );

    const rangeRows: unknown[][] = [];
    for (const m of manuscripts) {
      for (const [start, end] of m.verseRanges) rangeRows.push([m.id, start, end]);
    }
    await upsertMany(
      client,
      "manuscript_range",
      ["manuscript_id", "start_verse_id", "end_verse_id"],
      rangeRows,
      ["manuscript_id", "start_verse_id", "end_verse_id"],
    );
  });

  const covered = new Set<number>();
  for (const m of manuscripts) {
    for (const [start, end] of m.verseRanges) {
      for (const id of allVerseIds) {
        if (id > end) break;
        if (id >= start) covered.add(id);
      }
    }
  }

  report.note(`${manuscripts.length} yazma, ${pageRows.length} sayfa-ayet araligi`);
  report.note(`ayet araligi olmayan yazma: ${withoutRanges}`);
  report.note(`Tanzil'de olmayan ayet numarasi yuzunden atlanan aralik: ${invalidVerse}`);
  report.note(`ters (bitis < baslangic) aralik: ${reversedCount} — saklandi, kapsama katilmadi`);
  report.note(
    `ucu "SSS:000" (sure basi / besmele) olan aralik: ${suraStartCount} — saklandi, kapsama katilmadi`,
  );
  report.note(`kelime sirasi bilinmeyen ("0-1") aralik: ${unknownWord}`);
  const pct = ((covered.size / allVerseIds.length) * 100).toFixed(1);
  report.note(
    `kapsam: ${allVerseIds.length} ayetin ${covered.size} tanesi (%${pct}) en az bir yazmada gecidir`,
  );
  if (withoutRanges > 0) {
    warn(`${withoutRanges} yazmada hic ayet araligi yok — kaynakta da yok, uydurulmadi`);
  }

  info(`rapor: ${report.write()}`);
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    await closePool();
    fail(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  });
