-- 137: Phase 3 multi-cycle workflow foundation.
-- One Issue may have many response workflows, but at most one non-CLOSED cycle.
-- Existing Phase 3 data is backfilled to cycle #1 without re-analysis.

ALTER TABLE issue_workflows ADD COLUMN IF NOT EXISTS id BIGSERIAL;
ALTER TABLE issue_workflows ADD COLUMN IF NOT EXISTS cycle_number INTEGER;
UPDATE issue_workflows SET cycle_number=1 WHERE cycle_number IS NULL;
ALTER TABLE issue_workflows ALTER COLUMN cycle_number SET NOT NULL;
ALTER TABLE issue_workflows ADD CONSTRAINT issue_workflows_cycle_number_ck CHECK (cycle_number > 0);
ALTER TABLE issue_workflows DROP CONSTRAINT issue_workflows_pkey;
ALTER TABLE issue_workflows ADD CONSTRAINT issue_workflows_pkey PRIMARY KEY(id);
ALTER TABLE issue_workflows ADD CONSTRAINT issue_workflows_issue_cycle_uq UNIQUE(issue_id,cycle_number);
CREATE UNIQUE INDEX uq_issue_workflows_one_open_cycle ON issue_workflows(issue_id) WHERE workflow_status <> 'CLOSED';
CREATE INDEX idx_issue_workflows_issue_latest ON issue_workflows(issue_id,cycle_number DESC,id DESC);

ALTER TABLE issue_communication_gap_snapshots ADD COLUMN IF NOT EXISTS id BIGSERIAL;
ALTER TABLE issue_communication_gap_snapshots ADD COLUMN IF NOT EXISTS workflow_id BIGINT;
UPDATE issue_communication_gap_snapshots g SET workflow_id=w.id FROM issue_workflows w WHERE w.issue_id=g.issue_id AND w.cycle_number=1 AND g.workflow_id IS NULL;
ALTER TABLE issue_communication_gap_snapshots ALTER COLUMN workflow_id SET NOT NULL;
ALTER TABLE issue_communication_gap_snapshots ADD CONSTRAINT issue_communication_gap_snapshots_workflow_fkey FOREIGN KEY(workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;
ALTER TABLE issue_communication_gap_snapshots DROP CONSTRAINT issue_communication_gap_snapshots_pkey;
ALTER TABLE issue_communication_gap_snapshots ADD CONSTRAINT issue_communication_gap_snapshots_pkey PRIMARY KEY(id);
ALTER TABLE issue_communication_gap_snapshots ADD CONSTRAINT issue_communication_gap_snapshots_workflow_uq UNIQUE(workflow_id);

ALTER TABLE issue_workflow_supporting_opd ADD COLUMN IF NOT EXISTS workflow_id BIGINT;
UPDATE issue_workflow_supporting_opd s SET workflow_id=w.id FROM issue_workflows w WHERE w.issue_id=s.issue_id AND w.cycle_number=1 AND s.workflow_id IS NULL;
ALTER TABLE issue_workflow_supporting_opd ALTER COLUMN workflow_id SET NOT NULL;
ALTER TABLE issue_workflow_supporting_opd ADD CONSTRAINT issue_workflow_supporting_opd_workflow_fkey FOREIGN KEY(workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;
ALTER TABLE issue_workflow_supporting_opd DROP CONSTRAINT issue_workflow_supporting_opd_pkey;
ALTER TABLE issue_workflow_supporting_opd ADD CONSTRAINT issue_workflow_supporting_opd_pkey PRIMARY KEY(workflow_id,opd_id);

ALTER TABLE issue_response_submissions ADD COLUMN IF NOT EXISTS workflow_id BIGINT;
UPDATE issue_response_submissions r SET workflow_id=w.id FROM issue_workflows w WHERE w.issue_id=r.issue_id AND w.cycle_number=1 AND r.workflow_id IS NULL;
ALTER TABLE issue_response_submissions ALTER COLUMN workflow_id SET NOT NULL;
ALTER TABLE issue_response_submissions ADD CONSTRAINT issue_response_submissions_workflow_fkey FOREIGN KEY(workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;
ALTER TABLE issue_response_submissions DROP CONSTRAINT issue_response_submissions_issue_id_opd_id_version_key;
ALTER TABLE issue_response_submissions ADD CONSTRAINT issue_response_submissions_workflow_opd_version_uq UNIQUE(workflow_id,opd_id,version);

ALTER TABLE issue_workflow_events ADD COLUMN IF NOT EXISTS workflow_id BIGINT;
UPDATE issue_workflow_events e SET workflow_id=w.id FROM issue_workflows w WHERE w.issue_id=e.issue_id AND w.cycle_number=1 AND e.workflow_id IS NULL;
ALTER TABLE issue_workflow_events ALTER COLUMN workflow_id SET NOT NULL;
ALTER TABLE issue_workflow_events ADD CONSTRAINT issue_workflow_events_workflow_fkey FOREIGN KEY(workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;
CREATE INDEX idx_issue_workflow_events_workflow ON issue_workflow_events(workflow_id,created_at DESC);

ALTER TABLE issue_workflow_contributors ADD COLUMN IF NOT EXISTS workflow_id BIGINT;
UPDATE issue_workflow_contributors c SET workflow_id=w.id FROM issue_workflows w WHERE w.issue_id=c.issue_id AND w.cycle_number=1 AND c.workflow_id IS NULL;
ALTER TABLE issue_workflow_contributors ALTER COLUMN workflow_id SET NOT NULL;
ALTER TABLE issue_workflow_contributors ADD CONSTRAINT issue_workflow_contributors_workflow_fkey FOREIGN KEY(workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS uq_issue_workflow_contributor_opd;
DROP INDEX IF EXISTS uq_issue_workflow_contributor_uptd;
DROP INDEX IF EXISTS uq_issue_workflow_contributor_district;
CREATE UNIQUE INDEX uq_issue_workflow_contributor_opd ON issue_workflow_contributors(workflow_id,opd_id) WHERE contributor_type='OPD';
CREATE UNIQUE INDEX uq_issue_workflow_contributor_uptd ON issue_workflow_contributors(workflow_id,uptd_id) WHERE contributor_type='UPTD';
CREATE UNIQUE INDEX uq_issue_workflow_contributor_district ON issue_workflow_contributors(workflow_id,district_id) WHERE contributor_type='DISTRICT';

ALTER TABLE issue_publication_evidence ADD COLUMN IF NOT EXISTS workflow_id BIGINT;
UPDATE issue_publication_evidence p SET workflow_id=w.id FROM issue_workflows w WHERE w.issue_id=p.issue_id AND w.cycle_number=1 AND p.workflow_id IS NULL;
ALTER TABLE issue_publication_evidence ALTER COLUMN workflow_id SET NOT NULL;
ALTER TABLE issue_publication_evidence ADD CONSTRAINT issue_publication_evidence_workflow_fkey FOREIGN KEY(workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS uq_issue_publication_primary;
CREATE UNIQUE INDEX uq_issue_publication_primary ON issue_publication_evidence(workflow_id) WHERE is_primary=true;
CREATE INDEX idx_issue_publication_evidence_workflow ON issue_publication_evidence(workflow_id,created_at,id);
CREATE OR REPLACE FUNCTION enforce_issue_publication_evidence_limit() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM issue_publication_evidence WHERE workflow_id=NEW.workflow_id) >= 5 THEN
    RAISE EXCEPTION 'Maximum 5 publication evidence items per workflow';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE issue_publication_analysis_snapshots ADD COLUMN IF NOT EXISTS workflow_id BIGINT;
UPDATE issue_publication_analysis_snapshots p SET workflow_id=w.id FROM issue_workflows w WHERE w.issue_id=p.issue_id AND w.cycle_number=1 AND p.workflow_id IS NULL;
ALTER TABLE issue_publication_analysis_snapshots ALTER COLUMN workflow_id SET NOT NULL;
ALTER TABLE issue_publication_analysis_snapshots ADD CONSTRAINT issue_publication_analysis_snapshots_workflow_fkey FOREIGN KEY(workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;
ALTER TABLE issue_publication_analysis_snapshots DROP CONSTRAINT issue_publication_analysis_snapshots_issue_unique;
ALTER TABLE issue_publication_analysis_snapshots ADD CONSTRAINT issue_publication_analysis_snapshots_workflow_uq UNIQUE(workflow_id);

ALTER TABLE issue_monitoring_analysis_snapshots ADD COLUMN IF NOT EXISTS workflow_id BIGINT;
UPDATE issue_monitoring_analysis_snapshots m SET workflow_id=w.id FROM issue_workflows w WHERE w.issue_id=m.issue_id AND w.cycle_number=1 AND m.workflow_id IS NULL;
ALTER TABLE issue_monitoring_analysis_snapshots ALTER COLUMN workflow_id SET NOT NULL;
ALTER TABLE issue_monitoring_analysis_snapshots ADD CONSTRAINT issue_monitoring_analysis_snapshots_workflow_fkey FOREIGN KEY(workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;
ALTER TABLE issue_monitoring_analysis_snapshots DROP CONSTRAINT issue_monitoring_analysis_snapshots_issue_period_unique;
ALTER TABLE issue_monitoring_analysis_snapshots ADD CONSTRAINT issue_monitoring_analysis_snapshots_workflow_period_uq UNIQUE(workflow_id,period_number);
CREATE INDEX idx_issue_monitoring_analysis_snapshots_workflow ON issue_monitoring_analysis_snapshots(workflow_id,period_number);
