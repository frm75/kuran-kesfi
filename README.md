# Kur'an-ı Kerim Keşif Platformu

Ücretsiz, reklamsız, üyeliksiz ve takipsiz bir Kur'an keşif sitesi. Kur'an'ı sure/ayet listesi
olarak sunmak yerine **harita, zaman, kavram, kelime ve ilkeler** eksenlerinde gezilebilir kılar;
her keşif yolunun merkezinde **ayet** bulunur.

Proje Allah rızası için, kâr amacı gütmeden hazırlanmaktadır.

## Durum

**Faz 0 — Altyapı.** Henüz veri yok, arayüz yok. Bkz. [docs/PROJE_PLANI.md](docs/PROJE_PLANI.md) §9.

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
| `pnpm build` | Şema + statik site derlemesi |
| `pnpm typecheck` | Tüm paketlerde tip denetimi |
| `pnpm db:up` / `pnpm db:down` | Build veritabanı container'ı *(adım 3'te eklenecek)* |
| `pnpm import` | Kaynak import scriptleri *(adım 4'te eklenecek)* |

## Dizin yapısı

```
apps/web/            Astro site (statik export)
packages/schema/     Zod şemaları ve paylaşılan tipler
scripts/import/      Kaynak import (tanzil, acikkuran, quran_com, corpus)
scripts/build/       PostgreSQL → public/data/*.json + referans linter
infra/db/            Build veritabanı şeması ve compose dosyası
data/                Elle hazırlanan kaynaklı veri (kıssa, konum, kavram, ilke, siyer)
cache/               İndirilen ham kaynak veri — repoya girmez
docs/                Plan, tasarım, deploy raporu, backlog
```

## Lisans

- **Kod:** MIT — bkz. [LICENSE](LICENSE)
- **Veri (`data/`):** CC BY-NC-SA 4.0 — bkz. [data/LICENSE](data/LICENSE)

Lisansı belirsiz meal, tefsir, ses veya görsel projeye eklenmez.

## Katkı

Katkı rehberi Faz 5'te yayınlanacaktır. Şimdiden geçerli olan kural: **meal ekleme isteği kabul
edilmez**; yalnızca konum, kıssa, ilke, kavram verisi ve kod katkısı değerlendirilir.
