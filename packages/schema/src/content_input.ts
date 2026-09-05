import { z } from "zod";
import { confidence, locationConfidence, nonEmptyText, slug, verseRef } from "./common.js";
import { conceptRelationType } from "./concept.js";
import { principleVerseRole } from "./principle.js";
import { origin as contentOrigin } from "./source.js";
import { storyType } from "./story.js";
import { timelinePeriod } from "./timeline.js";

/**
 * data/** GİRDİ şemaları — elle hazırlanan içerik dosyaları (plan §5.4, §8, §18.3).
 *
 * Bu dosyalar insan tarafından yazılır; bu yüzden veritabanı id'si DEĞİL iş
 * anahtarı taşır: ayet "2:153" / "12:4-6", kıssa/kavram/ilke/konum/kaynak slug,
 * kök latin anahtarı ("Sbr"). Çözümleme `scripts/import/content.ts` içinde
 * veritabanına karşı yapılır; çözülmeyen referans import'u durdurur.
 *
 * Dosya düzeni (adlar alt çizgili — plan §20.2):
 *
 *   data/sources/content_sources.json      { sources: [...] }
 *   data/locations/locations.json          { locations: [...] }
 *   data/timeline/timeline.json            { events: [...] }
 *   data/timeline/noldeke_order.json       { sourceSlug, note, order: {"1": 48, ...} }
 *   data/stories/story_<slug>.json         tek kıssa
 *   data/principles/principle_<slug>.json  tek ilke
 *   data/concepts/concept_<slug>.json      tek kavram
 *   data/sections/sections_<sureNo>.json   tek surenin konu bölümlemesi
 *
 * İçerik kuralları burada KODA dönüşür:
 *   - ders maddesi kaynaksız olamaz (§8.1)            → sourceSlugs.min(1)
 *   - konum kaynak + güven derecesi taşır (§8.3)      → confidence zorunlu, sourceSlugs.min(1)
 *   - ilke en az bir birincil ayet dayanağı (§18.3)   → refine
 *   - zaman çizelgesi olayı kaynak taşır              → sourceSlugs.min(1)
 *   - bölümleme sureyi boşluksuz kaplar (§12.15)      → refine (bitişiklik)
 *   - kıssa parçaları kronolojik sıralı (§8.4)        → order benzersiz, refine
 */

const slugList = z.array(slug);

/** Kaynak kaydı — `source` tablosuna upsert edilir (slug ile). */
export const contentSourceInput = z.object({
  slug,
  name: nonEmptyText,
  workTitle: z.string().nullable(),
  author: z.string().nullable(),
  reference: z.string().nullable(),
  url: z.string().nullable(),
  /** Lisansı belirsiz kaynak eklenmez (plan §3.1) */
  license: nonEmptyText,
  note: z.string().nullable(),
});
export type ContentSourceInput = z.infer<typeof contentSourceInput>;

export const contentSourcesFile = z.object({
  sources: z.array(contentSourceInput).min(1),
});

// --- Konum -------------------------------------------------------------------

export const locationAlternativeInput = z.object({
  name: nonEmptyText,
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  note: nonEmptyText,
  sourceSlugs: slugList,
});

export const locationInput = z
  .object({
    slug,
    name: nonEmptyText,
    modernName: z.string().nullable(),
    country: z.string().nullable(),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    confidence: locationConfidence,
    /** Neden bu güven derecesi — kullanıcıya gösterilir */
    sourceNote: nonEmptyText,
    alternatives: z.array(locationAlternativeInput),
    sourceSlugs: slugList.min(1, "konum en az bir kaynak tasimali (plan 8.3)"),
  })
  .refine((l) => (l.lat === null) === (l.lng === null), {
    message: "lat ve lng birlikte dolu ya da birlikte bos olmali",
    path: ["lng"],
  });
export type LocationInput = z.infer<typeof locationInput>;

export const locationsFile = z.object({ locations: z.array(locationInput).min(1) });

// --- Kıssa -------------------------------------------------------------------

export const storyPassageInput = z.object({
  order: z.number().int().positive(),
  title: nonEmptyText,
  /** "12:4-6" ya da "12:4" */
  ref: verseRef,
  note: z.string().nullable(),
});

export const storyLessonInput = z.object({
  order: z.number().int().positive(),
  /** Kaynağın ifadesini özetler; platform yorumu eklenmez (§8.2) */
  text: nonEmptyText,
  sourceName: nonEmptyText,
  sourceReference: nonEmptyText,
  sourceSlugs: slugList.min(1, "kaynaksiz ders eklenmez (plan 8.1)"),
});

export const storyLocationInput = z.object({
  locationSlug: slug,
  /** Rota sırası; harita çizgisi buna göre çizilir */
  order: z.number().int().positive(),
  eventDescription: nonEmptyText,
  /** Bu durakta geçen parçaların `order` değerleri */
  passageOrders: z.array(z.number().int().positive()),
});

export const storyInput = z
  .object({
    slug,
    title: nonEmptyText,
    type: storyType,
    chronologicalOrder: z.number().int().positive(),
    eraStart: z.string().nullable(),
    eraEnd: z.string().nullable(),
    /** Nötr, ansiklopedik; hüküm çıkarmaz (§8.5) */
    summary: nonEmptyText,
    /** Figür yasağı (§20.3) — bugün hep null */
    coverImage: z.string().nullable(),
    relatedStories: slugList,
    passages: z.array(storyPassageInput).min(1, "kissa en az bir ayet parcasi tasimali"),
    lessons: z.array(storyLessonInput),
    locations: z.array(storyLocationInput),
    concepts: slugList,
  })
  .refine((s) => new Set(s.passages.map((p) => p.order)).size === s.passages.length, {
    message: "parca 'order' degerleri benzersiz olmali",
    path: ["passages"],
  })
  .refine(
    (s) => {
      const orders = new Set(s.passages.map((p) => p.order));
      return s.locations.every((l) => l.passageOrders.every((o) => orders.has(o)));
    },
    { message: "konum passageOrders var olmayan bir parcaya isaret ediyor", path: ["locations"] },
  )
  .refine((s) => !s.relatedStories.includes(s.slug), {
    message: "kissa kendisiyle iliskilendirilemez",
    path: ["relatedStories"],
  });
export type StoryInput = z.infer<typeof storyInput>;

// --- Kavram ------------------------------------------------------------------

export const conceptRelationInput = z.object({
  target: slug,
  type: conceptRelationType,
  weight: z.number().int().min(1).max(3),
});

/**
 * Kavram.
 *
 * Ayet eşleştirmesi KÖKTEN türetilir (plan §3 "kök verisi temelli"): kavramın
 * köklerinden biri ayette geçiyorsa ayet kavrama bağlanır; ağırlık geçiş
 * sayısından hesaplanır. Bu platform derlemesidir, `source_id` NULL kalır ve
 * arayüzde "kök temelli eşleştirme" etiketiyle gösterilir. `verses` alanı
 * elle ek/ağırlık düzeltmesi içindir.
 */
export const conceptInput = z
  .object({
    slug,
    nameTr: nonEmptyText,
    nameAr: z.string().nullable(),
    definition: nonEmptyText,
    parentSlug: slug.nullable(),
    /** root.latin anahtarları: "Sbr" — büyük/küçük harf anlamlı */
    roots: z.array(z.string().regex(/^[A-Za-z'$]+$/, "kok anahtari latin, ornek 'Sbr'")),
    /** Tanımın kaynağı */
    sourceSlugs: slugList.min(1, "kavram tanimi kaynaksiz olamaz (plan 8.5)"),
    relations: z.array(conceptRelationInput),
    verses: z.array(z.object({ ref: verseRef, weight: z.number().int().min(1).max(3) })),
  })
  .refine((c) => c.roots.length > 0 || c.verses.length > 0, {
    message: "kavramin en az bir koku ya da elle ayet eslestirmesi olmali",
    path: ["roots"],
  })
  .refine((c) => c.parentSlug !== c.slug, {
    message: "kavram kendi ebeveyni olamaz",
    path: ["parentSlug"],
  })
  .refine((c) => c.relations.every((r) => r.target !== c.slug), {
    message: "kavram kendisiyle iliskilendirilemez",
    path: ["relations"],
  });
export type ConceptInput = z.infer<typeof conceptInput>;

// --- İlke --------------------------------------------------------------------

export const principleVerseInput = z.object({
  ref: verseRef,
  role: principleVerseRole,
  note: z.string().nullable(),
});

export const principleInput = z
  .object({
    slug,
    nameTr: nonEmptyText,
    nameAr: z.string().nullable(),
    rootLatin: z.string().nullable(),
    definition: nonEmptyText,
    explanation: nonEmptyText,
    /** Yalnızca tefsir/kaynak temelli; bugün null bırakılıyor */
    dailyNote: z.string().nullable(),
    oppositeSlug: slug.nullable(),
    order: z.number().int().positive(),
    sourceSlugs: slugList.min(1, "ilke en az bir kaynak tasimali (plan 18.3)"),
    verses: z.array(principleVerseInput).min(1),
    stories: z.array(z.object({ slug, note: z.string().nullable() })),
    concepts: slugList,
  })
  .refine((p) => p.verses.some((v) => v.role === "primary"), {
    message: "ilke en az bir 'primary' ayet dayanagi tasimali (plan 18.3)",
    path: ["verses"],
  })
  .refine((p) => p.oppositeSlug !== p.slug, {
    message: "ilke kendi karsiti olamaz",
    path: ["oppositeSlug"],
  });
export type PrincipleInput = z.infer<typeof principleInput>;

// --- Zaman çizelgesi ---------------------------------------------------------

export const timelineEventInput = z.object({
  order: z.number().int().positive(),
  title: nonEmptyText,
  description: nonEmptyText,
  period: timelinePeriod,
  /** Milâdî yıl; kesin değilse confidence söyler */
  approxYear: z.number().int().nullable(),
  confidence,
  sourceNote: nonEmptyText,
  surahIds: z.array(z.number().int().min(1).max(114)),
  verseRefs: z.array(verseRef),
  sourceSlugs: slugList.min(1, "zaman cizelgesi olayi en az bir kaynak tasimali"),
});
export type TimelineEventInput = z.infer<typeof timelineEventInput>;

export const timelineFile = z
  .object({ events: z.array(timelineEventInput).min(1) })
  .refine((f) => new Set(f.events.map((e) => e.order)).size === f.events.length, {
    message: "olay 'order' degerleri benzersiz olmali",
    path: ["events"],
  });

/**
 * Nöldeke sıralaması — surah.revelation_order_noldeke.
 *
 * Anahtar sure numarası (metin, JSON gereği), değer Nöldeke sırası. 114
 * girişin hepsi olmalı ve değerler 1..114'ü tam kaplamalı; import doğrular.
 */
export const noldekeOrderFile = z
  .object({
    sourceSlug: slug,
    note: nonEmptyText,
    order: z.record(z.string().regex(/^(?:[1-9]|[1-9]\d|10\d|11[0-4])$/), z.number().int().min(1).max(114)),
  })
  .refine((f) => Object.keys(f.order).length === 114, {
    message: "114 surenin hepsi icin Noldeke sirasi verilmeli",
    path: ["order"],
  })
  .refine((f) => new Set(Object.values(f.order)).size === 114, {
    message: "Noldeke siralari 1..114'u tam kaplamali (tekrar var)",
    path: ["order"],
  });
export type NoldekeOrderFile = z.infer<typeof noldekeOrderFile>;

// --- Sure içi konu bölümlemesi (§12.1, §12.15) -------------------------------

/**
 * Tek konu başlığı.
 *
 * Başlık ayet aralığıyla tanımlanır (plan §12.15 kural 1). Aralıklar sure
 * boyunca BİTİŞİKTİR: 1'den başlar, boşluk bırakmaz, sure sonunda biter.
 * Bunun sebebi arayüz: "bu ayet hangi konunun içinde?" sorusunun her ayette
 * cevabı olmalı, yoksa okurun bir kısmı sessizce başlıksız kalırdı.
 *
 * `alsoVerses` ana aralığın DIŞINDA kalıp yine bu konuya giren ayetlerdir
 * (`section_verse`). Çakışma burada tutulur; ana aralıklar çakışmaz.
 */
export const surahSectionInput = z
  .object({
    order: z.number().int().positive(),
    title: nonEmptyText,
    verseStart: z.number().int().positive(),
    verseEnd: z.number().int().positive(),
    alsoVerses: z.array(verseRef),
    note: z.string().nullable(),
  })
  .refine((s) => s.verseEnd >= s.verseStart, {
    message: "verseEnd, verseStart'tan kucuk olamaz",
    path: ["verseEnd"],
  });
export type SurahSectionInput = z.infer<typeof surahSectionInput>;

/**
 * Bir surenin bölümlemesi.
 *
 * `origin` neyin ne olduğunu ayırır ve arayüzde farklı etiketlenir (§12.15):
 *   'source'   — bir tefsirin bölümlemesi; `sourceSlug` ZORUNLU, izin gerekir
 *   'platform' — platformun kendi derlemesi; "Platform verisi" etiketiyle sunulur
 *
 * Sure düzeyinde "derleme ölçütü" alanı YOK. Olsaydı `surah_section.note`
 * satır başına tanımlı olduğu için aynı metin surenin her bölümüne
 * kopyalanacaktı. Ölçüt bölümlemenin kendisine değil YÖNTEMİNE ait; arayüz
 * bunu `origin`den okuyup sabit bir cümleyle söyler ("Platform derlemesi"),
 * bölüme özgü açıklama ise `section.note` alanında durur (plan §1.5).
 */
export const surahSectionsFile = z
  .object({
    surahId: z.number().int().min(1).max(114),
    origin: contentOrigin,
    sourceSlug: slug.nullable(),
    sections: z.array(surahSectionInput).min(1),
  })
  .refine((f) => f.origin !== "source" || f.sourceSlug !== null, {
    message: "origin='source' ise sourceSlug zorunlu (DDL: surah_section_source_required)",
    path: ["sourceSlug"],
  })
  .refine((f) => f.origin !== "platform" || f.sourceSlug === null, {
    message: "origin='platform' bolumleme kaynak tasimaz; sourceSlug bos olmali",
    path: ["sourceSlug"],
  })
  .refine((f) => f.sections.every((s, i) => s.order === i + 1), {
    message: "order 1'den baslayarak kesintisiz artmali",
    path: ["sections"],
  })
  .refine((f) => f.sections[0]?.verseStart === 1, {
    message: "ilk bolum 1. ayetten baslamali",
    path: ["sections"],
  })
  .refine(
    (f) => f.sections.every((s, i) => i === 0 || s.verseStart === (f.sections[i - 1]?.verseEnd ?? 0) + 1),
    {
      message: "bolumler bitisik olmali — bosluk ve cakisma yok (ana aralik)",
      path: ["sections"],
    },
  );
export type SurahSectionsFile = z.infer<typeof surahSectionsFile>;
