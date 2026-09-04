/**
 * Kaynak metin onarimi.
 *
 * Kaynaklardan gelen metinlerde, ICERIK OLMAYAN kodlama artiklari var.
 * Bunlar font alt kumelemesi sirasinda ortaya cikti (docs/BACKLOG.md
 * "Veri kalitesi"): meal metinlerinde C1 kontrol karakterleri.
 *
 * Ornek — Mahmoud Ghali cevirisi 39:56:
 *   (Lest) any self should say, <U+0091>Oh, for (my) regret ...
 * U+0091 gecerli bir karakter degil; cp1252'de 0x91 = ' (sol tek tirnak).
 * Metin cp1252 iken UTF-8 sanilmis, tirnak kontrol karakterine donusmus.
 *
 * ## Bu editoryal mudahale DEGILDIR
 *
 * CLAUDE.md kural 4: platform kendi editoryal yorumunu uretmez, kaynak
 * metnini degistirmez. Burada yapilan sey metni degistirmek degil, KODLAMA
 * HATASINI onarmak: yazarin yazdigi karakter zaten tirnak isaretiydi,
 * aktarim sirasinda bozuldu. Anlam degismiyor, gorunmeyen bir kutu yerine
 * yazarin koydugu isaret geliyor.
 *
 * Yine de hicbir degisiklik sessiz degildir: her onarim rapora yazilir.
 * Tanimadigi bir kontrol karakteri gorurse SUSMAZ, sorun olarak bildirir.
 */

/**
 * cp1252'nin 0x80-0x9F araligi.
 *
 * UTF-8'de bu aralik C1 kontrol karakterleridir ve metinde isi yoktur;
 * gorulduyse kaynak cp1252'dir. Tam tablo yaziliyor ki ilerde baska bir
 * kaynakta baska bir karakter cikarsa da dogru cozulsun.
 */
const CP1252_C1: Readonly<Record<number, string>> = {
  0x80: "€", // €
  0x82: "‚", // ‚
  0x83: "ƒ", // ƒ
  0x84: "„", // „
  0x85: "…", // …
  0x86: "†", // †
  0x87: "‡", // ‡
  0x88: "ˆ", // ˆ
  0x89: "‰", // ‰
  0x8a: "Š", // Š
  0x8b: "‹", // ‹
  0x8c: "Œ", // Œ
  0x8e: "Ž", // Ž
  0x91: "‘", // '
  0x92: "’", // '
  0x93: "“", // "
  0x94: "”", // "
  0x95: "•", // •
  0x96: "–", // –
  0x97: "—", // —
  0x98: "˜", // ˜
  0x99: "™", // ™
  0x9a: "š", // š
  0x9b: "›", // ›
  0x9c: "œ", // œ
  0x9e: "ž", // ž
  0x9f: "Ÿ", // Ÿ
};

/** Gorunmez, cizilmeyen bicimlendirme karakterleri. */
const INVISIBLE = new Set([
  0x200b, // sifir genislikli bosluk
  0x200c, // sifir genislikli birlestirmeyen
  0x200d, // sifir genislikli birlestiren
  0xfeff, // BOM
]);

/** Yon isaretleri — RTL metinde anlamli, saf LTR metinde artik. */
const DIRECTION_MARKS = new Set([0x200e, 0x200f]);

const RTL_PATTERN = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

export interface TextRepair {
  /** Onarimin gectigi yer: "mahmoud-ghali 39:56 meal" */
  where: string;
  codePoint: number;
  /** Ne yapildi */
  action: "cp1252" | "invisible" | "direction-mark";
  replacement: string;
}

export interface SanitizeResult {
  text: string;
  repairs: TextRepair[];
  /** Tanimlanamayan kontrol karakterleri — DEGISTIRILMEZ, bildirilir. */
  unknown: number[];
}

/**
 * Bir kaynak metnini onarir.
 *
 * - cp1252 C1 artiklarini dogru Unicode karsiligiyla degistirir
 * - gorunmez birlestirme karakterlerini siler
 * - yon isaretlerini YALNIZCA metinde hic RTL karakter yoksa siler
 *   (RTL varsa isaret anlamlidir, dokunulmaz)
 * - tanimadigi bir kontrol karakterini DEGISTIRMEZ, `unknown` icinde bildirir
 * - bas/son bosluklari kirpar (U+00A0 dahil; SQL btrim() onu silmez)
 */
export function sanitizeSourceText(raw: string, where: string): SanitizeResult {
  const repairs: TextRepair[] = [];
  const unknown: number[] = [];
  const hasRtl = RTL_PATTERN.test(raw);
  let out = "";

  for (const char of raw) {
    const cp = char.codePointAt(0);
    if (cp === undefined) continue;

    const mapped = CP1252_C1[cp];
    if (mapped !== undefined) {
      repairs.push({ where, codePoint: cp, action: "cp1252", replacement: mapped });
      out += mapped;
      continue;
    }
    if (INVISIBLE.has(cp)) {
      repairs.push({ where, codePoint: cp, action: "invisible", replacement: "" });
      continue;
    }
    if (DIRECTION_MARKS.has(cp) && !hasRtl) {
      repairs.push({ where, codePoint: cp, action: "direction-mark", replacement: "" });
      continue;
    }
    // Tab ve satir sonu gecerli; kalan C0/C1 kontrolleri tanimsiz.
    if ((cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || (cp >= 0x7f && cp <= 0x9f)) {
      unknown.push(cp);
    }
    out += char;
  }

  return { text: out.trim(), repairs, unknown };
}

/** Rapor satiri: "U+0091 → ' (cp1252) · 22 kez". */
export function summarizeRepairs(repairs: readonly TextRepair[]): string[] {
  const counts = new Map<string, { count: number; sample: TextRepair }>();
  for (const repair of repairs) {
    const key = `${repair.codePoint}:${repair.action}`;
    const existing = counts.get(key);
    if (existing === undefined) counts.set(key, { count: 1, sample: repair });
    else existing.count += 1;
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ count, sample }) => {
      const hex = `U+${sample.codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
      const target = sample.replacement === "" ? "silindi" : `'${sample.replacement}'`;
      return `${hex} -> ${target} (${sample.action}) · ${count} kez · ornek: ${sample.where}`;
    });
}

/**
 * Kaynak metnindeki basit HTML'i duz metne cevirir.
 *
 * Acik Kuran'in kok anlami alani HTML tasiyor:
 *   "...onaylamak<br><br> <strong>Türkçe'ye girmiş türevler:</strong> mümin, ..."
 *
 * Bu metni sayfaya HAM HTML olarak basmak istemiyoruz: kaynak verisi bir gun
 * degisirse sayfaya istemedigimiz isaretleme girer. Anlam kaybolmadan duz
 * metne ceviriliyor — <br> satir sonu olur, <strong> etiketi atilir, icerigi
 * kalir.
 *
 * Bilinmeyen bir etikete rastlarsa ATMAZ, oldugu gibi birakir ve `unknownTags`
 * ile bildirir; sessizce icerik kaybi olmaz.
 */
export interface StripHtmlResult {
  text: string;
  unknownTags: string[];
}

const KNOWN_TAGS = new Set(["br", "strong", "b", "em", "i", "p", "span", "div"]);

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function stripSourceHtml(raw: string): StripHtmlResult {
  const unknown = new Set<string>();

  const withBreaks = raw.replace(/<\s*br\s*\/?\s*>/gi, "\n").replace(/<\s*\/?\s*p\s*>/gi, "\n");

  const withoutTags = withBreaks.replace(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tag) => {
    const name = String(tag).toLowerCase();
    if (!KNOWN_TAGS.has(name)) {
      unknown.add(name);
      return match; // dokunma — kayip olmasin, rapora gecsin
    }
    return "";
  });

  const decoded = withoutTags.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    const value = String(entity);
    if (value.startsWith("#x") || value.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(value.slice(2), 16));
    }
    if (value.startsWith("#")) return String.fromCodePoint(Number.parseInt(value.slice(1), 10));
    return ENTITIES[value.toLowerCase()] ?? match;
  });

  // Ucten fazla ard arda satir sonu ve satir sonu bosluklari toparlanir.
  const tidy = decoded
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return { text: tidy, unknownTags: [...unknown] };
}
