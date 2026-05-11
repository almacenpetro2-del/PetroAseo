-- ============================================================
-- Petro Aseo v1.0 - Submódulo PROGRAMACIÓN DE DESCANSOS
-- Ejecutar en SQL Editor de Supabase.
-- Depende de: pgcrypto (extension) y personal_activo (tabla)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- PROGRAMACIÓN DE DESCANSOS
-- ------------------------------------------------------------
create table if not exists public.programacion_descansos (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal_activo (id) on delete cascade,
  nombre text not null,
  dni text not null,
  area text not null,
  turno text not null check (turno in ('Mañana', 'Tarde', 'Noche')),
  fecha_seleccionada date not null,
  descansa boolean not null default false,
  created_at timestamptz not null default now(),
  unique(personal_id, fecha_seleccionada, turno)
);

create index if not exists idx_prog_desc_fecha on public.programacion_descansos (fecha_seleccionada);
create index if not exists idx_prog_desc_turno on public.programacion_descansos (turno);
create index if not exists idx_prog_desc_personal on public.programacion_descansos (personal_id);
create index if not exists idx_prog_desc_descansa on public.programacion_descansos (descansa);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.programacion_descansos enable row level security;

create policy "prog_desc_authenticated_all"
  on public.programacion_descansos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
