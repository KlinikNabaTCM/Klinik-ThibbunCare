-- ThibbunCare — Data Awal Simulasi (003)
-- Seluruh nama pasien, kontak, dan transaksi bersifat fiktif untuk demonstrasi operasional.

INSERT INTO clinic_settings (clinic_name, tagline, logo_initials, primary_whatsapp, primary_email)
VALUES ('Klinik Holistik ThibbunCare', 'Perawatan Tradisional & Holistik Terpadu', 'TC', '6281100008899', 'halo@thibbuncare.id')
ON CONFLICT DO NOTHING;

INSERT INTO branches (code, name, address, phone, whatsapp, operating_hours)
VALUES
  ('JKT-SEL', 'Cabang Kemang, Jakarta Selatan', 'Jl. Kemang Raya No. 48, Jakarta Selatan 12730', '021-7190048', '6281100008899', 'Senin–Sabtu, 08:00–20:00 WIB'),
  ('BDG-DGO', 'Cabang Dago, Bandung', 'Jl. Ir. H. Juanda No. 112, Bandung 40132', '022-2500112', '6281100007788', 'Senin–Sabtu, 08:30–19:30 WIB')
ON CONFLICT (code) DO NOTHING;

INSERT INTO services (code, name, category, description, duration_minutes, price, requires_consent, consent_form_type, is_spiritual_companion)
VALUES
  ('TCM-01', 'Konsultasi TCM & Observasi Lidah-Nadi', 'Konsultasi TCM', 'Evaluasi keluhan menyeluruh serta pencatatan observasi lidah, nadi, dan pola keseimbangan tubuh oleh praktisi.', 45, 175000, FALSE, 'tidak_perlu', FALSE),
  ('BKM-01', 'Terapi Bekam Basah / Hijamah Steril', 'Bekam', 'Prosedur bekam higienis sekali pakai untuk membantu relaksasi otot dan sirkulasi perifer.', 60, 220000, TRUE, 'bekam_akupunktur', FALSE),
  ('AKP-01', 'Akupunktur Tradisional', 'Akupunktur', 'Penusukan jarum steril halus pada titik meridian sesuai rencana terapi praktisi.', 45, 250000, TRUE, 'bekam_akupunktur', FALSE),
  ('AKS-01', 'Akupresur & Pijat Meridian', 'Akupresur', 'Terapi tekan titik meridian tanpa jarum untuk ketegangan otot, kelelahan, dan pemulihan.', 45, 165000, TRUE, 'terapi_umum', FALSE),
  ('MKS-01', 'Terapi Moksibusi Hangat', 'Moksibusi', 'Penghangatan titik meridian menggunakan moksa herbal pilihan.', 30, 140000, TRUE, 'terapi_umum', FALSE),
  ('HRB-01', 'Konsultasi Racik Herbal Terstandar', 'Konsultasi Herbal', 'Penyusunan rekomendasi ramuan herbal alami sesuai profil keluhan dan riwayat alergi.', 30, 125000, FALSE, 'tidak_perlu', FALSE),
  ('RQY-01', 'Pendampingan Ruqyah Syar’iyyah', 'Pendampingan Spiritual', 'Sesi pendampingan spiritual berbasis doa dan bimbingan ketenangan hati dengan formulir persetujuan khusus.', 60, 200000, TRUE, 'ruqyah_syariyyah', TRUE)
ON CONFLICT (code) DO NOTHING;
