# DEPLOY_REPORT — Sunucu Envanteri ve Kurulum Kayıtları

> Plan §21.1 gereği tutulan kayıt. Her kurulum/servis işleminden sonra bu dosya güncellenir.

## 1. Envanter — 2026-09-03

**Makine:** `31-57-33-232` · Ubuntu 22.04.5 LTS · VMware VM · 4 vCPU · 15 GiB RAM · disk 128 G (%67 dolu, 42 G boş)
**Panel:** aaPanel (`btpanel.service`) — nginx 1.30.2, conf kökü `/www/server/nginx/conf`, vhost'lar `/www/server/panel/vhost/nginx/`
**Toolchain:** Node v20.20.2 · npm 10.8.2 · git 2.34.1 · Python 3.10.12 · psql 16.14 (istemci) · Docker Compose v5.1.4

### 1.1 Kullanımdaki TCP portları (`ss -tlnp`)

| Port | Süreç | Not |
|---|---|---|
| 22 | sshd | |
| 25, 587 | sendmail-mta | localhost |
| 80, 443 | nginx | ana proxy, HTTP/2 + HTTP/3 (QUIC) |
| 888 | nginx | aaPanel dahili |
| 2379, 2380 | etcd | Patroni DCS |
| 3500 | node (esenteg-api) | pm2 |
| 3600, 3800 | next-server | pm2 — esenteg-web, esenteg-storefront |
| 5010 | haproxy | postgres-primary |
| 5011 | haproxy | postgres-replicas |
| 5433 | postgres (Patroni) | **bu makine Sync Standby — salt okunur** |
| 6390 | redis-server | esenteg |
| 6391 | haproxy | redis-master |
| 7001 | haproxy | stats |
| 8009 | patroni | REST API |
| 9100 / 9121 / 9187 | node / redis / postgres exporter | Prometheus |
| 12911, 21941, 33420, 37735 | VS Code server, agent | geçici |
| 15432, 16379, 18080 | docker-proxy | esanalist yığını |
| 26390 | redis-sentinel | esenteg |
| 33832 | webserver | aaPanel |
| 42000 / 42010 / 42020 / 42030 / 42040 / 42051 / 42052 | docker-proxy | fundos yığını (web/api/quant/ai/ingest/redis/qdrant) |

**Bu proje için seçilen portlar:**

| Değişken | Port | Durum | Not |
|---|---|---|---|
| `DB_PORT` | 4322 | ayrıldı | build DB'si, yalnızca `127.0.0.1` |
| `SITE_PORT` | 4321 | ayrıldı | yalnızca `astro dev`; üretimde port kullanılmaz |
| `BOT_PORT` | 4330 | ayrıldı | Faz 3, henüz kullanılmıyor |

Üretimde site statiktir; nginx `dist/`'i doğrudan servis eder, Node süreci ve port gerekmez.

### 1.2 Servisler

- **systemd:** nginx, haproxy, etcd, patroni, redis-esenteg + sentinel, docker, containerd, pm2-root, node_exporter, redis_exporter, postgres_exporter, btpanel, sendmail, certbot.timer
- **pm2 (root):** `esenteg-api`, `esenteg-web`, `esenteg-storefront`, modül `pm2-logrotate`
- **docker:** esanalist (api, worker, scheduler, pg, redis) · fundos (web, api, quant, ai, ingest, redis, qdrant, tefas_session)
- **cron:** `disk-guard.sh`, `node2-watchdog.sh`, `esanalist-docker-cleanup.sh`, aaPanel job; `/etc/cron.d`'de pgbackrest, patroni-failback, etcd-leader-guard, esenteg-dns-failover, web-failover, pg-archive-retention, pg-index-usage, pg-sync-jobs-retention

`kuran-` önekli hiçbir servis, timer veya cron yok — ad çakışması yok.

### 1.3 Mevcut kurankesfi.tr yapılandırması

- Vhost: `/www/server/panel/vhost/nginx/kurankesfi.tr.conf` (aaPanel tarafından yönetiliyor)
- Web kökü: `/www/wwwroot/kurankesfi.tr`
- SSL: `/www/server/panel/vhost/cert/kurankesfi.tr/{fullchain,privkey}.pem` — geçerli, `certbot.timer` aktif
- DNS: `kurankesfi.tr` ve `www.kurankesfi.tr` → `31.57.33.232` ✓
- Loglar: `/www/wwwlogs/kurankesfi.tr.log`, `kurankesfi.tr.error.log`

### 1.4 Dış erişim (import kaynakları)

| Kaynak | Durum |
|---|---|
| `tanzil.net` | 200 ✓ |
| `api.quran.com` | çözümleniyor ✓ |
| `corpus.quran.com` | çözümleniyor ✓ |
| `registry.npmjs.org` | 200 ✓ |
| `api.acikkuran.com` | **NXDOMAIN** ✗ — bkz. §2.3 |

---

## 2. Kritik bulgular

### 2.1 Bu makinedeki PostgreSQL üretim HA cluster'ının standby'ı

Patroni cluster `esenteg-cluster`:

| Üye | Host | Rol | Durum |
|---|---|---|---|
| node1 | 31.57.33.232:5433 (bu makine) | Sync Standby | streaming, **salt okunur** |
| node2 | 89.35.52.143:5433 | Leader | running |

HAProxy `:5010` primary'ye, `:5011` replica'lara yönlendiriyor. Bu cluster esenteg üretimidir; pgbackrest ve failover cron'ları ona bağlıdır.

**Karar:** Build veritabanı bu cluster'a açılmaz. Yerine izole bir Docker PostgreSQL kullanılır (`kuran-pg`, `127.0.0.1:4322`), yalnızca build makinesinde çalışır. Plan §6 ile uyumludur: "PostgreSQL yalnızca build aşamasında; üretimde veritabanı yok."

### 2.2 Node sürümü Astro'yu 5.x'te sınırlıyor

Sistem Node v20.20.2'dir ve pm2'deki üç üretim uygulaması ona bağlıdır; yükseltilmedi.

| Paket | Seçilen | Neden |
|---|---|---|
| pnpm | 10.34.5 | `engines.node >=18.12` — Node 20 uyumlu. Corepack'in çektiği pnpm 11 Node ≥22.13 istiyordu ve `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` ile çöküyordu. |
| Astro | 5.18.2 | Astro 6 ve 7 `engines.node >=22.12.0` istiyor. 5.18.2, `18.20.8 \|\| ^20.3.0 \|\| >=22.0.0` destekliyor. |

Astro 7'ye geçmek istenirse proje-yerel Node 22 (fnm/nvm) kurulması gerekir; sistem Node'una dokunmadan yapılabilir. Astro 5 bu proje için (statik çıktı, island mimarisi, content collections) yeterlidir.

### 2.3 `api.acikkuran.com` erişilemiyor

Sunucudan ve 1.1.1.1'den **NXDOMAIN**. `acikkuran.com` ayakta (200) ancak `/api/surahs` 404 döndürüyor.

Bu adres planın §3'teki ana meal, kök ve `verse_part` kaynağıdır. **Karar:** Faz 0 Tanzil verisiyle sürdürülür (Arapça metin, sure/ayet metadata, nüzul sıraları); Açık Kuran'ın yeni endpoint'i veya indirilebilir dump'ı ayrıca araştırılıp raporlanacaktır. Sonuç olumsuzsa Quran.com API + Quranic Arabic Corpus'a geçilir ve plan §3 tablosu güncellenir.

### 2.4 Deploy kökü

Plan §21.2 `/opt/kuran/dist` diyor; aaPanel vhost'u `/www/wwwroot/kurankesfi.tr` gösteriyor ve panelden vhost yeniden yazıldığında elle yapılan root değişikliği kaybolur.

**Karar:** Kaynak kod `/opt/kuran`'da kalır; build çıktısı `/www/wwwroot/kurankesfi.tr`'ye atomik olarak taşınır (`dist_new` → `mv`). Vhost dosyasına dokunulmaz.

### 2.5 Proje kapsamı dışı güvenlik notu

`/etc/haproxy/haproxy.cfg` içinde Redis AUTH parolası düz metin olarak duruyor (`tcp-check send AUTH ...`). Bu projenin kapsamı dışındadır; dosya izinlerinin gözden geçirilmesi önerilir.

---

## 3. Yapılan değişiklikler

### 3.1 2026-09-03 — Faz 0, Adım 0-1-2

**Sunucuya eklenen:** yalnızca `/opt/kuran/` altındaki yeni dosyalar.
**Değiştirilen mevcut yapılandırma:** yok. Nginx, systemd, cron, mevcut veritabanları ve pm2 uygulamalarına dokunulmadı.

| İşlem | Ayrıntı |
|---|---|
| pnpm kurulumu | `corepack prepare pnpm@10.34.5 --activate` → `~/.cache/node/corepack` |
| Repo | `/opt/kuran` — pnpm workspaces, git deposu |
| Astro telemetri | Kapatıldı (`astro telemetry disable`) + `ASTRO_TELEMETRY_DISABLED=1` build scriptlerine gömüldü — plan §1.3 "takip yok" |
| Kopyalanan | `CLAUDE.md`, `PROJE_PLANI.md` → `/opt/kuran/` ve `/opt/kuran/docs/` |

**Yedek alınan dosya:** yok (mevcut hiçbir dosya değiştirilmedi).

**Açık iş:** `/www/wwwroot/kurankesfi.tr/` içindeki `CLAUDE.md` ve `PROJE_PLANI.md` hâlâ web kökündedir ve dışarıdan indirilebilir durumdadır (`https://kurankesfi.tr/PROJE_PLANI.md` → 200). Deploy adımında (Faz 0, adım 8) web kökü temizlenirken kaldırılacaktır.

### 3.2 2026-09-03 — Faz 0, Adım 3 (build veritabanı)

**Sunucuya eklenen:** bir Docker container ve bir volume. Mevcut hiçbir yapılandırma değiştirilmedi.

| Kaynak | Değer |
|---|---|
| Container | `kuran-pg` — `postgres:16-alpine` |
| Port | `127.0.0.1:4322` → 5432 (dışarı açık değil) |
| Volume | `kuran_pg_data` |
| Network | `kuran_default` |
| Veritabanı / kullanıcı | `kuran` / `kuran` |
| Bellek sınırı | 1 GiB |
| Compose dosyası | `infra/db/docker-compose.yml` |

Şema `infra/db/schema.sql` container ilk başlatmasında otomatik uygulandı: **35 tablo**, 10 enum tipi.
Doğrulanan kısıtlar: `verse_id_formula`, `surah_section_source_required`, `verse_relation_not_self`,
`author_priority_is_default`, `author_license_check`, `location_coords_together` — altısı da hatalı
veriyi reddetti. Test verisi `pnpm db:reset` ile temizlendi.

`.env` oluşturuldu (izin 600, plan §21.3), `DB_PASSWORD` rastgele üretildi. `.env` repoya girmez.

**Şema tasarım notları:**

- `verse.id` = `surah_id * 1000 + verse_number` (identity değil). Tekrarlanabilir build için
  (plan §20.1) yeniden import `verse_id`'leri kaydırmaz.
- `author.slug` ve `source.slug` eklendi. Tarayıcıda saklanan meal seçimi
  (`settings.selectedAuthors`) sayısal id yerine slug tutar; aksi hâlde yeniden build sonrası
  kullanıcıların meal tercihi bozulurdu.
- **Plan sapması:** Plan kaynak bağlantısını `source_id[]` dizisi olarak tarif ediyor. PostgreSQL
  dizilerine yabancı anahtar konulamadığı için tablo başına bağlantı tabloları kullanıldı
  (`story_lesson_source`, `location_source`, `timeline_event_source`, `principle_source`).
  Hatalı kaynak referansı böylece veritabanı düzeyinde engellenir. Statik JSON çıktısında alan
  yine plandaki gibi `sourceIds` dizisi olarak üretilecektir.
- Aynı gerekçeyle `story.related_stories`, `timeline_event.related_surah_ids` ve
  `related_verse_ids` dizileri de bağlantı tablolarına açıldı.
- `subscription` tablosu bu veritabanında **değildir**; ayrı bot veritabanı şeması
  `infra/db/bot_schema.sql` içindedir (plan §19.6, Faz 3).

### 3.3 2026-09-03 — Faz 0, Adım 4 (Tanzil import)

**Sunucuya eklenen:** yok. Yalnızca repo dosyaları, `cache/` içeriği ve build veritabanı satırları.

`scripts/import` paketi (`@kuran/import`) eklendi: `lib/env.ts`, `lib/cache.ts`, `lib/db.ts`,
`lib/slug.ts`, `lib/log.ts`, `tanzil.ts`.

**Sonuç:** 114 sure, 6236 ayet, 604 sayfa, 30 cüz, 15 secde ayeti — rapor `reports/tanzil.md`,
0 sorun. İkinci çalıştırma tamamen `cache/`'ten okudu ve veri karması (md5) değişmedi:
**idempotentlik doğrulandı.**

**Doğrulanan örnekler:** `2:142` → cüz 2 · `2:255` → sayfa 42 · `78:1` → cüz 30 ·
`32:15` → secde · `114:6` → sayfa 604 · `12` → slug `yusuf-suresi` (plan §20.2 örneğiyle birebir).
`20:1` (طه) üç metin biçiminde de aynıdır — mukattaa harfleri, beklenen davranış.

**Türkçe sure adları kaynağı:** Tanzil metadata'sında Türkçe ad yok. Quran.com API
(`/api/v4/chapters?language=tr`) kullanıldı; iki kaynağın nüzul sırası birebir uyuşuyor.
Her iki kaynak `source` tablosuna kaydedildi.

**Boş bırakılan alanlar (ayrı kaynak gerekiyor):** `surah.revelation_order_noldeke`,
`verse.transcription_tr`, `verse.transcription_en`.

**`cache/` boyutu:** ~3,9 MB (4 Tanzil XML + 1 Quran.com JSON). Git'e girmez.

> **⚠ §3.4 KISMEN GEÇERSİZ — bkz. §3.6 (aynı gün, sonraki düzeltme).**
> Aşağıdaki bölüm Açık Kuran'ı kullanılamaz sayıyordu. Bu yanlıştı: veri
> CC BY-NC-SA 4.0 ile açıkça lisanslıdır ve sitenin sayfa verisi ucundan
> erişilebilir durumdadır. §3.6 düzeltmeyi ve yeni kaynak kararını içerir.

### 3.4 2026-09-03 — Faz 0, Adım 5 (kaynak araştırması, salt okuma)

Dosya değişikliği yok; yalnızca araştırma ve karar kaydı.

**Açık Kuran API'si kapanmıştır.** Kanıt:

- `api.acikkuran.com` ve `test-db.acikkuran.com` → NXDOMAIN (1.1.1.1 dahil)
- GitHub issue [acik-kuran/acikkuran-api#20](https://github.com/acik-kuran/acikkuran-api/issues/20),
  2026-08-08'den beri açık; kullanıcılar aynı DNS hatasını bildiriyor, bakımcıdan yanıt yok
- API deposuna son commit 2024-12-25
- Issue #16 (2026-01-23) bakımcı yanıtı: prod veritabanı dışarı açılamaz, test DB'de eski veri var
- Depo README'si: "do not use this data in your own application"

Kullanıcılar `acikkuran.com/_next/data/<buildId>/…` iç uçlarını kazıyor. **Kullanılmayacaktır:**
yayınlanmamış iç uç, her deploy'da değişen build ID'ye bağlı, gönüllü servise izinsiz yük —
plan §20.1 "kaynak nezaketi" ile çelişir.

**Yerine seçilen kaynak: Tanzil çeviri seti (10 Türkçe meal).** Onunun da indirilebilirliği
doğrulandı (`https://tanzil.net/trans/tr.*`, hepsi HTTP 200):

Diyanet İşleri · Diyanet Vakfı · Elmalılı Hamdi Yazır · Ali Bulaç · Süleyman Ateş ·
Abdulbaki Gölpınarlı · Yaşar Nuri Öztürk · Suat Yıldırım · Edip Yüksel · Muhammet Abay (çeviriyazı)

Şart: atıf + ticari olmayan kullanım. Proje ticari değildir ve `data/` lisansı CC BY-NC-SA 4.0'dır.

**Ek kazanım:** `tr.transliteration` (Muhammet Abay Çeviriyazı) `verse.transcription_tr` alanını
doldurur; plan §2.5'in "Arapça bilmeyenler için transkripsiyon her zaman görünür" şartı karşılanır.

**KARAR — plan §3.1 öncelikli meal listesi güncellendi.** Mehmet Okuyan ve Mustafa İslamoğlu
hiçbir açık lisanslı sette yok (yalnızca Açık Kuran'da vardı); Muhammed Esed yalnızca lisansı
doğrulanamayan topluluk derlemesinde var. Yeni öncelik sırası:

| priority | Meal | Kaynak |
|---|---|---|
| 1 | Diyanet İşleri | Tanzil `tr.diyanet` |
| 2 | Elmalılı Hamdi Yazır | Tanzil `tr.yazir` |
| 3 | Ali Bulaç | Tanzil `tr.bulac` |
| 4 | Süleyman Ateş | Tanzil `tr.ates` |

Okuyan / İslamoğlu / Esed yalnızca hak sahibinden yazılı izinle eklenir (plan §3.1 telif kuralı).

**Reddedilen kaynak:** `fawazahmed0/quran-api` — 31 Türkçe meal (Esed dahil) sunuyor ancak meal
başına lisans doğrulanamıyor. Plan §3.1 "lisansı belirsiz meal import edilmez" gereği kullanılmaz.

**Faz 3 riski:** Açık Kuran'ın `/root` ve `/verseparts` uçları Kök Kelime Keşfi'nin (plan §2.5)
kaynağıydı. Quranic Arabic Corpus (GPL, atıf) morfolojiyi verir ama **Türkçe kök anlamı vermez**;
`root.meaning_tr` için ayrı kaynak gerekecek. BACKLOG'a işlendi.

**Depolama ölçümü (kullanıcı sorusu üzerine):** `cache/` 3,9 MB · `node_modules` 234 MB ·
build DB 17 MB · boş disk 41 GB. Veri değil bağımlılıklar yer kaplıyor. `cache/` atılabilir ve
yeniden üretilebilir (`rm -rf cache/ && pnpm data:import`), bu yüzden harici nesne depolaması (R2)
şu aşamada eklenmemektedir — build'i harici servise bağımlı kılmak plan §1.7 ve §6 ile çelişir.

### 3.5 2026-09-03 — Faz 0, Adım 6 (statik JSON üretimi + referans linter)

**Sunucuya eklenen:** yok. Repo dosyaları ve `apps/web/public/data/` çıktısı (git'e girmez).

**Yeni paketler:**

| Paket | Rol |
|---|---|
| `packages/pipeline` (`@kuran/pipeline`) | Build makinesi yardımcıları: `env`, `db`, `cache`, `log`, `slug`. `scripts/import`'tan taşındı, `scripts/build` ile paylaşılıyor. Node'a bağımlı, tarayıcıya gitmez. |
| `scripts/build` (`@kuran/build`) | `build.ts` (JSON üretimi) + `linter.ts` (referans linter) |

`packages/schema` içine `static_data.ts` eklendi: statik JSON çıktı şemaları. Üretici, tüketici
(web) ve linter aynı tanımı kullanır.

**Üretilen çıktı:** 116 dosya, 4,15 MB — `surahs_index.json`, `surah/surah_{id}.json` (114),
`sources.json`. **Tekrarlanabilirlik doğrulandı:** iki ardışık `build:data` bayt bayt aynı
çıktıyı üretti (plan §20.1).

**Referans linter:** 259 denetim, temiz. Gerçekten yakaladığı dört bozma testiyle doğrulandı
(silinmiş sure dosyası, bozuk JSON, `data/` içinde `2:999` ve `115:1`, veritabanından silinmiş
ayet) — ayrıntı `scripts/build/README.md`.

**Build zinciri:** `pnpm build` = `build:data` → `lint:refs` → `build:web`. Linter'dan
geçmezse zincir durur.

**Olay: `pnpm import` lockfile'ı sildi.** `import`, pnpm'in yerleşik komutudur (başka bir
lockfile'dan `pnpm-lock.yaml` üretir) ve kök script adımı gölgeleyip mevcut lockfile'ı sildi.
`git checkout -- pnpm-lock.yaml` ile geri alındı, script `data:import` olarak yeniden adlandırıldı.
Plan §20.1'deki `pnpm import && pnpm build` ifadesi düzeltilmeli — BACKLOG'a işlendi.

**Ertelenen çıktılar** (veri geldikçe): `story/*.json`, `locations.json`, `concept_graph.json`,
`roots_index.json`, `search_index.json`, `schedule.json`. Ayet başına dosya
(`verse/verse_2_153.json`) mealler eklendikten sonra üretilecek; şu an 6236 neredeyse boş dosya
olurdu.

### 3.6 2026-09-03 — Adım 5 DÜZELTMESİ: Açık Kuran kullanılabilir

Kullanıcı §3.4'teki sonucu sorguladı: *"buradaki bilgileri paylaşıma açmış zaten, neyin izni?"*
Haklıydı. §3.4 iki hata içeriyordu.

**Hata 1 — lisans/izin sorunu diye sunulması.** Öyle bir sorun yok.
`acik-kuran/acikkuran-api` deposundaki `LICENCE` dosyası tam **CC BY-NC-SA 4.0** metnidir.
Bu açık bir lisanstır; proje ticari değildir ve `data/` aynı lisansla yayınlanır, yani
ShareAlike şartı da karşılanır. Atıf dışında izin gerekmiyor.

**Hata 2 — yanlış alıntı.** *"do not use this data in your own application"* ifadesi depo
README'sine atfedilmişti. Aslında `.env.example` içindedir ve yalnızca **test veritabanı**
için söylenmiştir ("there may be inconsistencies and errors in the data"). Genel veri
politikası değildir; kaynak olduğundan kısıtlayıcı gösterilmiştir.

**Doğru olan tek engel erişilebilirlikti** ve o da aşıldı. Organizasyonda üç depo var
(`api`, `frontend`, `chrome-extension`), üçü de yalnızca uygulama kodu; veri hiçbirinde yok.
Ancak site ayaktadır ve kendi sayfa verisi ucundan tam veriyi vermektedir:

```
/_next/data/<buildId>/<sure>/<ayet>.json      Cookie: settings={"a":<yazarId>}
```

Tek istek şunların **hepsini** döndürür:

| Alan | İçerik |
|---|---|
| `translations` | **50 meal** (23 Türkçe + 27 İngilizce), her biri `footnotes` ile |
| `words` | Kelime bazlı `verse_part`: Arapça, transkripsiyon tr/en, çeviri tr/en, sıra |
| `words[].root` | `{latin, arabic, mean}` — **Türkçe kök anlamı dahil** |
| `words[].details` | Tam morfoloji, Türkçe + İngilizce gramer etiketleriyle |
| `verse` | Arapça metin, transkripsiyon tr/en, sayfa, cüz |

**Plan §3.1'in ORİJİNAL öncelikli meal listesi uygulanabiliyor** — üçü de mevcut:

| priority | Meal | §3.4'teki hatalı sonuç |
|---|---|---|
| 1 | Diyanet İşleri | bulunmuştu |
| 2 | **Mehmet Okuyan** — Kur'an Meal-Tefsir (dipnotlu) | "hiçbir sette yok" ✗ |
| 3 | **Mustafa İslamoğlu** — Hayat Kitabı Kur'an | "hiçbir sette yok" ✗ |
| 4 | **Muhammed Esed** — Kur'an Mesajı | "lisansı doğrulanamıyor" ✗ |

**Faz 3 riski de kalktı.** §3.4 `root.meaning_tr` için kaynak kalmadığını söylüyordu;
`words[].root.mean` bu veriyi Türkçe olarak veriyor.

**Karar:** Açık Kuran birincil meal/kök kaynağı olur. Tanzil rolünü korur: Arapça metin,
sure/ayet numaralandırması, sayfa/cüz/secde, nüzul sırası (plan §20.1 "tek gerçek kaynak").
Kullanıcı kararı: **İngilizce mealler de alınır** — ileride İngilizce dil seçeneği olacak.

`scripts/import/tanzil_translations.ts` silinmedi; **yedek** olarak duruyor. Gerekçe: Açık
Kuran'ın API'si bir kez zaten kapandı. Varsayılan zincirde çalışmaz.

**Yöntem notu:** `buildId` her dağıtımda değişir, bu yüzden her çalıştırmada ana sayfadan
yeniden okunur. Önbellek anahtarı `buildId` **içermez**; aksi hâlde kaynağın her dağıtımı tüm
önbelleği geçersiz kılardı. 6236 istek tek seferliktir, `p-limit` ile sınırlanır, gzip'li
önbelleğe alınır (~75 MB) ve ikinci çalıştırma ağdan veri çekmez. İstek başlığı projeyi
açıkça tanıtır.

**Önbelleğe gzip desteği** `packages/pipeline/src/cache.ts` içine eklendi (`gzip: true`);
binlerce küçük JSON için diskte ~%75 tasarruf.

### 3.7 2026-09-03 — GÖREV 01 + GÖREV 02 (otopilot)

Kullanıcı `GOREV_01_schema_zod.md`, `GOREV_02_migration_uretici.md` ve
`SD01_sema_degisikligi.md` dosyalarını okumamı ve otopilotta devam etmemi istedi.

**Sunucuya eklenen:** yok. Yalnızca repo dosyaları. Geçici `kuran_migtest`
veritabanı oluşturulup doğrulama sonrası silindi.

**GÖREV 01** — `packages/schema/src/`: `references.ts`, `scholar-notes.ts`,
`export.ts`, `core.ts`. 29 duman testi, hepsi geçti; GÖREV 01 §Doğrulama'daki
7 maddenin tamamı kapsandı.

Çakışma çözümü: `VerseKey` hem `common.ts` hem `references.ts`'te tanımlıydı.
`common.ts`'teki kaldırıldı — regexi `^\d{1,3}:\d{1,3}$` idi ve `115:1`,
`999:1` gibi geçersiz anahtarları kabul ediyordu. Bu, kullanıcı verisi
doğrulamasında gerçek bir hataydı.

**SD-01** `docs/PROJE_PLANI.md` §23.2'ye işlendi (SD-01 uygulama sırası adım 1;
GÖREV 02'nin ön koşuluydu). §23 bölümü dokümanda hiç yoktu.

**GÖREV 02** — `packages/schema/src/generate/` (7 dosya) + üretilen
`migrations/{postgres,sqlite}/001_init.sql`.

Doğrulama, GÖREV 02 §Doğrulama'daki 6 maddenin tamamı:

| # | Kontrol | Sonuç |
|---|---|---|
| 1 | `pnpm schema:generate` iki dosya üretir | 126 + 153 satır |
| 2 | PostgreSQL'de boş test DB'de çalışır | 10 tablo ✓ |
| 3 | SQLite'ta çalışır | 12 tablo ✓ |
| 4 | `PRAGMA foreign_key_check` | temiz ✓ |
| 5 | `--check` elle düzenlemeyi yakalar | ✓ |
| 6 | Tablo sırası FK'den çözülür, döngü hata verir | ✓ |

**Açık karar:** GÖREV 02 / N6 postgres migration'ının tüm tabloları içermesini
söylüyor; bu `infra/db/schema.sql`'in değiştirilmesi demek. Kullanıcının bu
oturumdaki kapsam kararı ("yalnızca paylaşılan hoca notu tabloları") esas
alındı, tek taraflı değiştirilmedi. Ayrıntı `docs/BACKLOG.md`.

### 3.8 2026-09-03 — Klasik okuma ekranı (arayüz)

Sunucu yapılandırması **değişmedi**; bu bölüm yalnızca deploy sırasında
gereken vhost ayarını kayda geçirir.

**Üretilen sayfalar:** 6352
(114 sure + 6236 ayet + ana sayfa + `/sureler`).

| Sayfa | Ham | gzip |
|---|---|---|
| `index.html` | 2,4 KB | 1,2 KB |
| `sureler.html` | 52 KB | 4,6 KB |
| `fatiha-suresi.html` | 10 KB | 2,4 KB |
| `bakara-suresi.html` (286 ayet, en büyük) | 381 KB | 66 KB |
| `bakara-suresi/153.html` (50 meal) | 25 KB | 6,6 KB |
| `bakara-suresi/282.html` (en büyük ayet) | 108 KB | 25 KB |
| CSS (tek dosya, tüm sayfalar) | 16 KB | 4,2 KB |
| JS | **0** | **0** |

`dist/` toplam: **153 MB HTML + 177 MB JSON veri + 1 MB font ≈ 331 MB.**
Atomik deploy (`dist_new` → `mv`) sırasında geçici olarak iki kopya durur,
yani ~700 MB gerekir. Sunucuda 41 GB boş alan var (§1.2).

**Nginx'te gereken ayar — henüz yapılmadı.**

Astro `build.format: "file"` ile üretiyor:

```
/sureler            -> sureler.html
/bakara-suresi      -> bakara-suresi.html
/bakara-suresi/153  -> bakara-suresi/153.html
```

Uzantısız URL'lerin çalışması için vhost'ta şu gerekir:

```nginx
location / {
    try_files $uri $uri.html $uri/index.html =404;
}
```

Bu satır olmadan ana sayfa dışındaki her adres 404 verir. Deploy adımında
vhost `*.bak.<tarih>` olarak yedeklenip eklenecek (plan §21.1, CLAUDE.md
kural 3).

**Ayrıca deploy sırasında bakılacak:** `gzip on` zaten açık ve
`application/json` listede (§3.5). `font/woff2` ve `text/html` de
listede mi — woff2 zaten sıkıştırılmış olduğu için gzip'lenmemeli.

### 3.9 2026-09-04 — İlk yayın (site canlıda)

**https://kurankesfi.tr yayında.** Sunucu yapılandırması değişti; hepsi aşağıda.

#### Yedek

| Dosya | Yedek |
|---|---|
| `/www/server/panel/vhost/nginx/kurankesfi.tr.conf` | `kurankesfi.tr.conf.bak.20260904` |

Yedek alınırken md5 karşılaştırıldı: `d5713fce671fe5c9ae1144f91526f944` (aynı).

#### Yayın düzeni — atomik

```
/www/wwwroot/kurankesfi.tr/
  .well-known/            SSL doğrulama — aaPanel kullanır, ELLENMEZ
  releases/<UTC zaman>/   her yayın ayrı dizin (342 MB)
  current -> releases/…   sembolik bağ; nginx root'u burası
```

Yeni sürüm önce `releases/<zaman>.part` dizinine yazılır, izinler verilir,
sonra `mv -T` ile adı düzeltilir; en son `current` bağı `ln -sfn` + `mv -Tf`
ile **tek işlemde** değiştirilir. Ziyaretçi hiçbir an yarım yayınlanmış site
görmez. Geri alma tek komut.

`scripts/deploy/deploy.sh` — `pnpm deploy` / `deploy:list` / `deploy:smoke` /
`deploy:rollback`. Script build yapmaz; önce `pnpm build`.

**`.well-known` neden bağ:** vhost'taki SSL doğrulama bloğu bir Lua betiği ve
`$document_root` altına bakıyor — yani artık `current/` içine. Sertifika
yenilemesi kırılmasın diye her yayında `current/.well-known` sabit dizine
sembolik bağ olarak kuruluyor. Canlıda doğrulandı: `.well-known` altına
konan dosya HTTP üzerinden okunabiliyor.

#### Vhost değişiklikleri

| Ne | Neden |
|---|---|
| `root` → `…/current` | atomik yayın |
| `index index.php … ` → `index index.html;` | site tamamen statik |
| `include enable-php-00.conf;` yoruma alındı | PHP kapalı (dosya zaten boştu) |
| `location / { try_files $uri $uri.html $uri/index.html =404; }` | uzantısız URL'ler; bu satır olmadan ana sayfa dışında her şey 404 |
| `location ^~ /_astro/` → `expires 1y` | dosya adı içerik özetiyle (`_surah_.D4e65yLh.css`) |
| `location ^~ /fonts/` → `expires 30d` | ad sabit, içerik değişebilir; `immutable` kullanılmadı |
| `location ^~ /data/` → `expires 1h` | her build'de değişebilir |
| CSP + `X-Content-Type-Options` + `Referrer-Policy` + `Permissions-Policy` + `COOP` | aşağıda |

**Content-Security-Policy:**

```
default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline';
font-src 'self'; connect-src 'self'; manifest-src 'self';
base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

`script-src` yazılmadı, `default-src 'none'`a düşüyor: sitede **0 bayt
JavaScript** var. Bu, "takip yok" sözünü iddia olmaktan çıkarıp tarayıcının
uyguladığı bir kurala çeviriyor. **Faz 1'de Astro island'ı (harita, graf,
arama) eklenirse buraya `script-src 'self'` EKLENMELİDİR**, yoksa sessizce
çalışmaz. Vhost'ta bu not yazılı.

`add_header` tuzağı: nginx'te bir `location` içindeki `add_header`, sunucu
düzeyindeki **tüm** `add_header`'ları iptal eder. Bu yüzden önbellek
location'larında yalnızca `expires` kullanıldı — `_astro/` için
`Cache-Control: immutable` bilerek yazılmadı, HSTS ve CSP'yi düşürürdü.
Canlıda doğrulandı: CSS yanıtında CSP ve HSTS var.

#### Doğrulama (canlı)

Duman testi, `deploy.sh` içinde ve her yayında otomatik çalışıyor — 11 kontrol:

```
/  /sureler  /fatiha-suresi  /bakara-suresi/153  /nas-suresi/6
/404.html  /fonts/inter-latin.woff2  /data/surahs_index.json   → 200
/olmayan-bir-adres  /.user.ini  /manifest.json                 → 404
```

Ayrıca elle:

| Kontrol | Sonuç |
|---|---|
| Gerçek DNS üzerinden erişim | `31.57.33.232` → 200 |
| `/bakara-suresi` gzip | 381 KB → **68 KB** |
| `/data/surahs_index.json` gzip | → 4,5 KB |
| Font `Content-Type` | `font/woff2`, `max-age=2592000` |
| Sayfada `<script`  | **yok** |
| Kaynak rozeti, zorunlu atıf, dipnot çapası, 50 meal | hepsi var |
| `.well-known` okunabilirliği | ✓ |
| Atomik geçiş + geri alma + ileri alma | üçü de çalıştı |
| Tek sürüm varken `--rollback` | reddetti (çıkış 1) |

#### Bilinen davranış

- **aaPanel bu vhost'u yeniden yazabilir.** Panelden siteyle ilgili bir ayar
  değiştirilirse `root` ve `try_files` kaybolabilir; site o an tamamen 404'e
  düşer. Panelde bir işlem yapıldıysa `pnpm deploy:smoke` çalıştırılmalı.
- Bir yayın 342 MB. `KEEP=2` ile diskte en fazla 3 sürüm ≈ 1 GB durur.
- İlk yayın sonrası `nginx -s reload` ardından gelen ilk istek bir kez
  HTTP/2 çerçeve hatası verdi (kapanmakta olan eski worker). Duman testine
  `--retry 3` eklendi; tekrar görülmedi.

### 3.10 2026-09-04 — Marka kimliği, tanıtım sayfası, çeviriyazı

Sunucu yapılandırması **değişmedi.** Yalnızca içerik yayınlandı.

| | |
|---|---|
| Yayın | `20260904T025021Z` |
| Sayfa | 6354 (114 sure + 6236 ayet + 4 sabit) |
| Boyut | 360 MB |
| Duman testi | 13 kontrol, temiz |

**Yeni sayfalar:** `/` (12 bölümlük tanıtım, plan §14.1), `/kaynaklar`
(Kaynak Şeffaflığı, plan §9 ve §12.10).

**Tasarım:** `docs/DESIGN.md`'deki lacivert + altın sistemi uygulandı.
Palet WCAG AA'ya göre ölçüldü, açık modda kalan dört değer düzeltildi ve
`--accent-text` eklendi — ayrıntı ve ölçümler DESIGN.md §10.

**Çeviriyazı** 0/6236'dan 6236/6236'ya çıktı; yeni kaynak kaydı
`tanzil-transliteration`, atıf listesine "Çeviriyazı: Muhammet Abay (Tanzil)"
eklendi.

**Yazı tipleri:** Playfair Display eklendi (26,4 KB, ağırlık 600 sabit).
Toplam 148 KB; sayfa başına en fazla 127,1 KB (Arapçalı) / 87,8 KB (Latin).
Plan §20.4 bütçesi 140 / 95 KB — ikisi de tutuyor.

**Duman testine eklendi:** `/kaynaklar`,
`/fonts/playfair-display-latin.woff2`.

**Hatırlatma:** CSP'de `script-src` yok (`default-src 'none'`). Faz 1'de
Astro island'ı eklenirse vhost'a `script-src 'self'` yazılmalı, yoksa
sessizce çalışmaz. Bkz. §3.9.

### 3.11 2026-09-04 — Kelime ve kök kapısı

Sunucu yapılandırması **değişmedi.**

| | |
|---|---|
| Sayfa | 7996 (önceki 6354 + 1641 kök + kök listesi) |
| Boyut | ~400 MB |
| Duman testi | 17 kontrol, temiz |

Plan §2'nin beş keşif kapısından **"Kelime" açıldı**: 77.429 kelime,
1.641 kök, kelimelerin %61'i bir köke bağlı.

- Ayet sayfasına "Kelimeler" bölümü — kelime kelime karşılık ve kök bağlantısı
- `/kok` — 1641 kök; en çok geçen 50 kart hâlinde, altında harf harf alfabetik
- `/kok/<arapça kök>` — kökün anlamı ve bütün geçişleri, sure sure gruplu

#### Kök adresleri Arapça harf taşıyor

`/kok/قول`. Latin çevriyazı (`qwl`, `Sbr`, `$tt`) **büyük-küçük harf
anlamlıdır** — `S`=ص ama `s`=س, `T`=ط ama `t`=ت. Küçültüldüğünde 1641 kökten
141'i çakışıyor, adres olarak kullanılamaz. Arapça kök ise veritabanında
`UNIQUE`.

Yayınlamadan **önce** sunucuda denendi: geçici bir `kok/قول.html` dosyası
konup nginx'in hem yüzde kodlu (`%D9%82%D9%88%D9%84`) hem ham UTF-8 isteği
çözdüğü doğrulandı, sonra dosya silindi. Artık duman testinin parçası.

#### Süreç hatası — kayda geçiyor

Bu yayında `pnpm lint:refs` **başarısızdı ve fark edilmeden deploy edildi.**
Sebep: komut `| tail -2` ile borulanmıştı, `&&` zincirinin gördüğü çıkış kodu
`tail`'inki (0) oldu. Hatanın kendisi zararsızdı — linter kök dosya adlarını
(Arapça) plan §20.2'nin "alt çizgili küçük harf" kuralına takmıştı, veri
bütünlüğüyle ilgisi yoktu — ama süreç yine de kırılmıştı.

Alınan önlem: linter'a kök dosyaları için dar bir istisna yazıldı (yalnızca
Arap harfleri, 1-8 harf; boşluk ve karışık alfabe hâlâ reddediliyor) ve
kök/kelime çıktıları artık gerçekten **doğrulanıyor** — önceden "şeması yok,
atlandı" diye 7884 uyarı basıyordu.

Denetim sayısı 24.236 → **39.995**.

### 3.12 2026-09-04 — Plan §23 kararları, Source Serif 4, yumuşak tire temizliği

Sunucu yapılandırması **değişmedi.**

**Plan §23 yazıldı** (§23.1 amaç/kapsam/içerik kuralları, §23.3 arayüz,
§23.4 yayın öncesi tamamlanacaklar). Kullanıcı kararları:

| Karar | Sonuç |
|---|---|
| Özet vs. CLAUDE.md kural 4 | Özet kalır ama "platform verisi" rozetiyle; alıntı ayrı "kaynaklı" rozetle |
| Telif | ≤200 karakter alıntı + derin bağlantı, önceden izin istenmez, kaldırma talebi 7 gün içinde |
| Hoca seçimi | Kapalı liste, elle onay, yazılı "ehliyet ölçütü" yok |
| Yayın kapısı | `published`'a elle onay |
| Yerleşim | Ayet sayfası + `/hoca/<ad>` + sure sayfasında işaret + tür sayfaları |
| Çelişen görüş | Yan yana, ilişki etiketli ("X'e katılmıyor") |
| `dogru_bilinen_yanlis` | `yaygin_anlayisa_farkli_bakis` olarak yeniden adlandırıldı |

**Source Serif 4 eklendi** — meal ve dipnot metni artık uzun okuma serifiyle
diziliyor (32,4 KB, tek ağırlık). Inter arayüz, çeviriyazı ve kelimelerde
kalıyor; ağırlık aralığı 300–700'den 400–700'e daraltıldı (300 hiçbir yerde
kullanılmıyordu): 61,4 → 49,1 KB.

Font bütçesi ölçülüp plan §20.4 güncellendi: okuma ekranı **147,2 KB**
(önceki hedef 140), Latin sayfa **75,5 KB** (hedef 95). Hedef 150/95 oldu;
aşımın sebebi sonradan eklenen okuma serifidir, gerekçe planda yazılı.

**Yumuşak tire temizlendi** — 523 `U+00AD`. Görünmez ama kopyala-yapıştırda
metne bulaşıp aramayı bozuyordu.

**Doğrulayıcı düzeltildi:** Source Serif 4 önce yanlış korpusla sınandı
(çeviriyazı) ve 4768 satırda hata verdi. O metni Source Serif hiç çizmiyor —
çeviriyazı Inter'in işi. Ayrı bir "meal" korpusu tanımlandı; beş fontun beşi
de temiz. Ayrıca `˹ ˺` (U+02F9/02FA, İngilizce meallerde 5763 kez) Source
Serif'te yok; `--font-reading` yığınına Inter eklendi, o karakterler ona düşüyor.

### 3.13 2026-09-04 — Marka kimliği, yazı tipi değişimi, tanıtım sayfası, kanonik adres

Sunucu yapılandırması **değişmedi.** Yayın: `20260904T204027Z`, 7996 sayfa,
duman testi 24 denetim temiz.

**Marka üretimi otomatikleştirildi.** Yeni paket `scripts/brand`
(`@kuran/brand`, sharp). Tek kaynak `logo-source.png` (512×512); on çıktı
ondan **küçültülerek** türetilir — webp 256/128/96/48, png 256/96,
favicon 32/16, apple-touch-icon 180, og-image 1200×630. Fontlarda olduğu gibi
`manifest.json` her dosyanın sha256'sını yazar ve `pnpm brand:check` üretilenle
diskteki baytları karşılaştırır; ikisi ayrışırsa komut düşer.

İki ayrıntı ölçüldü, varsayılmadı:

- **apple-touch-icon zemini düzleştiriliyor.** iOS saydam zemini siyaha çevirir;
  logo altın çerçeveli bir daire olduğu için saydam bırakılsa kenarda siyah
  halka kalırdı. Zemin açıkça `#071023`'e düzleştirildi.
- **og-image büyütülmüyordu, artık küçültülüyor.** İlk sürüm 260 piksellik bir
  ara çıktıyı 340'a büyütüyordu; kaynaktan doğrudan 340'a küçültülüyor.

**Latin yazı tipleri değişti.** Inter → **Karla** (arayüz ve gövde),
Playfair Display → **Cormorant Garamond** (başlık). Değişimin sakladığı bir
tuzak vardı ve `fonts:verify` yakaladı:

> **Karla, ayet okunuşundaki harfleri taşımıyor.** ḳ ẕ ḥ ḫ ṣ ḍ ŝ ṭ — Cormorant
> ve Source Serif de ḳ ile ẕ'yi taşımıyor. Eski gövde fontu Inter hepsini
> taşıdığı için sorun *görünmüyordu*: font değişince 5751 çeviriyazı satırı
> sessizce sistem fontuna düşecekti.

Çözüm: eksik 15 kod noktası Inter'den alt kümelenip **Kesif Latin Ek** adıyla
ayrı bir aile olarak yığının başına konuldu — 2,3 KB, `unicode-range` ile
sınırlı, o harfler sayfada geçmiyorsa indirilmez. Doğrulayıcıya altıncı font
olarak eklendi; altı fontun altısı da temiz.

Sayfa başına font yükü yeniden ölçüldü ve plan §20.4 güncellendi: okuma ekranı
**156,3 KB**, tanıtım 123,9 KB, Latin sayfa 83,5 KB. Hedef 150 → 160 KB'a
çıkarıldı; sebebi Cormorant'ın Playfair'den 24,5 KB büyük olması (Karla,
Inter'e göre 18,8 KB kazandırıyor ama farkı kapatmıyor). Cormorant'ın ağırlık
ekseni 400'e sabitlenirse 18 KB daha iner; başlık hiyerarşisi düzleşeceği için
karara açık bırakıldı (DESIGN.md §12).

**Tanıtım sayfası yeniden yazıldı** — `docs/landing.html` görsel diline göre on
bölüm. İki yerde tasarım JS istiyordu, ikisi de betiksiz karşılandı:

| Tasarımdaki davranış | JS'siz karşılık |
|---|---|
| Menü hero üzerinde saydam, kaydırınca katılaşır | Menü her zaman katı; aynı okunaklılık, 0 bayt JS |
| Bülten kayıt formu | Form konulmadı — arkasında sunucu yok, çalışmayan kutu göstermek yanıltmak olurdu |

**İki sessiz hata bulundu ve düzeltildi.** İkisi de 200 döndüğü için hiçbir
duman testi yakalamıyordu:

1. **Kanonik adres `.html` ile çıkıyordu.** `build.format: "file"` ile
   `Astro.url.pathname` derleme sırasında ÇIKTI DOSYASININ yolunu veriyor
   (`/bakara-suresi/153.html`), yayınlanan adresi değil. Site kendi hiçbir
   yerinden bağlanmadığı bir adresi kanonik ilan ediyordu.
2. **Menüde `aria-current="page"` hiç çalışmıyordu.** Aynı sebep:
   `"/sureler.html" === "/sureler"` yanlış. Ekran okuyucu bulunulan bölümü
   söyleyemiyordu.

Tek düzeltme ikisini birden kapattı: `apps/web/src/lib/site.ts` içinde
`routePath()` çıktı yolunu yayın adresine çeviriyor. `SITE` sabiti de oraya
taşındı — `sitemap.xml` ile Open Graph'ın ayrışması mümkün değil artık.

**Open Graph tamamlandı.** `og:image` **göreli** yazılmıştı; paylaşım botları
göreli adres çözmez, önizleme görselsiz çıkardı. Mutlak yapıldı; `og:url`,
`og:image:width/height/alt` ve kanonik bağlantı eklendi. `theme-color` tek
koyu değerdeydi, iki temaya ayrıldı (`#071023` / `#EFE6D3`).

**Duman testi içerik denetimi kazandı.** Durum kodu doğruyken içeriği yanlış
olabilen şeyler için `contains()` eklendi; `og:image`'ın mutlak olduğunu ve
kanonik adresi metinden okuyarak doğruluyor. Ayrıca yeni font ve marka
dosyaları denetime girdi: 19 → 24 denetim.

**`pnpm deploy` çalışmıyor — `pnpm run deploy` kullanılmalı.** `deploy`,
`import` gibi pnpm'in **yerleşik** komutudur; script'i gölgeliyor ve
`ERR_PNPM_NOTHING_TO_DEPLOY` veriyor. `pnpm import` tuzağının aynısı
(bkz. §3.5); BACKLOG'a işlendi.

**Doğrulama:** typecheck 21 dosya 0 hata · 29/29 test · `fonts:check` temiz ·
`fonts:verify` altı font temiz · `brand:check` temiz · linter 39.995 denetim
temiz (6 uyarı, hepsi bilinen) · parmak izi `63157dbd257a87fa` (değişmedi —
veri boru hattına dokunulmadı) · JS 0 bayt · CSS 3,0 KB (tanıtım) / 6,1 KB
(okuma) gzip.

### 3.14 2026-09-04/05 — Hero videosu, hoca notu alımı, kaynak bağlantısı

**Sunucu yapılandırması DEĞİŞTİ — ve bu değişiklik henüz CANLIYA UYGULANMADI.**
Ayrıntı aşağıda "Bekleyen" başlığında.

#### Hero videosu — figürler çıkarıldı

Tanıtım sayfasının hero'suna sessiz, döngülü bir video eklendi. Yeni paket
`scripts/media` (`@kuran/media`, ffmpeg + sharp): tek kaynak `hero-source.mp4`
(1280×720, 20,04 sn) → `hero.mp4` 763 KB + poster (webp 12,1 KB / jpg 18,3 KB).
`pnpm --filter @kuran/media media:check` üretilenle diskteki baytları
karşılaştırır.

Kaynak videoda **beş peygamber insan figürü olarak görünüyordu.** Plan §20.3
"peygamber, sahabe, melek ve insan figürü tasvir edilmez" diyor — yasak yüze
değil figüre. Kare kare tarandı, figürlü aralıklar çıkarıldı:

| Süre | Sahne | Figür |
|---|---|---|
| 3,4–5,0 s | nehir vadisi | Hz. Âdem — ayakta, cübbeli |
| 5,0–7,2 s | gemi ve tufan | Hz. Nuh — geminin önünde |
| 9,0–10,4 s | kıyı, güneş | Hz. Musa — kıyıda |
| 10,4–11,0 s | yarılan deniz (göz hizası) | Hz. Musa — merkezde, büyük |
| 12,0–13,5 s | balina | Hz. Yunus — suya batarken |

Kalan beş parça birleştirildi (11,30 sn). Anlatı korundu: her dönem kendi yeri
ve doğasıyla temsil ediliyor. Uzak kervan (15–17 sn) **bırakıldı** — o ölçekte
hayvan sürüsü okunuyor, insan tasviri değil. Kesim kararları
`scripts/media/build_media.ts` içinde satır satır yazılı; karar koda gömülü
değil, belgelenmiş.

Kalite: crf 34 ile 36 yan yana konuldu, koyu perde altında ayrım
görülemediği için 36 seçildi (932 → 768 KB).

#### CSP'ye `media-src 'self'` eklendi

`default-src 'none'` iken `<video>` **sessizce** engelleniyordu — hata yok,
konsol uyarısı yok, sadece boş kutu. `media-src 'self'` eklendi; üçüncü taraf
medya hâlâ yasak. **`script-src` AÇILMADI** — sayfa 0 bayt JS kalıyor.

`/brand/` ve `/media/` için 30 günlük önbellek bloğu eklendi (`expires`,
`add_header` değil — bir location'daki `add_header` sunucu düzeyindeki tüm
başlıkları iptal eder).

#### Hoca notu alımı — `scripts/sync/import_notes.ts`

Plan §23.4'ün üçüncü maddesi tamamlandı. Yeni paket `@kuran/sync`. Akış:
sha256 doğrula → Zod parse → `checkPackageIntegrity` → referansları
veritabanına karşı çözümle → tek işlemde upsert → rapor.

Üç tasarım kararı ve gerekçeleri:

- **Paketin tamamı reddedilir, yarısı alınmaz.** Bir paket tek editoryal
  partidir; yarısını almak, gözden geçiren kişinin onaylamadığı bir bileşimi
  yayınlamak olur. Reddedilen paket silinmez, `inbox/rejected/` altına
  zaman damgası ve `.hata.txt` ile taşınır.
- **Ara tablolar sil-yaz, upsert değil.** Bir nottan ayet çıkarılırsa upsert o
  satırı bırakırdı; not artık bağlı olmadığı ayette görünmeye devam ederdi.
- **Yayın kapısı yapılandırmaya bağlandı.** `.env` içindeki `TAKEDOWN_EMAIL`
  ve `REPO_URL` ikisi birden dolu değilse `published` notlar `reviewed`'e
  düşürülür ve sebep rapora yazılır. Plan §23.4'ün ilk iki maddesi artık bir
  insanın hatırlamasına değil koda bağlı.

Altı yol da bilerek bozularak sınandı — geçerli paket, bozuk sha256, eksik yan
dosya, bilinmeyen ayet/kavram/kök, notun yeni sürümü, kapının kapalı ve açık
hâli. Sonuçlar `scripts/sync/README.md` sonundaki tabloda. Sınama verisi
veritabanından temizlendi (`scholar` silindi, cascade ile hepsi gitti;
sayımlar sıfır doğrulandı).

#### `/kaynaklar` ana sayfadan ulaşılamaz olmuştu

Tanıtım sayfasının menüsünden "Kaynaklar" kaldırılınca (kullanıcı kararı, aynı
gün) o sayfaya ana sayfadan giden hiçbir bağlantı kalmadı: tanıtım sayfası
kendi menüsünü çiziyor (`bareHeader`), zorunlu atıf alanı ise yalnızca **dış**
kaynaklara bağlanıyor. Kaynak şeffaflığı iddia eden bir sitede kaynak
listesinin gizli kalması olmaz. Bağlantı `<Attribution>` içine kondu — her
sayfada, tanıtım sayfası dâhil.

#### Duman testi sunucu başlığı okumaya başladı

Az önceki CSP olayı bu denetimin sebebidir: nginx yapılandırması repoda
güncellenip canlıya uygulanmazsa **hiçbir şey hata vermez** — dosyalar 200
döner, sayfa açılır, yalnızca video sessizce engellenir. Artık CSP başlığının
kendisi okunuyor:

- `media-src 'self'` **var mı** — yoksa test düşer
- `script-src` **yok mu** — varsa test düşer; "0 bayt JS" iddiasını sunucu
  tarafında zorlayan şey bu
- `/media/hero.mp4` ve posteri 200 mü

Denetim sayısı 24 → 29.

#### Bekleyen — canlıya uygulanmadı

`infra/nginx/kurankesfi.tr.conf` güncel, **canlı vhost değil.** Yazma işlemi
oturum güvenlik sınırlaması nedeniyle yapılamadı. Uygulanmadan yayın alınırsa
duman testi `CSP media-src BULUNAMADI` diyerek düşer (bilerek). Gereken:

```bash
sudo cp /www/server/panel/vhost/nginx/kurankesfi.tr.conf \
        /www/server/panel/vhost/nginx/kurankesfi.tr.conf.bak.20260905
sudo cp /opt/kuran/infra/nginx/kurankesfi.tr.conf \
        /www/server/panel/vhost/nginx/kurankesfi.tr.conf
sudo /www/server/nginx/sbin/nginx -t && cd /opt/kuran && pnpm run deploy
```

## Cloudflare R2 — ağır medya deposu (2026-09-05)

Plan §21.1 kaydı. Sunucuya hiçbir servis kurulmadı; R2 dış depodur.

| Alan | Değer |
|---|---|
| Bucket | `kuran-medya` (Cloudflare R2, Standard) |
| Genel adres | `https://medya.kurankesfi.tr` — custom domain, DNS Cloudflare'de, doğrulandı (HTTP/2 200) |
| S3 endpoint | `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` (region `auto`) |
| Kimlik | `.env` içinde `R2_*`, izin **Object Read & Write**, yalnızca bu bucket'a kısıtlı |
| Yükleme | `pnpm media:r2:push` → `scripts/media/r2_sync.ts` |
| Hazırlık alanı | `/opt/kuran/media/` (git'e girmez; `FIGUR_TARAMASI.json` girer) |
| Ücretsiz kota | 10 GB depolama · 1M Class A · 10M Class B · **egress ücretsiz** |
| Yedek | `.env.bak.20260905` (chmod 600) |

**`pub-*.r2.dev` kullanılmadı.** Rate-limitli ve üretim için değil; kendi alan adımızda kalınca
Cloudflare cache devreye girer (cache hit Class B saymaz — PMTiles range istekleri için ciddi fark)
ve sağlayıcı değişimi tek DNS kaydına iner.

**İçerik:**

| Anahtar | Ne |
|---|---|
| `sistem/saglik.txt` | uçtan uca doğrulama dosyası; `curl https://medya.kurankesfi.tr/sistem/saglik.txt` |
| `tiles/…` | (planlanan) PMTiles harita altlığı |
| `ses/…`, `video/…` | (planlanan) kıraat ve medya |

**Cache-Control:** `.pmtiles` → 7 gün (adı değişmeden yeniden üretilir); diğerleri 1 yıl `immutable`.

**Doğrulandı 2026-09-05:** bağlantı TAMAM · yükleme + genel okuma 200 · değişmeyen dosya atlanıyor ·
figür kapısı taranmamış `.png`'yi durdurdu ve **hiçbir dosyayı yüklemedi** (kapı tüm gruba uygulanır).
