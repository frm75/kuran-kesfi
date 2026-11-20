import type { Konum, VakitAdi } from "./types.js";

export interface IbadetAyarlari {
  konum: Konum | null;
  konumKaynagi: "gps" | "elle" | null;
  vakitBildirimi: Record<VakitAdi, boolean>;
  dakikaOnce: 0 | 5 | 10 | 15 | 30 | 45;
  /** "08:00" ya da null = kapali */
  ayetSaati: string | null;
  /** "20:00" ya da null = kapali */
  tekrarSaati: string | null;
  /** ISO */
  sonPlanlama: string | null;
}

export const VARSAYILAN_AYARLAR: IbadetAyarlari = {
  konum: null,
  konumKaynagi: null,
  vakitBildirimi: { imsak: false, gunes: false, ogle: false, ikindi: false, aksam: false, yatsi: false },
  dakikaOnce: 0,
  ayetSaati: null,
  tekrarSaati: null,
  sonPlanlama: null,
};

export interface AyarDeposu {
  oku(): Promise<IbadetAyarlari>;
  yaz(a: IbadetAyarlari): Promise<void>;
}

const ANAHTAR = "ibadet.ayarlar";

function birlestir(ham: string | null): IbadetAyarlari {
  if (!ham) return structuredClone(VARSAYILAN_AYARLAR);
  try {
    const o = JSON.parse(ham) as Partial<IbadetAyarlari>;
    return {
      ...VARSAYILAN_AYARLAR,
      ...o,
      vakitBildirimi: { ...VARSAYILAN_AYARLAR.vakitBildirimi, ...(o.vakitBildirimi ?? {}) },
    };
  } catch {
    return structuredClone(VARSAYILAN_AYARLAR);
  }
}

export function ayarDeposu(): AyarDeposu {
  return {
    async oku() {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Preferences } = await import("@capacitor/preferences");
        return birlestir((await Preferences.get({ key: ANAHTAR })).value);
      }
      try {
        return birlestir(localStorage.getItem(ANAHTAR));
      } catch {
        return structuredClone(VARSAYILAN_AYARLAR);
      }
    },
    async yaz(a) {
      const { Capacitor } = await import("@capacitor/core");
      const ham = JSON.stringify(a);
      if (Capacitor.isNativePlatform()) {
        const { Preferences } = await import("@capacitor/preferences");
        await Preferences.set({ key: ANAHTAR, value: ham });
        return;
      }
      try {
        localStorage.setItem(ANAHTAR, ham);
      } catch {
        /* depolama kapali */
      }
    },
  };
}
