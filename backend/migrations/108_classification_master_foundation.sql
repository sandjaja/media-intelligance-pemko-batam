-- 108_classification_master_foundation.sql
-- Additive foundation for the approved classification master.
-- Safe transition rules:
--   * do not delete/deactivate legacy taxonomy
--   * do not remove legacy keyword target columns/constraints
--   * do not seed the 10 sectors / 40 taxonomy rows here

BEGIN;

CREATE TABLE IF NOT EXISTS classification_sectors (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT classification_sectors_org_code_key UNIQUE (organization_id, code),
  CONSTRAINT classification_sectors_org_name_key UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_classification_sectors_org_active_sort
  ON classification_sectors (organization_id, active, sort_order, id);

ALTER TABLE taxonomy_categories
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sector_id BIGINT REFERENCES classification_sectors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sort_order SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS legacy BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_taxonomy_categories_org_sector_active
  ON taxonomy_categories (organization_id, sector_id, active, sort_order, id);

ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS normalized_keyword TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE keywords
SET normalized_keyword = lower(regexp_replace(btrim(keyword), '\s+', ' ', 'g'))
WHERE normalized_keyword IS NULL;

CREATE INDEX IF NOT EXISTS idx_keywords_org_normalized
  ON keywords (organization_id, normalized_keyword);

CREATE OR REPLACE FUNCTION normalize_keyword_master_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_keyword := lower(regexp_replace(btrim(NEW.keyword), '\s+', ' ', 'g'));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keywords_normalize_master_fields ON keywords;
CREATE TRIGGER trg_keywords_normalize_master_fields
BEFORE INSERT OR UPDATE OF keyword ON keywords
FOR EACH ROW
EXECUTE FUNCTION normalize_keyword_master_fields();

CREATE TABLE IF NOT EXISTS keyword_opd (
  keyword_id BIGINT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  opd_id BIGINT NOT NULL REFERENCES opd(id) ON DELETE CASCADE,
  weight NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (keyword_id, opd_id),
  CONSTRAINT keyword_opd_weight_check CHECK (weight > 0 AND weight <= 10)
);

CREATE INDEX IF NOT EXISTS idx_keyword_opd_opd_active
  ON keyword_opd (opd_id, active, keyword_id);

CREATE TABLE IF NOT EXISTS keyword_district (
  keyword_id BIGINT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  district_id BIGINT NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  weight NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (keyword_id, district_id),
  CONSTRAINT keyword_district_weight_check CHECK (weight > 0 AND weight <= 10)
);

CREATE INDEX IF NOT EXISTS idx_keyword_district_district_active
  ON keyword_district (district_id, active, keyword_id);

COMMIT;
