-- Phase 8: allow Notification Gateway deliveries to originate from an Early Warning alert.
-- Additive/backward-compatible: existing workflow-event deliveries remain valid.
-- This migration does not create, activate, or mutate Issue/workflow lifecycle state.

ALTER TABLE notification_deliveries
  ALTER COLUMN workflow_event_id DROP NOT NULL;

ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS alert_id BIGINT REFERENCES alerts(id) ON DELETE CASCADE;

ALTER TABLE notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_source_ck;

ALTER TABLE notification_deliveries
  ADD CONSTRAINT notification_deliveries_source_ck
  CHECK (
    (workflow_event_id IS NOT NULL AND alert_id IS NULL)
    OR
    (workflow_event_id IS NULL AND alert_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_alert
  ON notification_deliveries(alert_id)
  WHERE alert_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_deliveries_alert_user_channel
  ON notification_deliveries(alert_id,user_id,channel)
  WHERE alert_id IS NOT NULL;

INSERT INTO notification_templates(event_type,title_template,body_template)
VALUES (
  'EARLY_WARNING_ACTIVATED',
  'Early Warning Isu Aktif',
  'Early Warning telah diaktifkan untuk isu {{issue_title}}. Risk: {{risk_score}}/100 ({{risk_level}}), velocity: {{velocity_score}}/100. Status isu: {{issue_status}}. {{cycle_context}} Silakan buka Media Intelligence Pemko Batam untuk melihat detail.'
)
ON CONFLICT (event_type) DO NOTHING;
