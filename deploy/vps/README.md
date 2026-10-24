# Paket VPS dan wizard /install

Paket ini untuk **instalasi baru pada database kosong**. Pemindahan database Batam yang sudah berjalan memakai prosedur backup/restore terpisah, bukan wizard ini.

## Isi yang sudah disiapkan

- Backend Node.js/Fastify, frontend statis, konfigurasi Nginx, layanan systemd dan timer scheduler.
- Wizard HTTPS `/install`: token instalasi, URL PostgreSQL, email dan password Superadmin.
- Pemasangan skema lengkap dan akun pertama dalam satu transaksi pada satu koneksi; database tidak kosong ditolak.
- Template awal **45 OPD, 603 keyword, 627 hubungan keyword–OPD**, serta sektor dan kategori klasifikasi. Frasa khusus Batam dan nama pimpinan telah dikeluarkan; periksa kembali kesesuaian istilah dan struktur OPD untuk pemda tujuan. Data dapat diubah dari admin.
- Identitas menggunakan tabel `government_branding` melalui menu **Data Wilayah** yang sudah ada. Nama awal netral “Pemerintah Daerah”; tidak membuat pengaturan branding kedua.
- Tidak membawa akun, berita, isu, analisis, data kecamatan Batam, API key, saldo, atau koneksi notifikasi dari instalasi sumber.
- File privat lokal disimpan di luar web root. Pembacaan tetap melalui endpoint aplikasi dengan pemeriksaan izin yang sudah ada.
- Scheduler koleksi dan executive brief **nonaktif**; timer hanya memeriksa konfigurasi. Aktivasi dilakukan admin setelah integrasi dan anggaran siap.
- Setelah berhasil, layanan restart otomatis masuk aplikasi. `/install` menjadi terkunci dan API instalasi tidak lagi dipasang.

## Membuat arsip

Pada checkout yang sudah lolos pengujian, dengan dependency pengembangan terpasang:

```bash
cd backend
npm ci
npm run check
npm test
npm run package:vps
```

Arsip tersedia pada `release/media-intelligence-vps.tar.gz`. Pembuatan paket tidak menjalankan migrasi, tidak menghubungi database dan tidak mengaktifkan jadwal. Paket berisi JavaScript hasil build; `node_modules` dipasang di VPS sesuai platform. Jangan memasukkan `.env` ke arsip.

## VPS baru: pemasangan oleh pengelola server

Target skrip: Ubuntu/Debian dengan systemd dan akses sudo/root. Pastikan DNS domain mengarah ke VPS, port 80/443 tersedia untuk HTTPS, serta akses SSH tetap tersedia. Skrip tidak mengubah firewall dan tidak menghentikan layanan yang sudah memakai port tersebut.

```bash
tar -xzf media-intelligence-vps.tar.gz
cd media-intelligence-vps
sudo bash deploy/setup.sh mediaintelligence.example admin@example.com --with-postgres
```

Ganti domain dan email contoh. Skrip memasang Node 22 jika belum ada runtime yang sesuai, PostgreSQL opsional, Nginx, sertifikat HTTPS, dan layanan. Koneksi keluar diperlukan untuk paket sistem/npm dan penerbitan sertifikat.

Jika PostgreSQL sudah disediakan pengelola VPS, hilangkan `--with-postgres`. Siapkan database kosong milik user aplikasi; wizard tidak membuat database server/role PostgreSQL. User tersebut perlu hak membuat tabel, sequence, fungsi dan trigger pada schema public database miliknya, **bukan** akses superuser cluster.

Skrip menyimpan rahasia di `/etc/media-intelligence.env` (0600). Token ditampilkan di terminal. Dengan opsi PostgreSQL, URL database tersedia di `/etc/media-intelligence-database.txt` (0600). Baca sebagai root dan masukkan pada wizard; jangan kirim file rahasia itu ke browser publik atau repositori.

Buka `https://DOMAIN/install`, isi token, URL database, email dan password minimal 12 karakter. Klik **Periksa kesiapan**, lalu **Pasang aplikasi**. Sesudah berhasil, tunggu beberapa detik lalu klik **Masuk aplikasi**. Jika sertifikat belum terbit karena DNS belum benar, perbaiki DNS lalu jalankan kembali perintah certbot pada server; jangan mengulang setup untuk menimpa file instalasi.

## Bila sudah ada Nginx Proxy Manager

Jangan memasang Nginx kedua pada port 80/443. Gunakan `--no-nginx` dan minta pengelola proxy menyesuaikan konfigurasi dari `nginx.conf`:

- Frontend hanya dari `/opt/media-intelligence/public`, bukan root proyek/backend.
- `/api/`, `/install`, `/health` diteruskan ke Node pada loopback port 8080. `/install/app.js` dan `/install/style.css` juga harus diproxy, jangan dialihkan ke frontend statis.
- Sertifikat HTTPS dan domain harus sama dengan `PUBLIC_APP_URL` dan `CORS_ORIGIN`.
- Header `X-Forwarded-For` harus **ditimpa** IP klien oleh proxy yang dipercaya, bukan ditambah ke input pengguna. Konfigurasi bawaan hanya mempercayai satu hop loopback.
- Jika Proxy Manager berada di container, loopback container bukan loopback host. Pengelola perlu menyiapkan jaringan dan mount frontend, atau menempatkan Nginx lokal di antara Proxy Manager dan Node. Jangan membuka port Node ke internet atau mengaktifkan trust proxy semua alamat untuk menyelesaikan masalah jaringan.

Opsi `--no-nginx` menyiapkan aplikasi dan layanan; **tidak** menyelesaikan konfigurasi jaringan/static root/sertifikat Proxy Manager secara otomatis.

## Sesudah login

1. Buka Data Wilayah: isi nama pemerintah daerah, nama singkat, alias wilayah, logo, background, dan kecamatan/kelurahan. Background login tidak memakai lapisan gelap tebal.
2. Periksa template OPD dan keyword; sesuaikan nama dinas/badan, primary dan supporting OPD dengan struktur organisasi setempat.
3. Tambah sumber berita dan kanal resmi. Paket tidak mengaktifkan sumber Batam.
4. Isi API key/model/prompt AI, SMTP, Telegram dan Apify dari admin. Provider AI awal nonaktif. Jadwal tidak dinyalakan installer.
5. Uji login/refresh, akun OPD/kecamatan, viewer TV, upload/download bukti, peta, dan print. Lakukan satu uji integrasi nyata terkontrol sebelum menyalakan jadwal.

## Penyimpanan dan backup

- `/etc/media-intelligence.env`: JWT secret, kunci enkripsi integrasi, token instalasi, konfigurasi domain.
- `/var/lib/media-intelligence/runtime.json`: konfigurasi koneksi database dan identitas instalasi (0600).
- `/var/lib/media-intelligence/files`: berkas privat, nama fisik hash dan metadata tipe berkas. Backup seluruh folder, bukan hanya database.
- PostgreSQL: backup dengan `pg_dump` menggunakan koneksi langsung. Simpan kunci enkripsi bersama prosedur pemulihan yang aman; database tanpa kunci tidak dapat membuka kredensial lama.

Jangan hapus runtime.json untuk membuka ulang installer. Jika proses berhenti sesudah commit database tetapi sebelum rename konfigurasi, startup dapat memulihkan file `.pending` setelah memeriksa nonce instalasi yang sama. Jika proses berhenti sebelum commit, database rollback; file pending yang tersisa perlu diperiksa/dihapus oleh pengelola sebelum mencoba lagi, setelah memastikan tidak ada instalasi selesai pada database tujuan.

## Operasional

```bash
sudo systemctl status media-intelligence
sudo journalctl -u media-intelligence -n 80 --no-pager
sudo systemctl list-timers media-intelligence-scheduler.timer
sudo journalctl -u media-intelligence-scheduler -n 80 --no-pager
curl -f http://127.0.0.1:8080/ready
```

`/health` memeriksa proses; `/ready` memeriksa akses database. Nginx membatasi readiness ke localhost. Logging rahasia instalasi tidak diaktifkan. Atur retensi journald dan pantau kapasitas disk.

## Upgrade dan migrasi instalasi existing

Jangan jalankan `setup.sh` atau `/install` pada database existing. Backup dan uji restore dahulu; hentikan scheduler deployment lama sebelum memindahkan penulisan ke VPS. Gunakan hanya satu scheduler aktif untuk database yang sama. Pertahankan kunci `INTEGRATION_CREDENTIAL_KEY` agar kredensial lama terbaca. Data berkas Blob tidak berubah otomatis menjadi file lokal; pertahankan akses token Blob untuk membacanya atau lakukan migrasi berkas terpisah.

Snapshot installer adalah struktur terverifikasi sampai manifest `backend/install/migrations.json`; migrasi historis sudah ditandai pada pemasangan baru. Saat menambahkan migrasi berikutnya, uji upgrade dan pemasangan kosong, lalu perbarui baseline paket. Jangan memakai `schema.sql` installer untuk upgrade.

## Validasi dan batas pengujian

Pemasangan kosong, hashing akun, rollback, penolakan pemasangan ulang, template OPD/keyword, penyimpanan lokal, autentikasi installer dan endpoint cron diuji otomatis dengan PostgreSQL embedded PGlite serta Fastify injection. Build dan suite regresi harus lulus sebelum distribusi.

Instalasi apt/systemd/Nginx/sertifikat memerlukan smoke test pada VPS Ubuntu/Debian sungguhan. Pengujian embedded tidak membuktikan konfigurasi jaringan, port SMTP provider, sertifikat, kapasitas VPS, maupun webhook publik. Paket belum boleh diklaim sudah diuji di server tujuan sebelum smoke test tersebut.

Catatan proxy berlapis: jika Nginx lokal berada di belakang Proxy Manager, pengelola perlu mengatur Real IP Nginx dari alamat Proxy Manager yang ditetapkan secara spesifik, lalu menimpa header sebelum meneruskan ke Node. Tanpa itu, IP yang terbaca dapat menjadi IP proxy dan pembatasan login menjadi bersama. Jangan memakai `set_real_ip_from 0.0.0.0/0`.
