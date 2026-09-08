/**
 * Arama normalizasyonu — TEK KAYNAK.
 *
 * ## Neden tek dosya
 *
 * Bu mantık iki yerde çalışır: build (`scripts/build/lib/search.ts` token'ları
 * ÜRETİR) ve tarayıcı (sorguyu token'a ÇEVİRİR). İki kopya olsaydı biri
 * değişince arama sessizce boş dönerdi — hata yok, uyarı yok, sonuç yok. Bu
 * yüzden build script'i bu dosyayı doğrudan import eder, kendi kopyasını
 * tutmaz.
 *
 * ## Bu dosya hiçbir şey IMPORT ETMEZ
 *
 * Ne veri katmanı, ne Astro. Böylece hem tarayıcı paketine hem Node build
 * script'ine bedelsiz girer.
 */

/** Token'ın indekse girmesi için gereken en az harf sayısı. */
export const MIN_TOKEN_LENGTH = 2;

/**
 * Durak kelimeler. Tek başına aranmaları anlamsız, indekste yer kaplarlar.
 * Tırnaklı tam ifade aramasında YİNE DE kullanılırlar — bu küme yalnızca
 * indekslemeyi ve serbest sorgu token'larını süzer.
 *
 * Liste normalize EDİLMİŞ hâlleri tutar (`için` değil `icin`), çünkü süzme
 * `tokenize` içinde normalizasyondan sonra yapılır.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "ve",
  "ile",
  "bir",
  "bu",
  "su",
  "da",
  "de",
  "ki",
  "mi",
  "mu",
  "ise",
  "icin",
  "gibi",
  "ya",
  "veya",
  "ama",
  "fakat",
  "cok",
  "daha",
]);

/*
 * Noktalama HİÇE iner, boşluğa değil.
 *
 * "En'âm" -> "enam" olmalı, "en am" değil: kullanıcı kesme işaretini yazmadan
 * "enam" arar ve tek token beklenir. Aynı gerekçeyle "Âl-i İmrân" -> "ali
 * imran" (tire silinir, aradaki boşluk kalır).
 */
const PUNCTUATION_RE = /['’`´.,;:!?()[\]{}"«»–—_/\\-]/g;

/**
 * Türkçe'ye özel küçültme + ASCII katlama.
 *
 * TUZAK: düz `toLowerCase()` `I` harfini `i` yapar; Türkçe'de `I`'nın küçüğü
 * `ı`'dır. `IRMAK` düz küçültmeyle `irmak` yerine yanlış token üretir ve
 * `ırmak` araması tutmaz. `toLocaleLowerCase("tr")` bunu çözer; ASCII
 * katlaması ondan SONRA gelir, yoksa `ı` daha küçültülmeden `i`'ye çevrilirdi.
 */
export function normalizeTr(input: string): string {
  return input
    .normalize("NFC")
    .toLocaleLowerCase("tr")
    .replace(/[âäà]/g, "a")
    .replace(/[îïì]/g, "i")
    .replace(/[ûùü]/g, "u")
    .replace(/[êëè]/g, "e")
    .replace(/[ôöò]/g, "o")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c")
    .replace(PUNCTUATION_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * Arapça karakter sınıfları.
 *
 * STRIP_CLASS_RE `scripts/build/principle_candidates.ts:112` ile AYNI kod
 * noktalarını kapsar; oradaki uyarı geçerlidir. Aralığı fethatan (U+064B) ile
 * BİTİRMEK fatha, damma, kasra, şedde, sükûn ve medde işaretlerini KAÇIRIR;
 * kalıp eşleşmesi hata vermeden sıfır sonuç döndürür.
 *
 * Burada görünür birleşen işaret yerine `\u` kaçışları kullanıldı: kaynak
 * dosyada işaretler tirelere bitişik görünüp aralığı yanlış okutuyor
 * (U+061A-U+0670 sanılıp Arapça HARFLERİ de silen bir aralık gibi duruyor).
 * Kaçışlarla aralık ne ise o:
 *
 *   U+0610-U+061A   şeref/dua işaretleri
 *   U+064B-U+065F   harekeler (fethatan ... ters küçük hemze)
 *   U+0670          üstteki elif
 *   U+06D6-U+06ED   Kur'an durak ve secâvend işaretleri
 *   U+0640          tatvîl (uzatma çizgisi)
 *
 * Arapça harf aralığı (U+0621-U+064A) BİLEREK dışarıda — silinseydi indeks
 * boşalırdı.
 */
const STRIP_CLASS_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
/** آ أ إ ٱ -> ا */
const ALEF_CLASS_RE = /[\u0622\u0623\u0625\u0671]/g;
/** ءا -> ا */
const HAMZA_ALEF_RE = /\u0621\u0627/g;
/** ى (elif maksûre) ve ی (Fars yâ'sı) -> ي */
const YA_MAKSURA_RE = /[\u0649\u06CC]/g;
/** ة -> ه */
const TA_MARBUTA_RE = /\u0629/g;

/**
 * Arapça normalizasyon.
 *
 * İndeks girdisi `verse.text_no_vowel` kolonudur; hareke zaten yoktur ama
 * hamzeli/medli elif (`أ`, `آ`) DURUR — `أيها`, `آمنوا`. Bu yüzden katlama
 * yine gerekir, yoksa `ايها` arayan `أيها` bulamaz.
 */
export function normalizeAr(input: string): string {
  return input
    .normalize("NFC")
    .replace(STRIP_CLASS_RE, "")
    .replace(ALEF_CLASS_RE, "ا")
    .replace(HAMZA_ALEF_RE, "ا")
    .replace(YA_MAKSURA_RE, "ي")
    .replace(TA_MARBUTA_RE, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

/** Arapça blok (U+0600-U+06FF) + Arapça ek blok (U+0750-U+077F). */
const ARABIC_RANGE_RE = /[\u0600-\u06FF\u0750-\u077F]/;

/** Sorgunun hangi ad alanında aranacağını belirler (bkz. `query.ts`). */
export function hasArabic(input: string): boolean {
  return ARABIC_RANGE_RE.test(input);
}

/** Normalize eder, boşluktan böler, kısa ve durak token'ları eler. */
export function tokenize(input: string, script: "tr" | "ar"): string[] {
  const normalized = script === "ar" ? normalizeAr(input) : normalizeTr(input);
  if (normalized === "") return [];
  return normalized
    .split(" ")
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t));
}

/*
 * Türkçe ünsüz yumuşaması. ASCII katlama SONRASI hâline kurulur, çünkü
 * `softenFinal` normalize edilmiş token alır: `ç` orada zaten `c` olmuştur.
 *
 * `c` kendine eşlenir — katlama yumuşak hâli zaten üretmiştir, ama tablo
 * eksiksiz dursun ve `agac` gibi girdiler `null` yerine kendilerini döndürsün.
 */
const SOFTEN: Readonly<Record<string, string>> = { p: "b", c: "c", t: "d", k: "g" };

/**
 * Sorgu token'ının yumuşamış hâli — `kitap` -> `kitab`, böylece `kitabı`
 * bulunur. İNDEKSE ek kayıt yazılmaz; bu yalnızca sorgu tarafında ikinci bir
 * ön ek denemesidir (bkz. `expandPrefixes`).
 *
 * @returns yumuşamış token, ya da yumuşama uygulanamıyorsa `null`
 */
export function softenFinal(token: string): string | null {
  if (token.length < MIN_TOKEN_LENGTH) return null;
  const last = token[token.length - 1] ?? "";
  const soft = SOFTEN[last];
  if (soft === undefined) return null;
  return token.slice(0, -1) + soft;
}
