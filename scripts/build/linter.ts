/**
 * Referans linter — plan 20.1 zorunlu adimi.
 *
 * "data/** altindaki tum ayet referanslari, kavram/kok/kissa/ilke slug'lari ve
 *  source_id'ler veritabanina karsi dogrulanir. Hatali veya var olmayan
 *  referans varsa build BASARISIZ olur."
 *
 * Uc kume denetim yapar:
 *   A. Veritabani butunlugu   — DDL'in ifade edemedigi kurallar
 *   B. Uretilen statik JSON   — Zod semalarina karsi dogrulama
 *   C. data/** elle veri      — ayet referanslari ve slug'lar veritabaninda var mi
 *
 * Calistirma:  pnpm --filter @kuran/build lint:refs
 * Cikis kodu:  0 temiz, 1 en az bir hata
 */

import { closePool, info } from "@kuran/pipeline";
import { checkDatabase } from "./lint/database.js";
import { checkManualData } from "./lint/manual.js";
import { checkPageClaims } from "./lint/pages.js";
import { checksRun, errors, warnings } from "./lint/report.js";
import { checkStaticOutput } from "./lint/static_output.js";

async function main(): Promise<void> {
  await checkDatabase();
  checkStaticOutput();
  await checkManualData();
  checkPageClaims();

  info("");
  info(`${checksRun()} denetim calisti`);

  if (warnings.length > 0) {
    info(`${warnings.length} uyari:`);
    for (const message of warnings) info(`   ! ${message}`);
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} HATA:`);
    for (const message of errors) console.error(`   x ${message}`);
    console.error("\nReferans linter basarisiz — build tamamlanmadi (plan 20.1).");
    await closePool();
    process.exit(1);
  }

  info("referans linter temiz");
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    await closePool();
    console.error(error);
    process.exit(1);
  });
