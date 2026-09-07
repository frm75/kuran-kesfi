import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Report, fail, info, repoRoot, warn } from "@kuran/pipeline";

/**
 * Arapca kiraat (ses) indirici — plan 2.4, 6 "Faz 4 — Gunluk, PWA, Ses".
 *
 * ============================================================================
 * NEDEN AYET BASINA AYRI DOSYA
 * ============================================================================
 *
 * QUL'un kiraat paketi ATLANMISTI (docs/DURUM.md): yalnizca sure duzeyinde
 * MP3 adresi veriyor ve `segments.json` bos geliyordu — ayet zaman damgasi
 * olmadan "bu ayeti dinle" yapilamaz. everyayah.com ayet basina AYRI dosya
 * veriyor: zaman damgasina hic gerek kalmiyor, dosya adi ayetin kendisi.
 *
 * Bunun ikinci bir faydasi var: oynatma JAVASCRIPT ISTEMIYOR. Ayet sayfasina
 * <audio controls src="..."> koymak yetiyor. Site JS'siz kalmaya devam ediyor
 * ve ayet sayfalarindaki `default-src 'none'` CSP'si degismiyor — `media-src`
 * zaten medya.kurankesfi.tr'ye acikti (medya katmani, 2026-09-06).
 *
 * ============================================================================
 * NEDEN INDIRIYORUZ, EVERYAYAH'A BAGLANMIYORUZ
 * ============================================================================
 *
 * CLAUDE.md kural 5: uretimde ucuncu taraf bagimliligi olmaz. Sayfa dogrudan
 * everyayah.com'a baglansaydi o site kapandiginda ses sessizce olurdu ve her
 * dinleyen kullanicinin adresi ucuncu bir tarafa gitmis olurdu. Dosyalar bir
 * kez indirilip R2'ye (medya.kurankesfi.tr) cikarilir.
 *
 * ============================================================================
 * KULLANIM
 * ============================================================================
 *
 *   pnpm media:recitation                  eksikleri indirir (varsayilan: alafasy)
 *   pnpm media:recitation --reciter husary
 *   pnpm media:recitation --force          var olanlari da yeniden indirir
 *   pnpm media:recitation --dry-run        ne indirilecegini yazar
 *   pnpm media:recitation --limit 50       ilk N ayet (deneme icin)
 *
 * Sonra:  pnpm media:r2:push  ·  pnpm content:import  ·  pnpm build
 */

interface ReciterSource {
  slug: string;
  /** everyayah.com/data/<dir>/<sss><vvv>.mp3 */
  everyayahDir: string;
  name: string;
  nameAr: string;
  /** murattal = olculu/agir tempo · mucevved = makamli */
  style: "murattal" | "mucevved";
  bitrateKbps: number;
}

const RECITERS: Record<string, ReciterSource> = {
  alafasy: {
    slug: "alafasy",
    everyayahDir: "Alafasy_128kbps",
    name: "Mishary Rashid Alafasy",
    nameAr: "مشاري راشد العفاسي",
    style: "murattal",
    bitrateKbps: 128,
  },
  husary: {
    slug: "husary",
    everyayahDir: "Husary_128kbps",
    name: "Mahmûd Halîl el-Husarî",
    nameAr: "محمود خليل الحصري",
    style: "murattal",
    bitrateKbps: 128,
  },
};

/** Ayni anda kac istek. everyayah bir CDN (BunnyCDN) ama nazik davraniyoruz. */
const CONCURRENCY = 6;
const RETRIES = 3;
/** Bundan kucuk dosya sesin kendisi olamaz; yarim inmis demektir. */
const MIN_BYTES = 1024;

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
function option(name: string): string | null {
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
}

const reciterSlug = option("--reciter") ?? "alafasy";
const found = RECITERS[reciterSlug];
if (found === undefined) {
  fail(`bilinmeyen kari '${reciterSlug}'. Taninanlar: ${Object.keys(RECITERS).join(", ")}`);
}
const reciter: ReciterSource = found;

const force = flag("--force");
const dryRun = flag("--dry-run");
const limitRaw = option("--limit");
const limit = limitRaw === null ? null : Number.parseInt(limitRaw, 10);

const audioRoot = resolve(repoRoot, "media/ses", reciter.slug);
const manifestPath = resolve(repoRoot, "data/recitation", `reciter_${reciter.slug}.json`);
const surahsIndexPath = resolve(repoRoot, "apps/web/public/data/surahs_index.json");

interface SurahsIndex {
  surahs: { id: number; verseCount: number }[];
}

/** "002255" — everyayah'in dosya adi bicimi. */
function audioKey(surahId: number, verseNumber: number): string {
  return `${String(surahId).padStart(3, "0")}${String(verseNumber).padStart(3, "0")}`;
}

async function download(url: string, target: string): Promise<number> {
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "kurankesfi.tr recitation importer (+https://kurankesfi.tr)" },
      });
      if (!response.ok) {
        if (response.status === 404) return -1;
        throw new Error(`HTTP ${String(response.status)}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength < MIN_BYTES) throw new Error(`dosya cok kucuk (${String(bytes.byteLength)} B)`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      return bytes.byteLength;
    } catch (error) {
      if (attempt === RETRIES) throw error;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return -1;
}

async function main(): Promise<void> {
  const report = new Report(`kiraat indirme — ${reciter.name}`);

  if (!existsSync(surahsIndexPath)) {
    fail(`${surahsIndexPath} yok. Once 'pnpm build:data' calistirilmali.`);
  }
  const index = JSON.parse(readFileSync(surahsIndexPath, "utf8")) as SurahsIndex;

  const targets: { surahId: number; verseNumber: number; key: string; path: string }[] = [];
  for (const surah of index.surahs) {
    for (let verseNumber = 1; verseNumber <= surah.verseCount; verseNumber += 1) {
      const key = audioKey(surah.id, verseNumber);
      targets.push({
        surahId: surah.id,
        verseNumber,
        key,
        path: resolve(audioRoot, `${key}.mp3`),
      });
    }
  }
  const all = limit === null ? targets : targets.slice(0, limit);

  /*
   * Yarim inmis dosya sessiz bozukluktur: tarayici oynatmayi denerken hata
   * verir, sayfa 200 doner. Boyutu esigin altinda kalan dosya SILINIR ve
   * yeniden indirilir.
   */
  const pending = all.filter((t) => {
    if (force) return true;
    if (!existsSync(t.path)) return true;
    if (statSync(t.path).size >= MIN_BYTES) return false;
    unlinkSync(t.path);
    return true;
  });

  info(`${reciter.name}: ${all.length} ayet · ${pending.length} indirilecek · ${all.length - pending.length} zaten var`);
  if (dryRun) {
    info("--dry-run: hicbir sey indirilmedi");
    return;
  }

  const missing: string[] = [];
  let downloaded = 0;
  let failed = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const item = pending[cursor++];
      if (item === undefined) return;
      const url = `https://everyayah.com/data/${reciter.everyayahDir}/${item.key}.mp3`;
      try {
        const size = await download(url, item.path);
        if (size === -1) {
          missing.push(`${String(item.surahId)}:${String(item.verseNumber)}`);
          warn(`kiraat: ${item.key} kaynakta yok (404)`);
        } else {
          downloaded += 1;
          if (downloaded % 250 === 0) {
            info(`  ${String(downloaded)} / ${String(pending.length)} indirildi`);
          }
        }
      } catch (error) {
        failed += 1;
        warn(`kiraat: ${item.key}: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // --- kunye + kapsam dosyasi ------------------------------------------------
  // Elde duran dosyalar sayilir; "indirdim" degil "DURUYOR" yazilir.
  let bytes = 0;
  const onDisk: string[] = [];
  for (const t of all) {
    if (existsSync(t.path) && statSync(t.path).size >= MIN_BYTES) {
      bytes += statSync(t.path).size;
    } else {
      onDisk.push(`${String(t.surahId)}:${String(t.verseNumber)}`);
    }
  }

  const manifest = {
    reciters: [
      {
        slug: reciter.slug,
        name: reciter.name,
        nameAr: reciter.nameAr,
        style: reciter.style,
        bitrateKbps: reciter.bitrateKbps,
        sourceSlug: "everyayah",
        /** R2 anahtar onu: medya.kurankesfi.tr/<basePath>/<sss><vvv>.mp3 */
        basePath: `ses/${reciter.slug}`,
        verseCount: all.length - onDisk.length,
        /** Elde dosyasi OLMAYAN ayetler; arayuz bunlarda oynatici gostermez */
        missingVerses: onDisk.sort(),
        totalBytes: bytes,
      },
    ],
  };
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  info(
    `${reciter.name}: ${String(manifest.reciters[0]?.verseCount ?? 0)} / ${String(all.length)} ayet elde · ` +
      `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB · ${String(failed)} hata · ${String(missing.length)} kaynakta yok`,
  );
  report.note(
    `Kiraat ${reciter.name}: ${String(manifest.reciters[0]?.verseCount ?? 0)} / ${String(all.length)} ayet · ` +
      `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB · kaynak everyayah.com/${reciter.everyayahDir}`,
  );
  report.write();
}

await main();
