BEGIN;

ALTER TABLE evidence_sources
  DROP CONSTRAINT IF EXISTS evidence_sources_check;

ALTER TABLE evidence_sources
  ADD CONSTRAINT evidence_sources_check
  CHECK (
    article_id IS NOT NULL
    OR media_scan_id IS NOT NULL
    OR print_article_id IS NOT NULL
    OR social_mention_id IS NOT NULL
  );

COMMIT;
