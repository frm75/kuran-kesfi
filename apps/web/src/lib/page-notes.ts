import type { SourceRef } from "~/components/types";

/**
 * Sayfa dipnotları — kaynak, lisans ve editoryal uyarıları sayfanın altına
 * toplar.
 *
 * ## Neden
 *
 * Ayet sayfasında künye, lisans ve "bu şudur değildir" uyarıları bölüm bölüm
 * kutu ve gri satır olarak duruyordu; okuyan kişi ayeti bulmadan önce üç
 * lisans metninden geçiyordu (kullanıcı kararı 2026-09-08). Bilgi
 * KALDIRILMADI — gerektiği yerde küçük bir üst rakam duruyor, metnin tamamı
 * sayfanın altında numaralı listede.
 *
 * ## Neden gizleme sayılmaz
 *
 * QuranEnc'in yeniden yayın koşulu 3 sürüm numarasının GÖSTERİLMESİNİ
 * istiyor; CLAUDE.md kural 4 kaynaklı içeriğin kaynağıyla çıkmasını istiyor.
 * İkisi de metnin sayfada bulunmasını şart koşar, belli bir yerde durmasını
 * değil. Not metni kısaltılmaz, `<SourceBadge>` yine basılır — yalnız yeri
 * değişir ve iki yönlü bağlantıyla (üst rakam ↔ ↩) bağlanır.
 *
 * ## Sıra
 *
 * Numaralar `add()` çağrı sırasına göre verilir; çağrılar frontmatter'da
 * BELGE SIRASIYLA yapılmalıdır, yoksa sayfada 1'den önce 2 görünür.
 */

export interface PageNote {
  /** Görünen numara, 1'den başlar. */
  n: number;
  /** Liste öğesinin `id`'si; üst rakam buraya bağlanır. */
  id: string;
  /** Düz metin gövdesi. */
  text?: string;
  /** Kaynaklı not — `<SourceBadge>` ile basılır. */
  sources?: readonly SourceRef[];
  /** Ekran okuyucu için: neyin kaynağı. */
  label?: string;
}

export class NoteList {
  private readonly items: PageNote[] = [];

  /** Not ekler ve üst rakam için gereken kaydı döndürür. */
  add(note: Omit<PageNote, "n" | "id">): PageNote {
    const n = this.items.length + 1;
    const entry: PageNote = { ...note, n, id: `not-${String(n)}` };
    this.items.push(entry);
    return entry;
  }

  get all(): readonly PageNote[] {
    return this.items;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }
}
