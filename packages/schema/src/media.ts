import { z } from "zod";

/**
 * Medya katmani — gercek gorsel, arkeoloji, belge, harita ve AI canlandirma
 * (plan 32-71, docs/gorevler MEDYA modulu).
 *
 * ## UC TUR ASLA KARISTIRILMAZ
 *
 * Modulun tek tasarim kurali budur (spec 32). Bir kayit ya gercek dunyaya ait
 * bir belgedir, ya da AI ile uretilmis bir canlandirmadir; ikisinin alanlari
 * da farklidir:
 *
 *   GERCEK   kaynak + lisans tasir, prompt tasimaz
 *   AI       prompt tasir, kaynak/lisans tasimaz
 *
 * Ayrim `kind` alanina birakilmadi — iki AYRI girdi semasi var
 * (`mediaItemInput`, `aiMediaInput`, content_input.ts). Boylece bir AI
 * gorseline "Wikimedia Commons" kaynagi yazmak sema duzeyinde IMKANSIZ.
 * Veritabaninda ikisi ayni tabloda (`media_item`) durur ve ayrimi bir CHECK
 * kisiti korur (infra/db/schema.sql).
 *
 * ## LISANS BIR ETIKET DEGIL, KAPIDIR
 *
 * `COPYRIGHT`, `LINK_ONLY` ve `UNKNOWN` lisansli bir gorsel sunucuya
 * KOPYALANMAZ (spec 34); yalnizca "Kaynagi goruntule" baglantisi gosterilir.
 * Bu kural `isHostableLicense` ile koda dondu ve girdi semasinda `refine`
 * olarak uygulanir: kisitli lisansli bir kaydin `localPath` alani doluysa
 * import baslamadan durur. `manuscript` katmanindaki "goruntu tasimaz"
 * linteriyle ayni desen.
 */

// --- Tur ---------------------------------------------------------------------

/**
 * GERCEK medya turleri (spec 63 filtre listesi).
 *
 * `MANUSCRIPT` burada bilerek duruyor ama bugun bostur: 2322 Corpus Coranicum
 * yazmasinin hepsinde goruntu izni "restricted" (manuscript.ts). Baska bir
 * koleksiyondan izinli mushaf goruntusu gelirse yeri hazir.
 */
export const realMediaKind = z.enum([
  "REAL_PHOTO", // gunumuz fotografi — cografya, dag, vadi, sehir
  "ARCHAEOLOGY", // kazi alani, kaya mezari, kalinti, muze objesi
  "DOCUMENT", // kitabe, yazit, papirus, eski harita, tarihi belge
  "MANUSCRIPT", // eski mushaf goruntusu
  "MAP", // harita goruntusu (etkilesimli harita degil)
]);
export type RealMediaKind = z.infer<typeof realMediaKind>;

/** AI ile uretilen medya turleri (spec 49, 57). */
export const aiMediaKind = z.enum(["AI_IMAGE", "AI_VIDEO"]);
export type AiMediaKind = z.infer<typeof aiMediaKind>;

/** Butun medya turleri — veritabani kolonu ve arayuz filtresi bunu kullanir. */
export const mediaKind = z.enum([...realMediaKind.options, ...aiMediaKind.options]);
export type MediaKind = z.infer<typeof mediaKind>;

// --- Lisans ------------------------------------------------------------------

/** Kullanim durumu (spec 34). Kaynagin kendi beyani; tahmin edilmez. */
export const mediaLicense = z.enum([
  "PUBLIC_DOMAIN",
  "CC0",
  "CC_BY",
  "CC_BY_SA",
  "CC_BY_NC",
  "COPYRIGHT",
  "LINK_ONLY",
  "UNKNOWN",
]);
export type MediaLicense = z.infer<typeof mediaLicense>;

/**
 * Sunucuya kopyalanabilir lisanslar (spec 34).
 *
 * `CC_BY_NC` listede: `data/` agaci zaten CC BY-NC-SA 4.0 ve proje ticari
 * degil (CLAUDE.md kural 6). Ticari bir kullanim gundeme gelirse bu satir
 * yeniden degerlendirilir — spec 34'un son cumlesi tam olarak bunu soyluyor.
 */
const hostableLicenses = new Set<MediaLicense>([
  "PUBLIC_DOMAIN",
  "CC0",
  "CC_BY",
  "CC_BY_SA",
  "CC_BY_NC",
]);

/** Bu lisansli dosya indirilip yayinlanabilir mi? (spec 34) */
export function isHostableLicense(license: MediaLicense): boolean {
  return hostableLicenses.has(license);
}

/**
 * Atif zorunlu mu?
 *
 * Yalnizca CC atif lisanslarinda. Atif metni `copyright` alanindadir ve arayuz
 * onu kartta gosterir; bos birakilamaz (girdi semasindaki refine).
 *
 * COPYRIGHT / LINK_ONLY / UNKNOWN listede YOK ve bu bilerek: o dosyalari
 * barindirmiyoruz, yalnizca kunye sayfasina baglaniyoruz. Atif metnini bilmek
 * de zorunda degiliz — lisansi bilinmeyen bir dosyanin atif satirini yazmak
 * zaten uydurma olurdu. PUBLIC_DOMAIN ve CC0 ise atif istemez.
 */
const attributionLicenses = new Set<MediaLicense>(["CC_BY", "CC_BY_SA", "CC_BY_NC"]);

export function requiresAttribution(license: MediaLicense): boolean {
  return attributionLicenses.has(license);
}

// --- AI prompt ---------------------------------------------------------------

/** Prompt turu (spec 65). */
export const aiPromptType = z.enum(["IMAGE", "VIDEO"]);
export type AiPromptType = z.infer<typeof aiPromptType>;

/**
 * Prompt Ingilizce yazilir (plan 20.3) — render sadakati icin.
 *
 * Tam bir dil tespiti yapilmaz; yalnizca TARTISMASIZ Turkce harfler ve Arap
 * harfleri reddedilir. c/o/u gibi harfler baska dillerde de gectigi icin
 * disarida birakildi: amac yanlis alarm uretmek degil, "prompt'u Turkce
 * yazdim" hatasini yakalamak.
 *
 * SINIRI BILINEREK KABUL EDILDI: ASCII'ye sadelestirilmis Turkce ("gemi
 * yapimini gosteren...") bu kapidan gecer. Yakalanamaz, cunku o metin
 * karakter duzeyinde Ingilizce'den ayirt edilemez. Gercek hata bicimi
 * dogal yazilmis Turkce'dir ve o her zaman ğ/ı/ş tasir.
 */
const nonEnglishPromptChars = /[ğĞıİşŞ؀-ۿ]/;

/** Ingilizce prompt metni — bos olmayan, Turkce/Arapca harf tasimayan. */
export const promptText = z
  .string()
  .trim()
  .min(1)
  .refine((t) => !nonEnglishPromptChars.test(t), {
    message: "AI prompt'lari yalnizca Ingilizce yazilir (plan 20.3)",
  });

/**
 * Peygamber yuzu kisiti (CLAUDE.md, plan 20.3).
 *
 * Yasak YUZEDIR: insan figuru, siluet ve uzaktan kalabalik serbesttir. Bir
 * peygamberi tasvir eden prompt bu kisiti METNINDE tasimak zorundadir, cunku
 * uretici modele giden tek talimat prompt'un kendisidir — arayuzdeki etiket
 * uretimi etkilemez.
 *
 * Kontrol edilen ibare `identifiable face`; spec 50-56'daki hazir prompt'larin
 * hepsi bu ibareyi kullaniyor.
 */
export const prophetFaceConstraint = "identifiable face";

/** Prompt metni peygamber yuzu kisitini tasiyor mu? */
export function hasProphetFaceConstraint(prompt: string): boolean {
  return prompt.toLowerCase().includes(prophetFaceConstraint);
}

/** En/boy orani — "16:9", "1:1", "9:16". */
export const aspectRatio = z
  .string()
  .regex(/^\d{1,2}:\d{1,2}$/, "en/boy orani '16:9' biciminde olmali");

/**
 * AI video suresi (saniye).
 *
 * Spec 57 "yaklasik 10 saniye" diyor; ust sinir 60 sn cunku daha uzunu bu
 * modulun isi degil (hero videosu ayri hat: scripts/media/build_media.ts).
 */
export const aiVideoDurationSec = z.number().int().min(1).max(60);

// --- Uretim hatti ------------------------------------------------------------

/**
 * AI uretecinin kimligi (spec 66 — saglayiciya kilitlenme yok).
 *
 * Bugun tek deger `file-queue`: kod hicbir API'ye baglanmaz, prompt'lari
 * `media/ai/kuyruk/` altina yazar, uretim lokal makinede elle yapilir, cikti
 * `media/ai/cikti/` altindan toplanir. ComfyUI/A1111 gibi somut bir adaptor
 * eklenirse buraya yeni bir deger girer; `media_item` satirlari hangi hatla
 * uretildigini kaybetmez.
 */
export const aiGenerator = z.enum(["file-queue"]);
export type AiGenerator = z.infer<typeof aiGenerator>;

/**
 * Kullaniciya gosterilen AI etiketi (spec 49).
 *
 * SABIT metin, veriden gelmez: bir AI kartinin etiketini unutmak ya da
 * degistirmek mumkun olmasin diye bilesen bu sabiti kullanir.
 */
export const AI_DISCLAIMER_TR = "AI ile oluşturulmuştur — tarihsel fotoğraf değildir.";
