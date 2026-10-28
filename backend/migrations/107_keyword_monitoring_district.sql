-- Extend monitoring keywords so one keyword can target either an OPD or a district.
-- Additive migration. Existing OPD keywords remain unchanged.

ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS district_id BIGINT REFERENCES districts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_keywords_active_district
  ON keywords(active, district_id)
  WHERE district_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_keywords_opd_keyword
  ON keywords(opd_id, lower(keyword))
  WHERE opd_id IS NOT NULL AND district_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_keywords_district_keyword
  ON keywords(district_id, lower(keyword))
  WHERE district_id IS NOT NULL AND opd_id IS NULL;

-- A keyword must belong to exactly one monitoring target.
-- NOT VALID keeps deployment safe if legacy bad rows exist; validate after audit.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'keywords_single_target_check'
  ) THEN
    ALTER TABLE keywords
      ADD CONSTRAINT keywords_single_target_check
      CHECK ((opd_id IS NOT NULL)::int + (district_id IS NOT NULL)::int = 1)
      NOT VALID;
  END IF;
END $$;
