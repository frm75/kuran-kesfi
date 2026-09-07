import { config } from "./config.js";

/**
 * Telegram Bot API istemcisi — bagimliliksiz.
 *
 * grammY ALINMADI. Ihtiyac duyulan yuzey uc uctan ibaret (getUpdates,
 * sendMessage, getMe) ve hepsi duz bir POST. Projenin Dexie ve D3 kararlariyla
 * ayni gerekce: kutuphane kendini odemiyor. Webhook yerine UZUN YOKLAMA
 * (long polling) secildi — webhook nginx'te yeni bir genel uc acmayi ve gizli
 * yol yonetmeyi gerektirirdi; yoklama disariya hicbir sey acmiyor.
 */

const API = "https://api.telegram.org";

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  date: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface ApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

async function call<T>(method: string, body: unknown, timeoutMs = 20_000): Promise<T> {
  const response = await fetch(`${API}/bot${config.token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await response.json()) as ApiResponse<T>;
  if (!data.ok || data.result === undefined) {
    throw new Error(`${method}: ${data.description ?? `HTTP ${String(response.status)}`}`);
  }
  return data.result;
}

export const getMe = (): Promise<{ username: string; id: number }> =>
  call<{ username: string; id: number }>("getMe", {});

/**
 * Uzun yoklama. `timeout` saniyesi boyunca Telegram baglantiyi acik tutar ve
 * mesaj gelince doner; bos donerse dongu yeniden cagirir. Bu yuzden istemci
 * zaman asimi sunucunun timeout'undan UZUN olmali, yoksa her turda bosuna
 * hata uretiriz.
 */
export const getUpdates = (offset: number, timeoutSec = 25): Promise<TelegramUpdate[]> =>
  call<TelegramUpdate[]>(
    "getUpdates",
    { offset, timeout: timeoutSec, allowed_updates: ["message"] },
    (timeoutSec + 10) * 1000,
  );

export async function sendMessage(chatId: string, text: string): Promise<void> {
  await call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    // Ayet metni uzun; baglanti onizlemesi mesaji ikiye bolup dikkat dagitiyor.
    link_preview_options: { is_disabled: true },
  });
}
