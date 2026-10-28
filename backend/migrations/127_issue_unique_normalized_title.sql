-- Prevent duplicate Issue names inside the same organization.
-- Exact duplicate semantics match the application layer:
-- case-insensitive, trim outer whitespace, collapse repeated whitespace.
-- Historical duplicates must be audited before applying this migration.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_issues_org_normalized_title
  ON issues (
    organization_id,
    lower(regexp_replace(btrim(title), '\\s+', ' ', 'g'))
  );

COMMIT;
