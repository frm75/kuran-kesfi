/**
 * Calan kelimeyi bulma — plan 04.
 *
 * `starts` ayete goreli kelime baslangiclaridir; son eleman son kelimenin
 * bitisidir (uzunluk = kelime sayisi + 1). Bir kelimenin bitisi bir sonrakinin
 * baslangicidir.
 *
 * Ikili arama, dogrusal tarama degil: dongu saniyede ~60 kez donuyor ve
 * 2:282'de 129 kelime var. Esit baslangicta SONRAKI kelime secilir — iki
 * kelime ayni ms'ye dustugunde (aradegerleme boyle yapabiliyor) isik takilip
 * kalmasin.
 *
 * Bu dosya tarayiciya gider: Node API'si, DOM erisimi ve bagimlilik YOKTUR.
 */
export function activeWordIndex(starts: readonly number[], tMs: number): number {
  const wordCount = starts.length - 1;
  if (wordCount < 1) return -1;
  const first = starts[0] ?? 0;
  const last = starts[wordCount] ?? 0;
  if (tMs < first || tMs >= last) return -1;

  let low = 0;
  let high = wordCount - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if ((starts[mid] ?? 0) <= tMs) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
