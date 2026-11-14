import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServerSupabaseAdmin, getServerSupabaseConfig } from './server/supabase.ts';
import {
  hashPassword,
  sanitizeUser,
  signStaffSessionToken,
  verifyPassword,
  verifyStaffSessionToken,
} from './server/auth.ts';
import {
  appendAudit,
  checkSlotConflict,
  getAvailableSlots,
  loadCloudStateFromSupabase,
  loadOrInitDemoDatabase,
  persistCloudStateToSupabase,
  persistDemoDatabase,
  resetDemoDatabase,
  type ClinicDatabase,
} from './server/store.ts';
import type {
  ClinicalRecord,
  FollowUpMessageType,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  MessageDispatchLog,
  Patient,
  PaymentMethod,
  PaymentRecord,
  ProductBatch,
  Reservation,
  Role,
  RuntimeStatus,
  UserAccount,
} from './src/types/clinic.ts';
import {
  FOLLOWUP_TEMPLATE_LABELS,
  addMinutesToTime,
  buildFollowUpWhatsappMessage,
  formatRupiah,
  todayJakartaISO,
} from './src/utils/format.ts';

let db: ClinicDatabase = loadOrInitDemoDatabase();
const supabaseCfg = getServerSupabaseConfig();
const supabaseAdmin = createServerSupabaseAdmin();

const signedAttachmentTokens = new Map<
  string,
  { attachmentId: string; visitId: string; expiresAt: number; issuedTo: string }
>();

function getRuntimeStatus(): RuntimeStatus {
  const waConfigured = Boolean(
    process.env.WHATSAPP_PROVIDER_API_URL && !process.env.WHATSAPP_PROVIDER_API_URL.includes('MY_')
  );
  const pgConfigured = Boolean(
    process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET &&
      !process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET.includes('MY_')
  );
  return {
    mode: supabaseCfg.configured ? 'supabase' : 'demo',
    supabaseConfigured: supabaseCfg.configured,
    whatsappProviderConfigured: waConfigured,
    paymentGatewayConfigured: pgConfigured,
    timezone: 'Asia/Jakarta',
    notice: supabaseCfg.configured
      ? 'Terhubung ke database cloud Supabase.'
      : 'Sistem operasional klinik ThibbunCare aktif.',
  };
}

const revokedTokens = new Set<string>();
const STAFF_ROLES: Role[] = ['admin', 'pemilik', 'resepsionis', 'praktisi', 'asisten', 'kasir', 'inventaris'];

function extractBearerToken(req: Request): string | undefined {
  const auth = req.header('authorization') || req.header('Authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) return undefined;
  return auth.slice(7).trim();
}

function resolveStaffFromBearer(req: Request): UserAccount | undefined {
  const token = extractBearerToken(req);
  if (!token || revokedTokens.has(token)) return undefined;
  const session = verifyStaffSessionToken(token);
  if (!session) return undefined;
  const user = db.users.find((u) => u.id === session.userId && u.active);
  if (!user || !user.roles.some((r) => STAFF_ROLES.includes(r))) return undefined;
  return user;
}

interface AuthedRequest extends Request {
  user?: UserAccount;
}

function resolveUserFromRequest(req: Request): UserAccount | undefined {
  const bearerUser = resolveStaffFromBearer(req);
  if (bearerUser) return bearerUser;

  const demoUserId = req.header('x-demo-user-id');
  if (demoUserId) {
    return db.users.find((u) => u.id === demoUserId && u.active);
  }
  return undefined;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = resolveUserFromRequest(req);
  if (!user) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Autentikasi diperlukan. Silakan pilih akun atau masuk terlebih dahulu.',
    });
    return;
  }
  req.user = user;
  next();
}

function hasAnyRole(user: UserAccount, roles: Role[]): boolean {
  if (user.roles.includes('admin') && roles.some((r) => STAFF_ROLES.includes(r))) {
    return true;
  }
  return user.roles.some((r) => roles.includes(r));
}

function hasBranchAccess(user: UserAccount, branchId?: string): boolean {
  if (!branchId) return true;
  if (user.roles.includes('admin')) return true;
  return user.branchIds.includes(branchId);
}

function hasManageSettingsAccess(user: UserAccount): boolean {
  if (!hasAnyRole(user, ['admin', 'pemilik'])) return false;
  return user.roles.includes('admin') || Boolean(user.permissions.canManageSettings);
}

function normalizePublicImageUrl(raw: unknown, fallback: string): string {
  const val = String(raw || '').trim();
  if (!val) return fallback;
  if (val.startsWith('/src/assets/images/')) {
    return val.replace('/src/assets/images/', '/images/');
  }
  return val;
}

function canAccessClinical(user: UserAccount, branchId?: string): boolean {
  if (!user.permissions.canAccessClinicalNotes) return false;
  if (!hasAnyRole(user, ['praktisi', 'asisten', 'pemilik'])) return false;
  if (branchId && !hasBranchAccess(user, branchId)) return false;
  return true;
}

function normalizePhoneDigits(raw: string): string {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (digits.startsWith('62')) return `0${digits.slice(2)}`;
  return digits;
}

function ensurePatientPortalAccount(patient: Patient): UserAccount {
  const existing = db.users.find(
    (u) => u.active && u.linkedPatientId === patient.id && u.roles.includes('pasien')
  );
  if (existing) return existing;
  const created: UserAccount = {
    id: `usr-pasien-${patient.id}`,
    name: `${patient.fullName} (Pasien · ${patient.patientNumber})`,
    email: `${patient.patientNumber.toLowerCase()}@pasien.thibbuncare.id`,
    roles: ['pasien'],
    branchIds: [patient.branchId],
    linkedPatientId: patient.id,
    permissions: {
      canAccessClinicalNotes: false,
      canCorrectPayments: false,
      canExportSensitive: false,
      canManageSettings: false,
      canManageStock: false,
    },
    active: true,
  };
  db.users.push(created);
  return created;
}

function recalcInvoiceTotals(inv: Invoice) {
  const netLines = inv.lines.reduce((acc, l) => acc + l.subtotal, 0);
  inv.totalAmount = Math.max(0, netLines - inv.discountAmount);

  const confirmedPaid = inv.payments
    .filter((p) => !p.isRefund && (p.method !== 'qris_manual' || p.qrisStatus === 'terkonfirmasi') && (p.method !== 'qris_terintegrasi' || p.qrisStatus === 'terkonfirmasi'))
    .reduce((acc, p) => acc + p.amount, 0);

  const refunded = inv.payments
    .filter((p) => p.isRefund)
    .reduce((acc, p) => acc + Math.abs(p.amount), 0);

  inv.paidAmount = Math.max(0, confirmedPaid);
  inv.refundedAmount = refunded;

  if (inv.status === 'dibatalkan') return;
  const effectivePaid = inv.paidAmount - inv.refundedAmount;
  if (effectivePaid <= 0) {
    inv.status = 'belum_bayar';
  } else if (effectivePaid < inv.totalAmount) {
    inv.status = 'dibayar_sebagian';
  } else {
    inv.status = 'lunas';
  }
}

function updateActiveCashSession(branchId: string, payment: PaymentRecord) {
  const session = db.cashSessions.find((s) => s.branchId === branchId && s.status === 'terbuka');
  if (!session) return;
  if (payment.isRefund) {
    session.refunds += Math.abs(payment.amount);
  } else if (payment.method === 'tunai') {
    session.cashReceived += payment.amount;
  } else if (payment.method === 'transfer') {
    session.transferReceived += payment.amount;
  } else if (payment.qrisStatus === 'terkonfirmasi') {
    session.qrisReceived += payment.amount;
  }
  session.expectedCashBalance =
    session.openingBalance + session.cashReceived - session.expenses - session.refunds;
}

let lastCloudSyncAt = 0;

export async function createApiApp(): Promise<express.Express> {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Sync Supabase cloud state (if configured) and auto-persist mutations before response completes
  app.use('/api', async (req, res, next) => {
    if (supabaseAdmin && Date.now() - lastCloudSyncAt > 1500) {
      const cloudDb = await loadCloudStateFromSupabase(supabaseAdmin);
      if (cloudDb) {
        db = cloudDb;
      } else if (lastCloudSyncAt === 0) {
        await persistCloudStateToSupabase(db, supabaseAdmin);
      }
      lastCloudSyncAt = Date.now();
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origJson = res.json.bind(res);
      res.json = ((body?: unknown) => {
        if (res.statusCode < 400) {
          persistDemoDatabase(db);
          if (supabaseAdmin) {
            void persistCloudStateToSupabase(db, supabaseAdmin).finally(() => {
              lastCloudSyncAt = Date.now();
              origJson(body);
            });
            return res;
          }
        }
        return origJson(body);
      }) as typeof res.json;
    }
    next();
  });

  // =========================================================================
  // 1. PUBLIC ENDPOINTS (Website Publik & Layar Antrean Publik)
  // =========================================================================

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, runtime: getRuntimeStatus(), supabaseAdminReady: Boolean(supabaseAdmin) });
  });

  app.get('/api/bootstrap', (_req, res) => {
    res.json({
      runtime: getRuntimeStatus(),
      settings: db.settings,
      branches: db.branches.filter((b) => b.active),
      rooms: db.rooms.filter((r) => r.active),
      holidays: db.holidays,
      services: db.services.filter((s) => db.settings.enableRuqyahService || !s.isSpiritualCompanion),
      practitioners: db.practitioners,
      articles: db.articles,
      faqs: db.faqs,
      demoAccounts: [],
    });
  });

  app.get('/api/portal/me', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!user.linkedPatientId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Akun portal pasien tidak valid.' });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  });

  // Public queue display — strictly NO patient name/phone/clinical details
  app.get('/api/public/queue', (req, res) => {
    const fallbackBranch = db.branches.find((b) => b.active) || db.branches[0];
    const branchId = String(req.query.branchId || fallbackBranch?.id || '');
    const items = db.queue
      .filter((q) => q.branchId === branchId && q.status !== 'selesai')
      .map((q) => ({
        id: q.id,
        queueNumber: q.queueNumber,
        roomName: q.roomName,
        status: q.status,
        calledAt: q.calledAt,
      }));
    res.json({ branchId, items });
  });

  app.get('/api/public/availability', (req, res) => {
    const fallbackBranch = db.branches.find((b) => b.active) || db.branches[0];
    const branchId = String(req.query.branchId || fallbackBranch?.id || '');
    const practitionerId = String(req.query.practitionerId || db.practitioners[0]?.id || '');
    const date = String(req.query.date || todayJakartaISO());
    const durationMinutes = Number(req.query.durationMinutes || 45);
    const roomId = req.query.roomId ? String(req.query.roomId) : undefined;
    const branch = db.branches.find((b) => b.id === branchId);
    if (!branch || !branch.active) {
      res.json({ branchId, practitionerId, date, durationMinutes, slots: [] });
      return;
    }
    const slots = getAvailableSlots(db, {
      branchId,
      practitionerId,
      roomId,
      date,
      durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 45,
    });
    res.json({ branchId, practitionerId, date, durationMinutes, slots });
  });

  // Self-service booking from Website Publik or Portal Pasien
  app.post('/api/public/book', (req, res) => {
    const {
      branchId,
      practitionerId,
      roomId,
      serviceIds,
      date,
      startTime,
      fullName,
      dateOfBirth,
      gender,
      phone,
      address,
      existingPatientId,
      notes,
      whatsappConsent,
    } = req.body ?? {};

    if (!branchId || !practitionerId || !Array.isArray(serviceIds) || serviceIds.length === 0 || !date || !startTime) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Cabang, praktisi, layanan, tanggal, dan jam wajib dipilih.' });
      return;
    }

    const branch = db.branches.find((b) => b.id === branchId && b.active);
    if (!branch) {
      res.status(400).json({ error: 'INVALID_BRANCH', message: 'Cabang yang dipilih tidak aktif atau tidak ditemukan.' });
      return;
    }

    const selectedServices = db.services.filter((s) => serviceIds.includes(s.id));
    if (selectedServices.length === 0) {
      res.status(400).json({ error: 'INVALID_SERVICE', message: 'Layanan tidak valid.' });
      return;
    }

    const totalDuration = selectedServices.reduce((acc, s) => acc + s.durationMinutes, 0);
    const endTime = addMinutesToTime(startTime, totalDuration);

    // Choose default room if room tracking enabled and none passed
    let chosenRoomId = roomId as string | undefined;
    if (db.settings.enableRoomTracking && !chosenRoomId) {
      const candidateRooms = db.rooms.filter((rm) => rm.branchId === branchId && rm.active);
      for (const rm of candidateRooms) {
        const c = checkSlotConflict(db, {
          branchId,
          practitionerId,
          roomId: rm.id,
          date,
          startTime,
          endTime,
        });
        if (!c.hasConflict) {
          chosenRoomId = rm.id;
          break;
        }
      }
      if (!chosenRoomId && candidateRooms.length > 0) {
        chosenRoomId = candidateRooms[0].id;
      }
    }

    const conflict = checkSlotConflict(db, {
      branchId,
      practitionerId,
      roomId: chosenRoomId,
      date,
      startTime,
      endTime,
    });

    if (conflict.hasConflict) {
      const alternatives = getAvailableSlots(db, {
        branchId,
        practitionerId,
        roomId: chosenRoomId,
        date,
        durationMinutes: totalDuration,
      }).filter((s) => s.available);
      res.status(409).json({
        error: 'SLOT_CONFLICT',
        message: conflict.reason,
        alternativeSlots: alternatives.slice(0, 6),
      });
      return;
    }

    let patient = existingPatientId
      ? db.patients.find((p) => p.id === existingPatientId)
      : db.patients.find(
          (p) =>
            (phone && p.phone === String(phone).trim()) ||
            (fullName &&
              dateOfBirth &&
              p.fullName.toLowerCase() === String(fullName).trim().toLowerCase() &&
              p.dateOfBirth === dateOfBirth)
        );

    if (!patient) {
      if (!fullName || !phone) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Nama lengkap dan nomor kontak wajib diisi.' });
        return;
      }
      const seq = db.sequences.patient++;
      patient = {
        id: `pat-${randomUUID().slice(0, 8)}`,
        patientNumber: `RM-2026-${String(seq).padStart(4, '0')}`,
        fullName: String(fullName).trim(),
        dateOfBirth: dateOfBirth || '1990-01-01',
        gender: gender === 'L' ? 'L' : 'P',
        phone: String(phone).trim(),
        address: String(address || 'Belum dilengkapi').trim(),
        branchId,
        createdAt: new Date().toISOString(),
      };
      db.patients.push(patient);
    }

    const rSeq = db.sequences.reservation++;
    const reservation: Reservation = {
      id: `res-${randomUUID().slice(0, 8)}`,
      reservationCode: `RSV-2026-${String(rSeq).padStart(4, '0')}`,
      branchId,
      patientId: patient.id,
      practitionerId,
      roomId: chosenRoomId,
      serviceIds,
      date,
      startTime,
      endTime,
      status: 'menunggu_konfirmasi',
      notes: notes ? String(notes) : undefined,
      rescheduleHistory: [],
      messageLogs: [],
      whatsappConsent: Boolean(whatsappConsent),
      createdAt: new Date().toISOString(),
    };

    db.reservations.unshift(reservation);
    const portalAccount = ensurePatientPortalAccount(patient);
    appendAudit(db, { id: patient.id, name: patient.fullName, roles: ['pasien'] }, {
      branchId,
      action: 'BUAT_RESERVASI_MANDIRI',
      objectType: 'Reservation',
      objectId: reservation.id,
      detail: `Reservasi ${reservation.reservationCode} dibuat untuk ${date} ${startTime}–${endTime} WIB.`,
    });

    res.status(201).json({ reservation, patient, portalUserId: portalAccount.id });
  });

  // Self-service portal access for ANY registered/booked patient without requiring admin provisioning
  app.post('/api/portal/enter', (req, res) => {
    const { patientNumberOrPhone, dateOfBirth } = req.body ?? {};
    const key = String(patientNumberOrPhone || '').trim();
    const dob = String(dateOfBirth || '').trim();
    if (!key || !dob) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Masukkan Nomor Pasien (RM-...) atau Nomor WhatsApp beserta Tanggal Lahir.',
      });
      return;
    }
    const keyLower = key.toLowerCase();
    const keyDigits = normalizePhoneDigits(key);
    const patient = db.patients.find((p) => {
      const matchNumber = p.patientNumber.toLowerCase() === keyLower;
      const matchPhone = keyDigits.length >= 6 && normalizePhoneDigits(p.phone) === keyDigits;
      return (matchNumber || matchPhone) && p.dateOfBirth === dob;
    });
    if (!patient) {
      res.status(404).json({
        error: 'PATIENT_NOT_FOUND',
        message: 'Data pasien dengan nomor/kontak dan tanggal lahir tersebut tidak ditemukan.',
      });
      return;
    }
    const portalUser = ensurePatientPortalAccount(patient);
    res.json({ user: sanitizeUser(portalUser), patient });
  });

  // =========================================================================
  // 1B. STAFF LOGIN & SESSION AUTHENTICATION (PANEL KLINIK)
  // =========================================================================

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    const emailNorm = String(email || '').trim().toLowerCase();
    const pass = String(password || '');
    if (!emailNorm || !pass) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Email dan kata sandi wajib diisi untuk masuk ke Panel Klinik.',
      });
      return;
    }

    const user = db.users.find((u) => u.email.toLowerCase() === emailNorm && u.active);
    if (!user || !user.roles.some((r) => STAFF_ROLES.includes(r))) {
      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Email atau kata sandi staf klinik tidak valid.',
      });
      return;
    }

    if (!verifyPassword(pass, user.passwordHash)) {
      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Email atau kata sandi staf klinik tidak valid.',
      });
      return;
    }

    const token = signStaffSessionToken(user.id);

    appendAudit(db, user, {
      action: 'LOGIN_PANEL_KLINIK',
      objectType: 'UserAccount',
      objectId: user.id,
      detail: `${user.name} masuk ke Panel Klinik melalui autentikasi email & kata sandi.`,
    });

    res.json({ token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = extractBearerToken(req);
    const user = resolveStaffFromBearer(req);
    if (token) {
      revokedTokens.add(token);
    }
    if (user) {
      appendAudit(db, user, {
        action: 'LOGOUT_PANEL_KLINIK',
        objectType: 'UserAccount',
        objectId: user.id,
        detail: `${user.name} keluar dari sesi Panel Klinik.`,
      });
    }
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = resolveStaffFromBearer(req);
    if (!user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Sesi login Panel Klinik tidak ditemukan atau sudah berakhir.',
      });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  });

  app.post('/api/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!user.roles.some((r) => STAFF_ROLES.includes(r))) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya akun staf yang memiliki kata sandi panel.' });
      return;
    }
    const { currentPassword, newPassword } = req.body ?? {};
    const cur = String(currentPassword || '');
    const next = String(newPassword || '');
    if (!verifyPassword(cur, user.passwordHash)) {
      res.status(401).json({
        error: 'INVALID_CURRENT_PASSWORD',
        message: 'Kata sandi saat ini tidak sesuai.',
      });
      return;
    }
    if (next.length < 6) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Kata sandi baru minimal 6 karakter.',
      });
      return;
    }
    user.passwordHash = hashPassword(next);
    appendAudit(db, user, {
      action: 'UBAH_KATA_SANDI',
      objectType: 'UserAccount',
      objectId: user.id,
      detail: `${user.name} memperbarui kata sandi masuk Panel Klinik.`,
    });
    res.json({ ok: true, message: 'Kata sandi berhasil diperbarui.' });
  });

  // =========================================================================
  // 2. AUTHENTICATED INTERNAL & PORTAL ENDPOINTS
  // =========================================================================

  app.get('/api/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: sanitizeUser(req.user!) });
  });

  // --- PASIEN ---
  app.get('/api/patients', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['pemilik', 'resepsionis', 'praktisi', 'asisten', 'kasir'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Akses daftar pasien ditolak untuk peran Anda.' });
      return;
    }
    const q = String(req.query.q || '').toLowerCase().trim();
    const branchFilter = req.query.branchId ? String(req.query.branchId) : undefined;
    const list = db.patients.filter((p) => {
      if (!hasBranchAccess(user, p.branchId)) return false;
      if (branchFilter && p.branchId !== branchFilter) return false;
      if (!q) return true;
      return (
        p.fullName.toLowerCase().includes(q) ||
        p.patientNumber.toLowerCase().includes(q) ||
        p.phone.includes(q)
      );
    });
    res.json({ patients: list });
  });

  app.get('/api/patients/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const patient = db.patients.find((p) => p.id === req.params.id);
    if (!patient) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Pasien tidak ditemukan.' });
      return;
    }
    if (hasAnyRole(user, ['pasien']) && user.roles.length === 1 && user.linkedPatientId !== patient.id) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Anda tidak memiliki akses ke profil pasien ini.' });
      return;
    }
    if (!hasAnyRole(user, ['pasien']) && !hasBranchAccess(user, patient.branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Pasien terdaftar di cabang di luar cakupan akun Anda.' });
      return;
    }
    const reservations = db.reservations.filter((r) => r.patientId === patient.id);
    const visits = db.visits.filter((v) => v.patientId === patient.id);
    const invoices = db.invoices.filter((i) => i.patientId === patient.id);
    res.json({ patient, reservations, visits, invoices });
  });

  app.post('/api/patients', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['pemilik', 'resepsionis'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya resepsionis atau pemilik yang dapat mendaftarkan pasien baru.' });
      return;
    }
    const {
      fullName,
      dateOfBirth,
      gender,
      phone,
      address,
      guardianName,
      guardianRelation,
      emergencyContactName,
      emergencyContactPhone,
      branchId,
      confirmDuplicate,
    } = req.body ?? {};

    if (!fullName || !dateOfBirth || !phone || !branchId) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Nama lengkap, tanggal lahir, nomor kontak, dan cabang wajib diisi.' });
      return;
    }
    if (!hasBranchAccess(user, branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Anda tidak memiliki akses ke cabang tersebut.' });
      return;
    }

    const duplicates = db.patients.filter(
      (p) =>
        p.phone.trim() === String(phone).trim() ||
        (p.fullName.trim().toLowerCase() === String(fullName).trim().toLowerCase() &&
          p.dateOfBirth === dateOfBirth)
    );

    if (duplicates.length > 0 && !confirmDuplicate) {
      res.status(409).json({
        error: 'POSSIBLE_DUPLICATE',
        message: 'Ditemukan pasien dengan nama & tanggal lahir atau nomor kontak yang sama.',
        duplicates,
      });
      return;
    }

    const seq = db.sequences.patient++;
    const patient: Patient = {
      id: `pat-${randomUUID().slice(0, 8)}`,
      patientNumber: `RM-2026-${String(seq).padStart(4, '0')}`,
      fullName: String(fullName).trim(),
      dateOfBirth,
      gender: gender === 'L' ? 'L' : 'P',
      phone: String(phone).trim(),
      address: String(address || '-').trim(),
      guardianName: guardianName ? String(guardianName).trim() : undefined,
      guardianRelation: guardianRelation ? String(guardianRelation).trim() : undefined,
      emergencyContactName: emergencyContactName ? String(emergencyContactName).trim() : undefined,
      emergencyContactPhone: emergencyContactPhone ? String(emergencyContactPhone).trim() : undefined,
      branchId,
      createdAt: new Date().toISOString(),
    };
    db.patients.unshift(patient);
    const portalAccount = ensurePatientPortalAccount(patient);
    appendAudit(db, user, {
      branchId,
      action: 'DAFTAR_PASIEN_BARU',
      objectType: 'Patient',
      objectId: patient.id,
      detail: `Pasien ${patient.patientNumber} (${patient.fullName}) terdaftar.`,
    });
    res.status(201).json({ patient, portalUserId: portalAccount.id });
  });

  app.patch('/api/patients/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['pemilik', 'resepsionis'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya resepsionis atau pemilik yang dapat mengubah data pasien.' });
      return;
    }
    const patient = db.patients.find((p) => p.id === req.params.id);
    if (!patient) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Pasien tidak ditemukan.' });
      return;
    }
    if (!hasBranchAccess(user, patient.branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Pasien terdaftar di cabang di luar cakupan akun Anda.' });
      return;
    }
    const {
      fullName,
      dateOfBirth,
      gender,
      phone,
      address,
      branchId,
      guardianName,
      guardianRelation,
      emergencyContactName,
      emergencyContactPhone,
    } = req.body ?? {};

    if (branchId !== undefined && String(branchId).trim()) {
      const nextBranchId = String(branchId).trim();
      const branchExists = db.branches.some((b) => b.id === nextBranchId);
      if (!branchExists) {
        res.status(400).json({ error: 'INVALID_BRANCH', message: 'Cabang tidak ditemukan.' });
        return;
      }
      if (!hasBranchAccess(user, nextBranchId)) {
        res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Anda tidak memiliki akses memindahkan pasien ke cabang tersebut.' });
        return;
      }
      patient.branchId = nextBranchId;
    }

    if (fullName !== undefined && String(fullName).trim()) patient.fullName = String(fullName).trim();
    if (dateOfBirth !== undefined && String(dateOfBirth).trim()) patient.dateOfBirth = String(dateOfBirth).trim();
    if (gender === 'L' || gender === 'P') patient.gender = gender;
    if (phone !== undefined && String(phone).trim()) patient.phone = String(phone).trim();
    if (address !== undefined) patient.address = String(address).trim() || '-';
    if (guardianName !== undefined) patient.guardianName = String(guardianName).trim() || undefined;
    if (guardianRelation !== undefined) patient.guardianRelation = String(guardianRelation).trim() || undefined;
    if (emergencyContactName !== undefined) {
      patient.emergencyContactName = String(emergencyContactName).trim() || undefined;
    }
    if (emergencyContactPhone !== undefined) {
      patient.emergencyContactPhone = String(emergencyContactPhone).trim() || undefined;
    }

    // Keep linked patient portal account synced with edited patient profile
    const linkedPortalUser = db.users.find(
      (u) => u.linkedPatientId === patient.id && u.roles.includes('pasien')
    );
    if (linkedPortalUser) {
      linkedPortalUser.name = `${patient.fullName} (Pasien · ${patient.patientNumber})`;
      linkedPortalUser.branchIds = [patient.branchId];
    }

    appendAudit(db, user, {
      branchId: patient.branchId,
      action: 'UBAH_DATA_PASIEN',
      objectType: 'Patient',
      objectId: patient.id,
      detail: `Profil pasien ${patient.patientNumber} (${patient.fullName}) diperbarui oleh ${user.name}.`,
    });

    res.json({ patient });
  });

  // --- RESERVASI & KALENDER ---
  app.get('/api/reservations', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const branchFilter = req.query.branchId ? String(req.query.branchId) : undefined;
    const list = db.reservations.filter((r) => {
      if (hasAnyRole(user, ['pasien']) && user.roles.length === 1) {
        return r.patientId === user.linkedPatientId;
      }
      if (!hasBranchAccess(user, r.branchId)) return false;
      if (branchFilter && r.branchId !== branchFilter) return false;
      if (hasAnyRole(user, ['praktisi']) && user.roles.length === 1 && user.linkedPractitionerId) {
        return r.practitionerId === user.linkedPractitionerId;
      }
      return true;
    });
    res.json({ reservations: list });
  });

  app.post('/api/reservations', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['pemilik', 'resepsionis', 'pasien'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Peran Anda tidak diizinkan membuat reservasi.' });
      return;
    }

    const {
      branchId,
      patientId,
      practitionerId,
      roomId,
      serviceIds,
      date,
      startTime,
      notes,
      whatsappConsent,
    } = req.body ?? {};

    const effectivePatientId =
      hasAnyRole(user, ['pasien']) && user.roles.length === 1 ? user.linkedPatientId : patientId;

    if (!branchId || !effectivePatientId || !practitionerId || !Array.isArray(serviceIds) || serviceIds.length === 0 || !date || !startTime) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Data reservasi belum lengkap.' });
      return;
    }
    if (!hasBranchAccess(user, branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Cabang berada di luar kewenangan akun.' });
      return;
    }

    const selectedServices = db.services.filter((s) => serviceIds.includes(s.id));
    if (selectedServices.length === 0) {
      res.status(400).json({ error: 'INVALID_SERVICE', message: 'Layanan tidak ditemukan.' });
      return;
    }
    const durationMinutes = selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0);
    const endTime = addMinutesToTime(startTime, durationMinutes);

    // Atomic slot check (no await inside check + push)
    const conflict = checkSlotConflict(db, {
      branchId,
      practitionerId,
      roomId,
      date,
      startTime,
      endTime,
    });

    if (conflict.hasConflict) {
      const alternativeSlots = getAvailableSlots(db, {
        branchId,
        practitionerId,
        roomId,
        date,
        durationMinutes,
      }).filter((s) => s.available);
      res.status(409).json({
        error: 'SLOT_CONFLICT',
        message: conflict.reason,
        alternativeSlots: alternativeSlots.slice(0, 6),
      });
      return;
    }

    const rSeq = db.sequences.reservation++;
    const reservation: Reservation = {
      id: `res-${randomUUID().slice(0, 8)}`,
      reservationCode: `RSV-2026-${String(rSeq).padStart(4, '0')}`,
      branchId,
      patientId: effectivePatientId,
      practitionerId,
      roomId,
      serviceIds,
      date,
      startTime,
      endTime,
      status: hasAnyRole(user, ['pasien']) && user.roles.length === 1 ? 'menunggu_konfirmasi' : 'terkonfirmasi',
      notes,
      rescheduleHistory: [],
      messageLogs: [],
      whatsappConsent: Boolean(whatsappConsent),
      createdAt: new Date().toISOString(),
    };
    db.reservations.unshift(reservation);

    appendAudit(db, user, {
      branchId,
      action: 'BUAT_RESERVASI',
      objectType: 'Reservation',
      objectId: reservation.id,
      detail: `Reservasi ${reservation.reservationCode} (${date} ${startTime}–${endTime} WIB).`,
    });

    res.status(201).json({ reservation });
  });

  app.patch('/api/reservations/:id/status', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const r = db.reservations.find((item) => item.id === req.params.id);
    if (!r) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Reservasi tidak ditemukan.' });
      return;
    }
    if (!hasBranchAccess(user, r.branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Akses cabang ditolak.' });
      return;
    }
    const { status, reason } = req.body ?? {};
    if (!['menunggu_konfirmasi', 'terkonfirmasi', 'check_in', 'batal', 'tidak_hadir'].includes(status)) {
      res.status(400).json({ error: 'INVALID_STATUS', message: 'Status reservasi tidak valid.' });
      return;
    }
    if ((status === 'batal' || status === 'tidak_hadir') && !reason) {
      res.status(400).json({ error: 'REASON_REQUIRED', message: 'Alasan pembatalan atau ketidakhadiran wajib dicatat.' });
      return;
    }
    r.status = status;
    if (reason) r.cancelReason = String(reason);
    appendAudit(db, user, {
      branchId: r.branchId,
      action: 'UBAH_STATUS_RESERVASI',
      objectType: 'Reservation',
      objectId: r.id,
      detail: `Status ${r.reservationCode} diubah ke ${status}${reason ? ` (Alasan: ${reason})` : ''}.`,
    });
    res.json({ reservation: r });
  });

  app.post('/api/reservations/:id/reschedule', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const r = db.reservations.find((item) => item.id === req.params.id);
    if (!r) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Reservasi tidak ditemukan.' });
      return;
    }
    if (!hasBranchAccess(user, r.branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Akses cabang ditolak.' });
      return;
    }
    const { date, startTime, practitionerId, roomId, reason } = req.body ?? {};
    if (!date || !startTime || !reason) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Tanggal baru, jam baru, dan alasan ubah jadwal wajib diisi.' });
      return;
    }
    const selectedServices = db.services.filter((s) => r.serviceIds.includes(s.id));
    const durationMinutes = selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0) || 45;
    const endTime = addMinutesToTime(startTime, durationMinutes);
    const targetPrac = practitionerId || r.practitionerId;
    const targetRoom = roomId !== undefined ? roomId : r.roomId;

    const conflict = checkSlotConflict(db, {
      branchId: r.branchId,
      practitionerId: targetPrac,
      roomId: targetRoom,
      date,
      startTime,
      endTime,
      excludeReservationId: r.id,
    });
    if (conflict.hasConflict) {
      const alternativeSlots = getAvailableSlots(db, {
        branchId: r.branchId,
        practitionerId: targetPrac,
        roomId: targetRoom,
        date,
        durationMinutes,
        excludeReservationId: r.id,
      }).filter((s) => s.available);
      res.status(409).json({
        error: 'SLOT_CONFLICT',
        message: conflict.reason,
        alternativeSlots: alternativeSlots.slice(0, 6),
      });
      return;
    }

    r.rescheduleHistory.push({
      changedAt: new Date().toISOString(),
      changedBy: user.name,
      fromDate: r.date,
      fromTime: r.startTime,
      toDate: date,
      toTime: startTime,
      reason: String(reason),
    });
    r.date = date;
    r.startTime = startTime;
    r.endTime = endTime;
    r.practitionerId = targetPrac;
    r.roomId = targetRoom;
    res.json({ reservation: r });
  });

  app.post('/api/reservations/:id/whatsapp-log', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const r = db.reservations.find((item) => item.id === req.params.id);
    if (!r) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Reservasi tidak ditemukan.' });
      return;
    }
    if (!hasBranchAccess(user, r.branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Akses cabang ditolak.' });
      return;
    }
    const { templateType, channel, idempotencyKey, consentRecorded } = req.body ?? {};
    if (idempotencyKey && r.messageLogs.some((m) => m.idempotencyKey === idempotencyKey)) {
      res.json({ reservation: r, idempotentReplay: true });
      return;
    }
    const runtime = getRuntimeStatus();
    if (channel === 'whatsapp_provider' && !runtime.whatsappProviderConfigured) {
      res.status(400).json({
        error: 'PROVIDER_NOT_CONFIGURED',
        message: 'Penyedia WhatsApp otomatis belum terhubung. Gunakan salin pesan atau draf WhatsApp.',
      });
      return;
    }
    if (!consentRecorded && !r.whatsappConsent) {
      res.status(400).json({
        error: 'CONSENT_REQUIRED',
        message: 'Persetujuan pengiriman pesan pasien harus dicatat terlebih dahulu.',
      });
      return;
    }
    const patient = db.patients.find((p) => p.id === r.patientId);
    r.whatsappConsent = true;
    r.messageLogs.unshift({
      id: `msg-${randomUUID().slice(0, 8)}`,
      templateType: templateType || 'konfirmasi',
      channel: channel || 'whatsapp_draft',
      recipientPhone: patient?.phone || '-',
      consentRecorded: true,
      status: channel === 'whatsapp_provider' ? 'terkirim' : 'disalin_atau_draft',
      sentAt: new Date().toISOString(),
      sentBy: user.name,
      idempotencyKey: idempotencyKey || randomUUID(),
    });
    res.json({ reservation: r });
  });

  // --- CHECK-IN & ANTREAN ---
  app.get('/api/queue', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const branchId = req.query.branchId ? String(req.query.branchId) : undefined;
    const list = db.queue.filter((q) => {
      if (!hasBranchAccess(user, q.branchId)) return false;
      if (branchId && q.branchId !== branchId) return false;
      return true;
    });
    res.json({ queue: list });
  });

  app.post('/api/queue/check-in', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['pemilik', 'resepsionis'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya resepsionis atau pemilik yang dapat melakukan check-in.' });
      return;
    }

    const { reservationId, patientId, branchId, practitionerId, roomId, serviceIds, isWalkIn } = req.body ?? {};
    let resObj: Reservation | undefined;
    if (reservationId) {
      resObj = db.reservations.find((r) => r.id === reservationId);
      if (!resObj) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Reservasi tidak ditemukan.' });
        return;
      }
      if (resObj.status === 'check_in') {
        const existingVisit = db.visits.find((v) => v.reservationId === resObj!.id);
        const existingQueue = db.queue.find((q) => q.reservationId === resObj!.id);
        res.json({ visit: existingVisit, queueItem: existingQueue, alreadyCheckedIn: true });
        return;
      }
    }

    const effBranch = resObj?.branchId || branchId;
    const effPatient = resObj?.patientId || patientId;
    const effPrac = resObj?.practitionerId || practitionerId;
    const effRoomId = resObj?.roomId || roomId;
    const effServices: string[] = resObj?.serviceIds || serviceIds || [];

    if (!effBranch || !effPatient || !effPrac || effServices.length === 0) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Data pasien, cabang, praktisi, dan layanan wajib diisi.' });
      return;
    }
    if (!hasBranchAccess(user, effBranch)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Cabang berada di luar akses Anda.' });
      return;
    }

    const patient = db.patients.find((p) => p.id === effPatient);
    if (!patient) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Nomor pasien tidak ditemukan.' });
      return;
    }

    if (resObj) {
      resObj.status = 'check_in';
    }

    const vSeq = db.sequences.visit++;
    const now = new Date();
    const visitDate = todayJakartaISO();
    const hhmm = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(now)
      .replace('.', ':');

    const visit = {
      id: `vis-${randomUUID().slice(0, 8)}`,
      visitNumber: `KNJ-2026-${String(vSeq).padStart(4, '0')}`,
      branchId: effBranch,
      patientId: effPatient,
      practitionerId: effPrac,
      roomId: effRoomId,
      reservationId: resObj?.id,
      isWalkIn: Boolean(isWalkIn || !resObj),
      serviceIds: effServices,
      visitDate,
      visitTime: hhmm,
      status: 'menunggu' as const,
      sharedSummaryApproved: false,
      followUpWhatsappConsent: Boolean(resObj?.whatsappConsent),
      followUpMessageLogs: [],
      createdAt: now.toISOString(),
    };
    db.visits.unshift(visit);

    // Prepare draft clinical record automatically
    const selectedSrv = db.services.filter((s) => effServices.includes(s.id));
    const prac = db.practitioners.find((p) => p.id === effPrac);
    db.clinicalRecords[visit.id] = {
      visitId: visit.id,
      patientId: effPatient,
      branchId: effBranch,
      status: 'draf',
      generalAssessment: {
        chiefComplaint: resObj?.notes || '',
        onsetAndCourse: '',
        relevantHistory: '',
        allergies: '',
        medicationsOrSupplements: '',
        measurements: {},
      },
      tcmObservation: {
        tongueColor: '',
        tongueCoating: '',
        tongueShape: '',
        pulseQuality: '',
        pulseDepth: '',
        practitionerPatternNote: '',
      },
      procedures: selectedSrv.map((s) => ({
        id: `proc-${randomUUID().slice(0, 6)}`,
        serviceId: s.id,
        serviceName: s.name,
        practitionerId: effPrac,
        practitionerName: prac?.name || 'Praktisi',
        performedAt: now.toISOString(),
        materialsUsed: [],
        observedResponse: '',
        requiresConsent: s.requiresConsent,
        status: 'terjadwal',
      })),
      consents: [],
      attachments: [],
      incidents: [],
      addendums: [],
      updatedAt: now.toISOString(),
    };

    const qSeq = db.sequences.queue++;
    const room = db.rooms.find((rm) => rm.id === effRoomId) || db.rooms.find((rm) => rm.branchId === effBranch);
    const queueItem = {
      id: `que-${randomUUID().slice(0, 8)}`,
      branchId: effBranch,
      visitId: visit.id,
      reservationId: resObj?.id,
      patientId: effPatient,
      queueNumber: `A-${String(qSeq).padStart(3, '0')}`,
      roomName: room?.name || 'Ruang Terapi Utama',
      practitionerId: effPrac,
      serviceSummary: selectedSrv.map((s) => s.category).join(', '),
      status: 'menunggu' as const,
      createdAt: now.toISOString(),
    };
    db.queue.push(queueItem);

    appendAudit(db, user, {
      branchId: effBranch,
      action: 'CHECK_IN_KUNJUNGAN',
      objectType: 'Visit',
      objectId: visit.id,
      detail: `Check-in ${patient.patientNumber} (${patient.fullName}) · Kunjungan ${visit.visitNumber} · Antrean ${queueItem.queueNumber}.`,
    });

    res.status(201).json({ visit, queueItem, reservation: resObj });
  });

  app.patch('/api/queue/:id/status', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const q = db.queue.find((item) => item.id === req.params.id);
    if (!q) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Antrean tidak ditemukan.' });
      return;
    }
    if (!hasBranchAccess(user, q.branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Akses cabang ditolak.' });
      return;
    }
    const { status } = req.body ?? {};
    if (!['menunggu', 'dipanggil', 'sedang_dilayani', 'selesai'].includes(status)) {
      res.status(400).json({ error: 'INVALID_STATUS', message: 'Status antrean tidak valid.' });
      return;
    }
    q.status = status;
    if (status === 'dipanggil') q.calledAt = new Date().toISOString();
    const visit = db.visits.find((v) => v.id === q.visitId);
    if (visit) {
      if (status === 'sedang_dilayani') visit.status = 'berlangsung';
      if (status === 'selesai' && visit.status === 'berlangsung') visit.status = 'selesai_terapi';
    }
    res.json({ queueItem: q, visit });
  });

  // --- KUNJUNGAN ---
  app.get('/api/visits', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const branchId = req.query.branchId ? String(req.query.branchId) : undefined;
    const list = db.visits
      .filter((v) => {
        if (hasAnyRole(user, ['pasien']) && user.roles.length === 1) {
          return v.patientId === user.linkedPatientId;
        }
        if (!hasBranchAccess(user, v.branchId)) return false;
        if (branchId && v.branchId !== branchId) return false;
        if (hasAnyRole(user, ['praktisi']) && user.roles.length === 1 && user.linkedPractitionerId) {
          return v.practitionerId === user.linkedPractitionerId;
        }
        return true;
      })
      .map((v) => ({
        ...v,
        sharedSummaryText:
          v.sharedSummaryApproved || canAccessClinical(user, v.branchId)
            ? v.sharedSummaryText
            : undefined,
      }));
    res.json({ visits: list });
  });

  app.patch('/api/visits/:id/follow-up', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const visit = db.visits.find((v) => v.id === req.params.id);
    if (!visit) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Kunjungan tidak ditemukan.' });
      return;
    }
    if (!canAccessClinical(user, visit.branchId)) {
      res.status(403).json({
        error: 'FORBIDDEN_CLINICAL',
        message: 'Akses ditolak: Izin catatan klinis diperlukan untuk mengubah tindak lanjut klinis.',
      });
      return;
    }
    const {
      followUpDate,
      followUpStatus,
      referralNote,
      sharedSummaryApproved,
      sharedSummaryText,
      followUpWhatsappConsent,
    } = req.body ?? {};
    if (followUpDate !== undefined) visit.followUpDate = followUpDate || undefined;
    if (followUpStatus !== undefined) visit.followUpStatus = followUpStatus;
    if (referralNote !== undefined) visit.referralNote = referralNote;
    if (sharedSummaryApproved !== undefined) visit.sharedSummaryApproved = Boolean(sharedSummaryApproved);
    if (sharedSummaryText !== undefined) visit.sharedSummaryText = sharedSummaryText;
    if (followUpWhatsappConsent !== undefined) {
      visit.followUpWhatsappConsent = Boolean(followUpWhatsappConsent);
    }
    appendAudit(db, user, {
      branchId: visit.branchId,
      action: 'SIMPAN_TINDAK_LANJUT',
      objectType: 'Visit',
      objectId: visit.id,
      detail: `Tindak lanjut ${visit.visitNumber} disimpan (Kontrol: ${visit.followUpDate || '-'}, Bagikan Ringkasan: ${
        visit.sharedSummaryApproved ? 'Disetujui' : 'Belum'
      }).`,
    });
    res.json({ visit });
  });

  app.post('/api/visits/:id/whatsapp-log', requireAuth, async (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['pemilik', 'resepsionis', 'praktisi', 'asisten'])) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Peran Anda tidak diizinkan mengirim pemberitahuan tindak lanjut ke WhatsApp.',
      });
      return;
    }
    const visit = db.visits.find((v) => v.id === req.params.id);
    if (!visit) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Kunjungan tidak ditemukan.' });
      return;
    }
    if (!hasBranchAccess(user, visit.branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Akses cabang ditolak.' });
      return;
    }
    if (
      hasAnyRole(user, ['praktisi']) &&
      user.roles.length === 1 &&
      user.linkedPractitionerId &&
      visit.practitionerId !== user.linkedPractitionerId
    ) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Kunjungan ini ditangani praktisi lain.',
      });
      return;
    }

    const {
      notificationType = 'tindak_lanjut_lengkap',
      channel = 'whatsapp_draft',
      idempotencyKey,
      consentRecorded,
      includeSharedSummaryDetail = true,
      customMessage,
    } = req.body ?? {};

    const validTypes: FollowUpMessageType[] = [
      'tindak_lanjut_lengkap',
      'ringkasan_dibagikan',
      'kontrol_lanjutan',
      'rujukan',
    ];
    if (!validTypes.includes(notificationType)) {
      res.status(400).json({ error: 'INVALID_TYPE', message: 'Jenis pemberitahuan tindak lanjut tidak valid.' });
      return;
    }

    if (!visit.followUpMessageLogs) {
      visit.followUpMessageLogs = [];
    }

    if (idempotencyKey) {
      const existing = visit.followUpMessageLogs.find((m) => m.idempotencyKey === idempotencyKey);
      if (existing) {
        res.json({
          visit,
          log: existing,
          idempotentReplay: true,
          message: 'Pengiriman ganda dicegah: pemberitahuan dengan kunci ini sudah tercatat sebelumnya.',
        });
        return;
      }
    }

    if (notificationType === 'ringkasan_dibagikan' && !visit.sharedSummaryApproved) {
      res.status(400).json({
        error: 'SUMMARY_NOT_APPROVED',
        message: 'Ringkasan kunjungan belum disetujui oleh praktisi untuk dibagikan ke pasien.',
      });
      return;
    }
    if (
      notificationType === 'tindak_lanjut_lengkap' &&
      includeSharedSummaryDetail &&
      visit.sharedSummaryText?.trim() &&
      !visit.sharedSummaryApproved
    ) {
      // If user explicitly asks for full summary detail while unapproved, reject to protect clinical privacy
      if (req.body?.requireApprovedSummary) {
        res.status(400).json({
          error: 'SUMMARY_NOT_APPROVED',
          message: 'Setujui ringkasan kunjungan terlebih dahulu sebelum menyertakannya di pesan WhatsApp.',
        });
        return;
      }
    }
    if (notificationType === 'kontrol_lanjutan' && !visit.followUpDate) {
      res.status(400).json({
        error: 'NO_FOLLOWUP_DATE',
        message: 'Tanggal jadwal kontrol lanjutan belum diisi pada kunjungan ini.',
      });
      return;
    }
    if (notificationType === 'rujukan' && !visit.referralNote?.trim()) {
      res.status(400).json({
        error: 'NO_REFERRAL_NOTE',
        message: 'Catatan rujukan / instruksi lanjutan belum diisi pada kunjungan ini.',
      });
      return;
    }
    if (
      notificationType === 'tindak_lanjut_lengkap' &&
      !visit.sharedSummaryApproved &&
      !visit.followUpDate &&
      !visit.referralNote?.trim()
    ) {
      res.status(400).json({
        error: 'NOTHING_TO_SEND',
        message:
          'Simpan minimal satu dari Ringkasan Dibagikan (disetujui), Tanggal Kontrol Lanjutan, atau Catatan Rujukan sebelum mengirim WhatsApp.',
      });
      return;
    }

    const runtime = getRuntimeStatus();
    if (channel === 'whatsapp_provider' && !runtime.whatsappProviderConfigured) {
      res.status(400).json({
        error: 'PROVIDER_NOT_CONFIGURED',
        message: 'Penyedia WhatsApp otomatis belum terhubung. Gunakan salin pesan atau draf WhatsApp.',
      });
      return;
    }

    if (!consentRecorded && !visit.followUpWhatsappConsent) {
      res.status(400).json({
        error: 'CONSENT_REQUIRED',
        message: 'Persetujuan pengiriman pemberitahuan WhatsApp tindak lanjut pasien harus dicatat terlebih dahulu.',
      });
      return;
    }

    const patient = db.patients.find((p) => p.id === visit.patientId);
    const branch = db.branches.find((b) => b.id === visit.branchId);
    const generatedMessage = buildFollowUpWhatsappMessage({
      notificationType,
      clinicName: db.settings.clinicName,
      branchName: branch?.name || 'Cabang Klinik',
      branchWhatsapp: branch?.whatsapp || db.settings.primaryWhatsapp,
      patientName: patient?.fullName || 'Pasien',
      visitNumber: visit.visitNumber,
      visitDate: visit.visitDate,
      followUpDate: visit.followUpDate,
      followUpStatus: visit.followUpStatus,
      referralNote: visit.referralNote,
      sharedSummaryApproved: visit.sharedSummaryApproved,
      sharedSummaryText: visit.sharedSummaryApproved ? visit.sharedSummaryText : undefined,
      includeSharedSummaryDetail: Boolean(includeSharedSummaryDetail),
    });

    const finalMessage =
      typeof customMessage === 'string' && customMessage.trim().length > 0
        ? customMessage.trim()
        : generatedMessage;

    let dispatchStatus: 'disalin_atau_draft' | 'terkirim' | 'gagal' =
      channel === 'whatsapp_provider' ? 'terkirim' : 'disalin_atau_draft';

    if (channel === 'whatsapp_provider' && runtime.whatsappProviderConfigured && process.env.WHATSAPP_PROVIDER_API_URL) {
      try {
        const providerHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (process.env.WHATSAPP_PROVIDER_API_KEY) {
          providerHeaders.Authorization = `Bearer ${process.env.WHATSAPP_PROVIDER_API_KEY}`;
        }
        const providerRes = await fetch(process.env.WHATSAPP_PROVIDER_API_URL, {
          method: 'POST',
          headers: providerHeaders,
          body: JSON.stringify({
            to: patient?.phone || '',
            message: finalMessage,
            referenceId: visit.visitNumber,
          }),
        });
        if (!providerRes.ok) {
          dispatchStatus = 'gagal';
        }
      } catch {
        dispatchStatus = 'gagal';
      }
    }

    visit.followUpWhatsappConsent = true;
    const logEntry: MessageDispatchLog = {
      id: `vmsg-${randomUUID().slice(0, 8)}`,
      templateType: notificationType,
      channel: channel === 'whatsapp_provider' ? 'whatsapp_provider' : 'whatsapp_draft',
      recipientPhone: patient?.phone || '-',
      consentRecorded: true,
      status: dispatchStatus,
      sentAt: new Date().toISOString(),
      sentBy: user.name,
      idempotencyKey: idempotencyKey || randomUUID(),
      messagePreview: finalMessage.slice(0, 260),
    };
    visit.followUpMessageLogs.unshift(logEntry);

    appendAudit(db, user, {
      branchId: visit.branchId,
      action: 'KIRIM_WA_TINDAK_LANJUT',
      objectType: 'Visit',
      objectId: visit.id,
      detail: `WA ${FOLLOWUP_TEMPLATE_LABELS[notificationType] || notificationType} (${dispatchStatus}) untuk ${visit.visitNumber} ke ${patient?.phone || '-'}.`,
    });

    if (dispatchStatus === 'gagal') {
      res.status(502).json({
        error: 'PROVIDER_DISPATCH_FAILED',
        message: 'Penyedia WhatsApp gagal mengirim pesan. Status kegagalan dicatat pada riwayat.',
        visit,
        log: logEntry,
      });
      return;
    }

    res.json({ visit, log: logEntry, messageText: finalMessage, idempotentReplay: false });
  });

  // --- CATATAN KLINIS, PERSETUJUAN & TINDAKAN (STRICTLY GUARDED!) ---
  app.get('/api/visits/:id/clinical', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const visit = db.visits.find((v) => v.id === req.params.id);
    if (!visit) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Kunjungan tidak ditemukan.' });
      return;
    }
    if (!canAccessClinical(user, visit.branchId)) {
      appendAudit(db, user, {
        branchId: visit.branchId,
        action: 'PENOLAKAN_AKSES_KLINIS',
        objectType: 'ClinicalRecord',
        objectId: visit.id,
        detail: `Upaya akses catatan klinis ditolak untuk ${user.name} (${user.roles.join(', ')}).`,
      });
      res.status(403).json({
        error: 'FORBIDDEN_CLINICAL_NOTES',
        message: 'Akses ditolak: Akun Anda tidak memiliki izin akses catatan klinis.',
      });
      return;
    }
    const record = db.clinicalRecords[visit.id];
    appendAudit(db, user, {
      branchId: visit.branchId,
      action: 'AKSES_CATATAN_KLINIS',
      objectType: 'ClinicalRecord',
      objectId: visit.id,
      detail: `Membuka catatan klinis kunjungan ${visit.visitNumber}.`,
    });
    res.json({ clinicalRecord: record, visit });
  });

  app.put('/api/visits/:id/clinical', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const visit = db.visits.find((v) => v.id === req.params.id);
    if (!visit) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Kunjungan tidak ditemukan.' });
      return;
    }
    if (!canAccessClinical(user, visit.branchId) || !hasAnyRole(user, ['praktisi', 'asisten'])) {
      res.status(403).json({
        error: 'FORBIDDEN_CLINICAL_WRITE',
        message: 'Hanya praktisi atau asisten dengan izin klinis yang dapat menyunting draf asesmen.',
      });
      return;
    }
    const record = db.clinicalRecords[visit.id];
    if (record.status === 'final') {
      res.status(400).json({
        error: 'RECORD_FINALIZED',
        message: 'Catatan klinis sudah berstatus Final. Gunakan fitur Koreksi Tambahan Bertanggal.',
      });
      return;
    }
    const { generalAssessment, tcmObservation } = req.body ?? {};
    if (generalAssessment) record.generalAssessment = { ...record.generalAssessment, ...generalAssessment };
    if (tcmObservation) record.tcmObservation = { ...record.tcmObservation, ...tcmObservation };
    record.updatedAt = new Date().toISOString();
    res.json({ clinicalRecord: record });
  });

  app.post('/api/visits/:id/consents', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const visit = db.visits.find((v) => v.id === req.params.id);
    if (!visit) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Kunjungan tidak ditemukan.' });
      return;
    }
    if (!canAccessClinical(user, visit.branchId) || !hasAnyRole(user, ['praktisi', 'asisten'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin klinis diperlukan untuk mencatat persetujuan tindakan.' });
      return;
    }
    const { formType, formVersion, serviceIds, decision, signerName, signerRole, notes } = req.body ?? {};
    if (!formType || !decision || !signerName || !Array.isArray(serviceIds) || serviceIds.length === 0) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Jenis formulir, layanan, keputusan, dan nama penanda tangan wajib diisi.',
      });
      return;
    }
    const record = db.clinicalRecords[visit.id];
    const consent = {
      id: `cns-${randomUUID().slice(0, 8)}`,
      formType,
      formVersion: formVersion || (formType === 'ruqyah_syariyyah' ? 'v2.1-RUQYAH' : 'v2.0-TERAPI'),
      serviceIds,
      decision,
      signerName: String(signerName).trim(),
      signerRole: signerRole === 'wali' ? ('wali' as const) : ('pasien' as const),
      recordedBy: user.name,
      recordedAt: new Date().toISOString(),
      notes,
    };
    record.consents.push(consent);
    record.updatedAt = new Date().toISOString();

    appendAudit(db, user, {
      branchId: visit.branchId,
      action: 'CATAT_PERSETUJUAN_TINDAKAN',
      objectType: 'Consent',
      objectId: consent.id,
      detail: `Persetujuan (${formType}, ${decision}) ditandatangani oleh ${consent.signerName} (${consent.signerRole}) untuk ${visit.visitNumber}.`,
    });

    res.status(201).json({ consent, clinicalRecord: record });
  });

  app.post('/api/visits/:id/procedures', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const visit = db.visits.find((v) => v.id === req.params.id);
    if (!visit) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Kunjungan tidak ditemukan.' });
      return;
    }
    if (!canAccessClinical(user, visit.branchId) || !hasAnyRole(user, ['praktisi', 'asisten'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin klinis diperlukan untuk mencatat tindakan.' });
      return;
    }
    const record = db.clinicalRecords[visit.id];
    if (record.status === 'final') {
      res.status(400).json({ error: 'RECORD_FINALIZED', message: 'Catatan sudah final.' });
      return;
    }

    const {
      procedureId,
      serviceId,
      bodyArea,
      observedResponse,
      materialsUsed,
      completeNow,
      idempotencyKey,
    } = req.body ?? {};

    // Idempotency guard for procedure submission + material stock deduction
    if (idempotencyKey && db.processedIdempotencyKeys[`proc:${idempotencyKey}`]) {
      res.json({
        clinicalRecord: record,
        idempotentReplay: true,
        message: 'Pengiriman ulang terdeteksi: tindakan dan mutasi stok hanya dicatat satu kali.',
      });
      return;
    }

    const service = db.services.find((s) => s.id === serviceId);
    if (!service) {
      res.status(400).json({ error: 'INVALID_SERVICE', message: 'Layanan tindakan tidak ditemukan.' });
      return;
    }

    // Check consent BEFORE completing a procedure that requires consent
    if (completeNow && service.requiresConsent) {
      const hasApprovedConsent = record.consents.some(
        (c) => c.decision === 'disetujui' && c.serviceIds.includes(service.id)
      );
      if (!hasApprovedConsent) {
        res.status(400).json({
          error: 'CONSENT_REQUIRED',
          message: `Tindakan "${service.name}" memerlukan formulir persetujuan (${service.consentFormType}) yang disetujui sebelum dapat diselesaikan.`,
        });
        return;
      }
    }

    // Validate materials & batches BEFORE mutating any stock
    const today = todayJakartaISO();
    const validatedMaterials: Array<{
      productId: string;
      batch: ProductBatch;
      quantity: number;
      unit: string;
    }> = [];

    if (Array.isArray(materialsUsed)) {
      for (const item of materialsUsed) {
        const qty = Number(item.quantity);
        if (!item.productId || !item.batchId || !Number.isFinite(qty) || qty <= 0) {
          res.status(400).json({ error: 'INVALID_MATERIAL', message: 'Jumlah bahan dan batch harus valid.' });
          return;
        }
        const product = db.products.find((p) => p.id === item.productId);
        const batch = db.batches.find((b) => b.id === item.batchId && b.branchId === visit.branchId);
        if (!product || !batch) {
          res.status(404).json({ error: 'BATCH_NOT_FOUND', message: 'Batch bahan pada cabang ini tidak ditemukan.' });
          return;
        }
        if (batch.expiryDate && batch.expiryDate < today) {
          res.status(400).json({
            error: 'BATCH_EXPIRED',
            message: `Batch ${batch.batchNumber} (${product.name}) sudah kedaluwarsa (${batch.expiryDate}) dan diblokir untuk pemakaian.`,
          });
          return;
        }
        if (qty > batch.quantityAvailable) {
          res.status(400).json({
            error: 'INSUFFICIENT_STOCK',
            message: `Stok batch ${batch.batchNumber} (${product.name}) tidak mencukupi (tersedia ${batch.quantityAvailable} ${product.unit}).`,
          });
          return;
        }
        validatedMaterials.push({ productId: product.id, batch, quantity: qty, unit: product.unit });
      }
    }

    // Deduct stock atomically
    for (const vm of validatedMaterials) {
      vm.batch.quantityAvailable -= vm.quantity;
      db.stockMutations.unshift({
        id: `mut-${randomUUID().slice(0, 8)}`,
        branchId: visit.branchId,
        productId: vm.productId,
        batchId: vm.batch.id,
        batchNumber: vm.batch.batchNumber,
        type: 'pemakaian_tindakan',
        quantityDelta: -vm.quantity,
        sourceRef: visit.visitNumber,
        reason: `Pemakaian tindakan ${service.name}`,
        actorName: user.name,
        createdAt: new Date().toISOString(),
        idempotencyKey,
      });
    }

    const prac = db.practitioners.find((p) => p.id === visit.practitionerId);
    let targetProc = procedureId ? record.procedures.find((p) => p.id === procedureId) : undefined;
    if (targetProc) {
      targetProc.bodyArea = bodyArea;
      targetProc.observedResponse = observedResponse || targetProc.observedResponse;
      targetProc.materialsUsed = [
        ...targetProc.materialsUsed,
        ...validatedMaterials.map((vm) => ({
          productId: vm.productId,
          batchId: vm.batch.id,
          batchNumber: vm.batch.batchNumber,
          quantity: vm.quantity,
          unit: vm.unit,
        })),
      ];
      if (completeNow) targetProc.status = 'selesai';
    } else {
      targetProc = {
        id: `proc-${randomUUID().slice(0, 6)}`,
        serviceId: service.id,
        serviceName: service.name,
        practitionerId: visit.practitionerId,
        practitionerName: prac?.name || user.name,
        performedAt: new Date().toISOString(),
        bodyArea,
        materialsUsed: validatedMaterials.map((vm) => ({
          productId: vm.productId,
          batchId: vm.batch.id,
          batchNumber: vm.batch.batchNumber,
          quantity: vm.quantity,
          unit: vm.unit,
        })),
        observedResponse: observedResponse || '-',
        requiresConsent: service.requiresConsent,
        status: completeNow ? 'selesai' : 'terjadwal',
        idempotencyKey,
      };
      record.procedures.push(targetProc);
    }

    if (!visit.serviceIds.includes(service.id)) {
      visit.serviceIds.push(service.id);
    }

    // Keep any existing unpaid invoice in sync when a new therapy is added
    const unpaidInvoice = db.invoices.find(
      (inv) => inv.visitId === visit.id && inv.status === 'belum_bayar'
    );
    if (unpaidInvoice && !unpaidInvoice.lines.some((l) => l.itemType === 'layanan' && l.refId === service.id)) {
      unpaidInvoice.lines.push({
        id: `il-${randomUUID().slice(0, 6)}`,
        itemType: 'layanan',
        refId: service.id,
        description: service.name,
        quantity: 1,
        unitPrice: service.price,
        subtotal: service.price,
      });
      recalcInvoiceTotals(unpaidInvoice);
    }

    if (idempotencyKey) {
      db.processedIdempotencyKeys[`proc:${idempotencyKey}`] = targetProc.id;
    }
    record.updatedAt = new Date().toISOString();

    appendAudit(db, user, {
      branchId: visit.branchId,
      action: 'CATAT_TINDAKAN_TERAPI',
      objectType: 'TherapyProcedure',
      objectId: targetProc.id,
      detail: `Tindakan ${service.name} pada ${visit.visitNumber} (${targetProc.status})${validatedMaterials.length ? `, bahan: ${validatedMaterials.map((m) => `${m.batch.batchNumber} (-${m.quantity})`).join(', ')}` : ''}.`,
    });

    res.status(201).json({ procedure: targetProc, clinicalRecord: record, idempotentReplay: false });
  });

  app.post('/api/visits/:id/procedures/:procId/complete', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const visit = db.visits.find((v) => v.id === req.params.id);
    if (!visit) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Kunjungan tidak ditemukan.' });
      return;
    }
    if (!canAccessClinical(user, visit.branchId) || !hasAnyRole(user, ['praktisi'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya praktisi berwenang yang dapat menyelesaikan tindakan.' });
      return;
    }
    const record = db.clinicalRecords[visit.id];
    const proc = record.procedures.find((p) => p.id === req.params.procId);
    if (!proc) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tindakan tidak ditemukan.' });
      return;
    }
    const service = db.services.find((s) => s.id === proc.serviceId);
    if (proc.requiresConsent || service?.requiresConsent) {
      const hasConsent = record.consents.some(
        (c) => c.decision === 'disetujui' && c.serviceIds.includes(proc.serviceId)
      );
      if (!hasConsent) {
        res.status(400).json({
          error: 'CONSENT_REQUIRED',
          message: `Persetujuan pasien/wali belum tercatat untuk tindakan "${proc.serviceName}". Lengkapi tab Persetujuan terlebih dahulu.`,
        });
        return;
      }
    }
    proc.status = 'selesai';
    if (req.body?.observedResponse) proc.observedResponse = String(req.body.observedResponse);
    record.updatedAt = new Date().toISOString();
    res.json({ procedure: proc, clinicalRecord: record });
  });

  app.post('/api/visits/:id/clinical/finalize', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const visit = db.visits.find((v) => v.id === req.params.id);
    if (!visit) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Kunjungan tidak ditemukan.' });
      return;
    }
    if (!canAccessClinical(user, visit.branchId) || !hasAnyRole(user, ['praktisi'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya praktisi berwenang yang dapat memfinalkan catatan klinis.' });
      return;
    }
    const record = db.clinicalRecords[visit.id];

    // Completeness check
    if (!record.generalAssessment.chiefComplaint.trim()) {
      res.status(400).json({
        error: 'INCOMPLETE_ASSESSMENT',
        message: 'Keluhan utama pada Asesmen Umum harus diisi sebelum menyelesaikan catatan.',
      });
      return;
    }
    for (const proc of record.procedures) {
      if (proc.requiresConsent) {
        const hasConsent = record.consents.some(
          (c) => c.decision === 'disetujui' && c.serviceIds.includes(proc.serviceId)
        );
        if (!hasConsent) {
          res.status(400).json({
            error: 'CONSENT_REQUIRED',
            message: `Tindakan "${proc.serviceName}" membutuhkan formulir persetujuan yang disetujui sebelum catatan dapat difinalkan.`,
          });
          return;
        }
      }
      if (proc.status !== 'selesai') {
        proc.status = 'selesai';
      }
    }

    record.status = 'final';
    record.finalizedAt = new Date().toISOString();
    record.finalizedBy = user.name;
    visit.status = 'selesai_terapi';
    const q = db.queue.find((item) => item.visitId === visit.id);
    if (q) q.status = 'selesai';

    // Automatically create a draft invoice for Kasir if none exists yet for this visit
    let autoInvoice = db.invoices.find(
      (inv) => inv.visitId === visit.id && inv.status !== 'dibatalkan'
    );
    if (!autoInvoice) {
      const lines: InvoiceLine[] = [];
      for (const sid of visit.serviceIds) {
        const srv = db.services.find((s) => s.id === sid);
        if (srv) {
          lines.push({
            id: `il-${randomUUID().slice(0, 6)}`,
            itemType: 'layanan',
            refId: srv.id,
            description: srv.name,
            quantity: 1,
            unitPrice: srv.price,
            subtotal: srv.price,
          });
        }
      }
      if (lines.length > 0) {
        const iSeq = db.sequences.invoice++;
        autoInvoice = {
          id: `inv-${randomUUID().slice(0, 8)}`,
          invoiceNumber: `INV-2026-${String(iSeq).padStart(4, '0')}`,
          branchId: visit.branchId,
          visitId: visit.id,
          patientId: visit.patientId,
          issuedAt: new Date().toISOString(),
          lines,
          discountAmount: 0,
          totalAmount: 0,
          paidAmount: 0,
          refundedAmount: 0,
          status: 'belum_bayar',
          payments: [],
          createdBy: user.name,
        };
        recalcInvoiceTotals(autoInvoice);
        db.invoices.unshift(autoInvoice);
      }
    }

    appendAudit(db, user, {
      branchId: visit.branchId,
      action: 'FINALISASI_CATATAN_KLINIS',
      objectType: 'ClinicalRecord',
      objectId: visit.id,
      detail: `Catatan klinis ${visit.visitNumber} difinalkan oleh ${user.name}${autoInvoice ? ` & tagihan ${autoInvoice.invoiceNumber} siap di Kasir` : ''}.`,
    });

    res.json({ clinicalRecord: record, visit, autoInvoice });
  });

  // Append-only dated correction on finalized clinical record
  app.post('/api/visits/:id/clinical/addendum', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const visit = db.visits.find((v) => v.id === req.params.id);
    if (!visit) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Kunjungan tidak ditemukan.' });
      return;
    }
    if (!canAccessClinical(user, visit.branchId) || !hasAnyRole(user, ['praktisi'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya praktisi berwenang yang dapat menambahkan koreksi catatan final.' });
      return;
    }
    const record = db.clinicalRecords[visit.id];
    if (record.status !== 'final') {
      res.status(400).json({ error: 'NOT_FINAL', message: 'Catatan masih draf, sunting langsung sebelum difinalkan.' });
      return;
    }
    const { reason, correctionText } = req.body ?? {};
    if (!reason || !correctionText) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Alasan koreksi dan isi koreksi wajib diisi.' });
      return;
    }
    const addendum = {
      id: `add-${randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
      authorId: user.id,
      authorName: user.name,
      reason: String(reason).trim(),
      correctionText: String(correctionText).trim(),
    };
    record.addendums.push(addendum);
    record.updatedAt = new Date().toISOString();

    appendAudit(db, user, {
      branchId: visit.branchId,
      action: 'KOREKSI_CATATAN_FINAL',
      objectType: 'ClinicalAddendum',
      objectId: addendum.id,
      detail: `Tambahan koreksi bertanggal pada ${visit.visitNumber}: ${addendum.reason}`,
    });

    res.status(201).json({ addendum, clinicalRecord: record });
  });

  app.post('/api/visits/:id/incidents', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const visit = db.visits.find((v) => v.id === req.params.id);
    if (!visit || !canAccessClinical(user, visit.branchId)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Akses ditolak untuk mencatat kejadian klinis.' });
      return;
    }
    const { occurredAt, description, actionTaken, followUpStatus } = req.body ?? {};
    if (!description || !actionTaken) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Uraian kejadian dan langkah yang diambil wajib diisi.' });
      return;
    }
    const record = db.clinicalRecords[visit.id];
    const incident = {
      id: `inc-${randomUUID().slice(0, 8)}`,
      occurredAt: occurredAt || new Date().toISOString(),
      description: String(description),
      actionTaken: String(actionTaken),
      recordedBy: user.name,
      followUpStatus: followUpStatus === 'tertangani' ? ('tertangani' as const) : ('dipantau' as const),
    };
    record.incidents.push(incident);
    res.status(201).json({ incident, clinicalRecord: record });
  });

  app.post('/api/visits/:id/attachments', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const visit = db.visits.find((v) => v.id === req.params.id);
    if (!visit || !canAccessClinical(user, visit.branchId)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Akses ditolak untuk mengunggah lampiran klinis.' });
      return;
    }
    const { fileName, category, note } = req.body ?? {};
    if (!fileName) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Nama berkas wajib diisi.' });
      return;
    }
    const record = db.clinicalRecords[visit.id];
    const att = {
      id: `att-${randomUUID().slice(0, 8)}`,
      fileName: String(fileName),
      category: String(category || 'Dokumen Pendukung'),
      uploadedBy: user.name,
      uploadedAt: new Date().toISOString(),
      storagePath: `private/${visit.id}/${String(fileName)}`,
      note: note ? String(note) : undefined,
    };
    record.attachments.push(att);
    res.status(201).json({ attachment: att, clinicalRecord: record });
  });

  // Temporary signed access URL for private clinical attachments
  app.get('/api/attachments/:id/signed-access', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    let foundRecord: ClinicalRecord | undefined;
    let foundAtt: ClinicalRecord['attachments'][number] | undefined;
    for (const rec of Object.values(db.clinicalRecords)) {
      const match = rec.attachments.find((a) => a.id === req.params.id);
      if (match) {
        foundRecord = rec;
        foundAtt = match;
        break;
      }
    }
    if (!foundRecord || !foundAtt) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Lampiran tidak ditemukan.' });
      return;
    }
    const isOwnerPatient = hasAnyRole(user, ['pasien']) && user.linkedPatientId === foundRecord.patientId;
    if (!canAccessClinical(user, foundRecord.branchId) && !isOwnerPatient) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Anda tidak berhak mengakses lampiran privat ini.' });
      return;
    }
    const token = randomUUID();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    signedAttachmentTokens.set(token, {
      attachmentId: foundAtt.id,
      visitId: foundRecord.visitId,
      expiresAt,
      issuedTo: user.id,
    });
    appendAudit(db, user, {
      branchId: foundRecord.branchId,
      action: 'AKSES_LAMPIRAN_PRIVAT',
      objectType: 'ClinicalAttachment',
      objectId: foundAtt.id,
      detail: `Tautan akses sementara (5 menit) diterbitkan untuk ${foundAtt.fileName}.`,
    });
    res.json({
      signedUrl: `/api/attachments/download/${token}`,
      expiresAt: new Date(expiresAt).toISOString(),
      fileName: foundAtt.fileName,
      storagePath: foundAtt.storagePath,
    });
  });

  // --- KASIR, INVOICE, PEMBAYARAN & SESI KAS ---
  app.get('/api/invoices', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const branchId = req.query.branchId ? String(req.query.branchId) : undefined;
    const list = db.invoices.filter((inv) => {
      if (hasAnyRole(user, ['pasien']) && user.roles.length === 1) {
        return inv.patientId === user.linkedPatientId;
      }
      if (!hasAnyRole(user, ['kasir', 'pemilik', 'resepsionis'])) return false;
      if (!hasBranchAccess(user, inv.branchId)) return false;
      if (branchId && inv.branchId !== branchId) return false;
      return true;
    });
    res.json({ invoices: list });
  });

  app.post('/api/invoices', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['kasir', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya kasir atau pemilik yang dapat menerbitkan invoice.' });
      return;
    }
    const { visitId, extraProductLines, discountAmount, discountReason } = req.body ?? {};
    const visit = db.visits.find((v) => v.id === visitId);
    if (!visit) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Kunjungan tidak ditemukan.' });
      return;
    }
    if (!hasBranchAccess(user, visit.branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Akses cabang ditolak.' });
      return;
    }

    const lines: InvoiceLine[] = [];
    for (const sid of visit.serviceIds) {
      const srv = db.services.find((s) => s.id === sid);
      if (srv) {
        lines.push({
          id: `il-${randomUUID().slice(0, 6)}`,
          itemType: 'layanan',
          refId: srv.id,
          description: srv.name,
          quantity: 1,
          unitPrice: srv.price, // snapshot harga saat transaksi
          subtotal: srv.price,
        });
      }
    }

    const today = todayJakartaISO();
    if (Array.isArray(extraProductLines)) {
      for (const pl of extraProductLines) {
        const qty = Number(pl.quantity || 1);
        const prod = db.products.find((p) => p.id === pl.productId);
        const batch = db.batches.find((b) => b.id === pl.batchId && b.branchId === visit.branchId);
        if (!prod || !batch || qty <= 0) {
          res.status(400).json({ error: 'INVALID_PRODUCT', message: 'Produk atau batch tidak valid.' });
          return;
        }
        if (batch.expiryDate && batch.expiryDate < today) {
          res.status(400).json({
            error: 'BATCH_EXPIRED',
            message: `Batch ${batch.batchNumber} (${prod.name}) telah kedaluwarsa dan tidak boleh dijual.`,
          });
          return;
        }
        if (qty > batch.quantityAvailable) {
          res.status(400).json({
            error: 'INSUFFICIENT_STOCK',
            message: `Stok ${prod.name} batch ${batch.batchNumber} tersisa ${batch.quantityAvailable} ${prod.unit}.`,
          });
          return;
        }
        batch.quantityAvailable -= qty;
        lines.push({
          id: `il-${randomUUID().slice(0, 6)}`,
          itemType: 'produk',
          refId: prod.id,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          description: prod.name,
          quantity: qty,
          unitPrice: prod.sellPrice,
          subtotal: prod.sellPrice * qty,
        });
        db.stockMutations.unshift({
          id: `mut-${randomUUID().slice(0, 8)}`,
          branchId: visit.branchId,
          productId: prod.id,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          type: 'penjualan',
          quantityDelta: -qty,
          sourceRef: visit.visitNumber,
          reason: 'Penjualan pada kasir',
          actorName: user.name,
          createdAt: new Date().toISOString(),
        });
      }
    }

    const disc = Math.max(0, Number(discountAmount || 0));
    if (disc > 0 && !user.permissions.canCorrectPayments && !hasAnyRole(user, ['pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN_DISCOUNT', message: 'Anda tidak memiliki izin memberikan diskon.' });
      return;
    }

    const iSeq = db.sequences.invoice++;
    const invoice: Invoice = {
      id: `inv-${randomUUID().slice(0, 8)}`,
      invoiceNumber: `INV-2026-${String(iSeq).padStart(4, '0')}`,
      branchId: visit.branchId,
      visitId: visit.id,
      patientId: visit.patientId,
      issuedAt: new Date().toISOString(),
      lines,
      discountAmount: disc,
      discountReason: disc > 0 ? String(discountReason || 'Potongan layanan') : undefined,
      totalAmount: 0,
      paidAmount: 0,
      refundedAmount: 0,
      status: 'belum_bayar',
      payments: [],
      createdBy: user.name,
    };
    recalcInvoiceTotals(invoice);
    db.invoices.unshift(invoice);

    appendAudit(db, user, {
      branchId: visit.branchId,
      action: 'BUAT_INVOICE',
      objectType: 'Invoice',
      objectId: invoice.id,
      detail: `Invoice ${invoice.invoiceNumber} senilai ${formatRupiah(invoice.totalAmount)} dibuat.`,
    });

    res.status(201).json({ invoice });
  });

  // Add herbal products or discount to an unpaid invoice (supports auto-generated invoices from clinical finalization)
  app.patch('/api/invoices/:id/items', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['kasir', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya kasir atau pemilik/admin yang dapat memperbarui item invoice.' });
      return;
    }
    const inv = db.invoices.find((i) => i.id === req.params.id);
    if (!inv) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice tidak ditemukan.' });
      return;
    }
    if (!hasBranchAccess(user, inv.branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Akses cabang ditolak.' });
      return;
    }
    if (inv.status !== 'belum_bayar' || inv.payments.length > 0) {
      res.status(400).json({ error: 'INVOICE_LOCKED', message: 'Item hanya dapat diubah pada invoice yang belum memiliki pembayaran.' });
      return;
    }

    const { extraProductLines, discountAmount, discountReason } = req.body ?? {};
    const today = todayJakartaISO();

    if (Array.isArray(extraProductLines) && extraProductLines.length > 0) {
      for (const pl of extraProductLines) {
        const qty = Number(pl.quantity || 1);
        const prod = db.products.find((p) => p.id === pl.productId);
        const batch = db.batches.find((b) => b.id === pl.batchId && b.branchId === inv.branchId);
        if (!prod || !batch || qty <= 0) {
          res.status(400).json({ error: 'INVALID_PRODUCT', message: 'Produk atau batch tidak valid.' });
          return;
        }
        if (batch.expiryDate && batch.expiryDate < today) {
          res.status(400).json({ error: 'BATCH_EXPIRED', message: `Batch ${batch.batchNumber} telah kedaluwarsa.` });
          return;
        }
        if (qty > batch.quantityAvailable) {
          res.status(400).json({ error: 'INSUFFICIENT_STOCK', message: `Stok ${prod.name} tidak mencukupi.` });
          return;
        }
        batch.quantityAvailable -= qty;
        inv.lines.push({
          id: `il-${randomUUID().slice(0, 6)}`,
          itemType: 'produk',
          refId: prod.id,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          description: prod.name,
          quantity: qty,
          unitPrice: prod.sellPrice,
          subtotal: prod.sellPrice * qty,
        });
        db.stockMutations.unshift({
          id: `mut-${randomUUID().slice(0, 8)}`,
          branchId: inv.branchId,
          productId: prod.id,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          type: 'penjualan',
          quantityDelta: -qty,
          sourceRef: inv.invoiceNumber,
          reason: 'Penambahan produk pada kasir',
          actorName: user.name,
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (discountAmount !== undefined) {
      const disc = Math.max(0, Number(discountAmount || 0));
      if (disc > 0 && !user.permissions.canCorrectPayments && !hasAnyRole(user, ['pemilik'])) {
        res.status(403).json({ error: 'FORBIDDEN_DISCOUNT', message: 'Izin diskon diperlukan.' });
        return;
      }
      inv.discountAmount = disc;
      inv.discountReason = disc > 0 ? String(discountReason || 'Potongan layanan') : undefined;
    }

    recalcInvoiceTotals(inv);
    appendAudit(db, user, {
      branchId: inv.branchId,
      action: 'PERBARUI_ITEM_INVOICE',
      objectType: 'Invoice',
      objectId: inv.id,
      detail: `Invoice ${inv.invoiceNumber} diperbarui menjadi total ${formatRupiah(inv.totalAmount)}.`,
    });
    res.json({ invoice: inv });
  });

  app.post('/api/invoices/:id/payments', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['kasir', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya kasir atau pemilik yang dapat mencatat pembayaran.' });
      return;
    }
    const inv = db.invoices.find((i) => i.id === req.params.id);
    if (!inv) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice tidak ditemukan.' });
      return;
    }
    if (!hasBranchAccess(user, inv.branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Akses cabang ditolak.' });
      return;
    }
    if (inv.status === 'dibatalkan') {
      res.status(400).json({ error: 'INVOICE_VOID', message: 'Invoice sudah dibatalkan.' });
      return;
    }

    const { amount, method, referenceNumber, receivedAt, idempotencyKey } = req.body ?? {};
    const idem = String(idempotencyKey || '');
    if (idem) {
      const existingPayment = inv.payments.find((p) => p.idempotencyKey === idem);
      if (existingPayment) {
        res.json({
          payment: existingPayment,
          invoice: inv,
          idempotentReplay: true,
          message: 'Pembayaran sudah tercatat sebelumnya (pencegahan duplikasi pengiriman ulang).',
        });
        return;
      }
    }

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Nominal pembayaran harus lebih dari Rp 0.' });
      return;
    }
    const validMethods: PaymentMethod[] = ['tunai', 'transfer', 'qris_manual', 'qris_terintegrasi'];
    if (!validMethods.includes(method)) {
      res.status(400).json({ error: 'INVALID_METHOD', message: 'Metode pembayaran tidak valid.' });
      return;
    }
    if (method === 'qris_terintegrasi' && !getRuntimeStatus().paymentGatewayConfigured) {
      res.status(400).json({
        error: 'GATEWAY_NOT_CONFIGURED',
        message: 'Penyedia QRIS terintegrasi belum dikonfigurasi. Gunakan QRIS Manual dengan konfirmasi kasir.',
      });
      return;
    }

    const remaining = inv.totalAmount - (inv.paidAmount - inv.refundedAmount);
    if (numAmount > remaining) {
      res.status(400).json({
        error: 'OVERPAYMENT',
        message: `Nominal melebihi sisa tagihan (${formatRupiah(remaining)}).`,
      });
      return;
    }

    const payment: PaymentRecord = {
      id: `pay-${randomUUID().slice(0, 8)}`,
      invoiceId: inv.id,
      amount: numAmount,
      method,
      referenceNumber: referenceNumber ? String(referenceNumber).trim() : undefined,
      qrisStatus: method === 'qris_manual' ? 'menunggu_konfirmasi' : method === 'qris_terintegrasi' ? 'menunggu_konfirmasi' : undefined,
      receivedAt: receivedAt || new Date().toISOString(),
      recordedBy: user.name,
      idempotencyKey: idem || randomUUID(),
    };

    inv.payments.push(payment);
    recalcInvoiceTotals(inv);
    if (method === 'tunai' || method === 'transfer') {
      updateActiveCashSession(inv.branchId, payment);
    }

    if (inv.status === 'lunas') {
      const visit = db.visits.find((v) => v.id === inv.visitId);
      if (visit) visit.status = 'selesai_tuntas';
    }

    appendAudit(db, user, {
      branchId: inv.branchId,
      action: 'CATAT_PEMBAYARAN',
      objectType: 'Payment',
      objectId: payment.id,
      detail: `Pembayaran ${formatRupiah(numAmount)} (${method}) pada ${inv.invoiceNumber}.`,
    });

    res.status(201).json({ payment, invoice: inv, idempotentReplay: false });
  });

  app.post('/api/invoices/:id/confirm-qris', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['kasir', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya kasir berwenang yang dapat mengonfirmasi QRIS.' });
      return;
    }
    const inv = db.invoices.find((i) => i.id === req.params.id);
    if (!inv) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice tidak ditemukan.' });
      return;
    }
    if (!hasBranchAccess(user, inv.branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Akses cabang ditolak.' });
      return;
    }
    const { paymentId } = req.body ?? {};
    const pay = inv.payments.find((p) => p.id === paymentId);
    if (!pay) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Data pembayaran tidak ditemukan.' });
      return;
    }
    if (pay.qrisStatus === 'terkonfirmasi') {
      res.json({ payment: pay, invoice: inv, idempotentReplay: true });
      return;
    }
    pay.qrisStatus = 'terkonfirmasi';
    recalcInvoiceTotals(inv);
    updateActiveCashSession(inv.branchId, pay);
    if (inv.status === 'lunas') {
      const visit = db.visits.find((v) => v.id === inv.visitId);
      if (visit) visit.status = 'selesai_tuntas';
    }
    appendAudit(db, user, {
      branchId: inv.branchId,
      action: 'KONFIRMASI_QRIS_MANUAL',
      objectType: 'Payment',
      objectId: pay.id,
      detail: `QRIS manual ${formatRupiah(pay.amount)} dikonfirmasi untuk ${inv.invoiceNumber}.`,
    });
    res.json({ payment: pay, invoice: inv });
  });

  app.post('/api/invoices/:id/refund', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!user.permissions.canCorrectPayments || !hasAnyRole(user, ['kasir', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin koreksi/pengembalian dana diperlukan.' });
      return;
    }
    const inv = db.invoices.find((i) => i.id === req.params.id);
    if (!inv || !hasBranchAccess(user, inv.branchId)) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice tidak ditemukan.' });
      return;
    }
    const { amount, reason, method, correctionOfPaymentId } = req.body ?? {};
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0 || !reason) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Nominal refund dan alasan wajib diisi.' });
      return;
    }
    const netPaid = inv.paidAmount - inv.refundedAmount;
    if (num > netPaid) {
      res.status(400).json({ error: 'INVALID_REFUND', message: `Nominal melebihi dana diterima (${formatRupiah(netPaid)}).` });
      return;
    }
    const refundRec: PaymentRecord = {
      id: `pay-ref-${randomUUID().slice(0, 6)}`,
      invoiceId: inv.id,
      amount: -num,
      isRefund: true,
      isCorrection: Boolean(correctionOfPaymentId),
      correctionOfPaymentId,
      reason: String(reason),
      method: method || 'tunai',
      receivedAt: new Date().toISOString(),
      recordedBy: user.name,
      idempotencyKey: randomUUID(),
    };
    inv.payments.push(refundRec);
    recalcInvoiceTotals(inv);
    updateActiveCashSession(inv.branchId, refundRec);

    appendAudit(db, user, {
      branchId: inv.branchId,
      action: 'PENGEMBALIAN_DANA_KOREKSI',
      objectType: 'Invoice',
      objectId: inv.id,
      detail: `Pengembalian dana ${formatRupiah(num)} pada ${inv.invoiceNumber}. Alasan: ${reason}`,
    });

    res.json({ refund: refundRec, invoice: inv });
  });

  app.post('/api/invoices/:id/void', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!user.permissions.canCorrectPayments || !hasAnyRole(user, ['kasir', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin pembatalan invoice diperlukan.' });
      return;
    }
    const inv = db.invoices.find((i) => i.id === req.params.id);
    if (!inv) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice tidak ditemukan.' });
      return;
    }
    if (!hasBranchAccess(user, inv.branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Akses cabang ditolak.' });
      return;
    }
    const { reason } = req.body ?? {};
    if (!reason) {
      res.status(400).json({ error: 'REASON_REQUIRED', message: 'Alasan pembatalan invoice wajib diisi.' });
      return;
    }
    inv.status = 'dibatalkan';
    inv.voidReason = String(reason);
    appendAudit(db, user, {
      branchId: inv.branchId,
      action: 'BATALKAN_INVOICE',
      objectType: 'Invoice',
      objectId: inv.id,
      detail: `Invoice ${inv.invoiceNumber} dibatalkan. Alasan: ${reason}`,
    });
    res.json({ invoice: inv });
  });

  app.get('/api/cash-sessions', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['kasir', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Akses sesi kas ditolak.' });
      return;
    }
    const list = db.cashSessions.filter((s) => hasBranchAccess(user, s.branchId));
    res.json({ cashSessions: list });
  });

  app.post('/api/cash-sessions/open', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['kasir', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Akses buka kas ditolak.' });
      return;
    }
    const { branchId, openingBalance } = req.body ?? {};
    if (!branchId || !hasBranchAccess(user, branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Cabang tidak valid.' });
      return;
    }
    const existing = db.cashSessions.find((s) => s.branchId === branchId && s.status === 'terbuka');
    if (existing) {
      res.status(400).json({ error: 'SESSION_ALREADY_OPEN', message: 'Masih ada sesi kas yang terbuka di cabang ini.' });
      return;
    }
    const openBal = Math.max(0, Number(openingBalance || 0));
    const session = {
      id: `cash-${randomUUID().slice(0, 8)}`,
      branchId,
      openedAt: new Date().toISOString(),
      openedBy: user.name,
      openingBalance: openBal,
      cashReceived: 0,
      transferReceived: 0,
      qrisReceived: 0,
      expenses: 0,
      refunds: 0,
      expectedCashBalance: openBal,
      status: 'terbuka' as const,
    };
    db.cashSessions.unshift(session);
    res.status(201).json({ cashSession: session });
  });

  app.post('/api/cash-sessions/:id/close', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['kasir', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Akses tutup kas ditolak.' });
      return;
    }
    const session = db.cashSessions.find((s) => s.id === req.params.id);
    if (!session || !hasBranchAccess(user, session.branchId)) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Sesi kas tidak ditemukan.' });
      return;
    }
    const { expenses, actualCashCount, notes } = req.body ?? {};
    const exp = Math.max(0, Number(expenses || 0));
    const actual = Number(actualCashCount);
    if (!Number.isFinite(actual)) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Jumlah kas fisik hasil hitung wajib diisi.' });
      return;
    }
    session.expenses = exp;
    session.expectedCashBalance =
      session.openingBalance + session.cashReceived - session.expenses - session.refunds;
    session.actualCashCount = actual;
    session.variance = actual - session.expectedCashBalance;
    session.notes = notes ? String(notes) : undefined;
    session.closedAt = new Date().toISOString();
    session.closedBy = user.name;
    session.status = 'ditutup';

    appendAudit(db, user, {
      branchId: session.branchId,
      action: 'TUTUP_KAS_HARIAN',
      objectType: 'CashSession',
      objectId: session.id,
      detail: `Tutup kas oleh ${user.name}. Saldo hitung ${formatRupiah(session.expectedCashBalance)}, fisik ${formatRupiah(actual)}, selisih ${formatRupiah(session.variance)}.`,
    });

    res.json({ cashSession: session });
  });

  // --- INVENTARIS, PEMASOK, PEMBELIAN & MUTASI BATCH ---
  app.get('/api/inventory', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['inventaris', 'pemilik', 'praktisi', 'kasir', 'asisten'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Akses inventaris ditolak.' });
      return;
    }
    const branchId = req.query.branchId ? String(req.query.branchId) : undefined;
    const batches = db.batches.filter(
      (b) => hasBranchAccess(user, b.branchId) && (!branchId || b.branchId === branchId)
    );
    const purchaseOrders = db.purchaseOrders.filter(
      (po) => hasBranchAccess(user, po.branchId) && (!branchId || po.branchId === branchId)
    );
    const mutations = db.stockMutations.filter(
      (m) => hasBranchAccess(user, m.branchId) && (!branchId || m.branchId === branchId)
    );
    res.json({
      suppliers: db.suppliers,
      products: db.products,
      batches,
      purchaseOrders,
      mutations,
    });
  });

  app.post('/api/inventory/purchase-orders', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['inventaris', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya petugas inventaris atau pemilik yang dapat membuat PO.' });
      return;
    }
    const { branchId, supplierId, lines } = req.body ?? {};
    if (!branchId || !supplierId || !Array.isArray(lines) || lines.length === 0) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Cabang, pemasok, dan daftar barang PO wajib diisi.' });
      return;
    }
    if (!hasBranchAccess(user, branchId)) {
      res.status(403).json({ error: 'FORBIDDEN_BRANCH', message: 'Cabang di luar kewenangan akun.' });
      return;
    }
    const seq = db.sequences.po++;
    const po = {
      id: `po-${randomUUID().slice(0, 8)}`,
      poNumber: `PO-2026-${String(seq).padStart(4, '0')}`,
      branchId,
      supplierId,
      orderDate: todayJakartaISO(),
      status: 'dipesan' as const,
      lines: lines.map((l: { productId: string; orderedQty: number; unitCost: number }) => ({
        productId: l.productId,
        orderedQty: Number(l.orderedQty),
        receivedQty: 0,
        unitCost: Number(l.unitCost),
      })),
      createdBy: user.name,
    };
    db.purchaseOrders.unshift(po);
    appendAudit(db, user, {
      branchId,
      action: 'BUAT_PESANAN_PEMBELIAN',
      objectType: 'PurchaseOrder',
      objectId: po.id,
      detail: `PO ${po.poNumber} dibuat oleh ${user.name}.`,
    });
    res.status(201).json({ purchaseOrder: po });
  });

  app.post('/api/inventory/purchase-orders/:id/receive', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['inventaris', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya petugas inventaris atau pemilik yang dapat menerima barang.' });
      return;
    }
    const po = db.purchaseOrders.find((p) => p.id === req.params.id);
    if (!po || !hasBranchAccess(user, po.branchId)) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Pesanan pembelian tidak ditemukan.' });
      return;
    }
    const { items, idempotencyKey } = req.body ?? {};
    if (idempotencyKey && db.processedIdempotencyKeys[`po-rcv:${idempotencyKey}`]) {
      res.json({ purchaseOrder: po, idempotentReplay: true });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Rincian penerimaan barang wajib diisi.' });
      return;
    }

    for (const item of items) {
      const qty = Number(item.receivedQty);
      if (!item.productId || !item.batchNumber || !Number.isFinite(qty) || qty <= 0) continue;
      const line = po.lines.find((l) => l.productId === item.productId);
      if (!line) continue;
      line.receivedQty += qty;

      let batch = db.batches.find(
        (b) =>
          b.productId === item.productId &&
          b.branchId === po.branchId &&
          b.batchNumber === String(item.batchNumber).trim()
      );
      if (!batch) {
        batch = {
          id: `bat-${randomUUID().slice(0, 8)}`,
          productId: item.productId,
          branchId: po.branchId,
          batchNumber: String(item.batchNumber).trim(),
          expiryDate: item.expiryDate || undefined,
          quantityAvailable: 0,
          receivedAt: new Date().toISOString(),
        };
        db.batches.push(batch);
      }
      batch.quantityAvailable += qty;

      db.stockMutations.unshift({
        id: `mut-${randomUUID().slice(0, 8)}`,
        branchId: po.branchId,
        productId: item.productId,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        type: 'penerimaan_pembelian',
        quantityDelta: qty,
        sourceRef: po.poNumber,
        reason: 'Penerimaan barang pembelian',
        actorName: user.name,
        createdAt: new Date().toISOString(),
      });
    }

    const allFull = po.lines.every((l) => l.receivedQty >= l.orderedQty);
    const anyReceived = po.lines.some((l) => l.receivedQty > 0);
    po.status = allFull ? 'diterima_penuh' : anyReceived ? 'diterima_sebagian' : po.status;
    if (idempotencyKey) db.processedIdempotencyKeys[`po-rcv:${idempotencyKey}`] = true;

    appendAudit(db, user, {
      branchId: po.branchId,
      action: 'TERIMA_BARANG_PO',
      objectType: 'PurchaseOrder',
      objectId: po.id,
      detail: `Penerimaan barang untuk ${po.poNumber} (Status: ${po.status}).`,
    });

    res.json({ purchaseOrder: po });
  });

  app.post('/api/inventory/mutations', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['inventaris', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya petugas inventaris atau pemilik yang dapat mencatat mutasi stok.' });
      return;
    }
    const { branchId, targetBranchId, batchId, type, quantity, reason, idempotencyKey } = req.body ?? {};
    if (idempotencyKey && db.processedIdempotencyKeys[`mut:${idempotencyKey}`]) {
      res.json({ idempotentReplay: true, message: 'Mutasi sudah diproses.' });
      return;
    }
    const batch = db.batches.find((b) => b.id === batchId && b.branchId === branchId);
    if (!batch) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Batch pada cabang asal tidak ditemukan.' });
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      res.status(400).json({ error: 'INVALID_QTY', message: 'Jumlah mutasi harus lebih dari 0.' });
      return;
    }

    const outgoingTypes = ['retur_pemasok', 'barang_rusak', 'mutasi_keluar_cabang', 'penjualan'];
    const isOutgoing = outgoingTypes.includes(type) || (type === 'penyesuaian' && req.body.direction === 'kurang');
    const today = todayJakartaISO();

    if (type === 'penjualan' && batch.expiryDate && batch.expiryDate < today) {
      res.status(400).json({ error: 'BATCH_EXPIRED', message: `Batch ${batch.batchNumber} sudah kedaluwarsa.` });
      return;
    }
    if (isOutgoing && qty > batch.quantityAvailable) {
      res.status(400).json({
        error: 'INSUFFICIENT_STOCK',
        message: `Pengeluaran (${qty}) melebihi stok batch tersedia (${batch.quantityAvailable}).`,
      });
      return;
    }

    const delta = isOutgoing ? -qty : qty;
    batch.quantityAvailable += delta;

    const mutation = {
      id: `mut-${randomUUID().slice(0, 8)}`,
      branchId,
      productId: batch.productId,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      type,
      quantityDelta: delta,
      sourceRef: `MUT-${today.replaceAll('-', '')}`,
      reason: reason || '-',
      actorName: user.name,
      createdAt: new Date().toISOString(),
      idempotencyKey,
    };
    db.stockMutations.unshift(mutation);

    if (type === 'mutasi_keluar_cabang' && targetBranchId) {
      let targetBatch = db.batches.find(
        (b) =>
          b.productId === batch.productId &&
          b.branchId === targetBranchId &&
          b.batchNumber === batch.batchNumber
      );
      if (!targetBatch) {
        targetBatch = {
          id: `bat-${randomUUID().slice(0, 8)}`,
          productId: batch.productId,
          branchId: targetBranchId,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          quantityAvailable: 0,
          receivedAt: new Date().toISOString(),
        };
        db.batches.push(targetBatch);
      }
      targetBatch.quantityAvailable += qty;
      db.stockMutations.unshift({
        id: `mut-${randomUUID().slice(0, 8)}`,
        branchId: targetBranchId,
        productId: batch.productId,
        batchId: targetBatch.id,
        batchNumber: targetBatch.batchNumber,
        type: 'mutasi_masuk_cabang',
        quantityDelta: qty,
        sourceRef: mutation.sourceRef,
        reason: `Transfer masuk dari cabang ${branchId}: ${reason || ''}`,
        actorName: user.name,
        createdAt: new Date().toISOString(),
      });
    }

    if (idempotencyKey) db.processedIdempotencyKeys[`mut:${idempotencyKey}`] = mutation.id;
    appendAudit(db, user, {
      branchId,
      action: 'MUTASI_STOK',
      objectType: 'StockMutation',
      objectId: mutation.id,
      detail: `Mutasi ${type} (${delta > 0 ? `+${delta}` : delta}) pada batch ${batch.batchNumber}.`,
    });
    res.status(201).json({ mutation, batch });
  });

  app.post('/api/inventory/products', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['inventaris', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya petugas inventaris atau pemilik yang dapat menambah produk.' });
      return;
    }
    const { sku, name, category, unit, buyPrice, sellPrice, minStock, supplierId, trackExpiry } = req.body ?? {};
    if (!sku || !name || !unit) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'SKU, nama produk, dan satuan wajib diisi.' });
      return;
    }
    const normSku = String(sku).trim().toUpperCase();
    if (db.products.some((p) => p.sku.toUpperCase() === normSku)) {
      res.status(409).json({ error: 'DUPLICATE_SKU', message: `SKU ${normSku} sudah terdaftar.` });
      return;
    }
    const prod = {
      id: `prd-${randomUUID().slice(0, 8)}`,
      sku: normSku,
      name: String(name).trim(),
      category: category || 'Produk Herbal',
      unit: String(unit).trim(),
      buyPrice: Math.max(0, Number(buyPrice || 0)),
      sellPrice: Math.max(0, Number(sellPrice || 0)),
      minStock: Math.max(0, Number(minStock || 5)),
      supplierId: supplierId || db.suppliers[0]?.id || '',
      trackExpiry: trackExpiry !== false,
    };
    db.products.push(prod);
    appendAudit(db, user, {
      action: 'TAMBAH_PRODUK',
      objectType: 'Product',
      objectId: prod.id,
      detail: `Produk baru ${prod.sku} (${prod.name}) ditambahkan.`,
    });
    res.status(201).json({ product: prod });
  });

  app.patch('/api/inventory/products/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['inventaris', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya petugas inventaris atau pemilik yang dapat memperbarui produk.' });
      return;
    }
    const prod = db.products.find((p) => p.id === req.params.id);
    if (!prod) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Produk tidak ditemukan.' });
      return;
    }
    const { sku, name, category, unit, buyPrice, sellPrice, minStock, supplierId, trackExpiry } = req.body ?? {};
    if (sku !== undefined && String(sku).trim()) {
      const nextSku = String(sku).trim().toUpperCase();
      if (db.products.some((p) => p.id !== prod.id && p.sku.toUpperCase() === nextSku)) {
        res.status(409).json({ error: 'DUPLICATE_SKU', message: `SKU ${nextSku} sudah digunakan produk lain.` });
        return;
      }
      prod.sku = nextSku;
    }
    if (name !== undefined && String(name).trim()) prod.name = String(name).trim();
    if (category === 'Produk Herbal' || category === 'Bahan Habis Pakai' || category === 'Perlengkapan') {
      prod.category = category;
    }
    if (unit !== undefined && String(unit).trim()) prod.unit = String(unit).trim();
    if (buyPrice !== undefined && Number.isFinite(Number(buyPrice))) prod.buyPrice = Math.max(0, Number(buyPrice));
    if (sellPrice !== undefined && Number.isFinite(Number(sellPrice))) prod.sellPrice = Math.max(0, Number(sellPrice));
    if (minStock !== undefined && Number.isFinite(Number(minStock))) prod.minStock = Math.max(0, Number(minStock));
    if (supplierId !== undefined) prod.supplierId = String(supplierId).trim();
    if (trackExpiry !== undefined) prod.trackExpiry = Boolean(trackExpiry);

    appendAudit(db, user, {
      action: 'UBAH_DATA_PRODUK',
      objectType: 'Product',
      objectId: prod.id,
      detail: `Data produk ${prod.sku} (${prod.name}) diperbarui oleh ${user.name}.`,
    });
    res.json({ product: prod });
  });

  app.post('/api/inventory/suppliers', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['inventaris', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya petugas inventaris atau pemilik yang dapat menambah pemasok.' });
      return;
    }
    const { name, contactName, phone, address } = req.body ?? {};
    if (!name || !phone) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Nama pemasok dan telepon wajib diisi.' });
      return;
    }
    const sup = {
      id: `sup-${randomUUID().slice(0, 8)}`,
      name: String(name).trim(),
      contactName: String(contactName || '-').trim(),
      phone: String(phone).trim(),
      address: String(address || '-').trim(),
    };
    db.suppliers.push(sup);
    appendAudit(db, user, {
      action: 'TAMBAH_PEMASOK',
      objectType: 'Supplier',
      objectId: sup.id,
      detail: `Pemasok baru ${sup.name} ditambahkan.`,
    });
    res.status(201).json({ supplier: sup });
  });

  app.patch('/api/inventory/suppliers/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['inventaris', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya petugas inventaris atau pemilik yang dapat memperbarui pemasok.' });
      return;
    }
    const sup = db.suppliers.find((s) => s.id === req.params.id);
    if (!sup) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Pemasok tidak ditemukan.' });
      return;
    }
    const { name, contactName, phone, address } = req.body ?? {};
    if (name !== undefined && String(name).trim()) sup.name = String(name).trim();
    if (contactName !== undefined) sup.contactName = String(contactName).trim() || '-';
    if (phone !== undefined && String(phone).trim()) sup.phone = String(phone).trim();
    if (address !== undefined) sup.address = String(address).trim() || '-';

    appendAudit(db, user, {
      action: 'UBAH_DATA_PEMASOK',
      objectType: 'Supplier',
      objectId: sup.id,
      detail: `Pemasok ${sup.name} diperbarui oleh ${user.name}.`,
    });
    res.json({ supplier: sup });
  });

  app.get('/api/attachments/download/:token', (req, res) => {
    const entry = signedAttachmentTokens.get(req.params.token);
    if (!entry || Date.now() > entry.expiresAt) {
      res.status(410).json({ error: 'TOKEN_EXPIRED', message: 'Tautan sementara telah kedaluwarsa atau tidak valid.' });
      return;
    }
    const rec = db.clinicalRecords[entry.visitId];
    const att = rec?.attachments.find((a) => a.id === entry.attachmentId);
    if (!att) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Berkas lampiran tidak ditemukan.' });
      return;
    }
    res.json({
      fileName: att.fileName,
      category: att.category,
      storagePath: att.storagePath,
      uploadedBy: att.uploadedBy,
      uploadedAt: att.uploadedAt,
      note: att.note || 'Dokumen lampiran klinis privat (terotorisasi tautan sementara).',
    });
  });

  // --- PORTAL PASIEN (STRICT PATIENT OWNERSHIP) ---
  app.get('/api/portal/overview', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!user.linkedPatientId) {
      res.status(403).json({ error: 'NOT_PATIENT_ACCOUNT', message: 'Akun ini tidak tertaut ke profil pasien.' });
      return;
    }
    const patient = db.patients.find((p) => p.id === user.linkedPatientId);
    const reservations = db.reservations.filter((r) => r.patientId === user.linkedPatientId);
    const visits = db.visits
      .filter((v) => v.patientId === user.linkedPatientId)
      .map((v) => ({
        ...v,
        // Never leak raw clinical assessment notes here; only approved summary!
        sharedSummaryText: v.sharedSummaryApproved ? v.sharedSummaryText : undefined,
      }));
    const invoices = db.invoices.filter((i) => i.patientId === user.linkedPatientId);
    res.json({ patient, reservations, visits, invoices });
  });

  app.get('/api/portal/visits/:visitId/summary', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const visit = db.visits.find((v) => v.id === req.params.visitId);
    if (!visit) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Kunjungan tidak ditemukan.' });
      return;
    }
    if (!user.linkedPatientId || visit.patientId !== user.linkedPatientId) {
      appendAudit(db, user, {
        branchId: visit.branchId,
        action: 'PENOLAKAN_AKSES_DOKUMEN_PASIEN',
        objectType: 'VisitSummary',
        objectId: visit.id,
        detail: `Akun ${user.name} mencoba mengakses ringkasan kunjungan milik pasien lain.`,
      });
      res.status(403).json({
        error: 'FORBIDDEN_DOCUMENT_OWNERSHIP',
        message: 'Akses ditolak: Anda tidak berhak membuka ringkasan kunjungan milik akun pasien lain.',
      });
      return;
    }
    if (!visit.sharedSummaryApproved) {
      res.status(403).json({
        error: 'SUMMARY_NOT_SHARED',
        message: 'Ringkasan kunjungan ini belum disetujui praktisi untuk dibagikan.',
      });
      return;
    }
    res.json({
      visitNumber: visit.visitNumber,
      visitDate: visit.visitDate,
      followUpDate: visit.followUpDate,
      referralNote: visit.referralNote,
      sharedSummaryText: visit.sharedSummaryText,
    });
  });

  app.get('/api/portal/invoices/:invoiceId', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const inv = db.invoices.find((i) => i.id === req.params.invoiceId);
    if (!inv) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Kuitansi tidak ditemukan.' });
      return;
    }
    if (!user.linkedPatientId || inv.patientId !== user.linkedPatientId) {
      res.status(403).json({
        error: 'FORBIDDEN_DOCUMENT_OWNERSHIP',
        message: 'Akses ditolak: Kuitansi ini milik akun pasien lain.',
      });
      return;
    }
    res.json({ invoice: inv });
  });

  app.patch('/api/portal/profile', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!user.linkedPatientId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Akun pasien diperlukan.' });
      return;
    }
    const patient = db.patients.find((p) => p.id === user.linkedPatientId);
    if (!patient) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Profil pasien tidak ditemukan.' });
      return;
    }
    const { phone, address, emergencyContactName, emergencyContactPhone } = req.body ?? {};
    if (phone) patient.phone = String(phone);
    if (address) patient.address = String(address);
    if (emergencyContactName !== undefined) patient.emergencyContactName = String(emergencyContactName);
    if (emergencyContactPhone !== undefined) patient.emergencyContactPhone = String(emergencyContactPhone);
    res.json({ patient });
  });

  // --- LAPORAN, EKSPOR CSV, AUDIT & PENGATURAN ---
  app.get('/api/reports', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['pemilik', 'kasir', 'inventaris', 'resepsionis'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Peran Anda tidak memiliki akses ke laporan.' });
      return;
    }
    const branchId = req.query.branchId ? String(req.query.branchId) : undefined;
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    const practitionerId = req.query.practitionerId ? String(req.query.practitionerId) : undefined;
    const serviceId = req.query.serviceId ? String(req.query.serviceId) : undefined;
    const paymentMethod = req.query.paymentMethod ? String(req.query.paymentMethod) : undefined;

    const inRange = (d: string) => {
      const datePart = d.slice(0, 10);
      if (from && datePart < from) return false;
      if (to && datePart > to) return false;
      return true;
    };

    const filteredReservations = db.reservations.filter(
      (r) =>
        hasBranchAccess(user, r.branchId) &&
        (!branchId || r.branchId === branchId) &&
        inRange(r.date) &&
        (!practitionerId || r.practitionerId === practitionerId) &&
        (!serviceId || r.serviceIds.includes(serviceId))
    );

    const filteredVisits = db.visits.filter(
      (v) =>
        hasBranchAccess(user, v.branchId) &&
        (!branchId || v.branchId === branchId) &&
        inRange(v.visitDate) &&
        (!practitionerId || v.practitionerId === practitionerId) &&
        (!serviceId || v.serviceIds.includes(serviceId))
    );

    const filteredInvoices = db.invoices.filter(
      (inv) =>
        hasBranchAccess(user, inv.branchId) &&
        (!branchId || inv.branchId === branchId) &&
        inRange(inv.issuedAt) &&
        (!paymentMethod || inv.payments.some((p) => p.method === paymentMethod))
    );

    const serviceUsage: Record<string, { name: string; count: number }> = {};
    for (const v of filteredVisits) {
      for (const sid of v.serviceIds) {
        const s = db.services.find((srv) => srv.id === sid);
        if (!s) continue;
        if (!serviceUsage[sid]) serviceUsage[sid] = { name: s.name, count: 0 };
        serviceUsage[sid].count += 1;
      }
    }

    const totalInvoiceValue = filteredInvoices
      .filter((i) => i.status !== 'dibatalkan')
      .reduce((acc, i) => acc + i.totalAmount, 0);
    const totalReceived = filteredInvoices.reduce((acc, i) => acc + i.paidAmount, 0);
    const totalRefunded = filteredInvoices.reduce((acc, i) => acc + i.refundedAmount, 0);
    const totalPending = filteredInvoices
      .filter((i) => i.status !== 'dibatalkan')
      .reduce((acc, i) => acc + Math.max(0, i.totalAmount - (i.paidAmount - i.refundedAmount)), 0);

    const cashSessions = db.cashSessions.filter(
      (cs) => hasBranchAccess(user, cs.branchId) && (!branchId || cs.branchId === branchId)
    );
    const totalExpenses = cashSessions.reduce((acc, cs) => acc + cs.expenses, 0);

    const today = todayJakartaISO();
    const batches = db.batches.filter(
      (b) => hasBranchAccess(user, b.branchId) && (!branchId || b.branchId === branchId)
    );
    const minStockAlerts = db.products.filter((p) => {
      const totalAvail = batches
        .filter((b) => b.productId === p.id && (!b.expiryDate || b.expiryDate >= today))
        .reduce((sum, b) => sum + b.quantityAvailable, 0);
      return totalAvail < p.minStock;
    });
    const expiringBatches = batches.filter((b) => {
      if (!b.expiryDate) return false;
      const diffDays =
        (new Date(`${b.expiryDate}T00:00:00+07:00`).getTime() -
          new Date(`${today}T00:00:00+07:00`).getTime()) /
        (1000 * 3600 * 24);
      return diffDays <= 45;
    });

    res.json({
      operasional: {
        totalVisits: filteredVisits.length,
        totalReservations: filteredReservations.length,
        checkedInCount: filteredReservations.filter((r) => r.status === 'check_in').length,
        cancelledCount: filteredReservations.filter((r) => r.status === 'batal').length,
        noShowCount: filteredReservations.filter((r) => r.status === 'tidak_hadir').length,
        followUpsScheduled: filteredVisits.filter((v) => Boolean(v.followUpDate)).length,
        serviceUsage: Object.values(serviceUsage),
      },
      keuangan: {
        totalInvoiceValue,
        totalReceived,
        totalRefunded,
        totalPending,
        totalExpenses,
        cashSessions,
      },
      inventaris: {
        batches,
        minStockAlerts,
        expiringBatches,
        purchaseOrders: db.purchaseOrders.filter((p) => hasBranchAccess(user, p.branchId)),
        mutations: db.stockMutations.filter((m) => hasBranchAccess(user, m.branchId)),
      },
    });
  });

  app.post('/api/reports/export-csv', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { reportType, branchId, from, to } = req.body ?? {};
    if (reportType === 'operasional_pasien' && !user.permissions.canExportSensitive) {
      res.status(403).json({
        error: 'FORBIDDEN_EXPORT',
        message: 'Ekspor data pasien/sensitif memerlukan izin khusus canExportSensitive.',
      });
      return;
    }
    if (!hasAnyRole(user, ['pemilik', 'kasir', 'inventaris'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Peran Anda tidak diizinkan mengekspor CSV.' });
      return;
    }

    const inRange = (d: string) => {
      const datePart = String(d || '').slice(0, 10);
      if (from && datePart < String(from)) return false;
      if (to && datePart > String(to)) return false;
      return true;
    };

    let csv = '';
    if (reportType === 'keuangan') {
      csv = 'No Invoice,Cabang,Tanggal Terbit,Total,Dibayar,Refund,Status\n';
      for (const inv of db.invoices.filter(
        (i) =>
          hasBranchAccess(user, i.branchId) &&
          (!branchId || i.branchId === branchId) &&
          inRange(i.issuedAt)
      )) {
        csv += `${inv.invoiceNumber},${inv.branchId},${inv.issuedAt},${inv.totalAmount},${inv.paidAmount},${inv.refundedAmount},${inv.status}\n`;
      }
    } else if (reportType === 'inventaris') {
      csv = 'Produk,Cabang,No Batch,Kedaluwarsa,Stok Tersedia\n';
      for (const b of db.batches.filter(
        (x) => hasBranchAccess(user, x.branchId) && (!branchId || x.branchId === branchId)
      )) {
        const p = db.products.find((pr) => pr.id === b.productId);
        csv += `"${p?.name || b.productId}",${b.branchId},${b.batchNumber},${b.expiryDate || '-'},${b.quantityAvailable}\n`;
      }
    } else {
      csv = 'No Kunjungan,Cabang,Tanggal,No Pasien,Status,Kontrol\n';
      for (const v of db.visits.filter(
        (x) =>
          hasBranchAccess(user, x.branchId) &&
          (!branchId || x.branchId === branchId) &&
          inRange(x.visitDate)
      )) {
        const pat = db.patients.find((p) => p.id === v.patientId);
        csv += `${v.visitNumber},${v.branchId},${v.visitDate},${pat?.patientNumber || '-'},${v.status},${v.followUpDate || '-'}\n`;
      }
    }

    appendAudit(db, user, {
      branchId: branchId ? String(branchId) : undefined,
      action: 'EKSPOR_CSV_LAPORAN',
      objectType: 'Report',
      objectId: String(reportType || 'operasional'),
      detail: `Ekspor CSV laporan (${reportType}) oleh ${user.name}.`,
    });

    res.json({ csv, fileName: `thibbuncare_${reportType || 'laporan'}_${todayJakartaISO()}.csv` });
  });

  app.get('/api/audit-logs', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya pemilik/manajer yang dapat meninjau log audit.' });
      return;
    }
    res.json({
      auditLogs: db.auditLogs.filter((a) => !a.branchId || hasBranchAccess(user, a.branchId)),
    });
  });

  app.get('/api/settings', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya admin atau pemilik berizin yang dapat membuka pengaturan.' });
      return;
    }
    res.json({
      settings: db.settings,
      branches: db.branches,
      rooms: db.rooms,
      services: db.services,
      holidays: db.holidays,
      users: db.users.map((u) => sanitizeUser(u)),
      runtime: getRuntimeStatus(),
    });
  });

  app.patch('/api/settings', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin pengaturan klinik diperlukan.' });
      return;
    }
    const { settings, branchUpdate, serviceUpdate } = req.body ?? {};
    if (settings) {
      db.settings = {
        ...db.settings,
        ...settings,
        retentionYears: Math.max(1, Math.min(25, Number(settings.retentionYears) || db.settings.retentionYears)),
      };
    }
    if (branchUpdate && branchUpdate.id) {
      const idx = db.branches.findIndex((b) => b.id === branchUpdate.id);
      if (idx >= 0) db.branches[idx] = { ...db.branches[idx], ...branchUpdate };
    }
    if (serviceUpdate && serviceUpdate.id) {
      const idx = db.services.findIndex((s) => s.id === serviceUpdate.id);
      if (idx >= 0) {
        const current = db.services[idx];
        const nextCategory = serviceUpdate.category ?? current.category;
        const nextRequiresConsent =
          serviceUpdate.requiresConsent !== undefined ? Boolean(serviceUpdate.requiresConsent) : current.requiresConsent;
        const nextConsentFormType = nextRequiresConsent
          ? serviceUpdate.consentFormType && serviceUpdate.consentFormType !== 'tidak_perlu'
            ? serviceUpdate.consentFormType
            : current.consentFormType !== 'tidak_perlu'
            ? current.consentFormType
            : nextCategory === 'Pendamping Spiritual'
            ? 'ruqyah_syariyyah'
            : nextCategory === 'Bekam' || nextCategory === 'Akupunktur'
            ? 'bekam_akupunktur'
            : 'terapi_umum'
          : 'tidak_perlu';
        db.services[idx] = {
          ...current,
          ...serviceUpdate,
          category: nextCategory,
          requiresConsent: nextRequiresConsent,
          consentFormType: nextConsentFormType,
          isSpiritualCompanion: nextCategory === 'Pendamping Spiritual',
        };
      }
    }
    appendAudit(db, user, {
      action: 'UBAH_PENGATURAN_KLINIK',
      objectType: 'ClinicSettings',
      objectId: 'global',
      detail: `Pengaturan klinik / cabang / layanan diperbarui oleh ${user.name}.`,
    });
    res.json({ settings: db.settings, branches: db.branches, services: db.services });
  });

  app.post('/api/users', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya admin atau pemilik berizin yang dapat membuat akun staf baru.' });
      return;
    }
    const { name, email, password, roles, branchIds, canAccessClinicalNotes } = req.body ?? {};
    const nameStr = String(name || '').trim();
    const emailNorm = String(email || '').trim().toLowerCase();
    const passStr = String(password || '');
    const selectedRoles: Role[] = Array.isArray(roles)
      ? roles.filter((r: unknown): r is Role => typeof r === 'string' && STAFF_ROLES.includes(r as Role))
      : [];
    const selectedBranches: string[] = Array.isArray(branchIds)
      ? branchIds.filter((b: unknown): b is string => typeof b === 'string' && db.branches.some((br) => br.id === b))
      : [];

    if (!nameStr || !emailNorm || !passStr) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Nama lengkap, email, dan kata sandi wajib diisi.' });
      return;
    }
    if (passStr.length < 6) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Kata sandi akun baru minimal 6 karakter.' });
      return;
    }
    if (selectedRoles.length === 0) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Pilih minimal satu peran untuk akun staf.' });
      return;
    }
    if (selectedBranches.length === 0) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Pilih minimal satu cabang kewenangan.' });
      return;
    }
    if (db.users.some((u) => u.email.toLowerCase() === emailNorm)) {
      res.status(409).json({ error: 'EMAIL_EXISTS', message: 'Email tersebut sudah terdaftar pada sistem.' });
      return;
    }

    const newStaff: UserAccount = {
      id: `usr-${randomUUID().slice(0, 8)}`,
      name: nameStr,
      email: emailNorm,
      passwordHash: hashPassword(passStr),
      roles: selectedRoles,
      branchIds: selectedBranches,
      permissions: {
        canAccessClinicalNotes: Boolean(canAccessClinicalNotes),
        canCorrectPayments: selectedRoles.includes('kasir') || selectedRoles.includes('pemilik') || selectedRoles.includes('admin'),
        canExportSensitive: (selectedRoles.includes('pemilik') || selectedRoles.includes('admin')) && Boolean(canAccessClinicalNotes),
        canManageSettings: selectedRoles.includes('pemilik') || selectedRoles.includes('admin'),
        canManageStock: selectedRoles.includes('inventaris') || selectedRoles.includes('pemilik') || selectedRoles.includes('admin'),
      },
      active: true,
    };
    db.users.push(newStaff);
    appendAudit(db, user, {
      action: 'TAMBAH_AKUN_STAF',
      objectType: 'UserAccount',
      objectId: newStaff.id,
      detail: `Akun staf baru ${newStaff.name} (${newStaff.email}) dibuat oleh ${user.name}.`,
    });
    res.status(201).json({ user: sanitizeUser(newStaff) });
  });

  app.patch('/api/users/:id/permissions', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya admin/pemilik berizin yang dapat mengubah hak akses staf.' });
      return;
    }
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Akun tidak ditemukan.' });
      return;
    }
    const { name, email, active, linkedPractitionerId, roles, branchIds, permissions, resetPassword } = req.body ?? {};
    if (name !== undefined && String(name).trim()) target.name = String(name).trim();
    if (email !== undefined && String(email).trim()) {
      const nextEmail = String(email).trim().toLowerCase();
      if (db.users.some((u) => u.id !== target.id && u.email.toLowerCase() === nextEmail)) {
        res.status(409).json({ error: 'EMAIL_EXISTS', message: 'Email sudah digunakan oleh akun lain.' });
        return;
      }
      target.email = nextEmail;
    }
    if (active !== undefined) {
      if (target.id === user.id && !Boolean(active)) {
        res.status(400).json({ error: 'CANNOT_DEACTIVATE_SELF', message: 'Tidak dapat menonaktifkan akun yang sedang dipakai login.' });
        return;
      }
      target.active = Boolean(active);
    }
    if (linkedPractitionerId !== undefined) {
      target.linkedPractitionerId = linkedPractitionerId || undefined;
    }
    if (Array.isArray(roles) && roles.length > 0) target.roles = roles;
    if (Array.isArray(branchIds) && branchIds.length > 0) target.branchIds = branchIds;
    if (permissions) target.permissions = { ...target.permissions, ...permissions };
    if (resetPassword) {
      const pwd = String(resetPassword);
      if (pwd.length < 6) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Kata sandi baru minimal 6 karakter.' });
        return;
      }
      target.passwordHash = hashPassword(pwd);
    }

    appendAudit(db, user, {
      action: 'UBAH_IZIN_AKUN',
      objectType: 'UserAccount',
      objectId: target.id,
      detail: `Akun ${target.name} diperbarui (aktif: ${target.active ? 'Ya' : 'Tidak'}, klinis: ${target.permissions.canAccessClinicalNotes ? 'Ya' : 'Tidak'}, cabang: ${target.branchIds.join(', ')}).`,
    });
    res.json({ user: sanitizeUser(target) });
  });

  app.delete('/api/users/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin admin/pemilik diperlukan untuk menghapus akun.' });
      return;
    }
    if (req.params.id === user.id) {
      res.status(400).json({ error: 'CANNOT_DELETE_SELF', message: 'Tidak dapat menghapus akun yang sedang aktif login.' });
      return;
    }
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Akun tidak ditemukan.' });
      return;
    }
    db.users = db.users.filter((u) => u.id !== req.params.id);
    appendAudit(db, user, {
      action: 'HAPUS_AKUN_STAF',
      objectType: 'UserAccount',
      objectId: target.id,
      detail: `Akun staf ${target.name} (${target.email}) dihapus oleh ${user.name}.`,
    });
    res.json({ ok: true });
  });

  app.post('/api/settings/branches', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin pengaturan cabang diperlukan.' });
      return;
    }
    const { code, name, address, phone, whatsapp, operatingHours } = req.body ?? {};
    if (!code || !name || !address) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Kode, nama cabang, dan alamat wajib diisi.' });
      return;
    }
    const branch = {
      id: `br-${randomUUID().slice(0, 6)}`,
      code: String(code).trim().toUpperCase(),
      name: String(name).trim(),
      address: String(address).trim(),
      phone: String(phone || '-').trim(),
      whatsapp: String(whatsapp || db.settings.primaryWhatsapp).trim(),
      operatingHours: String(operatingHours || 'Senin–Sabtu, 08:00–20:00 WIB').trim(),
      active: true,
    };
    db.branches.push(branch);
    user.branchIds = Array.from(new Set([...user.branchIds, branch.id]));
    appendAudit(db, user, {
      branchId: branch.id,
      action: 'TAMBAH_CABANG',
      objectType: 'Branch',
      objectId: branch.id,
      detail: `Cabang baru ${branch.name} (${branch.code}) ditambahkan.`,
    });
    res.status(201).json({ branch });
  });

  app.post('/api/settings/services', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin pengaturan layanan diperlukan.' });
      return;
    }
    const {
      code,
      name,
      category,
      description,
      durationMinutes,
      price,
      requiresConsent,
      consentFormType,
      activeBranchIds,
    } = req.body ?? {};
    if (!code || !name || !category) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Kode, nama layanan, dan kategori wajib diisi.' });
      return;
    }
    const service = {
      id: `srv-${randomUUID().slice(0, 6)}`,
      code: String(code).trim().toUpperCase(),
      name: String(name).trim(),
      category,
      description: String(description || 'Layanan terapi klinik sesuai standar prosedur.').trim(),
      durationMinutes: Math.max(10, Number(durationMinutes) || 45),
      price: Math.max(0, Number(price) || 150000),
      requiresConsent: Boolean(requiresConsent),
      consentFormType: requiresConsent ? consentFormType || 'terapi_umum' : 'tidak_perlu',
      isSpiritualCompanion: category === 'Pendamping Spiritual',
      activeBranchIds:
        Array.isArray(activeBranchIds) && activeBranchIds.length > 0
          ? activeBranchIds
          : db.branches.map((b) => b.id),
    };
    db.services.push(service);
    appendAudit(db, user, {
      action: 'TAMBAH_LAYANAN_BARU',
      objectType: 'ServiceItem',
      objectId: service.id,
      detail: `Layanan ${service.code} (${service.name}) ditambahkan dengan tarif ${formatRupiah(service.price)}.`,
    });
    res.status(201).json({ service });
  });

  app.post('/api/settings/rooms', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin pengaturan ruangan diperlukan.' });
      return;
    }
    const { branchId, name, type } = req.body ?? {};
    if (!branchId || !name) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Cabang dan nama ruangan wajib diisi.' });
      return;
    }
    const room = {
      id: `rm-${randomUUID().slice(0, 6)}`,
      branchId: String(branchId),
      name: String(name).trim(),
      type: String(type || 'Terapi Umum').trim(),
      active: true,
    };
    db.rooms.push(room);
    appendAudit(db, user, {
      branchId: room.branchId,
      action: 'TAMBAH_RUANGAN',
      objectType: 'Room',
      objectId: room.id,
      detail: `Ruangan ${room.name} (${room.type}) ditambahkan.`,
    });
    res.status(201).json({ room });
  });

  app.patch('/api/settings/rooms/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin pengaturan ruangan diperlukan.' });
      return;
    }
    const room = db.rooms.find((rm) => rm.id === req.params.id);
    if (!room) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Ruangan tidak ditemukan.' });
      return;
    }
    const { active, name, type } = req.body ?? {};
    if (active !== undefined) room.active = Boolean(active);
    if (name !== undefined && String(name).trim()) room.name = String(name).trim();
    if (type !== undefined && String(type).trim()) room.type = String(type).trim();
    appendAudit(db, user, {
      branchId: room.branchId,
      action: 'PERBARUI_RUANGAN',
      objectType: 'Room',
      objectId: room.id,
      detail: `Ruangan ${room.name} (${room.type}, aktif: ${room.active ? 'Ya' : 'Tidak'}) diperbarui.`,
    });
    res.json({ room });
  });

  app.post('/api/settings/holidays', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin pengaturan hari libur diperlukan.' });
      return;
    }
    const { branchId, date, label } = req.body ?? {};
    if (!date || !label) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Tanggal dan keterangan libur wajib diisi.' });
      return;
    }
    const holiday = {
      id: `hol-${randomUUID().slice(0, 6)}`,
      branchId: branchId || 'ALL',
      date: String(date),
      label: String(label).trim(),
    };
    db.holidays.push(holiday);
    res.status(201).json({ holiday });
  });

  app.delete('/api/settings/holidays/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin pengaturan hari libur diperlukan.' });
      return;
    }
    db.holidays = db.holidays.filter((h) => h.id !== req.params.id);
    res.json({ ok: true });
  });

  // =========================================================================
  // 2B. ADMIN CENTRAL MANAGEMENT ENDPOINTS (ALL MODULES & PUBLIC CONTENT)
  // =========================================================================

  app.get('/api/admin/overview', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya Admin atau Pemilik berizin yang dapat membuka Pusat Admin.' });
      return;
    }
    const clinicalList = Object.values(db.clinicalRecords);
    const today = todayJakartaISO();
    const lowStockCount = db.products.filter((p) => {
      const avail = db.batches
        .filter((b) => b.productId === p.id && (!b.expiryDate || b.expiryDate >= today))
        .reduce((s, b) => s + b.quantityAvailable, 0);
      return avail < p.minStock;
    }).length;

    res.json({
      runtime: getRuntimeStatus(),
      settings: db.settings,
      branches: db.branches,
      rooms: db.rooms,
      holidays: db.holidays,
      services: db.services,
      practitioners: db.practitioners,
      articles: db.articles,
      faqs: db.faqs,
      users: db.users.map((u) => sanitizeUser(u)),
      recentAudits: db.auditLogs.slice(0, 20),
      summary: {
        patientsCount: db.patients.length,
        reservationsActive: db.reservations.filter((r) => r.status !== 'batal' && r.status !== 'tidak_hadir').length,
        queueActive: db.queue.filter((q) => q.status !== 'selesai').length,
        visitsTotal: db.visits.length,
        clinicalDrafts: clinicalList.filter((c) => c.status === 'draf').length,
        clinicalFinals: clinicalList.filter((c) => c.status === 'final').length,
        invoicesUnpaid: db.invoices.filter((i) => i.status === 'belum_bayar' || i.status === 'dibayar_sebagian').length,
        invoicesPaid: db.invoices.filter((i) => i.status === 'lunas').length,
        productsCount: db.products.length,
        lowStockCount,
        staffCount: db.users.filter((u) => !u.roles.includes('pasien')).length,
        patientAccountCount: db.users.filter((u) => u.roles.includes('pasien')).length,
        practitionersCount: db.practitioners.length,
        articlesCount: db.articles.length,
        faqsCount: db.faqs.length,
      },
    });
  });

  app.patch('/api/settings/branches/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin pengaturan cabang diperlukan.' });
      return;
    }
    const branch = db.branches.find((b) => b.id === req.params.id);
    if (!branch) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Cabang tidak ditemukan.' });
      return;
    }
    const { active, name, address, phone, whatsapp, operatingHours } = req.body ?? {};
    if (active !== undefined) branch.active = Boolean(active);
    if (name !== undefined && String(name).trim()) branch.name = String(name).trim();
    if (address !== undefined && String(address).trim()) branch.address = String(address).trim();
    if (phone !== undefined) branch.phone = String(phone).trim() || '-';
    if (whatsapp !== undefined) branch.whatsapp = String(whatsapp).trim() || db.settings.primaryWhatsapp;
    if (operatingHours !== undefined && String(operatingHours).trim()) branch.operatingHours = String(operatingHours).trim();
    appendAudit(db, user, {
      branchId: branch.id,
      action: 'PERBARUI_CABANG',
      objectType: 'Branch',
      objectId: branch.id,
      detail: `Cabang ${branch.name} diperbarui (aktif: ${branch.active ? 'Ya' : 'Tidak'}).`,
    });
    res.json({ branch });
  });

  // Praktisi & Jadwal Praktik Mingguan
  app.post('/api/admin/practitioners', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin admin diperlukan untuk menambah praktisi.' });
      return;
    }
    const { name, title, specialty, bio, photoUrl, branchIds, serviceIds, schedules } = req.body ?? {};
    if (!name || !title) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Nama dan gelar/jabatan praktisi wajib diisi.' });
      return;
    }
    const assignedBranches: string[] = Array.isArray(branchIds) && branchIds.length > 0 ? branchIds : [db.branches[0]?.id || 'br-jkt'];
    const defaultSchedules = Array.isArray(schedules) && schedules.length > 0
      ? schedules
      : [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: '09:00',
          endTime: '17:00',
          branchId: assignedBranches[0],
        }));

    const practitioner = {
      id: `prac-${randomUUID().slice(0, 6)}`,
      name: String(name).trim(),
      title: String(title).trim(),
      specialty: String(specialty || 'Terapi Holistik & Konsultasi').trim(),
      bio: String(bio || 'Praktisi berpengalaman di klinik ThibbunCare.').trim(),
      photoUrl: normalizePublicImageUrl(photoUrl, '/images/practitioner_tcm_female_1794541320309.jpg'),
      branchIds: assignedBranches,
      serviceIds: Array.isArray(serviceIds) && serviceIds.length > 0 ? serviceIds : db.services.map((s) => s.id),
      schedules: defaultSchedules,
    };
    db.practitioners.push(practitioner);
    appendAudit(db, user, {
      action: 'TAMBAH_PRAKTISI',
      objectType: 'Practitioner',
      objectId: practitioner.id,
      detail: `Praktisi ${practitioner.name} ditambahkan ke cabang ${practitioner.branchIds.join(', ')}.`,
    });
    res.status(201).json({ practitioner });
  });

  app.patch('/api/admin/practitioners/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin admin diperlukan untuk memperbarui data praktisi.' });
      return;
    }
    const prac = db.practitioners.find((p) => p.id === req.params.id);
    if (!prac) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Praktisi tidak ditemukan.' });
      return;
    }
    const { name, title, specialty, bio, photoUrl, branchIds, serviceIds, schedules } = req.body ?? {};
    if (name !== undefined && String(name).trim()) prac.name = String(name).trim();
    if (title !== undefined && String(title).trim()) prac.title = String(title).trim();
    if (specialty !== undefined) prac.specialty = String(specialty).trim();
    if (bio !== undefined) prac.bio = String(bio).trim();
    if (photoUrl !== undefined) {
      prac.photoUrl = normalizePublicImageUrl(photoUrl, prac.photoUrl || '/images/practitioner_tcm_female_1794541320309.jpg');
    }
    if (Array.isArray(branchIds) && branchIds.length > 0) prac.branchIds = branchIds;
    if (Array.isArray(serviceIds) && serviceIds.length > 0) prac.serviceIds = serviceIds;
    if (Array.isArray(schedules)) {
      prac.schedules = schedules.map((sch: any) => ({
        dayOfWeek: Math.max(0, Math.min(6, Number(sch.dayOfWeek) || 0)),
        startTime: String(sch.startTime || '09:00'),
        endTime: String(sch.endTime || '17:00'),
        branchId: String(sch.branchId || prac.branchIds[0] || db.branches[0]?.id || 'br-jkt'),
      }));
    }

    appendAudit(db, user, {
      action: 'UBAH_DATA_PRAKTISI',
      objectType: 'Practitioner',
      objectId: prac.id,
      detail: `Profil & jadwal praktisi ${prac.name} diperbarui oleh ${user.name}.`,
    });
    res.json({ practitioner: prac });
  });

  app.delete('/api/admin/practitioners/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin admin diperlukan untuk menghapus praktisi.' });
      return;
    }
    const existing = db.practitioners.find((p) => p.id === req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Praktisi tidak ditemukan.' });
      return;
    }
    db.practitioners = db.practitioners.filter((p) => p.id !== req.params.id);
    appendAudit(db, user, {
      action: 'HAPUS_PRAKTISI',
      objectType: 'Practitioner',
      objectId: existing.id,
      detail: `Praktisi ${existing.name} dihapus oleh ${user.name}.`,
    });
    res.json({ ok: true });
  });

  // Konten Website Publik: Artikel Edukasi & FAQ
  app.post('/api/admin/articles', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin admin diperlukan untuk mengelola artikel website.' });
      return;
    }
    const { title, category, readTimeMinutes, excerpt, content, imageUrl } = req.body ?? {};
    if (!title || !excerpt || !content) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Judul, ringkasan, dan isi artikel wajib diisi.' });
      return;
    }
    const article = {
      id: `art-${randomUUID().slice(0, 6)}`,
      slug: String(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, ''),
      title: String(title).trim(),
      category: String(category || 'Edukasi Klinik').trim(),
      readTimeMinutes: Math.max(1, Number(readTimeMinutes) || 4),
      publishedDate: todayJakartaISO(),
      excerpt: String(excerpt).trim(),
      content: String(content).trim(),
      imageUrl: normalizePublicImageUrl(imageUrl, '/images/service_herbal_apothecary_1794541318909.jpg'),
    };
    db.articles.unshift(article);
    appendAudit(db, user, {
      action: 'TAMBAH_ARTIKEL_PUBLIK',
      objectType: 'EducationalArticle',
      objectId: article.id,
      detail: `Artikel "${article.title}" diterbitkan ke Website Publik.`,
    });
    res.status(201).json({ article });
  });

  app.patch('/api/admin/articles/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin admin diperlukan.' });
      return;
    }
    const art = db.articles.find((a) => a.id === req.params.id);
    if (!art) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Artikel tidak ditemukan.' });
      return;
    }
    const { title, category, readTimeMinutes, excerpt, content, imageUrl } = req.body ?? {};
    if (title !== undefined && String(title).trim()) {
      art.title = String(title).trim();
      art.slug = art.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }
    if (category !== undefined && String(category).trim()) art.category = String(category).trim();
    if (readTimeMinutes !== undefined) art.readTimeMinutes = Math.max(1, Number(readTimeMinutes) || 4);
    if (excerpt !== undefined && String(excerpt).trim()) art.excerpt = String(excerpt).trim();
    if (content !== undefined && String(content).trim()) art.content = String(content).trim();
    if (imageUrl !== undefined) {
      art.imageUrl = normalizePublicImageUrl(imageUrl, art.imageUrl || '/images/service_herbal_apothecary_1794541318909.jpg');
    }
    appendAudit(db, user, {
      action: 'UBAH_ARTIKEL_PUBLIK',
      objectType: 'EducationalArticle',
      objectId: art.id,
      detail: `Artikel "${art.title}" diperbarui oleh ${user.name}.`,
    });
    res.json({ article: art });
  });

  app.delete('/api/admin/articles/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin admin diperlukan.' });
      return;
    }
    const existing = db.articles.find((a) => a.id === req.params.id);
    db.articles = db.articles.filter((a) => a.id !== req.params.id);
    if (existing) {
      appendAudit(db, user, {
        action: 'HAPUS_ARTIKEL_PUBLIK',
        objectType: 'EducationalArticle',
        objectId: existing.id,
        detail: `Artikel "${existing.title}" dihapus oleh ${user.name}.`,
      });
    }
    res.json({ ok: true });
  });

  app.post('/api/admin/faqs', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin admin diperlukan untuk mengelola FAQ.' });
      return;
    }
    const { question, answer } = req.body ?? {};
    if (!question || !answer) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Pertanyaan dan jawaban FAQ wajib diisi.' });
      return;
    }
    const faq = {
      id: `faq-${randomUUID().slice(0, 6)}`,
      question: String(question).trim(),
      answer: String(answer).trim(),
    };
    db.faqs.push(faq);
    appendAudit(db, user, {
      action: 'TAMBAH_FAQ_PUBLIK',
      objectType: 'FaqItem',
      objectId: faq.id,
      detail: `FAQ "${faq.question}" ditambahkan.`,
    });
    res.status(201).json({ faq });
  });

  app.patch('/api/admin/faqs/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin admin diperlukan.' });
      return;
    }
    const faq = db.faqs.find((f) => f.id === req.params.id);
    if (!faq) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'FAQ tidak ditemukan.' });
      return;
    }
    const { question, answer } = req.body ?? {};
    if (question !== undefined && String(question).trim()) faq.question = String(question).trim();
    if (answer !== undefined && String(answer).trim()) faq.answer = String(answer).trim();
    appendAudit(db, user, {
      action: 'UBAH_FAQ_PUBLIK',
      objectType: 'FaqItem',
      objectId: faq.id,
      detail: `FAQ "${faq.question}" diperbarui oleh ${user.name}.`,
    });
    res.json({ faq });
  });

  app.delete('/api/admin/faqs/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasManageSettingsAccess(user)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Izin admin diperlukan.' });
      return;
    }
    const existing = db.faqs.find((f) => f.id === req.params.id);
    db.faqs = db.faqs.filter((f) => f.id !== req.params.id);
    if (existing) {
      appendAudit(db, user, {
        action: 'HAPUS_FAQ_PUBLIK',
        objectType: 'FaqItem',
        objectId: existing.id,
        detail: `FAQ "${existing.question}" dihapus oleh ${user.name}.`,
      });
    }
    res.json({ ok: true });
  });

  app.post('/api/demo/reset', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!hasAnyRole(user, ['admin', 'pemilik'])) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Hanya pemilik atau admin yang dapat memulihkan data awal sistem.' });
      return;
    }
    db = resetDemoDatabase();
    revokedTokens.clear();
    res.json({ ok: true, message: 'Data awal sistem klinik berhasil dipulihkan.' });
  });

  return app;
}

async function startServer() {
  const app = await createApiApp();
  const httpServer = http.createServer(app);

  // =========================================================================
  // 3. VITE / STATIC FRONTEND MIDDLEWARE (Local Dev & Standalone Node)
  // =========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        ws: { server: httpServer },
        watch: disableHmr ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`ThibbunCare server berjalan di http://localhost:${port} (${getRuntimeStatus().mode.toUpperCase()})`);
  });
}

if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
  startServer();
}
