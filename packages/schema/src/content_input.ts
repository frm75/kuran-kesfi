import { z } from "zod";
import {
  confidence,
  isoTimestamp,
  locationConfidence,
  nonEmptyText,
  slug,
  verseRef,
} from "./common.js";
import { conceptRelationType } from "./concept.js";
import {
  aiGenerator,
  aiMediaKind,
  aiPromptType,
  aiVideoDurationSec,
  aspectRatio,
  hasProphetFaceConstraint,
  isHostableLicense,
  mediaLicense,
  promptText,
  realMediaKind,
  requiresAttribution,
} from "./media.js";
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
 *   data/media/media_<slug>.json           bir coğrafyanın gerçek medyası
 *   data/media/prompts/prompt_<slug>.json  tek sahnenin AI prompt'u
 *   data/media/ai_generated.json           üretilmiş AI medyası (kuyruk toplayıcısı yazar)
 *
 * İçerik kuralları burada KODA dönüşür:
 *   - ders maddesi kaynaksız olamaz (§8.1)            → sourceSlugs.min(1)
 *   - konum kaynak + güven derecesi taşır (§8.3)      → confidence zorunlu, sourceSlugs.min(1)
 *   - ilke en az bir birincil ayet dayanağı (§18.3)   → refine
 *   - zaman çizelgesi olayı kaynak taşır              → sourceSlugs.min(1)
 *   - bölümleme sureyi boşluksuz kaplar (§12.15)      → refine (bitişiklik)
 *   - kıssa parçaları kronolojik sıralı (§8.4)        → order benzersiz, refine
 *   - kısıtlı lisanslı görsel indirilmez (§34)        → refine (localPath null)
 *   - peygamber tasviri yüz kısıtı taşır (§20.3)      → refine (prompt metni)
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
  /** Esri Elevation; bkz. konum kaydındaki not. */
  elevationM: z.number().int().nullable(),
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
    /**
     * Deniz seviyesinden yükseklik (metre, tam sayı).
     *
     * ÖLÇÜM verisidir, editoryal değil: Esri Elevation servisinden bir kez
     * çekilip buraya yazılır (`pnpm data:elevation`). Site build'i o servise
     * bağlanmaz. Negatif olabilir — Lût gölü −415 m.
     */
    elevationM: z.number().int().nullable(),
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
  /*
   * "En az bir kök ya da elle ayet eşleştirmesi" kuralı buradan KALDIRILDI
   * (2026-09-07): üst kavramların kendi kökü yok, sayıları çocuklarından
   * toplanıyor. Kural kaybolmadı, küme düzeyine taşındı — tek dosyanın şeması
   * "bu kavramın çocuğu var mı" sorusunu göremez.
   * Bkz. scripts/import/content.ts, kavram denetimleri.
   */
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

// --- Medya (§32-71) ----------------------------------------------------------

/**
 * GERÇEK medya kaydı — fotoğraf, arkeolojik alan, belge, harita, mushaf.
 *
 * Alan listesi spec §33'ten gelir. Üç şey burada koda dönüşür:
 *
 *   1. **Lisans kapısı (§34).** Kısıtlı lisanslı dosya sunucuya kopyalanmaz;
 *      `localPath` boş kalmak zorundadır. Kural `refine` ile uygulanır, çünkü
 *      "indirmemeyi unutmak" sessiz bir telif ihlalidir — hata vermeyen bir
 *      kural kural değildir.
 *   2. **Atıf zorunluluğu.** PUBLIC_DOMAIN/CC0 dışındaki her lisansta
 *      `copyright` dolu olmalı; kart o metni gösterir.
 *   3. **İhtilaf gizlenmez.** `caution` alanı spec §35, §40, §41'in istediği
 *      uyarı cümlesini taşır ("Cûdî geleneksel olarak … ile ilişkilendirilir").
 *      Konumun güven derecesi zaten `data/locations/locations.json` içinde;
 *      bu alan o dereceyi GÖRSELE özel bir cümleyle tamamlar.
 *
 * `sourceSlugs` kayıtlı kaynak entity'sine bağlar (`wikimedia-commons` gibi);
 * `sourceName`/`sourceUrl` ise dosyanın kendi künye sayfasıdır. İkisi ayrı:
 * biri /kaynaklar şeffaflığı, diğeri "Kaynağı görüntüle" bağlantısı.
 */
export const mediaItemInput = z
  .object({
    /** Kararlı medya kimliği; dosya adında ve URL'de kullanılır (spec §33 media_id) */
    id: slug,
    kind: realMediaKind,
    title: nonEmptyText,
    description: z.string().nullable(),
    /** Kesinlik iddiasını dengeleyen uyarı cümlesi (§35, §40, §41) */
    caution: z.string().nullable(),

    // künye
    sourceName: nonEmptyText,
    /** Dosyanın künye sayfası — "Kaynağı görüntüle" buraya gider */
    sourceUrl: z.url(),
    /** Dosyanın kendisi; yalnızca bilgi amaçlı, site build'i buradan çekmez */
    originalUrl: z.url().nullable(),
    author: z.string().nullable(),
    institution: z.string().nullable(),
    /** Kaynağın kendi tarihlemesi; yorumlanmadan aktarılır */
    date: z.string().nullable(),

    // lisans
    license: mediaLicense,
    /**
     * Kaynağın KENDİ lisans etiketi, olduğu gibi ("cc-by-sa-4.0",
     * "cc-by-nc-sa-3.0", "pd-old-70").
     *
     * `license` bizim sekiz değerli enum'umuza indirgenmiş halidir ve bilgi
     * kaybeder: CC BY-NC-SA'nın "share-alike" yükümlülüğü enum'da yoktur.
     * Ham etiketi saklamak `tafsir_block.source_type` ile aynı gerekçe —
     * eşleştiremediğimiz bir değer `UNKNOWN` olur ama kaybolmaz, rapora düşer
     * ve insan karar verir.
     */
    licenseRaw: z.string().nullable(),
    licenseUrl: z.url().nullable(),
    /** Atıf metni — lisansın istediği şekilde, olduğu gibi */
    copyright: z.string().nullable(),

    // konum
    /** Serbest metin yer adı (spec §33 `location`) */
    locationName: z.string().nullable(),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),

    // dosya
    /**
     * `media/` altındaki göreli yol ("gorsel/cudi-panorama.jpg").
     *
     * Doluysa dosya R2'ye çıkar ve `medya.kurankesfi.tr` üzerinden servis
     * edilir (CLAUDE.md kural 5). Kısıtlı lisansta ZORUNLU olarak null.
     */
    localPath: z.string().nullable(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),

    // bağlar — iş anahtarlarıyla, id ile değil
    locationSlug: slug.nullable(),
    storySlugs: slugList,
    /** `timeline.json` içindeki olay `order` değerleri */
    timelineOrders: z.array(z.number().int().positive()),
    verseRefs: z.array(verseRef),
    /** Corpus Coranicum yazma kimliği */
    manuscriptId: z.number().int().positive().nullable(),

    sourceSlugs: slugList.min(1, "medya kaydi en az bir kaynak tasimali"),
  })
  .refine((m) => isHostableLicense(m.license) || m.localPath === null, {
    message:
      "COPYRIGHT / LINK_ONLY / UNKNOWN lisansli gorsel sunucuya kopyalanmaz (spec 34); localPath bos olmali",
    path: ["localPath"],
  })
  .refine((m) => !requiresAttribution(m.license) || (m.copyright ?? "").trim().length > 0, {
    message: "bu lisans atif zorunlu kilar; copyright alani bos birakilamaz",
    path: ["copyright"],
  })
  .refine((m) => (m.lat === null) === (m.lng === null), {
    message: "lat ve lng birlikte dolu ya da birlikte bos olmali",
    path: ["lng"],
  })
  .refine((m) => (m.width === null) === (m.height === null), {
    message: "width ve height birlikte dolu ya da birlikte bos olmali",
    path: ["height"],
  });
export type MediaItemInput = z.infer<typeof mediaItemInput>;

/** Bir coğrafyanın gerçek medya dosyası — `data/media/media_<slug>.json`. */
export const mediaFile = z
  .object({
    /** Dosyanın kapsadığı konum; kayıtların çoğu bu konuma bağlıdır */
    place: slug.nullable(),
    note: z.string().nullable(),
    items: z.array(mediaItemInput).min(1),
  })
  .refine((f) => new Set(f.items.map((i) => i.id)).size === f.items.length, {
    message: "medya 'id' degerleri dosya icinde benzersiz olmali",
    path: ["items"],
  });
export type MediaFile = z.infer<typeof mediaFile>;

/**
 * AI prompt kaydı (spec §65).
 *
 * **Prompt koda gömülmez** — spec'in açık kuralı. Model, süre ve en/boy oranı
 * da burada durur ki üretici değiştiğinde kod değil veri değişsin (§66).
 *
 * `depictsProphet` tek gerçek içerik kapısıdır: doluysa prompt metni peygamber
 * yüzü kısıtını TAŞIMAK ZORUNDADIR (plan §20.3). Etiket arayüzden gelir ama
 * kısıt prompt'un içinde olmalı, çünkü üretici modele giden tek talimat
 * prompt'tur.
 */
export const aiPromptInput = z
  .object({
    id: slug,
    /** Sahne adı — Türkçe, arayüzde görünür ("Nûh'un gemisinin hazırlanması") */
    title: nonEmptyText,
    promptType: aiPromptType,
    prompt: promptText,
    negativePrompt: promptText.nullable(),
    model: z.string().nullable(),
    /** Yalnızca VIDEO için; spec §57 ~10 saniye */
    durationSec: aiVideoDurationSec.nullable(),
    aspectRatio: aspectRatio.nullable(),
    version: z.number().int().positive(),
    /** Prompt bir peygamberi tasvir ediyor mu? (plan §20.3 kapısı) */
    depictsProphet: z.boolean(),

    // bağlar — en az biri dolu olmalı
    storySlug: slug.nullable(),
    locationSlug: slug.nullable(),
    timelineOrder: z.number().int().positive().nullable(),

    /** Image-to-video zinciri (spec §67): bu videonun başlangıç görseli */
    baseImagePromptId: slug.nullable(),
  })
  .refine((p) => (p.promptType === "VIDEO") === (p.durationSec !== null), {
    message: "durationSec yalnizca VIDEO prompt'unda dolu olur, VIDEO'da zorunludur",
    path: ["durationSec"],
  })
  .refine((p) => p.promptType === "VIDEO" || p.baseImagePromptId === null, {
    message: "baseImagePromptId yalnizca VIDEO prompt'unda kullanilir",
    path: ["baseImagePromptId"],
  })
  .refine((p) => p.baseImagePromptId !== p.id, {
    message: "prompt kendi baslangic gorseli olamaz",
    path: ["baseImagePromptId"],
  })
  .refine((p) => !p.depictsProphet || hasProphetFaceConstraint(p.prompt), {
    message:
      "peygamber tasvir eden prompt 'identifiable face' kisitini metninde tasimali (plan 20.3)",
    path: ["prompt"],
  })
  .refine((p) => p.storySlug !== null || p.locationSlug !== null || p.timelineOrder !== null, {
    message: "prompt en az bir kissa, konum ya da olaya baglanmali",
    path: ["storySlug"],
  });
export type AiPromptInput = z.infer<typeof aiPromptInput>;

/** Tek sahnenin prompt dosyası — `data/media/prompts/prompt_<slug>.json`. */
export const aiPromptsFile = z
  .object({ prompts: z.array(aiPromptInput).min(1) })
  .refine((f) => new Set(f.prompts.map((p) => p.id)).size === f.prompts.length, {
    message: "prompt 'id' degerleri dosya icinde benzersiz olmali",
    path: ["prompts"],
  });
export type AiPromptsFile = z.infer<typeof aiPromptsFile>;

/**
 * ÜRETİLMİŞ AI medyası — `data/media/ai_generated.json`.
 *
 * Bu dosyayı insan değil kuyruk toplayıcısı yazar (`pnpm media:ai:collect`):
 * lokal makinede üretilen çıktı `media/ai/cikti/` altından toplanır, sha256'sı
 * alınır ve buraya kaydedilir. Kaynak/lisans alanı YOKTUR — üreten biziz.
 *
 * `faceScanned` yayın kapısıdır ve öntanımlı olarak `false` yazılır. Kare kare
 * yüz taraması otomatikleştirilemez (bir yüz hash ile denetlenemez), bu yüzden
 * kod otomatik onay vermez: tarayan kişi bu alanı elle `true` yapana kadar
 * medya statik çıktıya girmez. 2026-09-05'te sahne notuna güvenilip kareye
 * bakılmamıştı ve hatalı kesim yayına çıkmıştı; kapı o yüzden var.
 */
export const aiMediaInput = z
  .object({
    id: slug,
    kind: aiMediaKind,
    /** Hangi prompt'tan üretildi (spec §65 ai_prompts.id) */
    promptId: slug,
    title: nonEmptyText,
    generator: aiGenerator,
    model: nonEmptyText,
    /** `media/` altındaki göreli yol; AI çıktısını biz barındırırız */
    localPath: nonEmptyText,
    sha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 64 haneli kucuk harf onaltilik olmali"),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    durationSec: aiVideoDurationSec.nullable(),
    createdAt: isoTimestamp,

    /** Kare kare yüz taraması yapıldı mı? Yayın kapısı — bkz. dosya notu */
    faceScanned: z.boolean(),
    /** Tarayan kişinin notu; taranmışsa doldurulur */
    faceScanNote: z.string().nullable(),
  })
  .refine((m) => (m.kind === "AI_VIDEO") === (m.durationSec !== null), {
    message: "durationSec yalnizca AI_VIDEO icin dolu olur ve orada zorunludur",
    path: ["durationSec"],
  })
  .refine((m) => (m.width === null) === (m.height === null), {
    message: "width ve height birlikte dolu ya da birlikte bos olmali",
    path: ["height"],
  });
export type AiMediaInput = z.infer<typeof aiMediaInput>;

export const aiGeneratedFile = z
  .object({ items: z.array(aiMediaInput) })
  .refine((f) => new Set(f.items.map((i) => i.id)).size === f.items.length, {
    message: "AI medya 'id' degerleri benzersiz olmali",
    path: ["items"],
  });
export type AiGeneratedFile = z.infer<typeof aiGeneratedFile>;
