-- Phase 3B — Social Intelligence Data Foundation
-- Additive/idempotent migration. No collector-specific vendor assumptions.
-- Normalizes public social content, keyword/issue linkage, owned-account metrics,
-- and time-series post metrics so social intelligence can join the existing
-- issue/narrative/alert engine used by online and print intelligence.

CREATE TABLE IF NOT EXISTS social_mentions (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL CHECK(platform IN ('instagram','facebook','tiktok','x','youtube','website','threads','other')),
  external_id TEXT,
  content_type TEXT NOT NULL DEFAULT 'post'
    CHECK(content_type IN ('post','comment','reply','video','short','reel','story','live','article','other')),
  source_kind TEXT NOT NULL DEFAULT 'external'
    CHECK(source_kind IN ('owned','external','manual')),
  owned_account_id BIGINT REFERENCES owned_social_accounts(id) ON DELETE SET NULL,
  opd_id BIGINT REFERENCES opd(id) ON DELETE SET NULL,
  author_name TEXT,
  author_handle TEXT,
  author_profile_url TEXT,
  canonical_url TEXT,
  title TEXT,
  content TEXT,
  language TEXT,
  published_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sentiment TEXT CHECK(sentiment IN ('positive','neutral','negative')),
  sentiment_score NUMERIC(6,3),
  importance_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  influence_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'low'
    CHECK(risk_level IN ('low','medium','high','critical')),
  location_id BIGINT REFERENCES locations(id) ON DELETE SET NULL,
  district_id BIGINT REFERENCES districts(id) ON DELETE SET NULL,
  village_id BIGINT REFERENCES villages(id) ON DELETE SET NULL,
  content_hash TEXT,
  collector TEXT,
  raw_payload JSONB,
  metadata JSONB,
  processing_status TEXT NOT NULL DEFAULT 'captured'
    CHECK(processing_status IN ('captured','classified','linked','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_mentions_platform_external
  ON social_mentions(platform, external_id)
  WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_mentions_content_hash
  ON social_mentions(platform, content_hash)
  WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_mentions_published
  ON social_mentions(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_social_mentions_platform_published
  ON social_mentions(platform, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_social_mentions_opd_published
  ON social_mentions(opd_id, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_social_mentions_owned_account
  ON social_mentions(owned_account_id, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_social_mentions_sentiment
  ON social_mentions(sentiment, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_social_mentions_risk
  ON social_mentions(risk_level, risk_score DESC, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_social_mentions_region
  ON social_mentions(district_id, village_id, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_social_mentions_processing
  ON social_mentions(processing_status, captured_at DESC);

CREATE TABLE IF NOT EXISTS social_mention_keywords (
  mention_id BIGINT NOT NULL REFERENCES social_mentions(id) ON DELETE CASCADE,
  keyword_id BIGINT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  matched_text TEXT,
  match_count INTEGER NOT NULL DEFAULT 1 CHECK(match_count >= 1),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0000
    CHECK(confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(mention_id, keyword_id)
);
CREATE INDEX IF NOT EXISTS idx_social_mention_keywords_keyword
  ON social_mention_keywords(keyword_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_mention_issues (
  mention_id BIGINT NOT NULL REFERENCES social_mentions(id) ON DELETE CASCADE,
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  relevance_score NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK(relevance_score >= 0 AND relevance_score <= 100),
  linkage_source TEXT NOT NULL DEFAULT 'rule'
    CHECK(linkage_source IN ('rule','ai','manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(mention_id, issue_id)
);
CREATE INDEX IF NOT EXISTS idx_social_mention_issues_issue
  ON social_mention_issues(issue_id, relevance_score DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS owned_social_account_metrics (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES owned_social_accounts(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  followers BIGINT,
  following BIGINT,
  subscribers BIGINT,
  total_posts BIGINT,
  reach BIGINT,
  impressions BIGINT,
  profile_views BIGINT,
  video_views BIGINT,
  likes BIGINT,
  comments BIGINT,
  shares BIGINT,
  saves BIGINT,
  clicks BIGINT,
  engagement_count BIGINT,
  engagement_rate NUMERIC(8,4),
  data_scope TEXT NOT NULL DEFAULT 'snapshot'
    CHECK(data_scope IN ('snapshot','daily','weekly','monthly')),
  source TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, measured_at, data_scope)
);
CREATE INDEX IF NOT EXISTS idx_owned_social_metrics_account_time
  ON owned_social_account_metrics(account_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_owned_social_metrics_scope_time
  ON owned_social_account_metrics(data_scope, measured_at DESC);

CREATE TABLE IF NOT EXISTS social_post_metrics (
  id BIGSERIAL PRIMARY KEY,
  mention_id BIGINT NOT NULL REFERENCES social_mentions(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  views BIGINT,
  reach BIGINT,
  impressions BIGINT,
  likes BIGINT,
  comments BIGINT,
  shares BIGINT,
  saves BIGINT,
  clicks BIGINT,
  reposts BIGINT,
  engagement_count BIGINT,
  engagement_rate NUMERIC(8,4),
  source TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(mention_id, measured_at)
);
CREATE INDEX IF NOT EXISTS idx_social_post_metrics_mention_time
  ON social_post_metrics(mention_id, measured_at DESC);

-- Generic evidence linkage allows social content to participate in the same
-- evidentiary model as online/print records without duplicating evidence data.
ALTER TABLE evidence_sources
  ADD COLUMN IF NOT EXISTS social_mention_id BIGINT REFERENCES social_mentions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_evidence_social_mention
  ON evidence_sources(social_mention_id, captured_at DESC)
  WHERE social_mention_id IS NOT NULL;

-- Existing alerts may now point directly to a social signal.
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS social_mention_id BIGINT REFERENCES social_mentions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_alerts_social_mention
  ON alerts(social_mention_id, created_at DESC)
  WHERE social_mention_id IS NOT NULL;
