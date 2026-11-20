/**
 * Icerik aktarma adimi — Noldeke nuzul siralamasi.
 */

import { info } from "@kuran/pipeline";
import type { ImportContext } from "../context.js";

export async function importNoldeke(ctx: ImportContext): Promise<void> {
  const { client, data, report } = ctx;

  if (data.noldeke !== null) {
    let updated = 0;
    for (const [surah, order] of Object.entries(data.noldeke.order)) {
      const r = await client.query("UPDATE surah SET revelation_order_noldeke = $2 WHERE id = $1", [Number(surah), order]);
      updated += r.rowCount ?? 0;
    }
    info(`surah.revelation_order_noldeke: ${updated} sure guncellendi`);
    report.note(`Noldeke siralamasi: ${updated} sure · kaynak ${data.noldeke.sourceSlug}`);
  }
}
