// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Statik export. Site build'i internete istek atmaz (plan 1.7, 6).
export default defineConfig({
  site: "https://kurankesfi.tr",
  output: "static",
  trailingSlash: "never",
  /*
   * Astro 7'de ontanimli 'jsx' oldu: satir ici ogeler arasindaki bosluk
   * JSX gibi SILINIR (<span>a</span> <em>b</em> -> "ab"). 14 000 sayfanin
   * metni Astro 5 davranisina gore yazildi; eski davranis acikca korunuyor.
   */
  compressHTML: true,
  build: {
    // Statik dosya sunucusunda temiz URL'ler icin: /sure/2 -> sure/2.html
    format: "file",
    inlineStylesheets: "auto",
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      /*
       * Astro kucuk betikleri HTML'in ICINE gomuyor. Gomulu betik
       * `script-src 'self'` ile ENGELLENIR — calismasi icin 'unsafe-inline'
       * gerekirdi ve o acilmayacak (plan 04, Gorev 7). Sifir esik: her betik
       * ayri dosya olarak /_astro/ altina cikar. /gunluk ve /harita zaten
       * boyle davraniyordu, cunku onlarin paketi esigin ustunde.
       */
      assetsInlineLimit: 0,
    },
    /**
     * .env repo kokunde duruyor (tek dosya: DB, R2, ArcGIS hepsi orada).
     * Vite varsayilan olarak Astro projesinin kendi dizinine bakar ve
     * PUBLIC_* degiskenlerini SESSIZCE bulamaz — degisken `undefined`
     * olur, ozellik kapali gorunur, hata cikmaz.
     */
    envDir: fileURLToPath(new URL("../../", import.meta.url)),
  },
  // Kod ve tanimlayicilar Ingilizce, kullaniciya gorunen metin Turkce (plan 20.2)
  i18n: undefined,
});
