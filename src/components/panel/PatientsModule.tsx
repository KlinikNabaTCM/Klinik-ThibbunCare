import React, { useEffect, useState } from 'react';
import { AlertTriangle, CalendarPlus, MessageCircle, Pencil, Plus, Search, UserCheck } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';
import type {
  Branch,
  ClinicSettings,
  Patient,
  Practitioner,
  Reservation,
  ServiceItem,
  Visit,
} from '../../types/clinic';
import { RESERVATION_STATUS_LABELS, formatTanggal } from '../../utils/format';
import { FollowUpWhatsappPanel } from './FollowUpWhatsappPanel';

interface PatientsModuleProps {
  settings: ClinicSettings;
  whatsappProviderConfigured?: boolean;
  patients: Patient[];
  branches: Branch[];
  services: ServiceItem[];
  practitioners: Practitioner[];
  reservations: Reservation[];
  visits: Visit[];
  canManagePatients?: boolean;
  onRefresh: () => Promise<void>;
  onCheckInWalkIn: (patient: Patient) => void;
  onCreateReservation?: (patient: Patient) => void;
  onOpenClinicalVisit: (visitId: string) => void;
}

export const PatientsModule: React.FC<PatientsModuleProps> = ({
  settings,
  whatsappProviderConfigured = false,
  patients,
  branches,
  services,
  practitioners,
  reservations,
  visits,
  canManagePatients = true,
  onRefresh,
  onCheckInWalkIn,
  onCreateReservation,
  onOpenClinicalVisit,
}) => {
  const [search, setSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(patients[0] || null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [waVisitTarget, setWaVisitTarget] = useState<Visit | null>(null);

  // Edit existing patient state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '',
    dateOfBirth: '',
    gender: 'P' as 'L' | 'P',
    phone: '',
    address: '',
    guardianName: '',
    guardianRelation: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('1990-01-15');
  const [gender, setGender] = useState<'L' | 'P'>('P');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelation, setGuardianRelation] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id || 'br-jkt');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Patient[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (branches.length > 0 && !branches.some((b) => b.id === branchId)) {
      setBranchId(branches[0].id);
    }
  }, [branches]);

  useEffect(() => {
    setSelectedPatient((prev) => {
      if (prev) {
        const fresh = patients.find((p) => p.id === prev.id);
        if (fresh) return fresh;
      }
      return patients[0] || null;
    });
  }, [patients]);

  const startEditPatient = (p: Patient) => {
    setEditError(null);
    setEditForm({
      fullName: p.fullName,
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      phone: p.phone,
      address: p.address,
      guardianName: p.guardianName || '',
      guardianRelation: p.guardianRelation || '',
      emergencyContactName: p.emergencyContactName || '',
      emergencyContactPhone: p.emergencyContactPhone || '',
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setSavingEdit(true);
    setEditError(null);
    setSuccessMsg(null);
    try {
      const res = await apiRequest<{ patient: Patient }>(`/api/patients/${selectedPatient.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      setSelectedPatient(res.patient);
      setIsEditing(false);
      setSuccessMsg(`Profil pasien ${res.patient.patientNumber} berhasil diperbarui.`);
      await onRefresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Gagal memperbarui data pasien.');
    } finally {
      setSavingEdit(false);
    }
  };

  const filtered = patients.filter((p) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      p.fullName.toLowerCase().includes(q) ||
      p.patientNumber.toLowerCase().includes(q) ||
      p.phone.includes(q)
    );
  });

  const submitRegistration = async (confirmDuplicate: boolean) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!fullName.trim() || !phone.trim() || !dateOfBirth) {
      setErrorMsg('Nama lengkap, tanggal lahir, dan nomor kontak wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest<{ patient: Patient }>('/api/patients', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          dateOfBirth,
          gender,
          phone,
          address,
          guardianName,
          guardianRelation,
          emergencyContactName,
          emergencyContactPhone,
          branchId,
          confirmDuplicate,
        }),
      });
      setDuplicates([]);
      setSuccessMsg(`Pasien baru terdaftar dengan nomor ${res.patient.patientNumber}.`);
      setSelectedPatient(res.patient);
      setShowNewForm(false);
      setFullName('');
      setPhone('');
      setAddress('');
      await onRefresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'POSSIBLE_DUPLICATE') {
        setErrorMsg(err.message);
        setDuplicates((err.data.duplicates as Patient[]) || []);
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Gagal mendaftarkan pasien.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const patReservations = selectedPatient
    ? reservations.filter((r) => r.patientId === selectedPatient.id)
    : [];
  const patVisits = selectedPatient
    ? visits.filter((v) => v.patientId === selectedPatient.id)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 border-b border-[#E4DDD0] pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-editorial text-2xl font-semibold text-[#1F241D]">
            Data Pasien & Pendaftaran
          </h1>
          <p className="text-xs text-[#5E645A]">
            Satu nomor pasien dapat digunakan untuk banyak kunjungan, layanan, dan kontrol lanjutan.
          </p>
        </div>
        {canManagePatients && (
          <button
            type="button"
            onClick={() => {
              setShowNewForm((v) => !v);
              setDuplicates([]);
              setErrorMsg(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#3D4F35] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2F3E29] self-start"
          >
            <Plus className="h-4 w-4" />
            {showNewForm ? 'Tutup Formulir' : 'Daftarkan Pasien Baru'}
          </button>
        )}
      </div>

      {successMsg && (
        <div className="rounded-md border border-[#3D4F35]/30 bg-[#F4F6F1] px-4 py-3 text-xs font-medium text-[#243020]">
          {successMsg}
        </div>
      )}

      {showNewForm && (
        <div className="rounded-lg border border-[#D4C5AF] bg-white p-6">
          <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
            Formulir Pendaftaran Pasien Baru
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 text-xs sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-[#4A5045]">Nama Lengkap</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nama sesuai identitas"
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#4A5045]">Cabang Pendaftaran</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#4A5045]">Tanggal Lahir</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#4A5045]">Jenis Kelamin</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'L' | 'P')}
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm"
              >
                <option value="P">Perempuan</option>
                <option value="L">Laki-laki</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#4A5045]">Nomor Kontak / WhatsApp</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812xxxxxxxx"
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 font-mono text-sm"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block font-semibold text-[#4A5045]">Alamat Lengkap</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Alamat tempat tinggal"
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#4A5045]">Nama Wali (jika anak/diwakili)</label>
              <input
                type="text"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#4A5045]">Hubungan Wali</label>
              <input
                type="text"
                value={guardianRelation}
                onChange={(e) => setGuardianRelation(e.target.value)}
                placeholder="Orang Tua / Pasangan"
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#4A5045]">Kontak Darurat (Nama & Telp)</label>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  placeholder="Nama"
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 text-xs"
                />
                <input
                  type="tel"
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  placeholder="No. Telp"
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="mt-4 rounded-md border border-[#D97706]/40 bg-[#FEF3C7]/60 p-4 text-xs text-[#92400E]">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                {errorMsg}
              </div>
              {duplicates.length > 0 && (
                <div className="mt-3 space-y-2">
                  {duplicates.map((dup) => (
                    <div
                      key={dup.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#D4C5AF] bg-white p-2.5 text-[#1F241D]"
                    >
                      <div>
                        <span className="font-mono font-bold">{dup.patientNumber}</span> · {dup.fullName} ·{' '}
                        {formatTanggal(dup.dateOfBirth)} · <span className="font-mono">{dup.phone}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPatient(dup);
                          setShowNewForm(false);
                          setDuplicates([]);
                          setErrorMsg(null);
                        }}
                        className="rounded bg-[#3D4F35] px-3 py-1 font-semibold text-white"
                      >
                        Gunakan Pasien Lama Ini
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => submitRegistration(true)}
                    className="mt-2 rounded border border-[#92400E] bg-white px-3 py-1.5 font-semibold text-[#92400E]"
                  >
                    Tetap Daftarkan sebagai Pasien Berbeda
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="rounded border border-[#D4C5AF] px-4 py-2 text-xs font-semibold text-[#4A5045]"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => submitRegistration(false)}
              className="rounded bg-[#3D4F35] px-5 py-2 text-xs font-semibold text-white hover:bg-[#2F3E29]"
            >
              {submitting ? 'Memeriksa & Menyimpan...' : 'Simpan Pasien Baru'}
            </button>
          </div>
        </div>
      )}

      {/* Search + Master-Detail Split */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-lg border border-[#E4DDD0] bg-white lg:col-span-5">
          <div className="border-b border-[#EFE8DC] p-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#5E645A]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama, no. pasien (RM-...), atau no. telepon..."
                className="w-full rounded-md border border-[#D4C5AF] bg-[#FBF8F3] py-2 pl-9 pr-3 text-xs focus:border-[#3D4F35] focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-[520px] divide-y divide-[#EFE8DC] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#5E645A]">
                Tidak ada pasien yang cocok dengan pencarian.
              </div>
            ) : (
              filtered.map((p) => {
                const active = selectedPatient?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPatient(p);
                      setIsEditing(false);
                    }}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      active ? 'bg-[#F4F6F1]' : 'hover:bg-[#FBF8F3]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-[#1F241D]">{p.fullName}</span>
                      <span className="font-mono text-xs font-semibold tabular-nums text-[#3D4F35]">
                        {p.patientNumber}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[11px] tabular-nums text-[#5E645A]">
                      <span>{p.phone}</span>
                      <span>·</span>
                      <span>Lahir {formatTanggal(p.dateOfBirth)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-7">
          {!selectedPatient ? (
            <div className="rounded-lg border border-[#E4DDD0] bg-white p-8 text-center text-sm text-[#5E645A]">
              Pilih pasien di daftar untuk melihat profil, riwayat kunjungan, dan reservasi aktif.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#E4DDD0] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#EFE8DC] pb-4">
                  <div>
                    <div className="font-mono text-xs font-bold tabular-nums text-[#3D4F35]">
                      {selectedPatient.patientNumber}
                    </div>
                    <h2 className="mt-0.5 font-editorial text-xl font-semibold text-[#1F241D]">
                      {selectedPatient.fullName}
                    </h2>
                    <p className="mt-1 text-xs text-[#5E645A]">
                      {selectedPatient.gender === 'L' ? 'Laki-laki' : 'Perempuan'} · Tgl Lahir{' '}
                      {formatTanggal(selectedPatient.dateOfBirth)} · Telp{' '}
                      <span className="font-mono">{selectedPatient.phone}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canManagePatients && (
                      <button
                        type="button"
                        onClick={() => (isEditing ? setIsEditing(false) : startEditPatient(selectedPatient))}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-xs font-semibold text-[#1F241D] hover:bg-[#EAE0D0]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {isEditing ? 'Batal Sunting' : 'Sunting Data'}
                      </button>
                    )}
                    {canManagePatients && onCreateReservation && (
                      <button
                        type="button"
                        onClick={() => onCreateReservation(selectedPatient)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#3D4F35] bg-white px-3 py-2 text-xs font-semibold text-[#3D4F35] hover:bg-[#F4F6F1]"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        Buat Reservasi
                      </button>
                    )}
                    {canManagePatients && (
                      <button
                        type="button"
                        onClick={() => onCheckInWalkIn(selectedPatient)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#3D4F35] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#2F3E29]"
                      >
                        <UserCheck className="h-4 w-4" />
                        Check-In Walk-In
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 rounded bg-[#F5EFE6]/70 px-3 py-1.5 text-[11px] text-[#5C3D21]">
                  Akses Portal Pasien Mandiri: No. Pasien <span className="font-mono font-bold">{selectedPatient.patientNumber}</span> + Tanggal Lahir <span className="font-mono font-bold">{selectedPatient.dateOfBirth}</span>
                </div>

                {isEditing ? (
                  <form onSubmit={handleSaveEdit} className="mt-4 space-y-3 border-t border-[#EFE8DC] pt-4 text-xs">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <label className="block font-semibold text-[#4A5045]">Nama Lengkap</label>
                        <input
                          type="text"
                          required
                          value={editForm.fullName}
                          onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-[#4A5045]">Jenis Kelamin</label>
                        <select
                          value={editForm.gender}
                          onChange={(e) => setEditForm({ ...editForm, gender: e.target.value as 'L' | 'P' })}
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5"
                        >
                          <option value="P">Perempuan</option>
                          <option value="L">Laki-laki</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-[#4A5045]">Tanggal Lahir</label>
                        <input
                          type="date"
                          required
                          value={editForm.dateOfBirth}
                          onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-[#4A5045]">Nomor Telepon / WA</label>
                        <input
                          type="tel"
                          required
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-[#4A5045]">Nama Wali</label>
                        <input
                          type="text"
                          value={editForm.guardianName}
                          onChange={(e) => setEditForm({ ...editForm, guardianName: e.target.value })}
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block font-semibold text-[#4A5045]">Alamat</label>
                        <input
                          type="text"
                          value={editForm.address}
                          onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-[#4A5045]">Hubungan Wali</label>
                        <input
                          type="text"
                          value={editForm.guardianRelation}
                          onChange={(e) => setEditForm({ ...editForm, guardianRelation: e.target.value })}
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-[#4A5045]">Kontak Darurat</label>
                        <input
                          type="text"
                          value={editForm.emergencyContactName}
                          onChange={(e) => setEditForm({ ...editForm, emergencyContactName: e.target.value })}
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-[#4A5045]">Telp Darurat</label>
                        <input
                          type="tel"
                          value={editForm.emergencyContactPhone}
                          onChange={(e) => setEditForm({ ...editForm, emergencyContactPhone: e.target.value })}
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5 font-mono"
                        />
                      </div>
                    </div>
                    {editError && <div className="rounded bg-[#FEF2F2] p-2 text-[#991B1B]">{editError}</div>}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="rounded border border-[#D4C5AF] px-3 py-1.5 font-semibold text-[#4A5045]"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={savingEdit}
                        className="rounded bg-[#3D4F35] px-4 py-1.5 font-semibold text-white"
                      >
                        {savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <span className="font-semibold text-[#4A5045]">Alamat:</span>{' '}
                      <span className="text-[#1F241D]">{selectedPatient.address}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-[#4A5045]">Wali / Kontak Darurat:</span>{' '}
                      <span className="text-[#1F241D]">
                        {selectedPatient.guardianName
                          ? `${selectedPatient.guardianName} (${selectedPatient.guardianRelation || 'Wali'})`
                          : selectedPatient.emergencyContactName
                          ? `${selectedPatient.emergencyContactName} · ${selectedPatient.emergencyContactPhone}`
                          : '-'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Active Reservations */}
              <div className="rounded-lg border border-[#E4DDD0] bg-white p-5">
                <h3 className="font-editorial text-base font-semibold text-[#1F241D]">
                  Reservasi Aktif & Riwayat Jadwal ({patReservations.length})
                </h3>
                <div className="mt-3 divide-y divide-[#EFE8DC] text-xs">
                  {patReservations.length === 0 ? (
                    <p className="py-2 text-[#5E645A]">Belum ada reservasi.</p>
                  ) : (
                    patReservations.map((r) => {
                      const prac = practitioners.find((p) => p.id === r.practitionerId);
                      return (
                        <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                          <div>
                            <div className="font-mono font-semibold tabular-nums">
                              {r.reservationCode} · {formatTanggal(r.date)}, {r.startTime}–{r.endTime} WIB
                            </div>
                            <div className="text-[#5E645A]">
                              {r.serviceIds.map((id) => services.find((s) => s.id === id)?.name).join(', ')} ·{' '}
                              {prac?.name}
                            </div>
                          </div>
                          <span className="font-semibold text-[#3D4F35]">
                            {RESERVATION_STATUS_LABELS[r.status]}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Visit History */}
              <div className="rounded-lg border border-[#E4DDD0] bg-white p-5">
                <h3 className="font-editorial text-base font-semibold text-[#1F241D]">
                  Riwayat Kunjungan & Jadwal Kontrol ({patVisits.length})
                </h3>
                <div className="mt-3 divide-y divide-[#EFE8DC] text-xs">
                  {patVisits.length === 0 ? (
                    <p className="py-2 text-[#5E645A]">Belum ada kunjungan tercatat.</p>
                  ) : (
                    patVisits.map((v) => {
                      const canNotifyWa =
                        canManagePatients &&
                        (Boolean(v.followUpDate) ||
                          Boolean(v.referralNote?.trim()) ||
                          v.sharedSummaryApproved);
                      return (
                        <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                          <div>
                            <div className="font-mono font-semibold tabular-nums">
                              {v.visitNumber} · {formatTanggal(v.visitDate)}, {v.visitTime} WIB
                            </div>
                            <div className="text-[#5E645A]">
                              Layanan: {v.serviceIds.map((id) => services.find((s) => s.id === id)?.name).join(', ')}
                            </div>
                            {v.followUpDate && (
                              <div className="text-[#734F2C] font-medium">
                                Kontrol: {formatTanggal(v.followUpDate)} ({v.followUpStatus})
                              </div>
                            )}
                            {v.referralNote && (
                              <div className="text-[#4A5045]">
                                Rujukan: {v.referralNote}
                              </div>
                            )}
                            <div className="mt-0.5 text-[11px] text-[#5E645A]">
                              Ringkasan Portal: {v.sharedSummaryApproved ? 'Disetujui dibagikan' : 'Belum dibagikan'} ·
                              Riwayat WA: {v.followUpMessageLogs?.length || 0} pesan
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {canNotifyWa && (
                              <button
                                type="button"
                                onClick={() => setWaVisitTarget(v)}
                                className="inline-flex items-center gap-1 rounded border border-[#734F2C] px-2.5 py-1 font-semibold text-[#734F2C] hover:bg-[#F5EFE6]"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                Kirim WA Tindak Lanjut
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onOpenClinicalVisit(v.id)}
                              className="rounded border border-[#3D4F35] px-2.5 py-1 font-semibold text-[#3D4F35] hover:bg-[#3D4F35] hover:text-white"
                            >
                              Lihat Catatan Kunjungan
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {waVisitTarget && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#EFE8DC] pb-3">
              <div>
                <h3 className="font-editorial text-lg font-semibold text-[#1F241D]">
                  Pemberitahuan WhatsApp Kunjungan {waVisitTarget.visitNumber}
                </h3>
                <p className="text-xs text-[#5E645A]">
                  Mengirimkan ringkasan yang telah disetujui dibagikan, jadwal kontrol lanjutan, & catatan rujukan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWaVisitTarget(null)}
                className="rounded border border-[#D4C5AF] px-3 py-1.5 text-xs font-semibold text-[#4A5045]"
              >
                Tutup
              </button>
            </div>
            <FollowUpWhatsappPanel
              visit={waVisitTarget}
              patient={selectedPatient}
              branch={branches.find((b) => b.id === waVisitTarget.branchId)}
              settings={settings}
              whatsappProviderConfigured={whatsappProviderConfigured}
              onDispatched={async (updatedVisit) => {
                setWaVisitTarget(updatedVisit);
                await onRefresh();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
