import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  Send,
} from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';
import type {
  Branch,
  ClinicSettings,
  FollowUpMessageType,
  Patient,
  Visit,
} from '../../types/clinic';
import {
  FOLLOWUP_TEMPLATE_LABELS,
  buildFollowUpWhatsappMessage,
  buildWhatsappDraftUrl,
  formatTanggalJam,
} from '../../utils/format';

export interface FollowUpWhatsappDraftValues {
  followUpDate?: string;
  followUpStatus?: 'dijadwalkan' | 'selesai' | 'tidak_perlu';
  referralNote?: string;
  sharedSummaryApproved: boolean;
  sharedSummaryText?: string;
}

interface FollowUpWhatsappPanelProps {
  visit: Visit;
  patient?: Patient;
  branch?: Branch;
  settings: ClinicSettings;
  whatsappProviderConfigured?: boolean;
  /** Optional live draft override (e.g., unsaved fields inside ClinicalModule tab) */
  draftValues?: FollowUpWhatsappDraftValues;
  /** Called right before dispatching if caller wants to persist unsaved draft fields first */
  onBeforeDispatch?: () => Promise<boolean>;
  onDispatched: (updatedVisit: Visit) => Promise<void> | void;
}

export const FollowUpWhatsappPanel: React.FC<FollowUpWhatsappPanelProps> = ({
  visit,
  patient,
  branch,
  settings,
  whatsappProviderConfigured = false,
  draftValues,
  onBeforeDispatch,
  onDispatched,
}) => {
  const effectiveFollowUpDate =
    draftValues !== undefined ? draftValues.followUpDate : visit.followUpDate;
  const effectiveFollowUpStatus =
    draftValues !== undefined ? draftValues.followUpStatus : visit.followUpStatus;
  const effectiveReferralNote =
    draftValues !== undefined ? draftValues.referralNote : visit.referralNote;
  const effectiveSharedApproved =
    draftValues !== undefined ? draftValues.sharedSummaryApproved : visit.sharedSummaryApproved;
  const effectiveSharedText =
    draftValues !== undefined ? draftValues.sharedSummaryText : visit.sharedSummaryText;

  const [notificationType, setNotificationType] = useState<FollowUpMessageType>('tindak_lanjut_lengkap');
  const [includeSummaryDetail, setIncludeSummaryDetail] = useState<boolean>(effectiveSharedApproved);
  const [consentRecorded, setConsentRecorded] = useState<boolean>(
    Boolean(visit.followUpWhatsappConsent)
  );
  const [customMessage, setCustomMessage] = useState<string>('');
  const [isManuallyEdited, setIsManuallyEdited] = useState<boolean>(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => `vwa-${Date.now()}`);
  const [sending, setSending] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setConsentRecorded(Boolean(visit.followUpWhatsappConsent));
    setIdempotencyKey(`vwa-${visit.id}-${Date.now()}`);
    setIsManuallyEdited(false);
    setNotice(null);
    setErrorMsg(null);
    setCopied(false);
  }, [visit.id]);

  useEffect(() => {
    setIncludeSummaryDetail(effectiveSharedApproved);
  }, [effectiveSharedApproved, visit.id]);

  const templateMessage = useMemo(
    () =>
      buildFollowUpWhatsappMessage({
        notificationType,
        clinicName: settings.clinicName,
        branchName: branch?.name || 'Cabang Klinik',
        branchWhatsapp: branch?.whatsapp || settings.primaryWhatsapp,
        patientName: patient?.fullName || 'Pasien',
        visitNumber: visit.visitNumber,
        visitDate: visit.visitDate,
        followUpDate: effectiveFollowUpDate || undefined,
        followUpStatus: effectiveFollowUpStatus,
        referralNote: effectiveReferralNote,
        sharedSummaryApproved: effectiveSharedApproved,
        sharedSummaryText: effectiveSharedText,
        includeSharedSummaryDetail: includeSummaryDetail,
      }),
    [
      notificationType,
      settings.clinicName,
      settings.primaryWhatsapp,
      branch?.name,
      branch?.whatsapp,
      patient?.fullName,
      visit.visitNumber,
      visit.visitDate,
      effectiveFollowUpDate,
      effectiveFollowUpStatus,
      effectiveReferralNote,
      effectiveSharedApproved,
      effectiveSharedText,
      includeSummaryDetail,
    ]
  );

  const messageText = isManuallyEdited ? customMessage : templateMessage;

  const handleSelectType = (nextType: FollowUpMessageType) => {
    setNotificationType(nextType);
    setIsManuallyEdited(false);
    setIdempotencyKey(`vwa-${visit.id}-${nextType}-${Date.now()}`);
    setNotice(null);
    setErrorMsg(null);
  };

  const handleDispatch = async (
    channel: 'whatsapp_draft' | 'whatsapp_provider',
    copyToClipboard: boolean
  ) => {
    setErrorMsg(null);
    setNotice(null);
    if (!consentRecorded && !visit.followUpWhatsappConsent) {
      setErrorMsg(
        'Centang persetujuan pasien terlebih dahulu sebelum mengirim pemberitahuan WhatsApp.'
      );
      return;
    }

    setSending(true);
    try {
      if (onBeforeDispatch) {
        const ok = await onBeforeDispatch();
        if (!ok) {
          setSending(false);
          return;
        }
      }

      if (copyToClipboard) {
        try {
          await navigator.clipboard.writeText(messageText);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard permission may be restricted inside sandboxed iframe
        }
      }

      const res = await apiRequest<{
        visit: Visit;
        idempotentReplay?: boolean;
        message?: string;
      }>(`/api/visits/${visit.id}/whatsapp-log`, {
        method: 'POST',
        body: JSON.stringify({
          notificationType,
          channel,
          idempotencyKey,
          consentRecorded,
          includeSharedSummaryDetail: includeSummaryDetail && effectiveSharedApproved,
          customMessage: isManuallyEdited ? messageText : undefined,
          requireApprovedSummary:
            notificationType === 'ringkasan_dibagikan' ||
            (includeSummaryDetail && effectiveSharedApproved),
        }),
      });

      if (res.idempotentReplay) {
        setNotice(
          res.message ||
            'Pencegahan kirim ganda aktif: pengiriman dengan kunci yang sama sudah tercatat.'
        );
      } else if (channel === 'whatsapp_provider') {
        setNotice(
          `Pemberitahuan "${FOLLOWUP_TEMPLATE_LABELS[notificationType]}" berhasil dikirim otomatis via penyedia WhatsApp.`
        );
      } else {
        setNotice(
          `Pesan "${FOLLOWUP_TEMPLATE_LABELS[notificationType]}" dicatat (${
            copyToClipboard ? 'siap ditempel dari clipboard' : 'draf WhatsApp dibuka'
          }).`
        );
      }

      await onDispatched(res.visit);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Gagal mencatat pengiriman pemberitahuan WhatsApp.');
      }
    } finally {
      setSending(false);
    }
  };

  const canAutoSendProvider = settings.whatsappAutoSendEnabled && whatsappProviderConfigured;
  const logs = visit.followUpMessageLogs || [];
  const hasAnyContent =
    effectiveSharedApproved ||
    Boolean(effectiveFollowUpDate) ||
    Boolean(effectiveReferralNote?.trim());

  return (
    <div className="rounded-lg border border-[#D4C5AF] bg-[#FBF8F3] p-4 space-y-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-[#1F241D]">
            <MessageCircle className="h-4 w-4 text-[#3D4F35]" />
            Kirim Pemberitahuan ke WhatsApp (Ringkasan, Kontrol Lanjutan & Rujukan)
          </h4>
          <p className="mt-0.5 text-[#5E645A]">
            Tujuan: <span className="font-semibold text-[#1F241D]">{patient?.fullName || 'Pasien'}</span>{' '}
            (<span className="font-mono">{patient?.phone || '-'}</span>) · Mode:{' '}
            {canAutoSendProvider
              ? 'Penyedia WhatsApp Otomatis Terhubung'
              : 'Salin Pesan / Draf WhatsApp (Aman Privasi)'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIdempotencyKey(`vwa-${visit.id}-${Date.now()}`);
            setNotice('Kunci pengiriman baru dibuat untuk pesan berikutnya.');
          }}
          className="inline-flex items-center gap-1 rounded border border-[#D4C5AF] bg-white px-2.5 py-1 text-[11px] font-medium text-[#4A5045] hover:bg-[#F5EFE6]"
        >
          <RefreshCw className="h-3 w-3" />
          Kunci Kirim Baru
        </button>
      </div>

      {/* Type selector */}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            'tindak_lanjut_lengkap',
            'ringkasan_dibagikan',
            'kontrol_lanjutan',
            'rujukan',
          ] as FollowUpMessageType[]
        ).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleSelectType(t)}
            className={`rounded border px-2.5 py-1 font-semibold transition-colors ${
              notificationType === t
                ? 'border-[#3D4F35] bg-[#3D4F35] text-white'
                : 'border-[#D4C5AF] bg-white text-[#4A5045] hover:bg-[#F5EFE6]'
            }`}
          >
            {FOLLOWUP_TEMPLATE_LABELS[t]}
          </button>
        ))}
      </div>

      {!hasAnyContent && (
        <div className="rounded border border-[#D97706]/30 bg-[#FEF3C7]/60 px-3 py-2 text-[#92400E]">
          Belum ada Ringkasan yang disetujui dibagikan, Tanggal Kontrol Lanjutan, atau Catatan Rujukan pada kunjungan ini. Lengkapi minimal salah satunya sebelum mengirim WhatsApp.
        </div>
      )}

      {/* Privacy & consent toggles */}
      <div className="space-y-1.5 rounded border border-[#E4DDD0] bg-white p-3">
        <label
          className={`flex items-start gap-2 ${
            effectiveSharedApproved ? 'text-[#1F241D]' : 'text-[#8C8A82]'
          }`}
        >
          <input
            type="checkbox"
            checked={effectiveSharedApproved ? includeSummaryDetail : false}
            disabled={!effectiveSharedApproved}
            onChange={(e) => {
              setIncludeSummaryDetail(e.target.checked);
              setIsManuallyEdited(false);
            }}
            className="mt-0.5"
          />
          <span>
            Sertakan isi <strong>Ringkasan Dibagikan</strong> langsung pada pesan WhatsApp{' '}
            {!effectiveSharedApproved &&
              '(nonaktif: centang persetujuan bagikan ringkasan terlebih dahulu, atau kirim tautan pemberitahuan Portal Pasien)'}
          </span>
        </label>

        <label className="flex items-start gap-2 font-medium text-[#2F3E29]">
          <input
            type="checkbox"
            checked={consentRecorded}
            onChange={(e) => setConsentRecorded(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Pasien telah memberikan persetujuan menerima ringkasan, jadwal kontrol, dan rujukan melalui WhatsApp.
          </span>
        </label>
      </div>

      {/* Editable message preview */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="font-semibold text-[#4A5045]">Pratinjau Pesan WhatsApp</label>
          {isManuallyEdited && (
            <button
              type="button"
              onClick={() => {
                setIsManuallyEdited(false);
                setCustomMessage('');
              }}
              className="text-[11px] font-semibold text-[#3D4F35] underline"
            >
              Reset ke Templat Standar
            </button>
          )}
        </div>
        <textarea
          rows={6}
          value={messageText}
          onChange={(e) => {
            setCustomMessage(e.target.value);
            setIsManuallyEdited(true);
          }}
          className="w-full rounded border border-[#D4C5AF] bg-white p-3 font-sans text-xs leading-relaxed text-[#1F241D]"
        />
      </div>

      {errorMsg && <div className="rounded bg-[#FEF2F2] p-2.5 text-[#991B1B]">{errorMsg}</div>}
      {notice && <div className="rounded bg-[#F4F6F1] p-2.5 text-[#243020]">{notice}</div>}

      {/* Dispatch buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {canAutoSendProvider && (
          <button
            type="button"
            disabled={sending || !hasAnyContent}
            onClick={() => handleDispatch('whatsapp_provider', false)}
            className="inline-flex items-center gap-1.5 rounded bg-[#243020] px-3.5 py-2 font-semibold text-white hover:bg-[#1A2417] disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {sending ? 'Mengirim...' : 'Kirim Otomatis via Penyedia WA'}
          </button>
        )}

        <button
          type="button"
          disabled={sending || !hasAnyContent}
          onClick={() => handleDispatch('whatsapp_draft', true)}
          className="inline-flex items-center gap-1.5 rounded bg-[#3D4F35] px-3.5 py-2 font-semibold text-white hover:bg-[#2F3E29] disabled:opacity-50"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Tersalin & Tercatat' : 'Salin Pesan & Catat Pengiriman'}
        </button>

        {patient?.phone && (
          <a
            href={buildWhatsappDraftUrl(patient.phone, messageText)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              if (!consentRecorded && !visit.followUpWhatsappConsent) {
                e.preventDefault();
                setErrorMsg(
                  'Centang persetujuan pasien terlebih dahulu sebelum membuka WhatsApp.'
                );
                return;
              }
              if (!hasAnyContent) {
                e.preventDefault();
                return;
              }
              handleDispatch('whatsapp_draft', false);
            }}
            className="inline-flex items-center gap-1.5 rounded border border-[#3D4F35] bg-white px-3.5 py-2 font-semibold text-[#3D4F35] hover:bg-[#F4F6F1]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Buka Draf di WhatsApp
          </a>
        )}
      </div>

      {/* Dispatch Logs */}
      <div className="border-t border-[#E4DDD0] pt-3">
        <div className="mb-2 font-semibold text-[#4A5045]">
          Riwayat Pemberitahuan WhatsApp Kunjungan ({logs.length})
        </div>
        {logs.length === 0 ? (
          <p className="text-[#5E645A]">
            Belum ada pengiriman WhatsApp tindak lanjut tercatat untuk kunjungan ini.
          </p>
        ) : (
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {logs.map((m) => (
              <div
                key={m.id}
                className="rounded border border-[#E4DDD0] bg-white px-3 py-2 text-[11px]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#1F241D]">
                    {FOLLOWUP_TEMPLATE_LABELS[m.templateType] || m.templateType} ·{' '}
                    <span className="font-mono text-[#5E645A]">{m.recipientPhone}</span>
                  </span>
                  <span
                    className={`font-semibold ${
                      m.status === 'terkirim'
                        ? 'text-[#3D4F35]'
                        : m.status === 'gagal'
                          ? 'text-[#991B1B]'
                          : 'text-[#734F2C]'
                    }`}
                  >
                    {m.status === 'terkirim'
                      ? 'Terkirim Otomatis'
                      : m.status === 'gagal'
                        ? 'Gagal Kirim'
                        : 'Disalin / Draf WA'}
                  </span>
                </div>
                <div className="mt-0.5 text-[#5E645A]">
                  {formatTanggalJam(m.sentAt)} · Oleh {m.sentBy} · Kunci:{' '}
                  <span className="font-mono">{m.idempotencyKey}</span>
                </div>
                {m.messagePreview && (
                  <div className="mt-1 line-clamp-2 text-[#4A5045] italic">
                    “{m.messagePreview}”
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
