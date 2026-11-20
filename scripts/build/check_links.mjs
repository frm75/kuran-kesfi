#!/usr/bin/env node
/**
 * Build ciktisindaki site ici baglantilari denetler.
 *
 * apps/web/dist altindaki her HTML dosyasinin `href` ve `src` hedefleri,
 * nginx'in `try_files $uri $uri.html $uri/index.html` kuralinin bulacagi bir
 * dosyaya karsilik gelmeli. Gelmiyorsa cikis kodu 1.
 *
 * Neden var: 2026-10-18 yayininda /dinle/* sayfalarindaki 6 350 baglanti
 * (/54/1) 404 veriyordu ve bir ay kimse fark etmedi — build yesildi, duman
 * testi yalnizca sayfanin kendisine bakiyordu. Bu denetim deploy'un on kosulu.
 *
 * Bagimlilik yok; duz Node. Kullanim: node scripts/build/check_links.mjs [dist]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = resolve(process.argv[2] ?? join(repoRoot, "apps/web/dist"));
if (!existsSync(join(dist, "index.html"))) {
  console.error(`check_links: ${dist}/index.html yok — once 'pnpm build'`);
  process.exit(2);
}

/** Sunucunun cevap verdigi, dist'te dosyasi olmayan adresler. */
const SERVER_ROUTES = [/^\/api\//];

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith(".html")) yield full;
  }
}

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

const resolved = new Map();
function exists(pathname) {
  let hit = resolved.get(pathname);
  if (hit === undefined) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      decoded = pathname;
    }
    const base = join(dist, decoded);
    hit =
      decoded === "/"
        ? true
        : isFile(base) || isFile(`${base}.html`) || isFile(join(base, "index.html"));
    resolved.set(pathname, hit);
  }
  return hit;
}

const ATTR = /\s(?:href|src)="(\/[^"]*)"/g;
/** hedef -> { count, first } */
const broken = new Map();
let pages = 0;
let links = 0;

for (const file of htmlFiles(dist)) {
  pages += 1;
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(ATTR)) {
    const raw = match[1];
    if (raw.startsWith("//")) continue; // protokol-goreli dis adres
    const pathname = raw.split("#")[0].split("?")[0].replace(/&amp;/g, "&");
    if (pathname === "" || SERVER_ROUTES.some((r) => r.test(pathname))) continue;
    links += 1;
    if (exists(pathname)) continue;
    const row = broken.get(pathname);
    if (row === undefined) broken.set(pathname, { count: 1, first: file.slice(dist.length) });
    else row.count += 1;
  }
}

const total = [...broken.values()].reduce((sum, row) => sum + row.count, 0);
console.log(
  `check_links: ${pages.toLocaleString("tr-TR")} sayfa, ${links.toLocaleString("tr-TR")} site ici baglanti, ` +
    `${total.toLocaleString("tr-TR")} kirik (${broken.size.toLocaleString("tr-TR")} ayri hedef)`,
);
if (total > 0) {
  const worst = [...broken.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 25);
  for (const [target, row] of worst) {
    console.error(`  ${String(row.count).padStart(6)} × ${target}   (ilk: ${row.first})`);
  }
  if (broken.size > worst.length) console.error(`  … ve ${broken.size - worst.length} hedef daha`);
  process.exit(1);
}
