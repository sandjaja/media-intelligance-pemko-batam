-- Phase 5 Strakom enrichment: coordination requirements and expected communication outcomes.
-- PREPARED ONLY. Do not apply without explicit database-change approval.
-- Existing approved strategies remain unchanged; new columns default to empty arrays.

ALTER TABLE communication_strategies
  ADD COLUMN IF NOT EXISTS coordination_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS expected_communication_outcomes JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN communication_strategies.coordination_requirements IS
  'Communication/substance coordination needs derived by Strakom; not an assertion that an OPD has or has not acted.';

COMMENT ON COLUMN communication_strategies.expected_communication_outcomes IS
  'Intended audience understanding/action after communication; targets only, not observed impact.';
