/**
 * Mehmet Alagas meali import — author + translation.
 *
 * Kaynak: kullanicinin sagladigi PDF'ten cikarilan duz metin,
 * `data-external/alagas/meal_raw.txt`. Kokeni, telifi ve metnin yapisi
 * `data-external/alagas/LICENSE.md` icinde.
 *
 * ## Bu meal digerlerinden iki noktada ayrilir
 *
 * 1. SURELER NUZUL SIRASINDA. Basliklar "1 Alaka Suresi", "5 Fatiha Suresi"
 *    biciminde. Numara `surah.revelation_order_standard` ile eslesir; ayrica
 *    sure adi da karsilastirilir, ikisi tutmazsa import DURUR.
 *
 * 2. METIN AYET ARALIKLARINA YAZILMIS. Bir blok sekiz ayeti birlikte anlatan
 *    tek paragraf olabilir. Paragrafi ayet ayet bolmek MUMKUN DEGIL: sinirlar
 *    metinde yazmaz, bolmek yorum yapmak olur. Bu yuzden blok metni kapsadigi
 *    HER ayete aynen yazilir, basina "(1-8)" araligi konur — Diyanet'in gruplu
 *    ayetlerinde zaten kullanilan desen (Nas 1-6), arayuz bunlari toplar.
 *
 * Idempotenttir; tekrar calistirmak ayni sonucu verir (upsert).
 *
 * Calistirma:  pnpm --filter @kuran/import alagas
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeVerseId } from "@kuran/schema";
import { Report, closePool, fail, info, upsertMany, withTransaction } from "@kuran/pipeline";

const SOURCE_FILE = resolve(import.meta.dirname, "../../data-external/alagas/meal_raw.txt");

const AUTHOR = {
  slug: "mehmet-alagas",
  name: "Mehmet Alagaş",
  workTitle: "Kur'an-ı Kerim Meali",
  language: "tr",
  source: "manual",
  license: "Mehmet Alagaş",
  licenseNote:
    "Telif hakkı yazarına aittir; proje yeniden lisanslamaz. " +
    "Kaynak PDF kullanıcı tarafından sağlandı (2026-09-06). " +
    "Ayrıntı: data-external/alagas/LICENSE.md",
} as const;

/** "1 Alaka Suresi", "59 Zumer Suresi (Zumre)" — numara + ad. */
const SURAH_LINE = /^\s*(\d{1,3})\s+(.{1,60}?)\s*S[ûu]resi.{0,90}$/u;
/** Yalnizca rakam ve virgul iceren satir: baslıksiz blok (or. Zilzal). */
const NUMBER_LINE = /^[\d\s,]*\d[\d\s,]*$/u;
/** Numara dizisi + "(" ile baslayan satir: baslikli blok. */
const HEADING_START = /^([\d\s,]*\d[\d\s,]*)\(\s*(.*)$/u;

/**
 * Blok basligi BUYUK HARFLIDIR; satir ici aciklama parantezleri
 * ("(Rucu; Bumerang ozelligi)") kucuk harflidir. Esik olcumle secildi:
 * 0,7 ile 836 blogun tamami yakalandi, yanlis pozitif cikmadi.
 */
const HEADING_UPPER_RATIO = 0.7;

function upperRatio(text: string): number {
  const letters = [...text].filter((c) => /\p{L}/u.test(c));
  if (letters.length === 0) return 0;
  return letters.filter((c) => c === c.toUpperCase()).length / letters.length;
}

function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d{1,3}/gu)].map((m) => Number(m[0]));
}

/**
 * Kaynakta bitisik yazilmis numarayi acar: Kaf suresinde "5,6,7,8,910,11"
 * yazilmis, 910 ayeti yok — 9 ve 10 kastedilmis. Yalnizca ardisik iki parcaya
 * bolunebilen ve sure sinirinda kalan sayilar acilir; digerleri RAPORA yazilir.
 */
function splitRunTogether(value: number, verseCount: number): number[] | null {
  const text = String(value);
  for (let i = 1; i < text.length; i += 1) {
    const tail = text.slice(i);
    if (tail.startsWith("0")) continue;
    const a = Number(text.slice(0, i));
    const b = Number(tail);
    if (b === a + 1 && b <= verseCount) return [a, b];
  }
  return null;
}

interface Block {
  readonly verses: number[];
  readonly heading: string;
  readonly rawNumbers: number[];
  text: string;
}

interface SurahChunk {
  readonly revelationOrder: number;
  readonly pdfName: string;
  readonly blocks: Block[];
}

/** Metni sure bloklarina ayirir; ayet numaralarini ve baslıklari cikarir. */
function parse(raw: string, verseCountOf: (order: number) => number | undefined): SurahChunk[] {
  const lines = raw.replaceAll("\f", "\n").split("\n").map((l) => l.trim());
  const heads: { index: number; order: number; name: string }[] = [];
  for (const [index, line] of lines.entries()) {
    const m = SURAH_LINE.exec(line);
    if (m !== null) heads.push({ index, order: Number(m[1]), name: m[2]!.trim() });
  }

  const chunks: SurahChunk[] = [];
  for (const [k, head] of heads.entries()) {
    const end = k + 1 < heads.length ? heads[k + 1]!.index : lines.length;
    const body = lines.slice(head.index + 1, end);
    const verseCount = verseCountOf(head.order) ?? 0;
    const blocks: Block[] = [];
    let current: Block | null = null;

    for (let p = 0; p < body.length; p += 1) {
      const line = body[p]!;
      if (line === "") continue;

      let raws: number[] | null = null;
      let heading = "";
      let rest = "";

      const hm = HEADING_START.exec(line);
      if (hm !== null) {
        // Baslik satir sonuna sigmamis olabilir; kapanan parantezi 3 satira kadar ara.
        let acc = hm[2]!;
        let q = p;
        while (!acc.includes(")") && q - p < 3 && q + 1 < body.length) {
          q += 1;
          acc += ` ${body[q]!}`;
        }
        if (acc.includes(")")) {
          const candidate = acc.slice(0, acc.indexOf(")")).trim();
          if (upperRatio(candidate) >= HEADING_UPPER_RATIO) {
            heading = candidate;
            raws = numbersIn(hm[1]!);
            rest = acc.slice(acc.indexOf(")") + 1).trim();
            p = q;
          }
        }
      } else if (NUMBER_LINE.test(line)) {
        // Baslıksiz blok. Ardisik numara satirlari tek listeye baglanir:
        // uzun ayet listeleri PDF'te birden fazla satira taşmis.
        let acc = line;
        let q = p;
        while (q + 1 < body.length && NUMBER_LINE.test(body[q + 1]!) && body[q + 1] !== "") {
          q += 1;
          acc += `,${body[q]!}`;
        }
        raws = numbersIn(acc);
        p = q;
      }

      if (raws !== null && raws.length > 0) {
        const verses = raws.filter((n) => n >= 1 && n <= verseCount);
        if (verses.length > 0) {
          current = { verses, heading, rawNumbers: [...new Set(raws)].sort((a, b) => a - b), text: "" };
          blocks.push(current);
          if (rest !== "") current.text = rest;
          continue;
        }
      }
      if (current !== null) current.text = current.text === "" ? line : `${current.text} ${line}`;
    }

    for (const block of blocks) block.text = block.text.replaceAll(/\s+/gu, " ").trim();

    /*
     * Metinsiz blogu SONRAKINE kat.
     *
     * Uzun ayet listeleri PDF'te birden fazla satira tasmis; aralarina bos
     * satir girdiginde liste ikiye bolunuyor ve metin yalnizca ikinci parcaya
     * dusuyordu. Boylece basta 6 blok metinsiz kaliyor, ~215 ayet mealsiz
     * gorunuyordu. Metni olmayan bir blok kendi basina anlamsizdir; ayetleri
     * bir sonraki bloga katilir — ikisi zaten ayni pasajin parcasi.
     */
    const merged: Block[] = [];
    let carry: number[] = [];
    for (const block of blocks) {
      if (block.text === "") {
        carry.push(...block.verses);
        continue;
      }
      if (carry.length > 0) {
        block.verses.unshift(...carry);
        block.verses.sort((a, b) => a - b);
        carry = [];
      }
      merged.push(block);
    }
    // Son blok metinsizse onceki bloga eklenir.
    if (carry.length > 0 && merged.length > 0) {
      const last = merged.at(-1)!;
      last.verses.push(...carry);
      last.verses.sort((a, b) => a - b);
    }

    chunks.push({ revelationOrder: head.order, pdfName: head.name, blocks: merged });
  }
  return chunks;
}

/** "(1-8) " / "(3) " / "(1, 4, 7) " oneki — Diyanet'in gruplu ayet bicimi. */
function rangeLabel(verses: readonly number[]): string {
  if (verses.length === 1) return `(${String(verses[0])}) `;
  const sorted = [...verses].sort((a, b) => a - b);
  const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1]! + 1);
  if (contiguous) return `(${String(sorted[0])}-${String(sorted.at(-1))}) `;
  return `(${sorted.join(", ")}) `;
}

async function main(): Promise<void> {
  const report = new Report("alagas");
  const raw = readFileSync(SOURCE_FILE, "utf8");

  await withTransaction(async (client) => {
    const { rows: surahRows } = await client.query<{
      id: number;
      name_tr: string;
      verse_count: number;
      revelation_order_standard: number;
    }>(
      `SELECT id, name_tr, verse_count, revelation_order_standard
         FROM surah ORDER BY id`,
    );
    if (surahRows.length !== 114) fail(`surah tablosunda 114 yerine ${surahRows.length} kayit var`);
    const byOrder = new Map(surahRows.map((r) => [r.revelation_order_standard, r]));

    const chunks = parse(raw, (order) => byOrder.get(order)?.verse_count);
    if (chunks.length !== 114) {
      fail(`PDF metninde 114 yerine ${chunks.length} sure basligi bulundu`);
    }

    // --- yazar ---
    await upsertMany(
      client,
      "author",
      ["slug", "name", "work_title", "language", "source", "license", "license_note", "is_default"],
      [[AUTHOR.slug, AUTHOR.name, AUTHOR.workTitle, AUTHOR.language, AUTHOR.source, AUTHOR.license, AUTHOR.licenseNote, false]],
      ["slug"],
    );
    const { rows: authorRows } = await client.query<{ id: number }>(
      "SELECT id FROM author WHERE slug = $1",
      [AUTHOR.slug],
    );
    const authorId = authorRows[0]?.id;
    if (authorId === undefined) fail("yazar kaydi yazilamadi");

    // --- ceviriler ---
    const rows: (readonly unknown[])[] = [];
    let covered = 0;
    let totalVerses = 0;
    let emptyBlocks = 0;

    for (const chunk of chunks) {
      const surah = byOrder.get(chunk.revelationOrder);
      if (surah === undefined) {
        report.issue(`nuzul ${chunk.revelationOrder} ("${chunk.pdfName}") surah tablosunda yok`);
        continue;
      }
      // Ad capraz kontrolu: numara ve ad birbirini dogrulamali.
      const fold = (s: string): string =>
        s.toLocaleLowerCase("tr").normalize("NFD").replaceAll(/[̀-ͯ]/gu, "")
          .replaceAll(/[^a-z]/gu, "");
      const pdfFolded = fold(chunk.pdfName);
      const dbFolded = fold(surah.name_tr);
      if (!pdfFolded.includes(dbFolded.slice(0, 3)) && !dbFolded.includes(pdfFolded.slice(0, 3))) {
        report.issue(
          `nuzul ${chunk.revelationOrder}: PDF adi "${chunk.pdfName}" ile veritabani adi ` +
            `"${surah.name_tr}" uyusmuyor — numara/ad celiskisi elle bakilmali`,
        );
      }

      totalVerses += surah.verse_count;
      const seen = new Set<number>();

      for (const block of chunk.blocks) {
        // Bitisik yazilmis numaralari ac (or. Kaf "910" -> 9,10).
        for (const n of block.rawNumbers) {
          if (n <= surah.verse_count) continue;
          const split = splitRunTogether(n, surah.verse_count);
          if (split === null) {
            report.issue(
              `${surah.name_tr}: "${String(n)}" ayet numarasi sure sinirini (${String(surah.verse_count)}) asiyor, cozulemedi`,
            );
            continue;
          }
          report.note(
            `${surah.name_tr}: kaynakta "${String(n)}" yazilmis, ${split.join(",")} olarak okundu`,
          );
          for (const v of split) if (!block.verses.includes(v)) block.verses.push(v);
          block.verses.sort((a, b) => a - b);
        }

        if (block.text === "") {
          emptyBlocks += 1;
          report.issue(
            `${surah.name_tr} ${block.verses.join(",")}: blok metni bos — atlandi`,
          );
          continue;
        }

        const label = rangeLabel(block.verses);
        for (const verseNumber of block.verses) {
          if (seen.has(verseNumber)) {
            report.issue(
              `${surah.name_tr} ${String(verseNumber)}: ayet birden fazla blokta — ilki korundu`,
            );
            continue;
          }
          seen.add(verseNumber);
          rows.push([computeVerseId(surah.id, verseNumber), authorId, `${label}${block.text}`]);
        }
      }

      covered += seen.size;
      const missing = [...Array.from({ length: surah.verse_count }, (_, i) => i + 1)].filter(
        (v) => !seen.has(v),
      );
      if (missing.length > 0) {
        report.note(
          `${surah.name_tr}: ${String(missing.length)} ayet bu mealde yok — ${missing.slice(0, 20).join(",")}` +
            (missing.length > 20 ? " …" : ""),
        );
      }
    }

    await upsertMany(client, "translation", ["verse_id", "author_id", "text"], rows, [
      "verse_id",
      "author_id",
    ]);

    report.note(`blok: ${String(chunks.reduce((a, c) => a + c.blocks.length, 0))}`);
    report.note(`bos blok: ${String(emptyBlocks)}`);
    report.note(
      `ayet kapsami: ${String(covered)}/${String(totalVerses)} ` +
        `(%${((100 * covered) / totalVerses).toFixed(2)})`,
    );
    info(`Alagas: ${String(rows.length)} ceviri satiri, ${String(covered)}/${String(totalVerses)} ayet`);
  });

  info(`rapor: ${report.write()}`);
  await closePool();
}

await main();
