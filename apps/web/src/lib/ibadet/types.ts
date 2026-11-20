export type VakitAdi = "imsak" | "gunes" | "ogle" | "ikindi" | "aksam" | "yatsi";

/** Bu sırayla; indeks bildirim k değeridir. */
export const VAKITLER: readonly VakitAdi[] = ["imsak", "gunes", "ogle", "ikindi", "aksam", "yatsi"];

export interface Konum {
  ad: string;
  enlem: number;
  boylam: number;
  /** IANA saat dilimi */
  saatDilimi: string;
}

/** null = hesaplanamadı (örn. yüksek enlemde) */
export type GunVakitleri = Record<VakitAdi, Date | null>;
