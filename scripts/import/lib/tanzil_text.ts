import { fail } from "@kuran/pipeline";

/**
 * Tanzil metin dosyasi ayrisitirici.
 *
 * Hem `tanzil_translations.ts` (yedek meal zinciri) hem `transcription.ts`
 * (ceviriyazi) ayni bicimi okuyor; tek tanim burada durur.
 *
 * Dosya bicimi:
 *   1|1|Rahman ve Rahim olan Allah'in adiyla:
 *   ...
 *   # --------------------------------------------------
 *   #  Name: Diyanet İşleri
 *   #  ID: tr.diyanet
 */

export const EXPECTED_VERSE_COUNT = 6236;

export interface ParsedTanzilText {
  /** "surah:verse" -> metin */
  texts: Map<string, string>;
  /** Dosya sonundaki yorum blogundan okunan ust bilgi */
  meta: Record<string, string>;
}

export const tanzilTextUrl = (tanzilId: string): string => `https://tanzil.net/trans/${tanzilId}`;

export const tanzilCacheName = (tanzilId: string): string =>
  `tanzil_${tanzilId.replace(".", "_")}.txt`;

export function parseTanzilText(body: string, tanzilId: string): ParsedTanzilText {
  const texts = new Map<string, string>();
  const meta: Record<string, string> = {};

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;

    if (line.startsWith("#")) {
      const match = /^#\s*([A-Za-z ]+):\s*(.+)$/.exec(line);
      if (match?.[1] !== undefined && match[2] !== undefined) {
        meta[match[1].trim()] = match[2].trim();
      }
      continue;
    }

    // Metin '|' icerebilecegi icin yalnizca ilk iki ayirici bolunur
    const first = line.indexOf("|");
    const second = line.indexOf("|", first + 1);
    if (first === -1 || second === -1) {
      fail(`${tanzilId}: ayrisitirilamayan satir -> ${line.slice(0, 60)}`);
    }

    const surahNumber = Number(line.slice(0, first));
    const verseNumber = Number(line.slice(first + 1, second));
    const text = line.slice(second + 1).trim();

    if (!Number.isInteger(surahNumber) || !Number.isInteger(verseNumber)) {
      fail(`${tanzilId}: gecersiz ayet anahtari -> ${line.slice(0, 60)}`);
    }
    if (text === "") {
      fail(`${tanzilId}: ${surahNumber}:${verseNumber} bos metin`);
    }

    texts.set(`${surahNumber}:${verseNumber}`, text);
  }

  if (texts.size !== EXPECTED_VERSE_COUNT) {
    fail(`${tanzilId}: ${EXPECTED_VERSE_COUNT} ayet bekleniyordu, ${texts.size} bulundu`);
  }

  // Yanlis dosyayi yanlis yere yazmaya karsi koruma
  const declaredId = meta["ID"];
  if (declaredId !== undefined && declaredId !== tanzilId) {
    fail(`${tanzilId}: dosya kendini '${declaredId}' olarak tanitiyor — kaynak karismis`);
  }

  return { texts, meta };
}
