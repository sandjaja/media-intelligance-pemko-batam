BEGIN;

CREATE TABLE IF NOT EXISTS article_uptd (
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  uptd_id BIGINT NOT NULL REFERENCES uptd(id) ON DELETE CASCADE,
  relevance_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  evidence TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (article_id, uptd_id)
);

CREATE INDEX IF NOT EXISTS idx_article_uptd_uptd_article
  ON article_uptd (uptd_id, article_id);

CREATE INDEX IF NOT EXISTS idx_article_uptd_primary
  ON article_uptd (article_id, is_primary)
  WHERE is_primary = TRUE;

COMMIT;
