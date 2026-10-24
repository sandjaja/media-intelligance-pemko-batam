CREATE TABLE IF NOT EXISTS issue_monitors (
 id bigserial PRIMARY KEY, organization_id bigint NOT NULL REFERENCES organizations(id), issue_id bigint NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
 name text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','watching','expired','closed')),
 created_by bigint NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_issue_monitors_issue ON issue_monitors(issue_id,status);
CREATE INDEX IF NOT EXISTS idx_issue_monitors_window ON issue_monitors(organization_id,status,starts_at,ends_at);
CREATE TABLE IF NOT EXISTS issue_monitor_terms (
 id bigserial PRIMARY KEY, monitor_id bigint NOT NULL REFERENCES issue_monitors(id) ON DELETE CASCADE,
 term text NOT NULL, match_type text NOT NULL DEFAULT 'DIRECT' CHECK(match_type IN ('DIRECT','CONTEXT')),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(monitor_id,term)
);
CREATE INDEX IF NOT EXISTS idx_issue_monitor_terms_active ON issue_monitor_terms(monitor_id,active);
CREATE TABLE IF NOT EXISTS issue_monitor_sources (
 monitor_id bigint NOT NULL REFERENCES issue_monitors(id) ON DELETE CASCADE,
 source_type text NOT NULL CHECK(source_type IN ('online','print','social','owned')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(monitor_id,source_type)
);
ALTER TABLE issue_articles DROP CONSTRAINT IF EXISTS issue_articles_assignment_source_check;
ALTER TABLE issue_articles ADD CONSTRAINT issue_articles_assignment_source_check CHECK(assignment_source IN ('AUTO','MANUAL','ISSUE_MONITOR'));
ALTER TABLE social_mention_issues DROP CONSTRAINT IF EXISTS social_mention_issues_linkage_source_check;
ALTER TABLE social_mention_issues ADD CONSTRAINT social_mention_issues_linkage_source_check CHECK(linkage_source IN ('rule','ai','manual','ISSUE_MONITOR'));