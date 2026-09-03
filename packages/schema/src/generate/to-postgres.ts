import { columnsOf } from "./introspect.js";
import { topologicalSort } from "./sort.js";
import { tablesFor } from "./tables.js";
import type { ColumnSpec, TableSpec } from "./types.js";

/** TableSpec -> PostgreSQL DDL (GOREV 02, tip eslemesi tablosu). */

export const GENERATED_HEADER =
  "-- ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: packages/schema/src/";

const quote = (identifier: string): string => `"${identifier}"`;
const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`;

function columnType(column: ColumnSpec, isSerialPk: boolean): string {
  if (isSerialPk) return "SERIAL";
  switch (column.kind) {
    case "int":
      return "INTEGER";
    case "float":
      return "DOUBLE PRECISION";
    case "boolean":
      return "BOOLEAN";
    case "timestamp":
      return "TIMESTAMPTZ";
    case "json":
      return "JSONB";
    case "intArray":
      return "INTEGER[]";
    case "text":
      return column.maxLength === undefined ? "TEXT" : `VARCHAR(${column.maxLength})`;
  }
}

function columnLine(column: ColumnSpec, spec: TableSpec): string {
  const isSerialPk = spec.primaryKey === column.name && column.kind === "int";
  const parts = [quote(column.name), columnType(column, isSerialPk)];

  if (isSerialPk) parts.push("PRIMARY KEY");
  else if (!column.nullable) parts.push("NOT NULL");

  if (column.enumValues !== undefined) {
    const values = column.enumValues.map(literal).join(", ");
    parts.push(`CHECK (${quote(column.name)} IN (${values}))`);
  }
  return `  ${parts.join(" ")}`;
}

function tableDdl(spec: TableSpec): string {
  const columns = columnsOf(spec.zod);
  const lines: string[] = [];

  if (spec.comment !== undefined) lines.push(`-- ${spec.comment}`);
  lines.push(`CREATE TABLE ${quote(spec.name)} (`);

  const body: string[] = columns.map((c) => columnLine(c, spec));

  // Bilesik birincil anahtar (N2)
  if (Array.isArray(spec.primaryKey)) {
    body.push(`  PRIMARY KEY (${spec.primaryKey.map(quote).join(", ")})`);
  }

  for (const unique of spec.unique ?? []) {
    body.push(`  UNIQUE (${unique.map(quote).join(", ")})`);
  }

  // N3 istisnasi: yalnizca ayni satirdaki kolonlari karsilastiran kontroller
  for (const check of spec.checks ?? []) {
    body.push(`  CHECK (${check})`);
  }

  for (const fk of spec.foreignKeys ?? []) {
    // transcript_segment sunucuda uretilmez; ona giden FK atlanir (SD-01)
    const target = fk.references.split("(")[0]?.trim();
    if (target === "transcript_segment") continue;
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

export function generatePostgres(): string {
  const specs = topologicalSort(tablesFor("postgres"));
  return [
    GENERATED_HEADER,
    "-- Hedef: PostgreSQL · Kapsam: §23.2 hoca notları",
    "--",
    "-- Çekirdek tablolar (§4, §12.15, §18.4, §19.6) bu dosyada DEĞİLDİR;",
    "-- infra/db/schema.sql içinde elle yazılmış hâlde durur. Gerekçe:",
    "-- packages/schema/src/generate/tables.ts başındaki not.",
    "--",
    "-- scholar_note.segment_id sunucuda HER ZAMAN NULL'dur; transcript_segment",
    "-- tablosu sunucuda üretilmez ve ona giden yabancı anahtar yazılmaz (SD-01).",
    "",
    "BEGIN;",
    "",
    specs.map(tableDdl).join("\n\n"),
    "",
    "COMMIT;",
    "",
  ].join("\n");
}
