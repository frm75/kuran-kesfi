import { createServer } from "node:http";
import { config, configured } from "./config.js";
import { turkishAuthors } from "./content.js";
import { handleCommand } from "./commands.js";
import { dispatch } from "./dispatch.js";
import { activeCount, getState, setState } from "./store.js";
import { getMe, getUpdates } from "./telegram.js";

/**
 * Telegram botu — plan 19.
 *
 * Iki dongu birlikte calisir:
 *   1. UZUN YOKLAMA — gelen komutlari isler (webhook yok, disariya uc acilmaz)
 *   2. SAAT BASI GONDERIM — her abonenin kendi saat diliminde
 *
 * Site statik kalir; bot ayri kucuk servistir (plan 19.6) ve site
 * veritabanina baglanmaz — yayindaki statik JSON'lari okur.
 *
 * BOT_TOKEN bos ise servis YINE CALISIR: yalnizca saglik ucunu acar ve
 * "yapilandirilmamis" der. Boylece pm2 altinda hazir durur, token gelince
 * `pm2 restart kuran-bot` yeter.
 */

const OFFSET_KEY = "updateOffset";

async function pollLoop(): Promise<void> {
  let offset = Number.parseInt(getState(OFFSET_KEY) ?? "0", 10);
  for (;;) {
    try {
      const updates = await getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        const message = update.message;
        if (message?.text === undefined) continue;
        // Yalnizca birebir sohbet; gruplarda calismaz (plan 19.2: kanal kimligi
        // disinda veri tutulmaz, grup uyeleri bunu secmemis olur).
        if (message.chat.type !== "private") continue;
        try {
          await handleCommand(String(message.chat.id), message.text);
        } catch (error) {
          console.error(
            `[bot] komut hatasi: ${error instanceof Error ? error.message : "bilinmeyen"}`,
          );
        }
      }
      setState(OFFSET_KEY, String(offset));
    } catch (error) {
      console.error(`[bot] yoklama hatasi: ${error instanceof Error ? error.message : "bilinmeyen"}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/**
 * Saat basi gonderim.
 *
 * Cron yerine surec ici zamanlayici: servis zaten surekli acik (yoklama
 * dongusu) ve ayri bir cron girdisi yonetmek gereksiz bir parca olurdu.
 * Ilk tik bir sonraki tam saatte, sonra saatte bir.
 */
function scheduleDispatch(): void {
  const runOnce = (): void => {
    void dispatch()
      .then((result) => {
        if (result.sent > 0 || result.failed > 0) {
          console.log(
            `[bot] gonderim: ${String(result.sent)} basarili · ${String(result.failed)} hata · ` +
              `${String(result.skipped)} zamani degil`,
          );
        }
      })
      .catch((error: unknown) => {
        console.error(
          `[bot] gonderim dongusu hatasi: ${error instanceof Error ? error.message : "bilinmeyen"}`,
        );
      });
  };

  const now = new Date();
  const msToNextHour =
    (60 - now.getMinutes()) * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds();
  setTimeout(() => {
    runOnce();
    setInterval(runOnce, 60 * 60 * 1000);
  }, msToNextHour).unref();
}

/*
 * Varsayilan meal gercekten var mi?
 *
 * Yanlis bir slug servisi DURDURMAZ ama her mesaja "sectiginiz meal bu ayette
 * yok" notu dusurur — mesaj gider, yanlis gorunur, kimse fark etmez. Bir kez
 * yasandi (2026-09-07: "diyanet-isleri-baskanligi" yazilmisti, dogrusu
 * "diyanet-isleri"). Acilista bir kez bakiliyor.
 */
function checkDefaultAuthor(): void {
  const authors = turkishAuthors();
  if (authors.length === 0) {
    console.error(`[bot] UYARI: meal listesi okunamadi (${config.dataDir}) — yayin alinmis mi?`);
    return;
  }
  if (!authors.some((a) => a.slug === config.defaultAuthor)) {
    console.error(
      `[bot] UYARI: BOT_DEFAULT_AUTHOR='${config.defaultAuthor}' meal listesinde yok. ` +
        `Her mesaja "sectiginiz meal bu ayette yok" notu duser. ` +
        `Gecerli ornekler: ${authors.slice(0, 3).map((a) => a.slug).join(", ")}`,
    );
  }
}

// Saglik ucu — yalnizca yerelden; kisisel veri dondurmez.
createServer((request, response) => {
  if (request.url === "/api/bot/durum") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, configured: configured(), abone: activeCount() }));
    return;
  }
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("bulunamadi\n");
}).listen(config.healthPort, "127.0.0.1");

checkDefaultAuthor();

if (!configured()) {
  console.log(
    `[bot] BOT_TOKEN bos — yalnizca saglik ucu acik (127.0.0.1:${String(config.healthPort)}). ` +
      ".env doldurup 'pm2 restart kuran-bot' calistirin.",
  );
} else {
  getMe()
    .then((me) => {
      console.log(
        `[bot] @${me.username} · ${String(activeCount())} abone · veri ${config.dataDir}`,
      );
      scheduleDispatch();
      return pollLoop();
    })
    .catch((error: unknown) => {
      console.error(
        `[bot] baslatilamadi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
      );
      process.exit(1);
    });
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    process.exit(0);
  });
}
