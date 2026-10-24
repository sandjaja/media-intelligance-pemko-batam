-- Fresh-install schema snapshot, 2026-10-17. Structure only; no tenant data or credentials.

-- Never apply this file to an existing database. Owned by install-service.ts.

SET search_path TO public;

CREATE SEQUENCE "ai_budget_reservations_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "ai_gemini_quota_feature_audit_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "ai_humas_task_prompt_history_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "ai_model_prices_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "ai_models_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "ai_provider_balance_snapshots_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "ai_provider_budgets_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "ai_providers_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "ai_task_routes_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "ai_tasks_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "ai_usage_logs_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "alert_events_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "alerts_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "article_alerts_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "article_entities_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "articles_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "audit_logs_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "classification_sectors_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "collection_scheduler_config_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "collection_scheduler_runs_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "communication_strategies_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "communication_strategy_districts_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "content_project_items_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "content_project_sources_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "content_projects_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "daily_intelligence_runs_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "districts_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "evidence_sources_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "government_branding_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "government_officials_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "incident_decisions_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "incident_events_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "incident_tasks_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "incidents_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "ingestion_runs_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "integration_credentials_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "integration_providers_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "integration_settings_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_communication_gap_snapshots_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_contributor_clarification_rounds_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_contributor_submissions_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_keywords_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_linkage_h1_batches_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_linkage_h1_evidence_ledger_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_metrics_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_monitor_terms_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_monitoring_analysis_snapshots_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_monitors_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_publication_analysis_snapshots_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_publication_evidence_files_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_publication_evidence_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_response_submissions_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_workflow_contributors_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_workflow_events_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issue_workflows_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "issues_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "keyword_groups_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "keywords_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "locations_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "media_scans_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "media_sources_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "narratives_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "notification_channels_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "notification_deliveries_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "notification_link_tokens_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "notification_templates_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "online_story_clusters_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "opd_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "organization_area_aliases_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "organization_map_boundaries_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "organization_map_boundary_features_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "organizations_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "owned_content_clusters_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "owned_social_account_metrics_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "owned_social_accounts_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "password_reset_email_tokens_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "password_reset_requests_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "permissions_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "print_article_keywords_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "print_articles_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "print_clippings_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "print_editions_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "print_ocr_results_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "print_pages_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "print_upload_files_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "refresh_tokens_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "roles_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "social_conversation_clusters_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "social_mentions_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "social_post_metrics_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "taxonomy_categories_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "unified_candidate_issues_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "uptd_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "user_notification_channels_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "users_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "viewer_display_devices_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE SEQUENCE "villages_id_seq" AS bigint INCREMENT BY 1 NO MINVALUE NO MAXVALUE START WITH 1;

CREATE TABLE "ai_budget_reservations" (
  "id" bigint DEFAULT nextval('ai_budget_reservations_id_seq'::regclass) NOT NULL,
  "budget_id" bigint NOT NULL,
  "task_id" bigint,
  "request_key" text NOT NULL,
  "reserved_usd" numeric(16,6) NOT NULL,
  "settled_usd" numeric(16,6),
  "status" text DEFAULT 'reserved'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "ai_budget_reservations_id_seq" OWNED BY "ai_budget_reservations"."id";

CREATE TABLE "ai_free_tier_daily_limits" (
  "model_id" bigint NOT NULL,
  "max_requests" integer NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ai_free_tier_daily_usage" (
  "model_id" bigint NOT NULL,
  "usage_date" date NOT NULL,
  "reserved_requests" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ai_gemini_quota_feature_audit" (
  "id" bigint DEFAULT nextval('ai_gemini_quota_feature_audit_id_seq'::regclass) NOT NULL,
  "model_id" bigint NOT NULL,
  "usage_date" date NOT NULL,
  "feature_code" text NOT NULL,
  "reserved_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "ai_gemini_quota_feature_audit_id_seq" OWNED BY "ai_gemini_quota_feature_audit"."id";

CREATE TABLE "ai_humas_model_selections" (
  "task_code" text NOT NULL,
  "model_id" bigint NOT NULL,
  "updated_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ai_humas_task_prompt_history" (
  "id" bigint DEFAULT nextval('ai_humas_task_prompt_history_id_seq'::regclass) NOT NULL,
  "task_code" text NOT NULL,
  "version" integer NOT NULL,
  "prompt_text" text NOT NULL,
  "changed_by" text,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "ai_humas_task_prompt_history_id_seq" OWNED BY "ai_humas_task_prompt_history"."id";

CREATE TABLE "ai_humas_task_prompts" (
  "task_code" text NOT NULL,
  "prompt_text" text NOT NULL,
  "default_prompt_text" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "updated_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ai_model_prices" (
  "id" bigint DEFAULT nextval('ai_model_prices_id_seq'::regclass) NOT NULL,
  "model_id" bigint NOT NULL,
  "input_usd_per_million" numeric(16,6) NOT NULL,
  "output_usd_per_million" numeric(16,6) NOT NULL,
  "effective_from" timestamp with time zone NOT NULL,
  "source_url" text
);

ALTER SEQUENCE "ai_model_prices_id_seq" OWNED BY "ai_model_prices"."id";

CREATE TABLE "ai_models" (
  "id" bigint DEFAULT nextval('ai_models_id_seq'::regclass) NOT NULL,
  "provider_id" bigint NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "ai_models_id_seq" OWNED BY "ai_models"."id";

CREATE TABLE "ai_provider_balance_snapshots" (
  "id" bigint DEFAULT nextval('ai_provider_balance_snapshots_id_seq'::regclass) NOT NULL,
  "provider_id" bigint NOT NULL,
  "balance_usd" numeric(18,8) NOT NULL,
  "committed_baseline_usd" numeric(18,8) NOT NULL,
  "reason" text NOT NULL,
  "recorded_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "ai_provider_balance_snapshots_id_seq" OWNED BY "ai_provider_balance_snapshots"."id";

CREATE TABLE "ai_provider_budgets" (
  "id" bigint DEFAULT nextval('ai_provider_budgets_id_seq'::regclass) NOT NULL,
  "provider_id" bigint NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "limit_usd" numeric(16,6) NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "ai_provider_budgets_id_seq" OWNED BY "ai_provider_budgets"."id";

CREATE TABLE "ai_provider_credentials" (
  "provider_id" bigint NOT NULL,
  "credential_ciphertext" text NOT NULL,
  "credential_hint" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ai_providers" (
  "id" bigint DEFAULT nextval('ai_providers_id_seq'::regclass) NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "base_url" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "secret_reference" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "ai_providers_id_seq" OWNED BY "ai_providers"."id";

CREATE TABLE "ai_task_routes" (
  "id" bigint DEFAULT nextval('ai_task_routes_id_seq'::regclass) NOT NULL,
  "task_id" bigint NOT NULL,
  "provider_id" bigint NOT NULL,
  "model_id" bigint NOT NULL,
  "priority" integer DEFAULT 1 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "fallback_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "ai_task_routes_id_seq" OWNED BY "ai_task_routes"."id";

CREATE TABLE "ai_tasks" (
  "id" bigint DEFAULT nextval('ai_tasks_id_seq'::regclass) NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "ai_tasks_id_seq" OWNED BY "ai_tasks"."id";

CREATE TABLE "ai_usage_logs" (
  "id" bigint DEFAULT nextval('ai_usage_logs_id_seq'::regclass) NOT NULL,
  "task_id" bigint,
  "provider_id" bigint,
  "model_id" bigint,
  "status" text NOT NULL,
  "latency_ms" integer,
  "input_tokens" integer,
  "output_tokens" integer,
  "error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" bigint
);

ALTER SEQUENCE "ai_usage_logs_id_seq" OWNED BY "ai_usage_logs"."id";

CREATE TABLE "alert_events" (
  "id" bigint DEFAULT nextval('alert_events_id_seq'::regclass) NOT NULL,
  "alert_id" bigint NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb,
  "created_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "alert_events_id_seq" OWNED BY "alert_events"."id";

CREATE TABLE "alert_print_articles" (
  "alert_id" bigint NOT NULL,
  "print_article_id" bigint NOT NULL,
  "evidence_role" text DEFAULT 'supporting'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "alerts" (
  "id" bigint DEFAULT nextval('alerts_id_seq'::regclass) NOT NULL,
  "issue_id" bigint,
  "article_id" bigint,
  "opd_id" bigint,
  "alert_type" text NOT NULL,
  "severity" text NOT NULL,
  "title" text NOT NULL,
  "reason" text,
  "status" text DEFAULT 'open'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "acknowledged_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "social_mention_id" bigint
);

ALTER SEQUENCE "alerts_id_seq" OWNED BY "alerts"."id";

CREATE TABLE "apify_usage_ledger" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "reservation_key" text NOT NULL,
  "actor_id" text NOT NULL,
  "run_id" text,
  "platform" text NOT NULL,
  "status" text DEFAULT 'RESERVED'::text NOT NULL,
  "reserved_usd" numeric(14,6) NOT NULL,
  "actual_usd" numeric(14,6),
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "article_alerts" (
  "id" bigint DEFAULT nextval('article_alerts_id_seq'::regclass) NOT NULL,
  "article_id" bigint NOT NULL,
  "alert_type" text NOT NULL,
  "severity" text NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "acknowledged_at" timestamp with time zone
);

ALTER SEQUENCE "article_alerts_id_seq" OWNED BY "article_alerts"."id";

CREATE TABLE "article_entities" (
  "id" bigint DEFAULT nextval('article_entities_id_seq'::regclass) NOT NULL,
  "article_id" bigint NOT NULL,
  "entity_type" text NOT NULL,
  "entity_name" text NOT NULL
);

ALTER SEQUENCE "article_entities_id_seq" OWNED BY "article_entities"."id";

CREATE TABLE "article_manual_keywords" (
  "article_id" bigint NOT NULL,
  "keyword_id" bigint NOT NULL,
  "selected_by" bigint,
  "reason" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "keyword_role" text
);

CREATE TABLE "article_opd" (
  "article_id" bigint NOT NULL,
  "opd_id" bigint NOT NULL,
  "routing_role" text NOT NULL,
  "relevance_score" numeric DEFAULT 0 NOT NULL,
  "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "assignment_source" text DEFAULT 'AUTO'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "article_uptd" (
  "article_id" bigint NOT NULL,
  "uptd_id" bigint NOT NULL,
  "relevance_score" numeric(8,2) DEFAULT 0 NOT NULL,
  "evidence" text[] DEFAULT ARRAY[]::text[] NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "articles" (
  "id" bigint DEFAULT nextval('articles_id_seq'::regclass) NOT NULL,
  "source_id" bigint,
  "opd_id" bigint,
  "title" text NOT NULL,
  "url" text,
  "published_at" timestamp with time zone,
  "author" text,
  "content" text,
  "summary" text,
  "sentiment" text,
  "importance_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "impact_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "velocity_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "risk_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "risk_level" text DEFAULT 'low'::text NOT NULL,
  "is_highlight" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "district_id" bigint,
  "classified_at" timestamp with time zone,
  "classification_version" text,
  "news_classification" text,
  "news_classification_source" text DEFAULT 'AUTO'::text NOT NULL,
  "news_classification_changed_by" bigint,
  "news_classification_changed_at" timestamp with time zone,
  "story_cluster_manual_excluded" boolean DEFAULT false NOT NULL
);

ALTER SEQUENCE "articles_id_seq" OWNED BY "articles"."id";

CREATE TABLE "audit_logs" (
  "id" bigint DEFAULT nextval('audit_logs_id_seq'::regclass) NOT NULL,
  "user_id" bigint,
  "action" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "audit_logs_id_seq" OWNED BY "audit_logs"."id";

CREATE TABLE "classification_sectors" (
  "id" bigint DEFAULT nextval('classification_sectors_id_seq'::regclass) NOT NULL,
  "organization_id" bigint NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "classification_sectors_id_seq" OWNED BY "classification_sectors"."id";

CREATE TABLE "collection_scheduler_config" (
  "id" bigint DEFAULT nextval('collection_scheduler_config_id_seq'::regclass) NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "timezone" character varying(64) DEFAULT 'Asia/Jakarta'::character varying NOT NULL,
  "run_time" time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
  "online_enabled" boolean DEFAULT false NOT NULL,
  "owned_enabled" boolean DEFAULT false NOT NULL,
  "social_enabled" boolean DEFAULT false NOT NULL,
  "last_run_at" timestamp with time zone,
  "next_run_at" timestamp with time zone,
  "updated_by" bigint,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "social_platforms" text[] DEFAULT ARRAY['youtube'::text, 'instagram'::text, 'tiktok'::text] NOT NULL
);

ALTER SEQUENCE "collection_scheduler_config_id_seq" OWNED BY "collection_scheduler_config"."id";

CREATE TABLE "collection_scheduler_runs" (
  "id" bigint DEFAULT nextval('collection_scheduler_runs_id_seq'::regclass) NOT NULL,
  "trigger_type" character varying(16) NOT NULL,
  "status" character varying(16) NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "requested_by" bigint,
  "sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "collection_scheduler_runs_id_seq" OWNED BY "collection_scheduler_runs"."id";

CREATE TABLE "communication_strategies" (
  "id" bigint DEFAULT nextval('communication_strategies_id_seq'::regclass) NOT NULL,
  "workflow_id" bigint NOT NULL,
  "issue_id" bigint NOT NULL,
  "version" integer NOT NULL,
  "status" character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
  "is_current" boolean DEFAULT false NOT NULL,
  "executive_summary" text,
  "input_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "communication_objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "target_audiences" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "key_messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "talking_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "channel_strategy" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "timing_strategy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "spokesperson_strategy" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "content_formats" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "communication_risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "success_kpis" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "review_note" text,
  "generated_by" bigint,
  "generated_at" timestamp with time zone,
  "reviewed_by" bigint,
  "reviewed_at" timestamp with time zone,
  "approved_by" bigint,
  "approved_at" timestamp with time zone,
  "created_by" bigint,
  "updated_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "coordination_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expected_communication_outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL
);

ALTER SEQUENCE "communication_strategies_id_seq" OWNED BY "communication_strategies"."id";

CREATE TABLE "communication_strategy_districts" (
  "id" bigint DEFAULT nextval('communication_strategy_districts_id_seq'::regclass) NOT NULL,
  "strategy_id" bigint NOT NULL,
  "workflow_id" bigint NOT NULL,
  "district_id" bigint NOT NULL,
  "evidence_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "local_audiences" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "communication_focus" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "local_messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "talking_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "local_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "coordination_opds" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "timing_strategy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "success_kpis" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "field_update_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "communication_strategy_districts_id_seq" OWNED BY "communication_strategy_districts"."id";

CREATE TABLE "content_project_items" (
  "id" bigint DEFAULT nextval('content_project_items_id_seq'::regclass) NOT NULL,
  "project_id" bigint NOT NULL,
  "title" character varying(200) NOT NULL,
  "format" character varying(50) NOT NULL,
  "audience" character varying(50) NOT NULL,
  "purpose" character varying(50) NOT NULL,
  "tone" character varying(50) NOT NULL,
  "channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
  "prompt_snapshot" jsonb,
  "created_by" bigint,
  "updated_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reference_asset_indexes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "official_asset_keys" jsonb DEFAULT '[]'::jsonb NOT NULL
);

ALTER SEQUENCE "content_project_items_id_seq" OWNED BY "content_project_items"."id";

CREATE TABLE "content_project_sources" (
  "id" bigint DEFAULT nextval('content_project_sources_id_seq'::regclass) NOT NULL,
  "project_id" bigint NOT NULL,
  "item_id" bigint,
  "category" character varying(40) NOT NULL,
  "source_url" text NOT NULL,
  "source_title" text,
  "extracted_facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confirmed_facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
  "confirmed_by" bigint,
  "confirmed_at" timestamp with time zone,
  "created_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "content_project_sources_id_seq" OWNED BY "content_project_sources"."id";

CREATE TABLE "content_projects" (
  "id" bigint DEFAULT nextval('content_projects_id_seq'::regclass) NOT NULL,
  "workflow_id" bigint NOT NULL,
  "issue_id" bigint NOT NULL,
  "strategy_id" bigint NOT NULL,
  "status" character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
  "context_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "production_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" bigint,
  "updated_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "parameters_locked_at" timestamp with time zone,
  "production_notes" text,
  "official_assets" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "reference_assets" jsonb DEFAULT '[]'::jsonb NOT NULL
);

ALTER SEQUENCE "content_projects_id_seq" OWNED BY "content_projects"."id";

CREATE TABLE "daily_intelligence_runs" (
  "id" bigint DEFAULT nextval('daily_intelligence_runs_id_seq'::regclass) NOT NULL,
  "run_date" date NOT NULL,
  "opd_id" bigint,
  "status" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "daily_intelligence_runs_id_seq" OWNED BY "daily_intelligence_runs"."id";

CREATE TABLE "districts" (
  "id" bigint DEFAULT nextval('districts_id_seq'::regclass) NOT NULL,
  "organization_id" bigint NOT NULL,
  "name" text NOT NULL,
  "code" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "districts_id_seq" OWNED BY "districts"."id";

CREATE TABLE "evidence_sources" (
  "id" bigint DEFAULT nextval('evidence_sources_id_seq'::regclass) NOT NULL,
  "article_id" bigint,
  "media_scan_id" bigint,
  "source_type" text NOT NULL,
  "source_url" text,
  "source_label" text,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "content_hash" text,
  "metadata" jsonb,
  "print_article_id" bigint,
  "social_mention_id" bigint
);

ALTER SEQUENCE "evidence_sources_id_seq" OWNED BY "evidence_sources"."id";

CREATE TABLE "executive_brief_daily_cache" (
  "brief_date" date NOT NULL,
  "scope_key" text DEFAULT 'city'::text NOT NULL,
  "status" text NOT NULL,
  "brief_json" jsonb,
  "model_code" text,
  "source_count" integer DEFAULT 0 NOT NULL,
  "generated_at" timestamp with time zone,
  "locked_until" timestamp with time zone,
  "error_code" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "executive_brief_schedule_settings" (
  "id" integer DEFAULT 1 NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "hour_wib" smallint DEFAULT 6 NOT NULL,
  "minute_wib" smallint DEFAULT 30 NOT NULL,
  "timezone" text DEFAULT 'Asia/Jakarta'::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "government_branding" (
  "id" bigint DEFAULT nextval('government_branding_id_seq'::regclass) NOT NULL,
  "government_name" character varying(160) NOT NULL,
  "short_name" character varying(80),
  "city_name" character varying(100),
  "logo_url" text,
  "tagline" character varying(255),
  "is_active" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" bigint,
  "login_background_url" text,
  "aliases" text[] DEFAULT ARRAY[]::text[] NOT NULL
);

ALTER SEQUENCE "government_branding_id_seq" OWNED BY "government_branding"."id";

CREATE TABLE "government_officials" (
  "id" bigint DEFAULT nextval('government_officials_id_seq'::regclass) NOT NULL,
  "role_code" character varying(30) NOT NULL,
  "name" character varying(200) NOT NULL,
  "position" character varying(200) NOT NULL,
  "photo_url" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "updated_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "government_officials_id_seq" OWNED BY "government_officials"."id";

CREATE TABLE "incident_decisions" (
  "id" bigint DEFAULT nextval('incident_decisions_id_seq'::regclass) NOT NULL,
  "incident_id" bigint NOT NULL,
  "decision" text NOT NULL,
  "created_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "incident_decisions_id_seq" OWNED BY "incident_decisions"."id";

CREATE TABLE "incident_events" (
  "id" bigint DEFAULT nextval('incident_events_id_seq'::regclass) NOT NULL,
  "incident_id" bigint NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb,
  "created_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "incident_events_id_seq" OWNED BY "incident_events"."id";

CREATE TABLE "incident_tasks" (
  "id" bigint DEFAULT nextval('incident_tasks_id_seq'::regclass) NOT NULL,
  "incident_id" bigint NOT NULL,
  "task_key" text NOT NULL,
  "label" text NOT NULL,
  "status" text DEFAULT 'OPEN'::text NOT NULL,
  "completed_by" bigint,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "incident_tasks_id_seq" OWNED BY "incident_tasks"."id";

CREATE TABLE "incidents" (
  "id" bigint DEFAULT nextval('incidents_id_seq'::regclass) NOT NULL,
  "incident_key" text NOT NULL,
  "opd_id" bigint,
  "signal_article_id" bigint,
  "severity" text NOT NULL,
  "status" text DEFAULT 'MONITORING'::text NOT NULL,
  "command_owner_id" bigint,
  "decision_required" text DEFAULT ''::text NOT NULL,
  "approval" text DEFAULT 'DRAFT'::text NOT NULL,
  "first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "created_by" bigint,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "incidents_id_seq" OWNED BY "incidents"."id";

CREATE TABLE "ingestion_runs" (
  "id" bigint DEFAULT nextval('ingestion_runs_id_seq'::regclass) NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone,
  "status" text DEFAULT 'running'::text NOT NULL,
  "source_count" integer DEFAULT 0 NOT NULL,
  "successful_sources" integer DEFAULT 0 NOT NULL,
  "failed_sources" integer DEFAULT 0 NOT NULL,
  "fetched_count" integer DEFAULT 0 NOT NULL,
  "inserted_count" integer DEFAULT 0 NOT NULL,
  "details" jsonb,
  "error_message" text
);

ALTER SEQUENCE "ingestion_runs_id_seq" OWNED BY "ingestion_runs"."id";

CREATE TABLE "integration_credentials" (
  "id" bigint DEFAULT nextval('integration_credentials_id_seq'::regclass) NOT NULL,
  "organization_id" bigint NOT NULL,
  "provider_id" bigint NOT NULL,
  "credential_ciphertext" text NOT NULL,
  "credential_hint" text,
  "enabled" boolean DEFAULT false NOT NULL,
  "expires_at" timestamp with time zone,
  "last_test_at" timestamp with time zone,
  "last_status" text,
  "last_error" text,
  "created_by" bigint,
  "updated_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "app_id" text,
  "app_secret_ciphertext" text,
  "app_secret_hint" text
);

ALTER SEQUENCE "integration_credentials_id_seq" OWNED BY "integration_credentials"."id";

CREATE TABLE "integration_providers" (
  "id" bigint DEFAULT nextval('integration_providers_id_seq'::regclass) NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "auth_type" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "integration_providers_id_seq" OWNED BY "integration_providers"."id";

CREATE TABLE "integration_settings" (
  "id" bigint DEFAULT nextval('integration_settings_id_seq'::regclass) NOT NULL,
  "organization_id" bigint NOT NULL,
  "provider_id" bigint NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" bigint,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "integration_settings_id_seq" OWNED BY "integration_settings"."id";

CREATE TABLE "issue_articles" (
  "issue_id" bigint NOT NULL,
  "article_id" bigint NOT NULL,
  "relevance_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "assignment_source" character varying(16) DEFAULT 'AUTO'::character varying NOT NULL
);

CREATE TABLE "issue_communication_gap_snapshots" (
  "issue_id" bigint NOT NULL,
  "organization_id" bigint NOT NULL,
  "signature" text NOT NULL,
  "result" jsonb NOT NULL,
  "analyzed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "analyzed_by" bigint,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "id" bigint DEFAULT nextval('issue_communication_gap_snapshots_id_seq'::regclass) NOT NULL,
  "workflow_id" bigint NOT NULL
);

ALTER SEQUENCE "issue_communication_gap_snapshots_id_seq" OWNED BY "issue_communication_gap_snapshots"."id";

CREATE TABLE "issue_contributor_clarification_rounds" (
  "id" bigint DEFAULT nextval('issue_contributor_clarification_rounds_id_seq'::regclass) NOT NULL,
  "contributor_assignment_id" bigint NOT NULL,
  "round_number" integer NOT NULL,
  "request_text" text NOT NULL,
  "requested_by" bigint,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "submission_id" bigint,
  "reviewed_by" bigint,
  "review_status" text DEFAULT 'REQUESTED'::text NOT NULL,
  "review_note" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "issue_contributor_clarification_rounds_id_seq" OWNED BY "issue_contributor_clarification_rounds"."id";

CREATE TABLE "issue_contributor_submissions" (
  "id" bigint DEFAULT nextval('issue_contributor_submissions_id_seq'::regclass) NOT NULL,
  "contributor_assignment_id" bigint NOT NULL,
  "submitted_by" bigint,
  "field_condition" text,
  "facts_data" text,
  "action_taken" text,
  "notes" text,
  "supporting_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "issue_contributor_submissions_id_seq" OWNED BY "issue_contributor_submissions"."id";

CREATE TABLE "issue_districts" (
  "issue_id" bigint NOT NULL,
  "district_id" bigint NOT NULL,
  "source" text DEFAULT 'MANUAL'::text NOT NULL,
  "created_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "issue_keywords" (
  "id" bigint DEFAULT nextval('issue_keywords_id_seq'::regclass) NOT NULL,
  "issue_id" bigint NOT NULL,
  "keyword_id" bigint NOT NULL,
  "keyword_role" character varying(20) NOT NULL,
  "created_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "issue_keywords_id_seq" OWNED BY "issue_keywords"."id";

CREATE TABLE "issue_linkage_h1_batches" (
  "id" bigint DEFAULT nextval('issue_linkage_h1_batches_id_seq'::regclass) NOT NULL,
  "organization_id" bigint NOT NULL,
  "news_date" date NOT NULL,
  "fingerprint" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "evidence_count" integer DEFAULT 0 NOT NULL,
  "request_count" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "lease_expires_at" timestamp with time zone,
  "error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "issue_linkage_h1_batches_id_seq" OWNED BY "issue_linkage_h1_batches"."id";

CREATE TABLE "issue_linkage_h1_evidence_ledger" (
  "id" bigint DEFAULT nextval('issue_linkage_h1_evidence_ledger_id_seq'::regclass) NOT NULL,
  "organization_id" bigint NOT NULL,
  "news_date" date NOT NULL,
  "source_type" text NOT NULL,
  "source_id" bigint NOT NULL,
  "batch_id" bigint NOT NULL,
  "status" text DEFAULT 'reserved'::text NOT NULL,
  "reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

ALTER SEQUENCE "issue_linkage_h1_evidence_ledger_id_seq" OWNED BY "issue_linkage_h1_evidence_ledger"."id";

CREATE TABLE "issue_metrics" (
  "id" bigint DEFAULT nextval('issue_metrics_id_seq'::regclass) NOT NULL,
  "issue_id" bigint NOT NULL,
  "measured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "volume" integer DEFAULT 0 NOT NULL,
  "velocity_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "sentiment_score" numeric(6,3),
  "media_influence_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "social_influence_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "risk_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "opportunity_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "media_volume" integer DEFAULT 0 NOT NULL,
  "social_volume" integer DEFAULT 0 NOT NULL,
  "positive_count" integer DEFAULT 0 NOT NULL,
  "neutral_count" integer DEFAULT 0 NOT NULL,
  "negative_count" integer DEFAULT 0 NOT NULL,
  "influence_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "metadata" jsonb
);

ALTER SEQUENCE "issue_metrics_id_seq" OWNED BY "issue_metrics"."id";

CREATE TABLE "issue_monitor_sources" (
  "monitor_id" bigint NOT NULL,
  "source_type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "issue_monitor_terms" (
  "id" bigint DEFAULT nextval('issue_monitor_terms_id_seq'::regclass) NOT NULL,
  "monitor_id" bigint NOT NULL,
  "term" text NOT NULL,
  "match_type" text DEFAULT 'DIRECT'::text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "issue_monitor_terms_id_seq" OWNED BY "issue_monitor_terms"."id";

CREATE TABLE "issue_monitoring_analysis_snapshots" (
  "id" bigint DEFAULT nextval('issue_monitoring_analysis_snapshots_id_seq'::regclass) NOT NULL,
  "issue_id" bigint NOT NULL,
  "period_number" integer NOT NULL,
  "result" jsonb NOT NULL,
  "evidence_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "period_started_at" timestamp with time zone NOT NULL,
  "period_ended_at" timestamp with time zone NOT NULL,
  "analyzed_by" bigint,
  "analyzed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "workflow_id" bigint NOT NULL
);

ALTER SEQUENCE "issue_monitoring_analysis_snapshots_id_seq" OWNED BY "issue_monitoring_analysis_snapshots"."id";

CREATE TABLE "issue_monitors" (
  "id" bigint DEFAULT nextval('issue_monitors_id_seq'::regclass) NOT NULL,
  "organization_id" bigint NOT NULL,
  "issue_id" bigint NOT NULL,
  "name" text NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'scheduled'::text NOT NULL,
  "created_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "issue_monitors_id_seq" OWNED BY "issue_monitors"."id";

CREATE TABLE "issue_opd" (
  "issue_id" bigint NOT NULL,
  "opd_id" bigint NOT NULL,
  "responsibility" text DEFAULT 'supporting'::text NOT NULL
);

CREATE TABLE "issue_print_articles" (
  "issue_id" bigint NOT NULL,
  "print_article_id" bigint NOT NULL,
  "relevance_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "linkage_status" text DEFAULT 'candidate'::text NOT NULL,
  "decided_by" bigint,
  "decided_at" timestamp with time zone,
  "evidence" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "issue_publication_analysis_snapshots" (
  "id" bigint DEFAULT nextval('issue_publication_analysis_snapshots_id_seq'::regclass) NOT NULL,
  "issue_id" bigint NOT NULL,
  "result" jsonb NOT NULL,
  "source" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "gap_analyzed_at" timestamp with time zone,
  "analyzed_by" bigint,
  "analyzed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "workflow_id" bigint NOT NULL
);

ALTER SEQUENCE "issue_publication_analysis_snapshots_id_seq" OWNED BY "issue_publication_analysis_snapshots"."id";

CREATE TABLE "issue_publication_evidence" (
  "id" bigint DEFAULT nextval('issue_publication_evidence_id_seq'::regclass) NOT NULL,
  "issue_id" bigint NOT NULL,
  "evidence_type" text NOT NULL,
  "channel" text,
  "url" text,
  "storage_key" text,
  "file_name" text,
  "mime_type" text,
  "caption" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "workflow_id" bigint NOT NULL
);

ALTER SEQUENCE "issue_publication_evidence_id_seq" OWNED BY "issue_publication_evidence"."id";

CREATE TABLE "issue_publication_evidence_files" (
  "id" bigint DEFAULT nextval('issue_publication_evidence_files_id_seq'::regclass) NOT NULL,
  "evidence_id" bigint NOT NULL,
  "storage_key" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_order" smallint DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "issue_publication_evidence_files_id_seq" OWNED BY "issue_publication_evidence_files"."id";

CREATE TABLE "issue_response_submissions" (
  "id" bigint DEFAULT nextval('issue_response_submissions_id_seq'::regclass) NOT NULL,
  "issue_id" bigint NOT NULL,
  "opd_id" bigint NOT NULL,
  "submitted_by" bigint NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "response_text" text NOT NULL,
  "facts_data" text,
  "key_message" text,
  "supporting_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'DRAFT'::text NOT NULL,
  "review_reason" text,
  "reviewed_by" bigint,
  "reviewed_at" timestamp with time zone,
  "submitted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "workflow_id" bigint NOT NULL
);

ALTER SEQUENCE "issue_response_submissions_id_seq" OWNED BY "issue_response_submissions"."id";

CREATE TABLE "issue_workflow_contributors" (
  "id" bigint DEFAULT nextval('issue_workflow_contributors_id_seq'::regclass) NOT NULL,
  "issue_id" bigint NOT NULL,
  "contributor_type" text NOT NULL,
  "uptd_id" bigint,
  "district_id" bigint,
  "contribution_role" text NOT NULL,
  "status" text DEFAULT 'NOMINATED'::text NOT NULL,
  "assigned_by" bigint,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "submitted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "opd_id" bigint,
  "workflow_id" bigint NOT NULL
);

ALTER SEQUENCE "issue_workflow_contributors_id_seq" OWNED BY "issue_workflow_contributors"."id";

CREATE TABLE "issue_workflow_events" (
  "id" bigint DEFAULT nextval('issue_workflow_events_id_seq'::regclass) NOT NULL,
  "issue_id" bigint NOT NULL,
  "actor_user_id" bigint,
  "actor_role" text,
  "event_type" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "note" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "workflow_id" bigint NOT NULL
);

ALTER SEQUENCE "issue_workflow_events_id_seq" OWNED BY "issue_workflow_events"."id";

CREATE TABLE "issue_workflow_supporting_opd" (
  "issue_id" bigint NOT NULL,
  "opd_id" bigint NOT NULL,
  "assigned_by" bigint,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "workflow_id" bigint NOT NULL
);

CREATE TABLE "issue_workflows" (
  "issue_id" bigint NOT NULL,
  "workflow_status" text DEFAULT 'NEW'::text NOT NULL,
  "lead_opd_id" bigint,
  "assigned_by" bigint,
  "assigned_at" timestamp with time zone,
  "due_at" timestamp with time zone,
  "approved_by" bigint,
  "approved_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "updated_by" bigint,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "publication_evidence_saved_at" timestamp with time zone,
  "publication_evidence_saved_by" bigint,
  "id" bigint DEFAULT nextval('issue_workflows_id_seq'::regclass) NOT NULL,
  "cycle_number" integer NOT NULL
);

ALTER SEQUENCE "issue_workflows_id_seq" OWNED BY "issue_workflows"."id";

CREATE TABLE "issues" (
  "id" bigint DEFAULT nextval('issues_id_seq'::regclass) NOT NULL,
  "organization_id" bigint NOT NULL,
  "issue_key" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "risk_level" text,
  "momentum" text,
  "first_seen_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "taxonomy_category_id" bigint,
  "geographic_scope" text DEFAULT 'UNSPECIFIED'::text NOT NULL,
  "issue_brief" text
);

ALTER SEQUENCE "issues_id_seq" OWNED BY "issues"."id";

CREATE TABLE "keyword_district" (
  "keyword_id" bigint NOT NULL,
  "district_id" bigint NOT NULL,
  "weight" numeric(4,2) DEFAULT 1.00 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "keyword_groups" (
  "id" bigint DEFAULT nextval('keyword_groups_id_seq'::regclass) NOT NULL,
  "organization_id" bigint NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "keyword_groups_id_seq" OWNED BY "keyword_groups"."id";

CREATE TABLE "keyword_opd" (
  "keyword_id" bigint NOT NULL,
  "opd_id" bigint NOT NULL,
  "weight" numeric(4,2) DEFAULT 1.00 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "routing_role" text DEFAULT 'SUPPORTING'::text NOT NULL
);

CREATE TABLE "keyword_taxonomy" (
  "keyword_id" bigint NOT NULL,
  "category_id" bigint NOT NULL,
  "weight" numeric(5,2) DEFAULT 1.00 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "keywords" (
  "id" bigint DEFAULT nextval('keywords_id_seq'::regclass) NOT NULL,
  "opd_id" bigint,
  "keyword" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "group_id" bigint,
  "match_type" text DEFAULT 'contains'::text NOT NULL,
  "priority" smallint DEFAULT 2 NOT NULL,
  "district_id" bigint,
  "organization_id" bigint,
  "normalized_keyword" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "evidence_strength" text DEFAULT 'REVIEW'::text NOT NULL
);

ALTER SEQUENCE "keywords_id_seq" OWNED BY "keywords"."id";

CREATE TABLE "locations" (
  "id" bigint DEFAULT nextval('locations_id_seq'::regclass) NOT NULL,
  "village_id" bigint,
  "district_id" bigint,
  "name" text NOT NULL,
  "latitude" numeric(10,7),
  "longitude" numeric(10,7),
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "locations_id_seq" OWNED BY "locations"."id";

CREATE TABLE "media_scans" (
  "id" bigint DEFAULT nextval('media_scans_id_seq'::regclass) NOT NULL,
  "source_id" bigint,
  "opd_id" bigint,
  "file_name" text NOT NULL,
  "storage_key" text,
  "ocr_text" text,
  "analysis" jsonb,
  "status" text DEFAULT 'queued'::text NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);

ALTER SEQUENCE "media_scans_id_seq" OWNED BY "media_scans"."id";

CREATE TABLE "media_sources" (
  "id" bigint DEFAULT nextval('media_sources_id_seq'::regclass) NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "tier" smallint DEFAULT 2 NOT NULL,
  "url" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_checked_at" timestamp with time zone,
  "last_success_at" timestamp with time zone,
  "last_error" text,
  "last_fetched_count" integer DEFAULT 0 NOT NULL,
  "last_inserted_count" integer DEFAULT 0 NOT NULL
);

ALTER SEQUENCE "media_sources_id_seq" OWNED BY "media_sources"."id";

CREATE TABLE "narratives" (
  "id" bigint DEFAULT nextval('narratives_id_seq'::regclass) NOT NULL,
  "issue_id" bigint NOT NULL,
  "narrative_type" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "confidence" text,
  "first_seen_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "narratives_id_seq" OWNED BY "narratives"."id";

CREATE TABLE "notification_channels" (
  "id" bigint DEFAULT nextval('notification_channels_id_seq'::regclass) NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'INACTIVE'::text NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "credential_ciphertext" text,
  "credential_hint" text,
  "last_test_at" timestamp with time zone,
  "last_test_status" text,
  "last_error" text,
  "updated_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "notification_channels_id_seq" OWNED BY "notification_channels"."id";

CREATE TABLE "notification_deliveries" (
  "id" bigint DEFAULT nextval('notification_deliveries_id_seq'::regclass) NOT NULL,
  "workflow_event_id" bigint,
  "event_type" text NOT NULL,
  "user_id" bigint NOT NULL,
  "channel" text NOT NULL,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "title_snapshot" text,
  "message_snapshot" text NOT NULL,
  "destination_hint" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone,
  "last_attempt_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "alert_id" bigint
);

ALTER SEQUENCE "notification_deliveries_id_seq" OWNED BY "notification_deliveries"."id";

CREATE TABLE "notification_link_tokens" (
  "id" bigint DEFAULT nextval('notification_link_tokens_id_seq'::regclass) NOT NULL,
  "user_id" bigint NOT NULL,
  "channel" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "notification_link_tokens_id_seq" OWNED BY "notification_link_tokens"."id";

CREATE TABLE "notification_templates" (
  "id" bigint DEFAULT nextval('notification_templates_id_seq'::regclass) NOT NULL,
  "event_type" text NOT NULL,
  "title_template" text NOT NULL,
  "body_template" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "channel_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "notification_templates_id_seq" OWNED BY "notification_templates"."id";

CREATE TABLE "online_story_cluster_members" (
  "cluster_id" bigint NOT NULL,
  "article_id" bigint NOT NULL,
  "similarity_score" numeric DEFAULT 1 NOT NULL,
  "similarity_type" text DEFAULT 'representative'::text NOT NULL,
  "matched_by" text DEFAULT 'rule-v1'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "assignment_mode" text DEFAULT 'AUTO'::text NOT NULL
);

CREATE TABLE "online_story_clusters" (
  "id" bigint DEFAULT nextval('online_story_clusters_id_seq'::regclass) NOT NULL,
  "canonical_title" text NOT NULL,
  "representative_article_id" bigint,
  "member_count" integer DEFAULT 1 NOT NULL,
  "source_count" integer DEFAULT 1 NOT NULL,
  "first_published_at" timestamp with time zone,
  "last_published_at" timestamp with time zone,
  "engine_version" text DEFAULT 'online-story-rule-v1'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "origin_mode" text DEFAULT 'SYSTEM'::text NOT NULL,
  "status" text DEFAULT 'ACTIVE'::text NOT NULL
);

ALTER SEQUENCE "online_story_clusters_id_seq" OWNED BY "online_story_clusters"."id";

CREATE TABLE "opd" (
  "id" bigint DEFAULT nextval('opd_id_seq'::regclass) NOT NULL,
  "name" text NOT NULL,
  "code" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" bigint,
  "opd_group" text DEFAULT 'LAINNYA'::text NOT NULL
);

ALTER SEQUENCE "opd_id_seq" OWNED BY "opd"."id";

CREATE TABLE "organization_area_aliases" (
  "id" bigint DEFAULT nextval('organization_area_aliases_id_seq'::regclass) NOT NULL,
  "organization_id" bigint NOT NULL,
  "name" character varying(180) NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "organization_area_aliases_id_seq" OWNED BY "organization_area_aliases"."id";

CREATE TABLE "organization_map_boundaries" (
  "id" bigint DEFAULT nextval('organization_map_boundaries_id_seq'::regclass) NOT NULL,
  "organization_id" bigint NOT NULL,
  "name" text NOT NULL,
  "source_name" text,
  "source_year" integer,
  "source_reference" text,
  "original_storage_key" text NOT NULL,
  "optimized_storage_key" text NOT NULL,
  "original_size_bytes" bigint,
  "optimized_size_bytes" bigint,
  "feature_count" integer NOT NULL,
  "status" text DEFAULT 'DRAFT'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "activated_at" timestamp with time zone
);

ALTER SEQUENCE "organization_map_boundaries_id_seq" OWNED BY "organization_map_boundaries"."id";

CREATE TABLE "organization_map_boundary_features" (
  "id" bigint DEFAULT nextval('organization_map_boundary_features_id_seq'::regclass) NOT NULL,
  "boundary_id" bigint NOT NULL,
  "feature_key" text NOT NULL,
  "feature_name" text NOT NULL,
  "official_code" text,
  "district_id" bigint,
  "match_method" text DEFAULT 'UNMATCHED'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "organization_map_boundary_features_id_seq" OWNED BY "organization_map_boundary_features"."id";

CREATE TABLE "organizations" (
  "id" bigint DEFAULT nextval('organizations_id_seq'::regclass) NOT NULL,
  "name" text NOT NULL,
  "code" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "organizations_id_seq" OWNED BY "organizations"."id";

CREATE TABLE "owned_content_cluster_members" (
  "cluster_id" bigint NOT NULL,
  "mention_id" bigint NOT NULL,
  "similarity_score" numeric(5,4) DEFAULT 1 NOT NULL,
  "similarity_type" text DEFAULT 'unique'::text NOT NULL,
  "matched_by" text DEFAULT 'rule-v1'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "review_status" text,
  "reviewed_by" bigint,
  "reviewed_at" timestamp with time zone,
  "review_reason" text
);

CREATE TABLE "owned_content_clusters" (
  "id" bigint DEFAULT nextval('owned_content_clusters_id_seq'::regclass) NOT NULL,
  "canonical_title" text,
  "representative_mention_id" bigint,
  "member_count" integer DEFAULT 0 NOT NULL,
  "channel_count" integer DEFAULT 0 NOT NULL,
  "first_published_at" timestamp with time zone,
  "last_published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "owned_content_clusters_id_seq" OWNED BY "owned_content_clusters"."id";

CREATE TABLE "owned_social_account_metrics" (
  "id" bigint DEFAULT nextval('owned_social_account_metrics_id_seq'::regclass) NOT NULL,
  "account_id" bigint NOT NULL,
  "measured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "followers" bigint,
  "following" bigint,
  "subscribers" bigint,
  "total_posts" bigint,
  "reach" bigint,
  "impressions" bigint,
  "profile_views" bigint,
  "video_views" bigint,
  "likes" bigint,
  "comments" bigint,
  "shares" bigint,
  "saves" bigint,
  "clicks" bigint,
  "engagement_count" bigint,
  "engagement_rate" numeric(8,4),
  "data_scope" text DEFAULT 'snapshot'::text NOT NULL,
  "source" text,
  "raw_payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "owned_social_account_metrics_id_seq" OWNED BY "owned_social_account_metrics"."id";

CREATE TABLE "owned_social_accounts" (
  "id" bigint DEFAULT nextval('owned_social_accounts_id_seq'::regclass) NOT NULL,
  "opd_id" bigint,
  "platform" text NOT NULL,
  "account_name" text NOT NULL,
  "handle" text NOT NULL,
  "profile_url" text,
  "account_type" text DEFAULT 'supporting'::text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ownership_level" text DEFAULT 'opd'::text NOT NULL,
  "is_primary_source" boolean DEFAULT false NOT NULL,
  "source_priority" integer DEFAULT 10 NOT NULL,
  "district_id" bigint
);

ALTER SEQUENCE "owned_social_accounts_id_seq" OWNED BY "owned_social_accounts"."id";

CREATE TABLE "password_reset_email_tokens" (
  "id" bigint DEFAULT nextval('password_reset_email_tokens_id_seq'::regclass) NOT NULL,
  "user_id" bigint NOT NULL,
  "token_hash" text NOT NULL,
  "password_fingerprint" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "password_reset_email_tokens_id_seq" OWNED BY "password_reset_email_tokens"."id";

CREATE TABLE "password_reset_requests" (
  "id" bigint DEFAULT nextval('password_reset_requests_id_seq'::regclass) NOT NULL,
  "user_id" bigint NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "resolved_by" bigint,
  "resolved_at" timestamp with time zone
);

ALTER SEQUENCE "password_reset_requests_id_seq" OWNED BY "password_reset_requests"."id";

CREATE TABLE "permissions" (
  "id" bigint DEFAULT nextval('permissions_id_seq'::regclass) NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "permissions_id_seq" OWNED BY "permissions"."id";

CREATE TABLE "print_article_keywords" (
  "id" bigint DEFAULT nextval('print_article_keywords_id_seq'::regclass) NOT NULL,
  "article_id" bigint NOT NULL,
  "keyword_id" bigint,
  "keyword_text" text NOT NULL,
  "source" text DEFAULT 'operator'::text NOT NULL,
  "confidence" numeric,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "print_article_keywords_id_seq" OWNED BY "print_article_keywords"."id";

CREATE TABLE "print_article_pages" (
  "article_id" bigint NOT NULL,
  "page_id" bigint NOT NULL,
  "sequence_no" integer DEFAULT 1 NOT NULL,
  "bbox" jsonb,
  "clipping_image_key" text,
  "ocr_text" text,
  "ocr_confidence" numeric,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "print_articles" (
  "id" bigint DEFAULT nextval('print_articles_id_seq'::regclass) NOT NULL,
  "edition_id" bigint NOT NULL,
  "opd_id" bigint,
  "district_id" bigint,
  "title" text,
  "subtitle" text,
  "author" text,
  "summary" text,
  "body_text" text,
  "is_headline" boolean DEFAULT false NOT NULL,
  "is_continued" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'uploaded'::text NOT NULL,
  "sentiment" text,
  "risk_score" numeric DEFAULT 0 NOT NULL,
  "importance_score" numeric DEFAULT 0 NOT NULL,
  "ocr_confidence" numeric,
  "ai_metadata" jsonb,
  "created_by" bigint,
  "verified_by" bigint,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "print_articles_id_seq" OWNED BY "print_articles"."id";

CREATE TABLE "print_clippings" (
  "id" bigint DEFAULT nextval('print_clippings_id_seq'::regclass) NOT NULL,
  "page_id" bigint NOT NULL,
  "opd_id" bigint,
  "headline" text,
  "body_text" text,
  "bbox" jsonb,
  "thumbnail_key" text,
  "sentiment" text,
  "risk_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "analysis" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "article_id" bigint
);

ALTER SEQUENCE "print_clippings_id_seq" OWNED BY "print_clippings"."id";

CREATE TABLE "print_editions" (
  "id" bigint DEFAULT nextval('print_editions_id_seq'::regclass) NOT NULL,
  "source_id" bigint NOT NULL,
  "edition_date" date NOT NULL,
  "edition_name" text,
  "file_name" text,
  "storage_key" text,
  "status" text DEFAULT 'queued'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "print_editions_id_seq" OWNED BY "print_editions"."id";

CREATE TABLE "print_ocr_results" (
  "id" bigint DEFAULT nextval('print_ocr_results_id_seq'::regclass) NOT NULL,
  "upload_file_id" bigint,
  "page_id" bigint,
  "article_id" bigint,
  "engine" text,
  "engine_version" text,
  "raw_text" text,
  "confidence" numeric,
  "extracted_fields" jsonb,
  "status" text DEFAULT 'completed'::text NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "print_ocr_results_id_seq" OWNED BY "print_ocr_results"."id";

CREATE TABLE "print_pages" (
  "id" bigint DEFAULT nextval('print_pages_id_seq'::regclass) NOT NULL,
  "edition_id" bigint NOT NULL,
  "page_number" integer NOT NULL,
  "image_key" text,
  "ocr_text" text,
  "is_front_page" boolean DEFAULT false NOT NULL,
  "analysis" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "print_pages_id_seq" OWNED BY "print_pages"."id";

CREATE TABLE "print_upload_files" (
  "id" bigint DEFAULT nextval('print_upload_files_id_seq'::regclass) NOT NULL,
  "edition_id" bigint NOT NULL,
  "media_scan_id" bigint,
  "original_name" text NOT NULL,
  "storage_key" text,
  "mime_type" text NOT NULL,
  "byte_size" bigint NOT NULL,
  "file_order" integer DEFAULT 1 NOT NULL,
  "page_count" integer,
  "content_hash" text,
  "status" text DEFAULT 'uploaded'::text NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "print_upload_files_id_seq" OWNED BY "print_upload_files"."id";

CREATE TABLE "refresh_tokens" (
  "id" bigint DEFAULT nextval('refresh_tokens_id_seq'::regclass) NOT NULL,
  "user_id" bigint NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "refresh_tokens_id_seq" OWNED BY "refresh_tokens"."id";

CREATE TABLE "role_permissions" (
  "role_id" bigint NOT NULL,
  "permission_id" bigint NOT NULL
);

CREATE TABLE "roles" (
  "id" bigint DEFAULT nextval('roles_id_seq'::regclass) NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "scope" text DEFAULT 'organization'::text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "roles_id_seq" OWNED BY "roles"."id";

CREATE TABLE "schema_migrations" (
  "version" text NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "social_conversation_cluster_members" (
  "cluster_id" bigint NOT NULL,
  "mention_id" bigint NOT NULL,
  "similarity_score" numeric(6,5) DEFAULT 1 NOT NULL,
  "similarity_type" text DEFAULT 'semantic'::text NOT NULL,
  "matched_by" text,
  "assignment_mode" text DEFAULT 'SYSTEM'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "social_conversation_clusters" (
  "id" bigint DEFAULT nextval('social_conversation_clusters_id_seq'::regclass) NOT NULL,
  "organization_id" bigint NOT NULL,
  "canonical_title" text NOT NULL,
  "taxonomy_id" bigint,
  "keyword_id" bigint,
  "representative_mention_id" bigint,
  "member_count" integer DEFAULT 0 NOT NULL,
  "platform_count" integer DEFAULT 0 NOT NULL,
  "first_published_at" timestamp with time zone,
  "last_published_at" timestamp with time zone,
  "engine_version" text DEFAULT 'social-conversation-v1'::text NOT NULL,
  "origin_mode" text DEFAULT 'SYSTEM'::text NOT NULL,
  "status" text DEFAULT 'ACTIVE'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "social_conversation_clusters_id_seq" OWNED BY "social_conversation_clusters"."id";

CREATE TABLE "social_conversation_manual_exclusions" (
  "mention_id" bigint NOT NULL,
  "organization_id" bigint NOT NULL,
  "reason" text,
  "excluded_by" bigint,
  "excluded_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "social_mention_issues" (
  "mention_id" bigint NOT NULL,
  "issue_id" bigint NOT NULL,
  "relevance_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "linkage_source" text DEFAULT 'rule'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "social_mention_keywords" (
  "mention_id" bigint NOT NULL,
  "keyword_id" bigint NOT NULL,
  "matched_text" text,
  "match_count" integer DEFAULT 1 NOT NULL,
  "confidence" numeric(5,4) DEFAULT 1.0000 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "social_mentions" (
  "id" bigint DEFAULT nextval('social_mentions_id_seq'::regclass) NOT NULL,
  "platform" text NOT NULL,
  "external_id" text,
  "content_type" text DEFAULT 'post'::text NOT NULL,
  "source_kind" text DEFAULT 'external'::text NOT NULL,
  "owned_account_id" bigint,
  "opd_id" bigint,
  "author_name" text,
  "author_handle" text,
  "author_profile_url" text,
  "canonical_url" text,
  "title" text,
  "content" text,
  "language" text,
  "published_at" timestamp with time zone,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sentiment" text,
  "sentiment_score" numeric(6,3),
  "importance_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "influence_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "risk_score" numeric(5,2) DEFAULT 0 NOT NULL,
  "risk_level" text DEFAULT 'low'::text NOT NULL,
  "location_id" bigint,
  "district_id" bigint,
  "village_id" bigint,
  "content_hash" text,
  "collector" text,
  "raw_payload" jsonb,
  "metadata" jsonb,
  "processing_status" text DEFAULT 'captured'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "curation_status" text,
  "curated_at" timestamp with time zone,
  "curated_by" bigint,
  "curation_reason" text
);

ALTER SEQUENCE "social_mentions_id_seq" OWNED BY "social_mentions"."id";

CREATE TABLE "social_post_metrics" (
  "id" bigint DEFAULT nextval('social_post_metrics_id_seq'::regclass) NOT NULL,
  "mention_id" bigint NOT NULL,
  "measured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "views" bigint,
  "reach" bigint,
  "impressions" bigint,
  "likes" bigint,
  "comments" bigint,
  "shares" bigint,
  "saves" bigint,
  "clicks" bigint,
  "reposts" bigint,
  "engagement_count" bigint,
  "engagement_rate" numeric(8,4),
  "source" text,
  "raw_payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "social_post_metrics_id_seq" OWNED BY "social_post_metrics"."id";

CREATE TABLE "taxonomy_categories" (
  "id" bigint DEFAULT nextval('taxonomy_categories_id_seq'::regclass) NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" bigint,
  "sector_id" bigint,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "legacy" boolean DEFAULT false NOT NULL
);

ALTER SEQUENCE "taxonomy_categories_id_seq" OWNED BY "taxonomy_categories"."id";

CREATE TABLE "unified_candidate_issues" (
  "id" bigint DEFAULT nextval('unified_candidate_issues_id_seq'::regclass) NOT NULL,
  "organization_id" bigint NOT NULL,
  "candidate_key" text NOT NULL,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "suggested_title" text NOT NULL,
  "suggested_description" text,
  "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp with time zone,
  "decided_by" bigint,
  "issue_id" bigint,
  "decision_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "unified_candidate_issues_id_seq" OWNED BY "unified_candidate_issues"."id";

CREATE TABLE "uptd" (
  "id" bigint DEFAULT nextval('uptd_id_seq'::regclass) NOT NULL,
  "organization_id" bigint NOT NULL,
  "opd_id" bigint NOT NULL,
  "code" text,
  "name" text NOT NULL,
  "aliases" text[] DEFAULT ARRAY[]::text[] NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "uptd_id_seq" OWNED BY "uptd"."id";

CREATE TABLE "user_notification_channels" (
  "id" bigint DEFAULT nextval('user_notification_channels_id_seq'::regclass) NOT NULL,
  "user_id" bigint NOT NULL,
  "channel" text NOT NULL,
  "external_user_id" text NOT NULL,
  "chat_id" text,
  "display_name" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "verified_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "user_notification_channels_id_seq" OWNED BY "user_notification_channels"."id";

CREATE TABLE "user_roles" (
  "user_id" bigint NOT NULL,
  "role_id" bigint NOT NULL,
  "opd_id" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "users" (
  "id" bigint DEFAULT nextval('users_id_seq'::regclass) NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text DEFAULT 'viewer'::text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "opd_id" bigint,
  "district_id" bigint
);

ALTER SEQUENCE "users_id_seq" OWNED BY "users"."id";

CREATE TABLE "viewer_display_devices" (
  "id" bigint DEFAULT nextval('viewer_display_devices_id_seq'::regclass) NOT NULL,
  "user_id" bigint NOT NULL,
  "organization_id" bigint NOT NULL,
  "name" character varying(80) NOT NULL,
  "token_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone
);

ALTER SEQUENCE "viewer_display_devices_id_seq" OWNED BY "viewer_display_devices"."id";

CREATE TABLE "villages" (
  "id" bigint DEFAULT nextval('villages_id_seq'::regclass) NOT NULL,
  "district_id" bigint NOT NULL,
  "name" text NOT NULL,
  "code" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" bigint,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE "villages_id_seq" OWNED BY "villages"."id";

ALTER TABLE "ai_budget_reservations" ADD CONSTRAINT "ai_budget_reservations_reserved_usd_check" CHECK ((reserved_usd >= (0)::numeric));

ALTER TABLE "ai_budget_reservations" ADD CONSTRAINT "ai_budget_reservations_settled_usd_check" CHECK ((settled_usd >= (0)::numeric));

ALTER TABLE "ai_budget_reservations" ADD CONSTRAINT "ai_budget_reservations_status_check" CHECK ((status = ANY (ARRAY['reserved'::text, 'settled'::text, 'released'::text])));

ALTER TABLE "ai_free_tier_daily_limits" ADD CONSTRAINT "ai_free_tier_daily_limits_max_requests_check" CHECK ((max_requests > 0));

ALTER TABLE "ai_free_tier_daily_usage" ADD CONSTRAINT "ai_free_tier_daily_usage_reserved_requests_check" CHECK ((reserved_requests >= 0));

ALTER TABLE "ai_gemini_quota_feature_audit" ADD CONSTRAINT "ai_gemini_quota_feature_audit_feature_code_check" CHECK (((length(feature_code) >= 1) AND (length(feature_code) <= 80)));

ALTER TABLE "ai_humas_model_selections" ADD CONSTRAINT "ai_humas_model_selection_task_guard" CHECK ((task_code = ANY (ARRAY['gap_analysis'::text, 'strakom_analysis'::text, 'publication_analysis'::text, 'monitoring_analysis'::text, 'content_studio_prompting'::text])));

ALTER TABLE "ai_humas_task_prompts" ADD CONSTRAINT "ai_humas_prompt_task_guard" CHECK ((task_code = ANY (ARRAY['gap_analysis'::text, 'strakom_analysis'::text, 'publication_analysis'::text, 'monitoring_analysis'::text, 'content_studio_prompting'::text])));

ALTER TABLE "ai_humas_task_prompts" ADD CONSTRAINT "ai_humas_task_prompts_default_prompt_text_check" CHECK (((char_length(TRIM(BOTH FROM default_prompt_text)) >= 20) AND (char_length(TRIM(BOTH FROM default_prompt_text)) <= 30000)));

ALTER TABLE "ai_humas_task_prompts" ADD CONSTRAINT "ai_humas_task_prompts_prompt_text_check" CHECK (((char_length(TRIM(BOTH FROM prompt_text)) >= 20) AND (char_length(TRIM(BOTH FROM prompt_text)) <= 30000)));

ALTER TABLE "ai_humas_task_prompts" ADD CONSTRAINT "ai_humas_task_prompts_version_check" CHECK ((version > 0));

ALTER TABLE "ai_model_prices" ADD CONSTRAINT "ai_model_prices_input_usd_per_million_check" CHECK ((input_usd_per_million >= (0)::numeric));

ALTER TABLE "ai_model_prices" ADD CONSTRAINT "ai_model_prices_output_usd_per_million_check" CHECK ((output_usd_per_million >= (0)::numeric));

ALTER TABLE "ai_provider_balance_snapshots" ADD CONSTRAINT "ai_provider_balance_snapshots_balance_usd_check" CHECK ((balance_usd >= (0)::numeric));

ALTER TABLE "ai_provider_balance_snapshots" ADD CONSTRAINT "ai_provider_balance_snapshots_committed_baseline_usd_check" CHECK ((committed_baseline_usd >= (0)::numeric));

ALTER TABLE "ai_provider_balance_snapshots" ADD CONSTRAINT "ai_provider_balance_snapshots_reason_check" CHECK ((length(TRIM(BOTH FROM reason)) >= 5));

ALTER TABLE "ai_provider_budgets" ADD CONSTRAINT "ai_provider_budgets_check" CHECK ((period_end > period_start));

ALTER TABLE "ai_provider_budgets" ADD CONSTRAINT "ai_provider_budgets_limit_usd_check" CHECK ((limit_usd >= (0)::numeric));

ALTER TABLE "alert_print_articles" ADD CONSTRAINT "alert_print_articles_evidence_role_check" CHECK ((evidence_role = ANY (ARRAY['primary'::text, 'supporting'::text])));

ALTER TABLE "alerts" ADD CONSTRAINT "alerts_severity_check" CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));

ALTER TABLE "alerts" ADD CONSTRAINT "alerts_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text])));

ALTER TABLE "apify_usage_ledger" ADD CONSTRAINT "apify_usage_ledger_actual_usd_check" CHECK ((actual_usd >= (0)::numeric));

ALTER TABLE "apify_usage_ledger" ADD CONSTRAINT "apify_usage_ledger_platform_check" CHECK ((platform = ANY (ARRAY['tiktok'::text, 'instagram'::text])));

ALTER TABLE "apify_usage_ledger" ADD CONSTRAINT "apify_usage_ledger_reserved_usd_check" CHECK ((reserved_usd >= (0)::numeric));

ALTER TABLE "apify_usage_ledger" ADD CONSTRAINT "apify_usage_ledger_status_check" CHECK ((status = ANY (ARRAY['RESERVED'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'UNKNOWN'::text])));

ALTER TABLE "apify_usage_ledger" ADD CONSTRAINT "apify_usage_run_required" CHECK (((status <> ALL (ARRAY['RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text])) OR (run_id IS NOT NULL)));

ALTER TABLE "article_alerts" ADD CONSTRAINT "article_alerts_severity_check" CHECK ((severity = ANY (ARRAY['medium'::text, 'high'::text, 'critical'::text])));

ALTER TABLE "article_alerts" ADD CONSTRAINT "article_alerts_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text])));

ALTER TABLE "article_manual_keywords" ADD CONSTRAINT "article_manual_keywords_keyword_role_check" CHECK (((keyword_role IS NULL) OR (keyword_role = ANY (ARRAY['PRIMARY'::text, 'RELATED'::text]))));

ALTER TABLE "article_opd" ADD CONSTRAINT "article_opd_assignment_source_check" CHECK ((assignment_source = ANY (ARRAY['AUTO'::text, 'MANUAL'::text])));

ALTER TABLE "article_opd" ADD CONSTRAINT "article_opd_routing_role_check" CHECK ((routing_role = ANY (ARRAY['PRIMARY'::text, 'SUPPORTING'::text])));

ALTER TABLE "articles" ADD CONSTRAINT "articles_news_classification_check" CHECK (((news_classification IS NULL) OR (news_classification = ANY (ARRAY['UTAMA'::text, 'PENDUKUNG'::text]))));

ALTER TABLE "articles" ADD CONSTRAINT "articles_news_classification_source_check" CHECK ((news_classification_source = ANY (ARRAY['AUTO'::text, 'MANUAL'::text])));

ALTER TABLE "articles" ADD CONSTRAINT "articles_risk_level_check" CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));

ALTER TABLE "articles" ADD CONSTRAINT "articles_sentiment_check" CHECK ((sentiment = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text])));

ALTER TABLE "collection_scheduler_config" ADD CONSTRAINT "collection_scheduler_singleton" CHECK ((id = 1));

ALTER TABLE "collection_scheduler_runs" ADD CONSTRAINT "collection_scheduler_runs_status_check" CHECK (((status)::text = ANY ((ARRAY['RUNNING'::character varying, 'SUCCESS'::character varying, 'PARTIAL'::character varying, 'FAILED'::character varying, 'SKIPPED'::character varying])::text[])));

ALTER TABLE "collection_scheduler_runs" ADD CONSTRAINT "collection_scheduler_runs_trigger_type_check" CHECK (((trigger_type)::text = ANY ((ARRAY['SCHEDULED'::character varying, 'MANUAL'::character varying])::text[])));

ALTER TABLE "communication_strategies" ADD CONSTRAINT "communication_strategies_status_check" CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'IN_REVIEW'::character varying, 'APPROVED'::character varying, 'SUPERSEDED'::character varying])::text[])));

ALTER TABLE "communication_strategies" ADD CONSTRAINT "communication_strategies_version_check" CHECK ((version > 0));

ALTER TABLE "content_project_items" ADD CONSTRAINT "content_project_items_status_check" CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'PROMPT_READY'::character varying])::text[])));

ALTER TABLE "content_project_sources" ADD CONSTRAINT "content_project_sources_category_check" CHECK (((category)::text = ANY ((ARRAY['OFFICIAL_STATEMENT'::character varying, 'DATA_STATISTICS'::character varying, 'LEGAL_REGULATION'::character varying, 'PROGRAM_SERVICE'::character varying, 'ADDITIONAL_REFERENCE'::character varying])::text[])));

ALTER TABLE "content_project_sources" ADD CONSTRAINT "content_project_sources_status_check" CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'EXTRACTED'::character varying, 'CONFIRMED'::character varying, 'REJECTED'::character varying])::text[])));

ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_status_check" CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'READY'::character varying, 'COMPLETED'::character varying])::text[])));

ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_check" CHECK (((article_id IS NOT NULL) OR (media_scan_id IS NOT NULL) OR (print_article_id IS NOT NULL) OR (social_mention_id IS NOT NULL)));

ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_source_type_check" CHECK ((source_type = ANY (ARRAY['online'::text, 'print'::text, 'social'::text, 'owned_social'::text, 'website'::text, 'manual'::text])));

ALTER TABLE "executive_brief_daily_cache" ADD CONSTRAINT "executive_brief_daily_cache_status_check" CHECK ((status = ANY (ARRAY['running'::text, 'ready'::text, 'failed'::text])));

ALTER TABLE "executive_brief_daily_cache" ADD CONSTRAINT "executive_brief_ready_requires_data" CHECK (((status <> 'ready'::text) OR ((brief_json IS NOT NULL) AND (generated_at IS NOT NULL))));

ALTER TABLE "executive_brief_schedule_settings" ADD CONSTRAINT "executive_brief_schedule_settings_hour_wib_check" CHECK (((hour_wib >= 0) AND (hour_wib <= 23)));

ALTER TABLE "executive_brief_schedule_settings" ADD CONSTRAINT "executive_brief_schedule_settings_id_check" CHECK ((id = 1));

ALTER TABLE "executive_brief_schedule_settings" ADD CONSTRAINT "executive_brief_schedule_settings_minute_wib_check" CHECK (((minute_wib >= 0) AND (minute_wib <= 59)));

ALTER TABLE "executive_brief_schedule_settings" ADD CONSTRAINT "executive_brief_schedule_settings_timezone_check" CHECK ((timezone = 'Asia/Jakarta'::text));

ALTER TABLE "government_officials" ADD CONSTRAINT "government_officials_role_code_check" CHECK (((role_code)::text = ANY ((ARRAY['MAYOR'::character varying, 'DEPUTY_MAYOR'::character varying, 'REGIONAL_SECRETARY'::character varying])::text[])));

ALTER TABLE "incident_tasks" ADD CONSTRAINT "incident_tasks_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'DONE'::text])));

ALTER TABLE "incident_tasks" ADD CONSTRAINT "incident_tasks_task_key_check" CHECK ((task_key = ANY (ARRAY['VERIFY'::text, 'COORDINATE'::text, 'MESSAGE'::text, 'MONITOR'::text])));

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_approval_check" CHECK ((approval = ANY (ARRAY['DRAFT'::text, 'REVIEW'::text, 'APPROVED'::text])));

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_severity_check" CHECK ((severity = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'CRITICAL'::text])));

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_status_check" CHECK ((status = ANY (ARRAY['MONITORING'::text, 'ESCALATED'::text, 'RESOLVED'::text])));

ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_status_check" CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text])));

ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_last_status_check" CHECK ((last_status = ANY (ARRAY['untested'::text, 'healthy'::text, 'error'::text, 'expired'::text, 'disabled'::text])));

ALTER TABLE "integration_providers" ADD CONSTRAINT "integration_providers_auth_type_check" CHECK ((auth_type = ANY (ARRAY['api_key'::text, 'oauth2'::text, 'access_token'::text, 'research_api'::text, 'other'::text])));

ALTER TABLE "issue_articles" ADD CONSTRAINT "issue_articles_assignment_source_check" CHECK (((assignment_source)::text = ANY ((ARRAY['AUTO'::character varying, 'MANUAL'::character varying, 'ISSUE_MONITOR'::character varying])::text[])));

ALTER TABLE "issue_contributor_clarification_rounds" ADD CONSTRAINT "issue_contributor_clarification_rounds_request_text_check" CHECK ((length(btrim(request_text)) > 0));

ALTER TABLE "issue_contributor_clarification_rounds" ADD CONSTRAINT "issue_contributor_clarification_rounds_review_status_check" CHECK ((review_status = ANY (ARRAY['REQUESTED'::text, 'SUBMITTED'::text, 'ACCEPTED'::text, 'FOLLOW_UP_REQUESTED'::text])));

ALTER TABLE "issue_contributor_clarification_rounds" ADD CONSTRAINT "issue_contributor_clarification_rounds_round_number_check" CHECK ((round_number > 0));

ALTER TABLE "issue_contributor_submissions" ADD CONSTRAINT "issue_contributor_submission_content_check" CHECK (((NULLIF(btrim(COALESCE(field_condition, ''::text)), ''::text) IS NOT NULL) OR (NULLIF(btrim(COALESCE(facts_data, ''::text)), ''::text) IS NOT NULL) OR (NULLIF(btrim(COALESCE(action_taken, ''::text)), ''::text) IS NOT NULL) OR (NULLIF(btrim(COALESCE(notes, ''::text)), ''::text) IS NOT NULL)));

ALTER TABLE "issue_districts" ADD CONSTRAINT "issue_districts_source_check" CHECK ((source = ANY (ARRAY['MANUAL'::text, 'SUGGESTED'::text])));

ALTER TABLE "issue_keywords" ADD CONSTRAINT "issue_keywords_keyword_role_check" CHECK (((keyword_role)::text = ANY ((ARRAY['PRIMARY'::character varying, 'SUPPORTING'::character varying])::text[])));

ALTER TABLE "issue_linkage_h1_batches" ADD CONSTRAINT "issue_linkage_h1_batches_evidence_count_check" CHECK ((evidence_count >= 0));

ALTER TABLE "issue_linkage_h1_batches" ADD CONSTRAINT "issue_linkage_h1_batches_request_count_check" CHECK ((request_count >= 0));

ALTER TABLE "issue_linkage_h1_batches" ADD CONSTRAINT "issue_linkage_h1_batches_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])));

ALTER TABLE "issue_linkage_h1_evidence_ledger" ADD CONSTRAINT "issue_linkage_h1_evidence_ledger_source_id_check" CHECK ((source_id > 0));

ALTER TABLE "issue_linkage_h1_evidence_ledger" ADD CONSTRAINT "issue_linkage_h1_evidence_ledger_source_type_check" CHECK ((source_type = ANY (ARRAY['online'::text, 'print'::text, 'social'::text, 'owned'::text])));

ALTER TABLE "issue_linkage_h1_evidence_ledger" ADD CONSTRAINT "issue_linkage_h1_evidence_ledger_status_check" CHECK ((status = ANY (ARRAY['reserved'::text, 'completed'::text, 'uncertain'::text])));

ALTER TABLE "issue_monitor_sources" ADD CONSTRAINT "issue_monitor_sources_source_type_check" CHECK ((source_type = ANY (ARRAY['online'::text, 'print'::text, 'social'::text, 'owned'::text])));

ALTER TABLE "issue_monitor_terms" ADD CONSTRAINT "issue_monitor_terms_match_type_check" CHECK ((match_type = ANY (ARRAY['DIRECT'::text, 'CONTEXT'::text])));

ALTER TABLE "issue_monitoring_analysis_snapshots" ADD CONSTRAINT "issue_monitoring_analysis_snapshots_period_number_check" CHECK ((period_number > 0));

ALTER TABLE "issue_monitors" ADD CONSTRAINT "issue_monitors_check" CHECK ((ends_at > starts_at));

ALTER TABLE "issue_monitors" ADD CONSTRAINT "issue_monitors_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'watching'::text, 'expired'::text, 'closed'::text])));

ALTER TABLE "issue_opd" ADD CONSTRAINT "issue_opd_responsibility_check" CHECK ((responsibility = ANY (ARRAY['leading'::text, 'supporting'::text])));

ALTER TABLE "issue_print_articles" ADD CONSTRAINT "issue_print_articles_linkage_status_check" CHECK ((linkage_status = ANY (ARRAY['candidate'::text, 'linked'::text, 'rejected'::text])));

ALTER TABLE "issue_print_articles" ADD CONSTRAINT "issue_print_articles_relevance_score_check" CHECK (((relevance_score >= (0)::numeric) AND (relevance_score <= (100)::numeric)));

ALTER TABLE "issue_publication_evidence" ADD CONSTRAINT "issue_publication_evidence_channel_check" CHECK (((channel IS NULL) OR (channel = ANY (ARRAY['website'::text, 'instagram'::text, 'facebook'::text, 'tiktok'::text, 'youtube'::text, 'x'::text, 'threads'::text, 'press_release'::text, 'media_statement'::text, 'other'::text]))));

ALTER TABLE "issue_publication_evidence" ADD CONSTRAINT "issue_publication_evidence_evidence_type_check" CHECK ((evidence_type = ANY (ARRAY['WEBSITE'::text, 'PDF'::text, 'IMAGE'::text])));

ALTER TABLE "issue_publication_evidence" ADD CONSTRAINT "issue_publication_evidence_mime_type_check" CHECK (((mime_type IS NULL) OR (mime_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text]))));

ALTER TABLE "issue_publication_evidence" ADD CONSTRAINT "issue_publication_evidence_source_ck" CHECK ((((evidence_type = 'WEBSITE'::text) AND (url IS NOT NULL)) OR ((evidence_type = ANY (ARRAY['PDF'::text, 'IMAGE'::text])) AND (url IS NULL))));

ALTER TABLE "issue_publication_evidence_files" ADD CONSTRAINT "issue_publication_evidence_files_file_order_check" CHECK (((file_order >= 1) AND (file_order <= 3)));

ALTER TABLE "issue_publication_evidence_files" ADD CONSTRAINT "issue_publication_evidence_files_mime_type_check" CHECK ((mime_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text])));

ALTER TABLE "issue_response_submissions" ADD CONSTRAINT "issue_response_submissions_status_check" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'REVISION_REQUIRED'::text, 'APPROVED'::text, 'SUPERSEDED'::text])));

ALTER TABLE "issue_workflow_contributors" ADD CONSTRAINT "issue_workflow_contributor_entity_check" CHECK ((((contributor_type = 'OPD'::text) AND (opd_id IS NOT NULL) AND (uptd_id IS NULL) AND (district_id IS NULL) AND (contribution_role = 'SUPPORTING'::text)) OR ((contributor_type = 'UPTD'::text) AND (opd_id IS NULL) AND (uptd_id IS NOT NULL) AND (district_id IS NULL) AND (contribution_role = 'TECHNICAL'::text)) OR ((contributor_type = 'DISTRICT'::text) AND (opd_id IS NULL) AND (uptd_id IS NULL) AND (district_id IS NOT NULL) AND (contribution_role = 'FIELD_INFORMATION'::text))));

ALTER TABLE "issue_workflow_contributors" ADD CONSTRAINT "issue_workflow_contributors_contribution_role_check" CHECK ((contribution_role = ANY (ARRAY['SUPPORTING'::text, 'TECHNICAL'::text, 'FIELD_INFORMATION'::text])));

ALTER TABLE "issue_workflow_contributors" ADD CONSTRAINT "issue_workflow_contributors_contributor_type_check" CHECK ((contributor_type = ANY (ARRAY['OPD'::text, 'UPTD'::text, 'DISTRICT'::text])));

ALTER TABLE "issue_workflow_contributors" ADD CONSTRAINT "issue_workflow_contributors_status_check" CHECK ((status = ANY (ARRAY['NOMINATED'::text, 'CLARIFICATION_REQUESTED'::text, 'SUBMITTED'::text, 'ACCEPTED'::text])));

ALTER TABLE "issue_workflows" ADD CONSTRAINT "issue_workflows_cycle_number_ck" CHECK ((cycle_number > 0));

ALTER TABLE "issue_workflows" ADD CONSTRAINT "issue_workflows_workflow_status_check" CHECK ((workflow_status = ANY (ARRAY['NEW'::text, 'ASSIGNED'::text, 'IN_PROGRESS'::text, 'SUBMITTED'::text, 'REVISION_REQUIRED'::text, 'APPROVED'::text, 'STRATEGY'::text, 'PUBLISHED'::text, 'MONITORING'::text, 'CLOSED'::text])));

ALTER TABLE "issues" ADD CONSTRAINT "issues_geographic_scope_check" CHECK ((geographic_scope = ANY (ARRAY['UNSPECIFIED'::text, 'DISTRICTS'::text, 'CITYWIDE'::text])));

ALTER TABLE "issues" ADD CONSTRAINT "issues_momentum_check" CHECK ((momentum = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));

ALTER TABLE "issues" ADD CONSTRAINT "issues_risk_level_check" CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));

ALTER TABLE "issues" ADD CONSTRAINT "issues_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'watch'::text, 'resolved'::text, 'archived'::text])));

ALTER TABLE "keyword_district" ADD CONSTRAINT "keyword_district_weight_check" CHECK (((weight > (0)::numeric) AND (weight <= (10)::numeric)));

ALTER TABLE "keyword_opd" ADD CONSTRAINT "keyword_opd_routing_role_check" CHECK ((routing_role = ANY (ARRAY['PRIMARY'::text, 'SUPPORTING'::text])));

ALTER TABLE "keyword_opd" ADD CONSTRAINT "keyword_opd_weight_check" CHECK (((weight > (0)::numeric) AND (weight <= (10)::numeric)));

ALTER TABLE "keyword_taxonomy" ADD CONSTRAINT "keyword_taxonomy_weight_check" CHECK (((weight > (0)::numeric) AND (weight <= (10)::numeric)));

ALTER TABLE "keywords" ADD CONSTRAINT "keywords_evidence_strength_check" CHECK ((evidence_strength = ANY (ARRAY['DIRECT'::text, 'CONTEXT'::text, 'REVIEW'::text])));

ALTER TABLE "keywords" ADD CONSTRAINT "keywords_match_type_check" CHECK ((match_type = ANY (ARRAY['contains'::text, 'exact'::text, 'regex'::text])));

ALTER TABLE "keywords" ADD CONSTRAINT "keywords_priority_check" CHECK (((priority >= 1) AND (priority <= 3)));

ALTER TABLE "keywords" ADD CONSTRAINT "keywords_single_target_check" CHECK (((((opd_id IS NOT NULL))::integer + ((district_id IS NOT NULL))::integer) <= 1)) NOT VALID;

ALTER TABLE "media_scans" ADD CONSTRAINT "media_scans_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'completed'::text, 'failed'::text])));

ALTER TABLE "media_sources" ADD CONSTRAINT "media_sources_category_check" CHECK ((category = ANY (ARRAY['online'::text, 'print'::text, 'social'::text])));

ALTER TABLE "narratives" ADD CONSTRAINT "narratives_confidence_check" CHECK ((confidence = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));

ALTER TABLE "narratives" ADD CONSTRAINT "narratives_narrative_type_check" CHECK ((narrative_type = ANY (ARRAY['dominant'::text, 'emerging'::text, 'counter'::text])));

ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_code_check" CHECK ((code = ANY (ARRAY['EMAIL'::text, 'TELEGRAM'::text, 'WHATSAPP'::text])));

ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_last_test_status_check" CHECK (((last_test_status IS NULL) OR (last_test_status = ANY (ARRAY['SUCCESS'::text, 'FAILED'::text]))));

ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_status_check" CHECK ((status = ANY (ARRAY['INACTIVE'::text, 'READY'::text, 'ACTIVE'::text])));

ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_attempt_count_check" CHECK ((attempt_count >= 0));

ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_channel_check" CHECK ((channel = ANY (ARRAY['EMAIL'::text, 'TELEGRAM'::text, 'WHATSAPP'::text])));

ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_source_ck" CHECK ((((workflow_event_id IS NOT NULL) AND (alert_id IS NULL)) OR ((workflow_event_id IS NULL) AND (alert_id IS NOT NULL))));

ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'SENT'::text, 'FAILED'::text])));

ALTER TABLE "notification_link_tokens" ADD CONSTRAINT "notification_link_tokens_channel_check" CHECK ((channel = ANY (ARRAY['TELEGRAM'::text, 'WHATSAPP'::text])));

ALTER TABLE "online_story_cluster_members" ADD CONSTRAINT "online_story_cluster_members_assignment_mode_check" CHECK ((assignment_mode = ANY (ARRAY['AUTO'::text, 'MANUAL'::text])));

ALTER TABLE "online_story_clusters" ADD CONSTRAINT "online_story_clusters_origin_mode_check" CHECK ((origin_mode = ANY (ARRAY['SYSTEM'::text, 'MANUAL'::text])));

ALTER TABLE "online_story_clusters" ADD CONSTRAINT "online_story_clusters_status_check" CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'ARCHIVED'::text])));

ALTER TABLE "opd" ADD CONSTRAINT "opd_group_check" CHECK (((opd_group IS NULL) OR (opd_group = ANY (ARRAY['DINAS'::text, 'BADAN'::text, 'SETDA'::text, 'LAINNYA'::text]))));

ALTER TABLE "organization_map_boundaries" ADD CONSTRAINT "organization_map_boundaries_feature_count_check" CHECK ((feature_count > 0));

ALTER TABLE "organization_map_boundaries" ADD CONSTRAINT "organization_map_boundaries_status_check" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'INACTIVE'::text])));

ALTER TABLE "organization_map_boundary_features" ADD CONSTRAINT "organization_map_boundary_features_match_method_check" CHECK ((match_method = ANY (ARRAY['OFFICIAL_CODE'::text, 'NORMALIZED_NAME'::text, 'MANUAL'::text, 'UNMATCHED'::text])));

ALTER TABLE "owned_content_cluster_members" ADD CONSTRAINT "owned_cluster_member_review_status_check" CHECK (((review_status IS NULL) OR (review_status = ANY (ARRAY['confirmed'::text, 'rejected'::text]))));

ALTER TABLE "owned_content_cluster_members" ADD CONSTRAINT "owned_content_cluster_members_matched_by_check" CHECK ((matched_by = ANY (ARRAY['rule-v1'::text, 'ai'::text, 'manual'::text])));

ALTER TABLE "owned_content_cluster_members" ADD CONSTRAINT "owned_content_cluster_members_similarity_score_check" CHECK (((similarity_score >= (0)::numeric) AND (similarity_score <= (1)::numeric)));

ALTER TABLE "owned_content_cluster_members" ADD CONSTRAINT "owned_content_cluster_members_similarity_type_check" CHECK ((similarity_type = ANY (ARRAY['identical'::text, 'adapted'::text, 'unique'::text, 'manual'::text])));

ALTER TABLE "owned_content_clusters" ADD CONSTRAINT "owned_content_clusters_channel_count_check" CHECK ((channel_count >= 0));

ALTER TABLE "owned_content_clusters" ADD CONSTRAINT "owned_content_clusters_member_count_check" CHECK ((member_count >= 0));

ALTER TABLE "owned_social_account_metrics" ADD CONSTRAINT "owned_social_account_metrics_data_scope_check" CHECK ((data_scope = ANY (ARRAY['snapshot'::text, 'daily'::text, 'weekly'::text, 'monthly'::text])));

ALTER TABLE "owned_social_accounts" ADD CONSTRAINT "owned_social_accounts_account_type_check" CHECK ((account_type = ANY (ARRAY['primary'::text, 'supporting'::text])));

ALTER TABLE "owned_social_accounts" ADD CONSTRAINT "owned_social_accounts_owner_scope_check" CHECK ((((ownership_level = 'pemko'::text) AND (opd_id IS NULL) AND (district_id IS NULL)) OR ((ownership_level = 'opd'::text) AND (opd_id IS NOT NULL) AND (district_id IS NULL)) OR ((ownership_level = 'district'::text) AND (opd_id IS NULL) AND (district_id IS NOT NULL))));

ALTER TABLE "owned_social_accounts" ADD CONSTRAINT "owned_social_accounts_ownership_level_check" CHECK ((ownership_level = ANY (ARRAY['pemko'::text, 'opd'::text, 'district'::text])));

ALTER TABLE "owned_social_accounts" ADD CONSTRAINT "owned_social_accounts_platform_check" CHECK ((platform = ANY (ARRAY['instagram'::text, 'facebook'::text, 'tiktok'::text, 'x'::text, 'youtube'::text, 'website'::text, 'threads'::text])));

ALTER TABLE "owned_social_accounts" ADD CONSTRAINT "owned_social_accounts_source_priority_check" CHECK (((source_priority >= 0) AND (source_priority <= 1000)));

ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_resolution_chk" CHECK ((((status = 'PENDING'::text) AND (resolved_at IS NULL)) OR ((status = ANY (ARRAY['COMPLETED'::text, 'CANCELLED'::text])) AND (resolved_at IS NOT NULL))));

ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'COMPLETED'::text, 'CANCELLED'::text])));

ALTER TABLE "print_article_keywords" ADD CONSTRAINT "print_article_keywords_confidence_check" CHECK (((confidence >= (0)::numeric) AND (confidence <= (100)::numeric)));

ALTER TABLE "print_article_keywords" ADD CONSTRAINT "print_article_keywords_source_check" CHECK ((source = ANY (ARRAY['matched'::text, 'ai'::text, 'operator'::text])));

ALTER TABLE "print_article_pages" ADD CONSTRAINT "print_article_pages_ocr_confidence_check" CHECK (((ocr_confidence >= (0)::numeric) AND (ocr_confidence <= (100)::numeric)));

ALTER TABLE "print_article_pages" ADD CONSTRAINT "print_article_pages_sequence_no_check" CHECK ((sequence_no > 0));

ALTER TABLE "print_articles" ADD CONSTRAINT "print_articles_importance_score_check" CHECK (((importance_score >= (0)::numeric) AND (importance_score <= (100)::numeric)));

ALTER TABLE "print_articles" ADD CONSTRAINT "print_articles_ocr_confidence_check" CHECK (((ocr_confidence >= (0)::numeric) AND (ocr_confidence <= (100)::numeric)));

ALTER TABLE "print_articles" ADD CONSTRAINT "print_articles_risk_score_check" CHECK (((risk_score >= (0)::numeric) AND (risk_score <= (100)::numeric)));

ALTER TABLE "print_articles" ADD CONSTRAINT "print_articles_sentiment_check" CHECK ((sentiment = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text])));

ALTER TABLE "print_articles" ADD CONSTRAINT "print_articles_status_check" CHECK ((status = ANY (ARRAY['uploaded'::text, 'ocr_processing'::text, 'needs_review'::text, 'verified'::text, 'analyzed'::text, 'failed'::text])));

ALTER TABLE "print_clippings" ADD CONSTRAINT "print_clippings_sentiment_check" CHECK ((sentiment = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text])));

ALTER TABLE "print_editions" ADD CONSTRAINT "print_editions_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'completed'::text, 'failed'::text])));

ALTER TABLE "print_ocr_results" ADD CONSTRAINT "print_ocr_results_check" CHECK (((upload_file_id IS NOT NULL) OR (page_id IS NOT NULL) OR (article_id IS NOT NULL)));

ALTER TABLE "print_ocr_results" ADD CONSTRAINT "print_ocr_results_confidence_check" CHECK (((confidence >= (0)::numeric) AND (confidence <= (100)::numeric)));

ALTER TABLE "print_ocr_results" ADD CONSTRAINT "print_ocr_results_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'completed'::text, 'failed'::text])));

ALTER TABLE "print_pages" ADD CONSTRAINT "print_pages_page_number_check" CHECK ((page_number > 0));

ALTER TABLE "print_upload_files" ADD CONSTRAINT "print_upload_files_byte_size_check" CHECK (((byte_size >= 0) AND (byte_size <= 26214400)));

ALTER TABLE "print_upload_files" ADD CONSTRAINT "print_upload_files_file_order_check" CHECK ((file_order > 0));

ALTER TABLE "print_upload_files" ADD CONSTRAINT "print_upload_files_mime_type_check" CHECK ((mime_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text])));

ALTER TABLE "print_upload_files" ADD CONSTRAINT "print_upload_files_page_count_check" CHECK (((page_count IS NULL) OR (page_count > 0)));

ALTER TABLE "print_upload_files" ADD CONSTRAINT "print_upload_files_status_check" CHECK ((status = ANY (ARRAY['uploaded'::text, 'ocr_processing'::text, 'processed'::text, 'failed'::text])));

ALTER TABLE "roles" ADD CONSTRAINT "roles_scope_check" CHECK ((scope = ANY (ARRAY['system'::text, 'organization'::text, 'opd'::text, 'district'::text])));

ALTER TABLE "social_conversation_cluster_members" ADD CONSTRAINT "social_conversation_cluster_members_assignment_mode_check" CHECK ((assignment_mode = ANY (ARRAY['SYSTEM'::text, 'MANUAL'::text])));

ALTER TABLE "social_conversation_clusters" ADD CONSTRAINT "social_conversation_clusters_origin_mode_check" CHECK ((origin_mode = ANY (ARRAY['SYSTEM'::text, 'MANUAL'::text])));

ALTER TABLE "social_conversation_clusters" ADD CONSTRAINT "social_conversation_clusters_status_check" CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'ARCHIVED'::text])));

ALTER TABLE "social_mention_issues" ADD CONSTRAINT "social_mention_issues_linkage_source_check" CHECK ((linkage_source = ANY (ARRAY['rule'::text, 'ai'::text, 'manual'::text, 'ISSUE_MONITOR'::text])));

ALTER TABLE "social_mention_issues" ADD CONSTRAINT "social_mention_issues_relevance_score_check" CHECK (((relevance_score >= (0)::numeric) AND (relevance_score <= (100)::numeric)));

ALTER TABLE "social_mention_keywords" ADD CONSTRAINT "social_mention_keywords_confidence_check" CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)));

ALTER TABLE "social_mention_keywords" ADD CONSTRAINT "social_mention_keywords_match_count_check" CHECK ((match_count >= 1));

ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_content_type_check" CHECK ((content_type = ANY (ARRAY['post'::text, 'comment'::text, 'reply'::text, 'video'::text, 'short'::text, 'reel'::text, 'story'::text, 'live'::text, 'article'::text, 'other'::text])));

ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_curation_status_check" CHECK (((curation_status IS NULL) OR (curation_status = ANY (ARRAY['candidate'::text, 'approved'::text, 'ignored'::text]))));

ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_platform_check" CHECK ((platform = ANY (ARRAY['instagram'::text, 'facebook'::text, 'tiktok'::text, 'x'::text, 'youtube'::text, 'website'::text, 'threads'::text, 'other'::text])));

ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_processing_status_check" CHECK ((processing_status = ANY (ARRAY['captured'::text, 'classified'::text, 'linked'::text, 'failed'::text])));

ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_risk_level_check" CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));

ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_sentiment_check" CHECK ((sentiment = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text])));

ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_source_kind_check" CHECK ((source_kind = ANY (ARRAY['owned'::text, 'external'::text, 'manual'::text])));

ALTER TABLE "unified_candidate_issues" ADD CONSTRAINT "unified_candidate_issues_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'MERGED'::text, 'IGNORED'::text, 'BELOW_THRESHOLD'::text, 'MATCHED_ISSUE'::text])));

ALTER TABLE "user_notification_channels" ADD CONSTRAINT "user_notification_channels_channel_check" CHECK ((channel = ANY (ARRAY['TELEGRAM'::text, 'WHATSAPP'::text])));

ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'operator'::text, 'viewer'::text])));

ALTER TABLE "ai_budget_reservations" ADD CONSTRAINT "ai_budget_reservations_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_free_tier_daily_limits" ADD CONSTRAINT "ai_free_tier_daily_limits_pkey" PRIMARY KEY (model_id);

ALTER TABLE "ai_free_tier_daily_usage" ADD CONSTRAINT "ai_free_tier_daily_usage_pkey" PRIMARY KEY (model_id, usage_date);

ALTER TABLE "ai_gemini_quota_feature_audit" ADD CONSTRAINT "ai_gemini_quota_feature_audit_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_humas_model_selections" ADD CONSTRAINT "ai_humas_model_selections_pkey" PRIMARY KEY (task_code);

ALTER TABLE "ai_humas_task_prompt_history" ADD CONSTRAINT "ai_humas_task_prompt_history_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_humas_task_prompts" ADD CONSTRAINT "ai_humas_task_prompts_pkey" PRIMARY KEY (task_code);

ALTER TABLE "ai_model_prices" ADD CONSTRAINT "ai_model_prices_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_provider_balance_snapshots" ADD CONSTRAINT "ai_provider_balance_snapshots_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_provider_budgets" ADD CONSTRAINT "ai_provider_budgets_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_pkey" PRIMARY KEY (provider_id);

ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_task_routes" ADD CONSTRAINT "ai_task_routes_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY (id);

ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_pkey" PRIMARY KEY (id);

ALTER TABLE "alert_print_articles" ADD CONSTRAINT "alert_print_articles_pkey" PRIMARY KEY (alert_id, print_article_id);

ALTER TABLE "alerts" ADD CONSTRAINT "alerts_pkey" PRIMARY KEY (id);

ALTER TABLE "apify_usage_ledger" ADD CONSTRAINT "apify_usage_ledger_pkey" PRIMARY KEY (id);

ALTER TABLE "article_alerts" ADD CONSTRAINT "article_alerts_pkey" PRIMARY KEY (id);

ALTER TABLE "article_entities" ADD CONSTRAINT "article_entities_pkey" PRIMARY KEY (id);

ALTER TABLE "article_manual_keywords" ADD CONSTRAINT "article_manual_keywords_pkey" PRIMARY KEY (article_id, keyword_id);

ALTER TABLE "article_opd" ADD CONSTRAINT "article_opd_pkey" PRIMARY KEY (article_id, opd_id);

ALTER TABLE "article_uptd" ADD CONSTRAINT "article_uptd_pkey" PRIMARY KEY (article_id, uptd_id);

ALTER TABLE "articles" ADD CONSTRAINT "articles_pkey" PRIMARY KEY (id);

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id);

ALTER TABLE "classification_sectors" ADD CONSTRAINT "classification_sectors_pkey" PRIMARY KEY (id);

ALTER TABLE "collection_scheduler_config" ADD CONSTRAINT "collection_scheduler_config_pkey" PRIMARY KEY (id);

ALTER TABLE "collection_scheduler_runs" ADD CONSTRAINT "collection_scheduler_runs_pkey" PRIMARY KEY (id);

ALTER TABLE "communication_strategies" ADD CONSTRAINT "communication_strategies_pkey" PRIMARY KEY (id);

ALTER TABLE "communication_strategy_districts" ADD CONSTRAINT "communication_strategy_districts_pkey" PRIMARY KEY (id);

ALTER TABLE "content_project_items" ADD CONSTRAINT "content_project_items_pkey" PRIMARY KEY (id);

ALTER TABLE "content_project_sources" ADD CONSTRAINT "content_project_sources_pkey" PRIMARY KEY (id);

ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_pkey" PRIMARY KEY (id);

ALTER TABLE "daily_intelligence_runs" ADD CONSTRAINT "daily_intelligence_runs_pkey" PRIMARY KEY (id);

ALTER TABLE "districts" ADD CONSTRAINT "districts_pkey" PRIMARY KEY (id);

ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_pkey" PRIMARY KEY (id);

ALTER TABLE "executive_brief_daily_cache" ADD CONSTRAINT "executive_brief_daily_cache_pkey" PRIMARY KEY (brief_date, scope_key);

ALTER TABLE "executive_brief_schedule_settings" ADD CONSTRAINT "executive_brief_schedule_settings_pkey" PRIMARY KEY (id);

ALTER TABLE "government_branding" ADD CONSTRAINT "government_branding_pkey" PRIMARY KEY (id);

ALTER TABLE "government_officials" ADD CONSTRAINT "government_officials_pkey" PRIMARY KEY (id);

ALTER TABLE "incident_decisions" ADD CONSTRAINT "incident_decisions_pkey" PRIMARY KEY (id);

ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_pkey" PRIMARY KEY (id);

ALTER TABLE "incident_tasks" ADD CONSTRAINT "incident_tasks_pkey" PRIMARY KEY (id);

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_pkey" PRIMARY KEY (id);

ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY (id);

ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_pkey" PRIMARY KEY (id);

ALTER TABLE "integration_providers" ADD CONSTRAINT "integration_providers_pkey" PRIMARY KEY (id);

ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_articles" ADD CONSTRAINT "issue_articles_pkey" PRIMARY KEY (issue_id, article_id);

ALTER TABLE "issue_communication_gap_snapshots" ADD CONSTRAINT "issue_communication_gap_snapshots_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_contributor_clarification_rounds" ADD CONSTRAINT "issue_contributor_clarification_rounds_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_contributor_submissions" ADD CONSTRAINT "issue_contributor_submissions_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_districts" ADD CONSTRAINT "issue_districts_pkey" PRIMARY KEY (issue_id, district_id);

ALTER TABLE "issue_keywords" ADD CONSTRAINT "issue_keywords_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_linkage_h1_batches" ADD CONSTRAINT "issue_linkage_h1_batches_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_linkage_h1_evidence_ledger" ADD CONSTRAINT "issue_linkage_h1_evidence_ledger_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_metrics" ADD CONSTRAINT "issue_metrics_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_monitor_sources" ADD CONSTRAINT "issue_monitor_sources_pkey" PRIMARY KEY (monitor_id, source_type);

ALTER TABLE "issue_monitor_terms" ADD CONSTRAINT "issue_monitor_terms_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_monitoring_analysis_snapshots" ADD CONSTRAINT "issue_monitoring_analysis_snapshots_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_monitors" ADD CONSTRAINT "issue_monitors_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_opd" ADD CONSTRAINT "issue_opd_pkey" PRIMARY KEY (issue_id, opd_id);

ALTER TABLE "issue_print_articles" ADD CONSTRAINT "issue_print_articles_pkey" PRIMARY KEY (issue_id, print_article_id);

ALTER TABLE "issue_publication_analysis_snapshots" ADD CONSTRAINT "issue_publication_analysis_snapshots_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_publication_evidence" ADD CONSTRAINT "issue_publication_evidence_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_publication_evidence_files" ADD CONSTRAINT "issue_publication_evidence_files_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_response_submissions" ADD CONSTRAINT "issue_response_submissions_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_workflow_contributors" ADD CONSTRAINT "issue_workflow_contributors_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_workflow_events" ADD CONSTRAINT "issue_workflow_events_pkey" PRIMARY KEY (id);

ALTER TABLE "issue_workflow_supporting_opd" ADD CONSTRAINT "issue_workflow_supporting_opd_pkey" PRIMARY KEY (workflow_id, opd_id);

ALTER TABLE "issue_workflows" ADD CONSTRAINT "issue_workflows_pkey" PRIMARY KEY (id);

ALTER TABLE "issues" ADD CONSTRAINT "issues_pkey" PRIMARY KEY (id);

ALTER TABLE "keyword_district" ADD CONSTRAINT "keyword_district_pkey" PRIMARY KEY (keyword_id, district_id);

ALTER TABLE "keyword_groups" ADD CONSTRAINT "keyword_groups_pkey" PRIMARY KEY (id);

ALTER TABLE "keyword_opd" ADD CONSTRAINT "keyword_opd_pkey" PRIMARY KEY (keyword_id, opd_id);

ALTER TABLE "keyword_taxonomy" ADD CONSTRAINT "keyword_taxonomy_pkey" PRIMARY KEY (keyword_id, category_id);

ALTER TABLE "keywords" ADD CONSTRAINT "keywords_pkey" PRIMARY KEY (id);

ALTER TABLE "locations" ADD CONSTRAINT "locations_pkey" PRIMARY KEY (id);

ALTER TABLE "media_scans" ADD CONSTRAINT "media_scans_pkey" PRIMARY KEY (id);

ALTER TABLE "media_sources" ADD CONSTRAINT "media_sources_pkey" PRIMARY KEY (id);

ALTER TABLE "narratives" ADD CONSTRAINT "narratives_pkey" PRIMARY KEY (id);

ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_pkey" PRIMARY KEY (id);

ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY (id);

ALTER TABLE "notification_link_tokens" ADD CONSTRAINT "notification_link_tokens_pkey" PRIMARY KEY (id);

ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_pkey" PRIMARY KEY (id);

ALTER TABLE "online_story_cluster_members" ADD CONSTRAINT "online_story_cluster_members_pkey" PRIMARY KEY (cluster_id, article_id);

ALTER TABLE "online_story_clusters" ADD CONSTRAINT "online_story_clusters_pkey" PRIMARY KEY (id);

ALTER TABLE "opd" ADD CONSTRAINT "opd_pkey" PRIMARY KEY (id);

ALTER TABLE "organization_area_aliases" ADD CONSTRAINT "organization_area_aliases_pkey" PRIMARY KEY (id);

ALTER TABLE "organization_map_boundaries" ADD CONSTRAINT "organization_map_boundaries_pkey" PRIMARY KEY (id);

ALTER TABLE "organization_map_boundary_features" ADD CONSTRAINT "organization_map_boundary_features_pkey" PRIMARY KEY (id);

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_pkey" PRIMARY KEY (id);

ALTER TABLE "owned_content_cluster_members" ADD CONSTRAINT "owned_content_cluster_members_pkey" PRIMARY KEY (cluster_id, mention_id);

ALTER TABLE "owned_content_clusters" ADD CONSTRAINT "owned_content_clusters_pkey" PRIMARY KEY (id);

ALTER TABLE "owned_social_account_metrics" ADD CONSTRAINT "owned_social_account_metrics_pkey" PRIMARY KEY (id);

ALTER TABLE "owned_social_accounts" ADD CONSTRAINT "owned_social_accounts_pkey" PRIMARY KEY (id);

ALTER TABLE "password_reset_email_tokens" ADD CONSTRAINT "password_reset_email_tokens_pkey" PRIMARY KEY (id);

ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY (id);

ALTER TABLE "permissions" ADD CONSTRAINT "permissions_pkey" PRIMARY KEY (id);

ALTER TABLE "print_article_keywords" ADD CONSTRAINT "print_article_keywords_pkey" PRIMARY KEY (id);

ALTER TABLE "print_article_pages" ADD CONSTRAINT "print_article_pages_pkey" PRIMARY KEY (article_id, page_id);

ALTER TABLE "print_articles" ADD CONSTRAINT "print_articles_pkey" PRIMARY KEY (id);

ALTER TABLE "print_clippings" ADD CONSTRAINT "print_clippings_pkey" PRIMARY KEY (id);

ALTER TABLE "print_editions" ADD CONSTRAINT "print_editions_pkey" PRIMARY KEY (id);

ALTER TABLE "print_ocr_results" ADD CONSTRAINT "print_ocr_results_pkey" PRIMARY KEY (id);

ALTER TABLE "print_pages" ADD CONSTRAINT "print_pages_pkey" PRIMARY KEY (id);

ALTER TABLE "print_upload_files" ADD CONSTRAINT "print_upload_files_pkey" PRIMARY KEY (id);

ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY (id);

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY (role_id, permission_id);

ALTER TABLE "roles" ADD CONSTRAINT "roles_pkey" PRIMARY KEY (id);

ALTER TABLE "schema_migrations" ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY (version);

ALTER TABLE "social_conversation_cluster_members" ADD CONSTRAINT "social_conversation_cluster_members_pkey" PRIMARY KEY (cluster_id, mention_id);

ALTER TABLE "social_conversation_clusters" ADD CONSTRAINT "social_conversation_clusters_pkey" PRIMARY KEY (id);

ALTER TABLE "social_conversation_manual_exclusions" ADD CONSTRAINT "social_conversation_manual_exclusions_pkey" PRIMARY KEY (mention_id);

ALTER TABLE "social_mention_issues" ADD CONSTRAINT "social_mention_issues_pkey" PRIMARY KEY (mention_id, issue_id);

ALTER TABLE "social_mention_keywords" ADD CONSTRAINT "social_mention_keywords_pkey" PRIMARY KEY (mention_id, keyword_id);

ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_pkey" PRIMARY KEY (id);

ALTER TABLE "social_post_metrics" ADD CONSTRAINT "social_post_metrics_pkey" PRIMARY KEY (id);

ALTER TABLE "taxonomy_categories" ADD CONSTRAINT "taxonomy_categories_pkey" PRIMARY KEY (id);

ALTER TABLE "unified_candidate_issues" ADD CONSTRAINT "unified_candidate_issues_pkey" PRIMARY KEY (id);

ALTER TABLE "uptd" ADD CONSTRAINT "uptd_pkey" PRIMARY KEY (id);

ALTER TABLE "user_notification_channels" ADD CONSTRAINT "user_notification_channels_pkey" PRIMARY KEY (id);

ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);

ALTER TABLE "viewer_display_devices" ADD CONSTRAINT "viewer_display_devices_pkey" PRIMARY KEY (id);

ALTER TABLE "villages" ADD CONSTRAINT "villages_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_budget_reservations" ADD CONSTRAINT "ai_budget_reservations_request_key_key" UNIQUE (request_key);

ALTER TABLE "ai_humas_task_prompt_history" ADD CONSTRAINT "ai_humas_task_prompt_history_task_code_version_key" UNIQUE (task_code, version);

ALTER TABLE "ai_model_prices" ADD CONSTRAINT "ai_model_prices_model_id_effective_from_key" UNIQUE (model_id, effective_from);

ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_id_code_key" UNIQUE (provider_id, code);

ALTER TABLE "ai_provider_budgets" ADD CONSTRAINT "ai_provider_budgets_provider_id_period_start_period_end_key" UNIQUE (provider_id, period_start, period_end);

ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_code_key" UNIQUE (code);

ALTER TABLE "ai_task_routes" ADD CONSTRAINT "ai_task_routes_task_id_priority_key" UNIQUE (task_id, priority);

ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_code_key" UNIQUE (code);

ALTER TABLE "apify_usage_ledger" ADD CONSTRAINT "apify_usage_ledger_reservation_key_key" UNIQUE (reservation_key);

ALTER TABLE "apify_usage_ledger" ADD CONSTRAINT "apify_usage_ledger_run_id_key" UNIQUE (run_id);

ALTER TABLE "article_alerts" ADD CONSTRAINT "article_alerts_article_id_alert_type_key" UNIQUE (article_id, alert_type);

ALTER TABLE "articles" ADD CONSTRAINT "articles_url_key" UNIQUE (url);

ALTER TABLE "classification_sectors" ADD CONSTRAINT "classification_sectors_org_code_key" UNIQUE (organization_id, code);

ALTER TABLE "classification_sectors" ADD CONSTRAINT "classification_sectors_org_name_key" UNIQUE (organization_id, name);

ALTER TABLE "communication_strategies" ADD CONSTRAINT "communication_strategies_workflow_id_version_key" UNIQUE (workflow_id, version);

ALTER TABLE "communication_strategy_districts" ADD CONSTRAINT "communication_strategy_districts_strategy_id_district_id_key" UNIQUE (strategy_id, district_id);

ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_workflow_id_strategy_id_key" UNIQUE (workflow_id, strategy_id);

ALTER TABLE "daily_intelligence_runs" ADD CONSTRAINT "daily_intelligence_runs_run_date_opd_id_key" UNIQUE (run_date, opd_id);

ALTER TABLE "districts" ADD CONSTRAINT "districts_organization_id_name_key" UNIQUE (organization_id, name);

ALTER TABLE "government_officials" ADD CONSTRAINT "government_officials_role_code_key" UNIQUE (role_code);

ALTER TABLE "incident_tasks" ADD CONSTRAINT "incident_tasks_incident_id_task_key_key" UNIQUE (incident_id, task_key);

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_incident_key_key" UNIQUE (incident_key);

ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_organization_id_provider_id_key" UNIQUE (organization_id, provider_id);

ALTER TABLE "integration_providers" ADD CONSTRAINT "integration_providers_code_key" UNIQUE (code);

ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_organization_id_provider_id_key" UNIQUE (organization_id, provider_id);

ALTER TABLE "issue_communication_gap_snapshots" ADD CONSTRAINT "issue_communication_gap_snapshots_workflow_uq" UNIQUE (workflow_id);

ALTER TABLE "issue_contributor_clarification_rounds" ADD CONSTRAINT "issue_contributor_clarificati_contributor_assignment_id_rou_key" UNIQUE (contributor_assignment_id, round_number);

ALTER TABLE "issue_keywords" ADD CONSTRAINT "issue_keywords_unique_keyword" UNIQUE (issue_id, keyword_id);

ALTER TABLE "issue_linkage_h1_batches" ADD CONSTRAINT "issue_linkage_h1_batches_organization_id_news_date_fingerpr_key" UNIQUE (organization_id, news_date, fingerprint);

ALTER TABLE "issue_linkage_h1_evidence_ledger" ADD CONSTRAINT "issue_linkage_h1_evidence_led_organization_id_news_date_sou_key" UNIQUE (organization_id, news_date, source_type, source_id);

ALTER TABLE "issue_monitor_terms" ADD CONSTRAINT "issue_monitor_terms_monitor_id_term_key" UNIQUE (monitor_id, term);

ALTER TABLE "issue_monitoring_analysis_snapshots" ADD CONSTRAINT "issue_monitoring_analysis_snapshots_workflow_period_uq" UNIQUE (workflow_id, period_number);

ALTER TABLE "issue_publication_analysis_snapshots" ADD CONSTRAINT "issue_publication_analysis_snapshots_workflow_uq" UNIQUE (workflow_id);

ALTER TABLE "issue_publication_evidence_files" ADD CONSTRAINT "issue_publication_evidence_files_evidence_id_file_order_key" UNIQUE (evidence_id, file_order);

ALTER TABLE "issue_response_submissions" ADD CONSTRAINT "issue_response_submissions_workflow_opd_version_uq" UNIQUE (workflow_id, opd_id, version);

ALTER TABLE "issue_workflows" ADD CONSTRAINT "issue_workflows_issue_cycle_uq" UNIQUE (issue_id, cycle_number);

ALTER TABLE "issues" ADD CONSTRAINT "issues_organization_id_issue_key_key" UNIQUE (organization_id, issue_key);

ALTER TABLE "keyword_groups" ADD CONSTRAINT "keyword_groups_organization_id_name_key" UNIQUE (organization_id, name);

ALTER TABLE "keywords" ADD CONSTRAINT "keywords_opd_id_keyword_key" UNIQUE (opd_id, keyword);

ALTER TABLE "media_sources" ADD CONSTRAINT "media_sources_name_key" UNIQUE (name);

ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_code_key" UNIQUE (code);

ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_workflow_event_id_user_id_channel_key" UNIQUE (workflow_event_id, user_id, channel);

ALTER TABLE "notification_link_tokens" ADD CONSTRAINT "notification_link_tokens_token_hash_key" UNIQUE (token_hash);

ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_event_type_key" UNIQUE (event_type);

ALTER TABLE "online_story_cluster_members" ADD CONSTRAINT "online_story_cluster_members_article_id_key" UNIQUE (article_id);

ALTER TABLE "opd" ADD CONSTRAINT "opd_code_key" UNIQUE (code);

ALTER TABLE "opd" ADD CONSTRAINT "opd_name_key" UNIQUE (name);

ALTER TABLE "organization_area_aliases" ADD CONSTRAINT "organization_area_aliases_organization_id_name_key" UNIQUE (organization_id, name);

ALTER TABLE "organization_map_boundary_features" ADD CONSTRAINT "organization_map_boundary_features_boundary_id_feature_key_key" UNIQUE (boundary_id, feature_key);

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_code_key" UNIQUE (code);

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_name_key" UNIQUE (name);

ALTER TABLE "owned_content_cluster_members" ADD CONSTRAINT "owned_content_cluster_members_mention_id_key" UNIQUE (mention_id);

ALTER TABLE "owned_social_account_metrics" ADD CONSTRAINT "owned_social_account_metrics_account_id_measured_at_data_sc_key" UNIQUE (account_id, measured_at, data_scope);

ALTER TABLE "password_reset_email_tokens" ADD CONSTRAINT "password_reset_email_tokens_token_hash_key" UNIQUE (token_hash);

ALTER TABLE "permissions" ADD CONSTRAINT "permissions_code_key" UNIQUE (code);

ALTER TABLE "print_article_pages" ADD CONSTRAINT "print_article_pages_article_id_sequence_no_key" UNIQUE (article_id, sequence_no);

ALTER TABLE "print_pages" ADD CONSTRAINT "print_pages_edition_id_page_number_key" UNIQUE (edition_id, page_number);

ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_token_hash_key" UNIQUE (token_hash);

ALTER TABLE "roles" ADD CONSTRAINT "roles_code_key" UNIQUE (code);

ALTER TABLE "social_conversation_cluster_members" ADD CONSTRAINT "social_conversation_cluster_members_mention_id_key" UNIQUE (mention_id);

ALTER TABLE "social_post_metrics" ADD CONSTRAINT "social_post_metrics_mention_id_measured_at_key" UNIQUE (mention_id, measured_at);

ALTER TABLE "taxonomy_categories" ADD CONSTRAINT "taxonomy_categories_code_key" UNIQUE (code);

ALTER TABLE "taxonomy_categories" ADD CONSTRAINT "taxonomy_categories_name_key" UNIQUE (name);

ALTER TABLE "unified_candidate_issues" ADD CONSTRAINT "unified_candidate_issues_organization_id_candidate_key_key" UNIQUE (organization_id, candidate_key);

ALTER TABLE "user_notification_channels" ADD CONSTRAINT "user_notification_channels_channel_external_user_id_key" UNIQUE (channel, external_user_id);

ALTER TABLE "user_notification_channels" ADD CONSTRAINT "user_notification_channels_user_id_channel_key" UNIQUE (user_id, channel);

ALTER TABLE "users" ADD CONSTRAINT "users_email_key" UNIQUE (email);

ALTER TABLE "viewer_display_devices" ADD CONSTRAINT "viewer_display_devices_token_hash_key" UNIQUE (token_hash);

ALTER TABLE "villages" ADD CONSTRAINT "villages_district_id_name_key" UNIQUE (district_id, name);

ALTER TABLE "ai_budget_reservations" ADD CONSTRAINT "ai_budget_reservations_budget_id_fkey" FOREIGN KEY (budget_id) REFERENCES ai_provider_budgets(id);

ALTER TABLE "ai_budget_reservations" ADD CONSTRAINT "ai_budget_reservations_task_id_fkey" FOREIGN KEY (task_id) REFERENCES ai_tasks(id);

ALTER TABLE "ai_free_tier_daily_limits" ADD CONSTRAINT "ai_free_tier_daily_limits_model_id_fkey" FOREIGN KEY (model_id) REFERENCES ai_models(id) ON DELETE CASCADE;

ALTER TABLE "ai_free_tier_daily_usage" ADD CONSTRAINT "ai_free_tier_daily_usage_model_id_fkey" FOREIGN KEY (model_id) REFERENCES ai_models(id) ON DELETE CASCADE;

ALTER TABLE "ai_gemini_quota_feature_audit" ADD CONSTRAINT "ai_gemini_quota_feature_audit_model_id_fkey" FOREIGN KEY (model_id) REFERENCES ai_models(id) ON DELETE CASCADE;

ALTER TABLE "ai_humas_model_selections" ADD CONSTRAINT "ai_humas_model_selections_model_id_fkey" FOREIGN KEY (model_id) REFERENCES ai_models(id);

ALTER TABLE "ai_humas_model_selections" ADD CONSTRAINT "ai_humas_model_selections_task_code_fkey" FOREIGN KEY (task_code) REFERENCES ai_tasks(code) ON UPDATE CASCADE;

ALTER TABLE "ai_humas_task_prompt_history" ADD CONSTRAINT "ai_humas_task_prompt_history_task_code_fkey" FOREIGN KEY (task_code) REFERENCES ai_humas_task_prompts(task_code);

ALTER TABLE "ai_humas_task_prompts" ADD CONSTRAINT "ai_humas_task_prompts_task_code_fkey" FOREIGN KEY (task_code) REFERENCES ai_tasks(code) ON UPDATE CASCADE;

ALTER TABLE "ai_model_prices" ADD CONSTRAINT "ai_model_prices_model_id_fkey" FOREIGN KEY (model_id) REFERENCES ai_models(id);

ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE RESTRICT;

ALTER TABLE "ai_provider_balance_snapshots" ADD CONSTRAINT "ai_provider_balance_snapshots_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES ai_providers(id);

ALTER TABLE "ai_provider_budgets" ADD CONSTRAINT "ai_provider_budgets_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES ai_providers(id);

ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE;

ALTER TABLE "ai_task_routes" ADD CONSTRAINT "ai_task_routes_model_id_fkey" FOREIGN KEY (model_id) REFERENCES ai_models(id) ON DELETE RESTRICT;

ALTER TABLE "ai_task_routes" ADD CONSTRAINT "ai_task_routes_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE RESTRICT;

ALTER TABLE "ai_task_routes" ADD CONSTRAINT "ai_task_routes_task_id_fkey" FOREIGN KEY (task_id) REFERENCES ai_tasks(id) ON DELETE CASCADE;

ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_model_id_fkey" FOREIGN KEY (model_id) REFERENCES ai_models(id) ON DELETE SET NULL;

ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE SET NULL;

ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_task_id_fkey" FOREIGN KEY (task_id) REFERENCES ai_tasks(id) ON DELETE SET NULL;

ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_fkey" FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE;

ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "alert_print_articles" ADD CONSTRAINT "alert_print_articles_alert_id_fkey" FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE;

ALTER TABLE "alert_print_articles" ADD CONSTRAINT "alert_print_articles_print_article_id_fkey" FOREIGN KEY (print_article_id) REFERENCES print_articles(id) ON DELETE CASCADE;

ALTER TABLE "alerts" ADD CONSTRAINT "alerts_article_id_fkey" FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

ALTER TABLE "alerts" ADD CONSTRAINT "alerts_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "alerts" ADD CONSTRAINT "alerts_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE SET NULL;

ALTER TABLE "alerts" ADD CONSTRAINT "alerts_social_mention_id_fkey" FOREIGN KEY (social_mention_id) REFERENCES social_mentions(id) ON DELETE SET NULL;

ALTER TABLE "article_alerts" ADD CONSTRAINT "article_alerts_article_id_fkey" FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

ALTER TABLE "article_entities" ADD CONSTRAINT "article_entities_article_id_fkey" FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

ALTER TABLE "article_manual_keywords" ADD CONSTRAINT "article_manual_keywords_article_id_fkey" FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

ALTER TABLE "article_manual_keywords" ADD CONSTRAINT "article_manual_keywords_keyword_id_fkey" FOREIGN KEY (keyword_id) REFERENCES keywords(id);

ALTER TABLE "article_manual_keywords" ADD CONSTRAINT "article_manual_keywords_selected_by_fkey" FOREIGN KEY (selected_by) REFERENCES users(id);

ALTER TABLE "article_opd" ADD CONSTRAINT "article_opd_article_id_fkey" FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

ALTER TABLE "article_opd" ADD CONSTRAINT "article_opd_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE CASCADE;

ALTER TABLE "article_uptd" ADD CONSTRAINT "article_uptd_article_id_fkey" FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

ALTER TABLE "article_uptd" ADD CONSTRAINT "article_uptd_uptd_id_fkey" FOREIGN KEY (uptd_id) REFERENCES uptd(id) ON DELETE CASCADE;

ALTER TABLE "articles" ADD CONSTRAINT "articles_district_id_fkey" FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL;

ALTER TABLE "articles" ADD CONSTRAINT "articles_news_classification_changed_by_fkey" FOREIGN KEY (news_classification_changed_by) REFERENCES users(id);

ALTER TABLE "articles" ADD CONSTRAINT "articles_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE SET NULL;

ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_fkey" FOREIGN KEY (source_id) REFERENCES media_sources(id) ON DELETE SET NULL;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "classification_sectors" ADD CONSTRAINT "classification_sectors_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "communication_strategies" ADD CONSTRAINT "communication_strategies_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "communication_strategies" ADD CONSTRAINT "communication_strategies_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "communication_strategies" ADD CONSTRAINT "communication_strategies_generated_by_fkey" FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "communication_strategies" ADD CONSTRAINT "communication_strategies_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE RESTRICT;

ALTER TABLE "communication_strategies" ADD CONSTRAINT "communication_strategies_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "communication_strategies" ADD CONSTRAINT "communication_strategies_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "communication_strategies" ADD CONSTRAINT "communication_strategies_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES issue_workflows(id) ON DELETE RESTRICT;

ALTER TABLE "communication_strategy_districts" ADD CONSTRAINT "communication_strategy_districts_district_id_fkey" FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT;

ALTER TABLE "communication_strategy_districts" ADD CONSTRAINT "communication_strategy_districts_strategy_id_fkey" FOREIGN KEY (strategy_id) REFERENCES communication_strategies(id) ON DELETE CASCADE;

ALTER TABLE "communication_strategy_districts" ADD CONSTRAINT "communication_strategy_districts_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES issue_workflows(id) ON DELETE RESTRICT;

ALTER TABLE "content_project_items" ADD CONSTRAINT "content_project_items_project_id_fkey" FOREIGN KEY (project_id) REFERENCES content_projects(id) ON DELETE CASCADE;

ALTER TABLE "content_project_sources" ADD CONSTRAINT "content_project_sources_item_id_fkey" FOREIGN KEY (item_id) REFERENCES content_project_items(id) ON DELETE CASCADE;

ALTER TABLE "content_project_sources" ADD CONSTRAINT "content_project_sources_project_id_fkey" FOREIGN KEY (project_id) REFERENCES content_projects(id) ON DELETE CASCADE;

ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_strategy_id_fkey" FOREIGN KEY (strategy_id) REFERENCES communication_strategies(id) ON DELETE RESTRICT;

ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;

ALTER TABLE "daily_intelligence_runs" ADD CONSTRAINT "daily_intelligence_runs_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE CASCADE;

ALTER TABLE "districts" ADD CONSTRAINT "districts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_article_id_fkey" FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_media_scan_id_fkey" FOREIGN KEY (media_scan_id) REFERENCES media_scans(id) ON DELETE CASCADE;

ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_print_article_id_fkey" FOREIGN KEY (print_article_id) REFERENCES print_articles(id) ON DELETE CASCADE;

ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_social_mention_id_fkey" FOREIGN KEY (social_mention_id) REFERENCES social_mentions(id) ON DELETE CASCADE;

ALTER TABLE "government_branding" ADD CONSTRAINT "government_branding_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "government_officials" ADD CONSTRAINT "government_officials_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "incident_decisions" ADD CONSTRAINT "incident_decisions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "incident_decisions" ADD CONSTRAINT "incident_decisions_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;

ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;

ALTER TABLE "incident_tasks" ADD CONSTRAINT "incident_tasks_completed_by_fkey" FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "incident_tasks" ADD CONSTRAINT "incident_tasks_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_command_owner_id_fkey" FOREIGN KEY (command_owner_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE SET NULL;

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_signal_article_id_fkey" FOREIGN KEY (signal_article_id) REFERENCES articles(id) ON DELETE SET NULL;

ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES integration_providers(id) ON DELETE CASCADE;

ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES integration_providers(id) ON DELETE CASCADE;

ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_articles" ADD CONSTRAINT "issue_articles_article_id_fkey" FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

ALTER TABLE "issue_articles" ADD CONSTRAINT "issue_articles_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_communication_gap_snapshots" ADD CONSTRAINT "issue_communication_gap_snapshots_analyzed_by_fkey" FOREIGN KEY (analyzed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_communication_gap_snapshots" ADD CONSTRAINT "issue_communication_gap_snapshots_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_communication_gap_snapshots" ADD CONSTRAINT "issue_communication_gap_snapshots_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "issue_communication_gap_snapshots" ADD CONSTRAINT "issue_communication_gap_snapshots_workflow_fkey" FOREIGN KEY (workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;

ALTER TABLE "issue_contributor_clarification_rounds" ADD CONSTRAINT "issue_contributor_clarification__contributor_assignment_id_fkey" FOREIGN KEY (contributor_assignment_id) REFERENCES issue_workflow_contributors(id) ON DELETE RESTRICT;

ALTER TABLE "issue_contributor_clarification_rounds" ADD CONSTRAINT "issue_contributor_clarification_rounds_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_contributor_clarification_rounds" ADD CONSTRAINT "issue_contributor_clarification_rounds_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_contributor_clarification_rounds" ADD CONSTRAINT "issue_contributor_clarification_rounds_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES issue_contributor_submissions(id) ON DELETE RESTRICT;

ALTER TABLE "issue_contributor_submissions" ADD CONSTRAINT "issue_contributor_submissions_contributor_assignment_id_fkey" FOREIGN KEY (contributor_assignment_id) REFERENCES issue_workflow_contributors(id) ON DELETE CASCADE;

ALTER TABLE "issue_contributor_submissions" ADD CONSTRAINT "issue_contributor_submissions_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_districts" ADD CONSTRAINT "issue_districts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_districts" ADD CONSTRAINT "issue_districts_district_id_fkey" FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT;

ALTER TABLE "issue_districts" ADD CONSTRAINT "issue_districts_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_keywords" ADD CONSTRAINT "issue_keywords_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_keywords" ADD CONSTRAINT "issue_keywords_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_keywords" ADD CONSTRAINT "issue_keywords_keyword_id_fkey" FOREIGN KEY (keyword_id) REFERENCES keywords(id);

ALTER TABLE "issue_linkage_h1_evidence_ledger" ADD CONSTRAINT "issue_linkage_h1_evidence_ledger_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES issue_linkage_h1_batches(id);

ALTER TABLE "issue_metrics" ADD CONSTRAINT "issue_metrics_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_monitor_sources" ADD CONSTRAINT "issue_monitor_sources_monitor_id_fkey" FOREIGN KEY (monitor_id) REFERENCES issue_monitors(id) ON DELETE CASCADE;

ALTER TABLE "issue_monitor_terms" ADD CONSTRAINT "issue_monitor_terms_monitor_id_fkey" FOREIGN KEY (monitor_id) REFERENCES issue_monitors(id) ON DELETE CASCADE;

ALTER TABLE "issue_monitoring_analysis_snapshots" ADD CONSTRAINT "issue_monitoring_analysis_snapshots_analyzed_by_fkey" FOREIGN KEY (analyzed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_monitoring_analysis_snapshots" ADD CONSTRAINT "issue_monitoring_analysis_snapshots_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_monitoring_analysis_snapshots" ADD CONSTRAINT "issue_monitoring_analysis_snapshots_workflow_fkey" FOREIGN KEY (workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;

ALTER TABLE "issue_monitors" ADD CONSTRAINT "issue_monitors_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE "issue_monitors" ADD CONSTRAINT "issue_monitors_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_monitors" ADD CONSTRAINT "issue_monitors_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE "issue_opd" ADD CONSTRAINT "issue_opd_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_opd" ADD CONSTRAINT "issue_opd_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE CASCADE;

ALTER TABLE "issue_print_articles" ADD CONSTRAINT "issue_print_articles_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_print_articles" ADD CONSTRAINT "issue_print_articles_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_print_articles" ADD CONSTRAINT "issue_print_articles_print_article_id_fkey" FOREIGN KEY (print_article_id) REFERENCES print_articles(id) ON DELETE CASCADE;

ALTER TABLE "issue_publication_analysis_snapshots" ADD CONSTRAINT "issue_publication_analysis_snapshots_analyzed_by_fkey" FOREIGN KEY (analyzed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_publication_analysis_snapshots" ADD CONSTRAINT "issue_publication_analysis_snapshots_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_publication_analysis_snapshots" ADD CONSTRAINT "issue_publication_analysis_snapshots_workflow_fkey" FOREIGN KEY (workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;

ALTER TABLE "issue_publication_evidence" ADD CONSTRAINT "issue_publication_evidence_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_publication_evidence" ADD CONSTRAINT "issue_publication_evidence_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_publication_evidence" ADD CONSTRAINT "issue_publication_evidence_workflow_fkey" FOREIGN KEY (workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;

ALTER TABLE "issue_publication_evidence_files" ADD CONSTRAINT "issue_publication_evidence_files_evidence_id_fkey" FOREIGN KEY (evidence_id) REFERENCES issue_publication_evidence(id) ON DELETE CASCADE;

ALTER TABLE "issue_response_submissions" ADD CONSTRAINT "issue_response_submissions_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_response_submissions" ADD CONSTRAINT "issue_response_submissions_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE RESTRICT;

ALTER TABLE "issue_response_submissions" ADD CONSTRAINT "issue_response_submissions_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_response_submissions" ADD CONSTRAINT "issue_response_submissions_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE "issue_response_submissions" ADD CONSTRAINT "issue_response_submissions_workflow_fkey" FOREIGN KEY (workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;

ALTER TABLE "issue_workflow_contributors" ADD CONSTRAINT "issue_workflow_contributors_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_workflow_contributors" ADD CONSTRAINT "issue_workflow_contributors_district_id_fkey" FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT;

ALTER TABLE "issue_workflow_contributors" ADD CONSTRAINT "issue_workflow_contributors_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_workflow_contributors" ADD CONSTRAINT "issue_workflow_contributors_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE RESTRICT;

ALTER TABLE "issue_workflow_contributors" ADD CONSTRAINT "issue_workflow_contributors_uptd_id_fkey" FOREIGN KEY (uptd_id) REFERENCES uptd(id) ON DELETE RESTRICT;

ALTER TABLE "issue_workflow_contributors" ADD CONSTRAINT "issue_workflow_contributors_workflow_fkey" FOREIGN KEY (workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;

ALTER TABLE "issue_workflow_events" ADD CONSTRAINT "issue_workflow_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_workflow_events" ADD CONSTRAINT "issue_workflow_events_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_workflow_events" ADD CONSTRAINT "issue_workflow_events_workflow_fkey" FOREIGN KEY (workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;

ALTER TABLE "issue_workflow_supporting_opd" ADD CONSTRAINT "issue_workflow_supporting_opd_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_workflow_supporting_opd" ADD CONSTRAINT "issue_workflow_supporting_opd_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_workflow_supporting_opd" ADD CONSTRAINT "issue_workflow_supporting_opd_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE CASCADE;

ALTER TABLE "issue_workflow_supporting_opd" ADD CONSTRAINT "issue_workflow_supporting_opd_workflow_fkey" FOREIGN KEY (workflow_id) REFERENCES issue_workflows(id) ON DELETE CASCADE;

ALTER TABLE "issue_workflows" ADD CONSTRAINT "issue_workflows_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_workflows" ADD CONSTRAINT "issue_workflows_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_workflows" ADD CONSTRAINT "issue_workflows_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "issue_workflows" ADD CONSTRAINT "issue_workflows_lead_opd_id_fkey" FOREIGN KEY (lead_opd_id) REFERENCES opd(id) ON DELETE SET NULL;

ALTER TABLE "issue_workflows" ADD CONSTRAINT "issue_workflows_publication_evidence_saved_by_fkey" FOREIGN KEY (publication_evidence_saved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issue_workflows" ADD CONSTRAINT "issue_workflows_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "issues" ADD CONSTRAINT "issues_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "issues" ADD CONSTRAINT "issues_taxonomy_category_id_fkey" FOREIGN KEY (taxonomy_category_id) REFERENCES taxonomy_categories(id) ON DELETE SET NULL;

ALTER TABLE "keyword_district" ADD CONSTRAINT "keyword_district_district_id_fkey" FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE;

ALTER TABLE "keyword_district" ADD CONSTRAINT "keyword_district_keyword_id_fkey" FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE;

ALTER TABLE "keyword_groups" ADD CONSTRAINT "keyword_groups_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "keyword_opd" ADD CONSTRAINT "keyword_opd_keyword_id_fkey" FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE;

ALTER TABLE "keyword_opd" ADD CONSTRAINT "keyword_opd_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE CASCADE;

ALTER TABLE "keyword_taxonomy" ADD CONSTRAINT "keyword_taxonomy_category_id_fkey" FOREIGN KEY (category_id) REFERENCES taxonomy_categories(id) ON DELETE CASCADE;

ALTER TABLE "keyword_taxonomy" ADD CONSTRAINT "keyword_taxonomy_keyword_id_fkey" FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE;

ALTER TABLE "keywords" ADD CONSTRAINT "keywords_district_id_fkey" FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE;

ALTER TABLE "keywords" ADD CONSTRAINT "keywords_group_id_fkey" FOREIGN KEY (group_id) REFERENCES keyword_groups(id) ON DELETE SET NULL;

ALTER TABLE "keywords" ADD CONSTRAINT "keywords_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE CASCADE;

ALTER TABLE "keywords" ADD CONSTRAINT "keywords_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "locations" ADD CONSTRAINT "locations_district_id_fkey" FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL;

ALTER TABLE "locations" ADD CONSTRAINT "locations_village_id_fkey" FOREIGN KEY (village_id) REFERENCES villages(id) ON DELETE SET NULL;

ALTER TABLE "media_scans" ADD CONSTRAINT "media_scans_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE SET NULL;

ALTER TABLE "media_scans" ADD CONSTRAINT "media_scans_source_id_fkey" FOREIGN KEY (source_id) REFERENCES media_sources(id) ON DELETE SET NULL;

ALTER TABLE "narratives" ADD CONSTRAINT "narratives_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_alert_id_fkey" FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE;

ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_workflow_event_id_fkey" FOREIGN KEY (workflow_event_id) REFERENCES issue_workflow_events(id) ON DELETE CASCADE;

ALTER TABLE "notification_link_tokens" ADD CONSTRAINT "notification_link_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE "online_story_cluster_members" ADD CONSTRAINT "online_story_cluster_members_article_id_fkey" FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

ALTER TABLE "online_story_cluster_members" ADD CONSTRAINT "online_story_cluster_members_cluster_id_fkey" FOREIGN KEY (cluster_id) REFERENCES online_story_clusters(id) ON DELETE CASCADE;

ALTER TABLE "online_story_clusters" ADD CONSTRAINT "online_story_clusters_representative_article_id_fkey" FOREIGN KEY (representative_article_id) REFERENCES articles(id) ON DELETE SET NULL;

ALTER TABLE "opd" ADD CONSTRAINT "opd_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE "organization_area_aliases" ADD CONSTRAINT "organization_area_aliases_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "organization_map_boundaries" ADD CONSTRAINT "organization_map_boundaries_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "organization_map_boundaries" ADD CONSTRAINT "organization_map_boundaries_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "organization_map_boundary_features" ADD CONSTRAINT "organization_map_boundary_features_boundary_id_fkey" FOREIGN KEY (boundary_id) REFERENCES organization_map_boundaries(id) ON DELETE CASCADE;

ALTER TABLE "organization_map_boundary_features" ADD CONSTRAINT "organization_map_boundary_features_district_id_fkey" FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT;

ALTER TABLE "owned_content_cluster_members" ADD CONSTRAINT "owned_content_cluster_members_cluster_id_fkey" FOREIGN KEY (cluster_id) REFERENCES owned_content_clusters(id) ON DELETE CASCADE;

ALTER TABLE "owned_content_cluster_members" ADD CONSTRAINT "owned_content_cluster_members_mention_id_fkey" FOREIGN KEY (mention_id) REFERENCES social_mentions(id) ON DELETE CASCADE;

ALTER TABLE "owned_content_cluster_members" ADD CONSTRAINT "owned_content_cluster_members_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "owned_content_clusters" ADD CONSTRAINT "owned_content_clusters_representative_mention_id_fkey" FOREIGN KEY (representative_mention_id) REFERENCES social_mentions(id) ON DELETE SET NULL;

ALTER TABLE "owned_social_account_metrics" ADD CONSTRAINT "owned_social_account_metrics_account_id_fkey" FOREIGN KEY (account_id) REFERENCES owned_social_accounts(id) ON DELETE CASCADE;

ALTER TABLE "owned_social_accounts" ADD CONSTRAINT "owned_social_accounts_district_id_fkey" FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL;

ALTER TABLE "owned_social_accounts" ADD CONSTRAINT "owned_social_accounts_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE SET NULL;

ALTER TABLE "password_reset_email_tokens" ADD CONSTRAINT "password_reset_email_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE "print_article_keywords" ADD CONSTRAINT "print_article_keywords_article_id_fkey" FOREIGN KEY (article_id) REFERENCES print_articles(id) ON DELETE CASCADE;

ALTER TABLE "print_article_keywords" ADD CONSTRAINT "print_article_keywords_keyword_id_fkey" FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE SET NULL;

ALTER TABLE "print_article_pages" ADD CONSTRAINT "print_article_pages_article_id_fkey" FOREIGN KEY (article_id) REFERENCES print_articles(id) ON DELETE CASCADE;

ALTER TABLE "print_article_pages" ADD CONSTRAINT "print_article_pages_page_id_fkey" FOREIGN KEY (page_id) REFERENCES print_pages(id) ON DELETE CASCADE;

ALTER TABLE "print_articles" ADD CONSTRAINT "print_articles_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "print_articles" ADD CONSTRAINT "print_articles_district_id_fkey" FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL;

ALTER TABLE "print_articles" ADD CONSTRAINT "print_articles_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES print_editions(id) ON DELETE CASCADE;

ALTER TABLE "print_articles" ADD CONSTRAINT "print_articles_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE SET NULL;

ALTER TABLE "print_articles" ADD CONSTRAINT "print_articles_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "print_clippings" ADD CONSTRAINT "print_clippings_article_id_fkey" FOREIGN KEY (article_id) REFERENCES print_articles(id) ON DELETE CASCADE;

ALTER TABLE "print_clippings" ADD CONSTRAINT "print_clippings_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE SET NULL;

ALTER TABLE "print_clippings" ADD CONSTRAINT "print_clippings_page_id_fkey" FOREIGN KEY (page_id) REFERENCES print_pages(id) ON DELETE CASCADE;

ALTER TABLE "print_editions" ADD CONSTRAINT "print_editions_source_id_fkey" FOREIGN KEY (source_id) REFERENCES media_sources(id) ON DELETE CASCADE;

ALTER TABLE "print_ocr_results" ADD CONSTRAINT "print_ocr_results_article_id_fkey" FOREIGN KEY (article_id) REFERENCES print_articles(id) ON DELETE CASCADE;

ALTER TABLE "print_ocr_results" ADD CONSTRAINT "print_ocr_results_page_id_fkey" FOREIGN KEY (page_id) REFERENCES print_pages(id) ON DELETE CASCADE;

ALTER TABLE "print_ocr_results" ADD CONSTRAINT "print_ocr_results_upload_file_id_fkey" FOREIGN KEY (upload_file_id) REFERENCES print_upload_files(id) ON DELETE CASCADE;

ALTER TABLE "print_pages" ADD CONSTRAINT "print_pages_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES print_editions(id) ON DELETE CASCADE;

ALTER TABLE "print_upload_files" ADD CONSTRAINT "print_upload_files_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES print_editions(id) ON DELETE CASCADE;

ALTER TABLE "print_upload_files" ADD CONSTRAINT "print_upload_files_media_scan_id_fkey" FOREIGN KEY (media_scan_id) REFERENCES media_scans(id) ON DELETE SET NULL;

ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;

ALTER TABLE "social_conversation_cluster_members" ADD CONSTRAINT "social_conversation_cluster_members_cluster_id_fkey" FOREIGN KEY (cluster_id) REFERENCES social_conversation_clusters(id) ON DELETE CASCADE;

ALTER TABLE "social_conversation_cluster_members" ADD CONSTRAINT "social_conversation_cluster_members_mention_id_fkey" FOREIGN KEY (mention_id) REFERENCES social_mentions(id) ON DELETE CASCADE;

ALTER TABLE "social_conversation_clusters" ADD CONSTRAINT "social_conversation_clusters_keyword_id_fkey" FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE SET NULL;

ALTER TABLE "social_conversation_clusters" ADD CONSTRAINT "social_conversation_clusters_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "social_conversation_clusters" ADD CONSTRAINT "social_conversation_clusters_representative_mention_id_fkey" FOREIGN KEY (representative_mention_id) REFERENCES social_mentions(id) ON DELETE SET NULL;

ALTER TABLE "social_conversation_clusters" ADD CONSTRAINT "social_conversation_clusters_taxonomy_id_fkey" FOREIGN KEY (taxonomy_id) REFERENCES taxonomy_categories(id) ON DELETE SET NULL;

ALTER TABLE "social_conversation_manual_exclusions" ADD CONSTRAINT "social_conversation_manual_exclusions_mention_id_fkey" FOREIGN KEY (mention_id) REFERENCES social_mentions(id) ON DELETE CASCADE;

ALTER TABLE "social_conversation_manual_exclusions" ADD CONSTRAINT "social_conversation_manual_exclusions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "social_mention_issues" ADD CONSTRAINT "social_mention_issues_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE "social_mention_issues" ADD CONSTRAINT "social_mention_issues_mention_id_fkey" FOREIGN KEY (mention_id) REFERENCES social_mentions(id) ON DELETE CASCADE;

ALTER TABLE "social_mention_keywords" ADD CONSTRAINT "social_mention_keywords_keyword_id_fkey" FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE;

ALTER TABLE "social_mention_keywords" ADD CONSTRAINT "social_mention_keywords_mention_id_fkey" FOREIGN KEY (mention_id) REFERENCES social_mentions(id) ON DELETE CASCADE;

ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_curated_by_fkey" FOREIGN KEY (curated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_district_id_fkey" FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL;

ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;

ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE SET NULL;

ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_owned_account_id_fkey" FOREIGN KEY (owned_account_id) REFERENCES owned_social_accounts(id) ON DELETE SET NULL;

ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_village_id_fkey" FOREIGN KEY (village_id) REFERENCES villages(id) ON DELETE SET NULL;

ALTER TABLE "social_post_metrics" ADD CONSTRAINT "social_post_metrics_mention_id_fkey" FOREIGN KEY (mention_id) REFERENCES social_mentions(id) ON DELETE CASCADE;

ALTER TABLE "taxonomy_categories" ADD CONSTRAINT "taxonomy_categories_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "taxonomy_categories" ADD CONSTRAINT "taxonomy_categories_sector_id_fkey" FOREIGN KEY (sector_id) REFERENCES classification_sectors(id) ON DELETE SET NULL;

ALTER TABLE "unified_candidate_issues" ADD CONSTRAINT "unified_candidate_issues_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES users(id);

ALTER TABLE "unified_candidate_issues" ADD CONSTRAINT "unified_candidate_issues_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES issues(id);

ALTER TABLE "unified_candidate_issues" ADD CONSTRAINT "unified_candidate_issues_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "uptd" ADD CONSTRAINT "uptd_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE RESTRICT;

ALTER TABLE "uptd" ADD CONSTRAINT "uptd_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE "user_notification_channels" ADD CONSTRAINT "user_notification_channels_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE CASCADE;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE "users" ADD CONSTRAINT "users_district_id_fkey" FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL;

ALTER TABLE "users" ADD CONSTRAINT "users_opd_id_fkey" FOREIGN KEY (opd_id) REFERENCES opd(id) ON DELETE SET NULL;

ALTER TABLE "viewer_display_devices" ADD CONSTRAINT "viewer_display_devices_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE "viewer_display_devices" ADD CONSTRAINT "viewer_display_devices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE "villages" ADD CONSTRAINT "villages_district_id_fkey" FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE;

ALTER TABLE "villages" ADD CONSTRAINT "villages_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX idx_ai_budget_reservations_budget_status ON public.ai_budget_reservations USING btree (budget_id, status);

CREATE INDEX idx_ai_gemini_quota_feature_audit_day ON public.ai_gemini_quota_feature_audit USING btree (usage_date, model_id, feature_code);

CREATE INDEX idx_ai_models_enabled ON public.ai_models USING btree (enabled);

CREATE INDEX idx_ai_models_provider ON public.ai_models USING btree (provider_id);

CREATE INDEX ai_provider_balance_snapshots_latest ON public.ai_provider_balance_snapshots USING btree (provider_id, id DESC);

CREATE INDEX idx_ai_task_routes_lookup ON public.ai_task_routes USING btree (task_id, enabled, priority);

CREATE INDEX idx_ai_task_routes_task ON public.ai_task_routes USING btree (task_id);

CREATE INDEX idx_ai_tasks_enabled ON public.ai_tasks USING btree (enabled);

CREATE INDEX idx_ai_usage_logs_provider_created ON public.ai_usage_logs USING btree (provider_id, created_at DESC);

CREATE INDEX idx_ai_usage_logs_task_created ON public.ai_usage_logs USING btree (task_id, created_at DESC);

CREATE INDEX idx_ai_usage_logs_user_created ON public.ai_usage_logs USING btree (user_id, created_at DESC);

CREATE INDEX idx_alert_events_alert ON public.alert_events USING btree (alert_id, created_at DESC);

CREATE INDEX idx_alert_print_articles_print_article_id ON public.alert_print_articles USING btree (print_article_id);

CREATE INDEX idx_alerts_social_mention ON public.alerts USING btree (social_mention_id, created_at DESC) WHERE (social_mention_id IS NOT NULL);

CREATE INDEX idx_alerts_status_severity ON public.alerts USING btree (status, severity, created_at DESC);

CREATE INDEX apify_usage_ledger_started_at_idx ON public.apify_usage_ledger USING btree (started_at);

CREATE INDEX apify_usage_ledger_status_idx ON public.apify_usage_ledger USING btree (status);

CREATE INDEX idx_article_alerts_status ON public.article_alerts USING btree (status, created_at DESC);

CREATE INDEX idx_article_manual_keywords_article_active ON public.article_manual_keywords USING btree (article_id, active);

CREATE INDEX idx_article_manual_keywords_keyword_active ON public.article_manual_keywords USING btree (keyword_id, active);

CREATE INDEX idx_article_manual_keywords_primary ON public.article_manual_keywords USING btree (article_id) WHERE ((active = true) AND (keyword_role = 'PRIMARY'::text));

CREATE INDEX article_opd_article_role_idx ON public.article_opd USING btree (article_id, routing_role);

CREATE UNIQUE INDEX article_opd_one_primary_per_article ON public.article_opd USING btree (article_id) WHERE (routing_role = 'PRIMARY'::text);

CREATE INDEX article_opd_opd_idx ON public.article_opd USING btree (opd_id, routing_role);

CREATE INDEX idx_article_uptd_primary ON public.article_uptd USING btree (article_id, is_primary) WHERE (is_primary = true);

CREATE INDEX idx_article_uptd_uptd_article ON public.article_uptd USING btree (uptd_id, article_id);

CREATE INDEX articles_classification_checkpoint_idx ON public.articles USING btree (classification_version, classified_at);

CREATE INDEX articles_news_classification_idx ON public.articles USING btree (news_classification, news_classification_source, published_at DESC);

CREATE INDEX idx_articles_district ON public.articles USING btree (district_id);

CREATE INDEX idx_articles_highlight ON public.articles USING btree (is_highlight, published_at DESC);

CREATE INDEX idx_articles_opd ON public.articles USING btree (opd_id);

CREATE INDEX idx_articles_published ON public.articles USING btree (published_at DESC);

CREATE INDEX idx_articles_risk ON public.articles USING btree (risk_level, risk_score DESC);

CREATE INDEX idx_articles_sentiment ON public.articles USING btree (sentiment);

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id, created_at DESC);

CREATE INDEX idx_classification_sectors_org_active_sort ON public.classification_sectors USING btree (organization_id, active, sort_order, id);

CREATE INDEX collection_scheduler_runs_started_idx ON public.collection_scheduler_runs USING btree (started_at DESC);

CREATE INDEX idx_communication_strategies_workflow ON public.communication_strategies USING btree (workflow_id, version DESC);

CREATE UNIQUE INDEX uq_communication_strategies_current_workflow ON public.communication_strategies USING btree (workflow_id) WHERE (is_current = true);

CREATE INDEX idx_communication_strategy_districts_workflow ON public.communication_strategy_districts USING btree (workflow_id, district_id);

CREATE INDEX idx_content_project_items_project ON public.content_project_items USING btree (project_id);

CREATE INDEX idx_content_project_sources_item ON public.content_project_sources USING btree (item_id);

CREATE INDEX idx_content_project_sources_project ON public.content_project_sources USING btree (project_id);

CREATE INDEX idx_content_projects_status ON public.content_projects USING btree (status);

CREATE INDEX idx_content_projects_workflow ON public.content_projects USING btree (workflow_id);

CREATE INDEX idx_daily_intelligence_date ON public.daily_intelligence_runs USING btree (run_date DESC, created_at DESC);

CREATE INDEX idx_evidence_article ON public.evidence_sources USING btree (article_id);

CREATE INDEX idx_evidence_print_article ON public.evidence_sources USING btree (print_article_id);

CREATE INDEX idx_evidence_scan ON public.evidence_sources USING btree (media_scan_id);

CREATE INDEX idx_evidence_social_mention ON public.evidence_sources USING btree (social_mention_id, captured_at DESC) WHERE (social_mention_id IS NOT NULL);

CREATE INDEX idx_executive_brief_cache_generated_at ON public.executive_brief_daily_cache USING btree (generated_at DESC);

CREATE UNIQUE INDEX uq_government_branding_active ON public.government_branding USING btree (is_active) WHERE (is_active = true);

CREATE INDEX idx_incident_events_incident ON public.incident_events USING btree (incident_id, created_at DESC);

CREATE INDEX idx_incident_tasks_incident ON public.incident_tasks USING btree (incident_id, status);

CREATE INDEX idx_incidents_opd ON public.incidents USING btree (opd_id, updated_at DESC);

CREATE INDEX idx_incidents_status ON public.incidents USING btree (status, severity, updated_at DESC);

CREATE INDEX idx_ingestion_runs_started ON public.ingestion_runs USING btree (started_at DESC);

CREATE INDEX idx_integration_credentials_org_enabled ON public.integration_credentials USING btree (organization_id, enabled);

CREATE INDEX idx_issue_articles_article_source ON public.issue_articles USING btree (article_id, assignment_source);

CREATE INDEX idx_issue_communication_gap_snapshots_org_updated ON public.issue_communication_gap_snapshots USING btree (organization_id, updated_at DESC);

CREATE INDEX idx_issue_contributor_rounds_assignment ON public.issue_contributor_clarification_rounds USING btree (contributor_assignment_id, round_number DESC);

CREATE INDEX idx_issue_contributor_rounds_status ON public.issue_contributor_clarification_rounds USING btree (review_status, requested_at DESC);

CREATE INDEX idx_issue_contributor_submissions_assignment ON public.issue_contributor_submissions USING btree (contributor_assignment_id, created_at DESC);

CREATE INDEX idx_issue_districts_district ON public.issue_districts USING btree (district_id, issue_id);

CREATE INDEX idx_issue_keywords_issue ON public.issue_keywords USING btree (issue_id);

CREATE INDEX idx_issue_keywords_keyword ON public.issue_keywords USING btree (keyword_id);

CREATE UNIQUE INDEX uq_issue_keywords_primary ON public.issue_keywords USING btree (issue_id) WHERE ((keyword_role)::text = 'PRIMARY'::text);

CREATE INDEX idx_issue_linkage_h1_batches_recent ON public.issue_linkage_h1_batches USING btree (organization_id, news_date DESC, created_at DESC);

CREATE UNIQUE INDEX uq_issue_linkage_h1_one_running_per_day ON public.issue_linkage_h1_batches USING btree (organization_id, news_date) WHERE (status = 'running'::text);

CREATE INDEX idx_issue_linkage_h1_evidence_batch ON public.issue_linkage_h1_evidence_ledger USING btree (batch_id, status);

CREATE INDEX idx_issue_metrics_issue_time ON public.issue_metrics USING btree (issue_id, measured_at DESC);

CREATE INDEX idx_issue_monitor_terms_active ON public.issue_monitor_terms USING btree (monitor_id, active);

CREATE INDEX idx_issue_monitoring_analysis_snapshots_issue ON public.issue_monitoring_analysis_snapshots USING btree (issue_id, period_number);

CREATE INDEX idx_issue_monitoring_analysis_snapshots_workflow ON public.issue_monitoring_analysis_snapshots USING btree (workflow_id, period_number);

CREATE INDEX idx_issue_monitors_issue ON public.issue_monitors USING btree (issue_id, status);

CREATE INDEX idx_issue_monitors_window ON public.issue_monitors USING btree (organization_id, status, starts_at, ends_at);

CREATE INDEX idx_issue_print_articles_candidate ON public.issue_print_articles USING btree (linkage_status, relevance_score DESC) WHERE (linkage_status = 'candidate'::text);

CREATE INDEX idx_issue_print_articles_issue ON public.issue_print_articles USING btree (issue_id, linkage_status, relevance_score DESC);

CREATE INDEX idx_issue_print_articles_print ON public.issue_print_articles USING btree (print_article_id, linkage_status);

CREATE INDEX idx_issue_publication_analysis_snapshots_issue ON public.issue_publication_analysis_snapshots USING btree (issue_id);

CREATE INDEX idx_issue_publication_evidence_issue ON public.issue_publication_evidence USING btree (issue_id, created_at, id);

CREATE INDEX idx_issue_publication_evidence_workflow ON public.issue_publication_evidence USING btree (workflow_id, created_at, id);

CREATE UNIQUE INDEX uq_issue_publication_primary ON public.issue_publication_evidence USING btree (workflow_id) WHERE (is_primary = true);

CREATE INDEX idx_issue_publication_evidence_files_evidence ON public.issue_publication_evidence_files USING btree (evidence_id, file_order, id);

CREATE INDEX idx_issue_response_issue_status ON public.issue_response_submissions USING btree (issue_id, status, version DESC);

CREATE INDEX idx_issue_response_opd_status ON public.issue_response_submissions USING btree (opd_id, status, updated_at DESC);

CREATE INDEX idx_issue_workflow_contributors_district ON public.issue_workflow_contributors USING btree (district_id, status, assigned_at DESC) WHERE (contributor_type = 'DISTRICT'::text);

CREATE INDEX idx_issue_workflow_contributors_issue_status ON public.issue_workflow_contributors USING btree (issue_id, status, assigned_at DESC);

CREATE INDEX idx_issue_workflow_contributors_opd ON public.issue_workflow_contributors USING btree (opd_id, status, assigned_at DESC) WHERE (contributor_type = 'OPD'::text);

CREATE INDEX idx_issue_workflow_contributors_uptd ON public.issue_workflow_contributors USING btree (uptd_id, status, assigned_at DESC) WHERE (contributor_type = 'UPTD'::text);

CREATE UNIQUE INDEX uq_issue_workflow_contributor_district ON public.issue_workflow_contributors USING btree (workflow_id, district_id) WHERE (contributor_type = 'DISTRICT'::text);

CREATE UNIQUE INDEX uq_issue_workflow_contributor_opd ON public.issue_workflow_contributors USING btree (workflow_id, opd_id) WHERE (contributor_type = 'OPD'::text);

CREATE UNIQUE INDEX uq_issue_workflow_contributor_uptd ON public.issue_workflow_contributors USING btree (workflow_id, uptd_id) WHERE (contributor_type = 'UPTD'::text);

CREATE INDEX idx_issue_workflow_events_issue ON public.issue_workflow_events USING btree (issue_id, created_at DESC);

CREATE INDEX idx_issue_workflow_events_workflow ON public.issue_workflow_events USING btree (workflow_id, created_at DESC);

CREATE INDEX idx_issue_workflow_supporting_opd_opd ON public.issue_workflow_supporting_opd USING btree (opd_id, assigned_at DESC);

CREATE INDEX idx_issue_workflows_issue_latest ON public.issue_workflows USING btree (issue_id, cycle_number DESC, id DESC);

CREATE INDEX idx_issue_workflows_lead_opd ON public.issue_workflows USING btree (lead_opd_id, workflow_status, updated_at DESC);

CREATE INDEX idx_issue_workflows_status ON public.issue_workflows USING btree (workflow_status, updated_at DESC);

CREATE UNIQUE INDEX uq_issue_workflows_one_open_cycle ON public.issue_workflows USING btree (issue_id) WHERE (workflow_status <> 'CLOSED'::text);

CREATE INDEX idx_issues_taxonomy_category ON public.issues USING btree (taxonomy_category_id);

CREATE INDEX idx_keyword_district_district_active ON public.keyword_district USING btree (district_id, active, keyword_id);

CREATE INDEX idx_keyword_opd_opd_active ON public.keyword_opd USING btree (opd_id, active, keyword_id);

CREATE UNIQUE INDEX uq_keyword_opd_one_active_primary ON public.keyword_opd USING btree (keyword_id) WHERE ((active = true) AND (routing_role = 'PRIMARY'::text));

CREATE INDEX idx_keyword_taxonomy_category ON public.keyword_taxonomy USING btree (category_id, active);

CREATE INDEX idx_keyword_taxonomy_keyword ON public.keyword_taxonomy USING btree (keyword_id, active);

CREATE INDEX idx_keywords_active_district ON public.keywords USING btree (active, district_id) WHERE (district_id IS NOT NULL);

CREATE INDEX idx_keywords_org_normalized ON public.keywords USING btree (organization_id, normalized_keyword);

CREATE INDEX idx_keywords_priority ON public.keywords USING btree (active, priority DESC);

CREATE UNIQUE INDEX uq_keywords_district_keyword ON public.keywords USING btree (district_id, lower(keyword)) WHERE ((district_id IS NOT NULL) AND (opd_id IS NULL));

CREATE UNIQUE INDEX uq_keywords_global_master_normalized ON public.keywords USING btree (organization_id, normalized_keyword) WHERE ((organization_id IS NOT NULL) AND (opd_id IS NULL) AND (district_id IS NULL));

CREATE UNIQUE INDEX uq_keywords_opd_keyword ON public.keywords USING btree (opd_id, lower(keyword)) WHERE ((opd_id IS NOT NULL) AND (district_id IS NULL));

CREATE INDEX idx_locations_district ON public.locations USING btree (district_id);

CREATE INDEX idx_locations_village ON public.locations USING btree (village_id);

CREATE INDEX idx_media_scans_created ON public.media_scans USING btree (created_at DESC);

CREATE INDEX idx_media_scans_status ON public.media_scans USING btree (status, created_at DESC);

CREATE INDEX idx_narratives_issue ON public.narratives USING btree (issue_id, narrative_type);

CREATE INDEX idx_notification_deliveries_alert ON public.notification_deliveries USING btree (alert_id) WHERE (alert_id IS NOT NULL);

CREATE INDEX idx_notification_deliveries_dispatch ON public.notification_deliveries USING btree (status, next_attempt_at, created_at) WHERE (status = ANY (ARRAY['PENDING'::text, 'FAILED'::text]));

CREATE INDEX idx_notification_deliveries_event ON public.notification_deliveries USING btree (workflow_event_id);

CREATE INDEX idx_notification_deliveries_user ON public.notification_deliveries USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX uq_notification_deliveries_alert_user_channel ON public.notification_deliveries USING btree (alert_id, user_id, channel) WHERE (alert_id IS NOT NULL);

CREATE INDEX idx_notification_link_tokens_active ON public.notification_link_tokens USING btree (user_id, channel, expires_at) WHERE (used_at IS NULL);

CREATE INDEX idx_online_story_cluster_members_article ON public.online_story_cluster_members USING btree (article_id);

CREATE INDEX idx_online_story_clusters_last_published ON public.online_story_clusters USING btree (last_published_at DESC);

CREATE INDEX idx_opd_organization_group_active ON public.opd USING btree (organization_id, opd_group, active);

CREATE INDEX idx_organization_area_aliases_active ON public.organization_area_aliases USING btree (organization_id, active, name);

CREATE INDEX idx_organization_map_boundaries_org ON public.organization_map_boundaries USING btree (organization_id, created_at DESC);

CREATE UNIQUE INDEX uq_organization_map_boundary_active ON public.organization_map_boundaries USING btree (organization_id) WHERE (status = 'ACTIVE'::text);

CREATE INDEX idx_map_boundary_features_district ON public.organization_map_boundary_features USING btree (boundary_id, district_id);

CREATE INDEX idx_owned_cluster_members_review_status ON public.owned_content_cluster_members USING btree (review_status, similarity_score);

CREATE INDEX idx_owned_content_cluster_members_cluster ON public.owned_content_cluster_members USING btree (cluster_id, similarity_score DESC);

CREATE INDEX idx_owned_content_clusters_last_published ON public.owned_content_clusters USING btree (last_published_at DESC);

CREATE INDEX idx_owned_social_metrics_account_time ON public.owned_social_account_metrics USING btree (account_id, measured_at DESC);

CREATE INDEX idx_owned_social_metrics_scope_time ON public.owned_social_account_metrics USING btree (data_scope, measured_at DESC);

CREATE INDEX idx_owned_social_accounts_district_id ON public.owned_social_accounts USING btree (district_id);

CREATE INDEX idx_owned_social_opd_active ON public.owned_social_accounts USING btree (opd_id, active, platform);

CREATE INDEX idx_owned_social_source_hierarchy ON public.owned_social_accounts USING btree (active, is_primary_source, source_priority DESC, platform);

CREATE UNIQUE INDEX uq_owned_social_platform_handle ON public.owned_social_accounts USING btree (platform, lower(handle));

CREATE INDEX password_reset_email_tokens_user_idx ON public.password_reset_email_tokens USING btree (user_id, created_at DESC);

CREATE INDEX idx_password_reset_requests_status_requested ON public.password_reset_requests USING btree (status, requested_at DESC);

CREATE UNIQUE INDEX uq_password_reset_requests_pending_user ON public.password_reset_requests USING btree (user_id) WHERE (status = 'PENDING'::text);

CREATE INDEX idx_print_article_keywords_article ON public.print_article_keywords USING btree (article_id);

CREATE INDEX idx_print_article_keywords_keyword ON public.print_article_keywords USING btree (keyword_id);

CREATE UNIQUE INDEX uq_print_article_keyword_text ON public.print_article_keywords USING btree (article_id, lower(keyword_text), source);

CREATE INDEX idx_print_article_pages_page ON public.print_article_pages USING btree (page_id);

CREATE INDEX idx_print_articles_district ON public.print_articles USING btree (district_id, created_at DESC);

CREATE INDEX idx_print_articles_edition ON public.print_articles USING btree (edition_id, created_at DESC);

CREATE INDEX idx_print_articles_headline ON public.print_articles USING btree (is_headline, created_at DESC) WHERE (is_headline = true);

CREATE INDEX idx_print_articles_opd ON public.print_articles USING btree (opd_id, created_at DESC);

CREATE INDEX idx_print_articles_status ON public.print_articles USING btree (status, created_at DESC);

CREATE INDEX idx_print_clippings_article ON public.print_clippings USING btree (article_id);

CREATE INDEX idx_print_clippings_opd ON public.print_clippings USING btree (opd_id);

CREATE INDEX idx_print_clippings_page ON public.print_clippings USING btree (page_id);

CREATE UNIQUE INDEX uq_print_editions_source_date_name ON public.print_editions USING btree (source_id, edition_date, COALESCE(edition_name, ''::text));

CREATE INDEX idx_print_ocr_article ON public.print_ocr_results USING btree (article_id, created_at DESC);

CREATE INDEX idx_print_ocr_page ON public.print_ocr_results USING btree (page_id, created_at DESC);

CREATE INDEX idx_print_ocr_upload ON public.print_ocr_results USING btree (upload_file_id, created_at DESC);

CREATE INDEX idx_print_upload_files_edition ON public.print_upload_files USING btree (edition_id, file_order, id);

CREATE INDEX idx_print_upload_files_status ON public.print_upload_files USING btree (status, created_at DESC);

CREATE INDEX idx_refresh_tokens_user_expiry ON public.refresh_tokens USING btree (user_id, expires_at DESC);

CREATE INDEX idx_social_conversation_members_cluster ON public.social_conversation_cluster_members USING btree (cluster_id);

CREATE INDEX idx_social_conversation_clusters_org_status_last ON public.social_conversation_clusters USING btree (organization_id, status, last_published_at DESC);

CREATE INDEX idx_social_conversation_clusters_taxonomy_keyword ON public.social_conversation_clusters USING btree (organization_id, taxonomy_id, keyword_id);

CREATE INDEX idx_social_conversation_manual_exclusions_org ON public.social_conversation_manual_exclusions USING btree (organization_id);

CREATE INDEX idx_social_mention_issues_issue ON public.social_mention_issues USING btree (issue_id, relevance_score DESC, created_at DESC);

CREATE INDEX idx_social_mention_keywords_keyword ON public.social_mention_keywords USING btree (keyword_id, created_at DESC);

CREATE INDEX idx_social_mentions_opd_published ON public.social_mentions USING btree (opd_id, published_at DESC NULLS LAST);

CREATE INDEX idx_social_mentions_owned_account ON public.social_mentions USING btree (owned_account_id, published_at DESC NULLS LAST);

CREATE INDEX idx_social_mentions_owned_curation ON public.social_mentions USING btree (source_kind, curation_status, published_at DESC NULLS LAST, captured_at DESC);

CREATE INDEX idx_social_mentions_platform_published ON public.social_mentions USING btree (platform, published_at DESC NULLS LAST);

CREATE INDEX idx_social_mentions_processing ON public.social_mentions USING btree (processing_status, captured_at DESC);

CREATE INDEX idx_social_mentions_published ON public.social_mentions USING btree (published_at DESC NULLS LAST);

CREATE INDEX idx_social_mentions_region ON public.social_mentions USING btree (district_id, village_id, published_at DESC NULLS LAST);

CREATE INDEX idx_social_mentions_risk ON public.social_mentions USING btree (risk_level, risk_score DESC, published_at DESC NULLS LAST);

CREATE INDEX idx_social_mentions_sentiment ON public.social_mentions USING btree (sentiment, published_at DESC NULLS LAST);

CREATE UNIQUE INDEX uq_social_mentions_owned_content_hash ON public.social_mentions USING btree (platform, owned_account_id, content_hash) WHERE ((content_hash IS NOT NULL) AND (owned_account_id IS NOT NULL));

CREATE UNIQUE INDEX uq_social_mentions_platform_external ON public.social_mentions USING btree (platform, external_id) WHERE (external_id IS NOT NULL);

CREATE UNIQUE INDEX uq_social_mentions_unowned_content_hash ON public.social_mentions USING btree (platform, content_hash) WHERE ((content_hash IS NOT NULL) AND (owned_account_id IS NULL));

CREATE INDEX idx_social_post_metrics_mention_time ON public.social_post_metrics USING btree (mention_id, measured_at DESC);

CREATE INDEX idx_taxonomy_categories_org_sector_active ON public.taxonomy_categories USING btree (organization_id, sector_id, active, sort_order, id);

CREATE INDEX idx_unified_candidate_issues_pending ON public.unified_candidate_issues USING btree (organization_id, status, last_detected_at DESC);

CREATE INDEX idx_unified_candidate_issues_resolver_outcome ON public.unified_candidate_issues USING btree (organization_id, status, last_detected_at DESC) WHERE (status = ANY (ARRAY['BELOW_THRESHOLD'::text, 'MATCHED_ISSUE'::text]));

CREATE INDEX idx_uptd_opd_active ON public.uptd USING btree (opd_id, active, name);

CREATE INDEX idx_uptd_org_active ON public.uptd USING btree (organization_id, active, name);

CREATE UNIQUE INDEX uq_uptd_org_code ON public.uptd USING btree (organization_id, upper(code)) WHERE ((code IS NOT NULL) AND (btrim(code) <> ''::text));

CREATE UNIQUE INDEX uq_uptd_org_name ON public.uptd USING btree (organization_id, lower(name));

CREATE INDEX idx_user_notification_channels_user_enabled ON public.user_notification_channels USING btree (user_id, enabled);

CREATE UNIQUE INDEX uq_user_roles_scope ON public.user_roles USING btree (user_id, role_id, COALESCE(opd_id, (0)::bigint));

CREATE INDEX idx_users_district ON public.users USING btree (district_id) WHERE (district_id IS NOT NULL);

CREATE INDEX viewer_display_devices_org_idx ON public.viewer_display_devices USING btree (organization_id, created_at DESC);

CREATE INDEX viewer_display_devices_user_idx ON public.viewer_display_devices USING btree (user_id, created_at DESC);

CREATE INDEX idx_villages_active_org_district ON public.villages USING btree (organization_id, district_id, active);

CREATE OR REPLACE FUNCTION public.normalize_keyword_master_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN NEW.normalized_keyword := lower(regexp_replace(btrim(NEW.keyword), '\s+', ' ', 'g')); NEW.updated_at := now(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.enforce_keyword_opd_supporting_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ DECLARE supporting_count INTEGER; BEGIN IF NEW.active=TRUE AND NEW.routing_role='SUPPORTING' THEN SELECT COUNT(*) INTO supporting_count FROM keyword_opd ko WHERE ko.keyword_id=NEW.keyword_id AND ko.active=TRUE AND ko.routing_role='SUPPORTING' AND (TG_OP <> 'UPDATE' OR ko.opd_id <> OLD.opd_id); IF supporting_count >= 3 THEN RAISE EXCEPTION 'A master keyword may have at most 3 active supporting OPDs' USING ERRCODE='23514'; END IF; END IF; RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.merge_issue(p_source_issue_id bigint, p_target_issue_id bigint, p_user_id bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_source RECORD;
    v_target RECORD;
BEGIN
    IF p_source_issue_id = p_target_issue_id THEN
        RAISE EXCEPTION 'ISSUE_MERGE_SAME_SOURCE_TARGET';
    END IF;

    IF length(trim(COALESCE(p_reason, ''))) < 3 THEN
        RAISE EXCEPTION 'ISSUE_MERGE_REASON_REQUIRED';
    END IF;

    SELECT id, organization_id, title, status
    INTO v_source
    FROM issues
    WHERE id = p_source_issue_id
    FOR UPDATE;

    SELECT id, organization_id, title, status
    INTO v_target
    FROM issues
    WHERE id = p_target_issue_id
    FOR UPDATE;

    IF v_source.id IS NULL OR v_target.id IS NULL THEN
        RAISE EXCEPTION 'ISSUE_NOT_FOUND';
    END IF;

    IF v_source.organization_id <> v_target.organization_id THEN
        RAISE EXCEPTION 'ISSUE_MERGE_DIFFERENT_ORGANIZATION';
    END IF;

    -- Phase 3 is one workflow per Issue. Never merge two independently active
    -- operational response histories automatically.
    IF EXISTS (SELECT 1 FROM issue_workflows WHERE issue_id = p_source_issue_id)
       AND EXISTS (SELECT 1 FROM issue_workflows WHERE issue_id = p_target_issue_id) THEN
        RAISE EXCEPTION 'ISSUE_MERGE_WORKFLOW_CONFLICT';
    END IF;

    IF lower(v_source.status) NOT IN ('watch','active')
       OR lower(v_target.status) NOT IN ('watch','active') THEN
        RAISE EXCEPTION 'ISSUE_MERGE_REQUIRES_OPERATIONAL_ISSUES';
    END IF;

    INSERT INTO issue_articles (
        issue_id, article_id, relevance_score, assignment_source
    )
    SELECT p_target_issue_id, article_id, relevance_score, assignment_source
    FROM issue_articles
    WHERE issue_id = p_source_issue_id
    ON CONFLICT (issue_id, article_id)
    DO UPDATE SET
        relevance_score = CASE
            WHEN issue_articles.assignment_source = 'MANUAL' THEN issue_articles.relevance_score
            WHEN EXCLUDED.assignment_source = 'MANUAL' THEN EXCLUDED.relevance_score
            ELSE GREATEST(COALESCE(issue_articles.relevance_score,0), COALESCE(EXCLUDED.relevance_score,0))
        END,
        assignment_source = CASE
            WHEN issue_articles.assignment_source = 'MANUAL' OR EXCLUDED.assignment_source = 'MANUAL' THEN 'MANUAL'
            ELSE COALESCE(issue_articles.assignment_source, EXCLUDED.assignment_source)
        END;

    INSERT INTO issue_print_articles (
        issue_id, print_article_id, relevance_score, linkage_status, decided_by, decided_at, evidence
    )
    SELECT p_target_issue_id, print_article_id, relevance_score, linkage_status, decided_by, decided_at, evidence
    FROM issue_print_articles
    WHERE issue_id = p_source_issue_id
    ON CONFLICT (issue_id, print_article_id)
    DO UPDATE SET
        relevance_score = CASE
            WHEN issue_print_articles.decided_by IS NOT NULL THEN issue_print_articles.relevance_score
            WHEN EXCLUDED.decided_by IS NOT NULL THEN EXCLUDED.relevance_score
            ELSE GREATEST(COALESCE(issue_print_articles.relevance_score,0), COALESCE(EXCLUDED.relevance_score,0))
        END,
        linkage_status = CASE
            WHEN issue_print_articles.decided_by IS NOT NULL THEN issue_print_articles.linkage_status
            WHEN EXCLUDED.decided_by IS NOT NULL THEN EXCLUDED.linkage_status
            ELSE issue_print_articles.linkage_status
        END,
        decided_by = COALESCE(issue_print_articles.decided_by, EXCLUDED.decided_by),
        decided_at = COALESCE(issue_print_articles.decided_at, EXCLUDED.decided_at),
        evidence = CASE
            WHEN issue_print_articles.decided_by IS NOT NULL THEN issue_print_articles.evidence
            WHEN EXCLUDED.decided_by IS NOT NULL THEN EXCLUDED.evidence
            ELSE COALESCE(issue_print_articles.evidence, EXCLUDED.evidence)
        END;

    INSERT INTO social_mention_issues (
        mention_id, issue_id, relevance_score, linkage_source
    )
    SELECT mention_id, p_target_issue_id, relevance_score, linkage_source
    FROM social_mention_issues
    WHERE issue_id = p_source_issue_id
    ON CONFLICT (mention_id, issue_id)
    DO UPDATE SET
        relevance_score = CASE
            WHEN lower(COALESCE(social_mention_issues.linkage_source,'')) = 'manual' THEN social_mention_issues.relevance_score
            WHEN lower(COALESCE(EXCLUDED.linkage_source,'')) = 'manual' THEN EXCLUDED.relevance_score
            ELSE GREATEST(COALESCE(social_mention_issues.relevance_score,0), COALESCE(EXCLUDED.relevance_score,0))
        END,
        linkage_source = CASE
            WHEN lower(COALESCE(social_mention_issues.linkage_source,'')) = 'manual'
              OR lower(COALESCE(EXCLUDED.linkage_source,'')) = 'manual' THEN 'manual'
            ELSE COALESCE(social_mention_issues.linkage_source, EXCLUDED.linkage_source)
        END;

    -- Preserve the target Issue as the canonical classification.
    -- Its leading OPD follows the target Primary Keyword; never copy a
    -- source leading OPD over it. Supporting OPD context may follow.
    INSERT INTO issue_opd (issue_id, opd_id, responsibility)
    SELECT p_target_issue_id, opd_id, 'supporting'
    FROM issue_opd
    WHERE issue_id = p_source_issue_id
      AND responsibility = 'supporting'
    ON CONFLICT (issue_id, opd_id) DO NOTHING;

    INSERT INTO issue_districts (issue_id, district_id, source, created_by)
    SELECT p_target_issue_id, district_id, source, created_by
    FROM issue_districts
    WHERE issue_id = p_source_issue_id
    ON CONFLICT DO NOTHING;

    UPDATE unified_candidate_issues
    SET issue_id = p_target_issue_id, updated_at = now()
    WHERE issue_id = p_source_issue_id;

    -- Non-workflow references can safely follow the canonical target.
    UPDATE alerts SET issue_id = p_target_issue_id WHERE issue_id = p_source_issue_id;
    UPDATE narratives SET issue_id = p_target_issue_id WHERE issue_id = p_source_issue_id;

    -- If only the source has a Phase 3 workflow, preserve that operational
    -- history by moving the whole issue-keyed workflow family atomically.
    IF EXISTS (SELECT 1 FROM issue_workflows WHERE issue_id = p_source_issue_id)
       AND NOT EXISTS (SELECT 1 FROM issue_workflows WHERE issue_id = p_target_issue_id) THEN
        UPDATE issue_response_submissions SET issue_id = p_target_issue_id WHERE issue_id = p_source_issue_id;
        UPDATE issue_workflow_events SET issue_id = p_target_issue_id WHERE issue_id = p_source_issue_id;
        UPDATE issue_workflow_supporting_opd SET issue_id = p_target_issue_id WHERE issue_id = p_source_issue_id;
        UPDATE issue_workflows SET issue_id = p_target_issue_id WHERE issue_id = p_source_issue_id;
    END IF;

    -- Preserve analytical monitoring history. A merge changes the canonical
    -- Issue, not the monitoring period or its lifecycle state.
    UPDATE issue_monitors
    SET issue_id = p_target_issue_id, updated_at = now()
    WHERE issue_id = p_source_issue_id;

    -- Historical measurements remain immutable on the archived source Issue.
    -- They are intentionally NOT reassigned: the target will continue to
    -- receive fresh metrics from its consolidated evidence.

    DELETE FROM issue_articles WHERE issue_id = p_source_issue_id;
    DELETE FROM issue_print_articles WHERE issue_id = p_source_issue_id;
    DELETE FROM social_mention_issues WHERE issue_id = p_source_issue_id;
    DELETE FROM issue_opd WHERE issue_id = p_source_issue_id;
    DELETE FROM issue_districts WHERE issue_id = p_source_issue_id;

    UPDATE issues
    SET status = 'archived', updated_at = now()
    WHERE id = p_source_issue_id;

    INSERT INTO audit_logs (user_id, action, metadata)
    VALUES (
        p_user_id,
        'ISSUE_MERGED',
        jsonb_build_object(
            'sourceIssueId', p_source_issue_id,
            'sourceTitle', v_source.title,
            'sourceOriginalStatus', v_source.status,
            'targetIssueId', p_target_issue_id,
            'targetTitle', v_target.title,
            'reason', trim(p_reason),
            'mergeVersion', 'v3-canonical-target',
            'targetClassificationPreserved', true,
            'sourceIssueKeywordsPreserved', true,
            'sourceMetricsPreserved', true,
            'sourceMonitorsMoved', true,
            'provenance', jsonb_build_object(
                'archivedSourceIssueId', p_source_issue_id,
                'canonicalTargetIssueId', p_target_issue_id,
                'evidenceMovedToTarget', true,
                'monitorsMovedToTarget', true,
                'metricsRemainOnArchivedSource', true,
                'targetPrimaryKeywordPreserved', true,
                'targetLeadingOpdPreserved', true
            ),
            'mergedAt', now()
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'sourceIssueId', p_source_issue_id,
        'targetIssueId', p_target_issue_id,
        'sourceStatus', 'archived',
        'targetStatus', v_target.status
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_issue_publication_evidence_file_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN IF (SELECT count(*) FROM issue_publication_evidence_files WHERE evidence_id=NEW.evidence_id) >= 3 THEN RAISE EXCEPTION 'publication evidence supports maximum 3 files'; END IF; RETURN NEW; END $function$
;

CREATE OR REPLACE FUNCTION public.enforce_issue_publication_evidence_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN IF (SELECT count(*) FROM issue_publication_evidence WHERE workflow_id=NEW.workflow_id) >= 5 THEN RAISE EXCEPTION 'Maximum 5 publication evidence items per workflow'; END IF; RETURN NEW; END; $function$
;

CREATE TRIGGER trg_keywords_normalize_master_fields BEFORE INSERT OR UPDATE OF keyword ON public.keywords FOR EACH ROW EXECUTE FUNCTION normalize_keyword_master_fields();

CREATE TRIGGER trg_keyword_opd_supporting_limit BEFORE INSERT OR UPDATE OF active, routing_role, keyword_id, opd_id ON public.keyword_opd FOR EACH ROW EXECUTE FUNCTION enforce_keyword_opd_supporting_limit();

CREATE TRIGGER trg_issue_publication_evidence_limit BEFORE INSERT ON public.issue_publication_evidence FOR EACH ROW EXECUTE FUNCTION enforce_issue_publication_evidence_limit();

CREATE TRIGGER trg_issue_publication_evidence_file_limit BEFORE INSERT ON public.issue_publication_evidence_files FOR EACH ROW EXECUTE FUNCTION enforce_issue_publication_evidence_file_limit();
