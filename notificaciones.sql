-- ============================================================
-- Petro Aseo v1.0 - Sistema de NOTIFICACIONES internas
-- Ejecutar en SQL Editor de Supabase.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- NOTIFICACIONES
-- ------------------------------------------------------------
create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  mensaje text not null,
  tipo text not null default 'general',
  referencia_id uuid,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notificaciones_leida on public.notificaciones (leida);
create index if not exists idx_notificaciones_created on public.notificaciones (created_at desc);
create index if not exists idx_notificaciones_tipo on public.notificaciones (tipo);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.notificaciones enable row level security;

create policy "notificaciones_authenticated_all"
  on public.notificaciones for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
