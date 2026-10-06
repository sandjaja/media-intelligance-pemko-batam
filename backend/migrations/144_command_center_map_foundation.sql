-- Command Center Map foundation.
-- Additive only: stores boundary metadata and feature-to-district mapping.
-- GeoJSON geometry itself belongs in object storage, not PostgreSQL.

BEGIN;

CREATE TABLE IF NOT EXISTS organization_map_boundaries (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_name TEXT,
  source_year INTEGER,
  source_reference TEXT,
  original_storage_key TEXT NOT NULL,
  optimized_storage_key TEXT NOT NULL,
  original_size_bytes BIGINT,
  optimized_size_bytes BIGINT,
  feature_count INTEGER NOT NULL CHECK (feature_count > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','INACTIVE')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_map_boundary_active
  ON organization_map_boundaries(organization_id)
  WHERE status='ACTIVE';

CREATE INDEX IF NOT EXISTS idx_organization_map_boundaries_org
  ON organization_map_boundaries(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_map_boundary_features (
  id BIGSERIAL PRIMARY KEY,
  boundary_id BIGINT NOT NULL REFERENCES organization_map_boundaries(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  official_code TEXT,
  district_id BIGINT REFERENCES districts(id) ON DELETE RESTRICT,
  match_method TEXT NOT NULL DEFAULT 'UNMATCHED'
    CHECK (match_method IN ('OFFICIAL_CODE','NORMALIZED_NAME','MANUAL','UNMATCHED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(boundary_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_map_boundary_features_district
  ON organization_map_boundary_features(boundary_id, district_id);

COMMIT;
