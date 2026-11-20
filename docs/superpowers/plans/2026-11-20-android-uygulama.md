# Android uygulaması — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Hedef:** kurankesfi.tr'yi açan, namaz vakti, kıble ve hicri takvim gibi ibadet araçları sunan ve yerel bildirim kuran bir Android uygulaması çıkarmak. Uygulama Google Play'e yüklenebilecek bir AAB olarak teslim edilir.

**Mimari:**
- Capacitor kabuğu `server.url` ile canlı siteyi açar.
- İbadet araçları sitenin `/ibadet` altındaki sayfalarıdır. Hesap mantığı `apps/web/src/lib/ibadet/` içinde saf TypeScript'tir.
- Uygulamaya özgü üç parça yerel Android kodudur: alt şerit, geri tuşu ve harici bağlantılar.
- Bildirim zamanlayıcısı APK'ya gömülü tek bir pakettir (`zamanla.js`). Her sayfaya document-start'ta enjekte edilir ve internetsiz açılışta `offline.html` tarafından da kullanılır.
- Site sayfaları web'de 0 bayt JS kalır.

**Teknoloji:**
- Astro 5, TypeScript.
- `adhan` (namaz vakti hesabı).
- Capacitor (güncel kararlı sürüm) ve eklentileri: `@capacitor/local-notifications`, `@capacitor/geolocation`, `@capacitor/preferences`, `@capacitor/app`.
- Android SDK, JDK 21, Vite (yalnızca `apps/mobile` içinde paketleme için).

**Tasarım dokümanı:** `docs/superpowers/specs/2026-11-20-android-uygulama-design.md`. Bu plan dokümanı gerekçe olarak kullanır, iki dosya birlikte okunur.

## Genel kısıtlar

- Üretimde harici API'ye istek yok (CLAUDE.md kural 5). Vakit cihazda hesaplanır.
- Site sayfaları web'de 0 bayt JS kalır. `script-src` yalnızca mevcut sayfalarda ve `/ibadet/` altında açıktır.
- Hesaplama yöntemi ekranda yazılı olur: "Hesaplama: Diyanet yöntemi (adhan kütüphanesi). Diyanet'in yayımladığı vakitlerle 1-2 dakika fark olabilir."
- Paket adı `tr.kurankesfi.app`, uygulama adı "Kur'an-ı Kerim Keşfi".
- targetSdk Play'in o günkü şartıdır (2026 için API 36 bekleniyor). Görev 1'de doğrulanır.
- Kesin alarm için `SCHEDULE_EXACT_ALARM` kullanılır. `USE_EXACT_ALARM` kullanılmaz. Pil optimizasyonu muafiyeti istenmez.
- Reklam, analitik ve üçüncü taraf SDK yok. Konum cihazdan çıkmaz.
- Kod İngilizce, arayüz metni Türkçe. Renkler `docs/DESIGN.md` token'larından gelir.
- nginx dosyası değiştirilmeden önce `*.bak.<YYYYMMDD>` olarak yedeklenir. Değişiklik canlıya uygulanır ve `docs/DEPLOY_REPORT.md`'ye yazılır.
- Upload anahtarı (keystore) repo dışında durur. Yolu `.env` içinde `ANDROID_KEYSTORE_PATH` değişkeniyle verilir.
- Bildirim kimlikleri: `yyyymmdd * 10 + k`. `k` şöyle dağılır:
  - 0 = imsak, 1 = güneş, 2 = öğle, 3 = ikindi, 4 = akşam, 5 = yatsı
  - 8 = günlük ayet
  - 9 = günlük tekrar

## İnceleme odağı

1. **Gün dönümü ve saat dilimi:** elle seçilen yabancı şehirde (örneğin Londra) vakitler o şehrin saatiyle gösterilir. Bildirimler doğru mutlak anda kurulur. Yatsıdan sonra "sıradaki vakit" yarının imsakıdır. → Görev 2 ve Görev 3'teki testler.
2. **Yüksek enlem:** yaz aylarında Oslo veya Reykjavik'te yatsı veya imsak hesaplanamayabilir (NaN veya Invalid Date). Ekran çökmemeli, "hesaplanamadı" demeli, o vakte bildirim kurulmamalı. → Görev 2 ve Görev 3.
3. **Geçmiş an:** saat 14:00'te planlama yapıldığında o günün imsak ve öğle bildirimi kurulmamalı. "X dakika önce" seçeneği anı geçmişe itiyorsa da kurulmamalı. → Görev 3.
4. **Ayet verisi gelmiyor:** çevrimdışıyken veya `/data/verse/...` 404 dönerken günlük ayet bildirimi metinsiz kurulur ("Günün ayeti: Bakara 153") ve planlama durmaz. → Görev 3.
5. **Pusula sensörü yok veya izin reddedildi:** kıble sayfası açıyı ve statik oku gösterir, hata fırlatmaz. → Görev 5'in elle kontrol adımı.

---

### Task 1: Araç zinciri ve risk denemesi (spike)

Amaç: tasarımdaki riskli varsayımı ilk adımda denemek. Varsayım şu: document-start'ta enjekte edilen kod sayfanın CSP'sine takılmaz ve `window.Capacitor` köprüsü 0-JS sayfalarda da çalışır.

**Dosyalar:**
- Oluştur:
  - `apps/mobile/package.json` (`@kuran/mobile`)
  - `apps/mobile/capacitor.config.ts`
  - `apps/mobile/www/index.html` (boş yer tutucu)
  - `apps/mobile/android/` (`npx cap add android` üretir)
- Değiştir: `docs/DEPLOY_REPORT.md` (SDK yolu ve sürümler)

- [ ] **Adım 1:** JDK 21'i ve Android komut satırı araçlarını `/opt/android-sdk` altına kur. Paketler: `platform-tools`, `platforms;android-36`, `build-tools;36.x`. `ANDROID_HOME=/opt/android-sdk` olarak ayarlanır. Play'in güncel targetSdk şartını kontrol et ve farklıysa sürümü ona göre seç. Disk boşluğu 73 GB, yeterli.
- [ ] **Adım 2:** `apps/mobile` altında Capacitor projesini kur ve `capacitor.config.ts` dosyasını yaz:
  - `appId: "tr.kurankesfi.app"`
  - `appName: "Kur'an-ı Kerim Keşfi"`
  - `server.url: "https://kurankesfi.tr"`
  - `server.errorPath: "offline.html"`
  - `server.allowNavigation: ["kurankesfi.tr", "medya.kurankesfi.tr"]`
- [ ] **Adım 3:** `MainActivity` içinde `WebViewCompat.addDocumentStartJavaScript` ile test kodu enjekte et. Kod şunu çalıştırır: `console.log("inj", typeof window.Capacitor, location.pathname)` ve ardından `navigator.serviceWorker`'ın varlığını kaydeder.
- [ ] **Adım 4:** `./gradlew assembleDebug` çalıştır. Beklenen: `app-debug.apk` üretilir.
- [ ] **Adım 5:** APK'yı kullanıcıya ver. Kullanıcı telefonuna kurar ve `/bakara-suresi/153`'ü açar. `chrome://inspect` veya `adb logcat` çıktısında `inj object /bakara-suresi/153` görünmelidir, CSP ihlali görünmemelidir.
  - **Kod CSP'ye takılırsa:** tasarımdaki yedek plana geç. Service worker kaydı ve bildirim dinleyicisi yalnızca `/ibadet` sayfalarından yapılır, uygulama ilk açılışta `/ibadet`'i bir kez görünmez biçimde yükler. Bu durumu kullanıcıya bildir ve Görev 7'yi ona göre uyarla.
- [ ] **Adım 6:** Commit: `chore(mobil): Capacitor iskeleti ve enjeksiyon denemesi`

### Task 2: İbadet hesap kütüphanesi

**Dosyalar:**
- Oluştur:
  - `apps/web/src/lib/ibadet/vakit.ts`
  - `apps/web/src/lib/ibadet/kible.ts`
  - `apps/web/src/lib/ibadet/hicri.ts`
  - `apps/web/src/lib/ibadet/types.ts`
- Test: `apps/web/src/lib/ibadet/__tests__/ibadet.smoke.ts`. `apps/web/package.json` içindeki `test:smoke` zincirine eklenir.
- Bağımlılık: `apps/web` içine `adhan`.

**Arayüzler (sonraki görevler bunlara dayanır):**
```ts
// types.ts
export type VakitAdi = "imsak" | "gunes" | "ogle" | "ikindi" | "aksam" | "yatsi";
export const VAKITLER: readonly VakitAdi[]; // bu sırayla, indeks = bildirim k değeri
export interface Konum { ad: string; enlem: number; boylam: number; saatDilimi: string /* IANA */ }
export type GunVakitleri = Record<VakitAdi, Date | null>; // null = hesaplanamadı
// vakit.ts
export function gunVakitleri(gun: { yil: number; ay: number; gun: number }, konum: Konum): GunVakitleri;
export function siradakiVakit(simdi: Date, konum: Konum): { ad: VakitAdi; an: Date } | null;
export function aylikImsakiye(yil: number, ay: number, konum: Konum): Array<{ gun: number } & GunVakitleri>;
export function yerelGun(an: Date, saatDilimi: string): { yil: number; ay: number; gun: number };
// kible.ts
export const KABE: { enlem: 21.4225; boylam: 39.8262 };
export function kibleAcisi(enlem: number, boylam: number): number; // derece, kuzeyden saat yönünde, [0,360)
// hicri.ts
export function hicriTarih(an: Date, saatDilimi: string): { gun: number; ay: number; yil: number; ayAdi: string; metin: string };
```

- [ ] **Adım 1: Başarısız testleri yaz.** Mevcut smoke düzeni kullanılır (`check(label, ok)`). Test edilecekler:
  - `kibleAcisi(41.0082, 28.9784)` İstanbul için 151.6 ± 1 derece. `kibleAcisi(39.9334, 32.8597)` Ankara için 160.8 ± 1 derece.
  - `hicriTarih(new Date("2026-03-20T12:00:00Z"), "Europe/Istanbul")` → `{ gun: 1, ay: 10, yil: 1447 }` (1 Şevval 1447).
  - İstanbul, 2026-11-20 için `gunVakitleri`: her vakit Diyanet'in o gün için yayımladığı değere ±2 dakika uyar. Değerleri uygulayıcı bir kez diyanet.gov.tr'den alır ve kaynağı ile tarihini yorum satırına yazarak teste sabitler. Vakitler de sıralı olmalı: imsak < güneş < öğle < ikindi < akşam < yatsı.
  - Saat dilimi: Londra (`Europe/London`) için `gunVakitleri` sonucu `Intl` ile `Europe/London`'da biçimlendirildiğinde öğle 11:00 ile 13:00 arasındadır. Test, sunucunun saat dilimine bakmadan geçmelidir: `TZ=Asia/Tokyo` ile de çalıştırılır.
  - Gün dönümü: `siradakiVakit` İstanbul'da 23:30'da çağrılınca ertesi günün `imsak`'ını döndürür.
  - Yüksek enlem: Oslo, 2026-06-21. Hiçbir alan `Invalid Date` değildir, her alan ya geçerli bir `Date` ya `null`'dır, ve hata fırlatılmaz.
- [ ] **Adım 2:** `pnpm --filter @kuran/web test:smoke` çalıştır. Beklenen: modül bulunamadığı için FAIL.
- [ ] **Adım 3: Uygula.**
  - `vakit.ts`, `adhan` kütüphanesinin `CalculationMethod.Turkey()` yöntemini kullanır. Gün, `konum.saatDilimi`'ndeki yerel tarihtir.
  - `kible.ts` büyük daire başlangıç açısını hesaplar.
  - `hicri.ts` `Intl.DateTimeFormat("tr-TR-u-ca-islamic-umalqura", { timeZone })` kullanır.
- [ ] **Adım 4:** Testi tekrar çalıştır, ayrıca `TZ=Asia/Tokyo` ile bir kez daha çalıştır. Beklenen: ikisi de PASS.
- [ ] **Adım 5:** Commit: `feat(ibadet): vakit, kıble ve hicri tarih hesabı`

### Task 3: Ayarlar ve bildirim planlayıcı

Planlayıcı saf bir fonksiyondur ve hangi bildirimin hangi anda kurulacağını üretir. Capacitor'a dokunan katman incedir ve ayrı durur.

**Dosyalar:**
- Oluştur:
  - `apps/web/src/lib/ibadet/ayarlar.ts`
  - `apps/web/src/lib/ibadet/planla.ts`
  - `apps/web/src/lib/ibadet/uygula.ts`
- Test: `apps/web/src/lib/ibadet/__tests__/planla.smoke.ts` (`test:smoke` zincirine eklenir)
- Bağımlılık: `apps/web` içine `@capacitor/core`, `@capacitor/local-notifications`, `@capacitor/preferences`, `@capacitor/geolocation`. Bunlar yalnızca `/ibadet` betiklerine paketlenir.

**Arayüzler:**
```ts
// ayarlar.ts
export interface IbadetAyarlari {
  konum: Konum | null;
  konumKaynagi: "gps" | "elle" | null;
  vakitBildirimi: Record<VakitAdi, boolean>;   // varsayılan: hepsi false
  dakikaOnce: 0 | 5 | 10 | 15 | 30 | 45;        // varsayılan 0
  ayetSaati: string | null;                     // "08:00" ya da null = kapalı
  tekrarSaati: string | null;                   // "20:00" ya da null = kapalı
  sonPlanlama: string | null;                   // ISO
}
export const VARSAYILAN_AYARLAR: IbadetAyarlari;
export interface AyarDeposu { oku(): Promise<IbadetAyarlari>; yaz(a: IbadetAyarlari): Promise<void> }
export function ayarDeposu(): AyarDeposu; // Capacitor.isNativePlatform() ? Preferences (anahtar "ibadet.ayarlar") : localStorage
// planla.ts
export interface PlanliBildirim { id: number; an: Date; baslik: string; govde: string; url: string }
export interface AyetKaydi { surahId: number; verseNumber: number; surahNameTr: string; surahSlug: string; meal: string | null }
export function vakitPlani(ayar: IbadetAyarlari, simdi: Date, gunSayisi?: number /* 30 */): PlanliBildirim[];
export function ayetPlani(ayar: IbadetAyarlari, simdi: Date, ayetler: Array<AyetKaydi | null> /* gün sırasıyla */): PlanliBildirim[];
export function tekrarPlani(ayar: IbadetAyarlari, simdi: Date, gunSayisi?: number /* 14 */): PlanliBildirim[];
export function gununSiraNo(an: Date, saatDilimi: string, uzunluk: number): number; // yerel yılın günü % uzunluk (bottaki /bugun kuralı, yerel tarih)
// uygula.ts
export function bildirimleriYenile(ayar: IbadetAyarlari, simdi?: Date): Promise<{ kurulan: number; kesin: boolean }>;
```

Sabit metinler:
- **Vakit:** başlık `"<Vakit adı> vakti"`. Gövde ya `"<Konum adı> · <SS:DD>"` ya da `"<N> dakika sonra · <Konum adı>"`. URL `/ibadet`.
- **Ayet:** başlık `"Günün ayeti — <Sure> <N>"`, gövde meal (en çok 180 karakter, sonu `…`) ve ardından `" — Diyanet İşleri"`. Meal yoksa gövde `"Okumak için dokunun"`. URL `/<surahSlug>/<N>`.
- **Tekrar:** başlık `"Tekrar zamanı"`, gövde `"Bugünkü tekrarlarınız sizi bekliyor."`, URL `/gunluk`.

- [ ] **Adım 1: Başarısız testleri yaz.**
  - **Geçmiş an:** saat 14:00'te `vakitPlani` (sadece öğle açık, 2 gün) bugünün öğlesini üretmez, yarının öğlesini üretir.
  - **Dakika önce:** `dakikaOnce: 15` iken bildirimin anı vakitten tam 15 dakika öncedir, kimliği `yyyymmdd*10+2`'dir.
  - **Yüksek enlem:** Oslo, Haziran, yatsı açık. Planda `null` bir vakit için bildirim yoktur ve hata fırlatılmaz.
  - **Sınır:** 30 gün ve 6 vakit açıkken en çok 180 bildirim üretilir ve kimlikler benzersizdir.
  - **Konum yok:** `konum: null` iken `vakitPlani` boş dizi döner.
  - **Ayet:** `ayetPlani`, meal'i `null` olan gün için gövdeyi `"Okumak için dokunun"` yapar. 200 karakterlik meal kırpılır ve gövde `" — Diyanet İşleri"` ile biter.
  - **Gün sırası:** `gununSiraNo(new Date("2026-01-01T00:30:00+03:00"), "Europe/Istanbul", 366)` → 1.
  - **Tekrar:** `tekrarSaati: null` iken `tekrarPlani` boş dizi döner.
- [ ] **Adım 2:** Testleri çalıştır. Beklenen: FAIL.
- [ ] **Adım 3: Uygula.** `uygula.ts` şu sırayla çalışır:
  1. `LocalNotifications.getPending()` ile bekleyen bildirimleri al.
  2. Kimliği bizim aralığımızda olanları iptal et.
  3. `/data/schedule.json` ve gerekli `/data/verse/verse_<s>_<v>.json` dosyalarını `fetch` ile getir. Her başarısız istek o gün için `null` sayılır.
  4. `schedule()` ile bildirimleri kur. `allowWhileIdle: true`, `extra: { url }`.
  5. `checkExactNotificationSetting()` sonucunu `kesin` alanında döndür.
  6. `sonPlanlama` alanını yaz.

  Mealin yeri: `translations` içinde `authorSlug === "diyanet-isleri"` kaydının `text` alanı.
- [ ] **Adım 4:** Testleri çalıştır. Beklenen: PASS. Ardından `pnpm --filter @kuran/web typecheck` temiz geçmeli.
- [ ] **Adım 5:** Commit: `feat(ibadet): ayarlar ve bildirim planlayıcı`

### Task 4: Şehir listesi

**Dosyalar:**
- Oluştur:
  - `scripts/import/geonames_sehirler.ts`
  - `apps/web/public/data/ibadet/sehirler.json` (üretilen dosya, commit edilir)
  - `apps/web/src/lib/ibadet/sehir.ts`
- Test: `ibadet.smoke.ts` içine ekle.

**Arayüz:**
```ts
export function sehirAra(liste: Konum[], sorgu: string, sinir?: number /* 20 */): Konum[]; // normalizeTr ile, önce baştan eşleşme
```

- [ ] **Adım 1:** Testleri yaz:
  - `sehirAra(liste, "ist")` sonucunun ilk elemanı İstanbul'dur.
  - `sehirAra(liste, "IĞDIR")` Iğdır'ı bulur. Türkçe büyük-küçük harf dönüşümü için `~/lib/search/normalize`'daki `normalizeTr` kullanılır.
  - Listede 81 il merkezi vardır.
- [ ] **Adım 2:** İçe alma betiğini yaz. GeoNames `TR.zip` dosyasından il ve ilçe merkezlerini (`PPLA` ve `PPLA2`), `cities15000`'den de dünya başkentlerini (`PPLC`) alır. Ham dosya `cache/geonames/` altına iner. Çıktının her kaydı `{ad, enlem, boylam, saatDilimi}` alanlarını taşır, ad Türkçe adla verilir. Dosyanın başına `"kaynak": "GeoNames, CC BY 4.0"` yazılır. Atıf `/kaynaklar` sayfasına eklenir.
- [ ] **Adım 3:** Betiği çalıştır, ardından testleri çalıştır. Beklenen: PASS. Çıktı 150 KB'ı aşarsa yalnızca il merkezi ve başkentler bırakılır, bu karar DURUM.md'ye yazılır.
- [ ] **Adım 4:** Commit: `feat(ibadet): şehir listesi (GeoNames)`

### Task 5: /ibadet sayfaları

**Dosyalar:**
- Oluştur:
  - `apps/web/src/pages/ibadet/index.astro` (vakitler ve geri sayım)
  - `apps/web/src/pages/ibadet/imsakiye.astro`
  - `apps/web/src/pages/ibadet/kible.astro`
  - `apps/web/src/pages/ibadet/takvim.astro`
  - `apps/web/src/pages/ibadet/zikirmatik.astro`
  - `apps/web/src/pages/ibadet/ayarlar.astro`
  - `apps/web/src/lib/ibadet/sayfa/*.ts` (sayfa başına bir istemci betiği)
  - `apps/web/src/components/IbadetSekmeleri.astro` (sayfalar arası üst sekme)
- Değiştir: `apps/web/src/pages/kaynaklar.astro` (GeoNames ve adhan atfı)

Ortak davranış:
- Her sayfa `Base` düzenini kullanır. Betik `<script>import "~/lib/ibadet/sayfa/<ad>";</script>` biçiminde yüklenir (`gunluk.astro`'daki düzenle aynı).
- Her sayfada `<noscript>` içinde "Bu araç tarayıcınızda JavaScript gerektirir." yazar.
- Yöntem satırı vakit gösteren her sayfada görünür (Genel kısıtlar'daki metin).

Sayfa içerikleri:
- **index:**
  - Konum yoksa "Konumu kullan" düğmesi gösterilir. Uygulamada `@capacitor/geolocation`, tarayıcıda `navigator.geolocation` kullanılır. Yanında şehir arama kutusu olur.
  - Bugünün 6 vakti gösterilir, sıradaki vakit vurgulanır, geri sayım dakikada bir güncellenir.
  - Vakitler `konum.saatDilimi`'nde biçimlendirilir.
  - `null` vakit "hesaplanamadı" olarak yazılır.
  - Konum GPS'ten geliyorsa saat dilimi `Intl.DateTimeFormat().resolvedOptions().timeZone`'dan alınır.
- **imsakiye:** ayın tablosu, önceki/sonraki ay gezinmesi. Ramazan'da başlıkta "Ramazan imsakiyesi" yazar (hicri ay 9).
- **kible:**
  - `kibleAcisi` sonucu sayı olarak yazılır, ayrıca kuzeye göre statik bir SVG ok gösterilir.
  - Pusula `deviceorientationabsolute` olayıyla çalışır. Olay 2 saniye içinde gelmezse "Pusula sensörü bulunamadı; telefonu kuzeye çevirip oku izleyin" yazar.
  - Kalibrasyon uyarısı: "Telefonu 8 çizerek döndürün".
- **takvim:** bugünün hicri tarihi ve bu ayın miladi/hicri tablosu. "Diyanet takviminden bir gün sapabilir" notu yazar.
- **zikirmatik:**
  - Büyük dokunma alanı, sayaç, hedef (33/99/100/özel) ve sıfırla düğmesi.
  - Hedefe ulaşılınca titreşim (`navigator.vibrate(200)`).
  - Durum localStorage'da, `ibadet.zikir` anahtarında saklanır.
- **ayarlar:**
  - Yalnızca uygulamada çalışır. Tarayıcıda "Bildirimler Android uygulamasında" yazar.
  - Ayarlar: vakit başına açma/kapama, `dakikaOnce`, ayet saati, tekrar saati.
  - Kaydedince `bildirimleriYenile` çağrılır.
  - `kesin === false` ise kalıcı uyarı gösterilir: "Bildirimler birkaç dakika gecikebilir — izni aç". Uyarıdaki düğme `changeExactNotificationSetting()` çağırır.
  - Bildirim izni (`requestPermissions`) bir bildirim ilk kez açıldığında istenir.
  - Alttaki "Bildirim gelmiyorsa" açılır bölümünde Xiaomi, Samsung ve Huawei için pil ayarı yolu düz metin olarak verilir.

- [ ] **Adım 1:** Sayfaları ve betikleri yaz.
- [ ] **Adım 2:** `pnpm --filter @kuran/web typecheck` ve `pnpm build:web` çalıştır. Beklenen: hata yok, `dist/ibadet/*.html` oluşur, betikler `/_astro/` altında ayrı dosyadır. `grep -L 'type="module"' apps/web/dist/ibadet*.html apps/web/dist/ibadet/*.html` boş döner (her ibadet sayfası betik yükler). `grep -c 'type="module"' apps/web/dist/bakara-suresi/153.html` 0 döner (içerik sayfasına betik sızmadı).
- [ ] **Adım 3: Elle kontrol** (`pnpm dev`, tarayıcıda):
  - Konum seçilir, vakitler ve geri sayım görünür.
  - Londra seçilince vakitler Londra saatiyle görünür.
  - Masaüstünde kıble sayfasında sensör yok mesajı ve ok çıkar, konsolda hata yoktur (İnceleme odağı 5).
  - Zikirmatik sayfa yenilendikten sonra sayıyı korur.
- [ ] **Adım 4:** Commit: `feat(ibadet): /ibadet sayfaları`

### Task 6: Gizlilik sayfası, nginx ve service worker

**Dosyalar:**
- Oluştur:
  - `apps/web/src/pages/gizlilik.astro`
  - `apps/web/src/pages/sw.js.ts` (build anında üretilen service worker)
  - `apps/web/src/lib/ibadet/sw-kaydet.ts`
- Değiştir:
  - `apps/web/src/components/Attribution.astro` (`/gizlilik` bağlantısı)
  - `infra/nginx/kurankesfi.tr.conf`
  - `scripts/deploy/deploy.sh` (duman testleri)
  - `docs/DEPLOY_REPORT.md`

- [ ] **Adım 1: `/gizlilik` taslağı.** Bölümler:
  - veri sorumlusu (`CONTACT.org` ve iletişim bilgileri `~/lib/site`'tan)
  - toplanmayan veriler: hesap yok, analitik yok, reklam yok
  - iletişim formu (ad, e-posta, mesaj; yalnızca yanıt için)
  - sunucu erişim günlükleri
  - medya alan adı `medya.kurankesfi.tr`
  - konum ve ayarlar yalnızca cihazda kalır, bildirimler cihazda kurulur
  - günlük verisi IndexedDB'de durur

  Taslağı kullanıcıya göster. **Metin onaylanmadan yayınlanmaz.**
- [ ] **Adım 2: Service worker.** `sw.js.ts` bir Astro uç noktasıdır ve `/sw.js` adresinden sunulur.
  - `SURUM` değeri build anının zaman damgasıdır.
  - **Önceden önbelleğe alınanlar:** `/ibadet` sayfaları ve `/data/ibadet/sehirler.json`.
  - **Gezinme isteklerinde ağ öncelikli:** yanıt önbelleğe yazılır, ağ yoksa önbellekten verilir, o da yoksa `/ibadet` verilir.
  - **`/data/` ve `/_astro/` için:** önce önbellekten verilir, arkada güncellenir.
  - `medya.kurankesfi.tr`'ye dokunulmaz.
  - `activate` olayında eski sürüm önbellekleri silinir.

  `sw-kaydet.ts`, `navigator.serviceWorker.register("/sw.js")` çağrısını yapar ve her `/ibadet` sayfasının betiğinden çağrılır.
- [ ] **Adım 3: nginx.** Önce `/www/server/panel/vhost/nginx/kurankesfi.tr.conf.bak.<YYYYMMDD>` yedeğini al. Sonra şu değişiklikleri yap:
  - `$kesif_csp` map'indeki her satıra `worker-src 'self'` ekle. `/harita` ve `/kissa` satırlarında `worker-src 'self' blob:` zaten var.
  - Map'e şu satırı ekle: `~^/ibadet(/|\.html$|$)  "default-src 'none'; script-src 'self'; worker-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"`
  - Yeni bir map ekle, `$kesif_pp`:
    - varsayılan: `"geolocation=(), microphone=(), camera=(), interest-cohort=()"`
    - `~^/ibadet` için: `"geolocation=(self), microphone=(), camera=(), interest-cohort=()"`
  - `Permissions-Policy` başlığı bu değişkeni kullansın.
  - `location = /sw.js { expires -1; }` bloğunu ekle (`add_header` kullanılmaz, dosyadaki uyarıyla aynı gerekçe).
- [ ] **Adım 4: Duman testleri** (`deploy.sh`):
  - `csp_must_have "/ibadet" "script-src 'self'"`
  - `csp_must_have "/" "worker-src 'self'"`
  - `/ibadet` sayfasının `Permissions-Policy` başlığında `geolocation=(self)` olmalı. `/` sayfasının başlığında `geolocation=()` olmalı.
  - Mevcut `csp_must_not_have "/" "script-src"` ve `csp_must_not_have "/bakara-suresi/153" "script-src"` satırları aynen kalır.
- [ ] **Adım 5: Kullanıcı onayı.** nginx farkını ve gizlilik metnini kullanıcıya göster, onay al. Onaydan sonra şunları çalıştır: `cp` → `nginx -t` → yeniden yükleme → `pnpm build` → `pnpm run deploy`. Beklenen: duman testinin tüm satırları geçer.
- [ ] **Adım 6:** Telefonda Chrome ile kontrol: `/ibadet` açılır, ardından uçak modunda tekrar açılır ve sayfa gelir.
- [ ] **Adım 7:** Commit: `feat(ibadet): gizlilik sayfası, service worker, nginx başlıkları`

### Task 7: Uygulama kabuğu, zamanlayıcı paketi ve yerel gezinme

**Dosyalar:**
- Oluştur:
  - `apps/mobile/src/zamanla.ts` (enjekte edilen paket)
  - `apps/mobile/src/offline.ts`
  - `apps/mobile/www/offline.html`
  - `apps/mobile/vite.config.ts`
  - `apps/mobile/android/app/src/main/java/tr/kurankesfi/app/MainActivity.java` (değiştir)
  - `apps/mobile/android/app/src/main/res/layout/activity_main.xml`
  - `apps/mobile/android/app/src/main/res/menu/alt_serit.xml`
- Değiştir: `apps/mobile/android/app/src/main/AndroidManifest.xml`. Eklenecek izinler: `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `VIBRATE`, `RECEIVE_BOOT_COMPLETED`.

Zamanlayıcı ve çevrimdışı paket:
- **`zamanla.ts`** `apps/web/src/lib/ibadet/` modüllerini göreli yolla içe alır ve tek bir IIFE dosyasına (`www/zamanla.js`) paketlenir. Yüklendiğinde iki iş yapar:
  1. **Bildirime dokunma:** `LocalNotifications.addListener("localNotificationActionPerformed", e => location.assign(e.notification.extra.url))`
  2. **Planlama:** `ayarDeposu().oku()` ile ayarları okur. `sonPlanlama` 12 saatten eskiyse `bildirimleriYenile` çağrılır.
  3. **Service worker kaydı:** `sw-kaydet` yalnızca `location.host === "kurankesfi.tr"` iken çağrılır.

  Aynı sayfada iki kez çalışmasın diye `window.__kkZamanla` bayrağı kullanılır.
- **`offline.html` + `offline.ts`:**
  - Son konumla bugünün vakitlerini ve kıble açısını gösterir. Konum yoksa "İlk kullanım için internet gerekir" yazar.
  - Bildirimleri `bildirimleriYenile` ile yeniden kurar.
  - "Tekrar dene" düğmesi `https://kurankesfi.tr`'ye gider.

`MainActivity` içeriği:
- **Enjeksiyon:** `www/zamanla.js` asset olarak okunur ve `addDocumentStartJavaScript` ile `https://kurankesfi.tr` origin'ine enjekte edilir.
- **Alt şerit:** `BottomNavigationView` ile 4 sekme ve hedefleri:
  - Oku → `/`
  - Ara → `/ara`
  - Günlük → `/gunluk`
  - İbadet → `/ibadet`

  Sekme seçimi `bridge.getWebView().loadUrl(...)` ile yapılır. Seçili sekme, sayfa yolundan hesaplanır (`onPageFinished`).
- **Geri tuşu:** `OnBackPressedCallback` ile `webView.canGoBack()` ise geri gidilir, değilse `finish()`.
- **Harici bağlantılar:** `kurankesfi.tr` ve `medya.kurankesfi.tr` dışındaki her gezinme `Intent.ACTION_VIEW` ile sistem tarayıcısında açılır.

- [ ] **Adım 1:** `pnpm --filter @kuran/mobile build` komutu Vite ile `www/zamanla.js` ve `www/offline.js` dosyalarını üretir, ardından `npx cap sync android` çalışır. Beklenen: iki dosya oluşur, `zamanla.js` 60 KB'ın altında kalır (`adhan` dahil).
- [ ] **Adım 2:** `./gradlew assembleDebug`. Beklenen: APK üretilir.
- [ ] **Adım 3: Cihazda elle kontrol** (kullanıcının telefonunda):
  1. 4 sekme çalışır.
  2. Geri tuşu önce geçmişte geri gider, ana sayfada uygulamayı kapatır.
  3. `/kaynaklar` sayfasındaki dış bağlantı Chrome'da açılır.
  4. Ayarlardan öğle "1 dk sonrası" için bir test bildirimi kurulur ve bildirim gelir. Bildirime dokunulunca `/ibadet` açılır.
  5. Telefon yeniden başlatılınca bekleyen bildirimler hâlâ listededir (`getPending`).
  6. Uçak modunda uygulama soğuk açılır: önbellekteki bir sayfa gelir. Önbellek temizlendiyse `offline.html` vakitleri gösterir.
  7. Kesin alarm izni kapatılınca ayarlar sayfasında uyarı görünür.
- [ ] **Adım 4:** Commit: `feat(mobil): yerel şerit, geri tuşu, zamanlayıcı enjeksiyonu, çevrimdışı sayfa`

### Task 8: Yayın paketi ve mağaza hazırlığı

**Dosyalar:**
- Oluştur:
  - `apps/mobile/scripts/release.sh`
  - `apps/mobile/assets/` (simge kaynağı)
  - `docs/mobil/PLAY_KAYDI.md`
- Değiştir:
  - `.env.example` (`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`)
  - `docs/DURUM.md`
  - `docs/PROJE_PLANI.md` (kapsama giriş notu, 2026-11-20)
  - `CLAUDE.md` (Dizin Yapısı'na `apps/mobile/`)
  - `package.json` (`"mobile:release"`)

- [ ] **Adım 1:** Simge ve açılış ekranı `@capacitor/assets` ile `scripts/brand/logo-source.png`'den üretilir. Uyarlanabilir simgenin arka planı DESIGN.md'deki zemin token'ıdır.
- [ ] **Adım 2:** `release.sh` şu sırayla çalışır:
  1. `pnpm --filter @kuran/mobile build` ve `cap sync`.
  2. `versionCode` artırılır. Kaynak: `apps/mobile/android/app/build.gradle`, artırma betik içinde yapılır.
  3. `./gradlew bundleRelease`, keystore `.env`'deki yoldan okunur.
  4. Çıktının yolu yazdırılır.

  Keystore yoksa betik anlaşılır bir hatayla durur ve `keytool` komutunu önerir. **Anahtarı ajan üretmez, kullanıcı üretir.**
- [ ] **Adım 3:** Betiği çalıştır. Beklenen: `app-release.aab`. Ardından `bundletool validate` temiz geçmeli.
- [ ] **Adım 4:** `PLAY_KAYDI.md` dosyasını yaz. İçerik:
  - kısa ve uzun açıklama (Türkçe; Kur'an keşfi önde, ibadet araçları sonra)
  - kategori: Kitaplar ve Kaynaklar
  - Veri Güvenliği yanıtları: yalnızca iletişim formu, ad ve e-posta, iletişim amaçlı, paylaşılmaz, aktarımda şifreli
  - gizlilik URL'si: `https://kurankesfi.tr/gizlilik`
  - kesin alarm gerekçesi: "kullanıcının seçtiği namaz vakitlerinde zamanında hatırlatma"
  - içerik derecelendirme notları
  - ekran görüntüsü listesi
  - adım adım yükleme: iç test → kapalı test → üretim
- [ ] **Adım 5:** `pnpm test` ve `pnpm typecheck` çalıştır. Beklenen: hepsi geçer.
- [ ] **Adım 6:** Commit: `chore(mobil): yayın betiği ve Play kayıt rehberi`

---

## Kullanıcının yapacakları (plan dışında, sırayla)

1. Esfasoft A.Ş. için D-U-N-S numarası almak ve kurumsal Play geliştirici hesabı açmak.
2. Görev 1 ve Görev 7'deki debug APK'larını telefona kurup denemek.
3. Upload keystore'unu `keytool` ile üretmek ve repo dışında saklamak.
4. Görev 6'daki gizlilik metnini onaylamak.
5. AAB'yi Play Console'a yüklemek.
