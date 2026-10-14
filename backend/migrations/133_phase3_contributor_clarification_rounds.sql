-- Phase 3 contributor clarification sub-workflow.
-- Humas selects potential contributors; Lead OPD decides whether clarification is needed.
-- Every request/submission/review is preserved as an immutable round history.

ALTER TABLE issue_workflow_contributors
  DROP CONSTRAINT IF EXISTS issue_workflow_contributors_status_check;

ALTER TABLE issue_workflow_contributors
  ADD CONSTRAINT issue_workflow_contributors_status_check
  CHECK (status IN (
    'NOMINATED',
    'CLARIFICATION_REQUESTED',
    'SUBMITTED',
    'ACCEPTED'
  ));

-- Existing REQUESTED means Humas selected the contributor but Lead has not requested clarification yet.
UPDATE issue_workflow_contributors
SET status = 'NOMINATED', updated_at = NOW()
WHERE status = 'REQUESTED';

-- Existing smoke-test submissions are preserved and remain submitted for Lead review.
UPDATE issue_workflow_contributors
SET status = 'SUBMITTED', updated_at = NOW()
WHERE status = 'IN_PROGRESS';

ALTER TABLE issue_workflow_contributors
  ALTER COLUMN status SET DEFAULT 'NOMINATED';

CREATE TABLE IF NOT EXISTS issue_contributor_clarification_rounds (
  id BIGSERIAL PRIMARY KEY,
  contributor_assignment_id BIGINT NOT NULL
    REFERENCES issue_workflow_contributors(id) ON DELETE RESTRICT,
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  request_text TEXT NOT NULL CHECK (length(btrim(request_text)) > 0),
  requested_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submission_id BIGINT NULL
    REFERENCES issue_contributor_submissions(id) ON DELETE RESTRICT,
  reviewed_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  review_status TEXT NOT NULL DEFAULT 'REQUESTED'
    CHECK (review_status IN ('REQUESTED','SUBMITTED','ACCEPTED','FOLLOW_UP_REQUESTED')),
  review_note TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contributor_assignment_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_issue_contributor_rounds_assignment
  ON issue_contributor_clarification_rounds(contributor_assignment_id, round_number DESC);

CREATE INDEX IF NOT EXISTS idx_issue_contributor_rounds_status
  ON issue_contributor_clarification_rounds(review_status, requested_at DESC);

-- Supporting OPD uses the same contributor sub-workflow as UPTD and Kecamatan.
ALTER TABLE issue_workflow_contributors
  ADD COLUMN IF NOT EXISTS opd_id BIGINT NULL REFERENCES opd(id) ON DELETE RESTRICT;

ALTER TABLE issue_workflow_contributors
  DROP CONSTRAINT IF EXISTS issue_workflow_contributor_entity_check;

ALTER TABLE issue_workflow_contributors
  DROP CONSTRAINT IF EXISTS issue_workflow_contributors_contributor_type_check;

ALTER TABLE issue_workflow_contributors
  ADD CONSTRAINT issue_workflow_contributors_contributor_type_check
  CHECK (contributor_type IN ('OPD','UPTD','DISTRICT'));

ALTER TABLE issue_workflow_contributors
  DROP CONSTRAINT IF EXISTS issue_workflow_contributors_contribution_role_check;

ALTER TABLE issue_workflow_contributors
  ADD CONSTRAINT issue_workflow_contributors_contribution_role_check
  CHECK (contribution_role IN ('SUPPORTING','TECHNICAL','FIELD_INFORMATION'));

ALTER TABLE issue_workflow_contributors
  ADD CONSTRAINT issue_workflow_contributor_entity_check
  CHECK (
    (contributor_type='OPD' AND opd_id IS NOT NULL AND uptd_id IS NULL AND district_id IS NULL AND contribution_role='SUPPORTING')
    OR
    (contributor_type='UPTD' AND opd_id IS NULL AND uptd_id IS NOT NULL AND district_id IS NULL AND contribution_role='TECHNICAL')
    OR
    (contributor_type='DISTRICT' AND opd_id IS NULL AND uptd_id IS NULL AND district_id IS NOT NULL AND contribution_role='FIELD_INFORMATION')
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_issue_workflow_contributor_opd
  ON issue_workflow_contributors(issue_id, opd_id)
  WHERE contributor_type='OPD';

CREATE INDEX IF NOT EXISTS idx_issue_workflow_contributors_opd
  ON issue_workflow_contributors(opd_id, status, assigned_at DESC)
  WHERE contributor_type='OPD';

-- Preserve the legacy Humas supporting-OPD selections by mirroring them as NOMINATED contributors.
INSERT INTO issue_workflow_contributors
  (issue_id, contributor_type, opd_id, contribution_role, status, assigned_by, assigned_at)
SELECT s.issue_id, 'OPD', s.opd_id, 'SUPPORTING', 'NOMINATED', s.assigned_by, s.assigned_at
FROM issue_workflow_supporting_opd s
ON CONFLICT (issue_id, opd_id) WHERE contributor_type='OPD' DO NOTHING;

COMMENT ON TABLE issue_contributor_clarification_rounds IS
  'Immutable Lead OPD clarification rounds for supporting OPD, UPTD, and district contributors.';
