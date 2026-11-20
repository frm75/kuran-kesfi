/** D. Sayfa metnindeki durum iddialari. */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { info, repoRoot } from "@kuran/pipeline";
import { errors, tick, warn } from "./report.js";

// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Sayfa metnindeki DURUM IDDIALARI
// -----------------------------------------------------------------------------

/**
 * Tanitim metninde eskimis "hazir degil" cumlelerini yakalar.
 *
 * ## Neden gerekli
 *
 * Sitenin durustluk kurali iki yonludur: hazir olmayani hazir gostermek kadar
 * HAZIR OLANI YOK GOSTERMEK de yalandir. Birinci yonu kod zaten koruyor —
 * "hazir/yakinda" rozetleri `href` dolu mu diye HESAPLANIYOR. Ikinci yonu ise
 * hicbir sey korumuyordu: rozetin yanindaki DUZYAZI elle yazilmis ve modul
 * yayina girdiginde kimse o cumleyi guncellemiyor, kimse de hata almiyor.
 *
 * 2026-09-07'de bu iki kez yasandi ve ikisini de kullanici fark etti:
 *   1. "Henuz acilmadi... arkasinda calisan bir sunucu yok" — Telegram botu
 *      o gun yayina girmisti.
 *   2. "Su an Kelime kapisi acik; diger dordunun altyapisi hazirlaniyor" —
 *      bes kapinin besi de aciktir.
 *
 * ## Nasil calisiyor
 *
 * Anahtar kelime taramasi TEK BASINA ise yaramaz: "yakinda" gecen her cumleyi
 * uyari yapmak gurultu uretir, gurultu de gormezden gelinir. Bu yuzden iki
 * kademe var:
 *
 *   HATA   — cumle hem "hazir degil" diyor hem de YAYINDA OLAN bir seyi
 *            aniyor (asagidaki LIVE_FEATURES listesi). Build durur.
 *   UYARI  — cumle "hazir degil" diyor ama yayindaki bir seyi anmiyor.
 *            Insan gozden gecirsin diye listelenir.
 *
 * LIVE_FEATURES elle guncellenir ve KASITLI olarak oyledir: bir modul yayina
 * girdiginde buraya bir satir eklenir, linter o andan itibaren o modul
 * hakkinda "hazir degil" diyen her cumlede build'i durdurur. Yani listeyi
 * guncellemek, metni guncellemeyi ZORUNLU kilar.
 */
export function checkPageClaims(): void {
  const pagesDir = resolve(repoRoot, "apps/web/src/pages");
  if (!existsSync(pagesDir)) return;

  /** "Bu hazir degil" anlamina gelen ifadeler. */
  const NOT_READY =
    /henüz|hazırlanıyor|açılmadı|yakında|planlanıyor|üzerinde çalış|ilerleyen (?:günlerde|aşamada)|Faz\s*\d/i;

  /**
   * YAYINDA olan seyler ve metinde nasil anilabilecekleri.
   *
   * Yeni bir modul yayina girdiginde BURAYA SATIR EKLENIR.
   */
  const LIVE_FEATURES: { ad: string; gecer: RegExp }[] = [
    { ad: "Telegram botu / bülten", gecer: /bülten|telegram|günlük ayet/i },
    { ad: "İletişim formu", gecer: /iletişim formu|geri bildirim|öneri formu/i },
    { ad: "Tefsir", gecer: /tefsir/i },
    { ad: "Kıraat", gecer: /kıraat/i },
    { ad: "Okuma günlüğü", gecer: /okuma günlüğü|ezber tekrar/i },
    { ad: "Medya katmanı", gecer: /medya paneli|görsel katman/i },
    { ad: "Yazma katmanı", gecer: /yazma katalo|mushaf yazma/i },
    // Bes kesif kapisinin BESI DE acik (gates[].href hepsinde dolu).
    { ad: "Harita kapısı", gecer: /harita kapısı/i },
    { ad: "Zaman kapısı", gecer: /zaman kapısı/i },
    { ad: "Kavram kapısı", gecer: /kavram kapısı/i },
    { ad: "Kelime kapısı", gecer: /kelime kapısı/i },
    { ad: "İlkeler kapısı", gecer: /ilke(?:ler)? kapısı/i },
  ];

  /**
   * Yorumlar taranmaz. Bu dosyalardaki aciklama notlari eski YANLIS metni
   * bilerek alintiliyor ("henuz acilmadi..."); yorumu taramak, hatanin
   * kaydini tutmayi imkansiz kilardi.
   */
  const stripComments = (text: string): string =>
    text
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");

  const files = readdirSync(pagesDir)
    .filter((name) => name.endsWith(".astro"))
    .sort();

  let claims = 0;
  for (const name of files) {
    const path = join(pagesDir, name);
    const lines = stripComments(readFileSync(path, "utf8")).split("\n");

    for (const [index, line] of lines.entries()) {
      if (!NOT_READY.test(line)) continue;

      /*
       * DUZYAZI MI, MAKINE MI?
       *
       * "yakinda" kelimesi sayfada iki yerde geciyor: bir, insanin yazdigi
       * cumlelerde; iki, rozeti URETEN kodda (`gate.href === undefined ?
       * "yakında" : "hazır"`, `{item.name} — yakında`). Ikincisi veriden
       * hesaplaniyor, yani zaten dogru; onlari uyari yapmak gurultu uretir ve
       * gurultulu bir denetim gormezden gelinir.
       *
       * Ayrim: etiketler ve JSX ifadeleri ({...}) silindikten sonra geriye
       * gercek bir cumle kaliyor mu? Kod satirlarindan birkac kelime kaliyor,
       * duzyazidan bir cumle.
       */
      const prose = line
        .replace(/\{[^}]*\}/g, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/["'`]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const wordCount = prose.split(" ").filter((w) => w.length > 1).length;
      if (wordCount < 4) continue;

      /*
       * Cumleyi komsu satirlarla birlikte degerlendiriyoruz: JSX metni satira
       * bolunuyor ve "Su an Kelime kapisi acik; diger dordunun altyapisi /
       * hazirlaniyor." gibi bir cumle iki satira dagiliyor.
       */
      const context = lines.slice(Math.max(0, index - 2), index + 3).join(" ");
      const live = LIVE_FEATURES.find((f) => f.gecer.test(context));
      const where = `apps/web/src/pages/${name}:${String(index + 1)}`;
      const excerpt = prose.slice(0, 90);

      if (live !== undefined) {
        errors.push(
          `${where}: "${excerpt}" — ${live.ad} YAYINDA ama metin hazir degilmis gibi ` +
            "yaziyor. Metni guncelleyin (durustluk kurali iki yonlu calisir).",
        );
      } else {
        claims += 1;
        warn("sayfa metni", `${where}: durum iddiasi — "${excerpt}"`);
      }
    }
  }

  tick();
  if (claims > 0) {
    info(`sayfa metni: ${String(claims)} durum iddiasi bulundu, gozden gecirilmeli`);
  }
}
