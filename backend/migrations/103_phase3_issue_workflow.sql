-- Phase 3 issue-response workflow foundation
-- Additive migration. Keeps analytical issues.status intact and introduces
-- a separate operational workflow lifecycle.

CREATE TABLE IF NOT EXISTS issue_workflows (
  issue_id BIGINT PRIMARY KEY REFERENCES issues(id) ON DELETE CASCADE,
  workflow_status TEXT NOT NULL DEFAULT 'NEW'
    CHECK (workflow_status IN (
      'NEW','ASSIGNED','IN_PROGRESS','SUBMITTED','REVISION_REQUIRED',
      'APPROVED','PUBLISHED','MONITORING','CLOSED'
    )),
  lead_opd_id BIGINT REFERENCES opd(id) ON DELETE SET NULL,
  assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_workflows_status
  ON issue_workflows(workflow_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_workflows_lead_opd
  ON issue_workflows(lead_opd_id, workflow_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS issue_workflow_supporting_opd (
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  opd_id BIGINT NOT NULL REFERENCES opd(id) ON DELETE CASCADE,
  assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(issue_id, opd_id)
);
CREATE INDEX IF NOT EXISTS idx_issue_workflow_supporting_opd_opd
  ON issue_workflow_supporting_opd(opd_id, assigned_at DESC);

CREATE TABLE IF NOT EXISTS issue_response_submissions (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  opd_id BIGINT NOT NULL REFERENCES opd(id) ON DELETE RESTRICT,
  submitted_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1,
  response_text TEXT NOT NULL,
  facts_data TEXT,
  key_message TEXT,
  supporting_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SUBMITTED','REVISION_REQUIRED','APPROVED','SUPERSEDED')),
  review_reason TEXT,
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(issue_id, opd_id, version)
);
CREATE INDEX IF NOT EXISTS idx_issue_response_issue_status
  ON issue_response_submissions(issue_id, status, version DESC);
CREATE INDEX IF NOT EXISTS idx_issue_response_opd_status
  ON issue_response_submissions(opd_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS issue_workflow_events (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issue_workflow_events_issue
  ON issue_workflow_events(issue_id, created_at DESC);

-- Backfill a NEW operational workflow row for existing issues without changing
-- their analytical issue status.
INSERT INTO issue_workflows(issue_id, workflow_status, lead_opd_id)
SELECT i.id, 'NEW', i.leading_opd_id
FROM issues i
LEFT JOIN issue_workflows w ON w.issue_id=i.id
WHERE w.issue_id IS NULL;
