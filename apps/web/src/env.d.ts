/// <reference types="astro/client" />

/**
 * Ortam degiskeni tipleri.
 *
 * `PUBLIC_` oneki ASTRO KURALIDIR: yalnizca bu onekli degiskenler tarayici
 * paketine gomulur. Onsuz olanlar (DB_PASSWORD, R2_SECRET_ACCESS_KEY...)
 * istemciye ASLA gitmez — oradaki koruma bu isimlendirmedir.
 *
 * Erisim NOKTA gosterimiyle yapilir (`import.meta.env.PUBLIC_X`). Koseli
 * parantez bicimi Vite'in statik degisimini atlar ve esbuild
 * "Unexpected env" parse hatasi verir; 2026-09-05'te build'i durdurdu.
 */
interface ImportMetaEnv {
  /**
   * ArcGIS Location Platform anahtari — uydu katmani icin.
   *
   * Bos ise uydu dugmesi hic basilmaz ve katman eklenmez (bkz.
   * components/HaritaCanli.astro). Anahtarin tarayicida gorunmesi
   * Esri'nin tasarimi; koruma gizlilik degil YONLENDIRICI KISITI —
   * anahtar yalnizca kurankesfi.tr'den calisir.
   */
  readonly PUBLIC_ARCGIS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
