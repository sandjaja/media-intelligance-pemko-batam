-- Draft migration. Apply only after review in Neon Preview.
CREATE TABLE IF NOT EXISTS ai_provider_budgets (
 id BIGSERIAL PRIMARY KEY,
 provider_id BIGINT NOT NULL REFERENCES ai_providers(id),
 period_start DATE NOT NULL,
 period_end DATE NOT NULL,
 limit_usd NUMERIC(16,6) NOT NULL CHECK(limit_usd >= 0),
 enabled BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(period_end > period_start),
 UNIQUE(provider_id,period_start,period_end)
);
CREATE TABLE IF NOT EXISTS ai_budget_reservations (
 id BIGSERIAL PRIMARY KEY,
 budget_id BIGINT NOT NULL REFERENCES ai_provider_budgets(id),
 task_id BIGINT REFERENCES ai_tasks(id),
 request_key TEXT NOT NULL UNIQUE,
 reserved_usd NUMERIC(16,6) NOT NULL CHECK(reserved_usd >= 0),
 settled_usd NUMERIC(16,6) CHECK(settled_usd >= 0),
 status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','settled','released')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_budget_reservations_budget_status
 ON ai_budget_reservations(budget_id,status);
CREATE TABLE IF NOT EXISTS ai_model_prices (
 id BIGSERIAL PRIMARY KEY,
 model_id BIGINT NOT NULL REFERENCES ai_models(id),
 input_usd_per_million NUMERIC(16,6) NOT NULL CHECK(input_usd_per_million >= 0),
 output_usd_per_million NUMERIC(16,6) NOT NULL CHECK(output_usd_per_million >= 0),
 effective_from TIMESTAMPTZ NOT NULL,
 source_url TEXT,
 UNIQUE(model_id,effective_from)
);
