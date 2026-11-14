import type {
  Branch,
  ClinicSettings,
  EducationalArticle,
  FaqItem,
  Holiday,
  Practitioner,
  Role,
  Room,
  RuntimeStatus,
  ServiceItem,
  UserPermissions,
} from '../types/clinic';

export interface DemoAccountSummary {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  branchIds: string[];
  linkedPatientId?: string;
  linkedPractitionerId?: string;
  permissions: UserPermissions;
}

export interface BootstrapPayload {
  runtime: RuntimeStatus;
  settings: ClinicSettings;
  branches: Branch[];
  rooms: Room[];
  holidays: Holiday[];
  services: ServiceItem[];
  practitioners: Practitioner[];
  articles: EducationalArticle[];
  faqs: FaqItem[];
  demoAccounts: DemoAccountSummary[];
}

export class ApiError extends Error {
  status: number;
  code: string;
  data: Record<string, unknown>;

  constructor(status: number, code: string, message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export type ApiScope = 'publik' | 'portal' | 'panel';

const STAFF_TOKEN_KEY = 'thibbuncare_staff_token';
const PATIENT_USER_KEY = 'thibbuncare_patient_user_id';

function readStorage(key: string): string {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage.getItem(key) || '' : '';
  } catch {
    return '';
  }
}

function writeStorage(key: string, value: string) {
  try {
    if (typeof window === 'undefined') return;
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage restriction in private iframes
  }
}

let staffToken = readStorage(STAFF_TOKEN_KEY);
let patientPortalUserId = readStorage(PATIENT_USER_KEY);
let activeApiScope: ApiScope = 'publik';

export function setActiveApiScope(scope: ApiScope) {
  activeApiScope = scope;
}

export function getStaffToken(): string {
  return staffToken;
}

export function setStaffToken(token: string) {
  staffToken = token;
  writeStorage(STAFF_TOKEN_KEY, token);
}

export function clearStaffToken() {
  staffToken = '';
  writeStorage(STAFF_TOKEN_KEY, '');
}

export function getPatientPortalUserId(): string {
  return patientPortalUserId;
}

export function setPatientPortalUserId(id: string) {
  patientPortalUserId = id;
  writeStorage(PATIENT_USER_KEY, id);
}

export function clearPatientPortalUserId() {
  patientPortalUserId = '';
  writeStorage(PATIENT_USER_KEY, '');
}

export async function apiRequest<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const isPortalUrl = url.startsWith('/api/portal/') && url !== '/api/portal/enter';
  if (!headers.has('Authorization') && !headers.has('x-demo-user-id')) {
    if (activeApiScope === 'portal' || isPortalUrl) {
      if (patientPortalUserId) {
        headers.set('x-demo-user-id', patientPortalUserId);
      }
    } else if (activeApiScope === 'panel' || url.startsWith('/api/auth/')) {
      if (staffToken) {
        headers.set('Authorization', `Bearer ${staffToken}`);
      }
    } else if (staffToken) {
      headers.set('Authorization', `Bearer ${staffToken}`);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      response.status,
      String(payload.error || 'REQUEST_FAILED'),
      String(payload.message || 'Permintaan gagal diproses oleh server.'),
      payload
    );
  }
  return payload as T;
}
