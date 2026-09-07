# Kur'an-ı Kerim Keşfi

**Oku • Anla • Keşfet** — <https://kurankesfi.tr>

Ücretsiz, reklamsız, üyeliksiz ve takipsiz bir Kur'an keşif sitesi. Kur'an'ı sure/ayet listesi
olarak sunmak yerine **harita, zaman, kavram, kelime ve ilkeler** eksenlerinde gezilebilir kılar;
her keşif yolunun merkezinde **ayet** bulunur.

Proje Allah rızası için, kâr amacı gütmeden hazırlanmaktadır.

## Durum — 2026-09-04

**Faz 0 tamamlandı, site yayında.** 7996 sayfa, **0 bayt JavaScript.**

| Hazır | |
|---|---|
| Klasik okuma | 114 sure, 6236 ayet — Arapça, okunuşu, meali |
| Meal karşılaştırma | 23 Türkçe + 27 İngilizce çeviri yan yana |
| Çeviriyazı | 6236/6236 ayet, Latin harfli okunuş |
| Kelime ve kök | 77.429 kelime, 1.641 kök, kelimelerin %61'i köke bağlı |
| Kaynak şeffaflığı | Her metnin kaynağı, hazırlayanı, lisansı |

| Yolda (plan §2) | |
|---|---|
| Harita · Zaman · Kavram · İlkeler | Keşif kapıları — Faz 1 |
| Kıssalar, kavram ağı, hoca notları | Faz 1-3 |
| Ses (kıraat) | Faz 4 |

Ayrıntılı yol haritası: [docs/PROJE_PLANI.md](docs/PROJE_PLANI.md) §9.
Yayın geçmişi ve sunucu kararları: [docs/DEPLOY_REPORT.md](docs/DEPLOY_REPORT.md).

## Sözün karşılığı koddadır

İddialar denetlenebilir olsun diye kurala bağlandı:

- **Takip yok.** Sayfa `Content-Security-Policy: default-src 'none'` ile geliyor;
  `script-src` hiç yok. Üçüncü taraf istek tarayıcı düzeyinde imkânsız.
  Yazı tipleri bile kendi sunucumuzdan.
- **Kaynaksız içerik yok.** `<SourceBadge>` kaynaksız çağrılırsa **derleme
  durur.** `<Translation>` ya kaynağını ister ya da kaynağın sayfada nerede
  bildirildiğini.
- **Belirsizlik saklanmaz.** Kaynak taraflı eksikler
  [/kaynaklar](https://kurankesfi.tr/kaynaklar) sayfasında yazılı.
- **Tekrarlanabilir.** `pnpm data:import && pnpm build` aynı parmak izini üretir.
- **Doğrulanır.** Referans linter 39.995 denetim; yazı tipleri HarfBuzz ile
  6236 ayet + 12.586 satır dizilerek sınanır.

## İlkeler

1. Ücretsiz ve reklamsız — hiçbir modül ücretli değildir.
2. Üyeliksiz keşif; kişisel veriler yalnızca kullanıcının tarayıcısında saklanır.
3. Takip yok — analitik, üçüncü taraf çerez veya piksel bulunmaz.
4. Yorum yapılmaz, kaynak gösterilir. Platform kendi tefsirini üretmez, hüküm çıkarmaz.
5. Belirsizlik saklanmaz — tartışmalı konum, kronoloji ve meal ayrılıkları açıkça işaretlenir.
6. Bağımsız çalışır — harici API'ler yalnızca import aşamasında kullanılır; site statiktir.

Tam liste: [docs/PROJE_PLANI.md](docs/PROJE_PLANI.md) §1.2.

## Gereksinimler

- Node.js 20.11+ (geliştirme makinesinde v20.20.2 kullanılıyor, bkz. `.nvmrc`)
- pnpm 10.34.5 (`corepack prepare pnpm@10.34.5 --activate`)
- Docker — yalnızca build aşaması veritabanı için

## Kurulum

```bash
pnpm install
cp .env.example .env    # portları ve DB parolasını düzenleyin
chmod 600 .env
```

## Komutlar

| Komut | Açıklama |
|---|---|
| `pnpm dev` | Astro geliştirme sunucusu (`SITE_PORT`, varsayılan 4321) |
| `pnpm data:import` | Kaynak import: Tanzil → Açık Kuran → çeviriyazı |
| `pnpm build:data` | PostgreSQL → `apps/web/public/data/*.json` |
| `pnpm lint:refs` | Referans linter (plan §20.1) |
| `pnpm build` | Tam zincir: `build:data` → `lint:refs` → `build:web` |
| `pnpm build:web` | Yalnızca Astro derlemesi (veritabanı gerekmez) |
| `pnpm typecheck` | Tüm paketlerde tip denetimi |
| `pnpm test` | Şema testleri |
| `pnpm fonts` | Yazı tiplerini indir ve alt kümele |
| `pnpm fonts:check` | Üretilen font çıktısı diskteki ile aynı mı |
| `pnpm fonts:verify` | HarfBuzz ile dizgi doğrulaması (eksik glif var mı) |
| `pnpm brand` | Marka görsellerini tek kaynak logodan üret |
| `pnpm brand:check` | Üretilen marka çıktısı diskteki ile aynı mı |
| `pnpm run deploy` | Atomik yayın + duman testi |
| `pnpm deploy:rollback` | Bir önceki yayına dön |
| `pnpm deploy:smoke` | Yalnızca duman testi (yayın yapmadan) |
| `pnpm db:up` / `pnpm db:down` | Build veritabanı container'ını başlat / durdur |
| `pnpm db:reset` | Veritabanını sil ve şemayı sıfırdan kur |
| `pnpm db:psql` | Veritabanına psql ile bağlan |

> **`pnpm import` ve `pnpm deploy` pnpm'in yerleşik komutlarıdır** ve aynı adlı
> script'i gölgeler. `import` çalıştırılırsa `pnpm-lock.yaml` **silinir** (bir kez
> oldu, git'ten geri alındı) — script bu yüzden `data:import` adını taşıyor.
> `deploy` ise `ERR_PNPM_NOTHING_TO_DEPLOY` verip hiçbir şey yapmaz; araya `run`
> koymak gerekir: **`pnpm run deploy`**.

### Build veritabanı

`kuran-pg` container'ı PostgreSQL 16, yalnızca `127.0.0.1:${DB_PORT}` üzerinde
dinler ve **yalnızca build makinesinde** çalışır. Üretim sunucusunda veritabanı
yoktur. Şema `infra/db/schema.sql` içindedir ve container ilk başlatıldığında
otomatik uygulanır.

Bot aboneliği ayrı bir veritabanı kullanır (`infra/db/bot_schema.sql`, Faz 3).

## Dizin yapısı

```
apps/web/            Astro site (statik export)
packages/schema/     Zod şemaları + migration üreticileri (yerel proje ile ortak)
packages/pipeline/   Build makinesi yardımcıları: ortam, veritabanı, önbellek, günlük
scripts/import/      Kaynak import (tanzil, acikkuran, ceviriyazi)
scripts/fonts/       Yazı tipi alt kümeleme ve HarfBuzz doğrulaması
scripts/deploy/      Atomik yayın betiği
scripts/build/       PostgreSQL → public/data/*.json + referans linter
scripts/sync/        inbox/ → DB: yerel projeden gelen hoca notu paketleri
inbox/               kuran-extract paketleri — repoya girmez
infra/db/            Build veritabanı şeması ve compose dosyası
data/                Elle hazırlanan kaynaklı veri (kıssa, konum, kavram, ilke, siyer)
cache/               İndirilen ham kaynak veri — repoya girmez
docs/                Plan, tasarım, deploy raporu, backlog
```

## Lisans

- **Kod:** MIT — bkz. [LICENSE](LICENSE)
- **Kendi derlediğimiz veri:** CC BY-NC-SA 4.0 — bkz. [data/LICENSE](data/LICENSE)
- **Üçüncü taraf metinler:** kendi lisansları geçerlidir. Arapça metin
  (Tanzil), mealler ve kelime/kök verisi (Açık Kuran, CC BY-NC-SA 4.0),
  çeviriyazı (Muhammet Abay, Tanzil üzerinden) **bize ait değildir ve
  tarafımızdan yeniden lisanslanamaz.** Şartların tamamı
  [data/LICENSE](data/LICENSE) içinde.


## Katkı

Katkı rehberi Faz 5'te yayınlanacaktır. Şimdiden geçerli olan kural: **meal ekleme isteği kabul
edilmez**; yalnızca konum, kıssa, ilke, kavram verisi ve kod katkısı değerlendirilir.
