/**
 * `/ara` tarayıcı uygulaması.
 *
 * ## Tuş başına ağ isteği yok
 *
 * `index.json` sayfa açılışında bir kez iniyor ve 2768 ayet dışı kaydın
 * hepsini taşıyor. "yus." yazan kullanıcı Yûsuf suresini oradan ANINDA görür;
 * shard'lı tam arama 300 ms gecikmeyle, arkadan koşar.
 *
 * ## Sonuç listesi kısa parçaları BEKLEMEZ
 *
 * Başlık ve adres zaten bellekte (ayetlerde türetiliyor). Liste hemen basılır,
 * kısa parçalar `docs/` bloklarından sonra doldurulur. Ölçüldü: liste 43-54 KB
 * gzip'te görünüyor, kısa parçalar 0-65 KB ile arkadan geliyor.
 */

import { normalizeTr } from "./normalize.js";
import { parseReference, isPureReference } from "./reference.js";
import type { ReferenceHit, ReferenceTables } from "./reference.js";
import { SearchEngine, applyFilters, countByType } from "./query.js";
import type { SearchFilters, SearchHit } from "./query.js";
import { TYPE_KEYS, TYPE_LABELS } from "./types.js";
import type { Namespace, TypeKey } from "./types.js";

/** Shard'lı aramanın tuş vuruşundan sonra bekleme süresi. */
const DEBOUNCE_MS = 300;

/** Bir seferde basılan sonuç sayısı. */
const PAGE_SIZE = 20;

/** Anlık öneride gösterilecek en fazla satır. */
const SUGGEST_MAX = 8;

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

const input = el<HTMLInputElement>("ara-q");
const durum = el("ara-durum");
const kart = el("ara-kart");
const panel = el("ara-panel");
const sekmeler = el("ara-sekmeler");
const sonuc = el<HTMLOListElement>("ara-sonuc");
const daha = el("ara-daha");

// Sayfa /ara degilse (bilesen baska yere konursa) sessizce cik.
if (input !== null && durum !== null && kart !== null && panel !== null && sonuc !== null) {
  void start(input, durum, kart, panel, sonuc);
}

interface Suggestion {
  title: string;
  url: string;
  type: TypeKey;
  norm: string;
  /** Tür ağırlığı — kısa ve isabetli türler önce. */
  weight: number;
}

const SUGGEST_WEIGHT: Readonly<Record<TypeKey, number>> = {
  sure: 6,
  kavram: 5,
  ilke: 5,
  kissa: 5,
  konum: 4,
  zaman: 4,
  kok: 3,
  konu: 2,
  ayet: 0,
};

async function start(
  input: HTMLInputElement,
  durum: HTMLElement,
  kart: HTMLElement,
  panel: HTMLElement,
  sonuc: HTMLOListElement,
): Promise<void> {
  durum.textContent = "Arama indeksi yükleniyor…";

  let engine: SearchEngine;
  try {
    engine = await SearchEngine.load();
  } catch {
    durum.textContent =
      "Arama indeksi yüklenemedi. Aşağıdaki gezinilebilir dizinden gezinebilirsiniz.";
    return;
  }
  durum.textContent = "";

  const index = engine.index;

  const tables: ReferenceTables = {
    surahs: index.surahs,
    aliases: index.aliases,
    juzStarts: index.juzStarts,
    pageStarts: index.pageStarts,
  };

  // --- anlık öneri kümesi ----------------------------------------------------
  // Eş adlar sure kaydının aranabilir metnine katılır: "berae" yazan Tevbe'yi
  // bulmalı. Normalizasyon bir kez, yükleme sırasında yapılır.
  const aliasBySurah = new Map<number, string[]>();
  for (const a of index.aliases) {
    aliasBySurah.set(a.surahId, [...(aliasBySurah.get(a.surahId) ?? []), a.name]);
  }
  const surahUrl = new Map(index.surahs.map((s) => [`/${s.slug}`, s.id]));

  const suggestions: Suggestion[] = index.entries.map((entry) => {
    const type = TYPE_KEYS[entry[0]] ?? "ayet";
    const alt = aliasBySurah.get(surahUrl.get(entry[2]) ?? -1) ?? [];
    return {
      title: entry[1],
      url: entry[2],
      type,
      norm: [entry[1], ...alt].map((t) => normalizeTr(t)).join(" "),
      weight: SUGGEST_WEIGHT[type],
    };
  });

  // --- durum -----------------------------------------------------------------
  let hits: SearchHit[] = [];
  let shown = PAGE_SIZE;
  let timer: number | undefined;
  let generation = 0;

  const readFilters = (): SearchFilters => ({
    type: (el<HTMLElement>("ara-sekmeler")?.querySelector<HTMLButtonElement>(
      '[aria-pressed="true"]',
    )?.dataset.tur || null) as TypeKey | null,
    surahId: numberOrNull(el<HTMLSelectElement>("ara-sure")?.value),
    revelation: (el<HTMLSelectElement>("ara-nuzul")?.value || null) as "mekki" | "medeni" | null,
    juzFrom: numberOrNull(el<HTMLInputElement>("ara-cuz-bas")?.value),
    juzTo: numberOrNull(el<HTMLInputElement>("ara-cuz-son")?.value),
    pageFrom: numberOrNull(el<HTMLInputElement>("ara-sayfa-bas")?.value),
    pageTo: numberOrNull(el<HTMLInputElement>("ara-sayfa-son")?.value),
    sort: (el<HTMLSelectElement>("ara-sira")?.value === "mushaf" ? "mushaf" : "alaka"),
  });

  const readNamespaces = (): Namespace[] | undefined => {
    const boxes = [...document.querySelectorAll<HTMLInputElement>(".ara-yer-kutu")];
    const on = boxes.filter((b) => b.checked).map((b) => b.value as Namespace);
    // Hiçbiri seçili değilse süzgeç anlamsız; hepsinde ara.
    return on.length === 0 || on.length === boxes.length ? undefined : on;
  };

  // --- çizim -----------------------------------------------------------------

  function drawReference(query: string): void {
    const hit = parseReference(query, tables);
    if (hit === null) {
      kart.hidden = true;
      kart.textContent = "";
      return;
    }
    kart.hidden = false;
    kart.replaceChildren(referenceCard(hit));
  }

  function drawTabs(counts: Record<TypeKey, number>, total: number): void {
    const all = sekmeler?.querySelector<HTMLElement>('[data-sayi=""]');
    if (all !== null && all !== undefined) all.textContent = String(total);
    for (const key of TYPE_KEYS) {
      const button = sekmeler?.querySelector<HTMLButtonElement>(`[data-tur="${key}"]`);
      const span = sekmeler?.querySelector<HTMLElement>(`[data-sayi="${key}"]`);
      if (button === null || button === undefined) continue;
      button.hidden = counts[key] === 0;
      if (span !== null && span !== undefined) span.textContent = String(counts[key]);
    }
  }

  function drawResults(): void {
    const filtered = applyFilters(hits, readFilters());
    const slice = filtered.slice(0, shown);

    sonuc.replaceChildren(...slice.map((hit) => resultRow(hit)));
    if (daha !== null) daha.hidden = filtered.length <= shown;

    durum.textContent =
      filtered.length === 0
        ? "Sonuç yok."
        : `${String(filtered.length)} sonuç, ${String(slice.length)} tanesi gösteriliyor.`;

    void fillSnippets(slice);
  }

  async function fillSnippets(slice: readonly SearchHit[]): Promise<void> {
    if (slice.length === 0) return;
    const mine = generation;
    const texts = await engine.snippets(slice);
    if (mine !== generation) return; // sorgu degisti, eski cevabi basma
    for (const hit of slice) {
      const node = sonuc.querySelector<HTMLElement>(`[data-doc="${String(hit.docId)}"] .ara-r-snip`);
      const text = texts.get(hit.docId);
      if (node !== null && text !== undefined) node.textContent = text;
    }
  }

  /** Shard inmeden, bellekteki kayıtlardan anında öneri. */
  function drawSuggestions(query: string): void {
    const n = normalizeTr(query);
    if (n.length < 2) {
      panel.hidden = true;
      return;
    }
    const scored: { s: Suggestion; rank: number }[] = [];
    for (const s of suggestions) {
      // Tam ad > baştan eşleşme > içinde geçme.
      const rank = s.norm === n ? 3 : s.norm.startsWith(n) ? 2 : s.norm.includes(n) ? 1 : 0;
      if (rank > 0) scored.push({ s, rank });
    }
    if (scored.length === 0) return;

    scored.sort((a, b) => b.rank - a.rank || b.s.weight - a.s.weight);
    panel.hidden = false;
    sonuc.replaceChildren(
      ...scored.slice(0, SUGGEST_MAX).map(({ s }) =>
        row(s.type, s.title, s.url, "", null),
      ),
    );
    durum.textContent = "Aranıyor…";
  }

  // --- olaylar ---------------------------------------------------------------

  async function run(query: string): Promise<void> {
    const mine = ++generation;
    shown = PAGE_SIZE;
    if (query.trim() === "") {
      hits = [];
      panel.hidden = true;
      kart.hidden = true;
      durum.textContent = "";
      writeUrl(query);
      return;
    }

    drawReference(query);
    drawSuggestions(query);

    const found = await engine.search(query, readNamespaces());
    if (mine !== generation) return;

    hits = found;
    panel.hidden = false;
    drawTabs(countByType(hits), hits.length);
    drawResults();
    writeUrl(query);
  }

  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    // Referans ve öneri ANINDA; ağ isteği isteyen tam arama gecikmeli.
    drawReference(input.value);
    drawSuggestions(input.value);
    timer = window.setTimeout(() => void run(input.value), DEBOUNCE_MS);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const query = input.value;
    // Saf referansta Enter doğrudan gider; "bakara sabır" için gitmez.
    if (isPureReference(query)) {
      const hit = parseReference(query, tables);
      if (hit !== null && hit.kind !== "outOfRange") {
        window.location.href = hit.url;
        return;
      }
    }
    window.clearTimeout(timer);
    void run(query);
  });

  sekmeler?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".ara-sekme");
    if (button === null) return;
    for (const other of sekmeler.querySelectorAll<HTMLButtonElement>(".ara-sekme")) {
      other.setAttribute("aria-pressed", String(other === button));
    }
    shown = PAGE_SIZE;
    drawResults();
    writeUrl(input.value);
  });

  for (const id of ["ara-sure", "ara-nuzul", "ara-cuz-bas", "ara-cuz-son", "ara-sayfa-bas", "ara-sayfa-son", "ara-sira"]) {
    el(id)?.addEventListener("change", () => {
      shown = PAGE_SIZE;
      drawResults();
      writeUrl(input.value);
    });
  }
  for (const box of document.querySelectorAll<HTMLInputElement>(".ara-yer-kutu")) {
    box.addEventListener("change", () => void run(input.value));
  }
  daha?.querySelector("button")?.addEventListener("click", () => {
    shown += PAGE_SIZE;
    drawResults();
  });

  // --- URL durumu ------------------------------------------------------------

  function writeUrl(query: string): void {
    const params = new URLSearchParams();
    if (query.trim() !== "") params.set("q", query);
    const filters = readFilters();
    if (filters.type != null) params.set("tur", filters.type);
    if (filters.surahId != null) params.set("sure", String(filters.surahId));
    if (filters.revelation != null) params.set("nuzul", filters.revelation);
    if (filters.sort === "mushaf") params.set("sira", "mushaf");
    const search = params.toString();
    window.history.replaceState(null, "", search === "" ? location.pathname : `?${search}`);
  }

  const params = new URLSearchParams(window.location.search);
  const initial = params.get("q");
  if (initial !== null && initial !== "") {
    input.value = initial;
    applyUrlFilters(params);
    await run(initial);
  }

  function applyUrlFilters(params: URLSearchParams): void {
    const tur = params.get("tur");
    if (tur !== null) {
      for (const button of sekmeler?.querySelectorAll<HTMLButtonElement>(".ara-sekme") ?? []) {
        button.setAttribute("aria-pressed", String(button.dataset.tur === tur));
      }
    }
    const sure = params.get("sure");
    const nuzul = params.get("nuzul");
    const sira = params.get("sira");
    const sureSelect = el<HTMLSelectElement>("ara-sure");
    const nuzulSelect = el<HTMLSelectElement>("ara-nuzul");
    const siraSelect = el<HTMLSelectElement>("ara-sira");
    if (sure !== null && sureSelect !== null) sureSelect.value = sure;
    if (nuzul !== null && nuzulSelect !== null) nuzulSelect.value = nuzul;
    if (sira !== null && siraSelect !== null) siraSelect.value = sira;
  }

  // --- satır çizimi ----------------------------------------------------------

  function resultRow(hit: SearchHit): HTMLLIElement {
    const detail =
      hit.extra === null
        ? ""
        : `Cüz ${String(hit.extra[2])} · Sayfa ${String(hit.extra[3])} · ${
            hit.extra[4] === 1 ? "Medenî" : "Mekkî"
          }`;
    return row(hit.type, hit.title, hit.url, detail, hit.docId);
  }

  function row(
    type: TypeKey,
    title: string,
    url: string,
    detail: string,
    docId: number | null,
  ): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "ara-r";
    if (docId !== null) li.dataset.doc = String(docId);

    const badge = document.createElement("span");
    badge.className = `ara-r-tur is-${type}`;
    badge.textContent = TYPE_LABELS[type];

    const link = document.createElement("a");
    link.className = "ara-r-baslik";
    link.href = url;
    link.textContent = title;

    const snip = document.createElement("p");
    snip.className = "ara-r-snip";

    li.append(badge, link, snip);
    if (detail !== "") {
      const meta = document.createElement("p");
      meta.className = "ara-r-meta";
      meta.textContent = detail;
      li.append(meta);
    }
    return li;
  }

  function referenceCard(hit: ReferenceHit): HTMLElement {
    const box = document.createElement("div");
    box.className = "ara-kart-govde";

    if (hit.kind === "outOfRange") {
      box.classList.add("is-uyari");
      const p = document.createElement("p");
      p.textContent = hit.message;
      const a = document.createElement("a");
      a.href = hit.url;
      a.textContent = "Sureye git";
      box.append(p, a);
      return box;
    }

    const label = document.createElement("p");
    label.className = "ara-kart-etiket";
    label.textContent = "Doğrudan git";

    const link = document.createElement("a");
    link.className = "ara-kart-bag";
    link.href = hit.url;
    link.textContent = referenceLabel(hit);

    box.append(label, link);

    // Buraya gelen hit "outOfRange" olamaz: yukarıdaki dal erken dönüyor.
    const alt = aliasBySurah.get(hit.surah.id) ?? [];
    if (alt.length > 0) {
      const note = document.createElement("p");
      note.className = "ara-kart-not";
      note.textContent = `Diğer adı: ${alt.join(", ")}`;
      box.append(note);
    }
    return box;
  }

  function referenceLabel(hit: ReferenceHit): string {
    switch (hit.kind) {
      case "verse":
        return `${hit.surah.nameTr} ${String(hit.verse)}`;
      case "range":
        return `${hit.surah.nameTr} ${String(hit.from)}–${String(hit.to)}`;
      case "surah":
        return `${hit.surah.nameTr} suresi (${String(hit.surah.verseCount)} ayet)`;
      case "juz":
        return `Cüz ${String(hit.juz)} — ${hit.surah.nameTr} ${String(hit.verse)}`;
      case "page":
        return `Sayfa ${String(hit.page)} — ${hit.surah.nameTr} ${String(hit.verse)}`;
      default:
        return "";
    }
  }

}

function numberOrNull(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
