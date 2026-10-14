-- Phase 5 workflow bridge: approved response / no-assignment -> strategy -> publication.
-- Legacy-safe: this migration changes no existing workflow rows.
-- Existing APPROVED/PUBLISHED/MONITORING/CLOSED cycles keep their current status.

ALTER TABLE issue_workflows
  DROP CONSTRAINT IF EXISTS issue_workflows_workflow_status_check;

ALTER TABLE issue_workflows
  ADD CONSTRAINT issue_workflows_workflow_status_check
  CHECK (workflow_status IN (
    'NEW','ASSIGNED','IN_PROGRESS','SUBMITTED','REVISION_REQUIRED',
    'APPROVED','STRATEGY','PUBLISHED','MONITORING','CLOSED'
  ));
