// @ts-check
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
  },
  // Kod ve tanimlayicilar Ingilizce, kullaniciya gorunen metin Turkce (plan 20.2)
  i18n: undefined,
});
