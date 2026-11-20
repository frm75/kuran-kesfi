/**
 * B. Uretilen statik JSON — Kur'an metni, mealler, kokler ve kelimeler.
 *
 * Her fonksiyon tek bir dosya turunu dogrular; hangi yolun hangisine gittigi
 * `../static_output.ts` icindeki tabloda.
 */

import {
  staticAuthorsIndex,
  staticRoot,
  staticRootsIndex,
  staticVerseWords,
  staticScripture,
  staticSources,
  staticSurah,
  staticSurahTranslation,
  staticSurahsIndex,
  staticVerseDetail,
} from "@kuran/schema";
import { errors, tick, warn } from "../report.js";
import type { StaticFile, StaticState } from "./state.js";

export function checkSurahsIndex({ relativePath, parsed }: StaticFile): void {
  const result = staticSurahsIndex.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
}

export function checkSources({ relativePath, parsed }: StaticFile): void {
  const result = staticSources.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
}

export function checkScripture({ relativePath, parsed }: StaticFile): void {
  const result = staticScripture.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
}

export function checkAuthorsIndex({ relativePath, parsed }: StaticFile, s: StaticState): void {
  const result = staticAuthorsIndex.safeParse(parsed);
  tick();
  if (!result.success) {
    errors.push(`${relativePath}: ${result.error.message}`);
  } else {
    s.authorSlugs = new Set(result.data.authors.map((a) => a.slug));
    for (const a of result.data.authors) {
      s.expectedFilesByAuthor.set(a.slug, 114 - a.missingSurahs.length);
      if (a.missingSurahs.length > 0 || a.missingVerseCount > 0) {
        warn(
          "kaynak boslugu",
          `${a.slug}: ${a.missingVerseCount} ayet eksik` +
            (a.missingSurahs.length > 0
              ? `, tamamen eksik sure(ler): ${a.missingSurahs.join(", ")}`
              : ""),
        );
      }
    }

    // Atif yukumlulugu: her kullanilan kaynagin baglantisi bulunmali
    // (bkz. data/LICENSE). Kaynak bazli, sabit yazilmaz.
    const requiredLinkBySource: Readonly<Record<string, string>> = {
      acikkuran: "acikkuran.com",
      tanzil: "tanzil.net/trans",
      "quran.com": "quran.com",
      /*
       * `quranenc` BILEREK YOK (kullanici karari 2026-09-06). Meal bir
       * platformun degil onu yapan YAZARIN eseridir; atif yazar adiyla
       * verilir (Rowwad Tercume Merkezi, Saban Britch, Ali Ozek ve
       * heyeti). build.ts o platform baglantisini ayni kararla kaldirdi
       * ama bu kural guncellenmemisti ve build KIRIK kaldi — kaynak
       * "quranenc" olan meal var, aranan baglanti hicbir zaman
       * uretilmiyordu. QuranEnc'in kendi 3. kosulu baglanti degil SURUM
       * NUMARASI istiyor; o arayuzde gosteriliyor.
       */
    };
    const links = result.data.requiredAttributionLinks.map((l) => l.url).join(" ");
    for (const source of new Set(result.data.authors.map((a) => a.source))) {
      tick();
      const needle = requiredLinkBySource[source];
      if (needle === undefined) {
        warn("atif", `'${source}' kaynagi icin tanimli atif baglantisi kurali yok`);
        continue;
      }
      if (!links.includes(needle)) {
        errors.push(
          `${relativePath}: '${source}' kaynagindan meal var ama ${needle} ` +
            "atif baglantisi yok (bkz. data/LICENSE)",
        );
      }
    }

    // Arapca metin her zaman Tanzil'den gelir — atfi kosulsuz zorunlu
    tick();
    if (!links.includes("tanzil.net")) {
      errors.push(
        `${relativePath}: Arapça metin Tanzil'den geliyor, tanzil.net atfi zorunlu`,
      );
    }
  }
}

export function checkTranslationFile({ relativePath, parsed }: StaticFile, s: StaticState): void {
  const result = staticSurahTranslation.safeParse(parsed);
  tick();
  if (!result.success) {
    errors.push(`${relativePath}: ${result.error.message}`);
    return;
  }
  s.translationFiles += 1;
  const payload = result.data;
  const expectedPath = `translation/${payload.authorSlug}/surah_${payload.surahId}.json`;
  if (relativePath !== expectedPath) {
    errors.push(`${relativePath}: yol ${expectedPath} olmali`);
  }
  s.translationCounts.set(
    payload.authorSlug,
    (s.translationCounts.get(payload.authorSlug) ?? 0) + 1,
  );
}

export function checkVerseFile({ relativePath, parsed, base }: StaticFile, s: StaticState): void {
  const result = staticVerseDetail.safeParse(parsed);
  tick();
  if (!result.success) {
    errors.push(`${relativePath}: ${result.error.message}`);
    return;
  }
  s.verseFiles += 1;
  const verse = result.data;
  if (verse.id !== verse.surahId * 1000 + verse.verseNumber) {
    errors.push(`${relativePath}: id formulune uymuyor`);
  }
  if (base !== `verse_${verse.surahId}_${verse.verseNumber}.json`) {
    errors.push(`${relativePath}: dosya adi verse_${verse.surahId}_${verse.verseNumber}.json olmali`);
  }
}

export function checkSurahFile({ relativePath, parsed, base }: StaticFile, s: StaticState): void {
  const result = staticSurah.safeParse(parsed);
  tick();
  if (!result.success) {
    errors.push(`${relativePath}: ${result.error.message}`);
    return;
  }
  s.surahFiles += 1;
  const surah = result.data;

  if (s.seenIds.has(surah.id)) errors.push(`${relativePath}: sure id ${surah.id} mukerrer`);
  s.seenIds.add(surah.id);
  if (s.seenSlugs.has(surah.slug)) errors.push(`${relativePath}: slug ${surah.slug} mukerrer`);
  s.seenSlugs.add(surah.slug);

  if (base !== `surah_${surah.id}.json`) {
    errors.push(`${relativePath}: dosya adi surah_${surah.id}.json olmali`);
  }
  if (surah.verses.length !== surah.verseCount) {
    errors.push(
      `${relativePath}: verseCount ${surah.verseCount} ama ${surah.verses.length} ayet var`,
    );
  }
  surah.verses.forEach((verse, index) => {
    if (verse.verseNumber !== index + 1) {
      errors.push(`${relativePath}: ${index + 1}. sirada ayet ${verse.verseNumber} var`);
    }
    if (verse.id !== surah.id * 1000 + verse.verseNumber) {
      errors.push(`${relativePath}: ayet ${verse.verseNumber} id formulune uymuyor`);
    }
  });
}

export function checkRootsIndex({ relativePath, parsed }: StaticFile, s: StaticState): void {
  const result = staticRootsIndex.safeParse(parsed);
  tick();
  if (!result.success) errors.push(`${relativePath}: ${result.error.message}`);
  else s.rootsIndexEntries = result.data.roots.length;
}

export function checkRootFile({ relativePath, parsed, base }: StaticFile, s: StaticState): void {
  const result = staticRoot.safeParse(parsed);
  tick();
  if (!result.success) {
    errors.push(`${relativePath}: ${result.error.message}`);
    return;
  }
  s.rootFiles += 1;
  const root = result.data;
  s.rootFileNames.add(root.arabic);
  // Dosya adi kokun kendisi olmali; adres de bu adi kullaniyor.
  if (base !== `${root.arabic}.json`) {
    errors.push(`${relativePath}: dosya adi ${root.arabic}.json olmali`);
  }
  if (root.occurrences.length !== root.occurrenceCount) {
    errors.push(
      `${relativePath}: occurrenceCount ${root.occurrenceCount} ama ` +
        `${root.occurrences.length} gecis var`,
    );
  }
  // Gecisler sure/ayet sirasinda olmali; sayfa onlari sirayla grupluyor.
  let previous = 0;
  for (const occurrence of root.occurrences) {
    const key = occurrence.surahId * 1000 + occurrence.verseNumber;
    if (key < previous) {
      errors.push(`${relativePath}: gecisler sirali degil (${occurrence.surahId}:${occurrence.verseNumber})`);
      break;
    }
    previous = key;
  }
}

export function checkWordFile({ relativePath, parsed, base }: StaticFile, s: StaticState): void {
  const result = staticVerseWords.safeParse(parsed);
  tick();
  if (!result.success) {
    errors.push(`${relativePath}: ${result.error.message}`);
    return;
  }
  s.wordFiles += 1;
  const wordData = result.data;
  if (base !== `verse_${wordData.surahId}_${wordData.verseNumber}.json`) {
    errors.push(
      `${relativePath}: dosya adi verse_${wordData.surahId}_${wordData.verseNumber}.json olmali`,
    );
  }
  wordData.words.forEach((word, index) => {
    if (word.position !== index + 1) {
      errors.push(`${relativePath}: ${index + 1}. sirada konum ${word.position} var`);
    }
    // Kok bilgisi ya tam gelir ya hic gelmez; yarim kayit baglanti kirar.
    if ((word.rootArabic === null) !== (word.rootLatin === null)) {
      errors.push(`${relativePath}: kelime ${word.position} yarim kok bilgisi tasiyor`);
    }
    if (word.rootArabic !== null) s.referencedRoots.add(word.rootArabic);
  });
  s.wordCount += wordData.words.length;
}
