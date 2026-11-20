/**
 * Linter'in ortak hata/uyari defteri.
 *
 * Butun denetim modulleri buraya yazar; `linter.ts` sonda okur ve cikis kodunu
 * buna gore verir. Tek bir defter olmasi bilincli: denetimler birbirinden
 * bagimsiz kosar ama rapor TEK listedir ve sirasi kosu sirasidir.
 */

export const errors: string[] = [];
export const warnings: string[] = [];
let run = 0;

/** Bir denetimin kostugunu sayar; sonucunu cagiran kendisi `errors`a yazar. */
export function tick(): void {
  run += 1;
}

export function checksRun(): number {
  return run;
}

export function check(label: string, ok: boolean, detail: string): void {
  run += 1;
  if (ok) return;
  errors.push(`${label}: ${detail}`);
}

export function warn(label: string, detail: string): void {
  warnings.push(`${label}: ${detail}`);
}
