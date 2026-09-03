/**
 * Turkce metinden URL slug'i uretir.
 *
 * URL slug'lari tire ayiricilidir (plan 20.2): /yusuf-suresi/90
 * Turkce normalizasyon: I/i, i/i, s/s, g/g, c/c, o/o, u/u (plan 6 arama bolumu).
 */

const turkishMap: Readonly<Record<string, string>> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
  â: "a",
  Â: "a",
  î: "i",
  Î: "i",
  û: "u",
  Û: "u",
  ê: "e",
  Ê: "e",
  ô: "o",
  Ô: "o",
  "'": "",
  "’": "",
};

export function slugify(input: string): string {
  const mapped = [...input].map((ch) => turkishMap[ch] ?? ch).join("");
  return mapped
    .toLowerCase()
    // Kalan birlesik isaretleri (combining marks) at
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Sure slug'i: "Âl-i İmrân" -> "al-i-imran-suresi" */
export function surahSlug(nameTr: string): string {
  return `${slugify(nameTr)}-suresi`;
}
