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

   Keystore şifresi ile anahtar şifresi aynı olmalı (keytool'a ikisini de aynı girin).
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
Her gün bir ayet, seçtiğiniz saatte tekrar hatırlatması ve seçtiğiniz namaz vakitleri için bildirim kurabilirsiniz. Hepsi cihazınızda planlanır; sunucuya bağlanmaz.

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
| Uygulama kullanıcı verisi topluyor veya paylaşıyor mu? | **Evet** (yalnızca iletişim formu) |
| Toplanan veri | **Kişisel bilgiler: Ad** ve **E-posta adresi**. Ayrıca kullanıcının yazdığı **mesaj** (Mesajlar > Diğer uygulama içi mesajlar) |
| Toplama amacı | **Uygulama işlevselliği / Geliştirici iletişimi** (yalnızca kullanıcıya yanıt vermek ve bildirilen düzeltmeyi işlemek) |
| Veri üçüncü taraflarla paylaşılıyor mu? | **Hayır** |
| Veri aktarım sırasında şifreleniyor mu? | **Evet** (HTTPS) |
| Kullanıcı verinin silinmesini isteyebilir mi? | **Evet** (e-posta ile; gizlilik sayfasında yazılı) |
| Veri toplama zorunlu mu? | **İsteğe bağlı** (yalnızca kullanıcı formu doldurursa) |

Şu kategoriler için **"Toplanmıyor"** işaretleyin:

- **Konum** (yaklaşık ve kesin): konum izni yalnızca namaz vakti ve kıble hesabı içindir. Konum
  cihazda işlenir, sunucuya gönderilmez, bu yüzden Play'in tanımıyla "toplanmış" sayılmaz.
- Finansal bilgiler, sağlık, fotoğraf/video, ses, dosyalar, takvim, kişiler, uygulama etkinliği,
  web gezinme geçmişi, cihaz veya diğer kimlikler.
- Reklam, analitik ve üçüncü taraf SDK yoktur; "reklam kimliği" kullanılmaz.

**Dikkat edilecek iki nokta** (gizlilik metnindeki `DOĞRULA` notlarıyla aynıdır; kararı siz verin):

1. *Uydu harita katmanı.* Haritada "Uydu" katmanını seçerseniz görüntü kareleri Esri'nin
   (ArcGIS) sunucusundan yüklenir; Esri'ye IP adresi ve görüntülenen karelerin koordinatları gider.
   Katman seçilmezse hiçbir istek gitmez. Bu katman yalnızca sitenin derlemesinde
   `PUBLIC_ARCGIS_API_KEY` tanımlıysa görünür. **Canlı sürümde bu anahtar tanımlıysa** Veri Güvenliği
   formuna bir açıklama düşünün (IP adresi, üçüncü taraf Esri'ye gider); tanımlı değilse gizlilik
   metnindeki "Uydu harita katmanı" bölümü de kaldırılmalıdır.
2. *Sunucu erişim günlükleri.* Web sunucusu olağan erişim günlüğü (IP, istenen adres) tutar ve
   yalnızca işletim güvenliği içindir. Play'in sunucu günlüklerine bakışı konusunda emin değilseniz
   Play Console'daki yardım metnini okuyun ve gerekirse "IP adresi"ni, amacı "Güvenlik, sahtecilik
   önleme" ve geçici işleme olarak ekleyin.

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
