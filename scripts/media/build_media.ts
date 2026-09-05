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
 * tempo olur. minterpolate=blend kare tekrarindan dogan takilmayi siler.
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
const WINDOWS: readonly [number, number, string][] = [
  // 3,10'dan sonra vadide Hz. Adem beliriyor. 1,80'den once kare siyah.
  [1.8, 3.1, "dunya uzaydan, atmosfere inis, nehir vadisi"],
  // 7,25'te gemi onunde figur var; 8,50'de kiyidaki figur beliriyor.
  [7.3, 8.45, "gemi tufanda, yagmur duvari"],
  // 10,25'te kadrajda figur var; 11,45'te Hz. Yunus suya batmaya basliyor.
  [10.3, 11.3, "yarilan deniz, icinden gunes"],
  // 13,80'e kadar balinanin ustunde figur duruyor; 18,30'dan sonra fade.
  [13.9, 18.3, "col safagi, kervan, sehir, vahiy isigi, dunya"],
];

/** Parcalar arasi gecis suresi. */
const XFADE = 0.6;

/**
 * Oynatma hizi.
 *
 * 2026-09-05 ucuncu tur: kullanici "cok hizli akiyor" dedi. Pencereler
 * figursuz araliklarla sinirli (1,3 + 1,15 + 1,0 + 4,4 sn ham); UZATILAMAZ,
 * cunku hemen bitisiginde insan figuru var (plan 20.3). O yuzden hiz
 * dusuruldu: 0,75 -> 0,5. Ham 7,85 sn -> ekranda ~14,5 sn; sahne basina
 * ~2,3 sn'den ~3,6 sn'ye cikiyor. minterpolate ara kare urettigi icin
 * yavaslatma takilma yapmiyor.
 */
const SPEED = 0.5;

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
const CRF = 30;

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
const stretched = (w: readonly [number, number, string]): number => (w[1] - w[0]) / SPEED;
const TOTAL = WINDOWS.reduce((a, w) => a + stretched(w), 0) - XFADE * (WINDOWS.length - 1);

/** Parcalari xfade zinciriyle birlestirir; cikti sessizdir (-an). */
function buildCut(target: string): void {
  const inputs: string[] = [];
  for (const [start, end] of WINDOWS) {
    inputs.push("-ss", String(start), "-to", String(end), "-i", SOURCE);
  }

  const labels = WINDOWS.map((_, i) => String.fromCharCode(97 + i));

  /*
   * Zincir sirasi onemli:
   *   setpts       once zamani gerer (0,75 hiz = PTS / 0,75)
   *   minterpolate gerilmeden dogan kare tekrarini harmanlayarak siler;
   *                blend secildi, mci hareketli suda hayalet birakiyordu
   *   eq           golgeleri kaldirir (bkz. dosya basi)
   *   format       xfade yuv420p bekler
   */
  const parts = labels.map(
    (l, i) =>
      `[${String(i)}:v]setpts=(PTS-STARTPTS)/${String(SPEED)},` +
      `minterpolate=fps=24:mi_mode=blend,${EQ},format=yuv420p[${l}]`,
  );

  // Her xfade'te toplam sure kadar ilerlenir, gecis payi geri alinir.
  let running = stretched(WINDOWS[0]!);
  let prev = labels[0]!;
  for (let i = 1; i < labels.length; i += 1) {
    const offset = running - XFADE;
    const out = i === labels.length - 1 ? "v" : `x${String(i)}`;
    parts.push(
      `[${prev}][${labels[i]!}]xfade=transition=fade:duration=${String(XFADE)}:offset=${offset.toFixed(3)}[${out}]`,
    );
    running = running + stretched(WINDOWS[i]!) - XFADE;
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
    `${String(WINDOWS.length)} figursuz pencere · hiz ${String(SPEED)}x -> ${TOTAL.toFixed(2)} sn`,
  );
  for (const [start, end, what] of WINDOWS) {
    info(`  ${start.toFixed(2).padStart(5)}-${end.toFixed(2)}s  ${what}`);
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

  const darkest = profile.reduce((a, b) => (b.y < a.y ? b : a));
  if (darkest.y < MIN_Y) {
    fail(
      `${darkest.at.toFixed(1)}s karesi cok karanlik (YAVG ${darkest.y.toFixed(0)}, esik ${String(MIN_Y)}). ` +
        "Pencere sinirlarini veya EQ gamma degerini gozden gecirin.",
    );
  }

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
        windows: WINDOWS.map(([start, end, note]) => ({ start, end, note })),
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
