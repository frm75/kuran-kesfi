import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  Report,
  closePool,
  env,
  fail,
  info,
  repoRoot,
  warn,
  withTransaction,
  type Client,
} from "@kuran/pipeline";
import {
  checkPackageIntegrity,
  exportPackage,
  type ExportPackage,
  type ExportScholarNote,
} from "@kuran/schema";

/**
 * Hoca notu paketi alimi — plan 23.2.3, 23.4.
 *
 * Yerel `kuran-extract` projesi bir JSON zarfi uretir; bu script onu build
 * veritabanina alir. Akis:
 *
 *   inbox/scholar_notes_YYYY-MM-DD.json + .sha256
 *     -> hash dogrula -> Zod parse -> checkPackageIntegrity
 *     -> referanslari veritabanina karsi cozumle
 *     -> tek islemde upsert -> rapor
 *
 * Bilinmeyen referans -> PAKET REDDEDILIR, `inbox/rejected/` altina tasinir.
 *
 * ## Neden paketin tamami reddediliyor
 *
 * Bir paket tek bir editoryal partidir: bir insan oturup gozden gecirmis,
 * "bunlar yayinlanabilir" demistir. Yarisini alip yarisini birakmak, o kisinin
 * onaylamadigi bir bilesimi yayinlamak olur. Ayrica bilinmeyen bir ayet
 * anahtari genelde tek bir yazim hatasi degil, iki projenin veri surumunun
 * ayrismasidir; o durumda dogru cevap "kismen al" degil "durdur, bak".
 *
 * ## Yayin kapisi
 *
 * Plan 23.4 iki maddesi bitmeden hicbir not yayinlanamaz: kaldirma talebi
 * e-postasi ve depo adresi. Ikisi de `.env` icinde (`TAKEDOWN_EMAIL`,
 * `REPO_URL`). Bos iken paket yine ALINIR ama `published` notlar `reviewed`e
 * dusurulur ve sebep rapora yazilir — veri kaybolmaz, yalnizca yayinlanmaz.
 *
 * Kullanim:
 *   pnpm notes:import                 inbox/ icindeki tum paketler
 *   pnpm notes:import <dosya.json>    tek paket
 *   pnpm notes:import --dry-run       dogrula, veritabanina yazma
 */

const INBOX = resolve(repoRoot, "inbox");
const REJECTED = resolve(INBOX, "rejected");
const PROCESSED = resolve(INBOX, "processed");

/** Paket adi kalibi — `scripts/sync/README.md` ile aynidir. */
const PACKAGE_PATTERN = /^scholar_notes_\d{4}-\d{2}-\d{2}(?:_[a-z0-9-]+)?\.json$/;

const report = new Report("import_notes");

// -----------------------------------------------------------------------------
// Paket dosyalari
// -----------------------------------------------------------------------------

function discoverPackages(args: readonly string[]): string[] {
  const explicit = args.filter((a) => !a.startsWith("--"));
  if (explicit.length > 0) {
    return explicit.map((path) => {
      const full = resolve(path);
      if (!existsSync(full)) fail(`paket bulunamadi: ${full}`);
      return full;
    });
  }

  if (!existsSync(INBOX)) return [];
  return readdirSync(INBOX)
    .filter((name) => PACKAGE_PATTERN.test(name))
    .sort()
    .map((name) => resolve(INBOX, name));
}

/**
 * `.sha256` yan dosyasini dogrular.
 *
 * Hem `sha256sum` ciktisini ("<hash>  dosya.json") hem de cippak hash'i kabul
 * eder: paketi ureten kisi elle `sha256sum` calistirabilir, arac da yazabilir.
 *
 * Yan dosya YOKSA paket reddedilir. Gerekce: hash'in amaci dosyanin yolda
 * bozulmadigini gostermek; "yoksa gec" demek denetimi istege bagli yapar ve
 * istege bagli denetim denetim degildir.
 */
function verifyHash(packagePath: string, raw: Buffer): string | null {
  const sidecar = `${packagePath}.sha256`;
  if (!existsSync(sidecar)) {
    return `sha256 yan dosyasi yok: ${basename(sidecar)}`;
  }

  const declared = readFileSync(sidecar, "utf8").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!/^[0-9a-f]{64}$/.test(declared)) {
    return `sha256 yan dosyasi okunamadi (64 haneli onaltilik bekleniyor): '${declared}'`;
  }

  const actual = createHash("sha256").update(raw).digest("hex");
  if (actual !== declared) {
    return `sha256 tutmuyor — beklenen ${declared}, bulunan ${actual}`;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Referans cozumleme
// -----------------------------------------------------------------------------

interface Lookups {
  verseIds: Map<string, number>;
  principleIds: Map<string, number>;
  conceptIds: Map<string, number>;
  storyIds: Map<string, number>;
  rootIds: Map<string, number>;
}

/**
 * Cozumleme tablolarini bir kerede okur.
 *
 * 6236 ayet + kokler bellekte birkac yuz KB tutar; her not icin ayri sorgu
 * atmaktan hem hizli hem de "hangi anahtar yok" sorusunu tek yerde cevaplar.
 */
async function loadLookups(client: Client): Promise<Lookups> {
  const verseIds = new Map<string, number>();
  const verses = await client.query<{ id: number; surah_id: number; verse_number: number }>(
    "SELECT id, surah_id, verse_number FROM verse",
  );
  for (const row of verses.rows) {
    verseIds.set(`${row.surah_id}:${row.verse_number}`, row.id);
  }

  const bySlug = async (table: string): Promise<Map<string, number>> => {
    const map = new Map<string, number>();
    const result = await client.query<{ id: number; slug: string }>(
      `SELECT id, slug FROM ${table}`,
    );
    for (const row of result.rows) map.set(row.slug, row.id);
    return map;
  };

  // Kok anahtari `root.latin` ile BIREBIR eslesir; buyuk/kucuk harf anlamli
  // (S=sad, s=sin). Kucultulurse 141 kok cakisir — bkz. references.ts.
  const rootIds = new Map<string, number>();
  const roots = await client.query<{ id: number; latin: string }>("SELECT id, latin FROM root");
  for (const row of roots.rows) rootIds.set(row.latin, row.id);

  return {
    verseIds,
    principleIds: await bySlug("principle"),
    conceptIds: await bySlug("concept"),
    storyIds: await bySlug("story"),
    rootIds,
  };
}

/** Paketteki her referansi cozumler; cozulemeyenleri insan okur satir olarak dondurur. */
function resolveReferences(pkg: ExportPackage, lookups: Lookups): string[] {
  const errors: string[] = [];
  const noteLabel = (n: ExportScholarNote): string =>
    `${n.scholar_slug}/${n.video_id}@${n.segment_start_sec}s (${n.note_type})`;

  const checkAll = (
    note: ExportScholarNote,
    keys: readonly string[],
    map: Map<string, number>,
    kind: string,
  ): void => {
    for (const key of keys) {
      if (!map.has(key)) {
        errors.push(`${noteLabel(note)}: bilinmeyen ${kind} '${key}'`);
      }
    }
  };

  for (const note of pkg.scholar_notes) {
    checkAll(note, note.linked_verses, lookups.verseIds, "ayet");
    checkAll(note, note.linked_principles, lookups.principleIds, "ilke");
    checkAll(note, note.linked_concepts, lookups.conceptIds, "kavram");
    checkAll(note, note.linked_stories, lookups.storyIds, "kissa");
    checkAll(note, note.linked_roots, lookups.rootIds, "kok");
  }

  return errors;
}

// -----------------------------------------------------------------------------
// Yazma
// -----------------------------------------------------------------------------

/** Yayin kapisi acik mi (plan 23.4). */
function publishingAllowed(): boolean {
  return env.contact.takedownEmail !== null && env.contact.repoUrl !== null;
}

/**
 * Ayet rolleri.
 *
 * `linked_verse_roles` yalnizca istisnalari tasir; listedeki digerleri
 * 'secondary' sayilir. Notun HIC birincil ayeti yoksa listedeki ILK ayet
 * birincil yapilir ve rapora yazilir: birincil ayeti olmayan bir not hicbir
 * ayet sayfasinda ana not olarak gorunmez, yani sessizce kaybolurdu.
 * Dizi sirasi anlamlidir — paketi ureten arac sirayi kendi belirler.
 */
function verseRoles(note: ExportScholarNote, label: string): Map<string, "primary" | "secondary"> {
  const roles = new Map<string, "primary" | "secondary">();
  for (const key of note.linked_verses) {
    roles.set(key, note.linked_verse_roles[key] ?? "secondary");
  }

  const hasPrimary = [...roles.values()].includes("primary");
  const first = note.linked_verses[0];
  if (!hasPrimary && first !== undefined) {
    roles.set(first, "primary");
    report.note(`${label}: birincil ayet belirtilmemis, ilk ayet ('${first}') birincil yapildi`);
  }
  return roles;
}

interface Counts {
  scholars: number;
  videos: number;
  notes: number;
  downgraded: number;
}

async function importPackage(
  client: Client,
  pkg: ExportPackage,
  lookups: Lookups,
): Promise<Counts> {
  const counts: Counts = { scholars: 0, videos: 0, notes: 0, downgraded: 0 };
  const allowPublish = publishingAllowed();

  /** slug -> scholar.id */
  const scholarIds = new Map<string, number>();
  for (const s of pkg.scholars) {
    const result = await client.query<{ id: number }>(
      `INSERT INTO scholar (slug, name, channel_name, channel_url, note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         channel_name = EXCLUDED.channel_name,
         channel_url = EXCLUDED.channel_url,
         note = EXCLUDED.note
       RETURNING id`,
      [s.slug, s.name, s.channel_name ?? null, s.channel_url ?? null, s.note ?? null],
    );
    scholarIds.set(s.slug, result.rows[0]!.id);
    counts.scholars += 1;
  }

  /** video_id -> video_source.id (paket icinde video_id zaten benzersiz) */
  const videoIds = new Map<string, number>();
  for (const v of pkg.video_sources) {
    const scholarId = scholarIds.get(v.scholar_slug)!;
    const result = await client.query<{ id: number }>(
      `INSERT INTO video_source
         (scholar_id, platform, video_id, title, url, published_at, duration_sec)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (platform, video_id) DO UPDATE SET
         scholar_id = EXCLUDED.scholar_id,
         title = EXCLUDED.title,
         url = EXCLUDED.url,
         published_at = EXCLUDED.published_at,
         duration_sec = EXCLUDED.duration_sec
       RETURNING id`,
      [
        scholarId,
        v.platform,
        v.video_id,
        v.title,
        v.url,
        v.published_at ?? null,
        v.duration_sec ?? null,
      ],
    );
    videoIds.set(v.video_id, result.rows[0]!.id);
    counts.videos += 1;
  }

  for (const n of pkg.scholar_notes) {
    const label = `${n.scholar_slug}/${n.video_id}@${n.segment_start_sec}s (${n.note_type})`;
    const scholarId = scholarIds.get(n.scholar_slug)!;
    const videoSourceId = videoIds.get(n.video_id)!;

    let status = n.status;
    if (status === "published" && !allowPublish) {
      status = "reviewed";
      counts.downgraded += 1;
    }

    // segment_id sunucuda HER ZAMAN null (SD-01); kolon yazilmiyor.
    const result = await client.query<{ id: number }>(
      `INSERT INTO scholar_note
         (scholar_id, video_source_id, segment_start_sec, segment_end_sec, note_type,
          summary, quote, deep_link, confidence, status, reviewer_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (scholar_id, video_source_id, segment_start_sec, note_type) DO UPDATE SET
         segment_end_sec = EXCLUDED.segment_end_sec,
         summary = EXCLUDED.summary,
         quote = EXCLUDED.quote,
         deep_link = EXCLUDED.deep_link,
         confidence = EXCLUDED.confidence,
         status = EXCLUDED.status,
         reviewer_id = EXCLUDED.reviewer_id,
         updated_at = EXCLUDED.updated_at
       RETURNING id`,
      [
        scholarId,
        videoSourceId,
        n.segment_start_sec,
        n.segment_end_sec,
        n.note_type,
        n.summary,
        n.quote ?? null,
        n.deep_link,
        n.confidence,
        status,
        n.reviewer_id ?? null,
        n.created_at,
        n.updated_at,
      ],
    );
    const noteId = result.rows[0]!.id;
    counts.notes += 1;

    /**
     * Ara tablolar SIL-YAZ, upsert DEGIL.
     *
     * Bir nottan ayet cikarilirsa (paketin yeni surumunde artik yok), upsert o
     * satiri oldugu yerde birakirdi: not artik bagli olmadigi bir ayette
     * gorunmeye devam ederdi. Ayni islem icinde silinip yeniden yaziliyor.
     */
    await client.query("DELETE FROM scholar_note_verse WHERE note_id = $1", [noteId]);
    for (const [key, role] of verseRoles(n, label)) {
      await client.query(
        "INSERT INTO scholar_note_verse (note_id, verse_id, role) VALUES ($1, $2, $3)",
        [noteId, lookups.verseIds.get(key)!, role],
      );
    }

    const links: [string, string, readonly string[], Map<string, number>][] = [
      ["scholar_note_principle", "principle_id", n.linked_principles, lookups.principleIds],
      ["scholar_note_concept", "concept_id", n.linked_concepts, lookups.conceptIds],
      ["scholar_note_story", "story_id", n.linked_stories, lookups.storyIds],
      ["scholar_note_root", "root_id", n.linked_roots, lookups.rootIds],
    ];
    for (const [table, column, keys, map] of links) {
      await client.query(`DELETE FROM ${table} WHERE note_id = $1`, [noteId]);
      for (const key of keys) {
        await client.query(
          `INSERT INTO ${table} (note_id, ${column}) VALUES ($1, $2)`,
          [noteId, map.get(key)!],
        );
      }
    }

    await client.query("DELETE FROM scholar_note_tag WHERE note_id = $1", [noteId]);
    for (const tag of new Set(n.tags)) {
      await client.query("INSERT INTO scholar_note_tag (note_id, tag) VALUES ($1, $2)", [
        noteId,
        tag,
      ]);
    }
  }

  return counts;
}

// -----------------------------------------------------------------------------
// Reddetme
// -----------------------------------------------------------------------------

/**
 * Paketi `inbox/rejected/` altina tasir ve sebebini yanina yazar.
 *
 * Dosya SILINMEZ: reddedilen paket, gonderen kisinin duzeltip yeniden
 * gondermesi icin gereken tek kanittir.
 */
function reject(packagePath: string, reasons: readonly string[]): void {
  mkdirSync(REJECTED, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = basename(packagePath, ".json");
  const target = resolve(REJECTED, `${stamp}_${name}.json`);

  renameSync(packagePath, target);
  if (existsSync(`${packagePath}.sha256`)) {
    renameSync(`${packagePath}.sha256`, `${target}.sha256`);
  }
  writeFileSync(
    resolve(REJECTED, `${stamp}_${name}.hata.txt`),
    [`Paket reddedildi: ${basename(packagePath)}`, `Zaman: ${new Date().toISOString()}`, "", ...reasons, ""].join("\n"),
    "utf8",
  );

  report.issue(`REDDEDILDI ${basename(packagePath)} — ${reasons.length} sebep`);
  for (const reason of reasons) report.note(`    ${reason}`);
  warn(`reddedildi: ${basename(packagePath)} -> inbox/rejected/${basename(target)}`);
  for (const reason of reasons.slice(0, 10)) console.error(`      ${reason}`);
  if (reasons.length > 10) console.error(`      ... ${reasons.length - 10} sebep daha`);
}

// -----------------------------------------------------------------------------

/** Islemi bilerek geri almak icin; gercek hatalardan ayirt edilir. */
class RollbackSignal extends Error {}

/**
 * Cozumleme ve yazma AYNI islemde yapilir.
 *
 * Ikisini ayirmak, cozumleme ile yazma arasinda cekirdek verinin degismesine
 * (ornegin yeniden import) acik kapi birakirdi.
 *
 * @returns cozulemeyen referanslar varsa `{ unresolved }`, yoksa `{ counts }`.
 *          Kuru calismada `counts` null doner: paket gecerli ama yazilmadi.
 */
async function runImport(
  pkg: ExportPackage,
  dryRun: boolean,
): Promise<{ unresolved: string[]; counts: Counts | null }> {
  let unresolved: string[] = [];
  let counts: Counts | null = null;

  try {
    await withTransaction(async (client) => {
      const lookups = await loadLookups(client);
      unresolved = resolveReferences(pkg, lookups);
      if (unresolved.length > 0) throw new RollbackSignal();

      counts = await importPackage(client, pkg, lookups);
      if (dryRun) {
        counts = null;
        throw new RollbackSignal();
      }
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }

  return { unresolved, counts };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const packages = discoverPackages(args);
  if (packages.length === 0) {
    info("inbox/ icinde paket yok — yapilacak is yok.");
    report.note("Paket bulunamadi.");
    info(`rapor: ${report.write()}`);
    return;
  }

  if (!publishingAllowed()) {
    warn(
      "TAKEDOWN_EMAIL / REPO_URL bos — plan 23.4 geregi hicbir not 'published' " +
        "yazilmayacak, 'reviewed'e dusurulecek.",
    );
    report.note(
      "Yayin kapisi KAPALI: .env icinde TAKEDOWN_EMAIL ve REPO_URL bos (plan 23.4).",
    );
  }

  info(`${packages.length} paket bulundu${dryRun ? " (kuru calisma)" : ""}`);
  let accepted = 0;

  for (const packagePath of packages) {
    const name = basename(packagePath);
    const raw = readFileSync(packagePath);

    const hashError = verifyHash(packagePath, raw);
    if (hashError !== null) {
      reject(packagePath, [hashError]);
      continue;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw.toString("utf8"));
    } catch (error) {
      reject(packagePath, [`JSON okunamadi: ${(error as Error).message}`]);
      continue;
    }

    const parsed = exportPackage.safeParse(parsedJson);
    if (!parsed.success) {
      reject(
        packagePath,
        parsed.error.issues.map((i) => `sema: ${i.path.join(".") || "(kok)"} — ${i.message}`),
      );
      continue;
    }
    const pkg = parsed.data;

    const integrity = checkPackageIntegrity(pkg);
    if (integrity.length > 0) {
      reject(packagePath, integrity);
      continue;
    }

    const { unresolved, counts } = await runImport(pkg, dryRun);

    if (unresolved.length > 0) {
      reject(packagePath, unresolved);
      continue;
    }

    if (counts === null) {
      // Kuru calisma: paket gecerli, islem geri alindi, dosya yerinde kaliyor.
      info(`${name}: gecerli (kuru calisma, veritabanina yazilmadi)`);
      report.note(`${name}: gecerli — kuru calisma, yazilmadi`);
      accepted += 1;
      continue;
    }

    info(
      `${name}: ${counts.notes} not, ${counts.scholars} hoca, ${counts.videos} video` +
        (counts.downgraded > 0 ? ` — ${counts.downgraded} not 'reviewed'e dusuruldu` : ""),
    );
    report.note(
      `${name}: ${counts.notes} not, ${counts.scholars} hoca, ${counts.videos} video, ` +
        `${counts.downgraded} not yayin kapisinda tutuldu`,
    );

    mkdirSync(PROCESSED, { recursive: true });
    renameSync(packagePath, resolve(PROCESSED, name));
    if (existsSync(`${packagePath}.sha256`)) {
      renameSync(`${packagePath}.sha256`, resolve(PROCESSED, `${name}.sha256`));
    }
    accepted += 1;
  }

  info(`${accepted}/${packages.length} paket alindi`);
  info(`rapor: ${report.write()}`);
  if (report.issues > 0) fail(`${report.issues} paket reddedildi — rapora bakin`);
}

try {
  await main();
} finally {
  await closePool();
}
