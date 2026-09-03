import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pLimit from "p-limit";
import { env } from "./env.js";
import { info } from "./log.js";

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
  const path = cachePathFor(url, options.cacheName);

  if (!options.force && existsSync(path)) {
    info(`onbellek: ${options.cacheName ?? url}`);
    return readFileSync(path, "utf8");
  }

  return limit(async () => {
    info(`indiriliyor: ${url}`);
    const response = await fetch(url, {
      headers: {
        // Kaynak sahibinin kimin cektigini gorebilmesi icin acik kimlik
        "user-agent": "kurankesfi.tr import (https://kurankesfi.tr)",
        "accept-encoding": "gzip, deflate",
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

    mkdirSync(env.cacheDir, { recursive: true });
    writeFileSync(path, body, "utf8");
    info(`onbellege alindi: ${path} (${body.length.toLocaleString("tr-TR")} bayt)`);
    return body;
  });
}

/** Birden fazla kaynagi sinirli es zamanlilikla ceker. */
export async function fetchAllCached(
  requests: readonly { url: string; cacheName: string }[],
): Promise<string[]> {
  return Promise.all(requests.map((r) => fetchCached(r.url, { cacheName: r.cacheName })));
}
