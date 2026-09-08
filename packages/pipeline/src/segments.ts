/**
 * Kelime zaman damgasi onarimi — plan 04, spec 1.4.
 *
 * Kaynak (Quran.com QDC) verisi uc kusur tasiyor ve ucu de OLCULDU
 * (2026-09-07, 6236 ayetin tamami taranarak):
 *
 *   1. 170 ayette toplam 247 kelimenin damgasi hic yok (%0,32).
 *   2. 215 ayette ilk kelime ayet basindan 500 ms'den fazla ONCE basliyor —
 *      bu damga o ayete ait degil. (Kucuk negatif on-yukleme normaldir:
 *      medyan 55 ms; kirpilir, bozuk sayilmaz.)
 *   3. 1 ayette (37:130) kaynak indisi DB kelime sayisini asiyor.
 *
 * ## Aradegerleme kelimenin BITISINDEN baslar
 *
 * Damgasi olmayan bir kelime, bir onceki kelimenin BITISI ile bir sonraki
 * kelimenin BASLANGICI arasina konur — onceki kelimenin baslangicina gore
 * degil. Aksi halde isik, sesi hala duyulan kelimeden erken cikardi.
 *
 * Islev SAF: ag, dosya, saat yok. Boylece kurallar test edilebiliyor.
 */

/** Bundan buyuk geriye tasma bozuk veridir, o damga atilir. */
export const LEAD_TOLERANCE_MS = 500;

export interface RepairInput {
  /** DB'deki verse_part sayisi — dogrunun olcusu budur */
  wordCount: number;
  /** QDC verse_timings.timestamp_from */
  verseStartMs: number;
  /** QDC verse_timings.duration */
  verseDurationMs: number;
  /** QDC segments: [indis, baslangic, bitis]; kisa satirlar bozuktur */
  segments: readonly (readonly number[])[];
}

export interface RepairResult {
  /** wordCount + 1 uzunlugunda, artan sirali, ayete goreli ms */
  starts: number[];
  interpolated: number;
  leadRepaired: boolean;
  capped: boolean;
}

interface Span {
  start: number;
  end: number;
}

export function repairVerseSegments(input: RepairInput): RepairResult {
  const { wordCount, verseStartMs, verseDurationMs } = input;
  const known = new Map<number, Span>();
  let overflowEnd = -1;
  let capped = false;
  let leadRepaired = false;

  for (const row of input.segments) {
    if (row.length < 3) continue; // [[1],[2]] gibi satirlar gercek veride var
    const [index, rawStart, rawEnd] = row as readonly [number, number, number];
    if (!Number.isInteger(index) || index < 1) continue;

    const start = rawStart - verseStartMs;
    const end = rawEnd - verseStartMs;

    if (index > wordCount) {
      // 37:130 — kaynak kelimeyi ikiye bolmus. Fazlanin bitisi son kelimeye
      // katiliyor ki ayetin sonu kisalmasin. Satir sirasina guvenmiyoruz:
      // birlestirme donguden SONRA yapiliyor.
      capped = true;
      overflowEnd = Math.max(overflowEnd, Math.min(end, verseDurationMs));
      continue;
    }

    if (start < -LEAD_TOLERANCE_MS) {
      // Bu damga onceki ayetin icinden geliyor. Atilir; kelime "eksik" sayilip
      // aradegerlenir. Sessizce kabul edilirse isik ayetten once yanar.
      leadRepaired = true;
      continue;
    }

    const clampedStart = Math.max(0, Math.min(start, verseDurationMs));
    const clampedEnd = Math.max(clampedStart, Math.min(end, verseDurationMs));
    const previous = known.get(index);
    known.set(
      index,
      previous
        ? {
            start: Math.min(previous.start, clampedStart),
            end: Math.max(previous.end, clampedEnd),
          }
        : { start: clampedStart, end: clampedEnd },
    );
  }

  if (overflowEnd >= 0 && wordCount > 0) {
    const last = known.get(wordCount);
    if (last) last.end = Math.max(last.end, overflowEnd);
  }

  const starts = new Array<number>(wordCount + 1).fill(-1);
  let interpolated = 0;
  for (let k = 1; k <= wordCount; k += 1) {
    const span = known.get(k);
    if (span) starts[k - 1] = span.start;
    else interpolated += 1;
  }

  // Son eleman: bilinen son kelimenin bitisi. Hic damga yoksa ayetin sonu.
  const lastEnd = [...known.values()].reduce((max, span) => Math.max(max, span.end), -1);
  starts[wordCount] = lastEnd >= 0 ? Math.min(lastEnd, verseDurationMs) : verseDurationMs;

  // Bosluklari doldur. Alt sinir onceki kelimenin BITISI, ust sinir sonraki
  // kelimenin BASLANGICI; ikisi de yoksa ayetin kendi siniri.
  let i = 0;
  while (i < wordCount) {
    if (starts[i] !== -1) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < wordCount && starts[j] === -1) j += 1;

    const previousSpan = i > 0 ? known.get(i) : undefined; // i-1'inci kelime (1 tabanli: i)
    const lower = previousSpan ? previousSpan.end : 0;
    const upper = (j < wordCount ? starts[j] : starts[wordCount]) ?? verseDurationMs;
    const span = Math.max(0, upper - lower);
    // Bolen EKSIK KELIME SAYISI: [lower, upper] araligi o kadar dilime
    // ayrilir, ilk eksik kelime lower'da baslar, sonraki bilinen kelime
    // upper'da baslar.
    const missing = j - i;
    for (let k = i; k < j; k += 1) {
      starts[k] = Math.round(lower + (span * (k - i)) / missing);
    }
    i = j + 1;
  }

  // Artan sirali olmasi garanti degildi (kaynakta cakisan damgalar var).
  let previousStart = starts[0] ?? 0;
  for (let k = 1; k < starts.length; k += 1) {
    const value = starts[k] ?? previousStart;
    previousStart = value < previousStart ? previousStart : value;
    starts[k] = previousStart;
  }

  return { starts, interpolated, leadRepaired, capped };
}
