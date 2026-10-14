-- Persist the latest Communication Gap analysis so Phase 3 assignment can read it
-- without invoking Gemini again.
CREATE TABLE IF NOT EXISTS issue_communication_gap_snapshots (
  issue_id BIGINT PRIMARY KEY REFERENCES issues(id) ON DELETE CASCADE,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  signature TEXT NOT NULL,
  result JSONB NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  analyzed_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_issue_communication_gap_snapshots_org_updated
  ON issue_communication_gap_snapshots(organization_id, updated_at DESC);
COMMENT ON TABLE issue_communication_gap_snapshots IS 'Latest persisted Communication Gap analysis per Issue. Read-only consumers must not invoke AI.';
