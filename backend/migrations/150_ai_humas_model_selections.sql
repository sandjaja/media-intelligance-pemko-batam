-- Humas model choices for exactly five tasks. Configuration only: no paid execution enabled.
-- Preview first. A choice is not permission to bypass AI gateway budget checks.
CREATE TABLE IF NOT EXISTS ai_humas_model_selections (
  task_code TEXT PRIMARY KEY REFERENCES ai_tasks(code) ON UPDATE CASCADE,
  model_id BIGINT NOT NULL REFERENCES ai_models(id),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_humas_model_selection_task_guard CHECK (task_code IN (
    'gap_analysis','strakom_analysis','publication_analysis',
    'monitoring_analysis','content_studio_prompting'))
);
