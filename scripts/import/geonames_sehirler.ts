import { execFileSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { env, fail, info, repoRoot } from "@kuran/pipeline";

/**
 * GeoNames sehir listesi (namaz vakitleri icin).
 *
 * TR.zip      -> PPLA (80) + Ankara (PPLC) = 81 il merkezi + PPLA2 (ilce merkezi)
 * cities15000 -> PPLC (dunya baskentleri; Turkiye'nin baskenti TR'den gelir).
 * Baskent/ulke adlari alternateNamesV2'den Turkce (tr) alinir: "Londra, Birlesik Krallik".
 *
 * Ham zip'ler cache/geonames/ altina iner (tek seferlik). Cikti:
 * apps/web/public/ibadet/sehirler.json. Kaynak: GeoNames, CC BY 4.0.
 * Siralama: il merkezleri, baskentler, ilceler (arama bu sirayi korur).
 */

const BASE = "https://download.geonames.org/export/dump";
const dir = resolve(env.cacheDir, "geonames");
mkdirSync(dir, { recursive: true });

async function indir(dosya: string): Promise<string> {
  const yol = resolve(dir, dosya);
  if (!existsSync(yol)) {
    const r = await fetch(`${BASE}/${dosya}`, {
      headers: { "user-agent": "kurankesfi.tr import (https://kurankesfi.tr)" },
    });
    if (!r.ok) fail(`${dosya} -> HTTP ${r.status}`);
    writeFileSync(yol, Buffer.from(await r.arrayBuffer()));
  }
  return yol;
}

const satirlar = (metin: string): string[][] =>
  metin.split("\n").filter((l) => l !== "" && !l.startsWith("#")).map((l) => l.split("\t"));

async function oku(zip: string, txt: string): Promise<string[][]> {
  const yol = await indir(zip);
  return satirlar(execFileSync("unzip", ["-p", yol, txt], { maxBuffer: 1 << 29 }).toString("utf8"));
}

/** alternateNamesV2 akitilir (~600 MB acik hali); yalniz istenen id'lerin tr adlari tutulur. */
async function trAdlari(ids: Set<string>): Promise<Map<string, string>> {
  const yol = await indir("alternateNamesV2.zip");
  const sonuc = new Map<string, { ad: string; tercih: boolean }>();
  const p = spawn("unzip", ["-p", yol, "alternateNamesV2.txt"], { stdio: ["ignore", "pipe", "inherit"] });
  for await (const satir of createInterface({ input: p.stdout })) {
    const c = satir.split("\t");
    if (c[2] !== "tr" || !ids.has(c[1]!)) continue;
    if (c[6] === "1" || c[7] === "1") continue; // gundelik / tarihi ad degil
    const tercih = c[4] === "1";
    const onceki = sonuc.get(c[1]!);
    if (onceki === undefined || (tercih && !onceki.tercih)) sonuc.set(c[1]!, { ad: c[3]!, tercih });
  }
  return new Map([...sonuc].map(([k, v]) => [k, v.ad]));
}

// GeoNames kolonlari: 1 name, 4 lat, 5 lon, 7 feature code, 8 country, 10 admin1, 17 timezone
const yuvarla = (s: string): number => Math.round(Number(s) * 1e4) / 1e4;

const tr = await oku("TR.zip", "TR.txt");
const dunya = await oku("cities15000.zip", "cities15000.txt");
const ulkeBilgi = satirlar(readFileSync(await indir("countryInfo.txt"), "utf8"));
const ulkeId = new Map(ulkeBilgi.map((c) => [c[0]!, c[16]!])); // ISO -> geonameid
const ulkeEn = new Map(ulkeBilgi.map((c) => [c[0]!, c[4]!]));

// Il adi: ADM1 kaydinin Turkce adi (PPLA adi "Istanbul"/"Antakya"/"Izmit" gibi
// diacritic'siz veya sehir adi olabilir; ADM1 adi il adidir: İstanbul, Hatay, Kocaeli).
const ilAd = new Map<string, string>(); // admin1 -> il adi
for (const c of tr) if (c[7] === "ADM1") ilAd.set(c[10]!, c[1]!);

// GeoNames'te Ankara PPLC (baskent) olarak isaretli, PPLA degil: 80 PPLA + Ankara = 81 il.
const ppla = tr.filter((c) => c[7] === "PPLA");
const trBaskent = tr.filter((c) => c[7] === "PPLC");
if (ppla.length !== 80 || trBaskent.length !== 1) {
  fail(`PPLA=${ppla.length} PPLC=${trBaskent.length}; 80+1 beklenirdi`);
}
const iller = [...ppla, trBaskent[0]!];
const ilAdi = (c: string[]): string => ilAd.get(c[10]!) ?? fail(`admin1 ${c[10]} il degil`);

const konum = (c: string[], ad: string) => ({
  ad,
  enlem: yuvarla(c[4]!),
  boylam: yuvarla(c[5]!),
  saatDilimi: c[17]!,
});

const kayitlar = iller
  .map((c) => konum(c, ilAdi(c)))
  .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
if (new Set(kayitlar.map((k) => k.ad)).size !== 81) fail("il adlari 81 benzersiz degil");

const baskentHam = dunya.filter((c) => c[7] === "PPLC" && c[8] !== "TR");
const trAd = await trAdlari(new Set([...baskentHam.map((c) => c[0]!), ...baskentHam.map((c) => ulkeId.get(c[8]!)!)]));
const baskentler = baskentHam
  .map((c) => {
    const sehir = trAd.get(c[0]!) ?? c[1]!;
    const ulke = trAd.get(ulkeId.get(c[8]!)!) ?? ulkeEn.get(c[8]!) ?? c[8]!;
    return konum(c, `${sehir}, ${ulke}`);
  })
  .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
if (new Set(baskentler.map((k) => k.ad)).size !== baskentler.length) fail("baskent adlari benzersiz degil");
kayitlar.push(...baskentler);

const ilceler = tr
  .filter((c) => c[7] === "PPLA2")
  .map((c) => konum(c, `${c[1]!}, ${ilAdi(c)}`))
  .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
kayitlar.push(...ilceler);

const cikti = resolve(repoRoot, "apps/web/public/ibadet/sehirler.json");
mkdirSync(resolve(cikti, ".."), { recursive: true });
const json = JSON.stringify({ kaynak: "GeoNames, CC BY 4.0", kayitlar });
writeFileSync(cikti, json + "\n");
info(`il=${iller.length} baskent=${baskentler.length} ilce=${ilceler.length} boyut=${json.length}B`);
