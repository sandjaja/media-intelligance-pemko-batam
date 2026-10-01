-- Phase 5 Communication Strategy Engine
-- PROPOSAL ONLY: do not apply without explicit database-change approval.

CREATE TABLE communication_strategies (
  id BIGSERIAL PRIMARY KEY,
  workflow_id BIGINT NOT NULL REFERENCES issue_workflows(id) ON DELETE RESTRICT,
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED')),
  input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  communication_objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_audiences JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  talking_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  channel_strategy JSONB NOT NULL DEFAULT '[]'::jsonb,
  timing_strategy JSONB NOT NULL DEFAULT '{}'::jsonb,
  spokesperson_strategy JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_formats JSONB NOT NULL DEFAULT '[]'::jsonb,
  communication_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  success_kpis JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_note TEXT,
  generated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ,
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workflow_id, version)
);

CREATE UNIQUE INDEX uq_communication_strategies_approved_workflow
  ON communication_strategies(workflow_id)
  WHERE status='APPROVED';

CREATE INDEX idx_communication_strategies_workflow
  ON communication_strategies(workflow_id, version DESC);
