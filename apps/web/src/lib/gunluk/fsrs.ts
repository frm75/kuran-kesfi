/**
 * FSRS — aralıklı tekrar zamanlayıcısı (plan §2.6, §6).
 *
 * Ezber tekrarının ne zaman geleceğini bu dosya söyler. Tarayıcıda çalışır,
 * sunucuya hiçbir şey gitmez.
 *
 * ## Neden FSRS, neden SM-2 değil
 *
 * Plan §6 açıkça FSRS diyor. Aradaki fark isim farkı değil: SM-2 tek bir
 * "kolaylık çarpanı" tutar ve aralığı onunla çarpar; FSRS iki ayrı büyüklük
 * tutar — **kararlılık** (S, hafızanın kaç günde bir başa döneceği) ve
 * **zorluk** (D, 1–10). Bir ayeti "zor ama hatırladım" diye işaretlemek
 * SM-2'de aralığı kısaltır ve orada biter; FSRS'te zorluğu kalıcı olarak
 * yükseltir, yani o ayet bundan sonra hep daha sık gelir.
 *
 * Bu yüzden `user_data.ts` şeması `ease` yerine `stability` + `difficulty`
 * taşır. Şema FSRS'i adıyla anıyordu ama SM-2 alanlarıyla yazılmıştı;
 * 2026-09-07'de düzeltildi (henüz kimsede veri yok, göç gerekmedi).
 *
 * ## Uygulanan sürüm
 *
 * FSRS-4.5'in varsayılan ağırlıkları. Öğrenme adımları (aynı gün içinde
 * tekrar) uygulanmıyor: burası bir kart destesi değil, ayet ezberi — aynı
 * ayeti gün içinde üç kez sormak istenmiyor. En küçük aralık 1 gündür.
 */

/** FSRS-4.5 varsayılan ağırlıkları (w0…w16). */
const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461,
  2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
] as const;

const DECAY = -0.5;
const FACTOR = 19 / 81;

/** Hedef hatırlama olasılığı. 0,9 = "tekrar geldiğinde %90 hatırlıyor olayım". */
const REQUEST_RETENTION = 0.9;

/** Aralık tavanı: bir ayeti on yıl sonraya atmak "bitti" demenin süslü hâli olurdu. */
const MAX_INTERVAL_DAYS = 365 * 3;

/** 1 = tekrar (unuttum) · 2 = zor · 3 = iyi · 4 = kolay */
export type Rating = 1 | 2 | 3 | 4;

export interface MemoryState {
  /** Kararlılık — gün cinsinden. Büyüdükçe tekrar seyrekleşir. */
  stability: number;
  /** Zorluk — 1 (kolay) ile 10 (zor) arası. */
  difficulty: number;
}

const clampDifficulty = (d: number): number => Math.min(10, Math.max(1, d));

/** İlk tekrardan sonraki durum. */
export function initialState(rating: Rating): MemoryState {
  return {
    stability: Math.max(W[rating - 1] ?? W[2], 0.1),
    difficulty: clampDifficulty(W[4] - (rating - 3) * W[5]),
  };
}

/**
 * Hatırlanabilirlik: son tekrarın üzerinden `elapsedDays` geçmişken
 * hatırlama olasılığı. Aralık hesabının değil, BİR SONRAKİ kararlılığın
 * girdisidir — geç kalınmış bir tekrarı doğru bilmek daha çok şey öğretir.
 */
function retrievability(elapsedDays: number, stability: number): number {
  return (1 + (FACTOR * elapsedDays) / stability) ** DECAY;
}

/** Bir tekrardan sonraki yeni durum. */
export function nextState(
  current: MemoryState,
  rating: Rating,
  elapsedDays: number,
): MemoryState {
  const r = retrievability(Math.max(0, elapsedDays), current.stability);

  // Zorluk: ortalamaya geri çekilir (mean reversion), yoksa tek bir kötü gün
  // ayeti kalıcı olarak "çok zor" yapardı.
  const delta = current.difficulty - W[6] * (rating - 3);
  const difficulty = clampDifficulty(W[7] * (W[4] - 0) + (1 - W[7]) * delta);

  let stability: number;
  if (rating === 1) {
    // Unutma: kararlılık sıfırlanmaz, geriye düşer. Bir kez öğrenilmiş bir
    // ayet ikinci kez sıfırdan öğrenilmiyor.
    stability =
      W[11] *
      current.difficulty ** -W[12] *
      ((current.stability + 1) ** W[13] - 1) *
      Math.exp(W[14] * (1 - r));
  } else {
    const hardPenalty = rating === 2 ? W[15] : 1;
    const easyBonus = rating === 4 ? W[16] : 1;
    stability =
      current.stability *
      (1 +
        Math.exp(W[8]) *
          (11 - difficulty) *
          current.stability ** -W[9] *
          (Math.exp(W[10] * (1 - r)) - 1) *
          hardPenalty *
          easyBonus);
  }

  return { stability: Math.min(Math.max(stability, 0.1), MAX_INTERVAL_DAYS), difficulty };
}

/** Kararlılıktan gün cinsinden aralık. En az 1 gün. */
export function intervalDays(stability: number): number {
  const raw = (stability / FACTOR) * (REQUEST_RETENTION ** (1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(raw)));
}

/** Bugünden `days` gün sonrası, ISO damgası olarak. */
export function addDays(from: Date, days: number): string {
  const next = new Date(from.getTime());
  next.setDate(next.getDate() + days);
  return next.toISOString();
}
