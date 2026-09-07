/**
 * Radyal taksonomi yerleşimi — kavram atlası ve ilke atlası ortak kullanır.
 *
 * ## Neden simülasyon değil trigonometri
 *
 * Force-directed yerleşim her çalıştığında biraz başka koordinat üretir.
 * Plan §20.1 tekrarlanabilir build istiyor: aynı girdi aynı baytları
 * vermeli. Buradaki her koordinat açı ve yarıçaptan türer; rastgelelik,
 * iterasyon ve zaman damgası yoktur.
 *
 * ## Neden bu dosyada SVG yok
 *
 * Yerleşim sayı üretir, çizim sayfanın işidir. Böylece aynı yerleşim hem
 * kavram atlasında hem ilke atlasında, farklı görsel dille kullanılabiliyor.
 */

export interface RadyalCocuk {
  slug: string;
  label: string;
  /** Düğüm büyüklüğünü belirler — kavramda ayet sayısı, ilkede dayanak sayısı */
  agirlik: number;
  /** Üçüncü seviye: bu çocuğun da çocukları varsa */
  altlar?: readonly RadyalCocuk[];
}

export interface RadyalGrup {
  slug: string;
  label: string;
  cocuklar: readonly RadyalCocuk[];
}

export interface RadyalKenar {
  a: string;
  b: string;
  type: string;
  weight: number;
  origin: string;
}

export interface RadyalGirdi {
  /** Kare görüş alanının kenarı (px) */
  boyut: number;
  gruplar: readonly RadyalGrup[];
  kenarlar: readonly RadyalKenar[];
}

export interface GrafDugum {
  slug: string;
  label: string;
  /** Ait olduğu grup slug'ı; grup düğümünde kendi slug'ı */
  grup: string;
  /** 0 grup, 1 kavram, 2 alt kavram */
  derinlik: number;
  x: number;
  y: number;
  r: number;
}

export interface GrafYerlesim {
  dugumler: GrafDugum[];
  kenarlar: RadyalKenar[];
  boyut: number;
}

/**
 * En büyük/en küçük düğüm yarıçapı; görüş alanının kenarına göre ölçeklenir.
 *
 * Brief'teki ilk değerler 0.018 / 0.006'ydı. Gerçek veride (109 kavram,
 * `concepts_index.json`) iki kavram çifti çakışıyordu: `fazl-ilah` ve
 * `ilah-izzet`, ikisi de aynı çocuk halkasında (0.40) komşu. Sebep: o
 * halkada düğüm başına düşen yay uzunluğu, toplam çocuk sayısına bölündüğü
 * için grup büyüklüğünden bağımsız olarak sabit (~22.8px, boyut 900 iken).
 *
 * Test edilerek doğrulandı ki (`graf.smoke.ts`, bölüm 6) MAKS_YARICAP ve
 * MIN_YARICAP'ın HER BİRİ TEK BAŞINA bu iki çifti çakışmadan kurtarmaya
 * yetiyor — ikisi birden orijinal değerinde kalırsa çakışma geri geliyor.
 * Yani MIN_YARICAP'ın küçültülmesi salt kozmetik değil, kendi başına da
 * çakışmayı önlüyor; iki sabit birlikte orantılı küçültüldü (oran ~1/3
 * korunarak) ki en küçük/en büyük görsel farkı orijinaline yakın kalsın.
 * 0.010 / 0.0035 ile iki azami yarıçaplı düğüm yan yana olsa bile aralarında
 * ~%21 pay kalıyor.
 */
const MAKS_YARICAP = 0.01;
const MIN_YARICAP = 0.0035;

/**
 * Alt kavram yelpazesinin genişlik çarpanı (brief'teki ilk değer 0.6).
 *
 * Gerçek veride tek bir üçüncü seviye örneği var: `sirk` (143 ayet) ve
 * `fisk` (54 ayet), ikisi de `kufur`'un altında. 0.6 ile bu ikisi arasındaki
 * mesafe 8.05px, yarıçap toplamları 8.91px — çakışıyor. Çakışma sebebi
 * dar: yelpaze açısı ebeveyninin kendi diliminin (pay/n) sabit bir kesri,
 * ama halka (0.47) merkeze uzak olduğu için aynı açı daha büyük bir yay
 * mesafesi gerektiriyor. 1.2 ile mesafe 16.11px'e çıkıyor (~%80 pay) ve
 * tek gerçek örnek için doğrulandı (bkz. görev raporu).
 */
const ALT_YELPAZE_CARPANI = 1.2;

/**
 * Grupları açı dilimlerine böler, çocukları kendi diliminde yaya dizer.
 *
 * Yarıçap katmanları (görüş alanı kenarının oranı olarak):
 *   grup       0.26   — iç halka
 *   kavram     0.40   — orta halka
 *   alt kavram 0.47   — ebeveyninin hemen dışında
 *
 * Dilim payı çocuk sayısına göredir, ayet sayısına göre DEĞİL: 14 çocuklu
 * grup 9 çocukluyla aynı açıyı alsaydı düğümleri üst üste binerdi.
 */
export function radyalYerlesim(girdi: RadyalGirdi): GrafYerlesim {
  const { boyut, gruplar, kenarlar } = girdi;
  const merkez = boyut / 2;
  const dugumler: GrafDugum[] = [];

  if (gruplar.length === 0) return { dugumler, kenarlar: [...kenarlar], boyut };

  const toplamCocuk = gruplar.reduce((a, g) => a + Math.max(1, g.cocuklar.length), 0);
  const enBuyukAgirlik = Math.max(
    1,
    ...gruplar.flatMap((g) => g.cocuklar.flatMap((c) => [c.agirlik, ...(c.altlar ?? []).map((x) => x.agirlik)])),
  );

  // Ağırlık → yarıçap. Karekök: göz ALANI karşılaştırır, çapı değil.
  const yaricap = (agirlik: number): number =>
    boyut * (MIN_YARICAP + (MAKS_YARICAP - MIN_YARICAP) * Math.sqrt(Math.max(0, agirlik) / enBuyukAgirlik));

  const nokta = (aci: number, oran: number): { x: number; y: number } => ({
    x: merkez + Math.cos(aci) * boyut * oran,
    y: merkez + Math.sin(aci) * boyut * oran,
  });

  /*
   * Tek grup varsa acisal konum ANLAMSIZ: dilim payi tam 2π cikar, bu da
   * grup merkez acisini hep π/2'de sabitler ve dugum merkeze degil 0.26
   * yaricapinda HEP GUNEYE duser — kavramdan bagimsiz, sistemik bir kayma
   * (olculdu: boyut 420'de (210,210) yerine (210,319.2), boyut 700'de
   * (350,350) yerine (350,532)). Ego-graf (Task 6, kavram sayfasi) ve grup
   * sayfasi (Task 5) tek grubu bir merkez/hub olarak kullaniyor — cocuklari
   * gercek merkez etrafinda dogru bir daire cizdigi icin sorun fark
   * edilmiyordu, ama "halka"nin kendisi (merkez dugum) kaymis oluyordu ve
   * erisilebilirlik metni ("Merkezde X") yanlis cikiyordu. Cok gruplu (asil
   * atlas) durumda bu dal calismiyor, davranis DEGISMEDI.
   */
  const tekGrup = gruplar.length === 1;

  // -PI/2: ilk grup tepede başlasın, saat yönünde ilerlesin.
  let aci = -Math.PI / 2;
  for (const grup of gruplar) {
    const pay = (Math.max(1, grup.cocuklar.length) / toplamCocuk) * Math.PI * 2;
    const grupMerkezAci = aci + pay / 2;
    const gp = tekGrup ? { x: merkez, y: merkez } : nokta(grupMerkezAci, 0.26);
    dugumler.push({
      slug: grup.slug,
      label: grup.label,
      grup: grup.slug,
      derinlik: 0,
      x: gp.x,
      y: gp.y,
      r: boyut * MAKS_YARICAP,
    });

    const n = grup.cocuklar.length;
    grup.cocuklar.forEach((cocuk, i) => {
      // Dilimin kenarlarına yapışmasın diye (i + 0.5) / n
      const ca = aci + (pay * (i + 0.5)) / Math.max(1, n);
      const cp = nokta(ca, 0.4);
      dugumler.push({
        slug: cocuk.slug,
        label: cocuk.label,
        grup: grup.slug,
        derinlik: 1,
        x: cp.x,
        y: cp.y,
        r: yaricap(cocuk.agirlik),
      });

      const altlar = cocuk.altlar ?? [];
      altlar.forEach((alt, j) => {
        // Ebeveynin açısı etrafında küçük bir yelpaze
        const yelpaze = (pay / Math.max(1, n)) * ALT_YELPAZE_CARPANI;
        const aa = ca + yelpaze * ((j + 0.5) / altlar.length - 0.5);
        const ap = nokta(aa, 0.47);
        dugumler.push({
          slug: alt.slug,
          label: alt.label,
          grup: grup.slug,
          derinlik: 2,
          x: ap.x,
          y: ap.y,
          r: yaricap(alt.agirlik),
        });
      });
    });

    aci += pay;
  }

  return { dugumler, kenarlar: [...kenarlar], boyut };
}

/**
 * İki düğüm arasında çemberin içinden geçen kiriş.
 *
 * Kontrol noktası merkeze doğru çekilir; düz çizgi olsaydı uzak çiftlerin
 * bağı grafiğin ortasında birbirini keserdi ve hiçbiri okunmazdı.
 */
export function kirisYolu(a: GrafDugum, b: GrafDugum, merkez: number): string {
  const ox = (a.x + b.x) / 2;
  const oy = (a.y + b.y) / 2;
  // 0.45: orta noktayı merkeze doğru bu oranda çeker. 0 düz çizgi, 1 merkezden geçer.
  const kx = ox + (merkez - ox) * 0.45;
  const ky = oy + (merkez - oy) * 0.45;
  const yuvarla = (n: number): string => (Math.round(n * 100) / 100).toString();
  return `M ${yuvarla(a.x)} ${yuvarla(a.y)} Q ${yuvarla(kx)} ${yuvarla(ky)} ${yuvarla(b.x)} ${yuvarla(b.y)}`;
}
