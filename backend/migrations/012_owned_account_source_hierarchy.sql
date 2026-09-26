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

-- Existing rows with no OPD owner represent Pemko/lintas OPD official channels.
-- They are authoritative primary sources across website and social platforms.
UPDATE owned_social_accounts
SET ownership_level = CASE WHEN opd_id IS NULL THEN 'pemko' ELSE 'opd' END,
    is_primary_source = CASE WHEN opd_id IS NULL THEN true ELSE false END,
    source_priority = CASE WHEN opd_id IS NULL THEN GREATEST(source_priority,100) ELSE source_priority END
WHERE ownership_level = 'opd'
   OR source_priority = 10
   OR opd_id IS NULL;

-- Primary-source status is data-driven. If Pemko replaces any website/social account,
-- administrators only need to update ownership/is_primary_source/source_priority.
