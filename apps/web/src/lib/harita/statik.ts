import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LocationConfidence } from "@kuran/schema";
import { DATA_DIR } from "~/lib/data-dir";
import { getLocations } from "~/lib/data";

/**
 * Statik harita geometrisi — Mercator projeksiyonu + Natural Earth kara halkalari.
 *
 * ============================================================================
 * NEDEN KUTUPHANEDE, SAYFANIN ICINDE DEGIL
 * ============================================================================
 *
 * Bu hesap 2026-09-07'ye kadar `pages/harita.astro` frontmatter'inin icinde
 * duruyordu. Ana sayfaya harita onizlemesi eklenince ayni kodun ikinci bir
 * kopyasi gerekti. Kopyalamak yerine buraya alindi: iki sayfa AYNI kadraji,
 * AYNI pin yerlerini ve AYNI kara cizgilerini kullanmak zorunda — biri
 * digerinin kucuk hali, farkli gorunmeleri kabul edilemez (DESIGN.md 1).
 *
 * ============================================================================
 * GEOJSON YOLU — `import.meta.url` KULLANILMIYOR
 * ============================================================================
 *
 * Onceki hali `dirname(fileURLToPath(import.meta.url))` + "../../../../" idi.
 * O satir sayfa dosyasinda SANS ESERI dogruydu: Astro uretim build'inde modul
 * paketleniyor ve `import.meta.url` paketin dustugu yeri gosteriyor, kaynak
 * dosyayi degil. Bu modul iki sayfadan import edildigi icin `dist/chunks/`
 * altina dusuyor; yarin tek sayfadan import edilse `dist/pages/` altina duser
 * ve derinlik degisirdi. Ayni tuzak 2026-09-06'da tefsir bolumunu sessizce
 * yayindan dusurmustu (bkz. lib/data-dir.ts).
 *
 * `DATA_DIR` isaretci arayarak bulunuyor, paket yerinden bagimsiz. Depo koku
 * ondan turetiliyor: apps/web/public/data -> yukari dort basamak.
 */

const REPO_ROOT = resolve(DATA_DIR, "../../../..");
const GEO_PATH = resolve(REPO_ROOT, "data/geo/ne_110m_land.geojson");

/** Kadraj payi (derece). Konumlar cercevenin kenarina yapismasin. */
const PAD = 6;
/** SVG genisligi; yukseklik Mercator oranindan hesaplanir. */
const WIDTH = 1000;

export interface MapPin {
  slug: string;
  name: string;
  confidence: LocationConfidence;
  x: number;
  y: number;
}

export interface MapGeometry {
  width: number;
  height: number;
  landPaths: string[];
  pins: MapPin[];
}

interface Geo {
  features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[];
}

/** Ayni geometri iki sayfada da kullaniliyor; geojson bir kez okunsun. */
let cached: MapGeometry | undefined;

export function getMapGeometry(): MapGeometry {
  if (cached !== undefined) return cached;

  const withCoords = getLocations().filter(
    (l): l is typeof l & { lat: number; lng: number } => l.lat !== null && l.lng !== null,
  );

  // --- kadraj ---------------------------------------------------------------
  // Kissalarin tamami Akdeniz-Arabistan-Mezopotamya ucgeninde; dunya haritasi
  // cizmek bos alan olurdu. Kadraj konumlardan hesaplaniyor, sabit yazilmiyor.
  const bounds = withCoords.reduce(
    (acc, l) => ({
      minLng: Math.min(acc.minLng, l.lng),
      maxLng: Math.max(acc.maxLng, l.lng),
      minLat: Math.min(acc.minLat, l.lat),
      maxLat: Math.max(acc.maxLat, l.lat),
    }),
    { minLng: 180, maxLng: -180, minLat: 90, maxLat: -90 },
  );
  const box = {
    minLng: bounds.minLng - PAD,
    maxLng: bounds.maxLng + PAD,
    minLat: bounds.minLat - PAD,
    maxLat: bounds.maxLat + PAD,
  };

  /** Mercator y — enlem arttikca gerilir; kara sekilleri bozulmasin. */
  const merc = (lat: number): number => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const yTop = merc(box.maxLat);
  const yBottom = merc(box.minLat);
  const height = Math.round(
    (WIDTH * (yTop - yBottom)) / ((box.maxLng - box.minLng) * (Math.PI / 180)),
  );

  const px = (lng: number): number => ((lng - box.minLng) / (box.maxLng - box.minLng)) * WIDTH;
  const py = (lat: number): number => ((yTop - merc(lat)) / (yTop - yBottom)) * height;

  // --- kara parcalari -------------------------------------------------------
  const geo = JSON.parse(readFileSync(GEO_PATH, "utf8")) as Geo;

  /** Kadraj disindaki halkalar atilir; 5091 noktanin cogu bosa cizilmesin. */
  function ringPath(ring: number[][]): string | null {
    let inBox = false;
    const points: string[] = [];
    for (const [lng, lat] of ring) {
      if (lng === undefined || lat === undefined) continue;
      if (lng >= box.minLng && lng <= box.maxLng && lat >= box.minLat && lat <= box.maxLat) {
        inBox = true;
      }
      points.push(`${px(lng).toFixed(1)},${py(lat).toFixed(1)}`);
    }
    if (!inBox || points.length < 3) return null;
    return `M${points.join("L")}Z`;
  }

  const landPaths: string[] = [];
  for (const feature of geo.features) {
    const polys =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates as number[][][]]
        : (feature.geometry.coordinates as number[][][][]);
    for (const poly of polys) {
      const outer = poly[0];
      if (outer === undefined) continue;
      const path = ringPath(outer);
      if (path !== null) landPaths.push(path);
    }
  }

  // --- pinler ---------------------------------------------------------------
  // y'ye gore siralaniyor: kuzeydeki pin once cizilir, guneydeki ustune biner.
  // Etiketler asagi dogru okundugunda ust uste binme en aza iner.
  const pins: MapPin[] = withCoords
    .map((l) => ({
      slug: l.slug,
      name: l.name,
      confidence: l.confidence,
      x: px(l.lng),
      y: py(l.lat),
    }))
    .sort((a, b) => a.y - b.y);

  cached = { width: WIDTH, height, landPaths, pins };
  return cached;
}
