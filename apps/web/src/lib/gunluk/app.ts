import {
  DEFAULT_SETTINGS,
  STORES,
  clear,
  get,
  getAll,
  getSettings,
  isAvailable,
  put,
  remove,
  saveSettings,
} from "./store";
import type { Bookmark, Memorization, Note, Progress, Settings } from "./store";
import { addDays, initialState, intervalDays, nextState } from "./fsrs";
import type { Rating } from "./fsrs";

/**
 * Okuma günlüğü arayüzü — plan §4.6, Faz 4.
 *
 * Sitenin JAVASCRIPT ÇALIŞAN TEK SAYFASI buradır (harita dışında). Karar
 * 2026-09-07'de kullanıcıyla alındı: 6236 ayet sayfası JS'siz kalsın, günlük
 * tek sayfada dönsün. Ayet sayfası yalnızca düz bir bağlantı taşır
 * (`/gunluk?ekle=2:255`); orada `default-src 'none'` CSP'si değişmedi.
 *
 * Sunucuya hiçbir şey gitmez; ayrıntı `store.ts` başında.
 */

interface SurahMeta {
  id: number;
  slug: string;
  nameTr: string;
  verseCount: number;
}

interface VerseData {
  textUthmani: string;
  surahNameTr: string;
  verseNumber: number;
  surahSlug: string;
  translations: { authorSlug: string; authorName: string; text: string }[];
}

const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`gunluk: '${selector}' bulunamadi`);
  return element;
};

// --- sure dizini (sayfaya gömülü, ağa gitmez) --------------------------------

const surahs: SurahMeta[] = JSON.parse(
  $("#gunluk-sureler").textContent ?? "[]",
) as SurahMeta[];
const surahById = new Map(surahs.map((s) => [s.id, s]));

/** "2:255" → geçerliyse parçalar, değilse null. Sure ve ayet sınırı denetlenir. */
function parseVerseKey(raw: string): { surahId: number; verseNumber: number } | null {
  const match = /^\s*(\d{1,3})\s*[:.]\s*(\d{1,3})\s*$/.exec(raw);
  if (match === null) return null;
  const surahId = Number(match[1]);
  const verseNumber = Number(match[2]);
  const surah = surahById.get(surahId);
  if (surah === undefined) return null;
  if (verseNumber < 1 || verseNumber > surah.verseCount) return null;
  return { surahId, verseNumber };
}

const verseLabel = (verseKey: string): string => {
  const parsed = parseVerseKey(verseKey);
  if (parsed === null) return verseKey;
  return `${surahById.get(parsed.surahId)?.nameTr ?? verseKey} ${String(parsed.verseNumber)}`;
};

const verseHref = (verseKey: string): string => {
  const parsed = parseVerseKey(verseKey);
  if (parsed === null) return "/sureler";
  return `/${surahById.get(parsed.surahId)?.slug ?? ""}/${String(parsed.verseNumber)}`;
};

// --- ayet metni (statik JSON'dan, isteğe bağlı) -------------------------------

/**
 * Ayet metni sayfaya gömülü DEĞİL: 6236 ayeti günlük sayfasına basmak
 * megabaytlar ederdi. Not listelenirken o ayetin küçük JSON'u okunur
 * (~1,5 KB) ve bellekte tutulur. Okunamazsa satır yine görünür — metin
 * süstür, verinin kendisi değil.
 */
const verseCache = new Map<string, VerseData | null>();

async function loadVerse(verseKey: string): Promise<VerseData | null> {
  const cached = verseCache.get(verseKey);
  if (cached !== undefined) return cached;
  const parsed = parseVerseKey(verseKey);
  if (parsed === null) return null;
  try {
    const response = await fetch(
      `/data/verse/verse_${String(parsed.surahId)}_${String(parsed.verseNumber)}.json`,
    );
    const data = response.ok ? ((await response.json()) as VerseData) : null;
    verseCache.set(verseKey, data);
    return data;
  } catch {
    verseCache.set(verseKey, null);
    return null;
  }
}

// --- yardımcılar --------------------------------------------------------------

const nowIso = (): string => new Date().toISOString();

const dateLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" });

function relativeDayLabel(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "bugün";
  if (days === 1) return "yarın";
  if (days < 30) return `${String(days)} gün sonra`;
  return dateLabel(iso);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Kullanıcıya görünen kısa bildirim. Sessiz başarısızlık olmasın diye. */
function toast(message: string, kind: "ok" | "err" = "ok"): void {
  const box = $("#gunluk-toast");
  box.textContent = message;
  box.dataset["kind"] = kind;
  box.hidden = false;
  window.setTimeout(() => {
    box.hidden = true;
  }, 4000);
}

/** Ayet başlığı + metnini satıra ekler (metin gelirse). */
function attachVerse(row: HTMLElement, verseKey: string): void {
  const head = el("div", "g-row-head");
  const link = el("a", "g-row-verse", verseLabel(verseKey));
  link.href = verseHref(verseKey);
  head.append(link);
  row.prepend(head);

  void loadVerse(verseKey).then((verse) => {
    if (verse === null) return;
    const translation = verse.translations[0];
    if (translation === undefined) return;
    const text = el("p", "g-row-meal", translation.text);
    head.after(text);
  });
}

// --- notlar -------------------------------------------------------------------

async function renderNotes(): Promise<void> {
  const list = $("#g-notes-list");
  const notes = (await getAll<Note>(STORES.notes)).sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : -1,
  );
  list.replaceChildren();
  $("#g-notes-count").textContent = String(notes.length);
  if (notes.length === 0) {
    list.append(el("p", "g-empty", "Henüz not yok. Bir ayet sayfasından ekleyebilirsiniz."));
    return;
  }
  for (const note of notes) {
    const row = el("li", "g-row");
    const body = el("p", "g-row-text", note.text);
    const meta = el("p", "g-row-meta", `${dateLabel(note.updatedAt)} tarihinde güncellendi`);
    const actions = el("div", "g-row-actions");

    const editButton = el("button", "g-btn g-btn-quiet", "Düzenle");
    editButton.type = "button";
    editButton.addEventListener("click", () => {
      const next = window.prompt("Notu düzenle", note.text);
      if (next === null || next.trim() === "") return;
      void put<Note>(STORES.notes, { ...note, text: next.trim(), updatedAt: nowIso() }).then(
        () => renderNotes().then(() => { toast("Not güncellendi."); }),
      );
    });

    const deleteButton = el("button", "g-btn g-btn-quiet", "Sil");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => {
      if (!window.confirm(`"${verseLabel(note.verseKey)}" notu silinsin mi?`)) return;
      void remove(STORES.notes, note.id).then(() =>
        renderNotes().then(() => { toast("Not silindi."); }),
      );
    });

    actions.append(editButton, deleteButton);
    row.append(body, meta, actions);
    attachVerse(row, note.verseKey);
    list.append(row);
  }
}

// --- yer imleri ---------------------------------------------------------------

async function renderBookmarks(): Promise<void> {
  const list = $("#g-bookmarks-list");
  const bookmarks = (await getAll<Bookmark>(STORES.bookmarks)).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
  list.replaceChildren();
  $("#g-bookmarks-count").textContent = String(bookmarks.length);
  if (bookmarks.length === 0) {
    list.append(el("p", "g-empty", "Henüz yer imi yok."));
    return;
  }
  for (const bookmark of bookmarks) {
    const row = el("li", "g-row");
    if (bookmark.label !== null && bookmark.label !== "") {
      row.append(el("p", "g-row-text", bookmark.label));
    }
    row.append(el("p", "g-row-meta", `${dateLabel(bookmark.createdAt)} tarihinde eklendi`));
    const actions = el("div", "g-row-actions");
    const deleteButton = el("button", "g-btn g-btn-quiet", "Kaldır");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => {
      void remove(STORES.bookmarks, bookmark.verseKey).then(() =>
        renderBookmarks().then(() => { toast("Yer imi kaldırıldı."); }),
      );
    });
    actions.append(deleteButton);
    row.append(actions);
    attachVerse(row, bookmark.verseKey);
    list.append(row);
  }
}

// --- ezber --------------------------------------------------------------------

function dueNow(items: Memorization[]): Memorization[] {
  const now = Date.now();
  return items
    .filter((m) => new Date(m.nextReviewAt).getTime() <= now)
    .sort((a, b) => (a.nextReviewAt < b.nextReviewAt ? -1 : 1));
}

async function renderMemorization(): Promise<void> {
  const items = await getAll<Memorization>(STORES.memorization);
  const due = dueNow(items);

  $("#g-memo-count").textContent = String(items.length);
  $("#g-due-count").textContent = String(due.length);
  $("#g-today-summary").textContent =
    items.length === 0
      ? "Ezber listesi boş."
      : due.length === 0
        ? `Bugün tekrar yok. Toplam ${String(items.length)} ayet takipte.`
        : `${String(due.length)} ayet tekrar bekliyor.`;

  // --- bugünkü tekrar kartı ---
  const card = $("#g-review-card");
  card.replaceChildren();
  const first = due[0];
  if (first === undefined) {
    card.hidden = true;
  } else {
    card.hidden = false;
    const link = el("a", "g-review-verse", verseLabel(first.verseKey));
    link.href = verseHref(first.verseKey);
    card.append(link);

    const arabic = el("p", "g-review-arabic");
    arabic.dir = "rtl";
    arabic.lang = "ar";
    card.append(arabic);
    void loadVerse(first.verseKey).then((verse) => {
      if (verse !== null) arabic.textContent = verse.textUthmani;
    });

    const buttons = el("div", "g-review-buttons");
    const LABELS: [Rating, string][] = [
      [1, "Tekrar"],
      [2, "Zor"],
      [3, "İyi"],
      [4, "Kolay"],
    ];
    for (const [rating, label] of LABELS) {
      const button = el("button", `g-btn g-rate g-rate-${String(rating)}`, label);
      button.type = "button";
      button.addEventListener("click", () => {
        void review(first, rating);
      });
      buttons.append(button);
    }
    card.append(buttons);
  }

  // --- tam liste ---
  const list = $("#g-memo-list");
  list.replaceChildren();
  if (items.length === 0) {
    list.append(el("p", "g-empty", "Ezber listesi boş."));
    return;
  }
  for (const item of [...items].sort((a, b) => (a.nextReviewAt < b.nextReviewAt ? -1 : 1))) {
    const row = el("li", "g-row");
    row.append(
      el(
        "p",
        "g-row-meta",
        `Sonraki tekrar: ${relativeDayLabel(item.nextReviewAt)} · aralık ${String(item.intervalDays)} gün · ` +
          `zorluk ${item.difficulty.toFixed(1)}/10 · ${String(item.history.length)} tekrar`,
      ),
    );
    const actions = el("div", "g-row-actions");
    const deleteButton = el("button", "g-btn g-btn-quiet", "Listeden çıkar");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => {
      void remove(STORES.memorization, item.verseKey).then(() =>
        renderMemorization().then(() => { toast("Ayet ezber listesinden çıkarıldı."); }),
      );
    });
    actions.append(deleteButton);
    row.append(actions);
    attachVerse(row, item.verseKey);
    list.append(row);
  }
}

async function review(item: Memorization, rating: Rating): Promise<void> {
  const elapsed = Math.max(
    0,
    (Date.now() - new Date(item.history.at(-1)?.reviewedAt ?? item.nextReviewAt).getTime()) /
      86_400_000,
  );
  const state = nextState({ stability: item.stability, difficulty: item.difficulty }, rating, elapsed);
  const days = intervalDays(state.stability);
  await put<Memorization>(STORES.memorization, {
    ...item,
    ...state,
    intervalDays: days,
    nextReviewAt: addDays(new Date(), days),
    history: [...item.history, { reviewedAt: nowIso(), rating }],
  });
  await renderMemorization();
  toast(`Kaydedildi. Sonraki tekrar ${String(days)} gün sonra.`);
}

async function addMemorization(verseKey: string): Promise<void> {
  const existing = await get<Memorization>(STORES.memorization, verseKey);
  if (existing !== undefined) {
    toast("Bu ayet zaten ezber listesinde.", "err");
    return;
  }
  const state = initialState(3);
  const days = intervalDays(state.stability);
  await put<Memorization>(STORES.memorization, {
    verseKey,
    ...state,
    intervalDays: days,
    nextReviewAt: addDays(new Date(), days),
    history: [],
  });
  await renderMemorization();
  toast(`${verseLabel(verseKey)} ezber listesine eklendi.`);
}

// --- okuma ilerlemesi ---------------------------------------------------------

async function renderProgress(): Promise<void> {
  const list = $("#g-progress-list");
  const rows = (await getAll<Progress>(STORES.progress)).sort((a, b) => a.surahId - b.surahId);
  list.replaceChildren();
  $("#g-progress-count").textContent = String(rows.length);
  if (rows.length === 0) {
    list.append(el("p", "g-empty", "Henüz okuma kaydı yok."));
    return;
  }
  for (const row of rows) {
    const surah = surahById.get(row.surahId);
    const item = el("li", "g-row");
    const head = el("div", "g-row-head");
    const link = el("a", "g-row-verse", surah?.nameTr ?? `Sure ${String(row.surahId)}`);
    link.href = `/${surah?.slug ?? ""}/${String(row.lastVerse)}`;
    head.append(link);
    item.append(
      head,
      el(
        "p",
        "g-row-meta",
        `${String(row.lastVerse)} / ${String(surah?.verseCount ?? row.lastVerse)} ayet · ` +
          `${dateLabel(row.updatedAt)}`,
      ),
    );
    const actions = el("div", "g-row-actions");
    const deleteButton = el("button", "g-btn g-btn-quiet", "Kaydı sil");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => {
      void remove(STORES.progress, row.surahId).then(() =>
        renderProgress().then(() => { toast("Okuma kaydı silindi."); }),
      );
    });
    actions.append(deleteButton);
    item.append(actions);
    list.append(item);
  }
}

// --- dışa / içe aktarma -------------------------------------------------------

interface ExportEnvelope {
  version: 1;
  exportedAt: string;
  notes: Note[];
  bookmarks: Bookmark[];
  progress: Progress[];
  memorization: Memorization[];
  settings: Settings;
  recentDiscoveries: unknown[];
  discoveryPaths: unknown[];
  comparisonBasket: unknown;
}

async function buildExport(): Promise<ExportEnvelope> {
  const passthrough = await getAll<{ key: string; value: unknown }>(STORES.passthrough);
  const carried = new Map(passthrough.map((p) => [p.key, p.value]));
  return {
    version: 1,
    exportedAt: nowIso(),
    notes: await getAll<Note>(STORES.notes),
    bookmarks: await getAll<Bookmark>(STORES.bookmarks),
    progress: await getAll<Progress>(STORES.progress),
    memorization: await getAll<Memorization>(STORES.memorization),
    settings: await getSettings(),
    /*
     * Keşif yolu ve karşılaştırma sepeti (plan §12.8) günlüğün işi değil ve
     * arayüzü yok. İçe aktarılan dosyada geldiyse OLDUĞU GİBİ geri yazılır;
     * bir sürüm atlaması kullanıcının verisini silmemeli.
     */
    recentDiscoveries: (carried.get("recentDiscoveries") as unknown[] | undefined) ?? [],
    discoveryPaths: (carried.get("discoveryPaths") as unknown[] | undefined) ?? [],
    comparisonBasket: carried.get("comparisonBasket") ?? null,
  };
}

function download(data: ExportEnvelope): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kurankesfi-gunluk-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * İçe aktarma doğrulaması.
 *
 * Zod paketlenmedi: şema doğrulayıcısını tarayıcıya taşımak sayfaya on
 * kilobaytlarca kod ekliyordu ve buradaki tek girdi kullanıcının KENDİ dışa
 * aktardığı dosya. Denetim yine de yapılır — bozuk bir dosya sessizce
 * yüklenip mevcut veriyi silmemeli.
 */
function validateEnvelope(value: unknown): { ok: true; data: ExportEnvelope } | { ok: false; reason: string } {
  if (typeof value !== "object" || value === null) return { ok: false, reason: "dosya bir nesne değil" };
  const data = value as Partial<ExportEnvelope>;
  if (data.version !== 1) return { ok: false, reason: `bilinmeyen sürüm: ${String(data.version)}` };
  for (const field of ["notes", "bookmarks", "progress", "memorization"] as const) {
    if (!Array.isArray(data[field])) return { ok: false, reason: `'${field}' bir dizi değil` };
  }
  for (const note of data.notes ?? []) {
    if (typeof note.id !== "string" || typeof note.verseKey !== "string" || typeof note.text !== "string") {
      return { ok: false, reason: "not kaydı eksik alan taşıyor" };
    }
  }
  for (const memo of data.memorization ?? []) {
    if (typeof memo.verseKey !== "string" || typeof memo.stability !== "number") {
      return { ok: false, reason: "ezber kaydı eksik alan taşıyor (eski sürüm dosyası olabilir)" };
    }
  }
  return { ok: true, data: data as ExportEnvelope };
}

async function importEnvelope(data: ExportEnvelope, mode: "replace" | "merge"): Promise<void> {
  if (mode === "replace") {
    for (const store of [STORES.notes, STORES.bookmarks, STORES.progress, STORES.memorization]) {
      await clear(store);
    }
  }
  for (const note of data.notes) await put(STORES.notes, note);
  for (const bookmark of data.bookmarks) await put(STORES.bookmarks, bookmark);
  for (const row of data.progress) await put(STORES.progress, row);
  for (const memo of data.memorization) await put(STORES.memorization, memo);
  await saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
  await put(STORES.passthrough, { key: "recentDiscoveries", value: data.recentDiscoveries ?? [] });
  await put(STORES.passthrough, { key: "discoveryPaths", value: data.discoveryPaths ?? [] });
  await put(STORES.passthrough, { key: "comparisonBasket", value: data.comparisonBasket ?? null });
  await renderAll();
}

// --- ekleme formu -------------------------------------------------------------

function readVerseInput(): string | null {
  const input = $<HTMLInputElement>("#g-add-verse");
  const parsed = parseVerseKey(input.value);
  if (parsed === null) {
    toast("Ayet numarası anlaşılmadı. Örnek: 2:255", "err");
    input.focus();
    return null;
  }
  return `${String(parsed.surahId)}:${String(parsed.verseNumber)}`;
}

function wireAddForm(): void {
  $("#g-add-note").addEventListener("click", () => {
    const verseKey = readVerseInput();
    if (verseKey === null) return;
    const text = $<HTMLTextAreaElement>("#g-add-text").value.trim();
    if (text === "") {
      toast("Not metni boş olamaz.", "err");
      return;
    }
    const now = nowIso();
    void put<Note>(STORES.notes, {
      id: `${now}-${String(Math.random()).slice(2, 8)}`,
      verseKey,
      text,
      createdAt: now,
      updatedAt: now,
    }).then(() =>
      renderNotes().then(() => {
        $<HTMLTextAreaElement>("#g-add-text").value = "";
        toast("Not kaydedildi.");
      }),
    );
  });

  $("#g-add-bookmark").addEventListener("click", () => {
    const verseKey = readVerseInput();
    if (verseKey === null) return;
    const label = $<HTMLTextAreaElement>("#g-add-text").value.trim();
    void put<Bookmark>(STORES.bookmarks, {
      verseKey,
      createdAt: nowIso(),
      label: label === "" ? null : label,
    }).then(() => renderBookmarks().then(() => { toast("Yer imi eklendi."); }));
  });

  $("#g-add-memo").addEventListener("click", () => {
    const verseKey = readVerseInput();
    if (verseKey === null) return;
    void addMemorization(verseKey);
  });

  $("#g-add-progress").addEventListener("click", () => {
    const verseKey = readVerseInput();
    if (verseKey === null) return;
    const parsed = parseVerseKey(verseKey);
    if (parsed === null) return;
    void put<Progress>(STORES.progress, {
      surahId: parsed.surahId,
      lastVerse: parsed.verseNumber,
      updatedAt: nowIso(),
    }).then(() => renderProgress().then(() => { toast("Okuma kaydı güncellendi."); }));
  });
}

function wireDataButtons(): void {
  $("#g-export").addEventListener("click", () => {
    void buildExport().then((data) => {
      download(data);
      toast("Dosya indirildi.");
    });
  });

  const fileInput = $<HTMLInputElement>("#g-import-file");
  const applyImport = (mode: "replace" | "merge") => () => {
    const file = fileInput.files?.[0];
    if (file === undefined) {
      toast("Önce bir dosya seçin.", "err");
      return;
    }
    void file.text().then((text) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        toast("Dosya okunamadı: geçerli JSON değil.", "err");
        return;
      }
      const check = validateEnvelope(parsed);
      if (!check.ok) {
        toast(`Dosya kabul edilmedi: ${check.reason}`, "err");
        return;
      }
      if (
        mode === "replace" &&
        !window.confirm("Bu cihazdaki bütün günlük verisi silinip dosyadakiyle değiştirilecek. Devam edilsin mi?")
      ) {
        return;
      }
      void importEnvelope(check.data, mode).then(() => { toast("İçe aktarıldı."); });
    });
  };
  $("#g-import-merge").addEventListener("click", applyImport("merge"));
  $("#g-import-replace").addEventListener("click", applyImport("replace"));

  $("#g-wipe").addEventListener("click", () => {
    if (!window.confirm("Bu cihazdaki BÜTÜN günlük verisi silinecek. Geri alınamaz. Devam edilsin mi?")) return;
    void Promise.all(Object.values(STORES).map((store) => clear(store))).then(() =>
      renderAll().then(() => { toast("Bütün veriler silindi."); }),
    );
  });
}

// --- sekmeler -----------------------------------------------------------------

function wireTabs(): void {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-g-tab]")];
  const panels = [...document.querySelectorAll<HTMLElement>("[data-g-panel]")];
  const show = (name: string): void => {
    for (const tab of tabs) {
      const active = tab.dataset["gTab"] === name;
      tab.setAttribute("aria-selected", active ? "true" : "false");
    }
    for (const panel of panels) panel.hidden = panel.dataset["gPanel"] !== name;
  };
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      show(tab.dataset["gTab"] ?? "bugun");
    });
  }
  show("bugun");
}

// --- açılış -------------------------------------------------------------------

async function renderAll(): Promise<void> {
  await renderNotes();
  await renderBookmarks();
  await renderMemorization();
  await renderProgress();
}

function applyQuery(): void {
  const verseKey = new URLSearchParams(window.location.search).get("ekle");
  if (verseKey === null) return;
  const parsed = parseVerseKey(verseKey);
  if (parsed === null) return;
  $<HTMLInputElement>("#g-add-verse").value = `${String(parsed.surahId)}:${String(parsed.verseNumber)}`;
  $<HTMLTextAreaElement>("#g-add-text").focus();
}

if (!isAvailable()) {
  $("#gunluk-app").hidden = true;
  $("#gunluk-unavailable").hidden = false;
} else {
  $("#gunluk-app").hidden = false;
  wireTabs();
  wireAddForm();
  wireDataButtons();
  applyQuery();
  void renderAll().catch((error: unknown) => {
    toast(
      `Günlük açılamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
      "err",
    );
  });
}
