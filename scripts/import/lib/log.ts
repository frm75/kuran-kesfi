import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "./env.js";

/** Basit, bagimliliksiz gunluk ve rapor yazimi. */

const started = Date.now();

function stamp(): string {
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  return `[${seconds.padStart(6)}s]`;
}

export function info(message: string): void {
  console.log(`${stamp()} ${message}`);
}

export function warn(message: string): void {
  console.warn(`${stamp()} UYARI  ${message}`);
}

export function fail(message: string): never {
  console.error(`${stamp()} HATA   ${message}`);
  process.exit(1);
}

/**
 * Import raporu.
 *
 * Eslesmeyen veya atlanan hicbir kayit sessizce yok sayilmaz; hepsi rapora
 * yazilir (plan 20.1).
 */
export class Report {
  private readonly lines: string[] = [];
  private issueCount = 0;

  constructor(private readonly name: string) {}

  note(message: string): void {
    this.lines.push(message);
  }

  issue(message: string): void {
    this.issueCount += 1;
    this.lines.push(`SORUN: ${message}`);
    warn(message);
  }

  get issues(): number {
    return this.issueCount;
  }

  /** reports/<ad>.md dosyasina yazar ve yolu dondurur. */
  write(): string {
    mkdirSync(env.reportsDir, { recursive: true });
    const path = resolve(env.reportsDir, `${this.name}.md`);
    const body = [
      `# Import raporu — ${this.name}`,
      "",
      `Olusturma: ${new Date().toISOString()}`,
      `Sorun sayisi: ${this.issueCount}`,
      "",
      ...this.lines.map((line) => `- ${line}`),
      "",
    ].join("\n");
    writeFileSync(path, body, "utf8");
    return path;
  }
}
