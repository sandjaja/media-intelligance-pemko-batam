-- Dedicated read-only TV grants. Normal login and refresh-token policies are unchanged.
CREATE TABLE IF NOT EXISTS viewer_display_devices (
 id BIGSERIAL PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name VARCHAR(80) NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL,
 revoked_at TIMESTAMPTZ,
 last_seen_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS viewer_display_devices_user_idx ON viewer_display_devices(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS viewer_display_devices_org_idx ON viewer_display_devices(organization_id,created_at DESC);
