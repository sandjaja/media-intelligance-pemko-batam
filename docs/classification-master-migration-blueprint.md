# Classification Master Migration Blueprint

Status: **Blueprint only — do not apply to database yet**

Baseline approved: 10 sectors, 40 taxonomies, master keywords with strong/medium/supporting weights.
Target branch for eventual testing: Neon preview for `fix/media-intelligence-v2`.

## 1. Current-state audit

Current preview database contains:
- 15 active rows in `taxonomy_categories`.
- 9 rows in `issues`.
- 3 rows in `keywords`, still storing comma-separated keyword lists.
- `keyword_taxonomy` already supports relation-level `weight` (0 < weight <= 10).
- `issues.taxonomy_category_id` uses `ON DELETE SET NULL`.
- `issue_articles` and `issue_print_articles` preserve article-to-issue history.
- `issue_opd` preserves leading/supporting OPD responsibility.
- `keywords` currently requires exactly one target (`opd_id` XOR `district_id`), so it cannot yet function as a global keyword master.

## 2. Target model

Logical flow:

`Sector -> Taxonomy -> Master Keyword -> Article/Mention -> Issue -> OPD/District`

### 2.1 Proposed `classification_sectors`

Fields:
- `id BIGSERIAL PRIMARY KEY`
- `organization_id BIGINT REFERENCES organizations(id)`
- `code TEXT NOT NULL`
- `name TEXT NOT NULL`
- `description TEXT NULL`
- `sort_order SMALLINT NOT NULL DEFAULT 0`
- `active BOOLEAN NOT NULL DEFAULT TRUE`
- timestamps

Recommended uniqueness: `(organization_id, code)` and `(organization_id, name)`.

### 2.2 Extend `taxonomy_categories`

Add without removing existing fields:
- `organization_id BIGINT NULL REFERENCES organizations(id)` during transition
- `sector_id BIGINT NULL REFERENCES classification_sectors(id)`
- `sort_order SMALLINT NOT NULL DEFAULT 0`
- optional `legacy BOOLEAN NOT NULL DEFAULT FALSE`

During migration, old taxonomy remains addressable. New master taxonomies are linked to a sector. After validation, old taxonomy is marked inactive/legacy rather than deleted.

### 2.3 Normalize `keywords`

Final intent: one keyword phrase = one master record.

Recommended fields after transition:
- `organization_id`
- `keyword`
- `normalized_keyword`
- `match_type`
- `active`
- timestamps

`normalized_keyword` should be lowercased, trimmed, and whitespace-collapsed for deduplication.

### 2.4 Relation tables

Keep and use existing `keyword_taxonomy(keyword_id, category_id, weight, active)`.

Add:
- `keyword_opd(keyword_id, opd_id, weight, active)`
- `keyword_district(keyword_id, district_id, weight, active)`

This removes the long-term need for `keywords.opd_id` / `keywords.district_id` as exclusive targets. Those columns must remain during compatibility phase and are only retired after backend/UI has switched to relation tables.

### 2.5 Weight convention

Recommended numeric mapping for `keyword_taxonomy.weight`:
- Strong = 8.0
- Medium = 5.0
- Supporting = 2.0

Supporting terms must not classify a taxonomy alone; they should require additional evidence from title/context/another keyword/entity.

## 3. Legacy taxonomy mapping

| Legacy taxonomy | Proposed destination | Migration mode |
|---|---|---|
| Olahraga & Kepemudaan | Kepemudaan & Olahraga | direct |
| Infrastruktur & Transportasi | depends on issue/article: Jalan & Jembatan; Drainase & Pengendalian Banjir; Transportasi Publik; Perparkiran; Lalu Lintas & Keselamatan; Pelabuhan & Transportasi Laut Lokal | split/manual/contextual |
| Pelayanan Publik | Kinerja Pelayanan Publik | direct by default, contextual exceptions allowed |
| Ekonomi & Perdagangan | Harga & Stok Pangan; Industri & Ketenagakerjaan; UMKM & Koperasi | split/contextual |
| Investasi & Pariwisata | Investasi & Perizinan OR Kebudayaan & Pariwisata | split/contextual |
| Sosial & Kesejahteraan | Bantuan Sosial & Kemiskinan | direct by default |
| Lingkungan | Kebersihan & Persampahan OR Lingkungan & Pencemaran | split/contextual |
| Keamanan & Ketertiban | Ketertiban Umum | direct by default |
| Kesehatan | Layanan Kesehatan OR Penyakit & Pencegahan | split/contextual |
| Pendidikan | Pendidikan Dasar & Menengah | direct by default |
| Pemerintahan | Kebijakan & Regulasi; DPRD & Pemerintahan; Akuntabilitas & Pengawasan; PPID/Kehumasan where context requires | split/contextual |
| Keuangan Daerah | Keuangan Daerah & APBD | direct |
| Ekonomi & Investasi | Investasi & Perizinan | direct by default |
| External / Instansi Vertikal | no taxonomy equivalent; treat as actor/entity/source context | retire taxonomy after content review |
| Keagamaan | Kegiatan & Syiar Keagamaan; Pembinaan & Pelayanan Keagamaan; Kerukunan & Rumah Ibadah | split/contextual |

## 4. Existing issue mapping

| Issue | Current taxonomy | Proposed taxonomy | Action |
|---|---|---|---|
| POPDA X Kepri 2026 / Prestasi Atlet Batam | Olahraga & Kepemudaan | Kepemudaan & Olahraga | migrate; preserve 3 print links and Dispora relation |
| Banjir/Genangan | Infrastruktur & Transportasi | Drainase & Pengendalian Banjir | migrate; preserve 3 print links and DBMSDA relation |
| Pemerintahan / Keuangan Daerah | Keuangan Daerah | Keuangan Daerah & APBD | pending article/source review because current OPD relation points to Diskominfo |
| Ekonomi & Investasi | Ekonomi & Investasi | Investasi & Perizinan | reclassify; issue is category-like and has no article links; consider archive after validation |
| Pelayanan publik | Pelayanan Publik | Kinerja Pelayanan Publik | reclassify; category-like and has no article links; consider archive after validation |
| Instansi Vertikal | External / Instansi Vertikal | none | do not migrate as taxonomy; review then archive/reclassify by article context |
| Pemuda | Olahraga & Kepemudaan | Kepemudaan & Olahraga | reclassify; category-like and has no article links |
| MTQ kota batam | Keagamaan | Kegiatan & Syiar Keagamaan | migrate |
| Infrastruktur & Transportasi | Infrastruktur & Transportasi | none directly | generic/category-like; review context, then archive or reclassify |

## 5. Existing keyword migration

Current records:
1. `Aktivasi IKD, pelayanan kependudukan,`
2. `Media,digital`
3. `Popda, pon, olahraga, pemuda`

Target handling:
- split by comma/semicolon/newline;
- trim empty values;
- normalize and deduplicate;
- create/reuse one master record per phrase;
- preserve OPD relation through `keyword_opd`;
- preserve/add taxonomy relation through `keyword_taxonomy`.

Examples:
- `Aktivasi IKD` -> Kependudukan & Adminduk (Strong/Medium depending exact phrase)
- `pelayanan kependudukan` -> Kependudukan & Adminduk
- `POPDA` -> Kepemudaan & Olahraga (Strong)
- `PON` -> Kepemudaan & Olahraga (Medium)
- `olahraga` -> Kepemudaan & Olahraga (Supporting)
- `pemuda` -> Kepemudaan & Olahraga (Supporting)
- `media` and `digital` are too broad as standalone taxonomy signals and should not be promoted automatically without context.

## 6. Safe migration sequence

1. Create additive schema only (`classification_sectors`, relation tables, nullable sector/org links).
2. Seed 10 sectors + 40 new taxonomies as active master rows.
3. Seed normalized master keywords and `keyword_taxonomy` weights.
4. Split legacy keyword lists into master keyword records and relations.
5. Repoint only clearly mapped issues first (POPDA, Banjir, MTQ).
6. Review ambiguous/category-like issues before repointing or archiving.
7. Switch analyzer/router to new taxonomy hierarchy and relation-driven keyword lookup.
8. Run regression tests against known article titles (jalan, sampah, pelayanan publik, Dishub, MTQ, PPID, hoaks, etc.).
9. Switch admin UI to Sector -> Taxonomy -> Keyword hierarchy.
10. Mark legacy taxonomies inactive only after validation. Do not delete them.
11. Remove compatibility columns/constraints only in a later migration after all application code no longer uses them.

## 7. Explicit safety rules

- No legacy taxonomy deletion in the first migration.
- No issue deletion during taxonomy migration.
- No deletion of issue/article or issue/print-article link rows.
- No automatic migration of ambiguous legacy categories without contextual review.
- No removal of `keywords.opd_id` / `keywords.district_id` until backend/UI is fully relation-based.
- Database changes must be tested on the preview branch before any parent/default branch change.

## 8. Recommended next implementation unit

Create a migration draft `108_classification_master_foundation.sql` that is **additive only**:
- create `classification_sectors`;
- add `sector_id` / `organization_id` / `sort_order` / `legacy` to taxonomy;
- create `keyword_opd` and `keyword_district`;
- add normalized keyword support without dropping current target columns or constraints.

Do not seed/migrate the 10-sector/40-taxonomy data in the same structural migration. Seed data should be a separate migration after structural validation.