import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
// `@kuran/pipeline` import edilince env.ts dotenv'i yukler; PUBLIC_ARCGIS_API_KEY
// bu sayede process.env icinde olur.
import { info, fail, repoRoot, warn } from "@kuran/pipeline";

/**
 * Konum yuksekliklerini Esri Elevation servisinden ceker.
 *
 * ============================================================================
 * NEDEN AYRI SCRIPT, NEDEN content:import ICINDE DEGIL
 * ============================================================================
 *
 * CLAUDE.md kural 5: "Site build'i internet gerektirmez; import scriptleri
 * ayridir." `pnpm content:import` her veri degisikliginde calisir; onu bir
 * ag servisine baglamak build'i internete bagimli kilardi.
 *
 * Bu script TEK SEFERLIKTIR: sonucu `data/locations/locations.json` icine
 * yazar, sonra herkes o dosyayi okur. Yeni konum eklenince yeniden calistirilir;
 * `elevationM` dolu olan kayitlar atlanir (`--force` hepsini yeniler).
 *
 * ============================================================================
 * NEDEN 3D ARAZI DEGIL
 * ============================================================================
 *
 * Esri Elevation servisi YALNIZCA nokta sorgusu sunar (`at-point`,
 * `at-many-points`). MapLibre'nin 3D arazisi ise `raster-dem` kaynagi ister —
 * Mapbox Terrain-RGB ya da Mapzen Terrarium bicimli KARE. Esri boyle kare
 * yayinlamiyor, dolayisiyla 3D arazi bu anahtarla kurulamaz (2026-09-06'da
 * olculdu: elevation-3d/v1/tiles ve varyantlari 404).
 *
 * Nokta yuksekligi yine de degerli: "Sina — dağlık bölge" cumlesi yerine
 * 2232 m yaziyoruz; kissa cografyasi somutlasiyor.
 *
 * ============================================================================
 * KULLANIM
 * ============================================================================
 *
 *   pnpm data:elevation           eksikleri doldurur
 *   pnpm data:elevation --force   hepsini yeniden ceker
 */

interface Alternative {
  name: string;
  lat: number | null;
  lng: number | null;
  note: string;
  elevationM?: number | null;
}

interface Location {
  slug: string;
  name: string;
  lat: number | null;
  lng: number | null;
  elevationM?: number | null;
  alternatives: Alternative[];
  sourceSlugs: string[];
  [k: string]: unknown;
}

const AT_POINT =
  "https://elevation-api.arcgis.com/arcgis/rest/services/elevation-service/v1/elevation/at-point";

const path = resolve(repoRoot, "data/locations/locations.json");
const force = process.argv.includes("--force");

const key = process.env["PUBLIC_ARCGIS_API_KEY"]?.trim() ?? "";
if (key === "") {
  fail(
    ".env icinde PUBLIC_ARCGIS_API_KEY yok.\n" +
      "location.arcgis.com > API anahtari; yetki: Elevation. Ayrinti .env.example icinde.",
  );
}

/**
 * Servis yalnizca `kurankesfi.tr` yonlendiricisine izin veriyor (anahtarin
 * referrer kisiti). Node istegi tarayici degil, basligi elle veriyoruz —
 * kisiti dolanmak degil, ayni kaynaktan sordugumuzu bildirmek icin.
 */
async function elevationOf(lat: number, lng: number): Promise<number | null> {
  const url = `${AT_POINT}?lon=${String(lng)}&lat=${String(lat)}&token=${key}`;
  const res = await fetch(url, { headers: { Referer: "https://kurankesfi.tr/harita" } });
  if (!res.ok) {
    warn(`HTTP ${String(res.status)} — ${String(lat)},${String(lng)}`);
    return null;
  }
  const body = (await res.json()) as {
    result?: { point?: { z?: number } };
    error?: { message?: string };
  };
  if (body.error) {
    warn(`servis hatasi: ${body.error.message ?? "bilinmiyor"}`);
    return null;
  }
  const z = body.result?.point?.z;
  return typeof z === "number" ? Math.round(z) : null;
}

const raw = readFileSync(path, "utf8");
const doc = JSON.parse(raw) as { "//"?: string[]; locations: Location[] };

let cekilen = 0;
let atlanan = 0;
let basarisiz = 0;

for (const loc of doc.locations) {
  // Ana nokta
  if (loc.lat !== null && loc.lng !== null) {
    if (!force && typeof loc.elevationM === "number") {
      atlanan += 1;
    } else {
      const m = await elevationOf(loc.lat, loc.lng);
      if (m === null) {
        basarisiz += 1;
      } else {
        loc.elevationM = m;
        cekilen += 1;
        info(`${loc.slug.padEnd(20)} ${String(m).padStart(6)} m`);
      }
    }
  } else if (loc.elevationM === undefined) {
    loc.elevationM = null;
  }

  // Alternatifler de koordinat tasiyor; "Cebel el-Lavz 2580 m" bilgisi
  // tartismali konumlarda okuyucuya gercekten yardim ediyor.
  for (const alt of loc.alternatives) {
    if (alt.lat === null || alt.lng === null) {
      if (alt.elevationM === undefined) alt.elevationM = null;
      continue;
    }
    if (!force && typeof alt.elevationM === "number") {
      atlanan += 1;
      continue;
    }
    const m = await elevationOf(alt.lat, alt.lng);
    if (m === null) basarisiz += 1;
    else {
      alt.elevationM = m;
      cekilen += 1;
    }
  }

  // Yukseklik Esri'den geliyor; kaydin kaynak listesine eklenir (plan 8.3:
  // her kaynakli deger kaynagini tasir).
  if (typeof loc.elevationM === "number" && !loc.sourceSlugs.includes("esri-elevation")) {
    loc.sourceSlugs.push("esri-elevation");
  }
}

writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", "utf8");
info(`${String(cekilen)} cekildi · ${String(atlanan)} atlandi · ${String(basarisiz)} basarisiz`);
info(`yazildi: ${path}`);
if (basarisiz > 0) {
  warn("Basarisiz kayitlar elevationM olmadan kaldi; --force ile yeniden denenebilir.");
}