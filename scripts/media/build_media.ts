import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { info, fail, repoRoot } from "@kuran/pipeline";
import sharp from "sharp";

/**
 * Tanitim sayfasi hero videosu — DESIGN.md 8, plan 20.3.
 *
 * TEK KAYNAK: scripts/media/hero-source.mp4 (1280x720, 24fps, 20,04 sn).
 *
 * ============================================================================
 * NEDEN KESILIYOR — bu dosyanin varlik sebebi
 * ============================================================================
 *
 * Kaynak videoda peygamberler INSAN FIGURU olarak gorunuyor. Plan 20.3:
 * "Peygamber, sahabe, melek ve insan figuru tasvir edilmez." Yasak yuze degil
 * FIGURE — silueti, uzaktan gorunmesi, yuzunun secilmemesi fark etmiyor.
 *
 * 2026-09-05 taramasi: kaynak 0,05 sn adimlarla kare kare tarandi ve ONCEKI
 * KESIM UC YERDE FIGUR GECIRIYORDU. Bu bir yorum hatasi degildi, yayindaki
 * videoda gercekten vardi:
 *
 *   eski parca        icinde kalan figur
 *   ---------------   --------------------------------------------------
 *   [7.2, 1.8]        7,20-7,25: gemi onunde kucuk figur (sol alt)
 *                     8,50-9,00: kiyida ayakta duran figur
 *   [10.4, 1.6]       11,45-12,00: Hz. Yunus, suya batarken (merkez)
 *   [13.5, 1.5]       13,50-13,80: ayni figur, balinanin ustunde
 *
 * Bu yuzden araliklar artik "sahne" degil DOGRULANMIS FIGURSUZ PENCERE
 * olarak tanimlaniyor; her birinin iki ucu ayri ayri kare kare kontrol
 * edildi. Pencere sinirlari daraltildi, genisletilmedi.
 *
 * Uzak kervan (15,9-18,3 sn) birakildi: o olcekte hayvan surusu okunuyor,
 * insan tasviri degil.
 *
 * ============================================================================
 * NEDEN PARLATILIYOR VE YAVASLATILIYOR
 * ============================================================================
 *
 * Kaynak koyu derecelenmis. Olculdu (signalstats YAVG, 0,5 sn adim):
 *
 *   0-2,0 sn   31 34 38 46      neredeyse siyah (uzay)
 *   18,5-20 sn 50 36 39         fade-to-black
 *
 * Eski kesim bu iki ucu iceri aliyordu: 11,4 sn'lik dongunun 3,5 sn'si
 * (%31) siyah geciyordu ve poster 0. kareydi (YAVG 31) — yani video
 * baslamadan once ekranda siyah duruyordu. Kullanici "video gorunmuyor"
 * dedi; perde degil, KAYNAGIN KENDISI karanlikti.
 *
 * Iki onlem:
 *   1. Siyah bas ve son pencerelerin disinda birakildi (asagidaki WINDOWS).
 *   2. eq=gamma ile golgeler kaldirildi. Gamma Y duzlemine dogrudan uygulanir,
 *      curves gibi RGB'ye donusum gerektirmez ve renk kaymasi yapmaz.
 *      0,20 -> 0,30 / 0,43 -> 0,54 / 0,57 -> 0,66 (normalize luma).
 *
 * Yavaslatma: pencereler daraldigi icin ham sure 7,9 sn'ye dustu. SPEED ile
 * gerilir; hem sure geri gelir hem arka plan videosuna yakisan agir bir
 * tempo olur. Kare tekrari sorun degil: cikti 15 fps, kaynagin bu hizdaki
 * efektif kare hizi 14,4 fps — neredeyse birebir (bkz. FPS).
 *
 * ============================================================================
 *
 * Kullanim:
 *   pnpm --filter @kuran/media media          uret
 *   pnpm --filter @kuran/media media:check    uretilenle diskteki ayni mi
 *
 * ffmpeg gerekir (apt install ffmpeg).
 */

const SOURCE = resolve(import.meta.dirname, "hero-source.mp4");
const OUT_DIR = resolve(repoRoot, "apps/web/public/media");
const MANIFEST_FILE = resolve(OUT_DIR, "manifest.json");
const TMP = resolve(import.meta.dirname, ".tmp");

/**
 * Dogrulanmis figursuz pencereler — [baslangic sn, bitis sn, ne oldugu].
 *
 * Her sinir kare kare kontrol edildi; yanindaki not neyin hemen disarida
 * kaldigini soyluyor ki ilerde biri "biraz genisletelim" demesin.
 */
/*
 * 2026-09-05 (dorduncu tur) — KULLANICI KARARI: figur kisiti kaldirildi.
 * Kullanicinin sozu: "figur olsun zaten arkasi donuk sorun degil".
 * Kaynaktaki figurler uzak, kucuk ve sirti donuk siluetlerdir.
 *
 * DIKKAT: CLAUDE.md satir 127 ve plan 20.3 HALA "figur yok" diyor. Bu
 * dosya artik oradan ayriliyor; belgeler kullanicinin onayiyla
 * guncellenecek. Karar kaydi burada, tarihiyle duruyor.
 *
 * Kisit kalkinca KESMEYE de gerek kalmadi: figursuz pencereleri birbirine
 * eklemek gerekmediginden tek surekli parca kullaniliyor. "Cok hizli
 * akiyor" sikayeti de boylece kokten cozuluyor — sahne gecisi yok, akis
 * kaynagin kendi temposu.
 *
 * Sinirlar artik PARLAKLIGA gore: 1,80 oncesi uzay siyahi, 18,60 sonrasi
 * siyah uzayda dunya (kare ortalamasi 60'a duser, metnin arkasinda koyu
 * durur). Ikisi de disarida.
 */
/**
 * Montaj sirasi. Iki tur parca var:
 *   src    kaynak videodan bir aralik (SPEED ile gerilir)
 *   still  duran gorsel; zoompan ile yavas ic ceker, boylece montajin
 *          havadan suzulme dili bozulmaz
 *
 * 2026-09-06 — KULLANICI ISTEGI: "en son Kabe cikmali". Kaynakta Kabe YOK;
 * sondaki yapi altin kubbe + turkuaz kubbe + minare, yani Kubbetu's-Sahra
 * gorunumu. Kesmeyle duzeltilemedigi icin Kabe karesi uretildi
 * (Higgsfield / nano_banana_pro, 2026-09-06). Ardindan kullanicinin
 * istedigi kapanis geliyor: uzaydan dunya — o kaynakta zaten var (18,60
 * sonrasi). Metin orada olmadigi icin karenin koyulugu sorun degil.
 */
type Segment =
  | {
      readonly kind: "src";
      readonly start: number;
      readonly end: number;
      readonly note: string;
      /** Bu parcaya ozel parlaklik tabani; verilmezse MIN_Y gecerli. */
      readonly minY?: number;
    }
  | {
      readonly kind: "still";
      readonly file: string;
      readonly seconds: number;
      readonly note: string;
      readonly minY?: number;
    };

const SEGMENTS: readonly Segment[] = [
  { kind: "src", start: 1.8, end: 18.6, note: "kesintisiz: dunya, vadi, tufan, yarilan deniz, col, sehir" },
  { kind: "still", file: "kabe.jpg", seconds: 6, note: "Kabe (uretilmis kare, yavas geri acilma)" },
  /*
   * Kapanis KASITLI OLARAK KARANLIK: siyah uzayda dunya. Kare ortalamasi
   * ~60'a duser ama bu "video yok" degil, sahnenin kendisi. MIN_Y kapisi
   * bu parca icin 45'e cekildi; gerisi 60'ta kaliyor, yani asil govdeyi
   * koruyan esik gevsetilmedi.
   */
  { kind: "src", start: 18.6, end: 19.95, note: "kapanis: uzaydan dunya, altin yaylar", minY: 45 },
];

/** Parcalar arasi gecis suresi. */
const XFADE = 0.6;

/**
 * Cikti kare hizi.
 *
 * 2026-09-06: kullanici "video cozunurlugu cok kotu" dedi. Cozunurluk
 * DUSMEMISTI — kaynak 1280x720, cikti da 1280x720. Suclu baskaydi ve
 * olculdu (Laplacian varyansi, ayni kare, 6 sn'lik dilimde 12 ayar):
 *
 *   ayar                        KB/6sn   netlik
 *   minterpolate=blend, crf 20    4261     6,62
 *   minterpolate=mci,   crf 24    2323     5,54   (en kotu + hayalet)
 *   fps=15,             crf 22    2651     7,82   <- secildi
 *   fps=15,             crf 24    2222     7,41
 *
 * minterpolate=blend her ara kareyi iki komsunun ortalamasi yapiyordu:
 * hem YUMUSATIYOR hem de entropiyi artirdigi icin dosyayi BUYUTUYORDU.
 * Ikisini birden kaybediyorduk.
 *
 * Ara kareye zaten gerek yok: kaynak 24 fps, SPEED 0.6 ile efektif kare
 * hizi 24 x 0,6 = 14,4 fps. Cikti 15 fps'te her kaynak karesi bir kez
 * gosteriliyor (yaklasik 24 karede bir tekrar) — ne harmanlama, ne
 * duzensiz kare tekrari. 24 fps'te kalinsaydi her kare 1 veya 2 kez
 * gosterilip titreme yapardi; blend de bunu ortmek icin konmustu.
 */
const FPS = 15;

/**
 * Oynatma hizi.
 *
 * 2026-09-06 (dorduncu tur): kullanici "video cok hizli" dedi — ikinci kez.
 * 0,85 yetmemis. 0,60'a cekildi: 16,80 sn'lik govde ekranda ~28 sn'ye
 * yayiliyor. Kaynak hava cekimi zaten hizli suzuluyor; asil hiz hissi
 * kamera hareketinden geliyor, kesmeden degil (kesme zaten yok).
 * Cikti 15 fps oldugu icin yavaslatma takilma yapmaz: kaynagin bu hizdaki
 * efektif kare hizi 14,4 fps, yani kare basina neredeyse tam bir cikti
 * karesi dusuyor (bkz. FPS).
 */
const SPEED = 0.6;

/**
 * Renk derecelendirme.
 *
 * 2026-09-05 ikinci tur: kullanici "hala cok koyu, tam canli olsun" dedi.
 * Olculdu — kaynak degil PERDE karartiyordu (medyan 149/255 video, uzerinde
 * %52 perde: ekranda ~70/255). Perde index.astro'da kesildi; video da
 * perdesiz duracagi icin burada bir kademe daha acildi:
 *
 *   gamma      1.35 -> 1.55   golgeler; Y duzlemine uygulanir, renk kaydirmaz
 *   saturation 1.10 -> 1.30   "canli" istegi; gamma'nin aldigi doygunlugu
 *                             geri vermenin otesine gecer
 *   contrast   ->   1.06      gamma yukselince duzlesen tonu toparlar
 *
 * Ust sinir gamma 1.55'te: 1.7 denendi, col safagi karesinde gokyuzu
 * 246/255'e cikip kirpiliyordu (detay kaybi).
 */
const EQ = "eq=gamma=1.55:saturation=1.30:contrast=1.06";

/**
 * Kalite. crf 36 secilmisti cunku video kalin bir perdenin altindaydi ve
 * ayrinti zaten kayboluyordu. Perde kesilince video dogrudan gorunur oldu;
 * 36'da col ve deniz karelerinde blok gorunuyor. 30'a cekildi — dosya
 * ~570 KB'dan ~1 MB'a cikiyor, tek varlik icin kabul edilebilir.
 * aq-mode=3 karanlik gradyanlarda bantlanmayi onler.
 */
const CRF = 22;

const sha256 = (buf: Buffer): string => createHash("sha256").update(buf).digest("hex");

function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
}

function requireFfmpeg(): void {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    fail("ffmpeg bulunamadi. Kurulum: apt-get install -y ffmpeg");
  }
}

/**
 * Kaynaktan cikan sure degil, EKRANDA gecen sure.
 *
 * Pencere ham suresi SPEED ile gerilir; xfade'te iki parca ust uste bindigi
 * icin her gecis kadar geri alinir.
 */
const stretched = (seg: Segment): number =>
  seg.kind === "src" ? (seg.end - seg.start) / SPEED : seg.seconds;
const TOTAL = SEGMENTS.reduce((a, seg) => a + stretched(seg), 0) - XFADE * (SEGMENTS.length - 1);

/**
 * Duran gorselin baslangic yakinlastirmasi; oradan 1,00'a YAVASCA ACILIR
 * (zoom out, kullanici karari 2026-09-06).
 */
const STILL_ZOOM_FROM = 1.1;

/**
 * zoompan'in ic calisma cozunurlugu.
 *
 * Titremenin ikinci kaynagi buydu ve olculdu: zoompan kirpma dikdortgenini
 * TAMSAYIYA yuvarlar. 2560 tabanda kare basina adim 2,6 px; +-0,5 px'lik
 * yuvarlama hatasi adimin besde biri kadar, yani gorunur bir seyirme.
 * Taban buyudukce hata orani duser (ayni 6 sn'lik parcada olculdu,
 * ardisik kare farklarinin oynakligi / ortalama hareket):
 *
 *   2560 taban   %24,7
 *   7680 taban   %8,6   <- secildi
 *
 * Maliyet ~31 sn kodlama; yapinin tamami zaten ~3 dk.
 */
const STILL_BASE_W = 7680;
const STILL_BASE_H = 4320;
/** Duran gorselde gamma yukseltilmez: uretilen kare zaten dogru pozlanmis. */
const STILL_EQ = "eq=saturation=1.06:contrast=1.02";

/** Parcalari xfade zinciriyle birlestirir; cikti sessizdir (-an). */
function buildCut(target: string): void {
  const inputs: string[] = [];
  for (const seg of SEGMENTS) {
    if (seg.kind === "src") {
      inputs.push("-ss", String(seg.start), "-to", String(seg.end), "-i", SOURCE);
    } else {
      /*
       * TEK KARE beslenir — "-loop 1 -t <sure>" DEGIL.
       *
       * zoompan her GIRDI karesi icin `d` adet cikti karesi uretir. Girdi
       * dongude beslenince (90 kare) zoompan 90x90 = 8100 kare uretmeye
       * kalkiyordu; zoom rampasi her girdi karesinde basa donuyor, yani
       * Kabe surekli geri sicriyordu. Kullanicinin "titreme" dedigi buydu.
       * Standalone denemede 6 sn'lik parca 497 MB cikti — kanit buydu.
       */
      inputs.push("-i", resolve(import.meta.dirname, seg.file));
    }
  }

  const labels = SEGMENTS.map((_, i) => String.fromCharCode(97 + i));

  /*
   * Zincir sirasi onemli:
   *   setpts       once zamani gerer (0,6 hiz = PTS / 0,6)
   *   fps          cikti kare hizini sabitler; ARA KARE URETILMEZ
   *   eq           golgeleri kaldirir (bkz. dosya basi)
   *   format       xfade yuv420p bekler
   */
  const parts = labels.map((l, i) => {
    const seg = SEGMENTS[i]!;
    if (seg.kind === "src") {
      return (
        `[${String(i)}:v]setpts=(PTS-STARTPTS)/${String(SPEED)},` +
        `fps=${String(FPS)},${EQ},format=yuv420p[${l}]`
      );
    }
    /*
     * Duran gorsel once BUYUTULUP sonra zoompan'a veriliyor (bkz.
     * STILL_BASE_W). d = kare sayisi; zoom STILL_ZOOM_FROM'dan 1,00'a
     * esit adimlarla ACILIR.
     */
    const frames = Math.round(seg.seconds * FPS);
    const step = ((STILL_ZOOM_FROM - 1) / (frames - 1)).toFixed(7);
    /*
     * s ZOOMPAN GIRDISIYLE AYNI olmali. Kucuk verilirse (eski hali
     * s=1280x720, girdi 2560) filtre once kirpar sonra olcekler ve
     * "iw/2-(iw/zoom/2)" merkezleme matematigi tutmaz. Kucultme zoompan'dan
     * SONRA yapiliyor; bu ayni zamanda kalan yuvarlama hatasini alti kat
     * kuculttugu icin titremeyi de bastiriyor.
     */
    return (
      `[${String(i)}:v]scale=${String(STILL_BASE_W)}:${String(STILL_BASE_H)}:flags=lanczos,` +
      `zoompan=z='max(${String(STILL_ZOOM_FROM)}-on*${step},1.0)':d=${String(frames)}:` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `s=${String(STILL_BASE_W)}x${String(STILL_BASE_H)}:fps=${String(FPS)},` +
      `scale=1280:720:flags=lanczos,setsar=1,${STILL_EQ},format=yuv420p[${l}]`
    );
  });

  /*
   * Tek pencere olabilir (2026-09-05: figur kisiti kalkinca kesme gerekmedi).
   * O durumda xfade dongusu hic donmez ve "[v]" etiketi olusmaz; -map [v]
   * "Output with label 'v' does not exist" ile patlar. Zinciri kapatmak icin
   * son parcaya null filtresiyle "v" adi verilir.
   */
  if (labels.length === 1) {
    parts.push(`[${labels[0]!}]null[v]`);
  }

  // Her xfade'te toplam sure kadar ilerlenir, gecis payi geri alinir.
  let running = stretched(SEGMENTS[0]!);
  let prev = labels[0]!;
  for (let i = 1; i < labels.length; i += 1) {
    const offset = running - XFADE;
    const out = i === labels.length - 1 ? "v" : `x${String(i)}`;
    parts.push(
      `[${prev}][${labels[i]!}]xfade=transition=fade:duration=${String(XFADE)}:offset=${offset.toFixed(3)}[${out}]`,
    );
    running = running + stretched(SEGMENTS[i]!) - XFADE;
    prev = out;
  }

  ffmpeg([
    ...inputs,
    "-filter_complex",
    parts.join(";"),
    "-map",
    "[v]",
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    String(CRF),
    "-preset",
    "slower",
    "-profile:v",
    "high",
    "-level",
    "4.0",
    "-pix_fmt",
    "yuv420p",
    "-x264-params",
    "aq-mode=3:aq-strength=1.1",
    // faststart: moov atom basa alinir, video tamamen inmeden oynamaya baslar.
    "-movflags",
    "+faststart",
    target,
  ]);
}

/**
 * Ciktinin parlaklik profili — dogrulama icin, 0,5 sn adimlarla YAVG.
 *
 * Bu olcum rapor icin degil KURAL icin: eski surumde dongunun %31'i siyahti
 * ve bunu kimse fark etmedi cunku olculmuyordu. Simdi her uretimde basiliyor
 * ve en karanlik kare esigin altina duserse uretim durur.
 */
function luminance(path: string): { at: number; y: number }[] {
  const out = execFileSync(
    "ffmpeg",
    [
      "-v", "error", "-i", path,
      "-vf", "fps=2,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
      "-f", "null", "-",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const values = [...out.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  return values.map((y, i) => ({ at: i / 2, y }));
}

/**
 * Metnin arkasinda duracak kadar parlak olmayan kare kalmamali.
 *
 * 60/255 esigi: perde ~%42 karartiyor, altindan 60'in altinda bir kare
 * gecerse ekranda siyah gorunur — dongunun o saniyesi "video yok" demektir.
 */
const MIN_Y = 60;

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  if (!existsSync(SOURCE)) fail(`Kaynak video yok: ${SOURCE}`);
  requireFfmpeg();

  const src = readFileSync(SOURCE);
  info(`kaynak: ${(src.length / 1048576).toFixed(1)} MB · ${sha256(src).slice(0, 12)}`);
  info(
    `${String(SEGMENTS.length)} parca · hiz ${String(SPEED)}x -> ${TOTAL.toFixed(2)} sn`,
  );
  for (const seg of SEGMENTS) {
    info(
      seg.kind === "src"
        ? `  ${seg.start.toFixed(2).padStart(5)}-${seg.end.toFixed(2)}s  ${seg.note}`
        : `  ${seg.file.padStart(11)} ${seg.seconds.toFixed(2)}s  ${seg.note}`,
    );
  }

  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const videoPath = resolve(TMP, "hero.mp4");
  buildCut(videoPath);
  const video = readFileSync(videoPath);

  /*
   * Parlaklik profili + esik kontrolu.
   *
   * Eski surumde poster 0. kareydi ve o kare siyahti; video inene kadar
   * ekranda siyah bir dikdortgen duruyordu. Poster artik SABIT DEGIL, en
   * parlak kareden aliniyor — hangi kare oldugu asagida basiliyor.
   */
  const profile = luminance(videoPath);
  info(`parlaklik (YAVG, 0,5 sn): ${profile.map((p) => p.y.toFixed(0)).join(" ")}`);

  /*
   * Kapi parca farkindadir: her ornek, cikti zamanina gore hangi parcaya
   * dustuyse onun tabaniyla karsilastirilir. Boylece kasitli karanlik bir
   * kapanis, govdeyi koruyan esigi dusurmeden gecebilir.
   */
  /*
   * Parca sinirlari, gecisin BITTIGI an degil BASLADIGI andir. xfade
   * offset'i "onceki parcanin sonu eksi XFADE" oldugu icin yeni parca
   * ekranda o anda gorunmeye baslar; ilk hesap bunu kacirinca kapanis
   * karesi hala govde esigiyle olculuyordu.
   */
  const starts: { from: number; floor: number }[] = [];
  {
    let t = 0;
    for (const [i, seg] of SEGMENTS.entries()) {
      if (i > 0) t += stretched(SEGMENTS[i - 1]!) - XFADE;
      starts.push({ from: t, floor: seg.minY ?? MIN_Y });
    }
  }
  const floorAt = (at: number): number =>
    [...starts].reverse().find((b) => at >= b.from)?.floor ?? MIN_Y;

  const violation = profile.find((p) => p.y < floorAt(p.at));
  if (violation !== undefined) {
    fail(
      `${violation.at.toFixed(1)}s karesi cok karanlik (YAVG ${violation.y.toFixed(0)}, ` +
        `esik ${String(floorAt(violation.at))}). Parca sinirlarini veya EQ gamma degerini gozden gecirin.`,
    );
  }
  const darkest = profile.reduce((a, b) => (b.y < a.y ? b : a));

  const brightest = profile.reduce((a, b) => (b.y > a.y ? b : a));
  info(`poster: ${brightest.at.toFixed(1)}s (YAVG ${brightest.y.toFixed(0)}, en karanlik ${darkest.y.toFixed(0)})`);

  const frame = resolve(TMP, "poster.png");
  ffmpeg(["-ss", String(brightest.at), "-i", videoPath, "-frames:v", "1", frame]);
  const frameBuf = readFileSync(frame);
  const posterWebp = await sharp(frameBuf).resize(1280).webp({ quality: 72 }).toBuffer();
  const posterJpg = await sharp(frameBuf).resize(1280).jpeg({ quality: 70, mozjpeg: true }).toBuffer();

  const produced = new Map<string, Buffer>([
    ["hero.mp4", video],
    ["hero-poster.webp", posterWebp],
    ["hero-poster.jpg", posterJpg],
  ]);

  for (const [file, buf] of produced) info(`${file.padEnd(20)} ${(buf.length / 1024).toFixed(1)} KB`);

  const manifest =
    JSON.stringify(
      {
        "//": [
          "URETILEN DOSYA — elle duzenlenmez.",
          "Uretim: pnpm --filter @kuran/media media",
          "Tek kaynak: scripts/media/hero-source.mp4",
          "Figurlu araliklar plan 20.3 geregi cikarildi; ayrinti build_media.ts basinda.",
        ],
        sourceSha256: sha256(src),
        sourceBytes: src.length,
        durationSeconds: Number(TOTAL.toFixed(2)),
        speed: SPEED,
        eq: EQ,
        segments: SEGMENTS,
        crf: CRF,
        files: [...produced].map(([file, buf]) => ({
          file,
          bytes: buf.length,
          sha256: sha256(buf),
        })),
      },
      null,
      2,
    ) + "\n";

  if (check) {
    let dirty = 0;
    for (const [file, buf] of produced) {
      const path = resolve(OUT_DIR, file);
      // Video kodlamasi bit bazinda tekrarlanabilir degil (x264 surumu, is
      // parcaciklari); boyut toleransi ile karsilastiriliyor.
      if (!existsSync(path)) {
        console.error(`  YOK: ${file}`);
        dirty += 1;
        continue;
      }
      const onDisk = readFileSync(path);
      const drift = Math.abs(onDisk.length - buf.length) / buf.length;
      if (drift > 0.02) {
        console.error(`  FARKLI: ${file} (${String(onDisk.length)} vs ${String(buf.length)} bayt)`);
        dirty += 1;
      }
    }
    if (dirty > 0) fail(`${String(dirty)} dosya farkli — 'pnpm media' calistirin.`);
    info("--check temiz.");
    return;
  }

  const keep = new Set([...produced.keys(), "manifest.json"]);
  for (const name of readdirSync(OUT_DIR)) {
    if (!keep.has(name)) {
      unlinkSync(resolve(OUT_DIR, name));
      info(`silindi (artik uretilmiyor): ${name}`);
    }
  }
  for (const [file, buf] of produced) writeFileSync(resolve(OUT_DIR, file), buf);
  writeFileSync(MANIFEST_FILE, manifest);
  info(`${String(produced.size + 1)} dosya yazildi -> ${OUT_DIR}`);
}

await main();
