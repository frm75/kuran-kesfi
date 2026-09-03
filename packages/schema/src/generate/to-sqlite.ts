import { columnsOf } from "./introspect.js";
import { GENERATED_HEADER } from "./to-postgres.js";
import { topologicalSort } from "./sort.js";
import { tablesFor } from "./tables.js";
import type { ColumnSpec, TableSpec } from "./types.js";

/** TableSpec -> SQLite DDL (GOREV 02, tip eslemesi tablosu). */

const quote = (identifier: string): string => `"${identifier}"`;
const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`;

function columnType(column: ColumnSpec, isRowidPk: boolean): string {
  if (isRowidPk) return "INTEGER";
  switch (column.kind) {
    case "int":
      return "INTEGER";
    case "float":
      return "REAL";
    case "boolean":
      return "INTEGER";
    case "timestamp":
      return "TEXT"; // ISO 8601 UTC
    case "json":
    case "intArray":
      return "TEXT"; // JSON metni
    case "text":
      return "TEXT";
  }
}

function columnLine(column: ColumnSpec, spec: TableSpec): string {
  const isRowidPk = spec.primaryKey === column.name && column.kind === "int";
  const parts = [quote(column.name), columnType(column, isRowidPk)];

  if (isRowidPk) parts.push("PRIMARY KEY AUTOINCREMENT");
  else if (!column.nullable) parts.push("NOT NULL");

  const checks: string[] = [];
  if (column.enumValues !== undefined) {
    checks.push(`${quote(column.name)} IN (${column.enumValues.map(literal).join(", ")})`);
  }
  if (column.kind === "boolean") {
    checks.push(`${quote(column.name)} IN (0, 1)`);
  }
  if (column.kind === "text" && column.maxLength !== undefined) {
    checks.push(`length(${quote(column.name)}) <= ${column.maxLength}`);
  }
  for (const check of checks) parts.push(`CHECK (${check})`);

  return `  ${parts.join(" ")}`;
}

function tableDdl(spec: TableSpec): string {
  const columns = columnsOf(spec.zod);
  const lines: string[] = [];

  if (spec.comment !== undefined) lines.push(`-- ${spec.comment}`);
  lines.push(`CREATE TABLE ${quote(spec.name)} (`);

  const body: string[] = columns.map((c) => columnLine(c, spec));

  if (Array.isArray(spec.primaryKey)) {
    body.push(`  PRIMARY KEY (${spec.primaryKey.map(quote).join(", ")})`);
  }
  for (const unique of spec.unique ?? []) {
    body.push(`  UNIQUE (${unique.map(quote).join(", ")})`);
  }
  for (const check of spec.checks ?? []) {
    body.push(`  CHECK (${check})`);
  }
  for (const fk of spec.foreignKeys ?? []) {
    const onDelete = fk.onDelete === undefined ? "" : ` ON DELETE ${fk.onDelete}`;
    body.push(`  FOREIGN KEY (${quote(fk.column)}) REFERENCES ${fk.references}${onDelete}`);
  }

  lines.push(body.join(",\n"));
  lines.push(");");

  for (const index of spec.indexes ?? []) {
    const name = `${spec.name}_${index.join("_")}_idx`;
    lines.push(`CREATE INDEX ${quote(name)} ON ${quote(spec.name)} (${index.map(quote).join(", ")});`);
  }

  return lines.join("\n");
}

export function generateSqlite(): string {
  const specs = topologicalSort(tablesFor("sqlite"));
  return [
    GENERATED_HEADER,
    "-- Hedef: SQLite (yerel kuran-extract) · Kapsam: §23.2 hoca notları",
    "--",
    "-- N1 UYARI: SQLite'ta yabancı anahtarlar varsayılan olarak KAPALIDIR.",
    "-- Aşağıdaki PRAGMA yalnızca bu betiği çalıştıran bağlantı için geçerlidir.",
    "-- Uygulama her bağlantı açtığında da çalıştırmalıdır",
    "-- (better-sqlite3: db.pragma('foreign_keys = ON')).",
    "--",
    "-- Yerelde çekirdek tablolar (verse, principle, concept, story, root) YOKTUR;",
    "-- ara tablolar iş anahtarı metni tutar (verse_key, principle_slug…) ve bu",
    "-- kolonlarda FK bulunmaz. Çözümleme import anında sunucuda yapılır (SD-01).",
    "",
    "PRAGMA foreign_keys = ON;",
    "",
    "BEGIN;",
    "",
    specs.map(tableDdl).join("\n\n"),
    "",
    "COMMIT;",
    "",
  ].join("\n");
}
