-- Phase 3 supporting unit contributors.
-- ADDITIVE ONLY: does not replace issue_workflow_supporting_opd or issue_response_submissions.
-- This migration is intentionally prepared in source control first; apply to a database only after explicit approval.

CREATE TABLE IF NOT EXISTS issue_workflow_contributors (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  contributor_type TEXT NOT NULL
    CHECK (contributor_type IN ('UPTD','DISTRICT')),
  uptd_id BIGINT REFERENCES uptd(id) ON DELETE RESTRICT,
  district_id BIGINT REFERENCES districts(id) ON DELETE RESTRICT,
  contribution_role TEXT NOT NULL
    CHECK (contribution_role IN ('TECHNICAL','FIELD_INFORMATION')),
  status TEXT NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','IN_PROGRESS','SUBMITTED')),
  assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT issue_workflow_contributor_entity_check CHECK (
    (contributor_type='UPTD' AND uptd_id IS NOT NULL AND district_id IS NULL AND contribution_role='TECHNICAL')
    OR
    (contributor_type='DISTRICT' AND district_id IS NOT NULL AND uptd_id IS NULL AND contribution_role='FIELD_INFORMATION')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_issue_workflow_contributor_uptd
  ON issue_workflow_contributors(issue_id, uptd_id)
  WHERE contributor_type='UPTD';

CREATE UNIQUE INDEX IF NOT EXISTS uq_issue_workflow_contributor_district
  ON issue_workflow_contributors(issue_id, district_id)
  WHERE contributor_type='DISTRICT';

CREATE INDEX IF NOT EXISTS idx_issue_workflow_contributors_issue_status
  ON issue_workflow_contributors(issue_id, status, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_issue_workflow_contributors_uptd
  ON issue_workflow_contributors(uptd_id, status, assigned_at DESC)
  WHERE contributor_type='UPTD';

CREATE INDEX IF NOT EXISTS idx_issue_workflow_contributors_district
  ON issue_workflow_contributors(district_id, status, assigned_at DESC)
  WHERE contributor_type='DISTRICT';

CREATE TABLE IF NOT EXISTS issue_contributor_submissions (
  id BIGSERIAL PRIMARY KEY,
  contributor_assignment_id BIGINT NOT NULL REFERENCES issue_workflow_contributors(id) ON DELETE CASCADE,
  submitted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  field_condition TEXT,
  facts_data TEXT,
  action_taken TEXT,
  notes TEXT,
  supporting_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT issue_contributor_submission_content_check CHECK (
    NULLIF(BTRIM(COALESCE(field_condition,'')),'') IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(facts_data,'')),'') IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(action_taken,'')),'') IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(notes,'')),'') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_issue_contributor_submissions_assignment
  ON issue_contributor_submissions(contributor_assignment_id, created_at DESC);

COMMENT ON TABLE issue_workflow_contributors IS
  'Phase 3 supporting UPTD/district contributors. Lead OPD remains derived from Primary Keyword routing; supporting OPDs remain in issue_workflow_supporting_opd.';

COMMENT ON TABLE issue_contributor_submissions IS
  'Contributor facts/field input for Lead OPD consolidation. This is not the final official OPD response and intentionally has no key_message.';
