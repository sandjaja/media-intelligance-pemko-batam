BEGIN;

CREATE TABLE IF NOT EXISTS owned_content_clusters (
  id BIGSERIAL PRIMARY KEY,
  canonical_title TEXT,
  representative_mention_id BIGINT REFERENCES social_mentions(id) ON DELETE SET NULL,
  member_count INTEGER NOT NULL DEFAULT 0 CHECK (member_count >= 0),
  channel_count INTEGER NOT NULL DEFAULT 0 CHECK (channel_count >= 0),
  first_published_at TIMESTAMPTZ,
  last_published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owned_content_cluster_members (
  cluster_id BIGINT NOT NULL REFERENCES owned_content_clusters(id) ON DELETE CASCADE,
  mention_id BIGINT NOT NULL REFERENCES social_mentions(id) ON DELETE CASCADE,
  similarity_score NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK (similarity_score >= 0 AND similarity_score <= 1),
  similarity_type TEXT NOT NULL DEFAULT 'unique' CHECK (similarity_type IN ('identical','adapted','unique','manual')),
  matched_by TEXT NOT NULL DEFAULT 'rule-v1' CHECK (matched_by IN ('rule-v1','ai','manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cluster_id, mention_id),
  UNIQUE (mention_id)
);

CREATE INDEX IF NOT EXISTS idx_owned_content_clusters_last_published ON owned_content_clusters(last_published_at DESC);
CREATE INDEX IF NOT EXISTS idx_owned_content_cluster_members_cluster ON owned_content_cluster_members(cluster_id, similarity_score DESC);

COMMIT;
