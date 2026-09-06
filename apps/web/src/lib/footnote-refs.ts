import { getScripture, getSurahsIndex } from "./data";

/**
 * Dipnotlarda gecen ayet referanslarini bulur — plan §2.3, §12.4.
 *
 * Bir mealin dipnotu "Bakara 2:83", "Nahl 16/96" ya da "(2:186)" diye ayete
 * atif yapiyorsa okuyucu oraya tek tiklamayla gidebilmeli. 33.367 dipnotta
 * ~45.000 boyle atif var.
 *
 * ## ISLENMEYEN ATIF BAGLANMAZ (bu dosyanin en onemli kurali)
 *
 * Dipnotlarin bir kismi Kur'an'a DEGIL Tevrat'a, Incil'e ya da baska bir
 * esere atif yapiyor: "Yeşeya 40/25", "Mısır'dan Çıkış 34:28", "Matta 12:40",
 * "Leviticus 3:17". Bunlarin bicimi Kur'an atfiyla birebir ayni. Kor bir
 * `\d+:\d+` eslesmesi okuyucuyu Tevrat atfindan bir Kur'an ayetine goturur —
 * bu, kaynagin soylemedigi bir sey soylemek olur (CLAUDE.md kural 4).
 *
 * Bu yuzden baglama kurali GENIS degil DAR: emin olamadigimiz atif duz metin
 * kalir. Uc kademe eleme var — (1) sayidan onceki kelime, (2) dipnotun
 * tamami, (3) ayetin gercekten var olmasi.
 *
 * Olcum (2026-09-06, 33.367 dipnotun tamami taranarak): 46.036 baglanti.
 *
 *   26.790  suleymaniye-vakfi          (kaynagin kendi {{s:a}} isaretleri)
 *   14.413  mehmet-okuyan              ("Bakara 2:83, 183; Nisâ 4:59")
 *    1.596  edip-yuksel
 *    1.342  suleymaniye-vakfi-eski-baski  ("Bakara 2/153")
 *      864  erhan-aktas
 *      517  erhan-aktas-10-baski
 *      497  ali-riza-safa
 *       17  abul-ala-maududi
 *
 * Elenen ~370 atif: yabanci kaynak adi tasiyanlar, olmayan ayeti gosterenler,
 * adiyla celisenler ve kirli dipnottaki ciplak atiflar. Eleme bilerek fazla
 * calisiyor: bir avuc dogru baglanti kaybetmek, okuyucuyu Tevrat atfindan bir
 * Kur'an ayetine goturen tek bir baglanti uretmekten iyidir.
 */

export type FootnoteSegment =
  | { kind: "text"; value: string }
  | { kind: "ref"; label: string; surahId: number; verseNumber: number }
  | {
      kind: "scripture";
      label: string;
      osisId: string;
      chapter: number;
      verse: number;
    };

// ---------------------------------------------------------------------------
// Sure adi tanima
// ---------------------------------------------------------------------------

/**
 * Ad karsilastirmasi icin sadelestirme.
 *
 * Ayni sure her mealde baska turlu yaziliyor: "Âl-i İmrân" / "Al-i İmrân",
 * "En‘âm" / "En'am", "A‘râf" / "Araf". Aksan, kesme isareti ve buyuk harf
 * atilir; Turkce'ye ozgu harfler ASCII karsiligina duser.
 *
 * Son adim CIFT SESSIZ SADELESTIRME: "Hacc" → "hac", "Cinn" → "cin",
 * "Saff" → "saf". Bunlar tek basina 313 atif ediyordu. 114 adin sadelesmis
 * hali birbirine esit degil (build'de dogrulaniyor), yani bu adim iki sureyi
 * birbirine karistirmaz.
 */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]/g, "")
    .replace(/(.)\1+/g, "$1");
}

let surahIdByName: ReadonlyMap<string, number> | undefined;

/**
 * Kaynaklarda gecen ama `surahs_index.json`'daki yazimla sadelestirilince
 * eslesmeyen adlar. Kisa tutulur: her satir olculmus bir eksigi kapatir.
 */
const NAME_ALIASES: Readonly<Record<string, number>> = {
  mutafifun: 83, // "Mütaffifûn" — dizinde "Mutaffifîn"
  baqarah: 2, // Ingilizce dipnotlarda
};

function nameIndex(): ReadonlyMap<string, number> {
  if (surahIdByName !== undefined) return surahIdByName;
  const map = new Map<string, number>();
  for (const surah of getSurahsIndex().surahs) {
    const key = normalizeName(surah.nameTr);
    const clash = map.get(key);
    if (clash !== undefined) {
      throw new Error(
        `Sure adi sadelestirmesi cakisti: ${String(clash)} ve ${String(surah.id)} ikisi de ` +
          `'${key}' oluyor. normalizeName() gevsetilmis olmali (footnote-refs.ts).`,
      );
    }
    map.set(key, surah.id);
  }
  for (const [key, id] of Object.entries(NAME_ALIASES)) map.set(key, id);
  surahIdByName = map;
  return map;
}

let verseCountById: ReadonlyMap<number, number> | undefined;

function verseCount(surahId: number): number {
  if (verseCountById === undefined) {
    verseCountById = new Map(getSurahsIndex().surahs.map((surah) => [surah.id, surah.verseCount]));
  }
  return verseCountById.get(surahId) ?? 0;
}

function isRealVerse(surahId: number, verseNumber: number): boolean {
  return surahId >= 1 && surahId <= 114 && verseNumber >= 1 && verseNumber <= verseCount(surahId);
}

/**
 * Sayidan ONCE gelen kelime buyuk harfle basliyorsa kural olarak yabanci
 * kaynak adi sayilir ("Matta 12:40"). Bu liste istisnalari tutar: cumle
 * basinda buyuk yazilan yonlendirme kelimeleri.
 */
const CUE_WORDS: ReadonlySet<string> = new Set(
  [
    "bak",
    "bkz",
    "bakınız",
    "bakiniz",
    "örneğin",
    "ayrıca",
    "nitekim",
    "krş",
    "ayet",
    "ayetler",
    "ayetinde",
    "ayetlerinde",
    "ve",
    "ile",
    "için",
    "çünkü",
    "ancak",
    "kuran",
    "kuranın",
    "kur'an",
    "kur'anın",
    "see",
    "cf",
    "verse",
    "verses",
  ].map(normalizeName),
);

// ---------------------------------------------------------------------------
// Kaynagin kendi isaretleri — {{2:153}}Bakara 2/153{{/}}
// ---------------------------------------------------------------------------

/**
 * Suleymaniye Vakfi meali atiflarini KAYNAKTA isaretli getiriyor:
 * `{{16:96}}Nahl 16/96,{{/}}`. 26.817 isaret; hepsi dengeli, ici hep
 * `sure:ayet`.
 *
 * 2026-09-06'ya kadar bu isaretler sayfaya OLDUGU GIBI basiliyordu —
 * okuyucu dipnotta `{{16:96}}` gorüyordu. Yani burasi hem yeni bir ozellik
 * hem eski bir hatanin duzeltmesi.
 *
 * Isaretli dipnotta KUR'AN icin duz metin taramasi CALISTIRILMAZ: kaynak neyin
 * atif oldugunu zaten soylemis. Kitab-i Mukaddes taramasi yine de calisir —
 * Suleymaniye Vakfi Tevrat atiflarini isaretlemiyor, 282 tanesi isaretlerin
 * disinda duz metin olarak duruyor.
 */
const MARKER = /\{\{(\d{1,3}):(\d{1,3})\}\}([\s\S]*?)\{\{\/\}\}/g;
/** Esi bulunmayan isaret kalintisi sayfaya basilmaz. */
const STRAY_MARKER = /\{\{[^{}]*\}\}/g;

/** Baglantinin sonuna noktalama alinmaz: "Kamer 54/36." → bag "Kamer 54/36". */
const TRAILING_PUNCTUATION = /[\s.,;:]+$/;

function pushText(segments: FootnoteSegment[], value: string): void {
  if (value === "") return;
  const last = segments[segments.length - 1];
  if (last?.kind === "text") last.value += value;
  else segments.push({ kind: "text", value });
}

function splitMarked(text: string): FootnoteSegment[] {
  const segments: FootnoteSegment[] = [];
  let cursor = 0;
  MARKER.lastIndex = 0;

  for (let match = MARKER.exec(text); match !== null; match = MARKER.exec(text)) {
    pushText(segments, text.slice(cursor, match.index).replace(STRAY_MARKER, ""));
    cursor = match.index + match[0].length;

    const surahId = Number(match[1]);
    const verseNumber = Number(match[2]);
    const inner = match[3] ?? "";

    if (!isRealVerse(surahId, verseNumber)) {
      // Kaynakta 11 tane olmayan ayete isaret var (ornek: 81:30, Tekvir 29
      // ayet). Uydurma hedef uretilmez; metin oldugu gibi kalir.
      pushText(segments, inner.replace(STRAY_MARKER, ""));
      continue;
    }

    const label = inner.replace(TRAILING_PUNCTUATION, "");
    if (label === "") {
      pushText(segments, inner);
      continue;
    }
    segments.push({ kind: "ref", label, surahId, verseNumber });
    pushText(segments, inner.slice(label.length));
  }

  pushText(segments, text.slice(cursor).replace(STRAY_MARKER, ""));
  return segments;
}

// ---------------------------------------------------------------------------
// Duz metin taramasi — "Bakara 2:83, 183; Al-i İmrân 3:39"
// ---------------------------------------------------------------------------

/**
 * Dipnotta Kur'an DISI bir kutsal metne atif yapildiginin isareti.
 *
 * Sayidan hemen onceki kelimeye bakmak yetmiyor, cunku atif zinciri araya
 * noktalama koyuyor: "Kitab-ı Mukaddes, Çıkış: 2:1, 6:16-20, 7:7" — buradaki
 * "2:1" ve "7:7" onunde hicbir ozel ad tasimadan geliyor ama hepsi Tevrat'a
 * ait. Bu yuzden dipnotun TAMAMINA bakilir: listede bir ad geciyorsa o
 * dipnottaki ciplak atiflar birakilir.
 *
 * Liste bilerek AYIRT EDICI adlarla sinirli. "Vahiy", "Sayılar", "Çıkış",
 * "Yaratılış" gibi kelimeler ayni zamanda gundelik Turkce — onlari listeye
 * koymak "Yaratılış amacıyla ilgili... En‘âm 6:73" gibi dogru atiflari da
 * elerdi. O ornekler zaten yukaridaki liste uzerinden yakalaniyor.
 */
const FOREIGN_SCRIPTURE =
  /Tevrat|İncil|Zebur|Zebûr|Kitab-ı Mukaddes|Kitabı Mukaddes|Eski Ahit|Yeni Ahit|Mezmur|Tekvin|Levililer|Tesniye|Yeşeya|Yeşaya|Yeremya|Hezekiel|Matta|Markos|Luka|Yuhanna|Korintliler|Galatyalılar|Bible|Torah|Gospel|Genesis|Exodus|Leviticus|Deuteronomy|Psalms|Numbers/;

/**
 * Hem sure hem Kitab-ı Mukaddes kitabi olan adlar.
 *
 * "Yunus 1:3" bir surenin ucuncu ayeti de olabilir, Yunus kitabinin birinci
 * bolum ucuncu ayeti de. Dipnotta yabanci kutsal metin adi geciyorsa bu ad
 * belirsizdir ve baglanmaz.
 */
const AMBIGUOUS_NAMES: ReadonlySet<number> = new Set([10]); // Yûnus

const LETTER = "A-Za-zÂÊÎÔÛÄÖÜÇĞŞİIâêîôûäöüçğşı‘'’";
/**
 * En fazla uc kelime + `sure:ayet` ya da `sure/ayet` (istege bagli `-bitis`).
 *
 * Iki ayirici iki ayri kaynak gelenegi: Mehmet Okuyan "Nahl 16:125" yazar,
 * Suleymaniye Vakfi "Nahl 16/125". Ama `/` bicimi COK daha kaygan — "2/3
 * oraninda", "1/4", bir adresteki "content/6/1/326" hepsi ayni kaliba uyar.
 * Bu yuzden `/` yalnizca sure ADI ile birlikte kabul edilir (asagida).
 */
const PROSE_REF = new RegExp(
  `((?:[${LETTER}]+[ \\-]?){0,3})(\\d{1,3})([:/])(\\d{1,3})(?:-(\\d{1,3}))?`,
  "g",
);
const WORD = new RegExp(`[${LETTER}]+`, "g");
/** Liste devami: "2:83, 183" icindeki ", 183". */
const CONTINUATION = /^(,\s*)(\d{1,3})(-\d{1,3})?/;
/** Ad eslesmesinde atlanan kelimeler: "Bakara Suresi 2/153". */
const NAME_FILLERS: ReadonlySet<string> = new Set(["suresi", "suresinin", "sure", "sures"]);

interface ProseHit {
  /** Sayinin basladigi yer — sure adi baglantiya alinmaz. */
  start: number;
  end: number;
  surahId: number;
  verseNumber: number;
  label: string;
  /** Baglanabilir mi. */
  accept: boolean;
  /** Sure adiyla yazilmis mi (ciplak atiftan daha guvenli). */
  named: boolean;
  /**
   * Bu dipnottaki CIPLAK atiflara guveni bozar mi.
   *
   * Yalnizca Kur'an disi bir kaynak adi gorulduğunde. Sayilari tutmayan bir
   * atif (olmayan ayet, `/` bicimi) sadece kendini eler, dipnotu kirletmez.
   */
  taints: boolean;
}

function scanProse(text: string): ProseHit[] {
  const names = nameIndex();
  const hits: ProseHit[] = [];
  PROSE_REF.lastIndex = 0;

  for (let match = PROSE_REF.exec(text); match !== null; match = PROSE_REF.exec(text)) {
    const surahId = Number(match[2]);
    const separator = match[3];
    const verseNumber = Number(match[4]);
    const prefix = match[1] ?? "";
    const start = match.index + prefix.length;
    const numbers = match[0].slice(prefix.length);

    const tokens = (prefix.match(WORD) ?? []).filter(
      (token) => !NAME_FILLERS.has(normalizeName(token)),
    );
    let named: number | undefined;
    for (const size of [3, 2, 1]) {
      if (tokens.length < size) continue;
      const candidate = names.get(normalizeName(tokens.slice(tokens.length - size).join("")));
      if (candidate !== undefined) {
        named = candidate;
        break;
      }
    }

    const previous = tokens[tokens.length - 1];
    const foreignName =
      named === undefined &&
      previous !== undefined &&
      previous !== previous.toLowerCase() &&
      !CUE_WORDS.has(normalizeName(previous));

    const accept =
      isRealVerse(surahId, verseNumber) &&
      !foreignName &&
      // Adi yazilmis ama BASKA bir sureyi gosteriyorsa (9 ornek) atif
      // celiskilidir; tahmin yurutmek yerine duz metin birakilir.
      (named === undefined || named === surahId) &&
      (separator === ":" || named !== undefined);

    hits.push({
      start,
      end: match.index + match[0].length,
      surahId,
      verseNumber,
      label: numbers,
      accept,
      named: named !== undefined,
      taints: foreignName,
    });
  }
  return hits;
}

function splitProse(text: string): FootnoteSegment[] {
  const hits = scanProse(text);
  if (hits.length === 0) return [{ kind: "text", value: text }];

  /** Dipnotta bir kez yabanci atif gectiyse ciplak atiflara guvenilmez. */
  const tainted = hits.some((hit) => hit.taints) || FOREIGN_SCRIPTURE.test(text);

  const segments: FootnoteSegment[] = [];
  let cursor = 0;

  for (const hit of hits) {
    if (hit.start < cursor) continue; // devam sayilariyla yutulmus
    if (!hit.accept) continue;
    // Kirli dipnotta ciplak atif da, iki anlamli sure adi da baglanmaz.
    if (tainted && (!hit.named || AMBIGUOUS_NAMES.has(hit.surahId))) continue;

    pushText(segments, text.slice(cursor, hit.start));
    segments.push({
      kind: "ref",
      label: hit.label,
      surahId: hit.surahId,
      verseNumber: hit.verseNumber,
    });
    cursor = hit.end;

    // "Bakara 2:83, 183, 286" — sonraki sayilar ayni surenindir.
    for (;;) {
      const next = CONTINUATION.exec(text.slice(cursor));
      if (next === null) break;
      const verseNumber = Number(next[2]);
      if (!isRealVerse(hit.surahId, verseNumber)) break;
      pushText(segments, next[1] ?? "");
      segments.push({
        kind: "ref",
        label: `${next[2] ?? ""}${next[3] ?? ""}`,
        surahId: hit.surahId,
        verseNumber,
      });
      cursor += next[0].length;
    }
  }

  pushText(segments, text.slice(cursor));
  return segments;
}


// ---------------------------------------------------------------------------
// Kitab-i Mukaddes atiflari — "Mısır'dan Çıkış 34:28", "Matta 12:40"
// ---------------------------------------------------------------------------

/**
 * Dipnotta Kur'an DISI bir kutsal metin adi geciyor mu.
 *
 * `needsContext` isaretli kitap adlari (Çıkış, Yaratılış, Yunus, Vahiy, Yakup)
 * ayni zamanda gundelik Turkce. Onlari ancak dipnot bu baglami tasiyorsa kitap
 * sayiyoruz. Liste `scripts/import/scripture.ts` icindekiyle AYNI olmali:
 * ayrisirlarsa arayuz alintisi olan bir atfi tanimaz ya da olmayanini tanir.
 */
const CANON_CUE =
  /Tevrat|İncil|Zebur|Zebûr|Kitab-ı Mukaddes|Kitabı Mukaddes|Eski Ahit|Yeni Ahit|Kutsal Kitap|Bible|Torah|Gospel|Old Testament|New Testament/;

const ROMAN_ORDINAL: Readonly<Record<string, number>> = {
  i: 1,
  ii: 2,
  iii: 3,
  "1": 1,
  "2": 2,
  "3": 3,
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface ScriptureMatcher {
  pattern: RegExp;
  resolve: (name: string, ordinal: number | null) => { osisId: string } | undefined;
  needsContext: (name: string) => boolean;
}

let scriptureMatcher: ScriptureMatcher | null | undefined;

/**
 * Kitap adi tanima makinesi.
 *
 * Uzun ad once denenir ("Mısır'dan Çıkış", "Çıkış"tan once) — kisa ad once
 * gelseydi uzun adin yarisiyla eslesip yanlis kitabi verirdi.
 */
function getScriptureMatcher(): ScriptureMatcher | null {
  if (scriptureMatcher !== undefined) return scriptureMatcher;
  const scripture = getScripture();
  if (scripture === null) {
    scriptureMatcher = null;
    return null;
  }

  const byName = new Map<string, { osisId: string; ordinal: number | null }[]>();
  const contextual = new Set<string>();
  for (const book of scripture.books) {
    for (const name of book.names) {
      const key = name.text.toLocaleLowerCase("tr");
      const list = byName.get(key) ?? [];
      list.push({ osisId: book.osisId, ordinal: book.ordinal });
      byName.set(key, list);
      if (name.needsContext === true) contextual.add(key);
    }
  }

  const alternatives = [...byName.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => escapeRegExp(name));

  scriptureMatcher = {
    pattern: new RegExp(
      `(?:\\b(I{1,3}|[123])\\s*\\.?\\s*)?\\b(${alternatives.join("|")})\\b[\\s,:.]{0,3}(\\d{1,3})\\s*[:/]\\s*(\\d{1,3})(?:\\s*[-–]\\s*\\d{1,3})?`,
      "gi",
    ),
    resolve(name, ordinal) {
      const list = byName.get(name.toLocaleLowerCase("tr"));
      if (list === undefined || list.length === 0) return undefined;
      if (ordinal !== null) {
        const exact = list.find((book) => book.ordinal === ordinal);
        if (exact !== undefined) return exact;
      }
      return list.find((book) => book.ordinal === null) ?? list[0];
    },
    needsContext(name) {
      return contextual.has(name.toLocaleLowerCase("tr"));
    },
  };
  return scriptureMatcher;
}

/**
 * Duz metin parcalarindaki Kitab-i Mukaddes atiflarini isaretler.
 *
 * Kur'an taramasindan SONRA calisir: Kur'an ayristiricisi yabanci kaynak adi
 * tasiyan atiflari zaten duz metin olarak birakiyor, burasi onlari topluyor.
 * Boylece iki tarama ayni metin parcasi icin yarismiyor.
 */
function markScripture(segments: FootnoteSegment[], hasCue: boolean): FootnoteSegment[] {
  const matcher = getScriptureMatcher();
  if (matcher === null) return segments;

  const out: FootnoteSegment[] = [];
  for (const segment of segments) {
    if (segment.kind !== "text") {
      out.push(segment);
      continue;
    }
    const text = segment.value;
    let cursor = 0;
    matcher.pattern.lastIndex = 0;
    for (
      let match = matcher.pattern.exec(text);
      match !== null;
      match = matcher.pattern.exec(text)
    ) {
      const name = match[2] ?? "";
      if (matcher.needsContext(name) && !hasCue) continue;
      const ordinalToken = match[1]?.toLocaleLowerCase("tr");
      const ordinal = ordinalToken === undefined ? null : (ROMAN_ORDINAL[ordinalToken] ?? null);
      const book = matcher.resolve(name, ordinal);
      if (book === undefined) continue;

      pushText(out, text.slice(cursor, match.index));
      out.push({
        kind: "scripture",
        label: match[0],
        osisId: book.osisId,
        chapter: Number(match[3]),
        verse: Number(match[4]),
      });
      cursor = match.index + match[0].length;
    }
    pushText(out, text.slice(cursor));
  }
  return out;
}

/**
 * Dipnot metnini duz parcalar ve ayet baglantilarina ayirir.
 *
 * Isaretli dipnot (Suleymaniye Vakfi) ile duz metin dipnotu ayri islenir;
 * ikisi ayni dipnotta calistirilmaz — bkz. dosya basi.
 */
export function splitVerseReferences(text: string): FootnoteSegment[] {
  const segments = text.includes("{{") ? splitMarked(text) : splitProse(text);
  return markScripture(segments, CANON_CUE.test(text));
}
