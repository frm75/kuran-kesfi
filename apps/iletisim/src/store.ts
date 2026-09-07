import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

/**
 * Mesaj deposu — SQLite.
 *
 * ## Neden veritabani da var, sadece mail degil
 *
 * Mail gonderimi bir gun sessizce bozulur: sifre degisir, kota dolar, alici
 * sunucu reddeder. O gun form "gonderildi" der ve mesaj hicbir yere yazilmamis
 * olur. Once YAZILIR, sonra gonderilir; gonderim sonucu ayni satira dusulur.
 *
 * ## Ne saklanmiyor
 *
 * IP adresi, tarayici bilgisi, referans adresi SAKLANMAZ (plan 1.2, 1.3:
 * davranis verisi toplanmaz, profil olusturulmaz). Hiz siniri icin IP yalnizca
 * BELLEKTE ve gecici tutulur, diske yazilmaz.
 */

export type MessageKind = "oneri" | "duzeltme" | "iletisim";

export interface NewMessage {
  kind: MessageKind;
  /** "2:255" ya da null */
  verseRef: string | null;
  name: string | null;
  email: string | null;
  body: string;
}

const db = (() => {
  mkdirSync(dirname(config.dbPath), { recursive: true });
  const database = new Database(config.dbPath);
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS message (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at  TEXT    NOT NULL,
      kind        TEXT    NOT NULL CHECK (kind IN ('oneri','duzeltme','iletisim')),
      verse_ref   TEXT,
      name        TEXT,
      email       TEXT,
      body        TEXT    NOT NULL CHECK (length(trim(body)) > 0),
      mail_sent   INTEGER NOT NULL DEFAULT 0,
      mail_error  TEXT
    );
    CREATE INDEX IF NOT EXISTS message_created_idx ON message (created_at);
    CREATE INDEX IF NOT EXISTS message_unsent_idx  ON message (mail_sent) WHERE mail_sent = 0;
  `);
  return database;
})();

const insert = db.prepare(`
  INSERT INTO message (created_at, kind, verse_ref, name, email, body)
  VALUES (@createdAt, @kind, @verseRef, @name, @email, @body)
`);

const markSent = db.prepare("UPDATE message SET mail_sent = 1, mail_error = NULL WHERE id = ?");
const markFailed = db.prepare("UPDATE message SET mail_sent = 0, mail_error = ? WHERE id = ?");

export function saveMessage(message: NewMessage): number {
  const result = insert.run({ ...message, createdAt: new Date().toISOString() });
  return Number(result.lastInsertRowid);
}

export function recordMailResult(id: number, error: string | null): void {
  if (error === null) markSent.run(id);
  else markFailed.run(error.slice(0, 500), id);
}

/** Gonderilememis mesaj sayisi — saglik ucunda gorunur. */
export function unsentCount(): number {
  const row = db.prepare("SELECT count(*) AS n FROM message WHERE mail_sent = 0").get() as {
    n: number;
  };
  return row.n;
}
