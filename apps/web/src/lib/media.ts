import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { StaticMedia, StaticMediaItem, StaticVerseMedia } from "@kuran/schema";

/**
 * Medya katmanı — okuma tarafı (plan §32-71).
 *
 * `manuscripts.ts` ile aynı kalıp: dosya bir kez okunur, tarayıcıya gitmez.
 *
 * ## ÜÇ TÜR KARIŞMAZ
 *
 * Gerçek belge ile AI canlandırması ayrı gruplarda gösterilir ve asla aynı
 * listede sıralanmaz (spec §32). Ayrım burada `isAiMedia` ile yapılır; kart
 * bileşeni AI etiketini ŞABLONDAN basar (`AI_DISCLAIMER_TR`), veriden değil.
 *
 * ## DOSYA ADRESİ BURADA KURULUR
 *
 * Veri dosyaları göreli yol taşır ("gorsel/cudi.jpg"); tam adres bu modülde
 * birleştirilir. Sebep `scripts/media/r2_sync.ts`'in gerekçesiyle aynı:
 * sağlayıcı değişimi tek DNS kaydına inmeli, 34 veri kaydına gömülü mutlak
 * adrese değil.
 *
 * ## MEDYA GELMEZSE SAYFA BOZULMAZ
 *
 * R2 düşerse yalnızca görsel gelmez; kart başlığı, bağlam cümlesi, künye ve
 * "Kaynağı görüntüle" bağlantısı yerinde kalır (CLAUDE.md kural 5). Bugün
 * zaten hiçbir dosya barındırılmıyor — kayıtların hepsi bağlantıyla duruyor.
 */

/** Ağır medyanın servis edildiği alan adı (CLAUDE.md kural 5). */
export const MEDIA_BASE = "https://medya.kurankesfi.tr";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/data");

function readJsonOrNull<T>(relativePath: string): T | null {
  const path = resolve(DATA_DIR, relativePath);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function once<T>(load: () => T): () => T {
  let value: { result: T } | undefined;
  return () => {
    value ??= { result: load() };
    return value.result;
  };
}

export const getAllMedia = once(
  (): StaticMediaItem[] => readJsonOrNull<StaticMedia>("media.json")?.media ?? [],
);

const mediaById = once((): Map<string, StaticMediaItem> => {
  return new Map(getAllMedia().map((m) => [m.id, m]));
});

const verseMedia = once(
  (): StaticVerseMedia["verses"] =>
    readJsonOrNull<StaticVerseMedia>("verse_media.json")?.verses ?? {},
);

/** AI ile üretilmiş mi? Gerçek belgeyle asla aynı listede gösterilmez. */
export function isAiMedia(item: StaticMediaItem): boolean {
  return item.kind === "AI_IMAGE" || item.kind === "AI_VIDEO";
}

/** Dosyanın tam adresi; barındırılmayan kayıtta null. */
export function mediaUrl(item: StaticMediaItem): string | null {
  if (item.path === null) return null;
  return `${MEDIA_BASE}/${item.path.replace(/^\/+/, "")}`;
}

/**
 * Kullanıcıya gösterilen tür adı.
 *
 * Spec §63'ün filtre listesiyle birebir; arayüzde başka bir ad kullanılmaz ki
 * "arkeoloji" ile "gerçek fotoğraf" ayrımı her yerde aynı kelimeyle dursun.
 */
export const MEDIA_KIND_LABEL = {
  REAL_PHOTO: "Gerçek fotoğraf",
  ARCHAEOLOGY: "Arkeoloji",
  DOCUMENT: "Tarihsel belge",
  MANUSCRIPT: "Eski mushaf",
  MAP: "Harita",
  AI_IMAGE: "AI görsel",
  AI_VIDEO: "AI video",
} as const;

/** Gruplama ve gösterim sırası — gerçek önce, AI sonra (spec §62). */
export const MEDIA_KIND_ORDER = [
  "REAL_PHOTO",
  "ARCHAEOLOGY",
  "DOCUMENT",
  "MANUSCRIPT",
  "MAP",
  "AI_IMAGE",
  "AI_VIDEO",
] as const;

/** Lisansın kısa adı — kartta bu yazar. */
export const MEDIA_LICENSE_LABEL = {
  PUBLIC_DOMAIN: "Kamu malı",
  CC0: "CC0",
  CC_BY: "CC BY",
  CC_BY_SA: "CC BY-SA",
  CC_BY_NC: "CC BY-NC",
  COPYRIGHT: "Telifli",
  LINK_ONLY: "Yalnızca bağlantı",
  UNKNOWN: "Lisans belirsiz",
} as const;

export interface MediaGroup {
  kind: (typeof MEDIA_KIND_ORDER)[number];
  label: string;
  items: StaticMediaItem[];
}

/** Türe göre gruplar; boş tür hiç dönmez. */
export function groupByKind(items: readonly StaticMediaItem[]): MediaGroup[] {
  const groups: MediaGroup[] = [];
  for (const kind of MEDIA_KIND_ORDER) {
    const found = items.filter((m) => m.kind === kind);
    if (found.length === 0) continue;
    groups.push({ kind, label: MEDIA_KIND_LABEL[kind], items: found });
  }
  return groups;
}

/** Bir kıssaya bağlı medya. */
export function getStoryMedia(storySlug: string): StaticMediaItem[] {
  return getAllMedia().filter((m) => m.storySlugs.includes(storySlug));
}

/** Bir konuma bağlı medya. */
export function getLocationMedia(locationSlug: string): StaticMediaItem[] {
  return getAllMedia().filter((m) => m.locationSlug === locationSlug);
}

/**
 * Bir ayete bağlı medya.
 *
 * Ters dizin üzerinden; ayet başına en çok birkaç kayıt düşüyor (34 kayıt,
 * 108 ayet), kısaltmaya gerek yok.
 */
export function getVerseMedia(surahId: number, verseNumber: number): StaticMediaItem[] {
  const ids = verseMedia()[String(surahId * 1000 + verseNumber)] ?? [];
  const byId = mediaById();
  return ids.map((id) => byId.get(id)).filter((m): m is StaticMediaItem => m !== undefined);
}
