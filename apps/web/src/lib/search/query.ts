/**
 * İstemci sorgu motoru — ön ek eşleşme, skorlama, süzgeç ve ağ katmanı.
 *
 * ## Saf mantık ile ağ ayrı
 *
 * `expandPrefixes`, `scoreHits`, `applyFilters` ve `countByType` saf
 * fonksiyondur; `SearchEngine` ağ erişiminin tamamını tutar. Bu ayrım
 * zorunluydu: projenin test koşucusu düz `tsx`, mock kütüphanesi yok. Motor
 * `fetch`e gömülü olsaydı hiç test edilemezdi.
 *
 * ## Bağımlılık yok
 *
 * Pagefind WASM ister (`wasm-unsafe-eval` CSP'ye girerdi), FlexSearch indeksin
 * tamamını belleğe yükler ve parçalı indirme yapmaz. Aşağıdaki ~150 satır
 * ikisinin de yaptığı işi bu veri boyutunda yapıyor.
 */

import { hasArabic, shardKey, softenFinal, tokenize } from "./normalize.js";
import { RecordResolver } from "./records.js";
import { NAMESPACES, TYPE_KEYS } from "./types.js";
import type { Namespace, SearchIndex, Shard, TypeKey, VerseExtra } from "./types.js";

export interface SearchHit {
  docId: number;
  score: number;
  type: TypeKey;
  title: string;
  url: string;
  /** Yalnız ayetlerde dolu: `[sure, ayet, cüz, sayfa, nüzul]`. */
  extra: VerseExtra | null;
}

export interface SearchFilters {
  type?: TypeKey | null;
  surahId?: number | null;
  revelation?: "mekki" | "medeni" | null;
  juzFrom?: number | null;
  juzTo?: number | null;
  pageFrom?: number | null;
  pageTo?: number | null;
  sort?: "alaka" | "mushaf";
}

/*
 * Tür ağırlıkları.
 *
 * Kısa ve isabetli türler ayetten önce gelir: "sabır" yazan biri önce
 * kavramın kendisini, sonra 93 ayeti görmeli. Ayet en düşük ağırlıkta çünkü
 * en kalabalık tür — ağırlıksız her sorgu ayet duvarıyla açılırdı.
 */
const TYPE_WEIGHT: Readonly<Record<TypeKey, number>> = {
  kavram: 6,
  ilke: 6,
  kissa: 6,
  sure: 6,
  kok: 5,
  konum: 5,
  zaman: 5,
  konu: 4,
  ayet: 1,
};

/**
 * Bir sorgu token'ının shard içinde eşleştiği bütün token'lar.
 *
 * Türkçe eklemeli bir dil; kök atma (stemming) yerine ön ek eşleşmesi
 * kullanılıyor: `sabr` → `sabreden`, `sabrederek`. Hiç eşleşme çıkmazsa
 * ünsüz yumuşaması bir kez denenir: `kitap` → `kitab*` → `kitabı`.
 */
export function expandPrefixes(token: string, shardKeys: readonly string[]): string[] {
  const direct = shardKeys.filter((k) => k.startsWith(token));
  if (direct.length > 0) return direct;

  const softened = softenFinal(token);
  if (softened === null || softened === token) return [];
  return shardKeys.filter((k) => k.startsWith(softened));
}

/**
 * Eşleşmeleri puanlar ve azalan sırada döndürür.
 *
 * Puan bileşenleri:
 *   1. Kaç sorgu kelimesi tuttuysa × 100 — hepsi geçen kayıt her zaman önce
 *   2. Tam kelime eşleşmesi + 30 — ön ekten daha güçlü sinyal
 *   3. Tür ağırlığı × 5
 * Eşitlikte `docId` artan; ayet docId'leri mushaf sırasında olduğu için bu
 * doğal olarak mushaf sırası demektir.
 */
export function scoreHits(
  tokens: readonly string[],
  postings: Readonly<Record<string, readonly number[]>>,
  resolver: RecordResolver,
): SearchHit[] {
  if (tokens.length === 0) return [];

  const keys = Object.keys(postings);
  const matched = new Map<number, { tokens: Set<number>; exact: boolean }>();

  tokens.forEach((token, qi) => {
    for (const key of expandPrefixes(token, keys)) {
      const isExact = key === token;
      for (const id of postings[key] ?? []) {
        let entry = matched.get(id);
        if (entry === undefined) {
          entry = { tokens: new Set(), exact: false };
          matched.set(id, entry);
        }
        entry.tokens.add(qi);
        if (isExact) entry.exact = true;
      }
    }
  });

  const hits: SearchHit[] = [];
  for (const [docId, entry] of matched) {
    const record = resolver.resolve(docId);
    hits.push({
      docId,
      score: entry.tokens.size * 100 + (entry.exact ? 30 : 0) + TYPE_WEIGHT[record.type] * 5,
      type: record.type,
      title: record.title,
      url: record.url,
      extra: record.extra,
    });
  }

  return hits.sort((a, b) => b.score - a.score || a.docId - b.docId);
}

/** Sekme sayıları — süzgeç uygulanmadan ÖNCE hesaplanır. */
export function countByType(hits: readonly SearchHit[]): Record<TypeKey, number> {
  const counts = {} as Record<TypeKey, number>;
  for (const key of TYPE_KEYS) counts[key] = 0;
  for (const hit of hits) counts[hit.type] += 1;
  return counts;
}

function inRange(value: number, from: number | null | undefined, to: number | null | undefined): boolean {
  if (from != null && value < from) return false;
  if (to != null && value > to) return false;
  return true;
}

/**
 * Tür ve ayet süzgeçlerini uygular, istenen sıraya dizer.
 *
 * Ayete özgü süzgeçler (sure, nüzul, cüz, sayfa) ayet OLMAYAN kayıtları
 * elemez: kullanıcı cüz aralığı seçtiğinde kavram sekmesinin boşalması
 * beklenmez, o süzgeç oraya anlamsızdır.
 */
export function applyFilters(hits: readonly SearchHit[], filters: SearchFilters): SearchHit[] {
  const out = hits.filter((hit) => {
    if (filters.type != null && hit.type !== filters.type) return false;

    const extra = hit.extra;
    if (extra === null) return true;

    if (filters.surahId != null && extra[0] !== filters.surahId) return false;
    if (filters.revelation != null) {
      const want = filters.revelation === "medeni" ? 1 : 0;
      if (extra[4] !== want) return false;
    }
    if (!inRange(extra[2], filters.juzFrom, filters.juzTo)) return false;
    if (!inRange(extra[3], filters.pageFrom, filters.pageTo)) return false;
    return true;
  });

  if (filters.sort === "mushaf") return out.sort((a, b) => a.docId - b.docId);
  return out;
}

/** Ağ katmanı: shard ve kısa parça bloklarını indirir, önbelleğe alır. */
export class SearchEngine {
  readonly resolver: RecordResolver;
  private readonly shardCache = new Map<string, Shard>();
  private readonly snippetCache = new Map<number, readonly string[]>();

  private constructor(
    readonly index: SearchIndex,
    private readonly base: string,
  ) {
    this.resolver = new RecordResolver(index);
  }

  static async load(base = "/data/search"): Promise<SearchEngine> {
    const response = await fetch(`${base}/index.json`);
    if (!response.ok) throw new Error(`arama indeksi yuklenemedi (${String(response.status)})`);
    return new SearchEngine((await response.json()) as SearchIndex, base);
  }

  /**
   * Sorguyu çalıştırır. Süzgeç UYGULANMAZ — sekme sayıları süzgeçten önceki
   * kümeden hesaplandığı için çağıran `countByType` ve `applyFilters`'ı
   * kendisi çağırır.
   */
  async search(query: string, where?: readonly Namespace[]): Promise<SearchHit[]> {
    // Arapça sorgu yalnız `ar` ad alanında aranır: latin shard'ları indirmek
    // saf israf olurdu, tek bir token bile tutmaz.
    const spaces = where ?? (hasArabic(query) ? (["ar"] as const) : (["meal", "cev"] as const));
    const merged: Record<string, number[]> = {};
    let tokens: string[] = [];

    for (const ns of spaces) {
      const script = ns === "ar" ? "ar" : "tr";
      const nsTokens = tokenize(query, script);
      if (nsTokens.length === 0) continue;
      tokens = nsTokens;

      const shards = await Promise.all(
        [...new Set(nsTokens.map((t) => shardKey(t, script)))].map(async (key) => this.shard(ns, key)),
      );
      for (const shard of shards) {
        for (const [token, ids] of Object.entries(shard)) {
          const existing = merged[token];
          // Aynı token iki ad alanında da geçebilir (meal + çeviriyazı);
          // listeler birleştirilir, tekrarlar Set ile düşer.
          merged[token] = existing === undefined ? [...ids] : [...new Set([...existing, ...ids])];
        }
      }
    }

    return scoreHits(tokens, merged, this.resolver);
  }

  /** Verilen kayıtların kısa parçaları — yalnız gerekli bloklar iner. */
  async snippets(hits: readonly SearchHit[]): Promise<Map<number, string>> {
    const needed = [...new Set(hits.map((h) => Math.floor(h.docId / this.index.blockSize)))];
    await Promise.all(needed.map(async (block) => this.block(block)));

    const out = new Map<number, string>();
    for (const hit of hits) {
      const block = this.snippetCache.get(Math.floor(hit.docId / this.index.blockSize));
      const text = block?.[hit.docId % this.index.blockSize];
      if (text !== undefined && text !== "") out.set(hit.docId, text);
    }
    return out;
  }

  private async shard(ns: Namespace, key: string): Promise<Shard> {
    const path = `${ns}/${key}`;
    const cached = this.shardCache.get(path);
    if (cached !== undefined) return cached;

    // Var olmayan shard normal bir durum: sorgunun ilk iki harfiyle başlayan
    // hiçbir kelime yok demektir. 404 sessizce boş sonuca çevrilir.
    if (!this.index.shards[ns].includes(key)) {
      this.shardCache.set(path, {});
      return {};
    }

    // Buraya gelen shard indekste KAYITLI: yanıt gelmezse bu "sonuç yok"
    // değil arızadır. Boş sonuca çevrilip önbelleğe alınsaydı, geçici bir
    // ağ hatası sayfa yenilenene kadar "bulunamadı" diye görünürdü.
    const response = await fetch(`${this.base}/${path}.json`);
    if (!response.ok) throw new Error(`arama parcasi yuklenemedi: ${path} (${String(response.status)})`);
    const shard = (await response.json()) as Shard;
    this.shardCache.set(path, shard);
    return shard;
  }

  private async block(n: number): Promise<void> {
    if (this.snippetCache.has(n)) return;
    const response = await fetch(`${this.base}/docs/${String(n)}.json`);
    this.snippetCache.set(n, response.ok ? ((await response.json()) as string[]) : []);
  }
}

export { NAMESPACES };
