import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { repoRoot } from "@kuran/pipeline";

/**
 * Statik JSON yazimi.
 *
 * Tekrarlanabilir build (plan 20.1): ayni girdi ayni bayt dizisini uretir.
 * Bu yuzden nesne anahtarlari yazim sirasinda sabittir ve zaman damgasi,
 * rastgele deger veya surum numarasi gomulmez.
 *
 * Dosya adlari alt cizgilidir (plan 20.2): surah_1.json, verse_2_153.json.
 */

/** Uretilen statik verinin kok dizini. */
export const dataRoot = resolve(repoRoot, "apps/web/public/data");

export interface EmitStats {
  files: number;
  bytes: number;
}

export class Emitter {
  private fileCount = 0;
  private byteCount = 0;
  private readonly written = new Set<string>();

  /** public/data dizinini bosaltir — silinen kayitlar artik kalmaz. */
  reset(): void {
    rmSync(dataRoot, { recursive: true, force: true });
    mkdirSync(dataRoot, { recursive: true });
  }

  /**
   * @param relativePath dataRoot'a gore yol: "surah/surah_1.json"
   * @param value        JSON'a cevrilecek deger
   */
  write(relativePath: string, value: unknown): void {
    if (this.written.has(relativePath)) {
      throw new Error(`ayni dosya iki kez yazildi: ${relativePath}`);
    }
    this.written.add(relativePath);

    const path = join(dataRoot, relativePath);
    mkdirSync(dirname(path), { recursive: true });

    // Girintisiz: statik dosyalar okunmak icin degil, ag uzerinden gitmek icin.
    const body = JSON.stringify(value);
    writeFileSync(path, body, "utf8");

    this.fileCount += 1;
    this.byteCount += Buffer.byteLength(body, "utf8");
  }

  get stats(): EmitStats {
    return { files: this.fileCount, bytes: this.byteCount };
  }

  /** Tum cikti dosyalarinin birlesik karmasi — tekrarlanabilirlik denetimi icin. */
  fingerprint(): string {
    const hash = createHash("sha256");
    for (const path of [...this.written].sort()) {
      hash.update(path);
    }
    return hash.digest("hex").slice(0, 16);
  }
}
