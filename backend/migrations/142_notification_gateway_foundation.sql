-- Phase 8: Notification & Communication Gateway foundation.
-- Additive only: does not alter existing workflow, user, OPD, or district tables.
-- Secrets must be encrypted by the application before storage.

CREATE TABLE IF NOT EXISTS notification_channels (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code IN ('EMAIL','TELEGRAM','WHATSAPP')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('INACTIVE','READY','ACTIVE')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  credential_ciphertext TEXT,
  credential_hint TEXT,
  last_test_at TIMESTAMPTZ,
  last_test_status TEXT CHECK (last_test_status IS NULL OR last_test_status IN ('SUCCESS','FAILED')),
  last_error TEXT,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL UNIQUE,
  title_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  channel_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_notification_channels (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('TELEGRAM','WHATSAPP')),
  external_user_id TEXT NOT NULL,
  chat_id TEXT,
  display_name TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, channel),
  UNIQUE (channel, external_user_id)
);

CREATE TABLE IF NOT EXISTS notification_link_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('TELEGRAM','WHATSAPP')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  workflow_event_id BIGINT NOT NULL REFERENCES issue_workflow_events(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('EMAIL','TELEGRAM','WHATSAPP')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED')),
  title_snapshot TEXT,
  message_snapshot TEXT NOT NULL,
  destination_hint TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_event_id, user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_user_notification_channels_user_enabled
  ON user_notification_channels(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_notification_link_tokens_active
  ON notification_link_tokens(user_id, channel, expires_at)
  WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_dispatch
  ON notification_deliveries(status, next_attempt_at, created_at)
  WHERE status IN ('PENDING','FAILED');
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user
  ON notification_deliveries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_event
  ON notification_deliveries(workflow_event_id);

INSERT INTO notification_channels(code,name,status)
VALUES
 ('EMAIL','Email','INACTIVE'),
 ('TELEGRAM','Telegram','INACTIVE'),
 ('WHATSAPP','WhatsApp','INACTIVE')
ON CONFLICT (code) DO NOTHING;

INSERT INTO notification_templates(event_type,title_template,body_template)
VALUES
 ('ISSUE_ASSIGNED','Penugasan Isu Baru','Anda mendapat penugasan untuk isu {{issue_title}}. Batas waktu: {{due_at}}. Silakan buka Media Intelligence Pemko Batam untuk menindaklanjuti.'),
 ('CONTRIBUTOR_CLARIFICATION_REQUESTED','Permintaan Klarifikasi Baru','Permintaan klarifikasi untuk isu {{issue_title}} dari {{sender_name}}. Batas waktu: {{due_at}}. Silakan memberikan klarifikasi melalui Media Intelligence Pemko Batam.'),
 ('SUPPORTING_OPD_CLARIFICATION_SUBMITTED','Klarifikasi OPD Pendukung Dikirim','{{sender_name}} telah mengirim klarifikasi untuk isu {{issue_title}}. Silakan lakukan review di Media Intelligence Pemko Batam.'),
 ('DISTRICT_CONTRIBUTION_SUBMITTED','Klarifikasi Kecamatan Dikirim','{{sender_name}} telah mengirim klarifikasi untuk isu {{issue_title}}. Silakan lakukan review di Media Intelligence Pemko Batam.'),
 ('CONTRIBUTOR_FOLLOW_UP_REQUESTED','Klarifikasi Lanjutan Diperlukan','Klarifikasi lanjutan diperlukan untuk isu {{issue_title}}. Catatan: {{note}}. Silakan menindaklanjuti melalui Media Intelligence Pemko Batam.'),
 ('RESPONSE_SUBMITTED','Respons OPD Menunggu Review','Respons resmi untuk isu {{issue_title}} telah dikirim oleh {{sender_name}} dan menunggu review Humas.'),
 ('REVISION_REQUESTED','Revisi Respons Diperlukan','Respons untuk isu {{issue_title}} memerlukan revisi. Catatan: {{note}}. Silakan buka Media Intelligence Pemko Batam.'),
 ('RESPONSE_APPROVED','Respons Telah Disetujui','Respons untuk isu {{issue_title}} telah disetujui oleh Humas.'),
 ('EXECUTIVE_NOTE','Tanggapan Executive Baru','Executive memberikan tanggapan pada isu {{issue_title}}. Silakan buka Media Intelligence Pemko Batam untuk melihat tanggapan.')
ON CONFLICT (event_type) DO NOTHING;
