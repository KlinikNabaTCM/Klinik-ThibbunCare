export type Role =
  | 'admin'
  | 'pemilik'
  | 'resepsionis'
  | 'praktisi'
  | 'asisten'
  | 'kasir'
  | 'inventaris'
  | 'pasien';

export interface UserPermissions {
  canAccessClinicalNotes: boolean;
  canCorrectPayments: boolean;
  canExportSensitive: boolean;
  canManageSettings: boolean;
  canManageStock: boolean;
  delegatedTasks?: string[];
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  passwordHash?: string;
  roles: Role[];
  branchIds: string[];
  linkedPatientId?: string;
  linkedPractitionerId?: string;
  permissions: UserPermissions;
  active: boolean;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  whatsapp: string;
  operatingHours: string;
  active: boolean;
}

export interface Room {
  id: string;
  branchId: string;
  name: string;
  type: string;
  active: boolean;
}

export interface Holiday {
  id: string;
  branchId: string | 'ALL';
  date: string; // YYYY-MM-DD
  label: string;
}

export interface ServiceItem {
  id: string;
  code: string;
  name: string;
  category:
    | 'Konsultasi TCM'
    | 'Bekam'
    | 'Akupunktur'
    | 'Akupresur'
    | 'Moksibusi'
    | 'Konsultasi Herbal'
    | 'Pendamping Spiritual';
  description: string;
  durationMinutes: number;
  price: number;
  requiresConsent: boolean;
  consentFormType: 'terapi_umum' | 'bekam_akupunktur' | 'ruqyah_syariyyah' | 'tidak_perlu';
  isSpiritualCompanion?: boolean;
  activeBranchIds: string[];
}

export interface PractitionerSchedule {
  dayOfWeek: number; // 0 = Minggu ... 6 = Sabtu
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  branchId: string;
}

export interface Practitioner {
  id: string;
  name: string;
  title: string;
  specialty: string;
  bio: string;
  photoUrl: string;
  branchIds: string[];
  serviceIds: string[];
  schedules: PractitionerSchedule[];
}

export interface ClinicSettings {
  clinicName: string;
  tagline: string;
  logoInitials: string;
  primaryWhatsapp: string;
  primaryEmail: string;
  websiteNote: string;
  enableRoomTracking: boolean;
  enableRuqyahService: boolean;
  retentionYears: number;
  whatsappAutoSendEnabled: boolean;
  qrisAutoGatewayEnabled: boolean;
}

export interface Patient {
  id: string;
  patientNumber: string; // RM-2026-0001
  fullName: string;
  dateOfBirth: string; // YYYY-MM-DD
  gender: 'L' | 'P';
  phone: string;
  address: string;
  guardianName?: string;
  guardianRelation?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  branchId: string;
  createdAt: string;
}

export type ReservationStatus =
  | 'menunggu_konfirmasi'
  | 'terkonfirmasi'
  | 'check_in'
  | 'batal'
  | 'tidak_hadir';

export interface RescheduleHistoryItem {
  changedAt: string;
  changedBy: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  reason: string;
}

export type ReservationMessageType = 'konfirmasi' | 'pengingat' | 'ubah_jadwal' | 'kontrol';
export type FollowUpMessageType =
  | 'tindak_lanjut_lengkap'
  | 'ringkasan_dibagikan'
  | 'kontrol_lanjutan'
  | 'rujukan';

export interface MessageDispatchLog {
  id: string;
  templateType: ReservationMessageType | FollowUpMessageType;
  channel: 'whatsapp_draft' | 'whatsapp_provider';
  recipientPhone: string;
  consentRecorded: boolean;
  status: 'disalin_atau_draft' | 'terkirim' | 'gagal';
  sentAt: string;
  sentBy: string;
  idempotencyKey: string;
  messagePreview?: string;
}

export interface Reservation {
  id: string;
  reservationCode: string;
  branchId: string;
  patientId: string;
  practitionerId: string;
  roomId?: string;
  serviceIds: string[];
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: ReservationStatus;
  notes?: string;
  cancelReason?: string;
  rescheduleHistory: RescheduleHistoryItem[];
  messageLogs: MessageDispatchLog[];
  whatsappConsent: boolean;
  createdAt: string;
}

export type QueueStatus = 'menunggu' | 'dipanggil' | 'sedang_dilayani' | 'selesai';

export interface QueueItem {
  id: string;
  branchId: string;
  visitId: string;
  reservationId?: string;
  patientId: string;
  queueNumber: string; // A-001
  roomName: string;
  practitionerId: string;
  serviceSummary: string;
  status: QueueStatus;
  calledAt?: string;
  createdAt: string;
}

export interface Visit {
  id: string;
  visitNumber: string; // KNJ-2026-0001
  branchId: string;
  patientId: string;
  practitionerId: string;
  roomId?: string;
  reservationId?: string;
  isWalkIn: boolean;
  serviceIds: string[];
  visitDate: string; // YYYY-MM-DD
  visitTime: string; // HH:mm
  status: 'menunggu' | 'berlangsung' | 'selesai_terapi' | 'selesai_tuntas';
  followUpDate?: string;
  followUpStatus?: 'dijadwalkan' | 'selesai' | 'tidak_perlu';
  referralNote?: string;
  sharedSummaryApproved: boolean;
  sharedSummaryText?: string;
  followUpWhatsappConsent?: boolean;
  followUpMessageLogs?: MessageDispatchLog[];
  createdAt: string;
}

export interface GeneralAssessment {
  chiefComplaint: string;
  onsetAndCourse: string;
  relevantHistory: string;
  allergies: string;
  medicationsOrSupplements: string;
  measurements: {
    bloodPressure?: string;
    pulseRate?: string;
    temperature?: string;
    weightKg?: string;
  };
}

export interface TcmObservation {
  tongueColor: string;
  tongueCoating: string;
  tongueShape: string;
  pulseQuality: string;
  pulseDepth: string;
  practitionerPatternNote: string; // Kolom terpisah untuk interpretasi pola TCM praktisi
}

export interface ProcedureMaterialUsage {
  productId: string;
  batchId: string;
  batchNumber: string;
  quantity: number;
  unit: string;
}

export interface TherapyProcedure {
  id: string;
  serviceId: string;
  serviceName: string;
  practitionerId: string;
  practitionerName: string;
  performedAt: string;
  bodyArea?: string;
  materialsUsed: ProcedureMaterialUsage[];
  observedResponse: string;
  requiresConsent: boolean;
  status: 'terjadwal' | 'selesai';
  idempotencyKey?: string;
}

export interface ConsentRecord {
  id: string;
  formType: 'terapi_umum' | 'bekam_akupunktur' | 'ruqyah_syariyyah';
  formVersion: string;
  serviceIds: string[];
  decision: 'disetujui' | 'ditolak';
  signerName: string;
  signerRole: 'pasien' | 'wali';
  recordedBy: string;
  recordedAt: string;
  notes?: string;
}

export interface ClinicalAttachment {
  id: string;
  fileName: string;
  category: string;
  uploadedBy: string;
  uploadedAt: string;
  storagePath: string;
  note?: string;
}

export interface ClinicalIncident {
  id: string;
  occurredAt: string;
  description: string;
  actionTaken: string;
  recordedBy: string;
  followUpStatus: 'dipantau' | 'tertangani';
}

export interface ClinicalAddendum {
  id: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  reason: string;
  correctionText: string;
}

export interface ClinicalRecord {
  visitId: string;
  patientId: string;
  branchId: string;
  status: 'draf' | 'final';
  finalizedAt?: string;
  finalizedBy?: string;
  generalAssessment: GeneralAssessment;
  tcmObservation: TcmObservation;
  procedures: TherapyProcedure[];
  consents: ConsentRecord[];
  attachments: ClinicalAttachment[];
  incidents: ClinicalIncident[];
  addendums: ClinicalAddendum[];
  updatedAt: string;
}

export type InvoiceStatus = 'belum_bayar' | 'dibayar_sebagian' | 'lunas' | 'dibatalkan';
export type PaymentMethod = 'tunai' | 'transfer' | 'qris_manual' | 'qris_terintegrasi';

export interface InvoiceLine {
  id: string;
  itemType: 'layanan' | 'produk' | 'potongan';
  refId?: string;
  batchId?: string;
  batchNumber?: string;
  description: string;
  quantity: number;
  unitPrice: number; // Snapshot saat transaksi dibuat
  subtotal: number;
}

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  amount: number; // negatif jika pengembalian dana / koreksi
  isRefund?: boolean;
  isCorrection?: boolean;
  correctionOfPaymentId?: string;
  reason?: string;
  method: PaymentMethod;
  referenceNumber?: string;
  qrisStatus?: 'menunggu_konfirmasi' | 'terkonfirmasi';
  receivedAt: string; // Tanggal uang diterima (dibedakan dari invoice issuedAt)
  recordedBy: string;
  idempotencyKey: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string; // INV-2026-0001
  branchId: string;
  visitId: string;
  patientId: string;
  issuedAt: string; // Tanggal penerbitan invoice
  lines: InvoiceLine[];
  discountAmount: number;
  discountReason?: string;
  totalAmount: number;
  paidAmount: number;
  refundedAmount: number;
  status: InvoiceStatus;
  voidReason?: string;
  payments: PaymentRecord[];
  createdBy: string;
}

export interface CashSession {
  id: string;
  branchId: string;
  openedAt: string;
  openedBy: string;
  openingBalance: number;
  closedAt?: string;
  closedBy?: string;
  cashReceived: number;
  transferReceived: number;
  qrisReceived: number;
  expenses: number;
  refunds: number;
  expectedCashBalance: number;
  actualCashCount?: number;
  variance?: number;
  notes?: string;
  status: 'terbuka' | 'ditutup';
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: 'Produk Herbal' | 'Bahan Habis Pakai' | 'Perlengkapan';
  unit: string;
  buyPrice: number;
  sellPrice: number;
  minStock: number;
  supplierId: string;
  trackExpiry: boolean;
}

export interface ProductBatch {
  id: string;
  productId: string;
  branchId: string;
  batchNumber: string;
  expiryDate?: string; // YYYY-MM-DD
  quantityAvailable: number;
  receivedAt: string;
}

export interface PurchaseOrderLine {
  productId: string;
  orderedQty: number;
  receivedQty: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  branchId: string;
  supplierId: string;
  orderDate: string;
  status: 'draf' | 'dipesan' | 'diterima_sebagian' | 'diterima_penuh';
  lines: PurchaseOrderLine[];
  createdBy: string;
}

export interface StockMutation {
  id: string;
  branchId: string;
  productId: string;
  batchId: string;
  batchNumber: string;
  type:
    | 'penerimaan_pembelian'
    | 'retur_pemasok'
    | 'penjualan'
    | 'pemakaian_tindakan'
    | 'barang_rusak'
    | 'penyesuaian'
    | 'mutasi_keluar_cabang'
    | 'mutasi_masuk_cabang';
  quantityDelta: number;
  sourceRef: string;
  reason?: string;
  actorName: string;
  createdAt: string;
  idempotencyKey?: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRoles: Role[];
  branchId?: string;
  action: string;
  objectType: string;
  objectId: string;
  detail: string;
  createdAt: string;
}

export interface EducationalArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  readTimeMinutes: number;
  publishedDate: string;
  excerpt: string;
  content: string;
  imageUrl?: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface RuntimeStatus {
  mode: 'demo' | 'supabase';
  supabaseConfigured: boolean;
  whatsappProviderConfigured: boolean;
  paymentGatewayConfigured: boolean;
  timezone: 'Asia/Jakarta';
  notice: string;
}
