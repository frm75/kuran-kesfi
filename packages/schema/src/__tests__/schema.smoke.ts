/**
 * GOREV 01 duman testleri.
 *
 * Gorev tanimindaki "Dogrulama" bolumu birebir uygulanir. Bu testler gecmeden
 * gorev tamamlanmis sayilmaz. VerseKey regex ve K4 kosullu dogrulama en sik
 * hata yapilan iki yerdir; ikisi de burada.
 *
 * Calistirma:  pnpm --filter @kuran/schema test:smoke
 */

import { checkPackageIntegrity, exportPackage, exportScholarNote, exportVideoSource } from "../export.js";
import { verseKeyRef } from "../references.js";

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
// 1. VerseKey regex
// -----------------------------------------------------------------------------
console.log("1. VerseKey");
check("'2:153' kabul edilir", accepts(verseKeyRef, "2:153"));
check("'1:1' kabul edilir", accepts(verseKeyRef, "1:1"));
check("'114:6' kabul edilir", accepts(verseKeyRef, "114:6"));
check("'115:1' reddedilir (sure ust siniri)", rejects(verseKeyRef, "115:1"));
check("'119:1' reddedilir (1[01]\\d tuzagi)", rejects(verseKeyRef, "119:1"));
check("'0:1' reddedilir", rejects(verseKeyRef, "0:1"));
check("'2:0' reddedilir (ayet >= 1)", rejects(verseKeyRef, "2:0"));
check("'sabir' reddedilir", rejects(verseKeyRef, "sabir"));
check("'2-153' reddedilir", rejects(verseKeyRef, "2-153"));

// -----------------------------------------------------------------------------
// Yardimci veri
// -----------------------------------------------------------------------------
const NOW = "2026-09-03T12:00:00+03:00";

const validNote = {
  scholar_slug: "mehmet-okuyan",
  video_id: "dQw4w9WgXcQ",
  segment_start_sec: 120,
  segment_end_sec: 185,
  note_type: "tefsir",
  summary: "Sabrin namazla birlikte anilmasi uzerine aciklama.",
  quote: "Sabir, kisinin kendini tutmasidir.",
  deep_link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s",
  confidence: "kesin",
  status: "reviewed",
  reviewer_id: "fatih",
  created_at: NOW,
  updated_at: NOW,
  linked_verses: ["2:153"],
  linked_principles: ["sabir"],
};

const validPackage = {
  schema_version: 1,
  exported_at: NOW,
  source: "local-extract",
  scholars: [{ slug: "mehmet-okuyan", name: "Mehmet Okuyan" }],
  video_sources: [
    {
      scholar_slug: "mehmet-okuyan",
      platform: "youtube",
      video_id: "dQw4w9WgXcQ",
      title: "Bakara 153 dersi",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
  ],
  scholar_notes: [validNote],
};

// -----------------------------------------------------------------------------
// 2. Gecerli paket + capraz referans
// -----------------------------------------------------------------------------
console.log("\n2. Gecerli ExportPackage");
const parsed = exportPackage.safeParse(validPackage);
check("paket parse edilir", parsed.success);
if (!parsed.success) {
  console.error(parsed.error.message);
} else {
  const problems = checkPackageIntegrity(parsed.data);
  check("checkPackageIntegrity bos doner", problems.length === 0);
  if (problems.length > 0) console.error(problems);
  check("linked_verses varsayilani uygulanir", Array.isArray(parsed.data.scholar_notes[0]?.tags));
}

// -----------------------------------------------------------------------------
// 3. segment_end_sec < segment_start_sec
// -----------------------------------------------------------------------------
console.log("\n3. Segment araligi");
check(
  "end < start reddedilir",
  rejects(exportScholarNote, { ...validNote, segment_start_sec: 200, segment_end_sec: 100 }),
);
check(
  "end == start kabul edilir",
  accepts(exportScholarNote, { ...validNote, segment_start_sec: 100, segment_end_sec: 100 }),
);

// -----------------------------------------------------------------------------
// 4. draft export'a girmez
// -----------------------------------------------------------------------------
console.log("\n4. status");
check("'draft' reddedilir", rejects(exportScholarNote, { ...validNote, status: "draft" }));
check("'reviewed' kabul edilir", accepts(exportScholarNote, { ...validNote, status: "reviewed" }));
check("'published' kabul edilir", accepts(exportScholarNote, { ...validNote, status: "published" }));

// -----------------------------------------------------------------------------
// 5. quote <= 200
// -----------------------------------------------------------------------------
console.log("\n5. quote ust siniri (telif)");
check("200 karakter kabul edilir", accepts(exportScholarNote, { ...validNote, quote: "a".repeat(200) }));
check("201 karakter reddedilir", rejects(exportScholarNote, { ...validNote, quote: "a".repeat(201) }));

// -----------------------------------------------------------------------------
// 6. K4 — video_id platform'a gore kosullu
// -----------------------------------------------------------------------------
console.log("\n6. K4 kosullu video_id");
const baseVideo = {
  scholar_slug: "mehmet-okuyan",
  title: "Ders",
  url: "https://example.com/v",
};
check(
  "youtube + 11 karakter kabul edilir",
  accepts(exportVideoSource, { ...baseVideo, platform: "youtube", video_id: "dQw4w9WgXcQ" }),
);
check(
  "youtube + 10 karakter reddedilir",
  rejects(exportVideoSource, { ...baseVideo, platform: "youtube", video_id: "dQw4w9WgXc" }),
);
check(
  "youtube + 12 karakter reddedilir",
  rejects(exportVideoSource, { ...baseVideo, platform: "youtube", video_id: "dQw4w9WgXcQZ" }),
);
check(
  "other + serbest kimlik kabul edilir",
  accepts(exportVideoSource, { ...baseVideo, platform: "other", video_id: "ders-2026-01" }),
);
check(
  "other + bos kimlik reddedilir",
  rejects(exportVideoSource, { ...baseVideo, platform: "other", video_id: "" }),
);

// -----------------------------------------------------------------------------
// 7. Yetim referanslar
// -----------------------------------------------------------------------------
console.log("\n7. Capraz referans denetimi");

function integrityOf(pkg: unknown): string[] {
  const result = exportPackage.safeParse(pkg);
  if (!result.success) return ["paket parse edilemedi"];
  return checkPackageIntegrity(result.data);
}

check(
  "yetim scholar_slug yakalanir",
  integrityOf({
    ...validPackage,
    scholar_notes: [{ ...validNote, scholar_slug: "bilinmeyen-hoca" }],
  }).length > 0,
);
check(
  "yetim video_id yakalanir",
  integrityOf({
    ...validPackage,
    scholar_notes: [{ ...validNote, video_id: "AAAAAAAAAAA" }],
  }).length > 0,
);
check(
  "video baska hocaya aitse yakalanir",
  integrityOf({
    ...validPackage,
    scholars: [
      { slug: "mehmet-okuyan", name: "Mehmet Okuyan" },
      { slug: "baska-hoca", name: "Baska Hoca" },
    ],
    scholar_notes: [{ ...validNote, scholar_slug: "baska-hoca" }],
  }).length > 0,
);
check(
  "mukerrer is anahtari yakalanir",
  integrityOf({ ...validPackage, scholar_notes: [validNote, validNote] }).length > 0,
);
check(
  "linked_verse_roles linked_verses disindaysa yakalanir",
  integrityOf({
    ...validPackage,
    scholar_notes: [{ ...validNote, linked_verse_roles: { "12:90": "primary" } }],
  }).length > 0,
);

// -----------------------------------------------------------------------------

console.log(`\n${passed} test gecti, ${failures.length} basarisiz`);
if (failures.length > 0) {
  console.error("\nBasarisiz testler:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
