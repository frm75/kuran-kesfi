import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { StaticManuscript, StaticManuscripts, StaticVerseManuscripts } from "@kuran/schema";
import { getSurahsIndex } from "~/lib/data";

/**
 * Eski mushaf yazmaları — okuma katmanı (plan §12.12, docs/KAYNAK_ENVANTERI.md §2.4).
 *
 * Veri Corpus Coranicum'dan (BBAW) gelir, CC BY-SA 4.0.
 *
 * GÖRÜNTÜ YOKTUR ve olmayacak: kaynaktaki 2322 yazmanın hepsinde görüntü izni
 * `restricted`. Yazmaya yalnızca derin bağlantı verilir — bu aynı zamanda
 * CLAUDE.md kural 5'i sağlar (üretimde üçüncü taraf bağımlılığı yok).
 *
 * `data.ts` ile aynı kalıp: dosya bir kez okunur, tarayıcıya gitmez.
 * Ayrı dosyada durmasının nedeni `data.ts`'in zaten 600 satır olması.
 */

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/data");

function readJsonOrNull<T>(relativePath: string): T | null {
  const path = resolve(DATA_DIR, relativePath);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function once<T>(load: () => T): () => T {
  let value: { result: T } | undefined;
  return () => {
    value ??= { result: load() };
    return value.result;
  };
}

/** Tümü, en eskiden yeniye (tarihsizler sonda) — build tarafı öyle sıraladı. */
export const getManuscripts = once(
  (): StaticManuscript[] =>
    readJsonOrNull<StaticManuscripts>("manuscripts.json")?.manuscripts ?? [],
);

const manuscriptById = once((): Map<number, StaticManuscript> => {
  return new Map(getManuscripts().map((m) => [m.id, m]));
});

export function getManuscript(id: number): StaticManuscript | null {
  return manuscriptById().get(id) ?? null;
}

const verseManuscripts = once(
  (): StaticVerseManuscripts["verses"] =>
    readJsonOrNull<StaticVerseManuscripts>("verse_manuscripts.json")?.verses ?? {},
);

export interface VerseManuscriptSummary {
  /** Bu ayeti taşıyan toplam yazma sayısı */
  count: number;
  /** En eski birkaçı — ayet sayfasında bunlar gösterilir */
  oldest: StaticManuscript[];
}

/**
 * Bir ayeti taşıyan yazmaların özeti.
 *
 * Ayet başına ortalama 70, en çok 94 yazma düşüyor; tam listeyi ayet sayfasına
 * basmak gürültüden başka bir şey olmaz. Bu yüzden sayı + en eski birkaçı.
 */
export function getVerseManuscripts(
  surahId: number,
  verseNumber: number,
): VerseManuscriptSummary | null {
  const entry = verseManuscripts()[String(surahId * 1000 + verseNumber)];
  if (entry === undefined) return null;
  const oldest = entry.oldest
    .map((id) => manuscriptById().get(id))
    .filter((m): m is StaticManuscript => m !== undefined);
  return { count: entry.count, oldest };
}

/**
 * Yüzyıl kovası: 630 -> 7 (mîlâdî 7. yüzyıl). Tarihi yoksa null.
 *
 * Kaynağın tarihlemesi bir ARALIKTIR ("700-800") ve başlangıç yılı alınır;
 * bu yüzden kova kesin bir iddia değil, kaba bir sıralama aracıdır. Arayüzde
 * kaynağın kendi tarih metni her zaman ayrıca gösterilir.
 */
export function centuryOf(manuscript: StaticManuscript): number | null {
  if (manuscript.dateStart === null) return null;
  return Math.floor((manuscript.dateStart - 1) / 100) + 1;
}

export interface CenturyBucket {
  /** 7, 8, 9... veya tarihsizler için null */
  century: number | null;
  slug: string;
  label: string;
  count: number;
}

/** Yüzyıl dağılımı, eskiden yeniye; tarihsizler sonda. */
export const getCenturyBuckets = once((): CenturyBucket[] => {
  const counts = new Map<number | null, number>();
  for (const m of getManuscripts()) {
    const c = centuryOf(m);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const dated = [...counts.entries()]
    .filter((e): e is [number, number] => e[0] !== null)
    .sort((a, b) => a[0] - b[0])
    .map(([century, count]) => ({
      century,
      slug: `${century}-yuzyil`,
      label: `${century}. yüzyıl`,
      count,
    }));
  const undated = counts.get(null);
  return undated === undefined
    ? dated
    : [...dated, { century: null, slug: "tarihsiz", label: "Tarihlenmemiş", count: undated }];
});

export function getManuscriptsByCentury(century: number | null): StaticManuscript[] {
  return getManuscripts().filter((m) => centuryOf(m) === century);
}

export interface RangeLabel {
  /** "Bakara 1–5" ya da tek ayette "Bakara 255" */
  label: string;
  /** Aralığın ilk ayetine bağlantı */
  href: string;
  /** Sure değişiyorsa true — "Bakara 280 – Âl-i İmrân 5" gibi */
  crossesSurah: boolean;
}

/** Ayet aralığını okunabilir etikete çevirir. */
export function labelRange(start: number, end: number): RangeLabel {
  const surahs = getSurahsIndex().surahs;
  const byId = new Map(surahs.map((s) => [s.id, s]));
  const startSurah = Math.floor(start / 1000);
  const startVerse = start % 1000;
  const endSurah = Math.floor(end / 1000);
  const endVerse = end % 1000;

  const a = byId.get(startSurah);
  const b = byId.get(endSurah);
  const aName = a?.nameTr ?? `Sure ${startSurah}`;
  const bName = b?.nameTr ?? `Sure ${endSurah}`;
  const href = a === undefined ? "#" : `/${a.slug}/${String(startVerse)}`;

  if (startSurah !== endSurah) {
    return { label: `${aName} ${startVerse} – ${bName} ${endVerse}`, href, crossesSurah: true };
  }
  return {
    label: startVerse === endVerse ? `${aName} ${startVerse}` : `${aName} ${startVerse}–${endVerse}`,
    href,
    crossesSurah: false,
  };
}

/** Kaynağın kendi tarih metni; yoksa dürüstçe söylenir. */
export function dateText(manuscript: StaticManuscript): string {
  return manuscript.origDate ?? "tarihlenmemiş";
}
