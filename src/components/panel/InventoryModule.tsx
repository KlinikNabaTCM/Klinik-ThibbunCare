import React, { useEffect, useState } from 'react';
import { AlertTriangle, PackagePlus, Plus, Truck } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import type {
  Branch,
  Product,
  ProductBatch,
  PurchaseOrder,
  StockMutation,
  Supplier,
} from '../../types/clinic';
import { formatRupiah, formatTanggal, formatTanggalJam, todayJakartaISO } from '../../utils/format';

interface InventoryModuleProps {
  branches: Branch[];
  allBranches?: Branch[];
  suppliers: Supplier[];
  products: Product[];
  batches: ProductBatch[];
  purchaseOrders: PurchaseOrder[];
  mutations: StockMutation[];
  onRefresh: () => Promise<void>;
}

export const InventoryModule: React.FC<InventoryModuleProps> = ({
  branches,
  allBranches,
  suppliers,
  products,
  batches,
  purchaseOrders,
  mutations,
  onRefresh,
}) => {
  const transferBranches = allBranches && allBranches.length > 0 ? allBranches : branches;
  const [branchId, setBranchId] = useState(branches[0]?.id || 'br-jkt');
  const [subTab, setSubTab] = useState<'stok' | 'pembelian' | 'mutasi' | 'katalog'>('stok');
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Product
  const [newSku, setNewSku] = useState('');
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState<'Produk Herbal' | 'Bahan Habis Pakai' | 'Perlengkapan'>(
    'Produk Herbal'
  );
  const [newProdUnit, setNewProdUnit] = useState('botol');
  const [newBuyPrice, setNewBuyPrice] = useState(50000);
  const [newSellPrice, setNewSellPrice] = useState(85000);
  const [newMinStock, setNewMinStock] = useState(10);
  const [newProdSupplierId, setNewProdSupplierId] = useState(suppliers[0]?.id || '');

  // New Supplier
  const [newSupName, setNewSupName] = useState('');
  const [newSupContact, setNewSupContact] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupAddress, setNewSupAddress] = useState('');

  // PO creation
  const [poSupplierId, setPoSupplierId] = useState(suppliers[0]?.id || '');
  const [poProductId, setPoProductId] = useState(products[0]?.id || '');
  const [poQty, setPoQty] = useState(20);

  // PO Receive
  const [receivePoId, setReceivePoId] = useState<string | null>(null);
  const [rcvProductId, setRcvProductId] = useState(products[0]?.id || '');
  const [rcvBatchNumber, setRcvBatchNumber] = useState('NEW-2611');
  const [rcvExpiry, setRcvExpiry] = useState('2027-11-30');
  const [rcvQty, setRcvQty] = useState(10);

  // Mutation
  const [mutBatchId, setMutBatchId] = useState('');
  const [mutType, setMutType] = useState<
    'retur_pemasok' | 'barang_rusak' | 'penyesuaian' | 'mutasi_keluar_cabang'
  >('penyesuaian');
  const [mutDirection, setMutDirection] = useState<'tambah' | 'kurang'>('kurang');
  const [mutQty, setMutQty] = useState(1);
  const [mutTargetBranch, setMutTargetBranch] = useState(branches[1]?.id || 'br-bdg');
  const [mutReason, setMutReason] = useState('');

  useEffect(() => {
    if (branches.length > 0 && !branches.some((b) => b.id === branchId)) {
      setBranchId(branches[0].id);
    }
  }, [branches]);

  useEffect(() => {
    setMutBatchId('');
    const otherBranch = transferBranches.find((b) => b.id !== branchId);
    if (otherBranch) setMutTargetBranch(otherBranch.id);
  }, [branchId, transferBranches.length]);

  const today = todayJakartaISO();
  const branchBatches = batches.filter((b) => b.branchId === branchId);
  const branchPOs = purchaseOrders.filter((po) => po.branchId === branchId);
  const branchMutations = mutations.filter((m) => m.branchId === branchId);

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const prod = products.find((p) => p.id === poProductId);
    try {
      await apiRequest('/api/inventory/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          supplierId: poSupplierId,
          lines: [{ productId: poProductId, orderedQty: poQty, unitCost: prod?.buyPrice || 0 }],
        }),
      });
      setNotice('Pesanan pembelian (PO) berhasil dibuat.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat PO.');
    }
  };

  const handleReceivePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivePoId) return;
    setErrorMsg(null);
    try {
      await apiRequest(`/api/inventory/purchase-orders/${receivePoId}/receive`, {
        method: 'POST',
        body: JSON.stringify({
          items: [
            {
              productId: rcvProductId,
              batchNumber: rcvBatchNumber,
              expiryDate: rcvExpiry,
              receivedQty: rcvQty,
            },
          ],
        }),
      });
      setReceivePoId(null);
      setNotice('Penerimaan barang tercatat dan stok batch telah bertambah.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menerima barang.');
    }
  };

  const handleMutation = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiRequest('/api/inventory/mutations', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          targetBranchId: mutType === 'mutasi_keluar_cabang' ? mutTargetBranch : undefined,
          batchId: mutBatchId,
          type: mutType,
          direction: mutDirection,
          quantity: mutQty,
          reason: mutReason,
        }),
      });
      setMutReason('');
      setNotice('Mutasi stok berhasil dicatat.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mencatat mutasi stok.');
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNotice(null);
    try {
      await apiRequest('/api/inventory/products', {
        method: 'POST',
        body: JSON.stringify({
          sku: newSku,
          name: newProdName,
          category: newProdCategory,
          unit: newProdUnit,
          buyPrice: newBuyPrice,
          sellPrice: newSellPrice,
          minStock: newMinStock,
          supplierId: newProdSupplierId,
          trackExpiry: true,
        }),
      });
      setNewSku('');
      setNewProdName('');
      setNotice('Produk baru berhasil ditambahkan ke katalog.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambahkan produk.');
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNotice(null);
    try {
      await apiRequest('/api/inventory/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          name: newSupName,
          contactName: newSupContact,
          phone: newSupPhone,
          address: newSupAddress,
        }),
      });
      setNewSupName('');
      setNewSupContact('');
      setNewSupPhone('');
      setNewSupAddress('');
      setNotice('Pemasok baru berhasil ditambahkan.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambahkan pemasok.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 border-b border-[#E4DDD0] pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-editorial text-2xl font-semibold text-[#1F241D]">
            Inventaris, Pemasok & Pembelian Batch
          </h1>
          <p className="text-xs text-[#5E645A]">
            Pelacakan stok per batch & kedaluwarsa, penerimaan pembelian bertahap, serta riwayat mutasi stok.
          </p>
        </div>
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="rounded border border-[#D4C5AF] bg-white px-3 py-2 text-xs font-medium self-start"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {errorMsg && <div className="rounded bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">{errorMsg}</div>}
      {notice && <div className="rounded bg-[#F4F6F1] p-3 text-xs text-[#243020]">{notice}</div>}

      <div className="flex flex-wrap gap-1 border-b border-[#E4DDD0]">
        {(
          [
            ['stok', 'Saldo Stok & Batch'],
            ['pembelian', 'Pesanan Pembelian & Penerimaan'],
            ['mutasi', 'Catat & Riwayat Mutasi'],
            ['katalog', 'Produk & Pemasok'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`border-b-2 px-4 py-2 text-xs font-semibold ${
              subTab === key ? 'border-[#3D4F35] text-[#2F3E29]' : 'border-transparent text-[#5E645A]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'stok' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-[#E4DDD0] bg-white overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#E4DDD0] bg-[#FBF8F3] text-[#5E645A]">
                  <th className="px-4 py-3 font-semibold">SKU & Produk</th>
                  <th className="px-4 py-3 font-semibold">Kategori</th>
                  <th className="px-4 py-3 font-semibold">No. Batch & Kedaluwarsa</th>
                  <th className="px-4 py-3 text-right font-semibold">Stok Tersedia</th>
                  <th className="px-4 py-3 text-right font-semibold">Harga Jual</th>
                  <th className="px-4 py-3 font-semibold">Status Peringatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE8DC]">
                {branchBatches.map((b) => {
                  const p = products.find((pr) => pr.id === b.productId);
                  const isExpired = Boolean(b.expiryDate && b.expiryDate < today);
                  const diffDays = b.expiryDate
                    ? (new Date(`${b.expiryDate}T00:00:00+07:00`).getTime() -
                        new Date(`${today}T00:00:00+07:00`).getTime()) /
                      (1000 * 3600 * 24)
                    : 999;
                  const nearExpiry = !isExpired && diffDays <= 45;
                  const lowStock = p ? b.quantityAvailable < p.minStock : false;
                  return (
                    <tr key={b.id}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#1F241D]">{p?.name}</div>
                        <div className="font-mono text-[11px] text-[#5E645A]">{p?.sku}</div>
                      </td>
                      <td className="px-4 py-3 text-[#4A5045]">{p?.category}</td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        <div className="font-semibold">{b.batchNumber}</div>
                        <div className="text-[11px] text-[#5E645A]">ED: {formatTanggal(b.expiryDate)}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                        {b.quantityAvailable} {p?.unit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {p?.sellPrice ? formatRupiah(p.sellPrice) : 'Bahan Tindakan'}
                      </td>
                      <td className="px-4 py-3">
                        {isExpired ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-[#991B1B]">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Kedaluwarsa (Diblokir)
                          </span>
                        ) : nearExpiry || lowStock ? (
                          <span className="font-semibold text-[#92400E]">
                            {[nearExpiry ? 'Mendekati ED' : '', lowStock ? 'Stok < Min' : '']
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        ) : (
                          <span className="font-medium text-[#3D4F35]">Aman</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'pembelian' && (
        <div className="space-y-6 text-xs">
          <form onSubmit={handleCreatePo} className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-3">
            <div className="flex items-center gap-2 font-editorial text-base font-semibold">
              <Truck className="h-4 w-4 text-[#3D4F35]" />
              Buat Pesanan Pembelian (PO)
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 items-end">
              <div>
                <label className="block font-semibold text-[#4A5045]">Pemasok</label>
                <select
                  value={poSupplierId}
                  onChange={(e) => setPoSupplierId(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#4A5045]">Produk</label>
                <select
                  value={poProductId}
                  onChange={(e) => setPoProductId(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Beli: {formatRupiah(p.buyPrice)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={poQty}
                  onChange={(e) => setPoQty(Number(e.target.value))}
                  className="w-20 rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
                />
                <button
                  type="submit"
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-[#3D4F35] px-3 py-2 font-semibold text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Buat PO
                </button>
              </div>
            </div>
          </form>

          <div className="rounded-lg border border-[#E4DDD0] bg-white divide-y divide-[#EFE8DC]">
            {branchPOs.map((po) => {
              const sup = suppliers.find((s) => s.id === po.supplierId);
              return (
                <div key={po.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-mono font-bold text-[#2F3E29]">
                      {po.poNumber} · {sup?.name} · Status: {po.status.replace('_', ' ').toUpperCase()}
                    </div>
                    <div className="mt-1 text-[#5E645A]">
                      {po.lines
                        .map((l) => {
                          const p = products.find((pr) => pr.id === l.productId);
                          return `${p?.name} (Pesan: ${l.orderedQty}, Diterima: ${l.receivedQty})`;
                        })
                        .join(' | ')}
                    </div>
                  </div>
                  {po.status !== 'diterima_penuh' && (
                    <button
                      type="button"
                      onClick={() => {
                        setReceivePoId(po.id);
                        setRcvProductId(po.lines[0]?.productId || products[0].id);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-[#3D4F35] px-3 py-1.5 font-semibold text-[#3D4F35]"
                    >
                      <PackagePlus className="h-3.5 w-3.5" />
                      Terima Barang (Parsial/Penuh)
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {receivePoId && (
            <form onSubmit={handleReceivePo} className="rounded-lg border border-[#3D4F35] bg-white p-5 space-y-3">
              <div className="font-semibold text-[#2F3E29]">Form Penerimaan Barang ke Stok Batch</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                  <label className="block font-semibold text-[#4A5045]">Produk</label>
                  <select
                    value={rcvProductId}
                    onChange={(e) => setRcvProductId(e.target.value)}
                    className="mt-1 w-full rounded border border-[#D4C5AF] px-2.5 py-2"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#4A5045]">Nomor Batch</label>
                  <input
                    type="text"
                    required
                    value={rcvBatchNumber}
                    onChange={(e) => setRcvBatchNumber(e.target.value)}
                    className="mt-1 w-full rounded border border-[#D4C5AF] px-2.5 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A5045]">Tanggal Kedaluwarsa</label>
                  <input
                    type="date"
                    value={rcvExpiry}
                    onChange={(e) => setRcvExpiry(e.target.value)}
                    className="mt-1 w-full rounded border border-[#D4C5AF] px-2.5 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A5045]">Jumlah Diterima</label>
                  <input
                    type="number"
                    min={1}
                    value={rcvQty}
                    onChange={(e) => setRcvQty(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-[#D4C5AF] px-2.5 py-2 font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReceivePoId(null)}
                  className="rounded border border-[#D4C5AF] px-3 py-1.5"
                >
                  Batal
                </button>
                <button type="submit" className="rounded bg-[#3D4F35] px-4 py-1.5 font-semibold text-white">
                  Simpan Penerimaan Barang
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {subTab === 'mutasi' && (
        <div className="space-y-6 text-xs">
          <form onSubmit={handleMutation} className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-3">
            <div className="font-editorial text-base font-semibold">
              Catat Mutasi Stok (Retur, Rusak, Penyesuaian, Pindah Cabang)
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#4A5045]">Pilih Batch</label>
                <select
                  required
                  value={mutBatchId}
                  onChange={(e) => setMutBatchId(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
                >
                  <option value="">-- Pilih Batch --</option>
                  {branchBatches.map((b) => {
                    const p = products.find((pr) => pr.id === b.productId);
                    return (
                      <option key={b.id} value={b.id}>
                        {p?.name} · {b.batchNumber} (Sisa: {b.quantityAvailable})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#4A5045]">Jenis Mutasi</label>
                <select
                  value={mutType}
                  onChange={(e) =>
                    setMutType(
                      e.target.value as
                        | 'retur_pemasok'
                        | 'barang_rusak'
                        | 'penyesuaian'
                        | 'mutasi_keluar_cabang'
                    )
                  }
                  className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                >
                  <option value="penyesuaian">Penyesuaian Stok</option>
                  <option value="retur_pemasok">Retur ke Pemasok</option>
                  <option value="barang_rusak">Barang Rusak</option>
                  <option value="mutasi_keluar_cabang">Pindah Antar Cabang</option>
                </select>
              </div>
              {mutType === 'penyesuaian' && (
                <div>
                  <label className="block font-semibold text-[#4A5045]">Arah</label>
                  <select
                    value={mutDirection}
                    onChange={(e) => setMutDirection(e.target.value as 'tambah' | 'kurang')}
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                  >
                    <option value="kurang">Kurangi</option>
                    <option value="tambah">Tambah</option>
                  </select>
                </div>
              )}
              {mutType === 'mutasi_keluar_cabang' && (
                <div>
                  <label className="block font-semibold text-[#4A5045]">Cabang Tujuan</label>
                  <select
                    value={mutTargetBranch}
                    onChange={(e) => setMutTargetBranch(e.target.value)}
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                  >
                    {transferBranches
                      .filter((b) => b.id !== branchId)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block font-semibold text-[#4A5045]">Jumlah</label>
                <input
                  type="number"
                  min={1}
                  value={mutQty}
                  onChange={(e) => setMutQty(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                required
                value={mutReason}
                onChange={(e) => setMutReason(e.target.value)}
                placeholder="Alasan mutasi / nomor dokumen pendukung"
                className="flex-1 min-w-[220px] rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
              />
              <button type="submit" className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white">
                Catat Mutasi
              </button>
            </div>
          </form>

          <div className="rounded-lg border border-[#E4DDD0] bg-white overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E4DDD0] bg-[#FBF8F3] text-[#5E645A]">
                  <th className="px-4 py-2.5 font-semibold">Waktu</th>
                  <th className="px-4 py-2.5 font-semibold">Produk & Batch</th>
                  <th className="px-4 py-2.5 font-semibold">Jenis & Sumber</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Perubahan</th>
                  <th className="px-4 py-2.5 font-semibold">Petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE8DC]">
                {branchMutations.map((m) => {
                  const p = products.find((pr) => pr.id === m.productId);
                  return (
                    <tr key={m.id}>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-[#5E645A]">
                        {formatTanggalJam(m.createdAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold">{p?.name}</div>
                        <div className="font-mono text-[11px] text-[#5E645A]">Batch {m.batchNumber}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{m.type.replaceAll('_', ' ')}</div>
                        <div className="text-[11px] text-[#5E645A]">
                          Ref: {m.sourceRef} · {m.reason}
                        </div>
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono font-bold tabular-nums ${
                          m.quantityDelta > 0 ? 'text-[#3D4F35]' : 'text-[#991B1B]'
                        }`}
                      >
                        {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                      </td>
                      <td className="px-4 py-2.5 text-[#4A5045]">{m.actorName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'katalog' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 text-xs">
          <div className="space-y-4 lg:col-span-7">
            <form onSubmit={handleCreateProduct} className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-3">
              <div className="font-editorial text-base font-semibold text-[#1F241D]">Tambah Produk / Bahan Baru</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-semibold text-[#4A5045]">Kode SKU</label>
                  <input
                    type="text"
                    required
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    placeholder="HRB-010"
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#4A5045]">Nama Produk / Bahan</label>
                  <input
                    type="text"
                    required
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    placeholder="Minyak Zaitun Ruqyah 250ml"
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A5045]">Kategori</label>
                  <select
                    value={newProdCategory}
                    onChange={(e) =>
                      setNewProdCategory(
                        e.target.value as 'Produk Herbal' | 'Bahan Habis Pakai' | 'Perlengkapan'
                      )
                    }
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                  >
                    <option value="Produk Herbal">Produk Herbal</option>
                    <option value="Bahan Habis Pakai">Bahan Habis Pakai</option>
                    <option value="Perlengkapan">Perlengkapan</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#4A5045]">Satuan</label>
                  <input
                    type="text"
                    required
                    value={newProdUnit}
                    onChange={(e) => setNewProdUnit(e.target.value)}
                    placeholder="botol / pcs / kotak"
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A5045]">Stok Minimum</label>
                  <input
                    type="number"
                    min={0}
                    value={newMinStock}
                    onChange={(e) => setNewMinStock(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A5045]">Harga Beli (Rp)</label>
                  <input
                    type="number"
                    min={0}
                    value={newBuyPrice}
                    onChange={(e) => setNewBuyPrice(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A5045]">Harga Jual (0 = Bahan)</label>
                  <input
                    type="number"
                    min={0}
                    value={newSellPrice}
                    onChange={(e) => setNewSellPrice(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A5045]">Pemasok Utama</label>
                  <select
                    value={newProdSupplierId}
                    onChange={(e) => setNewProdSupplierId(e.target.value)}
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button type="submit" className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white">
                Simpan Produk Baru
              </button>
            </form>

            <div className="rounded-lg border border-[#E4DDD0] bg-white divide-y divide-[#EFE8DC]">
              <div className="px-4 py-3 font-semibold text-[#1F241D]">Daftar Katalog Produk ({products.length})</div>
              {products.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div>
                    <div className="font-semibold text-[#1F241D]">{p.name}</div>
                    <div className="font-mono text-[11px] text-[#5E645A]">
                      {p.sku} · {p.category} · Min {p.minStock} {p.unit}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div>Beli: {formatRupiah(p.buyPrice)}</div>
                    <div className="text-[#3D4F35]">{p.sellPrice ? `Jual: ${formatRupiah(p.sellPrice)}` : 'Bahan Tindakan'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 lg:col-span-5">
            <form onSubmit={handleCreateSupplier} className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-3">
              <div className="font-editorial text-base font-semibold text-[#1F241D]">Tambah Pemasok Baru</div>
              <div>
                <label className="block font-semibold text-[#4A5045]">Nama Pemasok</label>
                <input
                  type="text"
                  required
                  value={newSupName}
                  onChange={(e) => setNewSupName(e.target.value)}
                  placeholder="CV Herbal Nusantara"
                  className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-[#4A5045]">Nama Kontak</label>
                  <input
                    type="text"
                    value={newSupContact}
                    onChange={(e) => setNewSupContact(e.target.value)}
                    placeholder="Bapak Ahmad"
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A5045]">Telepon</label>
                  <input
                    type="tel"
                    required
                    value={newSupPhone}
                    onChange={(e) => setNewSupPhone(e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-[#4A5045]">Alamat</label>
                <input
                  type="text"
                  value={newSupAddress}
                  onChange={(e) => setNewSupAddress(e.target.value)}
                  placeholder="Kota / Alamat lengkap"
                  className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                />
              </div>
              <button type="submit" className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white">
                Simpan Pemasok
              </button>
            </form>

            <div className="rounded-lg border border-[#E4DDD0] bg-white divide-y divide-[#EFE8DC]">
              <div className="px-4 py-3 font-semibold text-[#1F241D]">Daftar Pemasok ({suppliers.length})</div>
              {suppliers.map((s) => (
                <div key={s.id} className="px-4 py-2.5">
                  <div className="font-semibold text-[#1F241D]">{s.name}</div>
                  <div className="text-[#5E645A]">
                    PIC: {s.contactName} · <span className="font-mono">{s.phone}</span>
                  </div>
                  <div className="text-[11px] text-[#5E645A]">{s.address}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
