# systemd birimleri

İki servis ayrı `kuran` kullanıcısıyla, kum havuzunda çalışır (2026-11-20; önce pm2 altında
root'tu). Yazabildikleri tek yer `/opt/kuran/var`.

| Birim | Kod | Ortam dosyası | Port |
|---|---|---|---|
| `kuran-iletisim` | `apps/iletisim` | `/etc/kuran/iletisim.env` (`FORM_*`, `SMTP_*`, `CONTACT_*`) | 127.0.0.1:4380 |
| `kuran-bot` | `apps/bot` | `/etc/kuran/bot.env` (`BOT_*`) | 127.0.0.1:4330 |

Ortam dosyaları `600 root`; systemd okur, servis kullanıcısı okuyamaz. **`.env`'de bu
anahtarlardan biri değişirse ilgili dosya da güncellenir** — servisler depo kökündeki `.env`'i
okuyamaz:

```bash
grep -E '^(FORM_|SMTP_|CONTACT_)' /opt/kuran/.env > /etc/kuran/iletisim.env
grep -E '^BOT_' /opt/kuran/.env > /etc/kuran/bot.env
chmod 600 /etc/kuran/*.env
```

## Kurulum

```bash
useradd --system --home-dir /opt/kuran/var --no-create-home --shell /usr/sbin/nologin kuran
chown -R kuran:kuran /opt/kuran/var && chmod 700 /opt/kuran/var
cp infra/systemd/kuran-*.service /etc/systemd/system/ && systemctl daemon-reload
systemctl enable --now kuran-iletisim kuran-bot
```

## Günlük işler

```bash
pnpm --filter @kuran/iletisim build && systemctl restart kuran-iletisim   # kod değişince
journalctl -u kuran-iletisim -n 50                                          # günlük
curl -s http://127.0.0.1:4380/api/iletisim/durum                            # sağlık
```
