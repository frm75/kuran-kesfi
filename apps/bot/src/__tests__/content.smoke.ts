/**
 * Bot duman testleri — MESAJ KURULUMU (build ciktisi ister).
 *
 * Yayindaki statik JSON'lardan ayet + ilke. Secili meal o ayette yoksa
 * BASKA yazarin metni sessizce "senin sectigin meal" gibi gosterilmemeli
 * (CLAUDE.md kural 4).
 *
 * Calistirma:  pnpm --filter @kuran/bot test:data   (once `pnpm build:data`)
 *
 * Test YAYINDAKI surumu degil REPODAKI ciktiyi okur (BOT_DATA_DIR paket
 * betiginde veriliyor): testin yeni yayin alinmis olmasina bagli olmamasi
 * gerekiyor. Servis calisirken yine yayindaki surumu okur.
 *
 * CI'da CALISMAZ: apps/web/public/data git'e girmez. Veri yoksa test
 * atlanmaz, DUSER — sessiz gecis gercek bir hatayi gizlerdi.
 */

import { buildDailyMessage, loadSchedule, turkishAuthors } from "../content.js";
import { check, fail, report } from "./check.js";

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
  fail("takvim bos, mesaj testi calistirilamadi");
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

report();
