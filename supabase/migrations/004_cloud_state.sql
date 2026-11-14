-- Tabel penyimpanan state terpadu untuk deployment Serverless (Vercel + Supabase)
create table if not exists public.thibbuncare_cloud_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.thibbuncare_cloud_state enable row level security;

-- Hanya service_role (backend server) yang boleh membaca atau menulis tabel state terpadu
drop policy if exists "Service role full access on thibbuncare_cloud_state" on public.thibbuncare_cloud_state;
create policy "Service role full access on thibbuncare_cloud_state"
  on public.thibbuncare_cloud_state
  for all
  to service_role
  using (true)
  with check (true);
