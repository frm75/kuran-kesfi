-- =============================================================================
-- Mesaj aboneliği veritabanı şeması — plan §19.6
--
-- AYRI VERİTABANIDIR. Site build veritabanıyla (schema.sql) birleştirilmez;
-- bot ayrı küçük servistir ve site statik kalır (plan §19.6).
-- Faz 3'te devreye alınır; Faz 0'da yalnızca şema tanımı olarak durur.
--
-- Veri minimizasyonu (plan §19.2 — zorunlu):
--   - Yalnızca iletim için zorunlu veri tutulur.
--   - İsim, e-posta ve davranış verisi TUTULMAZ.
--   - Tek komutla (/dur, "DUR") abonelik iptal edilir ve kayıt FİZİKSEL OLARAK
--     SİLİNİR (soft delete yok — active=false yeterli değildir, DELETE uygulanır).
--   - Kullanıcıya hangi ayetin gönderildiği kalıcı olarak kaydedilmez; gönderim
--     takvimi (schedule.json) deterministik olduğu için yalnızca imleç ilerletilir.
--
-- Çalıştırma: psql -h 127.0.0.1 -p $BOT_DB_PORT -U kuran_bot -d kuran_bot -f bot_schema.sql
-- =============================================================================

BEGIN;

CREATE TYPE subscription_channel AS ENUM ('telegram', 'whatsapp', 'email', 'push');

CREATE TYPE subscription_frequency AS ENUM ('daily', 'weekly');

CREATE TABLE subscription (
  id             integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  channel        subscription_channel NOT NULL,
  -- Telegram chat_id veya telefon numarası — kanala göre.
  -- WhatsApp'ta telefon numarası kişisel veridir; KVKK aydınlatma metni
  -- abonelik akışında gösterilir (plan §19.2).
  channel_id     text NOT NULL,
  frequency      subscription_frequency NOT NULL,
  -- Tercih edilen meal. Site veritabanındaki author.slug'ı tutar; iki
  -- veritabanı ayrı olduğu için yabancı anahtar konulamaz.
  author_slug    text NOT NULL,
  -- IANA saat dilimi: "Europe/Istanbul"
  timezone       text NOT NULL,
  send_hour      smallint NOT NULL CHECK (send_hour BETWEEN 0 AND 23),
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_sent_at   timestamptz,
  -- Yıllık takvimdeki son gönderilen gün indeksi. Hata durumunda aynı gün
  -- yeniden denenir (plan §19.6).
  schedule_cursor integer NOT NULL DEFAULT 0 CHECK (schedule_cursor >= 0),
  active         boolean NOT NULL DEFAULT true,
  UNIQUE (channel, channel_id)
);

COMMENT ON TABLE subscription IS
  'Plan §19.6. Abonelik iptalinde kayıt DELETE ile silinir; arşivlenmez. '
  'Gönderim geçmişi tutulmaz — tekrar önleme schedule_cursor ile yapılır.';

-- Gönderim kuyruğunu saat dilimine göre toplu çeken cron sorgusu için
CREATE INDEX subscription_dispatch_idx ON subscription (active, send_hour, timezone)
  WHERE active;

COMMIT;
