import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { info, fail, repoRoot } from "@kuran/pipeline";
import sharp from "sharp";

/**
 * Tanitim sayfasi hero videosu — DESIGN.md 8, plan 20.3.
 *
 * TEK KAYNAK: scripts/media/hero-source.mp4 (1280x720, 24fps, 20,04 sn).
 *
 * ============================================================================
 * NEDEN KESILIYOR — bu dosyanin varlik sebebi
 * ============================================================================
 *
 * Kaynak videoda BES peygamber insan figuru olarak gorunuyor. Plan 20.3:
 * "Peygamber, sahabe, melek ve insan figuru tasvir edilmez." Yasak yuze degil
 * FIGURE. Kare kare tarandi, figurlu araliklar cikarildi:
 *
 *   sure        sahne                        figur
 *   ---------   --------------------------   ------------------------------
 *   3,4-5,0 s   nehir vadisi                 Hz. Adem — ayakta, cubbeli
 *   5,0-7,2 s   gemi ve tufan                Hz. Nuh  — geminin onunde
 *   9,0-10,4 s  kiyi, gunes                  Hz. Musa — kiyida
 *  10,4-11,0 s  yarilan deniz (goz hizasi)   Hz. Musa — merkezde, buyuk
 *  12,0-13,5 s  balina                       Hz. Yunus — suya batarken
 *
 * Geriye kalan alti parca birlestirildi. Anlati KORUNDU: her donem kendi
 * yeri ve dogasiyla temsil ediliyor — yaratilis (dunya), tufan (gemi),
 * yarilan deniz (ustten, figursuz), col safagi, sehir ve vahiy isigi,
 * baglanan dunya.
 *
 * Uzak kervan (15-17 sn) birakildi: o olcekte hayvan surusu okunuyor, insan
 * tasviri degil.
 *
 * ============================================================================
 *
 * Kullanim:
 *   pnpm --filter @kuran/media media          uret
 *   pnpm --filter @kuran/media media:check    uretilenle diskteki ayni mi
 *
 * ffmpeg gerekir (apt install ffmpeg).
 */

const SOURCE = resolve(import.meta.dirname, "hero-source.mp4");
const OUT_DIR = resolve(repoRoot, "apps/web/public/media");
const MANIFEST_FILE = resolve(OUT_DIR, "manifest.json");
const TMP = resolve(import.meta.dirname, ".tmp");

/** Figursuz araliklar — [baslangic sn, sure sn, ne oldugu]. */
const SEGMENTS: readonly [number, number, string][] = [
  [0.0, 3.2, "dunya uzaydan, atmosfere inis"],
  [7.2, 1.8, "gemi yakin plan, yagmur duvari"],
  [10.4, 1.6, "yarilan deniz — ustten, figursuz"],
  [13.5, 1.5, "su altinda isik, col kumulu"],
  [15.2, 4.8, "sehir, vahiy isigi, dunya, baglanan dunya"],
];

/** Parcalar arasi gecis suresi. */
const XFADE = 0.4;

/**
 * Kalite. Video hero'da KOYU BIR PERDENIN ALTINDA duruyor ve uzerinde metin
 * var; ayrinti zaten kayboluyor. crf 34 ile 36 yan yana konuldu, uzay
 * gradyaninda bile fark ayirt edilemedi — 36 secildi (932 KB -> 768 KB).
 * aq-mode=3 karanlik gradyanlarda bantlanmayi onluyor.
 */
const CRF = 36;

const sha256 = (buf: Buffer): string => createHash("sha256").update(buf).digest("hex");

function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
}

function requireFfmpeg(): void {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    fail("ffmpeg bulunamadi. Kurulum: apt-get install -y ffmpeg");
  }
}

/** Parcalari xfade zinciriyle birlestirir; cikti sessizdir (-an). */
function buildCut(target: string): void {
  const inputs: string[] = [];
  for (const [start, dur] of SEGMENTS) {
    inputs.push("-ss", String(start), "-t", String(dur), "-i", SOURCE);
  }

  const labels = SEGMENTS.map((_, i) => String.fromCharCode(97 + i));
  const parts = labels.map((l, i) => `[${i}:v]setpts=PTS-STARTPTS,fps=24,format=yuv420p[${l}]`);

  // Her xfade'te toplam sure kadar ilerlenir, gecis payi geri alinir.
  let running = SEGMENTS[0]![1];
  let prev = labels[0]!;
  for (let i = 1; i < labels.length; i += 1) {
    const offset = running - XFADE;
    const out = i === labels.length - 1 ? "v" : `x${String(i)}`;
    parts.push(
      `[${prev}][${labels[i]!}]xfade=transition=fade:duration=${String(XFADE)}:offset=${offset.toFixed(3)}[${out}]`,
    );
    running = running + SEGMENTS[i]![1] - XFADE;
    prev = out;
  }

  ffmpeg([
    ...inputs,
    "-filter_complex",
    parts.join(";"),
    "-map",
    "[v]",
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    String(CRF),
    "-preset",
    "slower",
    "-profile:v",
    "high",
    "-level",
    "4.0",
    "-pix_fmt",
    "yuv420p",
    "-x264-params",
    "aq-mode=3:aq-strength=1.1",
    // faststart: moov atom basa alinir, video tamamen inmeden oynamaya baslar.
    "-movflags",
    "+faststart",
    target,
  ]);
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  if (!existsSync(SOURCE)) fail(`Kaynak video yok: ${SOURCE}`);
  requireFfmpeg();

  const src = readFileSync(SOURCE);
  const total = SEGMENTS.reduce((a, [, d]) => a + d, 0) - XFADE * (SEGMENTS.length - 1);
  info(`kaynak: ${(src.length / 1048576).toFixed(1)} MB · ${sha256(src).slice(0, 12)}`);
  info(`${String(SEGMENTS.length)} figursuz parca -> ${total.toFixed(2)} sn`);
  for (const [start, dur, what] of SEGMENTS) {
    info(`  ${start.toFixed(1).padStart(4)}s +${dur.toFixed(1)}s  ${what}`);
  }

  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const videoPath = resolve(TMP, "hero.mp4");
  buildCut(videoPath);
  const video = readFileSync(videoPath);

  // Poster: ilk parcanin icinden bir kare. Video inmeden once gorunen sey bu,
  // bu yuzden LCP'yi o tasiyor — kucuk tutuluyor.
  const frame = resolve(TMP, "poster.png");
  ffmpeg(["-ss", "0.6", "-i", videoPath, "-frames:v", "1", frame]);
  const frameBuf = readFileSync(frame);
  const posterWebp = await sharp(frameBuf).resize(1280).webp({ quality: 72 }).toBuffer();
  const posterJpg = await sharp(frameBuf).resize(1280).jpeg({ quality: 70, mozjpeg: true }).toBuffer();

  const produced = new Map<string, Buffer>([
    ["hero.mp4", video],
    ["hero-poster.webp", posterWebp],
    ["hero-poster.jpg", posterJpg],
  ]);

  for (const [file, buf] of produced) info(`${file.padEnd(20)} ${(buf.length / 1024).toFixed(1)} KB`);

  const manifest =
    JSON.stringify(
      {
        "//": [
          "URETILEN DOSYA — elle duzenlenmez.",
          "Uretim: pnpm --filter @kuran/media media",
          "Tek kaynak: scripts/media/hero-source.mp4",
          "Figurlu araliklar plan 20.3 geregi cikarildi; ayrinti build_media.ts basinda.",
        ],
        sourceSha256: sha256(src),
        sourceBytes: src.length,
        durationSeconds: Number(total.toFixed(2)),
        segments: SEGMENTS.map(([start, duration, note]) => ({ start, duration, note })),
        crf: CRF,
        files: [...produced].map(([file, buf]) => ({
          file,
          bytes: buf.length,
          sha256: sha256(buf),
        })),
      },
      null,
      2,
    ) + "\n";

  if (check) {
    let dirty = 0;
    for (const [file, buf] of produced) {
      const path = resolve(OUT_DIR, file);
      // Video kodlamasi bit bazinda tekrarlanabilir degil (x264 surumu, is
      // parcaciklari); boyut toleransi ile karsilastiriliyor.
      if (!existsSync(path)) {
        console.error(`  YOK: ${file}`);
        dirty += 1;
        continue;
      }
      const onDisk = readFileSync(path);
      const drift = Math.abs(onDisk.length - buf.length) / buf.length;
      if (drift > 0.02) {
        console.error(`  FARKLI: ${file} (${String(onDisk.length)} vs ${String(buf.length)} bayt)`);
        dirty += 1;
      }
    }
    if (dirty > 0) fail(`${String(dirty)} dosya farkli — 'pnpm media' calistirin.`);
    info("--check temiz.");
    return;
  }

  const keep = new Set([...produced.keys(), "manifest.json"]);
  for (const name of readdirSync(OUT_DIR)) {
    if (!keep.has(name)) {
      unlinkSync(resolve(OUT_DIR, name));
      info(`silindi (artik uretilmiyor): ${name}`);
    }
  }
  for (const [file, buf] of produced) writeFileSync(resolve(OUT_DIR, file), buf);
  writeFileSync(MANIFEST_FILE, manifest);
  info(`${String(produced.size + 1)} dosya yazildi -> ${OUT_DIR}`);
}

await main();
