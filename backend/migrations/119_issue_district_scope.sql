-- Issue Management: manual multi-district scope
CREATE TABLE IF NOT EXISTS issue_districts (
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  district_id BIGINT NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','SUGGESTED')),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (issue_id,district_id)
);
CREATE INDEX IF NOT EXISTS idx_issue_districts_district ON issue_districts(district_id,issue_id);

ALTER TABLE issues ADD COLUMN IF NOT EXISTS geographic_scope TEXT NOT NULL DEFAULT 'UNSPECIFIED'
  CHECK (geographic_scope IN ('UNSPECIFIED','DISTRICTS','CITYWIDE'));
