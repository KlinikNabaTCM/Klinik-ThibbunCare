import React, { useEffect, useState } from 'react';
import { Calendar, FileText, Lock, MessageCircle, Printer, Receipt, Save, ShieldAlert, UserRound } from 'lucide-react';
import { ApiError, apiRequest, type BootstrapPayload, type DemoAccountSummary } from '../lib/api';
import type { Invoice, Patient, Reservation, Visit } from '../types/clinic';
import {
  INVOICE_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  buildWhatsappDraftUrl,
  formatRupiah,
  formatTanggal,
  todayJakartaISO,
} from '../utils/format';
import { PrintableReceipt } from './PrintableReceipt';

interface PatientPortalProps {
  bootstrap: BootstrapPayload;
  currentAccount?: DemoAccountSummary;
  onSwitchToPatientAccount: (patientUserId: string) => void;
  onOpenPortalWithUser: (patientUserId: string) => Promise<void> | void;
  onGoPublic: () => void;
}

interface PortalOverviewResponse {
  patient: Patient;
  reservations: Reservation[];
  visits: Visit[];
  invoices: Invoice[];
}

export const PatientPortal: React.FC<PatientPortalProps> = ({
  bootstrap,
  currentAccount,
  onOpenPortalWithUser,
  onGoPublic,
}) => {
  const { settings, branches, services, practitioners } = bootstrap;

  const [data, setData] = useState<PortalOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit profile
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  // New reservation request
  const [reqBranchId, setReqBranchId] = useState(branches[0]?.id || 'br-jkt');
  const [reqServiceId, setReqServiceId] = useState(services[0]?.id || 'srv-tcm');
  const [reqPracId, setReqPracId] = useState(practitioners[0]?.id || 'prac-aisyah');
  const [reqDate, setReqDate] = useState(todayJakartaISO());
  const [reqTime, setReqTime] = useState('14:00');
  const [reqSlots, setReqSlots] = useState<
    Array<{ startTime: string; endTime: string; available: boolean; conflictReason?: string }>
  >([]);
  const [loadingReqSlots, setLoadingReqSlots] = useState(false);
  const [reqNotes, setReqNotes] = useState('');
  const [reqMessage, setReqMessage] = useState<string | null>(null);
  const [reqError, setReqError] = useState<string | null>(null);

  // Receipt & Summary view
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [activeSummary, setActiveSummary] = useState<{
    visitNumber: string;
    visitDate: string;
    followUpDate?: string;
    referralNote?: string;
    sharedSummaryText?: string;
  } | null>(null);

  // Self-service patient portal entry (works for ANY patient & visit without admin)
  const [showSwitchPatientModal, setShowSwitchPatientModal] = useState(false);
  const [enterKey, setEnterKey] = useState('');
  const [enterDob, setEnterDob] = useState('');
  const [enterError, setEnterError] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);

  const handleSelfServiceEnter = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnterError(null);
    setEntering(true);
    try {
      const res = await apiRequest<{ user: { id: string } }>('/api/portal/enter', {
        method: 'POST',
        body: JSON.stringify({
          patientNumberOrPhone: enterKey,
          dateOfBirth: enterDob,
        }),
      });
      setShowSwitchPatientModal(false);
      await onOpenPortalWithUser(res.user.id);
    } catch (err) {
      setEnterError(err instanceof Error ? err.message : 'Gagal masuk ke Portal Pasien.');
    } finally {
      setEntering(false);
    }
  };

  const loadPortal = async () => {
    if (!currentAccount?.linkedPatientId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<PortalOverviewResponse>('/api/portal/overview');
      setData(res);
      setPhone(res.patient.phone);
      setAddress(res.patient.address);
      setEmergencyName(res.patient.emergencyContactName || '');
      setEmergencyPhone(res.patient.emergencyContactPhone || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat portal pasien.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortal();
  }, [currentAccount?.id]);

  const fetchReqAvailability = async () => {
    const srv = services.find((s) => s.id === reqServiceId);
    const dur = srv?.durationMinutes || 45;
    setLoadingReqSlots(true);
    try {
      const res = await apiRequest<{
        slots: Array<{ startTime: string; endTime: string; available: boolean; conflictReason?: string }>;
      }>(
        `/api/public/availability?branchId=${encodeURIComponent(reqBranchId)}&practitionerId=${encodeURIComponent(
          reqPracId
        )}&date=${encodeURIComponent(reqDate)}&durationMinutes=${dur}`
      );
      setReqSlots(res.slots);
      const firstAvail = res.slots.find((s) => s.available);
      if (firstAvail && !res.slots.some((s) => s.startTime === reqTime && s.available)) {
        setReqTime(firstAvail.startTime);
      }
    } catch {
      setReqSlots([]);
    } finally {
      setLoadingReqSlots(false);
    }
  };

  useEffect(() => {
    fetchReqAvailability();
  }, [reqBranchId, reqPracId, reqServiceId, reqDate]);

  const handleReqBranchChange = (nextBranch: string) => {
    setReqBranchId(nextBranch);
    const validSrv = services.find((s) => s.activeBranchIds.includes(nextBranch));
    if (validSrv) setReqServiceId(validSrv.id);
    const validPrac = practitioners.find((p) => p.branchIds.includes(nextBranch));
    if (validPrac) setReqPracId(validPrac.id);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileNotice(null);
    try {
      await apiRequest('/api/portal/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          phone,
          address,
          emergencyContactName: emergencyName,
          emergencyContactPhone: emergencyPhone,
        }),
      });
      setProfileNotice('Profil kontak & kontak darurat diperbarui.');
      await loadPortal();
    } catch (err) {
      setProfileNotice(err instanceof Error ? err.message : 'Gagal memperbarui profil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateScheduleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setReqMessage(null);
    setReqError(null);
    try {
      const res = await apiRequest<{ reservation: Reservation }>('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({
          branchId: reqBranchId,
          patientId: data?.patient.id,
          practitionerId: reqPracId,
          serviceIds: [reqServiceId],
          date: reqDate,
          startTime: reqTime,
          notes: reqNotes,
          whatsappConsent: true,
        }),
      });
      setReqMessage(
        `Permintaan jadwal ${res.reservation.reservationCode} berhasil dikirim (${formatTanggal(
          res.reservation.date
        )}, ${res.reservation.startTime} WIB).`
      );
      setReqNotes('');
      await Promise.all([loadPortal(), fetchReqAvailability()]);
    } catch (err) {
      if (err instanceof ApiError) {
        const alts = Array.isArray(err.data.alternativeSlots)
          ? (err.data.alternativeSlots as Array<{ startTime: string }>).map((a) => a.startTime).join(', ')
          : '';
        setReqError(alts ? `${err.message} Alternatif tersedia: ${alts} WIB.` : err.message);
      } else {
        setReqError('Gagal mengirim permintaan jadwal.');
      }
    }
  };

  const handleOpenApprovedSummary = async (visitId: string) => {
    setError(null);
    try {
      const summary = await apiRequest<{
        visitNumber: string;
        visitDate: string;
        followUpDate?: string;
        referralNote?: string;
        sharedSummaryText?: string;
      }>(`/api/portal/visits/${visitId}/summary`);
      setActiveSummary(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka ringkasan kunjungan.');
    }
  };

  const handleOpenInvoiceReceipt = async (invoiceId: string) => {
    setError(null);
    try {
      const res = await apiRequest<{ invoice: Invoice }>(`/api/portal/invoices/${invoiceId}`);
      setPrintInvoice(res.invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka kuitansi.');
    }
  };

  if (!currentAccount?.linkedPatientId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-6">
        <div className="rounded-lg border border-[#E4DDD0] bg-white p-8">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#734F2C]">
            <UserRound className="h-4 w-4" />
            Portal Pasien ThibbunCare · Akses Mandiri Semua Pasien
          </div>
          <h1 className="mt-2 font-editorial text-2xl font-semibold text-[#1F241D]">
            Masuk ke Portal Pasien (Tanpa Perlu Admin)
          </h1>
          <p className="mt-2 text-sm text-[#4A5045]">
            Setiap pasien yang pernah mendaftar, membuat janji di Website Publik, atau melakukan kunjungan dapat langsung melihat seluruh riwayat kunjungan, jadwal kontrol, ringkasan disetujui, dan kuitansi dengan Nomor Pasien atau Nomor WhatsApp beserta Tanggal Lahir.
          </p>

          <form onSubmit={handleSelfServiceEnter} className="mt-5 grid grid-cols-1 gap-3 rounded-md border border-[#E4DDD0] bg-[#FBF8F3] p-4 sm:grid-cols-3 text-xs">
            <div>
              <label className="block font-semibold text-[#4A5045]">No. Pasien (RM-...) atau No. WA</label>
              <input
                type="text"
                required
                value={enterKey}
                onChange={(e) => setEnterKey(e.target.value)}
                placeholder="RM-2026-0001 atau 0812..."
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#4A5045]">Tanggal Lahir</label>
              <input
                type="date"
                required
                value={enterDob}
                onChange={(e) => setEnterDob(e.target.value)}
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-3 py-2 font-mono"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={entering}
                className="w-full rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white hover:bg-[#2F3E29]"
              >
                {entering ? 'Memeriksa...' : 'Buka Portal Saya'}
              </button>
            </div>
            {enterError && (
              <div className="sm:col-span-3 rounded bg-[#FEF2F2] p-2.5 text-[#991B1B]">{enterError}</div>
            )}
          </form>

          <div className="mt-6 flex items-center justify-between border-t border-[#EFE8DC] pt-4 text-xs text-[#5E645A]">
            <span>Nomor Pasien tertera pada bukti pendaftaran &amp; kuitansi Anda.</span>
            <button
              type="button"
              onClick={onGoPublic}
              className="rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-3.5 py-2 font-medium text-[#1F241D] hover:bg-[#F5EFE6]"
            >
              Kembali ke Website Publik
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 border-b border-[#E4DDD0] pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold text-[#734F2C]">Portal Pasien · {settings.clinicName}</p>
          <h1 className="mt-1 font-editorial text-3xl font-semibold text-[#1F241D]">
            {data?.patient.fullName || 'Memuat Profil...'}
          </h1>
          <p className="mt-1 font-mono text-xs tabular-nums text-[#5E645A]">
            No. Pasien: {data?.patient.patientNumber || '-'} · Tgl Lahir: {formatTanggal(data?.patient.dateOfBirth)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <button
            type="button"
            onClick={() => {
              setEnterError(null);
              setShowSwitchPatientModal((v) => !v);
            }}
            className="rounded-md border border-[#734F2C] bg-[#F5EFE6] px-4 py-2 text-xs font-semibold text-[#5C3D21] hover:bg-[#EAE0D0]"
          >
            {showSwitchPatientModal ? 'Tutup Form Masuk' : 'Ganti / Masuk Pasien Lain'}
          </button>
          <button
            type="button"
            onClick={loadPortal}
            className="rounded-md border border-[#D4C5AF] bg-white px-4 py-2 text-xs font-semibold text-[#1F241D] hover:bg-[#F5EFE6]"
          >
            Segarkan Data Portal
          </button>
        </div>
      </div>

      {showSwitchPatientModal && (
        <form
          onSubmit={handleSelfServiceEnter}
          className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-[#D4C5AF] bg-white p-4 sm:grid-cols-4 text-xs"
        >
          <div>
            <label className="block font-semibold text-[#4A5045]">No. Pasien (RM-...) / No. WA</label>
            <input
              type="text"
              required
              value={enterKey}
              onChange={(e) => setEnterKey(e.target.value)}
              placeholder="RM-2026-0001 atau 0812..."
              className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-[#4A5045]">Tanggal Lahir</label>
            <input
              type="date"
              required
              value={enterDob}
              onChange={(e) => setEnterDob(e.target.value)}
              className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 font-mono"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={entering}
              className="w-full rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white"
            >
              {entering ? 'Memeriksa...' : 'Buka Portal Pasien Ini'}
            </button>
          </div>
          <div className="flex items-end text-[11px] text-[#5E645A]">
            Berlaku untuk seluruh pasien terdaftar tanpa perlu dibuatkan akun oleh admin.
          </div>
          {enterError && (
            <div className="sm:col-span-4 rounded bg-[#FEF2F2] p-2.5 text-[#991B1B]">{enterError}</div>
          )}
        </form>
      )}

      {error && (
        <div className="mt-6 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] p-4 text-sm text-[#991B1B]">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="h-48 animate-pulse rounded-lg bg-[#EAE0D0]" />
          <div className="h-48 animate-pulse rounded-lg bg-[#EAE0D0] lg:col-span-2" />
        </div>
      ) : (
        data && (
          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Left: Profile + Self-Schedule Request */}
            <div className="space-y-6 lg:col-span-4">
              <div className="rounded-lg border border-[#E4DDD0] bg-white p-5">
                <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">Profil & Kontak Darurat</h2>
                <form onSubmit={handleSaveProfile} className="mt-4 space-y-3 text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-[#4A5045]">Nomor Telepon / WhatsApp</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#4A5045]">Alamat</label>
                    <textarea
                      rows={2}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#4A5045]">Kontak Darurat / Wali</label>
                    <input
                      type="text"
                      value={emergencyName}
                      onChange={(e) => setEmergencyName(e.target.value)}
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#4A5045]">Telepon Darurat</label>
                    <input
                      type="tel"
                      value={emergencyPhone}
                      onChange={(e) => setEmergencyPhone(e.target.value)}
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 font-mono text-xs"
                    />
                  </div>
                  {profileNotice && <p className="text-xs font-medium text-[#3D4F35]">{profileNotice}</p>}
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded bg-[#3D4F35] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2F3E29]"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {savingProfile ? 'Menyimpan...' : 'Simpan Profil'}
                  </button>
                </form>
              </div>

              <div className="rounded-lg border border-[#E4DDD0] bg-white p-5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#734F2C]">
                  <Calendar className="h-4 w-4" />
                  Permintaan Jadwal Baru
                </div>
                <form onSubmit={handleCreateScheduleRequest} className="mt-4 space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Cabang</label>
                    <select
                      value={reqBranchId}
                      onChange={(e) => handleReqBranchChange(e.target.value)}
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Layanan</label>
                    <select
                      value={reqServiceId}
                      onChange={(e) => setReqServiceId(e.target.value)}
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                    >
                      {services
                        .filter((s) => s.activeBranchIds.includes(reqBranchId))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({formatRupiah(s.price)})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Praktisi</label>
                    <select
                      value={reqPracId}
                      onChange={(e) => setReqPracId(e.target.value)}
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                    >
                      {practitioners
                        .filter((p) => p.branchIds.includes(reqBranchId))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Tanggal</label>
                    <input
                      type="date"
                      value={reqDate}
                      min={todayJakartaISO()}
                      onChange={(e) => setReqDate(e.target.value)}
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">
                      Pilih Slot Jam (WIB) {loadingReqSlots ? '· Memuat...' : ''}
                    </label>
                    {reqSlots.length === 0 ? (
                      <div className="mt-1 rounded border border-[#E4DDD0] bg-[#FBF8F3] p-2 text-[11px] text-[#5E645A]">
                        Tidak ada jadwal praktik pada tanggal ini.
                      </div>
                    ) : (
                      <div className="mt-1 grid grid-cols-4 gap-1.5">
                        {reqSlots.map((s) => (
                          <button
                            key={s.startTime}
                            type="button"
                            disabled={!s.available}
                            title={s.conflictReason || `${s.startTime}–${s.endTime} WIB`}
                            onClick={() => setReqTime(s.startTime)}
                            className={`rounded border px-1.5 py-1.5 font-mono text-[11px] tabular-nums ${
                              !s.available
                                ? 'cursor-not-allowed border-[#EFE8DC] bg-[#F5EFE6] text-[#9A9B94] line-through'
                                : reqTime === s.startTime
                                ? 'border-[#3D4F35] bg-[#3D4F35] font-semibold text-white'
                                : 'border-[#D4C5AF] bg-[#FBF8F3] text-[#1F241D]'
                            }`}
                          >
                            {s.startTime}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Catatan</label>
                    <input
                      type="text"
                      value={reqNotes}
                      onChange={(e) => setReqNotes(e.target.value)}
                      placeholder="Catatan singkat"
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                    />
                  </div>
                  {reqError && <div className="rounded bg-[#FEF2F2] p-2.5 text-[#991B1B]">{reqError}</div>}
                  {reqMessage && <div className="rounded bg-[#F4F6F1] p-2.5 text-[#243020]">{reqMessage}</div>}
                  <button
                    type="submit"
                    className="w-full rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white hover:bg-[#2F3E29]"
                  >
                    Ajukan Jadwal
                  </button>
                </form>
              </div>

              {/* Privacy Notice Card */}
              <div className="rounded-lg border border-[#E4DDD0] bg-[#F5EFE6] p-4 text-xs text-[#4A5045]">
                <div className="flex items-center gap-1.5 font-semibold text-[#5C3D21]">
                  <Lock className="h-3.5 w-3.5" />
                  Privasi Data Pasien Terlindungi
                </div>
                <p className="mt-1.5 leading-relaxed">
                  Seluruh riwayat kunjungan, ringkasan yang disetujui, dan kuitansi di portal ini terisolasi khusus untuk akun Anda.
                </p>
              </div>
            </div>

            {/* Right: Reservations, Follow-Ups, Approved Summaries, Receipts */}
            <div className="space-y-6 lg:col-span-8">
              {/* Reservasi & Jadwal Kontrol */}
              <div className="rounded-lg border border-[#E4DDD0] bg-white p-5">
                <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
                  Status Reservasi & Jadwal Kontrol
                </h2>
                {data.reservations.length === 0 ? (
                  <p className="mt-3 text-sm text-[#5E645A]">Belum ada reservasi tercatat.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#E4DDD0] text-[#5E645A]">
                          <th className="py-2 pr-3 font-semibold">Kode</th>
                          <th className="py-2 pr-3 font-semibold">Tanggal & Jam</th>
                          <th className="py-2 pr-3 font-semibold">Layanan & Praktisi</th>
                          <th className="py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFE8DC]">
                        {data.reservations.map((r) => {
                          const prac = practitioners.find((p) => p.id === r.practitionerId);
                          const srvNames = r.serviceIds
                            .map((id) => services.find((s) => s.id === id)?.name || id)
                            .join(', ');
                          return (
                            <tr key={r.id}>
                              <td className="py-3 pr-3 font-mono font-semibold tabular-nums">
                                {r.reservationCode}
                              </td>
                              <td className="py-3 pr-3 font-mono tabular-nums">
                                {formatTanggal(r.date)} · {r.startTime}–{r.endTime} WIB
                              </td>
                              <td className="py-3 pr-3">
                                <div className="font-medium text-[#1F241D]">{srvNames}</div>
                                <div className="text-[#5E645A]">{prac?.name}</div>
                              </td>
                              <td className="py-3 font-semibold text-[#3D4F35]">
                                {RESERVATION_STATUS_LABELS[r.status] || r.status}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Ringkasan Kunjungan yang Disetujui */}
              <div className="rounded-lg border border-[#E4DDD0] bg-white p-5">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#3D4F35]" />
                  <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
                    Ringkasan Kunjungan & Jadwal Kontrol
                  </h2>
                </div>
                <p className="mt-1 text-xs text-[#5E645A]">
                  Hanya ringkasan kunjungan yang telah disetujui oleh praktisi yang dapat dibuka di portal pasien.
                </p>

                <div className="mt-4 divide-y divide-[#EFE8DC]">
                  {data.visits.length === 0 ? (
                    <p className="py-4 text-sm text-[#5E645A]">Belum ada riwayat kunjungan.</p>
                  ) : (
                    data.visits.map((v) => {
                      const prac = practitioners.find((p) => p.id === v.practitionerId);
                      const branch = branches.find((b) => b.id === v.branchId);
                      const waPhone = branch?.whatsapp || settings.primaryWhatsapp;
                      const followUpStatusLabel =
                        v.followUpStatus === 'selesai'
                          ? 'Selesai'
                          : v.followUpStatus === 'tidak_perlu'
                            ? 'Tidak Perlu Kontrol'
                            : 'Dijadwalkan';
                      return (
                        <div key={v.id} className="py-4 first:pt-2 last:pb-0">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="font-mono text-xs font-semibold tabular-nums text-[#2F3E29]">
                                {v.visitNumber} · {formatTanggal(v.visitDate)}, {v.visitTime} WIB
                              </div>
                              <div className="text-xs text-[#5E645A]">Praktisi: {prac?.name}</div>
                              {v.followUpDate && (
                                <div className="mt-1 text-xs font-semibold text-[#734F2C]">
                                  Jadwal Kontrol Berikutnya: {formatTanggal(v.followUpDate)} ({followUpStatusLabel})
                                </div>
                              )}
                              {v.referralNote && (
                                <div className="mt-0.5 text-xs text-[#4A5045]">
                                  Catatan Rujukan / Tindak Lanjut: {v.referralNote}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {v.followUpDate && v.followUpStatus === 'dijadwalkan' && waPhone && (
                                <a
                                  href={buildWhatsappDraftUrl(
                                    waPhone,
                                    `Halo ${settings.clinicName}, saya ${data.patient.fullName} (${data.patient.patientNumber}) ingin mengonfirmasi jadwal kontrol untuk kunjungan ${v.visitNumber} pada ${formatTanggal(v.followUpDate)}.`
                                  )}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded border border-[#734F2C] px-2.5 py-1.5 text-xs font-semibold text-[#734F2C] hover:bg-[#F5EFE6]"
                                >
                                  <MessageCircle className="h-3.5 w-3.5" />
                                  Konfirmasi Kontrol WA
                                </a>
                              )}
                              {v.sharedSummaryApproved ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenApprovedSummary(v.id)}
                                  className="rounded border border-[#3D4F35] px-3 py-1.5 text-xs font-semibold text-[#3D4F35] hover:bg-[#3D4F35] hover:text-white"
                                >
                                  Buka Ringkasan
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-[#5E645A]">
                                  <ShieldAlert className="h-3.5 w-3.5" />
                                  Menunggu persetujuan bagikan dari praktisi
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Kuitansi */}
              <div className="rounded-lg border border-[#E4DDD0] bg-white p-5">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-[#3D4F35]" />
                  <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
                    Kuitansi Pembayaran
                  </h2>
                </div>
                {data.invoices.length === 0 ? (
                  <p className="mt-3 text-sm text-[#5E645A]">Belum ada kuitansi terdaftar.</p>
                ) : (
                  <div className="mt-4 divide-y divide-[#EFE8DC]">
                    {data.invoices.map((inv) => (
                      <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                          <div className="font-mono text-xs font-semibold tabular-nums">
                            {inv.invoiceNumber} · {formatTanggal(inv.issuedAt)}
                          </div>
                          <div className="text-xs text-[#5E645A]">
                            Total {formatRupiah(inv.totalAmount)} ·{' '}
                            {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenInvoiceReceipt(inv.id)}
                          className="inline-flex items-center gap-1.5 rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-1.5 text-xs font-semibold text-[#1F241D] hover:bg-[#EAE0D0]"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Lihat & Cetak Kuitansi
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      )}

      {printInvoice && data && (
        <PrintableReceipt
          invoice={printInvoice}
          patient={data.patient}
          branch={branches.find((b) => b.id === printInvoice.branchId)}
          settings={settings}
          onClose={() => setPrintInvoice(null)}
        />
      )}

      {activeSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="print-sheet w-full max-w-xl rounded-lg border border-[#E4DDD0] bg-white p-6">
            <div className="flex items-start justify-between gap-4 border-b border-[#EFE8DC] pb-4">
              <div>
                <div className="text-xs font-semibold text-[#734F2C]">Ringkasan Kunjungan yang Disetujui</div>
                <h3 className="mt-1 font-editorial text-xl font-semibold text-[#1F241D]">
                  {activeSummary.visitNumber} · {formatTanggal(activeSummary.visitDate)}
                </h3>
              </div>
              <div className="no-print flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1 rounded bg-[#3D4F35] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Cetak
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSummary(null)}
                  className="rounded border border-[#D4C5AF] px-3 py-1.5 text-xs font-medium"
                >
                  Tutup
                </button>
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#1F241D]">
              <p>{activeSummary.sharedSummaryText}</p>
              {activeSummary.referralNote && (
                <div className="rounded bg-[#FBF8F3] p-3 text-xs text-[#4A5045]">
                  <span className="font-semibold">Catatan Rujukan / Tindak Lanjut:</span>{' '}
                  {activeSummary.referralNote}
                </div>
              )}
              {activeSummary.followUpDate && (
                <div className="text-xs font-semibold text-[#3D4F35]">
                  Jadwal Kontrol: {formatTanggal(activeSummary.followUpDate)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
