-- Verified against ANTARA's official RSS directory.
INSERT INTO media_sources(name,category,tier,url,active)
VALUES ('ANTARA News Batam/Kepulauan Riau','online',1,'https://en.antaranews.com/rss/nusantara-batam.xml',TRUE)
ON CONFLICT(name) DO UPDATE SET category=EXCLUDED.category,tier=EXCLUDED.tier,url=EXCLUDED.url,active=EXCLUDED.active;

-- Initial OPD keyword vocabulary. Extend this list through the admin/data pipeline as monitoring requirements grow.
INSERT INTO keywords(opd_id,keyword)
SELECT o.id,k.keyword FROM opd o CROSS JOIN (VALUES
  ('Diskominfo'),('komunikasi dan informatika'),('media center'),('informasi publik'),('digitalisasi'),
  ('bina marga'),('sumber daya air'),('drainase'),('jalan'),('banjir'),
  ('DPMPTSP'),('perizinan'),('investasi'),('penanaman modal'),
  ('perhubungan'),('transportasi'),('kemacetan'),('pelabuhan'),
  ('kesehatan'),('rumah sakit'),('puskesmas'),('stunting'),
  ('pendidikan'),('sekolah'),('guru'),('siswa')
) AS k(keyword)
WHERE o.active=true
ON CONFLICT(opd_id,keyword) DO NOTHING;
