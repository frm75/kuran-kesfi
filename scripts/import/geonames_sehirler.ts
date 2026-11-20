import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { env, fail, info, repoRoot } from "@kuran/pipeline";

/**
 * GeoNames sehir listesi (namaz vakitleri icin).
 *
 * TR.zip      -> PPLA (80) + Ankara (PPLC) = 81 il merkezi + PPLA2 (ilce merkezi)
 * cities15000 -> PPLC (dunya baskentleri; Turkiye'nin baskenti TR'den gelir)
 *
 * Ham zip'ler cache/geonames/ altina iner (tek seferlik). Cikti:
 * apps/web/public/ibadet/sehirler.json. Kaynak: GeoNames, CC BY 4.0.
 * Siralama: il merkezleri, baskentler, ilceler (arama bu sirayi korur).
 */

const BASE = "https://download.geonames.org/export/dump";
const dir = resolve(env.cacheDir, "geonames");
mkdirSync(dir, { recursive: true });

async function oku(zip: string, txt: string): Promise<string[][]> {
  const yol = resolve(dir, zip);
  if (!existsSync(yol)) {
    const r = await fetch(`${BASE}/${zip}`, {
      headers: { "user-agent": "kurankesfi.tr import (https://kurankesfi.tr)" },
    });
    if (!r.ok) fail(`${zip} -> HTTP ${r.status}`);
    writeFileSync(yol, Buffer.from(await r.arrayBuffer()));
  }
  const metin = execFileSync("unzip", ["-p", yol, txt], { maxBuffer: 1 << 29 }).toString("utf8");
  return metin.split("\n").filter((l) => l !== "").map((l) => l.split("\t"));
}

// GeoNames kolonlari: 1 name, 4 lat, 5 lon, 7 feature code, 8 country, 10 admin1, 17 timezone
const yuvarla = (s: string): number => Math.round(Number(s) * 1e4) / 1e4;

const tr = await oku("TR.zip", "TR.txt");
const dunya = await oku("cities15000.zip", "cities15000.txt");

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

const baskentler = dunya
  .filter((c) => c[7] === "PPLC" && c[8] !== "TR")
  .map((c) => konum(c, c[1]!));
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
