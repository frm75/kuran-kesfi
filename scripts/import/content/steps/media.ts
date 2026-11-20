/**
 * Icerik aktarma adimi — Medya: AI prompt'lari, gercek ve uretilmis medya kayitlari.
 */

import type { AiPromptInput } from "@kuran/schema";
import type { ImportContext, IdMap } from "../context.js";
import { expandRef, insertPlain, insertReturning } from "../db.js";

export async function importMedia(ctx: ImportContext, ids: { locationId: IdMap; storyId: IdMap; eventId: IdMap }): Promise<void> {
  const { client, data, report, sid } = ctx;
  const { locationId, storyId, eventId } = ids;
  const eid = (order: number): number | undefined => eventId.get(String(order));

  /*
   * --- medya (spec 32-71) -------------------------------------------------
   *
   * Zaman cizelgesinden SONRA: prompt ve medya kayitlari kissa, konum ve
   * olay id'lerine baglanir, ucu de yukarida yazildi.
   *
   * Prompt'lar once yazilir cunku media_item.ai_prompt_id onlara isaret
   * eder. `base_image_prompt_id` kendine gonderme oldugu icin ikinci gecise
   * birakilir — tek INSERT icinde henuz olusmamis bir id'ye baglanamaz.
   */
  const promptId = await insertReturning(
    client,
    "ai_prompt",
    [
      "prompt_key", "title", "prompt_type", "prompt", "negative_prompt", "model",
      "duration_sec", "aspect_ratio", "version", "depicts_prophet",
      "story_id", "location_id", "timeline_event_id",
    ],
    data.prompts.map((p) => [
      p.id, p.title, p.promptType, p.prompt, p.negativePrompt, p.model,
      p.durationSec, p.aspectRatio, p.version, p.depictsProphet,
      p.storySlug === null ? null : storyId.get(p.storySlug),
      p.locationSlug === null ? null : locationId.get(p.locationSlug),
      p.timelineOrder === null ? null : eid(p.timelineOrder),
    ]),
    "prompt_key",
  );
  /*
   * Prompt kimligi -> prompt kaydi. AI medyasinin kissa/konum/olay baglari
   * BURADAN gelir; ai_generated.json'da bag alani YOKTUR ve olmamalidir.
   */
  const promptByKey = new Map(data.prompts.map((p) => [p.id, p]));
  const promptOf = (key: string): AiPromptInput | undefined => promptByKey.get(key);
  const aiLocationId = (key: string): number | null => {
    const slug = promptOf(key)?.locationSlug;
    return slug == null ? null : (locationId.get(slug) ?? null);
  };

  for (const p of data.prompts) {
    if (p.baseImagePromptId === null) continue;
    await client.query("UPDATE ai_prompt SET base_image_prompt_id = $2 WHERE id = $1", [
      promptId.get(p.id),
      promptId.get(p.baseImagePromptId),
    ]);
  }

  /*
   * Gercek medya ve AI medyasi AYNI tabloya yazilir ama alanlari birbirine
   * karismaz: veritabanindaki media_item_kind_split ve
   * media_item_ai_has_no_source kisitlari bunu zorlar. Burada iki ayri
   * satir uretici olmasinin sebebi de bu — tek bir "esnek" nesne kurup
   * ikisini de ondan turetmek, kisitlarin yakaladigi hatayi kod duzeyinde
   * mumkun kilardi.
   *
   * AI ciktisinda `face_scanned` yayin kapisidir ve dosyadan OLDUGU GIBI
   * gelir; import onu true yapmaz. Kare kare yuz taramasi insana bagli
   * (CLAUDE.md "Gorsel ve VIDEO kurali").
   */
  const MEDIA_COLUMNS = [
    "media_key", "kind", "title", "description", "caution",
    "source_name", "source_url", "original_url", "author", "institution", "source_date",
    "license", "license_raw", "license_url", "copyright",
    "location_name", "lat", "lng", "location_id", "manuscript_id",
    "local_path", "width", "height",
    "ai_prompt_id", "generator", "model", "sha256", "duration_sec", "created_at",
    "face_scanned", "face_scan_note",
  ] as const;

  const mediaRows: unknown[][] = [
    ...data.media.map((m) => [
      m.id, m.kind, m.title, m.description, m.caution,
      m.sourceName, m.sourceUrl, m.originalUrl, m.author, m.institution, m.date,
      m.license, m.licenseRaw, m.licenseUrl, m.copyright,
      m.locationName, m.lat, m.lng,
      m.locationSlug === null ? null : locationId.get(m.locationSlug), m.manuscriptId,
      m.localPath, m.width, m.height,
      null, null, null, null, null, null,
      false, null,
    ]),
    ...data.aiMedia.map((a) => [
      a.id, a.kind, a.title, null, null,
      null, null, null, null, null, null,
      null, null, null, null,
      /*
       * Konum AI kaydinin KENDISINDE yok, prompt'unda var. ai_generated.json
       * `collect` tarafindan uretilir ve yalnizca dosyanin olculebilir
       * ozelliklerini tasir (karma, en/boy, sure); nereye ait oldugu
       * editoryal bir karardir ve prompt'ta durur.
       */
      null, null, null, aiLocationId(a.promptId), null,
      a.localPath, a.width, a.height,
      promptId.get(a.promptId), a.generator, a.model, a.sha256, a.durationSec, a.createdAt,
      a.faceScanned, a.faceScanNote,
    ]),
  ];
  const mediaId = await insertReturning(client, "media_item", MEDIA_COLUMNS, mediaRows, "media_key");

  /*
   * KISSA BAGI — gercek medya kendi `storySlugs` alanindan, AI medyasi
   * PROMPT'undan gelir.
   *
   * 2026-09-07'ye kadar yalnizca `data.media` yaziliyordu. Sonuc: AI kaydi
   * media_item'a giriyor, yuz taramasi onaylaniyor, media.json'a cikiyor ve
   * HICBIR SAYFADA gorunmuyordu — kissa sayfasi `storySlugs` ile suzuyor,
   * dizi bos oldugu icin hep eleniyordu. Hata vermiyordu; yalnizca ortada
   * yoktu. Ilk 10 AI ciktisi yayina alinirken yakalandi.
   */
  await insertPlain(
    client,
    "media_story",
    ["media_item_id", "story_id"],
    [
      ...data.media.flatMap((m) =>
        [...new Set(m.storySlugs)].map((s) => [mediaId.get(m.id), storyId.get(s)]),
      ),
      ...data.aiMedia.flatMap((a) => {
        const slug = promptOf(a.promptId)?.storySlug;
        return slug == null ? [] : [[mediaId.get(a.id), storyId.get(slug)]];
      }),
    ],
  );
  const mediaVerseRows: unknown[][] = [];
  for (const m of data.media) {
    const seen = new Set<number>();
    for (const ref of m.verseRefs) for (const id of expandRef(ref)) {
      if (seen.has(id)) continue;
      seen.add(id);
      mediaVerseRows.push([mediaId.get(m.id), id]);
    }
  }
  await insertPlain(client, "media_verse", ["media_item_id", "verse_id"], mediaVerseRows);
  await insertPlain(
    client,
    "media_timeline_event",
    ["media_item_id", "timeline_event_id"],
    [
      ...data.media.flatMap((m) =>
        [...new Set(m.timelineOrders)].map((o) => [mediaId.get(m.id), eid(o)]),
      ),
      ...data.aiMedia.flatMap((a) => {
        const order = promptOf(a.promptId)?.timelineOrder;
        return order == null ? [] : [[mediaId.get(a.id), eid(order)]];
      }),
    ],
  );
  await insertPlain(
    client,
    "media_source",
    ["media_item_id", "source_id"],
    data.media.flatMap((m) => [...new Set(m.sourceSlugs)].map((x) => [mediaId.get(m.id), sid(x)])),
  );

  const unscanned = data.aiMedia.filter((a) => !a.faceScanned).length;
  report.note(
    `Medya: ${data.media.length} gercek · ${data.aiMedia.length} AI cikti ` +
      `(${unscanned} taranmamis, yayina girmez) · ${data.prompts.length} prompt`,
  );
}
