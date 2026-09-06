/**
 * Medya modulu duman testleri (spec 32-71).
 *
 * Buradaki testler "sema derleniyor mu" testi DEGIL; modulun uc icerik
 * kapisinin gercekten kapali oldugunu dogrular:
 *
 *   1. Kisitli lisansli gorsel sunucuya kopyalanamaz (spec 34)
 *   2. Peygamber tasvir eden prompt yuz kisitini tasimak zorunda (plan 20.3)
 *   3. Gercek medya ile AI medyasi ayni semada birlesemez (spec 32)
 *
 * Calistirma:  pnpm --filter @kuran/schema test:smoke
 */

import {
  aiMediaInput,
  aiPromptInput,
  mediaFile,
  mediaItemInput,
} from "../content_input.js";
import { isHostableLicense, requiresAttribution } from "../media.js";

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

const accepts = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;
const rejects = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  !schema.safeParse(value).success;

// -----------------------------------------------------------------------------
// Yardimci veri
// -----------------------------------------------------------------------------

/** Cudi Dagi panoramasi — spec 35'teki ornek, CC BY-SA. */
const validMedia = {
  id: "cudi-dagi-panorama",
  kind: "REAL_PHOTO",
  title: "Cudi Dagi panoramasi",
  description: null,
  caution: "Cudi, geleneksel olarak Sirnak'taki Cudi Dagi ile iliskilendirilmektedir.",
  sourceName: "Wikimedia Commons",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Cudi_Dagi_panorama.jpg",
  originalUrl: null,
  author: null,
  institution: null,
  date: null,
  license: "CC_BY_SA",
  licenseRaw: "cc-by-sa-4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  copyright: "Foto: ornek yazar, CC BY-SA 4.0",
  locationName: "Sirnak, Turkiye",
  lat: 37.3667,
  lng: 42.4667,
  localPath: null,
  width: null,
  height: null,
  locationSlug: "cudi",
  storySlugs: ["hz-nuh"],
  timelineOrders: [],
  verseRefs: ["11:44"],
  manuscriptId: null,
  sourceSlugs: ["wikimedia-commons"],
};

const validPrompt = {
  id: "nuh-geminin-hazirlanmasi",
  title: "Nuh'un gemisinin hazirlanmasi",
  promptType: "IMAGE",
  prompt:
    "Cinematic historical visualization of the construction of a large ancient wooden vessel. Prophet Noah must not have an identifiable face.",
  negativePrompt: "modern buildings, modern vehicles, text, watermark",
  model: null,
  durationSec: null,
  aspectRatio: "16:9",
  version: 1,
  depictsProphet: true,
  storySlug: "hz-nuh",
  locationSlug: null,
  timelineOrder: null,
  baseImagePromptId: null,
};

const validAiMedia = {
  id: "nuh-geminin-hazirlanmasi-v1",
  kind: "AI_IMAGE",
  promptId: "nuh-geminin-hazirlanmasi",
  title: "Nuh'un gemisinin hazirlanmasi",
  generator: "file-queue",
  model: "ornek-model",
  localPath: "ai/cikti/nuh-geminin-hazirlanmasi-v1.png",
  sha256: "a".repeat(64),
  width: 1920,
  height: 1080,
  durationSec: null,
  createdAt: "2026-09-06T12:00:00+03:00",
  faceScanned: false,
  faceScanNote: null,
};

// -----------------------------------------------------------------------------
// 1. Lisans kapisi (spec 34)
// -----------------------------------------------------------------------------
console.log("1. Lisans kapisi");
check("gecerli CC BY-SA kaydi kabul edilir", accepts(mediaItemInput, validMedia));
check(
  "CC BY-SA dosyasi indirilebilir (localPath dolu)",
  accepts(mediaItemInput, { ...validMedia, localPath: "gorsel/cudi-panorama.jpg" }),
);
check(
  "COPYRIGHT + localPath dolu REDDEDILIR",
  rejects(mediaItemInput, {
    ...validMedia,
    license: "COPYRIGHT",
    localPath: "gorsel/telifli.jpg",
  }),
);
check(
  "UNKNOWN + localPath dolu REDDEDILIR",
  rejects(mediaItemInput, { ...validMedia, license: "UNKNOWN", localPath: "gorsel/x.jpg" }),
);
check(
  "LINK_ONLY + localPath dolu REDDEDILIR",
  rejects(mediaItemInput, { ...validMedia, license: "LINK_ONLY", localPath: "gorsel/x.jpg" }),
);
check(
  "COPYRIGHT + localPath null kabul edilir (yalnizca baglanti)",
  accepts(mediaItemInput, { ...validMedia, license: "COPYRIGHT", localPath: null }),
);
check("isHostableLicense COPYRIGHT icin false", !isHostableLicense("COPYRIGHT"));
check("isHostableLicense CC0 icin true", isHostableLicense("CC0"));

console.log("2. Atif zorunlulugu");
check(
  "CC BY-SA + copyright bos REDDEDILIR",
  rejects(mediaItemInput, { ...validMedia, copyright: "   " }),
);
check(
  "PUBLIC_DOMAIN + copyright null kabul edilir",
  accepts(mediaItemInput, { ...validMedia, license: "PUBLIC_DOMAIN", copyright: null }),
);
check("requiresAttribution CC0 icin false", !requiresAttribution("CC0"));
check("requiresAttribution CC_BY icin true", requiresAttribution("CC_BY"));
check(
  "requiresAttribution UNKNOWN icin false (barindirmiyoruz, atif uydurulmaz)",
  !requiresAttribution("UNKNOWN"),
);
check(
  "UNKNOWN + copyright null kabul edilir (lisans cekilmeden onceki hal)",
  accepts(mediaItemInput, { ...validMedia, license: "UNKNOWN", copyright: null }),
);

console.log("3. Kunye ve konum butunlugu");
check("sourceSlugs bos REDDEDILIR", rejects(mediaItemInput, { ...validMedia, sourceSlugs: [] }));
check(
  "sourceUrl gecersizse REDDEDILIR",
  rejects(mediaItemInput, { ...validMedia, sourceUrl: "commons.wikimedia.org" }),
);
check("lat dolu lng bos REDDEDILIR", rejects(mediaItemInput, { ...validMedia, lng: null }));
check("width dolu height bos REDDEDILIR", rejects(mediaItemInput, { ...validMedia, width: 100 }));
check(
  "AI turu gercek medya semasina giremez (spec 32)",
  rejects(mediaItemInput, { ...validMedia, kind: "AI_IMAGE" }),
);
check(
  "dosya icinde mukerrer id REDDEDILIR",
  rejects(mediaFile, { place: "cudi", note: null, items: [validMedia, validMedia] }),
);

// -----------------------------------------------------------------------------
// 4. Prompt kapilari (plan 20.3, spec 65)
// -----------------------------------------------------------------------------
console.log("4. AI prompt");
check("gecerli prompt kabul edilir", accepts(aiPromptInput, validPrompt));
check(
  "peygamber tasviri + yuz kisiti YOK REDDEDILIR",
  rejects(aiPromptInput, {
    ...validPrompt,
    prompt: "Cinematic historical visualization of an ancient wooden vessel.",
  }),
);
check(
  "peygamber tasvir etmeyen prompt kisit istemez",
  accepts(aiPromptInput, {
    ...validPrompt,
    depictsProphet: false,
    prompt: "Cinematic historical visualization of an ancient wooden vessel.",
  }),
);
check(
  "Turkce prompt REDDEDILIR (plan 20.3)",
  rejects(aiPromptInput, {
    ...validPrompt,
    depictsProphet: false,
    prompt: "Geminin yapımını gösteren sinematik tarihsel canlandırma, ışık yumuşak.",
  }),
);
check(
  "Arapca prompt REDDEDILIR",
  rejects(aiPromptInput, { ...validPrompt, depictsProphet: false, prompt: "سفينة نوح" }),
);
check(
  "IMAGE prompt'unda durationSec dolu REDDEDILIR",
  rejects(aiPromptInput, { ...validPrompt, durationSec: 10 }),
);
check(
  "VIDEO prompt'unda durationSec bos REDDEDILIR",
  rejects(aiPromptInput, { ...validPrompt, promptType: "VIDEO", durationSec: null }),
);
check(
  "VIDEO + 10 sn kabul edilir (spec 57)",
  accepts(aiPromptInput, {
    ...validPrompt,
    id: "nuh-geminin-hazirlanmasi-video",
    promptType: "VIDEO",
    durationSec: 10,
    baseImagePromptId: "nuh-geminin-hazirlanmasi",
  }),
);
check(
  "prompt kendi baslangic gorseli olamaz",
  rejects(aiPromptInput, {
    ...validPrompt,
    promptType: "VIDEO",
    durationSec: 10,
    baseImagePromptId: validPrompt.id,
  }),
);
check(
  "IMAGE prompt'unda baseImagePromptId REDDEDILIR",
  rejects(aiPromptInput, { ...validPrompt, baseImagePromptId: "baska-prompt" }),
);
check(
  "bagsiz prompt REDDEDILIR",
  rejects(aiPromptInput, { ...validPrompt, storySlug: null }),
);

// -----------------------------------------------------------------------------
// 5. Uretilmis AI medyasi
// -----------------------------------------------------------------------------
console.log("5. AI medyasi");
check("gecerli AI kaydi kabul edilir", accepts(aiMediaInput, validAiMedia));
check(
  "AI kaydina yazilan lisans/kaynak alani cikTIya GECMEZ (spec 32)",
  (() => {
    const parsed = aiMediaInput.safeParse({
      ...validAiMedia,
      license: "CC_BY_SA",
      sourceName: "Wikimedia Commons",
    });
    if (!parsed.success) return false;
    const keys = Object.keys(parsed.data);
    return !keys.includes("license") && !keys.includes("sourceName");
  })(),
);
check(
  "kisa sha256 REDDEDILIR",
  rejects(aiMediaInput, { ...validAiMedia, sha256: "abc" }),
);
check(
  "AI_VIDEO + durationSec bos REDDEDILIR",
  rejects(aiMediaInput, { ...validAiMedia, kind: "AI_VIDEO", durationSec: null }),
);
check(
  "AI_IMAGE + durationSec dolu REDDEDILIR",
  rejects(aiMediaInput, { ...validAiMedia, durationSec: 10 }),
);
check(
  "localPath bos REDDEDILIR (AI ciktisini biz barindiririz)",
  rejects(aiMediaInput, { ...validAiMedia, localPath: "" }),
);
check(
  "gercek medya turu AI semasina giremez",
  rejects(aiMediaInput, { ...validAiMedia, kind: "REAL_PHOTO" }),
);

// -----------------------------------------------------------------------------

console.log(`\n${passed} test gecti, ${failures.length} basarisiz`);
if (failures.length > 0) {
  console.error("\nBasarisiz testler:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
