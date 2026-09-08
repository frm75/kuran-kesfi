# Arapça takip ışığı — uygulama planı

> **Ajan işçiler için:** ZORUNLU ALT BECERİ: Bu planı görev görev uygulamak için
> superpowers:subagent-driven-development (önerilen) veya
> superpowers:executing-plans kullanın. Adımlar onay kutusu (`- [ ]`) biçimindedir.

**Hedef:** `/dinle/<sure>` sayfasında Alafasy kıraatini kesintisiz çalarken okunan
Arapça kelimeyi metin üstünde ışıklandırmak.

**Mimari:** Kelime zaman damgası Quran.com QDC API'sinden BİR KEZ indirilir,
ayete göreli hale getirilip onarılır ve `data/recitation/segments_alafasy.json`
içine yazılır. Build bunu sure başına küçük JSON'lara böler; `/dinle/<sure>`
sayfası kendi suresinin damgasını HTML'e gömer. Tarayıcıda tek `<audio>`
etiketi ayetten ayete geçer, `requestAnimationFrame` döngüsü çalan kelimeyi
işaretler. Ses dosyaları yeniden indirilmez — elde duran ayet MP3'lerinin QDC
damgalarıyla aynı kayıt olduğu ölçüldü (spec §1.3).

**Teknoloji:** TypeScript · Zod (@kuran/schema) · Astro (statik) · PostgreSQL
(yalnız build makinesinde) · kütüphanesiz tarayıcı kodu.

**Spec:** `docs/superpowers/specs/2026-09-07-ses-takip-isigi-design.md`

## Genel kısıtlar

Her görevin gereksinimleri bunları da içerir.

- **Betik yalnız `/dinle/` altında.** 6236 ayet sayfası ve diğer bütün sayfalar
  0 bayt JS kalır. `'unsafe-inline'` ve `'unsafe-eval'` AÇILMAZ.
- **Ağa çıkılmaz.** Damga sayfaya gömülüdür; `connect-src 'none'`.
- **Üçüncü taraf çalışma zamanı bağımlılığı yok** (CLAUDE.md kural 5). CDN yok,
  tarayıcıya kütüphane inmez.
- **`data/**` tek kaynaktır.** `segments_alafasy.json` script tarafından
  ÜRETİLİR, elle yazılmaz.
- **Sayı ölçülür, tahmin edilmez.** Onarılan/aradeğerlenen kelime sayısı
  dosyanın içine yazılır ve linter denetler (`missingVerses` ile aynı gerekçe).
- **Kod ve tanımlayıcılar İngilizce, kullanıcıya görünen metin Türkçe** (plan 20.2).
- **Testler tsx + elle yazılmış `check()` yardımcısıyla** çalışır; vitest/jest
  yoktur (`packages/schema/src/__tests__/schema.smoke.ts` örnektir).
- Build kökten çalıştırılır: `pnpm build`. Alt dizinden çalıştırma kırılır.
- QDC API'si **User-Agent başlığı olmayan isteğe 403 döner.**
- Alafasy QDC kimliği **7**'dir (el-Husarî murattal 6, muallim 12).

---

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `packages/schema/src/recitation.ts` (değişir) | damga dosyasının Zod şeması |
| `packages/pipeline/src/segments.ts` (yeni) | ham damgayı onaran saf işlev |
| `packages/pipeline/src/__tests__/segments.smoke.ts` (yeni) | onarım kurallarının testi |
| `scripts/media/fetch_segments.ts` (yeni) | QDC'den indirir, onarır, `data/`ya yazar |
| `scripts/build/build.ts` (değişir) | `emitRecitationSegments` |
| `scripts/build/linter.ts` (değişir) | damga ↔ kelime sayısı denetimi |
| `apps/web/src/lib/dinle/timeline.ts` (yeni) | `activeWordIndex` — tarayıcıya da gider |
| `apps/web/src/lib/dinle/__tests__/timeline.smoke.ts` (yeni) | ikili arama testi |
| `apps/web/src/lib/dinle/data.ts` (yeni) | build sırasında sure damgasını okur |
| `apps/web/src/lib/dinle/app.ts` (yeni) | oynatıcı + ışık (tarayıcı) |
| `apps/web/src/components/DinleAyet.astro` (yeni) | tek ayet satırı |
| `apps/web/src/pages/dinle/[surah].astro` (yeni) | sayfa |
| `apps/web/src/styles/global.css` (değişir) | `.dinle-*` stilleri |
| `infra/nginx/kurankesfi.tr.conf` (değişir) | `~^/dinle/` CSP dalı |

---

### Görev 1: Damga şeması ve onarım işlevi

Ham QDC verisi üç kusur taşıyor (spec §1.4). Onarım saf bir işlevde durur ki
test edilebilsin; indirme scripti yalnız onu çağırır.

**Dosyalar:**
- Değiştir: `packages/schema/src/recitation.ts` (dosyanın sonuna ekle)
- Oluştur: `packages/pipeline/src/segments.ts`
- Değiştir: `packages/pipeline/src/index.ts`
- Değiştir: `packages/pipeline/package.json`
- Test: `packages/pipeline/src/__tests__/segments.smoke.ts`

**Arayüzler:**
- Üretir: `repairVerseSegments(input: RepairInput): RepairResult` ·
  `LEAD_TOLERANCE_MS` · Zod şemaları `segmentFile`, `staticSegments`,
  `verseSegmentList`, `segmentStats`
- Tüketir: yok

- [ ] **Adım 1: Şemayı yaz**

`packages/schema/src/recitation.ts` sonuna:

```ts
/**
 * Kelime zaman damgasi — plan 04.
 *
 * ## Neden ayete goreli
 *
 * Kaynak (Quran.com QDC) damgayi SURE mp3'une gore veriyor. Bizde ayet basina
 * ayri dosya var. 300 ayetlik olcumde iki kaydin ayni ustadan kesildigi
 * dogrulandi (fark medyan 2 ms), bu yuzden sure dosyasini indirmek yerine
 * damga `timestamp_from` cikarilarak ayete goreli hale getirildi.
 *
 * ## Neden yalniz baslangiclar
 *
 * Bir kelimenin bitisi bir sonrakinin baslangicidir. Dizinin son elemani son
 * kelimenin bitisidir; uzunluk = kelime sayisi + 1. Boylece dosya yariya iner
 * (480 KB) ve calan kelime tek bir ikili aramayla bulunur.
 */
export const verseSegmentList = z.array(z.number().int().nonnegative()).min(2);
export type VerseSegmentList = z.infer<typeof verseSegmentList>;

/**
 * Onarim sayaclari. TAHMIN DEGIL: indirme bittikten sonra gercekten yapilan
 * onarim sayilir (`missingVerses` ile ayni gerekce).
 */
export const segmentStats = z.object({
  verseCount: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  /** Damgasi hic gelmeyip komsulardan aradegerlenen kelime */
  interpolatedWords: z.number().int().nonnegative(),
  /** Ilk kelimesi ayet basindan 500 ms'den fazla once baslayan (bozuk) ayet */
  repairedLeads: z.number().int().nonnegative(),
  /** Kaynak indisi DB kelime sayisini asan ayet */
  cappedVerses: z.number().int().nonnegative(),
});
export type SegmentStats = z.infer<typeof segmentStats>;

/** data/recitation/segments_<slug>.json */
export const segmentFile = z.object({
  reciterSlug: slug,
  sourceUrl: nonEmptyText,
  /** YYYY-MM-DD */
  fetchedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stats: segmentStats,
  /** "2:255" -> [0, 410, 980, ..., 51900] */
  verses: z.record(z.string().regex(/^\d{1,3}:\d{1,3}$/), verseSegmentList),
});
export type SegmentFile = z.infer<typeof segmentFile>;

/** public/data/ses/segment_<sure>.json */
export const staticSurahSegments = z.object({
  surahId: z.number().int().positive(),
  reciters: z.record(slug, z.record(z.string(), verseSegmentList)),
});
export type StaticSurahSegments = z.infer<typeof staticSurahSegments>;
```

- [ ] **Adım 2: Testi yaz (henüz geçmez)**

`packages/pipeline/src/__tests__/segments.smoke.ts`:

```ts
/**
 * Damga onarim kurallarinin duman testleri — plan 04, Gorev 1.
 *
 * Calistirma:  pnpm --filter @kuran/pipeline test:smoke
 */

import { LEAD_TOLERANCE_MS, repairVerseSegments } from "../segments.js";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.error(`  HATA ${label}`);
  }
}

console.log("1. Temiz veri");
{
  const r = repairVerseSegments({
    wordCount: 4,
    verseStartMs: 1000,
    verseDurationMs: 5000,
    segments: [
      [1, 1000, 1580],
      [2, 1580, 2409],
      [3, 2409, 3502],
      [4, 3502, 5840],
    ],
  });
  check("uzunluk = kelime + 1", r.starts.length === 5);
  check("ayete goreli", r.starts[0] === 0 && r.starts[1] === 580);
  check("son eleman son bitis", r.starts[4] === 4840);
  check("aradegerleme yok", r.interpolated === 0);
  check("on-yukleme onarimi yok", !r.leadRepaired);
  check("kirpma yok", !r.capped);
}

console.log("2. Kucuk negatif on-yukleme kirpilir");
{
  // Gercek veride medyan 55 ms: ilk kelime ayet basindan biraz once baslar.
  const r = repairVerseSegments({
    wordCount: 2,
    verseStartMs: 6090,
    verseDurationMs: 5590,
    segments: [
      [1, 6025, 7025],
      [2, 7025, 11550],
    ],
  });
  check("negatif deger sifira kirpilir", r.starts[0] === 0);
  check("bozuk sayilmaz", !r.leadRepaired);
  check("ikinci kelime dogru", r.starts[1] === 935);
}

console.log("3. Buyuk on-yukleme bozuktur, atilir");
{
  // 60:13 gercek ornegi: ilk damga ayet basindan 50 saniye once.
  const r = repairVerseSegments({
    wordCount: 3,
    verseStartMs: 420800,
    verseDurationMs: 25640,
    segments: [
      [1, 370305, 373085],
      [2, 425800, 430800],
      [3, 430800, 446440],
    ],
  });
  check("bozuk ilk damga atildi, aradegerlendi", r.leadRepaired);
  check("ilk kelime sifirdan baslar", r.starts[0] === 0);
  check("ikinci kelime korunur", r.starts[1] === 5000);
  check("aradegerlenen 1 kelime", r.interpolated === 1);
  check("tolerans 500 ms", LEAD_TOLERANCE_MS === 500);
}

console.log("4. Eksik kelime aradegerlenir");
{
  const r = repairVerseSegments({
    wordCount: 4,
    verseStartMs: 0,
    verseDurationMs: 4000,
    segments: [
      [1, 0, 1000],
      [2, 1000, 2000],
      // 3. kelimenin damgasi yok
      [4, 3000, 4000],
    ],
  });
  check("uzunluk yine kelime + 1", r.starts.length === 5);
  check("3. kelime komsular arasina konur", r.starts[2] === 2000);
  check("aradegerlenen 1", r.interpolated === 1);
  check("artan sirali", r.starts.every((v, i, a) => i === 0 || a[i - 1] <= v));
}

console.log("5. Bastaki ve sondaki eksikler");
{
  const r = repairVerseSegments({
    wordCount: 3,
    verseStartMs: 0,
    verseDurationMs: 3000,
    segments: [[2, 1000, 2000]],
  });
  check("bastaki eksik sifir olur", r.starts[0] === 0);
  check("sondaki eksik son bitise dayanir", r.starts[2] === 2000);
  check("son eleman ayet suresini asmaz", r.starts[3] <= 3000);
  check("aradegerlenen 2", r.interpolated === 2);
}

console.log("6. Fazla indis son kelimeye katilir (37:130)");
{
  const r = repairVerseSegments({
    wordCount: 3,
    verseStartMs: 0,
    verseDurationMs: 4000,
    segments: [
      [1, 0, 1000],
      [2, 1000, 2000],
      [3, 2000, 3000],
      [4, 3000, 4000],
    ],
  });
  check("uzunluk kelime sayisina uyar", r.starts.length === 4);
  check("kirpma isaretlendi", r.capped);
  check("fazlanin bitisi son elemana yazildi", r.starts[3] === 4000);
}

console.log("7. Bozuk girdiler");
{
  const r = repairVerseSegments({
    wordCount: 2,
    verseStartMs: 0,
    verseDurationMs: 2000,
    // 3 elemandan kisa satirlar gercek veride var: [[1],[2]]
    segments: [[1, 0, 1000], [1], [2, 1000, 2000], [2]],
  });
  check("eksik satirlar yok sayilir", r.starts.length === 3);
  check("dogru okundu", r.starts[1] === 1000);
}
{
  const r = repairVerseSegments({
    wordCount: 2,
    verseStartMs: 0,
    verseDurationMs: 2000,
    segments: [],
  });
  check("hic damga yoksa esit bolunur", r.starts.length === 3 && r.starts[1] === 1000);
  check("hepsi aradegerlenmis sayilir", r.interpolated === 2);
}

console.log(`\n${String(passed)} gecti, ${String(failures.length)} kaldi`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
```

- [ ] **Adım 3: Testi çalıştır, başarısız olduğunu gör**

`packages/pipeline/package.json` `scripts` içine ekle:

```json
"test:smoke": "tsx src/__tests__/segments.smoke.ts"
```

`devDependencies` içine `"tsx": "^4.20.6"` ekle (sürüm için `scripts/media/package.json`a bak, aynısını kullan).

Çalıştır: `pnpm --filter @kuran/pipeline test:smoke`
Beklenen: HATA — `Cannot find module '../segments.js'`

- [ ] **Adım 4: Onarım işlevini yaz**

`packages/pipeline/src/segments.ts`:

```ts
/**
 * Kelime zaman damgasi onarimi — plan 04, spec 1.4.
 *
 * Kaynak (Quran.com QDC) verisi uc kusur tasiyor ve ucu de OLCULDU:
 *
 *   1. 170 ayette toplam 247 kelimenin damgasi hic yok (%0,32).
 *   2. 215 ayette ilk kelime ayet basindan 500 ms'den fazla ONCE basliyor —
 *      bu damga o ayete ait degil. (Kucuk negatif on-yukleme normaldir:
 *      medyan 55 ms; kirpilir, bozuk sayilmaz.)
 *   3. 1 ayette (37:130) kaynak indisi DB kelime sayisini asiyor.
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

export function repairVerseSegments(input: RepairInput): RepairResult {
  const { wordCount, verseStartMs, verseDurationMs } = input;
  const known = new Map<number, { start: number; end: number }>();
  let capped = false;
  let leadRepaired = false;

  for (const row of input.segments) {
    if (row.length < 3) continue; // [[1],[2]] gibi satirlar gercek veride var
    const [index, rawStart, rawEnd] = row as readonly [number, number, number];
    if (!Number.isInteger(index) || index < 1) continue;

    const start = rawStart - verseStartMs;
    const end = rawEnd - verseStartMs;

    if (index > wordCount) {
      // 37:130 — kaynak kelimeyi ikiye bolmus. Fazlanin bitisini son kelimeye
      // katiyoruz ki ayetin sonu kisalmasin.
      capped = true;
      const last = known.get(wordCount);
      if (last) last.end = Math.max(last.end, end);
      continue;
    }

    if (start < -LEAD_TOLERANCE_MS) {
      // Bu damga onceki ayetin icinden geliyor. Atilir; kelime "eksik" sayilip
      // aradegerlenir. Sessizce kabul edilirse isik ayetten once yanar.
      leadRepaired = true;
      continue;
    }

    const clampedStart = Math.max(0, start);
    const clampedEnd = Math.max(clampedStart, Math.min(end, verseDurationMs));
    const previous = known.get(index);
    known.set(
      index,
      previous
        ? { start: Math.min(previous.start, clampedStart), end: Math.max(previous.end, clampedEnd) }
        : { start: clampedStart, end: clampedEnd },
    );
  }

  const starts = new Array<number>(wordCount + 1).fill(-1);
  for (const [index, span] of known) starts[index - 1] = span.start;

  const lastKnownEnd = Math.max(
    0,
    ...[...known.values()].map((s) => s.end),
  );
  starts[wordCount] = known.size > 0 ? Math.min(lastKnownEnd, verseDurationMs) : verseDurationMs;
  if (known.size === 0) starts[wordCount] = verseDurationMs;

  // Bastaki eksikler: ayet basindan baslar.
  let interpolated = 0;
  if (starts[0] === -1) starts[0] = 0;

  // Ortadaki ve sondaki eksikler: bilinen iki komsu arasina esit dagitilir.
  let i = 0;
  while (i <= wordCount) {
    if (starts[i] !== -1) {
      i += 1;
      continue;
    }
    let j = i;
    while (j <= wordCount && starts[j] === -1) j += 1;
    const before = starts[i - 1];
    const after = j <= wordCount ? starts[j] : verseDurationMs;
    const gap = j - (i - 1);
    for (let k = i; k < j; k += 1) {
      starts[k] = Math.round(before + ((after - before) * (k - (i - 1))) / gap);
    }
    i = j;
  }

  // Damgasi hic olmayan kelime sayisi — sayac, bilinenlerden hesaplanir.
  for (let k = 1; k <= wordCount; k += 1) {
    if (!known.has(k)) interpolated += 1;
  }

  // Artan sirali olmasi garanti degildi (kaynakta cakisan damgalar var).
  for (let k = 1; k <= wordCount; k += 1) {
    if (starts[k] < starts[k - 1]) starts[k] = starts[k - 1];
  }

  return { starts, interpolated, leadRepaired, capped };
}
```

- [ ] **Adım 5: `index.ts`e ekle**

```ts
export * from "./segments.js";
```

- [ ] **Adım 6: Test geçsin**

Çalıştır: `pnpm --filter @kuran/pipeline test:smoke`
Beklenen: BAŞARILI, "0 kaldı"

Çalıştır: `pnpm --filter @kuran/schema build && pnpm --filter @kuran/pipeline build && pnpm typecheck`
Beklenen: hatasız

- [ ] **Adım 7: Kök test scriptine ekle**

`package.json` içindeki `test` scriptine `pnpm --filter @kuran/pipeline test:smoke &&` ekle (schema'dan sonra).

- [ ] **Adım 8: İşle**

```bash
git add packages/schema/src/recitation.ts packages/pipeline/src/segments.ts \
        packages/pipeline/src/index.ts packages/pipeline/src/__tests__/segments.smoke.ts \
        packages/pipeline/package.json package.json
git commit -m "feat(ses): kelime zaman damgasi semasi ve onarim islevi"
```

---

### Görev 2: Damga indirici

**Dosyalar:**
- Oluştur: `scripts/media/fetch_segments.ts`
- Değiştir: `scripts/media/package.json`
- Değiştir: `package.json` (kök)
- Üretilen veri: `data/recitation/segments_alafasy.json`

**Arayüzler:**
- Tüketir: `repairVerseSegments`, `segmentFile` (Görev 1)
- Üretir: `data/recitation/segments_<slug>.json` dosyası; `pnpm media:segments`

- [ ] **Adım 1: Scripti yaz**

`scripts/media/fetch_segments.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Report, closePool, fail, info, query, repoRoot, warn } from "@kuran/pipeline";
import { repairVerseSegments } from "@kuran/pipeline";
import { segmentFile } from "@kuran/schema";

/**
 * Kelime zaman damgasi indirici — plan 04.
 *
 * ============================================================================
 * NEDEN QDC, NEDEN SIMDI
 * ============================================================================
 *
 * fetch_recitation.ts "QUL paketinde segments.json bos geliyordu" diyor. O
 * tespit eskidi: Quran.com'un QDC ucu kelime kelime damga veriyor ve 6236
 * ayetin HEPSINDE dolu (2026-09-07 olcumu).
 *
 * Damga sure MP3'une gore. Bizde ayet basina dosya var; 300 ayetlik olcumde
 * iki kaydin ayni ustadan kesildigi dogrulandi (fark medyan 2 ms). Bu yuzden
 * sure MP3'u INDIRILMIYOR, damga `timestamp_from` cikarilarak ayete goreli
 * hale getiriliyor.
 *
 * ============================================================================
 * NEDEN VERITABANI OKUNUYOR
 * ============================================================================
 *
 * Dogrunun olcusu `verse_part` satir sayisidir. Kaynagin indisine korlemesine
 * guvenmek, tek bir ayette kaydigi anda isigi butun sure boyunca yanlis
 * kelimeye yakardi. Uyusmayan her ayet rapora yazilir.
 *
 * ============================================================================
 * KULLANIM
 * ============================================================================
 *
 *   pnpm media:segments                    alafasy
 *   pnpm media:segments --reciter husary
 *   pnpm media:segments --limit 5          ilk N sure (deneme)
 *   pnpm media:segments --force            onbellegi yok say
 *
 * Sonra:  pnpm build
 */

interface SegmentSource {
  slug: string;
  /** QDC audio/reciters/<id> */
  qdcId: number;
  name: string;
}

const SOURCES: Record<string, SegmentSource> = {
  alafasy: { slug: "alafasy", qdcId: 7, name: "Mishary Rashid Alafasy" },
  husary: { slug: "husary", qdcId: 6, name: "Mahmoud Khalil Al-Husary" },
};

const API = "https://api.qurancdn.com/api/qdc/audio/reciters";
/** Baslik olmadan 403 doner. */
const HEADERS = { "User-Agent": "kurankesfi.tr/1.0 (+https://kurankesfi.tr)", Accept: "application/json" };

interface QdcVerseTiming {
  verse_key: string;
  timestamp_from: number;
  duration: number;
  segments: number[][] | null;
}

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

async function fetchChapter(source: SegmentSource, chapter: number, force: boolean): Promise<QdcVerseTiming[]> {
  const cacheDir = resolve(repoRoot, "scripts/media/.tmp/segments", source.slug);
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = resolve(cacheDir, `${String(chapter)}.json`);

  let body: string;
  if (!force && existsSync(cachePath)) {
    body = readFileSync(cachePath, "utf8");
  } else {
    const url = `${API}/${String(source.qdcId)}/audio_files?chapter=${String(chapter)}&segments=true`;
    let lastError = "";
    body = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
        body = await response.text();
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    if (body === "") fail(`sure ${String(chapter)} indirilemedi: ${lastError}`);
    writeFileSync(cachePath, body, "utf8");
  }

  const parsed = JSON.parse(body) as { audio_files?: { verse_timings?: QdcVerseTiming[] }[] };
  const timings = parsed.audio_files?.[0]?.verse_timings;
  if (!timings) fail(`sure ${String(chapter)}: verse_timings yok`);
  return timings;
}

async function main(): Promise<void> {
  const slugArg = arg("reciter") ?? "alafasy";
  const source = SOURCES[slugArg];
  if (!source) fail(`bilinmeyen kari: ${slugArg} (${Object.keys(SOURCES).join(", ")})`);

  const force = process.argv.includes("--force");
  const limitArg = arg("limit");
  const lastChapter = limitArg === null ? 114 : Number(limitArg);

  const report = new Report(`segments-${source.slug}`);

  // DB'deki kelime sayilari — dogrunun olcusu.
  const rows = await query<{ surah_id: number; verse_number: number; n: string }>(
    `SELECT v.surah_id, v.verse_number, count(p.*)::text AS n
       FROM verse_part p JOIN verse v ON v.id = p.verse_id
      GROUP BY 1, 2`,
  );
  const wordCounts = new Map<string, number>();
  for (const row of rows) wordCounts.set(`${String(row.surah_id)}:${String(row.verse_number)}`, Number(row.n));
  info(`veritabani: ${String(wordCounts.size)} ayetin kelime sayisi okundu`);

  const verses: Record<string, number[]> = {};
  let wordTotal = 0;
  let interpolatedTotal = 0;
  let leadRepairedTotal = 0;
  let cappedTotal = 0;

  for (let chapter = 1; chapter <= lastChapter; chapter += 1) {
    const timings = await fetchChapter(source, chapter, force);
    for (const timing of timings) {
      const key = timing.verse_key;
      const wordCount = wordCounts.get(key);
      if (wordCount === undefined) {
        report.note(`${key}: veritabaninda kelime yok, atlandi`);
        continue;
      }
      const result = repairVerseSegments({
        wordCount,
        verseStartMs: timing.timestamp_from,
        verseDurationMs: timing.duration,
        segments: timing.segments ?? [],
      });
      verses[key] = result.starts;
      wordTotal += wordCount;
      interpolatedTotal += result.interpolated;
      if (result.leadRepaired) leadRepairedTotal += 1;
      if (result.capped) cappedTotal += 1;
      if (result.interpolated > 0) {
        report.note(`${key}: ${String(result.interpolated)} kelime aradegerlendi (${String(wordCount)} kelimelik ayet)`);
      }
      if (result.capped) report.note(`${key}: kaynak indisi kelime sayisini asti, kirpildi`);
    }
    if (chapter % 20 === 0) info(`sure ${String(chapter)}/114`);
  }

  const missing = [...wordCounts.keys()].filter((k) => !(k in verses));
  if (missing.length > 0 && lastChapter === 114) {
    fail(`${String(missing.length)} ayetin damgasi gelmedi — ornek: ${missing.slice(0, 5).join(", ")}`);
  }

  const payload = {
    reciterSlug: source.slug,
    sourceUrl: `${API}/${String(source.qdcId)}/audio_files?segments=true`,
    fetchedAt: new Date().toISOString().slice(0, 10),
    stats: {
      verseCount: Object.keys(verses).length,
      wordCount: wordTotal,
      interpolatedWords: interpolatedTotal,
      repairedLeads: leadRepairedTotal,
      cappedVerses: cappedTotal,
    },
    verses,
  };

  const checked = segmentFile.safeParse(payload);
  if (!checked.success) fail(`sema dogrulamasi basarisiz:\n${checked.error.message}`);

  const outPath = resolve(repoRoot, "data/recitation", `segments_${source.slug}.json`);
  writeFileSync(outPath, `${JSON.stringify(payload)}\n`, "utf8");

  const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0);
  info(
    `${source.name}: ${String(payload.stats.verseCount)} ayet · ${String(wordTotal)} kelime · ` +
      `${String(interpolatedTotal)} aradegerlenen · ${String(leadRepairedTotal)} bozuk on-yukleme · ` +
      `${String(cappedTotal)} kirpilan · ${kb} KB`,
  );
  if (interpolatedTotal / Math.max(1, wordTotal) > 0.01) {
    warn(`aradegerlenen kelime orani %1'i asti — kaynak bozulmus olabilir`);
  }
  report.write();
  await closePool();
}

await main();
```

- [ ] **Adım 2: `query`, `closePool`, `repoRoot` adlarını doğrula**

Çalıştır: `grep -n "export" packages/pipeline/src/db.ts packages/pipeline/src/env.ts`
Beklenen: `query`, `closePool`, `repoRoot` dışa aktarılmış. Adlar farklıysa
`scripts/import/acikkuran.ts` içindeki kullanımın aynısını uygula.

- [ ] **Adım 3: pnpm scriptlerini ekle**

`scripts/media/package.json` `scripts`e:

```json
"segments": "tsx fetch_segments.ts"
```

Kök `package.json` `scripts`e (`media:recitation` satırının altına):

```json
"//media:segments": "Kelime zaman damgasi: Quran.com QDC ucundan iner, ayete goreli hale gelir, data/recitation/segments_<kari>.json yazilir. Ses dosyasi INDIRMEZ. Sonra: pnpm build.",
"media:segments": "pnpm build:packages && pnpm --filter @kuran/media segments",
```

- [ ] **Adım 4: Beş sureyle dene**

Çalıştır: `pnpm media:segments --limit 5`
Beklenen: `data/recitation/segments_alafasy.json` yazılır, kayıp ayet hatası
vermez (limit modunda kontrol atlanır), rapor `var/reports/` altına düşer.

Doğrula:

```bash
python3 -c "
import json; d=json.load(open('data/recitation/segments_alafasy.json'))
print(d['stats'])
s=d['verses']['1:1']; print('1:1', s)
assert s[0]==0 and all(s[i]<=s[i+1] for i in range(len(s)-1)), 'artan sirali degil'
print('ok')"
```
Beklenen: `1:1 [0, 580, 1409, 2502, 5840]` benzeri, `ok`

- [ ] **Adım 5: Tam çalıştır**

Çalıştır: `pnpm media:segments`
Beklenen (2026-09-07 ölçümüyle aynı mertebede olmalı):

```
6236 ayet · 77429 kelime · ~247 aradegerlenen · ~215 bozuk on-yukleme · 1 kirpilan · ~480 KB
```

Sayılar bunlardan çok saparsa DURMA, rapora bak: kaynak değişmiş olabilir.

- [ ] **Adım 6: İşle**

```bash
git add scripts/media/fetch_segments.ts scripts/media/package.json package.json \
        data/recitation/segments_alafasy.json
git commit -m "feat(ses): kelime zaman damgasi indiricisi ve alafasy damgalari"
```

---

### Görev 3: Build çıktısı ve linter denetimi

**Dosyalar:**
- Değiştir: `scripts/build/build.ts` (`emitRecitation`in hemen altına)
- Değiştir: `scripts/build/linter.ts`
- Çıktı: `apps/web/public/data/ses/segment_<sure>.json`

**Arayüzler:**
- Tüketir: `segmentFile`, `staticSurahSegments` (Görev 1); `data/recitation/segments_*.json` (Görev 2)
- Üretir: sure başına statik JSON

- [ ] **Adım 1: Emit işlevini yaz**

`scripts/build/build.ts` içinde `emitRecitation`in altına:

```ts
/**
 * Kelime zaman damgasi — sure basina bolunur.
 *
 * Butun Kur'an 480 KB; tek dosya olsaydi /dinle sayfasi kendi suresi icin
 * hepsini tasirdi. Sure basina ortalama 4,2 KB, en buyugu 36,5 KB (Bakara):
 * sayfaya GOMULECEK kadar kucuk, boylece `connect-src` kapali kaliyor.
 */
function emitRecitationSegments(emitter: Emitter, report: Report): void {
  const dir = resolve(repoRoot, "data/recitation");
  if (!existsSync(dir)) return;
  const files = readdirSync(dir)
    .filter((name) => /^segments_[a-z0-9-]+\.json$/.test(name))
    .sort();
  if (files.length === 0) return;

  /** sureId -> kariSlug -> ayetAnahtari -> baslangiclar */
  const bySurah = new Map<number, Record<string, Record<string, number[]>>>();

  for (const name of files) {
    const parsed = segmentFile.safeParse(JSON.parse(readFileSync(resolve(dir, name), "utf8")));
    if (!parsed.success) {
      fail(`data/recitation/${name} sema dogrulamasi basarisiz:\n${parsed.error.message}`);
    }
    const { reciterSlug, stats, verses } = parsed.data;
    for (const [key, starts] of Object.entries(verses)) {
      const surahId = Number(key.split(":")[0]);
      let entry = bySurah.get(surahId);
      if (!entry) {
        entry = {};
        bySurah.set(surahId, entry);
      }
      entry[reciterSlug] ??= {};
      entry[reciterSlug][key] = starts;
    }
    info(
      `damga: ${reciterSlug} — ${String(stats.verseCount)} ayet · ${String(stats.wordCount)} kelime · ` +
        `${String(stats.interpolatedWords)} aradegerlenen`,
    );
    report.note(
      `Damga: ${reciterSlug} — ${String(stats.verseCount)} ayet, ` +
        `${String(stats.interpolatedWords)} kelime aradegerlendi, ` +
        `${String(stats.repairedLeads)} bozuk on-yukleme atildi, ` +
        `${String(stats.cappedVerses)} ayet kirpildi`,
    );
  }

  for (const [surahId, reciters] of [...bySurah.entries()].sort((a, b) => a[0] - b[0])) {
    const payload = { surahId, reciters };
    const checked = staticSurahSegments.safeParse(payload);
    if (!checked.success) {
      fail(`ses/segment_${String(surahId)}.json sema dogrulamasi basarisiz:\n${checked.error.message}`);
    }
    emitter.write(`ses/segment_${String(surahId)}.json`, payload);
  }
}
```

`main()` içinde `emitRecitation(emitter, report);` satırının hemen altına:

```ts
  emitRecitationSegments(emitter, report);
```

Dosya başındaki `@kuran/schema` importuna `segmentFile` ve `staticSurahSegments` ekle.

- [ ] **Adım 2: Linter denetimini yaz**

`scripts/build/linter.ts` içine, `verse_part` sayımının yapıldığı yerin
(satır ~270) yanına:

```ts
  // Damga <-> kelime sayisi. Bir ayette kaysa isik butun sure boyunca yanlis
  // kelimeye yanar; sessiz kirilma olmasin diye build durur.
  const segmentsDir = resolve(repoRoot, "data/recitation");
  const segmentFiles = existsSync(segmentsDir)
    ? readdirSync(segmentsDir).filter((n) => /^segments_[a-z0-9-]+\.json$/.test(n))
    : [];
  for (const name of segmentFiles) {
    const parsed = segmentFile.parse(JSON.parse(readFileSync(resolve(segmentsDir, name), "utf8")));
    const partCounts = await query<{ key: string; n: string }>(
      `SELECT v.surah_id || ':' || v.verse_number AS key, count(p.*)::text AS n
         FROM verse_part p JOIN verse v ON v.id = p.verse_id
        GROUP BY 1`,
    );
    const expected = new Map(partCounts.map((r) => [r.key, Number(r.n)]));
    const problems: string[] = [];
    for (const [key, starts] of Object.entries(parsed.verses)) {
      const want = expected.get(key);
      if (want === undefined) {
        problems.push(`${key}: veritabaninda yok`);
      } else if (starts.length !== want + 1) {
        problems.push(`${key}: ${String(starts.length - 1)} damga, ${String(want)} kelime`);
      }
      for (let i = 1; i < starts.length; i += 1) {
        if (starts[i] < starts[i - 1]) {
          problems.push(`${key}: ${String(i)}. damga geriye gidiyor`);
          break;
        }
      }
    }
    if (problems.length > 0) {
      fail(`${name}: ${String(problems.length)} damga sorunu\n  ${problems.slice(0, 10).join("\n  ")}`);
    }
    info(`damga denetimi: ${name} — ${String(Object.keys(parsed.verses).length)} ayet temiz`);
  }
```

- [ ] **Adım 3: Build'i çalıştır**

Çalıştır: `pnpm build:data && pnpm lint:refs`
Beklenen: `damga denetimi: segments_alafasy.json — 6236 ayet temiz`

Doğrula:

```bash
ls apps/web/public/data/ses | head -3
du -sh apps/web/public/data/ses
python3 -c "
import json; d=json.load(open('apps/web/public/data/ses/segment_2.json'))
print(d['surahId'], list(d['reciters']), len(d['reciters']['alafasy']))"
```
Beklenen: 114 dosya, ~500 KB toplam, `2 ['alafasy'] 286`

- [ ] **Adım 4: İşle**

```bash
git add scripts/build/build.ts scripts/build/linter.ts
git commit -m "feat(ses): damgalari sure basina statik JSON olarak uret ve denetle"
```

---

### Görev 4: Çalan kelimeyi bulan saf işlev

Tarayıcıya gidecek TEK mantık parçası budur; ayrı dosyada ve testli.

**Dosyalar:**
- Oluştur: `apps/web/src/lib/dinle/timeline.ts`
- Test: `apps/web/src/lib/dinle/__tests__/timeline.smoke.ts`
- Değiştir: `apps/web/package.json`

**Arayüzler:**
- Üretir: `activeWordIndex(starts, tMs): number` — 0 tabanlı kelime indisi,
  ses henüz ilk kelimeye gelmediyse `-1`
- Tüketir: yok

- [ ] **Adım 1: Testi yaz**

`apps/web/src/lib/dinle/__tests__/timeline.smoke.ts`:

```ts
/**
 * Calan kelimeyi bulma — plan 04, Gorev 4.
 *
 * Calistirma:  pnpm --filter @kuran/web test:smoke
 */

import { activeWordIndex } from "../timeline";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.error(`  HATA ${label}`);
  }
}

// 4 kelime: [0, 580, 1409, 2502] baslangiclar, 5840 son bitis
const starts = [0, 580, 1409, 2502, 5840];

console.log("1. Sinirlar");
check("t=0 ilk kelime", activeWordIndex(starts, 0) === 0);
check("t=579 hala ilk", activeWordIndex(starts, 579) === 0);
check("t=580 ikinci kelime", activeWordIndex(starts, 580) === 1);
check("t=2502 dorduncu kelime", activeWordIndex(starts, 2502) === 3);
check("t=5839 hala dorduncu", activeWordIndex(starts, 5839) === 3);

console.log("2. Disarisi");
check("son bitisten sonra -1", activeWordIndex(starts, 5840) === -1);
check("cok sonra -1", activeWordIndex(starts, 99999) === -1);
check("negatif zaman -1", activeWordIndex(starts, -5) === -1);

console.log("3. Ayni ms'de baslayan kelimeler");
{
  // Aradegerlemede iki kelime ayni ms'ye dusebilir; sonuncusu kazanmali ki
  // isik ileri gitsin, takilmasin.
  const tied = [0, 1000, 1000, 2000];
  check("esitlikte sonraki kelime", activeWordIndex(tied, 1000) === 2);
}

console.log("4. Bozuk girdi");
check("bos dizi -1", activeWordIndex([], 100) === -1);
check("tek eleman -1", activeWordIndex([0], 100) === -1);

console.log("5. Buyuk ayet (2:282, 129 kelime) dogrusal degil ikili arama");
{
  const big = Array.from({ length: 130 }, (_, i) => i * 500);
  check("ortadaki kelime", activeWordIndex(big, 64 * 500 + 10) === 64);
  check("son kelime", activeWordIndex(big, 128 * 500 + 10) === 128);
}

console.log(`\n${String(passed)} gecti, ${String(failures.length)} kaldi`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
```

- [ ] **Adım 2: Testi çalıştır, başarısız olduğunu gör**

`apps/web/package.json` `test:smoke` scriptini şuna çevir:

```json
"test:smoke": "tsx src/lib/gunluk/__tests__/fsrs.smoke.ts && tsx src/lib/dinle/__tests__/timeline.smoke.ts"
```

Çalıştır: `pnpm --filter @kuran/web test:smoke`
Beklenen: HATA — `Cannot find module '../timeline'`

- [ ] **Adım 3: İşlevi yaz**

`apps/web/src/lib/dinle/timeline.ts`:

```ts
/**
 * Calan kelimeyi bulma — plan 04.
 *
 * `starts` ayete goreli kelime baslangiclaridir; son eleman son kelimenin
 * bitisidir (uzunluk = kelime sayisi + 1). Bir kelimenin bitisi bir sonrakinin
 * baslangicidir.
 *
 * Ikili arama, dogrusal tarama degil: dongu saniyede ~60 kez donuyor ve
 * 2:282'de 129 kelime var. Esit baslangicta SONRAKI kelime secilir — iki
 * kelime ayni ms'ye dustugunde isik takilip kalmasin.
 *
 * Bu dosya tarayiciya gider: Node API'si, DOM erisimi ve bagimlilik YOKTUR.
 */
export function activeWordIndex(starts: readonly number[], tMs: number): number {
  const wordCount = starts.length - 1;
  if (wordCount < 1) return -1;
  if (tMs < starts[0] || tMs >= starts[wordCount]) return -1;

  let low = 0;
  let high = wordCount - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (starts[mid] <= tMs) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
```

- [ ] **Adım 4: Test geçsin**

Çalıştır: `pnpm --filter @kuran/web test:smoke`
Beklenen: BAŞARILI, "0 kaldı"

- [ ] **Adım 5: İşle**

```bash
git add apps/web/src/lib/dinle/timeline.ts \
        apps/web/src/lib/dinle/__tests__/timeline.smoke.ts apps/web/package.json
git commit -m "feat(ses): calan kelimeyi bulan ikili arama"
```

---

### Görev 5: `/dinle/<sure>` sayfası — betiksiz iskelet

Önce betiksiz hâli çalışsın. Bu adımdan sonra sayfa JS olmadan da dinlenebilir
olur; ışık bir sonraki görevde gelir.

**Dosyalar:**
- Oluştur: `apps/web/src/lib/dinle/data.ts`
- Değiştir: `apps/web/src/lib/data.ts` (`stripFootnoteMarkers` eklenir)
- Oluştur: `apps/web/src/components/DinleAyet.astro`
- Oluştur: `apps/web/src/pages/dinle/[surah].astro`
- Değiştir: `apps/web/src/styles/global.css`

**Arayüzler:**
- Tüketir: `getVerseAudio`, `STYLE_LABEL` (`~/lib/recitation`), `getVerseWords`,
  `getSurahTranslation`, `splitFootnoteMarkers` (`~/lib/data`),
  `staticSurahSegments` (Görev 3 çıktısı)
- Üretir: `getSurahSegments(surahId): StaticSurahSegments | null` — `.reciters[kariSlug][ayetAnahtari]` ile okunur;
  `stripFootnoteMarkers(text, numbers): string` (Plan 05 bunu @kuran/schema'ya taşıyacak)

- [ ] **Adım 1: Veri okuyucuyu yaz**

`apps/web/src/lib/dinle/data.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { StaticSurahSegments } from "@kuran/schema";
import { DATA_DIR } from "~/lib/data-dir";

/**
 * Kelime zaman damgasi — build sirasinda okunur, sayfaya GOMULUR.
 *
 * Sure basina ortalama 4,2 KB. Agdan cekilseydi `connect-src` acilacakti;
 * gomulu geldigi icin /dinle sayfasinin CSP'sinde yalniz `script-src 'self'`
 * var, baglanti hakki yok.
 *
 * Bu dosya YALNIZ build sirasinda calisir (node:fs). Tarayiciya giden mantik
 * `timeline.ts` icindedir.
 */
export function getSurahSegments(surahId: number): StaticSurahSegments | null {
  const path = resolve(DATA_DIR, `ses/segment_${String(surahId)}.json`);
  if (!existsSync(path)) return null;
  // Tamami donuyor: Plan 05 ayni dosyaya `meals` alanini ekleyecek ve cagiran
  // taraf degismeyecek.
  return JSON.parse(readFileSync(path, "utf8")) as StaticSurahSegments;
}
```

- [ ] **Adım 1b: Dipnot işaretini ayıklayan yardımcıyı ekle**

`apps/web/src/lib/data.ts` içinde, var olan `splitFootnoteMarkers`in hemen
altına:

```ts
/**
 * Dipnot isaretleri ayiklanmis duz metin — plan 04.
 *
 * /dinle sayfasi dipnot isareti gostermiyor: burasi dinleme sayfasi,
 * dipnotlar ayet ve sure sayfalarinda duruyor. Ayni ayiklama Plan 05'te
 * seslendirilen metne de uygulanacak; iki taraf AYNI islevden gecmezse
 * kelime kutulari ile ses kayar.
 *
 * Korlemesine `[\d+]` silmiyor: numarasi gercek bir dipnota denk gelmeyen
 * isaret duz metin kaliyor — `splitFootnoteMarkers` ile ayni kural. Olculdu:
 * mehmet-okuyan metnindeki 4.432 isaretin 2'si boyle.
 */
export function stripFootnoteMarkers(
  text: string,
  footnoteNumbers: readonly number[],
): string {
  return splitFootnoteMarkers(text, footnoteNumbers)
    .map((segment) => (segment.kind === "text" ? segment.value : ""))
    .join("");
}
```

- [ ] **Adım 2: Ayet satırı bileşenini yaz**

`apps/web/src/components/DinleAyet.astro`:

```astro
---
import type { StaticWord } from "@kuran/schema";
import { stripFootnoteMarkers } from "~/lib/data";

/**
 * Dinleme sayfasindaki tek ayet — plan 04.
 *
 * Arapca metin kelime kelime `<span>`lere bolunur cunku isik bir kelimeyi
 * isaretleyecek. Bolme kaynagi `verse_part`: duraklama isaretleri (ۚ ۖ)
 * onceki kelimenin icindedir, ayri kutu acilmaz.
 *
 * Betik calismazsa: kelimeler yine basili durur, altta ayetin kendi
 * `<audio controls>` etiketi vardir. Isik yoktur, dinleme calisir.
 */

interface Props {
  verseKey: string;
  verseNumber: number;
  words: readonly StaticWord[];
  translation: string | null;
  /** Meal metnindeki [n] isaretlerinden hangileri gercek dipnot */
  footnoteNumbers: readonly number[];
  audioUrl: string | null;
  label: string;
}

const { verseKey, verseNumber, words, translation, footnoteNumbers, audioUrl, label } =
  Astro.props;

/**
 * Dinleme sayfasinda dipnot isareti gosterilmiyor: burasi dinleme sayfasi,
 * dipnotlar ayet ve sure sayfalarinda duruyor. Plan 05 ayni ayiklanmis metni
 * seslendirecek — iki taraf AYNI islevden gecmezse isik kayar.
 */
const mealText =
  translation === null ? null : stripFootnoteMarkers(translation, footnoteNumbers);
---

<article class="dinle-ayet" id={`ayet-${verseKey.replace(":", "-")}`} data-verse={verseKey}>
  <header class="dinle-ayet-bas">
    <span class="dinle-ayet-no" dir="ltr">{verseNumber}</span>
    <a href={`/${verseKey.split(":")[0]}/${String(verseNumber)}`} class="dinle-ayet-bag">
      ayet sayfası
    </a>
  </header>

  <p lang="ar" dir="rtl" class="dinle-arapca">
    <span class="sr-only" lang="tr">{label}.</span>
    {
      words.map((word, index) => (
        <span class="dinle-kelime" data-i={String(index)}>
          {word.arabic}{" "}
        </span>
      ))
    }
  </p>

  {mealText !== null && <p lang="tr" class="dinle-meal">{mealText}</p>}

  {
    audioUrl !== null && (
      <audio class="dinle-yedek-oynatici" controls preload="none" src={audioUrl}>
        <a href={audioUrl}>Ses dosyasını indir</a>
      </audio>
    )
  }
</article>
```

- [ ] **Adım 3: Sayfayı yaz**

`apps/web/src/pages/dinle/[surah].astro`:

```astro
---
import Base from "~/layouts/Base.astro";
import DinleAyet from "~/components/DinleAyet.astro";
import { getSurahDetail, getSurahTranslation, getSurahsIndex, getVerseWords } from "~/lib/data";
import { getSurahSegments } from "~/lib/dinle/data";
import { STYLE_LABEL, getVerseAudio } from "~/lib/recitation";

/**
 * Dinleme sayfasi — plan 04, spec 2.
 *
 * ## Sitenin JavaScript calisan UCUNCU sayfasi
 *
 * Digerleri /harita (MapLibre) ve /gunluk (IndexedDB). Karar spec 2'de:
 * takip isigi requestAnimationFrame ister, 6236 ayet sayfasinda CSP gevsetmek
 * bu ozelligin karsiligi degil. Ayet sayfasi buraya duz bir bag verir
 * (/dinle/2#ayet-2-255) ve kendi <audio controls> etiketini korur.
 *
 * ## Damga sayfaya gomulu
 *
 * Sure basina ortalama 4,2 KB. Agdan cekilmedigi icin CSP'de `connect-src`
 * kapali kaldi.
 */

export function getStaticPaths() {
  return getSurahsIndex().surahs.map((surah) => ({
    params: { surah: String(surah.id) },
    props: { surahId: surah.id },
  }));
}

/**
 * Ontanimli meal. Plan 05 bu mealin sesini de uretecek; metni simdiden ayni
 * kaynaktan (getSurahTranslation) okuyoruz ki o zaman degistirmek gerekmesin —
 * dipnot numaralari yalniz orada var.
 */
const MEAL_SLUG = "mehmet-okuyan";

const { surahId } = Astro.props;
const surah = getSurahDetail(surahId);
const segments = getSurahSegments(surahId);
const mealByVerse = new Map(
  (getSurahTranslation(MEAL_SLUG, surahId)?.verses ?? []).map((v) => [v.verseNumber, v]),
);

const verses = surah.verses.map((verse) => {
  const key = `${String(surahId)}:${String(verse.verseNumber)}`;
  const audio = getVerseAudio(surahId, verse.verseNumber);
  const meal = mealByVerse.get(verse.verseNumber);
  return {
    key,
    verseNumber: verse.verseNumber,
    words: getVerseWords(surahId, verse.verseNumber)?.words ?? [],
    translation: meal?.text ?? null,
    footnoteNumbers: (meal?.footnotes ?? []).map((f) => f.number),
    audioUrl: audio[0]?.url ?? null,
    label: `${surah.nameTr} suresi, ${String(verse.verseNumber)}. ayet`,
  };
});

const reciter = getVerseAudio(surahId, 1)[0]?.reciter ?? null;

/** Tarayiciya gomulen veri: yalniz bu surenin damgasi ve ses adresleri. */
const islandData = {
  surahId,
  reciterSlug: reciter?.slug ?? null,
  verses: verses.map((v) => ({
    key: v.key,
    url: v.audioUrl,
    starts: segments?.reciters[reciter?.slug ?? ""]?.[v.key] ?? null,
  })),
};
---

<Base
  title={`${surah.nameTr} suresini dinle — Kur'an-ı Kerim Keşfi`}
  description={`${surah.nameTr} suresi ${reciter?.name ?? "kıraat"} okuyuşuyla; okunan kelime metin üstünde işaretlenir.`}
>
  <main class="dinle">
    <header class="dinle-bas">
      <h1>{surah.nameTr} suresini dinle</h1>
      {
        reciter !== null && (
          <p class="dinle-kari">
            {reciter.name} — {STYLE_LABEL[reciter.style]}
          </p>
        )
      }
      <p class="dinle-not">
        Okunan kelime metin üstünde işaretlenir. Betik çalışmazsa her ayetin
        altındaki oynatıcı yine çalışır.
      </p>
      <a href={`/${String(surahId)}`}>Sure sayfasına dön</a>
    </header>

    <div class="dinle-liste">
      {verses.map((verse) => <DinleAyet {...verse} />)}
    </div>

    <script
      type="application/json"
      id="dinle-veri"
      is:inline
      set:html={JSON.stringify(islandData)}
    />
  </main>
</Base>
```

- [ ] **Adım 4: Okuyucu adlarını doğrula**

Çalıştır: `grep -n "^export function\|^export const get" apps/web/src/lib/data.ts`
Beklenen: `getSurahDetail`, `getSurahsIndex`, `getVerseWords`,
`getSurahTranslation`, `splitFootnoteMarkers` var.

`getSurahTranslation`ın döndürdüğü şekil `{ verses: { verseNumber, text,
footnotes: { number, text }[] }[] }` olmalı (`staticSurahTranslation`,
`packages/schema/src/static_data.ts`). Farklıysa gerçek şemaya uydur —
`apps/web/src/components/SurahReading.astro` bu veriyi zaten kullanıyor,
oradan kopyala.

`mehmet-okuyan` mealinin build çıktısında gerçekten durduğunu doğrula —
`getSurahTranslation`ın hangi dosyayı okuduğu `data.ts` içinde yazıyor:

```bash
grep -n -A6 "getSurahTranslation" apps/web/src/lib/data.ts
ls apps/web/public/data | head -20
```

Beklenen: işlevin okuduğu dizinde `mehmet-okuyan` dosyası var. Yoksa önce
`pnpm build:data` çalıştır.

- [ ] **Adım 5: Stilleri ekle**

`apps/web/src/styles/global.css` "Bileşenler" bölümüne:

```css
/* Dinleme sayfasi — plan 04. Isik rengi kontrast icin metin degil ZEMIN
   degistirir; hareke ve sedde renk degisiminde okunmaz hale geliyordu. */
.dinle-liste { display: grid; gap: 1.5rem; }
.dinle-ayet { border-top: 1px solid var(--cizgi); padding-top: 1rem; scroll-margin-top: 6rem; }
.dinle-ayet-bas { display: flex; justify-content: space-between; align-items: baseline; font-size: 0.85rem; }
.dinle-arapca { font-size: 1.6rem; line-height: 2.1; margin: 0.5rem 0; }
.dinle-kelime { border-radius: 0.2rem; transition: background-color 120ms linear; }
.dinle-kelime.is-active { background-color: var(--vurgu-zemin); }
.dinle-meal { color: var(--metin-ikincil); margin: 0.5rem 0; }
.dinle-ayet.is-playing { background-color: var(--satir-zemin); }
.dinle-yedek-oynatici { width: 100%; max-width: 30rem; }
/* Betik acilinca yedek oynaticilar gizlenir; app.ts govdeye bu sinifi koyar. */
.dinle-js .dinle-yedek-oynatici { display: none; }

@media (prefers-reduced-motion: reduce) {
  .dinle-kelime { transition: none; }
}
```

`--vurgu-zemin`, `--satir-zemin`, `--cizgi`, `--metin-ikincil` değişkenleri
yoksa dosyadaki mevcut değişken adlarını kullan (`grep -n "^  --" global.css`).

- [ ] **Adım 6: Sayfayı derle ve gözle bak**

```bash
pnpm build:web
grep -c "dinle-kelime" apps/web/dist/dinle/2.html
python3 -c "
import re,json
h=open('apps/web/dist/dinle/1.html').read()
m=re.search(r'id=\"dinle-veri\"[^>]*>(.*?)</script>', h, re.S)
d=json.loads(m.group(1)); print(d['reciterSlug'], len(d['verses']), d['verses'][0]['starts'][:4])"
```
Beklenen: Bakara sayfasında binlerce `dinle-kelime`; Fatiha verisinde
`alafasy 7 [0, 580, 1409, 2502]`

- [ ] **Adım 7: İşle**

```bash
git add apps/web/src/lib/dinle/data.ts apps/web/src/lib/data.ts \
        apps/web/src/components/DinleAyet.astro \
        apps/web/src/pages/dinle/ apps/web/src/styles/global.css
git commit -m "feat(ses): betiksiz calisan /dinle/<sure> sayfasi"
```

---

### Görev 6: Oynatıcı ve takip ışığı (tarayıcı)

**Dosyalar:**
- Oluştur: `apps/web/src/lib/dinle/app.ts`
- Değiştir: `apps/web/src/pages/dinle/[surah].astro` (oynatıcı çubuğu + `<script>`)
- Değiştir: `apps/web/src/styles/global.css` (`.dinle-cubuk`)

**Arayüzler:**
- Tüketir: `activeWordIndex` (Görev 4), `#dinle-veri` JSON (Görev 5)
- Üretir: yok (sayfa içi)

- [ ] **Adım 1: Oynatıcı çubuğunu sayfaya ekle**

`[surah].astro` içinde `<div class="dinle-liste">`in ÜSTÜNE:

```astro
    <div class="dinle-cubuk" hidden id="dinle-cubuk">
      <button type="button" id="dinle-oynat" class="dinle-dugme">Oynat</button>
      <button type="button" id="dinle-geri" class="dinle-dugme">Önceki ayet</button>
      <button type="button" id="dinle-ileri" class="dinle-dugme">Sonraki ayet</button>
      <label class="dinle-secim">
        Hız
        <select id="dinle-hiz">
          <option value="0.75">0,75×</option>
          <option value="1" selected>1×</option>
          <option value="1.25">1,25×</option>
        </select>
      </label>
      <label class="dinle-secim">
        <input type="checkbox" id="dinle-tekrar" /> Bu ayeti tekrarla
      </label>
      <label class="dinle-secim">
        <input type="checkbox" id="dinle-kaydir" checked /> Otomatik kaydır
      </label>
      <output id="dinle-durum" class="dinle-durum" aria-live="polite"></output>
    </div>
```

Sayfanın en altına, gömülü JSON'dan SONRA:

```astro
<script>
  import "~/lib/dinle/app";
</script>
```

- [ ] **Adım 2: Adayı yaz**

`apps/web/src/lib/dinle/app.ts`:

```ts
import { activeWordIndex } from "./timeline";

/**
 * Dinleme sayfasi adasi — plan 04, Gorev 6.
 *
 * ## Neden requestAnimationFrame, neden timeupdate degil
 *
 * `timeupdate` saniyede ~4 kez tetikleniyor; kelimeler 300-800 ms suruyor,
 * isik gorunur sekilde geç yaniyordu. rAF ekran yenilemesine baglanir ve
 * sekme arka plana dustugunde tarayici kendisi durdurur.
 *
 * ## Neden tek <audio>
 *
 * Ayet basina ayri etiket, sure boyunca surekli calmayi imkansiz kiliyordu
 * (BACKLOG "sure boyunca surekli calma yok"). Tek etiketin `src`i degisiyor.
 * `preload` degeri "none": sayfa acilinca 286 dosya indirmesin.
 *
 * ## Betik calismazsa
 *
 * Bu dosya hic calismaz; ayet basina duran `<audio controls>` etiketleri
 * gorunur kalir ve calisir. Ada acildiginda govdeye `dinle-js` sinifi konur,
 * yedek oynaticilar CSS ile gizlenir.
 */

interface IslandVerse {
  key: string;
  url: string | null;
  starts: number[] | null;
}

interface IslandData {
  surahId: number;
  reciterSlug: string | null;
  verses: IslandVerse[];
}

function readData(): IslandData | null {
  const node = document.getElementById("dinle-veri");
  if (!node?.textContent) return null;
  try {
    return JSON.parse(node.textContent) as IslandData;
  } catch {
    return null;
  }
}

const data = readData();
const bar = document.getElementById("dinle-cubuk");
if (data && bar) {
  const playable = data.verses.filter((v) => v.url !== null);
  if (playable.length > 0) {
    document.body.classList.add("dinle-js");
    bar.hidden = false;
    start(data, playable, bar);
  }
}

function start(data: IslandData, playable: IslandVerse[], bar: HTMLElement): void {
  const audio = new Audio();
  audio.preload = "none";

  const playButton = document.getElementById("dinle-oynat") as HTMLButtonElement;
  const prevButton = document.getElementById("dinle-geri") as HTMLButtonElement;
  const nextButton = document.getElementById("dinle-ileri") as HTMLButtonElement;
  const speed = document.getElementById("dinle-hiz") as HTMLSelectElement;
  const repeat = document.getElementById("dinle-tekrar") as HTMLInputElement;
  const follow = document.getElementById("dinle-kaydir") as HTMLInputElement;
  const status = document.getElementById("dinle-durum") as HTMLOutputElement;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let current = 0;
  let activeVerseNode: HTMLElement | null = null;
  let activeWordNode: HTMLElement | null = null;
  let frame = 0;

  function verseNode(key: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[data-verse="${key}"]`);
  }

  function clearWord(): void {
    activeWordNode?.classList.remove("is-active");
    activeWordNode = null;
  }

  function setVerse(index: number, autoplay: boolean): void {
    current = Math.max(0, Math.min(index, playable.length - 1));
    const verse = playable[current];
    clearWord();
    activeVerseNode?.classList.remove("is-playing");
    activeVerseNode = verseNode(verse.key);
    activeVerseNode?.classList.add("is-playing");
    status.textContent = `${verse.key} çalıyor`;
    if (verse.url !== null) audio.src = verse.url;
    audio.playbackRate = Number(speed.value);
    if (follow.checked && activeVerseNode) {
      activeVerseNode.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    }
    if (autoplay) void audio.play();
  }

  function tick(): void {
    const verse = playable[current];
    if (verse.starts && activeVerseNode) {
      const index = activeWordIndex(verse.starts, audio.currentTime * 1000);
      if (index >= 0) {
        const node = activeVerseNode.querySelector<HTMLElement>(`.dinle-kelime[data-i="${String(index)}"]`);
        if (node !== activeWordNode) {
          clearWord();
          node?.classList.add("is-active");
          activeWordNode = node;
        }
      } else {
        clearWord();
      }
    }
    frame = requestAnimationFrame(tick);
  }

  audio.addEventListener("play", () => {
    playButton.textContent = "Duraklat";
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
  });
  audio.addEventListener("pause", () => {
    playButton.textContent = "Oynat";
    cancelAnimationFrame(frame);
  });
  audio.addEventListener("ended", () => {
    clearWord();
    if (repeat.checked) {
      audio.currentTime = 0;
      void audio.play();
      return;
    }
    if (current + 1 < playable.length) setVerse(current + 1, true);
    else {
      activeVerseNode?.classList.remove("is-playing");
      status.textContent = "Sure bitti";
    }
  });
  audio.addEventListener("error", () => {
    // Sessiz kirilma olmasin: hangi ayetin calmadigi yazilir.
    status.textContent = `${playable[current].key} çalınamadı`;
  });

  playButton.addEventListener("click", () => {
    if (audio.paused) {
      if (audio.src === "") setVerse(current, true);
      else void audio.play();
    } else audio.pause();
  });
  prevButton.addEventListener("click", () => setVerse(current - 1, !audio.paused));
  nextButton.addEventListener("click", () => setVerse(current + 1, !audio.paused));
  speed.addEventListener("change", () => {
    audio.playbackRate = Number(speed.value);
  });

  // Ayete tiklayinca oradan baslar.
  for (const [index, verse] of playable.entries()) {
    verseNode(verse.key)?.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("a, audio")) return;
      setVerse(index, true);
    });
  }

  // /dinle/2#ayet-2-255 ile derin bag.
  const hash = window.location.hash.replace("#ayet-", "").replace("-", ":");
  const deep = playable.findIndex((v) => v.key === hash);
  setVerse(deep >= 0 ? deep : 0, false);
}
```

- [ ] **Adım 3: Stilleri ekle**

```css
.dinle-cubuk {
  position: sticky; top: 0; z-index: 5;
  display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;
  padding: 0.75rem; margin-bottom: 1rem;
  background: var(--zemin); border-bottom: 1px solid var(--cizgi);
}
.dinle-secim { display: inline-flex; gap: 0.35rem; align-items: center; font-size: 0.9rem; }
.dinle-durum { font-size: 0.85rem; color: var(--metin-ikincil); margin-inline-start: auto; }
```

- [ ] **Adım 4: Derle ve tarayıcıda dene**

```bash
pnpm build:web
pnpm --filter @kuran/web preview &
sleep 3
curl -s http://127.0.0.1:4321/dinle/1 | grep -o '_astro/[a-zA-Z0-9._-]*\.js' | head -3
```
Beklenen: en az bir `_astro/*.js` bağlantısı (ada paketlendi).

Elle denetim listesi (`http://127.0.0.1:4321/dinle/1`):
- Oynat'a basınca Fatiha 1:1 çalar ve kelimeler sırayla ışıklanır.
- Ayet bitince 1:2'ye kendiliğinden geçer.
- "Bu ayeti tekrarla" işaretliyken aynı ayet döner.
- Bir ayete tıklayınca oradan başlar.
- `/dinle/1#ayet-1-5` açılışta 1:5'i seçer.
- Betiği kapatınca (DevTools → Disable JavaScript) ayet altındaki oynatıcılar
  görünür ve çalar.

- [ ] **Adım 5: Tip denetimi**

Çalıştır: `pnpm typecheck`
Beklenen: hatasız

- [ ] **Adım 6: İşle**

```bash
git add apps/web/src/lib/dinle/app.ts apps/web/src/pages/dinle/ apps/web/src/styles/global.css
git commit -m "feat(ses): kesintisiz oynatici ve kelime takip isigi"
```

---

### Görev 7: CSP dalı ve yayın

**Bu görev canlı sunucuyu değiştirir. Adımlar sırayla uygulanmalı; nginx
yapılandırması geçersizken reload edilirse site kapanır.**

**Dosyalar:**
- Değiştir: `infra/nginx/kurankesfi.tr.conf`
- Değiştir: `/www/server/panel/vhost/nginx/kurankesfi.tr.conf` (aynı içerik)

- [ ] **Adım 1: Depodaki yapılandırmaya dalı ekle**

`infra/nginx/kurankesfi.tr.conf` içinde `~^/kissa/` satırının ALTINA:

```nginx
    # Dinleme sayfalari (/dinle/<sure>). Sitenin JS calisan UCUNCU yeri.
    # Acilan TEK yetki:
    #   script-src 'self'   oynatici + takip isigi; kendi sunucumuzdan, CDN yok
    # connect-src ACILMADI: kelime zaman damgasi sayfaya GOMULU geliyor
    # (sure basina ~4 KB), agdan cekilmiyor. media-src zaten
    # medya.kurankesfi.tr'ye acikti — ayet MP3'leri oradan caliyor.
    # 'unsafe-inline' ve 'unsafe-eval' ACILMADI. 6236 ayet sayfasinda betik
    # hala KAPALI; oradan buraya duz bir bag var (/dinle/2#ayet-2-255).
    ~^/dinle/  "default-src 'none'; script-src 'self'; img-src 'self' data: https://medya.kurankesfi.tr; media-src 'self' https://medya.kurankesfi.tr; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'none'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
```

- [ ] **Adım 2: Canlı dosyaya kopyala ve DOĞRULA**

İki dosya bugün birebir aynı; öyle kalmalı.

```bash
cp /opt/kuran/infra/nginx/kurankesfi.tr.conf /www/server/panel/vhost/nginx/kurankesfi.tr.conf
/www/server/nginx/sbin/nginx -t
```
Beklenen: `syntax is ok` ve `test is successful`. **Başarısızsa reload ETME**,
önceki içeriği geri koy.

- [ ] **Adım 3: Yayınla**

```bash
pnpm build && pnpm deploy && pnpm deploy:smoke
```

- [ ] **Adım 4: Başlığı ölç**

```bash
curl -sI https://kurankesfi.tr/dinle/1 | grep -i content-security-policy
curl -sI https://kurankesfi.tr/2/255 | grep -i content-security-policy
```
Beklenen: birincide `script-src 'self'`, ikincide `script-src` YOK.

```bash
curl -s https://kurankesfi.tr/dinle/1 | grep -c "dinle-kelime"
```
Beklenen: 0'dan büyük.

- [ ] **Adım 5: İşle**

```bash
git add infra/nginx/kurankesfi.tr.conf
git commit -m "feat(ses): /dinle sayfalari icin script-src 'self' dali"
```

---

### Görev 8: Bağlantılar ve belge devri

**Dosyalar:**
- Değiştir: `apps/web/src/pages/[surah].astro`
- Değiştir: `apps/web/src/pages/[surah]/[verse].astro`
- Değiştir: `docs/DURUM.md`
- Değiştir: `docs/BACKLOG.md`
- Değiştir: `CLAUDE.md`

- [ ] **Adım 1: Sure sayfasına bağlantı**

`apps/web/src/pages/[surah].astro` başlık bölümüne:

```astro
<a href={`/dinle/${String(surahId)}`} class="dinle-bag">
  Bu sureyi dinle — okunan kelime işaretlenir
</a>
```

- [ ] **Adım 2: Ayet sayfasına bağlantı**

`[verse].astro` içinde `verse-audio` bloğunun altına:

```astro
<p class="verse-audio-not">
  <a href={`/dinle/${String(surahId)}#ayet-${String(surahId)}-${String(verseNumber)}`}>
    Sureyi kesintisiz dinle, okunan kelime işaretlensin
  </a>
</p>
```

- [ ] **Adım 3: `docs/DURUM.md`ye bölüm ekle**

Kıraat tablosunun altına:

```markdown
### Kelime takip ışığı (2026-09-07)

| Konu | Yer |
|---|---|
| İndirme | `scripts/media/fetch_segments.ts` · `pnpm media:segments` |
| Kaynak | Quran.com QDC — `api.qurancdn.com/api/qdc/audio/reciters/7/audio_files?segments=true` |
| Onarım | `packages/pipeline/src/segments.ts` (saf, testli) |
| Veri | `data/recitation/segments_alafasy.json` (script ÜRETİR) |
| Çıktı | `apps/web/public/data/ses/segment_<sure>.json` (114 dosya) |
| Sayfa | `apps/web/src/pages/dinle/[surah].astro` |
| Ada | `apps/web/src/lib/dinle/app.ts` |
| CSP | `~^/dinle/` dalı — `script-src 'self'`, `connect-src 'none'` |

**"QUL'da segments.json boştu" tespiti eskidi.** QDC ucu 6236 ayetin hepsinde
kelime damgası veriyor. Elimizdeki ayet MP3'leri aynı kayıttan kesilmiş:
300 ayetlik örneklemde süre farkı medyan 2 ms, p95 6 ms. Sure MP3'ü
indirilmedi.

**Ölçülen onarım:** 247 / 77.429 kelimenin (%0,32) damgası yok, komşulardan
aradeğerlendi. 215 ayette ilk damga ayet başından 500 ms'den fazla önce
başlıyordu (bozuk), atıldı. 1 ayette (37:130) kaynak indisi kelime sayısını
aşıyordu, kırpıldı. Linter her build'de damga sayısı = kelime sayısı + 1
eşitliğini denetler.
```

- [ ] **Adım 4: `docs/BACKLOG.md` kıraat maddelerini güncelle**

- "Sure boyunca sürekli çalma yok" maddesini **KAPAT**: `/dinle/<sure>` tek
  `<audio>` ile ayetten ayete geçiyor. Ayet sayfaları hâlâ betiksiz.
- "Kârî seçimi kalıcı değil" maddesi AÇIK kalır.
- Yeni açık madde: **el-Husarî damgası hazır** — `pnpm media:segments --reciter husary`
  yeterli, QDC kimliği 6.

- [ ] **Adım 5: `CLAUDE.md` JS kuralını güncelle**

135. satırdaki "JavaScript 0 bayt" kuralına üçüncü istisnayı ekle:

```markdown
- **JavaScript 0 bayt.** Sunucu CSP'si `default-src 'none'`. Üç istisna, üçü de
  tek sayfa: `/harita` (MapLibre), `/gunluk` (IndexedDB), `/dinle/<sure>`
  (takip ışığı). 6236 ayet sayfası betiksizdir ve öyle kalır.
```

- [ ] **Adım 6: Bütün denetimler**

```bash
pnpm typecheck && pnpm test && pnpm build && pnpm lint:refs
```
Beklenen: hepsi hatasız

- [ ] **Adım 7: İşle ve yayınla**

```bash
git add apps/web/src/pages docs CLAUDE.md
git commit -m "docs(ses): takip isigi devri, baglantilar ve backlog guncellemesi"
pnpm deploy && pnpm deploy:smoke
```

---

## Bitiş ölçütü

- `https://kurankesfi.tr/dinle/2` açılıyor, Oynat'a basınca Bakara kesintisiz
  çalıyor ve okunan kelime ışıklanıyor.
- `curl -sI .../2/255` çıktısında `script-src` YOK.
- `pnpm test` içinde `segments.smoke` ve `timeline.smoke` geçiyor.
- `pnpm lint:refs` damga sayısını denetliyor ve temiz.
- `docs/DURUM.md` ölçülen sayıları taşıyor.
