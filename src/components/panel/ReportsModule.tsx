import React, { useEffect, useState } from 'react';
import { Download, Printer, ShieldCheck } from 'lucide-react';
import { ApiError, apiRequest, type DemoAccountSummary } from '../../lib/api';
import type { AuditLog, Branch, Practitioner, ServiceItem } from '../../types/clinic';
import { formatRupiah, formatTanggalJam, todayJakartaISO } from '../../utils/format';

interface ReportsModuleProps {
  currentAccount: DemoAccountSummary;
  branches: Branch[];
  practitioners: Practitioner[];
  services: ServiceItem[];
  retentionYears: number;
}

interface ReportData {
  operasional: {
    totalVisits: number;
    totalReservations: number;
    checkedInCount: number;
    cancelledCount: number;
    noShowCount: number;
    followUpsScheduled: number;
    serviceUsage: Array<{ name: string; count: number }>;
  };
  keuangan: {
    totalInvoiceValue: number;
    totalReceived: number;
    totalRefunded: number;
    totalPending: number;
    totalExpenses: number;
  };
  inventaris: {
    batches: Array<{ id: string; batchNumber: string; quantityAvailable: number; expiryDate?: string }>;
    minStockAlerts: Array<{ id: string; name: string; minStock: number }>;
    expiringBatches: Array<{ id: string; batchNumber: string; expiryDate?: string }>;
    mutations: Array<{ id: string }>;
  };
}

export const ReportsModule: React.FC<ReportsModuleProps> = ({
  currentAccount,
  branches,
  practitioners,
  services,
  retentionYears,
}) => {
  const [branchId, setBranchId] = useState('');
  const [practitionerId, setPractitionerId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(todayJakartaISO());

  const [report, setReport] = useState<ReportData | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadReports = async () => {
    setErrorMsg(null);
    const params = new URLSearchParams();
    if (branchId) params.set('branchId', branchId);
    if (practitionerId) params.set('practitionerId', practitionerId);
    if (serviceId) params.set('serviceId', serviceId);
    if (paymentMethod) params.set('paymentMethod', paymentMethod);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);

    try {
      const res = await apiRequest<ReportData>(`/api/reports?${params.toString()}`);
      setReport(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat laporan.');
    }

    if (currentAccount.roles.includes('pemilik')) {
      try {
        const aud = await apiRequest<{ auditLogs: AuditLog[] }>('/api/audit-logs');
        setAuditLogs(aud.auditLogs);
      } catch {
        setAuditLogs([]);
      }
    }
  };

  useEffect(() => {
    loadReports();
  }, [branchId, practitionerId, serviceId, paymentMethod, fromDate, toDate, currentAccount.id]);

  const handleExportCsv = async (reportType: 'operasional' | 'keuangan' | 'inventaris' | 'operasional_pasien') => {
    setExportStatus(null);
    try {
      const res = await apiRequest<{ csv: string; fileName: string }>('/api/reports/export-csv', {
        method: 'POST',
        body: JSON.stringify({
          reportType,
          branchId: branchId || undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
        }),
      });
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.fileName;
      a.click();
      URL.revokeObjectURL(url);
      setExportStatus(`CSV ${res.fileName} berhasil diekspor dan dicatat dalam log audit.`);
      loadReports();
    } catch (err) {
      if (err instanceof ApiError) {
        setExportStatus(`Ditolak server (HTTP ${err.status}): ${err.message}`);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col justify-between gap-3 border-b border-[#E4DDD0] pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-editorial text-2xl font-semibold text-[#1F241D]">
            Laporan Operasional, Keuangan, Inventaris & Audit
          </h1>
          <p className="text-xs text-[#5E645A]">
            Saring berdasarkan periode, cabang, praktisi, layanan, atau metode pembayaran.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded border border-[#D4C5AF] bg-white px-3 py-2 text-xs font-semibold"
          >
            <Printer className="h-3.5 w-3.5" />
            Cetak Ringkasan
          </button>
          <button
            type="button"
            onClick={() => handleExportCsv('keuangan')}
            className="inline-flex items-center gap-1.5 rounded bg-[#3D4F35] px-3 py-2 text-xs font-semibold text-white"
          >
            <Download className="h-3.5 w-3.5" />
            Ekspor CSV Keuangan
          </button>
          <button
            type="button"
            onClick={() => handleExportCsv('inventaris')}
            className="inline-flex items-center gap-1.5 rounded border border-[#3D4F35] bg-white px-3 py-2 text-xs font-semibold text-[#3D4F35]"
          >
            <Download className="h-3.5 w-3.5" />
            Ekspor CSV Inventaris
          </button>
          <button
            type="button"
            onClick={() => handleExportCsv('operasional_pasien')}
            className="inline-flex items-center gap-1.5 rounded border border-[#734F2C] bg-[#F5EFE6] px-3 py-2 text-xs font-semibold text-[#5C3D21]"
          >
            <Download className="h-3.5 w-3.5" />
            Ekspor Data Pasien (Berizin)
          </button>
        </div>
      </div>

      {exportStatus && (
        <div className="rounded border border-[#D4C5AF] bg-white p-3 text-xs font-medium text-[#1F241D]">
          {exportStatus}
        </div>
      )}
      {errorMsg && <div className="rounded bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">{errorMsg}</div>}

      {/* Filters */}
      <div className="no-print grid grid-cols-2 gap-3 rounded-lg border border-[#E4DDD0] bg-white p-4 text-xs sm:grid-cols-6">
        <div>
          <label className="block font-semibold text-[#4A5045]">Dari Tanggal</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="mt-1 w-full rounded border border-[#D4C5AF] px-2 py-1.5 font-mono"
          />
        </div>
        <div>
          <label className="block font-semibold text-[#4A5045]">Sampai Tanggal</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="mt-1 w-full rounded border border-[#D4C5AF] px-2 py-1.5 font-mono"
          />
        </div>
        <div>
          <label className="block font-semibold text-[#4A5045]">Cabang</label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1 w-full rounded border border-[#D4C5AF] px-2 py-1.5"
          >
            <option value="">Semua Cabang</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-[#4A5045]">Praktisi</label>
          <select
            value={practitionerId}
            onChange={(e) => setPractitionerId(e.target.value)}
            className="mt-1 w-full rounded border border-[#D4C5AF] px-2 py-1.5"
          >
            <option value="">Semua Praktisi</option>
            {practitioners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-[#4A5045]">Layanan</label>
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="mt-1 w-full rounded border border-[#D4C5AF] px-2 py-1.5"
          >
            <option value="">Semua Layanan</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-[#4A5045]">Metode Bayar</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="mt-1 w-full rounded border border-[#D4C5AF] px-2 py-1.5"
          >
            <option value="">Semua Metode</option>
            <option value="tunai">Tunai</option>
            <option value="transfer">Transfer</option>
            <option value="qris_manual">QRIS Manual</option>
          </select>
        </div>
      </div>

      {report && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 text-xs">
          {/* Operasional */}
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-3">
            <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">Laporan Operasional</h2>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#5E645A]">Total Kunjungan</span>
                <span className="font-mono font-bold tabular-nums">{report.operasional.totalVisits}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5E645A]">Reservasi Check-In</span>
                <span className="font-mono font-bold tabular-nums">
                  {report.operasional.checkedInCount} / {report.operasional.totalReservations}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5E645A]">Batal / Tidak Hadir</span>
                <span className="font-mono tabular-nums">
                  {report.operasional.cancelledCount} / {report.operasional.noShowCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5E645A]">Jadwal Kontrol Terjadwal</span>
                <span className="font-mono font-bold tabular-nums">{report.operasional.followUpsScheduled}</span>
              </div>
            </div>
            <div className="border-t border-[#EFE8DC] pt-3">
              <div className="font-semibold text-[#4A5045] mb-1.5">Penggunaan Layanan</div>
              {report.operasional.serviceUsage.map((su) => (
                <div key={su.name} className="flex justify-between py-0.5">
                  <span className="truncate pr-2">{su.name}</span>
                  <span className="font-mono tabular-nums font-semibold">{su.count}×</span>
                </div>
              ))}
            </div>
          </div>

          {/* Keuangan */}
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-3">
            <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">Laporan Keuangan</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-[#5E645A]">Nilai Invoice Diterbitkan</span>
                <span className="font-mono font-bold tabular-nums">
                  {formatRupiah(report.keuangan.totalInvoiceValue)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5E645A]">Uang Diterima</span>
                <span className="font-mono font-bold tabular-nums text-[#3D4F35]">
                  {formatRupiah(report.keuangan.totalReceived)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5E645A]">Pengembalian Dana (Refund)</span>
                <span className="font-mono tabular-nums text-[#991B1B]">
                  {formatRupiah(report.keuangan.totalRefunded)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5E645A]">Tagihan Tertunda</span>
                <span className="font-mono font-bold tabular-nums text-[#734F2C]">
                  {formatRupiah(report.keuangan.totalPending)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5E645A]">Pengeluaran Kas</span>
                <span className="font-mono tabular-nums">{formatRupiah(report.keuangan.totalExpenses)}</span>
              </div>
            </div>
          </div>

          {/* Inventaris & Retensi */}
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-3">
            <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">Ringkasan Inventaris</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-[#5E645A]">Total Batch Tercatat</span>
                <span className="font-mono font-bold tabular-nums">{report.inventaris.batches.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5E645A]">Produk Di Bawah Stok Min</span>
                <span className="font-mono font-bold tabular-nums text-[#92400E]">
                  {report.inventaris.minStockAlerts.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5E645A]">Batch ED / Mendekati ED</span>
                <span className="font-mono font-bold tabular-nums text-[#991B1B]">
                  {report.inventaris.expiringBatches.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5E645A]">Total Mutasi Stok</span>
                <span className="font-mono font-bold tabular-nums">{report.inventaris.mutations.length}</span>
              </div>
            </div>
            <div className="border-t border-[#EFE8DC] pt-3 text-[#4A5045]">
              <div className="flex items-center gap-1.5 font-semibold text-[#2F3E29]">
                <ShieldCheck className="h-4 w-4" />
                Pencadangan & Retensi Data
              </div>
              <p className="mt-1 leading-relaxed">
                Kebijakan retensi aktif: <span className="font-mono font-semibold">{retentionYears} tahun</span>.
                Cadangan logis harian menggunakan <code>pg_dump</code> & PITR Supabase terdokumentasi di README.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log */}
      {auditLogs.length > 0 && (
        <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 text-xs">
          <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
            Catatan Audit Aktivitas Penting ({auditLogs.length})
          </h2>
          <div className="mt-3 max-h-[340px] overflow-y-auto divide-y divide-[#EFE8DC]">
            {auditLogs.map((a) => (
              <div key={a.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-semibold text-[#3D4F35]">{a.action}</span> ·{' '}
                  <span className="font-semibold text-[#1F241D]">{a.actorName}</span>
                  <div className="text-[#5E645A]">{a.detail}</div>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-[#5E645A]">
                  {formatTanggalJam(a.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
