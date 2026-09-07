import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

/**
 * Abonelik deposu — SQLite.
 *
 * `infra/db/bot_schema.sql` ayni tabloyu PostgreSQL icin tanimliyor; plan 19.6
 * ikisine de izin veriyor ("kucuk PostgreSQL veya SQLite") ve `.env` SQLite
 * secmis (`BOT_DB_PATH`). Iletisim servisiyle ayni kalip: tek dosya, WAL,
 * yerel eklenti.
 *
 * ## VERI MINIMIZASYONU (plan 19.2 — zorunlu)
 *
 * Yalnizca iletim icin ZORUNLU alanlar tutulur: kanal kimligi, siklik, meal,
 * saat dilimi, gonderim saati. Isim, kullanici adi, e-posta, mesaj gecmisi ve
 * davranis verisi TUTULMAZ — Telegram bize adi ve kullanici adini gonderiyor,
 * biz yazmiyoruz.
 *
 * `/dur` kaydi FIZIKSEL OLARAK SILER. `active = false` yetmez; sema yorumu
 * bunu acikca soyluyor ve burada da oyle uygulaniyor.
 *
 * Hangi ayetin gonderildigi KAYDEDILMEZ: takvim deterministik oldugu icin
 * yalnizca imlec (`schedule_cursor`) ilerletilir.
 */

export interface Subscription {
  id: number;
  channelId: string;
  frequency: "daily" | "weekly";
  authorSlug: string;
  timezone: string;
  sendHour: number;
  lastSentAt: string | null;
  scheduleCursor: number;
}

/**
 * Veritabani ILK KULLANIMDA acilir, modul yuklenirken degil.
 *
 * Once modul govdesinde aciliyordu; `dispatch.ts` bu modulu import ettigi icin
 * DUMAN TESTI bile calisirken diske bir SQLite dosyasi yaratiyordu (2026-09-07:
 * /opt/kuran/bot/subscription.sqlite bos olarak olustu ve git'e girmeye
 * hazirdi). Test dosya birakmamali; ayrica yalnizca icerik kuran bir kod
 * yolunun veritabani acmasi gereksiz.
 */
let database: Database.Database | null = null;

function db(): Database.Database {
  if (database !== null) return database;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  const opened = new Database(config.dbPath);
  opened.pragma("journal_mode = WAL");
  opened.exec(`
    CREATE TABLE IF NOT EXISTS subscription (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      channel         TEXT    NOT NULL DEFAULT 'telegram',
      channel_id      TEXT    NOT NULL,
      frequency       TEXT    NOT NULL CHECK (frequency IN ('daily','weekly')),
      author_slug     TEXT    NOT NULL,
      timezone        TEXT    NOT NULL,
      send_hour       INTEGER NOT NULL CHECK (send_hour BETWEEN 0 AND 23),
      created_at      TEXT    NOT NULL,
      last_sent_at    TEXT,
      schedule_cursor INTEGER NOT NULL DEFAULT 0 CHECK (schedule_cursor >= 0),
      active          INTEGER NOT NULL DEFAULT 1,
      UNIQUE (channel, channel_id)
    );
    CREATE INDEX IF NOT EXISTS subscription_dispatch_idx
      ON subscription (active, send_hour);
    -- Telegram'in verdigi son update kimligi. Servis yeniden basladiginda
    -- ayni mesajlari bir daha islememek icin; kisisel veri degil.
    CREATE TABLE IF NOT EXISTS bot_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  database = opened;
  return opened;
}

/** Hazirlanmis ifadeler de tembel: ilk cagrida derlenir, sonra onbelleklenir. */
const statements = new Map<string, import("better-sqlite3").Statement>();
function prepare(sql: string): import("better-sqlite3").Statement {
  let statement = statements.get(sql);
  if (statement === undefined) {
    statement = db().prepare(sql);
    statements.set(sql, statement);
  }
  return statement;
}

const row = (r: Record<string, unknown>): Subscription => ({
  id: Number(r["id"]),
  channelId: String(r["channel_id"]),
  frequency: r["frequency"] as "daily" | "weekly",
  authorSlug: String(r["author_slug"]),
  timezone: String(r["timezone"]),
  sendHour: Number(r["send_hour"]),
  lastSentAt: r["last_sent_at"] === null ? null : String(r["last_sent_at"]),
  scheduleCursor: Number(r["schedule_cursor"]),
});


export function find(chatId: string): Subscription | null {
  const found = prepare("SELECT * FROM subscription WHERE channel_id = ?").get(chatId) as Record<string, unknown> | undefined;
  return found === undefined ? null : row(found);
}

export function listActive(): Subscription[] {
  return (prepare("SELECT * FROM subscription WHERE active = 1").all() as Record<string, unknown>[]).map(row);
}

const INSERT_SQL = `
  INSERT INTO subscription
    (channel, channel_id, frequency, author_slug, timezone, send_hour, created_at)
  VALUES ('telegram', @chatId, @frequency, @authorSlug, @timezone, @sendHour, @createdAt)
  ON CONFLICT (channel, channel_id) DO NOTHING
`;

export function subscribe(chatId: string, frequency: "daily" | "weekly"): Subscription {
  prepare(INSERT_SQL).run({
    chatId,
    frequency,
    authorSlug: config.defaultAuthor,
    timezone: config.defaultTimezone,
    sendHour: config.defaultSendHour,
    createdAt: new Date().toISOString(),
  });
  prepare("UPDATE subscription SET frequency = ?, active = 1 WHERE channel_id = ?").run(
    frequency,
    chatId,
  );
  const found = find(chatId);
  if (found === null) throw new Error("abonelik yazilamadi");
  return found;
}

export const setAuthor = (chatId: string, authorSlug: string): void => {
  prepare("UPDATE subscription SET author_slug = ? WHERE channel_id = ?").run(authorSlug, chatId);
};

export const setSendHour = (chatId: string, hour: number): void => {
  prepare("UPDATE subscription SET send_hour = ? WHERE channel_id = ?").run(hour, chatId);
};

export const advanceCursor = (id: number, cursor: number, sentAt: string): void => {
  prepare("UPDATE subscription SET schedule_cursor = ?, last_sent_at = ? WHERE id = ?").run(
    cursor,
    sentAt,
    id,
  );
};

/**
 * Abonelikten cikma — KAYIT SILINIR.
 *
 * `active = false` ile isaretlemek yetmez: plan 19.2 "kayit fiziksel olarak
 * silinir" diyor ve bot_schema.sql yorumu da bunu tekrarliyor. Silinen bir
 * kaydin geri gelmesi diye bir sey yok; kullanici tekrar /start derse yeni
 * kayit acilir.
 */
export function unsubscribe(chatId: string): boolean {
  return prepare("DELETE FROM subscription WHERE channel_id = ?").run(chatId).changes > 0;
}

export function getState(key: string): string | null {
  const found = prepare("SELECT value FROM bot_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return found?.value ?? null;
}

export const setState = (key: string, value: string): void => {
  prepare(
    "INSERT INTO bot_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
};

export const activeCount = (): number =>
  (prepare("SELECT count(*) AS n FROM subscription WHERE active = 1").get() as { n: number }).n;
