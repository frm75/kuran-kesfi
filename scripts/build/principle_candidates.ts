/**
 * Aday ilke tarama scripti — Kur'an metnini tarar, ADAY kok listesi cikarir.
 *
 * BU SCRIPT ILKE YAZMAZ. `data/` altina HICBIR SEY YAZMAZ; tek ciktisi
 * `reports/principle_candidates.md` adinda, insanin okuyup KARAR VERECEGI
 * bir rapordur. Hangi adaylarin ilke olacagina kullanici karar verir
 * (CLAUDE.md kural 4: Platform kendi ilkesini icat etmez).
 *
 * ## Yontem — neden boyle
 *
 * Kelime verisinde morfoloji yok: kelimeler kok tasir ama kip/POS etiketi
 * tasimaz (emir mi, haber mi, 2. tekil mi 3. cogul mu bilinmez). Bu yuzden
 * tarama uc dolayli sinyali birlestirir (plan brief Step 2):
 *
 *   1. Arapca yapisal isaret: "Ey iman edenler" / "Ey insanlar" hitaplari,
 *      nehiy kalibi (olumsuz emir: "ve/fe + lâ + fiil"), "farz kilindi"
 *      kalibi ("kutibe aleykum").
 *   2. Turkce mealde (varsayilan yazar) emir/nehiy kaliplari.
 *   3. Kok kapsama farki: bu ayetlerdeki kokler 64 ilkenin rootLatin
 *      kumesinde yoksa aday.
 *
 * Sinyal 1+2 bir ayeti "aday ayet" yapar. Sinyal 3 o ayetteki HANGI kokun
 * aday oldugunu belirler. Saf "ayetteki her kok adaydir" yaklasimi denendi
 * ve elendi: en sik gecen kokler (Allah, demek, olmak, Rab, bilmek...) her
 * adaylik listesinin basina cikiyordu — bunlar dilbilgisel iskele, davranissal
 * ilke degil. Bunun yerine kok, ayetin GRAMER OLARAK yasaklanan/emredilen
 * sozcugune (ve nehiy durumunda hemen ardindaki tumlecine) veya kelime bazli
 * Turkce mealin emir/nehiy gorunumune capalanirsa YUKSEK GUVEN puani alir;
 * "Ey iman edenler/insanlar" hitabiyla acilan ayetlerde butun icerik kokleri
 * ORTA GUVEN puani alir (bu hitap gercekten genis bir talimat blogu acar);
 * baska hicbir durumda ayetteki bir kok sirf ayni cumlede gectigi icin puan
 * ALMAZ. Asiri sik kokler (esik: 300 gecis — mevcut 20 kok-etiketli ilkenin
 * en sigi 292) puan disi birakilir; bu olcum, tahmin degildir.
 *
 * Turkce sinyalde kisa ekler (celik "-in/-ın/-un/-ün" veya "-ma/-me") de
 * denendi: Turkce'de bu ekler iyelik/olumsuz mastar ekleriyle ayni gorunur
 * ("insanların" = "of the people", emir degil) ve deneyde kok listesinin
 * basini anlamsiz bicimde isgal etti (bkz. task-5-report.md). Bu yuzden
 * yalnizca daha az belirsiz bicimler kullanilir: "-mayin/-meyin" (olumsuz
 * resmi emir), "-iniz/-ınız/-unuz/-ünüz" (resmi emir) ve birkac sabit sozcuk
 * ("sakinin", "kacinin" vb.). Bu, geri cekilme (recall) kaybeder ama yanlis
 * pozitifi cok azaltir — raporun "Sinirlar" bolumune yazilmistir.
 *
 * ## Tekrarlanabilirlik (plan 20.1)
 *
 * Script zaman damgasi, rastgelelik veya ortam bagimli deger URETMEZ.
 * Ayni veri -> ayni bayt. Iki ardisik calistirma diff'i bos olmalidir.
 *
 * ## Dogrulama kapisi
 *
 * strip() Uthmani imla normalizasyonu uygular. Referans sayilar (6236 ayet
 * uzerinde olculmustur): "Ey iman edenler" 88, "Ey insanlar" 14, nehiy 285,
 * "farz kilindi" 5. Bu dortlu tutmuyorsa script DURUR — sessiz sifir sonuc
 * bu tur bir taramada en gorunmez hata bicimidir.
 *
 * Calistirma:  pnpm --filter @kuran/build candidates
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  StaticAuthorsIndex,
  StaticRootsIndex,
  StaticSurah,
  StaticSurahTranslation,
  StaticVerseWords,
} from "@kuran/schema";

// ---------------------------------------------------------------------------
// Repo koku ve veri yollari
// ---------------------------------------------------------------------------

function findRepoRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("Repo koku bulunamadi: pnpm-workspace.yaml hicbir ust dizinde yok");
}

const REPO_ROOT = findRepoRoot();
const DATA_DIR = resolve(REPO_ROOT, "apps/web/public/data");
/** Tek kaynak (plan): rootLatin alani yalnizca kaynak veride var. */
const SOURCE_PRINCIPLES_DIR = resolve(REPO_ROOT, "data/principles");
const REPORT_PATH = resolve(REPO_ROOT, "reports/principle_candidates.md");

// ---------------------------------------------------------------------------
// Uthmani imla normalizasyonu
// ---------------------------------------------------------------------------

/**
 * TUZAK: hareke araligini fethatan (U+064B) ile bitirmek fatha, damma,
 * kasra, sedde, sukun (U+064E-U+0652) ve medde (U+0653) isaretlerini KACIRIR.
 * Bu isaretler Uthmani metinde harflerin arasina girdigi icin duz kalip
 * eslesmesi tutmaz ve script HATA VERMEDEN sifir sonuc dondurur. Asagidaki
 * karakter sinifi brief'ten (task-5-brief.md Step 1) BAYT DUZEYINDE
 * kopyalanmistir -- elle yeniden yazilmamalidir (bkz. task-5-report.md,
 * hareke sirasi bulgusu).
 */
const STRIP_CLASS_RE = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const ALEF_CLASS_RE = /[آأإٱ]/g;
const HAMZA_ALEF_RE = /ءا/g;
const YA_MAKSURA_RE = /ى/g;

const strip = (s: string): string =>
  s
    .normalize("NFC")
    .replace(STRIP_CLASS_RE, "")
    .replace(ALEF_CLASS_RE, "ا")
    .replace(HAMZA_ALEF_RE, "ا")
    .replace(YA_MAKSURA_RE, "ي")
    .replace(/\s+/g, " ")
    .trim();

// ---------------------------------------------------------------------------
// Sinyal 1: Arapca yapisal kaliplar (brief Step 1 tablosu, verbatim)
// ---------------------------------------------------------------------------

const BELIEVERS_RE = /^يا?ايها الذين امنوا/;
const PEOPLE_RE = /^يا?ايها الناس/;
const NEHIY_RE = /(^|\s)(ولا|فلا) ت/;
const KUTIBE_RE = /كتب عليكم/;

// ---------------------------------------------------------------------------
// Sinyal 2: Turkce meal emir/nehiy kaliplari (varsayilan yazar uzerinden)
// ---------------------------------------------------------------------------

/**
 * Kasitli olarak dar tutulmustur — bkz. dosya basi aciklama. Celik "-ın/-in/
 * -un/-ün" ve celik "-ma/-me" denendi, iyelik/mastar ekleriyle ayirt
 * edilemedigi icin cikarildi.
 */
function trImperativeWord(word: string): boolean {
  if (/(mayın|meyin|mayınız|meyiniz)$/i.test(word)) return true;
  if (/(ınız|iniz|unuz|ünüz)$/.test(word)) return true;
  if (/^(sakının|sakın|kaçının|kaçın|ediniz|edin)$/i.test(word)) return true;
  return false;
}

/** Belirgin yanlis pozitifler: iyelik zamirleri, edatlar. */
const TR_STOPLIST = new Set([
  "onun", "bunun", "şunun", "senin", "benim", "kendin", "neyin", "kimin", "niçin", "için",
]);

function hasTrImperative(sentence: string): boolean {
  const words = sentence.split(/[^\p{L}]+/u).filter(Boolean);
  for (const word of words) {
    if (TR_STOPLIST.has(word.toLocaleLowerCase("tr"))) continue;
    if (trImperativeWord(word)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Veri yukleme
// ---------------------------------------------------------------------------

interface VerseRecord {
  readonly surahId: number;
  readonly verseNumber: number;
  readonly ref: string;
  readonly surahNameTr: string;
  readonly textUthmani: string;
  readonly stripped: string;
  readonly isBelievers: boolean;
  readonly isPeople: boolean;
  readonly isNehiy: boolean;
  readonly isKutibe: boolean;
  readonly signal1: boolean;
  translation: string;
  signal2: boolean;
}

function loadVerses(): VerseRecord[] {
  const surahDir = resolve(DATA_DIR, "surah");
  const files = readdirSync(surahDir).filter((f) => f.endsWith(".json")).sort();
  const verses: VerseRecord[] = [];
  for (const file of files) {
    const surah = JSON.parse(readFileSync(resolve(surahDir, file), "utf8")) as StaticSurah;
    for (const v of surah.verses) {
      const stripped = strip(v.textUthmani);
      const isBelievers = BELIEVERS_RE.test(stripped);
      const isPeople = PEOPLE_RE.test(stripped);
      const isNehiy = NEHIY_RE.test(stripped);
      const isKutibe = KUTIBE_RE.test(stripped);
      verses.push({
        surahId: surah.id,
        verseNumber: v.verseNumber,
        ref: `${surah.id}:${v.verseNumber}`,
        surahNameTr: surah.nameTr,
        textUthmani: v.textUthmani,
        stripped,
        isBelievers,
        isPeople,
        isNehiy,
        isKutibe,
        signal1: isBelievers || isPeople || isNehiy || isKutibe,
        translation: "",
        signal2: false,
      });
    }
  }
  return verses;
}

/**
 * Varsayilan yazari sabit kodlamak yerine apps/web/src/lib/data.ts'teki
 * getDefaultAuthor ile ayni mantikla cozer: oncelik 1 olan meal (plan 3.1).
 */
function resolveDefaultAuthorSlug(): string {
  const authorsIndex = JSON.parse(
    readFileSync(resolve(DATA_DIR, "authors_index.json"), "utf8"),
  ) as StaticAuthorsIndex;
  const byPriority = authorsIndex.authors
    .filter((a) => a.priority !== null)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  const chosen = byPriority[0] ?? authorsIndex.authors.find((a) => a.isDefault) ?? authorsIndex.authors[0];
  if (chosen === undefined) throw new Error("authors_index.json bos: ontanimli meal yok");
  return chosen.slug;
}

function loadDefaultTranslations(authorSlug: string, verseByRef: Map<string, VerseRecord>): void {
  const translationDir = resolve(DATA_DIR, "translation", authorSlug);
  const files = readdirSync(translationDir).filter((f) => f.endsWith(".json")).sort();
  for (const file of files) {
    const data = JSON.parse(readFileSync(resolve(translationDir, file), "utf8")) as StaticSurahTranslation;
    for (const v of data.verses) {
      const rec = verseByRef.get(`${data.surahId}:${v.verseNumber}`);
      if (rec) rec.translation = v.text;
    }
  }
}

interface PrincipleRecord {
  readonly slug: string;
  readonly nameTr: string;
  readonly rootLatin: string | null;
  readonly verseRefs: readonly string[];
}

function loadSourcePrinciples(): PrincipleRecord[] {
  const files = readdirSync(SOURCE_PRINCIPLES_DIR).filter((f) => f.endsWith(".json")).sort();
  const principles: PrincipleRecord[] = [];
  for (const file of files) {
    const data = JSON.parse(readFileSync(resolve(SOURCE_PRINCIPLES_DIR, file), "utf8")) as {
      slug: string;
      nameTr: string;
      rootLatin: string | null;
      verses: { ref: string }[];
    };
    principles.push({
      slug: data.slug,
      nameTr: data.nameTr,
      rootLatin: data.rootLatin,
      verseRefs: data.verses.map((v) => v.ref),
    });
  }
  return principles;
}

interface RootMeta {
  readonly arabic: string;
  readonly meaningSummary: string | null;
  readonly occurrenceCount: number;
}

function loadRootsMeta(): Map<string, RootMeta> {
  const rootsIndex = JSON.parse(
    readFileSync(resolve(DATA_DIR, "roots_index.json"), "utf8"),
  ) as StaticRootsIndex;
  const map = new Map<string, RootMeta>();
  for (const r of rootsIndex.roots) {
    map.set(r.latin, { arabic: r.arabic, meaningSummary: r.meaningSummary, occurrenceCount: r.occurrenceCount });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Ana akis
// ---------------------------------------------------------------------------

function main(): void {
  const verses = loadVerses();
  const verseByRef = new Map(verses.map((v) => [v.ref, v] as const));

  // --- Dogrulama kapisi ---------------------------------------------------
  const BEKLENEN = { believers: 88, people: 14, nehiy: 285, kutibe: 5 } as const;
  const sayim = {
    believers: verses.filter((v) => v.isBelievers).length,
    people: verses.filter((v) => v.isPeople).length,
    nehiy: verses.filter((v) => v.isNehiy).length,
    kutibe: verses.filter((v) => v.isKutibe).length,
  };
  for (const [ad, beklenen] of Object.entries(BEKLENEN)) {
    const gercek = sayim[ad as keyof typeof sayim];
    if (gercek !== beklenen) {
      throw new Error(
        `Normalizasyon bozuldu: ${ad} = ${String(gercek)}, beklenen ${String(beklenen)}. ` +
          `Sessiz sifir sonuc bu tarama icin en gorunmez hata bicimi; rapor uretilmedi.`,
      );
    }
  }
  console.log(`Dogrulama kapisi gecti: believers=${sayim.believers} people=${sayim.people} nehiy=${sayim.nehiy} kutibe=${sayim.kutibe}`);

  // --- Sinyal 2: varsayilan meal ------------------------------------------
  const defaultAuthorSlug = resolveDefaultAuthorSlug();
  loadDefaultTranslations(defaultAuthorSlug, verseByRef);
  for (const v of verses) {
    v.signal2 = v.translation.length > 0 && hasTrImperative(v.translation);
  }

  // --- 64 ilkenin kapsadigi kokler + ayet->ilke ters dizini ---------------
  const principles = loadSourcePrinciples();
  const coveredRoots = new Set(principles.map((p) => p.rootLatin).filter((r): r is string => r !== null));
  const verseRefToPrinciples = new Map<string, { slug: string; nameTr: string }[]>();
  for (const p of principles) {
    for (const ref of p.verseRefs) {
      const arr = verseRefToPrinciples.get(ref) ?? [];
      arr.push({ slug: p.slug, nameTr: p.nameTr });
      verseRefToPrinciples.set(ref, arr);
    }
  }

  const rootsMeta = loadRootsMeta();
  /** Asiri sik kokler (esik olcumu dosya basi yorumunda). */
  const FREQUENCY_CAP = 300;

  // --- Aday ayetler: sinyal1 OR sinyal2 ------------------------------------
  const candidateVerses = verses.filter((v) => v.signal1 || v.signal2);

  type Tier = 2 | 5;
  interface Support {
    readonly ref: string;
    readonly tier: Tier;
    readonly reason: string;
  }
  interface RootAgg {
    readonly latin: string;
    readonly arabic: string;
    readonly supports: Map<string, Support>;
  }
  const rootAgg = new Map<string, RootAgg>();

  function addSupport(rootLatin: string, ref: string, tier: Tier, reason: string): void {
    if (coveredRoots.has(rootLatin)) return;
    const meta = rootsMeta.get(rootLatin);
    if (!meta || meta.occurrenceCount > FREQUENCY_CAP) return;
    let agg = rootAgg.get(rootLatin);
    if (!agg) {
      agg = { latin: rootLatin, arabic: meta.arabic, supports: new Map() };
      rootAgg.set(rootLatin, agg);
    }
    const existing = agg.supports.get(ref);
    if (!existing || existing.tier < tier) {
      agg.supports.set(ref, { ref, tier, reason });
    }
  }

  let missingWordFiles = 0;
  for (const v of candidateVerses) {
    const wordPath = resolve(DATA_DIR, "word", `verse_${v.surahId}_${v.verseNumber}.json`);
    if (!existsSync(wordPath)) {
      missingWordFiles += 1;
      continue;
    }
    const wordData = JSON.parse(readFileSync(wordPath, "utf8")) as StaticVerseWords;
    const words = wordData.words;
    const normWords = words.map((w) => strip(w.arabic));

    // Hitap ayetleri (Ey iman edenler / Ey insanlar): genis talimat blogu —
    // ayetteki her icerik koku orta guven puani alir.
    if (v.isBelievers || v.isPeople) {
      for (const w of words) {
        if (w.rootLatin) {
          addSupport(w.rootLatin, v.ref, 2, v.isBelievers ? "hitap: Ey iman edenler" : "hitap: Ey insanlar");
        }
      }
    }

    // Dogrudan nehiy capasi: "ve-lâ/fe-lâ FIIL" — fiilin kendisi VE (varsa)
    // hemen ardindaki 1-2 icerik sozcugu (tumleç). "lâ takrabû X" gibi
    // yapilarda asil konu fiil degil tumlectir (orn. zina, 17:32).
    for (let i = 0; i < normWords.length - 1; i++) {
      const w0 = normWords[i];
      const w1 = normWords[i + 1];
      if (w0 === undefined || w1 === undefined) continue;
      if ((w0 === "ولا" || w0 === "فلا") && w1.startsWith("ت")) {
        const verb = words[i + 1];
        if (verb?.rootLatin) addSupport(verb.rootLatin, v.ref, 5, "dogrudan nehiy (ve/fe-lâ fiil)");
        for (let j = i + 2; j < Math.min(i + 4, words.length); j++) {
          const obj = words[j];
          if (obj?.rootLatin) addSupport(obj.rootLatin, v.ref, 5, "dogrudan nehiy - tumlec");
        }
      }
    }

    // Dogrudan farz kilma capasi: "kutibe aleykum X" — X'in koku.
    for (let i = 0; i < normWords.length - 1; i++) {
      if (normWords[i] === "كتب" && normWords[i + 1] === "عليكم") {
        for (let j = i + 2; j < Math.min(i + 4, words.length); j++) {
          const obj = words[j];
          if (obj?.rootLatin) {
            addSupport(obj.rootLatin, v.ref, 5, "dogrudan farz kilma (kutibe aleykum)");
            break;
          }
        }
      }
    }

    // Kelime bazli Turkce yankisi: kelimenin kendi meal karsiligi emir/nehiy
    // gorunumundeyse, o kelimenin koku dogrudan capalanir.
    for (const w of words) {
      if (w.rootLatin && w.translationTr && trImperativeWord(w.translationTr.trim())) {
        addSupport(w.rootLatin, v.ref, 5, `meal (kelime bazli): "${w.translationTr.trim()}"`);
      }
    }
  }

  // --- Puanlama + siralama --------------------------------------------------
  interface ScoredRoot {
    readonly latin: string;
    readonly arabic: string;
    readonly score: number;
    readonly directCount: number;
    readonly hitapCount: number;
    readonly verseCount: number;
    readonly supports: Support[];
  }
  const scored: ScoredRoot[] = [];
  for (const agg of rootAgg.values()) {
    let directCount = 0;
    let hitapCount = 0;
    for (const s of agg.supports.values()) {
      if (s.tier === 5) directCount += 1;
      else hitapCount += 1;
    }
    const score = directCount * 5 + hitapCount * 2;
    const supports = [...agg.supports.values()].sort((a, b) => {
      const [as, av] = a.ref.split(":").map(Number);
      const [bs, bv] = b.ref.split(":").map(Number);
      return (as ?? 0) - (bs ?? 0) || (av ?? 0) - (bv ?? 0);
    });
    scored.push({ latin: agg.latin, arabic: agg.arabic, score, directCount, hitapCount, verseCount: agg.supports.size, supports });
  }
  scored.sort((a, b) => b.score - a.score || b.verseCount - a.verseCount || a.latin.localeCompare(b.latin));

  // --- Rapor uretimi ---------------------------------------------------------
  const DETAIL_CAP = 30;
  const detailed = scored.slice(0, DETAIL_CAP);
  const rest = scored.slice(DETAIL_CAP);

  const lines: string[] = [];
  lines.push("# Aday ilke tarama raporu");
  lines.push("");
  lines.push(
    "Bu rapor scripts/build/principle_candidates.ts tarafindan uretilmistir. " +
      "**Script ilke yazmaz** — data/ altina hicbir sey koymaz, yalnizca bu " +
      "dosyayi uretir. Hangi adaylarin ilke olacagina KULLANICI karar verir " +
      "(CLAUDE.md kural 4: Platform kendi ilkesini icat etmez).",
  );
  lines.push("");
  lines.push("## Yontem ozeti");
  lines.push("");
  lines.push(
    "Bir ayet, (a) Arapca yapisal isaret (\"Ey iman edenler/insanlar\" hitabi, " +
      "nehiy kalibi, \"farz kilindi\" kalibi) veya (b) varsayilan mealde " +
      `(**${defaultAuthorSlug}**) emir/nehiy gorunumu tasiyorsa \"aday ayet\" ` +
      "sayilir. Bu ayetlerdeki kokler, 64 ilkenin rootLatin kumesinde " +
      "(kaynak: data/principles/*.json, tek kaynak) yoksa aday koktur.",
  );
  lines.push("");
  lines.push(
    "Kok kapsama kontrolu YALNIZCA rootLatin alani DOLU olan ilkeleri gorur " +
      `(64 ilkeden ${coveredRoots.size} tanesi). Tek koke indirgenemeyen ` +
      "diger ilkeler (orn. kibirden-kacinma) bu kontrolde GORUNMEZ; bu " +
      "raporun bir kor noktasidir, asagidaki \"Sinirlar\" bolumune bakin.",
  );
  lines.push("");
  lines.push(
    `Asiri sik kokler (corpus genelinde ${FREQUENCY_CAP} gecisten fazla — ` +
      "mevcut kok-etiketli ilkelerin en sigi 292'dir, bu esik olculmustur, " +
      "tahmin degil) aday listesinden cikarilir; aksi halde \"Allah\", " +
      "\"demek\", \"olmak\" gibi dilbilgisel iskele kokler listenin basini " +
      "isgal eder.",
  );
  lines.push("");
  lines.push("## Siralama kurali");
  lines.push("");
  lines.push(
    "Her aday kok, onu destekleyen ayetler uzerinden puanlanir. Bir ayetteki " +
      "destek iki seviyeden birine girer (ayni ayet birden fazla seviyeye " +
      "girerse en yuksegi sayilir, cift sayim yok):",
  );
  lines.push("");
  lines.push(
    "- **Dogrudan capa (5 puan):** kok, nehiy kalibindaki fiilin (veya hemen " +
      'ardindaki tumlecin), "farz kilindi" kalibindaki nesnenin ya da o ' +
      "kelimenin kendi Turkce meal karsiliginin AYNISI. Yuksek guven.",
  );
  lines.push(
    '- **Hitap blogu (2 puan):** kok, "Ey iman edenler" / "Ey insanlar" ile ' +
      "acilan bir ayette geciyor (bu hitap genis bir talimat blogu acar, " +
      "ayetin butun icerik kokleri sayilir). Orta guven.",
  );
  lines.push("");
  lines.push(
    "Puan = 5 x (dogrudan capa sayisi) + 2 x (hitap blogu sayisi). Siralama: " +
      "puan azalan, esitlikte destekleyen ayet sayisi azalan, esitlikte " +
      "rootLatin alfabetik (tam belirlenimli, tekrarlanabilir).",
  );
  lines.push("");
  lines.push(
    `Toplam **${scored.length}** aday kok bulundu. Asagida ilk **${detailed.length}** ` +
      `tanesi ayrintili gosterilir; kalan **${rest.length}** tanesi kisa bir kuyruk ` +
      "listesinde ozetlenir (hicbiri gizlenmez).",
  );
  lines.push("");
  lines.push(
    `Taramaya giren aday ayet sayisi: **${candidateVerses.length} / ${verses.length}**.`,
  );
  if (missingWordFiles > 0) {
    lines.push(`Kelime dosyasi eksik olan aday ayet sayisi (atlandi): **${missingWordFiles}**.`);
  }
  lines.push("");
  lines.push("## Sinirlar (bilinen kor noktalar)");
  lines.push("");
  lines.push(
    "- **Morfoloji yok.** Kelime verisi kok tasir, kip/POS tasimaz. \"Emir\" " +
      "tespiti dolayli kaliplara dayanir; kesin degildir.",
  );
  lines.push(
    "- **Tekil hitaplar kacar.** \"Ey Muhammed\" gibi 2. tekil hitaplarla " +
      "verilen olumlu emirler (orn. 16:125 \"çağır ... mücadele et\") ne " +
      "Arapca nehiy kalibina ne de bu taramanin (resmi/cogul) Turkce emir " +
      "eklerine uyar; bu tur ayetler taramadan kacabilir.",
  );
  lines.push(
    "- **3. sahis tasvirler kacar.** Bir davranisi yasaklamak yerine TASVIR " +
      "eden ayetler (orn. 107:3 \"yoksula yedirmeyi ozendirmeyen\") 2. sahis " +
      "capasi tasimadigi icin sinyal 1'i tetiklemez.",
  );
  lines.push(
    "- **Es sesli kokler karisir.** Ayni ucharfli kok birden fazla anlam " +
      'tasiyabilir (orn. "نهر": hem "nehir" hem "azarlamak/tenhar"; ' +
      '"قهر": hem "üstün gelmek" hem "ezmek"; "دفع": hem "geri vermek" hem ' +
      '"savmak"). Rapor bu anlamlari AYIRT ETMEZ; bir kokun destekleyen ' +
      "ayetleri farkli anlamlari karistirabilir.",
  );
  lines.push(
    '- **Turkce sinyali dar tutuldu.** Celik "-ın/-in/-un/-ün" ve celik ' +
      '"-ma/-me" ekleri denendi; Turkce\'de bu ekler iyelik/mastar ' +
      "ekleriyle ayni gorundugu icin (\"insanların\" emir degildir) asiri " +
      "yanlis pozitif uretti ve cikarildi. Sonuc: bazi gercek emir/nehiy " +
      "ayetleri (kisa, tekil formlar) sinyal 2'yi tetiklemez.",
  );
  lines.push(
    "- **Kok-etiketsiz ilkeler gorunmez.** 44 ilkenin rootLatin alani bos " +
      "(tek koke indirgenemeyen kavramlar). Bir adayin koku bu ilkelerden " +
      "biriyle ORTUSUYOR olabilir; asagidaki \"ortusme\" alani (ayni ayetin " +
      "baska bir ilkede gecip gecmedigi) bunu KISMEN yakalar ama alani bos " +
      "olan ilkeleri kok bazinda algilamaz.",
  );
  lines.push("");
  lines.push("## Ayrintili adaylar");
  lines.push("");

  for (const [index, root] of detailed.entries()) {
    const meta = rootsMeta.get(root.latin);
    lines.push(`### ${index + 1}. ${root.arabic} — ${root.latin}`);
    lines.push("");
    lines.push(
      `Puan: **${root.score}** (dogrudan capa: ${root.directCount}, hitap blogu: ${root.hitapCount}) · ` +
        `destekleyen ayet: ${root.verseCount} · corpus genelinde gecis: ${meta?.occurrenceCount ?? "?"}`,
    );
    lines.push("");
    if (meta?.meaningSummary) {
      lines.push(`Kok anlami (mekanik alinti, taslak ad ONERISI degil bir sozluk ozeti): ${meta.meaningSummary}`);
      lines.push("");
    }
    lines.push("Dayanak ayetler:");
    lines.push("");
    const maxShown = 8;
    for (const s of root.supports.slice(0, maxShown)) {
      const v = verseByRef.get(s.ref);
      const overlap = verseRefToPrinciples.get(s.ref) ?? [];
      const overlapText = overlap.length > 0 ? ` [ortusme: ${overlap.map((o) => o.nameTr).join(", ")}]` : "";
      lines.push(
        `- **${s.ref}** (${v?.surahNameTr ?? "?"}) — ${s.reason}${overlapText}`,
      );
      if (v) {
        lines.push(`  - Meal (${defaultAuthorSlug}): ${v.translation || "(meal bulunamadi)"}`);
      }
    }
    if (root.supports.length > maxShown) {
      lines.push(`- ... ve ${root.supports.length - maxShown} ayet daha (liste kisaltildi)`);
    }
    lines.push("");
    const allOverlaps = new Set<string>();
    for (const s of root.supports) {
      for (const o of verseRefToPrinciples.get(s.ref) ?? []) allOverlaps.add(o.nameTr);
    }
    lines.push(
      allOverlaps.size > 0
        ? `Mevcut ilkelerle ortusme: **${allOverlaps.size}** ilke — ${[...allOverlaps].sort().join(", ")}`
        : "Mevcut ilkelerle ortusme: yok (bu ayetler simdilik hicbir ilkeye bagli degil)",
    );
    lines.push("");
    lines.push(`Onerilen ad (taslak, kok anlamina dayali — bir ilke ADI DEGIL, baslangic noktasi): "${root.arabic} / ${root.latin}"`);
    lines.push("");
  }

  lines.push("## Kuyruk (kisaltilmis)");
  lines.push("");
  lines.push(
    `Asagidaki ${rest.length} kok de aday olarak bulundu ama puanlari daha ` +
      "dusuk oldugu icin ayrintili gosterilmedi. Hicbiri gizlenmedi:",
  );
  lines.push("");
  lines.push("| # | Kok (Arapca) | rootLatin | Puan | Ayet sayisi |");
  lines.push("|---|---|---|---|---|");
  for (const [index, root] of rest.entries()) {
    lines.push(`| ${DETAIL_CAP + index + 1} | ${root.arabic} | ${root.latin} | ${root.score} | ${root.verseCount} |`);
  }
  lines.push("");

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(`Rapor yazildi: ${REPORT_PATH}`);
  console.log(`Toplam aday kok: ${scored.length} (ayrintili: ${detailed.length}, kuyruk: ${rest.length})`);
}

main();
