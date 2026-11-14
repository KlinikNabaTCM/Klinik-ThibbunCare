import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Building2,
  Calendar,
  CalendarOff,
  Check,
  ClipboardList,
  HelpCircle,
  KeyRound,
  LayoutGrid,
  Package,
  Plus,
  Receipt,
  Shield,
  Stethoscope,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { apiRequest, type DemoAccountSummary } from '../../lib/api';
import type {
  AuditLog,
  Branch,
  ClinicSettings,
  EducationalArticle,
  FaqItem,
  Holiday,
  Practitioner,
  PractitionerSchedule,
  Role,
  Room,
  RuntimeStatus,
  ServiceItem,
  UserAccount,
} from '../../types/clinic';
import { formatRupiah, formatTanggal, formatTanggalJam, todayJakartaISO } from '../../utils/format';
import type { PanelTab } from './DashboardModule';

interface AdminOverviewPayload {
  runtime: RuntimeStatus;
  settings: ClinicSettings;
  branches: Branch[];
  rooms: Room[];
  holidays: Holiday[];
  services: ServiceItem[];
  practitioners: Practitioner[];
  articles: EducationalArticle[];
  faqs: FaqItem[];
  users: UserAccount[];
  recentAudits: AuditLog[];
  summary: {
    patientsCount: number;
    reservationsActive: number;
    queueActive: number;
    visitsTotal: number;
    clinicalDrafts: number;
    clinicalFinals: number;
    invoicesUnpaid: number;
    invoicesPaid: number;
    productsCount: number;
    lowStockCount: number;
    staffCount: number;
    patientAccountCount: number;
    practitionersCount: number;
    articlesCount: number;
    faqsCount: number;
  };
}

interface AdminCenterModuleProps {
  currentAccount: DemoAccountSummary;
  onNavigateTab: (tab: PanelTab) => void;
  onRefreshAll: () => Promise<void>;
}

type AdminSubTab = 'ringkasan' | 'staf' | 'praktisi' | 'cabang' | 'layanan' | 'konten';

const ALL_STAFF_ROLES: Array<{ role: Role; label: string }> = [
  { role: 'admin', label: 'Admin' },
  { role: 'pemilik', label: 'Pemilik' },
  { role: 'resepsionis', label: 'Resepsionis' },
  { role: 'praktisi', label: 'Praktisi' },
  { role: 'asisten', label: 'Asisten' },
  { role: 'kasir', label: 'Kasir' },
  { role: 'inventaris', label: 'Inventaris' },
];

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const IMAGE_PRESETS: Array<{ label: string; url: string }> = [
  { label: 'Praktisi Perempuan (TCM & Akupunktur)', url: '/images/practitioner_tcm_female_1794541320309.jpg' },
  { label: 'Praktisi Laki-Laki (Bekam & Holistik)', url: '/images/practitioner_bekam_male_1794541319637.jpg' },
  { label: 'Apotek Herbal & Edukasi Alami', url: '/images/service_herbal_apothecary_1794541318909.jpg' },
  { label: 'Ruang Klinik ThibbunCare', url: '/images/hero_clinic_sanctuary_1794541318828.jpg' },
];

export const AdminCenterModule: React.FC<AdminCenterModuleProps> = ({
  currentAccount,
  onNavigateTab,
  onRefreshAll,
}) => {
  const [subTab, setSubTab] = useState<AdminSubTab>('ringkasan');
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New staff form
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRoles, setNewUserRoles] = useState<Role[]>(['resepsionis']);
  const [newUserBranches, setNewUserBranches] = useState<string[]>(['br-jkt']);
  const [newUserClinical, setNewUserClinical] = useState(false);

  // Per-user profile & permissions edit, password reset & delete confirm
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserActive, setEditUserActive] = useState(true);
  const [editUserPerms, setEditUserPerms] = useState({
    canAccessClinicalNotes: false,
    canCorrectPayments: false,
    canExportSensitive: false,
    canManageSettings: false,
    canManageStock: false,
  });
  const [resetPwdMap, setResetPwdMap] = useState<Record<string, string>>({});
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);

  // Practitioner form + profile & schedule editor
  const [pracName, setPracName] = useState('');
  const [pracTitle, setPracTitle] = useState('');
  const [pracSpecialty, setPracSpecialty] = useState('');
  const [pracBio, setPracBio] = useState('');
  const [pracPhotoUrl, setPracPhotoUrl] = useState('/images/practitioner_tcm_female_1794541320309.jpg');
  const [pracBranches, setPracBranches] = useState<string[]>(['br-jkt']);
  const [editingPracId, setEditingPracId] = useState<string | null>(null);
  const [editPracSchedules, setEditPracSchedules] = useState<PractitionerSchedule[]>([]);
  const [editingPracProfileId, setEditingPracProfileId] = useState<string | null>(null);
  const [editPracName, setEditPracName] = useState('');
  const [editPracTitle, setEditPracTitle] = useState('');
  const [editPracSpecialty, setEditPracSpecialty] = useState('');
  const [editPracBio, setEditPracBio] = useState('');
  const [editPracPhotoUrl, setEditPracPhotoUrl] = useState('');
  const [editPracServiceIds, setEditPracServiceIds] = useState<string[]>([]);

  // Branch & room & holiday form + inline editors
  const [newBrCode, setNewBrCode] = useState('');
  const [newBrName, setNewBrName] = useState('');
  const [newBrAddress, setNewBrAddress] = useState('');
  const [newBrPhone, setNewBrPhone] = useState('');
  const [newBrWa, setNewBrWa] = useState('');
  const [newBrHours, setNewBrHours] = useState('Senin–Sabtu, 08:00–20:00 WIB');
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [editBrName, setEditBrName] = useState('');
  const [editBrAddress, setEditBrAddress] = useState('');
  const [editBrPhone, setEditBrPhone] = useState('');
  const [editBrWa, setEditBrWa] = useState('');
  const [editBrHours, setEditBrHours] = useState('');

  const [newRoomBr, setNewRoomBr] = useState('br-jkt');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState('Terapi Umum');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRmName, setEditRmName] = useState('');
  const [editRmType, setEditRmType] = useState('');

  const [holBr, setHolBr] = useState('ALL');
  const [holDate, setHolDate] = useState(todayJakartaISO());
  const [holLabel, setHolLabel] = useState('');

  // Service form
  const [srvCode, setSrvCode] = useState('');
  const [srvName, setSrvName] = useState('');
  const [srvCat, setSrvCat] = useState<ServiceItem['category']>('Akupresur');
  const [srvDesc, setSrvDesc] = useState('');
  const [srvPrice, setSrvPrice] = useState(175000);
  const [srvDuration, setSrvDuration] = useState(45);
  const [srvConsent, setSrvConsent] = useState(true);
  const [editSrvId, setEditSrvId] = useState<string | null>(null);
  const [editSrvName, setEditSrvName] = useState('');
  const [editSrvCat, setEditSrvCat] = useState<ServiceItem['category']>('Akupresur');
  const [editSrvPrice, setEditSrvPrice] = useState(0);
  const [editSrvDuration, setEditSrvDuration] = useState(45);
  const [editSrvDesc, setEditSrvDesc] = useState('');
  const [editSrvConsent, setEditSrvConsent] = useState(true);

  // Content: Articles & FAQs + inline editors
  const [artTitle, setArtTitle] = useState('');
  const [artCat, setArtCat] = useState('Edukasi Kesehatan');
  const [artReadMin, setArtReadMin] = useState(4);
  const [artImageUrl, setArtImageUrl] = useState('/images/service_herbal_apothecary_1794541318909.jpg');
  const [artExcerpt, setArtExcerpt] = useState('');
  const [artContent, setArtContent] = useState('');
  const [editingArtId, setEditingArtId] = useState<string | null>(null);
  const [editArtTitle, setEditArtTitle] = useState('');
  const [editArtCat, setEditArtCat] = useState('');
  const [editArtReadMin, setEditArtReadMin] = useState(4);
  const [editArtImageUrl, setEditArtImageUrl] = useState('');
  const [editArtExcerpt, setEditArtExcerpt] = useState('');
  const [editArtContent, setEditArtContent] = useState('');

  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [editFaqQuestion, setEditFaqQuestion] = useState('');
  const [editFaqAnswer, setEditFaqAnswer] = useState('');

  const loadAdminOverview = async () => {
    setErrorMsg(null);
    try {
      const res = await apiRequest<AdminOverviewPayload>('/api/admin/overview');
      setData(res);
      if (res.branches[0] && !res.branches.some((b) => b.id === newRoomBr)) {
        setNewRoomBr(res.branches[0].id);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Hanya akun Admin atau Pemilik berizin yang dapat mengakses Pusat Admin.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminOverview();
  }, [currentAccount.id]);

  const syncAfterMutation = async (msg: string) => {
    setNotice(msg);
    setErrorMsg(null);
    await Promise.all([loadAdminOverview(), onRefreshAll()]);
  };

  // Staff Handlers
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNotice(null);
    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          roles: newUserRoles,
          branchIds: newUserBranches,
          canAccessClinicalNotes: newUserClinical,
        }),
      });
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserClinical(false);
      await syncAfterMutation('Akun staf baru berhasil dibuat.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat akun staf.');
    }
  };

  const handlePatchUser = async (
    target: UserAccount,
    payload: Record<string, unknown>,
    successMsg: string
  ) => {
    setErrorMsg(null);
    setNotice(null);
    try {
      await apiRequest(`/api/users/${target.id}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await syncAfterMutation(successMsg);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui akun staf.');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setErrorMsg(null);
    setNotice(null);
    try {
      await apiRequest(`/api/users/${userId}`, { method: 'DELETE' });
      setConfirmDeleteUserId(null);
      await syncAfterMutation('Akun staf berhasil dihapus.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus akun staf.');
    }
  };

  const handleSaveUserProfileAndPerms = async (u: UserAccount) => {
    await handlePatchUser(
      u,
      {
        name: editUserName.trim() || u.name,
        email: editUserEmail.trim() || u.email,
        active: u.id === currentAccount.id ? u.active : editUserActive,
        permissions: editUserPerms,
      },
      `Profil & hak izin akun ${editUserName.trim() || u.name} berhasil disimpan.`
    );
    setEditingUserId(null);
  };

  // Practitioner Handlers
  const handleCreatePractitioner = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiRequest('/api/admin/practitioners', {
        method: 'POST',
        body: JSON.stringify({
          name: pracName,
          title: pracTitle,
          specialty: pracSpecialty,
          bio: pracBio,
          photoUrl: pracPhotoUrl,
          branchIds: pracBranches,
        }),
      });
      setPracName('');
      setPracTitle('');
      setPracSpecialty('');
      setPracBio('');
      await syncAfterMutation('Praktisi baru berhasil ditambahkan & tampil di Website Publik.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah praktisi.');
    }
  };

  const handleSavePracProfile = async (prac: Practitioner) => {
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/practitioners/${prac.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editPracName.trim() || prac.name,
          title: editPracTitle.trim() || prac.title,
          specialty: editPracSpecialty.trim(),
          bio: editPracBio.trim(),
          photoUrl: editPracPhotoUrl.trim() || prac.photoUrl,
          serviceIds: editPracServiceIds.length > 0 ? editPracServiceIds : prac.serviceIds,
        }),
      });
      setEditingPracProfileId(null);
      await syncAfterMutation(`Profil praktisi ${editPracName.trim() || prac.name} diperbarui.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan profil praktisi.');
    }
  };

  const handleSavePracSchedules = async (prac: Practitioner) => {
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/practitioners/${prac.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ schedules: editPracSchedules }),
      });
      setEditingPracId(null);
      await syncAfterMutation(`Jadwal praktik ${prac.name} diperbarui & tersinkron ke kalender reservasi.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan jadwal praktisi.');
    }
  };

  const handleTogglePracBranch = async (prac: Practitioner, branchId: string) => {
    const has = prac.branchIds.includes(branchId);
    if (has && prac.branchIds.length === 1) return;
    const next = has ? prac.branchIds.filter((b) => b !== branchId) : [...prac.branchIds, branchId];
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/practitioners/${prac.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ branchIds: next }),
      });
      await syncAfterMutation(`Cabang tugas ${prac.name} diperbarui.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui cabang tugas praktisi.');
    }
  };

  const handleDeletePractitioner = async (id: string) => {
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/practitioners/${id}`, { method: 'DELETE' });
      await syncAfterMutation('Praktisi dihapus.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus praktisi.');
    }
  };

  // Branch, Room, Holiday Handlers
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiRequest('/api/settings/branches', {
        method: 'POST',
        body: JSON.stringify({
          code: newBrCode,
          name: newBrName,
          address: newBrAddress,
          phone: newBrPhone,
          whatsapp: newBrWa,
          operatingHours: newBrHours,
        }),
      });
      setNewBrCode('');
      setNewBrName('');
      setNewBrAddress('');
      setNewBrPhone('');
      setNewBrWa('');
      setNewBrHours('Senin–Sabtu, 08:00–20:00 WIB');
      await syncAfterMutation('Cabang baru berhasil ditambahkan.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah cabang.');
    }
  };

  const handleSaveBranchEdit = async (br: Branch) => {
    setErrorMsg(null);
    try {
      await apiRequest(`/api/settings/branches/${br.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editBrName.trim() || br.name,
          address: editBrAddress.trim() || br.address,
          phone: editBrPhone.trim() || '-',
          whatsapp: editBrWa.trim() || br.whatsapp,
          operatingHours: editBrHours.trim() || br.operatingHours,
        }),
      });
      setEditingBranchId(null);
      await syncAfterMutation(`Detail cabang ${editBrName.trim() || br.name} diperbarui.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui detail cabang.');
    }
  };

  const handleToggleBranchActive = async (br: Branch) => {
    setErrorMsg(null);
    try {
      await apiRequest(`/api/settings/branches/${br.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !br.active }),
      });
      await syncAfterMutation(`Status cabang ${br.name} diperbarui.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah status cabang.');
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiRequest('/api/settings/rooms', {
        method: 'POST',
        body: JSON.stringify({ branchId: newRoomBr, name: newRoomName, type: newRoomType }),
      });
      setNewRoomName('');
      await syncAfterMutation('Ruangan terapi ditambahkan.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah ruangan.');
    }
  };

  const handleSaveRoomEdit = async (rm: Room) => {
    setErrorMsg(null);
    try {
      await apiRequest(`/api/settings/rooms/${rm.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editRmName.trim() || rm.name,
          type: editRmType.trim() || rm.type,
        }),
      });
      setEditingRoomId(null);
      await syncAfterMutation(`Ruangan ${editRmName.trim() || rm.name} diperbarui.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui ruangan.');
    }
  };

  const handleToggleRoomActive = async (rm: Room) => {
    setErrorMsg(null);
    try {
      await apiRequest(`/api/settings/rooms/${rm.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !rm.active }),
      });
      await syncAfterMutation(`Status ruangan ${rm.name} diperbarui.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah status ruangan.');
    }
  };

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiRequest('/api/settings/holidays', {
        method: 'POST',
        body: JSON.stringify({ branchId: holBr, date: holDate, label: holLabel }),
      });
      setHolLabel('');
      await syncAfterMutation('Hari libur klinik ditambahkan.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah hari libur.');
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    setErrorMsg(null);
    try {
      await apiRequest(`/api/settings/holidays/${id}`, { method: 'DELETE' });
      await syncAfterMutation('Hari libur dihapus.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus hari libur.');
    }
  };

  // Service Handlers
  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiRequest('/api/settings/services', {
        method: 'POST',
        body: JSON.stringify({
          code: srvCode,
          name: srvName,
          category: srvCat,
          description: srvDesc || undefined,
          price: Number(srvPrice),
          durationMinutes: Number(srvDuration),
          requiresConsent: srvConsent,
          consentFormType:
            srvCat === 'Pendamping Spiritual'
              ? 'ruqyah_syariyyah'
              : srvCat === 'Bekam' || srvCat === 'Akupunktur'
                ? 'bekam_akupunktur'
                : 'terapi_umum',
        }),
      });
      setSrvCode('');
      setSrvName('');
      setSrvDesc('');
      await syncAfterMutation('Layanan baru ditambahkan & tersedia di seluruh modul.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah layanan.');
    }
  };

  const handleSaveServiceEdit = async (srvId: string) => {
    setErrorMsg(null);
    try {
      await apiRequest('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          serviceUpdate: {
            id: srvId,
            name: editSrvName.trim(),
            category: editSrvCat,
            price: Number(editSrvPrice),
            durationMinutes: Number(editSrvDuration),
            description: editSrvDesc.trim(),
            requiresConsent: editSrvConsent,
          },
        }),
      });
      setEditSrvId(null);
      await syncAfterMutation('Layanan & tarif diperbarui (tersinkron ke Website Publik & Kasir).');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui layanan.');
    }
  };

  const handleToggleServiceBranch = async (srv: ServiceItem, branchId: string) => {
    const has = srv.activeBranchIds.includes(branchId);
    const next = has ? srv.activeBranchIds.filter((b) => b !== branchId) : [...srv.activeBranchIds, branchId];
    setErrorMsg(null);
    try {
      await apiRequest('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ serviceUpdate: { id: srv.id, activeBranchIds: next } }),
      });
      await syncAfterMutation(`Ketersediaan cabang layanan ${srv.name} diperbarui.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah ketersediaan cabang layanan.');
    }
  };

  // Article & FAQ Handlers
  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiRequest('/api/admin/articles', {
        method: 'POST',
        body: JSON.stringify({
          title: artTitle,
          category: artCat,
          readTimeMinutes: Number(artReadMin),
          imageUrl: artImageUrl,
          excerpt: artExcerpt,
          content: artContent,
        }),
      });
      setArtTitle('');
      setArtExcerpt('');
      setArtContent('');
      await syncAfterMutation('Artikel edukasi diterbitkan langsung ke Website Publik.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menerbitkan artikel.');
    }
  };

  const handleSaveArticleEdit = async (artId: string) => {
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/articles/${artId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editArtTitle.trim(),
          category: editArtCat.trim(),
          readTimeMinutes: Number(editArtReadMin) || 4,
          imageUrl: editArtImageUrl.trim(),
          excerpt: editArtExcerpt.trim(),
          content: editArtContent.trim(),
        }),
      });
      setEditingArtId(null);
      await syncAfterMutation('Artikel edukasi berhasil diperbarui di Website Publik.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui artikel.');
    }
  };

  const handleDeleteArticle = async (id: string) => {
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/articles/${id}`, { method: 'DELETE' });
      await syncAfterMutation('Artikel edukasi dihapus.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus artikel.');
    }
  };

  const handleCreateFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiRequest('/api/admin/faqs', {
        method: 'POST',
        body: JSON.stringify({ question: faqQuestion, answer: faqAnswer }),
      });
      setFaqQuestion('');
      setFaqAnswer('');
      await syncAfterMutation('FAQ baru ditambahkan ke Website Publik.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah FAQ.');
    }
  };

  const handleSaveFaqEdit = async (faqId: string) => {
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/faqs/${faqId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          question: editFaqQuestion.trim(),
          answer: editFaqAnswer.trim(),
        }),
      });
      setEditingFaqId(null);
      await syncAfterMutation('FAQ publik berhasil diperbarui.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui FAQ.');
    }
  };

  const handleDeleteFaq = async (id: string) => {
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/faqs/${id}`, { method: 'DELETE' });
      await syncAfterMutation('FAQ dihapus.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus FAQ.');
    }
  };

  if (loading && !data) {
    return (
      <div className="rounded-lg border border-[#E4DDD0] bg-white p-8 text-center text-sm text-[#5E645A]">
        Memuat Pusat Manajemen Admin...
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="rounded-lg border border-[#DC2626]/30 bg-white p-6 text-sm text-[#991B1B]">
        {errorMsg}
      </div>
    );
  }

  if (!data) return null;

  const subTabs: Array<{ id: AdminSubTab; label: string; icon: React.ReactNode }> = [
    { id: 'ringkasan', label: 'Kontrol Semua Fitur', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
    { id: 'staf', label: `Akun Staf (${data.summary.staffCount})`, icon: <Shield className="h-3.5 w-3.5" /> },
    { id: 'praktisi', label: `Praktisi & Jadwal (${data.summary.practitionersCount})`, icon: <Stethoscope className="h-3.5 w-3.5" /> },
    { id: 'cabang', label: `Cabang & Ruang (${data.branches.length})`, icon: <Building2 className="h-3.5 w-3.5" /> },
    { id: 'layanan', label: `Layanan & Tarif (${data.services.length})`, icon: <Activity className="h-3.5 w-3.5" /> },
    { id: 'konten', label: `Konten Website (${data.articles.length + data.faqs.length})`, icon: <BookOpen className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-col justify-between gap-3 border-b border-[#E4DDD0] pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold text-[#734F2C]">
            Administrator Terintegrasi · {currentAccount.name}
          </p>
          <h1 className="mt-1 font-editorial text-2xl font-semibold text-[#1F241D]">
            Pusat Manajemen Admin ThibbunCare
          </h1>
          <p className="text-[#5E645A]">
            Kelola seluruh fitur Website Publik, Portal Pasien, Akun Staf, Praktisi, Cabang, Layanan, hingga Audit dari satu tempat.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigateTab('pengaturan')}
          className="inline-flex items-center gap-1.5 rounded border border-[#D4C5AF] bg-white px-3 py-2 font-semibold text-[#1F241D] hover:bg-[#F5EFE6]"
        >
          Pengaturan Identitas & Keamanan
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-[#E4DDD0] bg-[#F5EFE6] p-1.5">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-semibold transition-colors ${
              subTab === t.id
                ? 'bg-[#3D4F35] text-white'
                : 'text-[#4A5045] hover:bg-white hover:text-[#1F241D]'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {errorMsg && <div className="rounded bg-[#FEF2F2] p-3 font-medium text-[#991B1B]">{errorMsg}</div>}
      {notice && <div className="rounded bg-[#F4F6F1] p-3 font-medium text-[#243020]">{notice}</div>}

      {/* SUBTAB 1: KONTROL SEMUA FITUR */}
      {subTab === 'ringkasan' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => onNavigateTab('pasien')}
              className="rounded-lg border border-[#E4DDD0] bg-white p-4 text-left hover:border-[#3D4F35]"
            >
              <div className="flex items-center justify-between text-[#5E645A]">
                <span className="font-semibold">Pasien & Portal</span>
                <Users className="h-4 w-4 text-[#3D4F35]" />
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-[#1F241D]">
                {data.summary.patientsCount}
              </div>
              <div className="mt-1 text-[11px] text-[#5E645A]">
                {data.summary.patientAccountCount} akses portal aktif · Kelola Pasien →
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('jadwal')}
              className="rounded-lg border border-[#E4DDD0] bg-white p-4 text-left hover:border-[#3D4F35]"
            >
              <div className="flex items-center justify-between text-[#5E645A]">
                <span className="font-semibold">Reservasi & Antrean</span>
                <Calendar className="h-4 w-4 text-[#3D4F35]" />
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-[#1F241D]">
                {data.summary.reservationsActive} / {data.summary.queueActive}
              </div>
              <div className="mt-1 text-[11px] text-[#5E645A]">
                Reservasi aktif / Antrean berjalan →
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('klinis')}
              className="rounded-lg border border-[#E4DDD0] bg-white p-4 text-left hover:border-[#3D4F35]"
            >
              <div className="flex items-center justify-between text-[#5E645A]">
                <span className="font-semibold">Klinis & Asesmen</span>
                <ClipboardList className="h-4 w-4 text-[#3D4F35]" />
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-[#1F241D]">
                {data.summary.clinicalDrafts} draf · {data.summary.clinicalFinals} final
              </div>
              <div className="mt-1 text-[11px] text-[#5E645A]">
                Finalisasi otomatis terbitkan tagihan Kasir →
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('kasir')}
              className="rounded-lg border border-[#E4DDD0] bg-white p-4 text-left hover:border-[#3D4F35]"
            >
              <div className="flex items-center justify-between text-[#5E645A]">
                <span className="font-semibold">Kasir & Inventaris</span>
                <Receipt className="h-4 w-4 text-[#734F2C]" />
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-[#734F2C]">
                {data.summary.invoicesUnpaid} tagihan · {data.summary.lowStockCount} stok min
              </div>
              <div className="mt-1 text-[11px] text-[#5E645A]">
                {data.summary.invoicesPaid} lunas · {data.summary.productsCount} produk aktif →
              </div>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-[#E4DDD0] bg-white p-4 space-y-2">
              <div className="font-semibold text-[#2F3E29]">Alur Integrasi End-to-End</div>
              <ul className="space-y-1.5 text-[#4A5045]">
                <li className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#3D4F35]" />
                  <span>Booking di Website Publik otomatis membuat pasien & akses Portal Pasien tanpa admin.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#3D4F35]" />
                  <span>Check-In menerbitkan Kunjungan + Draf Klinis + Nomor Antrean Layar Publik.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#3D4F35]" />
                  <span>Penambahan tindakan/bahan otomatis mengurangi stok batch FEFO & menyinkronkan tagihan Kasir.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#3D4F35]" />
                  <span>Finalisasi klinis otomatis menerbitkan invoice Kasir, dan pelunasan otomatis menyinkronkan kuitansi ke Portal Pasien.</span>
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-[#E4DDD0] bg-white p-4 md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-[#1F241D]">Akses Cepat Manajemen Admin</div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('laporan')}
                  className="font-semibold text-[#3D4F35] hover:underline"
                >
                  Buka Laporan & Audit Lengkap →
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setSubTab('staf')}
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] p-3 text-left font-semibold hover:border-[#3D4F35]"
                >
                  Kelola Akun Staf & Reset Sandi
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('praktisi')}
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] p-3 text-left font-semibold hover:border-[#3D4F35]"
                >
                  Kelola Praktisi & Jam Praktik
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('cabang')}
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] p-3 text-left font-semibold hover:border-[#3D4F35]"
                >
                  Kelola Cabang, Ruang & Libur
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('layanan')}
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] p-3 text-left font-semibold hover:border-[#3D4F35]"
                >
                  Kelola Layanan, Tarif & Consent
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('konten')}
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] p-3 text-left font-semibold hover:border-[#3D4F35]"
                >
                  Kelola Artikel & FAQ Publik
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('inventaris')}
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] p-3 text-left font-semibold hover:border-[#3D4F35]"
                >
                  <Package className="inline h-3.5 w-3.5 mr-1" />
                  Kelola Inventaris & PO
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-3">
            <div className="font-editorial text-lg font-semibold text-[#1F241D]">
              Log Aktivitas Sistem Terbaru
            </div>
            <div className="divide-y divide-[#EFE8DC]">
              {data.recentAudits.slice(0, 8).map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <span className="font-mono font-semibold text-[#2F3E29]">{a.action}</span> ·{' '}
                    <span className="text-[#1F241D]">{a.detail}</span>
                  </div>
                  <div className="font-mono text-[11px] text-[#5E645A]">
                    {a.actorName.split(' (')[0]} · {formatTanggalJam(a.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: AKUN STAF & HAK AKSES */}
      {subTab === 'staf' && (
        <div className="space-y-6">
          <form onSubmit={handleCreateUser} className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-3">
            <div className="flex items-center gap-2 font-editorial text-lg font-semibold text-[#1F241D]">
              <UserPlus className="h-5 w-5 text-[#3D4F35]" />
              Buat Akun Login Staf / Admin Baru
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                type="text"
                required
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Nama Lengkap & Jabatan"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
              />
              <input
                type="email"
                required
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="Email Login"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
              />
              <input
                type="password"
                required
                minLength={6}
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="Kata Sandi Awal (min. 6 karakter)"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[11px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-[#4A5045]">Peran:</span>
                {ALL_STAFF_ROLES.map((sr) => {
                  const active = newUserRoles.includes(sr.role);
                  return (
                    <button
                      key={sr.role}
                      type="button"
                      onClick={() =>
                        setNewUserRoles((prev) =>
                          prev.includes(sr.role)
                            ? prev.length > 1
                              ? prev.filter((r) => r !== sr.role)
                              : prev
                            : [...prev, sr.role]
                        )
                      }
                      className={`rounded border px-2 py-0.5 font-medium ${
                        active
                          ? 'border-[#3D4F35] bg-[#3D4F35] text-white'
                          : 'border-[#D4C5AF] bg-[#FBF8F3] text-[#5E645A]'
                      }`}
                    >
                      {sr.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-[#4A5045]">Cabang:</span>
                {data.branches.map((br) => {
                  const active = newUserBranches.includes(br.id);
                  return (
                    <button
                      key={br.id}
                      type="button"
                      onClick={() =>
                        setNewUserBranches((prev) =>
                          prev.includes(br.id)
                            ? prev.length > 1
                              ? prev.filter((b) => b !== br.id)
                              : prev
                            : [...prev, br.id]
                        )
                      }
                      className={`rounded border px-2 py-0.5 font-mono font-medium ${
                        active
                          ? 'border-[#734F2C] bg-[#734F2C] text-white'
                          : 'border-[#D4C5AF] bg-[#FBF8F3] text-[#5E645A]'
                      }`}
                    >
                      {br.code}
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-1.5 font-medium">
                <input
                  type="checkbox"
                  checked={newUserClinical}
                  onChange={(e) => setNewUserClinical(e.target.checked)}
                />
                <span>Izinkan Akses Catatan Klinis</span>
              </label>
            </div>
            <button type="submit" className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white">
              Simpan Akun Staf Baru
            </button>
          </form>

          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-3">
            <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
              Daftar & Kontrol Penuh Akun Staf
            </h2>
            <div className="divide-y divide-[#EFE8DC]">
              {data.users
                .filter((u) => !u.roles.includes('pasien'))
                .map((u) => (
                  <div key={u.id} className="py-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[#1F241D]">
                          {u.name}{' '}
                          {!u.active && (
                            <span className="ml-1 rounded bg-[#FEF2F2] px-1.5 py-0.5 text-[10px] text-[#991B1B]">
                              NONAKTIF
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-[#5E645A]">{u.email}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (editingUserId === u.id) {
                              setEditingUserId(null);
                            } else {
                              setEditingUserId(u.id);
                              setEditUserName(u.name);
                              setEditUserEmail(u.email);
                              setEditUserActive(u.active);
                              setEditUserPerms({
                                canAccessClinicalNotes: u.permissions.canAccessClinicalNotes,
                                canCorrectPayments: u.permissions.canCorrectPayments,
                                canExportSensitive: u.permissions.canExportSensitive,
                                canManageSettings: u.permissions.canManageSettings,
                                canManageStock: u.permissions.canManageStock,
                              });
                            }
                          }}
                          className="rounded border border-[#734F2C] bg-[#FBF8F3] px-2.5 py-1 font-semibold text-[#5C3D21]"
                        >
                          {editingUserId === u.id ? 'Tutup Edit' : 'Sunting Profil & Izin'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handlePatchUser(
                              u,
                              { permissions: { canAccessClinicalNotes: !u.permissions.canAccessClinicalNotes } },
                              `Izin catatan klinis ${u.name} diperbarui.`
                            )
                          }
                          className={`rounded border px-2.5 py-1 font-semibold ${
                            u.permissions.canAccessClinicalNotes
                              ? 'border-[#3D4F35] bg-[#F4F6F1] text-[#2F3E29]'
                              : 'border-[#D4C5AF] bg-[#FBF8F3] text-[#5E645A]'
                          }`}
                        >
                          Klinis: {u.permissions.canAccessClinicalNotes ? 'Diizinkan' : 'Ditolak'}
                        </button>
                        {u.id !== currentAccount.id && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                handlePatchUser(
                                  u,
                                  { active: !u.active },
                                  `Status akun ${u.name} ${!u.active ? 'diaktifkan' : 'dinonaktifkan'}.`
                                )
                              }
                              className="rounded border border-[#D4C5AF] px-2.5 py-1 font-semibold text-[#4A5045]"
                            >
                              {u.active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                            {confirmDeleteUserId === u.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u.id)}
                                  className="rounded bg-[#991B1B] px-2 py-1 font-semibold text-white"
                                >
                                  Konfirmasi Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteUserId(null)}
                                  className="rounded border border-[#D4C5AF] px-2 py-1"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteUserId(u.id)}
                                className="rounded border border-[#DC2626]/30 px-2 py-1 text-[#991B1B]"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {editingUserId === u.id && (
                      <div className="rounded border border-[#D4C5AF] bg-[#FBF8F3] p-3 space-y-2.5">
                        <div className="font-semibold text-[#2F3E29]">Sunting Profil & 5 Izin Detail Akun</div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <input
                            type="text"
                            value={editUserName}
                            onChange={(e) => setEditUserName(e.target.value)}
                            placeholder="Nama lengkap staf"
                            className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                          />
                          <input
                            type="email"
                            value={editUserEmail}
                            onChange={(e) => setEditUserEmail(e.target.value)}
                            placeholder="Email login"
                            className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 font-mono"
                          />
                          {u.id !== currentAccount.id ? (
                            <label className="flex items-center gap-2 rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 font-medium">
                              <input
                                type="checkbox"
                                checked={editUserActive}
                                onChange={(e) => setEditUserActive(e.target.checked)}
                              />
                              <span>Akun Aktif Dapat Login</span>
                            </label>
                          ) : (
                            <div className="flex items-center rounded border border-[#E4DDD0] bg-white px-2.5 py-1.5 text-[#5E645A]">
                              Akun aktif saat ini
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5 text-[11px]">
                          <label className="flex items-center gap-1.5 rounded border border-[#E4DDD0] bg-white px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={editUserPerms.canManageSettings}
                              onChange={(e) =>
                                setEditUserPerms((prev) => ({ ...prev, canManageSettings: e.target.checked }))
                              }
                            />
                            <span>Kelola Pengaturan</span>
                          </label>
                          <label className="flex items-center gap-1.5 rounded border border-[#E4DDD0] bg-white px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={editUserPerms.canAccessClinicalNotes}
                              onChange={(e) =>
                                setEditUserPerms((prev) => ({ ...prev, canAccessClinicalNotes: e.target.checked }))
                              }
                            />
                            <span>Catatan Klinis</span>
                          </label>
                          <label className="flex items-center gap-1.5 rounded border border-[#E4DDD0] bg-white px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={editUserPerms.canCorrectPayments}
                              onChange={(e) =>
                                setEditUserPerms((prev) => ({ ...prev, canCorrectPayments: e.target.checked }))
                              }
                            />
                            <span>Koreksi Pembayaran</span>
                          </label>
                          <label className="flex items-center gap-1.5 rounded border border-[#E4DDD0] bg-white px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={editUserPerms.canManageStock}
                              onChange={(e) =>
                                setEditUserPerms((prev) => ({ ...prev, canManageStock: e.target.checked }))
                              }
                            />
                            <span>Kelola Stok</span>
                          </label>
                          <label className="flex items-center gap-1.5 rounded border border-[#E4DDD0] bg-white px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={editUserPerms.canExportSensitive}
                              onChange={(e) =>
                                setEditUserPerms((prev) => ({ ...prev, canExportSensitive: e.target.checked }))
                              }
                            />
                            <span>Ekspor Sensitif</span>
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveUserProfileAndPerms(u)}
                            className="rounded bg-[#3D4F35] px-3 py-1.5 font-semibold text-white"
                          >
                            Simpan Perubahan Akun
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingUserId(null)}
                            className="rounded border border-[#D4C5AF] bg-white px-3 py-1.5"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-semibold text-[#4A5045]">Peran:</span>
                        {ALL_STAFF_ROLES.map((sr) => {
                          const has = u.roles.includes(sr.role);
                          return (
                            <button
                              key={sr.role}
                              type="button"
                              onClick={() => {
                                if (has && u.roles.length === 1) return;
                                const next = has
                                  ? u.roles.filter((r) => r !== sr.role)
                                  : [...u.roles, sr.role];
                                handlePatchUser(u, { roles: next }, `Peran ${u.name} diperbarui.`);
                              }}
                              className={`rounded border px-2 py-0.5 font-medium ${
                                has
                                  ? 'border-[#3D4F35] bg-[#3D4F35] text-white'
                                  : 'border-[#D4C5AF] bg-[#FBF8F3] text-[#5E645A]'
                              }`}
                            >
                              {sr.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-semibold text-[#4A5045]">Cabang:</span>
                        {data.branches.map((br) => {
                          const has = u.branchIds.includes(br.id);
                          return (
                            <button
                              key={br.id}
                              type="button"
                              onClick={() => {
                                if (has && u.branchIds.length === 1) return;
                                const next = has
                                  ? u.branchIds.filter((b) => b !== br.id)
                                  : [...u.branchIds, br.id];
                                handlePatchUser(u, { branchIds: next }, `Cabang ${u.name} diperbarui.`);
                              }}
                              className={`rounded border px-2 py-0.5 font-mono font-medium ${
                                has
                                  ? 'border-[#734F2C] bg-[#734F2C] text-white'
                                  : 'border-[#D4C5AF] bg-[#FBF8F3] text-[#5E645A]'
                              }`}
                            >
                              {br.code}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <select
                        value={u.linkedPractitionerId || ''}
                        onChange={(e) =>
                          handlePatchUser(
                            u,
                            { linkedPractitionerId: e.target.value || '' },
                            `Tautan praktisi untuk ${u.name} diperbarui.`
                          )
                        }
                        className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2 py-1"
                      >
                        <option value="">-- Tanpa Tautan Profil Praktisi --</option>
                        {data.practitioners.map((p) => (
                          <option key={p.id} value={p.id}>
                            Tautkan Praktisi: {p.name}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1">
                        <KeyRound className="h-3.5 w-3.5 text-[#734F2C]" />
                        <input
                          type="password"
                          value={resetPwdMap[u.id] || ''}
                          onChange={(e) =>
                            setResetPwdMap((prev) => ({ ...prev, [u.id]: e.target.value }))
                          }
                          placeholder="Sandi baru (min 6)"
                          className="w-36 rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2 py-1"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const pwd = resetPwdMap[u.id] || '';
                            if (pwd.length < 6) {
                              setErrorMsg('Kata sandi reset minimal 6 karakter.');
                              return;
                            }
                            await handlePatchUser(
                              u,
                              { resetPassword: pwd },
                              `Kata sandi ${u.name} berhasil direset.`
                            );
                            setResetPwdMap((prev) => ({ ...prev, [u.id]: '' }));
                          }}
                          className="rounded border border-[#734F2C] px-2.5 py-1 font-semibold text-[#5C3D21] hover:bg-[#F5EFE6]"
                        >
                          Reset Sandi
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: PRAKTISI & JADWAL PRAKTIK */}
      {subTab === 'praktisi' && (
        <div className="space-y-6">
          <form onSubmit={handleCreatePractitioner} className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-3">
            <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
              Tambah Praktisi Baru
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                type="text"
                required
                value={pracName}
                onChange={(e) => setPracName(e.target.value)}
                placeholder="Nama & Gelar Praktisi"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
              />
              <input
                type="text"
                required
                value={pracTitle}
                onChange={(e) => setPracTitle(e.target.value)}
                placeholder="Jabatan (misal: Praktisi Akupunktur & TCM)"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
              />
              <input
                type="text"
                value={pracSpecialty}
                onChange={(e) => setPracSpecialty(e.target.value)}
                placeholder="Fokus Keahlian"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                value={pracPhotoUrl}
                onChange={(e) => setPracPhotoUrl(e.target.value)}
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
              >
                {IMAGE_PRESETS.map((preset) => (
                  <option key={preset.url} value={preset.url}>
                    Preset Foto: {preset.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={pracPhotoUrl}
                onChange={(e) => setPracPhotoUrl(e.target.value)}
                placeholder="Atau URL Foto Praktisi (/images/...)"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 font-mono"
              />
            </div>
            <textarea
              rows={2}
              value={pracBio}
              onChange={(e) => setPracBio(e.target.value)}
              placeholder="Profil singkat praktisi (ditampilkan di Website Publik)"
              className="w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-[#4A5045]">Cabang Tugas:</span>
                {data.branches.map((br) => {
                  const has = pracBranches.includes(br.id);
                  return (
                    <button
                      key={br.id}
                      type="button"
                      onClick={() =>
                        setPracBranches((prev) =>
                          has ? (prev.length > 1 ? prev.filter((b) => b !== br.id) : prev) : [...prev, br.id]
                        )
                      }
                      className={`rounded border px-2 py-1 font-mono ${
                        has ? 'border-[#3D4F35] bg-[#3D4F35] text-white' : 'border-[#D4C5AF]'
                      }`}
                    >
                      {br.code}
                    </button>
                  );
                })}
              </div>
              <button type="submit" className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white">
                <Plus className="inline h-3.5 w-3.5 mr-1" />
                Tambah Praktisi
              </button>
            </div>
          </form>

          <div className="space-y-3">
            {data.practitioners.map((p) => (
              <div key={p.id} className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-editorial text-lg font-semibold text-[#1F241D]">{p.name}</div>
                    <div className="font-semibold text-[#734F2C]">{p.title}</div>
                    <div className="mt-1 text-[#4A5045]">{p.specialty} — {p.bio}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.branches.map((br) => {
                      const active = p.branchIds.includes(br.id);
                      return (
                        <button
                          key={br.id}
                          type="button"
                          onClick={() => handleTogglePracBranch(p, br.id)}
                          className={`rounded border px-2 py-1 font-mono ${
                            active ? 'border-[#3D4F35] bg-[#3D4F35] text-white' : 'border-[#D4C5AF]'
                          }`}
                        >
                          {br.code}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        if (editingPracProfileId === p.id) {
                          setEditingPracProfileId(null);
                        } else {
                          setEditingPracProfileId(p.id);
                          setEditPracName(p.name);
                          setEditPracTitle(p.title);
                          setEditPracSpecialty(p.specialty);
                          setEditPracBio(p.bio);
                          setEditPracPhotoUrl(p.photoUrl);
                          setEditPracServiceIds([...p.serviceIds]);
                        }
                      }}
                      className="rounded border border-[#3D4F35] px-2.5 py-1 font-semibold text-[#2F3E29]"
                    >
                      {editingPracProfileId === p.id ? 'Tutup Profil' : 'Sunting Profil'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (editingPracId === p.id) {
                          setEditingPracId(null);
                        } else {
                          setEditingPracId(p.id);
                          setEditPracSchedules(p.schedules.map((s) => ({ ...s })));
                        }
                      }}
                      className="rounded border border-[#734F2C] px-2.5 py-1 font-semibold text-[#5C3D21]"
                    >
                      {editingPracId === p.id ? 'Tutup Jadwal' : 'Atur Jam Praktik'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePractitioner(p.id)}
                      className="rounded border border-[#DC2626]/30 px-2 py-1 text-[#991B1B]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {editingPracProfileId === p.id && (
                  <div className="rounded border border-[#D4C5AF] bg-[#FBF8F3] p-3 space-y-2.5">
                    <div className="font-semibold text-[#2F3E29]">Sunting Profil Praktisi & Layanan Keahlian</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <input
                        type="text"
                        value={editPracName}
                        onChange={(e) => setEditPracName(e.target.value)}
                        placeholder="Nama & Gelar"
                        className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                      />
                      <input
                        type="text"
                        value={editPracTitle}
                        onChange={(e) => setEditPracTitle(e.target.value)}
                        placeholder="Jabatan"
                        className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                      />
                      <input
                        type="text"
                        value={editPracSpecialty}
                        onChange={(e) => setEditPracSpecialty(e.target.value)}
                        placeholder="Keahlian Utama"
                        className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <select
                        value={IMAGE_PRESETS.some((pr) => pr.url === editPracPhotoUrl) ? editPracPhotoUrl : ''}
                        onChange={(e) => {
                          if (e.target.value) setEditPracPhotoUrl(e.target.value);
                        }}
                        className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                      >
                        <option value="">-- Pilih Preset Foto --</option>
                        {IMAGE_PRESETS.map((preset) => (
                          <option key={preset.url} value={preset.url}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={editPracPhotoUrl}
                        onChange={(e) => setEditPracPhotoUrl(e.target.value)}
                        placeholder="URL Foto (/images/...)"
                        className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 font-mono"
                      />
                    </div>
                    <textarea
                      rows={2}
                      value={editPracBio}
                      onChange={(e) => setEditPracBio(e.target.value)}
                      placeholder="Bio praktisi"
                      className="w-full rounded border border-[#D4C5AF] bg-white p-2"
                    />
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-semibold text-[#4A5045]">Layanan Ditangani:</span>
                      {data.services.map((srv) => {
                        const checked = editPracServiceIds.includes(srv.id);
                        return (
                          <button
                            key={srv.id}
                            type="button"
                            onClick={() =>
                              setEditPracServiceIds((prev) =>
                                checked
                                  ? prev.length > 1
                                    ? prev.filter((id) => id !== srv.id)
                                    : prev
                                  : [...prev, srv.id]
                              )
                            }
                            className={`rounded border px-2 py-0.5 ${
                              checked
                                ? 'border-[#3D4F35] bg-[#3D4F35] text-white'
                                : 'border-[#D4C5AF] bg-white text-[#5E645A]'
                            }`}
                          >
                            {srv.name}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSavePracProfile(p)}
                        className="rounded bg-[#3D4F35] px-3 py-1.5 font-semibold text-white"
                      >
                        Simpan Profil Praktisi
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPracProfileId(null)}
                        className="rounded border border-[#D4C5AF] bg-white px-3 py-1.5"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}

                {editingPracId === p.id && (
                  <div className="border-t border-[#EFE8DC] pt-3 space-y-2">
                    <div className="font-semibold text-[#2F3E29]">
                      Jadwal Mingguan (Mempengaruhi Slot Booking Website Publik, Portal Pasien & Kalender)
                    </div>
                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                      {editPracSchedules.map((sch, idx) => (
                        <div
                          key={`${sch.dayOfWeek}-${idx}`}
                          className="flex flex-wrap items-center gap-1.5 rounded border border-[#E4DDD0] bg-[#FBF8F3] p-2"
                        >
                          <select
                            value={sch.dayOfWeek}
                            onChange={(e) => {
                              const next = [...editPracSchedules];
                              next[idx] = { ...next[idx], dayOfWeek: Number(e.target.value) };
                              setEditPracSchedules(next);
                            }}
                            className="rounded border border-[#D4C5AF] bg-white px-1.5 py-1 font-semibold"
                          >
                            {DAY_NAMES.map((dayLabel, dayIdx) => (
                              <option key={dayIdx} value={dayIdx}>
                                {dayLabel}
                              </option>
                            ))}
                          </select>
                          <select
                            value={sch.branchId}
                            onChange={(e) => {
                              const next = [...editPracSchedules];
                              next[idx] = { ...next[idx], branchId: e.target.value };
                              setEditPracSchedules(next);
                            }}
                            className="rounded border border-[#D4C5AF] bg-white px-1.5 py-1 font-mono"
                          >
                            {data.branches.map((br) => (
                              <option key={br.id} value={br.id}>
                                {br.code}
                              </option>
                            ))}
                          </select>
                          <input
                            type="time"
                            value={sch.startTime}
                            onChange={(e) => {
                              const next = [...editPracSchedules];
                              next[idx] = { ...next[idx], startTime: e.target.value };
                              setEditPracSchedules(next);
                            }}
                            className="rounded border border-[#D4C5AF] bg-white px-1.5 py-1 font-mono"
                          />
                          <span>–</span>
                          <input
                            type="time"
                            value={sch.endTime}
                            onChange={(e) => {
                              const next = [...editPracSchedules];
                              next[idx] = { ...next[idx], endTime: e.target.value };
                              setEditPracSchedules(next);
                            }}
                            className="rounded border border-[#D4C5AF] bg-white px-1.5 py-1 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setEditPracSchedules(editPracSchedules.filter((_, i) => i !== idx))
                            }
                            className="ml-auto text-[#991B1B]"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setEditPracSchedules([
                            ...editPracSchedules,
                            {
                              dayOfWeek: 1,
                              startTime: '09:00',
                              endTime: '17:00',
                              branchId: p.branchIds[0] || data.branches[0]?.id || 'br-jkt',
                            },
                          ])
                        }
                        className="rounded border border-[#D4C5AF] px-2.5 py-1 font-semibold"
                      >
                        + Tambah Hari Praktik
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSavePracSchedules(p)}
                        className="rounded bg-[#3D4F35] px-3.5 py-1.5 font-semibold text-white"
                      >
                        Simpan Jadwal Praktik
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUBTAB 4: CABANG, RUANGAN & HARI LIBUR */}
      {subTab === 'cabang' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-4">
            <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
              Kelola Cabang Klinik (Sinkron Website Publik & Operasional)
            </h2>
            <div className="divide-y divide-[#EFE8DC]">
              {data.branches.map((br) => (
                <div key={br.id} className="py-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#1F241D]">
                        {br.name} <span className="font-mono text-[#5E645A]">({br.code})</span>
                      </div>
                      <div className="text-[#4A5045]">{br.address}</div>
                      <div className="font-mono text-[11px] text-[#5E645A]">
                        {br.operatingHours} · Telp {br.phone} · WA {br.whatsapp}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (editingBranchId === br.id) {
                            setEditingBranchId(null);
                          } else {
                            setEditingBranchId(br.id);
                            setEditBrName(br.name);
                            setEditBrAddress(br.address);
                            setEditBrPhone(br.phone);
                            setEditBrWa(br.whatsapp);
                            setEditBrHours(br.operatingHours);
                          }
                        }}
                        className="rounded border border-[#734F2C] px-2.5 py-1 font-semibold text-[#5C3D21]"
                      >
                        {editingBranchId === br.id ? 'Tutup' : 'Sunting'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleBranchActive(br)}
                        className={`rounded border px-3 py-1 font-semibold ${
                          br.active
                            ? 'border-[#3D4F35] bg-[#3D4F35] text-white'
                            : 'border-[#D4C5AF] bg-[#FBF8F3] text-[#5E645A]'
                        }`}
                      >
                        {br.active ? 'Cabang Aktif' : 'Nonaktif'}
                      </button>
                    </div>
                  </div>
                  {editingBranchId === br.id && (
                    <div className="grid grid-cols-1 gap-2 rounded border border-[#D4C5AF] bg-[#FBF8F3] p-3 sm:grid-cols-2">
                      <input
                        type="text"
                        value={editBrName}
                        onChange={(e) => setEditBrName(e.target.value)}
                        placeholder="Nama Cabang"
                        className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                      />
                      <input
                        type="text"
                        value={editBrHours}
                        onChange={(e) => setEditBrHours(e.target.value)}
                        placeholder="Jam Operasional"
                        className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                      />
                      <input
                        type="text"
                        value={editBrAddress}
                        onChange={(e) => setEditBrAddress(e.target.value)}
                        placeholder="Alamat Lengkap Cabang"
                        className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 sm:col-span-2"
                      />
                      <input
                        type="text"
                        value={editBrPhone}
                        onChange={(e) => setEditBrPhone(e.target.value)}
                        placeholder="Telepon"
                        className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 font-mono"
                      />
                      <input
                        type="text"
                        value={editBrWa}
                        onChange={(e) => setEditBrWa(e.target.value)}
                        placeholder="WhatsApp (628...)"
                        className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 font-mono"
                      />
                      <div className="flex gap-2 sm:col-span-2">
                        <button
                          type="button"
                          onClick={() => handleSaveBranchEdit(br)}
                          className="rounded bg-[#3D4F35] px-3 py-1.5 font-semibold text-white"
                        >
                          Simpan Detail Cabang
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingBranchId(null)}
                          className="rounded border border-[#D4C5AF] bg-white px-3 py-1.5"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <form onSubmit={handleCreateBranch} className="grid grid-cols-1 gap-2 border-t border-[#EFE8DC] pt-3 sm:grid-cols-6">
              <input
                type="text"
                required
                value={newBrCode}
                onChange={(e) => setNewBrCode(e.target.value)}
                placeholder="Kode (SBY)"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
              />
              <input
                type="text"
                required
                value={newBrName}
                onChange={(e) => setNewBrName(e.target.value)}
                placeholder="Nama Cabang"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 sm:col-span-2"
              />
              <input
                type="text"
                required
                value={newBrAddress}
                onChange={(e) => setNewBrAddress(e.target.value)}
                placeholder="Alamat Cabang"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 sm:col-span-3"
              />
              <input
                type="text"
                value={newBrPhone}
                onChange={(e) => setNewBrPhone(e.target.value)}
                placeholder="Telepon"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono sm:col-span-2"
              />
              <input
                type="text"
                value={newBrWa}
                onChange={(e) => setNewBrWa(e.target.value)}
                placeholder="WhatsApp (628...)"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono sm:col-span-2"
              />
              <input
                type="text"
                value={newBrHours}
                onChange={(e) => setNewBrHours(e.target.value)}
                placeholder="Jam Operasional"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 sm:col-span-2"
              />
              <button type="submit" className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white sm:col-span-6">
                + Tambah Cabang
              </button>
            </form>
          </div>

          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-4">
            <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
              Ruangan Terapi per Cabang
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.rooms.map((rm) => (
                <div key={rm.id} className="rounded border border-[#E4DDD0] bg-[#FBF8F3] px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[#1F241D]">{rm.name}</div>
                      <div className="text-[11px] text-[#5E645A]">
                        {data.branches.find((b) => b.id === rm.branchId)?.name} · {rm.type}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (editingRoomId === rm.id) {
                            setEditingRoomId(null);
                          } else {
                            setEditingRoomId(rm.id);
                            setEditRmName(rm.name);
                            setEditRmType(rm.type);
                          }
                        }}
                        className="rounded border border-[#734F2C] bg-white px-2 py-1 font-semibold text-[#5C3D21]"
                      >
                        {editingRoomId === rm.id ? 'Tutup' : 'Sunting'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleRoomActive(rm)}
                        className={`rounded border px-2.5 py-1 font-semibold ${
                          rm.active ? 'border-[#3D4F35] bg-[#3D4F35] text-white' : 'border-[#D4C5AF] bg-white'
                        }`}
                      >
                        {rm.active ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </div>
                  </div>
                  {editingRoomId === rm.id && (
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-[#E4DDD0] pt-2">
                      <input
                        type="text"
                        value={editRmName}
                        onChange={(e) => setEditRmName(e.target.value)}
                        placeholder="Nama Ruangan"
                        className="flex-1 rounded border border-[#D4C5AF] bg-white px-2 py-1"
                      />
                      <input
                        type="text"
                        value={editRmType}
                        onChange={(e) => setEditRmType(e.target.value)}
                        placeholder="Jenis Ruangan"
                        className="flex-1 rounded border border-[#D4C5AF] bg-white px-2 py-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveRoomEdit(rm)}
                        className="rounded bg-[#3D4F35] px-2.5 py-1 font-semibold text-white"
                      >
                        Simpan
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <form onSubmit={handleCreateRoom} className="grid grid-cols-1 gap-2 border-t border-[#EFE8DC] pt-3 sm:grid-cols-4">
              <select
                value={newRoomBr}
                onChange={(e) => setNewRoomBr(e.target.value)}
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
              >
                {data.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Nama Ruangan"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
              />
              <input
                type="text"
                value={newRoomType}
                onChange={(e) => setNewRoomType(e.target.value)}
                placeholder="Jenis Ruangan"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
              />
              <button type="submit" className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white">
                + Tambah Ruangan
              </button>
            </form>
          </div>

          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-4">
            <div className="flex items-center gap-2 font-editorial text-lg font-semibold text-[#1F241D]">
              <CalendarOff className="h-5 w-5 text-[#734F2C]" />
              Hari Libur Cabang
            </div>
            <form onSubmit={handleCreateHoliday} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <select
                value={holBr}
                onChange={(e) => setHolBr(e.target.value)}
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
              >
                <option value="ALL">Semua Cabang</option>
                {data.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                required
                value={holDate}
                onChange={(e) => setHolDate(e.target.value)}
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
              />
              <input
                type="text"
                required
                value={holLabel}
                onChange={(e) => setHolLabel(e.target.value)}
                placeholder="Keterangan libur"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
              />
              <button type="submit" className="rounded bg-[#3D4F35] px-3 py-2 font-semibold text-white">
                Tambah Hari Libur
              </button>
            </form>
            <div className="divide-y divide-[#EFE8DC]">
              {data.holidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between py-2">
                  <span>
                    <strong className="font-mono">{formatTanggal(h.date)}</strong> · {h.label} ({h.branchId})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteHoliday(h.id)}
                    className="rounded border border-[#DC2626]/30 px-2 py-1 text-[#991B1B]"
                  >
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 5: LAYANAN & TARIF */}
      {subTab === 'layanan' && (
        <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-5">
          <div>
            <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
              Katalog Layanan, Tarif & Aktivasi per Cabang
            </h2>
            <p className="text-[#5E645A]">
              Perubahan langsung tampil pada Website Publik, Form Reservasi, Ruang Klinis, dan Kasir.
            </p>
          </div>
          <div className="divide-y divide-[#EFE8DC]">
            {data.services.map((srv) => (
              <div key={srv.id} className="py-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[#1F241D]">{srv.name}</div>
                    <div className="font-mono text-[11px] text-[#5E645A]">
                      {srv.code} · {srv.category} · {srv.durationMinutes} mnt · {formatRupiah(srv.price)}
                      {srv.requiresConsent ? ' · Wajib Consent' : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {data.branches.map((br) => {
                      const active = srv.activeBranchIds.includes(br.id);
                      return (
                        <button
                          key={br.id}
                          type="button"
                          onClick={() => handleToggleServiceBranch(srv, br.id)}
                          className={`rounded border px-2 py-1 font-semibold ${
                            active ? 'border-[#3D4F35] bg-[#3D4F35] text-white' : 'border-[#D4C5AF]'
                          }`}
                        >
                          {br.code}: {active ? 'Aktif' : 'Off'}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setEditSrvId(srv.id);
                        setEditSrvName(srv.name);
                        setEditSrvCat(srv.category);
                        setEditSrvPrice(srv.price);
                        setEditSrvDuration(srv.durationMinutes);
                        setEditSrvDesc(srv.description);
                        setEditSrvConsent(srv.requiresConsent);
                      }}
                      className="rounded border border-[#734F2C] px-2.5 py-1 font-semibold text-[#5C3D21]"
                    >
                      Sunting
                    </button>
                  </div>
                </div>
                {editSrvId === srv.id && (
                  <div className="grid grid-cols-1 gap-2 rounded border border-[#E4DDD0] bg-[#FBF8F3] p-3 sm:grid-cols-5">
                    <input
                      type="text"
                      value={editSrvName}
                      onChange={(e) => setEditSrvName(e.target.value)}
                      placeholder="Nama Layanan"
                      className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                    />
                    <select
                      value={editSrvCat}
                      onChange={(e) => setEditSrvCat(e.target.value as ServiceItem['category'])}
                      className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                    >
                      <option value="Konsultasi TCM">Konsultasi TCM</option>
                      <option value="Bekam">Bekam</option>
                      <option value="Akupunktur">Akupunktur</option>
                      <option value="Akupresur">Akupresur</option>
                      <option value="Moksibusi">Moksibusi</option>
                      <option value="Konsultasi Herbal">Konsultasi Herbal</option>
                      <option value="Pendamping Spiritual">Pendamping Spiritual</option>
                    </select>
                    <input
                      type="number"
                      value={editSrvPrice}
                      onChange={(e) => setEditSrvPrice(Number(e.target.value))}
                      placeholder="Tarif (Rp)"
                      className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 font-mono"
                    />
                    <input
                      type="number"
                      value={editSrvDuration}
                      onChange={(e) => setEditSrvDuration(Number(e.target.value))}
                      placeholder="Durasi (menit)"
                      className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 font-mono"
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSaveServiceEdit(srv.id)}
                        className="rounded bg-[#3D4F35] px-3 py-1.5 font-semibold text-white"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditSrvId(null)}
                        className="rounded border border-[#D4C5AF] bg-white px-3 py-1.5"
                      >
                        Batal
                      </button>
                    </div>
                    <input
                      type="text"
                      value={editSrvDesc}
                      onChange={(e) => setEditSrvDesc(e.target.value)}
                      placeholder="Deskripsi layanan"
                      className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 sm:col-span-3"
                    />
                    <label className="flex items-center gap-2 rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={editSrvConsent}
                        onChange={(e) => setEditSrvConsent(e.target.checked)}
                      />
                      <span>Wajib Persetujuan Tindakan</span>
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleCreateService} className="border-t border-[#EFE8DC] pt-4 space-y-2">
            <div className="font-semibold text-[#2F3E29]">Tambah Layanan Baru</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
              <input
                type="text"
                required
                value={srvCode}
                onChange={(e) => setSrvCode(e.target.value)}
                placeholder="Kode (MK-02)"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
              />
              <input
                type="text"
                required
                value={srvName}
                onChange={(e) => setSrvName(e.target.value)}
                placeholder="Nama Layanan"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 sm:col-span-2"
              />
              <select
                value={srvCat}
                onChange={(e) => setSrvCat(e.target.value as ServiceItem['category'])}
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
              >
                <option value="Konsultasi TCM">Konsultasi TCM</option>
                <option value="Bekam">Bekam</option>
                <option value="Akupunktur">Akupunktur</option>
                <option value="Akupresur">Akupresur</option>
                <option value="Moksibusi">Moksibusi</option>
                <option value="Konsultasi Herbal">Konsultasi Herbal</option>
                <option value="Pendamping Spiritual">Pendamping Spiritual</option>
              </select>
              <input
                type="number"
                value={srvPrice}
                onChange={(e) => setSrvPrice(Number(e.target.value))}
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
              />
              <input
                type="number"
                value={srvDuration}
                onChange={(e) => setSrvDuration(Number(e.target.value))}
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
              />
            </div>
            <input
              type="text"
              value={srvDesc}
              onChange={(e) => setSrvDesc(e.target.value)}
              placeholder="Deskripsi singkat layanan untuk Website Publik"
              className="w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={srvConsent}
                  onChange={(e) => setSrvConsent(e.target.checked)}
                />
                <span>Wajib Persetujuan Tindakan Sebelum Finalisasi</span>
              </label>
              <button type="submit" className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white">
                + Tambah Layanan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUBTAB 6: KONTEN WEBSITE PUBLIK (ARTIKEL & FAQ) */}
      {subTab === 'konten' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-4">
            <div className="flex items-center gap-2 font-editorial text-lg font-semibold text-[#1F241D]">
              <BookOpen className="h-5 w-5 text-[#3D4F35]" />
              Kelola Artikel Edukasi Website Publik
            </div>
            <form onSubmit={handleCreateArticle} className="space-y-2 rounded border border-[#E4DDD0] bg-[#FBF8F3] p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <input
                  type="text"
                  required
                  value={artTitle}
                  onChange={(e) => setArtTitle(e.target.value)}
                  placeholder="Judul Artikel Edukasi"
                  className="rounded border border-[#D4C5AF] bg-white px-3 py-2 sm:col-span-2"
                />
                <input
                  type="text"
                  value={artCat}
                  onChange={(e) => setArtCat(e.target.value)}
                  placeholder="Kategori"
                  className="rounded border border-[#D4C5AF] bg-white px-3 py-2"
                />
                <input
                  type="number"
                  min={1}
                  value={artReadMin}
                  onChange={(e) => setArtReadMin(Number(e.target.value))}
                  placeholder="Menit baca"
                  className="rounded border border-[#D4C5AF] bg-white px-3 py-2 font-mono"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  value={IMAGE_PRESETS.some((p) => p.url === artImageUrl) ? artImageUrl : ''}
                  onChange={(e) => {
                    if (e.target.value) setArtImageUrl(e.target.value);
                  }}
                  className="rounded border border-[#D4C5AF] bg-white px-3 py-2"
                >
                  <option value="">-- Pilih Gambar Sampul Artikel --</option>
                  {IMAGE_PRESETS.map((preset) => (
                    <option key={preset.url} value={preset.url}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={artImageUrl}
                  onChange={(e) => setArtImageUrl(e.target.value)}
                  placeholder="URL Gambar Sampul (/images/...)"
                  className="rounded border border-[#D4C5AF] bg-white px-3 py-2 font-mono"
                />
              </div>
              <input
                type="text"
                required
                value={artExcerpt}
                onChange={(e) => setArtExcerpt(e.target.value)}
                placeholder="Ringkasan singkat artikel"
                className="w-full rounded border border-[#D4C5AF] bg-white px-3 py-2"
              />
              <textarea
                rows={3}
                required
                value={artContent}
                onChange={(e) => setArtContent(e.target.value)}
                placeholder="Isi artikel lengkap..."
                className="w-full rounded border border-[#D4C5AF] bg-white p-3"
              />
              <button type="submit" className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white">
                Terbitkan Artikel ke Website Publik
              </button>
            </form>
            <div className="divide-y divide-[#EFE8DC]">
              {data.articles.map((art) => (
                <div key={art.id} className="py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#1F241D]">{art.title}</div>
                      <div className="text-[11px] text-[#734F2C]">
                        {art.category} · {art.readTimeMinutes} mnt · {formatTanggal(art.publishedDate)}
                      </div>
                      <p className="mt-1 text-[#4A5045]">{art.excerpt}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (editingArtId === art.id) {
                            setEditingArtId(null);
                          } else {
                            setEditingArtId(art.id);
                            setEditArtTitle(art.title);
                            setEditArtCat(art.category);
                            setEditArtReadMin(art.readTimeMinutes);
                            setEditArtImageUrl(art.imageUrl || '/images/service_herbal_apothecary_1794541318909.jpg');
                            setEditArtExcerpt(art.excerpt);
                            setEditArtContent(art.content);
                          }
                        }}
                        className="rounded border border-[#734F2C] px-2 py-1 font-semibold text-[#5C3D21]"
                      >
                        {editingArtId === art.id ? 'Tutup' : 'Sunting'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteArticle(art.id)}
                        className="rounded border border-[#DC2626]/30 px-2 py-1 text-[#991B1B]"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                  {editingArtId === art.id && (
                    <div className="space-y-2 rounded border border-[#D4C5AF] bg-[#FBF8F3] p-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                        <input
                          type="text"
                          value={editArtTitle}
                          onChange={(e) => setEditArtTitle(e.target.value)}
                          placeholder="Judul Artikel"
                          className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 sm:col-span-2"
                        />
                        <input
                          type="text"
                          value={editArtCat}
                          onChange={(e) => setEditArtCat(e.target.value)}
                          placeholder="Kategori"
                          className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                        />
                        <input
                          type="number"
                          min={1}
                          value={editArtReadMin}
                          onChange={(e) => setEditArtReadMin(Number(e.target.value))}
                          className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 font-mono"
                        />
                      </div>
                      <input
                        type="text"
                        value={editArtImageUrl}
                        onChange={(e) => setEditArtImageUrl(e.target.value)}
                        placeholder="URL Gambar Sampul (/images/...)"
                        className="w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 font-mono"
                      />
                      <input
                        type="text"
                        value={editArtExcerpt}
                        onChange={(e) => setEditArtExcerpt(e.target.value)}
                        placeholder="Ringkasan"
                        className="w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                      />
                      <textarea
                        rows={3}
                        value={editArtContent}
                        onChange={(e) => setEditArtContent(e.target.value)}
                        placeholder="Isi Artikel"
                        className="w-full rounded border border-[#D4C5AF] bg-white p-2.5"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveArticleEdit(art.id)}
                          className="rounded bg-[#3D4F35] px-3 py-1.5 font-semibold text-white"
                        >
                          Simpan Artikel
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingArtId(null)}
                          className="rounded border border-[#D4C5AF] bg-white px-3 py-1.5"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-4">
            <div className="flex items-center gap-2 font-editorial text-lg font-semibold text-[#1F241D]">
              <HelpCircle className="h-5 w-5 text-[#734F2C]" />
              Kelola Pertanyaan Umum (FAQ) Website Publik
            </div>
            <form onSubmit={handleCreateFaq} className="space-y-2 rounded border border-[#E4DDD0] bg-[#FBF8F3] p-4">
              <input
                type="text"
                required
                value={faqQuestion}
                onChange={(e) => setFaqQuestion(e.target.value)}
                placeholder="Pertanyaan pasien..."
                className="w-full rounded border border-[#D4C5AF] bg-white px-3 py-2"
              />
              <textarea
                rows={2}
                required
                value={faqAnswer}
                onChange={(e) => setFaqAnswer(e.target.value)}
                placeholder="Jawaban resmi klinik..."
                className="w-full rounded border border-[#D4C5AF] bg-white p-3"
              />
              <button type="submit" className="rounded bg-[#734F2C] px-4 py-2 font-semibold text-white">
                + Tambah FAQ Publik
              </button>
            </form>
            <div className="divide-y divide-[#EFE8DC]">
              {data.faqs.map((fq) => (
                <div key={fq.id} className="py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#1F241D]">{fq.question}</div>
                      <div className="mt-0.5 text-[#4A5045]">{fq.answer}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (editingFaqId === fq.id) {
                            setEditingFaqId(null);
                          } else {
                            setEditingFaqId(fq.id);
                            setEditFaqQuestion(fq.question);
                            setEditFaqAnswer(fq.answer);
                          }
                        }}
                        className="rounded border border-[#734F2C] px-2 py-1 font-semibold text-[#5C3D21]"
                      >
                        {editingFaqId === fq.id ? 'Tutup' : 'Sunting'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFaq(fq.id)}
                        className="rounded border border-[#DC2626]/30 px-2 py-1 text-[#991B1B]"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                  {editingFaqId === fq.id && (
                    <div className="space-y-2 rounded border border-[#D4C5AF] bg-[#FBF8F3] p-3">
                      <input
                        type="text"
                        value={editFaqQuestion}
                        onChange={(e) => setEditFaqQuestion(e.target.value)}
                        placeholder="Pertanyaan"
                        className="w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                      />
                      <textarea
                        rows={2}
                        value={editFaqAnswer}
                        onChange={(e) => setEditFaqAnswer(e.target.value)}
                        placeholder="Jawaban"
                        className="w-full rounded border border-[#D4C5AF] bg-white p-2.5"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveFaqEdit(fq.id)}
                          className="rounded bg-[#734F2C] px-3 py-1.5 font-semibold text-white"
                        >
                          Simpan FAQ
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingFaqId(null)}
                          className="rounded border border-[#D4C5AF] bg-white px-3 py-1.5"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
