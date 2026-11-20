/** Bir dizinin altindaki butun .json dosyalari, sirali. */

import { readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

export function listJsonFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (extname(entry) === ".json") {
        found.push(path);
      }
    }
  };
  walk(root);
  return found.sort();
}
