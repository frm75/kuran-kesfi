# Corpus Coranicum — lisans ve kullanım koşulları

## Veri

**CC BY-SA 4.0** — © Berlin-Brandenburgische Akademie der Wissenschaften 2024
https://creativecommons.org/licenses/by-sa/4.0/

Kaynak depo: https://github.com/telota/corpus-coranicum-tei
Proje: https://corpuscoranicum.de (2007–2024, BBAW)

## Zorunlu atıf metni (kaynağın kendi verdiği künye)

> Corpus Coranicum Project, ed. Michael Marx. TEI Data.
> Berlin-Brandenburg Academy of Sciences and Humanities.
> https://github.com/telota/corpus-coranicum-tei

## Neden `data/` altında değil

Projenin `data/` ağacı **CC BY-NC-SA 4.0** ile yayınlanır. CC BY-SA 4.0 bir esere
sonradan **NC (ticari olmayan)** kısıtı eklenmesine izin vermez — bu ShareAlike
şartının ihlalidir. İki ağaç bu yüzden ayrıdır ve karıştırılmaz.

Bu dizindeki `manuscripts.json` ve `pages.json` **türev eserdir**; CC BY-SA 4.0
altında kalır ve öyle dağıtılır. `pnpm content:import` bu dizini okumaz.

## Görüntüler: KULLANILAMAZ

Taranan 2322 yazmanın **tamamında** görüntü izni `<availability status="restricted">`.
Tek bir açık görüntü yok. Görüntüler BBAW'ın `digilib` sunucusunda durur.

Bu yüzden bu dizinde **hiçbir görüntü yoktur ve indirilmez.** Yazmaya yalnızca
derin bağlantı verilir:

    https://corpuscoranicum.de/en/manuscripts/<id>

Bu aynı zamanda CLAUDE.md kural 5'i sağlar: sitenin üretimde üçüncü taraf bağımlılığı olmaz.

## Metin

Yazmaların harf harf çevriyazısı (`<w n="SSS-VVV-WWW">`) TEI dosyalarında vardır ama
**bu dizine alınmamıştır**. Şu an yalnızca künye ve ayet aralığı tutulur. Çevriyazı
gerekirse ayrı bir karar konusudur (kıraat farkları hassas bir alan; plan §12.9).

## İletişim

Michael Marx — marx@bbaw.de · TELOTA — telota@bbaw.de
