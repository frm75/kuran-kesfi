/**
 * Arama normalizasyonu duman testleri.
 *
 * Bu modül HEM build (scripts/build/lib/search.ts) HEM istemci tarafında
 * çalışır. İki taraf ayrışırsa indekste duran token ile sorgudan çıkan token
 * tutmaz ve arama SESSİZCE boş döner — hata yok, sonuç yok. Testler o
 * sözleşmeyi kilitler.
 *
 * Calistirma:  pnpm --filter @kuran/web test:smoke
 */

import {
  normalizeTr,
  normalizeAr,
  hasArabic,
  tokenize,
  softenFinal,
  STOPWORDS,
} from "../normalize.js";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.error(`  HATA ${label}`);
  }
}

console.log("1. Turkce kucultme");

// Turkce'ye ozel: I -> i DEGIL, I -> ı olmali. Duz toLowerCase() burada yanilir
// ve "ırmak" arayan "IRMAK" basligini bulamazdi.
check("ISTANBUL -> istanbul", normalizeTr("İSTANBUL") === "istanbul");
check("IRMAK -> irmak", normalizeTr("IRMAK") === "irmak");
check("Sabır -> sabir", normalizeTr("Sabır") === "sabir");

console.log("");
console.log("2. ASCII katlama");

check("salât -> salat", normalizeTr("salât") === "salat");
check("Yûsuf -> yusuf", normalizeTr("Yûsuf") === "yusuf");
check("Âl-i İmrân -> ali imran", normalizeTr("Âl-i İmrân") === "ali imran");
check("Şuarâ -> suara", normalizeTr("Şuarâ") === "suara");
check("Tegâbün -> tegabun", normalizeTr("Tegâbün") === "tegabun");
check("Yâsîn -> yasin", normalizeTr("Yâsîn") === "yasin");
check("Fîl -> fil", normalizeTr("Fîl") === "fil");

console.log("");
console.log("3. Noktalama");

// "yus." yazan kullanici Yusuf'u gormeli; sondaki nokta token'i bozmamali.
check("yus. -> yus", normalizeTr("yus.") === "yus");
check("En'âm -> enam", normalizeTr("En'âm") === "enam");
check("A'râf -> araf", normalizeTr("A'râf") === "araf");
check("Sebe' -> sebe", normalizeTr("Sebe'") === "sebe");
check("Mü'minûn -> muminun", normalizeTr("Mü'minûn") === "muminun");
check("bosluk dizisi tek bosluga iner", normalizeTr("  a   b  ") === "a b");

console.log("");
console.log("4. Arapca");

// text_no_vowel harekesiz gelir ama hamzeli/medli elif'i KORUR; katlama sart.
check("elif varyantlari birlesir", normalizeAr("أيها") === "ايها");
check("medli elif birlesir", normalizeAr("آمنوا") === "امنوا");
check("hareke atilir", normalizeAr("بِٱلصَّبْرِ") === "بالصبر");
check("ya maksura -> ya", normalizeAr("علی") === "علي");
check("te marbuta -> he", normalizeAr("الصلاة") === "الصلاه");
// Arapca HARFLER stripleniyorsa regex araligi bozulmustur; bu denetim onu yakalar.
check("arapca harfler korunur", normalizeAr("صبر") === "صبر");

console.log("");
console.log("5. Betik ayirimi");

check("arapca metin taninir", hasArabic("صبر") === true);
check("latin metin taninmaz", hasArabic("sabir") === false);
check("karisik metin arapca sayilir", hasArabic("sabir صبر") === true);
check("bos metin arapca degil", hasArabic("") === false);

console.log("");
console.log("6. Tokenize");

check(
  "durak kelimeler elenir",
  tokenize("sabir ve namaz ile", "tr").join(",") === "sabir,namaz",
);
check(
  "iki harften kisa token elenir",
  tokenize("a bc def", "tr").join(",") === "bc,def",
);
check(
  "arapca tokenize normalize eder",
  tokenize("بِٱلصَّبْرِ وَٱلصَّلَوٰةِ", "ar").join(",") === "بالصبر,والصلوه",
);
check("ve durak kelimedir", STOPWORDS.has("ve"));
check("sabir durak kelime DEGIL", !STOPWORDS.has("sabir"));
check("bos girdi bos dizi", tokenize("", "tr").length === 0);

console.log("");
console.log("7. Unsuz yumusamasi");

// "kitap" yazan "kitabı" bulmali; indekse ek kayit yazmadan, sorgu tarafinda.
check("kitap -> kitab", softenFinal("kitap") === "kitab");
check("renk -> reng", softenFinal("renk") === "reng");
check("dort -> dord", softenFinal("dort") === "dord");
check("agac degismez (c zaten yumusak)", softenFinal("agac") === "agac");
check("sabir yumusamaz (r ile biter)", softenFinal("sabir") === null);
check("tek harf yumusamaz", softenFinal("a") === null);

console.log("");
if (failures.length > 0) {
  console.error(`\n${String(failures.length)} basarisiz, ${String(passed)} gecti`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log(`${String(passed)} denetim gecti`);
}
