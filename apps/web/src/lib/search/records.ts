/**
 * docId → kayıt çözümü.
 *
 * ## Ayet kayıtları indekste DURMAZ
 *
 * 6236 ayetin başlığı ("Bakara 153"), adresi ("/bakara-suresi/153"), cüzü,
 * sayfası ve nüzul yeri tamamen türetilebilir: sure tablosu ayet sayılarını,
 * `juzStarts`/`pageStarts` de sınırları taşıyor. Ölçüldü — türetme 6236/6236
 * sapmasız ve indeks 48 KB'tan 38 KB'a indi. Ayet kaydı yazmak aynı bilgiyi
 * ikinci kez, ağ üzerinden taşımak olurdu.
 *
 * Türetmenin dayandığı iki değişmez, `scripts/build/lib/search.ts` içinde HER
 * BUILD'de tek tek doğrulanır ve tutmazsa build durur:
 *
 *   1. Ayet docId'leri 0..6235 aralığında, mushaf sırasında.
 *   2. Cüz ve sayfa mushaf sırasında bitişik aralıklardır — bir ayetin cüzü,
 *      onu geçmeyen son cüz başlangıcının numarasıdır.
 */

import { TYPE_KEYS } from "./types.js";
import type { RevelationCode, SearchIndex, TypeKey, VerseExtra } from "./types.js";

export interface ResolvedRecord {
  docId: number;
  type: TypeKey;
  title: string;
  url: string;
  /** Yalnız ayetlerde dolu. */
  extra: VerseExtra | null;
}

/** `arr` içinde `value`'yu geçmeyen son öğenin 1 tabanlı sırası. */
function upperBound(arr: readonly number[], value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((arr[mid] ?? 0) <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class RecordResolver {
  /** `cumulative[i]` = i. sureden önceki toplam ayet sayısı. */
  private readonly cumulative: number[] = [];
  private readonly juzKeys: number[];
  private readonly pageKeys: number[];
  readonly verseCount: number;

  constructor(private readonly index: SearchIndex) {
    let total = 0;
    for (const s of index.surahs) {
      this.cumulative.push(total);
      total += s.verseCount;
    }
    this.verseCount = total;
    // Karşılaştırma anahtarı verse id ile aynı kalıpta: sure*1000 + ayet.
    this.juzKeys = index.juzStarts.map(([s, v]) => s * 1000 + v);
    this.pageKeys = index.pageStarts.map(([s, v]) => s * 1000 + v);
  }

  resolve(docId: number): ResolvedRecord {
    if (docId < 0 || docId >= this.index.docCount) {
      throw new RangeError(`arama: gecersiz kayit numarasi ${String(docId)}`);
    }
    return docId < this.verseCount ? this.resolveVerse(docId) : this.resolveEntry(docId);
  }

  private resolveVerse(docId: number): ResolvedRecord {
    const si = upperBound(this.cumulative, docId) - 1;
    const surah = this.index.surahs[si];
    if (surah === undefined) throw new RangeError(`arama: sure cozulemedi (${String(docId)})`);

    const verseNumber = docId - (this.cumulative[si] ?? 0) + 1;
    const key = surah.id * 1000 + verseNumber;
    const extra: VerseExtra = [
      surah.id,
      verseNumber,
      upperBound(this.juzKeys, key),
      upperBound(this.pageKeys, key),
      surah.rev,
    ];
    return {
      docId,
      type: "ayet",
      title: `${surah.nameTr} ${String(verseNumber)}`,
      url: `/${surah.slug}/${String(verseNumber)}`,
      extra,
    };
  }

  private resolveEntry(docId: number): ResolvedRecord {
    const entry = this.index.entries[docId - this.verseCount];
    if (entry === undefined) throw new RangeError(`arama: kayit bulunamadi (${String(docId)})`);
    const type = TYPE_KEYS[entry[0]];
    if (type === undefined) throw new RangeError(`arama: bilinmeyen tur kodu ${String(entry[0])}`);
    return { docId, type, title: entry[1], url: entry[2], extra: null };
  }
}

/** Bir ayetin nüzul kodunu okunur etikete çevirir. */
export function revelationLabel(code: RevelationCode): "Mekkî" | "Medenî" {
  return code === 1 ? "Medenî" : "Mekkî";
}
