-- PREVIEW ONLY. Settings are disabled by default and do not register a cron job.
CREATE TABLE IF NOT EXISTS executive_brief_schedule_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id=1),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  hour_wib SMALLINT NOT NULL DEFAULT 6 CHECK (hour_wib BETWEEN 0 AND 23),
  minute_wib SMALLINT NOT NULL DEFAULT 30 CHECK (minute_wib BETWEEN 0 AND 59),
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta' CHECK (timezone='Asia/Jakarta'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO executive_brief_schedule_settings(id,enabled,hour_wib,minute_wib)
VALUES(1,FALSE,6,30) ON CONFLICT(id) DO NOTHING;
