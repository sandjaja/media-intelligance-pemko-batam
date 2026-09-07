-- Foundation v1 for Batam Media & Communication Command Center
-- Additive migration: preserves existing V2 tables and APIs while introducing
-- normalized geography, RBAC, evidence, print, issue and narrative foundations.

CREATE TABLE IF NOT EXISTS organizations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE opd ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE opd ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS districts (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS villages (
  id BIGSERIAL PRIMARY KEY,
  district_id BIGINT NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(district_id, name)
);
CREATE INDEX IF NOT EXISTS idx_villages_district ON villages(district_id, active);

CREATE TABLE IF NOT EXISTS locations (
  id BIGSERIAL PRIMARY KEY,
  district_id BIGINT REFERENCES districts(id) ON DELETE SET NULL,
  village_id BIGINT REFERENCES villages(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_locations_region ON locations(district_id, village_id);

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  system_role BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  opd_id BIGINT REFERENCES opd(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_roles_scope
  ON user_roles(user_id, role_id, COALESCE(opd_id,0));
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_opd ON user_roles(opd_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active ON refresh_tokens(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON audit_logs(action, created_at DESC);

CREATE TABLE IF NOT EXISTS keyword_groups (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE keywords ADD COLUMN IF NOT EXISTS group_id BIGINT REFERENCES keyword_groups(id) ON DELETE SET NULL;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS match_type TEXT NOT NULL DEFAULT 'contains';
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 2;
CREATE INDEX IF NOT EXISTS idx_keywords_active_opd ON keywords(active, opd_id);
CREATE INDEX IF NOT EXISTS idx_keywords_group ON keywords(group_id);

CREATE TABLE IF NOT EXISTS evidence_sources (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL CHECK(source_type IN ('online','print','social','owned_social','website','manual')),
  source_id BIGINT REFERENCES media_sources(id) ON DELETE SET NULL,
  article_id BIGINT REFERENCES articles(id) ON DELETE CASCADE,
  external_id TEXT,
  canonical_url TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash TEXT,
  snapshot_key TEXT,
  metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_evidence_article ON evidence_sources(article_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_hash ON evidence_sources(content_hash) WHERE content_hash IS NOT NULL;

ALTER TABLE articles ADD COLUMN IF NOT EXISTS district_id BIGINT REFERENCES districts(id) ON DELETE SET NULL;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS village_id BIGINT REFERENCES villages(id) ON DELETE SET NULL;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_articles_region ON articles(district_id, village_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_content_hash ON articles(content_hash) WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS print_editions (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES media_sources(id) ON DELETE CASCADE,
  edition_date DATE NOT NULL,
  edition_name TEXT,
  file_key TEXT,
  page_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id, edition_date, edition_name)
);

CREATE TABLE IF NOT EXISTS print_pages (
  id BIGSERIAL PRIMARY KEY,
  edition_id BIGINT NOT NULL REFERENCES print_editions(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  image_key TEXT,
  thumbnail_key TEXT,
  ocr_text TEXT,
  is_front_page BOOLEAN NOT NULL DEFAULT FALSE,
  analysis JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(edition_id, page_number)
);
CREATE INDEX IF NOT EXISTS idx_print_pages_front ON print_pages(edition_id, is_front_page);

CREATE TABLE IF NOT EXISTS print_clippings (
  id BIGSERIAL PRIMARY KEY,
  page_id BIGINT NOT NULL REFERENCES print_pages(id) ON DELETE CASCADE,
  article_id BIGINT REFERENCES articles(id) ON DELETE SET NULL,
  opd_id BIGINT REFERENCES opd(id) ON DELETE SET NULL,
  headline TEXT,
  clipping_key TEXT,
  thumbnail_key TEXT,
  bbox JSONB,
  ocr_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_print_clippings_page ON print_clippings(page_id);
CREATE INDEX IF NOT EXISTS idx_print_clippings_opd ON print_clippings(opd_id, created_at DESC);

CREATE TABLE IF NOT EXISTS issues (
  id BIGSERIAL PRIMARY KEY,
  issue_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  leading_opd_id BIGINT REFERENCES opd(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'monitoring' CHECK(status IN ('monitoring','developing','critical','resolved','archived')),
  momentum TEXT NOT NULL DEFAULT 'LOW' CHECK(momentum IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  opportunity_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issues_status_momentum ON issues(status, momentum, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_issues_leading_opd ON issues(leading_opd_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS issue_articles (
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  relevance_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(issue_id, article_id)
);
CREATE INDEX IF NOT EXISTS idx_issue_articles_article ON issue_articles(article_id);

CREATE TABLE IF NOT EXISTS issue_opd (
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  opd_id BIGINT NOT NULL REFERENCES opd(id) ON DELETE CASCADE,
  responsibility TEXT NOT NULL DEFAULT 'supporting' CHECK(responsibility IN ('leading','supporting','data_owner','spokesperson')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(issue_id, opd_id, responsibility)
);

CREATE TABLE IF NOT EXISTS narratives (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT REFERENCES issues(id) ON DELETE CASCADE,
  narrative_type TEXT NOT NULL CHECK(narrative_type IN ('dominant','emerging','counter')),
  title TEXT NOT NULL,
  summary TEXT,
  confidence TEXT NOT NULL DEFAULT 'LOW' CHECK(confidence IN ('LOW','MEDIUM','HIGH')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_narratives_issue_active ON narratives(issue_id, active, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS issue_metrics (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  media_volume INTEGER NOT NULL DEFAULT 0,
  social_volume INTEGER NOT NULL DEFAULT 0,
  positive_count INTEGER NOT NULL DEFAULT 0,
  neutral_count INTEGER NOT NULL DEFAULT 0,
  negative_count INTEGER NOT NULL DEFAULT 0,
  velocity_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  influence_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_issue_metrics_issue_time ON issue_metrics(issue_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT REFERENCES issues(id) ON DELETE CASCADE,
  article_id BIGINT REFERENCES articles(id) ON DELETE CASCADE,
  opd_id BIGINT REFERENCES opd(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_alerts_status_severity ON alerts(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_opd ON alerts(opd_id, created_at DESC);

CREATE TABLE IF NOT EXISTS alert_events (
  id BIGSERIAL PRIMARY KEY,
  alert_id BIGINT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_events_alert ON alert_events(alert_id, created_at DESC);

INSERT INTO organizations(name, code)
VALUES ('Pemerintah Kota Batam', 'PEMKO_BATAM')
ON CONFLICT DO NOTHING;

UPDATE opd
SET organization_id = (SELECT id FROM organizations WHERE code='PEMKO_BATAM' LIMIT 1)
WHERE organization_id IS NULL;

INSERT INTO roles(code, name, description) VALUES
  ('super_admin','Super Admin','Full platform administration'),
  ('command_center_analyst','Command Center Analyst','Cross-source intelligence analyst'),
  ('humas','Humas','Communication and media relations operator'),
  ('executive','Executive','Executive command center viewer'),
  ('opd_admin','OPD Admin','OPD-scoped administrator'),
  ('opd_analyst','OPD Analyst','OPD-scoped analyst'),
  ('viewer','Viewer','Read-only access')
ON CONFLICT (code) DO NOTHING;
