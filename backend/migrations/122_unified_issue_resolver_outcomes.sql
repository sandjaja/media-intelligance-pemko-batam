DO $$
DECLARE constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid='unified_candidate_issues'::regclass
    AND contype='c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE unified_candidate_issues DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE unified_candidate_issues
  ADD CONSTRAINT unified_candidate_issues_status_check
  CHECK (status IN ('PENDING','APPROVED','MERGED','IGNORED','BELOW_THRESHOLD','MATCHED_ISSUE'));

CREATE INDEX IF NOT EXISTS idx_unified_candidate_issues_resolver_outcome
  ON unified_candidate_issues(organization_id,status,last_detected_at DESC)
  WHERE status IN ('BELOW_THRESHOLD','MATCHED_ISSUE');
