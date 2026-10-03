-- Issue taxonomy management foundation.
-- Additive: links issues to the existing taxonomy_categories master.

ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS taxonomy_category_id BIGINT
  REFERENCES taxonomy_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_issues_taxonomy_category
  ON issues(taxonomy_category_id);

INSERT INTO taxonomy_categories(code,name,description,active) VALUES
('GOV_FINANCE','Pemerintahan / Keuangan Daerah','Pemerintahan, APBD, PAD, anggaran, fiskal dan keuangan daerah',TRUE),
('ECON_INVEST','Ekonomi & Investasi','Ekonomi, investasi, industri, tenaga kerja dan pengembangan usaha',TRUE),
('EXTERNAL_VERTICAL','External / Instansi Vertikal','Koordinasi dan isu yang melibatkan instansi vertikal/eksternal pemerintah daerah',TRUE)
ON CONFLICT (code) DO UPDATE
SET name=EXCLUDED.name,
    description=EXCLUDED.description,
    active=TRUE,
    updated_at=now();

-- Backfill known preview issues. Safe on environments where these ids do not exist.
UPDATE issues i
SET taxonomy_category_id=t.id
FROM taxonomy_categories t
WHERE i.taxonomy_category_id IS NULL
  AND (
    (i.id=1 AND t.code='SPORT_YOUTH') OR
    (i.id=2 AND t.code='INFRA_TRANSPORT') OR
    (i.id=3 AND t.code='GOV_FINANCE') OR
    (i.id=4 AND t.code='ECON_INVEST') OR
    (i.id=5 AND t.code='PUBLIC_SERVICE') OR
    (i.id=7 AND t.code='EXTERNAL_VERTICAL')
  );
