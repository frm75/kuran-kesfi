import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  StaticAuthor,
  StaticAuthorsIndex,
  StaticSource,
  StaticSources,
  StaticSurah,
  StaticSurahMeta,
  StaticSurahTranslation,
  StaticSurahsIndex,
  StaticVerseDetail,
} from "@kuran/schema";

/**
 * Statik veri okuyucu — build zamani.
 *
 * apps/web/public/data/ scripts/build tarafindan uretilir. Buradaki islev
 * dogrulamak DEGIL okumaktir: uretilen JSON'lar zaten referans linter'dan
 * (`pnpm lint:refs`, 24.236 denetim) geciyor ve build zinciri linter'i web
 * build'inden ONCE calistiriyor (`pnpm build`). Ayni Zod parse'ini 6236 ayet
 * icin tekrarlamak build suresini iki katina cikarir, hicbir sey kazandirmaz.
 *
 * Bu yuzden dosyalar tipli okunur; sekil dogrulamasi linter'in isidir.
 * Beklenmedik bir sey olursa (dosya yok, JSON bozuk) build patlar — sessizce
 * bos sayfa uretmez.
 */

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/data");

function readJson<T>(relativePath: string): T {
  const path = resolve(DATA_DIR, relativePath);
  if (!existsSync(path)) {
    throw new Error(
      `Veri dosyasi yok: ${path}\n` +
        "Once 'pnpm build:data' calistirin (web build'i uretilmis veriye baglidir).",
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Ayni dosya 6236 sayfada tekrar okunmasin. */
function once<T>(load: () => T): () => T {
  let value: { result: T } | undefined;
  return () => {
    value ??= { result: load() };
    return value.result;
  };
}

export const getSurahsIndex = once(() => readJson<StaticSurahsIndex>("surahs_index.json"));
export const getAuthorsIndex = once(() => readJson<StaticAuthorsIndex>("authors_index.json"));
export const getSources = once(() => readJson<StaticSources>("sources.json"));

/** 114 sure ust bilgisi, sure numarasina gore. */
export const getSurahMetaById = once((): ReadonlyMap<number, StaticSurahMeta> => {
  const map = new Map<number, StaticSurahMeta>();
  for (const surah of getSurahsIndex().surahs) map.set(surah.id, surah);
  return map;
});

export function getSurah(id: number): StaticSurah {
  return readJson<StaticSurah>(`surah/surah_${id}.json`);
}

export function getVerseDetail(surahId: number, verseNumber: number): StaticVerseDetail {
  return readJson<StaticVerseDetail>(`verse/verse_${surahId}_${verseNumber}.json`);
}

/**
 * Bir yazarin bir suredeki meali.
 *
 * Kaynak tarafli bosluklar var (ornek: Suleymaniye Vakfi'nda Tahrim suresi
 * hic yok). Dosya yoksa null doner; cagiran taraf bunu gizlemez, "bu mealde
 * bu sure yok" diye yazar (plan 1.5: belirsizlik saklanmaz).
 */
export function getSurahTranslation(
  authorSlug: string,
  surahId: number,
): StaticSurahTranslation | null {
  const path = resolve(DATA_DIR, `translation/${authorSlug}/surah_${surahId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as StaticSurahTranslation;
}

/**
 * Okuma ekraninin ontanimli meali.
 *
 * Sure sayfasi tek meal gosterir — dordunu birden koymak Bakara'yi 300 KB
 * yapardi. Oncelik 1 olan meal secilir (plan 3.1: Diyanet Isleri).
 */
export const getDefaultAuthor = once((): StaticAuthor => {
  const authors = getAuthorsIndex().authors;
  const byPriority = authors
    .filter((author) => author.priority !== null)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  const chosen = byPriority[0] ?? authors.find((author) => author.isDefault) ?? authors[0];
  if (chosen === undefined) throw new Error("authors_index.json bos: ontanimli meal yok");
  return chosen;
});

/** Turkce mealler once, sonra digerleri; her grup oncelik/ada gore. */
export function sortAuthorsForDisplay(slugs: readonly string[]): string[] {
  const index = new Map(getAuthorsIndex().authors.map((author) => [author.slug, author]));
  return [...slugs].sort((a, b) => {
    const left = index.get(a);
    const right = index.get(b);
    if (left === undefined || right === undefined) return a.localeCompare(b, "tr");
    if (left.language !== right.language) return left.language === "tr" ? -1 : 1;
    const leftPriority = left.priority ?? 99;
    const rightPriority = right.priority ?? 99;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return left.name.localeCompare(right.name, "tr");
  });
}

// ---------------------------------------------------------------------------
// Kaynaklar — <SourceBadge> icin
// ---------------------------------------------------------------------------

const sourceBySlug = once((): ReadonlyMap<string, StaticSource> => {
  const map = new Map<string, StaticSource>();
  for (const source of getSources().sources) map.set(source.slug, source);
  return map;
});

function requireSource(slug: string): StaticSource {
  const source = sourceBySlug().get(slug);
  if (source === undefined) {
    throw new Error(
      `sources.json icinde '${slug}' kaydi yok. Kaynakli icerik kaynagi olmadan ` +
        "gosterilemez (plan 12.10).",
    );
  }
  return source;
}

/** Arapca metnin kaynagi — her sayfada ayni. */
export const getArabicSource = once(() => requireSource("tanzil"));

/**
 * Bir mealin kaynagi.
 *
 * authors_index.json'daki `source` alani kaynagin SLUG'idir ("acikkuran").
 * Eslesmezse hata verilir — kaynaksiz meal gosterilmez (plan 12.10).
 */
export function getSourceForAuthor(author: StaticAuthor): StaticSource {
  const match = sourceBySlug().get(author.source);
  if (match === undefined) {
    throw new Error(
      `'${author.slug}' mealinin kaynagi ('${author.source}') sources.json icinde bulunamadi.`,
    );
  }
  // Yazara ozgu lisans notu varsa kaynak kaydinin ustune yazilir: ayni kaynakta
  // farkli lisansli mealler olabilir.
  return {
    ...match,
    workTitle: author.workTitle ?? match.workTitle,
    author: author.name,
    license: author.license,
    note: author.licenseNote ?? match.note,
    url: author.url ?? match.url,
  };
}

// ---------------------------------------------------------------------------
// Dipnot isaretleri
// ---------------------------------------------------------------------------

export type TextSegment =
  | { kind: "text"; value: string }
  | { kind: "marker"; number: number };

/**
 * Meal metnindeki `[1]` `[2]` isaretlerini ayirir.
 *
 * Yalnizca gercekten dipnotu olan numaralar isaret sayilir; metinde gecen
 * ama karsiligi olmayan bir `[3]` oldugu gibi birakilir (mealin kendi metni
 * olabilir, uydurma baglanti uretilmez).
 *
 * NOT: dipnotu olup metinde isareti OLMAYAN durumlar da var (sure 2'de 1509
 * dipnotlu ayetin 13'u). O dipnotlar yine listelenir, sadece geri baglantisi
 * olmaz — veri gizlenmez.
 */
export function splitFootnoteMarkers(
  text: string,
  footnoteNumbers: readonly number[],
): TextSegment[] {
  const known = new Set(footnoteNumbers);
  const segments: TextSegment[] = [];
  const pattern = /\[(\d+)\]/g;
  let cursor = 0;

  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const number = Number(match[1]);
    if (!known.has(number)) continue;
    if (match.index > cursor) {
      segments.push({ kind: "text", value: text.slice(cursor, match.index) });
    }
    segments.push({ kind: "marker", number });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ kind: "text", value: text.slice(cursor) });
  return segments;
}

/** "Bakara suresi, 153. ayet" — ekran okuyucu ve baslik icin. */
export function verseLabel(surahNameTr: string, verseNumber: number): string {
  return `${surahNameTr} suresi, ${verseNumber}. ayet`;
}
