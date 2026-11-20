/**
 * Icerik aktarma adimi — Sure ici konu bolumlemesi.
 */

import { fail } from "@kuran/pipeline";
import type { ImportContext } from "../context.js";
import { expandRef, insertPlain } from "../db.js";

export async function importSections(ctx: ImportContext): Promise<void> {
  const { client, data, report, sid } = ctx;

  if (data.sections.length > 0) {
    const verseCounts = new Map(
      (await client.query<{ id: number; verse_count: number }>(
        "SELECT id, verse_count FROM surah",
      )).rows.map((r) => [r.id, r.verse_count]),
    );

    /*
     * Sema bitisikligi zaten dogruladi (1'den baslar, bosluk yok). Burada
     * yalnizca veritabanina karsi dogrulanabilen sey bakiliyor: bolumleme
     * surenin SONUNA kadar gidiyor mu? Sema sure uzunlugunu bilemez.
     */
    const sectionErrors: string[] = [];
    for (const file of data.sections) {
      const count = verseCounts.get(file.surahId);
      if (count === undefined) {
        sectionErrors.push(`sure ${String(file.surahId)} yok`);
        continue;
      }
      const last = file.sections[file.sections.length - 1];
      if (last !== undefined && last.verseEnd !== count) {
        sectionErrors.push(
          `sure ${String(file.surahId)}: bolumleme ${String(last.verseEnd)}. ayette bitiyor, ` +
            `sure ${String(count)} ayet — kalan ayetler basliksiz kalirdi`,
        );
      }
      for (const section of file.sections) {
        if (section.verseEnd > count) {
          sectionErrors.push(
            `sure ${String(file.surahId)} bolum ${String(section.order)}: ` +
              `${String(section.verseEnd)}. ayet yok (sure ${String(count)} ayet)`,
          );
        }
        for (const ref of section.alsoVerses) {
          for (const id of expandRef(ref)) {
            // Ek ayet baska surede olamaz: bolum bir surenin icindedir.
            if (Math.floor(id / 1000) !== file.surahId) {
              sectionErrors.push(
                `sure ${String(file.surahId)} bolum ${String(section.order)}: ` +
                  `ek ayet '${ref}' baska surede`,
              );
              break;
            }
            const n = id % 1000;
            if (n >= section.verseStart && n <= section.verseEnd) {
              sectionErrors.push(
                `sure ${String(file.surahId)} bolum ${String(section.order)}: ` +
                  `ek ayet '${ref}' zaten ana aralikta`,
              );
              break;
            }
          }
        }
      }
    }
    if (sectionErrors.length > 0) {
      for (const e of sectionErrors) console.error(`   x ${e}`);
      fail(`${sectionErrors.length} bolumleme hatasi — hicbir sey yazilmadi`);
    }

    await insertPlain(
      client,
      "surah_section",
      ["surah_id", "order", "title", "verse_start", "verse_end", "origin", "source_id", "note"],
      data.sections.flatMap((f) =>
        f.sections.map((x) => [
          f.surahId, x.order, x.title, x.verseStart, x.verseEnd,
          f.origin, f.sourceSlug === null ? null : sid(f.sourceSlug), x.note,
        ]),
      ),
    );

    // section_verse YALNIZCA istisnalari tutar (DDL notu): ana aralik
    // surah_section satirinda zaten duruyor, orayi kopyalamak veriyi ikizlerdi.
    const sectionId = new Map<string, number>();
    for (const r of (await client.query<{ id: number; surah_id: number; order: number }>(
      'SELECT id, surah_id, "order" FROM surah_section',
    )).rows) sectionId.set(`${String(r.surah_id)}:${String(r.order)}`, r.id);

    const extraRows: unknown[][] = [];
    for (const f of data.sections) {
      for (const x of f.sections) {
        const id = sectionId.get(`${String(f.surahId)}:${String(x.order)}`);
        if (id === undefined) continue;
        const seen = new Set<number>();
        for (const ref of x.alsoVerses) {
          for (const verseId of expandRef(ref)) {
            if (seen.has(verseId)) continue;
            seen.add(verseId);
            extraRows.push([id, verseId]);
          }
        }
      }
    }
    await insertPlain(client, "section_verse", ["section_id", "verse_id"], extraRows);

    const covered = data.sections.reduce((a, f) => a + f.sections.length, 0);
    report.note(
      `Bolumleme: ${data.sections.length} sure · ${covered} konu basligi · ` +
        `${extraRows.length} ek ayet baglantisi`,
    );
  }
}
