import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bot yapilandirmasi — repo kokundeki .env dosyasindan.
 *
 * `apps/iletisim/src/config.ts` ile ayni okuyucu: pm2 kabuk ortamini
 * tasimadigi icin .env dogrudan okunur, dotenv bagimliligi alinmadi.
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
const env = (key: string, fallback = ""): string => process.env[key] ?? fileEnv[key] ?? fallback;

export const config = {
  token: env("BOT_TOKEN"),
  /** Bot kullanici adi (@ olmadan) — site baglantisi ve /yardim metni icin. */
  username: env("BOT_USERNAME"),
  dbPath: env("BOT_DB_PATH", resolve(REPO_ROOT, "var/bot.sqlite")),
  /**
   * Icerik YAYINDAKI surumden okunur, repodan degil.
   *
   * Bota giden ayet ve ilke, o an sitede duranin AYNISI olmali (plan 19.6:
   * "gunluk icerik siteyle ayni schedule.json'dan okunur"). Repodaki
   * apps/web/public/data build sirasinda degisir; yayindaki surum ise
   * degismez. Ikisi ayrildiginda bot henuz yayinlanmamis icerigi gonderirdi.
   */
  dataDir: env("BOT_DATA_DIR", "/www/wwwroot/kurankesfi.tr/current/data"),
  siteUrl: env("BOT_SITE_URL", "https://kurankesfi.tr"),
  /**
   * Varsayilan meal — abone secmeden once bununla gonderilir.
   *
   * Deger authors_index.json'daki author.slug OLMALI. Yanlis yazilirsa mesaj
   * yine gider ama her seferinde "sectiginiz meal bu ayette yok" notu duser;
   * bu yuzden servis acilista slug'i DOGRULUYOR (index.ts).
   */
  defaultAuthor: env("BOT_DEFAULT_AUTHOR", "diyanet-isleri"),
  defaultTimezone: env("BOT_TIMEZONE", "Europe/Istanbul"),
  defaultSendHour: Number.parseInt(env("BOT_SEND_HOUR", "8"), 10),
  /** Haftalik abonelerin gonderim gunu: 1 = Pazartesi … 5 = Cuma, 7 = Pazar */
  weeklyWeekday: Number.parseInt(env("BOT_WEEKLY_WEEKDAY", "5"), 10),
  healthPort: Number.parseInt(env("BOT_PORT", "4330"), 10),
} as const;

export const configured = (): boolean => config.token !== "";
