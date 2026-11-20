/** /sw.js service worker'ını kaydeder; /ibadet sayfaları çevrimdışı açılsın diye. */
export async function swKaydet(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch (h) {
    console.warn("service worker kaydedilemedi", h);
  }
}
