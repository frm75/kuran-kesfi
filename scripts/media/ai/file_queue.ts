import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import type { AiPromptInput } from "@kuran/schema";
import { prophetFaceConstraint } from "@kuran/schema";
import { repoRoot } from "@kuran/pipeline";
import type {
  ImageGenerator,
  PromptContext,
  PromptGenerator,
  QueuedJob,
  VideoGenerator,
  VideoPromptContext,
} from "./provider.js";

/**
 * Dosya kuyrugu ureteci — arac bagimsiz hat.
 *
 * ============================================================================
 * NEDEN API DEGIL DOSYA
 * ============================================================================
 *
 * Uretim kullanicinin LOKAL makinesindeki resim/video duzenleyicide yapiliyor
 * (kullanici karari 2026-09-06). Bu sunucu o makineye baglanamaz ve baglanmasi
 * da gerekmiyor. Sozlesme diskte:
 *
 *   media/ai/kuyruk/<id>.json   makine okunur is kaydi
 *   media/ai/kuyruk/<id>.txt    prompt metni — kopyalanip yapistirilacak hali
 *   media/ai/cikti/<id>.<uzanti>  senin biraktigin cikti
 *
 * Hicbir arac adi, hicbir API sozlesmesi yok; ComfyUI da olsa Photoshop da
 * olsa ayni. Somut bir adaptor gerekirse `provider.ts` arayuzleri duruyor.
 *
 * ============================================================================
 * SHA256 NEDEN
 * ============================================================================
 *
 * Cikti dosyalari `media/` altinda durur ve R2'ye cikar; git'e girmez. Karma
 * olmadan "yayindaki dosya ile kayittaki dosya ayni mi" sorusunun cevabi
 * olmazdi. Ayrica yuz taramasi karmaya bagli: dosya degisirse tarama gecersiz
 * olmali (bkz. ai_queue.ts collect).
 */

const MEDIA_ROOT = resolve(repoRoot, "media");
export const QUEUE_DIR = join(MEDIA_ROOT, "ai/kuyruk");
export const OUTPUT_DIR = join(MEDIA_ROOT, "ai/cikti");

/**
 * Spec 50'nin ortak olumsuz kisitlari.
 *
 * "no human figures" YOK — figur yasagi 2026-09-06'da kalkti, kural yalnizca
 * peygamber YUZUNE indi ve o kisit prompt'un kendi metninde durur
 * (packages/schema/src/media.ts prophetFaceConstraint).
 */
const NEGATIVE = [
  "modern buildings",
  "modern vehicles",
  "modern clothing",
  "modern tourism infrastructure",
  "fantasy elements",
  "text",
  "watermark",
  "subtitles",
].join(", ");

/** Spec 50 ve 57 sablonlari. */
export const promptGenerator: PromptGenerator = {
  negativePrompt: () => NEGATIVE,

  buildImagePrompt(c: PromptContext): string {
    const lines = [
      "Create a cinematic historical illustration inspired by the provided Quranic story context.",
      "",
      `Story: ${c.story}`,
      `Event: ${c.event}`,
      `Location: ${c.location}`,
      `Historical period: ${c.period}`,
      `Environment: ${c.environment}`,
      `Architecture: ${c.architecture}`,
      `Clothing: ${c.clothing}`,
      `Lighting: ${c.lighting}`,
      `Camera: ${c.camera}`,
      `Composition: ${c.composition}`,
      "",
      "Style: cinematic historical realism, highly detailed environment, realistic natural",
      "lighting, documentary-inspired historical atmosphere.",
      "",
      "Do not invent identifiable historical evidence.",
      "Do not present the image as a real historical photograph.",
    ];
    if (c.depictsProphet) {
      // Kisit metne GIRMEK ZORUNDA: uretici modele giden tek talimat budur.
      lines.push(
        `A depicted prophet must not have an ${prophetFaceConstraint}.`,
        "Use silhouette, rear view, distant framing or obscured facial features.",
      );
    }
    lines.push("", "AI-generated historical visualization, not a real historical photograph.");
    return lines.join("\n");
  },

  buildVideoPrompt(c: VideoPromptContext): string {
    const lines = [
      `Create a ${String(c.durationSec)}-second cinematic historical video based on this Quranic story context.`,
      "",
      `Story: ${c.story}`,
      `Event: ${c.event}`,
      `Location: ${c.location}`,
      `Historical atmosphere: ${c.period}`,
      `Scene: ${c.scene}`,
      `Camera movement: ${c.cameraMovement}`,
      `Lighting: ${c.lighting}`,
      `Motion: ${c.motion}`,
      `Duration: ${String(c.durationSec)} seconds`,
      "",
      "Visual style: cinematic historical realism, documentary-inspired, realistic natural movement.",
      "",
      "Do not invent historical evidence.",
      "Do not create modern objects.",
      "Do not include text or subtitles.",
    ];
    if (c.depictsProphet) {
      lines.push(`A depicted prophet must not have an ${prophetFaceConstraint}.`);
    }
    lines.push("", "AI-generated historical visualization.");
    return lines.join("\n");
  },
};

function toJob(prompt: AiPromptInput): QueuedJob {
  return {
    id: prompt.id,
    promptId: prompt.id,
    type: prompt.promptType,
    prompt: prompt.prompt,
    negativePrompt: prompt.negativePrompt,
    aspectRatio: prompt.aspectRatio,
    durationSec: prompt.durationSec,
    baseImagePromptId: prompt.baseImagePromptId,
  };
}

function writeJob(job: QueuedJob, title: string): void {
  mkdirSync(QUEUE_DIR, { recursive: true });
  writeFileSync(join(QUEUE_DIR, `${job.id}.json`), JSON.stringify(job, null, 2) + "\n", "utf8");

  // Insan tarafi: prompt'u aracina yapistirmak icin duz metin.
  const text = [
    `# ${title}`,
    `# tur: ${job.type}${job.durationSec === null ? "" : ` · ${String(job.durationSec)} sn`}`,
    job.aspectRatio === null ? null : `# en/boy: ${job.aspectRatio}`,
    job.baseImagePromptId === null
      ? null
      : `# baslangic gorseli: media/ai/cikti/${job.baseImagePromptId}.*`,
    `# ciktiyi buraya birak: media/ai/cikti/${job.id}.<uzanti>`,
    "",
    job.prompt,
    "",
    job.negativePrompt === null ? null : `NEGATIVE: ${job.negativePrompt}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  writeFileSync(join(QUEUE_DIR, `${job.id}.txt`), text + "\n", "utf8");
}

/**
 * Uretici.
 *
 * `canGenerate` false ve `generateImage`/`generateVideo` YOK: bu hat
 * uretmiyor, kuyruga yaziyor (spec 71). Metotlari bos govdeyle eklemek
 * "uretebiliyor ama bir sey yapmiyor" gibi okunurdu.
 */
export const fileQueueProvider: ImageGenerator & VideoGenerator = {
  name: "file-queue",
  canGenerate: false,

  queueImage(prompt: AiPromptInput): Promise<QueuedJob> {
    const job = toJob(prompt);
    writeJob(job, prompt.title);
    return Promise.resolve(job);
  },

  queueVideo(prompt: AiPromptInput): Promise<QueuedJob> {
    const job = toJob(prompt);
    writeJob(job, prompt.title);
    return Promise.resolve(job);
  },
};

// --- Cikti olcumu ------------------------------------------------------------

export function sha256Of(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Gorsel olculeri — `sharp` ile.
 *
 * sharp bu pakette zaten var (hero videosu ve marka gorselleri icin).
 * Elle PNG/JPEG basligi ayristirmak yerine onu kullanmak WebP ve AVIF'i de
 * bedava getiriyor. Video icin olcu ALINMAZ: sharp video okumaz ve olcuyu
 * uydurmaktansa null birakmak dogru — kart olcu yoksa tarayiciya birakir.
 */
export async function dimensionsOf(
  path: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(path).metadata();
    if (meta.width === undefined || meta.height === undefined) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    // Bozuk ya da desteklenmeyen dosya: olcu yok, kayit yine kurulur.
    return null;
  }
}
