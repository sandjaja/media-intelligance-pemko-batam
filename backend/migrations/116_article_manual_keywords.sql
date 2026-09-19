-- 116_article_manual_keywords.sql
-- Keyword-centric manual classification overrides for Admin/Humas.
-- The selected Master Keyword remains the source of truth; taxonomy/sector/OPD are resolved from master relations.

CREATE TABLE IF NOT EXISTS article_manual_keywords (
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  keyword_id BIGINT NOT NULL REFERENCES keywords(id),
  selected_by BIGINT NULL REFERENCES users(id),
  reason TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (article_id, keyword_id)
);

CREATE INDEX IF NOT EXISTS idx_article_manual_keywords_article_active
  ON article_manual_keywords(article_id, active);

CREATE INDEX IF NOT EXISTS idx_article_manual_keywords_keyword_active
  ON article_manual_keywords(keyword_id, active);

COMMENT ON TABLE article_manual_keywords IS
  'Admin/Humas keyword-centric manual classification. Active rows override automatic keyword classification during reanalysis.';
COMMENT ON COLUMN article_manual_keywords.reason IS
  'Optional explanation for the manual correction.';
