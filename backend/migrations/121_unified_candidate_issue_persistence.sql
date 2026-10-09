CREATE TABLE IF NOT EXISTS unified_candidate_issues (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','MERGED','IGNORED')),
  suggested_title TEXT NOT NULL,
  suggested_description TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by BIGINT REFERENCES users(id),
  issue_id BIGINT REFERENCES issues(id),
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id,candidate_key)
);
CREATE INDEX IF NOT EXISTS idx_unified_candidate_issues_pending ON unified_candidate_issues(organization_id,status,last_detected_at DESC);
