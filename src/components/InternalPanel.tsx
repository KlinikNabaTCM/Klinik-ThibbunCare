import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Calendar,
  ClipboardList,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { apiRequest, type BootstrapPayload, type DemoAccountSummary } from '../lib/api';
import type {
  CashSession,
  ClinicalRecord,
  Invoice,
  Patient,
  Product,
  ProductBatch,
  PurchaseOrder,
  QueueItem,
  Reservation,
  StockMutation,
  Supplier,
  Visit,
} from '../types/clinic';
import { AdminCenterModule } from './panel/AdminCenterModule';
import { CashierModule } from './panel/CashierModule';
import { ClinicalModule } from './panel/ClinicalModule';
import { DashboardModule, type PanelTab } from './panel/DashboardModule';
import { InventoryModule } from './panel/InventoryModule';
import { PatientsModule } from './panel/PatientsModule';
import { QueueModule } from './panel/QueueModule';
import { ReportsModule } from './panel/ReportsModule';
import { ScheduleModule } from './panel/ScheduleModule';
import { SettingsModule } from './panel/SettingsModule';

interface InternalPanelProps {
  bootstrap: BootstrapPayload;
  currentAccount: DemoAccountSummary;
  onLogout: () => void;
  onRefreshBootstrap: () => Promise<void>;
}

export const InternalPanel: React.FC<InternalPanelProps> = ({
  bootstrap,
  currentAccount,
  onLogout,
  onRefreshBootstrap,
}) => {
  const [activeTab, setActiveTab] = useState<PanelTab>('dashboard');
  const [selectedVisitId, setSelectedVisitId] = useState<string | undefined>(undefined);
  const [walkInPatientId, setWalkInPatientId] = useState<string | undefined>(undefined);
  const [reservationPatientId, setReservationPatientId] = useState<string | undefined>(undefined);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [mutations, setMutations] = useState<StockMutation[]>([]);
  const [clinicalRecords] = useState<Record<string, ClinicalRecord>>({});
  const [loading, setLoading] = useState(false);

  const isStaff =
    currentAccount &&
    currentAccount.roles.some((r) =>
      ['admin', 'pemilik', 'resepsionis', 'praktisi', 'asisten', 'kasir', 'inventaris'].includes(r)
    );

  const refreshPanelData = async () => {
    if (!isStaff) return;
    setLoading(true);
    try {
      setPatients([]);
      setReservations([]);
      setQueue([]);
      setVisits([]);
      setInvoices([]);
      setCashSessions([]);
      setSuppliers([]);
      setProducts([]);
      setBatches([]);
      setPurchaseOrders([]);
      setMutations([]);
      const [patRes, resRes, queRes, visRes, invRes, cashRes, invtRes] = await Promise.allSettled([
        apiRequest<{ patients: Patient[] }>('/api/patients'),
        apiRequest<{ reservations: Reservation[] }>('/api/reservations'),
        apiRequest<{ queue: QueueItem[] }>('/api/queue'),
        apiRequest<{ visits: Visit[] }>('/api/visits'),
        apiRequest<{ invoices: Invoice[] }>('/api/invoices'),
        apiRequest<{ cashSessions: CashSession[] }>('/api/cash-sessions'),
        apiRequest<{
          suppliers: Supplier[];
          products: Product[];
          batches: ProductBatch[];
          purchaseOrders: PurchaseOrder[];
          mutations: StockMutation[];
        }>('/api/inventory'),
      ]);

      if (patRes.status === 'fulfilled') setPatients(patRes.value.patients);
      if (resRes.status === 'fulfilled') setReservations(resRes.value.reservations);
      if (queRes.status === 'fulfilled') setQueue(queRes.value.queue);
      if (visRes.status === 'fulfilled') setVisits(visRes.value.visits);
      if (invRes.status === 'fulfilled') setInvoices(invRes.value.invoices);
      if (cashRes.status === 'fulfilled') setCashSessions(cashRes.value.cashSessions);
      if (invtRes.status === 'fulfilled') {
        setSuppliers(invtRes.value.suppliers);
        setProducts(invtRes.value.products);
        setBatches(invtRes.value.batches);
        setPurchaseOrders(invtRes.value.purchaseOrders);
        setMutations(invtRes.value.mutations);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedVisitId(undefined);
    setWalkInPatientId(undefined);
    refreshPanelData();
  }, [currentAccount.id]);

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-lg px-6 py-12 text-center text-sm text-[#991B1B]">
        Akses Panel Klinik hanya diizinkan untuk akun staf yang sudah login.
      </div>
    );
  }

  const canOpenAdminCenter =
    currentAccount.roles.includes('admin') ||
    (currentAccount.roles.includes('pemilik') && currentAccount.permissions.canManageSettings);

  const navItems: Array<{ id: PanelTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    ...(canOpenAdminCenter
      ? [{ id: 'admin' as PanelTab, label: 'Pusat Admin', icon: <ShieldCheck className="h-4 w-4" /> }]
      : []),
    { id: 'pasien', label: 'Pasien', icon: <Users className="h-4 w-4" /> },
    { id: 'jadwal', label: 'Jadwal & Reservasi', icon: <Calendar className="h-4 w-4" /> },
    { id: 'antrean', label: 'Check-In & Antrean', icon: <ListOrdered className="h-4 w-4" /> },
    { id: 'klinis', label: 'Asesmen & Terapi', icon: <ClipboardList className="h-4 w-4" /> },
    { id: 'kasir', label: 'Kasir & Tutup Kas', icon: <Receipt className="h-4 w-4" /> },
    { id: 'inventaris', label: 'Inventaris & PO', icon: <Package className="h-4 w-4" /> },
    { id: 'laporan', label: 'Laporan & Audit', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'pengaturan', label: 'Pengaturan & Akses', icon: <Settings className="h-4 w-4" /> },
  ];

  const allowedBranches = bootstrap.branches.filter((b) => currentAccount.branchIds.includes(b.id));
  const scopedBranches = allowedBranches.length > 0 ? allowedBranches : bootstrap.branches;
  const canManagePatients =
    currentAccount.roles.includes('admin') ||
    currentAccount.roles.includes('pemilik') ||
    currentAccount.roles.includes('resepsionis');

  const handleCheckInReservation = async (r: Reservation) => {
    await apiRequest('/api/queue/check-in', {
      method: 'POST',
      body: JSON.stringify({ reservationId: r.id }),
    });
    await refreshPanelData();
    setActiveTab('antrean');
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-44px)] max-w-[1440px] flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden w-[248px] shrink-0 border-r border-[#E4DDD0] bg-[#F5EFE6]/70 p-4 lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5 px-2 pb-4 border-b border-[#DFD5C5]">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#3D4F35] font-mono text-xs font-bold text-white">
              {bootstrap.settings.logoInitials || 'TC'}
            </span>
            <div>
              <div className="font-editorial text-lg font-bold leading-tight text-[#2F3E29]">
                {bootstrap.settings.clinicName.replace('Klinik Holistik ', '')}
              </div>
              <div className="mt-0.5 text-[11px] text-[#5E645A]">Panel Operasional Klinik</div>
            </div>
          </div>
          <nav className="mt-4 space-y-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#3D4F35] text-white'
                      : 'text-[#4A5045] hover:bg-[#EAE0D0]/60 hover:text-[#1F241D]'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-6 rounded-md border border-[#DFD5C5] bg-[#FBF8F3] p-3 text-[11px] text-[#4A5045] space-y-2">
          <div>
            <div className="font-semibold text-[#1F241D]">{currentAccount.name}</div>
            <div className="mt-0.5 text-[10px] text-[#5E645A] font-mono">{currentAccount.email}</div>
            <div className="mt-1">
              Cabang: {currentAccount.branchIds.join(', ')} · Klinis:{' '}
              {currentAccount.permissions.canAccessClinicalNotes ? 'Diizinkan' : 'Ditolak'}
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-[#991B1B]/30 bg-white px-2.5 py-1.5 font-semibold text-[#991B1B] hover:bg-[#FEF2F2]"
          >
            <LogOut className="h-3.5 w-3.5" />
            Keluar dari Panel
          </button>
        </div>
      </aside>

      {/* Mobile Prioritized Navigation */}
      <div className="no-print border-b border-[#E4DDD0] bg-[#F5EFE6] px-3 py-2 lg:hidden">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-xs font-semibold whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? 'bg-[#3D4F35] text-white'
                  : 'border border-[#D4C5AF] bg-white text-[#4A5045]'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded border border-[#991B1B]/30 bg-white px-3 py-2 text-xs font-semibold text-[#991B1B] whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        {loading && patients.length === 0 ? (
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-8 text-center text-sm text-[#5E645A]">
            Memuat data operasional...
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardModule
                currentAccount={currentAccount}
                patients={patients}
                reservations={reservations}
                queue={queue}
                visits={visits}
                invoices={invoices}
                products={products}
                batches={batches}
                clinicalRecords={clinicalRecords}
                onNavigate={(tab, ctx) => {
                  if (ctx?.visitId) setSelectedVisitId(ctx.visitId);
                  setActiveTab(tab);
                }}
              />
            )}

            {activeTab === 'admin' && (
              <AdminCenterModule
                currentAccount={currentAccount}
                onNavigateTab={(tab) => setActiveTab(tab)}
                onRefreshAll={async () => {
                  await onRefreshBootstrap();
                  await refreshPanelData();
                }}
              />
            )}

            {activeTab === 'pasien' && (
              <PatientsModule
                settings={bootstrap.settings}
                whatsappProviderConfigured={bootstrap.runtime.whatsappProviderConfigured}
                patients={patients}
                branches={scopedBranches}
                services={bootstrap.services}
                practitioners={bootstrap.practitioners}
                reservations={reservations}
                visits={visits}
                canManagePatients={canManagePatients}
                onRefresh={refreshPanelData}
                onCheckInWalkIn={(patient) => {
                  setWalkInPatientId(patient.id);
                  setActiveTab('antrean');
                }}
                onCreateReservation={(patient) => {
                  setReservationPatientId(patient.id);
                  setActiveTab('jadwal');
                }}
                onOpenClinicalVisit={(visitId) => {
                  setSelectedVisitId(visitId);
                  setActiveTab('klinis');
                }}
              />
            )}

            {activeTab === 'jadwal' && (
              <ScheduleModule
                settings={bootstrap.settings}
                branches={scopedBranches}
                rooms={bootstrap.rooms}
                patients={patients}
                practitioners={bootstrap.practitioners}
                services={bootstrap.services}
                reservations={reservations}
                visits={visits}
                initialPatientId={reservationPatientId}
                onRefresh={refreshPanelData}
                onCheckInReservation={handleCheckInReservation}
                onOpenClinical={(visitId) => {
                  setSelectedVisitId(visitId);
                  setActiveTab('klinis');
                }}
              />
            )}

            {activeTab === 'antrean' && (
              <QueueModule
                branches={scopedBranches}
                rooms={bootstrap.rooms}
                patients={patients}
                practitioners={bootstrap.practitioners}
                services={bootstrap.services}
                reservations={reservations}
                queue={queue}
                visits={visits}
                onRefresh={refreshPanelData}
                initialWalkInPatientId={walkInPatientId}
                onOpenClinical={(visitId) => {
                  setSelectedVisitId(visitId);
                  setActiveTab('klinis');
                }}
                onOpenCashier={(visitId) => {
                  setSelectedVisitId(visitId);
                  setActiveTab('kasir');
                }}
              />
            )}

            {activeTab === 'klinis' && (
              <ClinicalModule
                currentAccount={currentAccount}
                settings={bootstrap.settings}
                whatsappProviderConfigured={bootstrap.runtime.whatsappProviderConfigured}
                branches={bootstrap.branches}
                visits={visits}
                patients={patients}
                services={bootstrap.services}
                products={products}
                batches={batches}
                selectedVisitId={selectedVisitId}
                onSelectVisitId={setSelectedVisitId}
                onRefresh={refreshPanelData}
                onGoToCashier={(visitId) => {
                  setSelectedVisitId(visitId);
                  setActiveTab('kasir');
                }}
              />
            )}

            {activeTab === 'kasir' && (
              <CashierModule
                settings={bootstrap.settings}
                branches={scopedBranches}
                patients={patients}
                visits={visits}
                invoices={invoices}
                cashSessions={cashSessions}
                products={products}
                batches={batches}
                initialVisitId={selectedVisitId}
                onRefresh={refreshPanelData}
              />
            )}

            {activeTab === 'inventaris' && (
              <InventoryModule
                branches={scopedBranches}
                allBranches={bootstrap.branches}
                suppliers={suppliers}
                products={products}
                batches={batches}
                purchaseOrders={purchaseOrders}
                mutations={mutations}
                onRefresh={refreshPanelData}
              />
            )}

            {activeTab === 'laporan' && (
              <ReportsModule
                currentAccount={currentAccount}
                branches={scopedBranches}
                practitioners={bootstrap.practitioners}
                services={bootstrap.services}
                retentionYears={bootstrap.settings.retentionYears}
              />
            )}

            {activeTab === 'pengaturan' && (
              <SettingsModule
                currentAccount={currentAccount}
                runtime={bootstrap.runtime}
                onRefreshBootstrap={async () => {
                  await onRefreshBootstrap();
                  await refreshPanelData();
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};
