import { z } from "zod";
import { dbId, nonEmptyText } from "./common.js";

/**
 * Eski mushaf yazmalari (Corpus Coranicum, BBAW).
 *
 * GORUNTU TASIMAZ. Taranan 2322 yazmanin hepsinde goruntu izni "restricted";
 * yalnizca corpuscoranicum.de'ye derin baglanti verilir (CLAUDE.md kural 5,
 * docs/KAYNAK_ENVANTERI.md 2.4).
 *
 * Kaynak veri CC BY-SA 4.0'dir ve `data-external/corpus-coranicum/` altinda
 * durur; `data/` (CC BY-NC-SA) ile birlestirilmez.
 */

/** Bir yazmanin kapsadigi ayet araligi (birlestirilmis). */
export const manuscriptRange = z
  .object({
    startVerseId: dbId,
    endVerseId: dbId,
  })
  .refine((r) => r.endVerseId >= r.startVerseId, {
    message: "endVerseId startVerseId'den kucuk olamaz",
  });
export type ManuscriptRange = z.infer<typeof manuscriptRange>;

export const manuscript = z.object({
  /** Corpus Coranicum kimligi; derin baglanti bu sayiyla kurulur */
  id: z.number().int().positive(),
  title: nonEmptyText,
  repository: z.string().nullable(),
  idno: z.string().nullable(),
  /** Kaynagin kendi tarihlemesi ("700-800"); yorumlanmadan aktarilir */
  origDate: z.string().nullable(),
  /**
   * Tarihlemenin baslangic yili — siralama icin origDate'ten cikarilir.
   * Cikarilamiyorsa null; uydurulmaz.
   */
  dateStart: z.number().int().nullable(),
  script: z.string().nullable(),
  summary: z.string().nullable(),
  pageCount: z.number().int().min(0),
  url: z.string(),
  ranges: z.array(manuscriptRange),
});
export type Manuscript = z.infer<typeof manuscript>;
