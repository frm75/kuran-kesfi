/**
 * Arama indeksi üretimi — plan §12.2, spec `2026-09-08-arama-design.md`.
 *
 * ## Neden build.ts içinden çağrılıyor
 *
 * `Emitter.reset()` her koşuda `apps/web/public/data` dizinini siliyor
 * (`lib/emit.ts:31`). Ayrı çalışan bir son-geçiş script'i ilk
 * `pnpm build:data` koşusunda silinirdi.
 *
 * ## Neden text_no_vowel
 *
 * Arapça arama girdisi `verse.text_no_vowel` kolonudur; `build.ts` içindeki
 * yorum zaten "yalnizca arama indeksi girdisidir" diyordu. `text_uthmani`'yi
 * burada harekesizleştirmek aynı işi ikinci kez, daha kötü yapmak olurdu.
 *
 * ## Üç ad alanı
 *
 *   meal/  Diyanet meali + kavram/ilke/kıssa/konu/sure/konum metinleri
 *   cev/   çeviriyazı + kök latin karşılığı
 *   ar/    Arapça ayet metni + kök arapçası + Arapça adlar
 *
 * "Eşleşme yeri" süzgeci böylece İNDİRİLEN DOSYA seviyesinde çalışır: yalnız
 * mealde arayan `ar/` shard'ını hiç indirmez.
 *
 * ## Tekrarlanabilirlik
 *
 * Plan §20.1: aynı veritabanı aynı baytları üretir. Bütün SQL'ler ORDER BY
 * taşır, shard anahtarları ve token'lar yazımdan önce sıralanır. `Map`
 * yineleme sırasına GÜVENİLMEZ.
 */

import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import type { StaticSurahMeta } from "@kuran/schema";
import { fail, info, pool, repoRoot } from "@kuran/pipeline";
import type { Report } from "@kuran/pipeline";
import {
  STOPWORDS,
  shardKey,
  tokenize,
} from "../../../apps/web/src/lib/search/normalize.js";
import { NAMESPACES, TYPE_KEYS } from "../../../apps/web/src/lib/search/types.js";
import { RecordResolver } from "../../../apps/web/src/lib/search/records.js";
import type {
  LightRecord,
  Namespace,
  QuickAlias,
  QuickSurah,
  RevelationCode,
  SearchIndex,
  TypeKey,
  VerseExtra,
} from "../../../apps/web/src/lib/search/types.js";
import type { Emitter } from "./emit.js";

/*
 * Bir `docs/<n>.json` bloğundaki kısa parça sayısı.
 *
 * Ölçüldü: 500'de ilk 20 sonuç için 25-99 KB iniyordu, 100'de 24-65 KB.
 * Daha küçük bloklar (25) 14-32 KB'a indiriyor ama istek sayısı 18'e çıkıyor
 * ve toplam indeks %19 büyüyor. Bloklar zaten TEMBEL iniyor — sonuç listesi
 * index.json'dan anında basılıyor, kısa parçalar sonra doluyor.
 */
const BLOCK_SIZE = 100;

/** Sonuç kartındaki kısa parçanın en fazla uzunluğu. */
const SNIPPET_MAX = 160;

/** İndeks biçimi sürümü — istemci uyuşmazlığı fark edebilsin. */
const INDEX_VERSION = 1;

/*
 * Bütçeler.
 *
 * Kullanıcının hissettiği sayı TOPLAM indeks değil, bir aramada İNEN bayt:
 * açılışta `index.json`, sorgu başına bir-iki shard. Bu yüzden asıl sınırlar
 * o iki dosyaya kondu. Toplam yalnız yayın boyutunu ilgilendiriyor ve
 * 625 MB'lık `dist` içinde ölçülemeyecek kadar küçük.
 */
const INDEX_GZIP_MAX = 50 * 1024;
const SHARD_GZIP_MAX = 50 * 1024;
const TOTAL_GZIP_WARN = 1536 * 1024;
const TOTAL_GZIP_FAIL = 2560 * 1024;

/** Türü koda çevirir — `TYPE_KEYS` içindeki dizin. */
const typeCode = (key: TypeKey): number => TYPE_KEYS.indexOf(key);

function clip(text: string, max = SNIPPET_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  // Kelime ortasında kesme: son boşluğa kadar geri sar, yoksa sert kes.
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

interface VerseRow {
  [key: string]: unknown;
  id: number;
  surah_id: number;
  verse_number: number;
  transcription_tr: string | null;
  text_no_vowel: string;
  page: number;
  juz: number;
}

/** Bir dokümanın üç ad alanındaki aranabilir metinleri. */
interface DocFields {
  meal?: string;
  cev?: string;
  ar?: string;
}

class IndexBuilder {
  /** docId sırasında kısa parçalar — ayet dahil bütün kayıtlar. */
  readonly snippets: string[] = [];
  /** Ayet DIŞI kayıtlar; ayetler `records.ts` içinde türetilir. */
  readonly entries: LightRecord[] = [];
  readonly typeRanges = new Map<TypeKey, [number, number]>();
  private readonly postings: Record<Namespace, Map<string, number[]>> = {
    meal: new Map(),
    cev: new Map(),
    ar: new Map(),
  };
  private currentType: TypeKey | null = null;

  /** Yeni tür bölümü başlatır; docId aralığı buradan hesaplanır. */
  beginType(key: TypeKey): void {
    this.currentType = key;
    // Boş tür için [0, -1]: "hiç kayıt yok" tek biçimde ifade edilsin.
    this.typeRanges.set(key, [this.snippets.length, this.snippets.length - 1]);
  }

  /**
   * @param title  ayetlerde YAZILMAZ (türetilir); yalnız doğrulama için gelir
   * @param url    ayetlerde YAZILMAZ (türetilir); yalnız doğrulama için gelir
   */
  add(title: string, url: string, snippet: string, fields: DocFields): void {
    const type = this.currentType;
    if (type === null) fail("beginType cagrilmadan add kullanildi");

    const id = this.snippets.length;
    this.snippets.push(clip(snippet));
    if (type !== "ayet") this.entries.push([typeCode(type), title, url]);

    const range = this.typeRanges.get(type);
    if (range !== undefined) range[1] = id;

    for (const ns of NAMESPACES) {
      const text = fields[ns];
      if (text === undefined || text === "") continue;
      for (const token of tokenize(text, ns === "ar" ? "ar" : "tr")) {
        const list = this.postings[ns].get(token);
        // docId artan sirayla eklendigi icin liste kendiliginden sirali;
        // ayni dokumanda tekrar eden token ikinci kez yazilmaz.
        if (list === undefined) this.postings[ns].set(token, [id]);
        else if (list[list.length - 1] !== id) list.push(id);
      }
    }
  }

  /** Ad alanı → shard anahtarı → (token → docId[]). Yazıma hazır, sıralı. */
  shards(): Record<Namespace, Map<string, Record<string, number[]>>> {
    const out: Record<Namespace, Map<string, Record<string, number[]>>> = {
      meal: new Map(),
      cev: new Map(),
      ar: new Map(),
    };
    for (const ns of NAMESPACES) {
      const grouped = new Map<string, [string, number[]][]>();
      for (const [token, ids] of this.postings[ns]) {
        const key = shardKey(token, ns === "ar" ? "ar" : "tr");
        const bucket = grouped.get(key);
        if (bucket === undefined) grouped.set(key, [[token, ids]]);
        else bucket.push([token, ids]);
      }
      // Tekrarlanabilirlik: Map yineleme sirasina guvenilmez, siralanir.
      for (const key of [...grouped.keys()].sort()) {
        const entries = (grouped.get(key) ?? []).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        out[ns].set(key, Object.fromEntries(entries));
      }
    }
    return out;
  }
}

interface AliasFile {
  sourceSlug: string;
  aliases: QuickAlias[];
}

/**
 * `data/surah_aliases.json` okunur ve doğrulanır.
 *
 * DB tablosu açılmadı: bu veriyi aramadan başka kullanan yok. Doğrulama
 * burada yapılır, çünkü bozuk bir kayıt sessizce eşleşmeyen bir eş ad
 * üretirdi — hata vermeyen, fark edilmeyen bir kayıp.
 */
function readAliases(surahIds: ReadonlySet<number>): AliasFile {
  const path = resolve(repoRoot, "data/surah_aliases.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as AliasFile;

  if (parsed.sourceSlug !== "tdv-islam-ansiklopedisi") {
    fail(`data/surah_aliases.json: beklenmeyen sourceSlug "${parsed.sourceSlug}"`);
  }
  for (const a of parsed.aliases) {
    if (!surahIds.has(a.surahId)) fail(`surah_aliases.json: bilinmeyen sure ${String(a.surahId)}`);
    if (a.name.trim() === "") fail(`surah_aliases.json: sure ${String(a.surahId)} icin bos ad`);
    if (a.sourceReference.trim() === "") {
      fail(`surah_aliases.json: sure ${String(a.surahId)} icin kaynak referansi yok`);
    }
  }
  return parsed;
}

async function q<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  return (await pool.query<T>(sql)).rows;
}

export async function emitSearch(
  emitter: Emitter,
  metas: readonly StaticSurahMeta[],
  report: Report,
): Promise<void> {
  info("arama indeksi uretiliyor");

  const surahById = new Map(metas.map((m) => [m.id, m]));
  const aliasFile = readAliases(new Set(metas.map((m) => m.id)));
  const aliasesBySurah = new Map<number, string[]>();
  for (const a of aliasFile.aliases) {
    aliasesBySurah.set(a.surahId, [...(aliasesBySurah.get(a.surahId) ?? []), a.name]);
  }

  const b = new IndexBuilder();

  /** Türetmenin doğrulanacağı beklenen değerler (indekse yazılmaz). */
  const expectedVerses: { title: string; url: string; extra: VerseExtra }[] = [];

  // --- ayet ------------------------------------------------------------------
  const verses = await q<VerseRow>(
    `SELECT id, surah_id, verse_number, transcription_tr, text_no_vowel, page, juz
       FROM verse ORDER BY id`,
  );
  if (verses.length === 0) fail("verse tablosu bos — once 'pnpm data:import' calistirin");

  const diyanet = new Map(
    (
      await q<{ verse_id: number; text: string }>(
        `SELECT t.verse_id, t.text
           FROM translation t JOIN author a ON a.id = t.author_id
          WHERE a.slug = 'diyanet-isleri'
          ORDER BY t.verse_id`,
      )
    ).map((r) => [r.verse_id, r.text]),
  );
  if (diyanet.size === 0) fail("diyanet-isleri meali bulunamadi — arama indeksi metin tasimaz");

  // Cüz ve sayfa başlangıçları ayetlerden hesaplanır; ayrı tablo yok.
  const juzStarts = new Map<number, readonly [number, number]>();
  const pageStarts = new Map<number, readonly [number, number]>();

  b.beginType("ayet");
  for (const v of verses) {
    const meta = surahById.get(v.surah_id);
    if (meta === undefined) fail(`bilinmeyen sure ${String(v.surah_id)}`);
    const text = diyanet.get(v.id) ?? "";
    const revelation: RevelationCode = meta.revelationType === "medeni" ? 1 : 0;

    if (!juzStarts.has(v.juz)) juzStarts.set(v.juz, [v.surah_id, v.verse_number]);
    if (!pageStarts.has(v.page)) pageStarts.set(v.page, [v.surah_id, v.verse_number]);

    // Baslik, adres ve ek alanlar INDEKSE YAZILMIYOR — records.ts turetiyor.
    // Beklenen degerler asagida, uretilen indeksten tek tek dogrulanacak.
    expectedVerses.push({
      title: `${meta.nameTr} ${String(v.verse_number)}`,
      url: `/${meta.slug}/${String(v.verse_number)}`,
      extra: [v.surah_id, v.verse_number, v.juz, v.page, revelation],
    });
    b.add("", "", text, {
      meal: text,
      cev: v.transcription_tr ?? "",
      ar: v.text_no_vowel,
    });
  }

  // --- kök -------------------------------------------------------------------
  b.beginType("kok");
  for (const r of await q<{ arabic: string; latin: string; meaning_tr: string | null }>(
    "SELECT arabic, latin, meaning_tr FROM root ORDER BY arabic",
  )) {
    b.add(
      `${r.arabic} (${r.latin})`,
      `/kok/${r.arabic}`,
      r.meaning_tr ?? "",
      { meal: r.meaning_tr ?? "", cev: r.latin, ar: r.arabic },
    );
  }

  // --- konu başlığı ----------------------------------------------------------
  // Konunun kendi sayfası yok; verse_start ayetinin sayfasi zaten basligi
  // gosteriyor (apps/web/src/lib/data.ts getVerseSections).
  b.beginType("konu");
  for (const s of await q<{ surah_id: number; order: number; title: string; verse_start: number }>(
    'SELECT surah_id, "order", title, verse_start FROM surah_section ORDER BY surah_id, "order"',
  )) {
    const meta = surahById.get(s.surah_id);
    if (meta === undefined) fail(`bilinmeyen sure ${String(s.surah_id)}`);
    b.add(
      s.title,
      `/${meta.slug}/${String(s.verse_start)}`,
      `${meta.nameTr} suresi, ${String(s.verse_start)}. ayetten itibaren`,
      { meal: s.title },
    );
  }

  // --- sure ------------------------------------------------------------------
  b.beginType("sure");
  for (const m of metas) {
    const alt = aliasesBySurah.get(m.id) ?? [];
    const altNote = alt.length > 0 ? ` Diğer adı: ${alt.join(", ")}.` : "";
    b.add(
      `${m.nameTr} suresi`,
      `/${m.slug}`,
      `${m.revelationType === "medeni" ? "Medine" : "Mekke"} döneminde inmiş, ` +
        `${String(m.verseCount)} ayet.${altNote}`,
      { meal: [m.nameTr, m.nameEn, ...alt].join(" "), ar: m.nameAr },
    );
  }

  // --- kavram ----------------------------------------------------------------
  b.beginType("kavram");
  for (const c of await q<{ slug: string; name_tr: string; name_ar: string | null; definition: string }>(
    "SELECT slug, name_tr, name_ar, definition FROM concept ORDER BY slug",
  )) {
    b.add(c.name_tr, `/kavram/${c.slug}`, c.definition, {
      meal: `${c.name_tr} ${c.definition}`,
      ar: c.name_ar ?? "",
    });
  }

  // --- ilke ------------------------------------------------------------------
  b.beginType("ilke");
  for (const p of await q<{ slug: string; name_tr: string; name_ar: string | null; definition: string }>(
    'SELECT slug, name_tr, name_ar, definition FROM principle ORDER BY "order"',
  )) {
    b.add(p.name_tr, `/ilke/${p.slug}`, p.definition, {
      meal: `${p.name_tr} ${p.definition}`,
      ar: p.name_ar ?? "",
    });
  }

  // --- kıssa -----------------------------------------------------------------
  b.beginType("kissa");
  for (const s of await q<{ slug: string; title: string; summary: string }>(
    "SELECT slug, title, summary FROM story ORDER BY chronological_order, slug",
  )) {
    b.add(s.title, `/kissa/${s.slug}`, s.summary, {
      meal: `${s.title} ${s.summary}`,
    });
  }

  // --- konum -----------------------------------------------------------------
  // Konumun kendi sayfasi yok; /harita#konum-<slug> cipasi harita.astro'da var.
  b.beginType("konum");
  for (const l of await q<{
    slug: string;
    name: string;
    modern_name: string | null;
    country: string | null;
    alternatives: unknown;
  }>("SELECT slug, name, modern_name, country, alternatives FROM location ORDER BY slug")) {
    const alts = Array.isArray(l.alternatives) ? l.alternatives.filter((x): x is string => typeof x === "string") : [];
    const detail = [l.modern_name, l.country].filter((x) => x !== null && x !== "").join(", ");
    b.add(l.name, `/harita#konum-${l.slug}`, detail, {
      meal: [l.name, l.modern_name ?? "", l.country ?? "", ...alts].join(" "),
    });
  }

  // --- zaman / olay ----------------------------------------------------------
  // Cipa zaman.astro'ya bu is kapsaminda eklendi (id="olay-<order>").
  b.beginType("zaman");
  for (const e of await q<{ order: number; title: string; description: string }>(
    'SELECT "order", title, description FROM timeline_event ORDER BY "order"',
  )) {
    b.add(e.title, `/zaman#olay-${String(e.order)}`, e.description, {
      meal: `${e.title} ${e.description}`,
    });
  }

  // --- doğrulamalar ----------------------------------------------------------
  const docCount = b.snippets.length;
  const verseCount = expectedVerses.length;

  for (const [i, e] of b.entries.entries()) {
    const url = e[2];
    if (!url.startsWith("/")) fail(`arama: kayit ${String(i)} adresi '/' ile baslamiyor: ${url}`);
    if (url.includes(".html")) fail(`arama: kayit ${String(i)} adresi .html tasiyor: ${url}`);
    if (e[1].trim() === "") fail(`arama: kayit ${String(i)} basliksiz (${url})`);
  }

  const shards = b.shards();
  for (const ns of NAMESPACES) {
    for (const [key, table] of shards[ns]) {
      for (const [token, ids] of Object.entries(table)) {
        for (const id of ids) {
          if (id < 0 || id >= docCount) {
            fail(`arama: ${ns}/${key} icindeki '${token}' gecersiz kayda isaret ediyor (${String(id)})`);
          }
        }
      }
    }
  }

  const orderedJuz = [...juzStarts.keys()].sort((x, y) => x - y);
  const orderedPage = [...pageStarts.keys()].sort((x, y) => x - y);
  if (orderedJuz.length !== 30) fail(`arama: 30 cuz bekleniyordu, ${String(orderedJuz.length)} bulundu`);
  if (orderedPage.length !== 604) fail(`arama: 604 sayfa bekleniyordu, ${String(orderedPage.length)} bulundu`);
  if (metas.length !== 114) fail(`arama: 114 sure bekleniyordu, ${String(metas.length)} bulundu`);

  // --- indeks nesnesi --------------------------------------------------------
  const typeCounts = {} as Record<TypeKey, number>;
  const typeRanges = {} as Record<TypeKey, readonly [number, number]>;
  for (const key of TYPE_KEYS) {
    const range = b.typeRanges.get(key) ?? [0, -1];
    typeRanges[key] = range;
    typeCounts[key] = range[1] - range[0] + 1;
  }

  const shardKeys = {} as Record<Namespace, string[]>;
  for (const ns of NAMESPACES) shardKeys[ns] = [...shards[ns].keys()];

  const index: SearchIndex = {
    version: INDEX_VERSION,
    docCount,
    blockSize: BLOCK_SIZE,
    blocks: Math.ceil(docCount / BLOCK_SIZE),
    typeCounts,
    typeRanges,
    shards: shardKeys,
    stopwords: [...STOPWORDS].sort(),
    entries: b.entries,
    surahs: metas.map(
      (m): QuickSurah => ({
        id: m.id,
        slug: m.slug,
        nameTr: m.nameTr,
        nameAr: m.nameAr,
        verseCount: m.verseCount,
        rev: m.revelationType === "medeni" ? 1 : 0,
      }),
    ),
    aliases: aliasFile.aliases,
    juzStarts: orderedJuz.map((n) => juzStarts.get(n) as readonly [number, number]),
    pageStarts: orderedPage.map((n) => pageStarts.get(n) as readonly [number, number]),
    aliasSourceSlug: aliasFile.sourceSlug,
  };

  /*
   * TÜRETME DOĞRULAMASI — bu işin en kritik denetimi.
   *
   * Ayet kayıtları indekste durmuyor; başlık, adres, cüz, sayfa ve nüzul yeri
   * `records.ts` tarafından sure tablosundan türetiliyor. Türetme bir gün
   * sapsa arama SESSİZCE yanlış ayete bağlardı — 404 bile vermeden, çünkü
   * üretilen adres geçerli bir sayfa olurdu. Bu yüzden 6236 ayetin hepsi
   * veritabanından gelen gerçek değerle tek tek karşılaştırılıyor.
   */
  const resolver = new RecordResolver(index);
  if (resolver.verseCount !== verseCount) {
    fail(`arama: sure tablosu ${String(resolver.verseCount)} ayet veriyor, veritabaninda ${String(verseCount)} var`);
  }
  for (const [docId, want] of expectedVerses.entries()) {
    const got = resolver.resolve(docId);
    if (got.title !== want.title || got.url !== want.url) {
      fail(`arama: ayet turetmesi sapti (${String(docId)}): "${got.title}" ${got.url} != "${want.title}" ${want.url}`);
    }
    const g = got.extra;
    if (g === null || g.join(",") !== want.extra.join(",")) {
      fail(`arama: ayet ek alanlari sapti (${String(docId)}): ${String(g)} != ${String(want.extra)}`);
    }
  }
  info(`arama: ${String(verseCount)} ayet turetmesi dogrulandi`);

  // --- yazım -----------------------------------------------------------------
  let gzipTotal = 0;
  const write = (path: string, value: unknown): number => {
    emitter.write(path, value);
    const size = gzipSync(Buffer.from(JSON.stringify(value), "utf8")).byteLength;
    gzipTotal += size;
    return size;
  };

  const indexGzip = write("search/index.json", index);

  for (let i = 0; i < index.blocks; i += 1) {
    write(`search/docs/${String(i)}.json`, b.snippets.slice(i * BLOCK_SIZE, (i + 1) * BLOCK_SIZE));
  }

  let biggestShard = 0;
  let biggestShardName = "";
  for (const ns of NAMESPACES) {
    for (const [key, table] of shards[ns]) {
      const size = write(`search/${ns}/${key}.json`, table);
      if (size > biggestShard) {
        biggestShard = size;
        biggestShardName = `${ns}/${key}`;
      }
    }
  }

  // --- bütçe ve rapor --------------------------------------------------------
  const kb = (n: number): string => String(Math.round(n / 1024));

  if (indexGzip > INDEX_GZIP_MAX) {
    fail(`arama: index.json ${kb(indexGzip)} KB gzip — ust sinir ${kb(INDEX_GZIP_MAX)} KB. Her sayfa acilisinda iniyor.`);
  }
  if (biggestShard > SHARD_GZIP_MAX) {
    fail(`arama: en buyuk shard ${biggestShardName} ${kb(biggestShard)} KB gzip — ust sinir ${kb(SHARD_GZIP_MAX)} KB`);
  }
  if (gzipTotal > TOTAL_GZIP_FAIL) {
    fail(`arama indeksi toplam ${kb(gzipTotal)} KB gzip — ust sinir ${kb(TOTAL_GZIP_FAIL)} KB`);
  }
  if (gzipTotal > TOTAL_GZIP_WARN) {
    report.issue(`arama indeksi toplam ${kb(gzipTotal)} KB gzip — hedef ${kb(TOTAL_GZIP_WARN)} KB alti`);
  }

  const summary = TYPE_KEYS.map((k) => `${k} ${String(typeCounts[k])}`).join(", ");
  report.note(
    `arama indeksi: ${String(docCount)} kayit (${summary}); ` +
      `${String(index.blocks)} blok, ` +
      `${String(NAMESPACES.reduce((n, ns) => n + shardKeys[ns].length, 0))} shard; ` +
      `acilis ${kb(indexGzip)} KB, en buyuk shard ${biggestShardName} ${kb(biggestShard)} KB, ` +
      `toplam ${kb(gzipTotal)} KB (gzip)`,
  );
  info(
    `arama indeksi hazir: ${String(docCount)} kayit — acilis ${kb(indexGzip)} KB, ` +
      `en buyuk shard ${kb(biggestShard)} KB, toplam ${kb(gzipTotal)} KB gzip`,
  );
}
