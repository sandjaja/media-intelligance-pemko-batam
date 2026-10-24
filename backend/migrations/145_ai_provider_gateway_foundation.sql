-- AI Provider Gateway foundation
-- Draft only: this migration is NOT applied automatically.
-- Provider credentials remain server-side secrets; this schema stores references/config only.

CREATE TABLE IF NOT EXISTS ai_providers (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  base_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  secret_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_models (
  id BIGSERIAL PRIMARY KEY,
  provider_id BIGINT NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_id, code)
);

CREATE TABLE IF NOT EXISTS ai_tasks (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_task_routes (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE,
  provider_id BIGINT NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  model_id BIGINT NOT NULL REFERENCES ai_models(id) ON DELETE RESTRICT,
  priority INTEGER NOT NULL DEFAULT 1 CHECK (priority > 0),
  enabled BOOLEAN NOT NULL DEFAULT true,
  fallback_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, priority)
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT REFERENCES ai_tasks(id) ON DELETE SET NULL,
  provider_id BIGINT REFERENCES ai_providers(id) ON DELETE SET NULL,
  model_id BIGINT REFERENCES ai_models(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_models_provider_enabled
  ON ai_models(provider_id, enabled);

CREATE INDEX IF NOT EXISTS idx_ai_task_routes_task_priority
  ON ai_task_routes(task_id, priority, enabled);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_task_created
  ON ai_usage_logs(task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created
  ON ai_usage_logs(created_at DESC);
