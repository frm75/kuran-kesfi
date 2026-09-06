/**
 * MapLibre stil uretici — Protomaps basemap semasi.
 *
 * ============================================================================
 * NEDEN HAZIR TEMA DEGIL, ELLE YAZILMIS KATMANLAR
 * ============================================================================
 *
 * Uc sebep, ucu de zorlayici:
 *
 * 1. SPRITE YOK. Protomaps'in hazir sprite'inda `theatre` ikonu iki tiyatro
 *    maskesidir — goz, burun, agiz cizili, insan yuzu tasviri. Plan 20.3
 *    yasagi yuze degil FIGURE. Hazir tema POI ikonlarini kullanir ve sprite'a
 *    bagimlidir; elle yazilan bu stil hicbir `icon-image` kullanmaz, bu yuzden
 *    `sprite` anahtari HIC YOKTUR. Figur riski kodun disinda kalir.
 *
 * 2. `pois` katmani hic cizilmiyor. Kissa haritasinda restoran, otel, tuvalet
 *    isaretinin isi yok; sayfa "sakin, tipografi odakli" (DESIGN.md).
 *
 * 3. Renk DESIGN.md token'larindan gelir. CLAUDE.md: "hex/px degeri koda
 *    gomulmez, token'dan gelir". Bu dosya hicbir renk sabiti icermez; palet
 *    calisma aninda `getComputedStyle` ile global.css'ten okunur, boylece
 *    karanlik/acik mod otomatik dogru olur ve tek gercek kaynak global.css
 *    olarak kalir.
 *
 * ============================================================================
 * ETIKET DILI
 * ============================================================================
 *
 * `name:tr` -> `name:en` -> `name` sirasi. Protomaps glyph paketinde ARAPCA
 * YOKTUR (Noto Sans: Latin/Kiril/Yunan). `name` fallback'ine dusen Arapca
 * isimler kutu gorunur. Cozumu repoda zaten self-host edilen Amiri'den glyph
 * pbf uretmektir; ilk surumde Latin etiketle gidiliyor (docs/DURUM.md).
 */

import type { StyleSpecification } from "maplibre-gl";

/** global.css token'larindan okunan renkler. Hepsi CSS renk dizesi. */
export interface Palette {
  bgPrimary: string;
  bgElevated: string;
  bgOverlay: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentText: string;
  teal: string;
  success: string;
  warning: string;
  danger: string;
  /** Cografya rengi — arayuz rengi DEGIL. DESIGN.md §1 "Harita Renkleri". */
  mapWater: string;
  mapLand: string;
}

const GLYPHS = "https://medya.kurankesfi.tr/tiles/fonts/{fontstack}/{range}.pbf";
const PMTILES = "pmtiles://https://medya.kurankesfi.tr/tiles/kesif.pmtiles";

/**
 * Yukselti kareleri — 3D arazi ve kabartma golgesi icin.
 *
 * Terrarium bicimi (Mapzen/AWS Terrain Tiles), kendi sunucumuzdan aynalanmis
 * (scripts/media/fetch_terrain.ts). Esri kullanilmadi: Elevation servisi
 * yalniz nokta sorgusu sunuyor, kare yayinlamiyor — olculdu, 404.
 *
 * z9'da duruyor; MapLibre ustunu overzoom ile olcekliyor. Duz PNG olmasi
 * bilerek: Cloudflare `.png`'yi varsayilan cacheliyor, PMTiles arsivi ise
 * 512 MB sinirini astigi icin cachelenmiyordu.
 */
export const TERRAIN_TILES = "https://medya.kurankesfi.tr/tiles/terrain/{z}/{x}/{y}.png";
export const TERRAIN_MAXZOOM = 9;

/**
 * Altligin bbox'i.
 *
 * Ilk surum 22,5 - 60,45 idi: 26 konumun HEPSINI iceriyordu ama genis bir
 * ekranda kadraj kutudan tasiyor, sag ve solda bos zemin kaliyordu. Konum
 * dagilimi 28 derece dikey, ekran ise 2:1 yatay — yatayda 56+ derece gerekiyor.
 * Bu yuzden kutu 5,3 - 72,48 olarak genisletildi (832 MB -> 2,37 GB).
 * bkz. docs/DURUM.md.
 */
export const TILE_BOUNDS: [number, number, number, number] = [5, 3, 72, 48];
export const TILE_MAXZOOM = 12;

const REGULAR = ["Noto Sans Regular"];
const MEDIUM = ["Noto Sans Medium"];

/** name:tr -> name:en -> name */
const LABEL = ["coalesce", ["get", "name:tr"], ["get", "name:en"], ["get", "name"]];

/**
 * Paletten karanlik/acik cikarimi.
 *
 * Bilesene "tema" parametresi eklemek yerine RENGIN KENDISINDEN okunuyor:
 * buildStyle saf kaliyor ve tek gercek kaynak yine global.css oluyor.
 * Kabartma golgesinin siddeti buna bagli — acik parsomen zeminde 0,18'lik
 * vurgu yetiyor, koyu lacivertte kaybolyor (olculdu, 2026-09-06).
 */
function karanlikMi(renk: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(renk.trim());
  if (m === null) return true; // bilinmiyorsa koyu varsay: site karanlik oncelikli
  const h = m[1] as string;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Basit algisal parlaklik; WCAG hesabina gerek yok, esik cok uzakta.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

export function buildStyle(p: Palette): StyleSpecification {
  const karanlik = karanlikMi(p.mapLand);
  return {
    version: 8,
    glyphs: GLYPHS,
    /**
     * KÜRE PROJEKSIYONU.
     *
     * Mercator kutuplara dogru alani sisiriyor; kissa cografyasi 14K ile 42K
     * arasinda ve o bantta bile Habesistan-Kafkasya mesafesi oldugundan
     * buyuk duruyordu. Kure gercek olcegi veriyor.
     *
     * MapLibre yakinlasinca kendiliginden Mercator'a geciyor (globe yalniz
     * uzak zoom'da anlamli); yani sehir olceginde davranis degismiyor.
     */
    projection: { type: "globe" },
    // sprite ANAHTARI YOK — bkz. dosya basi. Hicbir katman icon-image kullanmaz.
    sources: {
      altlik: {
        type: "vector",
        url: PMTILES,
        attribution:
          '<a href="https://openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>',
      },
      /**
       * Kaynak her zaman tanimli ama karelerini YALNIZCA kabartma acikken
       * indirir: MapLibre raster-dem'i ancak bir hillshade katmani ya da
       * setTerrain onu kullandiginda ceker. Yani varsayilan haritanin
       * maliyeti degismiyor.
       */
      /**
       * DUNYA KARA SILUETI — Natural Earth 1:110m, kamu mali.
       *
       * Altlik yalniz 5,3-72,48 kutusunu kapsiyor. Kure projeksiyonunda
       * uzaklasinca gezegenin geri kalani BOS cikiyordu ve harita bozuk gibi
       * duruyordu. Bu kaynak yalnizca SILUET verir: sinir, etiket, yol yok —
       * "burasi kara" demekle yetinir, kissa cografyasinin disina bilgi
       * iddiasi tasimaz.
       *
       * Kendi sunucumuzdan (138 KB); statik SVG harita da ayni dosyadan
       * ciziliyor, ikinci kopya tutulmuyor.
       */
      dunya: {
        type: "geojson",
        data: "/geo/ne_110m_land.geojson",
        attribution: '<a href="https://www.naturalearthdata.com/">Natural Earth</a>',
      },
      arazi: {
        type: "raster-dem",
        tiles: [TERRAIN_TILES],
        tileSize: 256,
        maxzoom: TERRAIN_MAXZOOM,
        /**
         * SINIR ZORUNLU. Vektor altlik sinirini PMTiles arsivinin icinden
         * okuyor; ham kare listesinde boyle bir bilgi yok, dolayisiyla
         * MapLibre kutunun disindaki kareleri de istiyor ve R2 404 donuyor
         * (2026-09-06'da yayinda goruldu: konsolda 404, harita calisiyor
         * ama gereksiz istek). Sinir verilince o kareler hic istenmiyor.
         *
         * Deger TILE_BOUNDS ile AYNI olmali — aynalama da o kutuya gore
         * yapildi (scripts/media/fetch_terrain.ts).
         */
        bounds: TILE_BOUNDS,
        // Terrarium: yukseklik = (R*256 + G + B/256) - 32768
        encoding: "terrarium",
        attribution:
          '<a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>',
      },
    },
    layers: [
      // --- zemin -------------------------------------------------------------
      // Deniz ayri bir cokgen olarak gelmiyor; kara disinda kalan her yer
      // arka plandir. Bu yuzden arka plan SU rengidir, kara ustune boyanir.
      {
        id: "zemin-su",
        type: "background",
        paint: { "background-color": p.mapWater },
      },
      // Once dunya silueti, sonra ayrintili kara: ayni renk, kutunun icinde
      // vektor veri ustune biner ve dikis gorunmez.
      {
        id: "dunya-kara",
        type: "fill",
        source: "dunya",
        paint: { "fill-color": p.mapLand },
      },
      {
        id: "kara",
        type: "fill",
        source: "altlik",
        "source-layer": "earth",
        paint: { "fill-color": p.mapLand },
      },
      // Col, orman, kentsel alan: cok hafif. Amac dekor degil, Sina'nin
      // daglik, Nil'in yesil, Rub'ul Hali'nin kum oldugunu sezdirmek.
      {
        id: "ortu",
        type: "fill",
        source: "altlik",
        "source-layer": "landcover",
        /**
         * z5'ten once cizilmiyor. KURE gorunumunde altligimizin kutusu
         * (5,3-72,48) cevresindeki dunya siluetinden ACIK bir dikdortgen
         * olarak siriyordu: icerde ortu/kiyi/kabartma var, disarida duz renk.
         * Uzak zoomda bu ayrinti zaten okunmuyor; kapatilinca dikis kayboluyor
         * ve detay yakinlastikca beliriyor.
         *
         * ESIK 3, 5 DEGIL: /harita varsayilan kadraji z~3,3'te aciliyor
         * (26 konumun tamami). 5'te birakilinca varsayilan gorunumde
         * kabartma ve ortu HIC gorunmuyordu — olculdu, DEM istegi 0 idi.
         * Kure ise z3'un altinda basliyor; esik tam aralarina dusuyor.
         */
        minzoom: 3,
        paint: {
          "fill-color": [
            "match",
            ["get", "kind"],
            "forest",
            p.teal,
            "grassland",
            p.teal,
            "farmland",
            p.teal,
            "urban_area",
            p.borderStrong,
            "glacier",
            p.textSecondary,
            p.border,
          ],
          "fill-opacity": [
            "match",
            ["get", "kind"],
            "urban_area",
            0.22,
            "forest",
            0.14,
            "grassland",
            0.1,
            "farmland",
            0.1,
            0.12,
          ],
        },
      },
      {
        id: "su",
        type: "fill",
        source: "altlik",
        "source-layer": "water",
        paint: { "fill-color": p.mapWater },
      },

      /**
       * KABARTMA GOLGESI — 2026-09-06'da varsayilan acik yapildi.
       *
       * Onceden bir anahtarin arkasindaydi ve o anahtar golgeyi, 3D araziyi
       * ve kamera egimini BIRLIKTE aciyordu. Varsayilan acik yapilinca harita
       * egik aciliyordu: yon duygusunu bozuyor ve DESIGN.md'nin "sakin"
       * ilkesine aykiri. Ikisi ayrildi:
       *   golge  — burada, her zaman, harita DUZ kaliyor
       *   3D     — ayri anahtar, kamerayi egiyor (HaritaCanli.astro)
       *
       * Golgenin isi anlatiyi tasimak: Sina'nin daglik, Ahkaf'in kumul,
       * Kizildeniz'in yarik oldugu ancak boyle goruluyor. Duz dolgu haritada
       * hepsi ayni renk lekesiydi.
       *
       * MALIYET: kaynak stile girdigi icin yukselti kareleri artik her harita
       * acilisinda iniyor (~10-25 istek). Kareler `.png` ve Cloudflare
       * kenarinda cachelenıyor (olculdu: MISS -> HIT), yani ikinci ziyaretci
       * R2'ye hic gitmiyor.
       */
      {
        id: "kabartma-golge",
        type: "hillshade",
        source: "arazi",
        // Ayni dikis gerekcesi (bkz. `ortu`). Ayrica kure gorunumunde
        // kabartma zaten piksel altinda kaliyor; bosuna kare indirilmiyor.
        minzoom: 3,
        paint: {
          "hillshade-exaggeration": karanlik ? 0.6 : 0.45,
          // Karanlik zeminde golgeyi ARTIRMAK ise yaramaz — siyah uzerine
          // siyah. Okunurlugu veren sey aydinlik yuz; o yuzden karanlikta
          // vurgu guclenir, golge zayiflar.
          "hillshade-shadow-color": karanlik ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.55)",
          "hillshade-highlight-color": karanlik
            ? "rgba(255,255,255,0.34)"
            : "rgba(255,255,255,0.18)",
          // Vurgu rengi kapali: acik modda parsomen zemini kirletiyordu.
          "hillshade-accent-color": "rgba(0,0,0,0)",
        },
      },
      /**
       * KIYI CIZGISI — z8+ olculerek eklendi.
       *
       * Kara `--bg-elevated` (#0c1b33), deniz `--bg-primary` (#071023).
       * Uzaktan bu fark yeter ama Kizildeniz kiyisina yakinlasinca ikisi
       * ayirt edilemez hale geliyordu: ekranda "her yer koyu lacivert" vardi
       * ve Cidde'nin kiyida mi ic kesimde mi oldugu okunmuyordu.
       *
       * Cizgi suyun KENARINI cizer (fill degil line): kara-deniz siniri ve
       * nehir/gol kiyilari. Uzak zoomda kapali, cunku orada gereksiz
       * gurultu — kara/deniz zaten dolgu farkiyla okunuyor.
       */
      {
        id: "kiyi",
        type: "line",
        source: "altlik",
        "source-layer": "water",
        // Ayni dikis gerekcesi (bkz. `ortu`).
        minzoom: 3,
        paint: {
          "line-color": p.borderStrong,
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 12, 1.2],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.35, 8, 0.9],
        },
      },

      // --- sinirlar ----------------------------------------------------------
      // Modern devlet sinirlari kissa cografyasi DEGILDIR; yalnizca okuyucu
      // "burasi neresi" diye sorunca yon bulsun diye var. Bu yuzden kesikli ve
      // silik: harita bugunun siyasi bolunmesini iddia etmiyor.
      {
        id: "sinir-ulke",
        type: "line",
        source: "altlik",
        "source-layer": "boundaries",
        filter: ["==", ["get", "kind"], "country"],
        // Ayni dikis gerekcesi (bkz. `ortu`).
        minzoom: 3,
        paint: {
          "line-color": p.border,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 10, 1.4],
          "line-dasharray": [3, 2],
          "line-opacity": 0.75,
        },
      },

      // --- yollar ------------------------------------------------------------
      // Yalnizca ana yollar ve yalnizca z7'den sonra. Kissa haritasinda sokak
      // agi gurultudur; buyuk yol ise sehirler arasi mesafeyi okunur kilar.
      {
        id: "yol",
        type: "line",
        source: "altlik",
        "source-layer": "roads",
        minzoom: 7,
        filter: ["in", ["get", "kind"], ["literal", ["highway", "major_road"]]],
        paint: {
          // `--border` (#1e3355) neredeyse siyah zeminde GORUNMUYORDU;
          // z10'da Suudi otoyollari ekranda hic yoktu. `--text-muted`
          // token'i metin icin secilmis, yani zemine gore kontrasti
          // garantili.
          "line-color": p.textMuted,
          "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.4, 12, 1.8],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.25, 12, 0.5],
        },
      },

      // --- etiketler ---------------------------------------------------------
      // pois katmani HIC cizilmiyor (bkz. dosya basi).
      {
        id: "etiket-ulke",
        type: "symbol",
        source: "altlik",
        "source-layer": "places",
        filter: ["==", ["get", "kind"], "country"],
        maxzoom: 8,
        layout: {
          "text-field": LABEL,
          "text-font": MEDIUM,
          "text-size": ["interpolate", ["linear"], ["zoom"], 2, 10, 7, 14],
          "text-transform": "uppercase",
          "text-letter-spacing": 0.12,
          "text-max-width": 7,
        },
        paint: {
          "text-color": p.textMuted,
          "text-halo-color": p.mapLand,
          "text-halo-width": 1.2,
        },
      },
      {
        id: "etiket-bolge",
        type: "symbol",
        source: "altlik",
        "source-layer": "places",
        filter: ["==", ["get", "kind"], "region"],
        minzoom: 5,
        maxzoom: 10,
        layout: {
          "text-field": LABEL,
          "text-font": REGULAR,
          "text-size": 11,
          "text-max-width": 8,
        },
        paint: {
          "text-color": p.textMuted,
          "text-halo-color": p.mapLand,
          "text-halo-width": 1,
        },
      },
      {
        id: "etiket-yerlesim",
        type: "symbol",
        source: "altlik",
        "source-layer": "places",
        filter: ["==", ["get", "kind"], "locality"],
        layout: {
          "text-field": LABEL,
          "text-font": REGULAR,
          "text-size": ["interpolate", ["linear"], ["zoom"], 4, 10, 12, 14],
          "text-max-width": 8,
          // Kendi konum etiketlerimiz daha onemli; cakisirsa sehir adi dussun.
          "symbol-sort-key": ["coalesce", ["get", "min_zoom"], 15],
        },
        paint: {
          "text-color": p.textSecondary,
          "text-halo-color": p.mapLand,
          "text-halo-width": 1.1,
        },
      },
    ],
  } as StyleSpecification;
}
