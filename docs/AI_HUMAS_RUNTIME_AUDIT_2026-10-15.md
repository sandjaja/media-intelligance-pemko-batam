# Audit jalur AI dan prompt Humas (15 Oktober 2026)

## Kebijakan yang disepakati
- Humas hanya mengatur prompt dan pilihan model untuk: gap_analysis, strakom_analysis, publication_analysis, monitoring_analysis, content_studio_prompting.
- Executive Brief, Ask Intelligence, klasifikasi berita, dan proses lainnya tidak boleh memakai OpenAI/Claude berbayar.
- Kredensial Gemini diambil dari ai_provider_credentials (terenkripsi), bukan environment.
- Jangan aktifkan eksekusi model berbayar sebelum seluruh call site memakai gateway dengan reservasi anggaran dan usage accounting.

## Temuan terverifikasi dari kode
| Modul | Implementasi saat audit | Tindak lanjut |
|---|---|---|
| backend/src/intelligence.ts | Executive Brief memanggil Gemini dengan credential/model database; fallback deterministik | Validasi kuota free tier, runtime smoke test |
| backend/src/ask-intelligence-core.ts | Ask Intelligence memanggil Gemini dengan credential/model database; fallback deterministik | Validasi kuota free tier, runtime smoke test |
| backend/src/phase5-strategy-routes.ts | Strakom memanggil Gemini langsung, membaca prompt Humas dari DB jika tersedia, fallback prompt lama | Pilihan model Humas belum dihubungkan; gateway/budget belum dipakai |
| backend/src/phase5-strategy-routes.ts | Content Studio menyusun prompt secara deterministik; prompt dasar Humas dari DB ditambahkan jika tersedia | Tidak memanggil model AI untuk produksi konten pada route ini; tetap pertahankan locked guards |
| backend/src/communication-gap-routes.ts | Tidak ditemukan pemanggilan provider atau prompt AI dalam file | Telusuri modul/route lain yang menghasilkan analisis Gap |
| backend/src/phase3-workflow-routes.ts | Tidak ditemukan pemanggilan provider atau prompt AI dalam file | Telusuri modul/route lain untuk Publikasi dan Monitoring |
| backend/src/news-classification.ts | Klasifikasi berbasis aturan dan routing, tidak ditemukan pemanggilan provider | Jangan menganggapnya penggunaan token AI |
| backend/src/ai-provider-adapters.ts | Adaptor provider Gemini/OpenAI/Claude tersedia | Hanya boleh dipanggil melalui gateway yang menerapkan kontrol biaya |
| backend/src/ai-execution-gateway.ts | Gateway terpisah tersedia | Belum terbukti seluruh call site melewati gateway |

## Status migrasi prompt
- 147: tabel prompt dan history lima tugas.
- 148: seed prompt asli Strakom tanpa payload data dinamis.
- 149: seed prompt dasar Content Studio (prompt ini baru, karena sebelumnya tidak ada satu prompt dasar terpisah).
- Gap, Publikasi, Monitoring: **jangan seed prompt rekaan**; pastikan apakah analisis lama berbasis kode deterministik atau prompt lain terlebih dahulu.
- 150: konfigurasi pilihan model per tugas; **penyimpanan bukan aktivasi eksekusi**.

## Risiko dan pekerjaan tertunda
1. Periksa seluruh file backend, job, script dan worker untuk panggilan provider langsung; audit ini belum komprehensif.
2. Model Gemini yang aktif belum otomatis menjamin berada pada free tier; perlu allowlist/validasi konfigurasi.
3. Jangan menyebut migrasi berhasil sebelum dijalankan pada Neon Preview dan diuji. Jangan jalankan pada Neon Production.
4. Pastikan pilihan model Humas, prompt, budget, logging, dan fallback dipakai secara konsisten oleh runtime sebelum mengaktifkan model berbayar.
5. CI dan deployment Vercel belum lulus; build-rate-limit dilaporkan pada commit sebelumnya.
