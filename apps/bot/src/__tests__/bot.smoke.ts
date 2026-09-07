/**
 * Bot duman testleri.
 *
 * Iki sey dogrulanir, ikisi de sessizce yanlis calisabilecek yerler:
 *
 *   1. GONDERIM ZAMANI — saat dilimi hesabi. Yanlis olursa abone mesaji
 *      gece 3'te alir ya da hic almaz; hata da vermez.
 *   2. MESAJ KURULUMU — yayindaki statik JSON'lardan ayet + ilke.
 *      Secili meal o ayette yoksa BASKA yazarin metni sessizce "senin
 *      sectigin meal" gibi gosterilmemeli (CLAUDE.md kural 4).
 *
 * Calistirma:  pnpm --filter @kuran/bot test:smoke
 *
 * Test YAYINDAKI surumu degil REPODAKI ciktiyi okur (BOT_DATA_DIR paket
 * betiginde veriliyor): testin yeni yayin alinmis olmasina bagli olmamasi
 * gerekiyor. Servis calisirken yine yayindaki surumu okur.
 */

import { isDue, localTime } from "../dispatch.js";
import { buildDailyMessage, loadSchedule, turkishAuthors } from "../content.js";
import type { Subscription } from "../store.js";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.error(`  HATA ${label}`);
  }
}

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

console.log("3. Takvim");

const schedule = loadSchedule();
check("takvim okunuyor", schedule.length > 0);
check("366 gun", schedule.length === 366);
check(
  "gun indeksleri sirali ve eksiksiz",
  schedule.every((entry, index) => entry.dayIndex === index),
);
check(
  "her gunun ilkesi ve ayeti var",
  schedule.every((e) => e.principleSlug.length > 0 && e.verseId > 0),
);
check(
  "verseId ile sure/ayet tutarli",
  schedule.every((e) => e.verseId === e.surahId * 1000 + e.verseNumber),
);
{
  // Ilkeler donusumlu olmali: ilk 60 gunde ayni ilke iki kez gelmemeli.
  const firstCycle = new Set(schedule.slice(0, 60).map((e) => e.principleSlug));
  check("ilk 60 gunde ilke tekrari yok", firstCycle.size === 60);
}

console.log("4. Mesaj");

const first = schedule[0];
if (first === undefined) {
  failures.push("takvim bos, mesaj testi calistirilamadi");
} else {
  const message = buildDailyMessage(first, "diyanet-isleri");
  check("mesaj kuruluyor", message !== null);
  check("ayet baglantisi mutlak", message?.verseUrl.startsWith("https://") === true);
  check("mesaj ilke bolumu tasiyor", message?.text.includes("<b>Ilke:</b>") === true);
  check("mesaj meal atfi tasiyor", message?.text.includes("meali</i>") === true);
  // Dogru meal secildiginde "bu ayette yok" notu CIKMAMALI. Bu not bir kez
  // yanlis slug yuzunden HER mesajda cikti (2026-09-07).
  check(
    "dogru meal secilince dusme notu cikmaz",
    message?.text.includes("Sectiginiz meal bu ayette yok") === false,
  );
  check(
    "varsayilan meal gercekten var",
    turkishAuthors().some((a) => a.slug === "diyanet-isleri"),
  );

  // Olmayan bir meal secilirse: metin yine gelir AMA hangi mealin
  // gosterildigi soylenir — sessizce baska yazarin metni verilmez.
  const fallback = buildDailyMessage(first, "olmayan-meal");
  check("olmayan meal secilirse mesaj yine kurulur", fallback !== null);
  check(
    "duserken hangi mealin gosterildigi SOYLENIR",
    fallback?.text.includes("Sectiginiz meal bu ayette yok") === true,
  );

  const missing = buildDailyMessage({ ...first, principleSlug: "olmayan-ilke" }, "diyanet-isleri");
  check("olmayan ilke null doner, uydurulmaz", missing === null);
}

console.log("");
if (failures.length > 0) {
  console.error(`${String(passed)} test gecti, ${String(failures.length)} basarisiz:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`${String(passed)} test gecti, 0 basarisiz`);
