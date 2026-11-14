import React, { useEffect, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Menu,
  Phone,
  RefreshCw,
  Stethoscope,
  X,
} from 'lucide-react';
import { ApiError, apiRequest, type BootstrapPayload } from '../lib/api';
import type { EducationalArticle, QueueStatus } from '../types/clinic';
import {
  QUEUE_STATUS_LABELS,
  formatJam,
  formatRupiah,
  formatTanggal,
  todayJakartaISO,
} from '../utils/format';

function normalizePublicImageUrl(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  if (url.includes('practitioner_female_hijab_1794541305490.jpg')) {
    return '/images/practitioner_tcm_female_1794541320309.jpg';
  }
  if (url.startsWith('/src/assets/images/')) {
    return url.replace('/src/assets/images/', '/images/');
  }
  return url;
}

interface PublicWebsiteProps {
  bootstrap: BootstrapPayload;
  onGoPortal: () => void;
  onGoPanel: () => void;
  onOpenPortalWithUser?: (portalUserId: string) => Promise<void> | void;
}

interface PublicQueueEntry {
  id: string;
  queueNumber: string;
  roomName: string;
  status: QueueStatus;
  calledAt?: string;
}

interface SlotOption {
  startTime: string;
  endTime: string;
  available: boolean;
  conflictReason?: string;
}

export const PublicWebsite: React.FC<PublicWebsiteProps> = ({
  bootstrap,
  onGoPortal,
  onGoPanel,
  onOpenPortalWithUser,
}) => {
  const { settings, branches, services, practitioners, articles, faqs } = bootstrap;

  const [selectedBranchId, setSelectedBranchId] = useState<string>(branches[0]?.id || 'br-jkt');
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [queueItems, setQueueItems] = useState<PublicQueueEntry[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);

  // Booking form state
  const [bookBranchId, setBookBranchId] = useState<string>(branches[0]?.id || 'br-jkt');
  const [bookServiceId, setBookServiceId] = useState<string>(services[0]?.id || 'srv-tcm');
  const [bookPracId, setBookPracId] = useState<string>(practitioners[0]?.id || 'prac-aisyah');
  const [bookDate, setBookDate] = useState<string>(todayJakartaISO());
  const [bookTime, setBookTime] = useState<string>('09:00');
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('1992-05-14');
  const [gender, setGender] = useState<'L' | 'P'>('P');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [whatsappConsent, setWhatsappConsent] = useState(true);

  const [submittingBook, setSubmittingBook] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [alternativeSlots, setAlternativeSlots] = useState<SlotOption[]>([]);
  const [bookSuccess, setBookSuccess] = useState<{
    reservationCode: string;
    patientNumber: string;
    portalUserId?: string;
    date: string;
    startTime: string;
    endTime: string;
  } | null>(null);

  const [openFaqId, setOpenFaqId] = useState<string | null>(faqs[0]?.id || null);
  const [activeArticle, setActiveArticle] = useState<EducationalArticle | null>(null);

  const fetchPublicQueue = async (branchId: string) => {
    setLoadingQueue(true);
    try {
      const res = await apiRequest<{ items: PublicQueueEntry[] }>(
        `/api/public/queue?branchId=${encodeURIComponent(branchId)}`
      );
      setQueueItems(res.items);
    } catch {
      setQueueItems([]);
    } finally {
      setLoadingQueue(false);
    }
  };

  const fetchAvailability = async (branchId: string, pracId: string, srvId: string, date: string) => {
    const srv = services.find((s) => s.id === srvId);
    const dur = srv?.durationMinutes || 45;
    setLoadingSlots(true);
    try {
      const res = await apiRequest<{ slots: SlotOption[] }>(
        `/api/public/availability?branchId=${encodeURIComponent(branchId)}&practitionerId=${encodeURIComponent(
          pracId
        )}&date=${encodeURIComponent(date)}&durationMinutes=${dur}`
      );
      setSlots(res.slots);
      const firstAvail = res.slots.find((s) => s.available);
      if (firstAvail && !res.slots.some((s) => s.startTime === bookTime && s.available)) {
        setBookTime(firstAvail.startTime);
      }
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    fetchPublicQueue(selectedBranchId);
  }, [selectedBranchId]);

  useEffect(() => {
    fetchAvailability(bookBranchId, bookPracId, bookServiceId, bookDate);
  }, [bookBranchId, bookPracId, bookServiceId, bookDate]);

  const branchServicesAll = services.filter((s) => s.activeBranchIds.includes(selectedBranchId));
  const serviceCategories = ['Semua', ...Array.from(new Set(branchServicesAll.map((s) => s.category)))];
  const branchServices =
    selectedCategory === 'Semua'
      ? branchServicesAll
      : branchServicesAll.filter((s) => s.category === selectedCategory);
  const branchPractitioners = practitioners.filter((p) => p.branchIds.includes(bookBranchId));

  const handleBookBranchChange = (nextBranch: string) => {
    setBookBranchId(nextBranch);
    const validPrac = practitioners.find((p) => p.branchIds.includes(nextBranch));
    if (validPrac) setBookPracId(validPrac.id);
    const validSrv = services.find((s) => s.activeBranchIds.includes(nextBranch));
    if (validSrv) setBookServiceId(validSrv.id);
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookError(null);
    setAlternativeSlots([]);
    setBookSuccess(null);

    if (!fullName.trim() || !phone.trim()) {
      setBookError('Mohon lengkapi nama lengkap dan nomor WhatsApp aktif Anda.');
      return;
    }

    setSubmittingBook(true);
    try {
      const res = await apiRequest<{
        reservation: { reservationCode: string; date: string; startTime: string; endTime: string };
        patient: { patientNumber: string };
        portalUserId?: string;
      }>('/api/public/book', {
        method: 'POST',
        body: JSON.stringify({
          branchId: bookBranchId,
          practitionerId: bookPracId,
          serviceIds: [bookServiceId],
          date: bookDate,
          startTime: bookTime,
          fullName,
          dateOfBirth,
          gender,
          phone,
          notes,
          whatsappConsent,
        }),
      });
      setBookSuccess({
        reservationCode: res.reservation.reservationCode,
        patientNumber: res.patient.patientNumber,
        portalUserId: res.portalUserId,
        date: res.reservation.date,
        startTime: res.reservation.startTime,
        endTime: res.reservation.endTime,
      });
      fetchAvailability(bookBranchId, bookPracId, bookServiceId, bookDate);
    } catch (err) {
      if (err instanceof ApiError) {
        setBookError(err.message);
        if (Array.isArray(err.data.alternativeSlots)) {
          setAlternativeSlots(err.data.alternativeSlots as SlotOption[]);
        }
      } else {
        setBookError('Terjadi kendala saat mengirim permintaan janji.');
      }
    } finally {
      setSubmittingBook(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF8F3] text-[#1F241D]">
      {/* Top Bar Contract: strictly 3 zones */}
      <header className="border-b border-[#E4DDD0] bg-[#FBF8F3]">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-8 px-6 py-4">
          <a
            href="#beranda"
            className="inline-flex items-center gap-2.5 font-editorial text-xl font-bold tracking-tight text-[#2F3E29] whitespace-nowrap shrink-0"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#3D4F35] font-mono text-xs font-bold text-white">
              {settings.logoInitials || 'TC'}
            </span>
            <span>{settings.clinicName.replace('Klinik Holistik ', '')}</span>
          </a>

          <nav className="hidden items-center gap-6 text-sm font-medium text-[#4A5045] md:flex">
            <a href="#layanan" className="hover:text-[#2F3E29] hover:underline whitespace-nowrap shrink-0">
              Layanan
            </a>
            <a href="#praktisi" className="hover:text-[#2F3E29] hover:underline whitespace-nowrap shrink-0">
              Praktisi
            </a>
            <a href="#antrean" className="hover:text-[#2F3E29] hover:underline whitespace-nowrap shrink-0">
              Antrean
            </a>
            <a href="#edukasi" className="hover:text-[#2F3E29] hover:underline whitespace-nowrap shrink-0">
              Edukasi
            </a>
            <button
              type="button"
              onClick={onGoPortal}
              className="hover:text-[#2F3E29] hover:underline whitespace-nowrap shrink-0"
            >
              Portal Pasien
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="#buat-janji"
              className="rounded-md bg-[#3D4F35] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2F3E29] whitespace-nowrap shrink-0"
            >
              Buat Janji
            </a>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Menu navigasi"
              className="inline-flex items-center justify-center rounded-md border border-[#D4C5AF] bg-white p-2 text-[#2F3E29] md:hidden"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <nav className="border-t border-[#E4DDD0] bg-[#F5EFE6] px-6 py-3 flex flex-col gap-2.5 text-sm font-medium text-[#2F3E29] md:hidden">
            <a href="#layanan" onClick={() => setMobileMenuOpen(false)}>
              Layanan & Tarif
            </a>
            <a href="#praktisi" onClick={() => setMobileMenuOpen(false)}>
              Profil Praktisi
            </a>
            <a href="#antrean" onClick={() => setMobileMenuOpen(false)}>
              Layar Antrean Publik
            </a>
            <a href="#edukasi" onClick={() => setMobileMenuOpen(false)}>
              Artikel Edukasi & Cabang
            </a>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onGoPortal();
              }}
              className="text-left font-semibold text-[#3D4F35]"
            >
              Portal Pasien
            </button>
          </nav>
        )}
      </header>

      {/* Hero Section */}
      <section id="beranda" className="border-b border-[#E4DDD0]">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-stretch gap-8 px-6 py-12 lg:grid-cols-12 lg:py-16">
          <div className="flex flex-col justify-center lg:col-span-6">
            <p className="mb-3 text-xs font-semibold tracking-wide text-[#734F2C]">
              {settings.clinicName} · Jakarta Selatan & Bandung
            </p>
            <h1 className="font-editorial text-balance text-4xl font-semibold leading-[1.12] tracking-tight text-[#1F241D] sm:text-5xl">
              Perawatan Tradisional & Holistik dengan Tata Kelola Klinis yang Tertib
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[#4A5045]">
              {settings.websiteNote} Mulai dari konsultasi TCM, bekam basah steril, akupunktur,
              akupresur, moksibusi, racik herbal, hingga pendampingan spiritual dengan persetujuan
              tindakan yang transparan.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#buat-janji"
                className="rounded-md bg-[#3D4F35] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2F3E29] whitespace-nowrap"
              >
                Buat Janji Kunjungan
              </a>
              <button
                type="button"
                onClick={onGoPortal}
                className="rounded-md border border-[#C7B8A1] bg-[#F5EFE6] px-5 py-3 text-sm font-semibold text-[#2F3E29] transition-colors hover:bg-[#EAE0D0] whitespace-nowrap"
              >
                Masuk Portal Pasien
              </button>
              <button
                type="button"
                onClick={onGoPanel}
                className="text-sm font-medium text-[#734F2C] underline-offset-4 hover:underline whitespace-nowrap"
              >
                Panel Staf Klinik
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[300px] overflow-hidden rounded-lg border border-[#E4DDD0] bg-[#EAE0D0]">
              <img
                src="/images/hero_clinic_sanctuary_1794541318828.jpg"
                alt="Ruang konsultasi Klinik Holistik ThibbunCare bernuansa kayu dan hijau zaitun"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Services & Tariffs */}
      <section id="layanan" className="border-b border-[#E4DDD0] bg-[#F5EFE6]/55">
        <div className="mx-auto max-w-[1280px] px-6 py-14">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-editorial text-3xl font-semibold text-[#1F241D]">
                01. Layanan dan Tarif per Cabang
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-[#4A5045]">
                Setiap layanan dapat diaktifkan per cabang sesuai ketersediaan praktisi. Tarif yang
                ditampilkan menjadi acuan transaksi pada kunjungan berikutnya.
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-md border border-[#D4C5AF] bg-[#FBF8F3] p-1 self-start">
              {branches.map((br) => (
                <button
                  key={br.id}
                  type="button"
                  onClick={() => {
                    setSelectedBranchId(br.id);
                    setSelectedCategory('Semua');
                  }}
                  className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    selectedBranchId === br.id
                      ? 'bg-[#3D4F35] text-white'
                      : 'text-[#4A5045] hover:text-[#1F241D]'
                  }`}
                >
                  {br.name.replace('Cabang ', '')}
                </button>
              ))}
            </div>
          </div>

          {/* Category Filter */}
          <div className="mt-5 flex flex-wrap gap-1.5 border-b border-[#DFD5C5] pb-3">
            {serviceCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${
                  selectedCategory === cat
                    ? 'bg-[#734F2C] text-white'
                    : 'bg-white border border-[#E4DDD0] text-[#4A5045] hover:border-[#734F2C]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {branchServices.map((srv, idx) => (
              <div
                key={srv.id}
                className="flex flex-col justify-between rounded-lg border border-[#E4DDD0] bg-white p-6"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-[#5E645A]">
                    <span>
                      {String(idx + 1).padStart(2, '0')} · {srv.category}
                    </span>
                    <span className="font-mono tabular-nums">{srv.durationMinutes} menit</span>
                  </div>
                  <h3 className="mt-2 font-editorial text-lg font-semibold text-[#1F241D]">
                    {srv.name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#4A5045]">{srv.description}</p>
                </div>

                <div className="mt-5 border-t border-[#EFE8DC] pt-4 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-mono text-base font-semibold tabular-nums text-[#2F3E29]">
                      {formatRupiah(srv.price)}
                    </div>
                    <div className="text-xs text-[#5E645A]">
                      {srv.requiresConsent
                        ? srv.isSpiritualCompanion
                          ? 'Memerlukan persetujuan spiritual terpisah'
                          : 'Memerlukan persetujuan tindakan'
                        : 'Tanpa formulir persetujuan khusus'}
                    </div>
                  </div>
                  <a
                    href="#buat-janji"
                    onClick={() => {
                      setBookBranchId(selectedBranchId);
                      setBookServiceId(srv.id);
                      const validPrac = practitioners.find(
                        (p) => p.branchIds.includes(selectedBranchId) && p.serviceIds.includes(srv.id)
                      ) || practitioners.find((p) => p.branchIds.includes(selectedBranchId));
                      if (validPrac) setBookPracId(validPrac.id);
                    }}
                    className="rounded border border-[#3D4F35] px-3 py-1.5 text-xs font-semibold text-[#3D4F35] hover:bg-[#3D4F35] hover:text-white transition-colors whitespace-nowrap"
                  >
                    Pilih
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Practitioners */}
      <section id="praktisi" className="border-b border-[#E4DDD0]">
        <div className="mx-auto max-w-[1280px] px-6 py-14">
          <h2 className="font-editorial text-3xl font-semibold text-[#1F241D]">
            02. Profil Praktisi
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[#4A5045]">
            Setiap sesi ditangani langsung oleh praktisi berwenang dengan pencatatan observasi,
            persetujuan, serta instruksi tindak lanjut yang terstruktur.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {practitioners.map((prac) => (
              <div
                key={prac.id}
                className="overflow-hidden rounded-lg border border-[#E4DDD0] bg-white"
              >
                <div className="aspect-square w-full overflow-hidden bg-[#EAE0D0]">
                  <img
                    src={normalizePublicImageUrl(
                      prac.photoUrl,
                      '/images/practitioner_tcm_female_1794541320309.jpg'
                    )}
                    alt={prac.name}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-5">
                  <div className="text-xs font-medium text-[#734F2C]">{prac.title}</div>
                  <h3 className="mt-1 font-editorial text-lg font-semibold text-[#1F241D]">
                    {prac.name}
                  </h3>
                  <p className="mt-2 text-xs text-[#5E645A]">{prac.specialty}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[#4A5045]">{prac.bio}</p>
                  <div className="mt-4 border-t border-[#EFE8DC] pt-3 text-xs text-[#5E645A]">
                    Cabang:{' '}
                    {prac.branchIds
                      .map((bid) => branches.find((b) => b.id === bid)?.code || bid)
                      .join(' · ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Public Queue Display + Booking Split */}
      <section id="antrean" className="border-b border-[#E4DDD0] bg-[#F5EFE6]/55">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-8 px-6 py-14 lg:grid-cols-12">
          {/* Layar Antrean Publik */}
          <div className="lg:col-span-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-editorial text-2xl font-semibold text-[#1F241D]">
                  Layar Antrean Publik
                </h2>
                <p className="mt-1 text-xs text-[#5E645A]">
                  Hanya menampilkan nomor antrean dan ruang tujuan untuk menjaga privasi pasien.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fetchPublicQueue(selectedBranchId)}
                className="inline-flex items-center gap-1.5 rounded border border-[#D4C5AF] bg-white px-3 py-1.5 text-xs font-medium text-[#1F241D] hover:bg-[#F5EFE6]"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingQueue ? 'animate-spin' : ''}`} />
                Muat Ulang
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-[#E4DDD0] bg-white">
              <div className="border-b border-[#EFE8DC] px-4 py-3 text-xs font-semibold text-[#4A5045]">
                {branches.find((b) => b.id === selectedBranchId)?.name}
              </div>
              {queueItems.length === 0 ? (
                <div className="p-6 text-center text-sm text-[#5E645A]">
                  Belum ada antrean aktif pada cabang ini saat ini.
                </div>
              ) : (
                <div className="divide-y divide-[#EFE8DC]">
                  {queueItems.map((q) => (
                    <div key={q.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
                      <div>
                        <div className="font-mono text-xl font-bold tabular-nums text-[#2F3E29]">
                          {q.queueNumber}
                        </div>
                        <div className="text-xs text-[#5E645A]">{q.roomName}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-[#3D4F35]">
                          {QUEUE_STATUS_LABELS[q.status] || q.status}
                        </span>
                        {q.calledAt && (
                          <div className="font-mono text-[11px] tabular-nums text-[#5E645A]">
                            {formatJam(q.calledAt)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Buat Janji Mandiri */}
          <div id="buat-janji" className="lg:col-span-7">
            <div className="rounded-lg border border-[#E4DDD0] bg-white p-6 sm:p-8">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#734F2C]">
                <Calendar className="h-4 w-4" />
                Pemesanan Mandiri Online
              </div>
              <h2 className="mt-1 font-editorial text-2xl font-semibold text-[#1F241D]">
                Buat Janji Kunjungan
              </h2>
              <p className="mt-1 text-sm text-[#4A5045]">
                Ketersediaan jam dihitung langsung dari jadwal praktisi, hari libur, dan ruang terapi.
              </p>

              <form onSubmit={handleSubmitBooking} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#4A5045]">Cabang Klinik</label>
                    <select
                      value={bookBranchId}
                      onChange={(e) => handleBookBranchChange(e.target.value)}
                      className="mt-1 w-full rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm focus:border-[#3D4F35] focus:outline-none"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#4A5045]">Layanan</label>
                    <select
                      value={bookServiceId}
                      onChange={(e) => setBookServiceId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm focus:border-[#3D4F35] focus:outline-none"
                    >
                      {services
                        .filter((s) => s.activeBranchIds.includes(bookBranchId))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({formatRupiah(s.price)})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#4A5045]">Praktisi</label>
                    <select
                      value={bookPracId}
                      onChange={(e) => setBookPracId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm focus:border-[#3D4F35] focus:outline-none"
                    >
                      {branchPractitioners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#4A5045]">Tanggal Kunjungan</label>
                    <input
                      type="date"
                      value={bookDate}
                      min={todayJakartaISO()}
                      onChange={(e) => setBookDate(e.target.value)}
                      className="mt-1 w-full rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm font-mono tabular-nums focus:border-[#3D4F35] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#4A5045]">
                    Pilih Slot Waktu (WIB) {loadingSlots ? '· Memeriksa slot...' : ''}
                  </label>
                  {slots.length === 0 ? (
                    <div className="mt-2 rounded border border-[#E4DDD0] bg-[#FBF8F3] p-3 text-xs text-[#5E645A]">
                      Praktisi tidak memiliki jadwal praktik pada tanggal atau cabang yang dipilih.
                    </div>
                  ) : (
                    <>
                      {slots.every((s) => !s.available) && (
                        <div className="mt-2 rounded border border-[#D97706]/30 bg-[#FEF3C7]/60 p-2.5 text-xs text-[#92400E]">
                          {slots[0]?.conflictReason || 'Seluruh slot pada tanggal ini tidak tersedia.'}
                        </div>
                      )}
                      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {slots.map((s) => (
                          <button
                            key={s.startTime}
                            type="button"
                            disabled={!s.available}
                            onClick={() => setBookTime(s.startTime)}
                            title={s.conflictReason || `${s.startTime}–${s.endTime} WIB`}
                            className={`rounded border px-2 py-2 font-mono text-xs tabular-nums transition-colors ${
                              !s.available
                                ? 'cursor-not-allowed border-[#EFE8DC] bg-[#F5EFE6] text-[#9A9B94] line-through'
                                : bookTime === s.startTime
                                ? 'border-[#3D4F35] bg-[#3D4F35] font-semibold text-white'
                                : 'border-[#D4C5AF] bg-[#FBF8F3] text-[#1F241D] hover:border-[#3D4F35]'
                            }`}
                          >
                            {s.startTime}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#4A5045]">Nama Lengkap Pasien</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Contoh: Rahma Putri"
                      className="mt-1 w-full rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm focus:border-[#3D4F35] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#4A5045]">Jenis Kelamin</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as 'L' | 'P')}
                      className="mt-1 w-full rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm focus:border-[#3D4F35] focus:outline-none"
                    >
                      <option value="P">Perempuan</option>
                      <option value="L">Laki-laki</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#4A5045]">Nomor WhatsApp / Telepon</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0812xxxxxxxx"
                      className="mt-1 w-full rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm font-mono tabular-nums focus:border-[#3D4F35] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#4A5045]">Tanggal Lahir</label>
                    <input
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="mt-1 w-full rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm font-mono tabular-nums focus:border-[#3D4F35] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#4A5045]">Catatan Ringkas Keluhan (Opsional)</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Keluhan singkat atau preferensi waktu"
                    className="mt-1 w-full rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2 text-sm focus:border-[#3D4F35] focus:outline-none"
                  />
                </div>

                <label className="flex items-start gap-2.5 text-xs text-[#4A5045]">
                  <input
                    type="checkbox"
                    checked={whatsappConsent}
                    onChange={(e) => setWhatsappConsent(e.target.checked)}
                    className="mt-0.5 rounded border-[#D4C5AF]"
                  />
                  <span>
                    Saya menyetujui menerima konfirmasi & pengingat jadwal melalui WhatsApp tanpa mencantumkan rincian medis sensitif.
                  </span>
                </label>

                {bookError && (
                  <div className="rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] p-3.5 text-sm text-[#991B1B]">
                    <p className="font-semibold">{bookError}</p>
                    {alternativeSlots.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs">Pilihan jadwal lain yang tersedia:</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {alternativeSlots.map((alt) => (
                            <button
                              key={alt.startTime}
                              type="button"
                              onClick={() => {
                                setBookTime(alt.startTime);
                                setBookError(null);
                              }}
                              className="rounded border border-[#991B1B]/30 bg-white px-2.5 py-1 font-mono text-xs font-semibold text-[#1F241D] hover:bg-[#F5EFE6]"
                            >
                              {alt.startTime}–{alt.endTime} WIB
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {bookSuccess && (
                  <div className="rounded-md border border-[#3D4F35]/30 bg-[#F4F6F1] p-4 text-sm text-[#243020] space-y-2">
                    <p className="font-semibold">Permintaan janji berhasil dicatat.</p>
                    <p className="font-mono text-xs tabular-nums">
                      Kode Reservasi: {bookSuccess.reservationCode} · No. Pasien: {bookSuccess.patientNumber} ·{' '}
                      {formatTanggal(bookSuccess.date)}, {bookSuccess.startTime}–{bookSuccess.endTime} WIB
                    </p>
                    {bookSuccess.portalUserId && onOpenPortalWithUser && (
                      <button
                        type="button"
                        onClick={() => onOpenPortalWithUser(bookSuccess.portalUserId!)}
                        className="rounded border border-[#3D4F35] bg-white px-3 py-1.5 text-xs font-semibold text-[#3D4F35] hover:bg-[#3D4F35] hover:text-white"
                      >
                        Buka Portal Pasien Sekarang (Tanpa Admin)
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submittingBook}
                  className="w-full rounded-md bg-[#3D4F35] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2F3E29] disabled:opacity-60"
                >
                  {submittingBook ? 'Mengirim Permintaan Janji...' : 'Kirim Permintaan Janji'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Educational Articles & Locations */}
      <section id="edukasi" className="border-b border-[#E4DDD0]">
        <div className="mx-auto max-w-[1280px] px-6 py-14">
          <h2 className="font-editorial text-3xl font-semibold text-[#1F241D]">
            03. Artikel Edukasi & Informasi Cabang
          </h2>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:col-span-8">
              {articles.map((art) => (
                <article
                  key={art.id}
                  className="flex flex-col justify-between overflow-hidden rounded-lg border border-[#E4DDD0] bg-white"
                >
                  <div>
                    <div className="aspect-[4/3] w-full overflow-hidden bg-[#EAE0D0]">
                      <img
                        src={normalizePublicImageUrl(
                          art.imageUrl,
                          '/images/service_herbal_apothecary_1794541318909.jpg'
                        )}
                        alt={art.title}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="p-5">
                      <div className="flex items-center gap-2 text-xs text-[#5E645A]">
                        <span>{art.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{art.readTimeMinutes} menit baca</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatTanggal(art.publishedDate)}</span>
                      </div>
                      <h3 className="mt-2 font-editorial text-lg font-semibold text-[#1F241D]">
                        {art.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-[#4A5045]">{art.excerpt}</p>
                    </div>
                  </div>
                  <div className="px-5 pb-5">
                    <button
                      type="button"
                      onClick={() => setActiveArticle(art)}
                      className="text-sm font-semibold text-[#3D4F35] hover:underline"
                    >
                      Baca Selengkapnya
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="space-y-4 lg:col-span-4">
              {branches.map((br) => (
                <div key={br.id} className="rounded-lg border border-[#E4DDD0] bg-white p-5">
                  <h3 className="font-editorial text-lg font-semibold text-[#1F241D]">{br.name}</h3>
                  <div className="mt-3 space-y-2 text-sm text-[#4A5045]">
                    <p className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#734F2C]" />
                      <span>{br.address}</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0 text-[#734F2C]" />
                      <span>{br.operatingHours}</span>
                    </p>
                    <p className="flex items-center gap-2 font-mono text-xs tabular-nums">
                      <Phone className="h-4 w-4 shrink-0 text-[#734F2C]" />
                      <span>
                        {br.phone} · WA {br.whatsapp}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-[#E4DDD0] bg-[#F5EFE6]/55">
        <div className="mx-auto max-w-[900px] px-6 py-14">
          <h2 className="font-editorial text-2xl font-semibold text-[#1F241D]">
            Pertanyaan yang Sering Diajukan
          </h2>
          <div className="mt-6 divide-y divide-[#DFD5C5] rounded-lg border border-[#E4DDD0] bg-white">
            {faqs.map((f) => {
              const isOpen = openFaqId === f.id;
              return (
                <div key={f.id}>
                  <button
                    type="button"
                    onClick={() => setOpenFaqId(isOpen ? null : f.id)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-[#1F241D] hover:bg-[#FBF8F3]"
                  >
                    <span>{f.question}</span>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-[#5E645A]" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-[#5E645A]" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-sm leading-relaxed text-[#4A5045]">{f.answer}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="bg-[#243020] text-[#E6EBE0]">
        <div className="mx-auto flex max-w-[1280px] flex-col justify-between gap-6 px-6 py-10 sm:flex-row sm:items-center">
          <div>
            <div className="font-editorial text-lg font-semibold text-white">
              {settings.clinicName}
            </div>
            <p className="mt-1 text-xs text-[#CDD7C2]">
              {settings.tagline} · Zona Waktu Operasional Asia/Jakarta (WIB)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <button type="button" onClick={onGoPortal} className="hover:underline">
              Portal Pasien
            </button>
            <button type="button" onClick={onGoPanel} className="hover:underline">
              Panel Staf Klinik
            </button>
            <span className="inline-flex items-center gap-1.5 text-[#CDD7C2]">
              <Stethoscope className="h-3.5 w-3.5" />
              {settings.primaryEmail}
            </span>
          </div>
        </div>
      </footer>

      {/* Article Reader Modal */}
      {activeArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#E4DDD0] bg-[#FBF8F3] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-[#5E645A]">
                  {activeArticle.category} · {activeArticle.readTimeMinutes} menit baca ·{' '}
                  {formatTanggal(activeArticle.publishedDate)}
                </div>
                <h3 className="mt-1 font-editorial text-2xl font-semibold text-[#1F241D]">
                  {activeArticle.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveArticle(null)}
                className="rounded p-1 text-[#5E645A] hover:bg-[#EAE0D0]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[#4A5045]">{activeArticle.content}</p>
          </div>
        </div>
      )}
    </div>
  );
};
