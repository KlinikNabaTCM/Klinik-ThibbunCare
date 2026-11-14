import React from 'react';
import { Globe, LayoutGrid, Lock, LogOut, UserRound } from 'lucide-react';
import type { DemoAccountSummary } from '../lib/api';
import type { RuntimeStatus } from '../types/clinic';

export type AppArea = 'publik' | 'portal' | 'panel';

interface DemoBannerProps {
  runtime: RuntimeStatus;
  area: AppArea;
  onChangeArea: (area: AppArea) => void;
  staffUser: DemoAccountSummary | null;
  patientUser?: DemoAccountSummary;
  onLogoutStaff: () => void;
  onLogoutPatient: () => void;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({
  area,
  onChangeArea,
  staffUser,
  patientUser,
  onLogoutStaff,
  onLogoutPatient,
}) => {
  return (
    <div className="no-print border-b border-[#DCCDB6] bg-[#EFE7D8] text-[#1F241D]">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-editorial text-sm font-bold tracking-tight text-[#2F3E29]">
            ThibbunCare
          </span>
          <span className="hidden text-[#7A6F5E] sm:inline" aria-hidden="true">
            ·
          </span>
          <span className="hidden text-[#5E645A] sm:inline">
            Sistem Layanan &amp; Operasional Klinik Terpadu
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-[#D4C5AF] bg-[#FBF8F3] p-0.5">
            <button
              type="button"
              onClick={() => onChangeArea('publik')}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                area === 'publik'
                  ? 'bg-[#3D4F35] text-white'
                  : 'text-[#4A5045] hover:text-[#1F241D]'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              Website Publik
            </button>
            <button
              type="button"
              onClick={() => onChangeArea('portal')}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                area === 'portal'
                  ? 'bg-[#3D4F35] text-white'
                  : 'text-[#4A5045] hover:text-[#1F241D]'
              }`}
            >
              <UserRound className="h-3.5 w-3.5" />
              Portal Pasien
            </button>
            <button
              type="button"
              onClick={() => onChangeArea('panel')}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                area === 'panel'
                  ? 'bg-[#3D4F35] text-white'
                  : 'text-[#4A5045] hover:text-[#1F241D]'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Panel Klinik
            </button>
          </div>

          {area === 'panel' ? (
            staffUser ? (
              <div className="flex items-center gap-2 rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1">
                <span className="max-w-[200px] truncate font-semibold text-[#2F3E29]">
                  {staffUser.name}
                </span>
                <button
                  type="button"
                  onClick={onLogoutStaff}
                  className="inline-flex items-center gap-1 rounded border border-[#991B1B]/30 px-2 py-0.5 text-[11px] font-semibold text-[#991B1B] hover:bg-[#FEF2F2]"
                >
                  <LogOut className="h-3 w-3" />
                  Keluar
                </button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1 font-medium text-[#5C3D21]">
                <Lock className="h-3 w-3" />
                Masuk Staf Diperlukan
              </span>
            )
          ) : area === 'portal' && patientUser ? (
            <div className="flex items-center gap-2 rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1">
              <span className="max-w-[200px] truncate font-semibold text-[#2F3E29]">
                {patientUser.name}
              </span>
              <button
                type="button"
                onClick={onLogoutPatient}
                className="inline-flex items-center gap-1 rounded border border-[#734F2C]/40 px-2 py-0.5 text-[11px] font-semibold text-[#5C3D21] hover:bg-[#EFE7D8]"
              >
                <LogOut className="h-3 w-3" />
                Keluar Portal
              </button>
            </div>
          ) : staffUser ? (
            <span className="hidden items-center gap-1 rounded-md border border-[#D4C5AF] bg-[#FBF8F3] px-2.5 py-1 text-[11px] font-medium text-[#2F3E29] sm:inline-flex">
              Staf Aktif: {staffUser.name.split(' (')[0]}
            </span>
          ) : (
            <span className="hidden items-center gap-1 text-[11px] text-[#5E645A] sm:inline-flex">
              <Lock className="h-3 w-3" />
              Akses Staf Terproteksi
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
