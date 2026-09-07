import { config } from "./config.js";
import { buildDailyMessage, loadSchedule, turkishAuthors } from "./content.js";
import {
  find,
  setAuthor,
  setSendHour,
  subscribe,
  unsubscribe,
} from "./store.js";
import { sendMessage } from "./telegram.js";

/**
 * Bot komutlari — plan 19.4:
 *   /start /gunluk /haftalik /meal /saat /dur /yardim
 *
 * KVKK aydinlatmasi abonelik akisinda GOSTERILIR (plan 19.2): /start ilk
 * mesajinda neyin saklandigi ve nasil silinecegi yazili.
 */

const KVKK = [
  "<b>Ne saklaniyor?</b>",
  "Yalnizca gonderim icin zorunlu olanlar: bu sohbetin kimligi, siklik,",
  "sectiginiz meal, saat dilimi ve gonderim saati.",
  "Adiniz, kullanici adiniz ve mesaj gecmisiniz KAYDEDILMEZ.",
  "Hangi ayetin gonderildigi de saklanmaz.",
  "<b>/dur</b> yazdiginizda kaydiniz silinir — arsivlenmez, isaretlenmez, silinir.",
].join("\n");

const HELP = [
  "<b>Komutlar</b>",
  "/gunluk — her gun bir ayet ve bir ilke",
  "/haftalik — haftada bir (Cuma)",
  "/meal — mealin sahibini secin",
  "/saat — gonderim saatini secin (0-23)",
  "/bugun — bugunun mesajini simdi gonder",
  "/durum — aboneliginizin ayarlari",
  "/dur — abonelikten cikin, kaydiniz silinsin",
  "/yardim — bu liste",
  "",
  "Icerik siteyle aynidir ve kaynaklidir; bot kendi yorumunu uretmez.",
  `${config.siteUrl}`,
].join("\n");

/** "/meal diyanet-isleri-baskanligi" -> ["meal", "diyanet-isleri-baskanligi"] */
function parse(text: string): { command: string; argument: string } {
  const trimmed = text.trim();
  const space = trimmed.indexOf(" ");
  const head = space === -1 ? trimmed : trimmed.slice(0, space);
  const command = head.replace(/^\//, "").split("@")[0]?.toLowerCase() ?? "";
  return { command, argument: space === -1 ? "" : trimmed.slice(space + 1).trim() };
}

async function sendToday(chatId: string, authorSlug: string): Promise<void> {
  const schedule = loadSchedule();
  if (schedule.length === 0) {
    await sendMessage(chatId, "Gonderim takvimi henuz hazir degil.");
    return;
  }
  /*
   * "Bugun" takvimin kacinci gunu: yilin gunu. Abonenin imleciyle DEGIL,
   * cunku /bugun bir onizlemedir ve imleci ilerletmemeli.
   */
  const start = Date.UTC(new Date().getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start) / 86_400_000);
  const entry = schedule[dayOfYear % schedule.length];
  if (entry === undefined) return;
  const message = buildDailyMessage(entry, authorSlug);
  await sendMessage(
    chatId,
    message?.text ?? "Bugunun icerigi hazirlanamadi; yayin guncelleniyor olabilir.",
  );
}

export async function handleCommand(chatId: string, text: string): Promise<void> {
  const { command, argument } = parse(text);
  const current = find(chatId);

  switch (command) {
    case "start": {
      await sendMessage(
        chatId,
        [
          "<b>Kur'an-i Kerim Kesfi</b>",
          "",
          "Her gun bir ayet ve bir ilke gonderebilirim. Icerik sitedekiyle",
          "aynidir, kaynaklidir; bot kendi yorumunu uretmez, reklam ve bagis",
          "cagrisi gondermez.",
          "",
          "Baslamak icin: /gunluk ya da /haftalik",
          "",
          KVKK,
        ].join("\n"),
      );
      return;
    }

    case "gunluk":
    case "haftalik": {
      const frequency = command === "gunluk" ? "daily" : "weekly";
      const saved = subscribe(chatId, frequency);
      await sendMessage(
        chatId,
        [
          frequency === "daily"
            ? "Gunluk gonderim acildi."
            : "Haftalik gonderim acildi (Cuma gunleri).",
          `Saat: ${String(saved.sendHour)}:00 (${saved.timezone})`,
          `Meal: ${saved.authorSlug}`,
          "",
          "Degistirmek icin: /meal · /saat",
          "Cikmak icin: /dur",
        ].join("\n"),
      );
      return;
    }

    case "meal": {
      const authors = turkishAuthors();
      if (argument === "") {
        const listing = authors.map((a) => `${a.name} — <code>/meal ${a.slug}</code>`).join("\n");
        await sendMessage(
          chatId,
          [`<b>Turkce mealler (${String(authors.length)})</b>`, "", listing].join("\n"),
        );
        return;
      }
      const match = authors.find((a) => a.slug === argument);
      if (match === undefined) {
        await sendMessage(chatId, "Bu meal bulunamadi. Listeyi gormek icin: /meal");
        return;
      }
      if (current === null) {
        await sendMessage(chatId, "Once /gunluk ya da /haftalik ile abone olun.");
        return;
      }
      setAuthor(chatId, match.slug);
      await sendMessage(chatId, `Meal secildi: ${match.name}`);
      return;
    }

    case "saat": {
      if (current === null) {
        await sendMessage(chatId, "Once /gunluk ya da /haftalik ile abone olun.");
        return;
      }
      const hour = Number.parseInt(argument, 10);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        await sendMessage(
          chatId,
          `Saat 0 ile 23 arasinda olmali. Ornek: <code>/saat 7</code> (su an ${String(current.sendHour)}:00)`,
        );
        return;
      }
      setSendHour(chatId, hour);
      await sendMessage(chatId, `Gonderim saati ${String(hour)}:00 olarak ayarlandi.`);
      return;
    }

    case "bugun": {
      await sendToday(chatId, current?.authorSlug ?? config.defaultAuthor);
      return;
    }

    case "durum": {
      if (current === null) {
        await sendMessage(chatId, "Kayitli bir aboneliginiz yok. /gunluk ile baslayabilirsiniz.");
        return;
      }
      await sendMessage(
        chatId,
        [
          "<b>Aboneliginiz</b>",
          `Siklik: ${current.frequency === "daily" ? "gunluk" : "haftalik (Cuma)"}`,
          `Saat: ${String(current.sendHour)}:00 (${current.timezone})`,
          `Meal: ${current.authorSlug}`,
          "",
          KVKK,
        ].join("\n"),
      );
      return;
    }

    case "dur": {
      const removed = unsubscribe(chatId);
      await sendMessage(
        chatId,
        removed
          ? "Aboneliginiz silindi. Kayit arsivlenmedi, veritabanindan kaldirildi. Tekrar baslamak isterseniz /gunluk yeter."
          : "Zaten kayitli bir aboneliginiz yoktu.",
      );
      return;
    }

    case "yardim":
    case "help": {
      await sendMessage(chatId, HELP);
      return;
    }

    default: {
      await sendMessage(chatId, ["Bu komutu bilmiyorum.", "", HELP].join("\n"));
    }
  }
}
