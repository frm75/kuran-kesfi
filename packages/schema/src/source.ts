import { z } from "zod";
import { dbId, nonEmptyText } from "./common.js";

/**
 * Kaynak seffafligi (plan 12.10).
 *
 * Kaynak sistemi projenin omurgasidir. Kaynakli hicbir icerik <SourceBadge>
 * bileseni olmadan render edilmez. Her kaynakli kayit source tablosuna
 * sourceIds ile baglanir.
 */
export const source = z.object({
  id: dbId,
  /** Kaynagin adi: "Diyanet Kur'an Yolu" */
  name: nonEmptyText,
  /** Eser adi: "Kur'an Yolu Turkce Meal ve Tefsir" */
  workTitle: nonEmptyText.nullable(),
  author: nonEmptyText.nullable(),
  /** Bolum / sayfa / ayet referansi: "Bakara Suresi, 153. ayet tefsiri" */
  reference: nonEmptyText.nullable(),
  url: z.url().nullable(),
  /** Lisans kisa adi: "CC BY-NC-SA 4.0", "Kamu mali", "Alinti (adil kullanim)" */
  license: nonEmptyText,
  note: z.string().nullable(),
});
export type Source = z.infer<typeof source>;

/**
 * Icerik sinifi (plan 12.10).
 *
 * Kullanicinin Kur'an metni, meal, tefsir, tarihsel bilgi ve platformun kendi
 * siniflandirmasi arasindaki farki karistirmamasi icin her icerik bu uc
 * sinifindan biriyle etiketlenir.
 */
export const contentClass = z.enum([
  /** Kaynakli bilgi — dogrudan bir kaynaktan derlenmis */
  "kaynakli",
  /** Alternatif gorus — farkli bir kaynagin gorusu */
  "alternatif",
  /** Platform verisi — kendi derlememiz (kavram eslestirmesi, bolumleme, iliski) */
  "platform",
]);
export type ContentClass = z.infer<typeof contentClass>;

/** Kaynak baglantisi tasiyan kayitlar icin ortak alanlar. */
export const sourcedFields = z.object({
  sourceIds: z.array(dbId),
});

/**
 * Bir icerigin kokeni (plan 12.15).
 *
 * origin="source" ise sourceId zorunludur; origin="platform" ise kaynak
 * gosterilmez ama arayuzde "Platform verisi" etiketiyle ayrilir.
 */
export const origin = z.enum(["source", "platform"]);
export type Origin = z.infer<typeof origin>;
