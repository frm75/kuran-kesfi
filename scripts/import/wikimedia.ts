import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchCached, info, fail, repoRoot, Report, warn } from "@kuran/pipeline";
import { mediaFile } from "@kuran/schema";

/**
 * Wikimedia Commons lisans ve kunye cekimi.
 *
 * ============================================================================
 * NEDEN BU SCRIPT VAR — LISANS TAHMIN EDILMEZ
 * ============================================================================
 *
 * Spec 34 ve 39 acik: bir gorseli kullanmadan once DOSYANIN KENDI lisansina
 * bakilir. Kategori sayfasindaki genel ifadeye ya da spec'te yazan dosya adina
 * guvenilmez. Iki sey bunu dogruladi:
 *
 *   - Spec 35 "Cudi Dagi panorama.jpg" diyor; Commons'taki dosyanin adi
 *     "Cudi Dagi panaroma.jpg" (kaynakta yazim hatasi var). Elle kopyalansa
 *     kayit sessizce bos kalirdi.
 *   - Ayni kategorideki dosyalar farkli lisanslarda olabiliyor.
 *
 * Bu yuzden lisans, yazar, tarih ve olculer API'den cekilir ve
 * `data/media/media_*.json` icine YAZILIR. Site build'i Commons'a baglanmaz
 * (CLAUDE.md kural 5); bu script tek seferliktir, `data:elevation` ile ayni
 * desendedir.
 *
 * ============================================================================
 * ESLESTIREMEDIGIMIZ LISANS = UNKNOWN, SESSIZ DEGIL
 * ============================================================================
 *
 * Commons'un makine okunur `License` alani bizim sekiz degerli enum'umuzdan
 * daha zengindir (cc-by-nc-sa-3.0, pd-old-70, gfdl...). Eslestiremedigimiz
 * her deger `UNKNOWN` olur — yani dosya INDIRILMEZ, yalnizca baglanti verilir —
 * ve ham etiket `licenseRaw` icinde durur, rapora da yazilir. Karar insana
 * kalir; kod uydurmaz.
 *
 * ============================================================================
 * KULLANIM
 * ============================================================================
 *
 *   pnpm data:wikimedia                       eksik kunyeleri doldurur
 *   pnpm data:wikimedia --force               hepsini yeniden ceker
 *   pnpm data:wikimedia --category "Mount Cudi"   kategoriyi listeler (yazim yardimi)
 */

const API = "https://commons.wikimedia.org/w/api.php";
const mediaDir = resolve(repoRoot, "data/media");

const args = process.argv.slice(2);
const force = args.includes("--force");
const categoryIndex = args.indexOf("--category");
const category = categoryIndex >= 0 ? args[categoryIndex + 1] : undefined;

// --- Commons API -------------------------------------------------------------

interface ExtMetadataValue {
  value?: string;
}

interface ImageInfo {
  width?: number;
  height?: number;
  url?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, ExtMetadataValue>;
}

interface QueryResponse {
  query?: {
    pages?: Record<string, { title?: string; missing?: string; imageinfo?: ImageInfo[] }>;
    categorymembers?: { title: string }[];
  };
}

async function api(params: Record<string, string>, cacheName: string): Promise<QueryResponse> {
  const url = `${API}?${new URLSearchParams({ format: "json", ...params }).toString()}`;
  return JSON.parse(await fetchCached(url, { cacheName, force })) as QueryResponse;
}

/** "https://commons.wikimedia.org/wiki/File:X_y.jpg" -> "File:X y.jpg" */
function commonsTitleOf(sourceUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (parsed.hostname !== "commons.wikimedia.org") return null;
  const match = /^\/wiki\/(File:.+)$/.exec(parsed.pathname);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1]).replace(/_/g, " ");
}

// --- Lisans eslestirmesi -----------------------------------------------------

/**
 * Commons'un makine okunur `License` degerini bizim enum'a indirger.
 *
 * SIRA ONEMLI: "cc-by-nc-sa" once bakilir, yoksa "cc-by" onu yakalar ve
 * ticari-olmayan kisiti kaybolur. Eslesmeyen deger UNKNOWN doner.
 */
function mapLicense(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v === "") return "UNKNOWN";
  if (v.startsWith("cc0") || v.startsWith("cc-zero")) return "CC0";
  if (v.startsWith("pd") || v.includes("public domain")) return "PUBLIC_DOMAIN";
  // NC once: cc-by-nc-sa ve cc-by-nc, cc-by-sa'dan ayrilmali
  if (v.startsWith("cc-by-nc")) return "CC_BY_NC";
  if (v.startsWith("cc-by-sa")) return "CC_BY_SA";
  if (v.startsWith("cc-by")) return "CC_BY";
  if (v.includes("fair") || v.includes("non-free")) return "COPYRIGHT";
  return "UNKNOWN";
}

/**
 * Commons `imageinfo.url` alani utm_source/utm_campaign/utm_content parametreleri
 * ekliyor. Projede takip yoktur (plan 1.3); sorgu dizesi atilir. Ayrica bu URL
 * veri dosyasinda kalici olarak duruyor — takip parametresini kaydetmek onu
 * kalicilastirmak olurdu.
 */
function withoutTracking(url: string | undefined): string | null {
  if (url === undefined) return null;
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString();
  } catch {
    return url;
  }
}

/** extmetadata degerleri HTML tasir; kartta duz metin gosterecegiz. */
function plain(html: string | undefined): string | null {
  if (html === undefined) return null;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text === "" ? null : text;
}

// --- Kategori listeleme (yazim yardimi) --------------------------------------

if (category !== undefined) {
  const res = await api(
    {
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmtype: "file",
      cmlimit: "100",
    },
    `wikimedia/cat_${category.replace(/[^A-Za-z0-9]+/g, "_")}.json`,
  );
  const members = res.query?.categorymembers ?? [];
  if (members.length === 0) fail(`Kategori bos ya da bulunamadi: ${category}`);
  info(`${String(members.length)} dosya — Category:${category}`);
  for (const m of members) {
    const detail = await api(
      {
        action: "query",
        prop: "imageinfo",
        iiprop: "extmetadata|url|size",
        titles: m.title,
      },
      `wikimedia/file_${m.title.replace(/[^A-Za-z0-9]+/g, "_")}.json`,
    );
    const page = Object.values(detail.query?.pages ?? {})[0];
    const meta = page?.imageinfo?.[0]?.extmetadata ?? {};
    const rawLicense = meta["License"]?.value ?? "";
    const size = page?.imageinfo?.[0];
    console.log(
      `  ${mapLicense(rawLicense).padEnd(14)} ${String(rawLicense).padEnd(18)} ` +
        `${String(size?.width ?? "?")}x${String(size?.height ?? "?")}  ${m.title}`,
    );
  }
  process.exit(0);
}

// --- Kunye doldurma ----------------------------------------------------------

interface MediaItem {
  id: string;
  title: string;
  sourceUrl: string;
  originalUrl: string | null;
  author: string | null;
  date: string | null;
  license: string;
  licenseRaw: string | null;
  licenseUrl: string | null;
  copyright: string | null;
  width: number | null;
  height: number | null;
  [k: string]: unknown;
}

const files = readdirSync(mediaDir)
  .filter((f) => f.startsWith("media_") && f.endsWith(".json"))
  .sort();

if (files.length === 0) fail(`data/media/ altinda media_*.json yok`);

const report = new Report("wikimedia");
let filled = 0;
let skipped = 0;
let foreign = 0;

for (const file of files) {
  const path = resolve(mediaDir, file);
  const doc = JSON.parse(readFileSync(path, "utf8")) as {
    "//"?: string[];
    place: string | null;
    note: string | null;
    items: MediaItem[];
  };

  for (const item of doc.items) {
    const title = commonsTitleOf(item.sourceUrl);
    if (title === null) {
      // Commons disi kaynak (UNESCO, muze, universite) — elle doldurulur
      foreign += 1;
      continue;
    }
    if (!force && item.licenseRaw !== null) {
      skipped += 1;
      continue;
    }

    const res = await api(
      { action: "query", prop: "imageinfo", iiprop: "extmetadata|url|size", titles: title },
      `wikimedia/file_${title.replace(/[^A-Za-z0-9]+/g, "_")}.json`,
    );
    const page = Object.values(res.query?.pages ?? {})[0];
    if (page === undefined || page.missing !== undefined) {
      report.issue(`${item.id}: Commons'ta bulunamadi — ${title}`);
      continue;
    }
    const inf = page.imageinfo?.[0];
    if (inf === undefined) {
      report.issue(`${item.id}: imageinfo bos — ${title}`);
      continue;
    }
    const meta = inf.extmetadata ?? {};
    const rawLicense = meta["License"]?.value ?? "";
    const mapped = mapLicense(rawLicense);

    item.licenseRaw = rawLicense === "" ? null : rawLicense;
    item.license = mapped;
    item.licenseUrl = meta["LicenseUrl"]?.value ?? null;
    item.author = plain(meta["Artist"]?.value);
    item.date = plain(meta["DateTimeOriginal"]?.value) ?? plain(meta["DateTime"]?.value);
    item.originalUrl = withoutTracking(inf.url);
    item.width = inf.width ?? null;
    item.height = inf.height ?? null;

    // Atif metni: lisansin istedigi sekilde — yazar + lisans kisa adi.
    const shortName = plain(meta["LicenseShortName"]?.value);
    const credit = plain(meta["Credit"]?.value);
    const parts = [item.author, credit, shortName].filter((p): p is string => p !== null);
    item.copyright = parts.length > 0 ? parts.join(" · ") : null;

    if (mapped === "UNKNOWN") {
      report.issue(
        `${item.id}: lisans eslestirilemedi ("${rawLicense}") — indirilmeyecek, ` +
          `yalnizca baglanti verilecek. licenseRaw'a yazildi.`,
      );
    } else {
      report.note(`${item.id}: ${mapped} (${rawLicense})`);
    }
    filled += 1;
    info(`${item.id.padEnd(34)} ${mapped.padEnd(14)} ${String(inf.width ?? "?")}px`);
  }

  // Sema dogrulamasi: lisans kapisi burada da isler — kisitli lisansli bir
  // kayda localPath yazilmis olsaydi yazma islemi yapilmadan durur.
  const parsed = mediaFile.safeParse(doc);
  if (!parsed.success) {
    fail(`${file} sema dogrulamasindan gecmedi:\n${JSON.stringify(parsed.error.issues, null, 2)}`);
  }

  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", "utf8");
}

const reportPath = report.write();
info(`${String(filled)} dolduruldu · ${String(skipped)} atlandi · ${String(foreign)} Commons disi`);
info(`rapor: ${reportPath}`);
if (report.issues > 0) {
  warn(`${String(report.issues)} kayit elle bakilmali (lisans eslestirilemedi ya da dosya yok).`);
}
