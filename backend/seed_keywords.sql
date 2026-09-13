-- Initial keyword dictionary. Extend this list from the communications team's approved lexicon.
INSERT INTO keywords(opd_id,keyword)
SELECT o.id,v.keyword FROM opd o CROSS JOIN (VALUES
 ('DISKOMINFO','Pemko Batam'),('DISKOMINFO','Pemerintah Kota Batam'),('DISKOMINFO','Diskominfo'),('DISKOMINFO','Komunikasi dan Informatika'),
 ('DBMSDA','jalan'),('DBMSDA','drainase'),('DBMSDA','banjir'),('DBMSDA','infrastruktur'),('DBMSDA','Bina Marga'),
 ('DPMPTSP','investasi'),('DPMPTSP','perizinan'),('DPMPTSP','DPMPTSP'),('DPMPTSP','penanaman modal'),
 ('DISHUB','transportasi'),('DISHUB','lalu lintas'),('DISHUB','parkir'),('DISHUB','Dishub'),('DISHUB','kemacetan'),
 ('DINKES','kesehatan'),('DINKES','rumah sakit'),('DINKES','puskesmas'),('DINKES','Dinas Kesehatan'),('DINKES','stunting'),
 ('DISDIK','pendidikan'),('DISDIK','sekolah'),('DISDIK','guru'),('DISDIK','siswa'),('DISDIK','Dinas Pendidikan')
) AS v(code,keyword) WHERE o.code=v.code ON CONFLICT(opd_id,keyword) DO NOTHING;
