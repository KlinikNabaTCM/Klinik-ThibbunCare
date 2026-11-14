import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  Lock,
  Paperclip,
  Plus,
  Printer,
  ShieldAlert,
} from 'lucide-react';
import { ApiError, apiRequest, type DemoAccountSummary } from '../../lib/api';
import type {
  Branch,
  ClinicSettings,
  ClinicalRecord,
  ConsentRecord,
  Patient,
  Product,
  ProductBatch,
  ServiceItem,
  Visit,
} from '../../types/clinic';
import { formatTanggal, formatTanggalJam, todayJakartaISO } from '../../utils/format';
import { PrintableConsent } from '../PrintableConsent';
import { FollowUpWhatsappPanel } from './FollowUpWhatsappPanel';

interface ClinicalModuleProps {
  currentAccount: DemoAccountSummary;
  settings: ClinicSettings;
  whatsappProviderConfigured?: boolean;
  branches: Branch[];
  visits: Visit[];
  patients: Patient[];
  services: ServiceItem[];
  products: Product[];
  batches: ProductBatch[];
  selectedVisitId?: string;
  onSelectVisitId: (id: string) => void;
  onRefresh: () => Promise<void>;
  onGoToCashier: (visitId: string) => void;
}

type ClinicalTab = 'asesmen' | 'tcm' | 'tindakan' | 'persetujuan' | 'lampiran' | 'tindak_lanjut';

export const ClinicalModule: React.FC<ClinicalModuleProps> = ({
  currentAccount,
  settings,
  whatsappProviderConfigured = false,
  branches,
  visits,
  patients,
  services,
  products,
  batches,
  selectedVisitId,
  onSelectVisitId,
  onRefresh,
  onGoToCashier,
}) => {
  const activeVisitId = selectedVisitId || visits[0]?.id || '';
  const activeVisit = visits.find((v) => v.id === activeVisitId);
  const activePatient = patients.find((p) => p.id === activeVisit?.patientId);

  const isPractitioner = currentAccount.roles.includes('praktisi');
  const canRecordProc = isPractitioner || currentAccount.roles.includes('asisten');

  const [tab, setTab] = useState<ClinicalTab>('asesmen');
  const [record, setRecord] = useState<ClinicalRecord | null>(null);
  const [printConsentState, setPrintConsentState] = useState<{
    consent?: ConsentRecord;
    formType: 'terapi_umum' | 'bekam_akupunktur' | 'ruqyah_syariyyah';
  } | null>(null);
  const [accessDenied, setAccessDenied] = useState<{ status: number; code: string; message: string } | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Draft form state
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [onsetAndCourse, setOnsetAndCourse] = useState('');
  const [relevantHistory, setRelevantHistory] = useState('');
  const [allergies, setAllergies] = useState('');
  const [meds, setMeds] = useState('');
  const [bp, setBp] = useState('');
  const [pulseRate, setPulseRate] = useState('');
  const [temp, setTemp] = useState('');
  const [weight, setWeight] = useState('');

  // TCM
  const [tongueColor, setTongueColor] = useState('');
  const [tongueCoating, setTongueCoating] = useState('');
  const [tongueShape, setTongueShape] = useState('');
  const [pulseQuality, setPulseQuality] = useState('');
  const [pulseDepth, setPulseDepth] = useState('');
  const [patternNote, setPatternNote] = useState('');

  // Consent form
  const [consentServiceId, setConsentServiceId] = useState('');
  const [consentFormType, setConsentFormType] = useState<'terapi_umum' | 'bekam_akupunktur' | 'ruqyah_syariyyah'>(
    'bekam_akupunktur'
  );
  const [consentDecision, setConsentDecision] = useState<'disetujui' | 'ditolak'>('disetujui');
  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState<'pasien' | 'wali'>('pasien');
  const [consentNotes, setConsentNotes] = useState('');

  // Procedure + material batch form (with idempotency key!)
  const [procServiceId, setProcServiceId] = useState('');
  const [bodyArea, setBodyArea] = useState('');
  const [observedResp, setObservedResp] = useState('');
  const [matProductId, setMatProductId] = useState(products[1]?.id || products[0]?.id || '');
  const [matBatchId, setMatBatchId] = useState('');
  const [matQty, setMatQty] = useState(1);
  const [procIdemKey, setProcIdemKey] = useState(() => `proc-${Date.now()}`);

  // Attachment
  const [attFileName, setAttFileName] = useState('hasil_lab_pendukung.pdf');
  const [attCategory, setAttCategory] = useState('Hasil Penunjang');
  const [signedLinkData, setSignedLinkData] = useState<{
    signedUrl: string;
    expiresAt: string;
    storagePath: string;
    preview?: {
      fileName: string;
      category: string;
      storagePath: string;
      uploadedBy: string;
      uploadedAt: string;
      note: string;
    };
  } | null>(null);

  // Follow-up & incidents
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpStatus, setFollowUpStatus] = useState<'dijadwalkan' | 'selesai' | 'tidak_perlu'>('dijadwalkan');
  const [referralNote, setReferralNote] = useState('');
  const [sharedApproved, setSharedApproved] = useState(false);
  const [sharedText, setSharedText] = useState('');
  const [incDesc, setIncDesc] = useState('');
  const [incAction, setIncAction] = useState('');

  // Addendum (Correction on Finalized Note)
  const [addReason, setAddReason] = useState('');
  const [addText, setAddText] = useState('');

  const loadClinical = async (visitId: string) => {
    if (!visitId) return;
    setLoading(true);
    setAccessDenied(null);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ clinicalRecord: ClinicalRecord; visit: Visit }>(
        `/api/visits/${visitId}/clinical`
      );
      const rec = res.clinicalRecord;
      setRecord(rec);
      setChiefComplaint(rec.generalAssessment.chiefComplaint);
      setOnsetAndCourse(rec.generalAssessment.onsetAndCourse);
      setRelevantHistory(rec.generalAssessment.relevantHistory);
      setAllergies(rec.generalAssessment.allergies);
      setMeds(rec.generalAssessment.medicationsOrSupplements);
      setBp(rec.generalAssessment.measurements.bloodPressure || '');
      setPulseRate(rec.generalAssessment.measurements.pulseRate || '');
      setTemp(rec.generalAssessment.measurements.temperature || '');
      setWeight(rec.generalAssessment.measurements.weightKg || '');

      setTongueColor(rec.tcmObservation.tongueColor);
      setTongueCoating(rec.tcmObservation.tongueCoating);
      setTongueShape(rec.tcmObservation.tongueShape);
      setPulseQuality(rec.tcmObservation.pulseQuality);
      setPulseDepth(rec.tcmObservation.pulseDepth);
      setPatternNote(rec.tcmObservation.practitionerPatternNote);

      const firstSrvId = res.visit.serviceIds[0] || services[0]?.id || '';
      setProcServiceId(firstSrvId);
      setConsentServiceId(res.visit.serviceIds.find((id) => services.find((s) => s.id === id)?.requiresConsent) || firstSrvId);
      setSignerName(patients.find((p) => p.id === res.visit.patientId)?.fullName || '');

      setFollowUpDate(res.visit.followUpDate || '');
      setFollowUpStatus(res.visit.followUpStatus || 'dijadwalkan');
      setReferralNote(res.visit.referralNote || '');
      setSharedApproved(res.visit.sharedSummaryApproved);
      setSharedText(res.visit.sharedSummaryText || '');
    } catch (err) {
      setRecord(null);
      if (err instanceof ApiError && err.status === 403) {
        setAccessDenied({ status: err.status, code: err.code, message: err.message });
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat catatan klinis.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSignedLinkData(null);
    setNotice(null);
    if (activeVisitId) loadClinical(activeVisitId);
  }, [activeVisitId, currentAccount.id]);

  useEffect(() => {
    if (matProductId && !products.some((p) => p.id === matProductId)) {
      setMatProductId('');
      setMatBatchId('');
    }
  }, [products]);

  const handleSaveDraft = async () => {
    if (!activeVisitId) return;
    setErrorMsg(null);
    setNotice(null);
    try {
      await apiRequest(`/api/visits/${activeVisitId}/clinical`, {
        method: 'PUT',
        body: JSON.stringify({
          generalAssessment: {
            chiefComplaint,
            onsetAndCourse,
            relevantHistory,
            allergies,
            medicationsOrSupplements: meds,
            measurements: { bloodPressure: bp, pulseRate, temperature: temp, weightKg: weight },
          },
          tcmObservation: {
            tongueColor,
            tongueCoating,
            tongueShape,
            pulseQuality,
            pulseDepth,
            practitionerPatternNote: patternNote,
          },
        }),
      });
      setNotice('Draf asesmen & observasi TCM berhasil disimpan.');
      await loadClinical(activeVisitId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan draf.');
    }
  };

  const handleRecordConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVisitId) return;
    setErrorMsg(null);
    setNotice(null);
    try {
      await apiRequest(`/api/visits/${activeVisitId}/consents`, {
        method: 'POST',
        body: JSON.stringify({
          formType: consentFormType,
          serviceIds: [consentServiceId],
          decision: consentDecision,
          signerName,
          signerRole,
          notes: consentNotes,
        }),
      });
      setNotice('Formulir persetujuan tindakan berhasil dicatat.');
      setConsentNotes('');
      await loadClinical(activeVisitId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mencatat persetujuan.');
    }
  };

  const submitProcedure = async (useSameKey: boolean) => {
    if (!activeVisitId) return;
    setErrorMsg(null);
    setNotice(null);
    if (matProductId && !matBatchId) {
      setErrorMsg('Pilih nomor batch bahan terlebih dahulu sebelum mencatat pemakaian bahan.');
      return;
    }

    const keyToSend = useSameKey ? procIdemKey : `proc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (!useSameKey) setProcIdemKey(keyToSend);

    const materialsUsed =
      matProductId && matBatchId
        ? [{ productId: matProductId, batchId: matBatchId, quantity: Number(matQty) }]
        : [];

    try {
      const res = await apiRequest<{ idempotentReplay?: boolean; message?: string }>(
        `/api/visits/${activeVisitId}/procedures`,
        {
          method: 'POST',
          body: JSON.stringify({
            serviceId: procServiceId,
            bodyArea,
            observedResponse: observedResp,
            materialsUsed,
            completeNow: true,
            idempotencyKey: keyToSend,
          }),
        }
      );
      setNotice(
        res.idempotentReplay
          ? res.message || 'Pengiriman ulang diblokir: hanya 1 mutasi stok tercatat.'
          : 'Tindakan & pemakaian bahan batch berhasil dicatat.'
      );
      await Promise.all([loadClinical(activeVisitId), onRefresh()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mencatat tindakan.');
    }
  };

  const handleCompleteExistingProc = async (procId: string) => {
    if (!activeVisitId) return;
    setErrorMsg(null);
    setNotice(null);
    try {
      await apiRequest(`/api/visits/${activeVisitId}/procedures/${procId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ observedResponse: observedResp || 'Tindakan diselesaikan sesuai prosedur.' }),
      });
      setNotice('Tindakan diselesaikan.');
      await loadClinical(activeVisitId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyelesaikan tindakan.');
      if (err instanceof ApiError && err.code === 'CONSENT_REQUIRED') {
        setTab('persetujuan');
      }
    }
  };

  const handleFinalize = async () => {
    if (!activeVisitId) return;
    setErrorMsg(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ autoInvoice?: { invoiceNumber: string } }>(
        `/api/visits/${activeVisitId}/clinical/finalize`,
        { method: 'POST' }
      );
      setNotice(
        res.autoInvoice
          ? `Catatan klinis selesai difinalkan (Final). Tagihan ${res.autoInvoice.invoiceNumber} otomatis disiapkan di Kasir.`
          : 'Catatan klinis selesai difinalkan (Final). Perubahan selanjutnya dicatat sebagai koreksi bertanggal.'
      );
      await Promise.all([loadClinical(activeVisitId), onRefresh()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memfinalkan catatan.');
    }
  };

  const handleAddAddendum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVisitId) return;
    setErrorMsg(null);
    setNotice(null);
    try {
      await apiRequest(`/api/visits/${activeVisitId}/clinical/addendum`, {
        method: 'POST',
        body: JSON.stringify({ reason: addReason, correctionText: addText }),
      });
      setAddReason('');
      setAddText('');
      setNotice('Koreksi bertanggal berhasil ditambahkan; catatan final asli tetap utuh.');
      await loadClinical(activeVisitId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambahkan koreksi.');
    }
  };

  const persistFollowUpChanges = async (): Promise<boolean> => {
    if (!activeVisitId) return false;
    setErrorMsg(null);
    try {
      await apiRequest(`/api/visits/${activeVisitId}/follow-up`, {
        method: 'PATCH',
        body: JSON.stringify({
          followUpDate,
          followUpStatus,
          referralNote,
          sharedSummaryApproved: sharedApproved,
          sharedSummaryText: sharedText,
        }),
      });
      await onRefresh();
      return true;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan tindak lanjut.');
      return false;
    }
  };

  const handleSaveFollowUp = async () => {
    const ok = await persistFollowUpChanges();
    if (ok) {
      setNotice('Instruksi tindak lanjut, jadwal kontrol, & persetujuan ringkasan portal disimpan.');
    }
  };

  const handleScheduleFollowUpReservation = async () => {
    if (!activeVisit || !followUpDate) return;
    setErrorMsg(null);
    setNotice(null);
    try {
      const ok = await persistFollowUpChanges();
      if (!ok) return;
      const srvId = activeVisit.serviceIds[0] || services[0]?.id;
      const avail = await apiRequest<{ slots?: Array<{ startTime?: string; time?: string; available: boolean }> }>(
        `/api/public/availability?branchId=${encodeURIComponent(activeVisit.branchId)}&practitionerId=${encodeURIComponent(
          activeVisit.practitionerId
        )}&serviceIds=${encodeURIComponent(srvId)}&date=${encodeURIComponent(followUpDate)}`
      ).catch(() => ({ slots: [] }));
      const firstOpenSlotObj = avail.slots?.find((s) => s.available);
      const firstOpenSlot = firstOpenSlotObj?.startTime || firstOpenSlotObj?.time || '10:00';
      const created = await apiRequest<{ reservation: { reservationCode: string; date: string; startTime: string } }>(
        '/api/reservations',
        {
          method: 'POST',
          body: JSON.stringify({
            branchId: activeVisit.branchId,
            patientId: activeVisit.patientId,
            practitionerId: activeVisit.practitionerId,
            serviceIds: [srvId],
            date: followUpDate,
            startTime: firstOpenSlot,
            notes: `Kontrol lanjutan dari kunjungan ${activeVisit.visitNumber}`,
            whatsappConsent: true,
          }),
        }
      );
      setNotice(
        `Jadwal kontrol tersimpan & reservasi ${created.reservation.reservationCode} (${formatTanggal(
          created.reservation.date
        )}, ${created.reservation.startTime} WIB) otomatis tercatat ke Kalender & Portal Pasien.`
      );
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menjadwalkan reservasi kontrol.');
    }
  };

  const handleLogIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVisitId) return;
    try {
      await apiRequest(`/api/visits/${activeVisitId}/incidents`, {
        method: 'POST',
        body: JSON.stringify({ description: incDesc, actionTaken: incAction, followUpStatus: 'dipantau' }),
      });
      setIncDesc('');
      setIncAction('');
      await loadClinical(activeVisitId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mencatat kejadian.');
    }
  };

  const handleUploadAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVisitId) return;
    setErrorMsg(null);
    try {
      await apiRequest(`/api/visits/${activeVisitId}/attachments`, {
        method: 'POST',
        body: JSON.stringify({ fileName: attFileName, category: attCategory }),
      });
      setNotice('Lampiran privat berhasil dicatat.');
      await loadClinical(activeVisitId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mencatat lampiran.');
    }
  };

  const handleRequestSignedAccess = async (attId: string) => {
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ signedUrl: string; expiresAt: string; storagePath: string }>(
        `/api/attachments/${attId}/signed-access`
      );
      setSignedLinkData({
        signedUrl: res.signedUrl,
        expiresAt: res.expiresAt,
        storagePath: res.storagePath,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menerbitkan tautan sementara.');
    }
  };

  const handleOpenSignedAttachment = async () => {
    if (!signedLinkData) return;
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        fileName: string;
        category: string;
        storagePath: string;
        uploadedBy: string;
        uploadedAt: string;
        note: string;
      }>(signedLinkData.signedUrl);
      setSignedLinkData({ ...signedLinkData, preview: res });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Tautan sementara kedaluwarsa atau gagal diakses.');
    }
  };

  const branchBatches = batches.filter(
    (b) => b.branchId === activeVisit?.branchId && b.productId === matProductId
  );

  // If server returned 403 Forbidden (e.g. Kasir, Inventaris, Resepsionis, Pemilik non-klinis)
  if (accessDenied) {
    return (
      <div className="rounded-lg border border-[#DC2626]/30 bg-white p-8">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#991B1B]">
          <Lock className="h-5 w-5" />
          Akses Catatan Klinis Ditolak oleh Server (HTTP {accessDenied.status})
        </div>
        <p className="mt-2 text-sm text-[#4A5045]">{accessDenied.message}</p>
        <p className="mt-2 font-mono text-xs text-[#5E645A]">
          Akun aktif: {currentAccount.name} · Izin Klinis:{' '}
          {currentAccount.permissions.canAccessClinicalNotes ? 'Aktif' : 'Nonaktif'} · Kode:{' '}
          {accessDenied.code}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 border-b border-[#E4DDD0] pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-editorial text-2xl font-semibold text-[#1F241D]">
            Ruang Kerja Praktisi · Asesmen & Terapi
          </h1>
          <p className="text-xs text-[#5E645A]">
            Dokumentasi terapi oleh praktisi berwenang dengan persetujuan wajib dan riwayat koreksi bertanggal.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activeVisitId}
            onChange={(e) => onSelectVisitId(e.target.value)}
            className="rounded border border-[#D4C5AF] bg-white px-3 py-2 font-mono text-xs"
          >
            {visits.map((v) => {
              const p = patients.find((pt) => pt.id === v.patientId);
              return (
                <option key={v.id} value={v.id}>
                  {v.visitNumber} · {p?.fullName} ({formatTanggal(v.visitDate)})
                </option>
              );
            })}
          </select>
          {activeVisit && (
            <button
              type="button"
              onClick={() => onGoToCashier(activeVisit.id)}
              className="rounded border border-[#734F2C] bg-[#F5EFE6] px-3 py-2 text-xs font-semibold text-[#5C3D21]"
            >
              Lanjut ke Kasir
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] p-3.5 text-xs font-medium text-[#991B1B]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-md border border-[#3D4F35]/30 bg-[#F4F6F1] p-3.5 text-xs font-medium text-[#243020]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-[#E4DDD0] bg-white p-8 text-center text-sm text-[#5E645A]">
          Memuat ruang kerja klinis...
        </div>
      ) : !record || !activeVisit ? (
        <div className="rounded-lg border border-[#E4DDD0] bg-white p-8 text-center text-sm text-[#5E645A]">
          Belum ada kunjungan aktif untuk ditampilkan di ruang kerja klinis. Lakukan Check-In pasien terlebih dahulu melalui menu Jadwal & Reservasi atau Check-In & Antrean.
        </div>
      ) : (
        <>
          {!isPractitioner && (
            <div className="rounded-md border border-[#D4C5AF] bg-[#F5EFE6] px-4 py-2.5 text-xs text-[#5C3D21]">
              {currentAccount.roles.includes('asisten')
                ? `Mode Asisten Praktisi (Tugas Delegasi: ${(currentAccount.permissions.delegatedTasks || []).join(', ').replaceAll('_', ' ') || 'pendampingan'}). Pencatatan asesmen, persetujuan, dan tindakan didelegasikan dapat dilakukan; finalisasi catatan final & koreksi bertanggal hanya oleh Praktisi.`
                : 'Mode Tinjau Pemilik (Akses Klinis Aktif): Anda dapat meninjau catatan klinis dan membuka lampiran privat. Pengisian & finalisasi catatan terapi merupakan kewenangan Praktisi.'}
            </div>
          )}

          {/* Visit Banner + Finalize Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#E4DDD0] bg-white p-4">
            <div>
              <div className="font-mono text-xs font-semibold text-[#3D4F35]">
                {activeVisit.visitNumber} · {activePatient?.patientNumber} · Status Catatan:{' '}
                {record.status === 'final' ? 'FINAL (Terkunci)' : 'DRAF'}
              </div>
              <div className="font-editorial text-lg font-semibold text-[#1F241D]">
                {activePatient?.fullName}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {record.status === 'draf' && canRecordProc && (
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="rounded border border-[#3D4F35] px-3.5 py-2 text-xs font-semibold text-[#3D4F35]"
                >
                  Simpan Draf
                </button>
              )}
              {record.status === 'draf' && isPractitioner && (
                <button
                  type="button"
                  onClick={handleFinalize}
                  className="inline-flex items-center gap-1.5 rounded bg-[#3D4F35] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2F3E29]"
                >
                  <FileCheck2 className="h-4 w-4" />
                  Finalkan Catatan Klinis
                </button>
              )}
            </div>
          </div>

          {/* 6 Clinical Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-[#E4DDD0]">
            {(
              [
                ['asesmen', 'Asesmen Umum'],
                ['tcm', 'Observasi TCM'],
                ['tindakan', 'Tindakan'],
                ['persetujuan', 'Persetujuan'],
                ['lampiran', 'Lampiran'],
                ['tindak_lanjut', 'Tindak Lanjut & Kejadian'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === key
                    ? 'border-[#3D4F35] text-[#2F3E29]'
                    : 'border-transparent text-[#5E645A] hover:text-[#1F241D]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="rounded-lg border border-[#E4DDD0] bg-white p-6 text-xs">
            {tab === 'asesmen' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Keluhan Utama</label>
                    <textarea
                      rows={3}
                      disabled={record.status === 'final'}
                      value={chiefComplaint}
                      onChange={(e) => setChiefComplaint(e.target.value)}
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] p-2.5 text-sm disabled:opacity-70"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Awal & Perkembangan Keluhan</label>
                    <textarea
                      rows={3}
                      disabled={record.status === 'final'}
                      value={onsetAndCourse}
                      onChange={(e) => setOnsetAndCourse(e.target.value)}
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] p-2.5 text-sm disabled:opacity-70"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Riwayat Relevan</label>
                    <input
                      type="text"
                      disabled={record.status === 'final'}
                      value={relevantHistory}
                      onChange={(e) => setRelevantHistory(e.target.value)}
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm disabled:opacity-70"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Alergi & Obat/Suplemen Saat Ini</label>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        disabled={record.status === 'final'}
                        value={allergies}
                        onChange={(e) => setAllergies(e.target.value)}
                        placeholder="Alergi"
                        className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                      />
                      <input
                        type="text"
                        disabled={record.status === 'final'}
                        value={meds}
                        onChange={(e) => setMeds(e.target.value)}
                        placeholder="Obat / suplemen"
                        className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Tekanan Darah</label>
                    <input
                      type="text"
                      disabled={record.status === 'final'}
                      value={bp}
                      onChange={(e) => setBp(e.target.value)}
                      placeholder="120/80 mmHg"
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Nadi</label>
                    <input
                      type="text"
                      disabled={record.status === 'final'}
                      value={pulseRate}
                      onChange={(e) => setPulseRate(e.target.value)}
                      placeholder="76 x/mnt"
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Suhu</label>
                    <input
                      type="text"
                      disabled={record.status === 'final'}
                      value={temp}
                      onChange={(e) => setTemp(e.target.value)}
                      placeholder="36.5 °C"
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Berat Badan</label>
                    <input
                      type="text"
                      disabled={record.status === 'final'}
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="60 kg"
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2 font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {tab === 'tcm' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Warna Lidah</label>
                    <input
                      type="text"
                      disabled={record.status === 'final'}
                      value={tongueColor}
                      onChange={(e) => setTongueColor(e.target.value)}
                      placeholder="Merah muda / Pucat / Merah tua"
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Selaput Lidah</label>
                    <input
                      type="text"
                      disabled={record.status === 'final'}
                      value={tongueCoating}
                      onChange={(e) => setTongueCoating(e.target.value)}
                      placeholder="Putih tipis / Kuning tebal"
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Bentuk Lidah</label>
                    <input
                      type="text"
                      disabled={record.status === 'final'}
                      value={tongueShape}
                      onChange={(e) => setTongueShape(e.target.value)}
                      placeholder="Normal / Bekas gigi"
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Kualitas Nadi</label>
                    <input
                      type="text"
                      disabled={record.status === 'final'}
                      value={pulseQuality}
                      onChange={(e) => setPulseQuality(e.target.value)}
                      placeholder="Halus (Xi) / Licin (Hua) / Tegang (Xian)"
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Kedalaman Nadi</label>
                    <input
                      type="text"
                      disabled={record.status === 'final'}
                      value={pulseDepth}
                      onChange={(e) => setPulseDepth(e.target.value)}
                      placeholder="Dangkal / Sedang / Dalam"
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
                    />
                  </div>
                </div>
                <div className="border-t border-[#EFE8DC] pt-4">
                  <label className="block font-semibold text-[#2F3E29]">
                    Interpretasi Pola TCM (Ditulis Langsung oleh Praktisi Berwenang)
                  </label>
                  <textarea
                    rows={3}
                    disabled={record.status === 'final'}
                    value={patternNote}
                    onChange={(e) => setPatternNote(e.target.value)}
                    placeholder="Tuliskan interpretasi pola dan pertimbangan terapi Anda sendiri..."
                    className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] p-3 text-sm"
                  />
                </div>
              </div>
            )}

            {tab === 'tindakan' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-[#1F241D]">Daftar Tindakan pada Kunjungan Ini</h3>
                  <div className="mt-2 divide-y divide-[#EFE8DC] rounded border border-[#EFE8DC]">
                    {record.procedures.map((proc) => (
                      <div key={proc.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div>
                          <div className="font-semibold text-[#1F241D]">
                            {proc.serviceName} · <span className="font-mono">{proc.status.toUpperCase()}</span>
                          </div>
                          <div className="text-[#5E645A]">
                            Area: {proc.bodyArea || '-'} · Respons: {proc.observedResponse || '-'}
                          </div>
                          {proc.materialsUsed.length > 0 && (
                            <div className="font-mono text-[11px] text-[#734F2C]">
                              Bahan:{' '}
                              {proc.materialsUsed
                                .map((m) => `Batch ${m.batchNumber} (-${m.quantity} ${m.unit})`)
                                .join(', ')}
                            </div>
                          )}
                        </div>
                        {proc.status !== 'selesai' && record.status === 'draf' && isPractitioner && (
                          <button
                            type="button"
                            onClick={() => handleCompleteExistingProc(proc.id)}
                            className="rounded bg-[#3D4F35] px-3 py-1.5 font-semibold text-white"
                          >
                            Selesaikan Tindakan
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {record.status === 'draf' && canRecordProc && (
                  <div className="border-t border-[#EFE8DC] pt-4 space-y-3">
                    <h3 className="font-semibold text-[#1F241D]">
                      Catat Tindakan & Pemakaian Bahan Berbasis Batch
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block font-semibold text-[#4A5045]">Layanan</label>
                        <select
                          value={procServiceId}
                          onChange={(e) => setProcServiceId(e.target.value)}
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                        >
                          {services.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-[#4A5045]">Area Tindakan</label>
                        <input
                          type="text"
                          value={bodyArea}
                          onChange={(e) => setBodyArea(e.target.value)}
                          placeholder="Contoh: Punggung atas / Titik ST36"
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-[#4A5045]">Respons yang Diamati</label>
                        <input
                          type="text"
                          value={observedResp}
                          onChange={(e) => setObservedResp(e.target.value)}
                          placeholder="Pasien nyaman, otot lebih rileks"
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 rounded border border-[#EFE8DC] bg-[#FBF8F3] p-3 sm:grid-cols-4">
                      <div className="sm:col-span-2">
                        <label className="block font-semibold text-[#4A5045]">Bahan Habis Pakai</label>
                        <select
                          value={matProductId}
                          onChange={(e) => {
                            setMatProductId(e.target.value);
                            setMatBatchId('');
                          }}
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-2"
                        >
                          <option value="">-- Tanpa pemakaian bahan --</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-[#4A5045]">Pilih Batch</label>
                        <select
                          value={matBatchId}
                          onChange={(e) => setMatBatchId(e.target.value)}
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-2 font-mono"
                        >
                          <option value="">-- Pilih Batch --</option>
                          {branchBatches.map((b) => {
                            const isExp = b.expiryDate && b.expiryDate < todayJakartaISO();
                            return (
                              <option key={b.id} value={b.id}>
                                {b.batchNumber} (Stok {b.quantityAvailable} · ED {b.expiryDate || '-'}
                                {isExp ? ' · KEDALUWARSA' : ''})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-[#4A5045]">Jumlah</label>
                        <input
                          type="number"
                          min={1}
                          value={matQty}
                          onChange={(e) => setMatQty(Number(e.target.value))}
                          className="mt-1 w-full rounded border border-[#D4C5AF] bg-white px-2.5 py-2 font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => submitProcedure(false)}
                        className="inline-flex items-center gap-1.5 rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Simpan & Selesaikan Tindakan
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'persetujuan' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-[#1F241D]">Riwayat Persetujuan Tercatat</h3>
                  {record.consents.length === 0 ? (
                    <p className="mt-2 text-[#5E645A]">Belum ada formulir persetujuan tercatat untuk kunjungan ini.</p>
                  ) : (
                    <div className="mt-2 divide-y divide-[#EFE8DC] rounded border border-[#EFE8DC]">
                      {record.consents.map((c) => (
                        <div key={c.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold text-[#1F241D]">
                              Formulir {c.formType} ({c.formVersion}) ·{' '}
                              {c.decision === 'disetujui' ? 'DISETUJUI' : 'DITOLAK'}
                            </div>
                            <div className="text-[#5E645A]">
                              Penanda tangan: {c.signerName} ({c.signerRole}) · Petugas: {c.recordedBy} ·{' '}
                              {formatTanggalJam(c.recordedAt)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPrintConsentState({ consent: c, formType: c.formType })}
                            className="inline-flex items-center gap-1 rounded border border-[#D4C5AF] px-2.5 py-1 font-semibold text-[#1F241D]"
                          >
                            <Printer className="h-3 w-3" />
                            Cetak Formulir
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <form onSubmit={handleRecordConsent} className="border-t border-[#EFE8DC] pt-4 space-y-3">
                  <h3 className="font-semibold text-[#1F241D]">
                    Catat Formulir Persetujuan / Penolakan Tindakan
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <div>
                      <label className="block font-semibold text-[#4A5045]">Layanan</label>
                      <select
                        value={consentServiceId}
                        onChange={(e) => {
                          const sid = e.target.value;
                          setConsentServiceId(sid);
                          const srv = services.find((s) => s.id === sid);
                          if (srv && srv.consentFormType !== 'tidak_perlu') {
                            setConsentFormType(srv.consentFormType);
                          }
                        }}
                        className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                      >
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-[#4A5045]">Jenis Formulir</label>
                      <select
                        value={consentFormType}
                        onChange={(e) =>
                          setConsentFormType(
                            e.target.value as 'terapi_umum' | 'bekam_akupunktur' | 'ruqyah_syariyyah'
                          )
                        }
                        className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                      >
                        <option value="bekam_akupunktur">Bekam / Akupunktur Steril (v2.0)</option>
                        <option value="terapi_umum">Terapi Umum & Moksa (v2.0)</option>
                        <option value="ruqyah_syariyyah">Khusus Pendampingan Ruqyah Syar’iyyah (v2.1)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-[#4A5045]">Keputusan</label>
                      <select
                        value={consentDecision}
                        onChange={(e) => setConsentDecision(e.target.value as 'disetujui' | 'ditolak')}
                        className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-2"
                      >
                        <option value="disetujui">Disetujui</option>
                        <option value="ditolak">Ditolak</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-[#4A5045]">Penanda Tangan & Peran</label>
                      <div className="mt-1 flex gap-1.5">
                        <input
                          type="text"
                          required
                          value={signerName}
                          onChange={(e) => setSignerName(e.target.value)}
                          placeholder="Nama"
                          className="w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2 py-2"
                        />
                        <select
                          value={signerRole}
                          onChange={(e) => setSignerRole(e.target.value as 'pasien' | 'wali')}
                          className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-2 py-2"
                        >
                          <option value="pasien">Pasien</option>
                          <option value="wali">Wali</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={consentNotes}
                    onChange={(e) => setConsentNotes(e.target.value)}
                    placeholder="Catatan penjelasan risiko/prosedur yang telah disampaikan"
                    className="w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white">
                      Simpan Persetujuan
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintConsentState({ formType: consentFormType })}
                      className="inline-flex items-center gap-1.5 rounded border border-[#3D4F35] px-3.5 py-2 font-semibold text-[#3D4F35]"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Pratinjau / Cetak Formulir Kosong
                    </button>
                  </div>
                </form>
              </div>
            )}

            {tab === 'lampiran' && (
              <div className="space-y-4">
                <form onSubmit={handleUploadAttachment} className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Nama Berkas</label>
                    <input
                      type="text"
                      value={attFileName}
                      onChange={(e) => setAttFileName(e.target.value)}
                      className="mt-1 rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Kategori</label>
                    <input
                      type="text"
                      value={attCategory}
                      onChange={(e) => setAttCategory(e.target.value)}
                      className="mt-1 rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
                    />
                  </div>
                  <button type="submit" className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white">
                    Catat Lampiran Privat
                  </button>
                </form>

                {signedLinkData && (
                  <div className="space-y-2 rounded border border-[#3D4F35]/30 bg-[#F4F6F1] p-3 text-[11px] text-[#243020]">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                      <span>
                        Tautan sementara: {signedLinkData.signedUrl} · Berlaku hingga{' '}
                        {formatTanggalJam(signedLinkData.expiresAt)}
                      </span>
                      <button
                        type="button"
                        onClick={handleOpenSignedAttachment}
                        className="rounded bg-[#3D4F35] px-2.5 py-1 font-sans text-xs font-semibold text-white"
                      >
                        Buka Pratinjau Tautan
                      </button>
                    </div>
                    {signedLinkData.preview && (
                      <div className="rounded border border-[#D4C5AF] bg-white p-2.5 text-[#1F241D]">
                        <div className="font-mono font-semibold">
                          {signedLinkData.preview.fileName} ({signedLinkData.preview.category})
                        </div>
                        <div className="text-[#5E645A]">
                          Path: {signedLinkData.preview.storagePath} · Pengunggah: {signedLinkData.preview.uploadedBy} (
                          {formatTanggalJam(signedLinkData.preview.uploadedAt)})
                        </div>
                        <div className="mt-1 text-[#243020]">{signedLinkData.preview.note}</div>
                      </div>
                    )}
                  </div>
                )}

                <div className="divide-y divide-[#EFE8DC] rounded border border-[#EFE8DC]">
                  {record.attachments.length === 0 ? (
                    <p className="p-4 text-[#5E645A]">Belum ada lampiran privat.</p>
                  ) : (
                    record.attachments.map((att) => (
                      <div key={att.id} className="flex items-center justify-between gap-3 p-3">
                        <div className="flex items-center gap-2">
                          <Paperclip className="h-4 w-4 text-[#5E645A]" />
                          <div>
                            <div className="font-mono font-semibold">{att.fileName}</div>
                            <div className="text-[#5E645A]">
                              {att.category} · Diunggah {att.uploadedBy} ({formatTanggalJam(att.uploadedAt)})
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRequestSignedAccess(att.id)}
                          className="rounded border border-[#3D4F35] px-3 py-1 font-semibold text-[#3D4F35]"
                        >
                          Minta Tautan Sementara
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {tab === 'tindak_lanjut' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <h3 className="font-semibold text-[#1F241D]">
                    Ringkasan Dibagikan, Kontrol Lanjutan & Rujukan
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block font-semibold text-[#4A5045]">Tanggal Jadwal Kontrol</label>
                      <input
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#4A5045]">Status Tindak Lanjut</label>
                      <select
                        value={followUpStatus}
                        onChange={(e) =>
                          setFollowUpStatus(e.target.value as 'dijadwalkan' | 'selesai' | 'tidak_perlu')
                        }
                        className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
                      >
                        <option value="dijadwalkan">Dijadwalkan</option>
                        <option value="selesai">Selesai</option>
                        <option value="tidak_perlu">Tidak Perlu Kontrol</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">Catatan Rujukan / Instruksi Praktisi</label>
                    <input
                      type="text"
                      value={referralNote}
                      onChange={(e) => setReferralNote(e.target.value)}
                      placeholder="Rujukan ke fasilitas medis bila diperlukan atau instruksi lanjutan"
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A5045]">
                      Ringkasan Kunjungan untuk Portal Pasien
                    </label>
                    <textarea
                      rows={3}
                      value={sharedText}
                      onChange={(e) => setSharedText(e.target.value)}
                      placeholder="Tuliskan ringkasan edukatif yang aman dibagikan kepada pasien..."
                      className="mt-1 w-full rounded border border-[#D4C5AF] bg-[#FBF8F3] p-2.5 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 font-medium text-[#2F3E29]">
                    <input
                      type="checkbox"
                      checked={sharedApproved}
                      onChange={(e) => setSharedApproved(e.target.checked)}
                    />
                    <span>Setujui ringkasan ini untuk ditampilkan di Portal Pasien</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSaveFollowUp}
                      className="rounded bg-[#3D4F35] px-4 py-2 font-semibold text-white"
                    >
                      Simpan Tindak Lanjut & Persetujuan Bagikan
                    </button>
                    {followUpDate && (
                      <button
                        type="button"
                        onClick={handleScheduleFollowUpReservation}
                        className="rounded border border-[#734F2C] bg-[#F5EFE6] px-4 py-2 font-semibold text-[#5C3D21] hover:bg-[#EAE0D0]"
                      >
                        Simpan & Jadwalkan Kontrol ke Kalender
                      </button>
                    )}
                  </div>
                </div>

                {activeVisit && (
                  <FollowUpWhatsappPanel
                    visit={activeVisit}
                    patient={activePatient}
                    branch={branches.find((b) => b.id === activeVisit.branchId)}
                    settings={settings}
                    whatsappProviderConfigured={whatsappProviderConfigured}
                    draftValues={{
                      followUpDate,
                      followUpStatus,
                      referralNote,
                      sharedSummaryApproved: sharedApproved,
                      sharedSummaryText: sharedText,
                    }}
                    onBeforeDispatch={async () => {
                      const isDirty =
                        (activeVisit.followUpDate || '') !== followUpDate ||
                        (activeVisit.followUpStatus || 'dijadwalkan') !== followUpStatus ||
                        (activeVisit.referralNote || '') !== referralNote ||
                        activeVisit.sharedSummaryApproved !== sharedApproved ||
                        (activeVisit.sharedSummaryText || '') !== sharedText;
                      if (!isDirty) return true;
                      return persistFollowUpChanges();
                    }}
                    onDispatched={async () => {
                      await onRefresh();
                    }}
                  />
                )}

                {/* Incidents */}
                <form onSubmit={handleLogIncident} className="border-t border-[#EFE8DC] pt-4 space-y-3">
                  <div className="flex items-center gap-1.5 font-semibold text-[#991B1B]">
                    <ShieldAlert className="h-4 w-4" />
                    Catatan Kejadian Selama / Setelah Layanan
                  </div>
                  {record.incidents.map((inc) => (
                    <div key={inc.id} className="rounded bg-[#FEF2F2] p-3 text-[#991B1B]">
                      <div className="font-semibold">
                        {formatTanggalJam(inc.occurredAt)} · {inc.recordedBy} ({inc.followUpStatus})
                      </div>
                      <div>Uraian: {inc.description}</div>
                      <div>Langkah: {inc.actionTaken}</div>
                    </div>
                  ))}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      required
                      value={incDesc}
                      onChange={(e) => setIncDesc(e.target.value)}
                      placeholder="Uraian kejadian (misal: pusing ringan setelah bekam)"
                      className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
                    />
                    <input
                      type="text"
                      required
                      value={incAction}
                      onChange={(e) => setIncAction(e.target.value)}
                      placeholder="Langkah yang diambil (misal: istirahat & minum air hangat)"
                      className="rounded border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2"
                    />
                  </div>
                  <button type="submit" className="rounded border border-[#991B1B] px-3 py-1.5 font-semibold text-[#991B1B]">
                    Catat Kejadian
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Append-Only Dated Correction on Finalized Record */}
          {record.status === 'final' && (
            <div className="rounded-lg border border-[#734F2C]/40 bg-[#F5EFE6]/60 p-6 space-y-4 text-xs">
              <div>
                <h3 className="font-editorial text-lg font-semibold text-[#1F241D]">
                  Koreksi Catatan Final (Tambahan Bertanggal)
                </h3>
                <p className="text-[#5E645A]">
                  Catatan final awal ({formatTanggalJam(record.finalizedAt)} oleh {record.finalizedBy}) tetap tersimpan utuh. Koreksi disimpan sebagai tambahan bertanggal.
                </p>
              </div>

              {record.addendums.length > 0 && (
                <div className="space-y-2">
                  {record.addendums.map((ad) => (
                    <div key={ad.id} className="rounded border border-[#D4C5AF] bg-white p-3">
                      <div className="font-mono text-[11px] font-semibold text-[#734F2C]">
                        {formatTanggalJam(ad.createdAt)} · Pengubah: {ad.authorName} · Alasan: {ad.reason}
                      </div>
                      <p className="mt-1 text-sm text-[#1F241D]">{ad.correctionText}</p>
                    </div>
                  ))}
                </div>
              )}

              {isPractitioner ? (
                <form onSubmit={handleAddAddendum} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <input
                    type="text"
                    required
                    value={addReason}
                    onChange={(e) => setAddReason(e.target.value)}
                    placeholder="Alasan koreksi (misal: klarifikasi dosis herbal)"
                    className="rounded border border-[#D4C5AF] bg-white px-3 py-2"
                  />
                  <input
                    type="text"
                    required
                    value={addText}
                    onChange={(e) => setAddText(e.target.value)}
                    placeholder="Isi catatan tambahan / koreksi..."
                    className="rounded border border-[#D4C5AF] bg-white px-3 py-2 sm:col-span-2"
                  />
                  <button
                    type="submit"
                    className="rounded bg-[#734F2C] px-4 py-2 font-semibold text-white sm:w-max"
                  >
                    Simpan Tambahan Koreksi
                  </button>
                </form>
              ) : (
                <p className="font-medium text-[#734F2C]">
                  Penambahan koreksi catatan final hanya dapat dilakukan oleh Praktisi berwenang.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {printConsentState && activeVisit && (
        <PrintableConsent
          consent={printConsentState.consent}
          formType={printConsentState.formType}
          settings={settings}
          branch={branches.find((b) => b.id === activeVisit.branchId)}
          patient={activePatient}
          visit={activeVisit}
          services={services}
          onClose={() => setPrintConsentState(null)}
        />
      )}
    </div>
  );
};
