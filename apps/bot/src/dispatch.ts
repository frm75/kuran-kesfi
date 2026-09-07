import { advanceCursor, listActive } from "./store.js";
import type { Subscription } from "./store.js";
import { buildDailyMessage, loadSchedule } from "./content.js";
import { sendMessage } from "./telegram.js";
import { config } from "./config.js";

/**
 * Gonderim — saat basi calisir.
 *
 * Her abonenin KENDI saat diliminde `send_hour` olunca gonderilir. Saat dilimi
 * hesabi Intl ile yapiliyor; ayri bir tarih kutuphanesi alinmadi.
 *
 * Tekrar onleme abonelik kaydindaki `last_sent_at` ile: ayni yerel gunde
 * ikinci kez gonderilmez. Hangi ayetin gonderildigi KAYDEDILMEZ (plan 19.2) —
 * takvim deterministik oldugu icin yalnizca imlec ilerler.
 */

interface LocalTime {
  hour: number;
  /** "2026-09-07" — abonenin kendi saat diliminde */
  date: string;
  /** 1 = Pazartesi … 7 = Pazar */
  weekday: number;
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Gecersiz saat dilimi kaydi gonderimi durdurmasin: varsayilana duser. */
export function localTime(timezone: string, now: Date): LocalTime {
  let zone = timezone;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(now);
  } catch {
    zone = config.defaultTimezone;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayName = get("weekday").slice(0, 3).toLowerCase();
  const index = WEEKDAYS.indexOf(weekdayName as (typeof WEEKDAYS)[number]);
  return {
    // 24 saatlik bicimde gece yarisi bazi ortamlarda "24" gelir.
    hour: Number(get("hour")) % 24,
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: index === -1 ? 1 : index + 1,
  };
}

/** Bu abone su an gonderim istiyor mu? */
export function isDue(subscription: Subscription, now: Date): boolean {
  const local = localTime(subscription.timezone, now);
  if (local.hour !== subscription.sendHour) return false;
  if (subscription.frequency === "weekly" && local.weekday !== config.weeklyWeekday) return false;
  if (subscription.lastSentAt === null) return true;
  // Ayni yerel gunde ikinci kez gonderme.
  return localTime(subscription.timezone, new Date(subscription.lastSentAt)).date !== local.date;
}

export interface DispatchResult {
  sent: number;
  failed: number;
  skipped: number;
}

export async function dispatch(now = new Date()): Promise<DispatchResult> {
  const schedule = loadSchedule();
  const result: DispatchResult = { sent: 0, failed: 0, skipped: 0 };
  if (schedule.length === 0) return result;

  for (const subscription of listActive()) {
    if (!isDue(subscription, now)) {
      result.skipped += 1;
      continue;
    }
    const entry = schedule[subscription.scheduleCursor % schedule.length];
    if (entry === undefined) {
      result.failed += 1;
      continue;
    }
    const message = buildDailyMessage(entry, subscription.authorSlug);
    if (message === null) {
      result.failed += 1;
      console.error(`[bot] gun ${String(entry.dayIndex)} icin icerik kurulamadi`);
      continue;
    }
    try {
      await sendMessage(subscription.channelId, message.text);
      /*
       * Imlec YALNIZCA gonderim BASARILI olunca ilerler. Hata durumunda ayni
       * gun yeniden denenir (plan 19.6) — abone bir gunu kacirmis olmaz.
       */
      advanceCursor(subscription.id, subscription.scheduleCursor + 1, now.toISOString());
      result.sent += 1;
    } catch (error) {
      result.failed += 1;
      // Mesaj METNI loga yazilmaz; yalnizca sonuc.
      console.error(
        `[bot] gonderim basarisiz: ${error instanceof Error ? error.message : "bilinmeyen"}`,
      );
    }
  }
  return result;
}
