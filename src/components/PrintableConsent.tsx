import React from 'react';
import { Printer, X } from 'lucide-react';
import type { Branch, ClinicSettings, ConsentRecord, Patient, ServiceItem, Visit } from '../types/clinic';
import { formatTanggal, formatTanggalJam } from '../utils/format';

interface PrintableConsentProps {
  consent?: ConsentRecord;
  formType: 'terapi_umum' | 'bekam_akupunktur' | 'ruqyah_syariyyah';
  settings: ClinicSettings;
  branch?: Branch;
  patient?: Patient;
  visit: Visit;
  services: ServiceItem[];
  onClose: () => void;
}

export const PrintableConsent: React.FC<PrintableConsentProps> = ({
  consent,
  formType,
  settings,
  branch,
  patient,
  visit,
  services,
  onClose,
}) => {
  const isRuqyah = formType === 'ruqyah_syariyyah';
  const title = isRuqyah
    ? 'Formulir Persetujuan Pendampingan Spiritual (Ruqyah Syar’iyyah)'
    : formType === 'bekam_akupunktur'
    ? 'Formulir Persetujuan Tindakan Bekam Steril / Akupunktur'
    : 'Formulir Persetujuan Terapi Holistik';

  const targetedServices = consent
    ? services.filter((s) => consent.serviceIds.includes(s.id))
    : services.filter((s) => visit.serviceIds.includes(s.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="print-sheet w-full max-w-2xl rounded-lg border border-[#DCCDB6] bg-white p-6 sm:p-8 text-[#1F241D]">
        <div className="no-print mb-5 flex items-center justify-between border-b border-[#EFE8DC] pb-3">
          <span className="text-xs font-semibold text-[#5E645A]">Pratinjau Cetak Formulir Persetujuan</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded bg-[#3D4F35] px-3.5 py-1.5 text-xs font-semibold text-white"
            >
              <Printer className="h-3.5 w-3.5" />
              Cetak Formulir
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#D4C5AF] p-1.5 text-[#5E645A]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-[#E4DDD0] pb-4">
          <div className="font-editorial text-lg font-bold text-[#2F3E29]">{settings.clinicName}</div>
          <div className="text-xs text-[#5E645A]">
            {branch?.name} · {branch?.address}
          </div>
          <h2 className="mt-3 font-editorial text-xl font-semibold text-[#1F241D]">{title}</h2>
          <div className="mt-1 font-mono text-xs text-[#5E645A]">
            Versi: {consent?.formVersion || (isRuqyah ? 'v2.1-RUQYAH' : 'v2.0-TERAPI')} · Kunjungan:{' '}
            {visit.visitNumber}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 rounded bg-[#FBF8F3] p-4 text-xs sm:grid-cols-2">
          <div>
            <span className="text-[#5E645A]">Nama Pasien:</span>{' '}
            <span className="font-semibold">{patient?.fullName || '-'}</span>
          </div>
          <div>
            <span className="text-[#5E645A]">No. Pasien:</span>{' '}
            <span className="font-mono font-semibold">{patient?.patientNumber || '-'}</span>
          </div>
          <div>
            <span className="text-[#5E645A]">Tanggal Lahir:</span>{' '}
            <span className="font-mono">{formatTanggal(patient?.dateOfBirth)}</span>
          </div>
          <div>
            <span className="text-[#5E645A]">Layanan Terkait:</span>{' '}
            <span className="font-medium">{targetedServices.map((s) => s.name).join(', ') || '-'}</span>
          </div>
        </div>

        <div className="mt-4 space-y-2.5 text-xs leading-relaxed text-[#4A5045]">
          {isRuqyah ? (
            <>
              <p>
                1. Layanan <strong>Pendampingan Ruqyah Syar’iyyah</strong> merupakan layanan pendampingan spiritual berbasis doa dan ketenangan hati, dan bukan pengganti tata laksana medis darurat.
              </p>
              <p>
                2. Pasien atau wali memahami jalannya sesi pendampingan, tata tertib pendampingan mahram/keluarga bila diperlukan, serta berhak menghentikan sesi kapan saja.
              </p>
            </>
          ) : (
            <>
              <p>
                1. Saya telah menerima penjelasan mengenai prosedur tindakan, manfaat yang diharapkan, alternatif, serta risiko ringan yang mungkin timbul (misalnya kemerahan kulit sementara, pusing ringan, atau rasa hangat).
              </p>
              <p>
                2. Saya telah menyampaikan riwayat alergi, kondisi medis, dan obat/suplemen yang sedang dikonsumsi secara jujur kepada praktisi.
              </p>
              <p>
                3. Klinik menggunakan bahan kontak darah/jarum steril sekali pakai dengan batch yang tercatat.
              </p>
            </>
          )}
        </div>

        <div className="mt-6 rounded border border-[#D4C5AF] p-4 text-xs">
          {consent ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[#5E645A]">Keputusan</div>
                <div className="mt-0.5 text-sm font-bold text-[#2F3E29]">
                  {consent.decision === 'disetujui' ? 'DISETUJUI' : 'DITOLAK'}
                </div>
                <div className="mt-2 text-[#5E645A]">Catatan: {consent.notes || '-'}</div>
              </div>
              <div>
                <div className="text-[#5E645A]">Penanda Tangan ({consent.signerRole})</div>
                <div className="mt-0.5 font-semibold">{consent.signerName}</div>
                <div className="mt-2 text-[#5E645A]">
                  Dicatat oleh {consent.recordedBy} pada {formatTanggalJam(consent.recordedAt)}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-8 pt-6 text-center">
              <div>
                <div className="h-14 border-b border-[#D4C5AF]" />
                <div className="mt-1.5 font-semibold">Pasien / Wali</div>
              </div>
              <div>
                <div className="h-14 border-b border-[#D4C5AF]" />
                <div className="mt-1.5 font-semibold">Praktisi / Petugas Pencatat</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
