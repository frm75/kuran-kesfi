/**
 * Ana menü — TEK KAYNAK.
 *
 * Şerit (SiteNav.astro), hub sayfaları, breadcrumb'lar ve sitemap hep bu
 * diziden beslenir. Menü metni başka hiçbir yerde sabit yazılmaz.
 *
 * ## Bu dosya hiçbir şey IMPORT ETMEZ
 *
 * Base.astro her sayfada bunu çekiyor. İçeri `~/lib/data` girseydi 13516
 * sayfanın hepsi, yalnızca menüyü basmak için `surahs_index.json`,
 * `concepts_index.json` ve arkadaşlarını okurdu. Sayılar hub sayfalarında
 * ayrıca çözülür — orada zaten okunuyorlar.
 *
 * ## Dört başlık nereden geliyor
 *
 * Kullanıcı kararı 2026-09-07: Oku (metnin kendisi) · Anla (metni açan
 * katmanlar) · Keşfet (bağlam eksenleri) · Kaynaklar (nereden geldiği).
 * Önceki 11 düz link bu dörtlüye indi.
 */

export interface NavChild {
  /** Yayınlanan adres — uzantısız, sonda `/` yok */
  href: string;
  label: string;
  /** Hub sayfasındaki kartta görünen tek cümle */
  blurb: string;
}

export interface NavHub extends NavChild {
  children: readonly NavChild[];
}

export const NAV: readonly NavHub[] = [
  {
    href: "/oku",
    label: "Oku",
    blurb: "Kur'an metninin kendisi: sureler, mealler ve okuma takibi.",
    children: [
      {
        href: "/sureler",
        label: "Sureler",
        blurb: "Arapça metin, çeviriyazı ve yan yana mealler.",
      },
      {
        href: "/gunluk",
        label: "Okuma günlüğü",
        blurb: "Okuduğun yeri ve notlarını kendi cihazında tutar; sunucuya hiçbir şey gitmez.",
      },
      {
        href: "/telegram",
        label: "Günlük ayet",
        blurb: "Telegram botu her gün bir ilke ve dayanak ayetini gönderir.",
      },
    ],
  },
  {
    href: "/anla",
    label: "Anla",
    blurb: "Metni açan katmanlar: kavramlar, kökler ve Kur'an'ın emrettiği ilkeler.",
    children: [
      {
        href: "/kavramlar",
        label: "Kavramlar",
        blurb: "Kur'an'ın temel kavramları; ayet bağları kök verisinden hesaplanır.",
      },
      {
        href: "/kok",
        label: "Kökler",
        blurb: "Arapça kökler ve türevleri; bir kökün Kur'an'daki bütün geçişleri.",
      },
      {
        href: "/ilkeler",
        label: "İlkeler",
        blurb: "Kur'an'ın doğrudan emrettiği ahlâkî ilkeler ve dayanak ayetleri.",
      },
    ],
  },
  {
    href: "/kesfet",
    label: "Keşfet",
    blurb: "Bağlam eksenleri: kıssalar, coğrafya, nüzul sırası ve mushaf tarihi.",
    children: [
      {
        href: "/kissalar",
        label: "Kıssalar",
        blurb: "Kur'an kıssaları; geçtiği ayetler, konumlar ve kaynaklarıyla.",
      },
      {
        href: "/harita",
        label: "Harita",
        blurb: "Kıssaların geçtiği yerler; konum güven derecesi açıkça yazılı.",
      },
      {
        href: "/zaman",
        label: "Zaman",
        blurb: "Nüzul sırası ve siyer olayları; iki farklı sıralama yan yana.",
      },
      {
        href: "/yazmalar",
        label: "Yazmalar",
        blurb: "Eski mushaf yazmaları; yüzyıl yüzyıl katalog ve künyeler.",
      },
    ],
  },
  {
    href: "/kaynaklar",
    label: "Kaynaklar",
    blurb: "Sitedeki her metnin nereden geldiği, hangi lisansla kullanıldığı ve eksikleri.",
    children: [
      {
        href: "/kaynaklar",
        label: "Kaynak Şeffaflığı",
        blurb: "Kaynak listesi, meal lisansları ve kaynak taraflı eksikler.",
      },
      {
        href: "/iletisim",
        label: "İletişim",
        blurb: "Hata bildirimi, düzeltme önerisi ve geri bildirim.",
      },
    ],
  },
];

/** Hub + çocuk yolları, menüdeki sırayla. Tekrar eden adres bir kez döner. */
export function allNavPaths(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hub of NAV) {
    for (const href of [hub.href, ...hub.children.map((c) => c.href)]) {
      if (seen.has(href)) continue;
      seen.add(href);
      out.push(href);
    }
  }
  return out;
}

/**
 * Verilen yolun ait olduğu üst başlık.
 *
 * Hub'ın kendi adresi de, çocuklarının adresleri de aynı hub'ı döndürür.
 * Menüde olmayan bir yol (sure, ayet, kavram detayı) `null` döner — şerit o
 * zaman hiçbir başlığı aktif işaretlemez.
 */
export function findHub(path: string): NavHub | null {
  for (const hub of NAV) {
    if (hub.href === path) return hub;
    if (hub.children.some((c) => c.href === path)) return hub;
  }
  return null;
}
