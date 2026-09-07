import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { config, smtpConfigured } from "./config.js";
import { sendMessageMail } from "./mailer.js";
import { recordMailResult, saveMessage, unsentCount } from "./store.js";
import type { MessageKind, NewMessage } from "./store.js";

/**
 * İletişim / öneri / düzeltme formunun arka ucu.
 *
 * Sitenin TEK sunucu tarafı parçasıdır. Geri kalan her şey statik dosyadır;
 * bu servis yalnızca `POST /api/iletisim` isteğini karşılar ve 303 ile statik
 * bir sonuç sayfasına gönderir (POST-Redirect-GET) — böylece geri tuşu formu
 * yeniden göndermez ve sonuç sayfası da statik kalır.
 *
 * ## JavaScript istemez
 *
 * Form düz bir `<form method="post">`; tarayıcı POST eder, servis 303 döner.
 * Ayet sayfalarında olduğu gibi iletişim sayfasında da betik çalışmaz; CSP'de
 * yalnızca `form-action 'self'` açılır.
 *
 * ## Spam
 *
 * Captcha YOK — üçüncü taraf bağımlılığı demek olurdu (CLAUDE.md kural 5) ve
 * ziyaretçiyi izleyen bir hizmete sokardı. Yerine üç ucuz kapı:
 *   1. bal küpü alanı (`website`) — botlar doldurur, insan görmez
 *   2. IP başına hız sınırı (yalnızca BELLEKTE; diske yazılmaz)
 *   3. gövde ve alan uzunluk sınırları
 */

const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGE_CHARS = 5000;
const MIN_MESSAGE_CHARS = 10;

/** Pencere başına en fazla gönderim ve pencere uzunluğu. */
const RATE_MAX = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;
/** Arka arkaya iki gönderim arasındaki en kısa süre. */
const RATE_MIN_GAP_MS = 20 * 1000;

const KINDS = new Set<MessageKind>(["oneri", "duzeltme", "iletisim"]);

/**
 * IP başına gönderim zamanları — YALNIZCA BELLEKTE.
 *
 * Adres ham hâliyle tutulmaz, karması tutulur: servisin belleğini gören biri
 * ziyaretçi adreslerini okuyamasın. Süreç yeniden başlayınca liste sıfırlanır;
 * bu bir kusur değil, hız sınırının kalıcı bir kayıt olmaması bilinçlidir.
 */
const hits = new Map<string, number[]>();

function clientKey(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  const raw =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ??
    request.socket.remoteAddress ??
    "bilinmeyen";
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

type RateVerdict = "ok" | "cok-sik" | "cok-fazla";

function checkRate(key: string): RateVerdict {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  const last = recent.at(-1);
  if (last !== undefined && now - last < RATE_MIN_GAP_MS) return "cok-sik";
  if (recent.length >= RATE_MAX) return "cok-fazla";
  recent.push(now);
  hits.set(key, recent);
  return "ok";
}

/** Bellekte biriken eski kayıtları temizler; sınırsız büyümesin. */
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of hits) {
    const recent = times.filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length === 0) hits.delete(key);
    else hits.set(key, recent);
  }
}, RATE_WINDOW_MS).unref();

function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", () => {
      resolve(null);
    });
  });
}

function redirect(response: ServerResponse, path: string): void {
  response.writeHead(303, {
    location: path,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  response.end();
}

/** Boş ya da yalnızca boşluk olan alan null sayılır. */
function field(params: URLSearchParams, name: string, maxLength: number): string | null {
  const value = params.get(name)?.trim() ?? "";
  if (value === "") return null;
  return value.slice(0, maxLength);
}

type Parsed = { ok: true; message: NewMessage } | { ok: false; reason: string };

function parseForm(raw: string): Parsed {
  const params = new URLSearchParams(raw);

  /*
   * Bal küpü. Dolu geldiyse istek bir bottur. Ziyaretçiye HATA DEĞİL başarı
   * gösterilir: bota hangi alanın onu ele verdiğini öğretmenin anlamı yok.
   * Mesaj hiçbir yere yazılmaz.
   */
  if ((params.get("website") ?? "") !== "") return { ok: false, reason: "bot" };

  const kindRaw = params.get("tur") ?? "iletisim";
  const kind = KINDS.has(kindRaw as MessageKind) ? (kindRaw as MessageKind) : "iletisim";

  const body = params.get("mesaj")?.trim() ?? "";
  if (body.length < MIN_MESSAGE_CHARS) return { ok: false, reason: "kisa" };
  if (body.length > MAX_MESSAGE_CHARS) return { ok: false, reason: "uzun" };

  const verseRaw = field(params, "ayet", 16);
  if (verseRaw !== null && !/^\d{1,3}:\d{1,3}$/.test(verseRaw)) {
    return { ok: false, reason: "ayet" };
  }

  const email = field(params, "eposta", 200);
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: "eposta" };
  }

  return {
    ok: true,
    message: { kind, verseRef: verseRaw, name: field(params, "ad", 100), email, body },
  };
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");

  // Sağlık ucu: pm2/nginx ve elle bakış için. Kişisel veri döndürmez.
  if (request.method === "GET" && url.pathname === "/api/iletisim/durum") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({ ok: true, smtp: smtpConfigured(), gonderilemeyen: unsentCount() }),
    );
    return;
  }

  if (request.method !== "POST" || url.pathname !== "/api/iletisim") {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("bulunamadi\n");
    return;
  }

  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    redirect(response, config.errorPath);
    return;
  }

  const verdict = checkRate(clientKey(request));
  if (verdict !== "ok") {
    redirect(response, config.errorPath);
    return;
  }

  void (async () => {
    const raw = await readBody(request);
    if (raw === null) {
      redirect(response, config.errorPath);
      return;
    }

    const parsed = parseForm(raw);
    if (!parsed.ok) {
      // Bot: mesaj yazılmaz ama başarı gösterilir (yukarıdaki gerekçe).
      redirect(response, parsed.reason === "bot" ? config.successPath : config.errorPath);
      return;
    }

    let id: number;
    try {
      id = saveMessage(parsed.message);
    } catch (error) {
      console.error(
        `[iletisim] KAYIT BASARISIZ: ${error instanceof Error ? error.message : "bilinmeyen"}`,
      );
      redirect(response, config.errorPath);
      return;
    }

    /*
     * Mesaj YAZILDI; ziyaretçiye burada "alındı" denir ve mail arkada gönderilir.
     * Postanın gecikmesi ziyaretçinin bekletilmesini gerektirmez — mesaj
     * kaybolmadı, sonucu satıra düşecek.
     */
    redirect(response, config.successPath);

    const error = await sendMessageMail(id, parsed.message);
    recordMailResult(id, error);
    // Mesaj GÖVDESİ loga yazılmaz; günlükte yalnızca kimlik ve sonuç durur.
    console.log(
      error === null
        ? `[iletisim] #${String(id)} ${parsed.message.kind} kaydedildi, mail gonderildi`
        : `[iletisim] #${String(id)} ${parsed.message.kind} kaydedildi, MAIL GONDERILEMEDI: ${error}`,
    );
  })();
});

server.listen(config.port, "127.0.0.1", () => {
  console.log(
    `[iletisim] 127.0.0.1:${String(config.port)} · db=${config.dbPath} · ` +
      `smtp=${smtpConfigured() ? "yapilandirildi" : "YOK (mesajlar yalnizca veritabanina yazilir)"}`,
  );
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
