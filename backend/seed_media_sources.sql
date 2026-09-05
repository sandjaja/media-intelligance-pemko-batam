-- Verified against ANTARA's official RSS directory.
INSERT INTO media_sources(name,category,tier,url,active)
VALUES ('ANTARA News Batam/Kepulauan Riau','online',1,'https://en.antaranews.com/rss/nusantara-batam.xml',TRUE)
ON CONFLICT(name) DO UPDATE SET category=EXCLUDED.category,tier=EXCLUDED.tier,url=EXCLUDED.url,active=EXCLUDED.active;

-- Initial OPD keyword vocabulary. Extend through the admin/data pipeline as monitoring requirements grow.
INSERT INTO keywords(opd_id,keyword)
SELECT o.id,v.keyword FROM (VALUES
  ('DISKOMINFO','Diskominfo'),('DISKOMINFO','komunikasi dan informatika'),('DISKOMINFO','media center'),('DISKOMINFO','informasi publik'),('DISKOMINFO','digitalisasi'),
  ('DBMSDA','bina marga'),('DBMSDA','sumber daya air'),('DBMSDA','drainase'),('DBMSDA','jalan'),('DBMSDA','banjir'),
  ('DPMPTSP','DPMPTSP'),('DPMPTSP','perizinan'),('DPMPTSP','investasi'),('DPMPTSP','penanaman modal'),
  ('DISHUB','perhubungan'),('DISHUB','transportasi'),('DISHUB','kemacetan'),('DISHUB','pelabuhan'),
  ('DINKES','kesehatan'),('DINKES','rumah sakit'),('DINKES','puskesmas'),('DINKES','stunting'),
  ('DISDIK','pendidikan'),('DISDIK','sekolah'),('DISDIK','guru'),('DISDIK','siswa')
) AS v(code,keyword) JOIN opd o ON o.code=v.code
ON CONFLICT(opd_id,keyword) DO NOTHING;
