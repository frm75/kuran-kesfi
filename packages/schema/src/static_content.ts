import { z } from "zod";
import { confidence, locationConfidence, nonEmptyText, slug } from "./common.js";
import { conceptRelationType } from "./concept.js";
import { mediaKind, mediaLicense } from "./media.js";
import { verseRelationType } from "./discovery.js";
import { origin as contentOrigin } from "./source.js";
import { principleVerseRole } from "./principle.js";
import { storyType } from "./story.js";
import { timelinePeriod } from "./timeline.js";

/**
 * İçerik katmanı statik JSON çıktı şemaları — kıssa, konum, kavram, ilke,
 * zaman çizelgesi (plan §5.5, §12.4).
 *
 * scripts/build üretir, apps/web build zamanında okur, referans linter doğrular.
 *
 *   data/stories_index.json                  kıssa listesi
 *   data/story/story_<slug>.json             tek kıssa — ayet METNİ taşımaz
 *   data/locations.json                      bütün konumlar + hangi kıssada
 *   data/timeline.json                       siyer olayları
 *   data/principles_index.json               ilke listesi
 *   data/principle/principle_<slug>.json     tek ilke
 *   data/concepts_index.json                 kavram listesi
 *   data/concept/concept_<slug>.json         tek kavram + dağılım istatistiği
 *   data/verse_links.json                    ayet → kıssa/ilke/kavram/olay (ters dizin)
 *   data/verse_relations.json                ayet → ayet (türetilmiş ilişki ağı)
 *   data/sections.json                       sure içi konu bölümlemesi
 *   data/media.json                          medya kayıtları (gerçek + AI)
 *   data/verse_media.json                    ayet → medya (ters dizin)
 *
 * Kıssa ve ilke dosyaları ayet metni TAŞIMAZ: Musa kıssası 300+ ayet, metinle
 * 150 KB olurdu. Sayfa build zamanında `surah/` ve `translation/` katmanından
 * okur (apps/web/src/lib/data.ts); tarayıcıya yalnızca HTML gider.
 */

/** Ayet göstergesi — hangi sure, hangi ayet; metin değil. */
export const staticVersePointer = z.object({
  surahId: z.number().int().min(1).max(114),
  surahSlug: slug,
  surahNameTr: nonEmptyText,
  verseNumber: z.number().int().positive(),
});
export type StaticVersePointer = z.infer<typeof staticVersePointer>;

const surahPointer = z.object({
  id: z.number().int().min(1).max(114),
  slug,
  nameTr: nonEmptyText,
});

const namedSlug = z.object({ slug, nameTr: nonEmptyText });
const titledSlug = z.object({ slug, title: nonEmptyText });

// --- Kıssa -------------------------------------------------------------------

export const staticStoryPassage = z.object({
  order: z.number().int().positive(),
  title: nonEmptyText,
  surahId: z.number().int().min(1).max(114),
  surahSlug: slug,
  surahNameTr: nonEmptyText,
  verseStart: z.number().int().positive(),
  verseEnd: z.number().int().positive(),
  note: z.string().nullable(),
});
export type StaticStoryPassage = z.infer<typeof staticStoryPassage>;

export const staticStoryLesson = z.object({
  order: z.number().int().positive(),
  text: nonEmptyText,
  sourceName: nonEmptyText,
  sourceReference: nonEmptyText,
  sourceSlugs: z.array(slug).min(1),
});

export const staticStoryLocation = z.object({
  slug,
  name: nonEmptyText,
  modernName: z.string().nullable(),
  country: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  confidence: locationConfidence,
  order: z.number().int().positive(),
  eventDescription: nonEmptyText,
  passageOrders: z.array(z.number().int().positive()),
});

export const staticStory = z.object({
  slug,
  title: nonEmptyText,
  type: storyType,
  chronologicalOrder: z.number().int().positive(),
  eraStart: z.string().nullable(),
  eraEnd: z.string().nullable(),
  summary: nonEmptyText,
  coverImage: z.string().nullable(),
  passages: z.array(staticStoryPassage).min(1),
  /** Parçaların kapsadığı toplam ayet */
  verseCount: z.number().int().positive(),
  lessons: z.array(staticStoryLesson),
  locations: z.array(staticStoryLocation),
  concepts: z.array(namedSlug),
  principles: z.array(namedSlug.extend({ note: z.string().nullable() })),
  relatedStories: z.array(titledSlug),
});
export type StaticStory = z.infer<typeof staticStory>;

export const staticStoriesIndex = z.object({
  stories: z
    .array(
      z.object({
        slug,
        title: nonEmptyText,
        type: storyType,
        chronologicalOrder: z.number().int().positive(),
        eraStart: z.string().nullable(),
        eraEnd: z.string().nullable(),
        summary: nonEmptyText,
        passageCount: z.number().int().positive(),
        verseCount: z.number().int().positive(),
        locationCount: z.number().int().nonnegative(),
        /** İlk parça — listede "Yusuf 4–6" gibi göstermek için */
        first: staticStoryPassage,
      }),
    )
    .min(1),
});
export type StaticStoriesIndex = z.infer<typeof staticStoriesIndex>;

// --- Konum -------------------------------------------------------------------

export const staticLocation = z.object({
  slug,
  name: nonEmptyText,
  modernName: z.string().nullable(),
  country: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  confidence: locationConfidence,
  /** Deniz seviyesinden yükseklik (m). Ölçüm; Esri Elevation, bir kez çekilir. */
  elevationM: z.number().int().nullable(),
  sourceNote: nonEmptyText,
  alternatives: z.array(
    z.object({
      name: nonEmptyText,
      lat: z.number().nullable(),
      lng: z.number().nullable(),
      note: nonEmptyText,
      elevationM: z.number().int().nullable(),
      sourceSlugs: z.array(slug),
    }),
  ),
  sourceSlugs: z.array(slug).min(1),
  stories: z.array(
    titledSlug.extend({
      order: z.number().int().positive(),
      eventDescription: nonEmptyText,
    }),
  ),
});
export type StaticLocation = z.infer<typeof staticLocation>;

export const staticLocations = z.object({ locations: z.array(staticLocation) });
export type StaticLocations = z.infer<typeof staticLocations>;

// --- Zaman çizelgesi ---------------------------------------------------------

export const staticTimelineEvent = z.object({
  order: z.number().int().positive(),
  title: nonEmptyText,
  description: nonEmptyText,
  period: timelinePeriod,
  approxYear: z.number().int().nullable(),
  confidence,
  sourceNote: nonEmptyText,
  sourceSlugs: z.array(slug).min(1),
  surahs: z.array(surahPointer),
  verses: z.array(staticVersePointer),
});
export type StaticTimelineEvent = z.infer<typeof staticTimelineEvent>;

export const staticTimeline = z.object({ events: z.array(staticTimelineEvent) });
export type StaticTimeline = z.infer<typeof staticTimeline>;

// --- İlke --------------------------------------------------------------------

export const staticPrinciple = z.object({
  slug,
  nameTr: nonEmptyText,
  nameAr: z.string().nullable(),
  root: z.object({ arabic: nonEmptyText, latin: nonEmptyText }).nullable(),
  definition: nonEmptyText,
  explanation: nonEmptyText,
  dailyNote: z.string().nullable(),
  opposite: namedSlug.nullable(),
  order: z.number().int().positive(),
  sourceSlugs: z.array(slug).min(1),
  verses: z.array(
    staticVersePointer.extend({ role: principleVerseRole, note: z.string().nullable() }),
  ).min(1),
  stories: z.array(titledSlug.extend({ note: z.string().nullable() })),
  concepts: z.array(namedSlug),
});
export type StaticPrinciple = z.infer<typeof staticPrinciple>;

export const staticPrinciplesIndex = z.object({
  principles: z
    .array(
      z.object({
        slug,
        nameTr: nonEmptyText,
        nameAr: z.string().nullable(),
        definition: nonEmptyText,
        order: z.number().int().positive(),
        primaryCount: z.number().int().positive(),
        verseCount: z.number().int().positive(),
        oppositeSlug: slug.nullable(),
      }),
    )
    .min(1),
});
export type StaticPrinciplesIndex = z.infer<typeof staticPrinciplesIndex>;

// --- Kavram ------------------------------------------------------------------

export const staticConcept = z.object({
  slug,
  nameTr: nonEmptyText,
  nameAr: z.string().nullable(),
  definition: nonEmptyText,
  parent: namedSlug.nullable(),
  children: z.array(namedSlug),
  roots: z.array(
    z.object({
      arabic: nonEmptyText,
      latin: nonEmptyText,
      occurrenceCount: z.number().int().nonnegative(),
    }),
  ),
  sourceSlugs: z.array(slug).min(1),
  /**
   * Dağılım — plan §12.3 "gerçek veriden hesaplanır". Mekke/Medine oranı
   * surenin iniş yerine göre; ayet bazlı nüzul verisi yok, bu sure bazlı bir
   * yaklaşımdır ve arayüzde öyle yazılır.
   */
  stats: z.object({
    verseCount: z.number().int().nonnegative(),
    surahCount: z.number().int().nonnegative(),
    mekki: z.number().int().nonnegative(),
    medeni: z.number().int().nonnegative(),
    /** Sure başına ayet sayısı — dağılım çubuğu için */
    bySurah: z.array(surahPointer.extend({ count: z.number().int().positive() })),
  }),
  verses: z.array(staticVersePointer.extend({ weight: z.number().int().min(1).max(3) })),
  relations: z.array(
    namedSlug.extend({ type: conceptRelationType, weight: z.number().int().min(1).max(3) }),
  ),
  stories: z.array(titledSlug),
  principles: z.array(namedSlug),
});
export type StaticConcept = z.infer<typeof staticConcept>;

export const staticConceptsIndex = z.object({
  concepts: z
    .array(
      z.object({
        slug,
        nameTr: nonEmptyText,
        nameAr: z.string().nullable(),
        definition: nonEmptyText,
        parentSlug: slug.nullable(),
        verseCount: z.number().int().nonnegative(),
        rootCount: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});
export type StaticConceptsIndex = z.infer<typeof staticConceptsIndex>;

// --- Ters dizin ---------------------------------------------------------------

/**
 * Ayet → bağlı içerik. Anahtar verse.id ("2153"). Yalnızca slug taşır; adlar
 * dizin dosyalarından çözülür. Yalnızca build zamanında okunur.
 */
export const staticVerseLinks = z.object({
  verses: z.record(
    z.string().regex(/^\d+$/),
    z.object({
      stories: z.array(slug),
      principles: z.array(z.object({ slug, role: principleVerseRole })),
      concepts: z.array(z.object({ slug, weight: z.number().int().min(1).max(3) })),
      events: z.array(z.number().int().positive()),
    }),
  ),
});
export type StaticVerseLinks = z.infer<typeof staticVerseLinks>;

// --- Ayetler arası ilişki -----------------------------------------------------

/**
 * Tek ilişki — plan §12.5.
 *
 * `reason` her zaman gösterilir, boş olamaz: kullanıcı iki ayetin NEDEN
 * bağlandığını görmeden bağı kabul etmek zorunda kalmamalı.
 *
 * Sure adı/slug'ı TAŞINMAZ. verse_links.json'un aksine bu dosya ~50 bin satır;
 * her satıra ad koymak dosyayı üç katına çıkarırdı. Adlar okuma anında
 * surahs_index.json'dan çözülür (apps/web/src/lib/data.ts).
 */
export const staticVerseRelation = z.object({
  surahId: z.number().int().min(1).max(114),
  verseNumber: z.number().int().positive(),
  type: verseRelationType,
  reason: nonEmptyText,
  /**
   * `muhtemel` olan ilişkiler arayüzde ayrı etiketlenir (plan §12.5, §13).
   * Kavram üzerinden kurulan bağ muhtemeldir: kavram–ayet eşleştirmesinin
   * kendisi kökten türetilmiştir, yorum payı taşır.
   */
  confidence,
});
export type StaticVerseRelation = z.infer<typeof staticVerseRelation>;

/** Anahtar verse.id ("2153"); değer, güçlüden zayıfa sıralı ilişki listesi. */
export const staticVerseRelations = z.object({
  verses: z.record(z.string().regex(/^\d+$/), z.array(staticVerseRelation).min(1)),
});
export type StaticVerseRelations = z.infer<typeof staticVerseRelations>;

// --- Eski mushaf yazmaları -----------------------------------------------------

/**
 * Yazma künyesi — statik dışa aktarım.
 *
 * GÖRÜNTÜ TAŞIMAZ: kaynakta 2322 yazmanın hepsinde görüntü izni "restricted";
 * `url` yalnızca corpuscoranicum.de'ye derin bağlantıdır (CLAUDE.md kural 5).
 */
export const staticManuscript = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  repository: z.string().nullable(),
  idno: z.string().nullable(),
  /** Kaynağın kendi tarihlemesi ("700-800"); yorumlanmadan aktarılır */
  origDate: z.string().nullable(),
  /** origDate'ten çıkarılan başlangıç yılı; çıkarılamıyorsa null */
  dateStart: z.number().int().nullable(),
  script: z.string().nullable(),
  summary: z.string().nullable(),
  pageCount: z.number().int().min(0),
  url: z.string(),
  /** Kapsadığı ayet aralıkları: [başlangıç verse.id, bitiş verse.id] */
  ranges: z.array(z.tuple([z.number().int(), z.number().int()])),
});
export type StaticManuscript = z.infer<typeof staticManuscript>;

export const staticManuscripts = z.object({
  manuscripts: z.array(staticManuscript),
});
export type StaticManuscripts = z.infer<typeof staticManuscripts>;

/**
 * Ayet → yazma özeti.
 *
 * Ayet başına ortalama 70, en çok 94 yazma düşüyor; hepsini ayet sayfasına
 * basmak gürültüden başka bir şey olmaz. Bu yüzden yalnızca SAYI ve en eski
 * birkaç yazmanın kimliği taşınır; tam liste yazma sayfalarındadır.
 */
export const staticVerseManuscripts = z.object({
  verses: z.record(
    z.string().regex(/^\d+$/),
    z.object({
      /** Bu ayeti taşıyan toplam yazma sayısı */
      count: z.number().int().positive(),
      /** En eski tarihlenen birkaç yazmanın kimliği */
      oldest: z.array(z.number().int().positive()),
    }),
  ),
});
export type StaticVerseManuscripts = z.infer<typeof staticVerseManuscripts>;

// --- Sure içi konu bölümlemesi ------------------------------------------------

/**
 * Tek konu başlığı — plan §12.1, §12.15.
 *
 * Ana aralık (`verseStart`–`verseEnd`) sure boyunca bitişiktir; `alsoVerses`
 * aralık dışında kalıp yine bu konuya giren ayetleri taşır (`section_verse`).
 */
export const staticSurahSection = z.object({
  order: z.number().int().positive(),
  title: nonEmptyText,
  verseStart: z.number().int().positive(),
  verseEnd: z.number().int().positive(),
  /** Aynı suredeki ek ayet numaraları; ana aralığın dışındadır. */
  alsoVerses: z.array(z.number().int().positive()),
  note: z.string().nullable(),
});
export type StaticSurahSection = z.infer<typeof staticSurahSection>;

/**
 * Bütün bölümlemeler; anahtar sure numarası ("2").
 *
 * Bölümlemesi olmayan sure dosyada HİÇ GEÇMEZ — boş dizi yazmak "bölümlendi
 * ama bölüm yok" gibi okunurdu. Arayüz anahtarı bulamazsa başlık göstermez.
 */
export const staticSurahSections = z.object({
  surahs: z.record(
    z.string().regex(/^\d+$/),
    z.object({
      /** 'platform' başlıklar arayüzde "Platform derlemesi" etiketiyle ayrılır. */
      origin: contentOrigin,
      sourceSlug: slug.nullable(),
      sections: z.array(staticSurahSection).min(1),
    }),
  ),
});
export type StaticSurahSections = z.infer<typeof staticSurahSections>;


// --- Medya (§32-71) -----------------------------------------------------------

/**
 * Tek medya kaydı — gerçek belge ya da AI canlandırması.
 *
 * ÜÇ TÜR KARIŞMAZ (spec §32). Arayüz ayrımı `kind` üzerinden yapar ve AI
 * kartına etiketi ŞABLONDAN basar (`AI_DISCLAIMER_TR`), veriden değil —
 * bir kaydın etiketi unutulabilsin diye veri alanı açılmadı.
 *
 * `path` dosyanın `media/` ağacındaki GÖRELİ yoludur; tam adres arayüzde
 * kurulur. Sebep r2_sync.ts'in gerekçesiyle aynı: sağlayıcı değişimi tek DNS
 * kaydına inmeli, veri dosyalarına gömülü mutlak adrese değil. Kısıtlı
 * lisanslı kayıtlarda null'dır ve kart yalnızca "Kaynağı görüntüle" gösterir.
 */
export const staticMediaItem = z.object({
  id: slug,
  kind: mediaKind,
  title: nonEmptyText,
  description: z.string().nullable(),
  /** Kesinlik iddiasını dengeleyen uyarı cümlesi (§35, §40, §41) */
  caution: z.string().nullable(),

  // künye — AI kayıtlarında hepsi null
  sourceName: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  author: z.string().nullable(),
  institution: z.string().nullable(),
  date: z.string().nullable(),
  license: mediaLicense.nullable(),
  licenseUrl: z.string().nullable(),
  copyright: z.string().nullable(),

  // dosya
  path: z.string().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationSec: z.number().int().positive().nullable(),

  // bağlar
  locationName: z.string().nullable(),
  locationSlug: slug.nullable(),
  storySlugs: z.array(slug),
  verses: z.array(staticVersePointer),

  /** AI kayıtlarında üretildiği prompt; gerçek kayıtlarda null */
  promptId: slug.nullable(),
});
export type StaticMediaItem = z.infer<typeof staticMediaItem>;

export const staticMedia = z.object({ media: z.array(staticMediaItem) });
export type StaticMedia = z.infer<typeof staticMedia>;

/**
 * Ayet → medya kimlikleri (ters dizin).
 *
 * Yazma dizininden farklı olarak SAYI değil kimlik taşınır: ayet başına en
 * çok birkaç medya düşüyor (34 kayıt, 139 bağ), kısaltmaya gerek yok.
 * Medyası olmayan ayet dosyada hiç geçmez.
 */
export const staticVerseMedia = z.object({
  verses: z.record(z.string().regex(/^\d+$/), z.array(slug).min(1)),
});
export type StaticVerseMedia = z.infer<typeof staticVerseMedia>;
