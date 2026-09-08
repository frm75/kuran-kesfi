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

/** Ayetin türetilmiş alanları: `[sure, ayet, cüz, sayfa, nüzul]`. */
export type VerseExtra = readonly [number, number, number, number, RevelationCode];

/**
 * `search/docs/<n>.json` — yalnız kısa parça metinleri, docId sırasında.
 *
 * Başlık ve adres buraya YAZILMAZ: ayetlerde türetiliyor, diğer türlerde
 * `SearchIndex.entries` içinde zaten var. Bu bloklar yalnız EKRANDA GÖRÜNEN
 * satırlar için inilir — "sabır" araması 19 bloğun 18'ine dokunuyor ama ilk
 * 20 sonuç yalnız 3 bloğa düşüyor (ölçüldü).
 */
export type SnippetBlock = readonly string[];

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

/**
 * Ayet DIŞI kayıt: `[tür kodu, başlık, url]`.
 *
 * Ayetlerin kaydı YOK ve olmayacak: 6236 ayetin başlığı, adresi, cüzü,
 * sayfası ve nüzul yeri sure tablosu + cüz/sayfa başlangıçlarından tam olarak
 * türetiliyor (`records.ts`). Ölçüldü: türetme 6236/6236 sapmasız, indeks
 * 48 KB'tan 38 KB'a indi. Ayet kaydı yazmak aynı bilgiyi ikinci kez, ağ
 * üzerinden taşımak olurdu.
 */
export type LightRecord = readonly [number, string, string];

/**
 * `search/index.json` — sayfa açılışında BİR KEZ inen dosya.
 *
 * Tanım, tablolar ve ayet dışı bütün kayıtlar burada. İndikten sonra sıralama,
 * süzme ve sonuç listesi ağa hiç çıkmadan çalışır; yalnız shard'lar ve
 * gösterilen satırların kısa parçaları ayrıca inilir.
 */
export interface SearchIndex {
  version: number;
  /** Ayet dahil bütün kayıtlar. `entries` bunun bir alt kümesidir. */
  docCount: number;
  /** Bir `docs/<n>.json` bloğundaki kısa parça sayısı. */
  blockSize: number;
  blocks: number;
  typeCounts: Readonly<Record<TypeKey, number>>;
  /**
   * Tür → `[ilk docId, son docId]` (ikisi de dahil). Kayıt yoksa `[0, -1]`.
   */
  typeRanges: Readonly<Record<TypeKey, readonly [number, number]>>;
  /** Hangi ad alanında hangi shard anahtarları var. */
  shards: Readonly<Record<Namespace, readonly string[]>>;
  stopwords: readonly string[];
  /** Ayet dışı kayıtlar, docId sırasında. `entries[docId - typeCounts.ayet]`. */
  entries: LightRecord[];
  surahs: QuickSurah[];
  aliases: QuickAlias[];
  /** `juzStarts[n-1]` = cüz n'in `[sureId, ayetNo]` başlangıcı. 30 satır. */
  juzStarts: (readonly [number, number])[];
  /** `pageStarts[n-1]` = sayfa n'in `[sureId, ayetNo]` başlangıcı. 604 satır. */
  pageStarts: (readonly [number, number])[];
  /** Eş ad kaynağı — `/ara` künye satırı için. */
  aliasSourceSlug: string;
}

export interface QuickSurah {
  id: number;
  slug: string;
  nameTr: string;
  nameAr: string;
  verseCount: number;
  /** Nüzul yeri — ayet kayıtları buradan türetildiği için zorunlu. */
  rev: RevelationCode;
}

export interface QuickAlias {
  surahId: number;
  name: string;
  sourceReference: string;
}
