CREATE TABLE IF NOT EXISTS alert_print_articles (
  alert_id BIGINT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  print_article_id BIGINT NOT NULL REFERENCES print_articles(id) ON DELETE CASCADE,
  evidence_role TEXT NOT NULL DEFAULT 'supporting' CHECK (evidence_role IN ('primary','supporting')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, print_article_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_print_articles_print_article_id
  ON alert_print_articles(print_article_id);
