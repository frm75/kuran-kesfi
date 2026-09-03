import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import pLimit from "p-limit";
import { env } from "./env.js";

/**
 * Kaynak indirme ve onbellek.
 *
 * Kaynak nezaketi (plan 20.1):
 *   - Yapay `sleep` kullanilmaz.
 *   - Es zamanlilik p-limit ile IMPORT_CONCURRENCY kadar sinirlanir.
 *   - Her kaynak TEK SEFER cekilir ve cache/ altina alinir; tekrar import
 *     cache'ten calisir, kaynaga yeniden yuk binmez.
 *
 * cache/ git'e girmez (.gitignore).
 */

const limit = pLimit(env.concurrency);

export interface FetchOptions {
  /** cache/ altindaki dosya adi. Verilmezse URL'den turetilir. */
  cacheName?: string;
  /** true ise onbellek yok sayilir ve kaynak yeniden cekilir. */
  force?: boolean;
  /**
   * true ise onbellek dosyasi gzip'lenir (.gz eklenir).
   * Binlerce kucuk JSON yaniti icin diskte ~%75 tasarruf saglar.
   */
  gzip?: boolean;
  /** Ek istek basliklari (ornek: yazar secimi icin cerez). */
  headers?: Record<string, string>;
}

function cachePathFor(url: string, cacheName?: string): string {
  if (cacheName !== undefined) {
    return resolve(env.cacheDir, cacheName);
  }
  const digest = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return resolve(env.cacheDir, `url_${digest}`);
}

/**
 * URL'yi indirir ve onbellege alir; onbellekte varsa agdan cekmez.
 * Es zamanli cagrilar p-limit ile sinirlanir.
 */
export async function fetchCached(url: string, options: FetchOptions = {}): Promise<string> {
  const useGzip = options.gzip === true;
  const path = cachePathFor(url, options.cacheName) + (useGzip ? ".gz" : "");

  if (!options.force && existsSync(path)) {
    const raw = readFileSync(path);
    return useGzip ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  }

  return limit(async () => {
    const response = await fetch(url, {
      headers: {
        // Kaynak sahibinin kimin cektigini gorebilmesi icin acik kimlik
        "user-agent": "kurankesfi.tr import (https://kurankesfi.tr)",
        "accept-encoding": "gzip, deflate",
        ...(options.headers ?? {}),
      },
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      throw new Error(`${url} -> HTTP ${response.status} ${response.statusText}`);
    }

    const body = await response.text();
    if (body.length === 0) {
      throw new Error(`${url} -> bos yanit`);
    }

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, useGzip ? gzipSync(body, { level: 6 }) : Buffer.from(body, "utf8"));
    return body;
  });
}

/** Birden fazla kaynagi sinirli es zamanlilikla ceker. */
export async function fetchAllCached(
  requests: readonly { url: string; cacheName: string }[],
): Promise<string[]> {
  return Promise.all(requests.map((r) => fetchCached(r.url, { cacheName: r.cacheName })));
}
