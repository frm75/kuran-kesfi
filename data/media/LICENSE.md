# data/media — lisans

## Bu dizindeki metin

`data/media/*.json` içindeki **künye, bağlam cümleleri (`caution`), bağlar ve
prompt metinleri** platform derlemesidir ve `data/LICENSE` ile aynı lisans
altındadır: **CC BY-NC-SA 4.0**.

## Görsellerin kendisi — AYRI LİSANS

`media/gorsel/` altındaki dosyalar ve `medya.kurankesfi.tr` üzerinden servis
edilen görüntüler **bu lisansa dâhil DEĞİLDİR.** Her biri kendi lisansını
korur; hangi lisans olduğu kaydın `license`, `licenseRaw` ve `licenseUrl`
alanlarında, atıf metni ise `copyright` alanında yazılıdır ve üçü de medya
kartında gösterilir.

Bir görseli buradan alıp kullanacak kişi **kendi kaydının lisansına** bakmak
zorundadır, bu dosyaya değil.

## Ölçek küçültme

Servis edilen dosyalar kaynağın küçültülmüş WebP kopyalarıdır (en uzun kenar
2000 px — `scripts/media/fetch_images.ts`). Ölçek küçültme lisansı değiştirmez:
kopya kaynağın lisansını taşımaya devam eder ve atıf ile lisans bağlantısı
kartta birlikte gösterilir.

Kaynağın tam çözünürlüklü hâline `sourceUrl` (künye sayfası) ve `originalUrl`
(dosyanın kendisi) alanlarından ulaşılır.

## Hangi lisanslar barındırılır

Yalnızca şunlar sunucuya kopyalanır (spec §34, `isHostableLicense`):

```
PUBLIC_DOMAIN · CC0 · CC_BY · CC_BY_SA · CC_BY_NC
```

`COPYRIGHT`, `LINK_ONLY` ve `UNKNOWN` lisanslı kayıtlar **indirilmez**;
kartları yalnızca "Kaynağı görüntüle" bağlantısı gösterir. Kural dört yerde
birden uygulanır: Zod şeması, `media_item_license_gate` veritabanı kısıtı,
referans linteri ve indirme scripti.

## AI ile üretilen medya

`media/ai/` altındaki görüntüler platformun kendi üretimidir ve `data/LICENSE`
kapsamındadır (CC BY-NC-SA 4.0). Gerçek belgelerle **asla aynı listede
gösterilmez** ve her biri "AI ile oluşturulmuştur — tarihsel fotoğraf değildir"
etiketiyle sunulur (spec §32, §49).

## Kaldırma talebi

Bir görselin sahibi kaydın kaldırılmasını isterse: kaydın `data/media/`
içindeki girdisi silinir, `pnpm content:import && pnpm build` çalıştırılır ve
dosya R2'den kaldırılır. Kaynak bağlantısı da dâhil hiçbir iz kalmaz.
