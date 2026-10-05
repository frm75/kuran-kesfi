/**
 * Bot duman testlerinin ortak yardimcisi: `check()` ve sonuc raporu.
 * Iki dosya kullanir — dispatch.smoke.ts (veri istemez) ve
 * content.smoke.ts (build ciktisi ister).
 */

let passed = 0;
const failures: string[] = [];

export function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.error(`  HATA ${label}`);
  }
}

/** Calistirilamayan bir test grubunu basarisiz say (sessizce atlanmaz). */
export function fail(label: string): void {
  failures.push(label);
}

export function report(): void {
  console.log("");
  if (failures.length > 0) {
    console.error(`${String(passed)} test gecti, ${String(failures.length)} basarisiz:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`${String(passed)} test gecti, 0 basarisiz`);
}
