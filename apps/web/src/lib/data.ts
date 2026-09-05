import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  StaticAuthor,
  StaticRoot,
  StaticRootsIndex,
  StaticVerseWords,
  StaticAuthorsIndex,
  StaticSource,
  StaticSources,
  StaticSurah,
  StaticSurahMeta,
  StaticSurahTranslation,
  StaticSurahsIndex,
  StaticVerseDetail,
  StaticConcept,
  StaticConceptsIndex,
  StaticLocations,
  StaticPrinciple,
  StaticPrinciplesIndex,
  StaticStoriesIndex,
  StaticStory,
  StaticTimeline,
  StaticVerseLinks,
  StaticVerseRelation,
  StaticVerseRelations,
  StaticSurahSection,
  StaticSurahSections,
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
 * Bir ayetin kelimeleri.
 *
 * Kaynakta olmayabilir; o zaman null doner ve sayfa "Kelimeler" bolumunu hic
 * cizmez. Bos bir baslik gostermek belirsizligi saklamak olurdu (plan 1.5).
 */
export function getVerseWords(surahId: number, verseNumber: number): StaticVerseWords | null {
  const path = resolve(DATA_DIR, `word/verse_${surahId}_${verseNumber}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as StaticVerseWords;
}

export const getRootsIndex = once(() => readJson<StaticRootsIndex>("roots_index.json"));

/** Kok dosyasi adi Arapca harflerdir; adres de oyle (/kok/قول). */
export function getRoot(arabic: string): StaticRoot {
  return readJson<StaticRoot>(`root/${arabic}.json`);
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
 * Ceviriyazinin kaynagi.
 *
 * Arapca metinden AYRI bir kayit: ceviriyazi Tanzil'in kendi metni degil,
 * hazirlayanina (Muhammet Abay) ait. Ayni rozeti kullanmak yanlis atif olurdu.
 */
export const getTranscriptionSource = once(() => requireSource("tanzil-transliteration"));

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

// ---------------------------------------------------------------------------
// İçerik katmanı — kıssa, konum, kavram, ilke, zaman çizelgesi
//
// Dosyalar scripts/build/lib/content.ts tarafından üretilir. İçerik tabloları
// boşsa dosya hiç yazılmaz; bu yüzden okuyucular `null` / boş dizi döner ve
// sayfalar `getStaticPaths` içinde hiç yol üretmez. Site içerik gelmeden de
// kurulabilir (plan §9 Faz 1: veri katkıyla genişler).
// ---------------------------------------------------------------------------

function readJsonOrNull<T>(relativePath: string): T | null {
  const path = resolve(DATA_DIR, relativePath);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export const getStoriesIndex = once(
  (): StaticStoriesIndex["stories"] =>
    readJsonOrNull<StaticStoriesIndex>("stories_index.json")?.stories ?? [],
);
export function getStory(slug: string): StaticStory {
  return readJson<StaticStory>(`story/story_${slug}.json`);
}

export const getPrinciplesIndex = once(
  (): StaticPrinciplesIndex["principles"] =>
    readJsonOrNull<StaticPrinciplesIndex>("principles_index.json")?.principles ?? [],
);
export function getPrinciple(slug: string): StaticPrinciple {
  return readJson<StaticPrinciple>(`principle/principle_${slug}.json`);
}

export const getConceptsIndex = once(
  (): StaticConceptsIndex["concepts"] =>
    readJsonOrNull<StaticConceptsIndex>("concepts_index.json")?.concepts ?? [],
);
export function getConcept(slug: string): StaticConcept {
  return readJson<StaticConcept>(`concept/concept_${slug}.json`);
}

export const getLocations = once(
  (): StaticLocations["locations"] => readJsonOrNull<StaticLocations>("locations.json")?.locations ?? [],
);
export const getTimeline = once(
  (): StaticTimeline["events"] => readJsonOrNull<StaticTimeline>("timeline.json")?.events ?? [],
);

/**
 * Ayet → bağlı içerik (kıssa, ilke, kavram, olay).
 *
 * 712 KB'lık tek dosya; `once` ile bir kez okunur ve 6236 ayet sayfası aynı
 * nesneyi kullanır. Tarayıcıya GİTMEZ — build zamanında HTML'e dönüşür.
 */
const verseLinks = once(
  (): StaticVerseLinks["verses"] => readJsonOrNull<StaticVerseLinks>("verse_links.json")?.verses ?? {},
);

export interface VerseConnections {
  stories: { slug: string; title: string }[];
  principles: { slug: string; nameTr: string; role: "primary" | "secondary" }[];
  concepts: { slug: string; nameTr: string; weight: number }[];
  events: StaticTimeline["events"];
}

/** Bir ayetin keşif ağındaki bağları — plan §12.4. */
export function getVerseConnections(surahId: number, verseNumber: number): VerseConnections {
  const entry = verseLinks()[String(surahId * 1000 + verseNumber)];
  if (entry === undefined) return { stories: [], principles: [], concepts: [], events: [] };

  const storyTitle = new Map(getStoriesIndex().map((s) => [s.slug, s.title]));
  const principleName = new Map(getPrinciplesIndex().map((p) => [p.slug, p.nameTr]));
  const conceptName = new Map(getConceptsIndex().map((c) => [c.slug, c.nameTr]));
  const eventByOrder = new Map(getTimeline().map((e) => [e.order, e]));

  return {
    stories: entry.stories.flatMap((slug) => {
      const title = storyTitle.get(slug);
      return title === undefined ? [] : [{ slug, title }];
    }),
    principles: entry.principles.flatMap((p) => {
      const nameTr = principleName.get(p.slug);
      return nameTr === undefined ? [] : [{ slug: p.slug, nameTr, role: p.role }];
    }),
    concepts: entry.concepts.flatMap((c) => {
      const nameTr = conceptName.get(c.slug);
      return nameTr === undefined ? [] : [{ slug: c.slug, nameTr, weight: c.weight }];
    }),
    events: entry.events.flatMap((order) => {
      const event = eventByOrder.get(order);
      return event === undefined ? [] : [event];
    }),
  };
}

/**
 * Sure içi konu bölümlemesi — plan §12.1, §12.15.
 *
 * Bölümlemesi olmayan sure dosyada geçmez; okuyucu `null` döner ve sayfa
 * başlık göstermez. Ana aralıklar bitişik olduğu için bölümlemesi OLAN bir
 * surede her ayetin tam bir ana konusu vardır.
 */
const surahSections = once(
  (): StaticSurahSections["surahs"] =>
    readJsonOrNull<StaticSurahSections>("sections.json")?.surahs ?? {},
);

export interface VerseSections {
  origin: "source" | "platform";
  sourceSlug: string | null;
  /** Ayetin içinde bulunduğu ana konu — bölümlemesi olan surede her zaman var. */
  main: StaticSurahSection;
  /** `alsoVerses` üzerinden ayete değen ek konular (plan §12.15 kural 3). */
  also: StaticSurahSection[];
  previous: StaticSurahSection | null;
  next: StaticSurahSection | null;
  total: number;
}

/** Bir surenin bütün konu başlıkları — sure sayfası için. */
export function getSurahSections(surahId: number): StaticSurahSections["surahs"][string] | null {
  return surahSections()[String(surahId)] ?? null;
}

/** Bir ayetin bulunduğu konu, komşu konular ve varsa ek konular. */
export function getVerseSections(surahId: number, verseNumber: number): VerseSections | null {
  const entry = surahSections()[String(surahId)];
  if (entry === undefined) return null;
  const index = entry.sections.findIndex(
    (x) => verseNumber >= x.verseStart && verseNumber <= x.verseEnd,
  );
  // Bitişiklik şemada ve linter'da doğrulanıyor; yine de burada sessizce
  // yanlış başlık göstermektense hiç göstermemek doğru davranış.
  const main = index === -1 ? undefined : entry.sections[index];
  if (main === undefined) return null;
  return {
    origin: entry.origin,
    sourceSlug: entry.sourceSlug,
    main,
    also: entry.sections.filter((x) => x.order !== main.order && x.alsoVerses.includes(verseNumber)),
    previous: index > 0 ? entry.sections[index - 1] ?? null : null,
    next: entry.sections[index + 1] ?? null,
    total: entry.sections.length,
  };
}

/**
 * Ayet → ayet ilişki ağı — plan §12.5.
 *
 * verse_links.json ile aynı kalıp: tek dosya, `once`, tarayıcıya gitmez.
 * Dosya sure adı taşımaz (satır sayısı ~50 bin, ad koymak dosyayı üçe
 * katlardı); ad ve slug burada surahs_index.json'dan çözülür.
 */
const verseRelations = once(
  (): StaticVerseRelations["verses"] =>
    readJsonOrNull<StaticVerseRelations>("verse_relations.json")?.verses ?? {},
);

export interface RelatedVerse {
  surahId: number;
  surahSlug: string;
  surahNameTr: string;
  verseNumber: number;
  type: StaticVerseRelation["type"];
  /** Neden ilişkili — kullanıcıya olduğu gibi gösterilir, gizlenmez. */
  reason: string;
  confidence: StaticVerseRelation["confidence"];
}

/**
 * Bir ayetin ilişkili ayetleri, güçlüden zayıfa.
 *
 * Sure kaydı bulunamayan satır atlanır: üretim tarafı bunu zaten engelliyor
 * (referans linter), ama burada sessizce ölü bağlantı üretmektense düşürmek
 * doğru davranış.
 */
export function getRelatedVerses(surahId: number, verseNumber: number): RelatedVerse[] {
  const list = verseRelations()[String(surahId * 1000 + verseNumber)];
  if (list === undefined) return [];
  const surahById = new Map(getSurahsIndex().surahs.map((s) => [s.id, s]));
  return list.flatMap((r) => {
    const surah = surahById.get(r.surahId);
    if (surah === undefined) return [];
    return [
      {
        surahId: r.surahId,
        surahSlug: surah.slug,
        surahNameTr: surah.nameTr,
        verseNumber: r.verseNumber,
        type: r.type,
        reason: r.reason,
        confidence: r.confidence,
      },
    ];
  });
}

/** Kıssa/ilke sayfaları ayet METNİ taşımaz; metin çekirdek katmandan gelir. */
export interface PassageVerse {
  verseNumber: number;
  textUthmani: string;
  transcriptionTr: string | null;
  translation: string | null;
}

export function getPassageVerses(
  surahId: number,
  verseStart: number,
  verseEnd: number,
  authorSlug: string,
): PassageVerse[] {
  const surah = getSurah(surahId);
  const translation = getSurahTranslation(authorSlug, surahId);
  const byNumber = new Map((translation?.verses ?? []).map((v) => [v.verseNumber, v.text]));
  return surah.verses
    .filter((v) => v.verseNumber >= verseStart && v.verseNumber <= verseEnd)
    .map((v) => ({
      verseNumber: v.verseNumber,
      textUthmani: v.textUthmani,
      transcriptionTr: v.transcriptionTr,
      translation: byNumber.get(v.verseNumber) ?? null,
    }));
}

/** Tek ayetin meali — ilke ve kavram sayfalarındaki dayanak listeleri için. */
export function getVerseText(surahId: number, verseNumber: number, authorSlug: string): string | null {
  const translation = getSurahTranslation(authorSlug, surahId);
  return (translation?.verses ?? []).find((v) => v.verseNumber === verseNumber)?.text ?? null;
}
