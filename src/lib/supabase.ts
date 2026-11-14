import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseClientConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('MY_') && !supabaseAnonKey.includes('MY_')
);

export const supabaseClient: SupabaseClient | null = isSupabaseClientConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;
