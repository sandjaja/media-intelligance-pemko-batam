-- Allow newly-created manual issues to start without a forced risk/momentum assessment.
-- Existing values are preserved. Candidate issues may continue to provide assessed values.

ALTER TABLE issues
  ALTER COLUMN risk_level DROP NOT NULL,
  ALTER COLUMN risk_level DROP DEFAULT,
  ALTER COLUMN momentum DROP NOT NULL,
  ALTER COLUMN momentum DROP DEFAULT;
