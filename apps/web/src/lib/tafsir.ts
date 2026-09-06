import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_DIR } from "~/lib/data-dir";
import type { StaticTafsirBlock, StaticTafsirIndex, StaticTafsirSurah } from "@kuran/schema";

/**
 * Tefsir — okuma katmanı (plan §3, §12.9).
 *
 * İki eser yayında: Sa'dî (QuranEnc) ve el-Muhtasar (QUL). İkisi de 6236 ayetin
 * tamamını kapsıyor.
 *
 * **Yayın kapısı build tarafındadır.** `tafsir.publishable = false` olan eser
 * bu dosyalara hiç girmez (docs/KAYNAK_ENVANTERI.md §0: kütüphane ≠ yayın);
 * burada ikinci bir süzme yoktur, çünkü süzülecek veri zaten gelmez.
 *
 * `data.ts` ile aynı kalıp: dosya bir kez okunur, tarayıcıya gitmez.
 */

function readJsonOrNull<T>(relativePath: string): T | null {
  const path = resolve(DATA_DIR, relativePath);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function once<T>(load: () => T): () => T {
  let value: { result: T } | undefined;
  return () => {
    value ??= { result: load() };
    return value.result;
  };
}

export type TafsirWork = StaticTafsirIndex["tafsirs"][number];

/** Yayındaki tefsir eserleri; tefsir yoksa boş dizi. */
export const getTafsirs = once(
  (): TafsirWork[] => readJsonOrNull<StaticTafsirIndex>("tafsir_index.json")?.tafsirs ?? [],
);

/**
 * Sure dosyaları önbelleklenir: bir sure dosyası o surenin BÜTÜN ayet
 * sayfalarına hizmet eder. Bakara'da 286 ayet var; dosyayı her sayfada yeniden
 * okumak 286 kez 582 KB ayrıştırmak demekti.
 */
const surahCache = new Map<string, StaticTafsirSurah | null>();

function getTafsirSurah(tafsirSlug: string, surahId: number): StaticTafsirSurah | null {
  const path = `tafsir/${tafsirSlug}/surah_${String(surahId)}.json`;
  let entry = surahCache.get(path);
  if (entry === undefined) {
    entry = readJsonOrNull<StaticTafsirSurah>(path);
    surahCache.set(path, entry);
  }
  return entry;
}

export interface VerseTafsir {
  work: TafsirWork;
  blocks: StaticTafsirBlock[];
}

/**
 * Ayet sayfasında YALNIZCA `ayet_tefsiri` blokları gösterilir.
 *
 * Ayete bağlı iki blok türü var: `ayet_tefsiri` ve `pasaj`. `pasaj` (kaynakta
 * "المقطع") tefsir değil, ayet grubunun MEAL METNİDİR — Sa'dî yayınında her
 * tefsir bloğunun önüne konmuş. Ayet sayfası zaten aynı mealin (Rowwad,
 * QuranEnc) kendisini gösteriyor; pasajı ikinci kez basmak aynı çeviriyi
 * "tefsir" başlığı altında tekrarlamak olurdu. Blok veri dosyasında duruyor,
 * kaybolmuş değil — sure düzeyinde tefsir okuma ekranı yapıldığında oradan
 * gelir.
 */
const VERSE_BLOCK_TYPES = new Set(["ayet_tefsiri"]);

/** Bu ayeti kapsayan tefsir blokları, eser eser. Kapsayan yoksa boş dizi. */
export function getVerseTafsir(surahId: number, verseNumber: number): VerseTafsir[] {
  const result: VerseTafsir[] = [];
  for (const work of getTafsirs()) {
    if (!work.surahIds.includes(surahId)) continue;
    const surah = getTafsirSurah(work.slug, surahId);
    if (surah === null) continue;
    const blocks = surah.blocks.filter(
      (b) =>
        VERSE_BLOCK_TYPES.has(b.blockType) &&
        b.startVerse !== null &&
        b.endVerse !== null &&
        b.startVerse <= verseNumber &&
        b.endVerse >= verseNumber,
    );
    if (blocks.length > 0) result.push({ work, blocks });
  }
  return result;
}

/**
 * Bloğun kapsadığı aralık etiketi: tek ayette null (başlıkta zaten yazıyor),
 * aralıkta "1–5. ayetler". Okur, önündeki metnin yalnız bu ayete mi yoksa bir
 * gruba mı ait olduğunu görmeden okumamalı.
 */
export function blockRangeLabel(block: StaticTafsirBlock): string | null {
  if (block.startVerse === null || block.endVerse === null) return null;
  if (block.startVerse === block.endVerse) return null;
  return `${String(block.startVerse)}–${String(block.endVerse)}. ayetler`;
}

/**
 * Kaynak metnin paragraflara bölünmesi.
 *
 * Kaynak boş satırla değil, tek satır sonuyla ayırıyor; hepsini tek <p> içine
 * koymak 19 KB'lık blokları okunmaz yapıyordu.
 */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}
