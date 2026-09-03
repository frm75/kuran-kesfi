import type { z } from "zod";
import type { ColumnKind, ColumnSpec } from "./types.js";

/**
 * Zod semasindan kolon bilgisi cikarimi.
 *
 * Zod 4 introspection: `schema._zod.def`. `.refine()` / `.superRefine()`
 * nesnenin tipini DEGISTIRMEZ (Zod 3'ten farkli) — `type: "object"` kalir ve
 * `shape` dogrudan okunabilir, sarmali acmak gerekmez.
 *
 * Brand tipleri (`VerseKey`, `ScholarSlug`...) taban tipine duser: TEXT.
 * Brand yalnizca TypeScript tarafinda anlamlidir (GOREV 02, tip eslemesi).
 */

interface ZodDef {
  type: string;
  format?: string;
  innerType?: unknown;
  element?: unknown;
  entries?: Record<string, string>;
  shape?: Record<string, unknown>;
  checks?: { _zod?: { def?: Record<string, unknown> } }[];
}

function def(schema: unknown): ZodDef | undefined {
  return (schema as { _zod?: { def?: ZodDef } } | undefined)?._zod?.def;
}

/** camelCase -> snake_case (CLAUDE.md: DB snake_case, TS camelCase). */
export function toSnakeCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function checkDefs(d: ZodDef | undefined): Record<string, unknown>[] {
  return (d?.checks ?? []).map((c) => c._zod?.def ?? {}).filter((x) => Object.keys(x).length > 0);
}

function isInteger(d: ZodDef | undefined): boolean {
  return checkDefs(d).some(
    (c) => c["check"] === "number_format" && typeof c["format"] === "string",
  );
}

function maxLengthOf(d: ZodDef | undefined): number | undefined {
  for (const c of checkDefs(d)) {
    if (c["check"] === "max_length" && typeof c["maximum"] === "number") {
      return c["maximum"];
    }
  }
  return undefined;
}

/** Bir kolonun tipini ve nullable durumunu cozer. */
function resolveColumn(name: string, schema: unknown): ColumnSpec {
  let current = schema;
  let nullable = false;

  // nullable / optional / default sarmallarini ac
  for (let depth = 0; depth < 8; depth += 1) {
    const d = def(current);
    if (d === undefined) break;
    if (d.type === "nullable" || d.type === "optional") {
      nullable = true;
      current = d.innerType;
      continue;
    }
    if (d.type === "default" || d.type === "prefault") {
      current = d.innerType;
      continue;
    }
    break;
  }

  const d = def(current);
  const column = (kind: ColumnKind, extra: Partial<ColumnSpec> = {}): ColumnSpec => ({
    name: toSnakeCase(name),
    kind,
    nullable,
    ...extra,
  });

  switch (d?.type) {
    case "enum": {
      const values = Object.values(d.entries ?? {});
      return column("text", { enumValues: values });
    }
    case "string": {
      // z.iso.datetime() -> format: "datetime"
      if (d.format === "datetime") return column("timestamp");
      const max = maxLengthOf(d);
      return max === undefined ? column("text") : column("text", { maxLength: max });
    }
    case "number":
      return column(isInteger(d) ? "int" : "float");
    case "boolean":
      return column("boolean");
    case "record":
    case "object":
      return column("json");
    case "array": {
      const element = def(d.element);
      if (element?.type === "number") return column("intArray");
      // Diger diziler JSON olarak tutulur
      return column("json");
    }
    case "literal":
      return column("text");
    default:
      throw new Error(
        `${name}: desteklenmeyen Zod tipi '${d?.type ?? "bilinmiyor"}' — ` +
          "introspect.ts icine eslesme eklenmeli",
      );
  }
}

/** Bir Zod nesnesinin tum kolonlarini cikarir. */
export function columnsOf(schema: z.ZodObject<z.ZodRawShape>): ColumnSpec[] {
  const shape = def(schema)?.shape;
  if (shape === undefined) {
    throw new Error("Zod nesnesinin 'shape' alani okunamadi");
  }
  return Object.entries(shape).map(([name, value]) => resolveColumn(name, value));
}
