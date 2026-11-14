import React, { useEffect, useState } from 'react';
import { ArrowRight, Megaphone, Plus, Stethoscope, UserCheck } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import type {
  Branch,
  Patient,
  Practitioner,
  QueueItem,
  QueueStatus,
  Reservation,
  Room,
  ServiceItem,
  Visit,
} from '../../types/clinic';
import { QUEUE_STATUS_LABELS, formatJam } from '../../utils/format';

interface QueueModuleProps {
  branches: Branch[];
  rooms: Room[];
  patients: Patient[];
  practitioners: Practitioner[];
  services: ServiceItem[];
  reservations: Reservation[];
  queue: QueueItem[];
  visits: Visit[];
  onRefresh: () => Promise<void>;
  onOpenClinical: (visitId: string) => void;
  onOpenCashier: (visitId: string) => void;
  initialWalkInPatientId?: string;
}

export const QueueModule: React.FC<QueueModuleProps> = ({
  branches,
  rooms,
  patients,
  practitioners,
  services,
  reservations,
  queue,
  onRefresh,
  onOpenClinical,
  onOpenCashier,
  initialWalkInPatientId,
}) => {
  const [branchId, setBranchId] = useState(branches[0]?.id || 'br-jkt');
  const [showWalkIn, setShowWalkIn] = useState(Boolean(initialWalkInPatientId));

  // Walk-in state
  const [walkPatientId, setWalkPatientId] = useState(initialWalkInPatientId || patients[0]?.id || '');
  const [walkPracId, setWalkPracId] = useState(practitioners[0]?.id || '');
  const [walkRoomId, setWalkRoomId] = useState(rooms[0]?.id || '');
  const [walkServices, setWalkServices] = useState<string[]>([services[0]?.id || 'srv-tcm']);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (branches.length > 0 && !branches.some((b) => b.id === branchId)) {
      setBranchId(branches[0].id);
    }
  }, [branches]);

  useEffect(() => {
    if (initialWalkInPatientId) {
      setWalkPatientId(initialWalkInPatientId);
      setShowWalkIn(true);
    } else if (patients.length > 0 && !patients.some((p) => p.id === walkPatientId)) {
      setWalkPatientId(patients[0].id);
    }
  }, [initialWalkInPatientId, patients]);

  useEffect(() => {
    const validPracs = practitioners.filter((p) => p.branchIds.includes(branchId));
    if (validPracs.length > 0 && !validPracs.some((p) => p.id === walkPracId)) {
      setWalkPracId(validPracs[0].id);
    }
    const validRooms = rooms.filter((rm) => rm.branchId === branchId);
    if (validRooms.length > 0 && !validRooms.some((rm) => rm.id === walkRoomId)) {
      setWalkRoomId(validRooms[0].id);
    }
    const validSrvs = services.filter((s) => s.activeBranchIds.includes(branchId));
    if (validSrvs.length > 0) {
      setWalkServices((prev) => {
        const kept = prev.filter((id) => validSrvs.some((s) => s.id === id));
        return kept.length > 0 ? kept : [validSrvs[0].id];
      });
    }
  }, [branchId, practitioners, rooms, services]);

  const branchQueue = queue.filter((q) => q.branchId === branchId);
  const readyReservations = reservations.filter(
    (r) => r.branchId === branchId && (r.status === 'terkonfirmasi' || r.status === 'menunggu_konfirmasi')
  );

  const handleWalkInCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    try {
      await apiRequest('/api/queue/check-in', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          patientId: walkPatientId,
          practitionerId: walkPracId,
          roomId: walkRoomId,
          serviceIds: walkServices,
          isWalkIn: true,
        }),
      });
      setShowWalkIn(false);
      await onRefresh();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Gagal check-in kunjungan langsung.');
    }
  };

  const handleCheckInReservation = async (resId: string) => {
    setErrMsg(null);
    try {
      await apiRequest('/api/queue/check-in', {
        method: 'POST',
        body: JSON.stringify({ reservationId: resId }),
      });
      await onRefresh();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Gagal check-in reservasi.');
    }
  };

  const handleQueueStatus = async (qId: string, status: QueueStatus) => {
    setErrMsg(null);
    try {
      await apiRequest(`/api/queue/${qId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await onRefresh();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Gagal memperbarui status antrean.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 border-b border-[#E4DDD0] pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-editorial text-2xl font-semibold text-[#1F241D]">
            Check-In & Antrean Layanan
          </h1>
          <p className="text-xs text-[#5E645A]">
            Kelola kedatangan reservasi maupun kunjungan langsung (walk-in) dengan banyak layanan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rounded border border-[#D4C5AF] bg-white px-3 py-2 text-xs font-medium"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowWalkIn((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded bg-[#3D4F35] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2F3E29]"
          >
            <Plus className="h-4 w-4" />
            Kunjungan Langsung (Walk-In)
          </button>
        </div>
      </div>

      {errMsg && (
        <div className="rounded bg-[#FEF2F2] p-3 text-xs font-medium text-[#991B1B]">{errMsg}</div>
      )}

      {showWalkIn && (
        <form onSubmit={handleWalkInCheckIn} className="rounded-lg border border-[#D4C5AF] bg-white p-5 space-y-4 text-xs">
          <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
            Check-In Kunjungan Langsung Tanpa Reservasi
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block font-semibold text-[#4A5045]">Pasien (Nomor Pasien)</label>
              <select
                value={walkPatientId}
                onChange={(e) => setWalkPatientId(e.target.value)}
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
                value={walkPracId}
                onChange={(e) => setWalkPracId(e.target.value)}
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
              >
                {practitioners
                  .filter((p) => p.branchIds.includes(branchId))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#4A5045]">Ruangan</label>
              <select
                value={walkRoomId}
                onChange={(e) => setWalkRoomId(e.target.value)}
                className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
              >
                {rooms
                  .filter((rm) => rm.branchId === branchId)
                  .map((rm) => (
                    <option key={rm.id} value={rm.id}>
                      {rm.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#4A5045]">Pilih Satu atau Lebih Layanan</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {services
                .filter((s) => s.activeBranchIds.includes(branchId))
                .map((s) => {
                  const selected = walkServices.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setWalkServices((prev) =>
                          selected
                            ? prev.length > 1
                              ? prev.filter((x) => x !== s.id)
                              : prev
                            : [...prev, s.id]
                        )
                      }
                      className={`rounded border px-3 py-1.5 font-medium ${
                        selected
                          ? 'border-[#3D4F35] bg-[#3D4F35] text-white'
                          : 'border-[#D4C5AF] bg-[#FBF8F3]'
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowWalkIn(false)}
              className="rounded border border-[#D4C5AF] px-4 py-2"
            >
              Batal
            </button>
            <button type="submit" className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white">
              Terbitkan Kunjungan & Nomor Antrean
            </button>
          </div>
        </form>
      )}

      {/* Ready Reservations for Check-In */}
      {readyReservations.length > 0 && (
        <div className="rounded-lg border border-[#E4DDD0] bg-white p-4">
          <div className="text-xs font-semibold text-[#734F2C]">
            Reservasi Siap Check-In ({readyReservations.length})
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {readyReservations.map((r) => {
              const pat = patients.find((p) => p.id === r.patientId);
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded border border-[#EFE8DC] bg-[#FBF8F3] p-3 text-xs"
                >
                  <div>
                    <div className="font-semibold text-[#1F241D]">{pat?.fullName}</div>
                    <div className="font-mono text-[11px] text-[#5E645A]">
                      {r.reservationCode} · {r.startTime} WIB
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCheckInReservation(r.id)}
                    className="inline-flex items-center gap-1 rounded bg-[#3D4F35] px-2.5 py-1.5 font-semibold text-white shrink-0"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Check-In
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Queue List */}
      <div className="rounded-lg border border-[#E4DDD0] bg-white overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#E4DDD0] bg-[#FBF8F3] text-[#5E645A]">
              <th className="px-4 py-3 font-semibold">No. Antrean</th>
              <th className="px-4 py-3 font-semibold">Pasien & Layanan</th>
              <th className="px-4 py-3 font-semibold">Ruang Tujuan</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Alur Layanan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFE8DC]">
            {branchQueue.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#5E645A]">
                  Belum ada antrean pada cabang ini.
                </td>
              </tr>
            ) : (
              branchQueue.map((q) => {
                const pat = patients.find((p) => p.id === q.patientId);
                return (
                  <tr key={q.id}>
                    <td className="px-4 py-3">
                      <div className="font-mono text-base font-bold tabular-nums text-[#2F3E29]">
                        {q.queueNumber}
                      </div>
                      {q.calledAt && (
                        <div className="font-mono text-[11px] text-[#5E645A]">
                          Dipanggil {formatJam(q.calledAt)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#1F241D]">
                        {pat?.fullName} ({pat?.patientNumber})
                      </div>
                      <div className="text-[#5E645A]">{q.serviceSummary}</div>
                    </td>
                    <td className="px-4 py-3 text-[#4A5045]">{q.roomName}</td>
                    <td className="px-4 py-3 font-semibold text-[#3D4F35]">
                      {QUEUE_STATUS_LABELS[q.status]}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1.5">
                        {q.status === 'menunggu' && (
                          <button
                            type="button"
                            onClick={() => handleQueueStatus(q.id, 'dipanggil')}
                            className="inline-flex items-center gap-1 rounded border border-[#3D4F35] px-2.5 py-1 font-semibold text-[#3D4F35]"
                          >
                            <Megaphone className="h-3 w-3" />
                            Panggil
                          </button>
                        )}
                        {(q.status === 'menunggu' || q.status === 'dipanggil') && (
                          <button
                            type="button"
                            onClick={() => handleQueueStatus(q.id, 'sedang_dilayani')}
                            className="rounded bg-[#3D4F35] px-2.5 py-1 font-semibold text-white"
                          >
                            Mulai Layani
                          </button>
                        )}
                        {q.status === 'sedang_dilayani' && (
                          <button
                            type="button"
                            onClick={() => handleQueueStatus(q.id, 'selesai')}
                            className="rounded border border-[#3D4F35] px-2.5 py-1 font-semibold text-[#3D4F35]"
                          >
                            Selesai Antrean
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenClinical(q.visitId)}
                          className="inline-flex items-center gap-1 rounded border border-[#D4C5AF] px-2.5 py-1 font-medium text-[#1F241D]"
                        >
                          <Stethoscope className="h-3 w-3" />
                          Asesmen
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenCashier(q.visitId)}
                          className="inline-flex items-center gap-1 rounded border border-[#D4C5AF] px-2.5 py-1 font-medium text-[#734F2C]"
                        >
                          Kasir
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
