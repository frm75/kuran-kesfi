import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Yapilandirma — repo kokundeki .env dosyasindan.
 *
 * Servis pm2 altinda calisiyor ve pm2 kabuk ortamini tasimiyor; bu yuzden
 * .env DOGRUDAN okunur. dotenv paketi alinmadi: on satirlik bir ayristirici
 * icin bagimlilik gerekmiyor (projenin Dexie ve D3 kararlariyla ayni gerekce).
 */

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

function loadEnvFile(): Record<string, string> {
  const values: Record<string, string> = {};
  let text: string;
  try {
    text = readFileSync(resolve(REPO_ROOT, ".env"), "utf8");
  } catch {
    return values;
  }
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const fileEnv = loadEnvFile();

/** Ortam degiskeni .env'i EZER — pm2/systemd ile gecici deger verilebilsin. */
function env(key: string, fallback = ""): string {
  return process.env[key] ?? fileEnv[key] ?? fallback;
}

export const config = {
  port: Number.parseInt(env("FORM_PORT", "4380"), 10),
  /** Mesajlarin saklandigi SQLite dosyasi. Git'e girmez. */
  dbPath: env("FORM_DB_PATH", resolve(REPO_ROOT, "var/iletisim.sqlite")),
  smtp: {
    host: env("SMTP_HOST"),
    port: Number.parseInt(env("SMTP_PORT", "465"), 10),
    secure: env("SMTP_SECURE", "true") !== "false",
    user: env("SMTP_USER"),
    pass: env("SMTP_PASS"),
  },
  /** Zarfin gonderen adresi. Bos ise SMTP_USER kullanilir. */
  from: env("CONTACT_FROM") || env("SMTP_USER"),
  to: env("CONTACT_TO", "admin@esfasoft.com.tr"),
  /** 303 ile gonderilecek adresler; sayfalar statik sitede duruyor. */
  successPath: "/iletisim-tesekkur",
  errorPath: "/iletisim-hata",
} as const;

/**
 * SMTP eksikse servis YINE CALISIR: mesaj veritabanina yazilir, mail
 * gonderilmez ve satira sebep dusulur. Form "gonderildi" deyip mesaji
 * hicbir yere yazmamaktan iyidir — sessiz kayip bu projenin en cok
 * kovaladigi sey.
 */
export const smtpConfigured = (): boolean =>
  config.smtp.host !== "" && config.smtp.user !== "" && config.smtp.pass !== "";
