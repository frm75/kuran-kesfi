import { z } from "zod";
import { dbId, isoTimestamp, slug } from "./common.js";

/**
 * Mesaj aboneligi — plan 19.6.
 *
 * Veri minimizasyonu (plan 19.2): sunucuda yalnizca iletim icin zorunlu veri
 * tutulur. Isim, e-posta, davranis verisi TUTULMAZ. Tek komutla (/dur, "DUR")
 * abonelik iptal edilir ve kayit FIZIKSEL OLARAK SILINIR.
 *
 * Gonderim takvimi (schedule.json) deterministik oldugundan kullaniciya hangi
 * ayetin gonderildigi kalici olarak kaydedilmez; yalnizca imlec ilerletilir.
 */

export const subscriptionChannel = z.enum(["telegram", "whatsapp", "email", "push"]);
export type SubscriptionChannel = z.infer<typeof subscriptionChannel>;

export const subscriptionFrequency = z.enum(["daily", "weekly"]);
export type SubscriptionFrequency = z.infer<typeof subscriptionFrequency>;

export const subscription = z.object({
  id: dbId,
  channel: subscriptionChannel,
  /** Telegram chat_id veya telefon numarasi — kanala gore */
  channelId: z.string().min(1),
  frequency: subscriptionFrequency,
  /**
   * Tercih edilen mealin author.slug degeri. Bot veritabani site build
   * veritabanindan ayridir (plan 19.6), bu yuzden yabanci anahtar yerine
   * kararli slug tutulur.
   */
  authorSlug: slug,
  /** IANA saat dilimi: "Europe/Istanbul" */
  timezone: z.string().min(1),
  sendHour: z.number().int().min(0).max(23),
  createdAt: isoTimestamp,
  lastSentAt: isoTimestamp.nullable(),
  /** Yillik takvimdeki son gonderilen gun indeksi */
  scheduleCursor: z.number().int().nonnegative(),
  active: z.boolean(),
});
export type Subscription = z.infer<typeof subscription>;

/** Yillik gonderim takvimi girdisi — build asamasinda uretilir (plan 19.5). */
export const scheduleEntry = z.object({
  /** Yilin gunu: 0-365 */
  dayIndex: z.number().int().min(0).max(365),
  /**
   * verse.id = sure * 1000 + ayet. Bu deger SERI DEGIL, ayet numarasindan
   * hesaplanir; yeniden import edildiginde kaymaz.
   */
  verseId: dbId,
  /** Kolaylik: verseId'den turetilir, bot ikinci bir hesap yapmasin. */
  surahId: z.number().int().min(1).max(114),
  verseNumber: z.number().int().positive(),
  /**
   * principle.slug — SAYISAL ID DEGIL.
   *
   * `principle.id` bir seridir ve `pnpm content:import` her calistiginda
   * tablo bosaltilip yeniden dolduruldugu icin degisebilir. Takvim bot
   * veritabaninda imlecle takip ediliyor; id kaysaydi abonelere sessizce
   * BASKA ilke gitmeye baslardi. `subscription.authorSlug` ayni gerekceyle
   * slug tutuyor.
   */
  principleSlug: slug,
  /** Ramazan, kandil, kurban gibi tematik secimler icin etiket */
  occasion: z.string().nullable(),
});
export type ScheduleEntry = z.infer<typeof scheduleEntry>;

export const schedule = z.object({
  version: z.literal(1),
  generatedAt: isoTimestamp,
  entries: z.array(scheduleEntry),
});
export type Schedule = z.infer<typeof schedule>;
