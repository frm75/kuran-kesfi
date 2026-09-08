/**
 * Arama indeksinin tipleri.
 *
 * Çalışma zamanı kodu yoktur (etiket tabloları hariç): build script'i de
 * tarayıcı da bu dosyayı kullanır, iki tarafın şema anlayışı ayrışmasın.
 */

export const TYPE_KEYS = [
  "ayet",
  "kok",
  "konu",
  "sure",
  "kavram",
  "ilke",
  "kissa",
  "konum",
  "zaman",
] as const;

export type TypeKey = (typeof TYPE_KEYS)[number];

/** Sekme etiketleri. Tür kodu = `TYPE_KEYS` içindeki dizin. */
export const TYPE_LABELS: Readonly<Record<TypeKey, string>> = {
  ayet: "Ayet",
  kok: "Kök",
  konu: "Konu",
  sure: "Sure",
  kavram: "Kavram",
  ilke: "İlke",
  kissa: "Kıssa",
  konum: "Konum",
  zaman: "Zaman",
};

/** 0 = mekkî, 1 = medenî. Sayı, çünkü 6236 kayıtta metin yazmak bayt israfı. */
export type RevelationCode = 0 | 1;

/** Ayet dokümanının ek alanları: `[sure, ayet, cüz, sayfa, nüzul]`. */
export type VerseExtra = readonly [number, number, number, number, RevelationCode];

/**
 * Doküman kaydı — dizi, alan adı yok.
 *
 * 9004 kaydın her birine `{"type":...,"title":...}` yazmak yüz kilobaytlarca
 * fazladan bayt demekti. Sıra: `[tür kodu, başlık, url, kısa parça, ek]`.
 * `ek` yalnız ayetlerde dolu, diğer türlerde `null`.
 */
export type DocRecord = readonly [number, string, string, string, VerseExtra | null];

/** `search/meta.json` — sayfa açılışında inen küçük tanım dosyası. */
export interface SearchMeta {
  version: number;
  docCount: number;
  /** Bir `docs/<n>.json` bloğundaki kayıt sayısı. */
  blockSize: number;
  blocks: number;
  typeCounts: Readonly<Record<TypeKey, number>>;
  /**
   * Tür → `[ilk docId, son docId]` (ikisi de dahil). Kayıt yoksa `[0, -1]`.
   * Tür süzgeci sayesinde gereksiz `docs/` bloğu indirilmez.
   */
  typeRanges: Readonly<Record<TypeKey, readonly [number, number]>>;
  /** Hangi ad alanında hangi shard harfleri var. */
  shards: Readonly<Record<Namespace, readonly string[]>>;
  stopwords: readonly string[];
}

/**
 * Ters indeksin üç ad alanı.
 *
 * "Eşleşme yeri" süzgeci böylece İNDİRİLEN DOSYA seviyesinde çalışır: yalnız
 * mealde arayan `ar/` shard'ını hiç indirmez.
 */
export type Namespace = "meal" | "cev" | "ar";

export const NAMESPACES: readonly Namespace[] = ["meal", "cev", "ar"];

export const NAMESPACE_LABELS: Readonly<Record<Namespace, string>> = {
  meal: "Meal",
  cev: "Çeviriyazı",
  ar: "Arapça",
};

/** Bir shard dosyası: token → doküman id listesi (artan sırada). */
export type Shard = Readonly<Record<string, readonly number[]>>;

export interface QuickEntry {
  /** Tür kodu — `TYPE_KEYS` içindeki dizin. */
  t: number;
  title: string;
  url: string;
  /** Normalize edilmiş aranabilir metin: ad + eş adlar, boşlukla ayrık. */
  norm: string;
}

export interface QuickSurah {
  id: number;
  slug: string;
  nameTr: string;
  nameAr: string;
  verseCount: number;
}

export interface QuickAlias {
  surahId: number;
  name: string;
  sourceReference: string;
}

/**
 * Sayfa açılışında BİR KEZ inen küçük dosya.
 *
 * "yus." yazan kullanıcı Yûsuf'u tuş başına ağ isteği olmadan görmeli; 385
 * kısa kayıt + cüz/sayfa tabloları bunun için burada. Ayet (6236) ve kök
 * (1641) shard'lı kalır.
 */
export interface QuickIndex {
  entries: QuickEntry[];
  surahs: QuickSurah[];
  aliases: QuickAlias[];
  /** `juzStarts[n-1]` = cüz n'in `[sureId, ayetNo]` başlangıcı. 30 satır. */
  juzStarts: (readonly [number, number])[];
  /** `pageStarts[n-1]` = sayfa n'in `[sureId, ayetNo]` başlangıcı. 604 satır. */
  pageStarts: (readonly [number, number])[];
  /** Eş ad kaynağı — `/ara` sayfasındaki künye satırı için. */
  aliasSourceSlug: string;
}
