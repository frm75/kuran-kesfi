import type { TableSpec } from "./types.js";

/**
 * Tablolari yabanci anahtar bagimliligina gore siralar (GOREV 02 / N5).
 *
 * Sirayi elle sabitlemek yerine uretici cozer; yeni tablo eklendiginde kimse
 * sirayi dusunmek zorunda kalmaz. Dongu varsa HATA verilir.
 *
 * Kendine referans (ornek: concept.parent_id) bagimlilik sayilmaz.
 */
export function topologicalSort(specs: readonly TableSpec[]): TableSpec[] {
  const present = new Set(specs.map((s) => s.name));

  const dependencies = new Map<string, Set<string>>();
  for (const spec of specs) {
    const deps = dependencies.get(spec.name) ?? new Set<string>();
    for (const fk of spec.foreignKeys ?? []) {
      const target = fk.references.split("(")[0]?.trim();
      // Kendine referans ve bu hedefte uretilmeyen tablolar atlanir
      if (target === undefined || target === spec.name || !present.has(target)) continue;
      deps.add(target);
    }
    dependencies.set(spec.name, deps);
  }

  const sorted: TableSpec[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const byName = new Map<string, TableSpec[]>();
  for (const spec of specs) {
    byName.set(spec.name, [...(byName.get(spec.name) ?? []), spec]);
  }

  const visit = (name: string, trail: string[]): void => {
    if (done.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Tablo bagimliliginda dongu: ${[...trail, name].join(" -> ")}`);
    }
    visiting.add(name);
    for (const dep of dependencies.get(name) ?? []) {
      visit(dep, [...trail, name]);
    }
    visiting.delete(name);
    done.add(name);
    for (const spec of byName.get(name) ?? []) sorted.push(spec);
  };

  for (const spec of specs) visit(spec.name, []);
  return sorted;
}
