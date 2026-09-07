import type { MemoryState } from "./fsrs";

/**
 * Okuma günlüğünün deposu — IndexedDB, yalnızca tarayıcıda.
 *
 * ## Sunucuya hiçbir şey gitmez
 *
 * Plan §1.2, §1.3, §4.6, §12.7: davranış verisi toplanmaz, profil
 * oluşturulmaz. Site statiktir; yazacak bir uç zaten yok. Notlar, yer imleri,
 * okuma ilerlemesi ve ezber durumu bu cihazın IndexedDB'sinde durur. Cihazlar
 * arası taşıma tek bir JSON dosyasıyla, kullanıcının kendi eliyle yapılır.
 *
 * ## Neden Dexie yok
 *
 * Plan §6 "Dexie.js (IndexedDB)" diyor. Kurulmadı: altı basit depo ve anahtar
 * bazlı okuma için 25 KB'lık bir bağımlılık gerekmiyor, aşağıdaki ~120 satır
 * aynı işi yapıyor. Proje D3 ve Cytoscape'i de aynı gerekçeyle almamıştı.
 * Sorgu ihtiyacı büyürse (çok alanlı indeks, canlı sorgu) karar gözden
 * geçirilir.
 *
 * ## Sürüm ve göç
 *
 * `DB_VERSION` artarsa `upgrade` içindeki adımlar SIRAYLA çalışır; eski
 * sürümden gelen tarayıcı aradaki bütün adımları görür. Depo silinmez —
 * kullanıcının verisi bizim şema kararımıza kurban edilmez.
 */

const DB_NAME = "kurankesfi-gunluk";
const DB_VERSION = 1;

export const STORES = {
  notes: "notes",
  bookmarks: "bookmarks",
  progress: "progress",
  memorization: "memorization",
  settings: "settings",
  /** Henüz arayüzü olmayan bölümler (keşif yolu, karşılaştırma sepeti).
   *  İçe aktarılan dosyada varsa KAYBEDİLMEZ, olduğu gibi saklanır. */
  passthrough: "passthrough",
} as const;

export interface Note {
  id: string;
  verseKey: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bookmark {
  verseKey: string;
  createdAt: string;
  label: string | null;
}

export interface Progress {
  surahId: number;
  lastVerse: number;
  updatedAt: string;
}

export interface MemorizationReview {
  reviewedAt: string;
  rating: number;
}

export interface Memorization extends MemoryState {
  verseKey: string;
  intervalDays: number;
  nextReviewAt: string;
  history: MemorizationReview[];
}

export interface Settings {
  selectedAuthors: string[];
  fontSize: number;
  showArabic: boolean;
  showTranscription: boolean;
  theme: "light" | "dark" | "system";
}

export const DEFAULT_SETTINGS: Settings = {
  selectedAuthors: [],
  fontSize: 18,
  showArabic: true,
  showTranscription: true,
  theme: "system",
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.notes)) {
        const notes = db.createObjectStore(STORES.notes, { keyPath: "id" });
        notes.createIndex("verseKey", "verseKey", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.bookmarks)) {
        db.createObjectStore(STORES.bookmarks, { keyPath: "verseKey" });
      }
      if (!db.objectStoreNames.contains(STORES.progress)) {
        db.createObjectStore(STORES.progress, { keyPath: "surahId" });
      }
      if (!db.objectStoreNames.contains(STORES.memorization)) {
        const memo = db.createObjectStore(STORES.memorization, { keyPath: "verseKey" });
        memo.createIndex("nextReviewAt", "nextReviewAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.passthrough)) {
        db.createObjectStore(STORES.passthrough, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB açılamadı"));
    };
    /*
     * Gizli sekmede ya da depolama kapalıyken IndexedDB bloke olabilir.
     * Sessizce beklemek yerine söylenir; sayfa "kaydedildi" deyip
     * kaydetmemekten iyidir.
     */
    request.onblocked = () => {
      reject(new Error("IndexedDB başka bir sekme tarafından kilitlenmiş"));
    };
  });
  return dbPromise;
}

function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = action(tx.objectStore(storeName));
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(request.error ?? new Error(`${storeName}: işlem başarısız`));
        };
      }),
  );
}

export const getAll = <T>(store: string): Promise<T[]> =>
  run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);

export const get = <T>(store: string, key: IDBValidKey): Promise<T | undefined> =>
  run<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);

export const put = <T>(store: string, value: T): Promise<IDBValidKey> =>
  run<IDBValidKey>(store, "readwrite", (s) => s.put(value as unknown as object));

export const remove = (store: string, key: IDBValidKey): Promise<undefined> =>
  run<undefined>(store, "readwrite", (s) => s.delete(key) as IDBRequest<undefined>);

export const clear = (store: string): Promise<undefined> =>
  run<undefined>(store, "readwrite", (s) => s.clear() as IDBRequest<undefined>);

export async function getSettings(): Promise<Settings> {
  const row = await get<{ key: string; value: Settings }>(STORES.settings, "app");
  return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
}

export const saveSettings = (value: Settings): Promise<IDBValidKey> =>
  put(STORES.settings, { key: "app", value });

/** Tarayıcı IndexedDB veriyor mu? Gizli sekmede vermeyebilir. */
export function isAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}
