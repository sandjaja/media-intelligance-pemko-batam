-- 114_keyword_opd_routing_roles.sql
-- Additive schema for Master Classification OPD routing.
-- Final routing remains per master keyword.
-- Rules: exactly one PRIMARY and at most three SUPPORTING OPDs per keyword.
-- No existing routing rows are deleted or deactivated.

BEGIN;

ALTER TABLE keyword_opd
  ADD COLUMN IF NOT EXISTS routing_role TEXT;

UPDATE keyword_opd
SET routing_role = 'PRIMARY'
WHERE routing_role IS NULL;

ALTER TABLE keyword_opd
  ALTER COLUMN routing_role SET DEFAULT 'SUPPORTING',
  ALTER COLUMN routing_role SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'keyword_opd_routing_role_check'
      AND conrelid = 'keyword_opd'::regclass
  ) THEN
    ALTER TABLE keyword_opd
      ADD CONSTRAINT keyword_opd_routing_role_check
      CHECK (routing_role IN ('PRIMARY','SUPPORTING'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_keyword_opd_one_active_primary
  ON keyword_opd(keyword_id)
  WHERE active = TRUE AND routing_role = 'PRIMARY';

CREATE OR REPLACE FUNCTION enforce_keyword_opd_supporting_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  supporting_count INTEGER;
BEGIN
  IF NEW.active = TRUE AND NEW.routing_role = 'SUPPORTING' THEN
    SELECT COUNT(*) INTO supporting_count
    FROM keyword_opd ko
    WHERE ko.keyword_id = NEW.keyword_id
      AND ko.active = TRUE
      AND ko.routing_role = 'SUPPORTING'
      AND (TG_OP <> 'UPDATE' OR ko.opd_id <> OLD.opd_id);

    IF supporting_count >= 3 THEN
      RAISE EXCEPTION 'A master keyword may have at most 3 active supporting OPDs'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keyword_opd_supporting_limit ON keyword_opd;
CREATE TRIGGER trg_keyword_opd_supporting_limit
BEFORE INSERT OR UPDATE OF active, routing_role, keyword_id, opd_id ON keyword_opd
FOR EACH ROW
EXECUTE FUNCTION enforce_keyword_opd_supporting_limit();

COMMIT;
