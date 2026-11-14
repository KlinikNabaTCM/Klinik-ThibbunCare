import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AuditLog,
  Branch,
  CashSession,
  ClinicSettings,
  ClinicalRecord,
  EducationalArticle,
  FaqItem,
  Holiday,
  Invoice,
  Patient,
  Practitioner,
  Product,
  ProductBatch,
  PurchaseOrder,
  QueueItem,
  Reservation,
  Room,
  ServiceItem,
  StockMutation,
  Supplier,
  UserAccount,
  Visit,
} from '../src/types/clinic.ts';
import { addMinutesToTime, timeToMinutes, todayJakartaISO } from '../src/utils/format.ts';
import { DEFAULT_DEMO_STAFF_PASSWORD, hashPassword } from './auth.ts';

export interface ClinicDatabase {
  settings: ClinicSettings;
  branches: Branch[];
  rooms: Room[];
  holidays: Holiday[];
  users: UserAccount[];
  practitioners: Practitioner[];
  services: ServiceItem[];
  patients: Patient[];
  reservations: Reservation[];
  queue: QueueItem[];
  visits: Visit[];
  clinicalRecords: Record<string, ClinicalRecord>;
  invoices: Invoice[];
  cashSessions: CashSession[];
  suppliers: Supplier[];
  products: Product[];
  batches: ProductBatch[];
  purchaseOrders: PurchaseOrder[];
  stockMutations: StockMutation[];
  auditLogs: AuditLog[];
  articles: EducationalArticle[];
  faqs: FaqItem[];
  sequences: {
    patient: number;
    reservation: number;
    visit: number;
    invoice: number;
    queue: number;
    po: number;
  };
  processedIdempotencyKeys: Record<string, unknown>;
}

function addDaysISO(baseIso: string, deltaDays: number): string {
  const dt = new Date(`${baseIso}T00:00:00+07:00`);
  dt.setDate(dt.getDate() + deltaDays);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dt);
}

export function createSeedDatabase(): ClinicDatabase {
  const today = todayJakartaISO();
  const yesterday = addDaysISO(today, -1);
  const tomorrow = addDaysISO(today, 1);
  const nextWeek = addDaysISO(today, 7);
  const soonExpiry = addDaysISO(today, 21);
  const expiredDate = addDaysISO(today, -10);
  const farExpiry = addDaysISO(today, 240);
  const nowIso = new Date().toISOString();

  const branches: Branch[] = [
    {
      id: 'br-jkt',
      code: 'JKT-SEL',
      name: 'Cabang Kemang, Jakarta Selatan',
      address: 'Jl. Kemang Raya No. 48, Bangka, Mampang Prapatan, Jakarta Selatan 12730',
      phone: '021-7190048',
      whatsapp: '6281100008899',
      operatingHours: 'Senin–Sabtu, 08:00–20:00 WIB',
      active: true,
    },
    {
      id: 'br-bdg',
      code: 'BDG-DGO',
      name: 'Cabang Dago, Bandung',
      address: 'Jl. Ir. H. Juanda No. 112, Coblong, Kota Bandung 40132',
      phone: '022-2500112',
      whatsapp: '6281100007788',
      operatingHours: 'Senin–Sabtu, 08:30–19:30 WIB',
      active: true,
    },
  ];

  const rooms: Room[] = [
    { id: 'rm-jkt-1', branchId: 'br-jkt', name: 'Ruang Zaitun 1 (Konsultasi & TCM)', type: 'Konsultasi', active: true },
    { id: 'rm-jkt-2', branchId: 'br-jkt', name: 'Ruang Hijamah 2 (Bekam Steril)', type: 'Tindakan', active: true },
    { id: 'rm-jkt-3', branchId: 'br-jkt', name: 'Ruang Meridian 3 (Akupunktur & Moksa)', type: 'Tindakan', active: true },
    { id: 'rm-jkt-4', branchId: 'br-jkt', name: 'Ruang Sakinah 4 (Pendampingan Spiritual)', type: 'Khusus', active: true },
    { id: 'rm-bdg-1', branchId: 'br-bdg', name: 'Ruang Parahyangan 1 (TCM & Herbal)', type: 'Konsultasi', active: true },
    { id: 'rm-bdg-2', branchId: 'br-bdg', name: 'Ruang Terapi 2 (Bekam & Akupresur)', type: 'Tindakan', active: true },
  ];

  const holidays: Holiday[] = [
    { id: 'hol-1', branchId: 'ALL', date: addDaysISO(today, 30), label: 'Hari Libur Operasional Klinik' },
  ];

  const services: ServiceItem[] = [
    {
      id: 'srv-tcm',
      code: 'TCM-01',
      name: 'Konsultasi TCM & Observasi Lidah-Nadi',
      category: 'Konsultasi TCM',
      description: 'Evaluasi keluhan menyeluruh serta pencatatan observasi lidah, nadi, dan penyusunan pola keseimbangan oleh praktisi.',
      durationMinutes: 45,
      price: 175000,
      requiresConsent: false,
      consentFormType: 'tidak_perlu',
      activeBranchIds: ['br-jkt', 'br-bdg'],
    },
    {
      id: 'srv-bekam',
      code: 'BKM-01',
      name: 'Terapi Bekam Basah / Hijamah Steril',
      category: 'Bekam',
      description: 'Terapi bekam higienis dengan set kop sekali pakai untuk membantu meredakan ketegangan otot dan melancarkan perifer.',
      durationMinutes: 60,
      price: 220000,
      requiresConsent: true,
      consentFormType: 'bekam_akupunktur',
      activeBranchIds: ['br-jkt', 'br-bdg'],
    },
    {
      id: 'srv-akupunktur',
      code: 'AKP-01',
      name: 'Akupunktur Tradisional',
      category: 'Akupunktur',
      description: 'Stimulasi titik meridian menggunakan jarum steril sekali pakai sesuai asesmen praktisi.',
      durationMinutes: 45,
      price: 250000,
      requiresConsent: true,
      consentFormType: 'bekam_akupunktur',
      activeBranchIds: ['br-jkt', 'br-bdg'],
    },
    {
      id: 'srv-akupresur',
      code: 'AKS-01',
      name: 'Akupresur & Pijat Meridian',
      category: 'Akupresur',
      description: 'Penekanan titik meridian tanpa jarum untuk pemulihan kelelahan, kekakuan leher-punggung, dan relaksasi.',
      durationMinutes: 45,
      price: 165000,
      requiresConsent: true,
      consentFormType: 'terapi_umum',
      activeBranchIds: ['br-jkt', 'br-bdg'],
    },
    {
      id: 'srv-moksa',
      code: 'MKS-01',
      name: 'Terapi Moksibusi Hangat',
      category: 'Moksibusi',
      description: 'Penghangatan lembut titik meridian menggunakan batang moksa daun mugwort pilihan.',
      durationMinutes: 30,
      price: 140000,
      requiresConsent: true,
      consentFormType: 'terapi_umum',
      activeBranchIds: ['br-jkt'],
    },
    {
      id: 'srv-herbal',
      code: 'HRB-01',
      name: 'Konsultasi Racik Herbal Terstandar',
      category: 'Konsultasi Herbal',
      description: 'Penelaahan riwayat konsumsi suplemen serta penyiapan formulasi herbal alami yang sesuai.',
      durationMinutes: 30,
      price: 125000,
      requiresConsent: false,
      consentFormType: 'tidak_perlu',
      activeBranchIds: ['br-jkt', 'br-bdg'],
    },
    {
      id: 'srv-ruqyah',
      code: 'RQY-01',
      name: 'Pendampingan Ruqyah Syar’iyyah',
      category: 'Pendamping Spiritual',
      description: 'Layanan pendampingan spiritual berbasis doa dan ketenangan batin dengan formulir persetujuan terpisah.',
      durationMinutes: 60,
      price: 200000,
      requiresConsent: true,
      consentFormType: 'ruqyah_syariyyah',
      isSpiritualCompanion: true,
      activeBranchIds: ['br-jkt'],
    },
  ];

  // Schedules for every day Mon-Sat (1..6) plus Sunday (0) light schedule in demo so any test date works smoothly!
  const allDaysSchedules = (branchId: string) =>
    [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: '08:00',
      endTime: '19:00',
      branchId,
    }));

  const practitioners: Practitioner[] = [
    {
      id: 'prac-aisyah',
      name: 'Tabibah Aisyah Rahmawati, S.Tr.Kes',
      title: 'Praktisi TCM & Akupunktur',
      specialty: 'Observasi TCM, Akupunktur, Herbal & Moksibusi',
      bio: 'Berpengalaman 9 tahun dalam terapi tradisional Tiongkok terintegrasi dan pendampingan kesehatan keluarga.',
      photoUrl: '/src/assets/images/practitioner_tcm_female_1794541320309.jpg',
      branchIds: ['br-jkt', 'br-bdg'],
      serviceIds: ['srv-tcm', 'srv-akupunktur', 'srv-moksa', 'srv-herbal', 'srv-akupresur'],
      schedules: [
        ...allDaysSchedules('br-jkt'),
        ...[2, 4, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '17:00', branchId: 'br-bdg' })),
      ],
    },
    {
      id: 'prac-farhan',
      name: 'Ust. Farhan Al-Hakim, C.HT',
      title: 'Terapis Bekam Steril & Pendamping Spiritual',
      specialty: 'Bekam Basah Steril, Akupresur & Ruqyah Syar’iyyah',
      bio: 'Menekankan prosedur sterilitas sekali pakai, komunikasi persetujuan tindakan yang jelas, dan pendampingan spiritual yang menenangkan.',
      photoUrl: '/src/assets/images/practitioner_bekam_male_1794541319637.jpg',
      branchIds: ['br-jkt'],
      serviceIds: ['srv-bekam', 'srv-akupresur', 'srv-ruqyah', 'srv-tcm'],
      schedules: allDaysSchedules('br-jkt'),
    },
    {
      id: 'prac-dimas',
      name: 'Dimas Prasetyo, A.Md.Akup',
      title: 'Praktisi Akupresur & Herbal Cabang Bandung',
      specialty: 'Akupunktur, Akupresur & Konsultasi Herbal',
      bio: 'Fokus pada pemulihan kebugaran otot, keluhan pencernaan fungsional, dan edukasi gaya hidup harian.',
      photoUrl: '/src/assets/images/practitioner_bekam_male_1794541319637.jpg',
      branchIds: ['br-bdg'],
      serviceIds: ['srv-tcm', 'srv-bekam', 'srv-akupunktur', 'srv-akupresur', 'srv-herbal'],
      schedules: allDaysSchedules('br-bdg'),
    },
  ];

  const defaultStaffHash = hashPassword(DEFAULT_DEMO_STAFF_PASSWORD);

  const users: UserAccount[] = [
    {
      id: 'usr-admin',
      name: 'Administrator Utama Klinik (Admin Semua Fitur)',
      email: 'admin@demo.thibbuncare.id',
      passwordHash: defaultStaffHash,
      roles: ['admin', 'pemilik'],
      branchIds: ['br-jkt', 'br-bdg'],
      permissions: {
        canAccessClinicalNotes: true,
        canCorrectPayments: true,
        canExportSensitive: true,
        canManageSettings: true,
        canManageStock: true,
      },
      active: true,
    },
    {
      id: 'usr-mandiri',
      name: 'Tabibah Aisyah (Praktik Mandiri · Semua Peran Tanpa Admin)',
      email: 'mandiri@demo.thibbuncare.id',
      passwordHash: defaultStaffHash,
      roles: ['pemilik', 'praktisi', 'resepsionis', 'kasir', 'inventaris'],
      branchIds: ['br-jkt', 'br-bdg'],
      linkedPractitionerId: 'prac-aisyah',
      permissions: {
        canAccessClinicalNotes: true,
        canCorrectPayments: true,
        canExportSensitive: true,
        canManageSettings: true,
        canManageStock: true,
      },
      active: true,
    },
    {
      id: 'usr-pemilik-klinis',
      name: 'H. Ahmad Fauzan (Pemilik · Akses Klinis Aktif)',
      email: 'fauzan.pemilik@demo.thibbuncare.id',
      passwordHash: defaultStaffHash,
      roles: ['pemilik'],
      branchIds: ['br-jkt', 'br-bdg'],
      permissions: {
        canAccessClinicalNotes: true,
        canCorrectPayments: true,
        canExportSensitive: true,
        canManageSettings: true,
        canManageStock: true,
      },
      active: true,
    },
    {
      id: 'usr-pemilik-nonklinis',
      name: 'Hj. Nadia Kusuma (Pemilik · Tanpa Akses Klinis)',
      email: 'nadia.pemilik@demo.thibbuncare.id',
      passwordHash: defaultStaffHash,
      roles: ['pemilik'],
      branchIds: ['br-jkt', 'br-bdg'],
      permissions: {
        canAccessClinicalNotes: false,
        canCorrectPayments: true,
        canExportSensitive: false,
        canManageSettings: true,
        canManageStock: true,
      },
      active: true,
    },
    {
      id: 'usr-resepsionis',
      name: 'Siti Aminah (Resepsionis Kemang)',
      email: 'siti.resepsionis@demo.thibbuncare.id',
      passwordHash: defaultStaffHash,
      roles: ['resepsionis'],
      branchIds: ['br-jkt'],
      permissions: {
        canAccessClinicalNotes: false,
        canCorrectPayments: false,
        canExportSensitive: false,
        canManageSettings: false,
        canManageStock: false,
      },
      active: true,
    },
    {
      id: 'usr-praktisi',
      name: 'Tabibah Aisyah Rahmawati (Praktisi)',
      email: 'aisyah.praktisi@demo.thibbuncare.id',
      passwordHash: defaultStaffHash,
      roles: ['praktisi'],
      branchIds: ['br-jkt', 'br-bdg'],
      linkedPractitionerId: 'prac-aisyah',
      permissions: {
        canAccessClinicalNotes: true,
        canCorrectPayments: false,
        canExportSensitive: false,
        canManageSettings: false,
        canManageStock: false,
      },
      active: true,
    },
    {
      id: 'usr-asisten',
      name: 'Rani Pertiwi (Asisten Praktisi)',
      email: 'rani.asisten@demo.thibbuncare.id',
      passwordHash: defaultStaffHash,
      roles: ['asisten'],
      branchIds: ['br-jkt'],
      permissions: {
        canAccessClinicalNotes: true,
        canCorrectPayments: false,
        canExportSensitive: false,
        canManageSettings: false,
        canManageStock: false,
        delegatedTasks: ['pengukuran_awal', 'persiapan_ruang', 'dokumentasi_persetujuan'],
      },
      active: true,
    },
    {
      id: 'usr-kasir',
      name: 'Budi Santoso (Kasir Kemang)',
      email: 'budi.kasir@demo.thibbuncare.id',
      passwordHash: defaultStaffHash,
      roles: ['kasir'],
      branchIds: ['br-jkt'],
      permissions: {
        canAccessClinicalNotes: false,
        canCorrectPayments: true,
        canExportSensitive: false,
        canManageSettings: false,
        canManageStock: false,
      },
      active: true,
    },
    {
      id: 'usr-inventaris',
      name: 'Rizky Maulana (Petugas Inventaris)',
      email: 'rizky.inventaris@demo.thibbuncare.id',
      passwordHash: defaultStaffHash,
      roles: ['inventaris'],
      branchIds: ['br-jkt', 'br-bdg'],
      permissions: {
        canAccessClinicalNotes: false,
        canCorrectPayments: false,
        canExportSensitive: false,
        canManageSettings: false,
        canManageStock: true,
      },
      active: true,
    },
    {
      id: 'usr-pasien-1',
      name: 'Dewi Kartika (Pasien · RM-2026-0001)',
      email: 'dewi.pasien@demo.thibbuncare.id',
      roles: ['pasien'],
      branchIds: ['br-jkt'],
      linkedPatientId: 'pat-1',
      permissions: {
        canAccessClinicalNotes: false,
        canCorrectPayments: false,
        canExportSensitive: false,
        canManageSettings: false,
        canManageStock: false,
      },
      active: true,
    },
    {
      id: 'usr-pasien-2',
      name: 'Hendra Wijaya (Pasien · RM-2026-0002)',
      email: 'hendra.pasien@demo.thibbuncare.id',
      roles: ['pasien'],
      branchIds: ['br-jkt'],
      linkedPatientId: 'pat-2',
      permissions: {
        canAccessClinicalNotes: false,
        canCorrectPayments: false,
        canExportSensitive: false,
        canManageSettings: false,
        canManageStock: false,
      },
      active: true,
    },
  ];

  const patients: Patient[] = [
    {
      id: 'pat-1',
      patientNumber: 'RM-2026-0001',
      fullName: 'Dewi Kartika',
      dateOfBirth: '1989-04-17',
      gender: 'P',
      phone: '081234567801',
      address: 'Jl. Bangka II No. 14, Jakarta Selatan',
      emergencyContactName: 'Rudi Kartika',
      emergencyContactPhone: '081234567899',
      branchId: 'br-jkt',
      createdAt: `${yesterday}T09:00:00+07:00`,
    },
    {
      id: 'pat-2',
      patientNumber: 'RM-2026-0002',
      fullName: 'Hendra Wijaya',
      dateOfBirth: '1984-09-22',
      gender: 'L',
      phone: '081398765402',
      address: 'Jl. Cipete Raya No. 27, Jakarta Selatan',
      emergencyContactName: 'Lina Wijaya',
      emergencyContactPhone: '081398765490',
      branchId: 'br-jkt',
      createdAt: `${yesterday}T11:15:00+07:00`,
    },
    {
      id: 'pat-3',
      patientNumber: 'RM-2026-0003',
      fullName: 'Anisa Nurhaliza',
      dateOfBirth: '2011-02-05',
      gender: 'P',
      phone: '085611223303',
      address: 'Jl. Cisitu Lama No. 8, Bandung',
      guardianName: 'Slamet Nurhaliza',
      guardianRelation: 'Ayah Kandung',
      emergencyContactName: 'Slamet Nurhaliza',
      emergencyContactPhone: '085611223399',
      branchId: 'br-bdg',
      createdAt: `${yesterday}T14:20:00+07:00`,
    },
  ];

  const reservations: Reservation[] = [
    {
      id: 'res-1',
      reservationCode: 'RSV-2026-0101',
      branchId: 'br-jkt',
      patientId: 'pat-1',
      practitionerId: 'prac-aisyah',
      roomId: 'rm-jkt-1',
      serviceIds: ['srv-tcm', 'srv-akupunktur'],
      date: today,
      startTime: '09:00',
      endTime: '10:30',
      status: 'check_in',
      notes: 'Kontrol pola tidur dan ketegangan bahu.',
      rescheduleHistory: [],
      messageLogs: [
        {
          id: 'msg-1',
          templateType: 'konfirmasi',
          channel: 'whatsapp_draft',
          recipientPhone: '081234567801',
          consentRecorded: true,
          status: 'disalin_atau_draft',
          sentAt: `${yesterday}T16:00:00+07:00`,
          sentBy: 'Siti Aminah',
          idempotencyKey: 'seed-msg-1',
        },
      ],
      whatsappConsent: true,
      createdAt: `${yesterday}T15:50:00+07:00`,
    },
    {
      id: 'res-2',
      reservationCode: 'RSV-2026-0102',
      branchId: 'br-jkt',
      patientId: 'pat-2',
      practitionerId: 'prac-farhan',
      roomId: 'rm-jkt-2',
      serviceIds: ['srv-bekam'],
      date: today,
      startTime: '10:00',
      endTime: '11:00',
      status: 'terkonfirmasi',
      notes: 'Jadwal bekam rutin bulanan.',
      rescheduleHistory: [],
      messageLogs: [],
      whatsappConsent: true,
      createdAt: `${yesterday}T17:10:00+07:00`,
    },
    {
      id: 'res-3',
      reservationCode: 'RSV-2026-0103',
      branchId: 'br-jkt',
      patientId: 'pat-1',
      practitionerId: 'prac-aisyah',
      roomId: 'rm-jkt-3',
      serviceIds: ['srv-akupunktur'],
      date: tomorrow,
      startTime: '13:00',
      endTime: '13:45',
      status: 'menunggu_konfirmasi',
      notes: 'Permintaan sesi lanjutan.',
      rescheduleHistory: [],
      messageLogs: [],
      whatsappConsent: true,
      createdAt: nowIso,
    },
  ];

  const visits: Visit[] = [
    {
      id: 'vis-1',
      visitNumber: 'KNJ-2026-0001',
      branchId: 'br-jkt',
      patientId: 'pat-1',
      practitionerId: 'prac-aisyah',
      roomId: 'rm-jkt-1',
      isWalkIn: false,
      serviceIds: ['srv-tcm', 'srv-herbal'],
      visitDate: yesterday,
      visitTime: '10:00',
      status: 'selesai_tuntas',
      followUpDate: nextWeek,
      followUpStatus: 'dijadwalkan',
      referralNote: 'Tidak diperlukan rujukan eksternal saat ini; evaluasi ulang 7 hari.',
      sharedSummaryApproved: true,
      sharedSummaryText:
        'Ringkasan Kunjungan: Telah dilakukan konsultasi TCM dan penyesuaian racik herbal hangat. Anjuran istirahat cukup sebelum pukul 22.00 WIB dan hindari minuman dingin. Jadwal kontrol disarankan 7 hari lagi.',
      followUpWhatsappConsent: true,
      followUpMessageLogs: [],
      createdAt: `${yesterday}T10:00:00+07:00`,
    },
    {
      id: 'vis-2',
      visitNumber: 'KNJ-2026-0002',
      branchId: 'br-jkt',
      patientId: 'pat-1',
      practitionerId: 'prac-aisyah',
      roomId: 'rm-jkt-1',
      reservationId: 'res-1',
      isWalkIn: false,
      serviceIds: ['srv-tcm', 'srv-akupunktur'],
      visitDate: today,
      visitTime: '09:00',
      status: 'berlangsung',
      sharedSummaryApproved: false,
      followUpWhatsappConsent: false,
      followUpMessageLogs: [],
      createdAt: `${today}T08:55:00+07:00`,
    },
  ];

  const queue: QueueItem[] = [
    {
      id: 'que-1',
      branchId: 'br-jkt',
      visitId: 'vis-2',
      reservationId: 'res-1',
      patientId: 'pat-1',
      queueNumber: 'A-001',
      roomName: 'Ruang Zaitun 1 (Konsultasi & TCM)',
      practitionerId: 'prac-aisyah',
      serviceSummary: 'Konsultasi TCM & Akupunktur',
      status: 'sedang_dilayani',
      calledAt: `${today}T09:00:00+07:00`,
      createdAt: `${today}T08:55:00+07:00`,
    },
  ];

  const clinicalRecords: Record<string, ClinicalRecord> = {
    'vis-1': {
      visitId: 'vis-1',
      patientId: 'pat-1',
      branchId: 'br-jkt',
      status: 'final',
      finalizedAt: `${yesterday}T11:05:00+07:00`,
      finalizedBy: 'Tabibah Aisyah Rahmawati',
      generalAssessment: {
        chiefComplaint: 'Kelelahan berulang dan sulit tidur sejak 2 minggu terakhir.',
        onsetAndCourse: 'Muncul bertahap saat beban kerja meningkat.',
        relevantHistory: 'Tidak ada riwayat hipertensi atau gangguan pembekuan darah.',
        allergies: 'Tidak ada alergi tercatat.',
        medicationsOrSupplements: 'Vitamin B kompleks sesekali.',
        measurements: {
          bloodPressure: '115/75 mmHg',
          pulseRate: '74 x/menit',
          temperature: '36.6 °C',
          weightKg: '56 kg',
        },
      },
      tcmObservation: {
        tongueColor: 'Merah muda pucat',
        tongueCoating: 'Selaput putih tipis',
        tongueShape: 'Sedikit bekas gigi di tepi',
        pulseQuality: 'Halus (Xi) dan sedikit lemah (Ruo)',
        pulseDepth: 'Sedang',
        practitionerPatternNote: 'Pola indikasi defisiensi Qi Limpa dan ketegangan ringan pada hati menurut pengamatan praktisi.',
      },
      procedures: [
        {
          id: 'proc-seed-1',
          serviceId: 'srv-tcm',
          serviceName: 'Konsultasi TCM & Observasi Lidah-Nadi',
          practitionerId: 'prac-aisyah',
          practitionerName: 'Tabibah Aisyah Rahmawati',
          performedAt: `${yesterday}T10:15:00+07:00`,
          materialsUsed: [],
          observedResponse: 'Pasien kooperatif, memahami edukasi pola makan hangat.',
          requiresConsent: false,
          status: 'selesai',
        },
      ],
      consents: [],
      attachments: [
        {
          id: 'att-seed-1',
          fileName: 'catatan_pola_tidur_pasien.pdf',
          category: 'Dokumen Pendukung',
          uploadedBy: 'Tabibah Aisyah Rahmawati',
          uploadedAt: `${yesterday}T10:25:00+07:00`,
          storagePath: 'private/vis-1/catatan_pola_tidur_pasien.pdf',
          note: 'Rekap catatan harian pasien selama 7 hari.',
        },
      ],
      incidents: [],
      addendums: [],
      updatedAt: `${yesterday}T11:05:00+07:00`,
    },
    'vis-2': {
      visitId: 'vis-2',
      patientId: 'pat-1',
      branchId: 'br-jkt',
      status: 'draf',
      generalAssessment: {
        chiefComplaint: 'Pegal pada bahu kanan dan tidur mulai membaik.',
        onsetAndCourse: 'Berkurang dibanding kunjungan sebelumnya.',
        relevantHistory: 'Tidak ada alergi baru.',
        allergies: 'Tidak ada',
        medicationsOrSupplements: 'Herbal racik kunjungan sebelumnya.',
        measurements: {
          bloodPressure: '118/76 mmHg',
          pulseRate: '72 x/menit',
          temperature: '36.5 °C',
          weightKg: '56 kg',
        },
      },
      tcmObservation: {
        tongueColor: 'Merah muda segar',
        tongueCoating: 'Putih tipis merata',
        tongueShape: 'Normal',
        pulseQuality: 'Lebih stabil dan bertenaga',
        pulseDepth: 'Sedang',
        practitionerPatternNote: 'Sirkulasi Qi bahu masih perlu dilancarkan dengan sesi akupunktur.',
      },
      procedures: [
        {
          id: 'proc-seed-2',
          serviceId: 'srv-akupunktur',
          serviceName: 'Akupunktur Tradisional',
          practitionerId: 'prac-aisyah',
          practitionerName: 'Tabibah Aisyah Rahmawati',
          performedAt: `${today}T09:15:00+07:00`,
          bodyArea: 'Bahu kanan & titik GB21, LI4',
          materialsUsed: [],
          observedResponse: 'Menunggu penyelesaian tindakan dan pencatatan persetujuan.',
          requiresConsent: true,
          status: 'terjadwal',
        },
      ],
      consents: [],
      attachments: [],
      incidents: [],
      addendums: [],
      updatedAt: `${today}T09:15:00+07:00`,
    },
  };

  const invoices: Invoice[] = [
    {
      id: 'inv-1',
      invoiceNumber: 'INV-2026-0001',
      branchId: 'br-jkt',
      visitId: 'vis-1',
      patientId: 'pat-1',
      issuedAt: `${yesterday}T11:10:00+07:00`,
      lines: [
        {
          id: 'il-1',
          itemType: 'layanan',
          refId: 'srv-tcm',
          description: 'Konsultasi TCM & Observasi Lidah-Nadi',
          quantity: 1,
          unitPrice: 175000,
          subtotal: 175000,
        },
        {
          id: 'il-2',
          itemType: 'layanan',
          refId: 'srv-herbal',
          description: 'Konsultasi Racik Herbal Terstandar',
          quantity: 1,
          unitPrice: 125000,
          subtotal: 125000,
        },
        {
          id: 'il-3',
          itemType: 'produk',
          refId: 'prd-habbat',
          batchId: 'bat-1',
          batchNumber: 'HB-2601',
          description: 'Kapsul Habbatussauda Murni (60 kapsul)',
          quantity: 1,
          unitPrice: 95000,
          subtotal: 95000,
        },
      ],
      discountAmount: 0,
      totalAmount: 395000,
      paidAmount: 395000,
      refundedAmount: 0,
      status: 'lunas',
      payments: [
        {
          id: 'pay-seed-1',
          invoiceId: 'inv-1',
          amount: 395000,
          method: 'qris_manual',
          referenceNumber: 'QRIS-20261112-881',
          qrisStatus: 'terkonfirmasi',
          receivedAt: `${yesterday}T11:12:00+07:00`,
          recordedBy: 'Budi Santoso',
          idempotencyKey: 'seed-pay-1',
        },
      ],
      createdBy: 'Budi Santoso',
    },
  ];

  const cashSessions: CashSession[] = [
    {
      id: 'cash-today',
      branchId: 'br-jkt',
      openedAt: `${today}T08:00:00+07:00`,
      openedBy: 'Budi Santoso',
      openingBalance: 500000,
      cashReceived: 0,
      transferReceived: 0,
      qrisReceived: 0,
      expenses: 0,
      refunds: 0,
      expectedCashBalance: 500000,
      status: 'terbuka',
    },
  ];

  const suppliers: Supplier[] = [
    {
      id: 'sup-1',
      name: 'CV Herba Nusantara Sentosa',
      contactName: 'Bpk. Darmawan',
      phone: '021-88901234',
      address: 'Kawasan Industri Jababeka, Bekasi',
    },
    {
      id: 'sup-2',
      name: 'PT Medika Steril Indonesia',
      contactName: 'Ibu Ratna',
      phone: '021-55678901',
      address: 'Tangerang Selatan, Banten',
    },
  ];

  const products: Product[] = [
    {
      id: 'prd-habbat',
      sku: 'HRB-HAB-60',
      name: 'Kapsul Habbatussauda Murni (60 kapsul)',
      category: 'Produk Herbal',
      unit: 'Botol',
      buyPrice: 60000,
      sellPrice: 95000,
      minStock: 10,
      supplierId: 'sup-1',
      trackExpiry: true,
    },
    {
      id: 'prd-jarum',
      sku: 'BHP-JRM-100',
      name: 'Jarum Akupunktur Steril 0.25x25mm',
      category: 'Bahan Habis Pakai',
      unit: 'Pcs',
      buyPrice: 1200,
      sellPrice: 0,
      minStock: 50,
      supplierId: 'sup-2',
      trackExpiry: true,
    },
    {
      id: 'prd-kop',
      sku: 'BHP-KOP-12',
      name: 'Kop Bekam Steril Sekali Pakai',
      category: 'Bahan Habis Pakai',
      unit: 'Set',
      buyPrice: 18000,
      sellPrice: 0,
      minStock: 15,
      supplierId: 'sup-2',
      trackExpiry: true,
    },
    {
      id: 'prd-zaitun',
      sku: 'HRB-ZTN-250',
      name: 'Minyak Zaitun Terapi Hangat 250ml',
      category: 'Produk Herbal',
      unit: 'Botol',
      buyPrice: 45000,
      sellPrice: 75000,
      minStock: 5,
      supplierId: 'sup-1',
      trackExpiry: true,
    },
  ];

  const batches: ProductBatch[] = [
    {
      id: 'bat-1',
      productId: 'prd-habbat',
      branchId: 'br-jkt',
      batchNumber: 'HB-2601',
      expiryDate: farExpiry,
      quantityAvailable: 24,
      receivedAt: `${yesterday}T08:00:00+07:00`,
    },
    {
      id: 'bat-2',
      productId: 'prd-jarum',
      branchId: 'br-jkt',
      batchNumber: 'JR-2603',
      expiryDate: farExpiry,
      quantityAvailable: 180,
      receivedAt: `${yesterday}T08:00:00+07:00`,
    },
    {
      id: 'bat-3',
      productId: 'prd-jarum',
      branchId: 'br-jkt',
      batchNumber: 'JR-2501-EXP',
      expiryDate: expiredDate,
      quantityAvailable: 20,
      receivedAt: `${yesterday}T08:00:00+07:00`,
    },
    {
      id: 'bat-4',
      productId: 'prd-kop',
      branchId: 'br-jkt',
      batchNumber: 'KP-2602',
      expiryDate: soonExpiry,
      quantityAvailable: 8, // Sengaja di bawah minStock (15) & mendekati kedaluwarsa untuk menampilkan peringatan!
      receivedAt: `${yesterday}T08:00:00+07:00`,
    },
    {
      id: 'bat-5',
      productId: 'prd-zaitun',
      branchId: 'br-bdg',
      batchNumber: 'ZT-2604',
      expiryDate: farExpiry,
      quantityAvailable: 14,
      receivedAt: `${yesterday}T08:00:00+07:00`,
    },
  ];

  const purchaseOrders: PurchaseOrder[] = [
    {
      id: 'po-1',
      poNumber: 'PO-2026-0001',
      branchId: 'br-jkt',
      supplierId: 'sup-2',
      orderDate: yesterday,
      status: 'dipesan',
      lines: [
        { productId: 'prd-kop', orderedQty: 30, receivedQty: 0, unitCost: 18000 },
        { productId: 'prd-jarum', orderedQty: 200, receivedQty: 0, unitCost: 1200 },
      ],
      createdBy: 'Rizky Maulana',
    },
  ];

  const stockMutations: StockMutation[] = [
    {
      id: 'mut-seed-1',
      branchId: 'br-jkt',
      productId: 'prd-habbat',
      batchId: 'bat-1',
      batchNumber: 'HB-2601',
      type: 'penjualan',
      quantityDelta: -1,
      sourceRef: 'INV-2026-0001',
      reason: 'Penjualan kasir',
      actorName: 'Budi Santoso',
      createdAt: `${yesterday}T11:10:00+07:00`,
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: 'aud-1',
      actorId: 'usr-praktisi',
      actorName: 'Tabibah Aisyah Rahmawati',
      actorRoles: ['praktisi'],
      branchId: 'br-jkt',
      action: 'FINALISASI_CATATAN_KLINIS',
      objectType: 'ClinicalRecord',
      objectId: 'vis-1',
      detail: 'Catatan klinis kunjungan KNJ-2026-0001 diselesaikan (Final).',
      createdAt: `${yesterday}T11:05:00+07:00`,
    },
    {
      id: 'aud-2',
      actorId: 'usr-kasir',
      actorName: 'Budi Santoso',
      actorRoles: ['kasir'],
      branchId: 'br-jkt',
      action: 'KONFIRMASI_PEMBAYARAN',
      objectType: 'Invoice',
      objectId: 'inv-1',
      detail: 'Pembayaran QRIS manual sebesar Rp 395.000 terkonfirmasi untuk INV-2026-0001.',
      createdAt: `${yesterday}T11:12:00+07:00`,
    },
  ];

  const articles: EducationalArticle[] = [
    {
      id: 'art-1',
      slug: 'mengenal-observasi-lidah-nadi-tcm',
      title: 'Mengenal Observasi Lidah dan Nadi dalam Konsultasi TCM',
      category: 'Edukasi TCM',
      readTimeMinutes: 4,
      publishedDate: yesterday,
      excerpt:
        'Bagaimana praktisi tradisional membaca warna, selaput lidah, serta ritme nadi untuk menyusun pendekatan terapi yang personal dan terukur.',
      imageUrl: '/src/assets/images/service_herbal_apothecary_1794541318909.jpg',
      content:
        'Dalam praktik Traditional Chinese Medicine (TCM), observasi lidah dan perabaan nadi merupakan pemeriksaan non-invasif yang membantu praktisi memahami kondisi energi vital, sirkulasi cairan, dan keseimbangan panas-dingin tubuh. Sebelum sesi konsultasi, pasien disarankan tidak mengonsumsi makanan atau minuman berwarna pekat agar warna alami selaput lidah dapat diamati dengan akurat.',
    },
    {
      id: 'art-2',
      slug: 'standar-sterilitas-terapi-bekam',
      title: 'Standar Sterilitas Peralatan & Persetujuan Sebelum Terapi Bekam',
      category: 'Standar Klinis',
      readTimeMinutes: 3,
      publishedDate: yesterday,
      excerpt:
        'Mengapa penggunaan kop sekali pakai, penapisan riwayat alergi serta obat pengencer darah, dan lembar persetujuan menjadi pilar keselamatan terapi.',
      imageUrl: '/src/assets/images/hero_clinic_sanctuary_1794541318828.jpg',
      content:
        'Kenyamanan dan keamanan pasien berawal dari prosedur sterilisasi yang disiplin. Di ThibbunCare, seluruh jarum akupunktur, lancet, serta kop bekam kontak darah menggunakan perlengkapan sekali pakai dengan nomor batch dan masa kedaluwarsa yang tercatat di inventaris. Sebelum tindakan dimulai, praktisi wajib menjelaskan prosedur serta mencatat persetujuan resmi pasien atau wali.',
    },
  ];

  const faqs: FaqItem[] = [
    {
      id: 'faq-1',
      question: 'Apakah saya bisa datang langsung tanpa membuat janji terlebih dahulu?',
      answer:
        'Ya, klinik menerima kunjungan langsung (walk-in) sesuai ketersediaan slot praktisi dan ruangan pada hari tersebut. Namun untuk memastikan waktu tunggu minimal, kami menyarankan pemesanan slot terlebih dahulu melalui website atau portal pasien.',
    },
    {
      id: 'faq-2',
      question: 'Apakah layanan Ruqyah Syar’iyyah tersedia di semua cabang?',
      answer:
        'Setiap layanan dapat diaktifkan per cabang sesuai ketersediaan praktisi pendamping. Saat ini layanan pendampingan Ruqyah Syar’iyyah aktif di Cabang Kemang, Jakarta Selatan dengan formulir persetujuan terpisah.',
    },
    {
      id: 'faq-3',
      question: 'Apa saja yang perlu disiapkan sebelum konsultasi TCM atau terapi bekam?',
      answer:
        'Sebaiknya tidak dalam kondisi perut terlalu kosong ataupun terlalu kenyang (makan ringan 1–2 jam sebelumnya), bawa daftar obat atau suplemen yang sedang dikonsumsi, dan sampaikan bila memiliki riwayat alergi atau gangguan pembekuan darah.',
    },
    {
      id: 'faq-4',
      question: 'Bagaimana pasien melihat kuitansi dan ringkasan kunjungan?',
      answer:
        'Pasien dapat masuk ke Portal Pasien untuk melihat jadwal kontrol, mengunduh atau mencetak kuitansi, serta membaca ringkasan kunjungan yang telah disetujui oleh praktisi untuk dibagikan.',
    },
  ];

  return {
    settings: {
      clinicName: 'Klinik Holistik ThibbunCare',
      tagline: 'Perawatan Tradisional & Holistik Terpadu',
      logoInitials: 'TC',
      primaryWhatsapp: '6281100008899',
      primaryEmail: 'halo@thibbuncare.id',
      websiteNote: 'Pelayanan konsultasi & terapi tradisional terstandar di Jakarta Selatan dan Bandung.',
      enableRoomTracking: true,
      enableRuqyahService: true,
      retentionYears: 5,
      whatsappAutoSendEnabled: false,
      qrisAutoGatewayEnabled: false,
    },
    branches,
    rooms,
    holidays,
    users,
    practitioners,
    services,
    patients,
    reservations,
    queue,
    visits,
    clinicalRecords,
    invoices,
    cashSessions,
    suppliers,
    products,
    batches,
    purchaseOrders,
    stockMutations,
    auditLogs,
    articles,
    faqs,
    sequences: {
      patient: 4,
      reservation: 104,
      visit: 3,
      invoice: 2,
      queue: 2,
      po: 2,
    },
    processedIdempotencyKeys: {},
  };
}

export function checkSlotConflict(
  db: ClinicDatabase,
  params: {
    branchId: string;
    practitionerId: string;
    roomId?: string;
    date: string;
    startTime: string;
    endTime: string;
    excludeReservationId?: string;
  }
): { hasConflict: boolean; reason?: string } {
  const holiday = db.holidays.find(
    (h) => h.date === params.date && (h.branchId === 'ALL' || h.branchId === params.branchId)
  );
  if (holiday) {
    return { hasConflict: true, reason: `Tanggal ${params.date} merupakan hari libur klinik (${holiday.label}).` };
  }

  const reqStart = timeToMinutes(params.startTime);
  const reqEnd = timeToMinutes(params.endTime);
  if (reqEnd <= reqStart) {
    return { hasConflict: true, reason: 'Waktu selesai harus lebih besar dari waktu mulai.' };
  }

  const dt = new Date(`${params.date}T00:00:00+07:00`);
  const dayOfWeek = dt.getDay();
  const prac = db.practitioners.find((p) => p.id === params.practitionerId);
  if (!prac) return { hasConflict: true, reason: 'Praktisi tidak ditemukan.' };

  const sched = prac.schedules.find(
    (s) => s.branchId === params.branchId && s.dayOfWeek === dayOfWeek
  );
  if (!sched) {
    return { hasConflict: true, reason: `${prac.name} tidak memiliki jadwal praktik di cabang ini pada hari tersebut.` };
  }

  if (reqStart < timeToMinutes(sched.startTime) || reqEnd > timeToMinutes(sched.endTime)) {
    return {
      hasConflict: true,
      reason: `Di luar jam praktik ${prac.name} (${sched.startTime}–${sched.endTime} WIB).`,
    };
  }

  // Check active reservations for overlapping interval [start, end)
  for (const r of db.reservations) {
    if (r.id === params.excludeReservationId) continue;
    if (r.date !== params.date) continue;
    if (r.status === 'batal' || r.status === 'tidak_hadir') continue;

    const rStart = timeToMinutes(r.startTime);
    const rEnd = timeToMinutes(r.endTime);
    const overlaps = reqStart < rEnd && reqEnd > rStart;
    if (!overlaps) continue;

    if (r.practitionerId === params.practitionerId) {
      return {
        hasConflict: true,
        reason: `Bentrok jadwal praktisi: ${prac.name} sudah terisi pada pukul ${r.startTime}–${r.endTime} WIB.`,
      };
    }

    if (
      db.settings.enableRoomTracking &&
      params.roomId &&
      r.roomId &&
      r.roomId === params.roomId
    ) {
      const room = db.rooms.find((rm) => rm.id === params.roomId);
      return {
        hasConflict: true,
        reason: `Bentrok penggunaan ruangan: ${room?.name ?? 'Ruangan'} sudah digunakan pukul ${r.startTime}–${r.endTime} WIB.`,
      };
    }
  }

  return { hasConflict: false };
}

export function getAvailableSlots(
  db: ClinicDatabase,
  params: {
    branchId: string;
    practitionerId: string;
    roomId?: string;
    date: string;
    durationMinutes: number;
    excludeReservationId?: string;
  }
): Array<{ startTime: string; endTime: string; available: boolean; conflictReason?: string }> {
  const dt = new Date(`${params.date}T00:00:00+07:00`);
  const dayOfWeek = dt.getDay();
  const prac = db.practitioners.find((p) => p.id === params.practitionerId);
  if (!prac) return [];
  const sched = prac.schedules.find(
    (s) => s.branchId === params.branchId && s.dayOfWeek === dayOfWeek
  );
  if (!sched) return [];

  const startMin = timeToMinutes(sched.startTime);
  const endMin = timeToMinutes(sched.endTime);
  const step = 30;
  const slots: Array<{ startTime: string; endTime: string; available: boolean; conflictReason?: string }> = [];

  for (let m = startMin; m + params.durationMinutes <= endMin; m += step) {
    const sh = String(Math.floor(m / 60)).padStart(2, '0');
    const sm = String(m % 60).padStart(2, '0');
    const startTime = `${sh}:${sm}`;
    const endTime = addMinutesToTime(startTime, params.durationMinutes);
    const check = checkSlotConflict(db, {
      branchId: params.branchId,
      practitionerId: params.practitionerId,
      roomId: params.roomId,
      date: params.date,
      startTime,
      endTime,
      excludeReservationId: params.excludeReservationId,
    });
    slots.push({
      startTime,
      endTime,
      available: !check.hasConflict,
      conflictReason: check.reason,
    });
  }
  return slots;
}

export function appendAudit(
  db: ClinicDatabase,
  actor: UserAccount | { id: string; name: string; roles: UserAccount['roles'] },
  params: { branchId?: string; action: string; objectType: string; objectId: string; detail: string }
) {
  db.auditLogs.unshift({
    id: `aud-${randomUUID().slice(0, 8)}`,
    actorId: actor.id,
    actorName: actor.name,
    actorRoles: actor.roles,
    branchId: params.branchId,
    action: params.action,
    objectType: params.objectType,
    objectId: params.objectId,
    detail: params.detail,
    createdAt: new Date().toISOString(),
  });
}

const IS_VERCEL = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
const DEMO_STATE_FILE = IS_VERCEL
  ? path.resolve('/tmp', '.thibbuncare-demo-state.json')
  : path.resolve(process.cwd(), '.thibbuncare-demo-state.json');

export function migrateLoadedDatabase(parsed: ClinicDatabase): { db: ClinicDatabase; migrated: boolean } {
  const staffRoles = new Set(['admin', 'pemilik', 'resepsionis', 'praktisi', 'asisten', 'kasir', 'inventaris']);
  const fallbackHash = hashPassword(DEFAULT_DEMO_STAFF_PASSWORD);
  let migrated = false;
  parsed.patients = parsed.patients.map((p) => {
    if (p.fullName.includes(' (Fiktif)')) {
      migrated = true;
      return { ...p, fullName: p.fullName.replace(' (Fiktif)', '') };
    }
    return p;
  });
  parsed.users = parsed.users.map((u) => {
    if (u.roles.some((r) => staffRoles.has(r)) && !u.passwordHash) {
      migrated = true;
      return { ...u, passwordHash: fallbackHash };
    }
    return u;
  });
  if (!parsed.users.some((u) => u.id === 'usr-admin')) {
    migrated = true;
    parsed.users.unshift({
      id: 'usr-admin',
      name: 'Administrator Utama Klinik (Admin Semua Fitur)',
      email: 'admin@demo.thibbuncare.id',
      passwordHash: fallbackHash,
      roles: ['admin', 'pemilik'],
      branchIds: parsed.branches.map((b) => b.id),
      permissions: {
        canAccessClinicalNotes: true,
        canCorrectPayments: true,
        canExportSensitive: true,
        canManageSettings: true,
        canManageStock: true,
      },
      active: true,
    });
  }
  return { db: parsed, migrated };
}

export function loadOrInitDemoDatabase(): ClinicDatabase {
  try {
    if (fs.existsSync(DEMO_STATE_FILE)) {
      const raw = fs.readFileSync(DEMO_STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as ClinicDatabase;
      if (parsed && Array.isArray(parsed.patients) && Array.isArray(parsed.services)) {
        const { db, migrated } = migrateLoadedDatabase(parsed);
        if (migrated) persistDemoDatabase(db);
        return db;
      }
    }
  } catch {
    // Fallback to clean seed if file unreadable
  }
  const seed = createSeedDatabase();
  persistDemoDatabase(seed);
  return seed;
}

export function persistDemoDatabase(db: ClinicDatabase): void {
  try {
    fs.writeFileSync(DEMO_STATE_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch {
    // Ignore write failure on read-only containers
  }
}

export function resetDemoDatabase(): ClinicDatabase {
  const seed = createSeedDatabase();
  persistDemoDatabase(seed);
  return seed;
}

export async function loadCloudStateFromSupabase(
  supabaseAdmin: { from: (table: string) => any } | null
): Promise<ClinicDatabase | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('thibbuncare_cloud_state')
      .select('data')
      .eq('id', 'primary')
      .maybeSingle();
    if (error || !data?.data) return null;
    const parsed = data.data as ClinicDatabase;
    if (!parsed || !Array.isArray(parsed.patients) || !Array.isArray(parsed.services)) {
      return null;
    }
    return migrateLoadedDatabase(parsed).db;
  } catch {
    return null;
  }
}

export async function persistCloudStateToSupabase(
  db: ClinicDatabase,
  supabaseAdmin: { from: (table: string) => any } | null
): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin
      .from('thibbuncare_cloud_state')
      .upsert(
        { id: 'primary', data: db, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );
  } catch {
    // Gracefully skip if cloud state table is not yet created
  }
}


