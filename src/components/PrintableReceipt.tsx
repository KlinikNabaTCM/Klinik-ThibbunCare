import React from 'react';
import { Printer, X } from 'lucide-react';
import type { Branch, ClinicSettings, Invoice, Patient } from '../types/clinic';
import { INVOICE_STATUS_LABELS, formatRupiah, formatTanggalJam } from '../utils/format';

interface PrintableReceiptProps {
  invoice: Invoice;
  patient?: Patient;
  branch?: Branch;
  settings: ClinicSettings;
  onClose: () => void;
}

export const PrintableReceipt: React.FC<PrintableReceiptProps> = ({
  invoice,
  patient,
  branch,
  settings,
  onClose,
}) => {
  const remaining = Math.max(0, invoice.totalAmount - (invoice.paidAmount - invoice.refundedAmount));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="print-sheet w-full max-w-2xl rounded-lg border border-[#DCCDB6] bg-white p-6 sm:p-8 text-[#1F241D]">
        <div className="no-print mb-6 flex items-center justify-between border-b border-[#EFE8DC] pb-4">
          <span className="text-xs font-semibold text-[#5E645A]">Pratinjau Kuitansi Resmi</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded bg-[#3D4F35] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2F3E29]"
            >
              <Printer className="h-3.5 w-3.5" />
              Cetak Kuitansi
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#D4C5AF] p-1.5 text-[#5E645A] hover:bg-[#F5EFE6]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Clinic Identity */}
        <div className="flex flex-col justify-between gap-4 border-b border-[#E4DDD0] pb-5 sm:flex-row sm:items-start">
          <div>
            <div className="font-editorial text-xl font-bold text-[#2F3E29]">{settings.clinicName}</div>
            <div className="mt-1 text-xs text-[#4A5045]">{branch?.name}</div>
            <div className="text-xs text-[#5E645A]">{branch?.address}</div>
            <div className="font-mono text-xs tabular-nums text-[#5E645A]">
              Telp: {branch?.phone} · WA: {branch?.whatsapp}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#734F2C]">Kuitansi Pembayaran</div>
            <div className="mt-1 font-mono text-base font-bold tabular-nums">{invoice.invoiceNumber}</div>
            <div className="text-xs text-[#5E645A]">
              Terbit: {formatTanggalJam(invoice.issuedAt)}
            </div>
            <div className="mt-1 text-xs font-semibold text-[#2F3E29]">
              Status: {INVOICE_STATUS_LABELS[invoice.status] || invoice.status}
            </div>
          </div>
        </div>

        {/* Patient identity (no clinical complaints/assessment) */}
        <div className="mt-4 grid grid-cols-1 gap-2 rounded bg-[#FBF8F3] p-3.5 text-xs sm:grid-cols-2">
          <div>
            <span className="text-[#5E645A]">Pasien:</span>{' '}
            <span className="font-semibold">{patient?.fullName || invoice.patientId}</span>
          </div>
          <div className="sm:text-right">
            <span className="text-[#5E645A]">No. Pasien:</span>{' '}
            <span className="font-mono font-semibold tabular-nums">{patient?.patientNumber || '-'}</span>
          </div>
        </div>

        {/* Line items */}
        <table className="mt-5 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#D4C5AF] text-left text-[#5E645A]">
              <th className="py-2 font-semibold">Deskripsi Layanan / Produk</th>
              <th className="py-2 text-right font-semibold">Jml</th>
              <th className="py-2 text-right font-semibold">Harga Satuan</th>
              <th className="py-2 text-right font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFE8DC]">
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-2.5">
                  <div className="font-medium text-[#1F241D]">{line.description}</div>
                  {line.batchNumber && (
                    <div className="font-mono text-[11px] text-[#5E645A]">Batch: {line.batchNumber}</div>
                  )}
                </td>
                <td className="py-2.5 text-right font-mono tabular-nums">{line.quantity}</td>
                <td className="py-2.5 text-right font-mono tabular-nums">{formatRupiah(line.unitPrice)}</td>
                <td className="py-2.5 text-right font-mono font-semibold tabular-nums">
                  {formatRupiah(line.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-4 border-t border-[#D4C5AF] pt-4 text-xs space-y-1.5">
          {invoice.discountAmount > 0 && (
            <div className="flex justify-between text-[#5E645A]">
              <span>Potongan ({invoice.discountReason || 'Diskon'})</span>
              <span className="font-mono tabular-nums">-{formatRupiah(invoice.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold text-[#1F241D]">
            <span>Total Tagihan</span>
            <span className="font-mono tabular-nums">{formatRupiah(invoice.totalAmount)}</span>
          </div>
          <div className="flex justify-between text-[#3D4F35]">
            <span>Total Diterima</span>
            <span className="font-mono font-semibold tabular-nums">{formatRupiah(invoice.paidAmount)}</span>
          </div>
          {invoice.refundedAmount > 0 && (
            <div className="flex justify-between text-[#991B1B]">
              <span>Pengembalian Dana</span>
              <span className="font-mono tabular-nums">-{formatRupiah(invoice.refundedAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-[#1F241D]">
            <span>Sisa Tagihan</span>
            <span className="font-mono tabular-nums">{formatRupiah(remaining)}</span>
          </div>
        </div>

        {/* Payments */}
        {invoice.payments.length > 0 && (
          <div className="mt-5 border-t border-[#EFE8DC] pt-4">
            <div className="text-xs font-semibold text-[#4A5045]">Rincian Transaksi Pembayaran</div>
            <div className="mt-2 space-y-1.5 text-xs">
              {invoice.payments.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[#4A5045]">
                  <span>
                    {p.isRefund ? 'Refund' : p.method.toUpperCase()}
                    {p.referenceNumber ? ` · Ref ${p.referenceNumber}` : ''}
                    {p.qrisStatus ? ` (${p.qrisStatus === 'terkonfirmasi' ? 'Terkonfirmasi' : 'Menunggu Konfirmasi'})` : ''}
                    {' · '}Diterima: {formatTanggalJam(p.receivedAt)}
                  </span>
                  <span className="font-mono font-semibold tabular-nums">{formatRupiah(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 border-t border-[#EFE8DC] pt-4 text-[11px] text-[#5E645A]">
          Kuitansi ini dicetak otomatis oleh sistem {settings.clinicName} dan tidak memuat informasi medis sensitif.
        </div>
      </div>
    </div>
  );
};
