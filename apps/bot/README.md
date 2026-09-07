# apps/bot — Telegram günlük ayet ve ilke botu

Plan §19. **Ayrı küçük servis**; site statik kalır ve bot site veritabanına
bağlanmaz — yayındaki statik JSON'ları okur.

```
Telegram ──uzun yoklama──▶ bot (pm2: kuran-bot)
                             ├─▶ SQLite      abonelikler
                             └─▶ current/data/  schedule.json · verse/* · principle/*
saat başı ──▶ gönderim (her abonenin kendi saat diliminde)
```

## Kararlar

- **grammY yok.** Kullanılan yüzey üç uçtan ibaret (`getMe`, `getUpdates`,
  `sendMessage`) ve hepsi düz POST. Dexie ve D3 ile aynı gerekçe.
- **Webhook değil uzun yoklama.** Webhook nginx'te yeni bir genel uç açmayı ve
  gizli yol yönetmeyi gerektirirdi; yoklama dışarıya hiçbir şey açmaz.
- **İçerik yayındaki sürümden okunur** (`BOT_DATA_DIR`), repodan değil. Bota
  giden ayet ve ilke, ziyaretçinin sitede gördüğünün aynısıdır (plan §19.6).
  Takvim önbelleğe alınmaz: yeni yayın alındığında bot yeniden başlatılmadan
  yeni takvimi görür.
- **Cron yok, süreç içi zamanlayıcı var.** Servis zaten sürekli açık (yoklama
  döngüsü); ayrı bir cron girdisi yönetmek gereksiz bir parça olurdu.
- **Takvim build zamanında üretilir** (`schedule.json`, 366 gün). Bot içerik
  seçmez. Deterministik olduğu için kullanıcıya hangi ayetin gönderildiği
  kaydedilmez — yalnızca imleç ilerler.

## Veri minimizasyonu (plan §19.2 — zorunlu)

Saklananlar: sohbet kimliği, sıklık, meal, saat dilimi, gönderim saati, imleç.
**Saklanmayanlar:** isim, kullanıcı adı, e-posta, mesaj geçmişi, hangi ayetin
gönderildiği. `/dur` kaydı **fiziksel olarak siler** — `active = false` yetmez.
KVKK aydınlatması `/start` ve `/durum` çıktısında yazılıdır.

Bot yalnızca birebir sohbette çalışır; gruplarda yok sayar (grup üyeleri
aboneliği kendileri seçmiş olmaz).

## Komutlar

`/start` `/gunluk` `/haftalik` `/meal` `/saat` `/bugun` `/durum` `/dur` `/yardim`

## Çalıştırma

```bash
pnpm --filter @kuran/bot build
pm2 start apps/bot/dist/index.js --name kuran-bot --time
pm2 save

curl -s http://127.0.0.1:4330/api/bot/durum   # {"ok":true,"configured":…,"abone":0}
pnpm --filter @kuran/bot test:smoke           # 29 test
```

`BOT_TOKEN` boşsa servis yine çalışır: yalnızca sağlık ucunu açar. Token
gelince `pm2 restart kuran-bot` yeter.

## Bir kez yaşanmış tuzak

`BOT_DEFAULT_AUTHOR` yanlış yazıldığında (`diyanet-isleri-baskanligi`, doğrusu
`diyanet-isleri`) mesaj **yine gidiyor** ama her seferinde "seçtiğiniz meal bu
ayette yok" notu düşüyordu — gönderim çalıştığı için kimse fark etmezdi.
Servis artık açılışta slug'ı `authors_index.json` ile doğruluyor ve duman testi
de bunu koruyor.
