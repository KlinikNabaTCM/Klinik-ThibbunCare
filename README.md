# ThibbunCare — Sistem Operasional Klinik Holistik & Tradisional

ThibbunCare adalah aplikasi web full-stack berbahasa Indonesia (zona waktu `Asia/Jakarta`, mata uang Rupiah) yang mencakup **Website Publik**, **Portal Pasien**, dan **Panel Internal Klinik** dalam satu aplikasi terpadu.

## 1. Mode Demo vs Mode Terhubung (Supabase)

- **Mode Demo (Default saat Supabase belum dikonfigurasi):** Berjalan langsung tanpa setup eksternal menggunakan server Express lokal (`/server.ts`) dan data simulasi fiktif. Semua aturan bisnis (pencegahan bentrok slot atomik, penolakan akses klinis bagi Kasir/Inventaris, isolasi dokumen pasien, idempotensi pembayaran & pemakaian stok batch, serta log audit) dieksekusi secara nyata di server.
- **Mode Terhubung Supabase:** Isi `.env` dengan `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, dan `SUPABASE_SERVICE_ROLE_KEY`, lalu jalankan migrasi SQL pada folder `/supabase/migrations/`.

## 2. Langkah Pemasangan Lokal

1. Salin berkas konfigurasi contoh:
   ```bash
   cp .env.example .env
   ```
2. Pasang dependensi:
   ```bash
   npm install
   ```
3. Jalankan server pengembangan (Express + Vite pada port 3000):
   ```bash
   npm run dev
   ```
4. Untuk produksi:
   ```bash
   npm run build
   npm start
   ```

## 3. Migrasi Database Supabase

Jalankan file migrasi secara berurutan melalui Supabase SQL Editor atau Supabase CLI (`supabase db push`):

1. `supabase/migrations/001_thibbuncare_schema.sql` — Membuat tabel cabang, peran, praktisi, layanan, pasien, reservasi dengan constraint anti-bentrok `EXCLUDE USING gist`, antrean, kunjungan, catatan klinis, persetujuan, tindakan, lampiran privat, invoice, pembayaran, sesi kas, produk/batch, pembelian, mutasi stok, dan log audit.
2. `supabase/migrations/002_rls_policies.sql` — Mengaktifkan Row Level Security (RLS) berdasarkan peran, cabang, izin eksplisit `can_access_clinical_notes`, dan kepemilikan pasien.
3. `supabase/migrations/003_seed_demo.sql` — Mengisi katalog layanan awal dan contoh cabang.

## 4. Panduan Pencadangan, Pemulihan & Retensi Data

- **Pencadangan Harian Otomatis (PostgreSQL / Supabase):**
  - Aktifkan *Daily Backups* dan *Point-in-Time Recovery (PITR)* pada proyek Supabase produksi.
  - Untuk cadangan logis manual sebelum pembaruan skema:
    ```bash
    pg_dump "$DATABASE_URL" --format=custom --no-owner --file="thibbuncare_backup_$(date +%Y%m%d).dump"
    ```
- **Prosedur Pemulihan (Restore):**
  ```bash
  pg_restore --clean --if-exists --dbname="$DATABASE_URL" thibbuncare_backup_YYYYMMDD.dump
  ```
- **Penyimpanan Lampiran Privat:** Lampiran klinis disimpan pada bucket Supabase Storage privat (bukan publik) dan hanya diakses melalui tautan bertanda tangan berdurasi pendek setelah otorisasi server & pencatatan audit.
- **Kebijakan Retensi Data:** Pengelola klinik dapat mengatur masa retensi dokumen operasional pada menu **Pengaturan → Retensi & Pencadangan** (standar minimal 5 tahun untuk catatan kunjungan dan transaksi keuangan sesuai ketentuan administrasi klinik).

## 5. Integrasi Opsional

- **WhatsApp Penyedia Resmi:** Tanpa `WHATSAPP_PROVIDER_API_URL`, tombol konfirmasi/pengingat/kontrol menyiapkan pesan aman-privasi untuk disalin atau dibuka di draf WhatsApp dengan pencatatan persetujuan & riwayat kirim.
- **QRIS Terintegrasi:** Tanpa `PAYMENT_GATEWAY_WEBHOOK_SECRET`, pembayaran QRIS diproses dengan status `menunggu_konfirmasi` dan dikonfirmasi manual oleh kasir berizin.

## 6. Panduan Deploy Online Publik ke GitHub & Vercel (Direkomendasikan)

Aplikasi ini sudah dilengkapi konfigurasi `vercel.json`, entrypoint serverless `api/index.ts`, token sesi *stateless* (`SESSION_SECRET`), serta sinkronisasi database Supabase (`004_cloud_state.sql`) agar dapat berjalan publik di Vercel.

1. **Upload ke GitHub:**
   - Pastikan berkas `.env` dan `.thibbuncare-demo-state.json` tidak ikut terunggah (sudah tercantum di `.gitignore`).
   - Jalankan `git init`, `git add .`, `git commit -m "Deploy ThibbunCare"`, lalu push ke repositori GitHub Anda.
2. **Siapkan Database Permanen di Supabase (Gratis):**
   - Buat proyek baru di [Supabase](https://supabase.com).
   - Buka **SQL Editor**, lalu jalankan berkas migrasi `supabase/migrations/001_thibbuncare_schema.sql` sampai `004_cloud_state.sql` (minimal `004_cloud_state.sql` untuk penyimpanan state klinik terpadu).
   - Salin `Project URL` dan `service_role` key dari **Project Settings → API**.
3. **Deploy ke Vercel dari GitHub:**
   - Buka [Vercel](https://vercel.com), pilih **Add New Project**, lalu impor repositori GitHub Anda.
   - Tambahkan **Environment Variables** berikut di pengaturan proyek Vercel:
     - `SESSION_SECRET`: isi dengan teks acak panjang (misalnya 32+ karakter).
     - `SUPABASE_URL`: URL proyek Supabase Anda.
     - `SUPABASE_SERVICE_ROLE_KEY`: kunci `service_role` Supabase Anda.
   - Klik **Deploy**. Vercel akan mem-build frontend ke `dist/` dan menjalankan API di `api/index.ts`.
4. **Masuk sebagai Admin setelah Deploy:**
   - Buka URL Vercel Anda, pilih **Panel Klinik**, lalu masuk dengan akun Admin bawaan (`admin@demo.thibbuncare.id` / `thibbuncare2026`), dan segera ubah kata sandi serta data klinik di **Pusat Admin**.
