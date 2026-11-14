import { useEffect, useState } from 'react';
import { DemoBanner, type AppArea } from './components/DemoBanner';
import { InternalPanel } from './components/InternalPanel';
import { StaffLoginView } from './components/panel/StaffLoginView';
import { PatientPortal } from './components/PatientPortal';
import { PublicWebsite } from './components/PublicWebsite';
import {
  apiRequest,
  clearPatientPortalUserId,
  clearStaffToken,
  getPatientPortalUserId,
  getStaffToken,
  setActiveApiScope,
  setPatientPortalUserId,
  setStaffToken,
  type BootstrapPayload,
  type DemoAccountSummary,
} from './lib/api';

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [area, setAreaState] = useState<AppArea>('publik');
  const [staffUser, setStaffUser] = useState<DemoAccountSummary | null>(null);
  const [patientUserId, setPatientUserIdState] = useState<string>(getPatientPortalUserId());
  const [patientUser, setPatientUser] = useState<DemoAccountSummary | undefined>(undefined);

  const changeArea = (nextArea: AppArea) => {
    setActiveApiScope(nextArea);
    setAreaState(nextArea);
  };

  const loadBootstrap = async () => {
    try {
      const res = await apiRequest<BootstrapPayload>('/api/bootstrap');
      setBootstrap(res);
      setLoadError(null);
      return res;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat data awal ThibbunCare.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      setActiveApiScope('publik');
      await loadBootstrap();
      const existingToken = getStaffToken();
      if (existingToken) {
        try {
          const me = await apiRequest<{ user: DemoAccountSummary }>('/api/auth/me');
          setStaffUser(me.user);
        } catch {
          clearStaffToken();
          setStaffUser(null);
        }
      }
      const existingPatientId = getPatientPortalUserId();
      if (existingPatientId) {
        try {
          const pMe = await apiRequest<{ user: DemoAccountSummary }>('/api/portal/me', {
            headers: { 'x-demo-user-id': existingPatientId },
          });
          setPatientUser(pMe.user);
        } catch {
          clearPatientPortalUserId();
          setPatientUserIdState('');
          setPatientUser(undefined);
        }
      }
    };
    init();
  }, []);

  const handleStaffLoginSuccess = (token: string, user: DemoAccountSummary) => {
    setStaffToken(token);
    setStaffUser(user);
    changeArea('panel');
  };

  const handleLogoutStaff = async () => {
    try {
      if (getStaffToken()) {
        await apiRequest('/api/auth/logout', { method: 'POST' });
      }
    } catch {
      // Clear local session regardless of server response
    } finally {
      clearStaffToken();
      setStaffUser(null);
      changeArea('panel');
    }
  };

  const handleLogoutPatient = () => {
    clearPatientPortalUserId();
    setPatientUserIdState('');
    setPatientUser(undefined);
  };

  const handleOpenPortalWithUser = async (portalUserId: string) => {
    setPatientPortalUserId(portalUserId);
    setPatientUserIdState(portalUserId);
    try {
      const pMe = await apiRequest<{ user: DemoAccountSummary }>('/api/portal/me', {
        headers: { 'x-demo-user-id': portalUserId },
      });
      setPatientUser(pMe.user);
    } catch {
      setPatientUser(undefined);
    }
    await loadBootstrap();
    changeArea('portal');
  };

  if (loading && !bootstrap) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBF8F3] p-6 text-sm text-[#4A5045]">
        Memuat sistem klinik ThibbunCare...
      </div>
    );
  }

  if (loadError || !bootstrap) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBF8F3] p-6">
        <div className="max-w-md rounded-lg border border-[#DC2626]/30 bg-white p-6 text-sm text-[#991B1B]">
          <p className="font-semibold">Gagal terhubung ke server ThibbunCare</p>
          <p className="mt-1">{loadError || 'Data awal tidak tersedia.'}</p>
          <button
            type="button"
            onClick={loadBootstrap}
            className="mt-4 rounded bg-[#3D4F35] px-4 py-2 text-xs font-semibold text-white"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const activePatientAccount =
    patientUser ||
    (patientUserId ? bootstrap.demoAccounts.find((a) => a.id === patientUserId) : undefined);

  return (
    <div className="min-h-screen bg-[#FBF8F3] text-[#1F241D]">
      <DemoBanner
        runtime={bootstrap.runtime}
        area={area}
        onChangeArea={changeArea}
        staffUser={staffUser}
        patientUser={activePatientAccount}
        onLogoutStaff={handleLogoutStaff}
        onLogoutPatient={handleLogoutPatient}
      />

      {area === 'publik' && (
        <PublicWebsite
          bootstrap={bootstrap}
          onGoPortal={() => changeArea('portal')}
          onGoPanel={() => changeArea('panel')}
          onOpenPortalWithUser={handleOpenPortalWithUser}
        />
      )}

      {area === 'portal' && (
        <PatientPortal
          bootstrap={bootstrap}
          currentAccount={activePatientAccount}
          onSwitchToPatientAccount={(pid) => {
            void handleOpenPortalWithUser(pid);
          }}
          onOpenPortalWithUser={handleOpenPortalWithUser}
          onGoPublic={() => changeArea('publik')}
        />
      )}

      {area === 'panel' &&
        (staffUser ? (
          <InternalPanel
            bootstrap={bootstrap}
            currentAccount={staffUser}
            onLogout={handleLogoutStaff}
            onRefreshBootstrap={async () => {
              await loadBootstrap();
              try {
                const me = await apiRequest<{ user: DemoAccountSummary }>('/api/auth/me');
                setStaffUser(me.user);
              } catch {
                clearStaffToken();
                setStaffUser(null);
              }
            }}
          />
        ) : (
          <StaffLoginView
            bootstrap={bootstrap}
            onLoginSuccess={handleStaffLoginSuccess}
            onGoPublic={() => changeArea('publik')}
          />
        ))}
    </div>
  );
}

export default App;
