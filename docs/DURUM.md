# DURUM — nerede kaldık

> Bu dosya **oturum devri** içindir: bağlam sıfırlandığında tek okumayla toparlanmak için.
> Kalıcı kurallar `CLAUDE.md`'de, plan `PROJE_PLANI.md`'de, tasarım `DESIGN.md`'de,
> kurulum ayrıntısı `DEPLOY_REPORT.md`'de, yedek `YEDEK.md`'de.
> Modüllerin kuruluş hikâyesi ve gerekçeleri: `DURUM-ARSIV-2026-09.md`.
> Son güncelleme: 2026-11-20. Depo `/opt/kuran`, dal `main`.

## Tek cümle

`kurankesfi.tr` yayında: **14 394 sayfa** — 6236 ayet, 54 çeviri (27'si Türkçe meal),
1641 kök, 50 kıssa, 109 kavram, 64 ilke, 26 konum, 22 siyer olayı, 742 konu başlığı,
45 108 ayet-ayet bağı, 2 tefsir, 2322 yazma kaydı; arama, okuma günlüğü, kıraat
dinleme, iletişim formu ve Telegram botu çalışıyor.

## Komutlar (sırayla)

```bash
cd /opt/kuran                 # repo burada; /www/wwwroot/kurankesfi.tr yalnız yayın kökü
pnpm db:up                    # kuran-pg container (127.0.0.1:4322)
pnpm data:import              # Tanzil + Açık Kuran + çeviriyazı  (uzun, önbellekli)
pnpm content:import           # data/** → PostgreSQL; data/ parmak izini de yazar
pnpm build                    # = build:data → lint:refs → build:web   (~12 dk)
pnpm run deploy               # verify → bağlantı denetimi → atomik yayın → duman testi
pnpm run deploy:rollback      # bir önceki yayına dön
```

`pnpm deploy` DEĞİL `pnpm run deploy` (ilki pnpm'in yerleşiği, hiçbir şey yapmaz).
Diğer içe aktarmalar (`data:quranenc`, `data:qul-*`, `data:scripture` …) `package.json`'da
açıklamalarıyla duruyor; hepsini sıfırdan sırayla çalıştıran denenmiş bir betik **yok**.

## Yayın kapıları

Bir yayının canlıya çıkması için sırayla hepsi geçmeli:

| Kapı | Ne yakalar | Nerede |
|---|---|---|
| Veritabanı güncelliği | `data/` değişmiş, `content:import` unutulmuş | `lint:refs` (build içinde) |
| Referans linter | var olmayan ayet/slug/kaynak, şema dışı JSON | `lint:refs` |
| `pnpm verify` | tip hatası, kırık test | `pnpm run deploy` başında |
| Bağlantı denetimi | site içi kırık bağlantı (1,4 milyon bağ, ~1 dk) | `deploy.sh`, yayından önce |
| Duman testi | CSP, yönlendirmeler, örnek sayfalar, form arka ucu | `deploy.sh`, yayından sonra |

Duman testi kalırsa `deploy.sh` kendiliğinden önceki yayına döner (bu yol gerçek bir
başarısız yayınla **denenmedi**).

## İşletim (2026-11-20 sertleştirme turu)

| Konu | Durum |
|---|---|
| Yayın | `/www/wwwroot/kurankesfi.tr/releases/<UTC>` + atomik `current` bağı; son 3 yayın saklanır; sahip `root:root` |
| nginx | aaPanel; canlı vhost `/www/server/panel/vhost/nginx/kurankesfi.tr.conf`, depodaki `infra/nginx/kurankesfi.tr.conf` ile **bayt bayt aynı** kalmalı |
| Kanonik adres | http, `www` ve sondaki `/` → 301 `https://kurankesfi.tr/...` |
| TLS | 1.2+, yalnız ECDHE; 0-RTT kapalı |
| Form hız sınırı | `/api/iletisim` 6 istek/dk, taşma 5, aşımda 429 |
| Servisler | `kuran-iletisim` (127.0.0.1:4380), `kuran-bot` (127.0.0.1:4330) — systemd, `kuran` kullanıcısı, yazabildikleri tek yer `/opt/kuran/var` |
| Servis anahtarları | `/etc/kuran/iletisim.env`, `/etc/kuran/bot.env` (600 root) |
| Yedek | her gece 03:20, `/opt/kuran-yedek`, 14 gün — **yalnız bu diskte**; sunucu dışı kopya yok |
| Erişim günlüğü | günlük döner, 14 gün saklanır (`/etc/logrotate.d/kuran-nginx`) |
| JS çalışan adresler | `/harita`, `/kissa/*`, `/dinle/*`, `/gunluk`, `/ara` — gerisi betiksiz; CSP nginx'teki `map $uri $kesif_csp` |

## Yayındaki modüller

| Modül | Adres | Veri |
|---|---|---|
| Okuma | `/sureler`, `/<sure>`, `/<sure>/<ayet>` | 114 sure, 6236 ayet, 54 çeviri |
| Meal geçişi | `/<sure>/meal/<yazar>` | 2963 sayfa |
| Pasaj karşılaştırma | `/<sure>/karsilastir/<n>` | 742 sayfa |
| Kök | `/kok`, `/kok/<arapça>` | 1641 kök |
| Kıssalar | `/kissalar`, `/kissa/<slug>` | 50 kıssa, 227 parça, 43 ders |
| Harita | `/harita` | 26 konum; MapLibre + PMTiles |
| Zaman | `/zaman` | 22 siyer olayı, Nöldeke sırası |
| Kavramlar | `/kavramlar`, `/kavram/<slug>` | 109 kavram, 18 700 ayet bağı |
| İlkeler | `/ilkeler`, `/ilke/<slug>` | 64 ilke, 405 ayet bağı |
| İlgili ayetler | ayet sayfasında | 41 556 türetilmiş + 3552 lafzî benzerlik bağı |
| Tefsir | ayet sayfasında | Sa'dî, el-Muhtasar |
| Yazmalar | `/yazmalar`, `/yazma/<id>` | 2322 kayıt (Corpus Coranicum) |
| Dinleme | `/dinle/<sure>` | 114 sure, kelime takibi |
| Arama | `/ara` | ters indeks, referans ayrıştırma; JS'siz dizin |
| Okuma günlüğü | `/gunluk` | IndexedDB, cihazda kalır; dışa/içe aktarma |
| İletişim | `/iletisim` | SQLite + e-posta |
| Telegram botu | `/telegram` | 366 günlük takvim |
| Kaynak şeffaflığı | `/kaynaklar` | — |

## Açık kararlar (kullanıcıda)

- **Android uygulaması:** dal `feat/android-uygulama`, devir `DEVIR.md` (o dalda). Birleşme
  `/gizlilik` metni onayı, cihaz testi ve Play hesabına bağlı. Dal `main` ile
  `infra/nginx/kurankesfi.tr.conf` ve `scripts/deploy/deploy.sh` dosyalarında çakışacak.
- **Sunucu dışı yedek:** özel bir kova ve anahtar gerekiyor (medya kovası herkese açık, olmaz).
- **Hero video boyutu:** 9,1 MB. Aynı kalitede küçülmüyor (ölçüldü, 2026-11-20);
  VP9 crf 30 + H.264 yedek ≈ yarı boyut, hafif doku kaybıyla.
- **`kadin-erkek-hak` kavram adresi:** başlığı "Sema ve Arz"; yeniden adlandır + 301 ya da ayır.
- **Açık kaynak ifadesi:** depo özel, sitedeki metinle uyumu.

## Yapılmayanlar ve NEDENİ

| İş | Neden |
|---|---|
| Ham JSON'u yayından çıkarma | bot yayındaki `/data`'yı diskten okuyor; kazanç yalnız disk |
| Haritayı tembel yükleme | harita sayfanın ilk bölümü, zaten görünür alanda |
| pre-push kancası | her itişe 2,5 dk ekler; kapı deploy'da |
| İzleme / uyarı | kurulmadı; servis düşerse haber veren yok |
| Gönderilemeyen e-postayı yeniden deneme | mesaj SQLite'ta kalır, e-posta yinelenmez |
| Şema göçleri | `infra/db` tek dosya şema; değişiklik `db:reset` + yeniden içe aktarma ister |
| Hoca notları (§23.2) | izin + transkript bekliyor; şema hazır, veri yok |

## Tuzaklar (hepsi bir kez yaşandı)

1. `pnpm deploy` pnpm'in yerleşiği — sessizce hiçbir şey yapmaz. **`pnpm run deploy`** kullan.
2. Build komutları **repo kökünden** çalışır; `cd apps/web/src` yapıp unutmak `build:web not found` verir.
3. **İki Node var.** Astro 7 komutları (`build`, `dev`, `typecheck`) `scripts/ops/node22.sh` ile
   `/opt/kuran-node` (Node 22) üzerinde çalışır; geri kalan her şey sistem Node 20'de. `pnpm install`'ı
   Node 22 ile çalıştırma — `better-sqlite3` yanlış ABI'ye derlenir, servisler açılmaz.
   Bkz. `docs/DEPLOY_REPORT.md` "Astro 7 / Node 22".
4. `pkill -f "http.server"` kendi bash'ini öldürür (exit 144); `pgrep -f "[h]ttp.server"` kullan.
5. Medya/görsel geldiğinde **kaynağı VE çıktıyı** kare kare tara — figür yasağı (plan §20.3).
   İlk hero kesimi üç yerde figür geçirmişti ve yayına çıkmıştı.
6. **Çalışma dizini sessizce kayıyor.** Arka plan komutları ve `cd`'li zincirler sonrası
   kabuk `/www/wwwroot/kurankesfi.tr`'de kalabiliyor; göreli yollu `rm -rf apps/web/dist`
   ya da `python3 - <<PY` yamaları o zaman YANLIŞ YERDE çalışır ve sessizce başarısız olur
   (bir kez dist hiç silinmedi, bir kez yama hiç uygulanmadı). Repo dosyalarına dokunan her
   komutta **mutlak yol** kullan ya da `cd /opt/kuran &&` ile başla.
7. **`minmax(<sabit>rem, 1fr)` mobilde taşırır.** `auto-fill`/`auto-fit` ızgarada taban
   genişlik esneme DEĞİL alt sınırdır: 24rem'lik ray 328 px'lik alanda 384 px kalır, kart
   sağdan çıkar ve sayfa yatay kayar. Tabanı her zaman `min(<sabit>rem, 100%)` ile sar.
8. **Mutlak konumlu panel `100vw` ile sınırlanamaz.** `left: 0` + `max-width: calc(100vw - …)`
   panelin kapsayıcısının soldan offsetini bilmez; çip satırın ortasındaysa panel o offset
   kadar taşar. Kapsayıcı bloğu satırın tamamını kaplayan öğe yap.
9. **İki oturum aynı repoda build alamaz.** Astro başlarken `dist`'i temizliyor; ikinci
   build birincinin ara dosyalarını siliyor ("Cannot find module dist/pages/....mjs",
   "renderers.mjs"). Bu oturumda üç build böyle kırıldı. Build almadan önce
   `pgrep -f "[a]stro\\.mjs build"` ile bak.
10. `pgrep -f "astro.mjs build"` **kendini yakalar** — beklerken sonsuz döngü olur.
   Köşeli parantezle yaz: `pgrep -f "[a]stro\\.mjs build"`.
11. Türetilmiş ilişkilerde **puan tek başına yetmez, çeşitlilik sınırı şart**. İlk sürümde
   Bakara 153'ün sekiz bağının sekizi de tek bir nadir kökten (عون) geliyordu; sabır bağı
   listeye hiç giremiyordu. `MAX_PER_REF = 3` bunu çözdü — bkz. `scripts/import/lib/relations.ts`.
12. **Ana sayfada elle yazılmış sayı bırakma.** 2026-09-07'de aynı sayfa hem `54` hem `26`
   meal yazıyordu; biri veriden geliyordu, öteki koda gömülüydü ve yazar eklenince bayatladı.
   Sayı daima `authors_index.json`'dan hesaplanır.
13. **`pgrep -f "<desen>"` kendi bash sarmalayıcısını yakalar.** `pgrep -af "node.*astro.mjs build"`
   çalışan build olmadığı hâlde 2 döndürdü: desen, komutu çalıştıran `bash -c`'nin kendi
   komut satırında geçiyor. Köşeli parantez de yetmiyor. Doğrusu süreç adına bakmak:
   `ps -eo comm,args --no-headers | awk '$1=="node" && /astro\.mjs build/'`.
14. **Duman testi yayından hemen sonra yanlış alarm veriyor.** `contains()` gövdeyi
   `|| body=""` ile yutuyor; 13509 dosya kopyalandıktan sonra disk doluyken 20 sn zaman
   aşımı yetmiyor ve `og:image BULUNAMADI` diyor. Sembolik bağlantı çevrilmiş, sayfa 200,
   içerik doğru. 2026-09-07'de iki kez oldu. `contains()` boş gövdede yeniden denemeli.
15. **Sayfa dosyasındaki `import.meta.url` taşınırken kırılır.** `harita.astro` içindeki
   `dirname(fileURLToPath(import.meta.url)) + "../../../../"` şans eseri doğruydu; kütüphaneye
   taşınınca paket `dist/chunks/` altına düşer ve derinlik değişir. Yeni kod `DATA_DIR`
   üzerinden kök buluyor (bkz. `lib/data-dir.ts`, aynı tuzak tefsiri sessizce yayından
   düşürmüştü).
16. **`pkill -f <desen>` de kendi kabuğunu öldürür** (2026-11-20'de yine oldu). Süreci
   `pgrep -x ffmpeg` gibi ADINA göre bul, `kill <pid>` ile durdur.
17. **İki videoyu `ssim`/`psnr` ile karşılaştırırken kareleri sıra numarasıyla eşle.**
   Süzgeç kareleri ZAMAN DAMGASIYLA eşler; mkv (1/1000 sn) ile mp4 damgaları 15 fps'te
   her üç karede bir kayar ve ölçüm 16 dB düşük çıkar. İki girdiye de
   `settb=1/15,setpts=N` uygula.
18. **`.env` değişince servisler görmez.** `kuran-iletisim` ve `kuran-bot` depo kökündeki
   `.env`'i OKUYAMAZ; anahtarları `/etc/kuran/*.env`'den alır. Yenileme komutu
   `infra/systemd/README.md` içinde.
19. **nginx'te `.well-known` istisnası `$uri` ile yazılmaz.** `error_page` iç yönlendirmesi
   `$uri`'yi değiştirir, olmayan dosyada kural tutmaz. `$request_uri` kullan.
20. **rtk kabuk çıktısını kısaltır.** `grep -n` ve `git log --graph` satır düşürebilir;
   ham çıktı için `rtk proxy <komut>`.

## Arşivdeki başlıklar

Kod yorumlarındaki "bkz. docs/DURUM.md" atıflarının çoğu artık `DURUM-ARSIV-2026-09.md`'yi
gösterir:

- Arama (2026-09-08'de yayına girdi)
- Yayındaki modüller
- Yapılmayanlar ve NEDENİ
- Yazma modülü (2026-09-06'da yayına hazır)
- Lafzî benzerlik — yeni ilişki türü (2026-09-06)
- Tefsir katmanı (2026-09-06'da kuruldu) — 2 eser, 13 208 blok
- Şeması var, verisi yok
- Ayet ilişki ağı (2026-09-05'te kuruldu)
- Sure içi konu bölümlemesi (2026-09-05'te tamamlandı)
- Sure sayfasında meal geçişi (2026-09-06'da yapıldı)
- Dipnotlarda ayet bağlantısı (2026-09-06'da yapıldı)
- Kitab-ı Mukaddes atıfları ve alıntıları (2026-09-06'da yapıldı)
- Harita yeniden kuruluyor — MapLibre + Esri (2026-09-05 baslandi)
- Açık konu: `/kissa/*` CSP'si
- Ana sayfada harita + meal sayısı (2026-09-07) — YAYINDA
- AI medyası yayına girdi (2026-09-07) — 10 kayıt
- Mobil taşma denetimi (2026-09-10) — üç düzeltme yayında
- Bot aynı ayeti iki gün gönderdi (2026-09-16) — düzeltildi
- Hero videosu (2026-09-06 durumu)
- Kaynak araştırması — 2026-09-06 (bağlam sıfırlanırsa BURADAN devam)
- Sıradaki adımlar (öneri sırası)
- Medya katmanı (2026-09-06'da kuruldu) — 34 gerçek kayıt, 10 prompt
- Tefsir arayüzü (2026-09-06) — YAYINDA
- Okuma günlüğü — YAYINDA (2026-09-07)
- Arapça kıraat — YAYINDA (2026-09-07)
- İletişim / öneri / düzeltme formu (2026-09-07)
- Yayın — 2026-09-07 (`20260907T063508Z`)
- Telegram botu (2026-09-07) — KOD HAZIR, TOKEN BEKLİYOR
- Sayfa metni denetimi — eskimiş "hazır değil" cümleleri (2026-09-07)
- Ana menü — 11 düz linkten dört başlığa (2026-09-07)
- İlke katmanı — alanlar ve karşıtlık (2026-09-07/08, plan-3-ilke)
