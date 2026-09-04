import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { info, fail, repoRoot } from "@kuran/pipeline";
import sharp from "sharp";

/**
 * Marka varliklari — DESIGN.md 9.
 *
 * TEK KAYNAK: scripts/brand/logo-source.png (512x512). Buradaki her cikti
 * ondan turetilir, elle duzenlenmez. Uretilen boyutlarin hepsi kaynaktan
 * KUCULTULUR — 260'lik ilk surumde og-image 340 piksele buyutuluyordu.
 *
 * Fontlarda oldugu gibi (scripts/fonts) uretim tekrarlanabilir olmalidir:
 * kaynak degisirse tek komutla butun boyutlar yeniden uretilir, manifest
 * sha256 ile hangi baytlarin yayinlandigini kaydeder.
 *
 * Kullanim:
 *   pnpm --filter @kuran/brand brand          uret
 *   pnpm --filter @kuran/brand brand:check    uretilenle diskteki ayni mi
 */

const SOURCE = resolve(import.meta.dirname, "logo-source.png");
const OUT_DIR = resolve(repoRoot, "apps/web/public/brand");
const MANIFEST_FILE = resolve(OUT_DIR, "manifest.json");

/** Koyu lacivert — saydam PNG duzlestirilirken kullanilir (DESIGN.md 1). */
const INK = "#071023";

interface Output {
  file: string;
  note: string;
  render: (src: Buffer) => Promise<Buffer>;
}

const webp = (size: number, quality: number) => (s: Buffer) =>
  sharp(s).resize(size, size, { kernel: "lanczos3" }).webp({ quality }).toBuffer();

const png = (size: number) => (s: Buffer) =>
  sharp(s)
    .resize(size, size, { kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();

const OUTPUTS: readonly Output[] = [
  { file: "logo-256.webp", note: "Hero logosu.", render: webp(256, 88) },
  { file: "logo-128.webp", note: "Yedek orta boy.", render: webp(128, 88) },
  { file: "logo-96.webp", note: "Menu markasi ve kapanis.", render: webp(96, 88) },
  { file: "logo-48.webp", note: "Site seridi.", render: webp(48, 90) },
  { file: "logo-256.png", note: "WebP desteklemeyen ortam icin yedek.", render: png(256) },
  { file: "logo-96.png", note: "WebP desteklemeyen ortam icin yedek.", render: png(96) },
  { file: "favicon-32.png", note: "Sekme simgesi.", render: png(32) },
  { file: "favicon-16.png", note: "Sekme simgesi, kucuk.", render: png(16) },
  {
    file: "apple-touch-icon.png",
    // iOS saydam zemini SIYAHA cevirir; logo altin cerceveli bir daire oldugu
    // icin saydam kalirsa kenarda siyah halka olusur. Zemin acikca duzlestiriliyor.
    note: "iOS ana ekran simgesi — zemin opak duzlestirildi.",
    render: (s) =>
      sharp(s)
        .resize(180, 180, { kernel: "lanczos3" })
        .flatten({ background: INK })
        .png({ compressionLevel: 9, palette: true })
        .toBuffer(),
  },
  {
    file: "og-image.png",
    note: "Paylasim onizlemesi 1200x630 — logo lacivert zeminde ortali.",
    render: async (s) => {
      const badge = await sharp(s).resize(340, 340, { kernel: "lanczos3" }).toBuffer();
      return sharp({ create: { width: 1200, height: 630, channels: 3, background: INK } })
        .composite([{ input: badge, gravity: "centre" }])
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();
    },
  },
];

const sha256 = (buf: Buffer): string => createHash("sha256").update(buf).digest("hex");

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  if (!existsSync(SOURCE)) fail(`Kaynak logo yok: ${SOURCE}`);

  const src = readFileSync(SOURCE);
  const meta = await sharp(src).metadata();
  info(
    `kaynak: ${String(meta.width)}x${String(meta.height)} · ` +
      `${(src.length / 1024).toFixed(1)} KB · ${sha256(src).slice(0, 12)}`,
  );

  mkdirSync(OUT_DIR, { recursive: true });
  const produced = new Map<string, Buffer>();
  const entries: { file: string; bytes: number; sha256: string; note: string }[] = [];

  for (const out of OUTPUTS) {
    const buf = await out.render(src);
    produced.set(out.file, buf);
    entries.push({ file: out.file, bytes: buf.length, sha256: sha256(buf), note: out.note });
    info(`${out.file.padEnd(22)} ${(buf.length / 1024).toFixed(1)} KB`);
  }

  const manifest =
    JSON.stringify(
      {
        "//": [
          "URETILEN DOSYA — elle duzenlenmez.",
          "Uretim: pnpm --filter @kuran/brand brand",
          "Tek kaynak: scripts/brand/logo-source.png",
        ],
        sourceSha256: sha256(src),
        sourceBytes: src.length,
        files: entries,
      },
      null,
      2,
    ) + "\n";

  if (check) {
    let dirty = 0;
    for (const [file, buf] of produced) {
      const path = resolve(OUT_DIR, file);
      if (!existsSync(path) || !readFileSync(path).equals(buf)) {
        console.error(`  FARKLI: ${file}`);
        dirty += 1;
      }
    }
    if (!existsSync(MANIFEST_FILE) || readFileSync(MANIFEST_FILE, "utf8") !== manifest) {
      console.error("  FARKLI: manifest.json");
      dirty += 1;
    }
    if (dirty > 0) {
      fail(`${dirty} dosya diskteki ile ayni degil — 'pnpm --filter @kuran/brand brand' calistirin.`);
    }
    info("--check temiz: uretilen cikti diskteki ile ayni.");
    return;
  }

  // Artik uretilmeyen bir dosya kalmasin.
  const keep = new Set([...produced.keys(), "manifest.json"]);
  for (const name of readdirSync(OUT_DIR)) {
    if (!keep.has(name)) {
      unlinkSync(resolve(OUT_DIR, name));
      info(`silindi (artik uretilmiyor): ${name}`);
    }
  }
  for (const [file, buf] of produced) writeFileSync(resolve(OUT_DIR, file), buf);
  writeFileSync(MANIFEST_FILE, manifest);
  info(`${produced.size + 1} dosya yazildi -> ${OUT_DIR}`);
}

await main();
