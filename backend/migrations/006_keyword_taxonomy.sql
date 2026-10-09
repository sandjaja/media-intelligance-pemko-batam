-- Phase 2E keyword-to-taxonomy mapping.
-- Additive and backward compatible: existing keyword -> OPD behavior remains intact.

ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 2
  CHECK (priority BETWEEN 1 AND 3);

CREATE TABLE IF NOT EXISTS taxonomy_categories (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS keyword_taxonomy (
  keyword_id BIGINT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES taxonomy_categories(id) ON DELETE CASCADE,
  weight NUMERIC(5,2) NOT NULL DEFAULT 1.00 CHECK (weight > 0 AND weight <= 10),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(keyword_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_keywords_priority ON keywords(active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_taxonomy_category ON keyword_taxonomy(category_id, active);
CREATE INDEX IF NOT EXISTS idx_keyword_taxonomy_keyword ON keyword_taxonomy(keyword_id, active);

INSERT INTO taxonomy_categories(code,name,description) VALUES
('SPORT_YOUTH','Olahraga & Kepemudaan','Olahraga, atlet, kompetisi, pembinaan dan kepemudaan'),
('INFRA_TRANSPORT','Infrastruktur & Transportasi','Jalan, jembatan, pelabuhan, transportasi dan infrastruktur'),
('PUBLIC_SERVICE','Pelayanan Publik','Pelayanan, administrasi, perizinan dan pengaduan masyarakat'),
('ECON_TRADE','Ekonomi & Perdagangan','Ekonomi, perdagangan, harga, inflasi, pasar dan distribusi'),
('INVESTMENT_TOURISM','Investasi & Pariwisata','Investasi, industri, pariwisata dan pengembangan usaha'),
('SOCIAL_WELFARE','Sosial & Kesejahteraan','Bantuan sosial, CSR, sembako, kesejahteraan dan penerima manfaat'),
('ENVIRONMENT','Lingkungan','Sampah, pencemaran, banjir, limbah dan lingkungan hidup'),
('SECURITY_ORDER','Keamanan & Ketertiban','Keamanan, kriminal, demonstrasi dan ketertiban umum'),
('HEALTH','Kesehatan','Kesehatan, rumah sakit, puskesmas, wabah dan layanan kesehatan'),
('EDUCATION','Pendidikan','Sekolah, siswa, guru, beasiswa dan pendidikan'),
('GOVERNANCE','Pemerintahan','Kebijakan, anggaran, regulasi, tata kelola dan administrasi pemerintahan')
ON CONFLICT (code) DO UPDATE
SET name=EXCLUDED.name,
    description=EXCLUDED.description,
    active=TRUE,
    updated_at=now();

INSERT INTO keyword_taxonomy(keyword_id,category_id,weight)
SELECT k.id,c.id,3.00
FROM keywords k
JOIN taxonomy_categories c ON c.code='SPORT_YOUTH'
WHERE k.active=true
  AND lower(k.keyword) ~ '(olahraga|atlet|popda|porprov|pon|pemuda|kepemudaan|medali|kontingen|cabor|sport)'
ON CONFLICT (keyword_id,category_id) DO NOTHING;

INSERT INTO keyword_taxonomy(keyword_id,category_id,weight)
SELECT k.id,c.id,2.50
FROM keywords k
JOIN taxonomy_categories c ON c.code='PUBLIC_SERVICE'
WHERE k.active=true
  AND lower(k.keyword) ~ '(pelayanan|perizinan|pengaduan|administrasi|kependudukan|ikd)'
ON CONFLICT (keyword_id,category_id) DO NOTHING;

INSERT INTO keyword_taxonomy(keyword_id,category_id,weight)
SELECT k.id,c.id,2.50
FROM keywords k
JOIN taxonomy_categories c ON c.code='ECON_TRADE'
WHERE k.active=true
  AND lower(k.keyword) ~ '(pasar murah|harga|inflasi|sembako|perdagangan|distribusi|pangan|daya beli)'
ON CONFLICT (keyword_id,category_id) DO NOTHING;

INSERT INTO keyword_taxonomy(keyword_id,category_id,weight)
SELECT k.id,c.id,2.50
FROM keywords k
JOIN taxonomy_categories c ON c.code='SOCIAL_WELFARE'
WHERE k.active=true
  AND lower(k.keyword) ~ '(csr|bantuan sosial|bansos|sembako|penerima manfaat|kesejahteraan|kurang mampu)'
ON CONFLICT (keyword_id,category_id) DO NOTHING;
