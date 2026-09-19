-- 110_master_keyword_seed.sql
-- Transition keywords toward a global master model and seed the approved taxonomy keywords.
-- Safety: no legacy keyword rows, taxonomy rows, issues, or article links are deleted.
-- Legacy OPD/district keyword rows remain active for compatibility until backend/UI switch.

BEGIN;

-- Backfill organization on legacy keyword rows.
WITH org AS (
  SELECT id FROM organizations WHERE code = 'PEMKO_BATAM' ORDER BY id LIMIT 1
)
UPDATE keywords k
SET organization_id = org.id,
    updated_at = now()
FROM org
WHERE k.organization_id IS NULL;

-- Relax the legacy XOR rule from "exactly one target" to "at most one target".
-- This preserves legacy targeted rows while allowing global master keywords with no direct target.
ALTER TABLE keywords DROP CONSTRAINT IF EXISTS keywords_single_target_check;
ALTER TABLE keywords
  ADD CONSTRAINT keywords_single_target_check
  CHECK (((opd_id IS NOT NULL)::int + (district_id IS NOT NULL)::int) <= 1) NOT VALID;

-- One global master keyword per organization + normalized phrase.
CREATE UNIQUE INDEX IF NOT EXISTS uq_keywords_global_master_normalized
  ON keywords (organization_id, normalized_keyword)
  WHERE organization_id IS NOT NULL AND opd_id IS NULL AND district_id IS NULL;

-- Approved master keyword seed. Weight convention: Strong=8, Medium=5, Supporting=2.
WITH seed(taxonomy_code, keyword, weight) AS (
  VALUES
    ('INFRA_JALAN_JEMBATAN','jalan rusak',8),('INFRA_JALAN_JEMBATAN','jalan berlubang',8),('INFRA_JALAN_JEMBATAN','lubang jalan',8),('INFRA_JALAN_JEMBATAN','pengaspalan',8),('INFRA_JALAN_JEMBATAN','pelebaran jalan',8),
    ('INFRA_JALAN_JEMBATAN','jembatan',5),('INFRA_JALAN_JEMBATAN','perbaikan jalan',5),('INFRA_JALAN_JEMBATAN','pembangunan jalan',5),('INFRA_JALAN_JEMBATAN','pedestrian',5),('INFRA_JALAN_JEMBATAN','trotoar',5),
    ('INFRA_JALAN_JEMBATAN','bahu jalan',2),('INFRA_JALAN_JEMBATAN','akses jalan',2),('INFRA_JALAN_JEMBATAN','peningkatan jalan',2),('INFRA_JALAN_JEMBATAN','pemeliharaan jalan',2),

    ('INFRA_DRAINASE_BANJIR','banjir',8),('INFRA_DRAINASE_BANJIR','genangan air',8),('INFRA_DRAINASE_BANJIR','banjir rob',8),('INFRA_DRAINASE_BANJIR','drainase tersumbat',8),('INFRA_DRAINASE_BANJIR','parit tumpat',8),
    ('INFRA_DRAINASE_BANJIR','drainase',5),('INFRA_DRAINASE_BANJIR','pengerukan drainase',5),('INFRA_DRAINASE_BANJIR','normalisasi drainase',5),('INFRA_DRAINASE_BANJIR','saluran air',5),
    ('INFRA_DRAINASE_BANJIR','gorong-gorong',2),('INFRA_DRAINASE_BANJIR','sedimentasi',2),('INFRA_DRAINASE_BANJIR','pengendalian banjir',2),('INFRA_DRAINASE_BANJIR','pompa banjir',2),

    ('INFRA_TATARUANG_PERMUKIMAN','bangunan liar',8),('INFRA_TATARUANG_PERMUKIMAN','bangli',8),('INFRA_TATARUANG_PERMUKIMAN','RTLH',8),('INFRA_TATARUANG_PERMUKIMAN','rumah tidak layak huni',8),('INFRA_TATARUANG_PERMUKIMAN','RTRW',8),
    ('INFRA_TATARUANG_PERMUKIMAN','penertiban bangunan',5),('INFRA_TATARUANG_PERMUKIMAN','permukiman',5),('INFRA_TATARUANG_PERMUKIMAN','tata ruang',5),('INFRA_TATARUANG_PERMUKIMAN','pemakaman',5),('INFRA_TATARUANG_PERMUKIMAN','TPU',5),
    ('INFRA_TATARUANG_PERMUKIMAN','kawasan kumuh',2),('INFRA_TATARUANG_PERMUKIMAN','rehabilitasi rumah',2),('INFRA_TATARUANG_PERMUKIMAN','zonasi',2),('INFRA_TATARUANG_PERMUKIMAN','pemanfaatan ruang',2),

    ('INFRA_PENERANGAN_SARANA','PJU',8),('INFRA_PENERANGAN_SARANA','lampu jalan',8),('INFRA_PENERANGAN_SARANA','lampu mati',8),
    ('INFRA_PENERANGAN_SARANA','penerangan jalan umum',5),('INFRA_PENERANGAN_SARANA','taman kota',5),('INFRA_PENERANGAN_SARANA','fasilitas umum',5),('INFRA_PENERANGAN_SARANA','fasum',5),
    ('INFRA_PENERANGAN_SARANA','sarana publik',2),('INFRA_PENERANGAN_SARANA','fasilitas kota',2),('INFRA_PENERANGAN_SARANA','pemeliharaan taman',2),

    ('TRANS_PUBLIK','Trans Batam',8),('TRANS_PUBLIK','BRT',8),('TRANS_PUBLIK','tarif Trans Batam',8),('TRANS_PUBLIK','rute Trans Batam',8),
    ('TRANS_PUBLIK','halte',5),('TRANS_PUBLIK','rute bus',5),('TRANS_PUBLIK','angkutan umum',5),('TRANS_PUBLIK','angkot',5),
    ('TRANS_PUBLIK','bus kota',2),('TRANS_PUBLIK','layanan bus',2),('TRANS_PUBLIK','koridor bus',2),('TRANS_PUBLIK','penumpang bus',2),

    ('TRANS_PARKIR','parkir liar',8),('TRANS_PARKIR','retribusi parkir',8),('TRANS_PARKIR','e-parking',8),('TRANS_PARKIR','juru parkir',8),('TRANS_PARKIR','jukir',8),
    ('TRANS_PARKIR','tarif parkir',5),('TRANS_PARKIR','parkir',5),('TRANS_PARKIR','titik parkir',5),
    ('TRANS_PARKIR','pengelolaan parkir',2),('TRANS_PARKIR','karcis parkir',2),('TRANS_PARKIR','parkir tepi jalan',2),

    ('TRANS_LALIN_KESELAMATAN','kemacetan',8),('TRANS_LALIN_KESELAMATAN','rekayasa lalu lintas',8),('TRANS_LALIN_KESELAMATAN','ATCS',8),
    ('TRANS_LALIN_KESELAMATAN','macet',5),('TRANS_LALIN_KESELAMATAN','rambu jalan',5),('TRANS_LALIN_KESELAMATAN','marka jalan',5),('TRANS_LALIN_KESELAMATAN','lampu merah',5),
    ('TRANS_LALIN_KESELAMATAN','keselamatan lalu lintas',2),('TRANS_LALIN_KESELAMATAN','simpang',2),('TRANS_LALIN_KESELAMATAN','arus lalu lintas',2),('TRANS_LALIN_KESELAMATAN','traffic light',2),

    ('TRANS_LAUT_LOKAL','pelabuhan rakyat',8),('TRANS_LAUT_LOKAL','pompong',8),('TRANS_LAUT_LOKAL','bot penumpang',8),('TRANS_LAUT_LOKAL','pelabuhan pengumpan',8),
    ('TRANS_LAUT_LOKAL','tarif laut',5),('TRANS_LAUT_LOKAL','keselamatan pelayaran',5),('TRANS_LAUT_LOKAL','angkutan laut lokal',5),
    ('TRANS_LAUT_LOKAL','dermaga rakyat',2),('TRANS_LAUT_LOKAL','kapal penumpang lokal',2),('TRANS_LAUT_LOKAL','transportasi antarpulau',2),

    ('EKON_HARGA_STOK_PANGAN','sembako',8),('EKON_HARGA_STOK_PANGAN','harga beras',8),('EKON_HARGA_STOK_PANGAN','pasar murah',8),('EKON_HARGA_STOK_PANGAN','operasi pasar',8),('EKON_HARGA_STOK_PANGAN','LPG 3 kg',8),('EKON_HARGA_STOK_PANGAN','gas melon',8),
    ('EKON_HARGA_STOK_PANGAN','cabai mahal',5),('EKON_HARGA_STOK_PANGAN','harga pangan',5),('EKON_HARGA_STOK_PANGAN','stok pangan',5),('EKON_HARGA_STOK_PANGAN','inflasi pangan',5),
    ('EKON_HARGA_STOK_PANGAN','ketersediaan bahan pokok',2),('EKON_HARGA_STOK_PANGAN','harga kebutuhan pokok',2),('EKON_HARGA_STOK_PANGAN','distributor pangan',2),

    ('EKON_INVESTASI_PERIZINAN','OSS',8),('EKON_INVESTASI_PERIZINAN','izin usaha',8),('EKON_INVESTASI_PERIZINAN','investasi',8),('EKON_INVESTASI_PERIZINAN','investor',8),('EKON_INVESTASI_PERIZINAN','kemudahan berusaha',8),
    ('EKON_INVESTASI_PERIZINAN','Mal Pelayanan Publik',5),('EKON_INVESTASI_PERIZINAN','MPP',5),('EKON_INVESTASI_PERIZINAN','perizinan berusaha',5),('EKON_INVESTASI_PERIZINAN','realisasi investasi',5),
    ('EKON_INVESTASI_PERIZINAN','pelayanan perizinan',2),('EKON_INVESTASI_PERIZINAN','penanaman modal',2),('EKON_INVESTASI_PERIZINAN','iklim investasi',2),

    ('EKON_INDUSTRI_NAKER','UMK',8),('EKON_INDUSTRI_NAKER','PHK',8),('EKON_INDUSTRI_NAKER','job fair',8),('EKON_INDUSTRI_NAKER','mogok kerja',8),('EKON_INDUSTRI_NAKER','demo buruh',8),
    ('EKON_INDUSTRI_NAKER','pencaker',5),('EKON_INDUSTRI_NAKER','kartu kuning',5),('EKON_INDUSTRI_NAKER','serikat pekerja',5),('EKON_INDUSTRI_NAKER','ketenagakerjaan',5),
    ('EKON_INDUSTRI_NAKER','lowongan kerja',2),('EKON_INDUSTRI_NAKER','hubungan industrial',2),('EKON_INDUSTRI_NAKER','tenaga kerja',2),('EKON_INDUSTRI_NAKER','pekerja',2),

    ('EKON_UMKM_KOPERASI','UMKM',8),('EKON_UMKM_KOPERASI','koperasi',8),('EKON_UMKM_KOPERASI','pelatihan UMKM',8),('EKON_UMKM_KOPERASI','bantuan modal',8),
    ('EKON_UMKM_KOPERASI','produk lokal',5),('EKON_UMKM_KOPERASI','sertifikat halal',5),('EKON_UMKM_KOPERASI','usaha mikro',5),('EKON_UMKM_KOPERASI','usaha kecil',5),
    ('EKON_UMKM_KOPERASI','pembinaan UMKM',2),('EKON_UMKM_KOPERASI','pemasaran UMKM',2),('EKON_UMKM_KOPERASI','koperasi aktif',2),

    ('LAYANAN_ADMINDUK','KTP-el',8),('LAYANAN_ADMINDUK','IKD',8),('LAYANAN_ADMINDUK','Kartu Keluarga',8),('LAYANAN_ADMINDUK','perekaman KTP',8),('LAYANAN_ADMINDUK','antrean Disdukcapil',8),
    ('LAYANAN_ADMINDUK','KTP',5),('LAYANAN_ADMINDUK','akta lahir',5),('LAYANAN_ADMINDUK','adminduk',5),('LAYANAN_ADMINDUK','administrasi kependudukan',5),
    ('LAYANAN_ADMINDUK','akta kematian',2),('LAYANAN_ADMINDUK','pindah datang',2),('LAYANAN_ADMINDUK','dokumen kependudukan',2),

    ('LAYANAN_KINERJA_PUBLIK','pelayanan lambat',8),('LAYANAN_KINERJA_PUBLIK','pungli',8),('LAYANAN_KINERJA_PUBLIK','maklumat pelayanan',8),('LAYANAN_KINERJA_PUBLIK','standar pelayanan',8),
    ('LAYANAN_KINERJA_PUBLIK','kepuasan masyarakat',5),('LAYANAN_KINERJA_PUBLIK','kualitas pelayanan',5),('LAYANAN_KINERJA_PUBLIK','inovasi pelayanan',5),
    ('LAYANAN_KINERJA_PUBLIK','maladministrasi',2),('LAYANAN_KINERJA_PUBLIK','waktu layanan',2),('LAYANAN_KINERJA_PUBLIK','antrean pelayanan',2),

    ('LAYANAN_SPBE_DIGITAL','SPBE',8),('LAYANAN_SPBE_DIGITAL','Batam Single Window',8),('LAYANAN_SPBE_DIGITAL','aplikasi Pemko',8),('LAYANAN_SPBE_DIGITAL','server down',8),
    ('LAYANAN_SPBE_DIGITAL','layanan digital',5),('LAYANAN_SPBE_DIGITAL','WiFi gratis',5),('LAYANAN_SPBE_DIGITAL','CCTV kota',5),('LAYANAN_SPBE_DIGITAL','integrasi sistem',5),
    ('LAYANAN_SPBE_DIGITAL','transformasi digital',2),('LAYANAN_SPBE_DIGITAL','layanan daring',2),('LAYANAN_SPBE_DIGITAL','sistem informasi pemerintah',2),

    ('LAYANAN_PENGADUAN','SP4N LAPOR',8),('LAYANAN_PENGADUAN','lapor pemko',8),('LAYANAN_PENGADUAN','aduan warga',8),('LAYANAN_PENGADUAN','tanggap aduan',8),
    ('LAYANAN_PENGADUAN','keluhan publik',5),('LAYANAN_PENGADUAN','pengaduan masyarakat',5),('LAYANAN_PENGADUAN','laporan warga',5),
    ('LAYANAN_PENGADUAN','tindak lanjut aduan',2),('LAYANAN_PENGADUAN','kanal pengaduan',2),('LAYANAN_PENGADUAN','respons aduan',2),

    ('LAYANAN_SIBER','serangan siber',8),('LAYANAN_SIBER','kebocoran data',8),('LAYANAN_SIBER','peretasan',8),('LAYANAN_SIBER','keamanan informasi',8),
    ('LAYANAN_SIBER','retas web',5),('LAYANAN_SIBER','insiden siber',5),('LAYANAN_SIBER','phishing',5),('LAYANAN_SIBER','keamanan aplikasi',5),
    ('LAYANAN_SIBER','CSIRT',2),('LAYANAN_SIBER','keamanan data',2),('LAYANAN_SIBER','proteksi sistem',2),('LAYANAN_SIBER','pemulihan sistem',2),

    ('KES_LAYANAN','RSUD Embung Fatimah',8),('KES_LAYANAN','Puskesmas',8),('KES_LAYANAN','antrean obat',8),('KES_LAYANAN','ambulans',8),
    ('KES_LAYANAN','BPJS Kesehatan',5),('KES_LAYANAN','layanan medis',5),('KES_LAYANAN','pelayanan kesehatan',5),
    ('KES_LAYANAN','dokter',2),('KES_LAYANAN','obat',2),('KES_LAYANAN','fasilitas kesehatan',2),('KES_LAYANAN','rujukan pasien',2),

    ('KES_PENYAKIT_PENCEGAHAN','DBD',8),('KES_PENYAKIT_PENCEGAHAN','demam berdarah',8),('KES_PENYAKIT_PENCEGAHAN','stunting',8),('KES_PENYAKIT_PENCEGAHAN','gizi buruk',8),('KES_PENYAKIT_PENCEGAHAN','wabah',8),
    ('KES_PENYAKIT_PENCEGAHAN','imunisasi',5),('KES_PENYAKIT_PENCEGAHAN','posyandu',5),('KES_PENYAKIT_PENCEGAHAN','pencegahan penyakit',5),
    ('KES_PENYAKIT_PENCEGAHAN','fogging',2),('KES_PENYAKIT_PENCEGAHAN','surveilans',2),('KES_PENYAKIT_PENCEGAHAN','kesehatan ibu anak',2),('KES_PENYAKIT_PENCEGAHAN','gizi',2),

    ('LINGKUNGAN_SAMPAH','sampah',8),('LINGKUNGAN_SAMPAH','tumpukan sampah',8),('LINGKUNGAN_SAMPAH','TPS',8),('LINGKUNGAN_SAMPAH','TPA Teluk Bakau',8),('LINGKUNGAN_SAMPAH','armada sampah',8),
    ('LINGKUNGAN_SAMPAH','retribusi sampah',5),('LINGKUNGAN_SAMPAH','pengangkutan sampah',5),('LINGKUNGAN_SAMPAH','pengelolaan sampah',5),
    ('LINGKUNGAN_SAMPAH','bank sampah',2),('LINGKUNGAN_SAMPAH','kebersihan kota',2),('LINGKUNGAN_SAMPAH','petugas kebersihan',2),

    ('LINGKUNGAN_PENCEMARAN','pencemaran laut',8),('LINGKUNGAN_PENCEMARAN','limbah B3',8),('LINGKUNGAN_PENCEMARAN','pencemaran udara',8),
    ('LINGKUNGAN_PENCEMARAN','RTH',5),('LINGKUNGAN_PENCEMARAN','hutan lindung',5),('LINGKUNGAN_PENCEMARAN','pencemaran lingkungan',5),
    ('LINGKUNGAN_PENCEMARAN','kualitas udara',2),('LINGKUNGAN_PENCEMARAN','limbah',2),('LINGKUNGAN_PENCEMARAN','ruang terbuka hijau',2),('LINGKUNGAN_PENCEMARAN','konservasi',2),

    ('PENDIDIKAN_DASAR_MENENGAH','PPDB',8),('PENDIDIKAN_DASAR_MENENGAH','sekolah negeri',8),('PENDIDIKAN_DASAR_MENENGAH','ruang kelas rusak',8),('PENDIDIKAN_DASAR_MENENGAH','guru honorer',8),
    ('PENDIDIKAN_DASAR_MENENGAH','seragam sekolah',5),('PENDIDIKAN_DASAR_MENENGAH','beasiswa',5),('PENDIDIKAN_DASAR_MENENGAH','pendidikan dasar',5),('PENDIDIKAN_DASAR_MENENGAH','pendidikan menengah',5),
    ('PENDIDIKAN_DASAR_MENENGAH','SD negeri',2),('PENDIDIKAN_DASAR_MENENGAH','SMP negeri',2),('PENDIDIKAN_DASAR_MENENGAH','siswa',2),('PENDIDIKAN_DASAR_MENENGAH','tenaga pendidik',2),

    ('BUDAYA_PARIWISATA','Kenduri Seni Melayu',8),('BUDAYA_PARIWISATA','cagar budaya',8),('BUDAYA_PARIWISATA','destinasi wisata',8),
    ('BUDAYA_PARIWISATA','wisman',5),('BUDAYA_PARIWISATA','turis',5),('BUDAYA_PARIWISATA','event wisata',5),('BUDAYA_PARIWISATA','pariwisata',5),
    ('BUDAYA_PARIWISATA','kunjungan wisatawan',2),('BUDAYA_PARIWISATA','budaya Melayu',2),('BUDAYA_PARIWISATA','atraksi wisata',2),

    ('PEMUDA_OLAHRAGA','POPDA',8),('PEMUDA_OLAHRAGA','atlet',8),('PEMUDA_OLAHRAGA','fasilitas olahraga',8),('PEMUDA_OLAHRAGA','stadion',8),
    ('PEMUDA_OLAHRAGA','pemuda',5),('PEMUDA_OLAHRAGA','karang taruna',5),('PEMUDA_OLAHRAGA','olahraga',5),
    ('PEMUDA_OLAHRAGA','kompetisi olahraga',2),('PEMUDA_OLAHRAGA','pembinaan atlet',2),('PEMUDA_OLAHRAGA','organisasi kepemudaan',2),

    ('SOSIAL_BANSOS_KEMISKINAN','bansos',8),('SOSIAL_BANSOS_KEMISKINAN','PKH',8),('SOSIAL_BANSOS_KEMISKINAN','kemiskinan',8),('SOSIAL_BANSOS_KEMISKINAN','gelandangan',8),('SOSIAL_BANSOS_KEMISKINAN','pengemis',8),
    ('SOSIAL_BANSOS_KEMISKINAN','gepeng',5),('SOSIAL_BANSOS_KEMISKINAN','panti asuhan',5),('SOSIAL_BANSOS_KEMISKINAN','bantuan sosial',5),
    ('SOSIAL_BANSOS_KEMISKINAN','keluarga miskin',2),('SOSIAL_BANSOS_KEMISKINAN','kesejahteraan sosial',2),('SOSIAL_BANSOS_KEMISKINAN','bantuan warga',2),

    ('TRANTIB_UMUM','Satpol PP',8),('TRANTIB_UMUM','penertiban PKL',8),('TRANTIB_UMUM','razia pekat',8),('TRANTIB_UMUM','penegakan Perda',8),
    ('TRANTIB_UMUM','minuman keras',5),('TRANTIB_UMUM','ketertiban umum',5),('TRANTIB_UMUM','razia',5),
    ('TRANTIB_UMUM','PKL',2),('TRANTIB_UMUM','penyakit masyarakat',2),('TRANTIB_UMUM','penertiban',2),

    ('BENCANA_CUACA','puting beliung',8),('BENCANA_CUACA','tanah longsor',8),('BENCANA_CUACA','cuaca ekstrem',8),('BENCANA_CUACA','BPBD',8),
    ('BENCANA_CUACA','longsor',5),('BENCANA_CUACA','angin kencang',5),('BENCANA_CUACA','pohon tumbang',5),
    ('BENCANA_CUACA','peringatan dini',2),('BENCANA_CUACA','bencana',2),('BENCANA_CUACA','evakuasi',2),('BENCANA_CUACA','tanggap darurat',2),

    ('SOSIAL_PERLINDUNGAN_MASYARAKAT','KDRT',8),('SOSIAL_PERLINDUNGAN_MASYARAKAT','kekerasan anak',8),('SOSIAL_PERLINDUNGAN_MASYARAKAT','perlindungan perempuan',8),('SOSIAL_PERLINDUNGAN_MASYARAKAT','Kota Layak Anak',8),
    ('SOSIAL_PERLINDUNGAN_MASYARAKAT','Linmas',5),('SOSIAL_PERLINDUNGAN_MASYARAKAT','perlindungan anak',5),('SOSIAL_PERLINDUNGAN_MASYARAKAT','kekerasan perempuan',5),
    ('SOSIAL_PERLINDUNGAN_MASYARAKAT','korban kekerasan',2),('SOSIAL_PERLINDUNGAN_MASYARAKAT','pendampingan korban',2),('SOSIAL_PERLINDUNGAN_MASYARAKAT','perlindungan sosial',2),

    ('GOV_KEBIJAKAN_REGULASI','Perda',8),('GOV_KEBIJAKAN_REGULASI','Perwako',8),('GOV_KEBIJAKAN_REGULASI','rancangan Perda',8),('GOV_KEBIJAKAN_REGULASI','rancangan Perwako',8),
    ('GOV_KEBIJAKAN_REGULASI','kebijakan daerah',5),('GOV_KEBIJAKAN_REGULASI','regulasi daerah',5),('GOV_KEBIJAKAN_REGULASI','aturan daerah',5),
    ('GOV_KEBIJAKAN_REGULASI','sosialisasi Perda',2),('GOV_KEBIJAKAN_REGULASI','implementasi kebijakan',2),

    ('GOV_KEUANGAN_APBD','APBD',8),('GOV_KEUANGAN_APBD','APBD-P',8),('GOV_KEUANGAN_APBD','pendapatan daerah',8),('GOV_KEUANGAN_APBD','pajak daerah',8),('GOV_KEUANGAN_APBD','BPKAD',8),('GOV_KEUANGAN_APBD','Bapenda',8),
    ('GOV_KEUANGAN_APBD','anggaran',5),('GOV_KEUANGAN_APBD','retribusi daerah',5),('GOV_KEUANGAN_APBD','belanja daerah',5),
    ('GOV_KEUANGAN_APBD','PAD',2),('GOV_KEUANGAN_APBD','realisasi anggaran',2),('GOV_KEUANGAN_APBD','penerimaan daerah',2),

    ('GOV_AKUNTABILITAS_PENGAWASAN','audit BPK',8),('GOV_AKUNTABILITAS_PENGAWASAN','opini BPK',8),('GOV_AKUNTABILITAS_PENGAWASAN','WTP',8),('GOV_AKUNTABILITAS_PENGAWASAN','LHKPN',8),('GOV_AKUNTABILITAS_PENGAWASAN','Saber Pungli',8),
    ('GOV_AKUNTABILITAS_PENGAWASAN','inspektorat',5),('GOV_AKUNTABILITAS_PENGAWASAN','pengawasan internal',5),('GOV_AKUNTABILITAS_PENGAWASAN','audit internal',5),
    ('GOV_AKUNTABILITAS_PENGAWASAN','akuntabilitas',2),('GOV_AKUNTABILITAS_PENGAWASAN','tindak lanjut BPK',2),('GOV_AKUNTABILITAS_PENGAWASAN','pengendalian internal',2),

    ('GOV_DPRD_PEMERINTAHAN','DPRD Batam',8),('GOV_DPRD_PEMERINTAHAN','rapat paripurna',8),('GOV_DPRD_PEMERINTAHAN','pokir DPRD',8),('GOV_DPRD_PEMERINTAHAN','Sekwan',8),
    ('GOV_DPRD_PEMERINTAHAN','reses',5),('GOV_DPRD_PEMERINTAHAN','komisi DPRD',5),('GOV_DPRD_PEMERINTAHAN','pimpinan DPRD',5),
    ('GOV_DPRD_PEMERINTAHAN','rapat dengar pendapat',2),('GOV_DPRD_PEMERINTAHAN','fungsi legislasi',2),('GOV_DPRD_PEMERINTAHAN','sekretariat DPRD',2),

    ('AGAMA_SYIAR','MTQ',8),('AGAMA_SYIAR','STQ',8),('AGAMA_SYIAR','STQH',8),('AGAMA_SYIAR','LPTQ',8),('AGAMA_SYIAR','Musabaqah Tilawatil Quran',8),('AGAMA_SYIAR','Seleksi Tilawatil Quran',8),
    ('AGAMA_SYIAR','safari Ramadan',5),('AGAMA_SYIAR','Idulfitri',5),('AGAMA_SYIAR','Iduladha',5),('AGAMA_SYIAR','Natal',5),('AGAMA_SYIAR','Paskah',5),('AGAMA_SYIAR','Waisak',5),('AGAMA_SYIAR','Nyepi',5),('AGAMA_SYIAR','Imlek',5),
    ('AGAMA_SYIAR','hari besar keagamaan',2),('AGAMA_SYIAR','kegiatan keagamaan',2),('AGAMA_SYIAR','syiar keagamaan',2),

    ('AGAMA_PELAYANAN','insentif guru TPQ',8),('AGAMA_PELAYANAN','insentif imam',8),('AGAMA_PELAYANAN','guru TPQ',8),('AGAMA_PELAYANAN','imam masjid',8),('AGAMA_PELAYANAN','ibadah haji',8),
    ('AGAMA_PELAYANAN','guru ngaji',5),('AGAMA_PELAYANAN','mubalig',5),('AGAMA_PELAYANAN','penyuluh agama',5),('AGAMA_PELAYANAN','jemaah haji',5),('AGAMA_PELAYANAN','manasik haji',5),
    ('AGAMA_PELAYANAN','zakat',2),('AGAMA_PELAYANAN','infak',2),('AGAMA_PELAYANAN','BAZNAS',2),('AGAMA_PELAYANAN','pembinaan keagamaan',2),

    ('AGAMA_KERUKUNAN_IBADAH','FKUB',8),('AGAMA_KERUKUNAN_IBADAH','kerukunan umat beragama',8),('AGAMA_KERUKUNAN_IBADAH','konflik rumah ibadah',8),
    ('AGAMA_KERUKUNAN_IBADAH','toleransi umat beragama',5),('AGAMA_KERUKUNAN_IBADAH','bantuan rumah ibadah',5),('AGAMA_KERUKUNAN_IBADAH','pembangunan rumah ibadah',5),
    ('AGAMA_KERUKUNAN_IBADAH','masjid',2),('AGAMA_KERUKUNAN_IBADAH','gereja',2),('AGAMA_KERUKUNAN_IBADAH','vihara',2),('AGAMA_KERUKUNAN_IBADAH','pura',2),('AGAMA_KERUKUNAN_IBADAH','klenteng',2),('AGAMA_KERUKUNAN_IBADAH','rumah ibadah',2),

    ('KEMASYARAKATAN_ORGANISASI','Kesbangpol',8),('KEMASYARAKATAN_ORGANISASI','hibah ormas',8),('KEMASYARAKATAN_ORGANISASI','insentif RT RW',8),
    ('KEMASYARAKATAN_ORGANISASI','ormas',5),('KEMASYARAKATAN_ORGANISASI','organisasi kemasyarakatan',5),('KEMASYARAKATAN_ORGANISASI','LSM',5),('KEMASYARAKATAN_ORGANISASI','LPM',5),
    ('KEMASYARAKATAN_ORGANISASI','RT',2),('KEMASYARAKATAN_ORGANISASI','RW',2),('KEMASYARAKATAN_ORGANISASI','organisasi masyarakat',2),('KEMASYARAKATAN_ORGANISASI','pembinaan ormas',2),

    ('INFO_PPID','PPID',8),('INFO_PPID','sengketa informasi',8),('INFO_PPID','keterbukaan informasi',8),('INFO_PPID','Daftar Informasi Publik',8),('INFO_PPID','DIP',8),
    ('INFO_PPID','informasi publik',5),('INFO_PPID','permohonan informasi',5),('INFO_PPID','informasi dikecualikan',5),
    ('INFO_PPID','permohonan data',2),('INFO_PPID','transparansi informasi publik',2),('INFO_PPID','Komisi Informasi',2),

    ('HUMAS_PUBLIKASI','Media Center Batam',8),('HUMAS_PUBLIKASI','rilis pers',8),('HUMAS_PUBLIKASI','publikasi Pemko',8),('HUMAS_PUBLIKASI','siaran pers',8),
    ('HUMAS_PUBLIKASI','liputan pimpinan',5),('HUMAS_PUBLIKASI','Prokopim',5),('HUMAS_PUBLIKASI','press release',5),('HUMAS_PUBLIKASI','publikasi pemerintah',5),
    ('HUMAS_PUBLIKASI','dokumentasi kegiatan',2),('HUMAS_PUBLIKASI','agenda pimpinan',2),('HUMAS_PUBLIKASI','konten pemerintah',2),

    ('HUMAS_MEDIA_PERS','konferensi pers',8),('HUMAS_MEDIA_PERS','kerja sama media',8),('HUMAS_MEDIA_PERS','orientasi wartawan',8),
    ('HUMAS_MEDIA_PERS','uji kompetensi wartawan',5),('HUMAS_MEDIA_PERS','hubungan pers',5),('HUMAS_MEDIA_PERS','media massa',5),
    ('HUMAS_MEDIA_PERS','wartawan',2),('HUMAS_MEDIA_PERS','media online',2),('HUMAS_MEDIA_PERS','hak jawab',2),('HUMAS_MEDIA_PERS','media briefing',2),

    ('KOMUNIKASI_PUBLIK_ISU','hoaks',8),('KOMUNIKASI_PUBLIK_ISU','disinformasi',8),('KOMUNIKASI_PUBLIK_ISU','klarifikasi Pemko',8),('KOMUNIKASI_PUBLIK_ISU','counter narasi',8),
    ('KOMUNIKASI_PUBLIK_ISU','klarifikasi pemerintah',5),('KOMUNIKASI_PUBLIK_ISU','literasi digital',5),('KOMUNIKASI_PUBLIK_ISU','isu publik',5),
    ('KOMUNIKASI_PUBLIK_ISU','narasi publik',2),('KOMUNIKASI_PUBLIK_ISU','informasi keliru',2),('KOMUNIKASI_PUBLIK_ISU','viral',2)
), org AS (
  SELECT id FROM organizations WHERE code = 'PEMKO_BATAM' ORDER BY id LIMIT 1
), normalized AS (
  SELECT DISTINCT taxonomy_code, keyword, weight,
         lower(regexp_replace(btrim(keyword), '\s+', ' ', 'g')) AS normalized_keyword
  FROM seed
)
INSERT INTO keywords
  (organization_id, opd_id, district_id, keyword, normalized_keyword, active, match_type, priority, created_at, updated_at)
SELECT org.id, NULL, NULL, n.keyword, n.normalized_keyword, TRUE, 'contains', 2, now(), now()
FROM org CROSS JOIN normalized n
WHERE NOT EXISTS (
  SELECT 1 FROM keywords k
  WHERE k.organization_id = org.id
    AND k.opd_id IS NULL
    AND k.district_id IS NULL
    AND k.normalized_keyword = n.normalized_keyword
);

-- Taxonomy relations + approved weights.
WITH seed(taxonomy_code, keyword, weight) AS (
  VALUES
    ('INFRA_JALAN_JEMBATAN','jalan rusak',8),('INFRA_JALAN_JEMBATAN','jalan berlubang',8),('INFRA_JALAN_JEMBATAN','lubang jalan',8),('INFRA_JALAN_JEMBATAN','pengaspalan',8),('INFRA_JALAN_JEMBATAN','pelebaran jalan',8),('INFRA_JALAN_JEMBATAN','jembatan',5),('INFRA_JALAN_JEMBATAN','perbaikan jalan',5),('INFRA_JALAN_JEMBATAN','pembangunan jalan',5),('INFRA_JALAN_JEMBATAN','pedestrian',5),('INFRA_JALAN_JEMBATAN','trotoar',5),('INFRA_JALAN_JEMBATAN','bahu jalan',2),('INFRA_JALAN_JEMBATAN','akses jalan',2),('INFRA_JALAN_JEMBATAN','peningkatan jalan',2),('INFRA_JALAN_JEMBATAN','pemeliharaan jalan',2),
    ('INFRA_DRAINASE_BANJIR','banjir',8),('INFRA_DRAINASE_BANJIR','genangan air',8),('INFRA_DRAINASE_BANJIR','banjir rob',8),('INFRA_DRAINASE_BANJIR','drainase tersumbat',8),('INFRA_DRAINASE_BANJIR','parit tumpat',8),('INFRA_DRAINASE_BANJIR','drainase',5),('INFRA_DRAINASE_BANJIR','pengerukan drainase',5),('INFRA_DRAINASE_BANJIR','normalisasi drainase',5),('INFRA_DRAINASE_BANJIR','saluran air',5),('INFRA_DRAINASE_BANJIR','gorong-gorong',2),('INFRA_DRAINASE_BANJIR','sedimentasi',2),('INFRA_DRAINASE_BANJIR','pengendalian banjir',2),('INFRA_DRAINASE_BANJIR','pompa banjir',2),
    ('INFRA_TATARUANG_PERMUKIMAN','bangunan liar',8),('INFRA_TATARUANG_PERMUKIMAN','bangli',8),('INFRA_TATARUANG_PERMUKIMAN','RTLH',8),('INFRA_TATARUANG_PERMUKIMAN','rumah tidak layak huni',8),('INFRA_TATARUANG_PERMUKIMAN','RTRW',8),('INFRA_TATARUANG_PERMUKIMAN','penertiban bangunan',5),('INFRA_TATARUANG_PERMUKIMAN','permukiman',5),('INFRA_TATARUANG_PERMUKIMAN','tata ruang',5),('INFRA_TATARUANG_PERMUKIMAN','pemakaman',5),('INFRA_TATARUANG_PERMUKIMAN','TPU',5),('INFRA_TATARUANG_PERMUKIMAN','kawasan kumuh',2),('INFRA_TATARUANG_PERMUKIMAN','rehabilitasi rumah',2),('INFRA_TATARUANG_PERMUKIMAN','zonasi',2),('INFRA_TATARUANG_PERMUKIMAN','pemanfaatan ruang',2),
    ('INFRA_PENERANGAN_SARANA','PJU',8),('INFRA_PENERANGAN_SARANA','lampu jalan',8),('INFRA_PENERANGAN_SARANA','lampu mati',8),('INFRA_PENERANGAN_SARANA','penerangan jalan umum',5),('INFRA_PENERANGAN_SARANA','taman kota',5),('INFRA_PENERANGAN_SARANA','fasilitas umum',5),('INFRA_PENERANGAN_SARANA','fasum',5),('INFRA_PENERANGAN_SARANA','sarana publik',2),('INFRA_PENERANGAN_SARANA','fasilitas kota',2),('INFRA_PENERANGAN_SARANA','pemeliharaan taman',2),
    ('TRANS_PUBLIK','Trans Batam',8),('TRANS_PUBLIK','BRT',8),('TRANS_PUBLIK','tarif Trans Batam',8),('TRANS_PUBLIK','rute Trans Batam',8),('TRANS_PUBLIK','halte',5),('TRANS_PUBLIK','rute bus',5),('TRANS_PUBLIK','angkutan umum',5),('TRANS_PUBLIK','angkot',5),('TRANS_PUBLIK','bus kota',2),('TRANS_PUBLIK','layanan bus',2),('TRANS_PUBLIK','koridor bus',2),('TRANS_PUBLIK','penumpang bus',2),
    ('TRANS_PARKIR','parkir liar',8),('TRANS_PARKIR','retribusi parkir',8),('TRANS_PARKIR','e-parking',8),('TRANS_PARKIR','juru parkir',8),('TRANS_PARKIR','jukir',8),('TRANS_PARKIR','tarif parkir',5),('TRANS_PARKIR','parkir',5),('TRANS_PARKIR','titik parkir',5),('TRANS_PARKIR','pengelolaan parkir',2),('TRANS_PARKIR','karcis parkir',2),('TRANS_PARKIR','parkir tepi jalan',2),
    ('TRANS_LALIN_KESELAMATAN','kemacetan',8),('TRANS_LALIN_KESELAMATAN','rekayasa lalu lintas',8),('TRANS_LALIN_KESELAMATAN','ATCS',8),('TRANS_LALIN_KESELAMATAN','macet',5),('TRANS_LALIN_KESELAMATAN','rambu jalan',5),('TRANS_LALIN_KESELAMATAN','marka jalan',5),('TRANS_LALIN_KESELAMATAN','lampu merah',5),('TRANS_LALIN_KESELAMATAN','keselamatan lalu lintas',2),('TRANS_LALIN_KESELAMATAN','simpang',2),('TRANS_LALIN_KESELAMATAN','arus lalu lintas',2),('TRANS_LALIN_KESELAMATAN','traffic light',2),
    ('TRANS_LAUT_LOKAL','pelabuhan rakyat',8),('TRANS_LAUT_LOKAL','pompong',8),('TRANS_LAUT_LOKAL','bot penumpang',8),('TRANS_LAUT_LOKAL','pelabuhan pengumpan',8),('TRANS_LAUT_LOKAL','tarif laut',5),('TRANS_LAUT_LOKAL','keselamatan pelayaran',5),('TRANS_LAUT_LOKAL','angkutan laut lokal',5),('TRANS_LAUT_LOKAL','dermaga rakyat',2),('TRANS_LAUT_LOKAL','kapal penumpang lokal',2),('TRANS_LAUT_LOKAL','transportasi antarpulau',2),
    ('EKON_HARGA_STOK_PANGAN','sembako',8),('EKON_HARGA_STOK_PANGAN','harga beras',8),('EKON_HARGA_STOK_PANGAN','pasar murah',8),('EKON_HARGA_STOK_PANGAN','operasi pasar',8),('EKON_HARGA_STOK_PANGAN','LPG 3 kg',8),('EKON_HARGA_STOK_PANGAN','gas melon',8),('EKON_HARGA_STOK_PANGAN','cabai mahal',5),('EKON_HARGA_STOK_PANGAN','harga pangan',5),('EKON_HARGA_STOK_PANGAN','stok pangan',5),('EKON_HARGA_STOK_PANGAN','inflasi pangan',5),('EKON_HARGA_STOK_PANGAN','ketersediaan bahan pokok',2),('EKON_HARGA_STOK_PANGAN','harga kebutuhan pokok',2),('EKON_HARGA_STOK_PANGAN','distributor pangan',2),
    ('EKON_INVESTASI_PERIZINAN','OSS',8),('EKON_INVESTASI_PERIZINAN','izin usaha',8),('EKON_INVESTASI_PERIZINAN','investasi',8),('EKON_INVESTASI_PERIZINAN','investor',8),('EKON_INVESTASI_PERIZINAN','kemudahan berusaha',8),('EKON_INVESTASI_PERIZINAN','Mal Pelayanan Publik',5),('EKON_INVESTASI_PERIZINAN','MPP',5),('EKON_INVESTASI_PERIZINAN','perizinan berusaha',5),('EKON_INVESTASI_PERIZINAN','realisasi investasi',5),('EKON_INVESTASI_PERIZINAN','pelayanan perizinan',2),('EKON_INVESTASI_PERIZINAN','penanaman modal',2),('EKON_INVESTASI_PERIZINAN','iklim investasi',2),
    ('EKON_INDUSTRI_NAKER','UMK',8),('EKON_INDUSTRI_NAKER','PHK',8),('EKON_INDUSTRI_NAKER','job fair',8),('EKON_INDUSTRI_NAKER','mogok kerja',8),('EKON_INDUSTRI_NAKER','demo buruh',8),('EKON_INDUSTRI_NAKER','pencaker',5),('EKON_INDUSTRI_NAKER','kartu kuning',5),('EKON_INDUSTRI_NAKER','serikat pekerja',5),('EKON_INDUSTRI_NAKER','ketenagakerjaan',5),('EKON_INDUSTRI_NAKER','lowongan kerja',2),('EKON_INDUSTRI_NAKER','hubungan industrial',2),('EKON_INDUSTRI_NAKER','tenaga kerja',2),('EKON_INDUSTRI_NAKER','pekerja',2),
    ('EKON_UMKM_KOPERASI','UMKM',8),('EKON_UMKM_KOPERASI','koperasi',8),('EKON_UMKM_KOPERASI','pelatihan UMKM',8),('EKON_UMKM_KOPERASI','bantuan modal',8),('EKON_UMKM_KOPERASI','produk lokal',5),('EKON_UMKM_KOPERASI','sertifikat halal',5),('EKON_UMKM_KOPERASI','usaha mikro',5),('EKON_UMKM_KOPERASI','usaha kecil',5),('EKON_UMKM_KOPERASI','pembinaan UMKM',2),('EKON_UMKM_KOPERASI','pemasaran UMKM',2),('EKON_UMKM_KOPERASI','koperasi aktif',2),
    ('LAYANAN_ADMINDUK','KTP-el',8),('LAYANAN_ADMINDUK','IKD',8),('LAYANAN_ADMINDUK','Kartu Keluarga',8),('LAYANAN_ADMINDUK','perekaman KTP',8),('LAYANAN_ADMINDUK','antrean Disdukcapil',8),('LAYANAN_ADMINDUK','KTP',5),('LAYANAN_ADMINDUK','akta lahir',5),('LAYANAN_ADMINDUK','adminduk',5),('LAYANAN_ADMINDUK','administrasi kependudukan',5),('LAYANAN_ADMINDUK','akta kematian',2),('LAYANAN_ADMINDUK','pindah datang',2),('LAYANAN_ADMINDUK','dokumen kependudukan',2),
    ('LAYANAN_KINERJA_PUBLIK','pelayanan lambat',8),('LAYANAN_KINERJA_PUBLIK','pungli',8),('LAYANAN_KINERJA_PUBLIK','maklumat pelayanan',8),('LAYANAN_KINERJA_PUBLIK','standar pelayanan',8),('LAYANAN_KINERJA_PUBLIK','kepuasan masyarakat',5),('LAYANAN_KINERJA_PUBLIK','kualitas pelayanan',5),('LAYANAN_KINERJA_PUBLIK','inovasi pelayanan',5),('LAYANAN_KINERJA_PUBLIK','maladministrasi',2),('LAYANAN_KINERJA_PUBLIK','waktu layanan',2),('LAYANAN_KINERJA_PUBLIK','antrean pelayanan',2),
    ('LAYANAN_SPBE_DIGITAL','SPBE',8),('LAYANAN_SPBE_DIGITAL','Batam Single Window',8),('LAYANAN_SPBE_DIGITAL','aplikasi Pemko',8),('LAYANAN_SPBE_DIGITAL','server down',8),('LAYANAN_SPBE_DIGITAL','layanan digital',5),('LAYANAN_SPBE_DIGITAL','WiFi gratis',5),('LAYANAN_SPBE_DIGITAL','CCTV kota',5),('LAYANAN_SPBE_DIGITAL','integrasi sistem',5),('LAYANAN_SPBE_DIGITAL','transformasi digital',2),('LAYANAN_SPBE_DIGITAL','layanan daring',2),('LAYANAN_SPBE_DIGITAL','sistem informasi pemerintah',2),
    ('LAYANAN_PENGADUAN','SP4N LAPOR',8),('LAYANAN_PENGADUAN','lapor pemko',8),('LAYANAN_PENGADUAN','aduan warga',8),('LAYANAN_PENGADUAN','tanggap aduan',8),('LAYANAN_PENGADUAN','keluhan publik',5),('LAYANAN_PENGADUAN','pengaduan masyarakat',5),('LAYANAN_PENGADUAN','laporan warga',5),('LAYANAN_PENGADUAN','tindak lanjut aduan',2),('LAYANAN_PENGADUAN','kanal pengaduan',2),('LAYANAN_PENGADUAN','respons aduan',2),
    ('LAYANAN_SIBER','serangan siber',8),('LAYANAN_SIBER','kebocoran data',8),('LAYANAN_SIBER','peretasan',8),('LAYANAN_SIBER','keamanan informasi',8),('LAYANAN_SIBER','retas web',5),('LAYANAN_SIBER','insiden siber',5),('LAYANAN_SIBER','phishing',5),('LAYANAN_SIBER','keamanan aplikasi',5),('LAYANAN_SIBER','CSIRT',2),('LAYANAN_SIBER','keamanan data',2),('LAYANAN_SIBER','proteksi sistem',2),('LAYANAN_SIBER','pemulihan sistem',2),
    ('KES_LAYANAN','RSUD Embung Fatimah',8),('KES_LAYANAN','Puskesmas',8),('KES_LAYANAN','antrean obat',8),('KES_LAYANAN','ambulans',8),('KES_LAYANAN','BPJS Kesehatan',5),('KES_LAYANAN','layanan medis',5),('KES_LAYANAN','pelayanan kesehatan',5),('KES_LAYANAN','dokter',2),('KES_LAYANAN','obat',2),('KES_LAYANAN','fasilitas kesehatan',2),('KES_LAYANAN','rujukan pasien',2),
    ('KES_PENYAKIT_PENCEGAHAN','DBD',8),('KES_PENYAKIT_PENCEGAHAN','demam berdarah',8),('KES_PENYAKIT_PENCEGAHAN','stunting',8),('KES_PENYAKIT_PENCEGAHAN','gizi buruk',8),('KES_PENYAKIT_PENCEGAHAN','wabah',8),('KES_PENYAKIT_PENCEGAHAN','imunisasi',5),('KES_PENYAKIT_PENCEGAHAN','posyandu',5),('KES_PENYAKIT_PENCEGAHAN','pencegahan penyakit',5),('KES_PENYAKIT_PENCEGAHAN','fogging',2),('KES_PENYAKIT_PENCEGAHAN','surveilans',2),('KES_PENYAKIT_PENCEGAHAN','kesehatan ibu anak',2),('KES_PENYAKIT_PENCEGAHAN','gizi',2),
    ('LINGKUNGAN_SAMPAH','sampah',8),('LINGKUNGAN_SAMPAH','tumpukan sampah',8),('LINGKUNGAN_SAMPAH','TPS',8),('LINGKUNGAN_SAMPAH','TPA Teluk Bakau',8),('LINGKUNGAN_SAMPAH','armada sampah',8),('LINGKUNGAN_SAMPAH','retribusi sampah',5),('LINGKUNGAN_SAMPAH','pengangkutan sampah',5),('LINGKUNGAN_SAMPAH','pengelolaan sampah',5),('LINGKUNGAN_SAMPAH','bank sampah',2),('LINGKUNGAN_SAMPAH','kebersihan kota',2),('LINGKUNGAN_SAMPAH','petugas kebersihan',2),
    ('LINGKUNGAN_PENCEMARAN','pencemaran laut',8),('LINGKUNGAN_PENCEMARAN','limbah B3',8),('LINGKUNGAN_PENCEMARAN','pencemaran udara',8),('LINGKUNGAN_PENCEMARAN','RTH',5),('LINGKUNGAN_PENCEMARAN','hutan lindung',5),('LINGKUNGAN_PENCEMARAN','pencemaran lingkungan',5),('LINGKUNGAN_PENCEMARAN','kualitas udara',2),('LINGKUNGAN_PENCEMARAN','limbah',2),('LINGKUNGAN_PENCEMARAN','ruang terbuka hijau',2),('LINGKUNGAN_PENCEMARAN','konservasi',2),
    ('PENDIDIKAN_DASAR_MENENGAH','PPDB',8),('PENDIDIKAN_DASAR_MENENGAH','sekolah negeri',8),('PENDIDIKAN_DASAR_MENENGAH','ruang kelas rusak',8),('PENDIDIKAN_DASAR_MENENGAH','guru honorer',8),('PENDIDIKAN_DASAR_MENENGAH','seragam sekolah',5),('PENDIDIKAN_DASAR_MENENGAH','beasiswa',5),('PENDIDIKAN_DASAR_MENENGAH','pendidikan dasar',5),('PENDIDIKAN_DASAR_MENENGAH','pendidikan menengah',5),('PENDIDIKAN_DASAR_MENENGAH','SD negeri',2),('PENDIDIKAN_DASAR_MENENGAH','SMP negeri',2),('PENDIDIKAN_DASAR_MENENGAH','siswa',2),('PENDIDIKAN_DASAR_MENENGAH','tenaga pendidik',2),
    ('BUDAYA_PARIWISATA','Kenduri Seni Melayu',8),('BUDAYA_PARIWISATA','cagar budaya',8),('BUDAYA_PARIWISATA','destinasi wisata',8),('BUDAYA_PARIWISATA','wisman',5),('BUDAYA_PARIWISATA','turis',5),('BUDAYA_PARIWISATA','event wisata',5),('BUDAYA_PARIWISATA','pariwisata',5),('BUDAYA_PARIWISATA','kunjungan wisatawan',2),('BUDAYA_PARIWISATA','budaya Melayu',2),('BUDAYA_PARIWISATA','atraksi wisata',2),
    ('PEMUDA_OLAHRAGA','POPDA',8),('PEMUDA_OLAHRAGA','atlet',8),('PEMUDA_OLAHRAGA','fasilitas olahraga',8),('PEMUDA_OLAHRAGA','stadion',8),('PEMUDA_OLAHRAGA','pemuda',5),('PEMUDA_OLAHRAGA','karang taruna',5),('PEMUDA_OLAHRAGA','olahraga',5),('PEMUDA_OLAHRAGA','kompetisi olahraga',2),('PEMUDA_OLAHRAGA','pembinaan atlet',2),('PEMUDA_OLAHRAGA','organisasi kepemudaan',2),
    ('SOSIAL_BANSOS_KEMISKINAN','bansos',8),('SOSIAL_BANSOS_KEMISKINAN','PKH',8),('SOSIAL_BANSOS_KEMISKINAN','kemiskinan',8),('SOSIAL_BANSOS_KEMISKINAN','gelandangan',8),('SOSIAL_BANSOS_KEMISKINAN','pengemis',8),('SOSIAL_BANSOS_KEMISKINAN','gepeng',5),('SOSIAL_BANSOS_KEMISKINAN','panti asuhan',5),('SOSIAL_BANSOS_KEMISKINAN','bantuan sosial',5),('SOSIAL_BANSOS_KEMISKINAN','keluarga miskin',2),('SOSIAL_BANSOS_KEMISKINAN','kesejahteraan sosial',2),('SOSIAL_BANSOS_KEMISKINAN','bantuan warga',2),
    ('TRANTIB_UMUM','Satpol PP',8),('TRANTIB_UMUM','penertiban PKL',8),('TRANTIB_UMUM','razia pekat',8),('TRANTIB_UMUM','penegakan Perda',8),('TRANTIB_UMUM','minuman keras',5),('TRANTIB_UMUM','ketertiban umum',5),('TRANTIB_UMUM','razia',5),('TRANTIB_UMUM','PKL',2),('TRANTIB_UMUM','penyakit masyarakat',2),('TRANTIB_UMUM','penertiban',2),
    ('BENCANA_CUACA','puting beliung',8),('BENCANA_CUACA','tanah longsor',8),('BENCANA_CUACA','cuaca ekstrem',8),('BENCANA_CUACA','BPBD',8),('BENCANA_CUACA','longsor',5),('BENCANA_CUACA','angin kencang',5),('BENCANA_CUACA','pohon tumbang',5),('BENCANA_CUACA','peringatan dini',2),('BENCANA_CUACA','bencana',2),('BENCANA_CUACA','evakuasi',2),('BENCANA_CUACA','tanggap darurat',2),
    ('SOSIAL_PERLINDUNGAN_MASYARAKAT','KDRT',8),('SOSIAL_PERLINDUNGAN_MASYARAKAT','kekerasan anak',8),('SOSIAL_PERLINDUNGAN_MASYARAKAT','perlindungan perempuan',8),('SOSIAL_PERLINDUNGAN_MASYARAKAT','Kota Layak Anak',8),('SOSIAL_PERLINDUNGAN_MASYARAKAT','Linmas',5),('SOSIAL_PERLINDUNGAN_MASYARAKAT','perlindungan anak',5),('SOSIAL_PERLINDUNGAN_MASYARAKAT','kekerasan perempuan',5),('SOSIAL_PERLINDUNGAN_MASYARAKAT','korban kekerasan',2),('SOSIAL_PERLINDUNGAN_MASYARAKAT','pendampingan korban',2),('SOSIAL_PERLINDUNGAN_MASYARAKAT','perlindungan sosial',2),
    ('GOV_KEBIJAKAN_REGULASI','Perda',8),('GOV_KEBIJAKAN_REGULASI','Perwako',8),('GOV_KEBIJAKAN_REGULASI','rancangan Perda',8),('GOV_KEBIJAKAN_REGULASI','rancangan Perwako',8),('GOV_KEBIJAKAN_REGULASI','kebijakan daerah',5),('GOV_KEBIJAKAN_REGULASI','regulasi daerah',5),('GOV_KEBIJAKAN_REGULASI','aturan daerah',5),('GOV_KEBIJAKAN_REGULASI','sosialisasi Perda',2),('GOV_KEBIJAKAN_REGULASI','implementasi kebijakan',2),
    ('GOV_KEUANGAN_APBD','APBD',8),('GOV_KEUANGAN_APBD','APBD-P',8),('GOV_KEUANGAN_APBD','pendapatan daerah',8),('GOV_KEUANGAN_APBD','pajak daerah',8),('GOV_KEUANGAN_APBD','BPKAD',8),('GOV_KEUANGAN_APBD','Bapenda',8),('GOV_KEUANGAN_APBD','anggaran',5),('GOV_KEUANGAN_APBD','retribusi daerah',5),('GOV_KEUANGAN_APBD','belanja daerah',5),('GOV_KEUANGAN_APBD','PAD',2),('GOV_KEUANGAN_APBD','realisasi anggaran',2),('GOV_KEUANGAN_APBD','penerimaan daerah',2),
    ('GOV_AKUNTABILITAS_PENGAWASAN','audit BPK',8),('GOV_AKUNTABILITAS_PENGAWASAN','opini BPK',8),('GOV_AKUNTABILITAS_PENGAWASAN','WTP',8),('GOV_AKUNTABILITAS_PENGAWASAN','LHKPN',8),('GOV_AKUNTABILITAS_PENGAWASAN','Saber Pungli',8),('GOV_AKUNTABILITAS_PENGAWASAN','inspektorat',5),('GOV_AKUNTABILITAS_PENGAWASAN','pengawasan internal',5),('GOV_AKUNTABILITAS_PENGAWASAN','audit internal',5),('GOV_AKUNTABILITAS_PENGAWASAN','akuntabilitas',2),('GOV_AKUNTABILITAS_PENGAWASAN','tindak lanjut BPK',2),('GOV_AKUNTABILITAS_PENGAWASAN','pengendalian internal',2),
    ('GOV_DPRD_PEMERINTAHAN','DPRD Batam',8),('GOV_DPRD_PEMERINTAHAN','rapat paripurna',8),('GOV_DPRD_PEMERINTAHAN','pokir DPRD',8),('GOV_DPRD_PEMERINTAHAN','Sekwan',8),('GOV_DPRD_PEMERINTAHAN','reses',5),('GOV_DPRD_PEMERINTAHAN','komisi DPRD',5),('GOV_DPRD_PEMERINTAHAN','pimpinan DPRD',5),('GOV_DPRD_PEMERINTAHAN','rapat dengar pendapat',2),('GOV_DPRD_PEMERINTAHAN','fungsi legislasi',2),('GOV_DPRD_PEMERINTAHAN','sekretariat DPRD',2),
    ('AGAMA_SYIAR','MTQ',8),('AGAMA_SYIAR','STQ',8),('AGAMA_SYIAR','STQH',8),('AGAMA_SYIAR','LPTQ',8),('AGAMA_SYIAR','Musabaqah Tilawatil Quran',8),('AGAMA_SYIAR','Seleksi Tilawatil Quran',8),('AGAMA_SYIAR','safari Ramadan',5),('AGAMA_SYIAR','Idulfitri',5),('AGAMA_SYIAR','Iduladha',5),('AGAMA_SYIAR','Natal',5),('AGAMA_SYIAR','Paskah',5),('AGAMA_SYIAR','Waisak',5),('AGAMA_SYIAR','Nyepi',5),('AGAMA_SYIAR','Imlek',5),('AGAMA_SYIAR','hari besar keagamaan',2),('AGAMA_SYIAR','kegiatan keagamaan',2),('AGAMA_SYIAR','syiar keagamaan',2),
    ('AGAMA_PELAYANAN','insentif guru TPQ',8),('AGAMA_PELAYANAN','insentif imam',8),('AGAMA_PELAYANAN','guru TPQ',8),('AGAMA_PELAYANAN','imam masjid',8),('AGAMA_PELAYANAN','ibadah haji',8),('AGAMA_PELAYANAN','guru ngaji',5),('AGAMA_PELAYANAN','mubalig',5),('AGAMA_PELAYANAN','penyuluh agama',5),('AGAMA_PELAYANAN','jemaah haji',5),('AGAMA_PELAYANAN','manasik haji',5),('AGAMA_PELAYANAN','zakat',2),('AGAMA_PELAYANAN','infak',2),('AGAMA_PELAYANAN','BAZNAS',2),('AGAMA_PELAYANAN','pembinaan keagamaan',2),
    ('AGAMA_KERUKUNAN_IBADAH','FKUB',8),('AGAMA_KERUKUNAN_IBADAH','kerukunan umat beragama',8),('AGAMA_KERUKUNAN_IBADAH','konflik rumah ibadah',8),('AGAMA_KERUKUNAN_IBADAH','toleransi umat beragama',5),('AGAMA_KERUKUNAN_IBADAH','bantuan rumah ibadah',5),('AGAMA_KERUKUNAN_IBADAH','pembangunan rumah ibadah',5),('AGAMA_KERUKUNAN_IBADAH','masjid',2),('AGAMA_KERUKUNAN_IBADAH','gereja',2),('AGAMA_KERUKUNAN_IBADAH','vihara',2),('AGAMA_KERUKUNAN_IBADAH','pura',2),('AGAMA_KERUKUNAN_IBADAH','klenteng',2),('AGAMA_KERUKUNAN_IBADAH','rumah ibadah',2),
    ('KEMASYARAKATAN_ORGANISASI','Kesbangpol',8),('KEMASYARAKATAN_ORGANISASI','hibah ormas',8),('KEMASYARAKATAN_ORGANISASI','insentif RT RW',8),('KEMASYARAKATAN_ORGANISASI','ormas',5),('KEMASYARAKATAN_ORGANISASI','organisasi kemasyarakatan',5),('KEMASYARAKATAN_ORGANISASI','LSM',5),('KEMASYARAKATAN_ORGANISASI','LPM',5),('KEMASYARAKATAN_ORGANISASI','RT',2),('KEMASYARAKATAN_ORGANISASI','RW',2),('KEMASYARAKATAN_ORGANISASI','organisasi masyarakat',2),('KEMASYARAKATAN_ORGANISASI','pembinaan ormas',2),
    ('INFO_PPID','PPID',8),('INFO_PPID','sengketa informasi',8),('INFO_PPID','keterbukaan informasi',8),('INFO_PPID','Daftar Informasi Publik',8),('INFO_PPID','DIP',8),('INFO_PPID','informasi publik',5),('INFO_PPID','permohonan informasi',5),('INFO_PPID','informasi dikecualikan',5),('INFO_PPID','permohonan data',2),('INFO_PPID','transparansi informasi publik',2),('INFO_PPID','Komisi Informasi',2),
    ('HUMAS_PUBLIKASI','Media Center Batam',8),('HUMAS_PUBLIKASI','rilis pers',8),('HUMAS_PUBLIKASI','publikasi Pemko',8),('HUMAS_PUBLIKASI','siaran pers',8),('HUMAS_PUBLIKASI','liputan pimpinan',5),('HUMAS_PUBLIKASI','Prokopim',5),('HUMAS_PUBLIKASI','press release',5),('HUMAS_PUBLIKASI','publikasi pemerintah',5),('HUMAS_PUBLIKASI','dokumentasi kegiatan',2),('HUMAS_PUBLIKASI','agenda pimpinan',2),('HUMAS_PUBLIKASI','konten pemerintah',2),
    ('HUMAS_MEDIA_PERS','konferensi pers',8),('HUMAS_MEDIA_PERS','kerja sama media',8),('HUMAS_MEDIA_PERS','orientasi wartawan',8),('HUMAS_MEDIA_PERS','uji kompetensi wartawan',5),('HUMAS_MEDIA_PERS','hubungan pers',5),('HUMAS_MEDIA_PERS','media massa',5),('HUMAS_MEDIA_PERS','wartawan',2),('HUMAS_MEDIA_PERS','media online',2),('HUMAS_MEDIA_PERS','hak jawab',2),('HUMAS_MEDIA_PERS','media briefing',2),
    ('KOMUNIKASI_PUBLIK_ISU','hoaks',8),('KOMUNIKASI_PUBLIK_ISU','disinformasi',8),('KOMUNIKASI_PUBLIK_ISU','klarifikasi Pemko',8),('KOMUNIKASI_PUBLIK_ISU','counter narasi',8),('KOMUNIKASI_PUBLIK_ISU','klarifikasi pemerintah',5),('KOMUNIKASI_PUBLIK_ISU','literasi digital',5),('KOMUNIKASI_PUBLIK_ISU','isu publik',5),('KOMUNIKASI_PUBLIK_ISU','narasi publik',2),('KOMUNIKASI_PUBLIK_ISU','informasi keliru',2),('KOMUNIKASI_PUBLIK_ISU','viral',2)
), org AS (
  SELECT id FROM organizations WHERE code = 'PEMKO_BATAM' ORDER BY id LIMIT 1
), normalized AS (
  SELECT taxonomy_code, keyword, weight,
         lower(regexp_replace(btrim(keyword), '\s+', ' ', 'g')) AS normalized_keyword
  FROM seed
)
INSERT INTO keyword_taxonomy (keyword_id, category_id, weight, active, created_at)
SELECT k.id, t.id, n.weight, TRUE, now()
FROM normalized n
JOIN org ON TRUE
JOIN keywords k
  ON k.organization_id = org.id
 AND k.opd_id IS NULL
 AND k.district_id IS NULL
 AND k.normalized_keyword = n.normalized_keyword
JOIN taxonomy_categories t
  ON t.code = n.taxonomy_code
 AND t.organization_id = org.id
ON CONFLICT (keyword_id, category_id)
DO UPDATE SET weight = EXCLUDED.weight, active = TRUE;

-- Split existing comma/semicolon/pipe/newline keyword lists into master rows.
WITH org AS (
  SELECT id FROM organizations WHERE code = 'PEMKO_BATAM' ORDER BY id LIMIT 1
), legacy_parts AS (
  SELECT DISTINCT
    k.id AS legacy_keyword_id,
    k.opd_id,
    k.district_id,
    btrim(part) AS keyword,
    lower(regexp_replace(btrim(part), '\s+', ' ', 'g')) AS normalized_keyword
  FROM keywords k
  CROSS JOIN LATERAL regexp_split_to_table(k.keyword, '[,;|\n]+') AS part
  JOIN org ON org.id = k.organization_id
  WHERE (k.opd_id IS NOT NULL OR k.district_id IS NOT NULL)
    AND length(btrim(part)) >= 2
)
INSERT INTO keywords
  (organization_id, opd_id, district_id, keyword, normalized_keyword, active, match_type, priority, created_at, updated_at)
SELECT org.id, NULL, NULL, lp.keyword, lp.normalized_keyword, TRUE, 'contains', 2, now(), now()
FROM org
JOIN legacy_parts lp ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM keywords km
  WHERE km.organization_id = org.id
    AND km.opd_id IS NULL
    AND km.district_id IS NULL
    AND km.normalized_keyword = lp.normalized_keyword
);

-- Preserve legacy OPD targeting as relation rows on the master keyword.
WITH org AS (
  SELECT id FROM organizations WHERE code = 'PEMKO_BATAM' ORDER BY id LIMIT 1
), legacy_parts AS (
  SELECT DISTINCT k.opd_id,
         lower(regexp_replace(btrim(part), '\s+', ' ', 'g')) AS normalized_keyword
  FROM keywords k
  CROSS JOIN LATERAL regexp_split_to_table(k.keyword, '[,;|\n]+') AS part
  JOIN org ON org.id = k.organization_id
  WHERE k.opd_id IS NOT NULL AND length(btrim(part)) >= 2
)
INSERT INTO keyword_opd (keyword_id, opd_id, weight, active, created_at, updated_at)
SELECT km.id, lp.opd_id, 2.0, TRUE, now(), now()
FROM legacy_parts lp
JOIN org ON TRUE
JOIN keywords km
  ON km.organization_id = org.id
 AND km.opd_id IS NULL
 AND km.district_id IS NULL
 AND km.normalized_keyword = lp.normalized_keyword
ON CONFLICT (keyword_id, opd_id)
DO UPDATE SET active = TRUE, updated_at = now();

-- Preserve legacy district targeting as relation rows on the master keyword.
WITH org AS (
  SELECT id FROM organizations WHERE code = 'PEMKO_BATAM' ORDER BY id LIMIT 1
), legacy_parts AS (
  SELECT DISTINCT k.district_id,
         lower(regexp_replace(btrim(part), '\s+', ' ', 'g')) AS normalized_keyword
  FROM keywords k
  CROSS JOIN LATERAL regexp_split_to_table(k.keyword, '[,;|\n]+') AS part
  JOIN org ON org.id = k.organization_id
  WHERE k.district_id IS NOT NULL AND length(btrim(part)) >= 2
)
INSERT INTO keyword_district (keyword_id, district_id, weight, active, created_at, updated_at)
SELECT km.id, lp.district_id, 2.0, TRUE, now(), now()
FROM legacy_parts lp
JOIN org ON TRUE
JOIN keywords km
  ON km.organization_id = org.id
 AND km.opd_id IS NULL
 AND km.district_id IS NULL
 AND km.normalized_keyword = lp.normalized_keyword
ON CONFLICT (keyword_id, district_id)
DO UPDATE SET active = TRUE, updated_at = now();

-- Explicitly classify the useful legacy phrases not present in the approved list.
WITH org AS (
  SELECT id FROM organizations WHERE code = 'PEMKO_BATAM' ORDER BY id LIMIT 1
), extras(keyword, taxonomy_code, weight) AS (
  VALUES
    ('Aktivasi IKD','LAYANAN_ADMINDUK',8),
    ('pelayanan kependudukan','LAYANAN_ADMINDUK',5),
    ('PON','PEMUDA_OLAHRAGA',5)
)
INSERT INTO keyword_taxonomy (keyword_id, category_id, weight, active, created_at)
SELECT k.id, t.id, e.weight, TRUE, now()
FROM extras e
JOIN org ON TRUE
JOIN keywords k
  ON k.organization_id = org.id
 AND k.opd_id IS NULL
 AND k.district_id IS NULL
 AND k.normalized_keyword = lower(regexp_replace(btrim(e.keyword), '\s+', ' ', 'g'))
JOIN taxonomy_categories t
  ON t.organization_id = org.id
 AND t.code = e.taxonomy_code
ON CONFLICT (keyword_id, category_id)
DO UPDATE SET weight = EXCLUDED.weight, active = TRUE;

COMMIT;
