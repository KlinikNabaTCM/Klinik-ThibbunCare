-- ThibbunCare — Migrasi Skema PostgreSQL & Supabase (001)
-- Zona waktu operasional: Asia/Jakarta

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 1. Cabang & Pengaturan Klinik
CREATE TABLE IF NOT EXISTS clinic_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_name TEXT NOT NULL DEFAULT 'Klinik Holistik ThibbunCare',
  tagline TEXT NOT NULL DEFAULT 'Terapi Tradisional & Holistik Terstandar',
  logo_initials TEXT NOT NULL DEFAULT 'TC',
  primary_whatsapp TEXT NOT NULL DEFAULT '6281100008899',
  primary_email TEXT NOT NULL DEFAULT 'admin@thibbuncare.id',
  enable_room_tracking BOOLEAN NOT NULL DEFAULT TRUE,
  enable_ruqyah_service BOOLEAN NOT NULL DEFAULT TRUE,
  retention_years INTEGER NOT NULL DEFAULT 5,
  whatsapp_auto_send_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  qris_auto_gateway_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  operating_hours TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  room_type TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE, -- NULL = seluruh cabang
  holiday_date DATE NOT NULL,
  label TEXT NOT NULL
);

-- 2. Akun, Peran, dan Pembatasan Cabang
CREATE TYPE app_role AS ENUM (
  'pemilik',
  'resepsionis',
  'praktisi',
  'asisten',
  'kasir',
  'inventaris',
  'pasien'
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY, -- mengacu ke auth.users(id)
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  can_access_clinical_notes BOOLEAN NOT NULL DEFAULT FALSE,
  can_correct_payments BOOLEAN NOT NULL DEFAULT FALSE,
  can_export_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_settings BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_stock BOOLEAN NOT NULL DEFAULT FALSE,
  delegated_tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_patient_id UUID,
  linked_practitioner_id UUID,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS user_branches (
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, branch_id)
);

-- 3. Praktisi & Layanan
CREATE TABLE IF NOT EXISTS practitioners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  specialty TEXT NOT NULL,
  bio TEXT NOT NULL,
  photo_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS practitioner_branches (
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (practitioner_id, branch_id)
);

CREATE TABLE IF NOT EXISTS practitioner_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  price NUMERIC(14, 0) NOT NULL CHECK (price >= 0),
  requires_consent BOOLEAN NOT NULL DEFAULT FALSE,
  consent_form_type TEXT NOT NULL DEFAULT 'tidak_perlu',
  is_spiritual_companion BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS service_branches (
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (service_id, branch_id)
);

-- 4. Pasien & Wali
CREATE SEQUENCE IF NOT EXISTS patient_number_seq START 1001;

CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_number TEXT UNIQUE NOT NULL DEFAULT ('RM-' || TO_CHAR(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYY') || '-' || LPAD(nextval('patient_number_seq')::TEXT, 4, '0')),
  full_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  gender CHAR(1) NOT NULL CHECK (gender IN ('L', 'P')),
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  guardian_name TEXT,
  guardian_relation TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  branch_id UUID NOT NULL REFERENCES branches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Reservasi (dengan Exclusion Constraint anti-bentrok slot praktisi & ruangan!)
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_code TEXT UNIQUE NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  practitioner_id UUID NOT NULL REFERENCES practitioners(id),
  room_id UUID REFERENCES rooms(id),
  service_ids UUID[] NOT NULL,
  slot_range TSTZRANGE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('menunggu_konfirmasi', 'terkonfirmasi', 'check_in', 'batal', 'tidak_hadir')),
  notes TEXT,
  cancel_reason TEXT,
  reschedule_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  whatsapp_consent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_practitioner_overlap EXCLUDE USING gist (
    practitioner_id WITH =,
    slot_range WITH &&
  ) WHERE (status NOT IN ('batal', 'tidak_hadir')),
  CONSTRAINT no_room_overlap EXCLUDE USING gist (
    room_id WITH =,
    slot_range WITH &&
  ) WHERE (room_id IS NOT NULL AND status NOT IN ('batal', 'tidak_hadir'))
);

CREATE TABLE IF NOT EXISTS message_dispatch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  consent_recorded BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  sent_by UUID REFERENCES user_profiles(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Kunjungan & Antrean
CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_number TEXT UNIQUE NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  practitioner_id UUID NOT NULL REFERENCES practitioners(id),
  room_id UUID REFERENCES rooms(id),
  reservation_id UUID REFERENCES reservations(id),
  is_walk_in BOOLEAN NOT NULL DEFAULT FALSE,
  service_ids UUID[] NOT NULL,
  visit_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('menunggu', 'berlangsung', 'selesai_terapi', 'selesai_tuntas')),
  follow_up_date DATE,
  follow_up_status TEXT,
  referral_note TEXT,
  shared_summary_approved BOOLEAN NOT NULL DEFAULT FALSE,
  shared_summary_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES reservations(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  queue_number TEXT NOT NULL,
  room_name TEXT NOT NULL,
  practitioner_id UUID NOT NULL REFERENCES practitioners(id),
  service_summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('menunggu', 'dipanggil', 'sedang_dilayani', 'selesai')),
  called_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Catatan Klinis, Persetujuan, Tindakan, Lampiran, Kejadian & Koreksi Bertanggal
CREATE TABLE IF NOT EXISTS clinical_records (
  visit_id UUID PRIMARY KEY REFERENCES visits(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  status TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf', 'final')),
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES user_profiles(id),
  general_assessment JSONB NOT NULL DEFAULT '{}'::jsonb,
  tcm_observation JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  form_type TEXT NOT NULL CHECK (form_type IN ('terapi_umum', 'bekam_akupunktur', 'ruqyah_syariyyah')),
  form_version TEXT NOT NULL,
  service_ids UUID[] NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('disetujui', 'ditolak')),
  signer_name TEXT NOT NULL,
  signer_role TEXT NOT NULL CHECK (signer_role IN ('pasien', 'wali')),
  recorded_by UUID NOT NULL REFERENCES user_profiles(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS therapy_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  practitioner_id UUID NOT NULL REFERENCES practitioners(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  body_area TEXT,
  materials_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  observed_response TEXT NOT NULL,
  requires_consent BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'terjadwal' CHECK (status IN ('terjadwal', 'selesai')),
  idempotency_key TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS clinical_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  file_name TEXT NOT NULL,
  category TEXT NOT NULL,
  storage_path TEXT NOT NULL, -- Path bucket privat Supabase Storage
  note TEXT,
  uploaded_by UUID NOT NULL REFERENCES user_profiles(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinical_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  recorded_by UUID NOT NULL REFERENCES user_profiles(id),
  follow_up_status TEXT NOT NULL CHECK (follow_up_status IN ('dipantau', 'tertangani'))
);

CREATE TABLE IF NOT EXISTS clinical_addendums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES clinical_records(visit_id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES user_profiles(id),
  author_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  correction_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Kasir, Invoice, Pembayaran & Sesi Kas
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id),
  visit_id UUID NOT NULL REFERENCES visits(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lines JSONB NOT NULL,
  discount_amount NUMERIC(14, 0) NOT NULL DEFAULT 0,
  discount_reason TEXT,
  total_amount NUMERIC(14, 0) NOT NULL,
  paid_amount NUMERIC(14, 0) NOT NULL DEFAULT 0,
  refunded_amount NUMERIC(14, 0) NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('belum_bayar', 'dibayar_sebagian', 'lunas', 'dibatalkan')),
  void_reason TEXT,
  created_by UUID NOT NULL REFERENCES user_profiles(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC(14, 0) NOT NULL,
  is_refund BOOLEAN NOT NULL DEFAULT FALSE,
  is_correction BOOLEAN NOT NULL DEFAULT FALSE,
  correction_of_payment_id UUID REFERENCES payments(id),
  reason TEXT,
  method TEXT NOT NULL CHECK (method IN ('tunai', 'transfer', 'qris_manual', 'qris_terintegrasi')),
  reference_number TEXT,
  qris_status TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by UUID NOT NULL REFERENCES user_profiles(id),
  idempotency_key TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_by UUID NOT NULL REFERENCES user_profiles(id),
  opening_balance NUMERIC(14, 0) NOT NULL,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES user_profiles(id),
  cash_received NUMERIC(14, 0) NOT NULL DEFAULT 0,
  transfer_received NUMERIC(14, 0) NOT NULL DEFAULT 0,
  qris_received NUMERIC(14, 0) NOT NULL DEFAULT 0,
  expenses NUMERIC(14, 0) NOT NULL DEFAULT 0,
  refunds NUMERIC(14, 0) NOT NULL DEFAULT 0,
  expected_cash_balance NUMERIC(14, 0) NOT NULL DEFAULT 0,
  actual_cash_count NUMERIC(14, 0),
  variance NUMERIC(14, 0),
  notes TEXT,
  status TEXT NOT NULL CHECK (status IN ('terbuka', 'ditutup'))
);

-- 9. Inventaris, Pemasok, Pembelian & Mutasi Batch
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  buy_price NUMERIC(14, 0) NOT NULL,
  sell_price NUMERIC(14, 0) NOT NULL,
  min_stock INTEGER NOT NULL DEFAULT 0,
  supplier_id UUID REFERENCES suppliers(id),
  track_expiry BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS product_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id),
  batch_number TEXT NOT NULL,
  expiry_date DATE,
  quantity_available INTEGER NOT NULL CHECK (quantity_available >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, branch_id, batch_number)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  order_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draf', 'dipesan', 'diterima_sebagian', 'diterima_penuh')),
  lines JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES user_profiles(id)
);

CREATE TABLE IF NOT EXISTS stock_mutations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  product_id UUID NOT NULL REFERENCES products(id),
  batch_id UUID NOT NULL REFERENCES product_batches(id),
  batch_number TEXT NOT NULL,
  mutation_type TEXT NOT NULL,
  quantity_delta INTEGER NOT NULL,
  source_ref TEXT NOT NULL,
  reason TEXT,
  actor_name TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Log Audit Keamanan & Operasional
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_name TEXT NOT NULL,
  actor_roles TEXT[] NOT NULL,
  branch_id UUID,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
