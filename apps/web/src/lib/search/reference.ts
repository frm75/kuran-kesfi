/**
 * Referans ayrıştırıcı — "5/58", "bakara 153", "cüz 2", "sayfa 23".
 *
 * Sorgu metin aramasından ÖNCE buradan geçer. Eşleşirse sonuçların başına
 * "Doğrudan git" kartı konur; metin sonuçları yine de altta listelenir, çünkü
 * "5" yazan biri hem Mâide suresini hem "5" geçen ayetleri arıyor olabilir.
 *
 * ## Neden sınır aşımı `null` değil
 *
 * "2/300" için boş sonuç dönmek kullanıcıya sitenin bozuk olduğunu
 * düşündürür. `outOfRange` kartı Bakara'nın 286 ayet olduğunu söyler ve sure
 * sayfasına bağlar.
 *
 * ## Neden belirsiz ön ek referans sayılmaz
 *
 * "yu 4" hem Yûnus hem Yûsuf'a düşer. Birini seçip kullanıcıyı yanlış ayete
 * göndermektense referans üretmemek ve metin aramasına bırakmak doğru: metin
 * sonuçlarında iki sure de görünür ve seçim kullanıcıda kalır.
 */

import { normalizeTr } from "./normalize.js";
import type { QuickAlias, QuickSurah } from "./types.js";

export interface ReferenceTables {
  surahs: readonly QuickSurah[];
  aliases: readonly QuickAlias[];
  /** `juzStarts[n-1]` = cüz n'in `[sureId, ayetNo]` başlangıcı. */
  juzStarts: readonly (readonly [number, number])[];
  /** `pageStarts[n-1]` = sayfa n'in `[sureId, ayetNo]` başlangıcı. */
  pageStarts: readonly (readonly [number, number])[];
}

export type ReferenceHit =
  | { kind: "verse"; surah: QuickSurah; verse: number; url: string }
  | { kind: "range"; surah: QuickSurah; from: number; to: number; url: string }
  | { kind: "surah"; surah: QuickSurah; url: string }
  | { kind: "juz"; juz: number; surah: QuickSurah; verse: number; url: string }
  | { kind: "page"; page: number; surah: QuickSurah; verse: number; url: string }
  | { kind: "outOfRange"; message: string; url: string };

const MAX_SURAH = 114;

/** Ayet numarasından önce gelebilen, atılacak bağlaç kelimeler. */
const FILLER_WORDS = new Set(["sure", "suresi", "ayet", "ayeti"]);

/** Cüz ve sayfa anahtar kelimeleri — normalize edilmiş hâlleriyle. */
const UNIT_WORDS = new Set(["cuz", "sayfa"]);

/**
 * Sorguyu ayrıştırmaya hazırlar.
 *
 * `normalizeTr` burada doğrudan kullanılamaz: noktalamayı HİÇE indirdiği için
 * "5/58" -> "558" olurdu. Bu yüzden ayıraçlar önce tek boşluğa çevrilir,
 * normalizasyon kelime kelime uygulanır.
 */
function prepare(query: string): { words: string[]; raw: string } {
  const raw = query.trim();
  const spaced = raw
    .replace(/[/:.,;-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { words: spaced === "" ? [] : spaced.split(" "), raw };
}

/**
 * Sure adı veya eş adı → sure.
 *
 * Tam ad ön eki YENER: "nur" hem Nûr'a tam, hem Nûh'a hiç uymaz ama "nu"
 * ikisine de ön ek olur. Tam eşleşme varsa belirsizlik aranmaz.
 *
 * @returns eşleşen sure, ya da eşleşme yoksa/belirsizse `null`
 */
function matchSurahName(word: string, tables: ReferenceTables): QuickSurah | null {
  const n = normalizeTr(word);
  if (n.length < 2) return null;

  const byId = new Map(tables.surahs.map((s) => [s.id, s]));
  const candidates = new Set<QuickSurah>();
  let exact: QuickSurah | null = null;

  for (const s of tables.surahs) {
    const name = normalizeTr(s.nameTr);
    if (name === n) exact = s;
    else if (name.startsWith(n)) candidates.add(s);
  }
  for (const a of tables.aliases) {
    const s = byId.get(a.surahId);
    if (s === undefined) continue;
    const name = normalizeTr(a.name);
    if (name === n) exact ??= s;
    else if (name.startsWith(n)) candidates.add(s);
  }

  if (exact !== null) return exact;
  // Ön ek birden çok sureye düşüyorsa referans SAYILMAZ.
  return candidates.size === 1 ? ([...candidates][0] ?? null) : null;
}

function surahById(id: number, tables: ReferenceTables): QuickSurah | null {
  return tables.surahs.find((s) => s.id === id) ?? null;
}

function outOfSurah(surah: QuickSurah): ReferenceHit {
  return {
    kind: "outOfRange",
    message: `${surah.nameTr} suresi ${String(surah.verseCount)} ayettir.`,
    url: `/${surah.slug}`,
  };
}

function verseHit(surah: QuickSurah, verse: number): ReferenceHit {
  if (verse < 1 || verse > surah.verseCount) return outOfSurah(surah);
  return { kind: "verse", surah, verse, url: `/${surah.slug}/${String(verse)}` };
}

/** Sayı ya da sure adı — hangisiyse sureye çevirir. */
function headToSurah(head: string, tables: ReferenceTables): QuickSurah | null {
  return /^\d+$/.test(head) ? surahById(Number(head), tables) : matchSurahName(head, tables);
}

/** "5. sure 58. ayet" ve "sure 5 ayet 58" — sözel biçim. */
function parseVerbose(words: string[], tables: ReferenceTables): ReferenceHit | null {
  const joined = words.map((w) => normalizeTr(w)).join(" ");
  const m = /^(?:sure\s+)?(\d+)\s+sure\s+(\d+)\s+ayet$|^sure\s+(\d+)\s+ayet\s+(\d+)$/.exec(joined);
  if (m === null) return null;
  const surahNo = Number(m[1] ?? m[3]);
  const verseNo = Number(m[2] ?? m[4]);
  const surah = surahById(surahNo, tables);
  return surah === null ? null : verseHit(surah, verseNo);
}

/** "cüz 2" · "2. cüz" · "sayfa 23" · "23. sayfa" */
function parseUnit(words: string[], tables: ReferenceTables): ReferenceHit | null {
  if (words.length !== 2) return null;
  const a = normalizeTr(words[0] ?? "");
  const b = normalizeTr(words[1] ?? "");

  const unit = UNIT_WORDS.has(a) ? a : UNIT_WORDS.has(b) ? b : null;
  if (unit === null) return null;

  const n = Number(unit === a ? b : a);
  if (!Number.isInteger(n)) return null;

  const isJuz = unit === "cuz";
  const table = isJuz ? tables.juzStarts : tables.pageStarts;
  const label = isJuz ? "Cüz" : "Sayfa";

  // Sınır tablonun KENDİ uzunluğundan gelir, sabitten değil: tablo build'de
  // gerçek veriden üretiliyor (30 cüz, 604 sayfa) ve tek doğru orada.
  if (n < 1 || n > table.length) {
    return {
      kind: "outOfRange",
      message: `${label} numarası 1 ile ${String(table.length)} arasında olmalı.`,
      url: "/sureler",
    };
  }

  const start = table[n - 1];
  if (start === undefined) return null;
  const surah = surahById(start[0], tables);
  if (surah === null) return null;

  const url = `/${surah.slug}/${String(start[1])}`;
  return isJuz
    ? { kind: "juz", juz: n, surah, verse: start[1], url }
    : { kind: "page", page: n, surah, verse: start[1], url };
}

/**
 * "2/153-160" · "bakara 153-160"
 *
 * Ham metne bakılır, çünkü `prepare` tireyi boşluğa çeviriyor. Belirsizlik
 * kuralı: `-` YALNIZ ayet numarasından SONRA aralık ayıracıdır; "5-58" bu
 * kalıba uymaz ve aşağıda sure/ayet olarak okunur.
 */
function parseRange(raw: string, tables: ReferenceTables): ReferenceHit | null {
  const m = /^(\S+)[\s/:.]+(\d+)\s*-\s*(\d+)$/.exec(raw);
  if (m === null) return null;

  const surah = headToSurah(m[1] ?? "", tables);
  if (surah === null) return null;

  const from = Number(m[2]);
  const to = Number(m[3]);
  if (from < 1 || to < from) return null;
  if (to > surah.verseCount) return outOfSurah(surah);

  return { kind: "range", surah, from, to, url: `/${surah.slug}/${String(from)}` };
}

export function parseReference(query: string, tables: ReferenceTables): ReferenceHit | null {
  const { words, raw } = prepare(query);
  if (words.length === 0) return null;

  return (
    parseVerbose(words, tables) ??
    parseUnit(words, tables) ??
    parseRange(raw, tables) ??
    parseBare(words, tables)
  );
}

/** "bakara 153" · "5 58" · "5" — bağlaç kelimeler atıldıktan sonra kalan. */
function parseBare(words: string[], tables: ReferenceTables): ReferenceHit | null {
  const parts = words.filter((w) => !FILLER_WORDS.has(normalizeTr(w)));

  if (parts.length === 2) {
    const verse = Number(parts[1]);
    if (!Number.isInteger(verse)) return null;
    const surah = headToSurah(parts[0] ?? "", tables);
    return surah === null ? null : verseHit(surah, verse);
  }

  if (parts.length === 1) {
    const only = parts[0] ?? "";
    if (!/^\d+$/.test(only)) return null;
    const n = Number(only);
    if (n < 1 || n > MAX_SURAH) return null;
    const surah = surahById(n, tables);
    return surah === null ? null : { kind: "surah", surah, url: `/${surah.slug}` };
  }

  return null;
}

/**
 * Sorgu TAMAMEN bir referanstan mı ibaret?
 *
 * Öyleyse Enter tuşu doğrudan hedefe gider. "bakara sabır" için gitmez —
 * kullanıcı orada arama yapıyor, gezinmiyor.
 */
export function isPureReference(query: string): boolean {
  const { words } = prepare(query);
  if (words.length === 0 || words.length > 4) return false;

  const numeric = words.filter((w) => /^\d+$/.test(w)).length;
  if (numeric === 0) return false;

  const keywords = words.filter((w) => {
    const n = normalizeTr(w);
    return FILLER_WORDS.has(n) || UNIT_WORDS.has(n);
  }).length;

  // Sayı ve anahtar kelime dışında EN FAZLA bir kelime kalabilir; o da sure
  // adıdır ("bakara 153"). İki serbest kelime varsa bu bir aramadır.
  return numeric + keywords >= words.length - 1;
}
