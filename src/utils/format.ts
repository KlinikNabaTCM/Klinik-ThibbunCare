export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatTanggal(isoOrDate: string | undefined | null): string {
  if (!isoOrDate) return '-';
  const date = isoOrDate.length === 10 ? new Date(`${isoOrDate}T00:00:00+07:00`) : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return isoOrDate;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatTanggalPanjang(isoOrDate: string | undefined | null): string {
  if (!isoOrDate) return '-';
  const date = isoOrDate.length === 10 ? new Date(`${isoOrDate}T00:00:00+07:00`) : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return isoOrDate;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatJam(isoOrTime: string | undefined | null): string {
  if (!isoOrTime) return '-';
  if (/^\d{2}:\d{2}$/.test(isoOrTime)) return `${isoOrTime} WIB`;
  const date = new Date(isoOrTime);
  if (Number.isNaN(date.getTime())) return isoOrTime;
  const timeStr = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${timeStr.replace('.', ':')} WIB`;
}

export function formatTanggalJam(iso: string | undefined | null): string {
  if (!iso) return '-';
  return `${formatTanggal(iso)}, ${formatJam(iso)}`;
}

export function todayJakartaISO(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '11';
  const d = parts.find((p) => p.type === 'day')?.value ?? '13';
  return `${y}-${m}-${d}`;
}

export function addMinutesToTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function buildPrivacySafeWhatsappMessage(params: {
  templateType: 'konfirmasi' | 'pengingat' | 'ubah_jadwal' | 'kontrol';
  clinicName: string;
  branchName: string;
  patientFirstName: string;
  reservationCode: string;
  date: string;
  time: string;
}): string {
  const tgl = formatTanggal(params.date);
  const jam = formatJam(params.time);
  switch (params.templateType) {
    case 'konfirmasi':
      return `Assalamu'alaikum/Halo Bapak/Ibu ${params.patientFirstName}. Reservasi Anda di ${params.clinicName} (${params.branchName}) dengan kode ${params.reservationCode} telah terkonfirmasi untuk ${tgl} pukul ${jam}. Mohon hadir 10 menit sebelumnya. Terima kasih.`;
    case 'pengingat':
      return `Pengingat jadwal ${params.clinicName} (${params.branchName}): Kunjungan dengan kode ${params.reservationCode} dijadwalkan pada ${tgl} pukul ${jam}. Jika berhalangan hadir, silakan hubungi admin kami.`;
    case 'ubah_jadwal':
      return `Pembaruan jadwal ${params.clinicName} (${params.branchName}): Reservasi kode ${params.reservationCode} telah disesuaikan menjadi ${tgl} pukul ${jam}. Terima kasih atas konfirmasinya.`;
    case 'kontrol':
      return `Salam sehat dari ${params.clinicName} (${params.branchName}). Mengingatkan jadwal kontrol lanjutan Anda pada ${tgl} pukul ${jam} (Ref: ${params.reservationCode}). Silakan hubungi kami bila ingin menyesuaikan waktu.`;
  }
}

export function buildFollowUpWhatsappMessage(params: {
  notificationType: 'tindak_lanjut_lengkap' | 'ringkasan_dibagikan' | 'kontrol_lanjutan' | 'rujukan';
  clinicName: string;
  branchName: string;
  branchWhatsapp?: string;
  patientName: string;
  visitNumber: string;
  visitDate: string;
  followUpDate?: string;
  followUpStatus?: 'dijadwalkan' | 'selesai' | 'tidak_perlu';
  referralNote?: string;
  sharedSummaryApproved: boolean;
  sharedSummaryText?: string;
  includeSharedSummaryDetail?: boolean;
}): string {
  const tglKunjungan = formatTanggal(params.visitDate);
  const lines: string[] = [
    `Assalamu'alaikum/Halo Bapak/Ibu ${params.patientName},`,
    `Berikut pemberitahuan tindak lanjut dari *${params.clinicName}* (${params.branchName}) untuk kunjungan *${params.visitNumber}* (${tglKunjungan}):`,
  ];

  const wantSummary =
    params.notificationType === 'tindak_lanjut_lengkap' ||
    params.notificationType === 'ringkasan_dibagikan';
  const wantFollowUp =
    params.notificationType === 'tindak_lanjut_lengkap' ||
    params.notificationType === 'kontrol_lanjutan';
  const wantReferral =
    params.notificationType === 'tindak_lanjut_lengkap' ||
    params.notificationType === 'rujukan';

  if (wantSummary && params.sharedSummaryApproved) {
    if (params.includeSharedSummaryDetail !== false && params.sharedSummaryText?.trim()) {
      lines.push('');
      lines.push(`*Ringkasan Kunjungan (Disetujui Dibagikan):*`);
      lines.push(params.sharedSummaryText.trim());
    } else {
      lines.push('');
      lines.push(
        `*Ringkasan Kunjungan:* Ringkasan kunjungan Anda telah disetujui dan tersedia di Portal Pasien ${params.clinicName}.`
      );
    }
  }

  if (wantFollowUp && params.followUpDate) {
    const statusLabel =
      params.followUpStatus === 'selesai'
        ? 'Selesai'
        : params.followUpStatus === 'tidak_perlu'
          ? 'Tidak Perlu Kontrol'
          : 'Dijadwalkan';
    lines.push('');
    lines.push(
      `*Jadwal Kontrol Lanjutan:* ${formatTanggal(params.followUpDate)} (Status: ${statusLabel}).`
    );
    if (params.followUpStatus !== 'tidak_perlu' && params.followUpStatus !== 'selesai') {
      lines.push(`Silakan membalas pesan ini apabila ingin mengonfirmasi jam kedatangan atau mengubah jadwal kontrol.`);
    }
  }

  if (wantReferral && params.referralNote?.trim()) {
    lines.push('');
    lines.push(`*Catatan Rujukan / Instruksi Praktisi:*`);
    lines.push(params.referralNote.trim());
  }

  lines.push('');
  lines.push(
    params.branchWhatsapp
      ? `Terima kasih atas kepercayaan Anda. Info lebih lanjut hubungi kami di ${params.branchWhatsapp}.`
      : `Terima kasih atas kepercayaan Anda kepada ${params.clinicName}.`
  );

  return lines.join('\n');
}

export const FOLLOWUP_TEMPLATE_LABELS: Record<string, string> = {
  tindak_lanjut_lengkap: 'Lengkap (Ringkasan, Kontrol & Rujukan)',
  ringkasan_dibagikan: 'Ringkasan Dibagikan',
  kontrol_lanjutan: 'Kontrol Lanjutan',
  rujukan: 'Catatan Rujukan',
};

export function buildWhatsappDraftUrl(phone: string, message: string): string {
  const cleaned = phone.replace(/[^\d]/g, '');
  const normalized = cleaned.startsWith('0') ? `62${cleaned.slice(1)}` : cleaned;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export const ROLE_LABELS: Record<string, string> = {
  pemilik: 'Pemilik / Manajer',
  resepsionis: 'Resepsionis',
  praktisi: 'Praktisi',
  asisten: 'Asisten Praktisi',
  kasir: 'Kasir',
  inventaris: 'Petugas Inventaris',
  pasien: 'Pasien',
};

export const RESERVATION_STATUS_LABELS: Record<string, string> = {
  menunggu_konfirmasi: 'Menunggu Konfirmasi',
  terkonfirmasi: 'Terkonfirmasi',
  check_in: 'Check-In',
  batal: 'Batal',
  tidak_hadir: 'Tidak Hadir',
};

export const QUEUE_STATUS_LABELS: Record<string, string> = {
  menunggu: 'Menunggu',
  dipanggil: 'Dipanggil',
  sedang_dilayani: 'Sedang Dilayani',
  selesai: 'Selesai',
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  belum_bayar: 'Belum Bayar',
  dibayar_sebagian: 'Dibayar Sebagian',
  lunas: 'Lunas',
  dibatalkan: 'Dibatalkan',
};
