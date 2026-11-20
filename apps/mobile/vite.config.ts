import { defineConfig } from "vite";

/** Her paket ayrı IIFE olarak üretilir: TARGET=zamanla | offline. */
const hedef = process.env.TARGET === "offline" ? "offline" : "zamanla";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "www",
    emptyOutDir: false,
    target: "es2020",
    minify: "esbuild",
    lib: {
      entry: `src/${hedef}.ts`,
      formats: ["iife"],
      name: `kk_${hedef}`,
      fileName: () => `${hedef}.js`,
    },
  },
});
