import type { AiPromptInput } from "@kuran/schema";

/**
 * AI uretim arayuzleri — spec 66.
 *
 * ============================================================================
 * NEDEN ARAYUZ: SAGLAYICIYA KILITLENME YOK
 * ============================================================================
 *
 * Spec 66 acik: sistem belirli bir saglayiciya kilitlenmemeli; ileride lokal
 * ya da API tabanli image/video modelleri takilabilmeli. Bu dosya o sozlesmeyi
 * tanimlar, hicbir uygulama icermez.
 *
 * Bugun tek uygulama `file_queue.ts`: kod HICBIR API'ye baglanmaz. Prompt'lar
 * diske yazilir, uretim kullanicinin lokal makinesindeki resim/video
 * duzenleyicide elle yapilir, cikti diskten toplanir. Kullanici karari
 * (2026-09-06): "ai resim uretici olarak lokal bilgisayarimda calisan
 * resim - video duzenleyiciyi alacagiz."
 *
 * ComfyUI ya da A1111 gibi somut bir adaptor eklendiginde YALNIZCA bu
 * arayuzler uygulanir; `ai_queue.ts` ve veri katmani degismez. `ai_generator`
 * enum'una yeni bir deger girer, eski kayitlar hangi hatla uretildigini
 * kaybetmez.
 *
 * ============================================================================
 * URETIM HENUZ ACIK DEGIL
 * ============================================================================
 *
 * Spec 71: "Ilk asamada AI gorsellerini otomatik uretme." Once gercek gorsel
 * kaynaklari, lisanslari, konumlar ve prompt'lar hazirlanir; uretim hatti
 * ondan sonra devreye alinir. `generate` metodu bu yuzden bugun yalnizca
 * kuyruga yazar.
 */

/** Bir uretim isinin sonucu — diskteki dosya. */
export interface GeneratedAsset {
  /** `media/` agacina gore yol: "ai/cikti/nuh-gemi-v1.png" */
  localPath: string;
  sha256: string;
  width: number | null;
  height: number | null;
  /** Yalnizca video */
  durationSec: number | null;
  /** Ureten model — kayitta saklanir, "hangi modelle uretildi" sorusu icin */
  model: string;
}

/** Uretim isteginin diske yazilmis hali (kuyruk kaydi). */
export interface QueuedJob {
  id: string;
  promptId: string;
  type: "IMAGE" | "VIDEO";
  prompt: string;
  negativePrompt: string | null;
  aspectRatio: string | null;
  durationSec: number | null;
  /** Image-to-video zincirinde baslangic gorselinin prompt kimligi */
  baseImagePromptId: string | null;
}

/**
 * Butun ureteclerin ortak yuzu.
 *
 * `name` `ai_generator` enum'undaki degerle AYNI olmali; uretilen medya
 * kaydina o yazilir.
 */
export interface AIProvider {
  readonly name: "file-queue";
  /** Uretim su an mumkun mu? Kuyruk saglayicisinda her zaman false (spec 71). */
  readonly canGenerate: boolean;
}

/** Gorsel ureteci. */
export interface ImageGenerator extends AIProvider {
  queueImage(prompt: AiPromptInput): Promise<QueuedJob>;
  generateImage?(job: QueuedJob): Promise<GeneratedAsset>;
}

/** Video ureteci — image-to-video dahil (spec 67). */
export interface VideoGenerator extends AIProvider {
  queueVideo(prompt: AiPromptInput): Promise<QueuedJob>;
  generateVideo?(job: QueuedJob): Promise<GeneratedAsset>;
}

/**
 * Prompt ureteci — spec 50 ve 57 sablonlari.
 *
 * Prompt'lar veri katmaninda saklanir (data/media/prompts/), kodda degil.
 * Bu arayuz YENI prompt metnini kurar; kurulan metin dosyaya yazilir ve
 * oradan sonra veridir.
 */
export interface PromptContext {
  story: string;
  event: string;
  location: string;
  period: string;
  environment: string;
  architecture: string;
  clothing: string;
  lighting: string;
  camera: string;
  composition: string;
  /** Prompt bir peygamberi tasvir ediyor mu? (plan 20.3 kapisi) */
  depictsProphet: boolean;
}

export interface VideoPromptContext extends PromptContext {
  scene: string;
  cameraMovement: string;
  motion: string;
  durationSec: number;
}

export interface PromptGenerator {
  buildImagePrompt(context: PromptContext): string;
  buildVideoPrompt(context: VideoPromptContext): string;
  /** Ortak olumsuz prompt — spec 50'nin "No ..." satirlari */
  negativePrompt(): string;
}
