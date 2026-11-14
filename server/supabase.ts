import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function getServerSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  const configured = Boolean(
    url &&
      serviceRoleKey &&
      !url.includes('MY_') &&
      !serviceRoleKey.includes('MY_')
  );
  return { url, serviceRoleKey, anonKey, configured };
}

export function createServerSupabaseAdmin(): SupabaseClient | null {
  const cfg = getServerSupabaseConfig();
  if (!cfg.configured) return null;
  return createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
