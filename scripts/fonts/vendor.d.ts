/**
 * Tip tanimi getirmeyen font araclari icin bildirimler.
 *
 * `declare module "x";` yazmak yeterdi ama o her sey icin `any` demek olurdu
 * ve yanlis cagri sessizce gecerdi. Kullandigimiz yuzey buraya elle yaziliyor;
 * kaynaklar README ve index.js imzalari.
 */

declare module "subset-font" {
  /** Bir eksen sabitlenir (sayi) ya da araligi daraltilir (nesne). */
  export type VariationAxisValue =
    | number
    | { min: number; max: number; default?: number };

  export interface SubsetOptions {
    /** "truetype", "sfnt" icin geriye donuk takma addir. */
    targetFormat?: "sfnt" | "truetype" | "woff" | "woff2";
    /** name tablosunda korunacak ek id'ler; varsayilan olarak cogu atilir. */
    preserveNameIds?: number[];
    /** Tutulacak OpenType ozellik etiketleri; verilmezse HEPSI tutulur. */
    keepFeatures?: string[];
    variationAxes?: Record<string, VariationAxisValue>;
    /** GSUB kapanisini yapma. Arapca'da dizgiyi bozar — bilerek kullanilmaz. */
    noLayoutClosure?: boolean;
    glyphNames?: boolean;
    noHinting?: boolean;
    dropTables?: string[];
  }

  export default function subsetFont(
    font: Uint8Array,
    text: string,
    options?: SubsetOptions,
  ): Promise<Buffer>;
}

declare module "fontverter" {
  export type FontFormat = "sfnt" | "truetype" | "woff" | "woff2";
  export function convert(
    font: Uint8Array,
    toFormat: FontFormat,
    fromFormat?: FontFormat,
  ): Promise<Buffer>;
  export function detectFormat(font: Uint8Array): FontFormat;
}

declare module "harfbuzzjs" {
  /** hb_glyph_info + pozisyon; json() bu sekli dondurur. */
  export interface ShapedGlyph {
    /** glif id — 0 = .notdef, yani fontta karsiligi yok */
    g: number;
    /** kume (cluster) id: kaynak metindeki bayt konumu */
    cl: number;
    ax: number;
    ay: number;
    dx: number;
    dy: number;
    flags: number;
  }

  export interface HbHandle {
    destroy(): void;
  }

  export interface HbBuffer extends HbHandle {
    addText(text: string): void;
    /** "ltr" | "rtl" | "ttb" | "btt" */
    setDirection(direction: string): void;
    /** ISO 15924, ornek "Arab" */
    setScript(script: string): void;
    setLanguage(language: string): void;
    guessSegmentProperties(): void;
    json(): ShapedGlyph[];
  }

  export interface Harfbuzz {
    createBlob(font: Uint8Array): HbHandle;
    createFace(blob: HbHandle, index: number): HbHandle;
    createFont(face: HbHandle): HbHandle;
    createBuffer(): HbBuffer;
    shape(font: HbHandle, buffer: HbBuffer, features?: string): void;
    version_string(): string;
  }

  /** Paketin girisi wasm hazir olunca cozulen bir Promise'tir. */
  const harfbuzz: Promise<Harfbuzz>;
  export default harfbuzz;
}
