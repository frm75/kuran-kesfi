import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";

/**
 * Icerik okuma — YAYINDAKI statik JSON dosyalarindan.
 *
 * Bot kendi icerigini uretmez, veritabanina da baglanmaz. Site build'inin
 * urettigi ve o an YAYINDA olan dosyalari okur (plan 19.6: "gunluk icerik
 * siteyle ayni schedule.json'dan okunur; icerik tek kaynaktan yonetilir").
 *
 * Bunun sonucu: bota giden ayet ve ilke, ziyaretcinin sitede gordugunun
 * aynisidir. AI uretimi ya da botun kendi yorumu YOKTUR (plan 19.2).
 */

export interface ScheduleEntry {
  dayIndex: number;
  verseId: number;
  surahId: number;
  verseNumber: number;
  principleSlug: string;
  occasion: string | null;
}

interface VerseFile {
  textUthmani: string;
  transcriptionTr: string | null;
  surahNameTr: string;
  surahSlug: string;
  verseNumber: number;
  translations: { authorSlug: string; authorName: string; text: string }[];
}

interface PrincipleFile {
  slug: string;
  nameTr: string;
  definition: string;
  dailyNote: string | null;
}

interface AuthorsIndex {
  authors: { slug: string; name: string; language: string; isDefault: boolean }[];
}

function readJson<T>(relativePath: string): T | null {
  const path = resolve(config.dataDir, relativePath);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Takvim her cagrida YENIDEN okunur, onbelleklenmez.
 *
 * Site yeniden yayinlandiginda `current` baska bir dizine bakiyor; onbellege
 * alsaydik bot yeniden baslatilana kadar ESKI takvimi gonderirdi ve bunu
 * kimse fark etmezdi. Dosya 366 satir, gunde birkac kez okunuyor.
 */
export function loadSchedule(): ScheduleEntry[] {
  return readJson<{ entries: ScheduleEntry[] }>("schedule.json")?.entries ?? [];
}

export function turkishAuthors(): { slug: string; name: string }[] {
  const index = readJson<AuthorsIndex>("authors_index.json");
  if (index === null) return [];
  return index.authors.filter((a) => a.language === "tr").map((a) => ({ slug: a.slug, name: a.name }));
}

export interface DailyMessage {
  text: string;
  /** Gunluk mesajin ayet baglantisi — testte ve gunlukte kullanilir */
  verseUrl: string;
}

/** Telegram HTML modunda kacilmasi gereken uc karakter. */
const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Gunluk mesaji kurar (plan 19.5 sablonu): Arapca, secili meal, ilke adi,
 * kisa kaynakli aciklama, siteye derin baglanti.
 *
 * Secili meal o ayette yoksa varsayilana, o da yoksa ilk Turkce meale duser
 * ve bunu SOYLER — sessizce baska bir yazarin metnini "senin sectigin meal"
 * gibi gostermek atif hatasi olurdu (CLAUDE.md kural 4).
 */
export function buildDailyMessage(
  entry: ScheduleEntry,
  authorSlug: string,
): DailyMessage | null {
  const verse = readJson<VerseFile>(
    `verse/verse_${String(entry.surahId)}_${String(entry.verseNumber)}.json`,
  );
  const principle = readJson<PrincipleFile>(`principle/principle_${entry.principleSlug}.json`);
  if (verse === null || principle === null) return null;

  const chosen =
    verse.translations.find((t) => t.authorSlug === authorSlug) ??
    verse.translations.find((t) => t.authorSlug === config.defaultAuthor) ??
    verse.translations[0];
  if (chosen === undefined) return null;

  const label = `${verse.surahNameTr} ${String(verse.verseNumber)}`;
  const verseUrl = `${config.siteUrl}/${verse.surahSlug}/${String(verse.verseNumber)}`;
  const principleUrl = `${config.siteUrl}/ilke/${principle.slug}`;
  const note = principle.dailyNote ?? principle.definition;

  const lines = [
    `<b>${escapeHtml(label)}</b>`,
    "",
    escapeHtml(verse.textUthmani),
    "",
    escapeHtml(chosen.text),
    `<i>${escapeHtml(chosen.authorName)} meali</i>`,
    chosen.authorSlug === authorSlug
      ? null
      : `<i>(Sectiginiz meal bu ayette yok; ${escapeHtml(chosen.authorName)} meali gosterildi.)</i>`,
    "",
    `<b>Ilke:</b> ${escapeHtml(principle.nameTr)}`,
    escapeHtml(note),
    "",
    `<a href="${verseUrl}">Ayet sayfasi</a> · <a href="${principleUrl}">Ilke sayfasi</a>`,
  ].filter((line): line is string => line !== null);

  return { text: lines.join("\n"), verseUrl };
}
