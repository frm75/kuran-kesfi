import { createTransport } from "nodemailer";
import type { Transporter } from "nodemailer";
import { config, smtpConfigured } from "./config.js";
import type { NewMessage } from "./store.js";

/**
 * Mail gonderimi — esfasoft SMTP uzerinden.
 *
 * ## Neden sunucudaki sendmail degil
 *
 * kurankesfi.tr'nin SPF kaydi yok ve MX'i yok; o alan adindan cikan mail alici
 * tarafinda buyuk olasilikla spam'e duser. Gonderim Brevo (smtp-relay.brevo.com)
 * uzerinden yapiliyor: teslimat onun altyapisiyla imzalaniyor ve takip
 * edilebiliyor.
 *
 * BREVO'NUN SART KOSTUGU SEY: `CONTACT_FROM` adresi Brevo panelinde
 * DOGRULANMIS bir gonderen olmali (Senders & IP > Senders). Dogrulanmamis
 * adresle gonderim reddedilir ve hata `mail_error` sutununa duser — mesaj
 * yine de veritabaninda durur, kaybolmaz.
 *
 * ## Gonderen ve yanitlama
 *
 * Zarfin gondereni HER ZAMAN bizim kutumuzdur (`CONTACT_FROM`). Ziyaretcinin
 * yazdigi adres gonderen yapilmaz — o adres dogrulanmamistir ve baskasi adina
 * mail gondermek olurdu. Adres yalnizca `Reply-To` olur; "Yanitla" dogru kisiye
 * gider.
 */

let cached: Transporter | null = null;

function transporter(): Transporter {
  cached ??= createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  return cached;
}

const KIND_LABEL: Record<NewMessage["kind"], string> = {
  oneri: "Öneri",
  duzeltme: "Düzeltme",
  iletisim: "İletişim",
};

/**
 * @returns hata metni; gonderim basarilisya null.
 *
 * Hata FIRLATILMAZ: cagiran taraf mesaji zaten kaydetti ve ziyaretciye
 * "alindi" demek dogrudur — mesaj kaybolmadi, yalnizca postasi gecikti.
 */
export async function sendMessageMail(id: number, message: NewMessage): Promise<string | null> {
  if (!smtpConfigured()) return "SMTP yapilandirilmamis (.env: SMTP_HOST/USER/PASS)";

  const lines = [
    `Tür     : ${KIND_LABEL[message.kind]}`,
    message.verseRef === null ? null : `Ayet    : ${message.verseRef}`,
    message.name === null ? null : `Ad      : ${message.name}`,
    message.email === null ? null : `E-posta : ${message.email}`,
    `Kayıt   : #${String(id)}`,
    "",
    message.body,
    "",
    "—",
    "kurankesfi.tr iletişim formu",
  ].filter((line): line is string => line !== null);

  try {
    await transporter().sendMail({
      from: config.from,
      to: config.to,
      // Ziyaretcinin adresi varsa yanit ona gider; zarfin gondereni degismez.
      replyTo: message.email ?? undefined,
      subject: `[kurankesfi] ${KIND_LABEL[message.kind]}${
        message.verseRef === null ? "" : ` — ${message.verseRef}`
      }`,
      text: lines.join("\n"),
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "bilinmeyen SMTP hatasi";
  }
}
