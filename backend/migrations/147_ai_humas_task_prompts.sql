-- Humas AI task prompt configuration. Apply to Preview first; no Production migration here.
-- Exactly five tasks are editable by Humas. Defaults must be imported from the
-- existing source prompts after auditing each call site; never insert placeholders.
CREATE TABLE IF NOT EXISTS ai_humas_task_prompts (
  task_code TEXT PRIMARY KEY REFERENCES ai_tasks(code) ON UPDATE CASCADE,
  prompt_text TEXT NOT NULL CHECK (char_length(trim(prompt_text)) BETWEEN 20 AND 30000),
  default_prompt_text TEXT NOT NULL CHECK (char_length(trim(default_prompt_text)) BETWEEN 20 AND 30000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_humas_prompt_task_guard CHECK (task_code IN (
    'gap_analysis','strakom_analysis','publication_analysis',
    'monitoring_analysis','content_studio_prompting'))
);
CREATE TABLE IF NOT EXISTS ai_humas_task_prompt_history (
  id BIGSERIAL PRIMARY KEY,
  task_code TEXT NOT NULL REFERENCES ai_humas_task_prompts(task_code),
  version INTEGER NOT NULL,
  prompt_text TEXT NOT NULL,
  changed_by TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_code, version)
);
-- Intentionally no INSERT: source prompt migration must preserve exact current behavior.
