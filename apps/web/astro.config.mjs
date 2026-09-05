// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Statik export. Site build'i internete istek atmaz (plan 1.7, 6).
export default defineConfig({
  site: "https://kurankesfi.tr",
  output: "static",
  trailingSlash: "never",
  build: {
    // Statik dosya sunucusunda temiz URL'ler icin: /sure/2 -> sure/2.html
    format: "file",
    inlineStylesheets: "auto",
  },
  vite: {
    plugins: [tailwindcss()],
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
