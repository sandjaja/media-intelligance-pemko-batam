CREATE TABLE IF NOT EXISTS issue_publication_analysis_snapshots (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  result JSONB NOT NULL,
  source JSONB NOT NULL DEFAULT '{}'::jsonb,
  gap_analyzed_at TIMESTAMPTZ NULL,
  analyzed_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT issue_publication_analysis_snapshots_issue_unique UNIQUE(issue_id)
);
CREATE INDEX IF NOT EXISTS idx_issue_publication_analysis_snapshots_issue ON issue_publication_analysis_snapshots(issue_id);

CREATE TABLE IF NOT EXISTS issue_monitoring_analysis_snapshots (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  period_number INTEGER NOT NULL CHECK(period_number > 0),
  result JSONB NOT NULL,
  evidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  period_started_at TIMESTAMPTZ NOT NULL,
  period_ended_at TIMESTAMPTZ NOT NULL,
  analyzed_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT issue_monitoring_analysis_snapshots_issue_period_unique UNIQUE(issue_id,period_number)
);
CREATE INDEX IF NOT EXISTS idx_issue_monitoring_analysis_snapshots_issue ON issue_monitoring_analysis_snapshots(issue_id,period_number);