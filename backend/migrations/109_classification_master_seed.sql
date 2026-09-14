-- 109_classification_master_seed.sql
-- Additive seed only: 10 sectors + 40 master taxonomies.
-- Does not deactivate/delete legacy taxonomy or modify issues.

WITH org AS (
  SELECT id
  FROM organizations
  WHERE code = 'PEMKO_BATAM'
  ORDER BY id
  LIMIT 1
), seed(code, name, description, sort_order) AS (
  VALUES
    ('INFRA_TATARUANG', 'Infrastruktur & Tata Ruang', 'Infrastruktur dasar, tata ruang, permukiman, penerangan dan sarana publik.', 1),
    ('PERHUB_TRANSPORT', 'Perhubungan & Transportasi', 'Transportasi publik, parkir, lalu lintas dan transportasi laut lokal.', 2),
    ('EKON_INDUSTRI_DAGANG', 'Ekonomi, Industri & Perdagangan', 'Harga pangan, investasi, ketenagakerjaan, UMKM dan koperasi.', 3),
    ('LAYANAN_TRANSFORMASI', 'Pelayanan Publik & Transformasi Digital', 'Administrasi publik, pengaduan, SPBE, layanan digital dan keamanan informasi.', 4),
    ('KESEHATAN_LINGKUNGAN', 'Kesehatan & Lingkungan', 'Layanan kesehatan, pencegahan penyakit, persampahan dan lingkungan.', 5),
    ('PENDIDIKAN_BUDAYA_OLAHRAGA', 'Pendidikan, Kebudayaan & Olahraga', 'Pendidikan, kebudayaan, pariwisata, kepemudaan dan olahraga.', 6),
    ('SOSIAL_TRANTIB_BENCANA', 'Sosial, Ketenteraman & Bencana', 'Bantuan sosial, ketertiban umum, kebencanaan dan perlindungan masyarakat.', 7),
    ('TATAKELOLA_HUKUM', 'Tata Kelola Pemerintahan & Hukum', 'Regulasi, keuangan daerah, pengawasan dan pemerintahan daerah.', 8),
    ('AGAMA_KEMASYARAKATAN', 'Keagamaan & Kemasyarakatan', 'Kegiatan keagamaan, pelayanan keagamaan, kerukunan dan organisasi kemasyarakatan.', 9),
    ('INFORMASI_HUMAS_KOMUNIKASI', 'Informasi Publik, Kehumasan & Komunikasi', 'PPID, kehumasan, hubungan pers dan komunikasi publik pemerintah.', 10)
)
INSERT INTO classification_sectors (organization_id, code, name, description, sort_order, active, created_at, updated_at)
SELECT org.id, seed.code, seed.name, seed.description, seed.sort_order, TRUE, NOW(), NOW()
FROM org CROSS JOIN seed
ON CONFLICT (organization_id, code)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = TRUE,
  updated_at = NOW();

WITH org AS (
  SELECT id
  FROM organizations
  WHERE code = 'PEMKO_BATAM'
  ORDER BY id
  LIMIT 1
), seed(sector_code, code, name, description, sort_order) AS (
  VALUES
    ('INFRA_TATARUANG','INFRA_JALAN_JEMBATAN','Jalan & Jembatan','Jalan, jembatan, trotoar dan pekerjaan peningkatan/pemeliharaan akses darat.',1),
    ('INFRA_TATARUANG','INFRA_DRAINASE_BANJIR','Drainase & Pengendalian Banjir','Drainase, genangan, banjir, rob dan normalisasi saluran.',2),
    ('INFRA_TATARUANG','INFRA_TATARUANG_PERMUKIMAN','Tata Ruang & Permukiman','Tata ruang, permukiman, RTLH, bangunan liar dan pemakaman.',3),
    ('INFRA_TATARUANG','INFRA_PENERANGAN_SARANA','Penerangan & Sarana Publik','PJU, lampu jalan, taman dan fasilitas publik.',4),

    ('PERHUB_TRANSPORT','TRANS_PUBLIK','Transportasi Publik','Trans Batam, BRT, halte, rute dan angkutan umum.',1),
    ('PERHUB_TRANSPORT','TRANS_PARKIR','Perparkiran','Parkir, jukir, retribusi parkir dan sistem parkir elektronik.',2),
    ('PERHUB_TRANSPORT','TRANS_LALIN_KESELAMATAN','Lalu Lintas & Keselamatan','Kemacetan, rekayasa lalu lintas, rambu, marka dan ATCS.',3),
    ('PERHUB_TRANSPORT','TRANS_LAUT_LOKAL','Pelabuhan & Transportasi Laut Lokal','Pelabuhan rakyat/pengumpan, pompong dan angkutan laut lokal.',4),

    ('EKON_INDUSTRI_DAGANG','EKON_HARGA_STOK_PANGAN','Harga & Stok Pangan','Harga, stok dan stabilisasi bahan pokok serta pangan.',1),
    ('EKON_INDUSTRI_DAGANG','EKON_INVESTASI_PERIZINAN','Investasi & Perizinan','Investasi, perizinan usaha, OSS dan kemudahan berusaha.',2),
    ('EKON_INDUSTRI_DAGANG','EKON_INDUSTRI_NAKER','Industri & Ketenagakerjaan','Ketenagakerjaan, hubungan industrial, UMK, PHK dan bursa kerja.',3),
    ('EKON_INDUSTRI_DAGANG','EKON_UMKM_KOPERASI','UMKM & Koperasi','Pembinaan UMKM, koperasi, modal, produk lokal dan sertifikasi.',4),

    ('LAYANAN_TRANSFORMASI','LAYANAN_ADMINDUK','Kependudukan & Adminduk','KTP-el, KK, IKD, akta dan administrasi kependudukan.',1),
    ('LAYANAN_TRANSFORMASI','LAYANAN_KINERJA_PUBLIK','Kinerja Pelayanan Publik','Standar layanan, kepuasan masyarakat, kualitas layanan dan maladministrasi.',2),
    ('LAYANAN_TRANSFORMASI','LAYANAN_SPBE_DIGITAL','SPBE & Layanan Digital','SPBE, aplikasi pemerintah, integrasi sistem dan layanan digital.',3),
    ('LAYANAN_TRANSFORMASI','LAYANAN_PENGADUAN','Pengaduan Masyarakat','Kanal aduan, SP4N LAPOR, keluhan warga dan tindak lanjut aduan.',4),
    ('LAYANAN_TRANSFORMASI','LAYANAN_SIBER','Keamanan Informasi & Siber','Keamanan informasi, serangan siber, kebocoran data dan insiden sistem.',5),

    ('KESEHATAN_LINGKUNGAN','KES_LAYANAN','Layanan Kesehatan','RSUD, puskesmas, ambulans, obat dan layanan medis.',1),
    ('KESEHATAN_LINGKUNGAN','KES_PENYAKIT_PENCEGAHAN','Penyakit & Pencegahan','DBD, stunting, imunisasi, wabah dan pencegahan penyakit.',2),
    ('KESEHATAN_LINGKUNGAN','LINGKUNGAN_SAMPAH','Kebersihan & Persampahan','Sampah, TPS/TPA, armada dan pengelolaan persampahan.',3),
    ('KESEHATAN_LINGKUNGAN','LINGKUNGAN_PENCEMARAN','Lingkungan & Pencemaran','Pencemaran, limbah B3, RTH dan kawasan lindung.',4),

    ('PENDIDIKAN_BUDAYA_OLAHRAGA','PENDIDIKAN_DASAR_MENENGAH','Pendidikan Dasar & Menengah','PPDB, sekolah, guru, beasiswa dan sarana pendidikan.',1),
    ('PENDIDIKAN_BUDAYA_OLAHRAGA','BUDAYA_PARIWISATA','Kebudayaan & Pariwisata','Budaya, cagar budaya, destinasi, wisatawan dan event wisata.',2),
    ('PENDIDIKAN_BUDAYA_OLAHRAGA','PEMUDA_OLAHRAGA','Kepemudaan & Olahraga','Pemuda, atlet, POPDA, stadion dan fasilitas olahraga.',3),

    ('SOSIAL_TRANTIB_BENCANA','SOSIAL_BANSOS_KEMISKINAN','Bantuan Sosial & Kemiskinan','Bansos, PKH, kemiskinan dan kesejahteraan sosial.',1),
    ('SOSIAL_TRANTIB_BENCANA','TRANTIB_UMUM','Ketertiban Umum','Satpol PP, penertiban, PKL, razia dan penegakan Perda.',2),
    ('SOSIAL_TRANTIB_BENCANA','BENCANA_CUACA','Kebencanaan & Cuaca','Bencana, cuaca ekstrem, BPBD, longsor, angin dan pohon tumbang.',3),
    ('SOSIAL_TRANTIB_BENCANA','SOSIAL_PERLINDUNGAN_MASYARAKAT','Perlindungan Masyarakat','KDRT, perlindungan perempuan/anak, Linmas dan Kota Layak Anak.',4),

    ('TATAKELOLA_HUKUM','GOV_KEBIJAKAN_REGULASI','Kebijakan & Regulasi','Perda, Perwako dan kebijakan/regulasi daerah.',1),
    ('TATAKELOLA_HUKUM','GOV_KEUANGAN_APBD','Keuangan Daerah & APBD','APBD, PAD, pajak, retribusi, pendapatan dan belanja daerah.',2),
    ('TATAKELOLA_HUKUM','GOV_AKUNTABILITAS_PENGAWASAN','Akuntabilitas & Pengawasan','BPK, WTP, LHKPN, inspektorat dan pengawasan internal.',3),
    ('TATAKELOLA_HUKUM','GOV_DPRD_PEMERINTAHAN','DPRD & Pemerintahan','DPRD, reses, paripurna, komisi dan Sekretariat DPRD.',4),

    ('AGAMA_KEMASYARAKATAN','AGAMA_SYIAR','Kegiatan & Syiar Keagamaan','MTQ/STQ, hari besar dan kegiatan keagamaan lintas agama.',1),
    ('AGAMA_KEMASYARAKATAN','AGAMA_PELAYANAN','Pembinaan & Pelayanan Keagamaan','Guru TPQ, imam, penyuluh, haji, zakat dan pembinaan keagamaan.',2),
    ('AGAMA_KEMASYARAKATAN','AGAMA_KERUKUNAN_IBADAH','Kerukunan & Rumah Ibadah','FKUB, toleransi, kerukunan dan rumah ibadah.',3),
    ('AGAMA_KEMASYARAKATAN','KEMASYARAKATAN_ORGANISASI','Organisasi & Kemasyarakatan','Ormas, LSM, RT/RW, LPM, hibah dan pembinaan organisasi.',4),

    ('INFORMASI_HUMAS_KOMUNIKASI','INFO_PPID','PPID & Keterbukaan Informasi','PPID, keterbukaan, permohonan dan sengketa informasi publik.',1),
    ('INFORMASI_HUMAS_KOMUNIKASI','HUMAS_PUBLIKASI','Kehumasan & Publikasi Pemerintah','Rilis, publikasi, peliputan dan dokumentasi pemerintah.',2),
    ('INFORMASI_HUMAS_KOMUNIKASI','HUMAS_MEDIA_PERS','Media & Hubungan Pers','Konferensi pers, hubungan media, wartawan dan kerja sama media.',3),
    ('INFORMASI_HUMAS_KOMUNIKASI','KOMUNIKASI_PUBLIK_ISU','Komunikasi Publik & Isu Pemerintah','Hoaks, disinformasi, klarifikasi, counter narasi dan isu publik.',4)
)
INSERT INTO taxonomy_categories
  (code, name, description, active, created_at, updated_at, organization_id, sector_id, sort_order, legacy)
SELECT
  seed.code,
  seed.name,
  seed.description,
  TRUE,
  NOW(),
  NOW(),
  org.id,
  sectors.id,
  seed.sort_order,
  FALSE
FROM org
JOIN seed ON TRUE
JOIN classification_sectors sectors
  ON sectors.organization_id = org.id
 AND sectors.code = seed.sector_code
ON CONFLICT (code)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  active = TRUE,
  updated_at = NOW(),
  organization_id = EXCLUDED.organization_id,
  sector_id = EXCLUDED.sector_id,
  sort_order = EXCLUDED.sort_order,
  legacy = FALSE;
