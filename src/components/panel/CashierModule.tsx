import React, { useEffect, useState } from 'react';
import { Check, Plus, Printer, RotateCcw, Wallet } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import type {
  Branch,
  CashSession,
  ClinicSettings,
  Invoice,
  Patient,
  PaymentMethod,
  Product,
  ProductBatch,
  Visit,
} from '../../types/clinic';
import {
  INVOICE_STATUS_LABELS,
  formatRupiah,
  formatTanggal,
  formatTanggalJam,
  todayJakartaISO,
} from '../../utils/format';
import { PrintableReceipt } from '../PrintableReceipt';

interface CashierModuleProps {
  settings: ClinicSettings;
  branches: Branch[];
  patients: Patient[];
  visits: Visit[];
  invoices: Invoice[];
  cashSessions: CashSession[];
  products: Product[];
  batches: ProductBatch[];
  initialVisitId?: string;
  onRefresh: () => Promise<void>;
}

export const CashierModule: React.FC<CashierModuleProps> = ({
  settings,
  branches,
  patients,
  visits,
  invoices,
  cashSessions,
  products,
  batches,
  initialVisitId,
  onRefresh,
}) => {
  const [selectedVisitId, setSelectedVisitId] = useState(initialVisitId || visits[0]?.id || '');
  const [extraProdId, setExtraProdId] = useState('');
  const [extraBatchId, setExtraBatchId] = useState('');
  const [extraQty, setExtraQty] = useState(1);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountReason, setDiscountReason] = useState('');

  // Edit existing unpaid invoice state
  const [itemProdId, setItemProdId] = useState('');
  const [itemBatchId, setItemBatchId] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [itemDiscount, setItemDiscount] = useState(0);
  const [itemDiscountReason, setItemDiscountReason] = useState('');

  // Payment state
  const [activeInvoiceId, setActiveInvoiceId] = useState<string>(invoices[0]?.id || '');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('tunai');
  const [payRef, setPayRef] = useState('');
  const [receivedDate, setReceivedDate] = useState(todayJakartaISO());
  const [payIdemKey, setPayIdemKey] = useState(() => `pay-${Date.now()}`);

  // Refund & Void state
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReason, setRefundReason] = useState('');
  const [voidReason, setVoidReason] = useState('');

  // Cash close state
  const [cashBranchId, setCashBranchId] = useState(branches[0]?.id || 'br-jkt');
  const [openingBalance, setOpeningBalance] = useState(500000);
  const [expenses, setExpenses] = useState(0);
  const [actualCashCount, setActualCashCount] = useState(500000);
  const [closeNotes, setCloseNotes] = useState('');

  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const visitWithoutInvoice = visits.filter(
    (v) => !invoices.some((inv) => inv.visitId === v.id && inv.status !== 'dibatalkan')
  );

  useEffect(() => {
    if (branches.length > 0 && !branches.some((b) => b.id === cashBranchId)) {
      setCashBranchId(branches[0].id);
    }
  }, [branches]);

  useEffect(() => {
    const candidates = visitWithoutInvoice.length > 0 ? visitWithoutInvoice : visits;
    if (initialVisitId && candidates.some((v) => v.id === initialVisitId)) {
      setSelectedVisitId(initialVisitId);
    } else if (candidates.length > 0 && !candidates.some((v) => v.id === selectedVisitId)) {
      setSelectedVisitId(candidates[0].id);
    }
  }, [initialVisitId, visits, invoices]);

  useEffect(() => {
    if (initialVisitId) {
      const byVisit = invoices.find((i) => i.visitId === initialVisitId);
      if (byVisit) {
        setActiveInvoiceId(byVisit.id);
        setPayAmount(Math.max(0, byVisit.totalAmount - (byVisit.paidAmount - byVisit.refundedAmount)));
      }
    }
  }, [initialVisitId]);

  useEffect(() => {
    if (invoices.length === 0) {
      setActiveInvoiceId('');
      setPayAmount(0);
      return;
    }
    const match =
      invoices.find((i) => i.id === activeInvoiceId) ||
      (initialVisitId ? invoices.find((i) => i.visitId === initialVisitId) : undefined) ||
      invoices[0];
    if (match) {
      setActiveInvoiceId(match.id);
      const rem = Math.max(0, match.totalAmount - (match.paidAmount - match.refundedAmount));
      setPayAmount(rem);
    }
  }, [invoices]);

  const selectedInvoice = invoices.find((i) => i.id === activeInvoiceId) || invoices[0];
  const openSession = cashSessions.find((s) => s.branchId === cashBranchId && s.status === 'terbuka');

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNotice(null);
    try {
      const extraProductLines =
        extraProdId && extraBatchId ? [{ productId: extraProdId, batchId: extraBatchId, quantity: extraQty }] : [];
      const res = await apiRequest<{ invoice: Invoice }>('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          visitId: selectedVisitId,
          extraProductLines,
          discountAmount,
          discountReason,
        }),
      });
      setActiveInvoiceId(res.invoice.id);
      setPayAmount(res.invoice.totalAmount);
      setPayIdemKey(`pay-${Date.now()}`);
      setNotice(`Invoice ${res.invoice.invoiceNumber} berhasil diterbitkan.`);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menerbitkan invoice.');
    }
  };

  const handleUpdateUnpaidInvoiceItems = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    setErrorMsg(null);
    setNotice(null);
    try {
      const extraProductLines =
        itemProdId && itemBatchId ? [{ productId: itemProdId, batchId: itemBatchId, quantity: itemQty }] : [];
      const res = await apiRequest<{ invoice: Invoice }>(`/api/invoices/${selectedInvoice.id}/items`, {
        method: 'PATCH',
        body: JSON.stringify({
          extraProductLines,
          discountAmount: itemDiscount > 0 ? itemDiscount : undefined,
          discountReason: itemDiscount > 0 ? itemDiscountReason : undefined,
        }),
      });
      setItemProdId('');
      setItemBatchId('');
      setItemQty(1);
      setItemDiscount(0);
      setItemDiscountReason('');
      setPayAmount(Math.max(0, res.invoice.totalAmount - (res.invoice.paidAmount - res.invoice.refundedAmount)));
      setNotice(`Tagihan ${res.invoice.invoiceNumber} diperbarui menjadi ${formatRupiah(res.invoice.totalAmount)}.`);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui item invoice.');
    }
  };

  const submitPayment = async (reuseKey: boolean) => {
    if (!selectedInvoice) return;
    setErrorMsg(null);
    setNotice(null);
    const key = reuseKey ? payIdemKey : `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (!reuseKey) setPayIdemKey(key);

    try {
      const res = await apiRequest<{ invoice: Invoice; idempotentReplay?: boolean; message?: string }>(
        `/api/invoices/${selectedInvoice.id}/payments`,
        {
          method: 'POST',
          body: JSON.stringify({
            amount: payAmount,
            method: payMethod,
            referenceNumber: payRef,
            receivedAt: `${receivedDate}T12:00:00+07:00`,
            idempotencyKey: key,
          }),
        }
      );
      setNotice(
        res.idempotentReplay
          ? res.message || 'Pengiriman ulang diblokir: hanya 1 pembayaran dicatat.'
          : `Pembayaran ${formatRupiah(payAmount)} tercatat pada ${res.invoice.invoiceNumber}.`
      );
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mencatat pembayaran.');
    }
  };

  const handleConfirmQris = async (invoiceId: string, paymentId: string) => {
    setErrorMsg(null);
    try {
      await apiRequest(`/api/invoices/${invoiceId}/confirm-qris`, {
        method: 'POST',
        body: JSON.stringify({ paymentId }),
      });
      setNotice('Pembayaran QRIS manual berhasil dikonfirmasi.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal konfirmasi QRIS.');
    }
  };

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    setErrorMsg(null);
    try {
      await apiRequest(`/api/invoices/${selectedInvoice.id}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          amount: refundAmount,
          reason: refundReason,
          method: 'tunai',
        }),
      });
      setRefundAmount(0);
      setRefundReason('');
      setNotice('Pengembalian dana berhasil dicatat dan diaudit.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mencatat refund.');
    }
  };

  const handleVoidInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    setErrorMsg(null);
    try {
      await apiRequest(`/api/invoices/${selectedInvoice.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason }),
      });
      setVoidReason('');
      setNotice(`Invoice ${selectedInvoice.invoiceNumber} telah dibatalkan.`);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membatalkan invoice.');
    }
  };

  const handleOpenCash = async () => {
    setErrorMsg(null);
    try {
      await apiRequest('/api/cash-sessions/open', {
        method: 'POST',
        body: JSON.stringify({ branchId: cashBranchId, openingBalance }),
      });
      setNotice('Sesi kas baru dibuka.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuka sesi kas.');
    }
  };

  const handleCloseCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openSession) return;
    setErrorMsg(null);
    try {
      await apiRequest(`/api/cash-sessions/${openSession.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ expenses, actualCashCount, notes: closeNotes }),
      });
      setNotice('Penutupan kas harian berhasil disimpan.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menutup kas.');
    }
  };

  const selectedVisitObj = visits.find((v) => v.id === selectedVisitId);
  const availBatches = batches.filter(
    (b) => b.productId === extraProdId && (!selectedVisitObj || b.branchId === selectedVisitObj.branchId)
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4DDD0] pb-4">
        <h1 className="font-editorial text-2xl font-semibold text-[#1F241D]">
          Kasir, Pembayaran & Penutupan Kas
        </h1>
        <p className="text-xs text-[#5E645A]">
          Snapshot tarif saat transaksi, multi-pembayaran, idempotensi kirim ulang, kuitansi bebas info medis, dan rekap kas harian.
        </p>
      </div>

      {errorMsg && (
        <div className="rounded bg-[#FEF2F2] p-3 text-xs font-medium text-[#991B1B]">{errorMsg}</div>
      )}
      {notice && (
        <div className="rounded bg-[#F4F6F1] p-3 text-xs font-medium text-[#243020]">{notice}</div>
      )}

      {/* Create New Invoice */}
      <form onSubmit={handleCreateInvoice} className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-4 text-xs">
        <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
          Terbitkan Invoice Baru dari Kunjungan
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="block font-semibold text-[#4A5045]">Pilih Kunjungan</label>
            <select
              value={selectedVisitId}
              onChange={(e) => setSelectedVisitId(e.target.value)}
              className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
            >
              {(visitWithoutInvoice.length > 0 ? visitWithoutInvoice : visits).map((v) => {
                const p = patients.find((pt) => pt.id === v.patientId);
                return (
                  <option key={v.id} value={v.id}>
                    {v.visitNumber} · {p?.fullName} ({formatTanggal(v.visitDate)})
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-[#4A5045]">Tambah Produk Herbal (Opsional)</label>
            <select
              value={extraProdId}
              onChange={(e) => {
                setExtraProdId(e.target.value);
                setExtraBatchId('');
              }}
              className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
            >
              <option value="">-- Tanpa produk --</option>
              {products
                .filter((p) => p.sellPrice > 0)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatRupiah(p.sellPrice)})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-[#4A5045]">Batch & Jumlah</label>
            <div className="mt-1 flex gap-1.5">
              <select
                value={extraBatchId}
                onChange={(e) => setExtraBatchId(e.target.value)}
                className="w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2 py-2 font-mono"
              >
                <option value="">Batch</option>
                {availBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batchNumber} ({b.quantityAvailable})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={extraQty}
                onChange={(e) => setExtraQty(Number(e.target.value))}
                className="w-16 rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2 py-2 font-mono"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 items-end">
          <div>
            <label className="block font-semibold text-[#4A5045]">Diskon / Potongan (Rp)</label>
            <input
              type="number"
              min={0}
              value={discountAmount}
              onChange={(e) => setDiscountAmount(Number(e.target.value))}
              className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-[#4A5045]">Alasan Potongan</label>
            <input
              type="text"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="Opsional"
              className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white hover:bg-[#2F3E29]"
          >
            <Plus className="h-4 w-4" />
            Buat Invoice
          </button>
        </div>
      </form>

      {/* Invoices List + Payment Desk */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-lg border border-[#E4DDD0] bg-white lg:col-span-5">
          <div className="border-b border-[#EFE8DC] px-4 py-3 text-xs font-semibold text-[#4A5045]">
            Daftar Invoice ({invoices.length})
          </div>
          <div className="divide-y divide-[#EFE8DC] max-h-[480px] overflow-y-auto">
            {invoices.map((inv) => {
              const pat = patients.find((p) => p.id === inv.patientId);
              const active = selectedInvoice?.id === inv.id;
              return (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => {
                    setActiveInvoiceId(inv.id);
                    const rem = Math.max(0, inv.totalAmount - (inv.paidAmount - inv.refundedAmount));
                    setPayAmount(rem);
                    setPayIdemKey(`pay-${Date.now()}`);
                  }}
                  className={`w-full px-4 py-3 text-left text-xs ${
                    active ? 'bg-[#F4F6F1]' : 'hover:bg-[#FBF8F3]'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono font-bold tabular-nums">
                    <span>{inv.invoiceNumber}</span>
                    <span>{formatRupiah(inv.totalAmount)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[#5E645A]">
                    <span>{pat?.fullName}</span>
                    <span className="font-semibold text-[#3D4F35]">
                      {INVOICE_STATUS_LABELS[inv.status]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          {selectedInvoice && (
            <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-4 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EFE8DC] pb-3">
                <div>
                  <div className="font-mono text-sm font-bold text-[#2F3E29]">
                    {selectedInvoice.invoiceNumber} · {INVOICE_STATUS_LABELS[selectedInvoice.status]}
                  </div>
                  <div className="text-[#5E645A]">
                    Terbit: {formatTanggalJam(selectedInvoice.issuedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPrintInvoice(selectedInvoice)}
                  className="inline-flex items-center gap-1.5 rounded border border-[#3D4F35] px-3 py-1.5 font-semibold text-[#3D4F35]"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Cetak Kuitansi
                </button>
              </div>

              <div className="space-y-1.5">
                {selectedInvoice.lines.map((l) => (
                  <div key={l.id} className="flex justify-between">
                    <span>
                      {l.description} × {l.quantity}
                    </span>
                    <span className="font-mono tabular-nums">{formatRupiah(l.subtotal)}</span>
                  </div>
                ))}
                <div className="border-t border-[#EFE8DC] pt-2 flex justify-between font-bold text-sm">
                  <span>Sisa Tagihan</span>
                  <span className="font-mono tabular-nums text-[#2F3E29]">
                    {formatRupiah(
                      Math.max(
                        0,
                        selectedInvoice.totalAmount -
                          (selectedInvoice.paidAmount - selectedInvoice.refundedAmount)
                      )
                    )}
                  </span>
                </div>
              </div>

              {/* Tambah Herbal / Potongan ke Invoice Belum Bayar (mis. invoice otomatis dari Klinis) */}
              {selectedInvoice.status === 'belum_bayar' && selectedInvoice.payments.length === 0 && (
                <form
                  onSubmit={handleUpdateUnpaidInvoiceItems}
                  className="rounded border border-[#D4C5AF] bg-[#F5EFE6]/60 p-3 space-y-2"
                >
                  <div className="font-semibold text-[#5C3D21]">
                    Tambah Produk Herbal / Potongan ke Tagihan Ini
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-5 items-end">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-[#4A5045]">Produk Herbal</label>
                      <select
                        value={itemProdId}
                        onChange={(e) => {
                          setItemProdId(e.target.value);
                          setItemBatchId('');
                        }}
                        className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2 py-1.5"
                      >
                        <option value="">-- Pilih Produk --</option>
                        {products
                          .filter((p) => p.sellPrice > 0)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({formatRupiah(p.sellPrice)})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#4A5045]">Batch & Qty</label>
                      <div className="mt-1 flex gap-1">
                        <select
                          value={itemBatchId}
                          onChange={(e) => setItemBatchId(e.target.value)}
                          className="w-full rounded border border-[#D4C5AF] bg-white px-1.5 py-1.5 font-mono"
                        >
                          <option value="">Batch</option>
                          {batches
                            .filter(
                              (b) => b.productId === itemProdId && b.branchId === selectedInvoice.branchId
                            )
                            .map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.batchNumber} ({b.quantityAvailable})
                              </option>
                            ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          value={itemQty}
                          onChange={(e) => setItemQty(Number(e.target.value))}
                          className="w-12 rounded border border-[#D4C5AF] bg-white px-1.5 py-1.5 font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#4A5045]">Potongan (Rp)</label>
                      <input
                        type="number"
                        min={0}
                        value={itemDiscount}
                        onChange={(e) => setItemDiscount(Number(e.target.value))}
                        placeholder="0"
                        className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2 py-1.5 font-mono"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded bg-[#734F2C] px-3 py-1.5 font-semibold text-white hover:bg-[#5C3D21]"
                    >
                      Terapkan ke Tagihan
                    </button>
                  </div>
                  {itemDiscount > 0 && (
                    <input
                      type="text"
                      value={itemDiscountReason}
                      onChange={(e) => setItemDiscountReason(e.target.value)}
                      placeholder="Alasan potongan harga (misal: Keringanan biaya / Paket terapi)"
                      className="w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                    />
                  )}
                </form>
              )}

              {/* Record Payment */}
              {selectedInvoice.status !== 'lunas' && selectedInvoice.status !== 'dibatalkan' && (
                <div className="rounded border border-[#EFE8DC] bg-[#FBF8F3] p-4 space-y-3">
                  <div className="font-semibold text-[#1F241D]">Catat Pembayaran</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <div>
                      <label className="block font-semibold text-[#4A5045]">Nominal (Rp)</label>
                      <input
                        type="number"
                        value={payAmount}
                        onChange={(e) => setPayAmount(Number(e.target.value))}
                        className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#4A5045]">Metode</label>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                        className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-2"
                      >
                        <option value="tunai">Tunai</option>
                        <option value="transfer">Transfer Bank</option>
                        <option value="qris_manual">QRIS (Konfirmasi Kasir)</option>
                        <option value="qris_terintegrasi">QRIS Terintegrasi</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-[#4A5045]">Tanggal Terima</label>
                      <input
                        type="date"
                        value={receivedDate}
                        onChange={(e) => setReceivedDate(e.target.value)}
                        className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#4A5045]">Ref Transaksi</label>
                      <input
                        type="text"
                        value={payRef}
                        onChange={(e) => setPayRef(e.target.value)}
                        placeholder="No. Ref"
                        className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-2 font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => submitPayment(false)}
                      className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white"
                    >
                      Simpan Pembayaran
                    </button>
                  </div>
                </div>
              )}

              {/* Payment History */}
              {selectedInvoice.payments.length > 0 && (
                <div className="space-y-2 border-t border-[#EFE8DC] pt-3">
                  <div className="font-semibold text-[#4A5045]">Riwayat Pembayaran & Refund</div>
                  {selectedInvoice.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded bg-[#FBF8F3] px-3 py-2"
                    >
                      <div>
                        <span className="font-semibold">
                          {p.isRefund ? 'REFUND' : p.method.toUpperCase()}
                        </span>{' '}
                        · Diterima {formatTanggalJam(p.receivedAt)} · {p.recordedBy}
                        {p.reason ? ` · Alasan: ${p.reason}` : ''}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold tabular-nums">{formatRupiah(p.amount)}</span>
                        {p.qrisStatus === 'menunggu_konfirmasi' && (
                          <button
                            type="button"
                            onClick={() => handleConfirmQris(selectedInvoice.id, p.id)}
                            className="inline-flex items-center gap-1 rounded bg-[#3D4F35] px-2.5 py-1 font-semibold text-white"
                          >
                            <Check className="h-3 w-3" />
                            Konfirmasi QRIS
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Refund form */}
              {selectedInvoice.paidAmount > 0 && (
                <form onSubmit={handleRefund} className="border-t border-[#EFE8DC] pt-3 flex flex-wrap items-end gap-2">
                  <div>
                    <label className="block font-semibold text-[#991B1B]">Refund / Koreksi (Rp)</label>
                    <input
                      type="number"
                      min={1}
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(Number(e.target.value))}
                      className="mt-1 w-32 rounded border border-[#D4C5AF] px-2 py-1.5 font-mono"
                    />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="block font-semibold text-[#991B1B]">Alasan Pengembalian</label>
                    <input
                      type="text"
                      required
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      placeholder="Alasan koreksi / batal sebagian"
                      className="mt-1 w-full rounded border border-[#D4C5AF] px-2.5 py-1.5"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 rounded border border-[#991B1B] px-3 py-1.5 font-semibold text-[#991B1B]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Catat Refund
                  </button>
                </form>
              )}

              {selectedInvoice.status !== 'dibatalkan' && selectedInvoice.paidAmount === 0 && (
                <form onSubmit={handleVoidInvoice} className="border-t border-[#EFE8DC] pt-3 flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block font-semibold text-[#5E645A]">Alasan Pembatalan Invoice</label>
                    <input
                      type="text"
                      required
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      placeholder="Misal: Kesalahan input kunjungan"
                      className="mt-1 w-full rounded border border-[#D4C5AF] px-2.5 py-1.5"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded border border-[#DC2626]/40 px-3 py-1.5 font-semibold text-[#991B1B]"
                  >
                    Batalkan Invoice
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Daily Cash Session */}
      <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-editorial text-lg font-semibold text-[#1F241D]">
            <Wallet className="h-5 w-5 text-[#3D4F35]" />
            Buka Kas & Tutup Kas Harian
          </div>
          <select
            value={cashBranchId}
            onChange={(e) => setCashBranchId(e.target.value)}
            className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-1.5 text-xs font-medium"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        {openSession ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <div className="rounded bg-[#FBF8F3] p-3">
                <div className="text-[#5E645A]">Saldo Awal</div>
                <div className="mt-1 font-mono font-bold tabular-nums">
                  {formatRupiah(openSession.openingBalance)}
                </div>
              </div>
              <div className="rounded bg-[#FBF8F3] p-3">
                <div className="text-[#5E645A]">Tunai Masuk</div>
                <div className="mt-1 font-mono font-bold tabular-nums">
                  {formatRupiah(openSession.cashReceived)}
                </div>
              </div>
              <div className="rounded bg-[#FBF8F3] p-3">
                <div className="text-[#5E645A]">Transfer Masuk</div>
                <div className="mt-1 font-mono font-bold tabular-nums">
                  {formatRupiah(openSession.transferReceived)}
                </div>
              </div>
              <div className="rounded bg-[#FBF8F3] p-3">
                <div className="text-[#5E645A]">QRIS Masuk</div>
                <div className="mt-1 font-mono font-bold tabular-nums">
                  {formatRupiah(openSession.qrisReceived)}
                </div>
              </div>
              <div className="rounded bg-[#FBF8F3] p-3">
                <div className="text-[#5E645A]">Refund</div>
                <div className="mt-1 font-mono font-bold tabular-nums text-[#991B1B]">
                  {formatRupiah(openSession.refunds)}
                </div>
              </div>
              <div className="rounded bg-[#F4F6F1] p-3">
                <div className="text-[#3D4F35]">Saldo Dihitung</div>
                <div className="mt-1 font-mono font-bold tabular-nums text-[#2F3E29]">
                  {formatRupiah(
                    openSession.openingBalance + openSession.cashReceived - expenses - openSession.refunds
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleCloseCash} className="grid grid-cols-1 gap-3 sm:grid-cols-4 items-end">
              <div>
                <label className="block font-semibold text-[#4A5045]">Pengeluaran Kas Harian (Rp)</label>
                <input
                  type="number"
                  min={0}
                  value={expenses}
                  onChange={(e) => setExpenses(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#D4C5AF] px-2.5 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#4A5045]">Kas Fisik Terhitung (Rp)</label>
                <input
                  type="number"
                  min={0}
                  value={actualCashCount}
                  onChange={(e) => setActualCashCount(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#D4C5AF] px-2.5 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#4A5045]">Catatan Tutup Kas</label>
                <input
                  type="text"
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="Keterangan selisih bila ada"
                  className="mt-1 w-full rounded border border-[#D4C5AF] px-2.5 py-2"
                />
              </div>
              <button type="submit" className="rounded bg-[#734F2C] px-4 py-2 font-semibold text-white">
                Tutup Kas Harian
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block font-semibold text-[#4A5045]">Saldo Awal Laci Kas (Rp)</label>
              <input
                type="number"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(Number(e.target.value))}
                className="mt-1 rounded border border-[#D4C5AF] px-3 py-2 font-mono"
              />
            </div>
            <button
              type="button"
              onClick={handleOpenCash}
              className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white"
            >
              Buka Sesi Kas Baru
            </button>
          </div>
        )}

        {cashSessions.filter((s) => s.branchId === cashBranchId && s.status === 'ditutup').length > 0 && (
          <div className="border-t border-[#EFE8DC] pt-3 space-y-1.5">
            <div className="font-semibold text-[#4A5045]">Riwayat Penutupan Kas</div>
            {cashSessions
              .filter((s) => s.branchId === cashBranchId && s.status === 'ditutup')
              .map((s) => (
                <div key={s.id} className="flex flex-wrap justify-between gap-2 text-[#4A5045]">
                  <span>
                    Ditutup {formatTanggalJam(s.closedAt)} oleh {s.closedBy}
                  </span>
                  <span className="font-mono tabular-nums">
                    Saldo Hitung {formatRupiah(s.expectedCashBalance)} · Fisik{' '}
                    {formatRupiah(s.actualCashCount || 0)} · Selisih {formatRupiah(s.variance || 0)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      {printInvoice && (
        <PrintableReceipt
          invoice={printInvoice}
          patient={patients.find((p) => p.id === printInvoice.patientId)}
          branch={branches.find((b) => b.id === printInvoice.branchId)}
          settings={settings}
          onClose={() => setPrintInvoice(null)}
        />
      )}
    </div>
  );
};
