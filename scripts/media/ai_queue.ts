import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { aiGeneratedFile, aiPromptsFile } from "@kuran/schema";
import type { AiMediaInput, AiPromptInput } from "@kuran/schema";
import { fail, info, repoRoot, warn } from "@kuran/pipeline";
import { OUTPUT_DIR, QUEUE_DIR, dimensionsOf, fileQueueProvider, sha256Of } from "./ai/file_queue.js";

/**
 * AI uretim hatti — kuyruga yaz, ciktiyi topla.
 *
 * ============================================================================
 * SOZLESME
 * ============================================================================
 *
 *   pnpm media:ai:queue        data/media/prompts/ -> media/ai/kuyruk/
 *        ↓  (sen lokal makinendeki resim/video duzenleyicide uretirsin)
 *   media/ai/cikti/<promptId>.png|jpg|webp|mp4|webm     ciktiyi buraya birak
 *        ↓
 *   pnpm media:ai:collect      cikti -> data/media/ai_generated.json
 *
 * Kod hicbir API'ye baglanmaz (kullanici karari 2026-09-06: uretim lokal
 * makinede). Somut bir adaptor gerekirse `ai/provider.ts` arayuzleri hazir.
 *
 * ============================================================================
 * IKI SEY OTOMATIKLESTIRILMEZ
 * ============================================================================
 *
 * 1. URETIM. Spec 71: once gercek gorsel kaynaklari, lisanslar, konumlar ve
 *    prompt'lar; uretim ondan sonra. Bu script uretmez, kuyruga yazar.
 *
 * 2. YUZ TARAMASI. `faceScanned` false yazilir ve BU SCRIPT ONU TRUE YAPMAZ.
 *    Bir yuz karma ile denetlenemez; kare kare bakmak insanin isi
 *    (CLAUDE.md "Gorsel ve VIDEO kurali"). Taranmamis kayit statik ciktiya
 *    girmez — kapi scripts/build/lib/content.ts icinde.
 *
 *    Onay dosyada durur, dosya karmasina BAGLI: `collect` bir kaydin sha256'si
 *    degistigini gorurse faceScanned'i false'a DUSURUR. Yeni bir dosya, eski
 *    dosyanin onayini devralamaz.
 */

const DATA = resolve(repoRoot, "data");
const PROMPTS_DIR = join(DATA, "media/prompts");
const AI_FILE = join(DATA, "media/ai_generated.json");

const command = process.argv[2];
const force = process.argv.includes("--force");

// --- prompt okuma ------------------------------------------------------------

function loadPrompts(): AiPromptInput[] {
  if (!existsSync(PROMPTS_DIR)) fail(`prompt dizini yok: ${PROMPTS_DIR}`);
  const prompts: AiPromptInput[] = [];
  for (const name of readdirSync(PROMPTS_DIR).filter((n) => n.endsWith(".json")).sort()) {
    const path = join(PROMPTS_DIR, name);
    const parsed = aiPromptsFile.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success) fail(`${path} sema dogrulamasindan gecmedi:\n${parsed.error.message}`);
    prompts.push(...parsed.data.prompts);
  }
  return prompts;
}

function loadGenerated(): AiMediaInput[] {
  if (!existsSync(AI_FILE)) return [];
  const parsed = aiGeneratedFile.safeParse(JSON.parse(readFileSync(AI_FILE, "utf8")));
  if (!parsed.success) fail(`${AI_FILE} sema dogrulamasindan gecmedi:\n${parsed.error.message}`);
  return parsed.data.items;
}

// --- queue -------------------------------------------------------------------

async function queue(): Promise<void> {
  const prompts = loadPrompts();
  const produced = new Set(loadGenerated().map((a) => a.promptId));

  mkdirSync(QUEUE_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  let written = 0;
  let skipped = 0;
  for (const prompt of prompts) {
    if (!force && produced.has(prompt.id)) {
      skipped += 1;
      continue;
    }
    if (prompt.promptType === "IMAGE") await fileQueueProvider.queueImage(prompt);
    else await fileQueueProvider.queueVideo(prompt);
    written += 1;
    info(
      `${prompt.id.padEnd(34)} ${prompt.promptType.padEnd(5)} ` +
        (prompt.depictsProphet ? "yuz kisitli" : ""),
    );
  }

  info(`${String(written)} is kuyruga yazildi · ${String(skipped)} zaten uretilmis (--force ile yenile)`);
  info(`kuyruk : ${QUEUE_DIR}`);
  info(`cikti  : ${OUTPUT_DIR}   <-- uretilen dosyalari buraya birak`);
  info("dosya adi prompt kimligiyle ayni olmali: nuh-gemi-hazirlik.png");
}

// --- collect -----------------------------------------------------------------

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".webm"]);

async function collect(): Promise<void> {
  if (!existsSync(OUTPUT_DIR)) fail(`cikti dizini yok: ${OUTPUT_DIR} — once 'pnpm media:ai:queue'`);

  const prompts = new Map(loadPrompts().map((p) => [p.id, p]));
  const previous = new Map(loadGenerated().map((a) => [a.id, a]));

  const files = readdirSync(OUTPUT_DIR)
    .filter((n) => !n.startsWith("."))
    .sort();
  if (files.length === 0) {
    warn(`${OUTPUT_DIR} bos — toplanacak cikti yok`);
    return;
  }

  const items: AiMediaInput[] = [];
  let unscanned = 0;
  let reset = 0;

  for (const name of files) {
    const dot = name.lastIndexOf(".");
    if (dot <= 0) {
      warn(`${name}: uzantisiz dosya atlandi`);
      continue;
    }
    const id = name.slice(0, dot);
    const ext = name.slice(dot).toLowerCase();

    const isImage = IMAGE_EXT.has(ext);
    const isVideo = VIDEO_EXT.has(ext);
    if (!isImage && !isVideo) {
      warn(`${name}: taninmayan uzanti '${ext}' atlandi`);
      continue;
    }

    /*
     * Dosya adi -> prompt. Tam eslesme once denenir; olmazsa prompt kimligiyle
     * BASLAYAN en uzun ad aranir ("nuh-gemi-hazirlik-v2.png"). En uzun,
     * cunku "musa-tuva-vadisi" ile "musa-tuva-vadisi-video" ikisi de onek
     * olabilir ve kisa olani secmek videoyu gorsel prompt'una baglardi.
     */
    let prompt = prompts.get(id);
    if (prompt === undefined) {
      const candidates = [...prompts.keys()]
        .filter((key) => id.startsWith(`${key}-`))
        .sort((a, b) => b.length - a.length);
      const best = candidates[0];
      if (best !== undefined) prompt = prompts.get(best);
    }
    if (prompt === undefined) {
      warn(`${name}: eslesen prompt yok — data/media/prompts/ icinde kimlik bulunamadi`);
      continue;
    }

    if ((prompt.promptType === "VIDEO") !== isVideo) {
      warn(
        `${name}: prompt turu ${prompt.promptType} ama dosya ${isVideo ? "video" : "gorsel"} — atlandi`,
      );
      continue;
    }

    const absolute = join(OUTPUT_DIR, name);
    const sha256 = sha256Of(absolute);
    const size = isImage ? await dimensionsOf(absolute) : null;
    const before = previous.get(id);

    /*
     * Yuz taramasi onayi DOSYAYA baglidir, kimlige degil. Ayni kimlikle yeni
     * bir dosya birakilirsa (yeniden uretim) karma degisir ve onay duser.
     * Onay kimlige bagli olsaydi, taranmis bir kaydin uzerine taranmamis bir
     * dosya konabilir ve sessizce yayina cikardi.
     */
    const keepScan = before !== undefined && before.sha256 === sha256;
    if (before?.faceScanned === true && !keepScan) reset += 1;
    const faceScanned = keepScan ? before.faceScanned : false;
    if (!faceScanned) unscanned += 1;

    items.push({
      id,
      kind: isVideo ? "AI_VIDEO" : "AI_IMAGE",
      promptId: prompt.id,
      title: prompt.title,
      generator: fileQueueProvider.name,
      model: before?.model ?? prompt.model ?? "bilinmiyor",
      localPath: `ai/cikti/${name}`,
      sha256,
      width: size?.width ?? before?.width ?? null,
      height: size?.height ?? before?.height ?? null,
      durationSec: isVideo ? (before?.durationSec ?? prompt.durationSec) : null,
      createdAt: keepScan && before !== undefined ? before.createdAt : new Date().toISOString(),
      faceScanned,
      faceScanNote: keepScan ? before.faceScanNote : null,
    });

    info(
      `${id.padEnd(34)} ${(isVideo ? "VIDEO" : "IMAGE").padEnd(5)} ` +
        `${size === null ? "" : `${String(size.width)}x${String(size.height)} `}` +
        `${faceScanned ? "taranmis" : "TARANMAMIS"}`,
    );
  }

  const payload = { items: items.sort((a, b) => (a.id < b.id ? -1 : 1)) };
  const parsed = aiGeneratedFile.safeParse(payload);
  if (!parsed.success) fail(`uretilen kayit sema dogrulamasindan gecmedi:\n${parsed.error.message}`);

  const existing = existsSync(AI_FILE)
    ? (JSON.parse(readFileSync(AI_FILE, "utf8")) as { "//"?: string[] })
    : {};
  writeFileSync(
    AI_FILE,
    JSON.stringify({ "//": existing["//"], ...payload }, null, 2) + "\n",
    "utf8",
  );

  info(`${String(items.length)} kayit yazildi: ${AI_FILE}`);
  if (reset > 0) {
    warn(`${String(reset)} kaydin dosyasi degismis — yuz taramasi onayi DUSURULDU, yeniden bakilmali`);
  }
  if (unscanned > 0) {
    console.log("");
    warn(`${String(unscanned)} kayit TARANMAMIS ve yayina GIRMEYECEK.`);
    console.log(
      "  Yapilacak: her dosyaya kare kare bak — peygamber YUZU goruyor musun?\n" +
        "  Figur, siluet ve uzaktan kalabalik serbest; yasak yalnizca yuze.\n" +
        `  Temizse ${AI_FILE} icinde o kaydin faceScanned alanini true yap\n` +
        "  ve faceScanNote'a kimin ne zaman baktigini yaz.\n" +
        "  Sonra 'pnpm content:import' — data/** tek kaynak, veritabani turetilmis\n" +
        "  kopya; import edilmeden alan degisikligi yayina yansimaz.",
    );
  }
}

// --- giris -------------------------------------------------------------------

if (command === "queue") await queue();
else if (command === "collect") await collect();
else fail("kullanim: tsx ai_queue.ts <queue|collect> [--force]");
