import React, { useEffect, useState } from 'react';
import { Calendar, Check, ClipboardList, Copy, ExternalLink, MessageSquare, Plus, RefreshCw } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';
import type {
  Branch,
  ClinicSettings,
  Patient,
  Practitioner,
  Reservation,
  ReservationStatus,
  Room,
  ServiceItem,
  Visit,
} from '../../types/clinic';
import {
  RESERVATION_STATUS_LABELS,
  buildPrivacySafeWhatsappMessage,
  buildWhatsappDraftUrl,
  formatTanggal,
  todayJakartaISO,
} from '../../utils/format';

interface ScheduleModuleProps {
  settings: ClinicSettings;
  branches: Branch[];
  rooms: Room[];
  patients: Patient[];
  practitioners: Practitioner[];
  services: ServiceItem[];
  reservations: Reservation[];
  visits?: Visit[];
  initialPatientId?: string;
  onRefresh: () => Promise<void>;
  onCheckInReservation: (reservation: Reservation) => Promise<void>;
  onOpenClinical?: (visitId: string) => void;
}

export const ScheduleModule: React.FC<ScheduleModuleProps> = ({
  settings,
  branches,
  rooms,
  patients,
  practitioners,
  services,
  reservations,
  visits = [],
  initialPatientId,
  onRefresh,
  onCheckInReservation,
  onOpenClinical,
}) => {
  const [calendarView, setCalendarView] = useState<'harian' | 'mingguan' | 'bulanan'>('harian');
  const [selectedDate, setSelectedDate] = useState(todayJakartaISO());
  const [branchFilter, setBranchFilter] = useState<string>(branches[0]?.id || 'br-jkt');
  const [showCreate, setShowCreate] = useState(false);

  // Create reservation form
  const [patientId, setPatientId] = useState(patients[0]?.id || '');
  const [practitionerId, setPractitionerId] = useState(practitioners[0]?.id || '');
  const [roomId, setRoomId] = useState(rooms[0]?.id || '');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([services[0]?.id || 'srv-tcm']);
  const [startTime, setStartTime] = useState('11:00');
  const [notes, setNotes] = useState('');
  const [whatsappConsent, setWhatsappConsent] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [altSlots, setAltSlots] = useState<Array<{ startTime: string; endTime: string }>>([]);

  // Reschedule / Cancel modal state
  const [rescheduleTarget, setRescheduleTarget] = useState<Reservation | null>(null);
  const [reschDate, setReschDate] = useState(todayJakartaISO());
  const [reschTime, setReschTime] = useState('15:00');
  const [reschReason, setReschReason] = useState('');
  const [reschError, setReschError] = useState<string | null>(null);

  // WhatsApp Template modal
  const [waTarget, setWaTarget] = useState<Reservation | null>(null);
  const [waType, setWaType] = useState<'konfirmasi' | 'pengingat' | 'ubah_jadwal' | 'kontrol'>('konfirmasi');
  const [waCopied, setWaCopied] = useState(false);
  const [waNotice, setWaNotice] = useState<string | null>(null);
  const [waError, setWaError] = useState<string | null>(null);

  useEffect(() => {
    if (branches.length > 0 && !branches.some((b) => b.id === branchFilter)) {
      setBranchFilter(branches[0].id);
    }
  }, [branches]);

  useEffect(() => {
    if (patients.length > 0 && !patients.some((p) => p.id === patientId)) {
      setPatientId(patients[0].id);
    }
  }, [patients]);

  useEffect(() => {
    if (initialPatientId && patients.some((p) => p.id === initialPatientId)) {
      setPatientId(initialPatientId);
      setShowCreate(true);
    }
  }, [initialPatientId, patients]);

  useEffect(() => {
    const validPracs = practitioners.filter((p) => p.branchIds.includes(branchFilter));
    if (validPracs.length > 0 && !validPracs.some((p) => p.id === practitionerId)) {
      setPractitionerId(validPracs[0].id);
    }
    const validRooms = rooms.filter((rm) => rm.branchId === branchFilter);
    if (validRooms.length > 0 && !validRooms.some((rm) => rm.id === roomId)) {
      setRoomId(validRooms[0].id);
    }
    const validSrvs = services.filter((s) => s.activeBranchIds.includes(branchFilter));
    if (validSrvs.length > 0) {
      setSelectedServiceIds((prev) => {
        const kept = prev.filter((id) => validSrvs.some((s) => s.id === id));
        return kept.length > 0 ? kept : [validSrvs[0].id];
      });
    }
  }, [branchFilter, practitioners, rooms, services]);

  const visibleReservations = reservations.filter((r) => {
    if (r.branchId !== branchFilter) return false;
    if (calendarView === 'harian') return r.date === selectedDate;
    if (calendarView === 'mingguan') {
      const base = new Date(`${selectedDate}T00:00:00+07:00`).getTime();
      const target = new Date(`${r.date}T00:00:00+07:00`).getTime();
      const diff = (target - base) / (1000 * 3600 * 24);
      return diff >= 0 && diff < 7;
    }
    return r.date.slice(0, 7) === selectedDate.slice(0, 7);
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setAltSlots([]);
    try {
      await apiRequest('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({
          branchId: branchFilter,
          patientId,
          practitionerId,
          roomId: settings.enableRoomTracking ? roomId : undefined,
          serviceIds: selectedServiceIds,
          date: selectedDate,
          startTime,
          notes,
          whatsappConsent,
        }),
      });
      setShowCreate(false);
      setNotes('');
      await onRefresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (Array.isArray(err.data.alternativeSlots)) {
          setAltSlots(err.data.alternativeSlots as Array<{ startTime: string; endTime: string }>);
        }
      } else {
        setFormError('Gagal menyimpan reservasi.');
      }
    }
  };

  const handleStatusChange = async (r: Reservation, nextStatus: ReservationStatus) => {
    let reason: string | undefined;
    if (nextStatus === 'batal' || nextStatus === 'tidak_hadir') {
      reason = nextStatus === 'batal' ? 'Pasien membatalkan jadwal' : 'Pasien tidak hadir tanpa konfirmasi';
    }
    try {
      await apiRequest(`/api/reservations/${r.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, reason }),
      });
      await onRefresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal memperbarui status.');
    }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;
    setReschError(null);
    try {
      await apiRequest(`/api/reservations/${rescheduleTarget.id}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({
          date: reschDate,
          startTime: reschTime,
          reason: reschReason || 'Permintaan penyesuaian jadwal pasien',
        }),
      });
      setRescheduleTarget(null);
      setReschReason('');
      await onRefresh();
    } catch (err) {
      setReschError(err instanceof Error ? err.message : 'Gagal mengubah jadwal.');
    }
  };

  const getWaText = (r: Reservation) => {
    const pat = patients.find((p) => p.id === r.patientId);
    const br = branches.find((b) => b.id === r.branchId);
    return buildPrivacySafeWhatsappMessage({
      templateType: waType,
      clinicName: settings.clinicName,
      branchName: br?.name || '',
      patientFirstName: pat?.fullName.split(' ')[0] || 'Pasien',
      reservationCode: r.reservationCode,
      date: r.date,
      time: r.startTime,
    });
  };

  const handleRecordWaDispatch = async (r: Reservation) => {
    setWaError(null);
    setWaNotice(null);
    const msg = getWaText(r);
    await navigator.clipboard?.writeText(msg).catch(() => {});
    try {
      const res = await apiRequest<{ idempotentReplay?: boolean }>(`/api/reservations/${r.id}/whatsapp-log`, {
        method: 'POST',
        body: JSON.stringify({
          templateType: waType,
          channel: settings.whatsappAutoSendEnabled ? 'whatsapp_provider' : 'whatsapp_draft',
          consentRecorded: true,
          idempotencyKey: `wa-${r.id}-${waType}-${r.date}-${r.startTime}`,
        }),
      });
      setWaCopied(true);
      setTimeout(() => setWaCopied(false), 2000);
      setWaNotice(
        res.idempotentReplay
          ? 'Pesan sudah tercatat sebelumnya pada jadwal yang sama (pencegahan pengiriman ganda).'
          : 'Pesan disalin & riwayat pengiriman tercatat.'
      );
      await onRefresh();
    } catch (err) {
      setWaError(err instanceof Error ? err.message : 'Gagal mencatat pengiriman pesan WhatsApp.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 border-b border-[#E4DDD0] pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-editorial text-2xl font-semibold text-[#1F241D]">
            Kalender & Reservasi
          </h1>
          <p className="text-xs text-[#5E645A]">
            Pencegahan benturan jadwal praktisi & ruangan secara atomik pada server.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#3D4F35] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2F3E29]"
          >
            <Plus className="h-4 w-4" />
            Buat Reservasi
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E4DDD0] bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-1.5 text-xs font-medium"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-1.5 font-mono text-xs"
          />
        </div>
        <div className="flex items-center gap-1 rounded bg-[#F5EFE6] p-1">
          {(['harian', 'mingguan', 'bulanan'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setCalendarView(mode)}
              className={`rounded px-3 py-1 text-xs font-semibold capitalize ${
                calendarView === mode ? 'bg-[#3D4F35] text-white' : 'text-[#4A5045]'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-lg border border-[#D4C5AF] bg-white p-5 space-y-4 text-xs">
          <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">Buat Janji Baru</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block font-semibold text-[#4A5045]">Pasien</label>
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.patientNumber} · {p.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#4A5045]">Praktisi</label>
              <select
                value={practitionerId}
                onChange={(e) => setPractitionerId(e.target.value)}
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
              >
                {practitioners
                  .filter((p) => p.branchIds.includes(branchFilter))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            {settings.enableRoomTracking && (
              <div>
                <label className="block font-semibold text-[#4A5045]">Ruangan</label>
                <select
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                >
                  {rooms
                    .filter((rm) => rm.branchId === branchFilter)
                    .map((rm) => (
                      <option key={rm.id} value={rm.id}>
                        {rm.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div>
              <label className="block font-semibold text-[#4A5045]">Jam Mulai (WIB)</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-[#4A5045]">Layanan (bisa pilih lebih dari satu)</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {services
                  .filter((s) => s.activeBranchIds.includes(branchFilter))
                  .map((s) => {
                    const checked = selectedServiceIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setSelectedServiceIds((prev) =>
                            checked
                              ? prev.length > 1
                                ? prev.filter((x) => x !== s.id)
                                : prev
                              : [...prev, s.id]
                          )
                        }
                        className={`rounded border px-2.5 py-1 text-xs font-medium ${
                          checked
                            ? 'border-[#3D4F35] bg-[#3D4F35] text-white'
                            : 'border-[#D4C5AF] bg-[#FBF8F3] text-[#1F241D]'
                        }`}
                      >
                        {s.name} ({s.durationMinutes}m)
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>

          {formError && (
            <div className="rounded bg-[#FEF2F2] p-3 text-[#991B1B]">
              <p className="font-semibold">{formError}</p>
              {altSlots.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-[11px]">Jadwal alternatif tersedia:</span>
                  {altSlots.map((a) => (
                    <button
                      key={a.startTime}
                      type="button"
                      onClick={() => setStartTime(a.startTime)}
                      className="rounded border border-[#991B1B]/30 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold"
                    >
                      {a.startTime}–{a.endTime}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={whatsappConsent}
                onChange={(e) => setWhatsappConsent(e.target.checked)}
              />
              <span>Pasien menyetujui pengingat jadwal via WhatsApp</span>
            </label>
            <button type="submit" className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white">
              Simpan Reservasi
            </button>
          </div>
        </form>
      )}

      {!showCreate && formError && (
        <div className="rounded bg-[#FEF2F2] p-3 text-xs font-medium text-[#991B1B]">{formError}</div>
      )}

      {/* Reservations Table */}
      <div className="rounded-lg border border-[#E4DDD0] bg-white overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#E4DDD0] bg-[#FBF8F3] text-[#5E645A]">
              <th className="px-4 py-3 font-semibold">Kode & Waktu</th>
              <th className="px-4 py-3 font-semibold">Pasien</th>
              <th className="px-4 py-3 font-semibold">Praktisi & Ruang</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFE8DC]">
            {visibleReservations.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#5E645A]">
                  Belum ada reservasi untuk filter tanggal/cabang ini.
                </td>
              </tr>
            ) : (
              visibleReservations.map((r) => {
                const pat = patients.find((p) => p.id === r.patientId);
                const prac = practitioners.find((p) => p.id === r.practitionerId);
                const room = rooms.find((rm) => rm.id === r.roomId);
                return (
                  <tr key={r.id} className="hover:bg-[#FBF8F3]">
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-[#2F3E29]">{r.reservationCode}</div>
                      <div className="font-mono tabular-nums text-[#5E645A]">
                        {formatTanggal(r.date)} · {r.startTime}–{r.endTime} WIB
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#1F241D]">{pat?.fullName}</div>
                      <div className="font-mono text-[#5E645A]">{pat?.patientNumber} · {pat?.phone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{prac?.name}</div>
                      <div className="text-[#5E645A]">{room?.name || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#3D4F35]">
                        {RESERVATION_STATUS_LABELS[r.status]}
                      </div>
                      {r.rescheduleHistory.length > 0 && (
                        <div className="text-[11px] text-[#734F2C]">
                          Diubah {r.rescheduleHistory.length}x
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1.5">
                        {r.status === 'menunggu_konfirmasi' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(r, 'terkonfirmasi')}
                            className="rounded border border-[#3D4F35] px-2.5 py-1 font-semibold text-[#3D4F35]"
                          >
                            Konfirmasi
                          </button>
                        )}
                        {(r.status === 'terkonfirmasi' || r.status === 'menunggu_konfirmasi') && (
                          <button
                            type="button"
                            onClick={async () => {
                              setFormError(null);
                              try {
                                await onCheckInReservation(r);
                              } catch (err) {
                                setFormError(err instanceof Error ? err.message : 'Gagal melakukan check-in.');
                              }
                            }}
                            className="rounded bg-[#3D4F35] px-2.5 py-1 font-semibold text-white"
                          >
                            Check-In
                          </button>
                        )}
                        {r.status === 'check_in' && onOpenClinical && (() => {
                          const linkedVisit = visits.find((v) => v.reservationId === r.id);
                          return linkedVisit ? (
                            <button
                              type="button"
                              onClick={() => onOpenClinical(linkedVisit.id)}
                              className="inline-flex items-center gap-1 rounded border border-[#3D4F35] px-2 py-1 font-semibold text-[#3D4F35] hover:bg-[#F4F6F1]"
                            >
                              <ClipboardList className="h-3 w-3" />
                              Buka Klinis
                            </button>
                          ) : null;
                        })()}
                        <button
                          type="button"
                          onClick={() => {
                            setRescheduleTarget(r);
                            setReschDate(r.date);
                            setReschTime(r.startTime);
                            setReschError(null);
                          }}
                          className="rounded border border-[#D4C5AF] px-2 py-1 text-[#4A5045]"
                        >
                          <RefreshCw className="inline h-3 w-3 mr-1" />
                          Ubah
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setWaTarget(r);
                            setWaNotice(null);
                            setWaError(null);
                          }}
                          className="rounded border border-[#D4C5AF] px-2 py-1 text-[#3D4F35]"
                        >
                          <MessageSquare className="inline h-3 w-3 mr-1" />
                          Pesan WA
                        </button>
                        {r.status !== 'batal' && r.status !== 'check_in' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(r, 'batal')}
                            className="rounded border border-[#DC2626]/30 px-2 py-1 text-[#991B1B]"
                          >
                            Batal
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleReschedule} className="w-full max-w-md rounded-lg bg-white p-6 space-y-4 text-xs">
            <h3 className="font-editorial text-lg font-semibold">
              Ubah Jadwal {rescheduleTarget.reservationCode}
            </h3>
            <div>
              <label className="block font-semibold text-[#4A5045]">Tanggal Baru</label>
              <input
                type="date"
                value={reschDate}
                onChange={(e) => setReschDate(e.target.value)}
                className="mt-1 w-full rounded border border-[#D4C5AF] px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#4A5045]">Jam Mulai Baru (WIB)</label>
              <input
                type="time"
                value={reschTime}
                onChange={(e) => setReschTime(e.target.value)}
                className="mt-1 w-full rounded border border-[#D4C5AF] px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#4A5045]">Alasan Perubahan Jadwal</label>
              <input
                type="text"
                required
                value={reschReason}
                onChange={(e) => setReschReason(e.target.value)}
                placeholder="Contoh: Permintaan pasien geser sore"
                className="mt-1 w-full rounded border border-[#D4C5AF] px-3 py-2"
              />
            </div>
            {reschError && <div className="rounded bg-[#FEF2F2] p-2.5 text-[#991B1B]">{reschError}</div>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="rounded border border-[#D4C5AF] px-3 py-1.5"
              >
                Tutup
              </button>
              <button type="submit" className="rounded bg-[#3D4F35] px-4 py-1.5 font-semibold text-white">
                Simpan Jadwal Baru
              </button>
            </div>
          </form>
        </div>
      )}

      {/* WhatsApp Template Modal */}
      {waTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 space-y-4 text-xs">
            <h3 className="font-editorial text-lg font-semibold">
              Templat Pesan WhatsApp (Aman Privasi)
            </h3>
            <p className="text-[#5E645A]">
              Isi pesan tidak mencantumkan keluhan atau diagnosis medis. Pengiriman otomatis hanya aktif jika penyedia pesan terhubung.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(['konfirmasi', 'pengingat', 'ubah_jadwal', 'kontrol'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setWaType(t)}
                  className={`rounded border px-2.5 py-1 font-semibold capitalize ${
                    waType === t ? 'border-[#3D4F35] bg-[#3D4F35] text-white' : 'border-[#D4C5AF]'
                  }`}
                >
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>
            <div className="rounded border border-[#E4DDD0] bg-[#FBF8F3] p-3 text-sm leading-relaxed text-[#1F241D]">
              {getWaText(waTarget)}
            </div>
            {waError && <div className="rounded bg-[#FEF2F2] p-2.5 text-[#991B1B]">{waError}</div>}
            {waNotice && <div className="rounded bg-[#F4F6F1] p-2.5 text-[#243020]">{waNotice}</div>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleRecordWaDispatch(waTarget)}
                  className="inline-flex items-center gap-1.5 rounded bg-[#3D4F35] px-3.5 py-2 font-semibold text-white"
                >
                  {waCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {waCopied ? 'Tersalin & Tercatat' : 'Salin & Catat Pengiriman'}
                </button>
                <a
                  href={buildWhatsappDraftUrl(
                    patients.find((p) => p.id === waTarget.patientId)?.phone || '',
                    getWaText(waTarget)
                  )}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => handleRecordWaDispatch(waTarget)}
                  className="inline-flex items-center gap-1.5 rounded border border-[#3D4F35] px-3.5 py-2 font-semibold text-[#3D4F35]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Buka Draf WhatsApp
                </a>
              </div>
              <button
                type="button"
                onClick={() => setWaTarget(null)}
                className="rounded border border-[#D4C5AF] px-3 py-2"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
