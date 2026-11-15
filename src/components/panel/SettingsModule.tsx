import React, { useEffect, useState } from 'react';
import {
  Building2,
  CalendarOff,
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  Shield,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { apiRequest, type DemoAccountSummary } from '../../lib/api';
import type {
  Branch,
  ClinicSettings,
  Holiday,
  Role,
  Room,
  RuntimeStatus,
  ServiceItem,
  UserAccount,
} from '../../types/clinic';
import { formatRupiah, formatTanggal, todayJakartaISO } from '../../utils/format';

interface SettingsModuleProps {
  currentAccount: DemoAccountSummary;
  runtime: RuntimeStatus;
  onRefreshBootstrap: () => Promise<void>;
}

interface SettingsPayload {
  settings: ClinicSettings;
  branches: Branch[];
  rooms: Room[];
  services: ServiceItem[];
  holidays: Holiday[];
  users: UserAccount[];
  runtime: RuntimeStatus;
}

const STAFF_ROLES: Array<{ role: Role; label: string }> = [
  { role: 'admin', label: 'Admin' },
  { role: 'pemilik', label: 'Pemilik' },
  { role: 'resepsionis', label: 'Resepsionis' },
  { role: 'praktisi', label: 'Praktisi' },
  { role: 'asisten', label: 'Asisten' },
  { role: 'kasir', label: 'Kasir' },
  { role: 'inventaris', label: 'Inventaris' },
];

export const SettingsModule: React.FC<SettingsModuleProps> = ({
  currentAccount,
  runtime,
  onRefreshBootstrap,
}) => {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Editable clinic settings
  const [clinicName, setClinicName] = useState('');
  const [logoInitials, setLogoInitials] = useState('');
  const [tagline, setTagline] = useState('');
  const [primaryWhatsapp, setPrimaryWhatsapp] = useState('');
  const [primaryEmail, setPrimaryEmail] = useState('');
  const [enableRoomTracking, setEnableRoomTracking] = useState(true);
  const [enableRuqyahService, setEnableRuqyahService] = useState(true);
  const [whatsappAutoSendEnabled, setWhatsappAutoSendEnabled] = useState(false);
  const [retentionYears, setRetentionYears] = useState(5);

  // Branch edit/add
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [editBranchForm, setEditBranchForm] = useState({
    code: '',
    name: '',
    address: '',
    phone: '',
    whatsapp: '',
    operatingHours: '',
  });
  const [savingBranch, setSavingBranch] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [togglingBranchId, setTogglingBranchId] = useState<string | null>(null);
  const [branchNotice, setBranchNotice] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [newBranchPhone, setNewBranchPhone] = useState('');
  const [newBranchWa, setNewBranchWa] = useState('');
  const [newBranchHours, setNewBranchHours] = useState('Senin–Sabtu, 08:00–20:00 WIB');

  // Service tariff/duration/name edit + new service
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editSrvName, setEditSrvName] = useState('');
  const [editSrvPrice, setEditSrvPrice] = useState(0);
  const [editSrvDuration, setEditSrvDuration] = useState(45);
  const [editSrvDesc, setEditSrvDesc] = useState('');
  const [editSrvConsent, setEditSrvConsent] = useState(true);
  const [newSrvCode, setNewSrvCode] = useState('');
  const [newSrvName, setNewSrvName] = useState('');
  const [newSrvCat, setNewSrvCat] = useState<ServiceItem['category']>('Akupresur');
  const [newSrvPrice, setNewSrvPrice] = useState(175000);
  const [newSrvDuration, setNewSrvDuration] = useState(45);
  const [newSrvConsent, setNewSrvConsent] = useState(true);

  // Room add & edit
  const [newRoomBranchId, setNewRoomBranchId] = useState('br-jkt');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState('Terapi Umum');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoomName, setEditRoomName] = useState('');
  const [editRoomType, setEditRoomType] = useState('');

  // Holiday form
  const [holBranchId, setHolBranchId] = useState<string>('ALL');
  const [holDate, setHolDate] = useState(todayJakartaISO());
  const [holLabel, setHolLabel] = useState('');

  // Reset confirmation
  const [confirmReset, setConfirmReset] = useState(false);

  // New staff account
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRoles, setNewUserRoles] = useState<Role[]>(['resepsionis']);
  const [newUserBranches, setNewUserBranches] = useState<string[]>(['br-jkt']);
  const [newUserClinical, setNewUserClinical] = useState(false);

  // Change own password
  const [curPassword, setCurPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);

  // Saving & User Access Inline Edit state
  const [savingClinic, setSavingClinic] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [accessNotice, setAccessNotice] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [editUserForm, setEditUserForm] = useState<{
    name: string;
    email: string;
    resetPassword: string;
    active: boolean;
    permissions: UserAccount['permissions'];
  }>({
    name: '',
    email: '',
    resetPassword: '',
    active: true,
    permissions: {
      canAccessClinicalNotes: false,
      canCorrectPayments: false,
      canExportSensitive: false,
      canManageSettings: false,
      canManageStock: false,
    },
  });

  const loadSettings = async () => {
    setErrorMsg(null);
    try {
      const res = await apiRequest<SettingsPayload>('/api/settings');
      setData(res);
      setClinicName(res.settings.clinicName);
      setLogoInitials(res.settings.logoInitials);
      setTagline(res.settings.tagline);
      setPrimaryWhatsapp(res.settings.primaryWhatsapp);
      setPrimaryEmail(res.settings.primaryEmail);
      setEnableRoomTracking(res.settings.enableRoomTracking);
      setEnableRuqyahService(res.settings.enableRuqyahService);
      setWhatsappAutoSendEnabled(res.settings.whatsappAutoSendEnabled);
      setRetentionYears(res.settings.retentionYears);
      if (res.branches[0] && !res.branches.some((b) => b.id === newRoomBranchId)) {
        setNewRoomBranchId(res.branches[0].id);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Hanya admin atau pemilik berizin yang dapat mengakses pengaturan.'
      );
    }
  };

  useEffect(() => {
    loadSettings();
  }, [currentAccount.id]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setErrorMsg(null);
    setSavingClinic(true);
    try {
      await apiRequest('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          settings: {
            clinicName: clinicName.trim() || 'ThibbunCare',
            logoInitials: logoInitials.trim().slice(0, 4).toUpperCase() || 'TC',
            tagline: tagline.trim(),
            primaryWhatsapp: primaryWhatsapp.trim(),
            primaryEmail: primaryEmail.trim(),
            enableRoomTracking,
            enableRuqyahService,
            whatsappAutoSendEnabled,
            retentionYears: Math.max(1, Math.min(25, Number(retentionYears) || 5)),
          },
        }),
      });
      setNotice('Pengaturan identitas, logo, & fitur klinik berhasil diperbarui.');
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui pengaturan.');
    } finally {
      setSavingClinic(false);
    }
  };

  const handleStartEditBranch = (br: Branch) => {
    setBranchNotice(null);
    setBranchError(null);
    setEditingBranchId(br.id);
    setEditBranchForm({
      code: br.code || '',
      name: br.name || '',
      address: br.address || '',
      phone: br.phone || '',
      whatsapp: br.whatsapp || '',
      operatingHours: br.operatingHours || '',
    });
  };

  const handleSaveBranchEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranchId) return;
    setNotice(null);
    setErrorMsg(null);
    setBranchNotice(null);
    setBranchError(null);

    const code = editBranchForm.code.trim().toUpperCase();
    const name = editBranchForm.name.trim();
    const address = editBranchForm.address.trim();
    if (!code || !name || !address) {
      const msg = 'Kode cabang, nama cabang, dan alamat lengkap wajib diisi.';
      setBranchError(msg);
      setErrorMsg(msg);
      return;
    }

    setSavingBranch(true);
    try {
      const res = await apiRequest<{ branch: Branch }>(`/api/settings/branches/${editingBranchId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          code,
          name,
          address,
          phone: editBranchForm.phone.trim() || '-',
          whatsapp: editBranchForm.whatsapp.trim(),
          operatingHours: editBranchForm.operatingHours.trim() || 'Senin–Sabtu, 08:00–20:00 WIB',
        }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              branches: prev.branches.map((b) => (b.id === res.branch.id ? res.branch : b)),
            }
          : prev
      );
      setEditingBranchId(null);
      const msg = `Data & alamat cabang "${res.branch.name}" berhasil disimpan.`;
      setBranchNotice(msg);
      setNotice(msg);
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui cabang.';
      setBranchError(msg);
      setErrorMsg(msg);
    } finally {
      setSavingBranch(false);
    }
  };

  const handleToggleBranchActive = async (br: Branch) => {
    setNotice(null);
    setErrorMsg(null);
    setBranchNotice(null);
    setBranchError(null);
    setTogglingBranchId(br.id);
    try {
      const res = await apiRequest<{ branch: Branch }>(`/api/settings/branches/${br.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !br.active }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              branches: prev.branches.map((b) => (b.id === res.branch.id ? res.branch : b)),
            }
          : prev
      );
      const msg = `Cabang "${res.branch.name}" kini berstatus ${res.branch.active ? 'Aktif' : 'Nonaktif'}.`;
      setBranchNotice(msg);
      setNotice(msg);
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status cabang.';
      setBranchError(msg);
      setErrorMsg(msg);
    } finally {
      setTogglingBranchId(null);
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setErrorMsg(null);
    setBranchNotice(null);
    setBranchError(null);

    const code = newBranchCode.trim().toUpperCase();
    const name = newBranchName.trim();
    const address = newBranchAddress.trim();
    if (!code || !name || !address) {
      const msg = 'Kode cabang, nama cabang, dan alamat lengkap wajib diisi.';
      setBranchError(msg);
      setErrorMsg(msg);
      return;
    }

    setCreatingBranch(true);
    try {
      const res = await apiRequest<{ branch: Branch }>('/api/settings/branches', {
        method: 'POST',
        body: JSON.stringify({
          code,
          name,
          address,
          phone: newBranchPhone.trim(),
          whatsapp: newBranchWa.trim(),
          operatingHours: newBranchHours.trim() || 'Senin–Sabtu, 08:00–20:00 WIB',
        }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              branches: [...prev.branches, res.branch],
            }
          : prev
      );
      setNewBranchCode('');
      setNewBranchName('');
      setNewBranchAddress('');
      setNewBranchPhone('');
      setNewBranchWa('');
      setNewBranchHours('Senin–Sabtu, 08:00–20:00 WIB');
      const msg = `Cabang baru "${res.branch.name}" (${res.branch.code}) berhasil ditambahkan.`;
      setBranchNotice(msg);
      setNotice(msg);
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menambah cabang baru.';
      setBranchError(msg);
      setErrorMsg(msg);
    } finally {
      setCreatingBranch(false);
    }
  };

  const handleSaveServiceTariff = async (srvId: string) => {
    setNotice(null);
    setErrorMsg(null);
    try {
      await apiRequest('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          serviceUpdate: {
            id: srvId,
            name: editSrvName.trim() || undefined,
            price: Math.max(0, Number(editSrvPrice)),
            durationMinutes: Math.max(10, Number(editSrvDuration)),
            description: editSrvDesc.trim() || undefined,
            requiresConsent: editSrvConsent,
          },
        }),
      });
      setEditingServiceId(null);
      setNotice('Nama, tarif, durasi & detail layanan diperbarui (berlaku untuk transaksi berikutnya).');
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui tarif layanan.');
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setErrorMsg(null);
    try {
      await apiRequest('/api/settings/services', {
        method: 'POST',
        body: JSON.stringify({
          code: newSrvCode,
          name: newSrvName,
          category: newSrvCat,
          price: Number(newSrvPrice),
          durationMinutes: Number(newSrvDuration),
          requiresConsent: newSrvConsent,
          consentFormType:
            newSrvCat === 'Pendamping Spiritual'
              ? 'ruqyah_syariyyah'
              : newSrvCat === 'Bekam' || newSrvCat === 'Akupunktur'
                ? 'bekam_akupunktur'
                : 'terapi_umum',
        }),
      });
      setNewSrvCode('');
      setNewSrvName('');
      setNotice('Layanan baru berhasil ditambahkan dan diaktifkan.');
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah layanan baru.');
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setErrorMsg(null);
    try {
      await apiRequest('/api/settings/rooms', {
        method: 'POST',
        body: JSON.stringify({
          branchId: newRoomBranchId,
          name: newRoomName,
          type: newRoomType,
        }),
      });
      setNewRoomName('');
      setNotice('Ruangan terapi baru berhasil ditambahkan.');
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah ruangan.');
    }
  };

  const handleSaveRoomEdit = async (rm: Room) => {
    setNotice(null);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/settings/rooms/${rm.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editRoomName.trim() || rm.name,
          type: editRoomType.trim() || rm.type,
        }),
      });
      setEditingRoomId(null);
      setNotice(`Ruangan ${editRoomName.trim() || rm.name} berhasil diperbarui.`);
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui ruangan.');
    }
  };

  const handleToggleRoomActive = async (rm: Room) => {
    setNotice(null);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/settings/rooms/${rm.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !rm.active }),
      });
      setNotice(`Status ruangan ${rm.name} diperbarui.`);
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah status ruangan.');
    }
  };

  const handleToggleServiceBranch = async (srv: ServiceItem, branchId: string) => {
    setNotice(null);
    setErrorMsg(null);
    try {
      const exists = srv.activeBranchIds.includes(branchId);
      const nextBranches = exists
        ? srv.activeBranchIds.filter((b) => b !== branchId)
        : [...srv.activeBranchIds, branchId];
      await apiRequest('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          serviceUpdate: { id: srv.id, activeBranchIds: nextBranches },
        }),
      });
      setNotice(`Aktivasi layanan ${srv.name} diperbarui.`);
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah aktivasi cabang layanan.');
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setErrorMsg(null);
    try {
      await apiRequest('/api/settings/holidays', {
        method: 'POST',
        body: JSON.stringify({ branchId: holBranchId, date: holDate, label: holLabel }),
      });
      setHolLabel('');
      setNotice('Hari libur klinik berhasil ditambahkan ke kalender ketersediaan.');
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah hari libur.');
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    setNotice(null);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/settings/holidays/${id}`, { method: 'DELETE' });
      setNotice('Hari libur dihapus.');
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus hari libur.');
    }
  };

  const handleToggleClinicalPermission = async (targetUser: UserAccount) => {
    setAccessNotice(null);
    setAccessError(null);
    setBusyUserId(targetUser.id);
    try {
      await apiRequest(`/api/users/${targetUser.id}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({
          permissions: { canAccessClinicalNotes: !targetUser.permissions.canAccessClinicalNotes },
        }),
      });
      const msg = `Izin akses klinis untuk ${targetUser.name} berhasil disimpan.`;
      setAccessNotice(msg);
      setNotice(msg);
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui izin akses klinis.';
      setAccessError(msg);
      setErrorMsg(msg);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleToggleUserRole = async (targetUser: UserAccount, role: Role) => {
    setAccessNotice(null);
    setAccessError(null);
    const has = targetUser.roles.includes(role);
    if (has && targetUser.roles.length === 1) {
      const msg = 'Setiap akun staf harus memiliki minimal satu peran aktif.';
      setAccessError(msg);
      setErrorMsg(msg);
      return;
    }
    const nextRoles = has
      ? targetUser.roles.filter((r) => r !== role)
      : [...targetUser.roles, role];
    setBusyUserId(targetUser.id);
    try {
      await apiRequest(`/api/users/${targetUser.id}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ roles: nextRoles }),
      });
      const msg = `Peran akun ${targetUser.name} berhasil disimpan.`;
      setAccessNotice(msg);
      setNotice(msg);
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui peran akun staf.';
      setAccessError(msg);
      setErrorMsg(msg);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleToggleUserBranch = async (targetUser: UserAccount, branchId: string) => {
    setAccessNotice(null);
    setAccessError(null);
    const has = targetUser.branchIds.includes(branchId);
    if (has && targetUser.branchIds.length === 1) {
      const msg = 'Setiap akun staf harus memiliki minimal satu cabang.';
      setAccessError(msg);
      setErrorMsg(msg);
      return;
    }
    const nextBranches = has
      ? targetUser.branchIds.filter((b) => b !== branchId)
      : [...targetUser.branchIds, branchId];
    setBusyUserId(targetUser.id);
    try {
      await apiRequest(`/api/users/${targetUser.id}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ branchIds: nextBranches }),
      });
      const msg = `Cakupan cabang ${targetUser.name} berhasil disimpan.`;
      setAccessNotice(msg);
      setNotice(msg);
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui cakupan cabang akun staf.';
      setAccessError(msg);
      setErrorMsg(msg);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleStartEditUser = (u: UserAccount) => {
    setAccessNotice(null);
    setAccessError(null);
    setEditingUserId(u.id);
    setEditUserForm({
      name: u.name,
      email: u.email,
      resetPassword: '',
      active: u.active,
      permissions: { ...u.permissions },
    });
  };

  const handleSaveUserEdit = async (e: React.FormEvent, targetUser: UserAccount) => {
    e.preventDefault();
    setAccessNotice(null);
    setAccessError(null);
    if (!editUserForm.name.trim() || !editUserForm.email.trim()) {
      setAccessError('Nama dan email akun staf wajib diisi.');
      return;
    }
    if (editUserForm.resetPassword && editUserForm.resetPassword.length < 6) {
      setAccessError('Kata sandi baru minimal 6 karakter.');
      return;
    }
    setBusyUserId(targetUser.id);
    try {
      const payload: Record<string, unknown> = {
        name: editUserForm.name.trim(),
        email: editUserForm.email.trim(),
        active: editUserForm.active,
        permissions: editUserForm.permissions,
      };
      if (editUserForm.resetPassword) {
        payload.resetPassword = editUserForm.resetPassword;
      }
      await apiRequest(`/api/users/${targetUser.id}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setEditingUserId(null);
      const msg = `Perubahan profil & hak akses ${editUserForm.name.trim()} berhasil disimpan.`;
      setAccessNotice(msg);
      setNotice(msg);
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan perubahan akun staf.';
      setAccessError(msg);
      setErrorMsg(msg);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    setAccessNotice(null);
    setAccessError(null);
    setBusyUserId(userId);
    try {
      await apiRequest(`/api/users/${userId}`, { method: 'DELETE' });
      setConfirmDeleteUserId(null);
      const msg = `Akun staf ${userName} berhasil dihapus.`;
      setAccessNotice(msg);
      setNotice(msg);
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus akun staf.';
      setAccessError(msg);
      setErrorMsg(msg);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleResetDemo = async () => {
    setNotice(null);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ message: string }>('/api/demo/reset', { method: 'POST' });
      setConfirmReset(false);
      setNotice(res.message);
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memulihkan data awal sistem.');
    }
  };

  const handleCreateStaffUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setErrorMsg(null);
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
      setNotice('Akun staf baru berhasil dibuat dan siap digunakan untuk login ke Panel Klinik.');
      await Promise.all([loadSettings(), onRefreshBootstrap()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat akun staf baru.');
    }
  };

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    setPwdErr(null);
    try {
      const res = await apiRequest<{ message?: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: curPassword,
          newPassword: nextPassword,
        }),
      });
      setCurPassword('');
      setNextPassword('');
      setPwdMsg(res.message || 'Kata sandi Anda berhasil diperbarui.');
    } catch (err) {
      setPwdErr(err instanceof Error ? err.message : 'Gagal mengubah kata sandi.');
    }
  };

  const changePasswordCard = (
    <form onSubmit={handleChangeOwnPassword} className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-3 text-xs">
      <div className="flex items-center gap-2 font-editorial text-lg font-semibold text-[#1F241D]">
        <KeyRound className="h-5 w-5 text-[#734F2C]" />
        Keamanan Akun: Ubah Kata Sandi Masuk ({currentAccount.email})
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          type="password"
          required
          value={curPassword}
          onChange={(e) => setCurPassword(e.target.value)}
          placeholder="Kata Sandi Saat Ini"
          className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
        />
        <input
          type="password"
          required
          minLength={6}
          value={nextPassword}
          onChange={(e) => setNextPassword(e.target.value)}
          placeholder="Kata Sandi Baru (min. 6 karakter)"
          className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
        />
        <button
          type="submit"
          className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white hover:bg-[#2F3E29]"
        >
          Perbarui Kata Sandi
        </button>
      </div>
      {pwdErr && <div className="rounded bg-[#FEF2F2] p-2.5 text-[#991B1B]">{pwdErr}</div>}
      {pwdMsg && <div className="rounded bg-[#F4F6F1] p-2.5 text-[#243020]">{pwdMsg}</div>}
    </form>
  );

  if (errorMsg && !data) {
    return (
      <div className="space-y-6 text-xs">
        {changePasswordCard}
        <div className="rounded-lg border border-[#DC2626]/30 bg-white p-6 text-sm text-[#991B1B]">
          {errorMsg}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4DDD0] pb-4">
        <div>
          <h1 className="font-editorial text-2xl font-semibold text-[#1F241D]">
            Pengaturan Klinik, Cabang & Hak Akses
          </h1>
          <p className="text-[#5E645A]">
            Atur identitas klinik, cabang, hari libur, tarif layanan, retensi data, dan izin staf multi-peran.
          </p>
        </div>

        <div>
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 rounded border border-[#734F2C] bg-[#F5EFE6] px-3 py-2 font-semibold text-[#5C3D21] hover:bg-[#EAE0D0]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Pulihkan Data Awal Sistem
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded border border-[#991B1B]/40 bg-[#FEF2F2] px-3 py-1.5">
              <span className="font-semibold text-[#991B1B]">Kembalikan ke data awal?</span>
              <button
                type="button"
                onClick={handleResetDemo}
                className="rounded bg-[#991B1B] px-2.5 py-1 font-semibold text-white"
              >
                Ya, Pulihkan
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1 font-medium text-[#1F241D]"
              >
                Batal
              </button>
            </div>
          )}
        </div>
      </div>

      {errorMsg && <div className="rounded bg-[#FEF2F2] p-3 font-medium text-[#991B1B]">{errorMsg}</div>}
      {notice && <div className="rounded bg-[#F4F6F1] p-3 font-medium text-[#243020]">{notice}</div>}

      {data && (data.runtime.vercelWithoutDatabase || data.runtime.cloudError) && (
        <div className="rounded-lg border border-[#B45309]/40 bg-[#FFFBEB] p-4 text-[#78350F] space-y-1">
          <div className="font-semibold">
            Penyimpanan Permanen Cloud (Supabase) Belum Aktif
          </div>
          <p className="leading-relaxed">
            {data.runtime.cloudError
              ? `Koneksi Supabase mengembalikan kendala: ${data.runtime.cloudError}. Pastikan tabel public.thibbuncare_cloud_state sudah dibuat di SQL Editor Supabase.`
              : 'Di Vercel, variabel SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY belum terbaca di server sehingga data hanya tersimpan sementara dan akan kembali ke awal saat halaman di-refresh.'}
          </p>
        </div>
      )}

      {data && (
        <>
          {/* Identitas Klinik */}
          <form onSubmit={handleSaveSettings} className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-4">
            <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
              Identitas Klinik, Logo, Kontak & Retensi Data
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#4A5045]">Nama Klinik</label>
                <input
                  type="text"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#4A5045]">Inisial Logo</label>
                <input
                  type="text"
                  maxLength={4}
                  value={logoInitials}
                  onChange={(e) => setLogoInitials(e.target.value.toUpperCase())}
                  placeholder="TC"
                  className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 font-mono text-sm uppercase"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#4A5045]">Nomor WhatsApp Resmi</label>
                <input
                  type="text"
                  value={primaryWhatsapp}
                  onChange={(e) => setPrimaryWhatsapp(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 font-mono text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#4A5045]">Email & Retensi (Thn)</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="email"
                    value={primaryEmail}
                    onChange={(e) => setPrimaryEmail(e.target.value)}
                    className="w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 text-xs"
                  />
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={retentionYears}
                    onChange={(e) => setRetentionYears(Number(e.target.value))}
                    className="w-16 rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2 py-2 font-mono text-sm"
                  />
                </div>
              </div>
              <div className="sm:col-span-6">
                <label className="block font-semibold text-[#4A5045]">Tagline Klinik</label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-xs"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={enableRoomTracking}
                  onChange={(e) => setEnableRoomTracking(e.target.checked)}
                />
                <span>Aktifkan Pelacakan Penggunaan Ruangan pada Kalender</span>
              </label>
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={enableRuqyahService}
                  onChange={(e) => setEnableRuqyahService(e.target.checked)}
                />
                <span>Aktifkan Layanan Pendampingan Ruqyah Syar’iyyah</span>
              </label>
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={whatsappAutoSendEnabled}
                  onChange={(e) => setWhatsappAutoSendEnabled(e.target.checked)}
                />
                <span>
                  Aktifkan Kirim Otomatis WhatsApp (bila penyedia WA terhubung:{' '}
                  {runtime.whatsappProviderConfigured ? 'Tersedia' : 'Belum terhubung'})
                </span>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={savingClinic}
                className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white hover:bg-[#2F3E29] disabled:opacity-60"
              >
                {savingClinic ? 'Menyimpan...' : 'Simpan Pengaturan Klinik'}
              </button>
              {notice && <span className="font-medium text-[#2F3E29]">{notice}</span>}
            </div>
          </form>

          {/* Manajemen Cabang */}
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-4">
            <div className="flex items-center gap-2 font-editorial text-lg font-semibold text-[#1F241D]">
              <Building2 className="h-5 w-5 text-[#3D4F35]" />
              Daftar Cabang, Alamat & Jam Operasional
            </div>

            {branchError && (
              <div className="rounded border border-[#DC2626]/30 bg-[#FEF2F2] p-3 font-medium text-[#991B1B]">
                {branchError}
              </div>
            )}
            {branchNotice && (
              <div className="rounded border border-[#3D4F35]/30 bg-[#F4F6F1] p-3 font-medium text-[#243020]">
                {branchNotice}
              </div>
            )}

            <div className="divide-y divide-[#EFE8DC]">
              {data.branches.map((br) => (
                <div key={br.id} className="py-3">
                  {editingBranchId === br.id ? (
                    <form onSubmit={handleSaveBranchEdit} className="grid grid-cols-1 gap-3 rounded border border-[#D4C5AF] bg-[#FBF8F3] p-4 sm:grid-cols-6">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-[#4A5045]">
                          Kode Cabang *
                        </label>
                        <input
                          type="text"
                          required
                          value={editBranchForm.code}
                          onChange={(e) => setEditBranchForm({ ...editBranchForm, code: e.target.value.toUpperCase() })}
                          placeholder="JKT-SEL"
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 font-mono uppercase"
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <label className="block text-[11px] font-semibold text-[#4A5045]">
                          Nama Cabang *
                        </label>
                        <input
                          type="text"
                          required
                          value={editBranchForm.name}
                          onChange={(e) => setEditBranchForm({ ...editBranchForm, name: e.target.value })}
                          placeholder="Nama Cabang"
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                        />
                      </div>
                      <div className="sm:col-span-6">
                        <label className="block text-[11px] font-semibold text-[#4A5045]">
                          Alamat Lengkap *
                        </label>
                        <textarea
                          rows={2}
                          required
                          value={editBranchForm.address}
                          onChange={(e) => setEditBranchForm({ ...editBranchForm, address: e.target.value })}
                          placeholder="Alamat lengkap cabang..."
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-[#4A5045]">
                          Telepon
                        </label>
                        <input
                          type="text"
                          value={editBranchForm.phone}
                          onChange={(e) => setEditBranchForm({ ...editBranchForm, phone: e.target.value })}
                          placeholder="021-xxxxxxx"
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 font-mono"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-[#4A5045]">
                          WhatsApp
                        </label>
                        <input
                          type="text"
                          value={editBranchForm.whatsapp}
                          onChange={(e) => setEditBranchForm({ ...editBranchForm, whatsapp: e.target.value })}
                          placeholder="628xxxxxxxxxx"
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5 font-mono"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-[#4A5045]">
                          Jam Operasional
                        </label>
                        <input
                          type="text"
                          value={editBranchForm.operatingHours}
                          onChange={(e) =>
                            setEditBranchForm({ ...editBranchForm, operatingHours: e.target.value })
                          }
                          placeholder="Senin–Sabtu, 08:00–20:00 WIB"
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 sm:col-span-6">
                        <button
                          type="submit"
                          disabled={savingBranch}
                          className="rounded bg-[#3D4F35] px-4 py-1.5 font-semibold text-white hover:bg-[#2F3E29] disabled:opacity-60"
                        >
                          {savingBranch ? 'Menyimpan...' : 'Simpan Cabang'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingBranchId(null)}
                          className="rounded border border-[#D4C5AF] bg-white px-3 py-1.5 font-medium"
                        >
                          Batal
                        </button>
                      </div>
                    </form>
                  ) : (
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
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleStartEditBranch(br)}
                          className="inline-flex items-center gap-1 rounded border border-[#734F2C] bg-[#FBF8F3] px-3 py-1.5 font-semibold text-[#5C3D21] hover:bg-[#F5EFE6]"
                        >
                          <Pencil className="h-3 w-3" />
                          Sunting Cabang
                        </button>
                        <button
                          type="button"
                          disabled={togglingBranchId === br.id}
                          onClick={() => handleToggleBranchActive(br)}
                          className={`rounded border px-3 py-1.5 font-semibold disabled:opacity-50 ${
                            br.active
                              ? 'border-[#3D4F35] bg-[#3D4F35] text-white'
                              : 'border-[#D4C5AF] bg-white text-[#5E645A]'
                          }`}
                        >
                          {br.active ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleCreateBranch} className="border-t border-[#EFE8DC] pt-4 space-y-3">
              <div className="font-semibold text-[#2F3E29]">Tambah Cabang & Alamat Baru</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-[#4A5045]">
                    Kode Cabang *
                  </label>
                  <input
                    type="text"
                    required
                    value={newBranchCode}
                    onChange={(e) => setNewBranchCode(e.target.value.toUpperCase())}
                    placeholder="Contoh: SBY-01"
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5 font-mono uppercase"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-[#4A5045]">
                    Nama Cabang *
                  </label>
                  <input
                    type="text"
                    required
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="Contoh: Cabang Darmo, Surabaya"
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5"
                  />
                </div>
                <div className="sm:col-span-6">
                  <label className="block text-[11px] font-semibold text-[#4A5045]">
                    Alamat Lengkap *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={newBranchAddress}
                    onChange={(e) => setNewBranchAddress(e.target.value)}
                    placeholder="Jalan, nomor gedung, kelurahan, kecamatan, kota..."
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-[#4A5045]">
                    Telepon
                  </label>
                  <input
                    type="text"
                    value={newBranchPhone}
                    onChange={(e) => setNewBranchPhone(e.target.value)}
                    placeholder="031-xxxxxxx"
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-[#4A5045]">
                    WhatsApp
                  </label>
                  <input
                    type="text"
                    value={newBranchWa}
                    onChange={(e) => setNewBranchWa(e.target.value)}
                    placeholder="628xxxxxxxxxx"
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-[#4A5045]">
                    Jam Operasional
                  </label>
                  <input
                    type="text"
                    value={newBranchHours}
                    onChange={(e) => setNewBranchHours(e.target.value)}
                    placeholder="Senin–Sabtu, 08:00–20:00 WIB"
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={creatingBranch}
                className="inline-flex items-center gap-1 rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white hover:bg-[#2F3E29] disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
                {creatingBranch ? 'Menambahkan...' : 'Tambah Cabang'}
              </button>
            </form>
          </div>

          {/* Ruangan Terapi per Cabang */}
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-4">
            <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
              Daftar Ruangan Terapi per Cabang
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.rooms.map((rm) => {
                const br = data.branches.find((b) => b.id === rm.branchId);
                return (
                  <div
                    key={rm.id}
                    className="rounded border border-[#E4DDD0] bg-[#FBF8F3] px-3 py-2 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[#1F241D]">{rm.name}</div>
                        <div className="text-[11px] text-[#5E645A]">
                          {br?.name || rm.branchId} · {rm.type}
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
                              setEditRoomName(rm.name);
                              setEditRoomType(rm.type);
                            }
                          }}
                          className="rounded border border-[#734F2C] bg-white px-2 py-1 text-[11px] font-semibold text-[#5C3D21]"
                        >
                          {editingRoomId === rm.id ? 'Tutup' : 'Sunting'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleRoomActive(rm)}
                          className={`rounded border px-2.5 py-1 text-[11px] font-semibold ${
                            rm.active
                              ? 'border-[#3D4F35] bg-[#3D4F35] text-white'
                              : 'border-[#D4C5AF] bg-white text-[#5E645A]'
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
                          value={editRoomName}
                          onChange={(e) => setEditRoomName(e.target.value)}
                          placeholder="Nama Ruangan"
                          className="flex-1 rounded border border-[#D4C5AF] bg-white px-2 py-1"
                        />
                        <input
                          type="text"
                          value={editRoomType}
                          onChange={(e) => setEditRoomType(e.target.value)}
                          placeholder="Peruntukan Ruangan"
                          className="flex-1 rounded border border-[#D4C5AF] bg-white px-2 py-1"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRoomEdit(rm)}
                          className="rounded bg-[#3D4F35] px-2.5 py-1 text-[11px] font-semibold text-white"
                        >
                          Simpan
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <form onSubmit={handleCreateRoom} className="grid grid-cols-1 gap-2 border-t border-[#EFE8DC] pt-3 sm:grid-cols-4">
              <select
                value={newRoomBranchId}
                onChange={(e) => setNewRoomBranchId(e.target.value)}
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5"
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
                placeholder="Nama Ruangan (misal: Ruang Tin 3)"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5"
              />
              <input
                type="text"
                value={newRoomType}
                onChange={(e) => setNewRoomType(e.target.value)}
                placeholder="Peruntukan"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1 rounded border border-[#3D4F35] px-3 py-1.5 font-semibold text-[#3D4F35] hover:bg-[#3D4F35] hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah Ruangan
              </button>
            </form>
          </div>

          {/* Service Branch Activation & Tarif */}
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-4">
            <div>
              <h2 className="font-editorial text-lg font-semibold text-[#1F241D]">
                Aktivasi Layanan, Tarif & Durasi per Cabang
              </h2>
              <p className="mt-1 text-[#5E645A]">
                Perubahan tarif berlaku untuk transaksi baru berikutnya; invoice lama tetap menyimpan harga saat transaksi dibuat.
              </p>
            </div>
            <div className="divide-y divide-[#EFE8DC]">
              {data.services.map((srv) => (
                <div key={srv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="font-semibold text-[#1F241D]">{srv.name}</div>
                    {editingServiceId === srv.id ? (
                      <div className="mt-1.5 space-y-2 rounded border border-[#D4C5AF] bg-[#FBF8F3] p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={editSrvName}
                            onChange={(e) => setEditSrvName(e.target.value)}
                            placeholder="Nama Layanan"
                            className="w-56 rounded border border-[#D4C5AF] bg-white px-2 py-1"
                          />
                          <label className="text-[#4A5045]">Tarif (Rp):</label>
                          <input
                            type="number"
                            min={0}
                            step={5000}
                            value={editSrvPrice}
                            onChange={(e) => setEditSrvPrice(Number(e.target.value))}
                            className="w-28 rounded border border-[#D4C5AF] bg-white px-2 py-1 font-mono"
                          />
                          <label className="text-[#4A5045]">Durasi (mnt):</label>
                          <input
                            type="number"
                            min={10}
                            step={5}
                            value={editSrvDuration}
                            onChange={(e) => setEditSrvDuration(Number(e.target.value))}
                            className="w-20 rounded border border-[#D4C5AF] bg-white px-2 py-1 font-mono"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={editSrvDesc}
                            onChange={(e) => setEditSrvDesc(e.target.value)}
                            placeholder="Deskripsi layanan"
                            className="min-w-[220px] flex-1 rounded border border-[#D4C5AF] bg-white px-2 py-1"
                          />
                          <label className="flex items-center gap-1.5 font-medium">
                            <input
                              type="checkbox"
                              checked={editSrvConsent}
                              onChange={(e) => setEditSrvConsent(e.target.checked)}
                            />
                            <span>Wajib Consent</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleSaveServiceTariff(srv.id)}
                            className="rounded bg-[#3D4F35] px-2.5 py-1 font-semibold text-white"
                          >
                            Simpan
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingServiceId(null)}
                            className="rounded border border-[#D4C5AF] bg-white px-2.5 py-1"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 font-mono text-[#5E645A]">
                        <span>
                          {srv.code} · {srv.durationMinutes} mnt · {formatRupiah(srv.price)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingServiceId(srv.id);
                            setEditSrvName(srv.name);
                            setEditSrvPrice(srv.price);
                            setEditSrvDuration(srv.durationMinutes);
                            setEditSrvDesc(srv.description);
                            setEditSrvConsent(srv.requiresConsent);
                          }}
                          className="font-sans text-[11px] font-semibold text-[#734F2C] underline"
                        >
                          Ubah Layanan / Tarif
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.branches.map((br) => {
                      const active = srv.activeBranchIds.includes(br.id);
                      return (
                        <button
                          key={br.id}
                          type="button"
                          onClick={() => handleToggleServiceBranch(srv, br.id)}
                          className={`rounded border px-2.5 py-1 font-semibold ${
                            active
                              ? 'border-[#3D4F35] bg-[#3D4F35] text-white'
                              : 'border-[#D4C5AF] text-[#5E645A]'
                          }`}
                        >
                          {br.code}: {active ? 'Aktif' : 'Nonaktif'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleCreateService} className="border-t border-[#EFE8DC] pt-4 space-y-2">
              <div className="font-semibold text-[#2F3E29]">Tambah Layanan Baru</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
                <input
                  type="text"
                  required
                  value={newSrvCode}
                  onChange={(e) => setNewSrvCode(e.target.value)}
                  placeholder="Kode (AKS-02)"
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5 font-mono"
                />
                <input
                  type="text"
                  required
                  value={newSrvName}
                  onChange={(e) => setNewSrvName(e.target.value)}
                  placeholder="Nama Layanan Baru"
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5 sm:col-span-2"
                />
                <select
                  value={newSrvCat}
                  onChange={(e) => setNewSrvCat(e.target.value as ServiceItem['category'])}
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5"
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
                  min={0}
                  step={5000}
                  value={newSrvPrice}
                  onChange={(e) => setNewSrvPrice(Number(e.target.value))}
                  placeholder="Tarif (Rp)"
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5 font-mono"
                />
                <input
                  type="number"
                  min={10}
                  step={5}
                  value={newSrvDuration}
                  onChange={(e) => setNewSrvDuration(Number(e.target.value))}
                  placeholder="Menit"
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1.5 font-mono"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[#4A5045]">
                  <input
                    type="checkbox"
                    checked={newSrvConsent}
                    onChange={(e) => setNewSrvConsent(e.target.checked)}
                  />
                  <span>Memerlukan formulir persetujuan tindakan</span>
                </label>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded border border-[#3D4F35] px-3 py-1.5 font-semibold text-[#3D4F35] hover:bg-[#3D4F35] hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah Layanan
                </button>
              </div>
            </form>
          </div>

          {/* Hari Libur Klinik */}
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-4">
            <div className="flex items-center gap-2 font-editorial text-lg font-semibold text-[#1F241D]">
              <CalendarOff className="h-5 w-5 text-[#734F2C]" />
              Hari Libur & Penutupan Jadwal Cabang
            </div>
            <form onSubmit={handleAddHoliday} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <select
                value={holBranchId}
                onChange={(e) => setHolBranchId(e.target.value)}
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
                placeholder="Keterangan libur (misal: Libur Bersama)"
                className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
              />
              <button type="submit" className="rounded bg-[#3D4F35] px-3 py-2 font-semibold text-white">
                Tambah Hari Libur
              </button>
            </form>
            <div className="divide-y divide-[#EFE8DC] rounded border border-[#EFE8DC]">
              {data.holidays.length === 0 ? (
                <div className="p-3 text-[#5E645A]">Belum ada hari libur terdaftar.</div>
              ) : (
                data.holidays.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div>
                      <span className="font-mono font-semibold text-[#1F241D]">{formatTanggal(h.date)}</span> ·{' '}
                      <span className="font-medium">{h.label}</span>{' '}
                      <span className="text-[#5E645A]">
                        ({h.branchId === 'ALL' ? 'Semua Cabang' : data.branches.find((b) => b.id === h.branchId)?.name || h.branchId})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteHoliday(h.id)}
                      className="inline-flex items-center gap-1 rounded border border-[#DC2626]/40 px-2 py-1 text-[#991B1B] hover:bg-[#FEF2F2]"
                    >
                      <Trash2 className="h-3 w-3" />
                      Hapus
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* User Roles, Branch Scope & Granular Permissions */}
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-5 space-y-3">
            <div className="flex items-center gap-2 font-editorial text-lg font-semibold text-[#1F241D]">
              <Shield className="h-5 w-5 text-[#3D4F35]" />
              Akun Staf, Multi-Peran, Cakupan Cabang & Izin Akses
            </div>
            <p className="text-[#5E645A]">
              Klik peran/cabang untuk mengaktifkan langsung, atau klik <strong>Sunting Akun &amp; Izin</strong> untuk mengedit nama, email, kata sandi, status aktif, serta 5 izin akses terperinci.
            </p>
            {accessError && (
              <div className="rounded bg-[#FEF2F2] p-2.5 font-medium text-[#991B1B]">{accessError}</div>
            )}
            {accessNotice && (
              <div className="rounded bg-[#F4F6F1] p-2.5 font-medium text-[#243020]">{accessNotice}</div>
            )}
            <div className="divide-y divide-[#EFE8DC]">
              {data.users
                .filter((u) => !u.roles.includes('pasien'))
                .map((u) => {
                  const isBusy = busyUserId === u.id;
                  const isEditing = editingUserId === u.id;
                  return (
                    <div key={u.id} className="py-3.5 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-[#1F241D]">
                            {u.name}
                            {!u.active && (
                              <span className="ml-2 rounded bg-[#FEF2F2] px-1.5 py-0.5 text-[10px] font-semibold text-[#991B1B]">
                                NONAKTIF
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] text-[#5E645A]">{u.email}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleToggleClinicalPermission(u)}
                            className={`rounded border px-3 py-1 font-semibold disabled:opacity-50 ${
                              u.permissions.canAccessClinicalNotes
                                ? 'border-[#3D4F35] bg-[#F4F6F1] text-[#2F3E29]'
                                : 'border-[#D4C5AF] bg-[#FBF8F3] text-[#5E645A]'
                            }`}
                          >
                            Catatan Klinis: {u.permissions.canAccessClinicalNotes ? 'Diizinkan' : 'Ditolak'}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => (isEditing ? setEditingUserId(null) : handleStartEditUser(u))}
                            className="inline-flex items-center gap-1 rounded border border-[#734F2C] bg-[#FBF8F3] px-2.5 py-1 font-semibold text-[#5C3D21] hover:bg-[#EFE6D8]"
                          >
                            <Pencil className="h-3 w-3" />
                            {isEditing ? 'Tutup Sunting' : 'Sunting Akun & Izin'}
                          </button>
                          {u.id !== currentAccount.id &&
                            (confirmDeleteUserId === u.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleDeleteUser(u.id, u.name)}
                                  className="rounded bg-[#991B1B] px-2.5 py-1 font-semibold text-white"
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
                                disabled={isBusy}
                                onClick={() => setConfirmDeleteUserId(u.id)}
                                title="Hapus akun staf"
                                className="rounded border border-[#DC2626]/30 px-2 py-1 text-[#991B1B] hover:bg-[#FEF2F2]"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ))}
                        </div>
                      </div>

                      {isEditing && (
                        <form
                          onSubmit={(e) => handleSaveUserEdit(e, u)}
                          className="rounded-md border border-[#D4C5AF] bg-[#FBF8F3] p-3.5 space-y-3"
                        >
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <div>
                              <label className="block font-semibold text-[#4A5045]">Nama Lengkap & Jabatan</label>
                              <input
                                type="text"
                                required
                                value={editUserForm.name}
                                onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                                className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-[#4A5045]">Email Login</label>
                              <input
                                type="email"
                                required
                                value={editUserForm.email}
                                onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                                className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-[#4A5045]">
                                Kata Sandi Baru (Opsional)
                              </label>
                              <input
                                type="password"
                                minLength={6}
                                value={editUserForm.resetPassword}
                                onChange={(e) =>
                                  setEditUserForm({ ...editUserForm, resetPassword: e.target.value })
                                }
                                placeholder="Kosongkan jika tetap"
                                className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-1.5"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-[11px]">
                            <label className="flex items-center gap-1.5 font-medium">
                              <input
                                type="checkbox"
                                checked={editUserForm.permissions.canManageSettings}
                                onChange={(e) =>
                                  setEditUserForm({
                                    ...editUserForm,
                                    permissions: {
                                      ...editUserForm.permissions,
                                      canManageSettings: e.target.checked,
                                    },
                                  })
                                }
                              />
                              <span>Kelola Pengaturan &amp; Akses</span>
                            </label>
                            <label className="flex items-center gap-1.5 font-medium">
                              <input
                                type="checkbox"
                                checked={editUserForm.permissions.canAccessClinicalNotes}
                                onChange={(e) =>
                                  setEditUserForm({
                                    ...editUserForm,
                                    permissions: {
                                      ...editUserForm.permissions,
                                      canAccessClinicalNotes: e.target.checked,
                                    },
                                  })
                                }
                              />
                              <span>Akses Catatan Klinis</span>
                            </label>
                            <label className="flex items-center gap-1.5 font-medium">
                              <input
                                type="checkbox"
                                checked={editUserForm.permissions.canCorrectPayments}
                                onChange={(e) =>
                                  setEditUserForm({
                                    ...editUserForm,
                                    permissions: {
                                      ...editUserForm.permissions,
                                      canCorrectPayments: e.target.checked,
                                    },
                                  })
                                }
                              />
                              <span>Koreksi Pembayaran / Refund</span>
                            </label>
                            <label className="flex items-center gap-1.5 font-medium">
                              <input
                                type="checkbox"
                                checked={editUserForm.permissions.canManageStock}
                                onChange={(e) =>
                                  setEditUserForm({
                                    ...editUserForm,
                                    permissions: {
                                      ...editUserForm.permissions,
                                      canManageStock: e.target.checked,
                                    },
                                  })
                                }
                              />
                              <span>Kelola Stok &amp; Pembelian</span>
                            </label>
                            <label className="flex items-center gap-1.5 font-medium">
                              <input
                                type="checkbox"
                                checked={editUserForm.permissions.canExportSensitive}
                                onChange={(e) =>
                                  setEditUserForm({
                                    ...editUserForm,
                                    permissions: {
                                      ...editUserForm.permissions,
                                      canExportSensitive: e.target.checked,
                                    },
                                  })
                                }
                              />
                              <span>Ekspor Laporan Sensitif</span>
                            </label>
                            {u.id !== currentAccount.id && (
                              <label className="flex items-center gap-1.5 font-semibold text-[#1F241D]">
                                <input
                                  type="checkbox"
                                  checked={editUserForm.active}
                                  onChange={(e) =>
                                    setEditUserForm({ ...editUserForm, active: e.target.checked })
                                  }
                                />
                                <span>Status Akun Aktif</span>
                              </label>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="submit"
                              disabled={isBusy}
                              className="rounded bg-[#3D4F35] px-3.5 py-1.5 font-semibold text-white hover:bg-[#2F3E29] disabled:opacity-50"
                            >
                              {isBusy ? 'Menyimpan...' : 'Simpan Perubahan Akun'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingUserId(null)}
                              className="rounded border border-[#D4C5AF] bg-white px-3 py-1.5 font-medium"
                            >
                              Batal
                            </button>
                          </div>
                        </form>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#4A5045]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold">Peran:</span>
                          {STAFF_ROLES.map((sr) => {
                            const active = u.roles.includes(sr.role);
                            return (
                              <button
                                key={sr.role}
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleToggleUserRole(u, sr.role)}
                                className={`rounded border px-2 py-0.5 font-medium disabled:opacity-50 ${
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
                          <span className="font-semibold">Cabang:</span>
                          {data.branches.map((br) => {
                            const active = u.branchIds.includes(br.id);
                            return (
                              <button
                                key={br.id}
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleToggleUserBranch(u, br.id)}
                                className={`rounded border px-2 py-0.5 font-mono font-medium disabled:opacity-50 ${
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
                      </div>
                    </div>
                  );
                })}
            </div>

            <form onSubmit={handleCreateStaffUser} className="mt-5 border-t border-[#EFE8DC] pt-4 space-y-3">
              <div className="flex items-center gap-1.5 font-semibold text-[#2F3E29]">
                <UserPlus className="h-4 w-4" />
                Tambah Akun Login Staf Baru
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Nama Lengkap & Jabatan"
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                />
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="Email Login Staf"
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Kata Sandi Awal (min. 6 karakter)"
                  className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#4A5045]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold">Peran:</span>
                  {STAFF_ROLES.map((sr) => {
                    const active = newUserRoles.includes(sr.role);
                    return (
                      <button
                        key={sr.role}
                        type="button"
                        onClick={() => {
                          setNewUserRoles((prev) =>
                            prev.includes(sr.role)
                              ? prev.length > 1
                                ? prev.filter((r) => r !== sr.role)
                                : prev
                              : [...prev, sr.role]
                          );
                        }}
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
                  <span className="font-semibold">Cabang:</span>
                  {data.branches.map((br) => {
                    const active = newUserBranches.includes(br.id);
                    return (
                      <button
                        key={br.id}
                        type="button"
                        onClick={() => {
                          setNewUserBranches((prev) =>
                            prev.includes(br.id)
                              ? prev.length > 1
                                ? prev.filter((b) => b !== br.id)
                                : prev
                              : [...prev, br.id]
                          );
                        }}
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
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white hover:bg-[#2F3E29]"
              >
                <Plus className="h-3.5 w-3.5" />
                Buat Akun Staf
              </button>
            </form>
          </div>

          {changePasswordCard}
        </>
      )}
    </div>
  );
};
