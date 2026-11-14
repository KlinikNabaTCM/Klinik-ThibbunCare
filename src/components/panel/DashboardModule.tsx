import React from 'react';
import { ArrowRight, Calendar, ClipboardList, Package, Receipt, ShieldCheck, Users } from 'lucide-react';
import type { DemoAccountSummary } from '../../lib/api';
import type {
  ClinicalRecord,
  Invoice,
  Patient,
  Product,
  ProductBatch,
  QueueItem,
  Reservation,
  Visit,
} from '../../types/clinic';
import {
  QUEUE_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  formatRupiah,
  formatTanggal,
  todayJakartaISO,
} from '../../utils/format';

export type PanelTab =
  | 'dashboard'
  | 'admin'
  | 'pasien'
  | 'jadwal'
  | 'antrean'
  | 'klinis'
  | 'kasir'
  | 'inventaris'
  | 'laporan'
  | 'pengaturan';

interface DashboardModuleProps {
  currentAccount: DemoAccountSummary;
  patients: Patient[];
  reservations: Reservation[];
  queue: QueueItem[];
  visits: Visit[];
  invoices: Invoice[];
  products: Product[];
  batches: ProductBatch[];
  clinicalRecords: Record<string, ClinicalRecord>;
  onNavigate: (tab: PanelTab, context?: { visitId?: string; patientId?: string }) => void;
}

export const DashboardModule: React.FC<DashboardModuleProps> = ({
  currentAccount,
  patients,
  reservations,
  queue,
  visits,
  invoices,
  products,
  batches,
  onNavigate,
}) => {
  const today = todayJakartaISO();
  const roles = currentAccount.roles;

  const todayReservations = reservations.filter((r) => r.date === today);
  const activeQueue = queue.filter((q) => q.status !== 'selesai');
  const pendingInvoices = invoices.filter(
    (i) => i.status === 'belum_bayar' || i.status === 'dibayar_sebagian'
  );
  const totalReceivedToday = invoices.reduce((sum, inv) => {
    const todayPay = inv.payments
      .filter((p) => !p.isRefund && p.receivedAt.startsWith(today) && p.qrisStatus !== 'menunggu_konfirmasi')
      .reduce((s, p) => s + p.amount, 0);
    return sum + todayPay;
  }, 0);

  const lowStockProducts = products.filter((p) => {
    const avail = batches
      .filter((b) => b.productId === p.id && (!b.expiryDate || b.expiryDate >= today))
      .reduce((s, b) => s + b.quantityAvailable, 0);
    return avail < p.minStock;
  });

  const expiringBatches = batches.filter((b) => {
    if (!b.expiryDate) return false;
    const diff =
      (new Date(`${b.expiryDate}T00:00:00+07:00`).getTime() -
        new Date(`${today}T00:00:00+07:00`).getTime()) /
      (1000 * 3600 * 24);
    return diff <= 45;
  });

  const myAssignedVisits = visits.filter((v) =>
    currentAccount.linkedPractitionerId
      ? v.practitionerId === currentAccount.linkedPractitionerId && v.status !== 'selesai_tuntas'
      : v.status !== 'selesai_tuntas'
  );

  const primaryRoleLabel = roles.join(', ');

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 border-b border-[#E4DDD0] pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold text-[#734F2C]">
            Ringkasan Peran ({primaryRoleLabel}) · {formatTanggal(today)}
          </p>
          <h1 className="mt-1 font-editorial text-2xl font-semibold text-[#1F241D]">
            Selamat Bertugas, {currentAccount.name.split('(')[0].trim()}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {(roles.includes('admin') || (roles.includes('pemilik') && currentAccount.permissions.canManageSettings)) && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#734F2C] bg-[#F5EFE6] px-3.5 py-2 text-xs font-semibold text-[#5C3D21] hover:bg-[#EAE0D0]"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Pusat Admin
            </button>
          )}
          {(roles.includes('resepsionis') || roles.includes('pemilik') || roles.includes('admin')) && (
            <button
              type="button"
              onClick={() => onNavigate('pasien')}
              className="rounded-md bg-[#3D4F35] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#2F3E29]"
            >
              + Daftarkan Pasien / Check-In
            </button>
          )}
          {(roles.includes('kasir') || roles.includes('pemilik') || roles.includes('admin')) && (
            <button
              type="button"
              onClick={() => onNavigate('kasir')}
              className="rounded-md border border-[#3D4F35] bg-white px-3.5 py-2 text-xs font-semibold text-[#3D4F35] hover:bg-[#F4F6F1]"
            >
              Buka Kasir & Pembayaran
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip tailored to operational metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[#E4DDD0] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#5E645A]">
            <span>Jadwal Hari Ini</span>
            <Calendar className="h-4 w-4 text-[#3D4F35]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#1F241D]">
            {todayReservations.length}
          </div>
          <div className="mt-1 text-xs text-[#5E645A]">
            {activeQueue.length} pasien dalam antrean aktif
          </div>
        </div>

        <div className="rounded-lg border border-[#E4DDD0] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#5E645A]">
            <span>Total Pasien Terdaftar</span>
            <Users className="h-4 w-4 text-[#3D4F35]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#1F241D]">
            {patients.length}
          </div>
          <div className="mt-1 text-xs text-[#5E645A]">
            {visits.length} total kunjungan tercatat
          </div>
        </div>

        <div className="rounded-lg border border-[#E4DDD0] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#5E645A]">
            <span>Penerimaan Hari Ini</span>
            <Receipt className="h-4 w-4 text-[#3D4F35]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#2F3E29]">
            {formatRupiah(totalReceivedToday)}
          </div>
          <div className="mt-1 text-xs text-[#5E645A]">
            {pendingInvoices.length} tagihan belum lunas
          </div>
        </div>

        <div className="rounded-lg border border-[#E4DDD0] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-[#5E645A]">
            <span>Peringatan Inventaris</span>
            <Package className="h-4 w-4 text-[#734F2C]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#734F2C]">
            {lowStockProducts.length + expiringBatches.length}
          </div>
          <div className="mt-1 text-xs text-[#5E645A]">
            {lowStockProducts.length} stok min · {expiringBatches.length} batch ED/dekat ED
          </div>
        </div>
      </div>

      {/* Role-Focused Panels */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Resepsionis, Admin & Pemilik: Antrean & Reservasi Hari Ini */}
        {(roles.includes('resepsionis') || roles.includes('pemilik') || roles.includes('asisten') || roles.includes('admin')) && (
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
                Jadwal & Antrean Hari Ini
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('antrean')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#3D4F35] hover:underline"
              >
                Kelola Antrean <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-4 divide-y divide-[#EFE8DC] text-xs">
              {todayReservations.length === 0 ? (
                <p className="py-4 text-[#5E645A]">Tidak ada jadwal reservasi hari ini.</p>
              ) : (
                todayReservations.map((r) => {
                  const pat = patients.find((p) => p.id === r.patientId);
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <div className="font-semibold text-[#1F241D]">
                          {pat?.fullName || r.patientId} ({pat?.patientNumber})
                        </div>
                        <div className="font-mono text-[#5E645A] tabular-nums">
                          {r.reservationCode} · {r.startTime}–{r.endTime} WIB
                        </div>
                      </div>
                      <span className="font-semibold text-[#3D4F35]">
                        {RESERVATION_STATUS_LABELS[r.status]}
                      </span>
                    </div>
                  );
                })
              )}
              {activeQueue.map((q) => {
                const pat = patients.find((p) => p.id === q.patientId);
                return (
                  <div key={q.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <div className="font-mono font-bold text-[#2F3E29]">
                        Antrean {q.queueNumber} · {pat?.fullName}
                      </div>
                      <div className="text-[#5E645A]">{q.roomName}</div>
                    </div>
                    <span className="font-semibold text-[#734F2C]">
                      {QUEUE_STATUS_LABELS[q.status]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Praktisi / Asisten: Pasien Ditugaskan & Catatan Draf */}
        {(roles.includes('praktisi') || roles.includes('asisten') || currentAccount.permissions.canAccessClinicalNotes) && (
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
                Kunjungan Berjalan & Catatan Draf
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('klinis')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#3D4F35] hover:underline"
              >
                Ruang Kerja Praktisi <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-4 divide-y divide-[#EFE8DC] text-xs">
              {myAssignedVisits.length === 0 ? (
                <p className="py-4 text-[#5E645A]">Semua kunjungan tugas Anda sudah selesai.</p>
              ) : (
                myAssignedVisits.map((v) => {
                  const pat = patients.find((p) => p.id === v.patientId);
                  return (
                    <div key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <div className="font-semibold text-[#1F241D]">
                          {pat?.fullName} · <span className="font-mono">{v.visitNumber}</span>
                        </div>
                        <div className="text-[#5E645A]">
                          {formatTanggal(v.visitDate)}, {v.visitTime} WIB
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('klinis', { visitId: v.id })}
                        className="inline-flex items-center gap-1 rounded border border-[#3D4F35] px-2.5 py-1 font-semibold text-[#3D4F35] hover:bg-[#3D4F35] hover:text-white"
                      >
                        <ClipboardList className="h-3.5 w-3.5" />
                        Buka Asesmen
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Kasir, Admin & Pemilik: Tagihan Tertunda */}
        {(roles.includes('kasir') || roles.includes('pemilik') || roles.includes('admin')) && (
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
                Tagihan Menunggu Pembayaran & Kunjungan Siap Bayar
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('kasir')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#3D4F35] hover:underline"
              >
                Buka Kasir <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-4 divide-y divide-[#EFE8DC] text-xs">
              {pendingInvoices.length === 0 ? (
                <p className="py-4 text-[#5E645A]">
                  Belum ada tagihan tertunda. Anda dapat membuat invoice baru dari kunjungan aktif di menu Kasir.
                </p>
              ) : (
                pendingInvoices.map((inv) => {
                  const pat = patients.find((p) => p.id === inv.patientId);
                  return (
                    <div key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <div className="font-mono font-semibold text-[#1F241D]">
                          {inv.invoiceNumber} · {pat?.fullName}
                        </div>
                        <div className="text-[#5E645A]">
                          Tagihan {formatRupiah(inv.totalAmount)} · Terbayar {formatRupiah(inv.paidAmount)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('kasir')}
                        className="rounded bg-[#3D4F35] px-2.5 py-1 font-semibold text-white"
                      >
                        Proses Bayar
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Inventaris, Admin & Pemilik: Peringatan Stok & Batch */}
        {(roles.includes('inventaris') || roles.includes('pemilik') || roles.includes('admin')) && (
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
                Peringatan Stok Minimum & Batch Kedaluwarsa
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('inventaris')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#3D4F35] hover:underline"
              >
                Kelola Inventaris <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              {lowStockProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded bg-[#FEF3C7]/60 px-3 py-2 text-[#92400E]">
                  <span className="font-semibold">Stok Menipis: {p.name}</span>
                  <span className="font-mono">Min: {p.minStock} {p.unit}</span>
                </div>
              ))}
              {expiringBatches.map((b) => {
                const prod = products.find((p) => p.id === b.productId);
                const isExpired = b.expiryDate && b.expiryDate < today;
                return (
                  <div
                    key={b.id}
                    className={`flex items-center justify-between rounded px-3 py-2 ${
                      isExpired ? 'bg-[#FEF2F2] text-[#991B1B]' : 'bg-[#F5EFE6] text-[#734F2C]'
                    }`}
                  >
                    <span className="font-semibold">
                      {isExpired ? 'KEDALUWARSA (Diblokir):' : 'Mendekati ED:'} {prod?.name} · Batch {b.batchNumber}
                    </span>
                    <span className="font-mono tabular-nums">
                      ED {formatTanggal(b.expiryDate)} · Sisa {b.quantityAvailable}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
