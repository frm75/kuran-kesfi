# CLAUDE.md — Kur'an-ı Kerim Keşif Platformu

Bu dosya Claude Code için proje talimatıdır. Tam plan `docs/PROJE_PLANI.md` dosyasındadır; her oturumun
başında o dosyayı oku. Plan ile bu dosya çelişirse plan geçerlidir.

## Proje Özeti
Ücretsiz, reklamsız, üyeliksiz, takipsiz, açık kaynak bir Kur'an keşif sitesi. Harita / Zaman / Kavram / Kelime /
İlkeler eksenlerinde keşif; merkezde AYET. Allah rızası için hazırlanmaktadır; kâr amacı yoktur.

## Çalışma Kuralları (kesin)
1. **Önce plan, sonra kod.** Her görevde önce yapılacaklar listesi ve etkilenecek dosyalar sunulur; kullanıcı
   onaylamadan kod yazılmaz veya dosya değiştirilmez.
2. **Kısa özet.** İş bitince açıklama 3-5 satırı geçmez: ne yapıldı, ne değişti, sıradaki adım.
3. **Küçük adımlar.** Tek seferde tek modül/tek script; büyük yeniden yazım yapılmaz.
4. **Dinî içerik üretilmez.** Tefsir, hüküm, yorum, ders, ilke metni yazılmaz; yalnızca kaynaklı veri düzenlenir.
   Kaynağı olmayan içerik `data/` altına girmez.
5. **Harici API'ye üretimde bağımlılık yok.** Site build'i internet gerektirmez; import scriptleri ayrıdır.
6. **Lisans:** Kod MIT, `data/` CC BY-NC-SA 4.0. Lisansı belirsiz meal, ses, görsel veya tefsir eklenmez.
7. **Kapsam dondurulmuştur.** Planda olmayan özellik önerilmez; öneri varsa "ilk yayın sonrası" notuyla
   `docs/BACKLOG.md`'ye yazılır.
8. **Figür yok.** Peygamber, sahabe, insan tasviri içeren görsel üretilmez/eklenmez.

## Stack
- Astro + TypeScript + Tailwind (statik export, island mimarisi, ilk yükleme < 100 KB JS)
- MapLibre GL (harita), Cytoscape.js (graf), Dexie (IndexedDB), FSRS (ezber), Pagefind/FlexSearch (arama)
- Import: Node.js/TypeScript scriptleri + PostgreSQL (yalnızca build makinesinde)
- Bot: Node.js (grammY), systemd servisi, ayrı küçük DB
- Paket yöneticisi: pnpm

## Dizin Yapısı
```
apps/web/            Astro site
packages/schema/     Zod şemaları ve paylaşılan tipler
scripts/import/      Kaynak import (tanzil, acikkuran, quran_com, corpus)
scripts/build/       PostgreSQL → public/data/*.json + referans linter
data/stories/        Kıssa JSON (elle, kaynaklı)
data/locations/      Konum JSON (elle, kaynaklı)
data/concepts/       Kavram JSON
data/principles/     İlke JSON
data/timeline/       Siyer zaman çizelgesi
cache/               İndirilen ham kaynak veri (git'e girmez)
bot/                 Telegram bot servisi
docs/                PROJE_PLANI.md, DESIGN.md, DEPLOY_REPORT.md, BACKLOG.md
```

## İsimlendirme
- JSON dosyaları: alt çizgi (`verse_2_153.json`); URL slug: tire (`/yusuf-suresi/90`)
- DB: snake_case · TS: camelCase · Bileşen: PascalCase · Kod İngilizce, UI metni Türkçe

## Veri Kuralları
- Tanzil = tek gerçek kaynak; her tablo `verse_id` ile bağlanır, ayet numarası metin olarak saklanmaz
- `scripts/build` içindeki referans linter geçmeden build tamamlanmaz
- Kök eşleştirme `scripts/import/lib/arabic_normalize.ts` üzerinden; eşleşmeyenler rapora yazılır
- Import'ta yapay `sleep` yok; `p-limit` ile 5-10 paralel; tek seferlik çekim → `cache/`
- Öncelikli mealler: Diyanet İşleri, Mehmet Okuyan, Mustafa İslamoğlu, Muhammed Esed (`author.priority` 1-4)
- Diyanet tefsiri: özet + ≤200 karakter alıntı + link; toplu kopya yok
- Her kaynaklı kayıt `source_id` taşır; `<SourceBadge>` bileşeni olmadan kaynaklı içerik render edilmez
- Güven dereceleri: `kesin | muhtemel | rivayet` (konum, kronoloji, ilişki); ihtilaf saklanmaz

## Sunucu Kurulumu — Port Çakışması (kesin)
Sunucuda başka uygulamalar çalışıyor. Herhangi bir kurulum/servis işleminden önce:
1. `ss -tlnp` çıktısını al, kullanılan portları listele ve kullanıcıya göster
2. Hiçbir portu sabit kodlama; `.env` → `SITE_PORT`, `BOT_PORT`, `DB_PORT`; boş port seçip onay al
3. Mevcut Nginx/Caddy/PostgreSQL/Redis varsa yenisini kurma; mevcut yapıya blok/DB ekle
4. Değiştirilecek her yapılandırma dosyasını önce `*.bak.<tarih>` olarak yedekle
5. Servis ve cron adları `kuran-` ön ekiyle
6. Kurulum sonunda `docs/DEPLOY_REPORT.md`'ye port, servis, yol ve yedek listesini yaz
Dağıtım kökü: `/opt/kuran/`, build çıktısı `/opt/kuran/dist/`, güncelleme atomik (`dist_new` → `mv`).

## Arayüz
- Tasarım dili önce `docs/DESIGN.md`'de tanımlanır (renk token'ları, tip ölçeği, boşluk ölçeği), onaylanır, sonra kodlanır
- Sakin, tipografi odaklı, nötr palet + tek vurgu rengi, karanlık mod birinci sınıf
- Klişe "İslami site" estetiği (yeşil-altın, stok cami görseli, aşırı süs) kullanılmaz
- Arapça: Amiri Quran / Scheherazade New, `dir="rtl"`; meal `ltr`
- Ortak bileşenler: AyetPaneli, SourceBadge, ConfidenceBadge, DiscoveryPath (breadcrumb), ComparisonBasket
- Harita/graf için zorunlu liste alternatifi; `prefers-reduced-motion` desteklenir
- Performans bütçesi: < 100 KB JS ilk yükleme, LCP < 2 sn (3G)

## Faz Sırası
Faz 0 Altyapı → Faz 1 Kıssa Haritası + İlkeler → Faz 2 Zaman + Meal Farkları → Faz 3 Kök + Kavram + Telegram bot
→ Faz 4 Günlük + PWA + Ses → Faz 5 Yayın (WhatsApp bu fazda). Detay: `docs/PROJE_PLANI.md` §9, §16.

## İlk Görev (Faz 0)
1. Sunucu port/servis envanteri raporu
2. Monorepo iskeleti (pnpm workspaces) ve `packages/schema` Zod tipleri
3. PostgreSQL şema SQL'i (plan §4, §12.15, §18.4, §19.6)
4. `scripts/import/tanzil.ts` ve `scripts/import/acikkuran.ts` (öncelikli 4 meal önce)
5. `scripts/build/` → `public/data/` + referans linter
6. `docs/DESIGN.md` taslağı → onay → klasik okuma ekranı
Her adımda onay al.
