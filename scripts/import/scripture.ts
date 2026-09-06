/**
 * Kitab-ı Mukaddes ALINTILARI — meal dipnotlarının atıf yaptığı ayetler.
 *
 * `pnpm data:scripture`
 *
 * ## Neden var
 *
 * Meallerin dipnotları Kur'an'ın yanı sıra Tevrat ve İncil'e de atıf yapıyor:
 * "Mısır'dan Çıkış 34:28", "Matta 12:40", "Yaratılış 18:24". Bu atıflar sayfada
 * geçiyor ama okuyucu neye atıf yapıldığını göremiyordu. Kullanıcı kararı
 * (2026-09-06): atıf geçen ayetin metni de gösterilecek.
 *
 * ## LİSANS — bu dosyanın en önemli kısmı
 *
 * Modern Türkçe Kutsal Kitap çevirilerinin hepsi teliflidir; kamu malı olan
 * çeviriler (1827 Kieffer, 1886) Arap harfli Osmanlıcadır ve okunmaz.
 * Araştırma 2026-09-06'da yapıldı, `docs/DURUM.md`'de yazılı.
 *
 * Bu yüzden metin TOPLU KOPYALANMAZ. Uygulanan model projenin Diyanet tefsiri
 * için zaten benimsediği modeldir (CLAUDE.md): **özet + en fazla 200 karakter
 * alıntı + kaynak linki**. Somut sınırlar:
 *
 *   - yalnızca bir mealin dipnotunda ATIF YAPILAN ayetler alınır
 *   - her alıntı en fazla 200 karakter; uzun ayet kesilir ve "…" ile biter
 *   - her alıntı kaynak künyesi ve yayıncı bağlantısıyla birlikte gösterilir
 *   - bütün bir bölüm ya da kitap hiçbir koşulda alınmaz
 *
 * Bu ölçek Kutsal Kitap'ın 30.182 ayetinin ~%1'idir ve her biri BAŞKA bir
 * kaynağın (mealin) atıf yaptığı için buradadır — iktibas, çoğaltma değil.
 * `data/scripture/LICENSE.md` bunu ayrıca yazar: o dizin data/LICENSE
 * (CC BY-NC-SA) kapsamında DEĞİLDİR.
 *
 * ## Girdi
 *
 * Dipnotlar `apps/web/public/data/translation/` altından okunur (PostgreSQL'den
 * değil): bu script bir tablo doldurmuyor, mevcut metinden bir alıntı listesi
 * türetiyor. Böylece Docker/DB gerekmeden çalışır. Önce `pnpm build:data`
 * çalışmış olmalı.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { repoRoot } from "@kuran/pipeline";

const OSIS_URL = "https://raw.githubusercontent.com/seven1m/open-bibles/master/tur-turkish.osis.xml";
const OSIS_PATH = resolve(repoRoot, "cache/bible/tur.osis.xml");
const BOOKS_PATH = resolve(repoRoot, "data/scripture/books.json");
const OUT_PATH = resolve(repoRoot, "data/scripture/quotes.json");
const TRANSLATION_DIR = resolve(repoRoot, "apps/web/public/data/translation");

/** Alıntı üst sınırı — Diyanet tefsiri kuralıyla aynı (CLAUDE.md). */
const QUOTE_LIMIT = 200;

interface BookName {
  text: string;
  needsContext?: boolean;
}
interface Book {
  osisId: string;
  slug: string;
  canon: "eski-ahit" | "yeni-ahit";
  order: number;
  nameTr: string;
  ordinal: number | null;
  names: BookName[];
}

/**
 * Dipnotta Kur'an dışı bir kutsal metne atıf yapıldığının işareti.
 *
 * `needsContext` işaretli adlar (Çıkış, Yaratılış, Yunus, Vahiy, Yakup…) aynı
 * zamanda gündelik Türkçe. Onları ancak dipnot bu bağlamı taşıyorsa atıf
 * sayıyoruz — yoksa "Yaratılış amacıyla ilgili… En'âm 6:73" cümlesindeki
 * "Yaratılış" kitap sanılırdı.
 */
const CONTEXT_CUE =
  /Tevrat|İncil|Zebur|Zebûr|Kitab-ı Mukaddes|Kitabı Mukaddes|Eski Ahit|Yeni Ahit|Kutsal Kitap|Bible|Torah|Gospel|Old Testament|New Testament/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadBooks(): Book[] {
  return (JSON.parse(readFileSync(BOOKS_PATH, "utf8")) as { books: Book[] }).books;
}

/**
 * Kitap adı → kitap eşlemesi.
 *
 * Uzun ad önce denenir ("Mısır'dan Çıkış", "Çıkış"tan önce), yoksa alternatif
 * yazım kısa olanla eşleşip yanlış kitabı verirdi.
 */
function buildMatcher(books: Book[]): {
  pattern: RegExp;
  resolve: (name: string, ordinal: number | null) => Book | undefined;
  needsContext: (name: string) => boolean;
} {
  const byName = new Map<string, Book[]>();
  const contextual = new Set<string>();
  for (const book of books) {
    for (const name of book.names) {
      const key = name.text.toLocaleLowerCase("tr");
      const list = byName.get(key) ?? [];
      list.push(book);
      byName.set(key, list);
      if (name.needsContext === true) contextual.add(key);
    }
  }

  const alternatives = [...byName.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => escapeRegExp(name));

  // (sira) (kitap adi) (bolum) : (ayet) [- (bitis)]
  const pattern = new RegExp(
    `(?:\\b(I{1,3}|[123])\\s*\\.?\\s*)?\\b(${alternatives.join("|")})\\b[\\s,:.]{0,3}(\\d{1,3})\\s*[:/]\\s*(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?`,
    "gi",
  );

  return {
    pattern,
    resolve(name, ordinal) {
      const list = byName.get(name.toLocaleLowerCase("tr"));
      if (list === undefined || list.length === 0) return undefined;
      if (ordinal !== null) {
        const exact = list.find((book) => book.ordinal === ordinal);
        if (exact !== undefined) return exact;
      }
      // Sırasız yazılmışsa sırasız kitabı, yoksa listedeki ilkini ver.
      return list.find((book) => book.ordinal === null) ?? list[0];
    },
    needsContext(name) {
      return contextual.has(name.toLocaleLowerCase("tr"));
    },
  };
}

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, "1": 1, "2": 2, "3": 3 };

interface Citation {
  osisId: string;
  chapter: number;
  verse: number;
  /** Kaç mealde geçtiği — hangi atıfların gerçekten kullanıldığını gösterir. */
  authors: Set<string>;
}

function collectCitations(books: Book[]): Map<string, Citation> {
  if (!existsSync(TRANSLATION_DIR)) {
    throw new Error(
      `${TRANSLATION_DIR} yok. Once 'pnpm build:data' calistirin: bu script uretilmis ` +
        "meal dosyalarindaki dipnotlari tarar.",
    );
  }
  const matcher = buildMatcher(books);
  const found = new Map<string, Citation>();

  for (const author of readdirSync(TRANSLATION_DIR)) {
    for (const file of readdirSync(join(TRANSLATION_DIR, author))) {
      const doc = JSON.parse(readFileSync(join(TRANSLATION_DIR, author, file), "utf8")) as {
        verses?: { footnotes?: { text: string }[] }[];
      };
      for (const verse of doc.verses ?? []) {
        for (const footnote of verse.footnotes ?? []) {
          const text = footnote.text;
          const hasCue = CONTEXT_CUE.test(text);
          matcher.pattern.lastIndex = 0;
          for (
            let match = matcher.pattern.exec(text);
            match !== null;
            match = matcher.pattern.exec(text)
          ) {
            const name = match[2] ?? "";
            if (matcher.needsContext(name) && !hasCue) continue;
            const ordinalToken = match[1]?.toLocaleLowerCase("tr");
            const ordinal = ordinalToken === undefined ? null : (ROMAN[ordinalToken] ?? null);
            const book = matcher.resolve(name, ordinal);
            if (book === undefined) continue;

            const chapter = Number(match[3]);
            // Aralik yazilmissa yalnizca BASLANGIC ayeti alinir: "15:19-24"
            // icin alti ayeti birden almak alinti olmaktan cikardi.
            const verseNumber = Number(match[4]);
            const key = `${book.osisId}.${String(chapter)}.${String(verseNumber)}`;
            const entry = found.get(key);
            if (entry === undefined) {
              found.set(key, { osisId: book.osisId, chapter, verse: verseNumber, authors: new Set([author]) });
            } else {
              entry.authors.add(author);
            }
          }
        }
      }
    }
  }
  return found;
}

async function ensureOsis(): Promise<string> {
  if (existsSync(OSIS_PATH)) return readFileSync(OSIS_PATH, "utf8");
  mkdirSync(resolve(repoRoot, "cache/bible"), { recursive: true });
  process.stdout.write(`indiriliyor: ${OSIS_URL}\n`);
  const response = await fetch(OSIS_URL);
  if (!response.ok) throw new Error(`OSIS indirilemedi: HTTP ${String(response.status)}`);
  const body = await response.text();
  writeFileSync(OSIS_PATH, body, "utf8");
  return body;
}

/**
 * Bir ayetin metni ve — birlesik verilmisse — kapsadigi araligi.
 *
 * Yeni Ceviri bazi ayetleri birlestirerek veriyor: Luka 1:1 kaydi aslinda
 * 1:1-4'un metnidir ve dosyada 1:2, 1:3, 1:4 kaydi YOKTUR. Dipnot "Luka 1:42"
 * diyorsa o metin 1:41 kaydinin icindedir. Bu yuzden tam eslesme bulunamayinca
 * once gelen kayda dusulur ve kapsadigi aralik hesaplanir; arayuz "bu ceviride
 * 41-45 birlikte veriliyor" diye yazabilsin.
 */
export interface OsisVerse {
  text: string;
  spanStart: number;
  spanEnd: number;
}

/** OSIS dosyasindaki butun ayetler: "Gen.1.1" -> metin. */
function parseOsis(xml: string): Map<string, string> {
  const verses = new Map<string, string>();
  const pattern = /<verse osisID='([^']+)'>([\s\S]*?)<\/verse>/g;
  for (let match = pattern.exec(xml); match !== null; match = pattern.exec(xml)) {
    const id = match[1];
    const raw = match[2];
    if (id === undefined || raw === undefined) continue;
    verses.set(
      id,
      raw
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/‹‹/g, "“")
        .replace(/››/g, "”")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return verses;
}

/**
 * 200 karakter siniri.
 *
 * Kelime ortasindan kesilmez; son bosluktan geri sarilir ve "…" konur.
 * Kesilen alintinin `truncated` alani true olur, arayuz bunu soyler.
 */
function limit(text: string): { text: string; truncated: boolean } {
  if (text.length <= QUOTE_LIMIT) return { text, truncated: false };
  const cut = text.slice(0, QUOTE_LIMIT - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const body = (lastSpace > QUOTE_LIMIT / 2 ? cut.slice(0, lastSpace) : cut).replace(
    /[\s.,;:]+$/,
    "",
  );
  return { text: `${body}…`, truncated: true };
}

/**
 * Bolum bazinda kayitli ayet numaralari — birlesik ayet aramasi icin.
 */
function chapterIndex(osis: Map<string, string>): Map<string, number[]> {
  const byChapter = new Map<string, number[]>();
  for (const key of osis.keys()) {
    const at = key.lastIndexOf(".");
    const chapterKey = key.slice(0, at);
    const verseNumber = Number(key.slice(at + 1));
    const list = byChapter.get(chapterKey) ?? [];
    list.push(verseNumber);
    byChapter.set(chapterKey, list);
  }
  for (const list of byChapter.values()) list.sort((a, b) => a - b);
  return byChapter;
}

/** Birlesik ayetin bir okuyucuda makul sayilacak en genis araligi. */
const MAX_MERGED_SPAN = 8;

function lookupVerse(
  osis: Map<string, string>,
  byChapter: Map<string, number[]>,
  osisId: string,
  chapter: number,
  verse: number,
): OsisVerse | null {
  const chapterKey = `${osisId}.${String(chapter)}`;
  const exact = osis.get(`${chapterKey}.${String(verse)}`);
  if (exact !== undefined && exact !== "") {
    return { text: exact, spanStart: verse, spanEnd: verse };
  }

  const numbers = byChapter.get(chapterKey);
  if (numbers === undefined) return null; // bolum yok: atif bu kitaba ait degil

  let start: number | undefined;
  let next: number | undefined;
  for (const candidate of numbers) {
    if (candidate <= verse) start = candidate;
    else {
      next = candidate;
      break;
    }
  }
  if (start === undefined) return null;

  const spanEnd = (next ?? start + MAX_MERGED_SPAN + 1) - 1;
  if (verse > spanEnd || spanEnd - start > MAX_MERGED_SPAN) return null;

  const text = osis.get(`${chapterKey}.${String(start)}`);
  if (text === undefined || text === "") return null;
  return { text, spanStart: start, spanEnd };
}

async function main(): Promise<void> {
  const books = loadBooks();
  const citations = collectCitations(books);
  const osis = parseOsis(await ensureOsis());
  const byChapter = chapterIndex(osis);

  const quotes: {
    osisId: string;
    chapter: number;
    verse: number;
    spanStart: number;
    spanEnd: number;
    text: string;
    truncated: boolean;
  }[] = [];
  const missing: string[] = [];

  for (const key of [...citations.keys()].sort()) {
    const citation = citations.get(key);
    if (citation === undefined) continue;
    const found = lookupVerse(osis, byChapter, citation.osisId, citation.chapter, citation.verse);
    if (found === null) {
      // Kaynakta karsiligi olmayan atif uydurulmaz; arayuz yalnizca kunyeyi
      // gosterir. Cogu, Kur'an atfinin yanlislikla kitap adiyla eslesmesidir
      // ("Yunus 10:102" — Yunus kitabinda 10. bolum yok).
      missing.push(key);
      continue;
    }
    const { text, truncated } = limit(found.text);
    quotes.push({
      osisId: citation.osisId,
      chapter: citation.chapter,
      verse: citation.verse,
      spanStart: found.spanStart,
      spanEnd: found.spanEnd,
      text,
      truncated,
    });
  }

  quotes.sort((a, b) => {
    const orderA = books.findIndex((book) => book.osisId === a.osisId);
    const orderB = books.findIndex((book) => book.osisId === b.osisId);
    if (orderA !== orderB) return orderA - orderB;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  });

  const payload = {
    source: {
      name: "Kutsal Kitap (Yeni Çeviri)",
      publisher: "Kitab-ı Mukaddes Şirketi · Yeni Yaşam Yayınları",
      url: "https://kitabimukaddes.com/",
      license: "Telifli — burada yalnızca iktibas edilmiştir (FSEK m. 35)",
      quoteLimit: QUOTE_LIMIT,
      note:
        "Yalnızca meal dipnotlarında atıf yapılan ayetler, en fazla 200 karakter alıntıyla. " +
        "Toplu çoğaltma yapılmaz; tam metin için yayıncının kendi kaynağına bakınız.",
    },
    quotes,
  };
  writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  process.stdout.write(
    `atif: ${String(citations.size)} · alinti: ${String(quotes.length)} · ` +
      `kesilen: ${String(quotes.filter((q) => q.truncated).length)} · ` +
      `kaynakta yok: ${String(missing.length)}\n`,
  );
  if (missing.length > 0) {
    process.stdout.write(`kaynakta bulunamayan: ${missing.slice(0, 20).join(", ")}\n`);
  }
  process.stdout.write(`yazildi: ${OUT_PATH}\n`);
}

await main();
