/**
 * Bot duman testleri — GONDERIM ZAMANI (veri istemez, CI'da calisir).
 *
 * Saat dilimi hesabi sessizce yanlis calisabilecek bir yer: yanlis olursa
 * abone mesaji gece 3'te alir ya da hic almaz; hata da vermez.
 *
 * Calistirma:  pnpm --filter @kuran/bot test:smoke
 * Mesaj kurulumu testleri ayri: content.smoke.ts (test:data).
 */

import { isDue, localTime } from "../dispatch.js";
import type { Subscription } from "../store.js";
import { check, report } from "./check.js";

const base: Subscription = {
  id: 1,
  channelId: "1",
  frequency: "daily",
  authorSlug: "diyanet-isleri-baskanligi",
  timezone: "Europe/Istanbul",
  sendHour: 8,
  lastSentAt: null,
  scheduleCursor: 0,
};

console.log("1. Saat dilimi");

// 2026-09-07 05:00 UTC = Istanbul'da 08:00, Londra'da 06:00
const at05utc = new Date("2026-09-07T05:00:00.000Z");
check("Istanbul saati UTC+3", localTime("Europe/Istanbul", at05utc).hour === 8);
check("Londra saati ayri hesaplanir", localTime("Europe/London", at05utc).hour === 6);
check("yerel tarih dogru", localTime("Europe/Istanbul", at05utc).date === "2026-09-07");
check("2026-09-07 Pazartesi", localTime("Europe/Istanbul", at05utc).weekday === 1);
check(
  "gecersiz saat dilimi cokmez, varsayilana duser",
  localTime("Mars/Olympus", at05utc).hour === 8,
);
// Gece yarisi kenari: UTC 21:00 -> Istanbul ertesi gun 00:00
const midnight = localTime("Europe/Istanbul", new Date("2026-09-07T21:00:00.000Z"));
check("gece yarisi saat 24 degil 0 olur", midnight.hour === 0);
check("gece yarisi tarihi ertesi gune gecer", midnight.date === "2026-09-08");

console.log("2. Gonderim zamani");

check("saati gelen abone gonderilir", isDue(base, at05utc));
check(
  "saati gelmeyen abone gonderilmez",
  !isDue(base, new Date("2026-09-07T06:00:00.000Z")),
);
check(
  "ayni gun ikinci kez gonderilmez",
  !isDue({ ...base, lastSentAt: "2026-09-07T05:00:00.000Z" }, at05utc),
);
check(
  "ertesi gun yeniden gonderilir",
  isDue({ ...base, lastSentAt: "2026-09-06T05:00:00.000Z" }, at05utc),
);
check(
  "haftalik abone Pazartesi gonderilmez",
  !isDue({ ...base, frequency: "weekly" }, at05utc),
);
check(
  "haftalik abone Cuma gonderilir",
  isDue({ ...base, frequency: "weekly" }, new Date("2026-09-11T05:00:00.000Z")),
);
check(
  "abonenin kendi saat dilimi esas alinir",
  isDue({ ...base, timezone: "Europe/London" }, new Date("2026-09-07T07:00:00.000Z")),
);

report();
