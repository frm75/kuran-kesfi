# Google Play kayıt rehberi — Kur'an-ı Kerim Keşfi

Bu dosya, uygulamayı Google Play Console'a kaydederken sizin yapacaklarınızı sırayla anlatır.
Metinleri olduğu gibi kopyalayıp yapıştırabilirsiniz. Kod tarafı hazır; burada yalnızca sizin
elinizle yapılacak işler var.

- Paket adı: `tr.kurankesfi.app`
- Uygulama adı: **Kur'an-ı Kerim Keşfi**
- Gizlilik politikası: `https://kurankesfi.tr/gizlilik` (metin **sizin onayınızı bekliyor**; onaylamadan
  siteyi yayına almayın, Play bu adresi açıp kontrol eder)

---

## 0. Başlamadan önce (bir kez)

1. **Kurumsal geliştirici hesabı.** Esfasoft A.Ş. adına Play geliştirici hesabı açın. Bunun için
   önce D-U-N-S numarası gerekir (Dun & Bradstreet'ten ücretsiz alınır, günler sürebilir). Kurumsal hesap,
   kişisel hesapların 12 test kullanıcısı / 14 gün şartından muaftır.
2. **Upload anahtarı.** Terminalde bir kez üretin ve **repo dışında** saklayın. Kaybederseniz
   uygulamayı güncelleyemezsiniz; yedeğini de güvenli bir yerde tutun:

   ```
   keytool -genkeypair -v -keystore <yol>/upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Ardından `.env` dosyasına şunları yazın (örnek: `.env.example`):

   ```
   ANDROID_KEYSTORE_PATH=<yol>/upload.keystore
   ANDROID_KEYSTORE_PASSWORD=<keystore şifresi>
   ANDROID_KEY_ALIAS=upload
   ```

   Anahtar şifresi keystore şifresinden farklıysa ek olarak `ANDROID_KEY_PASSWORD=<anahtar şifresi>`
   yazın; yazmazsanız keystore şifresi kullanılır (keytool'a ikisini de aynı girmek en kolayıdır).
3. **AAB üretimi.** Repo kökünde `pnpm mobile:release` çalıştırın. Betik web paketini derler, `versionCode`'u
   bir artırır, imzalı `app-release.aab` dosyasını üretir ve yolunu yazar. Artan `versionCode`'u
   `git commit` ile kaydedin (her yüklemede Play daha büyük bir sayı ister).

---

## 1. Mağaza girişi

### Kategori
**Kitaplar ve Kaynaklar** (Books & Reference). Uygulama türü: Uygulama. Ücretsiz.

### Kısa açıklama (en çok 80 karakter)

```
Kur'an'ı keşfedin: ayet, meal, kök ve kıssalar. Ek olarak vakit ve kıble.
```

### Uzun açıklama (en çok 4000 karakter)

```
Kur'an-ı Kerim Keşfi, Kur'an'ı birbirine bağlı bir bütün olarak okumanız, aramanız ve anlamanız için hazırlanmış ücretsiz bir keşif uygulamasıdır.

KUR'AN'I KEŞFEDİN
• 114 sure, 6236 ayet; Diyanet İşleri mealinin yanında birçok farklı meal ve tefsir notu yan yana
• Kök bazlı okuma: bir kelimenin Kur'an'daki bütün geçişlerini görün
• Kıssalar, kavramlar ve ilkeler; her biri kaynağıyla birlikte
• Ayetler arası bağlantılar ve konu başlıkları
• Harita ve zaman çizelgesi: kıssaların geçtiği yerleri ve olayların sırasını izleyin
• Hızlı arama: sure ve ayet numarası, kelime, kök ya da konu yazın
• Okuma günlüğü: notlarınız, yer imleriniz ve tekrar zamanlarınız yalnızca cihazınızda durur

İBADET ARAÇLARI (EK OLARAK)
• Namaz vakitleri ve sıradaki vakte geri sayım
• Ezan vaktinde, seçtiğiniz vakitler için zamanında hatırlatma
• İmsakiye
• Kıble pusulası
• Hicri takvim
• Zikirmatik

BİLDİRİMLER
Her gün bir ayet, seçtiğiniz saatte tekrar hatırlatması ve seçtiğiniz namaz vakitleri için bildirim kurabilirsiniz. Hepsi cihazınızda planlanır; bildirim sunucusu yoktur. Namaz vakitleri cihazda hesaplanır; günün ayetinin metni kurankesfi.tr sitesinden indirilir.

GİZLİLİK
• Reklam yok, üyelik yok, takip yok
• Konumunuz yalnızca vakit ve kıble hesabı için cihazınızda kullanılır, cihazdan çıkmaz
• Namaz vakitleri cihazda hesaplanır (Diyanet yöntemi, adhan kütüphanesi). Diyanet'in yayımladığı resmî vakitlerle 1-2 dakika fark olabilir.

Uygulamanın içeriği kurankesfi.tr sitesinden gelir; site güncellendiğinde uygulama da güncellenmiş olur. İnternet yokken namaz vakitleri ve kıble çalışır, daha önce açtığınız sayfalar da açılır.

Sorularınız ve düzeltme bildirimleriniz için uygulamadaki iletişim formunu kullanabilirsiniz.
```

(Not: "114 sure, 6236 ayet" ve "birçok meal" ifadeleri sitedeki verilerle uyumludur; kaynaklar
`docs/DURUM.md` başında yazılı. Sayı değişirse buradan da düzeltin.)

### İletişim bilgileri
Geliştirici e-postası ve web sitesi (`https://kurankesfi.tr`) için `apps/web/src/lib/site.ts`
içindeki `CONTACT` değerlerini kullanın.

---

## 2. Veri Güvenliği formu

Play Console > Uygulama içeriği > Veri güvenliği. Yanıtlar kodla ve gizlilik metniyle uyumludur.

| Soru | Yanıt |
|---|---|
| Uygulama kullanıcı verisi topluyor veya paylaşıyor mu? | **Evet** (iletişim formu, sunucu erişim günlüğündeki IP adresi ve Uydu katmanında Esri'ye giden IP adresi) |
| Toplanan veri | **Kişisel bilgiler: Ad** ve **E-posta adresi**; kullanıcının yazdığı **mesaj** (Mesajlar > Diğer uygulama içi mesajlar); **Cihaz veya diğer kimlikler: IP adresi** (sunucu erişim günlüğü, aşağıya bakın) |
| Toplama amacı | Ad, e-posta, mesaj: **Uygulama işlevselliği / Geliştirici iletişimi** (yalnızca yanıt vermek ve düzeltmeyi işlemek). IP adresi: **Güvenlik, sahtecilik önleme ve uyumluluk / Uygulama işlevselliği** |
| Veri üçüncü taraflarla paylaşılıyor mu? | **Evet, yalnızca IP adresi, Esri ile** (kullanıcı "Uydu" katmanını seçtiğinde; amaç: **Uygulama işlevselliği**). Ad, e-posta ve mesaj paylaşılmaz |
| Veri aktarım sırasında şifreleniyor mu? | **Evet** (HTTPS) |
| Kullanıcı verinin silinmesini isteyebilir mi? | **Evet** (e-posta ile; gizlilik sayfasında yazılı) |
| Veri toplama zorunlu mu? | **İsteğe bağlı** (yalnızca kullanıcı formu doldurursa) |

**IP adresi (Cihaz veya diğer kimlikler) beyan edilir.** Web sunucusu her istek için olağan erişim günlüğü
tutar (istek zamanı, istenen adres, yanıt kodu, **IP adresi**, tarayıcı bilgisi). Play bunu sunucu tarafında
toplama sayar. Kendi sunucunuzdaki günlük için yanıtlar: aktarımda şifreli, amaç güvenlik/işletim; paylaşım yalnızca aşağıdaki Esri durumu için geçerlidir. **"Geçici işleme"
(ephemeral) olarak işaretlemeyin**: gizlilik metni (`gizlilik.astro`, "Sunucu erişim günlükleri") günlüklerin
saklanma süresini vermiyor (`DOĞRULA` notu açık), yani süre belirsiz. Gerçek süre (ör. 7 gün) öğrenilip
metne yazılırsa ve istek işlenir işlenmez atılıyorsa bu karar yeniden değerlendirilebilir.

**Erişim günlüğü istenen adresi de yazar; "Uygulama etkinliği" kararı sizindir.** Günlükteki her satırda
IP adresinin yanında **istenen adres** (ör. `/bakara-suresi/153`, `/ibadet/kible`) durur. Bu, hangi IP'nin
hangi sayfayı açtığını sunucu tarafında kaydetmek demektir. Play'in "Uygulama etkinliği" kategorisinde
"Uygulama etkileşimleri" ve "Web'de gezinme geçmişi" gibi alt başlıklar var; bu günlüğün bunlara girip
girmediği yoruma açıktır. Bu rehberdeki varsayılan yanıt **değiştirilmedi** (aşağıda "Toplanmıyor"),
gerekçesi şu: günlük olağan web sunucusu işletimidir, kullanıcı profili ya da gezinme geçmişi olarak
işlenmez, kimseyle paylaşılmaz, analitik yapılmaz. Arama sorgusu adres çubuğunda `?q=` olarak dursa da
sorgu tarayıcıda çalışır ve sunucuya gitmez; yalnızca böyle bir bağlantı doğrudan açılırsa (yenileme,
paylaşılan bağlantı) günlüğe düşer. Daha temkinli bir beyan isterseniz "Uygulama etkinliği > Uygulama
etkileşimleri" ve "Web'de gezinme geçmişi"ni **Toplanıyor, paylaşılmıyor, amaç: Güvenlik / Uygulama
işlevselliği** olarak işaretleyin; bu yanlış beyandan daha güvenlidir, yalnızca mağaza sayfasında biraz daha
uzun bir veri listesi görünür. Hangisini seçerseniz gizlilik metni zaten tutarlıdır: `gizlilik.astro` "Sunucu erişim günlükleri"
bölümü istenen adresin ve IP adresinin yazıldığını açıkça söylüyor.

*İletişim formu ile erişim günlüğü ayrı şeylerdir:* form akışı IP adresini saklamaz (hız sınırı için yalnızca
karması, bellekte, geçici tutulur); IP adresi ise yalnızca web sunucusunun erişim günlüğünde durur.

Şu kategoriler için **"Toplanmıyor"** işaretleyin:

- **Konum** (yaklaşık ve kesin): konum izni yalnızca namaz vakti ve kıble hesabı içindir. Konum
  cihazda işlenir, sunucuya gönderilmez, bu yüzden Play'in tanımıyla "toplanmış" sayılmaz.
- Finansal bilgiler, sağlık, fotoğraf/video, ses, dosyalar, takvim, kişiler, uygulama etkinliği,
  web gezinme geçmişi, diğer cihaz kimlikleri (IP dışında).
- Reklam, analitik ve üçüncü taraf SDK yoktur; "reklam kimliği" kullanılmaz.

**Uydu harita katmanı (Esri) paylaşım olarak beyan edilir.** Canlı ortamda `PUBLIC_ARCGIS_API_KEY` tanımlı
(doğrulandı 2026-11-20), yani Uydu katmanı yayında. Kullanıcı haritada "Uydu" katmanını seçerse görüntü
kareleri Esri'nin (ArcGIS) sunucusundan (`ibasemaps-api.arcgis.com`) yüklenir; Esri'ye **IP adresi** ve
istenen karelerin koordinatları gider. Katman seçilmezse Esri'ye hiçbir istek gitmez.
Karelerin koordinatları kullanıcının konumu değil, **haritada baktığı bölgedir** (kıssa yerleri). Cihaz
konumuyla bağı yoktur, bu yüzden "Konum" kategorisi olarak beyan edilmez; yalnızca "IP adresi" paylaşımı
beyan edilir. Gizlilik metnindeki "Uydu harita katmanı" bölümü bununla aynı şeyi söyler.

---

## 3. Gizlilik politikası ve diğer zorunlu formlar

- **Gizlilik politikası URL'si:** `https://kurankesfi.tr/gizlilik`
- **Reklam içeriyor mu:** Hayır.
- **Hedef kitle:** 13 yaş ve üzeri (çocuklara özel değildir). "Çocuklara yönelik" **seçmeyin**.
- **Haber uygulaması / COVID / hükümet uygulaması:** Hayır.
- **Finansal özellikler, sağlık:** Hayır.

### Hassas izinler

**Kesin alarm (`SCHEDULE_EXACT_ALARM`)** — Play Console'da "Alarmlar ve hatırlatıcılar" izin beyanı
istenirse gerekçe olarak şunu yazın:

```
Kullanıcının seçtiği namaz vakitlerinde zamanında hatırlatma
```

Uzun gerekçe istenirse: *Uygulama, kullanıcının seçtiği namaz vakitleri için (imsak, öğle, ikindi, akşam,
yatsı) yerel bildirim kurar. Vakit dakikası önemlidir; birkaç dakika gecikmiş bir ezan hatırlatması
işe yaramaz. İzin kullanıcı ilgili ayarı açtığında istenir, ilk açılışta istenmez. Reddedilirse bildirimler
yine kurulur ve ekranda "birkaç dakika gecikebilir" uyarısı görünür.*

Not: `USE_EXACT_ALARM` kullanılmıyor (yalnızca alarm/takvim uygulamalarına özel). Pil optimizasyonu
muafiyeti de istenmiyor.

**Konum izni (yaklaşık + kesin):** Neden: "Namaz vakti ve kıble yönünü cihazda hesaplamak. Konum
cihazdan çıkmaz." Arka planda konum **istenmiyor**.

**Bildirim izni (Android 13+):** Vakit, günlük ayet ve tekrar hatırlatması. Kullanıcı ilgili ayarı
açınca istenir.

---

## 4. İçerik derecelendirme anketi (IARC)

Play Console > Uygulama içeriği > İçerik derecelendirme. Kategori olarak "Referans, haber veya
eğitim" (ya da en yakın karşılığı) seçin ve şöyle yanıtlayın:

- Şiddet, kan, cinsel içerik, küfür, korku: **Hayır**
- Kumar, alkol/tütün/uyuşturucu teşviki: **Hayır**
- Kullanıcıların birbiriyle iletişimi / kullanıcı içeriği paylaşımı: **Hayır** (iletişim formu
  yalnızca geliştiriciye ulaşır, başka kullanıcılar görmez)
- Konum paylaşımı (başka kullanıcılarla): **Hayır**
- Dinî içerik: Uygulama dinî bir metni (Kur'an meali ve tefsir notları) kaynaklarıyla sunar. Soru
  çıkarsa "Dinî / manevi içerik içerir" olarak beyan edin, bir şiddet ya da hassas içerik değildir.

Beklenen sonuç: tüm bölgelerde düşük yaş sınırı (ör. PEGI 3 / Everyone). Sonuç farklı çıkarsa
yanıtlarınızı gözden geçirin.

---

## 5. Ekran görüntüleri ve görseller

Gerekli: en az 2, telefon için 4-8 ekran görüntüsü (PNG/JPEG, 16:9 ya da 9:16, kısa kenar en az 320 px,
uzun kenar en çok 3840 px). Önerilen sıra (Kur'an keşfi önde):

1. Ana sayfa (Oku)
2. Bir sure / ayet sayfası (meal yan yana)
3. Kök sayfası (bir kelimenin geçişleri)
4. Kıssa ve harita
5. Arama sonucu
6. Okuma günlüğü
7. Namaz vakitleri (İbadet sekmesi)
8. Kıble pusulası

Ek görseller:

- **Uygulama simgesi:** 512x512 PNG, 32 bit. Kaynağı `scripts/brand/logo-source.png` (kopya:
  `apps/mobile/assets/`).
- **Öne çıkan görsel (feature graphic):** 1024x500 PNG/JPEG. Henüz üretilmedi; sizin onayınızla
  logodan hazırlanmalıdır.
- Tablet ekran görüntüsü zorunlu değil (isteğe bağlı).

Ekran görüntülerini gerçek telefonda alın (güç + ses kısma). Kişisel veri (konum şehriniz, adınız) görünmesin.

---

## 6. Yükleme: iç test, kapalı test, üretim

AAB'yi Play'e **siz elle yüklersiniz** (otomatik yükleme yok). Her yüklemeden önce `pnpm mobile:release`
çalıştırın, `versionCode` artışını commit edin.

1. **Play App Signing'i kabul edin.** İlk yüklemede Play kendi imza anahtarını yönetmeyi önerir; kabul
   edin. Sizin upload anahtarınız yalnızca yüklemeyi doğrular. Upload anahtarını kaybederseniz Play
   Destek üzerinden sıfırlanabilir, ama bu zahmetlidir.
2. **İç test (Internal testing).** Test > İç test > Yeni sürüm oluştur > AAB'yi yükleyin. Sürüm notu
   (Türkçe) yazın, ör. "İlk sürüm." Kendi e-posta adresinizi test kullanıcısı olarak ekleyin; Play'in
   verdiği bağlantıdan kurun. Şunları deneyin: açılış, ayet sayfası, arama, İbadet sekmesi, konum
   izni, ezan bildirimi (kesin alarm izni isteği dahil), uçak modunda açılış, geri tuşu.
3. **Kapalı test (Closed testing).** Birkaç güvendiğiniz kişiyi ekleyip birkaç gün deneyin. (Kurumsal
   hesapta 12 kişi / 14 gün şartı yoktur; kişisel hesapta olurdu.) Hata çıkarsa düzeltin,
   `pnpm mobile:release` ile yeni AAB üretin ve aynı yoldan yükleyin.
4. **Üretim (Production).** Tüm formlar (Veri güvenliği, derecelendirme, izin beyanı, hedef kitle,
   mağaza girişi) tamamlandığında Üretim > Yeni sürüm > iç testte denediğiniz AAB'yi yükleyin ve
   incelemeye gönderin. Kesin alarm beyanı nedeniyle inceleme birkaç gün sürebilir.

Her aşamadan sonra Play Console'daki "Yayın durumu" ve "Politika durumu" sayfalarında uyarı olup
olmadığına bakın.

## 7. Sık karşılaşılanlar

- **"Anahtar kullanılamıyor" / imza hatası:** `.env` içindeki yol ve şifreleri kontrol edin.
- **"Sürüm kodu zaten kullanıldı":** `versionCode` artmamıştır; `pnpm mobile:release`'i yeniden çalıştırın.
- **Bildirim gelmiyor (Xiaomi, Samsung vb.):** üreticinin pil ayarları uygulamayı kısıtlayabilir;
  uygulamadaki "bildirim gelmiyorsa" yardım metnine bakın. Uygulama pil optimizasyonu muafiyeti istemez.

## 8. Telefonda denetim listesi (sizin yapacağınız)

Hata ayıklama APK'sı (`app-debug.apk`) ya da iç test sürümüyle gerçek telefonda deneyin. Sunucuda
otomatik doğrulanamayanlar bunlar; her birini işaretleyin.

1. 4 sekme (Oku, Ara, Günlük, İbadet) çalışır, seçili sekme açılan sayfayla uyuşur.
2. **Geri tuşu:** iç sayfada geçmişte geri gider; ana sayfada (`/`) uygulamayı kapatır.
3. **Geri tuşu, çevrimdışı sayfada:** uçak modunda soğuk açılışta gelen çevrimdışı sayfada (vakitler +
   kıble) geri tuşu uygulamayı **tek basışta** kapatır; sayfa döngüye girmez.
4. `/kaynaklar` sayfasındaki dış bağlantı Chrome'da açılır.
5. Ayarlardan öğle "1 dk sonrası" için test bildirimi kurulur ve bildirim gelir; bildirime dokununca
   `/ibadet` açılır.
6. Telefon yeniden başlatılınca bekleyen bildirimler hâlâ kuruludur.
7. Kesin alarm izni kapatılınca ayarlar sayfasında uyarı görünür.
8. **Yeni yayından sonra çevrimdışı İbadet:** site yeniden yayımlandıktan sonra uygulamayı bir kez
   **internet varken** açın (İbadet sekmesine girmeniz gerekmez), sonra uçak moduna geçin, uygulamayı
   kapatıp açın ve İbadet ile Kıble sayfalarını açın. Beklenen: sayfalar **stilli ve çalışır** gelir
   (vakit listesi dolu, kıble oku görünür), düz/çıplak HTML değil.
9. **404 sayfası çevrimdışı görünmez:** internet varken uygulamada olmayan bir adrese gidin: telefonu
   bilgisayara bağlayın, Chrome'da `chrome://inspect` > uygulamanın WebView'i > Console'a
   `location.href = "/olmayan-sayfa"` yazın. Beklenen: sitenin kendi
   "sayfa bulunamadı" sayfası gelir, "internet yok" sayfası **gelmez**. Uçak modunda ise çevrimdışı
   sayfa gelir.
10. **Bildirimler çevrimdışı açılışta kaybolmaz:** günün ayeti bildirimi açıkken uçak modunda uygulamayı
    açın, sonra ayarlardan bekleyen bildirimlere bakın (ya da ertesi gün ayet bildiriminin geldiğini
    görün). Beklenen: vakit bildirimleri ve **günün ayeti bildirimleri yerinde** durur.
11. **Dinleme sayfasında bildirimler kaybolmaz:** internet varken bir `/dinle/...` sayfası açın; ayet
    bildirimleri yine yerinde kalır (bu sayfada ağ isteği kapalı olduğu için ayet metni indirilemez,
    mevcut bildirimler korunur).
12. **Yedekleme kapalı:** `adb shell bmgr backupnow tr.kurankesfi.app` komutu uygulamanın yedeğe uygun
    olmadığını söyler (ya da Ayarlar > Google > Yedekleme'de uygulama listelenmez). Konum ve ayarlar
    Google Drive'a gitmez.
