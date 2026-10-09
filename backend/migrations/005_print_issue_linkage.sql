-- Phase 2E.4 Print Issue Linkage / Clustering foundation

CREATE TABLE IF NOT EXISTS issue_print_articles (
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  print_article_id BIGINT NOT NULL REFERENCES print_articles(id) ON DELETE CASCADE,
  relevance_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (relevance_score >= 0 AND relevance_score <= 100),
  linkage_status TEXT NOT NULL DEFAULT 'candidate' CHECK (linkage_status IN ('candidate','linked','rejected')),
  decision_source TEXT NOT NULL DEFAULT 'engine' CHECK (decision_source IN ('engine','human')),
  evidence JSONB,
  decided_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(issue_id, print_article_id)
);

CREATE INDEX IF NOT EXISTS idx_issue_print_articles_article
  ON issue_print_articles(print_article_id, linkage_status, relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_issue_print_articles_issue
  ON issue_print_articles(issue_id, linkage_status, created_at DESC);
