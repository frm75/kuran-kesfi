# Android uygulaması (Google Play) — tasarım

Tarih: 2026-11-20 · Durum: taslak, kullanıcı onayı bekliyor

## Niyet

kurankesfi.tr Google Play'de bir Android uygulaması olarak yayınlanacak.
**Uygulamanın merkezi Kur'an keşfidir.** Namaz vakitleri, kıble ve benzeri ibadet
araçları yalnızca ektir. Kullanıcıya göre uygulamanın siteye üstünlüğü
**bildirimlerdir**: ezan vakti, günlük ayet, günlük tekrar hatırlatması.

Kapsam notu: CLAUDE.md kural 7 kapsamı dondurur. Bu iş planda yoktu, kapsama
kullanıcının açık talebiyle (2026-11-20) girdi. PROJE_PLANI'na bir satır olarak işlenir.

## Hedefler

1. Play Store'da yayında, kurulabilir bir Android uygulaması.
2. Uygulamanın içi canlı kurankesfi.tr'dir. Site güncellenince uygulama da
   güncellenir, içerik değişikliği için mağazaya yeni sürüm gerekmez.
3. İbadet araçları: namaz vakitleri, imsakiye, kıble pusulası, hicri takvim, zikirmatik.
4. Yerel bildirimler: ezan vakitleri, günlük ayet, günlük tekrar hatırlatması.
5. Çevrimdışı çalışma: ibadet araçları her zaman açılır, daha önce okunan sayfalar da açılır.

## Hedef dışı (bu sürümde yok)

- iOS / App Store.
- Dua ve zikir metin içeriği. Kaynak gerektirir (kural 4), ayrı bir karardır.
- Tüm içeriği uygulamaya gömmek. B yaklaşımı, ileride "tümünü indir" olarak eklenebilir.
- Hesap, senkron, sunucu tarafı push bildirimi.
- Ezan sesi kaydı. Bildirimde sistemin sesi kullanılır, ezan sesi ilk yayın sonrasına kalır.

## Anti-hedefler (çalışsa bile başarısızlık sayılır)

- Uygulama ibadet uygulamasına dönüşür ve Kur'an keşfi arka plana düşer.
- Konum veya davranış verisi cihazdan çıkar. Site "takipsiz"dir (plan §1.2), uygulama da öyle kalır.
- Uygulamada reklam, analitik veya üçüncü taraf SDK bulunur.
- İnternet yokken uygulama boş ekran gösterir.
- Ezan bildirimi Android'in pil optimizasyonu yüzünden sessizce gecikir veya hiç gelmez.

## Kısıtlar

- **Kural 5:** üretimde harici API'ye bağımlılık yoktur. Namaz vakti cihazda
  hesaplanır, hiçbir vakit servisine istek atılmaz.
- **Kural 4:** vakit hesabının yöntemi ekranda yazar ("Hesaplama: Diyanet yöntemi,
  adhan kütüphanesi"). Diyanet'in yayımladığı resmî vakitlerle 1-2 dakika fark
  olabileceği belirtilir.
- **Site JS'siz de çalışır.** İbadet sayfaları JS gerektirir, çünkü konum ve hesap
  istemcide yapılır. JS yokken açıklama gösterilir, boş sayfa gösterilmez.
- **Play kuralları:**
  - targetSdk: Play'in güncel şartı uygulanır. 2026 için API 36 bekleniyor, builder doğrular.
  - Format: AAB, Play App Signing.
  - Upload anahtarı repoya girmez.
  - Kesin alarm izni (`SCHEDULE_EXACT_ALARM`) kullanıcıdan istenir. `USE_EXACT_ALARM`
    alarm/takvim uygulamalarına özeldir, kullanılmaz.
  - Veri Güvenliği formu (benim kararım): /iletisim formu uygulamada da açıktır.
    Formda yalnızca "ad, e-posta, mesaj — kullanıcının kendi gönderdiği, iletişim
    amaçlı, paylaşılmaz, şifreli iletilir" beyan edilir. Bunun dışında veri toplanmaz.
  - Gizlilik politikası URL'si zorunludur. Sitede yok, `/gizlilik` eklenecek. Taslağı
    ben yazarım, metni kullanıcı onaylar. İçerik:
    - veri sorumlusu Esfasoft A.Ş.
    - iletişim formu
    - sunucu erişim günlükleri
    - medya alan adı
    - konum yalnızca cihazda kalır
- **Hesap:** Esfasoft A.Ş. adına kurumsal Play geliştirici hesabı (D-U-N-S gerekir).
  Kişisel hesabın 12 test kullanıcısı / 14 gün şartından muaftır. Hesabı kullanıcı açar.
- **Port kuralı:** bu iş yeni bir sunucu servisi açmaz.

## Yaklaşımlar

| | Yaklaşım | Artı | Eksi |
|---|---|---|---|
| **A (seçildi)** | Capacitor kabuğu, `server.url` = kurankesfi.tr. Yerel yetenekler Capacitor eklentileriyle. Siteye PWA önbelleği eklenir. | Tek içerik kaynağı. Site güncellemesi anında uygulamada. Bildirim ve konum yerel, sağlam. | İlk açılış internet ister. |
| B | Capacitor, metin içeriği uygulamaya gömülü | Tam çevrimdışı | `dist` 1,2 GB. Her içerik değişikliği yeni mağaza sürümü demek. |
| C | TWA + PWA | En ucuz | Ezan saatinde kesin bildirim web'de güvenilir değil, push sunucusu gerekir. Bildirim bu işin ana artısı olduğundan elendi. |

Flutter/Kotlin ile sıfırdan yazma elendi, siteyi ikinci kez yazmak olur.
Kullanıcı A'yı seçti (2026-11-20).

## Tasarım

### Mimari

```
apps/mobile/                 Capacitor projesi (yeni)
  capacitor.config.ts        server.url = https://kurankesfi.tr, errorPath = offline.html
  www/offline.html           İnternet yokken ve ilk açılış önbelleksizken gösterilen yerel sayfa
  android/                   Capacitor'ın ürettiği Android projesi
apps/web/
  src/pages/ibadet/…         İbadet sayfaları (sitede de açık)
  src/lib/ibadet/…           Vakit hesabı, kıble açısı, hicri tarih, bildirim planlayıcı
  src/lib/native.ts          "Uygulama içinde miyim?" + Capacitor köprüsünün ince sarmalayıcısı
                             (yalnızca /ibadet sayfalarında yüklenir)
  public/sw.js               Service worker (PWA önbelleği)
infra/nginx/kurankesfi.tr.conf   worker-src + /ibadet CSP + geolocation=(self)
  src/pages/gizlilik.astro   Gizlilik politikası
```

**İbadet sayfaları sitenin parçasıdır** (benim kararım). Gerekçe: tek kod tabanı,
web kullanıcısı da yararlanır, service worker onları önbelleğe alır. Uygulamaya özgü
olan tek şey bildirimdir. Sayfa, Capacitor köprüsünü bulursa bildirim ayarlarını
gösterir, bulamazsa (tarayıcı) o bölümü gizler.

**Ayarlar uygulamada yerel depoda tutulur** (benim kararım). Konum, vakit ve
bildirim ayarları uygulamada Capacitor Preferences'ta, tarayıcıda localStorage'da
durur. Gerekçe: `offline.html` başka bir origin'de çalışır, IndexedDB ve localStorage'ı
siteyle paylaşmaz. Yerel depo iki kopyada da aynıdır.

**İnternet yoksa ve önbellek boşsa** `offline.html` açılır. Kapsamı:

- Son bilinen konumla namaz vakitlerini ve kıbleyi gösterir.
- Bildirimleri yeniden kurar.
- Zikirmatik ve /gunluk bu sayfada yoktur.

`apps/web/src/lib/ibadet` ayrı bir paket olarak derlenir ve `www/` içine kopyalanır.

### İbadet araçları

- **Namaz vakitleri:** imsak, güneş, öğle, ikindi, akşam, yatsı. `adhan` (JS)
  kütüphanesi, Türkiye/Diyanet yöntemi. Sıradaki vakte geri sayım.
- **İmsakiye:** seçili konum için aylık tablo. Ramazan'da öne çıkar.
- **Kıble:** büyük daire açısı cihazda hesaplanır. Pusula `deviceorientationabsolute`
  ile çalışır, kalibrasyon uyarısı verilir. Sensör yoksa açı ve kuzeye göre statik bir
  ok gösterilir.
- **Hicri takvim:** `Intl.DateTimeFormat` ile `islamic-umalqura` takvimi. Diyanet
  takviminden bir gün sapabileceği not edilir. Dinî günler (Kandiller, bayramlar)
  bu sürümde listelenmez, çünkü kaynak ister.
- **Zikirmatik:** sayaç, hedef sayı, titreşim. Durum cihazda kalır.
- **Konum:** GPS (izin istenir) veya elle şehir seçimi. Şehir listesi build'de
  gömülür (Türkiye 81 il + ilçe merkezleri; dünya başkentleri). Konum yalnızca
  cihazda saklanır.

### Bildirimler (yalnızca uygulamada)

- **Mekanizma:** Capacitor Local Notifications. Hepsi cihazda planlanır, sunucu yok.
- **Ezan:** her vakit ayrı aç/kapat, "X dk önce" seçeneği. 30 gün ileriye kurulur
  (5 × 30 = 150 alarm, Android sınırının altında). Uygulama her açıldığında ve konum
  değiştiğinde yeniden kurulur. Cihaz yeniden başlayınca alarmlar korunmalıdır.
- **Günlük ayet** (benim kararım):
  - Bottaki `/bugun` komutunun kuralı kullanılır: `schedule[dayOfYear % len]`. Bot
    ayrıca abone başına kendi imleciyle ilerler, uygulama ona bağlanmaz. Gün,
    cihazın yerel tarihinden hesaplanır.
  - Bildirimde ayetin adresi ve Diyanet mealinin kısaltılmış metni yer alır, sonunda
    "— Diyanet İşleri" yazar (kural 4).
  - Uygulama açıldığında önümüzdeki 14 gün kurulur. Saati kullanıcı seçer, bildirime
    dokununca ayet sayfası açılır.
- **Günlük tekrar:** seçilen saatte sabit metinli bir "tekrar zamanı" hatırlatması
  gelir ve /gunluk'u açar. Bekleyen kart sayısı yazılmaz, çünkü önceden planlanan
  bildirimde bu sayı bayatlar (benim kararım).
- **İzinler:** bildirim izni (Android 13+) ve kesin alarm izni, kullanıcı ilgili
  ayarı açtığında istenir, ilk açılışta değil.
- **Kesin alarm izni reddedilirse** (benim kararım):
  - Ezan bildirimleri yine kurulur, ama ibadet ekranında kalıcı bir uyarı görünür:
    "Bildirimler birkaç dakika gecikebilir — izni aç". Uyarının yanında ayarlara
    giden bir düğme olur.
  - Pil optimizasyonu muafiyeti istenmez, çünkü Play kısıtlı bir izin sayar.
  - Xiaomi/Samsung gibi üreticiler için kısa bir "bildirim gelmiyorsa" yardım metni
    eklenir. Üreticiye özel kod yazılmaz.

### Site başlıkları ve JS politikası (kullanıcı kararı 2026-11-20, seçenek a)

Site sayfaları web kullanıcısı için **0 bayt JS** kalmaya devam eder. Uygulamaya
özgü her davranış yerel (Android) koddadır, siteye betik eklenmez.

`infra/nginx/kurankesfi.tr.conf` dosyasında üç değişiklik yapılır. Dosya önce
`*.bak.<tarih>` olarak yedeklenir, değişiklik canlıya da uygulanır, duman testi
başlıkları okur.

1. **Tüm sayfaların CSP'sine** yalnızca `worker-src 'self'` eklenir (service worker için).
   `script-src` sayfa geneline AÇILMAZ.
2. **`/ibadet/` için yeni bir CSP satırı** eklenir: `script-src 'self'` ve `connect-src 'self'`.
3. **`/ibadet/` sayfalarında** `Permissions-Policy` `geolocation=(self)` olur.
   Diğer sayfalarda `geolocation=()` kalır.

Service worker kaydı, uygulama tarafından WebView'e enjekte edilen tek satırlık
bir kodla yapılır. Tarayıcıdaki ziyaretçi için service worker /ibadet sayfalarından
kaydolur.

**Riskli varsayım, ilk adımda denenmeli:** Android WebView'de `evaluateJavascript`
ile enjekte edilen kodun sayfanın `script-src` kuralına takılmadığı varsayılıyor.
Takılırsa yedek plan: service worker yalnızca /ibadet açıldığında kaydolur. Uygulama
ilk açılışta /ibadet'i görünmez biçimde bir kez yükleyerek kaydı tetikler.

### Uygulama içi gezinme (yerel)

- **Alt şerit yerel bir Android görünümüdür** (BottomNavigationView), WebView'in
  altında durur. Sekmeler: **Oku** (ana sayfa), **Ara**, **Günlük**, **İbadet**.
  Site bu şeridi çizmez, tarayıcıda da görünmez. İbadet son sıradadır, çünkü merkez
  Kur'an keşfidir.
- **Geri tuşu:** yerel kod WebView geçmişinde geri gider, ana sayfada uygulamadan çıkar.
- **Harici bağlantılar:** yerel kod `kurankesfi.tr` ve `medya.kurankesfi.tr` dışındaki
  her gezinmeyi yakalar ve sistem tarayıcısında açar.

### PWA önbelleği

- İbadet sayfaları ve şehir listesi önceden önbelleğe alınır.
- Ziyaret edilen sayfalar ve sayfa verisi JSON'ları ziyaret edildikçe önbelleğe
  alınır (plan §292'deki kademeli önbellek).
- Medya (R2) önbelleğe alınmaz.
- Yeni yayında eski önbellek temizlenir. Sürüm, yayın kimliğinden türetilir.

### Kimlik ve yayın

- Paket adı: `tr.kurankesfi.app`.
- Uygulama adı: "Kur'an-ı Kerim Keşfi".
- Simge ve mağaza görselleri `@kuran/brand`'dan üretilir.
- Sürüm notları Türkçe.
- İlk yayın sırası: iç test → kapalı test → üretim.
- **Yükleme elle yapılır** (benim kararım): AAB'yi kullanıcı Play Console'a kendisi
  yükler (Play ilk yüklemeyi zaten elle ister). Upload anahtarı kullanıcıda ve repo
  dışında durur. Otomatik yükleme ve servis hesabı bu sürümde yok.
  `pnpm run deploy` değişmez. AAB üretimi ayrı bir betiktir.

## Builder'a kalanlar

- Capacitor ve eklenti sürümleri; Android SDK/JDK'nın nerede kurulacağı (sunucu veya yerel makine).
- Service worker'ın elle mi yoksa bir araçla mı yazılacağı (bağımlılık eklemeden elle yazılması tercih edilir).
- `adhan` dışında bir hesap kütüphanesi daha iyi uyuyorsa gerekçesiyle seçilebilir.
- İbadet ekranlarının görsel düzeni, `docs/DESIGN.md` token'larıyla.
- Şehir listesinin kaynağı (atıfla).
