/**
 * Statik cikti denetiminin dosyalar arasi durumu.
 *
 * Dosyalar tek tek dogrulanir ama bazi kurallar ancak hepsi gorulunce
 * sinanabilir (dizin <-> dosya eslesmesi, toplam sayilar). Dosya denetimleri
 * buraya biriktirir, `../static_output.ts` dongu bitince toplar.
 */

export interface StaticState {
  surahFiles: number;
  translationFiles: number;
  verseFiles: number;
  authorSlugs: Set<string>;
  translationCounts: Map<string, number>;
  expectedFilesByAuthor: Map<string, number>;
  seenIds: Set<number>;
  seenSlugs: Set<string>;
  rootFiles: number;
  wordFiles: number;
  wordCount: number;
  rootsIndexEntries: number;
  /** Kelimelerin gosterdigi kokler ve gercekten var olan kok dosyalari */
  referencedRoots: Set<string>;
  rootFileNames: Set<string>;
  /** Icerik katmani: dizin <-> dosya eslesmesi */
  storiesIndexSlugs: Set<string>;
  storyFileSlugs: Set<string>;
  principlesIndexSlugs: Set<string>;
  principleFileSlugs: Set<string>;
  /** Ilke karsitlik denetimi: slug -> karsit slug (yok ise null) */
  principleOpposite: Map<string, string | null>;
  /** Ilke alani denetimi: slug -> areaSlug, principle_areas.json'daki iddia edilen sayimla karsilastirilir */
  principleAreaOf: Map<string, string>;
  principleAreaDeclaredCounts: Map<string, number>;
  conceptsIndexSlugs: Set<string>;
  conceptFileSlugs: Set<string>;
  /** Medya: media.json'daki kimlikler ve ters dizinin gosterdikleri */
  mediaIds: Set<string>;
  verseMediaIds: Set<string>;
  /** Tefsir: yazilan sure dosyalari ve indeksin iddia ettikleri */
  tafsirFiles: Set<string>;
  tafsirIndexClaims: Set<string>;
}

export function createStaticState(): StaticState {
  return {
    surahFiles: 0,
    translationFiles: 0,
    verseFiles: 0,
    authorSlugs: new Set<string>(),
    translationCounts: new Map<string, number>(),
    expectedFilesByAuthor: new Map<string, number>(),
    seenIds: new Set<number>(),
    seenSlugs: new Set<string>(),
    rootFiles: 0,
    wordFiles: 0,
    wordCount: 0,
    rootsIndexEntries: 0,
    referencedRoots: new Set<string>(),
    rootFileNames: new Set<string>(),
    storiesIndexSlugs: new Set<string>(),
    storyFileSlugs: new Set<string>(),
    principlesIndexSlugs: new Set<string>(),
    principleFileSlugs: new Set<string>(),
    principleOpposite: new Map<string, string | null>(),
    principleAreaOf: new Map<string, string>(),
    principleAreaDeclaredCounts: new Map<string, number>(),
    conceptsIndexSlugs: new Set<string>(),
    conceptFileSlugs: new Set<string>(),
    mediaIds: new Set<string>(),
    verseMediaIds: new Set<string>(),
    tafsirFiles: new Set<string>(),
    tafsirIndexClaims: new Set<string>(),
  };
}

/** Dongunun bir dosya icin hazirladigi girdi. */
export interface StaticFile {
  /** `apps/web/public/data` koküne gore yol. */
  relativePath: string;
  /** Dosya adi (son yol parcasi). */
  base: string;
  parsed: unknown;
}
