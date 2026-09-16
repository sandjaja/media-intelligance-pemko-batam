-- Phase 2 Print Media Intelligence / OCR foundation

CREATE TABLE IF NOT EXISTS print_articles (
  id BIGSERIAL PRIMARY KEY,
  edition_id BIGINT NOT NULL REFERENCES print_editions(id) ON DELETE CASCADE,
  opd_id BIGINT REFERENCES opd(id) ON DELETE SET NULL,
  district_id BIGINT REFERENCES districts(id) ON DELETE SET NULL,
  title TEXT,
  subtitle TEXT,
  author TEXT,
  summary TEXT,
  body_text TEXT,
  is_headline BOOLEAN NOT NULL DEFAULT FALSE,
  is_continued BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','ocr_processing','needs_review','verified','analyzed','failed')),
  sentiment TEXT CHECK (sentiment IN ('positive','neutral','negative')),
  risk_score NUMERIC NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  importance_score NUMERIC NOT NULL DEFAULT 0 CHECK (importance_score >= 0 AND importance_score <= 100),
  ocr_confidence NUMERIC CHECK (ocr_confidence >= 0 AND ocr_confidence <= 100),
  ai_metadata JSONB,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_print_articles_edition ON print_articles(edition_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_articles_opd ON print_articles(opd_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_articles_district ON print_articles(district_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_articles_status ON print_articles(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_articles_headline ON print_articles(is_headline, created_at DESC) WHERE is_headline = TRUE;

CREATE TABLE IF NOT EXISTS print_upload_files (
  id BIGSERIAL PRIMARY KEY,
  edition_id BIGINT NOT NULL REFERENCES print_editions(id) ON DELETE CASCADE,
  media_scan_id BIGINT REFERENCES media_scans(id) ON DELETE SET NULL,
  original_name TEXT NOT NULL,
  storage_key TEXT,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0 AND byte_size <= 26214400),
  file_order INTEGER NOT NULL DEFAULT 1 CHECK (file_order > 0),
  page_count INTEGER CHECK (page_count IS NULL OR page_count > 0),
  content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','ocr_processing','processed','failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_print_upload_files_edition ON print_upload_files(edition_id, file_order, id);
CREATE INDEX IF NOT EXISTS idx_print_upload_files_status ON print_upload_files(status, created_at DESC);

CREATE TABLE IF NOT EXISTS print_article_pages (
  article_id BIGINT NOT NULL REFERENCES print_articles(id) ON DELETE CASCADE,
  page_id BIGINT NOT NULL REFERENCES print_pages(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL DEFAULT 1 CHECK (sequence_no > 0),
  bbox JSONB,
  clipping_image_key TEXT,
  ocr_text TEXT,
  ocr_confidence NUMERIC CHECK (ocr_confidence >= 0 AND ocr_confidence <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(article_id, page_id),
  UNIQUE(article_id, sequence_no)
);
CREATE INDEX IF NOT EXISTS idx_print_article_pages_page ON print_article_pages(page_id);

CREATE TABLE IF NOT EXISTS print_ocr_results (
  id BIGSERIAL PRIMARY KEY,
  upload_file_id BIGINT REFERENCES print_upload_files(id) ON DELETE CASCADE,
  page_id BIGINT REFERENCES print_pages(id) ON DELETE CASCADE,
  article_id BIGINT REFERENCES print_articles(id) ON DELETE CASCADE,
  engine TEXT,
  engine_version TEXT,
  raw_text TEXT,
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 100),
  extracted_fields JSONB,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued','processing','completed','failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (upload_file_id IS NOT NULL OR page_id IS NOT NULL OR article_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_print_ocr_article ON print_ocr_results(article_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_ocr_page ON print_ocr_results(page_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_ocr_upload ON print_ocr_results(upload_file_id, created_at DESC);

CREATE TABLE IF NOT EXISTS print_article_keywords (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES print_articles(id) ON DELETE CASCADE,
  keyword_id BIGINT REFERENCES keywords(id) ON DELETE SET NULL,
  keyword_text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'operator' CHECK (source IN ('matched','ai','operator')),
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_print_article_keywords_article ON print_article_keywords(article_id);
CREATE INDEX IF NOT EXISTS idx_print_article_keywords_keyword ON print_article_keywords(keyword_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_print_article_keyword_text ON print_article_keywords(article_id, lower(keyword_text), source);

ALTER TABLE evidence_sources ADD COLUMN IF NOT EXISTS print_article_id BIGINT REFERENCES print_articles(id) ON DELETE CASCADE;
ALTER TABLE evidence_sources DROP CONSTRAINT IF EXISTS evidence_sources_check;
ALTER TABLE evidence_sources ADD CONSTRAINT evidence_sources_check CHECK (article_id IS NOT NULL OR media_scan_id IS NOT NULL OR print_article_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_evidence_print_article ON evidence_sources(print_article_id);

ALTER TABLE print_editions DROP CONSTRAINT IF EXISTS print_editions_source_id_edition_date_edition_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_print_editions_source_date_name ON print_editions(source_id, edition_date, COALESCE(edition_name,''));

ALTER TABLE print_clippings ADD COLUMN IF NOT EXISTS article_id BIGINT REFERENCES print_articles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_print_clippings_article ON print_clippings(article_id);
