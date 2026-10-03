-- 115_issue_assignment_provenance.sql
-- Distinguish analyzer-managed issue links from future Admin/Humas manual overrides.

ALTER TABLE issue_articles
  ADD COLUMN IF NOT EXISTS assignment_source VARCHAR(16) NOT NULL DEFAULT 'AUTO';

ALTER TABLE issue_articles
  DROP CONSTRAINT IF EXISTS issue_articles_assignment_source_check;

ALTER TABLE issue_articles
  ADD CONSTRAINT issue_articles_assignment_source_check
  CHECK (assignment_source IN ('AUTO', 'MANUAL'));

CREATE INDEX IF NOT EXISTS idx_issue_articles_article_source
  ON issue_articles(article_id, assignment_source);

COMMENT ON COLUMN issue_articles.assignment_source IS
  'AUTO = managed by classification engine; MANUAL = Admin/Humas override preserved during reanalysis.';
