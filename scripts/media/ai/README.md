# AI görsel/video üretimi — lokal makine ↔ sunucu

Üretim **senin bilgisayarında** yapılır (kullanıcı kararı 2026-09-06). Sunucu
hiçbir AI API'sine bağlanmaz. Sözleşme dosya sistemi üzerindedir.

```
SUNUCU                              LOKAL
media/ai/kuyruk/<id>.txt   ──scp──▶  prompt'u aracına yapıştır
                                     ↓ üret
media/ai/cikti/<id>.png    ◀──scp──  çıktıyı gönder
       ↓
pnpm media:ai:collect
       ↓  (kare kare bak, faceScanned=true)
pnpm content:import && pnpm build && pnpm run deploy
```

Sunucu: `kurankesfi.tr` (31.57.33.232), port 22. Repo: `/opt/kuran`.

---

## 1. Prompt'ları lokale al

```bash
# lokal makinede — bir kez, yeni prompt eklendikçe tekrar
mkdir -p ~/kuran-ai/kuyruk ~/kuran-ai/cikti
scp -r root@kurankesfi.tr:/opt/kuran/media/ai/kuyruk/ ~/kuran-ai/
```

`<id>.txt` insan içindir: başlık, tür, süre, en/boy oranı, hedef dosya adı ve
prompt metni. `<id>.json` aynı bilgiyi makine okunur tutar.

Sunucudan okumak yeterliyse indirmeye gerek yok:

```bash
ssh root@kurankesfi.tr 'cat /opt/kuran/media/ai/kuyruk/nuh-gemi-hazirlik.txt'
ssh root@kurankesfi.tr 'ls /opt/kuran/media/ai/kuyruk/*.txt'
```

## 2. Üret

Aracın ne olursa olsun (ComfyUI, A1111, Krea, Higgsfield, Photoshop…).
Kod hiçbir araca bağlı değil.

**Dosya adı prompt kimliğiyle aynı olmalı.** `<id>.txt` dosyasının içindeki
`# ciktiyi buraya birak:` satırı hedef adı zaten yazıyor.

```
nuh-gemi-hazirlik.png          ✓
nuh-gemi-hazirlik-v2.png       ✓  (aynı prompt'un ikinci denemesi)
gemi.png                       ✗  eşleşen prompt bulunamaz, atlanır
```

Kabul edilen uzantılar: `.png .jpg .jpeg .webp` (görsel) · `.mp4 .webm` (video).
Tür prompt'la uyuşmalı — VIDEO prompt'una PNG bırakılırsa atlanır ve uyarı verir.

## 3. Sunucuya gönder

```bash
# lokal makinede
scp ~/kuran-ai/cikti/*.png root@kurankesfi.tr:/opt/kuran/media/ai/cikti/

# ya da rsync — kesilirse kaldığı yerden devam eder, büyük videolarda tercih et
rsync -avP ~/kuran-ai/cikti/ root@kurankesfi.tr:/opt/kuran/media/ai/cikti/
```

## 4. Sunucuda topla

```bash
ssh root@kurankesfi.tr
cd /opt/kuran
pnpm media:ai:collect
```

Her dosya için: sha256 alınır, görsel ölçüsü okunur, prompt'la eşleştirilir ve
`data/media/ai_generated.json` yazılır. **`faceScanned` false yazılır.**

Kaydın **kıssa, konum ve olay bağı prompt'undan gelir** — `ai_generated.json`'da bağ
alanı yoktur ve olmamalıdır: o dosya `collect` tarafından üretilir ve yalnızca
dosyanın ölçülebilir özelliklerini taşır. Nereye ait olduğu editoryal bir karardır ve
`data/media/prompts/` içinde durur (`storySlug`, `locationSlug`, `timelineOrder`).
`storySlug` boş bırakılan bir prompt'un çıktısı **hiçbir sayfada görünmez.**

## 5. Yüz taraması — otomatik DEĞİL

Bir yüz karma ile denetlenemez; bakmak insanın işi (CLAUDE.md "Görsel ve VİDEO
kuralı"). Taranmamış kayıt statik çıktıya **girmez** — kapı
`scripts/build/lib/content.ts` içinde.

Aranan şey **peygamber yüzüdür**. Figür, siluet ve uzaktan kalabalık serbesttir
(2026-09-06 kullanıcı kararı). Videoda kare kare bakılır, yalnızca sahne notuna
güvenilmez — 2026-09-05'te öyle yapılmış ve hatalı kesim yayına çıkmıştı.

Temizse `data/media/ai_generated.json` içinde o kaydın alanını elle çevir:

```json
"faceScanned": true,
"faceScanNote": "2026-09-07, kare kare bakıldı, peygamber yüzü yok."
```

Onay **dosya karmasına bağlıdır**: aynı kimlikle yeni bir dosya bırakırsan
`collect` onayı düşürür ve uyarı verir. Yeni dosya eskisinin onayını devralamaz.

## 6. Yayına al

```bash
cd /opt/kuran
pnpm content:import      # data/** → PostgreSQL   (~110 sn)
pnpm media:r2:push       # media/ai/cikti → R2
pnpm build               # build:data → lint:refs → build:web  (~4 dk)
pnpm run deploy          # atomik yayın + duman testi
```

**`media:r2:push` taranmamış dosyayı yüklemez** (2026-09-07). Kapı `faceScanned`'e
VE dosyanın sha256'sına bakar: onaydan sonra dosya değiştiyse yükleme durur. Önceden
kapı yalnızca statik çıktıdaydı; dosya sayfada görünmese de R2 adresinden
erişilebiliyordu.

Uzaktaki eski nesneyi **silmez** — bir dosya yanlışlıkla çıkmışsa
`pnpm media:r2:list ai/cikti` ile görülür, kaldırmak elle yapılır.

`pnpm deploy` **değil** — pnpm'in yerleşik komutuyla çakışır.

Geri almak: `pnpm run deploy:rollback`.

---

## Sık karşılaşılanlar

| Belirti | Sebep |
|---|---|
| `eslesen prompt yok` | Dosya adı prompt kimliğiyle başlamıyor |
| `prompt turu VIDEO ama dosya gorsel` | Uzantı prompt türüyle uyuşmuyor |
| Build'de `0 AI kaydi` | `faceScanned` hâlâ false, ya da `content:import` çalışmadı |
| Görsel siteye çıkmıyor | `media:r2:push` atlandı; dosya R2'de yok |
| Video oynatılmıyor | nginx CSP'de `media-src` — varsayılan CSP'de `medya.kurankesfi.tr` var, kontrol et |

`content:import` atlanırsa `faceScanned` değişikliği yayına **yansımaz**:
`data/**` tek kaynaktır, veritabanı türetilmiş kopyadır.
