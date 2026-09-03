import { z } from "zod";
import { dbId, isoTimestamp } from "./common.js";

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
  /** Tercih edilen meal */
  authorId: dbId,
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
  verseId: dbId,
  principleId: dbId,
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
