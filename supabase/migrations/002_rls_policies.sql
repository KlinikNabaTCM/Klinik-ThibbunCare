-- ThibbunCare — Kebijakan Row Level Security (002)
-- Menjamin isolasi cabang, peran, izin khusus catatan klinis, dan kepemilikan pasien.

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapy_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_addendums ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Fungsi bantu otorisasi
CREATE OR REPLACE FUNCTION has_app_role(target_role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = target_role
  );
$$;

CREATE OR REPLACE FUNCTION has_branch_access(target_branch UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_branches WHERE user_id = auth.uid() AND branch_id = target_branch
  );
$$;

CREATE OR REPLACE FUNCTION can_read_clinical_notes()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND active = TRUE
      AND can_access_clinical_notes = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION current_linked_patient_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT linked_patient_id FROM user_profiles WHERE id = auth.uid();
$$;

-- PASIEN: Staf cabang terkait atau pasien pemilik akun
CREATE POLICY patients_staff_branch_read ON patients FOR SELECT USING (
  (has_branch_access(branch_id) AND (
    has_app_role('pemilik') OR has_app_role('resepsionis') OR
    has_app_role('praktisi') OR has_app_role('asisten') OR has_app_role('kasir')
  ))
  OR id = current_linked_patient_id()
);

CREATE POLICY patients_staff_write ON patients FOR ALL USING (
  has_branch_access(branch_id) AND (has_app_role('pemilik') OR has_app_role('resepsionis'))
);

-- CATATAN KLINIS: Wajib izin eksplisit can_access_clinical_notes + akses cabang!
-- Kasir, Petugas Inventaris, dan Pemilik tanpa izin klinis DITOLAK oleh database.
CREATE POLICY clinical_records_strict_read ON clinical_records FOR SELECT USING (
  can_read_clinical_notes()
  AND has_branch_access(branch_id)
  AND (has_app_role('praktisi') OR has_app_role('asisten') OR has_app_role('pemilik'))
);

CREATE POLICY clinical_records_practitioner_write ON clinical_records FOR ALL USING (
  can_read_clinical_notes()
  AND has_branch_access(branch_id)
  AND (has_app_role('praktisi') OR has_app_role('asisten'))
);

-- KOREKSI BERTANGGAL: Hanya tambah (INSERT), tidak boleh UPDATE atau DELETE catatan final
CREATE POLICY clinical_addendums_read ON clinical_addendums FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM clinical_records cr
    WHERE cr.visit_id = clinical_addendums.visit_id
      AND can_read_clinical_notes()
      AND has_branch_access(cr.branch_id)
  )
);

CREATE POLICY clinical_addendums_insert ON clinical_addendums FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM clinical_records cr
    WHERE cr.visit_id = clinical_addendums.visit_id
      AND can_read_clinical_notes()
      AND has_branch_access(cr.branch_id)
      AND has_app_role('praktisi')
  )
);

-- LAMPIRAN PRIVAT: Hanya petugas klinis berizin atau pasien pemilik jika dokumen diizinkan
CREATE POLICY attachments_read ON clinical_attachments FOR SELECT USING (
  (can_read_clinical_notes() AND has_branch_access(branch_id))
  OR patient_id = current_linked_patient_id()
);

-- INVOICE & PEMBAYARAN: Kasir & Pemilik pada cabang terkait, atau Pasien pemilik invoice
CREATE POLICY invoices_access ON invoices FOR SELECT USING (
  (has_branch_access(branch_id) AND (has_app_role('kasir') OR has_app_role('pemilik') OR has_app_role('resepsionis')))
  OR patient_id = current_linked_patient_id()
);

CREATE POLICY invoices_cashier_write ON invoices FOR ALL USING (
  has_branch_access(branch_id) AND (has_app_role('kasir') OR has_app_role('pemilik'))
);

-- KUNJUNGAN: Pasien hanya bisa melihat ringkasan kunjungan miliknya yang sudah disetujui untuk dibagikan
CREATE POLICY visits_read ON visits FOR SELECT USING (
  (has_branch_access(branch_id) AND (
    has_app_role('pemilik') OR has_app_role('resepsionis') OR
    has_app_role('praktisi') OR has_app_role('asisten') OR has_app_role('kasir')
  ))
  OR (patient_id = current_linked_patient_id())
);

-- INVENTARIS & MUTASI STOK: Petugas inventaris, pemilik, atau praktisi (pemakaian tindakan) pada cabang terkait
CREATE POLICY batches_read ON product_batches FOR SELECT USING (
  has_branch_access(branch_id) AND (
    has_app_role('inventaris') OR has_app_role('pemilik') OR has_app_role('praktisi') OR has_app_role('kasir')
  )
);

CREATE POLICY stock_mutations_write ON stock_mutations FOR INSERT WITH CHECK (
  has_branch_access(branch_id) AND (
    has_app_role('inventaris') OR has_app_role('pemilik') OR has_app_role('praktisi') OR has_app_role('kasir')
  )
);

-- AUDIT LOG: Hanya Pemilik/Manajer dengan akses cabang
CREATE POLICY audit_logs_owner_read ON audit_logs FOR SELECT USING (
  has_app_role('pemilik') AND (branch_id IS NULL OR has_branch_access(branch_id))
);
