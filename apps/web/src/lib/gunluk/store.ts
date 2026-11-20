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
      const db = request.result;
      /*
       * Başka bir sekme şemayı yükseltmek isterse bu bağlantı yol verir;
       * vermezse o sekmenin `open` çağrısı süresiz bloke kalırdı. Sonraki
       * işlem veritabanını yeniden açar.
       */
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
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
  // Başarısız açılış saklanmaz: yoksa sayfa yenilenene dek her işlem aynı
  // eski hatayla dönerdi.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/**
 * Bir isteğin sonucunu, İŞLEM TAMAMLANINCA verir.
 *
 * `request.onsuccess` yazmanın diske indiğini göstermez: kota dolarsa işlem
 * istekten SONRA iptal olur. Sayfa o durumda "kaydedildi" dememeli; bu yüzden
 * söz `tx.oncomplete`te çözülür, `onabort` / `onerror`da reddedilir.
 */
function settle<T>(
  tx: IDBTransaction,
  label: string,
  result: () => T,
  resolve: (value: T) => void,
  reject: (reason: unknown) => void,
): void {
  tx.oncomplete = () => {
    resolve(result());
  };
  tx.onabort = () => {
    reject(tx.error ?? new Error(`${label}: işlem iptal edildi`));
  };
  tx.onerror = () => {
    reject(tx.error ?? new Error(`${label}: işlem başarısız`));
  };
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
        settle(tx, storeName, () => request.result, resolve, reject);
      }),
  );
}

export interface BatchWrite {
  /** Yazmadan önce boşaltılacak depolar */
  clear: readonly string[];
  puts: readonly { store: string; value: unknown }[];
}

/**
 * Birden çok depoya TEK işlemde yazar: ya hepsi iner ya hiçbiri.
 *
 * İçe aktarma bunu kullanır. Depolar ayrı ayrı boşaltılıp kayıtlar tek tek
 * yazılsaydı, yarıda çıkan bir hata (bozuk kayıt, dolu kota) kullanıcıyı
 * silinmiş ama geri yüklenmemiş bir günlükle bırakırdı. Burada herhangi bir
 * `put` hata verirse işlem iptal olur ve boşaltma da geri alınır.
 */
export function writeBatch(batch: BatchWrite): Promise<void> {
  const names = [...new Set([...batch.clear, ...batch.puts.map((p) => p.store)])];
  if (names.length === 0) return Promise.resolve();
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(names, "readwrite");
        settle(tx, "toplu yazma", () => undefined, resolve, reject);
        try {
          for (const name of batch.clear) tx.objectStore(name).clear();
          for (const { store, value } of batch.puts) {
            tx.objectStore(store).put(value as object);
          }
        } catch (error) {
          // Anahtarı eksik kayıt `put` içinde senkron DataError atar.
          tx.abort();
          reject(error);
        }
      }),
  );
}

/**
 * Tarayıcıdan bu sitenin verisini depolama baskısında silmemesini ister.
 * Notlar yalnız bu cihazda durduğu için ilk yazmada bir kez sorulur;
 * reddedilirse hiçbir şey bozulmaz.
 */
let persistAsked = false;
export function requestPersistence(): void {
  if (persistAsked) return;
  persistAsked = true;
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    // eski tarayıcı: StorageManager yok
  }
}

export const getAll = <T>(store: string): Promise<T[]> =>
  run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);

export const get = <T>(store: string, key: IDBValidKey): Promise<T | undefined> =>
  run<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);

export const put = <T>(store: string, value: T): Promise<IDBValidKey> => {
  requestPersistence();
  return run<IDBValidKey>(store, "readwrite", (s) => s.put(value as unknown as object));
};

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
