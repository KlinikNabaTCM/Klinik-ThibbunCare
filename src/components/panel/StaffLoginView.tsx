import React, { useState } from 'react';
import { Eye, EyeOff, Lock, LogIn } from 'lucide-react';
import { apiRequest, type BootstrapPayload, type DemoAccountSummary } from '../../lib/api';

interface StaffLoginViewProps {
  bootstrap: BootstrapPayload;
  onLoginSuccess: (token: string, user: DemoAccountSummary) => void;
  onGoPublic: () => void;
}

export const StaffLoginView: React.FC<StaffLoginViewProps> = ({
  bootstrap,
  onLoginSuccess,
  onGoPublic,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ token: string; user: DemoAccountSummary }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      onLoginSuccess(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke Panel Klinik.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <div className="rounded-lg border border-[#E4DDD0] bg-white p-6 sm:p-8">
        <div className="flex items-center gap-3 border-b border-[#EFE8DC] pb-5">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#3D4F35] font-mono text-sm font-bold text-white">
            {bootstrap.settings.logoInitials || 'TC'}
          </span>
          <div>
            <div className="text-xs font-semibold text-[#734F2C]">
              {bootstrap.settings.clinicName}
            </div>
            <h1 className="font-editorial text-2xl font-semibold text-[#1F241D]">
              Masuk ke Panel Klinik
            </h1>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-[#4A5045]">
          Panel operasional internal dilindungi autentikasi staf. Silakan masuk menggunakan email dan kata sandi akun staf klinik Anda.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
          <div>
            <label htmlFor="staff-login-email" className="block font-semibold text-[#4A5045]">
              Email Staf Klinik
            </label>
            <input
              id="staff-login-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@klinik.thibbuncare.id"
              className="mt-1.5 w-full rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2.5 text-sm text-[#1F241D] focus:border-[#3D4F35] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="staff-login-password" className="block font-semibold text-[#4A5045]">
              Kata Sandi
            </label>
            <div className="relative mt-1.5">
              <input
                id="staff-login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi"
                className="w-full rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-3 py-2.5 pr-10 text-sm text-[#1F241D] focus:border-[#3D4F35] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5E645A] hover:text-[#1F241D]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] p-3 text-[#991B1B]">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-[#3D4F35] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2F3E29] disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" />
              {submitting ? 'Memeriksa...' : 'Masuk ke Panel Klinik'}
            </button>
            <button
              type="button"
              onClick={onGoPublic}
              className="rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-4 py-2.5 text-xs font-semibold text-[#1F241D] hover:bg-[#EAE0D0]"
            >
              Website Publik
            </button>
          </div>
        </form>

        <div className="mt-6 border-t border-[#EFE8DC] pt-4 text-[11px] text-[#5E645A]">
          Hubungi Administrator Klinik apabila Anda membutuhkan pembuatan akun staf baru atau pengaturan ulang kata sandi.
        </div>
      </div>
    </div>
  );
};
