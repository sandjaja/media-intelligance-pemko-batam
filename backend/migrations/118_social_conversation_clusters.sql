BEGIN;

CREATE TABLE IF NOT EXISTS social_conversation_clusters (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  canonical_title TEXT NOT NULL,
  taxonomy_id BIGINT NULL REFERENCES taxonomy(id) ON DELETE SET NULL,
  keyword_id BIGINT NULL REFERENCES keywords(id) ON DELETE SET NULL,
  representative_mention_id BIGINT NULL REFERENCES social_mentions(id) ON DELETE SET NULL,
  member_count INTEGER NOT NULL DEFAULT 0,
  platform_count INTEGER NOT NULL DEFAULT 0,
  first_published_at TIMESTAMPTZ NULL,
  last_published_at TIMESTAMPTZ NULL,
  engine_version TEXT NOT NULL DEFAULT 'social-conversation-v1',
  origin_mode TEXT NOT NULL DEFAULT 'SYSTEM' CHECK (origin_mode IN ('SYSTEM','MANUAL')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_conversation_cluster_members (
  cluster_id BIGINT NOT NULL REFERENCES social_conversation_clusters(id) ON DELETE CASCADE,
  mention_id BIGINT NOT NULL REFERENCES social_mentions(id) ON DELETE CASCADE,
  similarity_score NUMERIC(6,5) NOT NULL DEFAULT 1,
  similarity_type TEXT NOT NULL DEFAULT 'semantic',
  matched_by TEXT NULL,
  assignment_mode TEXT NOT NULL DEFAULT 'SYSTEM' CHECK (assignment_mode IN ('SYSTEM','MANUAL')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cluster_id, mention_id),
  UNIQUE (mention_id)
);

CREATE TABLE IF NOT EXISTS social_conversation_manual_exclusions (
  mention_id BIGINT PRIMARY KEY REFERENCES social_mentions(id) ON DELETE CASCADE,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reason TEXT NULL,
  excluded_by BIGINT NULL,
  excluded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_conversation_clusters_org_status_last
  ON social_conversation_clusters(organization_id,status,last_published_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_conversation_clusters_taxonomy_keyword
  ON social_conversation_clusters(organization_id,taxonomy_id,keyword_id);
CREATE INDEX IF NOT EXISTS idx_social_conversation_members_cluster
  ON social_conversation_cluster_members(cluster_id);
CREATE INDEX IF NOT EXISTS idx_social_conversation_manual_exclusions_org
  ON social_conversation_manual_exclusions(organization_id);

COMMIT;
