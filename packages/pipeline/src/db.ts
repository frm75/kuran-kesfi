import pg from "pg";
import { env } from "./env.js";
import { info } from "./log.js";

/**
 * Build asamasi veritabani baglantisi.
 *
 * Bu veritabani YALNIZCA build makinesinde calisir (kuran-pg container'i,
 * 127.0.0.1). Uretim sunucusunda veritabani yoktur; site statiktir (plan 6).
 */

const { Pool } = pg;

export const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  max: Math.max(2, env.concurrency),
  // Yerel container; uzun bekleme anlamsiz
  connectionTimeoutMillis: 10_000,
});

export type Client = pg.PoolClient;

/**
 * Verilen isi tek bir islem (transaction) icinde calistirir.
 * Hata durumunda geri alinir — yarim import birakmaz.
 */
export async function withTransaction<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Toplu upsert.
 *
 * Her import scripti tekrar calistirilabilir olmalidir (plan 10, 20.1);
 * bu yuzden INSERT yerine ON CONFLICT ... DO UPDATE kullanilir.
 *
 * @param table        hedef tablo
 * @param columns      kolon adlari (snake_case)
 * @param rows         satirlar; her satir columns ile ayni sirada
 * @param conflictKeys catisma anahtari kolonlari
 * @param chunkSize    tek sorguda gonderilecek satir sayisi
 */
export async function upsertMany(
  client: Client,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
  conflictKeys: readonly string[],
  chunkSize = 500,
): Promise<number> {
  if (rows.length === 0) return 0;

  const updatable = columns.filter((c) => !conflictKeys.includes(c));
  const quote = (identifier: string): string => `"${identifier}"`;
  const columnList = columns.map(quote).join(", ");
  const conflictList = conflictKeys.map(quote).join(", ");
  const updateList =
    updatable.length > 0
      ? updatable.map((c) => `${quote(c)} = EXCLUDED.${quote(c)}`).join(", ")
      : null;

  let written = 0;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const values: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });

    const conflictClause =
      updateList === null
        ? `ON CONFLICT (${conflictList}) DO NOTHING`
        : `ON CONFLICT (${conflictList}) DO UPDATE SET ${updateList}`;

    const sql =
      `INSERT INTO ${quote(table)} (${columnList}) VALUES ${tuples.join(", ")} ${conflictClause}`;

    const result = await client.query(sql, values);
    written += result.rowCount ?? 0;
  }

  info(`${table}: ${written.toLocaleString("tr-TR")} satir yazildi`);
  return written;
}

export async function closePool(): Promise<void> {
  await pool.end();
}
