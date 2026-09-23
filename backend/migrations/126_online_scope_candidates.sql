CREATE TABLE IF NOT EXISTS online_scope_candidates (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id BIGINT NOT NULL REFERENCES media_sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  excerpt TEXT,
  scope_status VARCHAR(32) NOT NULL DEFAULT 'OUT_OF_SCOPE',
  scope_reason TEXT,
  matched_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by BIGINT,
  reviewed_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(organization_id,url)
);

CREATE INDEX IF NOT EXISTS idx_online_scope_candidates_review
  ON online_scope_candidates(organization_id,scope_status,active,last_seen_at DESC);
