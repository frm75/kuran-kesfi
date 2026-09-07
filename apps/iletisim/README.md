# apps/iletisim — iletişim / öneri / düzeltme formunun arka ucu

Sitenin **tek sunucu taraflı parçası**. Geri kalan her şey statik dosyadır.

```
tarayıcı ──POST /api/iletisim──▶ nginx ──▶ 127.0.0.1:4380 (bu servis)
                                              │
                                              ├─▶ SQLite  (önce yazılır)
                                              ├─▶ SMTP    (sonra gönderilir)
                                              └─▶ 303 /iletisim-tesekkur
```

## Neden böyle

- **JavaScript yok.** Form düz `<form method="post">`. Doğrulama tarayıcının
  kendi `required` / `pattern` / `type="email"` denetimleri + sunucu tarafı.
  CSP'de `/iletisim` için açılan tek şey `form-action 'self'`.
- **POST-Redirect-GET.** Servis HTML üretmez; 303 ile statik bir sonuç sayfasına
  yollar. Geri tuşu formu yeniden göndermez.
- **Önce veritabanı, sonra mail.** Posta bir gün bozulur (şifre değişir, kota
  dolar, alıcı reddeder). O gün form "gönderildi" deyip mesajı hiçbir yere
  yazmasaydı mesaj kaybolurdu. Gönderim sonucu aynı satıra düşer;
  `mail_sent = 0` olan satırlar `/api/iletisim/durum` ucunda sayılır.
- **Mail esfasoft SMTP'sinden çıkar**, sunucunun kendi sendmail'inden değil:
  `kurankesfi.tr`'nin SPF kaydı ve MX'i yok, o alandan çıkan mail spam'e düşer.
- **Ziyaretçinin adresi gönderen yapılmaz** — doğrulanmamıştır, başkası adına
  mail göndermek olurdu. Yalnızca `Reply-To` olur.

## Ne saklanmıyor

IP adresi, tarayıcı bilgisi, referans adresi **saklanmaz** (plan §1.2, §1.3).
Hız sınırı için IP yalnızca bellekte, karması alınarak ve geçici tutulur;
diske yazılmaz, süreç yeniden başlayınca sıfırlanır.

## Spam

Captcha **yok** — üçüncü taraf bağımlılığı olurdu (CLAUDE.md kural 5) ve
ziyaretçiyi izleyen bir hizmete sokardı. Yerine üç ucuz kapı: bal küpü alanı
(`website`), IP başına hız sınırı (20 sn arayla, 15 dakikada en fazla 5) ve
uzunluk sınırları. Bal küpü dolu gelen isteğe **başarı** gösterilir: bota
hangi alanda yakalandığını öğretmenin anlamı yok.

## Çalıştırma

```bash
pnpm --filter @kuran/iletisim build
pm2 start apps/iletisim/dist/server.js --name kuran-iletisim --time
pm2 save

curl -s http://127.0.0.1:4380/api/iletisim/durum   # {"ok":true,"smtp":…}
```

Yapılandırma repo kökündeki `.env` içinde (`FORM_PORT`, `FORM_DB_PATH`,
`SMTP_*`, `CONTACT_*`). SMTP boşsa servis **yine çalışır**: mesaj veritabanına
yazılır, satıra "SMTP yapılandırılmamış" düşülür.

## Mesajları okumak

```bash
node -e 'const D=require("better-sqlite3");
  const db=new D(process.env.FORM_DB_PATH||"/opt/kuran/var/iletisim.sqlite",{readonly:true});
  console.table(db.prepare("SELECT id,created_at,kind,verse_ref,email,body,mail_sent FROM message ORDER BY id DESC LIMIT 20").all());'
```
