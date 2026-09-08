# Türkçe meal sesi ve meal takip ışığı — uygulama planı

> **Ajan işçiler için:** ZORUNLU ALT BECERİ: Bu planı görev görev uygulamak için
> superpowers:subagent-driven-development (önerilen) veya
> superpowers:executing-plans kullanın. Adımlar onay kutusu (`- [ ]`) biçimindedir.

**Hedef:** Mehmet Okuyan mealini **ücretsiz, açık ağırlıklı** bir modelle
kullanıcının kendi GPU'sunda seslendirmek ve `/dinle/<sure>` sayfasında meal
çalarken okunan Türkçe kelimeyi ışıklandırmak.

**Mimari:** Üretim SUNUCUDA DEĞİL, kullanıcının GPU'lu makinesinde yapılır —
depodaki `media:ai` hattıyla aynı sözleşme: TypeScript tarafı **kuyruğa yazar**
ve **çıktıyı toplar**, arada duran Python betiği yerel makinede çalışır. Ses
Chatterbox Multilingual ile sentezlenir; Azure'un bedavaya verdiği kelime
damgası burada yok, onun yerine aynı GPU'da **zorlamalı hizalama**
(`ctc-forced-aligner` + MMS) damgayı üretir. Metin bilindiği için bu bir tanıma
değil hizalama işidir: hata payı düşük. Ses R2'ye çıkar, damga `data/` içinde
git'te durur, sayfa Plan 04'ün oynatıcısına üçüncü bir kip ekler.

**Teknoloji:** TypeScript (kuyruk + toplama) · Python 3.10+ / PyTorch CUDA
(yerel makine) · Chatterbox Multilingual (MIT) · ctc-forced-aligner (BSD-2) +
`MahmoudAshraf/mms-300m-1130-forced-aligner` (CC BY-NC 4.0) · Zod · Astro ·
Cloudflare R2

**Spec:** `docs/superpowers/specs/2026-09-07-ses-takip-isigi-design.md`

**Önkoşul:** Plan 04 tamamlanmış olmalı — bu plan onun oynatıcısını, CSP dalını,
`activeWordIndex` işlevini ve `stripFootnoteMarkers` yardımcısını kullanır.

## Genel kısıtlar

- **Sunucu sentez yapmaz.** Sunucuda GPU yok (4 çekirdek, 15 GB RAM, 22 GB boş
  disk). Üretim kullanıcının makinesinde; sunucu yalnız MP3'leri ve damga
  JSON'unu alır. Depoda bunun sözleşmesi zaten var: `scripts/media/ai_queue.ts`
  (`kuyruk/` → yerel üretim → `cikti/` → `collect`).
- **Betik yalnız `/dinle/` altında.** Plan 04'te açılan dal genişletilmez;
  `connect-src 'none'` kalır, damga sayfaya gömülüdür.
- **Tarayıcıya hiçbir model inmez.** PyTorch, Chatterbox, hizalayıcı — hepsi
  yerel makinede; site build'i bunlara bağlı değildir.
- **Meal metni olduğu gibi seslendirilir.** Parantez içi açıklamalar (Okuyan'da
  4615 ayette var) mealin parçasıdır, silinmez.
- **Ayıklanan TEK şey dipnot işaretidir.** Okuyan metninde 4.432 `[n]` işareti
  var (spec §1.7); sentezlenirse ses "köşeli parantez bir" der. Ayıklama körü
  körüne `[\d+]` silmez — siteyle AYNI kural işler (`splitFootnoteMarkers`,
  numarası gerçek dipnota denk gelmeyen 2 işaret düz metin kalır).
- **Seslendirilen metin ile sayfada gösterilen metin AYNI bölmeden çıkar.**
  Ayrı yazılırlarsa ışık kayar. Tek paylaşılan işlev: `@kuran/schema/text_tokens`.
- **Sayı ölçülür, tahmin edilmez.** GPU, süre, bayt ve hizalama doğruluğu ÖNCE
  birkaç ayet üstünde ölçülür, sonra 6236 ayet çalışır.
- **Ses yapay olduğu sayfada yazılır.** Dürüstlük gereği ve Chatterbox çıktısı
  zaten filigranlı: "Türkçe meal sesi yapay seslendirmedir."
- **Tek meal, tek ses.** Bütün ayetler AYNI referans sesle üretilir; yoksa ses
  sureden sureye kayar.
- **`data/**` tek kaynaktır**; künye ve damga JSON'ları script ÜRETİR.
- Kod ve tanımlayıcılar İngilizce, kullanıcıya görünen metin Türkçe.

---

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `docs/KARARLAR.md` (yeni ya da mevcut) | model, ses ve yayın kararının yazılı kaydı |
| `packages/schema/src/text_tokens.ts` (yeni) | `tokenizeTurkish` + `splitFootnoteMarkers` + `stripFootnoteMarkers` — script ve sayfa AYNI işlevleri kullanır |
| `apps/web/src/lib/data.ts` (değişir) | dipnot işlevleri şemadan yeniden dışa aktarılır |
| `packages/schema/src/recitation.ts` (değişir) | meal ses künyesi + meal damga şeması |
| `scripts/media/meal_audio.ts` (yeni) | `queue` / `collect` — sentez YAPMAZ |
| `scripts/media/tts/synth_meal.py` (yeni) | yerel GPU betiği: sentez + hizalama |
| `scripts/media/tts/requirements.txt` (yeni) | yerel makinenin Python bağımlılıkları |
| `scripts/media/lib/segments_from_align.ts` (yeni) | hizalayıcı çıktısı → kelime başlangıçları |
| `scripts/media/lib/__tests__/align.smoke.ts` (yeni) | eşleme testleri |
| `scripts/media/r2_sync.ts` (değişir) | `ses/meal/` yolunu kapsa |
| `scripts/build/build.ts` (değişir) | meal damgasını sure dosyalarına kat |
| `apps/web/src/components/DinleAyet.astro` (değişir) | meal metnini kelimelere böl |
| `apps/web/src/pages/dinle/[surah].astro` (değişir) | kip anahtarı + meal verisi |
| `apps/web/src/lib/dinle/app.ts` (değişir) | üç kip, iki metinde ışık |

### Sözleşme

```
pnpm media:meal:queue            data/ + DB  ->  media/ses/meal/kuyruk/<meal>.jsonl
     ↓  (dosyayı GPU'lu makineye taşı: rsync / scp / paylaşılan disk)
python scripts/media/tts/synth_meal.py kuyruk.jsonl --out cikti/
     ↓  cikti/<sss><vvv>.mp3  +  cikti/<sss><vvv>.json  (kelime damgaları)
     ↓  (çıktı dizinini sunucuya geri taşı)
pnpm media:meal:collect          cikti/ -> media/ses/meal/<meal>/ + data/recitation/*.json
     ↓
pnpm media:r2:push  ->  pnpm build
```

---

### Görev 1: Model, ses ve yayın kararı

Kod yok. Bu bir kapıdır: hangi model, hangi ses, yayımlanacak mı.

**Dosyalar:**
- Oluştur ya da değiştir: `docs/KARARLAR.md`

- [ ] **Adım 1: GPU'yu ÖLÇ**

Yerel makinede:

```bash
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

Kararı belirleyen tek sayı **VRAM**:

| VRAM | Ne çalışır |
|---|---|
| < 4 GB | Yalnız Piper (CPU'da da çalışır) — kalite düşük |
| 4–6 GB | Chatterbox Multilingual, XTTS-v2 |
| 8 GB+ | Yukarıdakiler + F5-TTS Türkçe, rahat toplu üretim |

Sonucu `KARARLAR.md`ye yaz. 4 GB'ın altındaysa bu plan durur; o zaman ücretli
sağlayıcı (Azure, ~$15) yeniden konuşulur.

- [ ] **Adım 2: Üç modeli AYNI ayette karşılaştır**

Ölçmeden seçme. Aday üçü de ücretsiz ve Türkçe destekliyor:

| Model | Lisans | Türkçe | Not |
|---|---|---|---|
| **Chatterbox Multilingual v3** | MIT (ağırlıklar dahil) | resmî, 23 dil | İlk aday. Çıktıya PerTh filigranı gömülü |
| F5-TTS Türkçe (`marduk-ra/F5-TTS-Turkish`) | **CC BY-NC 4.0** | Common Voice 17 ile ince ayar | NC: bu site ticari değil, uygun. Veri kalabalık kaynaklı, tutarsız olabilir |
| XTTS-v2 (Coqui) | **CPML — ticari kullanım YASAK** | 17 dilden biri | Coqui kapandı, bakım yok |
| Piper `tr_TR-dfki` | MIT | tek ses | GPU gerekmez; kalite açıkça düşük, yalnız yedek |

Test metni — Okuyan 2:2, dipnot işareti ayıklanmış hâli:

```
O kitap (Kur'an); onda asla şüphe yoktur. Muttakîler (duyarlı olanlar) için bir yol göstericidir.
```

Chatterbox ile:

```python
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
import torchaudio as ta

model = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
wav = model.generate("O kitap (Kur'an); onda asla şüphe yoktur. Muttakîler (duyarlı olanlar) için bir yol göstericidir.", language_id="tr")
ta.save("chatterbox.wav", wav, model.sr)
```

Üç çıktıyı yan yana dinle. Aranan: **uzun cümlede prozodi bozulmuyor mu, sayı
ve parantez doğru okunuyor mu, 5 ayet üst üste dinlendiğinde ses aynı kalıyor
mu.** Kararı ve gerekçesini `KARARLAR.md`ye yaz.

Beklenti dürüst olsun: bu modeller Azure nöral sesine **yakın** ama birebir
aynı değil. Kararı kulak verir, tablo değil.

- [ ] **Adım 3: Referans sesi seç**

Chatterbox ve XTTS sıfır-atışlı ses klonlar; F5-TTS de referans ister. İki yol:

| Yol | Not |
|---|---|
| **Modelin öntanımlı sesi** (referans vermemek) | En basit ve en güvenli. Chatterbox referanssız da üretir |
| **Kullanıcının kendi kaydı** (10 sn, temiz, tek konuşmacı) | Ses tanıdık olur; izin sorunu yok, ses kullanıcının kendisinin |

**Başkasının sesi klonlanmaz.** Bir spikerin, hocanın ya da tanınmış birinin
sesiyle meal okutmak, o kişinin söylemediği bir sözü söylemiş gibi göstermek
olur (CLAUDE.md kural 4'ün ruhu). İzinli bile olsa bu ayrı bir karardır ve
`KARARLAR.md`ye yazılmadan yapılmaz.

Seçilen referans `scripts/media/tts/referans.wav` olarak durur ve **bütün 6236
ayette aynısı kullanılır** — değişirse ses sureden sureye kayar.

- [ ] **Adım 4: Lisans zincirini yaz**

`docs/KARARLAR.md` içine:

```markdown
## Türkçe meal sesi (karar tarihi: ____)

**Metin:** Mehmet Okuyan meali, CC BY-NC-SA 4.0.
**Model:** ____ (lisans: ____)
**Referans ses:** ____
**Üretilen:** yapay sesle okunmuş MP3 — metnin TÜREV eseri.

| Koşul | Karşılık |
|---|---|
| BY — atıf | Sayfada meal künyesi zaten basılıyor (`Attribution.astro`) |
| NC — ticari değil | Site ticari değil |
| SA — aynı lisansla | Ses de CC BY-NC-SA 4.0 ile yayımlanacak, künyeye yazılacak |
| Değiştirmeden | Metin olduğu gibi okunuyor; parantez içleri dahil. Yalnız `[1]` dipnot İŞARETLERİ ayıklanıyor — bunlar mealin sözü değil, dizgi işareti; sitede de ayrı basılıyor |
| Model lisansı | Chatterbox MIT / F5-TTS-Turkish CC BY-NC / XTTS CPML (ticari yasak) |
| Filigran | Chatterbox çıktısına PerTh filigranı gömülü — duyulmaz, kaldırılmaz |
| Dürüstlük | Sayfada "yapay seslendirme" ibaresi |

**Karar:** [ ] Yayımlanacak   [ ] Yayımlanmayacak   [ ] Şimdilik ertelendi
```

- [ ] **Adım 5: Maliyet — para değil, saat**

Ücretsiz modelde fatura yok; harcanan **GPU saati ve elektrik**. Ölçüm Görev
4'te yapılacak; şimdilik yazılacak beklenti:

- Sentezlenecek metin: **899.947 karakter** (913.243 ham − 13.296 işaret)
- Kelime: 119.050 · tahmini ses: ~13,2 saat
- Chatterbox gerçek zamana yakın üretir; 8 GB sınıfı bir GPU'da toplam üretim
  **6–15 saat** mertebesinde beklenir. Bir gecede biter, kesilirse kaldığı
  yerden devam eder.

- [ ] **Adım 6: İşle**

```bash
git add docs/KARARLAR.md
git commit -m "docs(ses): turkce meal sesi icin model, referans ses ve yayin karari"
```

---

### Görev 2: Dipnot işareti ayıklayıcı ve Türkçe kelime bölücü

İki iş de aynı yerde duruyor çünkü ikisi de aynı kuralı taşıyor: **sentezlenen
metin ile sayfada gösterilen metin birebir aynı bölmeden çıkmalı.** Ayrı
yazılırlarsa bir gün kayarlar ve ışık yanlış kelimede yanar.

Okuyan metninde 4.432 `[n]` dipnot işareti var (spec §1.7). Ayıklanmazsa ses
"köşeli parantez bir" der. Ayıklama körlemesine değil, siteyle AYNI kuralla
yapılır: numarası gerçek bir dipnota denk gelmeyen 2 işaret düz metin kalır —
site de öyle yapıyor.

`splitFootnoteMarkers` ve (Plan 04'te eklenen) `stripFootnoteMarkers` bugün
`apps/web/src/lib/data.ts` içinde ve yalnız Astro tarafından görülüyor. Üretim
scripti de aynı işlevi çağırabilsin diye `@kuran/schema`ya taşınırlar; `data.ts`
ikisini de yeniden dışa aktarır, böylece `Translation.astro` ve
`DinleAyet.astro` hiç değişmez.

**Dosyalar:**
- Oluştur: `packages/schema/src/text_tokens.ts`
- Değiştir: `packages/schema/src/index.ts`
- Değiştir: `apps/web/src/lib/data.ts` (taşı + yeniden dışa aktar)
- Test: `packages/schema/src/__tests__/tokens.smoke.ts`
- Değiştir: `packages/schema/package.json`

**Arayüzler:**
- Üretir:
  - `tokenizeTurkish(text: string): TextToken[]` — `{ text, start, end }`
    (`start`/`end` metindeki karakter aralığı)
  - `splitFootnoteMarkers(text: string, footnoteNumbers: readonly number[]): TextSegment[]`
    (`data.ts`ten taşındı, davranışı değişmez)
  - `stripFootnoteMarkers(text: string, footnoteNumbers: readonly number[]): string`
    — sentez ve `/dinle` sayfası bunu kullanır

- [ ] **Adım 1: Testi yaz**

`packages/schema/src/__tests__/tokens.smoke.ts`:

```ts
/**
 * Turkce kelime bolucu — plan 05, Gorev 2.
 *
 * Calistirma:  pnpm --filter @kuran/schema test:smoke
 */

import { splitFootnoteMarkers, stripFootnoteMarkers, tokenizeTurkish } from "../text_tokens.js";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.error(`  HATA ${label}`);
  }
}

console.log("1. Duz cumle");
{
  const t = tokenizeTurkish("Elif Lam Mim.");
  check("3 kelime", t.length === 3);
  check("noktalama kelimeye yapisir", t[2].text === "Mim.");
  check("aralik dogru", t[0].start === 0 && t[0].end === 4);
}

console.log("2. Parantez ici aciklama korunur");
{
  // Mehmet Okuyan mealinin 2583 ayetinde parantez var; mealin parcasidir, silinmez.
  const t = tokenizeTurkish("Rablerinden (gelen) bir gerçek");
  check("4 kelime", t.length === 4);
  check("parantez ayri kelime degil", t[1].text === "(gelen)");
}

console.log("3. Bosluk cesitleri");
{
  const t = tokenizeTurkish("bir  iki\tüç\nkırk");
  check("cift bosluk, sekme, satir sonu", t.length === 4);
  check("son kelime", t[3].text === "kırk");
  check("aralik metinle uyusur", "bir  iki\tüç\nkırk".slice(t[2].start, t[2].end) === "üç");
}

console.log("4. Bas ve son bosluklari");
{
  const t = tokenizeTurkish("  ortada  ");
  check("tek kelime", t.length === 1);
  check("bosluk kelimeye girmez", t[0].text === "ortada");
}

console.log("5. Bos metin");
check("bos dizi doner", tokenizeTurkish("").length === 0);
check("yalniz bosluk", tokenizeTurkish("   ").length === 0);

console.log("6. Turkce harfler bolunmez");
{
  const t = tokenizeTurkish("İnşâallah şüphesiz ğüzel");
  check("3 kelime", t.length === 3);
  check("İ bozulmaz", t[0].text === "İnşâallah");
}

console.log("7. Tirnak ve kesme");
{
  const t = tokenizeTurkish('"Allah\'ın izni" olmadıkça');
  check("3 kelime", t.length === 3);
  check("kesme isareti bolmez", t[1].text === 'izni"');
}

console.log("8. Dipnot isareti ayiklama");
{
  // Okuyan 2:2 — gercek ornek.
  const text = "O kitap (Kur'an); onda asla şüphe yoktur. Muttakîler[1] (duyarlı olanlar) için bir yol göstericidir.";
  const stripped = stripFootnoteMarkers(text, [1]);
  check("isaret gitti", !stripped.includes("[1]"));
  check("kelime yapisik kaldi", stripped.includes("Muttakîler (duyarlı"));
  check("kelime sayisi degismedi", tokenizeTurkish(stripped).length === tokenizeTurkish(text).length);
}

console.log("9. Dipnotu olmayan isaret DUZ METIN kalir");
{
  // Olculdu: 4.432 isaretin 2'si gercek bir dipnota denk gelmiyor. Site onlari
  // basiyor; ses de okumali, yoksa iki metin ayrisir.
  const text = "birinci[1] ikinci[9] ucuncu";
  const stripped = stripFootnoteMarkers(text, [1]);
  check("bilinen isaret silindi", !stripped.includes("[1]"));
  check("bilinmeyen isaret durdu", stripped.includes("[9]"));
}

console.log("10. Isaret bosluktan sonra gelirse");
{
  // Olculdu: 5 ayette isaretin onunde bosluk var. Silinince cift bosluk kalir;
  // bolucu bosluklari zaten atliyor, kelime sayisi degismemeli.
  const text = "bir iki [1] uc";
  const stripped = stripFootnoteMarkers(text, [1]);
  check("3 kelime kalir", tokenizeTurkish(stripped).length === 3);
  check("son kelime", tokenizeTurkish(stripped)[2].text === "uc");
}

console.log("11. Ayirma islevi tasindi, davranisi ayni");
{
  const segments = splitFootnoteMarkers("bir[1] iki", [1]);
  check("3 parca", segments.length === 3);
  check("ortadaki isaret", segments[1].kind === "marker" && segments[1].number === 1);
  check("bilinmeyen numara ayrilmaz", splitFootnoteMarkers("bir[7] iki", [1]).length === 1);
}

console.log(`\n${String(passed)} gecti, ${String(failures.length)} kaldi`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
```

- [ ] **Adım 2: Testi çalıştır, başarısız olduğunu gör**

`packages/schema/package.json` `test:smoke` scriptinin sonuna
`&& tsx src/__tests__/tokens.smoke.ts` ekle.

Çalıştır: `pnpm --filter @kuran/schema test:smoke`
Beklenen: HATA — `Cannot find module '../text_tokens.js'`

- [ ] **Adım 3: Bölücüyü yaz**

`packages/schema/src/text_tokens.ts`:

```ts
/**
 * Turkce metni kelimelere boler — plan 05.
 *
 * ## Neden burada, neden pipeline'da degil
 *
 * Ayni bolme iki yerde kullaniliyor: TTS damgasini kelimeye baglayan uretim
 * scripti ve sayfaya `<span>` basan Astro build'i. Ayri yazilsalar bir gun
 * kayarlar ve isik yanlis kelimede yanar. @kuran/schema ikisinin de bagimlisi
 * (apps/web yalniz buna bagli), bu yuzden ortak yer burasi.
 *
 * ## Neden yalniz bosluktan boluyoruz
 *
 * Noktalama kelimeye yapisik kalir ("Mim." tek kelimedir). Hizalayici kendi
 * cikti kelimelerinde noktalamayi dusuruyor ama SAYI ve SIRA tutuyor; esleme
 * sirayla yapildigi icin noktalamanin nereye dustugu onemsiz. Esas olan
 * metnin kendi bolmesidir — sayfa da bu bolmeyle `<span>` basiyor.
 * Parantez ici aciklamalar mealin parcasidir, ayri kelime sayilmaz.
 */

export interface TextToken {
  text: string;
  /** Metindeki baslangic karakter indisi (dahil) */
  start: number;
  /** Bitis karakter indisi (haric) */
  end: number;
}

const WHITESPACE = /\s/;

export function tokenizeTurkish(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  let start = -1;
  for (let i = 0; i <= text.length; i += 1) {
    const isBreak = i === text.length || WHITESPACE.test(text[i]);
    if (isBreak) {
      if (start !== -1) {
        tokens.push({ text: text.slice(start, i), start, end: i });
        start = -1;
      }
    } else if (start === -1) {
      start = i;
    }
  }
  return tokens;
}

/**
 * Meal metnindeki dipnot isaretleri — `apps/web/src/lib/data.ts`ten TASINDI.
 *
 * Buraya tasinmasinin tek sebebi paylasim: uretim scripti (@kuran/media) de
 * ayni kurali uygulamak zorunda. Davranis degismedi; `data.ts` bunu yeniden
 * disa aktardigi icin `Translation.astro` hic degismedi.
 *
 * Numarasi GERCEK bir dipnota denk gelmeyen isaret ayrilmaz, duz metin kalir.
 * Olculdu: Okuyan metnindeki 4.432 isaretin 2'si boyle.
 */
export type TextSegment =
  | { kind: "text"; value: string }
  | { kind: "marker"; number: number };

export function splitFootnoteMarkers(
  text: string,
  footnoteNumbers: readonly number[],
): TextSegment[] {
  const known = new Set(footnoteNumbers);
  const segments: TextSegment[] = [];
  const pattern = /\[(\d+)\]/g;
  let cursor = 0;

  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const number = Number(match[1]);
    if (!known.has(number)) continue;
    if (match.index > cursor) {
      segments.push({ kind: "text", value: text.slice(cursor, match.index) });
    }
    segments.push({ kind: "marker", number });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ kind: "text", value: text.slice(cursor) });
  return segments;
}

/**
 * Seslendirilecek ve /dinle sayfasinda gosterilecek metin.
 *
 * Isaret sesli okunursa "koseli parantez bir" duyulur. Ikisinin de AYNI
 * islevden gecmesi sart: sayfadaki kelime kutulari ile seslendirilen kelimeler
 * ayni bolmeden cikmazsa isik kayar.
 */
export function stripFootnoteMarkers(text: string, footnoteNumbers: readonly number[]): string {
  return splitFootnoteMarkers(text, footnoteNumbers)
    .map((segment) => (segment.kind === "text" ? segment.value : ""))
    .join("");
}
```

`packages/schema/src/index.ts`e `export * from "./text_tokens.js";` ekle.

- [ ] **Adım 3b: `data.ts`ten taşı, yeniden dışa aktar**

`apps/web/src/lib/data.ts` içindeki `splitFootnoteMarkers` ve
`stripFootnoteMarkers` gövdelerini ve `TextSegment` tipini SİL, yerine:

```ts
// Dipnot isareti isleme @kuran/schema'ya tasindi (plan 05, Gorev 2): uretim
// scripti de ayni kurali uygulamak zorunda. Cagiranlar degismesin diye
// buradan yeniden disa aktariliyor.
export { splitFootnoteMarkers, stripFootnoteMarkers, type TextSegment } from "@kuran/schema";
```

Doğrula: `grep -rn "FootnoteMarkers" apps/web/src` çıktısında yalnız bu satır
ile `Translation.astro` ve `DinleAyet.astro`nun importları kalmalı — gövde
kalmamalı.

- [ ] **Adım 4: Test geçsin, site kırılmasın**

```bash
pnpm --filter @kuran/schema build
pnpm --filter @kuran/schema test:smoke
pnpm typecheck
pnpm build:web
```
Beklenen: hepsi hatasız. `build:web` özellikle önemli — `data.ts`ten taşınan
işlevin `Translation.astro`yu kırmadığını ancak o gösterir.

Doğrula (dipnot işareti hâlâ sayfada `<sup>` olarak basılıyor mu):

```bash
grep -c "footnote-marker" apps/web/dist/2/2.html
```
Beklenen: 0'dan büyük (Okuyan'ın 2:2 dipnotu var).

- [ ] **Adım 5: İşle**

```bash
git add packages/schema/src/text_tokens.ts packages/schema/src/index.ts \
        packages/schema/src/__tests__/tokens.smoke.ts packages/schema/package.json \
        apps/web/src/lib/data.ts
git commit -m "feat(ses): dipnot isareti ayiklayici ve paylasilan turkce kelime bolucu"
```

---

### Görev 3: Yerel üretim sözleşmesi ve hizalama eşlemesi

Sunucu tarafı iki şey yapar: **kuyruğa yazar**, **çıktıyı toplar**. Arada duran
Python betiği kullanıcının GPU'lu makinesinde çalışır. Hizalayıcı çıktısını
kelime başlangıçlarına çeviren işlev SAFTIR ve testi GPU'suz yazılır.

**Dosyalar:**
- Oluştur: `scripts/media/lib/segments_from_align.ts`
- Oluştur: `scripts/media/tts/synth_meal.py`
- Oluştur: `scripts/media/tts/requirements.txt`
- Oluştur: `scripts/media/tts/README.md`
- Test: `scripts/media/lib/__tests__/align.smoke.ts`
- Değiştir: `scripts/media/package.json`

**Arayüzler:**
- Üretir:
  - `interface AlignedWord { text: string; startMs: number; endMs: number }`
  - `alignmentToStarts(text, words, durationMs): { starts: number[]; unmatched: number }`
    — dizi uzunluğu `tokenizeTurkish(text).length + 1`, Plan 04'teki Arapça
    damgayla AYNI biçim, böylece `activeWordIndex` değişmeden çalışır
- Tüketir: `tokenizeTurkish` (Görev 2)

- [ ] **Adım 1: Testi yaz**

`scripts/media/lib/__tests__/align.smoke.ts`:

```ts
/**
 * Hizalayici ciktisi -> kelime baslangiclari — plan 05, Gorev 3.
 *
 * Calistirma:  pnpm --filter @kuran/media test:smoke
 */

import { alignmentToStarts } from "../segments_from_align.js";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.error(`  HATA ${label}`);
  }
}

console.log("1. Bire bir hizalama");
{
  const r = alignmentToStarts(
    "Elif Lam Mim.",
    [
      { text: "elif", startMs: 100, endMs: 500 },
      { text: "lam", startMs: 600, endMs: 1000 },
      { text: "mim", startMs: 1100, endMs: 1700 },
    ],
    1800,
  );
  check("uzunluk = kelime + 1", r.starts.length === 4);
  check("ilk kelime sifira cekilir", r.starts[0] === 0);
  check("ikinci kelime", r.starts[1] === 600);
  check("son eleman toplam sure", r.starts[3] === 1800);
  check("eslesmeyen yok", r.unmatched === 0);
}

console.log("2. Hizalayici noktalamayi ayri kelime saymaz");
{
  // ctc-forced-aligner cikti kelimelerini bosluktan boluyor ve noktalamayi
  // duserek yaziyor; bizim bolucumuz noktalamayi kelimeye yapisik tutuyor.
  // Sayilar tuttugu surece sira eslemesi yeterli.
  const r = alignmentToStarts(
    "bir, iki (uc)",
    [
      { text: "bir", startMs: 0, endMs: 300 },
      { text: "iki", startMs: 400, endMs: 700 },
      { text: "uc", startMs: 800, endMs: 1200 },
    ],
    1300,
  );
  check("3 kelime + bitis", r.starts.length === 4);
  check("ucuncu kelime", r.starts[2] === 800);
  check("eslesmeyen yok", r.unmatched === 0);
}

console.log("3. Hizalayici kelime atlarsa");
{
  const r = alignmentToStarts(
    "bir iki uc dort",
    [
      { text: "bir", startMs: 0, endMs: 300 },
      { text: "dort", startMs: 1500, endMs: 1900 },
    ],
    2000,
  );
  check("uzunluk korunur", r.starts.length === 5);
  check("eslesmeyen sayildi", r.unmatched === 2);
  check("artan sirali", r.starts.every((v, i, a) => i === 0 || a[i - 1] <= v));
  check("son eleman sure", r.starts[4] === 2000);
}

console.log("4. Hizalayici fazla kelime verirse");
{
  // Sayilar tutmazsa SESSIZCE kirpilmaz: uyusmazlik sayilir ve rapora gider.
  const r = alignmentToStarts(
    "bir iki",
    [
      { text: "bir", startMs: 0, endMs: 300 },
      { text: "iki", startMs: 400, endMs: 700 },
      { text: "uc", startMs: 800, endMs: 1000 },
    ],
    1100,
  );
  check("metin kadar kelime", r.starts.length === 3);
  check("fazlalik isaretlendi", r.unmatched > 0);
}

console.log("5. Hic hizalama gelmezse esit bolunur");
{
  const r = alignmentToStarts("bir iki uc", [], 3000);
  check("esit araliklar", r.starts[0] === 0 && r.starts[1] === 1000 && r.starts[2] === 2000);
  check("hepsi eslesmemis", r.unmatched === 3);
}

console.log("6. Damga sureyi asarsa kirpilir");
{
  const r = alignmentToStarts(
    "bir iki",
    [
      { text: "bir", startMs: 0, endMs: 300 },
      { text: "iki", startMs: 9000, endMs: 9500 },
    ],
    1000,
  );
  check("sure disina tasmaz", r.starts.every((v) => v <= 1000));
}

console.log(`\n${String(passed)} gecti, ${String(failures.length)} kaldi`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
```

- [ ] **Adım 2: Testi çalıştır, başarısız olduğunu gör**

`scripts/media/package.json` `scripts`e:

```json
"test:smoke": "tsx lib/__tests__/align.smoke.ts"
```

Çalıştır: `pnpm --filter @kuran/media test:smoke`
Beklenen: HATA — `Cannot find module '../segments_from_align.js'`

- [ ] **Adım 3: Eşlemeyi yaz**

`scripts/media/lib/segments_from_align.ts`:

```ts
import { tokenizeTurkish } from "@kuran/schema";

/**
 * Zorlamali hizalama ciktisi -> kelime baslangiclari — plan 05.
 *
 * ## Neden hizalama, neden WordBoundary degil
 *
 * Azure damgayi sentezle birlikte veriyordu; acik agirlikli modeller vermiyor.
 * Onun yerine uretilen ses METINLE hizalaniyor. Bu bir TANIMA isi degil:
 * soylenen metin zaten elimizde, model yalnizca hangi milisaniyede hangi
 * kelimenin gectigini isaretliyor. Hata payi tanimaya gore cok dusuk.
 *
 * ## Bicim Plan 04'teki Arapca damgayla AYNI
 *
 * Son eleman son kelimenin bitisidir; uzunluk = kelime sayisi + 1. Boylece
 * `activeWordIndex` iki metinde de degismeden calisiyor.
 *
 * ## Esleme SIRAYLA, metne gore
 *
 * Hizalayici kelimeleri bosluktan bolup noktalamayi duserek yaziyor; bizim
 * bolucumuz noktalamayi kelimeye yapisik tutuyor ("Mim." tek kelime). Metin
 * ayni oldugu icin SAYI ve SIRA tutuyor; metnin kendi bolmesi esastir,
 * hizalayicininki degil. Sayilar tutmazsa fark sessizce yutulmaz: `unmatched`
 * sayilir, cagiran rapora yazar.
 */

export interface AlignedWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface StartsResult {
  starts: number[];
  /** Damgasi gelmeyen (aradegerlenen) kelime sayisi */
  unmatched: number;
}

export function alignmentToStarts(
  text: string,
  words: readonly AlignedWord[],
  durationMs: number,
): StartsResult {
  const tokens = tokenizeTurkish(text);
  const starts = new Array<number>(tokens.length + 1).fill(-1);

  const usable = Math.min(tokens.length, words.length);
  for (let i = 0; i < usable; i += 1) {
    starts[i] = Math.max(0, Math.min(Math.round(words[i].startMs), durationMs));
  }

  let unmatched = starts.slice(0, tokens.length).filter((v) => v === -1).length;
  if (words.length > tokens.length) {
    // Hizalayici metinden fazla kelime buldu: bir yerde ayrisiyoruz.
    unmatched += words.length - tokens.length;
  }

  starts[tokens.length] = durationMs;
  if (tokens.length > 0 && starts[0] === -1) starts[0] = 0;

  let i = 0;
  while (i < tokens.length) {
    if (starts[i] !== -1) {
      i += 1;
      continue;
    }
    let j = i;
    while (j <= tokens.length && starts[j] === -1) j += 1;
    const before = starts[i - 1];
    const after = j <= tokens.length ? starts[j] : durationMs;
    const gap = j - (i - 1);
    for (let k = i; k < j; k += 1) {
      starts[k] = Math.round(before + ((after - before) * (k - (i - 1))) / gap);
    }
    i = j;
  }

  for (let k = 1; k < starts.length; k += 1) {
    if (starts[k] < starts[k - 1]) starts[k] = starts[k - 1];
  }

  return { starts, unmatched };
}
```

- [ ] **Adım 4: Test geçsin**

Çalıştır: `pnpm --filter @kuran/media test:smoke && pnpm typecheck`
Beklenen: BAŞARILI

- [ ] **Adım 5: Yerel makinenin bağımlılıklarını yaz**

`scripts/media/tts/requirements.txt`:

```
# Yerel GPU makinesi — SUNUCUDA KURULMAZ.
# CUDA'li torch'u kendi surumunuze gore kurun:
#   pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
chatterbox-tts
ctc-forced-aligner @ git+https://github.com/MahmoudAshraf97/ctc-forced-aligner.git
soundfile
```

`scripts/media/tts/README.md`:

````markdown
# Yerel seslendirme makinesi

Sunucuda GPU yok; sentez burada yapılır. Sözleşme `media:ai` hattıyla aynı:
kuyruk gelir, çıktı gider.

## Kurulum

```bash
python -m venv .venv && source .venv/bin/activate
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
pip install -r requirements.txt
ffmpeg -version   # kurulu olmalı
```

## Çalıştırma

```bash
python synth_meal.py kuyruk/mehmet-okuyan.jsonl --out cikti/ --ref referans.wav
```

Var olan çıktı ATLANIR: kesilirse aynı komut kaldığı yerden devam eder.

## Çıktı

Ayet başına iki dosya:
- `<sss><vvv>.mp3` — 24 kHz mono, 48 kbps
- `<sss><vvv>.json` — `{ key, durationMs, words: [{ text, startMs, endMs }] }`

Bu dizini sunucuya taşıyıp `pnpm media:meal:collect` çalıştırın.
````

- [ ] **Adım 6: Yerel sentez betiğini yaz**

`scripts/media/tts/synth_meal.py`:

```python
"""Turkce meal sesi — yerel GPU uretimi (plan 05, Gorev 3).

Sunucuda GPU yok; bu betik kullanicinin makinesinde calisir. Sunucu tarafi
yalnizca kuyrugu yazar ve ciktiyi toplar (scripts/media/meal_audio.ts).

NEDEN PARCALAMA VAR
    Okuyan mealinin en uzun ayeti 1306 karakter. Sifir-atisli modeller uzun
    girdide prozodiyi kaybediyor. Metin cumlelerden parcalanip ayri ayri
    sentezleniyor, sonra ARDIS ARDA birlestiriliyor. Parca sinirlarina kisa
    sessizlik konuyor.

NEDEN HIZALAMA VAR
    Azure'un WordBoundary'si burada yok. Uretilen sesi METINLE hizaliyoruz;
    metin bilindigi icin bu tanima degil hizalama isi.

NEDEN AYNI REFERANS
    Butun ayetler ayni referans sesle uretilir; degisirse ses sureden sureye
    kayar.
"""

import argparse
import json
import pathlib
import subprocess
import sys
import tempfile

import torch
import torchaudio as ta

MAX_CHARS = 280          # parca basina; uzun girdide prozodi bozuluyor
GAP_MS = 120             # parcalar arasi sessizlik
SENTENCE_END = (".", "!", "?", "…", ";")


def split_text(text: str) -> list[str]:
    """Cumleden bol; tek cumle de uzunsa virgulden, o da olmazsa kelimeden."""
    if len(text) <= MAX_CHARS:
        return [text]
    parts: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if len(candidate) > MAX_CHARS and current:
            parts.append(current)
            current = word
        else:
            current = candidate
        if current.endswith(SENTENCE_END) and len(current) > MAX_CHARS * 0.6:
            parts.append(current)
            current = ""
    if current:
        parts.append(current)
    return parts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("queue", type=pathlib.Path)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    parser.add_argument("--ref", type=pathlib.Path, default=None,
                        help="referans ses (10 sn). Verilmezse modelin ontanimli sesi")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    from ctc_forced_aligner import (
        generate_emissions, get_alignments, get_spans, load_alignment_model,
        load_audio, postprocess_results, preprocess_text,
    )

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("UYARI: CUDA yok, CPU'da calisiyor — cok yavas olacak", file=sys.stderr)

    model = ChatterboxMultilingualTTS.from_pretrained(device=device)
    align_model, align_tokenizer = load_alignment_model(device, dtype=torch.float16)

    rows = [json.loads(line) for line in args.queue.read_text(encoding="utf8").splitlines() if line.strip()]
    if args.limit:
        rows = rows[: args.limit]

    done = failed = 0
    for index, row in enumerate(rows, start=1):
        mp3_path = args.out / f"{row['file']}.mp3"
        json_path = args.out / f"{row['file']}.json"
        if mp3_path.exists() and json_path.exists():
            continue

        try:
            chunks = split_text(row["text"])
            waves = []
            silence = None
            for chunk in chunks:
                kwargs = {"language_id": "tr"}
                if args.ref is not None:
                    kwargs["audio_prompt_path"] = str(args.ref)
                wav = model.generate(chunk, **kwargs)
                if wav.dim() == 1:
                    wav = wav.unsqueeze(0)
                if silence is None:
                    silence = torch.zeros(1, int(model.sr * GAP_MS / 1000))
                if waves:
                    waves.append(silence)
                waves.append(wav)
            audio = torch.cat(waves, dim=1)

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                ta.save(tmp.name, audio, model.sr)
                wav_path = tmp.name

            # 24 kHz mono 48 kbps mp3 — konusma icin yeterli, 6236 dosyada
            # boyutu asagi cekiyor.
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path,
                 "-ac", "1", "-ar", "24000", "-b:a", "48k", str(mp3_path)],
                check=True,
            )

            duration_ms = int(audio.shape[1] / model.sr * 1000)

            # --- zorlamali hizalama: kelime damgalari ---
            audio_waveform = load_audio(str(mp3_path), align_model.dtype, align_model.device)
            emissions, stride = generate_emissions(align_model, audio_waveform, batch_size=1)
            tokens_starred, text_starred = preprocess_text(
                row["text"], romanize=True, language="tur",
            )
            segments, scores, blank_id = get_alignments(emissions, tokens_starred, align_tokenizer)
            spans = get_spans(tokens_starred, segments, blank_id)
            word_timestamps = postprocess_results(text_starred, spans, stride, scores)

            words = [
                {
                    "text": w["text"],
                    "startMs": int(round(w["start"] * 1000)),
                    "endMs": int(round(w["end"] * 1000)),
                }
                for w in word_timestamps
            ]
            json_path.write_text(
                json.dumps({"key": row["key"], "durationMs": duration_ms, "words": words},
                           ensure_ascii=False),
                encoding="utf8",
            )
            done += 1
        except Exception as error:  # noqa: BLE001 — hangi ayet dustuguyle beraber yaz
            failed += 1
            print(f"HATA {row['key']}: {error}", file=sys.stderr)

        if index % 25 == 0:
            print(f"{index}/{len(rows)} · uretilen {done} · basarisiz {failed}", flush=True)

    print(f"bitti: {done} uretildi, {failed} basarisiz")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
```

**API doğrulaması:** `chatterbox` ve `ctc_forced_aligner` sürümleri değişebilir.
Betiği yazdıktan sonra TEK ayetle çalıştır; imza uyuşmuyorsa paketin kendi
README'sindeki güncel çağrıya uydur, uydurma isim yazma.

- [ ] **Adım 7: İşle**

```bash
git add scripts/media/lib/segments_from_align.ts scripts/media/lib/__tests__/align.smoke.ts \
        scripts/media/tts/ scripts/media/package.json
git commit -m "feat(ses): yerel GPU sentez betigi ve hizalama eslemesi"
```

---

### Görev 4: Kuyruk ve toplama (sunucu tarafı)

Sunucu sentez yapmaz. Bu script kuyruğu yazar, yerel makineden dönen çıktıyı
doğrular ve `data/` ile `media/` içine yerleştirir.

**Dosyalar:**
- Oluştur: `scripts/media/meal_audio.ts`
- Değiştir: `scripts/media/package.json`, kök `package.json`
- Değiştir: `packages/schema/src/recitation.ts`
- Çıktı: `media/ses/meal/kuyruk/<meal>.jsonl`, `media/ses/meal/<meal>/*.mp3`,
  `data/recitation/segments_meal_<meal>.json`, `data/recitation/meal_audio_<meal>.json`

**Arayüzler:**
- Tüketir: `stripFootnoteMarkers`, `tokenizeTurkish` (Görev 2),
  `alignmentToStarts` (Görev 3), `query` (@kuran/pipeline)
- Üretir: `pnpm media:meal:queue` · `pnpm media:meal:collect`

- [ ] **Adım 1: Şemayı ekle**

`packages/schema/src/recitation.ts`ye, `reciter` şemasının altına:

```ts
/** Yapay sesle uretilmis meal kaydi — plan 05. */
export const mealAudio = z.object({
  mealSlug: slug,
  /** "chatterbox-multilingual-v3" */
  model: nonEmptyText,
  modelLicense: nonEmptyText,
  /** "ontanimli" ya da referans kaydin adi */
  voice: nonEmptyText,
  basePath: z.string().regex(/^[a-z0-9]+(\/[a-z0-9-]+)*$/, "gecerli bir yol onu olmali"),
  /** Metnin lisansi ses turevine de gecer (CC BY-NC-SA: ShareAlike) */
  license: nonEmptyText,
  /** Her zaman true: kayit insan sesi degil. Sayfada yazilir. */
  synthetic: z.literal(true),
  verseCount: z.number().int().nonnegative(),
  missingVerses: z.array(z.string().regex(/^\d{1,3}:\d{1,3}$/)),
  totalBytes: z.number().int().nonnegative(),
});
export type MealAudio = z.infer<typeof mealAudio>;

export const mealAudioFile = z.object({ mealAudios: z.array(mealAudio).min(1) });
export type MealAudioFile = z.infer<typeof mealAudioFile>;

/** data/recitation/segments_meal_<meal>.json */
export const mealSegmentFile = z.object({
  mealSlug: slug,
  model: nonEmptyText,
  voice: nonEmptyText,
  generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stats: z.object({
    verseCount: z.number().int().nonnegative(),
    wordCount: z.number().int().nonnegative(),
    /** Hizalayicinin damgalayamadigi, aradegerlenen kelime */
    unmatchedWords: z.number().int().nonnegative(),
  }),
  verses: z.record(z.string().regex(/^\d{1,3}:\d{1,3}$/), verseSegmentList),
});
export type MealSegmentFile = z.infer<typeof mealSegmentFile>;
```

- [ ] **Adım 2: Scripti yaz**

`scripts/media/meal_audio.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Report, closePool, fail, info, query, repoRoot, warn } from "@kuran/pipeline";
import { stripFootnoteMarkers, tokenizeTurkish, mealAudioFile, mealSegmentFile } from "@kuran/schema";
import { alignmentToStarts, type AlignedWord } from "./lib/segments_from_align.js";

/**
 * Turkce meal sesi — kuyruga yaz, ciktiyi topla (plan 05).
 *
 * ============================================================================
 * SOZLESME — media:ai hattiyla AYNI
 * ============================================================================
 *
 *   pnpm media:meal:queue     DB -> media/ses/meal/kuyruk/<meal>.jsonl
 *        ↓  (dosyayi GPU'lu makineye tasi)
 *   python scripts/media/tts/synth_meal.py kuyruk.jsonl --out cikti/
 *        ↓  (cikti dizinini geri tasi: media/ses/meal/cikti/)
 *   pnpm media:meal:collect   cikti -> media/ses/meal/<meal>/ + data/recitation/
 *
 * Bu script HICBIR modeli calistirmaz. Sunucuda GPU yok; uretim kullanicinin
 * makinesinde (kullanici karari 2026-09-07, ucretsiz model istendi).
 *
 * ============================================================================
 * NEDEN DIPNOT ISARETI AYIKLANIYOR
 * ============================================================================
 *
 * Okuyan metninde 4.432 `[n]` dipnot isareti var (3.361 ayette). Ayiklanmadan
 * sentezlenirse ses "koseli parantez bir" der. Ayiklama korlemesine `[\d+]`
 * silmiyor: `stripFootnoteMarkers` siteyle AYNI kurali uyguluyor — numarasi
 * gercek bir dipnota denk gelmeyen 2 isaret duz metin kaliyor. Sayfa da
 * (DinleAyet.astro) ayni islevden geciyor; ikisi ayrisirsa isik kayar.
 *
 * ============================================================================
 * KULLANIM
 * ============================================================================
 *
 *   pnpm media:meal:queue                   butun kuyruk
 *   pnpm media:meal:queue --surah 1 --surah 112    pilot
 *   pnpm media:meal:collect
 *   pnpm media:meal:collect --dry-run       ne toplanacagini yazar
 *
 * Sonra:  pnpm media:r2:push -> pnpm build
 */

/**
 * Seslendirilen meal. Okuyan secildi (docs/KARARLAR.md): Esed'e gore %13 daha
 * kisa; karsiliginda metnindeki 4.432 dipnot isareti ayiklaniyor.
 */
const MEAL_SLUG = "mehmet-okuyan";
const MEAL_ROOT = resolve(repoRoot, "media/ses/meal");
const QUEUE_DIR = resolve(MEAL_ROOT, "kuyruk");
const OUTPUT_DIR = resolve(MEAL_ROOT, "cikti");
const FINAL_DIR = resolve(MEAL_ROOT, MEAL_SLUG);

function args(name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1]) values.push(process.argv[i + 1]);
  }
  return values;
}

function audioKey(surahId: number, verseNumber: number): string {
  return `${String(surahId).padStart(3, "0")}${String(verseNumber).padStart(3, "0")}`;
}

interface MealRow {
  surah_id: number;
  verse_number: number;
  text: string;
  footnote_numbers: number[] | null;
}

async function loadMeal(): Promise<{ key: string; file: string; text: string }[]> {
  // Dipnot NUMARALARI da geliyor: ayiklama siteyle AYNI kurali uygulamali.
  const rows = await query<MealRow>(
    `SELECT v.surah_id, v.verse_number, t.text,
            array_remove(array_agg(f.number), NULL) AS footnote_numbers
       FROM translation t
       JOIN verse v ON v.id = t.verse_id
       JOIN author a ON a.id = t.author_id
       LEFT JOIN footnote f ON f.translation_id = t.id
      WHERE a.slug = $1
      GROUP BY v.surah_id, v.verse_number, t.text
      ORDER BY v.surah_id, v.verse_number`,
    [MEAL_SLUG],
  );
  if (rows.length === 0) fail(`${MEAL_SLUG} meali veritabaninda yok`);
  return rows.map((row) => ({
    key: `${String(row.surah_id)}:${String(row.verse_number)}`,
    file: audioKey(row.surah_id, row.verse_number),
    text: stripFootnoteMarkers(row.text, row.footnote_numbers ?? []),
  }));
}

async function queue(): Promise<void> {
  const surahFilter = args("surah").map(Number);
  const all = await loadMeal();
  const rows = all.filter(
    (r) => surahFilter.length === 0 || surahFilter.includes(Number(r.key.split(":")[0])),
  );

  mkdirSync(QUEUE_DIR, { recursive: true });
  const path = resolve(QUEUE_DIR, `${MEAL_SLUG}.jsonl`);
  writeFileSync(path, `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`, "utf8");

  const chars = rows.reduce((sum, r) => sum + r.text.length, 0);
  const words = rows.reduce((sum, r) => sum + tokenizeTurkish(r.text).length, 0);
  info(
    `kuyruk: ${String(rows.length)} ayet · ${chars.toLocaleString("tr-TR")} karakter · ` +
      `${words.toLocaleString("tr-TR")} kelime -> ${path}`,
  );
  info("simdi: dosyayi GPU'lu makineye tasi ve scripts/media/tts/README.md'yi izle");
}

interface OutputJson {
  key: string;
  durationMs: number;
  words: AlignedWord[];
}

async function collect(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  if (!existsSync(OUTPUT_DIR)) fail(`cikti dizini yok: ${OUTPUT_DIR}`);

  const report = new Report(`meal-audio-${MEAL_SLUG}`);
  const meal = new Map((await loadMeal()).map((r) => [r.file, r]));

  const segments: Record<string, number[]> = {};
  let wordTotal = 0;
  let unmatchedTotal = 0;
  let collected = 0;
  const problems: string[] = [];

  for (const name of readdirSync(OUTPUT_DIR).filter((n) => n.endsWith(".json")).sort()) {
    const file = name.replace(/\.json$/, "");
    const row = meal.get(file);
    if (!row) {
      problems.push(`${name}: mealde karsiligi yok`);
      continue;
    }
    const mp3 = resolve(OUTPUT_DIR, `${file}.mp3`);
    if (!existsSync(mp3)) {
      problems.push(`${row.key}: json var, mp3 yok`);
      continue;
    }
    const parsed = JSON.parse(readFileSync(resolve(OUTPUT_DIR, name), "utf8")) as OutputJson;
    const mapped = alignmentToStarts(row.text, parsed.words, parsed.durationMs);
    segments[row.key] = mapped.starts;
    wordTotal += mapped.starts.length - 1;
    unmatchedTotal += mapped.unmatched;
    if (mapped.unmatched > 0) {
      report.note(`${row.key}: ${String(mapped.unmatched)} kelimeye damga baglanamadi`);
    }
    if (!dryRun) {
      mkdirSync(FINAL_DIR, { recursive: true });
      renameSync(mp3, resolve(FINAL_DIR, `${file}.mp3`));
    }
    collected += 1;
  }

  if (problems.length > 0) {
    for (const problem of problems.slice(0, 10)) warn(problem);
    report.note(`${String(problems.length)} cikti sorunu`);
  }
  info(`toplanan: ${String(collected)} ayet · ${String(unmatchedTotal)} eslesmeyen kelime`);
  if (dryRun) {
    report.write();
    await closePool();
    return;
  }

  // --- damga dosyasi: var olanin ustune EKLENIR (uretim parcali olabilir) ---
  const segPath = resolve(repoRoot, "data/recitation", `segments_meal_${MEAL_SLUG}.json`);
  const previous = existsSync(segPath)
    ? mealSegmentFile.parse(JSON.parse(readFileSync(segPath, "utf8"))).verses
    : {};
  const merged = { ...previous, ...segments };

  const segPayload = {
    mealSlug: MEAL_SLUG,
    model: process.env.MEAL_TTS_MODEL ?? "chatterbox-multilingual-v3",
    voice: process.env.MEAL_TTS_VOICE ?? "ontanimli",
    generatedAt: new Date().toISOString().slice(0, 10),
    stats: {
      verseCount: Object.keys(merged).length,
      wordCount: wordTotal,
      unmatchedWords: unmatchedTotal,
    },
    verses: merged,
  };
  const segChecked = mealSegmentFile.safeParse(segPayload);
  if (!segChecked.success) fail(`damga semasi basarisiz:\n${segChecked.error.message}`);
  writeFileSync(segPath, `${JSON.stringify(segPayload)}\n`, "utf8");

  // --- kunye: elde GERCEKTEN duran dosyalar SAYILIR (reciter_*.json gerekcesi) ---
  const present: string[] = [];
  const missingVerses: string[] = [];
  let totalBytes = 0;
  for (const row of meal.values()) {
    const path = resolve(FINAL_DIR, `${row.file}.mp3`);
    if (existsSync(path)) {
      present.push(row.key);
      totalBytes += statSync(path).size;
    } else {
      missingVerses.push(row.key);
    }
  }
  const audioPayload = {
    mealAudios: [
      {
        mealSlug: MEAL_SLUG,
        model: segPayload.model,
        modelLicense: process.env.MEAL_TTS_LICENSE ?? "MIT",
        voice: segPayload.voice,
        basePath: `ses/meal/${MEAL_SLUG}`,
        license: "CC BY-NC-SA 4.0",
        synthetic: true as const,
        verseCount: present.length,
        missingVerses,
        totalBytes,
      },
    ],
  };
  const audioChecked = mealAudioFile.safeParse(audioPayload);
  if (!audioChecked.success) fail(`kunye semasi basarisiz:\n${audioChecked.error.message}`);
  writeFileSync(
    resolve(repoRoot, "data/recitation", `meal_audio_${MEAL_SLUG}.json`),
    `${JSON.stringify(audioPayload)}\n`,
    "utf8",
  );

  info(
    `kunye: ${String(present.length)} / 6236 ayet · ${(totalBytes / 1024 / 1024).toFixed(1)} MB · ` +
      `${String(missingVerses.length)} eksik`,
  );
  report.write();
  await closePool();
}

const command = process.argv[2];
if (command === "queue") await queue();
else if (command === "collect") await collect();
else fail("kullanim: meal_audio.ts queue|collect");
```

- [ ] **Adım 3: pnpm scriptlerini ekle**

`scripts/media/package.json`:

```json
"meal:queue": "tsx meal_audio.ts queue",
"meal:collect": "tsx meal_audio.ts collect"
```

Kök `package.json`:

```json
"//media:meal": "Turkce meal sesi. Sunucu SENTEZ YAPMAZ: queue kuyrugu yazar, uretim GPU'lu yerel makinede (scripts/media/tts/README.md), collect ciktiyi toplar. Sonra: media:r2:push -> build.",
"media:meal:queue": "pnpm build:packages && pnpm --filter @kuran/media meal:queue",
"media:meal:collect": "pnpm build:packages && pnpm --filter @kuran/media meal:collect",
```

- [ ] **Adım 4: Kuyruğu üret ve ÖLÇ**

```bash
pnpm media:meal:queue
wc -l media/ses/meal/kuyruk/mehmet-okuyan.jsonl
head -1 media/ses/meal/kuyruk/mehmet-okuyan.jsonl | python3 -m json.tool
```

Beklenen: 6236 satır, ilk satır `1:1`.

Beklenen çıktı satırı:

```
kuyruk: 6236 ayet · 899.947 karakter · 119.050 kelime -> .../mehmet-okuyan.jsonl
```

Sayı **913.243 çıkarsa ayıklama bağlanmamıştır** — `loadMeal` içindeki
`stripFootnoteMarkers` atlanmış demektir. Fark tam 13.296 karakter
(4.432 dipnot işareti).

Dipnotlu bir ayetin gerçekten temizlendiğini doğrula:

```bash
grep -m1 '"2:2"' media/ses/meal/kuyruk/mehmet-okuyan.jsonl | grep -c '\[1\]'
```
Beklenen: `0`

- [ ] **Adım 5: `media/` git'e girmiyor mu**

```bash
git check-ignore -v media/ses/meal/kuyruk/mehmet-okuyan.jsonl
```
Beklenen: `.gitignore` satırını gösterir. Göstermiyorsa `media/` kuralını ekle
— 400 MB ses git'e giremez.

- [ ] **Adım 6: İşle**

```bash
git add scripts/media/meal_audio.ts scripts/media/package.json package.json \
        packages/schema/src/recitation.ts
git commit -m "feat(ses): meal sesi kuyruk ve toplama hatti"
```

---

### Görev 5: Pilot ve tam üretim (yerel makine)

Önce birkaç ayet: kulağa nasıl geliyor, hizalama tutuyor mu, ne kadar sürüyor.
Sayılar beğenilmezse 6236 ayet çalıştırılmaz.

- [ ] **Adım 1: Pilot kuyruğu**

```bash
pnpm media:meal:queue --surah 1 --surah 112
```

Beklenen: 11 ayet (Fâtiha 7 + İhlâs 4).

Sonra dipnotlu bir sure de ekle — Bakara'nın ilk ayetlerinde `[1]` var:

```bash
pnpm media:meal:queue --surah 1 --surah 112 --surah 2
```

- [ ] **Adım 2: Yerel makinede üret**

Kuyruk dosyasını taşı, sonra:

```bash
cd scripts/media/tts
python synth_meal.py kuyruk/mehmet-okuyan.jsonl --out cikti/ --limit 15
```

Referans ses seçildiyse `--ref referans.wav` ekle. İlk çalıştırmada model
inecek (birkaç GB); sonra önbellekten gelir.

- [ ] **Adım 3: KULAKLA dinle — asıl kabul testi budur**

```bash
ffplay -autoexit cikti/002002.mp3
```

Denetim listesi:
- **"köşeli parantez bir" DUYULMUYOR.** Duyuluyorsa ayıklama bağlanmamış
  (Görev 4 Adım 4).
- Parantez içi açıklamalar doğal okunuyor, sesli olarak "parantez" denmiyor.
- Uzun ayette (Bakara 2:26 · 470 karakter, parçalanarak üretiliyor) parça
  sınırları sırıtmıyor, tempo düşmüyor.
- 5 ayet üst üste dinlendiğinde **ses değişmiyor**. Değişiyorsa referans ses
  ver (`--ref`) — sıfır-atışlı model referanssız her seferinde başka ses
  üretebilir. Bu, tam üretime geçmeden çözülmeli.

Karar `docs/KARARLAR.md`ye yazılır. Ses beğenilmediyse Görev 1 Adım 2'ye dön,
başka modeli dene — hat model-bağımsız, değişen tek şey `synth_meal.py`.

- [ ] **Adım 4: Hizalamayı ÖLÇ**

```bash
python3 - <<'PY'
import json, pathlib
bad = 0
for p in sorted(pathlib.Path('cikti').glob('*.json')):
    d = json.loads(p.read_text())
    words = d['words']
    if not words:
        print(p.name, 'HIZALAMA YOK'); bad += 1; continue
    if words[-1]['endMs'] > d['durationMs'] + 500:
        print(p.name, 'damga sureyi asiyor'); bad += 1
    if any(b['startMs'] < a['startMs'] for a, b in zip(words, words[1:])):
        print(p.name, 'damga geriye gidiyor'); bad += 1
print('sorunlu dosya:', bad)
PY
```
Beklenen: `sorunlu dosya: 0`

Bir ayeti gözle doğrula: `002002.json`deki 5. kelimenin `startMs`ine sesi
sardır, o kelime duyulmalı.

- [ ] **Adım 5: Süre ve boyutu ÖLÇ, genele vur**

```bash
python3 - <<'PY'
import json, pathlib, subprocess
files = sorted(pathlib.Path('cikti').glob('*.mp3'))
total_bytes = sum(f.stat().st_size for f in files)
total_sec = 0.0
words = 0
for f in files:
    out = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration',
                          '-of','csv=p=0',str(f)], capture_output=True, text=True).stdout.strip()
    total_sec += float(out)
    words += len(json.loads(f.with_suffix('.json').read_text())['words'])
print(f"pilot: {len(files)} ayet · {total_bytes/1024/1024:.1f} MB · {total_sec/60:.1f} dakika · {words} kelime")
print(f"kelime basina: {total_sec/words*1000:.0f} ms · {total_bytes/words:.0f} bayt")
print(f"TAM URETIM (119.050 kelime): {total_sec/words*119050/3600:.1f} saat ses · "
      f"{total_bytes/words*119050/1024/1024:.0f} MB")
PY
```

Beklenen mertebe: ~12–15 saat ses, ~350–450 MB. Çok saparsa mp3 biçimini
(`48k`) gözden geçir.

Üretim hızını da yaz: pilotta N ayet kaç dakikada üretildi → 6236 ayet kaç
saat. `KARARLAR.md`ye geçir.

- [ ] **Adım 6: Pilotu topla ve uçtan uca dene**

Çıktı dizinini sunucuya taşı, sonra:

```bash
pnpm media:meal:collect --dry-run
pnpm media:meal:collect
python3 -c "
import json; d=json.load(open('data/recitation/segments_meal_mehmet-okuyan.json'))
print(d['stats']); print('2:2 damgalari:', d['verses']['2:2'][:6])"
```

Kelime sayısını karşılaştır:

```bash
docker exec kuran-pg psql -U kuran -d kuran -At -c "
SELECT array_length(regexp_split_to_array(
         regexp_replace(t.text, '\[[0-9]+\]', '', 'g'), '\s+'), 1)
FROM translation t JOIN author a ON a.id=t.author_id JOIN verse v ON v.id=t.verse_id
WHERE a.slug='mehmet-okuyan' AND v.surah_id=2 AND v.verse_number=2;"
```
`segments['2:2']` uzunluğu bu sayının **bir fazlası** olmalı.

- [ ] **Adım 7: Tam üretim**

```bash
pnpm media:meal:queue          # 6236 ayetin tamami
# kuyrugu tasi, yerel makinede:
python synth_meal.py kuyruk/mehmet-okuyan.jsonl --out cikti/ --ref referans.wav
```

Bir gece sürer. Kesilirse **aynı komut kaldığı yerden devam eder** — var olan
`.mp3` + `.json` çifti atlanır. Hata alan ayetler `stderr`e yazılır; sonunda
sayıları oku, kalanları yeniden çalıştır.

- [ ] **Adım 8: Kapsamı ÖLÇ**

Çıktıyı sunucuya taşıyıp:

```bash
pnpm media:meal:collect
ls media/ses/meal/mehmet-okuyan/*.mp3 | wc -l      # 6236 olmali
du -sh media/ses/meal/mehmet-okuyan
python3 -c "
import json; d=json.load(open('data/recitation/meal_audio_mehmet-okuyan.json'))
a=d['mealAudios'][0]; print(a['verseCount'], len(a['missingVerses']), a['totalBytes'])
assert a['verseCount']==6236, a['missingVerses'][:10]"
```

Eksik varsa raporu oku (`var/reports/meal-audio-*.md`), o ayetleri `--surah`
ile yeniden kuyruğa al.

- [ ] **Adım 9: İşle**

```bash
git add data/recitation/meal_audio_mehmet-okuyan.json \
        data/recitation/segments_meal_mehmet-okuyan.json docs/KARARLAR.md
git commit -m "feat(ses): turkce meal sesi tam uretimi, kunye ve damgalar"
```

MP3'ler git'e GİRMEZ; R2'ye Görev 6'da çıkacak.

---

### Görev 6: R2'ye çıkarma ve build çıktısı

**Dosyalar:**
- Değiştir: `scripts/media/r2_sync.ts`
- Değiştir: `scripts/build/build.ts`
- Değiştir: `packages/schema/src/recitation.ts` (`staticSurahSegments`e `meals`)
- Değiştir: `apps/web/src/lib/recitation.ts`

- [ ] **Adım 1: R2 kapsamını doğrula**

```bash
grep -n "ses/" scripts/media/r2_sync.ts
pnpm media:r2:check
```

`ses/` önekini olduğu gibi yürüyorsa `ses/meal/...` kendiliğinden kapsanır.
Kârî adına göre filtre varsa `meal` dizinini de ekle.

- [ ] **Adım 2: Yükle ve DOĞRULA**

```bash
pnpm media:r2:push
curl -sI https://medya.kurankesfi.tr/ses/meal/mehmet-okuyan/001001.mp3 | head -1
```
Beklenen: `HTTP/2 200`

- [ ] **Adım 3: Şemaya `meals` ekle**

```ts
export const staticSurahSegments = z.object({
  surahId: z.number().int().positive(),
  reciters: z.record(slug, z.record(z.string(), verseSegmentList)),
  /** meal slug -> ayet -> kelime baslangiclari */
  meals: z.record(slug, z.record(z.string(), verseSegmentList)).default({}),
});
```

- [ ] **Adım 4: Build'i genişlet**

`scripts/build/build.ts` içindeki `emitRecitationSegments`e, kârî döngüsünün
ARDINDAN ve sure dosyalarını yazan döngünün ÖNÜNE:

```ts
  /** meal slug -> ayet -> baslangiclar; sure basina bolunecek */
  const mealsBySurah = new Map<number, Record<string, Record<string, number[]>>>();
  const mealFiles = readdirSync(dir)
    .filter((name) => /^segments_meal_[a-z0-9-]+\.json$/.test(name))
    .sort();
  for (const name of mealFiles) {
    const parsed = mealSegmentFile.safeParse(JSON.parse(readFileSync(resolve(dir, name), "utf8")));
    if (!parsed.success) {
      fail(`data/recitation/${name} sema dogrulamasi basarisiz:\n${parsed.error.message}`);
    }
    const { mealSlug, model, voice, stats, verses } = parsed.data;
    for (const [key, starts] of Object.entries(verses)) {
      const surahId = Number(key.split(":")[0]);
      let entry = mealsBySurah.get(surahId);
      if (!entry) {
        entry = {};
        mealsBySurah.set(surahId, entry);
      }
      entry[mealSlug] ??= {};
      entry[mealSlug][key] = starts;
    }
    info(`meal damgasi: ${mealSlug} (${model}, ${voice}) — ${String(stats.verseCount)} ayet`);
    report.note(
      `Meal sesi damgasi: ${mealSlug} (${model}/${voice}, yapay) — ${String(stats.verseCount)} ayet, ` +
        `${String(stats.unmatchedWords)} kelimeye damga baglanamadi`,
    );
  }
```

`segments_*.json` filtresi `segments_meal_*.json` dosyalarını da yakalar; kârî
döngüsünün başındaki filtreyi daralt:

```ts
    .filter((name) => /^segments_[a-z0-9-]+\.json$/.test(name) && !name.startsWith("segments_meal_"))
```

Sure dosyasını yazan döngüde yükü birleştir:

```ts
  const surahIds = new Set([...bySurah.keys(), ...mealsBySurah.keys()]);
  for (const surahId of [...surahIds].sort((a, b) => a - b)) {
    const payload = {
      surahId,
      reciters: bySurah.get(surahId) ?? {},
      meals: mealsBySurah.get(surahId) ?? {},
    };
    const checked = staticSurahSegments.safeParse(payload);
    if (!checked.success) {
      fail(`ses/segment_${String(surahId)}.json sema dogrulamasi basarisiz:\n${checked.error.message}`);
    }
    emitter.write(`ses/segment_${String(surahId)}.json`, payload);
  }
```

`emitRecitation` içinde, `reciters` toplandıktan sonra künyeyi de ekle:

```ts
  const mealAudios = [];
  for (const name of readdirSync(dir).filter((n) => /^meal_audio_[a-z0-9-]+\.json$/.test(n)).sort()) {
    const parsed = mealAudioFile.safeParse(JSON.parse(readFileSync(resolve(dir, name), "utf8")));
    if (!parsed.success) fail(`data/recitation/${name} sema dogrulamasi basarisiz:\n${parsed.error.message}`);
    mealAudios.push(...parsed.data.mealAudios);
  }
  const payload = { reciters, mealAudios };
```

`staticRecitation` şemasına `mealAudios: z.array(mealAudio).default([])` ekle.

`apps/web/src/lib/recitation.ts`ye:

```ts
export const getMealAudios = once(
  (): MealAudio[] => readJsonOrNull<StaticRecitation>("recitation.json")?.mealAudios ?? [],
);
```

ve hemen altına:

```ts
export interface MealVerseAudio {
  meal: MealAudio;
  url: string;
}

/** Bu ayetin meal sesi. Dosyasi yoksa null — calmayan oynatici basilmaz. */
export function getMealAudio(surahId: number, verseNumber: number): MealVerseAudio | null {
  const meal = getMealAudios()[0];
  if (!meal) return null;
  const key = `${String(surahId)}:${String(verseNumber)}`;
  if (meal.missingVerses.includes(key)) return null;
  return { meal, url: `${MEDIA_BASE}/${meal.basePath}/${audioKey(surahId, verseNumber)}.mp3` };
}
```

- [ ] **Adım 5: Linter denetimini genişlet**

`scripts/build/linter.ts` içindeki damga denetimine meal için ikinci kural:

```ts
  // Meal damgasi <-> meal metninin kelime sayisi. Uyusmazlik, metin degisip
  // sesin eskide kalmasi demektir; isik butun ayet boyunca kayar.
  for (const name of readdirSync(segmentsDir).filter((n) => /^segments_meal_[a-z0-9-]+\.json$/.test(n))) {
    const parsed = mealSegmentFile.parse(JSON.parse(readFileSync(resolve(segmentsDir, name), "utf8")));
    const texts = await query<{ key: string; text: string; numbers: number[] | null }>(
      `SELECT v.surah_id || ':' || v.verse_number AS key, t.text,
              array_remove(array_agg(f.number), NULL) AS numbers
         FROM translation t
         JOIN verse v ON v.id = t.verse_id
         JOIN author a ON a.id = t.author_id
         LEFT JOIN footnote f ON f.translation_id = t.id
        WHERE a.slug = $1
        GROUP BY 1, t.text`,
      [parsed.mealSlug],
    );
    const expected = new Map(
      texts.map((r) => [r.key, tokenizeTurkish(stripFootnoteMarkers(r.text, r.numbers ?? [])).length]),
    );
    const problems: string[] = [];
    for (const [key, starts] of Object.entries(parsed.verses)) {
      const want = expected.get(key);
      if (want === undefined) problems.push(`${key}: mealde yok`);
      else if (starts.length !== want + 1) {
        problems.push(`${key}: ${String(starts.length - 1)} damga, ${String(want)} kelime`);
      }
    }
    if (problems.length > 0) {
      fail(`${name}: ${String(problems.length)} meal damgasi sorunu\n  ${problems.slice(0, 10).join("\n  ")}`);
    }
    info(`meal damga denetimi: ${name} — ${String(Object.keys(parsed.verses).length)} ayet temiz`);
  }
```

- [ ] **Adım 6: Çalıştır ve işle**

```bash
pnpm build:data && pnpm lint:refs
python3 -c "
import json; d=json.load(open('apps/web/public/data/ses/segment_1.json'))
print(list(d['meals']), len(d['meals']['mehmet-okuyan']))"
git add scripts packages apps/web/src/lib/recitation.ts
git commit -m "feat(ses): meal sesini R2'ye cikar ve damgalari build ciktisina kat"
```

---

### Görev 7: Sayfada üç kip ve meal ışığı

**Dosyalar:**
- Değiştir: `apps/web/src/components/DinleAyet.astro`
- Değiştir: `apps/web/src/pages/dinle/[surah].astro`
- Değiştir: `apps/web/src/lib/dinle/app.ts`
- Değiştir: `apps/web/src/styles/global.css`

- [ ] **Adım 1: Meal metnini ayıkla ve kelimelere böl**

`DinleAyet.astro` iki yeni prop alır ve metni sentezle AYNI işlevden geçirir:

```astro
---
import { stripFootnoteMarkers, tokenizeTurkish } from "@kuran/schema";

interface Props {
  // ... mevcut alanlar
  translation: string | null;
  /** Meal metnindeki [n] isaretlerinden hangileri gercek dipnot */
  footnoteNumbers: readonly number[];
}

const { translation, footnoteNumbers } = Astro.props;

/**
 * Sentezlenen metnin AYNISI. Dipnot isaretleri /dinle sayfasinda
 * gosterilmiyor — burasi dinleme sayfasi; dipnotlar ayet ve sure
 * sayfalarinda durmaya devam ediyor.
 */
const spoken = translation === null ? null : stripFootnoteMarkers(translation, footnoteNumbers);
const mealTokens = spoken === null ? [] : tokenizeTurkish(spoken);
---

{
  spoken !== null && (
    <p lang="tr" class="dinle-meal">
      {mealTokens.map((token, index) => (
        <span class="dinle-meal-kelime" data-i={String(index)}>
          {token.text}{" "}
        </span>
      ))}
    </p>
  )
}
```

Ayıklama ve bölme, damgayı üreten scriptle AYNI işlevler (Görev 2'nin gerekçesi).

- [ ] **Adım 2: Kip anahtarını ekle**

`[surah].astro` oynatıcı çubuğuna:

```astro
      <fieldset class="dinle-kip">
        <legend class="sr-only">Ne çalınsın</legend>
        <label><input type="radio" name="dinle-kip" value="arapca" checked /> Arapça</label>
        <label><input type="radio" name="dinle-kip" value="meal" /> Meal</label>
        <label><input type="radio" name="dinle-kip" value="ardisik" /> Arapça + meal</label>
      </fieldset>
```

Sayfanın frontmatter'ına meal metnini ve sesini ekle (`getMealAudio` Görev
6'da yazıldı). Meal, `getSurahTranslation` ile alınır — dipnot numaraları
oradan geliyor:

```ts
import { getSurahTranslation } from "~/lib/data";
import { getMealAudio } from "~/lib/recitation";

const MEAL_SLUG = "mehmet-okuyan";
const mealAudio = getMealAudio(surahId, 1);
const mealText = getSurahTranslation(MEAL_SLUG, surahId);
const mealByVerse = new Map(
  (mealText?.verses ?? []).map((v) => [v.verseNumber, v]),
);
```

ve `verses` eşlemesinde Plan 04'teki `translation` alanını bununla değiştir:

```ts
    translation: mealByVerse.get(verse.verseNumber)?.text ?? null,
    footnoteNumbers: (mealByVerse.get(verse.verseNumber)?.footnotes ?? []).map((f) => f.number),
    mealAudioUrl: getMealAudio(surahId, verse.verseNumber)?.url ?? null,
```

Doğrula: `grep -n "export function getSurahTranslation" apps/web/src/lib/data.ts`
— dönen şekil `{ verses: { verseNumber, text, footnotes }[] }` olmalı
(`staticSurahTranslation`, `packages/schema/src/static_data.ts:97`).

Gömülü veriye meal alanlarını ekle:

```ts
const islandData = {
  surahId,
  reciterSlug: reciter?.slug ?? null,
  mealSlug: mealAudio?.meal.mealSlug ?? null,
  verses: verses.map((v) => ({
    key: v.key,
    url: v.audioUrl,
    starts: segments?.reciters?.[reciter?.slug ?? ""]?.[v.key] ?? null,
    mealUrl: v.mealAudioUrl,
    mealStarts: segments?.meals?.[mealAudio?.meal.mealSlug ?? ""]?.[v.key] ?? null,
  })),
};
```

Sayfa başlığının altına yapay ses ibaresi (zorunlu):

```astro
{
  mealAudio !== null && (
    <p class="dinle-uyari">
      Türkçe meal sesi <strong>yapay seslendirmedir</strong>; insan kaydı değildir.
      Meal: {mealAudio.meal.mealSlug} — {mealAudio.meal.license}.
    </p>
  )
}
```

- [ ] **Adım 3: Adayı üç kipe genişlet**

`app.ts` başına, `IslandVerse` arayüzüne iki alan:

```ts
interface IslandVerse {
  key: string;
  url: string | null;
  starts: number[] | null;
  mealUrl: string | null;
  mealStarts: number[] | null;
}

type Mode = "arapca" | "meal" | "ardisik";
/** Su an calan sey: ardisik kipte ayet icinde arapca -> meal diye ilerler. */
type Phase = "arapca" | "meal";
```

`start()` içinde `current` ve `activeVerseNode` yanına:

```ts
  let mode: Mode = "arapca";
  let phase: Phase = "arapca";

  function sourceFor(verse: IslandVerse, wanted: Phase): { url: string | null; starts: number[] | null } {
    return wanted === "meal"
      ? { url: verse.mealUrl, starts: verse.mealStarts }
      : { url: verse.url, starts: verse.starts };
  }

  /** Bu kipte calinabilecek ilk asama; hicbiri yoksa null. */
  function firstPhase(verse: IslandVerse): Phase | null {
    if (mode !== "meal" && verse.url !== null) return "arapca";
    if (mode !== "arapca" && verse.mealUrl !== null) return "meal";
    return null;
  }
```

`setVerse`i asamayi da alacak sekilde degistir:

```ts
  function setVerse(index: number, autoplay: boolean): void {
    current = Math.max(0, Math.min(index, playable.length - 1));
    const verse = playable[current];
    const next = firstPhase(verse);
    if (next === null) {
      // Sessiz kirilma olmasin: neden atlandigi yazilir.
      status.textContent = `${verse.key} bu kipte çalınamıyor, atlandı`;
      if (current + 1 < playable.length) setVerse(current + 1, autoplay);
      return;
    }
    phase = next;
    clearWord();
    activeVerseNode?.classList.remove("is-playing");
    activeVerseNode = verseNode(verse.key);
    activeVerseNode?.classList.add("is-playing");
    status.textContent = `${verse.key} — ${phase === "meal" ? "meal" : "Arapça"}`;
    const source = sourceFor(verse, phase);
    if (source.url !== null) audio.src = source.url;
    audio.playbackRate = Number(speed.value);
    if (follow.checked && activeVerseNode) {
      activeVerseNode.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    }
    if (autoplay) void audio.play();
  }
```

`tick()` içindeki damga ve secici artik asamadan gelir:

```ts
  function tick(): void {
    const verse = playable[current];
    const { starts } = sourceFor(verse, phase);
    if (starts && activeVerseNode) {
      const index = activeWordIndex(starts, audio.currentTime * 1000);
      const selector = phase === "meal" ? ".dinle-meal-kelime" : ".dinle-kelime";
      if (index >= 0) {
        const node = activeVerseNode.querySelector<HTMLElement>(`${selector}[data-i="${String(index)}"]`);
        if (node !== activeWordNode) {
          clearWord();
          node?.classList.add("is-active");
          activeWordNode = node;
        }
      } else {
        clearWord();
      }
    }
    frame = requestAnimationFrame(tick);
  }
```

`ended` isleyicisi ardisik kipte ayni ayetin mealine gecer:

```ts
  audio.addEventListener("ended", () => {
    clearWord();
    if (repeat.checked) {
      audio.currentTime = 0;
      void audio.play();
      return;
    }
    const verse = playable[current];
    if (mode === "ardisik" && phase === "arapca" && verse.mealUrl !== null) {
      phase = "meal";
      status.textContent = `${verse.key} — meal`;
      audio.src = verse.mealUrl;
      void audio.play();
      return;
    }
    if (current + 1 < playable.length) setVerse(current + 1, true);
    else {
      activeVerseNode?.classList.remove("is-playing");
      status.textContent = "Sure bitti";
    }
  });
```

Kip anahtari:

```ts
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="dinle-kip"]')) {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      mode = input.value as Mode;
      const wasPlaying = !audio.paused;
      audio.pause();
      setVerse(current, wasPlaying);
    });
  }
```

`playable` suzgeci de genisler — meal kipinde yalniz Arapca sesi olan ayet
yeterli degil:

```ts
  const playable = data.verses.filter((v) => v.url !== null || v.mealUrl !== null);
```

- [ ] **Adım 4: Stil**

```css
.dinle-meal-kelime.is-active { background-color: var(--vurgu-zemin); border-radius: 0.2rem; }
.dinle-kip { display: flex; gap: 0.75rem; border: 0; padding: 0; margin: 0; }
.dinle-uyari { font-size: 0.9rem; color: var(--metin-ikincil); }
```

- [ ] **Adım 5: Derle ve elle dene**

```bash
pnpm build && pnpm --filter @kuran/web preview
```

Denetim listesi (`/dinle/1`):
- "Meal" kipinde Türkçe ses çalar, Türkçe kelimeler ışıklanır, Arapça'da ışık YOK.
- "Arapça + meal" kipinde önce kıraat, hemen ardından aynı ayetin meali çalar.
- Kip değişince çalan ses durur ve yeni kip baştan başlar.
- Betik kapalıyken sayfa yine okunur, ayet altındaki Arapça oynatıcı çalışır.
- "yapay seslendirmedir" ibaresi görünür.

- [ ] **Adım 6: İşle ve yayınla**

```bash
pnpm typecheck && pnpm test && pnpm lint:refs
git add apps/web/src
git commit -m "feat(ses): meal takip isigi ve uc dinleme kipi"
pnpm deploy && pnpm deploy:smoke
```

---

### Görev 8: Belge devri

**Dosyalar:**
- Değiştir: `docs/DURUM.md`, `docs/BACKLOG.md`, `CLAUDE.md`

- [ ] **Adım 1: `docs/DURUM.md`**

```markdown
### Türkçe meal sesi (2026-__-__)

| Konu | Yer |
|---|---|
| Sunucu tarafı | `scripts/media/meal_audio.ts` · `pnpm media:meal:queue` / `media:meal:collect` — SENTEZ YAPMAZ |
| Üretim yeri | **Kullanıcının GPU'lu makinesi** — sunucuda GPU yok |
| Model | ____ (Chatterbox Multilingual v3 / F5-TTS-Turkish / …), lisans ____ |
| Yerel betik | `scripts/media/tts/synth_meal.py` (+ `README.md`, `requirements.txt`) |
| Hizalayıcı | `ctc-forced-aligner` (BSD-2) + `MahmoudAshraf/mms-300m-1130-forced-aligner` (CC BY-NC) |
| Ses | referans: ____, mp3 24 kHz 48 kbps mono |
| Künye | `data/recitation/meal_audio_mehmet-okuyan.json` (script ÜRETİR) |
| Damga | `data/recitation/segments_meal_mehmet-okuyan.json` |
| Barındırma | R2 → `medya.kurankesfi.tr/ses/meal/mehmet-okuyan/<sss><vvv>.mp3` |
| Bölücü | `packages/schema/src/text_tokens.ts` — script ve sayfa AYNI işlevi kullanır |
| Dipnot ayıklama | `stripFootnoteMarkers` (aynı dosya; `data.ts`ten taşındı) |

**Ücretsiz model seçildi, Azure değil** (kullanıcı kararı 2026-09-07). Azure
kelime damgasını `WordBoundary` ile bedava veriyordu ve ~$15 tutuyordu; açık
ağırlıklı modelde damga yok, onun yerine aynı GPU'da zorlamalı hizalama
çalışıyor. Metin bilindiği için bu tanıma değil hizalama işi: `alignmentToStarts`
hizalayıcı çıktısını Plan 04'teki Arapça damgayla AYNI biçime çeviriyor
(`starts[]`, son eleman bitiş), böylece `activeWordIndex` iki metinde de
değişmeden çalışıyor.

**Üretim sunucuda yapılmıyor.** Sözleşme `media:ai` hattıyla aynı: `queue`
kuyruğu yazar, kullanıcı GPU'lu makinesinde üretir, `collect` toplar. Sunucuda
PyTorch, model ağırlığı, CUDA yok ve olmayacak.

**Meal ışığı Arapça'ya bağlı değil.** Meal cümle çevirisidir; kelime sırası
Arapça ile örtüşmez. Üç kip var, ışık her zaman ÇALAN metinde yanar.

**Okuyan seçildi, Esed değil** (kullanıcı kararı 2026-09-07): %13 daha kısa ve
ucuz. Karşılığı, metnindeki 4.432 dipnot işaretinin sentezden önce
ayıklanması. Esed'in metninde `[` de rakam da yok; seçilseydi bu iş
olmayacaktı. `/dinle` sayfasında dipnot işareti gösterilmiyor; ayet ve sure
sayfalarında olduğu gibi duruyor.

**Ölçülen:** ____ ayet · ____ MB · ____ saat ses · ____ saat GPU · ____ kelimeye
damga bağlanamadı.
```

- [ ] **Adım 2: `docs/BACKLOG.md`**

"Meal sesi (Türkçe) yok" maddesini KAPAT. Yeni açık maddeler:
- Tek meal seslendirildi; diğer 22 meal için ses yok (her biri ~400 MB + bir
  gecelik GPU).
- Meal sesi tercihi kalıcı değil (ayarlar arayüzü yok).
- Üretim yeniden çalıştırılacaksa GPU'lu makine gerekir; sunucu tek başına
  meal sesi üretemez.

- [ ] **Adım 3: `CLAUDE.md`**

Medya bölümüne iki satır: (1) meal sesi CC BY-NC-SA türevi olarak aynı lisansla
yayımlanır ve sayfada "yapay seslendirme" ibaresi zorunludur; (2) ses üretimi
`media:ai` gibi YEREL makinede yapılır — sunucu model çalıştırmaz.

- [ ] **Adım 4: İşle**

```bash
git add docs CLAUDE.md
git commit -m "docs(ses): turkce meal sesi devri"
```

---

## Bitiş ölçütü

- `/dinle/2` sayfasında "Meal" kipi Türkçe sesi çalıyor ve Türkçe kelimeler
  sırayla ışıklanıyor.
- Üretimin tamamı ücretsiz açık ağırlıklı bir modelle, kullanıcının kendi
  GPU'sunda yapıldı; sunucuda model çalışmadı, fatura çıkmadı.
- `data/recitation/meal_audio_mehmet-okuyan.json` içindeki `verseCount`
  gerçekten duran dosya sayısı (6236 hedef).
- `pnpm lint:refs` meal damgası ile ayıklanmış meal metninin kelime sayısını
  karşılaştırıp temiz geçiyor.
- 2:2 sesinde "köşeli parantez bir" duyulmuyor; sayfadaki kelime kutuları ile
  seslendirilen kelimeler birebir örtüşüyor.
- 5 ayet üst üste dinlendiğinde ses değişmiyor.
- Sayfada "yapay seslendirmedir", meal lisansı ve model künyesi görünüyor.
- `docs/KARARLAR.md` modeli, referans sesi, GPU'yu ve ölçülen süreleri kayda
  geçirmiş.
