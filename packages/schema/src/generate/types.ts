import type { z } from "zod";

/**
 * Migration ureticisinin ara temsili — GOREV 02.
 *
 * Zod'dan dogrudan SQL uretmek kirilgandir: Zod'da tablo adi, birincil anahtar,
 * yabanci anahtar hedefi, indeks ve UNIQUE kisiti YOKTUR. Bu bilgiler
 * `tables.ts`'te acik metadata olarak yazilir; Zod ise kolon tiplerinin ve
 * nullable/enum bilgisinin kaynagi olur.
 */

/** Uretim hedefi. Ayni tablo iki motorda farkli kolon tutabilir (SD-01). */
export type Target = "postgres" | "sqlite";

export type ColumnKind =
  | "int"
  | "float"
  | "text"
  | "boolean"
  | "timestamp"
  | "json"
  | "intArray";

export interface ColumnSpec {
  /** snake_case kolon adi */
  name: string;
  kind: ColumnKind;
  nullable: boolean;
  /** string().max(n) -> VARCHAR(n) / CHECK(length<=n) */
  maxLength?: number;
  /** enum([...]) -> CHECK (x IN (...)) */
  enumValues?: readonly string[];
}

export interface ForeignKeySpec {
  column: string;
  /** "scholar(id)" */
  references: string;
  onDelete?: "CASCADE" | "SET NULL" | "RESTRICT";
}

export interface TableSpec {
  name: string;
  /** Kolon tiplerinin kaynagi */
  zod: z.ZodObject<z.ZodRawShape>;
  /**
   * Tek kolon veya bilesik anahtar (N2). Ara tablolarda `id` yoktur;
   * `PRIMARY KEY (a, b)` uretilir.
   */
  primaryKey: string | readonly string[];
  foreignKeys?: readonly ForeignKeySpec[];
  indexes?: readonly (readonly string[])[];
  unique?: readonly (readonly string[])[];
  /**
   * N3 istisnasi: yalnizca AYNI SATIRDAKI iki kolonu karsilastiran kontroller.
   * Zod refine'lari otomatik cevrilmez; buraya elle yazilir.
   */
  checks?: readonly string[];
  /** Bu tablo hangi motorlarda uretilsin (N6) */
  targets: readonly Target[];
  /** Aciklama satiri olarak DDL'e yazilir */
  comment?: string;
}
