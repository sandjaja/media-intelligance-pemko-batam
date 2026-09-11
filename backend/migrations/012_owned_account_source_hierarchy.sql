-- Phase 3D: source hierarchy for official Pemko/OPD channels.
-- Removes clustering dependency on a specific domain/account name.
ALTER TABLE owned_social_accounts
  ADD COLUMN IF NOT EXISTS ownership_level TEXT NOT NULL DEFAULT 'opd',
  ADD COLUMN IF NOT EXISTS is_primary_source BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_priority INTEGER NOT NULL DEFAULT 10;

DO $$ BEGIN
  ALTER TABLE owned_social_accounts
    ADD CONSTRAINT owned_social_accounts_ownership_level_check
    CHECK (ownership_level IN ('pemko','opd'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE owned_social_accounts
    ADD CONSTRAINT owned_social_accounts_source_priority_check
    CHECK (source_priority >= 0 AND source_priority <= 1000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_owned_social_source_hierarchy
  ON owned_social_accounts(active, is_primary_source, source_priority DESC, platform);

-- Existing rows already model Pemko/lintas OPD with opd_id IS NULL.
UPDATE owned_social_accounts
SET ownership_level = CASE WHEN opd_id IS NULL THEN 'pemko' ELSE 'opd' END,
    source_priority = CASE WHEN opd_id IS NULL THEN GREATEST(source_priority,100) ELSE source_priority END
WHERE ownership_level = 'opd' OR source_priority = 10;

-- Backward-compatible bootstrap only. Administrators can later move primary status
-- to a replacement website/account without changing clustering code.
UPDATE owned_social_accounts
SET is_primary_source = true,
    ownership_level = 'pemko',
    source_priority = GREATEST(source_priority,100)
WHERE lower(handle) = 'mediacenter.batam.go.id';
